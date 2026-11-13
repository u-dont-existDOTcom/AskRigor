import type Anthropic from "@anthropic-ai/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";

import { atlasFeatureRows, type AtlasResearchAccount, type AtlasServerFeatures } from "../apps/research-mcp/src/atlas/account-features.js";
import { laterInputNames } from "../apps/research-mcp/src/later-inputs.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  OWNER_DAILY_CEILING_USD,
  PLANNED_OTHER_MINUTES,
  RESEARCH_PLANNER_LIMITS,
  RESEARCH_PLANNER_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_RUBRIC,
  createResearchPlanner,
  researchPlanOf,
  researchPlannerBundle,
  type ResearchPlanner,
  type ResearchPlannerCall,
  type ResearchPlannerClient,
  type ResearchPlannerSource,
} from "../apps/research-mcp/src/research-planner.js";
import {
  ASKED_LIMIT,
  ASKED_REQUEST,
  DEFAULT_RESEARCH_STEERING,
  PLAN_TASK_KINDS,
  READING_FIRST,
  framingGuidance,
  framingNextStep,
  plannedGuidance,
  plannedNextStep,
  plannerNotUsedSentence,
  steeringChoiceUnclear,
  type PlannedResearch,
} from "../apps/research-mcp/src/research-steering.js";

// Owner answer 298b (13 Nov 2026): AskRigor's own planning call, for dev accounts. No test reaches the network: the
// module's client is a fake, and the tool gets a planner that answers from memory.

const SECRET = "research-planner-test-secret-0123456789";
const KEY = "sk-ant-api03-synthetic-key-for-tests-only-0123456789";
const ENV = { ASKRIGOR_RESEARCH_PLANNER: "on", ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: "/run/secret/claude-key" };
const SOURCE: ResearchPlannerSource = {
  asked: "would the oil work as well as the tea?",
  researchTarget: "Whether a seed oil works as well as a tea made from the same seeds",
  quickAnswer: "Probably not. The active compounds are salts that dissolve in water.",
  claims: ["The active compounds are salts that dissolve in water."],
};
const REPLY = {
  about: "The question is about an oil pressed from seeds that are usually brewed as a tea.",
  steering_choice: "Which oil do you mean: a pressed seed oil, or seeds soaked in oil at home?",
  tasks: [
    { task: "Search studies that measured the compounds in the seed oil", kind: "study_search", could_change: "conclusion", sources: 2 },
    { task: "Read what people who took the oil report", kind: "forum_thread", could_change: "confidence", sources: 1 },
    { task: "Look up how well the compounds dissolve in oil", kind: "other", could_change: "detail", sources: 1 },
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;

function message(overrides: Record<string, unknown> = {}, reply: unknown = REPLY): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_synthetic", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn",
    stop_sequence: null,
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "seed oil" } },
      { type: "text", text: "Searching.", citations: null },
      { type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply), citations: null },
    ],
    usage: { input_tokens: 300, output_tokens: 600, cache_creation_input_tokens: 8_000, cache_read_input_tokens: 15_000,
      server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } },
    ...overrides,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function planner(options: {
  env?: Record<string, string | undefined>;
  reply?: (body: Body) => Anthropic.Beta.BetaMessage | Promise<Anthropic.Beta.BetaMessage>;
  now?: () => number;
  otherDailyCapUsd?: number;
  readFile?: (path: string) => string;
} = {}) {
  const bodies: Body[] = [];
  const logs: string[] = [];
  const settings: Array<{ apiKey: string; workspaceId: string | undefined; timeoutMs: number }> = [];
  const client = (given: { apiKey: string; workspaceId: string | undefined; timeoutMs: number }): ResearchPlannerClient => {
    settings.push(given);
    return { beta: { messages: { create: async (body) => {
      bodies.push(body);
      return await (options.reply ?? (() => message()))(body);
    } } } };
  };
  const made = createResearchPlanner({
    env: { ...ENV, ...options.env } as NodeJS.ProcessEnv,
    readFile: options.readFile ?? (() => `${KEY}\n`),
    client,
    log: (line) => logs.push(line),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.otherDailyCapUsd === undefined ? {} : { otherDailyCapUsd: options.otherDailyCapUsd }),
  });
  return { planner: made, bodies, logs, settings };
}

describe("AskRigor's own planning call (owner answer 298b): the call", () => {
  it("is off unless switched on with a readable key file and valid settings, and never calls then", async () => {
    for (const [env, readFile, log] of [
      [{ ASKRIGOR_RESEARCH_PLANNER: undefined }, undefined, undefined],
      [{ ASKRIGOR_RESEARCH_PLANNER: "true" }, undefined, undefined],
      [{ ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: " " }, undefined, "key_file_not_set"],
      [{}, () => { throw new Error("no such file"); }, "key_file_unreadable"],
      [{}, () => "two words", "key_file_unreadable"],
      [{ ASKRIGOR_RESEARCH_PLANNER_MODEL: "some-other-model" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_EFFORT: "max" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "-1" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "0" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "2.5" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_TIMEOUT_SECONDS: "500" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_WORKSPACE_ID: "not-a-workspace" }, undefined, "settings_invalid"],
      [{ ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "3.5" }, undefined, "daily_caps_exceed_owner_ceiling"],
    ] as const) {
      const made = planner({ env, ...(readFile === undefined ? {} : { readFile }) });
      expect(made.planner.enabled, JSON.stringify(env)).toBe(false);
      expect(made.logs, JSON.stringify(env)).toEqual(log === undefined ? [] : [log]);
      expect(await made.planner.plan(SOURCE, "account-a")).toEqual({
        planning: { status: "skipped", reason: "off" }, cached: false, costUsd: 0, milliseconds: 0 });
      expect(made.bodies).toHaveLength(0);
    }
  });

  it("keeps its cap and the meaning judge's within the owner's USD 3 a day together", () => {
    expect(OWNER_DAILY_CEILING_USD).toBe(3);
    // Alone, the default cap of USD 3 is the ceiling; beside a judge with its own USD 3, the planner stays off.
    expect(planner().planner).toMatchObject({ enabled: true, dailyCapUsd: 3, accountDailyCalls: 10 });
    const beside = planner({ otherDailyCapUsd: 3 });
    expect(beside.planner.enabled).toBe(false);
    expect(beside.logs).toEqual(["daily_caps_exceed_owner_ceiling"]);
    // With the two caps set to share the USD 3, it runs.
    expect(planner({ otherDailyCapUsd: 1, env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "2" } }).planner)
      .toMatchObject({ enabled: true, dailyCapUsd: 2 });
  });

  it("sends the rubric, the bundle, two web searches at most and the output schema, and reads the plan", async () => {
    const at = Date.parse("2026-11-13T14:00:00Z");
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_WORKSPACE_ID: "wrkspc_0123456789abcdef" } });
    const call = await made.planner.plan({ ...SOURCE, framing: { likely_question: "Does the oil work like the tea?",
      premise_doubts: ["That the oil holds the compounds"] } }, "account-a");
    expect(made.settings).toEqual([{ apiKey: KEY, workspaceId: "wrkspc_0123456789abcdef", timeoutMs: 45_000 }]);
    expect(made.bodies).toHaveLength(1);
    const body = made.bodies[0]!;
    expect(body.model).toBe("claude-opus-5-5");
    // A request the model's classifiers decline goes to Anthropic's default fallback, in the same call.
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(body.fallbacks).toBe("default");
    expect(body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: RESEARCH_PLANNER_OUTPUT_SCHEMA } });
    expect(body.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 2 }]);
    expect(RESEARCH_PLANNER_LIMITS.searches).toBe(2);
    expect(body.system).toEqual([{ type: "text", text: RESEARCH_PLANNER_RUBRIC, cache_control: { type: "ephemeral" } }]);
    // No thinking, temperature or forced tool choice: the model accepts none of them.
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.messages).toHaveLength(1);
    expect(JSON.parse(body.messages[0]!.content as string)).toEqual({
      today: "2026-11-13",
      asked: SOURCE.asked,
      research_target: SOURCE.researchTarget,
      quick_answer: SOURCE.quickAnswer,
      quick_answer_claims: [...SOURCE.claims],
      framing: { likely_question: "Does the oil work like the tea?", premise_doubts: ["That the oil holds the compounds"],
        redirecting_questions: [] },
    });
    // The key is the client's alone: it is in no part of the request.
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(call.planning).toEqual({ status: "planned", plan: {
      about: REPLY.about,
      steering_choice: REPLY.steering_choice,
      searches: 1,
      tasks: [
        { task: REPLY.tasks[0]!.task, kind: "study_search", could_change: "conclusion", sources: 2 },
        { task: REPLY.tasks[1]!.task, kind: "forum_thread", could_change: "confidence" },
        // A task of kind other has no usual time, so it gets one.
        { task: REPLY.tasks[2]!.task, kind: "other", could_change: "detail", minutes: [...PLANNED_OTHER_MINUTES] },
      ],
    } });
    // 300 input and 600 output at Opus 5.5's prices, 8,000 written to the cache and 15,000 read from it, and 1 search.
    expect(call.costUsd).toBeCloseTo((300 * 4 + 600 * 20 + 8_000 * 5 + 15_000 * 0.2) / 1e6 + 0.01, 10);
    expect(call).toMatchObject({ cached: false, model: "claude-opus-5-5",
      usage: { input: 300, output: 600, cacheWrite: 8_000, cacheRead: 15_000, searches: 1 } });
  });

  it("gives the bundle null for words and a framing the AI did not pass on", () => {
    expect(researchPlannerBundle({ researchTarget: "T", quickAnswer: "Q.", claims: ["Q."] }, "2026-11-13")).toEqual({
      today: "2026-11-13", asked: null, research_target: "T", quick_answer: "Q.", quick_answer_claims: ["Q."],
      framing: null });
  });

  it("prices each iteration at its own model's rate, and an unlisted fallback model at the ceiling", async () => {
    const made = planner({ reply: () => message({ model: "claude-opus-4-8", usage: {
      input_tokens: 1_000, output_tokens: 1_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      server_tool_use: { web_search_requests: 2, web_fetch_requests: 0 },
      iterations: [
        { type: "message", model: "claude-opus-5-5", input_tokens: 400, output_tokens: 100,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 600, output_tokens: 900,
          cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      ],
    } }) });
    const call = await made.planner.plan(SOURCE, "account-a");
    expect(call.planning.status).toBe("planned");
    expect(call.costUsd).toBeCloseTo((400 * 4 + 100 * 20) / 1e6 + (600 * 10 + 900 * 50) / 1e6 + 2 * 0.01, 10);
    expect(call.model).toBe("claude-opus-4-8");
  });

  it("reads a plan's shape and nothing else: the word none as the menu reads it, five tasks at most, plain lines", () => {
    expect(researchPlanOf({ ...REPLY, steering_choice: " None. " }, 0)).toMatchObject({ steering_choice: "none", searches: 0 });
    expect(researchPlanOf({ ...REPLY, steering_choice: "NONE" }, 0)?.steering_choice).toBe("none");
    // A question that begins with the word is a question.
    expect(researchPlanOf({ ...REPLY, steering_choice: "None of these, or one of them?" }, 0)?.steering_choice)
      .toBe("None of these, or one of them?");
    const many = Array.from({ length: 8 }, (_, index) => ({ task: `Task number ${index + 1}`, kind: "study_search",
      could_change: "detail", sources: 99 }));
    const cut = researchPlanOf({ ...REPLY, tasks: many }, 2)!;
    expect(cut.tasks).toHaveLength(RESEARCH_PLANNER_LIMITS.tasks);
    expect(cut.tasks[0]).toEqual({ task: "Task number 1", kind: "study_search", could_change: "detail", sources: 10 });
    // Control and formatting characters go, and a long text is cut with an ellipsis.
    const long = researchPlanOf({ ...REPLY, about: `A\u0000 line​ with\n breaks. ${"x".repeat(900)}` }, 0)!;
    expect(long.about.startsWith("A line with breaks. ")).toBe(true);
    expect(long.about).toHaveLength(RESEARCH_PLANNER_LIMITS.about);
    expect(long.about.endsWith("…")).toBe(true);
    // Not a plan: a missing part, an unknown kind, no task, an empty text, or anything holding the key.
    for (const reply of [null, "text", {}, { ...REPLY, about: undefined }, { ...REPLY, tasks: [] },
      { ...REPLY, tasks: [{ ...REPLY.tasks[0], kind: "web_search" }] },
      { ...REPLY, tasks: [{ ...REPLY.tasks[0], could_change: "everything" }] },
      { ...REPLY, tasks: [{ ...REPLY.tasks[0], task: "ab" }] },
      { ...REPLY, about: "   " }, { ...REPLY, steering_choice: "" },
      { ...REPLY, about: `The key is ${KEY}` }, { ...REPLY, steering_choice: "sk-ant-something else?" },
      // Neither the word none nor a question: AskRigor does not guess which was meant.
      { ...REPLY, steering_choice: "none needed" }, { ...REPLY, steering_choice: "n/a" }]) {
      expect(researchPlanOf(reply, 0, KEY), JSON.stringify(reply)).toBeUndefined();
    }
    // The searches are a whole number, whatever the usage said.
    expect(researchPlanOf(REPLY, 1.7)?.searches).toBe(1);
    expect(researchPlanOf(REPLY, Number.NaN)?.searches).toBe(0);
    // Every kind and every thing a task could change that the menu takes is in the output schema.
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.tasks.items.properties.kind.enum).toEqual([...PLAN_TASK_KINDS]);
  });

  it("never blocks: a refusal, an unreadable reply, a failure and a timeout are skipped, with what they cost", async () => {
    const refused = planner({ reply: () => message({ stop_reason: "refusal", content: [] }) });
    const refusal = await refused.planner.plan(SOURCE, "account-a");
    expect(refusal.planning).toEqual({ status: "skipped", reason: "refusal" });
    expect(refusal.costUsd).toBeGreaterThan(0);
    expect(refused.logs).toEqual(["refusal"]);
    for (const reply of [
      () => message({}, "not json"),
      () => message({}, { about: "Only this." }),
      () => message({ stop_reason: "pause_turn" }),
      () => message({ stop_reason: "max_tokens" }),
      () => message({ content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} }] }),
    ]) {
      const made = planner({ reply });
      expect((await made.planner.plan(SOURCE, "account-a")).planning).toEqual({ status: "skipped", reason: "unreadable" });
      expect(made.logs).toEqual(["unreadable"]);
    }
    const failed = planner({ reply: () => { throw new Error(`request failed for ${KEY}`); } });
    expect(await failed.planner.plan(SOURCE, "account-a")).toMatchObject({
      planning: { status: "skipped", reason: "error" }, costUsd: 0 });
    // The log holds the failure's class only, never its message.
    expect(failed.logs).toEqual(["error"]);
    vi.useFakeTimers();
    try {
      const slow = planner({ env: { ASKRIGOR_RESEARCH_PLANNER_TIMEOUT_SECONDS: "1" },
        reply: () => new Promise<Anthropic.Beta.BetaMessage>(() => undefined) });
      const pending = slow.planner.plan(SOURCE, "account-a");
      await vi.advanceTimersByTimeAsync(1_100);
      // A call that timed out may have run, so it keeps what was held for it against the day.
      expect(await pending).toMatchObject({ planning: { status: "skipped", reason: "timeout" }, costUsd: 0.12 });
      expect(slow.logs).toEqual(["timeout"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives an account its plan again within the hour for the same words, and counts new calls per account and day", async () => {
    let at = Date.parse("2026-11-13T10:00:00Z");
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "2" } });
    const first = await made.planner.plan(SOURCE, "account-a");
    expect(first).toMatchObject({ cached: false, planning: { status: "planned" } });
    // The same words registered again, with another research target and quick answer: the plan it had, no new call.
    const again = await made.planner.plan({ ...SOURCE, researchTarget: "Reworded", quickAnswer: "Another." }, "account-a");
    expect(again).toMatchObject({ cached: true, costUsd: 0, milliseconds: 0, planning: first.planning });
    expect(made.bodies).toHaveLength(1);
    // Another account's same words are its own call; new words are a new call; the third new call of the day is not made.
    expect((await made.planner.plan(SOURCE, "account-b")).cached).toBe(false);
    expect((await made.planner.plan({ ...SOURCE, asked: "and by mouth?" }, "account-a")).cached).toBe(false);
    expect(made.bodies).toHaveLength(3);
    expect((await made.planner.plan({ ...SOURCE, asked: "a third question" }, "account-a")).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect(made.bodies).toHaveLength(3);
    // Without the person's words the plan is keyed by the research target and the framing's question.
    const bare = { researchTarget: "T", quickAnswer: "Q.", claims: ["Q."] };
    expect((await made.planner.plan(bare, "account-b")).cached).toBe(false);
    expect((await made.planner.plan({ ...bare, quickAnswer: "Other." }, "account-b")).cached).toBe(true);
    // After the hour the plan is made anew, and the next UTC day starts the count again.
    at += 61 * 60 * 1_000;
    expect((await made.planner.plan(SOURCE, "account-a")).planning).toEqual({ status: "skipped", reason: "account_limit" });
    at = Date.parse("2026-11-14T00:00:05Z");
    expect(await made.planner.plan(SOURCE, "account-a")).toMatchObject({ cached: false, planning: { status: "planned" } });
  });

  it("holds each call's share of the cap while it runs, so calls sent together cannot all pass it", async () => {
    const at = Date.parse("2026-11-13T10:00:00Z");
    const release: Array<() => void> = [];
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.2" },
      reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release.push(() => resolve(message())); }) });
    // Three calls sent before any has answered: USD 0.12 is held for each, so the third finds the cap reached.
    const first = made.planner.plan({ ...SOURCE, asked: "one" }, "account-a");
    const second = made.planner.plan({ ...SOURCE, asked: "two" }, "account-b");
    const third = await made.planner.plan({ ...SOURCE, asked: "three" }, "account-c");
    expect(third.planning).toEqual({ status: "skipped", reason: "daily_budget" });
    expect(made.bodies).toHaveLength(2);
    release.forEach((answer) => answer());
    expect((await first).planning.status).toBe("planned");
    expect((await second).planning.status).toBe("planned");
    // Settled at what they cost (about USD 0.065 each), a third call now fits.
    release.length = 0;
    const next = made.planner.plan({ ...SOURCE, asked: "three" }, "account-c");
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release[0]!();
    expect((await next).planning.status).toBe("planned");
  });

  it("stops at the day's cap, and does not keep a failed call's result", async () => {
    let at = Date.parse("2026-11-13T10:00:00Z");
    let fail = true;
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.05" },
      reply: () => { if (fail) throw new Error("down"); return message(); } });
    expect((await made.planner.plan(SOURCE, "account-a")).planning).toEqual({ status: "skipped", reason: "error" });
    fail = false;
    // The failed call was not kept: the same words are asked again, and now planned (about USD 0.07, past the cap).
    const planned = await made.planner.plan(SOURCE, "account-a");
    expect(planned).toMatchObject({ cached: false, planning: { status: "planned" } });
    expect(planned.costUsd).toBeGreaterThan(0.05);
    expect((await made.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning)
      .toEqual({ status: "skipped", reason: "daily_budget" });
    // A plan already made is still given from memory; a new day starts the budget again.
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(true);
    at = Date.parse("2026-11-14T00:00:05Z");
    expect((await made.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning.status).toBe("planned");
  });
});

// The tool, with a planner that answers from memory -----------------------------------------------------------------

const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
const PLAIN = {
  researchTarget: SOURCE.researchTarget,
  text: SOURCE.quickAnswer,
  claims: [...SOURCE.claims],
};
type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const words = (result: Result): string => result.content.map((block) => block.type === "text" ? block.text : "").join("\n");

async function tool(researchPlanner: ResearchPlanner | undefined, dev: readonly string[] = ["auth0|dev"]) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
  for (const subject of ["auth0|dev", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev.map((subject) => service.accountKeyForSubject(subject)).join(","));
  let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
  const options: RegisterToolsOptions = { researchAccessRequired: true, mcpSurface: "/mcp",
    researchContributorAccessService: service, ...(researchPlanner === undefined ? {} : { researchPlanner }) };
  registerTools({
    registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
      if (registered === "manage_research_access") handler = execute;
    },
  } as unknown as McpServer, options);
  const call = async (input: Record<string, unknown>, subject = "auth0|dev"): Promise<Result> =>
    await handler!(input, { authInfo: { token: "synthetic-token", clientId: "synthetic-client",
      scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } }) as Result;
  return { call, service };
}

function memoryPlanner(answer: (source: ResearchPlannerSource, accountKey: string) => ResearchPlannerCall["planning"] =
  () => ({ status: "planned", plan: researchPlanOf(REPLY, 1)! })) {
  const seen: Array<{ source: ResearchPlannerSource; accountKey: string }> = [];
  const made: ResearchPlanner = {
    enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    plan: async (source, accountKey) => {
      seen.push({ source, accountKey });
      return { planning: answer(source, accountKey), cached: false, costUsd: 0.05, milliseconds: 12 };
    },
  };
  return { planner: made, seen };
}

describe("AskRigor's own planning call (owner answer 298b): the registration", () => {
  it("asks a dev account for the person's own words at inspect, while the planner is on", async () => {
    const on = await tool(memoryPlanner().planner);
    const inspected = await on.call({ action: "inspect" });
    expect(words(inspected)).toContain(` ${ASKED_REQUEST} `);
    expect(inspected.structuredContent).toMatchObject({ ok: true, next_step: ASKED_REQUEST });
    expect(ASKED_REQUEST).toContain("later_inputs.asked: the person's own words about this question, word for word");
    expect(ASKED_REQUEST).toContain("keeps none of them");
    // Any other account, and a dev account while the planner is off or absent, is asked for nothing more.
    const person = await on.call({ action: "inspect" }, "auth0|person");
    expect(words(person)).not.toContain("later_inputs.asked");
    expect(person.structuredContent).not.toHaveProperty("next_step");
    for (const planner of [undefined, { enabled: false, plan: async () => { throw new Error("never"); } } as ResearchPlanner]) {
      const off = await tool(planner);
      const plain = await off.call({ action: "inspect" });
      expect(words(plain)).not.toContain("later_inputs.asked");
      expect(plain.structuredContent).not.toHaveProperty("next_step");
    }
    expect(laterInputNames("manage_research_access")).toContain("asked");
  });

  it("hands a dev account the plan as a menu ready for plan_research, which asks the planner's question", async () => {
    const memory = memoryPlanner();
    const { call, service } = await tool(memory.planner);
    const framing = { likely_question: "Does the oil work like the tea?" };
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { framing, asked: `  ${SOURCE.asked}  ` } });
    expect(registered.isError).not.toBe(true);
    // The planner got the person's words, the registered target, the quick answer, its claims and the framing.
    expect(memory.seen).toEqual([{ accountKey: service.accountKeyForSubject("auth0|dev"), source: {
      asked: SOURCE.asked, researchTarget: PLAIN.researchTarget, quickAnswer: PLAIN.text, claims: PLAIN.claims, framing } }]);
    const structured = registered.structuredContent as { research_receipt: string; next_step: string;
      planned_later_inputs: { researchMenu: Record<string, unknown> } };
    const menu = { research_target: PLAIN.researchTarget, plain_answer_receipt: structured.research_receipt,
      steering_choice: REPLY.steering_choice, tasks: researchPlanOf(REPLY, 1)!.tasks };
    expect(structured).toMatchObject({
      ok: true,
      research_plan: { source: "askrigor_planning_call", about: REPLY.about, steering_choice: REPLY.steering_choice,
        searches: 1, from_asked: true },
      planned_later_inputs: { researchMenu: menu },
    });
    expect(structured).not.toHaveProperty("research_plan_not_used");
    // The words quote the menu as the result gives it (its fields in the menu's own order).
    const planned: PlannedResearch = { about: REPLY.about, searches: 1, asked: true,
      later_inputs: structured.planned_later_inputs as PlannedResearch["later_inputs"] };
    expect(registered.content[0]).toEqual({ type: "text", text: plannedGuidance(framing, planned) });
    expect(structured.next_step).toBe(plannedNextStep(framing, planned));
    // No screen, and no menu of the AI's own: the words every account gets are not there.
    const text = words(registered);
    expect(text).toContain("so do not screen and do not write a menu of your own");
    expect(text).toContain(`What the question is about, as that call found it: ${JSON.stringify(REPLY.about)}.`);
    expect(text).toContain(`exactly these later_inputs, which carry the plan: ${JSON.stringify(structured.planned_later_inputs)}`);
    expect(text).not.toContain("Screen first:");
    expect(text).not.toContain("steering_could_help");
    // The registration itself is as on every account.
    expect(text).toContain("Plain answer registered: 1 claim, signed with the time.");
    expect(text).toContain(`research_receipt: ${structured.research_receipt}`);
    // Sent as it is, the menu is planned at once and asks, with the planner's question for the reply.
    const asked = await call({ action: "plan_research", later_inputs: structured.planned_later_inputs });
    expect(asked.isError, words(asked)).not.toBe(true);
    expect(asked.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask",
      steering_choice: REPLY.steering_choice, target_matches_plain_answer: true } });
    expect((asked.structuredContent as { researchMenu: { tasks: unknown[] } }).researchMenu.tasks).toHaveLength(3);
  });

  it("goes on with the reading said first when the planner names no question", async () => {
    const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf({ ...REPLY, steering_choice: "none",
      tasks: REPLY.tasks.slice(0, 2) }, 0)! }));
    const { call } = await tool(memory.planner);
    // No words passed on: the plan is made from the research target, and the result asks for them next time.
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(memory.seen[0]!.source.asked).toBeUndefined();
    const structured = registered.structuredContent as { next_step: string; planned_later_inputs: Record<string, unknown> };
    expect(structured).toMatchObject({ research_plan: { steering_choice: "none", searches: 0, from_asked: false } });
    expect(words(registered)).toContain("with its own model call (no web search)");
    expect(words(registered)).toContain("This plan was made from your research target alone. Next time give " +
      "later_inputs.asked with the plain answer");
    expect(structured.next_step).toContain("Next time give later_inputs.asked with the plain answer");
    const planned = await call({ action: "plan_research", later_inputs: structured.planned_later_inputs });
    expect(planned.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on", say_reading_first: true } });
    expect(words(planned)).toContain(READING_FIRST);
  });

  it("keeps the doubt that is not yet a claim before the plan, with the framing and the words again", async () => {
    const { call } = await tool(memoryPlanner().planner);
    const framing = { likely_question: "Does it work?", premise_doubts: ["That the oil holds the compounds"] };
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { framing, asked: SOURCE.asked } });
    const doubt = "If a doubt that could be false, not only unclear, is not yet a claim of the plain answer, register " +
      "the plain answer again first, with the same later_inputs.framing and later_inputs.asked";
    expect(words(registered)).toContain(doubt);
    expect((registered.structuredContent as { next_step: string }).next_step.startsWith(doubt)).toBe(true);
  });

  it("plans as before for every other account, whose words are not used", async () => {
    const memory = memoryPlanner();
    const { call } = await tool(memory.planner);
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: SOURCE.asked } }, "auth0|person");
    expect(registered.isError).not.toBe(true);
    expect(memory.seen).toHaveLength(0);
    expect(registered.content[0]).toEqual({ type: "text", text: framingGuidance(DEFAULT_RESEARCH_STEERING, undefined) });
    expect(registered.structuredContent).toMatchObject({ next_step: framingNextStep(DEFAULT_RESEARCH_STEERING, undefined) });
    for (const field of ["research_plan", "planned_later_inputs", "research_plan_not_used"]) {
      expect(registered.structuredContent).not.toHaveProperty(field);
    }
    expect(words(registered)).not.toContain(SOURCE.asked!);
  });

  it("says why there is no plan, and tells the person only when a day's limit is reached", async () => {
    for (const [reason, forPerson] of [["account_limit", true], ["daily_budget", true], ["error", false],
      ["timeout", false], ["refusal", false], ["unreadable", false]] as const) {
      const { call } = await tool(memoryPlanner(() => ({ status: "skipped", reason })).planner);
      const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
        later_inputs: { asked: SOURCE.asked } });
      expect(registered.isError, reason).not.toBe(true);
      const sentence = plannerNotUsedSentence(reason, 10);
      // The result is the one every account gets, with the sentence after its first text.
      expect(registered.content[0], reason).toEqual({ type: "text",
        text: framingGuidance(DEFAULT_RESEARCH_STEERING, undefined) });
      expect(registered.content[1], reason).toEqual({ type: "text", text: sentence });
      expect(registered.structuredContent, reason).toMatchObject({ ok: true, research_plan_not_used: reason,
        next_step: `${framingNextStep(DEFAULT_RESEARCH_STEERING, undefined)}${forPerson ? ` ${sentence}` : ""}` });
      expect(registered.structuredContent, reason).not.toHaveProperty("research_plan");
      expect(sentence.includes("Tell the person so in one line"), reason).toBe(forPerson);
    }
    expect(plannerNotUsedSentence("account_limit", 10)).toContain("this account has had today's 10 calls, and they " +
      "start again at 00:00 UTC");
    // A planner that reports off, or throws, changes nothing or counts as a failure: the registration still stands.
    const off = await tool(memoryPlanner(() => ({ status: "skipped", reason: "off" })).planner);
    const plain = await off.call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(plain.content[1]!.type === "text" && plain.content[1].text.startsWith("Plain answer registered")).toBe(true);
    expect(plain.structuredContent).not.toHaveProperty("research_plan_not_used");
    const thrown = await tool({ enabled: true, plan: async () => { throw new Error("broken"); } });
    const stands = await thrown.call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(stands.structuredContent).toMatchObject({ ok: true, research_plan_not_used: "error" });
  });

  it("takes the person's words only with register_plain_answer, and only up to their limit", async () => {
    const memory = memoryPlanner();
    const { call } = await tool(memory.planner);
    const elsewhere = await call({ action: "inspect", later_inputs: { asked: SOURCE.asked } });
    expect(elsewhere.isError).toBe(true);
    expect(words(elsewhere)).toContain("later_inputs.asked goes only with action register_plain_answer.");
    const long = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: "x".repeat(ASKED_LIMIT + 1) } });
    expect(long.isError).toBe(true);
    expect(memory.seen).toHaveLength(0);
    // A refusal does not repeat what was sent.
    expect(words(long)).not.toContain("xxxxxxxxxx");
  });

  it("shows the planner on the account page, for a dev account, with its limits", () => {
    const account = (devAccount: boolean): AtlasResearchAccount => ({ status: "ACTIVE", mode: "FREE_CONTRIBUTOR",
      devAccount, settings: {} } as unknown as AtlasResearchAccount);
    const server = (researchPlanner: AtlasServerFeatures["researchPlanner"]): AtlasServerFeatures => ({
      redditReader: false, youtube: false, gemini: false, aiBudgetLeftNanoUsd: null, videoSecondsLeft: null,
      meaningJudge: { on: false, dailyCapUsd: null }, researchPlanner, ownerLibrary: false, sharedAnswers: false,
      findingsLibrary: false });
    const row = (devAccount: boolean, researchPlanner: AtlasServerFeatures["researchPlanner"]) =>
      atlasFeatureRows(account(devAccount), server(researchPlanner), new Date("2026-11-13T12:00:00Z"))
        .find(({ id }) => id === "research-planner")!;
    const on = { on: true, dailyCapUsd: 3, accountDailyCalls: 10 };
    expect(row(true, on)).toMatchObject({ on: true, name: "AskRigor's own research plan",
      whoPays: "AskRigor's owner, from their monthly Claude API credits." });
    expect(row(true, on).forYou).toContain("go to Anthropic for this; AskRigor keeps none of them");
    expect(row(true, on).limit).toContain("10 plans a day for your account");
    expect(row(false, on)).toMatchObject({ on: false, forYou: "It runs only for the owner's dev accounts." });
    expect(row(true, { on: false, dailyCapUsd: null, accountDailyCalls: null })).toMatchObject({ on: false,
      limit: "Nothing is spent while it is off." });
  });
});

describe("a steering_choice that is neither the word none nor a question is handed back (13 Nov 2026)", () => {
  const TASKS = [
    { task: "Read the trial's adverse-event table in full", kind: "full_text", could_change: "conclusion" },
    { task: "Audit how the trial recorded adverse events", kind: "method_audit", could_change: "confidence" },
  ];
  const menu = (overrides: Record<string, unknown> = {}) => ({ research_target: PLAIN.researchTarget, tasks: TASKS,
    ...overrides });

  it("tells the two forms the field takes from a value that is neither, by its form alone", () => {
    for (const value of ["none_needed", "none needed", "None.", "none: the question names the trial",
      "NONE - precise question", "none (not needed)", "n/a", "N/A", "null", "no", "false", "nothing", "-", "none_"]) {
      expect(steeringChoiceUnclear(value), value).toBe(true);
    }
    for (const value of [undefined, "none", " None ", "NONE",
      "Do you mean loose stools on either medicine, or the difference between the two?",
      "None of the studies you saw, or one of them?", "Which form?", "Dose?", "你指的是哪种油？", "¿Qué forma usa?",
      "Quelle forme utilisez-vous", "Welche Form"]) {
      expect(steeringChoiceUnclear(value), String(value)).toBe(false);
    }
  });

  it("hands the menu back on every account when the decision rests on it, and plans it once it is one of the two", async () => {
    for (const subject of ["auth0|dev", "auth0|person"]) {
      const { call } = await tool(undefined);
      const refused = await call({ action: "plan_research", later_inputs: { researchMenu: menu({
        steering_choice: "none_needed" }) } }, subject);
      expect(refused.isError, subject).toBe(true);
      const structured = refused.structuredContent as { error: { code: string; message: string }; problems: string[];
        corrected_later_inputs: { researchMenu: Record<string, unknown> } };
      expect(structured.error.code).toBe("invalid_request");
      expect(structured.problems).toEqual(["later_inputs.researchMenu.steering_choice: \"none_needed\" is neither the " +
        "word none nor a question; write exactly none, or the one question you would ask this person, as a sentence"]);
      // The call comes back as it was, with the field's place marked.
      expect(structured.corrected_later_inputs.researchMenu).toEqual(menu({
        steering_choice: "<the one question you would ask this person, or none>" }));
      expect(words(refused)).toContain("later_inputs.researchMenu.steering_choice was \"none_needed\", which is " +
        "neither the word none nor a question");
      // With the exact word it goes on, and with a question it asks.
      const none = await call({ action: "plan_research", later_inputs: { researchMenu: menu({
        steering_choice: "none" }) } }, subject);
      expect(none.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      const named = await call({ action: "plan_research", later_inputs: { researchMenu: menu({
        steering_choice: "Which medicine do you mean?" }) } }, subject);
      expect(named.structuredContent, subject).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
    }
  });

  it("plans a menu whose decision does not rest on it as it came", async () => {
    const { call } = await tool(undefined);
    // The person has answered: the menu goes on either way.
    const answered = await call({ action: "plan_research", later_inputs: { researchMenu: menu({
      steering_choice: "none_needed", allocation: [{ task: 1, minutes: 2 }], person_answered: true }) } });
    expect(answered.isError, words(answered)).not.toBe(true);
    expect(answered.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
    // Long tasks ask either way.
    const long = await call({ action: "plan_research", later_inputs: { researchMenu: menu({ steering_choice: "n/a",
      tasks: [{ task: "Read twelve papers in full", kind: "full_text", could_change: "conclusion", sources: 12 }] }) } });
    expect(long.isError, words(long)).not.toBe(true);
    expect(long.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
  });
});
