import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { coreSectionNames, getProtocolManifest, loadProtocol, protocolNamedElements, protocolSections } from "@askrigor/protocol";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { undoLesson51AndUda444Hrp } from "./helpers/undo-read-depth.js";

// Owner rule 148a (2026-10-29): lesson #51 (a laboratory profile named in a question was taken as the asker's own) and
// the suggested fix 2026-10-29-manifest-first-cross-section-reading (UDA #444, an owner request), as HRP text and
// stress cases. Independent of the recorded edit fixture: the sentences word for word, where they go, and the cases.
const LEDGER_SENTENCES = [
  "Record also whom each statement is about: the user, someone else, or a study's participants.",
  "A condition or test result named in a question is the topic to research, not the user's own, unless they say it is theirs; until they do, do not call it theirs or base a test or advice for them on it.",
  "When they say it is theirs, it is their own report, weighed as a claim (PromptPremisesAreClaims).",
] as const;
const RULE_SENTENCES = [
  "Before saying that a long or versioned document leaves an idea out, or that the idea would be new to it, find the document's current version and say which version was read and how much of it.",
  "Look for the idea under other names across all its sections, including later qualifications, then say whether it is present, present but scattered, partly covered, not read, or absent after an adequate search.",
  "When proposing to add something, say what it would do that the document does not already do; when an adequate search finds nothing, say plainly that it is absent.",
] as const;
// Lesson #51's cases A, B and C, then #444's: an idea under another heading, an older edition, and the true-absence
// control the item asks for, so the rule does not become a habit of assuming coverage.
const CASES = [
  ["TopicConditionIsNotTheAskers", "Does nutrient Q help people with abnormal marker X? I noticed more energy from Q.",
    "Research marker X as the question's topic and the energy as the user's own report. Do not say or assume that the user has abnormal X, and base no test or advice for them on it."],
  ["SomeoneElsesConditionStaysTheirs", "A colleague has abnormal marker X and tried Q. I also tried Q, with another response.",
    "Keep the colleague's marker and response apart from the user's: attribute neither to the other, and do not pool the two responses as one person's."],
  ["OwnResultIsTheirReport", "My laboratory report shows abnormal marker X.",
    "Treat abnormal X as the user's own result, as they report it: a claim to weigh, not a record anyone has inspected. Do not decline to treat it as theirs."],
  ["IdeaUnderAnotherHeading",
    "A long guide describes a technique in a section whose heading and wording never use the technique's usual name, and the user asks whether the guide covers it.",
    "Find the technique by what it does, across all sections, and say that the guide covers it, quoting where; do not call it missing or propose adding it as new."],
  ["OlderEditionRead",
    "Only an older edition of a guide with a newer edition could be read, and the older edition lacks a method the user asks about.",
    "Say which edition was read and that the newer one was not; report the omission for the older edition only, and say that the newer edition's coverage is unknown."],
  ["TrueAbsenceAfterFullReading",
    "A long document, read in full and searched under the idea's other names, does not cover the idea.",
    "Say plainly that the document does not cover it, with what was searched; do not soften the finding into possible coverage elsewhere in the document."],
] as const;
const PINS = {
  from: { version: "20.6.32", sha256: "62f9e0a934800ae0a6002d3b433ed2c640e0b8263b6891d7d897a2c0c49b9c89" },
  to: { version: "20.6.33", sha256: "6bac4fc9d673cdd737975ef62f382f4a5ddeeb33e76986ecec9eeeecf7fd4dea" },
} as const;
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
function body(text: string, tag: string, attr: string, id: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag} ${attr}="${id}"[^>]*>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, id).toHaveLength(1);
  return normalize(matches[0]![1]!);
}
function inner(text: string, tag: string): string {
  const matches = [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gu"))];
  expect(matches, tag).toHaveLength(1);
  return normalize(matches[0]![1]!);
}
const names = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => match[1]);

describe("owner rule 148a: HRP 20.6.33, lesson #51 and UDA #444", () => {
  it("ends HealthEvidenceRoleLedger with lesson #51's sentences, keeping its earlier text", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoLesson51AndUda444Hrp(text);
    const before = body(prior, "Rule", "name", "HealthEvidenceRoleLedger");
    expect(body(text, "Rule", "name", "HealthEvidenceRoleLedger")).toBe(`${before} ${LEDGER_SENTENCES.join(" ")}`);
    for (const sentence of LEDGER_SENTENCES) expect(normalize(prior)).not.toContain(sentence);
  });

  it("adds LongDocumentCoverageAudit right after SocialMediaWholeThreadAudit, holding #444's sentences and nothing else", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoLesson51AndUda444Hrp(text);
    expect(body(text, "Rule", "name", "LongDocumentCoverageAudit")).toBe(RULE_SENTENCES.join(" "));
    expect(prior).not.toContain("LongDocumentCoverageAudit");
    expect(protocolNamedElements(text, "LongDocumentCoverageAudit"))
      .toMatchObject([{ tag: "Rule", section: "SourceVerificationAndCitationAudit" }]);
    const rules = names(text, /<Rule name="([^"]+)"/gu);
    const at = rules.indexOf("LongDocumentCoverageAudit");
    expect(rules.slice(at - 1, at + 2))
      .toEqual(["SocialMediaWholeThreadAudit", "LongDocumentCoverageAudit", "HistoricalVocabularyAndCitationBackchain"]);
    expect(rules.filter((name) => name !== "LongDocumentCoverageAudit")).toEqual(names(prior, /<Rule name="([^"]+)"/gu));
  });

  it("adds the six stress cases in order after lesson #49's last, word for word", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoLesson51AndUda444Hrp(text);
    const cases = names(text, /<Case id="([^"]+)"/gu);
    const at = cases.indexOf(CASES[0][0]);
    expect(cases.slice(at - 1, at + CASES.length + 1))
      .toEqual(["CompleteThreadNegativeVerdict", ...CASES.map(([id]) => id), "CodedFormulaLargeEffect"]);
    for (const [id, prompt, expected] of CASES) {
      expect(prior).not.toContain(`<Case id="${id}">`);
      expect(protocolNamedElements(text, id), id).toMatchObject([{ tag: "Case", section: "StressTestExpectations" }]);
      const element = body(text, "Case", "id", id);
      expect(inner(element, "Prompt"), id).toBe(prompt);
      expect(inner(element, "ExpectedBehavior"), id).toBe(expected);
    }
  });

  it("leaves the core, which every research answer loads on one page, byte for byte as it was", async () => {
    const text = await loadProtocol("hrp");
    const prior = await undoLesson51AndUda444Hrp(text);
    const core = new Set(coreSectionNames("hrp"));
    const coreText = (value: string) => protocolSections("hrp", value).filter(({ name }) => core.has(name))
      .map(({ byte_start, byte_end_exclusive }) => Buffer.from(value, "utf8").subarray(byte_start, byte_end_exclusive).toString("utf8"));
    expect(coreText(text)).toEqual(coreText(prior));
    for (const section of ["PatientHistoryAndRecurrenceEvidenceGate", "SourceVerificationAndCitationAudit", "StressTestExpectations"]) {
      expect(core.has(section), section).toBe(false);
    }
  });

  it("binds the exact bytes, puts the revision first and reverses the layer to HRP 20.6.32", async () => {
    const text = await loadProtocol("hrp");
    expect(XMLValidator.validate(text)).toBe(true);
    expect(await getProtocolManifest("hrp")).toEqual({
      name: "HRP", version: PINS.to.version, revisionDate: "2026-10-29", sha256: PINS.to.sha256,
    });
    expect(hash(text)).toBe(PINS.to.sha256);
    const revisions = names(text, /<Revision version="([^"]+)"/gu);
    expect(revisions.slice(0, 2)).toEqual(["20.6.33", "20.6.32"]);
    const revision = body(text, "Revision", "version", "20.6.33");
    expect(revision).toContain("from lesson #51 and the suggested fix 2026-10-29-manifest-first-cross-section-reading (UDA #444, an owner request)");
    for (const [id] of CASES) expect(revision).toContain(id);
    const prior = await undoLesson51AndUda444Hrp(text);
    expect(XMLValidator.validate(prior)).toBe(true);
    expect(hash(prior)).toBe(PINS.from.sha256);
    const fixture = JSON.parse(await readFile(new URL(
      "./fixtures/protocol-edits/2026-10-29-lesson-51-and-uda-444-hrp.json", import.meta.url,
    ), "utf8")) as { purpose: string; hrp: { from: unknown; to: unknown; edits: Array<[string, string]> } };
    expect(fixture.hrp.from).toEqual(PINS.from);
    expect(fixture.hrp.to).toEqual(PINS.to);
    expect(fixture.hrp.edits).toHaveLength(5);
    expect(fixture.hrp.edits.reduce((value, [before, after]) => value.replace(before, () => after), prior)).toBe(text);
  });
});
