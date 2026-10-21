import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEMINI_MODEL_SETTING,
  GEMINI_SEARCH_QUERY_NANO_USD,
  geminiModelTrialSetting,
  geminiTokenPrices,
  geminiUsageNanoUsd
} from "../packages/sources/src/index.js";

// Owner answer 146b (2026-10-21): each model's own prices, from Google's price page read that day.
describe("Gemini models and their prices", () => {
  it("keeps today's model as the default and maps the trial arms", () => {
    expect(DEFAULT_GEMINI_MODEL_SETTING).toEqual({ model: "gemini-3.6-flash", thinking: "medium" });
    expect(geminiModelTrialSetting("current")).toEqual({ model: "gemini-3.6-flash", thinking: "medium" });
    expect(geminiModelTrialSetting("gemini-4-low")).toEqual({ model: "gemini-4-argon", thinking: "low" });
    expect(geminiModelTrialSetting("gemini-4-high")).toEqual({ model: "gemini-4-argon", thinking: "high" });
  });

  it("prices each model by the day, with Gemini 4's price change on 1 December", () => {
    const october = new Date("2026-10-21T12:00:00Z");
    expect(geminiTokenPrices("gemini-3.6-flash", october)).toEqual({ inputNanoUsd: 750, outputNanoUsd: 3_750 });
    expect(geminiTokenPrices("gemini-4-argon", october)).toEqual({ inputNanoUsd: 2_000, outputNanoUsd: 10_000 });
    expect(geminiTokenPrices("gemini-4-argon", new Date("2026-11-30T23:59:59Z")))
      .toEqual({ inputNanoUsd: 2_000, outputNanoUsd: 10_000 });
    expect(geminiTokenPrices("gemini-4-argon", new Date("2026-12-01T00:00:00Z")))
      .toEqual({ inputNanoUsd: 4_000, outputNanoUsd: 20_000 });
    expect(GEMINI_SEARCH_QUERY_NANO_USD).toBe(14_000_000);
  });

  it("costs a usage at its model's price, thinking tokens as output, and refuses a missing count", () => {
    const at = new Date("2026-10-21T12:00:00Z");
    const usage = { inputTokens: 100_000, outputTokens: 5_000, thoughtTokens: 3_000, searchQueries: 10 };
    // $0.075 + $0.03 + $0.14 = $0.245 at Flash; $0.20 + $0.08 + $0.14 = $0.42 at Gemini 4.
    expect(geminiUsageNanoUsd("gemini-3.6-flash", at, usage)).toBe(245_000_000);
    expect(geminiUsageNanoUsd("gemini-4-argon", at, usage)).toBe(420_000_000);
    expect(geminiUsageNanoUsd("gemini-4-argon", at, { ...usage, thoughtTokens: undefined })).toBeUndefined();
  });
});
