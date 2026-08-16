import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  YoutubeComment,
  YoutubeCommentSegmentCursor,
  YoutubeReplyCountMismatch
} from "@askrigor/sources";
import { z } from "zod";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 3_600_000;
const MAX_TOKEN_CHARACTERS = 65_536;
const MAX_ANALYSIS_RECORDS = 500;
const MIN_SECRET_BYTES = 32;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_TOP_LEVEL_PAGE_IDENTIFIERS = 20;
const MAX_REPLY_PAGE_IDENTIFIERS = 100;
const IDENTIFIER_MEMBERSHIP_BYTES = 2_048;
const IDENTIFIER_MEMBERSHIP_BITS = IDENTIFIER_MEMBERSHIP_BYTES * 8;
const IDENTIFIER_MEMBERSHIP_HASHES = 11;
const IDENTIFIER_MEMBERSHIP_CHARACTERS = 2_731;

const boundedInteger = z.number().int().min(0).max(MAX_SAFE_INTEGER);
const youtubeProviderIdentifierSchema = z.string().min(1).max(512);
const pageFingerprintArraySchema = (maximum: number) =>
  z.array(z.string().regex(SHA256_BASE64URL_PATTERN)).max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "Page identifier fingerprints are not unique"
        });
      }
    });
const cursorSchema = z.object({
  top_level_page_token: z.string().min(1).max(1_024).optional(),
  page_fingerprint: z.string().regex(SHA256_PATTERN).optional(),
  previous_top_level_page_sha256:
    pageFingerprintArraySchema(MAX_TOP_LEVEL_PAGE_IDENTIFIERS).optional(),
  thread_offset: boundedInteger,
  top_level_emitted: z.boolean(),
  reply_page_token: z.string().min(1).max(1_024).optional(),
  previous_reply_page_sha256:
    pageFingerprintArraySchema(MAX_REPLY_PAGE_IDENTIFIERS).optional(),
  current_parent_id: youtubeProviderIdentifierSchema.optional(),
  current_expected_replies: boundedInteger.optional(),
  current_replies_retrieved: boundedInteger.optional()
}).strict().superRefine((cursor, context) => {
  const currentFields = [
    cursor.current_parent_id,
    cursor.current_expected_replies,
    cursor.current_replies_retrieved
  ];
  if (cursor.top_level_emitted && currentFields.some((value) => value === undefined)) {
    context.addIssue({ code: "custom", message: "Emitted thread cursor is incomplete" });
  }
  if (!cursor.top_level_emitted && (
    currentFields.some((value) => value !== undefined) ||
    cursor.reply_page_token !== undefined ||
    cursor.previous_reply_page_sha256 !== undefined
  )) {
    context.addIssue({ code: "custom", message: "Unemitted thread cursor has reply state" });
  }
});

const legacySampleIdentifierSchema = z.object({
  comment_id: youtubeProviderIdentifierSchema
}).strict();
const sampleIdentifierSchema = z.union([
  youtubeProviderIdentifierSchema,
  legacySampleIdentifierSchema
]).transform((value) => typeof value === "string" ? value : value.comment_id);
const identifierMembershipSchema = z.string()
  .length(IDENTIFIER_MEMBERSHIP_CHARACTERS)
  .regex(BASE64URL_PATTERN)
  .refine((value) => {
    const decoded = Buffer.from(value, "base64url");
    return decoded.length === IDENTIFIER_MEMBERSHIP_BYTES &&
      decoded.toString("base64url") === value;
  }, { message: "Identifier membership filter is invalid" });
const replyMismatchSchema = z.object({
  parent_comment_id: youtubeProviderIdentifierSchema,
  expected: boundedInteger,
  retrieved: boundedInteger
}).strict();

const continuationStateSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  analysis_limit: z.number().int().min(1).max(MAX_ANALYSIS_RECORDS),
  started_at_ms: boundedInteger,
  expires_at_ms: boundedInteger,
  segment_index: boundedInteger,
  cursor: cursorSchema,
  provider_reported_comments: z.string().regex(/^(0|[1-9][0-9]*)$/).max(64).optional(),
  top_level_comments_retrieved: boundedInteger,
  replies_retrieved: boundedInteger,
  comment_thread_pages: boundedInteger,
  reply_pages: boundedInteger,
  pagination_overlaps_reconciled: boundedInteger.default(0),
  records_retrieved_cumulative: boundedInteger,
  rolling_sha256: z.string().regex(SHA256_PATTERN),
  sample_identifiers: z.array(sampleIdentifierSchema).max(MAX_ANALYSIS_RECORDS),
  seen_identifier_membership: identifierMembershipSchema.optional(),
  reply_count_mismatches: z.array(replyMismatchSchema)
}).strict().superRefine((state, context) => {
  if (state.expires_at_ms !== state.started_at_ms + TOKEN_LIFETIME_MS) {
    context.addIssue({ code: "custom", message: "Continuation expiry must be one hour" });
  }
  if (
    state.records_retrieved_cumulative !==
    state.top_level_comments_retrieved + state.replies_retrieved
  ) {
    context.addIssue({ code: "custom", message: "Continuation counters do not reconcile" });
  }
  if (
    state.sample_identifiers.length !==
    Math.min(MAX_ANALYSIS_RECORDS, state.records_retrieved_cumulative)
  ) {
    context.addIssue({
      code: "custom",
      message: "Continuation sample count does not reconcile with retrieved records"
    });
  }
  const identifiers = state.sample_identifiers;
  if (new Set(identifiers).size !== identifiers.length) {
    context.addIssue({ code: "custom", message: "Continuation sample identifiers are not unique" });
  }
  const mismatchParents = state.reply_count_mismatches.map(({ parent_comment_id }) =>
    parent_comment_id
  );
  if (new Set(mismatchParents).size !== mismatchParents.length) {
    context.addIssue({ code: "custom", message: "Continuation reply mismatches are not unique" });
  }
});

export class YoutubeAuditContinuationError extends Error {
  constructor(
    public readonly code: "youtube_video_audit_continuation_invalid" |
      "youtube_video_audit_continuation_expired",
    message: string
  ) {
    super(message);
    this.name = "YoutubeAuditContinuationError";
  }
}

export interface YoutubeAuditRestartSnapshot {
  video_id: string;
  analysis_limit: number;
  segment_index: number;
  provider_reported_comments?: string;
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  records_retrieved_cumulative: number;
  rolling_sha256: string;
  reply_count_mismatches: YoutubeReplyCountMismatch[];
}

export class YoutubeAuditRestartRequiredError extends Error {
  constructor(
    public readonly code:
      "youtube_video_audit_continuation_migration_restart_required" |
      "youtube_video_audit_identifier_membership_restart_required",
    message: string,
    public readonly snapshot: YoutubeAuditRestartSnapshot
  ) {
    super(message);
    this.name = "YoutubeAuditRestartRequiredError";
  }
}

export interface YoutubeVideoAuditContinuationState {
  version: 1;
  video_id: string;
  analysis_limit: number;
  started_at_ms: number;
  expires_at_ms: number;
  segment_index: number;
  cursor: YoutubeCommentSegmentCursor;
  provider_reported_comments?: string;
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  pagination_overlaps_reconciled: number;
  records_retrieved_cumulative: number;
  rolling_sha256: string;
  sample_identifiers: string[];
  seen_identifier_membership: string;
  reply_count_mismatches: YoutubeReplyCountMismatch[];
}

export function encodeYoutubeAuditContinuation(
  state: YoutubeVideoAuditContinuationState,
  secret: string
): string {
  validateSecret(secret);
  const parsed = parseState(state);
  const encodedPayload = Buffer.from(canonicalJson(parsed), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
  const token = `${encodedPayload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw new Error("YouTube audit continuation token is too large");
  }
  return token;
}

export function decodeYoutubeAuditContinuation(
  token: string,
  secret: string,
  nowMs: number
): YoutubeVideoAuditContinuationState {
  validateSecret(secret);
  if (token.length > MAX_TOKEN_CHARACTERS) {
    throw invalidContinuation("Invalid YouTube audit continuation token: token is too large");
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Invalid YouTube audit continuation clock");
  }
  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    !BASE64URL_PATTERN.test(parts[0]) ||
    !BASE64URL_PATTERN.test(parts[1])
  ) {
    throw invalidContinuation("Invalid YouTube audit continuation token");
  }
  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
  const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
  if (
    suppliedBytes.toString("base64url") !== suppliedSignature ||
    suppliedBytes.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedBytes, expectedSignature)
  ) {
    throw invalidContinuation("Invalid YouTube audit continuation token signature");
  }
  const payloadBytes = Buffer.from(encodedPayload, "base64url");
  if (payloadBytes.toString("base64url") !== encodedPayload) {
    throw invalidContinuation("Invalid YouTube audit continuation token payload");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw invalidContinuation("Invalid YouTube audit continuation token payload");
  }
  const structurallyValidState = continuationStateSchema.safeParse(payload);
  if (!structurallyValidState.success) {
    throw invalidContinuation("Invalid YouTube audit continuation token state");
  }
  if (nowMs >= structurallyValidState.data.expires_at_ms) {
    throw new YoutubeAuditContinuationError(
      "youtube_video_audit_continuation_expired",
      "YouTube audit continuation token expired"
    );
  }
  let state: YoutubeVideoAuditContinuationState;
  try {
    state = parseState(structurallyValidState.data);
  } catch (error) {
    if (error instanceof YoutubeAuditRestartRequiredError) throw error;
    throw invalidContinuation("Invalid YouTube audit continuation token state");
  }
  return state;
}

export function advanceYoutubeAuditState(
  state: Omit<YoutubeVideoAuditContinuationState, "cursor">,
  comments: readonly YoutubeComment[],
  counters: {
    top_level_comments_retrieved: number;
    replies_retrieved: number;
    comment_thread_pages: number;
    reply_pages: number;
    pagination_overlaps_reconciled?: number;
    reply_count_mismatches: YoutubeReplyCountMismatch[];
  },
  cursor: YoutubeCommentSegmentCursor
): YoutubeVideoAuditContinuationState {
  const numericCounters = [
    counters.top_level_comments_retrieved,
    counters.replies_retrieved,
    counters.comment_thread_pages,
    counters.reply_pages,
    counters.pagination_overlaps_reconciled ?? 0
  ];
  if (
    numericCounters.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    counters.top_level_comments_retrieved + counters.replies_retrieved !== comments.length ||
    comments.some(({ video_id }) => video_id !== state.video_id)
  ) {
    throw new Error("Invalid YouTube audit continuation advance");
  }
  const identifiers = new Set(state.sample_identifiers);
  const exactIdentifiersCoverPriorCorpus =
    state.sample_identifiers.length === state.records_retrieved_cumulative;
  const membership = decodeIdentifierMembership(state.seen_identifier_membership);
  const acceptedComments: YoutubeComment[] = [];
  let reconciledTopLevel = 0;
  let reconciledReplies = 0;
  for (const comment of comments) {
    const { comment_id } = comment;
    if (identifiers.has(comment_id)) {
      if (comment.is_reply) reconciledReplies += 1;
      else reconciledTopLevel += 1;
      continue;
    }
    if (
      identifierMembershipPossiblyContains(membership, comment_id) &&
      !exactIdentifiersCoverPriorCorpus
    ) {
      throw new YoutubeAuditRestartRequiredError(
        "youtube_video_audit_identifier_membership_restart_required",
        "Possible duplicate YouTube comment identifier at a non-adjacent membership boundary; restart the audit from the video ID",
        createRestartSnapshot(state)
      );
    }
    identifiers.add(comment_id);
    addIdentifierToMembership(membership, comment_id);
    acceptedComments.push(comment);
  }
  if (
    reconciledTopLevel > counters.top_level_comments_retrieved ||
    reconciledReplies > counters.replies_retrieved
  ) throw new Error("Invalid YouTube audit continuation overlap counters");
  const sampleIdentifiers = [...identifiers]
    .sort((left, right) =>
      rankYoutubeCommentIdentifier(left).localeCompare(rankYoutubeCommentIdentifier(right)) ||
      left.localeCompare(right)
    )
    .slice(0, MAX_ANALYSIS_RECORDS);
  const mismatchByParent = new Map(
    state.reply_count_mismatches.map((mismatch) => [mismatch.parent_comment_id, mismatch])
  );
  for (const mismatch of counters.reply_count_mismatches) {
    const existing = mismatchByParent.get(mismatch.parent_comment_id);
    if (existing !== undefined && (
      existing.expected !== mismatch.expected || existing.retrieved !== mismatch.retrieved
    )) {
      throw new Error("YouTube reply mismatch changed within continuation chain");
    }
    mismatchByParent.set(mismatch.parent_comment_id, mismatch);
  }
  const commentPayload = acceptedComments.map(canonicalCommentJson).join("\n");
  const candidate: YoutubeVideoAuditContinuationState = {
    ...state,
    segment_index: state.segment_index + 1,
    cursor,
    top_level_comments_retrieved:
      state.top_level_comments_retrieved + counters.top_level_comments_retrieved -
      reconciledTopLevel,
    replies_retrieved: state.replies_retrieved + counters.replies_retrieved -
      reconciledReplies,
    comment_thread_pages: state.comment_thread_pages + counters.comment_thread_pages,
    reply_pages: state.reply_pages + counters.reply_pages,
    pagination_overlaps_reconciled:
      state.pagination_overlaps_reconciled +
      (counters.pagination_overlaps_reconciled ?? 0) +
      reconciledTopLevel + reconciledReplies,
    records_retrieved_cumulative:
      state.records_retrieved_cumulative + acceptedComments.length,
    rolling_sha256: acceptedComments.length === 0
      ? state.rolling_sha256
      : createHash("sha256")
          .update(`${state.rolling_sha256}\n${commentPayload}`)
          .digest("hex"),
    sample_identifiers: sampleIdentifiers,
    seen_identifier_membership: membership.toString("base64url"),
    reply_count_mismatches: [...mismatchByParent.values()]
  };
  return parseState(candidate);
}

function parseState(value: unknown): YoutubeVideoAuditContinuationState {
  const result = continuationStateSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid YouTube audit continuation state");
  }
  const parsed = result.data;
  let seenIdentifierMembership = parsed.seen_identifier_membership;
  if (seenIdentifierMembership === undefined) {
    if (parsed.sample_identifiers.length !== parsed.records_retrieved_cumulative) {
      throw new YoutubeAuditRestartRequiredError(
        "youtube_video_audit_continuation_migration_restart_required",
        "YouTube audit continuation predates the full-corpus identifier-membership upgrade; restart the audit from the video ID",
        createRestartSnapshot(parsed)
      );
    }
    seenIdentifierMembership = createYoutubeAuditIdentifierMembership(
      parsed.sample_identifiers
    );
  }
  const membership = decodeIdentifierMembership(seenIdentifierMembership);
  if (parsed.sample_identifiers.some((identifier) =>
    !identifierMembershipPossiblyContains(membership, identifier)
  )) {
    throw new Error("Invalid YouTube audit continuation state");
  }
  return {
    ...parsed,
    seen_identifier_membership: seenIdentifierMembership
  } as YoutubeVideoAuditContinuationState;
}

function createRestartSnapshot(state: {
  video_id: string;
  analysis_limit: number;
  segment_index: number;
  provider_reported_comments?: string;
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  records_retrieved_cumulative: number;
  rolling_sha256: string;
  reply_count_mismatches: readonly YoutubeReplyCountMismatch[];
}): YoutubeAuditRestartSnapshot {
  return {
    video_id: state.video_id,
    analysis_limit: state.analysis_limit,
    segment_index: state.segment_index,
    ...(state.provider_reported_comments === undefined
      ? {}
      : { provider_reported_comments: state.provider_reported_comments }),
    top_level_comments_retrieved: state.top_level_comments_retrieved,
    replies_retrieved: state.replies_retrieved,
    comment_thread_pages: state.comment_thread_pages,
    reply_pages: state.reply_pages,
    records_retrieved_cumulative: state.records_retrieved_cumulative,
    rolling_sha256: state.rolling_sha256,
    reply_count_mismatches: state.reply_count_mismatches.map((mismatch) => ({
      ...mismatch
    }))
  };
}

export function createYoutubeAuditIdentifierMembership(
  identifiers: readonly string[]
): string {
  const membership = Buffer.alloc(IDENTIFIER_MEMBERSHIP_BYTES);
  for (const identifier of identifiers) addIdentifierToMembership(membership, identifier);
  return membership.toString("base64url");
}

function decodeIdentifierMembership(value: string): Buffer {
  const membership = Buffer.from(value, "base64url");
  if (
    membership.length !== IDENTIFIER_MEMBERSHIP_BYTES ||
    membership.toString("base64url") !== value
  ) {
    throw new Error("Invalid YouTube audit identifier membership filter");
  }
  return membership;
}

function identifierMembershipPossiblyContains(
  membership: Buffer,
  identifier: string
): boolean {
  return identifierMembershipIndexes(identifier).every((index) =>
    (membership[index >>> 3]! & (1 << (index & 7))) !== 0
  );
}

function addIdentifierToMembership(membership: Buffer, identifier: string): void {
  for (const index of identifierMembershipIndexes(identifier)) {
    membership[index >>> 3] = membership[index >>> 3]! | (1 << (index & 7));
  }
}

function identifierMembershipIndexes(identifier: string): number[] {
  const digest = createHash("sha256").update(identifier).digest();
  return Array.from(
    { length: IDENTIFIER_MEMBERSHIP_HASHES },
    (_, index) => digest.readUInt16BE(index * 2) & (IDENTIFIER_MEMBERSHIP_BITS - 1)
  );
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("YouTube audit continuation secret must contain at least 32 UTF-8 bytes");
  }
}

function invalidContinuation(message: string): YoutubeAuditContinuationError {
  return new YoutubeAuditContinuationError(
    "youtube_video_audit_continuation_invalid",
    message
  );
}

export function rankYoutubeCommentIdentifier(commentId: string): string {
  return createHash("sha256").update(commentId).digest("hex");
}

function canonicalCommentJson(comment: YoutubeComment): string {
  return canonicalJson({
    video_id: comment.video_id,
    comment_id: comment.comment_id,
    parent_id: comment.parent_id,
    top_level_comment_id: comment.top_level_comment_id,
    is_reply: comment.is_reply,
    author_channel_id: comment.author_channel_id ?? null,
    author_display_name: comment.author_display_name ?? null,
    text: comment.text,
    like_count: comment.like_count,
    published_at: comment.published_at,
    updated_at: comment.updated_at
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}
