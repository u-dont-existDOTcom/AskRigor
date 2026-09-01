import { createHash } from "node:crypto";

import { z } from "zod";

export const REPORT_RELATIONS = [
  "SAME_STUDY_SAME_COHORT",
  "NESTED_SUBCOHORT",
  "EXTENDED_FOLLOWUP",
  "PARTIAL_PARTICIPANT_OVERLAP",
  "SHARED_CONTROL",
  "INDEPENDENT",
  "UNRESOLVED",
] as const;

export type ReportRelation = (typeof REPORT_RELATIONS)[number];
export type PrimaryStatus = "INCLUDE" | "EXCLUDE" | "UNRESOLVED";
export type ConclusionClass = "BENEFIT_SIGNAL" | "NO_CLEAR_SIGNAL" | "HARM_SIGNAL";

export interface MiniatureTruth {
  targetEstimandId: string;
  publicInputSha256: string;
  reports: Array<{
    reportId: string;
    studyId: string;
    cohortId: string;
    allowedRelations: ReportRelation[];
  }>;
  estimates: Array<{
    estimateId: string;
    reportId: string;
    dependencyGroupId: string;
    targetCompatible: boolean;
    treatmentEvents: number;
    treatmentTotal: number;
    controlEvents: number;
    controlTotal: number;
  }>;
  allowedPrimaryContributionSets: string[][];
  sensitivityAnalyses: Array<{
    sensitivityId: string;
    includedEstimateIds: string[];
  }>;
  numericTolerance: number;
}

export interface MiniatureCandidate {
  lineage: Array<{
    reportId: string;
    studyId: string;
    cohortId: string;
    relation: ReportRelation;
  }>;
  selection: Array<{
    estimateId: string;
    primaryStatus: PrimaryStatus;
    dependencyGroupId: string;
  }>;
  effectEstimates: Array<{
    estimateId: string;
    logRiskRatio: number;
    samplingVariance: number;
  }>;
  metaAnalysis: {
    targetEstimandId: string;
    includedIndependentStudyCount: number;
    includedEstimateCount: number;
    pooledLogRiskRatio: number;
    pooledVariance: number;
    conclusion: ConclusionClass;
    publicInputSha256: string;
    lineageSha256: string;
    selectionSha256: string;
    effectEstimatesSha256: string;
  };
  sensitivityMatrix: Array<{
    sensitivityId: string;
    includedEstimateIds: string[];
    pooledLogRiskRatio: number;
    pooledVariance: number;
  }>;
}

export type VerifierCheck =
  | "schema"
  | "lineage"
  | "selection"
  | "compatibility"
  | "dependence"
  | "effects"
  | "pooling"
  | "sensitivities"
  | "hashes";

export interface VerificationFinding {
  check: VerifierCheck;
  code: string;
  location: string;
}

export interface VerificationResult {
  valid: boolean;
  findings: VerificationFinding[];
}

/**
 * Mutation switches exist only so verifier tests can prove that each check is
 * load-bearing. A benchmark runtime must never pass this option.
 */
export interface UnsafeVerifierMutationForTest {
  unsafeTestOnlyDisabledChecks: VerifierCheck[];
}

const finiteNumber = z.number().finite();
const candidateSchema = z.object({
  lineage: z.array(z.object({
    reportId: z.string().min(1),
    studyId: z.string().min(1),
    cohortId: z.string().min(1),
    relation: z.enum(REPORT_RELATIONS),
  })),
  selection: z.array(z.object({
    estimateId: z.string().min(1),
    primaryStatus: z.enum(["INCLUDE", "EXCLUDE", "UNRESOLVED"]),
    dependencyGroupId: z.string().min(1),
  })),
  effectEstimates: z.array(z.object({
    estimateId: z.string().min(1),
    logRiskRatio: finiteNumber,
    samplingVariance: finiteNumber,
  })),
  metaAnalysis: z.object({
    targetEstimandId: z.string().min(1),
    includedIndependentStudyCount: z.number().int().nonnegative(),
    includedEstimateCount: z.number().int().nonnegative(),
    pooledLogRiskRatio: finiteNumber,
    pooledVariance: finiteNumber,
    conclusion: z.enum(["BENEFIT_SIGNAL", "NO_CLEAR_SIGNAL", "HARM_SIGNAL"]),
    publicInputSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    lineageSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    selectionSha256: z.string().regex(/^[0-9a-f]{64}$/u),
    effectEstimatesSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }),
  sensitivityMatrix: z.array(z.object({
    sensitivityId: z.string().min(1),
    includedEstimateIds: z.array(z.string().min(1)),
    pooledLogRiskRatio: finiteNumber,
    pooledVariance: finiteNumber,
  })),
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function calculateLogRiskRatio(input: {
  treatmentEvents: number;
  treatmentTotal: number;
  controlEvents: number;
  controlTotal: number;
}): { logRiskRatio: number; samplingVariance: number } {
  const { treatmentEvents, treatmentTotal, controlEvents, controlTotal } = input;
  if (
    ![treatmentEvents, treatmentTotal, controlEvents, controlTotal].every(Number.isFinite)
    || treatmentEvents <= 0
    || controlEvents <= 0
    || treatmentTotal <= treatmentEvents
    || controlTotal <= controlEvents
  ) {
    throw new Error("Miniature log-risk-ratio inputs require 0 < events < total in both arms");
  }
  return {
    logRiskRatio: Math.log(
      (treatmentEvents / treatmentTotal) / (controlEvents / controlTotal),
    ),
    samplingVariance:
      (1 / treatmentEvents)
      - (1 / treatmentTotal)
      + (1 / controlEvents)
      - (1 / controlTotal),
  };
}

export function inverseVariancePool(
  effects: Array<{ logRiskRatio: number; samplingVariance: number }>,
): { pooledLogRiskRatio: number; pooledVariance: number; conclusion: ConclusionClass } {
  if (
    effects.length === 0
    || effects.some(
      ({ logRiskRatio, samplingVariance }) =>
        !Number.isFinite(logRiskRatio)
        || !Number.isFinite(samplingVariance)
        || samplingVariance <= 0,
    )
  ) {
    throw new Error("Pooling requires at least one finite effect with positive variance");
  }
  const totalWeight = effects.reduce((sum, effect) => sum + (1 / effect.samplingVariance), 0);
  const pooledLogRiskRatio = effects.reduce(
    (sum, effect) => sum + (effect.logRiskRatio / effect.samplingVariance),
    0,
  ) / totalWeight;
  const pooledVariance = 1 / totalWeight;
  const halfWidth = 1.96 * Math.sqrt(pooledVariance);
  const lower = pooledLogRiskRatio - halfWidth;
  const upper = pooledLogRiskRatio + halfWidth;
  const conclusion: ConclusionClass = upper < 0
    ? "BENEFIT_SIGNAL"
    : lower > 0
      ? "HARM_SIGNAL"
      : "NO_CLEAR_SIGNAL";
  return { pooledLogRiskRatio, pooledVariance, conclusion };
}

function sameSet(left: string[], right: string[]): boolean {
  return left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function close(left: number, right: number, tolerance: number): boolean {
  return Number.isFinite(left) && Math.abs(left - right) <= tolerance;
}

function duplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function verifyMiniatureCandidate(
  truth: MiniatureTruth,
  candidateInput: unknown,
  mutation?: UnsafeVerifierMutationForTest,
): VerificationResult {
  const findings: VerificationFinding[] = [];
  const disabled = new Set(mutation?.unsafeTestOnlyDisabledChecks ?? []);
  const add = (check: VerifierCheck, code: string, location: string): void => {
    if (!disabled.has(check)) findings.push({ check, code, location });
  };
  const parsedCandidate = candidateSchema.safeParse(candidateInput);
  if (!parsedCandidate.success) {
    add("schema", "CANDIDATE_SCHEMA_INVALID", "candidate");
    return { valid: findings.length === 0, findings };
  }
  const candidate = parsedCandidate.data as MiniatureCandidate;

  const truthReportIds = truth.reports.map(({ reportId }) => reportId);
  const candidateReportIds = candidate.lineage.map(({ reportId }) => reportId);
  const truthEstimateIds = truth.estimates.map(({ estimateId }) => estimateId);
  const candidateSelectionIds = candidate.selection.map(({ estimateId }) => estimateId);
  if (
    duplicates(candidateReportIds)
    || duplicates(candidateSelectionIds)
    || duplicates(candidate.effectEstimates.map(({ estimateId }) => estimateId))
  ) {
    add("schema", "DUPLICATE_IDENTIFIER", "candidate structured rows");
  }
  if (!sameSet(candidateReportIds, truthReportIds)) {
    add("schema", "REPORT_COVERAGE_MISMATCH", "lineage");
  }
  if (!sameSet(candidateSelectionIds, truthEstimateIds)) {
    add("schema", "ESTIMATE_COVERAGE_MISMATCH", "selection");
  }

  for (const expected of truth.reports) {
    const actual = candidate.lineage.find(({ reportId }) => reportId === expected.reportId);
    if (!actual) continue;
    if (
      actual.studyId !== expected.studyId
      || actual.cohortId !== expected.cohortId
      || !expected.allowedRelations.includes(actual.relation)
    ) {
      add("lineage", "REPORT_LINEAGE_MISMATCH", `lineage:${expected.reportId}`);
    }
  }

  const includedIds = candidate.selection
    .filter(({ primaryStatus }) => primaryStatus === "INCLUDE")
    .map(({ estimateId }) => estimateId);
  if (!truth.allowedPrimaryContributionSets.some((allowed) => sameSet(allowed, includedIds))) {
    add("selection", "PRIMARY_CONTRIBUTION_SET_INVALID", "selection");
  }
  for (const selected of candidate.selection) {
    const expected = truth.estimates.find(({ estimateId }) => estimateId === selected.estimateId);
    if (!expected) continue;
    if (selected.dependencyGroupId !== expected.dependencyGroupId) {
      add("selection", "DEPENDENCY_GROUP_MISMATCH", `selection:${selected.estimateId}`);
    }
    if (selected.primaryStatus === "INCLUDE" && !expected.targetCompatible) {
      add("compatibility", "INCOMPATIBLE_ESTIMATE_INCLUDED", `selection:${selected.estimateId}`);
    }
  }
  const includedGroups = includedIds
    .map((estimateId) => truth.estimates.find((estimate) => estimate.estimateId === estimateId)?.dependencyGroupId)
    .filter((value): value is string => value !== undefined);
  if (duplicates(includedGroups)) {
    add("dependence", "DEPENDENT_ESTIMATES_DOUBLE_COUNTED", "selection");
  }

  const expectedEffects = new Map(
    truth.estimates.map((estimate) => [estimate.estimateId, calculateLogRiskRatio(estimate)]),
  );
  if (!sameSet(candidate.effectEstimates.map(({ estimateId }) => estimateId), includedIds)) {
    add("effects", "EFFECT_ROWS_DO_NOT_MATCH_INCLUDED_SET", "effectEstimates");
  }
  for (const actual of candidate.effectEstimates) {
    const expected = expectedEffects.get(actual.estimateId);
    if (
      !expected
      || !close(actual.logRiskRatio, expected.logRiskRatio, truth.numericTolerance)
      || !close(actual.samplingVariance, expected.samplingVariance, truth.numericTolerance)
    ) {
      add("effects", "EFFECT_CALCULATION_MISMATCH", `effectEstimates:${actual.estimateId}`);
    }
  }

  const includedExpectedEffects = includedIds
    .map((estimateId) => expectedEffects.get(estimateId))
    .filter((value): value is { logRiskRatio: number; samplingVariance: number } => value !== undefined);
  if (includedExpectedEffects.length > 0) {
    const pooled = inverseVariancePool(includedExpectedEffects);
    const independentCount = new Set(includedGroups).size;
    if (
      candidate.metaAnalysis.targetEstimandId !== truth.targetEstimandId
      || candidate.metaAnalysis.includedEstimateCount !== includedIds.length
      || candidate.metaAnalysis.includedIndependentStudyCount !== independentCount
      || !close(candidate.metaAnalysis.pooledLogRiskRatio, pooled.pooledLogRiskRatio, truth.numericTolerance)
      || !close(candidate.metaAnalysis.pooledVariance, pooled.pooledVariance, truth.numericTolerance)
      || candidate.metaAnalysis.conclusion !== pooled.conclusion
    ) {
      add("pooling", "META_ANALYSIS_MISMATCH", "metaAnalysis");
    }
  }

  if (!sameSet(
    candidate.sensitivityMatrix.map(({ sensitivityId }) => sensitivityId),
    truth.sensitivityAnalyses.map(({ sensitivityId }) => sensitivityId),
  )) {
    add("sensitivities", "SENSITIVITY_COVERAGE_MISMATCH", "sensitivityMatrix");
  }
  for (const expected of truth.sensitivityAnalyses) {
    const actual = candidate.sensitivityMatrix.find(
      ({ sensitivityId }) => sensitivityId === expected.sensitivityId,
    );
    if (!actual) continue;
    const expectedSensitivityEffects = expected.includedEstimateIds
      .map((estimateId) => expectedEffects.get(estimateId))
      .filter((value): value is { logRiskRatio: number; samplingVariance: number } => value !== undefined);
    if (expectedSensitivityEffects.length !== expected.includedEstimateIds.length) {
      add("sensitivities", "SENSITIVITY_TRUTH_REFERENCE_INVALID", `sensitivityMatrix:${expected.sensitivityId}`);
      continue;
    }
    const pooled = inverseVariancePool(expectedSensitivityEffects);
    if (
      !sameSet(actual.includedEstimateIds, expected.includedEstimateIds)
      || !close(actual.pooledLogRiskRatio, pooled.pooledLogRiskRatio, truth.numericTolerance)
      || !close(actual.pooledVariance, pooled.pooledVariance, truth.numericTolerance)
    ) {
      add("sensitivities", "SENSITIVITY_RESULT_MISMATCH", `sensitivityMatrix:${expected.sensitivityId}`);
    }
  }

  if (
    candidate.metaAnalysis.publicInputSha256 !== truth.publicInputSha256
    || candidate.metaAnalysis.lineageSha256 !== canonicalSha256(candidate.lineage)
    || candidate.metaAnalysis.selectionSha256 !== canonicalSha256(candidate.selection)
    || candidate.metaAnalysis.effectEstimatesSha256 !== canonicalSha256(candidate.effectEstimates)
  ) {
    add("hashes", "ARTIFACT_HASH_LINKAGE_MISMATCH", "metaAnalysis");
  }

  return { valid: findings.length === 0, findings };
}

export function materializeCorrectCandidate(
  truth: MiniatureTruth,
  includedEstimateIds: string[],
): MiniatureCandidate {
  if (!truth.allowedPrimaryContributionSets.some((allowed) => sameSet(allowed, includedEstimateIds))) {
    throw new Error("Requested contribution set is not allowed by the miniature truth");
  }
  const lineage = truth.reports.map((report) => ({
    reportId: report.reportId,
    studyId: report.studyId,
    cohortId: report.cohortId,
    relation: report.allowedRelations[0],
  }));
  const selection = truth.estimates.map((estimate) => ({
    estimateId: estimate.estimateId,
    primaryStatus: includedEstimateIds.includes(estimate.estimateId)
      ? "INCLUDE" as const
      : estimate.targetCompatible
        ? "EXCLUDE" as const
        : "EXCLUDE" as const,
    dependencyGroupId: estimate.dependencyGroupId,
  }));
  const expectedEffects = new Map(
    truth.estimates.map((estimate) => [estimate.estimateId, calculateLogRiskRatio(estimate)]),
  );
  const effectEstimates = includedEstimateIds.map((estimateId) => ({
    estimateId,
    ...expectedEffects.get(estimateId)!,
  }));
  const pooled = inverseVariancePool(effectEstimates);
  const includedGroups = includedEstimateIds.map(
    (estimateId) => truth.estimates.find((estimate) => estimate.estimateId === estimateId)!.dependencyGroupId,
  );
  const sensitivityMatrix = truth.sensitivityAnalyses.map((sensitivity) => {
    const effects = sensitivity.includedEstimateIds.map((estimateId) => expectedEffects.get(estimateId)!);
    return {
      sensitivityId: sensitivity.sensitivityId,
      includedEstimateIds: [...sensitivity.includedEstimateIds],
      ...inverseVariancePool(effects),
    };
  }).map(({ conclusion: _conclusion, ...sensitivity }) => sensitivity);
  return {
    lineage,
    selection,
    effectEstimates,
    metaAnalysis: {
      targetEstimandId: truth.targetEstimandId,
      includedIndependentStudyCount: new Set(includedGroups).size,
      includedEstimateCount: includedEstimateIds.length,
      ...pooled,
      publicInputSha256: truth.publicInputSha256,
      lineageSha256: canonicalSha256(lineage),
      selectionSha256: canonicalSha256(selection),
      effectEstimatesSha256: canonicalSha256(effectEstimates),
    },
    sensitivityMatrix,
  };
}
