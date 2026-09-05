import { describe, expect, it } from "vitest";

import { sha256 } from "../scripts/zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  acceptJ3CaptureProgress,
  detectV2Disagreement,
  latestJ3RootDirectory,
  requireCompleteLatestJ3Series,
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

const latestProgressMetadata = {
  schemaVersion: 2,
  receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_capture_progress",
  sourceBoundRestartDirectiveSha256:
    "8f1c7f4af517060445aaf42498f6efac1ca8abd9460aae02d0295196d8f634f9",
  seriesId: "J3_LATEST_RESTART",
  evaluatorSelectorLabel: "Latest",
  providerModelSlug: null,
  providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
  sourceSupersededInventorySha256:
    "7128b22b65289870c75a5c2cc118f50e6979c4e4bbf8e32da7b38805f2bc71b9",
  executionRepositoryBranch: "task/mast-four-arm-zero-spend-harness-20260901",
  initialExecutionRepositoryCommit: "4".repeat(40),
  latestExecutionRepositoryCommit: "4".repeat(40),
} as const;

const latestReceiptProvenance = (input: {
  ordinal: number;
  opaqueResponseId: string;
  packetSha256: string;
  attempt: 1 | 2 | 3 | 4;
  capturedAt: string;
}) => ({
  series_id: "J3_LATEST_RESTART",
  series_ordinal: input.ordinal,
  frozen_schedule_slot_id:
    `J3-${String(input.ordinal).padStart(3, "0")}:${input.opaqueResponseId}`,
  evaluator_selector_label: "Latest",
  evaluator_reasoning_ui_label_observed: "TEST_MAXIMUM_UI_LABEL",
  provider_model_slug: null,
  provider_model_slug_status: "UNAVAILABLE_NOT_GUESSED",
  consumer_account_continuity_status: "UNCHANGED",
  chat_mode_status: "Chat",
  fresh_conversation_status: "FRESH_ZERO_MESSAGE_AT_SEND",
  physical_tab_reuse_status: "SAME_REUSABLE_PHYSICAL_TAB",
  physical_tab_id: "663931037",
  packet_sha256: input.packetSha256,
  attempt_number: input.attempt,
  attempt_ceiling: 4,
  execution_repository_branch: "task/mast-four-arm-zero-spend-harness-20260901",
  execution_repository_commit: "4".repeat(40),
  local_head_at_record: "4".repeat(40),
  github_head_at_record: "4".repeat(40),
  local_github_head_match: true,
  structural_pre_send_verification_status: "PASSED",
  condition_map_access_status: "SEALED_NOT_INSPECTED",
  clinical_content_inspection_status: "NOT_INSPECTED",
  paid_api_use_status: "ZERO",
  receipt_created_at: input.capturedAt,
  previous_valid_checkpoint_sha256: "5".repeat(64),
  pre_send_receipt_file: `evaluation-v2/j3-latest-restart/pre-send-receipts/${input.ordinal}.json`,
  pre_send_receipt_sha256: "6".repeat(64),
} as const);

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
      ...latestProgressMetadata,
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
    expect(latestJ3RootDirectory).toBe("evaluation-v2/j3-latest-restart");
    expect(() => requireCompleteLatestJ3Series(
      schedule as never,
      acceptJ3CaptureProgress(schedule, progress, primary),
    )).toThrow("EVALUATOR_V2_REQUIRED_J3_LATEST_SERIES_NOT_COMPLETE");
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
      modelNameObserved: "Latest",
      thinkingEffortObserved: "TEST_MAXIMUM_UI_LABEL",
      modelSlugObserved: null,
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
      ...latestReceiptProvenance({
        ordinal: 1,
        opaqueResponseId: schedule.records[0].opaqueResponseId,
        packetSha256: schedule.records[0].exactPacketSha256,
        attempt,
        capturedAt: "2026-09-05T05:00:00Z",
      }),
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
      ...latestProgressMetadata,
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
    expect(() => acceptJ3CaptureProgress(schedule, {
      ...baseProgress,
      mechanicalFailureCount: 1,
      mechanicalFailures: [{ ...failure(1), modelNameObserved: "GPT-5.6 Sol" }],
      haltedClaim: null,
    }, primary)).toThrow();
    expect(() => acceptJ3CaptureProgress(schedule, {
      ...baseProgress,
      mechanicalFailureCount: 1,
      mechanicalFailures: [{
        ...failure(1),
        modelSlugObserved: "gpt-5-6-thinking",
        provider_model_slug: "gpt-5-6-thinking",
      }],
      haltedClaim: null,
    }, primary)).toThrow();

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
