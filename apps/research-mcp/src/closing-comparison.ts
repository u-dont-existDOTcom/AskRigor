import { z } from "zod";

import { countedPhrase, verifiedWorkParts, type VerifiedWork } from "./findings/card.js";
import {
  lookUpQuotes, quoteCache, quoteTooShort, SOURCE_LINE_LIMITS, SOURCE_LINE_TEXTS,
  type QuoteCache, type QuoteSource, type SourceLineTexts
} from "./source-lines.js";

/**
 * The closing comparison with the quick answer (owner answers 140b, 217b, 413a and 220a), as owner answer 416a changes it
 * (24 November 2026, "both changes"; built behind ASKRIGOR_CLOSING_COMPARISON, off, config.ts and research-trial.ts). The
 * owner's saved answers showed two faults. A "confirmed" whose only proof was the answer's own sentence: a magnesium note
 * said a full-text audit confirmed that acute kidney injury slows magnesium clearance, and that paper never mentions acute
 * kidney injury. And "did not check" said of points the research had read about: in ten saved answers, 11 of 47 points,
 * 5 to 8 of them looked up in abstracts, partly read papers, reports or web pages, since a point counted as checked only
 * on a study whose methods were audited, comments or forum threads read, or a statement AskRigor checks.
 *
 * So, where the switch holds:
 *
 * 1. What was read counts, and the note says how. A point may also rest on a paper that AskRigor's receipts show was read
 *    in full without a method audit, or read as its abstract (a PubMed record with one): "from the abstract of 1 study",
 *    "from the full text of 1 study, methods not audited". Each paper counts once, at the deepest reading its receipts
 *    show. A report or a web page still counts for nothing, and comments, forum threads and "nothing found" points are as
 *    they were. The cost the owner accepted: a point can rest on an abstract.
 * 2. The paper's sentence. The AI may copy the sentence a point rests on (source_sentence, in the comparison's later
 *    form). When AskRigor finds it in the text it holds for one of the point's papers (the full text a receipt's handle
 *    still holds, or the PubMed abstract), the note shows it, saying where it was found; without one, or when it is not
 *    found, the note says "The AI says this research confirmed that" (corrected, qualified) instead of "This research
 *    confirmed that". The match is the source lines' (owner answer 237a): exact, with spacing, case, Unicode form,
 *    quotation marks, dashes, emphasis and a word a PDF broke across lines set aside and nothing else, so it works in any
 *    language with no word list; and only as one or more whole sentences of the paper, so a part of a sentence that left
 *    out its negation is not found. A match shows that the words are in the paper, never that they prove the point: the
 *    note says so once. A sentence found only in a copy the AI supplied is shown as that copy's, and the note still says
 *    the AI says it, as a source line found there gets no tick (owner answer 237a). The cost the owner accepted: the
 *    note gets longer.
 *
 * Nothing here stops an answer: the six blocking checks (owner answers 193a, 195a and 217b) are unchanged, and what the
 * lookups find goes to the AI as notes. Nothing is stored. With the switch off, every result is as it was.
 */

/** A sentence's length, as a source line's quote's. */
export const COMPARISON_SENTENCE_CHARACTERS = SOURCE_LINE_LIMITS.quote;

export const comparisonSentenceSchema = z.string().trim().min(1).max(COMPARISON_SENTENCE_CHARACTERS)
  .describe("Optional, with confirmed, corrected or qualified, for a point resting on a study read here: the study's " +
    "own sentence the point rests on, copied whole and exactly, in the paper's language. AskRigor looks it up in the " +
    "study's text it holds; the note shows it when found, and otherwise says the AI says the research found it.");

/** The studies behind a point read without an audit, each paper once, at the deepest reading its receipts show. */
export interface ComparisonReadings {
  /** Papers read in full (to the end of a full text), whose methods no audit covers. */
  fullTexts: number;
  /** Papers read as their abstract: a PubMed record with one, and no fuller reading. */
  abstracts: number;
}

/** The parts of what backs a point, in the note's words: audits first, then full texts, abstracts and the rest. */
export function comparisonWorkParts(work: VerifiedWork, read: ComparisonReadings): string[] {
  const parts = verifiedWorkParts(work);
  // The audits' part comes first when there is one (verifiedWorkParts' order).
  const audits = work.studies > 0 ? parts.slice(0, 1) : [];
  return [
    ...audits,
    ...(read.fullTexts === 0 ? [] : [countedPhrase(read.fullTexts, "the full text of 1 study, methods not audited",
      "the full texts of # studies, methods not audited")]),
    ...(read.abstracts === 0 ? [] : [countedPhrase(read.abstracts, "the abstract of 1 study", "the abstracts of # studies")]),
    ...parts.slice(audits.length)
  ];
}

/**
 * Parts joined as a list: "A, B and C", or, when a part before the last holds a comma of its own ("the full text of 1
 * study, methods not audited"), "A; B; and C", so no part runs into the next.
 */
export function joinedParts(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  const head = parts.slice(0, -1);
  return head.some((part) => part.includes(","))
    ? `${head.join("; ")}; and ${parts.at(-1)}` : `${head.join(", ")} and ${parts.at(-1)}`;
}

/** Where a sentence was looked up: the full text a handle holds, or the PubMed abstract. */
export type ComparisonSentenceText = typeof SOURCE_LINE_TEXTS[number];
export const COMPARISON_SENTENCE_OUTCOMES = ["found", "not_found", "not_checked"] as const;
export const COMPARISON_SENTENCE_REASONS = ["no_text", "text_expired", "text_unavailable", "too_short"] as const;
export type ComparisonSentenceReason = typeof COMPARISON_SENTENCE_REASONS[number];

/** One of a point's papers, with the texts its verified receipts name. */
export interface ComparisonSentencePaper extends QuoteSource {
  /** The paper as the entry's sources give it. */
  source: string;
}

/** A sentence to look up: the entry it comes from, by its place in plain_answer_comparison, and the point's papers. */
export interface ComparisonSentenceRequest {
  entry: number;
  sentence: string;
  papers: readonly ComparisonSentencePaper[];
}

/** What looking a sentence up found. */
export interface ComparisonSentenceLookup {
  entry: number;
  outcome: typeof COMPARISON_SENTENCE_OUTCOMES[number];
  /** With found: the paper it was found in, as the entry gives it, the text, and the section there, if named. */
  source?: string;
  text?: ComparisonSentenceText;
  section?: string;
  /** With not_checked: why it couldn't be called found or missing. */
  reason?: ComparisonSentenceReason;
}

// Which of a paper's unchecked texts says most about why: one no longer held, then one that couldn't be read, then none.
const REASON_ORDER: readonly ComparisonSentenceReason[] = ["text_expired", "text_unavailable", "no_text"];

/**
 * Looks each sentence up in its point's papers, in the order given, as a source line's quote is looked up (lookUpQuotes):
 * found in any paper's text AskRigor fetched itself, it is found there; found only in a copy the AI supplied, it is found
 * there; missing from every paper's text, it is not found; and otherwise it is not checked, with the reason a paper's
 * text gave (no longer held, unreadable just then, or none at all), since the paper not read may hold it. A sentence too
 * short to mean much is never looked up.
 */
export async function lookUpComparisonSentences(
  requests: readonly ComparisonSentenceRequest[],
  texts: SourceLineTexts,
  cache: QuoteCache = quoteCache()
): Promise<ComparisonSentenceLookup[]> {
  const lookups: ComparisonSentenceLookup[] = [];
  for (const { entry, sentence, papers } of requests) {
    if (quoteTooShort(sentence)) {
      lookups.push({ entry, outcome: "not_checked", reason: "too_short" });
      continue;
    }
    let supplied: ComparisonSentenceLookup | undefined;
    let ownText: ComparisonSentenceLookup | undefined;
    const unchecked: ComparisonSentenceReason[] = [];
    for (const paper of papers) {
      const { document, reason, quotes } = await lookUpQuotes(paper, [sentence], texts, cache);
      const [quote] = quotes;
      if (quote?.outcome === "found" && document !== undefined) {
        const found: ComparisonSentenceLookup = { entry, outcome: "found", source: paper.source, text: document.kind,
          ...(quote.section === undefined ? {} : { section: quote.section }) };
        if (document.kind !== "search_copy") {
          ownText = found;
          break;
        }
        supplied ??= found;
      } else if (quote?.outcome !== "not_found") {
        unchecked.push(reason ?? "no_text");
      }
    }
    const found = ownText ?? supplied;
    if (found !== undefined) lookups.push(found);
    else if (unchecked.length === 0 && papers.length > 0) lookups.push({ entry, outcome: "not_found" });
    else {
      lookups.push({ entry, outcome: "not_checked",
        reason: REASON_ORDER.find((reason) => unchecked.includes(reason)) ?? "no_text" });
    }
  }
  return lookups;
}

/** The lookups' stand-in when they could not finish in time: each sentence unchecked, its text unavailable just then. */
export function lateComparisonSentences(requests: readonly ComparisonSentenceRequest[]): ComparisonSentenceLookup[] {
  return requests.map(({ entry }) => ({ entry, outcome: "not_checked", reason: "text_unavailable" }));
}

/** A sentence AskRigor found for a point, as the note shows it. */
export interface ShownSentence {
  sentence: string;
  text: ComparisonSentenceText;
  /** How the note names the paper when the point rests on more than one: its label and identifier, or its identifier. */
  paper: string;
}

/** Whether a found sentence lets the note drop "the AI says": found in a text AskRigor fetched, never a copy the AI gave. */
export const ownTextSentence = (shown: ShownSentence | undefined): boolean =>
  shown !== undefined && shown.text !== "search_copy";

/**
 * Where the note says the sentence was found, and the sentence: "In the study's abstract, AskRigor found: “…”" for a point
 * resting on one paper, and the paper named for a point resting on more. A full text from the owner's library is one
 * AskRigor fetched, so it reads as any full text.
 */
export function shownSentenceLine(shown: ShownSentence, onePaper: boolean, quoted: (text: string) => string): string {
  const where = shown.text === "search_copy"
    ? onePaper ? "the copy of the study that the AI supplied" : `the copy of ${shown.paper} that the AI supplied`
    : `${onePaper ? "the study's " : "the "}${shown.text === "abstract" ? "abstract" : "full text"}` +
      (onePaper ? "" : ` of ${shown.paper}`);
  return `In ${where}, AskRigor found: ${quoted(shown.sentence)}`;
}

/** The note's last sentence when it shows a paper's sentence: what finding it shows, and what it doesn't. */
export const SHOWN_SENTENCES_SAY = "AskRigor checked only that each sentence it quotes from a paper is in that paper, " +
  "not that it proves the point.";

/** What the lead of a point resting on a paper says, with the paper's sentence found in AskRigor's own text or not. */
export function comparisonVerb(outcome: string, onPaper: boolean, ownSentence: boolean): string {
  return `${onPaper && !ownSentence ? "The AI says this research" : "This research"} ${outcome} that`;
}

/**
 * The note for the AI on a point whose sentence wasn't shown, by its place: not found, or not looked up and why. A
 * note only: nothing here holds the answer back.
 */
export function comparisonSentenceNote(at: string, outcome: string, lookup: ComparisonSentenceLookup,
  papers: string): string {
  const says = `the note says the AI says this research ${outcome} that`;
  if (lookup.outcome === "not_found") {
    return `${at}.source_sentence isn't in the text AskRigor holds for ${papers}, so ${says}. Copy the paper's own ` +
      "sentence the point rests on, whole and exactly, in the paper's language, with no ellipsis, or leave " +
      "source_sentence out, and check the answer again.";
  }
  switch (lookup.reason) {
    case "too_short":
      return `${at}.source_sentence is too short to mean much, so it wasn't looked up and ${says}: give the paper's ` +
        "whole sentence, and check the answer again.";
    case "text_expired":
      return `AskRigor no longer holds the full text of ${papers}, so ${at}.source_sentence wasn't looked up there and ` +
        `${says}. Reading the paper again with acquire_open_full_text and passing the new research_receipt lets it ` +
        "be looked up.";
    case "text_unavailable":
      return `AskRigor couldn't read the text of ${papers} in time just now, so ${at}.source_sentence wasn't looked up ` +
        `and ${says}. Checking the answer again looks it up again.`;
    default:
      return `AskRigor holds no text of ${papers} to look ${at}.source_sentence up in, so ${says}.`;
  }
}

/** The note for the AI on points resting on a study that give no sentence (an input it may add; never a step). */
export function sentenceMissingNote(entries: readonly number[]): string {
  const one = entries.length === 1;
  const places = entries.map((entry) => `plain_answer_comparison[${entry}]`);
  const named = one ? places[0]! : `${places.slice(0, -1).join(", ")} and ${places.at(-1)}`;
  return `${named} ${one ? "rests" : "rest"} on a study read here but ${one ? "gives" : "give"} no source_sentence, so ` +
    `the note says the AI says this research found ${one ? "it" : "them"}. To show what the paper says, give ` +
    `${one ? "it" : "each"} the study's own sentence the point rests on as source_sentence, copied whole and exactly in ` +
    "the paper's language, in the whole comparison sent in later_inputs.plain_answer_comparison, and check the answer " +
    "again.";
}

/** The note for the AI on a sentence found only in a copy of the paper the AI supplied. */
export function sentenceInSuppliedCopyNote(at: string, outcome: string): string {
  return `${at}.source_sentence was found only in the copy of the paper that the AI supplied, so the note shows it as ` +
    `that copy's and says the AI says this research ${outcome} that. Found in a text AskRigor fetched itself, or in the ` +
    "paper's PubMed abstract, it would not.";
}

/** The note for the AI on a sentence given for a point no study read here backs: it is not looked up. */
export function sentenceWithoutStudyNote(at: string): string {
  return `${at}.source_sentence isn't looked up: no study read here backs that point, so the note names what does.`;
}

/**
 * What the registration's result adds where the switch holds, so the AI knows before its first check that a point may
 * rest on a study read without an audit and may give the paper's sentence.
 */
export const CLOSING_COMPARISON_REGISTERED = "A point may rest on a study read here: audited, read in full, or read " +
  "as its abstract; the note says which. For such a point, plain_answer_comparison may also give source_sentence: the " +
  "study's own sentence the point rests on, copied whole and exactly in the paper's language; send the whole comparison " +
  "in later_inputs.plain_answer_comparison. The note shows that sentence when AskRigor finds it in the study's text it " +
  "holds, and otherwise says the AI says the research confirmed, corrected or qualified the point.";
