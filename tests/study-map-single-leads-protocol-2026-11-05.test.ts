import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoResponseSpreadHrp, undoStudyMapSingleLeadsHrp, undoWordsAreNotSizesHrp } from "./helpers/undo-read-depth.js";

const FIXTURE = "./fixtures/protocol-edits/2026-11-05-study-map-single-leads-hrp.json";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();

// The wording the owner approved (owner answers 249a, 250a and 251a of 5 November 2026), independent of the edit record.
const APPROVED = {
  studyMap: "When a conclusion combines studies, or rests on something not found or not shown, keep the " +
    "DuplicateAndDataLineageAudit as a small study map in finalize_research's later_inputs.study_map, from what the " +
    "research read. Give each study its identifier, its trial registry number if any, and the group of people behind " +
    "it: where and when they were recruited, how many, and who ran or paid for it. Link a study that shares people " +
    "with, reanalyses, extends or is an abstract of another, and a review to the study it cites as evidence, each with " +
    "the sentence that shows the link. Count groups of people, not papers. Compare a registered trial's paper with its " +
    "registration from before the trial started: outcomes left out, added, or moved between primary and secondary " +
    "without a reason the paper gives. Say in the answer what the map finds. Whether two groups overlap stays your " +
    "judgment.",
  singleLeads: "One report is high-value when it names an option the answer doesn't yet cover, from someone who tried " +
    "it, and the option is cheap and low-risk to try: search the studies for it once before the answer is final. So " +
    "is an option that a study or guideline the research read lists among its interventions. Say what each such " +
    "search found, including when it found nothing.",
  reportQuality: "Beside how many people said an option worked, say how good their reports are: how many gave the " +
    "details ContextExtraction lists, how many measured the change, and how many are bare one-liners. When the only " +
    "plausible way an option works is expectation, such as soap under the pillow, say so, after naming any other way it " +
    "could work, such as its scent.",
  sharedMechanism: "For an option the research finds, name the ways it could work, and search each in studies and in " +
    "people's reports, with the other options that work the same way: for the didgeridoo, the muscle tone of the upper " +
    "airway, which mouth and throat exercises and singing also train, and humming, which raises the nitric oxide in the " +
    "nose. A shared mechanism says what to search next; it never stands in for the option's own results " +
    "(MechanismIsNotOutcome).",
  revision: "Owner answers 249a, 250a and 251a of 5 November 2026, outside the core, which is unchanged: " +
    "StudyMapForCombinedEvidence, after DuplicateAndDataLineageAudit, keeps the studies behind a conclusion that " +
    "combines them as a small map in finalize_research's later_inputs.study_map, counting groups of people, not " +
    "papers; CommunityToFormalHypothesisTransfer counts one report of an option the answer doesn't yet cover, from " +
    "someone who tried it, cheap and low-risk to try, or an option a study or guideline the research read lists among " +
    "its interventions, as high-value: worth one study search; and, after ContextExtraction, ReportQualityBesideCounts " +
    "says how good people's reports are beside how many said an option worked, and SharedMechanismSearch searches each " +
    "way an option could work, in studies and in people's reports, with the options that work the same way.",
} as const;
// CommunityToFormalHypothesisTransfer's last sentence before owner answer 250a.
const COMMUNITY_LAST = "Say in the answer which community leads changed the study search, and what the studies then " +
  "showed about them.";

function element(text: string, name: string): { section: string; body: string } {
  const elements = protocolNamedElements(text, name);
  expect(elements, name).toHaveLength(1);
  const { section, byte_start, byte_end_exclusive } = elements[0]!;
  return { section, body: Buffer.from(text, "utf8").subarray(byte_start, byte_end_exclusive).toString("utf8") };
}
function wrapped(body: string): void {
  for (const line of body.split("\n").slice(1, -1)) {
    expect(line).toMatch(/^ {3}\S/u);
    expect(line.length).toBeLessThanOrEqual(120);
  }
}

describe("owner answers 249a, 250a and 251a: HRP 20.6.40", () => {
  it("says how good people's reports are, and searches each way an option could work, right after ContextExtraction", async () => {
    const text = await loadProtocol("hrp");
    for (const [name, wording] of [["ReportQualityBesideCounts", APPROVED.reportQuality],
      ["SharedMechanismSearch", APPROVED.sharedMechanism]] as const) {
      const rule = element(text, name);
      expect(rule.section).toBe("CrowdSourcedAndClinicalSignalAudit");
      expect(normalize(rule.body)).toBe(`<Rule name="${name}" priority="High"> ${wording} </Rule>`);
      wrapped(rule.body);
      expect(normalize(text).split(wording)).toHaveLength(2);
    }
    const names = [...text.matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);
    const at = names.indexOf("ReportQualityBesideCounts");
    expect(names.slice(at - 1, at + 3)).toEqual([
      "ContextExtraction", "ReportQualityBesideCounts", "SharedMechanismSearch", "DoseUnknownReportsCannotDefineThreshold",
    ]);
  });

  it("keeps the studies behind a combined conclusion as a study map, right after DuplicateAndDataLineageAudit", async () => {
    const text = await loadProtocol("hrp");
    const rule = element(text, "StudyMapForCombinedEvidence");
    expect(rule.section).toBe("ExtendedHumanEvidenceAndGreyLiteratureSweep");
    expect(normalize(rule.body)).toBe(`<Rule name="StudyMapForCombinedEvidence" priority="High"> ${APPROVED.studyMap} </Rule>`);
    wrapped(rule.body);
    expect(normalize(text).split(APPROVED.studyMap)).toHaveLength(2);
    const names = [...text.matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);
    const at = names.indexOf("StudyMapForCombinedEvidence");
    expect(names.slice(at - 1, at + 2)).toEqual([
      "DuplicateAndDataLineageAudit", "StudyMapForCombinedEvidence", "IdenticalResultsAcrossPublications",
    ]);
  });

  it("counts one report of a cheap, low-risk option the answer doesn't yet cover as high-value", async () => {
    const text = await loadProtocol("hrp");
    const rule = element(text, "CommunityToFormalHypothesisTransfer");
    expect(rule.section).toBe("BidirectionalEvidenceDiscoveryAndTriangulationLoop");
    expect(normalize(rule.body).endsWith(`${COMMUNITY_LAST} ${APPROVED.singleLeads} </Rule>`)).toBe(true);
    wrapped(rule.body);
    expect(normalize(text).split(APPROVED.singleLeads)).toHaveLength(2);
  });

  it("leaves every core section byte for byte unchanged", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoStudyMapSingleLeadsHrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const sections = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ name, byte_start, byte_end_exclusive }) => ({
        name, bytes: Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive),
      }));
    expect(sections(text)).toHaveLength(core.size);
    expect(sections(text)).toEqual(sections(prior));
  });

  it("binds 20.6.40's version line and first revision to these bytes, and reverses to 20.6.39's", async () => {
    // HRP 20.6.40 as it was released, from today's bytes (owner answer 282a made 20.6.41).
    const text = await undoWordsAreNotSizesHrp(await loadProtocol("hrp"));
    const { hrp } = JSON.parse(await readFile(new URL(FIXTURE, import.meta.url), "utf8")) as {
      hrp: { from: { version: string; sha256: string }; to: { version: string; sha256: string }; edits: Array<[string, string]> };
    };
    expect(XMLValidator.validate(text)).toBe(true);
    expect(hrp.to.version).toBe("20.6.40");
    expect(hash(text)).toBe(hrp.to.sha256);
    expect(text).toContain(`version="${hrp.to.version}" revisionDate="2026-11-05"`);
    expect([...text.matchAll(/<Revision version="([^"]+)"/gu)].slice(0, 2).map((match) => match[1]))
      .toEqual(["20.6.40", "20.6.39"]);
    const revision = text.match(/<Revision version="20\.6\.40" priority="High">([\s\S]*?)<\/Revision>/u)?.[1] ?? "";
    expect(normalize(revision)).toBe(APPROVED.revision);
    const prior = await undoStudyMapSingleLeadsHrp(text);
    expect(hash(prior)).toBe(hrp.from.sha256);
    expect(hrp.from.version).toBe("20.6.39");
    expect(prior).toContain('version="20.6.39" revisionDate="2026-11-05"');
    expect(prior).not.toContain("StudyMapForCombinedEvidence");
    expect(prior).not.toContain("ReportQualityBesideCounts");
    expect(prior).not.toContain("SharedMechanismSearch");
    expect(normalize(prior)).not.toContain(APPROVED.singleLeads);
    expect(hrp.edits).toHaveLength(5);
    expect(hrp.edits[0]).toEqual(['version="20.6.39" revisionDate="2026-11-05"', 'version="20.6.40" revisionDate="2026-11-05"']);
    expect(hrp.edits.reduce((value, [before, after]) => value.replace(before, () => after), prior)).toBe(text);
    expect(await undoResponseSpreadHrp(text)).toBe(await undoResponseSpreadHrp(prior));
  });
});
