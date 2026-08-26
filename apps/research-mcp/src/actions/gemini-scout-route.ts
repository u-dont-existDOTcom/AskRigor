import { readFile } from "node:fs/promises";
import { isAbsolute, normalize } from "node:path";

import { ACCESS_STATUSES } from "@askrigor/contracts";
import {
  GEMINI_YOUTUBE_SCOUT_MODEL,
  advanceGeminiYoutubeScoutBackground,
  geminiYoutubeCandidateValidationReceiptSchema,
  geminiYoutubeDiscoveryPurposeSchema,
  scoutGeminiYoutubeCandidates,
  validateGeminiYoutubeCandidateHandoff,
  type GeminiYoutubeCandidatePacket,
  type GeminiYoutubeCandidateValidationReceipt,
  type GeminiYoutubeScoutBackgroundAdvance,
  type GeminiYoutubeScoutBackgroundCheckpoint,
  type GeminiYoutubeScoutData
} from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import {
  createSharedFileAiBudget,
  MONTHLY_AI_BUDGET_NANO_USD,
  type AiBudget
} from "../lessons/ai-budget.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

export const GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD = 1_000_000_000 as const;
const GEMINI_INPUT_TOKEN_NANO_USD = 750;
const GEMINI_OUTPUT_OR_THOUGHT_TOKEN_NANO_USD = 3_750;
const GEMINI_SEARCH_QUERY_NANO_USD = 14_000_000;

const automatedScoutInputSchema = z.object({
  research_target: z.string().trim().min(1).max(1_000),
  diagnosis_status: z.enum([
    "diagnosis_not_specified",
    "user_supplied_diagnosis"
  ])
}).strict();

const providerUsageSchema = z.object({
  total_input_tokens: z.number().int().nonnegative().optional(),
  total_output_tokens: z.number().int().nonnegative().optional(),
  total_thought_tokens: z.number().int().nonnegative().optional(),
  google_search_queries: z.number().int().min(8).max(18)
}).strict();

const scoutProviderReceiptSchema = z.object({
  provider: z.literal("gemini_api"),
  model: z.literal(GEMINI_YOUTUBE_SCOUT_MODEL),
  access_status: z.enum(ACCESS_STATUSES),
  google_search_grounded: z.boolean(),
  provider_storage_disabled: z.literal(true),
  correction_attempted: z.boolean().nullable(),
  provider_interaction_count: z.number().int().min(1).max(2).nullable(),
  executed_search_queries: z.array(z.string().min(1).max(500)).max(18),
  usage: providerUsageSchema.nullable(),
  accounted_nano_usd: z.number().int().nonnegative()
    .max(GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD)
}).strict();

const automatedScoutBoundarySchema = z.object({
  code: z.enum([
    "gemini_provider_not_configured",
    "youtube_provider_not_configured",
    "gemini_scout_budget_unavailable",
    "gemini_scout_budget_exhausted",
    "gemini_youtube_scout_rate_limited",
    "gemini_youtube_scout_inaccessible",
    "gemini_youtube_scout_invalid_response",
    "gemini_youtube_scout_ungrounded",
    "gemini_youtube_scout_missing_output",
    "gemini_youtube_scout_invalid_packet",
    "gemini_youtube_scout_query_receipt_mismatch",
    "gemini_youtube_scout_upstream_unavailable",
    "gemini_youtube_scout_request_failed",
    "gemini_youtube_candidate_validation_failed",
    "gemini_youtube_candidate_validation_response_too_large",
    "gemini_youtube_scout_unclassified_failure"
  ]),
  retryable: z.boolean()
}).strict();

export const automatedGeminiScoutReceiptSchema = z.object({
  packet_name: z.literal("askrigor_automated_gemini_youtube_scout"),
  packet_version: z.literal("1.0"),
  status: z.enum(["accepted", "partial", "rejected", "blocked"]),
  research_target: z.string().min(1).max(1_000),
  diagnosis_status: automatedScoutInputSchema.shape.diagnosis_status,
  discovery_queries: z.array(z.object({
    purpose: geminiYoutubeDiscoveryPurposeSchema,
    query: z.string().min(1).max(500)
  }).strict()).max(18),
  search_gaps: z.array(z.string().min(1).max(500)).max(8),
  scout_receipt: scoutProviderReceiptSchema,
  validation: geminiYoutubeCandidateValidationReceiptSchema.nullable(),
  boundary: automatedScoutBoundarySchema.nullable(),
  access_boundaries: z.tuple([
    z.literal("Gemini candidate summaries are provisional discovery annotations and were not transcript-verified by AskRigor."),
    z.literal("Gemini interaction storage was disabled; the grounded request received only the screened population-level target and public scout instructions, and one no-search correction, when needed, received only the public candidate output, exact executed searches, and safe validation issues."),
    z.literal("Independent YouTube identity validation does not establish creator content, efficacy, safety, causality, scientific validity, or treatment suitability."),
    z.literal("No YouTube transcript or discussion was retrieved by this operation; required downstream research remains required.")
  ])
}).strict();

const automatedScoutInputErrorSchema = z.object({
  error: z.object({
    code: z.enum(["action_input_invalid", "research_target_not_deidentified"]),
    retryable: z.boolean()
  }).strict()
}).strict();

export type AutomatedGeminiScoutReceipt = z.output<
  typeof automatedGeminiScoutReceiptSchema
>;

export interface CreateAutomatedGeminiScoutActionRouteOptions {
  geminiApiKey?: string;
  youtubeApiKey?: string;
  budget?: AiBudget;
  scout?: typeof scoutGeminiYoutubeCandidates;
  backgroundScout?: typeof advanceGeminiYoutubeScoutBackground;
  backgroundPollDelayMs?: number;
  validate?: typeof validateGeminiYoutubeCandidateHandoff;
  loadScoutInstructions?: () => Promise<string>;
}

export interface AutomatedGeminiScoutExecution {
  receipt: AutomatedGeminiScoutReceipt;
  controller_completion?: {
    provider_response_id: string;
    packet: GeminiYoutubeCandidatePacket;
    validation: GeminiYoutubeCandidateValidationReceipt;
    provider_storage_mode?: "DISABLED" | "TEMPORARY_BACKGROUND_DELETE_REQUESTED";
    accounted_nano_usd?: number;
  };
}

export type ResumableAutomatedGeminiScoutExecution =
  | {
      controller_progress: {
        checkpoint: GeminiYoutubeScoutBackgroundCheckpoint;
        accounted_nano_usd: number;
      };
    }
  | {
      controller_completion: NonNullable<
        AutomatedGeminiScoutExecution["controller_completion"]
      >;
    }
  | {
      controller_boundary: {
        code: z.output<typeof automatedScoutBoundarySchema>["code"];
        retryable: boolean;
      };
    };

let cachedScoutInstructions: Promise<string> | undefined;

export function createAutomatedGeminiScoutActionRoute(
  options: CreateAutomatedGeminiScoutActionRouteOptions = {}
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: "/actions/research/scout_gemini_youtube_candidates",
    operationId: "scout_gemini_youtube_candidates",
    summary: "AskRigor scout and validate Gemini YouTube candidates",
    description: "Run a stateless server-side Gemini Google-Search scout for a de-identified population-level research target, then independently validate every public YouTube identity. Candidate summaries remain provisional discovery leads, not treatment evidence.",
    consequential: false,
    public: true,
    publicResearch: true,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(automatedScoutInputSchema),
    responseSchemas: {
      200: actionJsonSchema(automatedGeminiScoutReceiptSchema),
      422: actionJsonSchema(automatedScoutInputErrorSchema)
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const parsed = automatedScoutInputSchema.safeParse(body);
      if (!parsed.success) return invalidInput("action_input_invalid", false);
      if (!isDeidentifiedResearchTarget(parsed.data.research_target)) {
        return invalidInput("research_target_not_deidentified", true);
      }
      return {
        status: 200,
        body: (await executeAutomatedGeminiScout(parsed.data, options)).receipt
      };
    }
  });
}

/**
 * One budgeted provider implementation shared by the public scout Action and
 * the server-owned controller. The private completion material never enters
 * the public Action response.
 */
export async function executeAutomatedGeminiScout(
  input: z.output<typeof automatedScoutInputSchema>,
  options: CreateAutomatedGeminiScoutActionRouteOptions = {}
): Promise<AutomatedGeminiScoutExecution> {
  const parsed = automatedScoutInputSchema.parse(input);
  const scout = options.scout ?? scoutGeminiYoutubeCandidates;
  const validate = options.validate ?? validateGeminiYoutubeCandidateHandoff;
  const loadScoutInstructions = options.loadScoutInstructions ??
    defaultScoutInstructions;
  const geminiApiKey = options.geminiApiKey ??
    process.env.ASKRIGOR_GEMINI_API_KEY ?? "";
  if (geminiApiKey.trim().length === 0) {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_provider_not_configured",
      false
    ) };
  }
  const youtubeApiKey = options.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? "";
  if (youtubeApiKey.trim().length === 0) {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "youtube_provider_not_configured",
      false
    ) };
  }

  let budget: AiBudget;
  try {
    budget = options.budget ?? productionAiBudget();
  } catch {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_scout_budget_unavailable",
      false
    ) };
  }

  let reservation;
  try {
    reservation = await budget.reserve(
      "gemini_youtube_candidate_scout",
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    );
  } catch {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_scout_budget_unavailable",
      false
    ) };
  }
  if (!reservation) {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_scout_budget_exhausted",
      false
    ) };
  }

  let frontier;
  try {
    frontier = await scout({
      researchTarget: parsed.research_target,
      diagnosisStatus: parsed.diagnosis_status,
      scoutInstructions: await loadScoutInstructions()
    }, {
      apiKey: geminiApiKey,
      model: GEMINI_YOUTUBE_SCOUT_MODEL
    });
  } catch {
    await reservation.forfeit();
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_youtube_scout_unclassified_failure",
      false,
      "error",
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    ) };
  }

  if (frontier.access_status !== "complete" || !("packet" in frontier.data)) {
    await reservation.forfeit();
    return { receipt: successfulBoundaryReceipt(
      parsed,
      knownBoundaryCode(frontier.error?.code),
      frontier.error?.retryable === true,
      frontier.access_status,
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    ) };
  }

  const scoutData = frontier.data as GeminiYoutubeScoutData;
  const accountedNanoUsd = calculateGeminiScoutNanoUsd(scoutData.usage);
  try {
    await reservation.commit(accountedNanoUsd);
  } catch {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_scout_budget_unavailable",
      false,
      "error",
      GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    ) };
  }

  let validation: GeminiYoutubeCandidateValidationReceipt;
  try {
    validation = await validate(JSON.stringify(scoutData.packet), {
      apiKey: youtubeApiKey
    });
  } catch {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_youtube_candidate_validation_failed",
      true,
      "error",
      accountedNanoUsd
    ) };
  }

  const receipt = automatedGeminiScoutReceiptSchema.parse({
    packet_name: "askrigor_automated_gemini_youtube_scout",
    packet_version: "1.0",
    status: validation.status,
    research_target: parsed.research_target,
    diagnosis_status: parsed.diagnosis_status,
    discovery_queries: scoutData.packet.discovery_queries,
    search_gaps: scoutData.packet.search_gaps,
    scout_receipt: {
      provider: "gemini_api",
      model: GEMINI_YOUTUBE_SCOUT_MODEL,
      access_status: "complete",
      google_search_grounded: true,
      provider_storage_disabled: true,
      correction_attempted: scoutData.correction_attempted,
      provider_interaction_count: scoutData.provider_interaction_count,
      executed_search_queries: scoutData.executed_search_queries,
      usage: scoutData.usage,
      accounted_nano_usd: accountedNanoUsd
    },
    validation,
    boundary: null,
    access_boundaries: accessBoundaries()
  });
  if (
    Buffer.byteLength(JSON.stringify(receipt), "utf8") >
      RESEARCH_ACTION_RESPONSE_MAX_BYTES
  ) {
    return { receipt: successfulBoundaryReceipt(
      parsed,
      "gemini_youtube_candidate_validation_response_too_large",
      false,
      "complete",
      accountedNanoUsd
    ) };
  }
  return {
    receipt,
    controller_completion: {
      provider_response_id: scoutData.response_id,
      packet: scoutData.packet,
      validation
    }
  };
}

/**
 * Controller-only Gemini executor. The first transition starts one budgeted
 * background Interaction; later transitions poll the exact server-owned
 * checkpoint without reserving or charging the budget again.
 */
export async function executeResumableAutomatedGeminiScout(
  input: z.output<typeof automatedScoutInputSchema>,
  resume: {
    checkpoint: GeminiYoutubeScoutBackgroundCheckpoint;
    accountedNanoUsd: number;
  } | undefined,
  options: CreateAutomatedGeminiScoutActionRouteOptions = {}
): Promise<ResumableAutomatedGeminiScoutExecution> {
  const parsed = automatedScoutInputSchema.parse(input);
  const backgroundScout = options.backgroundScout ??
    advanceGeminiYoutubeScoutBackground;
  const validate = options.validate ?? validateGeminiYoutubeCandidateHandoff;
  const loadScoutInstructions = options.loadScoutInstructions ??
    defaultScoutInstructions;
  const geminiApiKey = options.geminiApiKey ??
    process.env.ASKRIGOR_GEMINI_API_KEY ?? "";
  if (geminiApiKey.trim().length === 0) {
    return controllerBoundary("gemini_provider_not_configured", false);
  }
  const youtubeApiKey = options.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? "";
  if (youtubeApiKey.trim().length === 0) {
    return controllerBoundary("youtube_provider_not_configured", false);
  }
  if (
    resume !== undefined &&
    (
      !Number.isSafeInteger(resume.accountedNanoUsd) ||
      resume.accountedNanoUsd < 0 ||
      resume.accountedNanoUsd > GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
    )
  ) {
    return controllerBoundary("gemini_scout_budget_unavailable", false);
  }

  let reservation: Awaited<ReturnType<AiBudget["reserve"]>> | undefined;
  if (resume === undefined) {
    let budget: AiBudget;
    try {
      budget = options.budget ?? productionAiBudget();
      reservation = await budget.reserve(
        "gemini_youtube_candidate_scout",
        GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
      );
    } catch {
      return controllerBoundary("gemini_scout_budget_unavailable", false);
    }
    if (!reservation) {
      return controllerBoundary("gemini_scout_budget_exhausted", false);
    }
  }

  let advance: GeminiYoutubeScoutBackgroundAdvance;
  try {
    const scoutInput = {
      researchTarget: parsed.research_target,
      diagnosisStatus: parsed.diagnosis_status,
      scoutInstructions: await loadScoutInstructions()
    };
    const scoutConfig = {
      apiKey: geminiApiKey,
      model: GEMINI_YOUTUBE_SCOUT_MODEL
    };
    let activeCheckpoint = resume?.checkpoint;
    const maximumAdvances = activeCheckpoint === undefined ? 1 : 3;
    const pollDelayMs = boundedBackgroundPollDelay(
      options.backgroundPollDelayMs ?? 5_000
    );
    advance = await backgroundScout(scoutInput, scoutConfig, activeCheckpoint);
    for (
      let attempt = 1;
      advance.kind === "progress" && attempt < maximumAdvances;
      attempt += 1
    ) {
      activeCheckpoint = advance.checkpoint;
      await waitForBackgroundPoll(pollDelayMs);
      advance = await backgroundScout(
        scoutInput,
        scoutConfig,
        activeCheckpoint
      );
    }
  } catch {
    if (reservation !== undefined) await reservation.forfeit();
    return controllerBoundary("gemini_youtube_scout_unclassified_failure", true);
  }

  if (advance.kind === "progress") {
    if (reservation !== undefined) {
      try {
        await reservation.forfeit();
      } catch {
        return controllerBoundary("gemini_scout_budget_unavailable", false);
      }
    }
    return {
      controller_progress: {
        checkpoint: advance.checkpoint,
        accounted_nano_usd: resume?.accountedNanoUsd ??
          GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
      }
    };
  }
  if (advance.kind === "boundary") {
    if (reservation !== undefined) await reservation.forfeit();
    return controllerBoundary(
      knownBoundaryCode(advance.frontier.error?.code),
      advance.frontier.error?.retryable === true
    );
  }

  const scoutData = advance.frontier.data;
  let accountedNanoUsd = resume?.accountedNanoUsd;
  if (reservation !== undefined) {
    accountedNanoUsd = calculateGeminiScoutNanoUsd(scoutData.usage);
    try {
      await reservation.commit(accountedNanoUsd);
    } catch {
      return controllerBoundary("gemini_scout_budget_unavailable", false);
    }
  }
  if (accountedNanoUsd === undefined) {
    return controllerBoundary("gemini_scout_budget_unavailable", false);
  }

  let validation: GeminiYoutubeCandidateValidationReceipt;
  try {
    validation = await validate(JSON.stringify(scoutData.packet), {
      apiKey: youtubeApiKey
    });
  } catch {
    return controllerBoundary(
      "gemini_youtube_candidate_validation_failed",
      true
    );
  }
  return {
    controller_completion: {
      provider_response_id: scoutData.response_id,
      packet: scoutData.packet,
      validation,
      provider_storage_mode: scoutData.provider_storage_disabled
        ? "DISABLED"
        : "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
      accounted_nano_usd: accountedNanoUsd
    }
  };
}

function controllerBoundary(
  code: z.output<typeof automatedScoutBoundarySchema>["code"],
  retryable: boolean
): ResumableAutomatedGeminiScoutExecution {
  return { controller_boundary: { code, retryable } };
}

function boundedBackgroundPollDelay(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Gemini background poll delay is outside its fixed bound");
  }
  return value;
}

async function waitForBackgroundPoll(milliseconds: number): Promise<void> {
  if (milliseconds === 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function isDeidentifiedResearchTarget(value: string): boolean {
  if (/[\u0000-\u001F\u007F]/u.test(value)) return false;
  if (/[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u.test(value)) {
    return false;
  }
  if (/\b(?:i|i'm|i've|my|me|mine|we|we're|our|ours)\b/iu.test(value)) return false;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(value)) return false;
  if (/(?:\+?\d[\d .()-]{6,}\d)/u.test(value)) return false;
  if (/\bAIza[A-Za-z0-9_-]{16,}\b|\bsk-[A-Za-z0-9_-]{16,}\b|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u.test(value)) {
    return false;
  }
  if (/https?:\/\//iu.test(value)) return false;
  const lowerValue = value.toLocaleLowerCase("en-US");
  const compactValue = lowerValue.replace(/\s/gu, "");
  const hasChatTag = ["<|user|>", "<|assistant|>", "<|system|>", "<|tool|>"]
    .some((tag) => compactValue.includes(tag));
  const hasChatRoleLine = lowerValue.split("\n").some((line) => {
    const trimmed = line.trimStart();
    return ["user:", "assistant:", "system:", "tool:"]
      .some((prefix) => trimmed.startsWith(prefix));
  });
  if (hasChatTag || hasChatRoleLine) {
    return false;
  }
  if (/\b(?:name|medical record|patient id|date of birth|address|postal code|zip code)\s*[:#]/iu.test(value)) {
    return false;
  }
  if (/\b(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|prior|system)\s+instructions?\b/iu.test(value)) {
    return false;
  }
  return true;
}

export function calculateGeminiScoutNanoUsd(
  usage: GeminiYoutubeScoutData["usage"]
): number {
  if (
    usage.total_input_tokens === undefined ||
    usage.total_output_tokens === undefined ||
    usage.total_thought_tokens === undefined
  ) {
    return GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD;
  }
  const actual = usage.total_input_tokens * GEMINI_INPUT_TOKEN_NANO_USD +
    (usage.total_output_tokens + usage.total_thought_tokens) *
      GEMINI_OUTPUT_OR_THOUGHT_TOKEN_NANO_USD +
    usage.google_search_queries * GEMINI_SEARCH_QUERY_NANO_USD;
  if (!Number.isSafeInteger(actual) || actual < 0 || actual > GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD) {
    return GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD;
  }
  return actual;
}

function productionAiBudget(): AiBudget {
  const ledgerPath = process.env.ASKRIGOR_AI_BUDGET_LEDGER ?? "";
  if (!isAbsolute(ledgerPath) || normalize(ledgerPath) !== ledgerPath) {
    throw new Error("Gemini scout budget unavailable");
  }
  const budgetUsd = process.env.ASKRIGOR_AI_MONTHLY_BUDGET_USD;
  if (budgetUsd !== "50" && budgetUsd !== "50.00") {
    throw new Error("Gemini scout budget unavailable");
  }
  return createSharedFileAiBudget({
    ledgerPath,
    monthlyLimitNanoUsd: MONTHLY_AI_BUDGET_NANO_USD,
    expectedUid: process.getuid?.(),
    now: () => new Date()
  });
}

function successfulBoundaryReceipt(
  input: z.output<typeof automatedScoutInputSchema>,
  code: z.output<typeof automatedScoutBoundarySchema>["code"],
  retryable: boolean,
  accessStatus: z.output<typeof scoutProviderReceiptSchema>["access_status"] = "inaccessible",
  accountedNanoUsd = 0
): AutomatedGeminiScoutReceipt {
  return automatedGeminiScoutReceiptSchema.parse({
    packet_name: "askrigor_automated_gemini_youtube_scout",
    packet_version: "1.0",
    status: "blocked",
    research_target: input.research_target,
    diagnosis_status: input.diagnosis_status,
    discovery_queries: [],
    search_gaps: [],
    scout_receipt: {
      provider: "gemini_api",
      model: GEMINI_YOUTUBE_SCOUT_MODEL,
      access_status: accessStatus,
      google_search_grounded: false,
      provider_storage_disabled: true,
      correction_attempted: null,
      provider_interaction_count: null,
      executed_search_queries: [],
      usage: null,
      accounted_nano_usd: accountedNanoUsd
    },
    validation: null,
    boundary: { code, retryable },
    access_boundaries: accessBoundaries()
  });
}

function invalidInput(
  code: z.output<typeof automatedScoutInputErrorSchema>["error"]["code"],
  retryable: boolean
): ActionResult {
  return {
    status: 422,
    body: automatedScoutInputErrorSchema.parse({ error: { code, retryable } })
  };
}

function knownBoundaryCode(
  value: string | undefined
): z.output<typeof automatedScoutBoundarySchema>["code"] {
  const parsed = automatedScoutBoundarySchema.shape.code.safeParse(value);
  return parsed.success ? parsed.data : "gemini_youtube_scout_unclassified_failure";
}

function accessBoundaries(): z.output<
  typeof automatedGeminiScoutReceiptSchema
>["access_boundaries"] {
  return [
    "Gemini candidate summaries are provisional discovery annotations and were not transcript-verified by AskRigor.",
    "Gemini interaction storage was disabled; the grounded request received only the screened population-level target and public scout instructions, and one no-search correction, when needed, received only the public candidate output, exact executed searches, and safe validation issues.",
    "Independent YouTube identity validation does not establish creator content, efficacy, safety, causality, scientific validity, or treatment suitability.",
    "No YouTube transcript or discussion was retrieved by this operation; required downstream research remains required."
  ];
}

async function defaultScoutInstructions(): Promise<string> {
  cachedScoutInstructions ??= readFile(new URL(
    "../../../../integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md",
    import.meta.url
  ), "utf8");
  return cachedScoutInstructions;
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
