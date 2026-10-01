import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { YoutubeComment } from "@askrigor/sources";

const VIDEO_ID = "XpZHKGGCK-o";
const SECRET = "action-audit-surface-secret-0123456789";

const comments: YoutubeComment[] = Array.from({ length: 3 }, (_, index) => ({
  video_id: VIDEO_ID,
  comment_id: `comment-${index}`,
  parent_id: null,
  top_level_comment_id: `comment-${index}`,
  is_reply: false,
  author_channel_id: `UC${String(index).padStart(22, "0")}`,
  author_display_name: `@person${index}`,
  text: `Recorded comment ${index}`,
  like_count: index,
  published_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
  updated_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString()
}));

vi.mock("../apps/research-mcp/src/youtube-video-community-audit.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../apps/research-mcp/src/youtube-video-community-audit.js")>();
  return {
    ...original,
    auditYoutubeVideoCommunity: (input: unknown, config: Parameters<typeof original.auditYoutubeVideoCommunity>[1]) =>
      original.auditYoutubeVideoCommunity(input, config, {
        dependencies: {
          get_video: async () => ({
            provider: "youtube",
            record_type: "youtube_video",
            primary_identifier: VIDEO_ID,
            retrieved_at: "2026-08-13T00:00:00.000Z",
            source_identity: { canonical_url: `https://www.youtube.com/watch?v=${VIDEO_ID}` },
            pagination: { returned: 1, exhausted: true },
            access_status: "api_visible_complete",
            limitations: [],
            data: {
              video_id: VIDEO_ID,
              title: "Recorded hip video",
              channel_id: "UC0123456789abcdefghijkl",
              channel_title: "Recorded health channel",
              statistics: { comment_count: "3" }
            }
          }),
          get_segment: async () => ({
            video_id: VIDEO_ID,
            comments,
            top_level_comments_retrieved: comments.length,
            replies_retrieved: 0,
            comment_thread_pages: 1,
            reply_pages: 0,
            reply_count_mismatches: [],
            exhausted: true,
            access_status: "api_visible_complete",
            limitations: []
          }),
          get_comments_by_ids: async (_videoId: string, ids: string[]) => ({
            access_status: "api_visible_complete",
            comments: comments.filter(({ comment_id }) => ids.includes(comment_id)),
            limitations: []
          })
        } as never
      })
  };
});

const { createResearchActionRoutes } = await import("../apps/research-mcp/src/actions/research-routes.js");

describe("audit_youtube_video_community on the Custom GPT Action", () => {
  const previous = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
  beforeEach(() => {
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = SECRET;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    else process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = previous;
  });

  it("returns the full audit, without MCP-only fields, when a receipt secret is configured", async () => {
    const route = createResearchActionRoutes().find(({ operationId }) => operationId === "audit_youtube_video_community")!;
    const result = await route.handle({
      request: {} as never,
      clientIp: "203.0.113.8",
      body: { video_id_or_url: VIDEO_ID }
    });
    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown> & {
      receipt: { completion_state: string };
      sample: { comments: Array<Record<string, unknown>> };
    };
    expect(body.receipt.completion_state).toBe("api_visible_complete");
    expect(body).not.toHaveProperty("research_receipt");
    expect(body.sample.comments[0]).toHaveProperty("comment_id");
  });
});
