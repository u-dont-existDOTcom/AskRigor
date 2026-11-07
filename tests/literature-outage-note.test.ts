import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { builtContent } from "./helpers/text-payload.js";
import {
  EUROPE_PMC_OUTAGE_NOTE,
  PUBMED_OUTAGE_NOTE,
  literatureOutageNote
} from "../apps/research-mcp/src/register-tools.js";

// The owner regression run of 5 Nov 2026: NCBI's PubMed search failed for everyone from 03:49 UTC, and Europe PMC
// often failed from the server, while the results said only "access status error".

const clients: Client[] = [];
const NCBI_NAMES = ["NCBI_TOOL", "NCBI_EMAIL", "NCBI_API_KEY"] as const;
const savedNcbi = Object.fromEntries(NCBI_NAMES.map((name) => [name, process.env[name]]));

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const name of NCBI_NAMES) {
    if (savedNcbi[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedNcbi[name];
    }
  }
});

async function connectedClient(): Promise<Client> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function ncbiConfigured(): void {
  process.env.NCBI_TOOL = "askrigor-mcp-tests";
  process.env.NCBI_EMAIL = "maintainer@example.test";
  process.env.NCBI_API_KEY = "outage-test-key";
}

describe("a literature index's own failure is named in the result (5 Nov 2026)", () => {
  it("names the provider's failures, not refusals of the query or of access", () => {
    for (const code of ["pubmed_upstream_unavailable", "pubmed_response_invalid", "pubmed_rate_limited"]) {
      expect(literatureOutageNote("pubmed", { code, http_status: 500 })).toBe(PUBMED_OUTAGE_NOTE);
    }
    expect(literatureOutageNote("pubmed", { code: "pubmed_request_failed" })).toBe(PUBMED_OUTAGE_NOTE);
    expect(literatureOutageNote("pubmed", { code: "pubmed_request_failed", http_status: 400 })).toBe("");
    expect(literatureOutageNote("pubmed", { code: "pubmed_access_denied", http_status: 403 })).toBe("");
    expect(literatureOutageNote("pubmed", { code: "pubmed_record_mismatch" })).toBe("");
    expect(literatureOutageNote("pubmed", undefined)).toBe("");
    for (const code of ["europe_pmc_upstream_unavailable", "europe_pmc_unreachable", "europe_pmc_response_invalid"]) {
      expect(literatureOutageNote("europe_pmc", { code })).toBe(EUROPE_PMC_OUTAGE_NOTE);
    }
    expect(literatureOutageNote("europe_pmc", { code: "europe_pmc_request_failed", http_status: 400 })).toBe("");
    // One provider's code never gets the other's note.
    expect(literatureOutageNote("europe_pmc", { code: "pubmed_upstream_unavailable" })).toBe("");
  });

  it("tells the AI that PubMed itself failed and to search Europe PMC instead", async () => {
    ncbiConfigured();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><h1>Server Error</h1></html>", { status: 200 })));
    const client = await connectedClient();

    const result = await client.callTool({ name: "search_pubmed", arguments: { query: "didgeridoo sleep apnoea" } });

    expect(result.isError).toBe(true);
    expect(builtContent(result)).toEqual([{
      type: "text",
      text: `PubMed search returned 0 PMID record(s); access status error.${PUBMED_OUTAGE_NOTE}`
    }]);
    expect(result.structuredContent).toMatchObject({ error: { code: "pubmed_response_invalid" }, data: [] });
    expect(JSON.stringify(result)).not.toContain("outage-test-key");
  });

  it("keeps a refused PubMed query without the note", async () => {
    ncbiConfigured();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad query", { status: 400 })));
    const client = await connectedClient();

    const result = await client.callTool({ name: "search_pubmed", arguments: { query: "didgeridoo[[" } });

    expect(builtContent(result)).toEqual([{
      type: "text",
      text: "PubMed search returned 0 PMID record(s); access status error."
    }]);
    expect(result.structuredContent).toMatchObject({
      error: { code: "pubmed_request_failed", http_status: 400 }
    });
  });

  it("tells the AI that Europe PMC itself failed and to search PubMed instead", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 200 })));
    const client = await connectedClient();

    const result = await client.callTool({
      name: "search_europe_pmc",
      arguments: { query: "didgeridoo sleep apnoea" }
    });

    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content?.text).toBe(`Europe PMC search returned 0 record(s); access status error.${EUROPE_PMC_OUTAGE_NOTE}`);
    expect(result.structuredContent).toMatchObject({ error: { code: "europe_pmc_response_invalid" } });
  });
});
