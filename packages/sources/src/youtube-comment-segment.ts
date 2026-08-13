import { z } from "zod";

import { fetchJson, UpstreamHttpError } from "./http.js";
import {
  parseYoutubeVideoId,
  type YoutubeComment,
  type YoutubeConfig,
  type YoutubeReplyCountMismatch
} from "./youtube.js";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 20;
const DEFAULT_MAX_PROVIDER_REQUESTS = 50;
const DEFAULT_MAX_ELAPSED_MS = 15_000;

const providerCommentSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    videoId: z.string().optional(),
    parentId: z.string().optional(),
    textDisplay: z.string(),
    authorDisplayName: z.string().optional(),
    authorChannelId: z.object({ value: z.string().min(1) }).strict().optional(),
    likeCount: z.number().int().nonnegative(),
    publishedAt: z.string().min(1),
    updatedAt: z.string().min(1)
  }).passthrough()
}).passthrough();

const commentThreadSchema = z.object({
  id: z.string().min(1),
  snippet: z.object({
    videoId: z.string().min(1),
    topLevelComment: providerCommentSchema,
    totalReplyCount: z.number().int().nonnegative()
  }).passthrough()
}).passthrough();

const commentThreadPageSchema = z.object({
  nextPageToken: z.string().min(1).optional(),
  pageInfo: z.object({
    totalResults: z.number().int().nonnegative(),
    resultsPerPage: z.number().int().nonnegative()
  }).passthrough(),
  items: z.array(commentThreadSchema)
}).passthrough();

const replyPageSchema = z.object({
  nextPageToken: z.string().min(1).optional(),
  pageInfo: z.object({
    totalResults: z.number().int().nonnegative().optional(),
    resultsPerPage: z.number().int().nonnegative()
  }).passthrough(),
  items: z.array(providerCommentSchema)
}).passthrough();

export interface YoutubeCommentSegmentCursor {
  top_level_page_token?: string;
  page_fingerprint?: string;
  thread_offset: number;
  top_level_emitted: boolean;
  reply_page_token?: string;
  current_parent_id?: string;
  current_expected_replies?: number;
  current_replies_retrieved?: number;
}

type YoutubeCommentSegmentAccessStatus =
  | "api_visible_complete"
  | "partial"
  | "comments_disabled"
  | "inaccessible"
  | "rate_limited"
  | "not_found"
  | "error";

export interface YoutubeCommentSegmentResult {
  video_id: string;
  comments: YoutubeComment[];
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  reply_count_mismatches: YoutubeReplyCountMismatch[];
  exhausted: boolean;
  next_cursor?: YoutubeCommentSegmentCursor;
  access_status: YoutubeCommentSegmentAccessStatus;
  limitations: string[];
  error?: {
    code: string;
    message: string;
    http_status?: number;
    retryable?: boolean;
  };
}

export interface YoutubeCommentSegmentRuntime {
  max_provider_requests?: number;
  max_elapsed_ms?: number;
  now?: () => number;
}

interface SegmentAccounting {
  attempts: number;
  maxAttempts: number;
  startedAt: number;
  maxElapsedMs: number;
  now: () => number;
}

class SegmentBudgetReached extends Error {}

export async function getYoutubeCommentSegment(
  input: {
    video: string;
    cursor?: YoutubeCommentSegmentCursor;
    page_size?: number;
  },
  config: YoutubeConfig,
  runtime: YoutubeCommentSegmentRuntime = {}
): Promise<YoutubeCommentSegmentResult> {
  const videoId = parseYoutubeVideoId(input.video);
  if (videoId === undefined || config.apiKey.trim().length === 0) {
    return segmentFailure(videoId ?? input.video, "youtube_comment_segment_input_invalid");
  }
  const pageSize = input.page_size ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    return segmentFailure(videoId, "youtube_comment_segment_input_invalid");
  }
  const now = runtime.now ?? Date.now;
  const startedAt = now();
  const accounting: SegmentAccounting = {
    attempts: 0,
    maxAttempts: runtime.max_provider_requests ?? DEFAULT_MAX_PROVIDER_REQUESTS,
    startedAt,
    maxElapsedMs: runtime.max_elapsed_ms ?? DEFAULT_MAX_ELAPSED_MS,
    now
  };
  const comments: YoutubeComment[] = [];
  const mismatches: YoutubeReplyCountMismatch[] = [];
  let topLevelCount = 0;
  let replyCount = 0;
  let commentThreadPages = 0;
  let replyPages = 0;
  let cursor: YoutubeCommentSegmentCursor = input.cursor ?? {
    thread_offset: 0,
    top_level_emitted: false
  };

  try {
    while (true) {
      const page = await fetchThreadPage(videoId, pageSize, cursor.top_level_page_token, config, accounting);
      commentThreadPages += 1;
      const fingerprint = await threadPageFingerprint(page.items.map(({ id }) => id));
      if (cursor.page_fingerprint !== undefined && cursor.page_fingerprint !== fingerprint) {
        return partialResult({
          videoId,
          comments,
          topLevelCount,
          replyCount,
          commentThreadPages,
          replyPages,
          mismatches,
          cursor,
          limitation: "YouTube comment-thread page changed before continuation could resume.",
          errorCode: "youtube_comment_segment_changed"
        });
      }
      if (
        page.items.length === 0 &&
        page.nextPageToken === undefined &&
        cursor.thread_offset === 0 &&
        !cursor.top_level_emitted
      ) {
        return {
          video_id: videoId,
          comments,
          top_level_comments_retrieved: topLevelCount,
          replies_retrieved: replyCount,
          comment_thread_pages: commentThreadPages,
          reply_pages: replyPages,
          reply_count_mismatches: mismatches,
          exhausted: true,
          access_status: "api_visible_complete",
          limitations: []
        };
      }
      if (cursor.thread_offset < 0 || cursor.thread_offset >= page.items.length) {
        return segmentFailure(videoId, "youtube_comment_segment_cursor_invalid");
      }
      const thread = page.items[cursor.thread_offset]!;
      const topLevel = thread.snippet.topLevelComment;
      const parentId = topLevel.id;
      const expectedReplies = thread.snippet.totalReplyCount;
      if (
        thread.snippet.videoId !== videoId ||
        topLevel.snippet.videoId !== videoId ||
        (cursor.current_parent_id !== undefined && cursor.current_parent_id !== parentId) ||
        (cursor.current_expected_replies !== undefined &&
          cursor.current_expected_replies !== expectedReplies)
      ) {
        return segmentFailure(videoId, "youtube_comment_segment_cursor_invalid");
      }

      if (!cursor.top_level_emitted) {
        comments.push(normalizeComment(topLevel, videoId, parentId, false));
        topLevelCount += 1;
        cursor = {
          ...cursor,
          page_fingerprint: fingerprint,
          top_level_emitted: true,
          current_parent_id: parentId,
          current_expected_replies: expectedReplies,
          current_replies_retrieved: 0
        };
      }

      let replyPageToken = cursor.reply_page_token;
      let currentReplies = cursor.current_replies_retrieved ?? 0;
      while (currentReplies < expectedReplies) {
        const replyPage = await fetchReplyPage(
          videoId,
          parentId,
          replyPageToken,
          config,
          accounting
        );
        replyPages += 1;
        for (const reply of replyPage.items) {
          if (reply.snippet.parentId !== parentId) {
            return segmentFailure(videoId, "youtube_comment_segment_response_invalid");
          }
          comments.push(normalizeComment(reply, videoId, parentId, true));
          replyCount += 1;
          currentReplies += 1;
        }
        replyPageToken = replyPage.nextPageToken;
        cursor = {
          ...cursor,
          page_fingerprint: fingerprint,
          reply_page_token: replyPageToken,
          current_replies_retrieved: currentReplies
        };
        if (replyPageToken === undefined) break;
      }
      if (currentReplies !== expectedReplies) {
        mismatches.push({
          parent_comment_id: parentId,
          expected: expectedReplies,
          retrieved: currentReplies
        });
      }

      const nextThreadOffset = cursor.thread_offset + 1;
      if (nextThreadOffset < page.items.length) {
        cursor = {
          top_level_page_token: cursor.top_level_page_token,
          page_fingerprint: fingerprint,
          thread_offset: nextThreadOffset,
          top_level_emitted: false
        };
        continue;
      }
      if (page.nextPageToken === undefined) {
        return {
          video_id: videoId,
          comments,
          top_level_comments_retrieved: topLevelCount,
          replies_retrieved: replyCount,
          comment_thread_pages: commentThreadPages,
          reply_pages: replyPages,
          reply_count_mismatches: mismatches,
          exhausted: mismatches.length === 0,
          access_status: mismatches.length === 0 ? "api_visible_complete" : "partial",
          limitations: mismatches.length === 0
            ? []
            : ["YouTube reply counts did not reconcile for every retrieved thread."]
        };
      }
      cursor = {
        top_level_page_token: page.nextPageToken,
        thread_offset: 0,
        top_level_emitted: false
      };
    }
  } catch (error) {
    if (error instanceof SegmentBudgetReached) {
      return partialResult({
        videoId,
        comments,
        topLevelCount,
        replyCount,
        commentThreadPages,
        replyPages,
        mismatches,
        cursor,
        limitation: "YouTube comment segment reached its per-call budget; continue with next_cursor."
      });
    }
    if (error instanceof UpstreamHttpError) {
      const failure = providerFailure(videoId, error);
      if (comments.length > 0) {
        return {
          ...partialResult({
            videoId,
            comments,
            topLevelCount,
            replyCount,
            commentThreadPages,
            replyPages,
            mismatches,
            cursor,
            limitation: failure.limitations[0] ?? "YouTube retrieval stopped at a provider boundary."
          }),
          error: failure.error
        };
      }
      return failure;
    }
    return segmentFailure(videoId, "youtube_comment_segment_failed");
  }
}

function partialResult(input: {
  videoId: string;
  comments: YoutubeComment[];
  topLevelCount: number;
  replyCount: number;
  commentThreadPages: number;
  replyPages: number;
  mismatches: YoutubeReplyCountMismatch[];
  cursor: YoutubeCommentSegmentCursor;
  limitation: string;
  errorCode?: string;
}): YoutubeCommentSegmentResult {
  return {
    video_id: input.videoId,
    comments: input.comments,
    top_level_comments_retrieved: input.topLevelCount,
    replies_retrieved: input.replyCount,
    comment_thread_pages: input.commentThreadPages,
    reply_pages: input.replyPages,
    reply_count_mismatches: input.mismatches,
    exhausted: false,
    next_cursor: input.cursor,
    access_status: "partial",
    limitations: [input.limitation],
    ...(input.errorCode === undefined
      ? {}
      : {
          error: {
            code: input.errorCode,
            message: "YouTube comment segment could not safely resume",
            retryable: false
          }
        })
  };
}

async function fetchThreadPage(
  videoId: string,
  pageSize: number,
  pageToken: string | undefined,
  config: YoutubeConfig,
  accounting: SegmentAccounting
): Promise<z.infer<typeof commentThreadPageSchema>> {
  const url = new URL(`${YOUTUBE_API_URL}/commentThreads`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("maxResults", String(pageSize));
  url.searchParams.set("textFormat", "plainText");
  url.searchParams.set("order", "time");
  if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", config.apiKey);
  return fetchParsed(url, commentThreadPageSchema, accounting);
}

async function fetchReplyPage(
  videoId: string,
  parentId: string,
  pageToken: string | undefined,
  config: YoutubeConfig,
  accounting: SegmentAccounting
): Promise<z.infer<typeof replyPageSchema>> {
  const url = new URL(`${YOUTUBE_API_URL}/comments`);
  url.searchParams.set("part", "snippet");
  url.searchParams.set("parentId", parentId);
  url.searchParams.set("maxResults", "100");
  url.searchParams.set("textFormat", "plainText");
  if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
  url.searchParams.set("key", config.apiKey);
  const page = await fetchParsed(url, replyPageSchema, accounting);
  for (const reply of page.items) {
    if (reply.snippet.videoId !== undefined && reply.snippet.videoId !== videoId) {
      throw new Error("Reply video mismatch");
    }
  }
  return page;
}

async function fetchParsed<T>(
  url: URL,
  schema: z.ZodType<T>,
  accounting: SegmentAccounting
): Promise<T> {
  const payload = await fetchJson(url.toString(), {
    maxRetries: 0,
    timeoutMs: Math.max(1, accounting.maxElapsedMs - elapsed(accounting)),
    beforeAttempt: () => {
      if (accounting.attempts >= accounting.maxAttempts ||
        elapsed(accounting) >= accounting.maxElapsedMs) {
        throw new SegmentBudgetReached();
      }
      accounting.attempts += 1;
    }
  });
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid YouTube comment response");
  return parsed.data;
}

function elapsed(accounting: SegmentAccounting): number {
  const value = accounting.now();
  if (!Number.isFinite(value) || value < accounting.startedAt) {
    throw new Error("Invalid segment clock");
  }
  return value - accounting.startedAt;
}

async function threadPageFingerprint(ids: readonly string[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(ids))
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeComment(
  item: z.infer<typeof providerCommentSchema>,
  videoId: string,
  topLevelId: string,
  isReply: boolean
): YoutubeComment {
  return {
    video_id: videoId,
    comment_id: item.id,
    parent_id: isReply ? topLevelId : null,
    top_level_comment_id: topLevelId,
    is_reply: isReply,
    ...(item.snippet.authorChannelId === undefined
      ? {}
      : { author_channel_id: item.snippet.authorChannelId.value }),
    ...(item.snippet.authorDisplayName === undefined
      ? {}
      : { author_display_name: item.snippet.authorDisplayName }),
    text: item.snippet.textDisplay,
    like_count: item.snippet.likeCount,
    published_at: item.snippet.publishedAt,
    updated_at: item.snippet.updatedAt
  };
}

function segmentFailure(videoId: string, code: string): YoutubeCommentSegmentResult {
  return {
    video_id: videoId,
    comments: [],
    top_level_comments_retrieved: 0,
    replies_retrieved: 0,
    comment_thread_pages: 0,
    reply_pages: 0,
    reply_count_mismatches: [],
    exhausted: false,
    access_status: "error",
    limitations: ["YouTube comment segment could not be completed."],
    error: {
      code,
      message: "YouTube comment segment failed",
      retryable: false
    }
  };
}

function providerFailure(videoId: string, error: UpstreamHttpError): YoutubeCommentSegmentResult {
  const mapped: {
    accessStatus: YoutubeCommentSegmentAccessStatus;
    code: string;
    message: string;
    retryable: boolean;
  } = error.status === 429 || error.reason === "quotaExceeded"
    ? {
        accessStatus: "rate_limited",
        code: "youtube_rate_limited",
        message: "YouTube rate limit reached",
        retryable: true
      }
    : error.status === 403 && error.reason === "commentsDisabled"
      ? {
          accessStatus: "comments_disabled",
          code: "youtube_comments_disabled",
          message: "YouTube comments are disabled",
          retryable: false
        }
      : error.status === 404 && error.reason === "videoNotFound"
        ? {
            accessStatus: "not_found",
            code: "youtube_video_not_found",
            message: "YouTube video was not found",
            retryable: false
          }
        : error.status === 401 || error.status === 403
          ? {
              accessStatus: "inaccessible",
              code: "youtube_access_denied",
              message: "YouTube access denied",
              retryable: false
            }
          : {
              accessStatus: "error",
              code: error.status >= 500
                ? "youtube_upstream_unavailable"
                : "youtube_request_failed",
              message: error.status >= 500
                ? "YouTube upstream service unavailable"
                : "YouTube request failed",
              retryable: error.status >= 500
            };
  return {
    video_id: videoId,
    comments: [],
    top_level_comments_retrieved: 0,
    replies_retrieved: 0,
    comment_thread_pages: 0,
    reply_pages: 0,
    reply_count_mismatches: [],
    exhausted: false,
    access_status: mapped.accessStatus,
    limitations: [mapped.message],
    error: {
      code: mapped.code,
      message: mapped.message,
      http_status: error.status,
      retryable: mapped.retryable
    }
  };
}

export async function getYoutubeCommentsByIds(
  videoIdInput: string,
  commentIds: readonly string[],
  config: YoutubeConfig
): Promise<{
  access_status: "api_visible_complete" | "partial" | "inaccessible" |
    "rate_limited" | "not_found" | "error";
  comments: YoutubeComment[];
  limitations: string[];
}> {
  const videoId = parseYoutubeVideoId(videoIdInput);
  if (
    videoId === undefined ||
    config.apiKey.trim().length === 0 ||
    commentIds.length === 0 ||
    commentIds.some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id)) ||
    new Set(commentIds).size !== commentIds.length
  ) {
    return {
      access_status: "error",
      comments: [],
      limitations: ["Comment-ID refetch input was invalid."]
    };
  }

  const comments: YoutubeComment[] = [];
  try {
    for (let offset = 0; offset < commentIds.length; offset += 100) {
      const batch = commentIds.slice(offset, offset + 100);
      const requested = new Set(batch);
      const url = new URL(`${YOUTUBE_API_URL}/comments`);
      url.searchParams.set("part", "snippet");
      url.searchParams.set("id", batch.join(","));
      url.searchParams.set("maxResults", String(batch.length));
      url.searchParams.set("textFormat", "plainText");
      url.searchParams.set("key", config.apiKey);
      const payload = await fetchJson(url.toString(), { maxRetries: 0 });
      const parsed = replyPageSchema.safeParse(payload);
      if (!parsed.success || parsed.data.nextPageToken !== undefined) {
        return invalidCommentIdRefetch(comments);
      }
      const returned = new Set<string>();
      for (const item of parsed.data.items) {
        const parentId = item.snippet.parentId;
        if (
          !requested.has(item.id) ||
          returned.has(item.id) ||
          item.snippet.videoId !== videoId ||
          parentId === item.id
        ) {
          return invalidCommentIdRefetch(comments);
        }
        returned.add(item.id);
        comments.push(normalizeComment(item, videoId, parentId ?? item.id, parentId !== undefined));
      }
      if (returned.size !== batch.length) {
        return {
          access_status: "partial",
          comments,
          limitations: ["YouTube no longer exposed every requested sampled comment identifier."]
        };
      }
    }
  } catch (error) {
    if (error instanceof UpstreamHttpError) {
      const failure = providerFailure(videoId, error);
      return {
        access_status: failure.access_status === "comments_disabled"
          ? "inaccessible"
          : failure.access_status,
        comments,
        limitations: failure.limitations
      };
    }
    return invalidCommentIdRefetch(comments);
  }
  return {
    access_status: "api_visible_complete",
    comments,
    limitations: []
  };
}

function invalidCommentIdRefetch(comments: YoutubeComment[]): {
  access_status: "error";
  comments: YoutubeComment[];
  limitations: string[];
} {
  return {
    access_status: "error",
    comments,
    limitations: ["YouTube returned an invalid comment-ID refetch response."]
  };
}
