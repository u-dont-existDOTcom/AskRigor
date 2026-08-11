import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

export interface ToolInventory {
  generated_from: "MCP tools/list against createAskRigorServer()";
  endpoint: "https://mcp.askrigor.com/mcp";
  tools: ToolInventoryEntry[];
}

export interface ToolInventoryEntry {
  [key: string]: unknown;
  name: string;
  title?: undefined;
  _meta?: undefined;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  annotations: unknown;
  execution: unknown;
}

export async function createToolInventory(): Promise<ToolInventory> {
  const server = createAskRigorServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tool-inventory-generator", version: "0.1.0" });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();

    return {
      generated_from: "MCP tools/list against createAskRigorServer()",
      endpoint: "https://mcp.askrigor.com/mcp",
      tools: tools as unknown as ToolInventoryEntry[]
    };
  } finally {
    await client.close();
    await server.close();
  }
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  console.log(JSON.stringify(await createToolInventory(), null, 2));
}
