import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { fetchDiscoveredDocument } from "../packages/sources/src/http.js";

import { createInfoAccessClient } from "../apps/research-mcp/src/infoaccess-client.js";
import { syntheticArticleText, syntheticPdf } from "./helpers/synthetic-full-text.js";

const DOI = "10.1234/synthetic.transport";
const TOKEN = "synthetic-infoaccess-test-token";
const DOWNLOAD_URL = "https://infoaccess.example/ephemeral.pdf";

describe("free InfoAccess Streamable HTTP client", () => {
  it("uses a Bearer token with the actual MCP transport and only calls get_article_pdf", async () => {
    const bytes = syntheticPdf(syntheticArticleText(`Synthetic transport study DOI ${DOI}`));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const called: string[] = [];
    const args: unknown[] = [];
    const servers = new Set<McpServer>();
    const upstream = createServer(async (request, response) => {
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
      const mcp = new McpServer({ name: "fake-infoaccess", version: "1.0" });
      servers.add(mcp);
      mcp.registerTool("get_article_pdf", { inputSchema: z.object({ doi: z.string() }) }, async (input) => {
        called.push("get_article_pdf"); args.push(input);
        return { content: [{ type: "resource_link", name: "article.pdf", uri: DOWNLOAD_URL, size: bytes.byteLength,
          _meta: { sha256 } }] };
      });
      for (const name of ["get_article", "search_articles", "cite_articles"]) {
        mcp.registerTool(name, { inputSchema: z.object({}).passthrough() }, async () => {
          called.push(name); throw new Error("Paid InfoAccess tool must never run");
        });
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      try {
        await mcp.connect(transport);
        await transport.handleRequest(request, response);
      } finally { await mcp.close(); servers.delete(mcp); }
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    try {
      const library = createInfoAccessClient({ url: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/mcp`, token: TOKEN,
        documentFetchRuntime: { resolveAddresses: async () => ["93.184.216.34"],
          requestDocument: async (url, _addresses, options) => {
            expect(url.toString()).toBe(DOWNLOAD_URL);
            expect(options.maximumBytes).toBe(64 * 1024 * 1024);
            expect(options.timeoutMs).toBe(120_000);
            return { status: 200, headers: new Headers(), bytes };
          } } });
      await expect(library.fetchPdf(DOI)).resolves.toEqual({ bytes, size: bytes.byteLength, sha256 });
      expect(called).toEqual(["get_article_pdf"]);
      expect(args).toEqual([{ doi: DOI }]);
    } finally {
      for (const server of servers) await server.close();
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("bounds an MCP connection outage to 120 seconds without exposing the token", async () => {
    vi.useFakeTimers();
    try {
      const library = createInfoAccessClient({ url: "https://infoaccess.example/mcp", token: TOKEN,
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error(`Synthetic failure ${TOKEN}`)), { once: true });
        }) });
      const pending = expect(library.fetchPdf(DOI)).rejects.toMatchObject({ code: "unavailable", message: "Owner library unavailable" });
      await vi.advanceTimersByTimeAsync(120_001);
      await pending;
    } finally { vi.useRealTimers(); }
  });
  it("applies the overall download deadline while DNS resolution is pending", async () => {
    const deadline = new AbortController();
    const requestDocument = vi.fn();
    const pending = expect(fetchDiscoveredDocument(DOWNLOAD_URL, {
      signal: deadline.signal, resolveAddresses: () => new Promise(() => undefined), requestDocument
    })).rejects.toMatchObject({ code: "transport" });
    deadline.abort(new Error("Synthetic overall deadline"));
    await pending;
    expect(requestDocument).not.toHaveBeenCalled();
  });
});
