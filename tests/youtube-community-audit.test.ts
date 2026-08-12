import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { YoutubeComment } from "@askrigor/sources";
import {
  auditYoutubeCommunity,
  sampleYoutubeComments
} from "../apps/research-mcp/src/youtube-community-audit.js";

const YOUTUBE = { apiKey: "recorded-youtube-key" };
const fixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YouTube community audit", () => {
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

  it("blocks synthesis when a selected corpus stops before top-level pagination exhausts", async () => {
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
        comments_access_status: "partial"
      }]
    });
    expect(result.videos[0]).not.toHaveProperty("manifest");
    expect(result.videos[0]).not.toHaveProperty("sample");
    expect(result.videos[0]).not.toHaveProperty("corpus_sha256");
  });
});
