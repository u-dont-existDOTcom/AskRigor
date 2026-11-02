import { unicodeCaseFold } from "./unicode-case-fold.js";

export const ATLAS_SEARCH_MAX_LENGTH = 300;
export const ATLAS_SEARCH_MAX_WORDS = 20;
export interface AtlasSearchQuery { text: string; words: string[] }

/** Compatibility forms, full case folding and accents folded. Keep vowel signs and other non-diacritic script marks. */
export function atlasSearchFold(text: string): string {
  return unicodeCaseFold(text.normalize("NFKC")).normalize("NFD").replace(/\p{Diacritic}/gu, "").normalize("NFC");
}

/** Exact tokens, without stemming or language guesses. */
export function atlasSearchWords(text: string): string[] {
  return atlasSearchFold(text).split(/[\p{White_Space}\p{P}]+/u).filter(Boolean);
}

/** Never echo an unbounded query. Invalid input is a normal form response, with no database read. */
export function atlasSearchQuery(raw: string | null): { query: AtlasSearchQuery | null; text: string; message: string | null } {
  const text = raw?.trim() ?? "";
  if (text.length > ATLAS_SEARCH_MAX_LENGTH) return {
    query: null, text: "", message: `Use at most ${ATLAS_SEARCH_MAX_LENGTH} characters and ${ATLAS_SEARCH_MAX_WORDS} words.`,
  };
  const words = atlasSearchWords(text);
  if (words.length > ATLAS_SEARCH_MAX_WORDS) return {
    query: null, text, message: `Use at most ${ATLAS_SEARCH_MAX_WORDS} words.`,
  };
  if (words.length === 0) return { query: null, text, message: "Enter one or more words to search the findings." };
  return { query: { text, words: [...new Set(words)] }, text, message: null };
}

// Full-text matching (plan docs/superpowers/plans/2026-11-02-atlas-full-text-search-and-findings-map.md) ---------------

/** The parts of a finding's page that search reads, in the page's order; the wording is the title a list shows. */
export const ATLAS_SEARCH_FIELDS = ["wording", "question", "applies_to", "subject", "topic", "why_not_usual",
  "what_would_change_it", "numbers", "searches", "sources", "number"] as const;
export type AtlasSearchField = typeof ATLAS_SEARCH_FIELDS[number];
export interface AtlasSearchText { field: AtlasSearchField; text: string }

/**
 * How well a finding matches: 0, every word stands whole in its wording; 1, every word is in its wording; 2, every
 * word stands whole somewhere in its text; 3, every word is somewhere in its text. Lower comes first, and within a
 * rank a finding that holds the query as typed (a number such as P-1003, a DOI, a phrase) comes first.
 */
export type AtlasSearchRank = 0 | 1 | 2 | 3;
/** foundIn: for each word, the first part of the page, in the page's order, where it matches best. */
export interface AtlasSearchMatch { rank: AtlasSearchRank; asTyped: boolean; foundIn: AtlasSearchField[] }

// Unicode categories, never a word list: letters of an alphabet with capitals, other letters, marks (with modifier
// letters, which attach to the letters around them), digits and everything else.
const OTHER = 0;
const CASED = 1;
const LETTER = 2;
const MARK = 3;
const DIGIT = 4;
const kindOf = (character: string | undefined): number => character === undefined ? OTHER
  : /[\p{M}\p{Lm}]/u.test(character) ? MARK
    : /[\p{Lu}\p{Ll}\p{Lt}]/u.test(character) ? CASED
      : /\p{L}/u.test(character) ? LETTER
        : /\p{N}/u.test(character) ? DIGIT : OTHER;

/** Two neighbours belong to one word: letters of the same kind, digits, or a mark with a letter or another mark. */
function joined(left: number, right: number): boolean {
  if (left === OTHER || right === OTHER) return false;
  if (left === MARK || right === MARK) return left !== DIGIT && right !== DIGIT;
  return left === right;
}

function characterBefore(text: string, index: number): string | undefined {
  if (index === 0) return undefined;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(index - 2, index);
  }
  return text[index - 1];
}

const characterAt = (text: string, index: number): string | undefined =>
  index >= text.length ? undefined : String.fromCodePoint(text.codePointAt(index)!);

/**
 * A single digit, or a single letter of an alphabet with capitals (the D of "vitamin D", as an example), matches only
 * where it stands on its own; a longer word, or one character of a script without capitals, may sit inside a longer word.
 */
function mustStandAlone(characters: readonly string[]): boolean {
  const kind = kindOf(characters[0]);
  return characters.length === 1 && (kind === CASED || kind === DIGIT);
}

/** A folded word's best place in a folded text: 2 standing whole, 1 inside a longer word, 0 nowhere. */
function occurrence(text: string, word: string): 0 | 1 | 2 {
  const characters = Array.from(word);
  const first = kindOf(characters[0]);
  const last = kindOf(characters.at(-1));
  const alone = mustStandAlone(characters);
  let best: 0 | 1 = 0;
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (!joined(kindOf(characterBefore(text, at)), first) && !joined(last, kindOf(characterAt(text, at + word.length)))) {
      return 2;
    }
    if (!alone) best = 1;
  }
  return best;
}

/** Whether every word of the query is in the texts, and how well; undefined when one is missing. */
export function atlasSearchMatch(query: AtlasSearchQuery, texts: readonly AtlasSearchText[]): AtlasSearchMatch | undefined {
  const folded = texts.map(({ field, text }) => ({ field, text: atlasSearchFold(text) }));
  // As typed, without the quotation marks around a phrase.
  const typed = atlasSearchFold(query.text).replace(/\p{White_Space}+/gu, " ").trim()
    .replace(/^\p{Quotation_Mark}+|\p{Quotation_Mark}+$/gu, "");
  const found = new Set<AtlasSearchField>();
  let inWording = true;
  let wholeInWording = true;
  let whole = true;
  for (const word of query.words) {
    let best = 0;
    let bestField: AtlasSearchField | undefined;
    let wording = 0;
    for (const { field, text } of folded) {
      const quality = occurrence(text, word);
      if (quality > best) {
        best = quality;
        bestField = field;
      }
      if (field === "wording") wording = quality;
    }
    if (bestField === undefined) return undefined;
    found.add(bestField);
    whole &&= best === 2;
    inWording &&= wording > 0;
    wholeInWording &&= wording === 2;
  }
  const rank: AtlasSearchRank = inWording ? (wholeInWording ? 0 : 1) : whole ? 2 : 3;
  return { rank, asTyped: folded.some(({ text }) => text.includes(typed)),
    foundIn: ATLAS_SEARCH_FIELDS.filter((field) => found.has(field)) };
}
