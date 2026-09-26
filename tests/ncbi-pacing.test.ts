import { describe, expect, it } from "vitest";

import {
  createRequestPacer,
  NCBI_MIN_REQUEST_INTERVAL_MS
} from "../packages/sources/src/ncbi-pacing.js";

describe("NCBI request pacing", () => {
  it("queues a burst at the configured interval instead of sending it at once", async () => {
    let clock = 1_000;
    const sleeps: number[] = [];
    const pacer = createRequestPacer({
      intervalMs: NCBI_MIN_REQUEST_INTERVAL_MS.withApiKey,
      now: () => clock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      }
    });

    await Promise.all([pacer.acquire(), pacer.acquire(), pacer.acquire()]);
    expect(sleeps).toEqual([110, 220]);

    clock += 1_000;
    await pacer.acquire();
    expect(sleeps).toEqual([110, 220]);
  });

  it("stays under NCBI's published per-second limits", () => {
    expect(1_000 / NCBI_MIN_REQUEST_INTERVAL_MS.withApiKey).toBeLessThan(10);
    expect(1_000 / NCBI_MIN_REQUEST_INTERVAL_MS.withoutApiKey).toBeLessThan(3);
  });
});
