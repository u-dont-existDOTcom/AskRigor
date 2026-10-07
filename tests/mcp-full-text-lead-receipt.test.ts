import { errorEnvelope, okEnvelope } from "@askrigor/contracts";
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
      public_copy_search: { status: "declared", query_count: 2 },
      access_boundary: "No identity-verified open full text could be indexed through Europe PMC or Unpaywall."
    }
  };
}

async function acquireOnce(input: Record<string, unknown> = { doi: DOI }): Promise<{ text: string; receipt?: string; output: unknown }> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-full-text-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const result = await client.callTool({ name: "acquire_open_full_text", arguments: input });
    expect(result.isError).not.toBe(true);
    return {
      output: result,
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

  it.each([undefined, { status: "not_declared", query_count: 0 },
    { status: "missing_exact_identifiers", missing: ["doi"], query_count: 2 },
    { status: "missing_exact_identifiers", missing: ["title"], query_count: 2 }])("signs no receipt for incomplete expanded search %j", async (public_copy_search) => {
    const result = noOpenText([{ route: "europe_pmc", result: "not_found" }]);
    acquire.mockResolvedValueOnce({ ...result, data: { ...result.data, public_copy_search, acquisition_state: "PRIMARY_OA_ROUTES_EXHAUSTED" } });
    expect((await acquireOnce()).receipt).toBeUndefined();
  });

  it("signs the state of an exact expanded search finding no copy without retaining queries", async () => {
    const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    const title = "Synthetic exact-title receipt study";
    const queries = [`${DOI} synthetic receipt DOI query marker`, `"${title}" synthetic receipt title query marker`];
    acquire.mockImplementationOnce((input) => actual.acquireOpenFullText(input, { email: "research@example.test" }, {
      searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", accessStatus: "complete", returned: 1, pagination: { exhausted: true }, data: [{ source: "MED", id: "99901", doi: DOI, title }] }),
      unpaywallRuntime: { resolve: async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: "metadata_only", returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title, is_oa: false, oa_status: "closed", full_text_lead_status: "no_open_location_found", oa_locations: [] } }) }
    }));
    const { receipt, output } = await acquireOnce({ doi: DOI, public_copy_search: { queries } });
    const verified = verifyResearchReceipt(receipt!, { secret: SECRET });
    expect(JSON.stringify(output)).not.toContain('"queries":');
    expect(JSON.stringify(verified)).not.toContain('"queries":');
    expect(verified).toMatchObject({ ok: true, kind: "full_text_lead", claims: { doi: DOI, state: "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" } });
    for (const query of queries) {
      expect(JSON.stringify(output)).not.toContain(query);
      expect(JSON.stringify(verified)).not.toContain(query);
    }
  });

  it("signs a lead for a declared search after every source answered without failure", async () => {
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
    expect(text).toContain("A source failed (an outage or rate limit), so this is not yet a completed lead");
    expect(text).toContain("A later acquire_open_full_text attempt can establish a completed boundary");
  });
  it.each(["CANDIDATE_FOUND_FETCH_BLOCKED", "PROVIDER_UNAVAILABLE"] as const)("signs a declared terminal boundary only without a technical failure for %s", async (state) => {
    acquire.mockResolvedValueOnce({ ...noOpenText([{ route: "europe_pmc", result: "not_found" }]), data: {
      ...noOpenText([]).data, acquisition_state: state,
      candidates: [{ url: "https://www.academia.edu/fixture", source_class: "researcher_upload", source_class_basis: "known_host", retrieval_provider: "direct", state,
        identity_verification: "not_verified", sections_observed: [], completeness: "unavailable", retrieved_at: "2026-10-07T00:00:00.000Z" }]
    } });
    const { receipt } = await acquireOnce();
    if (state === "PROVIDER_UNAVAILABLE") expect(receipt).toBeUndefined();
    else expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({ ok: true, kind: "full_text_lead", claims: { doi: DOI, state } });
  });

  it.each([429, 503])("signs no lead after actual Unpaywall acquisition receives HTTP %i", async (httpStatus) => {
    const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    acquire.mockImplementationOnce((input) => actual.acquireOpenFullText(input, { email: "research@example.test" }, {
      searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", accessStatus: "complete", returned: 0, pagination: { exhausted: true }, data: [] }),
      unpaywallRuntime: { resolve: async () => errorEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", primaryIdentifier: DOI,
        accessStatus: httpStatus === 429 ? "rate_limited" : "error", code: "synthetic_upstream_failure", message: "Synthetic failure", httpStatus, retryable: true, data: {} }) }
    }));
    const result = await acquireOnce({ doi: DOI, public_copy_search: { queries: [`${DOI} synthetic exact query`, "synthetic search query"] } });
    expect(result.receipt).toBeUndefined();
    expect(result.text).toContain("The public-copy search is declared");
    expect(result.text).not.toContain("paper inaccessible");
  });

});
