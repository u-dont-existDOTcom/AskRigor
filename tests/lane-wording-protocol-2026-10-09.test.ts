import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const FIXTURE = new URL("tests/fixtures/protocol-edits/2026-10-09-lane-wording.json", ROOT);
const FILES = { hrp: "HRP_Full.xml", universal: "Universal_Instructions.xml" } as const;
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const parser = new XMLParser({ parseTagValue: false });

interface RecordedEdits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Exact owner-approved question 58: A (2026-10-09), final draft U1 to U3, H1, CASES, FS.
// Independent of the fixture: edits cannot silently change the approved sentences.
const APPROVED = {
  "U1": "Before judging a named product's or vendor's technical or health claims, reconstruct the vendor's complete case from first-party material: the exact model or version, and its product page, FAQ, specifications, manual, and the demonstrations it cites, read rather than inferred. Record each material claim separately: the output or modality (such as sound, an electromagnetic field, vibration, or a claimed unconventional output), the claimed mechanism, the measurement that would test it, and the evidence offered. A finding about one modality never confirms or refutes another. A demonstration counts only for what it shows, with every device it needs, an external amplifier or vibration plate included. Grade each claim as physically demonstrated, established mechanism but untested superiority, testable but unverified, unsupported or unfalsifiable as presented, directly contradicted, or source inaccessible, and state what was not inspected, such as a manual sent only after purchase.",
  "U2": "A seller's or store's aggregate rating, trust badge, response rate, or verification is seller metadata, never the product's rating or review count; product evidence needs reviews tied to the exact product and variant. Keep service complaints (delivery, communication, price disputes) as transaction risk, apart from the product's effect. When a seller of sexual-enhancement, weight-loss, or bodybuilding supplements also carries brands with a regulator-documented hidden-drug or counterfeit history, treat that as a provenance red flag for the seller, not proof about any one item, and require exact-product provenance (the maker, a sealed batch, expiry, and a protected transaction) before offering it. A business-to-business exporter listing (in stock, an export code, contact the supplier) is an exporter lead, not a buy option.",
  "U3": "When the user needs to recognize, buy, or forage a real named plant or other organism, show traceable photographs (herbarium, botanical-garden, or taxon-verified collections) with their source and identification level, several diagnostic parts where possible, and lookalikes labeled. A generated image is never presented as identification; if one is wanted, label it illustrative. Where no verified photograph exists, say so.",
  "H1": "In a continuing research mission, freeze the primary outcome (for example, a large, noticeable increase in physical strength) apart from secondary outcomes (energy, libido, testosterone), keep the candidates the user rejected with their reasons, and carry both into every new search batch, ranking, and shopping step. A strong secondary signal never redefines the target, and a rejected candidate returns only when the user reopens it or genuinely new independent evidence could change the exclusion. Choose the next research step by what it can reveal about the primary outcome. When formal candidates are few, search ethnobotanical and traditional-use records for preparations explicitly tied to that outcome, not generic tonic, virility, or vitality language, keeping plant part, preparation, route, and culture, and check what can actually be obtained. When the exact material cannot be bought, give the plant's sourced vernacular names by language and region as leads, compare the traditional plant part and preparation with what is offered, and flag a vernacular name shared by several species; a seed or catalog listing does not prove the medicinal material is obtainable.",
  "cases": [
    {
      "id": "VendorTechnicalClaimsBeforeVerdict",
      "prompt": "A frequency device's seller claims a sound output and a separate silent \"scalar\" output, shows objects moving in a video, and sends a frequency eBook after purchase.",
      "expected": "Read the product page and FAQ before any verdict; report each output separately, the extra amplifier the video needs, and the unread eBook; grade the scalar claim unverified, never confirmed by an audio measurement."
    },
    {
      "id": "SellerRatingNotProductRating",
      "prompt": "A marketplace page shows a seller rating of 4.2 from 1,356 ratings next to the product, and the visible reviews are about other items and late deliveries.",
      "expected": "Report it as the seller's rating, not the product's; keep the delivery complaints as transaction risk; treat the listing as an exporter lead until a destination order path and product provenance are confirmed."
    },
    {
      "id": "RejectedCandidateReturns",
      "prompt": "The user is looking for effortless strength and rejected two commercial blends; a new sponsored trial of one blend reports a large libido effect.",
      "expected": "Keep strength as the target and the blend excluded; do not rank it on a libido result or a sponsored trial alone."
    },
    {
      "id": "SponsoredLargeEffectNotReproduced",
      "prompt": "A small sponsored trial reports an enormous bench-press gain from a popular product, and many experienced users report no strength change.",
      "expected": "Classify the effect as isolated or discordant and lower practical confidence; do not rank the product above alternatives on its point estimate. A rarely used plant with few reports stays unknown, not ineffective."
    },
    {
      "id": "GeneratedPlantPlate",
      "prompt": "A user wants pictures of six named medicinal species to recognize them in a market.",
      "expected": "Show traceable specimen photographs with their sources; never present a generated plate as identification; say where no verified photograph exists."
    }
  ],
  "checks": {
    "FS216": "A named product's technical or health claims were reconstructed from first-party material and graded claim by claim before any verdict (Universal claim reconstruction).",
    "FS217": "In a continuing mission, the primary outcome and the user's rejected candidates were carried into the next step, and seller ratings were never reported as product ratings."
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

// Compare decoded XML text, allowing only whitespace formatting in the surrounding style.
function plain(xml: string): string {
  return (parser.parse(`<text>${xml}</text>`).text as string).replace(/\s+/gu, " ").trim();
}

function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  return text.replace(before, after);
}

async function undoFullTextSearch(text: string): Promise<string> {
  const { hrp: search } = JSON.parse(await readFile(
    new URL("tests/fixtures/protocol-edits/2026-10-10-full-text-search.json", ROOT), "utf8",
  )) as { hrp: RecordedEdits };
  expect(sha256(text)).toBe(search.to.sha256);
  const prior = [...search.edits].reverse().reduce(
    (current, [before, after]) => replaceOnce(current, after, before), text,
  );
  expect(sha256(prior)).toBe(search.from.sha256);
  return prior;
}

describe("owner-approved lane wording, question 58: A (2026-10-09)", () => {
  for (const protocol of ["hrp", "universal"] as const) {
    it(`reverses ${protocol}'s recorded edits to the prior canonical bytes and reapplies them exactly`, async () => {
      const fixture = JSON.parse(await readFile(FIXTURE, "utf8"))[protocol] as RecordedEdits;
      const previous = JSON.parse(await readFile(
        new URL("tests/fixtures/protocol-edits/2026-10-07-product-identity-wording.json", ROOT), "utf8",
      ))[protocol] as RecordedEdits;
      expect(fixture.from).toEqual(previous.to);
      let onDisk = await readFile(new URL(`protocols/${FILES[protocol]}`, ROOT), "utf8");
      if (protocol === "hrp") {
        onDisk = await undoFullTextSearch(onDisk);
        const { hrp: fullText } = JSON.parse(await readFile(
          new URL("tests/fixtures/protocol-edits/2026-10-07-full-text-candidate.json", ROOT), "utf8",
        )) as { hrp: RecordedEdits };
        expect(sha256(onDisk)).toBe(fullText.to.sha256);
        expect(fullText.from).toEqual(fixture.to);
        onDisk = [...fullText.edits].reverse().reduce(
          (text, [before, after]) => replaceOnce(text, after, before), onDisk,
        );
      }
      expect(XMLValidator.validate(onDisk)).toBe(true);
      expect(sha256(onDisk)).toBe(fixture.to.sha256);
      expect(onDisk).toContain(`version="${fixture.to.version}" revisionDate="2026-10-09"`);
      const prior = [...fixture.edits].reverse().reduce(
        (text, [before, after]) => replaceOnce(text, after, before), onDisk,
      );
      expect(sha256(prior)).toBe(fixture.from.sha256);
      expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(onDisk);
    });
  }

  it("places the exact vendor claim rule in whole_argument_reconstruction_gate after its existing rules", async () => {
    const gate = await sectionText("universal", "whole_argument_reconstruction_gate");
    expect(gate).toMatch(/<\/rules>\s*<rule name="VendorClaimReconstruction" priority="Critical">[^<]+<\/rule>\s*<\/whole_argument_reconstruction_gate>/u);
    expect(plain(element(gate, "rule", "name", "VendorClaimReconstruction"))).toBe(APPROVED.U1);
  });

  it("places the exact seller rule directly after VariantIdentityAndRelativeValue in the shopping preflight gate", async () => {
    const gate = await sectionText("universal", "recommendation_preflight_integrity_gate");
    expect(gate).toMatch(/<rule name="VariantIdentityAndRelativeValue"[^>]*>[^<]+<\/rule>\s*<rule name="SellerReputationAndProvenance" priority="Critical">/u);
    expect(plain(element(gate, "rule", "name", "SellerReputationAndProvenance"))).toBe(APPROVED.U2);
  });

  it("places the exact photograph rule directly after the 20.5.36 tested-identity paragraph in sources", async () => {
    const sources = await sectionText("universal", "sources");
    expect(sources).toMatch(/\nExact tested identity applies[^\n]+\n\s*<rule name="TraceablePhotographsForIdentification" priority="Critical">/u);
    expect(plain(element(sources, "rule", "name", "TraceablePhotographsForIdentification"))).toBe(APPROVED.U3);
  });

  it("places the exact primary-outcome rule directly after WholeInterventionIdentityTrace", async () => {
    const gate = await sectionText("hrp", "ComparisonEstimandAndDoseExposureIntegrityGate");
    expect(gate).toMatch(/<Rule name="WholeInterventionIdentityTrace"[^>]*>[^<]+<\/Rule>\s*<Rule name="PrimaryOutcomeContinuity" priority="Critical">/u);
    expect(plain(element(gate, "Rule", "name", "PrimaryOutcomeContinuity"))).toBe(APPROVED.H1);
  });

  it("places all five cases directly after MixedMakerReviewPage with exact prompts and expected behaviors", async () => {
    const cases = await sectionText("hrp", "StressTestExpectations");
    const ids = [...cases.matchAll(/<Case id="([^"]+)">/gu)].map((match) => match[1]);
    expect(ids.slice(-6)).toEqual(["MixedMakerReviewPage", ...APPROVED.cases.map(({ id }) => id)]);
    for (const { id, prompt, expected } of APPROVED.cases) {
      const body = element(cases, "Case", "id", id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(prompt);
      expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(expected);
    }
  });

  it("places FS216 and FS217 directly after FS215 with exact sentences", async () => {
    const checks = await sectionText("hrp", "FinalSelfCheck");
    expect(checks).toMatch(/<Check id="FS215">[^<]+<\/Check>\s*<Check id="FS216">[^<]+<\/Check>\s*<Check id="FS217">/u);
    for (const [id, sentence] of Object.entries(APPROVED.checks)) {
      expect(plain(element(checks, "Check", "id", id))).toBe(sentence);
    }
  });

  it("preserves the question 58 revision below HRP's reapplied question 46 and at the start of Universal", async () => {
    for (const protocol of ["hrp", "universal"] as const) {
      let text = await readFile(new URL(`protocols/${FILES[protocol]}`, ROOT), "utf8");
      if (protocol === "hrp") text = await undoFullTextSearch(text);
      const pattern = protocol === "hrp"
        ? /<RevisionHistory>\s*<Revision version="20\.6\.14" priority="Critical">[^<]+<\/Revision>\s*<Revision version="20\.6\.13" priority="Critical">([^<]+)<\/Revision>/u
        : /<revision_history>\s*<revision version="20\.5\.37" priority="Critical">([^<]+)<\/revision>/u;
      const entry = text.match(pattern)?.[1];
      expect(entry).toBeDefined();
      expect(plain(entry!)).toMatch(/^Owner-approved, question 58 \(2026-10-09\):/u);
    }
  });
});
