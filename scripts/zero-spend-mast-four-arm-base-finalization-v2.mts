import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import { acceptArtifactRoot } from "./accept-zero-spend-mast-four-arm-base-generation.mjs";
import {
  computeJudgmentMetrics,
  evaluatorFamilies,
  sha256,
  sourceCommit,
  sourceTree,
} from "./zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  acceptV2CaptureProgress,
  evaluatorV2Directory,
  evaluatorV2DirectiveId,
  evaluatorV2RetryExtensionDirectiveId,
  readValidatedEvaluatorV2OutputFile,
  type EvaluatorV2Output,
  type V2CaptureProgress,
} from "./zero-spend-mast-four-arm-base-evaluation-v2.mjs";

const execFileAsync = promisify(execFile);
const digestPattern = /^[a-f0-9]{64}$/u;
const opaquePattern = /^EVAL-[a-f0-9]{24}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const relativeFileSchema = z.string().min(1).refine(
  (value) => !isAbsolute(value) && !value.split("/").includes(".."),
  "private artifact path must be relative and contained",
);
const digestSchema = z.string().regex(digestPattern);
const timestampSchema = z.string().regex(timestampPattern);
const j3RootDirectory = `${evaluatorV2Directory}/j3`;
const finalRootDirectory = `${evaluatorV2Directory}/final`;
const j3HaltClaim =
  "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_AFTER_FOUR_J3_MECHANICAL_ATTEMPTS";
const completionClaim =
  "FOUR_ARM_EIGHT_FAMILY_BASE_BLINDED_EVALUATION_FROZEN_UNBLINDING_BLOCKED_PENDING_PROJECT_MANAGER_REVIEW";

type JsonObject = Record<string, unknown>;
type MetricName = "F1_weighted" | "Precision_weighted" | "Recall_weighted";
type MetricValue = number | null;
export type ProjectedMetricResult = {
  metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS";
  metrics: {
    F1_weighted: MetricValue;
    Precision_weighted: MetricValue;
    Recall_weighted: MetricValue;
    Severe_rate: MetricValue;
    Moderate_rate: MetricValue;
    Mild_rate: MetricValue;
    Offrubric_rate: MetricValue;
  };
  responseLevelSevereCommission: boolean;
};

const metricNames = ["F1_weighted", "Precision_weighted", "Recall_weighted"] as const;
const allMetricNames = [
  ...metricNames,
  "Severe_rate",
  "Moderate_rate",
  "Mild_rate",
  "Offrubric_rate",
] as const;

const metricValueSchema = z.number().finite().nullable();
const projectedMetricSchema = z.object({
  metricLabel: z.literal("NONOFFICIAL_PROJECTED_MAST_METRICS"),
  metrics: z.object(Object.fromEntries(
    allMetricNames.map((name) => [name, metricValueSchema]),
  ) as Record<(typeof allMetricNames)[number], typeof metricValueSchema>).strict(),
  responseLevelSevereCommission: z.boolean(),
}).strict();

const primaryScheduleRecordSchema = z.object({
  ordinal: z.number().int().min(1).max(192),
  opaqueResponseId: z.string().regex(opaquePattern),
  caseId: z.enum(evaluatorFamilies),
  evaluatorReplicate: z.union([z.literal(1), z.literal(2)]),
  orderDigest: digestSchema,
  packetFile: relativeFileSchema,
  exactPacketSha256: digestSchema,
}).strict();

const primaryScheduleSchema = z.object({
  schemaVersion: z.literal(1),
  directiveId: z.literal(evaluatorV2DirectiveId),
  conditionMapSealed: z.literal(true),
  reusedExactV1Order: z.literal(true),
  v1ScheduleSha256: digestSchema,
  records: z.array(primaryScheduleRecordSchema).length(192),
}).strict();

export type PrimaryScheduleRecordV2 = z.infer<typeof primaryScheduleRecordSchema>;

export type V2Disagreement = {
  optionVerdictDisagreement: boolean;
  metricDisagreement: Record<MetricName, boolean>;
  severeCommissionDisagreement: boolean;
  actionExtractionDisagreement: boolean;
  extractionOnlyDisagreement: boolean;
  adjudicationRequired: boolean;
};

const j3ScheduleRecordSchema = z.object({
  j3Ordinal: z.number().int().positive(),
  opaqueResponseId: z.string().regex(opaquePattern),
  caseId: z.enum(evaluatorFamilies),
  evaluatorReplicate: z.literal(3),
  sourceJ1Ordinal: z.number().int().min(1).max(192),
  sourceJ2Ordinal: z.number().int().min(1).max(192),
  packetFile: relativeFileSchema,
  exactPacketSha256: digestSchema,
}).strict();

const j3ScheduleSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_schedule"),
  directiveId: z.literal(evaluatorV2DirectiveId),
  retryExtensionDirectiveId: z.literal(evaluatorV2RetryExtensionDirectiveId),
  createdAt: timestampSchema,
  conditionMapSealed: z.literal(true),
  priorJudgeOutputsShown: z.literal(false),
  sourcePrimaryProgressSha256: digestSchema,
  sourceDisagreementLedgerSha256: digestSchema,
  j3JudgmentTarget: z.number().int().min(0).max(96),
  records: z.array(j3ScheduleRecordSchema).max(96),
}).strict();

export type J3Schedule = z.infer<typeof j3ScheduleSchema>;

const commonJ3Identity = {
  j3Ordinal: z.number().int().positive(),
  opaqueResponseId: z.string().regex(opaquePattern),
  caseId: z.enum(evaluatorFamilies),
  evaluatorReplicate: z.literal(3),
  attempt: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
};

const transportShape = {
  providerSurface: z.literal("CHATGPT_CONSUMER_CHAT"),
  modelNameObserved: z.literal("GPT-5.6 Sol"),
  thinkingEffortObserved: z.literal("Extra High, 4 of 5"),
  modelSlugObserved: z.literal("gpt-5-6-thinking"),
  chatLocator: z.string().url(),
  conversationId: z.string().min(1),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
  sentAtSource: timestampSchema.nullable(),
  sentAtSourceStatus: z.enum(["VERIFIED", "UNAVAILABLE"]),
  capturedAt: timestampSchema,
  toolsInvoked: z.boolean(),
  browsingInvoked: z.boolean(),
  manualToolSelection: z.literal(false),
  automaticToolInvocationObserved: z.boolean(),
  visibleToolType: z.literal("WEB_SEARCH").nullable(),
  webCitationUiArtifactCount: z.number().int().min(0),
  freshConversation: z.literal(true),
  exactInputCaptured: z.literal(true),
  inputFile: relativeFileSchema,
  exactInputSha256: digestSchema,
  provenanceStatus: z.literal("VERIFIED"),
  transport: z.literal("PASTED_TEXT_ATTACHMENT"),
};

function validateToolMeasures(
  record: {
    toolsInvoked: boolean;
    browsingInvoked: boolean;
    automaticToolInvocationObserved: boolean;
    visibleToolType: "WEB_SEARCH" | null;
    webCitationUiArtifactCount: number;
  },
  context: z.RefinementCtx,
): void {
  if (record.toolsInvoked !== record.automaticToolInvocationObserved
    || record.browsingInvoked !== record.automaticToolInvocationObserved
    || (record.visibleToolType !== null && !record.automaticToolInvocationObserved)
    || (record.webCitationUiArtifactCount > 0 && !record.automaticToolInvocationObserved)) {
    context.addIssue({ code: "custom", message: "tool process measures are inconsistent" });
  }
}

const validJ3CaptureSchema = z.object({
  ...commonJ3Identity,
  status: z.literal("VALID"),
  ...transportShape,
  outputFile: relativeFileSchema,
  exactOutputSha256: digestSchema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  exactOutputStoredPrivately: z.literal(true),
}).strict().superRefine((record, context) => {
  if ((record.sentAtSourceStatus === "VERIFIED") !== (record.sentAtSource !== null)) {
    context.addIssue({ code: "custom", path: ["sentAtSource"], message: "source time is inconsistent" });
  }
  validateToolMeasures(record, context);
});

const j3FailureReasons = [
  "PROVIDER_OR_TRANSPORT_FAILURE",
  "EMPTY_RESPONSE",
  "TRUNCATED_RESPONSE",
  "WRONG_MODEL",
  "WRONG_REASONING_MODE",
  "DIRTY_OR_REUSED_CONVERSATION",
  "INVALID_JSON",
  "SCHEMA_KEY_MISMATCH",
  "INVALID_OPTION_COVERAGE",
  "INVALID_CROSS_REFERENCE",
  "INVALID_CHUNK_REFERENCE",
] as const;

const failedJ3CaptureSchema = z.object({
  ...commonJ3Identity,
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.enum(j3FailureReasons),
  providerSurface: z.literal("CHATGPT_CONSUMER_CHAT"),
  modelNameObserved: z.string().min(1),
  thinkingEffortObserved: z.string().min(1),
  modelSlugObserved: z.string().min(1).nullable(),
  capturedAt: timestampSchema,
  chatLocator: z.string().url().nullable(),
  conversationId: z.string().min(1).nullable(),
  userMessageId: z.string().min(1).nullable(),
  assistantMessageId: z.string().min(1).nullable(),
  toolsInvoked: z.boolean(),
  browsingInvoked: z.boolean(),
  manualToolSelection: z.literal(false),
  automaticToolInvocationObserved: z.boolean(),
  visibleToolType: z.literal("WEB_SEARCH").nullable(),
  webCitationUiArtifactCount: z.number().int().min(0),
  freshConversation: z.literal(true),
  exactInputCaptured: z.literal(true),
  inputFile: relativeFileSchema,
  exactInputSha256: digestSchema,
  outputFile: relativeFileSchema.nullable(),
  exactOutputSha256: digestSchema.nullable(),
  exactOutputUtf8Bytes: z.number().int().nonnegative().nullable(),
  exactOutputStoredPrivately: z.boolean(),
  provenanceStatus: z.enum(["VERIFIED", "PARTIAL"]),
  transport: z.literal("PASTED_TEXT_ATTACHMENT"),
  retainedPrivately: z.literal(true),
}).strict().superRefine((record, context) => {
  const outputs = [record.outputFile, record.exactOutputSha256, record.exactOutputUtf8Bytes];
  if (outputs.some((value) => value === null) && !outputs.every((value) => value === null)) {
    context.addIssue({ code: "custom", path: ["outputFile"], message: "output provenance is incomplete" });
  }
  if (record.exactOutputStoredPrivately !== (record.outputFile !== null)) {
    context.addIssue({
      code: "custom",
      path: ["exactOutputStoredPrivately"],
      message: "output storage flag is inconsistent",
    });
  }
  validateToolMeasures(record, context);
});

const j3CaptureProgressSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_capture_progress"),
  directiveId: z.literal(evaluatorV2DirectiveId),
  retryExtensionDirectiveId: z.literal(evaluatorV2RetryExtensionDirectiveId),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  sourcePrimaryProgressSha256: digestSchema,
  sourceDisagreementLedgerSha256: digestSchema,
  sourceJ3ScheduleSha256: digestSchema,
  j3JudgmentTarget: z.number().int().min(0).max(96),
  validJudgmentCount: z.number().int().min(0).max(96),
  mechanicalFailureCount: z.number().int().min(0).max(384),
  records: z.array(validJ3CaptureSchema).max(96),
  mechanicalFailures: z.array(failedJ3CaptureSchema).max(384),
  haltedClaim: z.literal(j3HaltClaim).nullable(),
}).strict();

export type J3CaptureProgress = z.infer<typeof j3CaptureProgressSchema>;
export type ValidJ3Capture = z.infer<typeof validJ3CaptureSchema>;

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writePrivate(path: string, bytes: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
}

async function assertPrivateFile(
  artifactRootInput: string,
  file: string,
  expectedSha: string,
  expectedBytes: number,
): Promise<string> {
  const artifactRoot = await realpath(artifactRootInput);
  const path = await realpath(resolve(artifactRoot, file));
  const rel = relative(artifactRoot, path);
  const info = await lstat(path);
  if (rel.startsWith("..") || isAbsolute(rel) || !info.isFile()
    || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    throw new Error("EVALUATOR_V2_PRIVATE_FILE_INVALID");
  }
  const value = await readFile(path, "utf8");
  if (sha256(value) !== expectedSha || Buffer.byteLength(value, "utf8") !== expectedBytes) {
    throw new Error("EVALUATOR_V2_PRIVATE_FILE_IDENTITY_MISMATCH");
  }
  return value;
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return result.stdout.trim();
}

async function validatePinnedMastRoot(mastRoot: string): Promise<void> {
  const [head, tree] = await Promise.all([
    gitText(mastRoot, "rev-parse", "HEAD"),
    gitText(mastRoot, "rev-parse", "HEAD^{tree}"),
  ]);
  if (head !== sourceCommit || tree !== sourceTree) {
    throw new Error("EVALUATOR_V2_PINNED_MAST_SOURCE_MISMATCH");
  }
}

function exactMetricDifference(left: MetricValue, right: MetricValue): boolean {
  return !Object.is(left, right);
}

export function detectV2Disagreement(input: {
  j1Output: EvaluatorV2Output;
  j2Output: EvaluatorV2Output;
  j1Metrics: ProjectedMetricResult;
  j2Metrics: ProjectedMetricResult;
}): V2Disagreement {
  const j1Options = input.j1Output.options;
  const j2Options = input.j2Output.options;
  if (j1Options.length !== j2Options.length
    || j1Options.some((option, index) => option.id !== j2Options[index]?.id)) {
    throw new Error("EVALUATOR_V2_PAIR_OPTION_IDENTITY_MISMATCH");
  }
  const optionVerdictDisagreement = j1Options.some(
    (option, index) => option.verdict !== j2Options[index]!.verdict,
  );
  const metricDisagreement = Object.fromEntries(metricNames.map((name) => [
    name,
    exactMetricDifference(input.j1Metrics.metrics[name], input.j2Metrics.metrics[name]),
  ])) as Record<MetricName, boolean>;
  const severeCommissionDisagreement =
    input.j1Metrics.responseLevelSevereCommission !== input.j2Metrics.responseLevelSevereCommission;
  const actionExtractionDisagreement =
    JSON.stringify(input.j1Output.actions) !== JSON.stringify(input.j2Output.actions);
  const adjudicationRequired = optionVerdictDisagreement
    || Object.values(metricDisagreement).some(Boolean)
    || severeCommissionDisagreement;
  return {
    optionVerdictDisagreement,
    metricDisagreement,
    severeCommissionDisagreement,
    actionExtractionDisagreement,
    extractionOnlyDisagreement: actionExtractionDisagreement && !adjudicationRequired,
    adjudicationRequired,
  };
}

function sameJ3Slot(
  record: { j3Ordinal: number; opaqueResponseId: string; caseId: string; evaluatorReplicate: number },
  expected: z.infer<typeof j3ScheduleRecordSchema>,
): boolean {
  return record.j3Ordinal === expected.j3Ordinal
    && record.opaqueResponseId === expected.opaqueResponseId
    && record.caseId === expected.caseId
    && record.evaluatorReplicate === 3;
}

export function acceptJ3CaptureProgress(
  scheduleValue: unknown,
  progressValue: unknown,
  primaryProgress: V2CaptureProgress,
): J3CaptureProgress {
  const schedule = j3ScheduleSchema.parse(scheduleValue);
  const progress = j3CaptureProgressSchema.parse(progressValue);
  if (schedule.records.length !== schedule.j3JudgmentTarget
    || schedule.records.some(({ j3Ordinal }, index) => j3Ordinal !== index + 1)
    || new Set(schedule.records.map(({ opaqueResponseId }) => opaqueResponseId)).size !== schedule.records.length) {
    throw new Error("EVALUATOR_V2_J3_SCHEDULE_INVALID");
  }
  if (progress.j3JudgmentTarget !== schedule.j3JudgmentTarget
    || progress.validJudgmentCount !== progress.records.length
    || progress.mechanicalFailureCount !== progress.mechanicalFailures.length
    || progress.sourcePrimaryProgressSha256 !== schedule.sourcePrimaryProgressSha256
    || progress.sourceDisagreementLedgerSha256 !== schedule.sourceDisagreementLedgerSha256) {
    throw new Error("EVALUATOR_V2_J3_PROGRESS_COUNT_OR_SOURCE_MISMATCH");
  }
  const scheduleSha = sha256(jsonBytes(schedule));
  if (progress.sourceJ3ScheduleSha256 !== scheduleSha) {
    throw new Error("EVALUATOR_V2_J3_PROGRESS_SCHEDULE_MISMATCH");
  }
  const failuresByOrdinal = new Map<number, z.infer<typeof failedJ3CaptureSchema>[]>();
  for (const failure of progress.mechanicalFailures) {
    const expected = schedule.records[failure.j3Ordinal - 1];
    if (!expected || !sameJ3Slot(failure, expected)
      || failure.inputFile !== expected.packetFile
      || failure.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_J3_FAILURE_SLOT_MISMATCH");
    }
    const failures = failuresByOrdinal.get(failure.j3Ordinal) ?? [];
    if (failure.attempt !== failures.length + 1 || failure.attempt > 4) {
      throw new Error("EVALUATOR_V2_J3_FAILURE_ATTEMPT_ORDER_INVALID");
    }
    failures.push(failure);
    failuresByOrdinal.set(failure.j3Ordinal, failures);
  }
  for (const [index, record] of progress.records.entries()) {
    const expected = schedule.records[index];
    const failures = failuresByOrdinal.get(index + 1) ?? [];
    if (!expected || !sameJ3Slot(record, expected)
      || record.attempt !== failures.length + 1
      || record.inputFile !== expected.packetFile
      || record.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_J3_VALID_RECORD_ORDER_INVALID");
    }
  }
  const conversations = [
    ...primaryProgress.records.map(({ conversationId }) => conversationId),
    ...primaryProgress.mechanicalFailures.map(({ conversationId }) => conversationId).filter((value) => value !== null),
    ...progress.records.map(({ conversationId }) => conversationId),
    ...progress.mechanicalFailures.map(({ conversationId }) => conversationId).filter((value) => value !== null),
  ];
  if (new Set(conversations).size !== conversations.length) {
    throw new Error("EVALUATOR_V2_J3_CONVERSATION_REUSE_DETECTED");
  }
  const nextOrdinal = progress.records.length + 1;
  const nextFailureCount = (failuresByOrdinal.get(nextOrdinal) ?? []).length;
  const shouldHalt = progress.records.length < schedule.records.length && nextFailureCount === 4;
  if ((progress.haltedClaim === j3HaltClaim) !== shouldHalt) {
    throw new Error("EVALUATOR_V2_J3_HALT_STATE_INVALID");
  }
  return progress;
}

async function loadPrimaryState(artifactRoot: string): Promise<{
  schedule: z.infer<typeof primaryScheduleSchema>;
  progress: V2CaptureProgress;
  scheduleBytes: string;
  progressBytes: string;
}> {
  const schedulePath = resolve(artifactRoot, evaluatorV2Directory, "primary-evaluation-schedule.json");
  const progressPath = resolve(artifactRoot, evaluatorV2Directory, "primary-capture-progress.json");
  const [scheduleBytes, progressBytes] = await Promise.all([
    readFile(schedulePath, "utf8"),
    readFile(progressPath, "utf8"),
  ]);
  const schedule = primaryScheduleSchema.parse(JSON.parse(scheduleBytes));
  const progress = acceptV2CaptureProgress(schedule, JSON.parse(progressBytes));
  if (progress.records.length !== 192 || progress.validJudgmentCount !== 192
    || progress.haltedClaim !== null) {
    throw new Error("EVALUATOR_V2_PRIMARY_NOT_FROZEN");
  }
  return { schedule, progress, scheduleBytes, progressBytes };
}

async function validatedPrimaryRecord(input: {
  mastRoot: string;
  artifactRoot: string;
  record: V2CaptureProgress["records"][number];
}): Promise<Awaited<ReturnType<typeof readValidatedEvaluatorV2OutputFile>>> {
  const validated = await readValidatedEvaluatorV2OutputFile({
    mastRoot: input.mastRoot,
    artifactRoot: input.artifactRoot,
    opaqueResponseId: input.record.opaqueResponseId,
    outputFile: input.record.outputFile,
  });
  if (validated.caseId !== input.record.caseId
    || validated.exactOutputSha256 !== input.record.exactOutputSha256
    || validated.exactOutputUtf8Bytes !== input.record.exactOutputUtf8Bytes) {
    throw new Error("EVALUATOR_V2_PRIMARY_OUTPUT_RECEIPT_MISMATCH");
  }
  return validated;
}

export async function prepareV2J3Artifacts(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
}): Promise<{
  status: "EVALUATOR_V2_J3_SCHEDULE_FROZEN";
  j3JudgmentTarget: number;
  disagreementLedgerSha256: string;
  j3ScheduleSha256: string;
  j3ProgressSha256: string;
  conditionMapSealed: true;
}> {
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    validatePinnedMastRoot(mastRoot),
  ]);
  const finalRoot = resolve(artifactRoot, j3RootDirectory);
  try {
    await stat(finalRoot);
    throw new Error("EVALUATOR_V2_J3_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const primary = await loadPrimaryState(artifactRoot);
  const recordByOrdinal = new Map(primary.progress.records.map((record) => [record.ordinal, record]));
  const scheduleByOpaque = new Map<string, PrimaryScheduleRecordV2[]>();
  for (const record of primary.schedule.records) {
    const group = scheduleByOpaque.get(record.opaqueResponseId) ?? [];
    group.push(record);
    scheduleByOpaque.set(record.opaqueResponseId, group);
  }
  if (scheduleByOpaque.size !== 96 || [...scheduleByOpaque.values()].some((group) =>
    group.length !== 2 || new Set(group.map(({ evaluatorReplicate }) => evaluatorReplicate)).size !== 2)) {
    throw new Error("EVALUATOR_V2_PRIMARY_PAIRING_INVALID");
  }

  const preparedAt = new Date().toISOString();
  const disagreementRecords = [];
  const pendingJ3Records = [];
  const orderedPairs = [...scheduleByOpaque.values()].sort((left, right) =>
    Math.min(...left.map(({ ordinal }) => ordinal)) - Math.min(...right.map(({ ordinal }) => ordinal)));
  for (const pair of orderedPairs) {
    const j1Slot = pair.find(({ evaluatorReplicate }) => evaluatorReplicate === 1)!;
    const j2Slot = pair.find(({ evaluatorReplicate }) => evaluatorReplicate === 2)!;
    if (j1Slot.caseId !== j2Slot.caseId
      || j1Slot.packetFile !== j2Slot.packetFile
      || j1Slot.exactPacketSha256 !== j2Slot.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_PRIMARY_PAIR_SOURCE_MISMATCH");
    }
    const j1Record = recordByOrdinal.get(j1Slot.ordinal)!;
    const j2Record = recordByOrdinal.get(j2Slot.ordinal)!;
    const [j1, j2] = await Promise.all([
      validatedPrimaryRecord({ mastRoot, artifactRoot, record: j1Record }),
      validatedPrimaryRecord({ mastRoot, artifactRoot, record: j2Record }),
    ]);
    const [j1Metrics, j2Metrics] = await Promise.all([
      computeJudgmentMetrics({
        repositoryRoot,
        mastRoot,
        familyId: j1Slot.caseId,
        judgment: j1.reconstructedJudgment,
      }),
      computeJudgmentMetrics({
        repositoryRoot,
        mastRoot,
        familyId: j2Slot.caseId,
        judgment: j2.reconstructedJudgment,
      }),
    ]).then((values) => values.map((value) => projectedMetricSchema.parse(value)) as [
      ProjectedMetricResult,
      ProjectedMetricResult,
    ]);
    const disagreement = detectV2Disagreement({
      j1Output: j1.output,
      j2Output: j2.output,
      j1Metrics,
      j2Metrics,
    });
    disagreementRecords.push({
      opaqueResponseId: j1Slot.opaqueResponseId,
      caseId: j1Slot.caseId,
      j1Ordinal: j1Slot.ordinal,
      j2Ordinal: j2Slot.ordinal,
      j1OutputSha256: j1.exactOutputSha256,
      j2OutputSha256: j2.exactOutputSha256,
      ...disagreement,
    });
    if (disagreement.adjudicationRequired) {
      pendingJ3Records.push({
        j3Ordinal: pendingJ3Records.length + 1,
        opaqueResponseId: j1Slot.opaqueResponseId,
        caseId: j1Slot.caseId,
        evaluatorReplicate: 3,
        sourceJ1Ordinal: j1Slot.ordinal,
        sourceJ2Ordinal: j2Slot.ordinal,
        packetFile: j1Slot.packetFile,
        exactPacketSha256: j1Slot.exactPacketSha256,
      });
    }
  }

  const counts = {
    responsePairs: disagreementRecords.length,
    optionVerdict: disagreementRecords.filter(({ optionVerdictDisagreement }) => optionVerdictDisagreement).length,
    F1_weighted: disagreementRecords.filter(({ metricDisagreement }) => metricDisagreement.F1_weighted).length,
    Precision_weighted: disagreementRecords.filter(({ metricDisagreement }) => metricDisagreement.Precision_weighted).length,
    Recall_weighted: disagreementRecords.filter(({ metricDisagreement }) => metricDisagreement.Recall_weighted).length,
    responseLevelSevereCommission: disagreementRecords.filter(
      ({ severeCommissionDisagreement }) => severeCommissionDisagreement,
    ).length,
    actionExtraction: disagreementRecords.filter(
      ({ actionExtractionDisagreement }) => actionExtractionDisagreement,
    ).length,
    extractionOnly: disagreementRecords.filter(
      ({ extractionOnlyDisagreement }) => extractionOnlyDisagreement,
    ).length,
    adjudicationRequired: pendingJ3Records.length,
  };
  const primaryProgressSha256 = sha256(primary.progressBytes);
  const disagreementLedger = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j1_j2_disagreement_ledger",
    directiveId: evaluatorV2DirectiveId,
    createdAt: preparedAt,
    conditionMapSealed: true,
    sourcePrimaryScheduleSha256: sha256(primary.scheduleBytes),
    sourcePrimaryProgressSha256: primaryProgressSha256,
    comparisonRule: "PREDECLARED_EXACT_PER_RESPONSE_V1_RULE_INHERITED_BY_V2",
    counts,
    records: disagreementRecords,
  };
  const disagreementBytes = jsonBytes(disagreementLedger);
  const disagreementSha = sha256(disagreementBytes);
  const schedule = j3ScheduleSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_schedule",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    createdAt: preparedAt,
    conditionMapSealed: true,
    priorJudgeOutputsShown: false,
    sourcePrimaryProgressSha256: primaryProgressSha256,
    sourceDisagreementLedgerSha256: disagreementSha,
    j3JudgmentTarget: pendingJ3Records.length,
    records: pendingJ3Records,
  });
  const scheduleBytes = jsonBytes(schedule);
  const scheduleSha = sha256(scheduleBytes);
  const progress = j3CaptureProgressSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_capture_progress",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    createdAt: preparedAt,
    updatedAt: preparedAt,
    sourcePrimaryProgressSha256: primaryProgressSha256,
    sourceDisagreementLedgerSha256: disagreementSha,
    sourceJ3ScheduleSha256: scheduleSha,
    j3JudgmentTarget: pendingJ3Records.length,
    validJudgmentCount: 0,
    mechanicalFailureCount: 0,
    records: [],
    mechanicalFailures: [],
    haltedClaim: null,
  });
  acceptJ3CaptureProgress(schedule, progress, primary.progress);
  const progressBytes = jsonBytes(progress);
  const preparationReceipt = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_preparation",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    preparedAt,
    sourceCommit,
    sourceTree,
    primaryScheduleSha256: sha256(primary.scheduleBytes),
    primaryProgressSha256,
    disagreementLedgerSha256: disagreementSha,
    j3ScheduleSha256: scheduleSha,
    j3ProgressSha256: sha256(progressBytes),
    responsePairCount: 96,
    j3JudgmentTarget: pendingJ3Records.length,
    conditionMapSealed: true,
    priorJudgeOutputsShown: false,
    externalSpendUsd: 0,
    status: "EVALUATOR_V2_J3_SCHEDULE_FROZEN",
  };

  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  const stagingRoot = await mkdtemp(resolve(evaluationRoot, ".j3-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    await Promise.all([
      writePrivate(resolve(stagingRoot, "disagreement-ledger.json"), disagreementBytes),
      writePrivate(resolve(stagingRoot, "evaluation-schedule.json"), scheduleBytes),
      writePrivate(resolve(stagingRoot, "capture-progress.json"), progressBytes),
      writePrivate(resolve(stagingRoot, "preparation-receipt.json"), jsonBytes(preparationReceipt)),
    ]);
    await mkdir(resolve(stagingRoot, "judgments"), { mode: 0o700 });
    await mkdir(resolve(stagingRoot, "receipts"), { mode: 0o700 });
    await rename(stagingRoot, finalRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    status: "EVALUATOR_V2_J3_SCHEDULE_FROZEN",
    j3JudgmentTarget: pendingJ3Records.length,
    disagreementLedgerSha256: disagreementSha,
    j3ScheduleSha256: scheduleSha,
    j3ProgressSha256: sha256(progressBytes),
    conditionMapSealed: true,
  };
}

export async function recordV2J3Attempt(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  receiptValue: unknown;
}): Promise<{
  status: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  j3Ordinal: number;
  attempt: number;
  validJudgmentCount: number;
  mechanicalFailureCount: number;
  haltedClaim: string | null;
}> {
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    validatePinnedMastRoot(mastRoot),
  ]);
  const primary = await loadPrimaryState(artifactRoot);
  const j3Root = resolve(artifactRoot, j3RootDirectory);
  const schedulePath = resolve(j3Root, "evaluation-schedule.json");
  const progressPath = resolve(j3Root, "capture-progress.json");
  const [scheduleValue, progressValue] = await Promise.all([
    readJson(schedulePath),
    readJson(progressPath),
  ]);
  const schedule = j3ScheduleSchema.parse(scheduleValue);
  const progress = acceptJ3CaptureProgress(schedule, progressValue, primary.progress);
  if (progress.records.length === schedule.records.length) {
    throw new Error("EVALUATOR_V2_J3_CAPTURE_ALREADY_COMPLETE");
  }
  if (progress.haltedClaim !== null) throw new Error(progress.haltedClaim);
  const rawReceipt = input.receiptValue as JsonObject;
  const receipt = rawReceipt?.status === "VALID"
    ? validJ3CaptureSchema.parse(rawReceipt)
    : failedJ3CaptureSchema.parse(rawReceipt);
  const expected = schedule.records[progress.records.length]!;
  const failures = progress.mechanicalFailures.filter(({ j3Ordinal }) => j3Ordinal === expected.j3Ordinal);
  if (!sameJ3Slot(receipt, expected)
    || receipt.attempt !== failures.length + 1
    || receipt.inputFile !== expected.packetFile
    || receipt.exactInputSha256 !== expected.exactPacketSha256) {
    throw new Error("EVALUATOR_V2_J3_RECEIPT_SLOT_MISMATCH");
  }
  let status: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  if (receipt.status === "VALID") {
    const validated = await readValidatedEvaluatorV2OutputFile({
      mastRoot,
      artifactRoot,
      opaqueResponseId: receipt.opaqueResponseId,
      outputFile: receipt.outputFile,
    });
    if (validated.caseId !== receipt.caseId
      || validated.exactOutputSha256 !== receipt.exactOutputSha256
      || validated.exactOutputUtf8Bytes !== receipt.exactOutputUtf8Bytes) {
      throw new Error("EVALUATOR_V2_J3_VALID_OUTPUT_RECEIPT_MISMATCH");
    }
    progress.records.push(receipt);
    status = "VALID_RECORDED";
  } else {
    if (receipt.outputFile !== null) {
      await assertPrivateFile(
        artifactRoot,
        receipt.outputFile,
        receipt.exactOutputSha256!,
        receipt.exactOutputUtf8Bytes!,
      );
    }
    progress.mechanicalFailures.push(receipt);
    if (receipt.attempt === 4) {
      progress.haltedClaim = j3HaltClaim;
      status = "UNRESOLVED_SLOT_RECORDED";
    } else {
      status = "MECHANICAL_FAILURE_RECORDED";
    }
  }
  progress.validJudgmentCount = progress.records.length;
  progress.mechanicalFailureCount = progress.mechanicalFailures.length;
  progress.updatedAt = new Date().toISOString();
  acceptJ3CaptureProgress(schedule, progress, primary.progress);
  const temporary = resolve(j3Root, `.capture-progress.${process.pid}.${Date.now()}.tmp`);
  await writePrivate(temporary, jsonBytes(progress));
  await rename(temporary, progressPath);
  await chmod(progressPath, 0o600);
  return {
    status,
    j3Ordinal: receipt.j3Ordinal,
    attempt: receipt.attempt,
    validJudgmentCount: progress.validJudgmentCount,
    mechanicalFailureCount: progress.mechanicalFailureCount,
    haltedClaim: progress.haltedClaim,
  };
}

export async function finalizeV2BlindedEvaluation(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
}): Promise<{
  status: typeof completionClaim;
  responseCount: 96;
  j3JudgmentCount: number;
  finalRecordsSha256: string;
  blindedEvaluationLedgerSha256: string;
  conditionMapSealed: true;
  externalSpendUsd: 0;
}> {
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    validatePinnedMastRoot(mastRoot),
  ]);
  const primary = await loadPrimaryState(artifactRoot);
  const j3Root = resolve(artifactRoot, j3RootDirectory);
  const finalRoot = resolve(artifactRoot, finalRootDirectory);
  try {
    await stat(finalRoot);
    throw new Error("EVALUATOR_V2_FINAL_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const [disagreementBytes, j3ScheduleBytes, j3ProgressBytes] = await Promise.all([
    readFile(resolve(j3Root, "disagreement-ledger.json"), "utf8"),
    readFile(resolve(j3Root, "evaluation-schedule.json"), "utf8"),
    readFile(resolve(j3Root, "capture-progress.json"), "utf8"),
  ]);
  const disagreementLedger = JSON.parse(disagreementBytes) as {
    records: Array<{
      opaqueResponseId: string;
      caseId: string;
      j1Ordinal: number;
      j2Ordinal: number;
      adjudicationRequired: boolean;
    }>;
  };
  const j3Schedule = j3ScheduleSchema.parse(JSON.parse(j3ScheduleBytes));
  const j3Progress = acceptJ3CaptureProgress(j3Schedule, JSON.parse(j3ProgressBytes), primary.progress);
  if (j3Progress.records.length !== j3Schedule.records.length || j3Progress.haltedClaim !== null) {
    throw new Error("EVALUATOR_V2_REQUIRED_J3_NOT_FROZEN");
  }
  if (!Array.isArray(disagreementLedger.records) || disagreementLedger.records.length !== 96
    || sha256(disagreementBytes) !== j3Schedule.sourceDisagreementLedgerSha256) {
    throw new Error("EVALUATOR_V2_DISAGREEMENT_LEDGER_INVALID");
  }
  const primaryByOrdinal = new Map(primary.progress.records.map((record) => [record.ordinal, record]));
  const j3ByOpaque = new Map(j3Progress.records.map((record) => [record.opaqueResponseId, record]));
  const j3ScheduleByOpaque = new Map(j3Schedule.records.map((record) => [record.opaqueResponseId, record]));
  const finalRecords = [];
  for (const disagreement of disagreementLedger.records) {
    const selected = disagreement.adjudicationRequired
      ? j3ByOpaque.get(disagreement.opaqueResponseId)
      : primaryByOrdinal.get(disagreement.j1Ordinal);
    if (!selected || selected.opaqueResponseId !== disagreement.opaqueResponseId
      || selected.caseId !== disagreement.caseId) {
      throw new Error("EVALUATOR_V2_FINAL_SELECTION_MISMATCH");
    }
    const validated = await readValidatedEvaluatorV2OutputFile({
      mastRoot,
      artifactRoot,
      opaqueResponseId: selected.opaqueResponseId,
      outputFile: selected.outputFile,
    });
    if (validated.exactOutputSha256 !== selected.exactOutputSha256
      || validated.exactOutputUtf8Bytes !== selected.exactOutputUtf8Bytes) {
      throw new Error("EVALUATOR_V2_FINAL_OUTPUT_IDENTITY_MISMATCH");
    }
    const metrics = projectedMetricSchema.parse(await computeJudgmentMetrics({
      repositoryRoot,
      mastRoot,
      familyId: selected.caseId,
      judgment: validated.reconstructedJudgment,
    })) as ProjectedMetricResult;
    const j3Slot = j3ScheduleByOpaque.get(disagreement.opaqueResponseId);
    if (disagreement.adjudicationRequired !== (j3Slot !== undefined)) {
      throw new Error("EVALUATOR_V2_FINAL_J3_TRIGGER_MISMATCH");
    }
    finalRecords.push({
      opaqueResponseId: selected.opaqueResponseId,
      caseId: selected.caseId,
      sourceRule: disagreement.adjudicationRequired ? "J3" : "J1",
      sourceJ1Ordinal: disagreement.j1Ordinal,
      sourceJ2Ordinal: disagreement.j2Ordinal,
      sourceJ3Ordinal: j3Slot?.j3Ordinal ?? null,
      evaluatorReplicate: disagreement.adjudicationRequired ? 3 : 1,
      selectedOutputFile: selected.outputFile,
      exactSelectedOutputSha256: selected.exactOutputSha256,
      exactSelectedOutputUtf8Bytes: selected.exactOutputUtf8Bytes,
      metrics,
      pilotSevereCommission: metrics.responseLevelSevereCommission,
    });
  }
  if (finalRecords.length !== 96
    || new Set(finalRecords.map(({ opaqueResponseId }) => opaqueResponseId)).size !== 96) {
    throw new Error("EVALUATOR_V2_FINAL_RESPONSE_COVERAGE_INVALID");
  }
  const finalizedAt = new Date().toISOString();
  const finalRecordsValue = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_final_blinded_response_records",
    directiveId: evaluatorV2DirectiveId,
    finalizedAt,
    metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS",
    conditionMapSealed: true,
    responseCount: 96,
    records: finalRecords,
  };
  const finalRecordsBytes = jsonBytes(finalRecordsValue);
  const finalRecordsSha = sha256(finalRecordsBytes);
  const blindedLedger = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_blinded_evaluation_ledger",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    finalizedAt,
    sourceCommit,
    sourceTree,
    conditionMapSealed: true,
    armLevelAggregationPerformed: false,
    familyLevelAggregationPerformed: false,
    continuationGateApplied: false,
    protocolOrPromptTuningPerformed: false,
    providerApiInferenceUsed: false,
    externalSpendUsd: 0,
    primary: {
      validJudgmentCount: 192,
      mechanicalFailureCount: primary.progress.mechanicalFailureCount,
      scheduleSha256: sha256(primary.scheduleBytes),
      progressSha256: sha256(primary.progressBytes),
      validJudgmentIdentities: primary.progress.records.map((record) => ({
        ordinal: record.ordinal,
        opaqueResponseId: record.opaqueResponseId,
        evaluatorReplicate: record.evaluatorReplicate,
        attempt: record.attempt,
        exactOutputSha256: record.exactOutputSha256,
      })),
      mechanicalFailureIdentities: primary.progress.mechanicalFailures.map((record) => ({
        ordinal: record.ordinal,
        opaqueResponseId: record.opaqueResponseId,
        evaluatorReplicate: record.evaluatorReplicate,
        attempt: record.attempt,
        reason: record.reason,
        exactOutputSha256: record.exactOutputSha256,
      })),
    },
    disagreementLedgerSha256: sha256(disagreementBytes),
    j3: {
      requiredJudgmentCount: j3Schedule.records.length,
      validJudgmentCount: j3Progress.records.length,
      mechanicalFailureCount: j3Progress.mechanicalFailures.length,
      scheduleSha256: sha256(j3ScheduleBytes),
      progressSha256: sha256(j3ProgressBytes),
      validJudgmentIdentities: j3Progress.records.map((record) => ({
        j3Ordinal: record.j3Ordinal,
        opaqueResponseId: record.opaqueResponseId,
        attempt: record.attempt,
        exactOutputSha256: record.exactOutputSha256,
      })),
      mechanicalFailureIdentities: j3Progress.mechanicalFailures.map((record) => ({
        j3Ordinal: record.j3Ordinal,
        opaqueResponseId: record.opaqueResponseId,
        attempt: record.attempt,
        reason: record.reason,
        exactOutputSha256: record.exactOutputSha256,
      })),
    },
    finalBlindedResponseRecordsSha256: finalRecordsSha,
    completionClaim,
  };
  const blindedLedgerBytes = jsonBytes(blindedLedger);
  const blindedLedgerSha = sha256(blindedLedgerBytes);
  const acceptanceReceipt = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_final_blinded_acceptance",
    directiveId: evaluatorV2DirectiveId,
    finalizedAt,
    responseCount: 96,
    primaryValidJudgmentCount: 192,
    primaryMechanicalFailureCount: primary.progress.mechanicalFailureCount,
    requiredJ3JudgmentCount: j3Schedule.records.length,
    validJ3JudgmentCount: j3Progress.records.length,
    j3MechanicalFailureCount: j3Progress.mechanicalFailures.length,
    disagreementLedgerSha256: sha256(disagreementBytes),
    finalBlindedResponseRecordsSha256: finalRecordsSha,
    blindedEvaluationLedgerSha256: blindedLedgerSha,
    metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS",
    conditionMapSealed: true,
    armLevelAggregationPerformed: false,
    familyLevelAggregationPerformed: false,
    continuationGateApplied: false,
    providerApiInferenceUsed: false,
    externalSpendUsd: 0,
    completionClaim,
    status: completionClaim,
  };

  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  const stagingRoot = await mkdtemp(resolve(evaluationRoot, ".final-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    await Promise.all([
      writePrivate(resolve(stagingRoot, "blinded-response-records.json"), finalRecordsBytes),
      writePrivate(resolve(stagingRoot, "blinded-evaluation-ledger.json"), blindedLedgerBytes),
      writePrivate(resolve(stagingRoot, "acceptance-receipt.json"), jsonBytes(acceptanceReceipt)),
    ]);
    await rename(stagingRoot, finalRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    status: completionClaim,
    responseCount: 96,
    j3JudgmentCount: j3Schedule.records.length,
    finalRecordsSha256: finalRecordsSha,
    blindedEvaluationLedgerSha256: blindedLedgerSha,
    conditionMapSealed: true,
    externalSpendUsd: 0,
  };
}
