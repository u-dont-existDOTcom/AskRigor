// Owner answer 416a (24 Nov 2026, "both changes"), built behind a switch that is off: with it off, the final check gives
// exactly what it gave before the switch was built. tests/fixtures/closing-comparison-off.json holds the results the
// check gave these calls on the commit before the switch (written then with ASKRIGOR_WRITE_CLOSING_COMPARISON_OFF=1), so
// this compares the check of today with the check of then, not with itself.
import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { finalizeResearch } from "../apps/research-mcp/src/research-finalization-gate.js";
import { comparable, OFF_CASES, OPTIONS } from "./helpers/closing-comparison-cases.js";

const FIXTURE = new URL("./fixtures/closing-comparison-off.json", import.meta.url);

describe("owner answer 416a's switch, off", () => {
  it("gives every call exactly the result the check gave it before the switch", () => {
    const results = Object.fromEntries(OFF_CASES.map(({ name, call }) =>
      [name, comparable(finalizeResearch(call, OPTIONS) as unknown as Record<string, unknown>)]));
    const written = `${JSON.stringify(results, null, 2)}\n`;
    if (process.env.ASKRIGOR_WRITE_CLOSING_COMPARISON_OFF === "1") writeFileSync(FIXTURE, written);
    expect(written).toBe(readFileSync(FIXTURE, "utf8"));
  });
});
