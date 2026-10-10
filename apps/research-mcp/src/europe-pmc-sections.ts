export const EUROPE_PMC_SECTIONS = [
  "INTRO", "METHODS", "RESULTS", "DISCUSS", "CONCL", "TABLE", "FIG", "SUPPL",
  "ACK_FUND", "COMP_INT", "CASE", "REF", "BODY"
] as const;
export type EuropePmcSection = typeof EUROPE_PMC_SECTIONS[number];
export const EUROPE_PMC_FULL_TEXT_COVERAGE = "Europe PMC full texts only, about 30% of PubMed records";

const sections: ReadonlySet<string> = new Set(EUROPE_PMC_SECTIONS);
const tokenCharacter = (character: string): boolean => /[\p{L}\p{N}_]/u.test(character);

/** Exact provider field syntax, outside double-quoted phrases; one forward scan. */
export function europePmcSections(query: string): EuropePmcSection[] {
  const found = new Set<EuropePmcSection>();
  let quoted = false;
  const characterAt = (index: number): string => String.fromCodePoint(query.codePointAt(index)!);
  for (let index = 0; index < query.length;) {
    const character = characterAt(index);
    if (quoted && character === "\\") {
      index += 2;
    } else if (character === '"') {
      quoted = !quoted;
      index += 1;
    } else if (!quoted && tokenCharacter(character)) {
      const start = index;
      while (index < query.length && tokenCharacter(characterAt(index))) index += characterAt(index).length;
      // Provider codes are ASCII; other letters cannot normalize into a code.
      const field = query.slice(start, index).replace(/[a-z]/gu, (letter) => letter.toUpperCase());
      if (query[index] === ":" && sections.has(field)) found.add(field as EuropePmcSection);
    } else {
      index += character.length;
    }
  }
  return [...found].sort();
}
