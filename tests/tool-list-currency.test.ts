import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { TOOL_LIST_REFRESH_HINT } from "../apps/research-mcp/src/research-finalization-gate.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  TOOL_LIST_REFRESH_SENTENCE, toolListNotice, toolListVersionOf,
} from "../apps/research-mcp/src/tool-list-currency.js";

// Owner request (2026-10-22): an app keeps the tool list it loaded until its user refreshes AskRigor, and after a
// release nothing told the user. A call now sends back the version its tool list gives; an older one is told plainly.
const VERSION = "3f9a0c71d2b84e65";
const OLDER = "0b1c2d3e4f5a6b7c";
const RUNNING = { hrp: "20.6.30", universal: "20.5.47", build: "8c0ffee5a1b2c3d4e5f60718293a4b5c6d7e8f90" };
const OLDER_TOOLS = `tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`;

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

// null: a surface whose version is not known yet.
async function connect(toolListVersion: string | null = VERSION) {
  const server = createAskRigorServer("standard", { runningVersions: RUNNING, toolListVersion: toolListVersion ?? undefined });
  const client = new Client({ name: "tool-list-currency-test", version: "1.0.0" });
  clients.push(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const text = (result: { content: unknown }) =>
  (result.content as Array<{ type: string; text?: string }>).map(({ text: part }) => part ?? "").join("\n");

describe("telling the user when the app's copy of AskRigor's tools is out of date", () => {
  it("compares the version a call sends exactly, and otherwise asks the model to look for the field", () => {
    expect(toolListNotice(VERSION, VERSION)).toBeUndefined();
    expect(toolListNotice(` ${VERSION.toUpperCase()} `, VERSION)).toBeUndefined();
    expect(toolListNotice(OLDER, VERSION)).toBe(
      "This app's copy of AskRigor's tools is older than the tools AskRigor now serves. Before anything else, tell " +
        `the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`
    );
    // Copies from before this field have none to send; a value that is not a version is not compared.
    for (const declared of [undefined, "", "the latest", VERSION.slice(0, 12), RUNNING.build]) {
      expect(toolListNotice(declared, VERSION)).toBe(
        "If get_protocol_manifest in this app's tool list has no tool_list_version field, this app's copy of " +
          `AskRigor's tools is out of date: tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}" If it ` +
          "has one, send the version its description gives."
      );
    }
    // A surface whose version is not known says nothing.
    expect(toolListNotice(OLDER, undefined)).toBeUndefined();
    expect(toolListNotice(undefined, "unknown")).toBeUndefined();
  });

  it("takes a surface's version from its tool list, which the release's version text is not part of", async () => {
    const standard = await toolListVersionOf(createAskRigorServer("standard"));
    expect(standard).toMatch(/^[0-9a-f]{16}$/u);
    // The same tools give the same version, so a release that changes none keeps it.
    expect(await toolListVersionOf(createAskRigorServer("standard"))).toBe(standard);
    // Another catalog, or another tool description, gives another version: the HTTP server therefore takes it from
    // a server made without the running versions, whose text changes at every release.
    expect(await toolListVersionOf(createAskRigorServer("gemini"))).not.toBe(standard);
    expect(await toolListVersionOf(createAskRigorServer("standard", { runningVersions: RUNNING }))).not.toBe(standard);
  });

  it("publishes the surface's version in the field the model sends back, on the first calls of research", async () => {
    const { tools } = await (await connect()).listTools();
    for (const name of ["get_protocol_manifest", "manage_research_access"]) {
      const field = tools.find((tool) => tool.name === name)?.inputSchema.properties?.tool_list_version as
        { type?: string; description?: string } | undefined;
      expect(field?.type).toBe("string");
      expect(field?.description).toContain(`"${VERSION}"`);
    }
  });

  it("says so in get_protocol_manifest's result, and nothing when the tool list is current", async () => {
    const client = await connect();
    const manifest = (toolListVersion?: string) => client.callTool({
      name: "get_protocol_manifest",
      arguments: { protocol: "hrp", ...(toolListVersion === undefined ? {} : { tool_list_version: toolListVersion }) },
    });
    expect(text(await manifest(OLDER))).toContain(OLDER_TOOLS);
    expect(text(await manifest(OLDER))).toContain("older than the tools AskRigor now serves");
    expect(text(await manifest(VERSION))).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
    expect(text(await manifest())).toContain("If get_protocol_manifest in this app's tool list has no tool_list_version");
    // Before the surface's version is known, nothing is said.
    const unknown = await connect(null);
    expect(text(await unknown.callTool({
      name: "get_protocol_manifest", arguments: { protocol: "hrp", tool_list_version: OLDER },
    }))).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
  });

  it("puts the notice first in manage_research_access's result, even when the call is refused", async () => {
    const client = await connect();
    const refused = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "inspect", tool_list_version: OLDER },
    });
    expect(refused.isError).toBe(true);
    expect(text(refused).startsWith("This app's copy of AskRigor's tools is older")).toBe(true);
    const current = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "inspect", tool_list_version: VERSION },
    });
    expect(text(current)).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
  });

  it("asks the model to tell the user when the final check misses a field the app's tools may lack", () => {
    expect(TOOL_LIST_REFRESH_HINT).toContain("tell the user, in their language");
    expect(TOOL_LIST_REFRESH_HINT).toContain("refreshing AskRigor in the app's settings and starting a new chat");
  });
});
