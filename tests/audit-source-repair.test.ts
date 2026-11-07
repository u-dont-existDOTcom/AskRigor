import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuditableDocumentIndex } from "../packages/sources/src/index.js";

// AskRigor#431: a study audit sent with the paper's DOI as source_primary_identifier, while the document acquired was
// identified by its PMCID, came back as one combined "source identity or completeness mismatch", and the run never
// repaired it. Each check now fails on its own, with the acquisition's own values and the word that the audit is open.

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(),
  acquireOpenFullText: acquire,
}));

const { AuditSourceMismatchError, auditSourceMismatches, verifyAuditSource } =
  await import("../apps/research-mcp/src/actions/audit-source.js");
const { STUDY_METHOD_AUDIT_DOMAINS, validateStudyMethodAudit } = await import("../apps/research-mcp/src/index.js");
const { registerTools } = await import("../apps/research-mcp/src/register-tools.js");

// Synthetic identifiers that match no real paper.
const PMCID = "PMC7654321";
const DOI = "10.5555/synthetic.repair.2026";

afterEach(() => acquire.mockReset());

function pmcIndex(text = "Methods and results of a synthetic trial, read to the end."): AuditableDocumentIndex {
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  return {
    source: {
      provider: "europe_pmc",
      primary_identifier: PMCID,
      canonical_url: `https://europepmc.org/article/PMC/${PMCID}`,
      doi: DOI,
      pmcid: PMCID,
      title: "A synthetic trial",
      version: "publishedVersion",
      format: "jats_xml",
      content_sha256: createHash("sha256").update(`jats:${text}`, "utf8").digest("hex"),
      document_completeness: "full_text_with_body",
      identity_verification: "pmcid_exact",
    },
    section_paths: [["Results"]],
    blocks: [{
      block_id: `jats_000001_${textHash.slice(0, 12)}`,
      kind: "paragraph",
      section_path: ["Results"],
      text,
      text_sha256: textHash,
    }],
  } as AuditableDocumentIndex;
}

function studyAudit(index: AuditableDocumentIndex, overrides: Record<string, unknown> = {}) {
  const blockId = index.blocks[0]!.block_id;
  const program = (name: string) => ({
    name,
    components: ["component described in the source"],
    dose_or_intensity: "described in the source",
    frequency: "described in the source",
    duration: "described in the source",
    supervision: "described in the source",
    adherence: "measured as described in the source",
    co_interventions: [],
    care_stage: "nonsurgical" as const,
  });
  return {
    source_primary_identifier: index.source.primary_identifier,
    source_content_sha256: index.source.content_sha256,
    design_label: "parallel group comparison",
    design_capability_statement: "The design label does not establish reliability; implementation and analysis remain separately audited.",
    population_and_stage: "The exact enrolled population and baseline stage described in the full text.",
    intervention_program: program("specified intervention program"),
    comparator_program: program("specified comparator program"),
    outcome_and_horizon: "The exact outcome and horizon described in the source.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a bounded limitation.`,
      evidence_block_ids: [blockId],
      unresolved_fields: [],
    })),
    claim_capabilities: [
      {
        claim: "The exact compared programs can be described for the recorded outcome horizon.",
        capability: "can_support" as const,
        reason: "The indexed source states them.",
        evidence_block_ids: [blockId],
      },
      {
        claim: "The trial shows the program works for everyone.",
        capability: "cannot_support" as const,
        reason: "One trial's population and horizon bound it.",
        evidence_block_ids: [],
      },
    ],
    reported_figures: [],
    reported_figures_none_reason: "The synthetic source reports no numeric result.",
    ...overrides,
  };
}

describe("an audit's source checks (AskRigor#431)", () => {
  it("names the identifier the acquisition holds when the audit sent the DOI", () => {
    const index = pmcIndex();
    let thrown: unknown;
    try {
      validateStudyMethodAudit(index, studyAudit(index, { source_primary_identifier: DOI }));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AuditSourceMismatchError);
    const error = thrown as InstanceType<typeof AuditSourceMismatchError>;
    expect(error.mismatches).toEqual([{ check: "identifier", sent: DOI, expected: PMCID }]);
    expect(error.message).toBe("Study audit source identity or completeness mismatch: source_primary_identifier is " +
      `"${DOI}", but the acquired document's primary identifier is "${PMCID}". The audit was not validated and stays ` +
      "open: resubmit it with these values, which come from this document_handle's acquisition, to validate it.");
    // The same audit with the acquisition's identifier validates.
    expect(validateStudyMethodAudit(index, studyAudit(index)).audit_status).toBe("complete_no_unresolved_fields");
  });

  it("names each failed check: the content hash, and completeness on its own", () => {
    const source = { primary_identifier: PMCID, content_sha256: "a".repeat(64), document_completeness: "full_text_with_body" };
    expect(auditSourceMismatches(source, { source_primary_identifier: DOI, source_content_sha256: "b".repeat(64) }, true))
      .toEqual([
        { check: "identifier", sent: DOI, expected: PMCID },
        { check: "content_sha256", sent: "b".repeat(64), expected: "a".repeat(64) },
      ]);
    expect(() => verifyAuditSource("Review audit", source, {
      source_primary_identifier: PMCID, source_content_sha256: "b".repeat(64),
    })).toThrow(`Review audit source identity or completeness mismatch: source_content_sha256 is "${"b".repeat(64)}", ` +
      `but the acquired document's content SHA-256 is "${"a".repeat(64)}" (its coverage_receipt.source_content_sha256).`);
    const partial = { ...source, document_completeness: "abstract_only" };
    const fields = { source_primary_identifier: PMCID, source_content_sha256: "a".repeat(64) };
    expect(auditSourceMismatches(partial, fields, true))
      .toEqual([{ check: "completeness", sent: "full_text_with_body", expected: "abstract_only" }]);
    expect(() => verifyAuditSource("Study audit", partial, fields)).toThrow("no audit validates on a document that is " +
      "not full text with body, so cite the study as read from what was acquired, or acquire a complete full text and " +
      "audit that.");
    // A publication notice is audited on any copy that names it: completeness is not its check.
    expect(auditSourceMismatches(partial, fields, false)).toEqual([]);
    expect(() => verifyAuditSource("Publication notice audit", partial, fields, false)).not.toThrow();
  });
});

describe("validate_study_method_audit through the connector (AskRigor#431)", () => {
  it("says which identifier to send, and the resubmitted audit validates", async () => {
    const index = pmcIndex();
    acquire.mockResolvedValue({
      access_status: "complete",
      data: { requested_pmcid: PMCID, discovery_attempts: [], document_index: index },
    });
    const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
    registerTools({
      registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
        handlers.set(name, execute);
      },
    } as unknown as McpServer, { findingsLibrary: false, mcpSurface: "/mcp/claude" });
    const call = (name: string, input: Record<string, unknown>) => handlers.get(name)!(input, {});
    const text = (result: CallToolResult) => (result.content as Array<{ text?: string }>).map(({ text }) => text).join("\n");

    const acquired = await call("acquire_open_full_text", { pmcid: PMCID });
    expect(acquired.isError).not.toBe(true);
    const handle = (acquired.structuredContent as { coverage_receipt: { document_handle: string } })
      .coverage_receipt.document_handle;

    const refused = await call("validate_study_method_audit", {
      document_handle: handle, audit: studyAudit(index, { source_primary_identifier: DOI }),
    });
    expect(refused.isError).toBe(true);
    expect(refused.structuredContent).toBeUndefined();
    expect(text(refused)).toBe("validate study method audit did not validate the audit. Study audit source identity " +
      `or completeness mismatch: source_primary_identifier is "${DOI}", but the acquired document's primary ` +
      `identifier is "${PMCID}". The audit was not validated and stays open: resubmit it with these values, which ` +
      "come from this document_handle's acquisition, to validate it.");

    const validated = await call("validate_study_method_audit", { document_handle: handle, audit: studyAudit(index) });
    expect(validated.isError).not.toBe(true);
    expect(validated.structuredContent).toMatchObject({
      status: "source_linked_study_audit_validated",
      audit_receipt: { source_primary_identifier: PMCID, audit_status: "complete_no_unresolved_fields" },
      coverage_receipt: { document_handle: handle, source_content_sha256: index.source.content_sha256 },
    });
  });
});
