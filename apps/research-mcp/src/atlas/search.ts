import { unicodeCaseFold } from "./unicode-case-fold.js";

export const ATLAS_SEARCH_MAX_LENGTH = 300;
export const ATLAS_SEARCH_MAX_WORDS = 20;
export interface AtlasSearchQuery { text: string; words: string[] }

/** Exact tokens, without stemming or language guesses. Keep vowel signs and other non-diacritic script marks. */
export function atlasSearchWords(text: string): string[] {
  return unicodeCaseFold(text.normalize("NFKC")).normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .normalize("NFC").split(/[\p{White_Space}\p{P}]+/u).filter(Boolean);
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
