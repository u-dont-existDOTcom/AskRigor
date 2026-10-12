import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import { undoAcceptedLessonsHrp, undoCorrectionReport, undoHandoffTarget, undoContestedEvidence, undoDiminishingReturns, undoReadDepth } from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
const load = async () => undoAcceptedLessonsHrp(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string };
  to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the fixture: exact owner-approved question 79: "79a", 2026-10-12.
const APPROVED = {
  revision: "Owner-approved, question 79 (2026-10-12): added ResearchHandoffTargetFidelity, which keeps the research target in a handoff's own message and checks research that comes back against it before use, with a stress case and final check FS223.",
  rule: "A handoff to Deep Research, another session or another tool states the research target in the message itself, in its first sentence and not only in an attachment, and asks the destination to restate that target before it starts. It names no tool the destination is not known to offer: an instruction such as \"use AskRigor\" can be read as the topic. When research comes back, check it against the handoff before using it: it answers the requested target, it holds source-level records with locators, outcomes and access depth, and every file it links is actually available here. A link into another session's sandbox is not an attachment. An output that fails is not a completed pass: say what is wrong and its likely cause when the invocation shows it, keep useful citations as background, leave the research frontier open, and give a one-line retry prompt that states the original target first. Never report it as saved, or the topic as explored.",
  prompt: "A user's Deep Research request said \"use AskRigor\" and attached the actual brief for one condition's treatment evidence; both reports came back about AskRigor's software, and their result files live in another session.",
  expected: "Say that both answer a different question, likely because the request named AskRigor while the task sat in an attachment, and that the linked files are not available here; keep useful citations as background only; leave the condition's frontier open; give a retry prompt that states the condition first and names no tool; do not file or describe either report as a completed pass.",
  check: "A handoff stated its target in its own first sentence and named no tool the destination was not known to offer, and research that came back was checked against that target, its source-level records and its linked files before use, with a mismatch reported as an unfinished pass and the frontier left open (ResearchHandoffTargetFidelity).",
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

describe("owner-approved research handoff target fidelity, question 79: 79a (2026-10-12)", () => {
  it("chains five reversible edits from contested evidence and derives the exact current manifests", async () => {
    const recorded = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-12-handoff-target.json", ROOT), "utf8",
    )) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp;
    const { hrp: previous } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-12-contested-evidence.json", ROOT), "utf8",
    )) as { hrp: Edits };
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual({
      version: "20.6.19", sha256: "cb230a1151daecdb1f9be9e28d57d13d5ba7e5b45c666eb45ed3fead5549cf37",
    });
    expect(fixture.to).toEqual({
      version: "20.6.20", sha256: "faa656b4d51a2554ff4b668c713bf35fb065624cc53e7871cdd5c16910fc74d0",
    });
    expect(fixture.edits).toHaveLength(5);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(fixture.to.sha256);
    expect(current).toContain('<Protocol name="HRP" version="20.6.20" revisionDate="2026-10-12"');
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(fixture.from.sha256);
    expect(prior).toContain('<Protocol name="HRP" version="20.6.19" revisionDate="2026-10-12"');
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoHandoffTarget(await loadCurrent())).resolves.toBe(prior);
    const beforeContestedEvidence = [...previous.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), prior,
    );
    expect(hash(beforeContestedEvidence)).toBe(previous.from.sha256);
    await expect(undoContestedEvidence(await loadCurrent())).resolves.toBe(beforeContestedEvidence);
    const { hrp: diminishingReturns } = JSON.parse(await readFile(
      new URL("tests/fixtures/protocol-edits/2026-10-11-diminishing-returns.json", ROOT), "utf8",
    )) as { hrp: Edits };
    const beforeDiminishingReturns = [...diminishingReturns.edits].reverse().reduce(
      (text, [before, after]) => replaceOnce(text, after, before), beforeContestedEvidence,
    );
    expect(hash(beforeDiminishingReturns)).toBe(diminishingReturns.from.sha256);
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
      name: "HRP", version: "20.6.21", revisionDate: "2026-10-12", sha256: hash(await loadCurrent()),
    });
    const universal = await readFile(new URL("protocols/Universal_Instructions.xml", ROOT), "utf8");
    expect(hash(await undoCorrectionReport(universal))).toBe("06e5ca6befb9dac648fd41996213394e793e17795087eee8fbc63cbcbbbd8174");
    expect(hash(universal)).toBe("115b22a595b4cdcd663bb60986bd3dba0fb0d3f65f64bcc7bbb6d5a4bfd8a708");
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: "20.5.41", revisionDate: "2026-10-12", sha256: hash(universal),
    });
  });

  it("places the exact Critical rule immediately after ModeSpecificPromptAndHandoff", async () => {
    const text = await load();
    expect(text).toMatch(/<Rule name="ModeSpecificPromptAndHandoff" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="ResearchHandoffTargetFidelity" priority="Critical">/u);
    expect(text).toMatch(/<Rule name="ResearchHandoffTargetFidelity" priority="Critical">[^<]+<\/Rule>\n\n  <Rule name="PassSpecificEvidenceLedger" priority="High">/u);
    const body = element(text, "Rule", "name", "ResearchHandoffTargetFidelity");
    expect(plain(body)).toBe(APPROVED.rule);
    wrapped(body);
  });

  it("places the exact case immediately after RouteCorrectionKept", async () => {
    const text = await load();
    expect(text).toMatch(/<Case id="RouteCorrectionKept">[\s\S]*?<\/Case>\n  <Case id="HandoffTargetLost">/u);
    expect(text).toMatch(/<Case id="HandoffTargetLost">[\s\S]*?<\/Case>\n  <Case id="CodedFormulaLargeEffect">/u);
    const body = element(text, "Case", "id", "HandoffTargetLost");
    expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
    expect(plain(body.match(/<Prompt>([^<]+)<\/Prompt>/u)![1]!)).toBe(APPROVED.prompt);
    expect(plain(body.match(/<ExpectedBehavior>([^<]+)<\/ExpectedBehavior>/u)![1]!)).toBe(APPROVED.expected);
    wrapped(body);
  });

  it("places the exact single-line FS223 immediately after FS222", async () => {
    const text = await load();
    expect(text).toMatch(/<Check id="FS222">[^\n<]+<\/Check>\n  <Check id="FS223">[^\n<]+<\/Check>/u);
    expect(plain(element(text, "Check", "id", "FS223"))).toBe(APPROVED.check);
  });

  it("starts RevisionHistory with the exact Critical question 79 revision directly above 20.6.19", async () => {
    const text = await load();
    expect(text).toMatch(/<RevisionHistory>\n  <Revision version="20\.6\.20" priority="Critical">[^<]+<\/Revision>\n  <Revision version="20\.6\.19" priority="Critical">/u);
    const body = element(text, "Revision", "version", "20.6.20");
    expect(plain(body)).toBe(APPROVED.revision);
    wrapped(body);
  });
});
