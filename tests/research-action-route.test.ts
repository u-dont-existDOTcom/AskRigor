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
      operations.map(({ name }) => name)
    );
    expect(routes.every((route) =>
      route.method === "POST" &&
      route.path === `/actions/research/${route.operationId}` &&
      route.public === true &&
      route.consequential === false &&
      route.publicResearch === true
    )).toBe(true);
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
      "200", "400", "413", "422", "429", "502", "503"
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
