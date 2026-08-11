import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { assertLiveSuiteSuccess } from "../scripts/assert-live-suite-output.mts";

describe("live-suite runner status assertion", () => {
  it("forces no-color Vitest output for shell wrappers that invoke npm run test:live", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts["test:live"]).toBe(
      "NO_COLOR=1 ASKRIGOR_LIVE_TESTS=1 vitest run tests/live-smoke.test.ts"
    );
  });

  it("accepts five passing tests when ANSI codes split the summary", () => {
    expect(() => assertLiveSuiteSuccess({
      exitStatus: 0,
      output: "Test Files 1 passed (1)\n\u001B[32m Tests \u001B[0m \u001B[1m5 passed\u001B[0m \u001B[2m(5)\u001B[0m\n"
    })).not.toThrow();
  });

  it("rejects a nonzero provider-test process status before parsing output", () => {
    expect(() => assertLiveSuiteSuccess({
      exitStatus: 1,
      output: "Tests 5 passed (5)"
    })).toThrow("Live suite process exited 1");
  });

  it("rejects an incomplete or skipped test summary after ANSI removal", () => {
    expect(() => assertLiveSuiteSuccess({
      exitStatus: 0,
      output: "Test Files 1 passed (1)\nTests 4 passed | 1 skipped (5)"
    })).toThrow("exactly five passing tests and zero skipped tests");
  });

  it("rejects a passing test count when the live suite did not have one passing test file", () => {
    expect(() => assertLiveSuiteSuccess({
      exitStatus: 0,
      output: "Test Files 1 failed (1)\nTests 5 passed (5)"
    })).toThrow("exactly one passing test file");
  });

  it("rejects a skipped test-file summary even when five tests passed", () => {
    expect(() => assertLiveSuiteSuccess({
      exitStatus: 0,
      output: "Test Files 1 passed (1)\nTest Files 1 skipped (1)\nTests 5 passed (5)"
    })).toThrow("exactly one passing test file");
  });
});
