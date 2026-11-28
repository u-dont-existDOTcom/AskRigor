import { readFile } from "node:fs/promises";
import {
  InMemoryResearchContributorAccessStore, PostgresResearchErrorLogStore,
  RESEARCH_ERROR_LOG_RETENTION_MS, ResearchContributorAccessService, researchAccountReference,
  type ResearchErrorLogEntry,
} from "@askrigor/evidence-repository";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { keepFailedSearches } from "../apps/research-mcp/src/failed-search-preference.js";
import { RESEARCH_USE_SCOPE } from "../apps/research-mcp/src/oauth-resource-server.js";
import { buildResearchErrorLogEntry, screenFailedSearch } from "../apps/research-mcp/src/research-error-log-entry.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { ResearchErrorLogTransport } from "../apps/research-mcp/src/research-error-log-transport.js";

const receivedAt = new Date("2026-11-28T00:15:00.000Z");
const schema = z.object({
  query: z.string(), page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(), pmid: z.string().optional(), pmcid: z.string().optional(), doi: z.string().optional(),
  sort: z.enum(["relevance", "recent"]).optional(), later_inputs: z.unknown().optional(),
}).strict();
const errorResult = {
  isError: true,
  content: [{ type: "text", text: "private error contents" }],
  structuredContent: { provider: "europe_pmc",
    error: { code: "untrusted_error_code", failure_kind: "timeout", message: "private exception contents" } },
};
const base = { receivedAt, durationMs: 850, tool: "search_europe_pmc", schema, app: "chatgpt" as const };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("error-log entry projection", () => {
  it("keeps fixed metadata, valid paper IDs and the shape, without arbitrary fields or error payloads", () => {
    const entry = buildResearchErrorLogEntry({
      ...base,
      input: {
        query: "private query phrase", page_size: 10, cursor: "private cursor",
        pmid: "812345", pmcid: "PMC812345", doi: "10.4444/synthetic-paper",
        sort: "arbitrary text", later_inputs: { sort: "recent", page_size: 90000, "private-key": "private-value" },
        accountId: "private account", userId: "private user", requestId: "private request",
        headers: { "user-agent": "private header" }, URL: "private link",
      },
      result: { ...errorResult, structuredContent: { ...errorResult.structuredContent,
        source_identity: { doi: "malformed", pmid: "811234", canonical_url: "private source link" },
        data: [{ pmid: "812346", title: "private result" }], query: "private echo",
      } },
    });
    expect(entry).toEqual({
      received_at: receivedAt.toISOString(), duration_ms: 850, tool: "search_europe_pmc", app: "chatgpt",
      outcome: "error", kind: "source_timeout", source: "europe_pmc",
      paper_identifiers: [{ type: "pmid", value: "812345" }, { type: "pmcid", value: "PMC812345" },
        { type: "doi", value: "10.4444/synthetic-paper" }, { type: "pmid", value: "811234" }],
      shape: {
        fields: ["cursor", "doi", "later_inputs", "later_inputs.page_size", "later_inputs.sort", "page_size",
          "pmcid", "pmid", "query", "sort"],
        word_counts: { query: 3 }, options: { page_size: 10, "later_inputs.sort": "recent" },
      },
    });
  });

  it.each([
    [{ provider: "pubmed", error: { http_status: 503, message: "raw" } }, "source_http_error", "pubmed", "5xx"],
    [{ provider: "pubmed", error: { http_status: 429 } }, "rate_limited", "pubmed", "4xx"],
    [{ error: { code: "authorization_required" } }, "auth_refused", "server", undefined],
    [{ code: "invalid_input" }, "validation_error", "server", undefined],
    [{ provider: "https://example.invalid", error: { code: "made_up" } }, "internal_error", "server", undefined],
  ])("maps structured errors to fixed categories, case %#", (structuredContent, kind, source, statusClass) => {
    const result = { ...errorResult, structuredContent };
    const entry = buildResearchErrorLogEntry({ ...base, tool: "load_protocol", input: {}, result });
    expect(entry).toMatchObject({ outcome: "error", kind, source });
    expect(entry?.outcome === "error" && entry.http_status_class).toBe(statusClass);
    expect(JSON.stringify(entry)).not.toMatch(/made_up|https:|raw|authorization_required|invalid_input/u);
  });

  it("removes email, phones, IPs, URLs and digits and refuses credentials", () => {
    expect(screenFailedSearch("sleep example@example.invalid +1 (202) 555-0141 192.0.2.7 [2001:db8::2]:443 " +
      "https://example.invalid/private bare.example.invalid/path 1234567890123456 review"))
      .toBe("sleep review");
    expect(screenFailedSearch("study https://doi.org/10.4444/example and ftp://ftp.example.invalid/file"))
      .toBe("study and");
    expect(screenFailedSearch("sleep Authorization: Bearer short-example-token review")).toBeUndefined();
    expect(screenFailedSearch("sleep Cookie: name=example; other=second-example review")).toBeUndefined();
    expect(screenFailedSearch("sleep\u200B review")).toBeUndefined();
    expect(screenFailedSearch("sleep -----BEGIN PRIVATE KEY-----")).toBeUndefined();
  });

  it.each(["search_youtube", "search_youtube_comments", "scout_gemini_youtube_candidates", "survey_youtube_community",
    "assess_treatment_landscape_coverage", "unmapped_tool"])("retains shape only for destination %s", (tool) => {
    const entry = buildResearchErrorLogEntry({ ...base, tool, input: { query: "sleep review" }, result: errorResult, keepWords: true });
    expect(entry).toMatchObject({ shape: { word_counts: { query: 2 } } });
    expect(entry).not.toHaveProperty("search_words");
  });

  it("keeps screened words only with permission and a recognized destination", () => {
    const input = { query: "sleep example@example.invalid review" };
    expect(buildResearchErrorLogEntry({ ...base, input, result: errorResult })).not.toHaveProperty("search_words");
    expect(buildResearchErrorLogEntry({ ...base, input, result: errorResult, keepWords: true }))
      .toMatchObject({ search_words: { query: "sleep review" } });
    const result = { ...errorResult, structuredContent: { provider: "next_provider" } };
    expect(buildResearchErrorLogEntry({ ...base, input, result, keepWords: true })).not.toHaveProperty("search_words");
  });

  it("treats a full-text route failure as terminal only when a working copy is missing", () => {
    const call = { ...base, tool: "acquire_open_full_text", input: {} };
    const discovery_attempts = [{ route: "owner_library", result: "error", http_status: 503,
      identifier: "10.4444/synthetic-paper", message: "private source error" }];
    const result = { structuredContent: { status: "possibly_useful_lead", discovery_attempts } };
    expect(buildResearchErrorLogEntry({ ...call, result })).toMatchObject({
      outcome: "error", kind: "source_http_error", source: "infoaccess", http_status_class: "5xx",
      paper_identifiers: [{ type: "doi", value: "10.4444/synthetic-paper" }],
    });
    expect(buildResearchErrorLogEntry({ ...call, result: { structuredContent: {
      status: "full_text_available", discovery_attempts,
    } } })).toBeUndefined();
  });

  it("logs a successful fallback only if slow, keeping identifiers only from arguments", () => {
    const result = { ...errorResult, isError: false,
      structuredContent: { ...errorResult.structuredContent, primary_identifier: "PMC813456", pubmed_search_instead: {} } };
    const call = { ...base, input: { query: "sleep review", doi: "10.4444/synthetic-paper" }, result, keepWords: true };
    expect(buildResearchErrorLogEntry({ ...call, durationMs: 10_000 })).toBeUndefined();
    expect(buildResearchErrorLogEntry({ ...call, durationMs: 10_001 })).toEqual({
      received_at: receivedAt.toISOString(), duration_ms: 10_001, tool: "search_europe_pmc", app: "chatgpt", outcome: "slow",
      paper_identifiers: [{ type: "doi", value: "10.4444/synthetic-paper" }],
    });
  });
});

describe("opt-in and final MCP response", () => {
  const subject = "synthetic-account";
  async function account() {
    const store = new InMemoryResearchContributorAccessStore();
    const service = new ResearchContributorAccessService({ store, identitySecret: Buffer.alloc(32, 19) });
    const accountKey = service.accountKeyForSubject(subject);
    const at = receivedAt.toISOString();
    await store.saveAccount({ accountKey, status: "REVOKED", mode: null, agreement: null, noticeVersion: null,
      createdAt: at, updatedAt: at, activatedAt: null, revokedAt: at });
    return { service, accountKey };
  }

  it("defaults ordinary accounts off and listed developer accounts on, with explicit overrides", async () => {
    const { service, accountKey } = await account();
    const dev = { ASKRIGOR_DEV_ACCOUNT_KEYS: researchAccountReference(accountKey) };
    await expect(keepFailedSearches(service, accountKey, {})).resolves.toBe(false);
    await expect(keepFailedSearches(service, accountKey, dev)).resolves.toBe(true);
    await expect(keepFailedSearches(service, accountKey, { ASKRIGOR_KEEP_FAILED_SEARCHES_DEFAULT: "enabled" })).resolves.toBe(true);
    await expect(keepFailedSearches(service, "no-account", dev)).resolves.toBeUndefined();
    await expect(service.setKeepFailedSearches(accountKey, false)).resolves.toBe(true);
    await expect(keepFailedSearches(service, accountKey, dev)).resolves.toBe(false);
    await expect(service.setKeepFailedSearches(accountKey, true)).resolves.toBe(true);
    await expect(keepFailedSearches(service, accountKey, {})).resolves.toBe(true);
  });

  it("recognizes input refusals from the actual AskRigor runtime schema", async () => {
    const record = vi.fn<(entry: ResearchErrorLogEntry) => Promise<void>>().mockResolvedValue();
    const transport = new ResearchErrorLogTransport({ record, sweep: async () => 0 }, "/mcp");
    vi.spyOn(StreamableHTTPServerTransport.prototype, "send").mockResolvedValue();
    const server = createAskRigorServer();
    try {
      await server.connect(transport);
      transport.onmessage?.({ jsonrpc: "2.0", method: "tools/call", id: 1, params: {
        name: "search_pubmed", arguments: { query: "sleep review", page_size: "wrong" },
        _meta: { "openai/locale": "en" },
      } });
      await vi.waitFor(() => expect(record).toHaveBeenCalledOnce());
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: "validation_error", source: "server", app: "chatgpt" }));
    } finally {
      await server.close();
    }
  });

  it("observes SDK validation, raw throws, and consent without contacting providers", async () => {
    const { service, accountKey } = await account();
    vi.stubEnv("ASKRIGOR_DEV_ACCOUNT_KEYS", "");
    vi.stubEnv("ASKRIGOR_KEEP_FAILED_SEARCHES_DEFAULT", "");
    const entries: ResearchErrorLogEntry[] = [];
    const store = { record: async (entry: ResearchErrorLogEntry) => { entries.push(entry); }, sweep: async () => 0 };
    const transport = new ResearchErrorLogTransport(store, "/mcp/claude", service);
    const sent = vi.spyOn(StreamableHTTPServerTransport.prototype, "send").mockResolvedValue();
    const server = new McpServer({ name: "fixture", version: "1.0.0" });
    server.registerTool("search_pubmed", { inputSchema: { query: z.string().min(1), page_size: z.number().optional() } },
      async () => { throw new Error("private original exception"); });
    const privateExtra: MessageExtraInfo = {
      authInfo: { token: "private token", clientId: "private app id", scopes: [RESEARCH_USE_SCOPE],
        expiresAt: Date.now() / 1_000 + 300, extra: { subject } },
    };
    const receive = (id: number, args: Record<string, unknown>, extra?: MessageExtraInfo) => {
      const message: JSONRPCMessage = { jsonrpc: "2.0", method: "tools/call", id,
        params: { name: "search_pubmed", arguments: args } };
      transport.onmessage?.(message, extra);
    };
    try {
      await server.connect(transport);
      receive(1, { query: "sleep review", page_size: "invalid private value" }, privateExtra);
      await vi.waitFor(() => expect(entries).toHaveLength(1));
      expect(entries[0]).toMatchObject({ outcome: "error", kind: "validation_error", app: "claude",
        shape: { fields: ["page_size", "query"], word_counts: { query: 2 }, options: {} } });
      expect(entries[0]).not.toHaveProperty("search_words");
      await service.setKeepFailedSearches(accountKey, true);
      receive(2, { query: "sleep review" }, privateExtra);
      await vi.waitFor(() => expect(entries).toHaveLength(2));
      expect(entries[1]).toMatchObject({ outcome: "error", kind: "internal_error", search_words: { query: "sleep review" } });
      vi.spyOn(service, "failedSearchPreference").mockRejectedValue(new Error("private lookup exception"));
      receive(3, { query: "sleep review" }, privateExtra);
      receive(4, { query: "sleep research" }, undefined);
      await vi.waitFor(() => expect(entries).toHaveLength(4));
      expect(entries.slice(2).every((entry) => !Object.hasOwn(entry, "search_words"))).toBe(true);
      expect(sent).toHaveBeenCalledTimes(4);
      expect(JSON.stringify(entries)).not.toMatch(/private|synthetic-account/u);
    } finally {
      await server.close();
    }
  });
});

describe("error-log storage", () => {
  it("sweeps rows at the exact 30-day boundary using only their timestamp", async () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    const boundary = now.getTime() - RESEARCH_ERROR_LOG_RETENTION_MS;
    const live = new Set([boundary - 1, boundary, boundary + 1, now.getTime()]);
    const query = vi.fn(async (sql: string, [cutoff]: [Date]) => {
      expect(sql).toBe("DELETE FROM living_evidence.research_error_log WHERE received_at <= $1");
      expect(cutoff.toISOString()).toBe("2026-10-29T12:00:00.000Z");
      let rowCount = 0;
      for (const stamp of live) {
        if (stamp <= cutoff.getTime() && live.delete(stamp)) rowCount++;
      }
      return { rowCount };
    });
    const store = new PostgresResearchErrorLogStore({ query } as unknown as Pool);
    await expect(store.sweep(now)).resolves.toBe(2);
    expect([...live]).toEqual([boundary + 1, now.getTime()]);
  });

  it("uses an unlogged table and keeps operator access separate from the runtime", async () => {
    const migration = await readFile(new URL("../packages/evidence-repository/migrations/0045_research_error_log.sql", import.meta.url), "utf8");
    expect(migration).toContain("CREATE UNLOGGED TABLE IF NOT EXISTS research_error_log");
    expect(migration).toContain("GRANT SELECT (received_at) ON TABLE research_error_log TO askrigor_research_access");
    expect(migration).toContain("GRANT SELECT ON TABLE research_error_log TO askrigor_error_log_reader");
    expect(migration).not.toMatch(/GRANT SELECT ON TABLE research_error_log TO askrigor_research_access/u);
  });
});
