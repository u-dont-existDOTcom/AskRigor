import { chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GEMINI_YOUTUBE_SCOUT_MODEL } from "@askrigor/sources";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executeResumableAutomatedGeminiScout,
  GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD
} from "../apps/research-mcp/src/actions/gemini-scout-route.js";
import {
  createFileAiBudget,
  type AiBudget,
  type BudgetHold
} from "../apps/research-mcp/src/lessons/ai-budget.js";
import { researchPacket, researchReceipt } from "./helpers/research-session-fixtures.js";

const TARGET = {
  research_target: "adults comparing de-identified treatment programs",
  diagnosis_status: "diagnosis_not_specified" as const
};
const CHECKPOINT = {
  interaction_id: "interaction-settlement-1",
  phase: "INITIAL" as const,
  provider_interaction_count: 1 as const,
  poll_attempts: 0,
  executed_search_queries: []
};
// 1,000 input, 2,500 output and thought tokens and 8 searches cost $0.122125.
const USAGE = {
  total_input_tokens: 1_000,
  total_output_tokens: 2_000,
  total_thought_tokens: 500,
  google_search_queries: 8
};
const ACTUAL_NANO_USD = 122_125_000;

type Outcome = "complete" | "over_budget" | "boundary" | "throw";

function completedAdvance(usage: Record<string, number>) {
  const packet = researchPacket();
  return {
    kind: "complete" as const,
    frontier: {
      data: {
        response_id: CHECKPOINT.interaction_id,
        model: GEMINI_YOUTUBE_SCOUT_MODEL,
        google_search_grounded: true as const,
        provider_storage_disabled: false,
        provider_interaction_delete_requested: true,
        correction_attempted: false,
        provider_interaction_count: 1 as const,
        executed_search_queries: packet.discovery_queries.map(({ query }) => query),
        usage,
        packet
      }
    }
  };
}

// A first call (no checkpoint) starts the job and leaves it running; a later
// call ends it with the outcome set for it. The fake never deletes anything,
// so a retried completion completes again.
function backgroundScout() {
  const fake = {
    outcome: "complete" as Outcome,
    advance: vi.fn(async (_input: unknown, _config: unknown, checkpoint?: unknown) => {
      if (checkpoint === undefined) return { kind: "progress" as const, checkpoint: CHECKPOINT };
      if (fake.outcome === "throw") throw new Error("provider transport failed");
      if (fake.outcome === "boundary") {
        return {
          kind: "boundary" as const,
          frontier: { error: { code: "gemini_youtube_scout_request_failed", retryable: true } }
        };
      }
      return completedAdvance(fake.outcome === "over_budget" ? { google_search_queries: 72 } : USAGE);
    })
  };
  return fake;
}

const temporaryDirectories: string[] = [];

async function ledger(start: Date) {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-scout-settlement-"));
  temporaryDirectories.push(directory);
  const ledgerPath = join(directory, "ai-budget.json");
  const clock = { now: start };
  const open = (): AiBudget => createFileAiBudget({
    ledgerPath,
    monthlyLimitNanoUsd: 50_000_000_000,
    expectedUid: process.getuid?.(),
    now: () => clock.now
  });
  return {
    directory,
    clock,
    open,
    read: async () => JSON.parse(await readFile(ledgerPath, "utf8")) as {
      utc_month: string;
      charged_nano_usd: number;
    }
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

function options(budget: AiBudget, scout: ReturnType<typeof backgroundScout>, overrides: Record<string, unknown> = {}) {
  return {
    geminiApiKey: "gemini-key",
    youtubeApiKey: "youtube-key",
    geminiKeyUnbilled: true,
    budget,
    backgroundScout: scout.advance as never,
    backgroundPollDelayMs: 0,
    validate: vi.fn(async () => researchReceipt()),
    loadScoutInstructions: async () => "Find firsthand videos.",
    ...overrides
  };
}

/** Starts a background scout and returns what the caller carries to the next call. */
async function startScout(budget: AiBudget, scout: ReturnType<typeof backgroundScout>) {
  const started = await executeResumableAutomatedGeminiScout(TARGET, undefined, options(budget, scout));
  if (!("controller_progress" in started)) throw new Error("The scout did not start in the background");
  expect(started.controller_progress).toEqual({
    checkpoint: CHECKPOINT,
    accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
    budget_hold: {
      hold_id: expect.any(String),
      held_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
      utc_month: expect.stringMatching(/^\d{4}-\d{2}$/u)
    }
  });
  return {
    checkpoint: started.controller_progress.checkpoint,
    accountedNanoUsd: started.controller_progress.accounted_nano_usd,
    budgetHold: started.controller_progress.budget_hold as BudgetHold
  };
}

describe("background Gemini scout budget settlement", () => {
  it("settles the real cost on the call that completes the scout, once, also after a restart", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const starting = book.open();
    const resume = await startScout(starting, scout);
    // A second scout still running keeps enough charged that a second refund
    // of the first would fit in the ledger.
    const stillRunning = await startScout(starting, scout);
    expect(stillRunning.budgetHold.hold_id).not.toBe(resume.budgetHold.hold_id);
    expect(await book.read()).toMatchObject({ charged_nano_usd: 2 * GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });

    // The process restarted between the start and the completion: the hold
    // travels with the checkpoint, so the new process settles it.
    const restarted = book.open();
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(restarted, scout))).toMatchObject({
      controller_completion: {
        provider_storage_mode: "TEMPORARY_BACKGROUND_DELETE_REQUESTED",
        accounted_nano_usd: ACTUAL_NANO_USD
      }
    });
    expect(await book.read()).toMatchObject({
      charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD + ACTUAL_NANO_USD
    });

    // The completing call retried with the same checkpoint refunds nothing more.
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(restarted, scout))).toMatchObject({
      controller_completion: { accounted_nano_usd: ACTUAL_NANO_USD }
    });
    expect(await book.read()).toMatchObject({
      charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD + ACTUAL_NANO_USD
    });
  });

  it("refunds nothing when the scout completes in a new UTC month", async () => {
    const book = await ledger(new Date("2026-10-31T23:59:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const resume = await startScout(budget, scout);
    expect(resume.budgetHold.utc_month).toBe("2026-10");

    book.clock.now = new Date("2026-11-01T00:01:00.000Z");
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout))).toHaveProperty(
      "controller_completion"
    );
    expect(await book.read()).toMatchObject({ utc_month: "2026-11", charged_nano_usd: 0 });
  });

  it("keeps the whole hold charged after a boundary, a failure, an over-budget completion or a stopped scout", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const resume = await startScout(budget, scout);

    scout.outcome = "boundary";
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout))).toEqual({
      controller_boundary: { code: "gemini_youtube_scout_request_failed", retryable: true }
    });
    scout.outcome = "throw";
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout))).toEqual({
      controller_boundary: { code: "gemini_youtube_scout_unclassified_failure", retryable: true }
    });
    scout.outcome = "over_budget";
    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout))).toEqual({
      controller_boundary: { code: "gemini_scout_request_over_budget", retryable: false }
    });
    // Stopped before completion: its stored search is deleted, its cost unknown.
    const deleteBackgroundInteraction = vi.fn(async () => true);
    expect(await executeResumableAutomatedGeminiScout(
      { ...TARGET, research_target: "treatments for hip osteoarthritis" },
      resume,
      options(budget, scout, { deleteBackgroundInteraction })
    )).toEqual({
      controller_boundary: { code: "research_target_not_population_level", retryable: false }
    });
    expect(deleteBackgroundInteraction).toHaveBeenCalledOnce();
    expect(await book.read()).toMatchObject({ charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });
  });

  it("hands a held scout's hold back with its checkpoint, so a later completion still settles it", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const resume = await startScout(budget, scout);

    const held = await executeResumableAutomatedGeminiScout(
      TARGET, resume, options(budget, scout, { youtubeApiKey: "" })
    );
    expect(held).toEqual({
      controller_progress: {
        checkpoint: CHECKPOINT,
        accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD,
        budget_hold: resume.budgetHold,
        held_by: "youtube_provider_not_configured"
      }
    });
    expect(await book.read()).toMatchObject({ charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });

    await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout));
    expect(await book.read()).toMatchObject({ charged_nano_usd: ACTUAL_NANO_USD });
  });

  it("settles a completed scout whose validation fails, as a one-call scout commits before validating", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const resume = await startScout(budget, scout);

    expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout, {
      validate: vi.fn(async () => {
        throw new Error("YouTube unavailable");
      })
    }))).toEqual({
      controller_boundary: { code: "gemini_youtube_candidate_validation_failed", retryable: true }
    });
    expect(await book.read()).toMatchObject({ charged_nano_usd: ACTUAL_NANO_USD });
  });

  it("returns the completed scout with its whole hold charged when the ledger cannot record the settlement", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const resume = await startScout(budget, scout);

    // A group-writable ledger directory fails the budget's safety check.
    await chmod(book.directory, 0o720);
    try {
      expect(await executeResumableAutomatedGeminiScout(TARGET, resume, options(budget, scout))).toMatchObject({
        controller_completion: { accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD }
      });
    } finally {
      await chmod(book.directory, 0o700);
    }
    expect(await book.read()).toMatchObject({ charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });

    // A hold larger than one scout's reservation is not settled either.
    expect(await executeResumableAutomatedGeminiScout(TARGET, {
      ...resume,
      budgetHold: { ...resume.budgetHold, held_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD + 1 }
    }, options(budget, scout))).toMatchObject({
      controller_completion: { accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD }
    });
    expect(await book.read()).toMatchObject({ charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });
  });

  it("keeps a checkpoint from before holds existed charged in full", async () => {
    const book = await ledger(new Date("2026-10-21T14:00:00.000Z"));
    const scout = backgroundScout();
    const budget = book.open();
    const { budgetHold: _hold, ...legacy } = await startScout(budget, scout);

    expect(await executeResumableAutomatedGeminiScout(TARGET, legacy, options(budget, scout))).toMatchObject({
      controller_completion: { accounted_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD }
    });
    expect(await book.read()).toMatchObject({ charged_nano_usd: GEMINI_SCOUT_MAXIMUM_REQUEST_NANO_USD });
  });
});
