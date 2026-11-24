// Promise P90 (24 November 2026): AskRigor's own plan reaches for evidence one step away where its searches found little
// direct evidence, and never reads what it leaves out as a fence around the evidence. Three changes to the planner's
// rubric, in the words of Fable's red team of that day, behind ASKRIGOR_PLAN_INDIRECT (off by default). They combine with
// the claims' rule (owner answer 413a), each combination under a version and a cache key of its own. Invented fixtures.
import type Anthropic from "@anthropic-ai/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLAIMS_RUBRIC } from "../apps/research-mcp/src/claim-accounting.js";
import { planIndirectModeFromEnv } from "../apps/research-mcp/src/config.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import {
  INDIRECT_RUBRIC_CHANGES,
  RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_CLAIMS_RUBRIC,
  RESEARCH_PLANNER_CLAIMS_RUBRIC_VERSION,
  RESEARCH_PLANNER_OUTPUT_SCHEMA,
  RESEARCH_PLANNER_RUBRIC,
  RESEARCH_PLANNER_RUBRIC_VERSION,
  createResearchPlanner,
  researchPlanOf,
  researchPlannerBundle,
  researchPlannerRubric,
  type ResearchPlanner,
  type ResearchPlannerSource,
} from "../apps/research-mcp/src/research-planner.js";
import { createResearchTrialWindows } from "../apps/research-mcp/src/research-trial.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

const COMBINATIONS = [
  { accounting: false, indirect: false },
  { accounting: true, indirect: false },
  { accounting: false, indirect: true },
  { accounting: true, indirect: true },
];
/** A text with its line breaks read as spaces: the rubric wraps its lines, the red team's wording does not. */
const unwrapped = (text: string) => text.replace(/\s+/gu, " ");

describe("the planner's rubric with evidence one step away (promise P90)", () => {
  // Fable's red team of 24 November 2026, "Wording I stand behind (to test, not to ship untested)".
  const STEP_1 = "In about, say which meaning the research takes and the nearest one it leaves out, or that it leaves none " +
    "out. What about leaves out is a subject the answer will not speak to. It never limits where evidence may come from: " +
    "studies of the same thing in another form, amount, route, setting or group stay within the tasks' reach, and about " +
    "never calls them left out.";
  const STEP_2 = "and say in about which meaning the research takes and the nearest one it leaves out, or that it leaves none " +
    "out, so that the person can redirect it.";
  const STEP_3 = "In lane research, the search for an outcome the person asks about is not confined to the form, amount, route, " +
    "setting or group they ask about. When your searches showed little or no direct evidence on that outcome (for harm or " +
    "benefit in people: no comparing study in people of the thing as they would use it), the same task, or one more within " +
    "this step's limits, looks for the strongest evidence one step away on that same outcome (in people first: the same thing " +
    "by another route, dose or setting, before animal work and mechanism), and its line says that this evidence is indirect. " +
    "It never displaces a task the person asked for, a serious risk's task or urgent safety work, and it is left out when the " +
    "person's words confine the research.";

  it("is the rubric with three changes in their places and no other, in the red team's words", () => {
    expect(INDIRECT_RUBRIC_CHANGES).toHaveLength(3);
    for (const { from } of INDIRECT_RUBRIC_CHANGES) expect(RESEARCH_PLANNER_RUBRIC.split(from), from).toHaveLength(2);
    const { text } = researchPlannerRubric({ accounting: false, indirect: true });
    for (const said of [STEP_1, STEP_2, STEP_3]) {
      expect(unwrapped(text).split(said)).toHaveLength(2);
      expect(unwrapped(RESEARCH_PLANNER_RUBRIC)).not.toContain(said);
    }
    // Each in its place: the end of step 1, step 2's paragraph on writing none, step 3 after the study's several doses.
    expect(unwrapped(text)).toContain(`${STEP_1} 2. The one question`);
    expect(unwrapped(text)).toContain(`plan for the likeliest meaning, with the others in proportion to how much they matter, ${STEP_2} ` +
      "Carry what a safe answer needs into the tasks:");
    expect(unwrapped(text)).toContain(`a task reads its results across all of them. ${STEP_3} When menu_history shows`);
    // Put back, they are the rubric again: nothing else differs.
    expect(INDIRECT_RUBRIC_CHANGES.reduce((back, { from, to }) => back.replace(to, () => from), text)).toBe(RESEARCH_PLANNER_RUBRIC);
    expect(Math.max(...INDIRECT_RUBRIC_CHANGES.flatMap(({ to }) => to.split("\n")).map((line) => line.length))).toBeLessThanOrEqual(118);
  });

  it("combines with the claims' rule: each combination is the rubric with only its own changes, under its own version", () => {
    const made = COMBINATIONS.map((rules) => researchPlannerRubric(rules));
    expect(made[0]).toEqual({ text: RESEARCH_PLANNER_RUBRIC, version: RESEARCH_PLANNER_RUBRIC_VERSION });
    expect(made[1]).toEqual({ text: RESEARCH_PLANNER_CLAIMS_RUBRIC, version: RESEARCH_PLANNER_CLAIMS_RUBRIC_VERSION });
    expect(made.map(({ version }) => version)).toEqual([RESEARCH_PLANNER_RUBRIC_VERSION, `${RESEARCH_PLANNER_RUBRIC_VERSION}+claims.2`,
      `${RESEARCH_PLANNER_RUBRIC_VERSION}+indirect.1`, `${RESEARCH_PLANNER_RUBRIC_VERSION}+claims.2+indirect.1`]);
    expect(new Set(made.map(({ text }) => text)).size).toBe(4);
    const withoutIndirect = (text: string) => INDIRECT_RUBRIC_CHANGES.reduce((back, { from, to }) => back.replace(to, () => from), text);
    const withoutClaims = (text: string) => text.replace(`\n${CLAIMS_RUBRIC}`, "");
    // Each rule's own words come once, or not at all.
    COMBINATIONS.forEach(({ accounting, indirect }, index) => {
      const { text } = made[index]!;
      expect(text.split(CLAIMS_RUBRIC).length - 1).toBe(accounting ? 1 : 0);
      for (const { to } of INDIRECT_RUBRIC_CHANGES) expect(text.split(to).length - 1).toBe(indirect ? 1 : 0);
      expect(withoutIndirect(withoutClaims(text))).toBe(RESEARCH_PLANNER_RUBRIC);
      expect(indirect ? withoutIndirect(text) : text).toBe(accounting ? RESEARCH_PLANNER_CLAIMS_RUBRIC : RESEARCH_PLANNER_RUBRIC);
      expect(accounting ? withoutClaims(text) : text).toBe(made[indirect ? 2 : 0]!.text);
    });
    // The same strings on every call, so the API's prompt cache can serve them.
    COMBINATIONS.forEach((rules, index) => expect(researchPlannerRubric(rules)).toBe(made[index]));
  });
});

// The call -----------------------------------------------------------------------------------------------------------

const KEY = "sk-ant-api03-synthetic-key-for-tests-only-0123456789";
const SOURCE: ResearchPlannerSource = { asked: "does the leaf rinse stop my feet sweating?", researchTarget:
  "Whether a walnut-leaf rinse lowers foot sweating in adults", quickAnswer: "It was never tested.", claims: ["It was never tested."] };
const REPLY = { about: "A rinse made from walnut leaves, used on the feet.", steering_choice: "none", lane: "research",
  person_said_go_on: false, tasks: [{ task: "Find trials of the rinse for sweating", kind: "study_search", could_change: "conclusion",
    sources: 1, claims: [1] }], left_out: [] };
type Body = Anthropic.Beta.MessageCreateParamsNonStreaming;
const reply = (value: unknown) => ({ id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5",
  stop_reason: "end_turn", stop_sequence: null, content: [{ type: "text", text: JSON.stringify(value), citations: null }],
  usage: { input_tokens: 300, output_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } }) as unknown as Anthropic.Beta.BetaMessage;

function apiPlanner(options: { now?: () => number; reply?: () => unknown } = {}) {
  const bodies: Body[] = [];
  const planner = createResearchPlanner({
    env: { ASKRIGOR_RESEARCH_PLANNER: "on", ASKRIGOR_RESEARCH_PLANNER_KEY_FILE: "/run/secret/key" } as NodeJS.ProcessEnv,
    readFile: () => `${KEY}\n`, log: () => undefined,
    client: () => ({ beta: { messages: { create: async (body: Body) => {
      bodies.push(body);
      return reply(options.reply?.() ?? REPLY);
    } } } }),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return { planner, bodies };
}

describe("AskRigor's own planning call with it", () => {
  it("sends each combination's own rubric, with the claims' schema for the claims' rule alone and the same bundle", async () => {
    const { planner, bodies } = apiPlanner();
    for (const { accounting, indirect } of COMBINATIONS) {
      await planner.plan({ ...SOURCE, ...(accounting ? { accounting } : {}), ...(indirect ? { indirect } : {}) }, "account-a");
    }
    expect(bodies.map((body) => (body.system as Array<{ text: string }>)[0]!.text))
      .toEqual(COMBINATIONS.map((rules) => researchPlannerRubric(rules).text));
    expect(bodies.map((body) => (body.output_config as { format: { schema: unknown } }).format.schema))
      .toEqual(COMBINATIONS.map(({ accounting }) => accounting ? RESEARCH_PLANNER_CLAIMS_OUTPUT_SCHEMA : RESEARCH_PLANNER_OUTPUT_SCHEMA));
    for (const body of bodies) expect(body.messages).toEqual(bodies[0]!.messages);
    expect(researchPlannerBundle({ ...SOURCE, indirect: true }, "2026-11-24")).toEqual(researchPlannerBundle(SOURCE, "2026-11-24"));
  });

  it("never serves a plan of one combination as a plan of another, and keeps each for its hour", async () => {
    let at = Date.parse("2026-11-24T10:00:00Z");
    const { planner, bodies } = apiPlanner({ now: () => at });
    const planned = async ({ accounting, indirect }: { accounting: boolean; indirect: boolean }) =>
      await planner.plan({ ...SOURCE, accounting, indirect }, "account-a");
    for (const rules of COMBINATIONS) expect((await planned(rules)).cached).toBe(false);
    expect(bodies).toHaveLength(4);
    for (const rules of COMBINATIONS) expect((await planned(rules)).cached).toBe(true);
    expect(bodies).toHaveLength(4);
    // Left out is off.
    expect((await planner.plan(SOURCE, "account-a")).cached).toBe(true);
    at += 61 * 60 * 1_000;
    expect((await planned(COMBINATIONS[2]!)).cached).toBe(false);
  });

  it("finds the lane of the newest plan kept for these words under any of the combinations", async () => {
    for (const newest of COMBINATIONS) {
      let lane = "research";
      const { planner } = apiPlanner({ reply: () => ({ ...REPLY, lane, tasks: [{ ...REPLY.tasks[0]!, kind: "full_text" }] }) });
      for (const rules of COMBINATIONS.filter((rules) => rules !== newest)) await planner.plan({ ...SOURCE, ...rules }, "account-a");
      expect(await planner.lane(SOURCE.asked, "account-a")).toBe("research");
      lane = "light";
      await planner.plan({ ...SOURCE, ...newest }, "account-a");
      expect(await planner.lane(SOURCE.asked, "account-a")).toBe("light");
      expect(await planner.lane(SOURCE.asked, "account-a", SOURCE.researchTarget)).toBe("light");
      expect(await planner.lane(SOURCE.asked, "account-b")).toBeUndefined();
    }
  });
});

// The switch ---------------------------------------------------------------------------------------------------------

const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};

async function tool(mode: string, options: Partial<RegisterToolsOptions> = {}) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "indirect-evidence-test-secret-0123456789abcdef");
  vi.stubEnv("ASKRIGOR_PLAN_INDIRECT", mode);
  const access = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes") });
  for (const subject of ["auth0|dev", "auth0|person"]) await access.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", access.accountKeyForSubject("auth0|dev"));
  const sources: ResearchPlannerSource[] = [];
  const researchPlanner: ResearchPlanner = { enabled: true, dailyCapUsd: 3, accountDailyCalls: 10, lane: async () => undefined,
    plan: async (source) => {
      sources.push(source);
      return { planning: { status: "planned", plan: researchPlanOf(REPLY, 1, KEY, false, true,
        source.accounting === true ? source.claims : undefined)! }, cached: false, costUsd: 0, milliseconds: 1 };
    } };
  const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
  registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
    handlers.set(name, execute);
  } } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp", researchContributorAccessService: access,
    researchPlanner, ...options });
  const call = async (input: Record<string, unknown>, subject = "auth0|dev") => await handlers.get("manage_research_access")!(input,
    { authInfo: { token: "t", clientId: "c", scopes: ["research:use"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } });
  const register = async (subject = "auth0|dev") => await call({ action: "register_plain_answer", plainAnswer: { researchTarget:
    SOURCE.researchTarget, text: SOURCE.quickAnswer, claims: [...SOURCE.claims] }, later_inputs: { asked: SOURCE.asked! } }, subject);
  return { call, register, sources, access };
}

describe("the switch ASKRIGOR_PLAN_INDIRECT", () => {
  it("is off, trial, dev or on, and off for anything else", () => {
    for (const mode of ["off", "trial", "dev", "on"]) {
      vi.stubEnv("ASKRIGOR_PLAN_INDIRECT", ` ${mode} `);
      expect(planIndirectModeFromEnv()).toBe(mode);
    }
    for (const other of ["", "ON", "true", "1"]) {
      vi.stubEnv("ASKRIGOR_PLAN_INDIRECT", other);
      expect(planIndirectModeFromEnv()).toBe("off");
    }
  });

  it("asks the planner for it on a dev account alone, as its mode says, and never of another account, which AskRigor does not plan for", async () => {
    for (const [mode, expected] of [["", undefined], ["off", undefined], ["trial", undefined], ["dev", true], ["on", true]] as const) {
      const { register, sources } = await tool(mode);
      expect((await register()).isError).not.toBe(true);
      expect(sources[0]!.indirect, mode).toBe(expected);
      if (expected === undefined) expect(sources[0]).not.toHaveProperty("indirect");
      await register("auth0|person");
      expect(sources, mode).toHaveLength(1);
    }
  });

  it("holds in mode trial only while the account's window has it on, alone or with the others", async () => {
    let at = Date.parse("2026-11-24T10:00:00Z");
    const windows = createResearchTrialWindows(() => at);
    const { call, register, sources } = await tool("trial", { researchTrialWindows: windows });
    vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "trial");
    const set = async (claimAccounting: boolean, indirectEvidence: boolean) => await call({ action: "set_research_trial",
      later_inputs: { researchTrial: { claimAccounting, hrpCore: false, indirectEvidence, minutes: 20 } } });
    const asks = async () => {
      await register();
      const { accounting, indirect } = sources.at(-1)!;
      return { accounting: accounting === true, indirect: indirect === true };
    };
    expect(await asks()).toEqual({ accounting: false, indirect: false });
    const opened = await set(false, true);
    expect(opened.structuredContent).toMatchObject({ ok: true, researchTrial: { claimAccounting: false, hrpCore: false, indirectEvidence: true } });
    expect((opened.content[0] as { text: string }).text).toContain("AskRigor's own plan reaching for evidence one step away is on");
    expect(await asks()).toEqual({ accounting: false, indirect: true });
    await set(true, true);
    expect(await asks()).toEqual({ accounting: true, indirect: true });
    await set(true, false);
    expect(await asks()).toEqual({ accounting: true, indirect: false });
    await set(false, true);
    at += 20 * 60_000;
    expect(await asks()).toEqual({ accounting: false, indirect: false });
  });

  it("changes nothing else of a registration: with the same plan, the same result", async () => {
    const result = async (mode: string) => {
      const { register } = await tool(mode);
      const given = await register();
      const { research_receipt: receipt } = given.structuredContent as { research_receipt: string };
      return JSON.stringify(given).replaceAll(receipt, "R");
    };
    expect(await result("on")).toBe(await result("off"));
  });
});
