import { z } from "zod";

/**
 * The research behind an Atlas finding, and what people report (owner answers 252a and 255a, 5 November 2026; plan
 * docs/superpowers/plans/2026-11-05-atlas-research-behind.md): the shapes a version 3 publication and an accepted
 * finding's version share. The vocabularies are closed; which quotes are kept, and what is published, is decided in the
 * research server. Each schema takes the text check of the store that keeps it: a publication's, or the canonical
 * Atlas's, which also refuses a findings card's number and a YouTube link.
 */

/** How AskRigor read a source, from the final check's receipts or the depth the AI declared. */
export const ATLAS_SOURCE_READINGS = [
  "full_text_audited", "search_copy_audited", "full_text_read", "partial_text", "abstract_only", "atlas_checked",
  "secondary_only", "not_read",
] as const;
export type AtlasSourceReading = typeof ATLAS_SOURCE_READINGS[number];
/** A study audit's check of its printed figures against its own data. */
export const ATLAS_SOURCE_FIGURES = ["consistent", "internally_inconsistent"] as const;
export type AtlasSourceFigures = typeof ATLAS_SOURCE_FIGURES[number];
/** The texts a published quote was found in: a full text AskRigor fetched itself, or a PubMed abstract. */
export const ATLAS_QUOTE_TEXTS = ["full_text", "abstract"] as const;
export type AtlasQuoteText = typeof ATLAS_QUOTE_TEXTS[number];
/** HRP FormalAbsenceCannotEraseCommunitySignal's four formal relationships. */
export const ATLAS_FORUM_SIGNAL_STUDIES = ["corroborated", "contradicted", "support_not_located", "outcome_mismatch"] as const;
export type AtlasForumSignalStudies = typeof ATLAS_FORUM_SIGNAL_STUDIES[number];
export const ATLAS_PUBLISHED_QUOTE_MAX_CHARACTERS = 300;
export const ATLAS_PUBLISHED_BACKING_PER_FINDING = 3;
export const ATLAS_PUBLISHED_THREADS_PER_FINDING = 20;

type TextCheck = (max: number) => z.ZodType<string>;
const YOUTUBE_HOST = /^\s*https?:\/\/(?:[^/?#@]*\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)(?:[:/?#]|$)/iu;
const peopleCount = z.number().int().nonnegative().max(100_000);

/** The research behind a finding's schemas, for one store's text check. */
export function atlasResearchSchemas(text: TextCheck) {
  const backing = z.object({
    source: text(300),
    sentence: text(ATLAS_PUBLISHED_QUOTE_MAX_CHARACTERS).optional(),
    sentence_section: text(80).optional(),
    conclusion: text(ATLAS_PUBLISHED_QUOTE_MAX_CHARACTERS).optional(),
    conclusion_section: text(80).optional(),
    text: z.enum(ATLAS_QUOTE_TEXTS),
    against: text(300),
  }).strict().superRefine((line, context) => {
    if (line.sentence === undefined && line.conclusion === undefined) {
      context.addIssue({ code: "custom", path: ["sentence"], message: "a line holds a quote" });
    }
    if ((line.sentence_section !== undefined && line.sentence === undefined) ||
      (line.conclusion_section !== undefined && line.conclusion === undefined)) {
      context.addIssue({ code: "custom", path: ["sentence_section"], message: "a section goes with its quote" });
    }
  });
  const reading = z.object({
    source: text(300),
    read: z.enum(ATLAS_SOURCE_READINGS),
    figures: z.enum(ATLAS_SOURCE_FIGURES).optional(),
  }).strict();
  const forumSignal = z.object({
    /** The communities the threads read belong to: r/<name> on Reddit, or a forum's site name. */
    communities: z.array(text(120)).min(1).max(ATLAS_PUBLISHED_THREADS_PER_FINDING),
    /** How many threads AskRigor's reader read for it, each by a verified receipt. */
    threads_read: z.number().int().min(1).max(ATLAS_PUBLISHED_THREADS_PER_FINDING),
    /** The threads' links as published (a Reddit post by its id); a link the pages can't show is left out. */
    threads: z.array(z.string().url().max(2_048)).max(ATLAS_PUBLISHED_THREADS_PER_FINDING),
    people: z.object({ better: peopleCount, no_change: peopleCount, worse: peopleCount, mixed: peopleCount }).strict(),
    report_quality: z.object({ detailed: peopleCount, measured: peopleCount, bare: peopleCount }).strict(),
    mechanism: text(300).optional(),
    studies: z.enum(ATLAS_FORUM_SIGNAL_STUDIES),
    studies_measured: text(300).optional(),
  }).strict().superRefine((signal, context) => {
    const people = signal.people.better + signal.people.no_change + signal.people.worse + signal.people.mixed;
    const { detailed, measured, bare } = signal.report_quality;
    if (people === 0 || detailed > people || measured > people || bare > people || detailed + bare > people) {
      context.addIssue({ code: "custom", path: ["report_quality"], message: "people counted, and report quality within them" });
    }
    if ((signal.studies === "outcome_mismatch") !== (signal.studies_measured !== undefined)) {
      context.addIssue({ code: "custom", path: ["studies_measured"], message: "what studies measured goes with outcome_mismatch" });
    }
    if (signal.threads.length > signal.threads_read) {
      context.addIssue({ code: "custom", path: ["threads"], message: "no more links than threads read" });
    }
    // A YouTube page is never a forum thread (owner answers 170, 208b and 227).
    if (signal.threads.some((thread) => YOUTUBE_HOST.test(thread))) {
      context.addIssue({ code: "custom", path: ["threads"], message: "a forum thread, never a YouTube page" });
    }
  });
  return { backing, reading, forumSignal };
}
