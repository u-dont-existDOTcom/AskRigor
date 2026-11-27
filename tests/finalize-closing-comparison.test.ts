// Owner answer 416a (24 Nov 2026, "both changes"; built behind ASKRIGOR_CLOSING_COMPARISON, off): the closing comparison
// with the quick answer counts what was read of each study and says how, and shows the paper's sentence a point rests on
// when AskRigor finds it in the text it holds, or says "the AI says" the research found it. Nothing new stops an answer.
// tests/closing-comparison-off.test.ts holds the switch off to the results of before it.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  CLOSING_COMPARISON_REGISTERED, lookUpComparisonSentences, SHOWN_SENTENCES_SAY, type ComparisonSentenceLookup,
  type ComparisonSentenceRequest
} from "../apps/research-mcp/src/closing-comparison.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { manageResearchAccessInputSchema } from "../apps/research-mcp/src/research-contributor-access-tool.js";
import {
  comparisonSentenceRequestsOf, finalizeResearch, finalizeResearchInputSchema, type FinalizeResearchOptions
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import type { SourceLineDocument, SourceLineTexts } from "../apps/research-mcp/src/source-lines.js";
import {
  ABSTRACT_DOI, ABSTRACT_PMID, ABSTRACT_SENTENCE, AUDITED, AUDITED_SENTENCE, CLAIMS, comparable, comparisonCall, FULL,
  FULL_SENTENCE, HANDLE_AUDITED, HANDLE_FULL, NOW, OPTIONS, QUOTES, RECEIPTS, REPORT, SECRET, TARGET, type Comparison
} from "./helpers/closing-comparison-cases.js";

const ON: FinalizeResearchOptions = { ...OPTIONS, closingComparison: true };
const check = (call: Record<string, unknown>, lookups?: readonly ComparisonSentenceLookup[]) =>
  finalizeResearch(call, { ...ON, ...(lookups === undefined ? {} : { comparisonSentenceLookups: lookups }) });
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET, now: () => NOW });
const notes = (result: { notes?: string[] }) => result.notes ?? [];

const LEAD = "Without AskRigor, a quick answer would have said: “Acute kidney injury slows magnesium clearance.”";
const SECOND = "It would also have said: “Magnesium levels should be checked daily in acute kidney injury.”";
const UNCHECKED = " It did not check one other point of the quick answer: “Magnesium levels should be checked daily in " +
  "acute kidney injury.”";
const NOT_CHECKED = { claim: CLAIMS[1], outcome: "not_checked" } as const;
const point = (outcome: "confirmed" | "corrected" | "qualified", answer_quote: string, sources: string[],
  source_sentence?: string): Comparison[number] =>
  ({ claim: CLAIMS[0], outcome, answer_quote, sources, ...(source_sentence === undefined ? {} : { source_sentence }) });

// The texts AskRigor holds for the papers, as the lookups read them: two full texts by their handles, and an abstract.
const HELD: Readonly<Record<string, SourceLineDocument>> = {
  [HANDLE_AUDITED]: { kind: "full_text", blocks: [{ text: "We enrolled 120 adults admitted with kidney injury.", section: "Methods" },
    { text: `${AUDITED_SENTENCE} Other results follow.`, section: "Results" }] },
  [HANDLE_FULL]: { kind: "full_text", blocks: [{ text: FULL_SENTENCE, section: "Results" }] },
};
const ABSTRACTS: Readonly<Record<string, SourceLineDocument>> = {
  [ABSTRACT_PMID]: { kind: "abstract", blocks: [{ text: ABSTRACT_SENTENCE, section: "RESULTS" }] },
};
const texts = (held: Readonly<Record<string, SourceLineDocument>> = HELD,
  abstracts: SourceLineTexts["abstract"] = async (pmid) => ABSTRACTS[pmid]): SourceLineTexts =>
  ({ fullText: (handle) => held[handle], abstract: abstracts });

/** The check, its sentences looked up as the connector looks them up, and the check again with what was found. */
async function lookedUp(call: Record<string, unknown>, given: SourceLineTexts = texts()) {
  const first = check(call);
  const requests = comparisonSentenceRequestsOf(first);
  const lookups = requests === undefined ? [] : await lookUpComparisonSentences(requests, given);
  return { first, requests, lookups, result: check(call, lookups) };
}

describe("owner answer 416a, change 1: what was read counts, and the note says how", () => {
  it("counts a study read as its abstract, saying so", () => {
    const result = check(comparisonCall(["abstract"], [point("qualified", QUOTES.uncommon, [ABSTRACT_PMID]), NOT_CHECKED]));
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(result.plain_answer_note).toBe(`${LEAD} The AI says this research qualified that, from the abstract of 1 ` +
      `study: “${QUOTES.uncommon}”${UNCHECKED}`);
    expect(notes(result).join("\n")).not.toContain("sources lists");
    expect(notes(result).join("\n")).not.toContain("nothing behind it");
  });

  it("counts a study read in full without an audit, saying its methods were not audited", () => {
    const result = check(comparisonCall(["full"], [point("qualified", QUOTES.rose, [FULL]), NOT_CHECKED]));
    expect(result.plain_answer_note).toBe(`${LEAD} The AI says this research qualified that, from the full text of 1 ` +
      `study, methods not audited: “${QUOTES.rose}”${UNCHECKED}`);
  });

  it("counts an audit as before, and each paper once, at the deepest reading its receipts show", () => {
    expect(check(comparisonCall(["audited"], [point("confirmed", QUOTES.slower, [AUDITED]), NOT_CHECKED])).plain_answer_note)
      .toBe(`${LEAD} The AI says this research confirmed that, from a full-text audit of 1 study: “${QUOTES.slower}”${UNCHECKED}`);
    // An audited paper also read in full is one audited study; a paper named by its PMID and its DOI is one abstract.
    const audited = sign("study_audit", { id: FULL, doi: FULL, handle: HANDLE_FULL, status: "complete_no_unresolved_fields",
      t: 2_300 });
    const once = check(comparisonCall(["full", "abstract"],
      [point("corrected", QUOTES.slower, [FULL, ABSTRACT_PMID, `https://doi.org/${ABSTRACT_DOI}`]), NOT_CHECKED],
      { receipts: [RECEIPTS.plain, RECEIPTS.full, audited, RECEIPTS.abstract] }));
    expect(once.plain_answer_note).toContain("this research corrected that, from a full-text audit of 1 study and the " +
      `abstract of 1 study: “${QUOTES.slower}”`);
  });

  it("names every reading behind a point, the abstract of a study cited by its DOI too", () => {
    const result = check(comparisonCall(["audited", "full", "abstract"], [
      point("corrected", QUOTES.slower, [AUDITED, FULL, ABSTRACT_PMID]),
      { claim: CLAIMS[1], outcome: "confirmed", answer_quote: QUOTES.daily, sources: [ABSTRACT_DOI] }
    ]));
    expect(result.plain_answer_note).toBe(`${LEAD} The AI says this research corrected that, from a full-text audit of 1 ` +
      "study; the full text of 1 study, methods not audited; and the abstract of 1 study: " +
      `“${QUOTES.slower}” ${SECOND} The AI says this research confirmed that, from the abstract of 1 study: “${QUOTES.daily}”`);
  });

  it("still counts nothing for a web page, a search listing, a lead or a record without an abstract", () => {
    const listed = "10.1000/mag-listed";
    const lead = "10.1000/mag-lead";
    const bare = "39000002";
    const receipts = [RECEIPTS.plain, RECEIPTS.audited,
      sign("literature_search", { src: "europe_pmc", q: "magnesium", ret: 1, n: 1, ids: [listed], t: 2_400 }),
      sign("full_text_lead", { doi: lead, state: "ABSTRACT_ONLY", t: 2_500 }),
      sign("pubmed_record", { pmid: bare, doi: "10.1000/mag-bare", abs: "0", t: 2_600 })];
    for (const source of [REPORT, listed, lead, bare]) {
      const result = check(comparisonCall(["audited"], [point("confirmed", QUOTES.slower, [source]), NOT_CHECKED],
        { receipts }));
      expect(result.status, source).toBe("ready_with_limits");
      expect(result.plain_answer_note, source).toBe("Without AskRigor, a quick answer would have said: “Magnesium " +
        "levels should be checked daily in acute kidney injury.” This research did not check that. It says it checked " +
        "one more point, but did not show what backs it: “Acute kidney injury slows magnesium clearance.”");
      expect(notes(result), source).toContain(`plain_answer_comparison[0].sources lists ${source}, which no reading, ` +
        "comment audit or forum read passed here covers: list studies read here (DOI, PMID or PMCID: audited in full " +
        "text, read in full, or read as an abstract in their PubMed record), videos whose comments were read here " +
        "(video ID) and forum threads read here (the link threads_read gives), or leave sources out. A report or web " +
        "page doesn't count.");
    }
  });

  it("leaves a point resting on a correction the research made as it was, with no paper behind it", () => {
    const fixed = "Earlier I said magnesium falls in kidney injury; in these studies it mostly rose.";
    const result = check(comparisonCall(["audited"], [
      { claim: CLAIMS[0], outcome: "corrected", answer_quote: fixed }, NOT_CHECKED],
    { answer_draft: `[Audited trial](https://doi.org/${AUDITED}) was audited in full.\n\n${fixed}`,
      corrections: [{ retracted: "Magnesium falls in kidney injury.", change: fixed, by_user: false }] }));
    expect(result.plain_answer_note).toBe(`${LEAD} This research corrected that, from a correction the research made to ` +
      `an earlier statement: “${fixed}”${UNCHECKED}`);
    expect(notes(result).join("\n")).not.toContain("source_sentence");
  });

  it("asks once for the sentences of the points resting on a study, as a note only", () => {
    const result = check(comparisonCall(["audited", "abstract"], [
      point("corrected", QUOTES.slower, [AUDITED]),
      { claim: CLAIMS[1], outcome: "confirmed", answer_quote: QUOTES.daily, sources: [ABSTRACT_PMID] }]));
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(notes(result)).toContain("plain_answer_comparison[0] and plain_answer_comparison[1] rest on a study read " +
      "here but give no source_sentence, so the note says the AI says this research found them. To show what the " +
      "paper says, give each the study's own sentence the point rests on as source_sentence, copied whole and exactly " +
      "in the paper's language, in the whole comparison sent in later_inputs.plain_answer_comparison, and check the " +
      "answer again.");
  });
});

describe("owner answer 416a, change 2: the paper's sentence, looked up exactly", () => {
  const request = (sentence: string, papers: ComparisonSentenceRequest["papers"]): ComparisonSentenceRequest =>
    ({ entry: 0, sentence, papers });
  const audited = { source: AUDITED, handles: [HANDLE_AUDITED], pmids: [] };
  const abstract = { source: ABSTRACT_PMID, handles: [], pmids: [ABSTRACT_PMID] };
  const look = async (sentence: string, papers: ComparisonSentenceRequest["papers"] = [audited], given = texts()) =>
    (await lookUpComparisonSentences([request(sentence, papers)], given))[0]!;

  it("finds a whole sentence with spacing, case, quotation marks, dashes and a word broken across lines set aside", async () => {
    const held = { [HANDLE_AUDITED]: { kind: "full_text" as const, blocks: [{ section: "Results", text:
      "Fractional excre-\ntion of magnesium – measured at 48 h – was “lower” in patients with acute kidney injury." }] } };
    expect(await look("FRACTIONAL EXCRETION OF   MAGNESIUM — measured at 48 h — was \"lower\" in patients with acute " +
      "kidney injury", [audited], texts(held)))
      .toEqual({ entry: 0, outcome: "found", source: AUDITED, text: "full_text", section: "Results" });
  });

  it("doesn't find a changed number or a part of a sentence that leaves out its negation", async () => {
    const held = { [HANDLE_AUDITED]: { kind: "full_text" as const, blocks: [{ text:
      "Magnesium clearance did not fall in the 40 patients with acute kidney injury." }] } };
    for (const sentence of ["Magnesium clearance did not fall in the 41 patients with acute kidney injury.",
      "fall in the 40 patients with acute kidney injury"]) {
      expect(await look(sentence, [audited], texts(held))).toEqual({ entry: 0, outcome: "not_found" });
    }
  });

  it("works in any language and script, with no word list", async () => {
    const held = { [HANDLE_AUDITED]: { kind: "full_text" as const, blocks: [
      { text: "急性腎障害の患者ではマグネシウムの排泄率が低かった。" },
      { text: "La clairance du magnésium était plus faible chez les patients atteints d'insuffisance rénale aiguë." }] } };
    for (const sentence of ["急性腎障害の患者ではマグネシウムの排泄率が低かった。",
      "la clairance du MAGNÉSIUM était plus faible chez les patients atteints d’insuffisance rénale aiguë"]) {
      expect(await look(sentence, [audited], texts(held))).toMatchObject({ outcome: "found" });
    }
  });

  it("looks in the abstract of a study read as one, and in each of a point's papers in turn", async () => {
    expect(await look(ABSTRACT_SENTENCE, [abstract]))
      .toEqual({ entry: 0, outcome: "found", source: ABSTRACT_PMID, text: "abstract", section: "RESULTS" });
    expect(await look(ABSTRACT_SENTENCE, [audited, abstract])).toMatchObject({ outcome: "found", source: ABSTRACT_PMID });
  });

  it("prefers a text AskRigor fetched to a copy the AI supplied, and says which it was", async () => {
    const supplied = { [HANDLE_AUDITED]: { kind: "search_copy" as const, blocks: [{ text: ABSTRACT_SENTENCE }] } };
    expect(await look(ABSTRACT_SENTENCE, [audited], texts(supplied))).toMatchObject({ outcome: "found", text: "search_copy" });
    expect(await look(ABSTRACT_SENTENCE, [audited, abstract], texts(supplied)))
      .toMatchObject({ outcome: "found", source: ABSTRACT_PMID, text: "abstract" });
  });

  it("calls a sentence missing only when every paper's text was read, and says why one wasn't", async () => {
    // A full text no longer held, with no abstract to read: not looked up.
    expect(await look(AUDITED_SENTENCE, [audited], texts({})))
      .toEqual({ entry: 0, outcome: "not_checked", reason: "text_expired" });
    // Missing from the abstract of a paper read in full whose full text is gone: still not called missing.
    const expired = { source: AUDITED, handles: [HANDLE_AUDITED], pmids: [ABSTRACT_PMID] };
    expect(await look(AUDITED_SENTENCE, [expired], texts({})))
      .toEqual({ entry: 0, outcome: "not_checked", reason: "text_expired" });
    expect(await look(AUDITED_SENTENCE, [abstract], texts(HELD, async () => null)))
      .toEqual({ entry: 0, outcome: "not_checked", reason: "text_unavailable" });
    expect(await look(AUDITED_SENTENCE, [{ source: "10.1000/none", handles: [], pmids: [] }]))
      .toEqual({ entry: 0, outcome: "not_checked", reason: "no_text" });
    // One paper's text read and the sentence not in it, another's not read: it may be in that one.
    expect(await look(FULL_SENTENCE, [audited, { source: FULL, handles: ["aft1_gone"], pmids: [] }]))
      .toEqual({ entry: 0, outcome: "not_checked", reason: "text_expired" });
    expect(await look("Magnesium fell.")).toEqual({ entry: 0, outcome: "not_checked", reason: "too_short" });
  });
});

describe("owner answer 416a, change 2: the note shows the sentence found, or says the AI says it", () => {
  it("shows a sentence found in AskRigor's own text, with the research's own verb, and says what that shows", async () => {
    const { requests, lookups, result } = await lookedUp(comparisonCall(["audited", "full", "abstract"], [
      point("corrected", QUOTES.slower, [AUDITED, FULL], FULL_SENTENCE),
      { claim: CLAIMS[1], outcome: "confirmed", answer_quote: QUOTES.daily, sources: [ABSTRACT_PMID],
        source_sentence: ABSTRACT_SENTENCE }
    ]));
    expect(requests).toEqual([
      { entry: 0, sentence: FULL_SENTENCE, papers: [{ source: AUDITED, handles: [HANDLE_AUDITED], pmids: [] },
        { source: FULL, handles: [HANDLE_FULL], pmids: [] }] },
      { entry: 1, sentence: ABSTRACT_SENTENCE, papers: [{ source: ABSTRACT_PMID, handles: [], pmids: [ABSTRACT_PMID] }] }
    ]);
    expect(lookups.map(({ outcome }) => outcome)).toEqual(["found", "found"]);
    expect(result.plain_answer_note).toBe(`${LEAD} This research corrected that, from a full-text audit of 1 study and ` +
      `the full text of 1 study, methods not audited: “${QUOTES.slower}” In the full text of "Full-text cohort" ` +
      `(${FULL}), AskRigor found: “${FULL_SENTENCE}” ${SECOND} This research confirmed that, from the abstract of 1 ` +
      `study: “${QUOTES.daily}” In the study's abstract, AskRigor found: “${ABSTRACT_SENTENCE}” ${SHOWN_SENTENCES_SAY}`);
    expect(SHOWN_SENTENCES_SAY).toBe("AskRigor checked only that each sentence it quotes from a paper is in that paper, " +
      "not that it proves the point.");
    expect(notes(result).join("\n")).not.toContain("source_sentence");
  });

  it("says the AI says it of a sentence not found, with a note naming where AskRigor looked", async () => {
    const { result } = await lookedUp(comparisonCall(["audited"], [
      point("confirmed", QUOTES.slower, [AUDITED], "Acute kidney injury slows magnesium clearance in every patient."),
      NOT_CHECKED]));
    expect(result.plain_answer_note).toBe(`${LEAD} The AI says this research confirmed that, from a full-text audit of ` +
      `1 study: “${QUOTES.slower}”${UNCHECKED}`);
    expect(notes(result)).toContain("plain_answer_comparison[0].source_sentence isn't in the text AskRigor holds for " +
      `"Audited trial" (${AUDITED}), so the note says the AI says this research confirmed that. Copy the paper's own ` +
      "sentence the point rests on, whole and exactly, in the paper's language, with no ellipsis, or leave " +
      "source_sentence out, and check the answer again.");
  });

  it("says the AI says it of a sentence found only in a copy the AI supplied, and shows it as that copy's", async () => {
    const supplied = { [HANDLE_AUDITED]: { kind: "search_copy" as const, blocks: [{ text: AUDITED_SENTENCE }] } };
    const { result } = await lookedUp(comparisonCall(["audited"],
      [point("confirmed", QUOTES.slower, [AUDITED], AUDITED_SENTENCE), NOT_CHECKED]), texts(supplied));
    expect(result.plain_answer_note).toBe(`${LEAD} The AI says this research confirmed that, from a full-text audit of ` +
      `1 study: “${QUOTES.slower}” In the copy of the study that the AI supplied, AskRigor found: “${AUDITED_SENTENCE}”` +
      `${UNCHECKED} ${SHOWN_SENTENCES_SAY}`);
    expect(notes(result)).toContain("plain_answer_comparison[0].source_sentence was found only in the copy of the paper " +
      "that the AI supplied, so the note shows it as that copy's and says the AI says this research confirmed that. Found " +
      "in a text AskRigor fetched itself, or in the paper's PubMed abstract, it would not.");
  });

  it("says why a sentence wasn't looked up, and that a point resting on no study has no sentence to look up", async () => {
    const { result } = await lookedUp(comparisonCall(["audited"],
      [point("confirmed", QUOTES.slower, [AUDITED], AUDITED_SENTENCE), NOT_CHECKED]), texts({}));
    expect(result.plain_answer_note).toContain("The AI says this research confirmed that");
    expect(notes(result)).toContain(`AskRigor no longer holds the full text of "Audited trial" (${AUDITED}), so ` +
      "plain_answer_comparison[0].source_sentence wasn't looked up there and the note says the AI says this research " +
      "confirmed that. Reading the paper again with acquire_open_full_text and passing the new research_receipt lets it " +
      "be looked up.");
    const fixed = "Earlier I said magnesium falls in kidney injury; in these studies it mostly rose.";
    const corrected = await lookedUp(comparisonCall(["audited"], [
      { claim: CLAIMS[0], outcome: "corrected", answer_quote: fixed, source_sentence: AUDITED_SENTENCE }, NOT_CHECKED],
    { answer_draft: `[Audited trial](https://doi.org/${AUDITED}) was audited in full.\n\n${fixed}`,
      corrections: [{ retracted: "Magnesium falls in kidney injury.", change: fixed, by_user: false }] }));
    expect(corrected.requests).toBeUndefined();
    expect(corrected.result.plain_answer_note).toContain("This research corrected that, from a correction the research");
    expect(notes(corrected.result)).toContain("plain_answer_comparison[0].source_sentence isn't looked up: no study read " +
      "here backs that point, so the note names what does.");
  });

  it("never changes what the check stops: status, steps, limits and receipt are the same with or without a sentence", async () => {
    const without = check(comparisonCall(["audited", "abstract"],
      [point("corrected", QUOTES.slower, [AUDITED, ABSTRACT_PMID]), NOT_CHECKED]));
    for (const sentence of [AUDITED_SENTENCE, "A sentence that is in no paper AskRigor holds at all."]) {
      const { result } = await lookedUp(comparisonCall(["audited", "abstract"],
        [point("corrected", QUOTES.slower, [AUDITED, ABSTRACT_PMID], sentence), NOT_CHECKED]));
      for (const field of ["status", "next_steps", "next_step_kinds", "limits", "caveats", "finalization_receipt"] as const) {
        expect(result[field], `${field} with ${sentence}`).toEqual(without[field]);
      }
    }
  });
});

describe("owner answer 416a: the comparison's later form, only where the switch holds", () => {
  const entry = point("confirmed", QUOTES.slower, [AUDITED], AUDITED_SENTENCE);
  const later = (call: Record<string, unknown>, comparison: unknown) =>
    ({ ...call, later_inputs: { ...call.later_inputs as object, plain_answer_comparison: comparison } });

  it("takes it in later_inputs or at the top level, and the later one when both are given", () => {
    const inLater = check(later(comparisonCall(["audited"], undefined), [entry, NOT_CHECKED]));
    expect(inLater).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(comparisonSentenceRequestsOf(inLater)).toEqual([{ entry: 0, sentence: AUDITED_SENTENCE,
      papers: [{ source: AUDITED, handles: [HANDLE_AUDITED], pmids: [] }] }]);
    const topLevel = check(comparisonCall(["audited"], [entry, NOT_CHECKED]));
    expect(notes(topLevel).join("\n")).not.toContain("dropped");
    expect(comparisonSentenceRequestsOf(topLevel)).toEqual(comparisonSentenceRequestsOf(inLater));
    const both = check(later(comparisonCall(["audited"], [point("confirmed", QUOTES.slower, [AUDITED]), NOT_CHECKED]),
      [entry, NOT_CHECKED]));
    expect(notes(both)).toContain("later_inputs.plain_answer_comparison: plain_answer_comparison is given both at the top " +
      "level and in later_inputs: its later_inputs form, the newer one, is used.");
    expect(comparisonSentenceRequestsOf(both)).toEqual(comparisonSentenceRequestsOf(inLater));
  });

  it("keeps a usable comparison at the top level over a later one that doesn't parse, so nothing is held back", () => {
    const given = comparisonCall(["audited"], [point("confirmed", QUOTES.slower, [AUDITED]), NOT_CHECKED]);
    for (const broken of ["not a list", [{ ...entry, outcome: "proved" }, NOT_CHECKED]]) {
      const result = check(later(given, broken));
      expect(result, JSON.stringify(broken)).toMatchObject({ status: "ready_with_limits", next_steps: [] });
      expect(notes(result)).toContain("later_inputs.plain_answer_comparison: plain_answer_comparison is given both at " +
        "the top level and in later_inputs, and its later_inputs form doesn't parse: its top-level form is used.");
      expect(result.plain_answer_note).toContain("The AI says this research confirmed that");
    }
  });

  it("drops an unusable sentence alone, keeping the comparison and the note", () => {
    const result = check(comparisonCall(["audited"],
      [{ ...entry, source_sentence: "x".repeat(601) } as Comparison[number], NOT_CHECKED]));
    expect(result).toMatchObject({ status: "ready_with_limits", next_steps: [] });
    expect(result.plain_answer_note).toContain("The AI says this research confirmed that");
    expect(notes(result).join("\n")).toContain("plain_answer_comparison[0].source_sentence");
    expect(comparisonSentenceRequestsOf(result)).toBeUndefined();
  });

  it("asks nothing about sentences of an account that turned the note off, and looks none up", () => {
    const options = { ...ON, plainAnswer: { note: false, account: OPTIONS.plainAnswer!.account } };
    for (const comparison of [[entry, NOT_CHECKED], [point("confirmed", QUOTES.slower, [AUDITED]), NOT_CHECKED]]) {
      const result = finalizeResearch(comparisonCall(["audited"], comparison as Comparison), options);
      expect(result).toMatchObject({ status: "ready_with_limits", plain_answer: { status: "note_off" } });
      expect(result).not.toHaveProperty("plain_answer_note");
      expect(notes(result).join("\n")).not.toContain("source_sentence");
      expect(comparisonSentenceRequestsOf(result)).toBeUndefined();
    }
  });

  it("is off unless the switch holds: then nothing is looked up, and lookups given are not read", () => {
    const call = comparisonCall(["audited"], [entry, NOT_CHECKED]);
    const off = finalizeResearch(call, OPTIONS);
    expect(comparisonSentenceRequestsOf(off)).toBeUndefined();
    const found: ComparisonSentenceLookup[] = [{ entry: 0, outcome: "found", source: AUDITED, text: "full_text" }];
    expect(comparable(finalizeResearch(call, { ...OPTIONS, comparisonSentenceLookups: found }) as never))
      .toEqual(comparable(off as never));
    expect(comparable(finalizeResearch(call, { ...OPTIONS, closingComparison: false }) as never))
      .toEqual(comparable(off as never));
  });
});

describe("owner answer 416a through the connector: manage_research_access and finalize_research", () => {
  const IDENTITY_SECRET = new TextEncoder().encode("synthetic-closing-comparison-identity-secret-of-32-bytes");
  const AGREEMENT = {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true
  } as const;
  afterEach(() => { vi.unstubAllEnvs(); });

  async function connector(mode: string) {
    const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
      identitySecret: IDENTITY_SECRET });
    for (const subject of ["auth0|dev", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", service.accountKeyForSubject("auth0|dev"));
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_CLOSING_COMPARISON", mode);
    const fullText = vi.fn((handle: string) => HELD[handle]);
    const abstract = vi.fn(async (pmid: string) => ABSTRACTS[pmid]);
    const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
    registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) =>
      Promise<CallToolResult>) => { handlers.set(name, execute); } } as unknown as McpServer, {
      researchAccessRequired: true, mcpSurface: "/mcp/claude", researchContributorAccessService: service,
      findingsLibrary: false, sourceLineTexts: { fullText, abstract } } satisfies RegisterToolsOptions);
    const extra = (subject: string) => ({ authInfo: { token: "synthetic-token", clientId: "synthetic-client",
      scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } });
    const manage = (input: Record<string, unknown>, subject: string) =>
      handlers.get("manage_research_access")!(manageResearchAccessInputSchema.parse(input), extra(subject));
    // The published finalize_research input, later_inputs included, as a strict client checks it.
    const finalize = (input: Record<string, unknown>, subject: string) => handlers.get("finalize_research")!(
      finalizeResearchInputSchema.extend({ later_inputs: z.record(z.string(), z.unknown()).optional() }).parse(input),
      extra(subject));
    return { manage, finalize, fullText, abstract };
  }
  const text = (result: CallToolResult) => (result.content as Array<{ text: string }>).map(({ text: line }) => line).join("\n");
  const register = { action: "register_plain_answer", plainAnswer: { researchTarget: TARGET,
    text: `${CLAIMS[0]} ${CLAIMS[1]} Most people recover.`, claims: [...CLAIMS] } };
  // The research's receipts, signed now, after the registration.
  const research = () => {
    const signed = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
      issueResearchReceipt(kind, { ...claims, t: Date.now() + 60_000 }, { secret: SECRET });
    return [
      signed("study_audit", { id: AUDITED, doi: AUDITED, handle: HANDLE_AUDITED, status: "complete_no_unresolved_fields" }),
      signed("full_text_read", { id: FULL, doi: FULL, handle: HANDLE_FULL, content: "b".repeat(16) }),
      signed("pubmed_record", { pmid: ABSTRACT_PMID, doi: ABSTRACT_DOI, abs: "1" }),
    ];
  };
  const comparison = [point("corrected", QUOTES.slower, [AUDITED, FULL], FULL_SENTENCE),
    { claim: CLAIMS[1], outcome: "confirmed", answer_quote: QUOTES.daily, sources: [ABSTRACT_PMID],
      source_sentence: ABSTRACT_SENTENCE }];
  // The call as the AI sends it: the comparison, with its sentences, in later_inputs.
  const call = (receipts: string[]) => {
    const made = comparisonCall(["audited", "full", "abstract"], undefined, { receipts }, { secret: SECRET });
    return { ...made, later_inputs: { ...made.later_inputs as object, plain_answer_comparison: comparison } };
  };
  const NOTE = `${LEAD} This research corrected that, from a full-text audit of 1 study and the full text of 1 study, ` +
    `methods not audited: “${QUOTES.slower}” In the full text of "Full-text cohort" (${FULL}), AskRigor found: ` +
    `“${FULL_SENTENCE}” ${SECOND} This research confirmed that, from the abstract of 1 study: “${QUOTES.daily}” In the ` +
    `study's abstract, AskRigor found: “${ABSTRACT_SENTENCE}” ${SHOWN_SENTENCES_SAY}`;

  it("says the later form at registration, looks the sentences up and shows them, where the switch holds", async () => {
    const { manage, finalize, fullText, abstract } = await connector("dev");
    const registered = await manage(register, "auth0|dev");
    expect(text(registered)).toContain(`or did not check it. ${CLOSING_COMPARISON_REGISTERED} Claims: `);
    const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
    const result = await finalize(call([receipt, ...research()]), "auth0|dev");
    expect(result.structuredContent).toMatchObject({ status: "ready_with_limits", next_steps: [],
      plain_answer: { status: "registered", claims: 2 }, plain_answer_note: NOTE });
    expect(text(result)).toContain("comparing the answer with the plain answer registered before research, its " +
      "quotations exactly as they are and its other words in the answer's language when the answer is not in English: " +
      NOTE);
    expect(fullText).toHaveBeenCalledWith(HANDLE_FULL);
    expect(abstract).toHaveBeenCalledWith(ABSTRACT_PMID);
  });

  it("is as before for an account the switch doesn't hold for: no sentence said, taken or looked up", async () => {
    for (const [mode, subject] of [["dev", "auth0|person"], ["off", "auth0|dev"], ["", "auth0|dev"]] as const) {
      const { manage, finalize, fullText, abstract } = await connector(mode);
      const registered = await manage(register, subject);
      expect(text(registered), `${mode} ${subject}`).not.toContain("source_sentence");
      expect(text(registered)).toContain("or did not check it. Claims: ");
      const receipt = (registered.structuredContent as { research_receipt: string }).research_receipt;
      const result = await finalize(call([receipt, ...research()]), subject);
      // The comparison given in later_inputs is a published input in the wrong place, as before the switch, so the note
      // on asks for it at the top level.
      expect(result.structuredContent).toMatchObject({ status: "not_ready" });
      expect(text(result)).toContain("later_inputs.plain_answer_comparison: dropped. plain_answer_comparison is a " +
        "published top-level input of finalize_research; give \"plain_answer_comparison\" at the top level.");
      expect(fullText).not.toHaveBeenCalled();
      expect(abstract).not.toHaveBeenCalled();
    }
  });
});
