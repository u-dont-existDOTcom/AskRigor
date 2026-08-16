import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { YoutubeComment } from "@askrigor/sources";
import { boundYoutubeAuditForAction } from
  "../apps/research-mcp/src/actions/research-output.js";
import {
  auditYoutubeVideoCommunity,
  youtubeVideoCommunityAuditInputSchema,
  type YoutubeVideoCommunityAuditDependencies
} from "../apps/research-mcp/src/youtube-video-community-audit.js";

const NOW = 1_786_579_200_000;
const SECRET = "s".repeat(32);
const CONFIG = {
  youtube: { apiKey: "recorded-youtube-key" },
  continuation_secret: SECRET
};
const VIDEO_ID = "XpZHKGGCK-o";

const makeComments = (count: number, start = 0): YoutubeComment[] =>
  Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      video_id: VIDEO_ID,
      comment_id: `comment-${String(index).padStart(4, "0")}`,
      parent_id: null,
      top_level_comment_id: `comment-${String(index).padStart(4, "0")}`,
      is_reply: false,
      text: `Recorded comment ${index}`,
      like_count: index,
      published_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
      updated_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString()
    };
  });

const videoEnvelope = (providerCount: string) => ({
  provider: "youtube",
  record_type: "youtube_video",
  primary_identifier: VIDEO_ID,
  retrieved_at: "2026-08-13T00:00:00.000Z",
  source_identity: { canonical_url: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
  pagination: { returned: 1, exhausted: true },
  access_status: "api_visible_complete" as const,
  limitations: [],
  data: {
    video_id: VIDEO_ID,
    title: "Recorded hip video",
    channel_id: "UC0123456789abcdefghijkl",
    channel_title: "Recorded health channel",
    published_at: "2025-01-02T03:04:05Z",
    duration: "PT12M34S",
    statistics: { comment_count: providerCount }
  }
});

const completeDependencies = (
  comments: YoutubeComment[],
  providerCount = String(comments.length)
): YoutubeVideoCommunityAuditDependencies => ({
  get_video: vi.fn(async () => videoEnvelope(providerCount)),
  get_segment: vi.fn(async () => ({
    video_id: VIDEO_ID,
    comments,
    top_level_comments_retrieved: comments.length,
    replies_retrieved: 0,
    comment_thread_pages: Math.ceil(comments.length / 20),
    reply_pages: 0,
    reply_count_mismatches: [],
    exhausted: true,
    access_status: "api_visible_complete" as const,
    limitations: []
  })),
  get_comments_by_ids: vi.fn(async (_videoId, ids) => ({
    access_status: "api_visible_complete" as const,
    comments: comments.filter(({ comment_id }) => ids.includes(comment_id)),
    limitations: []
  }))
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("adaptive per-video YouTube community audit", () => {
  it("returns all 399 records with explicit provider, retrieved, and analyzed counts", async () => {
    const dependencies = completeDependencies(makeComments(399));

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_video_community_audit",
      video_id: VIDEO_ID,
      canonical_url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: "Recorded hip video",
      channel_title: "Recorded health channel",
      provider_reported_comments: "399",
      top_level_comments_retrieved_cumulative: 399,
      replies_retrieved_cumulative: 0,
      records_retrieved_cumulative: 399,
      records_returned_for_analysis: 399,
      top_level_records_returned_for_analysis: 399,
      reply_records_returned_for_analysis: 0,
      continuation_recommended: false,
      insufficient_depth: false,
      extraction_coverage: "api_visible_complete",
      receipt: {
        completion_state: "api_visible_complete",
        synthesis_lock: "pass",
        chain_started_at_first_page: true,
        top_level_pagination_exhausted: true,
        replies_reconciled: true,
        query_bounded_comments_used_as_corpus: false,
        blockers: []
      }
    });
    expect(result.sample).toMatchObject({
      mode: "all",
      corpus_count: 399,
      sampled_count: 399
    });
    expect(result.sample?.comments).toHaveLength(399);
    expect(result.continuation_token).toBeUndefined();
  });

  it("returns a deterministic chronological 500-record sample from a complete larger corpus", async () => {
    const comments = makeComments(800);
    const dependencies = completeDependencies(comments);

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID, analysis_limit: 500 },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result.records_retrieved_cumulative).toBe(800);
    expect(result.records_returned_for_analysis).toBe(500);
    expect(result.sample).toMatchObject({
      mode: "deterministic_hash_chronological",
      corpus_count: 800,
      sampled_count: 500
    });
    expect(result.sample?.comments).toHaveLength(500);
    expect(result.sample?.comments).toEqual(
      [...result.sample!.comments].sort((left, right) =>
        left.published_at.localeCompare(right.published_at) ||
        left.comment_id.localeCompare(right.comment_id)
      )
    );
    expect(dependencies.get_comments_by_ids).toHaveBeenCalledWith(
      VIDEO_ID,
      expect.arrayContaining([expect.any(String)]),
      CONFIG.youtube,
      { max_elapsed_ms: 15_000, now: expect.any(Function) }
    );
  });

  it("deterministically bounds an oversized terminal sample without changing retrieval truth", async () => {
    const comments = makeComments(500).map((comment, index) => ({
      ...comment,
      text: `${comment.text} ${String(index).padStart(3, "0")} ${"evidence ".repeat(120)}`
    }));
    const original = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies: completeDependencies(comments) }
    );

    expect(Buffer.byteLength(JSON.stringify(original), "utf8")).toBeGreaterThan(60_000);
    const first = boundYoutubeAuditForAction(original, 60_000);
    const second = boundYoutubeAuditForAction(original, 60_000);

    expect(Buffer.byteLength(JSON.stringify(first), "utf8")).toBeLessThanOrEqual(60_000);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sample?.comments.map(({ comment_id }) => comment_id)).toEqual(
      second.sample?.comments.map(({ comment_id }) => comment_id)
    );
    expect(first.records_retrieved_cumulative).toBe(original.records_retrieved_cumulative);
    expect(first.top_level_comments_retrieved_cumulative).toBe(
      original.top_level_comments_retrieved_cumulative
    );
    expect(first.replies_retrieved_cumulative).toBe(original.replies_retrieved_cumulative);
    expect(first.corpus_rolling_sha256).toBe(original.corpus_rolling_sha256);
    expect(first.reply_count_mismatches).toEqual(original.reply_count_mismatches);
    expect(first.access_status).toBe(original.access_status);
    expect(first.extraction_coverage).toBe(original.extraction_coverage);
    expect(first.receipt).toEqual(original.receipt);
    expect(first.canonical_url).toBe(original.canonical_url);
    expect(first.sample?.corpus_count).toBe(original.sample?.corpus_count);
    expect(first.sample?.comments.length).toBeLessThan(original.sample!.comments.length);
    expect(first.records_returned_for_analysis).toBe(first.sample?.comments.length);
    expect(first.top_level_records_returned_for_analysis).toBe(
      first.sample?.comments.filter(({ is_reply }) => !is_reply).length
    );
    expect(first.reply_records_returned_for_analysis).toBe(
      first.sample?.comments.filter(({ is_reply }) => is_reply).length
    );
    expect(first.limitations).toContain(
      "The Custom GPT Action returned a deterministic transport-bounded analysis sample; retrieval coverage and corpus counts are reported separately."
    );
  });

  it("fails closed when fixed non-comment fields cannot fit the Action response ceiling", async () => {
    const original = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies: completeDependencies(makeComments(1)) }
    );
    const oversizedFixedEnvelope = {
      ...original,
      limitations: ["x".repeat(60_000)]
    };
    const receiptBefore = structuredClone(oversizedFixedEnvelope.receipt);

    expect(() => boundYoutubeAuditForAction(oversizedFixedEnvelope, 60_000))
      .toThrow(/cannot fit/i);
    expect(oversizedFixedEnvelope.receipt).toEqual(receiptBefore);
  });

  it("uses a lower analysis limit only after a complete corpus exceeds 500 records", async () => {
    const comments = makeComments(800);
    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID, analysis_limit: 5 },
      CONFIG,
      { now: () => NOW, dependencies: completeDependencies(comments) }
    );

    expect(result).toMatchObject({
      records_retrieved_cumulative: 800,
      records_returned_for_analysis: 5,
      sample: {
        mode: "deterministic_hash_chronological",
        corpus_count: 800,
        sampled_count: 5
      }
    });
  });

  it("shares one elapsed-time budget across metadata, acquisition, and terminal refetch", async () => {
    let clock = NOW;
    const comments = makeComments(1);
    const getVideo = vi.fn(async () => {
      clock += 4_000;
      return videoEnvelope("1");
    });
    const getSegment = vi.fn(async () => {
      clock += 8_000;
      return {
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 1,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: true,
        access_status: "api_visible_complete" as const,
        limitations: []
      };
    });
    const getCommentsByIds = vi.fn(async () => ({
      access_status: "api_visible_complete" as const,
      comments,
      limitations: []
    }));
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: getVideo,
      get_segment: getSegment,
      get_comments_by_ids: getCommentsByIds
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      {
        now: () => clock,
        max_elapsed_ms: 15_000,
        dependencies
      } as never
    );

    expect(result.receipt.synthesis_lock).toBe("pass");
    expect(getVideo).toHaveBeenCalledWith(
      VIDEO_ID,
      CONFIG.youtube,
      { max_elapsed_ms: 15_000 }
    );
    expect(getSegment).toHaveBeenCalledWith(
      { video: VIDEO_ID, page_size: 20 },
      CONFIG.youtube,
      expect.objectContaining({ max_elapsed_ms: 11_000, now: expect.any(Function) })
    );
    expect(getCommentsByIds).toHaveBeenCalledWith(
      VIDEO_ID,
      [comments[0]!.comment_id],
      CONFIG.youtube,
      { max_elapsed_ms: 3_000, now: expect.any(Function) }
    );
  });

  it("continues a partial chain, returns no premature sample, and completes on the next call", async () => {
    const firstComments = makeComments(200);
    const secondComments = makeComments(200, 200);
    const allComments = [...firstComments, ...secondComments];
    const getSegment = vi.fn(async (input: { cursor?: unknown }) => input.cursor === undefined
      ? {
          video_id: VIDEO_ID,
          comments: firstComments,
          top_level_comments_retrieved: 200,
          replies_retrieved: 0,
          comment_thread_pages: 10,
          reply_pages: 0,
          reply_count_mismatches: [],
          exhausted: false,
          next_cursor: { top_level_page_token: "page-11", thread_offset: 0, top_level_emitted: false },
          access_status: "partial" as const,
          limitations: ["Continue with next cursor."]
        }
      : {
          video_id: VIDEO_ID,
          comments: secondComments,
          top_level_comments_retrieved: 200,
          replies_retrieved: 0,
          comment_thread_pages: 10,
          reply_pages: 0,
          reply_count_mismatches: [],
          exhausted: true,
          access_status: "api_visible_complete" as const,
          limitations: []
        });
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: getSegment,
      get_comments_by_ids: vi.fn(async (_videoId, ids) => ({
        access_status: "api_visible_complete" as const,
        comments: allComments.filter(({ comment_id }) => ids.includes(comment_id)),
        limitations: []
      }))
    };

    const first = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(first).toMatchObject({
      access_status: "partial",
      records_retrieved_this_call: 200,
      records_retrieved_cumulative: 200,
      records_returned_for_analysis: 0,
      continuation_recommended: true,
      insufficient_depth: true,
      receipt: { completion_state: "incomplete", synthesis_lock: "block" }
    });
    expect(first.sample).toBeUndefined();
    expect(first.continuation_token).toEqual(expect.any(String));
    const payload = Buffer.from(first.continuation_token!.split(".")[0]!, "base64url").toString("utf8");
    expect(payload).not.toContain("Recorded comment");
    expect(payload).not.toContain(SECRET);

    const second = await auditYoutubeVideoCommunity(
      { continuation_token: first.continuation_token },
      CONFIG,
      { now: () => NOW + 1, dependencies }
    );

    expect(second).toMatchObject({
      records_retrieved_this_call: 200,
      records_retrieved_cumulative: 400,
      records_returned_for_analysis: 400,
      continuation_recommended: false,
      insufficient_depth: false,
      receipt: { completion_state: "api_visible_complete", synthesis_lock: "pass" }
    });
    expect(second.sample?.comments).toHaveLength(400);
    expect(getSegment).toHaveBeenNthCalledWith(
      2,
      {
        video: VIDEO_ID,
        page_size: 20,
        cursor: { top_level_page_token: "page-11", thread_offset: 0, top_level_emitted: false }
      },
      CONFIG.youtube,
      { max_elapsed_ms: 15_000, now: expect.any(Function) }
    );
  });

  it("reports provider-count disagreement literally without downgrading a complete API-visible corpus", async () => {
    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies: completeDependencies(makeComments(399), "900") }
    );

    expect(result).toMatchObject({
      provider_reported_comments: "900",
      records_retrieved_cumulative: 399,
      insufficient_depth: false,
      receipt: { completion_state: "api_visible_complete", synthesis_lock: "pass" }
    });
    expect(result.limitations).toContain(
      "YouTube provider metadata and the complete API-visible comment/reply corpus reported different counts."
    );
  });

  it.each([
    ["comments_disabled", "completed_with_access_boundary", "pass", false],
    ["rate_limited", "completed_with_access_boundary", "pass", false]
  ] as const)("treats %s as an explicit terminal access boundary", async (
    accessStatus,
    completionState,
    synthesisLock,
    continuationRecommended
  ) => {
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("399")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments: [],
        top_level_comments_retrieved: 0,
        replies_retrieved: 0,
        comment_thread_pages: 0,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: false,
        access_status: accessStatus,
        limitations: [`Boundary: ${accessStatus}`]
      })),
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: accessStatus,
      extraction_coverage: "completed_with_access_boundary",
      records_returned_for_analysis: 0,
      continuation_recommended: continuationRecommended,
      receipt: {
        completion_state: completionState,
        synthesis_lock: synthesisLock,
        top_level_pagination_exhausted: false,
        replies_reconciled: false,
        blockers: []
      }
    });
    expect(result.continuation_token).toBeUndefined();
    expect(dependencies.get_comments_by_ids).not.toHaveBeenCalled();
  });

  it("returns previously acquired records when a continuation reaches an access boundary", async () => {
    const comments = makeComments(2);
    const getSegment = vi.fn(async (input: { cursor?: unknown }) => input.cursor === undefined
      ? {
          video_id: VIDEO_ID,
          comments,
          top_level_comments_retrieved: 2,
          replies_retrieved: 0,
          comment_thread_pages: 1,
          reply_pages: 0,
          reply_count_mismatches: [],
          exhausted: false,
          next_cursor: {
            top_level_page_token: "next",
            thread_offset: 0,
            top_level_emitted: false
          },
          access_status: "partial" as const,
          limitations: ["Continue."]
        }
      : {
          video_id: VIDEO_ID,
          comments: [],
          top_level_comments_retrieved: 0,
          replies_retrieved: 0,
          comment_thread_pages: 0,
          reply_pages: 0,
          reply_count_mismatches: [],
          exhausted: false,
          access_status: "rate_limited" as const,
          limitations: ["YouTube rate limit reached."]
        });
    const getCommentsByIds = vi.fn(async () => ({
      access_status: "api_visible_complete" as const,
      comments,
      limitations: []
    }));
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: getSegment,
      get_comments_by_ids: getCommentsByIds
    };
    const first = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );
    const second = await auditYoutubeVideoCommunity(
      { continuation_token: first.continuation_token },
      CONFIG,
      { now: () => NOW + 1, dependencies }
    );

    expect(second).toMatchObject({
      access_status: "rate_limited",
      extraction_coverage: "completed_with_access_boundary",
      records_retrieved_cumulative: 2,
      records_returned_for_analysis: 2,
      continuation_recommended: false,
      sample: { mode: "all", corpus_count: 2, sampled_count: 2 },
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass"
      }
    });
    expect(second.sample?.comments).toEqual(comments);
    expect(getCommentsByIds).toHaveBeenCalledOnce();
  });

  it("blocks with restart instructions when a terminal sample cannot be refetched", async () => {
    const comments = makeComments(2);
    const dependencies = completeDependencies(comments);
    dependencies.get_comments_by_ids = vi.fn(async () => ({
      access_status: "partial" as const,
      comments: [],
      limitations: ["Sample unavailable."]
    }));

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      extraction_coverage: "partial",
      records_retrieved_cumulative: 2,
      records_returned_for_analysis: 0,
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        top_level_pagination_exhausted: true,
        replies_reconciled: true,
        blockers: [expect.stringMatching(/restart.*video/i)]
      }
    });
  });

  it("does not recommend an unretryable continuation cursor", async () => {
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments: [],
        top_level_comments_retrieved: 0,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: false,
        next_cursor: {
          page_fingerprint: "0".repeat(64),
          thread_offset: 0,
          top_level_emitted: false
        },
        access_status: "partial" as const,
        limitations: ["Thread page changed."],
        error: {
          code: "youtube_comment_segment_changed",
          message: "YouTube comment segment could not safely resume",
          retryable: false
        }
      })),
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      continuation_recommended: false,
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        blockers: [expect.stringMatching(/restart.*video/i)]
      }
    });
    expect(result.continuation_token).toBeUndefined();
  });

  it("retains counts but blocks synthesis when malformed upstream data follows a committed record", async () => {
    const comments = makeComments(1);
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 1,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 1,
        reply_count_mismatches: [],
        exhausted: false,
        next_cursor: {
          thread_offset: 0,
          top_level_emitted: true,
          current_parent_id: comments[0]!.comment_id,
          current_expected_replies: 1,
          current_replies_retrieved: 0
        },
        access_status: "partial" as const,
        limitations: ["YouTube comment segment could not be completed."],
        error: {
          code: "youtube_comment_segment_response_invalid",
          message: "YouTube comment segment could not safely resume",
          retryable: false
        }
      })),
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      records_retrieved_this_call: 1,
      records_retrieved_cumulative: 1,
      records_returned_for_analysis: 0,
      continuation_recommended: false,
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        blockers: [expect.stringMatching(/restart.*video/i)]
      }
    });
    expect(result.continuation_token).toBeUndefined();
    expect(result.sample).toBeUndefined();
  });

  it("pauses a retryable mid-segment boundary without auto-looping and preserves its token", async () => {
    const comments = makeComments(1);
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 1,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: false,
        next_cursor: {
          top_level_page_token: "retry-page",
          thread_offset: 0,
          top_level_emitted: false
        },
        access_status: "rate_limited" as const,
        limitations: ["YouTube rate limit reached."],
        error: {
          code: "youtube_rate_limited",
          message: "YouTube rate limit reached",
          retryable: true
        }
      })),
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: "rate_limited",
      records_retrieved_cumulative: 1,
      records_returned_for_analysis: 0,
      continuation_recommended: false,
      continuation_token: expect.any(String),
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        blockers: [expect.stringMatching(/retry later.*continuation token/i)]
      }
    });
    expect(result.sample).toBeUndefined();
  });

  it("returns retained evidence when a terminal boundary follows records in the same segment", async () => {
    const comments = makeComments(2);
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 2,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: false,
        next_cursor: {
          top_level_page_token: "blocked-page",
          thread_offset: 0,
          top_level_emitted: false
        },
        access_status: "comments_disabled" as const,
        limitations: ["YouTube comments are disabled."],
        error: {
          code: "youtube_comments_disabled",
          message: "YouTube comments are disabled",
          retryable: false
        }
      })),
      get_comments_by_ids: vi.fn(async () => ({
        access_status: "api_visible_complete" as const,
        comments,
        limitations: []
      }))
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: "comments_disabled",
      extraction_coverage: "completed_with_access_boundary",
      records_retrieved_cumulative: 2,
      records_returned_for_analysis: 2,
      continuation_recommended: false,
      sample: { mode: "all", corpus_count: 2, sampled_count: 2 },
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass"
      }
    });
    expect(result.continuation_token).toBeUndefined();
  });

  it("continues past a reply mismatch and carries it into the terminal blocked receipt", async () => {
    const firstComments = makeComments(1);
    const secondComments = makeComments(1, 1);
    const mismatch = {
      parent_comment_id: firstComments[0]!.comment_id,
      expected: 2,
      retrieved: 1
    };
    const getSegment = vi.fn(async (input: { cursor?: unknown }) => input.cursor === undefined
      ? {
          video_id: VIDEO_ID,
          comments: firstComments,
          top_level_comments_retrieved: 1,
          replies_retrieved: 0,
          comment_thread_pages: 1,
          reply_pages: 1,
          reply_count_mismatches: [mismatch],
          exhausted: false,
          next_cursor: {
            top_level_page_token: "next",
            thread_offset: 0,
            top_level_emitted: false
          },
          access_status: "partial" as const,
          limitations: ["Reply count mismatch."]
        }
      : {
          video_id: VIDEO_ID,
          comments: secondComments,
          top_level_comments_retrieved: 1,
          replies_retrieved: 0,
          comment_thread_pages: 1,
          reply_pages: 0,
          reply_count_mismatches: [],
          exhausted: true,
          access_status: "api_visible_complete" as const,
          limitations: []
        });
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("2")),
      get_segment: getSegment,
      get_comments_by_ids: vi.fn(async () => ({
        access_status: "api_visible_complete" as const,
        comments: [...firstComments, ...secondComments],
        limitations: []
      }))
    };

    const first = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );
    expect(first).toMatchObject({
      records_retrieved_cumulative: 1,
      reply_count_mismatches: [mismatch],
      continuation_recommended: true,
      receipt: { completion_state: "incomplete", synthesis_lock: "block" }
    });

    const second = await auditYoutubeVideoCommunity(
      { continuation_token: first.continuation_token },
      CONFIG,
      { now: () => NOW + 1, dependencies }
    );
    expect(second).toMatchObject({
      records_retrieved_cumulative: 2,
      records_returned_for_analysis: 2,
      reply_count_mismatches: [mismatch],
      continuation_recommended: false,
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass",
        top_level_pagination_exhausted: true,
        replies_reconciled: false,
        blockers: []
      }
    });
    expect(second.sample).toMatchObject({ mode: "all", corpus_count: 2, sampled_count: 2 });
    expect(second.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/retained sample is usable as bounded evidence/i)
    ]));
    expect(getSegment).toHaveBeenCalledTimes(2);
  });

  it("returns a blocking receipt instead of failing when exact continuation state is too large", async () => {
    const comments = makeComments(500);
    const mismatches = comments.map(({ comment_id }) => ({
      parent_comment_id: comment_id.padEnd(512, "x"),
      expected: Number.MAX_SAFE_INTEGER,
      retrieved: Number.MAX_SAFE_INTEGER
    }));
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("1000")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 500,
        replies_retrieved: 0,
        comment_thread_pages: 25,
        reply_pages: 0,
        reply_count_mismatches: mismatches,
        exhausted: false,
        next_cursor: {
          top_level_page_token: "next",
          thread_offset: 0,
          top_level_emitted: false
        },
        access_status: "partial" as const,
        limitations: ["Reply counts did not reconcile."]
      })),
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      records_retrieved_cumulative: 500,
      reply_count_mismatches: mismatches,
      continuation_recommended: false,
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        blockers: expect.arrayContaining([expect.stringMatching(/stateless-token limit/i)])
      }
    });
    expect(result.continuation_token).toBeUndefined();
  });

  it("returns bounded retained evidence for a source-shaped terminal reply mismatch", async () => {
    const comments = makeComments(20);
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("20")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 20,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 1,
        reply_count_mismatches: [{
          parent_comment_id: comments[0]!.comment_id,
          expected: 1,
          retrieved: 0
        }],
        exhausted: false,
        access_status: "partial" as const,
        limitations: ["Replies did not reconcile."]
      })),
      get_comments_by_ids: vi.fn(async () => ({
        access_status: "api_visible_complete" as const,
        comments,
        limitations: []
      }))
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      extraction_coverage: "completed_with_access_boundary",
      records_returned_for_analysis: 20,
      reply_count_mismatches: [{ expected: 1, retrieved: 0 }],
      continuation_recommended: false,
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass",
        top_level_pagination_exhausted: true,
        replies_reconciled: false,
        blockers: []
      }
    });
    expect(result.continuation_token).toBeUndefined();
    expect(result.sample).toMatchObject({ mode: "all", corpus_count: 20, sampled_count: 20 });
    expect(result.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/retained sample is usable as bounded evidence/i)
    ]));
  });

  it("passes bounded synthesis after reconciling moving provider pagination overlap", async () => {
    const comments = makeComments(3);
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("3")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 3,
        replies_retrieved: 0,
        comment_thread_pages: 2,
        reply_pages: 3,
        pagination_overlaps_reconciled: 1,
        reply_count_mismatches: [],
        exhausted: true,
        access_status: "partial" as const,
        limitations: [
          "YouTube pagination overlap was reconciled; this is not a stable complete snapshot."
        ]
      })),
      get_comments_by_ids: vi.fn(async () => ({
        access_status: "api_visible_complete" as const,
        comments,
        limitations: []
      }))
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      extraction_coverage: "completed_with_access_boundary",
      records_retrieved_cumulative: 3,
      records_returned_for_analysis: 3,
      continuation_recommended: false,
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass",
        top_level_pagination_exhausted: true,
        replies_reconciled: true,
        blockers: []
      }
    });
    expect(result.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/not a stable complete snapshot/i)
    ]));
  });

  it("carries a reconciled pagination boundary through a later terminal segment", async () => {
    const firstComments = makeComments(2);
    const secondComments = makeComments(1, 2);
    const getSegment = vi.fn(async (input: { cursor?: unknown }) => input.cursor === undefined
      ? {
          video_id: VIDEO_ID,
          comments: firstComments,
          top_level_comments_retrieved: 2,
          replies_retrieved: 0,
          comment_thread_pages: 2,
          reply_pages: 2,
          pagination_overlaps_reconciled: 1,
          reply_count_mismatches: [],
          exhausted: false,
          next_cursor: {
            top_level_page_token: "next",
            previous_top_level_page_sha256: [
              createHash("sha256").update("prior").digest("base64url")
            ],
            thread_offset: 0,
            top_level_emitted: false
          },
          access_status: "partial" as const,
          limitations: ["YouTube pagination overlap was reconciled."]
        }
      : {
          video_id: VIDEO_ID,
          comments: secondComments,
          top_level_comments_retrieved: 1,
          replies_retrieved: 0,
          comment_thread_pages: 1,
          reply_pages: 1,
          pagination_overlaps_reconciled: 0,
          reply_count_mismatches: [],
          exhausted: true,
          access_status: "api_visible_complete" as const,
          limitations: []
        });
    const dependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("3")),
      get_segment: getSegment,
      get_comments_by_ids: vi.fn(async () => ({
        access_status: "api_visible_complete" as const,
        comments: [...firstComments, ...secondComments],
        limitations: []
      }))
    };

    const first = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );
    expect(first).toMatchObject({
      continuation_recommended: true,
      receipt: { completion_state: "incomplete", synthesis_lock: "block" }
    });

    const second = await auditYoutubeVideoCommunity(
      { continuation_token: first.continuation_token },
      CONFIG,
      { now: () => NOW + 1, dependencies }
    );
    expect(second).toMatchObject({
      records_retrieved_cumulative: 3,
      records_returned_for_analysis: 3,
      extraction_coverage: "completed_with_access_boundary",
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass",
        top_level_pagination_exhausted: true,
        replies_reconciled: true
      }
    });
    expect(second.limitations).toEqual(expect.arrayContaining([
      expect.stringMatching(/moving provider pagination/i)
    ]));
  });

  it("rejects tampered, expired, wrong-video, changed-limit, and missing-secret chains", async () => {
    const comments = makeComments(10);
    const partialDependencies: YoutubeVideoCommunityAuditDependencies = {
      get_video: vi.fn(async () => videoEnvelope("400")),
      get_segment: vi.fn(async () => ({
        video_id: VIDEO_ID,
        comments,
        top_level_comments_retrieved: 10,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: false,
        next_cursor: { top_level_page_token: "next", thread_offset: 0, top_level_emitted: false },
        access_status: "partial" as const,
        limitations: []
      })),
      get_comments_by_ids: vi.fn()
    };
    const first = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID, analysis_limit: 100 },
      CONFIG,
      { now: () => NOW, dependencies: partialDependencies }
    );
    const token = first.continuation_token!;

    await expect(auditYoutubeVideoCommunity(
      { continuation_token: `${token}x` },
      CONFIG,
      { now: () => NOW + 1, dependencies: partialDependencies }
    )).rejects.toThrow(/invalid/i);
    await expect(auditYoutubeVideoCommunity(
      { continuation_token: token },
      CONFIG,
      { now: () => NOW + 3_600_000, dependencies: partialDependencies }
    )).rejects.toThrow(/expired/i);
    await expect(auditYoutubeVideoCommunity(
      { continuation_token: token, analysis_limit: 101 },
      CONFIG,
      { now: () => NOW + 1, dependencies: partialDependencies }
    )).rejects.toThrow(/analysis limit/i);
    await expect(auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      { ...CONFIG, continuation_secret: "short" },
      { now: () => NOW, dependencies: completeDependencies(makeComments(1)) }
    )).rejects.toThrow(/32/);

    const wrongVideoDependencies: YoutubeVideoCommunityAuditDependencies = {
      ...partialDependencies,
      get_segment: vi.fn(async () => ({
        video_id: "Different00",
        comments: [],
        top_level_comments_retrieved: 0,
        replies_retrieved: 0,
        comment_thread_pages: 1,
        reply_pages: 0,
        reply_count_mismatches: [],
        exhausted: true,
        access_status: "api_visible_complete" as const,
        limitations: []
      }))
    };
    await expect(auditYoutubeVideoCommunity(
      { continuation_token: token },
      CONFIG,
      { now: () => NOW + 1, dependencies: wrongVideoDependencies }
    )).rejects.toThrow(/video/i);
  });

  it("requires exactly one start video or continuation token", () => {
    expect(youtubeVideoCommunityAuditInputSchema.safeParse({}).success).toBe(false);
    expect(youtubeVideoCommunityAuditInputSchema.safeParse({
      video_id_or_url: VIDEO_ID,
      continuation_token: "token"
    }).success).toBe(false);
  });
});
