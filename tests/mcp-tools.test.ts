import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAskRigorHttpServer,
  createAskRigorServer
} from "../apps/research-mcp/src/server.js";

const TOOL_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity"
];

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("AskRigor protocol MCP tools", () => {
  it("registers exactly the three read-only protocol tools", async () => {
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

async function withHttpServer(
  callback: (baseUrl: URL) => Promise<void>
): Promise<void> {
  const httpServer = createAskRigorHttpServer();
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
