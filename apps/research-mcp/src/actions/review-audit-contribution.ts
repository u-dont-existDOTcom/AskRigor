import {
  auditableDocumentIndexSchema,
  type AuditableDocumentIndex,
} from "@askrigor/sources";
import {
  deterministicUuid,
  livingEvidenceContributionSchema,
  sha256,
  type CanonicalSourceMatch,
  type LivingEvidenceContribution,
} from "@askrigor/evidence-repository";
import type { ProtocolManifest } from "@askrigor/protocol";

import {
  reviewMethodAuditReceiptSchema,
  reviewMethodAuditSubmissionSchema,
  validateReviewMethodAudit,
  type ReviewMethodAuditReceipt,
  type ReviewMethodAuditSubmission,
} from "./review-method-audit.js";
import { analysisSourceIdentity } from "./study-audit-reuse.js";

const SECTION_KEY = "000-validated-review-method-audit-v1";
const ENVELOPE_SCHEMA = "askrigor.validated-review-method-audit.v1";

/**
 * One validated review-method audit as a living-evidence contribution: the
 * review counterpart of createValidatedStudyAuditContribution, built the same
 * way so the two kinds sit side by side in the review inbox. The audit is
 * revalidated against the exact document first; the contribution carries the
 * receipt and its structured findings, never the review's text.
 */
export function createValidatedReviewAuditContribution(input: {
  index: AuditableDocumentIndex;
  auditReceipt: ReviewMethodAuditReceipt;
  protocolManifests: ProtocolManifest[];
  startedAt: string;
  completedAt: string;
  freshness: {
    checkedAt: string;
    nextDueAt: string;
    receiptSha256: string;
  };
  canonicalSource?: CanonicalSourceMatch;
}): LivingEvidenceContribution {
  const index = auditableDocumentIndexSchema.parse(input.index);
  const receipt = reviewMethodAuditReceiptSchema.parse(input.auditReceipt);
  const revalidated = validateReviewMethodAudit(index, submissionFromReceipt(receipt));
  if (revalidated.audit_sha256 !== receipt.audit_sha256) {
    throw new Error("REVIEW_AUDIT_REVALIDATION_MISMATCH");
  }
  const source = analysisSourceIdentity({
    index,
    kind: "review",
    auditSha256: receipt.audit_sha256,
    protocolManifests: input.protocolManifests,
    canonicalSource: input.canonicalSource,
  });
  const { identifiers, familyId, analysisId, analysisVersionId } = source;
  const sourceVersionId = source.sourceVersionId;
  const envelope = JSON.stringify({ schema: ENVELOPE_SCHEMA, audit_receipt: receipt });
  const policyId = source.freshnessPolicy?.policyId ?? source.defaultPolicyId;
  const receiptId = deterministicUuid(
    `askrigor:receipt:${analysisVersionId}:${receipt.audit_sha256}`,
  );
  return livingEvidenceContributionSchema.parse({
    schemaVersion: 1,
    idempotencyKey: `review-audit:${analysisVersionId}`,
    run: {
      runId: deterministicUuid(`askrigor:run:${analysisVersionId}`),
      runKind: "live_research",
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      protocolManifests: input.protocolManifests,
      provenanceNote: "Complete validated AskRigor review-method audit; source body was not persisted.",
    },
    topic: null,
    source: {
      familyId,
      versionId: sourceVersionId,
      sourceKind: "review",
      identityHash: source.identityHash,
      displayTitle: source.displayTitle,
      identifiers,
      sourceContentSha256: index.source.content_sha256,
      accessStatus: "complete",
      retrievedAt: source.retrievedAt,
      sourceLocator: source.sourceLocator,
      rawContentPersisted: false,
    },
    analysis: {
      analysisId,
      versionId: analysisVersionId,
      analysisKind: "review_method_audit",
      relationship: "initial",
      previousVersionId: null,
      captureStatus: "complete_performed_analysis",
      authoredAt: input.completedAt,
      coverageStatement: "Complete structured review-method analysis actually validated for the exact source version; no raw source text is included.",
      declaredWholeTextSha256: sha256(envelope),
      sections: [{
        ordinal: 0,
        sectionKey: SECTION_KEY,
        title: "Validated review method audit v1",
        content: envelope,
      }],
      domains: receipt.domain_findings.map((finding, ordinal) => ({
        ordinal,
        rubric: "review_method_v1",
        domain: finding.domain,
        status: finding.status,
        finding: finding.plain_language_finding,
        evidenceLocators: finding.evidence_block_ids.map((blockId) => `block:${blockId}`),
        unresolvedFields: finding.unresolved_fields,
        limitations: [],
      })),
      claimCapabilities: receipt.claim_capabilities.map((capability, ordinal) => ({
        ordinal,
        claim: capability.claim,
        capability: capability.capability === "uncertain" ? "unclear" : capability.capability,
        reason: capability.reason,
        evidenceLocators: capability.evidence_block_ids.map((blockId) => `block:${blockId}`),
      })),
      futureAnalysisItems: receipt.domain_findings.flatMap((finding) =>
        finding.unresolved_fields.map((field) => ({
          itemId: deterministicUuid(
            `askrigor:future-analysis:${analysisVersionId}:${finding.domain}:${field}`,
          ),
          question: `${finding.domain}: ${field}`,
          rationale: "The validated audit recorded this field as unresolved and potentially clarification-worthy.",
          priority: "high",
          status: "open",
          evidenceNeeded: [field],
          resolvedByVersionId: null,
        }))),
    },
    receipts: [{
      receiptId,
      receiptKind: "askrigor_review_method_audit",
      receiptSha256: receipt.audit_sha256,
      locator: index.source.canonical_url,
      details: {
        full_receipt_sha256: sha256(envelope),
        rubric_version: receipt.receipt_version,
        source_body_included: false,
        validated_domain_count: receipt.domain_findings.length,
      },
    }],
    knowledge: {
      question: null,
      topicEdges: [],
      claims: [],
      evidenceBindings: [],
      sourceEdges: [],
      claimEdges: [],
      assessment: null,
      freshnessPolicy: source.freshnessPolicy ?? {
        policyId,
        sourceClass: "review",
        cadenceDays: 30,
        maximumAgeDays: 30,
        ownerRole: "refresh_worker",
        requiredChecks: [
          "exact source-content hash",
          "retraction/correction status no older than 72 hours",
          "current protocol and rubric identity",
        ],
        failureBehavior: "block_current_projection",
      },
      freshnessChecks: [{
        checkId: deterministicUuid(`askrigor:freshness-check:${analysisVersionId}`),
        policyId,
        checkedAt: input.freshness.checkedAt,
        outcome: "current",
        projectionState: "current",
        nextDueAt: input.freshness.nextDueAt,
        receiptSha256: input.freshness.receiptSha256,
        limitations: [
          "Freshness is bounded to the recorded source-version and integrity checks; it is not complete global evidence coverage.",
        ],
      }],
      impactJob: {
        jobId: deterministicUuid(`askrigor:impact-job:${analysisVersionId}`),
        status: "complete",
        affectedClaimVersionIds: [],
        impactReceiptSha256: sha256(`no-dependent-claims:${analysisVersionId}`),
        failureCode: null,
      },
    },
  });
}

function submissionFromReceipt(receipt: ReviewMethodAuditReceipt): ReviewMethodAuditSubmission {
  const {
    receipt_name: _receiptName,
    receipt_version: _receiptVersion,
    audit_status: _auditStatus,
    source_block_count: _sourceBlockCount,
    cited_source_block_count: _citedSourceBlockCount,
    audit_sha256: _auditSha256,
    review_label_is_not_authority_verdict: _labelBoundary,
    limitations: _limitations,
    ...submission
  } = receipt;
  return reviewMethodAuditSubmissionSchema.parse(submission);
}
