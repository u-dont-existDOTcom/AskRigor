import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import {
  coreSectionNames, getProtocolManifest, loadProtocolSectionSnapshot, PROTOCOL_PAGE_MAX_BYTES, protocolNamedElements,
  protocolSections,
} from "@askrigor/protocol";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  undoBookReviewsUniversal, undoOwnerQuestion125Hrp, undoOwnerQuestion153Universal, undoOwnerQuestions152And153Hrp,
  undoReadDepth,
} from "./helpers/undo-read-depth.js";

type Protocol = "hrp" | "universal";

// Independent of the recorded edit fixtures: the owner's approved wording of 2026-10-21, word for word (answers "152a"
// and "153a,b,c"), where each piece goes, the two lessons' own cases as stress cases, and the revision notes.
// Answer 152a, from lessons #47 and #48: a sentence at the end of each of two core rules.
const Q152 = {
  followUp: {
    rule: "HealthFollowUpInformationGain",
    section: "HeterodoxEpistemology",
    // The rule is one line, and its text ends with these words.
    end: "before elaborating a mechanism.",
    sentence: "When a symptom's onset or course is unknown and could reorder the explanations, ask early whether it began recently or long ago and whether it has changed, without pressing for a date or reading an approximate answer as a lifelong pattern, and prefer one question that could reorder several explanations to a series of questions that each test one.",
  },
  warning: {
    rule: "RelevanceBeforeWarning",
    section: "EpistemicSafetyRules",
    // The owner's 126a sentence, which ended the rule in HRP 20.6.28.
    follows: "That an experience can be a symptom of a disorder does not make it, or paying attention to it, a cause of that disorder: support each direction with its own evidence, and warn against a practice only for a risk shown for that practice.",
    sentence: "When a familiar, stable symptom comes with an activity the person must do anyway, recording ordinary episodes is observation, not provocation: caution only against extra or intensified repetitions and pushing through worsening, and advise avoiding the activity only for a risk shown for it, with a practical alternative.",
  },
  // Each lesson's own invented case, after question 128's last case.
  cases: [
    ["OnsetBeforeMechanisms",
      "A person describes profound fatigue only during wrapping parcels, while carrying boxes, cleaning floors and standing at a desk remain well tolerated.",
      "First exclude acute danger, ask within the first two clarifications whether episodes began recently or years ago and whether worsening is progressive, record the tolerated comparisons, then use only questions that could change the ranking; do not ask successively about lights, hunger, stress, humidity and room temperature without asking when episodes began. If the person cannot recall onset but says “many years”, preserve that uncertainty."],
    ["ObservationNotProvocation",
      "A person has an unchanged, short-lived feeling of wrist tiredness after routine note-taking for many years and must write notes at work, without new weakness, numbness or acute signs. They ask whether tracking the next few ordinary note-taking sessions is useful.",
      "Treat recording ordinary sessions as observation: say they need not write additional notes solely for an experiment; since they already have to write, they can record normal sessions and try a reversible ergonomic adjustment if comfortable, without pushing through worsening symptoms, and seek medical review if red flags arise. Do not warn against deliberately provoking another episode or advise avoiding testing it."],
  ],
  revision: "Owner-approved, answer 152a (2026-10-21), from lessons #47 and #48: HealthFollowUpInformationGain now ends by saying to ask early whether a symptom whose onset or course is unknown, and could reorder the explanations, began recently or long ago and whether it has changed, without pressing for a date, and to prefer one question that could reorder several explanations; RelevanceBeforeWarning now ends by saying that recording ordinary episodes of a familiar, stable symptom that comes with an activity the person must do anyway is observation, not provocation; with stress cases OnsetBeforeMechanisms and ObservationNotProvocation.",
} as const;
// Answers 153a and 153b, from bug reports AskRigor#355 and #356: a sentence at the end of each of two HRP rules outside
// the core. Answer 153c, from AskRigor#356: a clause in Universal's serious-harm sentence (question 128's, in the core).
const Q153 = {
  inventory: {
    rule: "TreatmentSpaceInventoryBeforeSelection",
    section: "TreatmentLandscapeAndVideoSelectionGate",
    sentence: "The same inventory governs the study search and any comparison or ranking, in a first pass too: search each materially plausible class by name at least once, or say in the answer that it was not researched.",
  },
  nnt: {
    rule: "NNTAndNNH",
    section: "StatisticalAndClinicalInterpretation",
    sentence: "Give an NNT or NNH with both groups' rates and the follow-up beside it, rounding the reciprocal up, and beside a benefit figure give the harms measured over the same follow-up, or say that none were found.",
  },
  revision: "Owner-approved, answers 153a and 153b (2026-10-21), from bug reports AskRigor#355 and #356: TreatmentSpaceInventoryBeforeSelection now says that the same inventory governs the study search and any comparison or ranking, in a first pass too, with each materially plausible class searched by name or said in the answer not to be researched (153a); NNTAndNNH now gives an NNT or NNH with both groups' rates and the follow-up, rounds the reciprocal up, and puts beside a benefit figure the harms measured over the same follow-up, or says that none were found (153b).",
  universal: {
    section: "health_labs_supplements_environmental_health",
    before: "When asked how safe an exposure is, or which option is safer, list the serious harms",
    after: "When asked how safe an exposure is, or which option is safer, or when the answer ranks or puts forward a medicine likely to be taken for months or years, list the serious harms",
    // The rest of question 128's wording, unchanged, and the sentence it follows on the same line.
    rest: "plausible for that exposure, its route and the people using it, from its labels, regulators' warnings and pharmacology, and search for each by name and its synonyms in labels and post-marketing reports, trials' serious-event and withdrawal tables, and case reports, apart from the search for common side effects. Order them by severity and urgency, not by how often sources mention them. A serious harm not searched for is reported as not checked, not as absent; a small or short study that found none does not rule it out; and doses tolerated before do not rule out a later reaction. Give the warning signs that need emergency care early and briefly.",
    follows: "Keep adverse events, serious events, neurological outcomes, hospitalization, death, and case-fatality separate.",
    lineStart: "Rank hypotheses by base rate, danger if missed, plausibility, testability,",
    revision: "Owner-approved, answer 153c (2026-10-21), from bug report AskRigor#356: the serious harms are listed and searched by name not only when asked how safe an exposure is, or which option is safer, but also when the answer ranks or puts forward a medicine likely to be taken for months or years (health_labs_supplements_environmental_health).",
  },
} as const;
const HRP_SENTENCES = [
  [Q152.followUp.rule, Q152.followUp.section, Q152.followUp.sentence],
  [Q152.warning.rule, Q152.warning.section, Q152.warning.sentence],
  [Q153.inventory.rule, Q153.inventory.section, Q153.inventory.sentence],
  [Q153.nnt.rule, Q153.nnt.section, Q153.nnt.sentence],
] as const;
const PINS = {
  hrp: {
    from: { version: "20.6.28", sha256: "a38e3e76b0983f9d4545325a90c6e14b76d087750600ce99623b3ec4aa22cef4" },
    to: { version: "20.6.29", sha256: "a72aed35746b86b084398cdb92fa1d36dac2d2941b31feea34e242678cf49b79" },
  },
  universal: {
    from: { version: "20.5.45", sha256: "564c8697fdd4aa69f08b0ecba228ca47cc7dc3e022e6ef55d84ea14f86fb416e" },
    to: { version: "20.5.46", sha256: "e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e" },
  },
} as const;
const REVISION_DATE = "2026-10-21";
const NAMES = { hrp: "HRP", universal: "AskRigor.com universal saved instructions" } as const;
const FIXTURES = {
  hrp: ["2026-10-21-owner-questions-152-153-hrp.json", "2026-10-20-owner-question-125-hrp.json"],
  universal: ["2026-10-21-owner-question-153-universal.json", "2026-10-20-book-reviews-universal.json"],
} as const;
// Each core, as the sum of its section bytes, before and after this layer; served with two bytes between sections, each
// stays one page.
const CORE_BYTES = { hrp: { before: 38_935, after: 39_614 }, universal: { before: 25_114, after: 25_206 } } as const;
const WIDTH = 118;
const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const size = (text: string) => Buffer.byteLength(text, "utf8");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
const plain = (body: string) => normalize(parser.parse(`<text>${body}</text>`).text as string);
const load = (protocol: Protocol) => readFile(new URL(
  `protocols/${protocol === "hrp" ? "HRP_Full.xml" : "Universal_Instructions.xml"}`, ROOT,
), "utf8");
const undoLayer = (protocol: Protocol, text: string) =>
  (protocol === "hrp" ? undoOwnerQuestions152And153Hrp : undoOwnerQuestion153Universal)(text);
const undoPrevious = (protocol: Protocol, text: string) =>
  (protocol === "hrp" ? undoOwnerQuestion125Hrp : undoBookReviewsUniversal)(text);
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
    if (line.trim() && line.length + 1 + word.length > WIDTH) {
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
const caseNames = (text: string) => [...section(text, "StressTestExpectations").matchAll(/<Case id="([^"]+)"/gu)].map((match) => match[1]);
const HRP_REVISIONS = [Q152.revision, Q153.revision] as const;
const HRP_REVISION_XML = `  <Revision version="20.6.29" priority="Critical">\n${HRP_REVISIONS.map((part) => wrapped(part, 3)).join("\n")}\n  </Revision>`;
const UNIVERSAL_REVISION_XML = `<revision version="20.5.46" priority="Critical">\n${wrapped(Q153.universal.revision, 0)}\n</revision>`;
// A wrapped rule's last line, which the new sentence follows on a line of its own, as questions 126's and 130's did.
const lastLine = (text: string, name: string) => ruleLines(text, name).split("\n").slice(-2, -1).join("\n");

// Construct the authorized change whitelist independently of the recorded edit fixtures.
function expectedEdits(protocol: Protocol, prior: string): Array<[string, string]> {
  if (protocol === "universal") {
    return [
      ['version="20.5.45" revisionDate="2026-10-20"', 'version="20.5.46" revisionDate="2026-10-21"'],
      ["<revision_history>\n", `<revision_history>\n${UNIVERSAL_REVISION_XML}\n`],
      [Q153.universal.before, Q153.universal.after],
    ];
  }
  // HealthFollowUpInformationGain keeps its one line, so the sentence goes on it, one space after the last one.
  expect(ruleLines(prior, Q152.followUp.rule)).not.toContain("\n");
  expect(ruleLines(prior, Q152.followUp.rule).endsWith(`${Q152.followUp.end}</Rule>`)).toBe(true);
  const ending = (name: string, sentence: string): [string, string] =>
    [`${lastLine(prior, name)}\n  </Rule>`, `${lastLine(prior, name)}\n${wrapped(sentence, 3)}\n  </Rule>`];
  // The cases go directly before the one that follows question 128's last case.
  const coded = '  <Case id="CodedFormulaLargeEffect">';
  expect(prior).toContain(`</ExpectedBehavior>\n  </Case>\n${coded}`);
  return [
    ['version="20.6.28" revisionDate="2026-10-20"', 'version="20.6.29" revisionDate="2026-10-21"'],
    [" <RevisionHistory>\n", ` <RevisionHistory>\n${HRP_REVISION_XML}\n`],
    [`${Q152.followUp.end}</Rule>`, `${Q152.followUp.end} ${Q152.followUp.sentence}</Rule>`],
    ending(Q152.warning.rule, Q152.warning.sentence),
    [coded, `${Q152.cases.map(([id, prompt, expected]) => caseXml(id, prompt, expected)).join("\n")}\n${coded}`],
    ending(Q153.inventory.rule, Q153.inventory.sentence),
    ending(Q153.nnt.rule, Q153.nnt.sentence),
  ];
}

describe('owner-approved questions 152 and 153: "152a" and "153a,b,c" (2026-10-21)', () => {
  it.each(["hrp", "universal"] as const)("chains the exact %s predecessor, derives the manifest from the bytes, and reverses every layer", async (protocol) => {
    const [file, previousFile] = FIXTURES[protocol];
    const recorded = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${file}`, ROOT), "utf8")) as
      { purpose: string } & Record<Protocol, Edits>;
    expect(Object.keys(recorded)).toEqual(["purpose", protocol]);
    expect(recorded.purpose).toContain(protocol === "hrp"
      ? 'answers "152a" (lessons #47 and #48) and "153a" and "153b" (bug reports AskRigor#355 and #356), 2026-10-21'
      : 'answer "153c" (2026-10-21), from bug report AskRigor#356');
    const previous = JSON.parse(await readFile(new URL(`tests/fixtures/protocol-edits/${previousFile}`, ROOT), "utf8"))[protocol] as Edits;
    const fixture = recorded[protocol];
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS[protocol].from);
    expect(fixture.to).toEqual(PINS[protocol].to);
    expect(fixture.edits).toHaveLength(protocol === "hrp" ? 7 : 3);
    const current = await load(protocol);
    expect(XMLValidator.validate(current)).toBe(true);
    expect(hash(current)).toBe(PINS[protocol].to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS[protocol].from.sha256);
    expect(fixture.edits).toEqual(expectedEdits(protocol, prior));
    expect(expectedEdits(protocol, prior).reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    expect(expectedEdits(protocol, prior).reduce((text, [before, after]) =>
      replaceOnce(text, normalize(before), normalize(after)), normalize(prior))).toBe(normalize(current));
    await expect(undoLayer(protocol, current)).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(previous.from.sha256);
    await expect(undoPrevious(protocol, current)).resolves.toBe(beforePrevious);
    const readDepth = JSON.parse(await readFile(new URL("tests/fixtures/protocol-edits/2026-10-11-read-depth.json", ROOT), "utf8"))[protocol] as Edits;
    expect(hash(await undoReadDepth(current, protocol))).toBe(readDepth.from.sha256);
    await expect(getProtocolManifest(protocol)).resolves.toEqual({
      name: NAMES[protocol], version: PINS[protocol].to.version, revisionDate: REVISION_DATE, sha256: hash(current),
    });
  });

  it.each(HRP_SENTENCES)("ends %s, in %s, with the approved sentence word for word and nothing else", async (rule, home, sentence) => {
    const text = await load("hrp");
    const prior = await undoLayer("hrp", text);
    expect(plain(element(text, "Rule", "name", rule))).toBe(`${plain(element(prior, "Rule", "name", rule))} ${sentence}`);
    expect(normalize(text).split(sentence)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(sentence);
    expect(sentence).not.toMatch(/[&<>\n]/u);
    // Each rule stays where it was.
    expect(protocolNamedElements(prior, rule)).toMatchObject([{ tag: "Rule", section: home }]);
    expect(protocolNamedElements(text, rule)).toMatchObject([{ tag: "Rule", section: home }]);
  });

  it("adds question 152's sentences to core rules and question 153's outside the core", () => {
    for (const home of [Q152.followUp.section, Q152.warning.section]) expect(coreSectionNames("hrp")).toContain(home);
    for (const home of [Q153.inventory.section, Q153.nnt.section]) expect(coreSectionNames("hrp")).not.toContain(home);
    expect(coreSectionNames("universal")).toContain(Q153.universal.section);
  });

  it("keeps HealthFollowUpInformationGain on its one line, with the sentence one space after its last", async () => {
    const text = await load("hrp");
    const prior = await undoLayer("hrp", text);
    const line = ruleLines(text, Q152.followUp.rule);
    expect(line).not.toContain("\n");
    expect(line).toBe(replaceOnce(ruleLines(prior, Q152.followUp.rule), `${Q152.followUp.end}</Rule>`,
      `${Q152.followUp.end} ${Q152.followUp.sentence}</Rule>`));
    expect(line.endsWith(`${Q152.followUp.end} ${Q152.followUp.sentence}</Rule>`)).toBe(true);
  });

  it("starts each sentence that ends a wrapped rule on a line of its own, RelevanceBeforeWarning's right after the 126a sentence", async () => {
    const text = await load("hrp");
    const prior = await undoLayer("hrp", text);
    expect(plain(element(prior, "Rule", "name", Q152.warning.rule)).endsWith(` ${Q152.warning.follows}`)).toBe(true);
    expect(plain(element(text, "Rule", "name", Q152.warning.rule)).endsWith(` ${Q152.warning.follows} ${Q152.warning.sentence}`)).toBe(true);
    expect(ruleLines(text, Q152.warning.rule).endsWith(`\n${wrapped(Q152.warning.sentence, 3)}\n  </Rule>`)).toBe(true);
    for (const rule of [Q153.inventory.rule, Q153.nnt.rule]) {
      const sentence = rule === Q153.inventory.rule ? Q153.inventory.sentence : Q153.nnt.sentence;
      expect(ruleLines(text, rule)).toBe(ruleLines(prior, rule).replace(/\n {2}<\/Rule>$/u, `\n${wrapped(sentence, 3)}\n  </Rule>`));
    }
  });

  it("keeps each stress case's prompt and expected behavior word for word, in order after question 128's cases", async () => {
    const text = await load("hrp");
    const prior = await undoLayer("hrp", text);
    for (const [id, prompt, expected] of Q152.cases) {
      const body = element(section(text, "StressTestExpectations"), "Case", "id", id);
      expect(plain(section(body, "Prompt")), id).toBe(prompt);
      expect(plain(section(body, "ExpectedBehavior")), id).toBe(expected);
      expect(`  <Case id="${id}">${body}</Case>`).toBe(caseXml(id, prompt, expected));
      expect(caseNames(text).filter((name) => name === id)).toHaveLength(1);
      expect(caseNames(prior)).not.toContain(id);
      expect(protocolNamedElements(text, id)).toMatchObject([{ tag: "Case", section: "StressTestExpectations" }]);
    }
    const cases = caseNames(text);
    const at = cases.indexOf("SeriousOrganHarmOralMedicine");
    expect(cases.slice(at, at + Q152.cases.length + 2))
      .toEqual(["SeriousOrganHarmOralMedicine", ...Q152.cases.map(([id]) => id), "CodedFormulaLargeEffect"]);
    // Every other case is unchanged, in its order.
    expect(cases.filter((name) => !Q152.cases.some(([id]) => id === name))).toEqual(caseNames(prior));
  });

  it("inserts exactly question 153c's clause into Universal's serious-harm sentence, and keeps the rest of it", async () => {
    const text = await load("universal");
    const prior = await undoLayer("universal", text);
    const { section: home, before, after, rest, follows, lineStart } = Q153.universal;
    expect(section(text, home)).toBe(replaceOnce(section(prior, home), before, after));
    // One line, which still starts with the ranking sentence and holds question 128's wording with the clause.
    const lines = text.split("\n").filter((line) => line.includes(follows));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.startsWith(lineStart)).toBe(true);
    expect(lines[0]!.endsWith(`${follows} ${after} ${rest}`)).toBe(true);
    expect(prior.split("\n").filter((line) => line.includes(follows))).toEqual([lines[0]!.replace(after, before)]);
    expect(normalize(text).split(after)).toHaveLength(2);
    expect(normalize(prior)).not.toContain(after);
    expect(after).not.toMatch(/[&<>\n]/u);
  });

  it.each(["hrp", "universal"] as const)("places the exact Critical %s revision first, wrapped like its neighbours", async (protocol) => {
    const text = await load(protocol);
    const prior = await undoLayer(protocol, text);
    const [tag, history, parts, xml] = protocol === "hrp"
      ? ["Revision", "RevisionHistory", HRP_REVISIONS, HRP_REVISION_XML]
      : ["revision", "revision_history", [Q153.universal.revision], UNIVERSAL_REVISION_XML];
    expect(plain(element(text, tag, "version", PINS[protocol].to.version))).toBe(parts.join(" "));
    expect(section(prior, history).trimStart().startsWith(`<${tag} version="${PINS[protocol].from.version}" priority="Critical">`)).toBe(true);
    expect(section(text, history)).toBe(`\n${xml}${section(prior, history)}`);
  });

  it.each(["hrp", "universal"] as const)("wraps new %s lines at 118, apart from the root line and the one-line rule or paragraph", async (protocol) => {
    const text = await load(protocol);
    const prior = await undoLayer(protocol, text);
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    const long = protocol === "hrp"
      ? ruleLines(text, Q152.followUp.rule)
      : text.split("\n").find((line) => line.startsWith(Q153.universal.lineStart));
    expect(added.filter((line) => line.length > WIDTH)).toEqual([text.split("\n")[1], long]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });

  it.each(["hrp", "universal"] as const)("changes only the %s sections its edits name, by their exact bytes; the core stays one page", async (protocol) => {
    const text = await load(protocol);
    const prior = await undoLayer(protocol, text);
    const [now, before] = [protocolSections(protocol, text), protocolSections(protocol, prior)];
    expect(now.map(({ name }) => name)).toEqual(before.map(({ name }) => name));
    const changed = now.filter(({ name, sha256 }) => before.find((section) => section.name === name)!.sha256 !== sha256)
      .map(({ name }) => name);
    const bytes = (sections: typeof now, name: string) => sections.find((section) => section.name === name)!.bytes;
    const delta = (name: string) => bytes(now, name) - bytes(before, name);
    const core = (sections: typeof now) => sections.filter(({ core }) => core);
    const coreBytes = (sections: typeof now) => core(sections).reduce((sum, { bytes }) => sum + bytes, 0);
    if (protocol === "hrp") {
      expect(changed).toEqual(["RevisionHistory", Q153.inventory.section, Q152.warning.section, Q153.nnt.section,
        Q152.followUp.section, "StressTestExpectations"]);
      expect(delta("RevisionHistory")).toBe(size(`${HRP_REVISION_XML}\n`));
      expect(delta(Q152.followUp.section)).toBe(size(` ${Q152.followUp.sentence}`));
      expect(delta(Q152.warning.section)).toBe(size(`${wrapped(Q152.warning.sentence, 3)}\n`));
      expect(delta(Q153.inventory.section)).toBe(size(`${wrapped(Q153.inventory.sentence, 3)}\n`));
      expect(delta(Q153.nnt.section)).toBe(size(`${wrapped(Q153.nnt.sentence, 3)}\n`));
      expect(delta("StressTestExpectations"))
        .toBe(Q152.cases.reduce((sum, [id, prompt, expected]) => sum + size(`${caseXml(id, prompt, expected)}\n`), 0));
      expect(coreBytes(now) - coreBytes(before)).toBe(delta(Q152.followUp.section) + delta(Q152.warning.section));
    } else {
      expect(changed).toEqual(["revision_history", Q153.universal.section]);
      expect(delta("revision_history")).toBe(size(`${UNIVERSAL_REVISION_XML}\n`));
      expect(delta(Q153.universal.section)).toBe(size(Q153.universal.after) - size(Q153.universal.before));
      expect(coreBytes(now) - coreBytes(before)).toBe(delta(Q153.universal.section));
    }
    expect(coreBytes(before)).toBe(CORE_BYTES[protocol].before);
    expect(coreBytes(now)).toBe(CORE_BYTES[protocol].after);
    // Served as one scope with two bytes between sections, the core still fits one page.
    expect(coreBytes(now) + 2 * (core(now).length - 1)).toBeLessThanOrEqual(PROTOCOL_PAGE_MAX_BYTES);
    for (const { pages } of core(now)) expect(pages).toBe(1);
  });

  it.each(["hrp", "universal"] as const)("load_protocol serves each changed %s rule, case and section as exact canonical bytes, and the core as one page", async (protocol) => {
    const bytes = await readFile(new URL(`protocols/${protocol === "hrp" ? "HRP_Full.xml" : "Universal_Instructions.xml"}`, ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot(protocol);
    expect(text).toBe(bytes.toString("utf8"));
    const server = createAskRigorServer();
    const client = new Client({ name: "owner-questions-152-153-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const names = protocol === "hrp"
        ? [...HRP_SENTENCES.map(([rule]) => rule), ...Q152.cases.map(([id]) => id)]
        : [Q153.universal.section];
      for (const name of names) {
        const found = protocolNamedElements(text, name);
        const span = found.length === 1 ? found[0]! : sections.find((section) => section.name === name)!;
        expect(span, name).toBeDefined();
        const canonical = bytes.subarray(span.byte_start, span.byte_end_exclusive).toString("utf8");
        const served = await client.callTool({ name: "load_protocol", arguments: { protocol, section: name } });
        expect(served.isError).not.toBe(true);
        expect(served.structuredContent).toMatchObject({ ok: true, complete: true, text: canonical });
      }
      const core = sections.filter(({ core }) => core)
        .map(({ byte_start, byte_end_exclusive }) => bytes.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n");
      const response = await client.callTool({ name: "load_protocol", arguments: { protocol, section: "core" } });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ ok: true, complete: true, page_count: 1, text: core });
      if (protocol === "hrp") {
        expect(normalize(core)).toContain(`${Q152.followUp.end} ${Q152.followUp.sentence}`);
        expect(normalize(core)).toContain(`${Q152.warning.follows} ${Q152.warning.sentence}`);
        expect(normalize(core)).not.toContain(Q153.inventory.sentence);
        expect(normalize(core)).not.toContain(Q153.nnt.sentence);
      } else {
        expect(core).toContain(` ${Q153.universal.follows} ${Q153.universal.after} ${Q153.universal.rest}\n`);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
