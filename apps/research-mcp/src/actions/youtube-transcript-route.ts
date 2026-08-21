import {
  getYoutubeTranscript,
  youtubeTranscriptEnvelopeSchema,
  youtubeTranscriptInputSchema,
  type YoutubeTranscriptEnvelope,
  type YoutubeTranscriptInput
} from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

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

export interface CreateYoutubeTranscriptActionRouteOptions {
  getTranscript?: (input: YoutubeTranscriptInput) => Promise<YoutubeTranscriptEnvelope>;
}

export function createYoutubeTranscriptActionRoute(
  options: CreateYoutubeTranscriptActionRouteOptions = {}
): ActionRoute {
  const retrieve = options.getTranscript ?? getYoutubeTranscript;
  return Object.freeze({
    method: "POST",
    path: "/actions/research/get_youtube_transcript",
    operationId: "get_youtube_transcript",
    summary: "AskRigor get YouTube transcript",
    description: "Retrieve one bounded, timestamped public-video caption track. Continue its cursor until exhausted. Unofficial best-effort access; retrieval only, not evidence validation.",
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(youtubeTranscriptInputSchema),
    responseSchemas: {
      200: actionJsonSchema(youtubeTranscriptEnvelopeSchema),
      422: ACTION_INPUT_INVALID_SCHEMA
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = youtubeTranscriptInputSchema.safeParse(body);
      if (!parsed.success) {
        return {
          status: 422,
          body: { error: { code: "action_input_invalid", retryable: false } }
        };
      }
      const result = await retrieve(parsed.data);
      return {
        status: 200,
        body: youtubeTranscriptEnvelopeSchema.parse(result)
      };
    }
  });
}

export function createActionOnlyResearchRoutes(): readonly ActionRoute[] {
  return Object.freeze([createYoutubeTranscriptActionRoute()]);
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}
