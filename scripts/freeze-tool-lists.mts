import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { digestCanonicalJson } from "../apps/research-mcp/src/lessons/incident-contracts.js";

export const FROZEN_TOOL_LIST_SURFACES = ["mcp", "claude", "gemini"] as const;
export type FrozenSurface = typeof FROZEN_TOOL_LIST_SURFACES[number];
export const TOOL_LIST_FROZEN_MESSAGE = "The tool list is frozen (owner answer 189a). A new input gets a later shape " +
  "entry; a newer form of an existing input (enum, nested field or relaxed limit) redeclares it in the later shape. " +
  "Both are accepted at the top level or in later_inputs.<name>. A new action or category goes in the runtime enum " +
  "only, named in results or the protocol. New guidance belongs in results or the protocol. Only " +
  "adding or removing a tool may change the list; then rewrite the fixtures with " +
  "scripts/freeze-tool-lists.mts --write, and record in the release record that apps need one refresh.";

/** Exactly the surface's served list, without running versions or the embedded tool_list_version value. */
export function frozenSurfaceServer(surface: FrozenSurface): McpServer {
  return createAskRigorServer(surface === "gemini" ? "gemini" : "standard", {
    mcpSurface: surface === "mcp" ? "/mcp" : surface === "claude" ? "/mcp/claude" : "/mcp/gemini",
  });
}

export async function servedToolList(server: McpServer) {
  const client = new Client({ name: "askrigor-frozen-tool-list", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    // InMemoryTransport can retain undefined metadata properties. HTTP/JSON drops them, as do the fixtures and
    // toolListVersionOf's canonical JSON digest. Compare the actual wire form, with strict property equality.
    return JSON.parse(JSON.stringify(tools)) as typeof tools;
  } finally {
    await client.close();
    await server.close();
  }
}

export const frozenToolListPath = (surface: FrozenSurface) =>
  new URL(`../tests/fixtures/frozen-tool-lists/${surface}.json`, import.meta.url);

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const write = process.argv[2] === "--write";
  if (write) await mkdir(new URL("../tests/fixtures/frozen-tool-lists/", import.meta.url), { recursive: true });
  for (const surface of FROZEN_TOOL_LIST_SURFACES) {
    const tools = await servedToolList(frozenSurfaceServer(surface));
    if (write) await writeFile(frozenToolListPath(surface), `${JSON.stringify(tools, null, 2)}\n`);
    else if (!isDeepStrictEqual(JSON.parse(await readFile(frozenToolListPath(surface), "utf8")), tools)) {
      throw new Error(`${surface}: ${TOOL_LIST_FROZEN_MESSAGE}`);
    }
    const omitted = tools.filter(({ inputSchema }) => !Object.hasOwn(inputSchema.properties ?? {}, "later_inputs"))
      .map(({ name }) => name);
    process.stdout.write(`${surface}: tool_list_version ${digestCanonicalJson(tools).slice(0, 16)}; ` +
      `${Buffer.byteLength(JSON.stringify({ tools }))} bytes; without later_inputs: ${omitted.join(", ") || "none"}\n`);
  }
}
