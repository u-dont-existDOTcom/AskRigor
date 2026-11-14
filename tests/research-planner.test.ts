import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
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
  type ResearchPlannerState,
} from "../apps/research-mcp/src/research-planner.js";
import { FINALIZE_REMINDER } from "../apps/research-mcp/src/research-finalization-gate.js";
import type { ResearchReviewer } from "../apps/research-mcp/src/research-reviewer.js";
import {
  ANSWER_REVIEW_ASKED,
  ASIDE_OPENING,
  ASKED_LIMIT,
  ASKED_REQUEST,
  DEFAULT_RESEARCH_STEERING,
  LIGHT_LANE_PLANNED,
  LIGHT_LOOKUP,
  PLAN_TASK_KINDS,
  READING_FIRST,
  RESEARCH_LANES,
  asideGuidance,
  asideNextStep,
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
  writeFile?: (path: string, text: string) => void;
  /** The module's own file operations, on real files: one test's, in a temporary directory. */
  ownFiles?: boolean;
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
    ...(options.ownFiles === true ? {} : { readFile: options.readFile ?? (() => `${KEY}\n`) }),
    ...(options.writeFile === undefined ? {} : { writeFile: options.writeFile }),
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
      // A reply without a lane is research (owner answer 302).
      lane: "research",
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
    expect(refusal).not.toHaveProperty("refusalCategory");
    // The category the API names is logged with it, as a class; anything that is not one is left out.
    const named = planner({ reply: () => message({ stop_reason: "refusal", content: [],
      stop_details: { type: "refusal", category: "bio", explanation: "An explanation that is not logged." } }) });
    expect(await named.planner.plan(SOURCE, "account-a")).toMatchObject({ refusalCategory: "bio",
      planning: { status: "skipped", reason: "refusal" } });
    expect(named.logs).toEqual(["refusal_category_bio", "refusal"]);
    const odd = planner({ reply: () => message({ stop_reason: "refusal", content: [],
      stop_details: { type: "refusal", category: "Not A Class!", explanation: null } }) });
    expect(await odd.planner.plan(SOURCE, "account-a")).not.toHaveProperty("refusalCategory");
    expect(odd.logs).toEqual(["refusal"]);
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
    // A failure with no answer from the API may have run, so it keeps what was held for it; one the API answered
    // with an error status did not run, and costs nothing.
    const failed = planner({ reply: () => { throw new Error(`request failed for ${KEY}`); } });
    expect(await failed.planner.plan(SOURCE, "account-a")).toMatchObject({
      planning: { status: "skipped", reason: "error" }, costUsd: 0.12 });
    // The log holds the failure's class only, never its message.
    expect(failed.logs).toEqual(["error"]);
    const answered = planner({ reply: () => { throw new Anthropic.APIError(529, undefined, "overloaded", new Headers()); } });
    expect(await answered.planner.plan(SOURCE, "account-a")).toMatchObject({
      planning: { status: "skipped", reason: "error" }, costUsd: 0 });
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
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.3" },
      reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release.push(() => resolve(message())); }) });
    // Three calls sent before any has answered: USD 0.12 is held for each, and the cap has room for two.
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
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.15" },
      reply: () => { if (fail) throw new Anthropic.APIError(529, undefined, "overloaded", new Headers()); return message(); } });
    expect((await made.planner.plan(SOURCE, "account-a")).planning).toEqual({ status: "skipped", reason: "error" });
    fail = false;
    // The failed call was not kept: the same words are asked again, and now planned (about USD 0.07).
    const planned = await made.planner.plan(SOURCE, "account-a");
    expect(planned).toMatchObject({ cached: false, planning: { status: "planned" } });
    expect(planned.costUsd).toBeGreaterThan(0.05);
    // The cap no longer has room for what a call holds (0.07 spent and 0.12 held would pass 0.15).
    expect((await made.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning)
      .toEqual({ status: "skipped", reason: "daily_budget" });
    // A plan already made is still given from memory; a new day starts the budget again.
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(true);
    at = Date.parse("2026-11-14T00:00:05Z");
    expect((await made.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning.status).toBe("planned");
  });
});

// The three lanes (owner answer 302, 14 November 2026) ----------------------------------------------------------------

const NONE = { ...REPLY, steering_choice: "none" };
const ONE_TASK = [REPLY.tasks[0]!];
const TWO_TASKS = REPLY.tasks.slice(0, 2);
const AUDIT = { task: "Audit how the study measured it", kind: "method_audit", could_change: "confidence", sources: 1 };
const LIGHT_REPLY = { ...NONE, lane: "light", tasks: ONE_TASK };

describe("AskRigor's own planning call: the three lanes (owner answer 302)", () => {
  it("asks the model for a lane, which the output schema requires", () => {
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.required).toEqual(["about", "steering_choice", "lane", "tasks"]);
    // The lane is written before the tasks, whose number it decides.
    expect(Object.keys(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties)).toEqual(["about", "steering_choice", "lane", "tasks"]);
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.lane).toEqual({ type: "string", enum: ["research", "light", "aside"],
      description: "research, light (one fact one named source states, to be opened and quoted) or aside (a plain " +
        "look-up AskRigor adds nothing to)." });
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.lane.enum).toEqual([...RESEARCH_LANES]);
  });

  it("keeps aside only with the word none, and an aside plan has no tasks, whatever the reply listed", () => {
    // The reply listed three tasks: the plan has none.
    expect(researchPlanOf({ ...NONE, lane: "aside" }, 1)).toEqual({ about: REPLY.about, steering_choice: "none",
      tasks: [], lane: "aside", searches: 1 });
    // With no tasks listed, and with the word as the model cased it.
    expect(researchPlanOf({ ...REPLY, steering_choice: " None. ", lane: "aside", tasks: [] }, 0)).toEqual({
      about: REPLY.about, steering_choice: "none", tasks: [], lane: "aside", searches: 0 });
    // A reply that names a question is research, with the usual rules: at least one task, or it is not a plan.
    const named = researchPlanOf({ ...REPLY, lane: "aside" }, 1)!;
    expect(named).toMatchObject({ lane: "research", steering_choice: REPLY.steering_choice });
    expect(named.tasks).toHaveLength(3);
    expect(researchPlanOf({ ...REPLY, lane: "aside", tasks: [] }, 1)).toBeUndefined();
    // A value that is neither the word nor a question is no plan, in any lane.
    expect(researchPlanOf({ ...REPLY, steering_choice: "none needed", lane: "aside" }, 1)).toBeUndefined();
  });

  it("keeps light only with the word none and one or two tasks, none a method audit; otherwise it is research", () => {
    const light = researchPlanOf(LIGHT_REPLY, 1)!;
    expect(light).toEqual({ about: REPLY.about, steering_choice: "none", lane: "light", searches: 1,
      tasks: [{ task: REPLY.tasks[0]!.task, kind: "study_search", could_change: "conclusion", sources: 2 }] });
    expect(researchPlanOf({ ...LIGHT_REPLY, tasks: TWO_TASKS }, 1)).toMatchObject({ lane: "light" });
    expect(researchPlanOf({ ...LIGHT_REPLY, tasks: TWO_TASKS }, 1)!.tasks).toHaveLength(2);
    // The reply contradicts itself, and in doubt AskRigor researches: three tasks, a method audit, a named question.
    for (const reply of [{ ...LIGHT_REPLY, tasks: REPLY.tasks }, { ...LIGHT_REPLY, tasks: [AUDIT] },
      { ...LIGHT_REPLY, tasks: [REPLY.tasks[0], AUDIT] }, { ...LIGHT_REPLY, steering_choice: REPLY.steering_choice }]) {
      const plan = researchPlanOf(reply, 1);
      expect(plan, JSON.stringify(reply)).toBeDefined();
      expect(plan!.lane, JSON.stringify(reply)).toBe("research");
      expect(plan!.tasks, JSON.stringify(reply)).toHaveLength(reply.tasks.length);
    }
    // No tasks is no plan, in the light lane as in research.
    expect(researchPlanOf({ ...LIGHT_REPLY, tasks: [] }, 1)).toBeUndefined();
  });

  it("reads a reply without a lane, or with research, as research", () => {
    for (const reply of [REPLY, NONE, { ...REPLY, lane: "research" }, { ...NONE, tasks: ONE_TASK, lane: "research" }]) {
      expect(researchPlanOf(reply, 1)?.lane, JSON.stringify(reply)).toBe("research");
    }
  });

  it("gives the lane of the hour's plan for the same account and words, and nothing else", async () => {
    let at = Date.parse("2026-11-13T10:00:00Z");
    const files = memoryFiles();
    const made = onFiles(files, { now: () => at, reply: () => message({}, LIGHT_REPLY) });
    const accountKey = "account-a";
    // Nothing cached yet: no lane, and nothing sent, counted or written.
    expect(await made.planner.lane(SOURCE.asked, accountKey)).toBeUndefined();
    expect(made.bodies).toHaveLength(0);
    expect(files.writes).toHaveLength(0);
    expect((await made.planner.plan(SOURCE, accountKey)).planning).toMatchObject({ status: "planned",
      plan: { lane: "light" } });
    const writes = files.writes.length;
    const state = files.state();
    expect(state.account_calls).toEqual({ [digest(accountKey)]: 1 });
    // The same words, whatever research target the registration gave them (plan()'s own key).
    expect(await made.planner.lane(SOURCE.asked, accountKey)).toBe("light");
    expect((await made.planner.plan({ ...SOURCE, researchTarget: "Reworded" }, accountKey)).cached).toBe(true);
    expect(await made.planner.lane(SOURCE.asked, accountKey)).toBe("light");
    // Other words, another account, or no words: no lane.
    expect(await made.planner.lane(`${SOURCE.asked} and by mouth?`, accountKey)).toBeUndefined();
    expect(await made.planner.lane(SOURCE.asked, "account-b")).toBeUndefined();
    expect(await made.planner.lane(undefined, accountKey)).toBeUndefined();
    // Asking sent nothing, counted nothing and wrote nothing.
    expect(made.bodies).toHaveLength(1);
    expect(files.writes).toHaveLength(writes);
    expect(files.state()).toEqual(state);
    // A plan made without the person's words is keyed by the research target: no words find it.
    const bare = { researchTarget: "T", quickAnswer: "Q.", claims: ["Q."] };
    expect((await made.planner.plan(bare, accountKey)).planning.status).toBe("planned");
    expect(await made.planner.lane("T", accountKey)).toBeUndefined();
    expect(made.bodies).toHaveLength(2);
    expect(files.state().account_calls).toEqual({ [digest(accountKey)]: 2 });
    // After the hour, no lane, and still nothing sent or written by asking.
    const later = files.writes.length;
    at += 61 * 60 * 1_000;
    expect(await made.planner.lane(SOURCE.asked, accountKey)).toBeUndefined();
    expect(made.bodies).toHaveLength(2);
    expect(files.writes).toHaveLength(later);
  });

  it("gives the lane by the research target when the words are no longer the plan's", async () => {
    let at = Date.parse("2026-11-14T10:00:00Z");
    const files = memoryFiles();
    let reply: unknown = LIGHT_REPLY;
    const made = onFiles(files, { now: () => at, reply: () => message({}, reply) });
    const accountKey = "account-a";
    // No plan yet: no lane by the target either.
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBeUndefined();
    expect((await made.planner.plan(SOURCE, accountKey)).planning).toMatchObject({ status: "planned",
      plan: { lane: "light" } });
    const writes = files.writes.length;
    // The final check's words carry a later message of the person's, so they are not the plan's; the research target
    // is, compared as the final check compares it (case and spacing ignored).
    const later = `${SOURCE.asked}\n\nyou decide`;
    expect(await made.planner.lane(later, accountKey, SOURCE.researchTarget)).toBe("light");
    expect(await made.planner.lane(undefined, accountKey, `  ${SOURCE.researchTarget!.toUpperCase()}  `)).toBe("light");
    // Another target, another account, or no target: no lane.
    expect(await made.planner.lane(later, accountKey, "Another question")).toBeUndefined();
    expect(await made.planner.lane(later, "account-b", SOURCE.researchTarget)).toBeUndefined();
    expect(await made.planner.lane(later, accountKey)).toBeUndefined();
    // The same words registered again for a corrected target keep the plan, and its lane for that target too.
    expect((await made.planner.plan({ ...SOURCE, researchTarget: "Corrected target" }, accountKey)).cached).toBe(true);
    expect(await made.planner.lane(undefined, accountKey, "corrected  target")).toBe("light");
    // Asking sent nothing, counted nothing and wrote nothing.
    expect(made.bodies).toHaveLength(1);
    expect(files.writes).toHaveLength(writes);
    // The person asks for more: a new plan for the same target, made from their new words, replaces the lane.
    reply = REPLY;
    expect((await made.planner.plan({ ...SOURCE, asked: `${SOURCE.asked}\n\nresearch it fully` }, accountKey)).planning)
      .toMatchObject({ status: "planned", plan: { lane: "research" } });
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBe("research");
    // The first words still name their own plan while the hour lasts.
    expect(await made.planner.lane(SOURCE.asked, accountKey, SOURCE.researchTarget)).toBe("light");
    // A call that was not a plan leaves the target's lane as it was.
    reply = "not a plan";
    expect((await made.planner.plan({ ...SOURCE, asked: "other words" }, accountKey)).planning.status).toBe("skipped");
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBe("research");
    // After the hour, no lane.
    at += 61 * 60 * 1_000;
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBeUndefined();
    expect(await made.planner.lane(SOURCE.asked, accountKey, SOURCE.researchTarget)).toBeUndefined();
  });

  it("keeps a target's lane no longer than its plan, and never lets an older registration replace a newer one's",
    async () => {
      // A plan registered again from the cache, late in its hour, keeps its own hour for the target too.
      let at = Date.parse("2026-11-14T10:00:00Z");
      const made = onFiles(memoryFiles(), { now: () => at, reply: () => message({}, LIGHT_REPLY) });
      expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
      at += 59 * 60 * 1_000;
      expect((await made.planner.plan({ ...SOURCE, researchTarget: "Corrected target" }, "account-a")).cached).toBe(true);
      expect(await made.planner.lane(undefined, "account-a", "Corrected target")).toBe("light");
      at += 2 * 60 * 1_000;
      expect(await made.planner.lane(undefined, "account-a", "Corrected target")).toBeUndefined();
      expect(await made.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBeUndefined();

      // A slow call that began first and ends last does not replace the lane of a registration that began after it.
      let release: ((value: Anthropic.Beta.BetaMessage) => void) | undefined;
      let calls = 0;
      const slow = onFiles(memoryFiles(), { now: () => at, reply: () => {
        calls += 1;
        return calls === 1 ? new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release = resolve; })
          : message({}, REPLY);
      } });
      const first = slow.planner.plan(SOURCE, "account-a");
      at += 10_000;
      expect((await slow.planner.plan({ ...SOURCE, asked: `${SOURCE.asked}\n\nresearch it fully` }, "account-a"))
        .planning).toMatchObject({ status: "planned", plan: { lane: "research" } });
      expect(await slow.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBe("research");
      at += 10_000;
      release!(message({}, LIGHT_REPLY));
      expect((await first).planning).toMatchObject({ status: "planned", plan: { lane: "light" } });
      expect(await slow.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBe("research");
    });

  it("gives each lane as the plan has it, waits for a plan still being made, and none for a call that was not a plan",
    async () => {
      for (const [reply, lane] of [[REPLY, "research"], [{ ...NONE, lane: "aside" }, "aside"], [LIGHT_REPLY, "light"]] as const) {
        const made = planner({ reply: () => message({}, reply) });
        await made.planner.plan(SOURCE, "account-a");
        expect(await made.planner.lane(SOURCE.asked, "account-a")).toBe(lane);
      }
      // A call still running is awaited.
      const release: Array<(value: Anthropic.Beta.BetaMessage) => void> = [];
      const slow = planner({ reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release.push(resolve); }) });
      const planning = slow.planner.plan(SOURCE, "account-a");
      let settled = false;
      const lane = slow.planner.lane(SOURCE.asked, "account-a").then((value) => { settled = true; return value; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(settled).toBe(false);
      release[0]!(message({}, LIGHT_REPLY));
      expect(await lane).toBe("light");
      expect((await planning).planning.status).toBe("planned");
      // A running call that ends without a plan gives none, and so does one that ended so before.
      const refusing = planner({ reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => {
        release.push(resolve); }) });
      const refused = refusing.planner.plan(SOURCE, "account-a");
      const during = refusing.planner.lane(SOURCE.asked, "account-a");
      release.at(-1)!(message({ stop_reason: "refusal", content: [] }));
      expect(await during).toBeUndefined();
      expect((await refused).planning).toEqual({ status: "skipped", reason: "refusal" });
      expect(await refusing.planner.lane(SOURCE.asked, "account-a")).toBeUndefined();
      // A reply that is not a plan.
      const unreadable = planner({ reply: () => message({}, "not json") });
      await unreadable.planner.plan(SOURCE, "account-a");
      expect(await unreadable.planner.lane(SOURCE.asked, "account-a")).toBeUndefined();
    });

  it("gives no lane while the planner is off, and never calls then", async () => {
    const off = planner({ env: { ASKRIGOR_RESEARCH_PLANNER: undefined } });
    expect(off.planner.enabled).toBe(false);
    expect(await off.planner.lane(SOURCE.asked, "account-a")).toBeUndefined();
    expect(off.bodies).toHaveLength(0);
  });
});

// The day's counts across a restart (ASKRIGOR_RESEARCH_PLANNER_STATE_FILE) ------------------------------------------

const KEY_FILE = ENV.ASKRIGOR_RESEARCH_PLANNER_KEY_FILE;
const STATE_FILE = "/run/askrigor-research-planner/state.json";
const TODAY = Date.parse("2026-11-13T10:00:00Z");
// What message() costs: 300 input and 600 output at Opus 5.5's prices, the cache written and read, and one search.
const CALL_USD = (300 * 4 + 600 * 20 + 8_000 * 5 + 15_000 * 0.2) / 1e6 + 0.01;
const digest = (accountKey: string): string => createHash("sha256").update(accountKey).digest("hex").slice(0, 16);
/** The file's contents as the planner writes them. */
const fileState = (spentUsd: number, accountCalls: Record<string, number>, utcDay = "2026-11-13") =>
  ({ schema_version: 1, utc_day: utcDay, spent_usd: spentUsd, account_calls: accountCalls });
const fileText = (changes: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ ...fileState(0, {}), ...changes })}\n`;

/**
 * The key file and the state file in memory, with every read and write: no test here touches a real file but the
 * last, which is about the module's own file operations. A restart is a new planner on the same files.
 */
function memoryFiles(state?: string) {
  const files = new Map<string, string>([[KEY_FILE, `${KEY}\n`]]);
  if (state !== undefined) files.set(STATE_FILE, state);
  const reads: string[] = [];
  const writes: Array<{ path: string; text: string }> = [];
  return {
    files, reads, writes,
    readFile: (path: string): string => {
      reads.push(path);
      const text = files.get(path);
      if (text === undefined) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: "ENOENT" });
      }
      return text;
    },
    writeFile: (path: string, text: string): void => {
      writes.push({ path, text });
      files.set(path, text);
    },
    state: (): ResearchPlannerState => JSON.parse(files.get(STATE_FILE)!) as ResearchPlannerState,
  };
}

/** A planner on those files, with the state file named and the clock at TODAY unless the options say otherwise. */
function onFiles(files: ReturnType<typeof memoryFiles>, options: NonNullable<Parameters<typeof planner>[0]> = {}) {
  return planner({ now: () => TODAY, readFile: files.readFile, writeFile: files.writeFile, ...options,
    env: { ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: STATE_FILE, ...options.env } });
}

describe("AskRigor's own planning call: the day's counts across a restart", () => {
  it("starts a restarted server from the day's file, so the day's cap still refuses", async () => {
    const files = memoryFiles();
    const env = { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.15" };
    const before = onFiles(files, { env });
    expect((await before.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
    // The restart: a new planner, with nothing in memory, on the same file a minute later. What the day has spent
    // leaves no room for what a call holds (0.066 and 0.12 would pass 0.15), so no call is sent.
    const after = onFiles(files, { env, now: () => TODAY + 60_000 });
    expect(after.logs).toEqual([]);
    expect((await after.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning)
      .toEqual({ status: "skipped", reason: "daily_budget" });
    expect(after.bodies).toHaveLength(0);
    // A refusal changes no count, so the file is as the first planner left it.
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
  });

  it("counts an account's plans across a restart, so the account's limit still refuses", async () => {
    const files = memoryFiles();
    const env = { ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "2" };
    const before = onFiles(files, { env });
    for (const [asked, account] of [["one", "account-a"], ["two", "account-a"], ["one", "account-b"]] as const) {
      expect((await before.planner.plan({ ...SOURCE, asked }, account)).planning.status).toBe("planned");
    }
    expect(files.state().account_calls).toEqual({ [digest("account-a")]: 2, [digest("account-b")]: 1 });
    // After the restart account-a has had its two, and account-b has one left.
    const after = onFiles(files, { env, now: () => TODAY + 60_000 });
    expect((await after.planner.plan({ ...SOURCE, asked: "three" }, "account-a")).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect(after.bodies).toHaveLength(0);
    expect((await after.planner.plan({ ...SOURCE, asked: "two" }, "account-b")).planning.status).toBe("planned");
    expect((await after.planner.plan({ ...SOURCE, asked: "three" }, "account-b")).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect(after.bodies).toHaveLength(1);
    expect(files.state()).toEqual(fileState(expect.closeTo(4 * CALL_USD, 10),
      { [digest("account-a")]: 2, [digest("account-b")]: 2 }));
  });

  it("starts a new day from zero: yesterday's file counts for nothing, and midnight starts it again", async () => {
    // Yesterday's file, with the cap and the account's plans used up.
    const files = memoryFiles(fileText({ utc_day: "2026-11-12", spent_usd: 2.95,
      account_calls: { [digest("account-a")]: 10 } }));
    let at = Date.parse("2026-11-13T23:59:00Z");
    const made = onFiles(files, { now: () => at });
    expect(made.logs).toEqual([]);
    // Nothing is written until a count changes: the file is still yesterday's.
    expect(files.writes).toHaveLength(0);
    expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
    // The first registration after midnight starts the file again, before anything is counted for the new day.
    at = Date.parse("2026-11-14T00:00:05Z");
    const written = files.writes.length;
    expect((await made.planner.plan({ ...SOURCE, asked: "a new day's question" }, "account-b")).planning.status)
      .toBe("planned");
    expect(JSON.parse(files.writes[written]!.text)).toEqual(fileState(0, {}, "2026-11-14"));
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-b")]: 1 }, "2026-11-14"));
  });

  it("leaves the new day's file at zero when a call's reply comes after midnight", async () => {
    let at = Date.parse("2026-11-13T23:59:50Z");
    const files = memoryFiles();
    const release: Array<() => void> = [];
    const made = onFiles(files, { now: () => at,
      reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release.push(() => resolve(message())); }) });
    const pending = made.planner.plan(SOURCE, "account-a");
    expect(files.state()).toEqual(fileState(0.12, { [digest("account-a")]: 1 }));
    at = Date.parse("2026-11-14T00:00:05Z");
    release[0]!();
    expect((await pending).planning.status).toBe("planned");
    // The call counted toward the day it was sent on: nothing of it is in the new day's file.
    expect(files.state()).toEqual(fileState(0, {}, "2026-11-14"));
  });

  it("starts from zero, without throwing, on a file that is not as it writes it or that it cannot read", async () => {
    // Each would refuse the call below, were its numbers taken: the cap used up, or the account's plans.
    const spent = { spent_usd: 2.95 };
    const used = { account_calls: { [digest("account-a")]: 10 } };
    const notFinite = fileText(used).replace("\"spent_usd\":0", "\"spent_usd\":1e999");
    expect(JSON.parse(notFinite)).toMatchObject({ spent_usd: Number.POSITIVE_INFINITY });
    for (const [what, text] of [
      ["not JSON", "not json"],
      ["an empty file", ""],
      ["half a file", fileText({ ...spent, ...used }).slice(0, 60)],
      ["null", "null"],
      ["a list", "[]"],
      ["another version", fileText({ ...used, schema_version: 2 })],
      ["a part missing", JSON.stringify({ schema_version: 1, utc_day: "2026-11-13", spent_usd: 2.95 })],
      ["a part more", fileText({ ...used, question: "never kept" })],
      ["a day that is no date", fileText({ ...used, utc_day: "today" })],
      ["a day still to come", fileText({ ...spent, ...used, utc_day: "2026-11-14" })],
      ["a negative spend", fileText({ ...used, spent_usd: -0.5 })],
      ["a spend that is no number", fileText({ ...used, spent_usd: "2.95" })],
      ["a spend that is not finite", notFinite],
      ["a negative count", fileText({ ...spent, account_calls: { [digest("account-a")]: -1 } })],
      ["a count that is no whole number", fileText({ ...spent, account_calls: { [digest("account-a")]: 2.5 } })],
      ["a count that is not finite", fileText(used).replace(":10}", ":1e999}")],
      ["an account key as it is", fileText({ ...spent, account_calls: { "account-a": 10 } })],
    ] as const) {
      const files = memoryFiles(text);
      const made = onFiles(files);
      expect(made.planner.enabled, what).toBe(true);
      // Said once, as a class: the first change replaces the file, so nothing else would show it was not used.
      expect(made.logs, what).toEqual(["state_file_malformed"]);
      expect((await made.planner.plan(SOURCE, "account-a")).planning.status, what).toBe("planned");
      expect(files.state(), what).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
    }
    // A file that is not there, or that cannot be read: zero too, and nothing in the log.
    for (const failure of [
      Object.assign(new Error(`ENOENT: no such file or directory, open '${STATE_FILE}'`), { code: "ENOENT" }),
      Object.assign(new Error(`EACCES: permission denied, open '${STATE_FILE}'`), { code: "EACCES" }),
      "not an error at all",
    ]) {
      const files = memoryFiles();
      const made = onFiles(files, { readFile: (path) => {
        if (path === STATE_FILE) throw failure;
        return files.readFile(path);
      } });
      expect(made.planner.enabled).toBe(true);
      expect(made.logs).toEqual([]);
      expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
      expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
    }
  });

  it("goes on in memory when the file cannot be written, and says so once", async () => {
    const files = memoryFiles();
    let broken = true;
    let attempts = 0;
    const made = onFiles(files, { env: { ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "1" },
      writeFile: (path, text) => {
        attempts += 1;
        if (broken) throw new Error(`EACCES: permission denied, open '${path}'`);
        files.writeFile(path, text);
      } });
    // The plan is made as if nothing had happened.
    expect(await made.planner.plan(SOURCE, "account-a")).toMatchObject({ cached: false,
      planning: { status: "planned" } });
    // Four changes, four tries (the day's turn, the account's call, what is held, what the call cost), and one line:
    // a class, never the path or the error's words.
    expect(attempts).toBe(4);
    expect(made.logs).toEqual(["state_write_failed"]);
    expect(files.files.has(STATE_FILE)).toBe(false);
    // The counts go on in memory: the account has had its one plan.
    expect((await made.planner.plan({ ...SOURCE, asked: "a second question" }, "account-a")).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect((await made.planner.plan(SOURCE, "account-b")).planning.status).toBe("planned");
    expect(attempts).toBe(7);
    expect(made.logs).toEqual(["state_write_failed"]);
    // Each change tries the file again, so once it can be written it holds the whole day.
    broken = false;
    expect((await made.planner.plan(SOURCE, "account-c")).planning.status).toBe("planned");
    expect(files.state()).toEqual(fileState(expect.closeTo(3 * CALL_USD, 10),
      { [digest("account-a")]: 1, [digest("account-b")]: 1, [digest("account-c")]: 1 }));
    expect(made.logs).toEqual(["state_write_failed"]);
  });

  it("holds a timed-out call's share in the file, so a restart does not give it back", async () => {
    vi.useFakeTimers();
    try {
      const files = memoryFiles();
      const env = { ASKRIGOR_RESEARCH_PLANNER_TIMEOUT_SECONDS: "1", ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.2" };
      const slow = onFiles(files, { env, reply: () => new Promise<Anthropic.Beta.BetaMessage>(() => undefined) });
      const pending = slow.planner.plan(SOURCE, "account-a");
      // Held in the file before any answer, so a server stopped while the call runs starts again with it: the cap has
      // no room for a second call (0.12 held and 0.12 more would pass 0.2).
      expect(files.state()).toEqual(fileState(0.12, { [digest("account-a")]: 1 }));
      const during = onFiles(files, { env });
      expect((await during.planner.plan(SOURCE, "account-b")).planning)
        .toEqual({ status: "skipped", reason: "daily_budget" });
      await vi.advanceTimersByTimeAsync(1_100);
      expect(await pending).toMatchObject({ planning: { status: "skipped", reason: "timeout" }, costUsd: 0.12 });
      // The call may have run, so what was held for it stays in the file, and a restart finds it there.
      expect(files.state()).toEqual(fileState(expect.closeTo(0.12, 10), { [digest("account-a")]: 1 }));
      const after = onFiles(files, { env, now: () => TODAY + 60_000 });
      expect((await after.planner.plan(SOURCE, "account-b")).planning)
        .toEqual({ status: "skipped", reason: "daily_budget" });
      expect(during.bodies.length + after.bodies.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes the file after every change, and reads it once", async () => {
    const files = memoryFiles();
    const release: Array<() => void> = [];
    let fail = false;
    const made = onFiles(files, { reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve, reject) => {
      release.push(() => fail ? reject(new Anthropic.APIError(529, undefined, "overloaded", new Headers()))
        : resolve(message()));
    }) });
    expect(files.reads).toEqual([KEY_FILE, STATE_FILE]);
    expect(files.writes).toHaveLength(0);
    const account = digest("account-a");
    const first = made.planner.plan(SOURCE, "account-a");
    // Before the call is answered: the day's turn, the account's call, and what is held for it.
    expect(files.writes.map(({ text }) => JSON.parse(text))).toEqual([
      fileState(0, {}), fileState(0, { [account]: 1 }), fileState(0.12, { [account]: 1 })]);
    release[0]!();
    expect((await first).planning.status).toBe("planned");
    // Then what it cost, in place of what was held.
    expect(files.writes).toHaveLength(4);
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [account]: 1 }));
    // The plan given again from memory changes no count, so nothing is written.
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(true);
    expect(files.writes).toHaveLength(4);
    // A call the API answered with an error status: counted for the account, held, and what was held given back.
    fail = true;
    const second = made.planner.plan({ ...SOURCE, asked: "another question" }, "account-a");
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD + 0.12, 10), { [account]: 2 }));
    release[1]!();
    expect((await second).planning).toEqual({ status: "skipped", reason: "error" });
    expect(files.writes).toHaveLength(7);
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [account]: 2 }));
    // Each write is the whole file, one line of JSON, to the one path; the file was read when the planner was made
    // and never again.
    for (const { path, text } of files.writes) {
      expect(path).toBe(STATE_FILE);
      expect(text).toBe(`${JSON.stringify(JSON.parse(text))}\n`);
    }
    expect(files.reads).toEqual([KEY_FILE, STATE_FILE]);
  });

  it("names an account in the file by a digest of its key, and keeps nothing of the question there", async () => {
    const files = memoryFiles();
    const accountKey = "synthetic-account-key-of-a-dev-account-0123456789";
    const made = onFiles(files);
    const call = await made.planner.plan({ ...SOURCE, framing: { likely_question: "Does the oil work like the tea?",
      premise_doubts: ["That the oil holds the compounds"] } }, accountKey);
    expect(call.planning.status).toBe("planned");
    // The first 16 hex characters of the SHA-256 of the account key, and nothing else of it. (For the key
    // "account-a" that is fc164f8250803ea8, by sha256sum.)
    const named = createHash("sha256").update(accountKey).digest("hex").slice(0, 16);
    expect(named).toMatch(/^[0-9a-f]{16}$/u);
    expect(digest("account-a")).toBe("fc164f8250803ea8");
    expect(files.state()).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [named]: 1 }));
    for (const { text } of files.writes) {
      // A day, a spend figure and counts: no account key, no API key, and no word of what was asked, answered or
      // planned.
      expect(Object.keys(JSON.parse(text) as object))
        .toEqual(["schema_version", "utc_day", "spent_usd", "account_calls"]);
      for (const kept of [accountKey, KEY, SOURCE.asked!, SOURCE.researchTarget, SOURCE.quickAnswer,
        "Does the oil work like the tea?", "That the oil holds the compounds", REPLY.about, REPLY.steering_choice,
        REPLY.tasks[0]!.task]) {
        expect(text).not.toContain(kept);
      }
    }
    // A count is looked up the same way: in a file that names the account so, its plans for the day are used up,
    // and another account's are not.
    const full = memoryFiles(fileText({ account_calls: { [named]: 10 } }));
    const after = onFiles(full);
    expect((await after.planner.plan(SOURCE, accountKey)).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect((await after.planner.plan(SOURCE, "account-b")).planning.status).toBe("planned");
  });

  it("reads and writes nothing without the setting, and counts in memory as before", async () => {
    for (const setting of [undefined, "", "  "]) {
      // A file is there, with the cap used up, and nothing names it.
      const files = memoryFiles(fileText({ spent_usd: 2.95 }));
      const options = { now: () => TODAY, readFile: files.readFile, writeFile: files.writeFile,
        env: { ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: setting, ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.15" } };
      const made = planner(options);
      expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
      expect((await made.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning)
        .toEqual({ status: "skipped", reason: "daily_budget" });
      // As before, a restart starts the day's counts again.
      const again = planner(options);
      expect((await again.planner.plan({ ...SOURCE, asked: "another question" }, "account-b")).planning.status)
        .toBe("planned");
      // Each planner read its key file, and that is all: no other read, and no write.
      expect(files.reads, String(setting)).toEqual([KEY_FILE, KEY_FILE]);
      expect(files.writes, String(setting)).toEqual([]);
      expect([...made.logs, ...again.logs]).toEqual([]);
    }
    // A planner that is off reads and writes no state either, whatever names the file.
    const files = memoryFiles(fileText());
    const off = onFiles(files, { env: { ASKRIGOR_RESEARCH_PLANNER: undefined } });
    expect((await off.planner.plan(SOURCE, "account-a")).planning).toEqual({ status: "skipped", reason: "off" });
    expect(files.reads).toEqual([]);
    expect(files.writes).toEqual([]);
  });

  it("replaces a real file whole with its own file operations: mode 0600, no temporary file left behind", async () => {
    // The one test on real files, in a temporary directory: the temporary file, the rename and the mode are the
    // module's own, which a file in memory cannot show.
    const directory = mkdtempSync(join(tmpdir(), "askrigor-research-planner-"));
    try {
      const stateFile = join(directory, "state.json");
      writeFileSync(join(directory, "key"), `${KEY}\n`, { mode: 0o600 });
      const env = { ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: join(directory, "key"),
        ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: stateFile, ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "1" };
      const before = planner({ env, now: () => TODAY, ownFiles: true });
      expect((await before.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
      const earlier = readFileSync(stateFile, "utf8");
      expect(JSON.parse(earlier)).toEqual(fileState(expect.closeTo(CALL_USD, 10), { [digest("account-a")]: 1 }));
      expect(statSync(stateFile).mode & 0o777).toBe(0o600);
      // Four writes, each through a temporary file beside it, and only the file itself is left.
      expect(readdirSync(directory).sort()).toEqual(["key", "state.json"]);
      // The file is replaced, never rewritten in place: under a second name the earlier file stays whole, as it
      // would for a reader that had it open.
      linkSync(stateFile, join(directory, "earlier.json"));
      expect((await before.planner.plan(SOURCE, "account-b")).planning.status).toBe("planned");
      expect(readFileSync(join(directory, "earlier.json"), "utf8")).toBe(earlier);
      expect(JSON.parse(readFileSync(stateFile, "utf8"))).toEqual(fileState(expect.closeTo(2 * CALL_USD, 10),
        { [digest("account-a")]: 1, [digest("account-b")]: 1 }));
      expect(statSync(stateFile).mode & 0o777).toBe(0o600);
      expect(readdirSync(directory).sort()).toEqual(["earlier.json", "key", "state.json"]);
      expect(before.logs).toEqual([]);
      // The restart reads it back.
      const after = planner({ env, now: () => TODAY + 60_000, ownFiles: true });
      expect((await after.planner.plan({ ...SOURCE, asked: "another question" }, "account-a")).planning)
        .toEqual({ status: "skipped", reason: "account_limit" });
      expect(after.logs).toEqual([]);
      // A file that cannot be replaced, here because a directory is in its place: the plan is made, the log says so
      // once, and the temporary file is removed.
      const blocked = join(directory, "blocked");
      mkdirSync(join(blocked, "state.json"), { recursive: true });
      const stuck = planner({ env: { ...env, ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: join(blocked, "state.json") },
        now: () => TODAY, ownFiles: true });
      expect((await stuck.planner.plan(SOURCE, "account-b")).planning.status).toBe("planned");
      expect(stuck.logs).toEqual(["state_write_failed"]);
      expect(readdirSync(blocked)).toEqual(["state.json"]);
      // No folder at all: the same, and none is made.
      const nowhere = planner({ now: () => TODAY, ownFiles: true,
        env: { ...env, ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: join(directory, "none", "state.json") } });
      expect((await nowhere.planner.plan(SOURCE, "account-c")).planning.status).toBe("planned");
      expect(nowhere.logs).toEqual(["state_write_failed"]);
      expect(readdirSync(directory).sort()).toEqual(["blocked", "earlier.json", "key", "state.json"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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

async function tool(researchPlanner: ResearchPlanner | undefined, dev: readonly string[] = ["auth0|dev"],
  extra: Partial<RegisterToolsOptions> = {}) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
  for (const subject of ["auth0|dev", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev.map((subject) => service.accountKeyForSubject(subject)).join(","));
  let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
  const options: RegisterToolsOptions = { researchAccessRequired: true, mcpSurface: "/mcp",
    researchContributorAccessService: service, ...(researchPlanner === undefined ? {} : { researchPlanner }), ...extra };
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
    // Round 8 (13 Nov 2026): one chat added a reply it remembered from an earlier conversation, labelled as an
    // earlier clarification, and the plan then rested on words the person had not written in that chat.
    expect(ASKED_REQUEST).toContain("Give only what they wrote in this conversation: nothing from memory or from " +
      "earlier conversations, and no note or explanation of yours.");
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
    // One that throws before it returns a promise is a failure too, not a failed registration.
    const sync = await tool({ enabled: true, plan: () => { throw new Error("broken at once"); } });
    const still = await sync.call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(still.isError).not.toBe(true);
    expect(still.structuredContent).toMatchObject({ ok: true, research_plan_not_used: "error" });
  });

  it("takes the person's words as one text or as a list of messages, in order", async () => {
    // Round 7 (13 Nov 2026): four of five chats sent a list first, and were refused once each.
    const memory = memoryPlanner();
    const { call } = await tool(memory.planner);
    const listed = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: [" would the oil work as well as the tea? ", "seeds soaked in oil, by mouth"] } });
    expect(listed.isError, words(listed)).not.toBe(true);
    expect(memory.seen[0]!.source.asked).toBe("would the oil work as well as the tea?\n\nseeds soaked in oil, by mouth");
    expect(listed.structuredContent).toMatchObject({ research_plan: { from_asked: true } });
    // Not a list of anything else, not an empty list, and not more than the limit in all.
    for (const asked of [[], [""], [{ role: "user", content: "words" }], [1, 2],
      ["x".repeat(ASKED_LIMIT - 10), "y".repeat(20)]]) {
      const refused = await call({ action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { asked } });
      expect(refused.isError, JSON.stringify(asked).slice(0, 60)).toBe(true);
    }
    expect(memory.seen).toHaveLength(1);
    expect(ASKED_REQUEST).toContain("as one text or a list with one message each, at most 6,000 characters in all");
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

  // Owner answer 302 (14 Nov 2026): the lane of AskRigor's own plan, at the registration.
  const reviewing: ResearchReviewer = { enabled: true, dailyCapUsd: 3, accountDailyCalls: 10,
    review: async () => ({ reviewing: { status: "skipped", reason: "off" }, costUsd: 0, milliseconds: 0 }) };

  it("steps aside for an aside plan: its opening, the receipt kept, and no menu, reminder or request for research",
    async () => {
      for (const [asked, reviewer] of [[SOURCE.asked, reviewing], [SOURCE.asked, undefined]] as const) {
        const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf({ ...NONE, lane: "aside" }, 2)! }));
        const { call } = await tool(memory.planner, ["auth0|dev"], reviewer === undefined ? {} : {
          researchReviewer: reviewer });
        const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
          ...(asked === undefined ? {} : { later_inputs: { asked } }) });
        expect(registered.isError, words(registered)).not.toBe(true);
        const structured = registered.structuredContent as Record<string, unknown> & { research_receipt: string };
        expect(typeof structured.research_receipt).toBe("string");
        // Two texts: the step aside, and the receipt, kept in case the person asks for the research after all; then
        // only the structured content as text, which every result carries for apps that read only text.
        expect(registered.content).toEqual([
          { type: "text", text: asideGuidance({ about: REPLY.about, searches: 2 }) },
          { type: "text", text: `research_receipt: ${structured.research_receipt} Keep it only in case the person ` +
            "asks for the research after all." },
          { type: "text", text: JSON.stringify(structured) },
        ]);
        expect(structured).toEqual({
          ok: true,
          plainAnswer: { requested: true, note: true, claims: 1 },
          research_receipt: structured.research_receipt,
          next_step: asideNextStep(),
          research_plan: { source: "askrigor_planning_call", about: REPLY.about, steering_choice: "none", searches: 2,
            from_asked: asked !== undefined, lane: "aside" },
        });
        // Nothing that asks for research or for the final check.
        const text = words(registered);
        for (const absent of [FINALIZE_REMINDER, ANSWER_REVIEW_ASKED, "Plain answer registered", "Screen first:",
          "plan_research with", "steering_could_help", REPLY.tasks[0]!.task]) {
          expect(text, absent.slice(0, 40)).not.toContain(absent);
        }
        expect(text).toContain(ASIDE_OPENING);
        // The receipt is the plain answer's own: a menu sent with it later is checked against the registered target.
        const later = await call({ action: "plan_research", later_inputs: { researchMenu: {
          research_target: PLAIN.researchTarget, plain_answer_receipt: structured.research_receipt,
          steering_choice: "none", tasks: [REPLY.tasks[0]] } } });
        expect(later.structuredContent, words(later)).toMatchObject({ ok: true,
          researchMenu: { target_matches_plain_answer: true } });
      }
    });

  it("does not step aside without the person's own words: the plan is not used, and the AI plans as on any account",
    async () => {
      // The plan was made from the AI's research target alone, which cannot show what the person asked.
      const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf({ ...NONE, lane: "aside" }, 2)! }));
      const { call } = await tool(memory.planner, ["auth0|dev"], { researchReviewer: reviewing });
      const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN });
      expect(registered.isError, words(registered)).not.toBe(true);
      const structured = registered.structuredContent as Record<string, unknown>;
      expect(structured).toMatchObject({ ok: true, research_plan_not_used: "unreadable" });
      expect(structured).not.toHaveProperty("research_plan");
      expect(structured).not.toHaveProperty("planned_later_inputs");
      expect(typeof structured.research_receipt).toBe("string");
      expect(words(registered)).not.toContain(ASIDE_OPENING);
      expect(words(registered)).toContain(FINALIZE_REMINDER);
      expect(words(registered)).toContain("AskRigor's own planning call did not answer this time");
    });

  it("hands over a light plan's menu with its lane, and plan_research goes on with the light look-up", async () => {
    const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf(LIGHT_REPLY, 1)! }));
    const { call } = await tool(memory.planner, ["auth0|dev"], { researchReviewer: reviewing });
    const framing = { likely_question: "What does the trial report?" };
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { framing, asked: SOURCE.asked } });
    expect(registered.isError, words(registered)).not.toBe(true);
    const structured = registered.structuredContent as { research_receipt: string; next_step: string;
      planned_later_inputs: PlannedResearch["later_inputs"] };
    expect(structured).toMatchObject({
      research_plan: { source: "askrigor_planning_call", about: REPLY.about, steering_choice: "none", searches: 1,
        from_asked: true, lane: "light" },
      planned_later_inputs: { researchMenu: { research_target: PLAIN.researchTarget,
        plain_answer_receipt: structured.research_receipt, steering_choice: "none", lane: "light",
        tasks: researchPlanOf(LIGHT_REPLY, 1)!.tasks } },
    });
    const planned: PlannedResearch = { about: REPLY.about, searches: 1, asked: true, lane: "light",
      later_inputs: structured.planned_later_inputs };
    expect(registered.content[0]).toEqual({ type: "text", text: plannedGuidance(framing, planned) });
    expect(structured.next_step).toBe(plannedNextStep(framing, planned));
    expect(words(registered)).toContain(LIGHT_LANE_PLANNED);
    expect(structured.next_step).toContain(LIGHT_LANE_PLANNED);
    // The rest of the registration is a planned one's, the receipt and the reminder, but for the request for the
    // words at the final check: a light look-up's draft is not reviewed, so no review is promised.
    expect(words(registered)).toContain(FINALIZE_REMINDER);
    expect(words(registered)).not.toContain(ANSWER_REVIEW_ASKED);
    // Sent as it is, the balanced account's menu goes on with the light look-up.
    const go = await call({ action: "plan_research", later_inputs: structured.planned_later_inputs });
    expect(go.isError, words(go)).not.toBe(true);
    expect(go.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on", lane: "light",
      target_matches_plain_answer: true }, next_step: LIGHT_LOOKUP });
    expect(go.structuredContent).not.toHaveProperty("researchMenu.say_reading_first");
    expect(words(go)).toContain(` ${LIGHT_LOOKUP}`);
  });

  it("gives a research plan as before, with its lane in research_plan and none in the menu", async () => {
    const { call } = await tool(memoryPlanner().planner);
    const registered = await call({ action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: SOURCE.asked } });
    const structured = registered.structuredContent as { planned_later_inputs: { researchMenu: Record<string, unknown> } };
    expect(structured).toMatchObject({ research_plan: { lane: "research", steering_choice: REPLY.steering_choice } });
    expect(structured.planned_later_inputs.researchMenu).not.toHaveProperty("lane");
    expect(words(registered)).not.toContain(LIGHT_LANE_PLANNED);
    const asked = await call({ action: "plan_research", later_inputs: structured.planned_later_inputs });
    expect(asked.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
    expect(asked.structuredContent).not.toHaveProperty("researchMenu.lane");
    // A plan whose lane is not given, as a planner from before the lanes made it, is research too.
    const { lane: _lane, ...older } = researchPlanOf(REPLY, 1)!;
    const before = await tool(memoryPlanner(() => ({ status: "planned", plan: older as never })).planner);
    const registeredBefore = await before.call({ action: "register_plain_answer", plainAnswer: PLAIN });
    expect(registeredBefore.structuredContent).toMatchObject({ research_plan: { lane: "research" } });
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
        "word none nor a question; write exactly none, or the one question you would ask this person, written out " +
        "as a sentence with its question mark"]);
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
