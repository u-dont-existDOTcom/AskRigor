import { readFile } from "node:fs/promises";

import {
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeCandidateValidationReceipt,
  type GeminiYoutubeScoutConfig,
  type GeminiYoutubeScoutInput
} from "@askrigor/sources";
import {
  getProtocolManifest,
  type ProtocolManifest
} from "@askrigor/protocol";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import {
  createResearchSessionStore,
  ResearchSessionUnavailableError,
  type ResearchSessionState,
  type ResearchSessionStore
} from "./research-session-store.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

const startInputSchema = z.object({
  research_target: z.string().trim().min(1).max(1_000),
  diagnosis_status: z.enum(["diagnosis_not_specified", "user_supplied_diagnosis"])
}).strict();
const sessionInputSchema = z.object({
  session_id: z.string().regex(/^ars1_[A-Za-z0-9_-]{32}$/u)
}).strict();
const protocolIdentitySchema = z.object({
  name: z.string(),
  version: z.string(),
  revision_date: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();
const scoutViewSchema = z.object({
  status: z.enum(["not_started", "complete", "blocked"]),
  candidate_count: z.number().int().nonnegative(),
  validated_candidate_count: z.number().int().nonnegative(),
  unresolved_candidate_count: z.number().int().nonnegative(),
  access_boundary: z.string().optional()
}).strict();
const sessionViewSchema = z.object({
  session_id: z.string(),
  status: z.enum(["in_progress", "blocked"]),
  next_required_operation: z.enum([
    "automated_video_scout",
    "candidate_screening_and_source_acquisition",
    "resolve_access_boundary"
  ]),
  synthesis_permitted: z.literal(false),
  protocols: z.tuple([protocolIdentitySchema, protocolIdentitySchema]),
  scout: scoutViewSchema,
  completed_operations: z.array(z.literal("automated_video_scout")),
  remaining_work: z.array(z.string()).min(1)
}).strict();
const continuationOutputSchema = sessionViewSchema.extend({
  last_operation: z.object({
    operation: z.literal("automated_video_scout"),
    result: z.enum(["complete", "blocked", "already_complete"])
  }).strict()
}).strict();
const finalizationOutputSchema = z.object({
  session_id: z.string(),
  status: z.enum(["incomplete", "blocked"]),
  synthesis_permitted: z.literal(false),
  report: z.null(),
  reason: z.enum([
    "required_research_operations_remain",
    "research_access_boundary_requires_resolution"
  ]),
  completed_operations: z.array(z.string()),
  remaining_work: z.array(z.string()).min(1)
}).strict();
const actionErrorSchema = z.object({
  error: z.object({
    code: z.enum(["action_input_invalid", "research_session_invalid_or_expired"]),
    retryable: z.literal(false)
  }).strict()
}).strict();

type ScoutFunction = typeof scoutGeminiYoutubeCandidates;
type ValidateFunction = typeof validateGeminiYoutubeCandidateHandoff;

export interface CreateResearchSessionPrototypeRoutesOptions {
  store?: ResearchSessionStore;
  getProtocolManifest?: typeof getProtocolManifest;
  scout?: ScoutFunction;
  validateCandidates?: ValidateFunction;
  loadScoutInstructions?: () => Promise<string>;
  geminiConfig?: GeminiYoutubeScoutConfig;
  youtubeApiKey?: string;
}

/**
 * Feasibility route set. It is intentionally not added to the production
 * Action inventory until the owner-approved provider and acceptance gates pass.
 */
export function createResearchSessionPrototypeRoutes(
  options: CreateResearchSessionPrototypeRoutesOptions = {}
): readonly ActionRoute[] {
  const store = options.store ?? createResearchSessionStore();
  const manifests = options.getProtocolManifest ?? getProtocolManifest;
  const scout = options.scout ?? scoutGeminiYoutubeCandidates;
  const validate = options.validateCandidates ?? validateGeminiYoutubeCandidateHandoff;
  const loadScoutInstructions = options.loadScoutInstructions ?? defaultScoutInstructions;

  return Object.freeze([
    startRoute(),
    continueRoute(),
    statusRoute(),
    finalizeRoute()
  ]);

  function startRoute(): ActionRoute {
    return route({
      operationId: "start_research_session",
      description: "Start an ephemeral server-owned research workflow bound to exact protocol identities. This does not permit synthesis.",
      inputSchema: startInputSchema,
      outputSchema: sessionViewSchema,
      async handle(input) {
        const [universal, hrp] = await Promise.all([
          manifests("universal"),
          manifests("hrp")
        ]);
        const state = initialState(input, universal, hrp);
        const sessionId = store.issue(state);
        return sessionView(sessionId, state);
      }
    });
  }

  function continueRoute(): ActionRoute {
    return route({
      operationId: "continue_research_session",
      description: "Execute only the next server-required bounded research operation. Caller completion assertions are not accepted.",
      inputSchema: sessionInputSchema,
      outputSchema: continuationOutputSchema,
      async handle({ session_id: sessionId }) {
        const current = store.claim(sessionId);
        try {
          if (current.scout.status === "complete") {
            store.replace(sessionId, current);
            return {
              ...sessionView(sessionId, current),
              last_operation: {
                operation: "automated_video_scout" as const,
                result: "already_complete" as const
              }
            };
          }

          const next = await runScout(current);
          store.replace(sessionId, next);
          return {
            ...sessionView(sessionId, next),
            last_operation: {
              operation: "automated_video_scout" as const,
              result: next.scout.status === "complete"
                ? "complete" as const
                : "blocked" as const
            }
          };
        } catch (error) {
          store.rollback(sessionId);
          throw error;
        }
      }
    });
  }

  function statusRoute(): ActionRoute {
    return route({
      operationId: "get_research_session_status",
      description: "Read server-derived research progress and remaining work. It does not accept caller-authored evidence or completion state.",
      inputSchema: sessionInputSchema,
      outputSchema: sessionViewSchema,
      async handle({ session_id: sessionId }) {
        return sessionView(sessionId, store.read(sessionId));
      }
    });
  }

  function finalizeRoute(): ActionRoute {
    return route({
      operationId: "finalize_research_report",
      description: "Return a report only when server-owned research gates pass. This prototype proves refusal while required work remains.",
      inputSchema: sessionInputSchema,
      outputSchema: finalizationOutputSchema,
      async handle({ session_id: sessionId }) {
        const state = store.read(sessionId);
        return {
          session_id: sessionId,
          status: state.phase === "blocked" ? "blocked" as const : "incomplete" as const,
          synthesis_permitted: false as const,
          report: null,
          reason: state.phase === "blocked"
            ? "research_access_boundary_requires_resolution" as const
            : "required_research_operations_remain" as const,
          completed_operations: state.completed_operations,
          remaining_work: state.remaining_work
        };
      }
    });
  }

  async function runScout(state: ResearchSessionState): Promise<ResearchSessionState> {
    const config = options.geminiConfig;
    const youtubeApiKey = options.youtubeApiKey;
    if (
      config === undefined ||
      config.apiKey.trim().length === 0 ||
      config.model.trim().length === 0 ||
      youtubeApiKey === undefined ||
      youtubeApiKey.trim().length === 0
    ) {
      return blockedScoutState(
        state,
        "Automated candidate discovery is not configured; no manual packet was substituted."
      );
    }

    const scoutInput: GeminiYoutubeScoutInput = {
      researchTarget: state.research_target,
      diagnosisStatus: state.diagnosis_status,
      scoutInstructions: await loadScoutInstructions()
    };
    const frontier = await scout(scoutInput, config);
    if (frontier.access_status !== "complete" || !("packet" in frontier.data)) {
      return blockedScoutState(
        state,
        plainScoutBoundary(frontier.access_status)
      );
    }
    const receipt = await validate(
      JSON.stringify(frontier.data.packet),
      { apiKey: youtubeApiKey }
    );
    return completedScoutState(state, frontier.data.response_id, receipt);
  }
}

interface RouteDefinition<T extends z.ZodObject, O extends z.ZodObject> {
  operationId: string;
  description: string;
  inputSchema: T;
  outputSchema: O;
  handle(input: z.output<T>): Promise<z.output<O>>;
}

function route<T extends z.ZodObject, O extends z.ZodObject>(
  definition: RouteDefinition<T, O>
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: `/actions/research/${definition.operationId}`,
    operationId: definition.operationId,
    summary: `AskRigor ${definition.operationId.replaceAll("_", " ")}`,
    description: definition.description,
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(definition.inputSchema),
    responseSchemas: {
      200: actionJsonSchema(definition.outputSchema),
      422: actionJsonSchema(actionErrorSchema)
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const input = definition.inputSchema.safeParse(body);
      if (!input.success) return invalidInput();
      try {
        return {
          status: 200,
          body: definition.outputSchema.parse(await definition.handle(input.data))
        };
      } catch (error) {
        if (error instanceof ResearchSessionUnavailableError) {
          return {
            status: 422,
            body: {
              error: {
                code: "research_session_invalid_or_expired",
                retryable: false
              }
            }
          };
        }
        throw error;
      }
    }
  });
}

function initialState(
  input: z.output<typeof startInputSchema>,
  universal: ProtocolManifest,
  hrp: ProtocolManifest
): ResearchSessionState {
  return {
    research_target: input.research_target,
    diagnosis_status: input.diagnosis_status,
    protocols: [protocolIdentity(universal), protocolIdentity(hrp)],
    phase: "automated_video_scout",
    synthesis_permitted: false,
    scout: {
      status: "not_started",
      candidate_count: 0,
      validated_candidate_ids: [],
      unresolved_candidate_ids: []
    },
    completed_operations: [],
    remaining_work: allRemainingWork()
  };
}

function protocolIdentity(manifest: ProtocolManifest) {
  return {
    name: manifest.name,
    version: manifest.version,
    revision_date: manifest.revisionDate,
    sha256: manifest.sha256
  };
}

function completedScoutState(
  state: ResearchSessionState,
  responseId: string,
  receipt: GeminiYoutubeCandidateValidationReceipt
): ResearchSessionState {
  return {
    ...state,
    phase: "candidate_screening_and_source_acquisition",
    scout: {
      status: "complete",
      provider_response_id: responseId,
      source_packet_version: receipt.source_packet_version,
      validation_status: receipt.status,
      candidate_count: receipt.candidate_frontier.source_candidate_video_ids.length,
      validated_candidate_ids: receipt.validated_candidates.map(({ video_id }) => video_id),
      unresolved_candidate_ids: receipt.unresolved_candidates.map(({ video_id }) => video_id)
    },
    completed_operations: ["automated_video_scout"],
    remaining_work: allRemainingWork().filter((item) =>
      item !== "automated_video_scout"
    )
  };
}

function blockedScoutState(
  state: ResearchSessionState,
  accessBoundary: string
): ResearchSessionState {
  return {
    ...state,
    phase: "blocked",
    scout: {
      status: "blocked",
      candidate_count: 0,
      validated_candidate_ids: [],
      unresolved_candidate_ids: [],
      access_boundary: accessBoundary
    }
  };
}

function sessionView(sessionId: string, state: ResearchSessionState) {
  return {
    session_id: sessionId,
    status: state.phase === "blocked" ? "blocked" as const : "in_progress" as const,
    next_required_operation: state.phase === "automated_video_scout"
      ? "automated_video_scout" as const
      : state.phase === "blocked"
        ? "resolve_access_boundary" as const
        : "candidate_screening_and_source_acquisition" as const,
    synthesis_permitted: false as const,
    protocols: state.protocols,
    scout: {
      status: state.scout.status,
      candidate_count: state.scout.candidate_count,
      validated_candidate_count: state.scout.validated_candidate_ids.length,
      unresolved_candidate_count: state.scout.unresolved_candidate_ids.length,
      ...(state.scout.access_boundary === undefined
        ? {}
        : { access_boundary: state.scout.access_boundary })
    },
    completed_operations: state.completed_operations,
    remaining_work: state.remaining_work
  };
}

function allRemainingWork(): ResearchSessionState["remaining_work"] {
  return [
    "automated_video_scout",
    "candidate_screening",
    "transcript_acquisition",
    "community_discussion_audit",
    "formal_evidence_search",
    "accessible_full_text_acquisition",
    "study_method_audit",
    "bidirectional_evidence_return",
    "treatment_landscape_finalization"
  ];
}

function plainScoutBoundary(accessStatus: string): string {
  if (accessStatus === "rate_limited") {
    return "Automated candidate discovery was temporarily rate limited; no manual packet was substituted.";
  }
  if (accessStatus === "inaccessible") {
    return "Automated candidate discovery could not be accessed with the configured provider account; no manual packet was substituted.";
  }
  return "Automated candidate discovery did not return a valid grounded candidate frontier; no manual packet was substituted.";
}

async function defaultScoutInstructions(): Promise<string> {
  return readFile(new URL(
    "../../../../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
    import.meta.url
  ), "utf8");
}

function invalidInput(): ActionResult {
  return {
    status: 422,
    body: {
      error: { code: "action_input_invalid", retryable: false }
    }
  };
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
    reused: "inline"
  }) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}
