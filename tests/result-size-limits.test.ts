import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FROZEN_TOOL_LIST_SURFACES, frozenSurfaceServer, servedToolList } from "../scripts/freeze-tool-lists.mts";
import { createRedditReaderClient } from "../apps/research-mcp/src/reddit-reader-client.js";
import {
  CLAUDE_CODE_DEFAULT_RESULT_CHARACTERS,
  CLAUDE_CODE_RESULT_CEILING,
  DECLARED_RESULT_SIZES,
  MAX_RESULT_SIZE_META_KEY,
  resultSizeDeclarationsFromEnv,
} from "../apps/research-mcp/src/result-size-limits.js";
import type { RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

// Server fix 3 (17 Nov 2026): Claude Code saves a result over 50,000 characters to a file unless the tool declares a
// larger size in tools/list. The list is frozen (owner answer 189a), so the declarations stay off unless turned on.

const account = vi.hoisted(() => vi.fn());
vi.mock("../apps/research-mcp/src/research-contributor-access-tool.js", async (original) => ({
  ...await original<typeof import("../apps/research-mcp/src/research-contributor-access-tool.js")>(), researchUseAccount: account
}));

beforeEach(() => {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "result-size-test-secret-0123456789abcdef");
  account.mockResolvedValue({ mode: "PAID_PRIVATE", accountKey: "synthetic" });
});
afterEach(() => { vi.unstubAllEnvs(); });

const declared = (tools: Array<{ name: string; _meta?: Record<string, unknown> }>) =>
  Object.fromEntries(tools.flatMap(({ name, _meta: meta }) => meta?.[MAX_RESULT_SIZE_META_KEY] === undefined ? []
    : [[name, meta[MAX_RESULT_SIZE_META_KEY]]]));

async function connected(options: RegisterToolsOptions) {
  const server = createAskRigorServer("standard", options);
  const client = new Client({ name: "result-size-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

describe("declared result sizes for Claude Code", () => {
  it("declares nothing unless ASKRIGOR_DECLARE_RESULT_SIZES=enabled, so the frozen lists stand", async () => {
    expect(resultSizeDeclarationsFromEnv("enabled")).toBe(true);
    expect(resultSizeDeclarationsFromEnv(" enabled ")).toBe(true);
    for (const value of [undefined, "", "true", "ENABLED", "on"]) expect(resultSizeDeclarationsFromEnv(value)).toBe(false);
    for (const surface of FROZEN_TOOL_LIST_SURFACES) {
      expect(declared(await servedToolList(frozenSurfaceServer(surface))), surface).toEqual({});
    }
  });

  it("declares each size on its tool alone when on, between Claude Code's default and its ceiling, never for Gemini", async () => {
    for (const size of Object.values(DECLARED_RESULT_SIZES)) {
      expect(size).toBeGreaterThan(CLAUDE_CODE_DEFAULT_RESULT_CHARACTERS);
      expect(size).toBeLessThanOrEqual(CLAUDE_CODE_RESULT_CEILING);
    }
    for (const mcpSurface of ["/mcp", "/mcp/claude"] as const) {
      const tools = await servedToolList(createAskRigorServer("standard", { mcpSurface, declareResultSizes: true }));
      expect(declared(tools), mcpSurface).toEqual({ read_forum_thread: 250_000 });
      // The tool's other metadata stays as it was.
      const plain = (await servedToolList(createAskRigorServer("standard", { mcpSurface })))
        .find(({ name }) => name === "read_forum_thread")!;
      const { [MAX_RESULT_SIZE_META_KEY]: _size, ...rest } = tools.find(({ name }) => name === "read_forum_thread")!._meta!;
      expect(rest).toEqual(plain._meta);
    }
    const gemini = await servedToolList(createAskRigorServer("gemini", { declareResultSizes: true }));
    expect(declared(gemini)).toEqual({});
  });

  it("keeps a forum page and a Reddit call at its text limit within read_forum_thread's declared size", async () => {
    // A page at the reader's 60,000-character limit, every other character one JSON escapes.
    const page = vi.fn(async (url: string) => ({ url, access_state: "read", title: "Synthetic thread",
      page_text: "\"\n".repeat(30_000), truncated: true }));
    const forum = await connected({ forumPageReader: page as never });
    try {
      const result = await forum.client.callTool({ name: "read_forum_thread",
        arguments: { url: "https://forum.example/showthread.php?t=77" } });
      const structured = JSON.stringify(result.structuredContent).length;
      expect(structured).toBeGreaterThan(CLAUDE_CODE_DEFAULT_RESULT_CHARACTERS);
      expect(structured).toBeLessThanOrEqual(DECLARED_RESULT_SIZES.read_forum_thread!);
    } finally { await forum.close(); }
    // Six comments of 18,000 characters: past the reader's 100,000-character text limit, the most one fetch holds here.
    const reader = createRedditReaderClient({ target: "synthetic@reader.invalid", keyFile: "/synthetic/key",
      knownHostsFile: "/synthetic/known-hosts", command: process.execPath,
      args: [fileURLToPath(new URL("./fixtures/reddit-reader-server.mjs", import.meta.url)), "fifteen"] });
    const reddit = await connected({ redditReader: reader });
    try {
      const result = await reddit.client.callTool({ name: "read_forum_thread",
        arguments: { url: "https://www.reddit.com/r/example/comments/abc123/" } });
      expect(result.structuredContent).toMatchObject({ data: { comments_read: 6 } });
      const structured = JSON.stringify(result.structuredContent).length;
      expect(structured).toBeGreaterThan(100_000);
      expect(structured).toBeLessThanOrEqual(DECLARED_RESULT_SIZES.read_forum_thread!);
    } finally { await reddit.close(); await reader.close(); }
  });
});
