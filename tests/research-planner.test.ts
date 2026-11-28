import { createHash } from "node:crypto";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_RESEARCH_STEERING as STORED_DEFAULT_STEERING,
  InMemoryResearchCallRecordStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import { atlasFeatureRows, loadAtlasAccountFeatures, type AtlasResearchAccount, type AtlasServerFeatures }
  from "../apps/research-mcp/src/atlas/account-features.js";
import { laterInputNames, withLaterInputs } from "../apps/research-mcp/src/later-inputs.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { waitForPendingCallRecords } from "../apps/research-mcp/src/tool-result.js";
import {
  OWNER_DAILY_CEILING_USD,
  PLANNED_OTHER_MINUTES,
  RESEARCH_PLANNER_LIMITS,
  RESEARCH_PLANNER_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_RUBRIC,
  RESEARCH_PLANNER_RUBRIC_VERSION,
  RESEARCH_PLANNER_SEARCH_RETRY,
  SEARCH_RETRY_MIN_MS,
  createResearchPlanner,
  researchPlanOf,
  researchPlannerBundle,
  type MenuHistoryEntry,
  type ResearchPlanner,
  type ResearchPlannerCall,
  type ResearchPlannerClient,
  type ResearchPlannerSource,
  type ResearchPlannerState,
} from "../apps/research-mcp/src/research-planner.js";
import { FINALIZE_REMINDER } from "../apps/research-mcp/src/research-finalization-gate.js";
import { heldFor, heldText } from "../apps/research-mcp/src/askrigor-holds.js";
import { OWNER_POINTERS } from "../apps/research-mcp/src/owner-pointers.js";
import { PLANNER_OFF_NOTHING_PAUSED, PLANNER_PAUSE_ENDED, createManageResearchAccessHandler,
  manageResearchAccessInputSchema, planBuildingLine, menuHistoryOf, personReasonOf, plannerPausedText, waitForPendingMenuChoices }
  from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { issueResearchReceipt, plainAnswerAccountBinding, verifyResearchReceipt }
  from "../apps/research-mcp/src/research-receipts.js";
import type { ResearchReviewer } from "../apps/research-mcp/src/research-reviewer.js";
import {
  GO_AHEAD_BEFORE_ASK,
  ANSWER_REVIEW_ASKED,
  ASIDE_OPENING,
  ASKED_LIMIT,
  ASKED_REQUEST,
  DEFAULT_RESEARCH_STEERING,
  LEARN_MODE_OFF,
  LEARN_MODE_ON,
  LEARN_MODE_REPLY,
  LEARN_MODE_UNAVAILABLE,
  LIGHT_LANE_PLANNED,
  LIGHT_LOOKUP,
  PLANNER_PAUSE_MAX_MINUTES,
  PLAN_TASK_KINDS,
  READING_FIRST,
  RESEARCH_LANES,
  STYLE_REPLY,
  TRADITIONAL_SYSTEM_AT_THE_SCREEN,
  OPEN_HEALTH_OPTIONS_AT_THE_SCREEN,
  WENT_ON_AS_ASKED,
  asideGuidance,
  asideNextStep,
  framingGuidance,
  framingNextStep,
  learnModeInspectSentence,
  learnModeLine,
  menuPreferenceLine,
  plannedGuidance,
  plannedNextStep,
  plannerNotUsedSentence,
  steeringChoiceUnclear,
  type PlannedResearch,
  type ResearchMenuInput,
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

/** A reply whose plan ran no web search: no search blocks, and the usage counts none. */
function unsearched(reply: unknown = REPLY): Anthropic.Beta.BetaMessage {
  const base = message({}, reply);
  return { ...base, content: base.content.slice(2),
    usage: { ...base.usage, server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 } } } as Anthropic.Beta.BetaMessage;
}

/** Whether a request is a plan's second one: the bundle and then the instruction to search first. */
const isSearchRetry = (body: Body) => body.messages.length === 2;

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
      // Learn mode's history (owner answer 303a): null without one.
      menu_history: null,
      latest_message: null,
    });
    // The key is the client's alone: it is in no part of the request.
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(call.planning).toEqual({ status: "planned", plan: {
      about: REPLY.about,
      steering_choice: REPLY.steering_choice,
      // A reply without a lane is research (owner answer 302).
      lane: "research",
      searches: 1,
      goOn: false,
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
      framing: null, menu_history: null, latest_message: null });
  });

  it("carries the latest message in the bundle, or null without one", () => {
    const latestMessage = "Keep digging on this question.";
    expect(researchPlannerBundle({ ...SOURCE, latestMessage }, "2026-11-14").latest_message).toBe(latestMessage);
    expect(researchPlannerBundle(SOURCE, "2026-11-14").latest_message).toBeNull();
  });

  it("keeps the model's go-on judgment only when the source carries a latest message", async () => {
    const reply = { ...REPLY, steering_choice: "none", lane: "research", person_said_go_on: true };
    for (const latestMessage of ["Keep digging on this question.", undefined]) {
      const made = planner({ reply: () => message({}, reply) });
      const call = await made.planner.plan({ ...SOURCE, latestMessage }, "account-a");
      expect(JSON.parse(made.bodies[0]!.messages[0]!.content as string).latest_message).toBe(latestMessage ?? null);
      expect(call.planning).toMatchObject({ status: "planned", plan: { lane: "research", steering_choice: "none",
        goOn: latestMessage !== undefined } });
    }
  });

  it("does not reuse a first-message judgment when the same words arrive as a follow-up", async () => {
    const latestMessage = "Keep digging on this question.";
    const source = { ...SOURCE, asked: `${SOURCE.asked}\n\n${latestMessage}` };
    const made = planner({ reply: (body) => message({}, { ...REPLY, steering_choice: "none", lane: "research",
      person_said_go_on: JSON.parse(body.messages[0]!.content as string).latest_message !== null }) });
    const first = await made.planner.plan(source, "account-a");
    expect(first.planning).toMatchObject({ status: "planned", plan: { goOn: false } });
    const followUp = await made.planner.plan({ ...source, latestMessage }, "account-a");
    expect(followUp.planning).toMatchObject({ status: "planned", plan: { goOn: true } });
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
    const many = Array.from({ length: 10 }, (_, index) => ({ task: `Task number ${index + 1}`, kind: "study_search",
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

  it("does not reuse a target-and-framing plan for the same words and latest message", async () => {
    const question = "Would the oil work as well as the tea?";
    const latestMessage = "Keep digging on this question.";
    const joined = `${question}\n\n${latestMessage}`;
    const made = planner({ reply: (body) => message({}, { ...REPLY, steering_choice: "none", lane: "research",
      person_said_go_on: JSON.parse(body.messages[0]!.content as string).latest_message !== null }) });
    const first = await made.planner.plan({ ...SOURCE, asked: undefined, researchTarget: joined,
      framing: { likely_question: latestMessage } }, "account-a");
    expect(first).toMatchObject({ cached: false, planning: { status: "planned", plan: { goOn: false } } });
    const followUp = await made.planner.plan({ ...SOURCE, asked: joined, latestMessage,
      researchTarget: joined }, "account-a");
    expect(made.bodies).toHaveLength(2);
    expect(JSON.parse(made.bodies[1]!.messages[0]!.content as string)).toMatchObject({ asked: joined,
      latest_message: latestMessage });
    expect(followUp).toMatchObject({ cached: false, planning: { status: "planned", plan: { goOn: true } } });
  });

  it("makes separate calls for words alone, a message list, and a target with framing", async () => {
    const latestMessage = "Keep digging on this question.";
    const joined = `${SOURCE.asked}\n\n${latestMessage}`;
    const made = planner();
    for (const source of [
      { ...SOURCE, asked: joined, researchTarget: joined },
      { ...SOURCE, asked: joined, latestMessage, researchTarget: joined },
      { ...SOURCE, asked: undefined, researchTarget: joined, framing: { likely_question: latestMessage } },
    ]) {
      expect(await made.planner.plan(source, "account-a")).toMatchObject({ cached: false,
        planning: { status: "planned" } });
    }
    expect(made.bodies).toHaveLength(3);
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

// A plan made without a web search (21 November 2026) ------------------------------------------------------------------

describe("AskRigor's own planning call: a plan made without a web search is asked for once more", () => {
  const SEARCHED = { ...REPLY, about: "The question is about seeds soaked in oil at home, as the searches show." };
  // The default reply's usage: 300 input, 600 output, 8,000 written to the cache and 15,000 read, at Opus 5.5's prices.
  const TOKENS_USD = (300 * 4 + 600 * 20 + 8_000 * 5 + 15_000 * 0.2) / 1e6;

  it("sends the same request with the instruction to search first, and uses the plan that searched", async () => {
    const made = planner({ env: { ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "1" },
      reply: (body) => isSearchRetry(body) ? message({}, SEARCHED) : unsearched() });
    const call = await made.planner.plan(SOURCE, "account-a");
    expect(made.bodies).toHaveLength(2);
    const [first, second] = made.bodies as [Body, Body];
    // The same request, with one system message after the bundle: AskRigor's instruction, nothing of the question.
    expect(second.messages).toEqual([first.messages[0], { role: "system", content: RESEARCH_PLANNER_SEARCH_RETRY }]);
    expect({ ...second, messages: undefined }).toEqual({ ...first, messages: undefined });
    expect(RESEARCH_PLANNER_SEARCH_RETRY).not.toContain(SOURCE.asked!);
    expect(call.planning).toMatchObject({ status: "planned", plan: { about: SEARCHED.about, searches: 1 } });
    // Both requests are paid for, and both are in the usage; the second's search is the plan's.
    expect(call.costUsd).toBeCloseTo(2 * TOKENS_USD + 0.01, 10);
    expect(call.usage).toEqual({ input: 600, output: 1_200, cacheWrite: 16_000, cacheRead: 30_000, searches: 1 });
    expect(made.logs).toEqual(["no_search", "search_retry_searched"]);
    // The hour keeps the plan that searched, and the account's day counted the registration once.
    expect(await made.planner.plan(SOURCE, "account-a")).toMatchObject({ cached: true,
      planning: { plan: { about: SEARCHED.about } } });
    expect((await made.planner.plan({ ...SOURCE, asked: "and by mouth?" }, "account-a")).planning)
      .toEqual({ status: "skipped", reason: "account_limit" });
    expect(made.bodies).toHaveLength(2);
  });

  it("sends one request for a plan that searched, as before", async () => {
    const made = planner();
    expect((await made.planner.plan(SOURCE, "account-a")).planning).toMatchObject({ status: "planned",
      plan: { searches: 1 } });
    expect(made.bodies).toHaveLength(1);
    expect(made.logs).toEqual([]);
  });

  it("asks again for a light or an aside plan made without a search too", async () => {
    for (const reply of [{ ...REPLY, steering_choice: "none", lane: "light", tasks: [REPLY.tasks[0]] },
      { ...REPLY, steering_choice: "none", lane: "aside", tasks: [] }]) {
      const made = planner({ reply: (body) => isSearchRetry(body) ? message({}, reply) : unsearched(reply) });
      expect((await made.planner.plan(SOURCE, "account-a")).planning).toMatchObject({ status: "planned",
        plan: { lane: reply.lane, searches: 1 } });
      expect(made.bodies).toHaveLength(2);
    }
  });

  it("keeps the first plan when the second request searched nothing either or failed, with what both cost", async () => {
    for (const [second, log, extraUsd] of [
      [() => unsearched(SEARCHED), "search_retry_no_search", TOKENS_USD],
      [() => { throw new Anthropic.APIError(529, undefined, "overloaded", new Headers()); }, "search_retry_error", 0],
      // A failure with no answer from the API may have run, so it keeps what was held for it.
      [() => { throw new Error("connection lost"); }, "search_retry_error", 0.12],
      [() => message({ stop_reason: "refusal", content: [] }), "search_retry_refusal", TOKENS_USD + 0.01],
      [() => message({}, "not json"), "search_retry_unreadable", TOKENS_USD + 0.01],
    ] as const) {
      const made = planner({ reply: (body) => isSearchRetry(body) ? second() : unsearched() });
      const call = await made.planner.plan(SOURCE, "account-a");
      expect(call.planning, log).toMatchObject({ status: "planned", plan: { about: REPLY.about, searches: 0 } });
      expect(call.costUsd, log).toBeCloseTo(TOKENS_USD + extraUsd, 10);
      expect(made.logs, log).toEqual(["no_search", log]);
      expect(made.bodies, log).toHaveLength(2);
    }
  });

  it("logs the category of the second request's refusal as the first request's is logged", async () => {
    const made = planner({ reply: (body) => isSearchRetry(body) ? message({ stop_reason: "refusal", content: [],
      stop_details: { type: "refusal", category: "bio", explanation: "An explanation that is not logged." } })
      : unsearched() });
    expect((await made.planner.plan(SOURCE, "account-a")).planning).toMatchObject({ status: "planned",
      plan: { about: REPLY.about } });
    expect(made.logs).toEqual(["no_search", "search_retry_refusal_category_bio", "search_retry_refusal"]);
  });

  it("gives the second request only the call's time that is left, and keeps the first plan when it runs out", async () => {
    vi.useFakeTimers();
    try {
      // The client the planner builds, keeping each request's options and signal: the first request takes 10 seconds
      // and plans with no search; the second never answers until the test lets it, after the call's time ran out.
      const sent: Array<{ body: Body; timeout: number | undefined; signal: AbortSignal | undefined }> = [];
      let lateAnswer: ((message: Anthropic.Beta.BetaMessage) => void) | undefined;
      const logs: string[] = [];
      const made = createResearchPlanner({
        env: ENV as NodeJS.ProcessEnv, readFile: () => `${KEY}\n`, log: (line) => logs.push(line),
        client: () => ({ beta: { messages: { create: async (body, options) => {
          sent.push({ body, timeout: options?.timeout, signal: options?.signal });
          if (!isSearchRetry(body)) {
            await new Promise((resolve) => { setTimeout(resolve, 10_000); });
            return unsearched();
          }
          return await new Promise<Anthropic.Beta.BetaMessage>((resolve) => { lateAnswer = resolve; });
        } } } }),
      });
      const pending = made.plan(SOURCE, "account-a");
      await vi.advanceTimersByTimeAsync(10_000);
      // The first reply's settling and the second request are promise steps, with no timer between them.
      for (let step = 0; step < 50 && sent.length < 2; step += 1) await Promise.resolve();
      // The second request has what is left of the call's 45 seconds, not 45 more.
      expect(sent.map(({ timeout }) => timeout)).toEqual([45_000, 35_000]);
      await vi.advanceTimersByTimeAsync(34_999);
      expect(sent[1]!.signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const call = await pending;
      // It ended with the call's time: aborted, and the first plan stands.
      expect(sent[1]!.signal?.aborted).toBe(true);
      expect(call.milliseconds).toBe(45_000);
      expect(call.planning).toMatchObject({ status: "planned", plan: { about: REPLY.about, searches: 0 } });
      // It may have run, so it keeps what was held for it.
      expect(call.costUsd).toBeCloseTo(TOKENS_USD + 0.12, 10);
      expect(logs).toEqual(["no_search", "search_retry_timeout"]);
      // A reply that comes after the call's time changes nothing: the hour keeps the first plan.
      lateAnswer!(message({}, SEARCHED));
      await vi.advanceTimersByTimeAsync(0);
      expect(await made.plan(SOURCE, "account-a")).toMatchObject({ cached: true,
        planning: { plan: { about: REPLY.about, searches: 0 } } });
      expect(sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not send a second request when saving its hold leaves it less than its least time, and gives the hold back",
    async () => {
      // Every write of the state file takes 9 seconds: the second request's hold is saved 27 seconds into the call's 45,
      // which leaves it 18, less than SEARCH_RETRY_MIN_MS.
      let at = Date.parse("2026-11-21T10:00:00Z");
      const writes: string[] = [];
      const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_STATE_FILE: "/run/planner/state.json" },
        readFile: (path) => { if (path.endsWith("state.json")) throw new Error("none yet"); return `${KEY}\n`; },
        writeFile: (_path, text) => { writes.push(text); at += 9_000; }, reply: () => unsearched() });
      const call = await made.planner.plan(SOURCE, "account-a");
      expect(call.planning).toMatchObject({ status: "planned", plan: { searches: 0 } });
      expect(made.bodies).toHaveLength(1);
      expect(made.logs).toEqual(["no_search", "search_retry_skipped"]);
      // What was held for the request that was not sent is given back: the day keeps the first request's cost only.
      expect(JSON.parse(writes.at(-1)!).spent_usd).toBeCloseTo(TOKENS_USD, 10);
      expect(call.costUsd).toBeCloseTo(TOKENS_USD, 10);
    });

  it("does not ask again without the time or the day's cap for a second request", async () => {
    // The first request took all but 15 seconds of the call's 45.
    let at = Date.parse("2026-11-21T10:00:00Z");
    const slow = planner({ now: () => at, reply: () => { at += 30_000; return unsearched(); } });
    expect((await slow.planner.plan(SOURCE, "account-a")).planning).toMatchObject({ status: "planned",
      plan: { searches: 0 } });
    expect(45_000 - 30_000).toBeLessThan(SEARCH_RETRY_MIN_MS);
    expect(slow.bodies).toHaveLength(1);
    expect(slow.logs).toEqual(["no_search", "search_retry_skipped"]);
    // The day's cap has room for the first request's hold but not, after it, for a second one.
    const capped = planner({ env: { ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD: "0.13" }, reply: () => unsearched() });
    expect((await capped.planner.plan(SOURCE, "account-a")).planning).toMatchObject({ status: "planned",
      plan: { searches: 0 } });
    expect(capped.bodies).toHaveLength(1);
    expect(capped.logs).toEqual(["no_search", "search_retry_skipped"]);
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
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.required).toEqual(["about", "steering_choice", "lane", "tasks",
      "person_said_go_on"]);
    // The lane is written before the tasks, whose number it decides.
    expect(Object.keys(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties)).toEqual(["about", "steering_choice", "lane", "tasks",
      "person_said_go_on"]);
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.person_said_go_on.type).toBe("boolean");
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.lane).toEqual({ type: "string", enum: ["research", "light", "aside"],
      description: "research, light (one fact one named source states, to be opened and quoted) or aside (a plain " +
        "look-up AskRigor adds nothing to)." });
    expect(RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.lane.enum).toEqual([...RESEARCH_LANES]);
  });

  it("keeps aside only with the word none, and an aside plan has no tasks, whatever the reply listed", () => {
    // The reply listed three tasks: the plan has none.
    expect(researchPlanOf({ ...NONE, lane: "aside" }, 1)).toEqual({ about: REPLY.about, steering_choice: "none",
      tasks: [], lane: "aside", searches: 1, goOn: false });
    // With no tasks listed, and with the word as the model cased it.
    expect(researchPlanOf({ ...REPLY, steering_choice: " None. ", lane: "aside", tasks: [] }, 0)).toEqual({
      about: REPLY.about, steering_choice: "none", tasks: [], lane: "aside", searches: 0, goOn: false });
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
    expect(light).toEqual({ about: REPLY.about, steering_choice: "none", lane: "light", searches: 1, goOn: false,
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

  it("keeps goOn only for a follow-up research plan with none and the model's true judgment", () => {
    const reply = { ...NONE, lane: "research", person_said_go_on: true };
    expect(researchPlanOf(reply, 0, KEY, true)).toMatchObject({ lane: "research", steering_choice: "none", goOn: true });
    expect(researchPlanOf({ ...reply, steering_choice: " None. " }, 0, KEY, true)?.goOn).toBe(true);
    for (const [what, given, followUp] of [
      ["not a follow-up", reply, false],
      ["a named question", { ...reply, steering_choice: REPLY.steering_choice }, true],
      ["a light plan", { ...reply, lane: "light", tasks: ONE_TASK }, true],
      ["an aside plan", { ...reply, lane: "aside" }, true],
      ["no judgment", { ...NONE, lane: "research" }, true],
      ["a false judgment", { ...reply, person_said_go_on: false }, true],
    ] as const) {
      const plan = researchPlanOf(given, 0, KEY, followUp);
      expect(plan, what).toBeDefined();
      expect(plan!.goOn, what).toBe(false);
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
    at += 1_000;
    reply = REPLY;
    expect((await made.planner.plan({ ...SOURCE, asked: `${SOURCE.asked}\n\nresearch it fully` }, accountKey)).planning)
      .toMatchObject({ status: "planned", plan: { lane: "research" } });
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBe("research");
    // With the target, the newer registration wins; words alone still name their own plan within the hour.
    expect(await made.planner.lane(SOURCE.asked, accountKey, SOURCE.researchTarget)).toBe("research");
    expect(await made.planner.lane(SOURCE.asked, accountKey, undefined)).toBe("light");
    // A call that was not a plan leaves the target's lane as it was.
    reply = "not a plan";
    expect((await made.planner.plan({ ...SOURCE, asked: "other words" }, accountKey)).planning.status).toBe("skipped");
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBe("research");
    // After the hour, no lane.
    at += 61 * 60 * 1_000;
    expect(await made.planner.lane(undefined, accountKey, SOURCE.researchTarget)).toBeUndefined();
    expect(await made.planner.lane(SOURCE.asked, accountKey, SOURCE.researchTarget)).toBeUndefined();
  });

  it("uses the newer target lane when identical joined words are registered as a list", async () => {
    const latestMessage = "Research this question fully.";
    const joined = `${SOURCE.asked}\n\n${latestMessage}`;
    const researchTarget = "T";
    for (const [firstReply, firstLane, laterReply, laterLane] of [
      [REPLY, "research", LIGHT_REPLY, "light"],
      [LIGHT_REPLY, "light", REPLY, "research"],
    ] as const) {
      let at = Date.parse("2026-11-14T10:00:00Z");
      let reply: unknown = firstReply;
      const made = planner({ now: () => at, reply: () => message({}, reply) });
      const source = { ...SOURCE, asked: joined, researchTarget };
      expect(await made.planner.plan(source, "account-a")).toMatchObject({ cached: false,
        planning: { status: "planned", plan: { lane: firstLane } } });
      expect(await made.planner.lane(joined, "account-a", researchTarget)).toBe(firstLane);
      expect(await made.planner.lane(joined, "account-a", undefined)).toBe(firstLane);
      at += 1_000;
      reply = laterReply;
      expect(await made.planner.plan({ ...source, latestMessage }, "account-a")).toMatchObject({ cached: false,
        planning: { status: "planned", plan: { lane: laterLane } } });
      expect(made.bodies).toHaveLength(2);
      expect(await made.planner.lane(joined, "account-a", researchTarget)).toBe(laterLane);
      expect(await made.planner.lane(joined, "account-a", undefined)).toBe(firstLane);
    }
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
  const options: RegisterToolsOptions = { researchAccessRequired: true, mcpSurface: "/mcp",
    researchContributorAccessService: service, ...(researchPlanner === undefined ? {} : { researchPlanner }), ...extra };
  const newHandler = () => {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === "manage_research_access") handler = execute;
      },
    } as unknown as McpServer, options);
    return async (input: Record<string, unknown>, subject = "auth0|dev"): Promise<Result> =>
      await handler!(input, { authInfo: { token: "synthetic-token", clientId: "synthetic-client",
        scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } }) as Result;
  };
  return { call: newHandler(), service, newHandler };
}

describe("traditional accounts in registration's structured next step (owner answer 402a)", () => {
  const cases = (["guided", "balanced", "autonomous"] as const).flatMap((style) => [
    { style, questions: "without redirecting questions", redirecting_questions: [] },
    { style, questions: "with redirecting questions", redirecting_questions: ["Which preparation do you mean?"] },
  ]);

  it.each(cases)("carries the exact approved sentence for $style $questions, after any ask-first stop", async ({
    style, redirecting_questions,
  }) => {
    for (const mcpSurface of ["/mcp", "/mcp/claude"] as const) {
      const { call, service } = await tool(undefined, [], { mcpSurface });
      await service.setResearchSteering("auth0|person", { style });
      const result = await call({ action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: {
        framing: { likely_question: PLAIN.researchTarget, redirecting_questions },
      } }, "auth0|person");
      expect(result.isError, mcpSurface).not.toBe(true);
      expect(result.structuredContent, mcpSurface).toMatchObject({ ok: true, research_receipt: expect.any(String) });
      const { next_step } = result.structuredContent as { next_step: string };
      expect(next_step, mcpSurface).toContain(TRADITIONAL_SYSTEM_AT_THE_SCREEN);
      expect(next_step, mcpSurface).toContain(`${TRADITIONAL_SYSTEM_AT_THE_SCREEN} ${OPEN_HEALTH_OPTIONS_AT_THE_SCREEN}`);
      if (style !== "autonomous" && redirecting_questions.length > 0) {
        const stop = "Ask the person your framing's redirecting_questions now and end your turn: no research call " +
          "until they answer.";
        expect(next_step.startsWith(stop), mcpSurface).toBe(true);
        expect(next_step.indexOf(TRADITIONAL_SYSTEM_AT_THE_SCREEN), mcpSurface).toBeGreaterThan(stop.length);
      } else if (style === "guided") {
        const stop = "Confirm the question you will research in one line, ask for the person's yes and end your " +
          "turn; after their yes, ";
        expect(next_step.startsWith(stop), mcpSurface).toBe(true);
        expect(next_step.indexOf(TRADITIONAL_SYSTEM_AT_THE_SCREEN), mcpSurface).toBeGreaterThan(stop.length);
      }
      expect(next_step, mcpSurface).toContain((style === "guided" ||
        (style === "balanced" && redirecting_questions.length > 0)
        ? "screen and call action plan_research. "
        : "its result says whether to ask the person first. ") + TRADITIONAL_SYSTEM_AT_THE_SCREEN + " " + OPEN_HEALTH_OPTIONS_AT_THE_SCREEN);
    }
  });
});

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

const receiptOf = (registered: Result): string => registered.structuredContent!.research_receipt as string;
const getPlan = (receipt: string) => ({ action: "get_research_plan", later_inputs: { plain_answer_receipt: receipt } });

async function registerAndReadPlan(call: (input: Record<string, unknown>, subject?: string) => Promise<Result>,
  input: Record<string, unknown>, subject?: string): Promise<Result> {
  const registered = await call(input, subject);
  expect(registered.isError, words(registered)).not.toBe(true);
  return await call(getPlan(receiptOf(registered)), subject);
}

describe("background research planning (owner answer 435a)", () => {
  const registration = { action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { asked: SOURCE.asked } };
  const plannerDeadline = 125_000;
  const planned = (about = REPLY.about): ResearchPlannerCall => ({
    planning: { status: "planned", plan: researchPlanOf({ ...REPLY, about }, 1)! },
    cached: false, costUsd: 0, milliseconds: 0,
  });

  afterEach(() => vi.useRealTimers());

  it("returns the receipt immediately and hands back a ready plan with its original receipt", async () => {
    vi.useFakeTimers();
    const completion = Promise.withResolvers<ResearchPlannerCall>();
    const plan = vi.fn(() => completion.promise);
    const store = new InMemoryResearchCallRecordStore();
    const { call, service, newHandler } = await tool({ enabled: true, plan }, ["auth0|dev"], { researchCallRecord: store });
    const registeredAt = new Date();
    const pending = await call(registration);
    expect(plan).toHaveBeenCalledTimes(1);
    const receipt = receiptOf(pending);
    expect(pending.structuredContent).toMatchObject({ ok: true, research_receipt: expect.any(String),
      plainAnswer: { requested: true, claims: 1 }, next_step: expect.stringContaining("Load the protocol sections you " +
        "need now, but do not screen or write a menu of your own yet. Then, in this same turn and before asking the " +
        "person anything, call manage_research_access with action get_research_plan and " +
        "later_inputs.plain_answer_receipt set to this result's research_receipt: it waits for the plan and returns " +
        "your next step.") });
    expect(pending.structuredContent!.next_step).toMatch(/^AskRigor is building the research plan\. If the question is/u);
    expect(pending.content[0]).toEqual({ type: "text", text: pending.structuredContent!.next_step });
    expect(pending.structuredContent).not.toHaveProperty("research_plan");
    expect(pending.structuredContent).not.toHaveProperty("menu_outline");
    await vi.advanceTimersByTimeAsync(5_000);
    completion.resolve(planned());
    await vi.advanceTimersByTimeAsync(0);
    const ready = await newHandler()(getPlan(receipt));
    expect(ready.structuredContent).toMatchObject({ ok: true, research_receipt: receipt,
      research_plan: { about: REPLY.about, lane: "research" },
      planned_later_inputs: { researchMenu: { plain_answer_receipt: receipt, research_target: PLAIN.researchTarget } } });
    expect(plan).toHaveBeenCalledTimes(1);
    await waitForPendingCallRecords(store);
    const rows = await store.list(service.accountKeyForSubject("auth0|dev"), new Date());
    expect(rows).toHaveLength(2);
    expect(rows.find(({ action }) => action === "register_plain_answer")).toMatchObject({
      outcome: "answered", receivedAt: registeredAt, planLane: "research" });
    const retrieval = rows.find(({ action }) => action === "get_research_plan");
    expect(retrieval).toMatchObject({ outcome: "answered" });
    expect(retrieval).not.toHaveProperty("planLane");
    await vi.advanceTimersByTimeAsync(plannerDeadline - 5_000);
    expect((await call(getPlan(receipt))).structuredContent).not.toHaveProperty("research_plan");
  });

  it.each(["get_research_plan", "plan_research"])("waits for a running plan through %s", async (action) => {
    vi.useFakeTimers();
    const completion = Promise.withResolvers<ResearchPlannerCall>();
    const { call } = await tool({ enabled: true, plan: () => completion.promise });
    const receipt = receiptOf(await call(registration));
    const finished = vi.fn();
    const reading = call({ action, later_inputs: { plain_answer_receipt: receipt } }).then((result) => {
      finished();
      return result;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(finished).not.toHaveBeenCalled();
    completion.resolve(planned());
    const result = await reading;
    expect(result.structuredContent).toMatchObject(action === "plan_research"
      ? { ok: true, researchMenu: { next: "ask", target_matches_plain_answer: true, steering_choice: REPLY.steering_choice } }
      : { ok: true, research_receipt: receipt, research_plan: { about: REPLY.about } });
  });

  it("uses the registration's deadline for every waiter and releases the handoff", async () => {
    vi.useFakeTimers();
    const completion = Promise.withResolvers<ResearchPlannerCall>();
    const plan = vi.fn(() => completion.promise);
    const { call } = await tool({ enabled: true, plan });
    const receipt = receiptOf(await call(registration));
    await vi.advanceTimersByTimeAsync(plannerDeadline - 2);
    const finished = vi.fn();
    const reading = call(getPlan(receipt)).then((result) => { finished(); return result; });
    const using = call({ action: "plan_research", later_inputs: { plain_answer_receipt: receipt } });
    await vi.advanceTimersByTimeAsync(1);
    expect(finished).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const fallback = await reading;
    expect(await using).toEqual(fallback);
    expect(fallback.structuredContent).toMatchObject({ ok: true, research_receipt: receipt, research_plan_not_used: "error",
      menu_outline: { researchMenu: { plain_answer_receipt: receipt, research_target: PLAIN.researchTarget } } });
    expect(words(fallback)).toContain(plannerNotUsedSentence("error", undefined));
    completion.resolve(planned());
    expect((await call(getPlan(receipt))).structuredContent).toMatchObject({ ok: true, research_receipt: receipt,
      menu_outline: { researchMenu: { plain_answer_receipt: receipt } } });
    expect((await call(getPlan(receipt))).structuredContent).not.toHaveProperty("research_plan");
    expect(plan).toHaveBeenCalledTimes(1);
  });

  it("does not start the planner if learn-mode history arrives after the deadline", async () => {
    vi.useFakeTimers();
    const history = Promise.withResolvers<[]>();
    const plan = vi.fn(async () => planned());
    const { call, service } = await tool({ enabled: true, plan });
    await service.setResearchSteering("auth0|dev", { learnMenuChoices: true });
    const read = vi.spyOn(service, "menuChoices").mockReturnValueOnce(history.promise);
    const receipt = receiptOf(await call(registration));
    expect(read).toHaveBeenCalledTimes(1);
    expect(plan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(plannerDeadline);
    history.resolve([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(plan).not.toHaveBeenCalled();
    expect((await call(getPlan(receipt))).structuredContent).toHaveProperty("menu_outline");
  });

  it("isolates two registrations by one account, denies a different account, and falls back after a restart", async () => {
    vi.useFakeTimers();
    const first = Promise.withResolvers<ResearchPlannerCall>();
    const second = Promise.withResolvers<ResearchPlannerCall>();
    const plan = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const subjects = ["auth0|dev", "auth0|person"];
    const { call } = await tool({ enabled: true, plan }, subjects);
    // Identical input, and the same clock time, still gives separate registrations.
    const early = receiptOf(await call(registration));
    const late = receiptOf(await call(registration));
    expect(early).not.toBe(late);
    second.resolve(planned("The second registration's reading."));
    const latest = await call(getPlan(late));
    expect(latest.structuredContent).toMatchObject({ research_receipt: late,
      research_plan: { about: "The second registration's reading." } });
    const foreign = await call(getPlan(late), "auth0|person");
    expect(foreign.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    first.resolve(planned());
    expect((await call(getPlan(early))).structuredContent).toMatchObject({ research_receipt: early,
      research_plan: { about: REPLY.about } });
    const restarted = await tool({ enabled: true, plan }, subjects);
    const fallback = await restarted.call(getPlan(late));
    expect(fallback.structuredContent).toMatchObject({ ok: true, research_receipt: late,
      menu_outline: { researchMenu: { plain_answer_receipt: late } } });
    expect(fallback.structuredContent).not.toHaveProperty("research_plan");
    expect(plan).toHaveBeenCalledTimes(2);
  });

  it("leaves an account without the planner as it was, a plan_research call with a receipt alone too", async () => {
    const plan = vi.fn(async () => planned());
    const { call } = await tool({ enabled: true, plan }, ["auth0|dev"]);
    const registered = await call(registration, "auth0|person");
    expect(plan).not.toHaveBeenCalled();
    expect(registered.structuredContent).toHaveProperty("menu_outline");
    expect(words(registered)).not.toContain("get_research_plan");
    // The usual reader's refusal, with the receipt in its example: what this call got before owner answer 435a.
    const receipt = receiptOf(registered);
    const alone = await call({ action: "plan_research", later_inputs: { plain_answer_receipt: receipt } }, "auth0|person");
    expect(alone.isError).toBe(true);
    expect(alone.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" },
      corrected_later_inputs: { researchMenu: { plain_answer_receipt: receipt } } });
    expect(words(alone)).not.toContain("AskRigor's research plan is unavailable");
  });
});

// Owner answer 399b (21 Nov 2026): a balanced first menu goes on whatever its length, so the mark no longer makes
// the difference there: with it, without it or with a mark that is not AskRigor's, the menu goes on;
// guided research still asks. The mark itself is still made and checked as before; its signing and checking are tested
// in tests/research-steering.test.ts (goOnMark). Here only the outcome is, which no longer depends on it.
describe("the planning call's signed go-on menu (owner answer 304a)", () => {
  const latest = "Keep digging on the same question.";
  const asked = [SOURCE.asked!, latest];
  const plan = () => researchPlanOf({ ...NONE, lane: "research", person_said_go_on: true, tasks: [
    { task: "Read the oil study in full", kind: "full_text", could_change: "conclusion", sources: 1 },
    REPLY.tasks[0]!,
    { task: "Search trials comparing the oil with the tea", kind: "study_search", could_change: "confidence", sources: 1 },
  ] }, 1, KEY, true)!;
  type Registered = { research_receipt: string; research_plan: { person_said_go_on?: true };
    planned_later_inputs: { researchMenu: ResearchMenuInput } };

  async function session() {
    const memory = memoryPlanner(() => ({ status: "planned", plan: plan() }));
    const made = await tool(memory.planner);
    await made.service.setResearchSteering("auth0|dev", { style: "balanced" });
    const registered = await registerAndReadPlan(made.call, { action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { asked } });
    expect(registered.isError, words(registered)).not.toBe(true);
    return { ...made, memory, registered, data: registered.structuredContent as Registered };
  }

  it("marks a dev account's follow-up menu and passes the latest message to the planner", async () => {
    const { memory, data } = await session();
    expect(memory.seen).toHaveLength(1);
    expect(memory.seen[0]!.source).toMatchObject({ asked: asked.join("\n\n"), latestMessage: latest });
    expect(data.planned_later_inputs.researchMenu.go_on_asked).toMatch(/^go1~/u);
    expect(data.research_plan.person_said_go_on).toBe(true);
  });

  it("does not mark a single text even when the fake planner says goOn", async () => {
    const memory = memoryPlanner(() => ({ status: "planned", plan: plan() }));
    const { call } = await tool(memory.planner);
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: asked.join("\n\n") } });
    expect(registered.isError, words(registered)).not.toBe(true);
    const data = registered.structuredContent as Registered;
    expect(memory.seen[0]!.source).not.toHaveProperty("latestMessage");
    expect(data.planned_later_inputs.researchMenu).not.toHaveProperty("go_on_asked");
    expect(data.research_plan).not.toHaveProperty("person_said_go_on");
  });

  it("does not mark a follow-up without menuDigestSecret", async () => {
    const memory = memoryPlanner(() => ({ status: "planned", plan: plan() }));
    const { service } = await tool(memory.planner);
    // The plain answer can still be signed; only the menu-signing option is absent.
    const handler = createManageResearchAccessHandler({ service, researchPlanner: () => memory.planner,
      devAccountKeys: () => new Set([researchAccountReference(service.accountKeyForSubject("auth0|dev"))]),
      plainAnswer: { sign: (claims) => issueResearchReceipt("plain_answer", claims, { secret: SECRET }) } });
    const { execute: call } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
    const extra = { authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: "auth0|dev" } } };
    const registered = await registerAndReadPlan((input) => call(input, extra),
      { action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { asked } });
    expect(registered.isError, words(registered)).not.toBe(true);
    const data = registered.structuredContent as Registered;
    expect(data.research_receipt).toEqual(expect.any(String));
    expect(memory.seen[0]!.source.latestMessage).toBe(latest);
    expect(data.planned_later_inputs.researchMenu).not.toHaveProperty("go_on_asked");
    expect(data.research_plan).not.toHaveProperty("person_said_go_on");
  });

  it("goes on with the handed-over long balanced menu and explains why, now as any first menu does", async () => {
    const { call, data } = await session();
    const result = await call({ action: "plan_research", later_inputs: data.planned_later_inputs });
    expect(result.isError, words(result)).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
      target_matches_plain_answer: true } });
    const menu = result.structuredContent!.researchMenu as { recommended_minutes: number[] };
    expect(menu.recommended_minutes[1]).toBeGreaterThan(10);
    expect(words(result)).not.toContain(WENT_ON_AS_ASKED);
    expect(words(result)).toContain("I didn't wait for your answer before starting.");
  });

  it("goes on, as any balanced first menu, when a signed menu's task text, minutes, sources or same-kind task is changed", async () => {
    const { call, data } = await session();
    const menu = data.planned_later_inputs.researchMenu;
    const first = menu.tasks[0]!;
    for (const [what, task] of [
      ["changed wording", { ...first, task: "Read the oil study's reported results in full" }],
      ["changed minutes", { ...first, minutes: [40, 90] }],
      ["changed sources", { ...first, sources: 3 }],
      ["another task of the same kind and could_change", { task: "Read a study of a different seed oil",
        kind: first.kind, could_change: first.could_change, sources: first.sources }],
    ] as const) {
      const changed = { ...menu, tasks: [task, ...menu.tasks.slice(1)] };
      expect(changed.go_on_asked, what).toBe(menu.go_on_asked);
      const result = await call({ action: "plan_research", later_inputs: { researchMenu: changed } });
      expect(result.isError, `${what}: ${words(result)}`).not.toBe(true);
      expect(result.structuredContent, what).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        target_matches_plain_answer: true } });
      expect(result.structuredContent!.researchMenu, what).not.toHaveProperty("went_on_as_asked");
    }
  });

  it.each(["account removed", "planner disabled", "planner absent"] as const)(
    "goes on, as any balanced first menu, for the same signed menu with the %s", async (what) => {
      const { call, service, memory, data } = await session();
      const input = { action: "plan_research", later_inputs: data.planned_later_inputs };
      const original = await call(input);
      expect(original.isError, words(original)).not.toBe(true);
      expect(original.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        target_matches_plain_answer: true } });
      const handler = createManageResearchAccessHandler({ service, menuDigestSecret: () => SECRET,
        devAccountKeys: () => new Set(what === "account removed" ? []
          : [researchAccountReference(service.accountKeyForSubject("auth0|dev"))]),
        ...(what === "planner absent" ? {} : { researchPlanner: () =>
          what === "planner disabled" ? { ...memory.planner, enabled: false } : memory.planner }),
        plainAnswer: {
          sign: (claims, accountKey) => issueResearchReceipt("plain_answer", { ...claims,
            acct: plainAnswerAccountBinding(SECRET, accountKey) }, { secret: SECRET }),
          read: (receipt, accountKey) => {
            const verified = verifyResearchReceipt(receipt, { secret: SECRET });
            if (!verified.ok || verified.kind !== "plain_answer") return undefined;
            const { acct, target } = verified.claims;
            return acct === plainAnswerAccountBinding(SECRET, accountKey) && typeof target === "string"
              ? { target, issuedAt: verified.issued_at } : undefined;
          },
        },
      });
      const { execute } = withLaterInputs("manage_research_access", manageResearchAccessInputSchema, handler);
      const result = await execute(input, { authInfo: { token: "synthetic-token", clientId: "synthetic-client",
        scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: "auth0|dev" } } });
      expect(result.isError, words(result)).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        target_matches_plain_answer: true } });
      expect(result.structuredContent!.researchMenu).not.toHaveProperty("went_on_as_asked");
    });

  it("keeps a signed mark through a refused menu and goes on when its correction is returned unchanged", async () => {
    const { call, data } = await session();
    const menu = data.planned_later_inputs.researchMenu;
    const refused = await call({ action: "plan_research", later_inputs: { researchMenu: { ...menu,
      provisional_answer: 7 } } });
    expect(refused.isError, words(refused)).toBe(true);
    expect(refused.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    const corrected = refused.structuredContent!.corrected_later_inputs as { researchMenu: ResearchMenuInput };
    expect(corrected.researchMenu.go_on_asked).toBe(menu.go_on_asked);
    expect(corrected.researchMenu).not.toHaveProperty("provisional_answer");
    const again = await call({ action: "plan_research", later_inputs: corrected });
    expect(again.isError, words(again)).not.toBe(true);
    expect(again.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on",
      target_matches_plain_answer: true } });
  });

  it("leaves a numeric or overlong mark out of a refused menu's correction", async () => {
    const { call, data } = await session();
    for (const go_on_asked of [7, "x".repeat(201)]) {
      const refused = await call({ action: "plan_research", later_inputs: { researchMenu: {
        ...data.planned_later_inputs.researchMenu, provisional_answer: 7, go_on_asked } } });
      expect(refused.isError, words(refused)).toBe(true);
      expect(refused.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
      const corrected = refused.structuredContent!.corrected_later_inputs as { researchMenu: ResearchMenuInput };
      expect(corrected.researchMenu).not.toHaveProperty("go_on_asked");
    }
  });

  it("goes on for a tampered or copied mark, another receipt or arbitrary text, and guided research asks", async () => {
    const { call, service, data } = await session();
    const menu = data.planned_later_inputs.researchMenu;
    const mark = menu.go_on_asked!;
    const other = await call({ action: "register_plain_answer", plainAnswer: { ...PLAIN,
      text: "The oil may differ from the tea.", claims: ["The oil may differ from the tea."] }, later_inputs: { asked } });
    expect(other.isError, words(other)).not.toBe(true);
    const receipt = (other.structuredContent as Registered).research_receipt;
    expect(receipt).not.toBe(data.research_receipt);
    for (const [what, changed] of [
      ["the last character changed", { ...menu, go_on_asked: mark.slice(0, -1) + (mark.endsWith("A") ? "B" : "A") }],
      ["another task kind", { ...menu, tasks: [{ ...menu.tasks[0]!, kind: "method_audit" }, ...menu.tasks.slice(1)] }],
      ["another registration's receipt", { ...menu, plain_answer_receipt: receipt }],
      ["arbitrary text", { ...menu, go_on_asked: "true" }],
    ] as const) {
      const result = await call({ action: "plan_research", later_inputs: { researchMenu: changed } });
      expect(result.isError, what).not.toBe(true);
      expect(result.structuredContent, what).toMatchObject({ ok: true, researchMenu: { next: "go_on",
        target_matches_plain_answer: true } });
      expect(result.structuredContent!.researchMenu, what).not.toHaveProperty("went_on_as_asked");
      expect(words(result), what).not.toContain(WENT_ON_AS_ASKED);
    }
    await service.setResearchSteering("auth0|dev", { style: "guided" });
    const guided = await call({ action: "plan_research", later_inputs: data.planned_later_inputs });
    expect(guided.isError, words(guided)).not.toBe(true);
    expect(guided.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask", style: "guided" } });
    expect(guided.structuredContent!.researchMenu).not.toHaveProperty("went_on_as_asked");
    expect(words(guided)).not.toContain(WENT_ON_AS_ASKED);
  });

  // As for person_reason: a value in the mark's place that is not the mark must never refuse a menu.
  it("never refuses a menu for what stands in the mark's place: any value that is not the mark goes on as any first menu", async () => {
    const { call, data } = await session();
    const menu = data.planned_later_inputs.researchMenu;
    for (const value of ["x".repeat(201), "x".repeat(5_000), 7, true, null, { mark: menu.go_on_asked }, [menu.go_on_asked]]) {
      const asking = await call({ action: "plan_research", later_inputs: { researchMenu: { ...menu,
        go_on_asked: value } } });
      expect(asking.isError, `${JSON.stringify(value).slice(0, 40)}: ${words(asking)}`).not.toBe(true);
      expect(asking.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      expect(asking.structuredContent!.researchMenu).not.toHaveProperty("went_on_as_asked");
      expect(words(asking)).not.toContain(WENT_ON_AS_ASKED);
    }
  });
});

describe("AskRigor's own planning call (owner answer 298b): the registration", () => {
  it("asks a dev account for the person's own words at inspect, while the planner is on", async () => {
    const on = await tool(memoryPlanner().planner);
    const inspected = await on.call({ action: "inspect" });
    expect(words(inspected)).toContain(` ${ASKED_REQUEST} `);
    expect(inspected.structuredContent).toMatchObject({ ok: true, next_step: `${ASKED_REQUEST} ${planBuildingLine(true)}` });
    expect(ASKED_REQUEST).toContain("later_inputs.asked: the person's own words about this question, word for word");
    expect(ASKED_REQUEST).toContain("keeps none of them");
    // Round 8 (13 Nov 2026): one chat added a reply it remembered from an earlier conversation, labelled as an
    // earlier clarification, and the plan then rested on words the person had not written in that chat.
    expect(ASKED_REQUEST).toContain("Give only what they wrote in this conversation: nothing from memory or from " +
      "earlier conversations, and no note or explanation of yours.");
    // Any other account, and a dev account while the planner is off or absent, is asked for nothing more.
    const person = await on.call({ action: "inspect" }, "auth0|person");
    expect(words(person)).not.toContain("later_inputs.asked");
    expect(person.structuredContent).toHaveProperty("next_step", planBuildingLine(false));
    for (const planner of [undefined, { enabled: false, plan: async () => { throw new Error("never"); } } as ResearchPlanner]) {
      const off = await tool(planner);
      const plain = await off.call({ action: "inspect" });
      expect(words(plain)).not.toContain("later_inputs.asked");
      expect(plain.structuredContent).toHaveProperty("next_step", planBuildingLine(false));
    }
    expect(laterInputNames("manage_research_access")).toContain("asked");
  });

  it("hands a dev account the plan as a menu ready for plan_research, which asks the planner's question", async () => {
    const memory = memoryPlanner();
    const { call, service } = await tool(memory.planner);
    const framing = { likely_question: "Does the oil work like the tea?" };
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
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
    expect(text).toContain("these later_inputs, which carry the plan, changing nothing but what the next sentence adds: " +
      JSON.stringify(structured.planned_later_inputs));
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
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN });
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
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
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
    expect(registered.structuredContent).toMatchObject({ next_step: `${framingNextStep(DEFAULT_RESEARCH_STEERING, undefined)} Fill in menu_outline for your plan_research call.` });
    for (const field of ["research_plan", "planned_later_inputs", "research_plan_not_used"]) {
      expect(registered.structuredContent).not.toHaveProperty(field);
    }
    expect(words(registered)).not.toContain(SOURCE.asked!);
  });

  it("says why there is no plan, and tells the person only when a day's limit is reached", async () => {
    for (const [reason, forPerson] of [["account_limit", true], ["daily_budget", true], ["error", false],
      ["timeout", false], ["refusal", false], ["unreadable", false]] as const) {
      const { call } = await tool(memoryPlanner(() => ({ status: "skipped", reason })).planner);
      const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
        later_inputs: { asked: SOURCE.asked } });
      expect(registered.isError, reason).not.toBe(true);
      const sentence = plannerNotUsedSentence(reason, 10);
      // The result is the one every account gets, with the sentence after its first text.
      expect(registered.content[0], reason).toEqual({ type: "text",
        text: framingGuidance(DEFAULT_RESEARCH_STEERING, undefined) });
      expect(registered.content[1], reason).toEqual({ type: "text", text: sentence });
      expect(registered.structuredContent, reason).toMatchObject({ ok: true, research_plan_not_used: reason,
        next_step: `${framingNextStep(DEFAULT_RESEARCH_STEERING, undefined)}${forPerson ? ` ${sentence}` : ""} ` +
          "Tell the person in one line that the plan will take a few minutes more: you are taking a first look yourself. " +
          "Fill in menu_outline for your plan_research call." });
      expect(registered.structuredContent, reason).not.toHaveProperty("research_plan");
      expect(sentence.includes("Tell the person so in one line"), reason).toBe(forPerson);
    }
    expect(plannerNotUsedSentence("account_limit", 10)).toContain("this account has had today's 10 calls, and they " +
      "start again at 00:00 UTC");
    // A planner that reports off, or throws, changes nothing or counts as a failure: the registration still stands.
    const off = await tool(memoryPlanner(() => ({ status: "skipped", reason: "off" })).planner);
    const plain = await registerAndReadPlan(off.call, { action: "register_plain_answer", plainAnswer: PLAIN });
    expect(plain.content[1]).toEqual({ type: "text", text: "Fill in menu_outline for your plan_research call." });
    expect(plain.content[2]).toEqual({ type: "text", text: expect.stringMatching(/^Plain answer registered/) });
    expect(plain.structuredContent).not.toHaveProperty("research_plan_not_used");
    const thrown = await tool({ enabled: true, plan: async () => { throw new Error("broken"); } });
    const stands = await registerAndReadPlan(thrown.call, { action: "register_plain_answer", plainAnswer: PLAIN });
    expect(stands.structuredContent).toMatchObject({ ok: true, research_plan_not_used: "error" });
    // One that throws before it returns a promise is a failure too, not a failed registration.
    const sync = await tool({ enabled: true, plan: () => { throw new Error("broken at once"); } });
    const still = await registerAndReadPlan(sync.call, { action: "register_plain_answer", plainAnswer: PLAIN });
    expect(still.isError).not.toBe(true);
    expect(still.structuredContent).toMatchObject({ ok: true, research_plan_not_used: "error" });
  });

  it("takes the person's words as one text or as a list of messages, in order", async () => {
    // Round 7 (13 Nov 2026): four of five chats sent a list first, and were refused once each.
    const memory = memoryPlanner();
    const { call } = await tool(memory.planner);
    const listed = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
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
        const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
          ...(asked === undefined ? {} : { later_inputs: { asked } }) });
        expect(registered.isError, words(registered)).not.toBe(true);
        const structured = registered.structuredContent as Record<string, unknown> & { research_receipt: string };
        expect(typeof structured.research_receipt).toBe("string");
        // Two texts: the step aside, and the receipt, kept in case the person asks for the research after all; then
        // only the structured content as text, which every result carries for apps that read only text.
        const held = (await heldFor({ pointers: () => OWNER_POINTERS }, PLAIN.researchTarget))!;
        expect(registered.content).toEqual([
          { type: "text", text: asideGuidance({ about: REPLY.about, searches: 2 }) },
          // The owner, 14 Nov 2026: what AskRigor holds comes with a step aside too. This question matches no
          // pointer and the test server has no Atlas, so it is the list of the questions the owner keeps pointers for.
          { type: "text", text: heldText(held) },
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
          askrigor_holds: held,
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
      const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN });
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

  it("does not step aside on a plan made without a web search", async () => {
    // The aside lane's own condition is that the call's search showed the fact stated plainly.
    const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf({ ...NONE, lane: "aside" }, 0)! }));
    const { call } = await tool(memory.planner, ["auth0|dev"], { researchReviewer: reviewing });
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: SOURCE.asked } });
    expect(registered.isError, words(registered)).not.toBe(true);
    const structured = registered.structuredContent as Record<string, unknown>;
    expect(structured).toMatchObject({ ok: true, research_plan_not_used: "unreadable" });
    expect(structured).not.toHaveProperty("research_plan");
    expect(words(registered)).not.toContain(ASIDE_OPENING);
  });

  it("hands over a light plan's menu with its lane, and plan_research goes on with the light look-up", async () => {
    const memory = memoryPlanner(() => ({ status: "planned", plan: researchPlanOf(LIGHT_REPLY, 1)! }));
    const { call } = await tool(memory.planner, ["auth0|dev"], { researchReviewer: reviewing });
    const framing = { likely_question: "What does the trial report?" };
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
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
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
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
    const registeredBefore = await registerAndReadPlan(before.call, { action: "register_plain_answer", plainAnswer: PLAIN });
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
    // A re-plan asks either way.
    const replan = await call({ action: "plan_research", later_inputs: { researchMenu: menu({ steering_choice: "n/a",
      done: [1] }) } });
    expect(replan.isError, words(replan)).not.toBe(true);
    expect(replan.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
    // Long tasks used to ask either way; since owner answer 399b a balanced first menu doesn't wait for its length, so
    // there the decision rests on the judgment, and one that is neither none nor a question is handed back.
    const long = await call({ action: "plan_research", later_inputs: { researchMenu: menu({ steering_choice: "n/a",
      tasks: [{ task: "Read twelve papers in full", kind: "full_text", could_change: "conclusion", sources: 12 }] }) } });
    expect(long.isError).toBe(true);
    expect(words(long)).toContain("whether to ask the person first rests on it");
  });
});

// Owner answer 303a (14 Nov 2026): learn mode, on a dev account while the planning call is on. The store's side is in
// tests/research-steering.test.ts.
describe("learn mode on a dev account (owner answer 303a)", () => {
  const first = (result: Result): string => result.content[0]!.type === "text" ? result.content[0]!.text : "";
  const learn = (learnMenuChoices: boolean, more: Record<string, unknown> = {}) =>
    ({ action: "set_research_steering", later_inputs: { researchSteering: { learnMenuChoices, ...more } } });
  const disabled = { enabled: false, plan: async () => { throw new Error("never"); } } as unknown as ResearchPlanner;
  type Store = InMemoryResearchContributorAccessStore;
  const storeOf = (service: ResearchContributorAccessService) => (service as unknown as { store: Store }).store;

  /** Registers the plain answer and returns the planned menu, ready for plan_research. */
  async function plannedMenu(call: (input: Record<string, unknown>, subject?: string) => Promise<Result>) {
    const registered = await registerAndReadPlan(call, { action: "register_plain_answer", plainAnswer: PLAIN,
      later_inputs: { asked: SOURCE.asked } });
    expect(registered.isError, words(registered)).not.toBe(true);
    return (registered.structuredContent as { planned_later_inputs: { researchMenu: Record<string, unknown> } })
      .planned_later_inputs;
  }
  /** The ask's "you decide" call, with person_answered given as true. */
  const youDecide = (asked: Result) => {
    const copy = structuredClone((asked.structuredContent as { you_decide_later_inputs: { researchMenu:
      Record<string, unknown> } }).you_decide_later_inputs);
    copy.researchMenu.person_answered = true;
    return copy;
  };

  it("turns off and deletes what was kept for an account whose access was revoked", async () => {
    // Revoked access must not leave a person's choices and reasons on the server with no way to delete them.
    const { call, service } = await tool(memoryPlanner().planner);
    await call(learn(true));
    await service.recordMenuChoice(service.accountKeyForSubject("auth0|dev"), { lane: "research", youDecide: false,
      reason: "Trials only.", tasks: [{ kind: "full_text", could_change: "conclusion", recommended: true, minutes: 3 }] });
    expect(storeOf(service).allMenuChoices()).toHaveLength(1);
    await service.revoke("auth0|dev");
    expect(storeOf(service).allMenuChoices()).toHaveLength(1);
    const off = await call(learn(false));
    expect(off.isError, words(off)).not.toBe(true);
    expect(first(off)).toBe(LEARN_MODE_OFF);
    expect(storeOf(service).allMenuChoices()).toEqual([]);
  });

  it("is turned on only on a dev account while the planning call is on, refused whole otherwise; off is never refused",
    async () => {
    const { call, service } = await tool(memoryPlanner().planner);
    const on = await call(learn(true));
    expect(on.isError, words(on)).not.toBe(true);
    expect(first(on)).toBe(LEARN_MODE_ON);
    expect(on.structuredContent).toEqual({ ok: true, steering: { ...STORED_DEFAULT_STEERING, learnMenuChoices: true } });
    const both = await call(learn(false, { style: "guided" }));
    expect(first(both)).toBe("Research style: guided (asks you at the start and before every long task), checking " +
      "back after 10 minutes; for what key observational studies adjusted for, only adjustments that look doubtful " +
      `on a quick check. This applies to this account's research until the person changes it. ${LEARN_MODE_OFF}`);
    expect((await service.activeAccount("auth0|dev")).steering).toEqual({ ...STORED_DEFAULT_STEERING,
      style: "guided", learnMenuChoices: false });
    // Any other account: turning it on is refused with its own code and words, and the style it named is not
    // applied either.
    const refused = await call(learn(true, { style: "autonomous" }), "auth0|person");
    expect(refused.isError).toBe(true);
    expect(first(refused)).toBe(LEARN_MODE_UNAVAILABLE);
    expect(refused.structuredContent).toEqual({ ok: false, error: { code: "learn_mode_unavailable",
      message: LEARN_MODE_UNAVAILABLE } });
    expect((await service.activeAccount("auth0|person")).steering).toEqual(STORED_DEFAULT_STEERING);
    // Turning it off is never refused, since it deletes what was kept: any account may, and its result still names no
    // setting it was never offered.
    const offAnyway = await call(learn(false), "auth0|person");
    expect(offAnyway.isError, words(offAnyway)).not.toBe(true);
    expect(first(offAnyway)).toBe(LEARN_MODE_OFF);
    expect(offAnyway.structuredContent).toEqual({ ok: true, steering: { style: "balanced", checkBackMinutes: 10,
      adjustmentDetail: "flagged" } });
    expect((await service.activeAccount("auth0|person")).steering).toEqual(STORED_DEFAULT_STEERING);
    // Its style alone is changed as before, and its result names no learn mode.
    const style = await call({ action: "set_research_steering", later_inputs: { researchSteering: { style: "guided" } } },
      "auth0|person");
    expect(style.structuredContent).toEqual({ ok: true, steering: { style: "guided", checkBackMinutes: 10,
      adjustmentDetail: "flagged" } });
    expect(words(style)).not.toMatch(/learn/iu);
    // A dev account while the planning call is off or absent is refused the same way when it turns learn mode on, and
    // nothing is changed; turning it off still works there, so what was kept can always be deleted.
    for (const planner of [undefined, disabled]) {
      const off = await tool(planner);
      const refusedOn = await off.call(learn(true, { checkBackMinutes: 30 }));
      expect(refusedOn.structuredContent).toMatchObject({ ok: false, error: { code: "learn_mode_unavailable" } });
      expect((await off.service.activeAccount("auth0|dev")).steering).toEqual(STORED_DEFAULT_STEERING);
      const allowedOff = await off.call(learn(false));
      expect(allowedOff.isError, words(allowedOff)).not.toBe(true);
      expect(first(allowedOff)).toBe(LEARN_MODE_OFF);
    }
  });

  it("says in a dev account's inspect whether it is on and how many choices are kept, and nothing to others", async () => {
    const { call, service } = await tool(memoryPlanner().planner);
    const off = await call({ action: "inspect" });
    expect(first(off)).toContain(` ${learnModeInspectSentence(false, 0)} `);
    expect(off.structuredContent).toMatchObject({ steering: { learnMenuChoices: false } });
    await call(learn(true));
    await service.recordMenuChoice(service.accountKeyForSubject("auth0|dev"), { lane: "research", youDecide: true,
      reason: null, tasks: [{ kind: "full_text", could_change: "conclusion", recommended: true, minutes: 3 }] });
    const on = await call({ action: "inspect" });
    expect(first(on)).toContain(` ${learnModeInspectSentence(true, 1)} `);
    expect(on.structuredContent).toMatchObject({ steering: { learnMenuChoices: true } });
    // Right after the research style's words.
    expect(first(on).indexOf("Learn mode is on")).toBeGreaterThan(first(on).indexOf("Research style: "));
    const person = await call({ action: "inspect" }, "auth0|person");
    expect(words(person)).not.toMatch(/learn mode|learnMenuChoices/iu);
    expect((person.structuredContent as { steering: object }).steering).toEqual({ style: "balanced",
      checkBackMinutes: 10, adjustmentDetail: "flagged" });
  });

  it("names learn mode in a dev account's ask while the planning call is on, and every other account's ask is as it was",
    async () => {
      const { call } = await tool(memoryPlanner().planner);
      const planned = await plannedMenu(call);
      const asked = await call({ action: "plan_research", later_inputs: planned });
      expect(asked.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "ask" } });
      const step = (asked.structuredContent as { next_step: string }).next_step;
      expect(first(asked)).toContain(`${menuPreferenceLine("balanced")}\n${learnModeLine(false)}\n`);
      expect(first(asked)).toContain(`${STYLE_REPLY} ${LEARN_MODE_REPLY}`);
      expect(step).toContain(`in their language: ${learnModeLine(false)} Make no research call`);
      expect(step).toContain(`${STYLE_REPLY} ${LEARN_MODE_REPLY}`);
      await call(learn(true));
      const again = await call({ action: "plan_research", later_inputs: planned });
      expect(first(again)).toContain(`${menuPreferenceLine("balanced")}\n${learnModeLine(true)}\n`);
      // The same menu, without the dev account's receipt, on another account and on a dev account whose planning
      // call is off: no line and no rule, and every other word the same.
      const menu = { researchMenu: { ...planned.researchMenu, plain_answer_receipt: undefined } };
      const dev = await call({ action: "plan_research", later_inputs: menu });
      const person = await call({ action: "plan_research", later_inputs: menu }, "auth0|person");
      const off = await tool(disabled);
      const offDev = await off.call({ action: "plan_research", later_inputs: menu });
      for (const other of [person, offDev]) {
        // AskRigor#467 (15 Nov 2026): every account's ask names person_reason in its go-ahead line alone.
        expect(words(other).replaceAll(GO_AHEAD_BEFORE_ASK, "")).not.toMatch(/learn mode|person_reason/iu);
        expect(first(other)).toBe(first(dev).replace(`\n${learnModeLine(true)}`, "").replace(` ${LEARN_MODE_REPLY}`, ""));
        expect((other.structuredContent as { next_step: string }).next_step).toBe(
          (dev.structuredContent as { next_step: string }).next_step
            .replace(`, and after it this line, in their language: ${learnModeLine(true)}`, ".")
            .replace(` ${LEARN_MODE_REPLY}`, ""));
      }
    });

  it("keeps the person's answer to a menu only on a dev account with learn mode on, and gives it to the next plan",
    async () => {
      const memory = memoryPlanner();
      const { call, service } = await tool(memory.planner);
      const key = service.accountKeyForSubject("auth0|dev");
      // Off: the person's answer is planned as before, and nothing is kept.
      let planned = await plannedMenu(call);
      let asked = await call({ action: "plan_research", later_inputs: planned });
      expect((await call({ action: "plan_research", later_inputs: youDecide(asked) })).structuredContent)
        .toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      await waitForPendingMenuChoices(service);
      expect(storeOf(service).allMenuChoices()).toEqual([]);
      // On: the ask itself keeps nothing; the "you decide" call is kept as such, with no reason.
      await call(learn(true));
      planned = await plannedMenu(call);
      asked = await call({ action: "plan_research", later_inputs: planned });
      await waitForPendingMenuChoices(service);
      expect(storeOf(service).allMenuChoices()).toEqual([]);
      const decided = await call({ action: "plan_research", later_inputs: youDecide(asked) });
      expect(decided.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      await waitForPendingMenuChoices(service);
      const tasks = researchPlanOf(REPLY, 1)!.tasks;
      expect(await service.menuChoices(key)).toEqual([{ chosenAt: expect.any(String), lane: "research",
        youDecide: true, reason: null, tasks: [
          { kind: tasks[0]!.kind, could_change: "conclusion", recommended: true, minutes: 3 },
          { kind: tasks[1]!.kind, could_change: "confidence", recommended: true, minutes: 1 },
          { kind: tasks[2]!.kind, could_change: "detail", recommended: false, minutes: 0 },
        ] }]);
      // The person's own allocation, with their reason, cleaned to one line.
      const own = { researchMenu: { ...planned.researchMenu, allocation: [{ task: 1, minutes: 6 }, { task: 3, minutes: 2 }],
        person_answered: true, person_reason: "  I want\u0000 the trials,\n\tnot forums.  " } };
      expect((await call({ action: "plan_research", later_inputs: own })).isError).not.toBe(true);
      await waitForPendingMenuChoices(service);
      const kept = await service.menuChoices(key);
      expect(kept).toHaveLength(2);
      expect(kept[0]).toMatchObject({ youDecide: false, reason: "I want the trials, not forums." });
      expect(kept[0]!.tasks.map(({ minutes }) => minutes)).toEqual([6, 0, 2]);
      expect(JSON.stringify(kept)).not.toContain(tasks[0]!.task);
      expect(JSON.stringify(kept)).not.toContain(PLAIN.researchTarget);
      // The next registration gives the planner both, newest first; the bundle carries them.
      const before = memory.seen.length;
      await plannedMenu(call);
      const history = memory.seen[before]!.source.menuHistory!;
      expect(history).toEqual(menuHistoryOf(kept, Date.now()));
      expect(history.map(({ you_decide, reason, days_ago }) => [you_decide, reason, days_ago])).toEqual([
        [false, "I want the trials, not forums.", 0], [true, null, 0]]);
      expect(history[0]).toEqual({ days_ago: 0, lane: "research", you_decide: false,
        reason: "I want the trials, not forums.", tasks: [
          { kind: tasks[0]!.kind, recommended: true, minutes: 6 }, { kind: tasks[1]!.kind, recommended: true, minutes: 0 },
          { kind: tasks[2]!.kind, recommended: false, minutes: 2 }] });
      expect(researchPlannerBundle(memory.seen[before]!.source, "2026-11-14").menu_history).toEqual(history);
      // Turned off: deleted, and the next registration gives the planner none.
      await call(learn(false));
      expect(storeOf(service).allMenuChoices()).toEqual([]);
      await plannedMenu(call);
      expect(memory.seen.at(-1)!.source).not.toHaveProperty("menuHistory");
    });

  it("keeps nothing of another account, or of a dev account while the planning call is off, whatever the menu carries",
    async () => {
      const { call, service } = await tool(memoryPlanner().planner);
      // Learn mode switched on for the other account in the store itself, as no connector call can.
      await service.setResearchSteering("auth0|person", { learnMenuChoices: true });
      const menu = { research_target: PLAIN.researchTarget, steering_choice: "none", tasks: researchPlanOf(REPLY, 1)!.tasks,
        allocation: [{ task: 1, minutes: 3 }], person_answered: true, person_reason: "A reason of the other account." };
      const answered = await call({ action: "plan_research", later_inputs: { researchMenu: menu } }, "auth0|person");
      expect(answered.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      expect(words(answered)).not.toContain("A reason of the other account.");
      await waitForPendingMenuChoices(service);
      expect(storeOf(service).allMenuChoices()).toEqual([]);
      // A dev account with learn mode on, while the planning call is off: nothing is kept either.
      const off = await tool(disabled);
      await off.service.setResearchSteering("auth0|dev", { learnMenuChoices: true });
      await off.call({ action: "plan_research", later_inputs: { researchMenu: menu } });
      await waitForPendingMenuChoices(off.service);
      expect(storeOf(off.service).allMenuChoices()).toEqual([]);
    });

  it("never fails or delays plan_research when a choice cannot be kept, and logs its class only", async () => {
    const { call, service } = await tool(memoryPlanner().planner);
    await call(learn(true));
    const planned = await plannedMenu(call);
    const asked = await call({ action: "plan_research", later_inputs: planned });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const failing = vi.spyOn(service, "recordMenuChoice").mockRejectedValueOnce(new Error("private failure detail"));
      const decided = await call({ action: "plan_research", later_inputs: youDecide(asked) });
      expect(decided.isError, words(decided)).not.toBe(true);
      expect(decided.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
      await waitForPendingMenuChoices(service);
      expect(failing).toHaveBeenCalledOnce();
      expect(errors.mock.calls).toEqual([["research access: menu_choice_not_recorded"]]);
      // A write that never ends does not hold the result back.
      vi.spyOn(service, "recordMenuChoice").mockImplementationOnce(() => new Promise<boolean>(() => undefined));
      const slow = await call({ action: "plan_research", later_inputs: youDecide(asked) });
      expect(slow.structuredContent).toMatchObject({ ok: true, researchMenu: { next: "go_on" } });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("cleans the person's reason as the planner's lines are, and cuts it to 300 characters", () => {
    expect(personReasonOf(undefined)).toBeNull();
    expect(personReasonOf("  Trials,\u0000 not\n\tforums.  ")).toBe("Trials, not forums.");
    // A reason empty after cleaning is no reason; so is one holding something like a key.
    expect(personReasonOf("​\u0001 ⁠")).toBeNull();
    expect(personReasonOf("my key is sk-ant-000")).toBeNull();
    const long = personReasonOf(`${"word ".repeat(100)}end`)!;
    expect(long).toHaveLength(300);
    expect(long.endsWith("…")).toBe(true);
    expect(personReasonOf("x".repeat(300))).toBe("x".repeat(300));
  });

  it("puts the history in the planning call's bundle, and keeps the hour's plan whatever is chosen meanwhile", async () => {
    const entry: MenuHistoryEntry = { days_ago: 2, lane: "research", you_decide: false, reason: "Trials only.",
      tasks: [{ kind: "full_text", recommended: true, minutes: 4 }] };
    expect(researchPlannerBundle({ ...SOURCE, menuHistory: [] }, "2026-11-14").menu_history).toBeNull();
    // Only the history's own fields, whatever else an entry holds.
    expect(researchPlannerBundle({ ...SOURCE, menuHistory: [{ ...entry, extra: "x" } as MenuHistoryEntry] },
      "2026-11-14").menu_history).toEqual([entry]);
    const at = Date.parse("2026-11-14T10:00:00Z");
    let reply: unknown = REPLY;
    const made = planner({ now: () => at, reply: () => message({}, reply) });
    await made.planner.plan({ ...SOURCE, menuHistory: [entry] }, "account-a");
    expect(JSON.parse(made.bodies[0]!.messages[0]!.content as string).menu_history).toEqual([entry]);
    // The same words within the hour keep their plan, whatever the person chose meanwhile: a registration repeated
    // after they answered the menu (to add a claim, to correct the research target) must not change the menu they
    // answered, nor make a second paid call.
    expect((await made.planner.plan({ ...SOURCE, menuHistory: [entry] }, "account-a")).cached).toBe(true);
    reply = LIGHT_REPLY;
    const newer = { ...entry, days_ago: 0, reason: "Now the forums too." };
    expect((await made.planner.plan({ ...SOURCE, menuHistory: [newer, entry] }, "account-a")).cached).toBe(true);
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(true);
    expect(await made.planner.lane(SOURCE.asked, "account-a")).toBe("research");
    expect(made.bodies).toHaveLength(1);
    // Other words are a new plan, made with the history as it is then.
    expect((await made.planner.plan({ ...SOURCE, asked: "another question", menuHistory: [newer, entry] }, "account-a"))
      .cached).toBe(false);
    expect(JSON.parse(made.bodies[1]!.messages[0]!.content as string).menu_history).toEqual([newer, entry]);
    expect(made.bodies).toHaveLength(2);
    // The days since each choice, in whole days, newest first as kept.
    expect(menuHistoryOf([
      { chosenAt: "2026-11-14T09:00:00.000Z", lane: "light", youDecide: true, reason: null,
        tasks: [{ kind: "full_text", could_change: "conclusion", recommended: true, minutes: 3 }] },
      { chosenAt: "2026-11-11T11:00:00.000Z", lane: "research", youDecide: false, reason: "R.",
        tasks: [{ kind: "forum_thread", could_change: "detail", recommended: false, minutes: 2 }] },
    ], at)).toEqual([
      { days_ago: 0, lane: "light", you_decide: true, reason: null, tasks: [{ kind: "full_text", recommended: true,
        minutes: 3 }] },
      { days_ago: 2, lane: "research", you_decide: false, reason: "R.", tasks: [{ kind: "forum_thread",
        recommended: false, minutes: 2 }] },
    ]);
  });
});

// Owner answer 395b (21 Nov 2026): a test round pauses a dev account's planning call for at most two hours, so its
// research can be compared with and without the call on the same day and build. Kept in memory, by the account's digest.
describe("a test round's pause of the planning call (owner answer 395b)", () => {
  const MINUTE = 60_000;
  const START = Date.parse("2026-11-21T14:00:00Z");
  const first = (result: Result): string => result.content[0]!.type === "text" ? result.content[0]!.text : "";
  const disabled = { enabled: false, plan: async () => { throw new Error("never"); } } as unknown as ResearchPlanner;
  const register = { action: "register_plain_answer", plainAnswer: PLAIN, later_inputs: { asked: SOURCE.asked } };

  it("pauses one account's call, which then makes no call and counts nothing, and starts again by itself", async () => {
    let at = START;
    const made = planner({ now: () => at, env: { ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS: "1" } });
    const pause = made.planner.pause!;
    const pausedUntil = made.planner.pausedUntil!;
    expect(pausedUntil("account-a")).toBeUndefined();
    expect(pause("account-a", 30)).toBe(START + 30 * MINUTE);
    expect(pausedUntil("account-a")).toBe(START + 30 * MINUTE);
    expect(pausedUntil("account-b")).toBeUndefined();
    // Paused: as with the planner off, with no call, no cost and nothing counted toward the account's one call a day.
    expect(await made.planner.plan(SOURCE, "account-a")).toEqual({ planning: { status: "skipped", reason: "off" },
      cached: false, costUsd: 0, milliseconds: 0 });
    expect(made.bodies).toHaveLength(0);
    // Another account is planned for as before.
    expect((await made.planner.plan(SOURCE, "account-b")).planning.status).toBe("planned");
    expect(made.bodies).toHaveLength(1);
    // At its end the call starts again by itself, and the account still has its call for the day.
    at = START + 30 * MINUTE - 1;
    expect(pausedUntil("account-a")).toBe(START + 30 * MINUTE);
    at = START + 30 * MINUTE;
    expect(pausedUntil("account-a")).toBeUndefined();
    expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
    expect(made.bodies).toHaveLength(2);
  });

  it("pauses for 1 to 120 whole minutes, never past two hours from its start, and ends at once with 0", () => {
    let at = START;
    const made = planner({ now: () => at });
    const pause = made.planner.pause!;
    const pausedUntil = made.planner.pausedUntil!;
    expect(PLANNER_PAUSE_MAX_MINUTES).toBe(120);
    for (const minutes of [121, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) {
      expect(() => pause("account-a", minutes), String(minutes)).toThrow(RangeError);
    }
    expect(pausedUntil("account-a")).toBeUndefined();
    expect(pause("account-a", 120)).toBe(START + 120 * MINUTE);
    at += 10 * MINUTE;
    // Paused again while it runs: a new end from now, shorter here.
    expect(pause("account-a", 5)).toBe(at + 5 * MINUTE);
    expect(pausedUntil("account-a")).toBe(at + 5 * MINUTE);
    // Paused again and again, it keeps its start: never more than two hours from it (Codex's review of 21 Nov).
    at = START + 14 * MINUTE;
    expect(pause("account-a", 60)).toBe(START + 74 * MINUTE);
    at = START + 73 * MINUTE;
    expect(pause("account-a", 120)).toBe(START + 120 * MINUTE);
    at = START + 119 * MINUTE;
    expect(pause("account-a", 120)).toBe(START + 120 * MINUTE);
    at = START + 120 * MINUTE;
    expect(pausedUntil("account-a")).toBeUndefined();
    // A pause set after one ended is a new one, with its own start.
    expect(pause("account-a", 30)).toBe(at + 30 * MINUTE);
    expect(pause("account-a", 0)).toBeUndefined();
    expect(pausedUntil("account-a")).toBeUndefined();
    // Ending a pause that does not run changes nothing.
    expect(pause("account-b", 0)).toBeUndefined();
    expect(pausedUntil("account-b")).toBeUndefined();
    // The planner while off has no pause at all.
    const off = planner({ env: { ASKRIGOR_RESEARCH_PLANNER: "off" } }).planner;
    expect(off.enabled).toBe(false);
    expect(off.pause).toBeUndefined();
    expect(off.pausedUntil).toBeUndefined();
  });

  it("forgets the account's plans and lanes when it starts, so no research takes a plan made before it", async () => {
    let at = START;
    const made = planner({ now: () => at });
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(false);
    expect((await made.planner.plan(SOURCE, "account-b")).cached).toBe(false);
    expect(await made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBe("research");
    at += MINUTE;
    made.planner.pause!("account-a", 10);
    // During the pause there is no lane; after it, the plan made before it is gone, and the same words are a new call.
    expect(await made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBeUndefined();
    at += 10 * MINUTE;
    expect(made.planner.pausedUntil!("account-a")).toBeUndefined();
    expect(await made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBeUndefined();
    expect(await made.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBeUndefined();
    // The other account's plan and lane are kept for their hour.
    expect(await made.planner.lane(SOURCE.asked, "account-b", SOURCE.researchTarget)).toBe("research");
    expect((await made.planner.plan(SOURCE, "account-b")).cached).toBe(true);
    expect((await made.planner.plan(SOURCE, "account-a")).cached).toBe(false);
    expect(made.bodies).toHaveLength(3);
  });

  it("gives no lane to a final check that waits on a plan the pause forgot (Codex's review of 21 Nov)", async () => {
    const at = START;
    let release: (() => void) | undefined;
    const made = planner({ now: () => at,
      reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release = () => resolve(message()); }) });
    const running = made.planner.plan(SOURCE, "account-a");
    await vi.waitFor(() => expect(release).toBeDefined());
    // The final check asks for the lane while the plan is still being made, then the pause begins, then the plan comes.
    const lane = made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget);
    made.planner.pause!("account-a", 5);
    made.planner.pause!("account-a", 0);
    release!();
    await running;
    expect(await lane).toBeUndefined();
  });

  it("keeps the lane of a plan registered right after a pause ends, in the same millisecond", async () => {
    const made = planner({ now: () => START });
    made.planner.pause!("account-a", 10);
    made.planner.pause!("account-a", 0);
    expect((await made.planner.plan(SOURCE, "account-a")).planning.status).toBe("planned");
    expect(await made.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBe("research");
    expect(await made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBe("research");
  });

  it("gives a call running when the pause began its plan, and keeps no lane from it", async () => {
    let at = START;
    let release: (() => void) | undefined;
    const made = planner({ now: () => at,
      reply: () => new Promise<Anthropic.Beta.BetaMessage>((resolve) => { release = () => resolve(message()); }) });
    const running = made.planner.plan(SOURCE, "account-a");
    await vi.waitFor(() => expect(release).toBeDefined());
    made.planner.pause!("account-a", 5);
    release!();
    // The registration made before the pause gets its plan; nothing of it is kept for later research.
    expect((await running).planning.status).toBe("planned");
    expect(await made.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBeUndefined();
    at += 5 * MINUTE;
    expect(await made.planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBeUndefined();
    expect(await made.planner.lane(undefined, "account-a", SOURCE.researchTarget)).toBeUndefined();
  });

  it("lets a dev account pause its own call, which then inspects and registers as with the call off", async () => {
    let at = START;
    const made = planner({ now: () => at });
    const dev = ["auth0|dev", "auth0|person"];
    const off = await tool(disabled, dev);
    const offInspected = await off.call({ action: "inspect" });
    const offRegistered = await off.call(register);
    const { call } = await tool(made.planner, dev);
    const paused = await call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 45 } });
    const until = START + 45 * MINUTE;
    expect(paused.isError).not.toBe(true);
    expect(paused.structuredContent).toEqual({ ok: true, plannerPausedUntil: new Date(until).toISOString() });
    expect(first(paused)).toBe(plannerPausedText(until));
    expect(first(paused)).toContain("until 14:45 UTC (2026-11-21T14:45:00.000Z)");
    // inspect, which every AI calls before research, reads as with the call off: no request for the person's words,
    // and no word of the pause or a test (Fable's recheck of 21 Nov).
    const inspected = await call({ action: "inspect" });
    expect(first(inspected)).toBe(first(offInspected));
    expect(Object.keys(inspected.structuredContent!).sort()).toEqual(Object.keys(offInspected.structuredContent!).sort());
    expect(words(inspected)).not.toMatch(/pause|test round|plannerPausedUntil/iu);
    expect(words(inspected)).not.toContain(ASKED_REQUEST);
    // The other dev account is asked for its words and told of no pause.
    const other = await call({ action: "inspect" }, "auth0|person");
    expect(words(other)).toContain(ASKED_REQUEST);
    expect(other.structuredContent).not.toHaveProperty("plannerPausedUntil");
    // A registration makes no call, and reads word for word as a dev account's while the call is off.
    const registered = await call(register);
    expect(made.bodies).toHaveLength(0);
    const receipt = (result: Result) => (result.structuredContent as { research_receipt: string }).research_receipt;
    expect(words(registered).replaceAll(receipt(registered), "R"))
      .toBe(words(offRegistered).replaceAll(receipt(offRegistered), "R"));
    expect(Object.keys(registered.structuredContent!).sort()).toEqual(Object.keys(offRegistered.structuredContent!).sort());
    expect(registered.structuredContent).not.toHaveProperty("research_plan");
    expect(registered.structuredContent).not.toHaveProperty("research_plan_not_used");
    // The other dev account's registration is planned.
    expect((await registerAndReadPlan(call, register, "auth0|person")).structuredContent).toHaveProperty("research_plan");
    expect(made.bodies).toHaveLength(1);
    // After the pause the dev account is asked for its words and planned for again.
    at = until;
    const after = await call({ action: "inspect" });
    expect(words(after)).toContain(ASKED_REQUEST);
    expect((await registerAndReadPlan(call, register)).structuredContent).toHaveProperty("research_plan");
    expect(made.bodies).toHaveLength(2);
  });

  it("names no learn mode in a paused dev account's ask, as with the call off, and leaves the setting free", async () => {
    const made = planner({ now: () => START });
    const off = await tool(disabled);
    const { call } = await tool(made.planner);
    expect((await call({ action: "set_research_steering", later_inputs: { researchSteering: { learnMenuChoices: true } } }))
      .isError).not.toBe(true);
    const registered = await registerAndReadPlan(call, register);
    const planned = (registered.structuredContent as { planned_later_inputs: { researchMenu: Record<string, unknown> } })
      .planned_later_inputs;
    const menu = { researchMenu: { ...planned.researchMenu, plain_answer_receipt: undefined } };
    const on = await call({ action: "plan_research", later_inputs: menu });
    expect(first(on)).toMatch(/learn mode/iu);
    await call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 20 } });
    const paused = await call({ action: "plan_research", later_inputs: menu });
    const offDev = await off.call({ action: "plan_research", later_inputs: menu });
    expect(words(paused).replaceAll(GO_AHEAD_BEFORE_ASK, "")).not.toMatch(/learn mode|person_reason/iu);
    expect(first(paused)).toBe(first(offDev));
    expect((paused.structuredContent as { next_step: string }).next_step)
      .toBe((offDev.structuredContent as { next_step: string }).next_step);
    // Learn mode is a setting kept for later, not a use of the call: it can be changed while the pause runs.
    const changed = await call({ action: "set_research_steering",
      later_inputs: { researchSteering: { learnMenuChoices: false } } });
    expect(changed.isError).not.toBe(true);
    expect(changed.structuredContent).toMatchObject({ ok: true, steering: { learnMenuChoices: false } });
  });

  it("refuses another account, a server whose call is off, and minutes that are not 0 to 120, changing nothing",
    async () => {
      const made = planner({ now: () => START });
      const { call, service } = await tool(made.planner);
      const devKey = service.accountKeyForSubject("auth0|dev");
      const refused = await call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 30 } }, "auth0|person");
      expect(refused.isError).toBe(true);
      expect(refused.structuredContent).toMatchObject({ ok: false, error: { code: "dev_account_required" } });
      expect(made.planner.pausedUntil!(service.accountKeyForSubject("auth0|person"))).toBeUndefined();
      for (const pauseMinutes of [121, -1, 2.5, "30", null, true]) {
        const wrong = await call({ action: "pause_research_planner", later_inputs: { pauseMinutes } });
        expect(wrong.isError, String(pauseMinutes)).toBe(true);
        expect(wrong._meta?.["askrigor/errorCode"], String(pauseMinutes)).toBe("invalid_input");
        expect(words(wrong)).toContain("later_inputs.pauseMinutes");
      }
      expect(made.planner.pausedUntil!(devKey)).toBeUndefined();
      expect((await call({ action: "pause_research_planner" })).structuredContent).toMatchObject({ ok: false,
        error: { code: "invalid_request",
          message: "later_inputs.pauseMinutes goes only with action pause_research_planner, which needs it." } });
      // Carried by another action, even one that answers before the inputs are checked, it is refused.
      for (const action of ["inspect", "list_calls", "delete_shared_answer"]) {
        const stray = await call({ action, later_inputs: { pauseMinutes: 30 } });
        expect(stray.structuredContent, action).toMatchObject({ ok: false, error: { code: "invalid_request" } });
      }
      expect(made.planner.pausedUntil!(devKey)).toBeUndefined();
      // 0 ends a running pause.
      expect((await call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 30 } })).isError).not.toBe(true);
      expect(made.planner.pausedUntil!(devKey)).toBe(START + 30 * MINUTE);
      const ended = await call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 0 } });
      expect(ended.structuredContent).toEqual({ ok: true, plannerPausedUntil: null });
      expect(first(ended)).toBe(PLANNER_PAUSE_ENDED);
      expect(made.planner.pausedUntil!(devKey)).toBeUndefined();
      // While the call is off, or absent, there is nothing to pause.
      for (const offPlanner of [undefined, disabled]) {
        const offTool = await tool(offPlanner);
        const nothing = await offTool.call({ action: "pause_research_planner", later_inputs: { pauseMinutes: 30 } });
        expect(nothing.isError).toBe(true);
        expect(nothing.structuredContent).toEqual({ ok: false,
          error: { code: "planner_off", message: PLANNER_OFF_NOTHING_PAUSED } });
      }
      expect(laterInputNames("manage_research_access")).toContain("pauseMinutes");
      expect(manageResearchAccessInputSchema.shape.action.options).toContain("pause_research_planner");
    });

  it("asks for no words at the final check when the call was off for the registration, as a pause begun during it",
    async () => {
      const reviewer = { enabled: true, review: async () => { throw new Error("never"); } } as unknown as ResearchReviewer;
      // A planner on when the registration began, whose call then came back off: what a pause begun meanwhile does.
      const offCall = memoryPlanner(() => ({ status: "skipped", reason: "off" }));
      const { call } = await tool(offCall.planner, ["auth0|dev"], { researchReviewer: reviewer });
      const registered = await registerAndReadPlan(call, register);
      expect(offCall.seen).toHaveLength(1);
      expect(words(registered)).not.toContain(ANSWER_REVIEW_ASKED);
      // A plan that was made still asks for them, as before.
      const on = await tool(memoryPlanner().planner, ["auth0|dev"], { researchReviewer: reviewer });
      const planned = await registerAndReadPlan(on.call, register);
      expect(words(planned)).toContain(ANSWER_REVIEW_ASKED);
    });

  it("keeps no menu answer and names no learn mode when a pause begins while plan_research reads the account",
    async () => {
      const made = planner({ now: () => START });
      const { call, service } = await tool(made.planner);
      await call({ action: "set_research_steering", later_inputs: { researchSteering: { learnMenuChoices: true } } });
      const registered = await registerAndReadPlan(call, register);
      const planned = (registered.structuredContent as { planned_later_inputs: { researchMenu: Record<string, unknown> } })
        .planned_later_inputs;
      const menu = { researchMenu: { ...planned.researchMenu, plain_answer_receipt: undefined } };
      const key = service.accountKeyForSubject("auth0|dev");
      const read = service.activeAccount.bind(service);
      service.activeAccount = async (subject: string) => {
        made.planner.pause!(key, 20);
        return await read(subject);
      };
      const asked = await call({ action: "plan_research", later_inputs: menu });
      expect(words(asked).replaceAll(GO_AHEAD_BEFORE_ASK, "")).not.toMatch(/learn mode|person_reason/iu);
      const answered = { researchMenu: { ...menu.researchMenu, allocation: [{ task: 1, minutes: 3 }], person_answered: true,
        person_reason: "A reason that is not kept." } };
      made.planner.pause!(key, 0);
      expect((await call({ action: "plan_research", later_inputs: answered })).isError).not.toBe(true);
      await waitForPendingMenuChoices(service);
      expect(await service.menuChoices(key)).toEqual([]);
    });

  it("holds one cleanup timer per paused account, however often the pause is set again (Codex's recheck)", () => {
    vi.useFakeTimers();
    try {
      const made = planner({ now: () => Date.now() });
      const base = vi.getTimerCount();
      made.planner.pause!("account-a", 120);
      expect(vi.getTimerCount()).toBe(base + 1);
      for (const minutes of [60, 30, 0]) made.planner.pause!("account-a", minutes);
      expect(vi.getTimerCount()).toBe(base + 1);
      // The record goes an hour after the pause's end, when it was ended by hand too, and its timer with it.
      vi.advanceTimersByTime(60 * MINUTE + 2);
      expect(vi.getTimerCount()).toBe(base);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not honour a light lane handed over before the pause while it runs (Codex's recheck)", async () => {
    const made = planner({ now: () => START, reply: () => message({}, LIGHT_REPLY) });
    const { call, service } = await tool(made.planner);
    const registered = await registerAndReadPlan(call, register);
    const menu = (registered.structuredContent as { planned_later_inputs: { researchMenu: Record<string, unknown> } })
      .planned_later_inputs;
    expect(menu.researchMenu.lane).toBe("light");
    const light = await call({ action: "plan_research", later_inputs: menu });
    expect(JSON.stringify(light.structuredContent)).toContain('"lane":"light"');
    made.planner.pause!(service.accountKeyForSubject("auth0|dev"), 15);
    const paused = await call({ action: "plan_research", later_inputs: menu });
    expect(paused.isError).not.toBe(true);
    expect(JSON.stringify(paused.structuredContent)).not.toContain('"lane":"light"');
    // And when the pause begins while plan_research reads the account.
    made.planner.pause!(service.accountKeyForSubject("auth0|dev"), 0);
    const read = service.activeAccount.bind(service);
    service.activeAccount = async (subject: string) => {
      made.planner.pause!(service.accountKeyForSubject("auth0|dev"), 15);
      return await read(subject);
    };
    const meanwhile = await call({ action: "plan_research", later_inputs: menu });
    expect(JSON.stringify(meanwhile.structuredContent)).not.toContain('"lane":"light"');
  });

  it("shows the pause on the owner's own account page, where inspect no longer does", async () => {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor("auth0|dev", AGREEMENT);
    const key = service.accountKeyForSubject("auth0|dev");
    const serverOn: AtlasServerFeatures = { redditReader: false, youtube: false, gemini: false,
      aiBudgetLeftNanoUsd: null, videoSecondsLeft: null, meaningJudge: { on: false, dailyCapUsd: null },
      researchPlanner: { on: true, dailyCapUsd: 3, accountDailyCalls: 10 }, ownerLibrary: false, sharedAnswers: false,
      findingsLibrary: false };
    const asked: string[] = [];
    const row = async (paused: number | undefined, dev = true) => {
      const shown = await loadAtlasAccountFeatures({ research: service, server: async () => serverOn,
        ownerAccountKeys: new Set(), devAccountKeys: () => new Set(dev ? [researchAccountReference(key)] : []),
        plannerPausedUntil: (accountKey) => { asked.push(accountKey); return paused; } }, key, new Date(START));
      expect(shown.state).toBe("shown");
      return (shown as { rows: Array<{ id: string; on: boolean; forYou: string }> }).rows
        .find(({ id }) => id === "research-planner")!;
    };
    expect(await row(Date.parse("2026-11-21T14:45:00Z"))).toMatchObject({ on: false, forYou: "Paused until 14:45 UTC " +
      "for a test round, which compares research with and without it: until then your AI plans the research itself, " +
      "as when it is off. It turns back on by itself." });
    expect(await row(undefined)).toMatchObject({ on: true });
    expect(asked).toEqual([key, key]);
    // Another account's page never asks, and reads as before.
    expect(await row(Date.parse("2026-11-21T14:45:00Z"), false)).toMatchObject({ on: false,
      forYou: "It runs only for the owner's dev accounts." });
    expect(asked).toHaveLength(2);
  });
});

// The owner's Inbox reply of 21 Nov 2026, 13:25 UTC: "i turned off the menu because it was often asking for
// clarifdication where none was needed, make sure it's not doing that or nobody will use it". What the call does with
// the rule is measured on the API (the replay of 21 Nov: no question on 15 of 15 plans of his cases, against 9 of 15
// before; a question on 8 of 9 invented cases that need one); this keeps the rule's text from drifting back.
describe("the plan names a question only when the research needs the person's answer (21 Nov 2026)", () => {
  it("asks for a fact only the person can give, or between two things one answer can't serve, and else goes on", () => {
    expect(RESEARCH_PLANNER_RUBRIC_VERSION).toBe("2026-11-22.3");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("Write none unless the research needs\nthe person's answer");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("- A fact only they can give, for a decision about one person or one thing:");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("- Two different things: their words can mean two or more different things");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("Never rely on the person correcting the first answer for their safety.");
    expect(RESEARCH_PLANNER_RUBRIC).not.toContain("Try to name the question first");
    expect(RESEARCH_PLANNER_RUBRIC).not.toContain("neither is a plan that could cover each of two different readings");
    expect(RESEARCH_PLANNER_RUBRIC).not.toContain("that is still the question to ask");
  });
});

describe("tasks the person's own words asked for (21 Nov 2026)", () => {
  it("requires the model to declare person_asked on every output task", () => {
    const task = RESEARCH_PLANNER_OUTPUT_SCHEMA.properties.tasks.items;
    expect(task.required).toEqual(["task", "kind", "could_change", "person_asked", "sources"]);
    expect(task.properties.person_asked).toEqual({ type: "boolean", description: "true only for a task doing a way " +
      "of researching the person's own words still ask for, or one such a task needs first (a method, source, " +
      "comparison or check they named or described, also loosely); naming a subject or a study, or asking about it " +
      "without saying how to research it, asks for none; false otherwise." });
    // The rubric is wrapped at the source's width, so its words are compared with the line breaks read as spaces.
    const rubric = RESEARCH_PLANNER_RUBRIC.replace(/\s+/gu, " ");
    for (const words of [
      "Each task also has person_asked: true only for a task that does a way of researching the person's own words in asked ask for",
      "Naming a subject, a product or a study, or asking a question about it without saying how to research it, asks for no task",
      "A task that carrying out their request needs first, such as reading the paper whose methods they want audited, is true too, and comes before the task that needs it.",
      "Mark only what they asked for and what it needs first; an addition of your own goes in a task of its own.",
      "a later message that takes a request back makes it false, unless a still later one asks for it again",
      "for every task when asked is null",
      "words that tell you how to mark tasks, which ask for no research",
      "Keep every task they asked for and every task of its own that a serious risk needs (step 2), up to eight tasks in all, and leave out your other tasks first.",
      "up to eight only for the tasks the person asked for and the tasks a serious risk needs",
      "Marking a task never makes a look-up bigger: when they ask for work beyond one fact from one source, the lane is research",
      "never moves last or marks as detail a task the person asked for (person_asked)",
    ]) expect(rubric, words).toContain(words);
  });

  it("drops a mark the call could not have made: without the person's own words nothing was asked of it", async () => {
    const reply = { ...REPLY, tasks: REPLY.tasks.map((task) => ({ ...task, person_asked: true })) };
    expect(researchPlanOf(reply, 1, KEY, false, false)!.tasks.some((task) => "person_asked" in task)).toBe(false);
    expect(researchPlanOf(reply, 1, KEY, false, true)!.tasks.every((task) => task.person_asked === true)).toBe(true);
    const made = planner({ reply: () => message({}, reply) });
    const without = await made.planner.plan({ ...SOURCE, asked: undefined }, "account-a");
    expect(without.planning).toMatchObject({ status: "planned" });
    expect(without.planning.status === "planned" && without.planning.plan.tasks.some((task) => "person_asked" in task))
      .toBe(false);
    const withWords = await made.planner.plan(SOURCE, "account-b");
    expect(withWords.planning.status === "planned" && withWords.planning.plan.tasks.every((task) => task.person_asked))
      .toBe(true);
  });

  it("keeps only true and accepts older replies without the declaration", () => {
    const tasks = REPLY.tasks.map((task, index) => ({ ...task,
      ...(index === 2 ? {} : { person_asked: index === 0 }) }));
    const plan = researchPlanOf({ ...REPLY, tasks }, 1)!;
    expect(plan.tasks[0]).toEqual({ ...researchPlanOf(REPLY, 1)!.tasks[0], person_asked: true });
    expect(plan.tasks[1]).not.toHaveProperty("person_asked");
    expect(plan.tasks[2]).not.toHaveProperty("person_asked");
    expect(researchPlanOf(REPLY, 1)).toBeDefined();
  });

  it.each([null, "true", "false", 0, 1, {}, []])("refuses a non-boolean declaration: %j", (person_asked) => {
    expect(researchPlanOf({ ...REPLY, tasks: [{ ...REPLY.tasks[0], person_asked }] }, 1)).toBeUndefined();
  });
});


describe("the planner's reading of forms (22 Nov 2026)", () => {
  it("plans for forms people buy or prepare and names the nearest excluded reading", () => {
    expect(RESEARCH_PLANNER_RUBRIC_VERSION).toBe("2026-11-22.3");
    expect(RESEARCH_PLANNER_RUBRIC.replace(/\s+/gu, " ")).toContain("a substance or thing that comes in several forms: plan for the whole class, with its main members grouped. Before you plan, list for yourself the forms a person asking this could have in hand: what is sold, and what people make or prepare themselves. When they differ much in strength, content or how they are used, the form a person is most likely to have gets a task of its own. Say in about what you took it to cover: which members or forms, and the nearest one left out;");
    expect(RESEARCH_PLANNER_RUBRIC.replace(/\s+/gu, " ")).toContain("Say in about what you took it to cover: which members or forms, and the nearest one left out;");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("In about, say which meaning the research takes and the nearest one it leaves out.");
    expect(RESEARCH_PLANNER_RUBRIC).toContain("not different sides, uses, situations, forms, doses or routes of one thing");
  });
});


describe("Round 3: one whole-class reading instruction", () => {
  it("says the coverage instruction once and keeps the changed rubric lines within 110 columns", () => {
    const start = RESEARCH_PLANNER_RUBRIC.indexOf("- they ask about a whole class without naming a member");
    const end = RESEARCH_PLANNER_RUBRIC.indexOf("\n- they ask what something could become", start);
    const bullet = RESEARCH_PLANNER_RUBRIC.slice(start, end);
    expect(bullet.match(/Say in about/gu)).toHaveLength(1);
    expect(bullet.replace(/\s+/gu, " ")).toContain("Say in about what you took it to cover: which members or forms, and the nearest one left out;");
    expect(bullet).not.toContain("Say in about which forms");
    for (const line of bullet.split("\n")) expect(line.length, line).toBeLessThanOrEqual(110);
    const safety = RESEARCH_PLANNER_RUBRIC.slice(RESEARCH_PLANNER_RUBRIC.indexOf("Carry what a safe answer needs"),
      RESEARCH_PLANNER_RUBRIC.indexOf("\nNever rely on the person correcting"));
    for (const line of safety.split("\n")) expect(line.length, line).toBeLessThanOrEqual(110);
  });
});


describe("traditional accounts in the plan (owner answer 402a)", () => {
  it("keeps the approved instruction exactly in step 3 after people's reports", () => {
    expect(RESEARCH_PLANNER_RUBRIC_VERSION).toBe("2026-11-22.3");
    const approved = "When the question is about a traditional, regional or folk medical system's concepts or claims, or about " +
      "a remedy, diagnostic method or practice known or sold as traditional even when no system is named, the " +
      "tasks include what that tradition's own sources say that could change the answer (who it is for and not " +
      "for, its preparation, its cautions) and where its traditions differ (such as classical and standardized " +
      "Chinese medicine), naming which tradition; give it a task of its own only when it answers a different " +
      "question from the other tasks. Match safety and benefit studies to those claims and the actual " +
      "preparation, and keep urgent safety work first.";
    const rubric = RESEARCH_PLANNER_RUBRIC.replace(/\s+/gu, " ");
    expect(rubric).toContain(`put a task near the top for what people who used it report. ${approved} For open options for a health problem or goal`);
    expect(rubric.split(approved)).toHaveLength(2);
    const start = RESEARCH_PLANNER_RUBRIC.indexOf("When the question is about a traditional, regional or folk");
    const end = RESEARCH_PLANNER_RUBRIC.indexOf("\nWhen the question takes", start);
    for (const line of RESEARCH_PLANNER_RUBRIC.slice(start, end).split("\n"))
      expect(line.length, line).toBeLessThanOrEqual(110);
  });
});

describe("open health options in the plan (owner answer 410b)", () => {
  it("versions the approved text and places it exactly once immediately after 402a in step 3", () => {
    const approved = "For open options for a health problem or goal, plan a bounded " +
      "search of relevant living traditions' own accounts and benefit/harm checks for the actual preparations and populations. " +
      "Honour explicit topic/source limits and omit source work they exclude; do not widen confined treatment, diagnostic, " +
      "administrative or lookup requests, or add this search during an emergency. Combine overlapping work; split only " +
      "distinct questions. Preserve serious-risk tasks and existing task limits.";
    expect(RESEARCH_PLANNER_RUBRIC_VERSION).toBe("2026-11-22.3");
    const step3 = RESEARCH_PLANNER_RUBRIC.slice(RESEARCH_PLANNER_RUBRIC.indexOf("\n3. "),
      RESEARCH_PLANNER_RUBRIC.indexOf("\n4. ")).replace(/\s+/gu, " ");
    expect(step3).toContain(`preparation, and keep urgent safety work first. ${approved} When the question takes`);
    expect(RESEARCH_PLANNER_RUBRIC.replace(/\s+/gu, " ").split(approved)).toHaveLength(2);
  });
});
