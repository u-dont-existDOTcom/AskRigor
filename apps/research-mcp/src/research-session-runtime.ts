import type { IncomingMessage } from "node:http";

import { getProtocolManifest } from "@askrigor/protocol";
import {
  fetchPubmedRecord,
  searchEuropePmc,
  searchPubmed,
  searchYoutubeComments
} from "@askrigor/sources";

import {
  executeAutomatedGeminiScout,
  type CreateAutomatedGeminiScoutActionRouteOptions
} from "./actions/gemini-scout-route.js";
import {
  createOpenFullTextExecutor,
  type OpenFullTextExecutor
} from "./actions/open-full-text-route.js";
import { createResearchSessionDiscoveryExecutors } from
  "./actions/research-session-discovery.js";
import {
  deriveResearchFinalizationLimitations,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
import { createReportSynthesisEvidenceContext } from
  "./actions/research-report-synthesis.js";
import {
  executeDiscussionDepthChain,
  executeTranscriptDepthChain,
  createCompletedVideoDepthReplay
} from "./actions/research-video-depth-controller.js";
import { createResearchActionRoutes } from
  "./actions/research-routes.js";
import {
  discussionReceiptSchema
} from "./actions/treatment-landscape-coverage-route.js";
import type { ActionRoute } from "./actions/types.js";
import {
  createYoutubeTranscriptActionRoute,
  youtubeTranscriptActionOutputSchema
} from "./actions/youtube-transcript-route.js";
import {
  createStudyExternalEvidenceCoordinator,
  type StudyExternalEvidenceCoordinator
} from "./actions/study-external-evidence.js";
import { youtubeVideoCommunityAuditOutputSchema } from
  "./youtube-video-community-audit.js";
import {
  createInMemoryResearchExternalAuditCache,
  type ResearchDeterministicAdvanceDependencies,
  type ResearchExternalAuditCache,
  type ResearchSemanticAdvanceDependencies
} from "./research-session-advance.js";
import {
  sourceRecordSha256
} from "./actions/research-bounded-evidence.js";
import {
  createInMemoryResearchEvidenceMaterialCache,
  type ResearchEvidenceMaterialCache
} from "./research-evidence-material-cache.js";

const discussionActionOutputSchema = youtubeVideoCommunityAuditOutputSchema
  .extend({ coverage_receipt: discussionReceiptSchema })
  .strict();

export interface CreateResearchSessionRuntimeOptions {
  env?: NodeJS.ProcessEnv;
  geminiScout?: CreateAutomatedGeminiScoutActionRouteOptions;
  transcriptRoute?: ActionRoute;
  discussionRoute?: ActionRoute;
  openFullText?: OpenFullTextExecutor;
  externalAuditCache?: ResearchExternalAuditCache;
  evidenceMaterialCache?: ResearchEvidenceMaterialCache;
  getProtocolManifest?: typeof getProtocolManifest;
}

export interface ResearchSessionRuntimeDependencies {
  deterministic: ResearchDeterministicAdvanceDependencies;
  semantic: ResearchSemanticAdvanceDependencies;
}

/**
 * Build one lifetime-shared dependency graph for controlled research. Stores,
 * continuation registries, provider budgets, and external-audit caches are
 * created once here rather than once per HTTP request.
 */
export function createResearchSessionRuntimeDependencies(
  options: CreateResearchSessionRuntimeOptions = {}
): ResearchSessionRuntimeDependencies {
  const env = options.env ?? process.env;
  const youtubeApiKey = env.YOUTUBE_API_KEY ?? "";
  const transcriptRoute = options.transcriptRoute ??
    createYoutubeTranscriptActionRoute();
  const discussionRoute = options.discussionRoute ?? requiredActionRoute(
    createResearchActionRoutes(),
    "audit_youtube_video_community"
  );
  const openFullText = options.openFullText ?? createOpenFullTextExecutor();
  const nativeDiscovery = createResearchSessionDiscoveryExecutors({
    youtubeApiKey
  });
  const externalAuditCache = options.externalAuditCache ??
    createInMemoryResearchExternalAuditCache();
  const evidenceMaterialCache = options.evidenceMaterialCache ??
    createInMemoryResearchEvidenceMaterialCache();
  const externalReceiptSecret =
    env.ASKRIGOR_EXTERNAL_EVIDENCE_RECEIPT_SECRET?.trim();
  const externalReceiptKeyId =
    env.ASKRIGOR_EXTERNAL_EVIDENCE_RECEIPT_KEY_ID?.trim();
  const externalCoordinator =
    externalReceiptSecret === undefined || externalReceiptSecret.length < 32 ||
      externalReceiptKeyId === undefined || externalReceiptKeyId.length === 0
      ? undefined
      : createLazyExternalCoordinator({
          getManifest: options.getProtocolManifest ?? getProtocolManifest,
          crossrefMailto: env.CROSSREF_MAILTO ?? "",
          receiptSecret: externalReceiptSecret,
          receiptKeyId: externalReceiptKeyId
        });

  const deterministic: ResearchDeterministicAdvanceDependencies = {
    automatedScout: (state) => executeBudgetedScout(
      state,
      {
        ...options.geminiScout,
        geminiApiKey: options.geminiScout?.geminiApiKey ??
          env.ASKRIGOR_GEMINI_API_KEY,
        youtubeApiKey: options.geminiScout?.youtubeApiKey ?? youtubeApiKey
      }
    ),
    nativeDiscovery: nativeDiscovery.nativeDiscovery,
    resolveCandidateIdentities: nativeDiscovery.resolveCandidateIdentities,
    videoDepth: {
      async getTranscript(input) {
        return youtubeTranscriptActionOutputSchema.parse(
          await executeActionRoute(transcriptRoute, input)
        );
      },
      async auditDiscussion(input) {
        return discussionActionOutputSchema.parse(
          await executeActionRoute(discussionRoute, input)
        );
      }
    },
    evidenceMaterialCache,
    formalSearch: {
      searchPubmed,
      fetchPubmedRecord,
      searchEuropePmc,
      pubmedConfig: {
        tool: env.NCBI_TOOL?.trim() || "askrigor",
        email: env.NCBI_EMAIL?.trim() || "support@askrigor.com",
        ...(env.NCBI_API_KEY === undefined
          ? {}
          : { apiKey: env.NCBI_API_KEY })
      }
    },
    openFullText,
    ...(externalCoordinator === undefined || externalReceiptSecret === undefined
      ? {}
      : {
          externalEvidence: {
            coordinator: externalCoordinator,
            receiptSecret: externalReceiptSecret,
            cache: externalAuditCache
          }
        }),
    bidirectionalCommentSearch: (input) => searchYoutubeComments(
      input,
      { apiKey: youtubeApiKey }
    )
  };
  const semantic: ResearchSemanticAdvanceDependencies = {
    openFullTextExecutor: openFullText,
    externalAuditFor: (input) => externalAuditCache.get(input),
    videoEvidenceMaterialFor: (input) => evidenceMaterialCache.get(input),
    evidenceContextForWork: async ({ sessionId, state, work }) => {
      if (work.kind === "video_evidence_synthesis") {
        const material = await ensureVideoEvidenceMaterial({
          sessionId,
          state,
          work: work.package,
          transcriptRoute,
          discussionRoute,
          cache: evidenceMaterialCache
        });
        if (material === undefined) return undefined;
        return {
          transcript_segments: material.transcript_segments,
          discussion_comments: material.discussion_comments.map((comment) => ({
            record_sha256: comment.record_sha256,
            video_id: comment.video_id,
            comment_id: comment.comment_id,
            parent_id: comment.parent_id,
            top_level_comment_id: comment.top_level_comment_id,
            is_reply: comment.is_reply,
            text: comment.text,
            like_count: comment.like_count,
            published_at: comment.published_at,
            updated_at: comment.updated_at
          }))
        };
      }
      if (work.kind === "formal_method_audit") {
        if (openFullText.readAuditMaterial === undefined) {
          throw new Error("Exact full-text method-audit material is unavailable");
        }
        return {
          document_index: openFullText.readAuditMaterial(
            work.package.document_handle
          )
        };
      }
      if (work.kind === "formal_claim_recalculation") {
        if (openFullText.readAuditMaterial === undefined) {
          throw new Error("Exact full-text claim-recalculation material is unavailable");
        }
        const externalAudit = externalAuditCache.get({
          sessionId,
          sourceId: work.package.source_id,
          receiptPayloadSha256: work.package.external_receipt_payload_sha256
        });
        if (externalAudit === undefined) {
          throw new Error("Exact external-audit claim-recalculation material is unavailable");
        }
        return {
          document_index: openFullText.readAuditMaterial(
            work.package.document_handle
          ),
          external_audit: externalAudit
        };
      }
      if (work.kind === "report_synthesis") {
        return createReportSynthesisEvidenceContext({
          researchTarget: state.research_target,
          candidates: state.candidate_discovery,
          boundedEvidence: state.bounded_evidence,
          formalEvidence: state.formal_evidence,
          treatment: state.treatment_finalization,
          limitations: deriveResearchFinalizationLimitations(state).map(
            (limitation) => ({
              limitation_id: limitation.limitation_id,
              plain_language: limitation.plain_language
            })
          )
        });
      }
      return undefined;
    },
    ...(externalReceiptSecret === undefined
      ? {}
      : { externalEvidenceReceiptSecret: externalReceiptSecret })
  };
  return Object.freeze({
    deterministic: Object.freeze(deterministic),
    semantic: Object.freeze(semantic)
  });
}

async function ensureVideoEvidenceMaterial(input: {
  sessionId: string;
  state: ResearchSessionState;
  work: {
    video_id: string;
    transcript_receipt_sha256: string;
    discussion_receipt_sha256: string;
  };
  transcriptRoute: ActionRoute;
  discussionRoute: ActionRoute;
  cache: ResearchEvidenceMaterialCache;
}) {
  const existing = input.cache.get({
    sessionId: input.sessionId,
    videoId: input.work.video_id,
    transcriptReceiptSha256: input.work.transcript_receipt_sha256,
    discussionReceiptSha256: input.work.discussion_receipt_sha256
  });
  if (existing !== undefined) return existing;

  let replay = createCompletedVideoDepthReplay(
    input.state.video_depth,
    "transcript_acquisition",
    input.work.video_id
  );
  replay = await executeTranscriptDepthChain(
    replay,
    input.work.video_id,
    async (request) => {
      const output = youtubeTranscriptActionOutputSchema.parse(
        await executeActionRoute(input.transcriptRoute, request)
      );
      input.cache.captureTranscript({
        sessionId: input.sessionId,
        videoId: input.work.video_id,
        output
      });
      return output;
    }
  );
  replay = createCompletedVideoDepthReplay(
    replay,
    "community_discussion_audit",
    input.work.video_id
  );
  replay = await executeDiscussionDepthChain(
    replay,
    input.work.video_id,
    async (request) => {
      const output = discussionActionOutputSchema.parse(
        await executeActionRoute(input.discussionRoute, request)
      );
      input.cache.captureDiscussion({
        sessionId: input.sessionId,
        videoId: input.work.video_id,
        output
      });
      return output;
    }
  );
  const transcript = replay.transcripts.find(({ source }) =>
    source.video_id === input.work.video_id
  );
  const discussion = replay.discussions.find(({ source }) =>
    source.video_id === input.work.video_id
  );
  if (
    transcript?.status !== "COMPLETE" || discussion?.status !== "COMPLETE" ||
    transcript.receipt === undefined || discussion.receipt === undefined ||
    sourceRecordSha256(transcript.receipt) !== input.work.transcript_receipt_sha256 ||
    sourceRecordSha256(discussion.receipt) !== input.work.discussion_receipt_sha256
  ) {
    input.cache.revokeSession(input.sessionId);
    throw new Error("Reacquired video evidence did not match the exact prior receipt frontier");
  }
  const material = input.cache.get({
    sessionId: input.sessionId,
    videoId: input.work.video_id,
    transcriptReceiptSha256: input.work.transcript_receipt_sha256,
    discussionReceiptSha256: input.work.discussion_receipt_sha256
  });
  if (material === undefined) {
    throw new Error("Reacquired video evidence did not produce the exact bounded material");
  }
  return material;
}

async function executeBudgetedScout(
  state: ResearchSessionState,
  options: CreateAutomatedGeminiScoutActionRouteOptions
): Promise<ResearchSessionState> {
  const execution = await executeAutomatedGeminiScout({
    research_target: state.research_target,
    diagnosis_status: state.diagnosis_status
  }, options);
  const completion = execution.controller_completion;
  if (completion !== undefined) {
    return recordAutomatedScoutCompletion(state, {
      providerResponseId: completion.provider_response_id,
      packet: completion.packet,
      receipt: completion.validation
    });
  }
  const boundary = execution.receipt.boundary;
  if (boundary === null) {
    throw new Error("Budgeted Gemini scout returned no completion or boundary");
  }
  return recordAutomatedScoutBoundary(state, {
    classification: boundary.retryable || isConfigurationBoundary(boundary.code)
      ? "RETRYABLE"
      : "TERMINAL_NONRETRYABLE",
    code: controllerBoundaryCode(boundary.code),
    summary: "Automated candidate discovery did not complete; no manual packet or caller assertion was substituted."
  });
}

function isConfigurationBoundary(code: string): boolean {
  return [
    "gemini_provider_not_configured",
    "youtube_provider_not_configured",
    "gemini_scout_budget_unavailable",
    "gemini_scout_budget_exhausted"
  ].includes(code);
}

function controllerBoundaryCode(code: string): string {
  return `AUTOMATED_SCOUT_${code.toUpperCase()}`.slice(0, 80);
}

function requiredActionRoute(
  routes: readonly ActionRoute[],
  operationId: string
): ActionRoute {
  const route = routes.find((candidate) => candidate.operationId === operationId);
  if (route === undefined) throw new Error(`Missing Action executor ${operationId}`);
  return route;
}

async function executeActionRoute(
  route: ActionRoute,
  body: unknown
): Promise<unknown> {
  const result = await route.handle({
    request: {} as IncomingMessage,
    clientIp: "internal-controller",
    body
  });
  if (result.status !== 200) {
    throw new Error(`Internal Action executor ${route.operationId} failed`);
  }
  return result.body;
}

function createLazyExternalCoordinator(input: {
  getManifest: typeof getProtocolManifest;
  crossrefMailto: string;
  receiptSecret: string;
  receiptKeyId: string;
}): StudyExternalEvidenceCoordinator {
  let coordinator: Promise<StudyExternalEvidenceCoordinator> | undefined;
  const lazyCoordinator: StudyExternalEvidenceCoordinator = {
    async audit(auditInput) {
      coordinator ??= Promise.all([
        input.getManifest("universal"),
        input.getManifest("hrp")
      ]).then(([universal, hrp]) => createStudyExternalEvidenceCoordinator({
        protocolManifests: { universal, hrp },
        crossrefConfig: { mailto: input.crossrefMailto },
        receiptSecret: input.receiptSecret,
        receiptKeyId: input.receiptKeyId
      }));
      return (await coordinator).audit(auditInput);
    }
  };
  return Object.freeze(lazyCoordinator);
}
