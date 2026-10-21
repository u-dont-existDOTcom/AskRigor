import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot, protocolNamedElements } from "@askrigor/protocol";
import {
  undoOwnerQuestion93Hrp, undoOwnerQuestions86To89Hrp, undoOwnerQuestions90To92Hrp, undoOwnerQuestions97And99Hrp,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = (file: "HRP_Full.xml" | "Universal_Instructions.xml" = "HRP_Full.xml") => readFile(
  new URL(`protocols/${file}`, ROOT), "utf8",
);
// The state right after question 93: the newer HRP edits of questions 97 and 99 are undone first.
const load = async () => undoOwnerQuestions97And99Hrp(await loadCurrent());
// HRP 20.6.23, the state the owner's wording for question 93 was added to.
const loadPrior = async () => undoOwnerQuestion93Hrp(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the recorded fixture: the exact wording the owner approved for question 93 on the owner questions
// page (answer "93a", 2026-10-15), from the owner's note on lesson #23. It supplies the rule SafestOptionsFirst,
// final check FS233 and a revision sentence.
const APPROVED = {
  revision: "Owner-approved, question 93 (2026-10-14), from the owner's note on lesson #23: added SafestOptionsFirst and final check FS233.",
  rule: "When several options could reasonably help a person, put first the safest ones that could work, which are usually reversible, low-burden measures, and riskier ones, such as a medicine taken for months or years, after them, unless the safer ones are unsuitable, have already failed, or would delay urgent or time-sensitive treatment. Say why when a riskier option comes first.",
  check: "When several options could help a person, the safest ones that could work came first, or the answer said why a riskier one came first (SafestOptionsFirst).",
} as const;
const PINS = {
  from: { version: "20.6.23", sha256: "6623056eab84a60a0a82ac33a5aa0145cb84725d1be60aedfa77faf3d69899bd" },
  to: { version: "20.6.24", sha256: "04bf76e20ebab9ab5cd6138ca45adbce79dccdd91a505df5ada14366bc0b0589" },
  hrp20622: "da82943f56614783d9316bd9a7d87a3233bf8c03255f20c88cc7bfefa39d73e9",
  hrp20621: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7",
  universal: { version: "20.5.46", sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e" },
} as const;
const WIDTH = 118;
const GATE = "PatientSpecificInterventionSafetyReconciliationGate";
const RULE_LINE = `  <Rule name="SafestOptionsFirst" priority="Critical">${APPROVED.rule}</Rule>`;
const CHECK_LINE = `  <Check id="FS233">${APPROVED.check}</Check>`;
const plain = (body: string) => (parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim();
const normalize = (text: string) => text.replace(/\s+/gu, " ");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
function section(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}(?: [^>]*)?>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, tag).toHaveLength(1);
  return matches[0]![1]!;
}
function element(text: string, tag: string, attr: string, id: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attr}="${id}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, id).toHaveLength(1);
  return matches[0]![1]!;
}
// The unique element that starts with `open`, through the first `close` after it.
function span(text: string, open: string, close: string): string {
  expect(text.split(open), open).toHaveLength(2);
  const start = text.indexOf(open);
  return text.slice(start, text.indexOf(close, start) + close.length);
}
// The one line that starts with `start`.
function lineStarting(text: string, start: string): string {
  const lines = text.split("\n").filter((line) => line.startsWith(start));
  expect(lines, start).toHaveLength(1);
  return lines[0]!;
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(body: string): void {
  for (const line of body.split("\n")) expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
}

describe("owner-approved question 93: 93a (2026-10-15)", () => {
  it("chains only the recorded HRP edits from the exact predecessor and derives its manifest from the bytes", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-15-owner-question-93-hrp.json", ROOT,
    ), "utf8")) as Record<string, Edits>;
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp!;
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-14-owner-questions-90-92-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(4);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(current).toContain(`<Protocol name="HRP" version="${PINS.to.version}" revisionDate="2026-10-15"`);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`<Protocol name="HRP" version="${PINS.from.version}" revisionDate="2026-10-14"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoOwnerQuestion93Hrp(await loadCurrent())).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(PINS.hrp20622);
    await expect(undoOwnerQuestions90To92Hrp(await loadCurrent())).resolves.toBe(beforePrevious);
    expect(hash(await undoOwnerQuestions86To89Hrp(await loadCurrent()))).toBe(PINS.hrp20621);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.29", revisionDate: "2026-10-21", sha256: hash(await loadCurrent()),
    });
    const universal = await loadCurrent("Universal_Instructions.xml");
    expect(hash(universal)).toBe(PINS.universal.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.universal.version, revisionDate: "2026-10-21",
      sha256: PINS.universal.sha256,
    });
  });

  it("puts the exact Critical revision first, directly above 20.6.23's, wrapped like its neighbours", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const body = element(text, "Revision", "version", PINS.to.version);
    expect(plain(body)).toBe(APPROVED.revision);
    wrapped(body);
    const lines = body.split("\n").slice(1, -1);
    expect(lines.every((line) => line.startsWith("   ") && !line.startsWith("    "))).toBe(true);
    // Filled to the width: the next line's first word would not have fitted on the line before it.
    for (let i = 1; i < lines.length; i++) {
      expect(`${lines[i - 1]!} ${lines[i]!.trim().split(" ")[0]!}`.length, lines[i - 1]).toBeGreaterThan(WIDTH);
    }
    const added = `  <Revision version="${PINS.to.version}" priority="Critical">${body}</Revision>\n`;
    expect(section(prior, "RevisionHistory").startsWith(`\n  <Revision version="${PINS.from.version}" priority="Critical">\n`))
      .toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${added}${section(prior, "RevisionHistory").slice(1)}`);
  });

  it("places the one-line SafestOptionsFirst directly after AlternativesRemainVisible, before DurationMatchedBenefitAndHarm", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    expect(text).toMatch(new RegExp(
      `\\n  <Rule name="AlternativesRemainVisible" priority="Critical">[^<\\n]+</Rule>\\n\\n${escape(RULE_LINE)}\\n\\n` +
        '  <Rule name="DurationMatchedBenefitAndHarm" priority="Critical">[^<\\n]+</Rule>\\n\\n' +
        '  <Template id="PatientSpecificInterventionSafetyReconciliation">',
      "u",
    ));
    const alternatives = lineStarting(prior, '  <Rule name="AlternativesRemainVisible" priority="Critical">');
    expect(section(text, GATE)).toBe(replaceOnce(section(prior, GATE), `${alternatives}\n\n`, `${alternatives}\n\n${RULE_LINE}\n\n`));
    expect(text.split('"SafestOptionsFirst"')).toHaveLength(2);
    expect(plain(element(text, "Rule", "name", "SafestOptionsFirst"))).toBe(APPROVED.rule);
  });

  // Owner question 123 (2026-10-18) moved the rule word for word into the core section EpistemicSafetyRules.
  it("loads SafestOptionsFirst by name as one element with its exact canonical bytes, in its core section", async () => {
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { manifest, sections, text } = await loadProtocolSectionSnapshot("hrp");
    expect(text).toBe(bytes.toString("utf8"));
    expect(manifest).toEqual({ name: "HRP", version: "20.6.29", revisionDate: "2026-10-21", sha256: hash(text) });
    const [rule, ...others] = protocolNamedElements(text, "SafestOptionsFirst");
    expect(others).toEqual([]);
    expect(rule).toMatchObject({ tag: "Rule", section: "EpistemicSafetyRules" });
    expect(bytes.subarray(rule!.byte_start, rule!.byte_end_exclusive).toString("utf8")).toBe(RULE_LINE.trimStart());
    const containing = sections.filter(({ byte_start, byte_end_exclusive }) =>
      byte_start <= rule!.byte_start && rule!.byte_end_exclusive <= byte_end_exclusive
    );
    expect(containing.map(({ name }) => name)).toEqual(["EpistemicSafetyRules"]);
  });

  it("adds only the one-line FS233 directly after FS232", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const fs232 = lineStarting(prior, '  <Check id="FS232">');
    expect(section(text, "FinalSelfCheck")).toBe(
      replaceOnce(section(prior, "FinalSelfCheck"), `${fs232}\n`, `${fs232}\n${CHECK_LINE}\n`),
    );
    expect(element(text, "Check", "id", "FS233")).toBe(APPROVED.check);
    expect(text.split('<Check id="FS233">')).toHaveLength(2);
  });

  it("holds the three approved texts word for word, and nothing else changed", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    for (const phrase of Object.values(APPROVED)) {
      expect(phrase, phrase.slice(0, 60)).toMatch(/^[\x20-\x7e]+$/u);
      expect(phrase).not.toMatch(/[&<>]/u);
      expect(normalize(text), phrase.slice(0, 60)).toContain(phrase);
      expect(normalize(prior), phrase.slice(0, 60)).not.toContain(phrase);
    }
    let expected = normalize(prior);
    const swap = (before: string, after: string) => { expected = replaceOnce(expected, before, after); };
    const extend = (open: string, close: string, change: (whole: string) => string) => {
      const whole = span(expected, open, close);
      swap(whole, change(whole));
    };
    swap(`version="${PINS.from.version}" revisionDate="2026-10-14"`, `version="${PINS.to.version}" revisionDate="2026-10-15"`);
    swap("<RevisionHistory> ", `<RevisionHistory> <Revision version="${PINS.to.version}" priority="Critical"> ${APPROVED.revision} </Revision> `);
    extend('<Rule name="AlternativesRemainVisible" priority="Critical">', "</Rule>", (whole) =>
      `${whole} <Rule name="SafestOptionsFirst" priority="Critical">${APPROVED.rule}</Rule>`);
    extend('<Check id="FS232">', "</Check>", (whole) => `${whole} <Check id="FS233">${APPROVED.check}</Check>`);
    expect(normalize(text)).toBe(expected);
    // Byte for byte as well: only the root attributes, the revision entry, the rule and the check differ.
    const revision = `  <Revision version="${PINS.to.version}" priority="Critical">${element(text, "Revision", "version", PINS.to.version)}</Revision>`;
    let exact = replaceOnce(prior, `version="${PINS.from.version}" revisionDate="2026-10-14"`, `version="${PINS.to.version}" revisionDate="2026-10-15"`);
    exact = replaceOnce(exact, " <RevisionHistory>\n", ` <RevisionHistory>\n${revision}\n`);
    const alternatives = lineStarting(prior, '  <Rule name="AlternativesRemainVisible" priority="Critical">');
    exact = replaceOnce(exact, `${alternatives}\n`, `${alternatives}\n\n${RULE_LINE}\n`);
    const fs232 = lineStarting(prior, '  <Check id="FS232">');
    exact = replaceOnce(exact, `${fs232}\n`, `${fs232}\n${CHECK_LINE}\n`);
    expect(text).toBe(exact);
  });

  it("wraps every new line within 118 characters, apart from the one-line elements", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    const long = added.filter((line) => line.length > WIDTH).map((line) => /^ *<\w+ (?:name|id)="([^"]+)"/u.exec(line)?.[1]);
    expect(long).toEqual(["HRP", "SafestOptionsFirst", "FS233"]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });
});
