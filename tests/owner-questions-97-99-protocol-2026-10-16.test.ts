import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot, protocolNamedElements } from "@askrigor/protocol";
import {
  undoOwnerQuestion93Hrp, undoOwnerQuestions103And104Hrp, undoOwnerQuestions86To89Hrp,
  undoOwnerQuestions90To92Hrp, undoOwnerQuestions97And99Hrp,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = (file: "HRP_Full.xml" | "Universal_Instructions.xml" = "HRP_Full.xml") => readFile(
  new URL(`protocols/${file}`, ROOT), "utf8",
);
// The state right after questions 97 and 99: questions 103 and 104's newer HRP edits are undone first.
const load = async () => undoOwnerQuestions103And104Hrp(await loadCurrent());
const loadPrior = async () => undoOwnerQuestions97And99Hrp(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the edit fixture: the owner's exact approved wording in the supervising Claude directive,
// owner questions 97 and 99, answer "97a98b99a" (2026-10-16), from issue #336 and lessons #30 and #31.
const APPROVED = {
  "scope": "When the question compares two interventions or forms, the comparator is an axis too: a report counts toward that comparison only when the same person describes using both, and a report comparing one of them with something else joins a labeled other-comparator cohort. A switch between the two that also changed the dose, timing or other treatments shows the combined change, not the difference between them.",
  "platform": "Search every community the user names as well, or say what stopped the search; another community does not replace one the user named.",
  "objective": "When the question turns on a measured marker, say how many firsthand reports gave a measurement after the change, including none, and keep a measurement taken before the change, such as the result that prompted it, apart from a measured change after it.",
  "fs234": "Forum reports counted for an exact intervention came from people who used it themselves; a comparison rested only on people who used both at comparable doses, or the answer said it did not; every community the user named was searched or its limit stated; and the number of reports with a measurement after the change was given, including none (ScopeAxesBeforeSampling, PrincipalPlatformMapping, ObjectiveSubjectiveSeparation).",
  "case30_prompt": "Asked whether form A of a mineral supplement raises a low blood marker better than form B, a forum thread discusses low values of the marker, but no one in it says they took form A; one person says form A worked better for them than a liver supplement.",
  "case30_expected": "Report that no one in the thread took form A; keep the marker values in the thread apart from any effect of form A; don't present the liver-supplement comparison as form A against form B.",
  "case31_prompt": "The user asks for rigorous research comparing form A with form B and names YouTube and one longevity forum. One person switched from form B at 6 mg a day to form A at 0.9 mg and their marker rose; another doesn't say which form they took; no one reports a follow-up test.",
  "case31_expected": "Search both named communities, including their reports of harm, or say what stopped each; don't count the switch as a comparison of the forms, because the dose changed too; leave out the report that names no form; say that no follow-up measurement was reported; run the final check before concluding.",
  "rule97": "When the evidence found cannot answer the question but methods that exist could, describe the test that would answer it as soon as those methods come up, without being asked: what is compared, the control condition, and what each result would show. Say it appears not to have been done only after an adequate search; a narrow search does not show that nobody has done it, and supposed barriers are not documented reasons.",
  "fs235": "When the evidence found could not answer the question but existing methods could, the answer described the test that would, with what is compared, the control and what each result would show, when those methods first came up, and said it appears not to have been done only after an adequate search (ProposeDiscriminatingTest).",
  "case97_prompt": "Patients who cannot move show brain responses to painful stimuli, and some can answer yes or no through brain imaging. The user asks whether anyone can test directly if they experience the pain.",
  "case97_expected": "When brain communication first comes up, describe the test without being asked: a validated yes-or-no channel that needs no movement, a time-locked painful stimulus given with medical approval and a matched painless one, and a question about that sensation, with what each result would show. Keep pain processing, a reported experience, ongoing pain and no interpretable signal apart; say an intentional reply shows some awareness but nothing about complete unconsciousness; say the test appears not to have been run only after an adequate search.",
  "revision": "Owner-approved, question 97 (2026-10-16), from issue #336: added ProposeDiscriminatingTest, with stress case StimulusLockedPainReport and final check FS235. Owner-approved, question 99 (2026-10-16), from lessons #30 and #31: the comparator as a forum axis, and switches that also changed the dose (ScopeAxesBeforeSampling); every community the user names searched (PrincipalPlatformMapping); reports with a measurement after the change counted (ObjectiveSubjectiveSeparation); final check FS234 and stress cases FormSpecificForumReports and DoseChangedFormSwitch."
} as const;
const PINS = {
  from: { version: "20.6.24", sha256: "04bf76e20ebab9ab5cd6138ca45adbce79dccdd91a505df5ada14366bc0b0589" },
  to: { version: "20.6.25", sha256: "f3f1d9d2f60eb0dd376d93a09910a7a26e3543b4cdb8f540298a977315d4beb5" },
  hrp20623: "6623056eab84a60a0a82ac33a5aa0145cb84725d1be60aedfa77faf3d69899bd",
  hrp20622: "da82943f56614783d9316bd9a7d87a3233bf8c03255f20c88cc7bfefa39d73e9",
  hrp20621: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7",
  universal: { version: "20.5.46", sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e" },
} as const;
const WIDTH = 118;
const APPENDS = [
  ["ScopeAxesBeforeSampling", APPROVED.scope],
  ["PrincipalPlatformMapping", APPROVED.platform],
  ["ObjectiveSubjectiveSeparation", APPROVED.objective],
] as const;
const CASES = [
  ["StimulusLockedPainReport", APPROVED.case97_prompt, APPROVED.case97_expected],
  ["FormSpecificForumReports", APPROVED.case30_prompt, APPROVED.case30_expected],
  ["DoseChangedFormSwitch", APPROVED.case31_prompt, APPROVED.case31_expected],
] as const;
const plain = (body: string) => (parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim();
const normalize = (text: string) => text.replace(/\s+/gu, " ");
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

function filled(body: string, indent: number): void {
  wrapped(body);
  const lines = body.split("\n").slice(1, -1);
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every((line) => line.startsWith(" ".repeat(indent)) && !line.startsWith(" ".repeat(indent + 1))))
    .toBe(true);
  for (let i = 1; i < lines.length; i++) {
    expect(`${lines[i - 1]!} ${lines[i]!.trim().split(" ")[0]!}`.length, lines[i - 1]).toBeGreaterThan(WIDTH);
  }
}

describe("owner-approved questions 97 and 99: 97a98b99a (2026-10-16)", () => {
  it("chains eight exact edits from question 93, derives the manifest from the bytes and reverses every recent HRP layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-16-owner-questions-97-99-hrp.json", ROOT,
    ), "utf8")) as Record<string, Edits>;
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp!;
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-15-owner-question-93-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(8);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(current).toContain(`<Protocol name="HRP" version="${PINS.to.version}" revisionDate="2026-10-16"`);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`<Protocol name="HRP" version="${PINS.from.version}" revisionDate="2026-10-15"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoOwnerQuestions97And99Hrp(await loadCurrent())).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(PINS.hrp20623);
    await expect(undoOwnerQuestion93Hrp(await loadCurrent())).resolves.toBe(beforePrevious);
    expect(hash(await undoOwnerQuestions90To92Hrp(await loadCurrent()))).toBe(PINS.hrp20622);
    expect(hash(await undoOwnerQuestions86To89Hrp(await loadCurrent()))).toBe(PINS.hrp20621);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.29", revisionDate: "2026-10-21", sha256: hash(await loadCurrent()),
    });
    expect(hash(await loadCurrent("Universal_Instructions.xml"))).toBe(PINS.universal.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.universal.version, revisionDate: "2026-10-21",
      sha256: PINS.universal.sha256,
    });
  });

  it("puts the exact Critical revision first, directly above 20.6.24's, wrapped like its neighbours", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const body = element(text, "Revision", "version", PINS.to.version);
    expect(plain(body)).toBe(APPROVED.revision);
    filled(body, 3);
    const added = `  <Revision version="${PINS.to.version}" priority="Critical">${body}</Revision>\n`;
    expect(section(prior, "RevisionHistory").startsWith(`\n  <Revision version="${PINS.from.version}" priority="Critical">\n`))
      .toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${added}${section(prior, "RevisionHistory").slice(1)}`);
  });

  it("places the exact Critical ProposeDiscriminatingTest directly after DocumentSignal in HighValueSignalShowcase", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const body = element(text, "Rule", "name", "ProposeDiscriminatingTest");
    expect(plain(body)).toBe(APPROVED.rule97);
    filled(body, 3);
    const added = `  <Rule name="ProposeDiscriminatingTest" priority="Critical">${body}</Rule>`;
    const document = `  <Rule name="DocumentSignal" priority="High">${element(prior, "Rule", "name", "DocumentSignal")}</Rule>`;
    expect(section(text, "HighValueSignalShowcase")).toBe(replaceOnce(
      section(prior, "HighValueSignalShowcase"), `${document}\n\n`, `${document}\n\n${added}\n\n`,
    ));
    expect(text).toContain(`${added}\n\n  <Rule name="HighValueLowActionability"`);
  });

  it.each(APPENDS)("appends the exact approved text as the last text of %s, preserving its existing bytes", async (name, approved) => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const body = element(text, "Rule", "name", name);
    const before = element(prior, "Rule", "name", name);
    // Exclude only the two spaces belonging to the old closing tag's indentation.
    const preserved = before.slice(0, -2);
    expect(before.endsWith("\n  ")).toBe(true);
    expect(body.startsWith(preserved)).toBe(true);
    expect(plain(body)).toBe(`${plain(before)} ${approved}`);
    expect(plain(body).endsWith(approved)).toBe(true);
    const appended = body.slice(preserved.length);
    expect(appended.endsWith("\n  ")).toBe(true);
    filled(`\n${appended}`, 3);
  });

  it("adds only one-line FS234 then FS235 directly after FS233", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const fs233 = lineStarting(prior, '  <Check id="FS233">');
    const checks = `  <Check id="FS234">${APPROVED.fs234}</Check>\n  <Check id="FS235">${APPROVED.fs235}</Check>`;
    expect(section(text, "FinalSelfCheck")).toBe(
      replaceOnce(section(prior, "FinalSelfCheck"), `${fs233}\n`, `${fs233}\n${checks}\n`),
    );
    expect(element(text, "Check", "id", "FS234")).toBe(APPROVED.fs234);
    expect(element(text, "Check", "id", "FS235")).toBe(APPROVED.fs235);
  });

  it.each(CASES)("puts the exact %s case in the approved order, with HerbalTeaForChills formatting", async (id, prompt, expected) => {
    const text = await load();
    const body = element(text, "Case", "id", id);
    const promptBody = section(body, "Prompt");
    const expectedBody = section(body, "ExpectedBehavior");
    expect(plain(promptBody)).toBe(prompt);
    expect(plain(expectedBody)).toBe(expected);
    filled(promptBody, 4);
    filled(expectedBody, 4);
    expect(body).toBe(`\n   <Prompt>${promptBody}</Prompt>\n   <ExpectedBehavior>${expectedBody}</ExpectedBehavior>\n  `);
    const ids = [...section(text, "StressTestExpectations").matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
    const index = ids.indexOf("PractitionerCorpusRecoveries");
    expect(ids.slice(index, index + 5)).toEqual([
      "PractitionerCorpusRecoveries", ...CASES.map(([name]) => name), "CodedFormulaLargeEffect",
    ]);
  });

  it("loads the new rule and each new case by name with their exact canonical byte ranges and sections", async () => {
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { manifest, sections, text } = await loadProtocolSectionSnapshot("hrp");
    expect(text).toBe(bytes.toString("utf8"));
    expect(manifest).toEqual({ name: "HRP", version: "20.6.29", revisionDate: "2026-10-21", sha256: hash(text) });
    const names = [
      ["ProposeDiscriminatingTest", "Rule", "name", "HeterodoxEpistemology"],
      ...CASES.map(([name]) => [name, "Case", "id", "StressTestExpectations"]),
    ];
    for (const [name, tag, attr, containingSection] of names) {
      const [found, ...others] = protocolNamedElements(text, name!);
      expect(others).toEqual([]);
      expect(found).toMatchObject({ tag, section: containingSection });
      const canonical = `<${tag} ${attr}="${name}"${tag === "Rule" ? ' priority="Critical"' : ""}>${element(text, tag!, attr!, name!)}</${tag}>`;
      expect(bytes.subarray(found!.byte_start, found!.byte_end_exclusive).toString("utf8")).toBe(canonical);
      const containing = sections.filter(({ byte_start, byte_end_exclusive }) =>
        byte_start <= found!.byte_start && found!.byte_end_exclusive <= byte_end_exclusive
      );
      expect(containing.map(({ name: sectionName }) => sectionName)).toEqual([containingSection]);
    }
  });

  it("holds every approved text word for word and equals 20.6.24 plus only the approved changes, normalized and byte for byte", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
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
    swap(`version="${PINS.from.version}" revisionDate="2026-10-15"`, `version="${PINS.to.version}" revisionDate="2026-10-16"`);
    swap("<RevisionHistory> ", `<RevisionHistory> <Revision version="${PINS.to.version}" priority="Critical"> ${APPROVED.revision} </Revision> `);
    extend('<Rule name="DocumentSignal" priority="High">', "</Rule>", (whole) =>
      `${whole} <Rule name="ProposeDiscriminatingTest" priority="Critical"> ${APPROVED.rule97} </Rule>`);
    for (const [name, approved] of APPENDS) {
      extend(`<Rule name="${name}" priority="Critical">`, "</Rule>", (whole) => whole.replace(" </Rule>", ` ${approved} </Rule>`));
    }
    extend('<Check id="FS233">', "</Check>", (whole) =>
      `${whole} <Check id="FS234">${APPROVED.fs234}</Check> <Check id="FS235">${APPROVED.fs235}</Check>`);
    extend('<Case id="PractitionerCorpusRecoveries">', "</Case>", (whole) =>
      `${whole} ${CASES.map(([id, prompt, behavior]) => `<Case id="${id}"> <Prompt> ${prompt} </Prompt> <ExpectedBehavior> ${behavior} </ExpectedBehavior> </Case>`).join(" ")}`);
    expect(normalize(text)).toBe(expected);

    // Independent of fixture edits: only the root attributes, revision, new rule, three appends, checks and cases differ.
    let exact = replaceOnce(prior, `version="${PINS.from.version}" revisionDate="2026-10-15"`, `version="${PINS.to.version}" revisionDate="2026-10-16"`);
    const revision = `  <Revision version="${PINS.to.version}" priority="Critical">${element(text, "Revision", "version", PINS.to.version)}</Revision>`;
    exact = replaceOnce(exact, " <RevisionHistory>\n", ` <RevisionHistory>\n${revision}\n`);
    const document = `  <Rule name="DocumentSignal" priority="High">${element(prior, "Rule", "name", "DocumentSignal")}</Rule>`;
    const rule = `  <Rule name="ProposeDiscriminatingTest" priority="Critical">${element(text, "Rule", "name", "ProposeDiscriminatingTest")}</Rule>`;
    exact = replaceOnce(exact, document, `${document}\n\n${rule}`);
    for (const [name] of APPENDS) {
      exact = replaceOnce(exact, element(prior, "Rule", "name", name), element(text, "Rule", "name", name));
    }
    const fs233 = lineStarting(prior, '  <Check id="FS233">');
    exact = replaceOnce(exact, fs233, `${fs233}\n  <Check id="FS234">${APPROVED.fs234}</Check>\n  <Check id="FS235">${APPROVED.fs235}</Check>`);
    const practitioner = `  <Case id="PractitionerCorpusRecoveries">${element(prior, "Case", "id", "PractitionerCorpusRecoveries")}</Case>`;
    const cases = CASES.map(([id]) => `  <Case id="${id}">${element(text, "Case", "id", id)}</Case>`).join("\n");
    exact = replaceOnce(exact, practitioner, `${practitioner}\n${cases}`);
    expect(text).toBe(exact);
  });

  it("wraps every new line within 118 characters apart from the root and the two one-line checks", async () => {
    const [text, prior] = await Promise.all([load(), loadPrior()]);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    const long = added.filter((line) => line.length > WIDTH).map((line) => /^ *<\w+ (?:name|id)="([^"]+)"/u.exec(line)?.[1]);
    expect(long).toEqual(["HRP", "FS234", "FS235"]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });
});
