import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  aggregateFreshValidation,
  canonicalArmMap,
  createDispatchRecords,
  deriveIdentifierOnlySelection,
  joinFreshValidationRecords,
  type JoinedFreshScoreRecord,
} from "../evaluation/mast/src/fresh-validation.js";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root,
  "evaluation/mast/fresh-validation-round-1-preregistration.json"), "utf8"));
const environment = JSON.parse(readFileSync(resolve(root,
  "evaluation/mast/fresh-validation-round-1-environment.json"), "utf8"));
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

describe("MAST Fresh Validation Round 1 freeze", () => {
  it("derives the frozen cohort from identifiers only and leaves eight reserves", () => {
    const result = deriveIdentifierOnlySelection({
      candidateFamilies: manifest.cohort.candidateFamilies,
      seedInteger: manifest.selectionMethod.seedInteger,
    });
    expect(result).toMatchObject({
      freshFamilies: manifest.cohort.freshFamilies,
      reservedFamilies: manifest.cohort.reservedFamilies,
      representativeIndex: manifest.selectionMethod.representativeIndex,
      supplementalStart: manifest.selectionMethod.supplementalStart,
      supplementalPrefixes: manifest.selectionMethod.supplementalPrefixes,
    });
    expect(result.freshFamilies).toHaveLength(12);
    expect(result.reservedFamilies).toHaveLength(8);
    expect(result.freshFamilies.some((id) =>
      manifest.cohort.excludedDevelopmentCalibrationFamilies.includes(id))).toBe(false);
  });

  it("binds the protocol and scoring implementation bytes before generation", () => {
    expect(digest(readFileSync(resolve(root, "protocols/Universal_Instructions.xml"), "utf8")))
      .toBe(environment.askRigor.universal.sha256);
    expect(digest(readFileSync(resolve(root, "protocols/HRP_Full.xml"), "utf8")))
      .toBe(environment.askRigor.hrp.sha256);
    for (const [name, path] of Object.entries(environment.scoring.sourceFiles) as
      Array<[string, string]>) {
      expect(digest(readFileSync(resolve(root, path), "utf8")))
        .toBe(environment.scoring.sourceSha256[name]);
    }
  });

  it("creates deterministic opaque schedules with separate lane-local ordering", () => {
    const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
    const first = createDispatchRecords({
      privateSeed: seed,
      freshFamilies: manifest.cohort.freshFamilies,
      regressionFamilies: manifest.cohort.developmentRegressionFamilies,
      trialsPerFamilyPerArm: 3,
    });
    const second = createDispatchRecords({
      privateSeed: seed,
      freshFamilies: manifest.cohort.freshFamilies,
      regressionFamilies: manifest.cohort.developmentRegressionFamilies,
      trialsPerFamilyPerArm: 3,
    });
    expect(first).toEqual(second);
    expect(first.filter(({ lane }) => lane === "FRESH_VALIDATION")).toHaveLength(144);
    expect(first.filter(({ lane }) => lane === "DEVELOPMENT_REGRESSION")).toHaveLength(60);
    expect(new Set(first.map(({ opaqueInputId }) => opaqueInputId)).size).toBe(204);
  });

  it("fails closed on arm alias collisions", () => {
    expect(() => canonicalArmMap({ A: ["SAME"], B: ["SAME"], C: ["C"], D: ["D"] }))
      .toThrow("FRESH_VALIDATION_ARM_ALIAS_COLLISION");
  });

  it("joins only through explicit opaque identities and bound hashes", () => {
    const outputSha = digest("output");
    const joined = joinFreshValidationRecords({
      generation: [{ opaqueInputId: "run-000000000000000000000001", exactOutputSha256: outputSha }],
      mapping: [{
        generationLedgerRecordId: "run-000000000000000000000001",
        opaqueResponseId: "EVAL-000000000000000000000001",
        exactGenerationOutputSha256: outputSha,
        familyId: "All006",
        armId: "UNIVERSAL_PLUS_HRP",
        trial: 1,
      }],
      final: [{
        opaqueResponseId: "EVAL-000000000000000000000001",
        exactSelectedOutputSha256: outputSha,
        f1Lexeme: "0.75",
        omissionCount: 1,
        commissionCount: 0,
        severeCommission: false,
        benchmarkTargetConflict: false,
      }],
      aliases: { A: ["A", "MAST_DEFAULT"], B: ["B", "MAST_THOROUGH"],
        C: ["C", "UNIVERSAL_ONLY"], D: ["D", "UNIVERSAL_PLUS_HRP"] },
    });
    expect(joined.integrityErrors).toEqual([]);
    expect(joined.records[0]).toMatchObject({ familyId: "All006", armId: "D", trial: 1 });

    const broken = joinFreshValidationRecords({
      generation: [{ opaqueInputId: "run-000000000000000000000001", exactOutputSha256: outputSha }],
      mapping: [{
        generationLedgerRecordId: "run-000000000000000000000001",
        opaqueResponseId: "EVAL-000000000000000000000001",
        exactGenerationOutputSha256: digest("other"), familyId: "All006", armId: "D", trial: 1,
      }],
      final: [{ opaqueResponseId: "EVAL-000000000000000000000001",
        exactSelectedOutputSha256: outputSha, f1Lexeme: "0.75", omissionCount: 1,
        commissionCount: 0, severeCommission: false, benchmarkTargetConflict: false }],
      aliases: { A: ["A"], B: ["B"], C: ["C"], D: ["D"] },
    });
    expect(broken.integrityErrors).toContain("FRESH_VALIDATION_EXPLICIT_ID_HASH_MISMATCH");
  });
});

function fixture(overrides: Partial<Record<string, string>> = {}, severeD = 0): JoinedFreshScoreRecord[] {
  const values = { A: "0.40", B: "0.50", C: "0.55", D: "0.60" };
  let sequence = 0;
  return manifest.cohort.freshFamilies.flatMap((familyId: string) =>
    (["A", "B", "C", "D"] as const).flatMap((armId) =>
      [1, 2, 3].map((trial) => {
        sequence += 1;
        return {
          opaqueResponseId: `EVAL-${String(sequence).padStart(24, "0")}`,
          generationLedgerRecordId: `run-${String(sequence).padStart(24, "0")}`,
          familyId,
          armId,
          trial,
          f1Lexeme: overrides[`${familyId}:${armId}`] ?? values[armId],
          omissionCount: armId === "D" ? 0 : 1,
          commissionCount: armId === "A" ? 1 : 0,
          severeCommission: armId === "D" && sequence <= severeD,
          benchmarkTargetConflict: false,
        };
      })));
}

describe("MAST Fresh Validation Round 1 frozen gate", () => {
  it("passes a complete favorable 12-family result", () => {
    const result = aggregateFreshValidation({
      records: fixture(), expectedFamilies: manifest.cohort.freshFamilies,
    });
    expect(result.integrityErrors).toEqual([]);
    expect(result.primaryDMinusB).toMatchObject({
      mean: { numerator: "1", denominator: "10", display6: "0.100000" },
      median: { numerator: "1", denominator: "10", display6: "0.100000" },
      wins: 12, ties: 0, losses: 0,
    });
    expect(result.secondaryDMinusC).toMatchObject({
      mean: { numerator: "1", denominator: "20", display6: "0.050000" },
      wins: 12, ties: 0, losses: 0,
    });
    expect(result.criteria).toEqual({ P1: true, P2: true, P3: true, P4: true, P5: true });
    expect(result.interpretation).toBe("PASS");
  });

  it("implements mixed-result indeterminate and three-signal fail boundaries", () => {
    const families: string[] = manifest.cohort.freshFamilies;
    const mixedOverrides = Object.fromEntries(families.slice(0, 5).map((family) =>
      [`${family}:D`, "0.40"]));
    const mixed = aggregateFreshValidation({ records: fixture(mixedOverrides), expectedFamilies: families });
    expect(mixed.primaryDMinusB.wins).toBe(7);
    expect(mixed.interpretation).toBe("INDETERMINATE");

    const failureOverrides = Object.fromEntries(families.slice(0, 8).map((family) =>
      [`${family}:D`, "0.40"]));
    const failure = aggregateFreshValidation({ records: fixture(failureOverrides), expectedFamilies: families });
    expect(failure.interpretation).toBe("FAIL");
  });

  it("fails closed on denominator shrinkage", () => {
    const records = fixture();
    records.pop();
    const result = aggregateFreshValidation({ records, expectedFamilies: manifest.cohort.freshFamilies });
    expect(result.integrityErrors).toContain("FRESH_VALIDATION_EXPECTED_COVERAGE_INVALID");
    expect(result.interpretation).toBe("INDETERMINATE");
  });

  it("fails when the frozen severe-commission safety criterion fails", () => {
    const records = fixture();
    const dRecords = records.filter(({ armId }) => armId === "D");
    dRecords[0]!.severeCommission = true;
    dRecords[1]!.severeCommission = true;
    const result = aggregateFreshValidation({ records, expectedFamilies: manifest.cohort.freshFamilies });
    expect(result.criteria.P4).toBe(false);
    expect(result.interpretation).toBe("FAIL");
  });
});
