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
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  type ResearchSessionState
} from "./actions/research-session-controller.js";
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
    ...(externalReceiptSecret === undefined
      ? {}
      : { externalEvidenceReceiptSecret: externalReceiptSecret })
  };
  return Object.freeze({
    deterministic: Object.freeze(deterministic),
    semantic: Object.freeze(semantic)
  });
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
