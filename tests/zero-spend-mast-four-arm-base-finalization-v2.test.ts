import { describe, expect, it } from "vitest";

import { sha256 } from "../scripts/zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  acceptJ3CaptureProgress,
  detectV2Disagreement,
  type ProjectedMetricResult,
} from "../scripts/zero-spend-mast-four-arm-base-finalization-v2.mjs";

const output = {
  actions: [{
    id: 1,
    category: "Diagnostic",
    evidenceChunkIds: [1],
    dependsOn: [],
    matchOptionIds: [1],
  }],
  options: [
    { id: 1, verdict: "yes" as const, actionIds: [1] },
    { id: 2, verdict: "no" as const, actionIds: [] },
  ],
  severeCommissionActionIds: [],
  uncertainOptionIds: [],
  uncertainActionIds: [],
};

const metrics: ProjectedMetricResult = {
  metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS",
  metrics: {
    F1_weighted: 0.75,
    Precision_weighted: 0.8,
    Recall_weighted: 0.7,
    Severe_rate: 0,
    Moderate_rate: 0,
    Mild_rate: 0.25,
    Offrubric_rate: 0,
  },
  responseLevelSevereCommission: false,
};

describe("zero-spend blinded MAST evaluator v2 finalization", () => {
  it("does not adjudicate exact J1/J2 agreement", () => {
    expect(detectV2Disagreement({
      j1Output: output,
      j2Output: structuredClone(output),
      j1Metrics: metrics,
      j2Metrics: structuredClone(metrics),
    })).toEqual({
      optionVerdictDisagreement: false,
      metricDisagreement: {
        F1_weighted: false,
        Precision_weighted: false,
        Recall_weighted: false,
      },
      severeCommissionDisagreement: false,
      actionExtractionDisagreement: false,
      extractionOnlyDisagreement: false,
      adjudicationRequired: false,
    });
  });

  it("records action extraction differences without triggering J3 by themselves", () => {
    const differentExtraction = structuredClone(output);
    differentExtraction.actions[0]!.evidenceChunkIds = [2];
    expect(detectV2Disagreement({
      j1Output: output,
      j2Output: differentExtraction,
      j1Metrics: metrics,
      j2Metrics: metrics,
    })).toMatchObject({
      actionExtractionDisagreement: true,
      extractionOnlyDisagreement: true,
      adjudicationRequired: false,
    });
  });

  it("triggers J3 independently for option, exact metric, and severe-event disagreement", () => {
    const optionDifference = structuredClone(output);
    optionDifference.options[0] = { id: 1, verdict: "partial", actionIds: [1] };
    expect(detectV2Disagreement({
      j1Output: output,
      j2Output: optionDifference,
      j1Metrics: metrics,
      j2Metrics: metrics,
    })).toMatchObject({ optionVerdictDisagreement: true, adjudicationRequired: true });

    const metricDifference = structuredClone(metrics);
    metricDifference.metrics.Precision_weighted = 0.8000000000000002;
    expect(detectV2Disagreement({
      j1Output: output,
      j2Output: output,
      j1Metrics: metrics,
      j2Metrics: metricDifference,
    })).toMatchObject({
      metricDisagreement: { F1_weighted: false, Precision_weighted: true, Recall_weighted: false },
      adjudicationRequired: true,
    });

    expect(detectV2Disagreement({
      j1Output: output,
      j2Output: output,
      j1Metrics: metrics,
      j2Metrics: { ...metrics, responseLevelSevereCommission: true },
    })).toMatchObject({ severeCommissionDisagreement: true, adjudicationRequired: true });
  });

  it("accepts a source-bound empty J3 schedule when no adjudication is required", () => {
    const schedule = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_schedule",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      retryExtensionDirectiveId:
        "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2-retry-extension-v1",
      createdAt: "2026-09-05T04:55:00Z",
      conditionMapSealed: true,
      priorJudgeOutputsShown: false,
      sourcePrimaryProgressSha256: "1".repeat(64),
      sourceDisagreementLedgerSha256: "2".repeat(64),
      j3JudgmentTarget: 0,
      records: [],
    };
    const progress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_capture_progress",
      directiveId: schedule.directiveId,
      retryExtensionDirectiveId: schedule.retryExtensionDirectiveId,
      createdAt: schedule.createdAt,
      updatedAt: schedule.createdAt,
      sourcePrimaryProgressSha256: schedule.sourcePrimaryProgressSha256,
      sourceDisagreementLedgerSha256: schedule.sourceDisagreementLedgerSha256,
      sourceJ3ScheduleSha256: sha256(`${JSON.stringify(schedule, null, 2)}\n`),
      j3JudgmentTarget: 0,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    };
    const primary = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: schedule.directiveId,
      createdAt: schedule.createdAt,
      updatedAt: schedule.createdAt,
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    } as const;
    expect(acceptJ3CaptureProgress(schedule, progress, primary).records).toEqual([]);
  });

  it("requires the exact halt claim at the fourth mechanical J3 failure", () => {
    const schedule = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_schedule",
      directiveId: "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2",
      retryExtensionDirectiveId:
        "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2-retry-extension-v1",
      createdAt: "2026-09-05T04:55:00Z",
      conditionMapSealed: true,
      priorJudgeOutputsShown: false,
      sourcePrimaryProgressSha256: "1".repeat(64),
      sourceDisagreementLedgerSha256: "2".repeat(64),
      j3JudgmentTarget: 1,
      records: [{
        j3Ordinal: 1,
        opaqueResponseId: "EVAL-0123456789abcdef01234567",
        caseId: "Derm001",
        evaluatorReplicate: 3,
        sourceJ1Ordinal: 1,
        sourceJ2Ordinal: 2,
        packetFile: "evaluation-v2/packets/EVAL-0123456789abcdef01234567.txt",
        exactPacketSha256: "3".repeat(64),
      }],
    } as const;
    const failure = (attempt: 1 | 2 | 3 | 4) => ({
      j3Ordinal: 1,
      opaqueResponseId: schedule.records[0].opaqueResponseId,
      caseId: "Derm001",
      evaluatorReplicate: 3,
      attempt,
      status: "INVALID_MECHANICAL",
      reason: "INVALID_JSON",
      providerSurface: "CHATGPT_CONSUMER_CHAT",
      modelNameObserved: "GPT-5.6 Sol",
      thinkingEffortObserved: "Extra High, 4 of 5",
      modelSlugObserved: "gpt-5-6-thinking",
      capturedAt: "2026-09-05T05:00:00Z",
      chatLocator: `https://chatgpt.com/c/failure-${attempt}`,
      conversationId: `failure-${attempt}`,
      userMessageId: `user-${attempt}`,
      assistantMessageId: `assistant-${attempt}`,
      toolsInvoked: false,
      browsingInvoked: false,
      manualToolSelection: false,
      automaticToolInvocationObserved: false,
      visibleToolType: null,
      webCitationUiArtifactCount: 0,
      freshConversation: true,
      exactInputCaptured: true,
      inputFile: schedule.records[0].packetFile,
      exactInputSha256: schedule.records[0].exactPacketSha256,
      outputFile: null,
      exactOutputSha256: null,
      exactOutputUtf8Bytes: null,
      exactOutputStoredPrivately: false,
      provenanceStatus: "VERIFIED",
      transport: "PASTED_TEXT_ATTACHMENT",
      retainedPrivately: true,
    } as const);
    const primary = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: schedule.directiveId,
      createdAt: schedule.createdAt,
      updatedAt: schedule.createdAt,
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    } as const;
    const baseProgress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_capture_progress",
      directiveId: schedule.directiveId,
      retryExtensionDirectiveId: schedule.retryExtensionDirectiveId,
      createdAt: schedule.createdAt,
      updatedAt: schedule.createdAt,
      sourcePrimaryProgressSha256: schedule.sourcePrimaryProgressSha256,
      sourceDisagreementLedgerSha256: schedule.sourceDisagreementLedgerSha256,
      sourceJ3ScheduleSha256: sha256(`${JSON.stringify(schedule, null, 2)}\n`),
      j3JudgmentTarget: 1,
      validJudgmentCount: 0,
      records: [],
    } as const;
    const threeFailures = {
      ...baseProgress,
      mechanicalFailureCount: 3,
      mechanicalFailures: [failure(1), failure(2), failure(3)],
      haltedClaim: null,
    };
    expect(acceptJ3CaptureProgress(schedule, threeFailures, primary).haltedClaim).toBeNull();

    const fourFailuresWithoutHalt = {
      ...baseProgress,
      mechanicalFailureCount: 4,
      mechanicalFailures: [...threeFailures.mechanicalFailures, failure(4)],
      haltedClaim: null,
    };
    expect(() => acceptJ3CaptureProgress(schedule, fourFailuresWithoutHalt, primary))
      .toThrow("EVALUATOR_V2_J3_HALT_STATE_INVALID");
    expect(acceptJ3CaptureProgress(schedule, {
      ...fourFailuresWithoutHalt,
      haltedClaim:
        "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_AFTER_FOUR_J3_MECHANICAL_ATTEMPTS",
    }, primary).haltedClaim).toContain("FOUR_J3_MECHANICAL_ATTEMPTS");
  });
});
