import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

const universal = readFileSync(
  resolve(process.cwd(), "protocols/Universal_Instructions.xml"),
  "utf8",
);
const hrp = readFileSync(resolve(process.cwd(), "protocols/HRP_Full.xml"), "utf8");

const normalize = (text: string): string => text.replace(/\s+/gu, " ");
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const occurrences = (text: string, needle: string): number => text.split(needle).length - 1;

function section(text: string, open: string, close: string): string {
  const start = text.indexOf(open);
  const end = text.indexOf(close, start);
  expect(start, `missing ${open}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${close}`).toBeGreaterThan(start);
  return text.slice(start, end + close.length);
}

// Anchor phrases for the claim-integrity checks (pack IDs CI-01 to CI-11, CI-X1).
// Each added anchor must appear exactly once, inside the section that owns it.
const POINT_OF_GENERATION_ANCHORS: Record<string, string> = {
  "CI-01 source reports rest on a passage checked at the point of use":
    "must rest on a passage checked when the sentence is written, including a text read earlier in the conversation",
  "CI-02 quotation marks hold only exact words":
    "Mark translations as translations, do not join words from separate sentences inside one quotation",
  "CI-03 absence claims cover only what was searched":
    "search all of it for counterexamples. The claim covers only what was searched",
  "CI-04 claims about a field or classification are factual claims":
    "When the user has stated expertise in the area, find a source before contradicting their usage.",
  "CI-06 verification language names the comparison and the source":
    "must name what was compared with which source or version; when only part was checked, name the part",
  "CI-07 recheck the source before conceding, as before defending":
    "recheck the source before agreeing, just as before defending it; agreement is not verification",
  "CI-08 facts added to publishable text are checked when added":
    "check it against its source at that moment, even if it was checked earlier",
  "CI-10 an answer is compared with earlier answers on the same topic":
    "compare the answer with what was already said on the same topic earlier in the conversation",
};

const OWN_WORK_REVIEW_ANCHOR =
  "Once the user rejects a flag, drop it; do not bring it back as a warning about readers unless new evidence appears.";

// CI-05 was already covered by the existing sources rule; pin it so coverage cannot silently disappear.
const EXISTING_CITATION_CHAIN_ANCHOR =
  "Check whether their references support the exact claims, whether citation chains have drifted";

const HRP_DUPLICATE_DATA_LINEAGE_ANCHOR =
  "Count the underlying people or datasets rather than the number of documents";

const HRP_DUPLICATE_DATA_LINEAGE_RULE_OPEN =
  '<Rule name="DuplicateAndDataLineageAudit" priority="Critical">';

const UNIVERSAL_PRE_DELIVERY_ANCHOR =
  "If the runtime can start a separate checker, such as a subagent or a fresh context";

const HRP_PRE_DELIVERY_ANCHOR =
  "If the runtime can start a separate checker, such as a subagent or a fresh context";

const HRP_PRE_DELIVERY_RULE_OPEN =
  '<Rule name="PreDeliveryResearchClaimCheck" priority="Critical">';

const VERDICT_CHECK_ANCHOR =
  "When the pre-delivery claim check runs a separate checker, give it only the verdict sentences, without the analysis around them, and have it name the outcome measure, population, comparison, scope, and source each one is about";

const VERDICT_RULE_OPEN = '<Rule name="ExperimentalVerdictKeyConditionCheck" priority="Medium">';

describe("claim-integrity checks in the canonical protocols", () => {
  it("advances Universal to 20.5.27 and HRP to 20.5.30 as valid XML with newest-first revisions", () => {
    expect(XMLValidator.validate(universal)).toBe(true);
    expect(XMLValidator.validate(hrp)).toBe(true);
    expect(universal).toContain('version="20.5.27" revisionDate="2026-09-27"');
    expect(hrp).toContain('version="20.5.30" revisionDate="2026-09-27"');
    expect(universal).toContain(
      '<revision_history>\n<revision version="20.5.27" priority="Critical">',
    );
    expect(occurrences(universal, '<revision version="20.5.27"')).toBe(1);
    expect(hrp).toContain(' <RevisionHistory>\n  <Revision version="20.5.30" priority="High">');
    expect(occurrences(hrp, '<Revision version="20.5.30"')).toBe(1);
  });

  it.each(Object.entries(POINT_OF_GENERATION_ANCHORS))(
    "adds %s to the point-of-generation checks",
    (_label, anchor) => {
      const checks = section(universal, "<point_of_generation_checks>", "</point_of_generation_checks>");
      expect(occurrences(universal, anchor)).toBe(1);
      expect(checks).toContain(anchor);
    },
  );

  it("extends the existing overcorrection check instead of adding a second copy", () => {
    expect(occurrences(universal, "Overcorrection check:")).toBe(1);
    expect(universal).toContain(
      "An inverse error is still an error. When the user disputes something already said, recheck the source before agreeing",
    );
  });

  it("adds CI-09 own-work review to the whole-argument reconstruction gate", () => {
    const gate = section(
      universal,
      '<whole_argument_reconstruction_gate priority="Critical">',
      "</whole_argument_reconstruction_gate>",
    );
    expect(occurrences(universal, OWN_WORK_REVIEW_ANCHOR)).toBe(1);
    for (const required of [
      OWN_WORK_REVIEW_ANCHOR,
      "state the strongest reading under which a flagged passage is not a problem",
      "When a flag depends on what the user meant, ask.",
      "only when both cannot be true under any reasonable reading",
      "Keep verified problems separate from suggestions that depend on a reading.",
      "There is no minimum number of findings.",
    ]) {
      expect(gate).toContain(required);
    }
  });

  it("keeps the existing Universal and HRP rules that cover CI-05", () => {
    const sources = section(universal, "<sources>", "</sources>");
    const lineageRule = normalize(section(hrp, HRP_DUPLICATE_DATA_LINEAGE_RULE_OPEN, "</Rule>"));
    expect(sources).toContain(EXISTING_CITATION_CHAIN_ANCHOR);
    expect(lineageRule).toContain(HRP_DUPLICATE_DATA_LINEAGE_ANCHOR);
  });

  it("adds the CI-11 conditional separate-checker path and fallback to both runtime surfaces", () => {
    const checks = normalize(
      section(universal, "<point_of_generation_checks>", "</point_of_generation_checks>"),
    );
    expect(occurrences(universal, UNIVERSAL_PRE_DELIVERY_ANCHOR)).toBe(1);
    for (const required of [
      UNIVERSAL_PRE_DELIVERY_ANCHOR,
      "final critique of a text",
      "review of the user's own work that they will act on",
      "verification report",
      "text the user will publish",
      "but not the drafting reasoning",
      "a budget of one fetch per source and a cap on tool calls",
      "pass or fail each claim with a reason and add any claim the list missed",
      "Otherwise check each entry against its source just before delivery and do not describe the result as independently checked.",
      "Either way, fix every failure before delivery.",
      "Ask the user about a claim that depends on what they meant.",
      "Do not run this check for companion or therapeutic replies.",
    ]) {
      expect(checks).toContain(required);
    }

    const hrpRule = normalize(section(hrp, HRP_PRE_DELIVERY_RULE_OPEN, "</Rule>"));
    const output = normalize(section(hrp, '<OutputFormatting priority="High">', "</OutputFormatting>"));
    expect(occurrences(hrp, HRP_PRE_DELIVERY_RULE_OPEN)).toBe(1);
    expect(occurrences(normalize(hrp), HRP_PRE_DELIVERY_ANCHOR)).toBe(1);
    expect(output).toContain(hrpRule);
    for (const required of [
      HRP_PRE_DELIVERY_ANCHOR,
      "final research verdict, finding, or evidence summary",
      "but not the drafting reasoning",
      "a budget of one fetch per source and a cap on tool calls",
      "pass or fail each claim with a reason and add any claim the list missed",
      "Otherwise check each entry against its source just before delivery and do not call the result independently checked.",
      "Either way, fix every failure before delivery.",
      "Ask the user about a claim that depends on what they meant.",
      "Do not run this check for companion or therapeutic replies.",
    ]) {
      expect(hrpRule).toContain(required);
    }
  });

  it("adds the CI-X1 verdict self-check to HRP output formatting as experimental and nonblocking", () => {
    expect(occurrences(hrp, VERDICT_RULE_OPEN)).toBe(1);
    const output = normalize(section(hrp, '<OutputFormatting priority="High">', "</OutputFormatting>"));
    const rule = normalize(section(hrp, VERDICT_RULE_OPEN, "</Rule>"));
    expect(output).toContain(rule);
    for (const required of [
      "Experimental.",
      VERDICT_CHECK_ANCHOR,
      "otherwise read each verdict sentence alone yourself, name them, and do not call the result independent.",
      "Judge the named conditions by meaning, not wording.",
      "different measure, population, or scope than the evidence addressed",
      "rewrite it so that it names them",
      "this check never blocks delivery",
      "It does not apply to conversational replies.",
      "Do not show the check in the answer",
      "log a different but compatible naming separately from a mismatch.",
    ]) {
      expect(rule).toContain(required);
    }
    expect(universal).not.toContain("ExperimentalVerdictKeyConditionCheck");
  });

  it("keeps the added runtime text self-contained", () => {
    const added = [
      universal.match(/<revision version="20\.5\.27" priority="Critical">[\s\S]*?<\/revision>/u)?.[0],
      universal.match(/Source-report check:[\s\S]*?\nUniversal-claim check:/u)?.[0],
      universal.match(/Added-fact check:[^\n]*/u)?.[0],
      universal.match(/ When the user disputes something already said,[^\n]*/u)?.[0],
      universal.match(/Consistency check:[^\n]*/u)?.[0],
      universal.match(/Pre-delivery claim check:[^\n]*/u)?.[0],
      universal.match(/14\. When reviewing the user's own work,[^\n]*/u)?.[0],
      hrp.match(/<Revision version="20\.5\.30" priority="High">[\s\S]*?<\/Revision>/u)?.[0],
      section(hrp, HRP_PRE_DELIVERY_RULE_OPEN, "</Rule>"),
      section(hrp, VERDICT_RULE_OPEN, "</Rule>"),
    ];
    for (const text of added) {
      expect(text).toBeDefined();
      for (const forbidden of [
        "universal-dev-architecture",
        "u-dont-existDOTcom",
        "DEVELOPMENT_INHERITANCE",
        "UDA",
        "CI-0",
        "CI-X1",
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });

  it("changes nothing else in HRP", () => {
    const prior = hrp
      .replace('version="20.5.30" revisionDate="2026-09-27"', 'version="20.5.29" revisionDate="2026-09-12"')
      .replace(/ {2}<Revision version="20\.5\.30" priority="High">[\s\S]*?<\/Revision>\n\n/u, "")
      .replace(/\n {2}<Rule name="PreDeliveryResearchClaimCheck" priority="Critical">[\s\S]*?<\/Rule>\n/u, "")
      .replace(/\n {2}<Rule name="ExperimentalVerdictKeyConditionCheck" priority="Medium">[\s\S]*?<\/Rule>\n/u, "");
    expect(sha256(prior)).toBe("254759df38934c28b06709dace9fcb266fc9967913be1296de99a461be596816");
  });
});
