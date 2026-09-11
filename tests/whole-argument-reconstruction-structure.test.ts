import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const UNIVERSAL_URL = new URL("../protocols/Universal_Instructions.xml", import.meta.url);
const HRP_URL = new URL("../protocols/HRP_Full.xml", import.meta.url);

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("Universal whole-argument reconstruction integration", () => {
  it("requires the complete Universal 20.5.13 reconstruction gate", async () => {
    const text = await readFile(UNIVERSAL_URL, "utf8");

    expect(text).toMatch(
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.23" revisionDate="2026-09-10"/
    );

    for (const required of [
      '<revision version="20.5.13" priority="Critical">',
      '<whole_argument_reconstruction_gate priority="Critical">',
      "Reconstruct the whole argument before judging or changing any part of it.",
      "operative object",
      "accurate behavioral label",
      "broader context",
      "missing content from missing setup",
      "primary explanatory home",
      "unaddressed proposal",
      "bounded silence-as-approval convention",
      "exact current text and location",
      "affected architecture or map nodes",
      "If the objection disappears after reconstruction, withdraw it.",
      "Whole-argument reconstruction check:"
    ]) {
      expect(text).toContain(required);
    }
  });

  it("preserves premise-integrity alongside the current HRP canonical bytes", async () => {
    const [universal, hrp] = await Promise.all([
      readFile(UNIVERSAL_URL, "utf8"),
      readFile(HRP_URL, "utf8")
    ]);

    expect(universal).toContain(
      '<premise_integrity_and_truth_priority_gate priority="Critical">'
    );
    expect(universal).toContain("Accuracy outranks agreement");
    expect(sha256(hrp)).toBe(
      "bb886e1e1874eeba1d645b773937043c7d9d88c84a3427ad7c0fe7f4a9be713f"
    );
  });
});
