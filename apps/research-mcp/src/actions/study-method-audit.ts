import { createHash } from "node:crypto";

import {
  externalEvidenceProviderSchema,
  externalEvidenceSha256Schema,
} from "@askrigor/contracts";
import {
  auditableDocumentIndexSchema,
  jatsStudyIndexSchema,
  toAuditableDocumentIndex,
  type AuditableDocumentIndex,
  type JatsStudyIndex
} from "@askrigor/sources";
import { z } from "zod";

import {
  computeStudyExternalEvidenceBundleHash,
  studyExternalEvidenceAuditOutputSchema,
  studyExternalEvidenceProtocolTupleSchema,
  verifyStudyExternalEvidenceReceipt,
  type StudyExternalEvidenceAuditOutput,
  type StudyExternalEvidenceProtocolTuple,
} from "./study-external-evidence.js";

export const STUDY_METHOD_AUDIT_DOMAINS = [
  "source_identity_and_version",
  "registration_protocol_and_analysis_plan",
  "population_selection_and_transport",
  "intervention_program_and_fidelity",
  "comparator_program_and_competence",
  "allocation_blinding_and_deviations",
  "denominators_crossover_attrition_and_missing_data",
  "outcomes_measurement_and_selective_reporting",
  "results_uncertainty_and_analysis_flexibility",
  "harms_capture_and_follow_up",
  "funding_conflicts_and_analytic_control",
  "data_code_and_reproducibility",
  "replication_contradiction_and_evidence_ancestry"
] as const;

const domainSchema = z.enum(STUDY_METHOD_AUDIT_DOMAINS);
const blockIdSchema = z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u);
const boundedPlainText = (maximum: number) => z.string().trim().min(1).max(maximum);
const programSchema = z.object({
  name: boundedPlainText(500),
  components: z.array(boundedPlainText(500)).min(1).max(30),
  dose_or_intensity: boundedPlainText(500),
  frequency: boundedPlainText(500),
  duration: boundedPlainText(500),
  supervision: boundedPlainText(500),
  adherence: boundedPlainText(500),
  co_interventions: z.array(boundedPlainText(500)).max(30),
  care_stage: z.enum([
    "preoperative",
    "postoperative",
    "nonsurgical",
    "preventive",
    "other",
    "not_described"
  ])
}).strict().superRefine((program, context) => {
  if (isGenericProgramName(program.name) && !program.components.includes("program not described")) {
    context.addIssue({
      code: "custom",
      path: ["components"],
      message: "generic program names require exact components or the literal program not described"
    });
  }
});

const domainFindingShape = {
  domain: domainSchema,
  status: z.enum(["adequate", "limitation_identified", "unclear", "not_applicable"]),
  plain_language_finding: boundedPlainText(2_000),
  evidence_block_ids: z.array(blockIdSchema).max(100),
  unresolved_fields: z.array(boundedPlainText(500)).max(30)
} as const;

const domainFindingSchema = z.object(domainFindingShape).strict().superRefine((finding, context) => {
  if (
    (finding.status === "adequate" || finding.status === "limitation_identified") &&
    finding.evidence_block_ids.length === 0
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidence_block_ids"],
      message: "audited findings require at least one source block"
    });
  }
  if (finding.status === "unclear" && finding.unresolved_fields.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["unresolved_fields"],
      message: "unclear findings require the unresolved fields"
    });
  }
});

export const studyMethodExternalEvidenceReferenceSchema = z.object({
  external_receipt_payload_sha256: externalEvidenceSha256Schema,
  study_identity_hash: externalEvidenceSha256Schema,
  provider: externalEvidenceProviderSchema,
  item_kind: z.enum([
    "provider_attempt",
    "publication_integrity_event",
    "replication_relationship",
    "postpublication_message",
    "citation_context",
    "review_ancestry",
    "imported_risk_of_bias",
  ]),
  item_hash: externalEvidenceSha256Schema
}).strict();

const externalDomainFindingSchema = z.object({
  ...domainFindingShape,
  external_evidence_references: z.array(studyMethodExternalEvidenceReferenceSchema).max(100)
}).strict().superRefine((finding, context) => {
  const isAncestry = finding.domain === "replication_contradiction_and_evidence_ancestry";
  if (!isAncestry && finding.external_evidence_references.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["external_evidence_references"],
      message: "external evidence references are allowed only in the replication/evidence-ancestry domain"
    });
  }
  if (
    (finding.status === "adequate" || finding.status === "limitation_identified") &&
    finding.evidence_block_ids.length === 0 &&
    (!isAncestry || finding.external_evidence_references.length === 0)
  ) {
    context.addIssue({
      code: "custom",
      path: ["evidence_block_ids"],
      message: isAncestry
        ? "audited ancestry findings require a source block or verified external evidence reference"
        : "audited findings require at least one source block"
    });
  }
  if (finding.status === "unclear" && finding.unresolved_fields.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["unresolved_fields"],
      message: "unclear findings require the unresolved fields"
    });
  }
});

const claimCapabilitySchema = z.object({
  claim: boundedPlainText(2_000),
  capability: z.enum(["can_support", "cannot_support", "uncertain"]),
  reason: boundedPlainText(2_000),
  evidence_block_ids: z.array(blockIdSchema).max(100)
}).strict().superRefine((finding, context) => {
  if (finding.capability === "can_support" && finding.evidence_block_ids.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["evidence_block_ids"],
      message: "a support capability requires source blocks"
    });
  }
});

const submissionShape = {
  source_primary_identifier: boundedPlainText(2_048),
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  design_label: boundedPlainText(200),
  design_capability_statement: boundedPlainText(2_000),
  population_and_stage: boundedPlainText(1_000),
  intervention_program: programSchema,
  comparator_program: programSchema,
  outcome_and_horizon: boundedPlainText(1_000),
  domain_findings: z.array(domainFindingSchema).length(STUDY_METHOD_AUDIT_DOMAINS.length),
  claim_capabilities: z.array(claimCapabilitySchema).min(2).max(50)
} as const;

export const studyMethodAuditSubmissionSchema = z.object(submissionShape).strict().superRefine((audit, context) => {
  validateSubmissionCoverage(audit, context);
});

export const studyMethodAuditExternalBindingSchema = z.object({
  external_receipt_payload_sha256: externalEvidenceSha256Schema,
  study_identity_hash: externalEvidenceSha256Schema,
  bundle_hash: externalEvidenceSha256Schema
}).strict();

export const studyMethodAuditExternalSubmissionSchema = z.object({
  ...submissionShape,
  domain_findings: z.array(externalDomainFindingSchema).length(STUDY_METHOD_AUDIT_DOMAINS.length),
  external_evidence_binding: studyMethodAuditExternalBindingSchema
}).strict().superRefine((audit, context) => {
  validateSubmissionCoverage(audit, context);
});

function validateSubmissionCoverage(
  audit: {
    domain_findings: Array<{ domain: typeof STUDY_METHOD_AUDIT_DOMAINS[number] }>;
    claim_capabilities: Array<{ capability: "can_support" | "cannot_support" | "uncertain" }>;
  },
  context: z.RefinementCtx
): void {
  const domainCounts = new Map<string, number>();
  for (const finding of audit.domain_findings) {
    domainCounts.set(finding.domain, (domainCounts.get(finding.domain) ?? 0) + 1);
  }
  for (const domain of STUDY_METHOD_AUDIT_DOMAINS) {
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
      message: "must state at least one bounded support capability"
    });
  }
  if (!audit.claim_capabilities.some(({ capability }) => capability === "cannot_support")) {
    context.addIssue({
      code: "custom",
      path: ["claim_capabilities"],
      message: "must state at least one explicit non-capability"
    });
  }
}

export type StudyMethodAuditSubmission = z.output<
  typeof studyMethodAuditSubmissionSchema
>;
export type StudyMethodAuditExternalSubmission = z.output<
  typeof studyMethodAuditExternalSubmissionSchema
>;

export const studyMethodAuditReceiptSchema = studyMethodAuditSubmissionSchema.extend({
  receipt_name: z.literal("askrigor_study_method_audit"),
  receipt_version: z.literal("1.0"),
  audit_status: z.enum(["complete_with_unresolved_fields", "complete_no_unresolved_fields"]),
  source_block_count: z.number().int().nonnegative(),
  cited_source_block_count: z.number().int().nonnegative(),
  audit_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  design_label_is_not_reliability_verdict: z.literal(true),
  limitations: z.array(z.enum([
    "This receipt proves source linkage and checklist coverage, not that every interpretation is semantically correct.",
    "Randomization, peer review, journal prestige, indexing, guideline inclusion, and institutional authority were not accepted as reliability verdicts.",
    "The study can support only the exact program, population, comparator, outcomes, and horizon recorded here."
  ])).length(3)
}).strict();

export type StudyMethodAuditReceipt = z.output<typeof studyMethodAuditReceiptSchema>;

export const studyMethodAuditExternalReceiptSchema =
  studyMethodAuditExternalSubmissionSchema.extend({
    receipt_name: z.literal("askrigor_study_method_audit_external"),
    receipt_version: z.literal("1.0"),
    audit_status: z.enum(["complete_with_unresolved_fields", "complete_no_unresolved_fields"]),
    source_block_count: z.number().int().nonnegative(),
    cited_source_block_count: z.number().int().nonnegative(),
    cited_external_reference_count: z.number().int().positive().max(100),
    audit_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    external_audit_binding_validated: z.literal(true),
    design_label_is_not_reliability_verdict: z.literal(true),
    limitations: z.array(z.enum([
      "This receipt proves source linkage and checklist coverage, not that every interpretation is semantically correct.",
      "Randomization, peer review, journal prestige, indexing, guideline inclusion, and institutional authority were not accepted as reliability verdicts.",
      "The study can support only the exact program, population, comparator, outcomes, and horizon recorded here.",
      "External provider assertions remain source-linked leads unless the linked implementation, methods, and result were separately audited."
    ])).length(4)
  }).strict();

export type StudyMethodAuditExternalReceipt = z.output<
  typeof studyMethodAuditExternalReceiptSchema
>;

export function validateStudyMethodAudit(
  rawIndex: JatsStudyIndex | AuditableDocumentIndex,
  rawSubmission: StudyMethodAuditSubmission
): StudyMethodAuditReceipt {
  const index = normalizeDocumentIndex(rawIndex);
  const submission = studyMethodAuditSubmissionSchema.parse(rawSubmission);
  if (
    submission.source_primary_identifier !== index.source.primary_identifier ||
    submission.source_content_sha256 !== index.source.content_sha256 ||
    index.source.document_completeness !== "full_text_with_body"
  ) {
    throw new Error("Study audit source identity or completeness mismatch");
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
  const canonicalSubmission = JSON.stringify(submission);
  return studyMethodAuditReceiptSchema.parse({
    ...submission,
    receipt_name: "askrigor_study_method_audit",
    receipt_version: "1.0",
    audit_status: unresolved
      ? "complete_with_unresolved_fields"
      : "complete_no_unresolved_fields",
    source_block_count: index.blocks.length,
    cited_source_block_count: citedBlockIds.size,
    audit_sha256: createHash("sha256").update(canonicalSubmission, "utf8").digest("hex"),
    design_label_is_not_reliability_verdict: true,
    limitations: [
      "This receipt proves source linkage and checklist coverage, not that every interpretation is semantically correct.",
      "Randomization, peer review, journal prestige, indexing, guideline inclusion, and institutional authority were not accepted as reliability verdicts.",
      "The study can support only the exact program, population, comparator, outcomes, and horizon recorded here."
    ]
  });
}

export function validateStudyMethodAuditWithExternalEvidence(
  rawIndex: JatsStudyIndex | AuditableDocumentIndex,
  rawSubmission: StudyMethodAuditExternalSubmission,
  rawExternalAudit: StudyExternalEvidenceAuditOutput,
  expected: {
    sessionId: string;
    protocolIdentities: StudyExternalEvidenceProtocolTuple;
  },
  receiptSecret: string
): StudyMethodAuditExternalReceipt {
  const index = normalizeDocumentIndex(rawIndex);
  const submission = studyMethodAuditExternalSubmissionSchema.parse(rawSubmission);
  const externalAudit = studyExternalEvidenceAuditOutputSchema.parse(rawExternalAudit);
  const { bundle, receipt, provider_artifacts: providerArtifacts } = externalAudit;
  const { bundle_hash: suppliedBundleHash, ...bundleCore } = bundle;
  if (computeStudyExternalEvidenceBundleHash(bundleCore) !== suppliedBundleHash) {
    throw new Error("Study audit external evidence bundle hash mismatch");
  }
  verifyStudyExternalEvidenceReceipt(receipt, {
    sessionId: expected.sessionId,
    studyIdentityHash: bundle.study_identity.identity_hash,
    protocolIdentities: studyExternalEvidenceProtocolTupleSchema.parse(expected.protocolIdentities),
    providerAttempts: bundle.provider_attempts,
    providerArtifacts,
    bundleHash: bundle.bundle_hash
  }, receiptSecret);
  if (
    submission.external_evidence_binding.external_receipt_payload_sha256 !==
      receipt.receipt_payload_sha256 ||
    submission.external_evidence_binding.study_identity_hash !==
      bundle.study_identity.identity_hash ||
    submission.external_evidence_binding.bundle_hash !== bundle.bundle_hash
  ) {
    throw new Error("Study audit external evidence binding mismatch");
  }
  verifySourceIdentityAndCompleteness(index, submission);

  const knownBlockIds = new Set(index.blocks.map(({ block_id }) => block_id));
  const citedBlockIds = new Set<string>();
  const knownExternalItems = externalEvidenceItemKeys(bundle);
  const citedExternalItems = new Set<string>();
  for (const finding of submission.domain_findings) {
    verifyBlocks(finding.evidence_block_ids, knownBlockIds, citedBlockIds);
    for (const reference of finding.external_evidence_references) {
      if (
        reference.external_receipt_payload_sha256 !== receipt.receipt_payload_sha256 ||
        reference.study_identity_hash !== bundle.study_identity.identity_hash ||
        !knownExternalItems.has(externalEvidenceItemKey(reference))
      ) {
        throw new Error("Study audit cited unknown or mismatched external evidence");
      }
      citedExternalItems.add(externalEvidenceItemKey(reference));
    }
  }
  for (const capability of submission.claim_capabilities) {
    verifyBlocks(capability.evidence_block_ids, knownBlockIds, citedBlockIds);
  }
  if (citedExternalItems.size === 0) {
    throw new Error("External-evidence-bound study audit requires a verified external reference");
  }

  const unresolved = submission.domain_findings.some((finding) =>
    finding.status === "unclear" || finding.unresolved_fields.length > 0
  );
  return studyMethodAuditExternalReceiptSchema.parse({
    ...submission,
    receipt_name: "askrigor_study_method_audit_external",
    receipt_version: "1.0",
    audit_status: unresolved
      ? "complete_with_unresolved_fields"
      : "complete_no_unresolved_fields",
    source_block_count: index.blocks.length,
    cited_source_block_count: citedBlockIds.size,
    cited_external_reference_count: citedExternalItems.size,
    audit_sha256: createHash("sha256")
      .update(JSON.stringify(submission), "utf8")
      .digest("hex"),
    external_audit_binding_validated: true,
    design_label_is_not_reliability_verdict: true,
    limitations: [
      "This receipt proves source linkage and checklist coverage, not that every interpretation is semantically correct.",
      "Randomization, peer review, journal prestige, indexing, guideline inclusion, and institutional authority were not accepted as reliability verdicts.",
      "The study can support only the exact program, population, comparator, outcomes, and horizon recorded here.",
      "External provider assertions remain source-linked leads unless the linked implementation, methods, and result were separately audited."
    ]
  });
}

function verifySourceIdentityAndCompleteness(
  index: AuditableDocumentIndex,
  submission: Pick<StudyMethodAuditSubmission, "source_primary_identifier" | "source_content_sha256">
): void {
  if (
    submission.source_primary_identifier !== index.source.primary_identifier ||
    submission.source_content_sha256 !== index.source.content_sha256 ||
    index.source.document_completeness !== "full_text_with_body"
  ) {
    throw new Error("Study audit source identity or completeness mismatch");
  }
}

function externalEvidenceItemKeys(
  bundle: StudyExternalEvidenceAuditOutput["bundle"]
): Set<string> {
  const keys = new Set<string>();
  for (const attempt of bundle.provider_attempts) {
    keys.add(externalEvidenceItemKey({
      provider: attempt.provider,
      item_kind: "provider_attempt",
      item_hash: createHash("sha256")
        .update(canonicalJson(attempt), "utf8")
        .digest("hex")
    }));
  }
  for (const event of bundle.publication_integrity.events) {
    for (const provider of new Set(event.assertions.map(({ provider }) => provider))) {
      keys.add(externalEvidenceItemKey({
        provider,
        item_kind: "publication_integrity_event",
        item_hash: event.event_hash
      }));
    }
  }
  for (const relationship of bundle.replication_relationships) {
    keys.add(externalEvidenceItemKey({
      provider: relationship.provider,
      item_kind: "replication_relationship",
      item_hash: relationship.relationship_hash
    }));
  }
  for (const thread of bundle.postpublication_threads) {
    for (const message of thread.messages) {
      keys.add(externalEvidenceItemKey({
        provider: thread.provider,
        item_kind: "postpublication_message",
        item_hash: message.content_hash
      }));
    }
  }
  for (const context of bundle.citation_contexts) {
    keys.add(externalEvidenceItemKey({
      provider: context.provider,
      item_kind: "citation_context",
      item_hash: context.aggregate_hash
    }));
  }
  for (const link of bundle.review_ancestry) {
    keys.add(externalEvidenceItemKey({
      provider: "review_risk_of_bias",
      item_kind: "review_ancestry",
      item_hash: link.link_hash
    }));
  }
  for (const judgment of bundle.imported_risk_of_bias) {
    keys.add(externalEvidenceItemKey({
      provider: "review_risk_of_bias",
      item_kind: "imported_risk_of_bias",
      item_hash: judgment.judgment_hash
    }));
  }
  return keys;
}

function externalEvidenceItemKey(input: {
  provider: string;
  item_kind: string;
  item_hash: string;
}): string {
  return `${input.provider}:${input.item_kind}:${input.item_hash}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
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
      throw new Error("Study audit cited an unknown source block");
    }
    citedBlockIds.add(blockId);
  }
}

function isGenericProgramName(value: string): boolean {
  return new Set([
    "exercise",
    "physical therapy",
    "physiotherapy",
    "diet",
    "injection",
    "injections",
    "surgery",
    "conservative care",
    "alternative treatment",
    "treatment",
    "usual care"
  ]).has(value.trim().toLowerCase());
}
