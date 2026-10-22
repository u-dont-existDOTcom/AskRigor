import { createHash } from "node:crypto";

import { ATLAS_CARD_DECISIONS, type AtlasCardDecision, type AtlasCardItemKind } from "@askrigor/evidence-repository";
import { z } from "zod";

import {
  GITHUB_API_ROOT,
  GitHubApiError,
  githubRequestJson,
  isRecord,
  repositoryFullName,
  type GitHubRepository,
  type GitHubTokenProvider,
} from "../lessons/github-app.js";
import {
  FINDING_CERTAINTIES,
  FINDING_TAGS,
  PUBLIC_VALUE_SCOPES,
  VERIFIED_BASES,
  canonicalJson,
  findingsCardDigest,
  findingsCardFingerprint,
} from "./card.js";
import {
  BEYOND_QUICK_ANSWER_LABEL,
  CARD_MARKER,
  FINDINGS_CARD_LABEL,
  OCCURRENCE_MARKER,
  PENDING_REVIEW_LABEL,
  marker,
  parseCardMetadata,
  parseMarker,
  parseOccurrenceMetadata,
  type CardMetadata,
} from "./github-findings.js";
import type { FindingsRecord } from "./service.js";

/**
 * The owner's review of findings cards in the private GitHub inbox (Atlas phase 2 design, sections 1 and 3; owner
 * answers 159 and 160b). It reads a card and its later saves (occurrence comments) exactly as the findings library
 * wrote them, and refuses a record that does not read so. Each decision the owner makes is posted to the card as a
 * comment ending with the hidden askrigor-findings-decision marker; a card whose every finding has a decision is
 * labeled reviewed, loses pending-review and is closed as completed. GitHub writes are not atomic with the database,
 * so the next inspect or list posts what a failed write left out, matched by marker. Everything here is exact: markers,
 * strict record shapes, hashes and labels.
 */

export const REVIEWED_LABEL = "reviewed";
export const DECISION_MARKER = "askrigor-findings-decision";

const HEX_64 = /^[a-f0-9]{64}$/u;
const PUBLIC_NUMBER = /^F-[1-9][0-9]{3,}$/u;
const CARD_ID = /^ARF-([0-9]{1,9})$/iu;

/** A card's issue number from its public id, ARF-0142 in any case; undefined for anything else. */
export function findingsCardNumber(cardId: string): number | undefined {
  const match = CARD_ID.exec(cardId.trim());
  if (match === null) return undefined;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number >= 1 ? number : undefined;
}

// The record a card or a later save holds, strictly in the shape the library's save writes (findings/service.ts).
// Fields added over time (verified bases, the public-value declaration, stored_without) are optional.
const text = (max: number) => z.string().min(1).max(max);
const storedFindingSchema = z.object({
  claim: text(500),
  certainty: z.enum(FINDING_CERTAINTIES),
  applies_to: text(300),
  answer_quote: text(1_000),
  sources: z.array(text(300)).max(10),
  why_not_usual: text(300),
  tags: z.array(z.enum(FINDING_TAGS)).max(FINDING_TAGS.length),
  what_would_change_it: text(300),
  youtube_videos: z.number().int().min(1).max(10).optional(),
  verified_bases: z.array(z.enum(VERIFIED_BASES)).min(1).max(VERIFIED_BASES.length).optional(),
}).strict();
const storedRecordSchema = z.object({
  schema: z.literal("askrigor.findings-card.v1"),
  card: z.object({
    question: text(300),
    usual_answer: text(400),
    findings: z.array(storedFindingSchema).min(1).max(5),
    public_value: z.object({
      scope: z.enum(PUBLIC_VALUE_SCOPES),
      who_else: text(300).optional(),
      what_it_changes: text(300).optional(),
    }).strict().optional(),
    open_leads: z.array(text(200)).max(6),
  }).strict(),
  card_sha256: z.string().regex(HEX_64),
  stored_without: z.tuple([z.literal("youtube_video_ids_and_links")]).optional(),
  stamp: z.object({
    saved_at: z.iso.datetime(),
    askrigor_version: text(100),
    askrigor_build: text(100),
    protocols: z.array(z.object({
      name: text(200),
      version: text(100),
      sha256: z.string().regex(HEX_64),
    }).strict()).max(10),
    tool_catalog_sha256: z.string().regex(HEX_64),
    surface: text(100),
    reported_model_unverified: text(80).optional(),
    research: z.object({
      finalized_at: z.string().min(1).max(40).refine((value) => Number.isFinite(Date.parse(value))),
      depth: z.string().regex(/^[a-z_]{1,40}$/u).optional(),
      status: z.string().regex(/^[a-z_]{1,40}$/u).optional(),
      receipts_verified: z.number().int().nonnegative().optional(),
      validated_sources: z.number().int().nonnegative().optional(),
      lead_sources: z.number().int().nonnegative().optional(),
      material_videos: z.number().int().nonnegative().optional(),
    }).strict(),
  }).strict(),
}).strict();

// The library ends a card's body and a later save's comment with its record, in a fence longer than any run of
// backticks inside, then its marker.
const RECORD_TAIL = /\n## Full record\n\n(`{3,})json\n([\s\S]*)\n\1\n\n<!-- [a-z-]{1,64}:[A-Za-z0-9_-]{1,2048} -->\s*$/u;
const YOUTUBE_PLACEHOLDER = "(YouTube video)";

/**
 * The record a card's body or a later save's comment holds, as the library wrote it: undefined when the body has no
 * marker of that kind (not a card or save), "tampered" when it has one but its record does not read as the library
 * wrote it. The record parses strictly, and its save time is the marker's. Its question and claims give the marker's
 * duplicate fingerprint, except when the library replaced a YouTube link in them (stored_without), which leaves its
 * placeholder there and changes the text the fingerprint was taken of. And a card the library stored whole, with
 * nothing of YouTube removed, gives the digest the finalization receipt signed (card_sha256) once the bases the server
 * added to its findings are set aside, so every text, source and tag is the one the final check checked. The bases
 * and the stamp are read as GitHub holds them.
 */
export function parseFindingsRecordBody(
  rawBody: string,
  kind: "card" | "occurrence",
): { record: FindingsRecord; metadata: CardMetadata } | "tampered" | undefined {
  // GitHub's editor may save a body with CRLF line breaks.
  const body = rawBody.replace(/\r\n/gu, "\n");
  const metadata = kind === "card"
    ? parseMarker(body, CARD_MARKER, parseCardMetadata)
    : parseMarker(body, OCCURRENCE_MARKER, parseOccurrenceMetadata);
  if (metadata === undefined) {
    // A marker of this kind that does not parse is not the library's either.
    return body.includes(`<!-- ${kind === "card" ? CARD_MARKER : OCCURRENCE_MARKER}:`) ? "tampered" : undefined;
  }
  const tail = RECORD_TAIL.exec(body);
  if (tail === null) return "tampered";
  let parsed: unknown;
  try {
    parsed = JSON.parse(tail[2]!);
  } catch {
    return "tampered";
  }
  const record = storedRecordSchema.safeParse(parsed);
  if (!record.success) return "tampered";
  const stored = record.data as FindingsRecord;
  if (stored.stamp.saved_at !== metadata.saved_at) return "tampered";
  const linkReplaced = stored.stored_without !== undefined && [stored.card.question,
    ...stored.card.findings.map(({ claim }) => claim)].some((value) => value.includes(YOUTUBE_PLACEHOLDER));
  if (!linkReplaced && findingsCardFingerprint(stored.card) !== metadata.fingerprint) return "tampered";
  if (stored.stored_without === undefined) {
    const checked = {
      ...stored.card,
      findings: stored.card.findings.map(({ verified_bases: _bases, ...finding }) => finding),
    };
    if (findingsCardDigest(checked) !== stored.card_sha256) return "tampered";
  }
  return { record: stored, metadata };
}

/**
 * The SHA-256 a decision binds (design section 2): of the card's number, its own record and its later saves' records,
 * in the order GitHub lists them, as canonical JSON. A save added between an inspect and an accept changes it, so the
 * accept needs a fresh inspect; a decision comment or any other comment does not.
 */
export function findingsCardSha256(
  cardNumber: number,
  record: FindingsRecord,
  occurrences: readonly FindingsRecord[],
): string {
  return createHash("sha256")
    .update(canonicalJson({ schema: "askrigor-atlas-card-v1", card_number: cardNumber, card: record, occurrences }), "utf8")
    .digest("hex");
}

/** One decision a card's comment records: the item, the decision and the F number it took, and when. */
export interface FindingsDecisionMarker {
  itemKind: AtlasCardItemKind;
  itemNumber: number;
  decision: AtlasCardDecision;
  publicNumber: string | null;
  decidedAt: string;
}

function parseDecisionMetadata(value: Record<string, unknown>): FindingsDecisionMarker | undefined {
  const itemKind = value.item_kind;
  const itemNumber = value.item_number;
  const decision = value.decision;
  const publicNumber = value.public_number;
  const decidedAt = value.decided_at;
  if ((itemKind !== "finding" && itemKind !== "open_lead") || typeof itemNumber !== "number" ||
    !Number.isSafeInteger(itemNumber) || itemNumber < 1 || itemNumber > (itemKind === "finding" ? 5 : 6) ||
    typeof decision !== "string" || !(ATLAS_CARD_DECISIONS as readonly string[]).includes(decision) ||
    !(publicNumber === null || (typeof publicNumber === "string" && PUBLIC_NUMBER.test(publicNumber))) ||
    (decision === "rejected") !== (publicNumber === null) ||
    typeof decidedAt !== "string" || !Number.isFinite(Date.parse(decidedAt))) {
    return undefined;
  }
  return {
    itemKind,
    itemNumber,
    decision: decision as AtlasCardDecision,
    publicNumber: publicNumber as string | null,
    decidedAt,
  };
}

/** The decision a comment records, by its marker; undefined for any other comment. */
export function parseDecisionComment(body: string): FindingsDecisionMarker | undefined {
  return parseMarker(body.replace(/\r\n/gu, "\n"), DECISION_MARKER, parseDecisionMetadata);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A date as the decision comments write it: 4 Nov 2026, in UTC. */
export function decisionDate(instant: string): string {
  const date = new Date(instant);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** What a decision made of the item, in the comment's words. */
export function decisionPhrase(decision: Pick<FindingsDecisionMarker, "decision" | "publicNumber">): string {
  switch (decision.decision) {
    case "accepted": return `accepted as ${decision.publicNumber}, checked`;
    case "accepted_as_lead": return `accepted as ${decision.publicNumber}, a lead`;
    case "rechecked": return `a re-check of ${decision.publicNumber}`;
    case "rejected": return "rejected";
  }
}

/**
 * A decision's comment, such as "Finding 1: accepted as F-1007, checked, 4 Nov 2026.", with its hidden marker. It
 * holds no reason: the owner's reason stays on the decision row.
 */
export function decisionComment(decision: FindingsDecisionMarker): string {
  const item = decision.itemKind === "finding" ? `Finding ${decision.itemNumber}` : `Open lead ${decision.itemNumber}`;
  return `## Owner's decision\n\n${item}: ${decisionPhrase(decision)}, ${decisionDate(decision.decidedAt)}.\n\n` +
    marker(DECISION_MARKER, {
      item_kind: decision.itemKind,
      item_number: decision.itemNumber,
      decision: decision.decision,
      public_number: decision.publicNumber,
      decided_at: decision.decidedAt,
    });
}

/** A card as the owner's review reads it, with its later saves and the decisions its comments record. */
export interface FindingsCardRead {
  number: number;
  state: "open" | "closed";
  labels: string[];
  record: FindingsRecord;
  /** The later saves' records, in the order GitHub lists their comments. */
  occurrences: FindingsRecord[];
  decisions: FindingsDecisionMarker[];
}

export type FindingsCardLookup =
  | { status: "found"; card: FindingsCardRead }
  /** No issue of that number, a pull request, or an issue that is not a findings card. */
  | { status: "not_found" }
  /** A findings card whose record, or a later save's, does not read as the library wrote it. */
  | { status: "unreadable" };

/** An open card as the inbox lists it; its record is undefined when it does not read as the library wrote it. */
export interface OpenFindingsCard {
  number: number;
  labels: string[];
  /** The issue's comment count; unknown counts as one, so its comments are read. */
  comments: number;
  record: FindingsRecord | undefined;
}

export type FindingsCardComments =
  | { status: "read"; occurrences: FindingsRecord[]; decisions: FindingsDecisionMarker[] }
  | { status: "unreadable" };

/** The GitHub inbox the owner's findings actions read and write. */
export interface FindingsCardInbox {
  readCard(cardNumber: number): Promise<FindingsCardLookup>;
  openCards(): Promise<OpenFindingsCard[]>;
  readComments(cardNumber: number): Promise<FindingsCardComments>;
  postDecision(cardNumber: number, decision: FindingsDecisionMarker): Promise<void>;
  /** Labels the card reviewed, without pending-review, and closes it as completed if it is open. */
  markReviewed(card: { number: number; state: "open" | "closed"; labels: readonly string[] }): Promise<void>;
}

export interface GitHubFindingsReviewOptions {
  tokenProvider: GitHubTokenProvider;
  fetch: typeof fetch;
  repository: GitHubRepository;
}

/** The inbox through the findings library's GitHub App, within its issues: write permission. */
export class GitHubFindingsReview implements FindingsCardInbox {
  private readonly issuesPath: string;

  constructor(private readonly options: GitHubFindingsReviewOptions) {
    this.issuesPath = `/repos/${repositoryFullName(options.repository)}/issues`;
  }

  async readCard(cardNumber: number): Promise<FindingsCardLookup> {
    if (!Number.isSafeInteger(cardNumber) || cardNumber < 1) return { status: "not_found" };
    const issue = await this.request(`${this.issuesPath}/${cardNumber}`, { method: "GET" }, { missing: true });
    if (issue === MISSING || !isRecord(issue) || "pull_request" in issue || issue.number !== cardNumber) {
      return { status: "not_found" };
    }
    const labels = labelNames(issue.labels);
    if (!labels.includes(FINDINGS_CARD_LABEL) || typeof issue.body !== "string") return { status: "not_found" };
    const card = parseFindingsRecordBody(issue.body, "card");
    if (card === undefined) return { status: "not_found" };
    if (card === "tampered") return { status: "unreadable" };
    const comments = await this.readComments(cardNumber);
    if (comments.status === "unreadable") return { status: "unreadable" };
    return {
      status: "found",
      card: {
        number: cardNumber,
        state: issue.state === "closed" ? "closed" : "open",
        labels,
        record: card.record,
        occurrences: comments.occurrences,
        decisions: comments.decisions,
      },
    };
  }

  async openCards(): Promise<OpenFindingsCard[]> {
    const cards: OpenFindingsCard[] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${this.issuesPath}?state=open&labels=${FINDINGS_CARD_LABEL}&per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const issue of response) {
        if (!isRecord(issue) || "pull_request" in issue || typeof issue.body !== "string" ||
          !isPositiveInteger(issue.number)) {
          continue;
        }
        const parsed = parseFindingsRecordBody(issue.body, "card");
        if (parsed === undefined) continue;
        cards.push({
          number: issue.number,
          labels: labelNames(issue.labels),
          comments: typeof issue.comments === "number" && Number.isSafeInteger(issue.comments) && issue.comments >= 0
            ? issue.comments
            : 1,
          record: parsed === "tampered" ? undefined : parsed.record,
        });
      }
      if (response.length < 100) break;
    }
    return cards;
  }

  async readComments(cardNumber: number): Promise<FindingsCardComments> {
    const occurrences: FindingsRecord[] = [];
    const decisions: FindingsDecisionMarker[] = [];
    for (let page = 1; ; page += 1) {
      const response = await this.request(
        `${this.issuesPath}/${cardNumber}/comments?per_page=100&page=${page}`,
        { method: "GET" },
      );
      if (!Array.isArray(response)) throw new GitHubApiError("github_service_unavailable", true);
      for (const comment of response) {
        if (!isRecord(comment) || typeof comment.body !== "string") continue;
        const occurrence = parseFindingsRecordBody(comment.body, "occurrence");
        if (occurrence === "tampered") return { status: "unreadable" };
        if (occurrence !== undefined) {
          occurrences.push(occurrence.record);
          continue;
        }
        const decision = parseDecisionComment(comment.body);
        if (decision !== undefined) decisions.push(decision);
      }
      if (response.length < 100) break;
    }
    return { status: "read", occurrences, decisions };
  }

  async postDecision(cardNumber: number, decision: FindingsDecisionMarker): Promise<void> {
    const posted = await this.request(`${this.issuesPath}/${cardNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: decisionComment(decision) }),
    });
    if (!isRecord(posted) || !isPositiveInteger(posted.id)) throw new GitHubApiError("github_service_unavailable", true);
  }

  async markReviewed(card: { number: number; state: "open" | "closed"; labels: readonly string[] }): Promise<void> {
    const labels = [...new Set([...card.labels.filter((label) => label !== PENDING_REVIEW_LABEL), REVIEWED_LABEL])];
    const edited = await this.request(`${this.issuesPath}/${card.number}`, {
      method: "PATCH",
      body: JSON.stringify(card.state === "open"
        ? { labels, state: "closed", state_reason: "completed" }
        : { labels }),
    });
    if (!isRecord(edited) || (card.state === "open" && edited.state !== "closed")) {
      throw new GitHubApiError("github_service_unavailable", true);
    }
  }

  private async request(path: string, init: RequestInit, options: { missing?: boolean } = {}): Promise<unknown> {
    let token: string;
    try {
      token = await this.options.tokenProvider.getToken();
    } catch (error) {
      if (error instanceof GitHubApiError) throw error;
      throw new GitHubApiError("github_auth_unavailable", false);
    }
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    // With a verified token scoped to this one repository, 404 or 410 for an issue means it is not there.
    let missing = false;
    const tracked: typeof fetch = async (input, requestInit) => {
      const response = await this.options.fetch(input, requestInit);
      if (options.missing === true && (response.status === 404 || response.status === 410)) missing = true;
      return response;
    };
    try {
      return await githubRequestJson(tracked, `${GITHUB_API_ROOT}${path}`, { ...init, headers });
    } catch (error) {
      if (missing) return MISSING;
      throw error;
    }
  }
}

const MISSING = Symbol("missing");

function labelNames(labels: unknown): string[] {
  return Array.isArray(labels)
    ? labels.flatMap((label) => isRecord(label) && typeof label.name === "string" ? [label.name] : [])
    : [];
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** Whether a card carries the label that puts it first in the owner's review. */
export function isBeyondQuickAnswer(labels: readonly string[]): boolean {
  return labels.includes(BEYOND_QUICK_ANSWER_LABEL);
}

/** A decision as the review store holds it, for reconciling the card's comments with it. */
export interface StoredCardDecision {
  itemKind: AtlasCardItemKind;
  itemNumber: number;
  decision: AtlasCardDecision;
  publicNumber: string | null;
  decidedAt: string;
}

export interface FindingsCardSync {
  /** Decision comments posted by this call. */
  posted: number;
  /** Whether this call labeled the card reviewed (and closed it if it was open). */
  reviewed: boolean;
  /** Whether GitHub now shows every decision and, once every finding has one, the reviewed label. */
  synced: boolean;
}

/**
 * Brings a card's comments and labels in line with the decisions the review store holds: posts each decision no
 * comment records yet (matched by item, decision and F number), then, once every finding of the card has a decision,
 * labels it reviewed without pending-review and closes it as completed. A GitHub failure stops it; the next inspect or
 * list does the rest.
 */
export async function reconcileFindingsCard(
  inbox: Pick<FindingsCardInbox, "postDecision" | "markReviewed">,
  card: Pick<FindingsCardRead, "number" | "state" | "labels" | "decisions"> & { findings: number },
  decisions: readonly StoredCardDecision[],
): Promise<FindingsCardSync> {
  let posted = 0;
  try {
    for (const decision of decisions) {
      const recorded = card.decisions.some((comment) => comment.itemKind === decision.itemKind &&
        comment.itemNumber === decision.itemNumber && comment.decision === decision.decision &&
        comment.publicNumber === decision.publicNumber);
      if (recorded) continue;
      await inbox.postDecision(card.number, {
        itemKind: decision.itemKind,
        itemNumber: decision.itemNumber,
        decision: decision.decision,
        publicNumber: decision.publicNumber,
        decidedAt: decision.decidedAt,
      });
      posted += 1;
    }
    const decided = new Set(decisions.filter(({ itemKind }) => itemKind === "finding").map(({ itemNumber }) => itemNumber));
    const complete = Array.from({ length: card.findings }, (_, index) => index + 1).every((item) => decided.has(item));
    if (!complete) return { posted, reviewed: false, synced: true };
    const labeled = card.labels.includes(REVIEWED_LABEL) && !card.labels.includes(PENDING_REVIEW_LABEL);
    if (labeled && card.state === "closed") return { posted, reviewed: false, synced: true };
    await inbox.markReviewed(card);
    return { posted, reviewed: true, synced: true };
  } catch {
    return { posted, reviewed: false, synced: false };
  }
}
