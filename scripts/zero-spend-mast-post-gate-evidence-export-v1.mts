import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import {
  acceptArtifactRoot,
  fourArmGenerationLedgerSchema,
} from "./accept-zero-spend-mast-four-arm-base-generation.mjs";
import { acceptV2BlindedEvaluation } from
  "./zero-spend-mast-four-arm-base-finalization-v2.mjs";
import { sha256 } from "./zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  conditionMapSchema,
  finalRecordsSchema,
  generationCaptureSchema,
} from "./zero-spend-mast-four-arm-base-unblind-gate-v1.mjs";

const execFileAsync = promisify(execFile);

const sourceDirectiveSha256 =
  "72cec6c338f031afa079a227926ece9c933fa239e367f118f6f480f3d332cc93";
const sourceMessageId = "97e54000-2145-466b-b3ab-3127e0912b00";
const runtimeAdmissionSha256 =
  "9f432ea2673bef57e8347aa6b423ad683e051c9fe4a3d1f7b522744099b289a8";
const runtimeAdmissionMessageId = "42035c1c-f799-49e2-8fb3-586672f21e17";
const parentRepairDirectiveSha256 =
  "9f9e94ce2dc4b94e914f665c8bbbc57fae490a90cefdf0e3306a2dcafb22921e";
const priorResultSha256 =
  "0f317577dc966237c69c04df852e12da84ae4a83973fa31237778b9177d89444";
const architectureCommit = "f111ce51281b831ffbda94daf96cd41c0c263348";
const architecturePath = "docs/architecture/mast-post-gate-evidence-review-v1.json";
const architectureSha256 =
  "84e4ac85881d9d1f6a7cbdff1ec2dd57ad42ce85f6c0061ee9ed42af955722b2";
const resultRootDirectory = "evaluation-v2/post-gate-evidence-export-v1";
const lockRootDirectory = "evaluation-v2/.post-gate-evidence-export-v1-execution";
const packageDirectoryName = "package";
const archiveFileName = "post-gate-existing-evidence-v1.tar.gz";
const receiptFileName = "packaging-receipt.json";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const relativeFileSchema = z.string().min(1).refine((value) =>
  !isAbsolute(value) && !value.split(/[\\/]/u).includes(".."),
"expected a confined relative path");

const sourceDirectiveSchema = z.object({
  schemaVersion: z.literal(1),
  directiveType: z.string().min(1),
  directiveId: z.string().min(1),
  status: z.string().min(1),
  sourceBinding: z.object({
    uploadedCompleteReceiptSha256: digestSchema,
    uploadedCompleteReceiptUtf8Bytes: z.number().int().positive(),
    sourceExecutionCommit: commitSchema,
    generationLedgerSha256: digestSchema,
    finalRecordsSha256: digestSchema,
    blindedEvaluationLedgerSha256: digestSchema,
    conditionMapSha256: digestSchema,
    mastSourceCommit: commitSchema,
  }).passthrough(),
  population: z.object({
    familyCount: z.literal(8),
    armCount: z.literal(4),
    trialsPerFamilyArm: z.literal(3),
    responseCount: z.literal(96),
    remainingIndependentValidationMaterialMayBeOpened: z.literal(false),
  }).passthrough(),
  runtimeAdmission: z.object({
    requiredBeforeWorkerExecution: z.literal(true),
    worker: z.literal("askrigor-mast"),
    requestedAction: z.string().min(1),
  }).passthrough(),
  nextBoundedSlice: z.object({
    sliceId: z.string().min(1),
    clinicalInterpretationByWorker: z.literal(false),
    newModelInferenceByExecutor: z.literal(false),
    stopBoundary: z.string().min(1),
  }).passthrough(),
  artifactAndRepositoryPolicy: z.object({
    reuseArchitectureCommit: z.literal(architectureCommit),
    reuseArchitecturePath: z.literal(architecturePath),
    executionBranch: z.literal("task/mast-four-arm-zero-spend-harness-20260901"),
    resetExecutionBranchToSourceCommit: z.literal(false),
    directoryMode: z.literal("0700"),
    fileMode: z.literal("0600"),
    commitPrivateResponsesJudgmentsOrConditionMap: z.literal(false),
    publicResultPublicationAuthorized: z.literal(false),
    newParallelEvaluationArchitectureAuthorized: z.literal(false),
  }).passthrough(),
  delivery: z.object({
    destinationChatLocator: z.string().min(1),
    ownerRelayRequested: z.literal(false),
    queueRecordIsDeliveryReceipt: z.literal(false),
  }).passthrough(),
  prohibitedActions: z.array(z.string().min(1)).min(1),
  externalSpendUsd: z.literal(0),
  completionClaims: z.object({
    success: z.string().min(1),
    blocked: z.string().min(1),
  }).strict(),
}).passthrough();

const runtimeAdmissionSchema = z.object({
  requestId: z.literal("admission:askrigor:mast:closeout-evidence-export-v1:20260906"),
  mayExecute: z.literal(true),
  primaryDecision: z.literal("ALLOW_BOUNDED_EXECUTION"),
  executionSurface: z.literal("SOURCE_WORK_CODEX_ENVIRONMENT"),
  ownerRelayRequested: z.literal(false),
}).passthrough();

const repairDirectiveSchema = z.object({
  armCanonicalization: z.object({
    permittedAliases: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  }).passthrough(),
}).passthrough();

const primaryScheduleSchema = z.object({
  records: z.array(z.object({
    ordinal: z.number().int().positive(),
    opaqueResponseId: z.string().min(1),
    evaluatorReplicate: z.number().int(),
    packetFile: relativeFileSchema,
    exactPacketSha256: digestSchema,
  }).passthrough()).length(192),
}).passthrough();

const evaluatorRecordSchema = z.object({
  ordinal: z.number().int().positive().optional(),
  j3Ordinal: z.number().int().positive().optional(),
  opaqueResponseId: z.string().min(1),
  evaluatorReplicate: z.number().int(),
  outputFile: relativeFileSchema,
  exactOutputSha256: digestSchema,
  exactOutputUtf8Bytes: z.number().int().positive(),
  automaticToolInvocationObserved: z.boolean().nullable().optional(),
  browsingInvoked: z.boolean().nullable().optional(),
  manualToolSelection: z.boolean().nullable().optional(),
  modelNameObserved: z.string().nullable().optional(),
  modelSlugObserved: z.string().nullable().optional(),
  thinkingEffortObserved: z.string().nullable().optional(),
  toolsInvoked: z.boolean().nullable().optional(),
  visibleToolType: z.string().nullable().optional(),
  provenanceStatus: z.string().optional(),
}).passthrough();

const primaryProgressSchema = z.object({
  validJudgmentCount: z.literal(192),
  mechanicalFailureCount: z.number().int().nonnegative(),
  haltedClaim: z.null(),
  records: z.array(evaluatorRecordSchema.extend({
    ordinal: z.number().int().positive(),
  })).length(192),
}).passthrough();

const j3ScheduleSchema = z.object({
  records: z.array(z.object({
    j3Ordinal: z.number().int().positive(),
    opaqueResponseId: z.string().min(1),
    evaluatorReplicate: z.literal(3),
    packetFile: relativeFileSchema,
    exactPacketSha256: digestSchema,
    sourceJ1Ordinal: z.number().int().positive(),
    sourceJ2Ordinal: z.number().int().positive(),
  }).passthrough()).length(41),
}).passthrough();

const j3ProgressSchema = z.object({
  validJudgmentCount: z.literal(41),
  mechanicalFailureCount: z.number().int().nonnegative(),
  haltedClaim: z.null(),
  records: z.array(evaluatorRecordSchema.extend({
    j3Ordinal: z.number().int().positive(),
  })).length(41),
}).passthrough();

const supersededJ3ProgressSchema = z.object({
  validJudgmentCount: z.literal(23),
  records: z.array(evaluatorRecordSchema.extend({
    j3Ordinal: z.number().int().positive(),
  })).length(23),
}).passthrough();

const chunkReceiptSchema = z.object({
  responseCount: z.literal(96),
  records: z.array(z.object({
    opaqueResponseId: z.string().min(1),
    generationOutputFile: relativeFileSchema,
    exactGenerationOutputSha256: digestSchema,
    chunkFile: relativeFileSchema,
    exactChunkFileSha256: digestSchema,
    packetFile: relativeFileSchema,
    exactPacketSha256: digestSchema,
    exactPacketUtf8Bytes: z.number().int().positive(),
    reconstructionVerified: z.literal(true),
  }).passthrough()).length(96),
}).passthrough();

const sourceIdentitySchema = z.object({
  sourceCommit: commitSchema,
  sourceTree: commitSchema,
  worktreeClean: z.literal(true),
  records: z.array(z.object({
    path: relativeFileSchema,
    sha256: digestSchema,
    utf8Bytes: z.number().int().positive(),
    gitBlobSha: z.string().regex(/^[a-f0-9]{40}$/u),
  }).strict()).min(1),
}).passthrough();

const repairedResultSchema = z.object({
  joinAudit: z.object({
    joinedRecordCount: z.literal(96),
    identityRecoverable: z.literal(true),
  }).passthrough(),
  coverageAudit: z.object({ passed: z.literal(true) }).passthrough(),
  primaryDMinusB: z.object({
    perFamily: z.array(z.object({
      familyId: z.string().min(1),
      dMinusB: z.object({
        numerator: z.string().regex(/^-?[0-9]+$/u),
        denominator: z.string().regex(/^[1-9][0-9]*$/u),
      }).passthrough(),
    }).strict()).length(8),
  }).passthrough(),
  gate: z.object({ result: z.enum(["PASS", "FAIL"]) }).passthrough(),
  acceptanceChecks: z.object({ allPassed: z.literal(true) }).passthrough(),
  modelInferenceUsed: z.literal(false),
  providerApiCredentialsUsed: z.literal(false),
  externalSpendUsd: z.literal(0),
}).passthrough();

type JsonObject = Record<string, unknown>;
type EvaluatorRecord = z.infer<typeof evaluatorRecordSchema>;

export type IdentityRecord = {
  opaqueResponseId: string;
  generationLedgerRecordId: string;
  sequence: number;
  generationOutputSha256: string;
};

export function validateIdentityJoins(input: {
  mapping: IdentityRecord[];
  generation: Array<{ opaqueInputId: string; sequence: number; exactOutputSha256: string }>;
  final: Array<{ opaqueResponseId: string }>;
}): void {
  const mappingOpaque = new Set(input.mapping.map(({ opaqueResponseId }) => opaqueResponseId));
  const mappingGeneration = new Set(input.mapping.map(
    ({ generationLedgerRecordId }) => generationLedgerRecordId));
  const generation = new Map(input.generation.map((record) => [record.opaqueInputId, record]));
  const final = new Set(input.final.map(({ opaqueResponseId }) => opaqueResponseId));
  if (mappingOpaque.size !== input.mapping.length
    || mappingGeneration.size !== input.mapping.length
    || generation.size !== input.generation.length
    || final.size !== input.final.length) {
    throw new Error("POST_GATE_EXPORT_DUPLICATE_IDENTITY");
  }
  for (const mapping of input.mapping) {
    const source = generation.get(mapping.generationLedgerRecordId);
    if (!source || !final.has(mapping.opaqueResponseId)
      || source.sequence !== mapping.sequence
      || source.exactOutputSha256 !== mapping.generationOutputSha256) {
      throw new Error("POST_GATE_EXPORT_IDENTITY_JOIN_MISMATCH");
    }
  }
}

export function compareRational(
  left: { numerator: string; denominator: string },
  right: { numerator: string; denominator: string },
): number {
  const a = BigInt(left.numerator) * BigInt(right.denominator);
  const b = BigInt(right.numerator) * BigInt(left.denominator);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function prioritizedFamilyIds(perFamily: Array<{
  familyId: string;
  dMinusB: { numerator: string; denominator: string };
}>): { lower: string[]; higher: string[] } {
  if (perFamily.length < 4 || new Set(perFamily.map(({ familyId }) => familyId)).size
    !== perFamily.length) throw new Error("POST_GATE_EXPORT_PRIORITY_INPUT_INVALID");
  const ordered = [...perFamily].sort((a, b) =>
    compareRational(a.dMinusB, b.dMinusB) || a.familyId.localeCompare(b.familyId));
  return {
    lower: ordered.slice(0, 2).map(({ familyId }) => familyId),
    higher: ordered.slice(-2).map(({ familyId }) => familyId),
  };
}

export function normalizeDestinationChatLocator(value: string): string {
  const normalized = value.replace(/^\[(?=https:\/\/)/u, "");
  let destinationUrl: URL;
  try {
    destinationUrl = new URL(normalized);
  } catch {
    throw new Error("POST_GATE_EXPORT_DESTINATION_LOCATOR_INVALID");
  }
  if (destinationUrl.protocol !== "https:" || destinationUrl.hostname !== "chatgpt.com"
    || !destinationUrl.pathname.startsWith("/c/")
    || normalized.includes("[") || normalized.includes("]")) {
    throw new Error("POST_GATE_EXPORT_DESTINATION_LOCATOR_INVALID");
  }
  return normalized;
}

function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return stdout.trim();
}

async function gitBytes(root: string, object: string): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", ["show", object], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse((await readFile(path)).toString("utf8"));
}

function mapUnique<T>(records: T[], key: (record: T) => string, code: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    const id = key(record);
    if (result.has(id)) throw new Error(code);
    result.set(id, record);
  }
  return result;
}

async function allFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("POST_GATE_EXPORT_SOURCE_SYMLINK_FORBIDDEN");
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
      else throw new Error("POST_GATE_EXPORT_UNSUPPORTED_SOURCE_NODE");
    }
  }
  await visit(root);
  return result.sort();
}

async function ensurePrivateTree(root: string): Promise<void> {
  for (const path of [root, ...await allDirectories(root)]) await chmod(path, 0o700);
  for (const path of await allFiles(root)) await chmod(path, 0o600);
}

async function allDirectories(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = resolve(directory, entry.name);
      result.push(path);
      await visit(path);
    }
  }
  await visit(root);
  return result.sort();
}

async function copyPrivate(source: string, destination: string): Promise<Buffer> {
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) {
    throw new Error("POST_GATE_EXPORT_SOURCE_FILE_INVALID");
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  await copyFile(source, destination);
  await chmod(destination, 0o600);
  return readFile(destination);
}

function evaluatorProvenance(record: EvaluatorRecord): JsonObject {
  return {
    automaticToolInvocationObserved: record.automaticToolInvocationObserved ?? null,
    browsingInvoked: record.browsingInvoked ?? null,
    manualToolSelection: record.manualToolSelection ?? null,
    modelNameObserved: record.modelNameObserved ?? null,
    modelSlugObserved: record.modelSlugObserved ?? null,
    thinkingEffortObserved: record.thinkingEffortObserved ?? null,
    toolsInvoked: record.toolsInvoked ?? null,
    visibleToolType: record.visibleToolType ?? null,
    provenanceStatus: record.provenanceStatus ?? null,
  };
}

function canonicalArmAliases(
  aliases: Record<string, string[]>,
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [canonical, values] of Object.entries(aliases)) {
    for (const value of values) {
      if (result.has(value)) throw new Error("POST_GATE_EXPORT_ARM_ALIAS_COLLISION");
      result.set(value, canonical);
    }
  }
  if (result.size < 4) throw new Error("POST_GATE_EXPORT_ARM_ALIASES_INCOMPLETE");
  return result;
}

function sourceRef(path: string, bytes: Buffer): JsonObject {
  return { path, sha256: sha256(bytes), utf8Bytes: bytes.length };
}

type ManifestRecord = {
  sourceRoot: "PRIVATE_ARTIFACT_ROOT" | "MAST_SOURCE_ROOT" | "EXECUTION_REPOSITORY" | "GIT_OBJECT";
  sourcePath: string;
  archivePath: string;
  sha256: string;
  utf8Bytes: number;
};

export async function runPostGateEvidenceExport(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  sourceDirectiveFile: string;
  runtimeAdmissionFile: string;
}): Promise<{
  status: string;
  resultDirectory: string;
  archiveFile: string;
  archiveSha256: string;
  archiveUtf8Bytes: number;
  manifestSha256: string;
  packagedFileCount: number;
  responseIndexCount: 96;
  primaryJudgmentCount: 192;
  activeJ3JudgmentCount: 41;
  supersededJ3JudgmentCount: 23;
  modelInferenceUsed: false;
  providerApiCredentialsUsed: false;
  externalSpendUsd: 0;
}> {
  for (const path of Object.values(input)) {
    if (!isAbsolute(path)) throw new Error("POST_GATE_EXPORT_PATHS_MUST_BE_ABSOLUTE");
  }
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot), realpath(input.mastRoot), realpath(input.artifactRoot),
  ]);
  const resultRoot = resolve(artifactRoot, resultRootDirectory);
  const lockRoot = resolve(artifactRoot, lockRootDirectory);
  if (await exists(resultRoot) || await exists(lockRoot)) {
    throw new Error("POST_GATE_EXPORT_ALREADY_EXECUTED_OR_IN_PROGRESS");
  }

  const [directiveBytes, admissionBytes] = await Promise.all([
    readFile(input.sourceDirectiveFile), readFile(input.runtimeAdmissionFile),
  ]);
  if (sha256(directiveBytes) !== sourceDirectiveSha256) {
    throw new Error("POST_GATE_EXPORT_SOURCE_DIRECTIVE_HASH_MISMATCH");
  }
  if (sha256(admissionBytes) !== runtimeAdmissionSha256) {
    throw new Error("POST_GATE_EXPORT_RUNTIME_ADMISSION_HASH_MISMATCH");
  }
  const directive = sourceDirectiveSchema.parse(JSON.parse(directiveBytes.toString("utf8")));
  const admission = runtimeAdmissionSchema.parse(JSON.parse(admissionBytes.toString("utf8")));
  const normalizedDestinationChatLocator = normalizeDestinationChatLocator(
    directive.delivery.destinationChatLocator);
  const [head, branch, commitMessage, mastHead, mastTree, mastStatus] = await Promise.all([
    gitText(repositoryRoot, "rev-parse", "HEAD"),
    gitText(repositoryRoot, "branch", "--show-current"),
    gitText(repositoryRoot, "log", "-1", "--pretty=%s"),
    gitText(mastRoot, "rev-parse", "HEAD"),
    gitText(mastRoot, "rev-parse", "HEAD^{tree}"),
    gitText(mastRoot, "status", "--porcelain"),
  ]);
  if (branch !== directive.artifactAndRepositoryPolicy.executionBranch) {
    throw new Error("POST_GATE_EXPORT_EXECUTION_BRANCH_MISMATCH");
  }
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor",
      directive.sourceBinding.sourceExecutionCommit, head], { cwd: repositoryRoot });
  } catch {
    throw new Error("POST_GATE_EXPORT_SOURCE_COMMIT_NOT_ANCESTOR");
  }
  if (mastHead !== directive.sourceBinding.mastSourceCommit || mastStatus !== "") {
    throw new Error("POST_GATE_EXPORT_MAST_PIN_INVALID");
  }

  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    acceptV2BlindedEvaluation({ repositoryRoot, mastRoot, artifactRoot }),
  ]);

  const paths = {
    generationLedger: resolve(artifactRoot, "generation-ledger.json"),
    generationCapture: resolve(artifactRoot, "capture-progress.json"),
    conditionMap: resolve(artifactRoot, "evaluation-v1/opaque-response-map.json"),
    sourceIdentity: resolve(artifactRoot, "evaluation-v1/source-identity.json"),
    primarySchedule: resolve(artifactRoot, "evaluation-v2/primary-evaluation-schedule.json"),
    primaryProgress: resolve(artifactRoot, "evaluation-v2/primary-capture-progress.json"),
    chunkReceipt: resolve(artifactRoot, "evaluation-v2/chunk-reconstruction-receipt.json"),
    j3Schedule: resolve(artifactRoot,
      "evaluation-v2/j3-latest-restart/evaluation-schedule.json"),
    j3Progress: resolve(artifactRoot,
      "evaluation-v2/j3-latest-restart/capture-progress.json"),
    supersededJ3Progress: resolve(artifactRoot,
      "evaluation-v2/superseded/j3-gpt-5-6-sol-23-valid/tree/capture-progress.json"),
    finalRecords: resolve(artifactRoot, "evaluation-v2/final/blinded-response-records.json"),
    finalLedger: resolve(artifactRoot, "evaluation-v2/final/blinded-evaluation-ledger.json"),
    priorResult: resolve(artifactRoot,
      "evaluation-v2/unblinded-gate-v1/unblinded-factual-result.json"),
    repairedResult: resolve(artifactRoot,
      "evaluation-v2/unblinded-gate-v1-repair/unblinded-gate-repair-factual-result.json"),
    repairDirective: resolve(artifactRoot,
      "supervision-routing/unblind-join-repair-directive.json"),
  };
  const artifactSourceFiles = await allFiles(artifactRoot);
  const [generationLedgerBytes, generationCaptureBytes, conditionMapBytes,
    sourceIdentityBytes, primaryScheduleBytes, primaryProgressBytes, chunkReceiptBytes,
    j3ScheduleBytes, j3ProgressBytes, supersededJ3ProgressBytes, finalRecordsBytes,
    finalLedgerBytes, priorResultBytes, repairedResultBytes, repairDirectiveBytes] =
    await Promise.all(Object.values(paths).map((path) => readFile(path)));
  if (sha256(generationLedgerBytes) !== directive.sourceBinding.generationLedgerSha256
    || sha256(conditionMapBytes) !== directive.sourceBinding.conditionMapSha256
    || sha256(finalRecordsBytes) !== directive.sourceBinding.finalRecordsSha256
    || sha256(finalLedgerBytes) !== directive.sourceBinding.blindedEvaluationLedgerSha256
    || sha256(priorResultBytes) !== priorResultSha256
    || sha256(repairedResultBytes) !== directive.sourceBinding.uploadedCompleteReceiptSha256
    || repairedResultBytes.length !== directive.sourceBinding.uploadedCompleteReceiptUtf8Bytes
    || sha256(repairDirectiveBytes) !== parentRepairDirectiveSha256) {
    throw new Error("POST_GATE_EXPORT_IMMUTABLE_SOURCE_HASH_MISMATCH");
  }

  const generationLedger = fourArmGenerationLedgerSchema.parse(
    JSON.parse(generationLedgerBytes.toString("utf8")));
  const generationCapture = generationCaptureSchema.parse(
    JSON.parse(generationCaptureBytes.toString("utf8")));
  const conditionMap = conditionMapSchema.parse(JSON.parse(conditionMapBytes.toString("utf8")));
  const sourceIdentity = sourceIdentitySchema.parse(
    JSON.parse(sourceIdentityBytes.toString("utf8")));
  const primarySchedule = primaryScheduleSchema.parse(
    JSON.parse(primaryScheduleBytes.toString("utf8")));
  const primaryProgress = primaryProgressSchema.parse(
    JSON.parse(primaryProgressBytes.toString("utf8")));
  const chunkReceipt = chunkReceiptSchema.parse(
    JSON.parse(chunkReceiptBytes.toString("utf8")));
  const j3Schedule = j3ScheduleSchema.parse(JSON.parse(j3ScheduleBytes.toString("utf8")));
  const j3Progress = j3ProgressSchema.parse(JSON.parse(j3ProgressBytes.toString("utf8")));
  const supersededJ3 = supersededJ3ProgressSchema.parse(
    JSON.parse(supersededJ3ProgressBytes.toString("utf8")));
  const finalRecords = finalRecordsSchema.parse(JSON.parse(finalRecordsBytes.toString("utf8")));
  const repairedResult = repairedResultSchema.parse(
    JSON.parse(repairedResultBytes.toString("utf8")));
  const repairDirective = repairDirectiveSchema.parse(
    JSON.parse(repairDirectiveBytes.toString("utf8")));
  const directiveRoot = JSON.parse(directiveBytes.toString("utf8")) as JsonObject;
  const reviewDisposition = directiveRoot.reviewDisposition as JsonObject | undefined;
  if (reviewDisposition?.acceptedGateResult !== repairedResult.gate.result) {
    throw new Error("POST_GATE_EXPORT_REVIEW_DISPOSITION_MISMATCH");
  }
  if (sourceIdentity.sourceCommit !== mastHead || sourceIdentity.sourceTree !== mastTree) {
    throw new Error("POST_GATE_EXPORT_SOURCE_IDENTITY_MISMATCH");
  }

  validateIdentityJoins({
    mapping: conditionMap.records.map((record) => ({
      opaqueResponseId: record.opaqueResponseId,
      generationLedgerRecordId: record.generationLedgerRecordId,
      sequence: record.sequence,
      generationOutputSha256: record.exactGenerationOutputSha256,
    })),
    generation: generationLedger.records.map((record) => ({
      opaqueInputId: record.opaqueInputId,
      sequence: record.sequence,
      exactOutputSha256: record.exactOutputSha256,
    })),
    final: finalRecords.records.map(({ opaqueResponseId }) => ({ opaqueResponseId })),
  });

  const generationById = mapUnique(generationLedger.records,
    ({ opaqueInputId }) => opaqueInputId, "POST_GATE_EXPORT_GENERATION_ID_DUPLICATE");
  const generationCaptureById = mapUnique(generationCapture.records,
    ({ opaqueInputId }) => opaqueInputId, "POST_GATE_EXPORT_CAPTURE_ID_DUPLICATE");
  const finalById = mapUnique(finalRecords.records,
    ({ opaqueResponseId }) => opaqueResponseId, "POST_GATE_EXPORT_FINAL_ID_DUPLICATE");
  const chunkById = mapUnique(chunkReceipt.records,
    ({ opaqueResponseId }) => opaqueResponseId, "POST_GATE_EXPORT_CHUNK_ID_DUPLICATE");
  const primaryByOrdinal = mapUnique(primaryProgress.records,
    ({ ordinal }) => String(ordinal), "POST_GATE_EXPORT_PRIMARY_ORDINAL_DUPLICATE");
  const j3ByOrdinal = mapUnique(j3Progress.records,
    ({ j3Ordinal }) => String(j3Ordinal), "POST_GATE_EXPORT_J3_ORDINAL_DUPLICATE");
  const supersededByOrdinal = mapUnique(supersededJ3.records,
    ({ j3Ordinal }) => String(j3Ordinal), "POST_GATE_EXPORT_SUPERSEDED_J3_DUPLICATE");
  if (supersededByOrdinal.size !== 23) throw new Error("POST_GATE_EXPORT_SUPERSEDED_J3_INVALID");
  const primarySchedulesByOpaque = new Map<string, typeof primarySchedule.records>();
  for (const record of primarySchedule.records) {
    const values = primarySchedulesByOpaque.get(record.opaqueResponseId) ?? [];
    values.push(record);
    primarySchedulesByOpaque.set(record.opaqueResponseId, values);
  }
  const j3ScheduleByOrdinal = mapUnique(j3Schedule.records,
    ({ j3Ordinal }) => String(j3Ordinal), "POST_GATE_EXPORT_J3_SCHEDULE_DUPLICATE");
  const aliases = canonicalArmAliases(repairDirective.armCanonicalization.permittedAliases);
  const sourceByPath = new Map(sourceIdentity.records.map((record) => [record.path, record]));

  const responseIndex: JsonObject[] = [];
  for (const mapping of [...conditionMap.records].sort((a, b) => a.sequence - b.sequence)) {
    const generation = generationById.get(mapping.generationLedgerRecordId);
    const capture = generationCaptureById.get(mapping.generationLedgerRecordId);
    const final = finalById.get(mapping.opaqueResponseId);
    const chunk = chunkById.get(mapping.opaqueResponseId);
    const primarySchedulePair = primarySchedulesByOpaque.get(mapping.opaqueResponseId) ?? [];
    const canonicalArm = aliases.get(mapping.armId);
    if (!generation || !capture || !final || !chunk || !canonicalArm
      || primarySchedulePair.length !== 2
      || generation.sequence !== mapping.sequence
      || generation.exactOutputSha256 !== mapping.exactGenerationOutputSha256
      || generation.outputFile !== mapping.generationOutputFile
      || capture.exactOutputSha256 !== generation.exactOutputSha256
      || chunk.exactGenerationOutputSha256 !== generation.exactOutputSha256
      || chunk.generationOutputFile !== generation.outputFile
      || final.caseId !== mapping.familyId
      || primarySchedulePair.some((scheduled) => scheduled.packetFile !== chunk.packetFile
        || scheduled.exactPacketSha256 !== chunk.exactPacketSha256)) {
      throw new Error("POST_GATE_EXPORT_RESPONSE_JOIN_INVALID");
    }
    const primaryJudgments = primarySchedulePair
      .sort((a, b) => a.evaluatorReplicate - b.evaluatorReplicate)
      .map((scheduled) => {
        const captured = primaryByOrdinal.get(String(scheduled.ordinal));
        if (!captured || captured.opaqueResponseId !== mapping.opaqueResponseId
          || captured.evaluatorReplicate !== scheduled.evaluatorReplicate
          || captured.exactOutputSha256 === undefined) {
          throw new Error("POST_GATE_EXPORT_PRIMARY_JOIN_INVALID");
        }
        return {
          ordinal: scheduled.ordinal,
          evaluatorReplicate: scheduled.evaluatorReplicate,
          judgment: {
            path: captured.outputFile,
            sha256: captured.exactOutputSha256,
            utf8Bytes: captured.exactOutputUtf8Bytes,
          },
          provenance: evaluatorProvenance(captured),
        };
      });
    let activeJ3: JsonObject | null = null;
    if (final.sourceJ3Ordinal !== null) {
      const scheduled = j3ScheduleByOrdinal.get(String(final.sourceJ3Ordinal));
      const captured = j3ByOrdinal.get(String(final.sourceJ3Ordinal));
      if (!scheduled || !captured || scheduled.opaqueResponseId !== mapping.opaqueResponseId
        || captured.opaqueResponseId !== mapping.opaqueResponseId
        || scheduled.sourceJ1Ordinal !== final.sourceJ1Ordinal
        || scheduled.sourceJ2Ordinal !== final.sourceJ2Ordinal
        || scheduled.packetFile !== chunk.packetFile
        || scheduled.exactPacketSha256 !== chunk.exactPacketSha256) {
        throw new Error("POST_GATE_EXPORT_ACTIVE_J3_JOIN_INVALID");
      }
      activeJ3 = {
        ordinal: final.sourceJ3Ordinal,
        judgment: {
          path: captured.outputFile,
          sha256: captured.exactOutputSha256,
          utf8Bytes: captured.exactOutputUtf8Bytes,
        },
        provenance: evaluatorProvenance(captured),
      };
    }
    const rubricPath = `benchmarks/donoharm/dataset/rubrics/${mapping.familyId}.json`;
    const guidancePath = `benchmarks/donoharm/guidance/${mapping.familyId}.yaml`;
    const rubricSource = sourceByPath.get(rubricPath);
    const guidanceSource = sourceByPath.get(guidancePath);
    if (!rubricSource || !guidanceSource) {
      throw new Error("POST_GATE_EXPORT_FAMILY_SOURCE_MISSING");
    }
    responseIndex.push({
      sequence: mapping.sequence,
      identity: {
        generationLedgerRecordId: mapping.generationLedgerRecordId,
        opaqueResponseId: mapping.opaqueResponseId,
        familyId: mapping.familyId,
        armId: canonicalArm,
        trial: mapping.trial,
      },
      generation: {
        input: {
          path: generation.inputFile,
          sha256: generation.exactInputSha256,
        },
        output: {
          path: generation.outputFile,
          sha256: generation.exactOutputSha256,
          utf8Bytes: generation.exactOutputUtf8Bytes,
        },
        provenance: {
          automaticToolInvocationObserved: generation.automaticToolInvocationObserved,
          browsingInvoked: generation.browsingInvoked,
          manualToolSelection: generation.manualToolSelection,
          modelNameObserved: generation.modelNameObserved,
          modelSlugObserved: generation.modelSlugObserved,
          thinkingEffortObserved: generation.thinkingEffortObserved,
          toolsInvoked: generation.toolsInvoked,
          visibleToolType: generation.visibleToolType,
          provenanceStatus: generation.provenanceStatus,
        },
      },
      sourceMaterials: {
        dataset: sourceByPath.get("benchmarks/donoharm/dataset/items.jsonl") ?? null,
        rubric: rubricSource,
        guidance: guidanceSource,
      },
      evaluation: {
        packet: {
          path: chunk.packetFile,
          sha256: chunk.exactPacketSha256,
          utf8Bytes: chunk.exactPacketUtf8Bytes,
        },
        sealedMappingPredecessorPacket: {
          path: mapping.packetFile,
          sha256: mapping.exactPacketSha256,
          utf8Bytes: mapping.exactPacketUtf8Bytes,
        },
        responseChunk: {
          path: chunk.chunkFile,
          sha256: chunk.exactChunkFileSha256,
        },
        primaryJudgments,
        activeJ3,
        selectedJudge: {
          sourceRule: final.sourceRule,
          evaluatorReplicate: final.evaluatorReplicate,
          sourceJ1Ordinal: final.sourceJ1Ordinal,
          sourceJ2Ordinal: final.sourceJ2Ordinal,
          sourceJ3Ordinal: final.sourceJ3Ordinal,
          judgment: {
            path: final.selectedOutputFile,
            sha256: final.exactSelectedOutputSha256,
            utf8Bytes: final.exactSelectedOutputUtf8Bytes,
          },
        },
        metrics: final.metrics,
        safety: { pilotSevereCommission: final.pilotSevereCommission },
      },
    });
  }
  if (responseIndex.length !== 96) throw new Error("POST_GATE_EXPORT_INDEX_COUNT_INVALID");

  const priorities = prioritizedFamilyIds(repairedResult.primaryDMinusB.perFamily);
  const rowFor = (record: JsonObject): JsonObject => {
    const identity = record.identity as JsonObject;
    return {
      sequence: record.sequence,
      opaqueResponseId: identity.opaqueResponseId,
      familyId: identity.familyId,
      armId: identity.armId,
      trial: identity.trial,
    };
  };
  const recordsForFamilies = (familyIds: string[]): JsonObject[] => responseIndex
    .filter((record) => familyIds.includes(String((record.identity as JsonObject).familyId)))
    .map(rowFor);
  const flagged = responseIndex.filter((record) =>
    Boolean((((record.evaluation as JsonObject).safety as JsonObject).pilotSevereCommission)))
    .map(rowFor);
  const diagnosticNavigation = {
    schemaVersion: 1,
    selectionIsPostResultExploratory: true,
    prioritizedExistingEvidence: {
      lowerExistingContrast: recordsForFamilies(priorities.lower),
      higherExistingContrast: recordsForFamilies(priorities.higher),
    },
    existingSafetyFlaggedResponses: flagged,
    otherFamiliesExcludedFromArchive: false,
    newInferenceOrRescoringUsed: false,
  };
  if (diagnosticNavigation.prioritizedExistingEvidence.lowerExistingContrast.length !== 24
    || diagnosticNavigation.prioritizedExistingEvidence.higherExistingContrast.length !== 24
    || flagged.length === 0) {
    throw new Error("POST_GATE_EXPORT_DIAGNOSTIC_NAVIGATION_INVALID");
  }

  await mkdir(lockRoot, { mode: 0o700 });
  await chmod(lockRoot, 0o700);
  const packageRoot = resolve(lockRoot, packageDirectoryName);
  await mkdir(packageRoot, { mode: 0o700 });
  const manifestRecords: ManifestRecord[] = [];
  const addBytes = async (
    sourceRoot: ManifestRecord["sourceRoot"],
    sourcePath: string,
    archivePath: string,
    bytes: Buffer,
  ): Promise<void> => {
    const destination = resolve(packageRoot, archivePath);
    if (relative(packageRoot, destination).startsWith("..")) {
      throw new Error("POST_GATE_EXPORT_ARCHIVE_PATH_ESCAPE");
    }
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    await chmod(destination, 0o600);
    manifestRecords.push({
      sourceRoot, sourcePath, archivePath, sha256: sha256(bytes), utf8Bytes: bytes.length,
    });
  };

  for (const source of artifactSourceFiles) {
    const sourcePath = relative(artifactRoot, source);
    const archivePath = `payload/private-artifacts/${sourcePath}`;
    const bytes = await copyPrivate(source, resolve(packageRoot, archivePath));
    manifestRecords.push({
      sourceRoot: "PRIVATE_ARTIFACT_ROOT",
      sourcePath,
      archivePath,
      sha256: sha256(bytes),
      utf8Bytes: bytes.length,
    });
  }
  for (const record of sourceIdentity.records) {
    const source = resolve(mastRoot, record.path);
    const bytes = await readFile(source);
    if (sha256(bytes) !== record.sha256 || bytes.length !== record.utf8Bytes) {
      throw new Error("POST_GATE_EXPORT_MAST_SOURCE_HASH_MISMATCH");
    }
    await addBytes("MAST_SOURCE_ROOT", record.path,
      `payload/mast-source/${record.path}`, bytes);
  }
  const repositoryFiles = (await allFiles(resolve(repositoryRoot, "docs")))
    .filter((path) => {
      const rel = relative(repositoryRoot, path);
      return (rel.startsWith("docs/directives/") || rel.startsWith("docs/audits/"))
        && basename(path).toLowerCase().includes("mast") && path.endsWith(".json");
    });
  for (const source of repositoryFiles) {
    const sourcePath = relative(repositoryRoot, source);
    await addBytes("EXECUTION_REPOSITORY", sourcePath,
      `payload/repository/${sourcePath}`, await readFile(source));
  }
  const architectureBytes = await gitBytes(repositoryRoot,
    `${architectureCommit}:${architecturePath}`);
  if (sha256(architectureBytes) !== architectureSha256) {
    throw new Error("POST_GATE_EXPORT_ARCHITECTURE_HASH_MISMATCH");
  }
  await addBytes("GIT_OBJECT", `${architectureCommit}:${architecturePath}`,
    `payload/repository/${architecturePath}`, architectureBytes);

  await addBytes("PRIVATE_ARTIFACT_ROOT", "DERIVED_RESPONSE_INDEX",
    "index/response-index.json", jsonBytes({
      schemaVersion: 1,
      responseCount: 96,
      rows: responseIndex,
    }));
  await addBytes("PRIVATE_ARTIFACT_ROOT", "DERIVED_DIAGNOSTIC_NAVIGATION",
    "index/diagnostic-navigation.json", jsonBytes(diagnosticNavigation));
  await addBytes("PRIVATE_ARTIFACT_ROOT", "DERIVED_CONTROL_PLANE_INDEX",
    "index/control-plane.json", jsonBytes({
      schemaVersion: 1,
      sourceDirective: {
        sourceMessageId,
        exactBodySha256: sourceDirectiveSha256,
      },
      runtimeAdmission: {
        requestId: admission.requestId,
        responseMessageId: runtimeAdmissionMessageId,
        exactBodySha256: runtimeAdmissionSha256,
        mayExecute: true,
        primaryDecision: admission.primaryDecision,
      },
      delivery: {
        destinationLocatorValidated: true,
        sourceTransportPrefixNormalized: normalizedDestinationChatLocator
          !== directive.delivery.destinationChatLocator,
        ownerRelayRequested: false,
      },
      execution: { branch, head, commitMessage },
      source: { mastHead, mastTree, sourceFileCount: sourceIdentity.records.length },
      identities: {
        responseCount: 96,
        primaryJudgmentCount: 192,
        activeJ3JudgmentCount: 41,
        supersededJ3JudgmentCount: 23,
        explicitOpaqueJoinComplete: true,
        explicitGenerationJoinComplete: true,
      },
      preservation: {
        priorResultSha256,
        repairedResultSha256: directive.sourceBinding.uploadedCompleteReceiptSha256,
        conditionMapSha256: directive.sourceBinding.conditionMapSha256,
        frozenSourcesModified: false,
      },
      restrictions: {
        clinicalInterpretationByWorker: false,
        modelInferenceUsed: false,
        providerApiCredentialsUsed: false,
        externalSpendUsd: 0,
      },
    }));

  manifestRecords.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
  if (new Set(manifestRecords.map(({ archivePath }) => archivePath)).size
    !== manifestRecords.length) {
    throw new Error("POST_GATE_EXPORT_DUPLICATE_ARCHIVE_PATH");
  }
  const manifestBytes = jsonBytes({
    schemaVersion: 1,
    archiveType: "PRIVATE_SOURCE_INDEXED_EXISTING_EVIDENCE_V1",
    sourceDirective: { sourceMessageId, exactBodySha256: sourceDirectiveSha256 },
    execution: { branch, head },
    responseCount: 96,
    primaryJudgmentCount: 192,
    activeJ3JudgmentCount: 41,
    supersededJ3JudgmentCount: 23,
    packagedFileCount: manifestRecords.length,
    files: manifestRecords,
    modelInferenceUsed: false,
    providerApiCredentialsUsed: false,
    externalSpendUsd: 0,
  });
  const manifestPath = resolve(packageRoot, "manifest.json");
  await writeFile(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  await chmod(manifestPath, 0o600);
  const manifestDigest = sha256(manifestBytes);
  await writeFile(resolve(packageRoot, "manifest.sha256"),
    Buffer.from(`${manifestDigest}  manifest.json\n`, "utf8"), { flag: "wx", mode: 0o600 });
  await ensurePrivateTree(packageRoot);

  const tarPath = resolve(lockRoot, archiveFileName.replace(/\.gz$/u, ""));
  await execFileAsync("tar", [
    "--format=posix", "--sort=name", "--mtime=@0", "--owner=0", "--group=0",
    "--numeric-owner", "--pax-option=delete=atime,delete=ctime", "-cf", tarPath,
    "-C", packageRoot, ".",
  ], { maxBuffer: 4 * 1024 * 1024 });
  await execFileAsync("gzip", ["-n", "-9", "--keep", tarPath], {
    maxBuffer: 4 * 1024 * 1024,
  });
  await rm(tarPath);
  const archivePath = `${tarPath}.gz`;
  await chmod(archivePath, 0o600);
  const archiveBytes = await readFile(archivePath);
  const receipt = {
    schemaVersion: 1,
    receiptType: "zero_spend_mast_post_gate_existing_evidence_export_v1",
    sourceDirective: { sourceMessageId, exactBodySha256: sourceDirectiveSha256 },
    runtimeAdmission: {
      responseMessageId: runtimeAdmissionMessageId,
      exactBodySha256: runtimeAdmissionSha256,
      mayExecute: true,
      primaryDecision: admission.primaryDecision,
    },
    delivery: {
      destinationLocatorValidated: true,
      sourceTransportPrefixNormalized: normalizedDestinationChatLocator
        !== directive.delivery.destinationChatLocator,
      ownerRelayRequested: false,
    },
    execution: { branch, head, commitMessage, resetPerformed: false },
    source: { mastHead, mastTree, worktreeClean: true },
    archive: {
      file: `${resultRootDirectory}/${archiveFileName}`,
      sha256: sha256(archiveBytes),
      utf8Bytes: archiveBytes.length,
      manifestSha256: manifestDigest,
      packagedFileCount: manifestRecords.length,
    },
    validation: {
      responseIndexCount: 96,
      primaryJudgmentCount: 192,
      activeJ3JudgmentCount: 41,
      supersededJ3JudgmentCount: 23,
      sourceFileCount: sourceIdentity.records.length,
      explicitIdentifierJoinsPassed: true,
      sequenceAndGenerationHashChecksPassed: true,
      archiveManifestCoveragePassed: true,
      privateModesApplied: true,
    },
    preservation: {
      sourceArtifactsModified: false,
      priorResultSha256,
      repairedResultSha256: directive.sourceBinding.uploadedCompleteReceiptSha256,
    },
    modelInferenceUsed: false,
    providerApiCredentialsUsed: false,
    externalSpendUsd: 0,
    clinicalInterpretationIncluded: false,
    completionClaim: directive.completionClaims.success,
  };
  const receiptBytes = jsonBytes(receipt);
  await writeFile(resolve(lockRoot, receiptFileName), receiptBytes, {
    flag: "wx", mode: 0o600,
  });
  await chmod(resolve(lockRoot, receiptFileName), 0o600);
  await ensurePrivateTree(lockRoot);
  await rename(lockRoot, resultRoot);
  await ensurePrivateTree(resultRoot);
  if (sha256(await readFile(paths.priorResult)) !== priorResultSha256
    || sha256(await readFile(paths.repairedResult))
    !== directive.sourceBinding.uploadedCompleteReceiptSha256) {
    throw new Error("POST_GATE_EXPORT_SOURCE_CHANGED_DURING_EXECUTION");
  }
  return {
    status: directive.completionClaims.success,
    resultDirectory: resultRootDirectory,
    archiveFile: `${resultRootDirectory}/${archiveFileName}`,
    archiveSha256: sha256(archiveBytes),
    archiveUtf8Bytes: archiveBytes.length,
    manifestSha256: manifestDigest,
    packagedFileCount: manifestRecords.length,
    responseIndexCount: 96,
    primaryJudgmentCount: 192,
    activeJ3JudgmentCount: 41,
    supersededJ3JudgmentCount: 23,
    modelInferenceUsed: false,
    providerApiCredentialsUsed: false,
    externalSpendUsd: 0,
  };
}
