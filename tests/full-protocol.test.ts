import { readFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchCallRecordStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devAccountKeysFromEnv } from "../apps/research-mcp/src/config.js";
import { FULL_PROTOCOL_GEMINI, FULL_PROTOCOL_INSPECT, FULL_PROTOCOL_INSPECT_WITH_CORE }
  from "../apps/research-mcp/src/full-protocol.js";
import { registerTools } from "../apps/research-mcp/src/register-tools.js";
import { createManageResearchAccessHandler, manageResearchAccessOutputSchema }
  from "../apps/research-mcp/src/research-contributor-access-tool.js";
import type { ResearchOperationHandler } from "../apps/research-mcp/src/research-operation.js";
import type { ResearchPlanner } from "../apps/research-mcp/src/research-planner.js";
import { createResearchTrialWindows } from "../apps/research-mcp/src/research-trial.js";
import { forTextClients } from "../apps/research-mcp/src/tool-result.js";
import { toolListNotice } from "../apps/research-mcp/src/tool-list-currency.js";

const FREE = "auth0|free";
const PAID = "auth0|paid";
const WAITING = "auth0|waiting";
const CURRENT = "a".repeat(16);
const STALE = "b".repeat(16);
const INSPECT = { action: "inspect", tool_list_version: CURRENT };
const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;
const TRIAL = { claimAccounting: false, hrpCore: false, indirectEvidence: false, fullProtocol: true, minutes: 10 };
const PLAN_TARGET = "Whether a synthetic example has enough supporting evidence to verify its conclusion";
const accessSentence = "AskRigor research access is active in free contributor mode.";

beforeEach(() => {
  vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "off");
  vi.stubEnv("ASKRIGOR_HRP_CORE", "off");
  vi.stubEnv("ASKRIGOR_PLAN_INDIRECT", "off");
  vi.stubEnv("ASKRIGOR_SAFETY_LIMITS", "off");
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "synthetic-full-protocol-secret-for-tests-only");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function auth(subject: string, chatgpt: boolean) {
  return {
    authInfo: { token: "token", clientId: "client", scopes: ["research:use"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } },
    ...(chatgpt ? { _meta: { "openai/test": true } } : {}),
  };
}

function firstText(result: CallToolResult) {
  const block = result.content[0];
  expect(block?.type).toBe("text");
  return block?.type === "text" ? block.text : "";
}

async function accountTool(plannerEnabled = false) {
  const store = new InMemoryResearchContributorAccessStore();
  const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 5) });
  await service.acceptFreeContributor(FREE, AGREEMENT);
  store.grantPrivateEntitlement({
    entitlementId: "aa9e8409-ff2a-4f75-9e77-ed1b7f7f03c8", accountKey: service.accountKeyForSubject(PAID),
    status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null,
    grantedAt: new Date().toISOString(), expiresAt: null, revokedAt: null,
  });
  await service.activatePaidPrivate(PAID);
  const researchPlanner: ResearchPlanner = {
    enabled: plannerEnabled,
    async plan() { throw new Error("The inspect test must not call the planner"); },
    async lane() { return undefined; },
  };
  const callRecord = new InMemoryResearchCallRecordStore();
  const windows = createResearchTrialWindows();
  let execute: ResearchOperationHandler | undefined;
  registerTools({ registerTool(name: string, _config: unknown, handler: ResearchOperationHandler) {
    if (name === "manage_research_access") execute = handler;
  } } as unknown as McpServer, {
    mcpSurface: "/mcp", researchContributorAccessService: service, researchCallRecord: callRecord,
    researchPlanner, toolListVersion: CURRENT, researchTrialWindows: windows,
  });
  const baseline = forTextClients("manage_research_access", createManageResearchAccessHandler({
    service, callRecord, toolListVersion: CURRENT, devAccountKeys: devAccountKeysFromEnv,
    researchPlanner: () => researchPlanner, plainAnswer: { sign: () => undefined },
  }));
  return {
    key: (subject: string) => service.accountKeyForSubject(subject),
    call: (input: Record<string, unknown>, subject = FREE, chatgpt = false) => execute!(input, auth(subject, chatgpt)),
    baseline,
    windows,
  };
}

describe("the full-protocol inspect line", () => {
  it("preserves all 48 inspect variants in each disabled setting", async () => {
    for (const planner of [false, true]) {
      const { call, baseline, key } = await accountTool(planner);
      for (const subject of [FREE, PAID, WAITING]) {
        for (const dev of [false, true]) {
          vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", dev ? key(subject) : "");
          for (const chatgpt of [false, true]) {
            for (const tool_list_version of [CURRENT, STALE]) {
              const input = { action: "inspect", tool_list_version };
              const expected = await baseline(input, auth(subject, chatgpt));
              for (const mode of [undefined, "off", "bogus", "trial"]) {
                vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", mode);
                const actual = await call(input, subject, chatgpt);
                expect(actual, JSON.stringify({ planner, subject, dev, chatgpt, tool_list_version, mode })).toEqual(expected);
                expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
              }
            }
          }
        }
      }
    }
  });

  it("follows the dev account's own trial window only while it runs", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-28T11:20:00Z") });
    const { call, key, windows } = await accountTool();
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "trial");
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", [key(FREE), key(PAID)].join(","));
    const hasLine = async (subject = FREE) => (await call(INSPECT, subject)).structuredContent?.full_protocol_line;
    expect(await hasLine()).toBeUndefined();
    const other = await call({ action: "set_research_trial", later_inputs: { researchTrial: TRIAL } }, PAID);
    expect(other.structuredContent?.researchTrial).toMatchObject({ fullProtocol: true });
    expect(await hasLine(PAID)).toBe(true);
    expect(await hasLine()).toBeUndefined();
    await call({ action: "set_research_trial", later_inputs: { researchTrial: TRIAL } });
    expect(await hasLine()).toBe(true);
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", key(PAID));
    expect(windows.window(key(FREE))?.fullProtocol).toBe(true);
    expect(await hasLine()).toBeUndefined();
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", key(FREE));
    vi.advanceTimersByTime(10 * 60_000);
    expect(await hasLine()).toBeUndefined();
  });

  it("uses dev and on modes for active accounts, and leaves the notice path untouched", async () => {
    const { call, key } = await accountTool();
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", [key(FREE), key(WAITING)].join(","));
    const waiting = await call(INSPECT, WAITING);
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "dev");
    expect((await call(INSPECT)).structuredContent?.full_protocol_line).toBe(true);
    expect((await call(INSPECT, PAID)).structuredContent?.full_protocol_line).toBeUndefined();
    expect(await call(INSPECT, WAITING)).toEqual(waiting);
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "on");
    expect((await call(INSPECT)).structuredContent?.full_protocol_line).toBe(true);
    expect((await call(INSPECT, PAID)).structuredContent?.full_protocol_line).toBe(true);
    expect(await call(INSPECT, WAITING)).toEqual(waiting);
  });

  it("places the line between the stale notice and access sentence and first in next_step", async () => {
    const { call } = await accountTool();
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", "");
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "on");
    const result = await call({ ...INSPECT, tool_list_version: STALE });
    expect(firstText(result).startsWith(`${toolListNotice(STALE, CURRENT)} ${FULL_PROTOCOL_INSPECT} ${accessSentence}`)).toBe(true);
    expect(result.structuredContent).toMatchObject({ full_protocol_line: true, next_step: expect.stringMatching(/^Follow every step/u) });
    expect(String(result.structuredContent?.next_step).startsWith(`${FULL_PROTOCOL_INSPECT} `)).toBe(true);
    expect(manageResearchAccessOutputSchema.shape).not.toHaveProperty("full_protocol_line");

    vi.stubEnv("ASKRIGOR_HRP_CORE", "on");
    const withCore = await call(INSPECT, FREE, true);
    expect(firstText(withCore).startsWith(`${FULL_PROTOCOL_INSPECT_WITH_CORE} ${accessSentence}`)).toBe(true);
    expect(withCore.structuredContent).toMatchObject({ full_protocol_line: true, next_step: FULL_PROTOCOL_INSPECT_WITH_CORE });
  });

  it("appears only on inspect, never on registration, planning or the call record", async () => {
    const { call } = await accountTool();
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", "");
    vi.stubEnv("ASKRIGOR_FULL_PROTOCOL", "on");
    const claim = "The example has a checkable conclusion.";
    const registered = await call({ ...INSPECT, action: "register_plain_answer", plainAnswer: {
      researchTarget: PLAN_TARGET, text: claim, claims: [claim],
    } });
    expect(registered.structuredContent?.research_receipt, firstText(registered)).toEqual(expect.any(String));
    const planned = await call({ ...INSPECT, action: "plan_research", later_inputs: { researchMenu: {
      research_target: PLAN_TARGET, plain_answer_receipt: registered.structuredContent?.research_receipt,
      steering_could_help: false, tasks: [{ task: "Check the origin of the example", kind: "study_search", could_change: "conclusion" }],
    } } });
    for (const result of [registered, planned, await call({ ...INSPECT, action: "list_calls" })]) {
      expect(result.isError, firstText(result)).not.toBe(true);
      expect(result.structuredContent).not.toHaveProperty("full_protocol_line");
      expect(JSON.stringify(result)).not.toContain("Follow every step of the AskRigor protocol precisely.");
    }
  });
});

it("names only tools published in Gemini's frozen catalog", () => {
  const catalog = JSON.parse(readFileSync(new URL("./fixtures/frozen-tool-lists/gemini.json", import.meta.url), "utf8")) as
    Array<{ name: string }>;
  const namedTools = [...FULL_PROTOCOL_GEMINI.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/gu)].map(([name]) => name);
  expect(namedTools).toEqual(["load_protocol"]);
  expect(catalog.map(({ name }) => name)).toEqual(expect.arrayContaining(namedTools));
});
