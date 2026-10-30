import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import { undoCorrectionReport, undoContestedEvidence, undoDiminishingReturns, undoReadDepth } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
const load = async () => undoContestedEvidence(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the fixture: exact owner-approved question 73: "73a", 2026-10-11.
const APPROVED = {
  revision: "Owner-approved, question 73 (2026-10-11): added ProactiveDiminishingReturns, which tells the user when research returns are diminishing and where to move the effort, with two stress cases and final check FS221.",
  rule: "During sustained research, after each substantial pass, compare what it newly found that could change the decision with earlier passes: new independently corroborated candidates, changes to the practical shortlist, and contradictions resolved, not the number of hits. When that falls off over adequately covered passes, tell the user without waiting to be asked: the exact scope, what recent passes found, the important exceptions still open, and where you recommend moving the main effort. A blocked source, a missing full text or an unfinished audit is not diminishing returns, and a lane still finding new, outcome-specific leads is not saturated. Keep the parent mission, and reopen a topic when consequential new evidence appears.",
  cases: [
    {
      id: "PlateauSaidBeforeAsked",
      prompt: "After four research passes on herbal treatments for one bowel condition, each pass adds only weak or duplicated responder results, and none beats the main comparator. The user writes: continue.",
      expected: "Say that returns on this search have diminished, with the scope and what the passes found; name the open exceptions; recommend where to move the main effort; do not wait for the user to notice.",
    },
    {
      id: "ActiveLaneNotSaturated",
      prompt: "Early passes on a strength goal found only sponsor-linked products, but a new traditional-use pass found several uncommon plants tied to strength itself.",
      expected: "Treat the lane as active and underexplored, not saturated; keep strength as the target and state the evidence and safety limits of the new leads.",
    },
  ],
  check: "In sustained research, falling returns were told to the user without being asked, with the scope, the open exceptions and a recommended next allocation; access failures and active lanes were not called saturation (ProactiveDiminishingReturns).",
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

describe("owner-approved proactive diminishing returns, question 73: 73a (2026-10-11)", () => {
  it("chains five reversible edits from read-depth and derives the exact current manifests", async () => {
    const recorded = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-11-diminishing-returns.json", ROOT), "utf8",
    )) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp;
    const { hrp: previous } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8",
    )) as { hrp: Edits };
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({
      version: "20.6.17", sha256: "682ce6a9e7421f127e0035141d3292ee12842e506039e97302f7974b4f40c340",
    });
    expect(fixture.to).toEqual({
      version: "20.6.18", sha256: "48e0e80ab412a3bce84ed834159664975933c3446b28bfcb5fea2964075f268e",
    });
    expect(fixture.edits).toHaveLength(5);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(fixture.to.sha256);
    expect(current).toContain('<Protocol name="HRP" version="20.6.18" revisionDate="2026-10-11"');
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.17" revisionDate="2026-10-11"');
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoDiminishingReturns(await loadCurrent())).resolves.toBe(prior);
    const beforeReadDepth = [...previous.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), prior,
    );
    expect(hash(beforeReadDepth)).toBe(previous.from.sha256);
    await expect(undoReadDepth(await loadCurrent(), "hrp")).resolves.toBe(beforeReadDepth);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.32", revisionDate: "2026-10-29", sha256: hash(await loadCurrent()),
    });
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(hash(await undoCorrectionReport(universal))).toBe("06e5ca6befb9dac648fd41996213394e793e17795087eee8fbc63cbcbbbd8174");
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.46", revisionDate: "2026-10-21",
      sha256: hash(universal),
    });
  });

  it("places the exact Critical rule immediately after AdaptiveStoppingRule and before PreflightOnlyResponse", async () => {
    const text = await load();
    expect(text).toMatch(/<Rule name="AdaptiveStoppingRule" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="ProactiveDiminishingReturns" priority="Critical">/u);
    expect(text).toMatch(/<Rule name="ProactiveDiminishingReturns" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="PreflightOnlyResponse" priority="Critical">/u);
    const body = element(text, "Rule", "name", "ProactiveDiminishingReturns");
    expect(plain(body)).toBe(APPROVED.rule);
    wrapped(body);
  });

  it("places both exact cases immediately after CrossTrialResponderRatio in the approved order", async () => {
    const text = await load();
    expect(text).toMatch(/<Case id="CrossTrialResponderRatio">[\s\S]*?<\/Case>\n  <Case id="PlateauSaidBeforeAsked">/u);
    expect(text).toMatch(/<Case id="PlateauSaidBeforeAsked">[\s\S]*?<\/Case>\n  <Case id="ActiveLaneNotSaturated">/u);
    expect(text).toMatch(/<Case id="ActiveLaneNotSaturated">[\s\S]*?<\/Case>\n  <Case id="CodedFormulaLargeEffect">/u);
    for (const approved of APPROVED.cases) {
      const body = element(text, "Case", "id", approved.id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(approved.prompt);
      expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(approved.expected);
      wrapped(body);
    }
  });

  it("places the exact single-line FS221 immediately after FS220", async () => {
    const text = await load();
    expect(text).toMatch(/<Check id="FS220">[^\n<]+<\/Check>\n  <Check id="FS221">[^\n<]+<\/Check>/u);
    expect(plain(element(text, "Check", "id", "FS221"))).toBe(APPROVED.check);
  });

  it("starts RevisionHistory with the exact Critical question 73 revision directly above 20.6.17", async () => {
    const text = await load();
    expect(text).toMatch(/<RevisionHistory>\n  <Revision version="20\.6\.18" priority="Critical">[^<]+<\/Revision>\n  <Revision version="20\.6\.17" priority="Critical">/u);
    const body = element(text, "Revision", "version", "20.6.18");
    expect(plain(body)).toBe(APPROVED.revision);
    wrapped(body);
  });
});
