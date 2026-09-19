import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  determineResumeAction,
  normalizedTextIdentity,
  ROUND_3_BROWSER_PROFILE,
  ROUND_3_BROWSER_SERVICE,
  ROUND_3_CDP_ENDPOINT,
  ROUND_3_DISPLAY_SERVICE,
  ROUND_3_WATCHDOG_SERVICE,
  selectExactRecoveryCandidate,
  sentReceiptSchema,
  verifyRuntimeFileHashes,
} from "../evaluation/mast/src/durable-vps-round-3.js";
import {
  assertPreSendEligible,
  generationTransportReceiptSchema,
  retryDisposition,
  transportTextIdentity,
  verifyComposerTransfer,
} from
  "../evaluation/mast/src/chatgpt-browser-transport-round-3.js";
import { ROUND_3_STUDY_ID } from "../evaluation/mast/src/fresh-validation-round-3.js";
import { vpsPacketTransferReceiptSchema } from
  "../evaluation/mast/src/vps-cdp-transport-round-3.js";

const root = resolve(import.meta.dirname, "..");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hashSet = {
  browserUnitSha256: "1".repeat(64),
  displayUnitSha256: "2".repeat(64),
  watchdogUnitSha256: "3".repeat(64),
  browserWrapperSha256: "4".repeat(64),
  watchdogScriptSha256: "5".repeat(64),
  transportScriptSha256: "6".repeat(64),
};
const instant = "2026-09-19T12:00:00.000Z";

function candidate(id: string, text: string) {
  const identity = normalizedTextIdentity(text);
  return {
    candidateId: id,
    url: `https://chatgpt.com/c/${id}`,
    normalizedUserMessageSha256: identity.sha256,
    normalizedUserMessageUtf8Bytes: identity.utf8Bytes,
    userMessageCount: 1 as const,
    assistantMessageCount: 1,
  };
}

describe("Round 3 durable VPS runtime and recovery", () => {
  it("detects every frozen runtime file tamper", () => {
    expect(verifyRuntimeFileHashes(hashSet, hashSet)).toEqual(hashSet);
    expect(() => verifyRuntimeFileHashes(hashSet, { ...hashSet,
      browserWrapperSha256: "f".repeat(64) })).toThrow("ROUND_3_RUNTIME_HASH_DRIFT");
  });

  it("normalizes line endings only and recovers exactly one full-message-hash match", () => {
    const expected = normalizedTextIdentity("alpha\r\nbeta\rchar");
    expect(expected).toEqual(normalizedTextIdentity("alpha\nbeta\nchar"));
    const selected = selectExactRecoveryCandidate({ expectedSha256: expected.sha256,
      expectedUtf8Bytes: expected.utf8Bytes,
      candidates: [candidate("wrong", "different"), candidate("right", "alpha\nbeta\nchar")] });
    expect(selected.candidateId).toBe("right");
  });

  it("fails closed for zero or multiple exact recovery candidates", () => {
    const expected = normalizedTextIdentity("same");
    expect(() => selectExactRecoveryCandidate({ ...expected, expectedSha256: expected.sha256,
      expectedUtf8Bytes: expected.utf8Bytes, candidates: [] })).toThrow("ROUND_3_RECOVERY_CANDIDATE_ZERO");
    expect(() => selectExactRecoveryCandidate({ expectedSha256: expected.sha256,
      expectedUtf8Bytes: expected.utf8Bytes,
      candidates: [candidate("one", "same"), candidate("two", "same")] }))
      .toThrow("ROUND_3_RECOVERY_CANDIDATE_MULTIPLE");
  });

  it("blocks duplicate Send and resumes only recovery after send-intent or SENT", () => {
    expect(determineResumeAction({ localSealed: true, responseReady: false, ambiguityReceipt: false,
      sendIntent: true, sentReceipt: true, preSendFailureCount: 0 })).toBe("SKIP_SEALED");
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: false,
      sendIntent: true, sentReceipt: false, preSendFailureCount: 0 })).toBe("RECOVER_EXISTING_SUBMISSION");
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: true,
      sendIntent: false, sentReceipt: false, preSendFailureCount: 0 })).toBe("STOP_AMBIGUOUS");
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: false,
      sendIntent: false, sentReceipt: false, preSendFailureCount: 1 })).toBe("NEW_PRE_SEND_ATTEMPT");
    expect(retryDisposition({ attempt: 1, messageMayHaveBeenSent: true, sealed: false }))
      .toBe("PRESERVE_AMBIGUITY_NO_RETRY");
  });

  it("distinguishes bounded pre-Send retry from post-Send recovery without duplicate submission", () => {
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: false,
      sendIntent: false, sentReceipt: false, preSendFailureCount: 0 })).toBe("NEW_PRE_SEND_ATTEMPT");
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: false,
      sendIntent: false, sentReceipt: true, preSendFailureCount: 0 })).toBe("RECOVER_EXISTING_SUBMISSION");
    expect(determineResumeAction({ localSealed: false, responseReady: false, ambiguityReceipt: false,
      sendIntent: false, sentReceipt: false, preSendFailureCount: 2 })).toBe("STOP_AMBIGUOUS");
  });

  it("accepts a real-size exact composer projection and rejects truncation or one altered character", () => {
    const source = `${"round3-exactness-αβγ".repeat(9_000)}\nterminal`;
    const identity = transportTextIdentity(source);
    expect(identity.utf8Bytes).toBeGreaterThanOrEqual(167_433);
    const observation = {
      schemaVersion: 1 as const, observedAt: instant, origin: "https://chatgpt.com" as const,
      composerSelector: "#prompt-textarea" as const, composerCount: 1 as const,
      extraction: "CONTENTEDITABLE_INNER_TEXT" as const,
      normalization: "LINE_ENDINGS_TO_LF_ONLY" as const,
      composerUtf8Bytes: identity.utf8Bytes, composerCodePoints: identity.codePoints,
      composerSha256: identity.sha256,
    };
    expect(verifyComposerTransfer({ source, observation }).exactEquality).toBe(true);
    expect(() => verifyComposerTransfer({ source, observation: { ...observation,
      composerUtf8Bytes: observation.composerUtf8Bytes - 1 } })).toThrow("GENERATION_COMPOSER_SOURCE_MISMATCH");
    expect(() => verifyComposerTransfer({ source, observation: { ...observation,
      composerSha256: digest("one altered character") } })).toThrow("GENERATION_COMPOSER_SOURCE_MISMATCH");
  });

  it("fails pre-Send admission for wrong session state and for any prior sent state", () => {
    const source = "packet";
    const identity = transportTextIdentity(source);
    const observation = {
      schemaVersion: 1 as const, observedAt: instant, origin: "https://chatgpt.com" as const,
      composerSelector: "#prompt-textarea" as const, composerCount: 1 as const,
      extraction: "CONTENTEDITABLE_INNER_TEXT" as const,
      normalization: "LINE_ENDINGS_TO_LF_ONLY" as const,
      composerUtf8Bytes: identity.utf8Bytes, composerCodePoints: identity.codePoints,
      composerSha256: identity.sha256,
    };
    const ui = { schemaVersion: 1 as const, observedAt: instant, origin: "https://chatgpt.com" as const,
      modelVisibleLabel: "GPT-5.6 Sol" as const, reasoningVisibleLabel: "Extra High" as const,
      reasoningOrdinal: "4 of 5" as const, chatMode: "TEMPORARY" as const,
      personalization: "UNPERSONALIZED" as const, authenticated: true as const,
      freshConversation: true as const, userMessageCount: 0 as const,
      assistantMessageCount: 0 as const, attachmentCount: 0 as const, sendEnabled: true as const };
    expect(assertPreSendEligible({ source, observation, ui, priorStates: [], attempt: 1 }).sendAuthorized)
      .toBe(true);
    expect(() => assertPreSendEligible({ source, observation, ui, priorStates: ["SENT"], attempt: 2 }))
      .toThrow("GENERATION_DUPLICATE_SEND_BLOCKED");
    expect(() => assertPreSendEligible({ source, observation,
      ui: { ...ui, chatMode: "NORMAL" }, priorStates: [], attempt: 1 })).toThrow();
  });

  it("requires source, destination, and composer equality in the SENT receipt", () => {
    const source = normalizedTextIdentity("packet");
    const base = {
      schemaVersion: 1 as const,
      studyId: ROUND_3_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001",
      attempt: 1,
      state: "SENT" as const,
      normalization: "LINE_ENDINGS_TO_LF_ONLY" as const,
      sourceUtf8Bytes: source.utf8Bytes,
      sourceSha256: source.sha256,
      destinationPacketUtf8Bytes: source.utf8Bytes,
      destinationPacketSha256: source.sha256,
      composerUtf8Bytes: source.utf8Bytes,
      composerSha256: source.sha256,
      exactEquality: true as const,
      ui: {
        schemaVersion: 1 as const, observedAt: instant, origin: "https://chatgpt.com" as const,
        modelVisibleLabel: "GPT-5.6 Sol" as const, reasoningVisibleLabel: "Extra High" as const,
        reasoningOrdinal: "4 of 5" as const, chatMode: "TEMPORARY" as const,
        personalization: "UNPERSONALIZED" as const, authenticated: true as const,
        freshConversation: true as const, userMessageCount: 0 as const,
        assistantMessageCount: 0 as const, attachmentCount: 0 as const, sendEnabled: true as const,
      },
      browserProfile: ROUND_3_BROWSER_PROFILE,
      browserService: ROUND_3_BROWSER_SERVICE,
      displayService: ROUND_3_DISPLAY_SERVICE,
      watchdogService: ROUND_3_WATCHDOG_SERVICE,
      cdpEndpoint: ROUND_3_CDP_ENDPOINT,
      sentAt: instant,
    };
    expect(sentReceiptSchema.parse(base).exactEquality).toBe(true);
    expect(() => sentReceiptSchema.parse({ ...base, composerSha256: digest("altered") }))
      .toThrow("ROUND_3_SENT_IDENTITY_MISMATCH");
  });

  it("rejects wrong model, effort, session, personalization, and transport provenance", () => {
    const source = normalizedTextIdentity("packet");
    const runtime = {
      schemaVersion: 1 as const, studyId: ROUND_3_STUDY_ID,
      browserProfile: ROUND_3_BROWSER_PROFILE, browserService: ROUND_3_BROWSER_SERVICE,
      displayService: ROUND_3_DISPLAY_SERVICE, watchdogService: ROUND_3_WATCHDOG_SERVICE,
      cdpEndpoint: ROUND_3_CDP_ENDPOINT, browserMainPid: 123, observed: hashSet, observedAt: instant,
    };
    const receipt: any = {
      schemaVersion: 1, studyId: ROUND_3_STUDY_ID,
      opaqueInputId: "run-000000000000000000000001", attempt: 1, state: "RESPONSE_COMPLETE",
      normalization: "LINE_ENDINGS_TO_LF_ONLY", sourceUtf8Bytes: source.utf8Bytes,
      sourceCodePoints: 6, sourceSha256: source.sha256,
      destinationPacketUtf8Bytes: source.utf8Bytes, destinationPacketCodePoints: 6,
      destinationPacketSha256: source.sha256, composerUtf8Bytes: source.utf8Bytes,
      composerCodePoints: 6, composerSha256: source.sha256, exactEquality: true,
      ui: { schemaVersion: 1, observedAt: instant, origin: "https://chatgpt.com",
        modelVisibleLabel: "GPT-5.6 Sol", reasoningVisibleLabel: "Extra High", reasoningOrdinal: "4 of 5",
        chatMode: "TEMPORARY", personalization: "UNPERSONALIZED", authenticated: true,
        freshConversation: true, userMessageCount: 0, assistantMessageCount: 0,
        attachmentCount: 0, sendEnabled: true },
      vpsDevice: "srv1894948", vpsUser: "cloudbrowser", cdpEndpoint: ROUND_3_CDP_ENDPOINT,
      cdpAttached: true, browser: "Brave", browserProfile: ROUND_3_BROWSER_PROFILE,
      browserService: ROUND_3_BROWSER_SERVICE, displayService: ROUND_3_DISPLAY_SERVICE,
      watchdogService: ROUND_3_WATCHDOG_SERVICE, runtimeAttestation: runtime, tabCount: 1,
      citationUrls: [], toolProvenance: [], responseArtifactSha256: digest("response"),
      verifiedAt: instant, sentAt: instant, completedAt: instant, recoveredExistingSubmission: true,
    };
    expect(generationTransportReceiptSchema.parse(receipt).recoveredExistingSubmission).toBe(true);
    for (const uiDrift of [
      { modelVisibleLabel: "Latest" }, { reasoningVisibleLabel: "High" },
      { chatMode: "NORMAL" }, { personalization: "Personalized" },
    ]) expect(() => generationTransportReceiptSchema.parse({ ...receipt,
      ui: { ...receipt.ui, ...uiDrift } })).toThrow();
  });

  it("requires exact 120-packet transfer coverage and rejects a destination mismatch", () => {
    const records = Array.from({ length: 120 }, (_, index) => {
      const sequence = index + 1;
      const opaqueInputId = `run-${sequence.toString(16).padStart(24, "0")}`;
      return { sequence, opaqueInputId,
        sourceRelativePath: `generation/inputs/${String(sequence).padStart(3, "0")}-${opaqueInputId}.txt`,
        destinationRelativePath: `packets/${String(sequence).padStart(3, "0")}-${opaqueInputId}.txt`,
        expectedSha256: "a".repeat(64), sourceSha256: "a".repeat(64), destinationSha256: "a".repeat(64),
        sourceUtf8Bytes: 167_433, destinationUtf8Bytes: 167_433, eligible: true };
    });
    const receipt = { schemaVersion: 1, studyId: ROUND_3_STUDY_ID, device: "srv1894948",
      user: "cloudbrowser", privateRoot: "/home/cloudbrowser/.local/share/askrigor-mast-round3",
      transferredAt: instant, records };
    expect(vpsPacketTransferReceiptSchema.parse(receipt).records).toHaveLength(120);
    expect(() => vpsPacketTransferReceiptSchema.parse({ ...receipt,
      records: records.map((record, index) => index === 0
        ? { ...record, destinationSha256: "b".repeat(64) } : record) }))
      .toThrow("VPS_PACKET_TRANSFER_IDENTITY_MISMATCH");
  });

  it("freezes the supervised single-tab direct-DOM architecture with no relay, clipboard, or typing", () => {
    const transport = readFileSync(resolve(root, "scripts/mast-vps-cdp-generation-round-3.mjs"), "utf8");
    const braveUnit = readFileSync(resolve(root, "deploy/systemd/askrigor-mast-round3-brave.service"), "utf8");
    const wrapper = readFileSync(resolve(root, "deploy/vps/brave-mast-round3.sh"), "utf8");
    expect(transport).toContain("chromium.connectOverCDP(CDP_ENDPOINT");
    expect(transport).toContain("element.innerText = text");
    expect(transport).toContain("RECOVERY_EXISTING_SUBMISSION");
    expect(transport).toContain("ROUND_3_RECOVERY_CANDIDATE_MULTIPLE");
    expect(transport).toContain("ROUND_3_RUNTIME_SERVICE_NOT_RUNNING");
    expect(transport).toContain("SYNTHETIC_BROWSER_RESTART_NOT_OBSERVED");
    expect(transport).toContain("automaticResendAllowed: false");
    expect(transport).toContain("run-judge-one");
    expect(transport).toContain('model: "Latest", reasoning: "Pro", reasoningOrdinal: "5 of 5"');
    expect(transport).toContain("ROUND_3_JUDGMENT_TRANSPORT_ATTEMPT_CEILING_EXHAUSTED");
    expect(transport).not.toMatch(/wl-copy|xclip|clipboard|cloudflared|trycloudflare|keyboard\.type/iu);
    expect(braveUnit).toContain("Restart=always");
    expect(braveUnit).toContain("User=cloudbrowser");
    expect(wrapper).toContain("--remote-debugging-address=127.0.0.1");
    expect(wrapper).toContain("--remote-debugging-port=9224");
    expect(wrapper).toContain("--restore-last-session");
  });
});
