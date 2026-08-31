import { chmod, mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LessonSubmissionResult } from
  "../apps/research-mcp/src/lessons/contracts.js";
import {
  createLessonActionRoute,
  LESSON_ACTION_REQUEST_SCHEMA,
  LESSON_ACTION_RESPONSE_SCHEMAS,
} from "../apps/research-mcp/src/lessons/action-route.js";
import {
  createDefaultActionRoutes,
  createLessonRuntimeFromEnv,
} from "../apps/research-mcp/src/lessons/runtime.js";
import {
  createAskRigorHttpServer,
  createAskRigorServer,
} from "../apps/research-mcp/src/server.js";

const validCandidate = {
  category: "missing_sources",
  general_lesson: "When material factual claims are made, AskRigor should attach traceable sources.",
  expected_behavior: "Cite each material claim near the sentence it supports and expose any source-access boundary.",
  failure_reason: "The answer asserted a conclusion without giving the user a way to inspect its evidence.",
  synthetic_regression_example: "A response ranks two interventions but supplies no citations for either ranking.",
  evidence_basis: "assistant_self_check",
  askrigor_version: "0.1.0",
  protocol_identities: [{
    name: "HRP",
    version: "20.5.17",
    sha256: "a".repeat(64),
  }],
  consent_scope: "once",
};

const expectedRequestSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "general_lesson",
    "expected_behavior",
    "failure_reason",
    "synthetic_regression_example",
    "evidence_basis",
    "consent_scope",
  ],
  properties: {
    category: {
      type: "string",
      enum: [
        "missing_sources",
        "conflicting_claims",
        "incomplete_research",
        "evidence_weighting",
        "community_corpus",
        "tool_semantics",
        "protocol_execution",
        "privacy_or_safety",
        "usability",
        "other",
      ],
    },
    general_lesson: { type: "string", minLength: 40, maxLength: 600 },
    expected_behavior: { type: "string", minLength: 40, maxLength: 1_200 },
    failure_reason: { type: "string", minLength: 20, maxLength: 800 },
    synthetic_regression_example: { type: "string", minLength: 20, maxLength: 1_200 },
    evidence_basis: {
      type: "string",
      enum: [
        "assistant_self_check",
        "tool_receipt_conflict",
        "source_recheck",
        "instruction_mismatch",
      ],
    },
    askrigor_version: { type: "string", minLength: 1, maxLength: 64 },
    protocol_identities: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "version"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 64 },
          version: { type: "string", minLength: 1, maxLength: 64 },
          sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        },
      },
    },
    consent_scope: { type: "string", enum: ["once", "conversation"] },
  },
};

const successfulResultProperties = {
  candidate_id: { type: "string", pattern: "^ARL-[0-9]{4,}$" },
  occurrence_count: { type: "integer", minimum: 1 },
  retryable: { const: false },
};

const expectedResponseSchemas = {
  200: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "candidate_id", "occurrence_count", "retryable"],
        properties: { status: { const: "submitted" }, ...successfulResultProperties },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "candidate_id", "occurrence_count", "retryable"],
        properties: { status: { const: "existing_candidate" }, ...successfulResultProperties },
      },
    ],
  },
  415: {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "retryable"],
        properties: {
          code: { const: "action_json_content_type_required" },
          retryable: { const: false },
        },
      },
    },
  },
  422: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "reason_code"],
    properties: {
      status: { const: "privacy_rejected" },
      retryable: { const: false },
      reason_code: { const: "unsafe_candidate" },
    },
  },
  429: {
    type: "object",
    additionalProperties: false,
    required: ["status", "retryable", "retry_after_seconds", "reason_code"],
    properties: {
      status: { const: "rate_limited" },
      retryable: { const: true },
      retry_after_seconds: { type: "integer", minimum: 1 },
      reason_code: { type: "string", enum: ["hourly_limit", "daily_limit"] },
    },
  },
  503: {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "retryable", "reason_code"],
        properties: {
          status: { const: "anonymizer_unavailable" },
          retryable: { type: "boolean" },
          reason_code: {
            type: "string",
            enum: ["ai_budget_exhausted", "privacy_service_unavailable"],
          },
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["status", "retryable", "reason_code"],
        properties: {
          status: { const: "github_unavailable" },
          retryable: { type: "boolean" },
          reason_code: {
            type: "string",
            enum: ["github_auth_unavailable", "github_service_unavailable"],
          },
        },
      },
    ],
  },
};

const runtimeEnvironmentKeys = [
  "ASKRIGOR_ACTIONS_ENABLED",
  "ASKRIGOR_ACTIONS_API_KEY",
  "OPENAI_API_KEY",
  "ASKRIGOR_AI_BUDGET_LEDGER",
  "ASKRIGOR_AI_MONTHLY_BUDGET_USD",
  "ASKRIGOR_GITHUB_APP_ID",
  "ASKRIGOR_GITHUB_INSTALLATION_ID",
  "ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64",
  "ASKRIGOR_LESSONS_REPOSITORY",
] as const;

const originalEnvironment = Object.fromEntries(
  runtimeEnvironmentKeys.map((key) => [key, process.env[key]]),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const key of runtimeEnvironmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("consequential lesson Action", () => {
  it("requires the Action Bearer key before invoking the lesson service", async () => {
    const submit = vi.fn(async () => submitted());
    const route = createLessonActionRoute({ submit });

    await withHttpServer(route, async (baseUrl) => {
      for (const authorization of [undefined, "Bearer wrong-action-key"]) {
        const response = await fetch(new URL("/actions/lessons", baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: JSON.stringify(validCandidate),
        });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({
          error: { code: "action_auth_required", retryable: false },
        });
      }
    });

    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts only JSON content and passes its parsed object to the service exactly once", async () => {
    const submit = vi.fn(async () => submitted());
    const route = createLessonActionRoute({ submit });

    await withHttpServer(route, async (baseUrl) => {
      for (const contentType of [undefined, "text/plain"]) {
        const response = await fetch(new URL("/actions/lessons", baseUrl), {
          method: "POST",
          headers: {
            authorization: "Bearer test-action-key",
            ...(contentType ? { "content-type": contentType } : {}),
          },
          body: JSON.stringify(validCandidate),
        });
        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({
          error: { code: "action_json_content_type_required", retryable: false },
        });
      }

      for (const body of ["not-json", "x".repeat(8_193)]) {
        const response = await fetch(new URL("/actions/lessons", baseUrl), {
          method: "POST",
          headers: {
            authorization: "Bearer test-action-key",
            "content-type": "text/plain",
          },
          body,
        });
        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({
          error: { code: "action_json_content_type_required", retryable: false },
        });
      }

      for (const contentType of [
        "application/json;",
        "application/json; garbage",
        "application/json;charset",
      ]) {
        const response = await fetch(new URL("/actions/lessons", baseUrl), {
          method: "POST",
          headers: {
            authorization: "Bearer test-action-key",
            "content-type": contentType,
          },
          body: JSON.stringify(validCandidate),
        });
        expect(response.status).toBe(415);
        expect(await response.json()).toEqual({
          error: { code: "action_json_content_type_required", retryable: false },
        });
      }

      const accepted = await fetch(new URL("/actions/lessons", baseUrl), {
        method: "POST",
        headers: {
          authorization: "Bearer test-action-key",
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(validCandidate),
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toEqual(submitted());
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(validCandidate);
  });

  it.each([
    [submitted(), 200, null],
    [{
      status: "existing_candidate",
      candidate_id: "ARL-0042",
      occurrence_count: 3,
      retryable: false,
    }, 200, null],
    [{
      status: "privacy_rejected",
      retryable: false,
      reason_code: "unsafe_candidate",
    }, 422, null],
    [{
      status: "rate_limited",
      retryable: true,
      retry_after_seconds: 73,
      reason_code: "hourly_limit",
    }, 429, "73"],
    [{
      status: "anonymizer_unavailable",
      retryable: true,
      reason_code: "privacy_service_unavailable",
    }, 503, null],
    [{
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_auth_unavailable",
    }, 503, null],
  ] as const)("maps public result %# to HTTP %i", async (result, status, retryAfter) => {
    const route = createLessonActionRoute({ submit: async () => result });

    await withHttpServer(route, async (baseUrl) => {
      const response = await postLesson(baseUrl);
      expect(response.status).toBe(status);
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      expect(await response.json()).toEqual(result);
    });
  });

  it("strictly rejects malformed dependency output and never leaks private fields", async () => {
    const privateValues = [
      "https://github.com/u-dont-existDOTcom/AskRigor-lessons/issues/42",
      "private candidate content",
      "private provider error",
    ];
    const services = [
      {
        submit: async () => ({
          ...submitted(),
          issue_number: 42,
          private_url: privateValues[0],
          candidate: privateValues[1],
        }),
      },
      {
        submit: async () => {
          throw new Error(privateValues[2]);
        },
      },
    ];

    for (const service of services) {
      const route = createLessonActionRoute(service as never);
      await withHttpServer(route, async (baseUrl) => {
        const response = await postLesson(baseUrl);
        expect(response.status).toBe(503);
        const body = await response.text();
        expect(JSON.parse(body)).toEqual({
          status: "github_unavailable",
          retryable: false,
          reason_code: "github_service_unavailable",
        });
        for (const privateValue of privateValues) expect(body).not.toContain(privateValue);
        expect(body).not.toContain("42");
      });
    }
  });

  it("publishes immutable private/consequential metadata and exact strict schemas", () => {
    const route = createLessonActionRoute({ submit: async () => submitted() });

    expect(route).toMatchObject({
      method: "POST",
      path: "/actions/lessons",
      operationId: "submit_lesson_candidate",
      public: false,
      consequential: true,
    });
    expect(route.summary.length).toBeLessThanOrEqual(300);
    expect(route.description.length).toBeLessThanOrEqual(700);
    expect(Object.isFrozen(route)).toBe(true);
    expect(() => { (route as { public: boolean }).public = true; }).toThrow();
    expect(() => { (route as { consequential: boolean }).consequential = false; }).toThrow();
    expect(LESSON_ACTION_REQUEST_SCHEMA).toEqual(expectedRequestSchema);
    expect(LESSON_ACTION_RESPONSE_SCHEMAS).toEqual(expectedResponseSchemas);
    expect(route.requestSchema).toEqual(expectedRequestSchema);
    expect(route.responseSchemas).toEqual(expectedResponseSchemas);
    const serialized = JSON.stringify(route.requestSchema) + JSON.stringify(route.responseSchemas);
    expect(objectKeys(route.requestSchema)).not.toEqual(expect.arrayContaining(["example", "examples"]));
    expect(objectKeys(route.responseSchemas)).not.toEqual(expect.arrayContaining(["example", "examples"]));
    expect(serialized).not.toContain("test-action-key");
    expect(serialized).not.toContain("test-openai-key");
    expect(serialized).not.toContain("u-dont-existDOTcom");
    expect(serialized).not.toContain("github.com");
  });

  it("leaves the lesson path as 404 when the registered Action routes omit it", async () => {
    const server = createAskRigorHttpServer({
      publicServerEnabled: true,
      actionsEnabled: true,
      actionApiKey: "test-action-key",
      actionRoutes: [],
    });
    await listen(server);
    const address = server.address() as AddressInfo;
    try {
      const response = await fetch(
        new URL(`/actions/lessons`, `http://127.0.0.1:${address.port}`),
        {
          method: "POST",
          headers: {
            authorization: "Bearer test-action-key",
            "content-type": "text/plain",
          },
          body: "not-json",
        },
      );
      expect(response.status).toBe(404);
    } finally {
      await close(server);
    }
  });

  it("does not add a lesson operation to the twenty-two-tool MCP inventory", async () => {
    const server = createAskRigorServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "lesson-action-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(22);
      expect(tools.tools.map(({ name }) => name)).not.toContain("submit_lesson_candidate");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});

describe("environment-backed lesson runtime", () => {
  it.each(["50", "50.00"])("accepts only the exact $%s monthly budget spelling", async (budget) => {
    const directory = await safeTemporaryDirectory();
    installValidRuntimeEnvironment(directory, budget);

    expect(createLessonRuntimeFromEnv()).toBeDefined();
  });

  it.each([
    ["ASKRIGOR_ACTIONS_ENABLED", "TRUE"],
    ["ASKRIGOR_ACTIONS_API_KEY", ""],
    ["OPENAI_API_KEY", "   "],
    ["ASKRIGOR_AI_MONTHLY_BUDGET_USD", "50.0"],
    ["ASKRIGOR_AI_MONTHLY_BUDGET_USD", "50.000"],
    ["ASKRIGOR_AI_MONTHLY_BUDGET_USD", "49.99"],
    ["ASKRIGOR_GITHUB_APP_ID", "0"],
    ["ASKRIGOR_GITHUB_APP_ID", "01"],
    ["ASKRIGOR_GITHUB_APP_ID", "1.5"],
    ["ASKRIGOR_GITHUB_INSTALLATION_ID", "-1"],
    ["ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64", ""],
    ["ASKRIGOR_LESSONS_REPOSITORY", "someone/another-repository"],
  ])("rejects invalid exact environment value %s=%j without echoing it", async (key, value) => {
    const directory = await safeTemporaryDirectory();
    installValidRuntimeEnvironment(directory);
    process.env[key] = value;

    const error = captureRuntimeError();
    expect(error.message).toBe("Lesson runtime configuration unavailable");
    if (value.length > 0) expect(error.message).not.toContain(value);
  });

  it("rejects missing variables, relative ledger paths, and unsafe ledger parents", async () => {
    const directory = await safeTemporaryDirectory();
    installValidRuntimeEnvironment(directory);
    delete process.env.OPENAI_API_KEY;
    expect(captureRuntimeError().message).toBe("Lesson runtime configuration unavailable");

    installValidRuntimeEnvironment(directory);
    process.env.ASKRIGOR_AI_BUDGET_LEDGER = "relative/ai-budget.json";
    expect(captureRuntimeError().message).toBe("Lesson runtime configuration unavailable");

    installValidRuntimeEnvironment(directory);
    await chmod(directory, 0o720);
    expect(captureRuntimeError().message).toBe("Lesson runtime configuration unavailable");
  });

  it("keeps health and MCP startup independent from failed Action secrets, then caches only one successful process-global service and limiter", async () => {
    clearRuntimeEnvironment();
    process.env.ASKRIGOR_ACTIONS_ENABLED = "true";
    process.env.ASKRIGOR_ACTIONS_API_KEY = "test-action-key";

    const server = createAskRigorHttpServer({ publicServerEnabled: true });
    await listen(server);
    const address = server.address() as AddressInfo;
    const baseUrl = new URL(`http://127.0.0.1:${address.port}`);
    try {
      const health = await fetch(new URL("/healthz", baseUrl));
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });

      const failedRuntime = await postLesson(baseUrl);
      expect(failedRuntime.status).toBe(503);
      expect(await failedRuntime.json()).toEqual({
        status: "github_unavailable",
        retryable: false,
        reason_code: "github_service_unavailable",
      });
    } finally {
      await close(server);
    }

    const directory = await safeTemporaryDirectory();
    installValidRuntimeEnvironment(directory);
    const firstRoutes = createDefaultActionRoutes();
    const secondRoutes = createDefaultActionRoutes();
    expect(Object.isFrozen(firstRoutes)).toBe(true);
    expect(firstRoutes).toHaveLength(1);
    expect(secondRoutes).toHaveLength(1);

    const context = {
      request: { headers: { "content-type": "application/json" } } as IncomingMessage,
      clientIp: "198.51.100.10",
      body: {},
    };
    const first = await firstRoutes[0]!.handle(context);
    expect(first).toMatchObject({ status: 422 });

    clearRuntimeEnvironment();
    for (let attempt = 2; attempt <= 20; attempt += 1) {
      const route = attempt % 2 === 0 ? secondRoutes[0]! : firstRoutes[0]!;
      expect(await route.handle(context)).toMatchObject({ status: 422 });
    }
    expect(await secondRoutes[0]!.handle(context)).toEqual({
      status: 429,
      headers: { "Retry-After": expect.stringMatching(/^[1-9][0-9]*$/) },
      body: {
        status: "rate_limited",
        retryable: true,
        retry_after_seconds: expect.any(Number),
        reason_code: "hourly_limit",
      },
    });
  });
});

function submitted(): LessonSubmissionResult {
  return {
    status: "submitted",
    candidate_id: "ARL-0042",
    occurrence_count: 1,
    retryable: false,
  };
}

async function withHttpServer<T>(
  route: ReturnType<typeof createLessonActionRoute>,
  callback: (baseUrl: URL) => Promise<T>,
): Promise<T> {
  const server = createAskRigorHttpServer({
    publicServerEnabled: true,
    actionsEnabled: true,
    actionApiKey: "test-action-key",
    actionRoutes: [route],
  });
  await listen(server);
  const address = server.address() as AddressInfo;
  try {
    return await callback(new URL(`http://127.0.0.1:${address.port}`));
  } finally {
    await close(server);
  }
}

function listen(server: ReturnType<typeof createAskRigorHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

function close(server: ReturnType<typeof createAskRigorHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function postLesson(baseUrl: URL): Promise<Response> {
  return fetch(new URL("/actions/lessons", baseUrl), {
    method: "POST",
    headers: {
      authorization: "Bearer test-action-key",
      "content-type": "application/json",
    },
    body: JSON.stringify(validCandidate),
  });
}

async function safeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "askrigor-lesson-runtime-"));
  temporaryDirectories.push(directory);
  await chmod(directory, 0o700);
  return directory;
}

function installValidRuntimeEnvironment(directory: string, budget = "50.00"): void {
  process.env.ASKRIGOR_ACTIONS_ENABLED = "true";
  process.env.ASKRIGOR_ACTIONS_API_KEY = "test-action-key";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ASKRIGOR_AI_BUDGET_LEDGER = join(directory, "ai-budget.json");
  process.env.ASKRIGOR_AI_MONTHLY_BUDGET_USD = budget;
  process.env.ASKRIGOR_GITHUB_APP_ID = "123456";
  process.env.ASKRIGOR_GITHUB_INSTALLATION_ID = "987654";
  process.env.ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64 = Buffer.from("test-private-key").toString("base64");
  process.env.ASKRIGOR_LESSONS_REPOSITORY = "u-dont-existDOTcom/AskRigor-lessons";
}

function clearRuntimeEnvironment(): void {
  for (const key of runtimeEnvironmentKeys) delete process.env[key];
}

function captureRuntimeError(): Error {
  try {
    createLessonRuntimeFromEnv();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error as Error;
  }
  throw new Error("Expected runtime construction to fail");
}

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeys(child)]);
}
