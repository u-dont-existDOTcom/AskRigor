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
  videoEvidenceSubmissionSchema,
  videoEvidenceWorkPackageSchema
} from "./actions/research-bounded-evidence.js";
import {
  reportSynthesisSubmissionSchema,
  reportSynthesisWorkPackageSchema
} from "./actions/research-report-synthesis.js";
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

const videoEvidenceOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("video_evidence_synthesis"),
  submission: videoEvidenceSubmissionSchema
}).strict();

const reportSynthesisOutputSchema = z.object({
  ...modelOutputEnvelope,
  work_type: z.literal("report_synthesis"),
  submission: reportSynthesisSubmissionSchema
}).strict();

export const researchSemanticModelOutputSchema = z.discriminatedUnion(
  "work_type",
  [
    moduleOutputSchema,
    candidateOutputSchema,
    formalScreeningOutputSchema,
    formalMethodAuditOutputSchema,
    formalClaimRecalculationOutputSchema,
    videoEvidenceOutputSchema,
    bidirectionalIterationOutputSchema,
    bidirectionalReturnAssessmentOutputSchema,
    treatmentLandscapeOutputSchema,
    reportSynthesisOutputSchema
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

const videoEvidenceSemanticWorkPackageSchema = z.object({
  kind: z.literal("video_evidence_synthesis"),
  package: videoEvidenceWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

const reportSynthesisSemanticWorkPackageSchema = z.object({
  kind: z.literal("report_synthesis"),
  package: reportSynthesisWorkPackageSchema.extend({
    state_digest: digest
  }).strict()
}).strict();

export const researchSemanticWorkSchema = z.union([
  moduleWorkPackageSchema,
  candidateWorkPackageSchema,
  formalScreeningWorkPackageSchema,
  formalMethodAuditSemanticWorkPackageSchema,
  formalClaimRecalculationSemanticWorkPackageSchema,
  videoEvidenceSemanticWorkPackageSchema,
  bidirectionalIterationSemanticWorkPackageSchema,
  bidirectionalReturnAssessmentSemanticWorkPackageSchema,
  treatmentLandscapeSemanticWorkPackageSchema,
  reportSynthesisSemanticWorkPackageSchema
]);

export type ResearchSemanticWork = z.output<
  typeof researchSemanticWorkSchema
>;

export interface ResearchSemanticWorkPackage {
  session_id: string;
  state_digest: string;
  research_context?: string;
  evidence_context?: unknown;
  response_contract?: unknown;
  semantic_work: ResearchSemanticWork;
}

export interface ResearchSemanticExecutor {
  execute(input: ResearchSemanticWorkPackage): Promise<unknown>;
}

const BASE_SEMANTIC_WORKER_INSTRUCTION =
  "Use only this exact package. Return one JSON object matching response_contract. Do not claim workflow completion.";

/** Task-specific guidance for a no-tools worker operating on one signed package. */
export function researchSemanticWorkerInstruction(
  kind: ResearchSemanticWork["kind"]
): string {
  if (kind !== "candidate_screening") return BASE_SEMANTIC_WORKER_INSTRUCTION;
  return [
    BASE_SEMANTIC_WORKER_INSTRUCTION,
    "Candidate screening must return exactly one decision for every candidate in semantic_work.package.candidates, preserving every packaged video_id exactly once, including nonmaterial, duplicate, and unselected candidates; never return only selected candidates.",
    "For MATERIAL candidates whose program_description_status is not NOT_DESCRIBED, use program_signature as the exact redundancy key: each shared signature has exactly one DISTINCT decision and every other candidate with that signature is DUPLICATE and names that distinct candidate's video_id; do not infer duplicates merely from similar titles, channels, or treatment themes.",
    "Set duplicate_of_video_id if and only if redundancy is DUPLICATE. Set selection_status to SELECTED only when materiality is MATERIAL and redundancy is DISTINCT."
  ].join(" ");
}

/** Exact output JSON Schema supplied internally to a no-tools semantic worker. */
export function researchSemanticResponseContract(
  kind: ResearchSemanticWork["kind"]
): unknown {
  const schema = {
    module_applicability: moduleOutputSchema,
    candidate_screening: candidateOutputSchema,
    formal_source_screening: formalScreeningOutputSchema,
    formal_method_audit: formalMethodAuditOutputSchema,
    formal_claim_recalculation: formalClaimRecalculationOutputSchema,
    video_evidence_synthesis: videoEvidenceOutputSchema,
    bidirectional_iteration: bidirectionalIterationOutputSchema,
    bidirectional_return_assessment: bidirectionalReturnAssessmentOutputSchema,
    treatment_landscape: treatmentLandscapeOutputSchema,
    report_synthesis: reportSynthesisOutputSchema
  } satisfies Record<ResearchSemanticWork["kind"], z.ZodType>;
  return z.toJSONSchema(schema[kind]);
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
    output.work_type === "video_evidence_synthesis" &&
    (
      work.kind !== "video_evidence_synthesis" ||
      output.submission.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.video_id !== work.package.video_id
    )
  ) {
    throw new Error("Video-evidence result is bound to another receipt frontier");
  }
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
  if (
    output.work_type === "report_synthesis" &&
    (
      work.kind !== "report_synthesis" ||
      output.submission.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.packet.evidence_basis_digest !== work.package.evidence_basis_digest ||
      output.submission.packet.report_scope !== work.package.report_scope
    )
  ) {
    throw new Error("Reader report is bound to another evidence frontier");
  }
}
