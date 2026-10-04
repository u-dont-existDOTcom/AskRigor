import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

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

/** The module's sentences, one per entry, without headings or the CDATA wrapper. */
function moduleSentences(module: string): string[] {
  return module
    .replace("<shopping_module><![CDATA[", "")
    .replace("]]></shopping_module>", "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-Z“"])/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

const squash = (text: string) => text.replace(/\s+/gu, " ");

// Owner questions 27 to 29, answered 2026-10-03: "27 A but merge/refactor the duplicated logic if possible",
// "28. add only the checks that make sense to add to universal and only the ones needed in HRP, right?" (option A),
// and "29: A". The chain tests undo the recorded edits; these check what the edits put where.
describe("owner protocol changes of 2026-10-03", () => {
  it("adds the owner's shopping module as one loadable section, with each check stated once", async () => {
    const { sections } = await loadProtocolSectionSnapshot("universal");
    const names = sections.map(({ name }) => name);
    const shopping = sections.find(({ name }) => name === "shopping_research")!;
    expect(names.indexOf("shopping_research")).toBe(names.indexOf("recommendation_preflight_integrity_gate") + 1);
    expect(shopping).toMatchObject({ core: false, runtime: true, pages: 1 });
    // The index summary is the activation line, whole: the module alone has no purpose or activation.
    expect(shopping.summary).toBe(
      "Load this section with recommendation_preflight_integrity_gate at the start of any shopping or product task " +
        "(what to buy, compare, price, source, ship or replace): before the first substantive product search, not just " +
        "before the answer.",
    );

    const gate = await sectionText("universal", "recommendation_preflight_integrity_gate");
    expect(gate).toContain("For anything bought, apply shopping_research too");
    // The gate's two product-only rules moved into the module, so neither is stated twice.
    expect(gate).not.toContain('<rule name="ReviewReliabilityInvariant"');
    expect(gate).not.toContain('<rule name="CompatibilityAndActualUse"');
    for (const kept of [
      "IntegratedPreEndorsementGate",
      "PriceValueInvariant",
      "OrderabilityInvariant",
      "VariantIdentityAndRelativeValue",
      "NoRejectedShortlistFiller",
    ]) {
      expect(occurrences(gate, `<rule name="${kept}"`), kept).toBe(1);
    }
  });

  it("keeps every sentence of the owner's v0.2 module, or records where its meaning went", async () => {
    const original = await readFile(new URL("tests/fixtures/shopping-module-v0.2.xml", ROOT), "utf8");
    // The owner's file as sent on 2026-09-30.
    expect(Buffer.byteLength(original, "utf8")).toBe(7_998);
    expect(sha256(original)).toBe("650ff6659d48c2158d7de6c2e104f4516084ae7448bf0b7ebdca372470fb0cb5");
    const shopping = await sectionText("universal", "shopping_research");
    const module = shopping.slice(
      shopping.indexOf("<shopping_module><![CDATA["),
      shopping.indexOf("]]></shopping_module>") + "]]></shopping_module>".length,
    );
    expect(module).toContain("# AskRigor shopping module v0.3");
    const gate = squash(await sectionText("universal", "recommendation_preflight_integrity_gate"));
    const merged = squash(module);

    // Each v0.2 sentence not kept word for word, with what now carries it.
    const recorded: Record<string, readonly string[]> = {
      // Kept, with a pointer to the gate rule that covers the same ground.
      "Never combine favorable variants/offers; check regional differences/silent revisions.": [
        "Never combine favorable variants/offers (the gate's VariantIdentityAndRelativeValue); check regional differences/silent revisions.",
      ],
      "For SCREENED candidates, inspect live stock/order state and purchase path.": [
        "For SCREENED candidates, inspect live stock/order state and purchase path (the gate's OrderabilityInvariant).",
      ],
      "No rejected-bargain baseline, filler or fake scores.": [
        "No rejected-bargain baseline, filler or fake scores (the gate's VariantIdentityAndRelativeValue and NoRejectedShortlistFiller).",
      ],
      // Extended with the gate's reliability rule, which moved here.
      "Record available platform, variant scope, stars and rating versus written-review count; add consequential recency/distribution/incentives.": [
        "Record available platform, exact product/variant scope, stars and rating versus written-review count, and recurring negative themes; add consequential recency/distribution/incentives.",
      ],
      // Extended with the gate's compatibility rule, which moved here.
      "Activate relevant checks only: electrical/protocol/physical fit/support; composition/quantity/expiry; clothing fit/returns; digital renewal/cancellation/export/privacy; import restrictions.": [
        "Activate relevant checks only: electrical (voltage, frequency, plug/grounding, waveform)/protocol/platform/connector/physical fit, dimensions, topology, operating mode, required accessories and support; composition/quantity/expiry; clothing fit/returns; digital renewal/cancellation/export/privacy; import restrictions.",
        "Judge capacity, runtime, throughput, durability and other performance against the user's actual use, not headline figures.",
      ],
    };
    // Stated word for word in the gate's candidate states, which the module's Authority already defers to.
    const inGate = ["Only VERIFIED candidates may become RECOMMENDED."];

    const unkept = moduleSentences(original).filter((sentence) => !merged.includes(squash(sentence)));
    expect(unkept.sort()).toEqual([...Object.keys(recorded), ...inGate].sort());
    for (const [sentence, destinations] of Object.entries(recorded)) {
      for (const destination of destinations) expect(merged, sentence).toContain(destination);
    }
    for (const sentence of inGate) expect(gate).toContain(sentence);
  });

  it("carries the gate's moved reliability and compatibility obligations and the owner's 1 Oct rules", async () => {
    const module = squash(await sectionText("universal", "shopping_research"));
    for (const obligation of [
      // ReviewReliabilityInvariant
      "exact product/variant scope, stars and rating versus written-review count, and recurring negative themes",
      "Separate product/seller/fulfillment ratings.",
      "Sparse ratings are uncertainty, not bad quality; high means do not cancel serious defects.",
      "merely because its nominal specifications or price are attractive",
      // CompatibilityAndActualUse
      "electrical (voltage, frequency, plug/grounding, waveform)/protocol/platform/connector/physical fit, dimensions, topology, operating mode, required accessories",
      "against the user's actual use, not headline figures",
      // 1 Oct: activation and staleness
      "Apply both from the first substantive product search, not only before the answer.",
      "A direct correction or rejection from the user makes the shopping plan stale",
      // 1 Oct: breadth before depth, no premature winner
      "breadth precedes depth: inventory materially distinct viable candidate classes",
      "does not make the first candidate the benchmark",
      "Call nothing a benchmark, finalist, value leader, winner or top pick until the breadth inventory",
      // 1 Oct: Amazon.com default for U.S. goods
      "an exact, materially relevant Amazon.com listing with a meaningful rating history is a default source",
      "Amazon is evidence, not authority",
      // 1 Oct: exact live offer, dead-offer continuation
      "open that exact offer link, follow redirects",
      "Every buy link shown must pass.",
      "first other legitimate sellers/channels for the same product",
      "secondary marketplaces such as eBay/Etsy",
      "An unavailable former favorite is comparison context, never a recommended option or value winner.",
    ]) {
      expect(occurrences(module, obligation), obligation).toBe(1);
    }
    for (const id of ["OpenValueSearchNoAnchoring", "DeadOfferTriggersAlternateSellers"]) {
      expect(module).toContain(`<case id="${id}">`);
    }
  });

  it("adds the claim checks Universal lacked, once each, and extends the existing ones in place", async () => {
    const checks = await sectionText("universal", "point_of_generation_checks");
    for (const name of [
      "Source-report check:",
      "Quotation check:",
      "Absence-claim check:",
      "Field-claim check:",
      "Verification-report check:",
      "Pre-delivery claim check:",
      "Added-fact check:",
      "Consistency check:",
      "Overcorrection check:",
    ]) {
      expect(occurrences(checks, `\n${name}`), name).toBe(1);
    }
    expect(checks).toContain(
      "When the user disputes something already said, recheck the source before agreeing, just as before defending it; " +
        "agreement is not verification.",
    );
    const reconstruction = await sectionText("universal", "whole_argument_reconstruction_gate");
    expect(reconstruction).toContain(
      "14. When reviewing the user's own work, state the strongest reading under which a flagged passage is not a problem",
    );
    // Tracing figures to the primary source was already covered and was not copied (the pack's adoption rule).
    expect(checks).toContain("Trace surprising claims through citation chains to the primary source when possible.");
    expect(checks).not.toContain("Figure-trace check");
  });

  it("adds only the research-answer claim check to HRP, and the experimental check nowhere", async () => {
    const output = await sectionText("hrp", "OutputFormatting");
    expect(occurrences(output, '<Rule name="PreDeliveryResearchClaimCheck" priority="Critical">')).toBe(1);
    expect(output.indexOf("PreDeliveryResearchClaimCheck")).toBeGreaterThan(output.indexOf("NoPrescriptionFormatting"));
    expect(output.indexOf("PreDeliveryResearchClaimCheck")).toBeLessThan(output.indexOf("<ComplexAnswerFooter>"));
    const [hrp, universal] = await Promise.all([
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
    ]);
    for (const text of [hrp, universal]) {
      expect(text).not.toContain("ExperimentalVerdictKeyConditionCheck");
    }
    // HRP takes the other claim checks from the universal instructions, without copies.
    for (const universalOnly of ["Source-report check:", "Quotation check:", "Absence-claim check:", "Field-claim check:"]) {
      expect(hrp).not.toContain(universalOnly);
    }
  });

  it("adds lesson 17's three rules beside their nearest neighbors, with a case and a final check each", async () => {
    const placements = [
      ["CofactorAndMechanismAudit", "MechanismDoesNotUpgradeAssociation", "CouplingBeforeMechanism"],
      ["StatisticalAndClinicalInterpretation", "Heterogeneity", "AverageNullDoesNotRuleOutConditionalEffect"],
      ["CrowdSourcedAndClinicalSignalAudit", "RelativeForumSignal", "DirectionLabelsNeedOutcomeNeutralSelection"],
    ] as const;
    for (const [section, neighbor, rule] of placements) {
      const text = await sectionText("hrp", section);
      expect(occurrences(text, `<Rule name="${rule}" priority="Critical">`), rule).toBe(1);
      expect(text.indexOf(`<Rule name="${rule}"`)).toBeGreaterThan(text.indexOf(`<Rule name="${neighbor}"`));
    }
    const coupling = squash(await sectionText("hrp", "CofactorAndMechanismAudit"));
    for (const test of ["(necessity)", "(specificity)", "(covariation)", "(mediation)", "(common cause)"]) {
      expect(coupling).toContain(test);
    }
    const nulls = squash(await sectionText("hrp", "StatisticalAndClinicalInterpretation"));
    expect(nulls).toContain("say the null leaves that conditional effect untested");
    expect(nulls).toContain("(PostHocModelBecomesTestable), not evidence");
    const forum = squash(await sectionText("hrp", "CrowdSourcedAndClinicalSignalAudit"));
    expect(forum).toContain("how many each search returns reflects its terms, not how experiences are distributed");
    expect(forum).toContain("call the overall direction indeterminate");

    const cases = await sectionText("hrp", "StressTestExpectations");
    for (const id of [
      "CouplingBeforeMechanismExplanation",
      "IntermittentSubtypeDilutionMistakenForNoEffect",
      "OutcomeSearchCountsAreNotDistribution",
    ]) {
      expect(occurrences(cases, `<Case id="${id}">`), id).toBe(1);
    }
    const checks = await sectionText("hrp", "FinalSelfCheck");
    for (const [id, rule] of [
      ["FS207", "CouplingBeforeMechanism"],
      ["FS208", "AverageNullDoesNotRuleOutConditionalEffect"],
      ["FS209", "DirectionLabelsNeedOutcomeNeutralSelection"],
    ] as const) {
      expect(checks).toMatch(new RegExp(`<Check id="${id}">[^<]*\\(${rule}\\)\\.</Check>`, "u"));
    }
  });

  it("records both releases at the top of their revision histories", async () => {
    const [hrp, universal] = await Promise.all([
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
      readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8"),
    ]);
    // Universal 20.5.35 (the PTI candidate, 2026-10-04) is the one entry above it.
    const newestUniversal = /^<revision_history>\n<revision version="20\.5\.35" priority="Critical">\n[^<]*<\/revision>\n/mu;
    expect(universal.match(newestUniversal)?.[0]).toBeDefined();
    expect(universal).toContain(
      `${universal.match(newestUniversal)?.[0]}<revision version="20.5.34" priority="Critical">\nOwner-approved changes (owner questions 27 and 28, 2026-10-03).`,
    );
    // HRP 20.6.11 (the PTI candidate) and 20.6.10 (owner question 30, the same day) are the two entries above it.
    const newest = /^ <RevisionHistory>\n  <Revision version="20\.6\.11" priority="Critical">\n[^<]*  <\/Revision>\n  <Revision version="20\.6\.10" priority="Critical">\n[^<]*  <\/Revision>\n/mu;
    expect(hrp.match(newest)?.[0]).toBeDefined();
    expect(hrp).toContain(
      `${hrp.match(newest)?.[0]}  <Revision version="20.6.9" priority="Critical">\n   Owner-approved method changes (owner questions 28 and 29, 2026-10-03).`,
    );
  });
});
