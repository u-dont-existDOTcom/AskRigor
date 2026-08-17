import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import {
  createAskRigorHttpServer,
  createResearchActionRoutes,
  type ResearchOperation,
  type ActionRoute
} from "../apps/research-mcp/src/index.js";
import {
  createConcurrencyLimiter,
  createTokenBucketLimiter
} from "../apps/research-mcp/src/rate-limit.js";
import { ActionResponseTooLargeError } from
  "../apps/research-mcp/src/actions/types.js";
import {
  youtubeVideoCommunityAuditInputSchema,
  youtubeVideoCommunityAuditOutputSchema
} from "../apps/research-mcp/src/youtube-video-community-audit.js";

const publicResearchRoute = (handle?: ActionRoute["handle"]): ActionRoute => ({
  method: "POST",
  path: "/actions/research/test_read",
  operationId: "test_read",
  summary: "Test read",
  description: "Read test data.",
  consequential: false,
  public: true,
  publicResearch: true,
  maximumResponseBytes: 60_000,
  requestSchema: { type: "object", additionalProperties: false },
  responseSchemas: { 200: { type: "object" } },
  handle: handle ?? (async () => ({ status: 200, body: { ok: true } }))
});

const TEST_CONTINUATION_SECRET = "research-action-test-secret-32-bytes";

const lessonLikeRoute: ActionRoute = {
  method: "POST",
  path: "/actions/test_write",
  operationId: "test_write",
  summary: "Test write",
  description: "Write test data.",
  consequential: true,
  public: false,
  requestSchema: { type: "object", additionalProperties: false },
  responseSchemas: { 200: { type: "object" } },
  async handle() {
    return { status: 200, body: { ok: true } };
  }
};

describe("research Action HTTP boundaries", () => {
  it("fails during construction when research Actions lack a usable continuation secret", () => {
    for (const researchActionContinuationSecret of [undefined, "short"]) {
      expect(() => createAskRigorHttpServer({
        publicServerEnabled: true,
        researchActionsEnabled: true,
        researchActionContinuationSecret
      } as Parameters<typeof createAskRigorHttpServer>[0] & {
        researchActionContinuationSecret?: string;
      })).toThrow(
        "Protocol continuation secret must contain at least 32 UTF-8 bytes"
      );
    }

    expect(() => createAskRigorHttpServer({
      publicServerEnabled: true,
      researchActionsEnabled: false,
      researchActionContinuationSecret: "short"
    } as Parameters<typeof createAskRigorHttpServer>[0] & {
      researchActionContinuationSecret?: string;
    })).not.toThrow();
  });

  it("controls research and lesson routes with independent switches", async () => {
    for (const [researchEnabled, lessonsEnabled, expected] of [
      [false, false, []],
      [true, false, ["test_read"]],
      [false, true, ["test_write"]],
      [true, true, ["test_read", "test_write"]]
    ] as const) {
      await withServer({
        researchActionsEnabled: researchEnabled,
        actionsEnabled: lessonsEnabled,
        actionRoutes: [publicResearchRoute(), lessonLikeRoute]
      }, async (baseUrl) => {
        expect((await fetch(new URL("/healthz", baseUrl))).status).toBe(200);
        const schemaResponse = await fetch(new URL("/actions/openapi.json", baseUrl));
        if (expected.length === 0) {
          expect(schemaResponse.status).toBe(404);
          return;
        }
        expect(schemaResponse.status).toBe(200);
        const schema = await schemaResponse.json() as {
          paths: Record<string, Record<string, { operationId: string }>>;
        };
        expect(Object.values(schema.paths).flatMap((path) =>
          Object.values(path).map(({ operationId }) => operationId)
        )).toEqual(expected);
      });
    }
  });

  it("shares one client token bucket between research Actions and MCP but not lessons", async () => {
    const limiter = () => createTokenBucketLimiter({
      capacity: 1,
      refillTokensPerMinute: 0,
      maxKeys: 10,
      idleTtlMs: 60_000,
      now: () => 1_000
    });

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: true,
      actionRoutes: [publicResearchRoute(), lessonLikeRoute],
      rateLimiter: limiter()
    }, async (baseUrl) => {
      expect((await researchRequest(baseUrl)).status).toBe(200);
      const mcp = await fetch(new URL("/mcp", baseUrl));
      expect(mcp.status).toBe(429);
    });

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: true,
      actionRoutes: [publicResearchRoute(), lessonLikeRoute],
      rateLimiter: limiter()
    }, async (baseUrl) => {
      await fetch(new URL("/mcp", baseUrl));
      const action = await researchRequest(baseUrl);
      expect(action.status).toBe(429);
      expect(await action.json()).toEqual({
        error: { code: "action_rate_limit_exceeded", retryable: true }
      });
    });

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: true,
      actionRoutes: [publicResearchRoute(), lessonLikeRoute],
      rateLimiter: limiter()
    }, async (baseUrl) => {
      expect((await fetch(new URL("/actions/test_write", baseUrl), {
        method: "POST",
        headers: { authorization: "Bearer test-action-secret" },
        body: "{}"
      })).status).toBe(200);
      expect((await fetch(new URL("/mcp", baseUrl))).status).not.toBe(429);
    });
  });

  it("shares one concurrency pool between a live research Action and MCP", async () => {
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const route = publicResearchRoute(async () => {
      enter();
      await blocked;
      return { status: 200, body: { ok: true } };
    });

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: false,
      actionRoutes: [route],
      concurrencyLimiter: createConcurrencyLimiter(1)
    }, async (baseUrl) => {
      const actionPromise = researchRequest(baseUrl);
      await entered;
      const mcp = await fetch(new URL("/mcp", baseUrl));
      expect(mcp.status).toBe(503);
      expect(await mcp.text()).toContain("concurrency_limit_exceeded");
      release();
      expect((await actionPromise).status).toBe(200);
    });
  });

  it("accepts exactly 60,000 serialized bytes and rejects 60,001 without truncation", async () => {
    const route = (characters: number) => publicResearchRoute(async () => ({
      status: 200,
      body: { data: "x".repeat(characters) }
    }));

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: false,
      actionRoutes: [route(59_989)]
    }, async (baseUrl) => {
      const response = await researchRequest(baseUrl);
      expect(response.status).toBe(200);
      expect(Buffer.byteLength(await response.text(), "utf8")).toBe(60_000);
    });

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: false,
      actionRoutes: [route(59_990)]
    }, async (baseUrl) => {
      const response = await researchRequest(baseUrl);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: { code: "action_response_too_large", retryable: false }
      });
    });
  });

  it("maps an irreducible Action adapter overflow to the declared 502 boundary", async () => {
    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: false,
      actionRoutes: [publicResearchRoute(async () => {
        throw new ActionResponseTooLargeError("Valid research output cannot fit the Action ceiling");
      })]
    }, async (baseUrl) => {
      const response = await researchRequest(baseUrl);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: { code: "action_response_too_large", retryable: false }
      });
    });
  });

  it("keeps one short YouTube continuation-handle store across HTTP requests", async () => {
    const statelessToken = `payload.${"s".repeat(6_000)}`;
    const receivedInputs: Record<string, unknown>[] = [];
    const operation: ResearchOperation = {
      name: "audit_youtube_video_community",
      actionPath: "/actions/research/audit_youtube_video_community",
      description: "Retrieve a complete per-video community audit.",
      inputSchema: youtubeVideoCommunityAuditInputSchema,
      outputSchema: youtubeVideoCommunityAuditOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      mcpConfig: {},
      async execute(input) {
        receivedInputs.push(input);
        return {
          content: [{ type: "text", text: "bounded continuation" }],
          structuredContent: httpYoutubeAuditOutput(
            receivedInputs.length === 1 ? statelessToken : undefined
          )
        };
      }
    };

    await withServer({
      researchActionsEnabled: true,
      actionsEnabled: false,
      actionRoutes: createResearchActionRoutes({ operations: [operation] })
    }, async (baseUrl) => {
      const first = await fetch(new URL(
        "/actions/research/audit_youtube_video_community",
        baseUrl
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          video_id_or_url: "XpZHKGGCK-o",
          analysis_limit: 100
        })
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json() as { continuation_token: string };
      expect(firstBody.continuation_token).toMatch(/^arh1_[A-Za-z0-9_-]{32}$/u);

      const second = await fetch(new URL(
        "/actions/research/audit_youtube_video_community",
        baseUrl
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ continuation_token: firstBody.continuation_token })
      });
      expect(second.status).toBe(200);
      expect(receivedInputs).toEqual([
        { video_id_or_url: "XpZHKGGCK-o", analysis_limit: 100 },
        { continuation_token: statelessToken }
      ]);
    });
  });
});

async function researchRequest(baseUrl: URL): Promise<Response> {
  return fetch(new URL("/actions/research/test_read", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
}

async function withServer<T>(
  options: Parameters<typeof createAskRigorHttpServer>[0] & {
    researchActionsEnabled?: boolean;
  },
  callback: (baseUrl: URL) => Promise<T>
): Promise<T> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    actionApiKey: "test-action-secret",
    researchActionContinuationSecret: TEST_CONTINUATION_SECRET,
    ...options
  } as Parameters<typeof createAskRigorHttpServer>[0] & {
    researchActionContinuationSecret: string;
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    return await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function httpYoutubeAuditOutput(continuationToken: string | undefined) {
  const complete = continuationToken === undefined;
  return youtubeVideoCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: "2026-08-16T00:00:00.000Z",
    video_id: "XpZHKGGCK-o",
    canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
    analysis_limit: 100,
    segment_index: complete ? 2 : 1,
    metadata_access_status: "api_visible_complete",
    access_status: complete ? "api_visible_complete" : "partial",
    extraction_coverage: complete ? "api_visible_complete" : "partial",
    limitations: [],
    top_level_comments_retrieved_this_call: 0,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: 0,
    comment_thread_pages_this_call: 0,
    reply_pages_this_call: 0,
    top_level_comments_retrieved_cumulative: 0,
    replies_retrieved_cumulative: 0,
    records_retrieved_cumulative: 0,
    comment_thread_pages_cumulative: 0,
    reply_pages_cumulative: 0,
    records_returned_for_analysis: 0,
    top_level_records_returned_for_analysis: 0,
    reply_records_returned_for_analysis: 0,
    reply_count_mismatches: [],
    corpus_rolling_sha256: "a".repeat(64),
    insufficient_depth: !complete,
    continuation_recommended: !complete,
    ...(continuationToken === undefined
      ? {}
      : { continuation_token: continuationToken }),
    receipt: {
      completion_state: complete ? "api_visible_complete" : "incomplete",
      synthesis_lock: complete ? "pass" : "block",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: complete,
      replies_reconciled: complete,
      query_bounded_comments_used_as_corpus: false,
      blockers: complete ? [] : ["Continue with the returned handle."]
    }
  });
}
