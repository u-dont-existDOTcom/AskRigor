import {
  ATLAS_FORUM_SIGNAL_STUDIES,
  ATLAS_QUOTE_TEXTS,
  ATLAS_SOURCE_FIGURES,
  ATLAS_SOURCE_READINGS,
  type AtlasForumSignalStudies,
  type AtlasQuoteText,
  type AtlasSourceFigures,
  type AtlasSourceReading,
} from "@askrigor/evidence-repository";
import { z } from "zod";

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
export const FORUM_SIGNAL_LIMITS = { threads: 20, text: 300, count: 100_000 } as const;

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
      "research_receipt, by its link. AskRigor checks each was read here and keeps their communities and how many " +
      "there were, not the links. Never a YouTube video or its comments."),
  people: z.object({ better: count, no_change: count, worse: count, mixed: count }).strict()
    .describe("How many people, not comments, reported each outcome in those threads."),
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
    .describe("With outcome_mismatch only: what the studies measured instead, in your own words.")
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
 * A forum signal as the library stores it. The free contributor notice (version 4) and the privacy page say a findings
 * card holds what communities reported "summarized without their posts, names, links or video IDs", so the save keeps
 * the communities the verified threads belong to and how many were read, never the threads' links; publishing the links
 * waits for the owner's yes to notice wording that covers them (plan docs/superpowers/plans/2026-11-05-atlas-research-behind.md).
 */
export interface StoredForumSignal {
  /** The communities of the threads read, from their links: r/<name> on Reddit, a forum's site name elsewhere. */
  communities: string[];
  /** How many threads AskRigor's reader read for it, each by a verified receipt. */
  threads_read: number;
  people: ForumSignal["people"];
  report_quality: ForumSignal["report_quality"];
  mechanism?: string;
  studies: ForumSignalStudies;
  studies_measured?: string;
}

/** A card's forum signal as the library stores it: its communities and how many threads, never the links. */
export function storedForumSignalOf(signal: ForumSignal, text: (value: string) => string = (value) => value):
  StoredForumSignal | undefined {
  const threads = signal.threads.filter((thread) => isWebLink(thread) && !isYouTubeLink(thread));
  const communities = [...new Set(threads.flatMap((thread) => {
    const community = forumCommunityOf(thread);
    return community === undefined ? [] : [community];
  }))].slice(0, FORUM_SIGNAL_LIMITS.threads);
  if (communities.length === 0) return undefined;
  return {
    communities,
    threads_read: threads.length,
    people: { ...signal.people },
    report_quality: { ...signal.report_quality },
    ...(signal.mechanism === undefined ? {} : { mechanism: text(signal.mechanism) }),
    studies: signal.studies,
    ...(signal.studies_measured === undefined ? {} : { studies_measured: text(signal.studies_measured) }),
  };
}

/** A stored forum signal, as the owner's review reads a record. */
export const storedForumSignalSchema = z.object({
  communities: z.array(text(120)).min(1).max(FORUM_SIGNAL_LIMITS.threads),
  threads_read: z.number().int().min(1).max(FORUM_SIGNAL_LIMITS.threads),
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
      const shown = section?.replace(/[\s\p{Cc}]+/gu, " ").trim().slice(0, BACKING_LIMITS.section);
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
  /** Whether this call passed a verified literature_search receipt. */
  literatureSearched: boolean;
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
  signal.threads.forEach((thread, place) => {
    const where = `${at}.threads[${place}]`;
    if (!isWebLink(thread) || isYouTubeLink(thread)) {
      problems.push(`${where} is not a forum thread's web link: give the link of a thread read with read_forum_thread. ` +
        "YouTube comments never go in a forum signal.");
      return;
    }
    const comparable = context.comparableThread(thread);
    if (threads.has(comparable)) problems.push(`${where} gives a thread already listed: give each thread once.`);
    threads.add(comparable);
    if (!context.threadRead(thread)) {
      problems.push(`${where} was not read here: read it in full with read_forum_thread and pass its research_receipt, ` +
        "or leave it out.");
    }
  });
  const { better, no_change: same, worse, mixed } = signal.people;
  const people = better + same + worse + mixed;
  if (people === 0) problems.push(`${at}.people counts no one: count each person who reported an outcome once.`);
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
  if (signal.studies === "support_not_located" && !context.literatureSearched) {
    problems.push(`${at}.studies is support_not_located, but no literature search was passed here: search with ` +
      "search_pubmed or search_europe_pmc and pass their research receipts, so that no study found means the searches " +
      "made here found none.");
  }
  return problems;
}

// Thread links and communities ---------------------------------------------------------------------------------------

const REDDIT_HOST = /(?:^|\.)reddit\.com$/u;
const REDDIT_POST = /^\/(?:r\/[A-Za-z0-9_]{2,21}\/|u(?:ser)?\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/|$)/iu;
const REDD_IT_POST = /^\/([a-z0-9]+)\/?$/iu;
const SUBREDDIT = /^\/r\/([A-Za-z0-9_]{2,21})(?:\/|$)/u;
// Path parts that name a person rather than a thread, on any forum.
const PERSON_PATH = /\/(?:u|user|users|member|members|profile|profiles|people)\//iu;
// Query parameters that track a click or a share, or carry a session, never a thread.
const SESSION_OR_TRACKING = /^(?:utm_\w+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|ref|ref_src|share_id|si|_ga|sid|s|phpsessid|sessionid|jsessionid)$/iu;

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

/** A Reddit post's id from its link, on any of Reddit's hosts; undefined for anything else. */
function redditPost(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  if (host === "redd.it") return REDD_IT_POST.exec(url.pathname)?.[1]?.toLowerCase();
  return REDDIT_HOST.test(host) ? REDDIT_POST.exec(url.pathname)?.[1]?.toLowerCase() : undefined;
}

/**
 * A thread's link as the Atlas publishes it: a Reddit post as https://www.reddit.com/comments/<id>/, so the link never
 * names a user or carries its title's words; any other forum's link as read, without a fragment, a session or tracking
 * parameter, a user name or password. Undefined for a link that isn't a web link, goes to YouTube, names a person's
 * page, or is a Reddit link that isn't a post.
 */
export function publishedThreadLink(value: string): string | undefined {
  if (!isWebLink(value) || isYouTubeLink(value)) return undefined;
  const url = new URL(value.trim());
  if (url.username !== "" || url.password !== "") return undefined;
  const host = url.hostname.toLowerCase();
  if (REDDIT_HOST.test(host) || host === "redd.it") {
    const post = redditPost(url);
    return post === undefined ? undefined : `https://www.reddit.com/comments/${post}/`;
  }
  if (PERSON_PATH.test(url.pathname)) return undefined;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (SESSION_OR_TRACKING.test(key)) url.searchParams.delete(key);
  return url.href;
}

/** The community a thread's link names: r/<name> on Reddit (or Reddit, for a post without one), the site's name elsewhere. */
export function forumCommunityOf(value: string): string | undefined {
  if (!isWebLink(value)) return undefined;
  const url = new URL(value.trim());
  const host = url.hostname.toLowerCase();
  if (REDDIT_HOST.test(host) || host === "redd.it") {
    const subreddit = SUBREDDIT.exec(url.pathname)?.[1];
    return subreddit === undefined ? "Reddit" : `r/${subreddit}`;
  }
  return host.replace(/^www\./u, "");
}

/**
 * A source identifier as two forms of it are compared, as the final check compares them: a DOI lower case without its
 * resolver prefix, a PMCID upper case, a PMID's digits; anything else trimmed and lower case.
 */
export function sourceIdKey(value: string): string {
  const trimmed = value.trim();
  const doi = trimmed.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/iu, "");
  if (/^10\.\d{4,9}\//u.test(doi)) return doi.toLowerCase();
  const pmcid = /^(?:pmcid:?\s*)?(pmc\d+)$/iu.exec(trimmed);
  if (pmcid !== null) return pmcid[1]!.toUpperCase();
  const pmid = /^(?:pmid:?\s*)?(\d{1,9})$/iu.exec(trimmed);
  if (pmid !== null) return pmid[1]!;
  return trimmed.toLowerCase();
}
