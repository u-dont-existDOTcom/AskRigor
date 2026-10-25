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
 * Held YouTube findings (owner answer 173, 2026-10-25). AskRigor reads public YouTube data with a server key, which
 * YouTube's Developer Policies call Non-Authorized Data; their section III.E.4 lets an API client keep a limited amount
 * for no longer than 30 calendar days, then delete or refresh it. A findings card is stored without its findings drawn
 * from YouTube comments (owner answer 170); each one left out is held here instead, apart from the card, for the owner's
 * review, and deleted 30 days after it was saved, with no refreshing. A held finding holds only what AskRigor wrote:
 * its claim, certainty, whom it applies to, why the usual answer misses it, what would change it, its kind, subject and
 * direction when the card declared them, and its tags and verified bases, which are fixed values. Never a source, a
 * link, the answer quote, a contributor or thread key, or any comment text, name, channel, comment or video ID: there is
 * no field for them, here or in migration 0019's table. The card is named by its ARF issue number and the checked card's
 * SHA-256, the finding by its place on that card, from 1. Held findings are never published, accepted into the Atlas or
 * offered anywhere else; only the owner's review reads them.
 */

export const HELD_YOUTUBE_FINDINGS_DAYS = 30;
/** Thirty days of 24 hours after a finding's save: PostgreSQL's interval '720 hours', the same in every time zone. */
export const HELD_YOUTUBE_FINDINGS_MILLISECONDS = HELD_YOUTUBE_FINDINGS_DAYS * 24 * 60 * 60 * 1_000;
/** The most cards one read or deletion names, as for forget_atlas_cards. */
export const HELD_YOUTUBE_FINDINGS_CARDS_PER_CALL = 100;
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

/** The findings one save left out of one card, with the time it was saved. */
export const holdYouTubeFindingsInputSchema = z.object({
  /** The card's ARF issue number. */
  cardNumber: z.number().int().min(1).max(2_147_483_647),
  /** The SHA-256 of the checked card, which its finalization receipt signed. */
  cardSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  /** When the card holding them was saved: the 30 days count from it. */
  savedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  findings: z.array(heldYouTubeFindingSchema).min(1).max(5)
    .refine((findings) => distinct(findings.map(({ findingNumber }) => findingNumber))),
}).strict();
export type HoldYouTubeFindingsInput = z.output<typeof holdYouTubeFindingsInputSchema>;

/** Where a held finding comes from and when it goes. */
export interface HeldYouTubeFindingKey {
  cardNumber: number;
  cardSha256: string;
  findingNumber: number;
  savedAt: string;
  /** Exactly 30 days after savedAt: from then on no read returns it, and the next purge deletes it. */
  expiresAt: string;
}

/** A finding a hold call left held: true when this call held it, false when it was held before (no refreshing). */
export interface HeldYouTubeFindingHold extends HeldYouTubeFindingKey {
  heldNow: boolean;
}

export type HeldYouTubeFinding = HeldYouTubeFindingContent & HeldYouTubeFindingKey;

export class HeldYouTubeFindingsError extends Error {
  constructor(readonly code: "INPUT_INVALID") {
    super("The held YouTube findings request is not valid.");
  }
}

/** When a finding saved at savedAt is deleted: exactly 30 days later. */
export function heldYouTubeFindingExpiry(savedAt: string | Date): string {
  const saved = savedAt instanceof Date ? savedAt.getTime() : Date.parse(savedAt);
  if (!Number.isFinite(saved)) throw new HeldYouTubeFindingsError("INPUT_INVALID");
  return new Date(saved + HELD_YOUTUBE_FINDINGS_MILLISECONDS).toISOString();
}

/** Migration 0019's four functions, in TypeScript. */
export interface HeldYouTubeFindingsStore {
  /**
   * Holds the findings of one save until 30 days after savedAt (a save time ahead of the store's clock counts from
   * now). A finding already past its 30 days is not held. A finding of the same card, checked card and place held
   * before keeps its own save time and expiry: holding it again changes nothing. Returns each of the call's findings
   * that is held after it.
   */
  hold(input: HoldYouTubeFindingsInput): Promise<HeldYouTubeFindingHold[]>;
  /** The held findings of these cards whose 30 days have not ended, by card, then oldest save first. */
  inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]>;
  /** Deletes every held finding of these cards now, before their 30 days end; returns how many. */
  deleteForCards(cardNumbers: readonly number[]): Promise<number>;
  /** Deletes every held finding whose 30 days have ended; returns how many. */
  purgeExpired(): Promise<number>;
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

const keyOf = (cardNumber: number, cardSha256: string, findingNumber: number) =>
  `${cardNumber}\u0000${cardSha256}\u0000${findingNumber}`;

const compareHeld = (left: HeldYouTubeFinding, right: HeldYouTubeFinding) =>
  left.cardNumber - right.cardNumber || Date.parse(left.savedAt) - Date.parse(right.savedAt) ||
  left.cardSha256.localeCompare(right.cardSha256) || left.findingNumber - right.findingNumber;

/** The store in memory, with migration 0019's semantics and an injected clock, for tests and hermetic scenarios. */
export class InMemoryHeldYouTubeFindingsStore implements HeldYouTubeFindingsStore {
  private readonly rows = new Map<string, HeldYouTubeFinding>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async hold(raw: HoldYouTubeFindingsInput): Promise<HeldYouTubeFindingHold[]> {
    const input = validHold(raw);
    const now = this.now().getTime();
    const savedAt = new Date(Math.min(Date.parse(input.savedAt), now)).toISOString();
    const expiresAt = heldYouTubeFindingExpiry(savedAt);
    const held: HeldYouTubeFindingHold[] = [];
    for (const finding of [...input.findings].sort((left, right) => left.findingNumber - right.findingNumber)) {
      const key = keyOf(input.cardNumber, input.cardSha256, finding.findingNumber);
      const before = this.rows.get(key);
      // A finding of the same save held before and expired since is deleted first, so it is held anew.
      if (before !== undefined && Date.parse(before.expiresAt) <= now) this.rows.delete(key);
      const existing = this.rows.get(key);
      if (existing !== undefined) {
        held.push({ ...keyFields(existing), heldNow: false });
        continue;
      }
      if (Date.parse(expiresAt) <= now) continue;
      const row: HeldYouTubeFinding = {
        ...structuredClone(finding),
        cardNumber: input.cardNumber,
        cardSha256: input.cardSha256,
        savedAt,
        expiresAt,
      };
      this.rows.set(key, row);
      held.push({ ...keyFields(row), heldNow: true });
    }
    return held;
  }

  async inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]> {
    const cards = new Set(validCards(cardNumbers));
    const now = this.now().getTime();
    return [...this.rows.values()]
      .filter((row) => cards.has(row.cardNumber) && Date.parse(row.expiresAt) > now)
      .sort(compareHeld)
      .map((row) => structuredClone(row));
  }

  async deleteForCards(cardNumbers: readonly number[]): Promise<number> {
    const cards = new Set(validCards(cardNumbers));
    let deleted = 0;
    for (const [key, row] of this.rows) {
      if (!cards.has(row.cardNumber)) continue;
      this.rows.delete(key);
      deleted += 1;
    }
    return deleted;
  }

  async purgeExpired(): Promise<number> {
    const now = this.now().getTime();
    let purged = 0;
    for (const [key, row] of this.rows) {
      if (Date.parse(row.expiresAt) > now) continue;
      this.rows.delete(key);
      purged += 1;
    }
    return purged;
  }

  /** Every row as stored, expired ones included, for tests. */
  snapshot(): HeldYouTubeFinding[] {
    return [...this.rows.values()].sort(compareHeld).map((row) => structuredClone(row));
  }
}

function keyFields(row: HeldYouTubeFindingKey): HeldYouTubeFindingKey {
  return {
    cardNumber: row.cardNumber,
    cardSha256: row.cardSha256,
    findingNumber: row.findingNumber,
    savedAt: row.savedAt,
    expiresAt: row.expiresAt,
  };
}

interface HoldRow {
  card_number: number;
  card_sha256: string;
  finding_number: number;
  saved_at: Date | string;
  expires_at: Date | string;
  held_now: boolean;
}

interface HeldRow {
  card_number: number;
  card_sha256: string;
  finding_number: number;
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
  expires_at: Date | string;
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

/**
 * The store through migration 0019's SECURITY DEFINER functions; it reads no table directly. The research-access role
 * holds and purges; the review role holds, reads, deletes and purges. Each function decides what has expired by the
 * database's own clock.
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
      `SELECT * FROM ${this.schema}.hold_youtube_findings($1::integer, $2::text, $3::timestamptz, $4::jsonb)`,
      [input.cardNumber, input.cardSha256, input.savedAt, JSON.stringify(input.findings.map(heldColumns))],
    );
    return result.rows.map((row) => ({
      cardNumber: Number(row.card_number),
      cardSha256: row.card_sha256,
      findingNumber: Number(row.finding_number),
      savedAt: instant(row.saved_at),
      expiresAt: instant(row.expires_at),
      heldNow: row.held_now,
    }));
  }

  async inspect(cardNumbers: readonly number[]): Promise<HeldYouTubeFinding[]> {
    const result = await this.call<HeldRow>(
      `SELECT * FROM ${this.schema}.inspect_held_youtube_findings($1::integer[])`,
      [validCards(cardNumbers)],
    );
    return result.rows.map((row) => ({
      cardNumber: Number(row.card_number),
      cardSha256: row.card_sha256,
      findingNumber: Number(row.finding_number),
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
      expiresAt: instant(row.expires_at),
    }));
  }

  async deleteForCards(cardNumbers: readonly number[]): Promise<number> {
    const result = await this.call<{ deleted: number }>(
      `SELECT ${this.schema}.delete_held_youtube_findings($1::integer[]) AS deleted`,
      [validCards(cardNumbers)],
    );
    return Number(result.rows[0]?.deleted ?? 0);
  }

  async purgeExpired(): Promise<number> {
    const result = await this.call<{ purged: number }>(
      `SELECT ${this.schema}.purge_expired_held_youtube_findings() AS purged`,
      [],
    );
    return Number(result.rows[0]?.purged ?? 0);
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
