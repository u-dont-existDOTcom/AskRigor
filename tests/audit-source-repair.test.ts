import { createHash } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
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
const { REVIEW_METHOD_AUDIT_DOMAINS, STUDY_METHOD_AUDIT_DOMAINS, validateStudyMethodAudit } =
  await import("../apps/research-mcp/src/index.js");
const { registerTools, RESEARCH_OPERATIONS } = await import("../apps/research-mcp/src/register-tools.js");
const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");

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

// Greptile, 12 Nov 2026 (P1): the refusal reached ChatGPT as "The tool failed internally". ChatGPT shows an error result
// that has no structured content, from a tool that declares an output schema, only so, hiding its text from the person
// and the model; the owner's ChatGPT retried refused study audits blind on 12 and 13 Nov. A refused study audit now
// carries its repair instruction as structured content that fits the tool's published output schema, which needs only
// status and coverage_receipt; the published schema itself is unchanged (owner answer 189a).
const MISMATCH_TEXT = "validate study method audit did not validate the audit. Study audit source identity " +
  `or completeness mismatch: source_primary_identifier is "${DOI}", but the acquired document's primary ` +
  `identifier is "${PMCID}". The audit was not validated and stays open: resubmit it with these values, which ` +
  "come from this document_handle's acquisition, to validate it.";
const STAYS_OPEN = " The audit was not validated and stays open: correct it against the blocks this document_handle " +
  "returned and resubmit it to validate it.";
const CHATGPT_META = { "openai/locale": "en-US" };
const UNKNOWN_HANDLE = `aft1_${"A".repeat(32)}`;
type Result = Awaited<ReturnType<Client["callTool"]>>;
const texts = (result: Result) => (result.content as Array<{ type: string; text?: string }>).map(({ text }) => text ?? "");

/** What a refused audit says of the document it was sent for: read to its end, the acquisition's hash, not validated. */
const refusedCoverage = (handle: string, index: AuditableDocumentIndex) => ({
  document_handle: handle,
  full_text_read_to_exhaustion: true,
  source_content_sha256: index.source.content_sha256,
  audit_validated: false,
  synthesis_use: "audit_not_validated",
});

function reviewAudit(index: AuditableDocumentIndex, overrides: Record<string, unknown> = {}) {
  const blockId = index.blocks[0]!.block_id;
  return {
    source_primary_identifier: index.source.primary_identifier,
    source_content_sha256: index.source.content_sha256,
    review_type: "systematic_review" as const,
    search_end_date: "not described" as const,
    included_source_families: ["randomized trials"],
    program_fingerprints: [{
      label: "specified program",
      components: ["component described in the source"],
      dose_or_intensity: "described in the source",
      frequency: "described in the source",
      duration: "described in the source",
      supervision: "described in the source",
      co_interventions: [],
      population_or_stage: "described in the source",
      outcome_and_horizon: "described in the source",
    }],
    domain_findings: REVIEW_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: [blockId],
      unresolved_fields: [],
    })),
    claim_capabilities: [
      {
        claim: "The review can describe the programs and outcomes it included.",
        capability: "can_support" as const,
        reason: "The indexed source states them.",
        evidence_block_ids: [blockId],
      },
      {
        claim: "The review proves that every such program works.",
        capability: "cannot_support" as const,
        reason: "Program and population differences limit that inference.",
        evidence_block_ids: [],
      },
    ],
    ...overrides,
  };
}

/**
 * An SDK client on one MCP surface. Once it has listed the tools, callTool checks any structured content it receives
 * against the tool's published output schema, error results included, and throws when it doesn't fit.
 */
async function onSurface<T>(
  surface: "/mcp" | "/mcp/claude" | "/mcp/gemini",
  run: (connected: {
    call: (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) => Promise<Result>;
    fits: (name: string, structured: unknown) => { declared: boolean; runtime: boolean };
    published: (name: string) => { required?: string[] } | undefined;
    acquired: (index: AuditableDocumentIndex) => Promise<string>;
  }) => Promise<T>,
): Promise<T> {
  const server = createAskRigorServer(surface === "/mcp/gemini" ? "gemini" : "standard",
    { mcpSurface: surface, researchAccessRequired: false, findingsLibrary: false });
  const client = new Client({ name: "refused-audit-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const published = (name: string) => tools.find((tool) => tool.name === name)?.outputSchema as
      { required?: string[] } | undefined;
    const call = (name: string, args: Record<string, unknown>, meta?: Record<string, unknown>) =>
      client.callTool({ name, arguments: args, ...(meta === undefined ? {} : { _meta: meta }) }) as Promise<Result>;
    return await run({
      call,
      published,
      // Against the schema the surface published, as an SDK client validates it, and against the server's own.
      fits: (name, structured) => ({
        declared: new AjvJsonSchemaValidator().getValidator(published(name) as never)(structured).valid,
        runtime: RESEARCH_OPERATIONS.find((operation) => operation.name === name)!.runtimeOutputSchema
          .safeParse(structured).success,
      }),
      acquired: async (index) => {
        acquire.mockResolvedValue({
          access_status: "complete",
          data: { requested_pmcid: PMCID, discovery_attempts: [], document_index: index },
        });
        const result = await call("acquire_open_full_text", { pmcid: PMCID });
        expect(result.isError).not.toBe(true);
        return (result.structuredContent as { coverage_receipt: { document_handle: string } })
          .coverage_receipt.document_handle;
      },
    });
  } finally {
    await client.close();
    await server.close();
  }
}

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

    const acquired = await call("acquire_open_full_text", { pmcid: PMCID });
    expect(acquired.isError).not.toBe(true);
    const handle = (acquired.structuredContent as { coverage_receipt: { document_handle: string } })
      .coverage_receipt.document_handle;

    const refused = await call("validate_study_method_audit", {
      document_handle: handle, audit: studyAudit(index, { source_primary_identifier: DOI }),
    });
    expect(refused.isError).toBe(true);
    // The text still says it, first; since 13 Nov 2026 the structured content says it too.
    expect((refused.content[0] as { text: string }).text).toBe(MISMATCH_TEXT);
    expect(refused.structuredContent).toMatchObject({
      status: "audit_not_validated",
      error: { code: "audit_source_mismatch", message: MISMATCH_TEXT },
      corrected_audit_fields: { source_primary_identifier: PMCID },
    });

    const validated = await call("validate_study_method_audit", { document_handle: handle, audit: studyAudit(index) });
    expect(validated.isError).not.toBe(true);
    expect(validated.structuredContent).toMatchObject({
      status: "source_linked_study_audit_validated",
      audit_receipt: { source_primary_identifier: PMCID, audit_status: "complete_no_unresolved_fields" },
      coverage_receipt: { document_handle: handle, source_content_sha256: index.source.content_sha256 },
    });
  });
});

describe("a refused study audit through the MCP surface (Greptile, 12 Nov 2026)", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("gives its repair instruction as structured content that fits the " +
    "published output schema on %s", async (surface) => {
    await onSurface(surface, async ({ call, fits, published, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      // The published schema asks every result for these two, and a refusal can give both truthfully.
      expect(published("validate_study_method_audit")!.required).toEqual(["status", "coverage_receipt"]);
      const mismatched = { document_handle: handle, audit: studyAudit(index, { source_primary_identifier: DOI }) };

      const refused = await call("validate_study_method_audit", mismatched);
      expect(refused.isError).toBe(true);
      const structured = refused.structuredContent as Record<string, unknown>;
      expect(structured).toEqual({
        status: "audit_not_validated",
        ok: false,
        error: { code: "audit_source_mismatch", message: MISMATCH_TEXT },
        mismatches: [{ check: "identifier", sent: DOI, expected: PMCID }],
        corrected_audit_fields: { source_primary_identifier: PMCID },
        coverage_receipt: refusedCoverage(handle, index),
      });
      expect(fits("validate_study_method_audit", structured)).toEqual({ declared: true, runtime: true });
      // The text still carries it, first; a client that reads only text gets the structured content after it.
      expect(texts(refused)).toEqual([MISMATCH_TEXT, JSON.stringify(structured)]);

      // ChatGPT is shown the text and the structured content, so its text has no copy.
      const chatGpt = await call("validate_study_method_audit", mismatched, CHATGPT_META);
      expect(chatGpt.isError).toBe(true);
      expect(texts(chatGpt)).toEqual([MISMATCH_TEXT]);
      expect(chatGpt.structuredContent).toEqual(structured);

      // The audit resubmitted with the corrected fields validates, and a correct audit's result is as it was.
      const validated = await call("validate_study_method_audit", { document_handle: handle,
        audit: studyAudit(index, structured.corrected_audit_fields as Record<string, unknown>) });
      expect(validated.isError).not.toBe(true);
      expect(texts(validated)[0]).toBe("validate study method audit completed.");
      const output = validated.structuredContent as Record<string, unknown>;
      expect(Object.keys(output)).toEqual(["status", "audit_receipt", "coverage_receipt"]);
      expect(output).toMatchObject({
        status: "source_linked_study_audit_validated",
        audit_receipt: { source_primary_identifier: PMCID, audit_status: "complete_no_unresolved_fields",
          receipt_name: "askrigor_study_method_audit" },
        coverage_receipt: { document_handle: handle, full_text_read_to_exhaustion: true,
          source_content_sha256: index.source.content_sha256, audit_validated: true,
          synthesis_use: "bounded_by_validated_claim_capabilities" },
      });
      expect(fits("validate_study_method_audit", output)).toEqual({ declared: true, runtime: true });
    });
  });

  // Through the tools only the identifier and the content hash can differ: a handle holds a full text with its body,
  // so the completeness check, which has no field to correct, fails only where a validator is called directly.
  it("names every source check that failed, each with the audit's field to change", async () => {
    await onSurface("/mcp", async ({ call, fits, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      const wrongHash = "b".repeat(64);
      const both = await call("validate_study_method_audit", { document_handle: handle,
        audit: studyAudit(index, { source_primary_identifier: DOI, source_content_sha256: wrongHash }) });
      expect(both.isError).toBe(true);
      const structured = both.structuredContent as { error: { message: string } };
      expect(structured).toMatchObject({
        status: "audit_not_validated",
        ok: false,
        error: { code: "audit_source_mismatch" },
        mismatches: [
          { check: "identifier", sent: DOI, expected: PMCID },
          { check: "content_sha256", sent: wrongHash, expected: index.source.content_sha256 },
        ],
        corrected_audit_fields: { source_primary_identifier: PMCID, source_content_sha256: index.source.content_sha256 },
        coverage_receipt: refusedCoverage(handle, index),
      });
      expect(structured.error.message).toBe("validate study method audit did not validate the audit. Study audit " +
        `source identity or completeness mismatch: source_primary_identifier is "${DOI}", but the acquired document's ` +
        `primary identifier is "${PMCID}"; source_content_sha256 is "${wrongHash}", but the acquired document's ` +
        `content SHA-256 is "${index.source.content_sha256}" (its coverage_receipt.source_content_sha256). The audit ` +
        "was not validated and stays open: resubmit it with these values, which come from this document_handle's " +
        "acquisition, to validate it.");
      expect(texts(both)[0]).toBe(structured.error.message);
      expect(fits("validate_study_method_audit", structured)).toEqual({ declared: true, runtime: true });
    });
  });

  it("does the same for an audit whose citations the acquired document doesn't hold", async () => {
    await onSurface("/mcp", async ({ call, fits, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      const blockId = index.blocks[0]!.block_id;
      const unknownBlock = studyAudit(index);
      unknownBlock.claim_capabilities[0]!.evidence_block_ids = ["jats_000009_aaaaaaaaaaaa"];
      const figure = studyAudit(index, {
        reported_figures: [{ label: "primary outcome", evidence_block_id: blockId, reported: "42.5",
          recomputation: "The tables do not allow it.", plausibility: "consistent" }],
        reported_figures_none_reason: undefined,
      });
      for (const [audit, message] of [
        [unknownBlock, "Study audit cited an unknown source block."],
        [figure, 'Study audit reported figure "primary outcome" is not in its cited source block. A figure worked ' +
          "out from printed numbers goes in worked_out: give operation and inputs, each with printed and " +
          "evidence_block_id; reported is the worked-out value."],
      ] as const) {
        const text = `validate study method audit did not validate the audit. ${message}${STAYS_OPEN}`;
        const refused = await call("validate_study_method_audit", { document_handle: handle, audit }, CHATGPT_META);
        expect(refused.isError).toBe(true);
        expect(texts(refused)).toEqual([text]);
        expect(refused.structuredContent).toEqual({
          status: "audit_not_validated",
          ok: false,
          error: { code: "audit_not_source_linked", message: text },
          coverage_receipt: refusedCoverage(handle, index),
        });
        expect(fits("validate_study_method_audit", refused.structuredContent)).toEqual({ declared: true, runtime: true });
      }
    });
  });

  it("does the same for an audit refused for its input, when the call names a document read to its end", async () => {
    await onSurface("/mcp", async ({ call, fits, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      const problem = "audit.design_label: Invalid input: expected string, received number";
      const wrapperText = JSON.stringify({ ok: false, error: { code: "invalid_input", message: problem }, problems: [problem] });
      const refused = await call("validate_study_method_audit",
        { document_handle: handle, audit: { ...studyAudit(index), design_label: 7 } }, CHATGPT_META);
      expect(refused.isError).toBe(true);
      // The text is the one every tool's input check gives; the structured content repeats its problems.
      expect(texts(refused)).toEqual([wrapperText]);
      expect(refused.structuredContent).toEqual({
        status: "audit_not_validated",
        ok: false,
        error: { code: "invalid_input", message: problem },
        problems: [problem],
        coverage_receipt: refusedCoverage(handle, index),
      });
      expect(fits("validate_study_method_audit", refused.structuredContent)).toEqual({ declared: true, runtime: true });
      const unknownLater = await call("validate_study_method_audit",
        { document_handle: handle, audit: studyAudit(index), later_inputs: { synthetic_future_input: 1 } });
      expect(unknownLater.isError).toBe(true);
      expect(unknownLater.structuredContent).toMatchObject({
        status: "audit_not_validated",
        error: { code: "invalid_input" },
        problems: ['later_inputs.synthetic_future_input: Unknown later input "synthetic_future_input" for ' +
          "validate_study_method_audit. Its later inputs: audit, findings_save."],
      });
      expect(fits("validate_study_method_audit", unknownLater.structuredContent)).toEqual({ declared: true, runtime: true });
    });
  });

  // The published schema asks every result for a coverage_receipt with the document's handle and content hash. A call
  // that names no document AskRigor holds read to its end has none to give, so its refusal stays in the text, which now
  // names its cause and the next call.
  it("keeps a refusal that has no document to name in its text, with the code and what to do", async () => {
    await onSurface("/mcp", async ({ call, acquired }) => {
      const index = pmcIndex();
      const long = pmcIndex("A long synthetic paragraph, page after page. ".repeat(3_000));
      const unread = await acquired(long);
      const notRead = await call("validate_study_method_audit", { document_handle: unread, audit: studyAudit(long) });
      expect(notRead.isError).toBe(true);
      expect(notRead.structuredContent).toBeUndefined();
      expect(texts(notRead)).toEqual(["validate study method audit could not complete: open_full_text_not_fully_read. " +
        "This document_handle's full text has not been read to its end: call continue_open_full_text with it until " +
        "coverage_receipt.exhausted is true, then send the audit again."]);
      const expired = await call("validate_study_method_audit", { document_handle: UNKNOWN_HANDLE, audit: studyAudit(index) });
      expect(expired.isError).toBe(true);
      expect(expired.structuredContent).toBeUndefined();
      expect(texts(expired)).toEqual(["validate study method audit could not complete: " +
        "open_full_text_handle_invalid_or_expired. This document_handle is expired, unknown or in use by another " +
        "call: discard its chain, acquire the paper again with acquire_open_full_text, read it to its end, and send " +
        "the audit with the new document_handle and that document's primary identifier and content hash."]);
      // An input refused before any document is read is as it was: no document, so no structured content.
      const invalid = await call("validate_study_method_audit", { document_handle: UNKNOWN_HANDLE, audit: {} });
      expect(invalid.isError).toBe(true);
      expect(invalid.structuredContent).toBeUndefined();
      expect(JSON.parse(texts(invalid)[0]!)).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    });
  });

  // validate_review_method_audit's published output schema asks every result for an audit_receipt, with its hash, its
  // twelve domain findings and its three limitations. A refused audit has no receipt, and making one up would show an
  // audit that was not validated as receipted, so its refusals stay in the text until that schema changes (189a).
  it("keeps a refused review audit in its text, since its published schema requires a receipt", async () => {
    await onSurface("/mcp", async ({ call, published, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      expect(published("validate_review_method_audit")!.required).toEqual(["status", "audit_receipt", "coverage_receipt"]);
      const refused = await call("validate_review_method_audit",
        { document_handle: handle, audit: reviewAudit(index, { source_primary_identifier: DOI }) });
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toBeUndefined();
      expect(texts(refused)).toEqual(["validate review method audit did not validate the audit. Review audit source " +
        `identity or completeness mismatch: source_primary_identifier is "${DOI}", but the acquired document's ` +
        `primary identifier is "${PMCID}". The audit was not validated and stays open: resubmit it with these ` +
        "values, which come from this document_handle's acquisition, to validate it."]);
      // Its other refusals are as they were too: what its validator throws, and a handle AskRigor doesn't hold.
      const unknownBlock = reviewAudit(index);
      unknownBlock.claim_capabilities[0]!.evidence_block_ids = ["jats_000009_aaaaaaaaaaaa"];
      const thrown = await call("validate_review_method_audit", { document_handle: handle, audit: unknownBlock });
      expect(thrown.isError).toBe(true);
      expect(thrown.structuredContent).toBeUndefined();
      expect(texts(thrown)).toEqual(["Review audit cited an unknown source block"]);
      const expired = await call("validate_review_method_audit", { document_handle: UNKNOWN_HANDLE, audit: reviewAudit(index) });
      expect(expired.isError).toBe(true);
      expect(texts(expired)).toEqual(["validate review method audit could not complete."]);
      const validated = await call("validate_review_method_audit", { document_handle: handle, audit: reviewAudit(index) });
      expect(validated.isError).not.toBe(true);
      expect(validated.structuredContent).toMatchObject({ status: "source_linked_review_audit_validated" });
    });
  });

  it("gives the same structured refusal on /mcp/gemini, whose catalog publishes no output schema", async () => {
    await onSurface("/mcp/gemini", async ({ call, published, acquired }) => {
      const index = pmcIndex();
      const handle = await acquired(index);
      expect(published("validate_study_method_audit")).toBeUndefined();
      const refused = await call("validate_study_method_audit",
        { document_handle: handle, audit: studyAudit(index, { source_primary_identifier: DOI }) });
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toMatchObject({
        status: "audit_not_validated",
        error: { code: "audit_source_mismatch", message: MISMATCH_TEXT },
        corrected_audit_fields: { source_primary_identifier: PMCID },
      });
      expect(texts(refused)[0]).toBe(MISMATCH_TEXT);
    });
  });
});
