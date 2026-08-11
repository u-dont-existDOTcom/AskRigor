import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getYoutubeComments,
  getYoutubeVideo,
  MIN_YOUTUBE_COMMENT_OUTPUT_BYTES,
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

  it("fails closed when the provider returns a non-video item to a type=video request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("search-type-video-non-video-item.json"), { status: 200 }
    )));

    const result = await searchYoutube({ query: "OpenAI", pageSize: 1 }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_response_invalid" },
      data: []
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
  it("accepts a terminal comments.list page that omits totalResults and reconciles its embedded reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000002"
      ) {
        return new Response(
          await fixture("comments-live-page-no-total.json"), { status: 200 }
        );
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      pagination: { returned: 6, exhausted: true },
      data: {
        manifest: {
          expected_replies: 4,
          replies_retrieved: 4,
          reply_count_mismatches: [],
          pages: { comment_threads: 2, replies: 3 },
          extraction_coverage: "api_visible_complete"
        }
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("treats current pageInfo resultsPerPage/totalResults as page metadata while following nextPageToken", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (!url.searchParams.has("pageToken")) {
        return new Response(
          await fixture("comment-threads-page-capacity-with-next.json"), { status: 200 }
        );
      }
      return new Response(await fixture("comment-threads-page-2.json"), { status: 200 });
    }));

    const result = await getYoutubeComments({
      video: "XpZHKGGCK-o",
      includeReplies: false,
      pageSize: 100
    }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { returned: 2, exhausted: false },
      raw_metadata: { api_visible_top_level_comments: 2 },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          pages: { comment_threads: 2, replies: 0 }
        }
      }
    });
    expect(result.error).toBeUndefined();
  });

  it("accepts a zero-result targeted page whose resultsPerPage reports requested capacity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("comment-threads-zero-page-capacity.json"), { status: 200 }
    )));

    const result = await searchYoutubeComments({
      video: "XpZHKGGCK-o",
      query: "sanitized unique query",
      includeReplies: true
    }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { returned: 0, exhausted: true },
      raw_metadata: {
        provider_request_attempts: 1
      },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          reply_count_mismatches: [],
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.error).toBeUndefined();
  });

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
    expect(result.raw_metadata).not.toHaveProperty("api_visible_top_level_comments");
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

  it("keeps complete-envelope byte accounting exact across a non-expiring 9-to-10 ms clock transition", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    )));
    const clockValues: number[] = [];
    const now = () => {
      const read = clockValues.length + 1;
      const value = read === 1 ? 0 : read < 10 ? 9 : 10;
      clockValues.push(value);
      return value;
    };
    const maxOutputBytes = 2_048;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({
        maxElapsedMs: 100,
        maxNormalizedOutputBytes: maxOutputBytes
      }, now)
    );
    const serializedBytes = Buffer.byteLength(JSON.stringify(result), "utf8");

    expect(clockValues).toContain(9);
    expect(clockValues).toContain(10);
    expect(clockValues.every((value, index) => index === 0 || value >= clockValues[index - 1]!))
      .toBe(true);
    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      raw_metadata: {
        normalized_output_bytes: serializedBytes,
        elapsed_ms: 9
      },
      data: {
        comments: [],
        manifest: { extraction_coverage: "api_visible_complete" }
      }
    });
    expect(result.error).toBeUndefined();
    expect(serializedBytes).toBeLessThanOrEqual(maxOutputBytes);
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
      error: { code, message, http_status: httpStatus },
      raw_metadata: { provider_request_attempts: 1 },
      data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
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
          pages: { comment_threads: 2, replies: 1 },
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
        manifest: {
          top_level_comments_retrieved: 1,
          total_comments_and_replies: 2,
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
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
      raw_metadata: { provider_request_attempts: 1 },
      data: {
        comments: [],
        manifest: {
          pages: { comment_threads: 0, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });
});

describe("YouTube comment retrieval budgets", () => {
  it("stops a unique-token top-level workload at the successful-page budget", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const page = url.searchParams.get("pageToken") === null
        ? 1
        : Number(url.searchParams.get("pageToken")!.replace("unique-page-", ""));
      return new Response(JSON.stringify(await uniqueThreadPage(page)), { status: 200 });
    }));

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxCommentThreadPages: 2 })
    );

    expect(requests).toHaveLength(2);
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { returned: 2, exhausted: false },
      error: {
        code: "youtube_comment_budget_comment_thread_pages",
        message: "YouTube comment retrieval budget reached: comment_thread_pages",
        retryable: false
      },
      raw_metadata: { provider_request_attempts: 2 },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          total_comments_and_replies: 2,
          pages: { comment_threads: 2, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "YouTube comment retrieval stopped after reaching the comment_thread_pages budget."
    );
  });

  it("bounds total provider request attempts independently of page tokens", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxProviderRequestAttempts: 1 })
    );

    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_provider_request_attempts" },
      raw_metadata: { provider_request_attempts: 1 },
      data: {
        manifest: {
          top_level_comments_retrieved: 1,
          expected_replies: 3,
          replies_retrieved: 1,
          total_comments_and_replies: 2,
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "YouTube comment retrieval stopped after reaching the provider_request_attempts budget."
    );
  });

  it("counts and bounds every retry as a provider request attempt", async () => {
    vi.useFakeTimers();
    const body = await fixture("error-quota-exceeded.json");
    const upstream = vi.fn(async () => new Response(body, { status: 429 }));
    vi.stubGlobal("fetch", upstream);

    const pending = getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxProviderRequestAttempts: 1 })
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_provider_request_attempts" },
      raw_metadata: { provider_request_attempts: 1 },
      data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
    });
  });

  it("bounds independent reply-page fanout and keeps mismatches explicit", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxReplyPages: 1 })
    );

    expect(requests).toHaveLength(3);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_reply_pages" },
      raw_metadata: { provider_request_attempts: 3 },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          expected_replies: 4,
          replies_retrieved: 3,
          total_comments_and_replies: 5,
          reply_count_mismatches: [
            { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 2 },
            { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
          ],
          pages: { comment_threads: 2, replies: 1 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("bounds thread fanout before allocating another thread", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      completeCommentResponse(new URL(String(input)))
    ));

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxThreads: 1 })
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_threads" },
      raw_metadata: { provider_request_attempts: 2 },
      data: {
        manifest: {
          top_level_comments_retrieved: 1,
          expected_replies: 3,
          replies_retrieved: 1,
          total_comments_and_replies: 2,
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("bounds the total normalized comment count before allocation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      completeCommentResponse(new URL(String(input)))
    ));

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxComments: 2 })
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_comments" },
      data: {
        comments: expect.arrayContaining([
          expect.objectContaining({ comment_id: "UgxTop00000000000000001" }),
          expect.objectContaining({ comment_id: "UgxReply0000000000000001" })
        ]),
        manifest: {
          top_level_comments_retrieved: 1,
          replies_retrieved: 1,
          total_comments_and_replies: 2,
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("bounds aggregate normalized text bytes before allocating the next comment", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      completeCommentResponse(new URL(String(input)))
    ));
    const firstTextBytes = Buffer.byteLength("First top-level comment", "utf8");

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxTextBytes: firstTextBytes })
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_text_bytes" },
      raw_metadata: { normalized_text_bytes: 0 },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          expected_replies: 0,
          replies_retrieved: 0,
          total_comments_and_replies: 0,
          pages: { comment_threads: 0, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("rejects an output budget too small for a bounded minimal envelope before any request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: 1 })
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comments_runtime_invalid" },
      data: {}
    });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8"))
      .toBeLessThanOrEqual(MIN_YOUTUBE_COMMENT_OUTPUT_BYTES);
  });

  it("bounds the complete serialized envelope and retains only coherent whole thread groups", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      completeCommentResponse(new URL(String(input)))
    ));
    const maxOutputBytes = 2_700;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: maxOutputBytes })
    );
    const serializedBytes = Buffer.byteLength(JSON.stringify(result), "utf8");

    expect(serializedBytes).toBeLessThanOrEqual(maxOutputBytes);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_normalized_output_bytes" },
      raw_metadata: { normalized_output_bytes: serializedBytes },
      data: {
        manifest: {
          top_level_comments_retrieved: 1,
          expected_replies: 3,
          replies_retrieved: 3,
          total_comments_and_replies: 4,
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.limitations).toContain(
      "YouTube comment retrieval stopped after reaching the normalized_output_bytes budget."
    );
    if (!("comments" in result.data)) throw new Error("Expected a bounded comment corpus");
    expect(result.data.comments).toHaveLength(4);
    const topLevelIds = new Set(result.data.comments
      .filter(({ is_reply }) => !is_reply)
      .map(({ comment_id }) => comment_id));
    for (const comment of result.data.comments) {
      if (comment.is_reply) expect(topLevelIds.has(comment.top_level_comment_id)).toBe(true);
    }
    expect(result.data.manifest.total_comments_and_replies).toBe(result.data.comments.length);
    expect(result.data.manifest.top_level_comments_retrieved).toBe(topLevelIds.size);
    expect(result.raw_metadata).not.toHaveProperty("api_visible_top_level_comments");
  });

  it("keeps trimmed-envelope byte accounting exact across a non-expiring 9-to-10 ms clock transition", async () => {
    const response = await syntheticThreadPage(100);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));
    const clockValues: number[] = [];
    const now = () => {
      const read = clockValues.length + 1;
      const value = read === 1 ? 0 : read < 550 ? 9 : 10;
      clockValues.push(value);
      return value;
    };
    const maxOutputBytes = 8_000;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({
        maxElapsedMs: 100,
        maxNormalizedOutputBytes: maxOutputBytes
      }, now)
    );
    const serializedBytes = Buffer.byteLength(JSON.stringify(result), "utf8");

    expect(clockValues).toContain(9);
    expect(clockValues).toContain(10);
    expect(clockValues.every((value, index) => index === 0 || value >= clockValues[index - 1]!))
      .toBe(true);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_normalized_output_bytes" },
      raw_metadata: {
        normalized_output_bytes: serializedBytes,
        elapsed_ms: 9
      },
      data: { manifest: { extraction_coverage: "partial" } }
    });
    expect(serializedBytes).toBeLessThanOrEqual(maxOutputBytes);
  });

  it("counts envelope and manifest overhead even for an empty corpus", async () => {
    const upstream = vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    ));
    vi.stubGlobal("fetch", upstream);

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: 700 })
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comments_runtime_invalid" },
      data: {}
    });
  });

  it("uses exact JSON UTF-8 size for a 5k control-character targeted query before work", async () => {
    const upstream = vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    ));
    vi.stubGlobal("fetch", upstream);
    const maxOutputBytes = 8_000;

    const result = await searchYoutubeComments(
      { video: "XpZHKGGCK-o", query: "\0".repeat(5_000) },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: maxOutputBytes })
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comments_runtime_invalid" },
      data: {}
    });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(maxOutputBytes);
    expect(JSON.stringify(result)).not.toContain("\\u0000");
  });

  it("uses exact JSON UTF-8 size for an escaping opaque cursor before work", async () => {
    const upstream = vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    ));
    vi.stubGlobal("fetch", upstream);
    const cursor = "\0\"\\\b\f\n\r\t".repeat(512);
    const maxOutputBytes = 8_000;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o", cursor },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: maxOutputBytes })
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comments_runtime_invalid" },
      data: {}
    });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(maxOutputBytes);
    expect(JSON.stringify(result)).not.toContain("page_size");
  });

  it("bounds elapsed work after a provider response and before page allocation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("comment-threads-page-1.json"), { status: 200 }
    )));
    const now = vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(11);

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxElapsedMs: 10 }, now)
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_elapsed_ms" },
      raw_metadata: { provider_request_attempts: 1, elapsed_ms: 11 },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          total_comments_and_replies: 0,
          pages: { comment_threads: 0, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("expires during linear finalization without re-entering quadratic reconciliation", async () => {
    const response = await syntheticThreadPage(30);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));
    let clockReads = 0;
    const now = () => {
      clockReads += 1;
      return clockReads >= 75 ? 101 : 0;
    };

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxElapsedMs: 100 }, now)
    );

    expect(clockReads).toBeGreaterThanOrEqual(75);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_elapsed_ms" },
      raw_metadata: { elapsed_ms: 101 },
      data: {
        comments: expect.arrayContaining([
          expect.objectContaining({ comment_id: "UgxTopSynthetic000000000001" }),
          expect.objectContaining({ comment_id: "UgxTopSynthetic000000000002" })
        ]),
        manifest: {
          top_level_comments_retrieved: 2,
          expected_replies: 0,
          replies_retrieved: 0,
          total_comments_and_replies: 2,
          reply_count_mismatches: [],
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
  });

  it("uses a linear number of clock checkpoints while selecting an output-bounded prefix", async () => {
    const response = await syntheticThreadPage(100);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));
    let clockReads = 0;
    const now = () => {
      clockReads += 1;
      return 0;
    };

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: 8_000 }, now)
    );

    expect(result.error?.code).toBe("youtube_comment_budget_normalized_output_bytes");
    expect(clockReads).toBeLessThanOrEqual(600);
  });

  it("preserves an already sized whole-thread prefix when elapsed work expires during output trimming", async () => {
    const response = await syntheticThreadPage(100);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));
    let clockReads = 0;
    const now = () => {
      clockReads += 1;
      return clockReads >= 520 ? 101 : 0;
    };
    const maxOutputBytes = 8_000;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({
        maxElapsedMs: 100,
        maxNormalizedOutputBytes: maxOutputBytes
      }, now)
    );

    expect(clockReads).toBe(520);
    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_budget_elapsed_ms" },
      raw_metadata: { elapsed_ms: 101 },
      data: {
        manifest: {
          extraction_coverage: "partial",
          pages: { comment_threads: 1, replies: 0 }
        }
      }
    });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(maxOutputBytes);
    if (!("comments" in result.data)) throw new Error("Expected a bounded partial corpus");
    expect(result.data.comments.length).toBeGreaterThan(0);
    expect(result.data.comments.length).toBeLessThan(100);
    expect(result.data.manifest.top_level_comments_retrieved).toBe(result.data.comments.length);
  });
});

describe("YouTube comment clock validation", () => {
  it("contains an initially throwing clock before any provider request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const maxOutputBytes = 2_048;
    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: maxOutputBytes }, () => {
        throw new Error("clock-secret");
      })
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comment_clock_invalid", message: "YouTube comment retrieval clock was invalid" },
      data: {
        comments: [],
        manifest: { pages: { comment_threads: 0, replies: 0 }, extraction_coverage: "partial" }
      }
    });
    expect(JSON.stringify(result)).not.toContain("clock-secret");
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(maxOutputBytes);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects an invalid initial clock value %s without emitting invalid elapsed metadata",
    async (value) => {
      const upstream = vi.fn();
      vi.stubGlobal("fetch", upstream);

      const result = await getYoutubeComments(
        { video: "XpZHKGGCK-o" },
        youtubeConfig,
        budgetRuntime({}, () => value)
      );

      expect(upstream).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        access_status: "error",
        error: { code: "youtube_comment_clock_invalid" },
        data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
      });
      expect(result.raw_metadata).toBeUndefined();
    }
  );

  it("turns a backward clock after a valid page into a sanitized partial corpus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("comment-threads-empty.json"), { status: 200 }
    )));
    let reads = 0;
    const now = vi.fn(() => {
      reads += 1;
      return reads <= 8 ? 100 + reads : 99;
    });

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({}, now)
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_clock_invalid" },
      raw_metadata: { elapsed_ms: 7 },
      data: {
        comments: [],
        manifest: { pages: { comment_threads: 1, replies: 0 }, extraction_coverage: "partial" }
      }
    });
  });

  it("contains a throwing clock after a valid page in a bounded partial envelope", async () => {
    const response = await syntheticThreadPage(1);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));
    let reads = 0;
    const now = () => {
      reads += 1;
      if (reads >= 11) throw new Error("later-clock-secret");
      return reads;
    };

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({}, now)
    );

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_comment_clock_invalid" },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          total_comments_and_replies: 0,
          pages: { comment_threads: 1, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("later-clock-secret");
  });

  it.each([
    ["throwing", () => {
      let reads = 0;
      return () => {
        reads += 1;
        if (reads === 2) throw new Error("pre-provider-clock-secret");
        return 10;
      };
    }],
    ["NaN", () => {
      let reads = 0;
      return () => (++reads === 1 ? 10 : Number.NaN);
    }],
    ["Infinity", () => {
      let reads = 0;
      return () => (++reads === 1 ? 10 : Number.POSITIVE_INFINITY);
    }],
    ["backward", () => {
      let reads = 0;
      return () => (++reads === 1 ? 10 : 9);
    }]
  ])("classifies a %s second clock read as an initial zero-work error", async (_name, clockFactory) => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const maxOutputBytes = 2_048;

    const result = await getYoutubeComments(
      { video: "XpZHKGGCK-o" },
      youtubeConfig,
      budgetRuntime({ maxNormalizedOutputBytes: maxOutputBytes }, clockFactory())
    );

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_comment_clock_invalid" },
      data: {
        comments: [],
        manifest: {
          top_level_comments_retrieved: 0,
          total_comments_and_replies: 0,
          pages: { comment_threads: 0, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.raw_metadata).toBeUndefined();
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(maxOutputBytes);
    expect(JSON.stringify(result)).not.toContain("pre-provider-clock-secret");
  });
});

describe("YouTube operation-aware comment failures", () => {
  it("maps an initial forbidden commentThreads failure to inaccessible with zero successful pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("error-access-denied.json"), { status: 403 }
    )));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "inaccessible",
      error: { code: "youtube_access_denied", message: "YouTube access denied", http_status: 403 },
      raw_metadata: { provider_request_attempts: 1 },
      data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("maps an initial HTTP 429 to rate_limited after bounded HTTP retries", async () => {
    vi.useFakeTimers();
    const body = await fixture("error-quota-exceeded.json");
    const upstream = vi.fn(async () => new Response(body, { status: 429 }));
    vi.stubGlobal("fetch", upstream);

    const pending = getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(upstream).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      access_status: "rate_limited",
      error: { code: "youtube_rate_limited", message: "YouTube rate limit reached", http_status: 429 },
      raw_metadata: { provider_request_attempts: 5 },
      data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("maps comments.list commentNotFound to a sanitized partial parent-comment failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments")) {
        return new Response(await fixture("error-comment-not-found.json"), { status: 404 });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      error: {
        code: "youtube_parent_comment_not_found",
        message: "YouTube parent comment was not found",
        http_status: 404
      },
      raw_metadata: { provider_request_attempts: 3 },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          replies_retrieved: 2,
          total_comments_and_replies: 4,
          pages: { comment_threads: 2, replies: 0 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret-comment-not-found");
  });

  it.each([
    ["commentsDisabled", "error-comments-disabled.json", 403],
    ["videoNotFound", "error-video-not-found.json", 404]
  ])("does not map wrong-operation comments.list %s as a thread-level state", async (
    _reason,
    fixtureName,
    status
  ) => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments")) {
        return new Response(await fixture(fixtureName), { status });
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      error: { code: "youtube_request_failed", message: "YouTube request failed", http_status: status },
      data: { manifest: { pages: { comment_threads: 2, replies: 0 }, extraction_coverage: "partial" } }
    });
    expect(result.access_status).not.toBe("comments_disabled");
    expect(result.access_status).not.toBe("not_found");
    expect(JSON.stringify(result)).not.toContain("provider-secret");
  });

  it("does not map wrong-operation commentThreads commentNotFound as a video state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("error-comment-not-found.json"), { status: 404 }
    )));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "youtube_request_failed", message: "YouTube request failed", http_status: 404 },
      data: { manifest: { pages: { comment_threads: 0, replies: 0 } } }
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret-comment-not-found");
  });
});

describe("YouTube comment response guard isolation", () => {
  it("rejects a cyclic second reply page atomically after one successful reply page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("pageToken") === "reply-top-1-page-2"
      ) {
        const response = await mutableFixture("comments-top-1-page-2.json");
        response.nextPageToken = "reply-top-1-page-2";
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004",
        "UgxReply0000000000000002"
      ],
      manifest: manifestFixture({
        repliesRetrieved: 3,
        total: 5,
        mismatches: [
          { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 2 },
          { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
        ],
        commentThreadPages: 2,
        replyPages: 1
      }),
      limitation: "YouTube replies pagination returned a repeated page token."
    });
  });

  it("rejects every item in an invalid second top-level page before committing the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads") && url.searchParams.has("pageToken")) {
        const response = await mutableFixture("comment-threads-page-2.json");
        const item = (response.items as Record<string, unknown>[])[0]!;
        (item.snippet as Record<string, unknown>).videoId = "dQw4w9WgXcQ";
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: ["UgxTop00000000000000001", "UgxReply0000000000000001"],
      manifest: manifestFixture({
        topLevels: 1,
        expectedReplies: 3,
        repliesRetrieved: 1,
        total: 2,
        mismatches: [{ parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 0 }],
        commentThreadPages: 1,
        replyPages: 0
      }),
      limitation: "YouTube returned a comment thread that did not correlate to the requested video."
    });
  });

  it.each([
    ["thread", (item: Record<string, unknown>) => { item.id = "UgxThread000000000000001"; }],
    ["top-level comment", (item: Record<string, unknown>) => {
      const snippet = item.snippet as Record<string, unknown>;
      (snippet.topLevelComment as Record<string, unknown>).id = "UgxTop00000000000000001";
    }]
  ])("rejects a duplicate %s ID on a later top-level page", async (_name, mutate) => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads") && url.searchParams.has("pageToken")) {
        const response = await mutableFixture("comment-threads-page-2.json");
        mutate((response.items as Record<string, unknown>[])[0]!);
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: ["UgxTop00000000000000001", "UgxReply0000000000000001"],
      manifest: manifestFixture({
        topLevels: 1,
        expectedReplies: 3,
        repliesRetrieved: 1,
        total: 2,
        mismatches: [{ parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 0 }],
        commentThreadPages: 1,
        replyPages: 0
      }),
      limitation: "YouTube returned a duplicate thread or top-level comment identifier."
    });
  });

  it("rejects a duplicate reply ID across separate comments.list pages", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments") && url.searchParams.has("pageToken")) {
        const response = await mutableFixture("comments-top-1-page-2.json");
        ((response.items as Record<string, unknown>[])[0]!).id = "UgxReply0000000000000002";
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004",
        "UgxReply0000000000000002"
      ],
      manifest: manifestFixture({
        repliesRetrieved: 3,
        total: 5,
        mismatches: [
          { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 2 },
          { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
        ],
        commentThreadPages: 2,
        replyPages: 1
      }),
      limitation: "YouTube returned a duplicate reply identifier across comments pages."
    });
  });

  it("rejects a reply ID reused under a different parent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.searchParams.get("parentId") === "UgxTop00000000000000002") {
        const response = await mutableFixture("comments-top-2-page-1.json");
        ((response.items as Record<string, unknown>[])[0]!).id = "UgxReply0000000000000003";
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004",
        "UgxReply0000000000000002", "UgxReply0000000000000003"
      ],
      manifest: manifestFixture({
        repliesRetrieved: 4,
        total: 6,
        mismatches: [{ parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }],
        commentThreadPages: 2,
        replyPages: 2
      }),
      limitation: "YouTube returned a duplicate comment identifier with inconsistent metadata."
    });
  });

  it.each([
    ["thread video", (item: Record<string, unknown>) => {
      (item.snippet as Record<string, unknown>).videoId = "dQw4w9WgXcQ";
    }],
    ["top-level comment video", (item: Record<string, unknown>) => {
      const snippet = item.snippet as Record<string, unknown>;
      const top = snippet.topLevelComment as Record<string, unknown>;
      (top.snippet as Record<string, unknown>).videoId = "dQw4w9WgXcQ";
    }]
  ])("rejects a wrong %s correlation", async (_name, mutate) => {
    const response = await mutableFixture("comment-threads-page-1.json");
    mutate((response.items as Record<string, unknown>[])[0]!);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [],
      manifest: manifestFixture({
        topLevels: 0,
        expectedReplies: 0,
        repliesRetrieved: 0,
        total: 0,
        mismatches: [],
        commentThreadPages: 0,
        replyPages: 0
      }),
      limitation: "YouTube returned a comment thread that did not correlate to the requested video.",
      accessStatus: "error"
    });
  });

  it("rejects an embedded reply with the wrong parent after preserving its top-level comment", async () => {
    const response = await mutableFixture("comment-threads-page-1.json");
    const item = (response.items as Record<string, unknown>[])[0]!;
    const embedded = ((item.replies as Record<string, unknown>).comments as Record<string, unknown>[])[0]!;
    (embedded.snippet as Record<string, unknown>).parentId = "UgxTopWrong0000000000001";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [],
      manifest: manifestFixture({
        topLevels: 0,
        expectedReplies: 0,
        repliesRetrieved: 0,
        total: 0,
        mismatches: [],
        commentThreadPages: 0,
        replyPages: 0
      }),
      limitation: "YouTube returned a reply that did not correlate to its requested parent comment.",
      accessStatus: "error"
    });
  });

  it.each([
    ["parent", (snippet: Record<string, unknown>) => { snippet.parentId = "UgxTopWrong0000000000001"; }],
    ["video", (snippet: Record<string, unknown>) => { snippet.videoId = "dQw4w9WgXcQ"; }]
  ])("rejects a separately fetched reply with the wrong %s", async (_name, mutate) => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000001" &&
        !url.searchParams.has("pageToken")
      ) {
        const response = await mutableFixture("comments-top-1-page-1.json");
        const second = (response.items as Record<string, unknown>[])[1]!;
        mutate(second.snippet as Record<string, unknown>);
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004"
      ],
      manifest: manifestFixture({
        repliesRetrieved: 2,
        total: 4,
        mismatches: [
          { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 0 },
          { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
        ],
        commentThreadPages: 2,
        replyPages: 0
      }),
      limitation: "YouTube returned a reply that did not correlate to its requested parent comment."
    });
  });

  it("accepts changing page-local top-level totalResults while preserving token exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/commentThreads") && url.searchParams.has("pageToken")) {
        const response = await mutableFixture("comment-threads-page-2.json");
        (response.pageInfo as Record<string, unknown>).totalResults = 3;
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      pagination: { returned: 6, exhausted: true },
      raw_metadata: { api_visible_top_level_comments: 2 },
      data: { manifest: { top_level_comments_retrieved: 2, reply_count_mismatches: [] } }
    });
    expect(result.error).toBeUndefined();
  });

  it("accepts changing page-local reply totalResults and reconciles against thread metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments") && url.searchParams.has("pageToken")) {
        const response = await mutableFixture("comments-top-1-page-2.json");
        (response.pageInfo as Record<string, unknown>).totalResults = 2;
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      pagination: { returned: 6, exhausted: true },
      data: { manifest: { expected_replies: 4, replies_retrieved: 4, reply_count_mismatches: [] } }
    });
    expect(result.error).toBeUndefined();
  });

  it.each([
    ["top-level resultsPerPage", "comment-threads-page-1.json", (response: Record<string, unknown>) => {
      (response.pageInfo as Record<string, unknown>).resultsPerPage = 0;
    }, "YouTube commentThreads pageInfo and result counts were inconsistent."],
    ["top-level terminal total", "comment-threads-page-1.json", (response: Record<string, unknown>) => {
      delete response.nextPageToken;
    }, "YouTube initial terminal commentThreads page did not reconcile with pageInfo.totalResults."]
  ])("keeps incoherent %s explicit", async (_name, fixtureName, mutate, limitation) => {
    const response = await mutableFixture(fixtureName);
    mutate(response);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(response)));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    if (_name === "top-level resultsPerPage") {
      expectFailureCorpus(result, {
        commentIds: [],
        manifest: manifestFixture({
          topLevels: 0, expectedReplies: 0, repliesRetrieved: 0, total: 0,
          mismatches: [], commentThreadPages: 0, replyPages: 0
        }),
        limitation,
        accessStatus: "error"
      });
    } else {
      expectFailureCorpus(result, {
        commentIds: [],
        manifest: manifestFixture({
          topLevels: 0, expectedReplies: 0, repliesRetrieved: 0, total: 0,
          mismatches: [], commentThreadPages: 0, replyPages: 0
        }),
        limitation,
        accessStatus: "error"
      });
    }
  });

  it.each([
    ["resultsPerPage", (response: Record<string, unknown>) => {
      (response.pageInfo as Record<string, unknown>).resultsPerPage = 1;
    }, "YouTube comments pageInfo and result counts were inconsistent.", 0],
    ["present zero totalResults", (response: Record<string, unknown>) => {
      (response.pageInfo as Record<string, unknown>).totalResults = 0;
    }, "YouTube comments pageInfo and result counts were inconsistent.", 0]
  ])("keeps incoherent reply %s explicit", async (_name, mutate, limitation, replyPages) => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000001" &&
        !url.searchParams.has("pageToken")
      ) {
        const response = await mutableFixture("comments-top-1-page-1.json");
        mutate(response);
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);
    const includesReplyTwo = replyPages === 1;
    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004",
        ...(includesReplyTwo ? ["UgxReply0000000000000002"] : [])
      ],
      manifest: manifestFixture({
        repliesRetrieved: includesReplyTwo ? 3 : 2,
        total: includesReplyTwo ? 5 : 4,
        mismatches: [
          { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: includesReplyTwo ? 2 : 0 },
          { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
        ],
        commentThreadPages: 2,
        replyPages
      }),
      limitation
    });
  });

  it("keeps an early terminal reply page partial through thread reply-count reconciliation", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (
        url.pathname.endsWith("/comments") &&
        url.searchParams.get("parentId") === "UgxTop00000000000000001" &&
        !url.searchParams.has("pageToken")
      ) {
        const response = await mutableFixture("comments-top-1-page-1.json");
        delete response.nextPageToken;
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { returned: 5, exhausted: false },
      data: {
        manifest: {
          expected_replies: 4,
          replies_retrieved: 3,
          reply_count_mismatches: [{
            parent_comment_id: "UgxTop00000000000000001",
            expected: 3,
            retrieved: 2
          }],
          pages: { comment_threads: 2, replies: 2 },
          extraction_coverage: "partial"
        }
      }
    });
    expect(result.error).toBeUndefined();
    expect(result.limitations).toContain(
      "Reply counts did not reconcile for 1 top-level comment(s)."
    );
  });

  it.each([
    ["response", (response: Record<string, unknown>) => { response.kind = "youtube#playlistListResponse"; }],
    ["item", (response: Record<string, unknown>) => {
      ((response.items as Record<string, unknown>[])[0]!).kind = "youtube#video";
    }]
  ])("rejects a wrong comments.list %s kind without counting the page", async (_name, mutate) => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments")) {
        const response = await mutableFixture("comments-top-1-page-1.json");
        mutate(response);
        return jsonResponse(response);
      }
      return completeCommentResponse(url);
    }));

    const result = await getYoutubeComments({ video: "XpZHKGGCK-o" }, youtubeConfig);

    expectFailureCorpus(result, {
      commentIds: [
        "UgxTop00000000000000001", "UgxReply0000000000000001",
        "UgxTop00000000000000002", "UgxReply0000000000000004"
      ],
      manifest: manifestFixture({
        repliesRetrieved: 2,
        total: 4,
        mismatches: [
          { parent_comment_id: "UgxTop00000000000000001", expected: 3, retrieved: 0 },
          { parent_comment_id: "UgxTop00000000000000002", expected: 1, retrieved: 0 }
        ],
        commentThreadPages: 2,
        replyPages: 0
      }),
      limitation: "YouTube returned an invalid comments response."
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

function budgetRuntime(
  budgets: Record<string, number>,
  now?: () => number
): { budgets: Record<string, number>; now?: () => number } {
  return { budgets, ...(now === undefined ? {} : { now }) };
}

async function uniqueThreadPage(page: number): Promise<Record<string, unknown>> {
  const response = JSON.parse(await fixture("comment-threads-page-1.json")) as {
    nextPageToken?: string;
    pageInfo: { totalResults: number; resultsPerPage: number };
    items: Array<{
      id: string;
      snippet: {
        topLevelComment: { id: string; snippet: { textDisplay: string; textOriginal?: string } };
        totalReplyCount: number;
      };
      replies?: unknown;
    }>;
  };
  response.nextPageToken = `unique-page-${page + 1}`;
  response.pageInfo = { totalResults: 100, resultsPerPage: 1 };
  response.items[0]!.id = `UgxThreadBudget${String(page).padStart(9, "0")}`;
  response.items[0]!.snippet.topLevelComment.id = `UgxTopBudget${String(page).padStart(12, "0")}`;
  response.items[0]!.snippet.topLevelComment.snippet.textDisplay = `Budget comment ${page}`;
  response.items[0]!.snippet.topLevelComment.snippet.textOriginal = `Budget comment ${page}`;
  response.items[0]!.snippet.totalReplyCount = 0;
  delete response.items[0]!.replies;
  return response as Record<string, unknown>;
}

async function syntheticThreadPage(count: number): Promise<Record<string, unknown>> {
  const base = await mutableFixture("comment-threads-page-1.json") as {
    items: Array<Record<string, unknown>>;
  };
  const template = base.items[0]!;
  const items = Array.from({ length: count }, (_, index) => {
    const item = structuredClone(template);
    const ordinal = String(index + 1).padStart(12, "0");
    item.id = `UgxThreadSynthetic${ordinal}`;
    const snippet = item.snippet as Record<string, unknown>;
    const top = snippet.topLevelComment as Record<string, unknown>;
    top.id = `UgxTopSynthetic${ordinal}`;
    const topSnippet = top.snippet as Record<string, unknown>;
    topSnippet.textDisplay = `Synthetic comment ${index + 1}`;
    topSnippet.textOriginal = `Synthetic comment ${index + 1}`;
    snippet.totalReplyCount = 0;
    delete item.replies;
    return item;
  });
  return {
    kind: "youtube#commentThreadListResponse",
    pageInfo: { totalResults: count, resultsPerPage: count },
    items
  };
}

async function mutableFixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fixture(name)) as Record<string, unknown>;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

function manifestFixture({
  topLevels = 2,
  expectedReplies = 4,
  repliesRetrieved,
  total,
  mismatches,
  commentThreadPages,
  replyPages
}: {
  topLevels?: number;
  expectedReplies?: number;
  repliesRetrieved: number;
  total: number;
  mismatches: Array<{ parent_comment_id: string; expected: number; retrieved: number }>;
  commentThreadPages: number;
  replyPages: number;
}) {
  return {
    video_id: "XpZHKGGCK-o",
    top_level_comments_retrieved: topLevels,
    expected_replies: expectedReplies,
    replies_retrieved: repliesRetrieved,
    total_comments_and_replies: total,
    reply_count_mismatches: mismatches,
    pages: { comment_threads: commentThreadPages, replies: replyPages },
    extraction_coverage: "partial"
  };
}

function expectFailureCorpus(
  result: Awaited<ReturnType<typeof getYoutubeComments>>,
  expected: {
    commentIds: string[];
    manifest: ReturnType<typeof manifestFixture>;
    limitation: string;
    accessStatus?: "partial" | "error";
  }
): void {
  expect(result.access_status).toBe(expected.accessStatus ?? "partial");
  expect(result.access_status).not.toBe("api_visible_complete");
  expect(result.error).toMatchObject({ code: "youtube_response_invalid" });
  expect(result.limitations).toContain(expected.limitation);
  if (!("comments" in result.data)) throw new Error("Expected a comment corpus");
  expect(result.data.comments.map(({ comment_id }) => comment_id)).toEqual(expected.commentIds);
  expect(result.data.manifest).toEqual(expected.manifest);
}
