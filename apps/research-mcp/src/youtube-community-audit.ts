import { createHash } from "node:crypto";

import { ACCESS_STATUSES, type AccessStatus } from "@askrigor/contracts";
import {
  DEFAULT_YOUTUBE_COMMENT_RETRIEVAL_BUDGETS,
  getYoutubeComments,
  getYoutubeVideo,
  searchYoutube,
  youtubeCommentDataSchema,
  youtubeCommentManifestSchema,
  youtubeCommentSchema,
  youtubeVideoDataSchema,
  type YoutubeComment,
  type YoutubeCommentRetrievalRuntime,
  type YoutubeConfig,
  type YoutubeSearchRecord
} from "@askrigor/sources";
import { z } from "zod";

import { youtubeCommunityDirectionSchema } from "./youtube-community-survey.js";

export { youtubeCommunityDirectionSchema } from "./youtube-community-survey.js";

export const youtubeCommunityAuditInputSchema = z.object({
  research_question: z.string().trim().min(1).max(5_000),
  searches: z.array(z.object({
    direction: youtubeCommunityDirectionSchema,
    query: z.string().trim().min(1).max(5_000)
  }).strict()).min(1).max(6),
  max_videos: z.number().int().min(1).max(3).default(2),
  sample_comments_per_video: z.number().int().min(20).max(500).default(250)
}).strict();

const accessStatusSchema = z.enum(ACCESS_STATUSES);
const paginationSchema = z.object({
  cursor: z.string().optional(),
  next_cursor: z.string().optional(),
  page_size: z.number().int().positive().optional(),
  returned: z.number().int().nonnegative(),
  exhausted: z.boolean().optional()
}).strict();
const providerErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  http_status: z.number().int().optional(),
  retryable: z.boolean().optional()
}).strict();
const searchReceiptSchema = z.object({
  directions: z.array(youtubeCommunityDirectionSchema).min(1).max(6),
  query: z.string(),
  access_status: accessStatusSchema,
  pagination: paginationSchema,
  limitations: z.array(z.string()),
  error: providerErrorSchema.optional(),
  candidate_video_ids: z.array(z.string()).max(3)
}).strict();
const auditVideoSchema = z.object({
  video_id: z.string(),
  directions: z.array(youtubeCommunityDirectionSchema).min(1).max(6),
  search_queries: z.array(z.string()).min(1).max(6),
  metadata_access_status: accessStatusSchema,
  metadata: youtubeVideoDataSchema.optional(),
  metadata_error: providerErrorSchema.optional(),
  comments_access_status: accessStatusSchema.optional(),
  comments_error: providerErrorSchema.optional(),
  manifest: youtubeCommentManifestSchema.optional(),
  sample: z.object({
    mode: z.enum(["all", "systematic_chronological"]),
    corpus_count: z.number().int().nonnegative(),
    sampled_count: z.number().int().nonnegative().max(500),
    comments: z.array(youtubeCommentSchema).max(500)
  }).strict().optional(),
  corpus_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  limitations: z.array(z.string())
}).strict();
const completionStateSchema = z.enum([
  "api_visible_complete",
  "complete_no_candidates",
  "completed_with_access_boundary",
  "incomplete"
]);

export const youtubeCommunityAuditOutputSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_community_audit"),
  retrieved_at: z.string(),
  research_question: z.string(),
  access_status: accessStatusSchema,
  limitations: z.array(z.string()),
  selection: z.object({
    basis: z.literal("bounded_provider_ranked_round_robin"),
    max_videos: z.number().int().min(1).max(3),
    candidates_considered: z.number().int().nonnegative()
  }).strict(),
  searches: z.array(searchReceiptSchema).min(1).max(6),
  videos: z.array(auditVideoSchema).max(3),
  receipt: z.object({
    completion_state: completionStateSchema,
    synthesis_lock: z.enum(["pass", "block"]),
    searches_requested: z.number().int().positive().max(6),
    searches_completed: z.number().int().nonnegative().max(6),
    selected_video_ids: z.array(z.string()).max(3),
    unfiltered_retrieval_attempted_for_all: z.boolean(),
    replies_requested_for_all: z.boolean(),
    pagination_exhausted_for_complete_videos: z.boolean(),
    replies_reconciled_for_complete_videos: z.boolean(),
    query_bounded_comments_used_as_corpus: z.literal(false),
    blockers: z.array(z.string())
  }).strict()
}).strict();

export type YoutubeCommunityAuditInput = z.input<typeof youtubeCommunityAuditInputSchema>;
export type YoutubeCommunityAuditOutput = z.output<typeof youtubeCommunityAuditOutputSchema>;
type YoutubeCommunityDirection = z.output<typeof youtubeCommunityDirectionSchema>;

interface DistinctSearch {
  query: string;
  directions: YoutubeCommunityDirection[];
}

interface CandidateAssociation {
  directions: YoutubeCommunityDirection[];
  queries: string[];
}

const DISCOVERY_LIMITATION =
  "YouTube video discovery used one bounded provider-ranked page per distinct query; it did not exhaust the full platform or determine materiality.";
const PARTIAL_CORPUS_EVIDENCE_LIMITATION =
  "This is a partial corpus. The retrieved records remain eligible for bounded evidence review, but they do not represent unseen records or establish corpus-wide prevalence, direction, rarity, or typicality.";

export async function auditYoutubeCommunity(
  input: YoutubeCommunityAuditInput,
  config: YoutubeConfig,
  runtime: YoutubeCommentRetrievalRuntime = {}
): Promise<YoutubeCommunityAuditOutput> {
  const parsed = youtubeCommunityAuditInputSchema.parse(input);
  const distinctSearches = combineDistinctSearches(parsed.searches);
  const searchResults = await Promise.all(distinctSearches.map(async (search) => ({
      search,
      result: await searchYoutube({
        query: search.query,
        pageSize: parsed.max_videos
      }, config)
    })));

  const associations = candidateAssociations(searchResults);
  const selectedVideoIds = roundRobinVideoIds(searchResults, parsed.max_videos);
  const metadataResults = new Map(await Promise.all(selectedVideoIds.map(async (videoId) => [
    videoId,
    await getYoutubeVideo(videoId, config)
  ] as const)));
  const commentElapsedMs = selectedVideoIds.length === 0
    ? undefined
    : allocateYoutubeCommunityCommentElapsedMs(
      runtime.budgets?.maxElapsedMs ?? DEFAULT_YOUTUBE_COMMENT_RETRIEVAL_BUDGETS.maxElapsedMs,
      selectedVideoIds.length
    );
  const videos: YoutubeCommunityAuditOutput["videos"] = [];
  const blockers: string[] = [];
  const boundaryStatuses: AccessStatus[] = [];
  let attemptedUnfiltered = 0;
  let incomplete = false;

  for (const videoId of selectedVideoIds) {
    const association = associations.get(videoId)!;
    const metadataResult = metadataResults.get(videoId)!;
    const videoLimitations = [...metadataResult.limitations];
    const video: YoutubeCommunityAuditOutput["videos"][number] = {
      video_id: videoId,
      directions: association.directions,
      search_queries: association.queries,
      metadata_access_status: metadataResult.access_status,
      ...(metadataResult.error === undefined ? {} : { metadata_error: metadataResult.error }),
      limitations: videoLimitations
    };
    const parsedMetadata = youtubeVideoDataSchema.safeParse(metadataResult.data);
    if (metadataResult.access_status !== "api_visible_complete" || !parsedMetadata.success) {
      if (isTerminalAccessBoundary(metadataResult.access_status, metadataResult.error?.code)) {
        boundaryStatuses.push(metadataResult.access_status);
      } else {
        incomplete = true;
        blockers.push(`Video ${videoId} metadata ended with ${metadataResult.access_status}.`);
      }
      videos.push(video);
      continue;
    }

    video.metadata = parsedMetadata.data;
    attemptedUnfiltered += 1;
    const commentsResult = await getYoutubeComments({
      video: videoId,
      includeReplies: true
    }, config, {
      ...runtime,
      budgets: {
        ...runtime.budgets,
        maxElapsedMs: commentElapsedMs!
      }
    });
    video.comments_access_status = commentsResult.access_status;
    if (commentsResult.error !== undefined) video.comments_error = commentsResult.error;
    video.limitations.push(...commentsResult.limitations);
    const commentData = youtubeCommentDataSchema.safeParse(commentsResult.data);
    const corpusComplete = commentsResult.access_status === "api_visible_complete" &&
      commentsResult.pagination.exhausted === true &&
      commentsResult.pagination.next_cursor === undefined &&
      commentData.success &&
      commentData.data.manifest.extraction_coverage === "api_visible_complete" &&
      commentData.data.manifest.reply_count_mismatches.length === 0;

    if (commentData.success && (
      corpusComplete ||
      (commentsResult.access_status === "partial" && commentData.data.comments.length > 0)
    )) {
      const comments = commentData.data.comments;
      const sampled = sampleYoutubeComments(comments, parsed.sample_comments_per_video);
      video.manifest = commentData.data.manifest;
      video.corpus_sha256 = hashYoutubeCommentCorpus(comments);
      video.sample = {
        mode: comments.length <= parsed.sample_comments_per_video
          ? "all"
          : "systematic_chronological",
        corpus_count: comments.length,
        sampled_count: sampled.length,
        comments: sampled
      };
      if (sampled.length < comments.length) {
        video.limitations.push(
          `Returned a deterministic chronological sample of ${sampled.length} from ${comments.length} retrieved comments and replies; the sample does not establish prevalence.`
        );
      }
      if (!corpusComplete) video.limitations.push(PARTIAL_CORPUS_EVIDENCE_LIMITATION);
    }
    if (!corpusComplete && isTerminalAccessBoundary(
      commentsResult.access_status,
      commentsResult.error?.code
    )) {
      boundaryStatuses.push(commentsResult.access_status);
    } else if (!corpusComplete) {
      incomplete = true;
      blockers.push(`Video ${videoId} comments ended with ${commentsResult.access_status}.`);
    }
    videos.push(video);
  }

  const searchReceipts = searchResults.map(({ search, result }) => ({
    directions: search.directions,
    query: search.query,
    access_status: result.access_status,
    pagination: result.pagination,
    limitations: result.limitations,
    ...(result.error === undefined ? {} : { error: result.error }),
    candidate_video_ids: result.data.map(({ video_id }) => video_id)
  }));
  const searchesCompleted = searchResults.filter(({ result }) =>
    result.access_status === "complete" || result.access_status === "api_visible_complete"
  ).length;
  if (searchesCompleted !== searchResults.length) {
    incomplete = true;
    for (const { search, result } of searchResults) {
      if (result.access_status !== "complete" && result.access_status !== "api_visible_complete") {
        blockers.push(`YouTube search ${JSON.stringify(search.query)} ended with ${result.access_status}.`);
      }
    }
  }

  const completionState = classifyCompletion({
    incomplete,
    selectedVideoCount: selectedVideoIds.length,
    boundaryCount: boundaryStatuses.length
  });
  const accessStatus = auditAccessStatus(
    completionState,
    searchResults.map(({ result }) => result.access_status),
    videos,
    boundaryStatuses
  );
  const completeVideos = videos.filter(({ comments_access_status }) =>
    comments_access_status === "api_visible_complete"
  );

  return youtubeCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_community_audit",
    retrieved_at: new Date().toISOString(),
    research_question: parsed.research_question,
    access_status: accessStatus,
    limitations: uniqueStrings([
      DISCOVERY_LIMITATION,
      ...searchReceipts.flatMap(({ limitations }) => limitations),
      ...videos.flatMap(({ limitations }) => limitations)
    ]),
    selection: {
      basis: "bounded_provider_ranked_round_robin",
      max_videos: parsed.max_videos,
      candidates_considered: associations.size
    },
    searches: searchReceipts,
    videos,
    receipt: {
      completion_state: completionState,
      synthesis_lock: completionState === "incomplete" ? "block" : "pass",
      searches_requested: distinctSearches.length,
      searches_completed: searchesCompleted,
      selected_video_ids: selectedVideoIds,
      unfiltered_retrieval_attempted_for_all: attemptedUnfiltered === selectedVideoIds.length,
      replies_requested_for_all: attemptedUnfiltered === selectedVideoIds.length,
      pagination_exhausted_for_complete_videos: completeVideos.every(({ manifest }) =>
        manifest?.extraction_coverage === "api_visible_complete"
      ),
      replies_reconciled_for_complete_videos: completeVideos.every(({ manifest }) =>
        manifest?.reply_count_mismatches.length === 0
      ),
      query_bounded_comments_used_as_corpus: false,
      blockers: uniqueStrings(blockers)
    }
  });
}

export function sampleYoutubeComments(
  comments: readonly YoutubeComment[],
  limit: number
): YoutubeComment[] {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Sample limit must be positive");
  const chronological = [...comments].sort((left, right) =>
    left.published_at.localeCompare(right.published_at) ||
    left.comment_id.localeCompare(right.comment_id)
  );
  if (chronological.length <= limit) return chronological;
  if (limit === 1) return [chronological[0]!];

  return Array.from({ length: limit }, (_, index) =>
    chronological[Math.floor(index * (chronological.length - 1) / (limit - 1))]!
  );
}

export function allocateYoutubeCommunityCommentElapsedMs(
  totalElapsedMs: number,
  selectedVideoCount: number
): number {
  if (!Number.isInteger(totalElapsedMs) || totalElapsedMs < 1) {
    throw new Error("Community comment deadline must be a positive integer");
  }
  if (!Number.isInteger(selectedVideoCount) || selectedVideoCount < 1) {
    throw new Error("Selected video count must be a positive integer");
  }
  return Math.max(1, Math.floor(totalElapsedMs / selectedVideoCount));
}

export function hashYoutubeCommentCorpus(comments: readonly YoutubeComment[]): string {
  const canonical = [...comments].sort((left, right) =>
    left.comment_id.localeCompare(right.comment_id)
  );
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function combineDistinctSearches(
  searches: z.output<typeof youtubeCommunityAuditInputSchema>["searches"]
): DistinctSearch[] {
  const byQuery = new Map<string, DistinctSearch>();
  for (const { direction, query } of searches) {
    const existing = byQuery.get(query);
    if (existing === undefined) {
      byQuery.set(query, { query, directions: [direction] });
    } else if (!existing.directions.includes(direction)) {
      existing.directions.push(direction);
    }
  }
  return [...byQuery.values()];
}

function candidateAssociations(
  results: Array<{
    search: DistinctSearch;
    result: Awaited<ReturnType<typeof searchYoutube>>;
  }>
): Map<string, CandidateAssociation> {
  const associations = new Map<string, CandidateAssociation>();
  for (const { search, result } of results) {
    for (const { video_id } of result.data) {
      const existing = associations.get(video_id) ?? { directions: [], queries: [] };
      for (const direction of search.directions) {
        if (!existing.directions.includes(direction)) existing.directions.push(direction);
      }
      if (!existing.queries.includes(search.query)) existing.queries.push(search.query);
      associations.set(video_id, existing);
    }
  }
  return associations;
}

function roundRobinVideoIds(
  results: Array<{
    search: DistinctSearch;
    result: { data: YoutubeSearchRecord[] };
  }>,
  limit: number
): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  const maximumRank = Math.max(0, ...results.map(({ result }) => result.data.length));
  for (let rank = 0; rank < maximumRank && selected.length < limit; rank += 1) {
    for (const { result } of results) {
      const videoId = result.data[rank]?.video_id;
      if (videoId !== undefined && !seen.has(videoId)) {
        seen.add(videoId);
        selected.push(videoId);
        if (selected.length === limit) break;
      }
    }
  }
  return selected;
}

function isTerminalAccessBoundary(status: AccessStatus, errorCode?: string): boolean {
  if (errorCode === "youtube_api_key_missing") return false;
  return status === "comments_disabled" || status === "inaccessible" || status === "not_found";
}

function classifyCompletion(input: {
  incomplete: boolean;
  selectedVideoCount: number;
  boundaryCount: number;
}): z.output<typeof completionStateSchema> {
  if (input.incomplete) return "incomplete";
  if (input.selectedVideoCount === 0) return "complete_no_candidates";
  if (input.boundaryCount > 0) return "completed_with_access_boundary";
  return "api_visible_complete";
}

function auditAccessStatus(
  completionState: z.output<typeof completionStateSchema>,
  searchStatuses: AccessStatus[],
  videos: YoutubeCommunityAuditOutput["videos"],
  boundaryStatuses: AccessStatus[]
): AccessStatus {
  if (completionState === "api_visible_complete") return "api_visible_complete";
  if (completionState === "complete_no_candidates") return "complete";
  if (completionState === "completed_with_access_boundary") {
    return boundaryStatuses.every((status) => status === boundaryStatuses[0])
      ? boundaryStatuses[0] ?? "partial"
      : "partial";
  }
  const failingSearch = searchStatuses.find((status) =>
    status !== "complete" && status !== "api_visible_complete"
  );
  if (failingSearch !== undefined) return failingSearch;
  return videos.find(({ comments_access_status, metadata_access_status }) =>
    comments_access_status !== undefined && comments_access_status !== "api_visible_complete" ||
    metadata_access_status !== "api_visible_complete"
  )?.comments_access_status ?? "partial";
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
