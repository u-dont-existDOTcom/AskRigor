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
  it("requests and validates the provider maximum of 100 top-level threads", async () => {
    const requests: URL[] = [];
    const threads = Array.from({ length: 100 }, (_, index) => ({
      id: `thread-${String(index).padStart(3, "0")}`,
      snippet: {
        videoId: "XpZHKGGCK-o",
        topLevelComment: {
          id: `top-${String(index).padStart(3, "0")}`,
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
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        return Response.json({
          pageInfo: { totalResults: 100, resultsPerPage: 100 },
          items: threads
        });
      }
      return Response.json({
        pageInfo: { totalResults: 0, resultsPerPage: 0 },
        items: []
      });
    }));

    const segments: Awaited<ReturnType<typeof getYoutubeCommentSegment>>[] = [];
    let cursor: Awaited<ReturnType<typeof getYoutubeCommentSegment>>["next_cursor"];
    do {
      const segment = await getYoutubeCommentSegment(
        {
          video: "XpZHKGGCK-o",
          ...(cursor === undefined ? {} : { cursor })
        },
        YOUTUBE,
        { max_provider_requests: 50, max_elapsed_ms: 15_000, now: () => 1 }
      );
      segments.push(segment);
      cursor = segment.next_cursor;
    } while (cursor !== undefined);

    expect(requests[0]!.searchParams.get("maxResults")).toBe("100");
    expect(requests.filter((url) => url.pathname.endsWith("/commentThreads")))
      .toSatisfy((urls: URL[]) => urls.every((url) =>
        url.searchParams.get("maxResults") === "100"
      ));
    expect(segments).toHaveLength(3);
    expect(segments.at(-1)).toMatchObject({
      access_status: "api_visible_complete",
      exhausted: true,
      reply_pages: 2
    });
    const comments = segments.flatMap((segment) => segment.comments);
    expect(comments).toHaveLength(100);
    expect(new Set(comments.map(({ comment_id }) => comment_id)).size).toBe(100);
    expect(comments.map(({ comment_id }) => comment_id)).toEqual(
      threads.map(({ snippet }) => snippet.topLevelComment.id)
    );
  });

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

  it("reconciles a repeated thread at an adjacent top-level page boundary", async () => {
    const thread = (id: string, replyCount: number) => ({
      id: `thread-${id}`,
      snippet: {
        videoId: "XpZHKGGCK-o",
        topLevelComment: {
          id,
          snippet: {
            videoId: "XpZHKGGCK-o",
            textDisplay: `Top level ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T10:00:00Z",
            updatedAt: "2025-02-01T10:00:00Z"
          }
        },
        totalReplyCount: replyCount
      }
    });
    const reply = (id: string, parentId: string) => ({
      id,
      snippet: {
        videoId: "XpZHKGGCK-o",
        parentId,
        textDisplay: `Reply ${id}`,
        likeCount: 0,
        publishedAt: "2025-02-01T11:00:00Z",
        updatedAt: "2025-02-01T11:00:00Z"
      }
    });
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        const secondPage = url.searchParams.get("pageToken") === "page-2";
        return Response.json({
          ...(secondPage ? {} : { nextPageToken: "page-2" }),
          pageInfo: { totalResults: 2, resultsPerPage: secondPage ? 2 : 1 },
          items: secondPage
            ? [thread("top-overlap", 1), thread("top-new", 0)]
            : [thread("top-overlap", 1)]
        });
      }
      const parentId = url.searchParams.get("parentId")!;
      return Response.json({
        pageInfo: { totalResults: parentId === "top-overlap" ? 1 : 0, resultsPerPage: 1 },
        items: parentId === "top-overlap" ? [reply("reply-overlap", parentId)] : []
      });
    }));

    const first = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );
    const second = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", cursor: first.next_cursor },
      YOUTUBE,
      { max_provider_requests: 10, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(first.comments.map(({ comment_id }) => comment_id)).toEqual([
      "top-overlap", "reply-overlap"
    ]);
    expect(second.comments.map(({ comment_id }) => comment_id)).toEqual(["top-new"]);
    expect(second).toMatchObject({
      access_status: "partial",
      exhausted: true,
      top_level_comments_retrieved: 1,
      replies_retrieved: 0,
      pagination_overlaps_reconciled: 1,
      limitations: [expect.stringMatching(/pagination.*overlap/i)]
    });
    expect(requests.filter((url) =>
      url.pathname.endsWith("/comments") &&
      url.searchParams.get("parentId") === "top-overlap"
    )).toHaveLength(1);
  });

  it("reconciles a repeated reply at an adjacent reply-page boundary", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        return Response.json({
          pageInfo: { totalResults: 1, resultsPerPage: 1 },
          items: [{
            id: "thread-reply-overlap",
            snippet: {
              videoId: "XpZHKGGCK-o",
              topLevelComment: {
                id: "top-replies",
                snippet: {
                  videoId: "XpZHKGGCK-o",
                  textDisplay: "Top level",
                  likeCount: 0,
                  publishedAt: "2025-02-01T10:00:00Z",
                  updatedAt: "2025-02-01T10:00:00Z"
                }
              },
              totalReplyCount: 3
            }
          }]
        });
      }
      const secondPage = url.searchParams.get("pageToken") === "reply-page-2";
      const ids = secondPage ? ["reply-2", "reply-3"] : ["reply-1", "reply-2"];
      return Response.json({
        ...(secondPage ? {} : { nextPageToken: "reply-page-2" }),
        pageInfo: { totalResults: 3, resultsPerPage: 2 },
        items: ids.map((id) => ({
          id,
          snippet: {
            videoId: "XpZHKGGCK-o",
            parentId: "top-replies",
            textDisplay: `Reply ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }))
      });
    }));

    const first = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
    );
    const second = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o", cursor: first.next_cursor },
      YOUTUBE,
      { max_provider_requests: 10, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(first.comments.map(({ comment_id }) => comment_id)).toEqual([
      "top-replies", "reply-1", "reply-2"
    ]);
    expect(second.comments.map(({ comment_id }) => comment_id)).toEqual(["reply-3"]);
    expect(second).toMatchObject({
      access_status: "partial",
      exhausted: true,
      top_level_comments_retrieved: 0,
      replies_retrieved: 1,
      reply_count_mismatches: [],
      pagination_overlaps_reconciled: 1,
      limitations: [expect.stringMatching(/pagination.*overlap/i)]
    });
    expect(requests).toHaveLength(4);
  });

  it("processes every thread from a fetched page without refetching that page", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/comments")) {
        return Response.json({
          pageInfo: { totalResults: 0, resultsPerPage: 0 },
          items: []
        });
      }
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
    expect(requests).toHaveLength(3);
    expect(requests.filter((url) => url.pathname.endsWith("/comments"))).toHaveLength(2);
  });

  it("probes replies even when the provider reports a stale zero total", async () => {
    let replyRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads")) {
        return Response.json({
          pageInfo: { totalResults: 1, resultsPerPage: 1 },
          items: [{
            id: "thread-stale-zero",
            snippet: {
              videoId: "XpZHKGGCK-o",
              topLevelComment: {
                id: "top-stale-zero",
                snippet: {
                  videoId: "XpZHKGGCK-o",
                  textDisplay: "Top level",
                  likeCount: 0,
                  publishedAt: "2025-02-01T10:00:00Z",
                  updatedAt: "2025-02-01T10:00:00Z"
                }
              },
              totalReplyCount: 0
            }
          }]
        });
      }
      replyRequests += 1;
      return Response.json({
        pageInfo: { totalResults: 1, resultsPerPage: 1 },
        items: [{
          id: "reply-hidden-by-stale-zero",
          snippet: {
            videoId: "XpZHKGGCK-o",
            parentId: "top-stale-zero",
            textDisplay: "Accessible reply",
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }]
      });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 5, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(replyRequests).toBe(1);
    expect(result.comments.map(({ comment_id }) => comment_id)).toEqual([
      "top-stale-zero",
      "reply-hidden-by-stale-zero"
    ]);
    expect(result).toMatchObject({
      access_status: "partial",
      exhausted: false,
      replies_retrieved: 1,
      reply_count_mismatches: [{
        parent_comment_id: "top-stale-zero",
        expected: 0,
        retrieved: 1
      }]
    });
  });

  it("stops a repeated reply-page token as a nonretryable malformed-provider boundary", async () => {
    const threadPage = await fixture("comment-threads-page-1.json");
    let replyRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(threadPage, { status: 200 });
      }
      replyRequests += 1;
      return Response.json({
        nextPageToken: "same-reply-page",
        pageInfo: { totalResults: 3, resultsPerPage: 0 },
        items: []
      });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 50, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(replyRequests).toBe(2);
    expect(result).toMatchObject({
      access_status: "partial",
      comments: [{ comment_id: "UgxTop00000000000000001" }],
      top_level_comments_retrieved: 1,
      next_cursor: {
        reply_page_token: "same-reply-page",
        current_parent_id: "UgxTop00000000000000001"
      },
      error: {
        code: "youtube_comment_segment_response_invalid",
        retryable: false
      }
    });
  });

  it("follows every accessible reply page even when the reported reply total is stale", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        return Response.json({
          pageInfo: { totalResults: 1, resultsPerPage: 1 },
          items: [{
            id: "thread-stale-count",
            snippet: {
              videoId: "XpZHKGGCK-o",
              topLevelComment: {
                id: "top-stale-count",
                snippet: {
                  videoId: "XpZHKGGCK-o",
                  textDisplay: "Top level",
                  likeCount: 0,
                  publishedAt: "2025-02-01T10:00:00Z",
                  updatedAt: "2025-02-01T10:00:00Z"
                }
              },
              totalReplyCount: 1
            }
          }]
        });
      }
      const secondPage = url.searchParams.get("pageToken") === "reply-page-2";
      return Response.json({
        ...(secondPage ? {} : { nextPageToken: "reply-page-2" }),
        pageInfo: { totalResults: 2, resultsPerPage: 1 },
        items: [{
          id: secondPage ? "reply-2" : "reply-1",
          snippet: {
            videoId: "XpZHKGGCK-o",
            parentId: "top-stale-count",
            textDisplay: secondPage ? "Second reply" : "First reply",
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }]
      });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 50, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result.comments.map(({ comment_id }) => comment_id)).toEqual([
      "top-stale-count", "reply-1", "reply-2"
    ]);
    expect(result).toMatchObject({
      access_status: "partial",
      exhausted: false,
      replies_retrieved: 2,
      reply_pages: 2,
      reply_count_mismatches: [{
        parent_comment_id: "top-stale-count",
        expected: 1,
        retrieved: 2
      }]
    });
    expect(requests).toHaveLength(3);
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

  it("preserves a terminal provider boundary after committing records in the same segment", async () => {
    const [threadPage, providerError] = await Promise.all([
      fixture("comment-threads-page-capacity-with-next.json"),
      fixture("error-comments-disabled.json")
    ]);
    let request = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      request += 1;
      return request === 1
        ? new Response(threadPage, { status: 200 })
        : new Response(providerError, { status: 403 });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 3, max_elapsed_ms: 15_000, now: () => 1 }
    );

    expect(result).toMatchObject({
      access_status: "comments_disabled",
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
        code: "youtube_comments_disabled",
        retryable: false
      }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("preserves committed records and cursor when a reply page is malformed", async () => {
    const threadPage = await fixture("comment-threads-page-1.json");
    let request = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      request += 1;
      return request === 1
        ? new Response(threadPage, { status: 200 })
        : Response.json({
            pageInfo: { totalResults: 1, resultsPerPage: 1 },
            items: [{
              id: "wrong-parent-reply",
              snippet: {
                videoId: "XpZHKGGCK-o",
                parentId: "different-parent",
                textDisplay: "Malformed relationship",
                likeCount: 0,
                publishedAt: "2025-02-01T11:00:00Z",
                updatedAt: "2025-02-01T11:00:00Z"
              }
            }]
          });
    }));

    const result = await getYoutubeCommentSegment(
      { video: "XpZHKGGCK-o" },
      YOUTUBE,
      { max_provider_requests: 3, max_elapsed_ms: 15_000, now: () => 1 }
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
        code: "youtube_comment_segment_response_invalid",
        retryable: false
      }
    });
  });

  it("keeps comment-ID refetch batches within YouTube's 50-ID filter ceiling", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `UgxRequested${String(index).padStart(4, "0")}`);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const requested = url.searchParams.get("id")?.split(",") ?? [];
      if (requested.length > 50) {
        return Response.json({
          error: {
            code: 400,
            errors: [{ reason: "invalidFilters" }],
            message: "The request contains an invalid combination of filters."
          }
        }, { status: 400 });
      }
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
    expect(requests).toHaveLength(3);
    expect(requests.map((url) => url.searchParams.get("id")!.split(",").length)).toEqual([50, 50, 1]);
    expect(requests.every((url) => url.searchParams.get("part") === "snippet")).toBe(true);
    expect(requests.every((url) => !url.searchParams.has("maxResults"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain(YOUTUBE.apiKey);
  });

  it("accepts the live comments.list ID-filter shape without pageInfo or snippet.videoId", async () => {
    const ids = ["UgxLiveShape0001", "UgxLiveShape0002"];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const requested = new URL(String(input)).searchParams.get("id")?.split(",") ?? [];
      return Response.json({
        kind: "youtube#commentListResponse",
        etag: "public-response-etag",
        items: requested.map((id) => ({
          kind: "youtube#comment",
          id,
          snippet: {
            textDisplay: `comment ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }))
      });
    }));

    const result = await getYoutubeCommentsByIds("XpZHKGGCK-o", ids, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      comments: [
        { comment_id: ids[0], video_id: "XpZHKGGCK-o" },
        { comment_id: ids[1], video_id: "XpZHKGGCK-o" }
      ],
      limitations: []
    });
  });

  it("isolates a missing sampled identifier without discarding accessible batch peers", async () => {
    const ids = [
      "UgxAvailable0001",
      "UgxMissing00002",
      "UgxAvailable0003",
      "UgxAvailable0004"
    ];
    const requests: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const requested = new URL(String(input)).searchParams.get("id")?.split(",") ?? [];
      requests.push(requested);
      if (requested.includes(ids[1]!)) {
        return Response.json({
          error: {
            code: 404,
            errors: [{ reason: "commentNotFound" }],
            message: "A requested comment was not found."
          }
        }, { status: 404 });
      }
      return Response.json({
        items: requested.map((id) => ({
          id,
          snippet: {
            videoId: "XpZHKGGCK-o",
            textDisplay: `comment ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }))
      });
    }));

    const result = await getYoutubeCommentsByIds("XpZHKGGCK-o", ids, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "partial",
      comments: [
        { comment_id: ids[0] },
        { comment_id: ids[2] },
        { comment_id: ids[3] }
      ],
      limitations: ["YouTube no longer exposed every requested sampled comment identifier."]
    });
    expect(requests).toEqual([
      ids,
      ids.slice(0, 2),
      ids.slice(0, 1),
      ids.slice(1, 2),
      ids.slice(2)
    ]);
  });

  it("bounds missing-ID isolation by an explicit provider-request budget", async () => {
    const ids = ["UgxMissing00001", "UgxMissing00002"];
    const requests: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const requested = new URL(String(input)).searchParams.get("id")?.split(",") ?? [];
      requests.push(requested);
      return Response.json({
        error: {
          code: 404,
          errors: [{ reason: "commentNotFound" }],
          message: "A requested comment was not found."
        }
      }, { status: 404 });
    }));

    const result = await getYoutubeCommentsByIds(
      "XpZHKGGCK-o",
      ids,
      YOUTUBE,
      { max_provider_requests: 1 }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      comments: [],
      limitations: [expect.stringMatching(/provider-request budget/i)]
    });
    expect(requests).toEqual([ids]);
  });

  it("refetches provider-valid dotted reply IDs", async () => {
    const id = "UgxRequested.replyPart";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{
        id,
        snippet: {
          videoId: "XpZHKGGCK-o",
          parentId: "UgxTop",
          textDisplay: "reply",
          likeCount: 0,
          publishedAt: "2025-02-01T11:00:00Z",
          updatedAt: "2025-02-01T11:00:00Z"
        }
      }]
    })));

    const result = await getYoutubeCommentsByIds("XpZHKGGCK-o", [id], YOUTUBE);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      comments: [{ comment_id: id, parent_id: "UgxTop", is_reply: true }],
      limitations: []
    });
  });

  it("stops multi-batch comment-ID refetch at its shared elapsed-time budget", async () => {
    const ids = Array.from({ length: 101 }, (_, index) =>
      `UgxBudgeted${String(index).padStart(4, "0")}`
    );
    let clock = 0;
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const requested = url.searchParams.get("id")?.split(",") ?? [];
      clock = 10;
      return Response.json({
        pageInfo: { totalResults: requested.length, resultsPerPage: requested.length },
        items: requested.map((id) => ({
          id,
          snippet: {
            videoId: "XpZHKGGCK-o",
            textDisplay: `comment ${id}`,
            likeCount: 0,
            publishedAt: "2025-02-01T11:00:00Z",
            updatedAt: "2025-02-01T11:00:00Z"
          }
        }))
      });
    }));

    const result = await getYoutubeCommentsByIds(
      "XpZHKGGCK-o",
      ids,
      YOUTUBE,
      { max_elapsed_ms: 5, now: () => clock }
    );

    expect(result).toMatchObject({
      access_status: "partial",
      comments: expect.any(Array),
      limitations: [expect.stringContaining("elapsed-time budget")]
    });
    expect(result.comments).toHaveLength(50);
    expect(requests).toHaveLength(1);
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
      access_status: "rate_limited",
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
