// Owner answers 413a and 412a (24 November 2026): two changes to research, each behind a switch of its own, and a test
// window that turns either on for one dev account for at most two hours, in memory only, so the same question can be
// asked with the change and without it. Off by default: every text and result is then as before.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
} from "@askrigor/evidence-repository";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLAIMS_ON_THE_MENU } from "../apps/research-mcp/src/claim-accounting.js";
import { claimAccountingModeFromEnv, hrpCoreModeFromEnv } from "../apps/research-mcp/src/config.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { manageResearchAccessInputSchema, manageResearchAccessOutputSchema, plainAnswerRequest }
  from "../apps/research-mcp/src/research-contributor-access-tool.js";
import {
  RESEARCH_SWITCH_MODES,
  RESEARCH_TRIAL_MAX_MINUTES,
  TRIAL_OFF_NOTHING_CHANGED,
  createResearchTrialWindows,
  researchSwitchMode,
  researchTrialText,
  switchHolds,
  type ResearchTrialWindows,
} from "../apps/research-mcp/src/research-trial.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const START = Date.parse("2026-11-24T10:00:00Z");
const MINUTE = 60_000;

describe("the two switches' modes", () => {
  it("are off, trial, dev or on, and off for anything else", () => {
    expect(RESEARCH_SWITCH_MODES).toEqual(["off", "trial", "dev", "on"]);
    for (const mode of RESEARCH_SWITCH_MODES) expect(researchSwitchMode(` ${mode} `)).toBe(mode);
    for (const other of [undefined, "", " ", "ON", "true", "1", "enabled", "shadow", "trial,dev"]) {
      expect(researchSwitchMode(other)).toBe("off");
    }
    vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "dev");
    vi.stubEnv("ASKRIGOR_HRP_CORE", "trial");
    expect([claimAccountingModeFromEnv(), hrpCoreModeFromEnv()]).toEqual(["dev", "trial"]);
    vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", "yes");
    vi.stubEnv("ASKRIGOR_HRP_CORE", "");
    expect([claimAccountingModeFromEnv(), hrpCoreModeFromEnv()]).toEqual(["off", "off"]);
  });

  it("hold for an account by mode, whether it is a dev account, and its window", () => {
    for (const dev of [false, true]) {
      for (const inTrial of [false, true]) {
        expect(switchHolds("off", dev, inTrial)).toBe(false);
        expect(switchHolds("on", dev, inTrial)).toBe(true);
        expect(switchHolds("dev", dev, inTrial)).toBe(dev);
        expect(switchHolds("trial", dev, inTrial)).toBe(dev && inTrial);
      }
    }
  });
});

describe("a dev account's test window", () => {
  it("runs for 1 to 120 whole minutes, for the account it was set on alone, and ends at once with 0", () => {
    let at = START;
    const windows = createResearchTrialWindows(() => at);
    expect(windows.window("account-a")).toBeUndefined();
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: false, minutes: 30 }))
      .toEqual({ claimAccounting: true, hrpCore: false, until: START + 30 * MINUTE });
    expect(windows.window("account-a")).toEqual({ claimAccounting: true, hrpCore: false, until: START + 30 * MINUTE });
    expect(windows.window("account-b")).toBeUndefined();
    at += 30 * MINUTE - 1;
    expect(windows.window("account-a")).toBeDefined();
    at += 1;
    expect(windows.window("account-a")).toBeUndefined();
    windows.set("account-a", { claimAccounting: false, hrpCore: true, minutes: 1 });
    expect(windows.window("account-a")).toMatchObject({ claimAccounting: false, hrpCore: true });
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 0 })).toBeUndefined();
    expect(windows.window("account-a")).toBeUndefined();
    for (const minutes of [-1, 121, 2.5, Number.NaN]) {
      expect(() => windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes })).toThrow(RangeError);
    }
    expect(windows.window("account-a")).toBeUndefined();
  });

  it("keeps its start when it is set again while it runs, so it never passes two hours", () => {
    let at = START;
    const windows = createResearchTrialWindows(() => at);
    windows.set("account-a", { claimAccounting: true, hrpCore: false, minutes: 100 });
    at += 60 * MINUTE;
    // Set again for longer, and with the other switch on: at most two hours after it began.
    expect(windows.set("account-a", { claimAccounting: false, hrpCore: true, minutes: RESEARCH_TRIAL_MAX_MINUTES }))
      .toEqual({ claimAccounting: false, hrpCore: true, until: START + 120 * MINUTE });
    at += 59 * MINUTE;
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 90 }))
      .toMatchObject({ until: START + 120 * MINUTE });
    // Set again for less, it ends sooner; after it ended, a new one has a start of its own.
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 0 })).toBeUndefined();
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 90 }))
      .toMatchObject({ until: at + 90 * MINUTE });
    at += 5 * MINUTE;
    expect(windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 10 }))
      .toMatchObject({ until: at + 10 * MINUTE });
  });

  it("leaves memory when it ends, and a new process starts with none", () => {
    vi.useFakeTimers({ now: START });
    const windows = createResearchTrialWindows();
    windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 10 });
    windows.set("account-a", { claimAccounting: true, hrpCore: false, minutes: 20 });
    // One timer for the account, however often the window is set.
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(19 * MINUTE);
    expect(windows.window("account-a")).toMatchObject({ hrpCore: false });
    vi.advanceTimersByTime(2 * MINUTE);
    expect(windows.window("account-a")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 10 });
    expect(createResearchTrialWindows().window("account-a")).toBeUndefined();
    windows.set("account-a", { claimAccounting: true, hrpCore: true, minutes: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

const AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true as const,
  prohibitedPrivateAndRawContentExcluded: true as const,
  proposalReviewAndNoAuthorityAcknowledged: true as const,
  paidPrivateAlternativeAcknowledged: true as const,
};
type Result = CallToolResult & { structuredContent?: Record<string, unknown> };
const words = (result: Result): string => result.content.map((block) => block.type === "text" ? block.text : "").join("\n");
/** The tool's own text, before the copy of the structured content that apps reading only text get. */
const said = (result: Result): string => (result.content[0] as { text: string }).text;

async function tool(modes: { claims?: string; core?: string } = {}, windows: ResearchTrialWindows = createResearchTrialWindows()) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "research-trial-test-secret-0123456789abcdef");
  vi.stubEnv("ASKRIGOR_CLAIM_ACCOUNTING", modes.claims ?? "");
  vi.stubEnv("ASKRIGOR_HRP_CORE", modes.core ?? "");
  const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
    identitySecret: new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes") });
  for (const subject of ["auth0|dev", "auth0|dev2", "auth0|person"]) await service.acceptFreeContributor(subject, AGREEMENT);
  vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", ["auth0|dev", "auth0|dev2"].map((subject) => service.accountKeyForSubject(subject)).join(","));
  const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
  registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown, extra?: unknown) => Promise<CallToolResult>) => {
    handlers.set(name, execute);
  } } as unknown as McpServer, { researchAccessRequired: true, mcpSurface: "/mcp", researchContributorAccessService: service,
    researchTrialWindows: windows } satisfies RegisterToolsOptions);
  const call = async (input: Record<string, unknown>, subject = "auth0|dev"): Promise<Result> =>
    await handlers.get("manage_research_access")!(input, { authInfo: { token: "t", clientId: "c", scopes: ["research:use"],
      expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } }) as Result;
  const set = (researchTrial: unknown, subject?: string) => call({ action: "set_research_trial", later_inputs: { researchTrial } }, subject);
  return { call, set, service, windows };
}
const ON = { claimAccounting: true, hrpCore: true, minutes: 30 };

describe("set_research_trial", () => {
  it("says what is on and until when, that a restart ends it, and that it is for a test round", async () => {
    let at = START;
    const { set } = await tool({ claims: "trial", core: "trial" }, createResearchTrialWindows(() => at));
    const opened = await set({ claimAccounting: true, hrpCore: false, minutes: 45 });
    expect(opened.isError, words(opened)).not.toBe(true);
    expect(opened.structuredContent).toEqual({ ok: true,
      researchTrial: { claimAccounting: true, hrpCore: false, until: "2026-11-24T10:45:00.000Z" } });
    const text = words(opened);
    for (const part of ["Test window for this dev account, for a test round, until 10:45 UTC (2026-11-24T10:45:00.000Z)",
      "the menu's accounting of the quick answer's claims is on; HRP's core with the registration of the quick answer is off",
      "0 minutes ends it now", "a restart of AskRigor's server ends it too", "at most 120 minutes after it"]) {
      expect(text).toContain(part);
    }
    at += 10 * MINUTE;
    const ended = await set({ claimAccounting: true, hrpCore: true, minutes: 0 });
    expect(ended.structuredContent).toEqual({ ok: true, researchTrial: { claimAccounting: false, hrpCore: false, until: null } });
    expect(said(ended)).toBe("No test window runs for this dev account now: the menu's accounting of the quick answer's " +
      "claims is off, with no window; HRP's core with the registration of the quick answer is off, with no window.");
  });

  it("says of a switch the server sets itself that the window does not change it", async () => {
    const until = START + 30 * MINUTE;
    const window = { claimAccounting: true, hrpCore: true, until };
    expect(researchTrialText({ claimAccounting: "trial", hrpCore: "off" }, window)).toContain("claims is on; HRP's core with " +
      "the registration of the quick answer is off, by this server's own setting (off), which a window does not change.");
    expect(researchTrialText({ claimAccounting: "on", hrpCore: "trial" }, { ...window, claimAccounting: false, hrpCore: false }))
      .toContain("claims is on, by this server's own setting (on), which a window does not change; HRP's core with the " +
        "registration of the quick answer is off.");
    const { set } = await tool({ claims: "trial", core: "dev" });
    expect((await set({ claimAccounting: true, hrpCore: false, minutes: 5 })).structuredContent).toMatchObject({
      researchTrial: { claimAccounting: true, hrpCore: true } });
  });

  it("refuses another account, a call without its input or with it on another action, and a server with no trial mode", async () => {
    const { call, set, windows, service } = await tool({ claims: "trial", core: "trial" });
    const person = await set(ON, "auth0|person");
    expect(person.isError).toBe(true);
    expect(person.structuredContent).toMatchObject({ ok: false, error: { code: "dev_account_required" } });
    for (const input of [{ action: "set_research_trial" }, { action: "inspect", later_inputs: { researchTrial: ON } },
      { action: "list_calls", later_inputs: { researchTrial: ON } }]) {
      expect((await call(input)).structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request",
        message: "later_inputs.researchTrial goes only with action set_research_trial, which needs it." } });
    }
    for (const wrong of [{ ...ON, minutes: 121 }, { ...ON, minutes: -1 }, { ...ON, minutes: 2.5 }, { ...ON, minutes: "30" },
      { claimAccounting: true, minutes: 30 }, { ...ON, hrpCore: "yes" }, { ...ON, other: 1 }, "on", 30]) {
      const refused = await set(wrong);
      expect(refused.isError, JSON.stringify(wrong)).toBe(true);
      expect(refused._meta?.["askrigor/errorCode"], JSON.stringify(wrong)).toBe("invalid_input");
      expect(words(refused)).toContain("later_inputs.researchTrial");
    }
    for (const subject of ["auth0|dev", "auth0|person"]) expect(windows.window(service.accountKeyForSubject(subject))).toBeUndefined();
    for (const [claims, core] of [["", ""], ["off", "dev"], ["on", "off"], ["dev", "on"]] as const) {
      const off = await tool({ claims, core });
      const nothing = await off.set(ON);
      expect(nothing.isError).toBe(true);
      expect(nothing.structuredContent).toEqual({ ok: false, error: { code: "trial_off", message: TRIAL_OFF_NOTHING_CHANGED } });
      expect(said(nothing)).toBe(TRIAL_OFF_NOTHING_CHANGED);
      expect(off.windows.window(off.service.accountKeyForSubject("auth0|dev"))).toBeUndefined();
    }
  });

  it("is a runtime action and result only: the published ones are as they were", () => {
    expect(manageResearchAccessInputSchema.shape.action.options).toContain("set_research_trial");
    expect(Object.keys(manageResearchAccessOutputSchema.shape)).not.toContain("researchTrial");
    expect(Object.keys(manageResearchAccessInputSchema.shape)).not.toContain("researchTrial");
  });
});

describe("a switch in mode trial", () => {
  const asks = async (call: (input: Record<string, unknown>, subject?: string) => Promise<Result>, subject?: string) =>
    words(await call({ action: "inspect" }, subject)).includes(CLAIMS_ON_THE_MENU);

  it("holds for a dev account only while its window has it on, and inspect says nothing of the window", async () => {
    let at = START;
    const { call, set } = await tool({ claims: "trial", core: "trial" }, createResearchTrialWindows(() => at));
    const before = words(await call({ action: "inspect" }));
    expect(before).toContain(plainAnswerRequest(true));
    await set({ claimAccounting: true, hrpCore: false, minutes: 20 });
    const during = await call({ action: "inspect" });
    expect(words(during)).toContain(plainAnswerRequest(true, true));
    // Besides the words the switch itself brings, inspect is as it was: no word of a window or a trial.
    expect(words(during).replace(plainAnswerRequest(true, true), plainAnswerRequest(true))).toBe(before);
    expect(JSON.stringify(during.structuredContent)).not.toMatch(/trial|window/iu);
    expect(await asks(call, "auth0|dev2")).toBe(false);
    expect(await asks(call, "auth0|person")).toBe(false);
    // Off within the window, then on again; then it ends by itself.
    await set({ claimAccounting: false, hrpCore: true, minutes: 20 });
    expect(await asks(call)).toBe(false);
    await set({ claimAccounting: true, hrpCore: false, minutes: 20 });
    expect(await asks(call)).toBe(true);
    at += 20 * MINUTE;
    expect(await asks(call)).toBe(false);
  });

  it("is off in mode off, on for every dev account in mode dev and for every account in mode on, window or none", async () => {
    const holds = async (claims: string) => {
      const { call, set } = await tool({ claims, core: "trial" });
      const before = await Promise.all(["auth0|dev", "auth0|dev2", "auth0|person"].map((subject) => asks(call, subject)));
      await set({ claimAccounting: !before[0], hrpCore: false, minutes: 20 });
      expect(await Promise.all(["auth0|dev", "auth0|dev2", "auth0|person"].map((subject) => asks(call, subject)))).toEqual(before);
      return before;
    };
    expect(await holds("off")).toEqual([false, false, false]);
    expect(await holds("dev")).toEqual([true, true, false]);
    expect(await holds("on")).toEqual([true, true, true]);
  });
});
