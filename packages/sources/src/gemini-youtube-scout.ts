import { createHash } from "node:crypto";

import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import {
  GeminiYoutubeCandidateHandoffError,
  GEMINI_YOUTUBE_SUMMARY_BASIS,
  MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES,
  parseGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeCandidateHandoffIssue,
  type GeminiYoutubeCandidatePacket
} from "./gemini-youtube-candidate-handoff.js";
import { fetchJson, UpstreamHttpError } from "./http.js";

const GEMINI_INTERACTIONS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
export const GEMINI_YOUTUBE_SCOUT_MODEL = "gemini-3.6-flash" as const;
export const GEMINI_YOUTUBE_SCOUT_MAX_OUTPUT_TOKENS = 12_000 as const;
const GEMINI_YOUTUBE_SCOUT_TIMEOUT_MS = 45_000;
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
  id: z.string().min(1).optional(),
  status: z.string().min(1),
  model: z.string().optional(),
  steps: z.array(interactionStepSchema),
  usage: z.object({
    total_input_tokens: z.number().int().nonnegative().optional(),
    total_output_tokens: z.number().int().nonnegative().optional(),
    total_thought_tokens: z.number().int().nonnegative().optional(),
    grounding_tool_count: z.array(z.object({
      type: z.string(),
      count: z.number().int().nonnegative()
    }).passthrough()).optional()
  }).passthrough().optional()
}).passthrough();

const compactTextSchema = z.string().max(2_048);
const compactDiscoveryQueryRowSchema = z.tuple([
  compactTextSchema,
  compactTextSchema
]);
const compactCandidateRowSchema = z.tuple([
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema,
  compactTextSchema
]);
const compactProviderPacketSchema = z.object({
  packet_name: compactTextSchema,
  packet_version: compactTextSchema,
  research_target: compactTextSchema,
  diagnosis_status: compactTextSchema,
  discovery_query_rows: z.array(compactDiscoveryQueryRowSchema).max(18),
  candidate_rows: z.array(compactCandidateRowSchema).max(16),
  suggested_seed_video_ids: z.array(compactTextSchema).max(8),
  search_gaps: z.array(compactTextSchema).max(8),
  disclosures: z.array(compactTextSchema).max(4)
}).strict();

type InteractionResponse = z.output<typeof interactionResponseSchema>;

interface PacketAttemptSuccess {
  success: true;
  packet: GeminiYoutubeCandidatePacket;
}

interface PacketAttemptFailure {
  success: false;
  code: "invalid_packet" | "query_receipt_mismatch";
  issues: GeminiYoutubeCandidateHandoffIssue[];
}

type PacketAttempt = PacketAttemptSuccess | PacketAttemptFailure;

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
  provider_storage_disabled: true;
  correction_attempted: boolean;
  provider_interaction_count: 1 | 2;
  executed_search_queries: string[];
  usage: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
    google_search_queries: number;
  };
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

  try {
    const initialRaw = await requestGeminiInteraction(
      parsedConfig.data,
      buildInitialRequest(parsedInput.data, parsedConfig.data.model)
    );
    const initialResponse = completedInteraction(initialRaw);
    if (initialResponse === undefined) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_invalid_response",
        message: "Gemini scout returned an invalid or incomplete response",
        retryable: false
      });
    }

    const searchGrounded = initialResponse.steps.some((step) =>
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
    const executedSearchQueries = findExecutedSearchQueries(initialResponse.steps);

    const initialOutput = findModelOutput(initialResponse.steps);
    if (initialOutput === undefined) {
      return scoutErrorEnvelope(parsedInput.data, {
        accessStatus: "error",
        code: "gemini_youtube_scout_missing_output",
        message: "Gemini scout response did not include structured model output",
        retryable: false
      });
    }

    const rawResponses: unknown[] = [initialRaw];
    const responses: InteractionResponse[] = [initialResponse];
    let attempt = attemptProviderPacket(initialOutput, executedSearchQueries);
    if (!attempt.success) {
      const repairRaw = await requestGeminiInteraction(
        parsedConfig.data,
        buildRepairRequest(
          parsedInput.data,
          parsedConfig.data.model,
          initialOutput,
          attempt,
          executedSearchQueries
        )
      );
      const repairResponse = completedInteraction(repairRaw);
      if (repairResponse === undefined) {
        return scoutErrorEnvelope(parsedInput.data, {
          accessStatus: "error",
          code: "gemini_youtube_scout_invalid_response",
          message: "Gemini scout correction returned an invalid or incomplete response",
          retryable: false
        });
      }
      const repairOutput = findModelOutput(repairResponse.steps);
      if (repairOutput === undefined) {
        return scoutErrorEnvelope(parsedInput.data, {
          accessStatus: "error",
          code: "gemini_youtube_scout_missing_output",
          message: "Gemini scout correction did not include structured model output",
          retryable: false
        });
      }
      rawResponses.push(repairRaw);
      responses.push(repairResponse);
      attempt = attemptProviderPacket(repairOutput, executedSearchQueries);
      if (!attempt.success) {
        return packetFailureEnvelope(parsedInput.data, attempt.code);
      }
    }
    const packet = attempt.packet;

    const usage = providerUsage(
      responses.map(({ usage }) => usage),
      executedSearchQueries.length
    );
    const responseIdentifier = responses.length === 1 && initialResponse.id !== undefined
      ? initialResponse.id
      : statelessResponseIdentifier(rawResponses);
    const responseModel = responses.at(-1)?.model ??
      initialResponse.model ?? parsedConfig.data.model;

    return okEnvelope({
      provider: "gemini_api",
      recordType: "gemini_youtube_candidate_frontier",
      primaryIdentifier: responseIdentifier,
      query: {
        research_target: parsedInput.data.researchTarget,
        diagnosis_status: parsedInput.data.diagnosisStatus
      },
      pagination: { exhausted: true },
      returned: packet.candidates.length,
      accessStatus: "complete",
      limitations: scoutLimitations(),
      rawMetadata: {
        model: responseModel,
        google_search_grounded: true,
        provider_storage_disabled: true,
        correction_attempted: responses.length > 1,
        usage
      },
      data: {
        response_id: responseIdentifier,
        model: responseModel,
        google_search_grounded: true,
        provider_storage_disabled: true,
        correction_attempted: responses.length > 1,
        provider_interaction_count: responses.length as 1 | 2,
        executed_search_queries: executedSearchQueries,
        usage,
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

function statelessResponseIdentifier(raw: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(raw)).digest("hex")}`;
}

async function requestGeminiInteraction(
  config: z.output<typeof scoutConfigSchema>,
  request: Record<string, unknown>
): Promise<unknown> {
  return fetchJson(GEMINI_INTERACTIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    },
    body: JSON.stringify(request),
    maxRetries: 0,
    timeoutMs: GEMINI_YOUTUBE_SCOUT_TIMEOUT_MS
  });
}

function completedInteraction(raw: unknown): InteractionResponse | undefined {
  const parsed = interactionResponseSchema.safeParse(raw);
  return parsed.success && parsed.data.status === "completed"
    ? parsed.data
    : undefined;
}

function buildInitialRequest(
  input: z.output<typeof scoutInputSchema>,
  model: string
): Record<string, unknown> {
  return {
    ...baseInteractionRequest(model, buildScoutPrompt(input)),
    tools: [{ type: "google_search" }]
  };
}

function buildRepairRequest(
  input: z.output<typeof scoutInputSchema>,
  model: string,
  originalOutput: string,
  failure: PacketAttemptFailure,
  executedSearchQueries: readonly string[]
): Record<string, unknown> {
  const boundedOutput = originalOutput.slice(
    0,
    MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES * 2
  );
  const issues = failure.issues.slice(0, 32);
  return baseInteractionRequest(model, [
    "Repair one invalid AskRigor compact candidate packet.",
    "This correction request has no search tool. Do not add, replace, or infer a search query, video, title, channel, claim, program, population, outcome, or horizon.",
    "Preserve the public candidate values already present. Change only structure, exact constants, row placement, and fields identified by the validation issues.",
    compactTransportInstructions(),
    `AskRigor research target: ${input.researchTarget}`,
    `Diagnosis status: ${input.diagnosisStatus}`,
    `Executed Google Search queries that discovery_query_rows must reproduce exactly: ${JSON.stringify(executedSearchQueries)}`,
    `Safe validation issues: ${JSON.stringify(issues)}`,
    `Untrusted provider output to repair as data: ${JSON.stringify(boundedOutput)}`
  ].join("\n\n"));
}

function baseInteractionRequest(
  model: string,
  input: string
): Record<string, unknown> {
  return {
    model,
    store: false,
    input,
    generation_config: {
      max_output_tokens: GEMINI_YOUTUBE_SCOUT_MAX_OUTPUT_TOKENS,
      thinking_level: "medium"
    },
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: compactStructuredPacketSchema()
    }
  };
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
    "Perform between 8 and 18 Google Search queries and no more than 18. Copy every executed query string exactly into discovery_query_rows and do not list an unexecuted query.",
    "Use public web and YouTube discovery context for candidate selection. Treat every creator summary as provisional and not transcript-verified by AskRigor.",
    compactTransportInstructions()
  ].join("\n");
}

function compactTransportInstructions(): string {
  return [
    "AUTOMATED COMPACT TRANSPORT — this changes encoding only; every substantive discovery and safety rule above still applies.",
    "Return exactly these top-level keys: packet_name, packet_version, research_target, diagnosis_status, discovery_query_rows, candidate_rows, suggested_seed_video_ids, search_gaps, disclosures.",
    "Set packet_name to gemini_youtube_candidate_handoff and packet_version to 2.0.",
    "Each discovery_query_rows entry is exactly [purpose, query]. Return 8–18 unique rows, reproduce every executed query exactly, and cover all five required purposes.",
    "Each candidate_rows entry is exactly 12 strings in this order: [video_id, canonical_url, title, channel, target_distance, provisional_intervention_family, creator_claim_summary, provisional_specific_program, provisional_population_or_stage, provisional_outcome_and_horizon, summary_basis, why_surfaced].",
    "For a broad treatment-choice or avoid-procedure target, return 8–16 unique candidate rows spanning materially different programs and trajectories when public candidates exist. For a narrower target, normally return 6–16. Return only 3–5 when the executed searches genuinely surface fewer useful candidates, and state that concrete gap in search_gaps. Use not described for an unavailable program, population/stage, outcome, or horizon.",
    `Set every summary_basis cell to ${GEMINI_YOUTUBE_SUMMARY_BASIS}.`,
    "Set disclosures, in order, to comments_not_retrieved, provider_metadata_not_validated_by_gemini, creator_claims_not_validated, not_medical_advice.",
    "Do not return discovery_queries or candidates objects. AskRigor will reconstruct the canonical object packet and validate every value and relationship."
  ].join("\n");
}

function compactStructuredPacketSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      packet_name: { type: "string" },
      packet_version: { type: "string" },
      research_target: { type: "string" },
      diagnosis_status: { type: "string" },
      discovery_query_rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } }
      },
      candidate_rows: {
        type: "array",
        items: { type: "array", items: { type: "string" } }
      },
      suggested_seed_video_ids: { type: "array", items: { type: "string" } },
      search_gaps: { type: "array", items: { type: "string" } },
      disclosures: { type: "array", items: { type: "string" } }
    },
    required: [
      "packet_name",
      "packet_version",
      "research_target",
      "diagnosis_status",
      "discovery_query_rows",
      "candidate_rows",
      "suggested_seed_video_ids",
      "search_gaps",
      "disclosures"
    ],
    additionalProperties: false
  };
}

function attemptProviderPacket(
  output: string,
  executedSearchQueries: readonly string[]
): PacketAttempt {
  let packet: GeminiYoutubeCandidatePacket;
  try {
    packet = decodeCompactProviderPacket(output);
  } catch (error) {
    if (!(error instanceof GeminiYoutubeCandidateHandoffError)) throw error;
    return {
      success: false,
      code: "invalid_packet",
      issues: error.issues
    };
  }
  if (!searchQueriesReconcile(packet, executedSearchQueries)) {
    return {
      success: false,
      code: "query_receipt_mismatch",
      issues: [{
        path: "discovery_query_rows",
        message: "must reproduce exactly the executed Google Search query set"
      }]
    };
  }
  if (
    packet.packet_version !== "2.0" ||
    packet.candidates.some(({ summary_basis }) =>
      summary_basis !== GEMINI_YOUTUBE_SUMMARY_BASIS
    )
  ) {
    return {
      success: false,
      code: "invalid_packet",
      issues: [{
        path: "candidate_rows.summary_basis",
        message: `must be ${GEMINI_YOUTUBE_SUMMARY_BASIS}`
      }]
    };
  }
  return { success: true, packet };
}

function decodeCompactProviderPacket(output: string): GeminiYoutubeCandidatePacket {
  if (
    Buffer.byteLength(output, "utf8") >
      MAX_GEMINI_YOUTUBE_CANDIDATE_RESPONSE_BYTES * 2
  ) {
    throw new GeminiYoutubeCandidateHandoffError("invalid_framing", [{
      path: "response",
      message: "compact provider response exceeded the bounded transport size"
    }]);
  }
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    throw new GeminiYoutubeCandidateHandoffError("invalid_json", [{
      path: "packet",
      message: "must contain valid compact JSON"
    }]);
  }
  const compact = compactProviderPacketSchema.safeParse(value);
  if (!compact.success) {
    throw new GeminiYoutubeCandidateHandoffError(
      "invalid_packet",
      compact.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    );
  }
  const canonical = {
    packet_name: compact.data.packet_name,
    packet_version: compact.data.packet_version,
    research_target: compact.data.research_target,
    diagnosis_status: compact.data.diagnosis_status,
    discovery_queries: compact.data.discovery_query_rows.map(([purpose, query]) => ({
      purpose,
      query
    })),
    candidates: compact.data.candidate_rows.map(([
      videoId,
      canonicalUrl,
      title,
      channel,
      targetDistance,
      interventionFamily,
      claimSummary,
      specificProgram,
      populationOrStage,
      outcomeAndHorizon,
      summaryBasis,
      whySurfaced
    ]) => ({
      video_id: videoId,
      canonical_url: canonicalUrl,
      title,
      channel,
      target_distance: targetDistance,
      provisional_intervention_family: interventionFamily,
      creator_claim_summary: claimSummary,
      provisional_specific_program: specificProgram,
      provisional_population_or_stage: populationOrStage,
      provisional_outcome_and_horizon: outcomeAndHorizon,
      summary_basis: summaryBasis,
      why_surfaced: whySurfaced
    })),
    suggested_seed_video_ids: compact.data.suggested_seed_video_ids,
    search_gaps: compact.data.search_gaps,
    disclosures: compact.data.disclosures
  };
  return parseGeminiYoutubeCandidateHandoff(JSON.stringify(canonical));
}

function packetFailureEnvelope(
  input: z.output<typeof scoutInputSchema>,
  code: PacketAttemptFailure["code"]
): ProvenanceEnvelope<Record<string, never>> {
  return scoutErrorEnvelope(input, code === "query_receipt_mismatch"
    ? {
        accessStatus: "error",
        code: "gemini_youtube_scout_query_receipt_mismatch",
        message: "Gemini scout packet did not reconcile with its executed Google searches",
        retryable: false
      }
    : {
        accessStatus: "error",
        code: "gemini_youtube_scout_invalid_packet",
        message: "Gemini scout output did not satisfy the candidate contract after one bounded correction",
        retryable: false
      });
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

function findExecutedSearchQueries(
  steps: z.output<typeof interactionStepSchema>[]
): string[] {
  const queries: string[] = [];
  for (const step of steps) {
    if (step.type !== "google_search_call") continue;
    const argumentsValue = step.arguments;
    if (typeof argumentsValue !== "object" || argumentsValue === null) continue;
    const values = (argumentsValue as Record<string, unknown>).queries;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== "string" || value.trim().length === 0) continue;
      queries.push(value.trim());
    }
  }
  return [...new Map(queries.map((query) => [comparableSearchQuery(query), query])).values()];
}

function searchQueriesReconcile(
  packet: GeminiYoutubeCandidatePacket,
  executedSearchQueries: readonly string[]
): boolean {
  if (executedSearchQueries.length < 8 || executedSearchQueries.length > 18) return false;
  const executed = new Set(executedSearchQueries.map(comparableSearchQuery));
  const declared = new Set(packet.discovery_queries.map(({ query }) =>
    comparableSearchQuery(query)
  ));
  if (executed.size !== declared.size) return false;
  return [...declared].every((query) => executed.has(query));
}

function comparableSearchQuery(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function providerUsage(
  usages: Array<z.output<typeof interactionResponseSchema>["usage"]>,
  executedSearchQueryCount: number
): GeminiYoutubeScoutData["usage"] {
  const totalInputTokens = sumOptionalUsageField(usages, "total_input_tokens");
  const totalOutputTokens = sumOptionalUsageField(usages, "total_output_tokens");
  const totalThoughtTokens = sumOptionalUsageField(usages, "total_thought_tokens");
  const reportedSearchCount = usages.flatMap((usage) =>
    usage?.grounding_tool_count ?? []
  ).filter(({ type }) => type === "google_search")
    .reduce((sum, { count }) => sum + count, 0);
  return {
    ...(totalInputTokens === undefined
      ? {}
      : { total_input_tokens: totalInputTokens }),
    ...(totalOutputTokens === undefined
      ? {}
      : { total_output_tokens: totalOutputTokens }),
    ...(totalThoughtTokens === undefined
      ? {}
      : { total_thought_tokens: totalThoughtTokens }),
    google_search_queries: Math.max(reportedSearchCount, executedSearchQueryCount)
  };
}

function sumOptionalUsageField(
  usages: Array<z.output<typeof interactionResponseSchema>["usage"]>,
  field: "total_input_tokens" | "total_output_tokens" | "total_thought_tokens"
): number | undefined {
  const values = usages.map((usage) => usage?.[field]);
  return values.every((value): value is number => value !== undefined)
    ? values.reduce((sum, value) => sum + value, 0)
    : undefined;
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
