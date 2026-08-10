import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getYoutubeComments,
  getYoutubeVideo,
  parseYoutubeVideoId,
  searchYoutube,
  searchYoutubeComments
} from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");
const youtubeConfig = { apiKey: "fixture-youtube-key" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("YouTube discovery", () => {
  it.each([
    "XpZHKGGCK-o",
    "https://youtu.be/XpZHKGGCK-o",
    "https://www.youtube.com/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com/shorts/XpZHKGGCK-o"
  ])("accepts the supported video input shape %s", (input) => {
    expect(parseYoutubeVideoId(input)).toBe("XpZHKGGCK-o");
  });

  it.each([
    "XpZHKGGCK-o/",
    "https://youtu.be/XpZHKGGCK-o/extra",
    "https://youtu.be/XpZHKGGCK-o?x=1",
    "http://youtu.be/XpZHKGGCK-o",
    "https://www.youtube.com/watch?v=XpZHKGGCK-o&v=other",
    "https://www.youtube.com/embed/XpZHKGGCK-o",
    "https://www.youtube.com/shorts/XpZHKGGCK-o?x=1",
    "https://youtube.com/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com.evil.test/watch?v=XpZHKGGCK-o",
    "https://user:pass@www.youtube.com/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com:444/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com/watch?v=XpZHKGGCK%2Do",
    "https://www.youtube.com/watch?v=%",
    " https://www.youtube.com/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com/watch?v=XpZHKGGCK-o ",
    "HTTPS://www.youtube.com/watch?v=XpZHKGGCK-o",
    "https://WWW.YOUTUBE.COM/watch?v=XpZHKGGCK-o",
    "https://www.youtube.com/watch?v=XpZHKGGCK-o&",
    "https://www.youtube.com/watch?v=XpZHKGGCK-o#",
    "https://www.youtube.com\\watch?v=XpZHKGGCK-o",
    "https://youtu.be/XpZHKGGCK-o/../XpZHKGGCK-o",
    "https://www.youtube.com:443/watch?v=XpZHKGGCK-o",
    "not-a-video-id"
  ])("rejects hostile or malformed video input %s", (input) => {
    expect(parseYoutubeVideoId(input)).toBeUndefined();
  });

  it("returns the missing-key envelope before any search request and never leaks the key", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await searchYoutube({ query: "recorded subject" }, { apiKey: "   " });

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_search_result",
      access_status: "inaccessible",
      error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
      data: []
    });
    expect(JSON.stringify(result)).not.toContain("fixture-youtube-key");
  });

  it("preserves opaque search page tokens and normalizes only documented search metadata", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(await fixture("search-page-1.json"), { status: 200 });
    }));

    const result = await searchYoutube({
      query: "recorded subject",
      pageSize: 1,
      cursor: "prior+/opaque-token"
    }, youtubeConfig);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.origin).toBe("https://www.googleapis.com");
    expect(requests[0]!.pathname).toBe("/youtube/v3/search");
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      part: "snippet",
      type: "video",
      q: "recorded subject",
      maxResults: "1",
      pageToken: "prior+/opaque-token",
      key: "fixture-youtube-key"
    });
    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_search_result",
      query: { query: "recorded subject" },
      pagination: {
        cursor: "prior+/opaque-token",
        next_cursor: "opaque+/next-token",
        page_size: 1,
        returned: 1,
        exhausted: false
      },
      access_status: "complete",
      raw_metadata: { total_results: 2 },
      data: [{
        video_id: "XpZHKGGCK-o",
        channel_id: "UC0123456789abcdefghijkl",
        title: "Recorded video title",
        description: "Recorded video description",
        published_at: "2025-01-02T03:04:05Z"
      }]
    });
    expect(JSON.stringify(result)).not.toContain("fixture-youtube-key");
  });

  it("reports a successful zero-hit search as complete rather than an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("search-empty.json"), { status: 200 }
    )));

    const result = await searchYoutube({ query: "no recorded result", pageSize: 10 }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "complete",
      pagination: { page_size: 10, returned: 0, exhausted: true },
      raw_metadata: { total_results: 0 },
      data: []
    });
    expect(result.error).toBeUndefined();
  });

  it("accepts a provider-valid partial final search page below the requested maximum", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("search-partial-final.json"), { status: 200 }
    )));

    const result = await searchYoutube({ query: "recorded subject", pageSize: 5 }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "complete",
      pagination: { page_size: 5, returned: 1, exhausted: true },
      raw_metadata: { total_results: 2 },
      data: [{ video_id: "XpZHKGGCK-o", title: "Recorded final page video" }]
    });
  });

  it("rejects an impossible search continuation token rather than reporting completeness", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      kind: "youtube#searchListResponse",
      nextPageToken: "impossible-next-page",
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{
        kind: "youtube#searchResult",
        id: { kind: "youtube#video", videoId: "XpZHKGGCK-o" },
        snippet: { publishedAt: "2025-01-02T03:04:05Z" }
      }]
    }), { status: 200 })));

    const result = await searchYoutube({ query: "recorded subject", pageSize: 1 }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: []
    });
  });

  it("treats malformed search payloads as errors rather than complete results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      kind: "youtube#searchListResponse",
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{ id: { kind: "youtube#channel", channelId: "UCbad" } }]
    }), { status: 200 })));

    const result = await searchYoutube({ query: "recorded subject" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid", message: "YouTube response was invalid" },
      data: []
    });
  });

  it("rejects a wrong top-level search resource kind with an otherwise valid result", async () => {
    const response = JSON.parse(await fixture("search-page-1.json")) as Record<string, unknown>;
    response.kind = "youtube#playlistListResponse";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

    const result = await searchYoutube({ query: "recorded subject", pageSize: 1 }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: []
    });
  });

  it.each([
    ["wrong search-result resource kind", {
      kind: "youtube#searchListResponse",
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{
        kind: "youtube#searchResult",
        id: { kind: "youtube#video", videoId: "XpZHKGGCK-o" },
        snippet: { publishedAt: "2025-01-02T03:04:05Z" }
      }]
    }, "youtube#channel"],
    ["malformed search timestamp", {
      kind: "youtube#searchListResponse",
      pageInfo: { totalResults: 1, resultsPerPage: 1 },
      items: [{
        kind: "youtube#searchResult",
        id: { kind: "youtube#video", videoId: "XpZHKGGCK-o" },
        snippet: { publishedAt: "not-a-timestamp" }
      }]
    }, undefined]
  ])("rejects a %s rather than reporting a complete search", async (_name, base, wrongKind) => {
    const response = structuredClone(base);
    if (wrongKind !== undefined) response.items[0]!.kind = wrongKind;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

    const result = await searchYoutube({ query: "recorded subject" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: []
    });
  });

  it("maps a structured quota error to rate_limited without exposing provider text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { errors: [{ reason: "quotaExceeded", message: "provider-secret" }] }
    }), { status: 403 })));

    const result = await searchYoutube({ query: "recorded subject" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "rate_limited",
      error: { code: "youtube_rate_limited", message: "YouTube rate limit reached", http_status: 403 }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("keeps a search 404 as a sanitized search failure rather than a video not-found result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 404 })));

    const result = await searchYoutube({ query: "recorded subject" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_request_failed", message: "YouTube request failed", http_status: 404 },
      data: []
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("retrieves one video with lossless documented metadata", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(await fixture("video-found.json"), { status: 200 });
    }));

    const result = await getYoutubeVideo("https://www.youtube.com/watch?v=XpZHKGGCK-o", youtubeConfig);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.pathname).toBe("/youtube/v3/videos");
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      part: "snippet,contentDetails,statistics,status",
      id: "XpZHKGGCK-o",
      key: "fixture-youtube-key"
    });
    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_video",
      primary_identifier: "XpZHKGGCK-o",
      source_identity: {
        canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
        title: "Recorded video title"
      },
      pagination: { returned: 1, exhausted: true },
      access_status: "api_visible_complete",
      data: {
        video_id: "XpZHKGGCK-o",
        channel_id: "UC0123456789abcdefghijkl",
        title: "Recorded video title",
        description: "Recorded video description",
        published_at: "2025-01-02T03:04:05Z",
        duration: "PT12M34S",
        statistics: {
          view_count: "12345678901234567890",
          like_count: "42",
          comment_count: "7"
        },
        tags: ["recorded", "fixture"],
        live_broadcast_content: "none",
        embeddable: true,
        privacy_status: "public"
      }
    });
  });

  it("marks a confirmed 404 video response as not_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { errors: [{ reason: "videoNotFound", message: "provider-secret" }] }
    }), { status: 404 })));

    const result = await getYoutubeVideo("XpZHKGGCK-o", youtubeConfig);

    expect(result).toMatchObject({
      access_status: "not_found",
      error: { code: "youtube_video_not_found", message: "YouTube video was not found", http_status: 404 },
      data: {}
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it.each([
    ["unstructured", "missing"],
    ["malformed", "{not-json"]
  ])("keeps a %s 404 video response as an explicit error", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 404 })));

    const result = await getYoutubeVideo("XpZHKGGCK-o", youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_request_failed", message: "YouTube request failed", http_status: 404 },
      data: {}
    });
    expect(JSON.stringify(result)).not.toContain(body);
  });

  it("does not pretend an empty API response proves a video is absent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("video-empty.json"), { status: 200 }
    )));

    const result = await getYoutubeVideo("XpZHKGGCK-o", youtubeConfig);

    expect(result).toMatchObject({
      access_status: "inaccessible",
      error: { code: "youtube_video_not_visible", message: "YouTube did not expose the requested video" },
      data: {}
    });
    expect(result.limitations).toContain(
      "YouTube returned no API-visible video for this identifier; it may be deleted, private, restricted, or otherwise unavailable."
    );
  });

  it.each([
    ["next-page token", (response: Record<string, unknown>) => { response.nextPageToken = "unexpected-next"; }],
    ["previous-page token", (response: Record<string, unknown>) => { response.prevPageToken = "unexpected-previous"; }],
    ["incoherent pageInfo total", (response: Record<string, unknown>) => { (response.pageInfo as Record<string, unknown>).totalResults = 2; }],
    ["mismatched requested video ID", (response: Record<string, unknown>) => { (response.items as Array<Record<string, unknown>>)[0]!.id = "dQw4w9WgXcQ"; }],
    ["wrong top-level video resource kind", (response: Record<string, unknown>) => { response.kind = "youtube#playlistListResponse"; }]
  ])("rejects a videos.list response with an unexpected %s", async (_name, mutate) => {
    const response = JSON.parse(await fixture("video-found.json")) as Record<string, unknown>;
    mutate(response);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

    const result = await getYoutubeVideo("XpZHKGGCK-o", youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: {}
    });
  });

  it.each([
    ["wrong video resource kind", (record: Record<string, unknown>) => { record.kind = "youtube#playlist"; }],
    ["malformed video timestamp", (record: Record<string, unknown>) => { ((record.snippet as Record<string, unknown>).publishedAt) = "2025-99-99"; }],
    ["malformed ISO duration", (record: Record<string, unknown>) => { ((record.contentDetails as Record<string, unknown>).duration) = "12 minutes"; }],
    ["unknown live state", (record: Record<string, unknown>) => { ((record.snippet as Record<string, unknown>).liveBroadcastContent) = "later"; }],
    ["unknown privacy state", (record: Record<string, unknown>) => { ((record.status as Record<string, unknown>).privacyStatus) = "friends"; }],
    ["non-numeric statistics", (record: Record<string, unknown>) => { ((record.statistics as Record<string, unknown>).viewCount) = "1.5"; }]
  ])("rejects a %s without normalizing a video", async (_name, mutate) => {
    const response = JSON.parse(await fixture("video-found.json")) as { items: Record<string, unknown>[] };
    mutate(response.items[0]!);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

    const result = await getYoutubeVideo("XpZHKGGCK-o", youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: {}
    });
  });

  it("returns an invalid-input envelope without an outbound request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await getYoutubeVideo("https://www.youtube.com/embed/XpZHKGGCK-o", youtubeConfig);

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_video_id_invalid", message: "YouTube video identifier is invalid" },
      data: {}
    });
  });
});

describe("YouTube API-visible comment corpus retrieval", () => {
  it("exhausts top-level pages and separately paginates every reply corpus", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({
      video: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
      pageSize: 100
    }, youtubeConfig);

    expect(requests).toHaveLength(5);
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      part: "snippet,replies",
      videoId: "XpZHKGGCK-o",
      maxResults: "100",
      textFormat: "plainText",
      order: "time",
      key: "fixture-youtube-key"
    });
    expect(Object.fromEntries(requests[1]!.searchParams)).toEqual({
      part: "snippet,replies",
      videoId: "XpZHKGGCK-o",
      maxResults: "100",
      textFormat: "plainText",
      order: "time",
      pageToken: "thread-page-2",
      key: "fixture-youtube-key"
    });
    expect(requests.slice(2).map((url) => Object.fromEntries(url.searchParams))).toEqual([
      {
        part: "snippet",
        parentId: "UgxTop00000000000000001",
        maxResults: "100",
        textFormat: "plainText",
        key: "fixture-youtube-key"
      },
      {
        part: "snippet",
        parentId: "UgxTop00000000000000001",
        maxResults: "100",
        textFormat: "plainText",
        pageToken: "reply-top-1-page-2",
        key: "fixture-youtube-key"
      },
      {
        part: "snippet",
        parentId: "UgxTop00000000000000002",
        maxResults: "100",
        textFormat: "plainText",
        key: "fixture-youtube-key"
      }
    ]);
    expect(result).toMatchObject({
      provider: "youtube",
      record_type: "youtube_comments",
      primary_identifier: "XpZHKGGCK-o",
      pagination: { page_size: 100, returned: 6, exhausted: true },
      access_status: "api_visible_complete",
      limitations: [],
      raw_metadata: { api_visible_top_level_comments: 2 },
      data: {
        manifest: {
          video_id: "XpZHKGGCK-o",
          top_level_comments_retrieved: 2,
          expected_replies: 4,
          replies_retrieved: 4,
          total_comments_and_replies: 6,
          reply_count_mismatches: [],
          pages: { comment_threads: 2, replies: 3 },
          extraction_coverage: "api_visible_complete"
        }
      }
    });
    expect(result.error).toBeUndefined();
    expect(new Set(result.data.comments.map((comment) => comment.comment_id)).size)
      .toBe(result.data.comments.length);
    expect(result.data.comments).toHaveLength(6);
    expect(result.data.comments.find(({ comment_id }) => comment_id === "UgxTop00000000000000001"))
      .toEqual({
        video_id: "XpZHKGGCK-o",
        comment_id: "UgxTop00000000000000001",
        parent_id: null,
        top_level_comment_id: "UgxTop00000000000000001",
        is_reply: false,
        author_channel_id: "UC0123456789abcdefghijkl",
        author_display_name: "Recorded Author One",
        text: "First top-level comment",
        like_count: 5,
        published_at: "2025-02-01T10:00:00Z",
        updated_at: "2025-02-01T10:05:00Z"
      });
    expect(result.data.comments.find(({ comment_id }) => comment_id === "UgxReply0000000000000003"))
      .toMatchObject({
        video_id: "XpZHKGGCK-o",
        parent_id: "UgxTop00000000000000001",
        top_level_comment_id: "UgxTop00000000000000001",
        is_reply: true,
        text: "Separate reply three",
        like_count: 3
      });
    expect(JSON.stringify(result)).not.toContain("fixture-youtube-key");
  });

  it("never trusts an embedded reply set even when its length equals totalReplyCount", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result.access_status).toBe("api_visible_complete");
    expect(requests.some((url) =>
      url.pathname.endsWith("/comments") &&
      url.searchParams.get("parentId") === "UgxTop00000000000000002"
    )).toBe(true);
  });

  it("marks omitted expected replies partial when includeReplies is false", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({
      video: "XpZHKGGCK-o",
      includeReplies: false
    }, youtubeConfig);

    expect(requests).toHaveLength(2);
    expect(requests.every((url) => url.pathname.endsWith("/commentThreads"))).toBe(true);
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { returned: 2, exhausted: false },
      data: {
        manifest: {
          expected_replies: 4,
          replies_retrieved: 0,
          total_comments_and_replies: 2,
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "Reply retrieval was disabled while API thread metadata reported 4 expected reply/replies."
    );
  });

  it("preserves a noninitial opaque cursor but never claims whole-video completeness", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({
      video: "XpZHKGGCK-o",
      cursor: "thread-page-2"
    }, youtubeConfig);

    expect(requests[0]!.searchParams.get("pageToken")).toBe("thread-page-2");
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { cursor: "thread-page-2", returned: 2, exhausted: true },
      raw_metadata: { api_visible_top_level_comments: 2 },
      data: {
        manifest: {
          top_level_comments_retrieved: 1,
          expected_replies: 1,
          replies_retrieved: 1,
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "Retrieval began from a noninitial commentThreads page token, so earlier API-visible comments were not covered."
    );
  });

  it("uses searchTerms and always labels targeted retrieval query-bounded partial", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/commentThreads")) {
        return new Response(await fixture("comment-threads-query.json"), { status: 200 });
      }
      return new Response(await fixture("comments-query-parent.json"), { status: 200 });
    }));

    const result = await searchYoutubeComments({
      video: "XpZHKGGCK-o",
      query: "recorded episode",
      includeReplies: true
    }, youtubeConfig);

    expect(requests).toHaveLength(2);
    expect(requests[0]!.searchParams.get("searchTerms")).toBe("recorded episode");
    expect(result).toMatchObject({
      query: { query: "recorded episode" },
      access_status: "partial",
      pagination: { returned: 2, exhausted: true },
      data: {
        manifest: {
          expected_replies: 1,
          replies_retrieved: 1,
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.error).toBeUndefined();
    expect(result.limitations).toContain(
      "YouTube searchTerms constrained top-level comment threads to a query-bounded subset; this is not the complete video comment corpus."
    );
  });

  it("distinguishes a valid empty corpus from failed comment access", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    )));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      pagination: { returned: 0, exhausted: true },
      raw_metadata: { api_visible_top_level_comments: 0 },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          expected_replies: 0,
          replies_retrieved: 0,
          total_comments_and_replies: 0,
          reply_count_mismatches: [],
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "api_visible_complete"
        }
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("returns the missing-key comments envelope before parsing or requesting upstream", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await getYoutubeComments({ video: "not-a-video" }, { apiKey: " " });

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "inaccessible",
      error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
      data: {}
    });
  });

  it.each([
    ["comments disabled", "error-comments-disabled.json", 403, "comments_disabled", "youtube_comments_disabled", "YouTube comments are disabled"],
    ["video not found", "error-video-not-found.json", 404, "not_found", "youtube_video_not_found", "YouTube video was not found"],
    ["quota exhausted", "error-quota-exceeded.json", 403, "rate_limited", "youtube_rate_limited", "YouTube rate limit reached"]
  ])("maps %s without returning a false empty corpus or provider text", async (
    _name,
    fixtureName,
    httpStatus,
    accessStatus,
    code,
    message
  ) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture(fixtureName), { status: httpStatus }
    )));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: accessStatus,
      error: { code, message, http_status: httpStatus }
    });
    expect(result.access_status).not.toBe("api_visible_complete");
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("returns collected comments as partial on a mid-reply-pagination failure without leaking provider data", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith("/comments") && url.searchParams.has("pageToken")) {
        return new Response(await fixture("error-access-denied.json"), { status: 403 });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(requests.length).toBeGreaterThan(3);
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: false },
      error: { code: "youtube_access_denied", message: "YouTube access denied", http_status: 403 },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          expected_replies: 4,
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.data.comments.length).toBeGreaterThan(0);
    expect(result.limitations).toContain(
      "YouTube reply retrieval stopped before every expected reply corpus could be exhausted."
    );
    expect(JSON.stringify(result)).not.toContain("provider-secret-mid-pagination");
    expect(JSON.stringify(result)).not.toContain("fixture-youtube-key");
  });

  it("keeps reply-count mismatch explicit instead of relaxing reconciliation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000001"
      ) {
        const response = JSON.parse(await fixture("comments-top-1-page-1.json")) as Record<string, unknown>;
        delete response.nextPageToken;
        response.pageInfo = { totalResults: 2, resultsPerPage: 2 };
        return new Response(JSON.stringify(response), { status: 200 });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      data: {
        manifest: {
          expected_replies: 4,
          replies_retrieved: 3,
          reply_count_mismatches: [{
            parent_comment_id: "UgxTop00000000000000001",
            expected: 3,
            retrieved: 2
          }],
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "Reply counts did not reconcile for 1 top-level comment(s)."
    );
  });

  it("treats conflicting duplicate reply IDs as an explicit partial response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000001" &&
        !url.searchParams.has("pageToken")
      ) {
        const response = JSON.parse(await fixture("comments-top-1-page-1.json")) as {
          items: Array<{ snippet: { textDisplay: string } }>;
        };
        response.items[0]!.snippet.textDisplay = "Conflicting duplicate body";
        return new Response(JSON.stringify(response), { status: 200 });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_response_invalid", message: "YouTube response was invalid" },
      data: { manifest: { extraction_coverage: "partial" } }
    });
    expect(result.limitations).toContain(
      "YouTube returned a duplicate comment identifier with inconsistent metadata."
    );
  });

  it("detects a top-level page-token cycle and preserves already collected data as partial", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads") && url.searchParams.has("pageToken")) {
        const response = JSON.parse(await fixture("comment-threads-page-2.json")) as Record<string, unknown>;
        response.nextPageToken = "thread-page-2";
        return new Response(JSON.stringify(response), { status: 200 });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: false },
      error: { code: "youtube_response_invalid" },
      data: {
        comments: expect.arrayContaining([
          expect.objectContaining({ comment_id: "UgxTop00000000000000001" })
        ]),
        manifest: { pages: { comment_threads: 2, replies: 0 }, extraction_coverage: "partial" }
      }
    });
    expect(result.limitations).toContain(
      "YouTube commentThreads pagination returned a repeated page token."
    );
  });

  it("rejects malformed initial comment resources instead of reporting no comments", async () => {
    const response = JSON.parse(await fixture("comment-threads-empty.json")) as Record<string, unknown>;
    response.kind = "youtube#playlistListResponse";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: { comments: [], manifest: { extraction_coverage: "partial" } }
    });
  });
});

async function completeCommentResponse(url: URL): Promise<Response> {
  if (url.pathname.endsWith("/commentThreads")) {
    const name = url.searchParams.get("pageToken") === "thread-page-2"
      ? "comment-threads-page-2.json"
      : "comment-threads-page-1.json";
    return new Response(await fixture(name), { status: 200 });
  }

  const parentId = url.searchParams.get("parentId");
  if (parentId === "UgxTop00000000000000002") {
    return new Response(await fixture("comments-top-2-page-1.json"), { status: 200 });
  }
  const name = url.searchParams.get("pageToken") === "reply-top-1-page-2"
    ? "comments-top-1-page-2.json"
    : "comments-top-1-page-1.json";
  return new Response(await fixture(name), { status: 200 });
}
