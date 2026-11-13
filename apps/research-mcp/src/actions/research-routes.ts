import { z } from "zod";
import {
  getProtocolManifest,
  loadProtocol
} from "@askrigor/protocol";

import { RESEARCH_OPERATIONS } from "../register-tools.js";
import type { ResearchOperation } from "../research-operation.js";
import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import { youtubeCommunityAuditOutputSchema } from "../youtube-community-audit.js";
import { youtubeVideoCommunityAuditOutputSchema } from
  "../youtube-video-community-audit.js";
import {
  createProtocolActionChunk,
  ProtocolActionContinuationError,
  protocolActionChunkInputSchema,
  protocolActionChunkOutputSchema,
  type ProtocolActionChunkDependencies
} from "./protocol-continuation.js";
import { boundYoutubeAuditForAction } from "./research-output.js";
import {
  discussionReceiptSchema,
  projectDiscussionCoverageReceipt
} from "./treatment-landscape-coverage-route.js";
import {
  createYoutubeActionContinuationHandleStore,
  YoutubeActionContinuationHandleError,
  type YoutubeActionContinuationHandleStore
} from "./youtube-continuation-handle.js";
import type {
  ActionRequestContext,
  ActionResult,
  ActionRoute
} from "./types.js";

type YoutubeAuditActionOutput = z.output<typeof youtubeVideoCommunityAuditOutputSchema> & {
  coverage_receipt: z.output<typeof discussionReceiptSchema>;
};

const ACTION_INPUT_INVALID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "retryable"],
      properties: {
        code: { const: "action_input_invalid" },
        retryable: { const: false }
      }
    }
  }
} as const;

const PROTOCOL_CONTINUATION_ERROR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "retryable"],
      properties: {
        code: {
          type: "string",
          enum: [
            "protocol_action_continuation_invalid",
            "protocol_action_continuation_expired",
            "protocol_action_protocol_changed"
          ]
        },
        retryable: { const: false }
      }
    }
  }
} as const;

const YOUTUBE_ACTION_CONTINUATION_ERROR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "retryable"],
      properties: {
        code: { const: "youtube_action_continuation_invalid_or_expired" },
        retryable: { const: false }
      }
    }
  }
} as const;

const YOUTUBE_AUDIT_RESTART_REQUIRED_CODES = new Set([
  "youtube_video_audit_continuation_migration_restart_required",
  "youtube_video_audit_identifier_membership_restart_required"
]);

export interface CreateResearchActionRoutesOptions {
  operations?: readonly ResearchOperation[];
  protocolChunkDependencies?: ProtocolActionChunkDependencies;
  youtubeContinuationHandles?: YoutubeActionContinuationHandleStore;
  /**
   * False for a caller inside the process, which the Action route's byte limit does not bind (the research session's
   * controller): its per-video audit reply stays as it always was, the audit cut to its first size with the receipt
   * added whole, and is never refused for the receipt's size. True, the default, is the HTTP route, whose router
   * refuses a reply over the limit, so the reply is cut until all of it fits (two reviews of 13 Nov 2026; the second
   * found that the controller, which took the long reply before, would have been refused it).
   */
  replyWithinActionLimit?: boolean;
}

export function createResearchActionRoutes(
  options: CreateResearchActionRoutesOptions = {}
): readonly ActionRoute[] {
  const operations = options.operations ?? RESEARCH_OPERATIONS;
  const youtubeContinuationHandles = options.youtubeContinuationHandles ??
    createYoutubeActionContinuationHandleStore();
  return Object.freeze(operations.filter(({ actionEnabled }) => actionEnabled !== false).map((operation) =>
    operation.name === "load_protocol"
      ? createProtocolActionRoute(
          operation,
          options.protocolChunkDependencies ?? defaultProtocolChunkDependencies()
        )
      : createResearchActionRoute(operation, youtubeContinuationHandles, options.replyWithinActionLimit !== false)
  ));
}

function createProtocolActionRoute(
  operation: ResearchOperation,
  dependencies: ProtocolActionChunkDependencies
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: operation.actionPath,
    operationId: operation.name,
    summary: "AskRigor load protocol",
    description: `${operation.description} Action responses are returned as exact ordered chunks; continue until complete is true.`,
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(protocolActionChunkInputSchema),
    responseSchemas: {
      200: actionJsonSchema(protocolActionChunkOutputSchema),
      422: {
        oneOf: [ACTION_INPUT_INVALID_SCHEMA, PROTOCOL_CONTINUATION_ERROR_SCHEMA]
      }
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsedInput = protocolActionChunkInputSchema.safeParse(body);
      if (!parsedInput.success) {
        return {
          status: 422,
          body: { error: { code: "action_input_invalid", retryable: false } }
        };
      }
      try {
        return {
          status: 200,
          body: protocolActionChunkOutputSchema.parse(
            await createProtocolActionChunk(parsedInput.data, dependencies)
          )
        };
      } catch (error) {
        if (error instanceof ProtocolActionContinuationError) {
          return {
            status: 422,
            body: { error: { code: error.code, retryable: false } }
          };
        }
        throw error;
      }
    }
  });
}

function createResearchActionRoute(
  operation: ResearchOperation,
  youtubeContinuationHandles: YoutubeActionContinuationHandleStore,
  replyWithinActionLimit: boolean
): ActionRoute {
  const inputSchema = objectSchema(operation.inputSchema, operation.name, "input");
  // The MCP audit tools declare their compact views; Action calls get the full audits.
  const outputSchema = operation.name === "audit_youtube_video_community"
    ? youtubeVideoCommunityAuditOutputSchema
    : operation.name === "audit_youtube_community"
      ? youtubeCommunityAuditOutputSchema
      : objectSchema(operation.outputSchema, operation.name, "output");
  const actionOutputSchema = operation.name === "audit_youtube_video_community"
    ? youtubeVideoCommunityAuditOutputSchema.extend({
        coverage_receipt: discussionReceiptSchema
      }).strict()
    : outputSchema;
  return Object.freeze({
    method: "POST",
    path: operation.actionPath,
    operationId: operation.name,
    summary: `AskRigor ${operation.name.replaceAll("_", " ")}`,
    description: researchActionDescription(operation),
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(inputSchema),
    responseSchemas: {
      200: actionJsonSchema(actionOutputSchema),
      422: operation.name === "audit_youtube_video_community"
        ? {
            oneOf: [
              ACTION_INPUT_INVALID_SCHEMA,
              YOUTUBE_ACTION_CONTINUATION_ERROR_SCHEMA
            ]
          }
        : ACTION_INPUT_INVALID_SCHEMA
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsedInput = inputSchema.safeParse(body);
      if (!parsedInput.success) {
        return {
          status: 422,
          body: { error: { code: "action_input_invalid", retryable: false } }
        };
      }
      let operationInput = parsedInput.data as Record<string, unknown>;
      let previousHandle: string | undefined;
      if (operation.name === "audit_youtube_video_community") {
        const suppliedContinuation = operationInput.continuation_token;
        if (
          typeof suppliedContinuation === "string" &&
          suppliedContinuation.startsWith("arh1_")
        ) {
          try {
            operationInput = {
              ...operationInput,
              continuation_token: youtubeContinuationHandles.claim(
                suppliedContinuation
              )
            };
            previousHandle = suppliedContinuation;
          } catch (error) {
            if (error instanceof YoutubeActionContinuationHandleError) {
              return {
                status: 422,
                body: {
                  error: {
                    code: "youtube_action_continuation_invalid_or_expired",
                    retryable: false
                  }
                }
              };
            }
            throw error;
          }
        }
      }
      // A claimed handle is committed only once the operation has run with it
      // to a successor or to an end (below). Every other way out of this
      // request releases the claim, by the store's rollback, so the same
      // handle can be used again: an error, a receipt that neither continues
      // nor ends the audit, and a request the operation refused as invalid
      // input before running. That last one used to leave the handle claimed,
      // so the corrected retry was answered
      // youtube_action_continuation_invalid_or_expired and the audit's chain
      // was lost (Greptile's review of 12 Nov 2026, P1).
      let committed = false;
      try {
        const result = await operation.execute(operationInput, { surface: "action" });
        if (result.isError === true && result._meta?.["askrigor/errorCode"] === "invalid_input") {
          return { status: 422, body: { error: { code: "action_input_invalid", retryable: false } } };
        }
        // Research receipts serve MCP's finalize_research. The Custom GPT's
        // session controller keeps its own ledger, so Actions return none.
        const { research_receipt: _receipt, ...structuredContent } = result.structuredContent ?? {};
        const parsedOutput = outputSchema.safeParse(structuredContent);
        if (!parsedOutput.success) {
          throw new Error("Research operation returned invalid structured output");
        }
        const originalYoutubeOutput = operation.name === "audit_youtube_video_community"
          ? youtubeVideoCommunityAuditOutputSchema.parse(parsedOutput.data)
          : undefined;
        const actionOutput = originalYoutubeOutput === undefined
          ? parsedOutput.data
          : youtubeAuditActionOutput(originalYoutubeOutput, youtubeContinuationHandles, replyWithinActionLimit);
        const validatedActionOutput = actionOutputSchema.safeParse(actionOutput);
        if (!validatedActionOutput.success) {
          throw new Error("Research Action adapter returned invalid structured output");
        }
        if (previousHandle !== undefined) {
          // For the HTTP route, youtubeAuditActionOutput measured the reply
          // against the route's byte limit, so the router cannot refuse it
          // for size once the handle is gone.
          const youtubeOutput = originalYoutubeOutput!;
          if (
            youtubeOutput.continuation_token !== undefined ||
            youtubeOutput.receipt.synthesis_lock === "pass" ||
            (
              youtubeOutput.error?.retryable === false &&
              YOUTUBE_AUDIT_RESTART_REQUIRED_CODES.has(youtubeOutput.error.code)
            )
          ) {
            youtubeContinuationHandles.commit(previousHandle);
            committed = true;
          }
        }
        return { status: 200, body: validatedActionOutput.data };
      } finally {
        if (previousHandle !== undefined && !committed) {
          youtubeContinuationHandles.rollback(previousHandle);
        }
      }
    }
  });
}

function researchActionDescription(operation: ResearchOperation): string {
  if (
    operation.name === "get_youtube_comments" ||
    operation.name === "audit_youtube_community"
  ) {
    return "Legacy untrimmed YouTube community response; it may return action_response_too_large. Use survey_youtube_community, then resumable audit_youtube_video_community. Retrieval only; no medical conclusions.";
  }
  if (operation.name === "audit_youtube_video_community") {
    return "Retrieve one video's bounded API-visible YouTube discussion. Custom GPT continuation uses a short one-hour in-memory handle. Review returned partial-corpus records as bounded evidence; require synthesis_lock pass only for complete-coverage or broad-ranking claims. Retrieval only; no medical conclusions.";
  }
  return operation.description;
}

/**
 * The audit as the Action sends it: its continuation token replaced by a short
 * handle, its sample cut to fit, and the coverage receipt projected from what
 * is sent.
 *
 * The reply returned here has been measured against the route's byte limit.
 * The receipt repeats the audit's reply-count mismatches and blockers, so the
 * 4,000 bytes held back for it are enough only while those lists are short;
 * a receipt that needs more takes the room from the audit's sample. The reply
 * used to be the audit cut to 56,000 bytes plus whatever the receipt came to,
 * and with a few dozen mismatches it passed 60,000 bytes. The router refuses
 * such a reply only after the route has returned, which is after the caller's
 * handle was committed, so the audit could not continue (two reviews of
 * 13 Nov 2026, both P1).
 *
 * A reply that fits at no sample size is refused here, with the error the
 * router answers as 502 action_response_too_large. The handle issued for it is
 * revoked, and the route rolls the caller's own handle back.
 */
function youtubeAuditActionOutput(
  output: z.output<typeof youtubeVideoCommunityAuditOutputSchema>,
  handles: YoutubeActionContinuationHandleStore,
  replyWithinActionLimit: boolean
): YoutubeAuditActionOutput {
  const statelessToken = output.continuation_token;
  let nextHandle: string | undefined;
  try {
    const transportOutput = youtubeVideoCommunityAuditOutputSchema.parse(
      statelessToken === undefined
        ? output
        : {
            ...output,
            continuation_token: nextHandle = handles.issue(statelessToken)
          }
    );
    let auditBytes = RESEARCH_ACTION_RESPONSE_MAX_BYTES - 4_000;
    for (;;) {
      // Throws ActionResponseTooLargeError once not even one record fits.
      const bounded = boundYoutubeAuditForAction(transportOutput, auditBytes);
      const reply = {
        ...bounded,
        coverage_receipt: projectDiscussionCoverageReceipt(bounded)
      };
      // A caller inside the process is not bound by the route's limit: it gets the reply as before, the audit at
      // its first size and the receipt whole.
      if (!replyWithinActionLimit) return reply;
      const excessBytes = serializedBytes(reply) - RESEARCH_ACTION_RESPONSE_MAX_BYTES;
      if (excessBytes <= 0) return reply;
      // Smaller each time round, so this ends: in a reply that fits, or in
      // the refusal above.
      auditBytes = Math.max(1, serializedBytes(bounded) - excessBytes);
    }
  } catch (error) {
    if (nextHandle !== undefined) handles.revoke(nextHandle);
    throw error;
  }
}

/** The size the router measures a reply by. */
function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function objectSchema(
  schema: unknown,
  operationName: string,
  boundary: "input" | "output"
): z.ZodType {
  if (
    typeof schema === "object" &&
    schema !== null &&
    "safeParse" in schema &&
    typeof schema.safeParse === "function"
  ) {
    return schema as z.ZodType;
  }
  if (typeof schema === "object" && schema !== null && !Array.isArray(schema)) {
    return z.object(schema as z.ZodRawShape).strict();
  }
  throw new Error(`Research operation ${operationName} has an invalid ${boundary} schema`);
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}

function defaultProtocolChunkDependencies(): ProtocolActionChunkDependencies {
  return {
    continuationSecret: process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET ?? "",
    loadProtocol,
    getProtocolManifest
  };
}
