import { REGISTRY_END, REGISTRY_START, SEARCHED_REGISTRY_FORMATS } from "../registry-formats.js";

/**
 * Public research identifiers in their exact published shapes, which the privacy screens set aside before they read a
 * text's numbers. The first real research dossier (AskRigor#477 stage 1, 16 Nov 2026) was refused for good because an
 * open lead cited a trial by its registry number, ACTRN12620000032954, and the screens read its 14 digits as a phone
 * number. Each shape is exact and structural, a prefix and its digit pattern, with no judgment of meaning:
 *
 * - a DOI: "10.", four to nine digits, "/" and a suffix of letters, digits and - . _ / : (Crossref's recommended
 *   characters but ";"), with one level of parentheses, standing on its own (a link is read as a link); it ends at any
 *   other character, so a number or an address written onto one after a comma, ";", "=" or "@" stays in the text;
 * - "PMID" (a colon and spaces may follow) and a PubMed record number, and a PMCID (PMC and its number): one to nine
 *   digits with no leading zero; and an NCT number;
 * - for the research dossier only (RESEARCH_IDENTIFIERS), every trial registry number with its registry's prefix in the
 *   study map's formats (registry-formats.ts: ISRCTN, EudraCT and EU CT with their label, ACTRN, ChiCTR, DRKS, CTRI,
 *   jRCT, UMIN, PACTR, KCT, TCTR and RBR), and three the study map does not read: an EU CT number with its two-digit
 *   suffix (2023-501234-12-00), IRCT's (IRCT, 12 to 14 digits, N and a count) and jRCT's lettered one (jRCTs and nine
 *   digits). Netherlands Trial Register numbers (NTR, NL) are left out: the study map takes any digit count for them,
 *   and their real numbers are too short to read as phone numbers. The findings card's screen, whose texts are public
 *   and whose privacy problems are rewritten rather than final, keeps to the first two (SOURCE_IDENTIFIERS), as before
 *   (Codex's red team of 16 Nov 2026: each prefix set aside is one more way to dress a phone number).
 *
 * An identifier other than a DOI is set aside only when the text does not go on with a digit after spaces, after a
 * hyphen or dot written against the digit, or with a group of one to three digits in parentheses (Codex's red team):
 * its number may then be the first group of a longer one, as in "PMID 612 345 678", "UMIN 020794609  58" or
 * "NCT02079460 (958)", and the text is read as before. So a phone number written beside an identifier, or after its
 * prefix with another count of digits, stays a phone number; so does "PMID 31234567 12 weeks", which a sentence writes
 * as "PMID 31234567: 12 weeks" or "(PMID 31234567) 12 weeks" (the dossier's shape says so). What no shape can tell
 * apart is a phone number written in a registry's exact shape (NCT and eight digits), one whose rest follows a spaced
 * dash or a full stop, or digits written into a DOI's suffix: stated limits. A dash of another kind (U+2010 to U+2015,
 * U+2212 and the small and full-width hyphen-minus) reads as "-" while matching; the text keeps its own.
 */

// A DOI standing on its own, not inside a link; it may hold one level of parentheses, as many DOIs do
// (10.1016/S0140-6736(20)30183-5).
const DOI_CHARACTER = String.raw`[-._/:a-z0-9]`;
const DOI = String.raw`(?<![\w/.-])10\.\d{4,9}\/(?:${DOI_CHARACTER}|\(${DOI_CHARACTER}{0,200}\))+`;
const PMID = String.raw`pmid:?\s*[1-9]\d{0,8}`;
const PMCID = String.raw`pmc[1-9]\d{0,8}`;
const NCT = String.raw`nct[\s-]?\d{8}`;
// Before the study map's EudraCT form, so an EU CT number's suffix is not read as a number that follows it.
const EU_CT_WITH_SUFFIX =
  String.raw`(?:eudract|ctis|eu[\s-]?ct|euctr)(?:[\s-]*(?:number|no\.?|nr\.?|id))?[\s:#-]*\d{4}-\d{6}-\d{2}-\d{2}`;
const OTHER_REGISTRIES = [String.raw`irct\d{12,14}n\d{1,3}`, String.raw`jrct[a-z]\d{9}`];
const bounded = (patterns: readonly string[]) => patterns.map((pattern) => `${REGISTRY_START}(?:${pattern})${REGISTRY_END}`);
const SOURCE_IDENTIFIERS = new RegExp([DOI, ...bounded([PMID, PMCID, NCT])].join("|"), "giu");
const RESEARCH_IDENTIFIERS = new RegExp([DOI, ...bounded([PMID, PMCID, EU_CT_WITH_SUFFIX,
  ...SEARCHED_REGISTRY_FORMATS.map(([, pattern]) => pattern), ...OTHER_REGISTRIES])].join("|"), "giu");
// Each one UTF-16 unit, as "-" is, so a match's place in the text read with "-" is its place in the text.
const OTHER_DASHES = /[‐-―−﹘﹣－]/gu;
// The text going on with a number: a digit after spaces, or after a hyphen or dot against it, or one to three digits
// alone in parentheses.
const CONTINUED = /^(?:\s*[-.]?\d|\s*\(\s*\d{1,3}\s*\))/u;

function replaceIdentifiers(text: string, identifiers: RegExp, replacement: (identifier: string) => string): string {
  const dashed = text.replace(OTHER_DASHES, "-");
  let replaced = "";
  let last = 0;
  for (const match of dashed.matchAll(identifiers)) {
    const end = match.index + match[0].length;
    // A DOI ends at a space or a mark it cannot hold, and what follows it is read on its own; another identifier's
    // number may go on.
    if (!match[0].startsWith("10.") && CONTINUED.test(dashed.slice(end))) continue;
    replaced += text.slice(last, match.index) + replacement(text.slice(match.index, end));
    last = end;
  }
  return replaced + text.slice(last);
}

/** The findings card's screen: each DOI, PMID, PMCID and NCT number in its exact shape replaced by the placeholder. */
export function withoutSourceIdentifiers(text: string, placeholder: string): string {
  return replaceIdentifiers(text, SOURCE_IDENTIFIERS, () => placeholder);
}

/** The research dossier's screen: each research identifier in its exact published shape replaced by the placeholder. */
export function withoutResearchIdentifiers(text: string, placeholder: string): string {
  return replaceIdentifiers(text, RESEARCH_IDENTIFIERS, () => placeholder);
}

/**
 * The research dossier's screen: the text with the digits of each research identifier in its exact published shape
 * left out, its letters and marks kept, so a rule that reads numbers no longer sees the identifier's.
 */
export function withoutResearchIdentifierDigits(text: string): string {
  return replaceIdentifiers(text, RESEARCH_IDENTIFIERS, (identifier) => identifier.replace(/[0-9]/gu, ""));
}
