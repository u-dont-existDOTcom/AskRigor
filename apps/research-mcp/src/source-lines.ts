import type { AuditableDocumentIndex } from "@askrigor/sources";
import { z } from "zod";

import { figureText } from "./binary-results.js";
// A section is cut at whole characters, since the final check signs it into a receipt (the review of 5 November).
import { receiptText } from "./research-receipts.js";

/**
 * The source line (owner answer 237a, 4 November 2026; report "What people want from AI answers"): beside a key claim
 * the answer shows the paper's sentence, the paper's own conclusion and the strongest thing against it. People's top
 * want of an AI answer is that the source really says what the answer claims, and the final check only proved that a
 * paper exists and was read as deeply as declared.
 *
 * What is exact goes here: whether both quotes are in the text AskRigor fetched, compared in any language with no model.
 * That shows the words exist, not that they are fair, which is why the conclusion and the strongest thing against the
 * claim sit beside them. Whether they back the claim is meaning: the meaning judge reads that where it is on.
 *
 * Finding a quote or not never stops an answer, as the six blocking checks (owner answers 193a, 195a and 217b) don't
 * name it: a quote not found is a note, and the panel says so. Nothing here is stored.
 */

export const SOURCE_LINE_LIMITS = { lines: 12, quote: 600, claim: 300, against: 500, section: 120 } as const;
// A quote this short says little, so finding it would say little: letters and digits, the same in any script.
const SHORTEST_QUOTE = 16;

export const sourceLineSchema = z.object({
  source: z.string().trim().min(1).max(200)
    .describe("The id of the key_sources entry this line rests on."),
  claim: z.string().trim().min(1).max(SOURCE_LINE_LIMITS.claim)
    .describe("The key claim, as the answer states it."),
  sentence: z.string().trim().min(1).max(SOURCE_LINE_LIMITS.quote)
    .describe("The paper's sentence the claim rests on, copied whole and exactly, in the paper's language."),
  conclusion: z.string().trim().min(1).max(SOURCE_LINE_LIMITS.quote)
    .describe("The paper's own conclusion, copied whole and exactly, in the paper's language."),
  against: z.string().trim().min(1).max(SOURCE_LINE_LIMITS.against)
    .describe("The strongest thing against the claim, in the answer's words, or that nothing against it was found.")
}).strict();
export type SourceLine = z.output<typeof sourceLineSchema>;

export const SOURCE_LINE_OUTCOMES = ["found", "not_found", "not_checked"] as const;
// Owner answer 252a: a copy from the owner's library is its own kind, which, like the AI's search copy, the Atlas never
// quotes (owner-library papers are for the owner's own research only).
export const SOURCE_LINE_TEXTS = ["full_text", "abstract", "search_copy", "library_copy"] as const;
export const SOURCE_LINE_REASONS = [
  "not_a_key_source", "no_text", "text_expired", "text_unavailable", "too_short"
] as const;
type Outcome = typeof SOURCE_LINE_OUTCOMES[number];
type TextKind = typeof SOURCE_LINE_TEXTS[number];
type Reason = typeof SOURCE_LINE_REASONS[number];

/** Runtime only (owner answer 189a): what the check found of one line, in the order the lines were given. */
export const sourceLineCheckSchema = z.object({
  source: z.string(),
  label: z.string(),
  sentence: z.enum(SOURCE_LINE_OUTCOMES),
  sentence_section: z.string().optional(),
  conclusion: z.enum(SOURCE_LINE_OUTCOMES),
  conclusion_section: z.string().optional(),
  text: z.enum(SOURCE_LINE_TEXTS).optional(),
  reason: z.enum(SOURCE_LINE_REASONS).optional(),
  shown: z.boolean()
}).strict();
export type SourceLineCheck = z.output<typeof sourceLineCheckSchema>;

/** The check of one line before the gate adds how the answer shows it. */
export type SourceLineLookup = Omit<SourceLineCheck, "shown" | "label">;

/** Where one line's text may be: the handles and PMIDs its key source's verified receipts name. */
export interface SourceLineRequest {
  line: number;
  keySource: boolean;
  handles: readonly string[];
  pmids: readonly string[];
}

export interface SourceLineDocument {
  kind: TextKind;
  /**
   * The text's blocks in order. `wraps` marks a block whose line breaks only wrap its lines, as a PDF's page text
   * does: neither they nor the block's start end a clause, since a sentence runs on across them.
   */
  blocks: ReadonlyArray<{ text: string; section?: string | undefined; wraps?: boolean | undefined }>;
}

export interface SourceLineTexts {
  /** The text a handle holds, or undefined once AskRigor no longer holds it. */
  fullText(handle: string): SourceLineDocument | undefined;
  /** A PubMed record's abstract: undefined when the record has none, null when it couldn't be read. */
  abstract(pmid: string): Promise<SourceLineDocument | undefined | null>;
}

/** A fetched paper as the source line reads it. A copy the AI supplied, or one from the owner's library, is said to be one. */
export function sourceLineDocument(index: AuditableDocumentIndex): SourceLineDocument {
  return {
    kind: index.source.provider === "client_supplied" ? "search_copy"
      : index.source.provider === "owner_library" || index.source.retrieval_provider === "owner_library" ? "library_copy"
      : "full_text",
    blocks: index.blocks.map(({ text, section_path: path, kind }) => ({
      text,
      ...(path.length === 0 ? {} : { section: receiptText(path[path.length - 1]!, SOURCE_LINE_LIMITS.section) }),
      // A PDF's page text breaks its lines where the page did, not where a clause ends.
      ...(kind === "page_text" ? { wraps: true } : {})
    }))
  };
}

// A word a PDF broke across lines: a hyphen after a letter, then a space or line break before a small letter. It may
// also be a real hyphen ("pre- and post-"), so each reading of the text is searched.
const BROKEN_WORD = /(?<=\p{L})[-­‐‑]\s+(?=\p{Ll})/gu;

/** A quote as it is looked up: without the quotation marks around it or a closing mark, which may differ. */
function quoteForm(quote: string): string {
  return figureText(quote).replace(/^["'\p{Pi}\p{Pf}]+/u, "").replace(/["'\p{Pi}\p{Pf}\p{STerm}; ]+$/u, "");
}

type Finder = (quote: string) => { found: boolean; section?: string | undefined };

// Clause boundaries (the review of 5 November 2026, finding 1): a quote is the paper's own words only from a clause's
// start to a clause's end, so "decrease significantly after 12 weeks" is not found in "Pain scores did not decrease
// significantly after 12 weeks." All of it is structural, the same in any script: a line break or a block's start
// (where they are the text's own, not a PDF's wrapped lines), a sentence's end (Unicode's Sentence_Terminal) or a colon
// or a semicolon. Between the quote and the boundary may sit only white space, quotation marks and brackets, and a
// citation marker: numbers in brackets, or in superscript.
const LINE_BREAK = /[^\S\r\n\v\f\u0085\u2028\u2029]*(?:\r\n|[\r\n\v\f\u0085\u2028\u2029])\s*/u;
const CLAUSE_MARK = /^[\p{Sentence_Terminal}:;\u061b\u1364-\u1366\u1804\u204f\ua6f4\ua6f6]$/u;
// A full stop, a colon or another mark between two Latin letters or digits joins them ("12.5", "1:2", "e.g"): no
// boundary. Figures and abbreviations are written that way in every script that uses these marks.
const JOINED = /^[a-z0-9]$/u;
const SURROUND = /^[\s"'\p{Pi}\p{Pf}\p{Ps}\p{Pe}]$/u;
const CITATION_AFTER = /^[[(] ?\d{1,4}(?: ?[,-] ?\d{1,4}){0,20} ?[\])]/u;
const CITATION_BEFORE = /[[(] ?\d{1,4}(?: ?[,-] ?\d{1,4}){0,20} ?[\])]$/u;
// A list's own marks, at the start of a line: a bullet, or a dash.
const LIST_MARK = /^[\u2022\u2023\u2043\u2219\u25e6\u00b7-]$/u;
// A run of superscript digits, as a citation prints one (a comma or a dash between): put in brackets in the text and in
// the quote alike, so it reads as a citation marker and a unit such as kg/m² still matches its quote.
const SUPERSCRIPT_RUN = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+(?:[,\u207b\u2013-][\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+)*/gu;
const bracketedSuperscripts = (text: string): string => text.replace(SUPERSCRIPT_RUN, (run) => ` [${run}]`);

/** The character at a position, whole, and the one that ends just before one. */
const characterAt = (text: string, at: number): string => String.fromCodePoint(text.codePointAt(at) ?? 0);
function characterBefore(text: string, at: number): string {
  const last = text.charCodeAt(at - 1);
  return last >= 0xdc00 && last <= 0xdfff && at >= 2 ? text.slice(at - 2, at) : text.charAt(at - 1);
}

/** Whether the mark at a position ends a clause: not one joining two Latin letters or digits. */
function endsClauseAt(text: string, at: number, mark: string): boolean {
  return CLAUSE_MARK.test(mark) && !(JOINED.test(text.charAt(at - 1)) && JOINED.test(text.charAt(at + mark.length)));
}

/** Whether a quote found at `at` starts a clause of the text: going back over white space, marks and citations only. */
function startsClause(text: string, at: number, breaks: ReadonlySet<number>): boolean {
  let position = at;
  for (;;) {
    if (position === 0 || breaks.has(position)) return true;
    const citation = CITATION_BEFORE.exec(text.slice(Math.max(0, position - 120), position));
    if (citation !== null) {
      position -= citation[0].length;
      continue;
    }
    const before = characterBefore(text, position);
    if (SURROUND.test(before)) {
      position -= before.length;
      continue;
    }
    // A list item's own mark, right at its line's start.
    if (LIST_MARK.test(before) && (position - 1 === 0 || breaks.has(position - 1))) return true;
    return endsClauseAt(text, position - before.length, before);
  }
}

/** Whether a quote that ends at `end` ends a clause of the text: going on over white space, marks and citations only. */
function endsClause(text: string, end: number, breaks: ReadonlySet<number>): boolean {
  // A quote that ends with a clause's own mark (a colon, say) ends one.
  const last = characterBefore(text, end);
  if (end > 0 && endsClauseAt(text, end - last.length, last)) return true;
  let position = end;
  for (;;) {
    if (position >= text.length || (position > end && breaks.has(position))) return true;
    const citation = CITATION_AFTER.exec(text.slice(position, position + 120));
    if (citation !== null) {
      position += citation[0].length;
      continue;
    }
    const next = characterAt(text, position);
    if (SURROUND.test(next)) {
      position += next.length;
      continue;
    }
    return endsClauseAt(text, position, next);
  }
}

/** One reading of a document as quotes are looked up in it: its text, where each block starts, and its clause breaks. */
interface Searchable {
  text: string;
  blocks: Array<{ start: number; section: string | undefined }>;
  breaks: ReadonlySet<number>;
}

function searchable(document: SourceLineDocument, reading: (text: string) => string): Searchable {
  const parts: string[] = [];
  const blocks: Searchable["blocks"] = [];
  const breaks = new Set<number>();
  let length = 0;
  for (const block of document.blocks) {
    const read = bracketedSuperscripts(reading(block.text));
    // A PDF's lines and pages wrap a sentence; any other text's lines and blocks are its own.
    const lines = block.wraps === true ? [read] : read.split(LINE_BREAK);
    let first = true;
    for (const line of lines) {
      const part = figureText(line);
      if (part === "") continue;
      const start = length === 0 ? 0 : length + 1;
      if (first) blocks.push({ start, section: block.section });
      if (block.wraps !== true) breaks.add(start);
      first = false;
      parts.push(part);
      length = start + part.length;
    }
  }
  return { text: parts.join(" "), blocks, breaks };
}

/**
 * Looks quotes up in one text, in figureText's form: Unicode form, invisible characters, spacing, case, curly quotation
 * marks, dashes and emphasis set aside, and nothing else, so a changed word, number or sign is not found. The blocks
 * read as one text, as a sentence may cross a page. A quote is found only where it starts and ends at a clause's
 * boundary (startsClause and endsClause): a part of a sentence, which may have lost its negation, is not found.
 */
function finder(document: SourceLineDocument): Finder {
  const forms = [(text: string) => text, (text: string) => text.replace(BROKEN_WORD, ""),
    (text: string) => text.replace(BROKEN_WORD, "-")].map((reading) => searchable(document, reading));
  return (quote) => {
    const wanted = quoteForm(bracketedSuperscripts(quote));
    if (wanted === "") return { found: false };
    for (const { text, blocks, breaks } of forms) {
      for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
        if (!startsClause(text, at, breaks) || !endsClause(text, at + wanted.length, breaks)) continue;
        const block = blocks.findLast(({ start }) => start <= at);
        return { found: true, section: block?.section };
      }
    }
    return { found: false };
  };
}

const longEnough = (quote: string): boolean => quoteForm(quote).replace(/[^\p{L}\p{N}]/gu, "").length >= SHORTEST_QUOTE;

/** A line whose quotes are looked up: a source line, or a findings card's backing line, whose conclusion is optional. */
export type QuotedLine = Pick<SourceLine, "source" | "sentence"> & { conclusion?: string | undefined };

/** Looks each line's two quotes up in the text its key source's receipts name. A failed read leaves a line unchecked. */
export async function lookUpSourceLines(
  lines: readonly QuotedLine[],
  requests: readonly SourceLineRequest[],
  texts: SourceLineTexts
): Promise<SourceLineLookup[]> {
  const held = new Map<string, Finder | undefined>();
  const abstracts = new Map<string, Promise<SourceLineDocument | undefined | null>>();
  const lookups: SourceLineLookup[] = [];
  for (const { line, keySource, handles, pmids } of requests) {
    const { source, sentence, conclusion } = lines[line]!;
    const unchecked = (reason: Reason): SourceLineLookup =>
      ({ source, sentence: "not_checked", conclusion: "not_checked", reason });
    if (!keySource) {
      lookups.push(unchecked("not_a_key_source"));
      continue;
    }
    if (!longEnough(sentence) && (conclusion === undefined || !longEnough(conclusion))) {
      lookups.push(unchecked("too_short"));
      continue;
    }
    let document: SourceLineDocument | undefined;
    for (const handle of handles) {
      document = texts.fullText(handle);
      if (document !== undefined) break;
    }
    const expired = handles.length > 0 && document === undefined;
    let unreadable = false;
    if (document === undefined) {
      for (const pmid of pmids) {
        const read = abstracts.get(pmid) ?? texts.abstract(pmid).catch(() => null);
        abstracts.set(pmid, read);
        const abstract = await read;
        if (abstract === null) unreadable = true;
        if (abstract !== undefined && abstract !== null) {
          document = abstract;
          break;
        }
      }
    }
    if (document === undefined) {
      lookups.push(unchecked(expired ? "text_expired" : unreadable ? "text_unavailable" : "no_text"));
      continue;
    }
    const key = handles.join(" ") + "|" + pmids.join(" ");
    const find = held.get(key) ?? finder(document);
    held.set(key, find);
    const read = (quote: string | undefined): { outcome: Outcome; section?: string | undefined } => {
      if (quote === undefined || !longEnough(quote)) return { outcome: "not_checked" };
      const { found, section } = find(quote);
      // Only the abstract of a paper read in full can't show that a quote isn't in the paper.
      return found ? { outcome: "found", section } : { outcome: expired ? "not_checked" : "not_found" };
    };
    const [first, second] = [read(sentence), read(conclusion)];
    // A backing line may give no conclusion, which is then simply not looked up.
    const unfound = first.outcome === "not_checked" || (conclusion !== undefined && second.outcome === "not_checked");
    lookups.push({
      source,
      sentence: first.outcome,
      ...(first.section === undefined ? {} : { sentence_section: first.section }),
      conclusion: second.outcome,
      ...(second.section === undefined ? {} : { conclusion_section: second.section }),
      text: document.kind,
      ...(unfound ? { reason: expired ? "text_expired" as const : "too_short" as const } : {})
    });
  }
  return lookups;
}

/** Whether the answer shows a quote: compared as a quote is looked up. */
export function quoteShown(answer: string, quote: string): boolean {
  return figureText(answer).includes(quoteForm(quote));
}

const TEXT_NAMES: Readonly<Record<TextKind, string>> = {
  full_text: "the full text",
  abstract: "the abstract",
  search_copy: "the copy the AI supplied",
  library_copy: "the copy from the owner's library"
};

/** What the AI should do about one checked line, as notes. None of them holds the answer back. */
export function sourceLineNotes(check: SourceLineCheck): string[] {
  const { label, reason, text } = check;
  const notes: string[] = [];
  if (reason === "not_a_key_source") {
    notes.push(`source_lines names ${label}, which isn't in key_sources: give the id of a key source, so its quotes can ` +
      "be looked up.");
  } else if (reason === "no_text") {
    notes.push(`AskRigor fetched no text of ${label} to look its quotes up in, so the answer can't say they were found.`);
  } else if (reason === "text_unavailable") {
    notes.push(`AskRigor couldn't read the abstract of ${label} just now, so its quotes weren't looked up and the answer ` +
      "can't say they were found.");
  } else if (reason === "text_expired") {
    notes.push(`AskRigor no longer holds the full text of ${label}, so its quotes weren't all looked up and the answer ` +
      "can't say they were found. Reading the paper again with acquire_open_full_text and passing the new " +
      "research_receipt lets them be looked up.");
  } else if (reason === "too_short") {
    notes.push(`A quote given for ${label} is too short to mean much: give the whole sentence.`);
  }
  const missing = [
    ...(check.sentence === "not_found" ? ["sentence"] : []),
    ...(check.conclusion === "not_found" ? ["conclusion"] : [])
  ];
  if (missing.length > 0) {
    notes.push(`The ${missing.join(" and the ")} given for ${label} ${missing.length === 1 ? "isn't" : "aren't"} in ` +
      `${TEXT_NAMES[text ?? "full_text"]} AskRigor looked in. Copy each whole and exactly, with no ellipsis, in the ` +
      "paper's language, or take it out of the answer and of source_lines, and check the answer again.");
  }
  if (!check.shown) {
    notes.push(`The answer doesn't show both quotes given for ${label}: show them, as written, beside the claim, with ` +
      "the strongest thing against it.");
  }
  return notes;
}

/** Both quotes found in a paper AskRigor fetched itself: the only line the answer may mark as found. */
export function sourceLineConfirmed(check: SourceLineCheck): boolean {
  return check.sentence === "found" && check.conclusion === "found" && check.text !== "search_copy";
}

// What the answer shows beside a line both of whose quotes were found.
export const SOURCE_LINE_CONFIRMED = "✓ AskRigor found both in the paper.";
