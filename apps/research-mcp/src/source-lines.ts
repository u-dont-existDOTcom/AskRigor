import type { AuditableDocumentIndex } from "@askrigor/sources";
import { z } from "zod";

import { figureText } from "./binary-results.js";

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
  blocks: ReadonlyArray<{ text: string; section?: string | undefined }>;
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
    blocks: index.blocks.map(({ text, section_path: path }) => ({
      text,
      ...(path.length === 0 ? {} : { section: path[path.length - 1]!.slice(0, SOURCE_LINE_LIMITS.section) })
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

/**
 * Looks quotes up in one text, in figureText's form: Unicode form, invisible characters, spacing, case, curly quotation
 * marks, dashes and emphasis set aside, and nothing else, so a changed word, number or sign is not found. The blocks
 * read as one text, as a sentence may cross a page.
 */
function finder(document: SourceLineDocument): Finder {
  const forms = [(text: string) => text, (text: string) => text.replace(BROKEN_WORD, ""),
    (text: string) => text.replace(BROKEN_WORD, "-")].map((reading) => {
    let at = 0;
    const starts: number[] = [];
    const parts = document.blocks.map(({ text }) => {
      const part = figureText(reading(text));
      starts.push(at);
      at += part.length + 1;
      return part;
    });
    return { text: parts.join(" "), starts };
  });
  return (quote) => {
    const wanted = quoteForm(quote);
    for (const { text, starts } of forms) {
      const at = text.indexOf(wanted);
      if (at < 0) continue;
      let block = starts.length - 1;
      while (block > 0 && starts[block]! > at) block -= 1;
      return { found: true, section: document.blocks[block]?.section };
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
