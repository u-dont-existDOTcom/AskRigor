import { afterEach, describe, expect, it, vi } from "vitest";

import type { YoutubeComment } from "@askrigor/sources";
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
      CONFIG.youtube
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
      undefined
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

  it("blocks terminal reply-count mismatches instead of issuing a complete receipt", async () => {
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
      get_comments_by_ids: vi.fn()
    };

    const result = await auditYoutubeVideoCommunity(
      { video_id_or_url: VIDEO_ID },
      CONFIG,
      { now: () => NOW, dependencies }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      reply_count_mismatches: [{ expected: 1, retrieved: 0 }],
      continuation_recommended: false,
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        replies_reconciled: false,
        blockers: [expect.stringContaining("reply counts")]
      }
    });
    expect(result.continuation_token).toBeUndefined();
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
