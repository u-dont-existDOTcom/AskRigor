import { undoReadDepth } from "./helpers/undo-read-depth.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot, protocolSections } from "@askrigor/protocol";

const ROOT = new URL("../", import.meta.url);
const FIXTURE = new URL("tests/fixtures/protocol-edits/2026-10-11-lab-preparation.json", ROOT);
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const parser = new XMLParser({ parseTagValue: false });

interface RecordedEdits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the fixture: exact owner-approved question 70: 70a (2026-10-11).
const APPROVED = {
  revision: "Owner-approved, question 70 (2026-10-11): added PreanalyticReadiness, which considers collection conditions before treating a lab result as real and gives preparation advice before a repeat draw, with two stress cases and final check FS219.",
  rule: "Before treating a lab result as real, and whenever a repeat test is planned, consider the collection conditions that can change the value or the draw: fasting without water or other dehydration, recent strenuous exercise or acute illness, posture and timing, interfering medications and supplements such as biotin, and tube filling, mixing and transport. Ask about them when they are unknown and could change the decision. Before a repeat draw, give brief preparation advice within the laboratory's instructions and any fluid restriction: drink water normally, since plain water is usually allowed during fasting, and repeat under comparable conditions. Keep mechanisms separate: dehydration can concentrate some measured values; a difficult draw or poor mixing can trap platelets in microclots; and EDTA-dependent clumping is a different test-tube artifact that drinking water has not been shown to prevent. Never present a preparation factor as the cause without evidence, use it in place of confirmation such as a blood smear or a citrate-tube count, or let it delay urgent evaluation.",
  cases: [
    {
      id: "RepeatPlateletDrawPreparation",
      prompt: "Platelets fell from 310 to 90 × 10^9/L, and the person is booking a repeat fasting blood test and asks how to prepare.",
      expected: "Advise a prompt repeat with clinician review, a blood smear, and a citrate-tube count if clumping is suspected; advise drinking water normally before the draw unless told otherwise; do not claim that water prevents EDTA clumping or explains the result.",
    },
    {
      id: "LipidPanelAfterDryFasting",
      prompt: "A first lipid panel shows LDL 125 mg/dL after fasting from food and water, and the person asks whether it could be falsely high.",
      expected: "Explain that fasting without water may raise measured lipids modestly, from a small crossover study, with no individual correction; suggest a comparable repeat with normal hydration when it would change the decision; keep the cardiovascular risk assessment.",
    },
  ],
  check: "For a lab result or a planned repeat test, collection conditions that could change the value or the draw were considered, preparation advice was given before any repeat draw, and no preparation factor replaced confirmation or urgent evaluation (PreanalyticReadiness).",
} as const;

async function sectionText(name: string): Promise<string> {
  const snapshot = await loadProtocolSectionSnapshot("hrp");
  const text = await undoReadDepth(snapshot.text, "hrp");
  const sections = protocolSections("hrp", text);
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

describe("owner-approved lab preparation, question 70: 70a (2026-10-11)", () => {
  it("chains reversible edits to 20.6.15 and derives the current manifests from unchanged canonical bytes", async () => {
    const recorded = JSON.parse(await readFile(FIXTURE, "utf8")) as { purpose: string; hrp: RecordedEdits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp;
    const { hrp: previous } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-10-full-text-search.json", ROOT), "utf8",
    )) as { hrp: RecordedEdits };
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({
      version: "20.6.15", sha256: "ea4e14bd50471ef8305bc93a2c9a85537bbbe1b99c24faf773b899d12eb41ace",
    });
    expect(fixture.to.version).toBe("20.6.16");
    expect(fixture.edits).toHaveLength(5);
    const current = await readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
    const onDisk = await undoReadDepth(current, "hrp");
    expect(XMLValidator.validate(onDisk)).toBe(true);
    expect(sha256(onDisk)).toBe(fixture.to.sha256);
    expect(onDisk).toContain('<Protocol name="HRP" version="20.6.16" revisionDate="2026-10-11"');
    const prior = [...fixture.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), onDisk,
    );
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(sha256(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.15" revisionDate="2026-10-10"');
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(onDisk);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.17", revisionDate: "2026-10-11", sha256: sha256(current),
    });
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.38", revisionDate: "2026-10-11",
      sha256: "06e5ca6befb9dac648fd41996213394e793e17795087eee8fbc63cbcbbbd8174",
    });
  });

  it("places the exact rule directly after AnalyticalValidity", async () => {
    const labs = await sectionText("LabAndTestInterpretation");
    expect(labs).toMatch(/<Rule name="AnalyticalValidity" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="PreanalyticReadiness" priority="Critical">/u);
    const body = element(labs, "Rule", "name", "PreanalyticReadiness");
    expect(plain(body)).toBe(APPROVED.rule);
    expect(labs).toMatch(/<Rule name="PreanalyticReadiness" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="ClinicalValidityAndUtility" priority="Critical">/u);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });

  it("places both cases directly after HarmOnlyInTables with exact sentences", async () => {
    const cases = await sectionText("StressTestExpectations");
    const ids = [...cases.matchAll(/<Case id="([^"]+)">/gu)].map((match) => match[1]);
    expect(ids.indexOf("HarmOnlyInTables")).toBeGreaterThanOrEqual(0);
    for (const [index, approved] of APPROVED.cases.entries()) {
      expect(ids[ids.indexOf("HarmOnlyInTables") + index + 1]).toBe(approved.id);
      const body = element(cases, "Case", "id", approved.id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(approved.prompt);
      expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(approved.expected);
      for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
    }
    expect(ids[ids.indexOf("LipidPanelAfterDryFasting") + 1]).toBe("CodedFormulaLargeEffect");
  });

  it("places the exact single-line FS219 directly after FS218", async () => {
    const checks = await sectionText("FinalSelfCheck");
    expect(checks).toMatch(/<Check id="FS218">[^\n<]+<\/Check>\n  <Check id="FS219">[^\n<]+<\/Check>/u);
    expect(plain(element(checks, "Check", "id", "FS219"))).toBe(APPROVED.check);
  });

  it("starts RevisionHistory with the exact question 70 entry directly above 20.6.15", async () => {
    const history = await sectionText("RevisionHistory");
    expect(history).toMatch(/^<RevisionHistory>\s*<Revision version="20\.6\.16" priority="Critical">[^<]+<\/Revision>\s*<Revision version="20\.6\.15" priority="Critical">/u);
    const body = element(history, "Revision", "version", "20.6.16");
    expect(plain(body)).toMatch(/^Owner-approved, question 70 \(2026-10-11\):/u);
    expect(plain(body)).toBe(APPROVED.revision);
    for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
  });
});
