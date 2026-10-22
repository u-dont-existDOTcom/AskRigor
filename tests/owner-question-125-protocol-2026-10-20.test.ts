import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { coreSectionNames, getProtocolManifest, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  undoOwnerQuestion109Hrp, undoOwnerQuestion125Hrp, undoOwnerQuestions152And153Hrp, undoReadDepth,
} from "./helpers/undo-read-depth.js";

// Independent of the recorded edit fixture: owner question 125's approved sentence, word for word (answer "125a",
// 2026-10-20, from lesson #38), the first sentence it follows, the stress case from the report's own example, and the
// revision note.
const APPROVED = "When the question is whether two product names or labels refer to the same thing, answer both parts: what the names mean chemically, from authoritative documentation, and how sellers and buyers actually use them, from vendor labels and buyer or specialist discussions; skip the second part only with a reason stated in the answer.";
const FIRST_SENTENCE = "Forum review need not activate for a simple definition, a purely chemical or mechanistic question with no real-world outcome claim, an acute emergency before triage is complete, or a topic with no meaningful user-experience corpus.";
const RULE = "ForumSignalNonTrigger";
const CASE = {
  id: "ProductNameEquivalence",
  prompt: "A user asks whether a peptide sold as “NA-Peptide Z” is the same product as “Peptide Z-amidate”, while suppliers also list “N-acetyl Peptide Z-amidate”.",
  expected: "Answer both parts: what each name means chemically, from authoritative documentation, and how sellers and buyers actually use the names, from vendor labels and buyer or specialist discussions, including which variants they tell apart and whether they use the short names consistently; a chemistry-only answer states why it skipped the second part.",
} as const;
const REVISION = "Owner-approved, question 125 (2026-10-20), from lesson #38: ForumSignalNonTrigger now says that a question whether two product names or labels refer to the same thing has two parts, what the names mean chemically and how sellers and buyers actually use them, and that the second is skipped only with a reason stated in the answer; with stress case ProductNameEquivalence.";
// Owner question 126, answer "126a" (2026-10-20), from lessons #39 to #42: one rule moved word for word into a core
// section, as [rule, its section in HRP 20.6.27, its core section], with the rule it preceded there; the owner's
// sentence at the end of RelevanceBeforeWarning; the four reports' own examples as stress cases; the revision note.
const Q126 = {
  move: ["IndividualAttributionVsPopulationEffect", "AdverseEventAscertainmentAndActionabilityAudit", "EvidenceLayers"],
  next: "UnknownToolboxIsNotProof",
  rule: "RelevanceBeforeWarning",
  sentence: "That an experience can be a symptom of a disorder does not make it, or paying attention to it, a cause of that disorder: support each direction with its own evidence, and warn against a practice only for a risk shown for that practice.",
  cases: [
    ["UnmatchedReplicationNull",
      "A 16-person study reports a response to right-sided patterned stimulation only in its 8 highly susceptible participants; a later blinded, sham-controlled study of 90 people, with a different setup, finds no overall effect, and the user asks whether the first result was disproven.",
      "Reconstruct each study's exact claim: who took part and how susceptible they were, where and how the stimulation was given, the control and the outcome; say whether the later study tested the same conditional claim, with its full-sample and any subgroup results; report both results, keep the small subgroup result a hypothesis, not independent confirmation, and call the effect neither disproven nor established."],
    ["MindfulAuraObservation",
      "A sense of familiarity can be a seizure aura in some people with epilepsy; a user who sometimes notices that sensation asks whether observing it mindfully is risky.",
      "Keep apart the sensation as a possible symptom of a seizure disorder, the sensation as a cause of seizures, and mindful observation as a cause, and support each with its own evidence; mention that it can be a seizure sign only as a point about the symptom, not as a risk of the practice; warn against the practice only for a risk shown for it, and do not call it risk-free because no risk was found."],
    ["QualifiedLateralityShorthand",
      "A made-up textbook's diagram says “the right unit is fear-only”, and a later chapter notes that some subjects have the two units reversed; a review says the author is unaware of reversed mapping.",
      "Read the whole text for the author's qualifications before judging the claim; say that the author acknowledges reversal, citing both the diagram and the later passage; tell the typical-case shorthand apart from a universal claim, criticize only the strongest reading the whole text supports, and test whether the typical-case claim has evidence."],
    ["GroupLateralityAverage",
      "A made-up imaging study finds a mean 2% greater right-side activation during a task, while some participants have fully reversed dominance for it; a reviewer calls the right hemisphere the seat of the task in every person.",
      "Call the finding a group average, which does not show where the function sits in any one person; name the reversed participants; say what would show it for an individual, such as a task localizer, stimulation or lesion evidence in that person, or an analysis of how many are reversed; do not call the average meaningless."],
  ],
  revision: "Owner-approved, question 126 (2026-10-20), from lessons #39 to #42: moved IndividualAttributionVsPopulationEffect word for word from AdverseEventAscertainmentAndActionabilityAudit into the core section EvidenceLayers; RelevanceBeforeWarning now ends by saying that an experience that can be a symptom of a disorder is not therefore a cause of it, nor is paying attention to it, and that a practice is warned against only for a risk shown for that practice; with stress cases UnmatchedReplicationNull, MindfulAuraObservation, QualifiedLateralityShorthand and GroupLateralityAverage.",
} as const;
// Owner question 128, answer "128b" (2026-10-20), from lesson #44: final check FS240 directly after FS239, in the markup
// of FS236 to FS239, and two stress cases after question 126's; the Universal wording it names is in
// health_labs_supplements_environmental_health.
const Q128 = {
  check: ["FS240", "For a question about how safe an exposure is, the serious harms plausible for it were listed and searched apart from its common side effects, and any not searched were named as not checked (Universal health_labs_supplements_environmental_health)."],
  after: ["FS236", "FS237", "FS238", "FS239"],
  cases: [
    ["SeriousHarmBeyondCommonEffects",
      "A user asks how dangerous a prescribed injected hormone is over several months compared with experimental injected peptides that raise it; the first searches cover swelling, blood sugar, joint pain and cancer.",
      "List the serious harms plausible for these injections, including severe allergic reactions, and search each by name in the licensed product's label and post-marketing reports, trials' serious-event tables and case reports. Keep a label warning for the licensed product apart from uncertain reports about the experimental products; give no rate without a denominator and do not blame one ingredient of a combination. Say that earlier tolerated doses do not rule out a later reaction, give the emergency signs briefly, and keep the comparison provisional while the serious-harm search is incomplete."],
    ["SeriousOrganHarmOralMedicine",
      "A user compares the safety of two oral medicines; one has an uncommon but serious liver warning, and the short trials found report only mild side effects.",
      "Find the liver warning through the label and post-marketing reports, say what the short trials could and could not detect, and add no warning that does not apply to these medicines."],
  ],
  revision: "Owner-approved, question 128 (2026-10-20), from lesson #44: added final check FS240, which asks whether, for a question about how safe an exposure is, the serious harms plausible for it were listed and searched apart from its common side effects and any not searched were named as not checked; with stress cases SeriousHarmBeyondCommonEffects and SeriousOrganHarmOralMedicine.",
} as const;
// Owner question 130, answer "130a" (2026-10-20), from UDA #372: the owner's sentence at the end of the rule.
const Q130 = {
  rule: "StudyReadDepthDisclosure",
  sentence: "Give a material funding source, or the authors' employment by the maker, beside the result in the same way; a statement that a study had no outside funding does not make it independent of the maker.",
  revision: "Owner-approved, question 130 (2026-10-20), from UDA #372: StudyReadDepthDisclosure now puts a material funding source, or the authors' employment by the maker, beside the result, and says that a statement of no outside funding does not make a study independent of the maker.",
} as const;
// Owner question 132, answer "132a" (2026-10-20), from UDA #390: exactly this clause, directly after the words it
// follows in the core rule, and nothing else.
const Q132 = {
  rule: "EvidenceLayersAreNotAFixedDiscoveryOrder",
  at: "For real-world intervention questions,",
  clause: "including a symptom or abnormal test result for which the user names no candidate,",
  revision: "Owner-approved, question 132 (2026-10-20), from UDA #390: EvidenceLayersAreNotAFixedDiscoveryOrder now says that the real-world intervention questions given early bounded sampling include a symptom or abnormal test result for which the user names no candidate.",
} as const;
const REVISIONS = [REVISION, Q126.revision, Q128.revision, Q130.revision, Q132.revision] as const;
const CASES = [[CASE.id, CASE.prompt, CASE.expected], ...Q126.cases, ...Q128.cases] as const;
const checkXml = ([id, text]: readonly [string, string]) => `  <Check id="${id}">${text}</Check>`;
const PINS = {
  from: { version: "20.6.27", sha256: "e6db59c14c78f3d53b04b8d36ce514eecfcaaec1cf7f9d176d7b8ad665b2e2fe" },
  to: { version: "20.6.28", sha256: "a38e3e76b0983f9d4545325a90c6e14b76d087750600ce99623b3ec4aa22cef4" },
} as const;
// The HRP core (sum of its section bytes) before and after this layer, both one page: the moved rule, the sentence at
// the end of RelevanceBeforeWarning and question 132's clause are in it.
const CORE_BYTES = { before: 38_208, after: 38_935 } as const;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const loadCurrent = () => readFile(new URL("protocols/HRP_Full.xml", ROOT), "utf8");
// HRP 20.6.28, this layer's result, rebuilt from the current file.
const load = async () => undoOwnerQuestions152And153Hrp(await loadCurrent());
// The state before this layer, from the current file.
const undo125 = async () => undoOwnerQuestion125Hrp(await loadCurrent());
const CURRENT = { version: "20.6.30", revisionDate: "2026-10-22", sha256: "b7c1df6eb235bcd1423e4d8fdb86245887e3cd0eac3f469f6cc91619a5c91ef8" } as const;
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}
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
// A rule's lines in `text`, from the start of its first line to its closing tag.
function ruleLines(text: string, name: string): string {
  const open = `<Rule name="${name}"`;
  expect(text.split(open), name).toHaveLength(2);
  const start = text.lastIndexOf("\n", text.indexOf(open)) + 1;
  return text.slice(start, text.indexOf("</Rule>", start) + "</Rule>".length);
}
// A rule's first line up to the end of its opening tag.
function openingLine(text: string, name: string): string {
  const lines = ruleLines(text, name);
  return lines.slice(0, lines.indexOf(">") + 1);
}
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(text: string, indent: number): string {
  const lines: string[] = [];
  let line = " ".repeat(indent);
  for (const word of text.split(" ")) {
    if (line.trim() && line.length + 1 + word.length > 118) {
      lines.push(line);
      line = " ".repeat(indent);
    }
    line += (line.trim() ? " " : "") + word;
  }
  return [...lines, line].join("\n");
}
const caseXml = (id: string, prompt: string, expected: string) =>
  `  <Case id="${id}">\n   <Prompt>\n${wrapped(prompt, 4)}\n   </Prompt>\n` +
  `   <ExpectedBehavior>\n${wrapped(expected, 4)}\n   </ExpectedBehavior>\n  </Case>`;
const REVISION_XML = `  <Revision version="20.6.28" priority="Critical">\n${REVISIONS.map((part) => wrapped(part, 3)).join("\n")}\n  </Revision>`;
const caseNames = (text: string) => [...section(text, "StressTestExpectations").matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
const ruleNames = (text: string, tag: string) => [...section(text, tag).matchAll(/<Rule name="([^"]+)"/gu)].map((match) => match[1]);

// The line of EvidenceLayersAreNotAFixedDiscoveryOrder where question 132's clause goes, and the same words with it.
function samplingLines(prior: string): [string, string] {
  const lines = ruleLines(prior, Q132.rule).split("\n").filter((line) => line.includes(`${Q132.at} use early bounded`));
  expect(lines).toHaveLength(1);
  return [lines[0]!, wrapped(lines[0]!.trim().replace(Q132.at, `${Q132.at} ${Q132.clause}`), 3)];
}

// Construct the authorized change whitelist independently of the recorded edit fixture.
function expectedEdits(prior: string): Array<[string, string]> {
  // The rule's line that ends its first sentence, and the next line, which starts its second.
  const rule = element(prior, "Rule", "name", RULE);
  const lines = rule.split("\n");
  const end = lines.findIndex((line) => line.endsWith(" user-experience corpus."));
  expect(normalize(lines.slice(0, end + 1).join(" "))).toBe(FIRST_SENTENCE);
  const [ending, next] = [lines[end]!, lines[end + 1]!];
  // The cases go directly before the one that follows ConditionsGiven, question 120's last case.
  const coded = '  <Case id="CodedFormulaLargeEffect">';
  expect(prior).toContain(`</ExpectedBehavior>\n  </Case>\n${coded}`);
  // Each sentence that ends a rule starts its own line after the rule's last line.
  const relevanceEnd = ruleLines(prior, Q126.rule).split("\n").slice(-2, -1).join("\n");
  const depthEnd = ruleLines(prior, Q130.rule).split("\n").slice(-3, -1).join("\n");
  const [sampling, withClause] = samplingLines(prior);
  const [moved] = Q126.move;
  const fs239 = prior.split("\n").filter((line) => line.startsWith('  <Check id="FS239">'));
  expect(fs239).toHaveLength(1);
  return [
    ['version="20.6.27" revisionDate="2026-10-18"', 'version="20.6.28" revisionDate="2026-10-20"'],
    [" <RevisionHistory>\n", ` <RevisionHistory>\n${REVISION_XML}\n`],
    [`${ending}\n${next}`, `${ending}\n${wrapped(APPROVED, 3)}\n${next}`],
    [coded, `${CASES.map(([id, prompt, expected]) => caseXml(id, prompt, expected)).join("\n")}\n${coded}`],
    [`${relevanceEnd}\n  </Rule>`, `${relevanceEnd}\n${wrapped(Q126.sentence, 3)}\n  </Rule>`],
    [sampling, withClause],
    // The move, as question 123's: an insertion at the end of the core section and an anchored deletion.
    ["\n\n </EvidenceLayers>", `\n\n${ruleLines(prior, moved)}\n\n </EvidenceLayers>`],
    [`${ruleLines(prior, moved)}\n\n${openingLine(prior, Q126.next)}`, openingLine(prior, Q126.next)],
    [`${depthEnd}\n  </Rule>`, `${depthEnd}\n${wrapped(Q130.sentence, 3)}\n  </Rule>`],
    [fs239[0]!, `${fs239[0]!}\n${checkXml(Q128.check)}`],
  ];
}

describe('owner-approved question 125: "125a" (2026-10-20), with 126, 128, 130 and 132 in the same layer', () => {
  it("chains the exact HRP predecessor, derives the manifest from the bytes, and reverses every layer", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-20-owner-question-125-hrp.json", ROOT,
    ), "utf8")) as { purpose: string; hrp: Edits };
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    expect(recorded.purpose).toContain('Owner-approved question 125, from the owner\'s answer "125a" (2026-10-20)');
    expect(recorded.purpose).toContain('questions 126, 128, 130 and 132, answers "126a", "128b", "130a" and "132a" (2026-10-20)');
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-17-owner-question-109-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
    const fixture = recorded.hrp;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(10);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits).toEqual(expectedEdits(prior));
    expect(expectedEdits(prior).reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    expect(expectedEdits(prior).reduce((text, [before, after]) =>
      replaceOnce(text, normalize(before), normalize(after)), normalize(prior))).toBe(normalize(current));
    await expect(undo125()).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoOwnerQuestion109Hrp(await loadCurrent())).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8")).hrp as Edits;
    expect(hash(await undoReadDepth(await loadCurrent(), "hrp"))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: CURRENT.version, revisionDate: CURRENT.revisionDate, sha256: CURRENT.sha256,
    });
    expect(hash(await loadCurrent())).toBe(CURRENT.sha256);
  });

  it("adds the approved sentence word for word to ForumSignalNonTrigger, directly after its first sentence", async () => {
    const text = await load();
    const prior = await undo125();
    const before = plain(element(prior, "Rule", "name", RULE));
    expect(before.startsWith(`${FIRST_SENTENCE} Nonactivation is an affirmative relevance decision`)).toBe(true);
    expect(plain(element(text, "Rule", "name", RULE))).toBe(`${FIRST_SENTENCE} ${APPROVED}${before.slice(FIRST_SENTENCE.length)}`);
    expect(normalize(text).split(APPROVED)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(APPROVED);
    // The rule stays where it was: a runtime section outside the core.
    expect(protocolNamedElements(text, RULE)).toMatchObject([{ tag: "Rule", section: "AnswerShapeController" }]);
    expect(protocolNamedElements(prior, RULE)).toMatchObject([{ tag: "Rule", section: "AnswerShapeController" }]);
    expect(coreSectionNames("hrp")).not.toContain("AnswerShapeController");
    expect(protocolSections("hrp", text).find(({ name }) => name === "AnswerShapeController")).toMatchObject({ core: false, runtime: true });
  });

  it("keeps each stress case's prompt and expected behavior word for word, in order after ConditionsGiven", async () => {
    const text = await load();
    for (const [id, prompt, expected] of CASES) {
      const body = element(section(text, "StressTestExpectations"), "Case", "id", id);
      expect(plain(section(body, "Prompt")), id).toBe(prompt);
      expect(plain(section(body, "ExpectedBehavior")), id).toBe(expected);
      expect(`  <Case id="${id}">${body}</Case>`).toBe(caseXml(id, prompt, expected));
      expect(caseNames(text).filter((name) => name === id)).toHaveLength(1);
    }
    for (const name of ["“NA-Peptide Z”", "“Peptide Z-amidate”", "“N-acetyl Peptide Z-amidate”"]) expect(CASE.prompt).toContain(name);
    const cases = caseNames(text);
    const at = cases.indexOf("ConditionsGiven");
    expect(cases.slice(at, at + CASES.length + 2)).toEqual(["ConditionsGiven", ...CASES.map(([id]) => id), "CodedFormulaLargeEffect"]);
    const prior = await undo125();
    for (const [id] of CASES) expect(caseNames(prior)).not.toContain(id);
  });

  it("moves IndividualAttributionVsPopulationEffect into the core section EvidenceLayers, word for word and only once", async () => {
    const [name, from, to] = Q126.move;
    const text = await load();
    const prior = await undo125();
    expect(protocolNamedElements(prior, name)).toMatchObject([{ tag: "Rule", section: from }]);
    expect(protocolNamedElements(text, name)).toMatchObject([{ tag: "Rule", section: to }]);
    expect(coreSectionNames("hrp")).toContain(to);
    expect(coreSectionNames("hrp")).not.toContain(from);
    // Its bytes, indentation included, are unchanged.
    expect(ruleLines(text, name)).toBe(ruleLines(prior, name));
    expect(plain(element(text, "Rule", "name", name))).toBe(plain(element(prior, "Rule", "name", name)));
    // It ends EvidenceLayers, after question 123's AverageNullDoesNotRuleOutConditionalEffect, and its old section
    // closes the gap it left.
    expect(ruleNames(text, to)).toEqual([...ruleNames(prior, to), name]);
    expect(ruleNames(prior, to).at(-1)).toBe("AverageNullDoesNotRuleOutConditionalEffect");
    expect(text).toContain(`${ruleLines(text, name)}\n\n </EvidenceLayers>`);
    expect(ruleNames(text, from)).toEqual(ruleNames(prior, from).filter((rule) => rule !== name));
    const old = ruleNames(prior, from);
    expect(old[old.indexOf(name) + 1]).toBe(Q126.next);
    expect(text).toContain(`  </Rule>\n\n${openingLine(text, Q126.next)}`);
  });

  it("ends RelevanceBeforeWarning, in the core, with question 126's sentence word for word", async () => {
    const text = await load();
    const prior = await undo125();
    expect(plain(element(text, "Rule", "name", Q126.rule))).toBe(`${plain(element(prior, "Rule", "name", Q126.rule))} ${Q126.sentence}`);
    expect(normalize(text).split(Q126.sentence)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(Q126.sentence);
    expect(Q126.sentence).not.toMatch(/[&<>\n]/u);
    expect(protocolNamedElements(text, Q126.rule)).toMatchObject([{ tag: "Rule", section: "EpistemicSafetyRules" }]);
    expect(coreSectionNames("hrp")).toContain("EpistemicSafetyRules");
  });

  it("ends StudyReadDepthDisclosure with question 130's sentence word for word", async () => {
    const text = await load();
    const prior = await undo125();
    expect(plain(element(text, "Rule", "name", Q130.rule))).toBe(`${plain(element(prior, "Rule", "name", Q130.rule))} ${Q130.sentence}`);
    expect(normalize(text).split(Q130.sentence)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(Q130.sentence);
    expect(Q130.sentence).not.toMatch(/[&<>\n]/u);
    expect(protocolNamedElements(text, Q130.rule)).toMatchObject([{ tag: "Rule", section: "UniversalFullTextAcquisitionProtocol" }]);
  });

  it("inserts exactly question 132's clause into the core rule EvidenceLayersAreNotAFixedDiscoveryOrder, and nothing else", async () => {
    const text = await load();
    const prior = await undo125();
    const before = plain(element(prior, "Rule", "name", Q132.rule));
    expect(before.split(`${Q132.at} use early bounded sampling across the relevant layers`)).toHaveLength(2);
    expect(plain(element(text, "Rule", "name", Q132.rule))).toBe(before.replace(`${Q132.at} `, `${Q132.at} ${Q132.clause} `));
    expect(normalize(text)).toContain(`${Q132.at} ${Q132.clause} use early bounded sampling across the relevant layers`);
    expect(normalize(text).split(Q132.clause)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(Q132.clause);
    expect(protocolNamedElements(text, Q132.rule)).toMatchObject([{ tag: "Rule", section: "EvidenceLayers" }]);
  });

  it("adds question 128's final check FS240 word for word, directly after FS239 and in the markup of FS236 to FS239", async () => {
    const text = await load();
    const prior = await undo125();
    const [id, body] = Q128.check;
    expect(plain(element(text, "Check", "id", id))).toBe(body);
    expect(protocolNamedElements(prior, id)).toEqual([]);
    expect(protocolNamedElements(text, id)).toMatchObject([{ tag: "Check", section: "FinalSelfCheck" }]);
    // One line, indented like its neighbours, with its text as approved: no markup, and only the rule it names.
    const lines = text.split("\n");
    const at = lines.indexOf(checkXml(Q128.check));
    expect(at).toBeGreaterThan(0);
    for (const [offset, neighbour] of Q128.after.entries()) {
      const line = lines[at - Q128.after.length + offset]!;
      expect(line).toMatch(new RegExp(`^  <Check id="${neighbour}">[^<\\n]+</Check>$`, "u"));
      expect(prior.split("\n")).toContain(line);
    }
    expect(lines[at]).toMatch(/^ {2}<Check id="FS240">[^<\n]+<\/Check>$/u);
    expect(lines[at + 1]!.startsWith('  <Check id="FS202">')).toBe(true);
    expect(body).not.toMatch(/[&<>]/u);
    expect(normalize(text).split(body)).toHaveLength(2);
  });

  it("places the exact Critical revision first, wrapped like its neighbours", async () => {
    const text = await load();
    const prior = await undo125();
    expect(plain(element(text, "Revision", "version", PINS.to.version))).toBe(REVISIONS.join(" "));
    expect(section(prior, "RevisionHistory").trimStart().startsWith(`<Revision version="${PINS.from.version}" priority="Critical">`)).toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${REVISION_XML}${section(prior, "RevisionHistory")}`);
  });

  it("wraps new lines at 118, apart from the root line and the one-line check, like its neighbours", async () => {
    const text = await load();
    const prior = await undo125();
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    expect(added.filter((line) => line.length > 118)).toEqual([text.split("\n")[1], checkXml(Q128.check)]);
    for (const line of added) expect(line).toBe(line.trimEnd());
  });

  it("changes only the sections its edits name, by their exact bytes; the core stays one page", async () => {
    const text = await load();
    const prior = await undo125();
    const [now, before] = [protocolSections("hrp", text), protocolSections("hrp", prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    expect(changed).toEqual(["RevisionHistory", "AnswerShapeController", "AdverseEventAscertainmentAndActionabilityAudit",
      "EpistemicSafetyRules", "EvidenceLayers", "UniversalFullTextAcquisitionProtocol", "StressTestExpectations",
      "FinalSelfCheck"]);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    const size = (value: string) => Buffer.byteLength(value, "utf8");
    const delta = (name: string) => bytes(now, name) - bytes(before, name);
    const moved = size(ruleLines(prior, Q126.move[0])) + 2;
    const [sampling, withClause] = samplingLines(prior);
    expect(delta("AnswerShapeController")).toBe(size(`${wrapped(APPROVED, 3)}\n`));
    expect(delta("AdverseEventAscertainmentAndActionabilityAudit")).toBe(-moved);
    expect(delta("EpistemicSafetyRules")).toBe(size(`${wrapped(Q126.sentence, 3)}\n`));
    expect(delta("EvidenceLayers")).toBe(moved + size(withClause) - size(sampling));
    expect(delta("UniversalFullTextAcquisitionProtocol")).toBe(size(`${wrapped(Q130.sentence, 3)}\n`));
    expect(delta("StressTestExpectations"))
      .toBe(CASES.reduce((sum, [id, prompt, expected]) => sum + size(`${caseXml(id, prompt, expected)}\n`), 0));
    expect(delta("FinalSelfCheck")).toBe(size(`\n${checkXml(Q128.check)}`));
    const core = (sections: typeof now) => sections.filter(({ core }) => core).reduce((sum, { bytes }) => sum + bytes, 0);
    expect(core(before)).toBe(CORE_BYTES.before);
    expect(core(now)).toBe(CORE_BYTES.after);
    expect(core(now) - core(before)).toBe(delta("EpistemicSafetyRules") + delta("EvidenceLayers"));
  });

  it("load_protocol serves each changed rule and each case by name as exact canonical bytes, and the core as one page", async () => {
    const server = createAskRigorServer();
    const client = new Client({ name: "owner-question-125-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      // The server serves the current file.
      const text = await loadCurrent();
      const bytes = Buffer.from(text, "utf8");
      for (const name of [RULE, Q126.move[0], Q126.rule, Q130.rule, Q132.rule, Q128.check[0], ...CASES.map(([id]) => id)]) {
        const found = protocolNamedElements(text, name);
        expect(found).toHaveLength(1);
        const canonical = bytes.subarray(found[0]!.byte_start, found[0]!.byte_end_exclusive).toString("utf8");
        const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: name } });
        expect(response.isError).not.toBe(true);
        expect(response.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      }
      const rule = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: RULE } });
      expect(plain((rule.structuredContent as { text: string }).text.replace(/^<Rule[^>]*>|<\/Rule>$/gu, ""))).toContain(APPROVED);
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1 });
      const core = (response.structuredContent as { text: string }).text;
      expect(core).toContain(ruleLines(text, Q126.move[0]).trimStart());
      expect(normalize(core)).toContain(Q126.sentence);
      expect(normalize(core)).toContain(`${Q132.at} ${Q132.clause}`);
      expect(normalize(core)).not.toContain(Q130.sentence);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
