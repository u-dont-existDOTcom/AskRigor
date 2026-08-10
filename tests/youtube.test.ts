import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getYoutubeVideo,
  parseYoutubeVideoId,
  searchYoutube
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
