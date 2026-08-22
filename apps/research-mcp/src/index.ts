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
