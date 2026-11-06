import { z } from "zod";

import { rule, type CheckRule } from "./check-rules.js";
import { verifyResearchReceipt } from "./research-receipts.js";

/**
 * How each key study was read, said beside it (the owner, 5 November 2026: "make sure askrigor is enforcing that the AI
 * tells people what it actually read, like 'In this study (abstract read/full text read/full text and images
 * analyzed)' that will make it much easier to understand the evidentiary basis"). HRP StudyReadDepthDisclosure already
 * asks the answer to say beside each supporting study what was actually read, and the final check already holds each
 * key source's declared read_depth to its receipts. Nothing made the answer say it.
 *
 * So finalize_research takes source_reading, a later input (owner answer 189a): for each key source, its id as
 * key_sources gives it, the reading the answer gives it, from the fixed set below, and the answer's own words, copied
 * from answer_draft, saying so. Under the existing read_depth blocking rule, a key source the draft cites (its link or
 * its id is in the draft) needs an entry whose quote the draft shows, compared as the gate's other declared quotes are,
 * and whose reading claims no more than the check verifies (the review of 5 Nov 2026: the words were held to nothing).
 * Whether the words say that reading is the model's declaration, in the answer's language: no word list can judge that
 * in every language. The result names each key source's reading up front, and the panel lists, under a passing check,
 * the readings AskRigor's receipts show, with any other apart, so the reader sees them even when the answer is reworded.
 */

/** How a key source was read, as its verified receipts and accepted read_depth show it. */
export const ANSWER_READINGS = [
  "full_text_audited", "search_copy_audited", "full_text_read", "search_copy_read", "partial_text", "abstract_only",
  "conference_abstract", "secondary_only", "metadata_only", "found_in_search", "inaccessible", "route_error",
  "atlas_checked", "other_tool"
] as const;
export type AnswerReading = typeof ANSWER_READINGS[number];
// A lead's readings by name, which the result's receipts field may give (LEAD_READINGS, below, words them).
const LEAD_READING_NAMES = [
  "lead_abstract_readable", "lead_part_readable", "lead_paywalled", "lead_fetch_blocked", "lead_no_copy_found",
  "lead_identity_unverified", "lead_no_open_copy"
] as const;

// The words the answer gives in its own language, as rules so a stopped check's report keeps them. None holds a
// semicolon, which separates the sources in the result's list and the panel's line.
// "Full text and figures analyzed", the owner's third example, waits for AskRigor's figure reading (the next build's
// item 2, a page returned as an image), which isn't built yet: no receipt shows a figure was read, so no label says so.
// An audit or a full reading of a copy the AI found, which AskRigor didn't fetch itself, says so, as the Atlas's reading
// of a card's sources does (owner answer 252a, ATLAS_SOURCE_READINGS); a copy from the owner's library is one AskRigor
// fetched, so it reads as any full text. A source a search listed, and nothing more, was found, not read (the review of
// 5 Nov 2026).
const ANSWER_READING_RULES: Readonly<Record<AnswerReading, CheckRule>> = {
  full_text_audited: rule`full text read, methods audited by AskRigor`,
  search_copy_audited: rule`full text read from a copy the AI found, methods audited by AskRigor`,
  full_text_read: rule`full text read`,
  search_copy_read: rule`full text read from a copy the AI found`,
  partial_text: rule`part of the text read`,
  abstract_only: rule`abstract only`,
  conference_abstract: rule`abstract only`,
  secondary_only: rule`only another source's description of it read`,
  metadata_only: rule`only its title and record read`,
  found_in_search: rule`found in a search, not read`,
  inaccessible: rule`not read, no access to it`,
  route_error: rule`not read, it could not be fetched`,
  atlas_checked: rule`from a checked Atlas finding`,
  other_tool: rule`read through another tool, not checked by AskRigor`
};
export const ANSWER_READING_LABELS: Readonly<Record<AnswerReading, string>> = Object.freeze(Object.fromEntries(
  ANSWER_READINGS.map((reading) => [reading, ANSWER_READING_RULES[reading].text])) as Record<AnswerReading, string>);

export const SOURCE_READING_LIMITS = { entries: 60, sourceCharacters: 300, quoteCharacters: 1_000 } as const;

export const sourceReadingQuoteSchema = z.object({
  source: z.string().trim().min(1).max(SOURCE_READING_LIMITS.sourceCharacters)
    .describe("The key source's id, as key_sources gives it."),
  reading: z.enum(ANSWER_READINGS)
    .describe("The reading the answer gives that source, as finalize_research's result names it."),
  quote: z.string().trim().min(1).max(SOURCE_READING_LIMITS.quoteCharacters)
    .describe("The answer's own words saying how that source was read, beside or in the sentence citing it, in the " +
      "answer's language, copied from answer_draft.")
}).strict();
export type SourceReadingQuote = z.output<typeof sourceReadingQuoteSchema>;
export const sourceReadingInputSchema = z.array(sourceReadingQuoteSchema).max(SOURCE_READING_LIMITS.entries);

/**
 * Each key source's reading in the result, as the panel lists it: its id, how a limit names it, how it was read, and
 * whether AskRigor's receipts show that reading. A reading they don't show is the AI's own account (part of the text, a
 * reading through another tool, or an abstract no record shows), which the panel lists apart, with the reading the
 * receipts do show, when they show one.
 */
export const sourceReadingCheckSchema = z.object({
  source: z.string(),
  name: z.string(),
  reading: z.enum(ANSWER_READINGS),
  shown: z.boolean(),
  receipts: z.enum([...ANSWER_READINGS, ...LEAD_READING_NAMES]).optional()
}).strict();
export type SourceReadingCheck = z.output<typeof sourceReadingCheckSchema>;

/**
 * How a key source was read, from what the check verified: a checked Atlas finding the call uses, an audit (of a copy
 * the AI found, when every audit was: searchCopy) or a completed reading its receipts sign, and otherwise the lower
 * read_depth the call declares, which no receipt can contradict. A declared full-text reading or Atlas finding with
 * nothing of the kind behind it is refused under read_depth already, so it has no reading until the declaration
 * matches. A lead read through another tool is set apart by the caller, where the check says to cite it so.
 */
export function verifiedAnswerReading(
  declared: string | undefined,
  shown: { audited: boolean; searchCopy?: boolean; read: boolean; readSearchCopy?: boolean; atlasChecked: boolean }
): AnswerReading | undefined {
  if (declared === "atlas_checked" && shown.atlasChecked) return "atlas_checked";
  if (shown.audited) return shown.searchCopy === true ? "search_copy_audited" : "full_text_audited";
  if (shown.read) return shown.readSearchCopy === true ? "search_copy_read" : "full_text_read";
  if (declared === undefined || declared === "atlas_checked" || declared === "full_text_audited" ||
    declared === "full_text_read") return undefined;
  return (ANSWER_READINGS as readonly string[]).includes(declared) ? declared as AnswerReading : undefined;
}

/** A reading's words, as a rule nested in a step. */
export function answerReadingRule(reading: AnswerReading): CheckRule {
  return ANSWER_READING_RULES[reading];
}

/**
 * What a full-text lead's receipt shows, by the state it signs, in the words the check's lead note gives it (the recheck
 * of 5 Nov 2026: a lead whose abstract was readable showed "not read, no access to it"). Receipts show these; an answer
 * gives the readings above, so each maps to the one it is (declarableReading). A copy whose abstract alone, or part of
 * whose text, was readable is one AskRigor read that far.
 */
export const LEAD_READINGS = LEAD_READING_NAMES;
export type LeadReading = typeof LEAD_READINGS[number];
const LEAD_READING_WORDS: Readonly<Record<LeadReading, string>> = {
  lead_abstract_readable: "only its abstract was readable",
  lead_part_readable: "only part of its text was readable",
  lead_paywalled: "not read, its full text needs a login or a subscription",
  lead_fetch_blocked: "not read, a possible public copy was found but couldn't be fetched to check it",
  lead_no_copy_found: "not read, no public full text was found after an exact search",
  lead_identity_unverified: "not read, no copy found could be verified as the same paper",
  lead_no_open_copy: "not read, no open full text was available"
};
const LEAD_STATE_READINGS: Readonly<Record<string, LeadReading>> = {
  ABSTRACT_ONLY: "lead_abstract_readable", PARTIAL_TEXT_READABLE: "lead_part_readable",
  PAYWALL_OR_LOGIN_REQUIRED: "lead_paywalled", CANDIDATE_FOUND_FETCH_BLOCKED: "lead_fetch_blocked",
  NO_COPY_FOUND_AFTER_EXPANDED_SEARCH: "lead_no_copy_found", IDENTITY_MISMATCH: "lead_identity_unverified"
};
/** The readings receipts can show: an answer's, and a lead's. */
export const SHOWN_READINGS = [...ANSWER_READINGS, ...LEAD_READINGS] as const;
export type ShownReading = typeof SHOWN_READINGS[number];
export const SHOWN_READING_LABELS: Readonly<Record<ShownReading, string>> = Object.freeze({
  ...ANSWER_READING_LABELS, ...LEAD_READING_WORDS
});

/** A verified research receipt, as the reading checks read it. */
interface ReadingReceipt { kind: string; claims: Readonly<Record<string, unknown>> }

// A copy the AI found with its own search, which AskRigor didn't fetch itself: the receipt signs the client's index.
const aiCopy = ({ claims }: ReadingReceipt): boolean => claims.retrieval_provider === "client_search_index";

/**
 * The readings a source's verified receipts show, exactly: an audit or a full reading, of a copy AskRigor fetched or of
 * one the AI found; a PubMed record, with its abstract unless the receipt signs that it had none; a DOI's record; a
 * search's listing; a full-text lead, by the state it signs; a full-text service failure; and a checked Atlas finding
 * the call uses.
 */
export function receiptReadings(receipts: readonly ReadingReceipt[], atlasChecked: boolean): Set<ShownReading> {
  const shown = new Set<ShownReading>(atlasChecked ? ["atlas_checked"] : []);
  for (const receipt of receipts) {
    const reading: ShownReading | undefined =
      receipt.kind === "study_audit" || receipt.kind === "review_audit"
        ? aiCopy(receipt) ? "search_copy_audited" : "full_text_audited"
        : receipt.kind === "full_text_read" ? aiCopy(receipt) ? "search_copy_read" : "full_text_read"
        : receipt.kind === "pubmed_record" ? receipt.claims.abs === "0" ? "metadata_only" : "abstract_only"
        : receipt.kind === "doi_resolution" ? "metadata_only"
        : receipt.kind === "literature_search" ? "found_in_search"
        : receipt.kind === "full_text_lead"
          ? LEAD_STATE_READINGS[String(receipt.claims.state)] ?? "lead_no_open_copy"
        : receipt.kind === "full_text_route_failure" ? "route_error"
        : undefined;
    if (reading !== undefined) shown.add(reading);
  }
  return shown;
}

// How much of a source each reading read: its full text audited, its full text, part of it, its abstract, its record, a
// search's listing of it, and nothing of it. A checked Atlas finding stands with an audit, and another tool's reading
// with a full text, which is what the AI's word claims of it; AskRigor read neither here.
const READING_DEPTH: Readonly<Record<ShownReading, number>> = {
  full_text_audited: 6, search_copy_audited: 6, atlas_checked: 6,
  full_text_read: 5, search_copy_read: 5, other_tool: 5,
  partial_text: 4, lead_part_readable: 4, abstract_only: 3, conference_abstract: 3, lead_abstract_readable: 3,
  metadata_only: 2, found_in_search: 1,
  secondary_only: 0, inaccessible: 0, route_error: 0, lead_paywalled: 0, lead_fetch_blocked: 0, lead_no_copy_found: 0,
  lead_identity_unverified: 0, lead_no_open_copy: 0
};
// The readings a deeper one of the same text shows too: part of it, an abstract, a record and a listing.
const ENTAILED_READINGS: ReadonlySet<ShownReading> = new Set(["partial_text", "abstract_only", "conference_abstract",
  "metadata_only", "found_in_search"]);
// The not-read readings a lead or a failure shows: no access to it, or it could not be fetched.
const NOT_READ_SHOWN_BY: Readonly<Partial<Record<ShownReading, ReadonlySet<ShownReading>>>> = {
  inaccessible: new Set(["lead_paywalled", "lead_no_copy_found", "lead_identity_unverified", "lead_no_open_copy"]),
  route_error: new Set(["lead_fetch_blocked"])
};
// The readings receipts can show, deepest first, for naming what they show.
const SHOWN_ORDER: readonly ShownReading[] = ["atlas_checked", "full_text_audited", "search_copy_audited",
  "full_text_read", "search_copy_read", "lead_part_readable", "abstract_only", "lead_abstract_readable", "metadata_only",
  "found_in_search", "lead_paywalled", "lead_fetch_blocked", "lead_no_copy_found", "lead_identity_unverified",
  "lead_no_open_copy", "route_error"];

/**
 * Whether a source's receipts show a reading: they show it, or show a deeper reading of the text it reads (a full text
 * read shows part of it, its abstract, a record and a listing too; a lead's readable abstract shows an abstract read),
 * or, for a reading of nothing, a lead or a failure that says why. Another source's description and another tool's
 * reading are the AI's own account: no receipt shows them.
 */
export function readingShown(reading: ShownReading, shown: ReadonlySet<ShownReading>): boolean {
  if (shown.has(reading)) return true;
  if ([...NOT_READ_SHOWN_BY[reading] ?? []].some((by) => shown.has(by))) return true;
  return ENTAILED_READINGS.has(reading) && [...shown].some((other) => other !== "atlas_checked" &&
    READING_DEPTH[other] >= READING_DEPTH[reading]);
}

/** The deepest reading receipts show, for saying what they do show; undefined when they show none. */
export function deepestShown(shown: ReadonlySet<ShownReading>): ShownReading | undefined {
  return SHOWN_ORDER.find((reading) => shown.has(reading));
}

/** The reading an answer gives for what a receipt shows: a lead's state is the reading it is. */
export function declarableReading(reading: ShownReading): AnswerReading {
  switch (reading) {
    case "lead_abstract_readable": return "abstract_only";
    case "lead_part_readable": return "partial_text";
    case "lead_fetch_blocked": return "route_error";
    case "lead_paywalled": case "lead_no_copy_found": case "lead_identity_unverified": case "lead_no_open_copy":
      return "inaccessible";
    default: return reading;
  }
}

/**
 * Whether a reading an answer gives a source claims more than the check verifies, less, or the same, exactly: by how
 * much of the source each read, and, for a full text, by whose copy, since a copy the AI found reads as less than one
 * AskRigor fetched. Another tool's reading is the AI's own account, which AskRigor can't check: it never claims more,
 * and claims less than a full text AskRigor's receipts show read. Against a checked Atlas finding, or another tool's
 * reading, a full text read here claims more. Readings that read as much of the source differ only in their words.
 */
export function compareReadings(declared: AnswerReading, verified: AnswerReading): "same" | "more" | "less" {
  if (ANSWER_READING_LABELS[declared] === ANSWER_READING_LABELS[verified]) return "same";
  if (declared === "other_tool") return verified !== "atlas_checked" && READING_DEPTH[verified] >= 5 ? "less" : "same";
  if (verified === "atlas_checked" || verified === "other_tool") {
    return READING_DEPTH[declared] >= 5 ? "more" : verified === "atlas_checked" ? "less" : "same";
  }
  if (declared === "atlas_checked") return "more";
  // A full text AskRigor fetched, said of a copy the AI found, claims more however deep the AI's copy was read.
  if (OWN_FULL_TEXT.has(declared) && AI_FULL_TEXT.has(verified)) return "more";
  const deeper = READING_DEPTH[declared] - READING_DEPTH[verified];
  if (deeper !== 0) return deeper > 0 ? "more" : "less";
  return AI_FULL_TEXT.has(declared) && OWN_FULL_TEXT.has(verified) ? "less" : "same";
}
const OWN_FULL_TEXT: ReadonlySet<AnswerReading> = new Set(["full_text_audited", "full_text_read"]);
const AI_FULL_TEXT: ReadonlySet<AnswerReading> = new Set(["search_copy_audited", "search_copy_read"]);

/**
 * How the reading a source_reading entry gives a source compares with the reading the check verifies, or with what its
 * receipts show when the check verifies none (the review of 5 Nov 2026 and its recheck): more holds the answer back
 * under read_depth, less is a note. A reading the source's receipts show claims no more than they show, and less only
 * when the check verifies a deeper one. Another tool's reading is the AI's own account only for a source key_sources
 * declares read through another tool (other_route read); for any other source it claims more than the check verifies.
 */
export function judgeSourceReading(
  declared: AnswerReading,
  verified: AnswerReading,
  shown: ReadonlySet<ShownReading>,
  { otherRoute = false }: { otherRoute?: boolean } = {}
): "same" | "more" | "less" {
  if (declared === "other_tool" && !otherRoute) return verified === "other_tool" ? "same" : "more";
  if (readingShown(declared, shown)) return READING_DEPTH[declared] < READING_DEPTH[verified] ? "less" : "same";
  return compareReadings(declared, verified);
}

/**
 * The readings a key_sources read_depth gives with no receipt behind it, which a lower declaration no receipt can
 * contradict (verifiedAnswerReading): a step that holds back such a reading as claiming more also offers declaring it.
 */
export const DECLARABLE_WITHOUT_RECEIPT: ReadonlySet<AnswerReading> = new Set(["partial_text", "abstract_only",
  "conference_abstract", "secondary_only", "metadata_only"]);

/**
 * When each reading tool's sentence applies: a PubMed record, a full text read to its end, a method audit. Their
 * results add it (readingResultNote), so the answer says how the study was read before its first final check.
 */
export const READING_RESULT_WHEN = {
  record: "If the answer cites this study from this record alone",
  fullText: "With this study's full text read to its end",
  audit: "With this study's methods audited"
} as const;

/** A reading tool's sentence: the reading's words, said beside the study and given in source_reading. Runtime text. */
export function readingResultNote(when: string, reading: AnswerReading): string {
  return `${when}, say "${ANSWER_READING_LABELS[reading]}" beside it in the answer, in the answer's language, and give ` +
    `those words in finalize_research's later_inputs.source_reading, with reading ${reading}.`;
}

/**
 * The sentence a full-text or method-audit result adds, from the receipt it just signed: a full text read to its end, or
 * an audit, of a copy the AI found or not. Reading the receipt back gives its kind and provenance exactly; another kind,
 * or no receipt, adds nothing.
 */
export function receiptReadingNote(receipt: string | undefined, secret: string | undefined): string {
  const verified = receipt === undefined || secret === undefined ? undefined : verifyResearchReceipt(receipt, { secret });
  if (verified?.ok !== true) return "";
  if (verified.kind === "full_text_read") {
    return readingResultNote(READING_RESULT_WHEN.fullText, aiCopy(verified) ? "search_copy_read" : "full_text_read");
  }
  if (verified.kind !== "study_audit" && verified.kind !== "review_audit") return "";
  return readingResultNote(READING_RESULT_WHEN.audit,
    aiCopy(verified) ? "search_copy_audited" : "full_text_audited");
}

/**
 * The result's line naming each key source's reading up front, so the answer can say it before a check blocks, with
 * the reading's name for source_reading, and, for a reading AskRigor's receipts don't show, what they do show.
 */
export function sourceReadingGuidance(readings: readonly SourceReadingCheck[]): string {
  return "Say beside each study how it was read, in the answer's language, and give each in " +
    "later_inputs.source_reading as {source, reading, quote}: source its id as key_sources gives it, reading as named " +
    "here, and quote those words, copied from answer_draft: " +
    readings.map(({ name, reading, shown, receipts }) => `${name}, "${ANSWER_READING_LABELS[reading]}" (${reading})` +
      (shown || reading === "other_tool" ? ""
        : receipts === undefined ? ", by your account alone: no receipt here shows it"
        : `, by your account alone: AskRigor's receipts show "${SHOWN_READING_LABELS[receipts]}"`)).join("; ") + ".";
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
