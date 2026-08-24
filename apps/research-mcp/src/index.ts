import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { DEFAULT_PORT } from "./config.js";
import { createAskRigorHttpServer } from "./server.js";

export { createAskRigorHttpServer, createAskRigorServer } from "./server.js";
export { createActionOpenApiDocument } from "./actions/openapi.js";
export { createProtocolActionChunk } from "./actions/protocol-continuation.js";
export { createResearchActionRoutes } from "./actions/research-routes.js";
export {
  createActionOnlyResearchRoutes,
  createYoutubeTranscriptActionRoute,
  youtubeTranscriptActionOutputSchema
} from "./actions/youtube-transcript-route.js";
export {
  GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES,
  createGeminiCandidateActionRoute,
  geminiCandidateActionInputSchema
} from "./actions/gemini-candidate-route.js";
export {
  GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
  automatedGeminiScoutReceiptSchema,
  calculateGeminiScoutNanoUsd,
  createAutomatedGeminiScoutActionRoute,
  isDeidentifiedResearchTarget,
  type AutomatedGeminiScoutReceipt,
  type CreateAutomatedGeminiScoutActionRouteOptions
} from "./actions/gemini-scout-route.js";
export {
  createResearchSessionPrototypeRoutes,
  type CreateResearchSessionPrototypeRoutesOptions
} from "./actions/research-session-prototype-route.js";
export {
  createResearchSessionStore,
  isResearchSessionId,
  ResearchSessionUnavailableError,
  type ResearchSessionStore,
  type ResearchSessionStoreOptions
} from "./actions/research-session-store.js";
export {
  RESEARCH_MODULE_IDS,
  RESEARCH_OPERATION_IDS,
  applyProtocolRecheck,
  applyServerModuleApplicability,
  assertResearchSessionTransition,
  createInitialResearchSessionState,
  deriveRequiredNextCapabilities,
  deriveResearchFinalizationLimitations,
  deriveResearchOutputBoundary,
  deriveResearchFinalizationReadiness,
  evaluateResearchFinalization,
  executeResearchSessionBidirectionalReturnSearch,
  executeResearchSessionFinalCompletionAudit,
  executeResearchSessionFormalSearch,
  executeResearchSessionSourceExternalEvidence,
  executeResearchSessionSourceFullTextChain,
  executeResearchSessionVideoDepthChain,
  finalizationDecisionSchema,
  finalizationPermitSchema,
  researchFinalizationLimitationSchema,
  mapTreatmentLandscapeBoundary,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordCandidateScreeningCompletion,
  recordDiscussionDepthResult,
  recordNativeYoutubeDiscovery,
  recordResearchSessionFormalScreening,
  recordResearchSessionBidirectionalIteration,
  recordResearchSessionBidirectionalReturnAssessment,
  recordResearchSessionTreatmentLandscape,
  executeResearchSessionMethodAudit,
  recalculateResearchSessionSourceClaimCapability,
  recordTranscriptDepthResult,
  recordVideoDepthRestart,
  researchNextCapabilitySchema,
  researchOutputBoundarySchema,
  researchSessionStateDigest,
  researchSessionStateSchema,
  researchSessionViewSchema,
  verifyResearchFinalizationPermit,
  ResearchFinalizationPermitError,
  type AutomatedScoutCompletion,
  type FinalizationPermit,
  type ResearchFinalizationDecision,
  type ResearchFinalizationLimitation,
  type ResearchFinalizationPermitOptions,
  type ResearchFinalizationPermitVerification,
  type ResearchModuleId,
  type ResearchNextCapability,
  type ResearchOperationId,
  type ResearchOutputBoundary,
  type ResearchSessionStartInput,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
export {
  createTreatmentLandscapeWorkPackage,
  currentTreatmentLandscapeAssessment,
  deriveTreatmentFinalizationDiagnostics,
  deriveTreatmentFinalizationStatus,
  ingestTreatmentLandscapeSubmission,
  initialResearchTreatmentFinalizationState,
  researchTreatmentFinalizationStateSchema,
  treatmentEvidenceBasisDigest,
  treatmentFinalizationDiagnosticsSchema,
  treatmentLandscapeSubmissionSchema,
  treatmentLandscapeWorkPackageSchema,
  type ResearchTreatmentFinalizationState,
  type TreatmentFinalizationEvidence,
  type TreatmentLandscapeSubmission,
  type TreatmentLandscapeWorkPackage
} from "./actions/research-treatment-finalization.js";
export {
  FORMAL_EVIDENCE_PROVIDERS,
  FORMAL_SOURCE_KINDS,
  appendResearchFormalHypotheses,
  communityFormalHypothesisInputSchema,
  createFormalClaimRecalculationWorkPackages,
  createFormalExternalEvidenceWorkPackages,
  createFormalEvidenceScreeningWorkPackage,
  createFormalMethodAuditWorkPackages,
  deriveFormalEvidenceDiagnostics,
  deriveFormalEvidenceOperationStatus,
  executeResearchFormalSearch,
  executeResearchSourceExternalEvidence,
  executeResearchSourceFullTextChain,
  formalEvidenceDiagnosticsSchema,
  formalClaimRecalculationWorkPackageSchema,
  formalExternalEvidenceWorkPackageSchema,
  formalEvidenceFrontierDigest,
  formalEvidenceScreeningComplete,
  formalEvidenceScreeningSubmissionSchema,
  formalEvidenceScreeningWorkPackageSchema,
  formalMethodAuditWorkPackageSchema,
  ingestFormalEvidenceScreeningSubmission,
  ingestOpenFullTextOutput,
  ingestResearchSourceExternalEvidence,
  initialResearchFormalEvidenceState,
  initializeResearchFormalEvidence,
  recalculateResearchSourceClaimCapability,
  reconcileFormalEvidenceLinkedWork,
  recordFormalMethodAudit,
  recordResearchSourceExternalEvidenceBoundary,
  restartResearchSourceFullTextChain,
  researchFormalEvidenceStateSchema,
  type FormalEvidenceDiagnostics,
  type FormalEvidenceScreeningSubmission,
  type FormalSearchExecutors,
  type CommunityFormalHypothesisInput,
  type ResearchFormalEvidenceState,
  type ResearchFormalSource
} from "./actions/research-formal-evidence.js";
export {
  bidirectionalIterationDiagnosticsSchema,
  bidirectionalIterationSubmissionSchema,
  bidirectionalIterationWorkPackageSchema,
  bidirectionalReturnAssessmentSubmissionSchema,
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
  researchBidirectionalIterationStateSchema,
  type BidirectionalCommentSearchExecutor,
  type BidirectionalEvidenceState,
  type BidirectionalIterationSubmission,
  type BidirectionalIterationWorkPackage,
  type BidirectionalReturnAssessmentSubmission,
  type ResearchBidirectionalIterationState
} from "./actions/research-bidirectional-iteration.js";
export {
  assertCandidateScreeningComplete,
  candidateDiscoveryScreeningDigest,
  candidateDiscoveryDiagnosticsSchema,
  candidateDiscoveryReadyForScreening,
  candidateScreeningResultDigest,
  candidateScreeningSubmissionSchema,
  candidateScreeningWorkPackageSchema,
  createCandidateScreeningWorkPackage,
  deriveCandidateDiscoveryDiagnostics,
  ingestCandidateScreeningSubmission,
  ingestNativeYoutubeSurvey,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  nativeSurveyInputFromCandidateDiscovery,
  nativeSurveyInputFromGeminiPacket,
  researchCandidateDiscoveryStateSchema,
  selectedCandidateVideoIds,
  type CandidateScreeningSubmission,
  type CandidateScreeningWorkPackage,
  type CandidateDiscoveryDiagnostics,
  type ResearchCandidateDiscoveryState,
  type ResearchCandidateRecord
} from "./actions/research-candidate-frontier.js";
export {
  assertVideoDepthMatchesSelection,
  deriveDiscussionActionInput,
  deriveResearchVideoDepthDiagnostics,
  deriveResearchVideoDepthWorkPackages,
  deriveTranscriptActionInput,
  deriveVideoDepthOperationStatus,
  executeDiscussionDepthChain,
  executeTranscriptDepthChain,
  ingestDiscussionActionOutput,
  ingestTranscriptActionOutput,
  initialResearchVideoDepthState,
  initializeResearchVideoDepth,
  researchVideoDepthDiagnosticsSchema,
  researchVideoDepthRecordStatusSchema,
  researchVideoDepthStateSchema,
  researchVideoDepthWorkPackageSchema,
  restartResearchVideoDepthChain,
  youtubeDiscussionActionOutputSchema,
  type ResearchVideoDepthDiagnostics,
  type ResearchVideoDepthExecutors,
  type ResearchVideoDepthRecordStatus,
  type ResearchVideoDepthState,
  type ResearchVideoDepthWorkPackage,
  type YoutubeDiscussionActionOutput,
  type YoutubeTranscriptActionOutput
} from "./actions/research-video-depth-controller.js";
export {
  STUDY_METHOD_AUDIT_DOMAINS,
  studyMethodAuditExternalBindingSchema,
  studyMethodAuditExternalReceiptSchema,
  studyMethodAuditExternalSubmissionSchema,
  studyMethodExternalEvidenceReferenceSchema,
  studyMethodAuditReceiptSchema,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  validateStudyMethodAuditWithExternalEvidence,
  type StudyMethodAuditExternalReceipt,
  type StudyMethodAuditExternalSubmission,
  type StudyMethodAuditReceipt,
  type StudyMethodAuditSubmission
} from "./actions/study-method-audit.js";
export {
  computeStudyExternalEvidenceBundleHash,
  createStudyExternalEvidenceCoordinator,
  studyExternalEvidenceArtifactReferenceSchema,
  studyExternalEvidenceAuditInputSchema,
  studyExternalEvidenceAuditOutputSchema,
  studyExternalEvidenceProtocolTupleSchema,
  studyExternalEvidenceReceiptSchema,
  StudyExternalEvidenceIdentityError,
  StudyExternalEvidenceReceiptError,
  verifyStudyExternalEvidenceReceipt,
  type StudyExternalEvidenceAuditInput,
  type StudyExternalEvidenceAuditOutput,
  type StudyExternalEvidenceCoordinator,
  type StudyExternalEvidenceCoordinatorOptions,
  type StudyExternalEvidenceProtocolTuple,
  type StudyExternalEvidenceReceipt
} from "./actions/study-external-evidence.js";
export {
  createInMemoryEvidenceArtifactStore,
  evidenceArtifactDescriptorSchema,
  evidenceArtifactKindSchema,
  type EvidenceArtifactDescriptor,
  type EvidenceArtifactInput,
  type EvidenceArtifactKind,
  type EvidenceArtifactRecord,
  type EvidenceArtifactStore,
  type InMemoryEvidenceArtifactStoreOptions
} from "./actions/evidence-artifact-store.js";
export {
  REVIEW_METHOD_AUDIT_DOMAINS,
  reviewMethodAuditReceiptSchema,
  reviewMethodAuditSubmissionSchema,
  validateReviewMethodAudit,
  type ReviewMethodAuditReceipt,
  type ReviewMethodAuditSubmission
} from "./actions/review-method-audit.js";
export {
  acquireOpenFullTextActionInputSchema,
  availableOpenFullTextActionOutputSchema,
  continueOpenFullTextActionInputSchema,
  createOpenFullTextExecutor,
  createOpenFullTextActionRoutes,
  openFullTextActionOutputSchema,
  openFullTextActionErrorSchema,
  openFullTextLeadActionOutputSchema,
  openFullTextMcpOutputSchema,
  noticeMethodAuditOutputSchema,
  noticeMethodAuditReceiptSchema,
  noticeMethodAuditSubmissionSchema,
  reviewMethodAuditActionInputSchema,
  reviewMethodAuditActionOutputSchema,
  studyMethodAuditActionInputSchema,
  studyMethodAuditActionOutputSchema,
  studyMethodExternalAuditOutputSchema,
  type CreateOpenFullTextActionRoutesOptions,
  type OpenFullTextExecutor
} from "./actions/open-full-text-route.js";
export {
  createOpenFullTextHandleStore,
  isOpenFullTextHandle,
  OpenFullTextHandleError,
  openFullTextCursorSchema,
  openFullTextHandleStateSchema,
  type OpenFullTextHandleState,
  type OpenFullTextHandleStore,
  type OpenFullTextHandleStoreOptions
} from "./actions/open-full-text-handle-store.js";
export {
  assessTreatmentLandscapeCoverage,
  createTreatmentLandscapeCoverageActionRoute,
  deriveProgramSignature,
  discussionReceiptSchema,
  PROGRAM_NOT_DESCRIBED,
  projectDiscussionCoverageReceipt,
  projectTranscriptCoverageReceipt,
  transcriptReceiptSchema,
  treatmentLandscapeCoverageInputSchema,
  treatmentLandscapeCoverageOutputSchema
} from "./actions/treatment-landscape-coverage-route.js";
export type {
  DiscussionCoverageReceipt,
  ProgramSignatureFields,
  TreatmentLandscapeCoverageInput,
  TreatmentLandscapeCoverageOutput,
  TranscriptCoverageReceipt
} from "./actions/treatment-landscape-coverage-route.js";
export { createEnabledActionRoutes } from "./actions/runtime.js";
export { RESEARCH_OPERATIONS } from "./register-tools.js";
export type {
  ResearchOperation,
  ResearchOperationHandler
} from "./research-operation.js";
export { createLessonActionRoute } from "./lessons/action-route.js";
export {
  createDefaultActionRoutes,
  createLessonRuntimeFromEnv
} from "./lessons/runtime.js";
export type {
  ActionRequestContext,
  ActionResult,
  ActionRoute
} from "./actions/types.js";

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  const server = createAskRigorHttpServer();

  server.listen(port, "0.0.0.0", () => {
    console.log(`AskRigor MCP server listening on port ${port}`);
  });
}
