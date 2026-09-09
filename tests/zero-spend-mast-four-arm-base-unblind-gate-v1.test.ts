import { describe, expect, it } from "vitest";

import {
  addExact,
  aggregateUnblindedRecords,
  parseExactDecimal,
  type UnblindingRecord,
} from "../scripts/zero-spend-mast-four-arm-base-unblind-gate-v1.mjs";

const families = Array.from({ length: 8 }, (_, index) => `Family${index + 1}`);
const arms = {
  A: "DEFAULT",
  B: "THOROUGH",
  C: "UNIVERSAL",
  D: "UNIVERSAL_HRP",
} as const;

function fixture(overrides: Partial<Record<string, string>> = {}): {
  records: UnblindingRecord[];
  generationTools: Map<string, boolean>;
} {
  const records: UnblindingRecord[] = [];
  const generationTools = new Map<string, boolean>();
  let sequence = 0;
  const base = { A: "0.4", B: "0.5", C: "0.55", D: "0.6" } as const;
  for (const familyId of families) {
    for (const [arm, armId] of Object.entries(arms)) {
      for (let trial = 1; trial <= 3; trial += 1) {
        sequence += 1;
        const generationLedgerRecordId = `run-${String(sequence).padStart(24, "0")}`;
        records.push({
          opaqueResponseId: `EVAL-${String(sequence).padStart(24, "0")}`,
          familyId,
          armId,
          trial,
          generationLedgerRecordId,
          f1Lexeme: overrides[`${familyId}:${arm}`] ?? base[arm as keyof typeof base],
          pilotSevereCommission: arm === "B" && familyId === families[0] && trial === 1,
        });
        generationTools.set(generationLedgerRecordId, sequence % 2 === 0);
      }
    }
  }
  return { records, generationTools };
}

describe("zero-spend MAST deterministic unblind gate", () => {
  it("uses exact decimal arithmetic rather than binary floating point", () => {
    expect(addExact(parseExactDecimal("0.1"), parseExactDecimal("0.2"))).toEqual({
      numerator: 3n,
      denominator: 10n,
    });
    expect(parseExactDecimal("1.25e-2")).toEqual({ numerator: 1n, denominator: 80n });
  });

  it("applies the frozen gate from complete family-arm coverage", () => {
    const { records, generationTools } = fixture();
    const result = aggregateUnblindedRecords({
      records,
      expectedFamilies: families,
      expectedArms: arms,
      generationTools,
    });
    expect(result.integrityErrors).toEqual([]);
    expect(result.primaryComparison).toMatchObject({
      mean: { numerator: "1", denominator: "10", display6: "0.100000" },
      median: { numerator: "1", denominator: "10", display6: "0.100000" },
      strictWinCount: 8,
      tieCount: 0,
      lossCount: 0,
    });
    expect(result.criteria).toEqual({
      meanPositive: true,
      medianPositive: true,
      minimumSixStrictWins: true,
      severeCommissionSafety: true,
    });
    expect(result.gateResult).toBe("PASS");
  });

  it("returns FAIL when complete frozen data miss a primary criterion", () => {
    const { records, generationTools } = fixture(Object.fromEntries(
      families.slice(0, 3).map((family) => [`${family}:D`, "0.4"]),
    ));
    const result = aggregateUnblindedRecords({
      records,
      expectedFamilies: families,
      expectedArms: arms,
      generationTools,
    });
    expect(result.integrityErrors).toEqual([]);
    expect(result.primaryComparison.strictWinCount).toBe(5);
    expect(result.criteria.minimumSixStrictWins).toBe(false);
    expect(result.gateResult).toBe("FAIL");
  });

  it("returns INDETERMINATE for incomplete or null primary data", () => {
    const { records, generationTools } = fixture();
    records[0]!.f1Lexeme = null;
    const result = aggregateUnblindedRecords({
      records,
      expectedFamilies: families,
      expectedArms: arms,
      generationTools,
    });
    expect(result.integrityErrors).toContain("UNBLIND_GATE_PRIMARY_METRIC_NULL");
    expect(result.gateResult).toBe("INDETERMINATE");
  });
});
