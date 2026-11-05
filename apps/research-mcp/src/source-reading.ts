import { z } from "zod";

import { rule, type CheckRule } from "./check-rules.js";

/**
 * How each key study was read, said beside it (the owner, 5 November 2026: "make sure askrigor is enforcing that the AI
 * tells people what it actually read, like 'In this study (abstract read/full text read/full text and images
 * analyzed)' that will make it much easier to understand the evidentiary basis"). HRP StudyReadDepthDisclosure already
 * asks the answer to say beside each supporting study what was actually read, and the final check already holds each
 * key source's declared read_depth to its receipts. Nothing made the answer say it.
 *
 * So finalize_research takes source_reading, a later input (owner answer 189a): for each key source, its id as
 * key_sources gives it and the answer's own words, copied from answer_draft, saying how it was read. Under the existing
 * read_depth blocking rule, a key source the draft cites (its link or its id is in the draft) needs an entry whose quote
 * the draft shows, compared as the gate's other declared quotes are. Whether the words say how it was read is the
 * model's declaration, in the answer's language: no word list can judge that in every language. The result names each
 * key source's reading up front, and the panel lists it under a passing check, so the reader sees it even when the
 * answer is reworded.
 */

/** How a key source was read, as its verified receipts and accepted read_depth show it. */
export const SOURCE_READINGS = [
  "full_text_audited", "full_text_read", "partial_text", "abstract_only", "conference_abstract", "secondary_only",
  "metadata_only", "inaccessible", "route_error", "atlas_checked", "other_tool"
] as const;
export type SourceReading = typeof SOURCE_READINGS[number];

// The words the answer gives in its own language, as rules so a stopped check's report keeps them. None holds a
// semicolon, which separates the sources in the result's list and the panel's line.
// "Full text and figures analyzed", the owner's third example, waits for AskRigor's figure reading (the next build's
// item 2, a page returned as an image), which isn't built yet: no receipt shows a figure was read, so no label says so.
const SOURCE_READING_RULES: Readonly<Record<SourceReading, CheckRule>> = {
  full_text_audited: rule`full text read, methods audited by AskRigor`,
  full_text_read: rule`full text read`,
  partial_text: rule`part of the text read`,
  abstract_only: rule`abstract only`,
  conference_abstract: rule`abstract only`,
  secondary_only: rule`only another source's description of it read`,
  metadata_only: rule`only its title and record read`,
  inaccessible: rule`not read, no access to it`,
  route_error: rule`not read, it could not be fetched`,
  atlas_checked: rule`from a checked Atlas finding`,
  other_tool: rule`read through another tool, not checked by AskRigor`
};
export const SOURCE_READING_LABELS: Readonly<Record<SourceReading, string>> = Object.freeze(Object.fromEntries(
  SOURCE_READINGS.map((reading) => [reading, SOURCE_READING_RULES[reading].text])) as Record<SourceReading, string>);

export const SOURCE_READING_LIMITS = { entries: 60, sourceCharacters: 300, quoteCharacters: 1_000 } as const;

export const sourceReadingEntrySchema = z.object({
  source: z.string().trim().min(1).max(SOURCE_READING_LIMITS.sourceCharacters)
    .describe("The key source's id, as key_sources gives it."),
  quote: z.string().trim().min(1).max(SOURCE_READING_LIMITS.quoteCharacters)
    .describe("The answer's own words saying how that source was read, beside or in the sentence citing it, in the " +
      "answer's language, copied from answer_draft.")
}).strict();
export type SourceReadingEntry = z.output<typeof sourceReadingEntrySchema>;
export const sourceReadingSchema = z.array(sourceReadingEntrySchema).max(SOURCE_READING_LIMITS.entries);

/** Each key source's reading in the result, as the panel lists it: its id, how a limit names it, and how it was read. */
export const sourceReadingCheckSchema = z.object({
  source: z.string(),
  name: z.string(),
  reading: z.enum(SOURCE_READINGS)
}).strict();
export type SourceReadingCheck = z.output<typeof sourceReadingCheckSchema>;

/**
 * How a key source was read, from what the check verified: a checked Atlas finding the call uses, an audit or a
 * completed reading its receipts sign, and otherwise the lower read_depth the call declares, which no receipt can
 * contradict. A declared full-text reading or Atlas finding with nothing of the kind behind it is refused under
 * read_depth already, so it has no reading until the declaration matches. A lead read through another tool is set apart
 * by the caller, where the check says to cite it so.
 */
export function verifiedSourceReading(
  declared: string | undefined,
  shown: { audited: boolean; read: boolean; atlasChecked: boolean }
): SourceReading | undefined {
  if (declared === "atlas_checked" && shown.atlasChecked) return "atlas_checked";
  if (shown.audited) return "full_text_audited";
  if (shown.read) return "full_text_read";
  if (declared === undefined || declared === "atlas_checked" || declared === "full_text_audited" ||
    declared === "full_text_read") return undefined;
  return (SOURCE_READINGS as readonly string[]).includes(declared) ? declared as SourceReading : undefined;
}

/** A reading's words, as a rule nested in a step. */
export function sourceReadingRule(reading: SourceReading): CheckRule {
  return SOURCE_READING_RULES[reading];
}

/** The result's line naming each key source's reading up front, so the answer can say it before a check blocks. */
export function sourceReadingGuidance(readings: readonly SourceReadingCheck[]): string {
  return "Say beside each study how it was read, in the answer's language, and copy those words into " +
    "later_inputs.source_reading as {source, quote}, with source the study's id as key_sources gives it: " +
    `${readings.map(({ name, reading }) => `${name}, ${SOURCE_READING_LABELS[reading]}`).join("; ")}.`;
}

// What carries an identifier on: a letter or digit, or the punctuation a DOI holds followed by one. So "10.1000/abc."
// and "(10.1000/abc)" name 10.1000/abc, and so does "10.1000/abc。" before more text, while "10.1000/abc.2" and
// "10.1000/abcd" name other papers. Exact, the same in any language.
const IDENTIFIER_GOES_ON = /^(?:[\p{L}\p{N}]|[-._;()/:]+[A-Za-z0-9])/u;

/**
 * Whether text names a key source by its identifier, normalized as the gate normalizes it: a DOI in any case, a PMID
 * as a whole number, a PMCID as PMC with its whole number. A web address names its page only as a link, which the
 * gate's link check reads. Exact: identifiers are forms, not meanings.
 */
export function identifierShown(text: string, id: string): boolean {
  if (/^https?:\/\//iu.test(id)) return false;
  const digits = /^\d+$/u.test(id);
  const haystack = digits ? text : text.toLowerCase();
  const needle = digits ? id : id.toLowerCase();
  if (needle === "") return false;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    const before = haystack.slice(0, at);
    const after = haystack.slice(at + needle.length);
    if (digits ? /\p{Nd}$/u.test(before) || /^\p{Nd}/u.test(after)
      : /[\p{L}\p{N}]$/u.test(before) || IDENTIFIER_GOES_ON.test(after)) continue;
    return true;
  }
  return false;
}
