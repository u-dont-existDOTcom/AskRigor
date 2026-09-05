import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
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
export const latestJ3RootDirectory = `${evaluatorV2Directory}/j3-latest-restart`;
export const latestJ3SeriesId = "J3_LATEST_RESTART";
export const latestJ3RepositoryBranch = "task/mast-four-arm-zero-spend-harness-20260901";
export const latestJ3SelectorLabel = "Latest";
export const latestJ3PhysicalTabId = "663931037";
const latestJ3SourceDirectiveSha256 =
  "8f1c7f4af517060445aaf42498f6efac1ca8abd9460aae02d0295196d8f634f9";
const latestJ3PrimaryProgressSha256 =
  "a638f53dca915a88f74a2f2baf7fe084d228f3710dad389492963caf5a2eb045";
const supersededJ3ProgressSha256 =
  "3316c9eea3b164b1c1a66fca3de831e97740a3e2acdf8fc5b8f03b98e60dc537";
const supersededJ3Ordinal23ReceiptSha256 =
  "9ecba3d2910c5b50770d6a7fa05ecc87b938987b58f052c1e02362fb6706da93";
const supersededJ3InventorySha256 =
  "7128b22b65289870c75a5c2cc118f50e6979c4e4bbf8e32da7b38805f2bc71b9";
const supersededJ3RootDirectory =
  `${evaluatorV2Directory}/superseded/j3-gpt-5-6-sol-23-valid`;
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

const latestJ3ExecutionProvenanceShape = {
  series_id: z.literal(latestJ3SeriesId),
  series_ordinal: z.number().int().positive(),
  frozen_schedule_slot_id: z.string().min(1),
  evaluator_selector_label: z.literal(latestJ3SelectorLabel),
  evaluator_reasoning_ui_label_observed: z.string().trim().min(1),
  provider_model_slug: z.null(),
  provider_model_slug_status: z.literal("UNAVAILABLE_NOT_GUESSED"),
  consumer_account_continuity_status: z.literal("UNCHANGED"),
  chat_mode_status: z.literal("Chat"),
  fresh_conversation_status: z.literal("FRESH_ZERO_MESSAGE_AT_SEND"),
  physical_tab_reuse_status: z.literal("SAME_REUSABLE_PHYSICAL_TAB"),
  physical_tab_id: z.literal(latestJ3PhysicalTabId),
  packet_sha256: digestSchema,
  attempt_number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  attempt_ceiling: z.literal(4),
  execution_repository_branch: z.literal(latestJ3RepositoryBranch),
  execution_repository_commit: digestSchema,
  local_head_at_record: digestSchema,
  github_head_at_record: digestSchema,
  local_github_head_match: z.literal(true),
  structural_pre_send_verification_status: z.literal("PASSED"),
  condition_map_access_status: z.literal("SEALED_NOT_INSPECTED"),
  clinical_content_inspection_status: z.literal("NOT_INSPECTED"),
  paid_api_use_status: z.literal("ZERO"),
  receipt_created_at: timestampSchema,
  previous_valid_checkpoint_sha256: digestSchema,
  pre_send_receipt_file: relativeFileSchema,
  pre_send_receipt_sha256: digestSchema,
};

const transportShape = {
  providerSurface: z.literal("CHATGPT_CONSUMER_CHAT"),
  modelNameObserved: z.literal(latestJ3SelectorLabel),
  thinkingEffortObserved: z.string().trim().min(1),
  modelSlugObserved: z.null(),
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
  ...latestJ3ExecutionProvenanceShape,
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
  modelNameObserved: z.literal(latestJ3SelectorLabel),
  thinkingEffortObserved: z.string().trim().min(1),
  modelSlugObserved: z.null(),
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
  ...latestJ3ExecutionProvenanceShape,
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
  schemaVersion: z.literal(2),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_capture_progress"),
  directiveId: z.literal(evaluatorV2DirectiveId),
  retryExtensionDirectiveId: z.literal(evaluatorV2RetryExtensionDirectiveId),
  sourceBoundRestartDirectiveSha256: z.literal(latestJ3SourceDirectiveSha256),
  seriesId: z.literal(latestJ3SeriesId),
  evaluatorSelectorLabel: z.literal(latestJ3SelectorLabel),
  providerModelSlug: z.null(),
  providerModelSlugStatus: z.literal("UNAVAILABLE_NOT_GUESSED"),
  sourceSupersededInventorySha256: z.literal(supersededJ3InventorySha256),
  executionRepositoryBranch: z.literal(latestJ3RepositoryBranch),
  initialExecutionRepositoryCommit: digestSchema,
  latestExecutionRepositoryCommit: digestSchema,
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

const treeInventoryEntrySchema = z.discriminatedUnion("type", [
  z.object({
    path: z.string().min(1),
    type: z.literal("directory"),
    mode: z.literal("0700"),
  }).strict(),
  z.object({
    path: z.string().min(1),
    type: z.literal("file"),
    mode: z.literal("0600"),
    bytes: z.number().int().nonnegative(),
    sha256: digestSchema,
  }).strict(),
]);

const supersededJ3InventorySchema = z.object({
  schemaVersion: z.literal(1),
  inventoryType: z.literal("ASKRIGOR_SUPERSEDED_J3_TREE_INVENTORY"),
  classification: z.literal("SUPERSEDED_PRIVATE_AUDIT_EVIDENCE_NOT_ELIGIBLE_FOR_LATEST_FINALIZATION"),
  sourceSeries: z.literal("GPT-5.6 Sol / Extra High"),
  validJudgmentCount: z.literal(23),
  mechanicalFailureCount: z.literal(0),
  haltedClaim: z.null(),
  sourceProgressSha256: z.literal(supersededJ3ProgressSha256),
  sourceOrdinal23ReceiptSha256: z.literal(supersededJ3Ordinal23ReceiptSha256),
  ordinal24ArtifactPresent: z.literal(false),
  entries: z.array(treeInventoryEntrySchema).min(1),
}).strict();

const latestJ3SeriesManifestSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_manifest"),
  seriesId: z.literal(latestJ3SeriesId),
  sourceBoundRestartDirectiveSha256: z.literal(latestJ3SourceDirectiveSha256),
  supersededSolInventorySha256: z.literal(supersededJ3InventorySha256),
  initializedAt: timestampSchema,
  executionRepositoryBranch: z.literal(latestJ3RepositoryBranch),
  executionRepositoryCommit: digestSchema,
  githubHeadAtInitialization: digestSchema,
  localGithubHeadMatch: z.literal(true),
  selectorLabel: z.literal(latestJ3SelectorLabel),
  reasoningUiLabelRule: z.literal("HIGHEST_AUTHORIZED_EXACT_UI_LABEL_AT_SEND_TIME"),
  providerModelSlug: z.null(),
  providerModelSlugStatus: z.literal("UNAVAILABLE_NOT_GUESSED"),
  chatModeStatus: z.literal("Chat"),
  consumerAccountContinuityStatus: z.literal("UNCHANGED"),
  frozenScheduleSha256: digestSchema,
  disagreementLedgerSha256: digestSchema,
  requiredValidJudgmentCount: z.literal(41),
  conditionMapAccessStatus: z.literal("SEALED_NOT_INSPECTED"),
  clinicalContentInspectionStatus: z.literal("NOT_INSPECTED"),
  paidApiUseStatus: z.literal("ZERO"),
}).strict();

const latestJ3CheckpointPointerSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_checkpoint_pointer"),
  seriesId: z.literal(latestJ3SeriesId),
  validJudgmentCount: z.number().int().min(0).max(41),
  checkpointFile: relativeFileSchema,
  checkpointSha256: digestSchema,
  executionRepositoryCommit: digestSchema,
}).strict();

const latestJ3PreSendReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_pre_send"),
  createdAt: timestampSchema,
  series_id: z.literal(latestJ3SeriesId),
  series_ordinal: z.number().int().min(1).max(41),
  frozen_schedule_slot_id: z.string().min(1),
  evaluator_selector_label: z.literal(latestJ3SelectorLabel),
  evaluator_reasoning_ui_label_observed: z.string().trim().min(1),
  provider_model_slug: z.null(),
  provider_model_slug_status: z.literal("UNAVAILABLE_NOT_GUESSED"),
  consumer_account_continuity_status: z.literal("UNCHANGED"),
  chat_mode_status: z.literal("Chat"),
  fresh_conversation_status: z.literal("FRESH_ZERO_MESSAGE_AT_SEND"),
  physical_tab_reuse_status: z.literal("SAME_REUSABLE_PHYSICAL_TAB"),
  physical_tab_id: z.literal(latestJ3PhysicalTabId),
  packet_file: relativeFileSchema,
  packet_sha256: digestSchema,
  attempt_number: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  attempt_ceiling: z.literal(4),
  execution_repository_branch: z.literal(latestJ3RepositoryBranch),
  execution_repository_commit: digestSchema,
  local_head_at_record: digestSchema,
  github_head_at_record: digestSchema,
  local_github_head_match: z.literal(true),
  structural_pre_send_verification_status: z.literal("PASSED"),
  condition_map_access_status: z.literal("SEALED_NOT_INSPECTED"),
  clinical_content_inspection_status: z.literal("NOT_INSPECTED"),
  paid_api_use_status: z.literal("ZERO"),
  previous_valid_checkpoint_sha256: digestSchema,
  previous_valid_checkpoint_file: relativeFileSchema,
  prior_sol_output_reuse_status: z.literal("NOT_REUSED"),
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

async function replacePrivate(path: string, bytes: string): Promise<void> {
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writePrivate(temporary, bytes);
  await rename(temporary, path);
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

async function requireLocalGitHubHead(repositoryRoot: string): Promise<{
  branch: typeof latestJ3RepositoryBranch;
  localHead: string;
  githubHead: string;
}> {
  const [branch, localHead] = await Promise.all([
    gitText(repositoryRoot, "branch", "--show-current"),
    gitText(repositoryRoot, "rev-parse", "HEAD"),
  ]);
  const remote = await gitText(
    repositoryRoot,
    "ls-remote",
    "origin",
    `refs/heads/${latestJ3RepositoryBranch}`,
  );
  const githubHead = remote.split(/\s+/u)[0] ?? "";
  if (branch !== latestJ3RepositoryBranch || !digestPattern.test(localHead)
    || localHead !== githubHead) {
    throw new Error("EVALUATOR_V2_J3_LATEST_LOCAL_GITHUB_HEAD_MISMATCH");
  }
  return { branch: latestJ3RepositoryBranch, localHead, githubHead };
}

async function privateTreeInventory(treeRoot: string): Promise<z.infer<typeof treeInventoryEntrySchema>[]> {
  const result: z.infer<typeof treeInventoryEntrySchema>[] = [];
  const visit = async (path: string, relativePath: string): Promise<void> => {
    const info = await lstat(path);
    const mode = (info.mode & 0o777).toString(8).padStart(4, "0");
    if (info.isSymbolicLink()) throw new Error("EVALUATOR_V2_SUPERSEDED_J3_SYMLINK_REJECTED");
    if (info.isDirectory()) {
      result.push(treeInventoryEntrySchema.parse({ path: relativePath, type: "directory", mode }));
      const children = await readdir(path);
      children.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
      for (const child of children) {
        await visit(resolve(path, child), relativePath === "." ? child : `${relativePath}/${child}`);
      }
      return;
    }
    if (!info.isFile()) throw new Error("EVALUATOR_V2_SUPERSEDED_J3_ENTRY_TYPE_REJECTED");
    const bytes = await readFile(path);
    result.push(treeInventoryEntrySchema.parse({
      path: relativePath,
      type: "file",
      mode,
      bytes: bytes.length,
      sha256: sha256(bytes),
    }));
  };
  await visit(treeRoot, ".");
  return result;
}

export async function verifySupersededJ3Preservation(
  artifactRootInput: string,
): Promise<{ entryCount: number; inventorySha256: typeof supersededJ3InventorySha256 }> {
  const artifactRoot = await realpath(artifactRootInput);
  const preservedRoot = resolve(artifactRoot, supersededJ3RootDirectory);
  const treeRoot = resolve(preservedRoot, "tree");
  const inventoryPath = resolve(preservedRoot, "tree-inventory.json");
  const digestPath = resolve(preservedRoot, "tree-inventory.sha256");
  const [inventoryBytes, digestBytes] = await Promise.all([
    assertPrivateFile(
      artifactRoot,
      relative(artifactRoot, inventoryPath),
      supersededJ3InventorySha256,
      10_108,
    ),
    readFile(digestPath, "utf8"),
  ]);
  if (digestBytes !== `${supersededJ3InventorySha256}  tree-inventory.json\n`) {
    throw new Error("EVALUATOR_V2_SUPERSEDED_J3_INVENTORY_DIGEST_RECEIPT_INVALID");
  }
  const inventory = supersededJ3InventorySchema.parse(JSON.parse(inventoryBytes));
  const actual = await privateTreeInventory(treeRoot);
  if (JSON.stringify(actual) !== JSON.stringify(inventory.entries)) {
    throw new Error("EVALUATOR_V2_SUPERSEDED_J3_TREE_INVENTORY_MISMATCH");
  }
  return { entryCount: actual.length, inventorySha256: supersededJ3InventorySha256 };
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

function frozenJ3SlotId(record: z.infer<typeof j3ScheduleRecordSchema>): string {
  return `J3-${String(record.j3Ordinal).padStart(3, "0")}:${record.opaqueResponseId}`;
}

function sameLatestJ3Provenance(
  record: z.infer<typeof validJ3CaptureSchema> | z.infer<typeof failedJ3CaptureSchema>,
  expected: z.infer<typeof j3ScheduleRecordSchema>,
): boolean {
  return record.series_ordinal === record.j3Ordinal
    && record.frozen_schedule_slot_id === frozenJ3SlotId(expected)
    && record.packet_sha256 === expected.exactPacketSha256
    && record.attempt_number === record.attempt
    && record.execution_repository_commit === record.local_head_at_record
    && record.local_head_at_record === record.github_head_at_record
    && record.evaluator_reasoning_ui_label_observed === record.thinkingEffortObserved
    && record.receipt_created_at === record.capturedAt;
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
      || !sameLatestJ3Provenance(failure, expected)
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
      || !sameLatestJ3Provenance(record, expected)
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
  const physicalTabs = [
    ...progress.records.map(({ physical_tab_id }) => physical_tab_id),
    ...progress.mechanicalFailures.map(({ physical_tab_id }) => physical_tab_id),
  ];
  if (new Set(physicalTabs).size > 1) {
    throw new Error("EVALUATOR_V2_J3_PHYSICAL_TAB_REUSE_VIOLATION");
  }
  const nextOrdinal = progress.records.length + 1;
  const nextFailureCount = (failuresByOrdinal.get(nextOrdinal) ?? []).length;
  const shouldHalt = progress.records.length < schedule.records.length && nextFailureCount === 4;
  if ((progress.haltedClaim === j3HaltClaim) !== shouldHalt) {
    throw new Error("EVALUATOR_V2_J3_HALT_STATE_INVALID");
  }
  return progress;
}

export function requireCompleteLatestJ3Series(
  schedule: J3Schedule,
  progress: J3CaptureProgress,
): void {
  if (schedule.records.length !== 41
    || schedule.j3JudgmentTarget !== 41
    || progress.seriesId !== latestJ3SeriesId
    || progress.j3JudgmentTarget !== 41
    || progress.records.length !== 41
    || progress.validJudgmentCount !== 41
    || progress.haltedClaim !== null
    || progress.records.some((record) => record.series_id !== latestJ3SeriesId)) {
    throw new Error("EVALUATOR_V2_REQUIRED_J3_LATEST_SERIES_NOT_COMPLETE");
  }
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

export type LatestJ3PreSendReceipt = z.infer<typeof latestJ3PreSendReceiptSchema>;

export function acceptLatestJ3PreSendReceipt(value: unknown): LatestJ3PreSendReceipt {
  return latestJ3PreSendReceiptSchema.parse(value);
}

export async function initializeV2J3LatestRestart(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
}): Promise<{
  status: "EVALUATOR_V2_J3_LATEST_RESTART_INITIALIZED";
  seriesId: typeof latestJ3SeriesId;
  requiredValidJudgmentCount: 41;
  scheduleSha256: string;
  initialProgressSha256: string;
  supersededInventorySha256: typeof supersededJ3InventorySha256;
  executionRepositoryCommit: string;
}> {
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  const [git, primary] = await Promise.all([
    requireLocalGitHubHead(repositoryRoot),
    loadPrimaryState(artifactRoot),
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    validatePinnedMastRoot(mastRoot),
    verifySupersededJ3Preservation(artifactRoot),
  ]).then(([gitState, primaryState]) => [gitState, primaryState] as const);
  if (sha256(primary.progressBytes) !== latestJ3PrimaryProgressSha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRIMARY_STATE_CHANGED");
  }
  const activeRoot = resolve(artifactRoot, latestJ3RootDirectory);
  try {
    await stat(activeRoot);
    throw new Error("EVALUATOR_V2_J3_LATEST_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const preservedTree = resolve(artifactRoot, supersededJ3RootDirectory, "tree");
  const supersededProgressPath = resolve(preservedTree, "capture-progress.json");
  const ordinal23ReceiptPath = resolve(
    preservedTree,
    "receipts/023-EVAL-3dd0f23b233a742f29daf5fe-J3-attempt-1-valid.json",
  );
  const [supersededProgressBytes, scheduleBytes, disagreementBytes] = await Promise.all([
    readFile(supersededProgressPath, "utf8"),
    readFile(resolve(preservedTree, "evaluation-schedule.json"), "utf8"),
    readFile(resolve(preservedTree, "disagreement-ledger.json"), "utf8"),
  ]);
  if (sha256(supersededProgressBytes) !== supersededJ3ProgressSha256
    || sha256(await readFile(ordinal23ReceiptPath)) !== supersededJ3Ordinal23ReceiptSha256) {
    throw new Error("EVALUATOR_V2_SUPERSEDED_J3_KNOWN_DIGEST_MISMATCH");
  }
  const supersededProgress = JSON.parse(supersededProgressBytes) as {
    validJudgmentCount?: unknown;
    mechanicalFailureCount?: unknown;
    haltedClaim?: unknown;
    records?: unknown[];
    mechanicalFailures?: unknown[];
    sourceJ3ScheduleSha256?: unknown;
    sourceDisagreementLedgerSha256?: unknown;
  };
  if (supersededProgress.validJudgmentCount !== 23
    || supersededProgress.records?.length !== 23
    || supersededProgress.mechanicalFailureCount !== 0
    || supersededProgress.mechanicalFailures?.length !== 0
    || supersededProgress.haltedClaim !== null
    || supersededProgress.sourceJ3ScheduleSha256 !== sha256(scheduleBytes)
    || supersededProgress.sourceDisagreementLedgerSha256 !== sha256(disagreementBytes)) {
    throw new Error("EVALUATOR_V2_SUPERSEDED_J3_STRUCTURAL_STATE_MISMATCH");
  }
  const schedule = j3ScheduleSchema.parse(JSON.parse(scheduleBytes));
  if (schedule.j3JudgmentTarget !== 41 || schedule.records.length !== 41) {
    throw new Error("EVALUATOR_V2_J3_LATEST_FROZEN_SCHEDULE_COUNT_INVALID");
  }
  const initializedAt = new Date().toISOString();
  const scheduleSha = sha256(scheduleBytes);
  const disagreementSha = sha256(disagreementBytes);
  const manifest = latestJ3SeriesManifestSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_manifest",
    seriesId: latestJ3SeriesId,
    sourceBoundRestartDirectiveSha256: latestJ3SourceDirectiveSha256,
    supersededSolInventorySha256: supersededJ3InventorySha256,
    initializedAt,
    executionRepositoryBranch: git.branch,
    executionRepositoryCommit: git.localHead,
    githubHeadAtInitialization: git.githubHead,
    localGithubHeadMatch: true,
    selectorLabel: latestJ3SelectorLabel,
    reasoningUiLabelRule: "HIGHEST_AUTHORIZED_EXACT_UI_LABEL_AT_SEND_TIME",
    providerModelSlug: null,
    providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
    chatModeStatus: "Chat",
    consumerAccountContinuityStatus: "UNCHANGED",
    frozenScheduleSha256: scheduleSha,
    disagreementLedgerSha256: disagreementSha,
    requiredValidJudgmentCount: 41,
    conditionMapAccessStatus: "SEALED_NOT_INSPECTED",
    clinicalContentInspectionStatus: "NOT_INSPECTED",
    paidApiUseStatus: "ZERO",
  });
  const progress = j3CaptureProgressSchema.parse({
    schemaVersion: 2,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_capture_progress",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    sourceBoundRestartDirectiveSha256: latestJ3SourceDirectiveSha256,
    seriesId: latestJ3SeriesId,
    evaluatorSelectorLabel: latestJ3SelectorLabel,
    providerModelSlug: null,
    providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
    sourceSupersededInventorySha256: supersededJ3InventorySha256,
    executionRepositoryBranch: git.branch,
    initialExecutionRepositoryCommit: git.localHead,
    latestExecutionRepositoryCommit: git.localHead,
    createdAt: initializedAt,
    updatedAt: initializedAt,
    sourcePrimaryProgressSha256: latestJ3PrimaryProgressSha256,
    sourceDisagreementLedgerSha256: disagreementSha,
    sourceJ3ScheduleSha256: scheduleSha,
    j3JudgmentTarget: 41,
    validJudgmentCount: 0,
    mechanicalFailureCount: 0,
    records: [],
    mechanicalFailures: [],
    haltedClaim: null,
  });
  acceptJ3CaptureProgress(schedule, progress, primary.progress);
  const progressBytes = jsonBytes(progress);
  const progressSha = sha256(progressBytes);
  const checkpointFile = `${latestJ3RootDirectory}/checkpoints/000-progress.json`;
  const pointer = latestJ3CheckpointPointerSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_checkpoint_pointer",
    seriesId: latestJ3SeriesId,
    validJudgmentCount: 0,
    checkpointFile,
    checkpointSha256: progressSha,
    executionRepositoryCommit: git.localHead,
  });
  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  const stagingRoot = await mkdtemp(resolve(evaluationRoot, ".j3-latest-restart-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    await Promise.all([
      writePrivate(resolve(stagingRoot, "disagreement-ledger.json"), disagreementBytes),
      writePrivate(resolve(stagingRoot, "evaluation-schedule.json"), scheduleBytes),
      writePrivate(resolve(stagingRoot, "capture-progress.json"), progressBytes),
      writePrivate(resolve(stagingRoot, "series-manifest.json"), jsonBytes(manifest)),
      writePrivate(resolve(stagingRoot, "checkpoints/000-progress.json"), progressBytes),
      writePrivate(resolve(stagingRoot, "latest-valid-checkpoint.json"), jsonBytes(pointer)),
    ]);
    await Promise.all([
      mkdir(resolve(stagingRoot, "judgments"), { mode: 0o700 }),
      mkdir(resolve(stagingRoot, "receipts"), { mode: 0o700 }),
      mkdir(resolve(stagingRoot, "pre-send-receipts"), { mode: 0o700 }),
    ]);
    await rename(stagingRoot, activeRoot);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    status: "EVALUATOR_V2_J3_LATEST_RESTART_INITIALIZED",
    seriesId: latestJ3SeriesId,
    requiredValidJudgmentCount: 41,
    scheduleSha256: scheduleSha,
    initialProgressSha256: progressSha,
    supersededInventorySha256: supersededJ3InventorySha256,
    executionRepositoryCommit: git.localHead,
  };
}

async function readLatestCheckpoint(input: {
  artifactRoot: string;
  schedule: J3Schedule;
  primaryProgress: V2CaptureProgress;
}): Promise<z.infer<typeof latestJ3CheckpointPointerSchema>> {
  const pointerPath = resolve(input.artifactRoot, latestJ3RootDirectory, "latest-valid-checkpoint.json");
  const pointer = latestJ3CheckpointPointerSchema.parse(await readJson(pointerPath));
  const checkpointBytes = await assertPrivateFile(
    input.artifactRoot,
    pointer.checkpointFile,
    pointer.checkpointSha256,
    (await stat(resolve(input.artifactRoot, pointer.checkpointFile))).size,
  );
  const checkpoint = acceptJ3CaptureProgress(
    input.schedule,
    JSON.parse(checkpointBytes),
    input.primaryProgress,
  );
  if (checkpoint.validJudgmentCount !== pointer.validJudgmentCount
    || checkpoint.latestExecutionRepositoryCommit !== pointer.executionRepositoryCommit) {
    throw new Error("EVALUATOR_V2_J3_LATEST_CHECKPOINT_POINTER_MISMATCH");
  }
  return pointer;
}

export async function createLatestJ3PreSendReceipt(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  j3Ordinal: number;
  attempt: number;
  evaluatorSelectorLabel: string;
  evaluatorReasoningUiLabelObserved: string;
  physicalTabId: string;
  consumerAccountContinuityStatus: string;
  chatModeStatus: string;
  freshConversationStatus: string;
  physicalTabReuseStatus: string;
}): Promise<{
  status: "EVALUATOR_V2_J3_LATEST_PRE_SEND_VERIFIED";
  receiptFile: string;
  receiptSha256: string;
  receiptBytes: number;
  packetFile: string;
  packetSha256: string;
  previousValidCheckpointSha256: string;
  executionRepositoryCommit: string;
}> {
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  const [git, primary] = await Promise.all([
    requireLocalGitHubHead(repositoryRoot),
    loadPrimaryState(artifactRoot),
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    validatePinnedMastRoot(mastRoot),
  ]).then(([gitState, primaryState]) => [gitState, primaryState] as const);
  if (sha256(primary.progressBytes) !== latestJ3PrimaryProgressSha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRIMARY_STATE_CHANGED");
  }
  const j3Root = resolve(artifactRoot, latestJ3RootDirectory);
  const [scheduleBytes, progressValue, manifestValue] = await Promise.all([
    readFile(resolve(j3Root, "evaluation-schedule.json"), "utf8"),
    readJson(resolve(j3Root, "capture-progress.json")),
    readJson(resolve(j3Root, "series-manifest.json")),
  ]);
  const schedule = j3ScheduleSchema.parse(JSON.parse(scheduleBytes));
  const progress = acceptJ3CaptureProgress(schedule, progressValue, primary.progress);
  const manifest = latestJ3SeriesManifestSchema.parse(manifestValue);
  if (schedule.records.length !== 41 || progress.j3JudgmentTarget !== 41
    || manifest.frozenScheduleSha256 !== sha256(scheduleBytes)) {
    throw new Error("EVALUATOR_V2_J3_LATEST_SERIES_MANIFEST_MISMATCH");
  }
  const expected = schedule.records[progress.records.length];
  const failures = progress.mechanicalFailures.filter(
    ({ j3Ordinal }) => j3Ordinal === (expected?.j3Ordinal ?? -1),
  );
  if (!expected || input.j3Ordinal !== expected.j3Ordinal
    || input.attempt !== failures.length + 1 || input.attempt > 4) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRE_SEND_ATTEMPT_INVALID");
  }
  if (input.evaluatorSelectorLabel !== latestJ3SelectorLabel
    || input.evaluatorReasoningUiLabelObserved.trim().length === 0
    || input.consumerAccountContinuityStatus !== "UNCHANGED"
    || input.chatModeStatus !== "Chat"
    || input.freshConversationStatus !== "FRESH_ZERO_MESSAGE_AT_SEND"
    || input.physicalTabReuseStatus !== "SAME_REUSABLE_PHYSICAL_TAB"
    || input.physicalTabId !== latestJ3PhysicalTabId) {
    throw new Error("EVALUATOR_V2_J3_LATEST_UI_PROVENANCE_INVALID");
  }
  const priorAttempts = [...progress.records, ...progress.mechanicalFailures];
  if (priorAttempts.length > 0) {
    const latest = priorAttempts.reduce((left, right) =>
      Date.parse(left.receipt_created_at) > Date.parse(right.receipt_created_at) ? left : right);
    if (Date.now() - Date.parse(latest.receipt_created_at) < 9 * 60 * 1000) {
      throw new Error("EVALUATOR_V2_J3_LATEST_SEND_SPACING_NOT_REACHED");
    }
    if (latest.physical_tab_id !== input.physicalTabId) {
      throw new Error("EVALUATOR_V2_J3_PHYSICAL_TAB_REUSE_VIOLATION");
    }
  }
  const packetBytes = await readFile(resolve(artifactRoot, expected.packetFile));
  const packetInfo = await lstat(resolve(artifactRoot, expected.packetFile));
  if (!packetInfo.isFile() || packetInfo.isSymbolicLink() || (packetInfo.mode & 0o777) !== 0o600
    || sha256(packetBytes) !== expected.exactPacketSha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PACKET_IDENTITY_INVALID");
  }
  const checkpoint = await readLatestCheckpoint({ artifactRoot, schedule, primaryProgress: primary.progress });
  const createdAt = new Date().toISOString();
  const receipt = latestJ3PreSendReceiptSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_pre_send",
    createdAt,
    series_id: latestJ3SeriesId,
    series_ordinal: expected.j3Ordinal,
    frozen_schedule_slot_id: frozenJ3SlotId(expected),
    evaluator_selector_label: latestJ3SelectorLabel,
    evaluator_reasoning_ui_label_observed: input.evaluatorReasoningUiLabelObserved,
    provider_model_slug: null,
    provider_model_slug_status: "UNAVAILABLE_NOT_GUESSED",
    consumer_account_continuity_status: "UNCHANGED",
    chat_mode_status: "Chat",
    fresh_conversation_status: "FRESH_ZERO_MESSAGE_AT_SEND",
    physical_tab_reuse_status: "SAME_REUSABLE_PHYSICAL_TAB",
    physical_tab_id: input.physicalTabId,
    packet_file: expected.packetFile,
    packet_sha256: expected.exactPacketSha256,
    attempt_number: input.attempt,
    attempt_ceiling: 4,
    execution_repository_branch: git.branch,
    execution_repository_commit: git.localHead,
    local_head_at_record: git.localHead,
    github_head_at_record: git.githubHead,
    local_github_head_match: true,
    structural_pre_send_verification_status: "PASSED",
    condition_map_access_status: "SEALED_NOT_INSPECTED",
    clinical_content_inspection_status: "NOT_INSPECTED",
    paid_api_use_status: "ZERO",
    previous_valid_checkpoint_sha256: checkpoint.checkpointSha256,
    previous_valid_checkpoint_file: checkpoint.checkpointFile,
    prior_sol_output_reuse_status: "NOT_REUSED",
  });
  const receiptBytes = jsonBytes(receipt);
  const receiptFile = `${latestJ3RootDirectory}/pre-send-receipts/`
    + `${String(expected.j3Ordinal).padStart(3, "0")}-attempt-${input.attempt}-${Date.now()}.json`;
  await writePrivate(resolve(artifactRoot, receiptFile), receiptBytes);
  return {
    status: "EVALUATOR_V2_J3_LATEST_PRE_SEND_VERIFIED",
    receiptFile,
    receiptSha256: sha256(receiptBytes),
    receiptBytes: Buffer.byteLength(receiptBytes, "utf8"),
    packetFile: expected.packetFile,
    packetSha256: expected.exactPacketSha256,
    previousValidCheckpointSha256: checkpoint.checkpointSha256,
    executionRepositoryCommit: git.localHead,
  };
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
    verifySupersededJ3Preservation(artifactRoot),
  ]);
  const git = await requireLocalGitHubHead(repositoryRoot);
  const finalRoot = resolve(artifactRoot, latestJ3RootDirectory);
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
    schemaVersion: 2,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_capture_progress",
    directiveId: evaluatorV2DirectiveId,
    retryExtensionDirectiveId: evaluatorV2RetryExtensionDirectiveId,
    sourceBoundRestartDirectiveSha256: latestJ3SourceDirectiveSha256,
    seriesId: latestJ3SeriesId,
    evaluatorSelectorLabel: latestJ3SelectorLabel,
    providerModelSlug: null,
    providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
    sourceSupersededInventorySha256: supersededJ3InventorySha256,
    executionRepositoryBranch: latestJ3RepositoryBranch,
    initialExecutionRepositoryCommit: git.localHead,
    latestExecutionRepositoryCommit: git.localHead,
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
  if (schedule.j3JudgmentTarget !== 41) {
    throw new Error("EVALUATOR_V2_J3_LATEST_FROZEN_SCHEDULE_COUNT_INVALID");
  }
  const manifest = latestJ3SeriesManifestSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_restart_manifest",
    seriesId: latestJ3SeriesId,
    sourceBoundRestartDirectiveSha256: latestJ3SourceDirectiveSha256,
    supersededSolInventorySha256: supersededJ3InventorySha256,
    initializedAt: preparedAt,
    executionRepositoryBranch: git.branch,
    executionRepositoryCommit: git.localHead,
    githubHeadAtInitialization: git.githubHead,
    localGithubHeadMatch: true,
    selectorLabel: latestJ3SelectorLabel,
    reasoningUiLabelRule: "HIGHEST_AUTHORIZED_EXACT_UI_LABEL_AT_SEND_TIME",
    providerModelSlug: null,
    providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
    chatModeStatus: "Chat",
    consumerAccountContinuityStatus: "UNCHANGED",
    frozenScheduleSha256: scheduleSha,
    disagreementLedgerSha256: disagreementSha,
    requiredValidJudgmentCount: 41,
    conditionMapAccessStatus: "SEALED_NOT_INSPECTED",
    clinicalContentInspectionStatus: "NOT_INSPECTED",
    paidApiUseStatus: "ZERO",
  });
  const initialCheckpointFile = `${latestJ3RootDirectory}/checkpoints/000-progress.json`;
  const initialCheckpoint = latestJ3CheckpointPointerSchema.parse({
    schemaVersion: 1,
    receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_checkpoint_pointer",
    seriesId: latestJ3SeriesId,
    validJudgmentCount: 0,
    checkpointFile: initialCheckpointFile,
    checkpointSha256: sha256(progressBytes),
    executionRepositoryCommit: git.localHead,
  });

  const evaluationRoot = resolve(artifactRoot, evaluatorV2Directory);
  const stagingRoot = await mkdtemp(resolve(evaluationRoot, ".j3-staging-"));
  await chmod(stagingRoot, 0o700);
  try {
    await Promise.all([
      writePrivate(resolve(stagingRoot, "disagreement-ledger.json"), disagreementBytes),
      writePrivate(resolve(stagingRoot, "evaluation-schedule.json"), scheduleBytes),
      writePrivate(resolve(stagingRoot, "capture-progress.json"), progressBytes),
      writePrivate(resolve(stagingRoot, "preparation-receipt.json"), jsonBytes(preparationReceipt)),
      writePrivate(resolve(stagingRoot, "series-manifest.json"), jsonBytes(manifest)),
      writePrivate(resolve(stagingRoot, "checkpoints/000-progress.json"), progressBytes),
      writePrivate(resolve(stagingRoot, "latest-valid-checkpoint.json"), jsonBytes(initialCheckpoint)),
    ]);
    await Promise.all([
      mkdir(resolve(stagingRoot, "judgments"), { mode: 0o700 }),
      mkdir(resolve(stagingRoot, "receipts"), { mode: 0o700 }),
      mkdir(resolve(stagingRoot, "pre-send-receipts"), { mode: 0o700 }),
    ]);
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
  seriesId: typeof latestJ3SeriesId;
  j3Ordinal: number;
  attempt: number;
  validJudgmentCount: number;
  mechanicalFailureCount: number;
  haltedClaim: string | null;
  progressSha256: string;
  latestValidCheckpointSha256: string;
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
  const git = await requireLocalGitHubHead(repositoryRoot);
  const primary = await loadPrimaryState(artifactRoot);
  if (sha256(primary.progressBytes) !== latestJ3PrimaryProgressSha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRIMARY_STATE_CHANGED");
  }
  const j3Root = resolve(artifactRoot, latestJ3RootDirectory);
  const schedulePath = resolve(j3Root, "evaluation-schedule.json");
  const progressPath = resolve(j3Root, "capture-progress.json");
  const [scheduleValue, progressValue, manifestValue] = await Promise.all([
    readJson(schedulePath),
    readJson(progressPath),
    readJson(resolve(j3Root, "series-manifest.json")),
  ]);
  const schedule = j3ScheduleSchema.parse(scheduleValue);
  const progress = acceptJ3CaptureProgress(schedule, progressValue, primary.progress);
  const manifest = latestJ3SeriesManifestSchema.parse(manifestValue);
  if (schedule.records.length !== 41 || progress.j3JudgmentTarget !== 41
    || manifest.frozenScheduleSha256 !== sha256(jsonBytes(schedule))) {
    throw new Error("EVALUATOR_V2_J3_LATEST_SERIES_MANIFEST_MISMATCH");
  }
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
  if ((receipt.status === "VALID" && !receipt.outputFile.startsWith(`${latestJ3RootDirectory}/judgments/`))
    || (receipt.status === "INVALID_MECHANICAL" && receipt.outputFile !== null
      && !receipt.outputFile.startsWith(`${latestJ3RootDirectory}/judgments/`))) {
    throw new Error("EVALUATOR_V2_J3_LATEST_OUTPUT_NAMESPACE_INVALID");
  }
  const supersededProgress = JSON.parse(await readFile(
    resolve(artifactRoot, supersededJ3RootDirectory, "tree/capture-progress.json"),
    "utf8",
  )) as { records?: Array<{ conversationId?: unknown }>; mechanicalFailures?: Array<{ conversationId?: unknown }> };
  const supersededConversationIds = new Set([
    ...(supersededProgress.records ?? []),
    ...(supersededProgress.mechanicalFailures ?? []),
  ].map(({ conversationId }) => conversationId).filter((value): value is string => typeof value === "string"));
  if (receipt.conversationId !== null && supersededConversationIds.has(receipt.conversationId)) {
    throw new Error("EVALUATOR_V2_J3_SUPERSEDED_CONVERSATION_REUSE_DETECTED");
  }
  const preSendBytes = await assertPrivateFile(
    artifactRoot,
    receipt.pre_send_receipt_file,
    receipt.pre_send_receipt_sha256,
    (await stat(resolve(artifactRoot, receipt.pre_send_receipt_file))).size,
  );
  const preSend = latestJ3PreSendReceiptSchema.parse(JSON.parse(preSendBytes));
  const preSendMatches = preSend.series_ordinal === receipt.series_ordinal
    && preSend.frozen_schedule_slot_id === receipt.frozen_schedule_slot_id
    && preSend.evaluator_selector_label === receipt.evaluator_selector_label
    && preSend.evaluator_reasoning_ui_label_observed === receipt.evaluator_reasoning_ui_label_observed
    && preSend.physical_tab_id === receipt.physical_tab_id
    && preSend.packet_file === receipt.inputFile
    && preSend.packet_sha256 === receipt.packet_sha256
    && preSend.attempt_number === receipt.attempt_number
    && preSend.execution_repository_commit === receipt.execution_repository_commit
    && preSend.local_head_at_record === receipt.local_head_at_record
    && preSend.github_head_at_record === receipt.github_head_at_record
    && preSend.previous_valid_checkpoint_sha256 === receipt.previous_valid_checkpoint_sha256;
  if (!preSendMatches
    || receipt.execution_repository_commit !== git.localHead
    || receipt.local_head_at_record !== git.localHead
    || receipt.github_head_at_record !== git.githubHead) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRE_SEND_BINDING_MISMATCH");
  }
  const priorCheckpoint = await readLatestCheckpoint({
    artifactRoot,
    schedule,
    primaryProgress: primary.progress,
  });
  if (priorCheckpoint.checkpointSha256 !== receipt.previous_valid_checkpoint_sha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PREVIOUS_CHECKPOINT_MISMATCH");
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
  progress.latestExecutionRepositoryCommit = git.localHead;
  progress.updatedAt = new Date().toISOString();
  acceptJ3CaptureProgress(schedule, progress, primary.progress);
  const progressBytes = jsonBytes(progress);
  const progressSha = sha256(progressBytes);
  await replacePrivate(progressPath, progressBytes);
  let latestValidCheckpointSha256 = priorCheckpoint.checkpointSha256;
  if (receipt.status === "VALID") {
    const checkpointFile = `${latestJ3RootDirectory}/checkpoints/`
      + `${String(progress.validJudgmentCount).padStart(3, "0")}-progress.json`;
    await writePrivate(resolve(artifactRoot, checkpointFile), progressBytes);
    const pointer = latestJ3CheckpointPointerSchema.parse({
      schemaVersion: 1,
      receiptType: "zero_spend_chatgpt_mast_four_arm_base_v2_j3_latest_checkpoint_pointer",
      seriesId: latestJ3SeriesId,
      validJudgmentCount: progress.validJudgmentCount,
      checkpointFile,
      checkpointSha256: progressSha,
      executionRepositoryCommit: git.localHead,
    });
    await replacePrivate(resolve(j3Root, "latest-valid-checkpoint.json"), jsonBytes(pointer));
    latestValidCheckpointSha256 = progressSha;
  }
  return {
    status,
    seriesId: latestJ3SeriesId,
    j3Ordinal: receipt.j3Ordinal,
    attempt: receipt.attempt,
    validJudgmentCount: progress.validJudgmentCount,
    mechanicalFailureCount: progress.mechanicalFailureCount,
    haltedClaim: progress.haltedClaim,
    progressSha256: progressSha,
    latestValidCheckpointSha256,
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
    verifySupersededJ3Preservation(artifactRoot),
  ]);
  const primary = await loadPrimaryState(artifactRoot);
  if (sha256(primary.progressBytes) !== latestJ3PrimaryProgressSha256) {
    throw new Error("EVALUATOR_V2_J3_LATEST_PRIMARY_STATE_CHANGED");
  }
  const j3Root = resolve(artifactRoot, latestJ3RootDirectory);
  const finalRoot = resolve(artifactRoot, finalRootDirectory);
  try {
    await stat(finalRoot);
    throw new Error("EVALUATOR_V2_FINAL_ARTIFACTS_ALREADY_EXIST");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const [disagreementBytes, j3ScheduleBytes, j3ProgressBytes, manifestValue] = await Promise.all([
    readFile(resolve(j3Root, "disagreement-ledger.json"), "utf8"),
    readFile(resolve(j3Root, "evaluation-schedule.json"), "utf8"),
    readFile(resolve(j3Root, "capture-progress.json"), "utf8"),
    readJson(resolve(j3Root, "series-manifest.json")),
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
  const manifest = latestJ3SeriesManifestSchema.parse(manifestValue);
  requireCompleteLatestJ3Series(j3Schedule, j3Progress);
  if (manifest.frozenScheduleSha256 !== sha256(j3ScheduleBytes)
    || manifest.disagreementLedgerSha256 !== sha256(disagreementBytes)
    || j3Progress.seriesId !== latestJ3SeriesId
    || j3Progress.records.some((record) => record.series_id !== latestJ3SeriesId)) {
    throw new Error("EVALUATOR_V2_J3_LATEST_FINALIZER_SERIES_MISMATCH");
  }
  const supersededProgressForFinalization = JSON.parse(await readFile(
    resolve(artifactRoot, supersededJ3RootDirectory, "tree/capture-progress.json"),
    "utf8",
  )) as { records?: Array<{ conversationId?: unknown }>; mechanicalFailures?: Array<{ conversationId?: unknown }> };
  const supersededConversationIdsForFinalization = new Set([
    ...(supersededProgressForFinalization.records ?? []),
    ...(supersededProgressForFinalization.mechanicalFailures ?? []),
  ].map(({ conversationId }) => conversationId).filter((value): value is string => typeof value === "string"));
  if ([...j3Progress.records, ...j3Progress.mechanicalFailures]
    .some(({ conversationId }) => conversationId !== null
      && supersededConversationIdsForFinalization.has(conversationId))) {
    throw new Error("EVALUATOR_V2_J3_SUPERSEDED_CONVERSATION_REUSE_DETECTED");
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
      seriesId: latestJ3SeriesId,
      evaluatorSelectorLabel: latestJ3SelectorLabel,
      providerModelSlug: null,
      providerModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
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
    j3SeriesId: latestJ3SeriesId,
    j3EvaluatorSelectorLabel: latestJ3SelectorLabel,
    j3ProviderModelSlug: null,
    j3ProviderModelSlugStatus: "UNAVAILABLE_NOT_GUESSED",
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
