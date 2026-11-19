/**
 * Atlas Release B (design of 19 Nov 2026, sections 4 and 5, with the owner's 356a and wording, and Fable's recheck):
 * the readings that find claims about named people in what the pages show, the sentences taken off after a dispute,
 * the disputes themselves, and the reading's daily spend. Migration 0042 holds them.
 *
 * - The pages read readings and taken-off states inside their own snapshot (AtlasPersonClaimReads), through the public
 *   runtime's SELECT-only reader; the dispute texts, the taken-off sentences' words and the spend are not the reader's.
 * - Everything else goes through the review role's SECURITY DEFINER functions (AtlasPersonClaimStore).
 * - Nothing here decides what a page says: atlas/person-claims.ts does, from a reading bound to the digest of what
 *   the routes show.
 */
import type { Pool, PoolClient } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";

/**
 * The general subject every row is keyed by (the Atlas news design v3, 3.8): a publication now, a news item ("news",
 * N-12) from the news release on, with no change to migration 0042's tables. The pages and the worker here act on
 * publications only.
 */
/** A publication, one of the owner's curated scorecard rows (read like a finding), or a news item (later). */
export type AtlasPersonSubjectKind = "publication" | "news" | "glance";
export const ATLAS_PERSON_PUBLICATION: AtlasPersonSubjectKind = "publication";

export const ATLAS_PERSON_LABELS = ["none", "person", "organization", "unsure"] as const;
export type AtlasPersonLabel = typeof ATLAS_PERSON_LABELS[number];
/** The owner's kinds (19 Nov 2026, 13:17 and 356a): the reading picks one; the server writes its words. */
export const ATLAS_PERSON_KINDS = ["conflict_of_interest", "professional_misconduct", "fraud", "crime", "health",
  "sex_life", "other"] as const;
export type AtlasPersonKind = typeof ATLAS_PERSON_KINDS[number];
export const ATLAS_PERSON_SUPPORTS = ["own_statement", "reported_claim", "says_something_else", "says_otherwise",
  "not_found", "none"] as const;
export type AtlasPersonSupport = typeof ATLAS_PERSON_SUPPORTS[number];

/** Where the finding says a sentence came from, by the reading: a research source, the forum signal, a video, none. */
export type AtlasPersonOrigin =
  | { type: "research"; index: number }
  | { type: "cited"; index: number }
  | { type: "forum" }
  | { type: "video"; index: number }
  | null;

/** One sentence's reading, as the server stored it after strict validation. */
export interface AtlasPersonSentenceReading {
  /** The sentence it labels: sha256 of its text as the pages show it. */
  key: string;
  /** The evidence the reading saw (sources, kept quotes, forum signal, videos), as sha256. */
  evidence: string;
  label: AtlasPersonLabel;
  kind: AtlasPersonKind | null;
  origin: AtlasPersonOrigin;
  /** The kept backing line it points to: research source, line, and which of its two quotes. */
  backing: { source: number; line: number; part: "sentence" | "conclusion" } | null;
  support: AtlasPersonSupport;
  /** Fable 4.2: sourced only if every claim about a person in the sentence is supported. */
  everyClaimSupported: boolean;
  /** Fable 4.3: the sentence helps the person (an exoneration, a negation); a dispute then goes to the main session. */
  favourable: boolean;
  privateIndividual: boolean;
  /** A taken-off sentence it repeats, by its removal number; null for none. */
  repeats: number | null;
  /** The names as written, folded (case and accents), for the taken-off memory; never shown. */
  foldedNames: string[];
}

export interface AtlasPersonReading {
  publicationNumber: string;
  /** The digest the stored sentences were read for; null when never read. */
  digest: string | null;
  sentences: AtlasPersonSentenceReading[];
  readAt: string | null;
  model: string | null;
  /** The digest the failed attempts count for, and how many; three park it (Fable 4.6a). */
  attemptDigest: string | null;
  attempts: number;
  parked: boolean;
  /** The last failure's class ("refusal:<category>" and the like), for the main session; never text. */
  lastFailure?: string | null;
  /** While a call on attemptDigest runs: the one claim on it, across processes (Codex's second review of B). */
  claimedUntil?: string | null;
}

export const ATLAS_PERSON_REMOVAL_STATES = ["taken_off", "disputed", "restored"] as const;
export type AtlasPersonRemovalState = typeof ATLAS_PERSON_REMOVAL_STATES[number];

/** A sentence's dispute state, by publication and sentence key: taken off, shown as disputed, or put back. */
export interface AtlasPersonRemoval {
  removalNumber: number;
  publicationNumber: string;
  sentenceKey: string;
  state: AtlasPersonRemovalState;
  foldedNames: string[];
  changedAt: string;
}

/** What the pages read while the mark is on, inside their snapshot. */
export interface AtlasPersonClaimReads {
  /** When the mark was switched on: findings published before it show under the banner until read. */
  readonly since: string;
  readReadings(publicationNumbers: readonly string[]): Promise<AtlasPersonReading[]>;
  readRemovals(publicationNumbers: readonly string[]): Promise<AtlasPersonRemoval[]>;
  /** The folded names of every sentence taken off and not put back (the render-time hiding while unread). */
  listRemovedNames(): Promise<string[]>;
  /**
   * Every sentence taken off and not put back, by number, with its folded names and the context of the finding it was
   * taken off (topic and source identifiers): a finding sharing a name or a context key is read again with it.
   */
  listTakenOffMemory(): Promise<Array<{ removalNumber: number; foldedNames: string[]; contextKeys: string[] }>>;
  /** The public history of dispute states, newest first: no words, no names (design 4.6). */
  listPersonChanges(limit: number): Promise<AtlasPersonChange[]>;
  /** Sentences taken off anywhere, by their keys: the same sentence stays off on every publication (Codex, B). */
  readRemovalsBySentenceKeys(sentenceKeys: readonly string[]): Promise<AtlasPersonRemoval[]>;
  /** The removals a reading says sentences repeat, by number, wherever they are. */
  readRemovalsByNumber(removalNumbers: readonly number[]): Promise<AtlasPersonRemoval[]>;
}

/** One public change of a sentence's dispute state on a subject. */
export interface AtlasPersonChange { changeNumber: number; subjectKind: AtlasPersonSubjectKind; publicationNumber: string;
  state: AtlasPersonRemovalState; changedAt: string }

/** What the owner must hear of, sent to his channel until delivered and each day until he acknowledges it. */
export interface AtlasPersonNotice {
  noticeNumber: number;
  kind: "legal" | "dispute" | "refusal" | "parked" | "recheck";
  subjectKind: AtlasPersonSubjectKind;
  publicationNumber: string;
  disputeNumber: number | null;
  /** A class only ("refusal:<category>", "taken_off"); never text. */
  detail: string | null;
  createdAt: string;
  attempts: number;
  deliveredAt?: string | null;
}

export type AtlasPersonDisputeWanted = "taken_off" | "marked_disputed" | "queued";
export type AtlasPersonDisputeOutcome = AtlasPersonDisputeWanted | "over_ceiling" | "limited";

export interface AtlasPersonDisputeInput {
  /** The form's own one-time key: the same submission twice is one dispute. */
  idempotencyKey: string;
  publicationNumber: string;
  sentenceKey: string;
  kind: "wrong" | "missed";
  wanted: AtlasPersonDisputeWanted;
  /** Fable 4.7: reads as a legal letter or a data request, so it goes to the owner. */
  legal: boolean;
  /** A daily key of the sender's address, never the address. */
  addressKey: string;
  foldedNames: string[];
  /** The finding's context (topic and source identifiers), kept with a removal for the related findings' readings. */
  contextKeys: string[];
  sentence: string;
  whatIsWrong: string;
  sourceLink: string | null;
  email: string | null;
  at: string;
  /** The reading the form was judged by: an automatic removal stands only on it (Codex's review of B). */
  readingDigest: string | null;
  /** The digest of the finding's texts and evidence the form saw: an automatic removal is checked again against it. */
  contentDigest: string | null;
}

export interface AtlasPersonDisputeResult {
  outcome: AtlasPersonDisputeOutcome;
  disputeNumber: number | null;
  duplicate: boolean;
}

/**
 * The limits (design 4.6, Fable 2.3): per address, per sentence and per name each day, and at most 20 sentences taken
 * off automatically across the whole site each day; past that, disputes wait for the main session.
 */
export const ATLAS_PERSON_DISPUTE_LIMITS = { ceiling: 20, perAddress: 5, perSentence: 3, perName: 10 } as const;
/** Fable 4.6c: re-reads asked for by a missed-claim report, site-wide each day. */
export const ATLAS_PERSON_HINTS_PER_DAY = 10;

export interface AtlasPersonQueueItem {
  disputeNumber: number;
  subjectKind: AtlasPersonSubjectKind;
  /** The subject's id: a publication number, or a news item's N-number. */
  publicationNumber: string;
  sentenceKey: string;
  kind: "wrong" | "missed";
  outcome: AtlasPersonDisputeOutcome;
  legal: boolean;
  receivedAt: string;
  /** Null once deleted after 90 days; the short record stays. */
  whatIsWrong: string | null;
  sourceLink: string | null;
  email: string | null;
  sentence: string | null;
}

export interface AtlasPersonHint { disputeNumber: number; subjectKind: AtlasPersonSubjectKind; publicationNumber: string;
  sentenceKey: string }

/** The worker's, the dispute form's and the main session's writes, through the review role's functions. */
export interface AtlasPersonClaimStore {
  saveReading(input: { publicationNumber: string; digest: string; sentences: AtlasPersonSentenceReading[];
    model: string; at: string }): Promise<void>;
  recordFailure(input: { publicationNumber: string; digest: string; at: string; limit: number; reason: string }):
    Promise<{ attempts: number; parked: boolean }>;
  /**
   * The one claim on a digest's reading across processes: refused when it is read, parked or claimed by a call still
   * running; otherwise its attempt is counted before the call, and it holds until the call ends or the lease passes.
   */
  claimReading(input: { publicationNumber: string; digest: string; again: boolean; at: string; limit: number;
    leaseSeconds: number }):
    Promise<{ claimed: boolean; attempts: number; parked: boolean }>;
  /** Reserves spend for one call under the day's cap, across workers and restarts; false at the cap. */
  reserveSpend(input: { day: string; amountUsd: number; capUsd: number; hint: boolean; hintCap: number }):
    Promise<boolean>;
  settleSpend(input: { day: string; reservedUsd: number; spentUsd: number }): Promise<void>;
  submitDispute(input: AtlasPersonDisputeInput): Promise<AtlasPersonDisputeResult>;
  /** The main session's decisions: take a sentence off, put it back, or clear a dispute mark; resolves a dispute. */
  decide(input: { publicationNumber: string; sentenceKey: string;
    action: "take_off" | "restore" | "clear_dispute" | "requeue" | "confirm"; sentence: string | null; foldedNames: string[];
    contextKeys: string[]; disputeNumber: number | null; resolution: string; at: string }): Promise<boolean>;
  listQueue(limit: number): Promise<AtlasPersonQueueItem[]>;
  /** Automatic removals not yet checked again against the finding they were judged on (Codex's third review of B). */
  listUncheckedRemovals(limit: number): Promise<Array<{ disputeNumber: number; publicationNumber: string;
    sentenceKey: string; judgedDigest: string | null; receivedAt: string }>>;
  /** The missed-claim reports waiting for a re-read, leased for 15 minutes; acknowledged once read. */
  takeHints(kind: AtlasPersonSubjectKind, limit: number, at: string): Promise<AtlasPersonHint[]>;
  ackHint(disputeNumber: number, at: string): Promise<void>;
  /** The taken-off sentences a finding's names or context make relevant, by number, for the reading. */
  removedTexts(removalNumbers: readonly number[]): Promise<Array<{ removalNumber: number; sentence: string }>>;
  /** The owner's notices due to be sent (leased against other processes), then a receipt or his acknowledgement. */
  takeNotices(limit: number, at: string): Promise<AtlasPersonNotice[]>;
  recordNotice(noticeNumber: number, action: "delivered" | "acknowledged", by: string | null, at: string): Promise<boolean>;
  listNotices(limit: number): Promise<AtlasPersonNotice[]>;
  /** Deletes dispute texts and email addresses older than `before`; the short record stays (Fable 4.7). */
  purgeDisputes(before: string): Promise<number>;
}

const PUBLICATION = /^P-[1-9][0-9]{3,}$/u;
/** A reading's subject: a publication, or one of the owner's curated scorecard rows. */
const SUBJECT = /^(?:P|G)-[1-9][0-9]{3,}$/u;
export const atlasPersonSubjectKindOf = (id: string): AtlasPersonSubjectKind => id.startsWith("G-") ? "glance" : "publication";
const SHA256 = /^[a-f0-9]{64}$/u;

export class AtlasPersonClaimQueryError extends Error {
  constructor() {
    super("ATLAS_PERSON_CLAIM_QUERY_INVALID");
  }
}

function validNumbers(numbers: readonly string[]): string[] {
  if (numbers.length > 2_000 || !numbers.every((number) => SUBJECT.test(number))) {
    throw new AtlasPersonClaimQueryError();
  }
  return [...new Set(numbers)];
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();
const dayOf = (at: string) => at.slice(0, 10);

function readingOf(row: Record<string, unknown>): AtlasPersonReading {
  return {
    publicationNumber: String(row.subject_id),
    digest: typeof row.digest === "string" ? row.digest : null,
    sentences: Array.isArray(row.sentences) ? row.sentences as AtlasPersonSentenceReading[] : [],
    readAt: row.read_at === null || row.read_at === undefined ? null : iso(row.read_at as Date),
    model: typeof row.model === "string" ? row.model : null,
    attemptDigest: typeof row.attempt_digest === "string" ? row.attempt_digest : null,
    attempts: Number(row.attempts ?? 0),
    parked: row.parked === true,
    lastFailure: typeof row.last_failure === "string" ? row.last_failure : null,
  };
}

function removalOf(row: Record<string, unknown>): AtlasPersonRemoval {
  return {
    removalNumber: Number(row.removal_number),
    publicationNumber: String(row.subject_id),
    sentenceKey: String(row.sentence_key),
    state: row.state as AtlasPersonRemovalState,
    foldedNames: Array.isArray(row.folded_names) ? (row.folded_names as unknown[]).map(String) : [],
    changedAt: iso(row.changed_at as Date),
  };
}

/** The pages' person-claim reads in PostgreSQL, inside the page's snapshot, through the SELECT-only reader. */
export function postgresPersonClaimReads(client: PoolClient, since: string): AtlasPersonClaimReads {
  return {
    since,
    async readReadings(raw) {
      const numbers = validNumbers(raw);
      if (numbers.length === 0) return [];
      return (await client.query(`SELECT subject_id, digest, sentences, read_at, model, attempt_digest, attempts, parked,
        last_failure FROM atlas_person_readings WHERE subject_kind IN ('publication', 'glance')
         AND subject_id = ANY($1::text[])`, [numbers])).rows
        .map(readingOf);
    },
    async readRemovals(raw) {
      const numbers = validNumbers(raw);
      if (numbers.length === 0) return [];
      return (await client.query(`SELECT removal_number, subject_id, sentence_key, state, folded_names, changed_at
        FROM atlas_person_removals WHERE subject_kind = 'publication' AND subject_id = ANY($1::text[])
        ORDER BY removal_number`, [numbers])).rows.map(removalOf);
    },
    async readRemovalsByNumber(raw) {
      const numbers = [...new Set(raw)].filter((number) => Number.isSafeInteger(number) && number > 0).slice(0, 2_000);
      if (numbers.length === 0) return [];
      return (await client.query(`SELECT removal_number, subject_id, sentence_key, state, folded_names, changed_at
        FROM atlas_person_removals WHERE subject_kind = 'publication' AND removal_number = ANY($1::bigint[])
        ORDER BY removal_number`, [numbers])).rows.map(removalOf);
    },
    async listTakenOffMemory() {
      return (await client.query<{ removal_number: string; folded_names: string[]; context_keys: string[] }>(
        `SELECT removal_number, folded_names, context_keys FROM atlas_person_removals WHERE state = 'taken_off'
           AND (cardinality(folded_names) > 0 OR cardinality(context_keys) > 0) ORDER BY removal_number`))
        .rows.map((row) => ({ removalNumber: Number(row.removal_number), foldedNames: row.folded_names,
          contextKeys: row.context_keys }));
    },
    async listPersonChanges(limit) {
      const rows = (await client.query<Record<string, unknown>>(`SELECT change_number, subject_kind, subject_id, state,
        changed_at FROM atlas_person_changes ORDER BY change_number DESC LIMIT $1`,
      [Math.min(Math.max(Math.trunc(limit), 1), 500)])).rows;
      return rows.map((row) => ({ changeNumber: Number(row.change_number),
        subjectKind: row.subject_kind as AtlasPersonSubjectKind, publicationNumber: String(row.subject_id),
        state: row.state as AtlasPersonRemovalState, changedAt: iso(row.changed_at as Date) }));
    },
    async readRemovalsBySentenceKeys(raw) {
      const keys = [...new Set(raw)].filter((key) => SHA256.test(key)).slice(0, 20_000);
      if (keys.length === 0) return [];
      return (await client.query(`SELECT removal_number, subject_id, sentence_key, state, folded_names, changed_at
        FROM atlas_person_removals WHERE subject_kind = 'publication' AND state = 'taken_off'
         AND sentence_key = ANY($1::text[]) ORDER BY removal_number`, [keys])).rows.map(removalOf);
    },
    async listRemovedNames() {
      return (await client.query<{ name: string }>(`SELECT DISTINCT unnest(folded_names) AS name FROM atlas_person_removals
        WHERE state = 'taken_off' ORDER BY 1`)).rows.map(({ name }) => name);
    },
  };
}

/** The writes through the review role's SECURITY DEFINER functions (migration 0042); it reads no table directly. */
export class PostgresAtlasPersonClaimStore implements AtlasPersonClaimStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  private async call<T extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${this.schema}, pg_catalog`);
      return (await client.query<T>(sql, values)).rows;
    } finally {
      client.release();
    }
  }

  async saveReading(input: Parameters<AtlasPersonClaimStore["saveReading"]>[0]): Promise<void> {
    if (!SUBJECT.test(input.publicationNumber) || !SHA256.test(input.digest)) throw new AtlasPersonClaimQueryError();
    await this.call("SELECT save_atlas_person_reading($6, $1, $2, $3::jsonb, $4, $5::timestamptz)",
      [input.publicationNumber, input.digest, JSON.stringify(input.sentences), input.model, input.at,
        atlasPersonSubjectKindOf(input.publicationNumber)]);
  }

  async recordFailure(input: Parameters<AtlasPersonClaimStore["recordFailure"]>[0]) {
    if (!SUBJECT.test(input.publicationNumber) || !SHA256.test(input.digest)) throw new AtlasPersonClaimQueryError();
    const [row] = await this.call<{ attempts: number; parked: boolean }>(
      "SELECT attempts, parked FROM fail_atlas_person_reading($6, $1, $2, $3, $4::timestamptz, $5)",
      [input.publicationNumber, input.digest, input.reason, input.at, input.limit,
        atlasPersonSubjectKindOf(input.publicationNumber)]);
    return { attempts: Number(row?.attempts ?? input.limit), parked: row?.parked !== false };
  }

  async claimReading(input: Parameters<AtlasPersonClaimStore["claimReading"]>[0]) {
    if (!SUBJECT.test(input.publicationNumber) || !SHA256.test(input.digest)) throw new AtlasPersonClaimQueryError();
    const [row] = await this.call<{ claimed: boolean; attempts: number; parked: boolean }>(
      "SELECT claimed, attempts, parked FROM claim_atlas_person_reading($1, $2, $3, $7, $4::timestamptz, $5, $6)",
      [atlasPersonSubjectKindOf(input.publicationNumber), input.publicationNumber, input.digest, input.at, input.limit,
        input.leaseSeconds, input.again]);
    return { claimed: row?.claimed === true, attempts: Number(row?.attempts ?? input.limit), parked: row?.parked !== false };
  }

  async reserveSpend(input: Parameters<AtlasPersonClaimStore["reserveSpend"]>[0]): Promise<boolean> {
    const [row] = await this.call<{ reserved: boolean }>(
      "SELECT reserve_atlas_person_spend($1::date, $2::numeric, $3::numeric, $4, $5) AS reserved",
      [input.day, input.amountUsd.toFixed(6), input.capUsd.toFixed(6), input.hint, input.hintCap]);
    return row?.reserved === true;
  }

  async settleSpend(input: Parameters<AtlasPersonClaimStore["settleSpend"]>[0]): Promise<void> {
    await this.call("SELECT settle_atlas_person_spend($1::date, $2::numeric, $3::numeric)",
      [input.day, input.reservedUsd.toFixed(6), input.spentUsd.toFixed(6)]);
  }

  async submitDispute(input: AtlasPersonDisputeInput): Promise<AtlasPersonDisputeResult> {
    const limits = ATLAS_PERSON_DISPUTE_LIMITS;
    const [row] = await this.call<{ outcome: AtlasPersonDisputeOutcome; dispute_number: string | null;
      duplicate: boolean }>(
      `SELECT outcome, dispute_number, duplicate FROM submit_atlas_person_dispute($1, 'publication', $2, $3, $4, $5, $6, $7, $8::text[],
        $19::text[], $9, $10, $11, $12, $13::timestamptz, $14, $15, $16, $17, $18, $20)`,
      [input.idempotencyKey, input.publicationNumber, input.sentenceKey, input.kind, input.wanted, input.legal,
        input.addressKey, input.foldedNames, input.sentence, input.whatIsWrong, input.sourceLink, input.email, input.at,
        limits.ceiling, limits.perAddress, limits.perSentence, limits.perName, input.readingDigest, input.contextKeys,
        input.contentDigest]);
    if (row === undefined) throw new Error("ATLAS_PERSON_DISPUTE_NOT_STORED");
    return { outcome: row.outcome, disputeNumber: row.dispute_number === null ? null : Number(row.dispute_number),
      duplicate: row.duplicate };
  }

  async decide(input: Parameters<AtlasPersonClaimStore["decide"]>[0]): Promise<boolean> {
    const [row] = await this.call<{ done: boolean }>(
      "SELECT decide_atlas_person_claim('publication', $1, $2, $3, $4, $5::text[], $9::text[], $6, $7, $8::timestamptz) AS done",
      [input.publicationNumber, input.sentenceKey, input.action, input.sentence, input.foldedNames, input.disputeNumber,
        input.resolution, input.at, input.contextKeys]);
    return row?.done === true;
  }

  async listQueue(limit: number): Promise<AtlasPersonQueueItem[]> {
    return (await this.call<Record<string, unknown>>("SELECT * FROM list_atlas_person_queue($1)", [limit])).map((row) => ({
      disputeNumber: Number(row.dispute_number), subjectKind: row.subject_kind as AtlasPersonSubjectKind,
      publicationNumber: String(row.subject_id),
      sentenceKey: String(row.sentence_key), kind: row.kind as "wrong" | "missed",
      outcome: row.outcome as AtlasPersonDisputeOutcome, legal: row.legal === true, receivedAt: iso(row.received_at as Date),
      whatIsWrong: (row.what_is_wrong as string | null) ?? null, sourceLink: (row.source_link as string | null) ?? null,
      email: (row.email as string | null) ?? null, sentence: (row.sentence as string | null) ?? null,
    }));
  }

  async listUncheckedRemovals(limit: number) {
    return (await this.call<Record<string, unknown>>("SELECT * FROM list_atlas_person_unchecked_removals($1)", [limit]))
      .filter((row) => row.subject_kind === "publication").map((row) => ({ disputeNumber: Number(row.dispute_number),
        publicationNumber: String(row.subject_id), sentenceKey: String(row.sentence_key),
        judgedDigest: (row.judged_digest as string | null) ?? null, receivedAt: iso(row.received_at as Date) }));
  }

  async ackHint(disputeNumber: number, at: string): Promise<void> {
    await this.call("SELECT ack_atlas_person_hint($1, $2::timestamptz)", [disputeNumber, at]);
  }

  async takeHints(kind: AtlasPersonSubjectKind, limit: number, at: string): Promise<AtlasPersonHint[]> {
    return (await this.call<Record<string, unknown>>("SELECT * FROM take_atlas_person_hints($1, $2, $3::timestamptz)",
      [kind, limit, at])).map((row) => ({ disputeNumber: Number(row.dispute_number),
      subjectKind: row.subject_kind as AtlasPersonSubjectKind, publicationNumber: String(row.subject_id),
      sentenceKey: String(row.sentence_key) }));
  }

  async removedTexts(removalNumbers: readonly number[]) {
    const numbers = [...new Set(removalNumbers)].filter((number) => Number.isSafeInteger(number) && number > 0);
    if (numbers.length === 0) return [];
    return (await this.call<{ removal_number: string; sentence: string }>(
      "SELECT removal_number, sentence FROM atlas_person_removed_texts_for($1::bigint[])", [numbers]))
      .map((row) => ({ removalNumber: Number(row.removal_number), sentence: row.sentence }));
  }

  async takeNotices(limit: number, at: string): Promise<AtlasPersonNotice[]> {
    return (await this.call<Record<string, unknown>>("SELECT * FROM take_atlas_person_notices($1, $2::timestamptz)",
      [limit, at])).map(noticeOf);
  }

  async recordNotice(noticeNumber: number, action: "delivered" | "acknowledged", by: string | null, at: string) {
    const [row] = await this.call<{ done: boolean }>(
      "SELECT record_atlas_person_notice($1, $2, $3, $4::timestamptz) AS done", [noticeNumber, action, by, at]);
    return row?.done === true;
  }

  async listNotices(limit: number): Promise<AtlasPersonNotice[]> {
    return (await this.call<Record<string, unknown>>("SELECT * FROM list_atlas_person_notices($1)", [limit])).map(noticeOf);
  }

  async purgeDisputes(before: string): Promise<number> {
    const [row] = await this.call<{ purged: number }>("SELECT purge_atlas_person_disputes($1::timestamptz) AS purged",
      [before]);
    return Number(row?.purged ?? 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

function noticeOf(row: Record<string, unknown>): AtlasPersonNotice {
  return { noticeNumber: Number(row.notice_number), kind: row.kind as AtlasPersonNotice["kind"],
    subjectKind: row.subject_kind as AtlasPersonSubjectKind, publicationNumber: String(row.subject_id),
    disputeNumber: row.dispute_number === null || row.dispute_number === undefined ? null : Number(row.dispute_number),
    detail: (row.detail as string | null) ?? null, createdAt: iso(row.created_at as Date), attempts: Number(row.attempts ?? 0),
    ...(row.delivered_at === undefined ? {} : { deliveredAt: row.delivered_at === null ? null : iso(row.delivered_at as Date) }) };
}

// In memory ------------------------------------------------------------------------------------------------------------

interface MemoryDispute extends AtlasPersonQueueItem {
  idempotencyKey: string;
  addressKey: string;
  foldedNames: string[];
  resolvedAt: string | null;
  hintTakenAt: string | null;
  hintLeasedUntil: string | null;
}

/** The same semantics in memory, for tests and the hermetic scenarios: both the pages' reads and the writes. */
export class InMemoryAtlasPersonClaims implements AtlasPersonClaimStore {
  private readonly readings = new Map<string, AtlasPersonReading>();
  private readonly removals: AtlasPersonRemoval[] = [];
  private readonly removedSentences = new Map<number, string>();
  private readonly disputes: MemoryDispute[] = [];
  private readonly spend = new Map<string, { reserved: number; spent: number; calls: number; hints: number }>();
  private readonly changes: AtlasPersonChange[] = [];
  private readonly contexts = new Map<number, string[]>();
  private readonly notices: Array<AtlasPersonNotice & { nextAttemptAt: string | null; acknowledgedAt: string | null;
    acknowledgedBy: string | null }> = [];
  private readonly unchecked = new Map<number, string | null>();
  private readonly judgedAt = new Map<number, string>();
  /** Publications the owner checked (an F number), for the recheck notices; the tests set them. */
  readonly ownerChecked = new Set<string>();

  pageReads(since: string): AtlasPersonClaimReads {
    return {
      since,
      readReadings: async (raw) => validNumbers(raw).flatMap((number) => {
        const reading = this.readings.get(number);
        return reading === undefined ? [] : [structuredClone(reading)];
      }),
      readRemovals: async (raw) => {
        const numbers = new Set(validNumbers(raw));
        return this.removals.filter(({ publicationNumber }) => numbers.has(publicationNumber)).map((row) => ({ ...row }));
      },
      listTakenOffMemory: async () => this.removals.filter(({ state, foldedNames, removalNumber }) =>
        state === "taken_off" && (foldedNames.length > 0 || (this.contexts.get(removalNumber) ?? []).length > 0))
        .map(({ removalNumber, foldedNames }) => ({ removalNumber, foldedNames: [...foldedNames],
          contextKeys: [...(this.contexts.get(removalNumber) ?? [])] })),
      listPersonChanges: async (limit) => [...this.changes].reverse().slice(0, limit).map((change) => ({ ...change })),
      readRemovalsBySentenceKeys: async (raw) => {
        const keys = new Set(raw);
        return this.removals.filter(({ state, sentenceKey }) => state === "taken_off" && keys.has(sentenceKey))
          .map((row) => ({ ...row }));
      },
      readRemovalsByNumber: async (raw) => {
        const numbers = new Set(raw);
        return this.removals.filter(({ removalNumber }) => numbers.has(removalNumber)).map((row) => ({ ...row }));
      },
      listRemovedNames: async () => [...new Set(this.removals.filter(({ state }) => state === "taken_off")
        .flatMap(({ foldedNames }) => foldedNames))].sort(),
    };
  }

  /** Every stored reading, for tests. */
  allReadings(): AtlasPersonReading[] {
    return [...this.readings.values()].map((reading) => structuredClone(reading));
  }

  spentOn(day: string): { reserved: number; spent: number; calls: number; hints: number } {
    return { ...(this.spend.get(day) ?? { reserved: 0, spent: 0, calls: 0, hints: 0 }) };
  }

  async saveReading(input: Parameters<AtlasPersonClaimStore["saveReading"]>[0]): Promise<void> {
    if (!SUBJECT.test(input.publicationNumber) || !SHA256.test(input.digest)) throw new AtlasPersonClaimQueryError();
    const prior = this.readings.get(input.publicationNumber);
    // Another digest's running claim stays whole: its owner, attempts and parking (Codex's fifth review of B).
    const running = prior !== undefined && prior.attemptDigest !== input.digest && (prior.claimedUntil ?? "") > input.at;
    this.readings.set(input.publicationNumber, { publicationNumber: input.publicationNumber, digest: input.digest,
      sentences: structuredClone(input.sentences), readAt: input.at, model: input.model,
      attemptDigest: running ? prior.attemptDigest : null, attempts: running ? prior.attempts : 0,
      parked: running ? prior.parked : false, claimedUntil: running ? prior.claimedUntil : null });
  }

  async recordFailure(input: Parameters<AtlasPersonClaimStore["recordFailure"]>[0]) {
    const current = this.readings.get(input.publicationNumber) ?? { publicationNumber: input.publicationNumber,
      digest: null, sentences: [], readAt: null, model: null, attemptDigest: null, attempts: 0, parked: false };
    if (current.attemptDigest !== input.digest && (current.claimedUntil ?? "") > input.at) {
      return { attempts: current.attempts, parked: current.parked };
    }
    const wasParked = current.parked && current.attemptDigest === input.digest;
    const attempts = current.attemptDigest === input.digest ? current.attempts + (input.reason === "attempt" ? 1 : 0) : 1;
    const parked = attempts >= input.limit;
    this.readings.set(input.publicationNumber, { ...current, attemptDigest: input.digest, attempts, parked,
      lastFailure: input.reason, claimedUntil: null });
    if (input.reason.startsWith("refusal:")) this.notify("refusal", input.publicationNumber, null, input.reason, input.at);
    if (parked && (input.reason !== "attempt" || !wasParked)) {
      this.notify("parked", input.publicationNumber, null, input.reason, input.at);
    }
    return { attempts, parked };
  }

  async claimReading(input: Parameters<AtlasPersonClaimStore["claimReading"]>[0]) {
    const current = this.readings.get(input.publicationNumber) ?? { publicationNumber: input.publicationNumber,
      digest: null, sentences: [], readAt: null, model: null, attemptDigest: null, attempts: 0, parked: false };
    if ((!input.again && current.digest === input.digest) || (current.claimedUntil ?? "") > input.at ||
      (current.attemptDigest === input.digest && current.parked)) {
      return { claimed: false, attempts: current.attempts, parked: current.parked };
    }
    const attempts = current.attemptDigest === input.digest ? current.attempts + 1 : 1;
    this.readings.set(input.publicationNumber, { ...current, attemptDigest: input.digest, attempts,
      parked: attempts >= input.limit, lastFailure: "attempt",
      claimedUntil: new Date(Date.parse(input.at) + input.leaseSeconds * 1_000).toISOString() });
    return { claimed: true, attempts, parked: attempts >= input.limit };
  }

  private notify(kind: AtlasPersonNotice["kind"], publicationNumber: string, disputeNumber: number | null,
    detail: string | null, at: string): void {
    this.notices.push({ noticeNumber: this.notices.length + 1, kind, subjectKind: atlasPersonSubjectKindOf(publicationNumber),
      publicationNumber, disputeNumber, detail, createdAt: at, attempts: 0, deliveredAt: null, nextAttemptAt: null,
      acknowledgedAt: null, acknowledgedBy: null });
  }

  private recordChange(publicationNumber: string, state: AtlasPersonRemovalState, at: string): void {
    this.changes.push({ changeNumber: this.changes.length + 1, subjectKind: atlasPersonSubjectKindOf(publicationNumber),
      publicationNumber, state, changedAt: at });
    if (state !== "restored" && this.ownerChecked.has(publicationNumber)) this.notify("recheck", publicationNumber, null, state, at);
  }

  async takeNotices(limit: number, at: string): Promise<AtlasPersonNotice[]> {
    const due = this.notices.filter((notice) => notice.acknowledgedAt === null &&
      (notice.nextAttemptAt === null || notice.nextAttemptAt <= at) &&
      (notice.deliveredAt === null || notice.deliveredAt === undefined ||
        Date.parse(notice.deliveredAt) <= Date.parse(at) - 24 * 60 * 60_000))
      .sort((left, right) => Number(right.kind === "legal") - Number(left.kind === "legal") ||
        left.noticeNumber - right.noticeNumber).slice(0, limit);
    for (const notice of due) {
      notice.nextAttemptAt = new Date(Date.parse(at) + Math.min(60, 2 ** Math.min(notice.attempts, 6)) * 60_000).toISOString();
      notice.attempts += 1;
    }
    return due.map(({ nextAttemptAt: _next, acknowledgedAt: _ack, acknowledgedBy: _by, deliveredAt: _delivered, ...notice }) =>
      ({ ...notice }));
  }

  async recordNotice(noticeNumber: number, action: "delivered" | "acknowledged", by: string | null, at: string) {
    const notice = this.notices.find((item) => item.noticeNumber === noticeNumber);
    if (notice === undefined || (action === "acknowledged" && notice.acknowledgedAt !== null)) return false;
    if (action === "delivered") notice.deliveredAt = at;
    else { notice.acknowledgedAt = at; notice.acknowledgedBy = by; }
    return true;
  }

  async listNotices(limit: number): Promise<AtlasPersonNotice[]> {
    return this.notices.filter(({ acknowledgedAt }) => acknowledgedAt === null)
      .sort((left, right) => Number(right.kind === "legal") - Number(left.kind === "legal") ||
        left.noticeNumber - right.noticeNumber).slice(0, limit)
      .map(({ nextAttemptAt: _next, acknowledgedAt: _ack, acknowledgedBy: _by, ...notice }) => ({ ...notice }));
  }

  async reserveSpend(input: Parameters<AtlasPersonClaimStore["reserveSpend"]>[0]): Promise<boolean> {
    const day = this.spend.get(input.day) ?? { reserved: 0, spent: 0, calls: 0, hints: 0 };
    if (day.spent + day.reserved + input.amountUsd > input.capUsd + 1e-9) return false;
    if (input.hint && day.hints >= input.hintCap) return false;
    this.spend.set(input.day, { reserved: day.reserved + input.amountUsd, spent: day.spent, calls: day.calls + 1,
      hints: day.hints + (input.hint ? 1 : 0) });
    return true;
  }

  async settleSpend(input: Parameters<AtlasPersonClaimStore["settleSpend"]>[0]): Promise<void> {
    const day = this.spend.get(input.day) ?? { reserved: 0, spent: 0, calls: 0, hints: 0 };
    this.spend.set(input.day, { ...day, reserved: Math.max(0, day.reserved - input.reservedUsd),
      spent: day.spent + input.spentUsd });
  }

  private setRemoval(publicationNumber: string, sentenceKey: string, state: AtlasPersonRemovalState,
    foldedNames: string[], at: string, sentence: string | null, contextKeys: string[] = []): AtlasPersonRemoval {
    let row = this.removals.find((item) => item.publicationNumber === publicationNumber && item.sentenceKey === sentenceKey);
    if (row === undefined) {
      row = { removalNumber: this.removals.length + 1, publicationNumber, sentenceKey, state, foldedNames, changedAt: at };
      this.removals.push(row);
    } else {
      row.state = state;
      row.changedAt = at;
      if (foldedNames.length > 0) row.foldedNames = [...new Set([...row.foldedNames, ...foldedNames])];
    }
    if (sentence !== null && state === "taken_off") this.removedSentences.set(row.removalNumber, sentence);
    if (contextKeys.length > 0) {
      this.contexts.set(row.removalNumber, [...new Set([...(this.contexts.get(row.removalNumber) ?? []), ...contextKeys])]
        .sort().slice(0, 40));
    }
    this.recordChange(publicationNumber, state, at);
    return row;
  }

  async submitDispute(input: AtlasPersonDisputeInput): Promise<AtlasPersonDisputeResult> {
    const limits = ATLAS_PERSON_DISPUTE_LIMITS;
    const prior = this.disputes.find(({ idempotencyKey }) => idempotencyKey === input.idempotencyKey);
    if (prior !== undefined) return { outcome: prior.outcome, disputeNumber: prior.disputeNumber, duplicate: true };
    const today = this.disputes.filter(({ receivedAt }) => dayOf(receivedAt) === dayOf(input.at));
    if (today.filter(({ addressKey }) => addressKey === input.addressKey).length >= limits.perAddress ||
      today.filter(({ publicationNumber, sentenceKey }) => publicationNumber === input.publicationNumber &&
        sentenceKey === input.sentenceKey).length >= limits.perSentence ||
      input.foldedNames.some((name) => today.filter(({ foldedNames }) => foldedNames.includes(name)).length >=
        limits.perName)) {
      return { outcome: "limited", disputeNumber: null, duplicate: false };
    }
    let outcome: AtlasPersonDisputeOutcome = input.wanted;
    if (input.wanted === "taken_off" &&
      today.filter((dispute) => dispute.outcome === "taken_off").length >= limits.ceiling) outcome = "over_ceiling";
    if (outcome === "taken_off" && (input.readingDigest === null || input.contentDigest === null ||
      this.readings.get(input.publicationNumber)?.digest !== input.readingDigest)) {
      outcome = "queued";
    }
    if (outcome === "taken_off") {
      this.setRemoval(input.publicationNumber, input.sentenceKey, "taken_off", input.foldedNames, input.at, input.sentence,
        input.contextKeys);
    } else if (outcome === "marked_disputed") {
      const existing = this.removals.find((item) => item.publicationNumber === input.publicationNumber &&
        item.sentenceKey === input.sentenceKey);
      if (existing?.state !== "taken_off") {
        this.setRemoval(input.publicationNumber, input.sentenceKey, "disputed", input.foldedNames, input.at, null);
      }
    }
    const disputeNumber = this.disputes.length + 1;
    this.disputes.push({ disputeNumber, subjectKind: ATLAS_PERSON_PUBLICATION, idempotencyKey: input.idempotencyKey,
      publicationNumber: input.publicationNumber,
      sentenceKey: input.sentenceKey, kind: input.kind, outcome, legal: input.legal, receivedAt: input.at,
      whatIsWrong: input.whatIsWrong, sourceLink: input.sourceLink, email: input.email, sentence: input.sentence,
      addressKey: input.addressKey, foldedNames: input.foldedNames, resolvedAt: null, hintTakenAt: null,
      hintLeasedUntil: null });
    this.notify(input.legal ? "legal" : "dispute", input.publicationNumber, disputeNumber, null, input.at);
    if (outcome === "taken_off") {
      this.unchecked.set(disputeNumber, input.contentDigest);
      this.judgedAt.set(disputeNumber, input.at);
    }
    return { outcome, disputeNumber, duplicate: false };
  }

  async listUncheckedRemovals(limit: number) {
    return [...this.unchecked.entries()].slice(0, limit).flatMap(([disputeNumber, judgedDigest]) => {
      const dispute = this.disputes.find((item) => item.disputeNumber === disputeNumber);
      return dispute === undefined ? [] : [{ disputeNumber, publicationNumber: dispute.publicationNumber,
        sentenceKey: dispute.sentenceKey, judgedDigest, receivedAt: dispute.receivedAt }];
    });
  }

  async decide(input: Parameters<AtlasPersonClaimStore["decide"]>[0]): Promise<boolean> {
    if (input.action === "confirm") return this.unchecked.delete(input.disputeNumber ?? 0);
    if (input.action === "requeue") {
      // Only the exact pending removal (Codex's fourth review of B): refused once checked or resolved, and the sentence
      // is put back only while the removal is still the one that dispute made.
      const pending = this.disputes.find((item) => item.disputeNumber === input.disputeNumber);
      if (pending === undefined || !this.unchecked.has(pending.disputeNumber) || pending.resolvedAt !== null) return false;
      this.unchecked.delete(pending.disputeNumber);
      pending.outcome = "queued";
      const removal = this.removals.find((item) => item.publicationNumber === input.publicationNumber &&
        item.sentenceKey === input.sentenceKey);
      if (removal?.state === "taken_off" && removal.changedAt === this.judgedAt.get(pending.disputeNumber)) {
        this.setRemoval(input.publicationNumber, input.sentenceKey, "restored", [], input.at, null);
      }
      return true;
    }
    const existing = this.removals.find((item) => item.publicationNumber === input.publicationNumber &&
      item.sentenceKey === input.sentenceKey);
    if (input.action === "take_off") {
      this.setRemoval(input.publicationNumber, input.sentenceKey, "taken_off", input.foldedNames, input.at, input.sentence,
        input.contextKeys);
    } else if (existing === undefined) {
      return false;
    } else {
      this.setRemoval(input.publicationNumber, input.sentenceKey, "restored", [], input.at, null);
    }
    const dispute = this.disputes.find(({ disputeNumber }) => disputeNumber === input.disputeNumber);
    if (dispute !== undefined) {
      dispute.resolvedAt = input.at;
      this.unchecked.delete(dispute.disputeNumber);
    }
    return true;
  }

  async listQueue(limit: number): Promise<AtlasPersonQueueItem[]> {
    return this.disputes.filter((dispute) => dispute.resolvedAt === null)
      .sort((left, right) => Number(right.legal) - Number(left.legal) || left.disputeNumber - right.disputeNumber)
      .slice(0, limit).map(({ disputeNumber, publicationNumber, sentenceKey, kind, outcome, legal, receivedAt, whatIsWrong,
        sourceLink, email, sentence }) => ({ disputeNumber, subjectKind: ATLAS_PERSON_PUBLICATION, publicationNumber,
        sentenceKey, kind, outcome, legal, receivedAt, whatIsWrong, sourceLink, email, sentence }));
  }

  async ackHint(disputeNumber: number, at: string): Promise<void> {
    const dispute = this.disputes.find((item) => item.disputeNumber === disputeNumber);
    if (dispute !== undefined) dispute.hintTakenAt = at;
  }

  async takeHints(kind: AtlasPersonSubjectKind, limit: number, at: string): Promise<AtlasPersonHint[]> {
    const hints = this.disputes.filter((dispute) => kind === ATLAS_PERSON_PUBLICATION && dispute.hintTakenAt === null &&
      dispute.kind === "missed" && (dispute.hintLeasedUntil === null || dispute.hintLeasedUntil < at)).slice(0, limit);
    for (const hint of hints) hint.hintLeasedUntil = new Date(Date.parse(at) + 15 * 60_000).toISOString();
    return hints.map(({ disputeNumber, publicationNumber, sentenceKey }) => ({ disputeNumber,
      subjectKind: ATLAS_PERSON_PUBLICATION, publicationNumber, sentenceKey }));
  }

  async removedTexts(removalNumbers: readonly number[]) {
    const wanted = new Set(removalNumbers);
    return this.removals.filter((row) => row.state === "taken_off" && wanted.has(row.removalNumber))
      .flatMap((row) => {
        const sentence = this.removedSentences.get(row.removalNumber);
        return sentence === undefined ? [] : [{ removalNumber: row.removalNumber, sentence }];
      });
  }

  async purgeDisputes(before: string): Promise<number> {
    let purged = 0;
    for (const dispute of this.disputes) {
      if (dispute.receivedAt < before && (dispute.whatIsWrong !== null || dispute.email !== null ||
        dispute.sourceLink !== null)) {
        dispute.whatIsWrong = null;
        dispute.email = null;
        dispute.sourceLink = null;
        purged += 1;
      }
    }
    return purged;
  }
}
