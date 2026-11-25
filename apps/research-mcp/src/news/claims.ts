import { receiptText } from "../research-receipts.js";
import type { NewsCard } from "./card.js";
import type { NewsLineLookup } from "./web-page.js";

/**
 * Atlas news, stage 1 (design v4, section 3.3): the news card's own claims in the finalization receipt, beside the
 * findings card's and under their own condition. `news`: the card's digest; `nl`: what each backing line's lookup found
 * and where, in its order (`<line>:<f|n|u>:<text kind>`, as `bl` gives a findings card's; the kind `web_page` is a news
 * card's alone, a page its check read that read the same again, never a paper's text: the day call counts it so); `ns`:
 * the section of each quote found (`<line>:<section>`); `nr`: how each of the card's sources was read
 * (`<place>:<reading>:<figures>`, as `rd` gives a findings card's); `np`, only when it was read so: the PMID of the
 * PubMed record AskRigor read itself for the card's DOI, whose title and abstract its lines quoting that paper were
 * looked up in, after the full-text tool admitted no copy (the 23 Nov 2026 news audit). The day call and the shadow
 * readers read them; the server stages a card only with them.
 */

const OUTCOME_CODES = { found: "f", not_found: "n", not_checked: "u" } as const;
/** A signed section, cut at whole characters to the findings card's limit. */
const SECTION_LIMIT = 80;

export interface NewsClaims {
  news: string;
  nl: string[];
  ns: string[];
  nr: string[];
  np?: string;
}

export function signedNewsClaims(
  checked: { card: NewsCard; digest: string },
  lookups: readonly NewsLineLookup[],
  readingOf: (source: string) => { read: string; figures?: string | undefined } | undefined,
  pubmedRecord?: string,
): NewsClaims {
  const nl: string[] = [];
  const ns: string[] = [];
  lookups.forEach((lookup, line) => {
    nl.push(`${line + 1}:${OUTCOME_CODES[lookup.sentence]}:${lookup.text ?? "none"}`);
    const section = lookup.sentence_section === undefined ? undefined
      : receiptText(lookup.sentence_section.replace(/[\s\p{Cc}]+/gu, " ").trim(), SECTION_LIMIT).trim();
    if (lookup.sentence === "found" && section !== undefined && section !== "") ns.push(`${line + 1}:${section}`);
  });
  const nr = checked.card.sources.flatMap((source, place) => {
    const reading = readingOf(source);
    return reading === undefined ? [] : [`${place + 1}:${reading.read}:${reading.figures ?? "-"}`];
  });
  return { news: checked.digest, nl, ns, nr, ...(pubmedRecord === undefined ? {} : { np: pubmedRecord }) };
}

/** The news claims a verified receipt signed, or undefined when it signed none (no news card, or no lookups). */
export function newsClaimsOf(claims: Record<string, string | string[]>): NewsClaims | undefined {
  const list = (value: unknown): string[] | undefined => Array.isArray(value) ? value.map(String) : undefined;
  const news = claims.news;
  const nl = list(claims.nl);
  if (typeof news !== "string" || nl === undefined) return undefined;
  return { news, nl, ns: list(claims.ns) ?? [], nr: list(claims.nr) ?? [],
    ...(typeof claims.np === "string" && /^[1-9][0-9]{0,9}$/u.test(claims.np) ? { np: claims.np } : {}) };
}
