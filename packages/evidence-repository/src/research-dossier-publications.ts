import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";
import { sha256, stableJson } from "./hash.js";
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
  "privacy_reading_pending", "conflict_check_pending",
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

/**
 * A copy to publish. The store takes nothing else on trust (Codex's review of stage 2, finding 10): it derives the
 * public part, its topic, related topics and digest, where the research ran, whether a privacy reading passed it,
 * whether a claim names a living person, and so whether it shows or is held and why, from the saved private record.
 */
export interface ResearchDossierPublishInput {
  accountKey: string;
  /** The saved private version this copy is of. */
  versionId: string;
  /** The public part as the server made and checked it; anything but the store's own derivation is refused. */
  payload: Record<string, unknown>;
  /**
   * The conflict check's candidates it compared, as D-1001/2 (public number and version): all of them, from
   * conflictCandidates. The store lists them again under its topic locks and refuses a check made against any other
   * set (comparison_stale). Ignored when the check was not read.
   */
  compared: readonly string[];
  /** read: AskRigor's reader compared the copy with every candidate; not_read: it could not, and the copy is held. */
  conflictCheck: "read" | "not_read";
  /** The shown dossiers it conflicts with, by public number: the server's conflict check, which it made. */
  conflictsWith: readonly string[];
  /** A conflict on an important finding (either finding decision-changing or important): the copy is held for it. */
  importantConflict: boolean;
  at: Date;
}

/** A candidate for the conflict check, as D-1001/2. */
export const conflictCandidateId = (copy: { publicNumber: string; versionNumber: number }) =>
  `${copy.publicNumber}/${copy.versionNumber}`;

export type ResearchDossierPublishResult =
  | { outcome: "published" | "replayed"; publicNumber: string; state: ResearchDossierPublicState;
    holdReasons: ResearchDossierHoldReason[] }
  /** The payload is not exactly the saved record's public part, or a comparison lacks its group sizes. */
  | { outcome: "payload_refused" }
  /** The candidates changed since the conflict check: compare again. */
  | { outcome: "comparison_stale" }
  /** The account may not publish now: not an active free contributor with saving on whose notice covers it. */
  | { outcome: "account_refused" }
  /** Not the newest version of one of the account's dossiers, or withdrawn, rejected or erased. */
  | { outcome: "version_refused" };

/** A shown copy that is a candidate for the conflict check of a new one. */
export interface ResearchDossierTopicCopy {
  publicNumber: string;
  versionNumber: number;
  topicKey: string;
  payload: Record<string, unknown>;
}

/** At most this many candidates a page; the server pages through all of them. */
export const CONFLICT_CANDIDATES_PER_PAGE = 200;

/** The research-access role's side. */
export interface ResearchDossierPublisher {
  publish(input: ResearchDossierPublishInput): Promise<ResearchDossierPublishResult>;
  /**
   * The conflict check's candidates for one of the account's saved versions (Codex's review of stage 2, finding 3):
   * every shown copy on its topic or a linked one, or meeting it under another name, its own dossier's earlier copy
   * included, a page at a time after the last one given.
   */
  conflictCandidates(accountKey: string, versionId: string, after: { publicNumber: string; versionNumber: number } | null,
    limit: number): Promise<ResearchDossierTopicCopy[]>;
}

export interface ResearchDossierPublicationRow {
  publicNumber: string;
  versionNumber: number;
  /** The private ARD number; null once detached, when its contributor lost access with an accepted copy. */
  dossierNumber: string | null;
  state: ResearchDossierPublicState;
  topicKey: string | null;
  question: string | null;
  holdReasons: ResearchDossierHoldReason[];
  conflictsWith: string[];
  origin: Record<string, unknown>;
  privacyRead: boolean;
  accepted: boolean;
  decidedAt: string;
  /** A claim names a living person: the copy shows only on the owner's own decision (decideLivingPerson). */
  namesLivingPerson: boolean;
  /** That decision: who (the reviewer login's digest), when, and the reason typed; null until made. */
  livingPersonDecision: { by: string; at: string; reason: string } | null;
  /** A reviewed revision of an importance mark: the version it revises, who (digest) and why; null for a published copy. */
  revision: { of: number; by: string; reason: string | null } | null;
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

/** The owner's own decision to show a copy whose claim names a living person (Codex's review of stage 2, finding 2). */
export interface ResearchDossierLivingPersonDecisionInput {
  publicNumber: string;
  versionNumber: number;
  /** The owner's typed reason, 1 to 200 characters. */
  reason: string;
  /** Who decided: the reviewer login's digest, reviewer: and 16 hex characters, never the login. */
  decidedBy: string;
  at: Date;
}

/** A reviewed revision of one finding's importance mark (Codex's review of stage 2, finding 7). */
export interface ResearchDossierImportanceRevisionInput {
  publicNumber: string;
  versionNumber: number;
  findingId: string;
  importance: "decision_changing" | "important" | "context";
  /** The reviewer's typed reason, 1 to 200 characters. */
  reason: string;
  /** Who revised it: the reviewer login's digest, reviewer: and 16 hex characters. */
  revisedBy: string;
  at: Date;
}

export type ResearchDossierImportanceRevisionResult =
  | { outcome: "revised"; versionNumber: number; state: ResearchDossierPublicState; previous: string }
  | { outcome: "not_found" }
  /** Not the newest copy, not shown or held, no such finding, or the mark is already that. */
  | { outcome: "not_revisable"; state: ResearchDossierPublicState; previous: string | null };

/** The review role's side: the owner's review, and AskRigor's check of held copies. */
export interface ResearchDossierPublicationReviewStore {
  list(state: ResearchDossierPublicState | undefined, limit: number): Promise<ResearchDossierPublicationRow[]>;
  inspect(publicNumber: string): Promise<ResearchDossierPublicationDetail[]>;
  decide(input: ResearchDossierDecisionInput): Promise<ResearchDossierDecisionResult>;
  decideLivingPerson(input: ResearchDossierLivingPersonDecisionInput): Promise<ResearchDossierDecisionResult>;
  reviseImportance(input: ResearchDossierImportanceRevisionInput): Promise<ResearchDossierImportanceRevisionResult>;
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
  /** A reviewed revision of an importance mark. */
  revised: boolean;
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
  if (!HEX_64.test(input.accountKey) || !UUID.test(input.versionId) || input.payload === null ||
    typeof input.payload !== "object" || Array.isArray(input.payload) || typeof input.importantConflict !== "boolean" ||
    !input.compared.every((id) => /^D-[1-9][0-9]{3,}\/[1-9][0-9]*$/u.test(id)) ||
    (input.conflictCheck !== "read" && input.conflictCheck !== "not_read") ||
    (input.conflictCheck === "not_read" && (input.importantConflict || input.conflictsWith.length > 0)) ||
    input.conflictsWith.length > 50 || !input.conflictsWith.every((number) => PUBLIC_DOSSIER_NUMBER.test(number)) ||
    (input.importantConflict && input.conflictsWith.length === 0) ||
    !(input.at instanceof Date) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

/**
 * Why a copy is held, derived from the saved private record and its public part, as the publish function derives it
 * (migration 0040): waiting for the privacy reading, not highly confident, names a living person or did not say, and
 * the server's conflict check.
 */
export function researchDossierAdmission(stored: Record<string, unknown>, projection: Record<string, unknown>,
  importantConflict: boolean, conflictCheckPending = false): { state: "shown" | "held";
    holdReasons: ResearchDossierAutoHoldReason[]; privacyRead: boolean; namesLivingPerson: boolean } {
  const checked = projection.checked as { privacy_reading?: unknown } | undefined;
  const value = projection.value as { confidence?: unknown } | undefined;
  const privacyRead = checked?.privacy_reading === true;
  const named = stored.names_living_people;
  const holdReasons: ResearchDossierAutoHoldReason[] = [
    ...(privacyRead ? [] : ["privacy_reading_pending" as const]),
    ...(value?.confidence === "high" ? [] : ["not_high_confidence" as const]),
    ...(named === true ? ["names_living_people" as const] : typeof named === "boolean" ? []
      : ["living_people_undeclared" as const]),
    ...(importantConflict ? ["important_conflict" as const] : []),
    ...(conflictCheckPending ? ["conflict_check_pending" as const] : []),
  ];
  return { state: holdReasons.length === 0 ? "shown" : "held", holdReasons, privacyRead, namesLivingPerson: named === true };
}

/** A public part's key, names, other names and forms, trimmed and lower-cased, as research_dossier_topic_names. */
export function researchDossierTopicNames(projection: Record<string, unknown>): string[] {
  const topic = (projection.topic ?? {}) as { key?: unknown; name?: unknown; other_names?: unknown };
  const forms = Array.isArray(projection.forms) ? projection.forms : [];
  const others = Array.isArray(topic.other_names) ? topic.other_names : [];
  return [...new Set([topic.key, topic.name, ...others, ...forms].filter((name): name is string => typeof name === "string")
    .map((name) => name.trim().toLowerCase()).filter((name) => name !== ""))].sort();
}

/** Whether a shown copy is a conflict candidate for a public part, as research_dossier_conflict_matches. */
function conflictMatch(projection: Record<string, unknown>, copy: { topicKey: string | null; relatedTopicKeys: string[];
  topicNames: string[] }): boolean {
  const topic = (projection.topic ?? {}) as { key?: unknown; related?: unknown };
  const related = Array.isArray(topic.related) ? topic.related : [];
  const names = new Set(researchDossierTopicNames(projection));
  return copy.topicKey !== null && (copy.topicKey === topic.key || related.includes(copy.topicKey) ||
    copy.relatedTopicKeys.includes(String(topic.key)) || copy.topicNames.some((name) => names.has(name)));
}

const candidateOrder = (left: { publicNumber: string; versionNumber: number },
  right: { publicNumber: string; versionNumber: number }) =>
  left.publicNumber.length - right.publicNumber.length || (left.publicNumber < right.publicNumber ? -1
    : left.publicNumber > right.publicNumber ? 1 : 0) || left.versionNumber - right.versionNumber;

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

function assertImportanceRevision(input: ResearchDossierImportanceRevisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !/^[a-z][a-z0-9_-]{0,31}$/u.test(input.findingId) ||
    !["decision_changing", "important", "context"].includes(input.importance) || typeof input.reason !== "string" ||
    input.reason !== input.reason.trim() || input.reason.length < 1 || input.reason.length > 200 ||
    !/^reviewer:[0-9a-f]{16}$/u.test(input.revisedBy) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertLivingPersonDecision(input: ResearchDossierLivingPersonDecisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || typeof input.reason !== "string" || input.reason !== input.reason.trim() ||
    input.reason.length < 1 || input.reason.length > 200 || !/^reviewer:[0-9a-f]{16}$/u.test(input.decidedBy) ||
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
    const result = await this.pool.query<{ outcome: string; public_number: string | null; state: string | null;
      hold_reasons: string[] | null }>(
      `SELECT outcome, public_number, state, hold_reasons FROM ${this.schema}.publish_research_dossier_version(
         $1, $2::uuid, $3::jsonb, $4::text[], $5, $6::text[], $7, $8::timestamptz)`,
      [input.accountKey, input.versionId, JSON.stringify(input.payload), [...input.compared], input.conflictCheck,
        [...input.conflictsWith], input.importantConflict, input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_PUBLISH_RESULT_MISSING");
    if (row.outcome === "account_refused" || row.outcome === "version_refused" || row.outcome === "payload_refused" ||
      row.outcome === "comparison_stale") {
      return { outcome: row.outcome };
    }
    if ((row.outcome !== "published" && row.outcome !== "replayed") || row.public_number === null ||
      !(RESEARCH_DOSSIER_PUBLIC_STATES as readonly string[]).includes(row.state ?? "") || row.hold_reasons === null ||
      !row.hold_reasons.every((reason) => (RESEARCH_DOSSIER_HOLD_REASONS as readonly string[]).includes(reason))) {
      throw new Error("RESEARCH_DOSSIER_PUBLISH_RESULT_INVALID");
    }
    return { outcome: row.outcome, publicNumber: row.public_number, state: row.state as ResearchDossierPublicState,
      holdReasons: row.hold_reasons as ResearchDossierHoldReason[] };
  }

  async conflictCandidates(accountKey: string, versionId: string,
    after: { publicNumber: string; versionNumber: number } | null, limit: number): Promise<ResearchDossierTopicCopy[]> {
    if (!HEX_64.test(accountKey) || !UUID.test(versionId) || !Number.isInteger(limit) || limit < 1 ||
      limit > CONFLICT_CANDIDATES_PER_PAGE || (after !== null && !PUBLIC_DOSSIER_NUMBER.test(after.publicNumber))) {
      throw new ResearchDossierPublicationError("INPUT_INVALID");
    }
    const result = await this.pool.query<{ public_number: string; version_number: number; topic_key: string;
      public_payload: Record<string, unknown> }>(
      `SELECT public_number, version_number, topic_key, public_payload
         FROM ${this.schema}.research_dossier_conflict_candidates($1, $2::uuid, $3, $4, $5)`,
      [accountKey, versionId, after?.publicNumber ?? null, after?.versionNumber ?? null, limit],
    );
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      topicKey: row.topic_key, payload: row.public_payload }));
  }
}

interface ReviewRow {
  public_number: string;
  version_number: number;
  dossier_number: string | null;
  state: ResearchDossierPublicState;
  topic_key: string | null;
  hold_reasons: ResearchDossierHoldReason[];
  conflicts_with: string[];
  origin: Record<string, unknown>;
  privacy_read: boolean;
  accepted: boolean;
  decided_at: Date | string;
  names_living_person: boolean;
  living_person_decided_by: string | null;
  living_person_decided_at: Date | string | null;
  living_person_reason: string | null;
  revision_of: number | null;
  revised_by: string | null;
  revision_reason: string | null;
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
  namesLivingPerson: row.names_living_person,
  livingPersonDecision: row.living_person_decided_at === null || row.living_person_decided_by === null ||
    row.living_person_reason === null ? null
    : { by: row.living_person_decided_by, at: iso(row.living_person_decided_at), reason: row.living_person_reason },
  revision: row.revision_of === null || row.revised_by === null ? null
    : { of: row.revision_of, by: row.revised_by, reason: row.revision_reason },
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

  async reviseImportance(input: ResearchDossierImportanceRevisionInput): Promise<ResearchDossierImportanceRevisionResult> {
    assertImportanceRevision(input);
    const result = await this.pool.query<{ outcome: string; version_number: number | null;
      state: ResearchDossierPublicState | null; previous_importance: string | null }>(
      `SELECT outcome, version_number, state, previous_importance FROM ${this.schema}.revise_research_dossier_importance(
         $1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.findingId, input.importance, input.reason, input.revisedBy,
        input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_REVISION_RESULT_MISSING");
    if (row.outcome === "not_found") return { outcome: "not_found" };
    if (row.outcome === "not_revisable" && row.state !== null) {
      return { outcome: "not_revisable", state: row.state, previous: row.previous_importance };
    }
    if (row.outcome !== "revised" || row.version_number === null || row.state === null || row.previous_importance === null) {
      throw new Error("RESEARCH_DOSSIER_REVISION_RESULT_INVALID");
    }
    return { outcome: "revised", versionNumber: row.version_number, state: row.state, previous: row.previous_importance };
  }

  async decideLivingPerson(input: ResearchDossierLivingPersonDecisionInput): Promise<ResearchDossierDecisionResult> {
    assertLivingPersonDecision(input);
    const result = await this.pool.query<{ outcome: string; state: ResearchDossierPublicState | null;
      accepted: boolean | null }>(
      `SELECT outcome, state, accepted FROM ${this.schema}.decide_research_dossier_living_person(
         $1, $2, $3, $4, $5::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.reason, input.decidedBy, input.at.toISOString()],
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
      accepted: boolean; decided_at: Date | string; revised: boolean }>(
      `SELECT public_number, version_number, state, accepted, decided_at, revised
         FROM ${this.schema}.research_dossier_public_history
        WHERE public_number = ANY($1::text[])
        ORDER BY public_number, version_number DESC
        LIMIT 2000`,
      [[...publicNumbers]],
    );
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      state: row.state, accepted: row.accepted, decidedAt: iso(row.decided_at), revised: row.revised }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// In memory ------------------------------------------------------------------------------------------------------------

interface MemoryCopy {
  /** The private version; null once detached. */
  versionId: string | null;
  publicNumber: string;
  dossierNumber: string | null;
  versionNumber: number;
  state: ResearchDossierPublicState;
  topicKey: string | null;
  relatedTopicKeys: string[];
  topicNames: string[];
  payload: Record<string, unknown> | null;
  payloadSha256: string | null;
  holdReasons: ResearchDossierHoldReason[];
  conflictsWith: string[];
  origin: Record<string, unknown>;
  privacyRead: boolean;
  namesLivingPerson: boolean;
  livingPersonDecision: { by: string; at: Date; reason: string } | null;
  revision: { of: number; by: string; reason: string | null } | null;
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
  /** By public number and version, as the database's key. */
  private readonly copies = new Map<string, MemoryCopy>();
  private readonly numbers = new Map<string, string>();
  private nextNumber = 1001;

  private copyOfVersion(versionId: string): MemoryCopy | undefined {
    return [...this.copies.values()].find((copy) => copy.versionId === versionId && copy.revision === null);
  }

  /** The next version number of a dossier's copies: after every copy and revision so far. */
  private nextVersion(publicNumber: string): number {
    return Math.max(0, ...[...this.copies.values()].filter((copy) => copy.publicNumber === publicNumber)
      .map(({ versionNumber }) => versionNumber)) + 1;
  }

  constructor(private readonly options: {
    dossiers: InMemoryResearchDossierStore;
    /** Whether the account may publish now: active, free, saving on, its notice covering public dossiers. */
    eligible?: (accountKey: string) => boolean | Promise<boolean>;
    /** The public part of a saved record, as the database's research_dossier_public_projection makes it. */
    project: (stored: Record<string, unknown>) => Record<string, unknown>;
    /** The sizes rule, as research_dossier_public_sizes_complete reads it. */
    sizesComplete: (projection: Record<string, unknown>) => boolean;
  }) {}

  async publish(input: ResearchDossierPublishInput): Promise<ResearchDossierPublishResult> {
    assertPublishInput(input);
    this.followPrivate();
    if (!(await (this.options.eligible?.(input.accountKey) ?? true))) return { outcome: "account_refused" };
    const facts = this.options.dossiers.versionFacts(input.versionId);
    if (facts === undefined || facts.accountKey !== input.accountKey) return { outcome: "version_refused" };
    const existing = this.copyOfVersion(input.versionId);
    if (existing !== undefined) {
      return { outcome: "replayed", publicNumber: existing.publicNumber, state: existing.state,
        holdReasons: [...existing.holdReasons] };
    }
    if (!facts.newest || facts.closed || facts.erased || facts.payload === null) return { outcome: "version_refused" };
    let projection: Record<string, unknown>;
    try {
      projection = this.options.project(facts.payload);
    } catch {
      return { outcome: "payload_refused" };
    }
    const topic = (projection.topic ?? {}) as { key?: unknown; related?: unknown };
    if (stableJson(projection) !== stableJson(input.payload) || typeof topic.key !== "string" ||
      !TOPIC_KEY.test(topic.key) || !this.options.sizesComplete(projection)) {
      return { outcome: "payload_refused" };
    }
    // Admitted one at a time, as the database's topic locks do; the candidates listed again must be those compared.
    const candidates = this.matches(projection).map(conflictCandidateId).sort();
    if (input.conflictCheck === "read" && (stableJson(candidates) !== stableJson([...input.compared].sort()) ||
      !input.conflictsWith.every((number) => candidates.some((id) => id.startsWith(`${number}/`))))) {
      return { outcome: "comparison_stale" };
    }
    const admission = researchDossierAdmission(facts.payload, projection, input.importantConflict,
      input.conflictCheck === "not_read" && candidates.length > 0);
    const stamp = (facts.payload.stamp ?? {}) as { origin?: unknown };
    const origin = stamp.origin !== null && typeof stamp.origin === "object" && !Array.isArray(stamp.origin)
      ? structuredClone(stamp.origin as Record<string, unknown>) : {};
    let publicNumber = this.numbers.get(facts.dossierNumber);
    if (publicNumber === undefined) {
      publicNumber = `D-${this.nextNumber++}`;
      this.numbers.set(facts.dossierNumber, publicNumber);
    }
    for (const copy of this.copies.values()) {
      if (copy.publicNumber === publicNumber && (copy.state === "held" || (admission.state === "shown" &&
        copy.state === "shown"))) {
        Object.assign(copy, { state: "superseded", holdReasons: [], decidedAt: input.at });
        copy.events.push({ event: "superseded", reason: null, at: input.at });
      }
    }
    const versionNumber = this.nextVersion(publicNumber);
    this.copies.set(`${publicNumber}#${versionNumber}`, {
      versionId: input.versionId,
      publicNumber,
      dossierNumber: facts.dossierNumber,
      versionNumber,
      state: admission.state,
      topicKey: topic.key,
      relatedTopicKeys: Array.isArray(topic.related) ? topic.related.map(String) : [],
      topicNames: researchDossierTopicNames(projection),
      payload: projection,
      payloadSha256: sha256(stableJson(projection)),
      holdReasons: [...admission.holdReasons],
      conflictsWith: [...input.conflictsWith],
      origin,
      privacyRead: admission.privacyRead,
      namesLivingPerson: admission.namesLivingPerson,
      livingPersonDecision: null,
      revision: null,
      acceptedAt: null,
      decidedAt: input.at,
      events: [{ event: admission.state, reason: admission.state === "held" ? admission.holdReasons.join(" ") : null,
        at: input.at }],
    });
    return { outcome: "published", publicNumber, state: admission.state, holdReasons: [...admission.holdReasons] };
  }

  async conflictCandidates(accountKey: string, versionId: string,
    after: { publicNumber: string; versionNumber: number } | null, limit: number): Promise<ResearchDossierTopicCopy[]> {
    this.followPrivate();
    const facts = this.options.dossiers.versionFacts(versionId);
    if (facts === undefined || facts.accountKey !== accountKey || facts.payload === null) return [];
    return this.matches(this.options.project(facts.payload))
      .filter((copy) => after === null || candidateOrder(copy, after) > 0)
      .slice(0, limit)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, topicKey: copy.topicKey!,
        payload: structuredClone(copy.payload!) }));
  }

  /** The shown copies that are conflict candidates for a public part, in the database's order. */
  private matches(projection: Record<string, unknown>): MemoryCopy[] {
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => copy.state === "shown" && copy.payload !== null && conflictMatch(projection, copy))
      .sort(candidateOrder);
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
    const closed = this.closed(copy);
    const accepted = copy.acceptedAt !== null;
    const refused = copy.state === "erased" ||
      (input.decision === "hold" && (copy.state !== "shown" || accepted)) ||
      (input.decision === "take_down" && copy.state !== "shown" && copy.state !== "held") ||
      (input.decision === "show" && copy.state !== "held" && copy.state !== "taken_down") ||
      (input.decision === "accept" && copy.state !== "shown" && copy.state !== "held" && copy.state !== "taken_down") ||
      ((input.decision === "show" || input.decision === "accept") && (copy.versionNumber !== newest || (!accepted && closed) ||
        !copy.privacyRead || (copy.namesLivingPerson && copy.livingPersonDecision === null)));
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

  async reviseImportance(input: ResearchDossierImportanceRevisionInput): Promise<ResearchDossierImportanceRevisionResult> {
    assertImportanceRevision(input);
    this.followPrivate();
    const copies = [...this.copies.values()].filter((copy) => copy.publicNumber === input.publicNumber);
    const copy = copies.find(({ versionNumber }) => versionNumber === input.versionNumber);
    if (copy === undefined) return { outcome: "not_found" };
    const newest = Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const findings = (copy.payload?.findings ?? []) as Array<Record<string, unknown>>;
    const place = findings.findIndex((finding) => finding.id === input.findingId);
    const previous = place < 0 ? null : String(findings[place]!.importance);
    if ((copy.state !== "shown" && copy.state !== "held") || copy.versionNumber !== newest || previous === null ||
      previous === input.importance) {
      return { outcome: "not_revisable", state: copy.state, previous };
    }
    const payload = structuredClone(copy.payload!);
    (payload.findings as Array<Record<string, unknown>>)[place]!.importance = input.importance;
    const versionNumber = newest + 1;
    copy.events.push({ event: "superseded", reason: null, at: input.at });
    const state = copy.state;
    this.copies.set(`${copy.publicNumber}#${versionNumber}`, {
      ...structuredClone({ ...copy, events: [] }), versionId: copy.versionId, versionNumber, payload,
      payloadSha256: sha256(stableJson(payload)), decidedAt: input.at, acceptedAt: copy.acceptedAt,
      livingPersonDecision: copy.livingPersonDecision,
      revision: { of: copy.versionNumber, by: input.revisedBy, reason: input.reason },
      events: [{ event: "revised", reason: input.reason, at: input.at }, { event: state, reason: null, at: input.at }],
    });
    Object.assign(copy, { state: "superseded", holdReasons: [], decidedAt: input.at });
    return { outcome: "revised", versionNumber, state, previous };
  }

  async decideLivingPerson(input: ResearchDossierLivingPersonDecisionInput): Promise<ResearchDossierDecisionResult> {
    assertLivingPersonDecision(input);
    this.followPrivate();
    const copies = [...this.copies.values()].filter((copy) => copy.publicNumber === input.publicNumber);
    const copy = copies.find(({ versionNumber }) => versionNumber === input.versionNumber);
    if (copy === undefined) return { outcome: "not_found" };
    const newest = Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const closed = this.closed(copy);
    const accepted = copy.acceptedAt !== null;
    if (!copy.namesLivingPerson || copy.livingPersonDecision !== null || (copy.state !== "held" &&
      copy.state !== "taken_down") || copy.versionNumber !== newest || !copy.privacyRead || (!accepted && closed)) {
      return { outcome: "not_decidable", state: copy.state, accepted };
    }
    for (const other of copies) {
      if (other !== copy && other.state === "shown") {
        Object.assign(other, { state: "superseded", decidedAt: input.at });
        other.events.push({ event: "superseded", reason: null, at: input.at });
      }
    }
    copy.events.push({ event: "living_person_decided", reason: input.reason, at: input.at },
      { event: "shown", reason: input.reason, at: input.at });
    Object.assign(copy, { state: "shown", holdReasons: [], decidedAt: input.at,
      livingPersonDecision: { by: input.decidedBy, at: input.at, reason: input.reason } });
    return { outcome: "decided", state: "shown", accepted };
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
        decidedAt: copy.decidedAt.toISOString(), revised: copy.revision !== null }));
  }

  /**
   * What the database's triggers do when a private version is withdrawn, rejected or erased, and when an account is
   * revoked: its unaccepted copies leave the pages, and a dossier with an accepted copy is detached, its unaccepted
   * copies erased (Codex's review of stage 2, finding 5).
   */
  followPrivate(at = new Date()): void {
    const byNumber = new Map<string, MemoryCopy[]>();
    for (const copy of this.copies.values()) byNumber.set(copy.publicNumber, [...byNumber.get(copy.publicNumber) ?? [], copy]);
    for (const [publicNumber, copies] of byNumber) {
      const linked = copies.find(({ versionId }) => versionId !== null);
      if (linked === undefined || this.options.dossiers.versionFacts(linked.versionId!)?.accountRevoked !== true) continue;
      for (const copy of copies) {
        if (copy.acceptedAt === null && (copy.state === "shown" || copy.state === "held")) {
          Object.assign(copy, { state: "taken_down", decidedAt: at });
          copy.events.push({ event: "taken_down", reason: "contributor_access_revoked", at });
        }
      }
      if (!copies.some(({ acceptedAt }) => acceptedAt !== null)) continue;
      for (const copy of copies) {
        if (copy.acceptedAt === null && copy.state !== "erased") {
          copy.events.push({ event: "erased", reason: "contributor_access_revoked", at });
          Object.assign(copy, { state: "erased", payload: null, payloadSha256: null, topicKey: null, relatedTopicKeys: [],
            topicNames: [], holdReasons: [], conflictsWith: [], origin: {}, livingPersonDecision: null, decidedAt: at,
            versionId: null, dossierNumber: null,
            revision: copy.revision === null ? null : { ...copy.revision, reason: null } });
        } else if (copy.versionId !== null && copy.state !== "erased") {
          copy.events.push({ event: "detached", reason: "contributor_access_revoked", at });
          Object.assign(copy, { versionId: null, dossierNumber: null, origin: {} });
        }
      }
      for (const [dossierNumber, number] of this.numbers) if (number === publicNumber) this.numbers.delete(dossierNumber);
    }
    for (const copy of this.copies.values()) {
      const facts = copy.versionId === null ? undefined : this.options.dossiers.versionFacts(copy.versionId);
      if (facts === undefined || copy.acceptedAt !== null || copy.state === "erased") continue;
      if (facts.erased) {
        Object.assign(copy, { state: "erased", payload: null, payloadSha256: null, topicKey: null, relatedTopicKeys: [],
          topicNames: [], holdReasons: [], conflictsWith: [], origin: {}, livingPersonDecision: null, decidedAt: at,
          revision: copy.revision === null ? null : { ...copy.revision, reason: null } });
        copy.events.push({ event: "erased", reason: "deletion_requested", at });
      } else if (facts.closed && (copy.state === "shown" || copy.state === "held")) {
        Object.assign(copy, { state: "taken_down", decidedAt: at });
        copy.events.push({ event: "taken_down", reason: "private_version_closed", at });
      }
    }
  }

  /** Every copy's state and events, and whether it still names a private version, for tests. */
  snapshot(): Array<{ publicNumber: string; versionNumber: number; state: ResearchDossierPublicState; accepted: boolean;
    holdReasons: string[]; events: string[]; erased: boolean; linked: boolean }> {
    return [...this.copies.values()]
      .sort((left, right) => left.publicNumber.localeCompare(right.publicNumber) || left.versionNumber - right.versionNumber)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, state: copy.state,
        accepted: copy.acceptedAt !== null, holdReasons: [...copy.holdReasons], events: copy.events.map(({ event }) => event),
        erased: copy.payload === null, linked: copy.versionId !== null }));
  }

  private shows(copy: MemoryCopy): boolean {
    if (copy.state !== "shown" || copy.payload === null) return false;
    return copy.acceptedAt !== null || !this.closed(copy);
  }

  /** Withdrawn, rejected or erased, or detached: a copy so closed shows only as the owner accepted it. */
  private closed(copy: MemoryCopy): boolean {
    return copy.versionId === null || (this.options.dossiers.versionFacts(copy.versionId)?.closed ?? true);
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
      namesLivingPerson: copy.namesLivingPerson,
      livingPersonDecision: copy.livingPersonDecision === null ? null : { by: copy.livingPersonDecision.by,
        at: copy.livingPersonDecision.at.toISOString(), reason: copy.livingPersonDecision.reason },
      revision: copy.revision === null ? null : { ...copy.revision },
    };
  }
}
