import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { scanLiveSuiteLog } from "../scripts/scan-live-suite-log.mts";

describe("live-suite output secret scan", () => {
  it("accepts a clean provider summary without configured runtime values", () => {
    expect(() => scanLiveSuiteLog({
      output: "Test Files 1 passed (1)\\nTests 5 passed (5)\\n",
      environment: {
        NCBI_EMAIL: "validation@example.test",
        CROSSREF_MAILTO: "validation@example.test",
        YOUTUBE_API_KEY: "test-youtube-api-key-not-a-secret",
        ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID: "4x1fl67d_Ag"
      }
    })).not.toThrow();
  });

  it("fails closed without echoing a configured sensitive value found in the log", () => {
    const sensitiveValue = "test-youtube-api-key-not-a-secret";

    try {
      scanLiveSuiteLog({
        output: `provider response accidentally contained ${sensitiveValue}`,
        environment: { YOUTUBE_API_KEY: sensitiveValue }
      });
      throw new Error("Expected scanLiveSuiteLog to reject leaked sensitive output");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Live-suite output contains configured sensitive value");
      expect((error as Error).message).not.toContain(sensitiveValue);
    }
  });

  it("refuses to invoke live providers when required configuration is absent", () => {
    const runner = fileURLToPath(new URL("../scripts/run-live-suite-v3.sh", import.meta.url));
    const result = spawnSync("bash", [runner], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { PATH: process.env.PATH },
      encoding: "utf8"
    });

    expect(result.status).toBe(64);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("required runtime configuration is absent");
  });
});
