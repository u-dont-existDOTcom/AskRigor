import { sectionKind, type AuditableDocumentIndex } from "@askrigor/sources";
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
   * The text's blocks in order. A block's line breaks only wrap its lines. `runsOn` marks a block whose text runs on
   * from the block before it, as a PDF's next page does, and an HTML page's or a plain text's next line within its
   * section: a sentence may cross from one to the next.
   */
  blocks: ReadonlyArray<{ text: string; section?: string | undefined; runsOn?: boolean | undefined }>;
}

export interface SourceLineTexts {
  /** The text a handle holds, or undefined once AskRigor no longer holds it. */
  fullText(handle: string): SourceLineDocument | undefined;
  /** A PubMed record's abstract: undefined when the record has none, null when it couldn't be read. */
  abstract(pmid: string): Promise<SourceLineDocument | undefined | null>;
}

/** A fetched paper as the source line reads it. A copy the AI supplied, or one from the owner's library, is said to be one. */
export function sourceLineDocument(index: AuditableDocumentIndex): SourceLineDocument {
  // A PDF's page text breaks where its page did, and an HTML page's or a plain text's lines (a block each) where a tag,
  // the page's own source or a wrap did, not where a sentence ends (an HTML page's lines are laid out for full-text
  // admission and the paywall labels, "did <b>not</b> decrease" on three: the recheck of #417). So the next page runs on
  // from the page before, and the next line from the line before within its section; a heading its index took into the
  // section path starts the section afresh. A JATS paper's blocks are its own paragraphs.
  const lined = index.source.format === "html_text" || index.source.format === "plain_text";
  return {
    kind: index.source.provider === "client_supplied" ? "search_copy"
      : index.source.provider === "owner_library" || index.source.retrieval_provider === "owner_library" ? "library_copy"
      : "full_text",
    blocks: index.blocks.map(({ text, section_path: path, kind }, place) => {
      const before = index.blocks[place - 1];
      const runsOn = before !== undefined && (kind === "page_text" && before.kind === "page_text" ||
        lined && before.section_path.length === path.length && before.section_path.every((part, at) => part === path[at]));
      return {
        text,
        ...(path.length === 0 ? {} : { section: receiptText(path[path.length - 1]!, SOURCE_LINE_LIMITS.section) }),
        ...(runsOn ? { runsOn: true } : {})
      };
    })
  };
}

/** A PubMed abstract as the source line reads it: a structured one's sections each a block, under its label, as a label
 * ("RESULTS:") is no part of a sentence. */
export function abstractDocument(abstract: string, sections?: ReadonlyArray<{ label?: string | undefined; text: string }>):
SourceLineDocument {
  return { kind: "abstract", blocks: sections === undefined || sections.length === 0 ? [{ text: abstract }]
    : sections.map(({ label, text }) =>
      ({ text, ...(label === undefined ? {} : { section: receiptText(label, SOURCE_LINE_LIMITS.section) }) })) };
}

// A word a PDF broke across lines: a hyphen after a letter, then a space or line break before a small letter. It may
// also be a real hyphen ("pre- and post-"), so each reading of the text is searched.
const BROKEN_WORD = /(?<=\p{L})[-­‐‑]\s+(?=\p{Ll})/gu;

/** A quote as it is looked up: without the quotation marks around it or a closing mark, which may differ. */
function quoteForm(quote: string): string {
  return figureText(quote).replace(/^["'\p{Pi}\p{Pf}\s]+/u, "").replace(/["'\p{Pi}\p{Pf}\p{STerm}\s]+$/u, "");
}

type Finder = (quote: string) => { found: boolean; section?: string | undefined };

/*
 * Whole sentences only (the recheck of #417, 5 November 2026): a quote is the paper's own words only when it is one or
 * more whole, consecutive sentences of one paragraph. So "decrease significantly after 12 weeks" is not found in "Pain
 * scores did not decrease significantly after 12 weeks.", nor "vitamin D reduces fracture risk in older adults" after
 * "We could not confirm the earlier report:". The sentences are Unicode's (UAX #29, by Intl.Segmenter), the same in any
 * script and with no word list: a full stop between digits ("12.5") or before a small letter ("6 wk. but", "e.g. zinc")
 * ends none, and a colon or a semicolon never does. Two structural additions: a full stop after an abbreviation with
 * a full stop inside it ends no sentence even before a capital letter ("e.g. Lactobacillus", ABBREVIATION_END), and a
 * section's label at a line's start ("Conclusions:", one the section-name list full-text admission uses knows) ends one
 * (LABEL_LINE). A
 * paragraph is a block, or a run of blocks that run on (a PDF's pages, an HTML page's or a plain text's lines within a
 * section); its line breaks read as spaces. At the quote's ends may sit only white space, quotation marks and brackets,
 * a list's mark and, before its sentence's end, a citation marker: numbers in brackets or in superscript, or authors
 * and a year in parentheses. What this can't see, each refusing a quote rather than finding a part: a text with no
 * sentence marks (Thai, Lao, Tibetan) is one sentence a paragraph, so only a whole paragraph is found; a Greek question
 * mark is the semicolon itself once a text is in NFC (U+037E is U+003B), where Unicode's rules end no sentence; a
 * heading that runs into its paragraph (a PDF's, or an HTML page's subheading the section-name list doesn't know), and
 * a table's or a list's item without a full stop, are part of the next sentence. And what it lets through, each a part
 * of a sentence found as a whole one: a whole sentence quoted out of its paragraph's context; an abbreviation with no
 * full stop inside it before a capital letter ("vs. Group B", "Dr. Smith"); a JATS list after a lead-in that ends with
 * a colon ("The drug did not:"), whose items are matched one by one; and a word in a sentence that sits on a line of its
 * own and is a section's name (a bold "results"), which starts a new section. JATS superscript citations read as bare
 * digits, so a quote must keep them.
 */
// Unicode's rules in one fixed locale, so every server finds the same sentences; no tailoring is asked for.
const SENTENCES = new Intl.Segmenter("en", { granularity: "sentence" });
const LINE_BREAKS = /\r\n|[\r\n\v\f\u0085\u2028\u2029]/gu;
// A run of superscript digits, as a citation prints one (a comma or a dash between): put in brackets in the text and in
// the quote alike, so it reads as a citation marker and a unit such as kg/m² still matches its quote.
const SUPERSCRIPT_RUN = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+(?:[,\u207b\u2013-][\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+)*/gu;
const bracketedSuperscripts = (text: string): string => text.replace(SUPERSCRIPT_RUN, (run) => ` [${run}]`);
// A citation marker in figureText's form: numbers in brackets or parentheses ("[3, 4-6]", a superscript as
// bracketedSuperscripts writes it), or authors and a year in parentheses, exactly: "(smith, 2020)", "(smith et al.,
// 2020)", "(smith & jones 2019; lee, 2021)".
const NUMBERS = String.raw`\d{1,4}(?: ?[,-] ?\d{1,4}){0,20}`;
const NAME = String.raw`\p{L}[\p{L}\p{M}'-]*`;
const AUTHORS = String.raw`${NAME}(?: et al\.?,?| & ${NAME},?|,) \d{4}[a-z]?`;
// White space may sit just inside a bracket and before a semicolon, as a citation linked in HTML or a JATS xref reads
// ("( smith et al., 2020 )", "[ 12 ]").
const CITATION = String.raw`\[ ?${NUMBERS} ?\]|\( ?${NUMBERS} ?\)|\( ?${AUTHORS}(?: ?; ?${AUTHORS})* ?\)`;
// Between a sentence's start and the quote: white space, quotation marks and brackets, a list's mark (a bullet, or a dash
// before a space, never a minus sign) and a citation marker the sentence before left.
const LEADING = new RegExp(String.raw`^(?:[\s"'\p{Pi}\p{Pf}\p{Ps}\p{Pe}\u2022\u2023\u2043\u2219\u25e6\u00b7]|-(?=\s)|${CITATION})*$`, "u");
// Between the quote and its sentence's end: white space, closing marks, the sentence's own end and a citation marker.
const TRAILING = new RegExp(String.raw`^(?:[\s"'\p{Pi}\p{Pf}\p{Pe}\p{STerm}]|${CITATION})*$`, "u");

// A sentence's last word that is an abbreviation by its form (the recheck of #417): one with a full stop inside it (e.g.,
// i.e., z.B., U.S., т.е.). Unicode's rules end a sentence at its full stop before a capital letter ("No probiotic
// tested, e.g. Lactobacillus rhamnosus GG reduced diarrhoea"), so such a sentence runs on into the next: joining two
// sentences can only make a quote longer or refuse it, never let a part of one through. An abbreviation with no full
// stop inside it ("vs.", "incl.", "approx.", "St.", "Dr.", "et al.") isn't told from a sentence's last word ("twice a
// day.", "in all.", "10 mg."), so before a capital letter it still ends a sentence: a known limit.
const ABBREVIATION_END = /(?:^|[^\p{L}\p{M}.])(?:(?:\p{L}\p{M}*)+\.){2,}$/u;
// A section's label and its colon at a line's start ("Conclusions: Vitamin D…", as a PDF or a plain text sets a
// structured abstract's): the label's text, for sectionKind, the list full-text admission reads headings by.
const LABEL_LINE = /^\s*([^\s:：][^:：\n]{0,60}?)\s*[:：]\s*/u;

/**
 * Where a paragraph's sentences start: Unicode's sentences (UAX #29), with an opening bracket its rules leave at a
 * sentence's end ("group.[12] Next") opening the next one, a sentence ending in an abbreviation run on into the next
 * (ABBREVIATION_END), and a sentence that starts with a section's label at a line's start (`lines`) starting again after
 * the label (LABEL_LINE): "We could not confirm the earlier report: vitamin D…" has no label, so it stays whole.
 */
function sentenceStarts(text: string, lines: readonly number[]): number[] {
  const segments: number[] = [];
  for (const { index } of SENTENCES.segment(text)) {
    let start = index;
    while (start > (segments.at(-1) ?? -1) + 1 && /\p{Ps}/u.test(text.charAt(start - 1))) start -= 1;
    segments.push(start);
  }
  const starts = segments.filter((start, place) =>
    place === 0 || !ABBREVIATION_END.test(text.slice(segments[place - 1]!, start).trimEnd()));
  const labelled = new Set(starts);
  // The lines are in order, so the last sentence start at or before each is found going on, not again from the first.
  let sentence = 0;
  for (const line of lines) {
    const label = LABEL_LINE.exec(text.slice(line, line + 100));
    if (label === null || sectionKind(label[1]!) === undefined) continue;
    const at = line + label[0].search(/\S/u);
    while (sentence + 1 < starts.length && starts[sentence + 1]! <= at) sentence += 1;
    // Only a label that starts a sentence: one in a sentence a line break cut ("…the earlier\nresults: …") is none.
    if (text.slice(starts[sentence]!, at).trim() !== "") continue;
    const after = line + label[0].length;
    if (after < text.length) labelled.add(after);
  }
  return [...labelled].sort((left, right) => left - right);
}

// How far into a sentence a block's start is placed exactly.
const SECTION_REACH = 20_000;

/** One reading of a document as quotes are looked up in it: its paragraphs in figureText's form, one a line; each
 * sentence's span in that text; and where each block starts. */
interface Searchable {
  text: string;
  sentences: Array<{ start: number; end: number }>;
  blocks: Array<{ start: number; section: string | undefined }>;
}

function searchable(document: SourceLineDocument, reading: (text: string) => string): Searchable {
  const paragraphs: Array<Array<SourceLineDocument["blocks"][number]>> = [];
  for (const block of document.blocks) {
    if (block.runsOn === true && paragraphs.length > 0) paragraphs.at(-1)!.push(block);
    else paragraphs.push([block]);
  }
  const lines: string[] = [];
  const sentences: Searchable["sentences"] = [];
  const blocks: Searchable["blocks"] = [];
  let next = 0;
  for (const paragraph of paragraphs) {
    let raw = "";
    const starts: Array<{ at: number; section: string | undefined }> = [];
    // Where each of the paragraph's lines starts: each block's start, and after each line break inside a block.
    const lineStarts: number[] = [];
    for (const block of paragraph) {
      if (raw !== "") raw += " ";
      starts.push({ at: raw.length, section: block.section });
      lineStarts.push(raw.length);
      const read = bracketedSuperscripts(reading(block.text));
      for (const { index, 0: lineBreak } of read.matchAll(LINE_BREAKS)) lineStarts.push(raw.length + index + lineBreak.length);
      // A line break reads as as many spaces, so every position stays where it was.
      raw += read.replace(LINE_BREAKS, (lineBreak) => " ".repeat(lineBreak.length));
    }
    // Each sentence in figureText's form, with a space before it where the text had white space.
    let line = "";
    let space = false;
    const spans: Array<{ start: number; end: number; raw: number }> = [];
    const cuts = sentenceStarts(raw, lineStarts);
    cuts.forEach((cut, index) => {
      const piece = raw.slice(cut, cuts[index + 1] ?? raw.length);
      const form = figureText(piece);
      if (/^\s/u.test(piece)) space = true;
      if (form !== "") {
        if (space && line !== "") line += " ";
        spans.push({ start: line.length, end: line.length + form.length, raw: cut });
        line += form;
        space = false;
      }
      if (/\s$/u.test(piece)) space = true;
    });
    if (line === "") continue;
    // Where each block starts: in its sentence, after the form of the sentence's text before it (or, past a long way
    // into one sentence, as a text with no sentence marks may run on for pages, about there: it names only the section).
    let span = 0;
    for (const { at, section } of starts) {
      while (span + 1 < spans.length && spans[span + 1]!.raw <= at) span += 1;
      const { start, end, raw: from } = spans[span]!;
      const before = at - from > SECTION_REACH ? at - from : figureText(raw.slice(from, at)).length;
      blocks.push({ start: next + Math.min(end, start + (before === 0 ? 0 : before + 1)), section });
    }
    for (const { start, end } of spans) sentences.push({ start: next + start, end: next + end });
    lines.push(line);
    next += line.length + 1;
  }
  return { text: lines.join("\n"), sentences, blocks };
}

/** The index of the last of the sentences that starts at or before a position, found by halves, as they are in order. */
function sentenceAt(sentences: Searchable["sentences"], position: number): number {
  let low = 0;
  let high = sentences.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (sentences[middle]!.start <= position) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

// How far after a quote what may sit before its sentence's end is looked for.
const TRAILING_REACH = 400;

/** Whether only what TRAILING allows lies between a quote's end and a sentence's end. That may be a later sentence's, a
 * short way on in the same paragraph: Unicode's rules end a sentence inside "(Smith et al. 2020)", before the year. */
function endsSentence(text: string, sentences: Searchable["sentences"], last: number, end: number): boolean {
  for (let index = last; index < sentences.length; index += 1) {
    const after = text.slice(end, sentences[index]!.end);
    if (after.length > TRAILING_REACH || after.includes("\n")) return false;
    if (TRAILING.test(after)) return true;
  }
  return false;
}

/**
 * Looks quotes up in one text, in figureText's form: Unicode form, invisible characters, spacing, case, curly quotation
 * marks, dashes and emphasis set aside, and nothing else, so a changed word, number or sign is not found. A quote is
 * found only as one or more whole sentences of a paragraph (above): a part of a sentence, which may have lost its
 * negation, is not.
 */
function finder(document: SourceLineDocument): Finder {
  const forms = [(text: string) => text, (text: string) => text.replace(BROKEN_WORD, ""),
    (text: string) => text.replace(BROKEN_WORD, "-")].map((reading) => searchable(document, reading));
  return (quote) => {
    const wanted = quoteForm(bracketedSuperscripts(quote));
    if (wanted === "") return { found: false };
    for (const { text, sentences, blocks } of forms) {
      for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
        const end = at + wanted.length;
        const first = sentenceAt(sentences, at);
        const last = sentenceAt(sentences, end - 1);
        if (first < 0 || end > sentences[last]!.end || !LEADING.test(text.slice(sentences[first]!.start, at)) ||
            !endsSentence(text, sentences, last, end)) continue;
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
