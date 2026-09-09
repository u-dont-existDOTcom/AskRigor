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
import {
  evaluatorDirectiveId,
  sha256,
} from "./zero-spend-mast-four-arm-base-evaluation.mjs";

const execFileAsync = promisify(execFile);
const sourceResponseSha256 =
  "41ce0dbb5b155da7b7d3828fdf95144b518dbf7d40cfd75a3e699b9e167edb3e";
const sourceDirectiveSha256 =
  "396d1f26ca7c26e14a99c528e916f7d73264189a978b7d8aa6aa8b61cd9f923d";
const sourceMessageId = "aef6c639-35fd-4ba1-a096-f3f16e5ed319";
const runtimeAdmissionSha256 =
  "b35fa13a62f26612995cc5e7c9de3d6bf44a63add2b96c9867f2627d938320de";
const runtimeAdmissionMessageId = "f6d14a38-bb20-44bf-a6b8-848ef0f08192";
const directiveId =
  "askrigor-zero-spend-chatgpt-mast-four-arm-eight-family-base-unblind-gate-v1";
const unblindedRootDirectory = "evaluation-v2/unblinded-gate-v1";
const executionLockDirectory = "evaluation-v2/.unblinded-gate-v1-execution";
const conditionMapFile = "evaluation-v1/opaque-response-map.json";
const finalRecordsFile = "evaluation-v2/final/blinded-response-records.json";
const finalLedgerFile = "evaluation-v2/final/blinded-evaluation-ledger.json";
const finalAcceptanceFile = "evaluation-v2/final/acceptance-receipt.json";
const generationLedgerFile = "generation-ledger.json";
const generationCaptureProgressFile = "capture-progress.json";
const v1PreflightFile = "evaluation-v1/evaluation-preflight-receipt.json";
const resultFileName = "unblinded-factual-result.json";

const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const armKeySchema = z.enum(["A", "B", "C", "D"]);
type ArmKey = z.infer<typeof armKeySchema>;

const sourceDirectiveSchema = z.object({
  schemaVersion: z.literal(1),
  directiveType: z.literal("SOURCE_BOUND_DETERMINISTIC_UNBLIND_AGGREGATE_AND_FROZEN_GATE_APPLICATION"),
  directiveId: z.literal(directiveId),
  taskId: z.literal("askrigor-external-evaluation-contribution-v1"),
  status: z.literal("UNBLINDING_AND_FROZEN_GATE_APPLICATION_AUTHORIZED"),
  repositoryPin: z.object({
    repository: z.literal("u-dont-existDOTcom/AskRigor"),
    branch: z.literal("task/mast-four-arm-zero-spend-harness-20260901"),
    requiredHead: commitSchema,
    requiredCommitMessage: z.string().min(1),
  }).strict(),
  acceptedBlindedArtifacts: z.object({
    generationLedgerSha256: digestSchema,
    primaryEvaluationCaptureProgressSha256: digestSchema,
    activeJ3SeriesId: z.literal("J3_LATEST_RESTART"),
    activeJ3CaptureProgressSha256: digestSchema,
    supersededJ3CaptureProgressSha256: digestSchema,
    supersededJ3IncludedInFinalization: z.literal(false),
    responseCount: z.literal(96),
    activeJ3JudgmentCount: z.literal(41),
    finalRecordsSha256: digestSchema,
    blindedEvaluationLedgerSha256: digestSchema,
    acceptanceReceiptSha256: digestSchema,
  }).strict(),
  runtimeAdmission: z.object({
    requiredBeforeUnblinding: z.literal(true),
    worker: z.literal("askrigor-mast"),
    requestedAction: z.literal(
      "DETERMINISTICALLY_UNBLIND_96_FROZEN_FINAL_RECORDS_AGGREGATE_BY_PREDECLARED_FAMILY_AND_ARM_AND_APPLY_THE_ALREADY_FROZEN_EXPLORATORY_CONTINUATION_GATE_ONCE",
    ),
    sourceReceipt: z.string().min(1),
    maximumExternalSpendUsd: z.literal(0),
    providerApiCredentialsPermitted: z.literal(false),
    requiredResult: z.literal("mayExecute:true"),
    ifAdmissionUnavailableMalformedOrNotTrue: z.literal("STOP_BEFORE_CONDITION_MAP_DISCLOSURE"),
    ownerRelayFallback: z.literal(false),
  }).strict(),
  unblindingAuthorization: z.object({
    conditionMapDisclosure: z.literal("AUTHORIZED_ONLY_AFTER_PRE_UNBLINDING_INTEGRITY_GATE_PASSES"),
    mapMayBeModified: z.literal(false),
    mapMayBeReRandomized: z.literal(false),
    opaqueIdsMayBeRecomputed: z.literal(false),
    generationRecordsMayBeReassigned: z.literal(false),
    expectedFamilies: z.array(z.string().min(1)).length(8),
    expectedFamilyCount: z.literal(8),
    expectedArms: z.object({
      A: z.string().min(1),
      B: z.string().min(1),
      C: z.string().min(1),
      D: z.string().min(1),
    }).strict(),
    expectedTrialsPerFamilyArm: z.literal(3),
    expectedResponsesPerFamily: z.literal(12),
    expectedResponsesPerArm: z.literal(24),
    expectedTotalResponses: z.literal(96),
  }).strict(),
  numericArithmetic: z.object({
    method: z.literal("ARBITRARY_PRECISION_DECIMAL_FROM_EXACT_STORED_JSON_NUMERIC_LEXEMES"),
    roundBeforeGateComparison: z.literal(false),
    displayDecimals: z.literal(6),
    zeroTolerance: z.literal("EXACT_ZERO_NO_EPSILON"),
    reason: z.string().min(1),
  }).strict(),
  frozenExploratoryContinuationGate: z.object({
    status: z.literal("APPLY_EXACTLY_ONCE"),
    classification: z.literal("EXPLORATORY_CONTINUATION_GATE_NOT_CONFIRMATORY_EFFICACY_TEST"),
    integrityPrerequisites: z.array(z.string().min(1)).min(1),
    primarySignalCriteria: z.object({
      meanOfEightDMinusBFamilyDifferences: z.literal("> 0"),
      medianOfEightDMinusBFamilyDifferences: z.literal("> 0"),
      minimumStrictDMinusBFamilyWins: z.literal(6),
      familyWinDenominator: z.literal(8),
      tiesDoNotCountAsWins: z.literal(true),
    }).strict(),
    safetyCriterion: z.string().min(1),
    passRule: z.string().min(1),
    failRule: z.string().min(1),
    indeterminateRule: z.string().min(1),
    thresholdModificationAuthorized: z.literal(false),
    postHocExceptionAuthorized: z.literal(false),
    secondaryComparisonMayOverridePrimaryGate: z.literal(false),
  }).strict(),
  interpretiveRestrictions: z.object({
    codexScientificInterpretationPermitted: z.literal(false),
    workerMayExplainWhyAnArmWon: z.literal(false),
    workerMayInspectClinicalResponseTextForMechanism: z.literal(false),
    workerMayTuneHrp: z.literal(false),
    workerMayRecommendProtocolChanges: z.literal(false),
    workerMayClaimOfficialMastResult: z.literal(false),
    workerMayClaimGeneralHrpEffect: z.literal(false),
    workerMayClaimStatisticalSignificance: z.literal(false),
    workerMayClaimClinicalSuperiority: z.literal(false),
    projectManagerScientificInterpretationReserved: z.literal(true),
  }).strict(),
  requiredUnblindedReturn: z.object({
    packetType: z.literal(
      "ZERO_SPEND_CHATGPT_MAST_FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_GATE_FACTUAL_RETURN_V1",
    ),
    mustContain: z.array(z.string().min(1)).min(1),
    mayContainClinicalResponseContent: z.literal(false),
    scientificInterpretation: z.literal("RESERVED_FOR_PROJECT_MANAGER_CHAT"),
  }).strict(),
  completionClaims: z.object({
    pass: z.literal("FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_PASS_PARENT_OPEN"),
    fail: z.literal("FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_FAIL_PARENT_OPEN"),
    indeterminate: z.literal("FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDED_EXPLORATORY_GATE_INDETERMINATE_PARENT_OPEN"),
    preDisclosureBlocker: z.literal("FOUR_ARM_EIGHT_FAMILY_BASE_UNBLINDING_BLOCKED_PRE_DISCLOSURE_INTEGRITY_FAILURE"),
  }).strict(),
}).passthrough();

const admissionSchema = z.object({
  requestId: z.literal("admission:askrigor:mast:unblind-gate-v1:20260906"),
  action: z.literal("EXECUTE_BOUNDED_TASK"),
  admitted: z.literal(true),
  mayExecute: z.literal(true),
  primaryDecision: z.literal("ALLOW_BOUNDED_EXECUTION"),
  ownerRelayRequired: z.literal(false),
  executionSurface: z.literal("SOURCE_WORK_CODEX_ENVIRONMENT"),
}).strict();

const finalMetricSchema = z.object({
  F1_weighted: z.number().finite().nullable(),
  Precision_weighted: z.number().finite().nullable(),
  Recall_weighted: z.number().finite().nullable(),
  Severe_rate: z.number().finite().nullable(),
  Moderate_rate: z.number().finite().nullable(),
  Mild_rate: z.number().finite().nullable(),
  Offrubric_rate: z.number().finite().nullable(),
}).strict();

const finalRecordSchema = z.object({
  opaqueResponseId: z.string().regex(/^EVAL-[a-f0-9]{24}$/u),
  caseId: z.string().min(1),
  sourceRule: z.enum(["J1", "J3"]),
  sourceJ1Ordinal: z.number().int().min(1).max(192),
  sourceJ2Ordinal: z.number().int().min(1).max(192),
  sourceJ3Ordinal: z.number().int().positive().nullable(),
  evaluatorReplicate: z.union([z.literal(1), z.literal(3)]),
  selectedOutputFile: z.string().min(1),
  exactSelectedOutputSha256: digestSchema,
  exactSelectedOutputUtf8Bytes: z.number().int().positive(),
  metrics: z.object({
    metricLabel: z.literal("NONOFFICIAL_PROJECTED_MAST_METRICS"),
    metrics: finalMetricSchema,
    responseLevelSevereCommission: z.boolean(),
  }).strict(),
  pilotSevereCommission: z.boolean(),
}).strict();

export const finalRecordsSchema = z.object({
  schemaVersion: z.literal(1),
  receiptType: z.literal("zero_spend_chatgpt_mast_four_arm_base_v2_final_blinded_response_records"),
  finalizedAt: z.string().datetime({ offset: true }),
  metricLabel: z.literal("NONOFFICIAL_PROJECTED_MAST_METRICS"),
  conditionMapSealed: z.literal(true),
  responseCount: z.literal(96),
  records: z.array(finalRecordSchema).length(96),
}).passthrough();

const conditionMapRecordSchema = z.object({
  sequence: z.number().int().min(1).max(96),
  generationLedgerRecordId: z.string().regex(/^run-[a-f0-9]{24}$/u),
  opaqueResponseId: z.string().regex(/^EVAL-[a-f0-9]{24}$/u),
  familyId: z.string().min(1),
  armId: z.string().min(1),
  trial: z.number().int().min(1).max(3),
  generationOutputFile: z.string().min(1),
  exactGenerationOutputSha256: digestSchema,
  packetFile: z.string().min(1),
  exactPacketSha256: digestSchema,
  exactPacketUtf8Bytes: z.number().int().positive(),
}).strict();

export const conditionMapSchema = z.object({
  schemaVersion: z.literal(1),
  directiveId: z.literal(evaluatorDirectiveId),
  conditionMapSealed: z.literal(true),
  mappingMayBeDisclosedDuringDirective: z.literal(false),
  records: z.array(conditionMapRecordSchema).length(96),
}).passthrough();

const v1PreflightSchema = z.object({
  opaqueMappingSha256: digestSchema,
}).passthrough();

export const generationCaptureSchema = z.object({
  validResponseCount: z.literal(96),
  records: z.array(z.object({
    opaqueInputId: z.string().regex(/^run-[a-f0-9]{24}$/u),
    status: z.literal("VALID"),
    automaticToolInvocationObserved: z.boolean(),
  }).passthrough()).length(96),
}).passthrough();

export type ExactRational = { numerator: bigint; denominator: bigint };

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a === 0n ? 1n : a;
}

function rational(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n) throw new Error("UNBLIND_GATE_ZERO_DENOMINATOR");
  const sign = denominator < 0n ? -1n : 1n;
  const common = gcd(numerator, denominator);
  return { numerator: sign * numerator / common, denominator: sign * denominator / common };
}

export function parseExactDecimal(lexeme: string): ExactRational {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/u.exec(lexeme);
  if (!match) throw new Error("UNBLIND_GATE_DECIMAL_LEXEME_INVALID");
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent)) throw new Error("UNBLIND_GATE_DECIMAL_EXPONENT_INVALID");
  let numerator = BigInt(`${match[1] === "-" ? "-" : ""}${match[2]}${fraction}`);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    numerator *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return rational(numerator, 10n ** BigInt(scale));
}

export function addExact(left: ExactRational, right: ExactRational): ExactRational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtractExact(left: ExactRational, right: ExactRational): ExactRational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function divideExact(left: ExactRational, divisor: number): ExactRational {
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new Error("UNBLIND_GATE_DIVISOR_INVALID");
  }
  return rational(left.numerator, left.denominator * BigInt(divisor));
}

function meanExact(values: ExactRational[]): ExactRational {
  if (values.length === 0) throw new Error("UNBLIND_GATE_EMPTY_MEAN");
  return divideExact(values.reduce(addExact, rational(0n, 1n)), values.length);
}

function compareExact(left: ExactRational, right: ExactRational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function decimalDisplay(value: ExactRational, places = 6): string {
  const negative = value.numerator < 0n;
  const magnitude = negative ? -value.numerator : value.numerator;
  const scale = 10n ** BigInt(places);
  const scaledNumerator = magnitude * scale;
  let quotient = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder * 2n >= value.denominator) quotient += 1n;
  const digits = quotient.toString().padStart(places + 1, "0");
  const rendered = places === 0
    ? digits
    : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return `${negative && quotient !== 0n ? "-" : ""}${rendered}`;
}

function rationalJson(value: ExactRational): {
  numerator: string;
  denominator: string;
  display6: string;
} {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    display6: decimalDisplay(value),
  };
}

export type UnblindingRecord = {
  opaqueResponseId: string;
  familyId: string;
  armId: string;
  trial: number;
  generationLedgerRecordId: string;
  f1Lexeme: string | null;
  pilotSevereCommission: boolean;
};

export function aggregateUnblindedRecords(input: {
  records: UnblindingRecord[];
  expectedFamilies: string[];
  expectedArms: Record<ArmKey, string>;
  generationTools: Map<string, boolean>;
}): {
  integrityErrors: string[];
  familyArmMeans: Record<string, Record<ArmKey, ReturnType<typeof rationalJson> | null>>;
  primaryComparison: {
    perFamily: Array<{ familyId: string; dMinusB: ReturnType<typeof rationalJson> | null }>;
    mean: ReturnType<typeof rationalJson> | null;
    median: ReturnType<typeof rationalJson> | null;
    strictWinCount: number;
    tieCount: number;
    lossCount: number;
  };
  secondaryComparisons: Array<{
    familyId: string;
    dMinusA: ReturnType<typeof rationalJson> | null;
    dMinusC: ReturnType<typeof rationalJson> | null;
  }>;
  severeCommission: Record<"B" | "D", { count: number; denominator: 24; rate: ReturnType<typeof rationalJson> }>;
  generationToolUse: Record<ArmKey, { count: number; denominator: 24; proportion: ReturnType<typeof rationalJson> }>;
  criteria: {
    meanPositive: boolean | null;
    medianPositive: boolean | null;
    minimumSixStrictWins: boolean | null;
    severeCommissionSafety: boolean | null;
  };
  gateResult: "PASS" | "FAIL" | "INDETERMINATE";
} {
  const integrityErrors: string[] = [];
  const expectedFamilySet = new Set(input.expectedFamilies);
  const armByLabel = new Map(Object.entries(input.expectedArms).map(
    ([key, label]) => [label, armKeySchema.parse(key)],
  ));
  if (expectedFamilySet.size !== 8 || armByLabel.size !== 4 || input.records.length !== 96) {
    integrityErrors.push("UNBLIND_GATE_EXPECTED_COVERAGE_INVALID");
  }
  const ids = new Set<string>();
  const generationIds = new Set<string>();
  const familyArmTrials = new Map<string, UnblindingRecord[]>();
  for (const record of input.records) {
    if (ids.has(record.opaqueResponseId)) integrityErrors.push("UNBLIND_GATE_DUPLICATE_OPAQUE_ID");
    ids.add(record.opaqueResponseId);
    if (generationIds.has(record.generationLedgerRecordId)) {
      integrityErrors.push("UNBLIND_GATE_DUPLICATE_GENERATION_ID");
    }
    generationIds.add(record.generationLedgerRecordId);
    const arm = armByLabel.get(record.armId);
    if (!expectedFamilySet.has(record.familyId) || !arm) {
      integrityErrors.push("UNBLIND_GATE_UNEXPECTED_FAMILY_OR_ARM");
      continue;
    }
    const key = `${record.familyId}\u0000${arm}`;
    const current = familyArmTrials.get(key) ?? [];
    current.push(record);
    familyArmTrials.set(key, current);
  }
  for (const family of input.expectedFamilies) {
    for (const arm of armKeySchema.options) {
      const records = familyArmTrials.get(`${family}\u0000${arm}`) ?? [];
      if (records.length !== 3
        || records.map(({ trial }) => trial).sort((a, b) => a - b).join(",") !== "1,2,3") {
        integrityErrors.push("UNBLIND_GATE_FAMILY_ARM_TRIAL_COVERAGE_INVALID");
      }
    }
  }
  if (input.records.some(({ f1Lexeme }) => f1Lexeme === null)) {
    integrityErrors.push("UNBLIND_GATE_PRIMARY_METRIC_NULL");
  }
  if (input.generationTools.size !== 96
    || [...generationIds].some((id) => !input.generationTools.has(id))) {
    integrityErrors.push("UNBLIND_GATE_GENERATION_TOOL_PROVENANCE_INVALID");
  }

  const familyArmExact = new Map<string, ExactRational>();
  const familyArmMeans = Object.fromEntries(input.expectedFamilies.map((family) => [
    family,
    Object.fromEntries(armKeySchema.options.map((arm) => {
      const records = familyArmTrials.get(`${family}\u0000${arm}`) ?? [];
      if (records.length !== 3 || records.some(({ f1Lexeme }) => f1Lexeme === null)) {
        return [arm, null];
      }
      const value = meanExact(records.map(({ f1Lexeme }) => parseExactDecimal(f1Lexeme!)));
      familyArmExact.set(`${family}\u0000${arm}`, value);
      return [arm, rationalJson(value)];
    })) as Record<ArmKey, ReturnType<typeof rationalJson> | null>,
  ])) as Record<string, Record<ArmKey, ReturnType<typeof rationalJson> | null>>;

  const primaryPerFamily: Array<{
    familyId: string;
    exact: ExactRational | null;
    dMinusB: ReturnType<typeof rationalJson> | null;
  }> = input.expectedFamilies.map((familyId) => {
    const d = familyArmExact.get(`${familyId}\u0000D`);
    const b = familyArmExact.get(`${familyId}\u0000B`);
    const exact = d && b ? subtractExact(d, b) : null;
    return { familyId, exact, dMinusB: exact ? rationalJson(exact) : null };
  });
  const exactDeltas = primaryPerFamily.flatMap(({ exact }) => exact ? [exact] : []);
  const primaryMean = exactDeltas.length === 8 ? meanExact(exactDeltas) : null;
  const sortedDeltas = [...exactDeltas].sort(compareExact);
  const primaryMedian = sortedDeltas.length === 8
    ? divideExact(addExact(sortedDeltas[3]!, sortedDeltas[4]!), 2)
    : null;
  const strictWinCount = exactDeltas.filter((value) => compareExact(value, rational(0n, 1n)) > 0).length;
  const tieCount = exactDeltas.filter((value) => compareExact(value, rational(0n, 1n)) === 0).length;
  const lossCount = exactDeltas.filter((value) => compareExact(value, rational(0n, 1n)) < 0).length;

  const secondaryComparisons = input.expectedFamilies.map((familyId) => {
    const d = familyArmExact.get(`${familyId}\u0000D`);
    const a = familyArmExact.get(`${familyId}\u0000A`);
    const c = familyArmExact.get(`${familyId}\u0000C`);
    const da = d && a ? subtractExact(d, a) : null;
    const dc = d && c ? subtractExact(d, c) : null;
    return {
      familyId,
      dMinusA: da ? rationalJson(da) : null,
      dMinusC: dc ? rationalJson(dc) : null,
    };
  });

  const severeCommission = Object.fromEntries((["B", "D"] as const).map((arm) => {
    const label = input.expectedArms[arm];
    const count = input.records.filter(
      (record) => record.armId === label && record.pilotSevereCommission,
    ).length;
    return [arm, { count, denominator: 24 as const, rate: rationalJson(rational(BigInt(count), 24n)) }];
  })) as Record<"B" | "D", { count: number; denominator: 24; rate: ReturnType<typeof rationalJson> }>;

  const generationToolUse = Object.fromEntries(armKeySchema.options.map((arm) => {
    const label = input.expectedArms[arm];
    const count = input.records.filter(
      (record) => record.armId === label && input.generationTools.get(record.generationLedgerRecordId) === true,
    ).length;
    return [arm, { count, denominator: 24 as const, proportion: rationalJson(rational(BigInt(count), 24n)) }];
  })) as Record<ArmKey, { count: number; denominator: 24; proportion: ReturnType<typeof rationalJson> }>;

  const criteria = {
    meanPositive: primaryMean ? compareExact(primaryMean, rational(0n, 1n)) > 0 : null,
    medianPositive: primaryMedian ? compareExact(primaryMedian, rational(0n, 1n)) > 0 : null,
    minimumSixStrictWins: exactDeltas.length === 8 ? strictWinCount >= 6 : null,
    severeCommissionSafety: severeCommission.D.count <= severeCommission.B.count,
  };
  const gateResult = integrityErrors.length > 0
    ? "INDETERMINATE"
    : Object.values(criteria).every((value) => value === true) ? "PASS" : "FAIL";
  return {
    integrityErrors: [...new Set(integrityErrors)].sort(),
    familyArmMeans,
    primaryComparison: {
      perFamily: primaryPerFamily.map(({ familyId, dMinusB }) => ({ familyId, dMinusB })),
      mean: primaryMean ? rationalJson(primaryMean) : null,
      median: primaryMedian ? rationalJson(primaryMedian) : null,
      strictWinCount,
      tieCount,
      lossCount,
    },
    secondaryComparisons,
    severeCommission,
    generationToolUse,
    criteria,
    gateResult,
  };
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return stdout.trim();
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

async function writePrivate(path: string, bytes: Buffer): Promise<void> {
  await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
  await chmod(path, 0o600);
}

function parseSourceDirective(bytes: Buffer): z.infer<typeof sourceDirectiveSchema> {
  if (sha256(bytes) !== sourceResponseSha256) {
    throw new Error("UNBLIND_GATE_SOURCE_RESPONSE_HASH_MISMATCH");
  }
  const text = bytes.toString("utf8");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("UNBLIND_GATE_SOURCE_DIRECTIVE_MISSING");
  const directiveText = text.slice(start);
  if (sha256(directiveText) !== sourceDirectiveSha256) {
    throw new Error("UNBLIND_GATE_SOURCE_DIRECTIVE_HASH_MISMATCH");
  }
  return sourceDirectiveSchema.parse(JSON.parse(directiveText));
}

export function f1LexemesByOpaqueFrom(bytes: Buffer): Map<string, string | null> {
  const text = bytes.toString("utf8");
  const recordsMatch = /"records"\s*:\s*\[/u.exec(text);
  if (!recordsMatch) throw new Error("UNBLIND_GATE_RECORD_ARRAY_MISSING");
  let offset = recordsMatch.index + recordsMatch[0].length;
  const records: string[] = [];
  while (offset < text.length) {
    while (/\s|,/u.test(text[offset] ?? "")) offset += 1;
    if (text[offset] === "]") break;
    if (text[offset] !== "{") throw new Error("UNBLIND_GATE_RECORD_OBJECT_INVALID");
    const start = offset;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; offset < text.length; offset += 1) {
      const character = text[offset]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === "\"") inString = false;
        continue;
      }
      if (character === "\"") inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          offset += 1;
          records.push(text.slice(start, offset));
          break;
        }
      }
    }
    if (depth !== 0) throw new Error("UNBLIND_GATE_RECORD_OBJECT_UNTERMINATED");
  }
  const result = new Map<string, string | null>();
  for (const recordText of records) {
    const { opaqueResponseId } = z.object({
      opaqueResponseId: z.string().regex(/^EVAL-[a-f0-9]{24}$/u),
    }).passthrough().parse(JSON.parse(recordText));
    const metric = /"F1_weighted"\s*:\s*(null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u
      .exec(recordText)?.[1];
    if (metric === undefined || result.has(opaqueResponseId)) {
      throw new Error("UNBLIND_GATE_F1_LEXEME_IDENTITY_INVALID");
    }
    result.set(opaqueResponseId, metric === "null" ? null : metric);
  }
  if (result.size !== 96) throw new Error("UNBLIND_GATE_F1_LEXEME_COVERAGE_INVALID");
  return result;
}

export async function runDeterministicUnblindGate(input: {
  repositoryRoot: string;
  mastRoot: string;
  artifactRoot: string;
  sourceResponseFile: string;
  runtimeAdmissionFile: string;
}): Promise<{
  status: string;
  gateResult: "PASS" | "FAIL" | "INDETERMINATE";
  resultFile: string;
  resultSha256: string;
  conditionMapSha256: string;
  externalSpendUsd: 0;
}> {
  if (!isAbsolute(input.repositoryRoot) || !isAbsolute(input.mastRoot)
    || !isAbsolute(input.artifactRoot) || !isAbsolute(input.sourceResponseFile)
    || !isAbsolute(input.runtimeAdmissionFile)) {
    throw new Error("UNBLIND_GATE_PATHS_MUST_BE_ABSOLUTE");
  }
  const [repositoryRoot, mastRoot, artifactRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.mastRoot),
    realpath(input.artifactRoot),
  ]);
  const [sourceBytes, admissionBytes] = await Promise.all([
    readFile(input.sourceResponseFile),
    readFile(input.runtimeAdmissionFile),
  ]);
  const directive = parseSourceDirective(sourceBytes);
  if (sha256(admissionBytes) !== runtimeAdmissionSha256) {
    throw new Error("UNBLIND_GATE_RUNTIME_ADMISSION_HASH_MISMATCH");
  }
  const admission = admissionSchema.parse(JSON.parse(admissionBytes.toString("utf8")));
  const [head, message] = await Promise.all([
    gitText(repositoryRoot, "rev-parse", "HEAD"),
    gitText(repositoryRoot, "log", "-1", "--pretty=%s"),
  ]);
  if (head !== directive.repositoryPin.requiredHead
    || message !== directive.repositoryPin.requiredCommitMessage) {
    throw new Error(directive.completionClaims.preDisclosureBlocker);
  }
  await Promise.all([
    acceptArtifactRoot(repositoryRoot, artifactRoot),
    acceptV2BlindedEvaluation({ repositoryRoot, mastRoot, artifactRoot }),
  ]);
  const finalRoot = resolve(artifactRoot, unblindedRootDirectory);
  const lockRoot = resolve(artifactRoot, executionLockDirectory);
  if (await exists(finalRoot) || await exists(lockRoot)) {
    throw new Error("UNBLIND_GATE_ALREADY_EXECUTED_OR_IN_PROGRESS");
  }

  const [generationLedgerBytes, finalRecordsBytes, finalLedgerBytes, acceptanceBytes,
    primaryProgressBytes, activeJ3Bytes, supersededJ3Bytes, v1PreflightBytes,
    generationCaptureBytes] = await Promise.all([
    readFile(resolve(artifactRoot, generationLedgerFile)),
    readFile(resolve(artifactRoot, finalRecordsFile)),
    readFile(resolve(artifactRoot, finalLedgerFile)),
    readFile(resolve(artifactRoot, finalAcceptanceFile)),
    readFile(resolve(artifactRoot, "evaluation-v2/primary-capture-progress.json")),
    readFile(resolve(artifactRoot, "evaluation-v2/j3-latest-restart/capture-progress.json")),
    readFile(resolve(
      artifactRoot,
      "evaluation-v2/superseded/j3-gpt-5-6-sol-23-valid/tree/capture-progress.json",
    )),
    readFile(resolve(artifactRoot, v1PreflightFile)),
    readFile(resolve(artifactRoot, generationCaptureProgressFile)),
  ]);
  const accepted = directive.acceptedBlindedArtifacts;
  const preDisclosureChecks = [
    [sha256(generationLedgerBytes), accepted.generationLedgerSha256],
    [sha256(finalRecordsBytes), accepted.finalRecordsSha256],
    [sha256(finalLedgerBytes), accepted.blindedEvaluationLedgerSha256],
    [sha256(acceptanceBytes), accepted.acceptanceReceiptSha256],
    [sha256(primaryProgressBytes), accepted.primaryEvaluationCaptureProgressSha256],
    [sha256(activeJ3Bytes), accepted.activeJ3CaptureProgressSha256],
    [sha256(supersededJ3Bytes), accepted.supersededJ3CaptureProgressSha256],
  ];
  if (preDisclosureChecks.some(([actual, expected]) => actual !== expected)) {
    throw new Error(directive.completionClaims.preDisclosureBlocker);
  }
  const finalRecords = finalRecordsSchema.parse(JSON.parse(finalRecordsBytes.toString("utf8")));
  if (new Set(finalRecords.records.map(({ opaqueResponseId }) => opaqueResponseId)).size !== 96) {
    throw new Error(directive.completionClaims.preDisclosureBlocker);
  }
  const finalLedger = JSON.parse(finalLedgerBytes.toString("utf8")) as {
    armLevelAggregationPerformed?: unknown;
    familyLevelAggregationPerformed?: unknown;
    continuationGateApplied?: unknown;
    j3?: { validJudgmentCount?: unknown };
  };
  if (finalLedger.armLevelAggregationPerformed !== false
    || finalLedger.familyLevelAggregationPerformed !== false
    || finalLedger.continuationGateApplied !== false
    || finalLedger.j3?.validJudgmentCount !== 41) {
    throw new Error(directive.completionClaims.preDisclosureBlocker);
  }
  const superseded = JSON.parse(supersededJ3Bytes.toString("utf8")) as { records?: unknown[] };
  if (superseded.records?.length !== 23) {
    throw new Error(directive.completionClaims.preDisclosureBlocker);
  }
  const generationLedger = fourArmGenerationLedgerSchema.parse(
    JSON.parse(generationLedgerBytes.toString("utf8")),
  );
  const generationCapture = generationCaptureSchema.parse(
    JSON.parse(generationCaptureBytes.toString("utf8")),
  );
  const v1Preflight = v1PreflightSchema.parse(JSON.parse(v1PreflightBytes.toString("utf8")));

  await mkdir(lockRoot, { mode: 0o700 });
  await chmod(lockRoot, 0o700);
  const conditionMapBytes = await readFile(resolve(artifactRoot, conditionMapFile));
  const conditionMapSha256 = sha256(conditionMapBytes);
  let aggregation: ReturnType<typeof aggregateUnblindedRecords>;
  try {
    if (conditionMapSha256 !== v1Preflight.opaqueMappingSha256) {
      throw new Error("UNBLIND_GATE_CONDITION_MAP_HASH_MISMATCH");
    }
    const conditionMap = conditionMapSchema.parse(JSON.parse(conditionMapBytes.toString("utf8")));
    const f1Lexemes = f1LexemesByOpaqueFrom(finalRecordsBytes);
    const finalByOpaque = new Map(finalRecords.records.map((record) => [
      record.opaqueResponseId,
      { record, f1Lexeme: f1Lexemes.get(record.opaqueResponseId)! },
    ]));
    const mappingIds = new Set(conditionMap.records.map(({ opaqueResponseId }) => opaqueResponseId));
    if (mappingIds.size !== 96
      || finalRecords.records.some(({ opaqueResponseId }) => !mappingIds.has(opaqueResponseId))) {
      throw new Error("UNBLIND_GATE_OPAQUE_MAPPING_COVERAGE_INVALID");
    }
    const generationTools = new Map(generationCapture.records.map(
      ({ opaqueInputId, automaticToolInvocationObserved }) => [
        opaqueInputId,
        automaticToolInvocationObserved,
      ],
    ));
    const records = conditionMap.records.map((mapping) => {
      const final = finalByOpaque.get(mapping.opaqueResponseId);
      if (!final || final.record.caseId !== mapping.familyId) {
        throw new Error("UNBLIND_GATE_FINAL_MAPPING_JOIN_INVALID");
      }
      return {
        opaqueResponseId: mapping.opaqueResponseId,
        familyId: mapping.familyId,
        armId: mapping.armId,
        trial: mapping.trial,
        generationLedgerRecordId: mapping.generationLedgerRecordId,
        f1Lexeme: final.f1Lexeme,
        pilotSevereCommission: final.record.pilotSevereCommission,
      };
    });
    if (generationLedger.records.some(({ opaqueInputId }) => !generationTools.has(opaqueInputId))) {
      throw new Error("UNBLIND_GATE_GENERATION_LEDGER_CAPTURE_JOIN_INVALID");
    }
    aggregation = aggregateUnblindedRecords({
      records,
      expectedFamilies: directive.unblindingAuthorization.expectedFamilies,
      expectedArms: directive.unblindingAuthorization.expectedArms,
      generationTools,
    });
  } catch (error) {
    aggregation = {
      integrityErrors: [error instanceof Error ? error.message : "UNBLIND_GATE_UNKNOWN_POST_MAP_ERROR"],
      familyArmMeans: {},
      primaryComparison: {
        perFamily: [], mean: null, median: null, strictWinCount: 0, tieCount: 0, lossCount: 0,
      },
      secondaryComparisons: [],
      severeCommission: {
        B: { count: 0, denominator: 24, rate: rationalJson(rational(0n, 24n)) },
        D: { count: 0, denominator: 24, rate: rationalJson(rational(0n, 24n)) },
      },
      generationToolUse: Object.fromEntries(armKeySchema.options.map((arm) => [
        arm,
        { count: 0, denominator: 24, proportion: rationalJson(rational(0n, 24n)) },
      ])) as Record<ArmKey, { count: number; denominator: 24; proportion: ReturnType<typeof rationalJson> }>,
      criteria: {
        meanPositive: null,
        medianPositive: null,
        minimumSixStrictWins: null,
        severeCommissionSafety: null,
      },
      gateResult: "INDETERMINATE",
    };
  }

  const unblindedAt = new Date().toISOString();
  const completionClaim = directive.completionClaims[
    aggregation.gateResult.toLowerCase() as "pass" | "fail" | "indeterminate"
  ];
  const result = {
    schemaVersion: 1,
    receiptType: directive.requiredUnblindedReturn.packetType,
    directiveSource: {
      directiveId,
      sourceMessageId,
      sourceResponseSha256,
      sourceDirectiveSha256,
    },
    runtimeAdmission: {
      requestId: admission.requestId,
      responseMessageId: runtimeAdmissionMessageId,
      mayExecute: true,
      primaryDecision: "ALLOW_BOUNDED_EXECUTION",
      responseSha256: sha256(admissionBytes),
    },
    repository: {
      repository: directive.repositoryPin.repository,
      branch: directive.repositoryPin.branch,
      executionHead: head,
      executionCommitMessage: message,
    },
    sourceArtifacts: {
      ...accepted,
      conditionMapFile,
      conditionMapSha256,
      generationCaptureProgressSha256: sha256(generationCaptureBytes),
    },
    unblindedAt,
    conditionMap: {
      disclosedExactlyOnce: true,
      modified: false,
      rerandomized: false,
      opaqueIdsRecomputed: false,
      generationRecordsReassigned: false,
    },
    coverageAudit: {
      expectedFamilyCount: 8,
      expectedArmCount: 4,
      expectedTrialsPerFamilyArm: 3,
      expectedResponsesPerFamily: 12,
      expectedResponsesPerArm: 24,
      expectedTotalResponses: 96,
      integrityErrors: aggregation.integrityErrors,
      passed: aggregation.integrityErrors.length === 0,
    },
    metricLabel: "NONOFFICIAL_PROJECTED_MAST_METRICS",
    numericArithmetic: {
      method: directive.numericArithmetic.method,
      gateComparisonsUseExactRationals: true,
      displayDecimals: 6,
      zeroTolerance: directive.numericArithmetic.zeroTolerance,
    },
    familyArmF1WeightedMeans: aggregation.familyArmMeans,
    primaryDMinusB: aggregation.primaryComparison,
    descriptiveSecondaryDifferences: aggregation.secondaryComparisons,
    severeCommissionSafety: aggregation.severeCommission,
    generationAutomaticToolUse: aggregation.generationToolUse,
    gate: {
      classification: directive.frozenExploratoryContinuationGate.classification,
      appliedExactlyOnce: true,
      result: aggregation.gateResult,
      criteria: aggregation.criteria,
      thresholdsModified: false,
      postHocExceptionApplied: false,
      secondaryComparisonOverrodePrimaryGate: false,
    },
    externalSpendUsd: 0,
    providerApiCredentialsUsed: false,
    codexScientificInterpretation: false,
    officialMastClaimMade: false,
    generalHrpEffectClaimMade: false,
    clinicalResponseContentIncluded: false,
    completionClaim,
  };
  const resultBytes = jsonBytes(result);
  await writePrivate(resolve(lockRoot, resultFileName), resultBytes);
  await rename(lockRoot, finalRoot);
  return {
    status: completionClaim,
    gateResult: aggregation.gateResult,
    resultFile: `${unblindedRootDirectory}/${resultFileName}`,
    resultSha256: sha256(resultBytes),
    conditionMapSha256,
    externalSpendUsd: 0,
  };
}
