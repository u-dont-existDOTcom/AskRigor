import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  acceptZeroSpendChatgptSmoke,
  zeroSpendChatgptSmokeReceiptSchema,
} from "../scripts/accept-zero-spend-chatgpt-mast-smoke.mjs";
import type {
  CanonicalDirective,
  ChatWorkPolicy,
} from "../scripts/validate-chat-work-authority-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = JSON.parse(readFileSync(resolve(root, "governance/chat-work-authority-policy.json"), "utf8")) as ChatWorkPolicy;
const directive = JSON.parse(readFileSync(resolve(root, "docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json"), "utf8")) as CanonicalDirective;
const digest = (character: string) => character.repeat(64);

function receipt() {
  return {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_operational_smoke",
    directiveId: "askrigor-zero-spend-chatgpt-mast-operational-smoke-v1",
    repositoryStartHead: "a".repeat(40),
    repositoryEndHead: "b".repeat(40),
    caseFamilyId: "All001",
    deterministicSelectionReceiptSha256: digest("1"),
    packets: {
      bare: { condition: "BARE", packetSha256: digest("2") },
      hrp: { condition: "HRP", packetSha256: digest("3") },
      differenceAuditSha256: digest("4"),
      onlyInstructionConditionAndOpaqueIdentifiersDiffer: true,
    },
    responseChats: [
      {
        chatRole: "RESPONSE",
        condition: "BARE",
        providerSurface: "CHATGPT_CONSUMER",
        modelMode: "EXTRA_HIGH",
        chatLocator: "chatgpt://response/bare",
        sourceMessageId: "message:bare",
        sentAtSource: "2026-09-01T21:00:00Z",
        sentAtSourceStatus: "VERIFIED",
        capturedAt: "2026-09-01T21:00:01Z",
        exactInputSha256: digest("5"),
        exactOutputSha256: digest("6"),
        provenanceStatus: "VERIFIED",
        exactOutputStoredPrivately: true,
      },
      {
        chatRole: "RESPONSE",
        condition: "HRP",
        providerSurface: "CHATGPT_CONSUMER",
        modelMode: "EXTRA_HIGH",
        chatLocator: "chatgpt://response/hrp",
        sourceMessageId: "message:hrp",
        sentAtSource: null,
        sentAtSourceStatus: "UNAVAILABLE",
        capturedAt: "2026-09-01T21:01:01Z",
        exactInputSha256: digest("7"),
        exactOutputSha256: digest("8"),
        provenanceStatus: "OWNER_ATTESTED",
        exactOutputStoredPrivately: true,
      },
    ],
    evaluatorChat: {
      chatRole: "EVALUATOR",
      condition: null,
      providerSurface: "CHATGPT_CONSUMER",
      modelMode: "EXTRA_HIGH",
      chatLocator: "chatgpt://evaluator/001",
      sourceMessageId: "message:evaluator",
      sentAtSource: "2026-09-01T21:02:00Z",
      sentAtSourceStatus: "VERIFIED",
      capturedAt: "2026-09-01T21:02:01Z",
      exactInputSha256: digest("9"),
      exactOutputSha256: digest("a"),
      provenanceStatus: "VERIFIED",
      exactOutputStoredPrivately: true,
    },
    randomization: {
      seed: "seed-001",
      mappingSha256: digest("b"),
      conditionDisclosedBeforeVerdict: false,
    },
    evaluatorOutput: {
      officialRubricLevelScoresPresent: true,
      strongestUncertaintyPresent: true,
      oneCaseOperationalSmokeLimitationPresent: true,
      exactOutputSha256: digest("a"),
    },
    execution: {
      providerApiCredentialsUsed: false,
      paidModelApiCalls: 0,
      totalExternalSpendUsd: 0,
      codexAuthoredScientificInterpretation: false,
      ownerRelayRequested: false,
      ownerSaySendItRequested: false,
      resultsReturnedAutomaticallyToProjectManagerChat: true,
      scaledBeyondOneCaseFamily: false,
      hrpTunedFromResult: false,
      externalSubmissionPerformed: false,
      officialMastClaimMade: false,
      generalHrpEffectClaimMade: false,
    },
    projectManagerReturnReceipt: {
      messageId: "message:project-manager:return",
      chatLocator: "https://chatgpt.com/c/project-manager-chat",
      exactPacketSha256: digest("c"),
      capturedAt: "2026-09-01T21:03:00Z",
      provenanceStatus: "VERIFIED",
    },
    completionClaim: "SUBTASK_COMPLETE_PARENT_OPEN",
  };
}

describe("zero-spend ChatGPT MAST smoke acceptance", () => {
  it("accepts only the exact zero-spend, no-relay, source-bound shape", () => {
    const result = acceptZeroSpendChatgptSmoke(policy, directive, receipt());
    expect(result.status).toBe("ZERO_SPEND_CHATGPT_MAST_SMOKE_ACCEPTED");
    expect(result.completionClaim).toBe("SUBTASK_COMPLETE_PARENT_OPEN");
  });

  it("rejects any paid API call or external spend", () => {
    const candidate = receipt();
    candidate.execution.paidModelApiCalls = 1 as never;
    candidate.execution.totalExternalSpendUsd = 30 as never;
    expect(() => zeroSpendChatgptSmokeReceiptSchema.parse(candidate)).toThrow();
  });

  it("requires exact observed model and thinking effort for continuation families", () => {
    const candidate = receipt();
    candidate.caseFamilyId = "Card001";
    expect(() => acceptZeroSpendChatgptSmoke(policy, directive, candidate)).toThrow(
      /continuation families require exact observed model and thinking effort/,
    );

    for (const chat of [...candidate.responseChats, candidate.evaluatorChat]) {
      Object.assign(chat, {
        modelNameObserved: "GPT-5.6 Sol",
        thinkingEffortObserved: "Extra High",
      });
    }
    expect(acceptZeroSpendChatgptSmoke(policy, directive, candidate).caseFamilyId)
      .toBe("Card001");
  });

  it("rejects an owner relay or say-send-it handback", () => {
    const candidate = receipt();
    candidate.execution.ownerRelayRequested = true as never;
    candidate.execution.ownerSaySendItRequested = true as never;
    expect(() => zeroSpendChatgptSmokeReceiptSchema.parse(candidate)).toThrow();
  });

  it("rejects Codex-authored interpretation or an official HRP claim", () => {
    const candidate = receipt();
    candidate.execution.codexAuthoredScientificInterpretation = true as never;
    candidate.execution.generalHrpEffectClaimMade = true as never;
    expect(() => zeroSpendChatgptSmokeReceiptSchema.parse(candidate)).toThrow();
  });

  it("requires exactly one BARE and one HRP response chat", () => {
    const candidate = receipt();
    candidate.responseChats[1]!.condition = "BARE" as never;
    expect(() => zeroSpendChatgptSmokeReceiptSchema.parse(candidate)).toThrow(/exactly one BARE and one HRP/);
  });

  it("keeps source sent time unavailable rather than laundering capture time", () => {
    const candidate = receipt();
    candidate.responseChats[1]!.sentAtSourceStatus = "UNAVAILABLE";
    candidate.responseChats[1]!.sentAtSource = "2026-09-01T21:01:00Z" as never;
    expect(() => zeroSpendChatgptSmokeReceiptSchema.parse(candidate)).toThrow(/unavailable source time must remain null/);
  });
});
