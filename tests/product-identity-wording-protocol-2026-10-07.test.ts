import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const FIXTURE = new URL("tests/fixtures/protocol-edits/2026-10-07-product-identity-wording.json", ROOT);
const FILES = { hrp: "HRP_Full.xml", universal: "Universal_Instructions.xml" } as const;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const squash = (text: string) => text.replace(/\s+/gu, " ").trim();
const parser = new XMLParser({ parseTagValue: false });

interface RecordedEdits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Exact owner-approved wording, question 50: A (2026-10-07), draft sections F to K.
// Kept here independently of the edit fixture so a fixture change cannot silently change the approved sentences.
const APPROVED = {
  "F": "State exactly what each key study tested: the formulation, dose, route, and any co-administered drug, such as L-DOPA given with carbidopa. When a study of a multi-ingredient, coded, or branded intervention reports a large or surprising practical effect, make the exact tested intervention its own candidate before ranking its ingredients. Trace its study label to its registry code or name, its sponsor or maker, its formulation, and any current commercial product, and record material differences between the tested and the sold versions. Keep the exact formulation as its own evidence object and its ingredients' evidence separate (CompositeInterventionAttribution); no ingredient is credited with the formula's effect. If the identity cannot be traced, say so, and do not present the formula as something to buy.",
  "G": "Check product identity item by item, not by container: a video, page, or thread about the product admits only the reports that are about it. A report naming another maker or variant joins that variant's labeled cohort, and a report on a page that pools several makers without naming its own stays unresolved, never attributed to the page's maker. Fuzzy name matches, sibling products of the same brand, and look-alike names are other products.",
  "J": "Orderable means orderable for the user's destination. When the user buys outside a product's home market, a buy option needs a verified route to that destination (the seller ships there, or a named international storefront, marketplace, exporter, or specialist seller sells there) and a live offer for the exact variant. A domestic-only seller can support identity, label, reviews, or price, but is not presented as a place to buy. When the domestic path fails, continue through international storefronts, marketplaces, exporters, and specialist sellers before reporting a bounded no-result.",
  "K": "Exact tested identity applies to any study, test, or benchmark an answer relies on, whatever was tested: a therapy, supplement, device, software, program, or method. State exactly what was tested: its version, formulation, or configuration; its dose, setting, or intensity; how it was used; and anything used alongside it. When a source reports a large or surprising effect for a bundle (a multi-ingredient product, a multi-component program, a kit, or a software stack), make the exact tested bundle its own candidate before crediting or ranking its parts, and trace it to what is available now, noting material differences between the tested and current versions. Never move a bundle's result to one of its parts, or one version's result to another, without evidence for that transfer. If the tested identity cannot be traced to something available now, say so, and do not present it as something to buy or adopt.",
  "cases": [
    {
      "id": "CodedFormulaLargeEffect",
      "prompt": "A randomized trial of a coded eight-herb formula reports a large effect on testosterone and sexual function; each herb is also sold alone.",
      "expected": "Trace the formula to its registry code, sponsor, formulation, and current commercial product before ranking the herbs; keep its evidence separate from each herb's; credit no single herb with its effect."
    },
    {
      "id": "LookAlikeProductVideos",
      "prompt": "A video search for a named herbal product returns a sibling product from the same brand and an unrelated face wash with a similar name.",
      "expected": "Admit only videos that name the exact product; the sibling and the face wash never enter its community corpus."
    },
    {
      "id": "MixedMakerReviewPage",
      "prompt": "A review page for one manufacturer's version of a generic formula includes a review naming another manufacturer's version.",
      "expected": "Count that review in the other manufacturer's labeled cohort, and keep reviews that name no manufacturer unresolved rather than attributing them to the page's manufacturer."
    }
  ],
  "checks": {
    "FS214": "Each key study's exact tested intervention, including any co-administered drug, was stated, and a multi-ingredient or coded intervention with a large practical effect was traced to its tested and current identity before its ingredients were ranked (WholeInterventionIdentityTrace).",
    "FS215": "Community reports about a product were admitted item by item for the exact product, with other variants and unresolved reports kept apart (ScopeAxesBeforeSampling)."
  }
} as const;

async function sectionText(protocol: keyof typeof FILES, name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot(protocol);
  const matches = sections.filter((section) => section.name === name);
  expect(matches, name).toHaveLength(1);
  const [section] = matches;
  return Buffer.from(text, "utf8").subarray(section!.byte_start, section!.byte_end_exclusive).toString("utf8");
}

function element(text: string, tag: string, attribute: string, value: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attribute}="${value}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, value).toHaveLength(1);
  return matches[0]![1]!;
}

// Compare decoded XML text, allowing only the surrounding protocol's whitespace formatting.
function plain(xml: string): string {
  return squash(parser.parse(`<text>${xml}</text>`).text as string);
}

function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  return text.replace(before, after);
}

describe("owner-approved product identity wording of 2026-10-07", () => {
  for (const protocol of ["hrp", "universal"] as const) {
    it(`reverses ${protocol}'s recorded edits to the prior canonical bytes and reapplies them exactly`, async () => {
      const fixture = JSON.parse(await readFile(FIXTURE, "utf8"))[protocol] as RecordedEdits;
      const previous = JSON.parse(await readFile(
        new URL("tests/fixtures/protocol-edits/2026-10-06-consilience-candidate.json", ROOT), "utf8",
      ))[protocol] as RecordedEdits;
      expect(fixture.from).toEqual(previous.to);
      const onDisk = await readFile(new URL(`protocols/${FILES[protocol]}`, ROOT), "utf8");
      expect(XMLValidator.validate(onDisk)).toBe(true);
      expect(sha256(onDisk)).toBe(fixture.to.sha256);
      expect(onDisk).toContain(`version="${fixture.to.version}" revisionDate="2026-10-07"`);
      const prior = [...fixture.edits].reverse().reduce(
        (text, [before, after]) => replaceOnce(text, after, before), onDisk,
      );
      expect(sha256(prior)).toBe(fixture.from.sha256);
      expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(onDisk);
    });
  }

  it("places the exact whole-intervention rule immediately after CompositeInterventionAttribution", async () => {
    const gate = await sectionText("hrp", "ComparisonEstimandAndDoseExposureIntegrityGate");
    expect(gate).toMatch(
      /<Rule name="CompositeInterventionAttribution"[^>]*>[^<]+<\/Rule>\s*<Rule name="WholeInterventionIdentityTrace" priority="Critical">/u,
    );
    expect(plain(element(gate, "Rule", "name", "WholeInterventionIdentityTrace"))).toBe(APPROVED.F);
  });

  it("appends the exact item-by-item identity paragraph after the proxy-cohort paragraph", async () => {
    const scope = element(await sectionText("hrp", "CrowdSourcedAndClinicalSignalAudit"),
      "Rule", "name", "ScopeAxesBeforeSampling");
    const anchor = "in a proxy cohort.";
    expect(scope.split(anchor)).toHaveLength(2);
    expect(plain(scope.slice(scope.indexOf(anchor) + anchor.length))).toBe(APPROVED.G);
  });

  it("places all three cases after ManyPagesOneTrial, with the exact prompts and expected behaviors", async () => {
    const cases = await sectionText("hrp", "StressTestExpectations");
    const ids = [...cases.matchAll(/<Case id="([^"]+)">/gu)].map((match) => match[1]);
    expect(ids.slice(-4)).toEqual(["ManyPagesOneTrial", ...APPROVED.cases.map(({ id }) => id)]);
    for (const { id, prompt, expected } of APPROVED.cases) {
      const body = element(cases, "Case", "id", id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(prompt);
      expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(expected);
    }
  });

  it("places FS214 and FS215 directly after FS212, preserving their exact sentences", async () => {
    const checks = await sectionText("hrp", "FinalSelfCheck");
    expect(checks).toMatch(/<Check id="FS212">[^<]+<\/Check>\s*<Check id="FS214">[^<]+<\/Check>\s*<Check id="FS215">/u);
    for (const [id, sentence] of Object.entries(APPROVED.checks)) {
      expect(plain(element(checks, "Check", "id", id))).toBe(sentence);
    }
  });

  it("appends the exact destination-orderability wording to OrderabilityInvariant", async () => {
    const rule = element(await sectionText("universal", "recommendation_preflight_integrity_gate"),
      "rule", "name", "OrderabilityInvariant");
    const anchor = "an unresolved state remains UNKNOWN.";
    expect(rule.split(anchor)).toHaveLength(2);
    expect(plain(rule.slice(rule.indexOf(anchor) + anchor.length))).toBe(APPROVED.J);
  });

  it("places the exact general tested-identity paragraph after the consilience paragraph in sources", async () => {
    const sources = await sectionText("universal", "sources");
    const anchor = "isolated, or contradicted.";
    expect(sources.split(anchor)).toHaveLength(2);
    const addition = sources.slice(sources.indexOf(anchor) + anchor.length).trimStart().split(/\n\s*\n/u)[0]!;
    expect(plain(addition)).toBe(APPROVED.K);
  });

  it("starts both revision histories with the owner-approved question 50 entry", async () => {
    for (const protocol of ["hrp", "universal"] as const) {
      const text = await readFile(new URL(`protocols/${FILES[protocol]}`, ROOT), "utf8");
      const pattern = protocol === "hrp"
        ? /<RevisionHistory>\s*<Revision version="20\.6\.12" priority="Critical">([^<]+)<\/Revision>/u
        : /<revision_history>\s*<revision version="20\.5\.36" priority="Critical">([^<]+)<\/revision>/u;
      const entry = text.match(pattern)?.[1];
      expect(entry).toBeDefined();
      expect(plain(entry!)).toMatch(/^Owner-approved, question 50 \(2026-10-07\):/u);
    }
  });
});
