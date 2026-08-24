import { readFile } from "node:fs/promises";

import {
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeScoutConfig,
  type GeminiYoutubeScoutInput
} from "@askrigor/sources";
import { getProtocolManifest } from "@askrigor/protocol";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import { surveyYoutubeCommunity } from "../youtube-community-survey.js";
import { nativeSurveyInputFromCandidateDiscovery } from "./research-candidate-frontier.js";
import {
  applyProtocolRecheck,
  createInitialResearchSessionState,
  evaluateResearchFinalization,
  finalizationDecisionSchema,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  recordAutomatedScoutBoundary,
  recordAutomatedScoutCompletion,
  recordNativeYoutubeDiscovery,
  researchSessionViewSchema,
  type ResearchSessionState
} from "./research-session-controller.js";
import {
  createResearchSessionStore,
  ResearchSessionUnavailableError,
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
const continuationOutputSchema = researchSessionViewSchema.extend({
  last_transition: z.object({
    capability: z.enum([
      "protocol_currency_recheck",
      "automated_video_scout",
      "native_video_discovery"
    ]),
    result: z.enum([
      "protocol_current",
      "protocol_drift",
      "complete",
      "blocked_retryable",
      "blocked_terminal",
      "already_complete"
    ])
  }).strict()
}).strict();
const actionErrorSchema = z.object({
  error: z.object({
    code: z.enum(["action_input_invalid", "research_session_invalid_or_expired"]),
    retryable: z.literal(false)
  }).strict()
}).strict();

type ScoutFunction = typeof scoutGeminiYoutubeCandidates;
type ValidateFunction = typeof validateGeminiYoutubeCandidateHandoff;
type NativeSurveyFunction = typeof surveyYoutubeCommunity;

export interface CreateResearchSessionPrototypeRoutesOptions {
  store?: ResearchSessionStore;
  getProtocolManifest?: typeof getProtocolManifest;
  scout?: ScoutFunction;
  validateCandidates?: ValidateFunction;
  surveyNativeCandidates?: NativeSurveyFunction;
  loadScoutInstructions?: () => Promise<string>;
  geminiConfig?: GeminiYoutubeScoutConfig;
  youtubeApiKey?: string;
  finalizationSigningSecret?: string;
  finalizationKeyId?: string;
  finalizationNow?: () => Date;
  finalizationPermitTtlMs?: number;
}

/**
 * Non-production transport adapter for the server-owned controller. It remains
 * absent from the installed Action and MCP inventories.
 */
export function createResearchSessionPrototypeRoutes(
  options: CreateResearchSessionPrototypeRoutesOptions = {}
): readonly ActionRoute[] {
  const store = options.store ?? createResearchSessionStore();
  const manifests = options.getProtocolManifest ?? getProtocolManifest;
  const scout = options.scout ?? scoutGeminiYoutubeCandidates;
  const validate = options.validateCandidates ?? validateGeminiYoutubeCandidateHandoff;
  const surveyNativeCandidates = options.surveyNativeCandidates ?? surveyYoutubeCommunity;
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
      description: "Start an ephemeral server-owned research workflow bound to exact protocol identities. This never authorizes synthesis.",
      inputSchema: startInputSchema,
      outputSchema: researchSessionViewSchema,
      async handle(input) {
        const protocols = await currentProtocolBindings(manifests);
        const state = createInitialResearchSessionState(input, protocols);
        const sessionId = store.issue(state);
        return projectResearchSessionView(sessionId, state);
      }
    });
  }

  function continueRoute(): ActionRoute {
    return route({
      operationId: "continue_research_session",
      description: "Execute the next supported server-required operation after rechecking protocol identity. Caller completion assertions are rejected.",
      inputSchema: sessionInputSchema,
      outputSchema: continuationOutputSchema,
      async handle({ session_id: sessionId }) {
        const claimed = store.claim(sessionId);
        try {
          const checked = applyProtocolRecheck(
            claimed,
            await currentProtocolBindings(manifests)
          );
          if (checked.protocol_binding.currency === "DRIFTED") {
            store.replace(sessionId, checked);
            return {
              ...projectResearchSessionView(sessionId, checked),
              last_transition: {
                capability: "protocol_currency_recheck" as const,
                result: "protocol_drift" as const
              }
            };
          }

          if (checked.scout.status !== "COMPLETE") {
            if (checked.operations.automated_video_scout.status === "BLOCKED_TERMINAL") {
              store.replace(sessionId, checked);
              return {
                ...projectResearchSessionView(sessionId, checked),
                last_transition: {
                  capability: "automated_video_scout" as const,
                  result: "blocked_terminal" as const
                }
              };
            }
            const next = await runScout(checked);
            store.replace(sessionId, next);
            const operationStatus = next.operations.automated_video_scout.status;
            return {
              ...projectResearchSessionView(sessionId, next),
              last_transition: {
                capability: "automated_video_scout" as const,
                result: operationStatus === "COMPLETE"
                  ? "complete" as const
                  : operationStatus === "BLOCKED_TERMINAL"
                    ? "blocked_terminal" as const
                    : "blocked_retryable" as const
              }
            };
          }

          const nativeStatus = checked.operations.native_video_discovery.status;
          if (nativeStatus === "COMPLETE" || nativeStatus === "BLOCKED_TERMINAL") {
            store.replace(sessionId, checked);
            return {
              ...projectResearchSessionView(sessionId, checked),
              last_transition: {
                capability: "native_video_discovery" as const,
                result: nativeStatus === "COMPLETE"
                  ? "already_complete" as const
                  : "blocked_terminal" as const
              }
            };
          }

          const next = await runNativeDiscovery(checked);
          store.replace(sessionId, next);
          const operationStatus = next.operations.native_video_discovery.status;
          return {
            ...projectResearchSessionView(sessionId, next),
            last_transition: {
              capability: "native_video_discovery" as const,
              result: operationStatus === "COMPLETE"
                ? "complete" as const
                : operationStatus === "BLOCKED_TERMINAL"
                  ? "blocked_terminal" as const
                  : "blocked_retryable" as const
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
      description: "Read server-derived research state and next capabilities. It accepts no caller-authored evidence or completion state.",
      inputSchema: sessionInputSchema,
      outputSchema: researchSessionViewSchema,
      async handle({ session_id: sessionId }) {
        return projectResearchSessionView(sessionId, store.read(sessionId));
      }
    });
  }

  function finalizeRoute(): ActionRoute {
    return route({
      operationId: "finalize_research_report",
      description: "Evaluate the one server-owned output boundary after rechecking protocol identity and issue only the exact integrity-bound scope that state permits.",
      inputSchema: sessionInputSchema,
      outputSchema: finalizationDecisionSchema,
      async handle({ session_id: sessionId }) {
        const claimed = store.claim(sessionId);
        try {
          const checked = applyProtocolRecheck(
            claimed,
            await currentProtocolBindings(manifests)
          );
          store.replace(sessionId, checked);
          return evaluateResearchFinalization(sessionId, checked, {
            ...(options.finalizationSigningSecret === undefined
              ? {}
              : { signingSecret: options.finalizationSigningSecret }),
            ...(options.finalizationKeyId === undefined
              ? {}
              : { keyId: options.finalizationKeyId }),
            ...(options.finalizationNow === undefined
              ? {}
              : { now: options.finalizationNow }),
            ...(options.finalizationPermitTtlMs === undefined
              ? {}
              : { ttlMs: options.finalizationPermitTtlMs })
          });
        } catch (error) {
          store.rollback(sessionId);
          throw error;
        }
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
      return recordAutomatedScoutBoundary(state, {
        classification: "RETRYABLE",
        code: "AUTOMATED_SCOUT_NOT_CONFIGURED",
        summary: "Automated candidate discovery is not configured; no manual packet was substituted."
      });
    }

    const scoutInput: GeminiYoutubeScoutInput = {
      researchTarget: state.research_target,
      diagnosisStatus: state.diagnosis_status,
      scoutInstructions: await loadScoutInstructions()
    };
    const frontier = await scout(scoutInput, config);
    if (frontier.access_status !== "complete" || !("packet" in frontier.data)) {
      return recordAutomatedScoutBoundary(
        state,
        scoutBoundary(frontier.access_status)
      );
    }
    const receipt = await validate(
      JSON.stringify(frontier.data.packet),
      { apiKey: youtubeApiKey }
    );
    return recordAutomatedScoutCompletion(state, {
      providerResponseId: frontier.data.response_id,
      packet: frontier.data.packet,
      receipt
    });
  }

  async function runNativeDiscovery(
    state: ResearchSessionState
  ): Promise<ResearchSessionState> {
    const youtubeApiKey = options.youtubeApiKey;
    if (youtubeApiKey === undefined || youtubeApiKey.trim().length === 0) {
      throw new Error("Native discovery requires the configured YouTube identity provider");
    }
    const input = nativeSurveyInputFromCandidateDiscovery(
      state.candidate_discovery,
      state.research_target
    );
    const survey = await surveyNativeCandidates(input, { apiKey: youtubeApiKey });
    return recordNativeYoutubeDiscovery(state, survey);
  }
}

interface RouteDefinition<T extends z.ZodType, O extends z.ZodType> {
  operationId: string;
  description: string;
  inputSchema: T;
  outputSchema: O;
  handle(input: z.output<T>): Promise<z.output<O>>;
}

function route<T extends z.ZodType, O extends z.ZodType>(
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

async function currentProtocolBindings(
  manifests: typeof getProtocolManifest
): Promise<ResearchSessionState["protocol_binding"]["expected"]> {
  const [universal, hrp] = await Promise.all([
    manifests("universal"),
    manifests("hrp")
  ]);
  return protocolBindingsFromManifests(universal, hrp);
}

function scoutBoundary(accessStatus: string) {
  if (accessStatus === "rate_limited") {
    return {
      classification: "RETRYABLE" as const,
      code: "AUTOMATED_SCOUT_RATE_LIMITED",
      summary: "Automated candidate discovery was temporarily rate limited; no manual packet was substituted."
    };
  }
  if (accessStatus === "inaccessible") {
    return {
      classification: "RETRYABLE" as const,
      code: "AUTOMATED_SCOUT_ACCOUNT_INACCESSIBLE",
      summary: "Automated candidate discovery could not be accessed with the configured provider account; no manual packet was substituted."
    };
  }
  return {
    classification: "RETRYABLE" as const,
    code: "AUTOMATED_SCOUT_INVALID_FRONTIER",
    summary: "Automated candidate discovery did not return a valid grounded frontier; no manual packet was substituted."
  };
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
