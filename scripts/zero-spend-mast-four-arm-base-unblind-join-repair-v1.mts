import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import {
  acceptArtifactRoot,
  fourArmGenerationLedgerSchema,
} from "./accept-zero-spend-mast-four-arm-base-generation.mjs";
import {
  acceptV2BlindedEvaluation,
} from "./zero-spend-mast-four-arm-base-finalization-v2.mjs";
import { sha256 } from "./zero-spend-mast-four-arm-base-evaluation.mjs";
import {
  aggregateUnblindedRecords,
  conditionMapSchema,
  f1LexemesByOpaqueFrom,
  finalRecordsSchema,
  generationCaptureSchema,
} from "./zero-spend-mast-four-arm-base-unblind-gate-v1.mjs";

const execFileAsync = promisify(execFile);
const sourceResponseSha256 =
  "2fc66c5353842e33b26737fefab4780d3f741ab7f52b81b033c9f0d1dd728bca";
const sourceDirectiveSha256 =
  "9f9e94ce2dc4b94e914f665c8bbbc57fae490a90cefdf0e3306a2dcafb22921e";
const sourceMessageId = "0dbaee95-7045-4d99-9650-cd3fa638890f";
const runtimeAdmissionSha256 =
  "94e86861a5ecfd706d06fd0b41392a6f3a39654c356d57ae21e5490029876df2";
const runtimeAdmissionMessageId = "02274d8f-dd84-45e1-b239-d37dba74cd47";
const directiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-unblind-join-repair-v1";
const priorResultSha256 =
  "0f317577dc966237c69c04df852e12da84ae4a83973fa31237778b9177d89444";
const priorResultFile = "evaluation-v2/unblinded-gate-v1/unblinded-factual-result.json";
const repairRootDirectory = "evaluation-v2/unblinded-gate-v1-repair";
const repairLockDirectory = "evaluation-v2/.unblinded-gate-v1-repair-execution";
const resultFileName = "unblinded-gate-repair-factual-result.json";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const armSchema = z.enum(["A", "B", "C", "D"]);
type Arm = z.infer<typeof armSchema>;

const repairDirectiveSchema = z.object({
  schemaVersion: z.literal(1),
  directiveType: z.literal("SOURCE_BOUND_UNBLINDING_JOIN_REPAIR_AND_GATE_RESOLUTION"),
  directiveId: z.literal(directiveId),
  parentDirectiveId: z.literal(
    "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-unblind-gate-v1",
  ),
  status: z.literal("MECHANICAL_JOIN_REPAIR_AUTHORIZED_NO_NEW_MODEL_INFERENCE"),
  immutableSourceArtifacts: z.object({
    generationLedgerSha256: digestSchema,
    finalRecordsSha256: digestSchema,
    blindedEvaluationLedgerSha256: digestSchema,
    acceptanceReceiptSha256: digestSchema,
    conditionMapSha256: digestSchema,
    generationCaptureProgressSha256: digestSchema,
    generationLedgerMayBeModified: z.literal(false),
    finalBlindedRecordsMayBeModified: z.literal(false),
    conditionMapMayBeModified: z.literal(false),
    conditionMapMayBeRegenerated: z.literal(false),
    conditionMapMayBeRerandomized: z.literal(false),
  }).strict(),
  repositoryBoundary: z.object({
    repository: z.literal("u-dont-existDOTcom/AskRigor"),
    branch: z.literal("task/mast-four-arm-zero-spend-harness-20260901"),
    baselineExecutionHead: commitSchema,
    repairMayAddCodeTestsAndAuditReceipts: z.literal(true),
    repairMayAlterSourceEvaluationData: z.literal(false),
  }).strict(),
  conditionMapState: z.object({
    alreadyDisclosed: z.literal(true),
    disclosedExactlyOnce: z.literal(true),
    resealingClaimAuthorized: z.literal(false),
    mappingInferenceFromResponseContent: z.literal(false),
    clinicalResponseInspectionDuringRepair: z.literal(false),
    scientificInterpretationDuringRepair: z.literal(false),
  }).strict(),
  armCanonicalization: z.object({
    sourceOfTruth: z.string().min(1),
    permittedAliases: z.object({
      A: z.array(z.string().min(1)).min(1),
      B: z.array(z.string().min(1)).min(1),
      C: z.array(z.string().min(1)).min(1),
      D: z.array(z.string().min(1)).min(1),
    }).strict(),
    rule: z.string().min(1),
    unknownArmValue: z.string().min(1),
  }).strict(),
  familyCanonicalization: z.object({
    allowedFamilies: z.array(z.string().min(1)).length(8),
    rule: z.string().min(1),
    unexpectedFamily: z.string().min(1),
  }).strict(),
  trialCanonicalization: z.object({
    allowedTrials: z.array(z.number().int()).length(3),
    rule: z.string().min(1),
    trialRenumberingAuthorized: z.literal(false),
  }).strict(),
  generationToolUseSanityCheck: z.object({
    requiredAfterJoin: z.array(z.string().min(1)).min(1),
    requiredBeforeGateRecalculation: z.literal(true),
    knownFrozenTotalAutomaticWebBehaviorCount: z.literal(74),
    knownFrozenTotalNoAutomaticWebBehaviorCount: z.literal(22),
    purpose: z.string().min(1),
    failureAction: z.string().min(1),
  }).strict(),
  runtimeAdmission: z.object({
    requiredBeforeRepairExecution: z.literal(true),
    worker: z.literal("askrigor-mast"),
    requestedAction: z.literal(
      "REPAIR_THE_DETERMINISTIC_UNBLINDING_METADATA_JOIN_USING_ONLY_IMMUTABLE_PERSISTED_IDENTIFIERS_AND_RESOLVE_THE_EXISTING_INDETERMINATE_GATE_WITH_UNCHANGED_THRESHOLDS",
    ),
    sourceReceipt: z.string().min(1),
    maximumExternalSpendUsd: z.literal(0),
    providerApiCredentialsPermitted: z.literal(false),
    requiredResult: z.literal("mayExecute:true"),
    ifNotExactlyTrue: z.string().min(1),
    ownerRelayFallback: z.literal(false),
  }).strict(),
  exactNextBoundedSlice: z.object({
    sliceId: z.literal("UNBLIND_JOIN_SCHEMA_RECONCILIATION_AND_GATE_RESOLUTION_V1"),
    steps: z.array(z.string().min(1)).min(1),
    modelInferenceRequired: z.literal(false),
    externalSpendUsd: z.literal(0),
    ownerRelayRequested: z.literal(false),
    stopAfter: z.literal("CORRECTED_FACTUAL_GATE_RESULT_OR_EXACT_UNRECOVERABLE_JOIN_BLOCKER"),
  }).strict(),
  requiredReturnPacket: z.object({
    packetType: z.literal(
      "ZERO_SPEND_CHATGPT_MAST_FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_GATE_REPAIR_FACTUAL_RETURN_V1",
    ),
    mustContain: z.array(z.string().min(1)).min(1),
  }).strict(),
  interpretationBoundary: z.object({
    workerScientificInterpretationAuthorized: z.literal(false),
    workerMayExplainArmMechanisms: z.literal(false),
    workerHrpTuningAuthorized: z.literal(false),
    officialMastClaimAuthorized: z.literal(false),
    generalHrpEffectClaimAuthorized: z.literal(false),
    projectManagerInterpretationReserved: z.literal(true),
  }).strict(),
  completionClaims: z.object({
    resolvedPass: z.literal(
      "FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_REPAIRED_PASS_PARENT_OPEN",
    ),
    resolvedFail: z.literal(
      "FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_REPAIRED_FAIL_PARENT_OPEN",
    ),
    stillIndeterminate: z.literal(
      "FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_REPAIRED_INDETERMINATE_PARENT_OPEN",
    ),
    unrecoverableIdentity: z.literal(
      "FOUR_ARM_EIGHT_FAMILY_BASE_UNBLIND_JOIN_IDENTITY_UNRECOVERABLE_PARENT_OPEN",
    ),
  }).strict(),
}).passthrough();

const admissionSchema = z.object({
  requestId: z.literal("admission:askrigor:mast:unblind-join-repair-v1:20260906"),
  action: z.literal("EXECUTE_BOUNDED_TASK"),
  admitted: z.literal(true),
  mayExecute: z.literal(true),
  primaryDecision: z.literal("ALLOW_BOUNDED_EXECUTION"),
  ownerRelayRequired: z.literal(false),
  executionSurface: z.literal("SOURCE_WORK_CODEX_ENVIRONMENT"),
}).strict();

type JsonObject = Record<string, unknown>;

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

async function writePrivate(path: string, bytes: Buffer): Promise<void> {
  await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  await chmod(path, 0o600);
}

function candidateStats(records: JsonObject[], fields: string[]): Record<string, {
  uniqueCount: number;
  nullCount: number;
  types: string[];
}> {
  return Object.fromEntries(fields.map((field) => {
    const values = records.map((record) => record[field]);
    return [field, {
      uniqueCount: new Set(values.map((value) => JSON.stringify(value))).size,
      nullCount: values.filter((value) => value === null || value === undefined).length,
      types: [...new Set(values.map((value) => value === null
        ? "null"
        : Array.isArray(value) ? "array" : typeof value))].sort(),
    }];
  }));
}

function schemaReceipt(name: string, root: JsonObject, records: JsonObject[], fields: string[]): {
  artifact: string;
  topLevelJsonShape: "object";
  topLevelFields: string[];
  recordCount: number;
  recordFields: string[];
  candidateIdentityStats: ReturnType<typeof candidateStats>;
  clinicalOrJudgmentProseIncluded: false;
} {
  return {
    artifact: name,
    topLevelJsonShape: "object",
    topLevelFields: Object.keys(root).sort(),
    recordCount: records.length,
    recordFields: records.length > 0 ? Object.keys(records[0]!).sort() : [],
    candidateIdentityStats: candidateStats(records, fields),
    clinicalOrJudgmentProseIncluded: false,
  };
}

export function canonicalArmMap(aliases: Record<Arm, string[]>): Map<string, Arm> {
  const result = new Map<string, Arm>();
  for (const arm of armSchema.options) {
    for (const alias of aliases[arm]) {
      if (result.has(alias)) throw new Error("UNBLIND_REPAIR_ARM_ALIAS_COLLISION");
      result.set(alias, arm);
    }
  }
  return result;
}

function completionClaim(
  directive: z.infer<typeof repairDirectiveSchema>,
  result: "PASS" | "FAIL" | "INDETERMINATE",
): string {
  if (result === "PASS") return directive.completionClaims.resolvedPass;
  if (result === "FAIL") return directive.completionClaims.resolvedFail;
  return directive.completionClaims.stillIndeterminate;
}

export async function runUnblindJoinRepair(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  sourceResponseFile: string;
  sourceDirectiveFile: string;
  runtimeAdmissionFile: string;
}): Promise<{
  status: string;
  resultFile: string;
  resultSha256: string;
  externalSpendUsd: 0;
}> {
  for (const path of Object.values(input)) {
    if (!isAbsolute(path)) throw new Error("UNBLIND_REPAIR_PATHS_MUST_BE_ABSOLUTE");
  }
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot), realpath(input.mastRoot), realpath(input.artifactRoot),
  ]);
  const [sourceResponseBytes, sourceDirectiveBytes, admissionBytes] = await Promise.all([
    readFile(input.sourceResponseFile),
    readFile(input.sourceDirectiveFile),
    readFile(input.runtimeAdmissionFile),
  ]);
  if (sha256(sourceResponseBytes) !== sourceResponseSha256
    || sha256(sourceDirectiveBytes) !== sourceDirectiveSha256) {
    throw new Error("UNBLIND_REPAIR_SOURCE_RECEIPT_HASH_MISMATCH");
  }
  const directive = repairDirectiveSchema.parse(JSON.parse(sourceDirectiveBytes.toString("utf8")));
  if (sha256(admissionBytes) !== runtimeAdmissionSha256) {
    throw new Error("UNBLIND_REPAIR_RUNTIME_ADMISSION_HASH_MISMATCH");
  }
  const admission = admissionSchema.parse(JSON.parse(admissionBytes.toString("utf8")));
  const [head, message] = await Promise.all([
    gitText(repositoryRoot, "rev-parse", "HEAD"),
    gitText(repositoryRoot, "log", "-1", "--pretty=%s"),
  ]);
  if (head !== directive.repositoryBoundary.baselineExecutionHead
    || message !== "Accept completed blinded MAST evaluation") {
    throw new Error("UNBLIND_REPAIR_REPOSITORY_PIN_MISMATCH");
  }
  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    acceptV2BlindedEvaluation({ repositoryRoot, mastRoot, artifactRoot }),
  ]);

  const repairRoot = resolve(artifactRoot, repairRootDirectory);
  const lockRoot = resolve(artifactRoot, repairLockDirectory);
  if (await exists(repairRoot) || await exists(lockRoot)) {
    throw new Error("UNBLIND_REPAIR_ALREADY_EXECUTED_OR_IN_PROGRESS");
  }
  const paths = {
    generationLedger: resolve(artifactRoot, "generation-ledger.json"),
    generationCapture: resolve(artifactRoot, "capture-progress.json"),
    conditionMap: resolve(artifactRoot, "evaluation-v1/opaque-response-map.json"),
    finalRecords: resolve(artifactRoot, "evaluation-v2/final/blinded-response-records.json"),
    finalLedger: resolve(artifactRoot, "evaluation-v2/final/blinded-evaluation-ledger.json"),
    acceptance: resolve(artifactRoot, "evaluation-v2/final/acceptance-receipt.json"),
    priorResult: resolve(artifactRoot, priorResultFile),
  };
  const [generationLedgerBytes, generationCaptureBytes, conditionMapBytes, finalRecordsBytes,
    finalLedgerBytes, acceptanceBytes, priorResultBytes] = await Promise.all([
    readFile(paths.generationLedger), readFile(paths.generationCapture),
    readFile(paths.conditionMap), readFile(paths.finalRecords), readFile(paths.finalLedger),
    readFile(paths.acceptance), readFile(paths.priorResult),
  ]);
  const immutable = directive.immutableSourceArtifacts;
  const immutableChecks: Array<[string, string]> = [
    [sha256(generationLedgerBytes), immutable.generationLedgerSha256],
    [sha256(generationCaptureBytes), immutable.generationCaptureProgressSha256],
    [sha256(conditionMapBytes), immutable.conditionMapSha256],
    [sha256(finalRecordsBytes), immutable.finalRecordsSha256],
    [sha256(finalLedgerBytes), immutable.blindedEvaluationLedgerSha256],
    [sha256(acceptanceBytes), immutable.acceptanceReceiptSha256],
    [sha256(priorResultBytes), priorResultSha256],
  ];
  if (immutableChecks.some(([actual, expected]) => actual !== expected)) {
    throw new Error("UNBLIND_REPAIR_IMMUTABLE_SOURCE_HASH_MISMATCH");
  }
  const priorResult = z.object({
    gate: z.object({ result: z.literal("INDETERMINATE") }).passthrough(),
    coverageAudit: z.object({ passed: z.literal(false) }).passthrough(),
  }).passthrough().parse(JSON.parse(priorResultBytes.toString("utf8")));
  void priorResult;

  const generationRoot = JSON.parse(generationLedgerBytes.toString("utf8")) as JsonObject;
  const captureRoot = JSON.parse(generationCaptureBytes.toString("utf8")) as JsonObject;
  const mapRoot = JSON.parse(conditionMapBytes.toString("utf8")) as JsonObject;
  const finalRoot = JSON.parse(finalRecordsBytes.toString("utf8")) as JsonObject;
  const generationLedger = fourArmGenerationLedgerSchema.parse(generationRoot);
  const generationCapture = generationCaptureSchema.parse(captureRoot);
  const conditionMap = conditionMapSchema.parse(mapRoot);
  const finalRecords = finalRecordsSchema.parse(finalRoot);
  const f1ByOpaque = f1LexemesByOpaqueFrom(finalRecordsBytes);
  const receipts = [
    schemaReceipt("generation-ledger", generationRoot, generationLedger.records as JsonObject[], [
      "opaqueInputId", "sequence", "exactOutputSha256",
    ]),
    schemaReceipt("generation-capture", captureRoot, generationCapture.records as JsonObject[], [
      "opaqueInputId", "sequence", "exactOutputSha256",
    ]),
    schemaReceipt("condition-map", mapRoot, conditionMap.records as JsonObject[], [
      "generationLedgerRecordId", "opaqueResponseId", "sequence", "exactGenerationOutputSha256",
      "familyId", "armId", "trial",
    ]),
    schemaReceipt("final-blinded-records", finalRoot, finalRecords.records as JsonObject[], [
      "opaqueResponseId", "exactSelectedOutputSha256", "caseId",
    ]),
  ];

  const errors: string[] = [];
  const aliases = canonicalArmMap(directive.armCanonicalization.permittedAliases);
  const allowedFamilies = new Set(directive.familyCanonicalization.allowedFamilies);
  const allowedTrials = new Set(directive.trialCanonicalization.allowedTrials);
  const generationById = new Map(generationLedger.records.map((record) => [
    record.opaqueInputId, record,
  ]));
  const captureById = new Map(generationCapture.records.map((record) => [
    record.opaqueInputId, record,
  ]));
  const finalByOpaque = new Map(finalRecords.records.map((record) => [
    record.opaqueResponseId, record,
  ]));
  if (generationById.size !== 96 || captureById.size !== 96 || finalByOpaque.size !== 96) {
    errors.push("UNBLIND_REPAIR_PRIMARY_IDENTITIES_NOT_UNIQUE");
  }
  const repairedRecords = conditionMap.records.flatMap((mapping) => {
    const generation = generationById.get(mapping.generationLedgerRecordId);
    const capture = captureById.get(mapping.generationLedgerRecordId);
    const final = finalByOpaque.get(mapping.opaqueResponseId);
    const arm = aliases.get(mapping.armId);
    if (!generation || !capture || !final) {
      errors.push("UNBLIND_REPAIR_EXPLICIT_IDENTIFIER_JOIN_MISSING");
      return [];
    }
    if (generation.exactOutputSha256 !== mapping.exactGenerationOutputSha256
      || generation.outputFile !== mapping.generationOutputFile
      || generation.sequence !== mapping.sequence
      || capture.exactOutputSha256 !== generation.exactOutputSha256
      || capture.automaticToolInvocationObserved !== generation.automaticToolInvocationObserved) {
      errors.push("UNBLIND_REPAIR_JOIN_CONSISTENCY_INVALID");
    }
    if (!arm) errors.push("UNBLIND_REPAIR_UNKNOWN_ARM_ALIAS");
    if (!allowedFamilies.has(mapping.familyId) || final.caseId !== mapping.familyId) {
      errors.push("UNBLIND_REPAIR_FAMILY_VALIDATION_INVALID");
    }
    if (!allowedTrials.has(mapping.trial)) errors.push("UNBLIND_REPAIR_TRIAL_INVALID");
    const f1Lexeme = f1ByOpaque.get(mapping.opaqueResponseId);
    if (f1Lexeme === undefined) errors.push("UNBLIND_REPAIR_F1_IDENTITY_MISSING");
    if (!arm || f1Lexeme === undefined) return [];
    return [{
      opaqueResponseId: mapping.opaqueResponseId,
      familyId: mapping.familyId,
      armId: arm,
      trial: mapping.trial,
      generationLedgerRecordId: mapping.generationLedgerRecordId,
      f1Lexeme,
      pilotSevereCommission: final.pilotSevereCommission,
    }];
  });
  const toolMap = new Map(generationLedger.records.map((record) => [
    record.opaqueInputId, record.automaticToolInvocationObserved,
  ]));
  const automaticCount = [...toolMap.values()].filter(Boolean).length;
  if (automaticCount !== directive.generationToolUseSanityCheck
    .knownFrozenTotalAutomaticWebBehaviorCount
    || toolMap.size - automaticCount !== directive.generationToolUseSanityCheck
      .knownFrozenTotalNoAutomaticWebBehaviorCount) {
    errors.push("UNBLIND_REPAIR_GENERATION_TOOL_TOTAL_MISMATCH");
  }
  const identityRecoverable = !errors.some((error) => error ===
    "UNBLIND_REPAIR_PRIMARY_IDENTITIES_NOT_UNIQUE"
    || error === "UNBLIND_REPAIR_EXPLICIT_IDENTIFIER_JOIN_MISSING");
  const aggregation = identityRecoverable
    ? aggregateUnblindedRecords({
      records: repairedRecords,
      expectedFamilies: directive.familyCanonicalization.allowedFamilies,
      expectedArms: { A: "A", B: "B", C: "C", D: "D" },
      generationTools: toolMap,
    })
    : null;
  const integrityErrors = [...new Set([
    ...errors,
    ...(aggregation?.integrityErrors ?? []),
  ])].sort();
  const gateResult = identityRecoverable && aggregation
    ? integrityErrors.length === 0 ? aggregation.gateResult : "INDETERMINATE"
    : "INDETERMINATE";
  const claim = identityRecoverable
    ? completionClaim(directive, gateResult)
    : directive.completionClaims.unrecoverableIdentity;
  const result = {
    schemaVersion: 1,
    packetType: directive.requiredReturnPacket.packetType,
    directiveSource: {
      directiveId,
      sourceMessageId,
      sourceResponseSha256,
      sourceDirectiveSha256,
    },
    runtimeAdmission: {
      requestId: admission.requestId,
      responseMessageId: runtimeAdmissionMessageId,
      responseSha256: runtimeAdmissionSha256,
      mayExecute: true,
      primaryDecision: admission.primaryDecision,
    },
    repository: {
      repository: directive.repositoryBoundary.repository,
      branch: directive.repositoryBoundary.branch,
      executionHead: head,
      executionCommitMessage: message,
    },
    priorResultDisposition: {
      priorResultFile,
      priorResultSha256,
      preserved: true,
      validForScientificPassFailInference: false,
    },
    immutableSourceArtifacts: {
      ...immutable,
      allHashesVerified: true,
      modified: false,
    },
    conditionMapState: {
      alreadyDisclosedBeforeRepair: true,
      disclosureCountIncrementedByRepair: false,
      resealedClaimMade: false,
      modified: false,
      regenerated: false,
      rerandomized: false,
    },
    rootCause: {
      code: "ARM_IDENTIFIER_ALIAS_CANONICALIZATION_OMITTED_V1",
      arrayPositionUsedAsCrossArtifactIdentity: false,
      clinicalResponseOrJudgmentProseInspected: false,
      schemaReceipts: receipts,
    },
    joinAudit: {
      conditionMapToFinalRecords: "opaqueResponseId",
      conditionMapToGenerationLedger: "generationLedgerRecordId=opaqueInputId",
      candidateMappingSelectedByExpectedBalance: false,
      familyArmTrialValuesUsedAsJoinKeys: false,
      responseTextMetricValueOrSimilarityUsedAsJoinKey: false,
      conditionMapRecordCount: conditionMap.records.length,
      finalRecordCount: finalRecords.records.length,
      generationRecordCount: generationLedger.records.length,
      joinedRecordCount: repairedRecords.length,
      canonicalArmCount: new Set(repairedRecords.map(({ armId }) => armId)).size,
      familyCount: new Set(repairedRecords.map(({ familyId }) => familyId)).size,
      trialCount: new Set(repairedRecords.map(({ trial }) => trial)).size,
      identityRecoverable,
    },
    generationToolUseSanityCheck: {
      automaticCount,
      nonAutomaticCount: toolMap.size - automaticCount,
      passed: !integrityErrors.includes("UNBLIND_REPAIR_GENERATION_TOOL_TOTAL_MISMATCH"),
    },
    coverageAudit: {
      passed: integrityErrors.length === 0,
      integrityErrors,
    },
    metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS",
    numericArithmetic: {
      method: "ARBITRARY_PRECISION_DECIMAL_FROM_EXACT_STORED_JSON_NUMERIC_LEXEMES",
      gateComparisonsUseExactRationals: true,
      roundBeforeComparison: false,
      zeroTolerance: "EXACT_ZERO_NO_EPSILON",
      displayDecimals: 6,
    },
    familyArmF1WeightedMeans: aggregation?.familyArmMeans ?? {},
    primaryDMinusB: aggregation?.primaryComparison ?? null,
    descriptiveSecondaryDifferences: aggregation?.secondaryComparisons ?? [],
    severeCommissionSafety: aggregation?.severeCommission ?? null,
    generationAutomaticToolUse: aggregation?.generationToolUse ?? null,
    gate: {
      classification: "EXPLORATORY_CONTINUATION_GATE_NOT_CONFIRMATORY_EFFICACY_TEST",
      recalculatedFromFrozenPerResponseInputs: identityRecoverable,
      thresholdsChanged: false,
      postHocExceptionApplied: false,
      secondaryComparisonOverrodePrimaryGate: false,
      result: gateResult,
      criteria: aggregation?.criteria ?? null,
    },
    acceptanceChecks: {
      sourceHashesVerified: true,
      priorArtifactPreserved: true,
      explicitIdentifierJoinUsed: true,
      opaqueJoinComplete: finalByOpaque.size === 96 && repairedRecords.length === 96,
      generationJoinComplete: generationById.size === 96 && repairedRecords.length === 96,
      canonicalArmAliasesApplied: !integrityErrors.includes("UNBLIND_REPAIR_UNKNOWN_ARM_ALIAS"),
      familyAllowlistApplied: !integrityErrors.includes("UNBLIND_REPAIR_FAMILY_VALIDATION_INVALID"),
      trialsPreserved: !integrityErrors.includes("UNBLIND_REPAIR_TRIAL_INVALID"),
      exactMetricLexemesJoinedByOpaqueId: f1ByOpaque.size === 96,
      generationToolTotalsVerified: automaticCount === 74 && toolMap.size - automaticCount === 22,
      responseCount: repairedRecords.length,
      familyCount: new Set(repairedRecords.map(({ familyId }) => familyId)).size,
      armCount: new Set(repairedRecords.map(({ armId }) => armId)).size,
      trialCount: new Set(repairedRecords.map(({ trial }) => trial)).size,
      thresholdsChanged: false,
      allPassed: integrityErrors.length === 0,
    },
    modelInferenceUsed: false,
    providerApiCredentialsUsed: false,
    externalSpendUsd: 0,
    clinicalResponseContentIncluded: false,
    scientificInterpretationIncluded: false,
    officialMastClaimMade: false,
    generalHrpEffectClaimMade: false,
    completionClaim: claim,
  };
  await mkdir(lockRoot, { mode: 0o700 });
  await chmod(lockRoot, 0o700);
  const resultBytes = jsonBytes(result);
  await writePrivate(resolve(lockRoot, resultFileName), resultBytes);
  if (sha256(await readFile(paths.priorResult)) !== priorResultSha256) {
    throw new Error("UNBLIND_REPAIR_PRIOR_RESULT_CHANGED_DURING_EXECUTION");
  }
  await rename(lockRoot, repairRoot);
  const info = await lstat(resolve(repairRoot, resultFileName));
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    throw new Error("UNBLIND_REPAIR_RESULT_MODE_INVALID");
  }
  return {
    status: claim,
    resultFile: `${repairRootDirectory}/${resultFileName}`,
    resultSha256: sha256(resultBytes),
    externalSpendUsd: 0,
  };
}
