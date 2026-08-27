import { getProtocolManifest } from "@askrigor/protocol";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import {
  applyProtocolRecheck,
  createInitialResearchSessionState,
  evaluateResearchFinalization,
  finalizationDecisionSchema,
  projectResearchSessionView,
  protocolBindingsFromManifests,
  researchSessionViewSchema,
  type ResearchSessionState
} from "./research-session-controller.js";
import {
  createResearchSessionDiscoveryExecutors,
  type CreateResearchSessionDiscoveryExecutorsOptions
} from "./research-session-discovery.js";
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

export interface CreateResearchSessionPrototypeRoutesOptions
  extends CreateResearchSessionDiscoveryExecutorsOptions {
  store?: ResearchSessionStore;
  getProtocolManifest?: typeof getProtocolManifest;
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
  const discovery = createResearchSessionDiscoveryExecutors(options);

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
        try {
          return projectResearchSessionView(sessionId, state);
        } catch (error) {
          store.delete(sessionId);
          throw error;
        }
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
            const projected = {
              ...projectResearchSessionView(sessionId, checked),
              last_transition: {
                capability: "protocol_currency_recheck" as const,
                result: "protocol_drift" as const
              }
            };
            store.replace(sessionId, checked);
            return projected;
          }

          if (
            checked.scout.status !== "COMPLETE" &&
            checked.operations.automated_video_scout.status !== "BLOCKED_TERMINAL"
          ) {
            const next = await discovery.automatedScout(checked);
            const operationStatus = next.operations.automated_video_scout.status;
            const projected = {
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
            store.replace(sessionId, next);
            return projected;
          }

          const nativeStatus = checked.operations.native_video_discovery.status;
          if (nativeStatus === "COMPLETE" || nativeStatus === "BLOCKED_TERMINAL") {
            const projected = {
              ...projectResearchSessionView(sessionId, checked),
              last_transition: {
                capability: "native_video_discovery" as const,
                result: nativeStatus === "COMPLETE"
                  ? "already_complete" as const
                  : "blocked_terminal" as const
              }
            };
            store.replace(sessionId, checked);
            return projected;
          }

          const next = await discovery.nativeDiscovery(checked);
          const operationStatus = next.operations.native_video_discovery.status;
          const projected = {
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
          store.replace(sessionId, next);
          return projected;
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
          const decision = evaluateResearchFinalization(sessionId, checked, {
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
          store.replace(sessionId, checked);
          return decision;
        } catch (error) {
          store.rollback(sessionId);
          throw error;
        }
      }
    });
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
