import { describe, expect, it } from "vitest";

import {
  acceptPrimaryCaptureProgress,
  computeOpaqueResponseId,
  createPrimaryEvaluationSchedule,
  parseAndValidateEvaluatorJudgment,
  type Rubric,
} from "../scripts/zero-spend-mast-four-arm-base-evaluation.mjs";

const rubric: Rubric = {
  id: "Derm001",
  options: [
    { id: 1, score: 9 },
    { id: 2, score: 1 },
  ],
};

const rawResponse = "Order alpha now. Do not start beta.";
const digest = (value: number) => value.toString(16).padStart(64, "0");

const validJudgment = {
  caseId: "Derm001",
  opaqueResponseId: "EVAL-0123456789abcdef01234567",
  actions: [
    {
      id: 1,
      action: "Order alpha now",
      category: "Diagnostic",
      evidence: "Order alpha now",
      dependsOn: [],
      match: "1",
    },
    {
      id: 2,
      action: "Do not start beta",
      category: "Medication",
      evidence: "Do not start beta",
      dependsOn: [],
      match: "",
    },
  ],
  options: [
    {
      id: 1,
      officialScore: 9,
      matchVerdict: "yes",
      matchedActionIds: [1],
      evidence: "Order alpha now",
    },
    {
      id: 2,
      officialScore: 1,
      matchVerdict: "no",
      matchedActionIds: [],
      evidence: null,
    },
  ],
  nonRubricSafety: [
    {
      actionId: 2,
      severeCommission: false,
      rationale: "This is an anti-recommendation.",
    },
  ],
  strongestUncertainty: "Whether the qualifier changes the scope.",
};

function validate(value: unknown) {
  return parseAndValidateEvaluatorJudgment({
    rawOutput: JSON.stringify(value),
    caseId: "Derm001",
    opaqueResponseId: "EVAL-0123456789abcdef01234567",
    rubric,
    rawResponse,
  });
}

function progressFixtures() {
  const scheduleRecords = Array.from({ length: 192 }, (_, index) => ({
    ordinal: index + 1,
    opaqueResponseId: `EVAL-${(index + 1).toString(16).padStart(24, "0")}`,
    caseId: "Derm001",
    evaluatorReplicate: (index % 2) + 1,
    orderDigest: digest(index + 1),
    packetFile: `evaluation-v1/packets/${String(index + 1).padStart(3, "0")}.txt`,
    exactPacketSha256: digest(index + 1000),
  }));
  const schedule = {
    schemaVersion: 1,
    directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v1",
    conditionMapSealed: true,
    orderingSeed: "test",
    records: scheduleRecords,
  };
  const progress = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_primary_capture_progress",
    directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v1",
    createdAt: "2026-09-02T18:00:00Z",
    updatedAt: "2026-09-02T18:00:00Z",
    primaryJudgmentTarget: 192,
    validJudgmentCount: 0,
    mechanicalFailureCount: 0,
    records: [] as unknown[],
    mechanicalFailures: [] as unknown[],
    haltedClaim: null as string | null,
  };
  const validRecord = (ordinal: number, attempt: 1 | 2) => {
    const source = scheduleRecords[ordinal - 1]!;
    return {
      ordinal,
      opaqueResponseId: source.opaqueResponseId,
      caseId: source.caseId,
      evaluatorReplicate: source.evaluatorReplicate,
      attempt,
      status: "VALID",
      providerSurface: "CHATGPT_CONSUMER_CHAT",
      modelNameObserved: "GPT-5.6 Sol",
      thinkingEffortObserved: "Extra High, 4 of 5",
      modelSlugObserved: "gpt-5-6-thinking",
      chatLocator: `https://chatgpt.com/c/valid-${ordinal}-${attempt}`,
      conversationId: `valid-${ordinal}-${attempt}`,
      userMessageId: `user-${ordinal}-${attempt}`,
      assistantMessageId: `assistant-${ordinal}-${attempt}`,
      sentAtSource: null,
      sentAtSourceStatus: "UNAVAILABLE",
      capturedAt: "2026-09-02T18:01:00Z",
      toolsInvoked: false,
      browsingInvoked: false,
      manualToolSelection: false,
      automaticToolInvocationObserved: false,
      visibleToolType: null,
      webCitationUiArtifactCount: 0,
      freshConversation: true,
      exactInputCaptured: true,
      inputFile: source.packetFile,
      exactInputSha256: source.exactPacketSha256,
      outputFile: `evaluation-v1/judgments/primary-${ordinal}-${attempt}.json`,
      exactOutputSha256: digest(ordinal + 2000),
      exactOutputUtf8Bytes: 123,
      provenanceStatus: "VERIFIED",
      exactOutputStoredPrivately: true,
      transport: "PASTED_TEXT_ATTACHMENT",
    };
  };
  const failure = (ordinal: number, attempt: 1 | 2) => {
    const source = scheduleRecords[ordinal - 1]!;
    return {
      ordinal,
      opaqueResponseId: source.opaqueResponseId,
      caseId: source.caseId,
      evaluatorReplicate: source.evaluatorReplicate,
      attempt,
      status: "INVALID_MECHANICAL",
      reason: "INVALID_JSON",
      providerSurface: "CHATGPT_CONSUMER_CHAT",
      modelNameObserved: "GPT-5.6 Sol",
      thinkingEffortObserved: "Extra High, 4 of 5",
      modelSlugObserved: "gpt-5-6-thinking",
      capturedAt: "2026-09-02T18:01:00Z",
      chatLocator: `https://chatgpt.com/c/failure-${ordinal}-${attempt}`,
      conversationId: `failure-${ordinal}-${attempt}`,
      userMessageId: `failure-user-${ordinal}-${attempt}`,
      assistantMessageId: `failure-assistant-${ordinal}-${attempt}`,
      toolsInvoked: false,
      browsingInvoked: false,
      manualToolSelection: false,
      automaticToolInvocationObserved: false,
      visibleToolType: null,
      webCitationUiArtifactCount: 0,
      freshConversation: true,
      exactInputCaptured: true,
      inputFile: source.packetFile,
      exactInputSha256: source.exactPacketSha256,
      outputFile: `evaluation-v1/judgments/failure-${ordinal}-${attempt}.txt`,
      exactOutputSha256: digest(ordinal + 3000),
      exactOutputUtf8Bytes: 9,
      exactOutputStoredPrivately: true,
      provenanceStatus: "VERIFIED",
      transport: "PASTED_TEXT_ATTACHMENT",
      retainedPrivately: true,
    };
  };
  return { schedule, progress, validRecord, failure };
}

describe("zero-spend blinded MAST evaluation harness", () => {
  it("derives deterministic opaque response identities without disclosing conditions", () => {
    const outputHash = "a".repeat(64);
    const observed = computeOpaqueResponseId("run-0123456789abcdef01234567", outputHash);
    expect(observed).toMatch(/^EVAL-[a-f0-9]{24}$/u);
    expect(observed).toBe(
      computeOpaqueResponseId("run-0123456789abcdef01234567", outputHash),
    );
    expect(observed).not.toContain("run-");
  });

  it("orders both evaluator replicates by the directive hash rule", () => {
    const records = createPrimaryEvaluationSchedule([
      {
        opaqueResponseId: "EVAL-0123456789abcdef01234567",
        caseId: "Derm001",
        packetFile: "evaluation-v1/packets/a.txt",
        exactPacketSha256: "a".repeat(64),
      },
      {
        opaqueResponseId: "EVAL-89abcdef0123456789abcdef",
        caseId: "Endo002",
        packetFile: "evaluation-v1/packets/b.txt",
        exactPacketSha256: "b".repeat(64),
      },
    ]);

    expect(records).toHaveLength(4);
    expect(records.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3, 4]);
    expect(records.map(({ orderDigest }) => orderDigest)).toEqual(
      [...records.map(({ orderDigest }) => orderDigest)].sort(),
    );
    expect(new Set(records.map(({ opaqueResponseId, evaluatorReplicate }) =>
      `${opaqueResponseId}:J${evaluatorReplicate}`)).size).toBe(4);
  });

  it("accepts complete source-bound and bidirectionally consistent output", () => {
    expect(validate(validJudgment)).toEqual(validJudgment);
  });

  it("rejects non-JSON wrappers, missing options, and altered official scores", () => {
    expect(() => parseAndValidateEvaluatorJudgment({
      rawOutput: `\`\`\`json\n${JSON.stringify(validJudgment)}\n\`\`\``,
      caseId: "Derm001",
      opaqueResponseId: validJudgment.opaqueResponseId,
      rubric,
      rawResponse,
    })).toThrow("EVALUATOR_OUTPUT_INVALID_JSON");
    expect(() => validate({ ...validJudgment, options: validJudgment.options.slice(0, 1) }))
      .toThrow("EVALUATOR_OUTPUT_RUBRIC_ORDER_OR_COVERAGE_INVALID");
    expect(() => validate({
      ...validJudgment,
      options: [
        { ...validJudgment.options[0], officialScore: 8 },
        validJudgment.options[1],
      ],
    })).toThrow("EVALUATOR_OUTPUT_OFFICIAL_SCORE_MISMATCH");
  });

  it("rejects evidence not present in the frozen response and broken cross references", () => {
    expect(() => validate({
      ...validJudgment,
      actions: [{ ...validJudgment.actions[0], evidence: "invented" }, validJudgment.actions[1]],
    })).toThrow("EVALUATOR_OUTPUT_ACTION_EVIDENCE_NOT_SUBSTRING");
    expect(() => validate({
      ...validJudgment,
      actions: [{ ...validJudgment.actions[0], match: "2" }, validJudgment.actions[1]],
    })).toThrow("EVALUATOR_OUTPUT_ACTION_OPTION_CROSS_REFERENCE_INVALID");
  });

  it("requires one safety annotation for every unmatched action", () => {
    expect(() => validate({ ...validJudgment, nonRubricSafety: [] }))
      .toThrow("EVALUATOR_OUTPUT_NONRUBRIC_SAFETY_COVERAGE_INVALID");
  });

  it("accepts only a strict schedule prefix with byte-identical retry history", () => {
    const { schedule, progress, validRecord, failure } = progressFixtures();
    progress.mechanicalFailures.push(failure(1, 1));
    progress.mechanicalFailureCount = 1;
    progress.records.push(validRecord(1, 2));
    progress.validJudgmentCount = 1;
    progress.updatedAt = "2026-09-02T18:02:00Z";

    expect(acceptPrimaryCaptureProgress(schedule, progress).records).toHaveLength(1);
    const invalid = structuredClone(progress);
    (invalid.records[0] as { attempt: number }).attempt = 1;
    expect(() => acceptPrimaryCaptureProgress(schedule, invalid))
      .toThrow("EVALUATION_CAPTURE_ATTEMPT_HISTORY_INVALID");
  });

  it("requires a fail-closed halt after a second invalid attempt", () => {
    const { schedule, progress, failure } = progressFixtures();
    progress.mechanicalFailures.push(failure(1, 1), failure(1, 2));
    progress.mechanicalFailureCount = 2;
    progress.haltedClaim =
      "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_BLOCKED_UNRESOLVED_EVALUATOR_SLOT";

    expect(acceptPrimaryCaptureProgress(schedule, progress).haltedClaim)
      .toBe("FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_BLOCKED_UNRESOLVED_EVALUATOR_SLOT");
    progress.haltedClaim = null;
    expect(() => acceptPrimaryCaptureProgress(schedule, progress))
      .toThrow("EVALUATION_CAPTURE_HALT_STATE_INVALID");
  });

  it("rejects reused conversations and out-of-order valid captures", () => {
    const { schedule, progress, validRecord } = progressFixtures();
    progress.records.push(validRecord(2, 1));
    progress.validJudgmentCount = 1;
    expect(() => acceptPrimaryCaptureProgress(schedule, progress))
      .toThrow("EVALUATION_CAPTURE_PROGRESS_NOT_SCHEDULE_PREFIX");

    const duplicate = progressFixtures();
    const first = duplicate.validRecord(1, 1);
    const second = duplicate.validRecord(2, 1);
    second.conversationId = first.conversationId;
    duplicate.progress.records.push(first, second);
    duplicate.progress.validJudgmentCount = 2;
    expect(() => acceptPrimaryCaptureProgress(duplicate.schedule, duplicate.progress))
      .toThrow("EVALUATION_CAPTURE_PROGRESS_CONVERSATION_REUSED");
  });
});
