import { describe, expect, it, vi } from "vitest";

import {
  createActionOnlyResearchRoutes,
  createYoutubeTranscriptActionRoute
} from "../apps/research-mcp/src/index.js";

const VIDEO_ID = "XpZHKGGCK-o";

const result = {
  provider: "youtube" as const,
  record_type: "youtube_transcript" as const,
  primary_identifier: VIDEO_ID,
  retrieved_at: "2026-08-18T12:00:00.000Z",
  query: { video_id: VIDEO_ID, language_code: "en" },
  source_identity: {
    canonical_url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    title: "Recorded title",
    authors_or_channel: ["Recorded creator"]
  },
  pagination: { page_size: 100, returned: 1, exhausted: true },
  access_status: "api_visible_complete" as const,
  limitations: ["Recorded limitation."],
  raw_metadata: {
    access_method: "youtube_innertube_unofficial" as const,
    provider_reported_segments: 1,
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
  data: [{
    index: 0,
    start_ms: 12000,
    duration_ms: 1000,
    text: "Recorded segment",
    language_code: "en",
    timestamp_url: `https://www.youtube.com/watch?v=${VIDEO_ID}&t=12s`
  }]
};

const context = (body: unknown) => ({
  request: {} as never,
  clientIp: "127.0.0.1",
  body
});

describe("Custom GPT-only YouTube transcript Action", () => {
  it("is public, read-only, bounded, and absent from the frozen MCP registry", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as {
      RESEARCH_OPERATIONS: readonly { name: string }[];
    };
    const routes = createActionOnlyResearchRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: "POST",
      path: "/actions/research/get_youtube_transcript",
      operationId: "get_youtube_transcript",
      consequential: false,
      public: true,
      publicResearch: true,
      maximumResponseBytes: 60_000
    });
    expect(module.RESEARCH_OPERATIONS.map(({ name }) => name))
      .not.toContain("get_youtube_transcript");
  });

  it("strictly validates input and returns only a schema-valid transcript envelope", async () => {
    const getTranscript = vi.fn(async () => result);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      extra: true
    }))).resolves.toEqual({
      status: 422,
      body: { error: { code: "action_input_invalid", retryable: false } }
    });
    expect(getTranscript).not.toHaveBeenCalled();

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      page_size: 100
    }))).resolves.toEqual({ status: 200, body: result });
    expect(getTranscript).toHaveBeenCalledWith({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      page_size: 100
    });
  });
});
