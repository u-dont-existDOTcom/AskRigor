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
  items: z.array(videoItemSchema).max(1)
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
): boolean => !("nextPageToken" in response)
  && ((response.pageInfo.totalResults === 0
    && response.pageInfo.resultsPerPage === 0
    && response.items.length === 0)
    || (response.pageInfo.totalResults === 1
      && response.pageInfo.resultsPerPage === 1
      && response.items.length === 1
      && response.items[0]!.id === videoId));

type YoutubeFailureCode =
  | "youtube_api_key_missing"
  | "youtube_search_input_invalid"
  | "youtube_video_id_invalid"
  | "youtube_response_invalid"
  | "youtube_video_not_found"
  | "youtube_video_not_visible"
  | "youtube_rate_limited"
  | "youtube_access_denied"
  | "youtube_upstream_unavailable"
  | "youtube_request_failed";

const youtubeFailure = (error: unknown, operation: "search" | "video"): YoutubeFailureCode => {
  if (error instanceof YoutubeResponseError || (error instanceof Error && error.message === "Invalid upstream JSON response")) {
    return "youtube_response_invalid";
  }
  const status = httpStatus(error);
  if (status === 404 && operation === "video" && upstreamReason(error) === "videoNotFound") return "youtube_video_not_found";
  if (status === 429 || upstreamReason(error) === "quotaExceeded") return "youtube_rate_limited";
  if (status === 401 || status === 403) return "youtube_access_denied";
  if (status !== undefined && status >= 500) return "youtube_upstream_unavailable";
  return "youtube_request_failed";
};

const failureDetails = (code: YoutubeFailureCode): {
  accessStatus: AccessStatus; message: string; retryable: boolean; httpStatus?: number; limitations?: string[];
} => {
  if (code === "youtube_api_key_missing") return { accessStatus: "inaccessible", message: "YouTube API key is not configured", retryable: false, limitations: ["YouTube retrieval cannot run until the server-side API key is configured."] };
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
class YoutubeResponseError extends Error {}
