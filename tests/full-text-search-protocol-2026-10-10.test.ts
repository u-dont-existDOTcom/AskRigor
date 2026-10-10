import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const FIXTURE = new URL("tests/fixtures/protocol-edits/2026-10-10-full-text-search.json", ROOT);
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const parser = new XMLParser({ parseTagValue: false });

interface RecordedEdits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the fixture: exact owner-approved question 65: A (2026-10-10).
const APPROVED = {
  revision: "Owner-approved, question 65 (2026-10-10): added FullTextSearchTriggers, which searches full texts when the answer may sit only there and states the coverage searched, with stress case HarmOnlyInTables and final check FS218.",
  rule: "Abstracts report a study's main question. Also search full texts when the answer may sit only there: harms and adverse events; co-interventions, background or rescue treatment, and the comparator's exact makeup; an exact product, formulation, dose or schedule; secondary outcomes and unhighlighted null results; funding and competing interests; details given only in case narratives; and when an abstract search returns few studies or a record has no abstract. Use section searches (methods, results, tables, funding, case reports) where the index offers them. A full-text hit is a lead until the passage is read in the acquired paper, and a match in an introduction or reference list is not a finding. State the coverage searched: a full-text index holds only part of the literature, so finding nothing there does not show that nothing was reported.",
  prompt: "A user asks whether a supplement causes insomnia, and abstract searches find no trial that studied sleep.",
  expected: "Search trial full texts for insomnia among adverse events (results and tables), read each passage found, and report the coverage searched; do not conclude there is no harm from abstracts alone.",
  check: "Where the answer could sit only in full texts (harms, co-interventions, exact products or doses, secondary results, funding, case details), a full-text search was run and its coverage stated, or the final check records why none was needed.",
} as const;

async function sectionText(name: string): Promise<string> {
  const { text, sections } = await loadProtocolSectionSnapshot("hrp");
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

// Decode XML and allow only formatting whitespace to differ from the approved copy.
function plain(xml: string): string {
  return (parser.parse(`<text>${xml}</text>`).text as string).replace(/\s+/gu, " ").trim();
}

function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}

describe("owner-approved full-text search triggers, question 65: A (2026-10-10)", () => {
  it("chains reversible edits to 20.6.14 and derives the current manifests from unchanged canonical bytes", async () => {
    const recorded = JSON.parse(await readFile(FIXTURE, "utf8")) as { purpose: string; hrp: RecordedEdits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp;
    const { hrp: previous } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-07-full-text-candidate.json", ROOT), "utf8",
    )) as { hrp: RecordedEdits };
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({
      version: "20.6.14", sha256: "c5f544d0ad666970f122ecd14dbbca25befd2b53c7f2078275fdb3026bab70f1",
    });
    expect(fixture.to.version).toBe("20.6.15");
    expect(fixture.edits).toHaveLength(5);
    const onDisk = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    expect(XMLValidator.validate(onDisk)).toBe(true);
    expect(sha256(onDisk)).toBe(fixture.to.sha256);
    expect(onDisk).toContain('<Protocol name="HRP" version="20.6.15" revisionDate="2026-10-10"');
    const prior = [...fixture.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), onDisk,
    );
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(sha256(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.14" revisionDate="2026-10-09"');
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(onDisk);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.15", revisionDate: "2026-10-10", sha256: sha256(onDisk),
    });
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.37", revisionDate: "2026-10-09",
      sha256: "342e32e1568954ed62a8b53d75d1ad0efe39cba8d9ad7d143658f02dded169bb",
    });
  });

  it("places the exact rule directly after DecisionCriticalFullTextEscalationWithinSweep", async () => {
    const sweep = await sectionText("ExtendedHumanEvidenceAndGreyLiteratureSweep");
    expect(sweep).toMatch(/<Rule name="DecisionCriticalFullTextEscalationWithinSweep">[^<]+<\/Rule>\n\n  <Rule name="FullTextSearchTriggers" priority="Critical">/u);
    const body = element(sweep, "Rule", "name", "FullTextSearchTriggers");
    expect(plain(body)).toBe(APPROVED.rule);
    expect(sweep).toMatch(/<Rule name="FullTextSearchTriggers" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="NoHumanEvidenceAbsenceClaimBeforeSweep">/u);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });

  it("places HarmOnlyInTables directly after FullTextChangesTheArm with exact sentences", async () => {
    const cases = await sectionText("StressTestExpectations");
    const ids = [...cases.matchAll(/<Case id="([^"]+)">/gu)].map((match) => match[1]);
    expect(ids.indexOf("FullTextChangesTheArm")).toBeGreaterThanOrEqual(0);
    expect(ids[ids.indexOf("FullTextChangesTheArm") + 1]).toBe("HarmOnlyInTables");
    const body = element(cases, "Case", "id", "HarmOnlyInTables");
    expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
    expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(APPROVED.prompt);
    expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(APPROVED.expected);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });

  it("places the exact single-line FS218 directly after FS217", async () => {
    const checks = await sectionText("FinalSelfCheck");
    expect(checks).toMatch(/<Check id="FS217">[^\n<]+<\/Check>\n  <Check id="FS218">[^\n<]+<\/Check>/u);
    expect(plain(element(checks, "Check", "id", "FS218"))).toBe(APPROVED.check);
  });

  it("starts RevisionHistory with the exact question 65 entry directly above 20.6.14", async () => {
    const history = await sectionText("RevisionHistory");
    expect(history).toMatch(/^<RevisionHistory>\s*<Revision version="20\.6\.15" priority="Critical">[^<]+<\/Revision>\s*<Revision version="20\.6\.14" priority="Critical">/u);
    const body = element(history, "Revision", "version", "20.6.15");
    expect(plain(body)).toMatch(/^Owner-approved, question 65 \(2026-10-10\):/u);
    expect(plain(body)).toBe(APPROVED.revision);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });
});
