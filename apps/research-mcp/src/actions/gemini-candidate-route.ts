import {
  GeminiYoutubeCandidateHandoffError,
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES,
  geminiYoutubeCandidateValidationReceiptSchema,
  validateGeminiYoutubeCandidateHandoff
} from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

export const geminiCandidateActionInputSchema = z.object({
  packet: z.string().min(1).max(MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES)
}).strict();

export const GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES =
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES * 2 + 4_096;

const geminiCandidateActionErrorSchema = z.object({
  error: z.object({
    code: z.enum(["invalid_framing", "invalid_json", "invalid_packet"]),
    retryable: z.literal(false),
    issues: z.array(z.object({
      path: z.string(),
      message: z.string()
    }).strict()).max(100)
  }).strict()
}).strict();

export interface CreateGeminiCandidateActionRouteOptions {
  youtubeApiKey?: string;
  validate?: typeof validateGeminiYoutubeCandidateHandoff;
}

export function createGeminiCandidateActionRoute(
  options: CreateGeminiCandidateActionRouteOptions = {}
): ActionRoute {
  const validate = options.validate ?? validateGeminiYoutubeCandidateHandoff;
  return Object.freeze({
    method: "POST",
    path: "/actions/research/validate_gemini_youtube_candidate_handoff",
    operationId: "validate_gemini_youtube_candidate_handoff",
    summary: "AskRigor validate Spark YouTube candidates",
    description: "Validate a provisional Gemini Spark candidate packet and each public YouTube identity. Summaries remain unverified discovery leads, not treatment evidence.",
    consequential: false,
    public: true,
    publicResearch: true,
    maximumRequestBytes: GEMINI_CANDIDATE_ACTION_REQUEST_MAX_BYTES,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(geminiCandidateActionInputSchema),
    responseSchemas: {
      200: actionJsonSchema(geminiYoutubeCandidateValidationReceiptSchema),
      422: actionJsonSchema(geminiCandidateActionErrorSchema)
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = geminiCandidateActionInputSchema.safeParse(body);
      if (!parsed.success) {
        return invalidResult("invalid_packet", parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        })));
      }
      try {
        return {
          status: 200,
          body: await validate(parsed.data.packet, {
            apiKey: options.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? ""
          })
        };
      } catch (error) {
        if (error instanceof GeminiYoutubeCandidateHandoffError) {
          return invalidResult(error.code, error.issues);
        }
        throw error;
      }
    }
  });
}

function invalidResult(
  code: "invalid_framing" | "invalid_json" | "invalid_packet",
  issues: Array<{ path: string; message: string }>
): ActionResult {
  return {
    status: 422,
    body: geminiCandidateActionErrorSchema.parse({
      error: { code, retryable: false, issues: issues.slice(0, 100) }
    })
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
