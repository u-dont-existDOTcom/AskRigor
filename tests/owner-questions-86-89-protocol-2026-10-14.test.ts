import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest } from "@askrigor/protocol";
import {
  undoAcceptedLessonsHrp, undoAcceptedLessonsUniversal, undoOwnerQuestions86To89Hrp, undoOwnerQuestions86To89Universal,
  undoOwnerQuestions90To92Hrp,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = (protocol: "hrp" | "universal") => readFile(new URL(
  `protocols/${protocol === "hrp" ? "HRP_Full.xml" : "Universal_Instructions.xml"}`, ROOT,
), "utf8");
// The state right after questions 86 to 89: the newer HRP edits of questions 90 and 92 are undone first.
const load = async (protocol: "hrp" | "universal") => (
  protocol === "hrp" ? undoOwnerQuestions90To92Hrp(await loadCurrent(protocol)) : loadCurrent(protocol)
);
const undoOwnerQuestions = (protocol: "hrp" | "universal", text: string) => (
  protocol === "hrp" ? undoOwnerQuestions86To89Hrp : undoOwnerQuestions86To89Universal
)(text);
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the recorded fixtures: the exact wording the owner approved for questions 86 to 89 on the owner
// questions page ("89a 88a 87a 86a"). Question 86 supplies HarmWarningCalibration, three cases, FS226, FS227,
// Universal item 7 and one revision sentence for each protocol; question 87 supplies
// IdenticalResultsAcrossPublications, one case, FS228 and a revision sentence; questions 88 and 89 each supply one
// case, one check and a revision sentence.
const APPROVED = {
  hrpRevisions: [
    "Owner-approved, question 86 (2026-10-12), from issues #324, #325 and #328: added HarmWarningCalibration, which gives a harm warning its rate against a comparator or says that the frequency is unknown, and says what the evidence measured, with three stress cases and final checks FS226 and FS227.",
    "Owner-approved, question 87 (2026-10-12), from issue #329: added IdenticalResultsAcrossPublications, which treats identical unusual results in separate-looking publications as possibly one dataset, recomputes each paper's figures from its own tables, and never counts them as replication, with a stress case and final check FS228.",
    "Owner-approved, question 88 (2026-10-12), from issue #330: a stress case and final check FS229 keep a mechanism claim on the route its evidence used.",
    "Owner-approved, question 89 (2026-10-13), from issue #331: a stress case and final check FS230 keep a physically impossible reported value as printed but unused, and keep a safety claim within its evidence.",
  ],
  universalRevision: 'Owner-approved, question 86 (2026-10-12), from issue #326: a research task started under AskRigor stays under it in later turns, including "continue" without a mention, and each research answer is checked with finalize_research.',
  universalItem: '7. A research task that started under AskRigor stays under it in every later turn of the conversation, including "continue" or a revised target without a mention: reload the current protocol identities when they may have changed or left the context, carry the open leads and sources forward, and check each research answer with `finalize_research` before giving it. A conversation boundary or a summary of earlier turns does not end the task.',
  rules: [
    {
      id: "HarmWarningCalibration", container: "EpistemicSafetyRules", after: "HazardIsNotRisk", next: "DoseRouteFormContextComparator",
      text: "A sentence saying that something can cause harm, is unsafe or should be avoided states, for the exposure it warns about, how often the harm occurred against a comparator when a source reports it, or says that the frequency is unknown. When the evidence measured something else, such as a laboratory concentration, a different preparation, species, route or dose, or only case reports, the sentence says so. A hazard found in one form does not become a warning about another.",
    },
    {
      id: "IdenticalResultsAcrossPublications", container: "ExtendedHumanEvidenceAndGreyLiteratureSweep", after: "DuplicateAndDataLineageAudit", next: "HistoricalEndpointAndInvestigatorSweep",
      text: "When two publications presented as separate report identical or near-identical unusual results, treat them as possibly one dataset until shown otherwise, in animal and laboratory studies as in human ones. Recompute each paper's headline figures from its own tables with its stated method, record any mismatch, and compare authors, laboratories, models and dates. Count them once, never as independent replication, and do not use one paper to correct the other.",
    },
  ],
  cases: [
    {
      id: "UnquantifiedSideEffectWarning",
      prompt: "In a continuing plant study, the answer says that a herbal extract can cause nausea and cramps, while a randomized trial of that extract reports nausea in 18% of the treated group and 4% on placebo.",
      expected: "Give the trial's rates against placebo for that extract, dose and duration, with the sample size and uncertainty, keep people apart from event reports, and do not give a bare 'can cause' warning.",
    },
    {
      id: "PurifiedExtractHazardMisapplied",
      prompt: "A study reports lead and arsenic in alginate extracted in a laboratory from one seaweed species, and the answer tells the user not to eat wild seaweed.",
      expected: "Say that the measurements concern the purified extract, not eaten seaweed; separate species, chemical form, bioaccessibility and intake; give scoped guidance only where a specific exposure is known to be high; do not give a blanket warning.",
    },
    {
      id: "SpeciationExplainedAtFirstUse",
      prompt: "With the protocols loaded, a seaweed safety answer says that most seaweeds carry organic arsenic while one species carries mostly inorganic arsenic.",
      expected: "At first use, say in plain words what organic and inorganic arsenic mean and why the difference matters for toxicity, without implying that every organic form is harmless, and keep the measurement's scope, such as extractable versus total arsenic, and the exposure in view.",
    },
    {
      id: "SwappedIdenticalPercentages",
      prompt: "Two papers on the same seaweed extract, using different rat ulcer models a year apart, report the same three inhibition percentages with the doses swapped, and one paper's own table gives different percentages under its stated formula.",
      expected: "Recompute both from their tables, report the mismatch and the identical figures, count the papers once at most, keep the extract as an exploratory lead, and claim neither replication nor misconduct.",
    },
    {
      id: "RouteSplitWithinOneStudy",
      prompt: "One rat study gave an extract by mouth to protect the stomach and, in a separate test, injected it into the abdomen to measure acid secretion, finding no significant difference.",
      expected: "Keep each test's route, dose and outcome apart: the extract protected the stomach when given by mouth, acid secretion was tested only by injection without a significant difference, and oral acid secretion was not tested; do not call the extract acid-sparing.",
    },
    {
      id: "ImpossibleStoichiometry",
      prompt: "A conference abstract reports thiol groups at 96 mmol per gram of a modified gum, which would be more sulfur than the gum's own mass, and calls the gum safe after one acute high-dose animal test.",
      expected: "Report the value as printed and say that it is physically impossible as printed, without inventing a corrected unit; say that the animal test shows no acute deaths or detected organ toxicity at that dose, not safety for long-term human use; treat a thesis and an abstract from the same group as one line of evidence.",
    },
  ],
  checks: [
    { id: "FS226", text: "Each warning that something can cause harm or should be avoided gave the rate against a comparator when a source reports one, or said that the frequency is unknown, and said what the evidence measured when it differed from the exposure warned about (HarmWarningCalibration)." },
    { id: "FS227", text: "Each specialized term that a conclusion depends on was explained in plain words at its first use, including what it means for the risk or benefit (AudienceAccessibleTerminologyGate)." },
    { id: "FS228", text: "Identical unusual results in publications presented as separate were checked against each paper's own tables and counted once, not as independent replication (IdenticalResultsAcrossPublications)." },
    { id: "FS229", text: "A mechanism stated for one route rested on evidence from that route, or the answer said which route the evidence used and that the stated route was not tested (DoseRouteFormContextComparator)." },
    { id: "FS230", text: "A reported value that is physically impossible as printed was kept as printed, marked impossible and not used, with no invented correction, and no safety claim went beyond the denominator, route, specimen and duration of its evidence (LogicArithmeticAndCitationIntegrity, NullEvidenceAndSafetyLanguage)." },
  ],
} as const;
const PINS = {
  hrp: {
    from: { version: "20.6.21", sha256: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7" },
    to: { version: "20.6.22", sha256: "da82943f56614783d9316bd9a7d87a3233bf8c03255f20c88cc7bfefa39d73e9" },
  },
  universal: {
    from: { version: "20.5.41", sha256: "115b22a595b4cdcd663bb60986bd3dba0fb0d3f65f64bcc7bbb6d5a4bfd8a708" },
    to: { version: "20.5.42", sha256: "0401335ed4b1f0ec44d4d7351ecb369828dd1c7f362b5c4e0234df22c7f10173" },
  },
} as const;
const plain = (body: string) => (parser.parse(`<text>${body}</text>`).text as string).replace(/\s+/gu, " ").trim();
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
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(body: string): void {
  for (const line of body.split("\n")) expect(line.length).toBeLessThanOrEqual(118);
}

describe("owner-approved questions 86 to 89: 89a 88a 87a 86a (2026-10-14)", () => {
  for (const protocol of ["hrp", "universal"] as const) {
    it(`chains only the recorded ${protocol} edits from the exact predecessor and derives its manifest`, async () => {
      const recorded = JSON.parse(await readFile(new URL(
        `tests/fixtures/protocol-edits/2026-10-14-owner-questions-86-89-${protocol}.json`, ROOT,
      ), "utf8")) as Record<string, Edits>;
      expect(Object.keys(recorded)).toEqual(["purpose", protocol]);
      const fixture = recorded[protocol]!;
      const previous = JSON.parse(await readFile(new URL(
        `tests/fixtures/protocol-edits/2026-10-12-accepted-lessons-${protocol}.json`, ROOT,
      ), "utf8"))[protocol] as Edits;
      expect(fixture.from).toEqual(previous.to);
      expect(fixture.from).toEqual(PINS[protocol].from);
      expect(fixture.to).toEqual(PINS[protocol].to);
      expect(fixture.edits).toHaveLength(protocol === "hrp" ? 6 : 3);
      const current = await load(protocol);
      expect(XMLValidator.validate(current)).toBe(true);
      expect(current).toContain(`version="${fixture.to.version}" revisionDate="2026-10-14"`);
      expect(hash(current)).toBe(fixture.to.sha256);
      const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
      expect(XMLValidator.validate(prior)).toBe(true);
      expect(prior).toContain(`version="${fixture.from.version}" revisionDate="2026-10-12"`);
      expect(hash(prior)).toBe(fixture.from.sha256);
      expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
      await expect(undoOwnerQuestions(protocol, await loadCurrent(protocol))).resolves.toBe(prior);
      const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
      expect(hash(beforePrevious)).toBe(previous.from.sha256);
      await expect((protocol === "hrp" ? undoAcceptedLessonsHrp : undoAcceptedLessonsUniversal)(await loadCurrent(protocol))).resolves.toBe(beforePrevious);
      await expect(getProtocolManifest(protocol)).resolves.toEqual({
        name: protocol === "hrp" ? "HRP" : "AskRigor.com universal saved instructions",
        version: protocol === "hrp" ? "20.6.24" : "20.5.42",
        revisionDate: protocol === "hrp" ? "2026-10-15" : "2026-10-14", sha256: hash(await loadCurrent(protocol)),
      });
    });
  }

  it("puts the exact Critical revisions first, preserving every older history", async () => {
    for (const protocol of ["hrp", "universal"] as const) {
      const text = await load(protocol);
      const prior = await undoOwnerQuestions(protocol, await loadCurrent(protocol));
      const tag = protocol === "hrp" ? "Revision" : "revision";
      const history = protocol === "hrp" ? "RevisionHistory" : "revision_history";
      const indent = protocol === "hrp" ? "  " : "";
      const body = element(text, tag, "version", PINS[protocol].to.version);
      expect(plain(body)).toBe(protocol === "hrp" ? APPROVED.hrpRevisions.join(" ") : APPROVED.universalRevision);
      wrapped(body);
      const added = `${indent}<${tag} version="${PINS[protocol].to.version}" priority="Critical">${body}</${tag}>\n`;
      expect(section(prior, history).startsWith("\n")).toBe(true);
      expect(section(text, history)).toBe(`\n${added}${section(prior, history).slice(1)}`);
    }
  });

  it("puts the four HRP revision sentences in the order of questions 86, 87, 88 and 89", async () => {
    const body = plain(element(await load("hrp"), "Revision", "version", PINS.hrp.to.version));
    const positions = APPROVED.hrpRevisions.map((sentence) => body.indexOf(sentence));
    expect(positions[0]).toBe(0);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i], APPROVED.hrpRevisions[i]!.slice(0, 60)).toBe(positions[i - 1]! + APPROVED.hrpRevisions[i - 1]!.length + 1);
    }
    expect(APPROVED.hrpRevisions.map((sentence) => /question (\d+) /u.exec(sentence)![1])).toEqual(["86", "87", "88", "89"]);
  });

  it("places each exact Critical HRP rule immediately between its designated neighbours, in its container", async () => {
    const text = await load("hrp");
    for (const rule of APPROVED.rules) {
      expect(text).toMatch(new RegExp(`<Rule name="${rule.after}"(?: priority="Critical")?>[^<]+</Rule>\\n\\n  <Rule name="${rule.id}" priority="Critical">`, "u"));
      expect(text).toMatch(new RegExp(`<Rule name="${rule.id}" priority="Critical">[^<]+</Rule>\\n\\n  <Rule name="${rule.next}"(?: priority="[A-Za-z]+")?>`, "u"));
      const body = element(text, "Rule", "name", rule.id);
      expect(plain(body)).toBe(rule.text);
      wrapped(body);
      const container = section(text, rule.container);
      expect(container.split(`<Rule name="${rule.after}"`)).toHaveLength(2);
      expect(container.split(`<Rule name="${rule.id}" `)).toHaveLength(2);
      expect(container.split(`<Rule name="${rule.next}"`)).toHaveLength(2);
      expect(text.split(`<Rule name="${rule.id}" `)).toHaveLength(2);
    }
  });

  it("places the exact six stress cases in order immediately after ClinicianEndorsementDirectory", async () => {
    const text = await load("hrp");
    const ids = ["ClinicianEndorsementDirectory", ...APPROVED.cases.map((item) => item.id), "CodedFormulaLargeEffect"];
    for (let i = 1; i < ids.length; i++) {
      expect(text).toMatch(new RegExp(`<Case id="${ids[i - 1]}">[\\s\\S]*?</Case>\\n  <Case id="${ids[i]}">`, "u"));
    }
    for (const item of APPROVED.cases) {
      const body = element(text, "Case", "id", item.id);
      expect(body).toMatch(/^\s*<Prompt>[^<]+<\/Prompt>\s*<ExpectedBehavior>[^<]+<\/ExpectedBehavior>\s*$/u);
      expect(plain(section(body, "Prompt"))).toBe(item.prompt);
      expect(plain(section(body, "ExpectedBehavior"))).toBe(item.expected);
      wrapped(body);
      expect(text.split(`<Case id="${item.id}">`)).toHaveLength(2);
    }
  });

  it("puts only the exact single-line checks FS226 to FS230 immediately after FS225", async () => {
    const text = await load("hrp");
    const prior = await undoOwnerQuestions86To89Hrp(await loadCurrent("hrp"));
    const old = prior.split("\n").filter((line) => line.startsWith('  <Check id="FS225">'));
    expect(old).toHaveLength(1);
    const added = APPROVED.checks.map((item) => `  <Check id="${item.id}">${item.text}</Check>`).join("\n");
    expect(section(text, "FinalSelfCheck")).toBe(replaceOnce(section(prior, "FinalSelfCheck"), old[0]!, `${old[0]}\n${added}`));
    expect(APPROVED.checks.map((item) => item.id)).toEqual(["FS226", "FS227", "FS228", "FS229", "FS230"]);
    for (const item of APPROVED.checks) expect(element(text, "Check", "id", item.id)).toBe(item.text);
  });

  it("adds only the exact one-line item 7 directly after item 6 of the protocol-execution gate", async () => {
    const text = await load("universal");
    const prior = await undoOwnerQuestions86To89Universal(text);
    const tag = "canonical_protocol_execution_gate";
    const item6 = prior.split("\n").filter((line) => line.startsWith("6. Higher reasoning mode does not substitute"));
    expect(item6).toHaveLength(1);
    const gate = section(text, tag);
    expect(gate).toBe(replaceOnce(section(prior, tag), item6[0]!, `${item6[0]}\n${APPROVED.universalItem}`));
    expect(gate).toContain(`${item6[0]}\n${APPROVED.universalItem}\n<rule name="ToolListCurrency" priority="Critical">`);
    expect(text.split(APPROVED.universalItem)).toHaveLength(2);
    expect(APPROVED.universalItem.startsWith("7. ")).toBe(true);
    expect(APPROVED.universalItem).toContain("`finalize_research`");
  });
});
