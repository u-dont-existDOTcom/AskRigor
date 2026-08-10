import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeCursor,
  fetchPubmedRecord,
  searchPubmed
} from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/pubmed/${name}`, import.meta.url), "utf8");

const NCBI = {
  tool: "askrigor-tests",
  email: "maintainer@example.test",
  apiKey: "ncbi-secret-value"
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PubMed ESearch", () => {
  it("returns stable PMIDs and an adapter-validated opaque next cursor", async () => {
    const body = await fixture("esearch-page-1.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchPubmed(
      {
        query: "example intervention[Title/Abstract]",
        dateRange: { start: "2024-01-02", end: "2025-03-04" },
        pageSize: 250
      },
      NCBI
    );

    expect(result.data).toEqual([
      { pmid: "40123456" },
      { pmid: "39876543" }
    ]);
    expect(result.access_status).toBe("complete");
    expect(result.pagination).toMatchObject({
      page_size: 100,
      returned: 2,
      exhausted: false
    });
    expect(result.pagination.next_cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(result.pagination.next_cursor!)).toEqual({ retstart: 2 });
    expect(result.raw_metadata).toEqual({ total_count: 3 });

    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.origin + request.pathname).toBe(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    );
    expect(Object.fromEntries(request.searchParams)).toEqual({
      db: "pubmed",
      term: "example intervention[Title/Abstract]",
      retmode: "json",
      retstart: "0",
      retmax: "100",
      tool: "askrigor-tests",
      email: "maintainer@example.test",
      api_key: "ncbi-secret-value",
      datetype: "pdat",
      mindate: "2024/01/02",
      maxdate: "2025/03/04"
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
  });

  it("uses a validated cursor offset and returns complete exhausted empty search", async () => {
    const body = await fixture("esearch-empty.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));
    const cursor = "eyJyZXRzdGFydCI6N30";

    const result = await searchPubmed(
      { query: "no matching indexed records", pageSize: 10, cursor },
      { tool: "askrigor-tests", email: "maintainer@example.test" }
    );

    expect(result.data).toEqual([]);
    expect(result.access_status).toBe("complete");
    expect(result.error).toBeUndefined();
    expect(result.pagination).toEqual({
      cursor,
      page_size: 10,
      returned: 0,
      exhausted: true
    });
    expect(requests[0]!.searchParams.get("retstart")).toBe("7");
  });

  it("stops at PubMed's first-10,000 ESearch boundary and reports the limitation", async () => {
    const body = await fixture("esearch-boundary.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchPubmed(
      {
        query: "broad indexed query",
        pageSize: 2,
        cursor: "eyJyZXRzdGFydCI6OTk5OH0"
      },
      NCBI
    );

    expect(result.data).toEqual([
      { pmid: "30000002" },
      { pmid: "30000001" }
    ]);
    expect(result.pagination.next_cursor).toBeUndefined();
    expect(result.pagination.exhausted).toBe(true);
    expect(result.access_status).toBe("partial");
    expect(result.limitations).toEqual([
      "PubMed ESearch exposes only the first 10,000 results for a query; refine the query to retrieve additional records."
    ]);
  });

  it("maps a final 429 to rate_limited instead of an empty complete result", async () => {
    vi.useFakeTimers();
    const body = await fixture("rate-limit.txt");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 429 })));

    const pending = searchPubmed({ query: "rate limited query" }, NCBI);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.data).toEqual([]);
    expect(result.access_status).toBe("rate_limited");
    expect(result.pagination.exhausted).toBe(false);
    expect(result.error).toEqual({
      code: "pubmed_rate_limited",
      message: "PubMed rate limit reached",
      http_status: 429,
      retryable: true
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
  });

  it("rejects malformed queries, pages, cursors, and cursor payloads before fetch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(searchPubmed({ query: "   " }, NCBI)).rejects.toThrow(
      "Invalid PubMed search input"
    );
    await expect(searchPubmed({ query: "valid", pageSize: 0 }, NCBI)).rejects.toThrow(
      "Invalid PubMed search input"
    );
    await expect(searchPubmed({ query: "valid", cursor: "not+base64" }, NCBI)).rejects.toThrow(
      "Invalid PubMed cursor"
    );
    await expect(searchPubmed({
      query: "valid",
      cursor: "eyJyZXRzdGFydCI6IjEwIn0"
    }, NCBI)).rejects.toThrow("Invalid PubMed cursor");
    await expect(searchPubmed({
      query: "valid",
      cursor: "eyJyZXRzdGFydCI6MSwiZXh0cmEiOnRydWV9"
    }, NCBI)).rejects.toThrow("Invalid PubMed cursor");

    expect(upstream).not.toHaveBeenCalled();
  });

  it("maps non-rate access failures explicitly without leaking configuration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden secret details", {
      status: 403
    })));

    const result = await searchPubmed({ query: "access denied query" }, NCBI);

    expect(result.access_status).toBe("inaccessible");
    expect(result.pagination.exhausted).toBe(false);
    expect(result.error).toEqual({
      code: "pubmed_access_denied",
      message: "PubMed access denied",
      http_status: 403,
      retryable: false
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
    expect(JSON.stringify(result)).not.toContain("forbidden secret details");
  });
});

describe("PubMed EFetch", () => {
  it("normalizes only explicitly present citation fields without full-text claims", async () => {
    const body = await fixture("efetch-record.xml");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await fetchPubmedRecord("40123456", NCBI);

    expect(result.access_status).toBe("api_visible_complete");
    expect(result.primary_identifier).toBe("40123456");
    expect(result.data).toEqual({
      pmid: "40123456",
      title: "Recorded effects of an example intervention",
      abstract: "BACKGROUND: A recorded background statement.\nRESULTS: A recorded result statement.",
      journal: "Journal of Recorded Examples",
      dates: [
        { type: "completed", value: "2025-02-14" },
        { type: "revised", value: "2025-03-01" },
        { type: "publication", value: "2025-Jan-30" },
        { type: "electronic", value: "2025-01-29" },
        { type: "received", value: "2024-11-02" },
        { type: "pubmed", value: "2025-02-15T06:00" }
      ],
      authors: ["Amina Nguyen", "Example Study Group"],
      doi: "10.1234/recorded.example",
      publication_types: ["Journal Article", "Randomized Controlled Trial"]
    });
    expect(result.source_identity).toEqual({
      canonical_url: "https://pubmed.ncbi.nlm.nih.gov/40123456/",
      title: "Recorded effects of an example intervention",
      authors_or_channel: ["Amina Nguyen", "Example Study Group"]
    });
    expect(result.limitations).toEqual([
      "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated."
    ]);
    expect(result.data).not.toHaveProperty("full_text");
    expect(result.data).not.toHaveProperty("full_text_status");
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      db: "pubmed",
      id: "40123456",
      retmode: "xml",
      tool: "askrigor-tests",
      email: "maintainer@example.test",
      api_key: "ncbi-secret-value"
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
  });

  it("rejects malformed PMIDs before fetch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(fetchPubmedRecord("40123456,39876543", NCBI)).rejects.toThrow(
      "Invalid PubMed PMID"
    );
    await expect(fetchPubmedRecord("0", NCBI)).rejects.toThrow(
      "Invalid PubMed PMID"
    );
    expect(upstream).not.toHaveBeenCalled();
  });
});
