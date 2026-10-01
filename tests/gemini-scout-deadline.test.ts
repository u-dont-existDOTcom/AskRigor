import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeResumableAutomatedGeminiScout,
  GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
} from "../apps/research-mcp/src/actions/gemini-scout-route.js";

const CHECKPOINT = {
  interaction_id: "interaction-1",
  phase: "INITIAL" as const,
  provider_interaction_count: 1 as const,
  poll_attempts: 0,
  executed_search_queries: []
};
const TARGET = {
  research_target: "Adults trying to avoid a hip replacement: what they tried and what happened",
  diagnosis_status: "diagnosis_not_specified" as const
};
const RESUME = { checkpoint: CHECKPOINT, accountedNanoUsd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD };

function scoutStub() {
  let polls = 0;
  const backgroundScout = vi.fn(async () => {
    polls += 1;
    // Still searching for the first five polls, then a provider boundary ends the run.
    return polls <= 5
      ? { kind: "progress" as const, checkpoint: { ...CHECKPOINT, poll_attempts: polls } }
      : {
          kind: "boundary" as const,
          frontier: { error: { code: "gemini_youtube_scout_request_failed", retryable: true } }
        };
  });
  return backgroundScout;
}

const options = (backgroundScout: ReturnType<typeof scoutStub>, deadlineMs?: number) => ({
  geminiApiKey: "gemini-key",
  youtubeApiKey: "youtube-key",
  backgroundPollDelayMs: 0,
  loadScoutInstructions: async () => "Find firsthand videos.",
  backgroundScout: backgroundScout as never,
  ...(deadlineMs === undefined ? {} : { deadlineMs })
});


// The owner's zero-spend policy gates every scout route on a Gemini key
// declared unbilled; these tests run the scout against test doubles with it.
const previousGeminiBilling = process.env.ASKRIGOR_GEMINI_BILLING;
beforeEach(() => {
  process.env.ASKRIGOR_GEMINI_BILLING = "none";
});
afterEach(() => {
  if (previousGeminiBilling === undefined) delete process.env.ASKRIGOR_GEMINI_BILLING;
  else process.env.ASKRIGOR_GEMINI_BILLING = previousGeminiBilling;
});

describe("deadline-paced Gemini scout polling", () => {
  it("polls a fixed number of times without a deadline", async () => {
    const backgroundScout = scoutStub();
    const result = await executeResumableAutomatedGeminiScout(TARGET, RESUME, options(backgroundScout));
    expect(backgroundScout).toHaveBeenCalledTimes(3);
    expect(result).toHaveProperty("controller_progress");
  });

  it("starts no further poll whose request timeout would end after the deadline", async () => {
    const backgroundScout = scoutStub();
    const result = await executeResumableAutomatedGeminiScout(
      TARGET, RESUME, options(backgroundScout, Date.now() + 10_000)
    );
    expect(backgroundScout).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty("controller_progress");
  });

  it("keeps polling while another request fits before the deadline", async () => {
    const backgroundScout = scoutStub();
    const result = await executeResumableAutomatedGeminiScout(
      TARGET, RESUME, options(backgroundScout, Date.now() + 60_000)
    );
    // Past the fixed three polls, until the provider ends the run on the sixth.
    expect(backgroundScout).toHaveBeenCalledTimes(6);
    expect(result).toEqual({
      controller_boundary: { code: "gemini_youtube_scout_request_failed", retryable: true }
    });
  });
});
