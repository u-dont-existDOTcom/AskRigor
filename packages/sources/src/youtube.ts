import {
  errorEnvelope,
  okEnvelope,
  type AccessStatus,
  type ProvenanceEnvelope
} from "@askrigor/contracts";
import { z } from "zod";

import { fetchJson, UpstreamHttpError } from "./http.js";

const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const DEFAULT_COMMENT_PAGE_SIZE = 100;
const MAX_COMMENT_PAGE_SIZE = 100;
const REPLY_PAGE_SIZE = 100;
const COMMENT_REQUEST_TIMEOUT_MS = 20_000;
const textEncoder = new TextEncoder();
export const MIN_YOUTUBE_COMMENT_OUTPUT_BYTES = 512;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_NOT_VISIBLE_LIMITATION =
  "YouTube returned no API-visible video for this identifier; it may be deleted, private, restricted, or otherwise unavailable.";

const RFC3339_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const ISO_DURATION_PATTERN = /^P(?=\d|T\d)(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/;

export const youtubeVideoIdSchema = z.string().regex(VIDEO_ID_PATTERN);
export const youtubeTimestampSchema = z.string().regex(RFC3339_PATTERN).refine(isValidRfc3339);
export const youtubeDurationSchema = z.string().regex(ISO_DURATION_PATTERN);
export const youtubeCountSchema = z.string().regex(/^\d+$/);
export const youtubeLiveStateSchema = z.enum(["none", "live", "upcoming"]);
export const youtubePrivacyStatusSchema = z.enum(["public", "private", "unlisted"]);
const channelIdSchema = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/);
const apiKeySchema = z.string().trim().min(1).max(500);
const providerIdentifierSchema = z.string().min(1).max(512);
const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(5_000),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(4_096).optional()
}).strict();
const snippetSchema = z.object({
  publishedAt: youtubeTimestampSchema.optional(),
  channelId: channelIdSchema.optional(),
  title: z.string().min(1).max(10_000).optional(),
  description: z.string().max(100_000).optional(),
  tags: z.array(z.string().min(1).max(500)).optional(),
  liveBroadcastContent: youtubeLiveStateSchema.optional()
}).passthrough();
const searchItemSchema = z.object({
  kind: z.literal("youtube#searchResult"),
  id: z.object({
    kind: z.literal("youtube#video"),
    videoId: youtubeVideoIdSchema
  }).strict(),
  snippet: snippetSchema
}).passthrough();
const pageInfoSchema = z.object({
  totalResults: z.number().int().nonnegative(),
  resultsPerPage: z.number().int().min(0).max(MAX_PAGE_SIZE)
}).passthrough();
const searchResponseSchema = z.object({
  kind: z.literal("youtube#searchListResponse"),
  pageInfo: pageInfoSchema,
  nextPageToken: z.string().min(1).max(4_096).optional(),
  items: z.array(searchItemSchema)
}).passthrough();
const videoItemSchema = z.object({
  kind: z.literal("youtube#video"),
  id: youtubeVideoIdSchema,
  snippet: snippetSchema,
  contentDetails: z.object({ duration: youtubeDurationSchema.optional() }).passthrough().optional(),
  statistics: z.object({
    viewCount: youtubeCountSchema.optional(),
    likeCount: youtubeCountSchema.optional(),
    commentCount: youtubeCountSchema.optional()
  }).passthrough().optional(),
  status: z.object({
    embeddable: z.boolean().optional(),
    privacyStatus: youtubePrivacyStatusSchema.optional()
  }).passthrough().optional()
}).passthrough();
const videosResponseSchema = z.object({
  kind: z.literal("youtube#videoListResponse"),
  pageInfo: pageInfoSchema,
  nextPageToken: z.string().min(1).max(4_096).optional(),
  prevPageToken: z.string().min(1).max(4_096).optional(),
  items: z.array(videoItemSchema).max(1)
}).passthrough();
const commentInputSchema = z.object({
  video: z.string().min(1).max(2_048),
  includeReplies: z.boolean().optional(),
  pageSize: z.number().int().min(1).max(MAX_COMMENT_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(4_096).optional()
}).strict();
const targetedCommentInputSchema = commentInputSchema.extend({
  query: z.string().trim().min(1).max(5_000)
}).strict();
const commentRetrievalBudgetsSchema = z.object({
  maxProviderRequestAttempts: z.number().int().positive(),
  maxCommentThreadPages: z.number().int().positive(),
  maxReplyPages: z.number().int().positive(),
  maxThreads: z.number().int().positive(),
  maxComments: z.number().int().positive(),
  maxNormalizedOutputBytes: z.number().int().min(MIN_YOUTUBE_COMMENT_OUTPUT_BYTES),
  maxTextBytes: z.number().int().positive(),
  maxElapsedMs: z.number().int().positive()
}).strict();
const authorChannelIdSchema = z.object({ value: channelIdSchema }).passthrough();
const providerCommentSnippetSchema = z.object({
  parentId: providerIdentifierSchema.optional(),
  videoId: youtubeVideoIdSchema.optional(),
  textDisplay: z.string().max(1_000_000),
  textOriginal: z.string().max(1_000_000).optional(),
  authorDisplayName: z.string().max(10_000).optional(),
  authorChannelId: authorChannelIdSchema.optional(),
  likeCount: z.number().int().nonnegative(),
  publishedAt: youtubeTimestampSchema,
  updatedAt: youtubeTimestampSchema
}).passthrough();
const providerCommentSchema = z.object({
  kind: z.literal("youtube#comment"),
  id: providerIdentifierSchema,
  snippet: providerCommentSnippetSchema
}).passthrough();
const commentThreadSchema = z.object({
  kind: z.literal("youtube#commentThread"),
  id: providerIdentifierSchema,
  snippet: z.object({
    videoId: youtubeVideoIdSchema,
    topLevelComment: providerCommentSchema,
    totalReplyCount: z.number().int().nonnegative()
  }).passthrough(),
  replies: z.object({
    comments: z.array(providerCommentSchema).max(MAX_COMMENT_PAGE_SIZE)
  }).passthrough().optional()
}).passthrough();
const commentPageInfoSchema = z.object({
  totalResults: z.number().int().nonnegative(),
  resultsPerPage: z.number().int().min(0).max(MAX_COMMENT_PAGE_SIZE)
}).passthrough();
const commentThreadsResponseSchema = z.object({
  kind: z.literal("youtube#commentThreadListResponse"),
  pageInfo: commentPageInfoSchema,
  nextPageToken: z.string().min(1).max(4_096).optional(),
  items: z.array(commentThreadSchema).max(MAX_COMMENT_PAGE_SIZE)
}).passthrough();
const commentsResponseSchema = z.object({
  kind: z.literal("youtube#commentListResponse"),
  pageInfo: commentPageInfoSchema,
  nextPageToken: z.string().min(1).max(4_096).optional(),
  items: z.array(providerCommentSchema).max(MAX_COMMENT_PAGE_SIZE)
}).passthrough();

export interface YoutubeConfig { apiKey: string; }
export interface SearchYoutubeInput { query: string; pageSize?: number; cursor?: string; }
export interface YoutubeSearchRecord {
  video_id: string;
  channel_id?: string;
  title?: string;
  description?: string;
  published_at?: string;
}
export interface YoutubeVideo {
  video_id: string;
  channel_id?: string;
  title?: string;
  description?: string;
  published_at?: string;
  duration?: string;
  statistics?: { view_count?: string; like_count?: string; comment_count?: string; };
  tags?: string[];
  live_broadcast_content?: string;
  embeddable?: boolean;
  privacy_status?: string;
}
export interface GetYoutubeCommentsInput {
  video: string;
  includeReplies?: boolean;
  pageSize?: number;
  cursor?: string;
}
export interface SearchYoutubeCommentsInput extends GetYoutubeCommentsInput {
  query: string;
}
export interface YoutubeCommentRetrievalBudgets {
  maxProviderRequestAttempts: number;
  maxCommentThreadPages: number;
  maxReplyPages: number;
  maxThreads: number;
  maxComments: number;
  maxNormalizedOutputBytes: number;
  maxTextBytes: number;
  maxElapsedMs: number;
}
export interface YoutubeCommentRetrievalRuntime {
  budgets?: Partial<YoutubeCommentRetrievalBudgets>;
  now?: () => number;
}
export const DEFAULT_YOUTUBE_COMMENT_RETRIEVAL_BUDGETS: Readonly<YoutubeCommentRetrievalBudgets> = {
  maxProviderRequestAttempts: 1_000,
  maxCommentThreadPages: 500,
  maxReplyPages: 750,
  maxThreads: 50_000,
  maxComments: 100_000,
  maxNormalizedOutputBytes: 64 * 1_024 * 1_024,
  maxTextBytes: 48 * 1_024 * 1_024,
  maxElapsedMs: 120_000
};
export interface YoutubeComment {
  video_id: string;
  comment_id: string;
  parent_id: string | null;
  top_level_comment_id: string;
  is_reply: boolean;
  author_channel_id?: string;
  author_display_name?: string;
  text: string;
  like_count: number;
  published_at: string;
  updated_at: string;
}
export interface YoutubeReplyCountMismatch {
  parent_comment_id: string;
  expected: number;
  retrieved: number;
}
export interface YoutubeCommentManifest {
  video_id: string;
  top_level_comments_retrieved: number;
  expected_replies: number;
  replies_retrieved: number;
  total_comments_and_replies: number;
  reply_count_mismatches: YoutubeReplyCountMismatch[];
  pages: { comment_threads: number; replies: number };
  extraction_coverage: "api_visible_complete" | "partial";
}
export interface YoutubeCommentData {
  comments: YoutubeComment[];
  manifest: YoutubeCommentManifest;
}

export const youtubeSearchRecordSchema = z.object({
  video_id: youtubeVideoIdSchema,
  channel_id: channelIdSchema.optional(),
  title: z.string().min(1).max(10_000).optional(),
  description: z.string().max(100_000).optional(),
  published_at: youtubeTimestampSchema.optional()
}).strict();
export const youtubeSearchRecordListSchema = z.array(youtubeSearchRecordSchema).max(MAX_PAGE_SIZE);

export const youtubeVideoDataSchema = z.object({
  video_id: youtubeVideoIdSchema,
  channel_id: channelIdSchema.optional(),
  title: z.string().min(1).max(10_000).optional(),
  description: z.string().max(100_000).optional(),
  published_at: youtubeTimestampSchema.optional(),
  duration: youtubeDurationSchema.optional(),
  statistics: z.object({
    view_count: youtubeCountSchema.optional(),
    like_count: youtubeCountSchema.optional(),
    comment_count: youtubeCountSchema.optional()
  }).strict().optional(),
  tags: z.array(z.string().min(1).max(500)).optional(),
  live_broadcast_content: youtubeLiveStateSchema.optional(),
  embeddable: z.boolean().optional(),
  privacy_status: youtubePrivacyStatusSchema.optional()
}).strict();
export const youtubeVideoFailureDataSchema = z.object({}).strict();
export const youtubeCommentSchema = z.object({
  video_id: youtubeVideoIdSchema,
  comment_id: providerIdentifierSchema,
  parent_id: providerIdentifierSchema.nullable(),
  top_level_comment_id: providerIdentifierSchema,
  is_reply: z.boolean(),
  author_channel_id: channelIdSchema.optional(),
  author_display_name: z.string().max(10_000).optional(),
  text: z.string().max(1_000_000),
  like_count: z.number().int().nonnegative(),
  published_at: youtubeTimestampSchema,
  updated_at: youtubeTimestampSchema
}).strict();
export const youtubeReplyCountMismatchSchema = z.object({
  parent_comment_id: providerIdentifierSchema,
  expected: z.number().int().nonnegative(),
  retrieved: z.number().int().nonnegative()
}).strict();
export const youtubeCommentManifestSchema = z.object({
  video_id: youtubeVideoIdSchema,
  top_level_comments_retrieved: z.number().int().nonnegative(),
  expected_replies: z.number().int().nonnegative(),
  replies_retrieved: z.number().int().nonnegative(),
  total_comments_and_replies: z.number().int().nonnegative(),
  reply_count_mismatches: z.array(youtubeReplyCountMismatchSchema),
  pages: z.object({
    comment_threads: z.number().int().nonnegative(),
    replies: z.number().int().nonnegative()
  }).strict(),
  extraction_coverage: z.enum(["api_visible_complete", "partial"])
}).strict();
export const youtubeCommentDataSchema = z.object({
  comments: z.array(youtubeCommentSchema),
  manifest: youtubeCommentManifestSchema
}).strict();
export const youtubeCommentFailureDataSchema = z.object({}).strict();

export const parseYoutubeVideoId = (input: string): string | undefined => {
  if (typeof input !== "string") return undefined;
  if (VIDEO_ID_PATTERN.test(input)) return input;
  const youtuBe = /^https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})$/.exec(input);
  if (youtuBe !== null) return youtuBe[1];
  const watch = /^https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})$/.exec(input);
  if (watch !== null) return watch[1];
  const shorts = /^https:\/\/www\.youtube\.com\/shorts\/([A-Za-z0-9_-]{11})$/.exec(input);
  return shorts?.[1];
};

export const searchYoutube = async (
  input: SearchYoutubeInput,
  config: YoutubeConfig
): Promise<ProvenanceEnvelope<YoutubeSearchRecord[]>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return searchError("youtube_api_key_missing", input);
  const parsedInput = searchInputSchema.safeParse(input);
  if (!parsedInput.success) return searchError("youtube_search_input_invalid", input);
  const { query, cursor } = parsedInput.data;
  const pageSize = parsedInput.data.pageSize ?? DEFAULT_PAGE_SIZE;
  const pagination = {
    ...(cursor === undefined ? {} : { cursor }),
    page_size: pageSize
  };

  try {
    const url = new URL(`${YOUTUBE_API_URL}/search`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("q", query);
    url.searchParams.set("maxResults", String(pageSize));
    if (cursor !== undefined) url.searchParams.set("pageToken", cursor);
    url.searchParams.set("key", parsedConfig.data);
    const parsedResponse = searchResponseSchema.safeParse(await fetchJson(url.toString()));
    if (!parsedResponse.success || !isCoherentSearchResponse(parsedResponse.data, pageSize, cursor)) {
      throw new YoutubeResponseError();
    }
    const records = parsedResponse.data.items.map(normalizeSearchRecord);
    return okEnvelope({
      provider: "youtube",
      recordType: "youtube_search_result",
      query: { query },
      pagination: {
        ...pagination,
        ...(parsedResponse.data.nextPageToken === undefined ? {} : { next_cursor: parsedResponse.data.nextPageToken }),
        exhausted: parsedResponse.data.nextPageToken === undefined
      },
      returned: records.length,
      accessStatus: "complete",
      rawMetadata: { total_results: parsedResponse.data.pageInfo.totalResults },
      data: records
    });
  } catch (error) {
    return searchError(youtubeFailure(error, "search"), input, pagination, error);
  }
};

export const getYoutubeVideo = async (
  videoIdOrUrl: string,
  config: YoutubeConfig
): Promise<ProvenanceEnvelope<YoutubeVideo>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return videoError("youtube_api_key_missing");
  const videoId = parseYoutubeVideoId(videoIdOrUrl);
  if (videoId === undefined) return videoError("youtube_video_id_invalid");

  try {
    const url = new URL(`${YOUTUBE_API_URL}/videos`);
    url.searchParams.set("part", "snippet,contentDetails,statistics,status");
    url.searchParams.set("id", videoId);
    url.searchParams.set("key", parsedConfig.data);
    const parsedResponse = videosResponseSchema.safeParse(await fetchJson(url.toString()));
    if (!parsedResponse.success || !isCoherentVideoResponse(parsedResponse.data, videoId)) {
      throw new YoutubeResponseError();
    }
    if (parsedResponse.data.items.length === 0) return videoError("youtube_video_not_visible", videoId);
    const item = parsedResponse.data.items[0]!;
    const video = normalizeVideo(item);
    return okEnvelope({
      provider: "youtube",
      recordType: "youtube_video",
      primaryIdentifier: videoId,
      sourceIdentity: {
        canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
        ...(video.title === undefined ? {} : { title: video.title })
      },
      pagination: { exhausted: true },
      returned: 1,
      accessStatus: "api_visible_complete",
      data: video
    });
  } catch (error) {
    return videoError(youtubeFailure(error, "video"), videoId, error);
  }
};

export const getYoutubeComments = async (
  input: GetYoutubeCommentsInput,
  config: YoutubeConfig,
  runtime: YoutubeCommentRetrievalRuntime = {}
): Promise<ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return commentPreflightError("youtube_api_key_missing");
  const parsedInput = commentInputSchema.safeParse(input);
  if (!parsedInput.success) return commentPreflightError("youtube_comments_input_invalid");
  const videoId = parseYoutubeVideoId(parsedInput.data.video);
  if (videoId === undefined) return commentPreflightError("youtube_video_id_invalid");
  try {
    return await retrieveYoutubeComments({
      videoId,
      includeReplies: parsedInput.data.includeReplies ?? true,
      pageSize: parsedInput.data.pageSize ?? DEFAULT_COMMENT_PAGE_SIZE,
      cursor: parsedInput.data.cursor,
      apiKey: parsedConfig.data
    }, runtime);
  } catch {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
};

export const searchYoutubeComments = async (
  input: SearchYoutubeCommentsInput,
  config: YoutubeConfig,
  runtime: YoutubeCommentRetrievalRuntime = {}
): Promise<ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return commentPreflightError("youtube_api_key_missing");
  const parsedInput = targetedCommentInputSchema.safeParse(input);
  if (!parsedInput.success) return commentPreflightError("youtube_comments_input_invalid");
  const videoId = parseYoutubeVideoId(parsedInput.data.video);
  if (videoId === undefined) return commentPreflightError("youtube_video_id_invalid");
  try {
    return await retrieveYoutubeComments({
      videoId,
      includeReplies: parsedInput.data.includeReplies ?? true,
      pageSize: parsedInput.data.pageSize ?? DEFAULT_COMMENT_PAGE_SIZE,
      cursor: parsedInput.data.cursor,
      query: parsedInput.data.query,
      apiKey: parsedConfig.data
    }, runtime);
  } catch {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
};

interface CommentRetrievalOptions {
  videoId: string;
  includeReplies: boolean;
  pageSize: number;
  cursor?: string;
  query?: string;
  apiKey: string;
}

interface CommentThreadState {
  topLevelId: string;
  expectedReplies: number;
  fetchedReplyIds: Set<string>;
  observedReplyTotal?: number;
  repliesExhausted: boolean;
  returnedReplyCount: number;
  comments: YoutubeComment[];
  textBytes: number;
  mismatch?: YoutubeReplyCountMismatch;
}

interface CommentRetrievalState {
  options: CommentRetrievalOptions;
  comments: YoutubeComment[];
  commentsById: Map<string, YoutubeComment>;
  embeddedReplyIds: Set<string>;
  threadIds: Set<string>;
  topLevelIds: Set<string>;
  threads: CommentThreadState[];
  pages: { commentThreads: number; replies: number };
  topLevelTotal?: number;
  topLevelExhausted: boolean;
  accounting: CommentBudgetAccounting;
  expectedReplies: number;
  repliesRetrieved: number;
  activeMismatches: YoutubeReplyCountMismatch[];
  mismatchIndexes: Map<string, number>;
  retrievedAt: string;
}

type CommentBudgetDimension =
  | "provider_request_attempts"
  | "comment_thread_pages"
  | "reply_pages"
  | "threads"
  | "comments"
  | "normalized_output_bytes"
  | "text_bytes"
  | "elapsed_ms";

type YoutubeCommentBudgetFailureCode = `youtube_comment_budget_${CommentBudgetDimension}`;

interface CommentBudgetAccounting {
  budgets: YoutubeCommentRetrievalBudgets;
  now: () => number;
  startedAt: number;
  lastClockValue: number;
  providerRequestAttempts: number;
  normalizedOutputBytes: number;
  normalizedTextBytes: number;
  elapsedMs: number;
}

const createCommentBudgetAccounting = (
  budgets: YoutubeCommentRetrievalBudgets,
  runtime: YoutubeCommentRetrievalRuntime
): CommentBudgetAccounting => {
  const now = runtime.now ?? Date.now;
  if (typeof now !== "function") throw new YoutubeCommentClockError();
  const startedAt = readInitialCommentClock(now);
  return {
    budgets,
    now,
    startedAt,
    lastClockValue: startedAt,
    providerRequestAttempts: 0,
    normalizedOutputBytes: 0,
    normalizedTextBytes: 0,
    elapsedMs: 0
  };
};

const parseCommentRetrievalBudgets = (
  runtime: YoutubeCommentRetrievalRuntime
): YoutubeCommentRetrievalBudgets | undefined => {
  const parsed = commentRetrievalBudgetsSchema.safeParse({
    ...DEFAULT_YOUTUBE_COMMENT_RETRIEVAL_BUDGETS,
    ...runtime.budgets
  });
  return parsed.success ? parsed.data : undefined;
};

const readInitialCommentClock = (now: () => number): number => {
  let value: number;
  try {
    value = now();
  } catch {
    throw new YoutubeCommentClockError();
  }
  if (!Number.isFinite(value) || value < 0) throw new YoutubeCommentClockError();
  return value;
};

const measureCommentBudgetElapsed = (accounting: CommentBudgetAccounting): number => {
  let value: number;
  try {
    value = accounting.now();
  } catch {
    throw new YoutubeCommentClockError();
  }
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value < accounting.lastClockValue
  ) {
    throw new YoutubeCommentClockError();
  }
  accounting.lastClockValue = value;
  accounting.elapsedMs = value - accounting.startedAt;
  return accounting.elapsedMs;
};

const assertCommentBudgetElapsed = (accounting: CommentBudgetAccounting): void => {
  if (measureCommentBudgetElapsed(accounting) >= accounting.budgets.maxElapsedMs) {
    throw new YoutubeCommentBudgetError("elapsed_ms");
  }
};

const assertCommentCountCapacity = (
  dimension: CommentBudgetDimension,
  current: number,
  limit: number
): void => {
  if (current >= limit) throw new YoutubeCommentBudgetError(dimension);
};

const beforeCommentProviderRequest = (
  state: CommentRetrievalState,
  operation: CommentOperation
): void => {
  const { accounting } = state;
  assertCommentBudgetElapsed(accounting);
  if (operation === "commentThreads.list") {
    assertCommentCountCapacity(
      "comment_thread_pages",
      state.pages.commentThreads,
      accounting.budgets.maxCommentThreadPages
    );
  } else {
    assertCommentCountCapacity(
      "reply_pages",
      state.pages.replies,
      accounting.budgets.maxReplyPages
    );
  }
};

const beforeCommentProviderAttempt = (state: CommentRetrievalState): void => {
  const { accounting } = state;
  assertCommentBudgetElapsed(accounting);
  assertCommentCountCapacity(
    "provider_request_attempts",
    accounting.providerRequestAttempts,
    accounting.budgets.maxProviderRequestAttempts
  );
  accounting.providerRequestAttempts += 1;
};

const fetchCommentPayload = async (
  state: CommentRetrievalState,
  url: string
): Promise<unknown> => {
  const remainingMs = Math.max(
    1,
    state.accounting.budgets.maxElapsedMs - state.accounting.elapsedMs
  );
  try {
    return await fetchJson(url, {
      timeoutMs: Math.min(COMMENT_REQUEST_TIMEOUT_MS, remainingMs),
      beforeAttempt: () => beforeCommentProviderAttempt(state)
    });
  } catch (error) {
    assertCommentBudgetElapsed(state.accounting);
    throw error;
  }
};

interface StagedCommentThread {
  threadId: string;
  topLevelId: string;
  thread: CommentThreadState;
  comments: YoutubeComment[];
  embeddedReplyIds: string[];
}

interface StagedReply {
  id: string;
  comment: YoutubeComment;
  isNew: boolean;
}

interface CommentFailureOutcome {
  error: unknown;
  operation: CommentOperation;
  limitations: string[];
}

interface CommentSelectionSummary {
  commentCount: number;
  comments: YoutubeComment[];
  threads: number;
  expectedReplies: number;
  repliesRetrieved: number;
  mismatchCount: number;
  mismatches: YoutubeReplyCountMismatch[];
  textBytes: number;
  commentArrayPayloadBytes: number;
  mismatchArrayPayloadBytes: number;
}

type CommentPrefixSummary = Omit<CommentSelectionSummary, "comments" | "mismatches">;

interface SizedCommentPrefix {
  summary: CommentPrefixSummary;
  bytes: number;
  elapsedMs: number;
}

interface CommentFinalizationPreparation {
  comments: YoutubeComment[];
  mismatches: YoutubeReplyCountMismatch[];
  prefixes: CommentPrefixSummary[];
  safeClockPrefix?: SizedCommentPrefix;
  safeElapsedPrefix?: SizedCommentPrefix;
}

const retrieveYoutubeComments = async (
  options: CommentRetrievalOptions,
  runtime: YoutubeCommentRetrievalRuntime
): Promise<ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>> => {
  const retrievedAt = new Date().toISOString();
  let budgets: YoutubeCommentRetrievalBudgets | undefined;
  try {
    budgets = parseCommentRetrievalBudgets(runtime);
  } catch {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
  if (budgets === undefined) {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }

  let accounting: CommentBudgetAccounting;
  try {
    accounting = createCommentBudgetAccounting(budgets, runtime);
  } catch (error) {
    return boundedInitialCommentRetrievalError(options, error, budgets, retrievedAt);
  }

  const state: CommentRetrievalState = {
    options,
    comments: [],
    commentsById: new Map(),
    embeddedReplyIds: new Set(),
    threadIds: new Set(),
    topLevelIds: new Set(),
    threads: [],
    pages: { commentThreads: 0, replies: 0 },
    topLevelExhausted: false,
    accounting,
    expectedReplies: 0,
    repliesRetrieved: 0,
    activeMismatches: [],
    mismatchIndexes: new Map(),
    retrievedAt
  };

  if (!minimumCommentEnvelopesFit(state)) {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }

  let operation: CommentOperation = "commentThreads.list";
  try {
    await collectCommentThreads(state);
    operation = "comments.list";
    if (options.includeReplies) {
      for (const thread of state.threads) {
        assertCommentBudgetElapsed(state.accounting);
        if (thread.expectedReplies > 0) await collectReplies(state, thread);
      }
    }
    return finalizeCommentResult(state);
  } catch (error) {
    return finalizeCommentResult(state, {
      error,
      operation,
      limitations: [operation === "commentThreads.list"
        ? commentThreadFailureLimitation(error)
        : replyFailureLimitation(error)]
    });
  }
};

const collectCommentThreads = async (state: CommentRetrievalState): Promise<void> => {
  let pageToken = state.options.cursor;
  const seenTokens = new Set<string>(pageToken === undefined ? [] : [pageToken]);

  while (true) {
    beforeCommentProviderRequest(state, "commentThreads.list");
    const url = new URL(`${YOUTUBE_API_URL}/commentThreads`);
    url.searchParams.set("part", "snippet,replies");
    url.searchParams.set("videoId", state.options.videoId);
    url.searchParams.set("maxResults", String(state.options.pageSize));
    url.searchParams.set("textFormat", "plainText");
    url.searchParams.set("order", "time");
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    if (state.options.query !== undefined) url.searchParams.set("searchTerms", state.options.query);
    url.searchParams.set("key", state.options.apiKey);

    const payload = await fetchCommentPayload(state, url.toString());
    assertCommentBudgetElapsed(state.accounting);
    const parsed = commentThreadsResponseSchema.safeParse(payload);
    if (!parsed.success) throw responseError("YouTube returned an invalid commentThreads response.");
    const response = parsed.data;
    validateCommentThreadPage(response, state);
    const staged = stageCommentThreadPage(state, response, seenTokens);
    assertCommentBudgetElapsed(state.accounting);
    commitCommentThreadPage(state, staged, response);

    const nextToken = response.nextPageToken;
    if (nextToken === undefined) return;
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }
};

const validateCommentThreadPage = (
  response: z.infer<typeof commentThreadsResponseSchema>,
  state: CommentRetrievalState
): void => {
  if (
    response.pageInfo.resultsPerPage !== response.items.length ||
    response.items.length > state.options.pageSize ||
    (state.topLevelTotal !== undefined && response.pageInfo.totalResults !== state.topLevelTotal) ||
    (response.pageInfo.totalResults === 0 && (response.items.length !== 0 || response.nextPageToken !== undefined)) ||
    response.items.length > response.pageInfo.totalResults ||
    (state.options.cursor === undefined && state.threads.length + response.items.length > response.pageInfo.totalResults)
  ) {
    throw responseError("YouTube commentThreads pageInfo and result counts were inconsistent.");
  }
};

const stageCommentThreadPage = (
  state: CommentRetrievalState,
  response: z.infer<typeof commentThreadsResponseSchema>,
  seenTokens: Set<string>
): StagedCommentThread[] => {
  const prospectiveThreads = state.threads.length + response.items.length;
  const nextToken = response.nextPageToken;
  if (nextToken === undefined) {
    if (
      state.options.cursor === undefined &&
      prospectiveThreads !== response.pageInfo.totalResults
    ) {
      throw responseError("YouTube commentThreads results did not reconcile with pageInfo.totalResults.");
    }
  } else {
    if (seenTokens.has(nextToken)) {
      throw responseError("YouTube commentThreads pagination returned a repeated page token.");
    }
    if (prospectiveThreads >= response.pageInfo.totalResults) {
      throw responseError("YouTube commentThreads pagination was inconsistent with pageInfo.totalResults.");
    }
  }

  const pageThreadIds = new Set<string>();
  const pageTopLevelIds = new Set<string>();
  const pageCommentIds = new Set<string>();
  const staged: StagedCommentThread[] = [];
  let stagedCommentCount = 0;
  let stagedTextBytes = 0;

  for (const item of response.items) {
    assertCommentBudgetElapsed(state.accounting);
    const topLevel = item.snippet.topLevelComment;
    if (
      item.snippet.videoId !== state.options.videoId ||
      topLevel.snippet.videoId !== state.options.videoId ||
      topLevel.snippet.parentId !== undefined
    ) {
      throw responseError("YouTube returned a comment thread that did not correlate to the requested video.");
    }
    if (
      state.threadIds.has(item.id) || pageThreadIds.has(item.id) ||
      state.topLevelIds.has(topLevel.id) || pageTopLevelIds.has(topLevel.id) ||
      state.commentsById.has(topLevel.id) || pageCommentIds.has(topLevel.id)
    ) {
      throw responseError("YouTube returned a duplicate thread or top-level comment identifier.");
    }

    const embedded = item.replies?.comments ?? [];
    if (embedded.length > item.snippet.totalReplyCount) {
      throw responseError("YouTube embedded more replies than the thread totalReplyCount declared.");
    }
    const topComment = normalizeComment(topLevel, state.options.videoId, topLevel.id, false);
    const comments = [topComment];
    const embeddedReplyIds: string[] = [];
    let threadTextBytes = normalizedCommentTextBytes(topComment);
    pageThreadIds.add(item.id);
    pageTopLevelIds.add(topLevel.id);
    pageCommentIds.add(topLevel.id);

    for (const reply of embedded) {
      assertCommentBudgetElapsed(state.accounting);
      validateReplyCorrelation(reply, state.options.videoId, topLevel.id);
      if (
        state.embeddedReplyIds.has(reply.id) ||
        state.commentsById.has(reply.id) ||
        pageCommentIds.has(reply.id)
      ) {
        throw responseError("YouTube returned a duplicate embedded reply identifier.");
      }
      pageCommentIds.add(reply.id);
      embeddedReplyIds.push(reply.id);
      if (state.options.includeReplies) {
        const normalized = normalizeComment(reply, state.options.videoId, topLevel.id, true);
        comments.push(normalized);
        threadTextBytes += normalizedCommentTextBytes(normalized);
      }
    }

    const returnedReplyCount = state.options.includeReplies ? comments.length - 1 : 0;
    staged.push({
      threadId: item.id,
      topLevelId: topLevel.id,
      comments,
      embeddedReplyIds,
      thread: {
        topLevelId: topLevel.id,
        expectedReplies: item.snippet.totalReplyCount,
        fetchedReplyIds: new Set(),
        repliesExhausted: item.snippet.totalReplyCount === 0,
        returnedReplyCount,
        comments,
        textBytes: threadTextBytes
      }
    });
    stagedCommentCount += comments.length;
    stagedTextBytes += threadTextBytes;
  }

  assertProjectedCommentLimit(
    state,
    "threads",
    prospectiveThreads,
    state.accounting.budgets.maxThreads
  );
  assertProjectedCommentLimit(
    state,
    "comments",
    state.comments.length + stagedCommentCount,
    state.accounting.budgets.maxComments
  );
  assertProjectedCommentLimit(
    state,
    "text_bytes",
    state.accounting.normalizedTextBytes + stagedTextBytes,
    state.accounting.budgets.maxTextBytes
  );
  return staged;
};

const commitCommentThreadPage = (
  state: CommentRetrievalState,
  staged: StagedCommentThread[],
  response: z.infer<typeof commentThreadsResponseSchema>
): void => {
  state.topLevelTotal ??= response.pageInfo.totalResults;
  for (const item of staged) {
    state.threadIds.add(item.threadId);
    state.topLevelIds.add(item.topLevelId);
    state.threads.push(item.thread);
    state.expectedReplies += item.thread.expectedReplies;
    state.repliesRetrieved += item.thread.returnedReplyCount;
    state.accounting.normalizedTextBytes += item.thread.textBytes;
    for (const comment of item.comments) {
      state.commentsById.set(comment.comment_id, comment);
      state.comments.push(comment);
    }
    for (const id of item.embeddedReplyIds) state.embeddedReplyIds.add(id);
    if (item.thread.expectedReplies > 0) addThreadMismatch(state, item.thread);
  }
  state.pages.commentThreads += 1;
  state.topLevelExhausted = response.nextPageToken === undefined;
};

const collectReplies = async (
  state: CommentRetrievalState,
  thread: CommentThreadState
): Promise<void> => {
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();

  while (true) {
    beforeCommentProviderRequest(state, "comments.list");
    const url = new URL(`${YOUTUBE_API_URL}/comments`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("parentId", thread.topLevelId);
    url.searchParams.set("maxResults", String(REPLY_PAGE_SIZE));
    url.searchParams.set("textFormat", "plainText");
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", state.options.apiKey);

    const payload = await fetchCommentPayload(state, url.toString());
    assertCommentBudgetElapsed(state.accounting);
    const parsed = commentsResponseSchema.safeParse(payload);
    if (!parsed.success) throw responseError("YouTube returned an invalid comments response.");
    const response = parsed.data;
    validateReplyPage(response, thread);
    const staged = stageReplyPage(state, thread, response, pageToken, seenTokens);
    assertCommentBudgetElapsed(state.accounting);
    commitReplyPage(state, thread, staged, response);

    const nextToken = response.nextPageToken;
    if (nextToken === undefined) return;
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }
};

const validateReplyPage = (
  response: z.infer<typeof commentsResponseSchema>,
  thread: CommentThreadState
): void => {
  if (
    response.pageInfo.resultsPerPage !== response.items.length ||
    response.items.length > REPLY_PAGE_SIZE ||
    (thread.observedReplyTotal !== undefined && response.pageInfo.totalResults !== thread.observedReplyTotal) ||
    (response.pageInfo.totalResults === 0 && (response.items.length !== 0 || response.nextPageToken !== undefined)) ||
    response.items.length > response.pageInfo.totalResults ||
    thread.fetchedReplyIds.size + response.items.length > response.pageInfo.totalResults
  ) {
    throw responseError("YouTube comments pageInfo and result counts were inconsistent.");
  }
};

const validateReplyCorrelation = (
  reply: z.infer<typeof providerCommentSchema>,
  videoId: string,
  parentId: string
): void => {
  if (
    reply.snippet.parentId !== parentId ||
    (reply.snippet.videoId !== undefined && reply.snippet.videoId !== videoId)
  ) {
    throw responseError("YouTube returned a reply that did not correlate to its requested parent comment.");
  }
};

const stageReplyPage = (
  state: CommentRetrievalState,
  thread: CommentThreadState,
  response: z.infer<typeof commentsResponseSchema>,
  pageToken: string | undefined,
  seenTokens: Set<string>
): StagedReply[] => {
  const prospectiveFetched = thread.fetchedReplyIds.size + response.items.length;
  const nextToken = response.nextPageToken;
  if (nextToken === undefined) {
    if (prospectiveFetched !== response.pageInfo.totalResults) {
      throw responseError("YouTube comments results did not reconcile with pageInfo.totalResults.");
    }
  } else {
    if (seenTokens.has(nextToken) || nextToken === pageToken) {
      throw responseError("YouTube replies pagination returned a repeated page token.");
    }
    if (prospectiveFetched >= response.pageInfo.totalResults) {
      throw responseError("YouTube replies pagination was inconsistent with pageInfo.totalResults.");
    }
  }

  const pageIds = new Set<string>();
  const staged: StagedReply[] = [];
  let newCommentCount = 0;
  let newTextBytes = 0;
  for (const reply of response.items) {
    assertCommentBudgetElapsed(state.accounting);
    validateReplyCorrelation(reply, state.options.videoId, thread.topLevelId);
    if (thread.fetchedReplyIds.has(reply.id) || pageIds.has(reply.id)) {
      throw responseError("YouTube returned a duplicate reply identifier across comments pages.");
    }
    pageIds.add(reply.id);
    const normalized = normalizeComment(reply, state.options.videoId, thread.topLevelId, true);
    const existing = state.commentsById.get(reply.id);
    if (
      existing !== undefined &&
      (!state.embeddedReplyIds.has(reply.id) || !commentsEqual(existing, normalized))
    ) {
      throw responseError("YouTube returned a duplicate comment identifier with inconsistent metadata.");
    }
    const isNew = existing === undefined;
    staged.push({ id: reply.id, comment: normalized, isNew });
    if (isNew) {
      newCommentCount += 1;
      newTextBytes += normalizedCommentTextBytes(normalized);
    }
  }
  assertProjectedCommentLimit(
    state,
    "comments",
    state.comments.length + newCommentCount,
    state.accounting.budgets.maxComments
  );
  assertProjectedCommentLimit(
    state,
    "text_bytes",
    state.accounting.normalizedTextBytes + newTextBytes,
    state.accounting.budgets.maxTextBytes
  );
  return staged;
};

const commitReplyPage = (
  state: CommentRetrievalState,
  thread: CommentThreadState,
  staged: StagedReply[],
  response: z.infer<typeof commentsResponseSchema>
): void => {
  thread.observedReplyTotal ??= response.pageInfo.totalResults;
  for (const reply of staged) {
    thread.fetchedReplyIds.add(reply.id);
    if (reply.isNew) {
      const textBytes = normalizedCommentTextBytes(reply.comment);
      state.commentsById.set(reply.id, reply.comment);
      state.comments.push(reply.comment);
      thread.comments.push(reply.comment);
      thread.returnedReplyCount += 1;
      thread.textBytes += textBytes;
      state.repliesRetrieved += 1;
      state.accounting.normalizedTextBytes += textBytes;
    }
  }
  thread.repliesExhausted = response.nextPageToken === undefined;
  updateThreadMismatch(state, thread);
  state.pages.replies += 1;
};

const assertProjectedCommentLimit = (
  state: CommentRetrievalState,
  dimension: CommentBudgetDimension,
  projected: number,
  limit: number
): void => {
  assertCommentBudgetElapsed(state.accounting);
  if (projected > limit) throw new YoutubeCommentBudgetError(dimension);
};

const normalizedCommentTextBytes = (comment: YoutubeComment): number =>
  textEncoder.encode(comment.text).byteLength;

const addThreadMismatch = (
  state: CommentRetrievalState,
  thread: CommentThreadState
): void => {
  const mismatch = {
    parent_comment_id: thread.topLevelId,
    expected: thread.expectedReplies,
    retrieved: 0
  };
  thread.mismatch = mismatch;
  state.mismatchIndexes.set(thread.topLevelId, state.activeMismatches.length);
  state.activeMismatches.push(mismatch);
};

const updateThreadMismatch = (
  state: CommentRetrievalState,
  thread: CommentThreadState
): void => {
  const independentlyRetrieved = thread.fetchedReplyIds.size;
  const reconciled = state.options.includeReplies &&
    thread.repliesExhausted &&
    thread.observedReplyTotal === thread.expectedReplies &&
    independentlyRetrieved === thread.expectedReplies &&
    thread.returnedReplyCount === thread.expectedReplies;
  if (reconciled) {
    removeThreadMismatch(state, thread);
    return;
  }
  if (thread.mismatch !== undefined) {
    thread.mismatch.retrieved = independentlyRetrieved === thread.expectedReplies
      ? thread.returnedReplyCount
      : independentlyRetrieved;
  }
};

const removeThreadMismatch = (
  state: CommentRetrievalState,
  thread: CommentThreadState
): void => {
  const index = state.mismatchIndexes.get(thread.topLevelId);
  if (index === undefined) return;
  const last = state.activeMismatches.pop();
  if (last !== undefined && index < state.activeMismatches.length) {
    state.activeMismatches[index] = last;
    state.mismatchIndexes.set(last.parent_comment_id, index);
  }
  state.mismatchIndexes.delete(thread.topLevelId);
  thread.mismatch = undefined;
};

const normalizeComment = (
  item: z.infer<typeof providerCommentSchema>,
  videoId: string,
  topLevelId: string,
  isReply: boolean
): YoutubeComment => ({
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
});

const commentsEqual = (left: YoutubeComment, right: YoutubeComment): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const finalizeCommentResult = (
  state: CommentRetrievalState,
  outcome?: CommentFailureOutcome
): ProvenanceEnvelope<YoutubeCommentData | Record<string, never>> => {
  const preparation = emptyCommentFinalizationPreparation();
  try {
    prepareCommentFinalization(state, preparation);
    const fullSummary = preparation.prefixes.at(-1) ?? emptyCommentPrefixSummary();
    const fullElapsedMs = state.accounting.elapsedMs;
    const fullBytes = measureCommentEnvelopeBytes(state, fullSummary, outcome, fullElapsedMs);
    assertCommentBudgetElapsed(state.accounting);
    if (fullBytes <= state.accounting.budgets.maxNormalizedOutputBytes) {
      return emitMeasuredCommentEnvelope(
        state,
        materializeFullCommentSelection(state, fullSummary),
        outcome,
        fullBytes,
        fullElapsedMs
      );
    }

    const outputError = new YoutubeCommentBudgetError("normalized_output_bytes");
    const boundedOutcome: CommentFailureOutcome = {
      error: outputError,
      operation: outcome?.operation ?? "comments.list",
      limitations: uniqueStrings([
        ...(outcome?.limitations ?? []),
        outputError.limitation
      ])
    };
    const emptySummary = emptyCommentPrefixSummary();
    const emptyElapsedMs = state.accounting.elapsedMs;
    let selected = sizedCommentPrefix(
      emptySummary,
      measureCommentEnvelopeBytes(state, emptySummary, boundedOutcome, emptyElapsedMs),
      emptyElapsedMs
    );
    for (const prefix of preparation.prefixes) {
      assertCommentBudgetElapsed(state.accounting);
      const elapsedMs = state.accounting.elapsedMs;
      const bytes = measureCommentEnvelopeBytes(state, prefix, boundedOutcome, elapsedMs);
      assertCommentBudgetElapsed(state.accounting);
      if (bytes > state.accounting.budgets.maxNormalizedOutputBytes) break;
      selected = sizedCommentPrefix(prefix, bytes, elapsedMs);
    }
    if (selected.bytes > state.accounting.budgets.maxNormalizedOutputBytes) {
      return commentPreflightError("youtube_comments_runtime_invalid");
    }
    return emitMeasuredCommentEnvelope(
      state,
      materializePreparedCommentSelection(preparation, selected.summary),
      boundedOutcome,
      selected.bytes,
      selected.elapsedMs
    );
  } catch (error) {
    if (isCommentClockOrElapsedError(error)) {
      return emitEmergencyCommentEnvelope(state, preparation, error, outcome?.operation);
    }
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
};

const emptyCommentPrefixSummary = (): CommentPrefixSummary => ({
  commentCount: 0,
  threads: 0,
  expectedReplies: 0,
  repliesRetrieved: 0,
  mismatchCount: 0,
  textBytes: 0,
  commentArrayPayloadBytes: 0,
  mismatchArrayPayloadBytes: 0
});

const emptyCommentFinalizationPreparation = (): CommentFinalizationPreparation => ({
  comments: [],
  mismatches: [],
  prefixes: []
});

const sizedCommentPrefix = (
  summary: CommentPrefixSummary,
  bytes: number,
  elapsedMs: number
): SizedCommentPrefix => ({ summary, bytes, elapsedMs });

const prepareCommentFinalization = (
  state: CommentRetrievalState,
  preparation: CommentFinalizationPreparation
): void => {
  let summary = emptyCommentPrefixSummary();
  recordEmergencySafePrefix(state, preparation, summary);
  for (const thread of state.threads) {
    assertCommentBudgetElapsed(state.accounting);
    const next = { ...summary };
    next.threads += 1;
    next.expectedReplies += thread.expectedReplies;
    next.repliesRetrieved += thread.returnedReplyCount;
    next.textBytes += thread.textBytes;
    for (const comment of thread.comments) {
      next.commentArrayPayloadBytes = appendSerializedArrayItem(
        next.commentArrayPayloadBytes,
        next.commentCount,
        comment
      );
      next.commentCount += 1;
      preparation.comments.push(comment);
      assertCommentBudgetElapsed(state.accounting);
    }
    if (thread.mismatch !== undefined) {
      next.mismatchArrayPayloadBytes = appendSerializedArrayItem(
        next.mismatchArrayPayloadBytes,
        next.mismatchCount,
        thread.mismatch
      );
      next.mismatchCount += 1;
      preparation.mismatches.push(thread.mismatch);
    }
    recordEmergencySafePrefix(state, preparation, next);
    preparation.prefixes.push(next);
    summary = next;
  }
};

const appendSerializedArrayItem = (
  payloadBytes: number,
  itemCount: number,
  item: unknown
): number => payloadBytes + (itemCount === 0 ? 0 : 1) + jsonUtf8Bytes(item);

const recordEmergencySafePrefix = (
  state: CommentRetrievalState,
  preparation: CommentFinalizationPreparation,
  summary: CommentPrefixSummary
): void => {
  const clockError = new YoutubeCommentClockError();
  const elapsedError = new YoutubeCommentBudgetError("elapsed_ms");
  const clockOutcome = commentFailureOutcome(clockError, "comments.list");
  const elapsedOutcome = commentFailureOutcome(elapsedError, "comments.list");
  const clockBytes = measureCommentEmergencyEnvelopeBytes(state, summary, clockOutcome);
  const elapsedBytes = measureCommentEmergencyEnvelopeBytes(state, summary, elapsedOutcome);
  if (clockBytes <= state.accounting.budgets.maxNormalizedOutputBytes) {
    preparation.safeClockPrefix = sizedCommentPrefix(summary, clockBytes, Number.MAX_VALUE);
  }
  if (elapsedBytes <= state.accounting.budgets.maxNormalizedOutputBytes) {
    preparation.safeElapsedPrefix = sizedCommentPrefix(summary, elapsedBytes, Number.MAX_VALUE);
  }
  assertCommentBudgetElapsed(state.accounting);
};

const measureCommentEmergencyEnvelopeBytes = (
  state: CommentRetrievalState,
  summary: CommentPrefixSummary,
  outcome: CommentFailureOutcome
): number => {
  return measureCommentEnvelopeBytes(state, summary, outcome, Number.MAX_VALUE);
};

const measureCommentEnvelopeBytes = (
  state: CommentRetrievalState,
  summary: CommentPrefixSummary,
  outcome: CommentFailureOutcome | undefined,
  elapsedMs: number
): number => {
  let normalizedOutputBytes = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const envelope = buildCommentEnvelope(
      state,
      materializeEmptyCommentSelection(summary),
      outcome,
      normalizedOutputBytes,
      elapsedMs
    );
    const bytes = jsonUtf8Bytes(envelope) +
      summary.commentArrayPayloadBytes +
      summary.mismatchArrayPayloadBytes;
    if (bytes === normalizedOutputBytes) return bytes;
    normalizedOutputBytes = bytes;
  }
  throw responseError("YouTube comment output byte accounting did not converge.");
};

const materializeEmptyCommentSelection = (
  summary: CommentPrefixSummary
): CommentSelectionSummary => ({ ...summary, comments: [], mismatches: [] });

const materializeFullCommentSelection = (
  state: CommentRetrievalState,
  summary: CommentPrefixSummary
): CommentSelectionSummary => ({
  ...summary,
  comments: state.comments,
  mismatches: state.activeMismatches
});

const materializePreparedCommentSelection = (
  preparation: CommentFinalizationPreparation,
  summary: CommentPrefixSummary
): CommentSelectionSummary => ({
  ...summary,
  comments: preparation.comments.slice(0, summary.commentCount),
  mismatches: preparation.mismatches.slice(0, summary.mismatchCount)
});

const emitMeasuredCommentEnvelope = (
  state: CommentRetrievalState,
  selection: CommentSelectionSummary,
  outcome: CommentFailureOutcome | undefined,
  expectedBytes: number,
  elapsedMs: number
): ProvenanceEnvelope<YoutubeCommentData> => {
  assertCommentBudgetElapsed(state.accounting);
  const envelope = buildCommentEnvelope(state, selection, outcome, expectedBytes, elapsedMs);
  const bytes = jsonUtf8Bytes(envelope);
  assertCommentBudgetElapsed(state.accounting);
  if (
    bytes !== expectedBytes ||
    bytes > state.accounting.budgets.maxNormalizedOutputBytes
  ) {
    throw responseError("YouTube comment output byte accounting was inconsistent.");
  }
  state.accounting.normalizedOutputBytes = bytes;
  return envelope;
};

const emitEmergencyCommentEnvelope = (
  state: CommentRetrievalState,
  preparation: CommentFinalizationPreparation,
  error: unknown,
  operation: CommentOperation = "comments.list"
): ProvenanceEnvelope<YoutubeCommentData | Record<string, never>> => {
  const outcome = commentFailureOutcome(error, operation);
  const sized = error instanceof YoutubeCommentClockError
    ? preparation.safeClockPrefix
    : preparation.safeElapsedPrefix;
  if (sized === undefined) {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
  const selection = materializePreparedCommentSelection(preparation, sized.summary);
  const elapsedMs = state.accounting.elapsedMs;
  const expectedBytes = measureCommentEnvelopeBytes(state, sized.summary, outcome, elapsedMs);
  const envelope = buildCommentEnvelope(state, selection, outcome, expectedBytes, elapsedMs);
  const bytes = jsonUtf8Bytes(envelope);
  if (
    bytes !== expectedBytes ||
    bytes > state.accounting.budgets.maxNormalizedOutputBytes
  ) {
    return commentPreflightError("youtube_comments_runtime_invalid");
  }
  state.accounting.normalizedOutputBytes = bytes;
  return envelope;
};

const commentFailureOutcome = (
  error: unknown,
  operation: CommentOperation
): CommentFailureOutcome => ({
  error,
  operation,
  limitations: [budgetOrFallbackLimitation(
    error,
    "YouTube comment retrieval clock was invalid."
  )]
});

const minimumCommentEnvelopesFit = (state: CommentRetrievalState): boolean => {
  const summary = emptyCommentPrefixSummary();
  const errors: unknown[] = [
    new YoutubeCommentClockError(),
    new YoutubeCommentBudgetError("elapsed_ms"),
    new YoutubeCommentBudgetError("normalized_output_bytes")
  ];
  return errors.every((error) => measureCommentEnvelopeBytes(
    state,
    summary,
    commentFailureOutcome(error, "comments.list"),
    state.accounting.elapsedMs
  ) <= state.accounting.budgets.maxNormalizedOutputBytes);
};

const buildCommentEnvelope = (
  state: CommentRetrievalState,
  selection: CommentSelectionSummary,
  outcome: CommentFailureOutcome | undefined,
  normalizedOutputBytes: number,
  elapsedMs: number
): ProvenanceEnvelope<YoutubeCommentData> => {
  const logicalLimitations = logicalCommentLimitations(
    state.options,
    selection.expectedReplies,
    selection.mismatchCount
  );
  const isFailure = outcome !== undefined;
  const extractionCoverage = !isFailure && logicalLimitations.length === 0
    ? "api_visible_complete"
    : "partial";
  const data = commentData(state, selection, extractionCoverage);
  const common = {
    provider: "youtube",
    recordType: "youtube_comments",
    primaryIdentifier: state.options.videoId,
    retrievedAt: state.retrievedAt,
    ...(state.options.query === undefined ? {} : { query: { query: state.options.query } }),
    sourceIdentity: { canonical_url: `https://www.youtube.com/watch?v=${state.options.videoId}` },
    pagination: {
      ...(state.options.cursor === undefined ? {} : { cursor: state.options.cursor }),
      page_size: state.options.pageSize,
      exhausted: !isFailure &&
        state.topLevelExhausted &&
        selection.mismatchCount === 0
    },
    returned: selection.commentCount,
    ...(omitCommentRawMetadata(state, outcome)
      ? {}
      : { rawMetadata: commentRawMetadata(state, selection, normalizedOutputBytes, elapsedMs) }),
    data
  };
  if (!isFailure) {
    return okEnvelope({
      ...common,
      accessStatus: extractionCoverage,
      limitations: logicalLimitations
    });
  }

  const code = youtubeFailure(outcome.error, outcome.operation);
  const details = failureDetails(code);
  const successfulPage = state.pages.commentThreads > 0 || state.pages.replies > 0;
  const status = successfulPage ||
    outcome.error instanceof YoutubeCommentBudgetError
    ? "partial"
    : details.accessStatus;
  const http = httpStatus(outcome.error);
  return errorEnvelope({
    ...common,
    pagination: { ...common.pagination, exhausted: false },
    accessStatus: status,
    limitations: uniqueStrings([
      ...logicalLimitations,
      ...outcome.limitations,
      ...(details.limitations ?? [])
    ]),
    code,
    message: details.message,
    ...(details.httpStatus === undefined
      ? (http === undefined ? {} : { httpStatus: http })
      : { httpStatus: details.httpStatus }),
    retryable: details.retryable
  }) as ProvenanceEnvelope<YoutubeCommentData>;
};

const commentPreflightError = (
  code: YoutubeFailureCode
): ProvenanceEnvelope<Record<string, never>> => {
  const details = failureDetails(code);
  const envelope = errorEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: details.limitations ?? [],
    code,
    message: details.message,
    retryable: details.retryable,
    data: {}
  }) as ProvenanceEnvelope<Record<string, never>>;
  if (jsonUtf8Bytes(envelope) <= MIN_YOUTUBE_COMMENT_OUTPUT_BYTES) return envelope;
  return fixedCommentConfigurationError();
};

const fixedCommentConfigurationError = (): ProvenanceEnvelope<Record<string, never>> =>
  errorEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: "error",
    code: "youtube_comments_runtime_invalid",
    message: "YouTube comments runtime configuration is invalid",
    retryable: false,
    data: {}
  }) as ProvenanceEnvelope<Record<string, never>>;

const commentData = (
  state: CommentRetrievalState,
  selection: CommentSelectionSummary,
  extractionCoverage: YoutubeCommentManifest["extraction_coverage"]
): YoutubeCommentData => {
  return {
    comments: selection.comments,
    manifest: {
      video_id: state.options.videoId,
      top_level_comments_retrieved: selection.threads,
      expected_replies: selection.expectedReplies,
      replies_retrieved: selection.repliesRetrieved,
      total_comments_and_replies: selection.commentCount,
      reply_count_mismatches: selection.mismatches,
      pages: {
        comment_threads: state.pages.commentThreads,
        replies: state.pages.replies
      },
      extraction_coverage: extractionCoverage
    }
  };
};

const logicalCommentLimitations = (
  options: CommentRetrievalOptions,
  expectedReplies: number,
  mismatchCount: number
): string[] => {
  return [
    ...(options.query === undefined ? [] : [
      "YouTube searchTerms constrained top-level comment threads to a query-bounded subset; this is not the complete video comment corpus."
    ]),
    ...(options.cursor === undefined ? [] : [
      "Retrieval began from a noninitial commentThreads page token, so earlier API-visible comments were not covered."
    ]),
    ...(!options.includeReplies && expectedReplies > 0 ? [
      `Reply retrieval was disabled while API thread metadata reported ${expectedReplies} expected reply/replies.`
    ] : []),
    ...(mismatchCount === 0 ? [] : [
      `Reply counts did not reconcile for ${mismatchCount} top-level comment(s).`
    ])
  ];
};

const commentRawMetadata = (
  state: CommentRetrievalState,
  selection: CommentSelectionSummary,
  normalizedOutputBytes: number,
  elapsedMs: number
): {
  api_visible_top_level_comments?: number;
  provider_request_attempts: number;
  normalized_output_bytes: number;
  normalized_text_bytes: number;
  elapsed_ms: number;
} => ({
  ...(state.topLevelTotal === undefined
    ? {}
    : { api_visible_top_level_comments: state.topLevelTotal }),
  provider_request_attempts: state.accounting.providerRequestAttempts,
  normalized_output_bytes: normalizedOutputBytes,
  normalized_text_bytes: selection.textBytes,
  elapsed_ms: elapsedMs
});

const omitCommentRawMetadata = (
  state: CommentRetrievalState,
  outcome: CommentFailureOutcome | undefined
): boolean => outcome?.error instanceof YoutubeCommentClockError &&
  state.pages.commentThreads === 0 &&
  state.pages.replies === 0 &&
  state.comments.length === 0;

const boundedInitialCommentRetrievalError = (
  options: CommentRetrievalOptions,
  error: unknown,
  budgets: YoutubeCommentRetrievalBudgets,
  retrievedAt: string
): ProvenanceEnvelope<YoutubeCommentData | Record<string, never>> => {
  const envelope = buildInitialCommentRetrievalError(options, error, retrievedAt);
  if (jsonUtf8Bytes(envelope) <= budgets.maxNormalizedOutputBytes) return envelope;
  return commentPreflightError("youtube_comments_runtime_invalid");
};

const buildInitialCommentRetrievalError = (
  options: CommentRetrievalOptions,
  error: unknown,
  retrievedAt: string
): ProvenanceEnvelope<YoutubeCommentData> => {
  const code = youtubeFailure(error, "commentThreads.list");
  const details = failureDetails(code);
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    primaryIdentifier: options.videoId,
    retrievedAt,
    ...(options.query === undefined ? {} : { query: { query: options.query } }),
    sourceIdentity: { canonical_url: `https://www.youtube.com/watch?v=${options.videoId}` },
    pagination: {
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
      page_size: options.pageSize,
      exhausted: false
    },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: uniqueStrings([
      ...logicalCommentLimitations(options, 0, 0),
      ...(error instanceof YoutubeCommentClockError ? [error.limitation] : []),
      ...(details.limitations ?? [])
    ]),
    code,
    message: details.message,
    retryable: details.retryable,
    data: {
      comments: [],
      manifest: {
        video_id: options.videoId,
        top_level_comments_retrieved: 0,
        expected_replies: 0,
        replies_retrieved: 0,
        total_comments_and_replies: 0,
        reply_count_mismatches: [],
        pages: { comment_threads: 0, replies: 0 },
        extraction_coverage: "partial"
      }
    }
  }) as ProvenanceEnvelope<YoutubeCommentData>;
};

const isCommentClockOrElapsedError = (error: unknown): boolean =>
  error instanceof YoutubeCommentClockError ||
  (error instanceof YoutubeCommentBudgetError && error.dimension === "elapsed_ms");

const commentThreadFailureLimitation = (error: unknown): string =>
  budgetOrFallbackLimitation(
    error,
    "YouTube top-level comment retrieval stopped before every API-visible page could be exhausted."
  );

const replyFailureLimitation = (error: unknown): string =>
  budgetOrFallbackLimitation(
    error,
    "YouTube reply retrieval stopped before every expected reply corpus could be exhausted."
  );

const budgetOrFallbackLimitation = (error: unknown, fallback: string): string =>
  error instanceof YoutubeResponseError ||
  error instanceof YoutubeCommentBudgetError ||
  error instanceof YoutubeCommentClockError
    ? error.limitation
    : fallback;

const responseError = (limitation: string): YoutubeResponseError =>
  new YoutubeResponseError(limitation);

const uniqueStrings = (values: string[]): string[] => [...new Set(values)];

const jsonUtf8Bytes = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw responseError("YouTube comment output was not serializable.");
  return textEncoder.encode(serialized).byteLength;
};

const normalizeSearchRecord = (item: z.infer<typeof searchItemSchema>): YoutubeSearchRecord => ({
  video_id: item.id.videoId,
  ...(item.snippet.channelId === undefined ? {} : { channel_id: item.snippet.channelId }),
  ...(item.snippet.title === undefined ? {} : { title: item.snippet.title }),
  ...(item.snippet.description === undefined ? {} : { description: item.snippet.description }),
  ...(item.snippet.publishedAt === undefined ? {} : { published_at: item.snippet.publishedAt })
});
const normalizeVideo = (item: z.infer<typeof videoItemSchema>): YoutubeVideo => ({
  video_id: item.id,
  ...(item.snippet.channelId === undefined ? {} : { channel_id: item.snippet.channelId }),
  ...(item.snippet.title === undefined ? {} : { title: item.snippet.title }),
  ...(item.snippet.description === undefined ? {} : { description: item.snippet.description }),
  ...(item.snippet.publishedAt === undefined ? {} : { published_at: item.snippet.publishedAt }),
  ...(item.contentDetails?.duration === undefined ? {} : { duration: item.contentDetails.duration }),
  ...statistics(item.statistics),
  ...(item.snippet.tags === undefined ? {} : { tags: item.snippet.tags }),
  ...(item.snippet.liveBroadcastContent === undefined ? {} : { live_broadcast_content: item.snippet.liveBroadcastContent }),
  ...(item.status?.embeddable === undefined ? {} : { embeddable: item.status.embeddable }),
  ...(item.status?.privacyStatus === undefined ? {} : { privacy_status: item.status.privacyStatus })
});

const isCoherentSearchResponse = (
  response: z.infer<typeof searchResponseSchema>,
  pageSize: number,
  cursor: string | undefined
): boolean => response.pageInfo.resultsPerPage === response.items.length
  && response.items.length <= pageSize
  && response.pageInfo.totalResults >= response.items.length
  && !(response.pageInfo.totalResults === 0 && response.nextPageToken !== undefined)
  && !(response.nextPageToken !== undefined && response.pageInfo.totalResults <= response.items.length)
  && (response.nextPageToken === undefined || response.nextPageToken !== cursor);

const isCoherentVideoResponse = (
  response: z.infer<typeof videosResponseSchema>,
  videoId: string
): boolean => response.nextPageToken === undefined
  && response.prevPageToken === undefined
  && ((response.pageInfo.totalResults === 0
    && response.pageInfo.resultsPerPage === 0
    && response.items.length === 0)
    || (response.pageInfo.totalResults === 1
      && response.pageInfo.resultsPerPage === 1
      && response.items.length === 1
      && response.items[0]!.id === videoId));

type YoutubeFailureCode =
  | "youtube_api_key_missing"
  | "youtube_comments_input_invalid"
  | "youtube_comments_runtime_invalid"
  | "youtube_comment_clock_invalid"
  | "youtube_comments_disabled"
  | "youtube_search_input_invalid"
  | "youtube_video_id_invalid"
  | "youtube_response_invalid"
  | "youtube_video_not_found"
  | "youtube_parent_comment_not_found"
  | "youtube_video_not_visible"
  | "youtube_rate_limited"
  | "youtube_access_denied"
  | "youtube_upstream_unavailable"
  | "youtube_request_failed"
  | YoutubeCommentBudgetFailureCode;

type CommentOperation = "commentThreads.list" | "comments.list";
type YoutubeOperation = "search" | "video" | CommentOperation;

const youtubeFailure = (error: unknown, operation: YoutubeOperation): YoutubeFailureCode => {
  if (error instanceof YoutubeCommentClockError) return "youtube_comment_clock_invalid";
  if (error instanceof YoutubeCommentBudgetError) return error.code;
  if (error instanceof YoutubeResponseError || (error instanceof Error && error.message === "Invalid upstream JSON response")) {
    return "youtube_response_invalid";
  }
  const status = httpStatus(error);
  const reason = upstreamReason(error);
  if (status === 429 || reason === "quotaExceeded") return "youtube_rate_limited";
  if (operation === "commentThreads.list") {
    if (status === 403 && reason === "commentsDisabled") return "youtube_comments_disabled";
    if (status === 404 && reason === "videoNotFound") return "youtube_video_not_found";
    if (reason === "commentNotFound") return "youtube_request_failed";
  }
  if (operation === "comments.list") {
    if (status === 404 && reason === "commentNotFound") return "youtube_parent_comment_not_found";
    if (reason === "commentsDisabled" || reason === "videoNotFound") return "youtube_request_failed";
  }
  if (operation === "video" && status === 404 && reason === "videoNotFound") {
    return "youtube_video_not_found";
  }
  if (status === 401 || status === 403) return "youtube_access_denied";
  if (status !== undefined && status >= 500) return "youtube_upstream_unavailable";
  return "youtube_request_failed";
};

const failureDetails = (code: YoutubeFailureCode): {
  accessStatus: AccessStatus; message: string; retryable: boolean; httpStatus?: number; limitations?: string[];
} => {
  if (code === "youtube_api_key_missing") return { accessStatus: "inaccessible", message: "YouTube API key is not configured", retryable: false, limitations: ["YouTube retrieval cannot run until the server-side API key is configured."] };
  if (code === "youtube_comments_input_invalid") return { accessStatus: "error", message: "YouTube comments input is invalid", retryable: false };
  if (code === "youtube_comments_runtime_invalid") return { accessStatus: "error", message: "YouTube comments runtime configuration is invalid", retryable: false };
  if (code === "youtube_comment_clock_invalid") return { accessStatus: "error", message: "YouTube comment retrieval clock was invalid", retryable: false };
  if (code === "youtube_comments_disabled") return { accessStatus: "comments_disabled", message: "YouTube comments are disabled", retryable: false, httpStatus: 403 };
  if (code === "youtube_search_input_invalid") return { accessStatus: "error", message: "YouTube search input is invalid", retryable: false };
  if (code === "youtube_video_id_invalid") return { accessStatus: "error", message: "YouTube video identifier is invalid", retryable: false };
  if (code === "youtube_response_invalid") return { accessStatus: "error", message: "YouTube response was invalid", retryable: false };
  if (code === "youtube_video_not_found") return { accessStatus: "not_found", message: "YouTube video was not found", retryable: false, httpStatus: 404 };
  if (code === "youtube_parent_comment_not_found") return { accessStatus: "not_found", message: "YouTube parent comment was not found", retryable: false, httpStatus: 404 };
  if (code === "youtube_video_not_visible") return { accessStatus: "inaccessible", message: "YouTube did not expose the requested video", retryable: false, limitations: [VIDEO_NOT_VISIBLE_LIMITATION] };
  if (code === "youtube_rate_limited") return { accessStatus: "rate_limited", message: "YouTube rate limit reached", retryable: true };
  if (code === "youtube_access_denied") return { accessStatus: "inaccessible", message: "YouTube access denied", retryable: false };
  if (code === "youtube_upstream_unavailable") return { accessStatus: "error", message: "YouTube upstream service unavailable", retryable: true };
  if (code.startsWith("youtube_comment_budget_")) {
    const dimension = code.slice("youtube_comment_budget_".length);
    return {
      accessStatus: "partial",
      message: `YouTube comment retrieval budget reached: ${dimension}`,
      retryable: false
    };
  }
  return { accessStatus: "error", message: "YouTube request failed", retryable: false };
};

const searchError = (
  code: YoutubeFailureCode,
  input: Partial<SearchYoutubeInput>,
  pagination?: { cursor?: string; page_size?: number },
  error?: unknown
): ProvenanceEnvelope<YoutubeSearchRecord[]> => {
  const details = failureDetails(code);
  const status = httpStatus(error);
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_search_result",
    ...(typeof input.query === "string" ? { query: { query: input.query } } : {}),
    pagination: { ...pagination, exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: details.limitations ?? [],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? (status === undefined ? {} : { httpStatus: status }) : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: []
  }) as ProvenanceEnvelope<YoutubeSearchRecord[]>;
};

const videoError = (
  code: YoutubeFailureCode,
  videoId?: string,
  error?: unknown
): ProvenanceEnvelope<YoutubeVideo> => {
  const details = failureDetails(code);
  const status = httpStatus(error);
  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_video",
    ...(videoId === undefined ? {} : { primaryIdentifier: videoId }),
    pagination: { exhausted: code === "youtube_video_not_found" || code === "youtube_video_not_visible" },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: details.limitations ?? [],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? (status === undefined ? {} : { httpStatus: status }) : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {}
  }) as ProvenanceEnvelope<YoutubeVideo>;
};

const httpStatus = (error: unknown): number | undefined => error instanceof UpstreamHttpError
  ? error.status
  : error instanceof Error ? Number(/^Upstream request failed with status (\d{3})$/.exec(error.message)?.[1]) || undefined : undefined;
const upstreamReason = (error: unknown): string | undefined => error instanceof UpstreamHttpError ? error.reason : undefined;
function isValidRfc3339(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}
const statistics = (value: z.infer<typeof videoItemSchema>["statistics"]): Partial<Pick<YoutubeVideo, "statistics">> => {
  if (value?.viewCount === undefined && value?.likeCount === undefined && value?.commentCount === undefined) return {};
  return { statistics: {
    ...(value?.viewCount === undefined ? {} : { view_count: value.viewCount }),
    ...(value?.likeCount === undefined ? {} : { like_count: value.likeCount }),
    ...(value?.commentCount === undefined ? {} : { comment_count: value.commentCount })
  } };
};
class YoutubeResponseError extends Error {
  constructor(readonly limitation = "YouTube response was invalid") {
    super("YouTube response was invalid");
  }
}
class YoutubeCommentBudgetError extends Error {
  readonly code: YoutubeCommentBudgetFailureCode;
  readonly limitation: string;

  constructor(readonly dimension: CommentBudgetDimension) {
    super(`YouTube comment retrieval budget reached: ${dimension}`);
    this.code = `youtube_comment_budget_${dimension}`;
    this.limitation = `YouTube comment retrieval stopped after reaching the ${dimension} budget.`;
  }
}
class YoutubeCommentClockError extends Error {
  readonly limitation = "YouTube comment retrieval clock was invalid.";

  constructor() {
    super("YouTube comment retrieval clock was invalid");
  }
}
