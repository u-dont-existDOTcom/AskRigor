import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryResearchCallRecordStore, InMemoryResearchContributorAccessStore, RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService, type ResearchCallRecordEntry } from "@askrigor/evidence-repository";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  CALL_RECORD_SENTENCE, createManageResearchAccessHandler,
} from "../apps/research-mcp/src/research-contributor-access-tool.js";
import { RESEARCH_USE_SCOPE, createJwtOAuthResourceServer } from "../apps/research-mcp/src/oauth-resource-server.js";
import { clientResultBytes, forTextClients, waitForPendingCallRecords } from "../apps/research-mcp/src/tool-result.js";
import { researchCallRecordingOptions } from "../apps/research-mcp/src/research-call-recording.js";
import { MCP_RESULT_MAX_BYTES } from "../apps/research-mcp/src/config.js";

const clients: Client[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

const issuerUrl = new URL("https://identity.call-record.example/");
const primary = new URL("https://mcp.call-record.example/mcp");
const claude = new URL("https://mcp.call-record.example/mcp/claude");
const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
  identitySecret: Buffer.alloc(32, 23) });
const subject = "synthetic-call-record-unenrolled";
const ownKey = service.accountKeyForSubject(subject);
const auth = { authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: [RESEARCH_USE_SCOPE],
  expiresAt: Date.now() / 1_000 + 3_600, extra: { subject } } };

async function start(store?: InMemoryResearchCallRecordStore) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...await exportJWK(publicKey), kid: "call-record-test" };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const server = createAskRigorHttpServer({ publicServerEnabled: true, researchCallRecord: store,
    researchContributorAccessService: service,
    oauthResourceServer: createJwtOAuthResourceServer({ resourceUrl: primary, issuerUrl, jwks,
      allowedClientIds: ["synthetic-client"] }),
    claudeOAuthResourceServer: createJwtOAuthResourceServer({ resourceUrl: claude, issuerUrl, jwks,
      allowedClientIds: ["synthetic-client"] }),
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  return async (route: ResearchCallRecordEntry["route"], signedIn = true, userAgent?: string) => {
    const token = await new SignJWT({ iss: issuerUrl.href, aud: route === "/mcp/claude" ? claude.href : primary.href,
      exp: Math.floor(Date.now() / 1_000) + 300, client_id: "synthetic-client", scope: RESEARCH_USE_SCOPE, sub: subject,
    }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).sign(privateKey);
    const client = new Client({ name: "call-record-test", version: "1.0.0" });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL(route, base), { requestInit: { headers: {
      ...(signedIn ? { authorization: `Bearer ${token}` } : {}), ...(userAgent ? { "user-agent": userAgent } : {}),
    } } }));
    return client;
  };
}

describe("call records at the MCP endpoints", () => {
  it.each(["/mcp", "/mcp/claude", "/mcp/gemini"] as const)("records one answered call on %s, with and without ChatGPT meta", async (route) => {
    const store = new InMemoryResearchCallRecordStore();
    const client = await (await start(store))(route);
    for (const chatgpt of [true, false]) {
      await client.callTool({ name: "manage_research_access", arguments: { action: "inspect",
        tool_list_version: "distinctive-private-argument-marker" },
      ...(chatgpt ? { _meta: { "openai/locale": "private-meta-value" } } : {}) });
      await waitForPendingCallRecords(store);
      const rows = await store.list(ownKey, new Date());
      expect(rows).toHaveLength(chatgpt ? 1 : 2);
      expect(rows[0]).toEqual({ accountKey: ownKey, receivedAt: expect.any(Date), tool: "manage_research_access",
        action: "inspect", route, chatgpt, outcome: "answered", code: null, durationMs: expect.any(Number) });
      expect(Number.isInteger(rows[0]!.durationMs)).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(/distinctive-private-argument-marker|private-meta-value/);
    }
  });

  it.each(["/mcp", "/mcp/claude", "/mcp/gemini"] as const)("records an unenrolled subject's refusal on %s", async (route) => {
    const store = new InMemoryResearchCallRecordStore();
    const client = await (await start(store))(route);
    const result = await client.callTool({ name: "manage_research_access", arguments: {
      action: "set_detailed_lesson_reports", detailedLessonReports: true,
    } });
    expect(result.isError).toBe(true);
    await waitForPendingCallRecords(store);
    expect(await store.list(ownKey, new Date())).toEqual([expect.objectContaining({
      route, tool: "manage_research_access", action: "set_detailed_lesson_reports", chatgpt: false,
      outcome: "refused", code: "research_access_required",
    })]);
  });

  it("uses the existing ChatGPT user-agent signal without retaining its value", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const client = await (await start(store))("/mcp", true, "openai-mcp/private-user-agent-marker");
    await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    await waitForPendingCallRecords(store);
    const rows = await store.list(ownKey, new Date());
    expect(rows[0]!.chatgpt).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("private-user-agent-marker");
  });

  it("records no call without sign-in", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const client = await (await start(store))("/mcp", false);
    await client.callTool({ name: "manage_research_access", arguments: { action: "inspect" } });
    await waitForPendingCallRecords(store);
    expect(await store.list(ownKey, new Date())).toEqual([]);
  });

  it("keeps list_calls out of the published enum, and shows the listing call only on the next listing", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const client = await (await start(store))("/mcp");
    const catalog = await client.listTools();
    const access = catalog.tools.find((tool) => tool.name === "manage_research_access")!;
    expect(JSON.stringify(access.inputSchema)).not.toContain("list_calls");
    expect(JSON.stringify(access.outputSchema)).not.toContain("retention_days");
    const first = await client.callTool({ name: "manage_research_access", arguments: { action: "list_calls" } });
    expect(first.structuredContent).toEqual({ ok: true, calls: [], retention_days: 7 });
    await waitForPendingCallRecords(store);
    const second = await client.callTool({ name: "manage_research_access", arguments: { action: "list_calls" } });
    expect(second.structuredContent).toEqual({ ok: true, calls: [expect.objectContaining({
      tool: "manage_research_access", action: "list_calls", outcome: "answered",
    })], retention_days: 7 });
    await waitForPendingCallRecords(store);
  });
});

describe("list_calls", () => {
  it("shows only this signed-in account, with UTC times and the disclosed fields", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const at = new Date();
    const row: ResearchCallRecordEntry = { accountKey: ownKey, receivedAt: at, tool: "manage_research_access",
      action: "inspect", route: "/mcp", chatgpt: true, outcome: "answered", code: null, durationMs: 400 };
    await store.record(row);
    await store.record({ ...row, accountKey: service.accountKeyForSubject("another-subject"), tool: "private_other_tool" });
    const earlier = new Date(at.getTime() - 1_000);
    await store.record({ ...row, receivedAt: earlier, tool: "load_protocol", action: null, route: "/mcp/claude",
      chatgpt: false, outcome: "refused", code: "research_access_required", durationMs: 1_200 });
    const result = await createManageResearchAccessHandler({ service, callRecord: store })({ action: "list_calls" }, auth);
    expect(result.structuredContent).toEqual({ ok: true, retention_days: 7, calls: [
      { received_at: at.toISOString(), tool: row.tool, action: "inspect", route: "/mcp", chatgpt: true,
        outcome: "answered", code: null, duration_ms: 400 },
      { received_at: earlier.toISOString(), tool: "load_protocol", action: null, route: "/mcp/claude", chatgpt: false,
        outcome: "refused", code: "research_access_required", duration_ms: 1_200 },
    ] });
    const text = result.content[0]!.type === "text" ? result.content[0]!.text : "";
    expect(text).toContain("AskRigor received 2 calls from this signed-in account in the last 7 days.");
    expect(text).toContain("Times are UTC. A call made without signing in isn't recorded. This call itself appears from the next listing.");
    expect(text.split("\n").slice(1)).toEqual([
      `${at.toISOString().slice(0, 19).replace("T", " ")} UTC · manage_research_access (inspect) · answered · 0.4 s · ChatGPT · /mcp`,
      `${earlier.toISOString().slice(0, 19).replace("T", " ")} UTC · load_protocol · refused [research_access_required] · 1.2 s · other app · /mcp/claude`,
    ]);
    expect(JSON.stringify(result)).not.toContain(ownKey);
    expect(JSON.stringify(result)).not.toContain("private_other_tool");
  });

  // Owner answer 289a: list_calls shows plan_research's decision beside its action, taken from the menu AskRigor made,
  // through the real access handler and the real recording.
  it("shows plan_research's decision, ask or go on, beside its action", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const planner = "synthetic-call-record-planner";
    await service.acceptFreeContributor(planner, { noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true });
    const signedIn = { authInfo: { ...auth.authInfo, extra: { subject: planner } } };
    const handler = forTextClients("manage_research_access", createManageResearchAccessHandler({ service, callRecord: store }),
      researchCallRecordingOptions(store, service, "/mcp"));
    const task = (could_change: "conclusion" | "detail") => ({ task: "Read the synthetic trial in full", kind: "full_text",
      could_change });
    // The handler takes the later shape as the connector's later-inputs step leaves it, merged in.
    const asked = await handler({ action: "plan_research", researchMenu: {
      research_target: "Synthetic target", tasks: [task("conclusion")] } }, signedIn);
    const goneOn = await handler({ action: "plan_research", researchMenu: {
      research_target: "Synthetic target", tasks: [task("conclusion")], allocation: [{ task: 1, minutes: 3 }],
      // 13 Nov 2026: on every account an allocation is the person's answer only with person_answered true.
      person_answered: true } }, signedIn);
    expect(asked.structuredContent).toMatchObject({ researchMenu: { next: "ask" } });
    expect(goneOn.structuredContent).toMatchObject({ researchMenu: { next: "go_on" } });
    await handler({ action: "inspect" }, signedIn);
    await waitForPendingCallRecords(store);
    const listed = await createManageResearchAccessHandler({ service, callRecord: store })({ action: "list_calls" }, signedIn);
    const calls = (listed.structuredContent as { calls: Array<Record<string, unknown>> }).calls;
    expect(calls.map(({ action, plan_next }) => [action, plan_next])).toEqual([["inspect", undefined],
      ["plan_research", "go_on"], ["plan_research", "ask"]]);
    expect(calls[0]).not.toHaveProperty("plan_next");
    const lines = (listed.content[0] as { text: string }).text.split("\n").slice(1);
    expect(lines[0]).toContain(" UTC · manage_research_access (inspect) · answered · ");
    expect(lines[1]).toContain(" UTC · manage_research_access (plan_research: go_on) · answered · ");
    expect(lines[2]).toContain(" UTC · manage_research_access (plan_research: ask) · answered · ");
    expect(JSON.stringify(listed)).not.toContain("Synthetic target");
  });

  // Its twin (owner answer 303a's build): the lane AskRigor's own plan gave a register_plain_answer call, beside its action.
  it("shows register_plain_answer's lane beside its action, as it shows plan_research's decision", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const at = new Date();
    const row: ResearchCallRecordEntry = { accountKey: ownKey, receivedAt: at, tool: "manage_research_access",
      action: "register_plain_answer", route: "/mcp", chatgpt: true, outcome: "answered", code: null, durationMs: 900,
      planLane: "light" };
    await store.record(row);
    await store.record({ ...row, receivedAt: new Date(at.getTime() - 1_000), planLane: undefined });
    const result = await createManageResearchAccessHandler({ service, callRecord: store })({ action: "list_calls" }, auth);
    const calls = (result.structuredContent as { calls: Array<Record<string, unknown>> }).calls;
    expect(calls.map(({ action, plan_lane }) => [action, plan_lane])).toEqual([["register_plain_answer", "light"],
      ["register_plain_answer", undefined]]);
    expect(calls[1]).not.toHaveProperty("plan_lane");
    const lines = (result.content[0] as { text: string }).text.split("\n").slice(1);
    expect(lines[0]).toContain(" UTC · manage_research_access (register_plain_answer: light) · answered · 0.9 s · ");
    expect(lines[1]).toContain(" UTC · manage_research_access (register_plain_answer) · answered · ");
  });

  // The review of 12 Nov 2026: 500 calls came to about 85 KB, more than Claude's clients take in; and Greptile's of the
  // same day: paging by position repeated a call, since each listing is itself recorded.
  it("shows the newest calls that fit one result, says where the next start, and pages through every call by time", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const at = Date.now();
    for (let index = 0; index < 520; index += 1) {
      await store.record({ accountKey: ownKey, receivedAt: new Date(at - index * 1_000), tool: "search_europe_pmc",
        action: null, route: "/mcp/claude", chatgpt: false, outcome: index % 7 === 0 ? "refused" : "answered",
        code: index % 7 === 0 ? "research_access_required" : null, durationMs: 1_000 + index });
    }
    const handler = createManageResearchAccessHandler({ service, callRecord: store });
    type Page = { shown: number; total: number; before?: string; next_before?: string };
    const first = await handler({ action: "list_calls" }, auth);
    expect(clientResultBytes(first)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
    const page = (first.structuredContent as { calls_page: Page }).calls_page;
    expect(page.shown).toBeGreaterThan(50);
    expect(page.shown).toBeLessThan(500);
    expect(page).toEqual({ shown: page.shown, total: 500,
      next_before: new Date(at - (page.shown - 1) * 1_000).toISOString() });
    const firstText = (first.content[0] as { text: string }).text;
    expect(firstText).toContain(`AskRigor received at least 500 calls from this signed-in account in the last 7 days. ` +
      `This result shows the newest ${page.shown} of them; older ones are not shown: for the next, call list_calls ` +
      `again with later_inputs.callsPage {"before": "${page.next_before}"}. Times are UTC.`);
    expect(firstText.split("\n")).toHaveLength(page.shown + 1);
    // Paging by time gives every call once, newest first, the 20 past the newest 500 included.
    const seen = [...(first.structuredContent as { calls: Array<{ received_at: string }> }).calls];
    let before: string | undefined = page.next_before;
    for (let guard = 0; before !== undefined; guard += 1) {
      expect(guard, "pages stopped moving").toBeLessThan(20);
      const more = await handler({ action: "list_calls", callsPage: { before } }, auth);
      expect(clientResultBytes(more)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
      seen.push(...(more.structuredContent as { calls: Array<{ received_at: string }> }).calls);
      before = (more.structuredContent as { calls_page: Page }).calls_page.next_before;
    }
    expect(seen.map(({ received_at }) => received_at)).toEqual(
      Array.from({ length: 520 }, (_, index) => new Date(at - index * 1_000).toISOString()));
    // A limit shows fewer; a time before every call shows none, and says so.
    const three = await handler({ action: "list_calls", callsPage: { before: new Date(at - 9_500).toISOString(),
      limit: 3 } }, auth);
    expect(three.structuredContent).toMatchObject({ calls_page: { shown: 3, total: 500,
      before: new Date(at - 9_500).toISOString(), next_before: new Date(at - 12_000).toISOString() } });
    const early = new Date(at - 600_000).toISOString();
    const none = await handler({ action: "list_calls", callsPage: { before: early } }, auth);
    expect(none.structuredContent).toMatchObject({ calls: [], calls_page: { shown: 0, total: 0, before: early } });
    expect((none.content[0] as { text: string }).text).toContain("AskRigor received no calls from this signed-in " +
      `account in the last 7 days before ${early.slice(0, 19).replace("T", " ")} UTC.`);
    // A page that isn't a time is refused, not read as the first page.
    const wrong = await handler({ action: "list_calls", callsPage: { before: "yesterday" } }, auth);
    expect(wrong.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
  });

  it("never ends a page inside calls received in the same millisecond", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const at = Date.now();
    const times = [at, at - 1_000, at - 1_000, at - 1_000, at - 2_000];
    for (const [index, time] of times.entries()) {
      await store.record({ accountKey: ownKey, receivedAt: new Date(time), tool: "search_pubmed", action: null,
        route: "/mcp", chatgpt: true, outcome: "answered", code: null, durationMs: 100 + index });
    }
    const handler = createManageResearchAccessHandler({ service, callRecord: store });
    type Listed = { calls: Array<{ received_at: string; duration_ms: number }>; calls_page: { next_before?: string } };
    // A limit of 2 would end inside the three calls at the same time: the page ends before them.
    const first = (await handler({ action: "list_calls", callsPage: { limit: 2 } }, auth)).structuredContent as Listed;
    expect(first.calls.map(({ duration_ms }) => duration_ms)).toEqual([100]);
    // The next page starts with them and, since they start it, shows all three.
    const second = (await handler({ action: "list_calls", callsPage: { before: first.calls_page.next_before, limit: 2 } },
      auth)).structuredContent as Listed;
    expect(second.calls.map(({ duration_ms }) => duration_ms).sort()).toEqual([101, 102, 103]);
    const third = (await handler({ action: "list_calls", callsPage: { before: second.calls_page.next_before, limit: 2 } },
      auth)).structuredContent as Listed;
    expect(third.calls.map(({ duration_ms }) => duration_ms)).toEqual([104]);
    expect(third.calls_page.next_before).toBeUndefined();
  });

  // Greptile's review of 12 Nov 2026: through the connector each listing is recorded, and an app that sends no
  // tool_list_version gets the tool-list notice after the listing.
  it("pages through the connector, which records each listing, and keeps the whole result with its notice in budget",
    async () => {
      const store = new InMemoryResearchCallRecordStore();
      const at = Date.now() - 60_000;
      for (let index = 0; index < 300; index += 1) {
        await store.record({ accountKey: ownKey, receivedAt: new Date(at - index * 1_000), tool: "search_europe_pmc",
          action: null, route: "/mcp", chatgpt: false, outcome: "answered", code: null, durationMs: 2_000 + index });
      }
      const client = await (await start(store))("/mcp");
      const textBytes = (result: { content: unknown }) => (result.content as Array<{ type: string; text?: string }>)
        .reduce((sum, block) => sum + (block.type === "text" ? Buffer.byteLength(block.text ?? "", "utf8") : 0), 0);
      const seen: string[] = [];
      let before: string | undefined;
      let pages = 0;
      do {
        expect(pages, "pages stopped moving").toBeLessThan(20);
        const result = await client.callTool({ name: "manage_research_access", arguments: { action: "list_calls",
          ...(before === undefined ? {} : { later_inputs: { callsPage: { before } } }) } });
        await waitForPendingCallRecords(store);
        pages += 1;
        // A client that reads only text gets the listing, the notice and the JSON copy: all of it within the budget.
        expect(textBytes(result)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
        const structured = result.structuredContent as { calls: Array<{ received_at: string }>;
          calls_page?: { next_before?: string } };
        seen.push(...structured.calls.map(({ received_at }) => received_at));
        before = structured.calls_page?.next_before;
      } while (before !== undefined);
      expect(pages).toBeGreaterThan(1);
      expect((await client.callTool({ name: "manage_research_access", arguments: { action: "list_calls" } })).content)
        .toContainEqual(expect.objectContaining({ type: "text", text: expect.stringContaining("tool_list_version") }));
      // Every seeded call once, in order; the listings recorded meanwhile are newer than every page's time, so none
      // of them appears in a later page.
      expect(seen).toEqual(Array.from({ length: 300 }, (_, index) => new Date(at - index * 1_000).toISOString()));
      await waitForPendingCallRecords(store);
    });

  it("takes later_inputs.callsPage through the connector, with list_calls only", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const at = Date.now();
    for (let index = 0; index < 3; index += 1) {
      await store.record({ accountKey: ownKey, receivedAt: new Date(at - index * 1_000), tool: "load_protocol",
        action: null, route: "/mcp", chatgpt: true, outcome: "answered", code: null, durationMs: 100 });
    }
    const client = await (await start(store))("/mcp");
    const before = new Date(at - 500).toISOString();
    const paged = await client.callTool({ name: "manage_research_access", arguments: { action: "list_calls",
      later_inputs: { callsPage: { before, limit: 1 } } } });
    expect(paged.structuredContent).toMatchObject({ calls: [expect.objectContaining({ tool: "load_protocol" })],
      calls_page: { shown: 1, total: 2, before, next_before: new Date(at - 1_000).toISOString() } });
    const elsewhere = await client.callTool({ name: "manage_research_access", arguments: { action: "inspect",
      later_inputs: { callsPage: { before } } } });
    expect(elsewhere.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request",
      message: "later_inputs.callsPage goes only with action list_calls." } });
    await waitForPendingCallRecords(store);
  });

  it("says no calls when this account has none", async () => {
    const result = await createManageResearchAccessHandler({ service, callRecord: new InMemoryResearchCallRecordStore() })
      ({ action: "list_calls" }, auth);
    expect(result.structuredContent).toEqual({ ok: true, calls: [], retention_days: 7 });
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining(
      "AskRigor received no calls from this signed-in account in the last 7 days.") });
  });

  it("returns the specified unavailable error without a store", async () => {
    const result = await createManageResearchAccessHandler({ service })({ action: "list_calls" }, auth);
    expect(result).toMatchObject({ isError: true, content: [{ type: "text",
      text: "This AskRigor server keeps no call record, so there is nothing to show." }],
    structuredContent: { ok: false, error: { code: "call_record_unavailable",
      message: "This AskRigor server keeps no call record, so there is nothing to show." } } });
  });

  // Without this, the AI would not know list_calls exists (owner answer 189a keeps it out of the published enum).
  it("names list_calls in inspect only where this server keeps a call record", async () => {
    const text = (result: { content: unknown }) => (result.content as Array<{ text: string }>).map(({ text }) => text)
      .join("\n");
    const kept = await createManageResearchAccessHandler({ service, callRecord: new InMemoryResearchCallRecordStore() })
      ({ action: "inspect" }, auth);
    expect(text(kept)).toContain(CALL_RECORD_SENTENCE);
    expect(CALL_RECORD_SENTENCE).toContain("action list_calls");
    const none = await createManageResearchAccessHandler({ service })({ action: "inspect" }, auth);
    expect(text(none)).not.toContain("list_calls");
  });

  it("requires a valid sign-in, without requiring enrollment", async () => {
    const handler = createManageResearchAccessHandler({ service, callRecord: new InMemoryResearchCallRecordStore() });
    expect((await handler({ action: "list_calls" })).isError).toBe(true);
    expect((await handler({ action: "list_calls" }, auth)).isError).not.toBe(true);
  });
});
