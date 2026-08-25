import {
  createCandidateScreeningWorkPackage,
  projectDiscussionCoverageReceipt,
  youtubeDiscussionActionOutputSchema,
  youtubeTranscriptActionOutputSchema,
  type YoutubeDiscussionActionOutput,
  type YoutubeTranscriptActionOutput,
  type CandidateScreeningSubmission,
  type ResearchCandidateDiscoveryState
} from "../../apps/research-mcp/src/index.js";
import type { YoutubeComment } from "@askrigor/sources";

export const TRANSCRIPT_HANDLE = `art1_${"T".repeat(32)}`;
export const DISCUSSION_HANDLE = `arh1_${"D".repeat(32)}`;

export function screeningSubmissionFor(
  discovery: ResearchCandidateDiscoveryState,
  selectedVideoIds: readonly string[] = discovery.candidates
    .filter(({ program_description_status }) => program_description_status !== "NOT_DESCRIBED")
    .slice(0, 2)
    .map(({ video_id }) => video_id)
): CandidateScreeningSubmission {
  const workPackage = createCandidateScreeningWorkPackage(discovery);
  const selected = new Set(selectedVideoIds);
  return {
    package_version: workPackage.package_version,
    discovery_digest: workPackage.discovery_digest,
    decisions: discovery.candidates.map((candidate) => ({
      video_id: candidate.video_id,
      materiality: candidate.program_description_status === "NOT_DESCRIBED"
        ? "NOT_MATERIAL"
        : "MATERIAL",
      redundancy: "DISTINCT",
      selection_status: selected.has(candidate.video_id)
        ? "SELECTED"
        : "NOT_SELECTED",
      rationale: selected.has(candidate.video_id)
        ? "Material, nonredundant source selected for bounded per-video depth work."
        : "Candidate screened but not selected for the current bounded depth set."
    }))
  };
}

export function transcriptOutput(
  videoId: string,
  options: {
    continuationHandle?: string;
    nextHandle?: string;
    pageCount?: number;
    cumulative?: number;
    returned?: number;
    complete?: boolean;
    retryable?: boolean;
    timestamped?: boolean;
  } = {}
): YoutubeTranscriptActionOutput {
  const complete = options.complete ?? options.nextHandle === undefined;
  const returned = options.returned ?? 1;
  const cumulative = options.cumulative ?? returned;
  const pageCount = options.pageCount ?? 1;
  const retryable = options.retryable ?? false;
  const timestamped = options.timestamped ?? true;
  return youtubeTranscriptActionOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_transcript",
    primary_identifier: videoId,
    retrieved_at: "2026-08-23T00:10:00.000Z",
    query: { video_id: videoId, language_code: "en" },
    source_identity: {
      canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
      title: "Depth fixture",
      authors_or_channel: ["Fixture channel"]
    },
    pagination: {
      ...(options.continuationHandle === undefined
        ? {}
        : { cursor: options.continuationHandle }),
      page_size: 200,
      returned,
      exhausted: complete,
      ...(options.nextHandle === undefined
        ? {}
        : { next_cursor: options.nextHandle })
    },
    access_status: retryable
      ? "rate_limited"
      : complete
        ? "api_visible_complete"
        : "partial",
    limitations: retryable ? ["Retryable fixture boundary."] : [],
    ...(retryable
      ? {
        error: {
          code: "youtube_rate_limited",
          message: "Retry later",
          retryable: true
        }
      }
      : {}),
    raw_metadata: {
      access_method: "youtube_innertube_unofficial",
      provider_reported_segments: cumulative,
      snapshot_sha256: "a".repeat(64),
      selected_track: {
        language_code: "en",
        language_name: "English",
        is_auto_generated: false
      },
      available_tracks: [{
        language_code: "en",
        language_name: "English",
        is_auto_generated: false
      }]
    },
    data: retryable ? [] : Array.from({ length: returned }, (_, index) => ({
      index: cumulative - returned + index,
      start_ms: 1_000 * (cumulative - returned + index),
      duration_ms: 900,
      text: `Segment ${cumulative - returned + index}`,
      language_code: "en",
      ...(timestamped
        ? {
          timestamp_url:
            `https://www.youtube.com/watch?v=${videoId}&t=${cumulative - returned + index}s`
        }
        : {})
    })),
    coverage_receipt: {
      source_video_id: videoId,
      access_status: retryable
        ? "rate_limited"
        : complete
          ? "api_visible_complete"
          : "partial",
      pagination: {
        chain_started_at_first_page: true,
        cursor_chain_reconciled: true,
        page_count: pageCount,
        records_returned_cumulative: cumulative,
        exhausted: complete,
        next_cursor_present: options.nextHandle !== undefined
      },
      selected_track: {
        language_code: "en",
        language_name: "English",
        is_auto_generated: false
      },
      timestamp_provenance: timestamped
        ? "segment_timestamp_urls"
        : "unavailable",
      error_retryable: retryable
    }
  });
}

export function discussionOutput(
  videoId: string,
  options: {
    segmentIndex?: number;
    cumulative?: number;
    continuationHandle?: string;
    complete?: boolean;
    retryable?: boolean;
    terminal?: boolean;
    errorCode?: string;
    comments?: YoutubeComment[];
  } = {}
): YoutubeDiscussionActionOutput {
  const complete = options.complete ?? options.continuationHandle === undefined;
  const terminal = options.terminal ?? false;
  const retryable = options.retryable ?? false;
  const cumulative = options.cumulative ?? 1;
  const segmentIndex = options.segmentIndex ?? 0;
  const fixtureIndex = videoId === "XpZHKGGCK-o"
    ? 0
    : videoId === "0sZEvvPWq88"
      ? 1
      : 2;
  const base = {
    provider: "youtube" as const,
    record_type: "youtube_video_community_audit" as const,
    retrieved_at: "2026-08-23T00:20:00.000Z",
    video_id: videoId,
    canonical_url: `https://www.youtube.com/watch?v=${videoId}`,
    analysis_limit: 500,
    segment_index: segmentIndex,
    metadata_access_status: "api_visible_complete" as const,
    channel_id: `UC${"0".repeat(21)}${fixtureIndex}`,
    access_status: retryable
      ? "rate_limited" as const
      : terminal
        ? "comments_disabled" as const
        : complete
          ? "api_visible_complete" as const
          : "partial" as const,
    extraction_coverage: terminal
      ? "completed_with_access_boundary" as const
      : complete
        ? "api_visible_complete" as const
        : "partial" as const,
    limitations: retryable || terminal ? ["Bounded fixture condition."] : [],
    ...(options.errorCode === undefined && !retryable
      ? {}
      : {
        error: {
          code: options.errorCode ?? "youtube_rate_limited",
          message: "Fixture provider boundary",
          retryable
        }
      }),
    top_level_comments_retrieved_this_call: retryable ? 0 : 1,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: retryable ? 0 : 1,
    comment_thread_pages_this_call: retryable ? 0 : 1,
    reply_pages_this_call: 0,
    top_level_comments_retrieved_cumulative: cumulative,
    replies_retrieved_cumulative: 0,
    records_retrieved_cumulative: cumulative,
    comment_thread_pages_cumulative: Math.max(1, segmentIndex + 1),
    reply_pages_cumulative: 0,
    records_returned_for_analysis: Math.min(cumulative, 500),
    top_level_records_returned_for_analysis: Math.min(cumulative, 500),
    reply_records_returned_for_analysis: 0,
    reply_count_mismatches: [],
    corpus_rolling_sha256: segmentIndex.toString(16).padStart(64, "b").slice(-64),
    insufficient_depth: false,
    continuation_recommended: !complete && !terminal,
    ...(options.continuationHandle === undefined
      ? {}
      : { continuation_token: options.continuationHandle }),
    receipt: {
      completion_state: terminal
        ? "completed_with_access_boundary" as const
        : complete
          ? "api_visible_complete" as const
          : "incomplete" as const,
      synthesis_lock: complete || terminal ? "pass" as const : "block" as const,
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: complete || terminal,
      replies_reconciled: complete || terminal,
      query_bounded_comments_used_as_corpus: false as const,
      blockers: complete || terminal ? [] : ["Continue the discussion chain."]
    }
  };
  return youtubeDiscussionActionOutputSchema.parse({
    ...base,
    ...(options.comments === undefined
      ? {}
      : {
          sample: {
            mode: "all",
            corpus_count: options.comments.length,
            sampled_count: options.comments.length,
            comments: options.comments
          }
        }),
    coverage_receipt: projectDiscussionCoverageReceipt(base)
  });
}
