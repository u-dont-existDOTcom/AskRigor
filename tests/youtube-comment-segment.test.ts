import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getYoutubeCommentSegment,
  getYoutubeCommentsByIds
} from "../packages/sources/src/youtube-comment-segment.js";

const YOUTUBE = { apiKey: "recorded-youtube-key" };
const fixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resumable YouTube comment segments", () => {
  it("treats an exhausted empty API-visible corpus as complete", async () => {
    const emptyPage = await fixture("comment-threads-empty.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(emptyPage, { status: 200 })));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      exhausted: true,
      comments: [],
      top_level_comments_retrieved: 0,
      replies_retrieved: 0,
      comment_thread_pages: 1,
      reply_pages: 0,
      reply_count_mismatches: [],
      limitations: []
    });
    expect(result.next_cursor).toBeUndefined();
  });

  it("stops at a committed provider-request boundary and returns the exact resume cursor", async () => {
    const [threadPage, replyPage] = await Promise.all([
      fixture("comment-threads-page-1.json"),
      fixture("comments-top-1-page-1.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(threadPage, { status: 200 });
      }
      if (url.pathname.endsWith("/comments")) {
        return new Response(replyPage, { status: 200 });
      }
      throw new Error(`Unexpected request: ${url.pathname}${url.search}`);
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", page_size: 20 },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      video_id: "XpZHKGGCK-o",
      access_status: "partial",
      exhausted: false,
      top_level_comments_retrieved: 1,
      replies_retrieved: 2,
      comment_thread_pages: 1,
      reply_pages: 1,
      next_cursor: {
        thread_offset: 0,
        top_level_emitted: true,
        current_parent_id: "UgxTop00000000000000001",
        current_expected_replies: 3,
        current_replies_retrieved: 2,
        reply_page_token: "reply-top-1-page-2"
      }
    });
    expect(result.comments.map(({ comment_id }) => comment_id)).toEqual([
      "UgxTop00000000000000001",
      "UgxReply0000000000000001",
      "UgxReply0000000000000002"
    ]);
    expect(result.next_cursor?.page_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.searchParams.has("searchTerms")).toBe(false);
  });

  it("resumes a reply page and reaches top-level exhaustion without duplicates", async () => {
    const fixtures = new Map<string, string>([
      ["thread:first", await fixture("comment-threads-page-1.json")],
      ["thread:thread-page-2", await fixture("comment-threads-page-2.json")],
      ["reply:UgxTop00000000000000001:first", await fixture("comments-top-1-page-1.json")],
      [
        "reply:UgxTop00000000000000001:reply-top-1-page-2",
        await fixture("comments-top-1-page-2.json")
      ],
      ["reply:UgxTop00000000000000002:first", await fixture("comments-top-2-page-1.json")]
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const key = url.pathname.endsWith("/commentThreads")
        ? `thread:${url.searchParams.get("pageToken") ?? "first"}`
        : `reply:${url.searchParams.get("parentId")}:${url.searchParams.get("pageToken") ?? "first"}`;
      const body = fixtures.get(key);
      if (body === undefined) throw new Error(`Unexpected request: ${key}`);
      return new Response(body, { status: 200 });
    }));

    const first = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", page_size: 20 },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );
    expect(first.next_cursor).toBeDefined();

    const second = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", cursor: first.next_cursor, page_size: 20 },
      YOUTUBE,
      { max_provider_requests: 20, max_elapsed_ms: 15_000, now: () => 1 }
    );

    const allIds = [...first.comments, ...second.comments].map(({ comment_id }) => comment_id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toEqual([
      "UgxTop00000000000000001",
      "UgxReply0000000000000001",
      "UgxReply0000000000000002",
      "UgxReply0000000000000003",
      "UgxTop00000000000000002",
      "UgxReply0000000000000004"
    ]);
    expect(second).toMatchObject({
      access_status: "api_visible_complete",
      exhausted: true,
      top_level_comments_retrieved: 1,
      replies_retrieved: 2,
      comment_thread_pages: 2,
      reply_pages: 2,
      reply_count_mismatches: []
    });
    expect(second.next_cursor).toBeUndefined();
    expect(requests).toHaveLength(6);
    expect(requests.filter((url) => url.pathname.endsWith("/commentThreads")))
      .toSatisfy((urls: URL[]) => urls.every((url) => !url.searchParams.has("searchTerms")));
  });

  it("processes every thread from a fetched page without refetching that page", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return Response.json({
        pageInfo: { totalResults: 2, resultsPerPage: 2 },
        items: [0, 1].map((index) => ({
          id: `thread-${index}`,
          snippet: {
            videoId: "XpZHKGGCK-o",
            topLevelComment: {
              id: `top-${index}`,
              snippet: {
                videoId: "XpZHKGGCK-o",
                textDisplay: `Top level ${index}`,
                likeCount: 0,
                publishedAt: "2025-02-01T10:00:00Z",
                updatedAt: "2025-02-01T10:00:00Z"
              }
            },
            totalReplyCount: 0
          }
        }))
      });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", page_size: 20 },
      YOUTUBE,
      { max_provider_requests: 50, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      exhausted: true,
      top_level_comments_retrieved: 2,
      comment_thread_pages: 1
    });
    expect(result.comments.map(({ comment_id }) => comment_id)).toEqual(["top-0", "top-1"]);
    expect(requests).toHaveLength(1);
  });

  it("fails closed when a refetched thread page changed before resume", async () => {
    const threadPage = await fixture("comment-threads-page-1.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(threadPage, { status: 200 })));

    const result = await getYoutubeCommentSegment(
      {
        video: "XpZHKGGCK-o",
        page_size: 20,
        cursor: {
          page_fingerprint: "0".repeat(64),
          thread_offset: 0,
          top_level_emitted: true,
          current_parent_id: "UgxTop00000000000000001",
          current_expected_replies: 3,
          current_replies_retrieved: 2,
          reply_page_token: "reply-top-1-page-2"
        }
      },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      exhausted: false,
      comments: [],
      error: {
        code: "youtube_comment_segment_changed",
        retryable: false
      }
    });
  });

  it("fails closed when a resume cursor no longer matches its video thread", async () => {
    const threadPage = await fixture("comment-threads-page-1.json");
    const fetchMock = vi.fn(async () => new Response(threadPage, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getYoutubeCommentSegment(
      {
        video: "XpZHKGGCK-o",
        cursor: {
          thread_offset: 0,
          top_level_emitted: true,
          current_parent_id: "UgxDifferentParent",
          current_expected_replies: 3,
          current_replies_retrieved: 0
        }
      },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "error",
      comments: [],
      error: { code: "youtube_comment_segment_cursor_invalid", retryable: false }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps comments-disabled as a terminal provider boundary without leaking provider text", async () => {
    const providerError = await fixture("error-comments-disabled.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(providerError, { status: 403 })));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "comments_disabled",
      exhausted: false,
      error: {
        code: "youtube_comments_disabled",
        message: "YouTube comments are disabled",
        http_status: 403,
        retryable: false
      }
    });
    expect(result.next_cursor).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("refetches requested comment IDs in 100-record batches and keeps them video-scoped", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `UgxRequested${String(index).padStart(4, "0")}`);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const requested = url.searchParams.get("id")?.split(",") ?? [];
      return Response.json({
        pageInfo: { totalResults: requested.length, resultsPerPage: requested.length },
        items: requested.map((id, index) => ({
          id,
          snippet: {
            videoId: "XpZHKGGCK-o",
            ...(index === 0 ? {} : { parentId: `${id}-parent` }),
            textDisplay: `comment ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }))
      });
    }));

    const result = await getYoutubeCommentsByIds("XpZHKGGCK-o", ids, YOUTUBE);

    expect(result.access_status).toBe("api_visible_complete");
    expect(result.comments.map(({ comment_id }) => comment_id)).toEqual(ids);
    expect(requests).toHaveLength(2);
    expect(requests.map((url) => url.searchParams.get("id")!.split(",").length)).toEqual([100, 1]);
    expect(requests.every((url) => url.searchParams.get("part") === "snippet")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(YOUTUBE.apiKey);
  });

  it("preserves committed records and the resume cursor on a retryable mid-segment boundary", async () => {
    const [threadPage, quotaError] = await Promise.all([
      fixture("comment-threads-page-1.json"),
      fixture("error-quota-exceeded.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/commentThreads")
        ? new Response(threadPage, { status: 200 })
        : new Response(quotaError, { status: 403 });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      comments: [{ comment_id: "UgxTop00000000000000001" }],
      top_level_comments_retrieved: 1,
      replies_retrieved: 0,
      next_cursor: {
        thread_offset: 0,
        top_level_emitted: true,
        current_parent_id: "UgxTop00000000000000001",
        current_replies_retrieved: 0
      },
      error: {
        code: "youtube_rate_limited",
        http_status: 403,
        retryable: true
      }
    });
  });

  it("rejects a comment-ID refetch response from a different video", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      const id = url.searchParams.get("id")!;
      return Response.json({
        pageInfo: { totalResults: 1, resultsPerPage: 1 },
        items: [{
          id,
          snippet: {
            videoId: "Different000",
            textDisplay: "wrong scope",
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }]
      });
    }));

    const result = await getYoutubeCommentsByIds("XpZHKGGCK-o", ["UgxRequested0000"], YOUTUBE);

    expect(result).toMatchObject({ access_status: "error", comments: [] });
    expect(result.limitations).toContain("YouTube returned an invalid comment-ID refetch response.");
    expect(JSON.stringify(result)).not.toContain(YOUTUBE.apiKey);
  });
});
