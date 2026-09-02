import { createHash } from "node:crypto";
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
  evaluatorFamilies,
  runSourceBridge,
  sha256,
  sourceCommit,
  sourceTree,
  type EvaluatorJudgment,
} from "./zero-spend-mast-four-arm-base-evaluation.mjs";

export const evaluatorV2DirectiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2";
export const evaluatorV2RetryExtensionDirectiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v2-retry-extension-v1";
export const evaluatorV2Directory = "evaluation-v2";
const evaluatorV1Directory = "evaluation-v1";
const evaluatorV1ProgressSha256 =
  "35699d353f6a2e9986babc0ebfe15664fe01d865bf9f7c5c2adcc8a9659c620a";
const evaluatorV1OpaqueMapSha256 =
  "1d2e935f5c03fec9aa4e3707bd2eab987d9060a4a742d481a521d218a6ee5a57";
const evaluatorV1ScheduleSha256 =
  "0647b6bba44780d45cd50c7ed818bb01428612807d16410f000295e83802d5ae";
const evaluatorV2DirectiveSha256 =
  "0b57d63f73127a94a1471dfa115381f1a9053e8639efe8f18a489da4f99d02a4";
const evaluatorV1FailureReceiptSha256 = [
  "3ccfde00b4abb8c929aad9810c1ae6e372cb5bd1d29bef7fe3d09228ab64ed0b",
  "2fb8f35e0d57416f357b1ff26d1be80e04aef828d6c1bfd87b9bbb96f320aaf3",
];
const v2DirectivePath =
  "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport-v2-recovery.json";
const v2RetryExtensionDirectivePath =
  "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-v2-retry-extension.json";
const v2RetryExtensionSourceReceiptPath =
  "docs/audits/2026-09-02-mast-blinded-evaluator-v2-retry-extension-source.json";
const v2RetryExtensionAdmissionReceiptPath =
  "docs/audits/2026-09-02-mast-blinded-evaluator-v2-retry-extension-runtime-admission-accepted.json";
const v2RetryExtensionDirectiveSha256 =
  "456cbb7534675a31aea7f7e516ebb9e9e308b9a057c174653d9d4d524f5173b5";
const v2RetryExtensionStartingProgressSha256 =
  "3ccce65dfdc3abed9e443c732523f5ee8fed463becd051777e12692940390b92";
const legacyTwoAttemptHaltClaim =
  "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_UNRESOLVED_EVALUATOR_SLOT";
const extendedFourAttemptHaltClaim =
  "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_V2_BLOCKED_AFTER_FOUR_MECHANICAL_ATTEMPTS";
const opaquePattern = /^EVAL-[a-f0-9]{24}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const actionCategories = new Set([
  "Diagnostic",
  "Medication",
  "Procedure",
  "Counseling",
  "Follow-up",
]);
const execFileAsync = promisify(execFile);

type JsonObject = Record<string, unknown>;
type V2Chunk = { id: number; text: string };
type V2Action = {
  id: number;
  category: string;
  evidenceChunkIds: number[];
  dependsOn: number[];
  matchOptionIds: number[];
};
type V2Option = {
  id: number;
  verdict: "yes" | "partial" | "no";
  actionIds: number[];
};
export type EvaluatorV2Output = {
  actions: V2Action[];
  options: V2Option[];
  severeCommissionActionIds: number[];
  uncertainOptionIds: number[];
  uncertainActionIds: number[];
};

type V1ScheduleRecord = {
  ordinal: number;
  opaqueResponseId: string;
  caseId: string;
  evaluatorReplicate: 1 | 2;
  orderDigest: string;
  packetFile: string;
  exactPacketSha256: string;
};

type V2ScheduleRecord = V1ScheduleRecord;

const relativeFileSchema = z.string().min(1).refine(
  (value) => !isAbsolute(value) && !value.split("/").includes(".."),
  "private artifact path must be relative and contained",
);
const digestSchema = z.string().regex(digestPattern);
const timestampSchema = z.string().regex(timestampPattern);

const captureIdentityShape = {
  ordinal: z.number().int().min(1).max(192),
  opaqueResponseId: z.string().regex(opaquePattern),
  caseId: z.enum(evaluatorFamilies),
  evaluatorReplicate: z.union([z.literal(1), z.literal(2)]),
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
    context.addIssue({
      code: "custom",
      path: ["automaticToolInvocationObserved"],
      message: "automatic tool process measures are inconsistent",
    });
  }
}

const validV2CaptureSchema = z.object({
  ...captureIdentityShape,
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

const v2FailureReasons = [
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

const failedV2CaptureSchema = z.object({
  ...captureIdentityShape,
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.enum(v2FailureReasons),
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
    context.addIssue({ code: "custom", path: ["exactOutputStoredPrivately"], message: "output storage flag is inconsistent" });
  }
  validateToolMeasures(record, context);
});

export const v2CaptureProgressSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress"),
  directiveId: z.literal(evaluatorV2DirectiveId),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  primaryJudgmentTarget: z.literal(192),
  validJudgmentCount: z.number().int().min(0).max(192),
  mechanicalFailureCount: z.number().int().min(0).max(768),
  records: z.array(validV2CaptureSchema).max(192),
  mechanicalFailures: z.array(failedV2CaptureSchema).max(768),
  haltedClaim: z.union([
    z.literal(legacyTwoAttemptHaltClaim),
    z.literal(extendedFourAttemptHaltClaim),
  ]).nullable(),
}).strict();

export type V2CaptureProgress = z.infer<typeof v2CaptureProgressSchema>;
export type ValidV2Capture = z.infer<typeof validV2CaptureSchema>;
export type FailedV2Capture = z.infer<typeof failedV2CaptureSchema>;

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value as number;
}

function exactKeys(value: JsonObject, keys: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`EVALUATOR_V2_SCHEMA_KEY_MISMATCH ${label}`);
  }
}

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

async function assertPrivateDirectory(path: string): Promise<void> {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o700) {
    throw new Error(`EVALUATOR_V2_PRIVATE_DIRECTORY_INVALID path=${path}`);
  }
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], { encoding: "utf8" });
  return stdout.trim();
}

export function chunkFrozenResponse(rawResponse: string): V2Chunk[] {
  const codepoints = Array.from(rawResponse);
  const chunks: V2Chunk[] = [];
  for (let index = 0; index < codepoints.length; index += 160) {
    chunks.push({ id: chunks.length + 1, text: codepoints.slice(index, index + 160).join("") });
  }
  if (chunks.map(({ text }) => text).join("") !== rawResponse) {
    throw new Error("EVALUATOR_V2_CHUNK_RECONSTRUCTION_FAILED");
  }
  return chunks;
}

function rubricOptions(rubricValue: unknown, caseId: string): Array<{ id: number; officialScore: number }> {
  const rubric = object(rubricValue, `rubric ${caseId}`);
  if (rubric.id !== caseId) throw new Error("EVALUATOR_V2_RUBRIC_ID_MISMATCH");
  return array(rubric.options, `rubric ${caseId}.options`).map((entry, index) => {
    const option = object(entry, `rubric option ${index}`);
    const id = integer(option.id, `rubric option ${index}.id`);
    const score = option.placement || option.score || option.grade;
    if (!Number.isInteger(score)) throw new Error("EVALUATOR_V2_RUBRIC_SCORE_INVALID");
    return { id, officialScore: score as number };
  });
}

function integerList(value: unknown, label: string): number[] {
  const result = array(value, label).map((entry, index) => integer(entry, `${label}[${index}]`));
  if (result.some((entry) => entry < 1) || new Set(result).size !== result.length) {
    throw new Error(`EVALUATOR_V2_INVALID_INTEGER_LIST ${label}`);
  }
  return result;
}

export function parseAndValidateEvaluatorV2Output(input: {
  rawOutput: string;
  rawResponse: string;
  chunks: V2Chunk[];
  caseId: string;
  opaqueResponseId: string;
  rubricValue: unknown;
}): { output: EvaluatorV2Output; reconstructedJudgment: EvaluatorJudgment } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawOutput.trim());
  } catch {
    throw new Error("EVALUATOR_V2_INVALID_JSON");
  }
  const root = object(parsed, "evaluator v2 output");
  exactKeys(
    root,
    ["actions", "options", "severeCommissionActionIds", "uncertainOptionIds", "uncertainActionIds"],
    "root",
  );
  if (input.chunks.map(({ text }) => text).join("") !== input.rawResponse
    || sha256(input.chunks.map(({ text }) => text).join("")) !== sha256(input.rawResponse)) {
    throw new Error("EVALUATOR_V2_CHUNK_RECONSTRUCTION_FAILED");
  }
  const chunkById = new Map(input.chunks.map((chunk) => [chunk.id, chunk.text]));
  const rubric = rubricOptions(input.rubricValue, input.caseId);
  const rubricIds = rubric.map(({ id }) => id);
  const rubricIdSet = new Set(rubricIds);

  const actions = array(root.actions, "actions").map((entry, index): V2Action => {
    const action = object(entry, `actions[${index}]`);
    exactKeys(action, ["id", "category", "evidenceChunkIds", "dependsOn", "matchOptionIds"], `actions[${index}]`);
    const id = integer(action.id, `actions[${index}].id`);
    if (id !== index + 1) throw new Error("EVALUATOR_V2_ACTION_IDS_INVALID");
    const category = string(action.category, `actions[${index}].category`);
    if (!actionCategories.has(category)) throw new Error("EVALUATOR_V2_ACTION_CATEGORY_INVALID");
    const evidenceChunkIds = integerList(action.evidenceChunkIds, `actions[${index}].evidenceChunkIds`);
    if (evidenceChunkIds.length === 0 || evidenceChunkIds.some((chunkId) => !chunkById.has(chunkId))) {
      throw new Error("EVALUATOR_V2_INVALID_CHUNK_REFERENCE");
    }
    const dependsOn = integerList(action.dependsOn, `actions[${index}].dependsOn`);
    if (dependsOn.some((dependency) => dependency >= id)) {
      throw new Error("EVALUATOR_V2_INVALID_ACTION_DEPENDENCY");
    }
    const matchOptionIds = integerList(action.matchOptionIds, `actions[${index}].matchOptionIds`);
    if (matchOptionIds.some((optionId) => !rubricIdSet.has(optionId))) {
      throw new Error("EVALUATOR_V2_INVALID_OPTION_REFERENCE");
    }
    return { id, category, evidenceChunkIds, dependsOn, matchOptionIds };
  });
  const actionIds = new Set(actions.map(({ id }) => id));

  const options = array(root.options, "options").map((entry, index): V2Option => {
    const option = object(entry, `options[${index}]`);
    exactKeys(option, ["id", "verdict", "actionIds"], `options[${index}]`);
    const id = integer(option.id, `options[${index}].id`);
    if (id !== rubricIds[index]) throw new Error("EVALUATOR_V2_INVALID_OPTION_COVERAGE");
    const verdict = string(option.verdict, `options[${index}].verdict`);
    if (verdict !== "yes" && verdict !== "partial" && verdict !== "no") {
      throw new Error("EVALUATOR_V2_OPTION_VERDICT_INVALID");
    }
    const actionIdsForOption = integerList(option.actionIds, `options[${index}].actionIds`);
    if (actionIdsForOption.some((actionId) => !actionIds.has(actionId))
      || (verdict === "no" && actionIdsForOption.length !== 0)
      || (verdict !== "no" && actionIdsForOption.length === 0)) {
      throw new Error("EVALUATOR_V2_INVALID_OPTION_ACTION_REFERENCE");
    }
    return { id, verdict, actionIds: actionIdsForOption };
  });
  if (options.length !== rubricIds.length) throw new Error("EVALUATOR_V2_INVALID_OPTION_COVERAGE");
  const optionById = new Map(options.map((option) => [option.id, option]));
  for (const action of actions) {
    for (const option of options) {
      if (action.matchOptionIds.includes(option.id) !== option.actionIds.includes(action.id)) {
        throw new Error("EVALUATOR_V2_INVALID_CROSS_REFERENCE");
      }
    }
  }

  const severeCommissionActionIds = integerList(
    root.severeCommissionActionIds,
    "severeCommissionActionIds",
  );
  if (severeCommissionActionIds.some((actionId) =>
    !actionIds.has(actionId) || actions[actionId - 1]!.matchOptionIds.length !== 0)) {
    throw new Error("EVALUATOR_V2_INVALID_SEVERE_COMMISSION_REFERENCE");
  }
  const uncertainOptionIds = integerList(root.uncertainOptionIds, "uncertainOptionIds");
  if (uncertainOptionIds.some((optionId) => !rubricIdSet.has(optionId))) {
    throw new Error("EVALUATOR_V2_INVALID_UNCERTAIN_OPTION_REFERENCE");
  }
  const uncertainActionIds = integerList(root.uncertainActionIds, "uncertainActionIds");
  if (uncertainActionIds.some((actionId) => !actionIds.has(actionId))) {
    throw new Error("EVALUATOR_V2_INVALID_UNCERTAIN_ACTION_REFERENCE");
  }

  const evidenceByAction = new Map(actions.map((action) => [
    action.id,
    action.evidenceChunkIds.map((chunkId) => chunkById.get(chunkId)!).join(""),
  ]));
  const reconstructedActions = actions.map((action) => ({
    id: action.id,
    action: evidenceByAction.get(action.id)!,
    category: action.category,
    evidence: evidenceByAction.get(action.id)!,
    dependsOn: action.dependsOn,
    match: action.matchOptionIds.join(","),
  }));
  const reconstructedOptions = options.map((option) => ({
    id: option.id,
    officialScore: rubric.find(({ id }) => id === option.id)!.officialScore,
    matchVerdict: option.verdict,
    matchedActionIds: option.actionIds,
    evidence: option.actionIds.length === 0
      ? null
      : [...option.actionIds].sort((left, right) => left - right)
        .map((actionId) => evidenceByAction.get(actionId)!).join(""),
  }));
  const severeSet = new Set(severeCommissionActionIds);
  const nonRubricSafety = reconstructedActions.filter(({ match }) => match === "").map(({ id }) => ({
    actionId: id,
    severeCommission: severeSet.has(id),
    rationale: `V2 severeCommissionActionIds membership: ${severeSet.has(id) ? "true" : "false"}.`,
  }));
  return {
    output: {
      actions,
      options,
      severeCommissionActionIds,
      uncertainOptionIds,
      uncertainActionIds,
    },
    reconstructedJudgment: {
      caseId: input.caseId,
      opaqueResponseId: input.opaqueResponseId,
      actions: reconstructedActions,
      options: reconstructedOptions,
      nonRubricSafety,
      strongestUncertainty:
        `V2 uncertainOptionIds=${JSON.stringify(uncertainOptionIds)}; uncertainActionIds=${JSON.stringify(uncertainActionIds)}.`,
    },
  };
}

function v1ScheduleRecords(value: unknown): V1ScheduleRecord[] {
  const root = object(value, "v1 schedule");
  const records = array(root.records, "v1 schedule records").map((entry, index) => {
    const record = object(entry, `v1 schedule records[${index}]`);
    const replicate = integer(record.evaluatorReplicate, "v1 evaluator replicate");
    return {
      ordinal: integer(record.ordinal, "v1 ordinal"),
      opaqueResponseId: string(record.opaqueResponseId, "v1 opaque response id"),
      caseId: string(record.caseId, "v1 case id"),
      evaluatorReplicate: replicate as 1 | 2,
      orderDigest: string(record.orderDigest, "v1 order digest"),
      packetFile: string(record.packetFile, "v1 packet file"),
      exactPacketSha256: string(record.exactPacketSha256, "v1 packet hash"),
    };
  });
  if (records.length !== 192 || records.some(({ ordinal }, index) => ordinal !== index + 1)) {
    throw new Error("EVALUATOR_V2_V1_SCHEDULE_INVALID");
  }
  return records;
}

function v2ScheduleRecords(value: unknown): V2ScheduleRecord[] {
  const root = object(value, "v2 schedule");
  if (root.directiveId !== evaluatorV2DirectiveId || root.conditionMapSealed !== true) {
    throw new Error("EVALUATOR_V2_SCHEDULE_IDENTITY_INVALID");
  }
  return v1ScheduleRecords(value);
}

function sameSlot(
  record: Pick<ValidV2Capture, "ordinal" | "opaqueResponseId" | "caseId" | "evaluatorReplicate">,
  expected: V2ScheduleRecord,
): boolean {
  return record.ordinal === expected.ordinal
    && record.opaqueResponseId === expected.opaqueResponseId
    && record.caseId === expected.caseId
    && record.evaluatorReplicate === expected.evaluatorReplicate;
}

export function acceptV2CaptureProgress(
  scheduleValue: unknown,
  progressValue: unknown,
  attemptPolicy: "LEGACY_TWO_ATTEMPT" | "EXTENDED_FOUR_ATTEMPT" = "EXTENDED_FOUR_ATTEMPT",
): V2CaptureProgress {
  const schedule = v2ScheduleRecords(scheduleValue);
  const progress = v2CaptureProgressSchema.parse(progressValue);
  if (progress.validJudgmentCount !== progress.records.length
    || progress.mechanicalFailureCount !== progress.mechanicalFailures.length) {
    throw new Error("EVALUATOR_V2_PROGRESS_COUNTS_INVALID");
  }
  const conversations = [
    ...progress.records.map(({ conversationId }) => conversationId),
    ...progress.mechanicalFailures.flatMap(({ conversationId }) => conversationId ? [conversationId] : []),
  ];
  if (new Set(conversations).size !== conversations.length) {
    throw new Error("EVALUATOR_V2_CONVERSATION_REUSED");
  }
  const failuresByOrdinal = new Map<number, FailedV2Capture[]>();
  for (const failure of progress.mechanicalFailures) {
    const expected = schedule[failure.ordinal - 1];
    if (!expected || !sameSlot(failure, expected)
      || failure.inputFile !== expected.packetFile
      || failure.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_FAILURE_SCHEDULE_MISMATCH");
    }
    const failures = failuresByOrdinal.get(failure.ordinal) ?? [];
    failures.push(failure);
    failuresByOrdinal.set(failure.ordinal, failures);
  }
  for (let index = 0; index < progress.records.length; index += 1) {
    const record = progress.records[index]!;
    const expected = schedule[index]!;
    const failures = failuresByOrdinal.get(index + 1) ?? [];
    if (record.ordinal !== index + 1 || !sameSlot(record, expected)
      || record.inputFile !== expected.packetFile
      || record.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATOR_V2_NOT_SCHEDULE_PREFIX");
    }
    if (failures.length !== record.attempt - 1
      || failures.some((failure, failureIndex) => failure.attempt !== failureIndex + 1)) {
      throw new Error("EVALUATOR_V2_ATTEMPT_HISTORY_INVALID");
    }
  }
  const nextOrdinal = progress.records.length + 1;
  const maximumAttempts = attemptPolicy === "LEGACY_TWO_ATTEMPT" ? 2 : 4;
  for (const [ordinal, failures] of failuresByOrdinal) {
    if (ordinal > nextOrdinal || failures.length > maximumAttempts
      || failures.some((failure, index) => failure.attempt !== index + 1)) {
      throw new Error("EVALUATOR_V2_FAILURE_ORDER_INVALID");
    }
  }
  const shouldHalt = (failuresByOrdinal.get(nextOrdinal) ?? []).length === maximumAttempts;
  const expectedHaltClaim = attemptPolicy === "LEGACY_TWO_ATTEMPT"
    ? legacyTwoAttemptHaltClaim
    : extendedFourAttemptHaltClaim;
  if (progress.haltedClaim !== (shouldHalt ? expectedHaltClaim : null)) {
    throw new Error("EVALUATOR_V2_HALT_STATE_INVALID");
  }
  return progress;
}

export function applyV2RetryExtensionToProgress(
  scheduleValue: unknown,
  progressValue: unknown,
  activatedAt: string,
): V2CaptureProgress {
  const progress = acceptV2CaptureProgress(scheduleValue, progressValue, "LEGACY_TWO_ATTEMPT");
  const unresolvedFailures = progress.mechanicalFailures.filter(({ ordinal }) => ordinal === 30);
  if (progress.validJudgmentCount !== 29
    || progress.mechanicalFailureCount !== 3
    || progress.records.at(-1)?.ordinal !== 29
    || unresolvedFailures.length !== 2
    || unresolvedFailures.some((failure, index) => failure.attempt !== index + 1
      || failure.reason !== "INVALID_JSON")
    || progress.haltedClaim !== legacyTwoAttemptHaltClaim) {
    throw new Error("EVALUATOR_V2_RETRY_EXTENSION_STARTING_STATE_INVALID");
  }
  return acceptV2CaptureProgress(scheduleValue, {
    ...progress,
    updatedAt: timestampSchema.parse(activatedAt),
    haltedClaim: null,
  }, "EXTENDED_FOUR_ATTEMPT");
}

export function renderEvaluatorV2TransportExtension(
  directive: JsonObject,
  rubricSourceOptionIds: number[],
): string {
  const transport = object(directive.primaryEvaluatorTransportV2, "primaryEvaluatorTransportV2");
  const validation = object(directive.mechanicalValidationV2, "mechanicalValidationV2");
  const canonicalOptionIds = integerList(rubricSourceOptionIds, "rubric source option IDs");
  return [
    "# AskRigor condition-blind evaluator transport v2",
    "",
    string(transport.semanticInstructions, "v2 semantic instructions"),
    "",
    string(transport.serializationInstruction, "v2 serialization instruction"),
    "",
    "Return exactly this schema, using only values allowed by the field descriptions:",
    JSON.stringify(directive.evaluatorOutputSchemaV2, null, 2),
    "",
    "Mechanical requirements:",
    ...array(validation.rules, "v2 validation rules").map((rule) => `- ${string(rule, "v2 rule")}`),
    "",
    "Required `options` array ID order (canonical rubric source order; the rubric display above is concept-grouped and may use a different order):",
    JSON.stringify(canonicalOptionIds),
    "",
    "Return only the compact JSON object. Do not wrap it in a Markdown code fence.",
    "",
  ].join("\n");
}

export async function prepareEvaluationV2Artifacts(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
}): Promise<{
  status: "BLINDED_EVALUATION_V2_PREFLIGHT_ACCEPTED";
  responseCount: 96;
  primaryJudgmentCount: 192;
  chunkReconstructionReceiptSha256: string;
  v2ScheduleSha256: string;
  preflightSha256: string;
}> {
  const repositoryRoot = await realpath(input.repositoryRoot);
  const mastRoot = await realpath(input.mastRoot);
  const artifactRoot = await realpath(input.artifactRoot);
  await assertPrivateDirectory(artifactRoot);
  await acceptArtifactRoot(repositoryRoot, artifactRoot);
  const [mastCommit, mastTree, mastDirty] = await Promise.all([
    gitText(mastRoot, "rev-parse", "HEAD"),
    gitText(mastRoot, "rev-parse", "HEAD^{tree}"),
    gitText(mastRoot, "status", "--porcelain"),
  ]);
  if (mastCommit !== sourceCommit || mastTree !== sourceTree || mastDirty !== "") {
    throw new Error("EVALUATOR_V2_MAST_SOURCE_PIN_INVALID");
  }
  const [v1ProgressBytes, v1MapBytes, v1ScheduleBytes, privateDirectiveBytes, sourceIdentityValue] = await Promise.all([
    readFile(resolve(artifactRoot, evaluatorV1Directory, "primary-capture-progress.json")),
    readFile(resolve(artifactRoot, evaluatorV1Directory, "opaque-response-map.json")),
    readFile(resolve(artifactRoot, evaluatorV1Directory, "primary-evaluation-schedule.json")),
    readFile(resolve(artifactRoot, evaluatorV1Directory, "project-manager-evaluator-v2-recovery-directive.json")),
    readJson(resolve(artifactRoot, evaluatorV1Directory, "source-identity.json")),
  ]);
  if (sha256(v1ProgressBytes) !== evaluatorV1ProgressSha256
    || sha256(v1MapBytes) !== evaluatorV1OpaqueMapSha256
    || sha256(v1ScheduleBytes) !== evaluatorV1ScheduleSha256
    || sha256(privateDirectiveBytes) !== evaluatorV2DirectiveSha256) {
    throw new Error("EVALUATOR_V2_PARENT_IDENTITY_INVALID");
  }
  const v1Progress = object(JSON.parse(v1ProgressBytes.toString("utf8")), "v1 capture progress");
  if (v1Progress.validJudgmentCount !== 0 || v1Progress.mechanicalFailureCount !== 2
    || v1Progress.haltedClaim !== "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_BLOCKED_UNRESOLVED_EVALUATOR_SLOT") {
    throw new Error("EVALUATOR_V2_V1_FAILURE_DISPOSITION_INVALID");
  }
  const v1Failures = array(v1Progress.mechanicalFailures, "v1 mechanical failures")
    .map((entry, index) => object(entry, `v1 mechanical failures[${index}]`));
  for (const failure of v1Failures) {
    const outputFile = string(failure.outputFile, "v1 failure output file");
    const output = await readFile(resolve(artifactRoot, outputFile));
    if (sha256(output) !== failure.exactOutputSha256 || output.length !== failure.exactOutputUtf8Bytes) {
      throw new Error("EVALUATOR_V2_V1_FAILED_OUTPUT_CHANGED");
    }
  }
  const failureReceiptFiles = [
    "001-EVAL-5c555ef0530ee059e19cc80e-J2-attempt-1-invalid.json",
    "001-EVAL-5c555ef0530ee059e19cc80e-J2-attempt-2-invalid.json",
  ];
  for (let index = 0; index < failureReceiptFiles.length; index += 1) {
    const bytes = await readFile(resolve(
      artifactRoot,
      evaluatorV1Directory,
      "receipts/primary",
      failureReceiptFiles[index]!,
    ));
    if (sha256(bytes) !== evaluatorV1FailureReceiptSha256[index]) {
      throw new Error("EVALUATOR_V2_V1_FAILURE_RECEIPT_CHANGED");
    }
  }
  const sourceIdentity = object(sourceIdentityValue, "v1 source identity");
  for (const entry of array(sourceIdentity.records, "v1 source identity records")) {
    const record = object(entry, "v1 source identity record");
    const bytes = await readFile(resolve(mastRoot, string(record.path, "source path")));
    if (sha256(bytes) !== record.sha256) throw new Error("EVALUATOR_V2_SOURCE_FILE_CHANGED");
  }
  const wrapper = object(await readJson(resolve(repositoryRoot, v2DirectivePath)), "v2 directive wrapper");
  const source = object(wrapper.source, "v2 directive source");
  const directive = object(wrapper.directive, "v2 directive");
  if (directive.directiveId !== evaluatorV2DirectiveId
    || directive.status !== "EVALUATOR_TRANSPORT_V1_RETIRED_V2_RESTART_AUTHORIZED_FROM_ORDINAL_1"
    || source.exactPrivateDirectiveJsonSha256 !== evaluatorV2DirectiveSha256) {
    throw new Error("EVALUATOR_V2_DIRECTIVE_INVALID");
  }
  const metricRules = object(directive.metricComputation, "v2 metric computation");
  if (metricRules.offRubricActionScore !== 5
    || metricRules.pinnedMastMetricCodeRequired !== true) {
    throw new Error("EVALUATOR_V2_METRIC_RULE_INVALID");
  }
  const metricProbeRubric = await readJson(
    resolve(mastRoot, `benchmarks/donoharm/dataset/rubrics/${evaluatorFamilies[0]}.json`),
  );
  const metricProbeOptions = rubricOptions(metricProbeRubric, evaluatorFamilies[0]).map(
    ({ id, officialScore }) => ({
      id,
      officialScore,
      matchVerdict: "no" as const,
      matchedActionIds: [],
      evidence: null,
    }),
  );
  const metricProbe = object(await runSourceBridge(repositoryRoot, "metrics", {
    mastRoot,
    familyId: evaluatorFamilies[0],
    judgment: {
      caseId: evaluatorFamilies[0],
      opaqueResponseId: "EVAL-000000000000000000000000",
      actions: [{
        id: 1,
        action: "synthetic metric-adapter probe",
        category: "Follow-up",
        evidence: "synthetic metric-adapter probe",
        dependsOn: [],
        match: "",
      }],
      options: metricProbeOptions,
      nonRubricSafety: [{
        actionId: 1,
        severeCommission: false,
        rationale: "Synthetic metric-adapter probe.",
      }],
      strongestUncertainty: "Synthetic metric-adapter probe.",
    },
  }), "v2 metric adapter probe");
  if (metricProbe.metricLabel !== "NONOFFICIAL_PROJECTED_MAST_METRICS"
    || typeof metricProbe.responseLevelSevereCommission !== "boolean") {
    throw new Error("EVALUATOR_V2_METRIC_ADAPTER_PROBE_FAILED");
  }

  const v1Map = object(JSON.parse(v1MapBytes.toString("utf8")), "v1 opaque map");
  const v1Mappings = array(v1Map.records, "v1 opaque records").map((entry, index) =>
    object(entry, `v1 opaque records[${index}]`));
  const v1Schedule = v1ScheduleRecords(JSON.parse(v1ScheduleBytes.toString("utf8")));
  if (v1Mappings.length !== 96) throw new Error("EVALUATOR_V2_RESPONSE_COUNT_INVALID");

  const finalRoot = resolve(artifactRoot, evaluatorV2Directory);
  try {
    await stat(finalRoot);
    throw new Error("EVALUATOR_V2_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const stagingRoot = await mkdtemp(resolve(artifactRoot, ".evaluation-v2-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    const responseRecords = [];
    for (const mapping of v1Mappings) {
      const opaqueResponseId = string(mapping.opaqueResponseId, "opaque response id");
      const caseId = string(mapping.familyId, "case id");
      const responseFile = string(mapping.generationOutputFile, "generation output file");
      const rawResponse = await readFile(resolve(artifactRoot, responseFile), "utf8");
      const expectedResponseSha = string(mapping.exactGenerationOutputSha256, "response hash");
      if (sha256(rawResponse) !== expectedResponseSha) {
        throw new Error("EVALUATOR_V2_FROZEN_RESPONSE_HASH_MISMATCH");
      }
      const chunks = chunkFrozenResponse(rawResponse);
      const chunkFile = `${evaluatorV2Directory}/response-chunks/${opaqueResponseId}.json`;
      const chunkBytes = jsonBytes({
        schemaVersion: 1,
        opaqueResponseId,
        chunks,
      });
      await writePrivate(resolve(stagingRoot, "response-chunks", `${opaqueResponseId}.json`), chunkBytes);
      const rendered = object(await runSourceBridge(repositoryRoot, "render", {
        mastRoot,
        familyId: caseId,
        responseChunks: chunks,
      }), "v2 rendered evaluator prompt");
      const rubricValue = await readJson(
        resolve(mastRoot, `benchmarks/donoharm/dataset/rubrics/${caseId}.json`),
      );
      const rubricSourceOptionIds = rubricOptions(rubricValue, caseId).map(({ id }) => id);
      const transportExtension = renderEvaluatorV2TransportExtension(
        directive,
        rubricSourceOptionIds,
      );
      const sourceOrderDeclaration = `${JSON.stringify(rubricSourceOptionIds)}\n`;
      if (!transportExtension.includes(sourceOrderDeclaration)) {
        throw new Error("EVALUATOR_V2_CANONICAL_OPTION_ORDER_MISSING");
      }
      const packet = `${string(rendered.renderedMatchingPrompt, "v2 matching prompt")}\n\n${transportExtension}`;
      const packetFile = `${evaluatorV2Directory}/packets/${opaqueResponseId}.txt`;
      await writePrivate(resolve(stagingRoot, "packets", `${opaqueResponseId}.txt`), packet);
      responseRecords.push({
        opaqueResponseId,
        caseId,
        generationOutputFile: responseFile,
        exactGenerationOutputSha256: expectedResponseSha,
        chunkFile,
        exactChunkFileSha256: sha256(chunkBytes),
        chunkCount: chunks.length,
        reconstructionVerified: chunks.map(({ text }) => text).join("") === rawResponse,
        rubricSourceOptionIds,
        rubricSourceOptionOrderSha256: sha256(JSON.stringify(rubricSourceOptionIds)),
        canonicalOptionOrderDeclared: true,
        packetFile,
        exactPacketSha256: sha256(packet),
        exactPacketUtf8Bytes: Buffer.byteLength(packet, "utf8"),
      });
    }
    const recordByOpaque = new Map(responseRecords.map((record) => [record.opaqueResponseId, record]));
    const v2Schedule = v1Schedule.map((record) => {
      const response = recordByOpaque.get(record.opaqueResponseId);
      if (!response || response.caseId !== record.caseId) {
        throw new Error("EVALUATOR_V2_SCHEDULE_RESPONSE_MISMATCH");
      }
      return {
        ...record,
        packetFile: response.packetFile,
        exactPacketSha256: response.exactPacketSha256,
      };
    });
    const scheduleValue = {
      schemaVersion: 1,
      directiveId: evaluatorV2DirectiveId,
      conditionMapSealed: true,
      reusedExactV1Order: true,
      v1ScheduleSha256: evaluatorV1ScheduleSha256,
      records: v2Schedule,
    };
    const scheduleBytes = jsonBytes(scheduleValue);
    await writePrivate(resolve(stagingRoot, "primary-evaluation-schedule.json"), scheduleBytes);

    const chunkReceipt = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_v2_chunk_reconstruction_verification",
      directiveId: evaluatorV2DirectiveId,
      responseCount: 96,
      unicodeChunkMaximumCodePoints: 160,
      normalization: "NONE",
      allReconstructionsByteExact: responseRecords.every(({ reconstructionVerified }) => reconstructionVerified),
      allCanonicalOptionOrdersDeclared: responseRecords.every(
        ({ canonicalOptionOrderDeclared }) => canonicalOptionOrderDeclared,
      ),
      records: responseRecords,
      conditionMapSealed: true,
    };
    const chunkReceiptBytes = jsonBytes(chunkReceipt);
    await writePrivate(resolve(stagingRoot, "chunk-reconstruction-receipt.json"), chunkReceiptBytes);

    const preparedAt = new Date().toISOString();
    const progress: V2CaptureProgress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_primary_capture_progress",
      directiveId: evaluatorV2DirectiveId,
      createdAt: preparedAt,
      updatedAt: preparedAt,
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    };
    acceptV2CaptureProgress(scheduleValue, progress);
    await writePrivate(resolve(stagingRoot, "primary-capture-progress.json"), jsonBytes(progress));

    const preflight = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_blinded_evaluation_v2_preflight",
      directiveId: evaluatorV2DirectiveId,
      preparedAt,
      sourceCommit,
      sourceTree,
      generationLedgerSha256:
        "cb3cb8a4fc2fbb5a27ca25dd841a8bc6c7703b1a0ac5bf412675de29d708fef3",
      v1CaptureProgressSha256: evaluatorV1ProgressSha256,
      v1OpaqueMapSha256: evaluatorV1OpaqueMapSha256,
      v1ScheduleSha256: evaluatorV1ScheduleSha256,
      v2DirectiveSha256: evaluatorV2DirectiveSha256,
      metricAdapterProbePassed: true,
      matchedResponseActionScore: 0,
      unmatchedResponseActionScore: 5,
      chunkReconstructionReceiptSha256: sha256(chunkReceiptBytes),
      v2ScheduleSha256: sha256(scheduleBytes),
      responseCount: 96,
      primaryJudgmentCount: 192,
      v1ValidJudgmentsCarriedForward: 0,
      conditionMapSealed: true,
      providerApiCredentialsUsed: false,
      totalExternalSpendUsd: 0,
      unblindingAuthorized: false,
      status: "BLINDED_EVALUATION_V2_PREFLIGHT_ACCEPTED",
    };
    const preflightBytes = jsonBytes(preflight);
    await writePrivate(resolve(stagingRoot, "evaluation-v2-preflight-receipt.json"), preflightBytes);
    await rename(stagingRoot, finalRoot);
    return {
      status: "BLINDED_EVALUATION_V2_PREFLIGHT_ACCEPTED",
      responseCount: 96,
      primaryJudgmentCount: 192,
      chunkReconstructionReceiptSha256: sha256(chunkReceiptBytes),
      v2ScheduleSha256: sha256(scheduleBytes),
      preflightSha256: sha256(preflightBytes),
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

async function validateContainedPrivateFile(
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

export async function validateEvaluatorV2OutputFile(input: {
  mastRoot: string;
  artifactRoot: string;
  opaqueResponseId: string;
  outputFile: string;
}): Promise<{
  status: "VALID";
  caseId: string;
  opaqueResponseId: string;
  exactOutputSha256: string;
  exactOutputUtf8Bytes: number;
}> {
  const chunkReceipt = object(
    await readJson(resolve(input.artifactRoot, evaluatorV2Directory, "chunk-reconstruction-receipt.json")),
    "v2 chunk receipt",
  );
  const record = array(chunkReceipt.records, "v2 chunk records").map((entry) => object(entry, "v2 chunk record"))
    .find(({ opaqueResponseId }) => opaqueResponseId === input.opaqueResponseId);
  if (!record) throw new Error("EVALUATOR_V2_OPAQUE_ID_NOT_FOUND");
  const outputPath = await realpath(resolve(input.artifactRoot, input.outputFile));
  const artifactRoot = await realpath(input.artifactRoot);
  const rel = relative(artifactRoot, outputPath);
  const info = await lstat(outputPath);
  if (rel.startsWith("..") || isAbsolute(rel) || !info.isFile()
    || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    throw new Error("EVALUATOR_V2_OUTPUT_FILE_INVALID");
  }
  const [rawOutput, rawResponse, chunkValue, rubricValue] = await Promise.all([
    readFile(outputPath, "utf8"),
    readFile(resolve(input.artifactRoot, string(record.generationOutputFile, "generation output file")), "utf8"),
    readJson(resolve(input.artifactRoot, string(record.chunkFile, "chunk file"))),
    readJson(resolve(input.mastRoot, `benchmarks/donoharm/dataset/rubrics/${record.caseId}.json`)),
  ]);
  const chunks = array(object(chunkValue, "chunk file").chunks, "chunks").map((entry, index) => {
    const chunk = object(entry, `chunks[${index}]`);
    return { id: integer(chunk.id, "chunk id"), text: typeof chunk.text === "string" ? chunk.text : "" };
  });
  parseAndValidateEvaluatorV2Output({
    rawOutput,
    rawResponse,
    chunks,
    caseId: string(record.caseId, "case id"),
    opaqueResponseId: input.opaqueResponseId,
    rubricValue,
  });
  return {
    status: "VALID",
    caseId: string(record.caseId, "case id"),
    opaqueResponseId: input.opaqueResponseId,
    exactOutputSha256: sha256(rawOutput),
    exactOutputUtf8Bytes: Buffer.byteLength(rawOutput, "utf8"),
  };
}

export async function activateEvaluatorV2RetryExtension(input: {
  repositoryRoot: string;
  artifactRoot: string;
}): Promise<{
  status: "BLINDED_EVALUATOR_V2_RETRY_EXTENSION_ACTIVATED";
  validJudgmentCount: 29;
  mechanicalFailureCount: 3;
  nextOrdinal: 30;
  nextAttempt: 3;
  priorProgressSha256: string;
  resumedProgressSha256: string;
  activationReceiptSha256: string;
}> {
  const repositoryRoot = await realpath(input.repositoryRoot);
  const artifactRoot = await realpath(input.artifactRoot);
  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  await assertPrivateDirectory(artifactRoot);
  await assertPrivateDirectory(evaluationRoot);
  const [directiveBytes, sourceReceiptValue, admissionReceiptValue, scheduleValue, progressBytes] =
    await Promise.all([
      readFile(resolve(repositoryRoot, v2RetryExtensionDirectivePath)),
      readJson(resolve(repositoryRoot, v2RetryExtensionSourceReceiptPath)),
      readJson(resolve(repositoryRoot, v2RetryExtensionAdmissionReceiptPath)),
      readJson(resolve(evaluationRoot, "primary-evaluation-schedule.json")),
      readFile(resolve(evaluationRoot, "primary-capture-progress.json")),
    ]);
  if (sha256(directiveBytes) !== v2RetryExtensionDirectiveSha256
    || sha256(progressBytes) !== v2RetryExtensionStartingProgressSha256) {
    throw new Error("EVALUATOR_V2_RETRY_EXTENSION_SOURCE_IDENTITY_INVALID");
  }
  const directive = object(JSON.parse(directiveBytes.toString("utf8")), "v2 retry extension directive");
  const sourceReceipt = object(sourceReceiptValue, "v2 retry extension source receipt");
  const source = object(sourceReceipt.source, "v2 retry extension source");
  const admissionReceipt = object(admissionReceiptValue, "v2 retry extension admission receipt");
  const liveAdmission = object(admissionReceipt.liveAdmission, "v2 retry extension live admission");
  const directiveReceipt = object(admissionReceipt.directive, "v2 retry extension admission directive");
  if (directive.directiveId !== evaluatorV2RetryExtensionDirectiveId
    || object(directive.retryPolicyAmendment, "v2 retry policy amendment")
      .replacementMaximumAttemptsPerEvaluatorReplicate !== 4
    || object(directive.ordinal30Recovery, "ordinal 30 recovery").nextAction !== "DISPATCH_ATTEMPT_3"
    || source.exactResponseBodySha256 !== directiveReceipt.sourceBodySha256
    || source.exactDirectiveJsonSha256 !== v2RetryExtensionDirectiveSha256
    || directiveReceipt.directiveJsonSha256 !== v2RetryExtensionDirectiveSha256
    || liveAdmission.mayExecute !== true
    || liveAdmission.admitted !== true
    || liveAdmission.primaryDecision !== "ALLOW_BOUNDED_EXECUTION") {
    throw new Error("EVALUATOR_V2_RETRY_EXTENSION_AUTHORITY_INVALID");
  }
  const activatedAt = new Date().toISOString();
  const resumedProgress = applyV2RetryExtensionToProgress(
    scheduleValue,
    JSON.parse(progressBytes.toString("utf8")),
    activatedAt,
  );
  const resumedProgressBytes = jsonBytes(resumedProgress);
  const resumedProgressSha256 = sha256(resumedProgressBytes);
  const receipt = {
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_blinded_evaluator_v2_retry_extension_activation",
    taskId: "askrigor-external-evaluation-contribution-v1",
    directiveId: evaluatorV2RetryExtensionDirectiveId,
    activatedAt,
    directiveSha256: v2RetryExtensionDirectiveSha256,
    sourceMessageId: source.assistantMessageId,
    sourceBodySha256: source.exactResponseBodySha256,
    runtimeAdmissionRequestId: liveAdmission.requestId,
    runtimeAdmissionResponseSha256: liveAdmission.responseBodySha256,
    runtimeAdmissionMayExecute: true,
    priorProgressSha256: v2RetryExtensionStartingProgressSha256,
    resumedProgressSha256,
    carriedForwardValidJudgmentCount: 29,
    retainedMechanicalFailureCount: 3,
    nextOrdinal: 30,
    nextAttempt: 3,
    maximumAttemptsPerEvaluatorReplicate: 4,
    packetBytesChanged: false,
    scheduleChanged: false,
    conditionMapSealed: true,
    externalSpendUsd: 0,
  };
  const receiptBytes = jsonBytes(receipt);
  const activationReceiptPath = resolve(evaluationRoot, "retry-extension-v1-activation-receipt.json");
  const progressPath = resolve(evaluationRoot, "primary-capture-progress.json");
  const receiptTemporary = resolve(evaluationRoot, `.retry-extension-v1-activation.${process.pid}.${Date.now()}.tmp`);
  const progressTemporary = resolve(evaluationRoot, `.primary-capture-progress.${process.pid}.${Date.now()}.tmp`);
  await writePrivate(receiptTemporary, receiptBytes);
  await writePrivate(progressTemporary, resumedProgressBytes);
  await rename(receiptTemporary, activationReceiptPath);
  await chmod(activationReceiptPath, 0o600);
  await rename(progressTemporary, progressPath);
  await chmod(progressPath, 0o600);
  return {
    status: "BLINDED_EVALUATOR_V2_RETRY_EXTENSION_ACTIVATED",
    validJudgmentCount: 29,
    mechanicalFailureCount: 3,
    nextOrdinal: 30,
    nextAttempt: 3,
    priorProgressSha256: v2RetryExtensionStartingProgressSha256,
    resumedProgressSha256,
    activationReceiptSha256: sha256(receiptBytes),
  };
}

export async function recordEvaluatorV2Attempt(input: {
  mastRoot: string;
  artifactRoot: string;
  receiptValue: unknown;
}): Promise<{
  status: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  ordinal: number;
  attempt: 1 | 2 | 3 | 4;
  validJudgmentCount: number;
  mechanicalFailureCount: number;
  haltedClaim: V2CaptureProgress["haltedClaim"];
}> {
  const artifactRoot = await realpath(input.artifactRoot);
  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  await assertPrivateDirectory(artifactRoot);
  await assertPrivateDirectory(evaluationRoot);
  const schedulePath = resolve(evaluationRoot, "primary-evaluation-schedule.json");
  const progressPath = resolve(evaluationRoot, "primary-capture-progress.json");
  const [scheduleValue, progressValue] = await Promise.all([readJson(schedulePath), readJson(progressPath)]);
  const schedule = v2ScheduleRecords(scheduleValue);
  const progress = acceptV2CaptureProgress(scheduleValue, progressValue);
  if (progress.haltedClaim) throw new Error(progress.haltedClaim);
  if (progress.records.length === 192) throw new Error("EVALUATOR_V2_PRIMARY_ALREADY_COMPLETE");
  const root = object(input.receiptValue, "v2 evaluator receipt");
  const receipt = root.status === "VALID"
    ? validV2CaptureSchema.parse(root)
    : failedV2CaptureSchema.parse(root);
  const expectedOrdinal = progress.records.length + 1;
  const expected = schedule[expectedOrdinal - 1]!;
  const failures = progress.mechanicalFailures.filter(({ ordinal }) => ordinal === expectedOrdinal);
  const expectedAttempt = failures.length + 1;
  if (receipt.ordinal !== expectedOrdinal || receipt.attempt !== expectedAttempt
    || !sameSlot(receipt, expected)
    || receipt.inputFile !== expected.packetFile
    || receipt.exactInputSha256 !== expected.exactPacketSha256) {
    throw new Error("EVALUATOR_V2_RECEIPT_NOT_NEXT_ATTEMPT");
  }
  const packet = await readFile(resolve(artifactRoot, expected.packetFile));
  if (sha256(packet) !== expected.exactPacketSha256) throw new Error("EVALUATOR_V2_PACKET_HASH_MISMATCH");
  let status: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  if (receipt.status === "VALID") {
    const validation = await validateEvaluatorV2OutputFile({
      mastRoot: input.mastRoot,
      artifactRoot,
      opaqueResponseId: receipt.opaqueResponseId,
      outputFile: receipt.outputFile,
    });
    if (validation.exactOutputSha256 !== receipt.exactOutputSha256
      || validation.exactOutputUtf8Bytes !== receipt.exactOutputUtf8Bytes
      || validation.caseId !== receipt.caseId) {
      throw new Error("EVALUATOR_V2_VALID_RECEIPT_MISMATCH");
    }
    progress.records.push(receipt);
    status = "VALID_RECORDED";
  } else {
    if (receipt.outputFile !== null) {
      await validateContainedPrivateFile(
        artifactRoot,
        receipt.outputFile,
        receipt.exactOutputSha256!,
        receipt.exactOutputUtf8Bytes!,
      );
    }
    progress.mechanicalFailures.push(receipt);
    if (receipt.attempt === 4) {
      progress.haltedClaim = extendedFourAttemptHaltClaim;
      status = "UNRESOLVED_SLOT_RECORDED";
    } else {
      status = "MECHANICAL_FAILURE_RECORDED";
    }
  }
  progress.validJudgmentCount = progress.records.length;
  progress.mechanicalFailureCount = progress.mechanicalFailures.length;
  progress.updatedAt = new Date().toISOString();
  acceptV2CaptureProgress(scheduleValue, progress);
  const temporary = resolve(evaluationRoot, `.primary-capture-progress.${process.pid}.${Date.now()}.tmp`);
  await writePrivate(temporary, jsonBytes(progress));
  await rename(temporary, progressPath);
  await chmod(progressPath, 0o600);
  return {
    status,
    ordinal: receipt.ordinal,
    attempt: receipt.attempt,
    validJudgmentCount: progress.validJudgmentCount,
    mechanicalFailureCount: progress.mechanicalFailureCount,
    haltedClaim: progress.haltedClaim,
  };
}
