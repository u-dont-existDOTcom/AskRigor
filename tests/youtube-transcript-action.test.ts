import { describe, expect, it, vi } from "vitest";

import {
  createActionOnlyResearchRoutes,
  createYoutubeTranscriptActionRoute,
  youtubeTranscriptActionOutputSchema
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
    snapshot_sha256: "a".repeat(64),
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

const snapshotSha256 = "a".repeat(64);
const firstPage = {
  ...result,
  pagination: {
    page_size: 1,
    returned: 1,
    exhausted: false,
    next_cursor: "provider-page-2"
  },
  access_status: "partial" as const,
  raw_metadata: {
    ...result.raw_metadata,
    provider_reported_segments: 2,
    snapshot_sha256: snapshotSha256
  }
};
const finalPage = {
  ...result,
  pagination: {
    cursor: "provider-page-2",
    page_size: 1,
    returned: 1,
    exhausted: true
  },
  raw_metadata: {
    ...result.raw_metadata,
    provider_reported_segments: 2,
    snapshot_sha256: snapshotSha256
  },
  data: [{
    ...result.data[0]!,
    index: 1,
    start_ms: 13000,
    text: "Second recorded segment",
    timestamp_url: `https://www.youtube.com/watch?v=${VIDEO_ID}&t=13s`
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

    expect(routes).toHaveLength(7);
    expect(routes.find(({ operationId }) => operationId === "get_youtube_transcript"))
      .toMatchObject({
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

  it("strictly validates input and returns a schema-valid transcript plus coverage receipt", async () => {
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

    const response = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      page_size: 100
    }));
    expect(response.status).toBe(200);
    const body = youtubeTranscriptActionOutputSchema.parse(response.body);
    expect(body).toMatchObject({
      ...result,
      coverage_receipt: {
        source_video_id: VIDEO_ID,
        access_status: "api_visible_complete",
        pagination: {
          chain_started_at_first_page: true,
          cursor_chain_reconciled: true,
          records_returned_cumulative: 1,
          exhausted: true,
          next_cursor_present: false
        }
      }
    });
    expect(getTranscript).toHaveBeenCalledWith({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      page_size: 100
    });
  });

  it("uses server-held chain state and reports truthful cumulative transcript coverage", async () => {
    const getTranscript = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(finalPage);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });

    const firstResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      page_size: 1
    }));
    expect(firstResponse.status).toBe(200);
    const firstBody = youtubeTranscriptActionOutputSchema.parse(firstResponse.body);
    expect(firstBody.pagination.next_cursor).toMatch(/^art1_[A-Za-z0-9_-]{32}$/u);
    expect(firstBody.pagination.next_cursor).not.toBe("provider-page-2");
    expect(firstBody.coverage_receipt.pagination).toEqual({
      chain_started_at_first_page: true,
      cursor_chain_reconciled: true,
      page_count: 1,
      records_returned_cumulative: 1,
      exhausted: false,
      next_cursor_present: true
    });

    const actionHandle = firstBody.pagination.next_cursor!;
    const finalResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle,
      page_size: 200
    }));
    expect(finalResponse.status).toBe(200);
    const finalBody = youtubeTranscriptActionOutputSchema.parse(finalResponse.body);
    expect(finalBody.pagination).toMatchObject({
      cursor: actionHandle,
      returned: 1,
      exhausted: true
    });
    expect(finalBody.pagination.next_cursor).toBeUndefined();
    expect(finalBody.coverage_receipt.pagination).toEqual({
      chain_started_at_first_page: true,
      cursor_chain_reconciled: true,
      page_count: 2,
      records_returned_cumulative: 2,
      exhausted: true,
      next_cursor_present: false
    });
    expect(getTranscript).toHaveBeenLastCalledWith({
      video_id_or_url: VIDEO_ID,
      language_code: "en",
      cursor: "provider-page-2",
      page_size: 1
    });

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle
    }))).resolves.toEqual({
      status: 422,
      body: {
        error: {
          code: "youtube_transcript_action_continuation_invalid_or_expired",
          retryable: false
        }
      }
    });
  });

  it("rejects raw or forged provider cursors before transcript retrieval", async () => {
    const getTranscript = vi.fn(async () => finalPage);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: "provider-page-2"
    }))).resolves.toEqual({
      status: 422,
      body: {
        error: {
          code: "youtube_transcript_action_continuation_invalid_or_expired",
          retryable: false
        }
      }
    });
    expect(getTranscript).not.toHaveBeenCalled();
  });

  it("fails closed when a continued page skips a transcript segment", async () => {
    const skippedPage = {
      ...finalPage,
      data: [{ ...finalPage.data[0]!, index: 4 }]
    };
    const getTranscript = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(skippedPage);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });
    const firstResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      page_size: 1
    }));
    const actionHandle = youtubeTranscriptActionOutputSchema.parse(firstResponse.body)
      .pagination.next_cursor!;

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle
    }))).rejects.toThrow("segment chain is not contiguous");
  });

  it.each([
    ["query video", {
      ...finalPage,
      query: { ...finalPage.query, video_id: "otherVid001" }
    }],
    ["segment language", {
      ...finalPage,
      data: [{ ...finalPage.data[0]!, language_code: "fr" }]
    }]
  ])("fails closed when a continued page mixes %s identity", async (_label, mixedPage) => {
    const getTranscript = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(mixedPage);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });
    const firstResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      page_size: 1
    }));
    const actionHandle = youtubeTranscriptActionOutputSchema.parse(firstResponse.body)
      .pagination.next_cursor!;

    await expect(route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle
    }))).rejects.toThrow("continuation chain mismatch");
  });

  it("keeps the same opaque handle retryable without inflating cumulative counts", async () => {
    const retryableFailure = {
      ...finalPage,
      pagination: {
        cursor: "provider-page-2",
        page_size: 1,
        returned: 0,
        exhausted: false
      },
      access_status: "rate_limited" as const,
      error: {
        code: "youtube_transcript_rate_limited",
        message: "Retry later",
        retryable: true
      },
      data: []
    };
    const getTranscript = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(retryableFailure)
      .mockResolvedValueOnce(finalPage);
    const route = createYoutubeTranscriptActionRoute({ getTranscript });
    const firstResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      page_size: 1
    }));
    const actionHandle = youtubeTranscriptActionOutputSchema.parse(firstResponse.body)
      .pagination.next_cursor!;

    const retryResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle
    }));
    const retryBody = youtubeTranscriptActionOutputSchema.parse(retryResponse.body);
    expect(retryBody.pagination.next_cursor).toBe(actionHandle);
    expect(retryBody.coverage_receipt.pagination).toMatchObject({
      page_count: 1,
      records_returned_cumulative: 1,
      exhausted: false,
      next_cursor_present: true
    });
    expect(retryBody.coverage_receipt.error_retryable).toBe(true);

    const finalResponse = await route.handle(context({
      video_id_or_url: VIDEO_ID,
      cursor: actionHandle
    }));
    expect(youtubeTranscriptActionOutputSchema.parse(finalResponse.body)
      .coverage_receipt.pagination).toMatchObject({
      page_count: 2,
      records_returned_cumulative: 2,
      exhausted: true
    });
  });
});
