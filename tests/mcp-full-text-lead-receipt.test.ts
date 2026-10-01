import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(),
  acquireOpenFullText: acquire
}));

const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");

const SECRET = "full-text-lead-test-secret-0123456789ab";
const DOI = "10.1000/example-trial";

function noOpenText(attempts: Array<{ route: string; result: string; identifier?: string }>) {
  return {
    access_status: attempts.some(({ result }) => result === "error") ? "error" : "not_found",
    data: {
      requested_doi: DOI,
      discovery_attempts: attempts,
      access_boundary: "No identity-verified open full text could be indexed through Europe PMC or Unpaywall."
    }
  };
}

async function acquireOnce(): Promise<{ text: string; receipt?: string }> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-full-text-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({ name: "acquire_open_full_text", arguments: { doi: DOI } });
    expect(result.isError).not.toBe(true);
    return {
      text: (result.content as Array<{ text: string }>)[0]!.text,
      receipt: (result.structuredContent as { research_receipt?: string }).research_receipt
    };
  } finally {
    await server.close();
  }
}

describe("MCP full-text lead receipts", () => {
  const previous = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
  beforeEach(() => {
    process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = SECRET;
    acquire.mockReset();
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    else process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = previous;
  });

  it("signs a lead when every source answered that no open text exists", async () => {
    acquire.mockResolvedValueOnce(noOpenText([
      { route: "europe_pmc", result: "not_found" },
      { route: "unpaywall", result: "inaccessible", identifier: DOI }
    ]));
    const { text, receipt } = await acquireOnce();
    expect(text).toBe("acquire open full text completed.");
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({
      ok: true,
      kind: "full_text_lead",
      claims: { doi: DOI }
    });
  });

  it("signs no lead when a source failed, and asks for a retry", async () => {
    acquire.mockResolvedValueOnce(noOpenText([
      { route: "europe_pmc", result: "error" },
      { route: "unpaywall", result: "inaccessible", identifier: DOI }
    ]));
    const { text, receipt } = await acquireOnce();
    expect(receipt).toBeUndefined();
    expect(text).toContain("A source failed (an outage or rate limit), so this is not yet a lead");
    expect(text).toContain("call acquire_open_full_text again later before listing the study as lead_only");
  });
});
