import { REGISTRY_END, REGISTRY_START, SEARCHED_REGISTRY_FORMATS } from "../registry-formats.js";

/**
 * Public research identifiers in their exact published shapes, which the privacy screens set aside before they read a
 * text's numbers. The first real research dossier (AskRigor#477 stage 1, 16 Nov 2026) was refused for good because an
 * open lead cited a trial by its registry number, ACTRN12620000032954, and the screens read its 14 digits as a phone
 * number. Each shape is exact and structural, a prefix and its digit pattern, with no judgment of meaning:
 *
 * - a DOI: "10.", four to nine digits, "/" and its suffix up to any "@", standing on its own (a link is read as a link);
 * - "PMID" (a colon and spaces may follow) and a PubMed record number, and a PMCID (PMC and its number): one to nine
 *   digits with no leading zero, and no digit after one space, dot or dash, since a number of any length could
 *   otherwise be the first group of a longer one ("PMID 612 345 678" stays a phone number);
 * - a trial registry number with its registry's prefix, in the study map's formats (registry-formats.ts: NCT, ISRCTN,
 *   EudraCT and EU CT with their label, ACTRN, ChiCTR, DRKS, CTRI, jRCT, UMIN, PACTR, KCT, TCTR and RBR), and two the
 *   study map does not read: IRCT's (IRCT, 12 to 14 digits, N and a count) and jRCT's lettered one (jRCTs and nine
 *   digits). Netherlands Trial Register numbers (NTR, NL) are left out: the study map takes any digit count for them,
 *   and their real numbers are too short to read as phone numbers.
 *
 * A registry number takes exactly its own digits, so a phone number written beside it, or after its prefix with another
 * count of digits, stays in the text and is read as before. What no shape can tell apart is a phone number written in a
 * registry's exact shape (NCT and eight digits) or inside a DOI's suffix, which is free text: a stated limit. A dash of
 * another kind (U+2010 to U+2015, U+2212 and the small and full-width hyphen-minus) reads as "-" while matching; the
 * text keeps its own.
 */

// A DOI standing on its own, not inside a link; it may hold one level of parentheses (as findings/card.ts read it), and
// it ends at an @, which no DOI holds, so an email address written onto one stays in the text.
const DOI = String.raw`(?<![\w/.-])10\.\d{4,9}\/(?:[^\s"<>()[\]{}@]|\([^\s"<>()[\]{}@]{0,200}\))+`;
// No digit after one separator: the number is not one group of a longer one.
const WHOLE = String.raw`${REGISTRY_END}(?![\s.-]?\d)`;
const PMID = String.raw`${REGISTRY_START}pmid:?\s*[1-9]\d{0,8}${WHOLE}`;
const PMCID = String.raw`${REGISTRY_START}pmc[1-9]\d{0,8}${WHOLE}`;
const OTHER_REGISTRIES = [String.raw`irct\d{12,14}n\d{1,3}`, String.raw`jrct[a-z]\d{9}`];
const REGISTRIES = [...SEARCHED_REGISTRY_FORMATS.map(([, pattern]) => pattern), ...OTHER_REGISTRIES]
  .map((pattern) => `${REGISTRY_START}(?:${pattern})${REGISTRY_END}`);
const RESEARCH_IDENTIFIER = new RegExp([DOI, PMID, PMCID, ...REGISTRIES].join("|"), "giu");
// Each one UTF-16 unit, as "-" is, so a match's place in the text read with "-" is its place in the text.
const OTHER_DASHES = /[‐-―−﹘﹣－]/gu;

/** The text with each research identifier in its exact published shape as `replacement` gives it. */
export function replaceResearchIdentifiers(text: string, replacement: (identifier: string) => string): string {
  const dashed = text.replace(OTHER_DASHES, "-");
  let replaced = "";
  let last = 0;
  for (const match of dashed.matchAll(RESEARCH_IDENTIFIER)) {
    const end = match.index + match[0].length;
    replaced += text.slice(last, match.index) + replacement(text.slice(match.index, end));
    last = end;
  }
  return replaced + text.slice(last);
}

/** The text with each research identifier in its exact published shape replaced by the placeholder. */
export function withoutResearchIdentifiers(text: string, placeholder: string): string {
  return replaceResearchIdentifiers(text, () => placeholder);
}

/**
 * The text with the digits of each research identifier in its exact published shape left out, its letters and marks
 * kept: a screen that reads numbers no longer sees the identifier's, and one that reads words still sees its words.
 */
export function withoutResearchIdentifierDigits(text: string): string {
  return replaceResearchIdentifiers(text, (identifier) => identifier.replace(/[0-9]/gu, ""));
}
