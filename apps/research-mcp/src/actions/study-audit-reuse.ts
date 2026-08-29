import {
  auditableDocumentIndexSchema,
  type AuditableDocumentIndex,
} from "@askrigor/sources";
import {
  deterministicUuid,
  livingEvidenceContributionSchema,
  sha256,
  stableJson,
  type AnalysisReuseCandidate,
  type AnalysisReuseLookupInput,
  type LivingEvidenceContribution,
} from "@askrigor/evidence-repository";
import type { ProtocolManifest } from "@askrigor/protocol";
import { z } from "zod";

import {
  STUDY_METHOD_AUDIT_DOMAINS,
  studyMethodAuditReceiptSchema,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  type StudyMethodAuditReceipt,
  type StudyMethodAuditSubmission,
} from "./study-method-audit.js";

const REUSE_SECTION_KEY = "000-validated-study-method-audit-v1";
const REUSE_SCHEMA = "askrigor.validated-study-method-audit.v1";

export const studyAuditReuseReasonSchema = z.enum([
  "candidate_missing",
  "candidate_ambiguous",
  "source_incompatible",
  "analysis_not_current",
  "source_access_not_complete",
  "freshness_not_current",
  "impact_not_complete",
  "protocol_incompatible",
  "rubric_incompatible",
  "record_invalid",
  "repository_unavailable",
]);

export type StudyAuditReuseReason = z.output<typeof studyAuditReuseReasonSchema>;

const reusableProjectionSchema = z.object({
  status: z.literal("reusable"),
  repository_analysis_version_id: z.uuid(),
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  audit_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  protocol_sha256s: z.array(z.string().regex(/^[a-f0-9]{64}$/u)).min(1),
  freshness_state: z.literal("current"),
  current_source_revalidation_required: z.literal(true),
}).strict();

const freshRequiredProjectionSchema = z.object({
  status: z.literal("fresh_audit_required"),
  reason: studyAuditReuseReasonSchema,
  current_source_revalidation_required: z.literal(true),
}).strict();

export const studyAuditRepositoryReuseProjectionSchema = z.discriminatedUnion("status", [
  reusableProjectionSchema,
  freshRequiredProjectionSchema,
]);

export type StudyAuditRepositoryReuseProjection = z.output<
  typeof studyAuditRepositoryReuseProjectionSchema
>;

const storedStudyAuditEnvelopeSchema = z.object({
  schema: z.literal(REUSE_SCHEMA),
  audit_receipt: studyMethodAuditReceiptSchema,
}).strict();

export interface StudyAuditReuseReader {
  findAnalysisReuseCandidates(
    input: AnalysisReuseLookupInput,
  ): Promise<AnalysisReuseCandidate[]>;
}

export type StudyAuditReuseResolution = {
  projection: StudyAuditRepositoryReuseProjection;
  audit?: StudyMethodAuditSubmission;
};

export async function resolveStudyAuditReuse(input: {
  reader: StudyAuditReuseReader;
  index: AuditableDocumentIndex;
  requestedDoi: string;
  protocolManifests: ProtocolManifest[];
  analysisVersionId?: string;
}): Promise<StudyAuditReuseResolution> {
  const index = auditableDocumentIndexSchema.parse(input.index);
  const expectedProtocols = input.protocolManifests.map(({ sha256: digest }) => digest).sort();
  let candidates: AnalysisReuseCandidate[];
  try {
    candidates = await input.reader.findAnalysisReuseCandidates({
      identifier: { scheme: "doi", value: normalizeDoi(input.requestedDoi) },
      sourceContentSha256: index.source.content_sha256,
      analysisKind: "study_method_audit",
      ...(input.analysisVersionId === undefined
        ? {}
        : { analysisVersionId: input.analysisVersionId }),
      limit: 4,
    });
  } catch {
    return freshRequired("repository_unavailable");
  }
  if (candidates.length === 0) return freshRequired("candidate_missing");

  const compatible: Array<{
    candidate: AnalysisReuseCandidate;
    audit: StudyMethodAuditSubmission;
    receipt: StudyMethodAuditReceipt;
  }> = [];
  const reasons: StudyAuditReuseReason[] = [];
  for (const candidate of candidates) {
    const result = compatibleStudyAudit(candidate, index, expectedProtocols);
    if ("reason" in result) reasons.push(result.reason);
    else compatible.push({ candidate, ...result });
  }
  if (compatible.length === 0) return freshRequired(reasons[0] ?? "record_invalid");
  if (compatible.length !== 1) return freshRequired("candidate_ambiguous");

  const selected = compatible[0]!;
  return {
    projection: reusableProjectionSchema.parse({
      status: "reusable",
      repository_analysis_version_id: selected.candidate.analysisVersionId,
      source_content_sha256: index.source.content_sha256,
      audit_sha256: selected.receipt.audit_sha256,
      protocol_sha256s: expectedProtocols,
      freshness_state: "current",
      current_source_revalidation_required: true,
    }),
    audit: selected.audit,
  };
}

function compatibleStudyAudit(
  candidate: AnalysisReuseCandidate,
  index: AuditableDocumentIndex,
  expectedProtocols: string[],
): { audit: StudyMethodAuditSubmission; receipt: StudyMethodAuditReceipt } | {
  reason: StudyAuditReuseReason;
} {
  if (
    candidate.sourceContentSha256 !== index.source.content_sha256 ||
    candidate.analysisKind !== "study_method_audit" ||
    !candidateIdentifiersMatch(candidate.sourceIdentifiers, index)
  ) {
    return { reason: "source_incompatible" };
  }
  if (
    !candidate.analysisUsable ||
    candidate.captureStatus !== "complete_performed_analysis" ||
    candidate.relationship === "invalidates"
  ) {
    return { reason: "analysis_not_current" };
  }
  if (candidate.sourceAccessStatus !== "complete") {
    return { reason: "source_access_not_complete" };
  }
  if (candidate.freshnessState !== "current" || candidate.freshnessCheckedAt === null) {
    return { reason: "freshness_not_current" };
  }
  if (
    candidate.completedImpactJobs < 1 ||
    candidate.pendingImpactJobs !== 0
  ) {
    return { reason: "impact_not_complete" };
  }
  if (!sameMembers(candidate.protocolManifestSha256s, expectedProtocols)) {
    return { reason: "protocol_incompatible" };
  }

  const parsedContribution = livingEvidenceContributionSchema.safeParse(candidate.payload);
  if (!parsedContribution.success) return { reason: "record_invalid" };
  const contribution = parsedContribution.data;
  if (
    contribution.analysis.versionId !== candidate.analysisVersionId ||
    contribution.analysis.analysisKind !== "study_method_audit" ||
    contribution.analysis.captureStatus !== "complete_performed_analysis" ||
    contribution.source?.versionId !== candidate.sourceVersionId ||
    contribution.source.familyId !== candidate.sourceFamilyId ||
    contribution.source.sourceContentSha256 !== index.source.content_sha256 ||
    contribution.source.accessStatus !== "complete" ||
    contribution.source.rawContentPersisted !== false
  ) {
    return { reason: "record_invalid" };
  }
  if (!sameMembers(
    contribution.run.protocolManifests.map(({ sha256: digest }) => digest),
    expectedProtocols,
  )) {
    return { reason: "protocol_incompatible" };
  }
  const wholeText = contribution.analysis.sections.map(({ content }) => content).join("");
  if (
    contribution.analysis.declaredWholeTextSha256 === null ||
    contribution.analysis.declaredWholeTextSha256 !== sha256(wholeText)
  ) {
    return { reason: "record_invalid" };
  }
  const auditSections = contribution.analysis.sections.filter(
    ({ sectionKey }) => sectionKey === REUSE_SECTION_KEY,
  );
  if (auditSections.length !== 1) return { reason: "rubric_incompatible" };

  let envelope: z.output<typeof storedStudyAuditEnvelopeSchema>;
  try {
    envelope = storedStudyAuditEnvelopeSchema.parse(JSON.parse(auditSections[0]!.content));
  } catch {
    return { reason: "record_invalid" };
  }
  const receipt = envelope.audit_receipt;
  const audit = submissionFromReceipt(receipt);
  if (
    receipt.receipt_version !== "1.0" ||
    receipt.source_primary_identifier !== index.source.primary_identifier ||
    receipt.source_content_sha256 !== index.source.content_sha256 ||
    receipt.audit_sha256 !== sha256(JSON.stringify(audit)) ||
    !sameMembers(
      receipt.domain_findings.map(({ domain }) => domain),
      [...STUDY_METHOD_AUDIT_DOMAINS],
    )
  ) {
    return { reason: "rubric_incompatible" };
  }
  const storedReceipt = contribution.receipts.filter(
    ({ receiptKind }) => receiptKind === "askrigor_study_method_audit",
  );
  if (
    storedReceipt.length !== 1 ||
    storedReceipt[0]!.receiptSha256 !== receipt.audit_sha256 ||
    storedReceipt[0]!.details.full_receipt_sha256 !== sha256(auditSections[0]!.content) ||
    storedReceipt[0]!.details.rubric_version !== "1.0"
  ) {
    return { reason: "record_invalid" };
  }
  return { audit, receipt };
}

export function createValidatedStudyAuditContribution(input: {
  index: AuditableDocumentIndex;
  auditReceipt: StudyMethodAuditReceipt;
  protocolManifests: ProtocolManifest[];
  startedAt: string;
  completedAt: string;
  freshness: {
    checkedAt: string;
    nextDueAt: string;
    receiptSha256: string;
  };
}): LivingEvidenceContribution {
  const index = auditableDocumentIndexSchema.parse(input.index);
  const receipt = studyMethodAuditReceiptSchema.parse(input.auditReceipt);
  const audit = submissionFromReceipt(receipt);
  const revalidated = validateStudyMethodAudit(index, audit);
  if (revalidated.audit_sha256 !== receipt.audit_sha256) {
    throw new Error("STORED_STUDY_AUDIT_REVALIDATION_MISMATCH");
  }
  const identifiers = sourceIdentifiers(index);
  const protocolDigest = sha256(stableJson(input.protocolManifests));
  const familyId = deterministicUuid(`askrigor:source-family:${stableJson(identifiers)}`);
  const sourceVersionId = deterministicUuid(
    `askrigor:source-version:${familyId}:${index.source.content_sha256}`,
  );
  const analysisId = deterministicUuid(`askrigor:analysis:${familyId}:study-method-v1`);
  const analysisVersionId = deterministicUuid(
    `askrigor:analysis-version:${analysisId}:${receipt.audit_sha256}:${protocolDigest}`,
  );
  const envelope = JSON.stringify({ schema: REUSE_SCHEMA, audit_receipt: receipt });
  const policyId = deterministicUuid(`askrigor:freshness-policy:${familyId}:study`);
  const receiptId = deterministicUuid(
    `askrigor:receipt:${analysisVersionId}:${receipt.audit_sha256}`,
  );
  const contribution = {
    schemaVersion: 1 as const,
    idempotencyKey: `study-audit:${analysisVersionId}`,
    run: {
      runId: deterministicUuid(`askrigor:run:${analysisVersionId}`),
      runKind: "live_research" as const,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      protocolManifests: input.protocolManifests,
      provenanceNote: "Complete validated AskRigor study-method audit; source body was not persisted.",
    },
    topic: null,
    source: {
      familyId,
      versionId: sourceVersionId,
      sourceKind: "study" as const,
      identityHash: sha256(stableJson(identifiers)),
      displayTitle: (index.source.title ?? index.source.primary_identifier).slice(0, 500),
      identifiers,
      sourceContentSha256: index.source.content_sha256,
      accessStatus: "complete" as const,
      retrievedAt: input.freshness.checkedAt,
      sourceLocator: index.source.canonical_url,
      rawContentPersisted: false as const,
    },
    analysis: {
      analysisId,
      versionId: analysisVersionId,
      analysisKind: "study_method_audit" as const,
      relationship: "initial" as const,
      previousVersionId: null,
      captureStatus: "complete_performed_analysis" as const,
      authoredAt: input.completedAt,
      coverageStatement: "Complete structured study-method analysis actually validated for the exact source version; no raw source text is included.",
      declaredWholeTextSha256: sha256(envelope),
      sections: [{
        ordinal: 0,
        sectionKey: REUSE_SECTION_KEY,
        title: "Validated study method audit v1",
        content: envelope,
      }],
      domains: receipt.domain_findings.map((finding, ordinal) => ({
        ordinal,
        rubric: "study_method_v1" as const,
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
        capability: capability.capability === "uncertain" ? "unclear" as const : capability.capability,
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
          priority: "high" as const,
          status: "open" as const,
          evidenceNeeded: [field],
          resolvedByVersionId: null,
        }))),
    },
    receipts: [{
      receiptId,
      receiptKind: "askrigor_study_method_audit",
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
      freshnessPolicy: {
        policyId,
        sourceClass: "study" as const,
        cadenceDays: 30,
        maximumAgeDays: 30,
        ownerRole: "refresh_worker",
        requiredChecks: [
          "exact source-content hash",
          "retraction/correction status no older than 72 hours",
          "current protocol and rubric identity",
        ],
        failureBehavior: "block_current_projection" as const,
      },
      freshnessChecks: [{
        checkId: deterministicUuid(`askrigor:freshness-check:${analysisVersionId}`),
        policyId,
        checkedAt: input.freshness.checkedAt,
        outcome: "current" as const,
        projectionState: "current" as const,
        nextDueAt: input.freshness.nextDueAt,
        receiptSha256: input.freshness.receiptSha256,
        limitations: [
          "Freshness is bounded to the recorded source-version and integrity checks; it is not complete global evidence coverage.",
        ],
      }],
      impactJob: {
        jobId: deterministicUuid(`askrigor:impact-job:${analysisVersionId}`),
        status: "complete" as const,
        affectedClaimVersionIds: [],
        impactReceiptSha256: sha256(`no-dependent-claims:${analysisVersionId}`),
        failureCode: null,
      },
    },
  };
  return livingEvidenceContributionSchema.parse(contribution);
}

function submissionFromReceipt(receipt: StudyMethodAuditReceipt): StudyMethodAuditSubmission {
  const {
    receipt_name: _receiptName,
    receipt_version: _receiptVersion,
    audit_status: _auditStatus,
    source_block_count: _sourceBlockCount,
    cited_source_block_count: _citedSourceBlockCount,
    audit_sha256: _auditSha256,
    design_label_is_not_reliability_verdict: _labelBoundary,
    limitations: _limitations,
    ...submission
  } = receipt;
  return studyMethodAuditSubmissionSchema.parse(submission);
}

function sourceIdentifiers(
  index: AuditableDocumentIndex,
): Array<{ scheme: "doi" | "pmid" | "pmcid" | "other"; value: string }> {
  const identifiers: Array<{ scheme: "doi" | "pmid" | "pmcid" | "other"; value: string }> = [];
  if (index.source.doi !== undefined) identifiers.push({ scheme: "doi", value: normalizeDoi(index.source.doi) });
  if (index.source.pmid !== undefined) identifiers.push({ scheme: "pmid", value: index.source.pmid });
  if (index.source.pmcid !== undefined) identifiers.push({ scheme: "pmcid", value: index.source.pmcid.toUpperCase() });
  if (identifiers.length === 0) identifiers.push({ scheme: "other", value: index.source.primary_identifier });
  return identifiers.sort((left, right) =>
    left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value));
}

function candidateIdentifiersMatch(
  identifiers: Array<{ scheme: string; value: string }>,
  index: AuditableDocumentIndex,
): boolean {
  const known = new Set(identifiers.map(({ scheme, value }) => `${scheme}:${value}`));
  if (index.source.doi !== undefined && !known.has(`doi:${normalizeDoi(index.source.doi)}`)) return false;
  if (index.source.pmid !== undefined && !known.has(`pmid:${index.source.pmid}`)) return false;
  if (index.source.pmcid !== undefined && !known.has(`pmcid:${index.source.pmcid.toUpperCase()}`)) return false;
  return true;
}

function normalizeDoi(value: string): string {
  return value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").toLowerCase();
}

function sameMembers(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value));
}

function freshRequired(reason: StudyAuditReuseReason): StudyAuditReuseResolution {
  return {
    projection: freshRequiredProjectionSchema.parse({
      status: "fresh_audit_required",
      reason,
      current_source_revalidation_required: true,
    }),
  };
}
