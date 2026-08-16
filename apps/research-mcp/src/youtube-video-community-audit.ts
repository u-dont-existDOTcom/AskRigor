import { ACCESS_STATUSES, type AccessStatus, type ProviderError } from "@askrigor/contracts";
import {
  getYoutubeCommentSegment,
  getYoutubeCommentsByIds,
  getYoutubeVideo,
  parseYoutubeVideoId,
  youtubeCommentSchema,
  youtubeVideoDataSchema,
  type YoutubeComment,
  type YoutubeCommentSegmentRuntime,
  type YoutubeConfig
} from "@askrigor/sources";
import { z } from "zod";

import {
  advanceYoutubeAuditState,
  decodeYoutubeAuditContinuation,
  encodeYoutubeAuditContinuation,
  type YoutubeVideoAuditContinuationState
} from "./youtube-audit-continuation.js";

const TOKEN_LIFETIME_MS = 3_600_000;
const MIN_SECRET_BYTES = 32;
const DEFAULT_ANALYSIS_LIMIT = 500;
const DEFAULT_MAX_ELAPSED_MS = 15_000;
const COMMENT_PAGE_SIZE = 20;
const ZERO_SHA256 = "0".repeat(64);
const ACCESS_BOUNDARIES = new Set<AccessStatus>([
  "comments_disabled",
  "inaccessible",
  "rate_limited",
  "not_found"
]);
const PROVIDER_COUNT_MISMATCH_LIMITATION =
  "YouTube provider metadata and the complete API-visible comment/reply corpus reported different counts.";
const TERMINAL_REPLY_MISMATCH_LIMITATION =
  "All top-level pages and accessible reply-page tokens were exhausted, but one or more provider-reported reply totals did not reconcile; the retained sample is usable as bounded evidence, not a complete API-visible corpus.";
const TERMINAL_PAGINATION_OVERLAP_LIMITATION =
  "YouTube pagination overlap was reconciled by stable identifier, but the moving provider pagination prevents a stable complete-snapshot claim; any retained sample is bounded evidence.";

export const youtubeVideoCommunityAuditInputSchema = z.object({
  video_id_or_url: z.string().min(1).max(2_048).optional(),
  continuation_token: z.string().min(1).max(65_536).optional(),
  analysis_limit: z.number().int().min(1).max(500).optional().describe(
    "Analysis sample limit for a complete corpus larger than 500 records; complete corpora of 500 or fewer return all records."
  ).meta({ default: DEFAULT_ANALYSIS_LIMIT })
}).strict().superRefine((value, context) => {
  if ((value.video_id_or_url === undefined) === (value.continuation_token === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Provide exactly one of video_id_or_url or continuation_token"
    });
  }
});

const accessStatusSchema = z.enum(ACCESS_STATUSES);
const providerErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  http_status: z.number().int().optional(),
  retryable: z.boolean().optional()
}).strict();
const mismatchSchema = z.object({
  parent_comment_id: z.string(),
  expected: z.number().int().nonnegative(),
  retrieved: z.number().int().nonnegative()
}).strict();

export const youtubeVideoCommunityAuditOutputSchema = z.object({
  provider: z.literal("youtube"),
  record_type: z.literal("youtube_video_community_audit"),
  retrieved_at: z.string(),
  video_id: z.string(),
  canonical_url: z.string().url(),
  analysis_limit: z.number().int().min(1).max(500),
  segment_index: z.number().int().nonnegative(),
  metadata_access_status: accessStatusSchema,
  metadata_error: providerErrorSchema.optional(),
  title: youtubeVideoDataSchema.shape.title.optional(),
  channel_id: youtubeVideoDataSchema.shape.channel_id.optional(),
  channel_title: youtubeVideoDataSchema.shape.channel_title.optional(),
  published_at: youtubeVideoDataSchema.shape.published_at.optional(),
  duration: youtubeVideoDataSchema.shape.duration.optional(),
  statistics: youtubeVideoDataSchema.shape.statistics.optional(),
  provider_reported_comments: z.string().regex(/^(0|[1-9][0-9]*)$/).optional(),
  access_status: accessStatusSchema,
  extraction_coverage: z.enum([
    "api_visible_complete",
    "partial",
    "completed_with_access_boundary"
  ]),
  limitations: z.array(z.string()),
  error: providerErrorSchema.optional(),
  top_level_comments_retrieved_this_call: z.number().int().nonnegative(),
  replies_retrieved_this_call: z.number().int().nonnegative(),
  records_retrieved_this_call: z.number().int().nonnegative(),
  comment_thread_pages_this_call: z.number().int().nonnegative(),
  reply_pages_this_call: z.number().int().nonnegative(),
  top_level_comments_retrieved_cumulative: z.number().int().nonnegative(),
  replies_retrieved_cumulative: z.number().int().nonnegative(),
  records_retrieved_cumulative: z.number().int().nonnegative(),
  comment_thread_pages_cumulative: z.number().int().nonnegative(),
  reply_pages_cumulative: z.number().int().nonnegative(),
  records_returned_for_analysis: z.number().int().min(0).max(500),
  top_level_records_returned_for_analysis: z.number().int().min(0).max(500),
  reply_records_returned_for_analysis: z.number().int().min(0).max(500),
  reply_count_mismatches: z.array(mismatchSchema),
  corpus_rolling_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  insufficient_depth: z.boolean(),
  continuation_recommended: z.boolean(),
  continuation_token: z.string().max(65_536).optional(),
  sample: z.object({
    mode: z.enum(["all", "deterministic_hash_chronological"]),
    corpus_count: z.number().int().nonnegative(),
    sampled_count: z.number().int().min(0).max(500),
    comments: z.array(youtubeCommentSchema).max(500)
  }).strict().optional(),
  receipt: z.object({
    completion_state: z.enum([
      "api_visible_complete",
      "completed_with_access_boundary",
      "incomplete"
    ]),
    synthesis_lock: z.enum(["pass", "block"]),
    chain_started_at_first_page: z.boolean(),
    top_level_pagination_exhausted: z.boolean(),
    replies_reconciled: z.boolean(),
    query_bounded_comments_used_as_corpus: z.literal(false),
    blockers: z.array(z.string())
  }).strict()
}).strict();

export type YoutubeVideoCommunityAuditInput = z.input<typeof youtubeVideoCommunityAuditInputSchema>;
export type YoutubeVideoCommunityAuditOutput = z.output<typeof youtubeVideoCommunityAuditOutputSchema>;

export interface YoutubeVideoCommunityAuditDependencies {
  get_video: typeof getYoutubeVideo;
  get_segment: typeof getYoutubeCommentSegment;
  get_comments_by_ids: typeof getYoutubeCommentsByIds;
}

export interface YoutubeVideoCommunityAuditRuntime {
  now?: () => number;
  max_elapsed_ms?: number;
  segment?: YoutubeCommentSegmentRuntime;
  dependencies?: YoutubeVideoCommunityAuditDependencies;
}

const DEFAULT_DEPENDENCIES: YoutubeVideoCommunityAuditDependencies = {
  get_video: getYoutubeVideo,
  get_segment: getYoutubeCommentSegment,
  get_comments_by_ids: getYoutubeCommentsByIds
};

export async function auditYoutubeVideoCommunity(
  input: YoutubeVideoCommunityAuditInput,
  config: { youtube: YoutubeConfig; continuation_secret: string },
  runtime: YoutubeVideoCommunityAuditRuntime = {}
): Promise<YoutubeVideoCommunityAuditOutput> {
  validateSecret(config.continuation_secret);
  const parsedInput = youtubeVideoCommunityAuditInputSchema.safeParse(input);
  if (!parsedInput.success) throw new Error("YouTube video community audit input is invalid");
  const clock = runtime.now ?? Date.now;
  const nowMs = readNow(clock);
  const maxElapsedMs = readMaxElapsed(runtime.max_elapsed_ms);
  const dependencies = runtime.dependencies ?? DEFAULT_DEPENDENCIES;
  const isContinuation = input.continuation_token !== undefined;

  let videoId: string;
  let resumeCursor: YoutubeVideoAuditContinuationState["cursor"] | undefined;
  let baseState: Omit<YoutubeVideoAuditContinuationState, "cursor">;
  if (isContinuation) {
    const decoded = decodeYoutubeAuditContinuation(
      input.continuation_token!,
      config.continuation_secret,
      nowMs
    );
    if (input.analysis_limit !== undefined && input.analysis_limit !== decoded.analysis_limit) {
      throw new Error("YouTube audit continuation analysis limit cannot change");
    }
    videoId = decoded.video_id;
    resumeCursor = decoded.cursor;
    const { cursor: _cursor, ...withoutCursor } = decoded;
    baseState = withoutCursor;
  } else {
    videoId = parseYoutubeVideoId(parsedInput.data.video_id_or_url!) ?? "";
    if (videoId.length === 0) throw new Error("YouTube video identifier is invalid");
    baseState = {
      version: 1,
      video_id: videoId,
      analysis_limit: parsedInput.data.analysis_limit ?? DEFAULT_ANALYSIS_LIMIT,
      started_at_ms: nowMs,
      expires_at_ms: nowMs + TOKEN_LIFETIME_MS,
      segment_index: 0,
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 0,
      reply_pages: 0,
      pagination_overlaps_reconciled: 0,
      records_retrieved_cumulative: 0,
      rolling_sha256: ZERO_SHA256,
      sample_identifiers: [],
      reply_count_mismatches: []
    };
  }

  const metadata = await dependencies.get_video(videoId, config.youtube, {
    max_elapsed_ms: remainingElapsed(clock, nowMs, maxElapsedMs)
  });
  const metadataVideo = isComplete(metadata.access_status) ? metadata.data : undefined;
  const currentProviderCount = metadataVideo?.statistics?.comment_count;
  baseState = {
    ...baseState,
    ...((currentProviderCount ?? baseState.provider_reported_comments) === undefined
      ? {}
      : { provider_reported_comments: currentProviderCount ?? baseState.provider_reported_comments })
  };

  const segment = await dependencies.get_segment({
    video: videoId,
    page_size: COMMENT_PAGE_SIZE,
    ...(resumeCursor === undefined ? {} : { cursor: resumeCursor })
  }, config.youtube, {
    ...runtime.segment,
    max_elapsed_ms: Math.min(
      runtime.segment?.max_elapsed_ms ?? maxElapsedMs,
      remainingElapsed(clock, nowMs, maxElapsedMs)
    ),
    now: runtime.segment?.now ?? clock
  });
  if (
    segment.video_id !== videoId ||
    segment.comments.some(({ video_id }) => video_id !== videoId)
  ) {
    throw new Error("YouTube audit segment video did not match the continuation chain");
  }
  const state = advanceYoutubeAuditState(
    baseState,
    segment.comments,
    {
      top_level_comments_retrieved: segment.top_level_comments_retrieved,
      replies_retrieved: segment.replies_retrieved,
      comment_thread_pages: segment.comment_thread_pages,
      reply_pages: segment.reply_pages,
      pagination_overlaps_reconciled: segment.pagination_overlaps_reconciled ?? 0,
      reply_count_mismatches: segment.reply_count_mismatches
    },
    segment.next_cursor ?? resumeCursor ?? { thread_offset: 0, top_level_emitted: false }
  );

  const mismatchBlock = state.reply_count_mismatches.length > 0;
  const paginationOverlapBoundary = state.pagination_overlaps_reconciled > 0;
  const apiReportedExhaustion =
    segment.access_status === "api_visible_complete" &&
    segment.exhausted &&
    segment.next_cursor === undefined;
  const terminalMismatchAfterTopLevelExhaustion =
    segment.access_status === "partial" &&
    segment.error === undefined &&
    segment.next_cursor === undefined &&
    segment.reply_count_mismatches.length > 0;
  const terminalOverlapAfterTopLevelExhaustion =
    segment.access_status === "partial" &&
    segment.exhausted &&
    segment.error === undefined &&
    segment.next_cursor === undefined &&
    paginationOverlapBoundary;
  const topLevelPaginationExhausted =
    apiReportedExhaustion ||
    terminalMismatchAfterTopLevelExhaustion ||
    terminalOverlapAfterTopLevelExhaustion;
  const apiVisibleComplete = apiReportedExhaustion && !mismatchBlock && !paginationOverlapBoundary;
  const terminalReplyMismatchBoundary =
    topLevelPaginationExhausted &&
    mismatchBlock &&
    segment.error === undefined &&
    segment.next_cursor === undefined;
  const terminalPaginationOverlapBoundary =
    topLevelPaginationExhausted &&
    paginationOverlapBoundary &&
    !mismatchBlock &&
    segment.error === undefined &&
    segment.next_cursor === undefined;
  const retryLater = segment.next_cursor !== undefined && segment.error?.retryable === true;
  const terminalAccessBoundary = ACCESS_BOUNDARIES.has(segment.access_status) && !retryLater;
  const restartRequired = segment.next_cursor !== undefined &&
    segment.error?.retryable === false &&
    !terminalAccessBoundary;
  const canAutoContinue =
    !apiVisibleComplete &&
    !terminalAccessBoundary &&
    !retryLater &&
    !restartRequired &&
    segment.error === undefined &&
    segment.next_cursor !== undefined;
  const canIssueContinuation = canAutoContinue || retryLater;

  let sample: YoutubeVideoCommunityAuditOutput["sample"];
  let sampleFailure: string | undefined;
  if (
    apiVisibleComplete ||
    terminalAccessBoundary ||
    terminalReplyMismatchBoundary ||
    terminalPaginationOverlapBoundary
  ) {
    if (state.sample_identifiers.length === 0) {
      sample = { mode: "all", corpus_count: 0, sampled_count: 0, comments: [] };
    } else {
      const sampleIds = state.sample_identifiers
        .slice(0, state.records_retrieved_cumulative <= DEFAULT_ANALYSIS_LIMIT
          ? DEFAULT_ANALYSIS_LIMIT
          : state.analysis_limit);
      const refetched = await dependencies.get_comments_by_ids(
        videoId,
        sampleIds,
        config.youtube,
        {
          max_elapsed_ms: remainingElapsed(clock, nowMs, maxElapsedMs),
          now: clock
        }
      );
      const returnedIds = refetched.comments.map(({ comment_id }) => comment_id);
      if (
        refetched.access_status !== "api_visible_complete" ||
        returnedIds.length !== sampleIds.length ||
        new Set(returnedIds).size !== sampleIds.length ||
        sampleIds.some((id) => !returnedIds.includes(id))
      ) {
        sampleFailure =
          "The deterministic analysis sample could not be completely refetched; restart the audit from the video ID.";
      } else {
        const comments = chronological(refetched.comments);
        sample = {
          mode: state.records_retrieved_cumulative <= DEFAULT_ANALYSIS_LIMIT
            ? "all"
            : "deterministic_hash_chronological",
          corpus_count: state.records_retrieved_cumulative,
          sampled_count: comments.length,
          comments
        };
      }
    }
  }

  const completionState = apiVisibleComplete && sampleFailure === undefined
    ? "api_visible_complete" as const
    : (
      terminalAccessBoundary ||
      terminalReplyMismatchBoundary ||
      terminalPaginationOverlapBoundary
    ) && sampleFailure === undefined
      ? "completed_with_access_boundary" as const
      : "incomplete" as const;
  let continuationToken: string | undefined;
  let continuationStateTooLarge = false;
  if (canIssueContinuation) {
    try {
      continuationToken = encodeYoutubeAuditContinuation(state, config.continuation_secret);
    } catch (error) {
      if (error instanceof Error && error.message === "YouTube audit continuation token is too large") {
        continuationStateTooLarge = true;
      } else {
        throw error;
      }
    }
  }
  const blockers = completionState === "incomplete"
    ? uniqueStrings([
        ...(mismatchBlock ? ["One or more YouTube reply counts did not reconcile."] : []),
        ...(canAutoContinue
          ? ["Additional API-visible YouTube comment or reply pages remain retrievable."]
          : []),
        ...(retryLater
          ? ["YouTube returned a retryable provider boundary; retry later with the continuation token."]
          : []),
        ...(restartRequired
          ? ["The YouTube audit cannot safely continue from this cursor; restart the audit from the video ID."]
          : []),
        ...(continuationStateTooLarge
          ? ["The exact continuation state exceeded the safe stateless-token limit; this audit cannot continue automatically."]
          : []),
        ...(sampleFailure === undefined ? [] : [sampleFailure]),
        ...(!canAutoContinue && !retryLater && !mismatchBlock && !restartRequired &&
          !continuationStateTooLarge && sampleFailure === undefined
          ? ["The YouTube video corpus did not reach a terminal complete or access-boundary state."]
          : [])
      ])
    : [];
  const providerReportedCount = state.provider_reported_comments;
  const insufficientDepth = !segment.exhausted &&
    !terminalReplyMismatchBoundary &&
    !terminalPaginationOverlapBoundary &&
    providerReportedCount !== undefined &&
    BigInt(providerReportedCount) >= 300n &&
    state.records_retrieved_cumulative < 300;
  const countMismatch = apiVisibleComplete &&
    providerReportedCount !== undefined &&
    BigInt(providerReportedCount) !== BigInt(state.records_retrieved_cumulative);
  const limitations = uniqueStrings([
    ...metadata.limitations,
    ...segment.limitations,
    ...(countMismatch ? [PROVIDER_COUNT_MISMATCH_LIMITATION] : []),
    ...(terminalReplyMismatchBoundary ? [TERMINAL_REPLY_MISMATCH_LIMITATION] : []),
    ...(paginationOverlapBoundary ? [TERMINAL_PAGINATION_OVERLAP_LIMITATION] : []),
    ...(continuationStateTooLarge
      ? ["The exact continuation state exceeded the safe stateless-token limit."]
      : []),
    ...(sampleFailure === undefined ? [] : [sampleFailure])
  ]);
  const sampleComments = sample?.comments ?? [];
  const returnedTopLevel = sampleComments.filter(({ is_reply }) => !is_reply).length;
  const returnedReplies = sampleComments.length - returnedTopLevel;
  const resultAccessStatus: AccessStatus = completionState === "api_visible_complete"
    ? "api_visible_complete"
    : terminalAccessBoundary
      ? segment.access_status
      : retryLater
        ? segment.access_status
        : "partial";

  return youtubeVideoCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: new Date(nowMs).toISOString(),
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
    analysis_limit: state.analysis_limit,
    segment_index: state.segment_index,
    metadata_access_status: metadata.access_status,
    ...(metadata.error === undefined ? {} : { metadata_error: metadata.error }),
    ...(metadataVideo?.title === undefined ? {} : { title: metadataVideo.title }),
    ...(metadataVideo?.channel_id === undefined ? {} : { channel_id: metadataVideo.channel_id }),
    ...(metadataVideo?.channel_title === undefined
      ? {}
      : { channel_title: metadataVideo.channel_title }),
    ...(metadataVideo?.published_at === undefined ? {} : { published_at: metadataVideo.published_at }),
    ...(metadataVideo?.duration === undefined ? {} : { duration: metadataVideo.duration }),
    ...(metadataVideo?.statistics === undefined ? {} : { statistics: metadataVideo.statistics }),
    ...(providerReportedCount === undefined ? {} : { provider_reported_comments: providerReportedCount }),
    access_status: resultAccessStatus,
    extraction_coverage: completionState === "api_visible_complete"
      ? "api_visible_complete"
      : completionState === "completed_with_access_boundary"
        ? "completed_with_access_boundary"
        : "partial",
    limitations,
    ...(segment.error === undefined ? {} : { error: segment.error }),
    top_level_comments_retrieved_this_call: segment.top_level_comments_retrieved,
    replies_retrieved_this_call: segment.replies_retrieved,
    records_retrieved_this_call: segment.comments.length,
    comment_thread_pages_this_call: segment.comment_thread_pages,
    reply_pages_this_call: segment.reply_pages,
    top_level_comments_retrieved_cumulative: state.top_level_comments_retrieved,
    replies_retrieved_cumulative: state.replies_retrieved,
    records_retrieved_cumulative: state.records_retrieved_cumulative,
    comment_thread_pages_cumulative: state.comment_thread_pages,
    reply_pages_cumulative: state.reply_pages,
    records_returned_for_analysis: sampleComments.length,
    top_level_records_returned_for_analysis: returnedTopLevel,
    reply_records_returned_for_analysis: returnedReplies,
    reply_count_mismatches: state.reply_count_mismatches,
    corpus_rolling_sha256: state.rolling_sha256,
    insufficient_depth: insufficientDepth,
    continuation_recommended: canAutoContinue && continuationToken !== undefined,
    ...(continuationToken === undefined ? {} : { continuation_token: continuationToken }),
    ...(sample === undefined ? {} : { sample }),
    receipt: {
      completion_state: completionState,
      synthesis_lock: completionState === "incomplete" ? "block" : "pass",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: topLevelPaginationExhausted,
      replies_reconciled:
        !mismatchBlock && (apiVisibleComplete || terminalPaginationOverlapBoundary),
      query_bounded_comments_used_as_corpus: false,
      blockers
    }
  });
}

function readNow(now: (() => number) | undefined): number {
  const value = now?.() ?? Date.now();
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("YouTube video community audit clock is invalid");
  }
  return value;
}

function readMaxElapsed(value: number | undefined): number {
  const maxElapsedMs = value ?? DEFAULT_MAX_ELAPSED_MS;
  if (!Number.isSafeInteger(maxElapsedMs) || maxElapsedMs < 1) {
    throw new Error("YouTube video community audit elapsed-time budget is invalid");
  }
  return maxElapsedMs;
}

function remainingElapsed(now: () => number, startedAt: number, maximum: number): number {
  const current = readNow(now);
  if (current < startedAt) {
    throw new Error("YouTube video community audit clock moved backwards");
  }
  return Math.max(1, maximum - (current - startedAt));
}

function validateSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < MIN_SECRET_BYTES) {
    throw new Error("YouTube audit continuation secret must contain at least 32 UTF-8 bytes");
  }
}

function isComplete(status: AccessStatus): boolean {
  return status === "complete" || status === "api_visible_complete";
}

function chronological(comments: readonly YoutubeComment[]): YoutubeComment[] {
  return [...comments].sort((left, right) =>
    left.published_at.localeCompare(right.published_at) ||
    left.comment_id.localeCompare(right.comment_id)
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
