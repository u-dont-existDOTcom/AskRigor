import { withAsciiDigits } from "../unicode-numbers.js";
import { IANA_TOP_LEVEL_DOMAINS } from "./iana-tlds.js";

/**
 * Contact details and links in a text (decision 171, sections 4B and 4E): the check a finding's published text passes
 * before the Atlas shows it, and that comments pass too. Every rule is exact and structural, so it reads every language
 * and script the same: no word list, no judgment of meaning. It returns which kinds it found, never the matched text.
 *
 * Before matching, the text is read in Unicode compatibility form (so full-width digits, ＠ and ．read as 0-9, @ and .,
 * and every kind of space as a space), with invisible format characters gone and the decimal digits of every script
 * read as 0-9 (Arabic-Indic, Devanagari, Thai and the others), and every dash as a hyphen.
 *
 * - An email address: a local part, @, and a domain of one or more labels and a top-level domain of letters (any
 *   script after a dot, ASCII after an ideographic full stop) or punycode.
 * - A phone number: 7 to 15 digits with phone-style separators (spaces, hyphens, dots, a parenthesized group of 1 to 5
 *   digits) or a leading +. Ordinary numbers stay out: a number written with commas or decimals, a date (2024-03-12,
 *   12.03.2024), a year range or a list of years, a count grouped in threes after one or two digits (1 234 567,
 *   1.234.567), statistics such as 0.85 (0.72-0.99), an ISBN, and a run that continues a word, a decimal or an
 *   identifier (COVID-19, 3.14, 10.1056/...). A plain run of digits with no separator and no + is not read as one, so
 *   record numbers (PMID 40123456, NCT01234567) pass.
 * - A messaging handle: @ and a name that starts with a letter or underscore (not the @ of an email address), or a
 *   link to a messaging service's profile or chat (t.me/..., wa.me/...), which names an account as a handle does.
 *
 * The links check, which comments use and card publication does not (cards name sites such as ClinicalTrials.gov):
 *
 * - a URL: a scheme (http, https, ftp) with :// or www. and a domain;
 * - a bare domain: labels of ASCII letters, digits and hyphens and a top-level domain of the DNS root zone, in any case
 *   (the committed snapshot of IANA's list, iana-tlds.ts: example.com, PHARMA-DEALS.TO, pharma-deals.icu, bbc.co.uk),
 *   or any in punycode (xn--). A two-letter one after a one-character label or a number alone is no domain, so "e.g.",
 *   "M.Sc" and "1.In" stay out. A domain written in another script is read only with its scheme, as a URL, or in
 *   punycode.
 *
 * The limits are stated: a phone number written as words, an address spelled out ("name at example dot com"), or a
 * plain digit run with no separator passes; a list of numbers spaced like a phone number may be read as one; and a full
 * stop with a word right after it that is also a top-level domain ("ended.It", "better.Today") is read as a domain.
 *
 * Text-direction controls (DIRECTION_CONTROLS) can make reversed characters display as an address, a link or a handle
 * while the text holds something else. The rules read the text without them; comments and display names that hold one
 * are refused (participation.ts), and a card's published texts are written without them (publication.ts).
 */

/**
 * The text-direction controls: the embeddings and overrides (U+202A to U+202E), the isolates (U+2066 to U+2069), the
 * left-to-right and right-to-left marks (U+200E, U+200F) and the Arabic letter mark (U+061C). The zero-width joiner and
 * non-joiner (U+200D, U+200C) are not among them: emoji sequences and words in several scripts need them.
 */
export const DIRECTION_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/gu;

/** Whether a text holds a text-direction control. */
export function hasDirectionControl(text: string): boolean {
  DIRECTION_CONTROLS.lastIndex = 0;
  const found = DIRECTION_CONTROLS.test(text);
  DIRECTION_CONTROLS.lastIndex = 0;
  return found;
}

/** A text without its text-direction controls. */
export function withoutDirectionControls(text: string): string {
  return text.replace(DIRECTION_CONTROLS, "");
}

export const CONTACT_DETAIL_KINDS = ["email_address", "phone_number", "messaging_handle"] as const;
export type ContactDetailKind = typeof CONTACT_DETAIL_KINDS[number];
export const LINK_KINDS = ["url", "bare_domain"] as const;
export type LinkKind = typeof LINK_KINDS[number];

/** The kinds of contact details a text holds, each once, in CONTACT_DETAIL_KINDS order; never the matched text. */
export function contactDetailKinds(text: string): ContactDetailKind[] {
  const normalized = checkText(text);
  const withoutEmails = normalized.replace(EMAIL, (email) => " ".repeat(email.length));
  const found = new Set<ContactDetailKind>();
  if (withoutEmails !== normalized) found.add("email_address");
  if (hasPhoneNumber(withoutEmails)) found.add("phone_number");
  if (hasHandle(withoutEmails) || MESSAGING_LINK.test(withoutEmails)) found.add("messaging_handle");
  return CONTACT_DETAIL_KINDS.filter((kind) => found.has(kind));
}

/** The kinds of links a text holds, each once, in LINK_KINDS order; never the matched text. */
export function linkKinds(text: string): LinkKind[] {
  const normalized = checkText(text);
  const found = new Set<LinkKind>();
  if (URL_WITH_SCHEME.test(normalized) || WWW_URL.test(normalized)) found.add("url");
  // An email address's domain is not a link of its own.
  if (hasBareDomain(normalized.replace(EMAIL, (email) => " ".repeat(email.length)))) found.add("bare_domain");
  return LINK_KINDS.filter((kind) => found.has(kind));
}

/** The text as every rule reads it: compatibility form, no format characters, ASCII digits and hyphens. */
function checkText(text: string): string {
  return withAsciiDigits(text.normalize("NFKC").replace(/\p{Cf}/gu, ""))
    .replace(/[‐-―−﹘﹣－]/gu, "-");
}

// Email addresses ---------------------------------------------------------------------------------------------------

// A domain label: letters and digits of any script, with hyphens inside.
const LABEL = "[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?";
const EMAIL = new RegExp(
  `(?<![\\p{L}\\p{N}._%+-])[\\p{L}\\p{N}._%+-]{1,64}@(?:${LABEL}\\.)*${LABEL}` +
    "(?:\\.(?:\\p{L}{2,63}|xn--[a-z0-9-]{1,59})|\\u3002(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59}))(?![\\p{L}\\p{N}-])",
  "giu",
);

// Messaging handles -----------------------------------------------------------------------------------------------

// @ and a name of letters, digits, underscores and inner dots, starting with a letter or an underscore. An ASCII
// letter, digit or address character right before it makes it part of something else (user@localhost); a letter of
// a script written without spaces (联系@张三) does not.
const HANDLE = /(?<![A-Za-z0-9._%+-])@([\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}\p{N}_]+)*)/gu;
// A messaging service's link to an account, a chat or an invitation.
const MESSAGING_LINK = new RegExp(
  "(?<![\\p{L}\\p{N}.-])(?:https?://)?(?:www\\.)?" +
    "(?:t\\.me|telegram\\.me|telegram\\.dog|wa\\.me|api\\.whatsapp\\.com|chat\\.whatsapp\\.com|m\\.me|signal\\.me|" +
    "signal\\.group|discord\\.gg|line\\.me)/[\\p{L}\\p{N}_+-]",
  "iu",
);

/** A handle's name is 2 to 64 characters long, as the messaging services' are. */
function hasHandle(text: string): boolean {
  for (const match of text.matchAll(HANDLE)) {
    const length = [...match[1]!].length;
    if (length >= 2 && length <= 64) return true;
  }
  return false;
}

// Phone numbers ---------------------------------------------------------------------------------------------------

// A run of digits with phone-style separators, an optional + before it; each is read whole, then classified.
const NUMBER_RUN = /\+?[(\d][\d() .-]*/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const DIGIT = /\d/u;
// The letters of scripts written without spaces between words, where a number standing right against a word is still a
// number of its own (电话138 1234 5678).
const UNSPACED_SCRIPT_LETTER =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;

function hasPhoneNumber(text: string): boolean {
  for (const match of text.matchAll(NUMBER_RUN)) {
    let run = match[0];
    let start = match.index;
    // A run ends with a digit or a closing parenthesis; one it does not open is not its own, nor an opening one
    // it does not close.
    run = run.replace(/[ .(-]+$/u, "");
    if (count(run, ")") > count(run, "(") && run.endsWith(")")) run = run.slice(0, -1).replace(/[ .(-]+$/u, "");
    if (count(run, "(") > count(run, ")") && run.startsWith("(")) {
      run = run.slice(1);
      start += 1;
    }
    if (!DIGIT.test(run)) continue;
    if (continuesAToken(text, start) || continuedAfter(text, start + run.length)) continue;
    for (const candidate of splitAtLongSeparators(run)) {
      if (isPhoneNumber(candidate)) return true;
    }
  }
  return false;
}

/**
 * Whether the run continues a word, a decimal or an identifier before it: COVID-19, 3.141 592, or a dotted name in a
 * path or a DOI such as 10.1016/j.jad.2019.01.123. A word's own dot (Tel.555-123-4567, Tél.06.12.34.56.78) does not,
 * nor a word of a script written without spaces.
 */
function continuesAToken(text: string, start: number): boolean {
  const before = text.charAt(start - 1);
  if (before === "" || UNSPACED_SCRIPT_LETTER.test(before)) return false;
  if (LETTER_OR_DIGIT.test(before) || before === "_" || before === "@" || before === "#") return true;
  const earlier = text.charAt(start - 2);
  if ((before === "." || before === ",") && DIGIT.test(earlier)) return true;
  if (before === "." && LETTER_OR_DIGIT.test(earlier)) {
    // The word the dot ends, back to the last space: a path, an address or a dotted name, or a plain word.
    const word = text.slice(0, start - 1).split(/\s/u).at(-1) ?? "";
    if (/[/@.\d]/u.test(word)) return true;
  }
  if ((before === "-" || before === "/" || before === "+") && LETTER_OR_DIGIT.test(earlier)) return true;
  return false;
}

/** Whether a word, a decimal, a fraction, a time or a percentage continues the run (1 234,5; 12/03; 10:30; 5%). */
function continuedAfter(text: string, end: number): boolean {
  const after = text.charAt(end);
  if (after === "" || UNSPACED_SCRIPT_LETTER.test(after)) return false;
  if (LETTER_OR_DIGIT.test(after) || after === "%" || after === "_") return true;
  const next = text.charAt(end + 1);
  return (after === "." || after === "," || after === "/" || after === ":") && DIGIT.test(next);
}

/** A run cut where a separator is longer than a phone number's (more than three characters, or two dashes or dots). */
function splitAtLongSeparators(run: string): string[] {
  return run.split(/[ ().-]{4,}|[.-][ ()]*[.-]/u).map((part) => part.replace(/^[ .)-]+|[ .(-]+$/gu, ""))
    .filter((part) => DIGIT.test(part));
}

function isPhoneNumber(run: string): boolean {
  const plus = run.startsWith("+");
  const body = plus ? run.slice(1).trimStart() : run;
  const groups = body.match(/\d+/gu) ?? [];
  const digits = groups.join("").length;
  if (digits < 7 || digits > 15) return false;
  // Parentheses only around a group of digits alone, as in (555), (030) or (0).
  const withoutDigitGroups = body.replace(/\(\d{1,5}\)/gu, " ");
  if (/[()]/u.test(withoutDigitGroups)) return false;
  const parenthesized = withoutDigitGroups !== body;
  // The other separators: spaces and hyphens, or dots alone; each a space, a hyphen with spaces around it, or a dot.
  const separators = body.replace(/[()]/gu, " ").split(/\d+/u).slice(1, -1).map((separator) => separator.trim() === ""
    ? (separator === "" ? "" : " ")
    : separator.replace(/ /gu, ""));
  if (separators.some((separator) => !["", " ", "-", "."].includes(separator))) return false;
  const kinds = new Set(separators.filter((separator) => separator !== ""));
  if (kinds.has(".") && kinds.size > 1) return false;
  if (plus) return true;
  if (parenthesized) return groups.length >= 2;
  if (groups.length >= 3) {
    return groups.every((group) => group.length <= 5) &&
      groups.filter((group) => group.length >= 2).length >= 2 &&
      !isDate(groups, kinds) && !isGroupedCount(groups, kinds, separators) && !areYears(groups) &&
      !isIsbn(groups, kinds);
  }
  if (groups.length === 2) {
    // A trunk prefix and a subscriber number, as many countries write a landline: 030 1234567, 0171-1234567.
    return !kinds.has(".") && /^0\d{1,4}$/u.test(groups[0]!) && groups[1]!.length >= 4 && groups[1]!.length <= 10;
  }
  return false;
}

/** A day, month and year in either order, as dates are written in many languages: 12.03.2024, 2024-03-12. */
function isDate(groups: readonly string[], kinds: ReadonlySet<string>): boolean {
  if (groups.length !== 3 || kinds.size !== 1) return false;
  const [first, second, third] = groups.map(Number) as [number, number, number];
  const year = (value: string) => value.length === 4 && Number(value) >= 1800 && Number(value) <= 2199;
  const small = (value: string) => value.length <= 2;
  if (small(groups[0]!) && small(groups[1]!) && year(groups[2]!)) {
    return first >= 1 && first <= 31 && second >= 1 && second <= 31 && (first <= 12 || second <= 12);
  }
  if (year(groups[0]!) && small(groups[1]!) && small(groups[2]!)) {
    return second >= 1 && second <= 12 && third >= 1 && third <= 31;
  }
  return false;
}

/** A count grouped in threes after one or two digits, with one separator throughout: 1 234 567, 12.345.678. */
function isGroupedCount(groups: readonly string[], kinds: ReadonlySet<string>, separators: readonly string[]): boolean {
  return kinds.size === 1 && (kinds.has(" ") || kinds.has(".")) && separators.every((separator) => separator !== "") &&
    groups[0]!.length <= 2 && groups.slice(1).every((group) => group.length === 3);
}

/** Years one after another: 2019 2020 2021, 1998-2004-2010. */
function areYears(groups: readonly string[]): boolean {
  return groups.every((group) => group.length === 4 && Number(group) >= 1800 && Number(group) <= 2199);
}

/** An ISBN with its hyphens: 978-0-306-40615-7 or 0-306-40615-2. */
function isIsbn(groups: readonly string[], kinds: ReadonlySet<string>): boolean {
  if (kinds.size !== 1 || !kinds.has("-")) return false;
  const digits = groups.join("").length;
  return (groups.length === 5 && digits === 13 && /^97[89]$/u.test(groups[0]!)) || (groups.length === 4 && digits === 10);
}

function count(text: string, character: string): number {
  return text.split(character).length - 1;
}

// Links -----------------------------------------------------------------------------------------------------------

const URL_WITH_SCHEME = /(?<![\p{L}\p{N}])(?:https?|ftp):\/\/[^\s/?#]+/iu;
const WWW_URL = /(?<![\p{L}\p{N}.-])www\.[\p{L}\p{N}-]+\.[\p{L}\p{N}-]/iu;
const BARE_DOMAIN = new RegExp(
  "(?<![\\p{L}\\p{N}@./-])((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+)" +
    "([A-Za-z]{2,63}|[Xx][Nn]--[A-Za-z0-9-]{1,59})(?![\\p{L}\\p{N}-])",
  "gu",
);

function hasBareDomain(text: string): boolean {
  for (const match of text.matchAll(BARE_DOMAIN)) {
    const labels = match[1]!.slice(0, -1).split(".");
    const tld = match[2]!.toLowerCase();
    const last = labels.at(-1)!;
    // Any top-level domain of the root zone, in any case, or any in punycode.
    if (!IANA_TOP_LEVEL_DOMAINS.has(tld) && !tld.startsWith("xn--")) continue;
    // A two-letter one after a number alone (1.In) or, at the first level, after a single character (M.Sc, e.g.) is an
    // abbreviation or a numbered item; under a second level such as co.uk it is a domain.
    if (tld.length === 2 && (/^\d+$/u.test(last) || (labels.length === 1 && last.length === 1))) continue;
    return true;
  }
  return false;
}
