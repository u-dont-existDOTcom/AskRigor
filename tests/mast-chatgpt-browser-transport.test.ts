import { describe, expect, it } from "vitest";

import {
  assertPreSendEligible,
  composerObservationSchema,
  generationTransportReceiptSchema,
  normalizeTransportText,
  retryDisposition,
  transportFailureReceiptSchema,
  transportTextIdentity,
  verifyComposerTransfer,
} from "../evaluation/mast/src/chatgpt-browser-transport.js";
import { ROUND_2_STUDY_ID } from "../evaluation/mast/src/fresh-validation-round-2.js";

const instant = "2026-09-18T19:00:00.000Z";
const source = `${"αβγ packet line\n".repeat(12_000)}terminal`;
const identity = transportTextIdentity(source);
const observation = composerObservationSchema.parse({
  schemaVersion: 1,
  observedAt: instant,
  origin: "https://chatgpt.com",
  composerSelector: "#prompt-textarea",
  composerCount: 1,
  extraction: "CONTENTEDITABLE_INNER_TEXT",
  normalization: "LINE_ENDINGS_TO_LF_ONLY",
  composerUtf8Bytes: identity.utf8Bytes,
  composerCodePoints: identity.codePoints,
  composerSha256: identity.sha256,
});
const ui = {
  schemaVersion: 1,
  observedAt: instant,
  origin: "https://chatgpt.com" as const,
  modelVisibleLabel: "GPT-5.6 Sol" as const,
  reasoningVisibleLabel: "Extra High" as const,
  reasoningOrdinal: "4 of 5" as const,
  chatMode: "TEMPORARY" as const,
  personalization: "UNPERSONALIZED" as const,
  userMessageCount: 0 as const,
  assistantMessageCount: 0 as const,
  attachmentCount: 0 as const,
  sendEnabled: true as const,
};

describe("MAST ChatGPT browser transport", () => {
  it("verifies a packet larger than the real approximately 167 KB packet", () => {
    expect(Buffer.byteLength(source, "utf8")).toBeGreaterThanOrEqual(167_433);
    expect(verifyComposerTransfer({ source, observation }).exactEquality).toBe(true);
  });

  it("permits only line-ending canonicalization", () => {
    const crlf = source.replace(/\n/gu, "\r\n");
    expect(normalizeTransportText(crlf)).toBe(source);
    expect(verifyComposerTransfer({ source: crlf, observation }).exactEquality).toBe(true);
  });

  it("rejects truncation and a single altered character", () => {
    for (const changed of [source.slice(0, -1), `${source.slice(0, -1)}X`]) {
      expect(() => verifyComposerTransfer({ source: changed, observation }))
        .toThrow("GENERATION_COMPOSER_SOURCE_MISMATCH");
    }
  });

  it("fails closed for wrong model, thinking, session, or duplicate-send state", () => {
    expect(assertPreSendEligible({ source, observation, ui, priorStates: [], attempt: 1 }).sendAuthorized).toBe(true);
    expect(() => assertPreSendEligible({ source, observation, ui: { ...ui, modelVisibleLabel: "Latest" }, priorStates: [], attempt: 1 })).toThrow();
    expect(() => assertPreSendEligible({ source, observation, ui: { ...ui, reasoningVisibleLabel: "High" }, priorStates: [], attempt: 1 })).toThrow();
    expect(() => assertPreSendEligible({ source, observation, ui: { ...ui, chatMode: "ORDINARY" }, priorStates: [], attempt: 1 })).toThrow();
    expect(() => assertPreSendEligible({ source, observation, ui, priorStates: ["SENT"], attempt: 2 }))
      .toThrow("GENERATION_DUPLICATE_SEND_BLOCKED");
  });

  it("never retries a sealed or ambiguously sent response", () => {
    expect(retryDisposition({ attempt: 1, messageMayHaveBeenSent: false, sealed: false })).toBe("RETRY_PRE_SEND_ONLY");
    expect(retryDisposition({ attempt: 1, messageMayHaveBeenSent: true, sealed: false })).toBe("PRESERVE_AMBIGUITY_NO_RETRY");
    expect(retryDisposition({ attempt: 2, messageMayHaveBeenSent: false, sealed: false })).toBe("ATTEMPT_CEILING_EXHAUSTED");
    expect(retryDisposition({ attempt: 1, messageMayHaveBeenSent: false, sealed: true })).toBe("SKIP_SEALED");
  });

  it("validates equality and ambiguity receipts", () => {
    expect(generationTransportReceiptSchema.parse({
      schemaVersion: 1, studyId: ROUND_2_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001", attempt: 1,
      state: "COMPOSER_VERIFIED", normalization: "LINE_ENDINGS_TO_LF_ONLY",
      sourceUtf8Bytes: identity.utf8Bytes, sourceCodePoints: identity.codePoints, sourceSha256: identity.sha256,
      relayPageUtf8Bytes: identity.utf8Bytes, relayPageCodePoints: identity.codePoints,
      relayPageSha256: identity.sha256,
      composerUtf8Bytes: identity.utf8Bytes, composerCodePoints: identity.codePoints, composerSha256: identity.sha256,
      exactEquality: true, ui, tunnelStarted: true, tunnelStopped: false,
      responseArtifactSha256: null, verifiedAt: instant, sentAt: null,
    }).exactEquality).toBe(true);
    expect(transportFailureReceiptSchema.parse({
      schemaVersion: 1, studyId: ROUND_2_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001", attempt: 1,
      stage: "RESPONSE_CAPTURE", failureCode: "RESPONSE_CAPTURE_AMBIGUOUS",
      sourceSha256: identity.sha256, observedComposerSha256: identity.sha256,
      messageMayHaveBeenSent: true, retryable: false, stoppedBeforeSend: false, recordedAt: instant,
    }).retryable).toBe(false);
  });
});
