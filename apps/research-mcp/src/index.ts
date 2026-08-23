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
  deriveResearchOutputBoundary,
  evaluateResearchFinalization,
  finalizationDecisionSchema,
  finalizationPermitSchema,
  mapTreatmentLandscapeBoundary,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordNativeYoutubeDiscovery,
  researchNextCapabilitySchema,
  researchOutputBoundarySchema,
  researchSessionStateDigest,
  researchSessionStateSchema,
  researchSessionViewSchema,
  type AutomatedScoutCompletion,
  type FinalizationPermit,
  type ResearchFinalizationDecision,
  type ResearchModuleId,
  type ResearchNextCapability,
  type ResearchOperationId,
  type ResearchOutputBoundary,
  type ResearchSessionStartInput,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
export {
  assertCandidateScreeningComplete,
  candidateDiscoveryDiagnosticsSchema,
  candidateDiscoveryReadyForScreening,
  deriveCandidateDiscoveryDiagnostics,
  ingestNativeYoutubeSurvey,
  ingestValidatedGeminiFrontier,
  initialResearchCandidateDiscoveryState,
  nativeSurveyInputFromCandidateDiscovery,
  nativeSurveyInputFromGeminiPacket,
  researchCandidateDiscoveryStateSchema,
  type CandidateDiscoveryDiagnostics,
  type ResearchCandidateDiscoveryState,
  type ResearchCandidateRecord
} from "./actions/research-candidate-frontier.js";
export {
  STUDY_METHOD_AUDIT_DOMAINS,
  studyMethodAuditReceiptSchema,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  type StudyMethodAuditReceipt,
  type StudyMethodAuditSubmission
} from "./actions/study-method-audit.js";
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
  createOpenFullTextActionRoutes,
  openFullTextActionOutputSchema,
  openFullTextActionErrorSchema,
  openFullTextLeadActionOutputSchema,
  openFullTextMcpOutputSchema,
  reviewMethodAuditActionInputSchema,
  reviewMethodAuditActionOutputSchema,
  studyMethodAuditActionInputSchema,
  studyMethodAuditActionOutputSchema,
  type CreateOpenFullTextActionRoutesOptions
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
