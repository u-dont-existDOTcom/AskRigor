import { Pool } from "pg";
import { z } from "zod";

import {
  ATLAS_CERTAINTIES,
  ATLAS_FINDING_DIRECTIONS,
  ATLAS_FINDING_KINDS,
  ATLAS_SUBJECT_MAX_CHARACTERS,
  assertSafeAtlasSchema,
  type PostgresAtlasStoreOptions,
} from "./atlas-findings.js";

/**
 * Held YouTube findings (owner answer 173, 2026-10-25). A findings card is stored without its findings drawn from
 * YouTube comments (owner answer 170); each one left out is held here instead, apart from the card, for the owner's
 * review. A card whose findings all rest on YouTube comments is not saved as a card, and its findings are held the same
 * way, with no card number, together with the card's own general wording of the research question and its topic. The
 * owner's rule, 25 Oct: "don't delete the summaries unless YT tells us to do that". A held finding is kept until it is
 * deleted: on request, by the owner, when its card is forgotten, or with every other one at once if YouTube asks
 * AskRigor to delete them. Nothing deletes one by its age.
 *
 * A held finding holds only what AskRigor wrote: its claim, certainty, whom it applies to, why the usual answer misses
 * it, what would change it, its kind, subject and direction when the card declared them, and its tags and verified
 * bases, which are fixed values; and for a card not saved, its question and topic. Never a source, a link, the answer
 * quote, a contributor or thread key, or any comment text, name, channel, comment or video ID: there is no field for
 * them, here or in migration 0019's table. A saved card's finding is named by the card's ARF issue number, the checked
 * card's SHA-256 and its place on that card, from 1; a finding of a card not saved by the SHA-256 and its place. Held
 * findings are never published, accepted into the Atlas or offered anywhere else; only the owner's review reads them.
 */

/** The most cards, or saves not made as cards, one read or deletion names, as for forget_atlas_cards. */
export const HELD_YOUTUBE_FINDINGS_CARDS_PER_CALL = 100;
/** The most saves not made as cards one page of their held findings holds, each with up to five findings. */
export const HELD_YOUTUBE_SAVES_WITHOUT_CARD_PER_READ = 100;
/** A card finding's tags, community_checked included (the findings card's FINDING_TAGS; a test holds the two equal). */
export const HELD_YOUTUBE_FINDING_TAGS = [
  "full_text_read", "community_checked", "contradicts_common_answer", "overlooked_study", "documented_absence",
] as const;
/** The verified bases, comment_audit included (the findings card's VERIFIED_BASES; a test holds the two equal). */
export const HELD_YOUTUBE_FINDING_BASES = [
  "full_text_audit", "comment_audit", "bounded_absence", "research_correction",
] as const;

const heldText = (max: number) => z.string().min(1).max(max);
const distinct = (values: readonly unknown[]) => new Set(values).size === values.length;
const SHA256 = /^[a-f0-9]{64}$/u;

/** One held finding as it is kept: AskRigor's texts and fixed values, and nothing else. */
export const heldYouTubeFindingSchema = z.object({
  /** The finding's place on the checked card, from 1. */
  findingNumber: z.number().int().min(1).max(5),
  claim: heldText(500),
  certainty: z.enum(ATLAS_CERTAINTIES),
  appliesTo: heldText(300),
  whyNotUsual: heldText(300),
  whatWouldChangeIt: heldText(300),
  kind: z.enum(ATLAS_FINDING_KINDS).optional(),
  subject: heldText(ATLAS_SUBJECT_MAX_CHARACTERS).optional(),
  direction: z.enum(ATLAS_FINDING_DIRECTIONS).optional(),
  tags: z.array(z.enum(HELD_YOUTUBE_FINDING_TAGS)).max(HELD_YOUTUBE_FINDING_TAGS.length).refine(distinct),
  verifiedBases: z.array(z.enum(HELD_YOUTUBE_FINDING_BASES)).max(HELD_YOUTUBE_FINDING_BASES.length).refine(distinct),
}).strict();
export type HeldYouTubeFindingContent = z.output<typeof heldYouTubeFindingSchema>;

/** A card's topic, as its key and label: the card's own, AskRigor's text. */
export const heldYouTubeTopicSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,199}$/u),
  label: heldText(200),
}).strict();

/**
 * The findings one save left out of one card, with the time it was saved: under the saved card's number, or, for a
 * card whose findings all rest on YouTube comments, which is not saved as a card, with no number and the card's
 * question and its topic when it declared one.
 */
export const holdYouTubeFindingsInputSchema = z.object({
  /** The saved card's ARF issue number; absent for a card not saved as a card. */
  cardNumber: z.number().int().min(1).max(2_147_483_647).optional(),
  /** The SHA-256 of the checked card, which its finalization receipt signed. */
  cardSha256: z.string().regex(SHA256),
  /** When the card holding them was saved. */
  savedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  /** A card not saved: its own general wording of the research question. */
  question: heldText(300).optional(),
  /** A card not saved: its topic, when it declared one. */
  topic: heldYouTubeTopicSchema.optional(),
  findings: z.array(heldYouTubeFindingSchema).min(1).max(5)
    .refine((findings) => distinct(findings.map(({ findingNumber }) => findingNumber))),
}).strict().refine((input) => input.cardNumber === undefined
  ? input.question !== undefined
  : input.question === undefined && input.topic === undefined);
export type HoldYouTubeFindingsInput = z.output<typeof holdYouTubeFindingsInputSchema>;

/** Where a held finding comes from, and when it was saved, to the millisecond. */
export interface HeldYouTubeFindingKey {
  /** The saved card's ARF issue number; null for a card not saved as a card. */
  cardNumber: number | null;
  cardSha256: string;
  findingNumber: number;
  savedAt: string;
}

/** A save not made as a card, as a page of their held findings names it: its save time and checked card's SHA-256. */
export interface HeldYouTubeSaveKey {
  savedAt: string;
  cardSha256: string;
}

/** A finding a hold call left held: true when this call held it, false when it was held before (no refreshing). */
export interface HeldYouTubeFindingHold extends HeldYouTubeFindingKey {
  heldNow: boolean;
}

export type HeldYouTubeFinding = HeldYouTubeFindingContent & HeldYouTubeFindingKey & {
  /** A card not saved: its question, and its topic when it declared one. */
  question?: string;
  topic?: z.output<typeof heldYouTubeTopicSchema>;
};

export class HeldYouTubeFindingsError extends Error {
  constructor(readonly code: "INPUT_INVALID") {
    super("The held YouTube findings request is not valid.");
  }
}

/** Migration 0019's six functions, in TypeScript. */
export interface HeldYouTubeFindingsStore {
  /**
   * Holds the findings of one save, with its save time to the millisecond (one ahead of the store's clock counts from
   * now). A finding of the same card (or of no card), checked card and place held before keeps its own save time:
   * holding it again changes nothing. Returns each of the call's findings that is held after it.
   */
  hold(input: HoldYouTubeFindingsInput): Promise<HeldYouTubeFindingHold[]>;
  /** Every held finding of these saved cards, by card, then oldest save first. */
  inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]>;
  /**
   * A page of the held findings of cards not saved as cards: every held finding of the next `saves` saves (from 1 to
   * HELD_YOUTUBE_SAVES_WITHOUT_CARD_PER_READ), newest save first, by save time and then the checked card's SHA-256;
   * from the newest, or after the save `after` names. Paging on returns every one.
   */
  inspectWithoutCard(page: { after?: HeldYouTubeSaveKey; saves: number }): Promise<HeldYouTubeFinding[]>;
  /** Deletes every held finding of these saved cards; returns how many. */
  deleteForCards(cardNumbers: readonly number[]): Promise<number>;
  /** Deletes every held finding of these cards not saved, by their checked cards' SHA-256; returns how many. */
  deleteWithoutCard(cardSha256s: readonly string[]): Promise<number>;
  /** Deletes every held finding at once, of every card and every card not saved, as when YouTube asks; returns how many. */
  deleteAll(): Promise<number>;
}

function validHold(raw: HoldYouTubeFindingsInput): HoldYouTubeFindingsInput {
  const parsed = holdYouTubeFindingsInputSchema.safeParse(raw);
  if (!parsed.success) throw new HeldYouTubeFindingsError("INPUT_INVALID");
  return parsed.data;
}

function validCards(cardNumbers: readonly number[]): number[] {
  if (cardNumbers.length < 1 || cardNumbers.length > HELD_YOUTUBE_FINDINGS_CARDS_PER_CALL ||
    cardNumbers.some((card) => !Number.isSafeInteger(card) || card < 1 || card > 2_147_483_647)) {
    throw new HeldYouTubeFindingsError("INPUT_INVALID");
  }
  return [...cardNumbers];
}

function validPage(page: { after?: HeldYouTubeSaveKey; saves: number }): { after?: HeldYouTubeSaveKey; saves: number } {
  const after = page.after;
  if (!Number.isSafeInteger(page.saves) || page.saves < 1 || page.saves > HELD_YOUTUBE_SAVES_WITHOUT_CARD_PER_READ ||
    (after !== undefined && (typeof after.cardSha256 !== "string" || !SHA256.test(after.cardSha256) ||
      typeof after.savedAt !== "string" || !Number.isFinite(Date.parse(after.savedAt))))) {
    throw new HeldYouTubeFindingsError("INPUT_INVALID");
  }
  return {
    saves: page.saves,
    ...(after === undefined
      ? {}
      : { after: { savedAt: new Date(Date.parse(after.savedAt)).toISOString(), cardSha256: after.cardSha256 } }),
  };
}

function validDigests(cardSha256s: readonly string[]): string[] {
  if (cardSha256s.length < 1 || cardSha256s.length > HELD_YOUTUBE_FINDINGS_CARDS_PER_CALL ||
    cardSha256s.some((digest) => typeof digest !== "string" || !SHA256.test(digest))) {
    throw new HeldYouTubeFindingsError("INPUT_INVALID");
  }
  return [...cardSha256s];
}

const keyOf = (cardNumber: number | null, cardSha256: string, findingNumber: number) =>
  `${cardNumber ?? "none"}\u0000${cardSha256}\u0000${findingNumber}`;

/** Lower-case hexadecimal digests compared character by character, as PostgreSQL's text order compares them. */
const compareDigests = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

const compareHeld = (left: HeldYouTubeFinding, right: HeldYouTubeFinding) =>
  (left.cardNumber ?? 0) - (right.cardNumber ?? 0) || Date.parse(left.savedAt) - Date.parse(right.savedAt) ||
  compareDigests(left.cardSha256, right.cardSha256) || left.findingNumber - right.findingNumber;

/** Newest save first, then by the checked card's SHA-256: the order of the saves not made as cards. */
const newestSaveFirst = (left: HeldYouTubeSaveKey, right: HeldYouTubeSaveKey) =>
  Date.parse(right.savedAt) - Date.parse(left.savedAt) || compareDigests(left.cardSha256, right.cardSha256);

/** The store in memory, with migration 0019's semantics and an injected clock, for tests and hermetic scenarios. */
export class InMemoryHeldYouTubeFindingsStore implements HeldYouTubeFindingsStore {
  private readonly rows = new Map<string, HeldYouTubeFinding>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async hold(raw: HoldYouTubeFindingsInput): Promise<HeldYouTubeFindingHold[]> {
    const input = validHold(raw);
    const cardNumber = input.cardNumber ?? null;
    const savedAt = new Date(Math.min(Date.parse(input.savedAt), this.now().getTime())).toISOString();
    const held: HeldYouTubeFindingHold[] = [];
    for (const finding of [...input.findings].sort((left, right) => left.findingNumber - right.findingNumber)) {
      const key = keyOf(cardNumber, input.cardSha256, finding.findingNumber);
      const existing = this.rows.get(key);
      if (existing !== undefined) {
        held.push({ ...keyFields(existing), heldNow: false });
        continue;
      }
      const row: HeldYouTubeFinding = {
        ...structuredClone(finding),
        cardNumber,
        cardSha256: input.cardSha256,
        ...(input.question === undefined ? {} : { question: input.question }),
        ...(input.topic === undefined ? {} : { topic: { ...input.topic } }),
        savedAt,
      };
      this.rows.set(key, row);
      held.push({ ...keyFields(row), heldNow: true });
    }
    return held;
  }

  async inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]> {
    const cards = new Set(validCards(cardNumbers));
    return [...this.rows.values()]
      .filter((row) => row.cardNumber !== null && cards.has(row.cardNumber))
      .sort(compareHeld)
      .map((row) => structuredClone(row));
  }

  async inspectWithoutCard(raw: { after?: HeldYouTubeSaveKey; saves: number }): Promise<HeldYouTubeFinding[]> {
    const { after, saves } = validPage(raw);
    const withoutCard = [...this.rows.values()].filter((row) => row.cardNumber === null);
    const page = [...new Map(withoutCard.map((row) =>
      [`${row.savedAt}\u0000${row.cardSha256}`, { savedAt: row.savedAt, cardSha256: row.cardSha256 }])).values()]
      .filter((save) => after === undefined || newestSaveFirst(after, save) < 0)
      .sort(newestSaveFirst)
      .slice(0, saves);
    return page.flatMap((save) => withoutCard
      .filter((row) => row.savedAt === save.savedAt && row.cardSha256 === save.cardSha256)
      .sort((left, right) => left.findingNumber - right.findingNumber)
      .map((row) => structuredClone(row)));
  }

  async deleteForCards(cardNumbers: readonly number[]): Promise<number> {
    const cards = new Set(validCards(cardNumbers));
    return this.deleteWhere((row) => row.cardNumber !== null && cards.has(row.cardNumber));
  }

  async deleteWithoutCard(cardSha256s: readonly string[]): Promise<number> {
    const digests = new Set(validDigests(cardSha256s));
    return this.deleteWhere((row) => row.cardNumber === null && digests.has(row.cardSha256));
  }

  async deleteAll(): Promise<number> {
    return this.deleteWhere(() => true);
  }

  /** Every row as stored, for tests. */
  snapshot(): HeldYouTubeFinding[] {
    return [...this.rows.values()].sort(compareHeld).map((row) => structuredClone(row));
  }

  private deleteWhere(matches: (row: HeldYouTubeFinding) => boolean): number {
    let deleted = 0;
    for (const [key, row] of this.rows) {
      if (!matches(row)) continue;
      this.rows.delete(key);
      deleted += 1;
    }
    return deleted;
  }
}

function keyFields(row: HeldYouTubeFindingKey): HeldYouTubeFindingKey {
  return {
    cardNumber: row.cardNumber,
    cardSha256: row.cardSha256,
    findingNumber: row.findingNumber,
    savedAt: row.savedAt,
  };
}

interface HoldRow {
  card_number: number | null;
  card_sha256: string;
  finding_number: number;
  saved_at: Date | string;
  held_now: boolean;
}

interface HeldRow {
  card_number: number | null;
  card_sha256: string;
  finding_number: number;
  question: string | null;
  topic_key: string | null;
  topic_label: string | null;
  claim: string;
  certainty: HeldYouTubeFindingContent["certainty"];
  applies_to: string;
  why_not_usual: string;
  what_would_change_it: string;
  kind: NonNullable<HeldYouTubeFindingContent["kind"]> | null;
  subject: string | null;
  direction: NonNullable<HeldYouTubeFindingContent["direction"]> | null;
  tags: HeldYouTubeFindingContent["tags"];
  verified_bases: HeldYouTubeFindingContent["verifiedBases"];
  saved_at: Date | string;
}

function instant(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("HELD_YOUTUBE_FINDING_INSTANT_INVALID");
  return parsed.toISOString();
}

/** A finding as hold_youtube_findings() takes it: one key per column, and no other. */
function heldColumns(finding: HeldYouTubeFindingContent): Record<string, unknown> {
  return {
    finding_number: finding.findingNumber,
    claim: finding.claim,
    certainty: finding.certainty,
    applies_to: finding.appliesTo,
    why_not_usual: finding.whyNotUsual,
    what_would_change_it: finding.whatWouldChangeIt,
    ...(finding.kind === undefined ? {} : { kind: finding.kind }),
    ...(finding.subject === undefined ? {} : { subject: finding.subject }),
    ...(finding.direction === undefined ? {} : { direction: finding.direction }),
    tags: finding.tags,
    verified_bases: finding.verifiedBases,
  };
}

function heldFromRow(row: HeldRow): HeldYouTubeFinding {
  return {
    cardNumber: row.card_number === null ? null : Number(row.card_number),
    cardSha256: row.card_sha256,
    findingNumber: Number(row.finding_number),
    ...(row.question === null ? {} : { question: row.question }),
    ...(row.topic_key === null || row.topic_label === null ? {} : { topic: { key: row.topic_key, label: row.topic_label } }),
    claim: row.claim,
    certainty: row.certainty,
    appliesTo: row.applies_to,
    whyNotUsual: row.why_not_usual,
    whatWouldChangeIt: row.what_would_change_it,
    ...(row.kind === null ? {} : { kind: row.kind }),
    ...(row.subject === null ? {} : { subject: row.subject }),
    ...(row.direction === null ? {} : { direction: row.direction }),
    tags: row.tags,
    verifiedBases: row.verified_bases,
    savedAt: instant(row.saved_at),
  };
}

/**
 * The store through migration 0019's SECURITY DEFINER functions; it reads no table directly. The research-access role
 * holds; the review role holds, reads and deletes.
 */
export class PostgresHeldYouTubeFindingsStore implements HeldYouTubeFindingsStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions & { max?: number }) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      max: options.max ?? 2,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
  }

  async hold(raw: HoldYouTubeFindingsInput): Promise<HeldYouTubeFindingHold[]> {
    const input = validHold(raw);
    const result = await this.call<HoldRow>(
      `SELECT * FROM ${this.schema}.hold_youtube_findings(
         $1::integer, $2::text, $3::timestamptz, $4::jsonb, $5::text, $6::text, $7::text
       )`,
      [
        input.cardNumber ?? null, input.cardSha256, input.savedAt, JSON.stringify(input.findings.map(heldColumns)),
        input.question ?? null, input.topic?.key ?? null, input.topic?.label ?? null,
      ],
    );
    return result.rows.map((row) => ({
      cardNumber: row.card_number === null ? null : Number(row.card_number),
      cardSha256: row.card_sha256,
      findingNumber: Number(row.finding_number),
      savedAt: instant(row.saved_at),
      heldNow: row.held_now,
    }));
  }

  async inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]> {
    const result = await this.call<HeldRow>(
      `SELECT * FROM ${this.schema}.inspect_held_youtube_findings($1::integer[])`,
      [validCards(cardNumbers)],
    );
    return result.rows.map(heldFromRow);
  }

  async inspectWithoutCard(raw: { after?: HeldYouTubeSaveKey; saves: number }): Promise<HeldYouTubeFinding[]> {
    const { after, saves } = validPage(raw);
    const result = await this.call<HeldRow>(
      `SELECT * FROM ${this.schema}.inspect_cardless_held_youtube_findings($1::timestamptz, $2::text, $3::integer)`,
      [after?.savedAt ?? null, after?.cardSha256 ?? null, saves],
    );
    return result.rows.map(heldFromRow);
  }

  async deleteForCards(cardNumbers: readonly number[]): Promise<number> {
    const result = await this.call<{ deleted: number }>(
      `SELECT ${this.schema}.delete_held_youtube_findings($1::integer[]) AS deleted`,
      [validCards(cardNumbers)],
    );
    return Number(result.rows[0]?.deleted ?? 0);
  }

  async deleteWithoutCard(cardSha256s: readonly string[]): Promise<number> {
    const result = await this.call<{ deleted: number }>(
      `SELECT ${this.schema}.delete_cardless_held_youtube_findings($1::text[]) AS deleted`,
      [validDigests(cardSha256s)],
    );
    return Number(result.rows[0]?.deleted ?? 0);
  }

  async deleteAll(): Promise<number> {
    const result = await this.call<{ deleted: number }>(
      `SELECT ${this.schema}.delete_all_held_youtube_findings() AS deleted`,
      [],
    );
    return Number(result.rows[0]?.deleted ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async call<Row extends object>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> {
    try {
      return await this.pool.query(sql, values) as unknown as { rows: Row[] };
    } catch (error) {
      if (error instanceof Error && error.message.includes("HELD_YOUTUBE_FINDINGS_INPUT_INVALID")) {
        throw new HeldYouTubeFindingsError("INPUT_INVALID");
      }
      throw error;
    }
  }
}
