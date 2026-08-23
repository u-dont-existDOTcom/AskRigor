import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import {
  GeminiYoutubeCandidateHandoffError,
  geminiYoutubeCandidateV2PacketSchema,
  parseGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeCandidatePacket
} from "./gemini-youtube-candidate-handoff.js";
import { fetchJson, UpstreamHttpError } from "./http.js";

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const diagnosisStatusSchema = z.enum([
  "diagnosis_not_specified",
  "user_supplied_diagnosis"
]);
const scoutInputSchema = z.object({
  researchTarget: z.string().trim().min(1).max(1_000),
  diagnosisStatus: diagnosisStatusSchema,
  scoutInstructions: z.string().trim().min(1).max(30_000)
}).strict();
const scoutConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(4_096),
  model: z.string().trim().min(1).max(200)
}).strict();

const interactionStepSchema = z.object({
  type: z.string().min(1)
}).passthrough();
const interactionResponseSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  model: z.string().optional(),
  steps: z.array(interactionStepSchema)
}).passthrough();

export interface GeminiYoutubeScoutInput {
  researchTarget: string;
  diagnosisStatus: z.output<typeof diagnosisStatusSchema>;
  scoutInstructions: string;
}

export interface GeminiYoutubeScoutConfig {
  apiKey: string;
  model: string;
}

export interface GeminiYoutubeScoutData {
  response_id: string;
  model: string;
  google_search_grounded: true;
  packet: GeminiYoutubeCandidatePacket;
}

/**
 * Runs Gemini as a high-recall, Google-grounded YouTube discovery scout.
 * Its packet is a provisional candidate frontier only; provider metadata,
 * transcripts, comments, and treatment claims remain unverified downstream.
 */
export async function scoutGeminiYoutubeCandidates(
  input: GeminiYoutubeScoutInput,
  config: GeminiYoutubeScoutConfig
): Promise<ProvenanceEnvelope<GeminiYoutubeScoutData | Record<string, never>>> {
  const parsedInput = scoutInputSchema.safeParse(input);
  if (!parsedInput.success) throw new Error("Invalid Gemini YouTube scout input");
  const parsedConfig = scoutConfigSchema.safeParse(config);
  if (!parsedConfig.success) throw new Error("Invalid Gemini YouTube scout configuration");

  const request = {
    model: parsedConfig.data.model,
    input: buildScoutPrompt(parsedInput.data),
    tools: [{ type: "google_search" }],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: structuredPacketSchema()
    }
  };

  try {
    const raw = await fetchJson(GEMINI_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": parsedConfig.data.apiKey
      },
      body: JSON.stringify(request),
      maxRetries: 0
    });
    const response = interactionResponseSchema.safeParse(raw);
    if (!response.success || response.data.status !== "completed") {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_invalid_response",
        message: "Gemini scout returned an invalid or incomplete response",
        retryable: false
      });
    }

    const searchGrounded = response.data.steps.some((step) =>
      step.type === "google_search_call" || step.type === "google_search_result"
    );
    if (!searchGrounded) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_ungrounded",
        message: "Gemini scout response did not include Google Search grounding",
        retryable: false
      });
    }

    const output = findModelOutput(response.data.steps);
    if (output === undefined) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_missing_output",
        message: "Gemini scout response did not include structured model output",
        retryable: false
      });
    }

    let packet: GeminiYoutubeCandidatePacket;
    try {
      packet = parseGeminiYoutubeCandidateHandoff(output);
    } catch (error) {
      if (!(error instanceof GeminiYoutubeCandidateHandoffError)) throw error;
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_invalid_packet",
        message: "Gemini scout output did not satisfy the candidate contract",
        retryable: false
      });
    }

    return okEnvelope({
      provider: "gemini_api",
      recordType: "gemini_youtube_candidate_frontier",
      primaryIdentifier: response.data.id,
      query: {
        research_target: parsedInput.data.researchTarget,
        diagnosis_status: parsedInput.data.diagnosisStatus
      },
      pagination: { exhausted: true },
      returned: packet.candidates.length,
      accessStatus: "complete",
      limitations: scoutLimitations(),
      rawMetadata: {
        model: response.data.model ?? parsedConfig.data.model,
        google_search_grounded: true
      },
      data: {
        response_id: response.data.id,
        model: response.data.model ?? parsedConfig.data.model,
        google_search_grounded: true,
        packet
      }
    });
  } catch (error) {
    const status = error instanceof UpstreamHttpError ? error.status : undefined;
    if (status === 429) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "rate_limited",
        code: "gemini_youtube_scout_rate_limited",
        message: "Gemini scout rate limit was reached",
        httpStatus: status,
        retryable: true
      });
    }
    if (status === 401 || status === 403) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "inaccessible",
        code: "gemini_youtube_scout_inaccessible",
        message: "Gemini scout was not accessible with the configured credentials",
        httpStatus: status,
        retryable: false
      });
    }
    return scoutErrorEnvelope(parsedInput.data, {
      accessStatus: "error",
      code: status !== undefined && status >= 500
        ? "gemini_youtube_scout_upstream_unavailable"
        : "gemini_youtube_scout_request_failed",
      message: status !== undefined && status >= 500
        ? "Gemini scout service was unavailable"
        : "Gemini scout request failed",
      ...(status === undefined ? {} : { httpStatus: status }),
      retryable: status !== undefined && status >= 500
    });
  }
}

function buildScoutPrompt(input: z.output<typeof scoutInputSchema>): string {
  return [
    input.scoutInstructions,
    "",
    "AskRigor research target:",
    input.researchTarget,
    "",
    `Diagnosis status: ${input.diagnosisStatus}`,
    "",
    "Return only the required version 2 JSON packet. Use public web and YouTube discovery context for candidate selection. Treat every creator summary as provisional and not transcript-verified by AskRigor."
  ].join("\n");
}

function structuredPacketSchema(): Record<string, unknown> {
  const converted = z.toJSONSchema(geminiYoutubeCandidateV2PacketSchema) as Record<string, unknown>;
  return normalizeStructuredSchema(converted) as Record<string, unknown>;
}

function normalizeStructuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStructuredSchema);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "$schema") continue;
    if (key === "const") {
      normalized.enum = [normalizeStructuredSchema(child)];
      continue;
    }
    normalized[key] = normalizeStructuredSchema(child);
  }
  return normalized;
}

function findModelOutput(steps: z.output<typeof interactionStepSchema>[]): string | undefined {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index]!;
    if (step.type !== "model_output") continue;
    const direct = typeof step.text === "string" ? step.text : undefined;
    if (direct !== undefined && direct.trim().length > 0) return direct;
    if (!Array.isArray(step.content)) continue;
    const text = step.content
      .map((item) => {
        if (typeof item !== "object" || item === null) return "";
        const record = item as Record<string, unknown>;
        return record.type === "text" && typeof record.text === "string"
          ? record.text
          : "";
      })
      .join("");
    if (text.trim().length > 0) return text;
  }
  return undefined;
}

function scoutLimitations(): string[] {
  return [
    "Gemini candidate summaries are provisional discovery annotations, not transcript-verified creator content.",
    "The scout did not retrieve YouTube comments or establish treatment efficacy, safety, causality, or scientific validity.",
    "AskRigor must validate video identity and independently retrieve any required transcripts, comments, and formal evidence before synthesis."
  ];
}

interface ScoutErrorDetails {
  accessStatus: AccessStatus;
  code: string;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

function scoutErrorEnvelope(
  input: z.output<typeof scoutInputSchema>,
  details: ScoutErrorDetails
): ProvenanceEnvelope<Record<string, never>> {
  return errorEnvelope({
    provider: "gemini_api",
    recordType: "gemini_youtube_candidate_frontier",
    query: {
      research_target: input.researchTarget,
      diagnosis_status: input.diagnosisStatus
    },
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: scoutLimitations(),
    code: details.code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {}
  }) as ProvenanceEnvelope<Record<string, never>>;
}
