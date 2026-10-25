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
 * What the Atlas publishes of one finding, projected from the stored card: the card's topic; the finding's claim,
 * certainty, whom it applies to, kind, subject and its type, direction, numbers block (null when the card declares
 * none), searches for a search that found nothing (null when the card declares none), source identifiers, why it is not
 * the usual answer and what would change it; its verified bases; the day the card was saved; and the AskRigor version
 * from the card's stamp. Never the ARF number, the account or contributor, the thread key, the answer quote, the surface
 * or the reported model: the schema is strict and has no field for them.
 */
export const atlasPublishedFindingSchema = z.object({
  schema: z.literal(ATLAS_PUBLICATION_SCHEMA),
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
  sources: z.array(publishedText(300)).min(1).max(10),
  why_not_usual: publishedText(300),
  what_would_change_it: publishedText(300),
  verified_bases: z.array(z.enum(ATLAS_VERIFIED_BASES)).max(ATLAS_VERIFIED_BASES.length)
    .refine((bases) => new Set(bases).size === bases.length, { message: "each basis once" }),
  saved_on: isoDateSchema,
  askrigor_version: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/u),
}).strict();
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
}

export class AtlasPublicationError extends Error {
  constructor(readonly code: "INPUT_INVALID", message = "The Atlas publication request is not valid.") {
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

  private async call<Row extends object>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> {
    try {
      return await this.pool.query(sql, values) as unknown as { rows: Row[] };
    } catch (error) {
      if (error instanceof Error && error.message.includes("ATLAS_PUBLICATION_INPUT_INVALID")) throw invalid();
      throw error;
    }
  }
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
