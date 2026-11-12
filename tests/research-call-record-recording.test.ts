import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryResearchCallRecordStore, InMemoryResearchContributorAccessStore,
  ResearchContributorAccessService } from "@askrigor/evidence-repository";
import { describe, expect, it, vi } from "vitest";
import { forTextClients, waitForPendingCallRecords } from "../apps/research-mcp/src/tool-result.js";
import { RESEARCH_USE_SCOPE } from "../apps/research-mcp/src/oauth-resource-server.js";
import { researchCallRecordingOptions, startResearchCallRecordSweep } from "../apps/research-mcp/src/research-call-recording.js";

const subject = "synthetic-private-subject-not-to-retain";
const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
  identitySecret: Buffer.alloc(32, 19) });
const accountKey = service.accountKeyForSubject(subject);
const extra = () => ({ authInfo: { token: "private-token", clientId: "private-client", scopes: [RESEARCH_USE_SCOPE],
  expiresAt: Date.now() / 1_000 + 300, extra: { subject } } });
const answered: CallToolResult = { content: [{ type: "text", text: "private result" }], structuredContent: { ok: true } };
const setup = () => {
  const store = new InMemoryResearchCallRecordStore();
  return { store, recording: researchCallRecordingOptions(store, service, "/mcp") };
};

describe("background call recording", () => {
  it("sweeps hourly on an unref'd timer and silently handles a sweep error", async () => {
    vi.useFakeTimers();
    const store = new InMemoryResearchCallRecordStore();
    const sweep = vi.spyOn(store, "sweep").mockRejectedValueOnce(new Error("private sweep failure"));
    const timer = startResearchCallRecordSweep(store);
    try {
      expect(timer.hasRef()).toBe(false);
      await vi.advanceTimersByTimeAsync(3_599_999);
      expect(sweep).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(sweep).toHaveBeenCalledExactlyOnceWith(expect.any(Date));
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(sweep).toHaveBeenCalledTimes(2);
    } finally { clearInterval(timer); vi.useRealTimers(); vi.restoreAllMocks(); }
  });
  it.each([
    [{ error: { code: "research_access_required" } }, "research_access_required"],
    [{ error: { code: "bad code private marker" }, code: "fixed_code" }, "fixed_code"],
    [{ error: { code: 9 }, code: "fallback_code" }, "fallback_code"],
    [{ error: { code: "BAD" }, code: "invalid/code" }, "other"],
    [{}, "other"],
  ])("records refused results using only a fixed-shaped code: %j", async (structuredContent, code) => {
    const { store, recording } = setup();
    const result: CallToolResult = { ...answered, structuredContent, isError: true };
    await forTextClients("load_protocol", async () => result, recording)({}, extra());
    await waitForPendingCallRecords(store);
    expect(await store.list(accountKey, new Date())).toEqual([expect.objectContaining({
      tool: "load_protocol", action: null, outcome: "refused", code,
    })]);
  });

  it("preserves the exact thrown error and records failed without its content", async () => {
    const { store, recording } = setup();
    const error = new Error("private exception marker");
    await expect(forTextClients("load_protocol", async () => { throw error; }, recording)({}, extra())).rejects.toBe(error);
    await waitForPendingCallRecords(store);
    const rows = await store.list(accountKey, new Date());
    expect(rows).toEqual([expect.objectContaining({ outcome: "failed", code: null })]);
    expect(JSON.stringify(rows)).not.toContain(error.message);
  });

  it.each(["inspect", "list_calls", "share_report", "invented_private_action", 17, null])(
    "keeps only an action in the runtime enum: %s", async (action) => {
      const { store, recording } = setup();
      await forTextClients("manage_research_access", async () => answered, recording)({ action }, extra());
      await waitForPendingCallRecords(store);
      expect((await store.list(accountKey, new Date()))[0]!.action)
        .toBe(["inspect", "list_calls", "share_report"].includes(String(action)) ? action : "other");
    });

  it("retains no argument, result, identity or header", async () => {
    const { store, recording } = setup();
    await forTextClients("manage_research_access", async () => answered, recording)({
      action: "inspect", marker: "distinctive-call-argument-marker",
    }, { ...extra(), _meta: { "openai/locale": "private-meta" },
      requestInfo: { headers: { "user-agent": "private-agent", "x-private": "private-header" } } });
    await waitForPendingCallRecords(store);
    const rows = await store.list(accountKey, new Date());
    expect(rows).toEqual([expect.objectContaining({ action: "inspect", chatgpt: true, code: null, outcome: "answered" })]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["accountKey", "receivedAt", "tool", "action", "route", "chatgpt",
      "outcome", "code", "durationMs"].sort());
    const encoded = JSON.stringify(rows);
    for (const marker of [subject, "private-token", "private-client", "private-meta", "private-agent", "private-header",
      "distinctive-call-argument-marker", "private result"]) expect(encoded).not.toContain(marker);
  });

  it.each([undefined, {}, { authInfo: { ...extra().authInfo, expiresAt: undefined } },
    { authInfo: { ...extra().authInfo, expiresAt: 0 } }, { authInfo: { ...extra().authInfo, scopes: [] } },
    { authInfo: { ...extra().authInfo, extra: { subject: 123 } } },
    { authInfo: { ...extra().authInfo, extra: { subject: "" } } },
    { ...extra(), surface: "action" }])("records nothing without a valid MCP sign-in: %j", async (request) => {
      const { store, recording } = setup();
      await forTextClients("load_protocol", async () => answered, recording)({}, request);
      await waitForPendingCallRecords(store);
      expect(await store.list(accountKey, new Date())).toEqual([]);
    });

  it.each([false, true])("returns the same result with or without a store (ChatGPT: %s)", async (chatgpt) => {
    const { store, recording } = setup();
    const request = { ...extra(), ...(chatgpt ? { _meta: { "openai/locale": "en" } } : {}) };
    const without = await forTextClients("load_protocol", async () => answered)({}, request);
    const withStore = await forTextClients("load_protocol", async () => answered, recording)({}, request);
    expect(withStore).toEqual(without);
    if (chatgpt) expect(withStore).toBe(answered);
    await waitForPendingCallRecords(store);
  });

  it("does not await a slow write and silently swallows synchronous and asynchronous store failures", async () => {
    const { store, recording } = setup();
    let release!: () => void;
    const write = vi.spyOn(store, "record").mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }))
      .mockImplementationOnce(() => { throw new Error("private failure"); })
      .mockRejectedValueOnce(new Error("private rejection"));
    const errorLog = vi.spyOn(console, "error");
    const warnLog = vi.spyOn(console, "warn");
    const infoLog = vi.spyOn(console, "info");
    const log = vi.spyOn(console, "log");
    try {
      const handler = forTextClients("load_protocol", async () => answered, recording);
      expect(await handler({}, extra())).toEqual(await forTextClients("load_protocol", async () => answered)({}, extra()));
      expect(write).toHaveBeenCalledOnce();
      release();
      await handler({}, extra());
      await handler({}, extra());
      await waitForPendingCallRecords(store);
      for (const spy of [errorLog, warnLog, infoLog, log]) expect(spy).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); }
  });

  // Owner answer 289a: an answered plan_research call also keeps the decision AskRigor's own result made, ask or go_on;
  // nothing the person or the AI wrote, and no other call, ever stores one.
  it.each(["ask", "go_on"] as const)("keeps plan_research's decision from its own result: %s", async (next) => {
    const { store, recording } = setup();
    const result: CallToolResult = { content: [{ type: "text", text: "private menu text" }],
      structuredContent: { ok: true, researchMenu: { next, tasks: [] }, next_step: "private step" } };
    await forTextClients("manage_research_access", async () => result, recording)({ action: "plan_research",
      later_inputs: { researchMenu: { research_target: "private target marker", next: "go_on" } } }, extra());
    await waitForPendingCallRecords(store);
    const rows = await store.list(accountKey, new Date());
    expect(rows).toEqual([expect.objectContaining({ action: "plan_research", outcome: "answered", planNext: next })]);
    expect(JSON.stringify(rows)).not.toMatch(/private target marker|private menu text|private step/u);
  });

  it("stores no decision for another call, a refused plan_research, a value of its own, or one only the input gave", async () => {
    const menu = (next: unknown): CallToolResult => ({ content: [{ type: "text", text: "x" }],
      structuredContent: { ok: true, researchMenu: { next } } });
    const cases: Array<[string, Record<string, unknown>, CallToolResult]> = [
      ["manage_research_access", { action: "inspect" }, menu("ask")],
      ["manage_research_access", { action: "register_plain_answer" }, menu("go_on")],
      ["load_protocol", { action: "plan_research" }, menu("ask")],
      ["manage_research_access", { action: "plan_research" }, { ...menu("ask"), isError: true }],
      ["manage_research_access", { action: "plan_research" }, menu("maybe")],
      ["manage_research_access", { action: "plan_research" }, menu({ next: "ask" })],
      ["manage_research_access", { action: "plan_research", researchMenu: { next: "ask" }, next: "ask" }, answered],
    ];
    for (const [tool, input, result] of cases) {
      const { store, recording } = setup();
      await forTextClients(tool, async () => result, recording)(input, extra());
      await waitForPendingCallRecords(store);
      const rows = await store.list(accountKey, new Date());
      expect(rows, JSON.stringify([tool, input])).toHaveLength(1);
      expect(rows[0], JSON.stringify([tool, input])).not.toHaveProperty("planNext");
    }
  });

  it.each([[0, 399.6, 400], [20, 19, 0], [0, 99_999_999, 86_400_000]])(
    "rounds and clamps duration (%s, %s)", async (start, end, expected) => {
      const { store, recording } = setup();
      const clock = vi.spyOn(performance, "now").mockReturnValueOnce(start).mockReturnValueOnce(end);
      try {
        await forTextClients("load_protocol", async () => answered, recording)({}, extra());
        await waitForPendingCallRecords(store);
        expect((await store.list(accountKey, new Date()))[0]!.durationMs).toBe(expected);
      } finally { clock.mockRestore(); }
    });
});
