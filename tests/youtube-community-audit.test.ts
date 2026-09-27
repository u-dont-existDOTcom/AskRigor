import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { YoutubeComment } from "@askrigor/sources";
import {
  allocateYoutubeCommunityCommentElapsedMs,
  auditYoutubeCommunity,
  sampleWithinResponseBudget,
  sampleYoutubeComments
} from "../apps/research-mcp/src/youtube-community-audit.js";
import { compactYoutubeCommunityAuditForMcp } from "../apps/research-mcp/src/youtube-mcp-sample.js";

const YOUTUBE = { apiKey: "recorded-youtube-key" };
const fixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YouTube community audit", () => {
  it("splits one compound-call comment deadline across every selected video", () => {
    expect(allocateYoutubeCommunityCommentElapsedMs(15_000, 1)).toBe(15_000);
    expect(allocateYoutubeCommunityCommentElapsedMs(15_000, 2)).toBe(7_500);
    expect(allocateYoutubeCommunityCommentElapsedMs(15_000, 3)).toBe(5_000);
  });

  it("deduplicates directional discovery and completes unfiltered comments plus replies in one audit", async () => {
    const [
      searchBody,
      videoBody,
      threadsPageOne,
      threadsPageTwo,
      firstParentPageOne,
      firstParentPageTwo,
      secondParentPageOne
    ] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-found.json"),
      fixture("comment-threads-page-1.json"),
      fixture("comment-threads-page-2.json"),
      fixture("comments-top-1-page-1.json"),
      fixture("comments-top-1-page-2.json"),
      fixture("comments-top-2-page-1.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/search")) return new Response(searchBody, { status: 200 });
      if (url.pathname.endsWith("/videos")) return new Response(videoBody, { status: 200 });
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(
          url.searchParams.get("pageToken") === "thread-page-2"
            ? threadsPageTwo
            : threadsPageOne,
          { status: 200 }
        );
      }
      if (url.pathname.endsWith("/comments")) {
        if (url.searchParams.get("parentId") === "UgxTop00000000000000002") {
          return new Response(secondParentPageOne, { status: 200 });
        }
        return new Response(
          url.searchParams.get("pageToken") === "reply-top-1-page-2"
            ? firstParentPageTwo
            : firstParentPageOne,
          { status: 200 }
        );
      }
      throw new Error(`Unexpected YouTube request: ${url.pathname}${url.search}`);
    }));

    const result = await auditYoutubeCommunity({
      research_question: "Which hip osteoarthritis treatment works in practice?",
      searches: [
        { direction: "general", query: "hip osteoarthritis treatment experience" },
        { direction: "benefit", query: "hip replacement helped my pain" }
      ],
      max_videos: 2,
      sample_comments_per_video: 20
    }, YOUTUBE);

    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_community_audit",
      access_status: "api_visible_complete",
      receipt: {
        completion_state: "api_visible_complete",
        synthesis_lock: "pass",
        searches_requested: 2,
        searches_completed: 2,
        selected_video_ids: ["XpZHKGGCK-o"],
        unfiltered_retrieval_attempted_for_all: true,
        replies_requested_for_all: true,
        pagination_exhausted_for_complete_videos: true,
        replies_reconciled_for_complete_videos: true,
        query_bounded_comments_used_as_corpus: false,
        blockers: []
      },
      videos: [{
        video_id: "XpZHKGGCK-o",
        directions: ["general", "benefit"],
        metadata_access_status: "api_visible_complete",
        comments_access_status: "api_visible_complete",
        manifest: {
          top_level_comments_retrieved: 2,
          expected_replies: 4,
          replies_retrieved: 4,
          total_comments_and_replies: 6,
          reply_count_mismatches: [],
          pages: { comment_threads: 2, replies: 3 },
          extraction_coverage: "api_visible_complete"
        },
        sample: {
          mode: "all",
          corpus_count: 6,
          sampled_count: 6,
          comments: expect.any(Array)
        },
        corpus_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      }]
    });

    expect(requests.filter(({ pathname }) => pathname.endsWith("/search"))).toHaveLength(2);
    expect(requests.filter(({ pathname }) => pathname.endsWith("/videos"))).toHaveLength(1);
    expect(requests.filter(({ pathname }) => pathname.endsWith("/commentThreads"))).toHaveLength(2);
    expect(requests.filter(({ pathname }) => pathname.endsWith("/comments"))).toHaveLength(3);
    expect(requests
      .filter(({ pathname }) => pathname.endsWith("/commentThreads"))
      .every(({ searchParams }) => !searchParams.has("searchTerms"))).toBe(true);
  });

  it("keeps a large three-video audit inside the MCP response budget with compact records", async () => {
    // Uncompacted, three samples of 500 records reached about 63,000 tokens:
    // the client truncated the result and the comments never reached the answer.
    const [searchBody, videoBody, threadsPageOne, threadsPageTwo, repliesOne, repliesTwo, repliesThree] =
      await Promise.all([
        fixture("search-page-1.json"),
        fixture("video-found.json"),
        fixture("comment-threads-page-1.json"),
        fixture("comment-threads-page-2.json"),
        fixture("comments-top-1-page-1.json"),
        fixture("comments-top-1-page-2.json"),
        fixture("comments-top-2-page-1.json")
      ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) return new Response(searchBody, { status: 200 });
      if (url.pathname.endsWith("/videos")) return new Response(videoBody, { status: 200 });
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(url.searchParams.get("pageToken") === "thread-page-2" ? threadsPageTwo : threadsPageOne,
          { status: 200 });
      }
      if (url.searchParams.get("parentId") === "UgxTop00000000000000002") return new Response(repliesThree, { status: 200 });
      return new Response(url.searchParams.get("pageToken") === "reply-top-1-page-2" ? repliesTwo : repliesOne,
        { status: 200 });
    }));
    const audited = await auditYoutubeCommunity({
      research_question: "Adults using sermorelin for sleep and digestion",
      searches: [{ direction: "general", query: "sermorelin sleep digestion experience" }],
      max_videos: 1,
      sample_comments_per_video: 20
    }, YOUTUBE);
    const videoIds = ["XpZHKGGCK-o", "dQw4w9WgXcQ", "abcdefghijk"];
    const large = {
      ...audited,
      videos: videoIds.map((videoId, video) => ({
        ...audited.videos[0]!,
        video_id: videoId,
        sample: {
          mode: "systematic_chronological" as const,
          corpus_count: 900,
          sampled_count: 500,
          comments: Array.from({ length: 500 }, (_, index): YoutubeComment => ({
            video_id: videoId,
            comment_id: `UgxV${video}c${String(index).padStart(4, "0")}`,
            parent_id: null,
            top_level_comment_id: `UgxV${video}c${String(index).padStart(4, "0")}`,
            is_reply: false,
            author_channel_id: `UC${String(video * 1000 + index).padStart(22, "0")}`,
            author_display_name: `@person${index}`,
            text: `I took it for ${index % 12 + 1} weeks; my sleep and my stomach changed in these ways. `.repeat(3),
            like_count: index % 7,
            published_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
            updated_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString()
          }))
        }
      })),
      receipt: { ...audited.receipt, selected_video_ids: videoIds }
    };
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeGreaterThan(200_000);

    const view = compactYoutubeCommunityAuditForMcp(large, 40_000, "MCP bounded sample.");
    const serialized = JSON.stringify(view);
    expect(Buffer.byteLength(serialized, "utf8")).toBeLessThanOrEqual(40_000);
    expect(serialized).not.toContain("@person");
    expect(serialized).not.toMatch(/"UC0{5}/u);
    expect(view.receipt).toEqual(large.receipt);
    expect(view.limitations).toContain("MCP bounded sample.");
    // Every video keeps the same number of records, so none drops out.
    const counts = view.videos.map((video) => video.sample!.comments.length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThan(20);
    view.videos.forEach((video, index) => {
      expect(video.manifest).toEqual(large.videos[index]!.manifest);
      expect(video.sample).toMatchObject({ mode: "deterministic_hash_chronological", corpus_count: 900 });
      expect(video.sample!.sampled_count).toBe(video.sample!.comments.length);
    });
  });

  it("returns a deterministic evenly spaced chronological sample", () => {
    const comments = Array.from({ length: 25 }, (_, index): YoutubeComment => ({
      video_id: "XpZHKGGCK-o",
      comment_id: `comment-${String(index).padStart(2, "0")}`,
      parent_id: null,
      top_level_comment_id: `comment-${String(index).padStart(2, "0")}`,
      is_reply: false,
      text: `Comment ${index}`,
      like_count: index,
      published_at: `2025-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      updated_at: `2025-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`
    })).reverse();

    expect(sampleYoutubeComments(comments, 20).map(({ comment_id }) => comment_id)).toEqual([
      "comment-00", "comment-01", "comment-02", "comment-03", "comment-05",
      "comment-06", "comment-07", "comment-08", "comment-10", "comment-11",
      "comment-12", "comment-13", "comment-15", "comment-16", "comment-17",
      "comment-18", "comment-20", "comment-21", "comment-22", "comment-24"
    ]);
  });

  it("shrinks a video's systematic sample until it fits the response budget", () => {
    const comments = Array.from({ length: 300 }, (_, index): YoutubeComment => ({
      video_id: "XpZHKGGCK-o",
      comment_id: `comment-${String(index).padStart(3, "0")}`,
      parent_id: null,
      top_level_comment_id: `comment-${String(index).padStart(3, "0")}`,
      is_reply: false,
      text: `Comment ${index} ${"long firsthand report ".repeat(20)}`,
      like_count: index,
      published_at: new Date(Date.UTC(2025, 0, 1) + index * 3_600_000).toISOString(),
      updated_at: new Date(Date.UTC(2025, 0, 1) + index * 3_600_000).toISOString()
    }));
    const budget = 15_000;
    const sampled = sampleWithinResponseBudget(comments, 250, budget);
    const size = sampled.reduce((total, comment) => total + JSON.stringify(comment).length + 1, 0);

    expect(size).toBeLessThanOrEqual(budget);
    expect(sampled.length).toBeGreaterThan(10);
    expect(sampled.length).toBeLessThan(250);
    // Still spread across the whole period, not the earliest comments only.
    expect(sampled[0]!.comment_id).toBe("comment-000");
    expect(sampled.at(-1)!.comment_id).toBe("comment-299");
    expect(sampleWithinResponseBudget(comments.slice(0, 5), 250, budget)).toHaveLength(5);
  });

  it("treats an exhausted zero-candidate search as terminal without inventing signal", async () => {
    const searchBody = await fixture("search-empty.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(searchBody, { status: 200 })));

    const result = await auditYoutubeCommunity({
      research_question: "Recorded question with no matching videos",
      searches: [{ direction: "general", query: "deliberately absent recorded topic" }]
    }, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "complete",
      videos: [],
      receipt: {
        completion_state: "complete_no_candidates",
        synthesis_lock: "pass",
        selected_video_ids: [],
        unfiltered_retrieval_attempted_for_all: true,
        query_bounded_comments_used_as_corpus: false,
        blockers: []
      }
    });
  });

  it("records disabled comments as a terminal access boundary", async () => {
    const [searchBody, videoBody, disabledBody] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-found.json"),
      fixture("error-comments-disabled.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/search")) return new Response(searchBody, { status: 200 });
      if (url.pathname.endsWith("/videos")) return new Response(videoBody, { status: 200 });
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(disabledBody, { status: 403 });
      }
      throw new Error(`Unexpected YouTube request: ${url.pathname}${url.search}`);
    }));

    const result = await auditYoutubeCommunity({
      research_question: "Recorded question with a disabled community layer",
      searches: [{ direction: "harm", query: "recorded subject adverse experience" }],
      max_videos: 1
    }, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "comments_disabled",
      receipt: {
        completion_state: "completed_with_access_boundary",
        synthesis_lock: "pass",
        unfiltered_retrieval_attempted_for_all: true,
        replies_requested_for_all: true,
        query_bounded_comments_used_as_corpus: false,
        blockers: []
      },
      videos: [{
        video_id: "XpZHKGGCK-o",
        comments_access_status: "comments_disabled"
      }]
    });
  });

  it("keeps a labeled partial corpus in evidence review when pagination is unfinished", async () => {
    const [searchBody, videoBody, threadsPageOne] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("video-found.json"),
      fixture("comment-threads-page-1.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/search")) return new Response(searchBody, { status: 200 });
      if (url.pathname.endsWith("/videos")) return new Response(videoBody, { status: 200 });
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(threadsPageOne, { status: 200 });
      }
      throw new Error(`Unexpected YouTube request: ${url.pathname}${url.search}`);
    }));

    const result = await auditYoutubeCommunity({
      research_question: "Recorded question whose comment corpus exceeds its test budget",
      searches: [{ direction: "no_effect", query: "recorded subject no improvement" }],
      max_videos: 1
    }, YOUTUBE, { budgets: { maxCommentThreadPages: 1 } });

    expect(requests.filter(({ pathname }) => pathname.endsWith("/commentThreads"))).toHaveLength(1);
    expect(result).toMatchObject({
      access_status: "partial",
      receipt: {
        completion_state: "incomplete",
        synthesis_lock: "block",
        unfiltered_retrieval_attempted_for_all: true,
        pagination_exhausted_for_complete_videos: true,
        replies_reconciled_for_complete_videos: true,
        query_bounded_comments_used_as_corpus: false,
        blockers: [expect.stringContaining("comments ended with partial")]
      },
      videos: [{
        comments_access_status: "partial",
        manifest: {
          extraction_coverage: "partial",
          total_comments_and_replies: expect.any(Number)
        },
        sample: {
          corpus_count: expect.any(Number),
          sampled_count: expect.any(Number),
          comments: expect.any(Array)
        },
        corpus_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        limitations: expect.arrayContaining([
          expect.stringMatching(/partial corpus.*eligible for bounded evidence review/i)
        ])
      }]
    });
    expect(result.videos[0]?.sample?.comments.length).toBeGreaterThan(0);
  });
});
