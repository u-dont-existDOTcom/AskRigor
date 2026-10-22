import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { TOOL_LIST_REFRESH_HINT } from "../apps/research-mcp/src/research-finalization-gate.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { TOOL_LIST_REFRESH_SENTENCE, toolListNotice } from "../apps/research-mcp/src/tool-list-currency.js";

// Owner request (2026-10-22): an app keeps the tool list it loaded until its user refreshes AskRigor, and after a
// release nothing told the user. A call now sends back the build its tool list names; a different one is told plainly.
const RUNNING = { hrp: "20.6.30", universal: "20.5.47", build: "8c0ffee5a1b2c3d4e5f60718293a4b5c6d7e8f90" };
const EARLIER = "71f09f636aaf32fdf4440a93cd5b874bc8a3cb9b";

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(runningVersions = RUNNING) {
  const server = createAskRigorServer("standard", { runningVersions });
  const client = new Client({ name: "tool-list-currency-test", version: "1.0.0" });
  clients.push(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const text = (result: { content: unknown }) =>
  (result.content as Array<{ type: string; text?: string }>).map(({ text: part }) => part ?? "").join("\n");

describe("telling the user when the app's copy of AskRigor's tools is out of date", () => {
  it("compares the build a call sends exactly, and leaves the comparison to the model when none is sent", () => {
    expect(toolListNotice(RUNNING.build, RUNNING)).toBeUndefined();
    expect(toolListNotice(RUNNING.build.slice(0, 12).toUpperCase(), RUNNING)).toBeUndefined();
    expect(toolListNotice(EARLIER, RUNNING)).toBe(
      "This app's copy of AskRigor's tools is from an earlier build than the one AskRigor now runs (8c0ffee5a1b2). " +
        `Before anything else, tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`
    );
    for (const declared of [undefined, "", "the latest", "71f09"]) {
      expect(toolListNotice(declared, RUNNING)).toBe(
        "AskRigor now runs HRP 20.6.30, Universal 20.5.47, build 8c0ffee5a1b2c3d4e5f60718293a4b5c6d7e8f90. If the " +
          "versions at the start of get_protocol_manifest's description in this app's tool list are older, the app's " +
          `copy of AskRigor's tools is out of date: tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`
      );
    }
    // A server that does not know its build says nothing.
    expect(toolListNotice(EARLIER, { ...RUNNING, build: "unknown" })).toBeUndefined();
    expect(toolListNotice(undefined, undefined)).toBeUndefined();
  });

  it("publishes the running build in the field the model sends back, on the first calls of research", async () => {
    const { tools } = await (await connect()).listTools();
    for (const name of ["get_protocol_manifest", "manage_research_access"]) {
      const field = tools.find((tool) => tool.name === name)?.inputSchema.properties?.tool_list_build as
        { type?: string; description?: string } | undefined;
      expect(field?.type).toBe("string");
      expect(field?.description).toContain(`"${RUNNING.build}"`);
    }
  });

  it("says so in get_protocol_manifest's result, and nothing when the tool list is current", async () => {
    const client = await connect();
    const manifest = (toolListBuild?: string) => client.callTool({
      name: "get_protocol_manifest",
      arguments: { protocol: "hrp", ...(toolListBuild === undefined ? {} : { tool_list_build: toolListBuild }) },
    });
    expect(text(await manifest(EARLIER))).toContain(`tell the user, in their language: "${TOOL_LIST_REFRESH_SENTENCE}"`);
    expect(text(await manifest(EARLIER))).toContain("from an earlier build");
    expect(text(await manifest(RUNNING.build))).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
    expect(text(await manifest())).toContain("If the versions at the start of get_protocol_manifest's description");
  });

  it("puts the notice first in manage_research_access's result, even when the call is refused", async () => {
    const client = await connect();
    const refused = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "inspect", tool_list_build: EARLIER },
    });
    expect(refused.isError).toBe(true);
    expect(text(refused).startsWith("This app's copy of AskRigor's tools is from an earlier build")).toBe(true);
    const current = await client.callTool({
      name: "manage_research_access",
      arguments: { action: "inspect", tool_list_build: RUNNING.build },
    });
    expect(text(current)).not.toContain(TOOL_LIST_REFRESH_SENTENCE);
  });

  it("asks the model to tell the user when the final check misses a field the app's tools may lack", () => {
    expect(TOOL_LIST_REFRESH_HINT).toContain("tell the user, in their language");
    expect(TOOL_LIST_REFRESH_HINT).toContain("refreshing AskRigor in the app's settings and starting a new chat");
  });
});
