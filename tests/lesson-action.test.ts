import { lessonDiagnostics } from "./fixtures/lesson-diagnostics.js";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectorLessonInputSchema, connectorLessonToolResult, DETAILED_REPORT_RULE, EXISTING_RULES_RULE } from
  "../apps/research-mcp/src/lessons/connector-tool.js";
import type { DetailedLessonReport, LessonSubmissionResult } from
  "../apps/research-mcp/src/lessons/contracts.js";
import {
  createLessonActionRoute,
  LESSON_ACTION_REQUEST_SCHEMA,
  LESSON_ACTION_RESPONSE_SCHEMAS,
} from "../apps/research-mcp/src/lessons/action-route.js";
import { createLocalLessonGeneralizer } from "../apps/research-mcp/src/lessons/local-generalizer.js";
import {
  createDefaultActionRoutes,
  createLessonRuntimeFromEnv,
  submitConnectorLessonCandidate,
} from "../apps/research-mcp/src/lessons/runtime.js";
import { LessonSubmissionService } from "../apps/research-mcp/src/lessons/service.js";
import {
  RESEARCH_OPERATIONS,
  registerTools,
  type RegisterToolsOptions,
} from "../apps/research-mcp/src/register-tools.js";
import {
  DETAILED_REPORTS_OFF,
  DETAILED_REPORTS_ON,
  manageResearchAccessInputSchema,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
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
    incident_provenance: {
      type: "object",
      additionalProperties: false,
      required: ["incident_id", "incident_sha256", "preservation_status"],
      properties: {
        incident_id: { type: "string", pattern: "^[A-Za-z0-9_-]{16,96}$" },
        incident_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        preservation_status: {
          type: "string",
          enum: [
            "EXACT_TRANSCRIPT_PRESERVED",
            "PARTIAL_TRANSCRIPT_PRESERVED",
            "LESSON_ONLY_NO_TRANSCRIPT",
            "RAW_INCIDENT_NOT_PRESERVED",
          ],
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

const connectorCandidate = { ...validCandidate, ...lessonDiagnostics };

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

  // Owner decision (2026-09-30): lessons are saved from the connector too, not only
  // from the GPT. The connector tool has no research Action path (the GPT keeps its
  // own lesson Action) and stays out of the Gemini catalog.
  it("adds the lesson operation to the MCP inventory, without a research Action path", async () => {
    for (const profile of ["standard", "gemini"] as const) {
      const server = createAskRigorServer(profile);
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "lesson-action-test", version: "1.0.0" });
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      try {
        const names = (await client.listTools()).tools.map(({ name }) => name);
        if (profile === "standard") {
          expect(names).toHaveLength(33);
          expect(names).toContain("submit_lesson_candidate");
        } else {
          expect(names).not.toContain("submit_lesson_candidate");
        }
      } finally {
        await Promise.all([client.close(), server.close()]);
      }
    }
    const operation = RESEARCH_OPERATIONS.find(({ name }) => name === "submit_lesson_candidate");
    expect(operation?.actionEnabled).toBe(false);
  });

  it("submits a connector lesson through the lesson service and returns only its public receipt", async () => {
    const received: unknown[] = [];
    const replies: LessonSubmissionResult[] = [
      submitted(),
      { status: "privacy_rejected", retryable: false, reason_code: "unsafe_candidate" },
      { status: "rate_limited", retryable: true, retry_after_seconds: 120, reason_code: "hourly_limit" },
    ];
    const server = createAskRigorServer("standard", {
      lessonSubmission: async (raw) => {
        received.push(raw);
        return replies.shift()!;
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "lesson-action-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const saved = await client.callTool({ name: "submit_lesson_candidate", arguments: connectorCandidate });
      expect(saved.isError).not.toBe(true);
      expect(saved.content).toEqual([{ type: "text", text: "Lesson saved for review as ARL-0042." }]);
      expect(saved.structuredContent).toEqual(submitted());
      expect(received).toEqual([connectorCandidate]);

      const rejected = await client.callTool({ name: "submit_lesson_candidate", arguments: connectorCandidate });
      expect(rejected.isError).toBe(true);
      expect(JSON.stringify(rejected.content)).toContain("Not saved: the privacy check");

      const limited = await client.callTool({ name: "submit_lesson_candidate", arguments: connectorCandidate });
      expect(limited.isError).toBe(true);
      expect(JSON.stringify(limited.content)).toContain("try again in about 120 seconds");

      // No incident provenance on the connector: raw incident capture stays with the private Action.
      const withIncident = await client.callTool({
        name: "submit_lesson_candidate",
        arguments: {
          ...connectorCandidate,
          incident_provenance: { incident_id: "ALI-0001", incident_sha256: "b".repeat(64), preservation_status: "EXACT_TRANSCRIPT_PRESERVED" },
        },
      });
      expect(withIncident.isError).toBe(true);
      expect(received).toHaveLength(3);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  // Issue #357: the connector may name the public AskRigor issue that reports
  // the failure, by number only; the Action's schema and the receipt stay the same.
  it("lets the connector name a related public AskRigor issue by number, with the same receipt", async () => {
    const received: unknown[] = [];
    const server = createAskRigorServer("standard", {
      lessonSubmission: async (raw) => {
        received.push(raw);
        return submitted();
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "lesson-action-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tool = (await client.listTools()).tools.find(({ name }) => name === "submit_lesson_candidate");
      expect(tool?.inputSchema.properties?.related_issue).toEqual({
        description: "The number of an issue in u-dont-existDOTcom/AskRigor that reports this failure in detail, when the user filed one.",
        type: "integer",
        minimum: 1,
        maximum: 1_000_000,
      });
      expect(tool?.inputSchema.required).not.toContain("related_issue");
      expect(tool?.inputSchema.required).toEqual(expect.arrayContaining([
        "existing_rules", "observed_behavior", "expected_behavior", "part_to_change",
      ]));
      expect(tool?.description).toContain(EXISTING_RULES_RULE);
      expect(EXISTING_RULES_RULE).toContain("propose enforcing or fixing them before any new rule");
      expect(LESSON_ACTION_REQUEST_SCHEMA.properties).not.toHaveProperty("related_issue");

      const saved = await client.callTool({
        name: "submit_lesson_candidate",
        arguments: { ...connectorCandidate, related_issue: 357 },
      });
      expect(saved.isError).not.toBe(true);
      expect(saved.content).toEqual([{ type: "text", text: "Lesson saved for review as ARL-0042." }]);
      expect(saved.structuredContent).toEqual(submitted());
      expect(received).toEqual([{ ...connectorCandidate, related_issue: 357 }]);

      for (const related_issue of [0, -357, 357.5, "357", 1_000_001, "https://github.com/u-dont-existDOTcom/AskRigor/issues/357"]) {
        const rejected = await client.callTool({
          name: "submit_lesson_candidate",
          arguments: { ...connectorCandidate, related_issue },
        });
        expect(rejected.isError).toBe(true);
      }
      expect(received).toHaveLength(1);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("returns the unavailable receipt when the connector's lesson queue is not configured", async () => {
    clearRuntimeEnvironment();
    await expect(submitConnectorLessonCandidate(connectorCandidate)).resolves.toEqual({
      status: "github_unavailable",
      retryable: false,
      reason_code: "github_auth_unavailable",
    });
  });

  it.each(["invalid_existing_rules", "unknown_protocol_element"] as const)(
    "explains the inventory refusal %s without echoing submitted content", (reason_code) => {
      const result = connectorLessonToolResult({ status: "existing_rules_refused", retryable: false, reason_code });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({ status: "existing_rules_refused", retryable: false, reason_code });
      expect(JSON.stringify(result.content)).toContain(reason_code === "unknown_protocol_element"
        ? "not an exact current HRP or Universal element" : "one-line explanation");
    },
  );
});

// Owner question 154 (2026-10-21): "i would not give everyone a long report like that in chat unless they turn that
// on in askrigor settings". A connector lesson carries a detailed report only from an account that turned detailed
// lesson reports on with manage_research_access; any other is refused with a stable reason code, and nothing is stored.
describe("detailed lesson reports on the connector", () => {
  const report: DetailedLessonReport = {
    steps: [
      "The assistant searched one database for the intervention and found three trials.",
      "It wrote the answer before reading any of the trials in full.",
    ],
    observed: "The answer called the evidence strong although no trial had been read in full.",
    expected: "The answer should read the decisive trials in full, or say the evidence was not read, before rating it.",
    causes: [{ cause: "The final check accepted an answer that declared no key studies.", confidence: "high" }],
    parts_to_change: ["finalize_research"],
    proposed_change: "Refuse a strength rating unless a key study was read in full or the answer says it was not.",
    test_cases: [{ case: "An invented answer rates three abstracts as strong; the check refuses it.", negative_control: false }],
    uncertain: "Whether the model would still rate the evidence once the rule names the full-text read.",
  };
  const refused = { status: "detailed_report_refused", retryable: false, reason_code: "detailed_reports_off" };
  const REFUSED_TEXT = "Not saved: detailed lesson reports are off for this account, so nothing was stored. Send the " +
    "same lesson again without detailed_report.";
  const agreement = {
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true as const,
    prohibitedPrivateAndRawContentExcluded: true as const,
    proposalReviewAndNoAuthorityAcknowledged: true as const,
    paidPrivateAlternativeAcknowledged: true as const,
  };
  const text = (result: CallToolResult) => (result.content as Array<{ text: string }>).map(({ text }) => text).join("\n");

  async function accounts() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 7) });
    await service.acceptFreeContributor("auth0|on", agreement);
    await service.acceptFreeContributor("auth0|off", agreement);
    return { store, service };
  }

  // The real lesson service behind a recording queue, so a test sees exactly what would be stored.
  function lessonQueue() {
    const queued: Array<Record<string, unknown>> = [];
    const service = new LessonSubmissionService({
      limiter: { consume: () => ({ allowed: true }), lastBlockingReason: () => "hourly_limit" },
      anonymizer: createLocalLessonGeneralizer(),
      queue: {
        submit: async (input) => {
          queued.push(input as unknown as Record<string, unknown>);
          return { kind: "created", issueNumber: 42, occurrenceCount: 1, possibleRegression: false };
        },
      },
    });
    return { queued, service };
  }

  // The tools as registered behind the research-access guard, called for a signed-in subject; each input first
  // passes the tool's own schema, as the SDK checks it.
  function tools(options: RegisterToolsOptions) {
    type Handler = (input: unknown, extra?: unknown) => Promise<CallToolResult>;
    const handlers = new Map<string, Handler>();
    registerTools({
      registerTool: (name: string, _config: unknown, execute: Handler) => {
        handlers.set(name, execute);
      },
    } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp/claude", ...options });
    const call = (name: "manage_research_access" | "submit_lesson_candidate") =>
      async (input: Record<string, unknown>, subject: string) => handlers.get(name)!(
        (name === "manage_research_access" ? manageResearchAccessInputSchema : connectorLessonInputSchema).parse(input),
        {
          authInfo: {
            token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
            expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject },
          },
        },
      );
    return { manage: call("manage_research_access"), submit: call("submit_lesson_candidate") };
  }

  it("shows the setting on inspect, off by default, and turns it on and off for one account", async () => {
    const { store, service } = await accounts();
    const { manage } = tools({ researchContributorAccessService: service });
    const row = (subject: string) =>
      store.allAccounts().find(({ accountKey }) => accountKey === service.accountKeyForSubject(subject));

    const inspected = await manage({ action: "inspect" }, "auth0|on");
    expect(inspected.structuredContent).toMatchObject({
      ok: true, access: { status: "ACTIVE", mode: "FREE_CONTRIBUTOR" }, detailedLessonReports: false,
    });
    expect(text(inspected)).toContain(DETAILED_REPORTS_OFF);
    expect(DETAILED_REPORTS_OFF).toBe("Detailed lesson reports are off for this account, so a lesson carries no detailed report.");

    const on = await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: true }, "auth0|on");
    expect(on.isError).not.toBe(true);
    expect(on.structuredContent).toEqual({ ok: true, detailedLessonReports: true });
    expect(text(on)).toBe("Detailed lesson reports are now on for this account: a lesson may carry a detailed report, " +
      "shown to the user with the lesson before asking and stored only in AskRigor's private lessons repository.");
    expect(row("auth0|on")).toMatchObject({ detailedLessonReports: true });
    const shown = await manage({ action: "inspect" }, "auth0|on");
    expect(shown.structuredContent).toMatchObject({ ok: true, detailedLessonReports: true });
    expect(text(shown)).toContain(DETAILED_REPORTS_ON);
    expect(DETAILED_REPORTS_ON).toBe("Detailed lesson reports are on for this account: a lesson may carry a detailed " +
      "report, shown to the user with the lesson before asking.");
    // Another account keeps its own setting.
    expect((await manage({ action: "inspect" }, "auth0|off")).structuredContent).toMatchObject({ detailedLessonReports: false });

    const off = await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: false }, "auth0|on");
    expect(off.structuredContent).toEqual({ ok: true, detailedLessonReports: false });
    expect(text(off)).toBe("Detailed lesson reports are now off for this account, so a lesson carries no detailed report.");
    expect(row("auth0|on")).toMatchObject({ detailedLessonReports: false });
    expect((await manage({ action: "inspect" }, "auth0|on")).structuredContent).toMatchObject({ detailedLessonReports: false });

    // The action and its field go together.
    for (const input of [{ action: "set_detailed_lesson_reports" }, { action: "inspect", detailedLessonReports: true }]) {
      expect((await manage(input, "auth0|on")).structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    }
    // An account without research access has no setting to show or change, and nothing is stored for it.
    expect((await manage({ action: "inspect" }, "auth0|new")).structuredContent).not.toHaveProperty("detailedLessonReports");
    expect((await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: true }, "auth0|new")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "research_access_required" } });
    await service.revoke("auth0|off");
    expect((await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: true }, "auth0|off")).structuredContent)
      .toMatchObject({ ok: false, error: { code: "research_access_revoked" } });
    expect(store.allAccounts()).toHaveLength(2);
    expect(row("auth0|off")).not.toHaveProperty("detailedLessonReports");
  });

  it("saves a detailed report only for an account that turned detailed lesson reports on", async () => {
    const { service } = await accounts();
    const { queued, service: lessons } = lessonQueue();
    const contexts: unknown[] = [];
    const { manage, submit } = tools({
      researchContributorAccessService: service,
      lessonSubmission: async (raw, context) => {
        contexts.push(context);
        return await lessons.submit(raw, "connector", context);
      },
    });
    await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: true }, "auth0|on");

    const saved = await submit({ ...connectorCandidate, detailed_report: report }, "auth0|on");
    expect(saved.isError).not.toBe(true);
    expect(saved.content).toEqual([{ type: "text", text: "Lesson saved for review as ARL-0042." }]);
    expect(saved.structuredContent).toEqual(submitted());
    expect(queued).toEqual([expect.objectContaining({ source: "connector", detailedReport: report })]);
    expect(queued[0]!.candidate).not.toHaveProperty("detailed_report");

    const notSaved = await submit({ ...connectorCandidate, detailed_report: report }, "auth0|off");
    expect(notSaved.isError).toBe(true);
    expect(notSaved.structuredContent).toEqual(refused);
    expect(text(notSaved)).toBe(REFUSED_TEXT);
    expect(queued).toHaveLength(1);
    // The same lesson without its report is saved, from an account with the setting off as from one with it on.
    for (const subject of ["auth0|off", "auth0|on"]) {
      expect((await submit(connectorCandidate, subject)).structuredContent).toEqual(submitted());
    }
    expect(queued).toHaveLength(3);
    expect(queued.slice(1).every((input) => !("detailedReport" in input))).toBe(true);
    // The account is read only for a lesson that carries a report.
    expect(contexts).toEqual([
      { detailedReports: true }, { detailedReports: false }, { detailedReports: false }, { detailedReports: false },
    ]);

    // Turned off again, the account's report is refused.
    await manage({ action: "set_detailed_lesson_reports", detailedLessonReports: false }, "auth0|on");
    expect((await submit({ ...connectorCandidate, detailed_report: report }, "auth0|on")).structuredContent).toEqual(refused);
    expect(queued).toHaveLength(3);
  });

  it("refuses a detailed report without a research account and publishes the field with its rule", async () => {
    const { queued, service: lessons } = lessonQueue();
    const contexts: unknown[] = [];
    const server = createAskRigorServer("standard", {
      lessonSubmission: async (raw, context) => {
        contexts.push(context);
        return await lessons.submit(raw, "connector", context);
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "lesson-action-test", version: "1.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const tool = (await client.listTools()).tools.find(({ name }) => name === "submit_lesson_candidate");
      expect(tool?.description).toContain(DETAILED_REPORT_RULE);
      expect(DETAILED_REPORT_RULE).toBe("Include detailed_report, shown to the user with the lesson before asking, " +
        "only when manage_research_access shows this account's detailed lesson reports on.");
      const field = tool?.inputSchema.properties?.detailed_report as { description: string; required: string[] };
      expect(field.description).toMatch(/^Only when manage_research_access shows this account's detailed lesson reports on, and shown to the user with the lesson before asking: /u);
      expect(field.description).toContain("≤10,000 characters in all");
      expect(field.required).toEqual([
        "steps", "observed", "expected", "causes", "parts_to_change", "proposed_change", "test_cases", "uncertain",
      ]);
      expect(tool?.inputSchema.required).not.toContain("detailed_report");
      expect(LESSON_ACTION_REQUEST_SCHEMA.properties).not.toHaveProperty("detailed_report");

      const notSaved = await client.callTool({
        name: "submit_lesson_candidate",
        arguments: { ...connectorCandidate, detailed_report: report },
      });
      expect(notSaved.isError).toBe(true);
      expect(notSaved.structuredContent).toEqual(refused);
      expect(notSaved.content).toEqual([{ type: "text", text: REFUSED_TEXT }]);
      expect(queued).toHaveLength(0);

      // A report over 10,000 characters in all is refused by the tool's own schema before the lesson service.
      const tooLong = await client.callTool({
        name: "submit_lesson_candidate",
        arguments: {
          ...connectorCandidate,
          detailed_report: {
            ...report,
            steps: Array.from({ length: 12 }, () => "s".repeat(300)),
            test_cases: Array.from({ length: 5 }, () => ({ case: "t".repeat(1_200), negative_control: false })),
          },
        },
      });
      expect(tooLong.isError).toBe(true);
      expect(contexts).toEqual([{ detailedReports: false }]);
      expect(queued).toHaveLength(0);
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
    expect(firstRoutes).toHaveLength(2);
    expect(secondRoutes).toHaveLength(2);

    const context = {
      request: { headers: { "content-type": "application/json" } } as IncomingMessage,
      clientIp: "198.51.100.10",
      body: {},
    };
    const first = await firstRoutes[1]!.handle(context);
    expect(first).toMatchObject({ status: 422 });

    clearRuntimeEnvironment();
    for (let attempt = 2; attempt <= 20; attempt += 1) {
      const route = attempt % 2 === 0 ? secondRoutes[1]! : firstRoutes[1]!;
      expect(await route.handle(context)).toMatchObject({ status: 422 });
    }
    expect(await secondRoutes[1]!.handle(context)).toEqual({
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
