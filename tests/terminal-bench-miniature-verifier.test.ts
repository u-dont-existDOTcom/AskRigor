import { describe, expect, it } from "vitest";

import {
  calculateLogRatio,
  canonicalSha256,
  materializeCorrectCandidate,
  type MiniatureCandidate,
  type MiniatureTruth,
  type VerifierCheck,
  verifyMiniatureCandidate,
} from "../evaluation/terminal-bench/verifier-contract.js";

const clone = <T>(value: T): T => structuredClone(value);

// Illustrative data only. The final miniature truth and answer artifacts are
// generated and exercised outside the public repository.
const toyTruth: MiniatureTruth = {
  targetEstimandId: "FICTIONAL-TARGET-LOG-RR-12W",
  targetEffectMeasure: "RISK_RATIO",
  publicInputSha256: "1".repeat(64),
  reports: [
    {
      reportId: "TOY-REPORT-A",
      studyId: "TOY-STUDY-1",
      cohortId: "TOY-COHORT-1",
      allowedRelations: ["SAME_STUDY_SAME_COHORT"],
    },
    {
      reportId: "TOY-REPORT-B",
      studyId: "TOY-STUDY-1",
      cohortId: "TOY-COHORT-1",
      allowedRelations: ["EXTENDED_FOLLOWUP"],
    },
    {
      reportId: "TOY-REPORT-C",
      studyId: "TOY-STUDY-2",
      cohortId: "TOY-COHORT-2",
      allowedRelations: ["INDEPENDENT"],
    },
    {
      reportId: "TOY-REPORT-D",
      studyId: "TOY-STUDY-3",
      cohortId: "TOY-COHORT-3",
      allowedRelations: ["INDEPENDENT"],
    },
  ],
  estimates: [
    {
      estimateId: "TOY-ESTIMATE-A",
      reportId: "TOY-REPORT-A",
      dependencyGroupId: "TOY-DEPENDENCY-1",
      targetCompatible: true,
      incompatibilityCodes: [],
      effectMeasure: "RISK_RATIO",
      treatmentEvents: 18,
      treatmentTotal: 90,
      controlEvents: 30,
      controlTotal: 90,
    },
    {
      estimateId: "TOY-ESTIMATE-B",
      reportId: "TOY-REPORT-B",
      dependencyGroupId: "TOY-DEPENDENCY-1",
      targetCompatible: true,
      incompatibilityCodes: [],
      effectMeasure: "RISK_RATIO",
      treatmentEvents: 24,
      treatmentTotal: 120,
      controlEvents: 40,
      controlTotal: 120,
    },
    {
      estimateId: "TOY-ESTIMATE-C",
      reportId: "TOY-REPORT-C",
      dependencyGroupId: "TOY-DEPENDENCY-2",
      targetCompatible: true,
      incompatibilityCodes: [],
      effectMeasure: "RISK_RATIO",
      treatmentEvents: 14,
      treatmentTotal: 70,
      controlEvents: 23,
      controlTotal: 70,
    },
    {
      estimateId: "TOY-ESTIMATE-D",
      reportId: "TOY-REPORT-D",
      dependencyGroupId: "TOY-DEPENDENCY-3",
      targetCompatible: false,
      incompatibilityCodes: ["EFFECT_MEASURE_MISMATCH"],
      effectMeasure: "RATE_RATIO",
      treatmentEvents: 22,
      controlEvents: 18,
      treatmentPersonTime: 160,
      controlPersonTime: 170,
    },
  ],
  allowedPrimaryContributionSets: [
    ["TOY-ESTIMATE-A", "TOY-ESTIMATE-C"],
    ["TOY-ESTIMATE-B", "TOY-ESTIMATE-C"],
  ],
  sensitivityAnalyses: [
    {
      sensitivityId: "ALTERNATE-VALID-REPORT",
      includedEstimateIds: ["TOY-ESTIMATE-B", "TOY-ESTIMATE-C"],
    },
    {
      sensitivityId: "REPORT-AS-STUDY-ERROR",
      includedEstimateIds: ["TOY-ESTIMATE-A", "TOY-ESTIMATE-B", "TOY-ESTIMATE-C"],
    },
  ],
  numericTolerance: 1e-10,
};

const oracle = materializeCorrectCandidate(toyTruth, ["TOY-ESTIMATE-A", "TOY-ESTIMATE-C"]);
const alternate = materializeCorrectCandidate(toyTruth, ["TOY-ESTIMATE-B", "TOY-ESTIMATE-C"]);

function withUpdatedEffectHash(candidate: MiniatureCandidate): MiniatureCandidate {
  candidate.metaAnalysis.effectEstimatesSha256 = canonicalSha256(candidate.effectEstimates);
  return candidate;
}

describe("Terminal-Bench-Science miniature verifier contract", () => {
  it("accepts two scientifically equivalent contribution choices", () => {
    expect(verifyMiniatureCandidate(toyTruth, oracle)).toEqual({ valid: true, findings: [] });
    expect(verifyMiniatureCandidate(toyTruth, alternate)).toEqual({ valid: true, findings: [] });
  });

  it("keeps person-time rate estimates distinct from target risk estimates", () => {
    const rate = calculateLogRatio({
      effectMeasure: "RATE_RATIO",
      treatmentEvents: 20,
      treatmentPersonTime: 200,
      controlEvents: 10,
      controlPersonTime: 250,
    });
    expect(rate.logRiskRatio).toBeCloseTo(Math.log(2.5), 12);
    expect(rate.samplingVariance).toBeCloseTo(0.15, 12);
    expect(toyTruth.estimates.at(-1)).toMatchObject({
      targetCompatible: false,
      effectMeasure: "RATE_RATIO",
      incompatibilityCodes: ["EFFECT_MEASURE_MISMATCH"],
    });
  });

  it("rejects malformed untrusted candidate artifacts without throwing", () => {
    expect(verifyMiniatureCandidate(toyTruth, { lineage: "not-an-array" })).toEqual({
      valid: false,
      findings: [{
        check: "schema",
        code: "CANDIDATE_SCHEMA_INVALID",
        location: "candidate",
      }],
    });
  });

  it("rejects every seeded invalid implementation for a specific deterministic reason", () => {
    const wrongLineage = clone(oracle);
    wrongLineage.lineage[1].studyId = "TOY-WRONG-STUDY";

    const reportAsStudy = clone(oracle);
    reportAsStudy.selection.find(({ estimateId }) => estimateId === "TOY-ESTIMATE-B")!.primaryStatus = "INCLUDE";

    const incompatibleExposure = clone(oracle);
    incompatibleExposure.selection.find(({ estimateId }) => estimateId === "TOY-ESTIMATE-A")!.primaryStatus = "EXCLUDE";
    incompatibleExposure.selection.find(({ estimateId }) => estimateId === "TOY-ESTIMATE-D")!.primaryStatus = "INCLUDE";

    const wrongEffect = withUpdatedEffectHash(clone(oracle));
    wrongEffect.effectEstimates[0].logRiskRatio += 0.1;
    withUpdatedEffectHash(wrongEffect);

    const wrongPool = clone(oracle);
    wrongPool.metaAnalysis.pooledLogRiskRatio += 0.2;

    const wrongSensitivity = clone(oracle);
    wrongSensitivity.sensitivityMatrix[0].pooledVariance += 0.01;

    const brokenLinkage = clone(oracle);
    brokenLinkage.metaAnalysis.lineageSha256 = "0".repeat(64);

    const invalid = [
      wrongLineage,
      reportAsStudy,
      incompatibleExposure,
      wrongEffect,
      wrongPool,
      wrongSensitivity,
      brokenLinkage,
    ];
    expect(invalid).toHaveLength(7);
    for (const candidate of invalid) {
      expect(verifyMiniatureCandidate(toyTruth, candidate).valid).toBe(false);
    }
  });

  it("kills six verifier mutants so no passing oracle is treated as sufficient proof", () => {
    const duplicateRow = clone(oracle);
    duplicateRow.lineage.push(clone(duplicateRow.lineage[0]));
    duplicateRow.metaAnalysis.lineageSha256 = canonicalSha256(duplicateRow.lineage);

    const wrongLineage = clone(oracle);
    wrongLineage.lineage[1].cohortId = "TOY-WRONG-COHORT";
    wrongLineage.metaAnalysis.lineageSha256 = canonicalSha256(wrongLineage.lineage);

    const wrongEffect = clone(oracle);
    wrongEffect.effectEstimates[0].samplingVariance += 0.001;
    withUpdatedEffectHash(wrongEffect);

    const wrongPool = clone(oracle);
    wrongPool.metaAnalysis.pooledVariance += 0.001;

    const wrongSensitivity = clone(oracle);
    wrongSensitivity.sensitivityMatrix[1].pooledLogRiskRatio += 0.001;

    const wrongHash = clone(oracle);
    wrongHash.metaAnalysis.selectionSha256 = "f".repeat(64);

    const mutants: Array<[VerifierCheck, MiniatureCandidate]> = [
      ["schema", duplicateRow],
      ["lineage", wrongLineage],
      ["effects", wrongEffect],
      ["pooling", wrongPool],
      ["sensitivities", wrongSensitivity],
      ["hashes", wrongHash],
    ];

    for (const [disabledCheck, candidate] of mutants) {
      const canonical = verifyMiniatureCandidate(toyTruth, candidate);
      const mutated = verifyMiniatureCandidate(toyTruth, candidate, {
        unsafeTestOnlyDisabledChecks: [disabledCheck],
      });
      expect(canonical.valid, disabledCheck).toBe(false);
      expect(canonical.findings.every(({ check }) => check === disabledCheck), disabledCheck).toBe(true);
      expect(mutated.valid, disabledCheck).toBe(true);
    }
  });
});
