import { describe, expect, it } from "vitest";

import {
  RESEARCH_SESSION_ABSOLUTE_TTL_MS,
  RESEARCH_SESSION_IDLE_TTL_MS,
  RETRACTION_WATCH_MAX_AGE_MS,
  privateResearchOrchestrationApiKeyFromEnv,
  privateResearchOrchestrationIsEnabled,
  researchSessionCheckpointConfigFromEnv,
  retractionWatchSnapshotRootFromEnv,
  validatePrivateResearchOrchestrationApiKey,
} from "../apps/research-mcp/src/config.js";

describe("Phase G persistence configuration", () => {
  it("keeps persistence disabled unless the complete private configuration is present", () => {
    expect(researchSessionCheckpointConfigFromEnv({})).toBeUndefined();
    expect(() => researchSessionCheckpointConfigFromEnv({
      ASKRIGOR_RESEARCH_SESSION_DIRECTORY: "/var/lib/askrigor-research-sessions",
    })).toThrow("Research session checkpoint configuration unavailable");
  });

  it("accepts only one exact 32-byte base64url key and bounded key identity", () => {
    const encoded = Buffer.alloc(32, 0x42).toString("base64url");
    expect(researchSessionCheckpointConfigFromEnv({
      ASKRIGOR_RESEARCH_SESSION_DIRECTORY: "/var/lib/askrigor-research-sessions",
      ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_BASE64URL: encoded,
      ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_ID: "session-key-2026-08",
    })).toEqual({
      rootDirectory: "/var/lib/askrigor-research-sessions",
      encryptionKey: Uint8Array.from(Buffer.alloc(32, 0x42)),
      keyId: "session-key-2026-08",
    });
    expect(() => researchSessionCheckpointConfigFromEnv({
      ASKRIGOR_RESEARCH_SESSION_DIRECTORY: "/var/lib/askrigor-research-sessions",
      ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_BASE64URL:
        Buffer.alloc(31).toString("base64url"),
      ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_ID: "session-key",
    })).toThrow("Research session checkpoint configuration unavailable");
  });

  it("fixes the reviewed retention and staleness limits in server code", () => {
    expect(RESEARCH_SESSION_IDLE_TTL_MS).toBe(72 * 60 * 60 * 1_000);
    expect(RESEARCH_SESSION_ABSOLUTE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(RETRACTION_WATCH_MAX_AGE_MS).toBe(72 * 60 * 60 * 1_000);
  });

  it("accepts only an explicit non-root Retraction Watch path", () => {
    expect(retractionWatchSnapshotRootFromEnv(undefined)).toBeUndefined();
    expect(retractionWatchSnapshotRootFromEnv(
      "/var/lib/askrigor-retraction-watch",
    )).toBe("/var/lib/askrigor-retraction-watch");
    expect(() => retractionWatchSnapshotRootFromEnv("relative"))
      .toThrow("Retraction Watch snapshot configuration unavailable");
    expect(() => retractionWatchSnapshotRootFromEnv("/"))
      .toThrow("Retraction Watch snapshot configuration unavailable");
  });

  it("keeps the private interface opt-in and rejects missing, short, or padded secrets", () => {
    expect(privateResearchOrchestrationIsEnabled(undefined)).toBe(false);
    expect(privateResearchOrchestrationIsEnabled("false")).toBe(false);
    expect(privateResearchOrchestrationIsEnabled("true")).toBe(true);
    expect(privateResearchOrchestrationApiKeyFromEnv("private-secret"))
      .toBe("private-secret");
    expect(() => validatePrivateResearchOrchestrationApiKey(undefined))
      .toThrow("Private research orchestration authentication unavailable");
    expect(() => validatePrivateResearchOrchestrationApiKey("short"))
      .toThrow("Private research orchestration authentication unavailable");
    expect(() => validatePrivateResearchOrchestrationApiKey(` ${"x".repeat(32)}`))
      .toThrow("Private research orchestration authentication unavailable");
    expect(validatePrivateResearchOrchestrationApiKey("x".repeat(32)))
      .toBe("x".repeat(32));
  });
});
