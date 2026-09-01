import { describe, expect, it } from "vitest";

import {
  acceptFourArmGenerationRecords,
  fourArmGenerationLedgerSchema,
} from "../scripts/accept-zero-spend-mast-four-arm-base-generation.mjs";

const digest = (value: number) => value.toString(16).padStart(64, "0");

function fixtures() {
  const dispatchRecords = Array.from({ length: 96 }, (_, index) => ({
    sequence: index + 1,
    opaqueInputId: `run-${(index + 1).toString(16).padStart(24, "0")}`,
    familyId: "synthetic",
    trial: 1,
    armId: "A",
    inputFile: `inputs/${String(index + 1).padStart(3, "0")}.txt`,
    exactInputSha256: digest(index + 1),
    exactInputUtf8Bytes: 1,
  }));
  const records = dispatchRecords.map((record, index) => ({
    sequence: record.sequence,
    opaqueInputId: record.opaqueInputId,
    attempt: 1,
    status: "VALID",
    providerSurface: "CHATGPT_CONSUMER_CHAT",
    modelNameObserved: "GPT-5.6 Sol",
    thinkingEffortObserved: "Extra High, 4 of 5",
    chatLocator: `https://chatgpt.com/c/chat-${index + 1}`,
    conversationId: `conversation-${index + 1}`,
    userMessageId: `user-${index + 1}`,
    assistantMessageId: `assistant-${index + 1}`,
    sentAtSource: null,
    sentAtSourceStatus: "UNAVAILABLE",
    capturedAt: "2026-09-01T23:30:00Z",
    toolsInvoked: false,
    browsingInvoked: false,
    freshConversation: true,
    exactInputCaptured: true,
    inputFile: record.inputFile,
    exactInputSha256: record.exactInputSha256,
    outputFile: `outputs/${String(index + 1).padStart(3, "0")}.txt`,
    exactOutputSha256: digest(index + 1000),
    exactOutputUtf8Bytes: 10,
    provenanceStatus: "VERIFIED",
    exactOutputStoredPrivately: true,
  }));
  return {
    dispatchMap: {
      schemaVersion: 1,
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2",
      records: dispatchRecords,
    },
    ledger: {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_generation",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2",
      createdAt: "2026-09-01T23:29:00Z",
      frozenAt: "2026-09-01T23:31:00Z",
      preflightSha256: digest(998),
      dispatchMapSha256: digest(999),
      totalValidResponses: 96,
      invalidMechanicalAttemptCount: 0,
      rubricsOrGuidanceInspectedBeforeFreeze: false,
      evaluationPerformedBeforeFreeze: false,
      perturbationsGenerated: false,
      records,
      invalidMechanicalAttempts: [],
      execution: {
        providerApiCredentialsUsed: false,
        paidModelApiCalls: 0,
        totalExternalSpendUsd: 0,
        codexAuthoredScientificInterpretation: false,
        ownerRelayRequested: false,
        ownerSaySendItRequested: false,
        officialMastClaimMade: false,
        generalHrpEffectClaimMade: false,
      },
      completionClaim: "BASE_PILOT_PARENT_OPEN",
    },
  };
}

describe("four-arm base-generation acceptance", () => {
  it("accepts exactly 96 unique source-bound zero-spend response records", () => {
    const { dispatchMap, ledger } = fixtures();
    expect(acceptFourArmGenerationRecords(dispatchMap, ledger).records).toHaveLength(96);
  });

  it("rejects a dispatch mismatch", () => {
    const { dispatchMap, ledger } = fixtures();
    ledger.records[4]!.exactInputSha256 = digest(777);
    expect(() => acceptFourArmGenerationRecords(dispatchMap, ledger)).toThrow(
      /FOUR_ARM_GENERATION_DISPATCH_MISMATCH/,
    );
  });

  it("rejects reused chats or message identities", () => {
    const { dispatchMap, ledger } = fixtures();
    ledger.records[1]!.chatLocator = ledger.records[0]!.chatLocator;
    expect(() => acceptFourArmGenerationRecords(dispatchMap, ledger)).toThrow(
      /FOUR_ARM_GENERATION_CHAT_LOCATOR_NOT_UNIQUE/,
    );
  });

  it("rejects tools, wrong mode, spend, or pre-freeze evaluation", () => {
    const { ledger } = fixtures();
    ledger.records[0]!.toolsInvoked = true;
    ledger.records[1]!.thinkingEffortObserved = "Pro, 5 of 5";
    ledger.execution.totalExternalSpendUsd = 1;
    ledger.evaluationPerformedBeforeFreeze = true;
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow();
  });

  it("requires every invalid mechanical attempt to remain in the ledger", () => {
    const { ledger } = fixtures();
    ledger.invalidMechanicalAttemptCount = 1;
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow(
      /invalid attempt count does not match retained attempt records/,
    );
  });
});
