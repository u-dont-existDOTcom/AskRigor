import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { getProtocolManifest, loadProtocolSectionSnapshot, protocolNamedElements } from "@askrigor/protocol";
import {
  undoOwnerQuestion93Hrp, undoOwnerQuestions86To89Hrp, undoOwnerQuestions90To92Hrp,
} from "./helpers/undo-read-depth.js";

const ROOT = new URL("../", import.meta.url);
const parser = new XMLParser({ parseTagValue: false });
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const loadCurrent = (file: "HRP_Full.xml" | "Universal_Instructions.xml" = "HRP_Full.xml") => readFile(
  new URL(`protocols/${file}`, ROOT), "utf8",
);
// The state right after questions 90 and 92: the newer HRP edits of question 93 are undone first.
const load = async () => undoOwnerQuestion93Hrp(await loadCurrent());
// HRP 20.6.22, the state the owner's wording for questions 90 and 92 was added to.
const loadPrior = async () => undoOwnerQuestions90To92Hrp(await loadCurrent());
interface Edits {
  from: { version: string; sha256: string }; to: { version: string; sha256: string };
  edits: Array<[string, string]>;
}

// Independent of the recorded fixture: the exact wording the owner approved for questions 90 and 92 on the owner
// questions page (answer "92 a 91 b 90 a", 2026-10-14). Question 90 supplies DurationMatchedBenefitAndHarm, two
// stress cases, FS231 and a revision sentence; question 92 supplies sentences added to ten existing elements, phrase
// changes in four, BriefSymptomMeasures, new texts for FS215, FS217 and FS229, FS232, six stress cases and a
// revision sentence.
const APPROVED = {
  revisions: [
    "Owner-approved, question 90 (2026-10-14), from lessons #23 and #22: added DurationMatchedBenefitAndHarm, with stress cases LongTermMedicineAfterSevereReaction and OccasionalKelpIodine and final check FS231.",
    "Owner-approved, question 92 (2026-10-14), from lessons #24 to #29: mechanism steps traced across species and tissues, table figures read with their headings, corrections carried into charts and early answers, BriefSymptomMeasures, forum reports kept to the target symptom, and the user's source classes carried forward; six stress cases and final check FS232.",
  ],
  durationMatched: "When a medicine would likely be taken for months or years, as for chronic pain or a psychiatric condition, compare its benefits and harms at follow-up matching that use. Give absolute responder rates, or numbers needed to treat or harm, only where valid counts at that follow-up exist, and otherwise say that they are unknown. Keep short trial duration apart from long-term use, and symptom relief apart from lasting recovery. Cover persistent adverse effects, dependence, tapering and outcomes after stopping. Before naming such a medicine for this person, reconcile prior serious reactions to medicines and any history suggesting mania or psychosis; while an input is missing, it stays a topic for a clinician's review, not a recommendation.",
  briefSymptom: "When asked how to prevent or ease a brief or episodic symptom, consider measures before onset, during it and after it, such as surroundings, clothing, timing, movement, rest and comfort, and treat a symptom that comes with it as a separate target. Rank them by plausible benefit, burden, reversibility, interaction risk and real-world signal. Keep reasonable low-risk measures that no trial has tested, labelled as untested and never as proven, and say which ones studies support. Give each measure's own risks, such as overheating, and when to stop or seek care. Present the best one to three first and list the others briefly.",
  // Sentences added at the end of an existing element, in document order.
  appended: [
    { open: '<Rule name="UserReportedUseFidelity" priority="Critical">', close: "</Rule>", text: "Before applying a correction that cites an identifier, such as a trial number or DOI, confirm that it belongs to the same intervention." },
    { open: '<Rule name="NoSilentAccessFailure" priority="Critical">', close: "</Rule>", text: "Do not fill the gap with research on a different question." },
    { open: '<Rule name="MechanismIsNotOutcome" priority="Critical">', close: "</Rule>", text: "Before a mechanism explains a symptom or supports a remedy, trace each step from exposure through the measured response to the symptom or outcome, and say whether each step was measured, experimentally changed or inferred, in which species and tissue, and at what dose, route and time. A finding in one species or tissue does not carry over to another without evidence that it does." },
    { open: '<Rule name="ExtendedEvidenceOutput">', close: "</Rule>", text: "Leave a registry record without results, or evidence about a different intervention, out of the findings unless it changes the answer." },
    { open: "<ExtractionMinimum>", close: "</ExtractionMinimum>", text: "Read each figure with its table or figure title, column and row headings and footnotes, and record the exposure, population, endpoint, denominator and method of ascertainment it belongs to before using it." },
    { open: '<Step id="QA3" name="RawCountsAndDenominators">', close: "</Step>", text: "A share of selected reports, excerpts or passages is not a share of people." },
    { open: '<Rule name="ContextExtraction" priority="High">', close: "</Rule>", text: "For a brief symptom, record when it began and whether it ended without treatment, and keep a change in the target symptom apart from a change in a symptom that comes with it." },
    { open: '<Rule name="RankRatherThanStack" priority="Critical">', close: "</Rule>", text: "A negative test of one mechanism weakens that mechanism only; it does not establish any one of the others." },
    { open: '<Rule name="NoProtocolStacking" priority="Critical">', close: "</Rule>", text: "A supplement's interaction with the exposure is a hazard to assess, not on its own a reason to recommend taking both." },
  ],
  primaryOutcome: {
    open: '<Rule name="PrimaryOutcomeContinuity" priority="Critical">', close: "</Rule>",
    after: "carry both into every new search batch, ranking, and shopping step.",
    text: "Carry the source classes the user asked for in the same way, with what each yielded, what failed and what could not be reached.",
  },
  // Phrases changed inside existing elements: [before, after].
  phrases: [
    {
      open: '<Rule name="CorrectionPropagationIsMandatory" priority="Critical">', close: "</Rule>",
      changes: [
        ["chronology, calculation, or safety interpretation", "chronology, figure, calculation, or safety interpretation"],
        ["table, summary, or reusable instruction in scope", "table, chart, heading, summary, or reusable instruction in scope"],
      ],
    },
    {
      open: '<Rule name="PreDeliveryResearchClaimCheck" priority="Critical">', close: "</Rule>",
      changes: [
        ["Before delivering a final research verdict, finding, or evidence summary,", "Before delivering a research verdict, finding, or evidence summary, including an early or partial one,"],
        ["external fact, figure, or the user's intended meaning", "external fact, figure, with the table row and column it comes from, or the user's intended meaning"],
      ],
    },
  ],
  trigger: ["symptom tracking, ", "symptom tracking, preventing or easing a brief or episodic symptom, "],
  coachingItem: ["One to three practical options.", "One to three practical options, with any others listed briefly."],
  checks: {
    FS215: "Community reports about a product were admitted item by item for the exact product and target symptom, with other variants, accompanying symptoms and unresolved reports kept apart (ScopeAxesBeforeSampling).",
    FS217: "In a continuing mission, the primary outcome, the user's rejected candidates and the source classes they asked for were carried into the next step, and seller ratings were never reported as product ratings.",
    FS229: "A mechanism stated for one route, species or tissue rested on evidence from that route, species and tissue, or the answer said where the evidence came from and that the stated setting was not tested (DoseRouteFormContextComparator, MechanismIsNotOutcome).",
    FS231: "Each medicine likely to be taken long term had its benefit and harm compared at follow-up matching that use, or said to be unknown, with stopping and lasting harms covered, and none was put forward for this person before its safety conflicts were reconciled (DurationMatchedBenefitAndHarm, ResolveConflictsBeforeRecommendationOrRanking).",
    FS232: "A question about preventing or easing a brief symptom got measures before, during and after onset, ranked, with untested ones labelled as untested and each measure's own risks and stop points given (BriefSymptomMeasures).",
  },
  // Question 90's two cases, then question 92's six, in the approved order.
  cases: [
    {
      id: "LongTermMedicineAfterSevereReaction",
      prompt: "A fictional adult has recurrent pain in several places and nausea, a past severe movement-disorder reaction to an unrelated nerve-acting medicine, and episodes of impaired reality testing. A reviewer suggests an antidepressant based on a short trial in functional dyspepsia.",
      expected: "Do not endorse the antidepressant for this person until the safety conflicts are reconciled; show non-drug options; say that 6–12 week trials do not establish benefit over years and that long-term numbers needed to treat or harm are unknown; cover stopping effects and lasting harms; do not present the drug as the preferred or easy next step.",
    },
    {
      id: "OccasionalKelpIodine",
      prompt: "An adult asks whether occasionally eating ordinary edible kelp is unsafe because too much iodine can change thyroid function.",
      expected: "Check typical iodine amounts per serving; keep regular meals apart from concentrated supplements; give how often clinically important thyroid problems occurred at that intake if data allow, or say it is unknown; report the conflicting population evidence; name the thyroid conditions that raise the risk and the available tests; do not give a blanket 'avoid seaweed'.",
    },
    {
      id: "BorrowedVascularMechanism",
      prompt: "A rodent experiment finds more blood flow in the brain's cortex after compound X, and a separate study finds that nutrient Y relaxes isolated vascular muscle; no study measures skin blood flow or chills after either. Someone asks whether Y would prevent the chills X causes.",
      expected: "Treat narrowed skin blood vessels as an untested hypothesis, say that rodent brain blood flow and isolated muscle don't show what happens in human skin, and don't recommend Y as prevention; a negative skin blood-flow test would weaken that pathway without proving any one other cause.",
    },
    {
      id: "ColumnsAndPassages",
      prompt: "A meta-analysis table reports coldness in 7% of people on compound A and 40% on compound B, and a separate analysis finds cold mentioned in 12% of selected written passages about A.",
      expected: "Give 7% for A and 40% for B, each with its population and denominator, and say that 12% is a share of selected passages, not how many users felt cold.",
    },
    {
      id: "CorrectedMappingAfterToolFailure",
      prompt: "An adverse-effect review first puts a rate under the wrong compound; the open table later shows the right mapping, while a video-comment tool fails.",
      expected: "Correct the headline and every table, chart and summary that used the wrong rate, recompute anything derived from it and say what changed; keep the verified findings and precautions, and report the comments gap as a limit, not a reason to hold back the answer.",
    },
    {
      id: "ChillsAtOnset",
      prompt: "A substance sometimes causes brief chills as it starts to act, and no medicine is validated to prevent them. Someone asks how to prevent or ease them.",
      expected: "Before onset, a comfortable room, removable layers and socks; during it, gentle movement, relaxation and warm drinks for comfort; a warning against overheating; which measures have no direct studies, and that none is proven to prevent chills; not only a blanket after the chills begin.",
    },
    {
      id: "HerbalTeaForChills",
      prompt: "A forum has six posts recommending herbal tea for chills, two users whose nausea eased while their chills continued, one with no relief, and two whose chills ended on their own within two hours.",
      expected: "Keep advice apart from users' own outcomes, nausea apart from chills, and natural resolution apart from the tea; give no success rate and don't call the tea a reliable way to prevent chills.",
    },
    {
      id: "PractitionerCorpusRecoveries",
      prompt: "A botanical research task asks for surprising patient-reported recoveries in one practitioner publication. The worker finds twenty dramatic uncontrolled recoveries and six non-responses, a registry record of an unrelated probiotic blend with no posted results, and comments on the publication that can't be read.",
      expected: "Lead with the recoveries and non-responses, with their sources and uncertainty; report that the comments couldn't be read; leave out the unrelated registry record; keep visible nail recovery apart from laboratory clearance of the fungus.",
    },
  ],
} as const;
// The earlier final-check wording that question 92's new texts replace.
const REPLACED_CHECKS = {
  FS215: "Community reports about a product were admitted item by item for the exact product, with other variants and unresolved reports kept apart (ScopeAxesBeforeSampling).",
  FS217: "In a continuing mission, the primary outcome and the user's rejected candidates were carried into the next step, and seller ratings were never reported as product ratings.",
  FS229: "A mechanism stated for one route rested on evidence from that route, or the answer said which route the evidence used and that the stated route was not tested (DoseRouteFormContextComparator).",
} as const;
const PINS = {
  from: { version: "20.6.22", sha256: "da82943f56614783d9316bd9a7d87a3233bf8c03255f20c88cc7bfefa39d73e9" },
  to: { version: "20.6.23", sha256: "6623056eab84a60a0a82ac33a5aa0145cb84725d1be60aedfa77faf3d69899bd" },
  hrp20621: "e43fcb2174645f30fc7d8e7f143e2d17403c69d39d5824efc1d6a0d764bf68d7",
  universal: { version: "20.5.44", sha256: "946fac7e5e6ce5cb08811d4c533371e3032e1ce46f5c217990dc326808b55135" },
} as const;
const WIDTH = 118;
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
const bodyOf = (whole: string, open: string, close: string) => whole.slice(open.length, -close.length);
function replaceOnce(text: string, before: string, after: string): string {
  expect(text.split(before), before.slice(0, 80)).toHaveLength(2);
  const result = text.replace(before, () => after);
  expect(result.split(after), after.slice(0, 80)).toHaveLength(2);
  return result;
}
function wrapped(body: string): void {
  for (const line of body.split("\n")) expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
}

describe("owner-approved questions 90 and 92: 92 a 91 b 90 a (2026-10-14)", () => {
  it("chains only the recorded HRP edits from the exact predecessor and derives its manifest from the bytes", async () => {
    const recorded = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-14-owner-questions-90-92-hrp.json", ROOT,
    ), "utf8")) as Record<string, Edits>;
    expect(Object.keys(recorded)).toEqual(["purpose", "hrp"]);
    const fixture = recorded.hrp!;
    const previous = JSON.parse(await readFile(new URL(
      "tests/fixtures/protocol-edits/2026-10-14-owner-questions-86-89-hrp.json", ROOT,
    ), "utf8")).hrp as Edits;
    expect(fixture.from).toEqual(previous.to);
    expect(fixture.from).toEqual(PINS.from);
    expect(fixture.to).toEqual(PINS.to);
    expect(fixture.edits).toHaveLength(23);
    const current = await load();
    expect(XMLValidator.validate(current)).toBe(true);
    expect(current).toContain(`<Protocol name="HRP" version="${PINS.to.version}" revisionDate="2026-10-14"`);
    expect(hash(current)).toBe(PINS.to.sha256);
    const prior = [...fixture.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), current);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(prior).toContain(`<Protocol name="HRP" version="${PINS.from.version}" revisionDate="2026-10-14"`);
    expect(hash(prior)).toBe(PINS.from.sha256);
    expect(fixture.edits.reduce((text, [before, after]) => replaceOnce(text, before, after), prior)).toBe(current);
    await expect(undoOwnerQuestions90To92Hrp(await loadCurrent())).resolves.toBe(prior);
    const beforePrevious = [...previous.edits].reverse().reduce((text, [before, after]) => replaceOnce(text, after, before), prior);
    expect(hash(beforePrevious)).toBe(PINS.hrp20621);
    await expect(undoOwnerQuestions86To89Hrp(await loadCurrent())).resolves.toBe(beforePrevious);
    await expect(getProtocolManifest("hrp")).resolves.toEqual({
      name: "HRP", version: "20.6.27", revisionDate: "2026-10-17", sha256: hash(await loadCurrent()),
    });
    const universal = await loadCurrent("Universal_Instructions.xml");
    expect(hash(universal)).toBe(PINS.universal.sha256);
    await expect(getProtocolManifest("universal")).resolves.toEqual({
      name: "AskRigor.com universal saved instructions", version: PINS.universal.version, revisionDate: "2026-10-17",
      sha256: PINS.universal.sha256,
    });
  });

  it("puts the exact Critical revision first, question 90's sentence then question 92's", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const body = element(text, "Revision", "version", PINS.to.version);
    expect(plain(body)).toBe(APPROVED.revisions.join(" "));
    expect(plain(body).indexOf(APPROVED.revisions[1])).toBe(APPROVED.revisions[0].length + 1);
    wrapped(body);
    expect(body.split("\n").slice(1, -1).every((line) => line.startsWith("   ") && !line.startsWith("    "))).toBe(true);
    const added = `  <Revision version="${PINS.to.version}" priority="Critical">${body}</Revision>\n`;
    expect(section(prior, "RevisionHistory").startsWith("\n")).toBe(true);
    expect(section(text, "RevisionHistory")).toBe(`\n${added}${section(prior, "RevisionHistory").slice(1)}`);
  });

  it("places the one-line DurationMatchedBenefitAndHarm directly after AlternativesRemainVisible", async () => {
    const text = await load();
    const line = `  <Rule name="DurationMatchedBenefitAndHarm" priority="Critical">${APPROVED.durationMatched}</Rule>`;
    expect(text).toMatch(new RegExp(
      `\\n  <Rule name="AlternativesRemainVisible" priority="Critical">[^<\\n]+</Rule>\\n\\n${escape(line)}\\n\\n` +
        '  <Template id="PatientSpecificInterventionSafetyReconciliation">',
      "u",
    ));
    expect(text.split('<Rule name="DurationMatchedBenefitAndHarm"')).toHaveLength(2);
    expect(section(text, "PatientSpecificInterventionSafetyReconciliationGate").split(`\n${line}\n`)).toHaveLength(2);
    expect(plain(element(text, "Rule", "name", "DurationMatchedBenefitAndHarm"))).toBe(APPROVED.durationMatched);
  });

  it("places the one-line BriefSymptomMeasures directly after Reversibility in BehaviorChangeDiscipline", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const line = `   <Rule id="BriefSymptomMeasures">${APPROVED.briefSymptom}</Rule>`;
    const reversibility = '   <Rule id="Reversibility">Prefer reversible, low-cost, low-burden steps first.</Rule>';
    expect(section(text, "BehaviorChangeDiscipline")).toBe(
      replaceOnce(section(prior, "BehaviorChangeDiscipline"), `${reversibility}\n`, `${reversibility}\n${line}\n`),
    );
    expect(section(text, "BehaviorChangeDiscipline")).toContain(`${line}\n   <Rule id="AdherenceReality">`);
    expect(text.split('<Rule id="BriefSymptomMeasures">')).toHaveLength(2);
    expect(section(text, "FunctionalHealthCoachingLayer")).toContain(line);
  });

  it("loads each new rule by name as its exact canonical bytes", async () => {
    const bytes = await readFile(new URL("protocols/HRP_Full.xml", ROOT));
    const { sections, text } = await loadProtocolSectionSnapshot("hrp");
    for (const [name, holder, opening, approved] of [
      ["DurationMatchedBenefitAndHarm", "PatientSpecificInterventionSafetyReconciliationGate",
        '<Rule name="DurationMatchedBenefitAndHarm" priority="Critical">', APPROVED.durationMatched],
      ["BriefSymptomMeasures", "FunctionalHealthCoachingLayer", '<Rule id="BriefSymptomMeasures">', APPROVED.briefSymptom],
    ] as const) {
      const [rule, ...others] = protocolNamedElements(text, name);
      expect(others, name).toEqual([]);
      expect(rule).toMatchObject({ tag: "Rule", section: holder });
      expect(bytes.subarray(rule!.byte_start, rule!.byte_end_exclusive).toString("utf8")).toBe(`${opening}${approved}</Rule>`);
      const containing = sections.find(({ byte_start, byte_end_exclusive }) =>
        byte_start <= rule!.byte_start && rule!.byte_end_exclusive <= byte_end_exclusive
      );
      expect(containing?.name).toBe(holder);
    }
  });

  it("adds each approved sentence at the end of its element, continuing its last line and keeping the rest", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    for (const { open, close, text: sentence } of APPROVED.appended) {
      const [before, after] = [span(prior, open, close), span(text, open, close)];
      expect(plain(bodyOf(after, open, close))).toBe(`${plain(bodyOf(before, open, close))} ${sentence}`);
      const [oldLines, newLines] = [before.split("\n"), after.split("\n")];
      const kept = oldLines.length - 2;
      expect(newLines.slice(0, kept), open).toEqual(oldLines.slice(0, kept));
      expect(newLines[kept]!.startsWith(`${oldLines[kept]!} `), open).toBe(true);
      expect(newLines.at(-1)).toBe(oldLines.at(-1));
      const indent = /^ */u.exec(oldLines[kept]!)![0];
      for (const line of newLines.slice(kept, -1)) {
        expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(WIDTH);
        expect(line.startsWith(indent) && line[indent.length] !== " ", line.slice(0, 60)).toBe(true);
      }
    }
  });

  it("inserts the PrimaryOutcomeContinuity sentence directly after the shopping step", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const { open, close, after: anchor, text: sentence } = APPROVED.primaryOutcome;
    const before = plain(bodyOf(span(prior, open, close), open, close));
    expect(before.split(anchor)).toHaveLength(2);
    const body = bodyOf(span(text, open, close), open, close);
    expect(plain(body)).toBe(before.replace(anchor, `${anchor} ${sentence}`));
    for (const line of body.split("\n").slice(1, -1)) expect(line.startsWith("   ") && line[3] !== " ").toBe(true);
  });

  it("changes only the approved phrases in CorrectionPropagationIsMandatory, PreDeliveryResearchClaimCheck, the coaching trigger and its output minimum", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    for (const { open, close, changes } of APPROVED.phrases) {
      let expected = plain(bodyOf(span(prior, open, close), open, close));
      for (const [from, to] of changes) expected = replaceOnce(expected, from, to);
      expect(plain(bodyOf(span(text, open, close), open, close))).toBe(expected);
    }
    expect(plain(bodyOf(span(text, APPROVED.phrases[1].open, "</Rule>"), APPROVED.phrases[1].open, "</Rule>")))
      .not.toContain("final research verdict");
    const trigger = (whole: string) => plain(section(section(whole, "FunctionalHealthCoachingLayer"), "Trigger"));
    expect(trigger(text)).toBe(replaceOnce(trigger(prior), ...APPROVED.trigger));
    const [oldItem, newItem] = APPROVED.coachingItem.map((item) => `   <Item>${item}</Item>`);
    expect(section(text, "CoachingOutputMinimum")).toBe(replaceOnce(section(prior, "CoachingOutputMinimum"), `${oldItem!}\n`, `${newItem!}\n`));
  });

  it("replaces FS215, FS217 and FS229 in place and adds FS231 and FS232 directly after FS230, as single lines", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const line = (id: string, body: string) => `  <Check id="${id}">${body}</Check>`;
    let expected = section(prior, "FinalSelfCheck");
    for (const id of ["FS215", "FS217", "FS229"] as const) {
      expected = replaceOnce(expected, `${line(id, REPLACED_CHECKS[id])}\n`, `${line(id, APPROVED.checks[id])}\n`);
    }
    const fs230 = prior.split("\n").filter((entry) => entry.startsWith('  <Check id="FS230">'));
    expect(fs230).toHaveLength(1);
    expected = replaceOnce(expected, `${fs230[0]!}\n`, [
      fs230[0]!, line("FS231", APPROVED.checks.FS231), line("FS232", APPROVED.checks.FS232), "",
    ].join("\n"));
    expect(section(text, "FinalSelfCheck")).toBe(expected);
    for (const [id, body] of Object.entries(APPROVED.checks)) expect(element(text, "Check", "id", id)).toBe(body);
    for (const old of Object.values(REPLACED_CHECKS)) {
      expect(prior).toContain(old);
      expect(normalize(text)).not.toContain(old);
    }
  });

  it("places the exact eight stress cases in order directly after ImpossibleStoichiometry", async () => {
    const text = await load();
    const ids = ["ImpossibleStoichiometry", ...APPROVED.cases.map((item) => item.id), "CodedFormulaLargeEffect"];
    for (let i = 1; i < ids.length; i++) {
      expect(text).toMatch(new RegExp(`<Case id="${ids[i - 1]}">[\\s\\S]*?</Case>\\n  <Case id="${ids[i]}">`, "u"));
    }
    for (const item of APPROVED.cases) {
      const body = element(text, "Case", "id", item.id);
      expect(body).toMatch(/^\n   <Prompt>\n[^<]+\n   <\/Prompt>\n   <ExpectedBehavior>\n[^<]+\n   <\/ExpectedBehavior>\n  $/u);
      expect(plain(section(body, "Prompt"))).toBe(item.prompt);
      expect(plain(section(body, "ExpectedBehavior"))).toBe(item.expected);
      wrapped(body);
      for (const line of body.split("\n").filter((entry) => !entry.trim().startsWith("<") && entry.trim() !== "")) {
        expect(line.startsWith("    ") && line[4] !== " ").toBe(true);
      }
      expect(text.split(`<Case id="${item.id}">`)).toHaveLength(2);
    }
  });

  it("holds every approved sentence and changed phrase, and nothing else changed apart from line wrapping", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const phrases = [
      ...APPROVED.revisions, APPROVED.durationMatched, APPROVED.briefSymptom,
      ...APPROVED.appended.map((item) => item.text), APPROVED.primaryOutcome.text,
      ...APPROVED.phrases.flatMap((item) => item.changes.map(([, to]) => to)), APPROVED.trigger[1], APPROVED.coachingItem[1],
      ...Object.values(APPROVED.checks), ...APPROVED.cases.flatMap((item) => [item.prompt, item.expected]),
    ];
    for (const phrase of phrases) {
      expect(phrase).not.toMatch(/[&<>]/u);
      expect(normalize(text), phrase.slice(0, 60)).toContain(phrase);
    }
    let expected = normalize(prior);
    const swap = (before: string, after: string) => { expected = replaceOnce(expected, before, after); };
    const extend = (open: string, close: string, change: (whole: string) => string) => {
      const whole = span(expected, open, close);
      swap(whole, change(whole));
    };
    swap(`version="${PINS.from.version}" revisionDate="2026-10-14"`, `version="${PINS.to.version}" revisionDate="2026-10-14"`);
    swap("<RevisionHistory> ", `<RevisionHistory> <Revision version="${PINS.to.version}" priority="Critical"> ${APPROVED.revisions.join(" ")} </Revision> `);
    extend('<Rule name="AlternativesRemainVisible" priority="Critical">', "</Rule>", (whole) =>
      `${whole} <Rule name="DurationMatchedBenefitAndHarm" priority="Critical">${APPROVED.durationMatched}</Rule>`);
    for (const { open, close, text: sentence } of APPROVED.appended) {
      extend(open, close, (whole) => `${whole.slice(0, -close.length)}${sentence} ${close}`);
    }
    extend(APPROVED.primaryOutcome.open, APPROVED.primaryOutcome.close, (whole) =>
      replaceOnce(whole, APPROVED.primaryOutcome.after, `${APPROVED.primaryOutcome.after} ${APPROVED.primaryOutcome.text}`));
    for (const { open, close, changes } of APPROVED.phrases) {
      extend(open, close, (whole) => changes.reduce((result, [from, to]) => replaceOnce(result, from, to), whole));
    }
    extend("<Trigger> Wellness, sleep, stress,", "</Trigger>", (whole) => replaceOnce(whole, ...APPROVED.trigger));
    extend('<Rule id="Reversibility">', "</Rule>", (whole) =>
      `${whole} <Rule id="BriefSymptomMeasures">${APPROVED.briefSymptom}</Rule>`);
    swap(`<Item>${APPROVED.coachingItem[0]}</Item>`, `<Item>${APPROVED.coachingItem[1]}</Item>`);
    extend('<Case id="ImpossibleStoichiometry">', "</Case>", (whole) => [whole, ...APPROVED.cases.map((item) =>
      `<Case id="${item.id}"> <Prompt> ${item.prompt} </Prompt> <ExpectedBehavior> ${item.expected} </ExpectedBehavior> </Case>`,
    )].join(" "));
    for (const id of ["FS215", "FS217", "FS229"] as const) {
      swap(`<Check id="${id}">${REPLACED_CHECKS[id]}</Check>`, `<Check id="${id}">${APPROVED.checks[id]}</Check>`);
    }
    extend('<Check id="FS230">', "</Check>", (whole) =>
      `${whole} <Check id="FS231">${APPROVED.checks.FS231}</Check> <Check id="FS232">${APPROVED.checks.FS232}</Check>`);
    expect(normalize(text)).toBe(expected);
  });

  it("wraps every new or re-wrapped line within 118 characters, apart from the one-line elements", async () => {
    const [text, prior] = [await load(), await loadPrior()];
    const remaining = new Map<string, number>();
    for (const line of prior.split("\n")) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const added = text.split("\n").filter((line) => {
      const count = remaining.get(line) ?? 0;
      remaining.set(line, count - 1);
      return count <= 0;
    });
    const long = added.filter((line) => line.length > WIDTH).map((line) => /^ *<\w+ (?:name|id)="([^"]+)"/u.exec(line)?.[1]);
    expect(long).toEqual([
      "HRP", "DurationMatchedBenefitAndHarm", "BriefSymptomMeasures", "FS215", "FS217", "FS229", "FS231", "FS232",
    ]);
    for (const line of added) expect(line, line.slice(0, 60)).toBe(line.trimEnd());
  });
});
