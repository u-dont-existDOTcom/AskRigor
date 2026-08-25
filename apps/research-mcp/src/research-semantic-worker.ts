import { z } from "zod";

import {
  bidirectionalIterationSubmissionSchema,
  bidirectionalIterationWorkPackageSchema,
  bidirectionalReturnAssessmentSubmissionSchema,
  bidirectionalReturnAssessmentWorkPackageSchema
} from "./actions/research-bidirectional-iteration.js";
import {
  candidateScreeningSubmissionSchema,
  candidateScreeningWorkPackageSchema
} from "./actions/research-candidate-frontier.js";
import {
  formalClaimRecalculationWorkPackageSchema,
  formalEvidenceScreeningSubmissionSchema,
  formalEvidenceScreeningWorkPackageSchema,
  formalMethodAuditWorkPackageSchema
} from "./actions/research-formal-evidence.js";
import { noticeMethodAuditSubmissionSchema } from
  "./actions/open-full-text-route.js";
import { reviewMethodAuditSubmissionSchema } from
  "./actions/review-method-audit.js";
import { RESEARCH_MODULE_IDS } from
  "./actions/research-session-controller.js";
import {
  studyMethodAuditExternalSubmissionSchema,
  studyMethodAuditSubmissionSchema
} from "./actions/study-method-audit.js";
import {
  treatmentLandscapeSubmissionSchema,
  treatmentLandscapeWorkPackageSchema
} from "./actions/research-treatment-finalization.js";

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const sessionId = z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u);
const bounded = (maximum: number) => z.string().trim().min(1).max(maximum);

const moduleDecisionSchema = z.object({
  module_id: z.enum(RESEARCH_MODULE_IDS),
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED"]),
  rationale: bounded(1_000)
}).strict();

export const moduleApplicabilitySubmissionSchema = z.object({
  package_version: z.literal("askrigor_module_applicability_v1"),
  decisions: z.array(moduleDecisionSchema).min(1).max(RESEARCH_MODULE_IDS.length)
}).strict();

const modelOutputEnvelope = {
  contract_version: z.literal("askrigor_hermes_semantic_result_v1"),
  session_id: sessionId,
  state_digest: digest
} as const;

const moduleOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("module_applicability"),
  submission: moduleApplicabilitySubmissionSchema
}).strict();

const candidateOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("candidate_screening"),
  submission: candidateScreeningSubmissionSchema
}).strict();

const formalScreeningOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("formal_source_screening"),
  submission: formalEvidenceScreeningSubmissionSchema
}).strict();

const formalMethodAuditOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("formal_method_audit"),
  source_id: digest,
  audit_kind: z.enum(["STUDY", "REVIEW", "NOTICE"]),
  submission: z.union([
    studyMethodAuditSubmissionSchema,
    reviewMethodAuditSubmissionSchema,
    noticeMethodAuditSubmissionSchema
  ])
}).strict();

const formalClaimRecalculationOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("formal_claim_recalculation"),
  source_id: digest,
  submission: studyMethodAuditExternalSubmissionSchema
}).strict();

const bidirectionalIterationOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("bidirectional_iteration"),
  submission: bidirectionalIterationSubmissionSchema
}).strict();

const bidirectionalReturnAssessmentOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("bidirectional_return_assessment"),
  submission: bidirectionalReturnAssessmentSubmissionSchema
}).strict();

const treatmentLandscapeOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("treatment_landscape"),
  submission: treatmentLandscapeSubmissionSchema
}).strict();

export const researchSemanticModelOutputSchema = z.discriminatedUnion(
  "work_type",
  [
    moduleOutputSchema,
    candidateOutputSchema,
    formalScreeningOutputSchema,
    formalMethodAuditOutputSchema,
    formalClaimRecalculationOutputSchema,
    bidirectionalIterationOutputSchema,
    bidirectionalReturnAssessmentOutputSchema,
    treatmentLandscapeOutputSchema
  ]
);

export const researchSemanticExecutionEnvelopeSchema = z.object({
  model_output: researchSemanticModelOutputSchema
}).passthrough();

export type ResearchSemanticModelOutput = z.output<
  typeof researchSemanticModelOutputSchema
>;

const moduleWorkPackageSchema = z.object({
  kind: z.literal("module_applicability"),
  package: z.object({
    package_version: z.literal("askrigor_module_applicability_v1"),
    state_digest: digest,
    unresolved_module_ids: z.array(z.enum(RESEARCH_MODULE_IDS)).min(1)
  }).strict()
}).strict();

const candidateWorkPackageSchema = z.object({
  kind: z.literal("candidate_screening"),
  package: candidateScreeningWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const formalScreeningWorkPackageSchema = z.object({
  kind: z.literal("formal_source_screening"),
  package: formalEvidenceScreeningWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const formalMethodAuditSemanticWorkPackageSchema = z.object({
  kind: z.literal("formal_method_audit"),
  package: formalMethodAuditWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const formalClaimRecalculationSemanticWorkPackageSchema = z.object({
  kind: z.literal("formal_claim_recalculation"),
  package: formalClaimRecalculationWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const bidirectionalIterationSemanticWorkPackageSchema = z.object({
  kind: z.literal("bidirectional_iteration"),
  package: bidirectionalIterationWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const bidirectionalReturnAssessmentSemanticWorkPackageSchema = z.object({
  kind: z.literal("bidirectional_return_assessment"),
  package: bidirectionalReturnAssessmentWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const treatmentLandscapeSemanticWorkPackageSchema = z.object({
  kind: z.literal("treatment_landscape"),
  package: treatmentLandscapeWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

export const researchSemanticWorkSchema = z.union([
  moduleWorkPackageSchema,
  candidateWorkPackageSchema,
  formalScreeningWorkPackageSchema,
  formalMethodAuditSemanticWorkPackageSchema,
  formalClaimRecalculationSemanticWorkPackageSchema,
  bidirectionalIterationSemanticWorkPackageSchema,
  bidirectionalReturnAssessmentSemanticWorkPackageSchema,
  treatmentLandscapeSemanticWorkPackageSchema
]);

export type ResearchSemanticWork = z.output<
  typeof researchSemanticWorkSchema
>;

export interface ResearchSemanticWorkPackage {
  session_id: string;
  state_digest: string;
  research_context?: string;
  semantic_work: ResearchSemanticWork;
}

export interface ResearchSemanticExecutor {
  execute(input: ResearchSemanticWorkPackage): Promise<unknown>;
}

export function assertResearchSemanticBinding(
  expected: {
    session_id: string;
    state_digest: string;
    semantic_work: ResearchSemanticWork;
  },
  output: ResearchSemanticModelOutput
): void {
  if (
    output.session_id !== expected.session_id ||
    output.state_digest !== expected.state_digest ||
    output.work_type !== expected.semantic_work.kind
  ) {
    throw new Error("Semantic result is bound to another work package");
  }
  const work = expected.semantic_work;
  if (
    output.work_type === "candidate_screening" &&
    (
      work.kind !== "candidate_screening" ||
      output.submission.discovery_digest !== work.package.discovery_digest
    )
  ) {
    throw new Error("Candidate result is bound to another discovery frontier");
  }
  if (
    output.work_type === "formal_source_screening" &&
    (
      work.kind !== "formal_source_screening" ||
      output.submission.formal_frontier_digest !== work.package.formal_frontier_digest
    )
  ) {
    throw new Error("Formal screening result is bound to another source frontier");
  }
  if (
    output.work_type === "formal_method_audit" &&
    (
      work.kind !== "formal_method_audit" ||
      output.source_id !== work.package.source_id ||
      output.audit_kind !== work.package.audit_kind ||
      output.submission.source_primary_identifier !==
        work.package.source_primary_identifier ||
      output.submission.source_content_sha256 !== work.package.source_content_sha256
    )
  ) {
    throw new Error("Method-audit result is bound to another source");
  }
  if (
    output.work_type === "formal_claim_recalculation" &&
    (
      work.kind !== "formal_claim_recalculation" ||
      output.source_id !== work.package.source_id ||
      output.submission.source_primary_identifier !==
        work.package.source_primary_identifier ||
      output.submission.source_content_sha256 !== work.package.source_content_sha256 ||
      output.submission.external_evidence_binding.external_receipt_payload_sha256 !==
        work.package.external_receipt_payload_sha256 ||
      output.submission.external_evidence_binding.bundle_hash !==
        work.package.external_bundle_hash ||
      output.submission.external_evidence_binding.study_identity_hash !==
        work.package.external_study_identity_hash
    )
  ) {
    throw new Error(
      "Claim-recalculation result is bound to another source or external audit"
    );
  }
  if (
    output.work_type === "bidirectional_iteration" &&
    (
      work.kind !== "bidirectional_iteration" ||
      output.submission.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.round_number !== work.package.round_number
    )
  ) {
    throw new Error("Bidirectional result is bound to another evidence frontier");
  }
  if (
    output.work_type === "bidirectional_return_assessment" &&
    (
      work.kind !== "bidirectional_return_assessment" ||
      output.submission.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.round_id !== work.package.round_id ||
      output.submission.transfer_id !== work.package.transfer_id
    )
  ) {
    throw new Error("Return assessment is bound to another search result");
  }
  if (
    output.work_type === "treatment_landscape" &&
    (
      work.kind !== "treatment_landscape" ||
      output.submission.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.attempt !== work.package.attempt
    )
  ) {
    throw new Error("Treatment result is bound to another evidence frontier");
  }
}
