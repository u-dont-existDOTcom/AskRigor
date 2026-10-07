import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);

async function sectionText(protocol: "hrp" | "universal", name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot(protocol);
  const matches = sections.filter((section) => section.name === name);
  expect(matches, name).toHaveLength(1);
  const [section] = matches;
  return Buffer.from(text, "utf8").subarray(section!.byte_start, section!.byte_end_exclusive).toString("utf8");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const squash = (text: string) => text.replace(/\s+/gu, " ");

function rule(text: string, name: string): string {
  return squash(text.match(new RegExp(`<Rule name="${name}"[^>]*>[^<]+</Rule>`, "u"))?.[0] ?? "");
}

// The owner's consilience and expected-observability rule (UDA, 2026-10-06), carried into HRP 20.6.11 and Universal
// 20.5.35 as candidates pending the owner's approval of the exact text. The chain tests undo the recorded edits to the
// prior bytes; these check what the edits put where.
describe("consilience candidate: practical effectiveness claims", () => {
  it("adds the two HRP rules directly after the rules they extend", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    for (const [neighbor, added] of [
      ['<Rule name="DiscordancePreservationAndDiscriminatorSearch"', '<Rule name="ConsilienceForPracticalEffectiveness"'],
      ['<Rule name="SilentDenominator"', '<Rule name="ExpectedObservabilityOfRealWorldTrace"'],
      ['<Case id="ParentReviewOfChildOutcome">', '<Case id="LargeTrialEffectSilentRealWorld">'],
      ['<Check id="FS211">', '<Check id="FS212">'],
    ] as const) {
      expect(occurrences(hrp, added), added).toBe(1);
      const start = hrp.indexOf(neighbor);
      const next = hrp.indexOf(added.slice(0, added.indexOf(" ")), start + 1);
      expect(hrp.slice(next).startsWith(added), added).toBe(true);
    }
    expect((await sectionText("hrp", "BidirectionalEvidenceDiscoveryAndTriangulationLoop")))
      .toContain('<Rule name="ConsilienceForPracticalEffectiveness"');
    expect((await sectionText("hrp", "CrowdSourcedAndClinicalSignalAudit")))
      .toContain('<Rule name="ExpectedObservabilityOfRealWorldTrace"');
  });

  it("keeps one study from carrying the claim, counts copies once and classifies discordance", async () => {
    const consilience = rule(await sectionText("hrp", "BidirectionalEvidenceDiscoveryAndTriangulationLoop"),
      "ConsilienceForPracticalEffectiveness");
    expect(consilience).toContain("do not let one study or one evidence family carry the conclusion when materially independent streams are reasonably available");
    expect(consilience).toContain("magnitude with units and uncertainty (EstimandFields/effect_magnitude)");
    expect(consilience).toContain("historical use, as a qualitative prior only");
    expect(consilience).toContain("press releases that repeat one trial are one lineage");
    expect(consilience).toContain("trained versus untrained participants, learning effects on the test, and one sponsor or research group behind most of the studies");
    for (const label of ["convergent (", "promising but discordant (", "isolated (", "contradicted ("]) {
      expect(consilience, label).toContain(label);
    }
    expect(consilience).toContain("never the largest point estimate");
    expect(consilience).toContain("without implying misconduct");
    expect(consilience).toContain("a new, rare, or inaccessible intervention is not penalized for lacking reports");
  });

  it("weighs real-world silence only where the effect should be visible, and never as a trial", async () => {
    const observability = rule(await sectionText("hrp", "CrowdSourcedAndClinicalSignalAudit"),
      "ExpectedObservabilityOfRealWorldTrace");
    expect(observability).toContain("the exact preparation is available, enough people use it, the outcome would be noticeable within ordinary use");
    expect(observability).toContain("search for positive, mixed, critical, and explicit no-effect reports with equal effort");
    expect(observability).toContain("without proving that there is no effect");
    expect(observability).toContain("classify the silence as weak or uninformative");
    expect(observability).toContain("never estimate an effect size or incidence from them");
    // The forum-sample rule points to it, so an "absent" class is not read as evidence on its own.
    expect(rule(await sectionText("hrp", "CrowdSourcedAndClinicalSignalAudit"), "RelativeForumSignal"))
      .toContain("Whether an absent or no-effect sample counts against a claimed benefit is decided by ExpectedObservabilityOfRealWorldTrace.");
  });

  it("extends the existing rules instead of restating them", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(occurrences(hrp, '<Field id="effect_magnitude">')).toBe(1);
    expect(hrp).toMatch(/<Field id="effect_magnitude">[^<]+<\/Field>\n   <Field id="time_horizon">/u);
    expect(squash(hrp)).toContain(
      "Historical evidence does not automatically transport to a modern formulation, diagnosis, dose, route, product, or measured endpoint: a traditional strengthening or nourishing label is not evidence of, for example, a one-repetition-maximum gain.",
    );
    expect(squash(hrp)).toContain("press releases that repeat one trial are one lineage, not independent confirmation.");
    expect(hrp).toContain(
      "When independent evidence streams on a practical effect disagree, rank it by a conservative magnitude, not its largest point estimate (ConsilienceForPracticalEffectiveness).</Rule>",
    );
    expect(squash(hrp)).toContain("also convergent, promising but discordant, isolated, or contradicted (ConsilienceForPracticalEffectiveness).");
    // EvidenceLayers is always loaded, so its addition stays one sentence.
    const { sections } = await loadProtocolSectionSnapshot("hrp");
    expect(sections.find(({ name }) => name === "EvidenceLayers")?.core).toBe(true);
  });

  it("carries the four regression cases and the final check", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    for (const id of [
      "LargeTrialEffectSilentRealWorld",
      "TraditionalStrengthLabelModernEndpoint",
      "UnderexposedProductNoReports",
      "ManyPagesOneTrial",
    ]) {
      expect(occurrences(hrp, `<Case id="${id}">`), id).toBe(1);
    }
    expect(hrp).toMatch(/<Check id="FS212">[^<]+\(ConsilienceForPracticalEffectiveness\)\.<\/Check>/u);
  });

  it("gives Universal the general form, for devices, software and training methods too", async () => {
    const sources = squash(await sectionText("universal", "sources"));
    expect(sources).toContain(
      "For a practical effectiveness claim a recommendation or ranking relies on (a device, software, therapy, supplement, or training method)",
    );
    expect(sources).toContain("Copies of one study count once.");
    expect(sources).toContain("otherwise it is uninformative. Reviews and forums detect discrepancies; they are not trials.");
    const gate = squash(await sectionText("universal", "comparison_integrity_gate"));
    expect(gate).toContain("Never manufacture precision by sorting noise. When independent evidence streams on a practical effect disagree, rank it by a conservative magnitude, not its largest point estimate.");
  });

  it("marks both revisions as candidates for the owner's approval", async () => {
    const [universal, hrp] = await Promise.all([
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
    ]);
    expect(universal).toContain(
      '<revision_history>\n<revision version="20.5.35" priority="Critical">\nCandidate for owner approval (owner rule of 2026-10-06',
    );
    expect(hrp).toContain(
      ' <RevisionHistory>\n  <Revision version="20.6.11" priority="Critical">\n   Candidate for owner approval (owner rule of 2026-10-06',
    );
  });
});
