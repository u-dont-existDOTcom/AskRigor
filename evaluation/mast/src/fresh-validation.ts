import { createHash } from "node:crypto";

export const FRESH_VALIDATION_ARMS = ["A", "B", "C", "D"] as const;
export type FreshValidationArm = typeof FRESH_VALIDATION_ARMS[number];
export type FreshValidationLane = "FRESH_VALIDATION" | "DEVELOPMENT_REGRESSION";

export interface FrozenSelectionInput {
  candidateFamilies: string[];
  seedInteger: number;
}

export interface DispatchRecord {
  sequence: number;
  opaqueInputId: string;
  lane: FreshValidationLane;
  familyId: string;
  armId: FreshValidationArm;
  trial: number;
}

export interface GenerationIdentityRecord {
  opaqueInputId: string;
  exactOutputSha256: string;
}

export interface ConditionMapRecord {
  generationLedgerRecordId: string;
  opaqueResponseId: string;
  exactGenerationOutputSha256: string;
  familyId: string;
  armId: string;
  trial: number;
}

export interface FinalBlindedScoreRecord {
  opaqueResponseId: string;
  exactSelectedOutputSha256: string;
  f1Lexeme: string | null;
  omissionCount: number | null;
  commissionCount: number | null;
  severeCommission: boolean | null;
  benchmarkTargetConflict: boolean;
}

export interface JoinedFreshScoreRecord {
  opaqueResponseId: string;
  generationLedgerRecordId: string;
  familyId: string;
  armId: FreshValidationArm;
  trial: number;
  f1Lexeme: string | null;
  omissionCount: number | null;
  commissionCount: number | null;
  severeCommission: boolean | null;
  benchmarkTargetConflict: boolean;
}

interface ExactRational {
  numerator: bigint;
  denominator: bigint;
}

export interface ExactRationalJson {
  numerator: string;
  denominator: string;
  display6: string;
}

const FAMILY_PATTERN = /^([A-Za-z]+)(\d{3})$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const OPAQUE_INPUT_PATTERN = /^run-[0-9a-f]{24}$/u;
const OPAQUE_RESPONSE_PATTERN = /^EVAL-[0-9a-f]{24}$/u;

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function digestSeeded(seed: Uint8Array, value: string): string {
  return createHash("sha256").update(seed).update("\0").update(value, "utf8").digest("hex");
}

function assertUnique(values: string[], errorCode: string): void {
  if (new Set(values).size !== values.length) throw new Error(errorCode);
}

function familyPrefix(id: string): string {
  const match = FAMILY_PATTERN.exec(id);
  if (!match) throw new Error(`FRESH_VALIDATION_INVALID_FAMILY_ID:${id}`);
  return match[1]!;
}

export function deriveIdentifierOnlySelection(input: FrozenSelectionInput): {
  freshFamilies: string[];
  reservedFamilies: string[];
  representativeIndex: number;
  supplementalStart: number;
  supplementalPrefixes: string[];
} {
  if (!Number.isSafeInteger(input.seedInteger) || input.seedInteger < 0) {
    throw new Error("FRESH_VALIDATION_SELECTION_SEED_INVALID");
  }
  const candidates = [...input.candidateFamilies].sort();
  assertUnique(candidates, "FRESH_VALIDATION_CANDIDATE_DUPLICATE");
  const groups = new Map<string, string[]>();
  for (const id of candidates) {
    const prefix = familyPrefix(id);
    const group = groups.get(prefix) ?? [];
    group.push(id);
    groups.set(prefix, group);
  }
  const prefixes = [...groups.keys()].sort();
  if (prefixes.length !== 10 || [...groups.values()].some((group) => group.length !== 2)) {
    throw new Error("FRESH_VALIDATION_SELECTION_GROUP_SHAPE_INVALID");
  }
  for (const group of groups.values()) group.sort();
  const representativeIndex = input.seedInteger % 2;
  const supplementalStart = Math.floor(input.seedInteger / 10) % prefixes.length;
  const fresh = new Set(prefixes.map((prefix) => groups.get(prefix)![representativeIndex]!));
  const supplementalPrefixes = [0, 1].map(
    (offset) => prefixes[(supplementalStart + offset) % prefixes.length]!,
  );
  for (const prefix of supplementalPrefixes) {
    fresh.add(groups.get(prefix)![1 - representativeIndex]!);
  }
  const freshFamilies = [...fresh].sort();
  const reservedFamilies = candidates.filter((id) => !fresh.has(id));
  if (freshFamilies.length !== 12 || reservedFamilies.length !== 8) {
    throw new Error("FRESH_VALIDATION_SELECTION_COUNTS_INVALID");
  }
  return {
    freshFamilies,
    reservedFamilies,
    representativeIndex,
    supplementalStart,
    supplementalPrefixes,
  };
}

export function createDispatchRecords(input: {
  privateSeed: Uint8Array;
  freshFamilies: string[];
  regressionFamilies: string[];
  trialsPerFamilyPerArm: number;
}): DispatchRecord[] {
  if (input.privateSeed.byteLength !== 32) throw new Error("FRESH_VALIDATION_DISPATCH_SEED_INVALID");
  if (input.trialsPerFamilyPerArm !== 3) throw new Error("FRESH_VALIDATION_TRIAL_COUNT_INVALID");
  assertUnique(input.freshFamilies, "FRESH_VALIDATION_FRESH_FAMILY_DUPLICATE");
  assertUnique(input.regressionFamilies, "FRESH_VALIDATION_REGRESSION_FAMILY_DUPLICATE");
  if (input.freshFamilies.some((id) => input.regressionFamilies.includes(id))) {
    throw new Error("FRESH_VALIDATION_LANE_OVERLAP");
  }
  const lanes: Array<{ lane: FreshValidationLane; families: string[] }> = [
    { lane: "FRESH_VALIDATION", families: input.freshFamilies },
    { lane: "DEVELOPMENT_REGRESSION", families: input.regressionFamilies },
  ];
  const all: DispatchRecord[] = [];
  for (const { lane, families } of lanes) {
    const slots = families.flatMap((familyId) => FRESH_VALIDATION_ARMS.flatMap((armId) =>
      Array.from({ length: input.trialsPerFamilyPerArm }, (_, offset) => ({
        lane,
        familyId,
        armId,
        trial: offset + 1,
      }))));
    slots.sort((left, right) => digestSeeded(
      input.privateSeed,
      `${left.lane}:${left.familyId}:${left.armId}:${left.trial}:order`,
    ).localeCompare(digestSeeded(
      input.privateSeed,
      `${right.lane}:${right.familyId}:${right.armId}:${right.trial}:order`,
    )));
    const laneRecords = slots.map((slot, index) => ({
      ...slot,
      sequence: index + 1,
      opaqueInputId: `run-${digestSeeded(
        input.privateSeed,
        `${slot.lane}:${slot.familyId}:${slot.armId}:${slot.trial}:identity`,
      ).slice(0, 24)}`,
    }));
    assertUnique(laneRecords.map(({ opaqueInputId }) => opaqueInputId),
      "FRESH_VALIDATION_OPAQUE_INPUT_COLLISION");
    all.push(...laneRecords);
  }
  return all;
}

export function canonicalArmMap(aliases: Record<FreshValidationArm, string[]>): Map<string, FreshValidationArm> {
  const result = new Map<string, FreshValidationArm>();
  for (const arm of FRESH_VALIDATION_ARMS) {
    const values = aliases[arm];
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("FRESH_VALIDATION_ARM_ALIAS_SET_EMPTY");
    }
    for (const alias of values) {
      if (result.has(alias)) throw new Error("FRESH_VALIDATION_ARM_ALIAS_COLLISION");
      result.set(alias, arm);
    }
  }
  return result;
}

function gcd(a: bigint, b: bigint): bigint {
  let left = a < 0n ? -a : a;
  let right = b < 0n ? -b : b;
  while (right !== 0n) [left, right] = [right, left % right];
  return left;
}

function rational(numerator: bigint, denominator: bigint): ExactRational {
  if (denominator === 0n) throw new Error("FRESH_VALIDATION_ZERO_DENOMINATOR");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: sign * denominator / divisor };
}

export function parseExactDecimal(value: string): ExactRational {
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/u.exec(value);
  if (!match) throw new Error(`FRESH_VALIDATION_DECIMAL_INVALID:${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2]!;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0") - fraction.length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) {
    throw new Error("FRESH_VALIDATION_DECIMAL_EXPONENT_INVALID");
  }
  const coefficient = sign * BigInt(`${whole}${fraction}`);
  return exponent >= 0
    ? rational(coefficient * (10n ** BigInt(exponent)), 1n)
    : rational(coefficient, 10n ** BigInt(-exponent));
}

function add(left: ExactRational, right: ExactRational): ExactRational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtract(left: ExactRational, right: ExactRational): ExactRational {
  return add(left, rational(-right.numerator, right.denominator));
}

function divide(value: ExactRational, divisor: number): ExactRational {
  return rational(value.numerator, value.denominator * BigInt(divisor));
}

function mean(values: ExactRational[]): ExactRational {
  if (values.length === 0) throw new Error("FRESH_VALIDATION_EMPTY_MEAN");
  return divide(values.reduce(add), values.length);
}

function compare(left: ExactRational, right: ExactRational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function display6(value: ExactRational): string {
  const negative = value.numerator < 0n;
  const absolute = negative ? -value.numerator : value.numerator;
  const scale = 1_000_000n;
  const quotient = (absolute * scale * 2n / value.denominator + 1n) / 2n;
  const whole = quotient / scale;
  const fraction = (quotient % scale).toString().padStart(6, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function rationalJson(value: ExactRational): ExactRationalJson {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    display6: display6(value),
  };
}

function validateScoreCount(value: number | null, name: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`FRESH_VALIDATION_${name}_INVALID`);
  }
}

export function joinFreshValidationRecords(input: {
  generation: GenerationIdentityRecord[];
  mapping: ConditionMapRecord[];
  final: FinalBlindedScoreRecord[];
  aliases: Record<FreshValidationArm, string[]>;
}): { records: JoinedFreshScoreRecord[]; integrityErrors: string[] } {
  const errors: string[] = [];
  const aliasMap = canonicalArmMap(input.aliases);
  const generation = new Map<string, GenerationIdentityRecord>();
  const final = new Map<string, FinalBlindedScoreRecord>();
  for (const record of input.generation) {
    if (!OPAQUE_INPUT_PATTERN.test(record.opaqueInputId) || !DIGEST_PATTERN.test(record.exactOutputSha256)) {
      errors.push("FRESH_VALIDATION_GENERATION_IDENTITY_INVALID");
    }
    if (generation.has(record.opaqueInputId)) errors.push("FRESH_VALIDATION_GENERATION_ID_DUPLICATE");
    generation.set(record.opaqueInputId, record);
  }
  for (const record of input.final) {
    if (!OPAQUE_RESPONSE_PATTERN.test(record.opaqueResponseId)
      || !DIGEST_PATTERN.test(record.exactSelectedOutputSha256)) {
      errors.push("FRESH_VALIDATION_FINAL_IDENTITY_INVALID");
    }
    validateScoreCount(record.omissionCount, "OMISSION_COUNT");
    validateScoreCount(record.commissionCount, "COMMISSION_COUNT");
    if (final.has(record.opaqueResponseId)) errors.push("FRESH_VALIDATION_FINAL_ID_DUPLICATE");
    final.set(record.opaqueResponseId, record);
  }
  assertUnique(input.mapping.map(({ generationLedgerRecordId }) => generationLedgerRecordId),
    "FRESH_VALIDATION_MAPPING_GENERATION_ID_DUPLICATE");
  assertUnique(input.mapping.map(({ opaqueResponseId }) => opaqueResponseId),
    "FRESH_VALIDATION_MAPPING_OPAQUE_ID_DUPLICATE");
  const records: JoinedFreshScoreRecord[] = [];
  for (const mapping of input.mapping) {
    const source = generation.get(mapping.generationLedgerRecordId);
    const score = final.get(mapping.opaqueResponseId);
    const arm = aliasMap.get(mapping.armId);
    if (!source || !score) {
      errors.push("FRESH_VALIDATION_EXPLICIT_ID_JOIN_MISSING");
      continue;
    }
    if (source.exactOutputSha256 !== mapping.exactGenerationOutputSha256
      || score.exactSelectedOutputSha256 !== mapping.exactGenerationOutputSha256) {
      errors.push("FRESH_VALIDATION_EXPLICIT_ID_HASH_MISMATCH");
    }
    if (!arm) {
      errors.push("FRESH_VALIDATION_UNKNOWN_ARM_ALIAS");
      continue;
    }
    records.push({
      opaqueResponseId: mapping.opaqueResponseId,
      generationLedgerRecordId: mapping.generationLedgerRecordId,
      familyId: mapping.familyId,
      armId: arm,
      trial: mapping.trial,
      f1Lexeme: score.f1Lexeme,
      omissionCount: score.omissionCount,
      commissionCount: score.commissionCount,
      severeCommission: score.severeCommission,
      benchmarkTargetConflict: score.benchmarkTargetConflict,
    });
  }
  if (generation.size !== input.mapping.length || final.size !== input.mapping.length
    || records.length !== input.mapping.length) {
    errors.push("FRESH_VALIDATION_EXPLICIT_ID_COVERAGE_INVALID");
  }
  return { records, integrityErrors: [...new Set(errors)].sort() };
}

function scoreTotals(records: JoinedFreshScoreRecord[], field: "omissionCount" | "commissionCount") {
  return Object.fromEntries(FRESH_VALIDATION_ARMS.map((arm) => {
    const values = records.filter((record) => record.armId === arm).map((record) => record[field]);
    const complete = values.length > 0 && values.every((value) => value !== null);
    const total = complete ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
    return [arm, { responseCount: values.length, total }];
  })) as Record<FreshValidationArm, { responseCount: number; total: number | null }>;
}

export function aggregateFreshValidation(input: {
  records: JoinedFreshScoreRecord[];
  expectedFamilies: string[];
}): {
  integrityErrors: string[];
  familyArmScores: Record<string, Record<FreshValidationArm, ExactRationalJson | null>>;
  primaryDMinusB: {
    perFamily: Array<{ familyId: string; delta: ExactRationalJson | null }>;
    mean: ExactRationalJson | null;
    median: ExactRationalJson | null;
    wins: number;
    ties: number;
    losses: number;
  };
  secondaryDMinusC: {
    perFamily: Array<{ familyId: string; delta: ExactRationalJson | null }>;
    mean: ExactRationalJson | null;
    median: ExactRationalJson | null;
    wins: number;
    ties: number;
    losses: number;
  };
  severeCommissions: {
    B: { count: number; denominator: number };
    D: { count: number; denominator: number };
    perFamilyDMinusB: Record<string, number>;
  };
  omissions: ReturnType<typeof scoreTotals>;
  commissions: ReturnType<typeof scoreTotals>;
  benchmarkTargetConflicts: { recordCount: number; opaqueResponseIds: string[] };
  criteria: Record<"P1" | "P2" | "P3" | "P4" | "P5", boolean | null>;
  interpretation: "PASS" | "FAIL" | "INDETERMINATE";
} {
  const errors: string[] = [];
  const families = input.expectedFamilies;
  if (families.length !== 12 || new Set(families).size !== 12 || input.records.length !== 144) {
    errors.push("FRESH_VALIDATION_EXPECTED_COVERAGE_INVALID");
  }
  const expected = new Set(families);
  assertUnique(input.records.map(({ opaqueResponseId }) => opaqueResponseId),
    "FRESH_VALIDATION_AGGREGATE_OPAQUE_ID_DUPLICATE");
  assertUnique(input.records.map(({ generationLedgerRecordId }) => generationLedgerRecordId),
    "FRESH_VALIDATION_AGGREGATE_GENERATION_ID_DUPLICATE");
  const grouped = new Map<string, JoinedFreshScoreRecord[]>();
  for (const record of input.records) {
    if (!expected.has(record.familyId) || !FRESH_VALIDATION_ARMS.includes(record.armId)) {
      errors.push("FRESH_VALIDATION_UNEXPECTED_FAMILY_OR_ARM");
      continue;
    }
    const key = `${record.familyId}\0${record.armId}`;
    const values = grouped.get(key) ?? [];
    values.push(record);
    grouped.set(key, values);
  }
  for (const family of families) {
    for (const arm of FRESH_VALIDATION_ARMS) {
      const values = grouped.get(`${family}\0${arm}`) ?? [];
      if (values.length !== 3
        || values.map(({ trial }) => trial).sort((a, b) => a - b).join(",") !== "1,2,3") {
        errors.push("FRESH_VALIDATION_FAMILY_ARM_TRIAL_COVERAGE_INVALID");
      }
    }
  }
  if (input.records.some((record) => record.f1Lexeme === null
    || record.omissionCount === null || record.commissionCount === null
    || record.severeCommission === null)) {
    errors.push("FRESH_VALIDATION_UNRESOLVED_SCORE");
  }
  const exactMeans = new Map<string, ExactRational>();
  const familyArmScores = Object.fromEntries(families.map((family) => [family,
    Object.fromEntries(FRESH_VALIDATION_ARMS.map((arm) => {
      const values = grouped.get(`${family}\0${arm}`) ?? [];
      if (values.length !== 3 || values.some(({ f1Lexeme }) => f1Lexeme === null)) return [arm, null];
      const exact = mean(values.map(({ f1Lexeme }) => parseExactDecimal(f1Lexeme!)));
      exactMeans.set(`${family}\0${arm}`, exact);
      return [arm, rationalJson(exact)];
    })) as Record<FreshValidationArm, ExactRationalJson | null>,
  ])) as Record<string, Record<FreshValidationArm, ExactRationalJson | null>>;

  const comparison = (other: "B" | "C") => {
    const values = families.map((familyId) => {
      const d = exactMeans.get(`${familyId}\0D`);
      const comparator = exactMeans.get(`${familyId}\0${other}`);
      const exact = d && comparator ? subtract(d, comparator) : null;
      return { familyId, exact, delta: exact ? rationalJson(exact) : null };
    });
    const complete = values.every(({ exact }) => exact !== null);
    const exact = complete ? values.map((value) => value.exact!) : [];
    const sorted = [...exact].sort(compare);
    const median = sorted.length === 12 ? divide(add(sorted[5]!, sorted[6]!), 2) : null;
    return {
      perFamily: values.map(({ familyId, delta }) => ({ familyId, delta })),
      mean: exact.length === 12 ? rationalJson(mean(exact)) : null,
      median: median ? rationalJson(median) : null,
      wins: exact.filter((value) => compare(value, rational(0n, 1n)) > 0).length,
      ties: exact.filter((value) => compare(value, rational(0n, 1n)) === 0).length,
      losses: exact.filter((value) => compare(value, rational(0n, 1n)) < 0).length,
      exactMean: exact.length === 12 ? mean(exact) : null,
      exactMedian: median,
    };
  };
  const db = comparison("B");
  const dc = comparison("C");
  const severeCount = (arm: "B" | "D") => input.records.filter(
    (record) => record.armId === arm && record.severeCommission === true,
  ).length;
  const perFamilyDMinusB = Object.fromEntries(families.map((family) => {
    const count = (arm: "B" | "D") => input.records.filter(
      (record) => record.familyId === family && record.armId === arm
        && record.severeCommission === true,
    ).length;
    return [family, count("D") - count("B")];
  }));
  const complete = errors.length === 0;
  const criteria = {
    P1: complete && db.exactMean ? compare(db.exactMean, rational(0n, 1n)) > 0 : null,
    P2: complete && db.exactMedian ? compare(db.exactMedian, rational(0n, 1n)) > 0 : null,
    P3: complete ? db.wins >= 7 : null,
    P4: complete ? severeCount("D") - severeCount("B") <= 1
      && Object.values(perFamilyDMinusB).every((difference) => difference <= 1) : null,
    P5: complete && dc.exactMean ? compare(dc.exactMean, rational(0n, 1n)) > 0
      && dc.wins >= dc.losses : null,
  };
  const failuresAmongP1P2P3P5 = ([criteria.P1, criteria.P2, criteria.P3, criteria.P5])
    .filter((value) => value === false).length;
  const interpretation = !complete ? "INDETERMINATE"
    : Object.values(criteria).every((value) => value === true) ? "PASS"
      : criteria.P4 === false || failuresAmongP1P2P3P5 >= 3 ? "FAIL"
        : "INDETERMINATE";
  return {
    integrityErrors: [...new Set(errors)].sort(),
    familyArmScores,
    primaryDMinusB: {
      perFamily: db.perFamily, mean: db.mean, median: db.median,
      wins: db.wins, ties: db.ties, losses: db.losses,
    },
    secondaryDMinusC: {
      perFamily: dc.perFamily, mean: dc.mean, median: dc.median,
      wins: dc.wins, ties: dc.ties, losses: dc.losses,
    },
    severeCommissions: {
      B: { count: severeCount("B"), denominator: 36 },
      D: { count: severeCount("D"), denominator: 36 },
      perFamilyDMinusB,
    },
    omissions: scoreTotals(input.records, "omissionCount"),
    commissions: scoreTotals(input.records, "commissionCount"),
    benchmarkTargetConflicts: {
      recordCount: input.records.filter(({ benchmarkTargetConflict }) => benchmarkTargetConflict).length,
      opaqueResponseIds: input.records.filter(({ benchmarkTargetConflict }) => benchmarkTargetConflict)
        .map(({ opaqueResponseId }) => opaqueResponseId).sort(),
    },
    criteria,
    interpretation,
  };
}
