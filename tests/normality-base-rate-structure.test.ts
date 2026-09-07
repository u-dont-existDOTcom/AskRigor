import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { loadProtocol } from "@askrigor/protocol";

const UNIVERSAL_URL = new URL("../protocols/Universal_Instructions.xml", import.meta.url);

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function sectionBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("Universal normality and base-rate integration", () => {
  it("preserves the requested target and places the Critical gate in the controlling path", async () => {
    const text = await readFile(UNIVERSAL_URL, "utf8");

    expect(text).toMatch(
      /<Protocol name="AskRigor\.com universal saved instructions" version="20\.5\.18" revisionDate="2026-09-07"[^>]+Normality-Base-Rate/u,
    );

    for (const singleton of [
      '<revision version="20.5.18" priority="Critical">',
      '<normality_base_rate_gate priority="Critical">',
      '<case id="MechanismDoesNotEstablishFrequency">',
      '<case id="ExplicitSafetyTargetDoesNotBecomeFrequencyQuestion">',
      "Normality/base-rate check: What meaning of normal is actually being asked?",
    ]) {
      expect(occurrences(text, singleton), singleton).toBe(1);
    }

    const revision18 = text.indexOf('<revision version="20.5.18" priority="Critical">');
    const revision17 = text.indexOf('<revision version="20.5.17" priority="Critical">');
    expect(revision18).toBeGreaterThanOrEqual(0);
    expect(revision17).toBeGreaterThan(revision18);

    const evidenceGateEnd = text.indexOf("</evidence_discrimination_gate>");
    const normalityGate = text.indexOf('<normality_base_rate_gate priority="Critical">');
    const reconstructionGate = text.indexOf('<whole_argument_reconstruction_gate priority="Critical">');
    expect(normalityGate).toBeGreaterThan(evidenceGateEnd);
    expect(reconstructionGate).toBeGreaterThan(normalityGate);

    const targetCheck = text.indexOf("Target-preservation check:");
    const normalityCheck = text.indexOf("Normality/base-rate check: What meaning of normal is actually being asked?");
    const strategyCheck = text.indexOf("Strategy-switch check:");
    expect(normalityCheck).toBeGreaterThan(targetCheck);
    expect(strategyCheck).toBeGreaterThan(normalityCheck);

    const gate = sectionBetween(
      text,
      '<normality_base_rate_gate priority="Critical">',
      "</normality_base_rate_gate>",
    );
    for (const required of [
      "Preserve the intended meaning of normal from the question and context.",
      "keep population prevalence/distribution as the target",
      "do not substitute mechanistic plausibility, experimental demonstration, or nonpathological status",
      "matched to the phenomenon, population, conditions, magnitude, timing, threshold, and non-reactive comparison conditions",
      "answer that target with appropriate evidence rather than silently replacing it with frequency",
      "Unknown prevalence is neither commonness nor rarity",
      "without inventing a percentage",
      "a familiar mechanism does not establish the distribution of that exact response",
      "explaining why X can happen does not answer how often X happens",
    ]) {
      expect(gate).toContain(required);
    }
  });

  it("encodes both directions of the target-substitution regression", async () => {
    const text = await readFile(UNIVERSAL_URL, "utf8");
    const frequencyCase = sectionBetween(
      text,
      '<case id="MechanismDoesNotEstablishFrequency">',
      "</case>",
    );
    const explicitTargetCase = sectionBetween(
      text,
      '<case id="ExplicitSafetyTargetDoesNotBecomeFrequencyQuestion">',
      "</case>",
    );

    for (const required of [
      "hot tea can trigger thermoregulatory sweating",
      "no population-frequency evidence",
      "visible heavy sweating immediately after only a small amount",
      "Keep frequency as the target",
      "Do not infer that the exact response is common",
      "Report prevalence as unknown",
    ]) {
      expect(frequencyCase).toContain(required);
    }

    for (const required of [
      "dangerous, pathological, within a stated technical reference range, or normatively acceptable",
      "Answer the explicit safety, pathology, reference-range, or normative target",
      "Do not replace it with an unrelated prevalence requirement",
      "do not infer safety or pathology from commonness, rarity, or unknown prevalence",
    ]) {
      expect(explicitTargetCase).toContain(required);
    }
  });

  it("exposes the same guidance through the canonical protocol loader", async () => {
    const source = await readFile(UNIVERSAL_URL, "utf8");
    const emitted = await loadProtocol("universal");

    expect(emitted).toBe(source);
    expect(emitted).toContain('<normality_base_rate_gate priority="Critical">');
    expect(emitted).toContain("For frequency questions, explaining why X can happen does not answer how often X happens.");
    expect(emitted).toContain('<case id="ExplicitSafetyTargetDoesNotBecomeFrequencyQuestion">');
  });
});
