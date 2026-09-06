import { describe, expect, it } from "vitest";

import { canonicalArmMap } from
  "../scripts/zero-spend-mast-four-arm-base-unblind-join-repair-v1.mjs";
import { f1LexemesByOpaqueFrom } from
  "../scripts/zero-spend-mast-four-arm-base-unblind-gate-v1.mjs";

describe("zero-spend MAST unblind join repair", () => {
  it("canonicalizes only source-declared arm aliases", () => {
    const aliases = canonicalArmMap({
      A: ["A", "ALPHA"],
      B: ["B", "BRAVO"],
      C: ["C", "CHARLIE"],
      D: ["D", "DELTA"],
    });
    expect([...aliases.entries()]).toEqual([
      ["A", "A"], ["ALPHA", "A"],
      ["B", "B"], ["BRAVO", "B"],
      ["C", "C"], ["CHARLIE", "C"],
      ["D", "D"], ["DELTA", "D"],
    ]);
    expect(aliases.has("UNKNOWN")).toBe(false);
  });

  it("fails closed when source-declared aliases collide", () => {
    expect(() => canonicalArmMap({
      A: ["SHARED"], B: ["SHARED"], C: ["C"], D: ["D"],
    })).toThrow("UNBLIND_REPAIR_ARM_ALIAS_COLLISION");
  });

  it("binds exact numeric lexemes to opaque IDs without cross-artifact array position", () => {
    const records = Array.from({ length: 96 }, (_, index) => ({
      opaqueResponseId: `EVAL-${String(96 - index).padStart(24, "0")}`,
      metrics: { metrics: { F1_weighted: index === 7 ? 1.25e-2 : index / 100 } },
    }));
    const serialized = Buffer.from(JSON.stringify({ records }).replace(
      '"F1_weighted":0.0125',
      '"F1_weighted":1.25e-2',
    ));
    const lexemes = f1LexemesByOpaqueFrom(serialized);
    expect(lexemes.size).toBe(96);
    expect(lexemes.get("EVAL-000000000000000000000089")).toBe("1.25e-2");
    expect(lexemes.get("EVAL-000000000000000000000096")).toBe("0");
  });
});
