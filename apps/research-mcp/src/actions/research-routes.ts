import { z } from "zod";
import {
  getProtocolManifest,
  loadProtocol
} from "@askrigor/protocol";

import { RESEARCH_OPERATIONS } from "../register-tools.js";
import type { ResearchOperation } from "../research-operation.js";
import {
  createProtocolActionChunk,
  ProtocolActionContinuationError,
  protocolActionChunkInputSchema,
  protocolActionChunkOutputSchema,
  type ProtocolActionChunkDependencies
} from "./protocol-continuation.js";
import type {
  ActionRequestContext,
  ActionResult,
  ActionRoute
} from "./types.js";

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

export interface CreateResearchActionRoutesOptions {
  operations?: readonly ResearchOperation[];
  protocolChunkDependencies?: ProtocolActionChunkDependencies;
}

export function createResearchActionRoutes(
  options: CreateResearchActionRoutesOptions = {}
): readonly ActionRoute[] {
  const operations = options.operations ?? RESEARCH_OPERATIONS;
  return Object.freeze(operations.map((operation) =>
    operation.name === "load_protocol"
      ? createProtocolActionRoute(
          operation,
          options.protocolChunkDependencies ?? defaultProtocolChunkDependencies()
        )
      : createResearchActionRoute(operation)
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

function createResearchActionRoute(operation: ResearchOperation): ActionRoute {
  const inputSchema = objectSchema(operation.inputSchema, operation.name, "input");
  const outputSchema = objectSchema(operation.outputSchema, operation.name, "output");
  return Object.freeze({
    method: "POST",
    path: operation.actionPath,
    operationId: operation.name,
    summary: `AskRigor ${operation.name.replaceAll("_", " ")}`,
    description: operation.description,
    consequential: false,
    public: true,
    publicResearch: true,
    requestSchema: actionJsonSchema(inputSchema),
    responseSchemas: {
      200: actionJsonSchema(outputSchema),
      422: ACTION_INPUT_INVALID_SCHEMA
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsedInput = inputSchema.safeParse(body);
      if (!parsedInput.success) {
        return {
          status: 422,
          body: { error: { code: "action_input_invalid", retryable: false } }
        };
      }
      const result = await operation.execute(
        parsedInput.data as Record<string, unknown>
      );
      const parsedOutput = outputSchema.safeParse(result.structuredContent);
      if (!parsedOutput.success) {
        throw new Error("Research operation returned invalid structured output");
      }
      return { status: 200, body: parsedOutput.data };
    }
  });
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
