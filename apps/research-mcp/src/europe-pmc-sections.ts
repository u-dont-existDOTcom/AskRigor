export const EUROPE_PMC_SECTIONS = [
  "INTRO", "METHODS", "RESULTS", "DISCUSS", "CONCL", "TABLE", "FIG", "SUPPL",
  "ACK_FUND", "COMP_INT", "CASE", "REF", "BODY"
] as const;
export type EuropePmcSection = typeof EUROPE_PMC_SECTIONS[number];
export const EUROPE_PMC_FULL_TEXT_COVERAGE = "Europe PMC full texts only, about 30% of PubMed records";

const sections: ReadonlySet<string> = new Set(EUROPE_PMC_SECTIONS);
const tokenCharacter = (character: string): boolean => /[\p{L}\p{N}_]/u.test(character);

/**
 * What a query says outside its double-quoted phrases, in one forward scan: each word and each phrase's end ("" for
 * one), with the character right after it; the query with each phrase as "" alone; and whether a quotation mark is left
 * open.
 */
function outsidePhrases(query: string):
{ parts: Array<{ word: string; after: string }>; bare: string; openPhrase: boolean } {
  const parts: Array<{ word: string; after: string }> = [];
  let bare = "";
  let quoted = false;
  const characterAt = (index: number): string => String.fromCodePoint(query.codePointAt(index)!);
  for (let index = 0; index < query.length;) {
    const character = characterAt(index);
    if (quoted && character === "\\") {
      index += 2;
    } else if (character === '"') {
      quoted = !quoted;
      index += 1;
      bare += '"';
      if (!quoted) parts.push({ word: "", after: query[index] ?? "" });
    } else if (!quoted && tokenCharacter(character)) {
      const start = index;
      while (index < query.length && tokenCharacter(characterAt(index))) index += characterAt(index).length;
      parts.push({ word: query.slice(start, index), after: query[index] ?? "" });
      bare += query.slice(start, index);
    } else {
      if (!quoted) bare += character;
      index += character.length;
    }
  }
  return { parts, bare, openPhrase: quoted };
}

/** Exact provider field syntax, outside double-quoted phrases. */
export function europePmcSections(query: string): EuropePmcSection[] {
  const found = new Set<EuropePmcSection>();
  for (const { word, after } of outsidePhrases(query).parts) {
    // Provider codes are ASCII; other letters cannot normalize into a code.
    const field = word.replace(/[a-z]/gu, (letter) => letter.toUpperCase());
    if (after === ":" && sections.has(field)) found.add(field as EuropePmcSection);
  }
  return [...found].sort();
}

// A field's name as Europe PMC's search writes one: ASCII, a letter first (AUTH, FIRST_PDATE, INTRO, sort_date).
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]*$/u;
// The index's other operators (Lucene's; the review of #521, F3): - + or ! right before a word, a phrase or a parenthesis,
// at the query's start or after white space or a parenthesis; && and ||; and a ? inside a word. PubMed reads a - or a +
// as a space, so "valproate -seizures" would ask it for seizures.
const PREFIX_OPERATOR = /(?:^|[\s(])[-+!](?=[\p{L}\p{N}_"(])/u;
const DOUBLED_OPERATOR = /&&|\|\|/u;
const ONE_CHARACTER = /[\p{L}\p{N}_]\?[\p{L}\p{N}_]/u;

/**
 * Whether a query uses Europe PMC's own query syntax, which PubMed would read as something else. Structure alone
 * decides, never meaning: a field's name and its colon (AUTH:, (INTRO:, FIRST_PDATE:[); a distance or a weight (~ or ^)
 * right after a word or a phrase; an operator of the index's other than AND, OR and NOT (above); or a quotation mark left
 * open, which could hide one. A phrase in quotation marks, AND, OR, NOT, parentheses and * are in both indexes' syntax,
 * and a hyphen inside a word or a ? that ends one is punctuation. Any such name counts as a field's, so a word with a
 * colon right after it ("TNF:") reads as one too, and a number with a minus ("-5") as an operator's: the query is then
 * not searched at PubMed, as before.
 */
export function europePmcOnlySyntax(query: string): boolean {
  const { parts, bare, openPhrase } = outsidePhrases(query);
  return openPhrase || PREFIX_OPERATOR.test(bare) || DOUBLED_OPERATOR.test(bare) || ONE_CHARACTER.test(bare) ||
    parts.some(({ word, after }) => (after === ":" && FIELD_NAME.test(word)) || after === "~" || after === "^");
}
