import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";
import { withoutFormatCharacters } from "./atlas-shown-text.js";
import { sha256, stableJson } from "./hash.js";
import type { InMemoryResearchDossierStore } from "./research-dossiers.js";

/**
 * AskRigor#477, stage 2 (owner answers 331a, 332a and 333a, 16 November 2026): research dossiers on the public Atlas
 * (migration 0040_research_dossier_publications). Each saved dossier version may get one public copy, written in its
 * final state: shown, marked "Not checked by supervisors yet" until the owner accepts it, or held for AskRigor's check.
 * Three roles: the research-access role publishes and reads the conflict check's candidates; the review role lists,
 * inspects and decides; the pages' reader reads the shown copies, their history, their topics and the number that
 * moves with every change to them through four views.
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
   * set (comparison_stale, or held waiting for the conflict check when it was not read).
   */
  compared: readonly string[];
  /** read: AskRigor's reader compared the copy with every candidate; not_read: it could not, and the copy is held. */
  conflictCheck: "read" | "not_read";
  /**
   * Every pair of findings the check read as contradicting (conflictFindingId), none cut (Codex's fourth review): the
   * store's admission gate works out from all of them which are important (either finding decision-changing or
   * important, by the two copies' own marks), and an important one holds the copy.
   */
  conflictFindings: readonly string[];
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

/**
 * A pair of findings the conflict check read as contradicting, as the store keeps it: this copy's finding, the shown
 * copy (D-1001/2) and that copy's finding, f2:D-1001/2:f3 (Codex's third review, P1).
 */
export const conflictFindingId = (pair: { finding: string; publicNumber: string; versionNumber: number; theirs: string }) =>
  `${pair.finding}:${pair.publicNumber}/${pair.versionNumber}:${pair.theirs}`;
const CONFLICT_FINDING = /^([a-z][a-z0-9_-]{0,31}):(D-[1-9][0-9]{3,})\/([1-9][0-9]*):([a-z][a-z0-9_-]{0,31})$/u;
/** A kept pair read back, or undefined when it is not one. */
export function readConflictFinding(id: string):
  { finding: string; publicNumber: string; versionNumber: number; theirs: string } | undefined {
  const match = CONFLICT_FINDING.exec(id);
  return match === null ? undefined
    : { finding: match[1]!, publicNumber: match[2]!, versionNumber: Number(match[3]), theirs: match[4]! };
}

/**
 * The conflict check an owner's show of a held or taken-down copy is given (Codex's third review, P1), and a later
 * automatic admission too: the candidates compared (D-1001/2) from showCandidates, the copy's own dossier's shown copy
 * aside for the owner's show; read, or not read when the reader could not compare them all; every pair of findings
 * read as contradicting (conflictFindingId), none cut; and the owner's override: who (the reviewer login's digest) and
 * the shown dossiers he named, or null and none. The store's admission gate (research_dossier_show_refusal) lists the
 * candidates again under the topic locks and refuses a check made, read or not, against any other set; works out from
 * all the pairs which are important and which dossiers an override must cover; and refuses an override that does not
 * name every one of them (Codex's fourth review).
 */
export interface ResearchDossierShowCheck {
  compared: readonly string[];
  conflictCheck: "read" | "not_read";
  conflictFindings: readonly string[];
  overrideBy: string | null;
  overrideConflicts: readonly string[];
}

/** No comparison: what a decision that shows nothing new is given. */
export const NO_SHOW_CHECK: ResearchDossierShowCheck = Object.freeze({ compared: [], conflictCheck: "read",
  conflictFindings: [], overrideBy: null, overrideConflicts: [] });

/** At most this many shown dossiers an override covers and the pages list for one copy; more keeps it as it is. */
export const CONFLICT_OVERRIDE_LIMIT = 50;

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
  /** Whether a privacy reading passed its saved content when it was saved. */
  privacyRead: boolean;
  /**
   * A privacy reading made later of its public content, bound to that content's digest (Codex's re-review of stage 2):
   * passed, or refused with the reader's reason and the field it named; final for that content. Null until one is made.
   */
  laterPrivacyReading: { outcome: "passed" | "refused"; reason: ResearchDossierPrivacyRefusal | null; path: string | null;
    at: string } | null;
  /** The last later reading that could not be made, which is temporary: why, and when. */
  privacyUnavailable: { reason: ResearchDossierPrivacyUnavailable; at: string } | null;
  accepted: boolean;
  decidedAt: string;
  /**
   * A claim names a living person, as the AI declared it: the copy shows only on the owner's own decision
   * (decideLivingPerson). Null when the AI did not say, which is not "no": then only the owner's own statement
   * (livingPersonStatement) resolves it (Codex's re-review of stage 2).
   */
  namesLivingPerson: boolean | null;
  /** The owner's statement for a copy whose AI did not say: what, who (the reviewer login's digest) and when. */
  livingPersonStatement: { statement: ResearchDossierLivingPersonStatement; by: string; at: string } | null;
  /** That decision: who (the reviewer login's digest), when, and the reason typed; null until made. */
  livingPersonDecision: { by: string; at: string; reason: string } | null;
  /** A reviewed revision of an importance mark: the version it revises, who (digest) and why; null for a published copy. */
  revision: { of: number; by: string; reason: string | null } | null;
  /** The pairs of findings the conflict check read as contradicting when it was shown by the review or admitted later. */
  conflictFindings: string[];
  /** The owner's override, when his review showed it over an important conflict or without the comparison: who, when. */
  conflictOverride: { by: string; at: string } | null;
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
  /** The conflict check, for a show of a copy not shown yet; none (NO_SHOW_CHECK) by default. */
  check?: ResearchDossierShowCheck;
  at: Date;
}

export type ResearchDossierDecisionResult =
  | { outcome: "decided"; state: ResearchDossierPublicState; accepted: boolean }
  | { outcome: "not_found" }
  | { outcome: "not_decidable"; state: ResearchDossierPublicState; accepted: boolean }
  /** The shown candidates changed since the check, or no check was made: the current set, to compare again. */
  | { outcome: "comparison_stale"; compared: string[] }
  /**
   * An important conflict, or no comparison while a candidate shows, and no override naming every shown dossier it
   * must cover (required); or more of them than an override can cover (conflicts_over_limit): nothing was changed.
   */
  | { outcome: "conflict_found" | "conflict_not_checked" | "conflicts_over_limit"; state: ResearchDossierPublicState;
    accepted: boolean; required: string[] };

/** The owner's own decision to show a copy whose claim names a living person (Codex's review of stage 2, finding 2). */
export interface ResearchDossierLivingPersonDecisionInput {
  publicNumber: string;
  versionNumber: number;
  /** The owner's typed reason, 1 to 200 characters. */
  reason: string;
  /** Who decided: the reviewer login's digest, reviewer: and 16 hex characters, never the login. */
  decidedBy: string;
  /** The conflict check, as for the ordinary show; none (NO_SHOW_CHECK) by default. */
  check?: ResearchDossierShowCheck;
  at: Date;
}

/** What a privacy reading finds, final for the content it read (the research server's dossier-privacy-reading.ts). */
export const RESEARCH_DOSSIER_PRIVACY_REFUSALS = [
  "names_a_person", "birth_date", "where_someone_lives", "contact_details", "personal_health_story",
  "relative_or_household", "copied_conversation", "other_personal_detail",
] as const;
export type ResearchDossierPrivacyRefusal = typeof RESEARCH_DOSSIER_PRIVACY_REFUSALS[number];
/** Why a privacy reading could not be made: temporary, never a finding about the content. */
export const RESEARCH_DOSSIER_PRIVACY_UNAVAILABLE = [
  "off", "too_long", "daily_budget", "timeout", "error", "refusal", "unreadable",
] as const;
export type ResearchDossierPrivacyUnavailable = typeof RESEARCH_DOSSIER_PRIVACY_UNAVAILABLE[number];

/** A field path a privacy reading names, such as findings[1].claim. */
const PRIVACY_PATH = /^[a-z_]+(?:\[[0-9]+\]|\.[a-z_]+)*$/u;

/**
 * A privacy reading made later of a held copy's public content (Codex's re-review of stage 2, P1), with the digest of
 * the content read, which must be the copy's own: a pass or a refusal is final for that content; unavailable is a
 * temporary failure, kept as the last try.
 */
export interface ResearchDossierPrivacyReadingInput {
  publicNumber: string;
  versionNumber: number;
  contentSha256: string;
  reading:
    | { status: "pass" }
    | { status: "refuse"; reason: ResearchDossierPrivacyRefusal; path?: string }
    | { status: "unavailable"; reason: ResearchDossierPrivacyUnavailable };
  at: Date;
}

export type ResearchDossierPrivacyReadingResult =
  | { outcome: "recorded"; state: ResearchDossierPublicState }
  | { outcome: "not_found" }
  /** Not held or taken down, a reading passed or refused it already, or the content read is not the copy's own. */
  | { outcome: "not_readable"; state: ResearchDossierPublicState };

/** A copy waiting for a privacy reading, with the content to read and its digest. */
export interface ResearchDossierPrivacyPending {
  publicNumber: string;
  versionNumber: number;
  payload: Record<string, unknown>;
  payloadSha256: string;
}

/**
 * A copy held only for the privacy reading, shown by itself once a later reading passed it, if it otherwise qualifies
 * (Codex's third review, P1): the server's conflict check, made against its candidates (showCandidates, its own
 * dossier's shown copy included, as for automatic publication), never with an override.
 */
export interface ResearchDossierAdmissionInput {
  publicNumber: string;
  versionNumber: number;
  check: ResearchDossierShowCheck;
  at: Date;
}

export type ResearchDossierAdmissionResult =
  /** Shown, marked not checked by supervisors yet. */
  | { outcome: "shown" }
  /** Held instead for an important conflict found now, for the owner's review. */
  | { outcome: "held"; holdReasons: ResearchDossierHoldReason[] }
  /** The check could not be made while a candidate shows: unchanged, and the server tries again. */
  | { outcome: "waiting" }
  /** Held for anything else, taken down, refused, withdrawn, not the newest, or its account may not publish. */
  | { outcome: "not_admissible"; state: ResearchDossierPublicState }
  /** The shown candidates changed since the check: compare again. */
  | { outcome: "comparison_stale" }
  | { outcome: "not_found" };

/** The owner's own statement on a copy whose AI did not say whether a claim names a living person. */
export const RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS = ["names_no_living_person", "names_a_living_person"] as const;
export type ResearchDossierLivingPersonStatement = typeof RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS[number];

/**
 * "Didn't say" is not "no" (Codex's re-review of stage 2, P0): the owner's statement on a copy whose AI did not say,
 * made once. names_no_living_person lets the ordinary show work; names_a_living_person leaves only decideLivingPerson.
 */
export interface ResearchDossierLivingPersonStatementInput {
  publicNumber: string;
  versionNumber: number;
  statement: ResearchDossierLivingPersonStatement;
  /** Who stated it: the reviewer login's digest, reviewer: and 16 hex characters, never the login. */
  statedBy: string;
  at: Date;
}

export type ResearchDossierLivingPersonStatementResult =
  | { outcome: "stated"; state: ResearchDossierPublicState; accepted: boolean }
  | { outcome: "not_found" }
  /** The AI did say, a statement was made already, or it is not the newest copy, held or taken down. */
  | { outcome: "not_decidable"; state: ResearchDossierPublicState; accepted: boolean };

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
  /** For a shown copy, whose revision is new content shown: the conflict check of the revised content, as for a show. */
  check?: ResearchDossierShowCheck;
  at: Date;
}

export type ResearchDossierImportanceRevisionResult =
  | { outcome: "revised"; versionNumber: number; state: ResearchDossierPublicState; previous: string }
  | { outcome: "not_found" }
  /** Not the newest copy, not shown or held, no such finding, or the mark is already that. */
  | { outcome: "not_revisable"; state: ResearchDossierPublicState; previous: string | null }
  /** A shown copy's revision refused by the admission gate, as a show would be: nothing was changed. */
  | { outcome: "comparison_stale"; compared: string[] }
  | { outcome: "conflict_found" | "conflict_not_checked" | "conflicts_over_limit"; state: ResearchDossierPublicState;
    required: string[] };

/** The review role's side: the owner's review, and AskRigor's check of held copies. */
export interface ResearchDossierPublicationReviewStore {
  list(state: ResearchDossierPublicState | undefined, limit: number): Promise<ResearchDossierPublicationRow[]>;
  inspect(publicNumber: string): Promise<ResearchDossierPublicationDetail[]>;
  decide(input: ResearchDossierDecisionInput): Promise<ResearchDossierDecisionResult>;
  decideLivingPerson(input: ResearchDossierLivingPersonDecisionInput): Promise<ResearchDossierDecisionResult>;
  stateLivingPerson(input: ResearchDossierLivingPersonStatementInput): Promise<ResearchDossierLivingPersonStatementResult>;
  reviseImportance(input: ResearchDossierImportanceRevisionInput): Promise<ResearchDossierImportanceRevisionResult>;
  /**
   * The shown copies a held or taken-down copy is compared with before it shows (Codex's third review, P1): its
   * conflict check's candidates, its own dossier's shown copy among them, a page at a time.
   */
  showCandidates(publicNumber: string, versionNumber: number, after: { publicNumber: string; versionNumber: number } | null,
    limit: number): Promise<ResearchDossierTopicCopy[]>;
  /** Held copies waiting for a privacy reading, least recently tried first, 1 to 50. */
  privacyPending(limit: number): Promise<ResearchDossierPrivacyPending[]>;
  recordPrivacyReading(input: ResearchDossierPrivacyReadingInput): Promise<ResearchDossierPrivacyReadingResult>;
  /** Shows a copy held only for the privacy reading that a later reading passed, if it otherwise qualifies. */
  admitAfterPrivacy(input: ResearchDossierAdmissionInput): Promise<ResearchDossierAdmissionResult>;
  /** Such copies that may show but wait for the conflict check, oldest pass first, 1 to 50. */
  admissionPending(limit: number): Promise<ResearchDossierPrivacyPending[]>;
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
  /** The pairs of findings the conflict check read as contradicting (conflictFindingId), for the pages to list. */
  conflictFindings: string[];
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

/**
 * A read of shown copies, newest first: an exact topic or public number is filtered before the limit and the offset
 * (Codex's review of stage 2, finding 8), so an older dossier is found by its own number.
 */
export interface PublicDossierQuery {
  topicKeys?: readonly string[];
  publicNumbers?: readonly string[];
  /** Only the copies that the conflict check found contradicting one of these dossiers (by their conflictsWith). */
  conflictsWith?: readonly string[];
  /** 1 to PUBLIC_DOSSIERS_PER_READ. */
  limit: number;
  /** How many to pass over first, for a later page; 0 to PUBLIC_DOSSIERS_MAX_OFFSET. */
  offset?: number;
}

export const PUBLIC_DOSSIERS_PER_READ = 500;
export const PUBLIC_DOSSIERS_MAX_OFFSET = 100_000;

/** A topic with shown dossiers: its newest copy's name, and how many findings and dossiers it shows. */
export interface PublicDossierTopic {
  topicKey: string;
  name: string;
  findings: number;
  dossiers: number;
}

/**
 * A page of the topics with shown dossiers, in the topics list's order (publicDossierTopicOrder): those after a label
 * and key, those of some keys only, or all but some keys (the card topics, which the list places by their own labels).
 */
export interface PublicDossierTopicQuery {
  after?: { label: string; key: string };
  keys?: readonly string[];
  exclude?: readonly string[];
  limit: number;
}

/** The longest label a topics list's place may name. */
export const PUBLIC_DOSSIER_TOPIC_LABEL_LIMIT = 400;

function assertTopicQuery(query: PublicDossierTopicQuery): void {
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > PUBLIC_DOSSIERS_PER_READ ||
    (query.after !== undefined && (!TOPIC_KEY.test(query.after.key) || typeof query.after.label !== "string" ||
      query.after.label.length > PUBLIC_DOSSIER_TOPIC_LABEL_LIMIT || query.after.label.includes("\u0000"))) ||
    (query.keys !== undefined && !query.keys.every((key) => TOPIC_KEY.test(key))) ||
    (query.exclude !== undefined && !query.exclude.every((key) => TOPIC_KEY.test(key)))) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

/**
 * A label as the topics list orders it (Codex's third review, P2: the list went by key, so "Zulu" came before "Alpha"):
 * its ASCII capitals lower-cased and nothing else changed, so the database orders it exactly as the server does,
 * whatever either one's locale (research_dossier_public_topics, by translate and COLLATE "C").
 */
export const foldTopicLabel = (label: string) => label.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());

/** The topics list's order: by folded label, as UTF-8 bytes (code points), then by key. */
export function publicDossierTopicOrder(left: { label: string; key: string }, right: { label: string; key: string }):
  number {
  return Buffer.compare(Buffer.from(foldTopicLabel(left.label), "utf8"), Buffer.from(foldTopicLabel(right.label), "utf8")) ||
    Buffer.compare(Buffer.from(left.key, "utf8"), Buffer.from(right.key, "utf8"));
}

/** The pages' reader side. */
export interface PublicDossierPageSource {
  listShown(query: PublicDossierQuery): Promise<PublicDossierCopy[]>;
  history(publicNumbers: readonly string[]): Promise<PublicDossierHistoryEntry[]>;
  /**
   * The topics with shown dossiers, a page at a time (Codex's re-review of stage 2): in the order of their keys, after
   * the key given, at most limit (1 to PUBLIC_DOSSIERS_PER_READ); never every topic at once.
   */
  listTopics(query: PublicDossierTopicQuery): Promise<PublicDossierTopic[]>;
  /**
   * A value that changes with every change to the copies, made by any process or trigger: a cached dossier page is
   * kept under it, so every server renders again after a publication, a decision, a revocation or an erasure (finding 9).
   */
  generation(): Promise<string>;
}

export class ResearchDossierPublicationError extends Error {
  constructor(readonly code: "INPUT_INVALID") {
    super(`RESEARCH_DOSSIER_PUBLICATION_${code}`);
  }
}

function assertPublishInput(input: ResearchDossierPublishInput): void {
  if (!HEX_64.test(input.accountKey) || !UUID.test(input.versionId) || input.payload === null ||
    typeof input.payload !== "object" || Array.isArray(input.payload) ||
    showCheckInvalid({ compared: input.compared, conflictCheck: input.conflictCheck,
      conflictFindings: input.conflictFindings, overrideBy: null, overrideConflicts: [] }) ||
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
    holdReasons: ResearchDossierAutoHoldReason[]; privacyRead: boolean; namesLivingPerson: boolean | null } {
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
  return { state: holdReasons.length === 0 ? "shown" : "held", holdReasons, privacyRead,
    namesLivingPerson: typeof named === "boolean" ? named : null };
}

// What can stop a page in a text the pages write escaped (the research server's atlas/page-guard.ts): a findings card's
// reference or a YouTube host's name, whatever the case. Written out letter by letter, as the database's
// research_dossier_public_passes_page_guard writes them, so that neither depends on a locale's case rules.
const PAGE_CARD_REFERENCE = /[Aa][Rr][Ff]-[0-9]{4}/u;
const PAGE_YOUTUBE_HOST = /[Yy][Oo][Uu][Tt][Uu](?:[Bb][Ee](?:-[Nn][Oo][Cc][Oo][Oo][Kk][Ii][Ee])?\.[Cc][Oo][Mm]|\.[Bb][Ee])/u;
const KELVIN_SIGN = /\u212A/gu;

/**
 * The pages' last check, repeated at admission as research_dossier_public_passes_page_guard (Codex's re-review of
 * stage 2, P2): every text of a public part, at any depth, read without its format characters and with the Kelvin sign
 * as the k it folds to, holds no findings card's reference and no YouTube host's name. A text the pages write escaped
 * can stop a page only so; the research server's rowPassesPageGuard gives the same answer for every text.
 */
export function publicCopyPassesPageGuard(projection: unknown): boolean {
  const texts: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") texts.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(projection);
  return texts.every((text) => {
    const shown = withoutFormatCharacters(text).replace(KELVIN_SIGN, "k");
    return !PAGE_CARD_REFERENCE.test(shown) && !PAGE_YOUTUBE_HOST.test(shown);
  });
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
    (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0 ||
      query.offset > PUBLIC_DOSSIERS_MAX_OFFSET)) ||
    (query.topicKeys !== undefined && !query.topicKeys.every((key) => TOPIC_KEY.test(key))) ||
    (query.publicNumbers !== undefined && !query.publicNumbers.every((number) => PUBLIC_DOSSIER_NUMBER.test(number))) ||
    (query.conflictsWith !== undefined && !query.conflictsWith.every((number) => PUBLIC_DOSSIER_NUMBER.test(number)))) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

/** Whether a show's conflict check is malformed, as research_dossier_show_check_invalid reads it. */
function showCheckInvalid(check: ResearchDossierShowCheck): boolean {
  return !Array.isArray(check.compared) || !check.compared.every((id) => /^D-[1-9][0-9]{3,}\/[1-9][0-9]*$/u.test(id)) ||
    (check.conflictCheck !== "read" && check.conflictCheck !== "not_read") || !Array.isArray(check.conflictFindings) ||
    !check.conflictFindings.every((id) => readConflictFinding(id) !== undefined) ||
    (check.conflictCheck === "not_read" && check.conflictFindings.length > 0) ||
    (check.overrideBy !== null && !/^reviewer:[0-9a-f]{16}$/u.test(check.overrideBy)) ||
    !Array.isArray(check.overrideConflicts) || check.overrideConflicts.length > 200 ||
    !check.overrideConflicts.every((number) => PUBLIC_DOSSIER_NUMBER.test(number)) ||
    (check.overrideBy === null && check.overrideConflicts.length > 0);
}

/** The shown dossiers a copy's pairs name, by public number, once each, in order. */
const conflictPartners = (pairs: readonly string[]) =>
  [...new Set(pairs.map((pair) => readConflictFinding(pair)!.publicNumber))].sort();

function assertDecision(input: ResearchDossierDecisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !(RESEARCH_DOSSIER_PUBLIC_DECISIONS as readonly string[]).includes(input.decision) ||
    (input.reason !== null && (input.reason !== input.reason.trim() || input.reason.length < 1 || input.reason.length > 200)) ||
    showCheckInvalid(input.check ?? NO_SHOW_CHECK) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertLivingPersonStatement(input: ResearchDossierLivingPersonStatementInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !(RESEARCH_DOSSIER_LIVING_PERSON_STATEMENTS as readonly string[]).includes(input.statement) ||
    !/^reviewer:[0-9a-f]{16}$/u.test(input.statedBy) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertPrivacyReading(input: ResearchDossierPrivacyReadingInput): void {
  const { reading } = input;
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !HEX_64.test(input.contentSha256) || Number.isNaN(input.at.getTime()) ||
    !(reading.status === "pass" ||
      (reading.status === "refuse" && (RESEARCH_DOSSIER_PRIVACY_REFUSALS as readonly string[]).includes(reading.reason) &&
        (reading.path === undefined || (PRIVACY_PATH.test(reading.path) && reading.path.length <= 200))) ||
      (reading.status === "unavailable" &&
        (RESEARCH_DOSSIER_PRIVACY_UNAVAILABLE as readonly string[]).includes(reading.reason)))) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

/** Whether a privacy reading passed a copy's content: when it was saved, or later, bound to exactly its content. */
function privacyPassed(copy: { privacyRead: boolean; payloadSha256: string | null;
  laterPrivacy: { outcome: string; sha256: string } | null }): boolean {
  return copy.privacyRead || (copy.laterPrivacy?.outcome === "passed" && copy.laterPrivacy.sha256 === copy.payloadSha256);
}

function assertAdmission(input: ResearchDossierAdmissionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || showCheckInvalid(input.check) || input.check.overrideBy !== null ||
    Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertImportanceRevision(input: ResearchDossierImportanceRevisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || !/^[a-z][a-z0-9_-]{0,31}$/u.test(input.findingId) ||
    !["decision_changing", "important", "context"].includes(input.importance) || typeof input.reason !== "string" ||
    input.reason !== input.reason.trim() || input.reason.length < 1 || input.reason.length > 200 ||
    !/^reviewer:[0-9a-f]{16}$/u.test(input.revisedBy) || showCheckInvalid(input.check ?? NO_SHOW_CHECK) ||
    Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

function assertLivingPersonDecision(input: ResearchDossierLivingPersonDecisionInput): void {
  if (!PUBLIC_DOSSIER_NUMBER.test(input.publicNumber) || !Number.isInteger(input.versionNumber) ||
    input.versionNumber < 1 || typeof input.reason !== "string" || input.reason !== input.reason.trim() ||
    input.reason.length < 1 || input.reason.length > 200 || !/^reviewer:[0-9a-f]{16}$/u.test(input.decidedBy) ||
    showCheckInvalid(input.check ?? NO_SHOW_CHECK) || Number.isNaN(input.at.getTime())) {
    throw new ResearchDossierPublicationError("INPUT_INVALID");
  }
}

/**
 * Whether nothing about a named living person keeps a copy from the ordinary show (Codex's re-review of stage 2, P0):
 * its AI declared that no claim names one, or, when it did not say, the owner stated so; or the owner's own decision
 * showed a claim that names one. "Didn't say" alone is never enough.
 */
function livingPersonClear(copy: { namesLivingPerson: boolean | null; livingPersonDecision: unknown;
  livingPersonStatement: { statement: ResearchDossierLivingPersonStatement } | null }): boolean {
  return copy.livingPersonDecision !== null || copy.namesLivingPerson === false ||
    (copy.namesLivingPerson === null && copy.livingPersonStatement?.statement === "names_no_living_person");
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
         $1, $2::uuid, $3::jsonb, $4::text[], $5, $6::text[], $7::timestamptz)`,
      [input.accountKey, input.versionId, JSON.stringify(input.payload), [...input.compared], input.conflictCheck,
        [...input.conflictFindings], input.at.toISOString()],
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
  names_living_person: boolean | null;
  living_person_statement: ResearchDossierLivingPersonStatement | null;
  living_person_stated_by: string | null;
  living_person_stated_at: Date | string | null;
  privacy_reading_outcome: "passed" | "refused" | null;
  privacy_reading_reason: ResearchDossierPrivacyRefusal | null;
  privacy_reading_path: string | null;
  privacy_reading_at: Date | string | null;
  privacy_unavailable_reason: ResearchDossierPrivacyUnavailable | null;
  privacy_unavailable_at: Date | string | null;
  living_person_decided_by: string | null;
  living_person_decided_at: Date | string | null;
  living_person_reason: string | null;
  revision_of: number | null;
  revised_by: string | null;
  revision_reason: string | null;
  conflict_findings: string[];
  conflict_override_by: string | null;
  conflict_override_at: Date | string | null;
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
  laterPrivacyReading: row.privacy_reading_outcome === null || row.privacy_reading_at === null ? null
    : { outcome: row.privacy_reading_outcome, reason: row.privacy_reading_reason, path: row.privacy_reading_path,
      at: iso(row.privacy_reading_at) },
  privacyUnavailable: row.privacy_unavailable_reason === null || row.privacy_unavailable_at === null ? null
    : { reason: row.privacy_unavailable_reason, at: iso(row.privacy_unavailable_at) },
  accepted: row.accepted,
  decidedAt: iso(row.decided_at),
  namesLivingPerson: row.names_living_person,
  livingPersonStatement: row.living_person_statement === null || row.living_person_stated_by === null ||
    row.living_person_stated_at === null ? null : { statement: row.living_person_statement,
      by: row.living_person_stated_by, at: iso(row.living_person_stated_at) },
  livingPersonDecision: row.living_person_decided_at === null || row.living_person_decided_by === null ||
    row.living_person_reason === null ? null
    : { by: row.living_person_decided_by, at: iso(row.living_person_decided_at), reason: row.living_person_reason },
  revision: row.revision_of === null || row.revised_by === null ? null
    : { of: row.revision_of, by: row.revised_by, reason: row.revision_reason },
  conflictFindings: row.conflict_findings,
  conflictOverride: row.conflict_override_by === null || row.conflict_override_at === null ? null
    : { by: row.conflict_override_by, at: iso(row.conflict_override_at) },
});

/** A decision's outcome row, read back. */
interface DecisionRow {
  outcome: string;
  state: ResearchDossierPublicState | null;
  accepted: boolean | null;
  candidates: string[] | null;
  required: string[] | null;
}

function decisionOf(row: DecisionRow | undefined): ResearchDossierDecisionResult {
  if (row === undefined) throw new Error("RESEARCH_DOSSIER_DECISION_RESULT_MISSING");
  if (row.outcome === "not_found") return { outcome: "not_found" };
  if (row.outcome === "comparison_stale" && row.candidates !== null) {
    return { outcome: "comparison_stale", compared: row.candidates };
  }
  if ((row.outcome === "conflict_found" || row.outcome === "conflict_not_checked" ||
    row.outcome === "conflicts_over_limit") && row.state !== null && row.accepted !== null && row.required !== null) {
    return { outcome: row.outcome, state: row.state, accepted: row.accepted, required: row.required };
  }
  if ((row.outcome !== "decided" && row.outcome !== "not_decidable") || row.state === null || row.accepted === null) {
    throw new Error("RESEARCH_DOSSIER_DECISION_RESULT_INVALID");
  }
  return { outcome: row.outcome, state: row.state, accepted: row.accepted };
}

/** A show's conflict check as the decision functions take it, after their own inputs and before the time. */
const checkParameters = (check: ResearchDossierShowCheck = NO_SHOW_CHECK) => [[...check.compared], check.conflictCheck,
  [...check.conflictFindings], check.overrideBy, [...check.overrideConflicts]];

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
    const result = await this.pool.query<DecisionRow>(
      `SELECT outcome, state, accepted, candidates, required FROM ${this.schema}.decide_research_dossier_publication(
         $1, $2, $3, $4, $5::text[], $6, $7::text[], $8, $9::text[], $10::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.decision, input.reason, ...checkParameters(input.check),
        input.at.toISOString()],
    );
    return decisionOf(result.rows[0]);
  }

  async showCandidates(publicNumber: string, versionNumber: number,
    after: { publicNumber: string; versionNumber: number } | null, limit: number): Promise<ResearchDossierTopicCopy[]> {
    if (!PUBLIC_DOSSIER_NUMBER.test(publicNumber) || !Number.isInteger(versionNumber) || versionNumber < 1 ||
      !Number.isInteger(limit) || limit < 1 || limit > CONFLICT_CANDIDATES_PER_PAGE ||
      (after !== null && !PUBLIC_DOSSIER_NUMBER.test(after.publicNumber))) {
      throw new ResearchDossierPublicationError("INPUT_INVALID");
    }
    const result = await this.pool.query<{ public_number: string; version_number: number; topic_key: string;
      public_payload: Record<string, unknown> }>(
      `SELECT public_number, version_number, topic_key, public_payload
         FROM ${this.schema}.research_dossier_show_candidates($1, $2, $3, $4, $5)`,
      [publicNumber, versionNumber, after?.publicNumber ?? null, after?.versionNumber ?? null, limit],
    );
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      topicKey: row.topic_key, payload: row.public_payload }));
  }

  async reviseImportance(input: ResearchDossierImportanceRevisionInput): Promise<ResearchDossierImportanceRevisionResult> {
    assertImportanceRevision(input);
    const result = await this.pool.query<{ outcome: string; version_number: number | null;
      state: ResearchDossierPublicState | null; previous_importance: string | null; candidates: string[] | null;
      required: string[] | null }>(
      `SELECT outcome, version_number, state, previous_importance, candidates, required
         FROM ${this.schema}.revise_research_dossier_importance(
         $1, $2, $3, $4, $5, $6, $7::text[], $8, $9::text[], $10, $11::text[], $12::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.findingId, input.importance, input.reason, input.revisedBy,
        ...checkParameters(input.check), input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_REVISION_RESULT_MISSING");
    if (row.outcome === "not_found") return { outcome: "not_found" };
    if (row.outcome === "comparison_stale" && row.candidates !== null) {
      return { outcome: "comparison_stale", compared: row.candidates };
    }
    if ((row.outcome === "conflict_found" || row.outcome === "conflict_not_checked" ||
      row.outcome === "conflicts_over_limit") && row.state !== null && row.required !== null) {
      return { outcome: row.outcome, state: row.state, required: row.required };
    }
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
    const result = await this.pool.query<DecisionRow>(
      `SELECT outcome, state, accepted, candidates, required FROM ${this.schema}.decide_research_dossier_living_person(
         $1, $2, $3, $4, $5::text[], $6, $7::text[], $8, $9::text[], $10::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.reason, input.decidedBy, ...checkParameters(input.check),
        input.at.toISOString()],
    );
    return decisionOf(result.rows[0]);
  }

  async privacyPending(limit: number): Promise<ResearchDossierPrivacyPending[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ResearchDossierPublicationError("INPUT_INVALID");
    const result = await this.pool.query<{ public_number: string; version_number: number;
      public_payload: Record<string, unknown>; public_sha256: string }>(
      `SELECT public_number, version_number, public_payload, public_sha256
         FROM ${this.schema}.list_research_dossier_privacy_pending($1)`, [limit]);
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      payload: row.public_payload, payloadSha256: row.public_sha256 }));
  }

  async recordPrivacyReading(input: ResearchDossierPrivacyReadingInput): Promise<ResearchDossierPrivacyReadingResult> {
    assertPrivacyReading(input);
    const { reading } = input;
    const result = await this.pool.query<{ outcome: string; state: ResearchDossierPublicState | null }>(
      `SELECT outcome, state FROM ${this.schema}.record_research_dossier_privacy_reading(
         $1, $2, $3, $4, $5, $6, $7::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.contentSha256,
        reading.status === "pass" ? "passed" : reading.status === "refuse" ? "refused" : "unavailable",
        reading.status === "pass" ? null : reading.reason, reading.status === "refuse" ? reading.path ?? null : null,
        input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_PRIVACY_READING_RESULT_MISSING");
    if (row.outcome === "not_found") return { outcome: "not_found" };
    if ((row.outcome !== "recorded" && row.outcome !== "not_readable") || row.state === null) {
      throw new Error("RESEARCH_DOSSIER_PRIVACY_READING_RESULT_INVALID");
    }
    return { outcome: row.outcome, state: row.state };
  }

  async admitAfterPrivacy(input: ResearchDossierAdmissionInput): Promise<ResearchDossierAdmissionResult> {
    assertAdmission(input);
    const { check } = input;
    const result = await this.pool.query<{ outcome: string; state: ResearchDossierPublicState | null;
      hold_reasons: ResearchDossierHoldReason[] | null }>(
      `SELECT outcome, state, hold_reasons FROM ${this.schema}.admit_research_dossier_after_privacy(
         $1, $2, $3::text[], $4, $5::text[], $6::timestamptz)`,
      [input.publicNumber, input.versionNumber, [...check.compared], check.conflictCheck, [...check.conflictFindings],
        input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_ADMISSION_RESULT_MISSING");
    if (row.outcome === "shown" || row.outcome === "waiting" || row.outcome === "comparison_stale" ||
      row.outcome === "not_found") {
      return { outcome: row.outcome };
    }
    if (row.outcome === "held" && row.hold_reasons !== null) return { outcome: "held", holdReasons: row.hold_reasons };
    if (row.outcome === "not_admissible" && row.state !== null) return { outcome: "not_admissible", state: row.state };
    throw new Error("RESEARCH_DOSSIER_ADMISSION_RESULT_INVALID");
  }

  async admissionPending(limit: number): Promise<ResearchDossierPrivacyPending[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ResearchDossierPublicationError("INPUT_INVALID");
    const result = await this.pool.query<{ public_number: string; version_number: number;
      public_payload: Record<string, unknown>; public_sha256: string }>(
      `SELECT public_number, version_number, public_payload, public_sha256
         FROM ${this.schema}.list_research_dossier_admission_pending($1)`, [limit]);
    return result.rows.map((row) => ({ publicNumber: row.public_number, versionNumber: row.version_number,
      payload: row.public_payload, payloadSha256: row.public_sha256 }));
  }

  async stateLivingPerson(input: ResearchDossierLivingPersonStatementInput):
    Promise<ResearchDossierLivingPersonStatementResult> {
    assertLivingPersonStatement(input);
    const result = await this.pool.query<{ outcome: string; state: ResearchDossierPublicState | null;
      accepted: boolean | null }>(
      `SELECT outcome, state, accepted FROM ${this.schema}.state_research_dossier_living_person(
         $1, $2, $3, $4, $5::timestamptz)`,
      [input.publicNumber, input.versionNumber, input.statement, input.statedBy, input.at.toISOString()],
    );
    const row = result.rows[0];
    if (row === undefined) throw new Error("RESEARCH_DOSSIER_STATEMENT_RESULT_MISSING");
    if (row.outcome === "not_found") return { outcome: "not_found" };
    if ((row.outcome !== "stated" && row.outcome !== "not_decidable") || row.state === null || row.accepted === null) {
      throw new Error("RESEARCH_DOSSIER_STATEMENT_RESULT_INVALID");
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
      shown_at: Date | string; conflicts_with: string[]; conflict_findings: string[] }>(
      `SELECT public_number, version_number, topic_key, related_topic_keys, public_payload, public_sha256, accepted,
              shown_at, conflicts_with, conflict_findings
         FROM ${this.schema}.research_dossier_public_pages
        WHERE ($1::text[] IS NULL OR topic_key = ANY($1::text[]))
          AND ($2::text[] IS NULL OR public_number = ANY($2::text[]))
          AND ($5::text[] IS NULL OR conflicts_with && $5::text[])
        ORDER BY shown_at DESC, public_number
        LIMIT $3 OFFSET $4`,
      [query.topicKeys === undefined ? null : [...query.topicKeys],
        query.publicNumbers === undefined ? null : [...query.publicNumbers], query.limit, query.offset ?? 0,
        query.conflictsWith === undefined ? null : [...query.conflictsWith]],
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
      conflictFindings: row.conflict_findings,
    }));
  }

  async listTopics(query: PublicDossierTopicQuery): Promise<PublicDossierTopic[]> {
    assertTopicQuery(query);
    // The list's order (publicDossierTopicOrder): the label with its ASCII capitals lower-cased, as bytes, then the key.
    const folded = `translate(name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') COLLATE "C"`;
    const result = await this.pool.query<{ topic_key: string; name: string | null; findings: number; dossiers: number }>(
      `SELECT topic_key, name, findings, dossiers FROM ${this.schema}.research_dossier_public_topics
        WHERE name IS NOT NULL
          AND ($1::text[] IS NULL OR topic_key = ANY($1::text[]))
          AND ($2::text[] IS NULL OR NOT topic_key = ANY($2::text[]))
          AND ($3::text IS NULL OR (${folded}, topic_key COLLATE "C") > ($3::text COLLATE "C", $4::text COLLATE "C"))
        ORDER BY ${folded}, topic_key COLLATE "C"
        LIMIT $5`, [query.keys === undefined ? null : [...query.keys], query.exclude === undefined ? null : [...query.exclude],
        query.after === undefined ? null : foldTopicLabel(query.after.label), query.after?.key ?? null, query.limit]);
    return result.rows.flatMap((row) => row.name === null ? [] : [{ topicKey: row.topic_key, name: row.name,
      findings: row.findings, dossiers: row.dossiers }]);
  }

  async generation(): Promise<string> {
    const result = await this.pool.query<{ generation: string | number }>(
      `SELECT generation FROM ${this.schema}.research_dossier_public_changes`);
    return String(result.rows[0]?.generation ?? 0);
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
  conflictFindings: string[];
  conflictOverride: { by: string; at: Date } | null;
  origin: Record<string, unknown>;
  privacyRead: boolean;
  laterPrivacy: { outcome: "passed" | "refused"; sha256: string; reason: ResearchDossierPrivacyRefusal | null;
    path: string | null; at: Date } | null;
  privacyUnavailable: { reason: ResearchDossierPrivacyUnavailable; at: Date } | null;
  namesLivingPerson: boolean | null;
  livingPersonStatement: { statement: ResearchDossierLivingPersonStatement; by: string; at: Date } | null;
  livingPersonDecision: { by: string; at: Date; reason: string } | null;
  revision: { of: number; by: string; reason: string | null } | null;
  acceptedAt: Date | null;
  decidedAt: Date;
  events: Array<{ event: string; reason: string | null; at: Date }>;
}

/** The admission gate's word, as research_dossier_show_refusal returns it. */
interface MemoryGate {
  refusal: "comparison_stale" | "conflict_found" | "conflict_not_checked" | "conflicts_over_limit" | "overridden" | null;
  candidates: string[];
  required: string[];
  kept: string[];
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
    const stored = this.options.dossiers.versionPayload(input.versionId);
    if (!facts.newest || facts.closed || facts.erased || stored === null || stored === undefined) {
      return { outcome: "version_refused" };
    }
    let projection: Record<string, unknown>;
    try {
      projection = this.options.project(stored);
    } catch {
      return { outcome: "payload_refused" };
    }
    const topic = (projection.topic ?? {}) as { key?: unknown; related?: unknown };
    if (stableJson(projection) !== stableJson(input.payload) || typeof topic.key !== "string" ||
      !TOPIC_KEY.test(topic.key) || !this.options.sizesComplete(projection) || !publicCopyPassesPageGuard(projection)) {
      return { outcome: "payload_refused" };
    }
    // Admitted one at a time, as the database's topic locks do, by the admission gate: never overridden here.
    const gate = this.gate(projection, null, true, { compared: input.compared, conflictCheck: input.conflictCheck,
      conflictFindings: input.conflictFindings, overrideBy: null, overrideConflicts: [] });
    if (gate.refusal === "comparison_stale" && input.conflictCheck === "read") return { outcome: "comparison_stale" };
    const admission = researchDossierAdmission(stored, projection, gate.refusal !== null && input.conflictCheck === "read",
      gate.refusal !== null && input.conflictCheck === "not_read");
    const stamp = (stored.stamp ?? {}) as { origin?: unknown };
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
      conflictsWith: conflictPartners(gate.kept),
      conflictFindings: [],
      conflictOverride: null,
      origin,
      privacyRead: admission.privacyRead,
      laterPrivacy: null,
      privacyUnavailable: null,
      namesLivingPerson: admission.namesLivingPerson,
      livingPersonStatement: null,
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
    const stored = this.options.dossiers.versionPayload(versionId);
    if (facts === undefined || facts.accountKey !== accountKey || stored === null || stored === undefined) return [];
    return this.matches(this.options.project(stored))
      .filter((copy) => after === null || candidateOrder(copy, after) > 0)
      .slice(0, limit)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, topicKey: copy.topicKey!,
        payload: structuredClone(copy.payload!) }));
  }

  async showCandidates(publicNumber: string, versionNumber: number,
    after: { publicNumber: string; versionNumber: number } | null, limit: number): Promise<ResearchDossierTopicCopy[]> {
    this.followPrivate();
    const copy = this.copies.get(`${publicNumber}#${versionNumber}`);
    if (copy === undefined || copy.payload === null) return [];
    return this.matches(copy.payload)
      .filter((other) => other !== copy && (after === null || candidateOrder(other, after) > 0))
      .slice(0, limit)
      .map((other) => ({ publicNumber: other.publicNumber, versionNumber: other.versionNumber, topicKey: other.topicKey!,
        payload: structuredClone(other.payload!) }));
  }

  /**
   * The admission gate, as research_dossier_show_refusal: the complete, current set of candidates (its own dossier's
   * shown copy only when withOwn), stale unless compared with exactly them, read or not; from every pair, the important
   * ones (by the two copies' own marks) and the dossiers an override must cover, before anything is cut; more than
   * CONFLICT_OVERRIDE_LIMIT of them keeps the copy as it is; an override must name every one; then the pairs kept, one
   * for each dossier the override covers first.
   */
  private gate(payload: Record<string, unknown>, self: { publicNumber: string; versionNumber: number } | null,
    withOwn: boolean, check: ResearchDossierShowCheck): MemoryGate {
    const shown = this.matches(payload).filter((other) => !(self !== null && other.publicNumber === self.publicNumber &&
      other.versionNumber === self.versionNumber) && (withOwn || other.publicNumber !== self?.publicNumber));
    const candidates = shown.map(conflictCandidateId).sort();
    const byId = new Map(shown.map((other) => [conflictCandidateId(other), other]));
    const findingOf = (content: Record<string, unknown> | null | undefined, id: string) =>
      ((content?.findings ?? []) as Array<Record<string, unknown>>).find((finding) => finding.id === id);
    const pairs = [...new Set(check.conflictFindings)].sort();
    const theirsOf = (pair: string) => {
      const read = readConflictFinding(pair)!;
      return { read, theirs: byId.get(`${read.publicNumber}/${read.versionNumber}`) };
    };
    if (stableJson(candidates) !== stableJson([...check.compared].sort()) || !pairs.every((pair) => {
      const { read, theirs } = theirsOf(pair);
      return theirs !== undefined && findingOf(payload, read.finding) !== undefined &&
        findingOf(theirs.payload, read.theirs) !== undefined;
    })) {
      return { refusal: "comparison_stale", candidates, required: [], kept: [] };
    }
    const weighty = new Set(pairs.filter((pair) => {
      const { read, theirs } = theirsOf(pair);
      return findingOf(payload, read.finding)?.importance !== "context" ||
        findingOf(theirs!.payload, read.theirs)?.importance !== "context";
    }));
    const required = check.conflictCheck === "read" ? conflictPartners([...weighty])
      : [...new Set(candidates.map((id) => id.split("/")[0]!))].sort();
    const refusal = required.length === 0 ? null : required.length > CONFLICT_OVERRIDE_LIMIT ? "conflicts_over_limit"
      : check.overrideBy === null || !required.every((number) => check.overrideConflicts.includes(number))
        ? check.conflictCheck === "read" ? "conflict_found" : "conflict_not_checked" : "overridden";
    const order = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
    const first = new Set<string>();
    const covered = new Set<string>();
    for (const pair of [...pairs].sort((left, right) => Number(weighty.has(right)) - Number(weighty.has(left)) ||
      order(left, right))) {
      const partner = readConflictFinding(pair)!.publicNumber;
      if (!covered.has(partner)) {
        covered.add(partner);
        first.add(pair);
      }
    }
    const kept = [...pairs].sort((left, right) => Number(first.has(right)) - Number(first.has(left)) ||
      Number(weighty.has(right)) - Number(weighty.has(left)) || order(left, right)).slice(0, CONFLICT_OVERRIDE_LIMIT);
    return { refusal, candidates, required, kept };
  }

  /** What a show records of the gate's word: the pairs kept, the dossiers they name, and an override with its event. */
  private recordShowCheck(copy: MemoryCopy, check: ResearchDossierShowCheck, gate: MemoryGate, at: Date,
    versionEvents: MemoryCopy["events"] = copy.events): void {
    Object.assign(copy, { conflictsWith: conflictPartners(gate.kept), conflictFindings: [...gate.kept],
      conflictOverride: gate.refusal === "overridden" ? { by: check.overrideBy!, at } : null });
    if (gate.refusal === "overridden") {
      versionEvents.push({ event: "conflict_overridden", reason: `${check.overrideBy} ${check.conflictCheck === "read"
        ? `over ${gate.required.join(" ")}` : "without the conflict check"}`.slice(0, 200).trimEnd(), at });
    }
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
        !privacyPassed(copy) || !livingPersonClear(copy)));
    if (refused) return { outcome: "not_decidable", state: copy.state, accepted };
    const next: ResearchDossierPublicState = input.decision === "hold" ? "held"
      : input.decision === "take_down" ? "taken_down" : "shown";
    // A copy not shown yet is compared with the shown dossiers before it is (Codex's third review, P1).
    if (next === "shown" && copy.state !== "shown") {
      const check = input.check ?? NO_SHOW_CHECK;
      const gate = this.gate(copy.payload!, copy, false, check);
      if (gate.refusal === "comparison_stale") return { outcome: gate.refusal, compared: gate.candidates };
      if (gate.refusal !== null && gate.refusal !== "overridden") {
        return { outcome: gate.refusal, state: copy.state, accepted, required: gate.required };
      }
      this.recordShowCheck(copy, check, gate, input.at);
    }
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
    // A shown copy's revision is new content shown: through the admission gate, its own dossier's aside.
    const check = input.check ?? NO_SHOW_CHECK;
    const gate = copy.state === "shown" ? this.gate(payload, copy, false, check) : undefined;
    if (gate?.refusal === "comparison_stale") return { outcome: gate.refusal, compared: gate.candidates };
    if (gate !== undefined && gate.refusal !== null && gate.refusal !== "overridden") {
      return { outcome: gate.refusal, state: copy.state, required: gate.required };
    }
    const versionNumber = newest + 1;
    copy.events.push({ event: "superseded", reason: null, at: input.at });
    const state = copy.state;
    const revisedSha256 = sha256(stableJson(payload));
    this.copies.set(`${copy.publicNumber}#${versionNumber}`, {
      ...structuredClone({ ...copy, events: [] }), versionId: copy.versionId, versionNumber, payload,
      payloadSha256: revisedSha256, decidedAt: input.at, acceptedAt: copy.acceptedAt,
      // As the database does: a later reading carries to the revised mark, bound to the new content's digest.
      laterPrivacy: copy.laterPrivacy === null ? null : { ...copy.laterPrivacy, sha256: revisedSha256 },
      livingPersonDecision: copy.livingPersonDecision,
      revision: { of: copy.versionNumber, by: input.revisedBy, reason: input.reason },
      events: [{ event: "revised", reason: input.reason, at: input.at }, { event: state, reason: null, at: input.at }],
    });
    if (gate !== undefined) this.recordShowCheck(this.copies.get(`${copy.publicNumber}#${versionNumber}`)!, check, gate, input.at);
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
    if (!(copy.namesLivingPerson === true || copy.livingPersonStatement?.statement === "names_a_living_person") ||
      copy.livingPersonDecision !== null || (copy.state !== "held" &&
      copy.state !== "taken_down") || copy.versionNumber !== newest || !privacyPassed(copy) || (!accepted && closed)) {
      return { outcome: "not_decidable", state: copy.state, accepted };
    }
    const check = input.check ?? NO_SHOW_CHECK;
    const gate = this.gate(copy.payload!, copy, false, check);
    if (gate.refusal === "comparison_stale") return { outcome: gate.refusal, compared: gate.candidates };
    if (gate.refusal !== null && gate.refusal !== "overridden") {
      return { outcome: gate.refusal, state: copy.state, accepted, required: gate.required };
    }
    this.recordShowCheck(copy, check, gate, input.at);
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

  async privacyPending(limit: number): Promise<ResearchDossierPrivacyPending[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ResearchDossierPublicationError("INPUT_INVALID");
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => copy.state === "held" && copy.payload !== null && !copy.privacyRead && copy.laterPrivacy === null &&
        copy.privacyUnavailable?.reason !== "too_long")
      .sort((left, right) => (left.privacyUnavailable?.at.getTime() ?? -Infinity) -
        (right.privacyUnavailable?.at.getTime() ?? -Infinity) || left.decidedAt.getTime() - right.decidedAt.getTime() ||
        left.publicNumber.localeCompare(right.publicNumber) || left.versionNumber - right.versionNumber)
      .slice(0, limit)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber,
        payload: structuredClone(copy.payload!), payloadSha256: copy.payloadSha256! }));
  }

  async recordPrivacyReading(input: ResearchDossierPrivacyReadingInput): Promise<ResearchDossierPrivacyReadingResult> {
    assertPrivacyReading(input);
    this.followPrivate();
    const copy = this.copies.get(`${input.publicNumber}#${input.versionNumber}`);
    if (copy === undefined) return { outcome: "not_found" };
    if ((copy.state !== "held" && copy.state !== "taken_down") || copy.privacyRead || copy.laterPrivacy !== null ||
      copy.payloadSha256 !== input.contentSha256) {
      return { outcome: "not_readable", state: copy.state };
    }
    const { reading } = input;
    if (reading.status === "unavailable") {
      copy.privacyUnavailable = { reason: reading.reason, at: input.at };
    } else {
      copy.laterPrivacy = { outcome: reading.status === "pass" ? "passed" : "refused", sha256: input.contentSha256,
        reason: reading.status === "refuse" ? reading.reason : null,
        path: reading.status === "refuse" ? reading.path ?? null : null, at: input.at };
      copy.events.push({ event: `privacy_reading_${copy.laterPrivacy.outcome}`,
        reason: copy.laterPrivacy.reason, at: input.at });
    }
    return { outcome: "recorded", state: copy.state };
  }

  /** Whether a copy held only for the privacy reading may now show by itself, as research_dossier_admissible. */
  private async admissible(copy: MemoryCopy): Promise<boolean> {
    if (copy.state !== "held" || copy.payload === null || copy.versionId === null ||
      stableJson(copy.holdReasons) !== stableJson(["privacy_reading_pending"]) || copy.privacyRead ||
      copy.laterPrivacy?.outcome !== "passed" || copy.laterPrivacy.sha256 !== copy.payloadSha256 ||
      copy.namesLivingPerson !== false || (copy.payload.value as { confidence?: unknown } | undefined)?.confidence !== "high" ||
      !this.options.sizesComplete(copy.payload) || !publicCopyPassesPageGuard(copy.payload) ||
      copy.versionNumber !== this.nextVersion(copy.publicNumber) - 1) {
      return false;
    }
    const facts = this.options.dossiers.versionFacts(copy.versionId);
    return facts !== undefined && facts.accountKey !== null && facts.newest && !facts.closed && !facts.erased &&
      !facts.accountRevoked && await (this.options.eligible?.(facts.accountKey) ?? true);
  }

  async admitAfterPrivacy(input: ResearchDossierAdmissionInput): Promise<ResearchDossierAdmissionResult> {
    assertAdmission(input);
    this.followPrivate();
    const copy = this.copies.get(`${input.publicNumber}#${input.versionNumber}`);
    if (copy === undefined) return { outcome: "not_found" };
    if (!(await this.admissible(copy))) return { outcome: "not_admissible", state: copy.state };
    const gate = this.gate(copy.payload!, copy, true, input.check);
    if (gate.refusal === "comparison_stale") return { outcome: gate.refusal };
    if (gate.refusal === "conflict_not_checked" ||
      (gate.refusal === "conflicts_over_limit" && input.check.conflictCheck === "not_read")) {
      return { outcome: "waiting" };
    }
    Object.assign(copy, { conflictsWith: conflictPartners(gate.kept), conflictFindings: [...gate.kept],
      decidedAt: input.at });
    if (gate.refusal === "conflict_found" || gate.refusal === "conflicts_over_limit") {
      copy.holdReasons = ["important_conflict"];
      copy.events.push({ event: "held", reason: "important_conflict", at: input.at });
      return { outcome: "held", holdReasons: ["important_conflict"] };
    }
    for (const other of this.copies.values()) {
      if (other !== copy && other.publicNumber === copy.publicNumber && other.state === "shown") {
        Object.assign(other, { state: "superseded", decidedAt: input.at });
        other.events.push({ event: "superseded", reason: null, at: input.at });
      }
    }
    Object.assign(copy, { state: "shown", holdReasons: [] });
    copy.events.push({ event: "shown", reason: "privacy_reading_passed", at: input.at });
    return { outcome: "shown" };
  }

  async admissionPending(limit: number): Promise<ResearchDossierPrivacyPending[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new ResearchDossierPublicationError("INPUT_INVALID");
    this.followPrivate();
    const waiting: MemoryCopy[] = [];
    for (const copy of this.copies.values()) if (await this.admissible(copy)) waiting.push(copy);
    return waiting.sort((left, right) => left.laterPrivacy!.at.getTime() - right.laterPrivacy!.at.getTime() ||
      left.publicNumber.localeCompare(right.publicNumber) || left.versionNumber - right.versionNumber)
      .slice(0, limit)
      .map((copy) => ({ publicNumber: copy.publicNumber, versionNumber: copy.versionNumber,
        payload: structuredClone(copy.payload!), payloadSha256: copy.payloadSha256! }));
  }

  async stateLivingPerson(input: ResearchDossierLivingPersonStatementInput):
    Promise<ResearchDossierLivingPersonStatementResult> {
    assertLivingPersonStatement(input);
    this.followPrivate();
    const copies = [...this.copies.values()].filter((copy) => copy.publicNumber === input.publicNumber);
    const copy = copies.find(({ versionNumber }) => versionNumber === input.versionNumber);
    if (copy === undefined) return { outcome: "not_found" };
    const newest = Math.max(...copies.map(({ versionNumber }) => versionNumber));
    const accepted = copy.acceptedAt !== null;
    if (copy.namesLivingPerson !== null || copy.livingPersonStatement !== null ||
      (copy.state !== "held" && copy.state !== "taken_down") || copy.versionNumber !== newest) {
      return { outcome: "not_decidable", state: copy.state, accepted };
    }
    copy.livingPersonStatement = { statement: input.statement, by: input.statedBy, at: input.at };
    copy.events.push({ event: "living_person_stated", reason: input.statement, at: input.at });
    return { outcome: "stated", state: copy.state, accepted };
  }

  async listShown(query: PublicDossierQuery): Promise<PublicDossierCopy[]> {
    assertQuery(query);
    this.followPrivate();
    return [...this.copies.values()]
      .filter((copy) => this.shows(copy) &&
        (query.topicKeys === undefined || query.topicKeys.includes(copy.topicKey!)) &&
        (query.publicNumbers === undefined || query.publicNumbers.includes(copy.publicNumber)) &&
        (query.conflictsWith === undefined || copy.conflictsWith.some((number) => query.conflictsWith!.includes(number))))
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime() ||
        left.publicNumber.localeCompare(right.publicNumber))
      .slice(query.offset ?? 0, (query.offset ?? 0) + query.limit)
      .map((copy) => ({
        publicNumber: copy.publicNumber, versionNumber: copy.versionNumber, topicKey: copy.topicKey!,
        relatedTopicKeys: [...copy.relatedTopicKeys], payload: structuredClone(copy.payload!),
        payloadSha256: copy.payloadSha256!, accepted: copy.acceptedAt !== null, shownAt: copy.decidedAt.toISOString(),
        conflictsWith: [...copy.conflictsWith],
        conflictFindings: [...copy.conflictFindings],
      }));
  }

  async listTopics(query: PublicDossierTopicQuery): Promise<PublicDossierTopic[]> {
    assertTopicQuery(query);
    this.followPrivate();
    const topics = new Map<string, PublicDossierTopic>();
    // Every shown copy, newest first, as the view groups them: the topic's name is its newest copy's.
    for (const copy of [...this.copies.values()].filter((copy) => this.shows(copy))
      .sort((left, right) => right.decidedAt.getTime() - left.decidedAt.getTime() ||
        left.publicNumber.localeCompare(right.publicNumber))) {
      const topic = topics.get(copy.topicKey!) ?? { topicKey: copy.topicKey!,
        name: String((copy.payload!.topic as { name?: unknown } | undefined)?.name ?? ""), findings: 0, dossiers: 0 };
      topic.findings += Array.isArray(copy.payload!.findings) ? copy.payload!.findings.length : 0;
      topic.dossiers += 1;
      topics.set(copy.topicKey!, topic);
    }
    const place = (topic: PublicDossierTopic) => ({ label: topic.name, key: topic.topicKey });
    return [...topics.values()].filter(({ name }) => name !== "")
      .sort((left, right) => publicDossierTopicOrder(place(left), place(right)))
      .filter((topic) => (query.keys === undefined || query.keys.includes(topic.topicKey)) &&
        (query.exclude === undefined || !query.exclude.includes(topic.topicKey)) &&
        (query.after === undefined || publicDossierTopicOrder(place(topic), query.after) > 0))
      .slice(0, query.limit);
  }

  /** In memory, a digest of every copy's state: it changes with any change, as the database's number does. */
  async generation(): Promise<string> {
    this.followPrivate();
    return sha256(stableJson([...this.copies.values()].map((copy) => [copy.publicNumber, copy.versionNumber, copy.state,
      copy.acceptedAt?.toISOString() ?? null, copy.payloadSha256, copy.versionId])));
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
            topicNames: [], holdReasons: [], conflictsWith: [], conflictFindings: [], conflictOverride: null, origin: {},
            livingPersonDecision: null,
            livingPersonStatement: null, laterPrivacy: null, privacyUnavailable: null, decidedAt: at,
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
          topicNames: [], holdReasons: [], conflictsWith: [], conflictFindings: [], conflictOverride: null, origin: {},
          livingPersonDecision: null,
          livingPersonStatement: null, laterPrivacy: null, privacyUnavailable: null, decidedAt: at,
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
      laterPrivacyReading: copy.laterPrivacy === null ? null : { outcome: copy.laterPrivacy.outcome,
        reason: copy.laterPrivacy.reason, path: copy.laterPrivacy.path, at: copy.laterPrivacy.at.toISOString() },
      privacyUnavailable: copy.privacyUnavailable === null ? null
        : { reason: copy.privacyUnavailable.reason, at: copy.privacyUnavailable.at.toISOString() },
      accepted: copy.acceptedAt !== null,
      decidedAt: copy.decidedAt.toISOString(),
      namesLivingPerson: copy.namesLivingPerson,
      livingPersonStatement: copy.livingPersonStatement === null ? null : { statement: copy.livingPersonStatement.statement,
        by: copy.livingPersonStatement.by, at: copy.livingPersonStatement.at.toISOString() },
      livingPersonDecision: copy.livingPersonDecision === null ? null : { by: copy.livingPersonDecision.by,
        at: copy.livingPersonDecision.at.toISOString(), reason: copy.livingPersonDecision.reason },
      revision: copy.revision === null ? null : { ...copy.revision },
      conflictFindings: [...copy.conflictFindings],
      conflictOverride: copy.conflictOverride === null ? null
        : { by: copy.conflictOverride.by, at: copy.conflictOverride.at.toISOString() },
    };
  }
}
