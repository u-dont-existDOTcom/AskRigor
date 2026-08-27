import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  ActionRoute,
  ResearchOperation
} from "../apps/research-mcp/src/index.js";
import {
  createActionOpenApiDocument,
  createDefaultActionRoutes,
  createResearchActionRoutes
} from "../apps/research-mcp/src/index.js";
import { validateActionRoutes } from
  "../apps/research-mcp/src/actions/router.js";
import { youtubeVideoCommunityAuditOutputSchema } from
  "../apps/research-mcp/src/youtube-video-community-audit.js";
import { youtubeVideoCommunityAuditInputSchema } from
  "../apps/research-mcp/src/youtube-video-community-audit.js";

const context = (body: unknown) => ({
  request: {} as never,
  clientIp: "127.0.0.1",
  body
});

describe("read-only research Action routes", () => {
  it("exposes the exact frozen registry as public non-consequential POST routes", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as Record<string, unknown>;
    const factory = module.createResearchActionRoutes as
      (() => readonly ActionRoute[]) | undefined;
    const operations = module.RESEARCH_OPERATIONS as readonly ResearchOperation[];

    expect(factory).toBeTypeOf("function");
    const routes = factory!();
    expect(routes.map(({ operationId }) => operationId)).toEqual(
      operations.filter(({ actionEnabled }) => actionEnabled !== false)
        .map(({ name }) => name)
    );
    expect(routes.every((route) =>
      route.method === "POST" &&
      route.path === `/actions/research/${route.operationId}` &&
      route.public === true &&
      route.consequential === false &&
      route.publicResearch === true
    )).toBe(true);
  });

  it("directs oversized legacy YouTube workflows to the resumable per-video Action path", () => {
    const routes = createResearchActionRoutes();
    for (const operationId of ["get_youtube_comments", "audit_youtube_community"]) {
      const route = routes.find((candidate) => candidate.operationId === operationId);
      expect(route?.description).toContain("survey_youtube_community");
      expect(route?.description).toContain("audit_youtube_video_community");
      expect(route?.description).toContain("action_response_too_large");
    }
  });

  it("strictly rejects unknown input fields before calling the shared handler", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as Record<string, unknown>;
    const factory = module.createResearchActionRoutes as
      ((options?: { operations?: readonly ResearchOperation[] }) => readonly ActionRoute[]);
    let calls = 0;
    const operation: ResearchOperation = {
      name: "test_read",
      actionPath: "/actions/research/test_read",
      description: "Read test data.",
      inputSchema: z.object({ identifier: z.string() }).strict(),
      outputSchema: z.object({ ok: z.literal(true) }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      mcpConfig: {},
      async execute() {
        calls += 1;
        return {
          content: [{ type: "text", text: "ok" }],
          structuredContent: { ok: true }
        };
      }
    };

    const [route] = factory({ operations: [operation] });
    const result = await route!.handle(context({ identifier: "A", extra: true }));

    expect(result).toEqual({
      status: 422,
      body: { error: { code: "action_input_invalid", retryable: false } }
    });
    expect(calls).toBe(0);
  });

  it("returns only schema-valid structured content and fails closed otherwise", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as Record<string, unknown>;
    const factory = module.createResearchActionRoutes as
      ((options?: { operations?: readonly ResearchOperation[] }) => readonly ActionRoute[]);
    const operation = (structuredContent: Record<string, unknown>): ResearchOperation => ({
      name: "test_read",
      actionPath: "/actions/research/test_read",
      description: "Read test data.",
      inputSchema: z.object({ identifier: z.string() }).strict(),
      outputSchema: z.object({ ok: z.literal(true) }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      mcpConfig: {},
      async execute() {
        return {
          content: [{ type: "text", text: "summary must not cross the Action boundary" }],
          structuredContent
        };
      }
    });

    const [validRoute] = factory({ operations: [operation({ ok: true })] });
    await expect(validRoute!.handle(context({ identifier: "A" }))).resolves.toEqual({
      status: 200,
      body: { ok: true }
    });

    const [invalidRoute] = factory({ operations: [operation({ ok: false })] });
    await expect(invalidRoute!.handle(context({ identifier: "A" })))
      .rejects.toThrow("Research operation returned invalid structured output");
  });

  it("transport-bounds only the per-video YouTube audit Action result", async () => {
    const original = oversizedYoutubeAuditOutput();
    const operation: ResearchOperation = {
      name: "audit_youtube_video_community",
      actionPath: "/actions/research/audit_youtube_video_community",
      description: "Retrieve a complete per-video community audit.",
      inputSchema: z.object({}).strict(),
      outputSchema: youtubeVideoCommunityAuditOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false
      },
      mcpConfig: {},
      async execute() {
        return {
          content: [{ type: "text", text: "complete" }],
          structuredContent: original
        };
      }
    };
    const [route] = createResearchActionRoutes({ operations: [operation] });
    const result = await route!.handle(context({}));
    const { coverage_receipt: coverageReceipt, ...baseBody } = result.body as
      Record<string, unknown>;
    const bounded = youtubeVideoCommunityAuditOutputSchema.parse(baseBody);

    expect(result.status).toBe(200);
    expect(Buffer.byteLength(JSON.stringify(original), "utf8")).toBeGreaterThan(60_000);
    expect(Buffer.byteLength(JSON.stringify(result.body), "utf8")).toBeLessThanOrEqual(60_000);
    expect(bounded.sample!.comments.length).toBeLessThan(original.sample.comments.length);
    expect(bounded.receipt).toEqual(original.receipt);
    expect(coverageReceipt).toMatchObject({
      source_video_id: "XpZHKGGCK-o",
      access_status: "api_visible_complete",
      records_retrieved_cumulative: 100,
      receipt: { synthesis_lock: "pass" }
    });
    expect(original.sample.comments).toHaveLength(100);
  });

  it("relays a short Action handle while the shared YouTube operation receives the exact stateless token", async () => {
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
          structuredContent: receivedInputs.length === 1
            ? youtubeAuditContinuationOutput(statelessToken)
            : oversizedYoutubeAuditOutput()
        };
      }
    };
    const [route] = createResearchActionRoutes({ operations: [operation] });

    const first = await route!.handle(context({
      video_id_or_url: "XpZHKGGCK-o",
      analysis_limit: 100
    }));
    const handle = (first.body as { continuation_token: string }).continuation_token;

    expect(handle).toMatch(/^arh1_[A-Za-z0-9_-]{32}$/u);
    expect(handle).toHaveLength(37);
    expect(handle).not.toContain(statelessToken);

    const second = await route!.handle(context({ continuation_token: handle }));

    expect(second.status).toBe(200);
    expect(receivedInputs).toEqual([
      { video_id_or_url: "XpZHKGGCK-o", analysis_limit: 100 },
      { continuation_token: statelessToken }
    ]);

    await expect(route!.handle(context({ continuation_token: handle })))
      .resolves.toMatchObject({
        status: 422,
        body: {
          error: {
            code: "youtube_action_continuation_invalid_or_expired"
          }
        }
      });
  });

  it("accepts a pre-deployment stateless token without Action-handle translation", async () => {
    const statelessToken = `payload.${"s".repeat(43)}`;
    let receivedInput: Record<string, unknown> | undefined;
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
        receivedInput = input;
        return {
          content: [{ type: "text", text: "complete" }],
          structuredContent: oversizedYoutubeAuditOutput()
        };
      }
    };
    const [route] = createResearchActionRoutes({ operations: [operation] });

    const result = await route!.handle(context({
      continuation_token: statelessToken
    }));

    expect(result.status).toBe(200);
    expect(receivedInput).toEqual({ continuation_token: statelessToken });
  });

  it("preserves a claimed handle when the shared provider operation returns its failure envelope", async () => {
    const statelessToken = `payload.${"s".repeat(43)}`;
    let calls = 0;
    const operation: ResearchOperation = youtubeAuditOperation(async (input) => {
      calls += 1;
      if (calls === 1) return youtubeAuditContinuationOutput(statelessToken);
      expect(input).toEqual({ continuation_token: statelessToken });
      return calls === 2 ? youtubeAuditFailureOutput() : oversizedYoutubeAuditOutput();
    });
    const [route] = createResearchActionRoutes({ operations: [operation] });
    const first = await route!.handle(context({
      video_id_or_url: "XpZHKGGCK-o",
      analysis_limit: 100
    }));
    const handle = (first.body as { continuation_token: string }).continuation_token;

    const failed = await route!.handle(context({ continuation_token: handle }));
    expect(failed).toMatchObject({
      status: 200,
      body: {
        access_status: "error",
        receipt: { completion_state: "incomplete", synthesis_lock: "block" }
      }
    });
    await expect(route!.handle(context({ continuation_token: handle })))
      .resolves.toMatchObject({
        status: 200,
        body: { receipt: { synthesis_lock: "pass" } }
      });
  });

  it("consumes a claimed handle when identifier membership reaches a terminal boundary", async () => {
    const statelessToken = `payload.${"s".repeat(43)}`;
    let calls = 0;
    const operation: ResearchOperation = youtubeAuditOperation(async (input) => {
      calls += 1;
      if (calls === 1) return youtubeAuditContinuationOutput(statelessToken);
      expect(input).toEqual({ continuation_token: statelessToken });
      return youtubeAuditIdentifierMembershipBoundaryOutput();
    });
    const [route] = createResearchActionRoutes({ operations: [operation] });
    const first = await route!.handle(context({
      video_id_or_url: "XpZHKGGCK-o",
      analysis_limit: 100
    }));
    const handle = (first.body as { continuation_token: string }).continuation_token;

    const failed = await route!.handle(context({ continuation_token: handle }));
    expect(failed).toMatchObject({
      status: 200,
      body: {
        error: {
          code: "youtube_video_audit_identifier_membership_boundary",
          retryable: false
        },
        records_retrieved_cumulative: 501,
        receipt: {
          completion_state: "completed_with_access_boundary",
          synthesis_lock: "pass"
        }
      }
    });
    await expect(route!.handle(context({ continuation_token: handle })))
      .resolves.toMatchObject({
        status: 422,
        body: {
          error: { code: "youtube_action_continuation_invalid_or_expired" }
        }
      });
    expect(calls).toBe(2);
  });

  it("allows only one concurrent request to claim an Action continuation handle", async () => {
    const statelessToken = `payload.${"s".repeat(43)}`;
    let calls = 0;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const operation: ResearchOperation = youtubeAuditOperation(async () => {
      calls += 1;
      if (calls === 1) return youtubeAuditContinuationOutput(statelessToken);
      await blocked;
      return oversizedYoutubeAuditOutput();
    });
    const [route] = createResearchActionRoutes({ operations: [operation] });
    const first = await route!.handle(context({
      video_id_or_url: "XpZHKGGCK-o",
      analysis_limit: 100
    }));
    const handle = (first.body as { continuation_token: string }).continuation_token;

    const claimed = route!.handle(context({ continuation_token: handle }));
    const replay = await route!.handle(context({ continuation_token: handle }));
    expect(replay).toMatchObject({
      status: 422,
      body: {
        error: { code: "youtube_action_continuation_invalid_or_expired" }
      }
    });
    expect(calls).toBe(2);
    release();
    await expect(claimed).resolves.toMatchObject({ status: 200 });
    expect(calls).toBe(2);
  });

  it("fails closed with a stable 422 when an Action handle is unavailable", async () => {
    let executions = 0;
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
      async execute() {
        executions += 1;
        return {
          content: [{ type: "text", text: "must not execute" }],
          structuredContent: oversizedYoutubeAuditOutput()
        };
      }
    };
    const [route] = createResearchActionRoutes({ operations: [operation] });

    const result = await route!.handle(context({
      continuation_token: `arh1_${"x".repeat(32)}`
    }));

    expect(result).toEqual({
      status: 422,
      body: {
        error: {
          code: "youtube_action_continuation_invalid_or_expired",
          retryable: false
        }
      }
    });
    expect(executions).toBe(0);
  });

  it("composes research and lesson routes under independent switches", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as
      Record<string, unknown>;
    const compose = module.createEnabledActionRoutes as
      ((options: {
        researchEnabled: boolean;
        lessonsEnabled: boolean;
        research: readonly ActionRoute[];
        lessons: readonly ActionRoute[];
      }) => readonly ActionRoute[]) | undefined;
    const research = createResearchActionRoutes().slice(0, 1);
    const lessons = createDefaultActionRoutes();

    expect(compose).toBeTypeOf("function");
    expect(compose!({
      researchEnabled: false,
      lessonsEnabled: false,
      research,
      lessons
    })).toEqual([]);
    expect(compose!({
      researchEnabled: true,
      lessonsEnabled: false,
      research,
      lessons
    }).map(({ operationId }) => operationId)).toEqual(["get_protocol_manifest"]);
    expect(compose!({
      researchEnabled: false,
      lessonsEnabled: true,
      research,
      lessons
    }).map(({ operationId }) => operationId)).toEqual(["submit_lesson_candidate"]);
    expect(compose!({
      researchEnabled: true,
      lessonsEnabled: true,
      research,
      lessons
    }).map(({ operationId }) => operationId)).toEqual([
      "get_protocol_manifest",
      "submit_lesson_candidate"
    ]);
  });

  it("generates 17 unsecured read operations plus the one secured lesson write", () => {
    const document = createActionOpenApiDocument([
      ...createResearchActionRoutes(),
      ...createDefaultActionRoutes()
    ]) as {
      paths: Record<string, Record<string, {
        operationId: string;
        security?: unknown;
        "x-openai-isConsequential": boolean;
      }>>;
    };
    const operations = Object.values(document.paths)
      .flatMap((path) => Object.values(path));

    expect(operations).toHaveLength(18);
    expect(new Set(operations.map(({ operationId }) => operationId)).size).toBe(18);
    const lesson = operations.find(({ operationId }) =>
      operationId === "submit_lesson_candidate"
    );
    expect(lesson).toMatchObject({
      security: [{ bearerAuth: [] }],
      "x-openai-isConsequential": true
    });
    expect(operations.filter(({ operationId }) =>
      operationId !== "submit_lesson_candidate"
    ).every((operation) =>
      operation.security === undefined &&
      operation["x-openai-isConsequential"] === false
    )).toBe(true);

    const manifestOperation = document.paths[
      "/actions/research/get_protocol_manifest"
    ]!.post as unknown as { responses: Record<string, unknown> };
    expect(Object.keys(manifestOperation.responses)).toEqual([
      "200", "400", "413", "422", "429", "500", "502", "503"
    ]);
    expect(manifestOperation.responses).toMatchObject({
      429: {
        content: { "application/json": { schema: {
          properties: { error: { properties: {
            code: { const: "action_rate_limit_exceeded" },
            retryable: { const: true }
          } } }
        } } }
      },
      502: {
        content: { "application/json": { schema: {
          properties: { error: { properties: {
            code: { const: "action_response_too_large" },
            retryable: { const: false }
          } } }
        } } }
      },
      500: {
        content: { "application/json": { schema: {
          properties: { error: { properties: {
            code: { const: "action_internal_error" },
            retryable: { const: false }
          } } }
        } } }
      },
      503: {
        content: { "application/json": { schema: {
          properties: { error: { properties: {
            code: { const: "action_concurrency_limit_exceeded" },
            retryable: { const: true }
          } } }
        } } }
      }
    });
  });

  it("rejects contradictory public-research route metadata", () => {
    const [base] = createResearchActionRoutes().slice(0, 1);
    expect(base).toBeDefined();

    for (const route of [
      { ...base!, public: false },
      { ...base!, consequential: true },
      { ...base!, method: "GET" as const },
      { ...base!, path: "/actions/not-research" as const }
    ]) {
      expect(() => validateActionRoutes([route])).toThrow(
        "Invalid public research Action route"
      );
    }
  });

  it("rejects nonpositive or unsafe Action response byte limits", () => {
    const [base] = createResearchActionRoutes().slice(0, 1);
    expect(base).toBeDefined();

    for (const maximumResponseBytes of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1
    ]) {
      expect(() => validateActionRoutes([{
        ...base!,
        maximumResponseBytes
      }])).toThrow("Invalid Action response byte limit");
    }
  });

  it("uses exact bounded continuation only for the Action load_protocol form", async () => {
    const module = await import("../apps/research-mcp/src/index.js") as
      Record<string, unknown>;
    const factory = module.createResearchActionRoutes as (options: {
      protocolChunkDependencies: {
        continuationSecret: string;
        now: () => number;
        loadProtocol: () => Promise<string>;
        getProtocolManifest: () => Promise<{
          name: string;
          version: string;
          revisionDate: string;
          sha256: string;
        }>;
      };
    }) => readonly ActionRoute[];
    const protocolText = `<Protocol>${"x".repeat(60_000)}</Protocol>`;
    const digest = createHash("sha256")
      .update(Buffer.from(protocolText, "utf8"))
      .digest("hex");
    const routes = factory({
      protocolChunkDependencies: {
        continuationSecret: "c".repeat(32),
        now: () => 1_787_000_000_000,
        async loadProtocol() {
          return protocolText;
        },
        async getProtocolManifest() {
          return {
            name: "AskRigor HRP",
            version: "test",
            revisionDate: "2026-08-16",
            sha256: digest
          };
        }
      }
    });
    const route = routes.find(({ operationId }) => operationId === "load_protocol");
    expect(route).toBeDefined();

    const first = await route!.handle(context({ protocol: "hrp" }));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      protocol: "hrp",
      chunk_index: 0,
      chunk_count: 2,
      complete: false
    });
    expect(Buffer.byteLength(
      (first.body as { text: string }).text,
      "utf8"
    )).toBeLessThanOrEqual(48_000);

    const invalid = await route!.handle(context({
      protocol: "hrp",
      cursor: "not-a-valid-token"
    }));
    expect(invalid).toEqual({
      status: 422,
      body: {
        error: {
          code: "protocol_action_continuation_invalid",
          retryable: false
        }
      }
    });
  });
});

function oversizedYoutubeAuditOutput() {
  const comments = Array.from({ length: 100 }, (_, index) => ({
    video_id: "XpZHKGGCK-o",
    comment_id: `comment-${String(index).padStart(3, "0")}`,
    parent_id: null,
    top_level_comment_id: `comment-${String(index).padStart(3, "0")}`,
    is_reply: false,
    text: `Comment ${index} ${"evidence ".repeat(120)}`,
    like_count: index,
    published_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString()
  }));
  return youtubeVideoCommunityAuditOutputSchema.parse({
    provider: "youtube",
    record_type: "youtube_video_community_audit",
    retrieved_at: "2026-08-16T00:00:00.000Z",
    video_id: "XpZHKGGCK-o",
    canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
    analysis_limit: 100,
    segment_index: 1,
    metadata_access_status: "api_visible_complete",
    access_status: "api_visible_complete",
    extraction_coverage: "api_visible_complete",
    limitations: [],
    top_level_comments_retrieved_this_call: 100,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: 100,
    comment_thread_pages_this_call: 5,
    reply_pages_this_call: 0,
    top_level_comments_retrieved_cumulative: 100,
    replies_retrieved_cumulative: 0,
    records_retrieved_cumulative: 100,
    comment_thread_pages_cumulative: 5,
    reply_pages_cumulative: 0,
    records_returned_for_analysis: 100,
    top_level_records_returned_for_analysis: 100,
    reply_records_returned_for_analysis: 0,
    reply_count_mismatches: [],
    corpus_rolling_sha256: "a".repeat(64),
    insufficient_depth: false,
    continuation_recommended: false,
    sample: {
      mode: "all",
      corpus_count: 100,
      sampled_count: 100,
      comments
    },
    receipt: {
      completion_state: "api_visible_complete",
      synthesis_lock: "pass",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: true,
      replies_reconciled: true,
      query_bounded_comments_used_as_corpus: false,
      blockers: []
    }
  });
}

function youtubeAuditContinuationOutput(continuationToken: string) {
  return youtubeVideoCommunityAuditOutputSchema.parse({
    ...oversizedYoutubeAuditOutput(),
    segment_index: 1,
    access_status: "partial",
    extraction_coverage: "partial",
    continuation_recommended: true,
    continuation_token: continuationToken,
    receipt: {
      completion_state: "incomplete",
      synthesis_lock: "block",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: false,
      replies_reconciled: false,
      query_bounded_comments_used_as_corpus: false,
      blockers: ["Continue with the returned continuation token."]
    }
  });
}

function youtubeAuditOperation(
  execute: (input: Record<string, unknown>) => Promise<unknown>
): ResearchOperation {
  return {
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
      return {
        content: [{ type: "text", text: "YouTube audit fixture" }],
        structuredContent: await execute(input)
      };
    }
  };
}

function youtubeAuditFailureOutput() {
  return youtubeVideoCommunityAuditOutputSchema.parse({
    ...oversizedYoutubeAuditOutput(),
    segment_index: 0,
    metadata_access_status: "error",
    access_status: "error",
    extraction_coverage: "partial",
    limitations: ["YouTube video community audit failed before reaching a valid completion state."],
    error: {
      code: "youtube_video_community_audit_failed",
      message: "YouTube video community audit failed",
      retryable: false
    },
    top_level_comments_retrieved_this_call: 0,
    replies_retrieved_this_call: 0,
    records_retrieved_this_call: 0,
    records_returned_for_analysis: 0,
    top_level_records_returned_for_analysis: 0,
    reply_records_returned_for_analysis: 0,
    continuation_recommended: false,
    continuation_token: undefined,
    sample: undefined,
    receipt: {
      completion_state: "incomplete",
      synthesis_lock: "block",
      chain_started_at_first_page: false,
      top_level_pagination_exhausted: false,
      replies_reconciled: false,
      query_bounded_comments_used_as_corpus: false,
      blockers: ["YouTube video community audit failed before reaching a valid completion state."]
    }
  });
}

function youtubeAuditIdentifierMembershipBoundaryOutput() {
  const limitation =
    "A possible identifier-membership match was detected after the exact sample became bounded, so the server cannot prove whether the record was already accepted. The affected audit stopped at the last verified frontier and did not count the rejected record.";
  return youtubeVideoCommunityAuditOutputSchema.parse({
    ...youtubeAuditFailureOutput(),
    video_id: "XpZHKGGCK-o",
    canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
    segment_index: 6,
    access_status: "partial",
    extraction_coverage: "completed_with_access_boundary",
    limitations: [limitation],
    error: {
      code: "youtube_video_audit_identifier_membership_boundary",
      message: limitation,
      retryable: false
    },
    top_level_comments_retrieved_cumulative: 501,
    records_retrieved_cumulative: 501,
    comment_thread_pages_cumulative: 26,
    corpus_rolling_sha256: "b".repeat(64),
    receipt: {
      completion_state: "completed_with_access_boundary",
      synthesis_lock: "pass",
      chain_started_at_first_page: true,
      top_level_pagination_exhausted: false,
      replies_reconciled: false,
      query_bounded_comments_used_as_corpus: false,
      blockers: []
    }
  });
}
