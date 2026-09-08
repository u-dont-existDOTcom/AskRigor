import { describe, expect, it } from "vitest";

import {
  acceptV2CaptureProgress,
  applyV2RetryExtensionToProgress,
  chunkFrozenResponse,
  parseAndValidateEvaluatorV2Output,
  renderEvaluatorV2TransportExtension,
} from "../scripts/zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const rawResponse = "Order alpha now. Do not start beta.";
const chunks = chunkFrozenResponse(rawResponse);
const rubricValue = {
  id: "Derm001",
  options: [
    { id: 1, score: 9 },
    { id: 2, score: 1 },
  ],
};
const validOutput = {
  actions: [
    {
      id: 1,
      category: "Diagnostic",
      evidenceChunkIds: [1],
      dependsOn: [],
      matchOptionIds: [1],
    },
  ],
  options: [
    { id: 1, verdict: "yes", actionIds: [1] },
    { id: 2, verdict: "no", actionIds: [] },
  ],
  severeCommissionActionIds: [],
  uncertainOptionIds: [],
  uncertainActionIds: [],
};

function validate(value: unknown) {
  return parseAndValidateEvaluatorV2Output({
    rawOutput: JSON.stringify(value),
    rawResponse,
    chunks,
    caseId: "Derm001",
    opaqueResponseId: "EVAL-0123456789abcdef01234567",
    rubricValue,
  });
}

describe("zero-spend blinded MAST evaluator transport v2", () => {
  it("declares canonical source option order independently of concept-grouped display order", () => {
    const extension = renderEvaluatorV2TransportExtension({
      primaryEvaluatorTransportV2: {
        semanticInstructions: "Preserve the evaluator semantics.",
        serializationInstruction: "Return compact JSON.",
      },
      evaluatorOutputSchemaV2: {},
      mechanicalValidationV2: {
        rules: ["options contains every rubric option exactly once in source order."],
      },
    }, [1, 2, 3, 4]);
    expect(extension).toContain("canonical rubric source order");
    expect(extension).toContain("[1,2,3,4]");
  });

  it("chunks by Unicode code point and reconstructs exact frozen bytes", () => {
    const source = `${"a".repeat(159)}🧪${"b".repeat(161)}\n`;
    const observed = chunkFrozenResponse(source);
    expect(observed.map(({ text }) => text).join("")).toBe(source);
    expect(observed.map(({ id }) => id)).toEqual([1, 2, 3]);
    expect(observed.map(({ text }) => Array.from(text).length)).toEqual([160, 160, 2]);
  });

  it("accepts the compact schema and reconstructs source-bound metric input", () => {
    const observed = validate(validOutput);
    expect(observed.output).toEqual(validOutput);
    expect(observed.reconstructedJudgment).toMatchObject({
      caseId: "Derm001",
      opaqueResponseId: "EVAL-0123456789abcdef01234567",
      actions: [{ id: 1, evidence: rawResponse, match: "1" }],
      options: [
        { id: 1, officialScore: 9, matchVerdict: "yes", matchedActionIds: [1] },
        { id: 2, officialScore: 1, matchVerdict: "no", matchedActionIds: [] },
      ],
    });
  });

  it("rejects wrappers, schema drift, invalid chunks, and option omissions", () => {
    expect(() => parseAndValidateEvaluatorV2Output({
      rawOutput: `\`\`\`json\n${JSON.stringify(validOutput)}\n\`\`\``,
      rawResponse,
      chunks,
      caseId: "Derm001",
      opaqueResponseId: "EVAL-0123456789abcdef01234567",
      rubricValue,
    })).toThrow("EVALUATOR_V2_INVALID_JSON");
    expect(() => validate({ ...validOutput, extra: true }))
      .toThrow("EVALUATOR_V2_SCHEMA_KEY_MISMATCH");
    expect(() => validate({
      ...validOutput,
      actions: [{ ...validOutput.actions[0], evidenceChunkIds: [2] }],
    })).toThrow("EVALUATOR_V2_INVALID_CHUNK_REFERENCE");
    expect(() => validate({ ...validOutput, options: validOutput.options.slice(0, 1) }))
      .toThrow("EVALUATOR_V2_INVALID_OPTION_COVERAGE");
  });

  it("rejects broken bidirectional references and severe labels on matched actions", () => {
    expect(() => validate({
      ...validOutput,
      actions: [{ ...validOutput.actions[0], matchOptionIds: [] }],
    })).toThrow("EVALUATOR_V2_INVALID_CROSS_REFERENCE");
    expect(() => validate({ ...validOutput, severeCommissionActionIds: [1] }))
      .toThrow("EVALUATOR_V2_INVALID_SEVERE_COMMISSION_REFERENCE");
  });

  it("accepts an empty fresh v2 progress ledger bound to all 192 slots", () => {
    const records = Array.from({ length: 192 }, (_, index) => ({
      ordinal: index + 1,
      opaqueResponseId: `EVAL-${(index + 1).toString(16).padStart(24, "0")}`,
      caseId: "Derm001",
      evaluatorReplicate: (index % 2) + 1,
      orderDigest: (index + 1).toString(16).padStart(64, "0"),
      packetFile: `evaluation-v2/packets/${index + 1}.txt`,
      exactPacketSha256: (index + 1000).toString(16).padStart(64, "0"),
    }));
    const schedule = {
      schemaVersion: 1,
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      conditionMapSealed: true,
      records,
    };
    const progress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      createdAt: "2026-09-02T19:25:00Z",
      updatedAt: "2026-09-02T19:25:00Z",
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    };
    expect(acceptV2CaptureProgress(schedule, progress).records).toHaveLength(0);
  });

  it("carries 29 valid judgments forward and reopens only ordinal 30 under the four-attempt extension", () => {
    const records = Array.from({ length: 192 }, (_, index) => ({
      ordinal: index + 1,
      opaqueResponseId: `EVAL-${(index + 1).toString(16).padStart(24, "0")}`,
      caseId: "Derm001",
      evaluatorReplicate: ((index % 2) + 1) as 1 | 2,
      orderDigest: (index + 1).toString(16).padStart(64, "0"),
      packetFile: `evaluation-v2/packets/${index + 1}.txt`,
      exactPacketSha256: (index + 1000).toString(16).padStart(64, "0"),
    }));
    const schedule = {
      schemaVersion: 1,
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      conditionMapSealed: true,
      records,
    };
    const common = (ordinal: number, attempt: 1 | 2 | 3 | 4, suffix: string) => ({
      ordinal,
      opaqueResponseId: records[ordinal - 1]!.opaqueResponseId,
      caseId: "Derm001",
      evaluatorReplicate: records[ordinal - 1]!.evaluatorReplicate,
      attempt,
      providerSurface: "CHATGPT_CONSUMER_CHAT",
      modelNameObserved: "GPT-5.6 Sol",
      thinkingEffortObserved: "Extra High, 4 of 5",
      modelSlugObserved: "gpt-5-6-thinking",
      capturedAt: "2026-09-02T22:50:13.871Z",
      chatLocator: `https://chatgpt.com/c/${ordinal}-${attempt}-${suffix}`,
      conversationId: `${ordinal}-${attempt}-${suffix}`,
      userMessageId: `user-${ordinal}-${attempt}-${suffix}`,
      assistantMessageId: `assistant-${ordinal}-${attempt}-${suffix}`,
      toolsInvoked: false,
      browsingInvoked: false,
      manualToolSelection: false,
      automaticToolInvocationObserved: false,
      visibleToolType: null,
      webCitationUiArtifactCount: 0,
      freshConversation: true,
      exactInputCaptured: true,
      inputFile: records[ordinal - 1]!.packetFile,
      exactInputSha256: records[ordinal - 1]!.exactPacketSha256,
      transport: "PASTED_TEXT_ATTACHMENT",
    });
    const valid = (ordinal: number, attempt: 1 | 2 | 3 | 4) => ({
      ...common(ordinal, attempt, "valid"),
      status: "VALID",
      sentAtSource: null,
      sentAtSourceStatus: "UNAVAILABLE",
      provenanceStatus: "VERIFIED",
      outputFile: `evaluation-v2/judgments/${ordinal}-${attempt}.txt`,
      exactOutputSha256: ordinal.toString(16).padStart(64, "0"),
      exactOutputUtf8Bytes: 1,
      exactOutputStoredPrivately: true,
    });
    const invalid = (ordinal: number, attempt: 1 | 2 | 3 | 4, reason: "INVALID_JSON" | "PROVIDER_OR_TRANSPORT_FAILURE") => ({
      ...common(ordinal, attempt, "invalid"),
      status: "INVALID_MECHANICAL",
      reason,
      outputFile: `evaluation-v2/judgments/${ordinal}-${attempt}-invalid.txt`,
      exactOutputSha256: (ordinal + attempt + 500).toString(16).padStart(64, "0"),
      exactOutputUtf8Bytes: 1,
      exactOutputStoredPrivately: true,
      provenanceStatus: "VERIFIED",
      retainedPrivately: true,
    });
    const progress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      createdAt: "2026-09-02T19:25:00Z",
      updatedAt: "2026-09-02T22:50:13.871Z",
      primaryJudgmentTarget: 192,
      validJudgmentCount: 29,
      mechanicalFailureCount: 3,
      records: Array.from({ length: 29 }, (_, index) => valid(index + 1, index + 1 === 19 ? 2 : 1)),
      mechanicalFailures: [
        invalid(19, 1, "PROVIDER_OR_TRANSPORT_FAILURE"),
        invalid(30, 1, "INVALID_JSON"),
        invalid(30, 2, "INVALID_JSON"),
      ],
      haltedClaim: "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_UNRESOLVED_EVALUATOR_SLOT",
    };

    const resumed = applyV2RetryExtensionToProgress(
      schedule,
      progress,
      "2026-09-02T23:04:05Z",
    );

    expect(resumed).toMatchObject({
      validJudgmentCount: 29,
      mechanicalFailureCount: 3,
      haltedClaim: null,
      updatedAt: "2026-09-02T23:04:05Z",
    });
    expect(resumed.records).toEqual(progress.records);
    expect(resumed.mechanicalFailures).toEqual(progress.mechanicalFailures);
    expect(() => acceptV2CaptureProgress(schedule, progress))
      .toThrow("EVALUATOR_V2_HALT_STATE_INVALID");

    const afterAttempt3Failure = {
      ...resumed,
      mechanicalFailureCount: 4,
      mechanicalFailures: [...resumed.mechanicalFailures, invalid(30, 3, "INVALID_JSON")],
    };
    expect(acceptV2CaptureProgress(schedule, afterAttempt3Failure).haltedClaim).toBeNull();

    const afterAttempt4Failure = {
      ...afterAttempt3Failure,
      mechanicalFailureCount: 5,
      mechanicalFailures: [...afterAttempt3Failure.mechanicalFailures, invalid(30, 4, "INVALID_JSON")],
      haltedClaim: "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_AFTER_FOUR_MECHANICAL_ATTEMPTS",
    };
    expect(acceptV2CaptureProgress(schedule, afterAttempt4Failure).haltedClaim)
      .toBe("FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_AFTER_FOUR_MECHANICAL_ATTEMPTS");

    const afterAttempt3Success = {
      ...resumed,
      validJudgmentCount: 30,
      records: [...resumed.records, valid(30, 3)],
    };
    expect(acceptV2CaptureProgress(schedule, afterAttempt3Success).records.at(-1)?.attempt).toBe(3);
  });
});
