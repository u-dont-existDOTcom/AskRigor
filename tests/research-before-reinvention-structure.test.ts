import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const UNIVERSAL_URL = new URL("../protocols/Universal_Instructions.xml", import.meta.url);
const PATCHER_URL = new URL(
  "../scripts/protocol/apply_universal_20_5_13_to_20_5_14.py",
  import.meta.url
);

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("Universal research-before-reinvention integration", () => {
  it("requires the complete Universal 20.5.14 gate and point-of-generation check exactly once", async () => {
    const text = await readFile(UNIVERSAL_URL, "utf8");

    expect(text).toMatch(
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.14" revisionDate="2026-08-18"/
    );

    for (const singleton of [
      '<revision version="20.5.14" priority="Critical">',
      '<research_before_reinvention_gate priority="Critical">',
      "Reinvention check: Am I substantially inventing or repeatedly refining something that plausibly has an established research, standards, tooling, or implementation literature?",
      "- prior-work/reuse status when the Research-Before-Reinvention Gate triggers"
    ]) {
      expect(occurrences(text, singleton), singleton).toBe(1);
    }

    for (const required of [
      "<purpose>",
      "<activation>",
      "<independent_conception_snapshot>",
      "<existing_work_scan>",
      "<synthesis>",
      "<external_baseline>",
      "<research_debt>",
      '<rules priority="Critical">',
      "the strongest relevant academic literature",
      "standards, specifications, reference architectures, and professional guidance",
      "mature implementations, libraries, products, and open-source tools",
      "adjacent disciplines",
      "reuse;",
      "adapt;",
      "compose;",
      "invent;",
      "experiment.",
      "Research debt may not become indefinite exemption.",
      "Existing work supplements rather than automatically replaces the user's independent conception."
    ]) {
      expect(text).toContain(required);
    }
  });

  it("keeps the migration fail-closed on the exact 20.5.13 canonical source bytes", async () => {
    const patcher = await readFile(PATCHER_URL, "utf8");

    expect(patcher).toContain(
      'EXPECTED_SHA256 = "3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4"'
    );
    expect(patcher).toContain("expected exactly one {label} anchor");
    expect(patcher).toContain("canonical source SHA-256 mismatch");
    expect(patcher).toContain("ET.fromstring(text.encode(\"utf-8\"))");
  });
});
