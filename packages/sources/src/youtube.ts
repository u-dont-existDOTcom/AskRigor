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
  config: YoutubeConfig
): Promise<ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return commentPreflightError("youtube_api_key_missing");
  const parsedInput = commentInputSchema.safeParse(input);
  if (!parsedInput.success) return commentPreflightError("youtube_comments_input_invalid");
  const videoId = parseYoutubeVideoId(parsedInput.data.video);
  if (videoId === undefined) return commentPreflightError("youtube_video_id_invalid");

  return retrieveYoutubeComments({
    videoId,
    includeReplies: parsedInput.data.includeReplies ?? true,
    pageSize: parsedInput.data.pageSize ?? DEFAULT_COMMENT_PAGE_SIZE,
    cursor: parsedInput.data.cursor,
    apiKey: parsedConfig.data
  });
};

export const searchYoutubeComments = async (
  input: SearchYoutubeCommentsInput,
  config: YoutubeConfig
): Promise<ProvenanceEnvelope<YoutubeCommentData | Record<string, never>>> => {
  const parsedConfig = apiKeySchema.safeParse(config.apiKey);
  if (!parsedConfig.success) return commentPreflightError("youtube_api_key_missing");
  const parsedInput = targetedCommentInputSchema.safeParse(input);
  if (!parsedInput.success) return commentPreflightError("youtube_comments_input_invalid");
  const videoId = parseYoutubeVideoId(parsedInput.data.video);
  if (videoId === undefined) return commentPreflightError("youtube_video_id_invalid");

  return retrieveYoutubeComments({
    videoId,
    includeReplies: parsedInput.data.includeReplies ?? true,
    pageSize: parsedInput.data.pageSize ?? DEFAULT_COMMENT_PAGE_SIZE,
    cursor: parsedInput.data.cursor,
    query: parsedInput.data.query,
    apiKey: parsedConfig.data
  });
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
}

const retrieveYoutubeComments = async (
  options: CommentRetrievalOptions
): Promise<ProvenanceEnvelope<YoutubeCommentData>> => {
  const state: CommentRetrievalState = {
    options,
    comments: [],
    commentsById: new Map(),
    embeddedReplyIds: new Set(),
    threadIds: new Set(),
    topLevelIds: new Set(),
    threads: [],
    pages: { commentThreads: 0, replies: 0 },
    topLevelExhausted: false
  };

  try {
    await collectCommentThreads(state);
  } catch (error) {
    return commentRetrievalError(state, error, [commentThreadFailureLimitation(error)]);
  }

  if (options.includeReplies) {
    for (const thread of state.threads) {
      if (thread.expectedReplies === 0) continue;
      try {
        await collectReplies(state, thread);
      } catch (error) {
        return commentRetrievalError(state, error, [replyFailureLimitation(error)]);
      }
    }
  }

  return completeCommentResult(state);
};

const collectCommentThreads = async (state: CommentRetrievalState): Promise<void> => {
  let pageToken = state.options.cursor;
  const seenTokens = new Set<string>(pageToken === undefined ? [] : [pageToken]);

  while (true) {
    state.pages.commentThreads += 1;
    const url = new URL(`${YOUTUBE_API_URL}/commentThreads`);
    url.searchParams.set("part", "snippet,replies");
    url.searchParams.set("videoId", state.options.videoId);
    url.searchParams.set("maxResults", String(state.options.pageSize));
    url.searchParams.set("textFormat", "plainText");
    url.searchParams.set("order", "time");
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    if (state.options.query !== undefined) url.searchParams.set("searchTerms", state.options.query);
    url.searchParams.set("key", state.options.apiKey);

    const parsed = commentThreadsResponseSchema.safeParse(await fetchJson(url.toString()));
    if (!parsed.success) throw responseError("YouTube returned an invalid commentThreads response.");
    const response = parsed.data;
    validateCommentThreadPage(response, state);
    state.topLevelTotal ??= response.pageInfo.totalResults;

    for (const item of response.items) addCommentThread(state, item);

    const nextToken = response.nextPageToken;
    if (nextToken === undefined) {
      state.topLevelExhausted = true;
      if (
        state.options.cursor === undefined &&
        state.threads.length !== state.topLevelTotal
      ) {
        throw responseError("YouTube commentThreads results did not reconcile with pageInfo.totalResults.");
      }
      return;
    }
    if (seenTokens.has(nextToken)) {
      throw responseError("YouTube commentThreads pagination returned a repeated page token.");
    }
    if (state.threads.length >= response.pageInfo.totalResults) {
      throw responseError("YouTube commentThreads pagination was inconsistent with pageInfo.totalResults.");
    }
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

const addCommentThread = (
  state: CommentRetrievalState,
  item: z.infer<typeof commentThreadSchema>
): void => {
  const topLevel = item.snippet.topLevelComment;
  if (
    item.snippet.videoId !== state.options.videoId ||
    topLevel.snippet.videoId !== state.options.videoId ||
    topLevel.snippet.parentId !== undefined
  ) {
    throw responseError("YouTube returned a comment thread that did not correlate to the requested video.");
  }
  if (state.threadIds.has(item.id) || state.topLevelIds.has(topLevel.id) || state.commentsById.has(topLevel.id)) {
    throw responseError("YouTube returned a duplicate thread or top-level comment identifier.");
  }

  const embedded = item.replies?.comments ?? [];
  if (embedded.length > item.snippet.totalReplyCount) {
    throw responseError("YouTube embedded more replies than the thread totalReplyCount declared.");
  }

  state.threadIds.add(item.id);
  state.topLevelIds.add(topLevel.id);
  addUniqueComment(state, normalizeComment(topLevel, state.options.videoId, topLevel.id, false));
  const thread: CommentThreadState = {
    topLevelId: topLevel.id,
    expectedReplies: item.snippet.totalReplyCount,
    fetchedReplyIds: new Set(),
    repliesExhausted: item.snippet.totalReplyCount === 0
  };
  state.threads.push(thread);

  for (const reply of embedded) {
    validateReplyCorrelation(reply, state.options.videoId, topLevel.id);
    if (state.embeddedReplyIds.has(reply.id) || state.commentsById.has(reply.id)) {
      throw responseError("YouTube returned a duplicate embedded reply identifier.");
    }
    state.embeddedReplyIds.add(reply.id);
    if (state.options.includeReplies) {
      addUniqueComment(state, normalizeComment(reply, state.options.videoId, topLevel.id, true));
    }
  }
};

const collectReplies = async (
  state: CommentRetrievalState,
  thread: CommentThreadState
): Promise<void> => {
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();

  while (true) {
    state.pages.replies += 1;
    const url = new URL(`${YOUTUBE_API_URL}/comments`);
    url.searchParams.set("part", "snippet");
    url.searchParams.set("parentId", thread.topLevelId);
    url.searchParams.set("maxResults", String(REPLY_PAGE_SIZE));
    url.searchParams.set("textFormat", "plainText");
    if (pageToken !== undefined) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", state.options.apiKey);

    const parsed = commentsResponseSchema.safeParse(await fetchJson(url.toString()));
    if (!parsed.success) throw responseError("YouTube returned an invalid comments response.");
    const response = parsed.data;
    validateReplyPage(response, thread);
    thread.observedReplyTotal ??= response.pageInfo.totalResults;

    for (const reply of response.items) {
      validateReplyCorrelation(reply, state.options.videoId, thread.topLevelId);
      if (thread.fetchedReplyIds.has(reply.id)) {
        throw responseError("YouTube returned a duplicate reply identifier across comments pages.");
      }
      thread.fetchedReplyIds.add(reply.id);
      mergeFetchedReply(state, normalizeComment(reply, state.options.videoId, thread.topLevelId, true));
    }

    const nextToken = response.nextPageToken;
    if (nextToken === undefined) {
      if (thread.fetchedReplyIds.size !== response.pageInfo.totalResults) {
        throw responseError("YouTube comments results did not reconcile with pageInfo.totalResults.");
      }
      thread.repliesExhausted = true;
      return;
    }
    if (seenTokens.has(nextToken) || nextToken === pageToken) {
      throw responseError("YouTube replies pagination returned a repeated page token.");
    }
    if (thread.fetchedReplyIds.size >= response.pageInfo.totalResults) {
      throw responseError("YouTube replies pagination was inconsistent with pageInfo.totalResults.");
    }
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

const addUniqueComment = (state: CommentRetrievalState, comment: YoutubeComment): void => {
  if (state.commentsById.has(comment.comment_id)) {
    throw responseError("YouTube returned a duplicate comment identifier.");
  }
  state.commentsById.set(comment.comment_id, comment);
  state.comments.push(comment);
};

const mergeFetchedReply = (state: CommentRetrievalState, comment: YoutubeComment): void => {
  const existing = state.commentsById.get(comment.comment_id);
  if (existing === undefined) {
    addUniqueComment(state, comment);
    return;
  }
  if (!state.embeddedReplyIds.has(comment.comment_id) || !commentsEqual(existing, comment)) {
    throw responseError("YouTube returned a duplicate comment identifier with inconsistent metadata.");
  }
};

const commentsEqual = (left: YoutubeComment, right: YoutubeComment): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const completeCommentResult = (
  state: CommentRetrievalState
): ProvenanceEnvelope<YoutubeCommentData> => {
  const mismatches = replyCountMismatches(state);
  const limitations = logicalCommentLimitations(state, mismatches);
  const extractionCoverage = limitations.length === 0
    ? "api_visible_complete"
    : "partial";
  const data = commentData(state, mismatches, extractionCoverage);
  const replyPaginationComplete = state.options.includeReplies
    ? state.threads.every((thread) => thread.expectedReplies === 0 || thread.repliesExhausted)
    : state.threads.every((thread) => thread.expectedReplies === 0);

  return okEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    primaryIdentifier: state.options.videoId,
    ...(state.options.query === undefined ? {} : { query: { query: state.options.query } }),
    sourceIdentity: { canonical_url: `https://www.youtube.com/watch?v=${state.options.videoId}` },
    pagination: {
      ...(state.options.cursor === undefined ? {} : { cursor: state.options.cursor }),
      page_size: state.options.pageSize,
      exhausted: state.topLevelExhausted && replyPaginationComplete && mismatches.length === 0
    },
    returned: state.comments.length,
    accessStatus: extractionCoverage,
    limitations,
    ...rawTopLevelMetadata(state),
    data
  });
};

const commentRetrievalError = (
  state: CommentRetrievalState,
  error: unknown,
  limitations: string[]
): ProvenanceEnvelope<YoutubeCommentData> => {
  const code = youtubeFailure(error, "comments");
  const details = failureDetails(code);
  const mismatches = replyCountMismatches(state);
  const data = commentData(state, mismatches, "partial");
  const hasSuccessfulPage = state.topLevelTotal !== undefined || state.threads.some(
    (thread) => thread.observedReplyTotal !== undefined
  );
  const status = hasSuccessfulPage ? "partial" : details.accessStatus;
  const http = httpStatus(error);

  return errorEnvelope({
    provider: "youtube",
    recordType: "youtube_comments",
    primaryIdentifier: state.options.videoId,
    ...(state.options.query === undefined ? {} : { query: { query: state.options.query } }),
    sourceIdentity: { canonical_url: `https://www.youtube.com/watch?v=${state.options.videoId}` },
    pagination: {
      ...(state.options.cursor === undefined ? {} : { cursor: state.options.cursor }),
      page_size: state.options.pageSize,
      exhausted: false
    },
    returned: state.comments.length,
    accessStatus: status,
    limitations: uniqueStrings([
      ...logicalCommentLimitations(state, mismatches),
      ...limitations,
      ...(details.limitations ?? [])
    ]),
    ...rawTopLevelMetadata(state),
    code,
    message: details.message,
    ...(details.httpStatus === undefined
      ? (http === undefined ? {} : { httpStatus: http })
      : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data
  }) as ProvenanceEnvelope<YoutubeCommentData>;
};

const commentPreflightError = (
  code: YoutubeFailureCode
): ProvenanceEnvelope<Record<string, never>> => {
  const details = failureDetails(code);
  return errorEnvelope({
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
};

const commentData = (
  state: CommentRetrievalState,
  mismatches: YoutubeReplyCountMismatch[],
  extractionCoverage: YoutubeCommentManifest["extraction_coverage"]
): YoutubeCommentData => {
  const repliesRetrieved = state.comments.filter((comment) => comment.is_reply).length;
  return {
    comments: state.comments,
    manifest: {
      video_id: state.options.videoId,
      top_level_comments_retrieved: state.threads.length,
      expected_replies: state.threads.reduce((sum, thread) => sum + thread.expectedReplies, 0),
      replies_retrieved: repliesRetrieved,
      total_comments_and_replies: state.comments.length,
      reply_count_mismatches: mismatches,
      pages: {
        comment_threads: state.pages.commentThreads,
        replies: state.pages.replies
      },
      extraction_coverage: extractionCoverage
    }
  };
};

const replyCountMismatches = (state: CommentRetrievalState): YoutubeReplyCountMismatch[] =>
  state.threads.flatMap((thread) => {
    if (thread.expectedReplies === 0) return [];
    const returnedForParent = state.comments.filter(
      (comment) => comment.is_reply && comment.parent_id === thread.topLevelId
    ).length;
    const independentlyRetrieved = thread.fetchedReplyIds.size;
    const reconciled = state.options.includeReplies &&
      thread.repliesExhausted &&
      thread.observedReplyTotal === thread.expectedReplies &&
      independentlyRetrieved === thread.expectedReplies &&
      returnedForParent === thread.expectedReplies;
    return reconciled ? [] : [{
      parent_comment_id: thread.topLevelId,
      expected: thread.expectedReplies,
      retrieved: state.options.includeReplies
        ? (independentlyRetrieved === thread.expectedReplies
          ? returnedForParent
          : independentlyRetrieved)
        : 0
    }];
  });

const logicalCommentLimitations = (
  state: CommentRetrievalState,
  mismatches: YoutubeReplyCountMismatch[]
): string[] => {
  const expectedReplies = state.threads.reduce((sum, thread) => sum + thread.expectedReplies, 0);
  return [
    ...(state.options.query === undefined ? [] : [
      "YouTube searchTerms constrained top-level comment threads to a query-bounded subset; this is not the complete video comment corpus."
    ]),
    ...(state.options.cursor === undefined ? [] : [
      "Retrieval began from a noninitial commentThreads page token, so earlier API-visible comments were not covered."
    ]),
    ...(!state.options.includeReplies && expectedReplies > 0 ? [
      `Reply retrieval was disabled while API thread metadata reported ${expectedReplies} expected reply/replies.`
    ] : []),
    ...(mismatches.length === 0 ? [] : [
      `Reply counts did not reconcile for ${mismatches.length} top-level comment(s).`
    ])
  ];
};

const rawTopLevelMetadata = (state: CommentRetrievalState): {
  rawMetadata?: { api_visible_top_level_comments: number };
} => state.topLevelTotal === undefined
  ? {}
  : { rawMetadata: { api_visible_top_level_comments: state.topLevelTotal } };

const commentThreadFailureLimitation = (error: unknown): string =>
  error instanceof YoutubeResponseError
    ? error.limitation
    : "YouTube top-level comment retrieval stopped before every API-visible page could be exhausted.";

const replyFailureLimitation = (error: unknown): string =>
  error instanceof YoutubeResponseError
    ? error.limitation
    : "YouTube reply retrieval stopped before every expected reply corpus could be exhausted.";

const responseError = (limitation: string): YoutubeResponseError =>
  new YoutubeResponseError(limitation);

const uniqueStrings = (values: string[]): string[] => [...new Set(values)];

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
  | "youtube_comments_disabled"
  | "youtube_search_input_invalid"
  | "youtube_video_id_invalid"
  | "youtube_response_invalid"
  | "youtube_video_not_found"
  | "youtube_video_not_visible"
  | "youtube_rate_limited"
  | "youtube_access_denied"
  | "youtube_upstream_unavailable"
  | "youtube_request_failed";

const youtubeFailure = (error: unknown, operation: "search" | "video" | "comments"): YoutubeFailureCode => {
  if (error instanceof YoutubeResponseError || (error instanceof Error && error.message === "Invalid upstream JSON response")) {
    return "youtube_response_invalid";
  }
  const status = httpStatus(error);
  if (operation === "comments" && upstreamReason(error) === "commentsDisabled") return "youtube_comments_disabled";
  if (status === 404 && operation !== "search" && upstreamReason(error) === "videoNotFound") return "youtube_video_not_found";
  if (status === 429 || upstreamReason(error) === "quotaExceeded") return "youtube_rate_limited";
  if (status === 401 || status === 403) return "youtube_access_denied";
  if (status !== undefined && status >= 500) return "youtube_upstream_unavailable";
  return "youtube_request_failed";
};

const failureDetails = (code: YoutubeFailureCode): {
  accessStatus: AccessStatus; message: string; retryable: boolean; httpStatus?: number; limitations?: string[];
} => {
  if (code === "youtube_api_key_missing") return { accessStatus: "inaccessible", message: "YouTube API key is not configured", retryable: false, limitations: ["YouTube retrieval cannot run until the server-side API key is configured."] };
  if (code === "youtube_comments_input_invalid") return { accessStatus: "error", message: "YouTube comments input is invalid", retryable: false };
  if (code === "youtube_comments_disabled") return { accessStatus: "comments_disabled", message: "YouTube comments are disabled", retryable: false, httpStatus: 403 };
  if (code === "youtube_search_input_invalid") return { accessStatus: "error", message: "YouTube search input is invalid", retryable: false };
  if (code === "youtube_video_id_invalid") return { accessStatus: "error", message: "YouTube video identifier is invalid", retryable: false };
  if (code === "youtube_response_invalid") return { accessStatus: "error", message: "YouTube response was invalid", retryable: false };
  if (code === "youtube_video_not_found") return { accessStatus: "not_found", message: "YouTube video was not found", retryable: false, httpStatus: 404 };
  if (code === "youtube_video_not_visible") return { accessStatus: "inaccessible", message: "YouTube did not expose the requested video", retryable: false, limitations: [VIDEO_NOT_VISIBLE_LIMITATION] };
  if (code === "youtube_rate_limited") return { accessStatus: "rate_limited", message: "YouTube rate limit reached", retryable: true };
  if (code === "youtube_access_denied") return { accessStatus: "inaccessible", message: "YouTube access denied", retryable: false };
  if (code === "youtube_upstream_unavailable") return { accessStatus: "error", message: "YouTube upstream service unavailable", retryable: true };
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
