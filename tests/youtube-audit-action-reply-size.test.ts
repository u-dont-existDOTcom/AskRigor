import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import {
  createAskRigorHttpServer,
  createResearchActionRoutes,
  projectDiscussionCoverageReceipt,
  type ResearchOperation
} from "../apps/research-mcp/src/index.js";
import {
  createYoutubeActionContinuationHandleStore,
  type YoutubeActionContinuationHandleStore
} from "../apps/research-mcp/src/actions/youtube-continuation-handle.js";
import {
  youtubeVideoCommunityAuditInputSchema,
  youtubeVideoCommunityAuditOutputSchema
} from "../apps/research-mcp/src/youtube-video-community-audit.js";

// Every identifier and every word of comment text here is invented for these tests.
const VIDEO_ID = "invented_01";
const ACTION_PATH = "/actions/research/audit_youtube_video_community";
const RESPONSE_LIMIT_BYTES = 60_000;
const HANDLE = /^arh1_[A-Za-z0-9_-]{32}$/u;

// Two reviewers of 13 Nov 2026 (Codex and Claude, both P1), by reading: the route cut the audit to 56,000 bytes and then
// added the coverage receipt, which repeats the audit's reply-count mismatches. With a few dozen mismatches the reply
// passed the route's 60,000 bytes. The router refuses such a reply only after the route has returned, and by then the
// route had committed the caller's handle; the handle for the next segment was in the refused reply.
describe("the per-video YouTube audit Action reply and its continuation handle", () => {
  it("sends a reply with a few dozen reply-count mismatches within the limit, so the audit goes on", async () => {
    const tokens = [`first.${"s".repeat(43)}`, `second.${"s".repeat(43)}`];
    const receivedInputs: Record<string, unknown>[] = [];
    const operation = auditOperation(async (input) => {
      receivedInputs.push(input);
      if (receivedInputs.length === 1) return auditReply({ segment: 1, comments: 3, mismatches: 0, continuationToken: tokens[0] });
      // The second segment: many long comments, and sixty parents whose reply totals did not reconcile.
      if (receivedInputs.length === 2) return auditReply({ segment: 2, comments: 150, mismatches: 60, continuationToken: tokens[1] });
      return auditReply({ segment: 3, comments: 3, mismatches: 0 });
    });
    const store = recordingHandleStore();

    await withServer(createResearchActionRoutes({ operations: [operation], youtubeContinuationHandles: store.handles }), async (post) => {
      const first = await post({ video_id_or_url: VIDEO_ID });
      expect(first.status).toBe(200);
      const firstHandle = (JSON.parse(first.text) as { continuation_token: string }).continuation_token;
      expect(firstHandle).toMatch(HANDLE);

      const second = await post({ continuation_token: firstHandle });
      expect(second.status).toBe(200);
      expect(Buffer.byteLength(second.text, "utf8")).toBeLessThanOrEqual(RESPONSE_LIMIT_BYTES);
      const { coverage_receipt: receipt, ...audit } = JSON.parse(second.text) as Record<string, unknown> & {
        coverage_receipt: { reply_count_mismatches: unknown[]; records_returned_for_analysis: number };
      };
      const sent = youtubeVideoCommunityAuditOutputSchema.parse(audit);
      // The receipt alone needs more than the 4,000 bytes the route used to hold back for it.
      expect(Buffer.byteLength(JSON.stringify(receipt), "utf8")).toBeGreaterThan(4_000);
      // Nothing but the sample is cut: both copies of the mismatch list are whole, and the receipt is the sent audit's.
      expect(sent.reply_count_mismatches).toHaveLength(60);
      expect(receipt).toEqual(projectDiscussionCoverageReceipt(sent));
      expect(sent.sample!.comments.length).toBeGreaterThan(0);
      expect(sent.sample!.comments.length).toBeLessThan(150);
      expect(sent.records_returned_for_analysis).toBe(sent.sample!.comments.length);
      expect(receipt.records_returned_for_analysis).toBe(sent.sample!.comments.length);

      // The reply carries the next handle, and the audit continues with it.
      expect(sent.continuation_token).toMatch(HANDLE);
      expect(sent.continuation_token).not.toBe(firstHandle);
      const third = await post({ continuation_token: sent.continuation_token });
      expect(third.status).toBe(200);
      expect(JSON.parse(third.text)).toMatchObject({ receipt: { synthesis_lock: "pass" } });
    });

    expect(receivedInputs).toEqual([
      { video_id_or_url: VIDEO_ID },
      { continuation_token: tokens[0] },
      { continuation_token: tokens[1] }
    ]);
    expect(store.calls).toEqual(["issue", "claim", "issue", "commit", "claim", "commit"]);
  });

  it("keeps the caller's handle usable when a reply cannot be sent at any sample size", async () => {
    const tokens = [`first.${"s".repeat(43)}`, `second.${"s".repeat(43)}`];
    const receivedInputs: Record<string, unknown>[] = [];
    const operation = auditOperation(async (input) => {
      receivedInputs.push(input);
      if (receivedInputs.length === 1) return auditReply({ segment: 1, comments: 3, mismatches: 0, continuationToken: tokens[0] });
      // 450 mismatches, listed in the audit and again in its receipt, pass the limit with no comment at all.
      if (receivedInputs.length === 2) return auditReply({ segment: 2, comments: 150, mismatches: 450, continuationToken: tokens[1] });
      return auditReply({ segment: 2, comments: 3, mismatches: 0 });
    });
    const store = recordingHandleStore();

    await withServer(createResearchActionRoutes({ operations: [operation], youtubeContinuationHandles: store.handles }), async (post) => {
      const first = await post({ video_id_or_url: VIDEO_ID });
      const handle = (JSON.parse(first.text) as { continuation_token: string }).continuation_token;
      expect(handle).toMatch(HANDLE);

      const refused = await post({ continuation_token: handle });
      expect(refused.status).toBe(502);
      expect(JSON.parse(refused.text)).toEqual({ error: { code: "action_response_too_large", retryable: false } });

      // The same handle is still good: the refused call did not consume it.
      const retried = await post({ continuation_token: handle });
      expect(retried.status).toBe(200);
      expect(JSON.parse(retried.text)).toMatchObject({ receipt: { synthesis_lock: "pass" } });
    });

    // The retry reached the operation with the same stateless token the refused call had.
    expect(receivedInputs).toEqual([
      { video_id_or_url: VIDEO_ID },
      { continuation_token: tokens[0] },
      { continuation_token: tokens[0] }
    ]);
    // The handle the refused reply would have carried is revoked, and the caller's own is released, then used.
    expect(store.calls).toEqual(["issue", "claim", "issue", "revoke", "rollback", "claim", "commit"]);
  });

  // The research session's controller calls the same route inside the process, where no byte limit applies. It took
  // the long reply before the HTTP reply was fitted to the limit, and a refusal there would have stopped its video
  // work for good (the second review of 13 Nov 2026). So a route made for it keeps the reply whole.
  it("leaves a caller inside the process its whole reply, however long the mismatch list", async () => {
    const operation = auditOperation(async () => auditReply({ segment: 1, comments: 150, mismatches: 450 }));
    const [route] = createResearchActionRoutes({ operations: [operation], replyWithinActionLimit: false });
    const result = await route!.handle({ request: {} as never, clientIp: "internal-controller", body: { video_id_or_url: VIDEO_ID } });
    expect(result.status).toBe(200);
    const body = result.body as { reply_count_mismatches: unknown[]; coverage_receipt: unknown };
    expect(body.reply_count_mismatches).toHaveLength(450);
    expect(body.coverage_receipt).toEqual(projectDiscussionCoverageReceipt(body as never));
    expect(Buffer.byteLength(JSON.stringify(body), "utf8")).toBeGreaterThan(RESPONSE_LIMIT_BYTES);

    // The same reply over HTTP is refused, as the test above shows, and never sent over the limit.
    const [bounded] = createResearchActionRoutes({ operations: [operation] });
    await expect(bounded!.handle({ request: {} as never, clientIp: "test", body: { video_id_or_url: VIDEO_ID } }))
      .rejects.toThrow();
  });
});

function auditOperation(execute: (input: Record<string, unknown>) => Promise<unknown>): ResearchOperation {
  return {
    name: "audit_youtube_video_community",
    actionPath: ACTION_PATH,
    description: "Retrieve one video's community audit.",
    inputSchema: youtubeVideoCommunityAuditInputSchema,
    outputSchema: youtubeVideoCommunityAuditOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    mcpConfig: {},
    async execute(input) {
      return {
        content: [{ type: "text", text: "Invented audit fixture" }],
        structuredContent: (await execute(input)) as Record<string, unknown>
      };
    }
  };
}

/** One audit segment as the operation returns it: a continuation token while pages remain, a terminal state without one. */
function auditReply(input: { segment: number; comments: number; mismatches: number; continuationToken?: string }) {
  const more = input.continuationToken !== undefined;
  const reconciled = input.mismatches === 0;
  const comments = Array.from({ length: input.comments }, (_, index) => {
    const id = `invented-comment-${String(index).padStart(3, "0")}`;
    const at = new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString();
    return {
      video_id: VIDEO_ID,
      comment_id: id,
      parent_id: null,
      top_level_comment_id: id,
      is_reply: false,
      text: `Invented comment ${index}. ${"made-up words for a size test ".repeat(12)}`,
      like_count: index,
      published_at: at,
      updated_at: at
    };
  });
  const retrieved = 200 * input.segment;
  return youtubeVideoCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: "2026-11-13T00:00:00.000Z",
    video_id: VIDEO_ID,
    canonical_url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    analysis_limit: 500,
    segment_index: input.segment,
    metadata_access_status: "api_visible_complete",
    access_status: more || !reconciled ? "partial" : "api_visible_complete",
    extraction_coverage: more ? "partial" : reconciled ? "api_visible_complete" : "completed_with_access_boundary",
    limitations: [],
    top_level_comments_retrieved_this_call: 200,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: 200,
    comment_thread_pages_this_call: 2,
    reply_pages_this_call: 0,
    top_level_comments_retrieved_cumulative: retrieved,
    replies_retrieved_cumulative: 0,
    records_retrieved_cumulative: retrieved,
    comment_thread_pages_cumulative: 2 * input.segment,
    reply_pages_cumulative: 0,
    records_returned_for_analysis: comments.length,
    top_level_records_returned_for_analysis: comments.length,
    reply_records_returned_for_analysis: 0,
    reply_count_mismatches: Array.from({ length: input.mismatches }, (_, index) => ({
      parent_comment_id: `invented-parent-${String(index).padStart(4, "0")}`,
      expected: 12 + index % 7,
      retrieved: 10
    })),
    corpus_rolling_sha256: "a".repeat(64),
    insufficient_depth: false,
    continuation_recommended: more,
    ...(more ? { continuation_token: input.continuationToken } : {}),
    sample: {
      mode: "all",
      corpus_count: retrieved,
      sampled_count: comments.length,
      comments
    },
    receipt: {
      completion_state: more ? "incomplete" : reconciled ? "api_visible_complete" : "completed_with_access_boundary",
      synthesis_lock: more ? "block" : "pass",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: !more,
      replies_reconciled: !more && reconciled,
      query_bounded_comments_used_as_corpus: false,
      blockers: more ? ["Additional API-visible YouTube comment or reply pages remain retrievable."] : []
    }
  });
}

/** A handle store that records, in order, what the route asked of it. */
function recordingHandleStore(): { handles: YoutubeActionContinuationHandleStore; calls: string[] } {
  const store = createYoutubeActionContinuationHandleStore();
  const calls: string[] = [];
  return {
    calls,
    handles: {
      issue(token) { calls.push("issue"); return store.issue(token); },
      claim(handle) { calls.push("claim"); return store.claim(handle); },
      commit(handle) { calls.push("commit"); store.commit(handle); },
      rollback(handle) { calls.push("rollback"); store.rollback(handle); },
      revoke(handle) { calls.push("revoke"); store.revoke(handle); }
    }
  };
}

/** The routes behind the real HTTP server and its router, which is where a reply over the limit is refused. */
async function withServer(
  actionRoutes: ReturnType<typeof createResearchActionRoutes>,
  callback: (post: (body: unknown) => Promise<{ status: number; text: string }>) => Promise<void>
): Promise<void> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    researchActionsEnabled: true,
    actionsEnabled: false,
    actionApiKey: "invented-action-key",
    researchActionContinuationSecret: "invented-continuation-secret-32-bytes",
    actionRoutes
  } as Parameters<typeof createAskRigorHttpServer>[0]);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    await callback(async (body) => {
      const response = await fetch(new URL(ACTION_PATH, `http://127.0.0.1:${port}`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      return { status: response.status, text: await response.text() };
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
