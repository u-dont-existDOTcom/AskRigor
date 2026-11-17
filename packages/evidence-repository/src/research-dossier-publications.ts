import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";
import type { InMemoryResearchDossierStore } from "./research-dossiers.js";

/**
 * AskRigor#477, stage 2 (owner answers 331a, 332a and 333a, 16 November 2026): research dossiers on the public Atlas
 * (migration 0040_research_dossier_publications). Each saved dossier version may get one public copy, written in its
 * final state: shown, marked "Not checked by supervisors yet" until the owner accepts it, or held for AskRigor's check.
 * Three roles: the research-access role publishes and reads a topic's shown copies for the conflict check; the review
 * role lists, inspects and decides; the pages' reader reads the shown copies and their history through two views.
 * Consent is the database's own: an account publishes only while its accepted notice is one of
 * research_dossier_public_notices, which is empty until notice v7 is released on the owner's yes.
 */

export const RESEARCH_DOSSIER_PUBLIC_STATES = ["shown", "held", "superseded", "taken_down", "erased"] as const;
export type ResearchDossierPublicState = typeof RESEARCH_DOSSIER_PUBLIC_STATES[number];

/**
 * Why a copy waits for AskRigor's check (332a, and the standing rule on named living people); owner_hold is the
 * review's. privacy_reading_pending: no semantic privacy reading passed the saved content (Codex's review of stage 2,
 * finding 1); such a copy never shows.
 */
export const RESEARCH_DOSSIER_HOLD_REASONS = [
  "not_high_confidence", "names_living_people", "living_people_undeclared", "important_conflict", "owner_hold",
  "privacy_reading_pending",
] as const;
export type ResearchDossierHoldReason = typeof RESEARCH_DOSSIER_HOLD_REASONS[number];
export type ResearchDossierAutoHoldReason = Exclude<ResearchDossierHoldReason, "owner_hold">;

export const RESEARCH_DOSSIER_PUBLIC_DECISIONS = ["show", "hold", "take_down", "accept"] as const;
export type ResearchDossierPublicDecision = typeof RESEARCH_DOSSIER_PUBLIC_DECISIONS[number];

/**
 * The free contributor notices whose yes covers a dossier on the public Atlas, as research_dossier_public_notices
 * lists them: none yet. Notice v7's release adds its version here and to the table, on the owner's yes; until then no
 * dossier can be published, whatever the setting says.
 */
export const PUBLIC_DOSSIER_NOTICE_VERSIONS: readonly string[] = Object.freeze([]);

export function publicDossierNoticeCovered(
  noticeVersion: string | null | undefined,
  covering: readonly string[] = PUBLIC_DOSSIER_NOTICE_VERSIONS,
): boolean {
  return noticeVersion !== null && noticeVersion !== undefined && covering.includes(noticeVersion);
}

export const PUBLIC_DOSSIER_NUMBER = /^D-[1-9][0-9]{3,}$/u;
const TOPIC_KEY = /^[a-z0-9][a-z0-9._-]{0,199}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export interface ResearchDossierPublishInput {
  accountKey: string;
  /** The saved private version this copy is of. */
  versionId: string;
  topicKey: string;
  relatedTopicKeys: readonly string[];
  /** The public part of the dossier, as the server made it. */
  payload: Record<string, unknown>;
  payloadSha256: string;
  state: "shown" | "held";
  holdReasons: readonly ResearchDossierAutoHoldReason[];
  /** The shown dossiers it conflicts with, by public number. */
  conflictsWith: readonly string[];
  /** Where the research ran (332a), for the review only. */
  origin: Record<string, unknown>;
  /**
   * Whether AskRigor's semantic privacy reading passed exactly the saved content (its stamp says so); a copy without it
   * is held for privacy_reading_pending and never shows.
   */
  privacyRead: boolean;
  at: Date;
}

export type ResearchDossierPublishResult =
  | { outcome: "published" | "replayed"; publicNumber: string; state: ResearchDossierPublicState }
  /** The account may not publish now: not an active free contributor with saving on whose notice covers it. */
  | { outcome: "account_refused" }
  /** Not the newest version of one of the account's dossiers, or withdrawn, rejected or erased. */
  | { outcome: "version_refused" };

/** A shown copy on a topic, for the conflict check of a new one. */
export interface ResearchDossierTopicCopy {
  publicNumber: string;
  versionNumber: number;
  dossierNumber: string;
  payload: Record<string, unknown>;
}

/** The research-access role's side. */
export interface ResearchDossierPublisher {
  publish(input: ResearchDossierPublishInput): Promise<ResearchDossierPublishResult>;
  topicCopies(topicKey: string): Promise<ResearchDossierTopicCopy[]>;
}

export interface ResearchDossierPublicationRow {
  publicNumber: string;
  versionNumber: number;
  dossierNumber: string;
  state: ResearchDossierPublicState;
  topicKey: string | null;
  question: string | null;
  holdReasons: ResearchDossierHoldReason[];
  conflictsWith: string[];
  origin: Record<string, unknown>;
  privacyRead: boolean;
  accepted: boolean;
  decidedAt: string;
}

export interface ResearchDossierPublicationDetail extends ResearchDossierPublicationRow {
  relatedTopicKeys: string[];
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
}

export interface ResearchDossierDecisionInput {
  publicNumber: string;
  versionNumber: number;
  decision: ResearchDossierPublicDecision;
  reason: string | null;
  at: Date;
}

export type ResearchDossierDecisionResult =
  | { outcome: "decided"; state: ResearchDossierPublicState; accepted: boolean }
  | { outcome: "not_found" }
  | { outcome: "not_decidable"; state: ResearchDossierPublicState; accepted: boolean };

/** The review role's side: the owner's review, and AskRigor's check of held copies. */
export interface ResearchDossierPublicationReviewStore {
  list(state: ResearchDossierPublicState | undefined, limit: number): Promise<ResearchDossierPublicationRow[]>;
  inspect(publicNumber: string): Promise<ResearchDossierPublicationDetail[]>;
  decide(input: ResearchDossierDecisionInput): Promise<ResearchDossierDecisionResult>;
}

/** A shown copy, as the pages read it. */
export interface PublicDossierCopy {
  publicNumber: string;
  versionNumber: number;
  topicKey: string;
  relatedTopicKeys: string[];
  payload: Record<string, unknown>;
  payloadSha256: string;
  /** Checked by supervisors: the owner accepted it. */
  accepted: boolean;
  shownAt: string;
  conflictsWith: string[];
}

export interface PublicDossierHistoryEntry {
  publicNumber: string;
  versionNumber: number;
  state: "shown" | "superseded";
  accepted: boolean;
  decidedAt: string;
}

export interface PublicDossierQuery {
  topicKeys?: readonly string[];
  publicNumbers?: readonly string[];
  /** 1 to PUBLIC_DOSSIERS_PER_READ. */
  limit: number;
}

export const PUBLIC_DOSSIERS_PER_READ = 500;

/** The pages' reader side. */
export interface PublicDossierPageSource {
  listShown(query: PublicDossierQuery): Promise<PublicDossierCopy[]>;
  history(publicNumbers: readonly string[]): Promise<PublicDossierHistoryEntry[]>;
}

export class ResearchDossierPublicationError extends Error {
  constructor(readonly code: "INPUT_INVALID") {
    super(`RESEARCH_DOSSIER_PUBLICATION_${code}`);
  }
}

function assertPublishInput(input: ResearchDossierPublishInput): void {
  const reasons: readonly string[] = RESEARCH_DOSSIER_HOLD_REASONS.filter((reason) => reason !== "owner_hold");
  if (!HEX_64.test(input.accountKey) || !UUID.test(input.versionId) || !TOPIC_KEY.test(input.topicKey) ||
    input.relatedTopicKeys.length > 10 || !input.relatedTopicKeys.every((key) => TOPIC_KEY.test(key)) ||
    !HEX_64.test(input.payloadSha256) || (input.state !== "shown" && input.state !== "held") ||
    (input.state === "held") !== (input.holdReasons.length > 0) ||
    !input.holdReasons.every((reason) => reasons.includes(reason)) ||
    input.holdReasons.includes("privacy_reading_pending") === input.privacyRead ||
    input.conflictsWith.length > 50 || !input.conflictsWith.every((number) => PUBLIC_DOSSIER_NUMBER.test(number)) ||
    !(input.at instanceof Date) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertQuery(query: PublicDossierQuery): void {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > PUBLIC_DOSSIERS_PER_READ ||
    (query.topicKeys !== undefined && !query.topicKeys.every((key) => TOPIC_KEY.test(key))) ||
    (query.publicNumbers !== undefined && !query.publicNumbers.every((number) => PUBLIC_DOSSIER_NUMBER.test(number)))) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertDecision(input: ResearchDossierDecisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !(RESEARCH_DOSSIER_PUBLIC_DECISIONS as readonly string[]).includes(input.decision) ||
    (input.reason !== null && (input.reason !== input.reason.trim() || input.reason.length < 1 || input.reason.length > 200)) ||
    Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

// PostgreSQL ---------------------------------------------------------------------------------------------------------

/** The research-access role's side, on the access store's pool (its dossierPublisher()). */
export class PostgresResearchDossierPublisher implements ResearchDossierPublisher {
  constructor(private readonly pool: Pool, private readonly schema: string) {}

  async publish(input: ResearchDossierPublishInput): Promise<ResearchDossierPublishResult> {
    assertPublishInput(input);
    const result = await this.pool.query<{ outcome: string; public_number: string | null; state: string | null }>(
      `SELECT outcome, public_number, state FROM ${this.schema}.publish_research_dossier_version(
         $1, $2::uuid, $3, $4::text[], $5::jsonb, $6, $7, $8::text[], $9::text[], $10::jsonb, $11, $12::timestamptz)`,
      [input.accountKey, input.versionId, input.topicKey, [...input.relatedTopicKeys], JSON.stringify(input.payload),
        input.payloadSha256, input.state, [...input.holdReasons], [...input.conflictsWith], JSON.stringify(input.origin),
        input.privacyRead, input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_PUBLISH_RESULT_MISSING");
    if (row.outcome === "account_refused" || row.outcome === "version_refused") return { outcome: row.outcome };
    if ((row.outcome !== "published" && row.outcome !== "replayed") || row.public_number === null ||
      !(RESEARCH_DOSSIER_PUBLIC_STATES as readonly string[]).includes(row.state ?? "")) {
      throw new Error("RESEARCH_DOSSIER_PUBLISH_RESULT_INVALID");
    }
    return { outcome: row.outcome, publicNumber: row.public_number, state: row.state as ResearchDossierPublicState };
  }

  async topicCopies(topicKey: string): Promise<ResearchDossierTopicCopy[]> {
    if (!TOPIC_KEY.test(topicKey)) throw new ResearchDossierPublicationError("INPUT_INVALID");
    const result = await this.pool.query<{ public_number: string; version_number: number; dossier_number: string;
      public_payload: Record<string, unknown> }>(
      `SELECT public_number, version_number, dossier_number, public_payload
         FROM ${this.schema}.research_dossier_topic_publications($1)`,
      [topicKey],
    );
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      dossierNumber: row.dossier_number, payload: row.public_payload }));
  }
}

interface ReviewRow {
  public_number: string;
  version_number: number;
  dossier_number: string;
  state: ResearchDossierPublicState;
  topic_key: string | null;
  hold_reasons: ResearchDossierHoldReason[];
  conflicts_with: string[];
  origin: Record<string, unknown>;
  privacy_read: boolean;
  accepted: boolean;
  decided_at: Date | string;
}

const reviewRowOf = (row: ReviewRow & { question?: string | null }): ResearchDossierPublicationRow => ({
  publicNumber: row.public_number,
  versionNumber: row.version_number,
  dossierNumber: row.dossier_number,
  state: row.state,
  topicKey: row.topic_key,
  question: row.question ?? null,
  holdReasons: row.hold_reasons,
  conflictsWith: row.conflicts_with,
  origin: row.origin,
  privacyRead: row.privacy_read,
  accepted: row.accepted,
  decidedAt: iso(row.decided_at),
});

/** The review role's side, on its own pool (the review runtime's, as forget_card's eraser). */
export class PostgresResearchDossierPublicationReview implements ResearchDossierPublicationReviewStore {
  private readonly pool: Pool;
  private readonly schema: string;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async list(state: ResearchDossierPublicState | undefined, limit: number): Promise<ResearchDossierPublicationRow[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
      (state !== undefined && !(RESEARCH_DOSSIER_PUBLIC_STATES as readonly string[]).includes(state))) {
      throw new ResearchDossierPublicationError("INPUT_INVALID");
    }
    const result = await this.pool.query<ReviewRow & { question: string | null }>(
      `SELECT * FROM ${this.schema}.list_research_dossier_publications($1, $2)`, [state ?? null, limit]);
    return result.rows.map(reviewRowOf);
  }

  async inspect(publicNumber: string): Promise<ResearchDossierPublicationDetail[]> {
    if (!PUBLIC_DOSSIER_NUMBER.test(publicNumber)) throw new ResearchDossierPublicationError("INPUT_INVALID");
    const result = await this.pool.query<ReviewRow & { related_topic_keys: string[];
      public_payload: Record<string, unknown> | null; public_sha256: string | null }>(
      `SELECT * FROM ${this.schema}.inspect_research_dossier_publication($1)`, [publicNumber]);
    return result.rows.map((row) => ({
      ...reviewRowOf({ ...row, question: typeof row.public_payload?.question === "string" ? row.public_payload.question : null }),
      relatedTopicKeys: row.related_topic_keys,
      payload: row.public_payload,
      payloadSha256: row.public_sha256,
    }));
  }

  async decide(input: ResearchDossierDecisionInput): Promise<ResearchDossierDecisionResult> {
    assertDecision(input);
    const result = await this.pool.query<{ outcome: string; state: ResearchDossierPublicState | null;
      accepted: boolean | null }>(
      `SELECT outcome, state, accepted FROM ${this.schema}.decide_research_dossier_publication(
         $1, $2, $3, $4, $5::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.decision, input.reason, input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_DECISION_RESULT_MISSING");
    if (row.outcome === "not_found") return { outcome: "not_found" };
    if ((row.outcome !== "decided" && row.outcome !== "not_decidable") || row.state === null || row.accepted === null) {
      throw new Error("RESEARCH_DOSSIER_DECISION_RESULT_INVALID");
    }
    return { outcome: row.outcome, state: row.state, accepted: row.accepted };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** The pages' reader side: the two views, in one read-only snapshot per read. */
export class PostgresPublicDossierPageSource implements PublicDossierPageSource {
  private readonly pool: Pool;
  private readonly schema: string;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async listShown(query: PublicDossierQuery): Promise<PublicDossierCopy[]> {
    assertQuery(query);
    const result = await this.pool.query<{ public_number: string; version_number: number; topic_key: string;
      related_topic_keys: string[]; public_payload: Record<string, unknown>; public_sha256: string; accepted: boolean;
      shown_at: Date | string; conflicts_with: string[] }>(
      `SELECT public_number, version_number, topic_key, related_topic_keys, public_payload, public_sha256, accepted,
              shown_at, conflicts_with
         FROM ${this.schema}.research_dossier_public_pages
        WHERE ($1::text[] IS NULL OR topic_key = ANY($1::text[]))
          AND ($2::text[] IS NULL OR public_number = ANY($2::text[]))
        ORDER BY shown_at DESC, public_number
        LIMIT $3`,
      [query.topicKeys === undefined ? null : [...query.topicKeys],
        query.publicNumbers === undefined ? null : [...query.publicNumbers], query.limit],
    );
    return result.rows.map((row) => ({
      publicNumber: row.public_number,
      versionNumber: row.version_number,
      topicKey: row.topic_key,
      relatedTopicKeys: row.related_topic_keys,
      payload: row.public_payload,
      payloadSha256: row.public_sha256,
      accepted: row.accepted,
      shownAt: iso(row.shown_at),
      conflictsWith: row.conflicts_with,
    }));
  }

  async history(publicNumbers: readonly string[]): Promise<PublicDossierHistoryEntry[]> {
    if (publicNumbers.length === 0) return [];
    assertQuery({ publicNumbers, limit: 1 });
    const result = await this.pool.query<{ public_number: string; version_number: number; state: "shown" | "superseded";
      accepted: boolean; decided_at: Date | string }>(
      `SELECT public_number, version_number, state, accepted, decided_at
         FROM ${this.schema}.research_dossier_public_history
        WHERE public_number = ANY($1::text[])
        ORDER BY public_number, version_number DESC
        LIMIT 2000`,
      [[...publicNumbers]],
    );
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      state: row.state, accepted: row.accepted, decidedAt: iso(row.decided_at) }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// In memory ------------------------------------------------------------------------------------------------------------

interface MemoryCopy {
  versionId: string;
  publicNumber: string;
  dossierNumber: string;
  versionNumber: number;
  state: ResearchDossierPublicState;
  topicKey: string | null;
  relatedTopicKeys: string[];
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
  holdReasons: ResearchDossierHoldReason[];
  conflictsWith: string[];
  origin: Record<string, unknown>;
  privacyRead: boolean;
  acceptedAt: Date | null;
  decidedAt: Date;
  events: Array<{ event: string; reason: string | null; at: Date }>;
}

/**
 * The same rules in memory, over an in-memory dossier store, for tests: the account check (eligible), the newest
 * unwithdrawn version of the account's own dossier, one copy per version, supersession, the review's decisions, and
 * the pages' views. The database's triggers, which follow a private version's withdrawal and erasure, are read here at
 * each read and decision (followPrivate runs them).
 */
export class InMemoryResearchDossierPublications
implements ResearchDossierPublisher, ResearchDossierPublicationReviewStore, PublicDossierPageSource {
  private readonly copies = new Map<string, MemoryCopy>();
  private readonly numbers = new Map<string, string>();
  private nextNumber = 1001;

  constructor(private readonly options: {
    dossiers: InMemoryResearchDossierStore;
    /** Whether the account may publish now: active, free, saving on, its notice covering public dossiers. */
    eligible?: (accountKey: string) => boolean | Promise<boolean>;
  }) {}

  async publish(input: ResearchDossierPublishInput): Promise<ResearchDossierPublishResult> {
    assertPublishInput(input);
    this.followPrivate();
    if (!(await (this.options.eligible?.(input.accountKey) ?? true))) return { outcome: "account_refused" };
    const facts = this.options.dossiers.versionFacts(input.versionId);
    if (facts === undefined || facts.accountKey !== input.accountKey) return { outcome: "version_refused" };
    const existing = this.copies.get(input.versionId);
    if (existing !== undefined) return { outcome: "replayed", publicNumber: existing.publicNumber, state: existing.state };
    if (!facts.newest || facts.closed || facts.erased) return { outcome: "version_refused" };
    let publicNumber = this.numbers.get(facts.dossierNumber);
    if (publicNumber === undefined) {
      publicNumber = `D-${this.nextNumber++}`;
      this.numbers.set(facts.dossierNumber, publicNumber);
    }
    for (const copy of this.copies.values()) {
      if (copy.publicNumber === publicNumber && (copy.state === "held" || (input.state === "shown" && copy.state === "shown"))) {
        Object.assign(copy, { state: "superseded", holdReasons: [], decidedAt: input.at });
        copy.events.push({ event: "superseded", reason: null, at: input.at });
      }
    }
    this.copies.set(input.versionId, {
      versionId: input.versionId,
      publicNumber,
      dossierNumber: facts.dossierNumber,
      versionNumber: facts.versionNumber,
      state: input.state,
      topicKey: input.topicKey,
      relatedTopicKeys: [...input.relatedTopicKeys],
      payload: structuredClone(input.payload),
      payloadSha256: input.payloadSha256,
      holdReasons: [...input.holdReasons],
      conflictsWith: [...input.conflictsWith],
      origin: structuredClone(input.origin),
      privacyRead: input.privacyRead,
      acceptedAt: null,
      decidedAt: input.at,
      events: [{ event: input.state, reason: input.state === "held" ? input.holdReasons.join(" ") : null, at: input.at }],
    });
    return { outcome: "published", publicNumber, state: input.state };
  }

  async topicCopies(topicKey: string): Promise<ResearchDossierTopicCopy[]> {
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => copy.topicKey === topicKey && copy.state === "shown" && copy.payload !== null)
      .sort((left, right) => left.publicNumber.localeCompare(right.publicNumber))
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber,
        dossierNumber: copy.dossierNumber, payload: structuredClone(copy.payload!) }));
  }

  async list(state: ResearchDossierPublicState | undefined, limit: number): Promise<ResearchDossierPublicationRow[]> {
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => state === undefined ? copy.state !== "erased" : copy.state === state)
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime() ||
        left.publicNumber.localeCompare(right.publicNumber) || right.versionNumber - left.versionNumber)
      .slice(0, limit)
      .map((copy) => this.rowOf(copy));
  }

  async inspect(publicNumber: string): Promise<ResearchDossierPublicationDetail[]> {
    this.followPrivate();
    return [...this.copies.values()].filter((copy) => copy.publicNumber === publicNumber)
      .sort((left, right) => right.versionNumber - left.versionNumber)
      .map((copy) => ({ ...this.rowOf(copy), relatedTopicKeys: [...copy.relatedTopicKeys],
        payload: copy.payload === null ? null : structuredClone(copy.payload), payloadSha256: copy.payloadSha256 }));
  }

  async decide(input: ResearchDossierDecisionInput): Promise<ResearchDossierDecisionResult> {
    assertDecision(input);
    this.followPrivate();
    const copies = [...this.copies.values()].filter((copy) => copy.publicNumber === input.publicNumber);
    const copy = copies.find(({ versionNumber }) => versionNumber === input.versionNumber);
    if (copy === undefined) return { outcome: "not_found" };
    const newest = Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const closed = this.options.dossiers.versionFacts(copy.versionId)?.closed ?? true;
    const accepted = copy.acceptedAt !== null;
    const refused = copy.state === "erased" ||
      (input.decision === "hold" && (copy.state !== "shown" || accepted)) ||
      (input.decision === "take_down" && copy.state !== "shown" && copy.state !== "held") ||
      (input.decision === "show" && copy.state !== "held" && copy.state !== "taken_down") ||
      (input.decision === "accept" && copy.state !== "shown" && copy.state !== "held" && copy.state !== "taken_down") ||
      ((input.decision === "show" || input.decision === "accept") && (copy.versionNumber !== newest || (!accepted && closed) ||
        !copy.privacyRead));
    if (refused) return { outcome: "not_decidable", state: copy.state, accepted };
    const next: ResearchDossierPublicState = input.decision === "hold" ? "held"
      : input.decision === "take_down" ? "taken_down" : "shown";
    if (next === "shown") {
      for (const other of copies) {
        if (other !== copy && other.state === "shown") {
          Object.assign(other, { state: "superseded", decidedAt: input.at });
          other.events.push({ event: "superseded", reason: null, at: input.at });
        }
      }
    }
    if (copy.state !== next) copy.events.push({ event: next, reason: input.reason, at: input.at });
    if (input.decision === "accept" && !accepted) copy.events.push({ event: "accepted", reason: input.reason, at: input.at });
    Object.assign(copy, {
      state: next,
      holdReasons: next === "held" ? ["owner_hold"] : next === "shown" ? [] : copy.holdReasons,
      acceptedAt: input.decision === "accept" ? copy.acceptedAt ?? input.at : copy.acceptedAt,
      decidedAt: input.at,
    });
    return { outcome: "decided", state: next, accepted: input.decision === "accept" || accepted };
  }

  async listShown(query: PublicDossierQuery): Promise<PublicDossierCopy[]> {
    assertQuery(query);
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => this.shows(copy) &&
        (query.topicKeys === undefined || query.topicKeys.includes(copy.topicKey!)) &&
        (query.publicNumbers === undefined || query.publicNumbers.includes(copy.publicNumber)))
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime() ||
        left.publicNumber.localeCompare(right.publicNumber))
      .slice(0, query.limit)
      .map((copy) => ({
        publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, topicKey: copy.topicKey!,
        relatedTopicKeys: [...copy.relatedTopicKeys], payload: structuredClone(copy.payload!),
        payloadSha256: copy.payloadSha256!, accepted: copy.acceptedAt !== null, shownAt: copy.decidedAt.toISOString(),
        conflictsWith: [...copy.conflictsWith],
      }));
  }

  async history(publicNumbers: readonly string[]): Promise<PublicDossierHistoryEntry[]> {
    this.followPrivate();
    const shown = new Set([...this.copies.values()].filter((copy) => this.shows(copy)).map(({ publicNumber }) => publicNumber));
    return [...this.copies.values()]
      .filter((copy) => publicNumbers.includes(copy.publicNumber) && shown.has(copy.publicNumber) &&
        (copy.state === "shown" || copy.state === "superseded") && copy.payload !== null)
      .sort((left, right) => left.publicNumber.localeCompare(right.publicNumber) || right.versionNumber - left.versionNumber)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber,
        state: copy.state as "shown" | "superseded", accepted: copy.acceptedAt !== null,
        decidedAt: copy.decidedAt.toISOString() }));
  }

  /** What the database's trigger does when a private version is withdrawn, rejected or erased. */
  followPrivate(at = new Date()): void {
    for (const copy of this.copies.values()) {
      const facts = this.options.dossiers.versionFacts(copy.versionId);
      if (facts === undefined || copy.acceptedAt !== null || copy.state === "erased") continue;
      if (facts.erased) {
        Object.assign(copy, { state: "erased", payload: null, payloadSha256: null, topicKey: null, relatedTopicKeys: [],
          holdReasons: [], conflictsWith: [], origin: {}, decidedAt: at });
        copy.events.push({ event: "erased", reason: "deletion_requested", at });
      } else if (facts.closed && (copy.state === "shown" || copy.state === "held")) {
        Object.assign(copy, { state: "taken_down", decidedAt: at });
        copy.events.push({ event: "taken_down", reason: "private_version_closed", at });
      }
    }
  }

  /** Every copy's state and events, for tests. */
  snapshot(): Array<{ publicNumber: string; versionNumber: number; state: ResearchDossierPublicState; accepted: boolean;
    holdReasons: string[]; events: string[]; erased: boolean }> {
    return [...this.copies.values()]
      .sort((left, right) => left.publicNumber.localeCompare(right.publicNumber) || left.versionNumber - right.versionNumber)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, state: copy.state,
        accepted: copy.acceptedAt !== null, holdReasons: [...copy.holdReasons], events: copy.events.map(({ event }) => event),
        erased: copy.payload === null }));
  }

  private shows(copy: MemoryCopy): boolean {
    if (copy.state !== "shown" || copy.payload === null) return false;
    return copy.acceptedAt !== null || !(this.options.dossiers.versionFacts(copy.versionId)?.closed ?? true);
  }

  private rowOf(copy: MemoryCopy): ResearchDossierPublicationRow {
    return {
      publicNumber: copy.publicNumber,
      versionNumber: copy.versionNumber,
      dossierNumber: copy.dossierNumber,
      state: copy.state,
      topicKey: copy.topicKey,
      question: typeof copy.payload?.question === "string" ? copy.payload.question : null,
      holdReasons: [...copy.holdReasons],
      conflictsWith: [...copy.conflictsWith],
      origin: structuredClone(copy.origin),
      privacyRead: copy.privacyRead,
      accepted: copy.acceptedAt !== null,
      decidedAt: copy.decidedAt.toISOString(),
    };
  }
}
