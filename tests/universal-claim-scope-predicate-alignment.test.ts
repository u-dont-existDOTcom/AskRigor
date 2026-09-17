import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const protocol = readFileSync(
  resolve(process.cwd(), "protocols/Universal_Instructions.xml"),
  "utf8",
);

describe("Universal claim-scope / predicate-alignment gate", () => {
  it("preserves the 20.5.25 unified gate under Universal 20.5.26", () => {
    expect(XMLValidator.validate(protocol)).toBe(true);
    expect(protocol).toContain('version="20.5.26" revisionDate="2026-09-17"');
    expect(protocol.match(/<claim_scope_predicate_alignment_gate\b/gu)).toHaveLength(1);
    expect(protocol).not.toContain("<claim_scope_contradiction_gate");
    expect(protocol).not.toContain("<predicate_alignment_before_correction_gate");
  });

  it.each([
    "AvailabilityDoesNotNegateControl",
    "DirectOperationDoesNotNegateBroaderControl",
    "StructuralLeverageDoesNotProveSpecificDirection",
    "NarrowMechanismFailureMustRemainNarrow",
  ])("keeps stable regression case %s", (id) => {
    expect(protocol).toContain(`<case id="${id}">`);
  });

  it("keeps direct-operation and availability evidence narrower than control", () => {
    expect(protocol).toContain(
      "service unavailability in jurisdiction J by itself to disprove the control relation",
    );
    expect(protocol).toContain(
      "does not directly operate platform B",
    );
    expect(protocol).toContain(
      "does not by itself disprove the broader control relation",
    );
  });

  it("adds one point-of-generation check and preserves the 20.5.24 history", () => {
    expect(protocol.match(/Claim-scope \/ predicate-alignment check:/gu)).toHaveLength(1);
    expect(protocol).toContain('<revision version="20.5.24" priority="Critical">');
    expect(protocol).toContain("portable obligation-boundary binding and final-delivery checks");
  });
});
