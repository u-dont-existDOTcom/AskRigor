import { errorEnvelope, okEnvelope } from "@askrigor/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { UpstreamHttpError } from "../packages/sources/src/http.js";
import type { AcquireOpenFullTextRuntime } from "../packages/sources/src/open-full-text.js";
import type { FullTextDiscoveryAttempt } from "../packages/sources/src/full-text-admission.js";
import { syntheticArticleText, syntheticPdf } from "./helpers/synthetic-full-text.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(),
  acquireOpenFullText: acquire
}));

const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");
const { OTHER_FULL_TEXT_ROUTE } = await import("../apps/research-mcp/src/register-tools.js");

const SECRET = "full-text-lead-test-secret-0123456789ab";
const DOI = "10.1000/example-trial";
const TITLE = "Synthetic exact-title receipt study";
const PMCID = "PMC9990001";
const SEARCH = { queries: [`${DOI} public copy`, `"${TITLE}" public copy`] };

function noOpenText(attempts: FullTextDiscoveryAttempt[]) {
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

async function actualAcquisition(overrides: AcquireOpenFullTextRuntime = {}) {
  const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
  acquire.mockImplementationOnce((input) => actual.acquireOpenFullText(input, { email: "research@example.test" }, {
    searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result",
      accessStatus: "complete", returned: 1, pagination: { exhausted: true },
      data: [{ source: "MED", id: "9990001", doi: DOI, title: TITLE }] }),
    unpaywallRuntime: { resolve: async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution",
      accessStatus: "metadata_only", returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title: TITLE,
        is_oa: false, oa_status: "closed", full_text_lead_status: "no_open_location_found", oa_locations: [] } }) },
    ...overrides
  }));
}

function openResolution(urls: string[]) {
  const locations = urls.map((pdf_url) => ({ pdf_url, transport: "https" as const, host_type: "repository", version: "publishedVersion" }));
  return okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: "metadata_only",
    returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title: TITLE, is_oa: true, oa_status: "green",
      full_text_lead_status: "open_location_available" as const, best_location: locations[0], oa_locations: locations } });
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
    vi.unstubAllGlobals();
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
    // Owner answer 147a: a completed lead names the next step, another full-text tool this app has connected.
    expect(text).toBe(`acquire open full text completed. ${OTHER_FULL_TEXT_ROUTE}`);
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({
      ok: true,
      kind: "full_text_lead",
      claims: { doi: DOI }
    });
  });

  // Owner answer 157a (2026-10-22): on a free account the AI took another app's paid text tool, so the step names a
  // free route first, and a tool that costs the user credits only after the user's yes in this conversation.
  it("names another app's free route first, and a tool that costs credits only after the user's yes", () => {
    expect(OTHER_FULL_TEXT_ROUTE).toBe("If this study could change the answer and this app has another full-text " +
      "tool connected (a library or article service), read it there next: try a free route first, such as a free PDF " +
      "tool, and use a tool that costs the user credits only after the user says yes to that cost in this " +
      "conversation. Give this study's finalize_research key_sources entry other_route: read, unavailable, cost or " +
      "none. A study read that way is reported as read through another tool, not audited by AskRigor.");
  });

  it("signs a service-failure receipt for Europe PMC 500, and asks for a spaced retry", async () => {
    acquire.mockResolvedValueOnce(noOpenText([
      { route: "europe_pmc", result: "error", identifier: PMCID, http_status: 500 },
      { route: "unpaywall", result: "inaccessible", identifier: DOI }
    ]));
    const { text, receipt } = await acquireOnce();
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({ ok: true,
      kind: "full_text_route_failure", claims: { doi: DOI, pmcid: PMCID, routes: ["europe_pmc"], http: ["500"] } });
    expect(text).toContain("A full-text service failed (Europe PMC: HTTP 500), and the research_receipt records it. " +
      "Try acquire_open_full_text again at least a minute after this attempt; if the service fails again, pass both " +
      "receipts to finalize_research and cite this study as a lead.");
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

  // 23 Oct (q137): a 403 blocked every lead and earned no receipt, so the final check's step could never close. A refusal
  // ends the search there; a service failure earns a retry receipt.
  it.each([403, 404, 429, 503])("after actual Unpaywall acquisition receives HTTP %i, signs a lead for a refusal and a retry receipt for a service failure", async (httpStatus) => {
    const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    acquire.mockImplementationOnce((input) => actual.acquireOpenFullText(input, { email: "research@example.test" }, {
      searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", accessStatus: "complete", returned: 0, pagination: { exhausted: true }, data: [] }),
      unpaywallRuntime: { resolve: async () => errorEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", primaryIdentifier: DOI,
        accessStatus: httpStatus === 429 ? "rate_limited" : "error", code: "synthetic_upstream_failure", message: "Synthetic failure", httpStatus, retryable: true, data: {} }) }
    }));
    const result = await acquireOnce({ doi: DOI, public_copy_search: { queries: [`${DOI} synthetic exact query`, "synthetic search query"] } });
    if (httpStatus === 503 || httpStatus === 429) expect(verifyResearchReceipt(result.receipt!, { secret: SECRET })).toMatchObject({
      ok: true, kind: "full_text_route_failure", claims: { doi: DOI, routes: ["unpaywall"], http: [String(httpStatus)] }
    });
    else expect(verifyResearchReceipt(result.receipt!, { secret: SECRET })).toMatchObject({ ok: true, kind: "full_text_lead",
      claims: { doi: DOI } });
    expect(result.text).toContain("The public-copy search is declared");
    expect(result.text).not.toContain("paper inaccessible");
  });

  it.each([undefined, { status: "not_declared", query_count: 0 },
    { status: "missing_exact_identifiers", missing: ["title"], query_count: 2 }])(
    "does not sign a service failure without the declared search %j", async (public_copy_search) => {
      const result = noOpenText([{ route: "europe_pmc", result: "error", http_status: 500 }]);
      acquire.mockResolvedValueOnce({ ...result, data: { ...result.data, public_copy_search } });
      const output = await acquireOnce();
      expect(output.receipt).toBeUndefined();
      expect(output.text).toContain("A lead receipt needs the public-copy search recorded:");
    });

  it.each(["500", "timeout", "network"])("retains actual Europe PMC %s details and no queries", async (failure) => {
    const fetch = vi.fn(async (_url: string | URL | Request) => {
      if (failure === "timeout") throw new DOMException("Synthetic timeout", "TimeoutError");
      if (failure === "network") throw new TypeError("fetch failed");
      return new Response("Synthetic failure", { status: 500 });
    });
    vi.stubGlobal("fetch", fetch);
    await actualAcquisition();
    const result = await acquireOnce({ doi: DOI.toUpperCase(), pmcid: PMCID, public_copy_search: SEARCH });
    const verified = verifyResearchReceipt(result.receipt!, { secret: SECRET });
    expect(verified).toMatchObject({ ok: true, kind: "full_text_route_failure", claims: {
      doi: DOI, pmcid: PMCID, routes: ["europe_pmc"], http: [failure], state: "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH"
    } });
    if (!verified.ok) throw new Error("Missing verified receipt");
    expect(Object.keys(verified.claims).sort()).toEqual(["doi", "http", "pmcid", "routes", "state", "t"]);
    for (const query of SEARCH.queries) expect(JSON.stringify(result.output)).not.toContain(query);
    expect(fetch).toHaveBeenCalled();
    for (const [url] of fetch.mock.calls) expect(String(url)).toBe(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/${PMCID}/fullTextXML`);
  });

  it.each([403, 404])("does not count Europe PMC HTTP %i as a service failure", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Synthetic response", { status })));
    await actualAcquisition();
    const { receipt } = await acquireOnce({ doi: DOI, pmcid: PMCID, public_copy_search: SEARCH });
    if (receipt !== undefined) expect(verifyResearchReceipt(receipt, { secret: SECRET })).toMatchObject({ kind: "full_text_lead" });
  });

  // A copy AskRigor could not read leaves no lead, so it earns a retry receipt: two failed attempts a minute apart let
  // the final check cite the study as a lead instead of asking again forever.
  it.each(["html", "extraction"])("signs a retry receipt for an unreadable Unpaywall copy (%s)", async (failure) => {
    const bytes = new TextEncoder().encode(failure === "html" ? "<html>Synthetic landing page</html>" : "%PDF-1.4 synthetic");
    await actualAcquisition({ unpaywallRuntime: {
      resolve: async () => openResolution(["https://repository.example.test/paper.pdf"]),
      fetchDocument: async (url) => ({ finalUrl: url, contentType: failure === "html" ? "text/html" : "application/pdf",
        bytes, contentLength: bytes.byteLength, redirects: [] }),
      extractPdf: async () => { throw new Error("Synthetic extraction failure"); }
    } });
    const { receipt, text } = await acquireOnce({ doi: DOI, public_copy_search: SEARCH });
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({ ok: true, kind: "full_text_route_failure",
      claims: { doi: DOI, routes: ["unpaywall"], http: ["error"] } });
    expect(text).toContain("A full-text service failed (Unpaywall: error), and the research_receipt records it.");
  });

  it("keeps a service failure even beside an Unpaywall partial-text result", async () => {
    await actualAcquisition({ acquireUnpaywallFullText: async () => errorEnvelope({ provider: "unpaywall",
      recordType: "open_full_text_acquisition", accessStatus: "partial", code: "synthetic_partial", message: "Synthetic",
      data: { requested_doi: DOI, outcome: "possibly_useful_lead", discovery_status: "metadata_only",
        acquisition_state: "PARTIAL_TEXT_READABLE", access_boundary: "Synthetic partial copy",
        attempted_locations: [{ url: "https://repository.example.test/failed.pdf", result: "fetch_failed", http_status: 503 },
          { url: "https://repository.example.test/partial.pdf", result: "partial_text" }] } }) });
    const { receipt, output } = await acquireOnce({ doi: DOI, public_copy_search: SEARCH });
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({ ok: true, kind: "full_text_route_failure",
      claims: { routes: ["unpaywall"], http: ["503"] } });
    expect(output).toMatchObject({ structuredContent: { discovery_attempts: expect.arrayContaining([
      expect.objectContaining({ route: "unpaywall", result: "partial_text" }),
      expect.objectContaining({ route: "unpaywall", result: "error", http_status: 503 })
    ]) } });
  });

  it.each([false, true])("a supplied candidate failure cannot earn or block a primary receipt (primary=%s)", async (primary) => {
    await actualAcquisition(primary ? { fetchEuropePmcFullText: async () => {
      throw new UpstreamHttpError(500, "Synthetic service failure");
    }, candidateRuntime: { fetchDocument: async () => { throw new UpstreamHttpError(503, "Synthetic candidate failure"); } } }
      : { candidateRuntime: { fetchDocument: async () => { throw new UpstreamHttpError(503, "Synthetic candidate failure"); } } });
    const result = await acquireOnce({ doi: DOI, ...(primary ? { pmcid: PMCID } : {}), public_copy_search: SEARCH,
      candidate_urls: [{ url: "https://repository.example.test/copy.pdf" }] });
    if (primary) expect(verifyResearchReceipt(result.receipt!, { secret: SECRET })).toMatchObject({ ok: true,
      kind: "full_text_route_failure", claims: { routes: ["europe_pmc"], http: ["500"] } });
    else {
      expect(result.receipt).toBeUndefined();
      expect(result.text).toContain("no AskRigor route failed");
      expect(result.text).toContain("candidate_texts");
    }
  });

  it("signs only genuine primary failures, with sorted routes, statuses and the failing PMCID", async () => {
    const attempts: FullTextDiscoveryAttempt[] = [
      { route: "unpaywall", result: "error", http_status: 503 },
      { route: "europe_pmc", result: "error", identifier: PMCID, http_status: 500 },
      { route: "europe_pmc", result: "error", identifier: "PMC9990002", http_status: 403 },
      { route: "candidate", result: "error", http_status: 502 }
    ];
    const base = noOpenText(attempts);
    acquire.mockResolvedValueOnce({ ...base, data: { ...base.data, requested_pmcid: "PMC9990003",
      acquisition_state: "PARTIAL_TEXT_READABLE" } });
    const result = await acquireOnce();
    expect(verifyResearchReceipt(result.receipt!, { secret: SECRET })).toMatchObject({ ok: true,
      kind: "full_text_route_failure", claims: { doi: DOI, pmcid: PMCID, routes: ["europe_pmc", "unpaywall"],
        http: ["500", "503"], state: "PARTIAL_TEXT_READABLE" } });
  });

  // q137 of 23 Oct, NEJM: every attempt met an Unpaywall 403 beside a copy AskRigor could not fetch, earned no
  // receipt, and the final check asked for another attempt each time. The refusal ended the search, so it is a lead.
  it("signs a lead when an Unpaywall 403 sits beside a copy that could not be fetched", async () => {
    const base = noOpenText([
      { route: "europe_pmc", result: "not_found" },
      { route: "unpaywall", result: "error", identifier: DOI, http_status: 403 },
      { route: "candidate", result: "fetch_blocked" }
    ]);
    acquire.mockResolvedValueOnce({ ...base, data: { ...base.data, acquisition_state: "CANDIDATE_FOUND_FETCH_BLOCKED" } });
    const { receipt, text } = await acquireOnce();
    expect(verifyResearchReceipt(receipt!, { secret: SECRET })).toMatchObject({ ok: true, kind: "full_text_lead",
      claims: { doi: DOI, state: "CANDIDATE_FOUND_FETCH_BLOCKED" } });
    expect(text).not.toContain("has no receipt");
  });

  it("an admitted candidate text still wins over a primary-service failure", async () => {
    await actualAcquisition({ fetchEuropePmcFullText: async () => { throw new UpstreamHttpError(500, "Synthetic"); } });
    const result = await acquireOnce({ doi: DOI, pmcid: PMCID, public_copy_search: SEARCH,
      candidate_texts: [{ url: "https://www.academia.edu/synthetic-copy", retrieved_via: "client_search_index",
        text: syntheticArticleText(`${TITLE} DOI ${DOI}`) }] });
    expect(result.output).toMatchObject({ structuredContent: { status: "full_text_available", acquisition_state: "FULL_TEXT_READABLE" } });
    if (result.receipt !== undefined) expect(verifyResearchReceipt(result.receipt, { secret: SECRET })).not.toMatchObject({ kind: "full_text_route_failure" });
    expect(result.text).not.toContain("A full-text service failed (");
  });

  it("retains a real Unpaywall location failure alongside a partial location", async () => {
    const bytes = syntheticPdf(`${TITLE} DOI ${DOI}\nMethods\nSynthetic partial methods.`);
    await actualAcquisition({ unpaywallRuntime: {
      resolve: async () => openResolution(["https://repository.example.test/failed.pdf", "https://repository.example.test/partial.pdf"]),
      fetchDocument: async (url) => {
        if (url.includes("failed")) throw new UpstreamHttpError(503, "Synthetic service failure");
        return { finalUrl: url, contentType: "application/pdf", bytes, contentLength: bytes.byteLength, redirects: [] };
      }
    } });
    const result = await acquireOnce({ doi: DOI, public_copy_search: SEARCH });
    expect(verifyResearchReceipt(result.receipt!, { secret: SECRET })).toMatchObject({ ok: true,
      kind: "full_text_route_failure", claims: { routes: ["unpaywall"], http: ["503"] } });
  });

});
