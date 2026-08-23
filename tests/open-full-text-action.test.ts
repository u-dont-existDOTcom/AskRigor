import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { okEnvelope } from "@askrigor/contracts";
import type {
  AuditableDocumentIndex,
  OpenFullTextAcquisitionData
} from "@askrigor/sources";
import { describe, expect, it, vi } from "vitest";

import {
  createOpenFullTextActionRoutes,
  STUDY_METHOD_AUDIT_DOMAINS,
  type StudyMethodAuditSubmission
} from "../apps/research-mcp/src/index.js";

const DOI = "10.1234/open.study";

describe("open-full-text Actions", () => {
  it.each([
    [{ doi: "not-a-doi" }],
    [{ doi: DOI, pmcid: "PMC0" }]
  ])("rejects malformed study identifiers at the Action boundary", async (body) => {
    const acquire = vi.fn(async () => acquisition(documentIndex("unused")));
    const routes = createOpenFullTextActionRoutes({
      acquire,
      unpaywallConfig: { email: "research@example.org" }
    });

    const result = await action(routes, "acquire_open_full_text", body);

    expect(result).toEqual({
      status: 422,
      body: { error: { code: "action_input_invalid", retryable: false } }
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("forces contiguous full-text reading before accepting a method audit", async () => {
    const index = documentIndex("A method-rich source paragraph. ".repeat(1_500));
    const routes = createOpenFullTextActionRoutes({
      acquire: async () => acquisition(index),
      unpaywallConfig: { email: "research@example.org" }
    });

    const first = await action(routes, "acquire_open_full_text", { doi: DOI });
    expect(first).toMatchObject({
      status: 200,
      body: {
        status: "full_text_available",
        source: { primary_identifier: DOI, identity_verification: "doi_exact" },
        coverage_receipt: {
          exhausted: false,
          synthesis_lock: "fail",
          method_audit_required: true
        }
      }
    });
    const firstBody = first.body as {
      coverage_receipt: { document_handle: string };
    };
    const handle = firstBody.coverage_receipt.document_handle;

    const premature = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      audit: studyAudit(index)
    });
    expect(premature).toEqual({
      status: 422,
      body: {
        error: { code: "open_full_text_not_fully_read", retryable: false }
      }
    });

    const continued = await action(routes, "continue_open_full_text", {
      document_handle: handle
    });
    expect(continued).toMatchObject({
      status: 200,
      body: {
        status: "full_text_available",
        coverage_receipt: {
          exhausted: true,
          synthesis_lock: "pass",
          source_segments_retrieved_cumulative: 5
        }
      }
    });

    const validated = await action(routes, "validate_study_method_audit", {
      document_handle: handle,
      audit: studyAudit(index)
    });
    expect(validated).toMatchObject({
      status: 200,
      body: {
        status: "source_linked_study_audit_validated",
        audit_receipt: {
          receipt_name: "askrigor_study_method_audit",
          source_primary_identifier: DOI,
          source_content_sha256: index.source.content_sha256,
          design_label_is_not_reliability_verdict: true
        },
        coverage_receipt: {
          document_handle: handle,
          full_text_read_to_exhaustion: true,
          audit_validated: true,
          synthesis_use: "bounded_by_validated_claim_capabilities"
        }
      }
    });
  });

  it("returns an unavailable study as a lead with no evidence payload", async () => {
    const acquire = vi.fn(async () => okEnvelope({
      provider: "open_full_text",
      recordType: "open_full_text_acquisition",
      primaryIdentifier: DOI,
      sourceIdentity: { canonical_url: `https://doi.org/${DOI}` },
      pagination: { exhausted: true },
      returned: 0,
      accessStatus: "inaccessible",
      limitations: ["Full text unavailable."],
      data: {
        requested_doi: DOI,
        outcome: "possibly_useful_lead",
        discovery_attempts: [
          { route: "europe_pmc", result: "not_found" },
          { route: "unpaywall", result: "inaccessible", identifier: DOI }
        ],
        access_boundary: "No complete open copy passed identity verification."
      } satisfies OpenFullTextAcquisitionData
    }));
    const routes = createOpenFullTextActionRoutes({
      acquire,
      unpaywallConfig: { email: "research@example.org" }
    });

    const result = await action(routes, "acquire_open_full_text", { doi: DOI });

    expect(result).toEqual({
      status: 200,
      body: {
        status: "possibly_useful_lead",
        requested_doi: DOI,
        discovery_attempts: [
          { route: "europe_pmc", result: "not_found" },
          { route: "unpaywall", result: "inaccessible", identifier: DOI }
        ],
        access_boundary: "No complete open copy passed identity verification.",
        unseen_content_used_as_evidence: false
      }
    });
  });
});

function documentIndex(text: string): AuditableDocumentIndex {
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  const contentHash = createHash("sha256").update(`pdf:${text}`, "utf8").digest("hex");
  return {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: DOI,
      canonical_url: "https://repository.example.org/open-study.pdf",
      doi: DOI,
      title: "Open study",
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: contentHash,
      document_completeness: "full_text_with_body",
      identity_verification: "doi_exact"
    },
    section_paths: [["Page 1"]],
    blocks: [{
      block_id: `pdf_000001_${textHash.slice(0, 12)}`,
      kind: "page_text",
      section_path: ["Page 1"],
      page_number: 1,
      text,
      text_sha256: textHash
    }]
  };
}

function acquisition(index: AuditableDocumentIndex) {
  return okEnvelope({
    provider: "open_full_text",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: index.source.canonical_url },
    pagination: { exhausted: true },
    returned: 1,
    accessStatus: "complete",
    limitations: ["Method audit required."],
    data: {
      requested_doi: DOI,
      outcome: "full_text_indexed",
      discovery_attempts: [{ route: "unpaywall", result: "indexed", identifier: DOI }],
      document_index: index
    } satisfies OpenFullTextAcquisitionData
  });
}

function studyAudit(index: AuditableDocumentIndex): StudyMethodAuditSubmission {
  const blockId = index.blocks[0]!.block_id;
  return {
    source_primary_identifier: DOI,
    source_content_sha256: index.source.content_sha256,
    design_label: "parallel group comparison",
    design_capability_statement: "The design label does not establish reliability; the implementation and analysis remain separately audited.",
    population_and_stage: "The exact enrolled population and baseline stage described in the full text.",
    intervention_program: {
      name: "specified intervention program",
      components: ["component described in the source"],
      dose_or_intensity: "described in the source",
      frequency: "described in the source",
      duration: "described in the source",
      supervision: "described in the source",
      adherence: "measured as described in the source",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    comparator_program: {
      name: "specified comparator program",
      components: ["comparator described in the source"],
      dose_or_intensity: "described in the source",
      frequency: "described in the source",
      duration: "described in the source",
      supervision: "described in the source",
      adherence: "measured as described in the source",
      co_interventions: [],
      care_stage: "nonsurgical"
    },
    outcome_and_horizon: "The exact outcome and horizon described in the source.",
    domain_findings: STUDY_METHOD_AUDIT_DOMAINS.map((domain) => ({
      domain,
      status: "limitation_identified" as const,
      plain_language_finding: `The ${domain.replaceAll("_", " ")} domain was inspected and retains a bounded limitation.`,
      evidence_block_ids: [blockId],
      unresolved_fields: []
    })),
    claim_capabilities: [
      {
        claim: "The exact compared programs can be described for the recorded outcome horizon.",
        capability: "can_support",
        reason: "The source-linked method block defines that bounded contrast.",
        evidence_block_ids: [blockId]
      },
      {
        claim: "The study proves every treatment in the umbrella category works.",
        capability: "cannot_support",
        reason: "Only the exact source programs and population were audited.",
        evidence_block_ids: []
      }
    ]
  };
}

async function action(
  routes: ReturnType<typeof createOpenFullTextActionRoutes>,
  operationId: string,
  body: unknown
) {
  const route = routes.find((candidate) => candidate.operationId === operationId);
  if (route === undefined) throw new Error(`missing ${operationId}`);
  return route.handle({
    request: {} as IncomingMessage,
    clientIp: "127.0.0.1",
    body
  });
}
