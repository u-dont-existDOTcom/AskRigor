import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  YoutubeComment,
  YoutubeCommentSegmentCursor
} from "@askrigor/sources";
import { z } from "zod";

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 3_600_000;
const MAX_TOKEN_CHARACTERS = 65_536;
const MAX_ANALYSIS_RECORDS = 500;
const MIN_SECRET_BYTES = 32;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const YOUTUBE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const boundedInteger = z.number().int().min(0).max(MAX_SAFE_INTEGER);
const cursorSchema = z.object({
  top_level_page_token: z.string().min(1).max(1_024).optional(),
  page_fingerprint: z.string().regex(SHA256_PATTERN).optional(),
  thread_offset: boundedInteger,
  top_level_emitted: z.boolean(),
  reply_page_token: z.string().min(1).max(1_024).optional(),
  current_parent_id: z.string().regex(YOUTUBE_IDENTIFIER_PATTERN).optional(),
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
    currentFields.some((value) => value !== undefined) || cursor.reply_page_token !== undefined
  )) {
    context.addIssue({ code: "custom", message: "Unemitted thread cursor has reply state" });
  }
  if (
    cursor.current_expected_replies !== undefined &&
    cursor.current_replies_retrieved !== undefined &&
    cursor.current_replies_retrieved > cursor.current_expected_replies
  ) {
    context.addIssue({ code: "custom", message: "Retrieved reply count exceeds expected replies" });
  }
});

const sampleIdentifierSchema = z.object({
  comment_id: z.string().regex(YOUTUBE_IDENTIFIER_PATTERN)
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
  records_retrieved_cumulative: boundedInteger,
  rolling_sha256: z.string().regex(SHA256_PATTERN),
  sample_identifiers: z.array(sampleIdentifierSchema).max(MAX_ANALYSIS_RECORDS)
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
  if (state.sample_identifiers.length > state.analysis_limit) {
    context.addIssue({ code: "custom", message: "Continuation sample exceeds analysis limit" });
  }
  if (state.sample_identifiers.length > state.records_retrieved_cumulative) {
    context.addIssue({ code: "custom", message: "Continuation sample exceeds retrieved records" });
  }
  const identifiers = state.sample_identifiers.map(({ comment_id }) => comment_id);
  if (new Set(identifiers).size !== identifiers.length) {
    context.addIssue({ code: "custom", message: "Continuation sample identifiers are not unique" });
  }
});

export interface YoutubeAuditSampleIdentifier {
  comment_id: string;
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
  records_retrieved_cumulative: number;
  rolling_sha256: string;
  sample_identifiers: YoutubeAuditSampleIdentifier[];
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
    throw new Error("YouTube audit continuation token is too large");
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
    throw new Error("Invalid YouTube audit continuation token");
  }
  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
  const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
  if (
    suppliedBytes.toString("base64url") !== suppliedSignature ||
    suppliedBytes.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedBytes, expectedSignature)
  ) {
    throw new Error("Invalid YouTube audit continuation token signature");
  }
  const payloadBytes = Buffer.from(encodedPayload, "base64url");
  if (payloadBytes.toString("base64url") !== encodedPayload) {
    throw new Error("Invalid YouTube audit continuation token payload");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new Error("Invalid YouTube audit continuation token payload");
  }
  const state = parseState(payload);
  if (nowMs >= state.expires_at_ms) {
    throw new Error("YouTube audit continuation token expired");
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
  },
  cursor: YoutubeCommentSegmentCursor
): YoutubeVideoAuditContinuationState {
  const values = Object.values(counters);
  if (
    values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    counters.top_level_comments_retrieved + counters.replies_retrieved !== comments.length ||
    comments.some(({ video_id }) => video_id !== state.video_id)
  ) {
    throw new Error("Invalid YouTube audit continuation advance");
  }
  const identifiers = new Set(state.sample_identifiers.map(({ comment_id }) => comment_id));
  for (const { comment_id } of comments) identifiers.add(comment_id);
  const sampleIdentifiers = [...identifiers]
    .sort((left, right) => sampleRank(left).localeCompare(sampleRank(right)) || left.localeCompare(right))
    .slice(0, state.analysis_limit)
    .map((comment_id) => ({ comment_id }));
  const commentPayload = comments.map(canonicalCommentJson).join("\n");
  const candidate: YoutubeVideoAuditContinuationState = {
    ...state,
    segment_index: state.segment_index + 1,
    cursor,
    top_level_comments_retrieved:
      state.top_level_comments_retrieved + counters.top_level_comments_retrieved,
    replies_retrieved: state.replies_retrieved + counters.replies_retrieved,
    comment_thread_pages: state.comment_thread_pages + counters.comment_thread_pages,
    reply_pages: state.reply_pages + counters.reply_pages,
    records_retrieved_cumulative: state.records_retrieved_cumulative + comments.length,
    rolling_sha256: createHash("sha256")
      .update(`${state.rolling_sha256}\n${commentPayload}`)
      .digest("hex"),
    sample_identifiers: sampleIdentifiers
  };
  return parseState(candidate);
}

function parseState(value: unknown): YoutubeVideoAuditContinuationState {
  const result = continuationStateSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid YouTube audit continuation state");
  }
  return result.data as YoutubeVideoAuditContinuationState;
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("YouTube audit continuation secret must contain at least 32 UTF-8 bytes");
  }
}

function sampleRank(commentId: string): string {
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
