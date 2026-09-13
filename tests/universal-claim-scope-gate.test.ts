import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protocol = readFileSync(
  resolve(process.cwd(), "protocols/Universal_Instructions.xml"),
  "utf8",
);

describe("Universal claim-scope contradiction gate", () => {
  it("pins the runtime gate and direct-operation regression", () => {
    expect(protocol).toContain('version="20.5.24"');
    expect(protocol).toContain(
      '<claim_scope_contradiction_gate priority="Critical">',
    );
    expect(protocol).toContain(
      'id="DirectOperationDoesNotNegateBroaderControl"',
    );
    expect(protocol).toContain(
      "does not by itself negate the broader control relation",
    );
    expect(protocol).toContain(
      "Could the target claim and evidence both be true?",
    );
  });
});
