import { createHash, randomBytes } from "node:crypto";

import type { Pool } from "pg";
import { z } from "zod";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";
import type { InMemoryAtlasPublicationStore } from "./atlas-publications.js";

// Decision 171, section 4E (plan docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md; design
// docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md, section E): votes and comments on the Atlas's
// published findings, and the owner's picks for the home page, as migration 0022 stores them. A participant is known
// only by a key derived from the account key (never an email address or an OAuth subject); the owner's review names a
// commenter by a tag derived from that key. Code checks only exact things here: shapes, lengths and states. Whether a
// comment or a display name holds contact details or links is the web layer's check before it calls the store
// (apps/research-mcp/src/atlas/contact-check.ts).

export const ATLAS_VOTES = ["agree", "disagree"] as const;
export type AtlasVote = typeof ATLAS_VOTES[number];
export const ATLAS_COMMENT_STATES = ["shown", "hidden"] as const;
export type AtlasCommentState = typeof ATLAS_COMMENT_STATES[number];
export const ATLAS_COMMENT_MAX_CHARACTERS = 2_000;
export const ATLAS_DISPLAY_NAME_MAX_CHARACTERS = 40;
export const ATLAS_HOME_PICKS_MAX = 5;
export const ATLAS_PICK_REASON_MAX_CHARACTERS = 300;
/** The most comments one owner's inspection returns, one finding page reads, and one page of a reader's own lists. */
export const ATLAS_COMMENTS_PER_INSPECT = 200;
export const ATLAS_COMMENTS_PER_PAGE = 50;
export const ATLAS_OWN_COMMENTS_PER_PAGE = 50;
export const ATLAS_OWN_VOTES_PER_PAGE = 50;

const PARTICIPANT_KEY = /^[a-f0-9]{64}$/u;
const REPORTER_KEY = /^[pa]:[a-f0-9]{64}$/u;
const COMMENT_ID = /^C-[1-9][0-9]{3,}$/u;
const COMMENTER_TAG = /^U-[a-f0-9]{12}$/u;
const PUBLICATION_NUMBER = /^P-[1-9][0-9]{3,}$/u;

export type AtlasParticipationErrorCode =
  | "INPUT_INVALID"
  /** A comment needs a display name, which comes with the first; a participant without one cannot change it. */
  | "DISPLAY_NAME_REQUIRED"
  /** The owner stopped this participant from commenting. */
  | "STOPPED"
  /** The publication does not show: no vote or comment on it. */
  | "NOT_SHOWN"
  /** A pick names a publication that does not show. */
  | "PICK_NOT_PUBLISHED";

export class AtlasParticipationError extends Error {
  constructor(readonly code: AtlasParticipationErrorCode, message = `ATLAS_PARTICIPATION_${code}`) {
    super(message);
  }
}

/** A participant's own state: the display name they chose and whether the owner stopped them from commenting. */
export interface AtlasParticipantView {
  displayName: string | null;
  stopped: boolean;
}

export type AtlasReportOutcome = "reported" | "already_reported" | "not_found";

/** What deleting everything a participant holds deleted. */
export interface AtlasForgetResult {
  votes: number;
  comments: number;
  reports: number;
}

/** The access role's nine participation functions (migration 0022), in TypeScript. */
export interface AtlasParticipationStore {
  /** Null when the participant holds nothing (no row). */
  inspectParticipant(participantKey: string): Promise<AtlasParticipantView | null>;
  /** Changes a participant's display name; DISPLAY_NAME_REQUIRED when they have none yet (it comes with a comment). */
  setDisplayName(participantKey: string, displayName: string, at: string): Promise<AtlasParticipantView>;
  /** Records a vote on a publication that shows, or clears it (null); returns the publication's totals. */
  setVote(participantKey: string, publicationNumber: string, vote: AtlasVote | null, at: string):
    Promise<{ agree: number; disagree: number }>;
  /**
   * Posts a comment, shown at once, under the participant's display name, or under firstDisplayName, which becomes
   * theirs, when they have none yet; returns its public id (C-1001). A refusal leaves nothing behind.
   */
  postComment(participantKey: string, publicationNumber: string, body: string, at: string,
    firstDisplayName?: string | null): Promise<string>;
  /** Deletes the participant's own comment, shown or hidden; false when there was none of theirs. */
  deleteComment(participantKey: string, publicId: string): Promise<boolean>;
  reportComment(reporterKey: string, publicId: string, at: string): Promise<AtlasReportOutcome>;
  /**
   * Deletes everything the participant holds: votes, comments (with the reports on them) and their own reports; then
   * their row, or, when the owner stopped them, everything of it but the stop; and ends every session they signed in
   * with.
   */
  forgetParticipant(participantKey: string, at: string): Promise<AtlasForgetResult>;
  /**
   * Signing out everywhere: every session of the participant signed in up to now is over. PostgreSQL takes the time
   * from its own clock; `at` is the in-memory store's.
   */
  endSessions(participantKey: string, at: string): Promise<void>;
  /**
   * Whether a session the participant signed in with at signedInAt is still current: none of theirs ended since.
   * PostgreSQL drops lapsed ends by its own clock; `at` is the in-memory store's.
   */
  sessionCurrent(participantKey: string, signedInAt: string, at: string): Promise<boolean>;
}

/** The 30 days a session can last: an end of a participant's sessions is kept as long. */
export const ATLAS_SESSION_END_KEPT_MS = 30 * 24 * 60 * 60 * 1_000;

/** The hash a participant's ended sessions are kept under, as migration 0022 derives it. */
export function atlasSessionKeyHash(participantKey: string): string {
  return createHash("sha256").update(`askrigor-atlas-sessions:v1:${participantKey}`, "utf8").digest("hex");
}

/** A comment as the owner's review sees it: never the participant's key, only the commenter's tag. */
export interface AtlasCommentModerationView {
  publicId: string;
  publicationNumber: string;
  commenterTag: string;
  commenterStopped: boolean;
  displayName: string;
  body: string;
  /** removed only in the reply of the removal that deleted it. */
  state: AtlasCommentState | "removed";
  reportCount: number;
  postedAt: string;
  stateChangedAt: string;
}

export interface AtlasCommenterView {
  commenterTag: string;
  stopped: boolean;
  comments: number;
}

export interface AtlasHomePick {
  slot: number;
  publicationNumber: string;
  reason: string;
  setAt: string;
}

export interface AtlasCommentQuery {
  reportedOnly: boolean;
  /** Newest first: only comments whose number is below this one. */
  before?: number;
  /** At most ATLAS_COMMENTS_PER_INSPECT. */
  limit: number;
}

/** The review role's five moderation functions (migration 0022), in TypeScript. */
export interface AtlasModerationStore {
  inspectComments(query: AtlasCommentQuery): Promise<AtlasCommentModerationView[]>;
  /** Null when no comment has that id. */
  moderateComment(publicId: string, moderation: "hide" | "show" | "remove", at: string):
    Promise<AtlasCommentModerationView | null>;
  /** Null when no commenter has that tag. */
  setCommenterStopped(commenterTag: string, stopped: boolean, at: string): Promise<AtlasCommenterView | null>;
  /** Replaces the picks; an empty list clears them. */
  setHomePicks(picks: ReadonlyArray<{ publicationNumber: string; reason: string }>, at: string): Promise<AtlasHomePick[]>;
  inspectHomePicks(): Promise<AtlasHomePick[]>;
}

/** The tag the owner's review names a commenter by, as migration 0022 derives it from the participant's key. */
export function atlasCommenterTag(participantKey: string): string {
  return `U-${createHash("sha256").update(`askrigor-atlas-commenter:v1:${participantKey}`, "utf8").digest("hex").slice(0, 12)}`;
}

/** One of a reader's own votes, as their own page lists it: on any publication, shown or not. */
export interface AtlasPageOwnVote {
  publicationNumber: string;
  vote: AtlasVote;
  votedAt: string;
  /** Whether its publication is unreviewed, accepted or edited, so its page may show. */
  publicationListed: boolean;
}

/** One of a reader's own comments, as their own comments page lists it: in any state, on any publication. */
export interface AtlasPageOwnComment {
  publicId: string;
  publicationNumber: string;
  displayName: string;
  body: string;
  state: AtlasCommentState;
  postedAt: string;
  /** Whether its publication is unreviewed, accepted or edited, so its page may show. */
  publicationListed: boolean;
}

/**
 * The mark a page shows after a comment's name: six hexadecimal characters of a hash of the author's key, the random salt
 * of their row and the display name the comment was posted under, as migration 0022's reads compute it. It is the same
 * on one person's comments under one name, changes with the name, and is new after they delete everything.
 */
export function atlasCommenterMarker(participantKey: string, markSalt: string, displayName: string): string {
  return createHash("sha256").update(`askrigor-atlas-mark:v2:${participantKey}:${markSalt}:${displayName}`, "utf8")
    .digest("hex").slice(0, 6);
}

/** A participant row's random mark salt: 16 bytes in hexadecimal, as gen_random_uuid() gives them in PostgreSQL. */
const newMarkSalt = () => randomBytes(16).toString("hex");

/** The public id of a comment number, and the number of a public id. */
export const atlasCommentId = (commentNumber: number) => `C-${commentNumber}`;
export const atlasCommentNumber = (publicId: string) => Number(publicId.slice(2));

const invalid = () => new AtlasParticipationError("INPUT_INVALID");
const validInstant = (value: string) => typeof value === "string" && !Number.isNaN(Date.parse(value));
/** Trimmed, and 1 to max characters as PostgreSQL's length() counts them: code points. */
const trimmedWithin = (value: unknown, max: number): value is string =>
  typeof value === "string" && value === value.trim() && value.length >= 1 && [...value].length <= max;

function checkParticipant(participantKey: string): void {
  if (typeof participantKey !== "string" || !PARTICIPANT_KEY.test(participantKey)) throw invalid();
}
function checkPublication(publicationNumber: string): void {
  if (typeof publicationNumber !== "string" || !PUBLICATION_NUMBER.test(publicationNumber)) throw invalid();
}
function checkComment(publicId: string): void {
  if (typeof publicId !== "string" || !COMMENT_ID.test(publicId)) throw invalid();
}
function checkAt(at: string): void {
  if (!validInstant(at)) throw invalid();
}
function checkPicks(picks: ReadonlyArray<{ publicationNumber: string; reason: string }>): void {
  if (!Array.isArray(picks) || picks.length > ATLAS_HOME_PICKS_MAX ||
    new Set(picks.map(({ publicationNumber }) => publicationNumber)).size !== picks.length ||
    !picks.every(({ publicationNumber, reason }) => PUBLICATION_NUMBER.test(publicationNumber) &&
      trimmedWithin(reason, ATLAS_PICK_REASON_MAX_CHARACTERS))) {
    throw invalid();
  }
}
function checkQuery(query: AtlasCommentQuery): void {
  if (typeof query.reportedOnly !== "boolean" || !Number.isInteger(query.limit) || query.limit < 1 ||
    query.limit > ATLAS_COMMENTS_PER_INSPECT || (query.before !== undefined &&
      (!Number.isSafeInteger(query.before) || query.before < 1))) {
    throw invalid();
  }
}

const iso = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();
const later = (left: string, right: string) => Date.parse(left) >= Date.parse(right) ? left : right;

// In memory ------------------------------------------------------------------------------------------------------------

interface StoredParticipant {
  participantKey: string;
  commenterTag: string;
  markSalt: string;
  displayName: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredComment {
  commentNumber: number;
  publicationNumber: string;
  participantKey: string;
  displayName: string;
  body: string;
  state: AtlasCommentState;
  reportCount: number;
  postedAt: string;
  stateChangedAt: string;
}

/** What one finding page shows of its votes and comments, and of the signed-in viewer's own. */
export interface AtlasPageParticipation {
  agree: number;
  disagree: number;
  /**
   * The comments that show, newest first, at most ATLAS_COMMENTS_PER_PAGE, older than the page's cursor when it has
   * one. marker (atlasCommenterMarker) tells apart two people who chose one name: it is the same on one person's
   * comments under one name, changes with the name, and is new after they delete everything.
   */
  comments: Array<{ publicId: string; displayName: string; body: string; postedAt: string; marker: string }>;
  /** Whether older comments that show remain beyond these. */
  more: boolean;
  /** The signed-in viewer's own state; null without a viewer. */
  viewer: { displayName: string | null; stopped: boolean; vote: AtlasVote | null; ownComments: string[] } | null;
}

/**
 * Votes, comments, reports and picks in memory, with migration 0022's semantics: the participation functions, the
 * moderation functions and what the pages read. The publications store tells which publications show.
 */
export class InMemoryAtlasParticipation implements AtlasParticipationStore, AtlasModerationStore {
  private readonly participants = new Map<string, StoredParticipant>();
  private readonly votes = new Map<string, { publicationNumber: string; participantKey: string; vote: AtlasVote; votedAt: string }>();
  private readonly comments: StoredComment[] = [];
  private readonly reports = new Map<string, { commentNumber: number; reporterKey: string; reportedAt: string }>();
  private picks: AtlasHomePick[] = [];
  private nextComment = 1_001;
  private readonly sessionEnds = new Map<string, { endedAt: string; keepUntil: string }>();

  constructor(private readonly publications: InMemoryAtlasPublicationStore) {}

  /**
   * Whether a publication shows, as far as memory can tell: an unreviewed one with its published fields, or an accepted
   * or edited one (PostgreSQL also asks that its F number be written, not withdrawn and not erased).
   */
  private open(publicationNumber: string): boolean {
    return this.publications.allRows().some((row) => row.publicationNumber === publicationNumber &&
      ((row.state === "unreviewed" && row.published !== null) || row.state === "accepted" || row.state === "edited"));
  }

  private ensureParticipant(participantKey: string, at: string): StoredParticipant {
    let participant = this.participants.get(participantKey);
    if (participant === undefined) {
      participant = { participantKey, commenterTag: atlasCommenterTag(participantKey), markSalt: newMarkSalt(),
        displayName: null, stoppedAt: null, createdAt: at, updatedAt: at };
      this.participants.set(participantKey, participant);
    }
    return participant;
  }

  private forgetIdle(participantKey: string): void {
    const participant = this.participants.get(participantKey);
    if (participant === undefined || participant.stoppedAt !== null) return;
    if ([...this.votes.values()].some((vote) => vote.participantKey === participantKey)) return;
    if (this.comments.some((comment) => comment.participantKey === participantKey)) return;
    this.participants.delete(participantKey);
  }

  private totals(publicationNumber: string): { agree: number; disagree: number } {
    const votes = [...this.votes.values()].filter((vote) => vote.publicationNumber === publicationNumber);
    return {
      agree: votes.filter(({ vote }) => vote === "agree").length,
      disagree: votes.filter(({ vote }) => vote === "disagree").length,
    };
  }

  private moderationView(comment: StoredComment, state: AtlasCommentModerationView["state"] = comment.state,
    stateChangedAt = comment.stateChangedAt): AtlasCommentModerationView {
    const author = this.participants.get(comment.participantKey);
    return {
      publicId: atlasCommentId(comment.commentNumber),
      publicationNumber: comment.publicationNumber,
      commenterTag: author?.commenterTag ?? atlasCommenterTag(comment.participantKey),
      commenterStopped: author?.stoppedAt !== null && author?.stoppedAt !== undefined,
      displayName: comment.displayName,
      body: comment.body,
      state,
      reportCount: comment.reportCount,
      postedAt: comment.postedAt,
      stateChangedAt,
    };
  }

  async inspectParticipant(participantKey: string): Promise<AtlasParticipantView | null> {
    checkParticipant(participantKey);
    const participant = this.participants.get(participantKey);
    return participant === undefined ? null
      : { displayName: participant.displayName, stopped: participant.stoppedAt !== null };
  }

  async setDisplayName(participantKey: string, displayName: string, at: string): Promise<AtlasParticipantView> {
    checkParticipant(participantKey);
    checkAt(at);
    if (!trimmedWithin(displayName, ATLAS_DISPLAY_NAME_MAX_CHARACTERS)) throw invalid();
    const participant = this.participants.get(participantKey);
    if (participant === undefined || participant.displayName === null) {
      throw new AtlasParticipationError("DISPLAY_NAME_REQUIRED");
    }
    participant.displayName = displayName;
    participant.updatedAt = later(iso(at), participant.updatedAt);
    return { displayName, stopped: participant.stoppedAt !== null };
  }

  async setVote(participantKey: string, publicationNumber: string, vote: AtlasVote | null, at: string):
    Promise<{ agree: number; disagree: number }> {
    checkParticipant(participantKey);
    checkPublication(publicationNumber);
    checkAt(at);
    if (vote !== null && !(ATLAS_VOTES as readonly string[]).includes(vote)) throw invalid();
    const key = `${publicationNumber}\u0000${participantKey}`;
    if (vote === null) {
      this.votes.delete(key);
      this.forgetIdle(participantKey);
    } else {
      if (!this.open(publicationNumber)) throw new AtlasParticipationError("NOT_SHOWN");
      this.ensureParticipant(participantKey, iso(at));
      this.votes.set(key, { publicationNumber, participantKey, vote, votedAt: iso(at) });
    }
    return this.totals(publicationNumber);
  }

  async postComment(participantKey: string, publicationNumber: string, body: string, at: string,
    firstDisplayName: string | null = null): Promise<string> {
    checkParticipant(participantKey);
    checkPublication(publicationNumber);
    checkAt(at);
    if (!trimmedWithin(body, ATLAS_COMMENT_MAX_CHARACTERS) ||
      (firstDisplayName !== null && !trimmedWithin(firstDisplayName, ATLAS_DISPLAY_NAME_MAX_CHARACTERS))) {
      throw invalid();
    }
    if (!this.open(publicationNumber)) throw new AtlasParticipationError("NOT_SHOWN");
    const existing = this.participants.get(participantKey);
    if (existing?.stoppedAt !== null && existing?.stoppedAt !== undefined) throw new AtlasParticipationError("STOPPED");
    const displayName = existing?.displayName ?? firstDisplayName;
    if (displayName === null) throw new AtlasParticipationError("DISPLAY_NAME_REQUIRED");
    const author = this.ensureParticipant(participantKey, iso(at));
    if (author.displayName === null) {
      author.displayName = displayName;
      author.updatedAt = later(iso(at), author.updatedAt);
    }
    const commentNumber = this.nextComment++;
    this.comments.push({
      commentNumber, publicationNumber, participantKey, displayName, body, state: "shown",
      reportCount: 0, postedAt: iso(at), stateChangedAt: iso(at),
    });
    return atlasCommentId(commentNumber);
  }

  async deleteComment(participantKey: string, publicId: string): Promise<boolean> {
    checkParticipant(participantKey);
    checkComment(publicId);
    const at = this.comments.findIndex((comment) => comment.commentNumber === atlasCommentNumber(publicId) &&
      comment.participantKey === participantKey);
    if (at >= 0) this.removeComment(at);
    this.forgetIdle(participantKey);
    return at >= 0;
  }

  private removeComment(index: number): void {
    const [removed] = this.comments.splice(index, 1);
    for (const [key, report] of this.reports) if (report.commentNumber === removed!.commentNumber) this.reports.delete(key);
  }

  async reportComment(reporterKey: string, publicId: string, at: string): Promise<AtlasReportOutcome> {
    if (typeof reporterKey !== "string" || !REPORTER_KEY.test(reporterKey)) throw invalid();
    checkComment(publicId);
    checkAt(at);
    const comment = this.comments.find((candidate) => candidate.commentNumber === atlasCommentNumber(publicId) &&
      candidate.state === "shown");
    if (comment === undefined) return "not_found";
    const key = `${comment.commentNumber}\u0000${reporterKey}`;
    if (this.reports.has(key)) return "already_reported";
    this.reports.set(key, { commentNumber: comment.commentNumber, reporterKey, reportedAt: iso(at) });
    comment.reportCount += 1;
    return "reported";
  }

  async forgetParticipant(participantKey: string, at: string): Promise<AtlasForgetResult> {
    checkParticipant(participantKey);
    checkAt(at);
    let votes = 0;
    for (const [key, vote] of this.votes) {
      if (vote.participantKey === participantKey) {
        this.votes.delete(key);
        votes += 1;
      }
    }
    let comments = 0;
    for (let index = this.comments.length - 1; index >= 0; index -= 1) {
      if (this.comments[index]!.participantKey === participantKey) {
        this.removeComment(index);
        comments += 1;
      }
    }
    let reports = 0;
    for (const [key, report] of this.reports) {
      if (report.reporterKey === `p:${participantKey}`) {
        this.reports.delete(key);
        const comment = this.comments.find((candidate) => candidate.commentNumber === report.commentNumber);
        if (comment !== undefined) comment.reportCount -= 1;
        reports += 1;
      }
    }
    const participant = this.participants.get(participantKey);
    if (participant !== undefined && participant.stoppedAt !== null) {
      participant.displayName = null;
      participant.markSalt = newMarkSalt();
      participant.updatedAt = later(iso(at), participant.updatedAt);
    }
    this.forgetIdle(participantKey);
    this.endSessionsAt(participantKey, iso(at));
    return { votes, comments, reports };
  }

  async endSessions(participantKey: string, at: string): Promise<void> {
    checkParticipant(participantKey);
    checkAt(at);
    this.endSessionsAt(participantKey, iso(at));
  }

  async sessionCurrent(participantKey: string, signedInAt: string, at: string): Promise<boolean> {
    checkParticipant(participantKey);
    checkAt(signedInAt);
    checkAt(at);
    this.dropLapsedSessionEnds(iso(at));
    const ended = this.sessionEnds.get(atlasSessionKeyHash(participantKey));
    return ended === undefined || Date.parse(ended.endedAt) < Date.parse(signedInAt);
  }

  private endSessionsAt(participantKey: string, at: string): void {
    this.dropLapsedSessionEnds(at);
    const hash = atlasSessionKeyHash(participantKey);
    const keepUntil = new Date(Date.parse(at) + ATLAS_SESSION_END_KEPT_MS).toISOString();
    const earlier = this.sessionEnds.get(hash);
    this.sessionEnds.set(hash, earlier === undefined ? { endedAt: at, keepUntil }
      : { endedAt: later(earlier.endedAt, at), keepUntil: later(earlier.keepUntil, keepUntil) });
  }

  private dropLapsedSessionEnds(at: string): void {
    for (const [hash, ended] of this.sessionEnds) {
      if (Date.parse(ended.keepUntil) < Date.parse(at)) this.sessionEnds.delete(hash);
    }
  }

  async inspectComments(query: AtlasCommentQuery): Promise<AtlasCommentModerationView[]> {
    checkQuery(query);
    return this.comments
      .filter((comment) => (!query.reportedOnly || comment.reportCount > 0) &&
        (query.before === undefined || comment.commentNumber < query.before))
      .sort((left, right) => right.commentNumber - left.commentNumber)
      .slice(0, query.limit)
      .map((comment) => this.moderationView(comment));
  }

  async moderateComment(publicId: string, moderation: "hide" | "show" | "remove", at: string):
    Promise<AtlasCommentModerationView | null> {
    checkComment(publicId);
    checkAt(at);
    if (!["hide", "show", "remove"].includes(moderation)) throw invalid();
    const index = this.comments.findIndex((comment) => comment.commentNumber === atlasCommentNumber(publicId));
    if (index < 0) return null;
    const comment = this.comments[index]!;
    if (moderation === "remove") {
      const view = this.moderationView(comment, "removed", later(iso(at), comment.stateChangedAt));
      this.removeComment(index);
      this.forgetIdle(comment.participantKey);
      return view;
    }
    const state = moderation === "hide" ? "hidden" : "shown";
    if (comment.state !== state) {
      comment.state = state;
      comment.stateChangedAt = later(iso(at), comment.stateChangedAt);
    }
    if (moderation === "show") {
      // Shown by the owner: its reports are dealt with, and deleted.
      for (const [key, report] of this.reports) if (report.commentNumber === comment.commentNumber) this.reports.delete(key);
      comment.reportCount = 0;
    }
    return this.moderationView(comment);
  }

  async setCommenterStopped(commenterTag: string, stopped: boolean, at: string): Promise<AtlasCommenterView | null> {
    if (typeof commenterTag !== "string" || !COMMENTER_TAG.test(commenterTag) || typeof stopped !== "boolean") {
      throw invalid();
    }
    checkAt(at);
    const participant = [...this.participants.values()].find((candidate) => candidate.commenterTag === commenterTag);
    if (participant === undefined) return null;
    participant.stoppedAt = stopped ? participant.stoppedAt ?? later(iso(at), participant.createdAt) : null;
    participant.updatedAt = later(iso(at), participant.updatedAt);
    const view = {
      commenterTag,
      stopped: participant.stoppedAt !== null,
      comments: this.comments.filter((comment) => comment.participantKey === participant.participantKey).length,
    };
    if (!stopped) this.forgetIdle(participant.participantKey);
    return view;
  }

  async setHomePicks(picks: ReadonlyArray<{ publicationNumber: string; reason: string }>, at: string):
    Promise<AtlasHomePick[]> {
    checkPicks(picks);
    checkAt(at);
    if (!picks.every(({ publicationNumber }) => this.open(publicationNumber))) {
      throw new AtlasParticipationError("PICK_NOT_PUBLISHED");
    }
    this.picks = picks.map(({ publicationNumber, reason }, index) =>
      ({ slot: index + 1, publicationNumber, reason, setAt: iso(at) }));
    return structuredClone(this.picks);
  }

  async inspectHomePicks(): Promise<AtlasHomePick[]> {
    return structuredClone(this.picks);
  }

  /** What a finding page reads (the reader's view in PostgreSQL): newest first, older than `before` when given. */
  pageParticipation(publicationNumber: string, participantKey: string | null, before?: number): AtlasPageParticipation {
    const participant = participantKey === null ? undefined : this.participants.get(participantKey);
    const vote = participantKey === null ? undefined : this.votes.get(`${publicationNumber}\u0000${participantKey}`);
    const shown = this.comments
      .filter((comment) => comment.publicationNumber === publicationNumber && comment.state === "shown" &&
        (before === undefined || comment.commentNumber < before))
      .sort((left, right) => right.commentNumber - left.commentNumber);
    return {
      ...this.totals(publicationNumber),
      comments: shown.slice(0, ATLAS_COMMENTS_PER_PAGE)
        .map((comment) => ({ publicId: atlasCommentId(comment.commentNumber), displayName: comment.displayName,
          body: comment.body, postedAt: comment.postedAt,
          marker: atlasCommenterMarker(comment.participantKey, this.participants.get(comment.participantKey)!.markSalt,
            comment.displayName) })),
      more: shown.length > ATLAS_COMMENTS_PER_PAGE,
      viewer: participantKey === null ? null : {
        displayName: participant?.displayName ?? null,
        stopped: participant?.stoppedAt !== null && participant?.stoppedAt !== undefined,
        vote: vote?.vote ?? null,
        ownComments: this.comments
          .filter((comment) => comment.publicationNumber === publicationNumber && comment.participantKey === participantKey)
          .sort((left, right) => left.commentNumber - right.commentNumber)
          .map((comment) => atlasCommentId(comment.commentNumber)),
      },
    };
  }

  /** A reader's own comments in every state and on every publication, newest first (the reader's view in PostgreSQL). */
  ownComments(participantKey: string, before: number | undefined, limit: number): AtlasPageOwnComment[] {
    return this.comments
      .filter((comment) => comment.participantKey === participantKey && (before === undefined || comment.commentNumber < before))
      .sort((left, right) => right.commentNumber - left.commentNumber)
      .slice(0, limit)
      .map((comment) => ({
        publicId: atlasCommentId(comment.commentNumber),
        publicationNumber: comment.publicationNumber,
        displayName: comment.displayName,
        body: comment.body,
        state: comment.state,
        postedAt: comment.postedAt,
        publicationListed: this.open(comment.publicationNumber),
      }));
  }

  /** A reader's own votes on every publication, the newest publication first (the reader's view in PostgreSQL). */
  ownVotes(participantKey: string, before: number | undefined, limit: number): AtlasPageOwnVote[] {
    const number = (publicationNumber: string) => Number(publicationNumber.slice(2));
    return [...this.votes.values()]
      .filter((vote) => vote.participantKey === participantKey &&
        (before === undefined || number(vote.publicationNumber) < before))
      .sort((left, right) => number(right.publicationNumber) - number(left.publicationNumber))
      .slice(0, limit)
      .map((vote) => ({ publicationNumber: vote.publicationNumber, vote: vote.vote, votedAt: vote.votedAt,
        publicationListed: this.open(vote.publicationNumber) }));
  }

  /** Every stored row, as text, for tests that scan what is kept. */
  snapshot(): { participants: StoredParticipant[]; comments: StoredComment[]; reports: string[]; votes: number;
    sessionEnds: string[] } {
    return {
      participants: structuredClone([...this.participants.values()]),
      comments: structuredClone(this.comments),
      reports: [...this.reports.values()].map(({ reporterKey }) => reporterKey),
      votes: this.votes.size,
      sessionEnds: [...this.sessionEnds.keys()],
    };
  }
}

// PostgreSQL -----------------------------------------------------------------------------------------------------------

const ERROR_CODES: Array<[string, AtlasParticipationErrorCode]> = [
  ["ATLAS_PARTICIPATION_INPUT_INVALID", "INPUT_INVALID"],
  ["ATLAS_MODERATION_INPUT_INVALID", "INPUT_INVALID"],
  ["ATLAS_PARTICIPATION_DISPLAY_NAME_REQUIRED", "DISPLAY_NAME_REQUIRED"],
  ["ATLAS_PARTICIPATION_STOPPED", "STOPPED"],
  ["ATLAS_PARTICIPATION_NOT_SHOWN", "NOT_SHOWN"],
  ["ATLAS_PICK_NOT_PUBLISHED", "PICK_NOT_PUBLISHED"],
];

async function callFunction<Row extends object>(pool: Pool, sql: string, values: unknown[]): Promise<Row[]> {
  try {
    return (await pool.query(sql, values) as unknown as { rows: Row[] }).rows;
  } catch (error) {
    const code = error instanceof Error ? ERROR_CODES.find(([message]) => error.message.includes(message))?.[1] : undefined;
    if (code !== undefined) throw new AtlasParticipationError(code);
    throw error;
  }
}

/** The participation store through the access role's nine SECURITY DEFINER functions; it reads no table directly. */
export class PostgresAtlasParticipationStore implements AtlasParticipationStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async inspectParticipant(participantKey: string): Promise<AtlasParticipantView | null> {
    checkParticipant(participantKey);
    const [row] = await callFunction<{ participant_display_name: string | null; participant_stopped: boolean }>(this.pool,
      `SELECT participant_display_name, participant_stopped FROM ${this.schema}.inspect_atlas_participant($1::text)`,
      [participantKey]);
    return row === undefined ? null : { displayName: row.participant_display_name, stopped: row.participant_stopped };
  }

  async setDisplayName(participantKey: string, displayName: string, at: string): Promise<AtlasParticipantView> {
    checkParticipant(participantKey);
    checkAt(at);
    if (!trimmedWithin(displayName, ATLAS_DISPLAY_NAME_MAX_CHARACTERS)) throw invalid();
    const [row] = await callFunction<{ participant_display_name: string | null; participant_stopped: boolean }>(this.pool,
      `SELECT participant_display_name, participant_stopped
         FROM ${this.schema}.set_atlas_display_name($1::text, $2::text, $3::timestamptz)`,
      [participantKey, displayName, at]);
    return { displayName: row!.participant_display_name, stopped: row!.participant_stopped };
  }

  async setVote(participantKey: string, publicationNumber: string, vote: AtlasVote | null, at: string):
    Promise<{ agree: number; disagree: number }> {
    checkParticipant(participantKey);
    checkPublication(publicationNumber);
    checkAt(at);
    if (vote !== null && !(ATLAS_VOTES as readonly string[]).includes(vote)) throw invalid();
    const [row] = await callFunction<{ agree_count: string | number; disagree_count: string | number }>(this.pool,
      `SELECT agree_count, disagree_count
         FROM ${this.schema}.set_atlas_vote($1::text, $2::text, $3::text, $4::timestamptz)`,
      [participantKey, publicationNumber, vote, at]);
    return { agree: Number(row!.agree_count), disagree: Number(row!.disagree_count) };
  }

  async postComment(participantKey: string, publicationNumber: string, body: string, at: string,
    firstDisplayName: string | null = null): Promise<string> {
    checkParticipant(participantKey);
    checkPublication(publicationNumber);
    checkAt(at);
    if (!trimmedWithin(body, ATLAS_COMMENT_MAX_CHARACTERS) ||
      (firstDisplayName !== null && !trimmedWithin(firstDisplayName, ATLAS_DISPLAY_NAME_MAX_CHARACTERS))) {
      throw invalid();
    }
    const [row] = await callFunction<{ comment_public_id: string }>(this.pool,
      `SELECT comment_public_id
         FROM ${this.schema}.post_atlas_comment($1::text, $2::text, $3::text, $4::text, $5::timestamptz)`,
      [participantKey, publicationNumber, body, firstDisplayName, at]);
    return z.string().regex(COMMENT_ID).parse(row!.comment_public_id);
  }

  async deleteComment(participantKey: string, publicId: string): Promise<boolean> {
    checkParticipant(participantKey);
    checkComment(publicId);
    const [row] = await callFunction<{ comment_deleted: boolean }>(this.pool,
      `SELECT comment_deleted FROM ${this.schema}.delete_atlas_comment($1::text, $2::text)`, [participantKey, publicId]);
    return row?.comment_deleted === true;
  }

  async reportComment(reporterKey: string, publicId: string, at: string): Promise<AtlasReportOutcome> {
    if (typeof reporterKey !== "string" || !REPORTER_KEY.test(reporterKey)) throw invalid();
    checkComment(publicId);
    checkAt(at);
    const [row] = await callFunction<{ report_outcome: string }>(this.pool,
      `SELECT report_outcome FROM ${this.schema}.report_atlas_comment($1::text, $2::text, $3::timestamptz)`,
      [reporterKey, publicId, at]);
    return z.enum(["reported", "already_reported", "not_found"]).parse(row!.report_outcome);
  }

  async forgetParticipant(participantKey: string, at: string): Promise<AtlasForgetResult> {
    checkParticipant(participantKey);
    checkAt(at);
    const [row] = await callFunction<{ votes_deleted: string | number; comments_deleted: string | number;
      reports_deleted: string | number }>(this.pool,
      `SELECT votes_deleted, comments_deleted, reports_deleted
         FROM ${this.schema}.forget_atlas_participant($1::text, $2::timestamptz)`,
      [participantKey, at]);
    return { votes: Number(row!.votes_deleted), comments: Number(row!.comments_deleted), reports: Number(row!.reports_deleted) };
  }

  async endSessions(participantKey: string, _at: string): Promise<void> {
    checkParticipant(participantKey);
    await callFunction(this.pool, `SELECT ${this.schema}.end_atlas_sessions($1::text)`, [participantKey]);
  }

  async sessionCurrent(participantKey: string, signedInAt: string, _at: string): Promise<boolean> {
    checkParticipant(participantKey);
    checkAt(signedInAt);
    const [row] = await callFunction<{ session_current: boolean }>(this.pool,
      `SELECT session_current FROM ${this.schema}.atlas_session_current($1::text, $2::timestamptz)`,
      [participantKey, signedInAt]);
    return row?.session_current === true;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface ModerationRow {
  comment_public_id: string;
  comment_publication_number: string;
  comment_commenter_tag: string;
  comment_commenter_stopped: boolean;
  comment_display_name: string;
  comment_body: string;
  comment_state: string;
  comment_report_count: number;
  comment_posted_at: Date | string;
  comment_state_changed_at: Date | string;
}

const MODERATION_COLUMNS = "comment_public_id, comment_publication_number, comment_commenter_tag, " +
  "comment_commenter_stopped, comment_display_name, comment_body, comment_state, comment_report_count, " +
  "comment_posted_at, comment_state_changed_at";

function moderationFromRow(row: ModerationRow): AtlasCommentModerationView {
  return {
    publicId: row.comment_public_id,
    publicationNumber: row.comment_publication_number,
    commenterTag: row.comment_commenter_tag,
    commenterStopped: row.comment_commenter_stopped,
    displayName: row.comment_display_name,
    body: row.comment_body,
    state: z.enum(["shown", "hidden", "removed"]).parse(row.comment_state),
    reportCount: Number(row.comment_report_count),
    postedAt: iso(row.comment_posted_at),
    stateChangedAt: iso(row.comment_state_changed_at),
  };
}

interface PickRow {
  pick_slot: number;
  pick_publication_number: string;
  pick_reason: string;
  pick_set_at: Date | string;
}

const pickFromRow = (row: PickRow): AtlasHomePick => ({
  slot: Number(row.pick_slot),
  publicationNumber: row.pick_publication_number,
  reason: row.pick_reason,
  setAt: iso(row.pick_set_at),
});

/** The moderation store through the review role's five SECURITY DEFINER functions; it reads no table directly. */
export class PostgresAtlasModerationStore implements AtlasModerationStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async inspectComments(query: AtlasCommentQuery): Promise<AtlasCommentModerationView[]> {
    checkQuery(query);
    return (await callFunction<ModerationRow>(this.pool,
      `SELECT ${MODERATION_COLUMNS} FROM ${this.schema}.inspect_atlas_comments($1::boolean, $2::bigint, $3::integer)`,
      [query.reportedOnly, query.before ?? null, query.limit])).map(moderationFromRow);
  }

  async moderateComment(publicId: string, moderation: "hide" | "show" | "remove", at: string):
    Promise<AtlasCommentModerationView | null> {
    checkComment(publicId);
    checkAt(at);
    if (!["hide", "show", "remove"].includes(moderation)) throw invalid();
    const [row] = await callFunction<ModerationRow>(this.pool,
      `SELECT ${MODERATION_COLUMNS} FROM ${this.schema}.moderate_atlas_comment($1::text, $2::text, $3::timestamptz)`,
      [publicId, moderation, at]);
    return row === undefined ? null : moderationFromRow(row);
  }

  async setCommenterStopped(commenterTag: string, stopped: boolean, at: string): Promise<AtlasCommenterView | null> {
    if (typeof commenterTag !== "string" || !COMMENTER_TAG.test(commenterTag) || typeof stopped !== "boolean") {
      throw invalid();
    }
    checkAt(at);
    const [row] = await callFunction<{ commenter_tag_now: string; commenter_stopped_now: boolean;
      commenter_comment_count: string | number }>(this.pool,
      `SELECT commenter_tag_now, commenter_stopped_now, commenter_comment_count
         FROM ${this.schema}.set_atlas_commenter_stopped($1::text, $2::boolean, $3::timestamptz)`,
      [commenterTag, stopped, at]);
    return row === undefined ? null
      : { commenterTag: row.commenter_tag_now, stopped: row.commenter_stopped_now, comments: Number(row.commenter_comment_count) };
  }

  async setHomePicks(picks: ReadonlyArray<{ publicationNumber: string; reason: string }>, at: string):
    Promise<AtlasHomePick[]> {
    checkPicks(picks);
    checkAt(at);
    return (await callFunction<PickRow>(this.pool,
      `SELECT pick_slot, pick_publication_number, pick_reason, pick_set_at
         FROM ${this.schema}.set_atlas_home_picks($1::jsonb, $2::timestamptz)`,
      [JSON.stringify(picks.map(({ publicationNumber, reason }) => ({ publicationNumber, reason }))), at])).map(pickFromRow);
  }

  async inspectHomePicks(): Promise<AtlasHomePick[]> {
    return (await callFunction<PickRow>(this.pool,
      `SELECT pick_slot, pick_publication_number, pick_reason, pick_set_at FROM ${this.schema}.inspect_atlas_home_picks()`,
      [])).map(pickFromRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
