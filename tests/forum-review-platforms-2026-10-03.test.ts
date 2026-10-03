import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

import { REVIEW_SELECTIONS } from "../apps/research-mcp/src/research-finalization-gate.js";

const ROOT = new URL("../", import.meta.url);

async function sectionText(name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot("hrp");
  const matches = sections.filter((section) => section.name === name);
  expect(matches, name).toHaveLength(1);
  const [section] = matches;
  return Buffer.from(text, "utf8").subarray(section!.byte_start, section!.byte_end_exclusive).toString("utf8");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const squash = (text: string) => text.replace(/\s+/gu, " ");

const ruleBody = (text: string, rule: string) =>
  text.match(new RegExp(`\\n  <Rule name="${rule}" priority="Critical">[\\s\\S]*?</Rule>\\n`, "u"))?.[0];

// Owner question 30 (2026-10-03): the owner's pasted forum review-platform repair. The chain tests undo the
// recorded edits to HRP 20.6.9's bytes; these check what the edits put where, and what they leave alone.
describe("HRP 20.6.10: product reviews as community evidence", () => {
  it("maps review platforms and separates the product from its ingredient before sampling", async () => {
    const forum = squash(await sectionText("CrowdSourcedAndClinicalSignalAudit"));
    expect(forum).toContain("also map where its buyers review that exact product or service");
    expect(forum).toContain("A large relevant review corpus is a principal community.");
    expect(forum).toContain(
      "keep the exact product (brand, formulation, and variant) and its ingredient as separate cohorts and search each",
    );
    expect(forum).toContain("Check the product's actual label for what it contains and how much.");
    expect(forum).toContain("On review platforms, search the review text the same way");
  });

  it("adds the two new rules directly after their neighbors, once each", async () => {
    const forum = await sectionText("CrowdSourcedAndClinicalSignalAudit");
    for (const [neighbor, rule] of [
      ["SnippetAndPartialAccessTier", "ReviewCorpusSelectionAndCounts"],
      ["NoForumSignalByProxy", "CaregiverObservedCohort"],
    ] as const) {
      expect(occurrences(forum, `<Rule name="${rule}" priority="Critical">`), rule).toBe(1);
      const next = forum.indexOf("<Rule name=", forum.indexOf(`<Rule name="${neighbor}"`) + 1);
      expect(forum.slice(next).startsWith(`<Rule name="${rule}"`), rule).toBe(true);
    }
    const text = squash(forum);
    expect(text).toContain("they show which experiences exist, not how common each is");
    expect(text).toContain("(DirectionLabelsNeedOutcomeNeutralSelection). From any other set, report the directions");
    expect(text).toContain("One review shows that an experience exists, never how often it occurs.");
    expect(text).toContain(
      "A carer's direct observation of a dependent is not a secondhand story; it goes to CaregiverObservedCohort.",
    );
    expect(text).toContain("never pooled with self-reports");
  });

  it("keeps reviewer identity out of answers and names no acquisition provider", async () => {
    const [hrp, module] = await Promise.all([
      readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8"),
      readFile(new URL("project/FORUM_SIGNAL_MODULE.md", ROOT), "utf8"),
    ]);
    expect(squash(ruleBody(hrp, "UniqueFirsthandUnit") ?? "")).toContain(
      "use reviewer names, handles, and identifiers only for that matching, and never report or save them.",
    );
    expect(squash(ruleBody(hrp, "ClosedPlatformAndAccessDisclosure") ?? "")).toContain(
      "use an authorized structured route to the reviews when one is available",
    );
    for (const text of [hrp, module]) {
      expect(text).not.toMatch(/bright\s*data/iu);
    }
  });

  it("leaves the independence and attribution rules exactly as they were", async () => {
    const hrp = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const { edits } = JSON.parse(
      await readFile(new URL("tests/fixtures/protocol-edits/2026-10-03-forum-review-platforms.json", ROOT), "utf8"),
    ).hrp as { edits: Array<[string, string]> };
    const hrp2069 = [...edits].reverse().reduce((text, [prior, later]) => text.replace(later, prior), hrp);
    for (const rule of [
      "MultipleIndependentCommunities",
      "SignalPrevalenceAndCausalAttributionAreSeparate",
      "ForumSignalDoesNotOverrideDirectEvidenceAutomatically",
      "NoPopulationRateFromForumSample",
    ]) {
      expect(ruleBody(hrp, rule), rule).toBeDefined();
      expect(ruleBody(hrp, rule), rule).toBe(ruleBody(hrp2069, rule));
    }
  });

  it("adds two stress cases and final checks FS210 and FS211", async () => {
    const cases = await sectionText("StressTestExpectations");
    for (const id of ["ProductReviewCorpusForSupplementQuestion", "ParentReviewOfChildOutcome"]) {
      expect(occurrences(cases, `<Case id="${id}">`), id).toBe(1);
    }
    const checks = await sectionText("FinalSelfCheck");
    for (const [id, rule] of [
      ["FS210", "ReviewCorpusSelectionAndCounts"],
      ["FS211", "CaregiverObservedCohort"],
    ] as const) {
      expect(checks).toMatch(new RegExp(`<Check id="${id}">[^<]*\\(${rule}\\)\\.</Check>`, "u"));
    }
  });

  it("gives the Forum Signal Module a review lane and a receipt with the final check's selections", async () => {
    const module = await readFile(new URL("project/FORUM_SIGNAL_MODULE.md", ROOT), "utf8");
    expect(module).toContain("people buy, also map the platforms where buyers review that exact product");
    expect(module).toContain("11. For each product-review platform, search the exact product and its ingredient");
    const receipt = module.match(/^ {2}review_platforms: .*$/mu)?.[0];
    expect(receipt).toBeDefined();
    expect(receipt).toContain(`selection: ${REVIEW_SELECTIONS.join(" | ")};`);
    expect(receipt).toContain("self-reported and caregiver-observed counts");
  });
});
