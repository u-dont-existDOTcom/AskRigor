import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { fetchDiscoveredDocument } from "../packages/sources/src/http.js";

import { createInfoAccessClient, InfoAccessError } from "../apps/research-mcp/src/infoaccess-client.js";
import { syntheticArticleText, syntheticPdf } from "./helpers/synthetic-full-text.js";

const DOI = "10.1234/synthetic.transport";
const TOKEN = "synthetic-infoaccess-test-token";
const DOWNLOAD_URL = "https://infoaccess.example/ephemeral.pdf";
const ERROR_CODES = ["not_found", "retrieval_failed", "pdf_invalid", "too_large", "rate_limited", "timeout", "busy",
  "invalid_doi", "invalid_request", "quota_exhausted", "access_denied", "not_configured", "invalid_response", "internal_error"] as const;
const PRIVATE_MESSAGE = `Synthetic provider message ${DOWNLOAD_URL} ${TOKEN}`;

async function expectRetrievalError(result: CallToolResult, code: string) {
  const servers = new Set<McpServer>();
  const requestDocument = vi.fn();
  const upstream = createServer(async (request, response) => {
    const mcp = new McpServer({ name: "fake-infoaccess-error", version: "1.0" });
    servers.add(mcp);
    mcp.registerTool("get_article_pdf", { inputSchema: z.object({ doi: z.string() }) }, async () => result);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(request, response);
    } finally { await mcp.close(); servers.delete(mcp); }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  try {
    const library = createInfoAccessClient({ url: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/mcp`, token: TOKEN,
      busyWaitMs: 30, busyRetryMs: 5,
      documentFetchRuntime: { requestDocument } });
    const error = await library.fetchPdf(DOI).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(InfoAccessError);
    expect(error).toMatchObject({ code, message: `Owner library ${code}` });
    expect(requestDocument).not.toHaveBeenCalled();
  } finally {
    for (const server of servers) await server.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function pdfUpstream(retrieve: (pdf: CallToolResult) => CallToolResult | Promise<CallToolResult>) {
  const bytes = syntheticPdf(syntheticArticleText(`Synthetic transport study DOI ${DOI}`));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const result: CallToolResult = { content: [{ type: "resource_link", name: "article.pdf", uri: DOWNLOAD_URL,
    size: bytes.byteLength, _meta: { sha256 } }] };
  const servers = new Set<McpServer>();
  const requests = vi.fn(async () => await retrieve(result));
  const documentRequests = vi.fn(async () => ({ status: 200, headers: new Headers(), bytes }));
  const upstream = createServer(async (request, response) => {
    const mcp = new McpServer({ name: "fake-infoaccess-queue", version: "1.0" });
    servers.add(mcp);
    mcp.registerTool("get_article_pdf", { inputSchema: z.object({ doi: z.string() }) }, requests);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(request, response);
    } finally { await mcp.close(); servers.delete(mcp); }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/mcp`;
  return {
    requests, documentRequests, pdf: { bytes, size: bytes.byteLength, sha256 },
    client: (options: { busyWaitMs?: number; busyRetryMs?: number } = {}) => createInfoAccessClient({
      url, token: TOKEN, busyWaitMs: 1_000, busyRetryMs: 5, ...options,
      documentFetchRuntime: { resolveAddresses: async () => ["93.184.216.34"], requestDocument: documentRequests }
    }),
    close: async () => {
      for (const server of servers) await server.close();
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
    }
  };
}

describe("free InfoAccess Streamable HTTP client", () => {
  for (const format of ["code", "error.code", "text"] as const) {
    it.each(ERROR_CODES)(`maps %s from ${format} without exposing provider text`, async (code) => {
      const result: CallToolResult = { isError: true, content: [{ type: "text", text: format === "text"
        ? `Article request failed (${code}): ${PRIVATE_MESSAGE}` : PRIVATE_MESSAGE }] };
      if (format !== "text") result.structuredContent = format === "code" ? { code } : { error: { code } };
      await expectRetrievalError(result, code === "not_found" || code === "too_large" || code === "busy" ||
        code === "invalid_response" ? code : "unavailable");
    });
  }
  it.each([
    { isError: true, structuredContent: { code: "unknown_code" }, content: [] },
    { isError: true, content: [{ type: "text", text: `Article request failed (unknown_code): ${PRIVATE_MESSAGE}` }] },
    { isError: true, content: [] },
    { isError: true, content: [{ type: "text", text: PRIVATE_MESSAGE }] },
    ...["not_found", "too_large"].flatMap((code) => [
      `${code}: ${PRIVATE_MESSAGE}`,
      `Article request failed: ${code} ${PRIVATE_MESSAGE}`,
      ` Article request failed (${code}): ${PRIVATE_MESSAGE}`,
      `Other prefix\nArticle request failed (${code}): ${PRIVATE_MESSAGE}`,
      `article request failed (${code}): ${PRIVATE_MESSAGE}`,
      `Article request failed (${code}) ${PRIVATE_MESSAGE}`,
      JSON.stringify({ code })
    ].map((text) => ({ isError: true, content: [{ type: "text" as const, text }] })))
  ] satisfies CallToolResult[])("rejects unknown, absent or misplaced codes: %j", async (result) => {
    await expectRetrievalError(result, "unavailable");
  });
  it.each(["not_found", "too_large", "retrieval_failed", "unknown_code"])("prefers structured code %s over text", async (code) => {
    await expectRetrievalError({ isError: true, structuredContent: { code },
      content: [{ type: "text", text: `Article request failed (${code === "not_found" ? "too_large" : "not_found"}): ${PRIVATE_MESSAGE}` }] },
    code === "not_found" || code === "too_large" ? code : "unavailable");
  });
  it("finds an exact prefix in a later text block", async () => {
    await expectRetrievalError({ isError: true, content: [{ type: "text", text: PRIVATE_MESSAGE },
      { type: "text", text: `Article request failed (not_found): ${PRIVATE_MESSAGE}` }] }, "not_found");
  });
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

  it.each(["one client", "separate clients"])("serializes simultaneous PDF requests to one endpoint from %s", async (kind) => {
    let active = 0;
    let maximumActive = 0;
    const upstream = await pdfUpstream(async (pdf) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
        return pdf;
      } finally { active -= 1; }
    });
    try {
      const first = upstream.client();
      const second = kind === "one client" ? first : upstream.client();
      await expect(Promise.all([first.fetchPdf(DOI), second.fetchPdf(DOI)]))
        .resolves.toEqual([upstream.pdf, upstream.pdf]);
      expect(upstream.requests).toHaveBeenCalledTimes(2);
      expect(maximumActive).toBe(1);
      expect(active).toBe(0);
    } finally { await upstream.close(); }
  });
  it("allows requests to different endpoints to overlap", async () => {
    const bothStarted = deferred();
    const release = deferred();
    let active = 0;
    let maximumActive = 0;
    const retrieve = async (pdf: CallToolResult) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (active === 2) bothStarted.resolve();
      try { await release.promise; return pdf; }
      finally { active -= 1; }
    };
    const first = await pdfUpstream(retrieve);
    const second = await pdfUpstream(retrieve);
    const pending = Promise.all([first.client().fetchPdf(DOI), second.client().fetchPdf(DOI)]);
    try {
      await bothStarted.promise;
      expect(maximumActive).toBe(2);
      expect(first.requests).toHaveBeenCalledTimes(1);
      expect(second.requests).toHaveBeenCalledTimes(1);
      release.resolve();
      await expect(pending).resolves.toEqual([first.pdf, second.pdf]);
      expect(active).toBe(0);
    } finally {
      release.resolve();
      await pending.catch(() => undefined);
      await first.close(); await second.close();
    }
  });
  it("retries two busy answers and succeeds on the third request", async () => {
    let count = 0;
    const upstream = await pdfUpstream((pdf) => ++count <= 2
      ? { isError: true, structuredContent: { code: "busy" }, content: [{ type: "text", text: PRIVATE_MESSAGE }] } : pdf);
    try {
      await expect(upstream.client().fetchPdf(DOI)).resolves.toEqual(upstream.pdf);
      expect(upstream.requests).toHaveBeenCalledTimes(3);
      expect(upstream.documentRequests).toHaveBeenCalledTimes(1);
    } finally { await upstream.close(); }
  });
  it("fails with busy when another try would not fit in busyWaitMs and the upstream stays busy", async () => {
    const busyWaitMs = 100;
    const busyRetryMs = 10;
    const upstream = await pdfUpstream(() => ({ isError: true, structuredContent: { code: "busy" },
      content: [{ type: "text", text: PRIVATE_MESSAGE }] }));
    try {
      const library = upstream.client({ busyWaitMs, busyRetryMs });
      const start = Date.now();
      const error = await library.fetchPdf(DOI).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(InfoAccessError);
      expect(error).toMatchObject({ code: "busy", message: "Owner library busy" });
      expect(Date.now() - start).toBeGreaterThanOrEqual(busyWaitMs - busyRetryMs);
      expect(upstream.requests.mock.calls.length).toBeGreaterThan(1);
      expect(upstream.documentRequests).not.toHaveBeenCalled();
    } finally { await upstream.close(); }
  });
  it("times out a queued call without sending it and admits a later call after the stuck request ends", async () => {
    const started = deferred();
    const release = deferred();
    let count = 0;
    const upstream = await pdfUpstream(async (pdf) => {
      if (++count === 1) { started.resolve(); await release.promise; }
      return pdf;
    });
    const library = upstream.client({ busyWaitMs: 40, busyRetryMs: 5 });
    const stuck = library.fetchPdf(DOI);
    try {
      await started.promise;
      try {
        vi.useFakeTimers();
        const queued = expect(library.fetchPdf(DOI)).rejects.toMatchObject({ code: "busy", message: "Owner library busy" });
        await vi.advanceTimersByTimeAsync(39);
        expect(upstream.requests).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await queued;
        expect(upstream.requests).toHaveBeenCalledTimes(1);
        expect(upstream.documentRequests).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        release.resolve();
        await expect(stuck).resolves.toEqual(upstream.pdf);
      }
      await expect(library.fetchPdf(DOI)).resolves.toEqual(upstream.pdf);
      expect(upstream.requests).toHaveBeenCalledTimes(2);
      expect(upstream.documentRequests).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      release.resolve();
      await stuck.catch(() => undefined);
      await upstream.close();
    }
  });
  it("lets the next queued request run after a failure", async () => {
    let count = 0;
    const upstream = await pdfUpstream((pdf) => ++count === 1
      ? { isError: true, structuredContent: { code: "retrieval_failed" }, content: [{ type: "text", text: PRIVATE_MESSAGE }] } : pdf);
    try {
      const library = upstream.client();
      const failed = expect(library.fetchPdf(DOI)).rejects.toMatchObject({ code: "unavailable", message: "Owner library unavailable" });
      const next = expect(library.fetchPdf(DOI)).resolves.toEqual(upstream.pdf);
      await Promise.all([failed, next]);
      expect(upstream.requests).toHaveBeenCalledTimes(2);
      expect(upstream.documentRequests).toHaveBeenCalledTimes(1);
    } finally { await upstream.close(); }
  });

  it("bounds an MCP connection outage to 120 seconds without exposing the token", async () => {
    vi.useFakeTimers();
    try {
      const library = createInfoAccessClient({ url: "https://infoaccess.example/mcp", token: TOKEN,
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error(`Synthetic failure ${TOKEN}`)), { once: true });
        }) });
      const pending = expect(library.fetchPdf(DOI)).rejects.toMatchObject({ code: "timeout", message: "Owner library timeout" });
      await vi.advanceTimersByTimeAsync(120_001);
      await pending;
    } finally { vi.useRealTimers(); }
  });
  // #394's run: 15 acquire_open_full_text calls ran past the app's limit while InfoAccess answered busy, and the AI lost
  // each whole result. A call's deadline now ends the library route, its waits included.
  it("ends a request that hangs at the call's deadline, as a timeout", async () => {
    vi.useFakeTimers();
    let settled: unknown;
    try {
      const library = createInfoAccessClient({ url: "https://infoaccess.example/mcp", token: TOKEN,
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error(`Synthetic failure ${TOKEN}`)), { once: true });
        }) });
      void library.fetchPdf(DOI, Date.now() + 15_000).catch((error: unknown) => { settled = error; });
      await vi.advanceTimersByTimeAsync(14_990);
      expect(settled).toBeUndefined();
      await vi.advanceTimersByTimeAsync(20);
      expect(settled).toBeInstanceOf(InfoAccessError);
      expect(settled).toMatchObject({ code: "timeout", message: "Owner library timeout" });
    } finally {
      await vi.advanceTimersByTimeAsync(120_001);
      vi.useRealTimers();
    }
  });
  it("sends no request when too little of the call's deadline is left for one", async () => {
    const upstream = await pdfUpstream((pdf) => pdf);
    try {
      await expect(upstream.client().fetchPdf(DOI, Date.now() + 5_000)).rejects.toMatchObject({ code: "timeout" });
      expect(upstream.requests).not.toHaveBeenCalled();
      await expect(upstream.client().fetchPdf(DOI, Date.now() + 30_000)).resolves.toEqual(upstream.pdf);
    } finally { await upstream.close(); }
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
