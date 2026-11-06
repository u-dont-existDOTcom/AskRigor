import {
  ATLAS_FORUM_SIGNAL_STUDIES,
  ATLAS_OTHER_WEBSITE,
  ATLAS_QUOTE_TEXTS,
  ATLAS_SOURCE_FIGURES,
  ATLAS_SOURCE_READINGS,
  ATLAS_THREAD_COMMUNITY,
  ATLAS_THREAD_LINK,
  type AtlasForumSignalStudies,
  type AtlasQuoteText,
  type AtlasSourceFigures,
  type AtlasSourceReading,
} from "@askrigor/evidence-repository";
import { decodedDoi } from "@askrigor/sources";
import { z } from "zod";

import { contactDetailKinds } from "../atlas/contact-check.js";
import {
  forumLinkDigest, forumPublishedLink, isSignedSubreddit, publishedThreadOf, type PublishedThread
} from "../forum-thread-links.js";
import { receiptText } from "../research-receipts.js";
import type { SourceLineLookup } from "../source-lines.js";

/**
 * The research behind each finding, and what people report (owner answer 252a, 5 November 2026; plan
 * docs/superpowers/plans/2026-11-05-atlas-research-behind.md): "we need all the research that backs the interesting
 * finding right there for people to inspect", with "the forum signal we found as well for consilience".
 *
 * A finding of the card's later shape may give, for each of up to three of its sources, the paper's own sentence behind
 * it, the paper's conclusion and the strongest thing against it (`backing`); which source each figure comes from
 * (`numbers[].source`, in card.ts); and what people report in the forum threads AskRigor's reader read (`forum_signal`).
 * Code checks only exact things here: that a line names one of the finding's key sources, that a thread was read here by
 * a verified receipt, that counts add up, that the relationship to studies is one of HRP's four
 * (FormalAbsenceCannotEraseCommunitySignal) and that its parts go together. Whether reports agree, whether a mechanism
 * is plausible and whether studies measured what the reports did (MatchedContradictionAndOutcomeAlignment) are the AI's
 * declarations. A quote is kept only when AskRigor's own lookup found it word for word in a text AskRigor fetched itself.
 */

export const BACKING_LIMITS = { lines: 3, quote: 300, against: 300, section: 80 } as const;
export const FORUM_SIGNAL_LIMITS = { threads: 20, text: 300, count: 100_000, query: 500 } as const;
/**
 * A forum page's reader counts no posts, so the people a page can hold are bounded by its text (the review of #417,
 * finding 3): one person for each 20 characters AskRigor's reader read of the page. Its reader keeps at most 60,000
 * characters of a page (forum-page.ts), so a page holds at most 3,000 people; a post with a name and a few words of
 * what happened takes more than 20.
 */
export const FORUM_PAGE_CHARACTERS_PER_PERSON = 20;

const text = (max: number) => z.string().trim().min(1).max(max);
const count = z.number().int().nonnegative().max(FORUM_SIGNAL_LIMITS.count);

export const findingBackingSchema = z.object({
  source: text(300).describe("One of this finding's sources, by the same DOI, PMID or PMCID, given in key_sources."),
  sentence: text(BACKING_LIMITS.quote)
    .describe("The paper's sentence this finding rests on, copied whole and exactly, in the paper's language."),
  conclusion: text(BACKING_LIMITS.quote).optional()
    .describe("The paper's own conclusion, copied whole and exactly, in the paper's language."),
  against: text(BACKING_LIMITS.against)
    .describe("The strongest thing against this finding from this paper, in your own words, or that nothing against " +
      "it was found.")
}).strict();
export type FindingBacking = z.output<typeof findingBackingSchema>;

/** HRP FormalAbsenceCannotEraseCommunitySignal's four formal relationships, never others (the Atlas's own list). */
export const FORUM_SIGNAL_STUDIES = ATLAS_FORUM_SIGNAL_STUDIES;
export type ForumSignalStudies = AtlasForumSignalStudies;

export const forumSignalSchema = z.object({
  threads: z.array(z.string().trim().url().max(2_048)).min(1).max(FORUM_SIGNAL_LIMITS.threads)
    .describe("Each forum thread these reports come from, read here with read_forum_thread and passed by its " +
      "research_receipt, by its link. AskRigor checks each was read here and keeps how many there were, their " +
      "communities as its reader found them, and a link to each only in an id-only form (a Reddit post by its id, or " +
      "a forum's thread number), never a title or a person's page. Never a YouTube video or its comments."),
  people: z.object({ better: count, no_change: count, worse: count, mixed: count }).strict()
    .describe("How many people, not comments, reported each outcome in those threads: no more than the threads hold, " +
      "on Reddit each thread's comments read and its poster, on a forum page one person for each " +
      `${FORUM_PAGE_CHARACTERS_PER_PERSON} characters read.`),
  report_quality: z.object({ detailed: count, measured: count, bare: count }).strict()
    .describe("How good the reports are (HRP ReportQualityBesideCounts): how many of those people gave the details " +
      "(what, how much, how long, what else changed at the same time), how many measured the change, and how many " +
      "wrote a bare one-liner."),
  mechanism: text(FORUM_SIGNAL_LIMITS.text).optional()
    .describe("A plausible way it could work, in your own words; it supports plausibility, not an outcome (HRP " +
      "MechanismIsNotOutcome). If the only plausible way is expectation, say so."),
  studies: z.enum(FORUM_SIGNAL_STUDIES)
    .describe("How studies relate to these reports (HRP FormalAbsenceCannotEraseCommunitySignal): corroborated; " +
      "contradicted, only when studies measured it the way these reports did (MatchedContradictionAndOutcomeAlignment); " +
      "outcome_mismatch, when they measured something else; support_not_located, when the searches made here found none."),
  studies_measured: text(FORUM_SIGNAL_LIMITS.text).optional()
    .describe("With outcome_mismatch only: what the studies measured instead, in your own words."),
  search_query: text(FORUM_SIGNAL_LIMITS.query).optional()
    .describe("With support_not_located: the exact query of a literature search passed here, by its research_receipt, " +
      "that looked for studies of it and found none. Checked, never stored.")
}).strict();
export type ForumSignal = z.output<typeof forumSignalSchema>;

/** The descriptions the card's later shape gives its two new fields. */
export const BACKING_DESCRIPTION = "Up to 3 lines, each for one of this finding's key sources: the paper's sentence " +
  "behind the finding and its conclusion, each copied whole and exactly (at most 300 characters), and the strongest " +
  "thing against it in your own words. AskRigor looks each quote up in the text it fetched; only a quote found word for " +
  "word in a full text AskRigor fetched itself or a PubMed abstract is kept and shown on the Atlas.";
export const FORUM_SIGNAL_DESCRIPTION = "For a finding people's reports bear on: the forum threads read here, how many " +
  "people reported better, no change, worse or mixed, how good their reports are, a way it could work, and how studies " +
  "relate to the reports. A finding may rest on this alone, with no source, when the reports agree.";

/** How AskRigor read a source, from the final check's receipts, or the depth the AI declared when no receipt shows more. */
export const SOURCE_READINGS = ATLAS_SOURCE_READINGS;
export type SourceReading = AtlasSourceReading;
/** A study audit's check of its printed figures against its own data, when it found them consistent or not. */
export const SOURCE_FIGURES = ATLAS_SOURCE_FIGURES;
export type SourceFigures = AtlasSourceFigures;

/** One source of a stored finding as it was read. */
export interface SourceReadingEntry {
  source: string;
  read: SourceReading;
  figures?: SourceFigures;
}

/** The texts a quote may be kept from: a full text AskRigor fetched itself, or a PubMed abstract. */
export const PUBLISHABLE_QUOTE_TEXTS = ATLAS_QUOTE_TEXTS;
export type PublishableQuoteText = AtlasQuoteText;

/** A backing line as the library stores it: only the quotes found word for word in a publishable text. */
export interface StoredBacking {
  source: string;
  sentence?: string;
  sentence_section?: string;
  conclusion?: string;
  conclusion_section?: string;
  text: PublishableQuoteText;
  against: string;
}

/** A stored backing line, as the owner's review reads a record: at least one quote kept. */
export const storedBackingSchema = z.object({
  source: text(300),
  sentence: text(BACKING_LIMITS.quote).optional(),
  sentence_section: text(BACKING_LIMITS.section).optional(),
  conclusion: text(BACKING_LIMITS.quote).optional(),
  conclusion_section: text(BACKING_LIMITS.section).optional(),
  text: z.enum(PUBLISHABLE_QUOTE_TEXTS),
  against: text(BACKING_LIMITS.against),
}).strict().refine((line) => line.sentence !== undefined || line.conclusion !== undefined, { message: "a quote kept" })
  .refine((line) => (line.sentence_section === undefined || line.sentence !== undefined) &&
    (line.conclusion_section === undefined || line.conclusion !== undefined), { message: "a section goes with its quote" });

/**
 * A forum signal as the library stores it: the communities the verified threads belong to, how many were read, and,
 * since the free contributor notice's version 5 (owner answer 253a, 5 November 2026: "links to the forum threads
 * AskRigor read"), the threads' links as the Atlas publishes them. Both are rebuilt from the verified parts of each read
 * (publishedThreadOf, the review of 5 November: findings 1 and 2), never from the AI's link: a Reddit post by its id,
 * with the subreddit the reader returned; another forum's registrable host, and a link only in a structural, id-only
 * form. A card saved under an earlier notice keeps no link.
 */
export interface StoredForumSignal {
  /**
   * The communities of the threads read: r/<subreddit> on Reddit, as the reader's receipt signed it, a forum's
   * registrable host elsewhere; none for a post on a person's profile.
   */
  communities: string[];
  /** How many threads AskRigor's reader read for it, each by a verified receipt. */
  threads_read: number;
  /** The threads' links as published; only when the saving account's consent covers them. */
  threads?: string[];
  people: ForumSignal["people"];
  report_quality: ForumSignal["report_quality"];
  mechanism?: string;
  studies: ForumSignalStudies;
  studies_measured?: string;
}

/**
 * A card's forum signal as the library stores it: how many threads and their communities, and, with `links` (the saving
 * account's consent covers them), each thread's link as published, one that holds contact details left out. Each thread
 * is rebuilt from its verified parts (publishedThreadOf): `subredditAt` gives, by the thread's place in the signal, the
 * subreddit the final check's receipt signed for a Reddit post (threadCommunitiesFromReceipt), and a Reddit post without
 * one publishes neither community nor link; `linkReadAt` whether the receipt signed a forum page's link as the one its
 * reader read (threadLinksFromReceipt), without which the page publishes no link.
 */
export function storedForumSignalOf(signal: ForumSignal, text: (value: string) => string = (value) => value,
  links = false, subredditAt: (place: number) => string | undefined = () => undefined,
  linkReadAt: (place: number) => boolean = () => false): StoredForumSignal | undefined {
  const seen = new Set<string>();
  const threads = signal.threads.flatMap((thread, place): PublishedThread[] => {
    if (!isWebLink(thread) || isYouTubeLink(thread)) return [];
    const published = publishedThreadOf(thread, subredditAt(place), linkReadAt(place));
    if (published === undefined || seen.has(published.key)) return [];
    seen.add(published.key);
    return [published];
  }).slice(0, FORUM_SIGNAL_LIMITS.threads);
  if (threads.length === 0) return undefined;
  // The named communities, then, once, the pages that may not be named.
  const communities = [...new Set(threads.flatMap(({ community }) => community === undefined ? [] : [community]))]
    .sort((left, right) => Number(left === ATLAS_OTHER_WEBSITE) - Number(right === ATLAS_OTHER_WEBSITE));
  const published = !links ? [] : [...new Set(threads.flatMap(({ link }) =>
    link === undefined || contactDetailKinds(link).length > 0 ? [] : [link]))];
  return {
    communities,
    threads_read: threads.length,
    ...(published.length === 0 ? {} : { threads: published }),
    people: { ...signal.people },
    report_quality: { ...signal.report_quality },
    ...(signal.mechanism === undefined ? {} : { mechanism: text(signal.mechanism) }),
    studies: signal.studies,
    ...(signal.studies_measured === undefined ? {} : { studies_measured: text(signal.studies_measured) }),
  };
}

/** A stored forum signal, as the owner's review reads a record. */
export const storedForumSignalSchema = z.object({
  communities: z.array(text(120).regex(ATLAS_THREAD_COMMUNITY)).max(FORUM_SIGNAL_LIMITS.threads),
  threads_read: z.number().int().min(1).max(FORUM_SIGNAL_LIMITS.threads),
  threads: z.array(z.string().max(2_048).regex(ATLAS_THREAD_LINK)).min(1).max(FORUM_SIGNAL_LIMITS.threads).optional(),
  people: forumSignalSchema.shape.people,
  report_quality: forumSignalSchema.shape.report_quality,
  mechanism: text(FORUM_SIGNAL_LIMITS.text).optional(),
  studies: z.enum(FORUM_SIGNAL_STUDIES),
  studies_measured: text(FORUM_SIGNAL_LIMITS.text).optional(),
}).strict();

/** A stored source reading, as the owner's review reads a record. */
export const sourceReadingSchema = z.object({
  source: text(300),
  read: z.enum(SOURCE_READINGS),
  figures: z.enum(SOURCE_FIGURES).optional(),
}).strict();

// Signed claims -------------------------------------------------------------------------------------------------------

const OUTCOME_CODES = { found: "f", not_found: "n", not_checked: "u" } as const;
const CODE_OUTCOMES: Readonly<Record<string, keyof typeof OUTCOME_CODES>> = { f: "found", n: "not_found", u: "not_checked" };
const TEXT_KINDS = ["full_text", "abstract", "search_copy", "library_copy", "none"] as const;
const SIGNED_LINE = /^([1-5])\.([1-3]):([fnu])([fnu]):(full_text|abstract|search_copy|library_copy|none)$/u;
const SIGNED_SECTION = /^([1-5])\.([1-3])\.([sc]):(.{1,80})$/su;
const SIGNED_READING = new RegExp(`^([1-5])\\.(10|[1-9]):(${SOURCE_READINGS.join("|")}):(consistent|internally_inconsistent|-)$`, "u");

/** One backing line's lookup, by its finding and its place among that finding's lines, both from 0. */
export interface BackingLookup {
  finding: number;
  line: number;
  lookup: SourceLineLookup;
}

/**
 * What the finalization receipt signs of the backing lines' lookups: `bl`, one entry a line, with whether each quote was
 * found and the kind of text it was looked up in; `bs`, the section each found quote is in, at most 80 characters.
 */
export function signedBackingClaims(lookups: readonly BackingLookup[]): { bl: string[]; bs: string[] } {
  const bl: string[] = [];
  const bs: string[] = [];
  for (const { finding, line, lookup } of lookups) {
    const at = `${finding + 1}.${line + 1}`;
    bl.push(`${at}:${OUTCOME_CODES[lookup.sentence]}${OUTCOME_CODES[lookup.conclusion]}:${lookup.text ?? "none"}`);
    for (const [which, outcome, section] of [["s", lookup.sentence, lookup.sentence_section],
      ["c", lookup.conclusion, lookup.conclusion_section]] as const) {
      // Cut at whole characters (the review of 5 November, finding 6): half of one would stop the receipt.
      const shown = section === undefined ? undefined
        : receiptText(section.replace(/[\s\p{Cc}]+/gu, " ").trim(), BACKING_LIMITS.section).trim();
      if (outcome === "found" && shown !== undefined && shown !== "") bs.push(`${at}.${which}:${shown}`);
    }
  }
  return { bl, bs };
}

/**
 * The backing lines a receipt signed for a card, as the library stores them, by the finding's place on the card: each
 * quote found word for word in a full text AskRigor fetched itself or a PubMed abstract, with its section, and the line's
 * `against`; a quote that fails the privacy screen is left out, and so is a line with no quote left. Empty for a receipt
 * that signed none (an older check, or lookups that didn't finish).
 */
export function findingBackingFromReceipt(
  signedLines: unknown,
  signedSections: unknown,
  card: { findings: ReadonlyArray<{ backing?: readonly FindingBacking[] | undefined }> },
  screen: (value: string) => unknown,
  against: (value: string) => string = (value) => value,
): Map<number, StoredBacking[]> {
  const sections = new Map<string, string>();
  for (const entry of strings(signedSections)) {
    const match = SIGNED_SECTION.exec(entry);
    if (match !== null) sections.set(`${match[1]}.${match[2]}.${match[3]}`, match[4]!);
  }
  const backing = new Map<number, StoredBacking[]>();
  const seen = new Set<string>();
  for (const entry of strings(signedLines)) {
    const match = SIGNED_LINE.exec(entry);
    if (match === null) continue;
    const [, findingText, lineText, sentenceCode, conclusionCode, kind] = match as unknown as [string, string, string,
      string, string, typeof TEXT_KINDS[number]];
    const at = `${findingText}.${lineText}`;
    const finding = Number(findingText) - 1;
    const line = card.findings[finding]?.backing?.[Number(lineText) - 1];
    if (line === undefined || seen.has(at) || !(PUBLISHABLE_QUOTE_TEXTS as readonly string[]).includes(kind)) continue;
    seen.add(at);
    const kept = (code: string, quote: string | undefined) =>
      quote !== undefined && CODE_OUTCOMES[code] === "found" && screen(quote) === undefined ? quote : undefined;
    const sentence = kept(sentenceCode, line.sentence);
    const conclusion = kept(conclusionCode, line.conclusion);
    if (sentence === undefined && conclusion === undefined) continue;
    const sentenceSection = sentence === undefined ? undefined : sections.get(`${at}.s`);
    const conclusionSection = conclusion === undefined ? undefined : sections.get(`${at}.c`);
    const stored: StoredBacking = {
      source: line.source,
      ...(sentence === undefined ? {} : { sentence }),
      ...(sentenceSection === undefined || screen(sentenceSection) !== undefined ? {} : { sentence_section: sentenceSection }),
      ...(conclusion === undefined ? {} : { conclusion }),
      ...(conclusionSection === undefined || screen(conclusionSection) !== undefined
        ? {} : { conclusion_section: conclusionSection }),
      text: kind as PublishableQuoteText,
      against: against(line.against),
    };
    backing.set(finding, [...(backing.get(finding) ?? []), stored]);
  }
  return backing;
}

/** What the finalization receipt signs of how each finding's sources were read: `rd`, one entry a source. */
export function signedReadingClaims(
  card: { findings: ReadonlyArray<{ sources: readonly string[] }> },
  readingOf: (source: string) => { read: SourceReading; figures?: SourceFigures | undefined } | undefined,
): string[] {
  return card.findings.flatMap(({ sources }, finding) => sources.slice(0, 10).flatMap((source, place) => {
    const reading = readingOf(source);
    return reading === undefined ? [] : [`${finding + 1}.${place + 1}:${reading.read}:${reading.figures ?? "-"}`];
  }));
}

/** How a receipt signed each finding's sources were read, by the finding's place on the card; empty when it signed none. */
export function findingReadingFromReceipt(
  signed: unknown,
  card: { findings: ReadonlyArray<{ sources: readonly string[] }> },
): Map<number, SourceReadingEntry[]> {
  const readings = new Map<number, SourceReadingEntry[]>();
  const seen = new Set<string>();
  for (const entry of strings(signed)) {
    const match = SIGNED_READING.exec(entry);
    if (match === null) continue;
    const finding = Number(match[1]) - 1;
    const source = card.findings[finding]?.sources[Number(match[2]) - 1];
    if (source === undefined || seen.has(`${match[1]}.${match[2]}`)) continue;
    seen.add(`${match[1]}.${match[2]}`);
    const figures = match[4] === "-" ? undefined : match[4] as SourceFigures;
    readings.set(finding, [...(readings.get(finding) ?? []),
      { source, read: match[3] as SourceReading, ...(figures === undefined ? {} : { figures }) }]);
  }
  return readings;
}

const SIGNED_THREAD = /^([1-5])\.(20|1[0-9]|[1-9]):([a-z0-9_]{2,21})$/u;

/**
 * What the finalization receipt signs of the Reddit threads a card's forum signals name (`ft`, the review of 5 November,
 * finding 1): for each, by the finding's place and the thread's, the subreddit the reader returned, as the thread's
 * forum_thread_read receipt signed it (u_ for a post on a person's profile). The save takes a Reddit thread's community
 * and link from it alone, never from the AI's link.
 */
export function signedThreadCommunities(
  card: { findings: ReadonlyArray<{ forum_signal?: ForumSignal | undefined }> },
  subredditOf: (url: string) => string | undefined,
): string[] {
  return card.findings.flatMap(({ forum_signal: signal }, finding) =>
    (signal?.threads ?? []).slice(0, FORUM_SIGNAL_LIMITS.threads).flatMap((thread, place) => {
      const subreddit = subredditOf(thread);
      return subreddit === undefined || !isSignedSubreddit(subreddit) ? [] : [`${finding + 1}.${place + 1}:${subreddit}`];
    }));
}

/**
 * The subreddits a receipt signed for a card's Reddit threads (`ft`), by the finding's place and then the thread's, both
 * from 0. Empty for a receipt that signed none (an older check, or no Reddit thread), and then no Reddit thread
 * publishes a community or a link.
 */
export function threadCommunitiesFromReceipt(
  signed: unknown,
  card: { findings: ReadonlyArray<{ forum_signal?: ForumSignal | undefined }> },
): Map<number, Map<number, string>> {
  const subreddits = new Map<number, Map<number, string>>();
  for (const entry of strings(signed)) {
    const match = SIGNED_THREAD.exec(entry);
    if (match === null || !isSignedSubreddit(match[3]!)) continue;
    const finding = Number(match[1]) - 1;
    const place = Number(match[2]) - 1;
    if (card.findings[finding]?.forum_signal?.threads[place] === undefined) continue;
    const places = subreddits.get(finding) ?? new Map<number, string>();
    if (!places.has(place)) places.set(place, match[3]!);
    subreddits.set(finding, places);
  }
  return subreddits;
}

const SIGNED_THREAD_LINK = /^([1-5])\.(20|1[0-9]|[1-9])$/u;

/**
 * What the finalization receipt signs of the forum pages a card's forum signals name (`fl`, the recheck of #417): by
 * the finding's place and the thread's, each page whose id-only link, as the card gives it, is the link its reader read,
 * as the page's forum_thread_read receipt signed it (`l`). The save publishes only those pages' links, so a link is never
 * the AI's own http:// or another host than the one read.
 */
export function signedThreadLinks(
  card: { findings: ReadonlyArray<{ forum_signal?: ForumSignal | undefined }> },
  linksRead: (url: string) => ReadonlySet<string> | undefined,
): string[] {
  return card.findings.flatMap(({ forum_signal: signal }, finding) =>
    (signal?.threads ?? []).slice(0, FORUM_SIGNAL_LIMITS.threads).flatMap((thread, place) => {
      const link = forumPublishedLink(thread);
      return link !== undefined && linksRead(thread)?.has(forumLinkDigest(link)) === true
        ? [`${finding + 1}.${place + 1}`] : [];
    }));
}

/**
 * The forum pages a receipt signed as linked as read (`fl`), by the finding's place and then the thread's, both from 0.
 * Empty for a receipt that signed none, and then no forum page publishes a link.
 */
export function threadLinksFromReceipt(
  signed: unknown,
  card: { findings: ReadonlyArray<{ forum_signal?: ForumSignal | undefined }> },
): Map<number, Set<number>> {
  const linked = new Map<number, Set<number>>();
  for (const entry of strings(signed)) {
    const match = SIGNED_THREAD_LINK.exec(entry);
    if (match === null) continue;
    const finding = Number(match[1]) - 1;
    const place = Number(match[2]) - 1;
    if (card.findings[finding]?.forum_signal?.threads[place] === undefined) continue;
    linked.set(finding, (linked.get(finding) ?? new Set<number>()).add(place));
  }
  return linked;
}

function strings(value: unknown): string[] {
  return typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

// The final check's exact checks --------------------------------------------------------------------------------------

export interface ResearchBehindContext {
  /** Whether two source identifiers name the same paper, as the final check compares them. */
  sameSource(left: string, right: string): boolean;
  /** Whether a source is one of this call's key_sources. */
  keySource(source: string): boolean;
  /** Whether a verified forum_thread_read receipt of this call signs this thread's comparable link. */
  threadRead(url: string): boolean;
  /** The thread's comparable link, so the same thread given twice is found. */
  comparableThread(url: string): string;
  /**
   * How many people a thread read here can hold (the reviews of 5 November): on Reddit, the comments its receipts signed
   * as read, each part once, and its poster; on a forum page, one person for each FORUM_PAGE_CHARACTERS_PER_PERSON
   * characters of each page read. Undefined for a thread not read here, or read by a receipt that names no reader.
   */
  threadCapacity(url: string): number | undefined;
  /** Whether a verified literature_search receipt of this call signs this query, compared by its digest. */
  literatureSearched(query: string): boolean;
}

/** Each problem with the card's backing lines, figure sources and forum signals, naming the field and what to change. */
export function researchBehindProblems(
  card: {
    findings: ReadonlyArray<{
      sources: readonly string[];
      backing?: readonly FindingBacking[] | undefined;
      numbers?: ReadonlyArray<{ source?: string | undefined }> | undefined;
      forum_signal?: ForumSignal | undefined;
    }>;
  },
  context: ResearchBehindContext,
): string[] {
  const problems: string[] = [];
  card.findings.forEach((finding, index) => {
    const at = `findings_card.findings[${index}]`;
    const ownSource = (source: string) => finding.sources.some((cited) => context.sameSource(cited, source));
    const lines = new Set<string>();
    (finding.backing ?? []).forEach((line, place) => {
      const where = `${at}.backing[${place}]`;
      if (!ownSource(line.source) || !context.keySource(line.source)) {
        problems.push(`${where}.source is ${line.source}, which is not one of this finding's sources given in ` +
          "key_sources: give the source the quotes come from, as the finding's sources and key_sources give it.");
      }
      const key = `${finding.sources.find((cited) => context.sameSource(cited, line.source)) ?? line.source}\n${line.sentence}`;
      if (lines.has(key)) problems.push(`${where} repeats an earlier line's source and sentence: give each line once.`);
      lines.add(key);
    });
    (finding.numbers ?? []).forEach((entry, place) => {
      if (entry.source !== undefined && !ownSource(entry.source)) {
        problems.push(`${at}.numbers[${place}].source is ${entry.source}, which is not one of this finding's ` +
          "sources: give the source the figure comes from, or leave it out.");
      }
    });
    const signal = finding.forum_signal;
    if (signal === undefined) {
      if (finding.sources.length === 0) {
        problems.push(`${at}.sources is empty: cite a key source, or, for a finding that rests on what people ` +
          "report, give its forum_signal.");
      }
      return;
    }
    problems.push(...forumSignalProblems(signal, `${at}.forum_signal`, finding.sources.length > 0, context));
  });
  return problems;
}

function forumSignalProblems(signal: ForumSignal, at: string, citesStudies: boolean,
  context: ResearchBehindContext): string[] {
  const problems: string[] = [];
  const threads = new Set<string>();
  // Each thread read here once, with how many people it can hold; none when a thread wasn't read.
  let capacities: Array<number | undefined> | undefined = [];
  signal.threads.forEach((thread, place) => {
    const where = `${at}.threads[${place}]`;
    if (!isWebLink(thread) || isYouTubeLink(thread)) {
      problems.push(`${where} is not a forum thread's web link: give the link of a thread read with read_forum_thread. ` +
        "YouTube comments never go in a forum signal.");
      capacities = undefined;
      return;
    }
    const comparable = context.comparableThread(thread);
    const repeated = threads.has(comparable);
    if (repeated) problems.push(`${where} gives a thread already listed: give each thread once.`);
    threads.add(comparable);
    if (!context.threadRead(thread)) {
      problems.push(`${where} was not read here: read it in full with read_forum_thread and pass its research_receipt, ` +
        "or leave it out.");
      capacities = undefined;
    } else if (!repeated) {
      capacities?.push(context.threadCapacity(thread));
    }
  });
  const { better, no_change: same, worse, mixed } = signal.people;
  const people = better + same + worse + mixed;
  if (people === 0) problems.push(`${at}.people counts no one: count each person who reported an outcome once.`);
  // The reviews of 5 November: no more people than the threads read here hold, on Reddit each thread's comments read,
  // each part once, and its poster, on a forum page one person for each FORUM_PAGE_CHARACTERS_PER_PERSON characters read.
  const held: ReadonlyArray<number | undefined> | undefined = capacities;
  if (held !== undefined && held.length > 0 && held.every((capacity) => capacity !== undefined)) {
    const most = held.reduce<number>((sum, capacity) => sum + capacity!, 0);
    if (people > most) {
      problems.push(`${at}.people counts ${people} people, more than the ${most} the threads read here can hold (on ` +
        "Reddit each thread's comments read, once, and its poster; on a forum page one person for each " +
        `${FORUM_PAGE_CHARACTERS_PER_PERSON} characters read): count each person once, from what was read, or read the ` +
        "rest of a thread (read_forum_thread's more, or a forum's next page) and pass that research_receipt too.");
    }
  }
  const { detailed, measured, bare } = signal.report_quality;
  for (const [name, value] of [["detailed", detailed], ["measured", measured], ["bare", bare]] as const) {
    if (value > people) {
      problems.push(`${at}.report_quality.${name} is ${value}, more than the ${people} people counted: count people ` +
        "among those in people.");
    }
  }
  if (detailed + bare > people) {
    problems.push(`${at}.report_quality counts ${detailed + bare} people as detailed or bare one-liners, more than the ` +
      `${people} counted: a bare one-liner gives no details, so a person is one or the other, or neither.`);
  }
  if ((signal.studies === "outcome_mismatch") !== (signal.studies_measured !== undefined)) {
    problems.push(signal.studies === "outcome_mismatch"
      ? `${at}.studies is outcome_mismatch without studies_measured: say what the studies measured instead.`
      : `${at}.studies_measured goes only with studies outcome_mismatch: leave it out.`);
  }
  if (signal.studies !== "support_not_located" && !citesStudies) {
    problems.push(`${at}.studies is ${signal.studies}, but the finding cites no study: cite the studies in its ` +
      "sources, or give support_not_located when the searches made here found none.");
  }
  // The review of 5 November, finding 7: no study found means a search named here, as option_classes names one, compared
  // by its query's digest with a literature-search receipt of this call.
  if (signal.studies === "support_not_located") {
    if (signal.search_query === undefined) {
      problems.push(`${at}.studies is support_not_located without search_query: give the exact query of a literature ` +
        "search passed here that looked for studies of it and found none.");
    } else if (!context.literatureSearched(signal.search_query)) {
      problems.push(`${at}.search_query is not the query of any literature search passed here: search for studies of ` +
        "it with search_pubmed or search_europe_pmc, give that exact query, and pass its research_receipt.");
    }
  }
  return problems;
}

// Thread links -------------------------------------------------------------------------------------------------------

function isWebLink(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

function isYouTubeLink(value: string): boolean {
  try {
    return /(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/iu.test(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * A source identifier as two forms of it are compared, as the final check compares them: a DOI lower case without its
 * resolver prefix, with "%3C" and "%3E" read as "<" and ">" as acquisition reads them (the review of #421), a PMCID upper
 * case, a PMID's digits; anything else trimmed and lower case.
 */
export function sourceIdKey(value: string): string {
  const trimmed = value.trim();
  const doi = trimmed.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, "");
  if (/^10\.\d{4,9}\//u.test(doi)) return decodedDoi(doi).toLowerCase();
  const pmcid = /^(?:pmcid:?\s*)?(pmc\d+)$/iu.exec(trimmed);
  if (pmcid !== null) return pmcid[1]!.toUpperCase();
  const pmid = /^(?:pmid:?\s*)?(\d{1,9})$/iu.exec(trimmed);
  if (pmid !== null) return pmid[1]!;
  return trimmed.toLowerCase();
}
