import { createHash } from "node:crypto";

import {
  auditableDocumentIndexSchema,
  jatsStudyIndexSchema,
  toAuditableDocumentIndex,
  type AuditableDocumentIndex,
  type JatsStudyIndex
} from "@askrigor/sources";
import { z } from "zod";

export const REVIEW_METHOD_AUDIT_DOMAINS = [
  "source_identity_protocol_and_registration",
  "search_sources_dates_and_reproducibility",
  "historical_grey_and_nonindexed_coverage",
  "eligibility_selection_and_exclusion_logic",
  "duplicate_cohorts_publication_families_and_ancestry",
  "intervention_program_and_comparator_heterogeneity",
  "population_outcome_and_horizon_compatibility",
  "included_study_method_limitations",
  "pooling_models_prediction_and_sensitivity",
  "missing_results_small_study_and_publication_bias",
  "funding_panel_conflicts_and_analytic_control",
  "currency_citation_entailment_and_recommendation_scope"
] as const;

const blockIdSchema = z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const reviewDomainSchema = z.object({
  domain: z.enum(REVIEW_METHOD_AUDIT_DOMAINS),
  status: z.enum(["adequate", "limitation_identified", "unclear", "not_applicable"]),
  plain_language_finding: boundedText(2_000),
  evidence_block_ids: z.array(blockIdSchema).max(100),
  unresolved_fields: z.array(boundedText(500)).max(30)
}).strict().superRefine((finding, context) => {
  if (
    (finding.status === "adequate" || finding.status === "limitation_identified") &&
    finding.evidence_block_ids.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidence_block_ids"],
      message: "audited review findings require at least one source block"
    });
  }
  if (finding.status === "unclear" && finding.unresolved_fields.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["unresolved_fields"],
      message: "unclear review findings require the unresolved fields"
    });
  }
});

const programFingerprintSchema = z.object({
  label: boundedText(500),
  components: z.array(boundedText(500)).min(1).max(30),
  dose_or_intensity: boundedText(500),
  frequency: boundedText(500),
  duration: boundedText(500),
  supervision: boundedText(500),
  co_interventions: z.array(boundedText(500)).max(30),
  population_or_stage: boundedText(500),
  outcome_and_horizon: boundedText(500)
}).strict();

const reviewCapabilitySchema = z.object({
  claim: boundedText(2_000),
  capability: z.enum(["can_support", "cannot_support", "uncertain"]),
  reason: boundedText(2_000),
  evidence_block_ids: z.array(blockIdSchema).max(100)
}).strict().superRefine((finding, context) => {
  if (finding.capability === "can_support" && finding.evidence_block_ids.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["evidence_block_ids"],
      message: "a review support capability requires source blocks"
    });
  }
});

export const reviewMethodAuditSubmissionSchema = z.object({
  source_primary_identifier: boundedText(2_048),
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  review_type: z.enum(["systematic_review", "meta_analysis", "guideline", "other_review"]),
  search_end_date: z.string().date().or(z.literal("not described")),
  included_source_families: z.array(boundedText(500)).min(1).max(50),
  program_fingerprints: z.array(programFingerprintSchema).min(1).max(100),
  domain_findings: z.array(reviewDomainSchema).length(REVIEW_METHOD_AUDIT_DOMAINS.length),
  claim_capabilities: z.array(reviewCapabilitySchema).min(2).max(50)
}).strict().superRefine((audit, context) => {
  const domainCounts = new Map<string, number>();
  for (const finding of audit.domain_findings) {
    domainCounts.set(finding.domain, (domainCounts.get(finding.domain) ?? 0) + 1);
  }
  for (const domain of REVIEW_METHOD_AUDIT_DOMAINS) {
    if (domainCounts.get(domain) !== 1) {
      context.addIssue({
        code: "custom",
        path: ["domain_findings"],
        message: `must contain exactly one ${domain} finding`
      });
    }
  }
  if (!audit.claim_capabilities.some(({ capability }) => capability === "can_support")) {
    context.addIssue({
      code: "custom",
      path: ["claim_capabilities"],
      message: "must state at least one bounded review capability"
    });
  }
  if (!audit.claim_capabilities.some(({ capability }) => capability === "cannot_support")) {
    context.addIssue({
      code: "custom",
      path: ["claim_capabilities"],
      message: "must state at least one explicit review non-capability"
    });
  }
});

export type ReviewMethodAuditSubmission = z.output<
  typeof reviewMethodAuditSubmissionSchema
>;

export const reviewMethodAuditReceiptSchema = reviewMethodAuditSubmissionSchema.safeExtend({
  receipt_name: z.literal("askrigor_review_method_audit"),
  receipt_version: z.literal("1.0"),
  audit_status: z.enum(["complete_with_unresolved_fields", "complete_no_unresolved_fields"]),
  source_block_count: z.number().int().nonnegative(),
  cited_source_block_count: z.number().int().nonnegative(),
  audit_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  review_label_is_not_authority_verdict: z.literal(true),
  limitations: z.array(z.enum([
    "This receipt proves source linkage and checklist coverage, not that every review interpretation is semantically correct.",
    "Publication, indexing, guideline status, panel authority, and pooled estimates were not accepted as reliability verdicts.",
    "The review can support only claims compatible with its actual searches, included programs, populations, comparators, outcomes, horizons, and methods."
  ])).length(3)
}).strict();

export type ReviewMethodAuditReceipt = z.output<typeof reviewMethodAuditReceiptSchema>;

export function validateReviewMethodAudit(
  rawIndex: JatsStudyIndex | AuditableDocumentIndex,
  rawSubmission: ReviewMethodAuditSubmission
): ReviewMethodAuditReceipt {
  const index = normalizeDocumentIndex(rawIndex);
  const submission = reviewMethodAuditSubmissionSchema.parse(rawSubmission);
  if (
    submission.source_primary_identifier !== index.source.primary_identifier ||
    submission.source_content_sha256 !== index.source.content_sha256 ||
    index.source.document_completeness !== "full_text_with_body"
  ) {
    throw new Error("Review audit source identity or completeness mismatch");
  }

  const knownBlockIds = new Set(index.blocks.map(({ block_id }) => block_id));
  const citedBlockIds = new Set<string>();
  for (const finding of submission.domain_findings) {
    verifyBlocks(finding.evidence_block_ids, knownBlockIds, citedBlockIds);
  }
  for (const capability of submission.claim_capabilities) {
    verifyBlocks(capability.evidence_block_ids, knownBlockIds, citedBlockIds);
  }
  const unresolved = submission.domain_findings.some((finding) =>
    finding.status === "unclear" || finding.unresolved_fields.length > 0
  );
  return reviewMethodAuditReceiptSchema.parse({
    ...submission,
    receipt_name: "askrigor_review_method_audit",
    receipt_version: "1.0",
    audit_status: unresolved
      ? "complete_with_unresolved_fields"
      : "complete_no_unresolved_fields",
    source_block_count: index.blocks.length,
    cited_source_block_count: citedBlockIds.size,
    audit_sha256: createHash("sha256")
      .update(JSON.stringify(submission), "utf8")
      .digest("hex"),
    review_label_is_not_authority_verdict: true,
    limitations: [
      "This receipt proves source linkage and checklist coverage, not that every review interpretation is semantically correct.",
      "Publication, indexing, guideline status, panel authority, and pooled estimates were not accepted as reliability verdicts.",
      "The review can support only claims compatible with its actual searches, included programs, populations, comparators, outcomes, horizons, and methods."
    ]
  });
}

function normalizeDocumentIndex(
  rawIndex: JatsStudyIndex | AuditableDocumentIndex
): AuditableDocumentIndex {
  const auditable = auditableDocumentIndexSchema.safeParse(rawIndex);
  if (auditable.success) return auditable.data;
  return toAuditableDocumentIndex(jatsStudyIndexSchema.parse(rawIndex));
}

function verifyBlocks(
  blockIds: string[],
  knownBlockIds: ReadonlySet<string>,
  citedBlockIds: Set<string>
): void {
  for (const blockId of blockIds) {
    if (!knownBlockIds.has(blockId)) {
      throw new Error("Review audit cited an unknown source block");
    }
    citedBlockIds.add(blockId);
  }
}
