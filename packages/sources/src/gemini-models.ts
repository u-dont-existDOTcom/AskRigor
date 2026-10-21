import { z } from "zod";

/**
 * The Gemini models AskRigor may run, their thinking levels and their prices (owner answer 146b, 2026-10-21: a test of
 * Gemini 4 for the YouTube scout and the video reader). Prices are nano-USD per token, input and output (thinking
 * tokens are billed as output), from Google's Gemini API price page as read on 2026-10-21:
 * - gemini-3.6-flash: $0.75 and $3.75 per million tokens, listed through 2026-12-31 (read the page again before then);
 * - gemini-4-argon: $2 and $10 through 2026-11-30, then $4 and $20.
 * Google Search grounding is free for 5,000 queries a month, then $14 per 1,000; every query is counted as paid here.
 */
export const GEMINI_MODEL_IDS = ["gemini-3.6-flash", "gemini-4-argon"] as const;
export type GeminiModelId = typeof GEMINI_MODEL_IDS[number];
export const GEMINI_THINKING_LEVELS = ["low", "medium", "high"] as const;
export type GeminiThinkingLevel = typeof GEMINI_THINKING_LEVELS[number];

export const geminiModelIdSchema = z.enum(GEMINI_MODEL_IDS);
export const geminiThinkingLevelSchema = z.enum(GEMINI_THINKING_LEVELS);

export interface GeminiModelSetting {
  model: GeminiModelId;
  thinking: GeminiThinkingLevel;
}

/** What the scout and the video reader run unless a dev account's trial names another arm. */
export const DEFAULT_GEMINI_MODEL_SETTING: Readonly<GeminiModelSetting> = Object.freeze({
  model: "gemini-3.6-flash",
  thinking: "medium"
});

/** The arms of the owner's Gemini 4 trial (owner answer 146b), which only dev accounts may name. */
export const GEMINI_MODEL_TRIAL_ARMS = ["current", "gemini-4-low", "gemini-4-high"] as const;
export type GeminiModelTrialArm = typeof GEMINI_MODEL_TRIAL_ARMS[number];

export function geminiModelTrialSetting(arm: GeminiModelTrialArm): GeminiModelSetting {
  return arm === "current"
    ? { ...DEFAULT_GEMINI_MODEL_SETTING }
    : { model: "gemini-4-argon", thinking: arm === "gemini-4-low" ? "low" : "high" };
}

interface GeminiTokenPrice {
  /** The first UTC day the price applies, inclusive. */
  from: string;
  inputNanoUsd: number;
  outputNanoUsd: number;
}

const GEMINI_TOKEN_PRICES: Readonly<Record<GeminiModelId, readonly GeminiTokenPrice[]>> = {
  "gemini-3.6-flash": [{ from: "2026-01-01", inputNanoUsd: 750, outputNanoUsd: 3_750 }],
  "gemini-4-argon": [
    { from: "2026-01-01", inputNanoUsd: 2_000, outputNanoUsd: 10_000 },
    { from: "2026-12-01", inputNanoUsd: 4_000, outputNanoUsd: 20_000 }
  ]
};

export const GEMINI_SEARCH_QUERY_NANO_USD = 14_000_000 as const;

/** A model's token prices on the given UTC day. */
export function geminiTokenPrices(model: GeminiModelId, at: Date): { inputNanoUsd: number; outputNanoUsd: number } {
  const day = at.toISOString().slice(0, 10);
  const prices = GEMINI_TOKEN_PRICES[model];
  let current = prices[0]!;
  for (const price of prices) if (price.from <= day) current = price;
  return { inputNanoUsd: current.inputNanoUsd, outputNanoUsd: current.outputNanoUsd };
}

/** A usage's cost at a model's prices on the given day; undefined when a token count is missing or it overflows. */
export function geminiUsageNanoUsd(
  model: GeminiModelId,
  at: Date,
  usage: { inputTokens?: number; outputTokens?: number; thoughtTokens?: number; searchQueries?: number }
): number | undefined {
  if (usage.inputTokens === undefined || usage.outputTokens === undefined || usage.thoughtTokens === undefined) {
    return undefined;
  }
  const { inputNanoUsd, outputNanoUsd } = geminiTokenPrices(model, at);
  const cost = usage.inputTokens * inputNanoUsd + (usage.outputTokens + usage.thoughtTokens) * outputNanoUsd +
    (usage.searchQueries ?? 0) * GEMINI_SEARCH_QUERY_NANO_USD;
  return Number.isSafeInteger(cost) && cost >= 0 ? cost : undefined;
}
