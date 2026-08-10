import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAskRigorHttpServer,
  createAskRigorServer
} from "../apps/research-mcp/src/server.js";

const TOOL_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc"
];

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};

const clients: Client[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("AskRigor MCP tools", () => {
  it("registers exactly the six read-only retrieval tools", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();

      expect(tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
      expect(tools.map(({ annotations }) => annotations)).toEqual(
        TOOL_NAMES.map(() => READ_ONLY_ANNOTATIONS)
      );
      expect(tools.every(({ inputSchema, outputSchema }) =>
        inputSchema.type === "object" && outputSchema?.type === "object"
      )).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("publishes bounded PubMed input schemas and retrieval-only descriptions", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_pubmed")!;
      const fetchRecord = tools.find(({ name }) => name === "fetch_pubmed_record")!;

      expect(search.description).toBe(
        "Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated."
      );
      expect(search.inputSchema).toMatchObject({
        type: "object",
        required: ["query"],
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1 },
          page_size: { type: "integer", minimum: 1 },
          cursor: { type: "string", minLength: 1 },
          date_range: {
            type: "object",
            required: ["start", "end"],
            additionalProperties: false
          }
        }
      });
      expect(fetchRecord.description).toBe(
        "Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference."
      );
      expect(fetchRecord.inputSchema).toMatchObject({
        type: "object",
        required: ["pmid"],
        additionalProperties: false,
        properties: {
          pmid: { type: "string", pattern: "^[1-9]\\d{0,15}$" }
        }
      });
      expect(search.outputSchema).toMatchObject({ type: "object" });
      expect(fetchRecord.outputSchema).toMatchObject({ type: "object" });
    } finally {
      await server.close();
    }
  });

  it("publishes a bounded read-only Europe PMC search schema", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_europe_pmc");

      expect(search).toMatchObject({
        description:
          "Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1 },
            date_range: {
              type: "object",
              required: ["start", "end"],
              additionalProperties: false
            }
          }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("returns deterministic structured PubMed search results without exposing the API key", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/pubmed/esearch-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: {
          query: "example intervention[Title/Abstract]",
          page_size: 2
        }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed search returned 2 PMID record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "complete",
        data: [{ pmid: "40123456" }, { pmid: "39876543" }]
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("returns a normalized Europe PMC envelope with provider identifiers and cursor", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/europe-pmc/search-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "example intervention", page_size: 2 }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Europe PMC search returned 2 record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "complete",
        pagination: {
          next_cursor: "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg=="
        },
        data: [
          { source: "MED", id: "40123456" },
          { source: "PPR", id: "PPR987654" }
        ]
      });
      expect(JSON.stringify(result)).not.toContain("https://www.ebi.ac.uk");
    } finally {
      await server.close();
    }
  });

  it("marks Europe PMC provider failures as MCP tool errors", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider detail", {
      status: 403
    })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "restricted record" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Europe PMC search returned 0 record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "inaccessible",
        error: {
          code: "europe_pmc_access_denied",
          message: "Europe PMC access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("provider detail");
    } finally {
      await server.close();
    }
  });

  it("marks a normalized PubMed provider failure as an MCP tool error", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret-detail", {
      status: 403
    })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: { query: "restricted citation" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed search returned 0 PMID record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "inaccessible",
        pagination: { returned: 0, exhausted: false },
        error: {
          code: "pubmed_access_denied",
          message: "PubMed access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
      expect(JSON.stringify(result)).not.toContain("provider-secret-detail");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("normalizes configuration failures into deterministic PubMed error envelopes", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    delete process.env.NCBI_EMAIL;
    delete process.env.NCBI_API_KEY;

    try {
      const result = await client.callTool({
        name: "fetch_pubmed_record",
        arguments: { pmid: "40123456" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed record 40123456 retrieval failed; access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_record",
        primary_identifier: "40123456",
        access_status: "error",
        pagination: { returned: 0, exhausted: false },
        limitations: [
          "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated."
        ],
        error: {
          code: "pubmed_configuration_failed",
          message: "PubMed configuration failed",
          retryable: false
        },
        data: {}
      });
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("returns the complete canonical protocol in structured content", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalText = await readFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    try {
      const result = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "hrp" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Loaded the complete canonical HRP protocol."
        }
      ]);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        protocol: "hrp",
        manifest: {
          name: "HRP",
          version: "20.5.14"
        },
        text: canonicalText
      });
    } finally {
      await server.close();
    }
  });

  it("surfaces integrity failures as explicit structured tool errors", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const result = await client.callTool({
        name: "verify_protocol_integrity",
        arguments: {
          protocol: "hrp",
          expected_sha256: "0".repeat(64)
        }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Protocol operation failed: Protocol SHA-256 mismatch"
        }
      ]);
      expect(result.structuredContent).toEqual({
        ok: false,
        protocol: "hrp",
        error: {
          code: "protocol_error",
          message: "Protocol SHA-256 mismatch"
        }
      });
    } finally {
      await server.close();
    }
  });
});

describe("AskRigor Streamable HTTP server", () => {
  it("returns the exact health payload", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/healthz", baseUrl));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        '{"status":"ok","service":"askrigor-research","version":"0.1.0"}'
      );
    });
  });

  it("supports consecutive MCP requests through the real stateless SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const client = new Client({ name: "askrigor-test", version: "0.1.0" });

      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL("/mcp", baseUrl))
        );

        const tools = await client.listTools();
        const manifest = await client.callTool({
          name: "get_protocol_manifest",
          arguments: { protocol: "universal" }
        });

        expect(tools.tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
        expect(manifest.isError).not.toBe(true);
        expect(manifest.structuredContent).toMatchObject({
          ok: true,
          protocol: "universal",
          manifest: {
            name: "AskRigor.com universal saved instructions",
            version: "20.5.10"
          }
        });
      } finally {
        await client.close();
      }
    });
  });

  it("rejects an unfinished chunked MCP POST as soon as it exceeds 1 MiB", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await sendOpenChunkedPost(
        new URL("/mcp", baseUrl),
        1_048_577
      );

      expect(response.status).toBe(413);
      expect(response.body).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Request body exceeds 1 MiB limit"},"id":null}'
      );
    });
  });

  it("returns a sanitized parse error for malformed MCP JSON", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: '{"secret":"do-not-echo"'
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error: Invalid JSON"},"id":null}'
      );
    });
  });

  it("preserves SDK header validation before JSON parsing", async () => {
    await withHttpServer(async (baseUrl) => {
      const missingAccept = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"secret":"do-not-echo"'
      });
      const wrongContentType = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { accept: "application/json, text/event-stream" },
        body: '{"secret":"do-not-echo"'
      });

      expect(missingAccept.status).toBe(406);
      expect(await missingAccept.json()).toMatchObject({
        error: {
          message: "Not Acceptable: Client must accept both application/json and text/event-stream"
        }
      });
      expect(wrongContentType.status).toBe(415);
      expect(await wrongContentType.json()).toMatchObject({
        error: {
          message: "Unsupported Media Type: Content-Type must be application/json"
        }
      });
    });
  });

  it("stays healthy after a client aborts a valid MCP POST before EOF", async () => {
    await withHttpServer(
      async (baseUrl) => {
        await abortPartialMcpPost(new URL("/mcp", baseUrl));
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await fetch(new URL("/healthz", baseUrl));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          status: "ok",
          service: "askrigor-research",
          version: "0.1.0"
        });
      },
      (request) => {
        request.once("aborted", () => {
          const error = Object.assign(new Error("socket hang up"), {
            code: "ECONNRESET"
          });
          request.emit("error", error);
        });
      }
    );
  });

  it("delegates GET and DELETE semantics to the installed SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const getResponse = await fetch(new URL("/mcp", baseUrl));
      const deleteResponse = await fetch(new URL("/mcp", baseUrl), {
        method: "DELETE",
        headers: { "mcp-protocol-version": "2025-11-25" }
      });

      expect(getResponse.status).toBe(406);
      expect(await getResponse.json()).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Not Acceptable: Client must accept text/event-stream"
        },
        id: null
      });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.text()).toBe("");
    });
  });
});

async function createInMemoryClient(): Promise<{
  client: Client;
  server: ReturnType<typeof createAskRigorServer>;
}> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function withHttpServer(
  callback: (baseUrl: URL) => Promise<void>,
  observeRequest?: (request: IncomingMessage) => void
): Promise<void> {
  const httpServer = createAskRigorHttpServer();
  if (observeRequest !== undefined) {
    httpServer.on("request", observeRequest);
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = httpServer.address() as AddressInfo;

  try {
    await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function sendOpenChunkedPost(
  url: URL,
  byteLength: number
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });

    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for early HTTP response"));
    });
    request.once("error", reject);
    request.once("response", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        request.destroy();
        resolve({ status: response.statusCode, body });
      });
    });

    request.write(Buffer.alloc(byteLength, 0x20));
  });
}

async function abortPartialMcpPost(url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });
    const timeout = setTimeout(() => {
      request.destroy();
      reject(new Error("Timed out waiting for aborted client request to close"));
    }, 1_000);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    request.once("error", finish);
    request.once("close", finish);
    request.once("socket", (socket) => {
      const sendAndAbort = () => {
        request.write('{"jsonrpc":"2.0","id":1');
        setTimeout(() => request.destroy(), 25);
      };

      if (socket.connecting) {
        socket.once("connect", sendAndAbort);
      } else {
        sendAndAbort();
      }
    });
  });
}
