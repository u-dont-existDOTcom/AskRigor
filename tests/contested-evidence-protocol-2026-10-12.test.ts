import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import { undoCorrectionReport, undoHandoffTarget, undoContestedEvidence, undoDiminishingReturns, undoReadDepth } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
const load = async () => undoHandoffTarget(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the fixture: exact owner-approved question 77: "77a", 2026-10-12.
const APPROVED = {
  revision: "Owner-approved, question 77 (2026-10-12): added UserNamedInterventionSweep and UserReportedUseFidelity, which search the exact route before judging a user-named intervention's evidence and keep the user's own description of their use, with two stress cases and final check FS222.",
  sweep: "When the user names an intervention, especially a contested one they have used, search before judging its evidence: its exact identity and synonyms, the indication, and the exact route, in human studies, case series and cohorts. Search with and without the narrowing terms, and widen when results are few. Also search the clinician and grey literature the user's sources point to, and follow their citations to the original studies. Report what was found by route: positive observations, negative controlled comparisons and safety signals, with what was read. \"Not shown to work\" never becomes \"nothing published\", and finding studies does not prove the intervention works.",
  fidelity: "Keep the user's own description of what they used, and how, exactly as given: the substance, the form, the route and the purpose. When the user corrects it, carry the correction into every later summary. Judge evidence and safety for the route actually used, never for a different one, and keep any causal conclusion the user draws separate from what they observed.",
  cases: [
    {
      id: "ContestedRemedyEvidenceFound",
      prompt: "A user says diluted food-grade hydrogen peroxide, inhaled through a nebulizer, helped several colds, and asks for the evidence and the risks.",
      expected: "Search the exact substance, indication and route, widening when results are few, and the clinician literature; report the case series, cohorts, trials and harm cases found, by route, with what was read; do not call the evidence absent or treat the studies as proof.",
    },
    {
      id: "RouteCorrectionKept",
      prompt: "The user corrects an earlier summary: the remedy was swallowed, diluted in water, not inhaled, and another substance was only smelled, not aerosolized.",
      expected: "Restate both uses exactly as corrected, judge evidence and safety for those routes only, and carry the correction into every later summary.",
    },
  ],
  check: "Before judging the evidence for an intervention the user named, its exact identity, indication and route were searched, widened when results were few, along with the clinician literature, and the user's own description of their use was kept exactly (UserNamedInterventionSweep, UserReportedUseFidelity).",
} as const;

const plain = (text: string) => (parser.parse(`<text>${text}</text>`).text as string).replace(/\s+/gu, " ").trim();
function element(text: string, tag: string, attribute: string, value: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attribute}="${value}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, value).toHaveLength(1);
  return matches[0]![1]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(body: string): void {
  for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
}

describe("owner-approved contested intervention evidence, question 77: 77a (2026-10-12)", () => {
  it("chains six reversible edits from diminishing returns and derives the exact current manifests", async () => {
    const recorded = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-12-contested-evidence.json", ROOT), "utf8",
    )) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp;
    const { hrp: previous } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-11-diminishing-returns.json", ROOT), "utf8",
    )) as { hrp: Edits };
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({
      version: "20.6.18", sha256: "48e0e80ab412a3bce84ed834159664975933c3446b28bfcb5fea2964075f268e",
    });
    expect(fixture.to).toEqual({
      version: "20.6.19", sha256: "cb230a1151daecdb1f9be9e28d57d13d5ba7e5b45c666eb45ed3fead5549cf37",
    });
    expect(fixture.edits).toHaveLength(6);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(fixture.to.sha256);
    expect(current).toContain('<Protocol name="HRP" version="20.6.19" revisionDate="2026-10-12"');
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.18" revisionDate="2026-10-11"');
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoContestedEvidence(await loadCurrent())).resolves.toBe(prior);
    const beforeDiminishingReturns = [...previous.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), prior,
    );
    expect(hash(beforeDiminishingReturns)).toBe(previous.from.sha256);
    await expect(undoDiminishingReturns(await loadCurrent())).resolves.toBe(beforeDiminishingReturns);
    const { hrp: readDepth } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8",
    )) as { hrp: Edits };
    const beforeReadDepth = [...readDepth.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), beforeDiminishingReturns,
    );
    expect(hash(beforeReadDepth)).toBe(readDepth.from.sha256);
    await expect(undoReadDepth(await loadCurrent(), "hrp")).resolves.toBe(beforeReadDepth);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.20", revisionDate: "2026-10-12", sha256: hash(await loadCurrent()),
    });
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(hash(await undoCorrectionReport(universal))).toBe("06e5ca6befb9dac648fd41996213394e793e17795087eee8fbc63cbcbbbd8174");
    expect(hash(universal)).toBe("c8f770f0ac340b87f97f257f2c981db70f643b0abfddfe7513ec047b0a29f900");
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.40", revisionDate: "2026-10-12", sha256: hash(universal),
    });
  });

  it.each([
    ["UserNamedInterventionSweep", "NoHumanEvidenceAbsenceClaimBeforeSweep", APPROVED.sweep],
    ["UserReportedUseFidelity", "WholeInterventionIdentityTrace", APPROVED.fidelity],
  ])("places the exact Critical %s rule immediately after %s", async (name, predecessor, approved) => {
    const text = await load();
    expect(text).toMatch(new RegExp(`<Rule name="${predecessor}"[^>]*>[^<]+</Rule>\\n\\n  <Rule name="${name}" priority="Critical">`, "u"));
    const body = element(text, "Rule", "name", name);
    expect(plain(body)).toBe(approved);
    wrapped(body);
  });

  it("places both exact cases immediately after ActiveLaneNotSaturated in the approved order", async () => {
    const text = await load();
    expect(text).toMatch(/<Case id="ActiveLaneNotSaturated">[\s\S]*?<\/Case>\n  <Case id="ContestedRemedyEvidenceFound">/u);
    expect(text).toMatch(/<Case id="ContestedRemedyEvidenceFound">[\s\S]*?<\/Case>\n  <Case id="RouteCorrectionKept">/u);
    expect(text).toMatch(/<Case id="RouteCorrectionKept">[\s\S]*?<\/Case>\n  <Case id="CodedFormulaLargeEffect">/u);
    for (const approved of APPROVED.cases) {
      const body = element(text, "Case", "id", approved.id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(approved.prompt);
      expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(approved.expected);
      wrapped(body);
    }
  });

  it("places the exact single-line FS222 immediately after FS221", async () => {
    const text = await load();
    expect(text).toMatch(/<Check id="FS221">[^\n<]+<\/Check>\n  <Check id="FS222">[^\n<]+<\/Check>/u);
    expect(plain(element(text, "Check", "id", "FS222"))).toBe(APPROVED.check);
  });

  it("starts RevisionHistory with the exact Critical question 77 revision directly above 20.6.18", async () => {
    const text = await load();
    expect(text).toMatch(/<RevisionHistory>\n  <Revision version="20\.6\.19" priority="Critical">[^<]+<\/Revision>\n  <Revision version="20\.6\.18" priority="Critical">/u);
    const body = element(text, "Revision", "version", "20.6.19");
    expect(plain(body)).toBe(APPROVED.revision);
    wrapped(body);
  });
});
