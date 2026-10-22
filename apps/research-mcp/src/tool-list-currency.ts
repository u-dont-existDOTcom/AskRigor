import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { digestCanonicalJson } from "./lessons/incident-contracts.js";

/**
 * Owner request (2026-10-22): an app keeps the tool list it loaded until its user refreshes AskRigor, so after a
 * release that changes the tools it cannot send their newest fields, and nothing told the user. The model gives the
 * user this sentence.
 */
export const TOOL_LIST_REFRESH_SENTENCE = "AskRigor has been updated since this app loaded its tools. To use its " +
  "newest checks, refresh AskRigor in this app's settings and start a new chat.";

/** A tool list version: 16 hexadecimal characters of the SHA-256 of the tool list (toolListVersionOf). */
const VERSION_PATTERN = /^[0-9a-f]{16}$/u;

export const toolListVersionSchema = z.string().trim().max(100);

/** tool_list_version's description as a surface publishes it: it carries that surface's version, which the model sends back. */
export function toolListVersionDescription(version: string | undefined): string {
  return version === undefined
    ? "The version of AskRigor's tool list this app loaded."
    : `The version of AskRigor's tool list this app loaded: "${version}". The result says whether this app's copy ` +
      "of AskRigor's tools is out of date.";
}

/** tool_list_version as a surface publishes it (toolListVersionDescription). */
export function toolListVersionField(version: string | undefined) {
  return toolListVersionSchema.optional().describe(toolListVersionDescription(version));
}

/** A version as a call or a surface gives it, or undefined when it is not one. */
export function toolListVersionOrUndefined(value: string | undefined): string | undefined {
  const version = value?.trim().toLowerCase();
  return version !== undefined && VERSION_PATTERN.test(version) ? version : undefined;
}

/**
 * The version of a tool list as an app keeps it: the SHA-256 of what tools/list returns (each tool's name,
 * description, schemas, annotations and metadata), canonically serialized, to 16 hexadecimal characters. Taken from a
 * server made without the running versions and without this version, so the release's version text is not part of
 * it: a release that changes no tool keeps the version, and an app's copy from before it stays current.
 */
export async function toolListVersionOf(server: McpServer): Promise<string> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "askrigor-tool-list-version", version: "1.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    return digestCanonicalJson(tools).slice(0, 16);
  } finally {
    await client.close();
    await server.close();
  }
}

/**
 * Whether this app's copy of AskRigor's tools is older than the tools this surface serves, as a sentence for the
 * model. Exact when the call sends the version its tool list gives; when it sends none, the model checks its own
 * tool list for the field, which every copy from before this field lacks. Nothing while the surface's version is
 * unknown.
 */
export function toolListNotice(declared: string | undefined, current: string | undefined): string | undefined {
  if (current === undefined || !VERSION_PATTERN.test(current)) return undefined;
  const version = toolListVersionOrUndefined(declared);
  if (version !== undefined) {
    return version === current
      ? undefined
      : "This app's copy of AskRigor's tools is older than the tools AskRigor now serves. Before anything else, tell " +
        `the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`;
  }
  return "If get_protocol_manifest in this app's tool list has no tool_list_version field, this app's copy of " +
    `AskRigor's tools is out of date: tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}" If it has ` +
    "one, send the version its description gives.";
}
