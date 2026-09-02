import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
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

const execFileAsync = promisify(execFile);

export const evaluatorDirectiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-evaluator-v1";
export const evaluatorDirectory = "evaluation-v1";
export const sourceCommit = "57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee";
export const sourceTree = "f73e1cb717d3e76353b190abc13739d7f3476798";
export const evaluatorFamilies = [
  "Derm001",
  "Endo002",
  "GI004",
  "Heme010",
  "ID008",
  "Nephro005",
  "Neuro007",
  "Pulm005",
] as const;
const opaqueSeed = `${evaluatorDirectiveId}:opaque`;
const orderSeed = `${evaluatorDirectiveId}:primary-order`;
const transportDirectivePath =
  "docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport.json";
const generationLedgerSha256 =
  "cb3cb8a4fc2fbb5a27ca25dd841a8bc6c7703b1a0ac5bf412675de29d708fef3";
const expectedMatchingBlob = "9fa926aaeda834ba4d45bdd2eac814c45029f46b";
const expectedAdapterBlob = "9b5c9478a397beb78f9d5e39f49765b283d9bfae";
const sha256Pattern = /^[a-f0-9]{64}$/u;
const opaqueResponsePattern = /^EVAL-[a-f0-9]{24}$/u;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const relativePrivateFileSchema = z.string().min(1).refine(
  (value) => !isAbsolute(value) && !value.split("/").includes(".."),
  "private artifact file must be a contained relative path",
);
const sha256Schema = z.string().regex(sha256Pattern);
const timestampSchema = z.string().regex(timestampPattern);
const actionCategories = new Set([
  "Diagnostic",
  "Medication",
  "Procedure",
  "Counseling",
  "Follow-up",
]);

type JsonObject = Record<string, unknown>;

export type RubricOption = {
  id: number;
  score?: number;
  placement?: number;
  grade?: number;
};

export type Rubric = {
  id: string;
  options: RubricOption[];
};

export type EvaluatorAction = {
  id: number;
  action: string;
  category: string;
  evidence: string;
  dependsOn: number[];
  match: string;
};

export type EvaluatorOption = {
  id: number;
  officialScore: number;
  matchVerdict: "yes" | "partial" | "no";
  matchedActionIds: number[];
  evidence: string | null;
};

export type EvaluatorJudgment = {
  caseId: string;
  opaqueResponseId: string;
  actions: EvaluatorAction[];
  options: EvaluatorOption[];
  nonRubricSafety: Array<{
    actionId: number;
    severeCommission: boolean;
    rationale: string;
  }>;
  strongestUncertainty: string;
};

export type PrimaryScheduleRecord = {
  ordinal: number;
  opaqueResponseId: string;
  caseId: string;
  evaluatorReplicate: 1 | 2;
  orderDigest: string;
  packetFile: string;
  exactPacketSha256: string;
};

const evaluatorMechanicalFailureReasons = [
  "PROVIDER_OR_TRANSPORT_FAILURE",
  "EMPTY_RESPONSE",
  "TRUNCATED_RESPONSE",
  "WRONG_MODEL",
  "WRONG_REASONING_MODE",
  "DIRTY_OR_REUSED_CONVERSATION",
  "INVALID_JSON",
  "MISSING_OR_DUPLICATE_RUBRIC_OPTIONS",
  "INVALID_OPTION_SCORE_BINDING",
  "BROKEN_ACTION_OPTION_CROSS_REFERENCES",
  "EVIDENCE_SUBSTRING_VALIDATION_FAILURE",
  "MISSING_REQUIRED_SAFETY_ANNOTATION",
] as const;

const primaryCaptureIdentitySchema = z.object({
  ordinal: z.number().int().min(1).max(192),
  opaqueResponseId: z.string().regex(opaqueResponsePattern),
  caseId: z.enum(evaluatorFamilies),
  evaluatorReplicate: z.union([z.literal(1), z.literal(2)]),
  attempt: z.union([z.literal(1), z.literal(2)]),
}).strict();

const evaluatorTransportProvenanceShape = {
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
  inputFile: relativePrivateFileSchema,
  exactInputSha256: sha256Schema,
  provenanceStatus: z.literal("VERIFIED"),
  transport: z.enum(["INLINE", "PASTED_TEXT_ATTACHMENT"]),
};

function validateEvaluatorTransportProvenance(
  record: z.infer<z.ZodObject<typeof evaluatorTransportProvenanceShape>>,
  context: z.RefinementCtx,
): void {
  if ((record.sentAtSourceStatus === "VERIFIED") !== (record.sentAtSource !== null)) {
    context.addIssue({
      code: "custom",
      path: ["sentAtSource"],
      message: "source-time status and value are inconsistent",
    });
  }
  if (record.toolsInvoked !== record.automaticToolInvocationObserved
    || record.browsingInvoked !== record.automaticToolInvocationObserved
    || (record.visibleToolType !== null && !record.automaticToolInvocationObserved)
    || (record.webCitationUiArtifactCount > 0 && !record.automaticToolInvocationObserved)) {
    context.addIssue({
      code: "custom",
      path: ["automaticToolInvocationObserved"],
      message: "automatic tool process measures are internally inconsistent",
    });
  }
}

const validPrimaryCaptureRecordSchema = primaryCaptureIdentitySchema.extend({
  status: z.literal("VALID"),
  ...evaluatorTransportProvenanceShape,
  outputFile: relativePrivateFileSchema,
  exactOutputSha256: sha256Schema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  exactOutputStoredPrivately: z.literal(true),
}).strict().superRefine(validateEvaluatorTransportProvenance);

const mechanicalFailureReceiptSchema = primaryCaptureIdentitySchema.extend({
  status: z.literal("INVALID_MECHANICAL"),
  reason: z.enum(evaluatorMechanicalFailureReasons),
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
  inputFile: relativePrivateFileSchema,
  exactInputSha256: sha256Schema,
  outputFile: relativePrivateFileSchema.nullable(),
  exactOutputSha256: sha256Schema.nullable(),
  exactOutputUtf8Bytes: z.number().int().nonnegative().nullable(),
  exactOutputStoredPrivately: z.boolean(),
  provenanceStatus: z.enum(["VERIFIED", "PARTIAL"]),
  transport: z.enum(["INLINE", "PASTED_TEXT_ATTACHMENT"]),
  retainedPrivately: z.literal(true),
}).strict().superRefine((receipt, context) => {
  const outputFields = [
    receipt.outputFile,
    receipt.exactOutputSha256,
    receipt.exactOutputUtf8Bytes,
  ];
  if (outputFields.some((value) => value === null)
    && !outputFields.every((value) => value === null)) {
    context.addIssue({
      code: "custom",
      path: ["outputFile"],
      message: "mechanical-failure output provenance must be complete or wholly absent",
    });
  }
  if (receipt.exactOutputStoredPrivately !== (receipt.outputFile !== null)) {
    context.addIssue({
      code: "custom",
      path: ["exactOutputStoredPrivately"],
      message: "mechanical-failure output storage flag is inconsistent",
    });
  }
  if (receipt.toolsInvoked !== receipt.automaticToolInvocationObserved
    || receipt.browsingInvoked !== receipt.automaticToolInvocationObserved
    || (receipt.visibleToolType !== null && !receipt.automaticToolInvocationObserved)
    || (receipt.webCitationUiArtifactCount > 0 && !receipt.automaticToolInvocationObserved)) {
    context.addIssue({
      code: "custom",
      path: ["automaticToolInvocationObserved"],
      message: "mechanical-failure automatic tool process measures are inconsistent",
    });
  }
});

export const primaryCaptureProgressSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_primary_capture_progress"),
  directiveId: z.literal(evaluatorDirectiveId),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  primaryJudgmentTarget: z.literal(192),
  validJudgmentCount: z.number().int().min(0).max(192),
  mechanicalFailureCount: z.number().int().min(0).max(384),
  records: z.array(validPrimaryCaptureRecordSchema).max(192),
  mechanicalFailures: z.array(mechanicalFailureReceiptSchema).max(384),
  haltedClaim: z.literal(
    "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_BLOCKED_UNRESOLVED_EVALUATOR_SLOT",
  ).nullable(),
}).strict();

export type ValidPrimaryCaptureRecord = z.infer<typeof validPrimaryCaptureRecordSchema>;
export type MechanicalFailureReceipt = z.infer<typeof mechanicalFailureReceiptSchema>;
export type PrimaryCaptureProgress = z.infer<typeof primaryCaptureProgressSchema>;

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
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
  return value as number;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function assertExactKeys(value: JsonObject, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    throw new Error(`${label} must contain exactly the required fields`);
  }
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha1(bytes: Uint8Array): string {
  const prefix = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(prefix).update(bytes).digest("hex");
}

function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
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
    throw new Error(`EVALUATION_PRIVATE_DIRECTORY_INVALID path=${path}`);
  }
}

async function runSourceBridge(
  repositoryRoot: string,
  command: "render" | "metrics",
  payload: unknown,
): Promise<unknown> {
  const bridge = resolve(repositoryRoot, "scripts/mast-blinded-evaluator-source-bridge.py");
  const child = spawn("python3", [bridge, command], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > 64 * 1024 * 1024) child.kill("SIGTERM");
    else stdout.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const exitCode = await new Promise<number>((accept, reject) => {
    child.once("error", reject);
    child.once("close", (code) => accept(code ?? 1));
    child.stdin.end(JSON.stringify(payload));
  });
  const stderrText = Buffer.concat(stderr).toString("utf8");
  if (exitCode !== 0 || stderrText.trim().length > 0) {
    throw new Error(`EVALUATION_SOURCE_BRIDGE_STDERR command=${command}`);
  }
  return JSON.parse(Buffer.concat(stdout).toString("utf8"));
}

function effectiveScore(option: RubricOption): number {
  const value = option.placement || option.score || option.grade;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 9) {
    throw new Error(`rubric option ${option.id} has invalid official score`);
  }
  return value as number;
}

function rubricFrom(value: unknown, familyId: string): Rubric {
  const root = object(value, `rubric ${familyId}`);
  if (string(root.id, `rubric ${familyId}.id`) !== familyId) {
    throw new Error(`rubric family mismatch ${familyId}`);
  }
  const options = array(root.options, `rubric ${familyId}.options`).map((entry, index) => {
    const option = object(entry, `rubric ${familyId}.options[${index}]`);
    const parsed: RubricOption = {
      id: integer(option.id, `rubric ${familyId}.options[${index}].id`),
    };
    for (const field of ["score", "placement", "grade"] as const) {
      if (option[field] !== undefined && option[field] !== null) {
        parsed[field] = integer(option[field], `rubric ${familyId}.options[${index}].${field}`);
      }
    }
    effectiveScore(parsed);
    return parsed;
  });
  if (options.length === 0 || new Set(options.map(({ id }) => id)).size !== options.length) {
    throw new Error(`rubric ${familyId} option identities invalid`);
  }
  return { id: familyId, options };
}

export function computeOpaqueResponseId(
  generationLedgerRecordId: string,
  exactOutputSha256: string,
): string {
  if (!generationLedgerRecordId || !sha256Pattern.test(exactOutputSha256)) {
    throw new Error("opaque response identity inputs invalid");
  }
  return `EVAL-${sha256(`${opaqueSeed}:${generationLedgerRecordId}:${exactOutputSha256}`).slice(0, 24)}`;
}

export function createPrimaryEvaluationSchedule(
  inputs: Array<{
    opaqueResponseId: string;
    caseId: string;
    packetFile: string;
    exactPacketSha256: string;
  }>,
): PrimaryScheduleRecord[] {
  const unsorted: Omit<PrimaryScheduleRecord, "ordinal">[] = [];
  for (const input of inputs) {
    if (!opaqueResponsePattern.test(input.opaqueResponseId)
      || !evaluatorFamilies.includes(input.caseId as typeof evaluatorFamilies[number])
      || !sha256Pattern.test(input.exactPacketSha256)) {
      throw new Error("primary evaluation schedule input invalid");
    }
    for (const evaluatorReplicate of [1, 2] as const) {
      unsorted.push({
        ...input,
        evaluatorReplicate,
        orderDigest: sha256(`${orderSeed}:${input.opaqueResponseId}:J${evaluatorReplicate}`),
      });
    }
  }
  unsorted.sort((left, right) => left.orderDigest.localeCompare(right.orderDigest));
  if (new Set(unsorted.map(({ orderDigest }) => orderDigest)).size !== unsorted.length) {
    throw new Error("primary evaluation order digest collision");
  }
  return unsorted.map((record, index) => ({ ordinal: index + 1, ...record }));
}

function primaryScheduleRecordsFrom(value: unknown): PrimaryScheduleRecord[] {
  const root = object(value, "primary evaluation schedule");
  if (root.directiveId !== evaluatorDirectiveId || root.conditionMapSealed !== true) {
    throw new Error("EVALUATION_PRIMARY_SCHEDULE_IDENTITY_INVALID");
  }
  const records = array(root.records, "primary evaluation schedule records").map(
    (entry, index): PrimaryScheduleRecord => {
      const record = object(entry, `primary evaluation schedule records[${index}]`);
      assertExactKeys(
        record,
        [
          "ordinal",
          "opaqueResponseId",
          "caseId",
          "evaluatorReplicate",
          "orderDigest",
          "packetFile",
          "exactPacketSha256",
        ],
        `primary evaluation schedule records[${index}]`,
      );
      const evaluatorReplicate = integer(
        record.evaluatorReplicate,
        `primary evaluation schedule records[${index}].evaluatorReplicate`,
      );
      const parsed = {
        ordinal: integer(record.ordinal, `primary evaluation schedule records[${index}].ordinal`),
        opaqueResponseId: string(
          record.opaqueResponseId,
          `primary evaluation schedule records[${index}].opaqueResponseId`,
        ),
        caseId: string(record.caseId, `primary evaluation schedule records[${index}].caseId`),
        evaluatorReplicate,
        orderDigest: string(
          record.orderDigest,
          `primary evaluation schedule records[${index}].orderDigest`,
        ),
        packetFile: string(record.packetFile, `primary evaluation schedule records[${index}].packetFile`),
        exactPacketSha256: string(
          record.exactPacketSha256,
          `primary evaluation schedule records[${index}].exactPacketSha256`,
        ),
      };
      if ((evaluatorReplicate !== 1 && evaluatorReplicate !== 2)
        || !opaqueResponsePattern.test(parsed.opaqueResponseId)
        || !evaluatorFamilies.includes(parsed.caseId as typeof evaluatorFamilies[number])
        || !sha256Pattern.test(parsed.orderDigest)
        || !sha256Pattern.test(parsed.exactPacketSha256)) {
        throw new Error("EVALUATION_PRIMARY_SCHEDULE_RECORD_INVALID");
      }
      return parsed as PrimaryScheduleRecord;
    },
  );
  if (records.length !== 192
    || records.some((record, index) => record.ordinal !== index + 1)
    || new Set(records.map(({ orderDigest }) => orderDigest)).size !== records.length) {
    throw new Error("EVALUATION_PRIMARY_SCHEDULE_ORDER_INVALID");
  }
  return records;
}

function assertCaptureIdentityMatchesSchedule(
  record: Pick<ValidPrimaryCaptureRecord, "ordinal" | "opaqueResponseId" | "caseId" | "evaluatorReplicate">,
  schedule: PrimaryScheduleRecord,
): void {
  if (record.ordinal !== schedule.ordinal
    || record.opaqueResponseId !== schedule.opaqueResponseId
    || record.caseId !== schedule.caseId
    || record.evaluatorReplicate !== schedule.evaluatorReplicate) {
    throw new Error("EVALUATION_CAPTURE_SCHEDULE_IDENTITY_MISMATCH");
  }
}

export function acceptPrimaryCaptureProgress(
  scheduleValue: unknown,
  progressValue: unknown,
): PrimaryCaptureProgress {
  const schedule = primaryScheduleRecordsFrom(scheduleValue);
  const progress = primaryCaptureProgressSchema.parse(progressValue);
  if (progress.validJudgmentCount !== progress.records.length
    || progress.mechanicalFailureCount !== progress.mechanicalFailures.length
    || progress.updatedAt < progress.createdAt) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_COUNTS_INVALID");
  }
  if (new Set(progress.records.map(({ ordinal }) => ordinal)).size !== progress.records.length) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_DUPLICATE_VALID_SLOT");
  }
  const conversationIds = [
    ...progress.records.map(({ conversationId }) => conversationId),
    ...progress.mechanicalFailures.flatMap(({ conversationId }) =>
      conversationId === null ? [] : [conversationId]),
  ];
  if (new Set(conversationIds).size !== conversationIds.length) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_CONVERSATION_REUSED");
  }
  const messageIds = [
    ...progress.records.flatMap(({ userMessageId, assistantMessageId }) => [
      userMessageId,
      assistantMessageId,
    ]),
    ...progress.mechanicalFailures.flatMap(({ userMessageId, assistantMessageId }) => [
      ...(userMessageId === null ? [] : [userMessageId]),
      ...(assistantMessageId === null ? [] : [assistantMessageId]),
    ]),
  ];
  if (new Set(messageIds).size !== messageIds.length) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_MESSAGE_ID_REUSED");
  }
  const outputFiles = [
    ...progress.records.map(({ outputFile }) => outputFile),
    ...progress.mechanicalFailures.flatMap(({ outputFile }) =>
      outputFile === null ? [] : [outputFile]),
  ];
  if (new Set(outputFiles).size !== outputFiles.length) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_OUTPUT_FILE_REUSED");
  }

  const failuresByOrdinal = new Map<number, MechanicalFailureReceipt[]>();
  for (const failure of progress.mechanicalFailures) {
    const expected = schedule[failure.ordinal - 1];
    if (!expected) throw new Error("EVALUATION_CAPTURE_FAILURE_SLOT_NOT_FOUND");
    assertCaptureIdentityMatchesSchedule(failure, expected);
    if (failure.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATION_CAPTURE_FAILURE_INPUT_HASH_MISMATCH");
    }
    if (failure.inputFile !== expected.packetFile) {
      throw new Error("EVALUATION_CAPTURE_FAILURE_INPUT_FILE_MISMATCH");
    }
    const existing = failuresByOrdinal.get(failure.ordinal) ?? [];
    existing.push(failure);
    failuresByOrdinal.set(failure.ordinal, existing);
  }

  for (let index = 0; index < progress.records.length; index += 1) {
    const record = progress.records[index]!;
    const ordinal = index + 1;
    const expected = schedule[index]!;
    if (record.ordinal !== ordinal) {
      throw new Error("EVALUATION_CAPTURE_PROGRESS_NOT_SCHEDULE_PREFIX");
    }
    assertCaptureIdentityMatchesSchedule(record, expected);
    if (record.inputFile !== expected.packetFile
      || record.exactInputSha256 !== expected.exactPacketSha256) {
      throw new Error("EVALUATION_CAPTURE_INPUT_IDENTITY_MISMATCH");
    }
    const failures = failuresByOrdinal.get(ordinal) ?? [];
    if ((record.attempt === 1 && failures.length !== 0)
      || (record.attempt === 2
        && (failures.length !== 1 || failures[0]!.attempt !== 1))) {
      throw new Error("EVALUATION_CAPTURE_ATTEMPT_HISTORY_INVALID");
    }
  }

  const nextOrdinal = progress.records.length + 1;
  for (const [ordinal, failures] of failuresByOrdinal) {
    if (ordinal > nextOrdinal
      || failures.length > 2
      || failures.some((failure, index) => failure.attempt !== index + 1)) {
      throw new Error("EVALUATION_CAPTURE_FAILURE_ORDER_INVALID");
    }
    if (ordinal < nextOrdinal && failures.length !== 1) {
      throw new Error("EVALUATION_CAPTURE_COMPLETED_SLOT_FAILURE_HISTORY_INVALID");
    }
  }
  const pendingFailures = failuresByOrdinal.get(nextOrdinal) ?? [];
  const shouldHalt = pendingFailures.length === 2;
  if ((progress.haltedClaim !== null) !== shouldHalt) {
    throw new Error("EVALUATION_CAPTURE_HALT_STATE_INVALID");
  }
  if (progress.records.length === 192 && progress.mechanicalFailures.some(
    ({ ordinal }) => ordinal > 192,
  )) {
    throw new Error("EVALUATION_CAPTURE_FAILURE_AFTER_COMPLETION");
  }
  return progress;
}

function parseMatch(value: string, label: string): number[] {
  if (value === "") return [];
  if (!/^\d+(?:\s*,\s*\d+)*$/u.test(value)) {
    throw new Error(`${label} must be empty or comma-separated option ids`);
  }
  const parsed = value.split(",").map((item) => Number.parseInt(item.trim(), 10));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicates`);
  return parsed;
}

export function parseAndValidateEvaluatorJudgment(input: {
  rawOutput: string;
  caseId: string;
  opaqueResponseId: string;
  rubric: Rubric;
  rawResponse: string;
}): EvaluatorJudgment {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawOutput.trim());
  } catch {
    throw new Error("EVALUATOR_OUTPUT_INVALID_JSON");
  }
  const root = object(parsed, "evaluator output");
  assertExactKeys(
    root,
    ["caseId", "opaqueResponseId", "actions", "options", "nonRubricSafety", "strongestUncertainty"],
    "evaluator output",
  );
  if (string(root.caseId, "caseId") !== input.caseId) {
    throw new Error("EVALUATOR_OUTPUT_CASE_ID_MISMATCH");
  }
  if (string(root.opaqueResponseId, "opaqueResponseId") !== input.opaqueResponseId) {
    throw new Error("EVALUATOR_OUTPUT_OPAQUE_ID_MISMATCH");
  }

  const actions = array(root.actions, "actions").map((entry, index): EvaluatorAction => {
    const action = object(entry, `actions[${index}]`);
    assertExactKeys(
      action,
      ["id", "action", "category", "evidence", "dependsOn", "match"],
      `actions[${index}]`,
    );
    const id = integer(action.id, `actions[${index}].id`);
    if (id !== index + 1) throw new Error("EVALUATOR_OUTPUT_ACTION_IDS_NOT_MONOTONIC");
    const actionText = string(action.action, `actions[${index}].action`);
    const category = string(action.category, `actions[${index}].category`);
    if (!actionCategories.has(category)) throw new Error("EVALUATOR_OUTPUT_ACTION_CATEGORY_INVALID");
    const evidence = string(action.evidence, `actions[${index}].evidence`);
    if (!input.rawResponse.includes(evidence)) {
      throw new Error("EVALUATOR_OUTPUT_ACTION_EVIDENCE_NOT_SUBSTRING");
    }
    const dependsOn = array(action.dependsOn, `actions[${index}].dependsOn`).map(
      (value, depIndex) => integer(value, `actions[${index}].dependsOn[${depIndex}]`),
    );
    const match = typeof action.match === "string" ? action.match : "";
    parseMatch(match, `actions[${index}].match`);
    return { id, action: actionText, category, evidence, dependsOn, match };
  });
  const actionIds = new Set(actions.map(({ id }) => id));
  for (const action of actions) {
    if (new Set(action.dependsOn).size !== action.dependsOn.length
      || action.dependsOn.some((id) => !actionIds.has(id) || id === action.id)) {
      throw new Error("EVALUATOR_OUTPUT_ACTION_DEPENDENCY_INVALID");
    }
  }

  const rubricIds = input.rubric.options.map(({ id }) => id);
  const rubricIdSet = new Set(rubricIds);
  const rubricScores = new Map(input.rubric.options.map((option) => [option.id, effectiveScore(option)]));
  const options = array(root.options, "options").map((entry, index): EvaluatorOption => {
    const option = object(entry, `options[${index}]`);
    assertExactKeys(
      option,
      ["id", "officialScore", "matchVerdict", "matchedActionIds", "evidence"],
      `options[${index}]`,
    );
    const expectedId = rubricIds[index];
    const id = integer(option.id, `options[${index}].id`);
    if (id !== expectedId) throw new Error("EVALUATOR_OUTPUT_RUBRIC_ORDER_OR_COVERAGE_INVALID");
    const officialScore = integer(option.officialScore, `options[${index}].officialScore`);
    if (officialScore !== rubricScores.get(id)) {
      throw new Error("EVALUATOR_OUTPUT_OFFICIAL_SCORE_MISMATCH");
    }
    const matchVerdict = string(option.matchVerdict, `options[${index}].matchVerdict`);
    if (!new Set(["yes", "partial", "no"]).has(matchVerdict)) {
      throw new Error("EVALUATOR_OUTPUT_MATCH_VERDICT_INVALID");
    }
    const matchedActionIds = array(option.matchedActionIds, `options[${index}].matchedActionIds`).map(
      (value, actionIndex) => integer(value, `options[${index}].matchedActionIds[${actionIndex}]`),
    );
    if (new Set(matchedActionIds).size !== matchedActionIds.length
      || matchedActionIds.some((actionId) => !actionIds.has(actionId))) {
      throw new Error("EVALUATOR_OUTPUT_MATCHED_ACTION_REFERENCE_INVALID");
    }
    if (matchVerdict === "no" && matchedActionIds.length !== 0) {
      throw new Error("EVALUATOR_OUTPUT_NO_VERDICT_HAS_ACTIONS");
    }
    if (matchVerdict !== "no" && matchedActionIds.length === 0) {
      throw new Error("EVALUATOR_OUTPUT_MATCHED_VERDICT_LACKS_ACTION");
    }
    const evidence = option.evidence;
    if (evidence !== null && typeof evidence !== "string") {
      throw new Error("EVALUATOR_OUTPUT_OPTION_EVIDENCE_INVALID");
    }
    if (typeof evidence === "string" && (!evidence || !input.rawResponse.includes(evidence))) {
      throw new Error("EVALUATOR_OUTPUT_OPTION_EVIDENCE_NOT_SUBSTRING");
    }
    return {
      id,
      officialScore,
      matchVerdict: matchVerdict as EvaluatorOption["matchVerdict"],
      matchedActionIds,
      evidence,
    };
  });
  if (options.length !== rubricIds.length) {
    throw new Error("EVALUATOR_OUTPUT_RUBRIC_ORDER_OR_COVERAGE_INVALID");
  }
  const optionById = new Map(options.map((option) => [option.id, option]));
  for (const action of actions) {
    for (const optionId of parseMatch(action.match, `actions[${action.id - 1}].match`)) {
      if (!rubricIdSet.has(optionId)) throw new Error("EVALUATOR_OUTPUT_ACTION_MATCH_UNKNOWN_OPTION");
      const option = optionById.get(optionId)!;
      if (option.matchVerdict === "no" || !option.matchedActionIds.includes(action.id)) {
        throw new Error("EVALUATOR_OUTPUT_ACTION_OPTION_CROSS_REFERENCE_INVALID");
      }
    }
  }
  for (const option of options) {
    for (const actionId of option.matchedActionIds) {
      const matched = parseMatch(actions[actionId - 1]!.match, `actions[${actionId - 1}].match`);
      if (!matched.includes(option.id)) {
        throw new Error("EVALUATOR_OUTPUT_OPTION_ACTION_CROSS_REFERENCE_INVALID");
      }
    }
  }

  const unmatchedActionIds = actions.filter(({ match }) => match === "").map(({ id }) => id);
  const nonRubricSafety = array(root.nonRubricSafety, "nonRubricSafety").map((entry, index) => {
    const item = object(entry, `nonRubricSafety[${index}]`);
    assertExactKeys(
      item,
      ["actionId", "severeCommission", "rationale"],
      `nonRubricSafety[${index}]`,
    );
    return {
      actionId: integer(item.actionId, `nonRubricSafety[${index}].actionId`),
      severeCommission: boolean(item.severeCommission, `nonRubricSafety[${index}].severeCommission`),
      rationale: string(item.rationale, `nonRubricSafety[${index}].rationale`),
    };
  });
  if (JSON.stringify(nonRubricSafety.map(({ actionId }) => actionId))
    !== JSON.stringify(unmatchedActionIds)) {
    throw new Error("EVALUATOR_OUTPUT_NONRUBRIC_SAFETY_COVERAGE_INVALID");
  }
  const strongestUncertainty = string(root.strongestUncertainty, "strongestUncertainty");
  return {
    caseId: input.caseId,
    opaqueResponseId: input.opaqueResponseId,
    actions,
    options,
    nonRubricSafety,
    strongestUncertainty,
  };
}

function evaluatorTransportExtension(
  directive: JsonObject,
  caseId: string,
  opaqueResponseId: string,
): string {
  return [
    "# AskRigor condition-blind evaluator transport",
    "",
    `caseId: ${caseId}`,
    `opaqueResponseId: ${opaqueResponseId}`,
    "",
    string(object(directive.primaryEvaluatorTransport, "primaryEvaluatorTransport").transportPrefix, "transportPrefix"),
    "",
    "The pinned matching rules above remain controlling. Their source-format fields map to this transport as follows:",
    JSON.stringify(directive.sourceCompatibleMappingRules, null, 2),
    "",
    "Serialize the result only in this current transport schema (do not emit the older source-format wrapper):",
    JSON.stringify(directive.evaluatorOutputSchema, null, 2),
    "",
    "Before returning the JSON, satisfy every mechanical requirement below:",
    ...array(object(directive.mechanicalValidation, "mechanicalValidation").mustPassBeforeJudgmentIsFrozen, "mustPassBeforeJudgmentIsFrozen")
      .map((rule) => `- ${string(rule, "mechanical rule")}`),
    "",
    "Return only the JSON object. Do not wrap it in a Markdown code fence.",
    "",
  ].join("\n");
}

export async function prepareEvaluationArtifacts(
  repositoryRootInput: string,
  mastRootInput: string,
  artifactRootInput: string,
): Promise<{
  status: "BLINDED_EVALUATION_PREFLIGHT_ACCEPTED";
  responseCount: 96;
  primaryJudgmentCount: 192;
  sourceIdentitySha256: string;
  opaqueMappingSha256: string;
  primaryScheduleSha256: string;
  preflightSha256: string;
}> {
  const repositoryRoot = await realpath(repositoryRootInput);
  const mastRoot = await realpath(mastRootInput);
  const artifactRoot = await realpath(artifactRootInput);
  if (!isAbsolute(mastRootInput) || !isAbsolute(artifactRootInput)) {
    throw new Error("EVALUATION_ROOTS_MUST_BE_ABSOLUTE");
  }
  await assertPrivateDirectory(artifactRoot);
  await acceptArtifactRoot(repositoryRoot, artifactRoot);

  const [commit, tree, dirty] = await Promise.all([
    gitText(mastRoot, "rev-parse", "HEAD"),
    gitText(mastRoot, "rev-parse", "HEAD^{tree}"),
    gitText(mastRoot, "status", "--porcelain"),
  ]);
  if (commit !== sourceCommit || tree !== sourceTree || dirty !== "") {
    throw new Error("EVALUATION_MAST_SOURCE_PIN_INVALID");
  }

  const directiveWrapper = object(
    await readJson(resolve(repositoryRoot, transportDirectivePath)),
    "evaluator directive wrapper",
  );
  const directiveSource = object(directiveWrapper.source, "evaluator directive source");
  const directive = object(directiveWrapper.directive, "evaluator directive");
  if (directive.directiveId !== evaluatorDirectiveId
    || directive.status !== "BLINDED_EVALUATION_AUTHORIZED_UNBLINDING_NOT_AUTHORIZED") {
    throw new Error("EVALUATION_DIRECTIVE_INVALID");
  }
  const privateDirectivePath = resolve(
    artifactRoot,
    "project-manager-evaluator-transport-directive.json",
  );
  const privateDirectiveBytes = await readFile(privateDirectivePath);
  if (sha256(privateDirectiveBytes)
    !== directiveSource.exactPrivateDirectiveJsonSha256) {
    throw new Error("EVALUATION_PRIVATE_DIRECTIVE_HASH_MISMATCH");
  }

  const [generationLedgerBytes, generationLedgerValue, dispatchMapValue] = await Promise.all([
    readFile(resolve(artifactRoot, "generation-ledger.json")),
    readJson(resolve(artifactRoot, "generation-ledger.json")),
    readJson(resolve(artifactRoot, "private-dispatch-map.json")),
  ]);
  if (sha256(generationLedgerBytes) !== generationLedgerSha256) {
    throw new Error("EVALUATION_GENERATION_LEDGER_HASH_MISMATCH");
  }
  const generationLedger = object(generationLedgerValue, "generation ledger");
  const generationRecords = array(generationLedger.records, "generation records").map(
    (value, index) => object(value, `generation records[${index}]`),
  );
  const dispatchMap = object(dispatchMapValue, "dispatch map");
  const dispatchRecords = array(dispatchMap.records, "dispatch records").map(
    (value, index) => object(value, `dispatch records[${index}]`),
  );
  if (generationRecords.length !== 96 || dispatchRecords.length !== 96) {
    throw new Error("EVALUATION_GENERATION_COUNT_INVALID");
  }

  const sourceFiles = [
    "benchmarks/donoharm/dataset/items.jsonl",
    "benchmarks/donoharm/judge/prompts/extract_match.md",
    "benchmarks/donoharm/judge/adapter.py",
    "benchmarks/donoharm/judge/metrics.py",
    ...evaluatorFamilies.map((family) => `benchmarks/donoharm/dataset/rubrics/${family}.json`),
    ...evaluatorFamilies.map((family) => `benchmarks/donoharm/guidance/${family}.yaml`),
  ];
  const sourceIdentityRecords = [];
  for (const sourceFile of sourceFiles) {
    const bytes = await readFile(resolve(mastRoot, sourceFile));
    sourceIdentityRecords.push({
      path: sourceFile,
      utf8Bytes: bytes.length,
      sha256: sha256(bytes),
      gitBlobSha: gitBlobSha1(bytes),
    });
  }
  const matchingIdentity = sourceIdentityRecords.find(
    ({ path }) => path === "benchmarks/donoharm/judge/prompts/extract_match.md",
  );
  const adapterIdentity = sourceIdentityRecords.find(
    ({ path }) => path === "benchmarks/donoharm/judge/adapter.py",
  );
  if (matchingIdentity?.gitBlobSha !== expectedMatchingBlob
    || adapterIdentity?.gitBlobSha !== expectedAdapterBlob) {
    throw new Error("EVALUATION_DIRECTIVE_SOURCE_BLOB_MISMATCH");
  }
  const datasetLines = (await readFile(resolve(mastRoot, sourceFiles[0]!), "utf8"))
    .split("\n").filter((line) => line.trim()).map((line) => object(JSON.parse(line), "dataset row"));
  for (const family of evaluatorFamilies) {
    if (datasetLines.filter(({ id }) => id === family).length !== 1) {
      throw new Error(`EVALUATION_BASE_CASE_IDENTITY_INVALID family=${family}`);
    }
    rubricFrom(
      await readJson(resolve(mastRoot, `benchmarks/donoharm/dataset/rubrics/${family}.json`)),
      family,
    );
  }

  const finalRoot = resolve(artifactRoot, evaluatorDirectory);
  try {
    await stat(finalRoot);
    throw new Error("EVALUATION_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const stagingRoot = await mkdtemp(resolve(artifactRoot, ".evaluation-v1-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    const sourceIdentity = {
      schemaVersion: 1,
      directiveId: evaluatorDirectiveId,
      sourceCommit,
      sourceTree,
      worktreeClean: true,
      records: sourceIdentityRecords,
    };
    const sourceIdentityBytes = jsonBytes(sourceIdentity);
    await writePrivate(resolve(stagingRoot, "source-identity.json"), sourceIdentityBytes);

    const mappingRecords = [];
    for (let index = 0; index < 96; index += 1) {
      const generation = generationRecords[index]!;
      const dispatch = dispatchRecords[index]!;
      if (generation.sequence !== index + 1
        || dispatch.sequence !== index + 1
        || generation.opaqueInputId !== dispatch.opaqueInputId
        || generation.exactOutputSha256 === undefined
        || generation.outputFile === undefined) {
        throw new Error(`EVALUATION_GENERATION_DISPATCH_MISMATCH sequence=${index + 1}`);
      }
      const familyId = string(dispatch.familyId, `dispatch family sequence=${index + 1}`);
      if (!evaluatorFamilies.includes(familyId as typeof evaluatorFamilies[number])) {
        throw new Error(`EVALUATION_FAMILY_INVALID sequence=${index + 1}`);
      }
      const generationRecordId = string(generation.opaqueInputId, "generation opaque input id");
      const outputSha = string(generation.exactOutputSha256, "generation output hash");
      const opaqueResponseId = computeOpaqueResponseId(generationRecordId, outputSha);
      const responsePath = resolve(artifactRoot, string(generation.outputFile, "generation output file"));
      const rendered = object(
        await runSourceBridge(repositoryRoot, "render", {
          mastRoot,
          familyId,
          responsePath,
        }),
        "rendered source prompt",
      );
      const packet = [
        string(rendered.renderedMatchingPrompt, "rendered matching prompt"),
        evaluatorTransportExtension(directive, familyId, opaqueResponseId),
      ].join("\n\n");
      const packetFile = `${evaluatorDirectory}/packets/${opaqueResponseId}.txt`;
      await writePrivate(resolve(stagingRoot, "packets", `${opaqueResponseId}.txt`), packet);
      mappingRecords.push({
        sequence: index + 1,
        generationLedgerRecordId: generationRecordId,
        opaqueResponseId,
        familyId,
        armId: dispatch.armId,
        trial: dispatch.trial,
        generationOutputFile: generation.outputFile,
        exactGenerationOutputSha256: outputSha,
        packetFile,
        exactPacketSha256: sha256(packet),
        exactPacketUtf8Bytes: Buffer.byteLength(packet, "utf8"),
      });
    }
    if (new Set(mappingRecords.map(({ opaqueResponseId }) => opaqueResponseId)).size !== 96) {
      throw new Error("EVALUATION_OPAQUE_RESPONSE_IDS_NOT_UNIQUE");
    }
    const opaqueMap = {
      schemaVersion: 1,
      directiveId: evaluatorDirectiveId,
      conditionMapSealed: true,
      mappingMayBeDisclosedDuringDirective: false,
      records: mappingRecords,
    };
    const opaqueMapBytes = jsonBytes(opaqueMap);
    await writePrivate(resolve(stagingRoot, "opaque-response-map.json"), opaqueMapBytes);

    const scheduleRecords = createPrimaryEvaluationSchedule(mappingRecords.map((record) => ({
      opaqueResponseId: record.opaqueResponseId,
      caseId: record.familyId,
      packetFile: record.packetFile,
      exactPacketSha256: record.exactPacketSha256,
    })));
    const primarySchedule = {
      schemaVersion: 1,
      directiveId: evaluatorDirectiveId,
      conditionMapSealed: true,
      orderingSeed: orderSeed,
      records: scheduleRecords,
    };
    const primaryScheduleBytes = jsonBytes(primarySchedule);
    await writePrivate(resolve(stagingRoot, "primary-evaluation-schedule.json"), primaryScheduleBytes);

    const preparedAt = new Date().toISOString();
    const primaryCaptureProgress: PrimaryCaptureProgress = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_primary_capture_progress",
      directiveId: evaluatorDirectiveId,
      createdAt: preparedAt,
      updatedAt: preparedAt,
      primaryJudgmentTarget: 192,
      validJudgmentCount: 0,
      mechanicalFailureCount: 0,
      records: [],
      mechanicalFailures: [],
      haltedClaim: null,
    };
    acceptPrimaryCaptureProgress(primarySchedule, primaryCaptureProgress);
    await writePrivate(
      resolve(stagingRoot, "primary-capture-progress.json"),
      jsonBytes(primaryCaptureProgress),
    );

    const preflight = {
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_blinded_evaluation_preflight",
      directiveId: evaluatorDirectiveId,
      preparedAt,
      generationLedgerSha256,
      sourceCommit,
      sourceTree,
      sourceIdentitySha256: sha256(sourceIdentityBytes),
      opaqueMappingSha256: sha256(opaqueMapBytes),
      primaryScheduleSha256: sha256(primaryScheduleBytes),
      responseCount: 96,
      primaryEvaluatorReplicatesPerResponse: 2,
      primaryJudgmentCount: 192,
      evaluatorPacketCount: 96,
      conditionMapSealed: true,
      rubricAndGuidanceOpenedOnlyAfterGenerationFreezeAccepted: true,
      providerApiCredentialsUsed: false,
      totalExternalSpendUsd: 0,
      unblindingAuthorized: false,
      armOrFamilyLevelAggregationAuthorized: false,
      scientificInterpretationAuthorized: false,
      status: "BLINDED_EVALUATION_PREFLIGHT_ACCEPTED",
    };
    const preflightBytes = jsonBytes(preflight);
    await writePrivate(resolve(stagingRoot, "evaluation-preflight-receipt.json"), preflightBytes);
    await rename(stagingRoot, finalRoot);
    return {
      status: "BLINDED_EVALUATION_PREFLIGHT_ACCEPTED",
      responseCount: 96,
      primaryJudgmentCount: 192,
      sourceIdentitySha256: sha256(sourceIdentityBytes),
      opaqueMappingSha256: sha256(opaqueMapBytes),
      primaryScheduleSha256: sha256(primaryScheduleBytes),
      preflightSha256: sha256(preflightBytes),
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function validateEvaluatorOutputFile(input: {
  repositoryRoot: string;
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
  const map = object(
    await readJson(resolve(input.artifactRoot, evaluatorDirectory, "opaque-response-map.json")),
    "opaque response map",
  );
  const record = array(map.records, "opaque response map records")
    .map((value, index) => object(value, `opaque response map records[${index}]`))
    .find(({ opaqueResponseId }) => opaqueResponseId === input.opaqueResponseId);
  if (!record) throw new Error("EVALUATOR_OUTPUT_OPAQUE_ID_NOT_FOUND");
  const outputPath = resolve(input.artifactRoot, input.outputFile);
  const artifactReal = await realpath(input.artifactRoot);
  const outputReal = await realpath(outputPath);
  const rel = relative(artifactReal, outputReal);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("EVALUATOR_OUTPUT_OUTSIDE_ARTIFACT_ROOT");
  const outputInfo = await lstat(outputReal);
  if (!outputInfo.isFile() || outputInfo.isSymbolicLink() || (outputInfo.mode & 0o777) !== 0o600) {
    throw new Error("EVALUATOR_OUTPUT_FILE_MODE_INVALID");
  }
  const [rawOutput, rawResponse, rubricValue] = await Promise.all([
    readFile(outputReal, "utf8"),
    readFile(resolve(input.artifactRoot, string(record.generationOutputFile, "generation output file")), "utf8"),
    readJson(resolve(input.mastRoot, `benchmarks/donoharm/dataset/rubrics/${record.familyId}.json`)),
  ]);
  const caseId = string(record.familyId, "mapping familyId");
  parseAndValidateEvaluatorJudgment({
    rawOutput,
    caseId,
    opaqueResponseId: input.opaqueResponseId,
    rubric: rubricFrom(rubricValue, caseId),
    rawResponse,
  });
  return {
    status: "VALID",
    caseId,
    opaqueResponseId: input.opaqueResponseId,
    exactOutputSha256: sha256(rawOutput),
    exactOutputUtf8Bytes: Buffer.byteLength(rawOutput, "utf8"),
  };
}

async function validatePrivateArtifactFile(
  artifactRootInput: string,
  relativeFile: string,
  expectedSha256: string,
  expectedUtf8Bytes: number,
): Promise<void> {
  if (isAbsolute(relativeFile) || relativeFile.split("/").includes("..")) {
    throw new Error("EVALUATION_CAPTURE_FILE_PATH_INVALID");
  }
  const artifactRoot = await realpath(artifactRootInput);
  const filePath = await realpath(resolve(artifactRoot, relativeFile));
  const rel = relative(artifactRoot, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("EVALUATION_CAPTURE_FILE_OUTSIDE_ARTIFACT_ROOT");
  }
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    throw new Error("EVALUATION_CAPTURE_FILE_MODE_INVALID");
  }
  const bytes = await readFile(filePath);
  if (sha256(bytes) !== expectedSha256 || bytes.length !== expectedUtf8Bytes) {
    throw new Error("EVALUATION_CAPTURE_FILE_IDENTITY_MISMATCH");
  }
}

function parseEvaluatorAttemptReceipt(
  value: unknown,
): ValidPrimaryCaptureRecord | MechanicalFailureReceipt {
  const root = object(value, "evaluator attempt receipt");
  if (root.status === "VALID") return validPrimaryCaptureRecordSchema.parse(root);
  if (root.status === "INVALID_MECHANICAL") return mechanicalFailureReceiptSchema.parse(root);
  throw new Error("EVALUATION_CAPTURE_RECEIPT_STATUS_INVALID");
}

export async function recordPrimaryEvaluatorAttempt(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  receiptValue: unknown;
}): Promise<{
  status: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  ordinal: number;
  attempt: 1 | 2;
  validJudgmentCount: number;
  mechanicalFailureCount: number;
  haltedClaim: PrimaryCaptureProgress["haltedClaim"];
}> {
  const artifactRoot = await realpath(input.artifactRoot);
  await assertPrivateDirectory(artifactRoot);
  const evaluationRoot = resolve(artifactRoot, evaluatorDirectory);
  await assertPrivateDirectory(evaluationRoot);
  const schedulePath = resolve(evaluationRoot, "primary-evaluation-schedule.json");
  const progressPath = resolve(evaluationRoot, "primary-capture-progress.json");
  const progressInfo = await lstat(progressPath);
  if (!progressInfo.isFile()
    || progressInfo.isSymbolicLink()
    || (progressInfo.mode & 0o777) !== 0o600) {
    throw new Error("EVALUATION_CAPTURE_PROGRESS_FILE_INVALID");
  }
  const [scheduleValue, progressValue] = await Promise.all([
    readJson(schedulePath),
    readJson(progressPath),
  ]);
  const schedule = primaryScheduleRecordsFrom(scheduleValue);
  const progress = acceptPrimaryCaptureProgress(scheduleValue, progressValue);
  if (progress.haltedClaim !== null) throw new Error(progress.haltedClaim);
  if (progress.records.length === 192) {
    throw new Error("EVALUATION_CAPTURE_PRIMARY_ALREADY_COMPLETE");
  }

  const receipt = parseEvaluatorAttemptReceipt(input.receiptValue);
  const expectedOrdinal = progress.records.length + 1;
  const expectedSchedule = schedule[expectedOrdinal - 1]!;
  const priorFailures = progress.mechanicalFailures.filter(
    ({ ordinal }) => ordinal === expectedOrdinal,
  );
  const expectedAttempt = priorFailures.length === 0 ? 1 : 2;
  if (receipt.ordinal !== expectedOrdinal || receipt.attempt !== expectedAttempt) {
    throw new Error("EVALUATION_CAPTURE_RECEIPT_NOT_NEXT_ATTEMPT");
  }
  assertCaptureIdentityMatchesSchedule(receipt, expectedSchedule);

  const packetBytes = await readFile(resolve(artifactRoot, expectedSchedule.packetFile));
  if (sha256(packetBytes) !== expectedSchedule.exactPacketSha256) {
    throw new Error("EVALUATION_CAPTURE_PACKET_HASH_MISMATCH");
  }

  let resultStatus: "VALID_RECORDED" | "MECHANICAL_FAILURE_RECORDED" | "UNRESOLVED_SLOT_RECORDED";
  if (receipt.status === "VALID") {
    if (receipt.inputFile !== expectedSchedule.packetFile
      || receipt.exactInputSha256 !== expectedSchedule.exactPacketSha256) {
      throw new Error("EVALUATION_CAPTURE_RECEIPT_INPUT_MISMATCH");
    }
    const validation = await validateEvaluatorOutputFile({
      repositoryRoot: input.repositoryRoot,
      mastRoot: input.mastRoot,
      artifactRoot,
      opaqueResponseId: receipt.opaqueResponseId,
      outputFile: receipt.outputFile,
    });
    if (validation.caseId !== receipt.caseId
      || validation.exactOutputSha256 !== receipt.exactOutputSha256
      || validation.exactOutputUtf8Bytes !== receipt.exactOutputUtf8Bytes) {
      throw new Error("EVALUATION_CAPTURE_VALID_OUTPUT_RECEIPT_MISMATCH");
    }
    progress.records.push(receipt);
    resultStatus = "VALID_RECORDED";
  } else {
    if (receipt.exactInputSha256 !== expectedSchedule.exactPacketSha256) {
      throw new Error("EVALUATION_CAPTURE_FAILURE_INPUT_MISMATCH");
    }
    if (receipt.outputFile !== null) {
      await validatePrivateArtifactFile(
        artifactRoot,
        receipt.outputFile,
        receipt.exactOutputSha256!,
        receipt.exactOutputUtf8Bytes!,
      );
    }
    progress.mechanicalFailures.push(receipt);
    if (receipt.attempt === 2) {
      progress.haltedClaim =
        "FOUR_ARM_EIGHT_FAMILY_BASE_EVALUATION_BLOCKED_UNRESOLVED_EVALUATOR_SLOT";
      resultStatus = "UNRESOLVED_SLOT_RECORDED";
    } else {
      resultStatus = "MECHANICAL_FAILURE_RECORDED";
    }
  }
  progress.validJudgmentCount = progress.records.length;
  progress.mechanicalFailureCount = progress.mechanicalFailures.length;
  progress.updatedAt = new Date().toISOString();
  acceptPrimaryCaptureProgress(scheduleValue, progress);

  const temporaryPath = resolve(
    evaluationRoot,
    `.primary-capture-progress.${process.pid}.${Date.now()}.tmp`,
  );
  await writePrivate(temporaryPath, jsonBytes(progress));
  await rename(temporaryPath, progressPath);
  await chmod(progressPath, 0o600);
  return {
    status: resultStatus,
    ordinal: receipt.ordinal,
    attempt: receipt.attempt,
    validJudgmentCount: progress.validJudgmentCount,
    mechanicalFailureCount: progress.mechanicalFailureCount,
    haltedClaim: progress.haltedClaim,
  };
}

export async function computeJudgmentMetrics(input: {
  repositoryRoot: string;
  mastRoot: string;
  familyId: string;
  judgment: EvaluatorJudgment;
}): Promise<unknown> {
  return runSourceBridge(input.repositoryRoot, "metrics", {
    mastRoot: input.mastRoot,
    familyId: input.familyId,
    judgment: input.judgment,
  });
}
