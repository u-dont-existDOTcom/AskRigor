import type { Pool } from "pg";
import { z } from "zod";

import {
  ATLAS_CERTAINTIES,
  ATLAS_FINDING_DIRECTIONS,
  ATLAS_FINDING_KINDS,
  ATLAS_SEARCH_DATABASES,
  ATLAS_SEARCH_QUERY_MAX_CHARACTERS,
  ATLAS_SEARCHES_PER_FINDING,
  ATLAS_SUBJECT_MAX_CHARACTERS,
  ATLAS_SUBJECT_TYPES,
  ATLAS_VERIFIED_BASES,
  assertSafeAtlasSchema,
  atlasPool,
  type PostgresAtlasStoreOptions,
} from "./atlas-findings.js";
import { ATLAS_PUBLISHED_BACKING_PER_FINDING, atlasResearchSchemas } from "./atlas-research.js";
import { assertNoProhibitedPersistentKeys } from "./contracts.js";

// Decision 171, section 4B (owner answers 168a and "171 approved", 24 Oct 2026; plan
// docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md): the findings of a card saved in free
// contributor mode are published in the Atlas as soon as the card is saved, one row per finding, marked "Not checked by
// supervisors yet" until the owner reviews them. Migration 0021's six review-role functions write the rows; this module
// holds what a row may contain, and the store in PostgreSQL and in memory with the same semantics. Code checks only
// exact things here: shapes, closed vocabularies, numbers and states. Which findings are eligible, and what is
// published of each, is decided in the research server (apps/research-mcp/src/atlas/publication.ts).

// Vocabulary --------------------------------------------------------------------------------------------------------

export const ATLAS_PUBLICATION_SCHEMA = "askrigor.atlas-publication.v1";
/**
 * unreviewed: published with the label "Not checked by supervisors yet"; accepted: the owner accepted it as the card
 * gives it, with its F number; edited: accepted with the owner's wording, or corrected after (the pages show the Atlas
 * finding its F number names, in its latest version); rejected: the owner rejected it and it leaves the pages;
 * withdrawn: it left the pages without a review (its card was deleted, set aside or replaced, or the owner unpublished
 * it); held: its text holds what the pages never show (contact details, a card reference or a YouTube link), so it waits
 * for the owner.
 */
export const ATLAS_PUBLICATION_STATES = ["unreviewed", "accepted", "edited", "rejected", "withdrawn", "held"] as const;
export type AtlasPublicationState = typeof ATLAS_PUBLICATION_STATES[number];
/** Why a publication is held: the contact-details check's kinds, a card reference (ARF-0042) or a YouTube link. */
export const ATLAS_PUBLICATION_HOLD_REASONS = [
  "email_address", "phone_number", "messaging_handle", "card_reference", "youtube_link",
] as const;
export type AtlasPublicationHoldReason = typeof ATLAS_PUBLICATION_HOLD_REASONS[number];
/** Why a publication was withdrawn without a review. */
export const ATLAS_PUBLICATION_WITHDRAWN_REASONS = [
  "card_forgotten", "card_set_aside", "owner_unpublished", "card_replaced",
] as const;
export type AtlasPublicationWithdrawnReason = typeof ATLAS_PUBLICATION_WITHDRAWN_REASONS[number];
/** The states a publication stays in until something moves it: shown (unreviewed, accepted, edited) or held. */
export const ATLAS_PUBLICATION_LIVE_STATES: readonly AtlasPublicationState[] = ["unreviewed", "held", "accepted", "edited"];
/** The most publications one inspect returns, and one unpublishing names. */
export const ATLAS_PUBLICATIONS_PER_INSPECT = 500;
export const ATLAS_PUBLICATIONS_PER_UNPUBLISH = 100;
/** The most cards one withdrawal names. */
export const ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL = 1_000;

const PUBLICATION_NUMBER = /^P-[1-9][0-9]{3,}$/u;
const ATLAS_NUMBER = /^F-[1-9][0-9]{3,}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const CONTROL_CHARACTER = /\p{Cc}/u;

// What a publication publishes ------------------------------------------------------------------------------------

const publishedText = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !CONTROL_CHARACTER.test(value.replace(/[\n\t]/gu, "")), {
    message: "a published text holds no control characters",
  });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(
  (value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
  { message: "a calendar date" },
);

/**
 * One two-group yes-or-no figure as the pages show it: the raw counts and the follow-up, from the card's numbers block.
 * Rates, the number needed to treat and the number needed to harm are worked out from the counts when the pages render,
 * so they are not published here.
 */
export const atlasPublishedNumberSchema = z.object({
  outcome: publishedText(200),
  better: z.enum(["fewer", "more"]),
  option: publishedText(120),
  option_events: z.number().int().nonnegative(),
  option_total: z.number().int().min(1),
  comparator: publishedText(120),
  comparator_events: z.number().int().nonnegative(),
  comparator_total: z.number().int().min(1),
  follow_up: publishedText(120),
  harms_none_found: z.boolean().optional(),
  /** Version 3 (owner answer 252a): which of the published sources the figure comes from. */
  source: publishedText(300).optional(),
}).strict().superRefine((entry, context) => {
  if (entry.option_events > entry.option_total) {
    context.addIssue({ code: "custom", path: ["option_events"], message: "events above the group's total" });
  }
  if (entry.comparator_events > entry.comparator_total) {
    context.addIssue({ code: "custom", path: ["comparator_events"], message: "events above the group's total" });
  }
});
export type AtlasPublishedNumber = z.infer<typeof atlasPublishedNumberSchema>;

/**
 * Published fields with their card's context (plan docs/superpowers/plans/2026-11-02-atlas-finding-pages-in-context.md):
 * v1's, and the card's question and usual answer, with its sources' titles and years from their public records.
 */
export const ATLAS_PUBLICATION_SCHEMA_V2 = "askrigor.atlas-publication.v2";
/** The longest card question and usual answer a publication takes: the card's own bounds. */
export const ATLAS_PUBLISHED_QUESTION_MAX_CHARACTERS = 300;
export const ATLAS_PUBLISHED_USUAL_ANSWER_MAX_CHARACTERS = 400;

/**
 * The research behind each finding, and what people report (owner answer 252a, 5 November 2026; plan
 * docs/superpowers/plans/2026-11-05-atlas-research-behind.md): version 2's fields, and for each source the paper's own
 * sentence and conclusion found word for word in a text AskRigor fetched itself, with the strongest thing against it in
 * AskRigor's words; how each source was read; which source each figure comes from; each source's retraction status; and
 * the forum signal: the communities and the threads read, people's outcomes counted, how good their reports are, a way it
 * could work and how studies relate to the reports. A version 3 finding may rest on its forum signal alone.
 */
export const ATLAS_PUBLICATION_SCHEMA_V3 = "askrigor.atlas-publication.v3";
/** A source's retraction status as published: one a provider read (a status none could read is left out). */
export const ATLAS_PUBLISHED_RETRACTIONS = [
  "none_found", "corrected_or_updated", "expression_of_concern", "retracted", "not_applicable",
] as const;
export type AtlasPublishedRetraction = typeof ATLAS_PUBLISHED_RETRACTIONS[number];

/** A source's title and year from its public record (Crossref, PubMed, Europe PMC or ClinicalTrials.gov). */
export const atlasPublishedSourceDetailSchema = z.object({
  /** The source as the publication's sources give it. */
  source: publishedText(300),
  title: publishedText(500),
  year: z.number().int().min(1500).max(2200).nullable(),
  /** Version 3: its retraction status, as the title lookup read it from Crossref's update markers and PubMed. */
  retraction: z.enum(ATLAS_PUBLISHED_RETRACTIONS).optional(),
}).strict();
export type AtlasPublishedSourceDetail = z.infer<typeof atlasPublishedSourceDetailSchema>;

// The research behind a finding as a publication holds it (atlas-research.ts), under the publication's text check.
const publishedResearch = atlasResearchSchemas(publishedText);
/** One backing line as published: at least one quote, each with the section it was found in when known. */
export const atlasPublishedBackingSchema = publishedResearch.backing;
export type AtlasPublishedBacking = z.infer<typeof atlasPublishedBackingSchema>;
/** What people report, as published: AskRigor's counts and words and the threads' links, never a forum text or name. */
export const atlasPublishedForumSignalSchema = publishedResearch.forumSignal;
export type AtlasPublishedForumSignal = z.infer<typeof atlasPublishedForumSignalSchema>;

/**
 * What the Atlas publishes of one finding, projected from the stored card: the card's topic; the finding's claim,
 * certainty, whom it applies to, kind, subject and its type, direction, numbers block (null when the card declares
 * none), searches for a search that found nothing (null when the card declares none), source identifiers, why it is not
 * the usual answer and what would change it; its verified bases; the day the card was saved; and the AskRigor version
 * from the card's stamp. Version 2 adds the card's question and usual answer, and its sources' titles and years where a
 * public record gave them. Never the ARF number, the account or contributor, the thread key, the answer quote, the
 * surface or the reported model: the schema is strict and has no field for them.
 */
export const atlasPublishedFindingSchema = z.object({
  schema: z.enum([ATLAS_PUBLICATION_SCHEMA, ATLAS_PUBLICATION_SCHEMA_V2, ATLAS_PUBLICATION_SCHEMA_V3]),
  topic: z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
    label: publishedText(200),
  }).strict().nullable(),
  claim: publishedText(500),
  certainty: z.enum(ATLAS_CERTAINTIES),
  applies_to: publishedText(300),
  kind: z.enum(ATLAS_FINDING_KINDS).nullable(),
  subject: publishedText(ATLAS_SUBJECT_MAX_CHARACTERS).nullable(),
  subject_type: z.enum(ATLAS_SUBJECT_TYPES).nullable(),
  direction: z.enum(ATLAS_FINDING_DIRECTIONS).nullable(),
  numbers: z.array(atlasPublishedNumberSchema).max(20).nullable(),
  searches: z.array(z.object({
    database: z.enum(ATLAS_SEARCH_DATABASES),
    query: publishedText(ATLAS_SEARCH_QUERY_MAX_CHARACTERS),
    date_range: z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    }).strict().optional(),
  }).strict()).max(ATLAS_SEARCHES_PER_FINDING).nullable(),
  // At least one, except a version 3 finding resting on its forum signal alone (checked below).
  sources: z.array(publishedText(300)).max(10),
  why_not_usual: publishedText(300),
  what_would_change_it: publishedText(300),
  verified_bases: z.array(z.enum(ATLAS_VERIFIED_BASES)).max(ATLAS_VERIFIED_BASES.length)
    .refine((bases) => new Set(bases).size === bases.length, { message: "each basis once" }),
  saved_on: isoDateSchema,
  askrigor_version: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u),
  question: publishedText(ATLAS_PUBLISHED_QUESTION_MAX_CHARACTERS).optional(),
  usual_answer: publishedText(ATLAS_PUBLISHED_USUAL_ANSWER_MAX_CHARACTERS).optional(),
  source_details: z.array(atlasPublishedSourceDetailSchema).max(10).optional(),
  // Version 3 (owner answer 252a).
  backing: z.array(atlasPublishedBackingSchema).min(1).max(ATLAS_PUBLISHED_BACKING_PER_FINDING).optional(),
  source_reading: z.array(publishedResearch.reading).min(1).max(10).optional(),
  forum_signal: atlasPublishedForumSignalSchema.optional(),
}).strict().superRefine((published, context) => {
  // Versions 2 and 3 always have the card's question and usual answer; version 1 has none of version 2's fields, and
  // versions 1 and 2 none of version 3's.
  const v3 = published.schema === ATLAS_PUBLICATION_SCHEMA_V3;
  const v2 = published.schema === ATLAS_PUBLICATION_SCHEMA_V2 || v3;
  for (const key of ["question", "usual_answer"] as const) {
    if (v2 !== (published[key] !== undefined)) {
      context.addIssue({ code: "custom", path: [key], message: v2 ? "version 2 has it" : "version 1 has no such field" });
    }
  }
  if (!v2 && published.source_details !== undefined) {
    context.addIssue({ code: "custom", path: ["source_details"], message: "version 1 has no such field" });
  }
  const versionThree = [
    ...(published.backing === undefined ? [] : ["backing"]),
    ...(published.source_reading === undefined ? [] : ["source_reading"]),
    ...(published.forum_signal === undefined ? [] : ["forum_signal"]),
    ...((published.numbers ?? []).some(({ source }) => source !== undefined) ? ["numbers"] : []),
    ...((published.source_details ?? []).some(({ retraction }) => retraction !== undefined) ? ["source_details"] : []),
  ];
  if (!v3 && versionThree.length > 0) {
    for (const key of versionThree) context.addIssue({ code: "custom", path: [key], message: "only version 3 has it" });
  }
  if (published.sources.length === 0 && !(v3 && published.forum_signal !== undefined)) {
    context.addIssue({ code: "custom", path: ["sources"], message: "a source, unless it rests on its forum signal alone" });
  }
  const named = (published.source_details ?? []).map(({ source }) => source);
  if (named.some((source) => !published.sources.includes(source)) || new Set(named).size !== named.length) {
    context.addIssue({ code: "custom", path: ["source_details"], message: "each detail names one published source, once" });
  }
  // Every source a version 3 field names is a published source, and a source is read once.
  const named3 = [
    ...(published.backing ?? []).map(({ source }) => source),
    ...(published.source_reading ?? []).map(({ source }) => source),
    ...(published.numbers ?? []).flatMap(({ source }) => source === undefined ? [] : [source]),
  ];
  if (named3.some((source) => !published.sources.includes(source))) {
    context.addIssue({ code: "custom", path: ["backing"], message: "each line, reading and figure names a published source" });
  }
  const read = (published.source_reading ?? []).map(({ source }) => source);
  if (new Set(read).size !== read.length) {
    context.addIssue({ code: "custom", path: ["source_reading"], message: "each source read once" });
  }
});
export type AtlasPublishedFinding = z.infer<typeof atlasPublishedFindingSchema>;

// The store ---------------------------------------------------------------------------------------------------------

/** One finding to publish, with the state it starts in. */
export interface AtlasPublicationDraft {
  /** The finding's place on the stored card, from 1. */
  findingNumber: number;
  /** unreviewed or held for a card the owner has not decided; accepted or edited for a finding already accepted. */
  state: "unreviewed" | "held" | "accepted" | "edited";
  /** With accepted or edited: the F number the decision took. */
  atlasNumber: string | null;
  /** With held: why. */
  heldBecause: AtlasPublicationHoldReason[] | null;
  published: AtlasPublishedFinding;
}

export interface AtlasPublishInput {
  /** The card's issue number, for moderation; never in the published fields. */
  cardNumber: number;
  /** The digest finalize_research signed of the card: with each finding's place, what makes publishing idempotent. */
  cardSha256: string;
  findings: AtlasPublicationDraft[];
  publishedAt: string;
  /**
   * The owner's choice of a card (publish_cards): a finding withdrawn because its card was set aside or replaced, or
   * the owner unpublished it, is published again, unless its texts were erased or its card forgotten.
   */
  revive: boolean;
}

export interface AtlasPublicationView {
  /** P-1001 onward, never an ARF number. */
  publicationNumber: string;
  cardNumber: number;
  /** Null once the card is forgotten (decision 7). */
  cardSha256: string | null;
  findingNumber: number;
  state: AtlasPublicationState;
  atlasNumber: string | null;
  heldBecause: AtlasPublicationHoldReason[] | null;
  withdrawnBecause: AtlasPublicationWithdrawnReason | null;
  /** The owner's private reason for unpublishing it. */
  ownerReason: string | null;
  /** Null once erased: its card was forgotten, or its F number's wording erased (decision 7). */
  published: AtlasPublishedFinding | null;
  publishedAt: string;
  stateChangedAt: string;
  cardForgottenAt: string | null;
  textsErasedAt: string | null;
}

export interface AtlasPublishedRow extends AtlasPublicationView {
  /** published: a new row; existing: it was published before and is as it was; revived: published again. */
  outcome: "published" | "existing" | "revived";
}

export interface AtlasPublicationQuery {
  states?: readonly AtlasPublicationState[];
  cardNumbers?: readonly number[];
  publicationNumbers?: readonly string[];
  atlasNumbers?: readonly string[];
  /** Newest first: only publications whose number is below this one. */
  before?: number;
  /** At most ATLAS_PUBLICATIONS_PER_INSPECT; 100 by default. */
  limit?: number;
}

export interface AtlasPublicationDecision {
  cardNumber: number;
  findingNumber: number;
  state: "accepted" | "edited" | "rejected";
  /** The F number of an accepted or edited finding; null for a rejected one. */
  atlasNumber: string | null;
  decidedAt: string;
}

export type AtlasPublicationWithdrawal =
  | { reason: "card_forgotten" | "card_set_aside" | "card_replaced"; cardNumbers: readonly number[]; withdrawnAt: string }
  | { reason: "owner_unpublished"; publicationNumbers: readonly string[]; ownerReason: string; withdrawnAt: string };

/** Migration 0021's six review-role functions, in TypeScript. */
export interface AtlasPublicationStore {
  /** Publishes a card's findings, idempotently by the card's digest and each finding's place. */
  publish(input: AtlasPublishInput): Promise<AtlasPublishedRow[]>;
  inspect(query: AtlasPublicationQuery): Promise<AtlasPublicationView[]>;
  /** The owner's decision on a card's finding: its publications not withdrawn become accepted, edited or rejected. */
  decide(decision: AtlasPublicationDecision): Promise<AtlasPublicationView[]>;
  /** An edit after acceptance: the publications naming the F number move from accepted to edited. */
  markEdited(atlasNumber: string, editedAt: string): Promise<AtlasPublicationView[]>;
  withdraw(withdrawal: AtlasPublicationWithdrawal): Promise<AtlasPublicationView[]>;
  /** Decision 7: the published fields of the publications naming the F number are erased. */
  eraseTexts(atlasNumber: string, erasedAt: string): Promise<AtlasPublicationView[]>;
  /**
   * Owner answers 229a and 231a: keeps publications for AskRigor's research only (in the lookup, with their pages, but
   * on no list), with the owner's private reason, or shows them again. NOT_KEEPABLE, and nothing changed, when one of
   * them is held, rejected, forgotten, set aside or replaced.
   */
  keep(change: AtlasKeepChange): Promise<AtlasKeptView[]>;
  /** Every publication kept for research only. */
  inspectKept(): Promise<AtlasKeptView[]>;
  /**
   * The owner, 6 Nov 2026: marks publications as challenging the usual view (or clears their marks), by P number.
   * Marking shows nothing. NOT_MARKABLE, and nothing changed, when one to be marked is held, rejected or withdrawn;
   * NOT_CLEARABLE, and nothing changed, when one to be cleared shows unreviewed, not kept, with the verdict headline or
   * fail, which only its mark explains (the review of #422).
   */
  markChallenges(change: AtlasChallengeChange): Promise<AtlasChallengeView[]>;
  /** Every publication that carries a challenge mark, kept for research or not. */
  inspectChallenges(): Promise<AtlasChallengeView[]>;
}

/**
 * The quick-answer test's verdicts (docs/atlas-quick-answer-test.md): pass, the finding is really better than a quick AI
 * answer; headline, true and not in it but changing no important decision; fail, the quick answer already gives it.
 */
export const ATLAS_CHALLENGE_VERDICTS = ["pass", "headline", "fail"] as const;
export type AtlasChallengeVerdict = typeof ATLAS_CHALLENGE_VERDICTS[number];
/** The bounds migration 0030 holds the mark to. */
export const ATLAS_CHALLENGE_USUAL_VIEW_MAX_CHARACTERS = 300;
export const ATLAS_CHALLENGE_SOURCE_LABEL_MAX_CHARACTERS = 200;
export const ATLAS_CHALLENGE_SOURCE_URL_MAX_CHARACTERS = 2_000;
export const ATLAS_CHALLENGE_NUMBERS_PER_CALL = 100;
/** Who marked it: the reviewer login's digest, never the login. */
export const ATLAS_CHALLENGE_MARKER = /^reviewer:[0-9a-f]{16}$/u;

/**
 * A finding that goes against the usual view (the owner, 6 November 2026): the usual view in one plain line, its source
 * (the words a page shows for it and an https link), and the quick-answer test's verdict for the finding.
 */
export interface AtlasChallengeMark {
  usualView: string;
  sourceUrl: string;
  sourceLabel: string;
  verdict: AtlasChallengeVerdict;
}

/** Publications to mark (mark given, with who marks them) or to clear (mark and markedBy null), by P number. */
export interface AtlasChallengeChange {
  publicationNumbers: readonly string[];
  mark: AtlasChallengeMark | null;
  markedBy: string | null;
  at: string;
}

export interface AtlasChallengeView {
  publicationNumber: string;
  state: AtlasPublicationState;
  atlasNumber: string | null;
  kept: boolean;
  /** Its mark, with who marked it and when; null when it carries none. */
  mark: (AtlasChallengeMark & { markedBy: string; markedAt: string }) | null;
}

// Control characters, and the format characters (Unicode's Cf: the text-direction controls, the zero-width spaces and
// the like), which can make a text show something other than it holds (the review of #422), but for the zero-width
// non-joiner and joiner (U+200C, U+200D), which Persian, the Indian scripts and emoji sequences need (its third round).
const CHALLENGE_CONTROL = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u;

/**
 * Whether a mark is as migration 0030 holds it: trimmed one-line texts within their bounds, with no control or format
 * character but the two joiners, an https link with neither, and a verdict.
 */
export function validChallengeMark(mark: AtlasChallengeMark): boolean {
  const line = (text: unknown, max: number) => typeof text === "string" && text === text.trim() && text.length >= 1 &&
    text.length <= max && !CHALLENGE_CONTROL.test(text);
  let https = false;
  try {
    https = new URL(mark.sourceUrl).protocol === "https:";
  } catch {
    https = false;
  }
  return line(mark.usualView, ATLAS_CHALLENGE_USUAL_VIEW_MAX_CHARACTERS) &&
    line(mark.sourceLabel, ATLAS_CHALLENGE_SOURCE_LABEL_MAX_CHARACTERS) && https &&
    /^https:\/\/[^\s\p{Cc}\p{Cf}]+$/u.test(mark.sourceUrl) && mark.sourceUrl.length <= ATLAS_CHALLENGE_SOURCE_URL_MAX_CHARACTERS &&
    (ATLAS_CHALLENGE_VERDICTS as readonly string[]).includes(mark.verdict);
}

/**
 * Whether a publication shows only because it challenges the usual view: unreviewed, not kept, with a verdict other than
 * pass, which its page states (a quick AI answer may already give it). Its mark can't be cleared while it shows, or its
 * page would say a quick AI answer misses it (the review of #422): keep it for research first.
 */
export function shownForItsChallenge(state: AtlasPublicationState, kept: boolean, verdict: string | null | undefined): boolean {
  return state === "unreviewed" && !kept && verdict !== undefined && verdict !== null && verdict !== "pass";
}

function validateChallenge(change: AtlasChallengeChange): void {
  const count = change.publicationNumbers.length;
  const marked = change.mark === null ? change.markedBy === null
    : validChallengeMark(change.mark) && typeof change.markedBy === "string" && ATLAS_CHALLENGE_MARKER.test(change.markedBy);
  if (count < 1 || count > ATLAS_CHALLENGE_NUMBERS_PER_CALL || !marked || !validInstant(change.at) ||
    !change.publicationNumbers.every((number) => PUBLICATION_NUMBER.test(number))) throw invalid();
}

/** Publications to keep for research only (keep true, with a reason) or to show again (keep false). */
export interface AtlasKeepChange {
  publicationNumbers: readonly string[];
  /** Every publication naming each F number. */
  atlasNumbers: readonly string[];
  keep: boolean;
  reason: string | null;
  at: string;
}

export interface AtlasKeptView {
  publicationNumber: string;
  state: AtlasPublicationState;
  atlasNumber: string | null;
  kept: boolean;
  /** The owner's private reason; only from inspectKept. */
  reason: string | null;
  keptAt: string | null;
}

/** The most numbers one keep takes, as migration 0024 does. */
export const ATLAS_KEEP_NUMBERS_PER_CALL = 100;

function validateKeep(change: AtlasKeepChange): void {
  const count = change.publicationNumbers.length + change.atlasNumbers.length;
  const reasonOk = change.keep
    ? typeof change.reason === "string" && change.reason === change.reason.trim() && change.reason.length >= 1 &&
      change.reason.length <= 2_000
    : change.reason === null;
  if (count < 1 || count > ATLAS_KEEP_NUMBERS_PER_CALL || !reasonOk || !validInstant(change.at) ||
    !change.publicationNumbers.every((number) => PUBLICATION_NUMBER.test(number)) ||
    !change.atlasNumbers.every((number) => ATLAS_NUMBER.test(number))) throw invalid();
}

export class AtlasPublicationError extends Error {
  constructor(readonly code: "INPUT_INVALID" | "NOT_KEEPABLE" | "NOT_MARKABLE" | "NOT_CLEARABLE",
    message = "The Atlas publication request is not valid.") {
    super(message);
  }
}

const invalid = () => new AtlasPublicationError("INPUT_INVALID");
const validInstant = (value: string) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const validCard = (card: number) => Number.isSafeInteger(card) && card >= 1 && card <= 2_147_483_647;

/** The publication number's numeric part, for ordering and paging. */
export function atlasPublicationOrder(publicationNumber: string): number {
  return Number(publicationNumber.slice(2));
}

/** A held finding's reasons, once each in their listed order; the store refuses any other list. */
function validHeldReasons(reasons: readonly string[] | null): boolean {
  return reasons === null || (reasons.length >= 1 && reasons.length <= ATLAS_PUBLICATION_HOLD_REASONS.length &&
    new Set(reasons).size === reasons.length &&
    reasons.every((reason) => (ATLAS_PUBLICATION_HOLD_REASONS as readonly string[]).includes(reason)));
}

/**
 * The exact input checks publish_atlas_findings() makes, and the published fields' schema, so both stores refuse the
 * same requests. Returns the drafts with their published fields as parsed, which is what the stores keep.
 */
function validatePublishInput(input: AtlasPublishInput): AtlasPublicationDraft[] {
  if (!validCard(input.cardNumber) || !SHA256_HEX.test(input.cardSha256) || !validInstant(input.publishedAt) ||
    typeof input.revive !== "boolean" || !Array.isArray(input.findings) || input.findings.length < 1 ||
    input.findings.length > 5 || new Set(input.findings.map(({ findingNumber }) => findingNumber)).size !== input.findings.length) {
    throw invalid();
  }
  return input.findings.map((draft) => {
    const accepted = draft.state === "accepted" || draft.state === "edited";
    if (!Number.isInteger(draft.findingNumber) || draft.findingNumber < 1 || draft.findingNumber > 5 ||
      !["unreviewed", "held", "accepted", "edited"].includes(draft.state) ||
      accepted !== (draft.atlasNumber !== null) || (draft.atlasNumber !== null && !ATLAS_NUMBER.test(draft.atlasNumber)) ||
      (draft.state === "held") !== (draft.heldBecause !== null) || !validHeldReasons(draft.heldBecause)) {
      throw invalid();
    }
    const parsed = atlasPublishedFindingSchema.safeParse(draft.published);
    if (!parsed.success) throw invalid();
    try {
      assertNoProhibitedPersistentKeys(parsed.data);
    } catch {
      throw invalid();
    }
    return { ...draft, heldBecause: draft.heldBecause === null ? null : [...draft.heldBecause], published: parsed.data };
  });
}

function validateQuery(query: AtlasPublicationQuery): Required<Pick<AtlasPublicationQuery, "limit">> & AtlasPublicationQuery {
  const limit = query.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > ATLAS_PUBLICATIONS_PER_INSPECT ||
    (query.before !== undefined && (!Number.isSafeInteger(query.before) || query.before < 1)) ||
    (query.states !== undefined && !query.states.every((state) => (ATLAS_PUBLICATION_STATES as readonly string[]).includes(state))) ||
    (query.cardNumbers !== undefined && !query.cardNumbers.every(validCard)) ||
    (query.publicationNumbers !== undefined && !query.publicationNumbers.every((number) => PUBLICATION_NUMBER.test(number))) ||
    (query.atlasNumbers !== undefined && !query.atlasNumbers.every((number) => ATLAS_NUMBER.test(number)))) {
    throw invalid();
  }
  return { ...query, limit };
}

function validateDecision(decision: AtlasPublicationDecision): void {
  if (!validCard(decision.cardNumber) || !Number.isInteger(decision.findingNumber) || decision.findingNumber < 1 ||
    decision.findingNumber > 5 || !["accepted", "edited", "rejected"].includes(decision.state) ||
    (decision.state === "rejected") !== (decision.atlasNumber === null) ||
    (decision.atlasNumber !== null && !ATLAS_NUMBER.test(decision.atlasNumber)) || !validInstant(decision.decidedAt)) {
    throw invalid();
  }
}

function validateWithdrawal(withdrawal: AtlasPublicationWithdrawal): void {
  if (!validInstant(withdrawal.withdrawnAt)) throw invalid();
  if (withdrawal.reason === "owner_unpublished") {
    const reason = withdrawal.ownerReason;
    if (withdrawal.publicationNumbers.length < 1 || withdrawal.publicationNumbers.length > ATLAS_PUBLICATIONS_PER_UNPUBLISH ||
      !withdrawal.publicationNumbers.every((number) => PUBLICATION_NUMBER.test(number)) || typeof reason !== "string" ||
      reason !== reason.trim() || reason.length < 1 || reason.length > 2_000) {
      throw invalid();
    }
    return;
  }
  if (!(ATLAS_PUBLICATION_WITHDRAWN_REASONS as readonly string[]).includes(withdrawal.reason) ||
    withdrawal.cardNumbers.length < 1 || withdrawal.cardNumbers.length > ATLAS_PUBLICATION_CARDS_PER_WITHDRAWAL ||
    !withdrawal.cardNumbers.every(validCard)) {
    throw invalid();
  }
}

function validateAtlasNumber(atlasNumber: string, at: string): void {
  if (!ATLAS_NUMBER.test(atlasNumber) || !validInstant(at)) throw invalid();
}

const later = (left: string, right: string) => Date.parse(left) >= Date.parse(right) ? left : right;
const iso = (value: string) => new Date(value).toISOString();

/**
 * The publication store in memory, with the semantics of migration 0021's functions, for tests and the hermetic
 * scenarios.
 */
export class InMemoryAtlasPublicationStore implements AtlasPublicationStore {
  private readonly rows: AtlasPublicationView[] = [];
  private nextNumber = 1_001;

  async publish(input: AtlasPublishInput): Promise<AtlasPublishedRow[]> {
    const drafts = validatePublishInput(input);
    const at = iso(input.publishedAt);
    const outcomes = new Map<number, AtlasPublishedRow["outcome"]>();
    for (const draft of drafts) {
      const existing = this.rows.find((row) => row.cardSha256 === input.cardSha256 && row.findingNumber === draft.findingNumber);
      if (existing === undefined) {
        this.rows.push({
          publicationNumber: `P-${this.nextNumber++}`,
          cardNumber: input.cardNumber,
          cardSha256: input.cardSha256,
          findingNumber: draft.findingNumber,
          state: draft.state,
          atlasNumber: draft.atlasNumber,
          heldBecause: draft.heldBecause,
          withdrawnBecause: null,
          ownerReason: null,
          published: structuredClone(draft.published),
          publishedAt: at,
          stateChangedAt: at,
          cardForgottenAt: null,
          textsErasedAt: null,
        });
        outcomes.set(draft.findingNumber, "published");
      } else if (input.revive && existing.state === "withdrawn" && existing.withdrawnBecause !== null &&
        existing.withdrawnBecause !== "card_forgotten" && existing.textsErasedAt === null &&
        existing.cardForgottenAt === null) {
        Object.assign(existing, {
          state: draft.state,
          atlasNumber: draft.atlasNumber,
          heldBecause: draft.heldBecause,
          withdrawnBecause: null,
          ownerReason: null,
          published: structuredClone(draft.published),
          cardNumber: input.cardNumber,
          stateChangedAt: later(at, existing.stateChangedAt),
        });
        outcomes.set(draft.findingNumber, "revived");
      } else {
        outcomes.set(draft.findingNumber, "existing");
      }
    }
    return this.rows
      .filter((row) => row.cardSha256 === input.cardSha256 && outcomes.has(row.findingNumber))
      .sort((left, right) => left.findingNumber - right.findingNumber)
      .map((row) => ({ ...structuredClone(row), outcome: outcomes.get(row.findingNumber)! }));
  }

  async inspect(raw: AtlasPublicationQuery): Promise<AtlasPublicationView[]> {
    const query = validateQuery(raw);
    return this.rows
      .filter((row) => (query.states === undefined || query.states.includes(row.state)) &&
        (query.cardNumbers === undefined || query.cardNumbers.includes(row.cardNumber)) &&
        (query.publicationNumbers === undefined || query.publicationNumbers.includes(row.publicationNumber)) &&
        (query.atlasNumbers === undefined || (row.atlasNumber !== null && query.atlasNumbers.includes(row.atlasNumber))) &&
        (query.before === undefined || atlasPublicationOrder(row.publicationNumber) < query.before))
      .sort((left, right) => atlasPublicationOrder(right.publicationNumber) - atlasPublicationOrder(left.publicationNumber))
      .slice(0, query.limit)
      .map((row) => structuredClone(row));
  }

  async decide(decision: AtlasPublicationDecision): Promise<AtlasPublicationView[]> {
    validateDecision(decision);
    const at = iso(decision.decidedAt);
    return this.change((row) => row.cardNumber === decision.cardNumber && row.findingNumber === decision.findingNumber &&
      row.cardForgottenAt === null && row.state !== "withdrawn" &&
      (row.state !== decision.state || row.atlasNumber !== decision.atlasNumber), (row) => {
      row.state = decision.state;
      row.atlasNumber = decision.atlasNumber;
      row.stateChangedAt = later(at, row.stateChangedAt);
    });
  }

  async markEdited(atlasNumber: string, editedAt: string): Promise<AtlasPublicationView[]> {
    validateAtlasNumber(atlasNumber, editedAt);
    const at = iso(editedAt);
    return this.change((row) => row.atlasNumber === atlasNumber && row.state === "accepted", (row) => {
      if (row.cardForgottenAt === null) {
        row.state = "edited";
      } else {
        row.state = "withdrawn";
        row.withdrawnBecause = "card_forgotten";
        row.published = null;
        row.textsErasedAt ??= later(at, row.publishedAt);
      }
      row.stateChangedAt = later(at, row.stateChangedAt);
    });
  }

  async withdraw(withdrawal: AtlasPublicationWithdrawal): Promise<AtlasPublicationView[]> {
    validateWithdrawal(withdrawal);
    const at = iso(withdrawal.withdrawnAt);
    if (withdrawal.reason === "card_forgotten") {
      return this.change((row) => withdrawal.cardNumbers.includes(row.cardNumber) && row.cardForgottenAt === null, (row) => {
        if (row.state !== "accepted") {
          row.state = "withdrawn";
          row.withdrawnBecause = "card_forgotten";
          row.published = null;
          row.textsErasedAt ??= later(at, row.publishedAt);
          row.stateChangedAt = later(at, row.stateChangedAt);
        }
        row.ownerReason = null;
        row.cardSha256 = null;
        row.cardForgottenAt = later(at, row.publishedAt);
      });
    }
    const live = new Set<AtlasPublicationState>(withdrawal.reason === "card_replaced"
      ? ["unreviewed", "held"]
      : ["unreviewed", "held", "accepted", "edited"]);
    return this.change((row) => row.cardForgottenAt === null && live.has(row.state) &&
      (withdrawal.reason === "owner_unpublished"
        ? withdrawal.publicationNumbers.includes(row.publicationNumber)
        : withdrawal.cardNumbers.includes(row.cardNumber)), (row) => {
      row.state = "withdrawn";
      row.withdrawnBecause = withdrawal.reason;
      row.ownerReason = withdrawal.reason === "owner_unpublished" ? withdrawal.ownerReason : null;
      row.stateChangedAt = later(at, row.stateChangedAt);
    });
  }

  async eraseTexts(atlasNumber: string, erasedAt: string): Promise<AtlasPublicationView[]> {
    validateAtlasNumber(atlasNumber, erasedAt);
    const at = iso(erasedAt);
    return this.change((row) => row.atlasNumber === atlasNumber && row.textsErasedAt === null, (row) => {
      row.published = null;
      row.textsErasedAt = later(at, row.publishedAt);
    });
  }

  /** Every row, as the table holds it: for tests. */
  allRows(): AtlasPublicationView[] {
    return this.rows.map((row) => structuredClone(row));
  }

  private readonly kept = new Map<string, { reason: string; at: string }>();

  async keep(change: AtlasKeepChange): Promise<AtlasKeptView[]> {
    validateKeep(change);
    const at = iso(change.at);
    const targets = this.rows.filter((row) => change.publicationNumbers.includes(row.publicationNumber) ||
      (row.atlasNumber !== null && change.atlasNumbers.includes(row.atlasNumber)))
      .sort((left, right) => atlasPublicationOrder(left.publicationNumber) - atlasPublicationOrder(right.publicationNumber));
    const unpublished = (row: AtlasPublicationView) => row.state === "withdrawn" &&
      row.withdrawnBecause === "owner_unpublished" && row.atlasNumber === null && row.published !== null;
    const shown = (row: AtlasPublicationView) => (row.state === "unreviewed" && row.published !== null) ||
      row.state === "accepted" || row.state === "edited";
    if (change.keep && !targets.every((row) => unpublished(row) || shown(row))) {
      throw new AtlasPublicationError("NOT_KEEPABLE", "A publication in that state can't be kept for research.");
    }
    for (const row of targets) {
      if (!change.keep) {
        this.kept.delete(row.publicationNumber);
        continue;
      }
      if (unpublished(row)) {
        Object.assign(row, { state: "unreviewed", withdrawnBecause: null, ownerReason: null,
          stateChangedAt: at > row.stateChangedAt ? at : row.stateChangedAt });
      }
      this.kept.set(row.publicationNumber, { reason: change.reason!, at });
    }
    return targets.map((row) => ({ publicationNumber: row.publicationNumber, state: row.state, atlasNumber: row.atlasNumber,
      kept: this.kept.has(row.publicationNumber), reason: null, keptAt: null }));
  }

  async inspectKept(): Promise<AtlasKeptView[]> {
    return this.rows.filter((row) => this.kept.has(row.publicationNumber))
      .sort((left, right) => atlasPublicationOrder(left.publicationNumber) - atlasPublicationOrder(right.publicationNumber))
      .map((row) => ({ publicationNumber: row.publicationNumber, state: row.state, atlasNumber: row.atlasNumber, kept: true,
        reason: this.kept.get(row.publicationNumber)!.reason, keptAt: this.kept.get(row.publicationNumber)!.at }));
  }

  /** Whether a publication is kept for research only, for the in-memory pages. */
  isKept(publicationNumber: string): boolean {
    return this.kept.has(publicationNumber);
  }

  private readonly challenges = new Map<string, AtlasChallengeMark & { markedBy: string; markedAt: string }>();

  async markChallenges(change: AtlasChallengeChange): Promise<AtlasChallengeView[]> {
    validateChallenge(change);
    const at = iso(change.at);
    const targets = this.rows.filter((row) => change.publicationNumbers.includes(row.publicationNumber))
      .sort((left, right) => atlasPublicationOrder(left.publicationNumber) - atlasPublicationOrder(right.publicationNumber));
    const markable = (row: AtlasPublicationView) => (row.state === "unreviewed" && row.published !== null) ||
      row.state === "accepted" || row.state === "edited";
    if (change.mark !== null && !targets.every(markable)) {
      throw new AtlasPublicationError("NOT_MARKABLE", "A publication in that state can't be marked.");
    }
    if (change.mark === null && targets.some((row) => shownForItsChallenge(row.state, this.kept.has(row.publicationNumber),
      this.challenges.get(row.publicationNumber)?.verdict))) {
      throw new AtlasPublicationError("NOT_CLEARABLE", "A finding shown for its challenge can't lose its mark while it shows.");
    }
    for (const row of targets) {
      if (change.mark === null) this.challenges.delete(row.publicationNumber);
      else this.challenges.set(row.publicationNumber, { ...change.mark, markedBy: change.markedBy!, markedAt: at });
    }
    return targets.map((row) => this.challengeView(row));
  }

  async inspectChallenges(): Promise<AtlasChallengeView[]> {
    return this.rows.filter((row) => this.challenges.has(row.publicationNumber))
      .sort((left, right) => atlasPublicationOrder(left.publicationNumber) - atlasPublicationOrder(right.publicationNumber))
      .map((row) => this.challengeView(row));
  }

  /** A publication's challenge mark, for the in-memory pages; null when it carries none. */
  challengeOf(publicationNumber: string): AtlasChallengeMark | null {
    const mark = this.challenges.get(publicationNumber);
    return mark === undefined ? null
      : { usualView: mark.usualView, sourceUrl: mark.sourceUrl, sourceLabel: mark.sourceLabel, verdict: mark.verdict };
  }

  private challengeView(row: AtlasPublicationView): AtlasChallengeView {
    const mark = this.challenges.get(row.publicationNumber);
    return { publicationNumber: row.publicationNumber, state: row.state, atlasNumber: row.atlasNumber,
      kept: this.kept.has(row.publicationNumber), mark: mark === undefined ? null : { ...mark } };
  }

  private change(
    selected: (row: AtlasPublicationView) => boolean,
    apply: (row: AtlasPublicationView) => void,
  ): AtlasPublicationView[] {
    const changed = this.rows.filter(selected);
    changed.forEach(apply);
    return changed
      .sort((left, right) => atlasPublicationOrder(left.publicationNumber) - atlasPublicationOrder(right.publicationNumber))
      .map((row) => structuredClone(row));
  }
}

// PostgreSQL ----------------------------------------------------------------------------------------------------------

const PUBLICATION_COLUMNS = "publication_number, card_number, card_sha256, finding_number, published_json, state, " +
  "atlas_number, held_because, withdrawn_because, owner_reason, published_at, state_changed_at, card_forgotten_at, " +
  "texts_erased_at";

/** The publication store through the review role's six SECURITY DEFINER functions; it reads no table directly. */
export class PostgresAtlasPublicationStore implements AtlasPublicationStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async publish(input: AtlasPublishInput): Promise<AtlasPublishedRow[]> {
    const drafts = validatePublishInput(input);
    const result = await this.call<PublicationRow & { outcome: AtlasPublishedRow["outcome"] }>(
      `SELECT ${PUBLICATION_COLUMNS}, outcome FROM ${this.schema}.publish_atlas_findings(
         $1::integer, $2::text, $3::jsonb, $4::timestamptz, $5::boolean
       )`,
      [input.cardNumber, input.cardSha256, JSON.stringify(drafts), input.publishedAt, input.revive],
    );
    return result.rows.map((row) => ({ ...publicationFromRow(row), outcome: row.outcome }));
  }

  async inspect(raw: AtlasPublicationQuery): Promise<AtlasPublicationView[]> {
    const query = validateQuery(raw);
    const result = await this.call<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS} FROM ${this.schema}.inspect_atlas_publications(
         $1::text[], $2::integer[], $3::text[], $4::text[], $5::bigint, $6::integer
       )`,
      [
        query.states === undefined ? null : [...query.states],
        query.cardNumbers === undefined ? null : [...query.cardNumbers],
        query.publicationNumbers === undefined ? null : [...query.publicationNumbers],
        query.atlasNumbers === undefined ? null : [...query.atlasNumbers],
        query.before ?? null,
        query.limit,
      ],
    );
    return result.rows.map(publicationFromRow);
  }

  async decide(decision: AtlasPublicationDecision): Promise<AtlasPublicationView[]> {
    validateDecision(decision);
    const result = await this.call<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS} FROM ${this.schema}.decide_atlas_publications(
         $1::integer, $2::integer, $3::text, $4::text, $5::timestamptz
       )`,
      [decision.cardNumber, decision.findingNumber, decision.state, decision.atlasNumber, decision.decidedAt],
    );
    return result.rows.map(publicationFromRow);
  }

  async markEdited(atlasNumber: string, editedAt: string): Promise<AtlasPublicationView[]> {
    validateAtlasNumber(atlasNumber, editedAt);
    const result = await this.call<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS} FROM ${this.schema}.edit_atlas_publications($1::text, $2::timestamptz)`,
      [atlasNumber, editedAt],
    );
    return result.rows.map(publicationFromRow);
  }

  async withdraw(withdrawal: AtlasPublicationWithdrawal): Promise<AtlasPublicationView[]> {
    validateWithdrawal(withdrawal);
    const byNumber = withdrawal.reason === "owner_unpublished";
    const result = await this.call<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS} FROM ${this.schema}.withdraw_atlas_publications(
         $1::integer[], $2::text[], $3::text, $4::text, $5::timestamptz
       )`,
      [
        byNumber ? null : [...withdrawal.cardNumbers],
        byNumber ? [...withdrawal.publicationNumbers] : null,
        withdrawal.reason,
        byNumber ? withdrawal.ownerReason : null,
        withdrawal.withdrawnAt,
      ],
    );
    return result.rows.map(publicationFromRow);
  }

  async eraseTexts(atlasNumber: string, erasedAt: string): Promise<AtlasPublicationView[]> {
    validateAtlasNumber(atlasNumber, erasedAt);
    const result = await this.call<PublicationRow>(
      `SELECT ${PUBLICATION_COLUMNS} FROM ${this.schema}.erase_atlas_publication_texts($1::text, $2::timestamptz)`,
      [atlasNumber, erasedAt],
    );
    return result.rows.map(publicationFromRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async keep(change: AtlasKeepChange): Promise<AtlasKeptView[]> {
    validateKeep(change);
    const result = await this.call<{ kept_publication_number: string; kept_state: AtlasPublicationState;
      kept_atlas_number: string | null; kept: boolean }>(
      `SELECT * FROM ${this.schema}.keep_atlas_publications($1::text[], $2::text[], $3::boolean, $4::text, $5::timestamptz)`,
      [[...change.publicationNumbers], [...change.atlasNumbers], change.keep, change.reason, change.at]);
    return result.rows.map((row) => ({ publicationNumber: row.kept_publication_number, state: row.kept_state,
      atlasNumber: row.kept_atlas_number, kept: row.kept, reason: null, keptAt: null }));
  }

  async inspectKept(): Promise<AtlasKeptView[]> {
    const result = await this.call<{ kept_publication_number: string; kept_state: AtlasPublicationState;
      kept_atlas_number: string | null; kept_reason: string; kept_at: Date | string }>(
      `SELECT * FROM ${this.schema}.inspect_atlas_kept_publications()`, []);
    return result.rows.map((row) => ({ publicationNumber: row.kept_publication_number, state: row.kept_state,
      atlasNumber: row.kept_atlas_number, kept: true, reason: row.kept_reason, keptAt: instant(row.kept_at) }));
  }

  async markChallenges(change: AtlasChallengeChange): Promise<AtlasChallengeView[]> {
    validateChallenge(change);
    const mark = change.mark;
    const result = await this.call<ChallengeRow>(
      `SELECT * FROM ${this.schema}.mark_atlas_challenges($1::text[], $2::text, $3::text, $4::text, $5::text, $6::text, ` +
        "$7::timestamptz)",
      [[...change.publicationNumbers], mark?.usualView ?? null, mark?.sourceUrl ?? null, mark?.sourceLabel ?? null,
        mark?.verdict ?? null, change.markedBy, change.at]);
    return result.rows.map(challengeFromRow);
  }

  async inspectChallenges(): Promise<AtlasChallengeView[]> {
    const result = await this.call<ChallengeRow>(`SELECT * FROM ${this.schema}.inspect_atlas_challenges()`, []);
    return result.rows.map(challengeFromRow);
  }

  private async call<Row extends object>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> {
    try {
      return await this.pool.query(sql, values) as unknown as { rows: Row[] };
    } catch (error) {
      if (error instanceof Error && error.message.includes("ATLAS_PUBLICATION_INPUT_INVALID")) throw invalid();
      if (error instanceof Error && error.message.includes("ATLAS_PUBLICATION_NOT_KEEPABLE")) {
        throw new AtlasPublicationError("NOT_KEEPABLE", "A publication in that state can't be kept for research.");
      }
      if (error instanceof Error && error.message.includes("ATLAS_PUBLICATION_NOT_MARKABLE")) {
        throw new AtlasPublicationError("NOT_MARKABLE", "A publication in that state can't be marked.");
      }
      if (error instanceof Error && error.message.includes("ATLAS_PUBLICATION_NOT_CLEARABLE")) {
        throw new AtlasPublicationError("NOT_CLEARABLE",
          "A finding shown for its challenge can't lose its mark while it shows.");
      }
      throw error;
    }
  }
}

/** A row of migration 0030's two functions. */
interface ChallengeRow {
  mark_publication_number: string;
  mark_state: string;
  mark_atlas_number: string | null;
  mark_kept: boolean;
  mark_usual_view: string | null;
  mark_source_url: string | null;
  mark_source_label: string | null;
  mark_verdict: string | null;
  mark_marked_by: string | null;
  mark_marked_at: Date | string | null;
}

/** A row as the store returns it, its mark read again strictly, so a row that does not read is refused. */
function challengeFromRow(row: ChallengeRow): AtlasChallengeView {
  const view = {
    publicationNumber: row.mark_publication_number,
    state: z.enum(ATLAS_PUBLICATION_STATES).parse(row.mark_state),
    atlasNumber: row.mark_atlas_number,
    kept: row.mark_kept === true,
  };
  if (row.mark_marked_at === null) return { ...view, mark: null };
  const mark = { usualView: row.mark_usual_view, sourceUrl: row.mark_source_url, sourceLabel: row.mark_source_label,
    verdict: row.mark_verdict } as AtlasChallengeMark;
  if (!validChallengeMark(mark) || typeof row.mark_marked_by !== "string" || !ATLAS_CHALLENGE_MARKER.test(row.mark_marked_by)) {
    throw invalid();
  }
  return { ...view, mark: { ...mark, markedBy: row.mark_marked_by, markedAt: instant(row.mark_marked_at) } };
}

interface PublicationRow {
  publication_number: string;
  card_number: number;
  card_sha256: string | null;
  finding_number: number;
  published_json: unknown;
  state: AtlasPublicationState;
  atlas_number: string | null;
  held_because: unknown;
  withdrawn_because: AtlasPublicationWithdrawnReason | null;
  owner_reason: string | null;
  published_at: Date | string;
  state_changed_at: Date | string;
  card_forgotten_at: Date | string | null;
  texts_erased_at: Date | string | null;
}

const heldReasonsSchema = z.array(z.enum(ATLAS_PUBLICATION_HOLD_REASONS)).min(1).max(ATLAS_PUBLICATION_HOLD_REASONS.length);
const instant = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

/** A row as the store returns it: its published fields parsed again, so a row that does not read is refused. */
function publicationFromRow(row: PublicationRow): AtlasPublicationView {
  return {
    publicationNumber: row.publication_number,
    cardNumber: Number(row.card_number),
    cardSha256: row.card_sha256,
    findingNumber: Number(row.finding_number),
    state: z.enum(ATLAS_PUBLICATION_STATES).parse(row.state),
    atlasNumber: row.atlas_number,
    heldBecause: row.held_because === null ? null : heldReasonsSchema.parse(row.held_because),
    withdrawnBecause: row.withdrawn_because === null ? null
      : z.enum(ATLAS_PUBLICATION_WITHDRAWN_REASONS).parse(row.withdrawn_because),
    ownerReason: row.owner_reason,
    published: row.published_json === null ? null : atlasPublishedFindingSchema.parse(row.published_json),
    publishedAt: instant(row.published_at),
    stateChangedAt: instant(row.state_changed_at),
    cardForgottenAt: row.card_forgotten_at === null ? null : instant(row.card_forgotten_at),
    textsErasedAt: row.texts_erased_at === null ? null : instant(row.texts_erased_at),
  };
}
