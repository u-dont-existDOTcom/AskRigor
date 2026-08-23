import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  REVIEW_METHOD_AUDIT_DOMAINS,
  reviewMethodAuditSubmissionSchema,
  validateReviewMethodAudit,
  type ReviewMethodAuditSubmission
} from "../apps/research-mcp/src/index.js";
import {
  indexJatsStudyDocument,
  type EuropePmcFullTextArticle
} from "../packages/sources/src/index.js";

async function sourceIndex() {
  const xml = await readFile(
    new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
    "utf8"
  );
  const article: EuropePmcFullTextArticle = {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: "10.1234/recorded.example",
    title: "Recorded full-text study",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml
  };
  return indexJatsStudyDocument(article);
}

async function submission(): Promise<ReviewMethodAuditSubmission> {
  const index = await sourceIndex();
  const methodsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Methods")
  )!.block_id;
  const resultsBlock = index.blocks.find(({ section_path }) =>
    section_path.includes("Results")
  )!.block_id;
  return {
    source_primary_identifier: index.source.pmcid,
    source_content_sha256: index.source.content_sha256,
    review_type: "systematic_review",
    search_end_date: "2026-01-31",
    included_source_families: ["randomized trials", "prospective cohorts"],
    program_fingerprints: [{
      label: "supervised progressive resistance program",
      components: ["progressive lower-body resistance exercises"],
      dose_or_intensity: "as reported by each included source",
      frequency: "as reported by each included source",
      duration: "as reported by each included source",
      supervision: "mixed supervision",
      co_interventions: [],
      population_or_stage: "adults meeting each included source's criteria",
      outcome_and_horizon: "function at the reported follow-up horizons"
    }],
    domain_findings: REVIEW_METHOD_AUDIT_DOMAINS.map((domain, position) => ({
      domain,
      status: position === 9 ? "unclear" as const : "limitation_identified" as const,
      plain_language_finding: position === 9
        ? "The fixture did not establish whether missing results were fully assessed."
        : `The ${domain.replaceAll("_", " ")} domain was inspected and retains a stated limitation.`,
      evidence_block_ids: position === 9
        ? []
        : [position % 2 === 0 ? methodsBlock : resultsBlock],
      unresolved_fields: position === 9
        ? ["unreported and unpublished eligible results"]
        : []
    })),
    claim_capabilities: [
      {
        claim: "The review can describe the exact programs and outcomes it actually included.",
        capability: "can_support",
        reason: "The indexed methods and results identify those bounded inputs.",
        evidence_block_ids: [methodsBlock, resultsBlock]
      },
      {
        claim: "The review proves that every treatment bearing the same umbrella label works.",
        capability: "cannot_support",
        reason: "Program, population, outcome, and horizon heterogeneity limit that inference.",
        evidence_block_ids: []
      }
    ]
  };
}

describe("review-method audit receipts", () => {
  it("binds every review domain and claim capability to one exact full text", async () => {
    const index = await sourceIndex();
    const audit = await submission();

    const receipt = validateReviewMethodAudit(index, audit);

    expect(receipt).toMatchObject({
      receipt_name: "askrigor_review_method_audit",
      receipt_version: "1.0",
      audit_status: "complete_with_unresolved_fields",
      source_primary_identifier: "PMC1234567",
      source_content_sha256: index.source.content_sha256,
      review_label_is_not_authority_verdict: true,
      source_block_count: index.blocks.length,
      cited_source_block_count: 2
    });
    expect(receipt.domain_findings.map(({ domain }) => domain))
      .toEqual(REVIEW_METHOD_AUDIT_DOMAINS);
    expect(receipt.limitations.join(" ")).toContain(
      "not accepted as reliability verdicts"
    );
  });

  it("rejects missing or duplicated review domains", async () => {
    const audit = await submission();
    audit.domain_findings[11] = {
      ...audit.domain_findings[10]!,
      plain_language_finding: "Duplicate review-domain fixture."
    };

    expect(reviewMethodAuditSubmissionSchema.safeParse(audit).success).toBe(false);
  });

  it("rejects source blocks not present in the acquired document", async () => {
    const index = await sourceIndex();
    const audit = await submission();
    audit.claim_capabilities[0]!.evidence_block_ids = [
      "jats_999999_aaaaaaaaaaaa"
    ];

    expect(() => validateReviewMethodAudit(index, audit)).toThrow(
      "Review audit cited an unknown source block"
    );
  });

  it("requires separate statements of review capability and non-capability", async () => {
    const audit = await submission();
    audit.claim_capabilities = audit.claim_capabilities.filter(({ capability }) =>
      capability !== "cannot_support"
    );

    const parsed = reviewMethodAuditSubmissionSchema.safeParse(audit);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map(({ message }) => message)).toContain(
        "must state at least one explicit review non-capability"
      );
    }
  });
});
