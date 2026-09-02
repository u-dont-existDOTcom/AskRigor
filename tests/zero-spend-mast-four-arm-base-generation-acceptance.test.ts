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
    toolsInvoked: index === 0 || index === 2,
    browsingInvoked: index === 0 || index === 2,
    manualToolSelection: false,
    automaticToolInvocationObserved: index === 0 || index === 2,
    visibleToolType: index === 0 || index === 2 ? "WEB_SEARCH" : null,
    webCitationUiArtifactCount: index === 0 || index === 2 ? 1 : 0,
    freshConversation: true,
    exactInputCaptured: true,
    inputFile: record.inputFile,
    exactInputSha256: record.exactInputSha256,
    outputFile: `outputs/${String(index + 1).padStart(3, "0")}.txt`,
    exactOutputSha256: digest(index + 1000),
    exactOutputUtf8Bytes: 10,
    provenanceStatus: "VERIFIED",
    exactOutputStoredPrivately: true,
    transport: "INLINE",
    modelSlugObserved: "gpt-5-6-thinking",
    eligibility: index === 0 || index === 2
      ? "ELIGIBLE_UNDER_CONSUMER_TOOL_TRANSPORT_AMENDMENT_V1"
      : "ELIGIBLE_UNDER_ORIGINAL_AND_AMENDED_RULES",
    amendmentSha256: digest(997),
  }));
  const originalInvalidMechanicalReceipts = [0, 2].map((index) => ({
    sequence: records[index]!.sequence,
    opaqueInputId: records[index]!.opaqueInputId,
    attempt: 1,
    status: "INVALID_MECHANICAL",
    reason: "TOOL_INVOCATION",
    capturedAt: records[index]!.capturedAt,
    chatLocator: records[index]!.chatLocator,
    conversationId: records[index]!.conversationId,
    userMessageId: records[index]!.userMessageId,
    assistantMessageId: records[index]!.assistantMessageId,
    exactInputSha256: records[index]!.exactInputSha256,
    modelNameObserved: "GPT-5.6 Sol",
    thinkingEffortObserved: "Extra High, 4 of 5",
    modelSlugObserved: "gpt-5-6-thinking",
    webCitationPillCount: 1,
    toolMessageCount: 0,
    outputFile: `outputs/invalid-${String(index + 1).padStart(3, "0")}.txt`,
    exactOutputSha256: records[index]!.exactOutputSha256,
    exactOutputUtf8Bytes: records[index]!.exactOutputUtf8Bytes,
    retainedPrivately: true,
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
      amendmentId:
        "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot-v2-consumer-tool-transport-amendment-v1",
      amendmentSha256: digest(997),
      createdAt: "2026-09-01T23:29:00Z",
      frozenAt: "2026-09-01T23:31:00Z",
      preflightSha256: digest(998),
      dispatchMapSha256: digest(999),
      totalPrimaryFirstPassResponses: 96,
      originalInvalidMechanicalReceiptCount: 2,
      supersededRecoveryAttemptCount: 1,
      rubricsOrGuidanceInspectedBeforeFreeze: false,
      evaluationPerformedBeforeFreeze: false,
      perturbationsGenerated: false,
      clinicalOutputContentInspectedBeforeFreeze: false,
      promptOrProtocolTuned: false,
      ambientToolAvailabilityChangedByExecutor: false,
      records,
      originalInvalidMechanicalReceipts,
      additionalMechanicalFailureReceiptCount: 0,
      additionalMechanicalFailureReceipts: [],
      supersededRecoveryAttempts: [{
        sequence: 1,
        opaqueInputId: records[0]!.opaqueInputId,
        attempt: 2,
        status: "SUPERSEDED_RECOVERY_ATTEMPT",
        reason: "STARTED_UNDER_SUPERSEDED_AUTOMATIC_TOOL_RETRY_RULE",
        excludedFromPrimaryDataset: true,
        capturedAt: "2026-09-01T23:31:30Z",
        chatLocator: "https://chatgpt.com/c/superseded-1",
        conversationId: "superseded-1",
        userMessageId: "superseded-user-1",
        assistantMessageId: "superseded-assistant-1",
        modelNameObserved: "GPT-5.6 Sol",
        thinkingEffortObserved: "Extra High, 4 of 5",
        modelSlugObserved: "gpt-5-6-thinking",
        exactInputSha256: records[0]!.exactInputSha256,
        automaticToolInvocationObserved: true,
        visibleToolType: "WEB_SEARCH",
        webCitationUiArtifactCount: 3,
        manualToolSelection: false,
        outputFile: "outputs/superseded-001.txt",
        exactOutputSha256: digest(2500),
        exactOutputUtf8Bytes: 12,
        retainedPrivately: true,
        amendmentSha256: digest(997),
      }],
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
      completionClaim:
        "FOUR_ARM_EIGHT_FAMILY_BASE_GENERATION_FROZEN_EVALUATION_BLOCKED_PENDING_EVALUATOR_TRANSPORT_DIRECTIVE",
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

  it("rejects manual or inconsistent tools, wrong mode, spend, or pre-freeze evaluation", () => {
    const { ledger } = fixtures();
    ledger.records[0]!.toolsInvoked = true;
    ledger.records[0]!.manualToolSelection = true;
    ledger.records[1]!.thinkingEffortObserved = "Pro, 5 of 5";
    ledger.execution.totalExternalSpendUsd = 1;
    ledger.evaluationPerformedBeforeFreeze = true;
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow();
  });

  it("requires every record to bind the exact corrective amendment", () => {
    const { ledger } = fixtures();
    ledger.records[0]!.amendmentSha256 = digest(996);
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow(
      /record amendment digest does not match the frozen ledger amendment/,
    );
  });

  it("requires tool-dependent responses to identify the transport amendment", () => {
    const { ledger } = fixtures();
    ledger.records[0]!.eligibility = "ELIGIBLE_UNDER_ORIGINAL_AND_AMENDED_RULES";
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow(
      /eligibility must identify whether the response depends on the transport amendment/,
    );
  });

  it("retains any additional genuine mechanical failure receipt", () => {
    const { ledger } = fixtures();
    ledger.additionalMechanicalFailureReceiptCount = 1;
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).toThrow(
      /additional mechanical failure count does not match retained receipts/,
    );
  });

  it("accepts one bounded retry only when its first mechanical failure is retained", () => {
    const { ledger } = fixtures();
    ledger.records[4]!.attempt = 2;
    ledger.additionalMechanicalFailureReceiptCount = 1;
    ledger.additionalMechanicalFailureReceipts = [{
      sequence: ledger.records[4]!.sequence,
      opaqueInputId: ledger.records[4]!.opaqueInputId,
      attempt: 1,
      status: "INVALID_MECHANICAL",
      reason: "PROVIDER_ERROR",
      capturedAt: "2026-09-01T23:30:00Z",
      chatLocator: null,
      conversationId: null,
      userMessageId: null,
      assistantMessageId: null,
      exactInputSha256: ledger.records[4]!.exactInputSha256,
      outputFile: null,
      exactOutputSha256: null,
      exactOutputUtf8Bytes: null,
      retainedPrivately: true,
    }];
    expect(() => fourArmGenerationLedgerSchema.parse(ledger)).not.toThrow();
  });
});
