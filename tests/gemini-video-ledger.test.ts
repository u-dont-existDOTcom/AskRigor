import { chmod, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GEMINI_VIDEO_DAILY_LIMIT_SECONDS,
  pacificDay,
  productionGeminiVideoLedger,
  sharedGeminiVideoLedger
} from "../apps/research-mcp/src/gemini-video-ledger.js";

describe("Gemini video daily ledger", () => {
  let directory: string;
  let clock: Date;
  const ledger = (path = join(directory, "gemini-video-seconds.json")) =>
    sharedGeminiVideoLedger({ ledgerPath: path, now: () => clock });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "askrigor-video-ledger-"));
    await chmod(directory, 0o700);
    clock = new Date("2026-10-03T12:00:00Z");
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("counts days in Pacific time, when Google's daily quotas reset", () => {
    expect(pacificDay(new Date("2026-10-03T06:59:59Z"))).toBe("2026-10-02");
    expect(pacificDay(new Date("2026-10-03T07:00:00Z"))).toBe("2026-10-03");
    // Winter time is UTC-8.
    expect(pacificDay(new Date("2026-12-03T07:59:59Z"))).toBe("2026-12-02");
    expect(pacificDay(new Date("2026-12-03T08:00:00Z"))).toBe("2026-12-03");
  });

  it("charges each pass and refuses one that would pass 8 hours, then starts again the next Pacific day", async () => {
    expect(GEMINI_VIDEO_DAILY_LIMIT_SECONDS).toBe(28_800);
    expect(await ledger().charge(28_000)).toEqual({ charged: true, remaining_seconds: 800 });
    expect(await ledger().charge(801)).toEqual({ charged: false, remaining_seconds: 800 });
    expect(await ledger().charge(800)).toEqual({ charged: true, remaining_seconds: 0 });
    expect(await ledger().charge(1)).toEqual({ charged: false, remaining_seconds: 0 });

    // The count lives in the file, so it survives a restart.
    const saved = JSON.parse(await readFile(join(directory, "gemini-video-seconds.json"), "utf8"));
    expect(saved).toMatchObject({ pacific_day: "2026-10-03", charged_seconds: 28_800 });

    clock = new Date("2026-10-04T07:00:00Z");
    expect(await ledger().charge(600)).toEqual({ charged: true, remaining_seconds: 28_200 });
  });

  it("refuses rather than resets when the clock goes back a day", async () => {
    await ledger().charge(60);
    clock = new Date("2026-10-02T12:00:00Z");
    await expect(ledger().charge(60)).rejects.toThrow("Gemini video ledger unavailable");
  });

  it("refuses an unsafe directory, an unsafe file, a symbolic link and a damaged ledger", async () => {
    await chmod(directory, 0o777);
    await expect(ledger().charge(60)).rejects.toThrow("Gemini video ledger unavailable");
    await chmod(directory, 0o700);

    const loose = join(directory, "loose.json");
    await writeFile(loose, JSON.stringify({
      schema_version: 1, pacific_day: "2026-10-03", daily_limit_seconds: 28_800, charged_seconds: 0,
      updated_at: "2026-10-03T12:00:00.000Z"
    }), { mode: 0o644 });
    await chmod(loose, 0o644);
    await expect(ledger(loose).charge(60)).rejects.toThrow("Gemini video ledger unavailable");

    const linked = join(directory, "linked.json");
    await symlink(loose, linked);
    await expect(ledger(linked).charge(60)).rejects.toThrow("Gemini video ledger unavailable");

    const damaged = join(directory, "damaged.json");
    await writeFile(damaged, "{\"charged_seconds\": -5}", { mode: 0o600 });
    await expect(ledger(damaged).charge(60)).rejects.toThrow("Gemini video ledger unavailable");

    await expect(ledger().charge(0)).rejects.toThrow("Gemini video ledger unavailable");
    await expect(ledger().charge(1.5)).rejects.toThrow("Gemini video ledger unavailable");
  });

  it("lives beside the AI budget ledger in production, and needs its exact path", () => {
    expect(() => productionGeminiVideoLedger({})).toThrow("Gemini video ledger unavailable");
    expect(() => productionGeminiVideoLedger({ ASKRIGOR_AI_BUDGET_LEDGER: "relative/ai-budget.json" }))
      .toThrow("Gemini video ledger unavailable");
    expect(productionGeminiVideoLedger({ ASKRIGOR_AI_BUDGET_LEDGER: join(directory, "ai-budget.json") }))
      .toBe(sharedGeminiVideoLedger({ ledgerPath: join(directory, "gemini-video-seconds.json") }));
  });
});
