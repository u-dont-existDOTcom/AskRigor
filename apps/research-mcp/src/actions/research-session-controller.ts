import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ProtocolManifest } from "@askrigor/protocol";
import type {
  GeminiYoutubeCandidatePacket,
  GeminiYoutubeCandidateValidationReceipt
} from "@askrigor/sources";
import { z } from "zod";

import type { YoutubeCommunitySurveyOutput } from "../youtube-community-survey.js";
import {
  bidirectionalIterationDiagnosticsSchema,
  bidirectionalIterationWorkPackageSchema,
  bidirectionalReturnAssessmentWorkPackageSchema,
  bidirectionalEvidenceBasisDigest,
  createBidirectionalIterationWorkPackage,
  createBidirectionalReturnAssessmentWorkPackages,
  deriveBidirectionalIterationDiagnostics,
  deriveBidirectionalIterationStatus,
  executeBidirectionalReturnSearch,
  ingestBidirectionalIterationSubmission,
  ingestBidirectionalReturnAssessment,
  initialResearchBidirectionalIterationState,
  reconcileBidirectionalIterationAfterEphemeralLoss,
  researchBidirectionalIterationStateSchema,
  type BidirectionalCommentSearchExecutor,
  type BidirectionalIterationSubmission,
  type BidirectionalReturnAssessmentSubmission,
  type ResearchBidirectionalIterationState
} from "./research-bidirectional-iteration.js";
import {
  assertCandidateScreeningComplete,
  candidateScreeningResultDigest,
  candidateScreeningWorkPackageSchema,
  candidateDiscoveryDiagnosticsSchema,
  candidateDiscoveryReadyForScreening,
  createCandidateScreeningWorkPackage,
  deriveCandidateDiscoveryDiagnostics,
  ingestCandidateScreeningSubmission,
  ingestNativeYoutubeSurvey,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  markExternalScoutFrontierBoundary,
  researchCandidateDiscoveryStateSchema,
  type CandidateScreeningSubmission
} from "./research-candidate-frontier.js";
import {
  assertVideoDepthMatchesSelection,
  deriveResearchVideoDepthDiagnostics,
  deriveResearchVideoDepthWorkPackages,
  deriveVideoDepthOperationStatus,
  executeDiscussionDepthChain,
  executeTranscriptDepthChain,
  ingestDiscussionActionOutput,
  ingestTranscriptActionOutput,
  initialResearchVideoDepthState,
  initializeResearchVideoDepth,
  reconcileVideoDepthAfterEphemeralLoss,
  researchVideoDepthDiagnosticsSchema,
  researchVideoDepthStateSchema,
  researchVideoDepthWorkPackageSchema,
  restartResearchVideoDepthChain,
  type ResearchVideoDepthExecutors,
  type YoutubeDiscussionActionOutput,
  type YoutubeTranscriptActionOutput
} from "./research-video-depth-controller.js";
import type { TreatmentLandscapeCoverageOutput } from "./treatment-landscape-coverage-route.js";
import {
  createVideoEvidenceWorkPackage,
  deriveVideoEvidenceStatus,
  ingestVideoEvidenceSubmission,
  initialResearchBoundedEvidenceState,
  initializeResearchBoundedEvidence,
  nextVideoEvidenceId,
  reconcileVideoEvidenceBoundaries,
  researchBoundedEvidenceStateSchema,
  videoEvidenceWorkPackageSchema,
  type ResearchBoundedEvidenceState,
  type VideoEvidenceMaterial,
  type VideoEvidenceSubmission
} from "./research-bounded-evidence.js";
import {
  createReportSynthesisWorkPackage,
  currentResearchReport,
  deriveReportSynthesisStatus,
  ingestReportSynthesisSubmission,
  initialResearchReportState,
  reportEvidenceBasisDigest,
  readerReportPacketSchema,
  reportSynthesisWorkPackageSchema,
  researchReportStateSchema,
  type ReaderReportPacket,
  type ReportSynthesisSubmission,
  type ResearchReportState
} from "./research-report-synthesis.js";
import {
  createFormalEvidenceScreeningWorkPackage,
  createFormalClaimRecalculationWorkPackages,
  createFormalExternalEvidenceWorkPackages,
  createFormalMethodAuditWorkPackages,
  deriveFormalEvidenceDiagnostics,
  deriveFormalEvidenceOperationStatus,
  executeResearchFormalSearch,
  executeResearchSourceExternalEvidence,
  executeResearchSourceFullTextChain,
  formalEvidenceDiagnosticsSchema,
  formalClaimRecalculationWorkPackageSchema,
  formalExternalEvidenceWorkPackageSchema,
  formalEvidenceScreeningComplete,
  formalEvidenceScreeningWorkPackageSchema,
  formalMethodAuditWorkPackageSchema,
  ingestFormalEvidenceScreeningSubmission,
  initialResearchFormalEvidenceState,
  initializeResearchFormalEvidence,
  reconcileFormalEvidenceAfterEphemeralLoss,
  recalculateResearchSourceClaimCapability,
  reconcileFormalEvidenceLinkedWork,
  recordFormalMethodAudit,
  researchFormalEvidenceStateSchema,
  type FormalEvidenceScreeningSubmission,
  type FormalSearchExecutors,
  type ResearchFormalEvidenceState
} from "./research-formal-evidence.js";
import type { OpenFullTextExecutor } from "./open-full-text-route.js";
import type {
  StudyExternalEvidenceCoordinator
} from "./study-external-evidence.js";
import {
  createTreatmentLandscapeWorkPackage,
  currentTreatmentLandscapeAssessment,
  deriveTreatmentFinalizationDiagnostics,
  deriveTreatmentFinalizationStatus,
  ingestTreatmentLandscapeSubmission,
  initialResearchTreatmentFinalizationState,
  researchTreatmentFinalizationStateSchema,
  treatmentEvidenceBasisDigest,
  treatmentFinalizationDiagnosticsSchema,
  treatmentLandscapeWorkPackageSchema,
  type ResearchTreatmentFinalizationState,
  type TreatmentLandscapeSubmission
} from "./research-treatment-finalization.js";

export const RESEARCH_MODULE_IDS = [
  "HRP",
  "DIRECT_HUMAN",
  "EXTENDED_GREY",
  "FORUM_SIGNAL",
  "BIDIRECTIONAL_ITERATION",
  "FINAL_COMPLETION_AUDIT"
] as const;

export const RESEARCH_OPERATION_IDS = [
  "automated_video_scout",
  "native_video_discovery",
  "candidate_screening",
  "transcript_acquisition",
  "community_discussion_audit",
  "video_evidence_synthesis",
  "formal_evidence_search",
  "accessible_full_text_acquisition",
  "study_method_audit",
  "external_study_evidence_audit",
  "linked_replication_and_review_audit",
  "claim_capability_recalculation",
  "bidirectional_evidence_return",
  "treatment_landscape_finalization",
  "report_synthesis",
  "final_completion_audit"
] as const;

export const researchOutputBoundarySchema = z.enum([
  "CONTINUE_RESEARCH",
  "BOUNDED_NONRANKING_ONLY",
  "FINALIZATION_ALLOWED"
]);

export type ResearchOutputBoundary = z.output<
  typeof researchOutputBoundarySchema
>;

const protocolIdentitySchema = z.object({
  protocol: z.enum(["universal", "hrp"]),
  name: z.string().min(1).max(200),
  version: z.string().min(1).max(100),
  revision_date: z.string().min(1).max(100),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

const protocolTupleSchema = z.tuple([
  protocolIdentitySchema.extend({ protocol: z.literal("universal") }).strict(),
  protocolIdentitySchema.extend({ protocol: z.literal("hrp") }).strict()
]);

const moduleStateSchema = z.object({
  applicability: z.enum(["REQUIRED", "NOT_REQUIRED", "UNRESOLVED"]),
  execution_status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED",
    "NOT_APPLICABLE"
  ]),
  authority: z.enum([
    "SERVER_RESEARCH_SESSION",
    "SERVER_ROUTER",
    "SERVER_EVIDENCE",
    "PENDING_SERVER_ROUTER"
  ])
}).strict().superRefine((value, context) => {
  if (
    value.applicability === "NOT_REQUIRED" &&
    value.execution_status !== "NOT_APPLICABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A not-required module must be not applicable"
    });
  }
  if (
    value.applicability === "UNRESOLVED" &&
    value.execution_status !== "NOT_STARTED"
  ) {
    context.addIssue({
      code: "custom",
      message: "An unresolved module cannot claim execution progress"
    });
  }
  if (
    value.applicability === "REQUIRED" &&
    value.execution_status === "NOT_APPLICABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A required module cannot be not applicable"
    });
  }
});

const operationBoundarySchema = z.object({
  classification: z.enum(["RETRYABLE", "TERMINAL_NONRETRYABLE"]),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
  summary: z.string().min(1).max(1_000)
}).strict();

const operationStateSchema = z.object({
  status: z.enum([
    "NOT_STARTED",
    "IN_PROGRESS",
    "COMPLETE",
    "BLOCKED_RETRYABLE",
    "BLOCKED_TERMINAL"
  ]),
  boundary: operationBoundarySchema.optional()
}).strict().superRefine((value, context) => {
  const needsBoundary = value.status === "BLOCKED_RETRYABLE" ||
    value.status === "BLOCKED_TERMINAL";
  if (needsBoundary !== (value.boundary !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "Blocked operation state and access boundary must agree"
    });
    return;
  }
  if (
    value.status === "BLOCKED_RETRYABLE" &&
    value.boundary?.classification !== "RETRYABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Retryable operation state needs a retryable boundary"
    });
  }
  if (
    value.status === "BLOCKED_TERMINAL" &&
    value.boundary?.classification !== "TERMINAL_NONRETRYABLE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Terminal operation state needs a terminal boundary"
    });
  }
});

const moduleStatesSchema = z.object({
  HRP: moduleStateSchema,
  DIRECT_HUMAN: moduleStateSchema,
  EXTENDED_GREY: moduleStateSchema,
  FORUM_SIGNAL: moduleStateSchema,
  BIDIRECTIONAL_ITERATION: moduleStateSchema,
  FINAL_COMPLETION_AUDIT: moduleStateSchema
}).strict();

const operationStatesSchema = z.object({
  automated_video_scout: operationStateSchema,
  native_video_discovery: operationStateSchema,
  candidate_screening: operationStateSchema,
  transcript_acquisition: operationStateSchema,
  community_discussion_audit: operationStateSchema,
  video_evidence_synthesis: operationStateSchema,
  formal_evidence_search: operationStateSchema,
  accessible_full_text_acquisition: operationStateSchema,
  study_method_audit: operationStateSchema,
  external_study_evidence_audit: operationStateSchema,
  linked_replication_and_review_audit: operationStateSchema,
  claim_capability_recalculation: operationStateSchema,
  bidirectional_evidence_return: operationStateSchema,
  treatment_landscape_finalization: operationStateSchema,
  report_synthesis: operationStateSchema,
  final_completion_audit: operationStateSchema
}).strict();

const scoutStateSchema = z.object({
  status: z.enum(["NOT_STARTED", "COMPLETE", "BLOCKED"]),
  provider_response_id: z.string().max(500).optional(),
  source_packet_version: z.string().max(20).optional(),
  validation_status: z.enum(["accepted", "partial", "rejected", "blocked"]).optional(),
  candidate_count: z.number().int().nonnegative().max(16),
  validated_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  unresolved_candidate_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/u)).max(16),
  access_boundary: operationBoundarySchema.optional()
}).strict();

const finalCompletionAuditStateSchema = z.object({
  audit_version: z.literal("askrigor_final_completion_audit_v1"),
  basis_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  status: z.enum(["PASS", "FAIL"]),
  checks: z.array(z.object({
    check_id: z.string().regex(/^[A-Z][A-Z0-9_]{2,79}$/u),
    status: z.enum(["PASS", "FAIL"]),
    summary: z.string().min(1).max(1_000)
  }).strict()).min(1).max(100)
}).strict().optional();

export const researchSessionStateSchema = z.object({
  state_version: z.literal("4.0"),
  research_target: z.string().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"]),
  protocol_binding: z.object({
    expected: protocolTupleSchema,
    currency: z.enum(["CURRENT", "DRIFTED"]),
    observed_current: protocolTupleSchema.optional()
  }).strict(),
  modules: moduleStatesSchema,
  operations: operationStatesSchema,
  scout: scoutStateSchema,
  candidate_discovery: researchCandidateDiscoveryStateSchema,
  video_depth: researchVideoDepthStateSchema,
  bounded_evidence: researchBoundedEvidenceStateSchema,
  formal_evidence: researchFormalEvidenceStateSchema,
  bidirectional_iteration: researchBidirectionalIterationStateSchema,
  treatment_finalization: researchTreatmentFinalizationStateSchema,
  report: researchReportStateSchema,
  final_completion_audit: finalCompletionAuditStateSchema
}).strict().superRefine((state, context) => {
  if (
    state.protocol_binding.currency === "DRIFTED" &&
    state.protocol_binding.observed_current === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Protocol drift must preserve the observed current identities"
    });
  }
  if (
    state.protocol_binding.currency === "CURRENT" &&
    state.protocol_binding.observed_current !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Current protocol state cannot retain a drift observation"
    });
  }

  const scoutOperation = state.operations.automated_video_scout;
  if (
    state.scout.status === "COMPLETE" && scoutOperation.status !== "COMPLETE"
  ) {
    context.addIssue({
      code: "custom",
      message: "A complete scout needs a complete scout operation"
    });
  }
  if (
    state.scout.status === "BLOCKED" &&
    !["BLOCKED_RETRYABLE", "BLOCKED_TERMINAL"].includes(scoutOperation.status)
  ) {
    context.addIssue({
      code: "custom",
      message: "A blocked scout needs a blocked scout operation"
    });
  }
  if (state.scout.status === "NOT_STARTED" && scoutOperation.status !== "NOT_STARTED") {
    context.addIssue({
      code: "custom",
      message: "An unstarted scout needs an unstarted scout operation"
    });
  }
  if (
    state.scout.access_boundary === undefined !==
      (scoutOperation.boundary === undefined)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scout and operation boundaries must be projected from the same receipt"
    });
  }
  if (
    state.scout.access_boundary !== undefined &&
    JSON.stringify(state.scout.access_boundary) !== JSON.stringify(scoutOperation.boundary)
  ) {
    context.addIssue({
      code: "custom",
      message: "Scout and operation boundaries must match"
    });
  }

  const candidateIds = [
    ...state.scout.validated_candidate_ids,
    ...state.scout.unresolved_candidate_ids
  ];
  if (new Set(candidateIds).size !== candidateIds.length) {
    context.addIssue({
      code: "custom",
      message: "Scout candidate projections cannot overlap or duplicate"
    });
  }
  if (candidateIds.length > state.scout.candidate_count) {
    context.addIssue({
      code: "custom",
      message: "Scout candidate count cannot be smaller than projected identities"
    });
  }
  if (
    state.scout.status === "COMPLETE" &&
    state.candidate_discovery.external_scout.status !== "COMPLETE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Scout completion requires a reconciled external candidate frontier"
    });
  }
  if (
    state.operations.native_video_discovery.status === "COMPLETE" &&
    state.candidate_discovery.native_youtube.status !== "COMPLETE"
  ) {
    context.addIssue({
      code: "custom",
      message: "Native discovery completion requires its server-derived frontier"
    });
  }
  if (state.operations.candidate_screening.status === "COMPLETE") {
    try {
      assertCandidateScreeningComplete(state.candidate_discovery);
      assertVideoDepthMatchesSelection(state.video_depth, state.candidate_discovery);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error
          ? error.message
          : "Candidate screening completion is invalid"
      });
    }
    for (const capability of [
      "transcript_acquisition",
      "community_discussion_audit"
    ] as const) {
      const expectedOperation = videoDepthOperationProjection(
        state.video_depth,
        capability
      );
      if (
        JSON.stringify(state.operations[capability]) !==
        JSON.stringify(expectedOperation)
      ) {
        context.addIssue({
          code: "custom",
          message: `${capability} operation must be derived exactly from per-video receipt state`
        });
      }
    }
    const expectedVideoEvidenceOperation = videoEvidenceOperationProjection(
      state.bounded_evidence,
      state.video_depth
    );
    if (
      state.bounded_evidence.selection_digest !==
        state.video_depth.selection_digest ||
      canonicalJson([...state.bounded_evidence.videos.map(({ video_id }) =>
        video_id
      )].sort()) !== canonicalJson([...state.video_depth.selected_video_ids].sort())
    ) {
      context.addIssue({
        code: "custom",
        message: "Bounded selected-video evidence must match the exact candidate selection frontier"
      });
    }
    if (
      JSON.stringify(state.operations.video_evidence_synthesis) !==
      JSON.stringify(expectedVideoEvidenceOperation)
    ) {
      context.addIssue({
        code: "custom",
        message: "video_evidence_synthesis operation must be derived exactly from selected-video receipt-bound findings"
      });
    }
  } else if (
    state.video_depth.selected_video_ids.length > 0 ||
    state.video_depth.selection_digest !== undefined ||
    state.video_depth.transcripts.length > 0 ||
    state.video_depth.discussions.length > 0 ||
    state.bounded_evidence.videos.length > 0 ||
    state.bounded_evidence.selection_digest !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Video depth work cannot precede completed candidate screening"
    });
  }

  if (state.operations.candidate_screening.status === "COMPLETE") {
    if (
      state.formal_evidence.candidate_screening_digest === undefined ||
      state.formal_evidence.candidate_screening_digest !==
        candidateScreeningResultDigest(state.candidate_discovery)
    ) {
      context.addIssue({
        code: "custom",
        message: "Formal evidence must be derived from the exact completed candidate screening frontier"
      });
    }
    for (const capability of [
      "formal_evidence_search",
      "accessible_full_text_acquisition",
      "study_method_audit",
      "external_study_evidence_audit",
      "linked_replication_and_review_audit",
      "claim_capability_recalculation"
    ] as const) {
      const expected = formalEvidenceOperationProjection(
        state.formal_evidence,
        capability
      );
      if (JSON.stringify(state.operations[capability]) !== JSON.stringify(expected)) {
        context.addIssue({
          code: "custom",
          message: `${capability} operation must be derived exactly from per-source formal evidence state`
        });
      }
    }
  } else if (
    state.formal_evidence.hypotheses.length > 0 ||
    state.formal_evidence.sources.length > 0 ||
    state.formal_evidence.candidate_screening_digest !== undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Formal evidence cannot precede completed candidate screening"
    });
  }

  const bidirectionalOperation = bidirectionalOperationProjection(state);
  if (
    JSON.stringify(state.operations.bidirectional_evidence_return) !==
    JSON.stringify(bidirectionalOperation)
  ) {
    context.addIssue({
      code: "custom",
      message: "bidirectional_evidence_return operation must be derived exactly from source-bound iteration state"
    });
  }
  for (const round of state.bidirectional_iteration.rounds) {
    for (const transfer of round.community_to_formal_transfers) {
      const hypothesis = state.formal_evidence.hypotheses.find(({ hypothesis_id }) =>
        hypothesis_id === transfer.formal_hypothesis_id
      );
      if (
        hypothesis === undefined ||
        hypothesis.program_signature !== transfer.program_signature
      ) {
        context.addIssue({
          code: "custom",
          message: "Community-to-formal transfer lacks its exact server-owned formal hypothesis"
        });
      }
    }
  }
  const treatmentOperation = treatmentFinalizationOperationProjection(state);
  if (
    JSON.stringify(state.operations.treatment_landscape_finalization) !==
    JSON.stringify(treatmentOperation)
  ) {
    context.addIssue({
      code: "custom",
      message: "treatment_landscape_finalization operation must be derived exactly from the current session-owned coverage assessment"
    });
  }
  const reportOperation = reportSynthesisOperationProjection(state);
  if (
    JSON.stringify(state.operations.report_synthesis) !==
    JSON.stringify(reportOperation)
  ) {
    context.addIssue({
      code: "custom",
      message: "report_synthesis operation must be derived exactly from the current bounded evidence and treatment frontier"
    });
  }
  const finalAuditOperation = finalCompletionAuditOperationProjection(state);
  if (
    JSON.stringify(state.operations.final_completion_audit) !==
    JSON.stringify(finalAuditOperation)
  ) {
    context.addIssue({
      code: "custom",
      message: "final_completion_audit operation must be derived exactly from its current controller audit"
    });
  }
  if (state.final_completion_audit !== undefined) {
    const expectedChecks = deriveFinalCompletionChecks(state);
    const expectedStatus = expectedChecks.every(({ status }) => status === "PASS")
      ? "PASS"
      : "FAIL";
    if (
      state.final_completion_audit.basis_digest !== finalCompletionAuditBasisDigest(state) ||
      state.final_completion_audit.status !== expectedStatus ||
      JSON.stringify(state.final_completion_audit.checks) !== JSON.stringify(expectedChecks)
    ) {
      context.addIssue({
        code: "custom",
        message: "Final completion audit must match the current server-derived checks exactly"
      });
    }
  }
  const finalModuleShouldBeComplete = finalAuditOperation.status === "COMPLETE";
  if (
    state.modules.FINAL_COMPLETION_AUDIT.applicability === "REQUIRED" &&
    (state.modules.FINAL_COMPLETION_AUDIT.execution_status === "COMPLETE") !==
      finalModuleShouldBeComplete
  ) {
    context.addIssue({
      code: "custom",
      message: "FINAL_COMPLETION_AUDIT module status must match the current server audit"
    });
  }
});

export type ResearchSessionState = z.output<typeof researchSessionStateSchema>;
export type ResearchModuleId = typeof RESEARCH_MODULE_IDS[number];
export type ResearchOperationId = typeof RESEARCH_OPERATION_IDS[number];

export const researchNextCapabilitySchema = z.enum([
  "route_module_applicability",
  "automated_video_scout",
  "native_video_discovery",
  "resolve_candidate_identities",
  "candidate_screening",
  "transcript_acquisition",
  "community_discussion_audit",
  "video_evidence_synthesis",
  "formal_evidence_search",
  "accessible_full_text_acquisition",
  "study_method_audit",
  "external_study_evidence_audit",
  "linked_replication_and_review_audit",
  "claim_capability_recalculation",
  "bidirectional_evidence_return",
  "treatment_landscape_finalization",
  "report_synthesis",
  "final_completion_audit",
  "restart_under_current_protocols"
]);

export type ResearchNextCapability = z.output<
  typeof researchNextCapabilitySchema
>;

export const researchFinalizationLimitationSchema = z.object({
  limitation_id: z.string().regex(/^[a-f0-9]{64}$/u),
  scope: z.enum([
    "provider_coverage",
    "publication_integrity",
    "linked_source",
    "claim_capability",
    "treatment_landscape",
    "source_access"
  ]),
  source_id: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  provider: z.enum([
    "crossref",
    "forrt",
    "retraction_watch",
    "pubpeer",
    "epistemonikos",
    "scite"
  ]).optional(),
  plain_language: z.string().trim().min(1).max(4_000)
}).strict();

export type ResearchFinalizationLimitation = z.output<
  typeof researchFinalizationLimitationSchema
>;

export const finalizationPermitSchema = z.object({
  permit_version: z.literal("askrigor_finalization_permit_v2"),
  artifact_kind: z.enum([
    "COMPARATIVE_FINALIZATION_PERMIT",
    "BOUNDED_NONRANKING_REPORT_PERMIT"
  ]),
  execution_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  output_boundary: z.enum(["FINALIZATION_ALLOWED", "BOUNDED_NONRANKING_ONLY"]),
  protocol_identities: protocolTupleSchema,
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  authorization_basis_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  limitations_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  report_digest: z.string().regex(/^[a-f0-9]{64}$/u),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  key_id: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/u),
  domain: z.literal("askrigor.research.finalization"),
  permit_payload_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/u)
}).strict().superRefine((permit, context) => {
  const expectedKind = permit.output_boundary === "FINALIZATION_ALLOWED"
    ? "COMPARATIVE_FINALIZATION_PERMIT"
    : "BOUNDED_NONRANKING_REPORT_PERMIT";
  if (permit.artifact_kind !== expectedKind) {
    context.addIssue({
      code: "custom",
      message: "Finalization artifact kind must match its exact output boundary"
    });
  }
});

export type FinalizationPermit = z.output<typeof finalizationPermitSchema>;

const finalizationDenialReasonSchema = z.enum([
  "PROTOCOL_DRIFT",
  "MODULE_APPLICABILITY_UNRESOLVED",
  "REQUIRED_MODULE_INCOMPLETE",
  "REQUIRED_OPERATION_INCOMPLETE",
  "RETRYABLE_WORK_REMAINS",
  "TERMINAL_BOUNDARY_LIMITS_OUTPUT",
  "FINALIZATION_SIGNING_NOT_CONFIGURED"
]);

export const researchSessionViewSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  execution_status: z.enum([
    "IN_PROGRESS",
    "BLOCKED_RETRYABLE",
    "BLOCKED_TERMINAL",
    "BOUNDED",
    "READY_TO_FINALIZE",
    "PROTOCOL_DRIFT"
  ]),
  output_boundary: researchOutputBoundarySchema,
  finalization_readiness: researchOutputBoundarySchema,
  protocol_binding: z.object({
    expected: protocolTupleSchema,
    currency: z.enum(["CURRENT", "DRIFTED"]),
    observed_current: protocolTupleSchema.optional()
  }).strict(),
  modules: moduleStatesSchema,
  operations: operationStatesSchema,
  scout: z.object({
    status: z.enum(["NOT_STARTED", "COMPLETE", "BLOCKED"]),
    candidate_count: z.number().int().nonnegative(),
    validated_candidate_count: z.number().int().nonnegative(),
    unresolved_candidate_count: z.number().int().nonnegative(),
    access_boundary: operationBoundarySchema.optional()
  }).strict(),
  candidate_discovery: candidateDiscoveryDiagnosticsSchema,
  candidate_screening_work_package: candidateScreeningWorkPackageSchema.nullable(),
  video_depth: researchVideoDepthDiagnosticsSchema,
  next_video_work_packages: z.array(researchVideoDepthWorkPackageSchema),
  next_video_evidence_work_package: videoEvidenceWorkPackageSchema.nullable(),
  video_evidence: z.object({
    selected: z.number().int().nonnegative(),
    complete: z.number().int().nonnegative(),
    bounded: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative()
  }).strict(),
  formal_evidence: formalEvidenceDiagnosticsSchema,
  formal_source_screening_work_package:
    formalEvidenceScreeningWorkPackageSchema.nullable(),
  formal_method_audit_work_packages: z.array(formalMethodAuditWorkPackageSchema),
  formal_external_evidence_work_packages:
    z.array(formalExternalEvidenceWorkPackageSchema),
  formal_claim_recalculation_work_packages:
    z.array(formalClaimRecalculationWorkPackageSchema),
  bidirectional_iteration: bidirectionalIterationDiagnosticsSchema,
  bidirectional_iteration_work_package:
    bidirectionalIterationWorkPackageSchema.nullable(),
  bidirectional_return_assessment_work_packages:
    z.array(bidirectionalReturnAssessmentWorkPackageSchema),
  treatment_finalization: treatmentFinalizationDiagnosticsSchema,
  treatment_landscape_work_package: treatmentLandscapeWorkPackageSchema.nullable(),
  report_synthesis_work_package: reportSynthesisWorkPackageSchema.nullable(),
  report_digest: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  final_completion_audit: z.object({
    status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETE"]),
    basis_digest: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    blockers: z.array(z.string().min(1).max(1_000))
  }).strict(),
  required_next_capabilities: z.array(researchNextCapabilitySchema),
  finalization_permit: z.null()
}).strict();

const finalizationDeniedDecisionSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  authorization: z.literal("DENIED"),
  output_boundary: researchOutputBoundarySchema,
  finalization_permit: z.null(),
  denial_reasons: z.array(finalizationDenialReasonSchema).min(1),
  required_next_capabilities: z.array(researchNextCapabilitySchema),
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

const authorizedReaderFacingSchema = z.object({
  permitted_scope: z.enum([
    "comparative_synthesis",
    "bounded_nonranking_report"
  ]),
  limitations: z.array(researchFinalizationLimitationSchema).max(4_000),
  report: readerReportPacketSchema
}).strict();

const finalizationAuthorizedDecisionSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  authorization: z.literal("AUTHORIZED"),
  output_boundary: z.literal("FINALIZATION_ALLOWED"),
  finalization_permit: finalizationPermitSchema,
  reader_facing: authorizedReaderFacingSchema.extend({
    permitted_scope: z.literal("comparative_synthesis")
  }).strict(),
  required_next_capabilities: z.tuple([]),
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

const finalizationBoundedDecisionSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u),
  authorization: z.literal("BOUNDED"),
  output_boundary: z.literal("BOUNDED_NONRANKING_ONLY"),
  finalization_permit: finalizationPermitSchema,
  reader_facing: authorizedReaderFacingSchema.extend({
    permitted_scope: z.literal("bounded_nonranking_report")
  }).strict(),
  required_next_capabilities: z.tuple([]),
  state_digest: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();

export const finalizationDecisionSchema = z.discriminatedUnion("authorization", [
  finalizationDeniedDecisionSchema,
  finalizationAuthorizedDecisionSchema,
  finalizationBoundedDecisionSchema
]).superRefine((decision, context) => {
  if (decision.authorization === "DENIED") return;
  if (
    decision.authorization === "AUTHORIZED" &&
    decision.finalization_permit.output_boundary !== "FINALIZATION_ALLOWED"
  ) {
    context.addIssue({
      code: "custom",
      message: "Authorized synthesis requires an exact comparative finalization permit"
    });
  }
  if (
    decision.authorization === "BOUNDED" &&
    decision.finalization_permit.output_boundary !== "BOUNDED_NONRANKING_ONLY"
  ) {
    context.addIssue({
      code: "custom",
      message: "Bounded output requires an exact bounded-nonranking permit"
    });
  }
  if (
    decision.finalization_permit.execution_id !== decision.session_id ||
    decision.finalization_permit.output_boundary !== decision.output_boundary ||
    decision.finalization_permit.state_digest !== decision.state_digest
  ) {
    context.addIssue({
      code: "custom",
      message: "Finalization decision and permit must bind the same execution, state, and boundary"
    });
  }
  if (
    decision.finalization_permit.limitations_digest !==
      finalizationLimitationsDigest(decision.reader_facing.limitations)
  ) {
    context.addIssue({
      code: "custom",
      message: "Reader-facing limitations must match the exact permit-bound limitation set"
    });
  }
  if (
    decision.finalization_permit.report_digest !==
      sha256(canonicalJson(decision.reader_facing.report))
  ) {
    context.addIssue({
      code: "custom",
      message: "Reader-facing report must match the exact permit-bound report digest"
    });
  }
  if (
    decision.reader_facing.report.report_scope !==
      decision.reader_facing.permitted_scope
  ) {
    context.addIssue({
      code: "custom",
      message: "Reader-facing report scope must match the exact permitted scope"
    });
  }
});

export type ResearchFinalizationDecision = z.output<
  typeof finalizationDecisionSchema
>;

export interface ResearchFinalizationPermitOptions {
  signingSecret?: string;
  keyId?: string;
  now?: () => Date;
  ttlMs?: number;
}

export interface ResearchFinalizationPermitVerification {
  signingSecret: string;
  keyId: string;
  now?: () => Date;
}

export interface ResearchSessionStartInput {
  research_target: string;
  diagnosis_status: "diagnosis_not_specified" | "user_supplied_diagnosis";
}

export interface AutomatedScoutCompletion {
  providerResponseId: string;
  packet: GeminiYoutubeCandidatePacket;
  receipt: GeminiYoutubeCandidateValidationReceipt;
}

export function protocolBindingsFromManifests(
  universal: ProtocolManifest,
  hrp: ProtocolManifest
): ResearchSessionState["protocol_binding"]["expected"] {
  return protocolTupleSchema.parse([
    protocolIdentity("universal", universal),
    protocolIdentity("hrp", hrp)
  ]);
}

export function createInitialResearchSessionState(
  input: ResearchSessionStartInput,
  protocols: ResearchSessionState["protocol_binding"]["expected"]
): ResearchSessionState {
  const notStarted = (): ResearchSessionState["operations"][ResearchOperationId] => ({
    status: "NOT_STARTED"
  });
  const unresolvedModule = (): ResearchSessionState["modules"][ResearchModuleId] => ({
    applicability: "UNRESOLVED",
    execution_status: "NOT_STARTED",
    authority: "PENDING_SERVER_ROUTER"
  });

  return parseProjectedResearchSessionState({
    state_version: "4.0",
    research_target: input.research_target,
    diagnosis_status: input.diagnosis_status,
    protocol_binding: {
      expected: protocols,
      currency: "CURRENT"
    },
    modules: {
      HRP: {
        applicability: "REQUIRED",
        execution_status: "IN_PROGRESS",
        authority: "SERVER_RESEARCH_SESSION"
      },
      DIRECT_HUMAN: unresolvedModule(),
      EXTENDED_GREY: unresolvedModule(),
      FORUM_SIGNAL: unresolvedModule(),
      BIDIRECTIONAL_ITERATION: unresolvedModule(),
      FINAL_COMPLETION_AUDIT: {
        applicability: "REQUIRED",
        execution_status: "NOT_STARTED",
        authority: "SERVER_RESEARCH_SESSION"
      }
    },
    operations: {
      automated_video_scout: notStarted(),
      native_video_discovery: notStarted(),
      candidate_screening: notStarted(),
      transcript_acquisition: notStarted(),
      community_discussion_audit: notStarted(),
      video_evidence_synthesis: notStarted(),
      formal_evidence_search: notStarted(),
      accessible_full_text_acquisition: notStarted(),
      study_method_audit: notStarted(),
      external_study_evidence_audit: notStarted(),
      linked_replication_and_review_audit: notStarted(),
      claim_capability_recalculation: notStarted(),
      bidirectional_evidence_return: notStarted(),
      treatment_landscape_finalization: notStarted(),
      report_synthesis: notStarted(),
      final_completion_audit: notStarted()
    },
    scout: {
      status: "NOT_STARTED",
      candidate_count: 0,
      validated_candidate_ids: [],
      unresolved_candidate_ids: []
    },
    candidate_discovery: initialResearchCandidateDiscoveryState(),
    video_depth: initialResearchVideoDepthState(),
    bounded_evidence: initialResearchBoundedEvidenceState(),
    formal_evidence: initialResearchFormalEvidenceState(),
    bidirectional_iteration: initialResearchBidirectionalIterationState(),
    treatment_finalization: initialResearchTreatmentFinalizationState(),
    report: initialResearchReportState()
  });
}

export function applyServerModuleApplicability(
  rawState: ResearchSessionState,
  updates: Partial<Record<ResearchModuleId, "REQUIRED" | "NOT_REQUIRED">>,
  authority: "SERVER_ROUTER" | "SERVER_EVIDENCE"
): ResearchSessionState {
  const state = researchSessionStateSchema.parse(rawState);
  const modules = structuredClone(state.modules);
  for (const moduleId of RESEARCH_MODULE_IDS) {
    const nextApplicability = updates[moduleId];
    if (nextApplicability === undefined) continue;
    const current = modules[moduleId];
    if (
      current.applicability === "REQUIRED" &&
      nextApplicability !== "REQUIRED"
    ) {
      throw new Error(`Required research module ${moduleId} cannot be demoted`);
    }
    modules[moduleId] = nextApplicability === "REQUIRED"
      ? {
        applicability: "REQUIRED",
        execution_status: current.execution_status === "NOT_APPLICABLE"
          ? "NOT_STARTED"
          : current.execution_status,
        authority
      }
      : {
        applicability: "NOT_REQUIRED",
        execution_status: "NOT_APPLICABLE",
        authority
      };
  }
  return parseProjectedResearchSessionState({ ...state, modules });
}

export function applyProtocolRecheck(
  rawState: ResearchSessionState,
  observedCurrent: ResearchSessionState["protocol_binding"]["expected"]
): ResearchSessionState {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency === "DRIFTED") return state;
  if (sameProtocols(state.protocol_binding.expected, observedCurrent)) return state;
  return parseProjectedResearchSessionState({
    ...state,
    protocol_binding: {
      expected: state.protocol_binding.expected,
      currency: "DRIFTED",
      observed_current: observedCurrent
    },
    modules: {
      ...state.modules,
      FINAL_COMPLETION_AUDIT: {
        ...state.modules.FINAL_COMPLETION_AUDIT,
        execution_status: "NOT_STARTED",
        authority: "SERVER_EVIDENCE"
      }
    },
    operations: {
      ...state.operations,
      final_completion_audit: { status: "NOT_STARTED" }
    },
    final_completion_audit: undefined
  });
}

export function recordAutomatedScoutCompletion(
  rawState: ResearchSessionState,
  completion: AutomatedScoutCompletion
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (completion.providerResponseId.trim().length === 0) {
    throw new Error("Automated scout provider response identity is required");
  }
  const discovery = ingestValidatedGeminiFrontier(
    state.candidate_discovery,
    completion.packet,
    completion.receipt,
    completion.providerResponseId
  );
  const externalStatus = discovery.external_scout.status;
  const rejectedPacket = completion.receipt.status === "rejected";
  const boundary = externalStatus === "BLOCKED_RETRYABLE"
    ? {
      classification: "RETRYABLE" as const,
      code: rejectedPacket
        ? "AUTOMATED_SCOUT_PACKET_REJECTED"
        : "AUTOMATED_SCOUT_IDENTITIES_UNRESOLVED",
      summary: rejectedPacket
        ? "All externally scouted video identities failed independent validation; scouting must be rerun rather than bypassed."
        : "Some externally scouted video identities remain unresolved and must be retried."
    }
    : externalStatus === "BLOCKED_TERMINAL"
      ? {
        classification: "TERMINAL_NONRETRYABLE" as const,
        code: "AUTOMATED_SCOUT_IDENTITIES_TERMINAL",
        summary: "Some externally scouted video identities reached a terminal validation boundary."
      }
      : undefined;
  const operationStatus = externalStatus === "COMPLETE"
    ? "COMPLETE" as const
    : externalStatus === "BLOCKED_RETRYABLE"
      ? "BLOCKED_RETRYABLE" as const
      : "BLOCKED_TERMINAL" as const;
  const frontier = completion.receipt.candidate_frontier;

  return parseProjectedResearchSessionState({
    ...state,
    operations: {
      ...state.operations,
      automated_video_scout: {
        status: operationStatus,
        ...(boundary === undefined ? {} : { boundary })
      }
    },
    scout: {
      status: externalStatus === "COMPLETE" ? "COMPLETE" : "BLOCKED",
      provider_response_id: completion.providerResponseId,
      source_packet_version: completion.receipt.source_packet_version,
      validation_status: completion.receipt.status,
      candidate_count: frontier.source_candidate_video_ids.length,
      validated_candidate_ids: frontier.validated_candidate_video_ids,
      unresolved_candidate_ids: frontier.unresolved_candidate_video_ids,
      ...(boundary === undefined ? {} : { access_boundary: boundary })
    },
    candidate_discovery: discovery
  });
}

export function recordNativeYoutubeDiscovery(
  rawState: ResearchSessionState,
  survey: YoutubeCommunitySurveyOutput
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (!operationCompleteOrTerminal(state.operations.automated_video_scout)) {
    throw new Error("Native discovery cannot bypass executable external scouting");
  }
  if (survey.research_question !== state.research_target) {
    throw new Error("Native discovery research target does not match the execution");
  }
  const discovery = ingestNativeYoutubeSurvey(state.candidate_discovery, survey);
  const nativeStatus = discovery.native_youtube.status;
  const boundary = nativeStatus === "BLOCKED_RETRYABLE"
    ? {
      classification: "RETRYABLE" as const,
      code: "NATIVE_DISCOVERY_RETRYABLE_BOUNDARY",
      summary: "Native video discovery has retryable search or identity work remaining."
    }
    : nativeStatus === "BLOCKED_TERMINAL"
      ? {
        classification: "TERMINAL_NONRETRYABLE" as const,
        code: "NATIVE_DISCOVERY_TERMINAL_BOUNDARY",
        summary: "Native video discovery reached a terminal search or identity boundary."
      }
      : undefined;
  const operationStatus = nativeStatus === "COMPLETE"
    ? "COMPLETE" as const
    : nativeStatus === "BLOCKED_RETRYABLE"
      ? "BLOCKED_RETRYABLE" as const
      : "BLOCKED_TERMINAL" as const;
  return parseProjectedResearchSessionState({
    ...state,
    operations: {
      ...state.operations,
      native_video_discovery: {
        status: operationStatus,
        ...(boundary === undefined ? {} : { boundary })
      }
    },
    candidate_discovery: discovery
  });
}

export function recordCandidateScreeningCompletion(
  rawState: ResearchSessionState,
  submission: CandidateScreeningSubmission
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (
    !operationCompleteOrTerminal(state.operations.automated_video_scout) ||
    !operationCompleteOrTerminal(state.operations.native_video_discovery)
  ) {
    throw new Error("Candidate screening requires both resolved discovery frontiers");
  }
  if (state.operations.candidate_screening.status === "COMPLETE") {
    throw new Error("Completed candidate screening is immutable");
  }
  const candidateDiscovery = ingestCandidateScreeningSubmission(
    state.candidate_discovery,
    submission
  );
  const videoDepth = initializeResearchVideoDepth(candidateDiscovery);
  const boundedEvidence = initializeResearchBoundedEvidence(
    videoDepth.selection_digest!,
    videoDepth.selected_video_ids
  );
  const formalEvidence = initializeResearchFormalEvidence(
    candidateDiscovery,
    state.research_target
  );
  return parseProjectedResearchSessionState({
    ...state,
    operations: {
      ...state.operations,
      candidate_screening: { status: "COMPLETE" },
      transcript_acquisition: videoDepthOperationProjection(
        videoDepth,
        "transcript_acquisition"
      ),
      community_discussion_audit: videoDepthOperationProjection(
        videoDepth,
        "community_discussion_audit"
      ),
      video_evidence_synthesis: videoEvidenceOperationProjection(
        boundedEvidence,
        videoDepth
      ),
      formal_evidence_search: formalEvidenceOperationProjection(
        formalEvidence,
        "formal_evidence_search"
      ),
      accessible_full_text_acquisition: formalEvidenceOperationProjection(
        formalEvidence,
        "accessible_full_text_acquisition"
      ),
      study_method_audit: formalEvidenceOperationProjection(
        formalEvidence,
        "study_method_audit"
      ),
      external_study_evidence_audit: formalEvidenceOperationProjection(
        formalEvidence,
        "external_study_evidence_audit"
      ),
      linked_replication_and_review_audit: formalEvidenceOperationProjection(
        formalEvidence,
        "linked_replication_and_review_audit"
      ),
      claim_capability_recalculation: formalEvidenceOperationProjection(
        formalEvidence,
        "claim_capability_recalculation"
      )
    },
    candidate_discovery: candidateDiscovery,
    video_depth: videoDepth,
    bounded_evidence: boundedEvidence,
    formal_evidence: formalEvidence
  });
}

export function recordTranscriptDepthResult(
  rawState: ResearchSessionState,
  videoId: string,
  output: YoutubeTranscriptActionOutput
): ResearchSessionState {
  const state = requireDepthReady(rawState);
  const videoDepth = ingestTranscriptActionOutput(state.video_depth, videoId, output);
  return withVideoDepth(state, videoDepth);
}

export function recordDiscussionDepthResult(
  rawState: ResearchSessionState,
  videoId: string,
  requestedHandle: string | undefined,
  output: YoutubeDiscussionActionOutput
): ResearchSessionState {
  const state = requireDepthReady(rawState);
  const videoDepth = ingestDiscussionActionOutput(
    state.video_depth,
    videoId,
    requestedHandle,
    output
  );
  return withVideoDepth(state, videoDepth);
}

export function recordResearchSessionVideoEvidence(
  rawState: ResearchSessionState,
  material: VideoEvidenceMaterial,
  submission: VideoEvidenceSubmission
): ResearchSessionState {
  const state = requireDepthReady(rawState);
  const boundedEvidence = ingestVideoEvidenceSubmission(
    state.bounded_evidence,
    state.candidate_discovery,
    state.video_depth,
    material,
    submission
  );
  return withBoundedEvidence(state, boundedEvidence);
}

/**
 * Reconcile a decrypted durable checkpoint with the intentionally ephemeral
 * source-handle stores. This function can only reopen work; it cannot advance
 * evidence or authorize output.
 */
export function reconcileRestoredResearchSessionState(
  rawState: ResearchSessionState,
): ResearchSessionState {
  let state = researchSessionStateSchema.parse(rawState);
  const scoutOperation = state.operations.automated_video_scout;
  if (
    scoutOperation.status === "BLOCKED_RETRYABLE" ||
    scoutOperation.status === "BLOCKED_TERMINAL"
  ) {
    const candidateDiscovery = markExternalScoutFrontierBoundary(
      state.candidate_discovery,
      scoutOperation.status,
      scoutOperation.boundary!.code
    );
    const scout = blockedScoutProjection(
      state.scout,
      candidateDiscovery,
      scoutOperation.boundary!
    );
    if (
      JSON.stringify(candidateDiscovery) !== JSON.stringify(state.candidate_discovery) ||
      JSON.stringify(scout) !== JSON.stringify(state.scout)
    ) {
      state = researchSessionStateSchema.parse({
        ...state,
        candidate_discovery: candidateDiscovery,
        scout
      });
    }
  }
  const videoDepth = reconcileVideoDepthAfterEphemeralLoss(state.video_depth);
  if (JSON.stringify(videoDepth) !== JSON.stringify(state.video_depth)) {
    state = withVideoDepth(state, videoDepth);
  }
  const formalEvidence = reconcileFormalEvidenceAfterEphemeralLoss(
    state.formal_evidence,
  );
  if (JSON.stringify(formalEvidence) !== JSON.stringify(state.formal_evidence)) {
    state = withFormalEvidence(state, formalEvidence);
  }
  const bidirectional = reconcileBidirectionalIterationAfterEphemeralLoss(
    state.bidirectional_iteration,
  );
  if (JSON.stringify(bidirectional) !== JSON.stringify(state.bidirectional_iteration)) {
    state = withBidirectionalIteration(state, bidirectional);
  }
  return parseProjectedResearchSessionState(state);
}

export function recordVideoDepthRestart(
  rawState: ResearchSessionState,
  capability: "transcript_acquisition" | "community_discussion_audit",
  videoId: string,
  code: string
): ResearchSessionState {
  const state = requireDepthReady(rawState);
  const videoDepth = restartResearchVideoDepthChain(
    state.video_depth,
    capability,
    videoId,
    code
  );
  return withVideoDepth(state, videoDepth);
}

export async function executeResearchSessionVideoDepthChain(
  rawState: ResearchSessionState,
  capability: "transcript_acquisition" | "community_discussion_audit",
  videoId: string,
  executors: ResearchVideoDepthExecutors,
  maximumCalls = 1_000
): Promise<ResearchSessionState> {
  const state = requireDepthReady(rawState);
  const videoDepth = capability === "transcript_acquisition"
    ? await executeTranscriptDepthChain(
      state.video_depth,
      videoId,
      executors.getTranscript,
      maximumCalls
    )
    : await executeDiscussionDepthChain(
      state.video_depth,
      videoId,
      executors.auditDiscussion,
      maximumCalls
    );
  return withVideoDepth(state, videoDepth);
}

export async function executeResearchSessionFormalSearch(
  rawState: ResearchSessionState,
  hypothesisId: string,
  executors: FormalSearchExecutors,
  maximumPagesPerProvider = 1
): Promise<ResearchSessionState> {
  const state = requireFormalReady(rawState);
  const formalEvidence = await executeResearchFormalSearch(
    state.formal_evidence,
    hypothesisId,
    executors,
    maximumPagesPerProvider
  );
  return withFormalEvidence(state, formalEvidence);
}

export function recordResearchSessionFormalScreening(
  rawState: ResearchSessionState,
  submission: FormalEvidenceScreeningSubmission
): ResearchSessionState {
  const state = requireFormalReady(rawState);
  if (formalEvidenceScreeningComplete(state.formal_evidence)) {
    throw new Error("Completed formal source screening is immutable");
  }
  const formalEvidence = ingestFormalEvidenceScreeningSubmission(
    state.formal_evidence,
    submission
  );
  return withFormalEvidence(state, formalEvidence);
}

export async function executeResearchSessionSourceFullTextChain(
  rawState: ResearchSessionState,
  sourceId: string,
  executor: OpenFullTextExecutor,
  maximumCalls = 1_000
): Promise<ResearchSessionState> {
  const state = requireFormalReady(rawState);
  if (!operationCompleteOrTerminal(state.operations.formal_evidence_search)) {
    throw new Error("Full-text acquisition requires completed formal source screening");
  }
  const formalEvidence = await executeResearchSourceFullTextChain(
    state.formal_evidence,
    sourceId,
    executor,
    maximumCalls
  );
  return withFormalEvidence(state, formalEvidence);
}

export async function executeResearchSessionMethodAudit(
  rawState: ResearchSessionState,
  sourceId: string,
  submission:
    | Parameters<OpenFullTextExecutor["validateStudyAudit"]>[0]["audit"]
    | Parameters<OpenFullTextExecutor["validateReviewAudit"]>[0]["audit"]
    | Parameters<OpenFullTextExecutor["validateNoticeAudit"]>[0]["audit"],
  executor: OpenFullTextExecutor
): Promise<ResearchSessionState> {
  const state = requireFormalReady(rawState);
  const work = createFormalMethodAuditWorkPackages(state.formal_evidence)
    .find(({ source_id }) => source_id === sourceId);
  if (work === undefined) {
    throw new Error("The exact formal source has no executable method-audit work package");
  }
  const output = work.audit_kind === "STUDY"
    ? await executor.validateStudyAudit({
      document_handle: work.document_handle,
      audit: submission as Parameters<OpenFullTextExecutor["validateStudyAudit"]>[0]["audit"]
    })
    : work.audit_kind === "REVIEW"
      ? await executor.validateReviewAudit({
        document_handle: work.document_handle,
        audit: submission as Parameters<OpenFullTextExecutor["validateReviewAudit"]>[0]["audit"]
      })
      : await executor.validateNoticeAudit({
        document_handle: work.document_handle,
        audit: submission as Parameters<OpenFullTextExecutor["validateNoticeAudit"]>[0]["audit"]
      });
  const formalEvidence = recordFormalMethodAudit(
    state.formal_evidence,
    sourceId,
    output
  );
  return withFormalEvidence(state, formalEvidence);
}

export async function executeResearchSessionSourceExternalEvidence(
  rawState: ResearchSessionState,
  sessionId: string,
  sourceId: string,
  coordinator: StudyExternalEvidenceCoordinator,
  receiptSecret: string
): Promise<ResearchSessionState> {
  const state = requireFormalReady(rawState);
  const formalEvidence = await executeResearchSourceExternalEvidence(
    state.formal_evidence,
    sessionId,
    sourceId,
    coordinator,
    receiptSecret,
    state.protocol_binding.expected
  );
  return withFormalEvidence(state, formalEvidence);
}

export function reconcileResearchSessionLinkedWork(
  rawState: ResearchSessionState
): ResearchSessionState {
  const state = requireFormalReady(rawState);
  return withFormalEvidence(
    state,
    reconcileFormalEvidenceLinkedWork(state.formal_evidence)
  );
}

export async function recalculateResearchSessionSourceClaimCapability(
  rawState: ResearchSessionState,
  input: Parameters<typeof recalculateResearchSourceClaimCapability>[1]
): Promise<ResearchSessionState> {
  const state = requireFormalReady(rawState);
  const formalEvidence = await recalculateResearchSourceClaimCapability(
    state.formal_evidence,
    input
  );
  return withFormalEvidence(state, formalEvidence);
}

export function recordResearchSessionBidirectionalIteration(
  rawState: ResearchSessionState,
  submission: BidirectionalIterationSubmission
): ResearchSessionState {
  const state = requireBidirectionalReady(rawState);
  const result = ingestBidirectionalIterationSubmission(
    state.bidirectional_iteration,
    bidirectionalEvidenceState(state),
    submission
  );
  return withBidirectionalIteration(
    withFormalEvidence(state, result.formalEvidence),
    result.bidirectional
  );
}

export async function executeResearchSessionBidirectionalReturnSearch(
  rawState: ResearchSessionState,
  transferId: string,
  execute: BidirectionalCommentSearchExecutor,
  maximumPagesPerVideo = 1
): Promise<ResearchSessionState> {
  const state = requireBidirectionalReady(rawState, false);
  const bidirectional = await executeBidirectionalReturnSearch(
    state.bidirectional_iteration,
    transferId,
    execute,
    maximumPagesPerVideo
  );
  return withBidirectionalIteration(state, bidirectional);
}

export function recordResearchSessionBidirectionalReturnAssessment(
  rawState: ResearchSessionState,
  submission: BidirectionalReturnAssessmentSubmission
): ResearchSessionState {
  const state = requireBidirectionalReady(rawState, false);
  const result = ingestBidirectionalReturnAssessment(
    state.bidirectional_iteration,
    state.formal_evidence,
    submission
  );
  return withBidirectionalIteration(
    withFormalEvidence(state, result.formalEvidence),
    result.bidirectional
  );
}

export function recordResearchSessionTreatmentLandscape(
  rawState: ResearchSessionState,
  submission: TreatmentLandscapeSubmission
): ResearchSessionState {
  const state = requireTreatmentFinalizationReady(rawState);
  const treatment = ingestTreatmentLandscapeSubmission(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state),
    submission
  );
  return withTreatmentFinalization(state, treatment);
}

export function recordResearchSessionReport(
  rawState: ResearchSessionState,
  submission: ReportSynthesisSubmission
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (!operationCompleteOrTerminal(state.operations.treatment_landscape_finalization)) {
    throw new Error("Report synthesis requires a terminal treatment landscape");
  }
  const report = ingestReportSynthesisSubmission(
    state.report,
    reportSynthesisEvidence(state),
    submission
  );
  return withReport(state, report);
}

export function executeResearchSessionFinalCompletionAudit(
  rawState: ResearchSessionState
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  const checks = deriveFinalCompletionChecks(state);
  const status = checks.every((check) => check.status === "PASS")
    ? "PASS" as const
    : "FAIL" as const;
  const audit = {
    audit_version: "askrigor_final_completion_audit_v1" as const,
    basis_digest: finalCompletionAuditBasisDigest(state),
    status,
    checks
  };
  const operation = status === "PASS"
    ? { status: "COMPLETE" as const }
    : { status: "IN_PROGRESS" as const };
  const modules = {
    ...state.modules,
    FINAL_COMPLETION_AUDIT: {
      ...state.modules.FINAL_COMPLETION_AUDIT,
      execution_status: status === "PASS"
        ? "COMPLETE" as const
        : "IN_PROGRESS" as const,
      authority: "SERVER_EVIDENCE" as const
    }
  };
  return parseProjectedResearchSessionState({
    ...state,
    modules,
    operations: { ...state.operations, final_completion_audit: operation },
    final_completion_audit: audit
  });
}

export function recordAutomatedScoutBoundary(
  rawState: ResearchSessionState,
  boundary: z.output<typeof operationBoundarySchema>
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  const parsedBoundary = operationBoundarySchema.parse(boundary);
  const status = parsedBoundary.classification === "RETRYABLE"
    ? "BLOCKED_RETRYABLE" as const
    : "BLOCKED_TERMINAL" as const;
  const candidateDiscovery = markExternalScoutFrontierBoundary(
    state.candidate_discovery,
    status,
    parsedBoundary.code
  );
  const scout = blockedScoutProjection(
    state.scout,
    candidateDiscovery,
    parsedBoundary
  );
  return parseProjectedResearchSessionState({
    ...state,
    operations: {
      ...state.operations,
      automated_video_scout: { status, boundary: parsedBoundary }
    },
    scout,
    candidate_discovery: candidateDiscovery
  });
}

function blockedScoutProjection(
  prior: ResearchSessionState["scout"],
  candidateDiscovery: ResearchSessionState["candidate_discovery"],
  boundary: z.output<typeof operationBoundarySchema>
): ResearchSessionState["scout"] {
  const external = candidateDiscovery.external_scout;
  const providerResponseId = external.provider_response_id ?? prior.provider_response_id;
  return {
    ...prior,
    status: "BLOCKED",
    candidate_count: external.source_candidate_video_ids.length,
    validated_candidate_ids: external.validated_candidate_video_ids,
    unresolved_candidate_ids: external.unresolved_candidate_video_ids,
    access_boundary: boundary,
    ...(providerResponseId === undefined
      ? {}
      : { provider_response_id: providerResponseId })
  };
}

export function deriveRequiredNextCapabilities(
  rawState: ResearchSessionState
): ResearchNextCapability[] {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency === "DRIFTED") {
    return ["restart_under_current_protocols"];
  }

  const capabilities: ResearchNextCapability[] = [];
  if (Object.values(state.modules).some(({ applicability }) =>
    applicability === "UNRESOLVED"
  )) {
    capabilities.push("route_module_applicability");
  }

  const scout = state.operations.automated_video_scout;
  if (isExecutable(scout)) capabilities.push("automated_video_scout");
  if (!operationCompleteOrTerminal(scout)) return unique(capabilities);

  const nativeDiscovery = state.operations.native_video_discovery;
  if (isExecutable(nativeDiscovery)) capabilities.push("native_video_discovery");
  if (
    (
      state.candidate_discovery.external_scout.status === "BLOCKED_RETRYABLE" &&
      state.candidate_discovery.external_scout.unresolved_candidate_video_ids.length > 0
    ) || (
      state.candidate_discovery.native_youtube.status === "BLOCKED_RETRYABLE" &&
      state.candidate_discovery.native_youtube.unresolved_candidate_video_ids.length > 0
    )
  ) {
    capabilities.push("resolve_candidate_identities");
  }
  if (
    candidateDiscoveryReadyForScreening(state.candidate_discovery) &&
    isExecutable(state.operations.candidate_screening)
  ) {
    capabilities.push("candidate_screening");
  }
  if (state.operations.candidate_screening.status === "COMPLETE") {
    if (isExecutable(state.operations.formal_evidence_search)) {
      capabilities.push("formal_evidence_search");
    }
    if (isExecutable(state.operations.transcript_acquisition)) {
      capabilities.push("transcript_acquisition");
    }
    if (isExecutable(state.operations.community_discussion_audit)) {
      capabilities.push("community_discussion_audit");
    }
  }
  if (
    operationCompleteOrTerminal(state.operations.formal_evidence_search) &&
    isExecutable(state.operations.accessible_full_text_acquisition)
  ) {
    capabilities.push("accessible_full_text_acquisition");
  }
  if (
    state.operations.accessible_full_text_acquisition.status === "COMPLETE" &&
    isExecutable(state.operations.study_method_audit)
  ) {
    capabilities.push("study_method_audit");
  }
  if (
    state.operations.study_method_audit.status === "COMPLETE" &&
    isExecutable(state.operations.external_study_evidence_audit)
  ) {
    capabilities.push("external_study_evidence_audit");
  }
  if (
    operationCompleteOrTerminal(state.operations.external_study_evidence_audit) &&
    isExecutable(state.operations.linked_replication_and_review_audit)
  ) {
    capabilities.push("linked_replication_and_review_audit");
  }
  if (
    operationCompleteOrTerminal(state.operations.linked_replication_and_review_audit) &&
    isExecutable(state.operations.claim_capability_recalculation)
  ) {
    capabilities.push("claim_capability_recalculation");
  }
  if (
    operationCompleteOrTerminal(state.operations.transcript_acquisition) &&
    operationCompleteOrTerminal(state.operations.community_discussion_audit) &&
    isExecutable(state.operations.video_evidence_synthesis)
  ) {
    capabilities.push("video_evidence_synthesis");
  }
  if (
    operationCompleteOrTerminal(state.operations.video_evidence_synthesis) &&
    formalPipelineTerminal(state) &&
    isExecutable(state.operations.bidirectional_evidence_return)
  ) {
    capabilities.push("bidirectional_evidence_return");
  }
  if (
    operationCompleteOrTerminal(state.operations.bidirectional_evidence_return) &&
    isExecutable(state.operations.treatment_landscape_finalization)
  ) {
    capabilities.push("treatment_landscape_finalization");
  }
  if (
    operationCompleteOrTerminal(state.operations.treatment_landscape_finalization) &&
    isExecutable(state.operations.report_synthesis)
  ) {
    capabilities.push("report_synthesis");
  }
  if (
    state.operations.report_synthesis.status === "COMPLETE" &&
    isExecutable(state.operations.final_completion_audit)
  ) {
    capabilities.push("final_completion_audit");
  }
  return unique(capabilities);
}

export function deriveResearchOutputBoundary(
  rawState: ResearchSessionState
): ResearchOutputBoundary {
  const state = researchSessionStateSchema.parse(rawState);
  if (deriveResearchFinalizationReadiness(state) === "FINALIZATION_ALLOWED") {
    return "FINALIZATION_ALLOWED";
  }
  if (boundedNonrankingReady(state)) return "BOUNDED_NONRANKING_ONLY";
  if (hasExecutableOrIncompleteWork(state)) return "CONTINUE_RESEARCH";
  if (hasTerminalBoundary(state)) return "BOUNDED_NONRANKING_ONLY";
  return "CONTINUE_RESEARCH";
}

export function deriveResearchFinalizationReadiness(
  rawState: ResearchSessionState
): ResearchOutputBoundary {
  const state = researchSessionStateSchema.parse(rawState);
  if (state.protocol_binding.currency === "DRIFTED") return "CONTINUE_RESEARCH";
  if (
    state.final_completion_audit?.status === "PASS" &&
    state.final_completion_audit.basis_digest === finalCompletionAuditBasisDigest(state) &&
    state.operations.final_completion_audit.status === "COMPLETE"
  ) return "FINALIZATION_ALLOWED";
  if (boundedNonrankingReady(state)) return "BOUNDED_NONRANKING_ONLY";
  return "CONTINUE_RESEARCH";
}

export function mapTreatmentLandscapeBoundary(
  boundary: TreatmentLandscapeCoverageOutput["answer_boundary"]
): Exclude<ResearchOutputBoundary, "FINALIZATION_ALLOWED"> {
  if (boundary === "bounded_nonranking_only") {
    return "BOUNDED_NONRANKING_ONLY";
  }
  // A passing treatment ledger is one required gate, never global completion.
  return "CONTINUE_RESEARCH";
}

export function projectResearchSessionView(
  sessionId: string,
  rawState: ResearchSessionState
): z.output<typeof researchSessionViewSchema> {
  const state = researchSessionStateSchema.parse(rawState);
  const outputBoundary = deriveResearchOutputBoundary(state);
  const requiredNextCapabilities = deriveRequiredNextCapabilities(state);
  const hasRetryable = Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_RETRYABLE"
  );
  const hasTerminal = Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_TERMINAL"
  );
  return researchSessionViewSchema.parse({
    session_id: sessionId,
    execution_status: state.protocol_binding.currency === "DRIFTED"
      ? "PROTOCOL_DRIFT"
      : outputBoundary === "FINALIZATION_ALLOWED"
        ? "READY_TO_FINALIZE"
      : outputBoundary === "BOUNDED_NONRANKING_ONLY"
        ? "BOUNDED"
        : hasRetryable
          ? "BLOCKED_RETRYABLE"
          : requiredNextCapabilities.length === 0 && hasTerminal
            ? "BLOCKED_TERMINAL"
          : "IN_PROGRESS",
    output_boundary: outputBoundary,
    finalization_readiness: deriveResearchFinalizationReadiness(state),
    protocol_binding: state.protocol_binding,
    modules: state.modules,
    operations: state.operations,
    scout: {
      status: state.scout.status,
      candidate_count: state.scout.candidate_count,
      validated_candidate_count: state.scout.validated_candidate_ids.length,
      unresolved_candidate_count: state.scout.unresolved_candidate_ids.length,
      ...(state.scout.access_boundary === undefined
        ? {}
        : { access_boundary: state.scout.access_boundary })
    },
    candidate_discovery: deriveCandidateDiscoveryDiagnostics(
      state.candidate_discovery
    ),
    candidate_screening_work_package:
      state.protocol_binding.currency === "CURRENT" &&
      state.operations.candidate_screening.status !== "COMPLETE" &&
      candidateDiscoveryReadyForScreening(state.candidate_discovery)
        ? createCandidateScreeningWorkPackage(state.candidate_discovery)
        : null,
    video_depth: deriveResearchVideoDepthDiagnostics(state.video_depth),
    next_video_work_packages: state.protocol_binding.currency === "CURRENT"
      ? deriveResearchVideoDepthWorkPackages(state.video_depth)
      : [],
    next_video_evidence_work_package:
      state.protocol_binding.currency === "CURRENT"
        ? videoEvidenceWorkPackageOrNull(state)
        : null,
    video_evidence: {
      selected: state.bounded_evidence.videos.length,
      complete: state.bounded_evidence.videos.filter(({ status }) =>
        status === "COMPLETE"
      ).length,
      bounded: state.bounded_evidence.videos.filter(({ status }) =>
        status === "BOUNDED_TERMINAL"
      ).length,
      pending: state.bounded_evidence.videos.filter(({ status }) =>
        status === "NOT_STARTED"
      ).length
    },
    formal_evidence: deriveFormalEvidenceDiagnostics(state.formal_evidence),
    formal_source_screening_work_package:
      state.protocol_binding.currency === "CURRENT"
        ? formalScreeningWorkPackageOrNull(state.formal_evidence)
        : null,
    formal_method_audit_work_packages:
      state.protocol_binding.currency === "CURRENT"
        ? createFormalMethodAuditWorkPackages(state.formal_evidence)
        : [],
    formal_external_evidence_work_packages:
      state.protocol_binding.currency === "CURRENT"
        ? createFormalExternalEvidenceWorkPackages(state.formal_evidence)
        : [],
    formal_claim_recalculation_work_packages:
      state.protocol_binding.currency === "CURRENT"
        ? createFormalClaimRecalculationWorkPackages(state.formal_evidence)
        : [],
    bidirectional_iteration: projectBidirectionalIterationDiagnostics(state),
    bidirectional_iteration_work_package:
      state.protocol_binding.currency === "CURRENT"
        ? bidirectionalWorkPackageOrNull(state)
        : null,
    bidirectional_return_assessment_work_packages:
      state.protocol_binding.currency === "CURRENT"
        ? createBidirectionalReturnAssessmentWorkPackages(
          state.bidirectional_iteration
        )
        : [],
    treatment_finalization: deriveTreatmentFinalizationDiagnostics(
      state.treatment_finalization,
      treatmentFinalizationEvidence(state)
    ),
    treatment_landscape_work_package:
      state.protocol_binding.currency === "CURRENT"
        ? treatmentWorkPackageOrNull(state)
        : null,
    report_synthesis_work_package:
      state.protocol_binding.currency === "CURRENT"
        ? reportWorkPackageOrNull(state)
        : null,
    report_digest: currentResearchReport(
      state.report,
      reportSynthesisEvidence(state)
    )?.report_digest ?? null,
    final_completion_audit: projectFinalCompletionAuditView(state),
    required_next_capabilities: requiredNextCapabilities,
    finalization_permit: null
  });
}

export function evaluateResearchFinalization(
  sessionId: string,
  rawState: ResearchSessionState,
  options: ResearchFinalizationPermitOptions = {}
): ResearchFinalizationDecision {
  const state = researchSessionStateSchema.parse(rawState);
  const outputBoundary = deriveResearchOutputBoundary(state);
  const stateDigest = researchSessionStateDigest(state);
  const reasons: z.output<typeof finalizationDenialReasonSchema>[] = [];
  if (state.protocol_binding.currency === "DRIFTED") {
    reasons.push("PROTOCOL_DRIFT");
  }
  if (Object.values(state.modules).some(({ applicability }) =>
    applicability === "UNRESOLVED"
  )) {
    reasons.push("MODULE_APPLICABILITY_UNRESOLVED");
  }
  if (Object.values(state.modules).some((module) =>
    module.applicability === "REQUIRED" && module.execution_status !== "COMPLETE"
  )) {
    reasons.push("REQUIRED_MODULE_INCOMPLETE");
  }
  if (Object.values(state.operations).some(({ status }) =>
    status === "NOT_STARTED" || status === "IN_PROGRESS"
  )) {
    reasons.push("REQUIRED_OPERATION_INCOMPLETE");
  }
  if (Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_RETRYABLE"
  )) {
    reasons.push("RETRYABLE_WORK_REMAINS");
  }
  if (hasTerminalBoundary(state)) {
    reasons.push("TERMINAL_BOUNDARY_LIMITS_OUTPUT");
  }
  const authorizable = outputBoundary === "FINALIZATION_ALLOWED" ||
    outputBoundary === "BOUNDED_NONRANKING_ONLY" && boundedNonrankingReady(state);
  const secret = options.signingSecret;
  const keyId = options.keyId;
  if (
    authorizable &&
    (
      secret === undefined || keyId === undefined ||
      secret.trim().length === 0 || keyId.trim().length === 0
    )
  ) {
    reasons.push("FINALIZATION_SIGNING_NOT_CONFIGURED");
  }
  if (
    !authorizable || secret === undefined || keyId === undefined ||
    secret.trim().length === 0 || keyId.trim().length === 0
  ) {
    return finalizationDecisionSchema.parse({
      session_id: sessionId,
      authorization: "DENIED",
      output_boundary: outputBoundary,
      finalization_permit: null,
      denial_reasons: unique(reasons),
      required_next_capabilities: deriveRequiredNextCapabilities(state),
      state_digest: stateDigest
    });
  }

  const limitations = deriveResearchFinalizationLimitations(state);
  const report = currentResearchReport(state.report, reportSynthesisEvidence(state));
  if (report === undefined) {
    return finalizationDecisionSchema.parse({
      session_id: sessionId,
      authorization: "DENIED",
      output_boundary: "CONTINUE_RESEARCH",
      finalization_permit: null,
      denial_reasons: ["REQUIRED_OPERATION_INCOMPLETE"],
      required_next_capabilities: deriveRequiredNextCapabilities(state),
      state_digest: stateDigest
    });
  }
  const permit = issueResearchFinalizationPermit(sessionId, state, limitations, {
    signingSecret: secret,
    keyId,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs })
  });
  return finalizationDecisionSchema.parse({
    session_id: sessionId,
    authorization: outputBoundary === "FINALIZATION_ALLOWED"
      ? "AUTHORIZED"
      : "BOUNDED",
    output_boundary: outputBoundary,
    finalization_permit: permit,
    reader_facing: {
      permitted_scope: outputBoundary === "FINALIZATION_ALLOWED"
        ? "comparative_synthesis"
        : "bounded_nonranking_report",
      limitations,
      report: report.packet
    },
    required_next_capabilities: [],
    state_digest: stateDigest
  });
}

const FINALIZATION_PERMIT_KEY_DOMAIN = "askrigor:research-finalization-permit:v2";
const FINALIZATION_PERMIT_DEFAULT_TTL_MS = 15 * 60 * 1_000;
const FINALIZATION_PERMIT_MAX_TTL_MS = 60 * 60 * 1_000;
const FINALIZATION_PERMIT_MIN_SECRET_BYTES = 32;

export class ResearchFinalizationPermitError extends Error {
  constructor() {
    super("Research finalization permit is invalid, stale, expired, or bound to another execution");
    this.name = "ResearchFinalizationPermitError";
  }
}

export function deriveResearchFinalizationLimitations(
  rawState: ResearchSessionState
): ResearchFinalizationLimitation[] {
  return deriveResearchFinalizationLimitationsFromState(
    researchSessionStateSchema.parse(rawState)
  );
}

function deriveResearchFinalizationLimitationsFromState(
  state: ResearchSessionState
): ResearchFinalizationLimitation[] {
  const limitations: ResearchFinalizationLimitation[] = [];
  const add = (input: Omit<ResearchFinalizationLimitation, "limitation_id">) => {
    const core = researchFinalizationLimitationSchema.omit({ limitation_id: true })
      .parse(input);
    limitations.push(researchFinalizationLimitationSchema.parse({
      ...core,
      limitation_id: sha256(`finalization-limitation:${canonicalJson(core)}`)
    }));
  };

  for (const source of state.formal_evidence.sources.filter(({ decision_importance }) =>
    decision_importance === "DECISION_IMPORTANT"
  )) {
    for (const coverage of source.external_evidence.provider_coverage) {
      const label = providerPlainLabel(coverage.provider);
      const plainLanguage = providerCoverageLimitation(
        label,
        coverage.provider_outcome
      );
      if (plainLanguage === undefined) continue;
      add({
        scope: "provider_coverage",
        source_id: source.source_id,
        provider: coverage.provider,
        plain_language: plainLanguage
      });
    }

    const publication = source.external_evidence.publication_integrity;
    if (publication !== undefined && publication.record_state !== "no_update_marker_found") {
      add({
        scope: "publication_integrity",
        source_id: source.source_id,
        plain_language: publicationIntegrityLimitation(publication.record_state)
      });
    }
    for (const limitation of source.external_evidence.claim_local_limitations) {
      if (limitation.claim_id.startsWith("provider_coverage:")) continue;
      add({
        scope: "claim_capability",
        source_id: source.source_id,
        plain_language: limitation.limitation
      });
    }
    for (const linked of source.external_evidence.linked_work.filter(({ status }) =>
      status === "BOUNDED"
    )) {
      add({
        scope: "linked_source",
        source_id: source.source_id,
        plain_language: linked.limitation
      });
    }
    if (
      source.full_text.status === "LEAD_BOUNDARY" ||
      source.claim_capability.status === "UNAVAILABLE_UNSEEN_SOURCE"
    ) {
      add({
        scope: "source_access",
        source_id: source.source_id,
        plain_language: "The full study could not be inspected, so it remains a potentially useful lead rather than evidence for the affected claim."
      });
    }
    if (
      source.external_evidence.effect_claims_excluded ||
      source.claim_capability.status === "EFFECT_CLAIMS_EXCLUDED"
    ) {
      add({
        scope: "claim_capability",
        source_id: source.source_id,
        plain_language: "This study is excluded from ordinary treatment-effect claims because its current publication record restricts that use."
      });
    }
  }

  for (const video of state.bounded_evidence.videos.filter(({ status }) =>
    status === "BOUNDED_TERMINAL"
  )) {
    const candidate = state.candidate_discovery.candidates.find(({ video_id }) =>
      video_id === video.video_id
    );
    for (const limitation of video.limitations) {
      add({
        scope: "source_access",
        plain_language: `${candidate?.title ?? "A selected video"}: ${limitation}`
      });
    }
  }

  const treatment = currentTreatmentLandscapeAssessment(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state)
  );
  if (treatment?.answer_boundary === "bounded_nonranking_only") {
    add({
      scope: "treatment_landscape",
      plain_language: "At least one material comparison is limited by a source that could not be completed. The permitted report may describe inspected evidence and gaps, but it may not rank treatments or give the blocked comparative verdict."
    });
  }

  return [...new Map(limitations.map((limitation) => [
    limitation.limitation_id,
    limitation
  ])).values()].sort((left, right) =>
    left.limitation_id.localeCompare(right.limitation_id)
  );
}

export function verifyResearchFinalizationPermit(
  rawPermit: FinalizationPermit,
  executionId: string,
  rawState: ResearchSessionState,
  options: ResearchFinalizationPermitVerification
): FinalizationPermit {
  try {
    validateFinalizationSigningSecret(options.signingSecret);
    const state = researchSessionStateSchema.parse(rawState);
    const permit = finalizationPermitSchema.parse(rawPermit);
    const boundary = deriveResearchOutputBoundary(state);
    if (
      boundary === "CONTINUE_RESEARCH" ||
      permit.execution_id !== executionId ||
      permit.key_id !== options.keyId ||
      permit.output_boundary !== boundary ||
      boundary === "BOUNDED_NONRANKING_ONLY" && !boundedNonrankingReady(state)
    ) throw new ResearchFinalizationPermitError();

    const limitations = deriveResearchFinalizationLimitations(state);
    const report = currentResearchReport(state.report, reportSynthesisEvidence(state));
    if (report === undefined) throw new ResearchFinalizationPermitError();
    const expected = {
      execution_id: executionId,
      protocol_identities: state.protocol_binding.expected,
      state_digest: researchSessionStateDigest(state),
      authorization_basis_digest: finalizationAuthorizationBasisDigest(state, boundary),
      limitations_digest: finalizationLimitationsDigest(limitations),
      report_digest: report.report_digest
    };
    if (canonicalJson({
      execution_id: permit.execution_id,
      protocol_identities: permit.protocol_identities,
      state_digest: permit.state_digest,
      authorization_basis_digest: permit.authorization_basis_digest,
      limitations_digest: permit.limitations_digest,
      report_digest: permit.report_digest
    }) !== canonicalJson(expected)) {
      throw new ResearchFinalizationPermitError();
    }

    const issuedAt = Date.parse(permit.issued_at);
    const expiresAt = Date.parse(permit.expires_at);
    const now = readFinalizationClock(options.now ?? (() => new Date())).getTime();
    if (
      !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) ||
      expiresAt <= issuedAt ||
      expiresAt - issuedAt > FINALIZATION_PERMIT_MAX_TTL_MS ||
      issuedAt > now || now >= expiresAt
    ) throw new ResearchFinalizationPermitError();

    const unsigned = unsignedFinalizationPermit(permit);
    const payload = canonicalJson(unsigned);
    if (permit.permit_payload_sha256 !== sha256(payload)) {
      throw new ResearchFinalizationPermitError();
    }
    const expectedSignature = createHmac(
      "sha256",
      finalizationPermitSigningKey(options.signingSecret)
    ).update(payload).digest();
    const suppliedSignature = Buffer.from(permit.signature, "base64url");
    if (
      suppliedSignature.toString("base64url") !== permit.signature ||
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) throw new ResearchFinalizationPermitError();
    return permit;
  } catch (error) {
    if (error instanceof ResearchFinalizationPermitError) throw error;
    throw new ResearchFinalizationPermitError();
  }
}

function issueResearchFinalizationPermit(
  executionId: string,
  state: ResearchSessionState,
  limitations: ResearchFinalizationLimitation[],
  options: Required<Pick<ResearchFinalizationPermitOptions, "signingSecret" | "keyId">> &
    Pick<ResearchFinalizationPermitOptions, "now" | "ttlMs">
): FinalizationPermit {
  validateFinalizationSigningSecret(options.signingSecret);
  const boundary = deriveResearchOutputBoundary(state);
  if (
    boundary === "CONTINUE_RESEARCH" ||
    boundary === "BOUNDED_NONRANKING_ONLY" && !boundedNonrankingReady(state)
  ) throw new ResearchFinalizationPermitError();
  const issued = readFinalizationClock(options.now ?? (() => new Date()));
  const report = currentResearchReport(state.report, reportSynthesisEvidence(state));
  if (report === undefined) throw new ResearchFinalizationPermitError();
  const ttlMs = options.ttlMs ?? FINALIZATION_PERMIT_DEFAULT_TTL_MS;
  if (
    !Number.isSafeInteger(ttlMs) || ttlMs < 1 ||
    ttlMs > FINALIZATION_PERMIT_MAX_TTL_MS
  ) throw new Error("Research finalization permit TTL is invalid");
  const unsigned = {
    permit_version: "askrigor_finalization_permit_v2" as const,
    artifact_kind: boundary === "FINALIZATION_ALLOWED"
      ? "COMPARATIVE_FINALIZATION_PERMIT" as const
      : "BOUNDED_NONRANKING_REPORT_PERMIT" as const,
    execution_id: executionId,
    output_boundary: boundary,
    protocol_identities: state.protocol_binding.expected,
    state_digest: researchSessionStateDigest(state),
    authorization_basis_digest: finalizationAuthorizationBasisDigest(state, boundary),
    limitations_digest: finalizationLimitationsDigest(limitations),
    report_digest: report.report_digest,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + ttlMs).toISOString(),
    key_id: options.keyId,
    domain: "askrigor.research.finalization" as const
  };
  const payload = canonicalJson(unsigned);
  return finalizationPermitSchema.parse({
    ...unsigned,
    permit_payload_sha256: sha256(payload),
    signature: createHmac(
      "sha256",
      finalizationPermitSigningKey(options.signingSecret)
    ).update(payload).digest("base64url")
  });
}

function finalizationAuthorizationBasisDigest(
  state: ResearchSessionState,
  boundary: Exclude<ResearchOutputBoundary, "CONTINUE_RESEARCH">
): string {
  if (boundary === "FINALIZATION_ALLOWED") {
    if (
      state.final_completion_audit?.status !== "PASS" ||
      state.final_completion_audit.basis_digest !== finalCompletionAuditBasisDigest(state)
    ) throw new ResearchFinalizationPermitError();
    return state.final_completion_audit.basis_digest;
  }
  const treatment = currentTreatmentLandscapeAssessment(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state)
  );
  if (treatment?.answer_boundary !== "bounded_nonranking_only") {
    throw new ResearchFinalizationPermitError();
  }
  return sha256(canonicalJson({
    output_boundary: boundary,
    treatment_assessment: treatment,
    terminal_operations: Object.entries(state.operations).flatMap(
      ([operationId, operation]) => operation.status === "BLOCKED_TERMINAL"
        ? [{ operation_id: operationId, boundary: operation.boundary }]
        : []
    )
  }));
}

function finalizationLimitationsDigest(
  limitations: readonly ResearchFinalizationLimitation[]
): string {
  return sha256(canonicalJson(limitations));
}

function unsignedFinalizationPermit(permit: FinalizationPermit) {
  const {
    permit_payload_sha256: _payloadHash,
    signature: _signature,
    ...unsigned
  } = permit;
  return unsigned;
}

function finalizationPermitSigningKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(FINALIZATION_PERMIT_KEY_DOMAIN).digest();
}

function validateFinalizationSigningSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < FINALIZATION_PERMIT_MIN_SECRET_BYTES) {
    throw new Error("Research finalization signing secret must contain at least 32 UTF-8 bytes");
  }
}

function readFinalizationClock(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Research finalization clock is invalid");
  }
  return value;
}

function providerPlainLabel(provider: ResearchFinalizationLimitation["provider"]): string {
  const labels = {
    crossref: "Crossref publication records",
    forrt: "the FORRT replication registry",
    retraction_watch: "Retraction Watch records",
    pubpeer: "PubPeer discussions",
    epistemonikos: "Epistemonikos review links",
    scite: "Scite citation context"
  } as const;
  return labels[provider!];
}

function providerCoverageLimitation(
  label: string,
  outcome: ResearchFormalEvidenceState["sources"][number]["external_evidence"]["provider_coverage"][number]["provider_outcome"]
): string | undefined {
  if (outcome === "records_available") return undefined;
  if (outcome === "no_match_in_provider") {
    return `${label} reported no match for this exact study. That result applies only to this provider and cannot rule out relevant issues or related work elsewhere.`;
  }
  if (outcome === "not_configured") {
    return `${label} was not available in this run, so no favorable or unfavorable conclusion was drawn from that source.`;
  }
  if (outcome === "partial") {
    return `${label} returned only partial coverage for this exact study.`;
  }
  if (outcome === "rate_limited") {
    return `${label} could not be completed because the provider temporarily limited access.`;
  }
  return `${label} could not be completed for this exact study; the missing coverage remains an explicit limitation.`;
}

function publicationIntegrityLimitation(
  state: NonNullable<ResearchFormalEvidenceState["sources"][number]["external_evidence"]["publication_integrity"]>["record_state"]
): string {
  const values = {
    active_retraction_or_withdrawal:
      "This study has an active retraction or withdrawal record and is excluded from ordinary treatment-effect claims.",
    expression_of_concern_recorded:
      "This study has an expression of concern and cannot serve as the sole or decisive support for a conclusion.",
    correction_recorded:
      "This study has a correction record; conclusions must use the audited corrected version and preserve that history.",
    update_recorded:
      "This study has an update record; conclusions must use the audited current version and preserve that history.",
    reinstatement_recorded:
      "This study has a reinstatement history; the reinstatement does not erase the earlier publication record.",
    other_update_recorded:
      "This study has another publication update that remains part of its evidential history.",
    state_uncertain:
      "The study's current publication status is uncertain, so its claims remain limited accordingly.",
    no_update_marker_found: "No publication-update limitation was generated."
  } as const;
  return values[state];
}

export function researchSessionStateDigest(rawState: ResearchSessionState): string {
  const state = researchSessionStateSchema.parse(rawState);
  return createHash("sha256").update(JSON.stringify(state), "utf8").digest("hex");
}

export function assertResearchSessionTransition(
  rawPrevious: ResearchSessionState,
  rawNext: ResearchSessionState
): void {
  const previous = researchSessionStateSchema.parse(rawPrevious);
  const next = researchSessionStateSchema.parse(rawNext);
  if (
    previous.research_target !== next.research_target ||
    previous.diagnosis_status !== next.diagnosis_status ||
    !sameProtocols(
      previous.protocol_binding.expected,
      next.protocol_binding.expected
    )
  ) {
    throw new Error("Research session identity is immutable");
  }
  if (
    previous.protocol_binding.currency === "DRIFTED" &&
    next.protocol_binding.currency !== "DRIFTED"
  ) {
    throw new Error("Protocol drift cannot be cleared without a new execution");
  }
  for (const moduleId of RESEARCH_MODULE_IDS) {
    if (
      previous.modules[moduleId].applicability === "REQUIRED" &&
      next.modules[moduleId].applicability !== "REQUIRED"
    ) {
      throw new Error(`Required research module ${moduleId} cannot be demoted`);
    }
  }
  for (const operationId of RESEARCH_OPERATION_IDS) {
    const before = previous.operations[operationId].status;
    const after = next.operations[operationId].status;
    if (
      before === "COMPLETE" &&
      after !== "COMPLETE" &&
      !formalEvidenceExpansionJustifiesReopen(previous, next, operationId) &&
      !bidirectionalEvidenceExpansionJustifiesReopen(previous, next, operationId) &&
      !lateEvidenceExpansionJustifiesReopen(previous, next, operationId)
    ) {
      throw new Error(`Completed operation ${operationId} cannot regress`);
    }
    if (before === "BLOCKED_TERMINAL" && after !== "BLOCKED_TERMINAL") {
      throw new Error(`Terminal operation ${operationId} cannot be silently reopened`);
    }
  }
  if (
    previous.scout.status === "COMPLETE" &&
    JSON.stringify(previous.scout) !== JSON.stringify(next.scout)
  ) {
    throw new Error("Completed scout evidence is immutable");
  }
  if (
    previous.operations.automated_video_scout.status === "COMPLETE" &&
    JSON.stringify(previous.candidate_discovery.external_scout) !==
      JSON.stringify(next.candidate_discovery.external_scout)
  ) {
    throw new Error("Completed external candidate frontier is immutable");
  }
  if (
    previous.operations.native_video_discovery.status === "COMPLETE" &&
    JSON.stringify(previous.candidate_discovery.native_youtube) !==
      JSON.stringify(next.candidate_discovery.native_youtube)
  ) {
    throw new Error("Completed native candidate frontier is immutable");
  }
  if (
    previous.operations.candidate_screening.status === "COMPLETE" &&
    JSON.stringify(previous.candidate_discovery.candidates) !==
      JSON.stringify(next.candidate_discovery.candidates)
  ) {
    throw new Error("Completed candidate screening records are immutable");
  }
  assertVideoDepthTransition(previous.video_depth, next.video_depth);
  assertBoundedEvidenceTransition(
    previous.bounded_evidence,
    next.bounded_evidence
  );
  assertFormalEvidenceTransition(previous, next);
  assertBidirectionalIterationTransition(
    previous.bidirectional_iteration,
    next.bidirectional_iteration
  );
  assertTreatmentFinalizationTransition(
    previous.treatment_finalization,
    next.treatment_finalization
  );
  assertReportTransition(previous.report, next.report);
  assertFinalCompletionAuditTransition(previous, next);
}

function formalEvidenceExpansionJustifiesReopen(
  previous: ResearchSessionState,
  next: ResearchSessionState,
  operationId: ResearchOperationId
): boolean {
  if (operationId === "formal_evidence_search") {
    const priorIds = new Set(previous.formal_evidence.hypotheses.map(({ hypothesis_id }) =>
      hypothesis_id
    ));
    return next.formal_evidence.hypotheses.some(({ hypothesis_id }) =>
      !priorIds.has(hypothesis_id)
    );
  }
  if (![
    "accessible_full_text_acquisition",
    "study_method_audit",
    "external_study_evidence_audit",
    "linked_replication_and_review_audit",
    "claim_capability_recalculation"
  ].includes(operationId)) return false;

  const before = new Set(previous.formal_evidence.sources
    .filter(({ decision_importance }) => decision_importance === "DECISION_IMPORTANT")
    .map(({ source_id }) => source_id));
  const after = new Set(next.formal_evidence.sources
    .filter(({ decision_importance }) => decision_importance === "DECISION_IMPORTANT")
    .map(({ source_id }) => source_id));
  return [...after].some((sourceId) => !before.has(sourceId));
}

function bidirectionalEvidenceExpansionJustifiesReopen(
  previous: ResearchSessionState,
  next: ResearchSessionState,
  operationId: ResearchOperationId
): boolean {
  if (operationId !== "bidirectional_evidence_return") return false;
  return bidirectionalEvidenceBasisDigestForSession(previous) !==
    bidirectionalEvidenceBasisDigestForSession(next);
}

function lateEvidenceExpansionJustifiesReopen(
  previous: ResearchSessionState,
  next: ResearchSessionState,
  operationId: ResearchOperationId
): boolean {
  if (operationId === "treatment_landscape_finalization") {
    return treatmentEvidenceBasisDigest(treatmentFinalizationEvidence(previous)) !==
      treatmentEvidenceBasisDigest(treatmentFinalizationEvidence(next));
  }
  if (operationId === "report_synthesis") {
    return reportEvidenceBasisForSession(previous) !==
      reportEvidenceBasisForSession(next);
  }
  if (operationId === "final_completion_audit") {
    return finalCompletionAuditBasisDigest(previous) !==
      finalCompletionAuditBasisDigest(next);
  }
  return false;
}

function protocolIdentity(
  protocol: "universal" | "hrp",
  manifest: ProtocolManifest
) {
  return {
    protocol,
    name: manifest.name,
    version: manifest.version,
    revision_date: manifest.revisionDate,
    sha256: manifest.sha256
  };
}

function requireDepthReady(rawState: ResearchSessionState): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (state.operations.candidate_screening.status !== "COMPLETE") {
    throw new Error("Selected-video depth work requires completed candidate screening");
  }
  assertVideoDepthMatchesSelection(state.video_depth, state.candidate_discovery);
  return state;
}

function requireFormalReady(rawState: ResearchSessionState): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (state.operations.candidate_screening.status !== "COMPLETE") {
    throw new Error("Formal evidence work requires completed candidate screening");
  }
  if (
    state.formal_evidence.candidate_screening_digest !==
      candidateScreeningResultDigest(state.candidate_discovery)
  ) {
    throw new Error("Formal evidence frontier is stale or bound to different candidates");
  }
  return state;
}

function requireBidirectionalReady(
  rawState: ResearchSessionState,
  requireUpstreamTerminal = true
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (state.modules.BIDIRECTIONAL_ITERATION.applicability !== "REQUIRED") {
    throw new Error("Bidirectional iteration is not required by current server routing");
  }
  if (
    !operationCompleteOrTerminal(state.operations.transcript_acquisition) ||
    !operationCompleteOrTerminal(state.operations.community_discussion_audit) ||
    !operationCompleteOrTerminal(state.operations.video_evidence_synthesis)
  ) {
    throw new Error("Bidirectional iteration requires terminal selected-video receipts and bounded findings");
  }
  if (
    requireUpstreamTerminal &&
    !formalPipelineTerminal(state)
  ) {
    throw new Error("Bidirectional iteration requires terminal formal claim-capability work");
  }
  return state;
}

function requireTreatmentFinalizationReady(
  rawState: ResearchSessionState
): ResearchSessionState {
  const state = requireCurrentProtocols(rawState);
  if (!operationCompleteOrTerminal(state.operations.bidirectional_evidence_return)) {
    throw new Error("Treatment finalization requires resolved bidirectional evidence return");
  }
  return state;
}

function withFormalEvidence(
  state: ResearchSessionState,
  rawFormalEvidence: ResearchFormalEvidenceState
): ResearchSessionState {
  const formalEvidence = reconcileFormalEvidenceLinkedWork(rawFormalEvidence);
  const operations = { ...state.operations };
  for (const capability of [
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "external_study_evidence_audit",
    "linked_replication_and_review_audit",
    "claim_capability_recalculation"
  ] as const) {
    operations[capability] = formalEvidenceOperationProjection(
      formalEvidence,
      capability
    );
  }
  const draft = {
    ...state,
    operations,
    formal_evidence: formalEvidence
  } as ResearchSessionState;
  operations.bidirectional_evidence_return = bidirectionalOperationProjection(draft);
  const lateDraft = { ...draft, operations } as ResearchSessionState;
  operations.treatment_landscape_finalization =
    treatmentFinalizationOperationProjection(lateDraft);
  operations.report_synthesis = reportSynthesisOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  const modules = projectFinalAuditModule(
    projectBidirectionalModule(
      state.modules,
      operations.bidirectional_evidence_return
    ),
    operations.final_completion_audit
  );
  return parseProjectedResearchSessionState({
    ...state,
    modules,
    operations,
    formal_evidence: formalEvidence
  });
}

function withVideoDepth(
  state: ResearchSessionState,
  rawVideoDepth: ResearchSessionState["video_depth"],
): ResearchSessionState {
  const videoDepth = researchVideoDepthStateSchema.parse(rawVideoDepth);
  const boundedEvidence = reconcileVideoEvidenceBoundaries(
    state.bounded_evidence,
    videoDepth
  );
  const operations = {
    ...state.operations,
    transcript_acquisition: videoDepthOperationProjection(
      videoDepth,
      "transcript_acquisition",
    ),
    community_discussion_audit: videoDepthOperationProjection(
      videoDepth,
      "community_discussion_audit",
    ),
    video_evidence_synthesis: videoEvidenceOperationProjection(
      boundedEvidence,
      videoDepth
    )
  };
  const draft = {
    ...state,
    operations,
    video_depth: videoDepth,
    bounded_evidence: boundedEvidence
  } as ResearchSessionState;
  operations.bidirectional_evidence_return = bidirectionalOperationProjection(draft);
  const lateDraft = { ...draft, operations } as ResearchSessionState;
  operations.treatment_landscape_finalization =
    treatmentFinalizationOperationProjection(lateDraft);
  operations.report_synthesis = reportSynthesisOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...lateDraft,
    operations,
  } as ResearchSessionState);
  return parseProjectedResearchSessionState({
    ...state,
    modules: projectFinalAuditModule(
      projectBidirectionalModule(state.modules, operations.bidirectional_evidence_return),
      operations.final_completion_audit,
    ),
    operations,
    video_depth: videoDepth,
    bounded_evidence: boundedEvidence
  });
}

function withBoundedEvidence(
  state: ResearchSessionState,
  rawBoundedEvidence: ResearchBoundedEvidenceState
): ResearchSessionState {
  const boundedEvidence = reconcileVideoEvidenceBoundaries(
    researchBoundedEvidenceStateSchema.parse(rawBoundedEvidence),
    state.video_depth
  );
  const operations = {
    ...state.operations,
    video_evidence_synthesis: videoEvidenceOperationProjection(
      boundedEvidence,
      state.video_depth
    )
  };
  const draft = { ...state, operations, bounded_evidence: boundedEvidence } as ResearchSessionState;
  operations.bidirectional_evidence_return = bidirectionalOperationProjection(draft);
  const lateDraft = { ...draft, operations } as ResearchSessionState;
  operations.treatment_landscape_finalization =
    treatmentFinalizationOperationProjection(lateDraft);
  operations.report_synthesis = reportSynthesisOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  return parseProjectedResearchSessionState({
    ...state,
    modules: projectFinalAuditModule(
      projectBidirectionalModule(state.modules, operations.bidirectional_evidence_return),
      operations.final_completion_audit
    ),
    operations,
    bounded_evidence: boundedEvidence
  });
}

function withBidirectionalIteration(
  state: ResearchSessionState,
  rawBidirectional: ResearchBidirectionalIterationState
): ResearchSessionState {
  const bidirectional = researchBidirectionalIterationStateSchema.parse(rawBidirectional);
  const draft = { ...state, bidirectional_iteration: bidirectional } as ResearchSessionState;
  const operation = bidirectionalOperationProjection(draft);
  const operations = {
    ...state.operations,
    bidirectional_evidence_return: operation
  };
  const lateDraft = { ...draft, operations } as ResearchSessionState;
  operations.treatment_landscape_finalization =
    treatmentFinalizationOperationProjection(lateDraft);
  operations.report_synthesis = reportSynthesisOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...lateDraft,
    operations
  } as ResearchSessionState);
  return parseProjectedResearchSessionState({
    ...state,
    modules: projectFinalAuditModule(
      projectBidirectionalModule(state.modules, operation),
      operations.final_completion_audit
    ),
    operations,
    bidirectional_iteration: bidirectional
  });
}

function withTreatmentFinalization(
  state: ResearchSessionState,
  rawTreatment: ResearchTreatmentFinalizationState
): ResearchSessionState {
  const treatment = researchTreatmentFinalizationStateSchema.parse(rawTreatment);
  const draft = { ...state, treatment_finalization: treatment } as ResearchSessionState;
  const treatmentOperation = treatmentFinalizationOperationProjection(draft);
  const operations = {
    ...state.operations,
    treatment_landscape_finalization: treatmentOperation
  };
  operations.report_synthesis = reportSynthesisOperationProjection({
    ...draft,
    operations
  } as ResearchSessionState);
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...draft,
    operations
  } as ResearchSessionState);
  return parseProjectedResearchSessionState({
    ...state,
    modules: projectFinalAuditModule(
      state.modules,
      operations.final_completion_audit
    ),
    operations,
    treatment_finalization: treatment
  });
}

function withReport(
  state: ResearchSessionState,
  rawReport: ResearchReportState
): ResearchSessionState {
  const report = researchReportStateSchema.parse(rawReport);
  const draft = { ...state, report } as ResearchSessionState;
  const reportOperation = reportSynthesisOperationProjection(draft);
  const operations = {
    ...state.operations,
    report_synthesis: reportOperation
  };
  operations.final_completion_audit = finalCompletionAuditOperationProjection({
    ...draft,
    operations
  } as ResearchSessionState);
  return parseProjectedResearchSessionState({
    ...state,
    modules: projectFinalAuditModule(state.modules, operations.final_completion_audit),
    operations,
    report
  });
}

function bidirectionalEvidenceState(state: ResearchSessionState) {
  return {
    candidates: state.candidate_discovery,
    videoDepth: state.video_depth,
    formalEvidence: state.formal_evidence
  };
}

function bidirectionalOperationProjection(
  state: Pick<ResearchSessionState,
    "candidate_discovery" | "video_depth" | "formal_evidence" |
    "bidirectional_iteration">
): ResearchSessionState["operations"]["bidirectional_evidence_return"] {
  const status = deriveBidirectionalIterationStatus(
    state.bidirectional_iteration,
    bidirectionalEvidenceState(state as ResearchSessionState)
  );
  if (status === "BLOCKED_RETRYABLE") {
    return {
      status,
      boundary: {
        classification: "RETRYABLE",
        code: "BIDIRECTIONAL_RETURN_RETRYABLE",
        summary: "At least one exact cross-layer return search has retryable work remaining."
      }
    };
  }
  if (status === "BLOCKED_TERMINAL") {
    return {
      status,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "BIDIRECTIONAL_RETURN_TERMINAL_BOUNDARY",
        summary: "Cross-layer iteration reached a source-specific nonretryable boundary."
      }
    };
  }
  return { status };
}

function projectBidirectionalModule(
  modules: ResearchSessionState["modules"],
  operation: ResearchSessionState["operations"]["bidirectional_evidence_return"]
): ResearchSessionState["modules"] {
  if (modules.BIDIRECTIONAL_ITERATION.applicability !== "REQUIRED") return modules;
  const executionStatus = operation.status === "COMPLETE"
    ? "COMPLETE" as const
    : operation.status === "BLOCKED_RETRYABLE" ||
        operation.status === "BLOCKED_TERMINAL"
      ? "BLOCKED" as const
      : operation.status === "IN_PROGRESS"
        ? "IN_PROGRESS" as const
        : "NOT_STARTED" as const;
  return {
    ...modules,
    BIDIRECTIONAL_ITERATION: {
      ...modules.BIDIRECTIONAL_ITERATION,
      execution_status: executionStatus,
      authority: "SERVER_EVIDENCE"
    }
  };
}

function treatmentFinalizationEvidence(state: ResearchSessionState) {
  return {
    researchTarget: state.research_target,
    candidates: state.candidate_discovery,
    videoDepth: state.video_depth,
    formalEvidence: state.formal_evidence,
    bidirectional: state.bidirectional_iteration
  };
}

function treatmentFinalizationOperationProjection(
  state: Pick<ResearchSessionState,
    "research_target" | "candidate_discovery" | "video_depth" |
    "formal_evidence" | "bidirectional_iteration" | "treatment_finalization">
): ResearchSessionState["operations"]["treatment_landscape_finalization"] {
  const status = deriveTreatmentFinalizationStatus(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state as ResearchSessionState)
  );
  if (status === "BLOCKED_TERMINAL") {
    return {
      status,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "TREATMENT_LANDSCAPE_BOUNDED_NONRANKING",
        summary: "The current treatment landscape permits only bounded nonranking output."
      }
    };
  }
  return { status };
}

function videoEvidenceOperationProjection(
  boundedEvidence: ResearchBoundedEvidenceState,
  videoDepth: ResearchSessionState["video_depth"]
): ResearchSessionState["operations"]["video_evidence_synthesis"] {
  const status = deriveVideoEvidenceStatus(boundedEvidence, videoDepth);
  if (status === "BLOCKED_TERMINAL") {
    return {
      status,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "VIDEO_EVIDENCE_BOUNDED_TERMINAL",
        summary: "At least one selected video could not support transcript-verified creator findings or a complete public-discussion audit."
      }
    };
  }
  return { status };
}

function reportSynthesisEvidence(state: ResearchSessionState) {
  return {
    researchTarget: state.research_target,
    candidates: state.candidate_discovery,
    boundedEvidence: state.bounded_evidence,
    formalEvidence: state.formal_evidence,
    treatment: state.treatment_finalization,
    limitations: deriveResearchFinalizationLimitationsFromState(state).map((limitation) => ({
      limitation_id: limitation.limitation_id,
      plain_language: limitation.plain_language
    }))
  };
}

function reportSynthesisOperationProjection(
  state: ResearchSessionState
): ResearchSessionState["operations"]["report_synthesis"] {
  if (!operationCompleteOrTerminal(state.operations.treatment_landscape_finalization)) {
    return { status: "NOT_STARTED" };
  }
  return { status: deriveReportSynthesisStatus(state.report, reportSynthesisEvidence(state)) };
}

function finalCompletionAuditOperationProjection(
  state: ResearchSessionState
): ResearchSessionState["operations"]["final_completion_audit"] {
  if (state.final_completion_audit === undefined) return { status: "NOT_STARTED" };
  if (
    state.final_completion_audit.basis_digest !== finalCompletionAuditBasisDigest(state) ||
    state.final_completion_audit.status !== "PASS"
  ) return { status: "IN_PROGRESS" };
  return { status: "COMPLETE" };
}

function projectFinalAuditModule(
  modules: ResearchSessionState["modules"],
  operation: ResearchSessionState["operations"]["final_completion_audit"]
): ResearchSessionState["modules"] {
  if (modules.FINAL_COMPLETION_AUDIT.applicability !== "REQUIRED") return modules;
  return {
    ...modules,
    FINAL_COMPLETION_AUDIT: {
      ...modules.FINAL_COMPLETION_AUDIT,
      execution_status: operation.status === "COMPLETE"
        ? "COMPLETE"
        : operation.status === "IN_PROGRESS"
          ? "IN_PROGRESS"
          : "NOT_STARTED",
      authority: "SERVER_EVIDENCE"
    }
  };
}

function parseProjectedResearchSessionState(input: unknown): ResearchSessionState {
  const state = researchSessionStateSchema.parse(input);
  const modules = projectAllResearchModules(state.modules, state.operations);
  if (JSON.stringify(modules) === JSON.stringify(state.modules)) return state;
  return researchSessionStateSchema.parse({ ...state, modules });
}

function projectAllResearchModules(
  rawModules: ResearchSessionState["modules"],
  operations: ResearchSessionState["operations"]
): ResearchSessionState["modules"] {
  let modules = rawModules;
  modules = projectOperationGroupModule(modules, "FORUM_SIGNAL", [
    operations.automated_video_scout,
    operations.native_video_discovery,
    operations.candidate_screening,
    operations.transcript_acquisition,
    operations.community_discussion_audit,
    operations.video_evidence_synthesis
  ]);
  modules = projectOperationGroupModule(modules, "DIRECT_HUMAN", [
    operations.formal_evidence_search,
    operations.accessible_full_text_acquisition,
    operations.study_method_audit
  ]);
  modules = projectOperationGroupModule(modules, "EXTENDED_GREY", [
    operations.external_study_evidence_audit,
    operations.linked_replication_and_review_audit,
    operations.claim_capability_recalculation
  ]);
  modules = projectOperationGroupModule(modules, "BIDIRECTIONAL_ITERATION", [
    operations.bidirectional_evidence_return
  ]);
  modules = projectOperationGroupModule(modules, "HRP", Object.entries(operations)
    .filter(([operationId]) => operationId !== "final_completion_audit")
    .map(([, operation]) => operation), true);
  return projectFinalAuditModule(modules, operations.final_completion_audit);
}

function projectOperationGroupModule(
  modules: ResearchSessionState["modules"],
  moduleId: Exclude<ResearchModuleId, "FINAL_COMPLETION_AUDIT">,
  operations: ResearchSessionState["operations"][ResearchOperationId][],
  startsInProgress = false
): ResearchSessionState["modules"] {
  const current = modules[moduleId];
  if (current.applicability !== "REQUIRED") return modules;
  const status = operationGroupExecutionStatus(operations, startsInProgress);
  if (status === current.execution_status) return modules;
  return {
    ...modules,
    [moduleId]: {
      ...current,
      execution_status: status,
      authority: "SERVER_EVIDENCE"
    }
  };
}

function operationGroupExecutionStatus(
  operations: ResearchSessionState["operations"][ResearchOperationId][],
  startsInProgress: boolean
): ResearchSessionState["modules"][ResearchModuleId]["execution_status"] {
  if (operations.every(({ status }) => status === "COMPLETE")) return "COMPLETE";
  if (operations.some(({ status }) =>
    status === "BLOCKED_RETRYABLE" || status === "BLOCKED_TERMINAL"
  )) return "BLOCKED";
  if (
    startsInProgress ||
    operations.some(({ status }) => status === "IN_PROGRESS" || status === "COMPLETE")
  ) return "IN_PROGRESS";
  return "NOT_STARTED";
}

function formalEvidenceOperationProjection(
  formalEvidence: ResearchFormalEvidenceState,
  capability:
    | "formal_evidence_search"
    | "accessible_full_text_acquisition"
    | "study_method_audit"
    | "external_study_evidence_audit"
    | "linked_replication_and_review_audit"
    | "claim_capability_recalculation"
): ResearchSessionState["operations"][typeof capability] {
  const status = deriveFormalEvidenceOperationStatus(formalEvidence, capability);
  if (status === "BLOCKED_RETRYABLE") {
    return {
      status,
      boundary: {
        classification: "RETRYABLE",
        code: "FORMAL_EVIDENCE_RETRYABLE",
        summary: "At least one exact formal-evidence source or provider has retryable work remaining."
      }
    };
  }
  if (status === "BLOCKED_TERMINAL") {
    return {
      status,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: "FORMAL_EVIDENCE_CLAIM_LOCAL_BOUNDARY",
        summary: "At least one decision-important source remains unseen, invalidated, or claim-locally bounded and cannot authorize unrestricted use."
      }
    };
  }
  return { status };
}

function videoDepthOperationProjection(
  videoDepth: ResearchSessionState["video_depth"],
  capability: "transcript_acquisition" | "community_discussion_audit"
): ResearchSessionState["operations"][typeof capability] {
  const status = deriveVideoDepthOperationStatus(videoDepth, capability);
  if (status === "BLOCKED_RETRYABLE") {
    return {
      status,
      boundary: {
        classification: "RETRYABLE",
        code: capability === "transcript_acquisition"
          ? "TRANSCRIPT_DEPTH_RETRYABLE"
          : "DISCUSSION_DEPTH_RETRYABLE",
        summary: capability === "transcript_acquisition"
          ? "At least one selected transcript has retryable or restart-required work."
          : "At least one selected discussion has retryable or restart-required work."
      }
    };
  }
  if (status === "BLOCKED_TERMINAL") {
    return {
      status,
      boundary: {
        classification: "TERMINAL_NONRETRYABLE",
        code: capability === "transcript_acquisition"
          ? "TRANSCRIPT_DEPTH_TERMINAL_BOUNDARY"
          : "DISCUSSION_DEPTH_TERMINAL_BOUNDARY",
        summary: capability === "transcript_acquisition"
          ? "Every selected transcript is complete or has a recognized terminal boundary."
          : "Every selected discussion is complete or has a recognized terminal boundary."
      }
    };
  }
  return { status };
}

function assertVideoDepthTransition(
  previous: ResearchSessionState["video_depth"],
  next: ResearchSessionState["video_depth"]
): void {
  if (previous.selection_digest !== undefined) {
    if (
      previous.selection_digest !== next.selection_digest ||
      JSON.stringify(previous.selected_video_ids) !==
        JSON.stringify(next.selected_video_ids)
    ) {
      throw new Error("Selected video depth frontier is immutable");
    }
  }
  for (const key of ["transcripts", "discussions"] as const) {
    const beforeById = new Map(previous[key].map((record) => [
      record.source.video_id,
      record
    ]));
    for (const after of next[key]) {
      const before = beforeById.get(after.source.video_id);
      if (before === undefined) continue;
      if (JSON.stringify(before.source) !== JSON.stringify(after.source)) {
        throw new Error("Selected video source identity is immutable");
      }
      if (
        (before.status === "COMPLETE" || before.status === "BLOCKED_TERMINAL") &&
        JSON.stringify(before) !== JSON.stringify(after)
      ) {
        throw new Error("Completed or terminal per-video depth evidence is immutable");
      }
      if (after.attempt < before.attempt || after.attempt > before.attempt + 1) {
        throw new Error("Per-video depth attempts must advance monotonically one at a time");
      }
      if (
        after.attempt === before.attempt + 1 &&
        after.status !== "RESTART_REQUIRED"
      ) {
        throw new Error("A new per-video attempt must begin with an explicit restart state");
      }
    }
    if (previous[key].length > 0 && previous[key].length !== next[key].length) {
      throw new Error("Selected video depth records cannot be added or removed");
    }
  }
}

function assertFormalEvidenceTransition(
  previous: ResearchSessionState,
  next: ResearchSessionState
): void {
  const before = previous.formal_evidence;
  const after = next.formal_evidence;
  if (before.hypothesis_frontier_digest !== undefined) {
    if (
      before.candidate_screening_digest !== after.candidate_screening_digest ||
      after.hypotheses.length < before.hypotheses.length
    ) {
      throw new Error("Formal hypothesis frontier is append-only");
    }
    for (const priorHypothesis of before.hypotheses) {
      const laterHypothesis = after.hypotheses.find(({ hypothesis_id }) =>
        hypothesis_id === priorHypothesis.hypothesis_id
      );
      if (laterHypothesis === undefined) {
        throw new Error("Formal hypothesis records cannot be removed or renamed");
      }
      const priorCore = { ...priorHypothesis, provider_searches: undefined };
      const laterCore = { ...laterHypothesis, provider_searches: undefined };
      if (JSON.stringify(priorCore) !== JSON.stringify(laterCore)) {
        throw new Error("Formal program/outcome hypothesis identity is immutable");
      }
      for (const priorSearch of priorHypothesis.provider_searches) {
        const laterSearch = laterHypothesis.provider_searches.find(({ provider }) =>
          provider === priorSearch.provider
        );
        if (laterSearch === undefined) throw new Error("Formal provider search cannot disappear");
        if (
          (priorSearch.status === "COMPLETE" || priorSearch.status === "BLOCKED_TERMINAL") &&
          JSON.stringify(priorSearch) !== JSON.stringify(laterSearch)
        ) {
          throw new Error("Completed or terminal formal provider evidence is immutable");
        }
        if (
          laterSearch.pages_retrieved < priorSearch.pages_retrieved ||
          laterSearch.records_returned_cumulative < priorSearch.records_returned_cumulative ||
          laterSearch.page_receipt_hashes.slice(0, priorSearch.page_receipt_hashes.length)
            .some((hash, index) => hash !== priorSearch.page_receipt_hashes[index])
        ) {
          throw new Error("Formal provider receipt chains must advance monotonically");
        }
      }
    }
    const priorHypothesisIds = new Set(before.hypotheses.map(({ hypothesis_id }) =>
      hypothesis_id
    ));
    const communityReferenceVideos = communityEvidenceReferenceVideos(next);
    const transfers = next.bidirectional_iteration.rounds.flatMap((round) =>
      round.community_to_formal_transfers
    );
    for (const hypothesis of after.hypotheses) {
      if (priorHypothesisIds.has(hypothesis.hypothesis_id)) continue;
      const transfer = transfers.find((candidate) =>
        candidate.formal_hypothesis_id === hypothesis.hypothesis_id &&
        candidate.status === "FORMAL_HYPOTHESIS_APPENDED"
      );
      if (transfer === undefined) {
        throw new Error("New formal hypotheses require an exact community-to-formal transfer receipt");
      }
      const sourceVideoIds = [...new Set(transfer.source_evidence_ref_ids.map((refId) =>
        communityReferenceVideos.get(refId)
      ))].sort();
      if (sourceVideoIds.some((videoId) => videoId === undefined)) {
        throw new Error("Community-to-formal transfer cites an unresolved source receipt");
      }
      const transferCore = {
        source_video_ids: sourceVideoIds,
        program_signature: transfer.program_signature,
        treatment_class: transfer.treatment_class,
        claim_summary: transfer.claim_summary,
        program: transfer.program,
        formal_query: transfer.formal_query
      };
      const hypothesisCore = {
        source_video_ids: hypothesis.source_video_ids,
        program_signature: hypothesis.program_signature,
        treatment_class: hypothesis.treatment_class,
        claim_summary: hypothesis.claim_summary,
        program: hypothesis.program,
        formal_query: hypothesis.formal_query
      };
      if (JSON.stringify(transferCore) !== JSON.stringify(hypothesisCore)) {
        throw new Error("New formal hypothesis must match its exact community transfer");
      }
    }
  }
  const laterById = new Map(after.sources.map((source) => [source.source_id, source]));
  for (const prior of before.sources) {
    const later = laterById.get(prior.source_id);
    if (later === undefined) throw new Error("Formal sources cannot be removed or renamed");
    for (const key of ["doi", "pmid", "pmcid"] as const) {
      if (prior.identity[key] !== undefined && prior.identity[key] !== later.identity[key]) {
        throw new Error("Formal source stable identifiers are immutable");
      }
    }
    if (prior.screening_status === "SCREENED") {
      const priorScreening = {
        source_kind: prior.source_kind,
        decision_importance: prior.decision_importance,
        possible_decision_impact: prior.possible_decision_impact,
        screening_rationale: prior.screening_rationale
      };
      const laterScreening = {
        source_kind: later.source_kind,
        decision_importance: later.decision_importance,
        possible_decision_impact: later.possible_decision_impact,
        screening_rationale: later.screening_rationale
      };
      const evidenceUpgrade =
        prior.decision_importance === "NOT_DECISION_IMPORTANT" &&
        later.decision_importance === "DECISION_IMPORTANT" &&
        later.origins.some(({ provider }) => provider === "external_evidence");
      if (
        JSON.stringify(priorScreening) !== JSON.stringify(laterScreening) &&
        !evidenceUpgrade
      ) {
        throw new Error("Completed formal source screening is immutable");
      }
    }
    if (
      (prior.full_text.status === "EXHAUSTED" || prior.full_text.status === "LEAD_BOUNDARY") &&
      JSON.stringify(prior.full_text) !== JSON.stringify(later.full_text)
    ) {
      throw new Error("Exhausted or terminal full-text evidence is immutable");
    }
    if (
      prior.method_audit.status === "COMPLETE" &&
      JSON.stringify({
        ...prior.method_audit,
        external_receipt_payload_sha256: undefined,
        external_bound_audit_sha256: undefined
      }) !== JSON.stringify({
        ...later.method_audit,
        external_receipt_payload_sha256: undefined,
        external_bound_audit_sha256: undefined
      })
    ) {
      throw new Error("Completed source-linked method audit is immutable");
    }
    const priorExternalEvidenceIsTerminal =
      ["COMPLETE", "BOUNDED_NONRETRYABLE"].includes(
        prior.external_evidence.status
      ) ||
      (
        prior.external_evidence.status === "NOT_APPLICABLE" &&
        prior.screening_status === "SCREENED"
      );
    if (
      priorExternalEvidenceIsTerminal &&
      JSON.stringify({ ...prior.external_evidence, linked_work: undefined }) !==
        JSON.stringify({ ...later.external_evidence, linked_work: undefined })
    ) {
      throw new Error("Completed or terminal external-study evidence is immutable");
    }
  }
}

function communityEvidenceReferenceVideos(
  state: ResearchSessionState
): Map<string, string> {
  const videos = new Map<string, string>();
  const transcripts = new Map(state.video_depth.transcripts.map((record) => [
    record.source.video_id,
    record
  ]));
  const discussions = new Map(state.video_depth.discussions.map((record) => [
    record.source.video_id,
    record
  ]));
  for (const videoId of state.video_depth.selected_video_ids) {
    const transcript = transcripts.get(videoId);
    const discussion = discussions.get(videoId);
    if (transcript?.receipt !== undefined && discussion?.receipt !== undefined) {
      const transcriptHash = sha256(JSON.stringify(transcript.receipt));
      const discussionHash = sha256(JSON.stringify(discussion.receipt));
      videos.set(
        sha256(`community-evidence-ref:${videoId}:${transcriptHash}:${discussionHash}`),
        videoId
      );
    }
    videos.set(sha256(`community-evidence-ref:${videoId}:return:return`), videoId);
  }
  return videos;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  ).join(",")}}`;
}

function assertBidirectionalIterationTransition(
  previous: ResearchBidirectionalIterationState,
  next: ResearchBidirectionalIterationState
): void {
  if (
    next.rounds.length < previous.rounds.length ||
    next.rounds.length > previous.rounds.length + 1
  ) {
    throw new Error("Bidirectional rounds must advance monotonically one at a time");
  }
  for (let roundIndex = 0; roundIndex < previous.rounds.length; roundIndex += 1) {
    const before = previous.rounds[roundIndex]!;
    const after = next.rounds[roundIndex];
    if (after === undefined || before.round_id !== after.round_id) {
      throw new Error("Bidirectional round identities cannot be removed or renamed");
    }
    const priorCore = {
      ...before,
      formal_to_community_transfers: before.formal_to_community_transfers.map(
        (transfer) => ({ ...transfer, searches: undefined })
      )
    };
    const laterCore = {
      ...after,
      formal_to_community_transfers: after.formal_to_community_transfers.map(
        (transfer) => ({ ...transfer, searches: undefined })
      )
    };
    if (JSON.stringify(priorCore) !== JSON.stringify(laterCore)) {
      throw new Error("Bidirectional semantic findings and transfer identities are immutable");
    }
    for (const priorTransfer of before.formal_to_community_transfers) {
      const laterTransfer = after.formal_to_community_transfers.find(({ transfer_id }) =>
        transfer_id === priorTransfer.transfer_id
      );
      if (laterTransfer === undefined) {
        throw new Error("Formal-to-community transfer cannot disappear");
      }
      for (const priorSearch of priorTransfer.searches) {
        const laterSearch = laterTransfer.searches.find(({ video_id }) =>
          video_id === priorSearch.video_id
        );
        if (laterSearch === undefined) {
          throw new Error("Bidirectional return-search identity cannot disappear");
        }
        if (
          ["COMPLETE_NO_RESULTS", "COMPLETE_ASSESSED", "BOUNDED_TERMINAL"]
            .includes(priorSearch.status) &&
          JSON.stringify(priorSearch) !== JSON.stringify(laterSearch)
        ) {
          throw new Error("Completed or terminal bidirectional return evidence is immutable");
        }
        if (
          laterSearch.pages_retrieved < priorSearch.pages_retrieved ||
          laterSearch.records_returned_cumulative <
            priorSearch.records_returned_cumulative ||
          laterSearch.page_receipt_hashes.slice(0, priorSearch.page_receipt_hashes.length)
            .some((hash, index) => hash !== priorSearch.page_receipt_hashes[index])
        ) {
          throw new Error("Bidirectional return receipt chains must advance monotonically");
        }
      }
    }
  }
}

function assertTreatmentFinalizationTransition(
  previous: ResearchTreatmentFinalizationState,
  next: ResearchTreatmentFinalizationState
): void {
  if (
    next.attempts.length < previous.attempts.length ||
    next.attempts.length > previous.attempts.length + 1
  ) {
    throw new Error("Treatment-landscape attempts must advance monotonically one at a time");
  }
  for (let index = 0; index < previous.attempts.length; index += 1) {
    if (JSON.stringify(previous.attempts[index]) !== JSON.stringify(next.attempts[index])) {
      throw new Error("Completed treatment-landscape assessor receipts are immutable");
    }
  }
}

function assertBoundedEvidenceTransition(
  previous: ResearchBoundedEvidenceState,
  next: ResearchBoundedEvidenceState
): void {
  if (
    previous.selection_digest === undefined &&
    previous.videos.length === 0
  ) {
    if (
      next.videos.some(({ status }) => status !== "NOT_STARTED") ||
      next.videos.some(({ creator_findings, community_findings, limitations }) =>
        creator_findings.length > 0 || community_findings.length > 0 ||
        limitations.length > 0
      )
    ) {
      throw new Error("Bounded selected-video evidence must initialize without caller-authored findings");
    }
    return;
  }
  if (
    previous.selection_digest !== next.selection_digest ||
    previous.videos.length !== next.videos.length
  ) throw new Error("Bounded selected-video evidence frontier is immutable");
  const nextById = new Map(next.videos.map((video) => [video.video_id, video]));
  for (const prior of previous.videos) {
    const later = nextById.get(prior.video_id);
    if (later === undefined) throw new Error("Bounded video evidence cannot be removed");
    if (
      prior.status !== "NOT_STARTED" &&
      JSON.stringify(prior) !== JSON.stringify(later)
    ) throw new Error("Completed or bounded selected-video findings are immutable");
  }
}

function assertReportTransition(
  previous: ResearchReportState,
  next: ResearchReportState
): void {
  if (
    next.attempts.length < previous.attempts.length ||
    next.attempts.length > previous.attempts.length + 1
  ) throw new Error("Reader-report attempts must advance monotonically one at a time");
  for (let index = 0; index < previous.attempts.length; index += 1) {
    if (JSON.stringify(previous.attempts[index]) !== JSON.stringify(next.attempts[index])) {
      throw new Error("Completed reader-report packets are immutable");
    }
  }
}

function assertFinalCompletionAuditTransition(
  previous: ResearchSessionState,
  next: ResearchSessionState
): void {
  if (previous.final_completion_audit === undefined) return;
  if (
    previous.final_completion_audit.status === "PASS" &&
    previous.final_completion_audit.basis_digest === finalCompletionAuditBasisDigest(previous) &&
    finalCompletionAuditBasisDigest(previous) === finalCompletionAuditBasisDigest(next) &&
    JSON.stringify(previous.final_completion_audit) !==
      JSON.stringify(next.final_completion_audit)
  ) {
    throw new Error("A current passing final completion audit is immutable");
  }
}

function bidirectionalEvidenceBasisDigestForSession(state: ResearchSessionState): string {
  try {
    return bidirectionalEvidenceBasisDigest(bidirectionalEvidenceState(state));
  } catch {
    return createHash("sha256").update(JSON.stringify({
      candidates: state.candidate_discovery,
      video_depth: state.video_depth,
      formal_evidence: state.formal_evidence
    }), "utf8").digest("hex");
  }
}

function reportEvidenceBasisForSession(state: ResearchSessionState): string {
  try {
    return reportEvidenceBasisDigest(reportSynthesisEvidence(state));
  } catch {
    return sha256(canonicalJson({
      candidates: state.candidate_discovery,
      bounded_evidence: state.bounded_evidence,
      formal_evidence: state.formal_evidence,
      treatment: state.treatment_finalization
    }));
  }
}

function formalScreeningWorkPackageOrNull(
  formalEvidence: ResearchFormalEvidenceState
): z.output<typeof formalEvidenceScreeningWorkPackageSchema> | null {
  if (formalEvidence.sources.length === 0 || formalEvidenceScreeningComplete(formalEvidence)) {
    return null;
  }
  try {
    return createFormalEvidenceScreeningWorkPackage(formalEvidence);
  } catch {
    return null;
  }
}

function videoEvidenceWorkPackageOrNull(
  state: ResearchSessionState
): z.output<typeof videoEvidenceWorkPackageSchema> | null {
  const videoId = nextVideoEvidenceId(state.bounded_evidence, state.video_depth);
  if (videoId === undefined) return null;
  try {
    const transcript = state.video_depth.transcripts.find(({ source }) =>
      source.video_id === videoId
    );
    const discussion = state.video_depth.discussions.find(({ source }) =>
      source.video_id === videoId
    );
    if (transcript?.receipt === undefined || discussion?.receipt === undefined) return null;
    return createVideoEvidenceWorkPackage(
      state.bounded_evidence,
      state.candidate_discovery,
      state.video_depth
    );
  } catch {
    return null;
  }
}

function bidirectionalWorkPackageOrNull(
  state: ResearchSessionState
): z.output<typeof bidirectionalIterationWorkPackageSchema> | null {
  if (
    state.modules.BIDIRECTIONAL_ITERATION.applicability !== "REQUIRED" ||
    !operationCompleteOrTerminal(state.operations.transcript_acquisition) ||
    !operationCompleteOrTerminal(state.operations.community_discussion_audit) ||
    !operationCompleteOrTerminal(state.operations.video_evidence_synthesis) ||
    !formalPipelineTerminal(state)
  ) return null;
  try {
    return createBidirectionalIterationWorkPackage(
      state.bidirectional_iteration,
      bidirectionalEvidenceState(state)
    );
  } catch {
    return null;
  }
}

function projectBidirectionalIterationDiagnostics(
  state: ResearchSessionState
): ReturnType<typeof deriveBidirectionalIterationDiagnostics> {
  if (
    !operationCompleteOrTerminal(state.operations.transcript_acquisition) ||
    !operationCompleteOrTerminal(state.operations.community_discussion_audit) ||
    !operationCompleteOrTerminal(state.operations.video_evidence_synthesis) ||
    !formalPipelineTerminal(state)
  ) {
    const rounds = state.bidirectional_iteration.rounds;
    const searches = rounds.flatMap((round) =>
      round.formal_to_community_transfers.flatMap((transfer) => transfer.searches)
    );
    return {
      rounds: rounds.length,
      current_evidence_basis_reviewed: false,
      community_to_formal_passes: rounds.length,
      formal_to_community_passes: rounds.length,
      community_to_formal_transfers: rounds.reduce((count, round) =>
        count + round.community_to_formal_transfers.length, 0),
      formal_to_community_transfers: rounds.reduce((count, round) =>
        count + round.formal_to_community_transfers.length, 0),
      return_searches_pending: searches.filter(({ status }) =>
        status === "NOT_STARTED" || status === "IN_PROGRESS"
      ).length,
      return_assessments_pending: searches.filter(({ status }) =>
        status === "RESULT_ASSESSMENT_REQUIRED"
      ).length,
      retryable_searches: searches.filter(({ status }) =>
        status === "BLOCKED_RETRYABLE"
      ).length,
      terminal_search_boundaries: searches.filter(({ status }) =>
        status === "BOUNDED_TERMINAL"
      ).length,
      open_discordances: rounds.reduce((count, round) =>
        count + round.discordances.filter(({ status }) => status === "OPEN").length,
      0)
    };
  }
  return deriveBidirectionalIterationDiagnostics(
    state.bidirectional_iteration,
    bidirectionalEvidenceState(state)
  );
}

function treatmentWorkPackageOrNull(
  state: ResearchSessionState
): z.output<typeof treatmentLandscapeWorkPackageSchema> | null {
  if (!operationCompleteOrTerminal(state.operations.bidirectional_evidence_return)) {
    return null;
  }
  try {
    return createTreatmentLandscapeWorkPackage(
      state.treatment_finalization,
      treatmentFinalizationEvidence(state)
    );
  } catch {
    return null;
  }
}

function reportWorkPackageOrNull(
  state: ResearchSessionState
): z.output<typeof reportSynthesisWorkPackageSchema> | null {
  if (!operationCompleteOrTerminal(state.operations.treatment_landscape_finalization)) {
    return null;
  }
  if (currentResearchReport(state.report, reportSynthesisEvidence(state)) !== undefined) {
    return null;
  }
  try {
    return createReportSynthesisWorkPackage(
      state.report,
      reportSynthesisEvidence(state)
    );
  } catch {
    return null;
  }
}

function projectFinalCompletionAuditView(state: ResearchSessionState) {
  const operation = finalCompletionAuditOperationProjection(state);
  return {
    status: operation.status === "COMPLETE"
      ? "COMPLETE" as const
      : operation.status === "IN_PROGRESS"
        ? "IN_PROGRESS" as const
        : "NOT_STARTED" as const,
    ...(state.final_completion_audit === undefined
      ? {}
      : { basis_digest: state.final_completion_audit.basis_digest }),
    blockers: state.final_completion_audit?.checks
      .filter(({ status }) => status === "FAIL")
      .map(({ summary }) => summary) ?? []
  };
}

function deriveFinalCompletionChecks(state: ResearchSessionState) {
  const checks: Array<{
    check_id: string;
    status: "PASS" | "FAIL";
    summary: string;
  }> = [];
  const add = (checkId: string, pass: boolean, summary: string) => checks.push({
    check_id: checkId,
    status: pass ? "PASS" : "FAIL",
    summary
  });
  add(
    "PROTOCOL_IDENTITIES_CURRENT",
    state.protocol_binding.currency === "CURRENT",
    "The execution remains bound to the current exact protocol identities."
  );
  add(
    "MODULE_APPLICABILITY_RESOLVED",
    Object.values(state.modules).every(({ applicability }) =>
      applicability !== "UNRESOLVED"
    ),
    "Every module has server-resolved applicability."
  );
  add(
    "REQUIRED_MODULES_COMPLETE",
    Object.entries(state.modules).every(([moduleId, module]) =>
      moduleId === "FINAL_COMPLETION_AUDIT" ||
      module.applicability !== "REQUIRED" || module.execution_status === "COMPLETE"
    ),
    "Every required module before the final audit is complete."
  );
  add(
    "UPSTREAM_OPERATIONS_COMPLETE",
    Object.entries(state.operations).every(([operationId, operation]) =>
      operationId === "final_completion_audit" || operation.status === "COMPLETE"
    ),
    "Every required upstream operation is complete without retryable or terminal substitution."
  );
  const treatment = currentTreatmentLandscapeAssessment(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state)
  );
  add(
    "TREATMENT_LOCKS_PASS",
    treatment?.selection_coverage_lock === "pass" &&
      treatment.per_video_depth_lock === "pass" &&
      treatment.synthesis_lock === "pass" &&
      treatment.answer_boundary === "ledger_consistent_for_synthesis",
    "The current server-derived treatment selection, depth, and synthesis locks all pass."
  );
  add(
    "BIDIRECTIONAL_CURRENT",
    deriveBidirectionalIterationStatus(
      state.bidirectional_iteration,
      bidirectionalEvidenceState(state)
    ) === "COMPLETE",
    "Both transfer directions are complete for the current evidence basis."
  );
  add(
    "READER_REPORT_CURRENT",
    currentResearchReport(state.report, reportSynthesisEvidence(state)) !== undefined,
    "The reader report is current, source-linked, and bound to this exact evidence basis."
  );
  const unresolvedLinked = state.formal_evidence.sources.flatMap((source) =>
    source.external_evidence.linked_work.filter((item) =>
      item.possible_decision_impact !== "detail_only" && item.status !== "COMPLETE"
    )
  );
  add(
    "DECISION_CHANGING_LINKED_WORK_AUDITED",
    unresolvedLinked.length === 0,
    "Every potentially decision-changing linked replication, reproduction, review, notice, or post-publication source is audited."
  );
  return checks;
}

function finalCompletionAuditBasisDigest(state: ResearchSessionState): string {
  return createHash("sha256").update(JSON.stringify({
    state_version: state.state_version,
    research_target: state.research_target,
    diagnosis_status: state.diagnosis_status,
    protocol_binding: state.protocol_binding,
    modules: {
      ...state.modules,
      FINAL_COMPLETION_AUDIT: {
        ...state.modules.FINAL_COMPLETION_AUDIT,
        execution_status: "NOT_STARTED",
        authority: "SERVER_RESEARCH_SESSION"
      }
    },
    operations: {
      ...state.operations,
      final_completion_audit: { status: "NOT_STARTED" }
    },
    scout: state.scout,
    candidate_discovery: state.candidate_discovery,
    video_depth: state.video_depth,
    bounded_evidence: state.bounded_evidence,
    formal_evidence: state.formal_evidence,
    bidirectional_iteration: state.bidirectional_iteration,
    treatment_finalization: state.treatment_finalization,
    report: state.report
  }), "utf8").digest("hex");
}

function boundedNonrankingReady(state: ResearchSessionState): boolean {
  if (
    state.protocol_binding.currency !== "CURRENT" ||
    Object.values(state.modules).some(({ applicability }) =>
      applicability === "UNRESOLVED"
    )
  ) return false;
  const treatment = currentTreatmentLandscapeAssessment(
    state.treatment_finalization,
    treatmentFinalizationEvidence(state)
  );
  if (treatment?.answer_boundary !== "bounded_nonranking_only") return false;
  const upstreamOperations = Object.entries(state.operations).filter(([operationId]) =>
    operationId !== "final_completion_audit"
  ).map(([, operation]) => operation);
  if (!upstreamOperations.every(({ status }) =>
    status === "COMPLETE" || status === "BLOCKED_TERMINAL"
  )) return false;
  if (!upstreamOperations.some(({ status }) => status === "BLOCKED_TERMINAL")) {
    return false;
  }
  return Object.entries(state.modules).every(([moduleId, module]) =>
    moduleId === "FINAL_COMPLETION_AUDIT" ||
    module.applicability !== "REQUIRED" ||
    module.execution_status === "COMPLETE" || module.execution_status === "BLOCKED"
  );
}

function formalPipelineTerminal(state: ResearchSessionState): boolean {
  return ([
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "external_study_evidence_audit",
    "linked_replication_and_review_audit",
    "claim_capability_recalculation"
  ] as const).every((capability) =>
    operationCompleteOrTerminal(state.operations[capability])
  );
}

function requireCurrentProtocols(rawState: ResearchSessionState): ResearchSessionState {
  const state = parseProjectedResearchSessionState(rawState);
  if (state.protocol_binding.currency !== "CURRENT") {
    throw new Error("Research session protocol binding is no longer current");
  }
  return state;
}

function sameProtocols(
  left: ResearchSessionState["protocol_binding"]["expected"],
  right: ResearchSessionState["protocol_binding"]["expected"]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isExecutable(operation: ResearchSessionState["operations"][ResearchOperationId]) {
  return operation.status === "NOT_STARTED" ||
    operation.status === "IN_PROGRESS" ||
    operation.status === "BLOCKED_RETRYABLE";
}

function operationCompleteOrTerminal(
  operation: ResearchSessionState["operations"][ResearchOperationId]
): boolean {
  return operation.status === "COMPLETE" || operation.status === "BLOCKED_TERMINAL";
}

function hasExecutableOrIncompleteWork(state: ResearchSessionState): boolean {
  if (state.protocol_binding.currency === "DRIFTED") return true;
  if (Object.values(state.modules).some((module) =>
    module.applicability === "UNRESOLVED" ||
    (module.applicability === "REQUIRED" && module.execution_status !== "COMPLETE")
  )) return true;
  return Object.values(state.operations).some(({ status }) =>
    status === "NOT_STARTED" ||
    status === "IN_PROGRESS" ||
    status === "BLOCKED_RETRYABLE"
  );
}

function hasTerminalBoundary(state: ResearchSessionState): boolean {
  return Object.values(state.operations).some(({ status }) =>
    status === "BLOCKED_TERMINAL"
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
