import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { searchEuropePmc } from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/europe-pmc/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Europe PMC search", () => {
  it("preserves provider source, ID, and next cursor exactly", async () => {
    const body = await fixture("search-page-1.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchEuropePmc({
      query: "example intervention",
      pageSize: 2
    });

    expect(result.access_status).toBe("complete");
    expect(result.data).toEqual([
      {
        source: "MED",
        id: "40123456",
        pmid: "40123456",
        pmcid: "PMC1234567",
        doi: "10.1234/recorded.example",
        title: "Recorded effects of an example intervention",
        authors: ["Amina Nguyen", "Example Study Group"],
        journal: "Journal of Recorded Examples",
        year: "2025",
        cited_by: 12,
        is_open_access: true,
        has_full_text: true
      },
      {
        source: "PPR",
        id: "PPR987654",
        title: "A provider record without optional identifiers"
      }
    ]);
    expect(result.pagination).toEqual({
      page_size: 2,
      returned: 2,
      next_cursor: "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg==",
      exhausted: false
    });
    expect(result.raw_metadata).toEqual({ hit_count: 3 });
    expect(result.source_identity).toEqual({});

    expect(requests).toHaveLength(1);
    expect(requests[0]!.origin + requests[0]!.pathname).toBe(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    );
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      query: "example intervention",
      format: "json",
      pageSize: "2",
      cursorMark: "*"
    });
  });

  it("preserves an advancing provider cursor on an empty custom-cursor page", async () => {
    const body = await fixture("search-empty.json");
    const cursor = "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg==";
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchEuropePmc({
      query: "paged records",
      cursor
    });

    expect(result.access_status).toBe("complete");
    expect(result.data).toEqual([]);
    expect(result.pagination).toEqual({
      cursor,
      page_size: 20,
      returned: 0,
      next_cursor: "AoIIQGFkdmFuY2luZy1jdXJzb3I=",
      exhausted: false
    });
    expect(requests[0]!.searchParams.get("cursorMark")).toBe(cursor);
  });

  it("adds a validated inclusive publication-date range to the provider query", async () => {
    const body = await fixture("search-date-range-empty.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchEuropePmc({
      query: "example intervention",
      dateRange: { start: "2024-01-02", end: "2025-03-04" }
    });

    expect(result.query).toEqual({
      query: "example intervention",
      date_range: { start: "2024-01-02", end: "2025-03-04" }
    });
    expect(requests[0]!.searchParams.get("query")).toBe(
      "(example intervention) AND FIRST_PDATE:[2024-01-02 TO 2025-03-04]"
    );
  });

  it("rejects invalid query, page size, and cursor inputs before fetch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(searchEuropePmc({ query: "   " })).rejects.toThrow(
      "Invalid Europe PMC search input"
    );
    await expect(searchEuropePmc({ query: "valid", pageSize: 0 })).rejects.toThrow(
      "Invalid Europe PMC search input"
    );
    await expect(searchEuropePmc({ query: "valid", pageSize: 101 })).rejects.toThrow(
      "Invalid Europe PMC search input"
    );
    await expect(searchEuropePmc({ query: "valid", cursor: "" })).rejects.toThrow(
      "Invalid Europe PMC search input"
    );

    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns a complete exhausted empty result rather than failed no evidence", async () => {
    const body = await fixture("search-empty-initial.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchEuropePmc({ query: "no matching records" });

    expect(result.access_status).toBe("complete");
    expect(result.error).toBeUndefined();
    expect(result.pagination).toMatchObject({ returned: 0, exhausted: true });
  });

  it("rejects a provider response without a non-empty next cursor", async () => {
    const body = await fixture("search-missing-cursor.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchEuropePmc({ query: "no matching records" });

    expectInvalidEuropePmcResponse(result);
  });

  it.each([
    [
      "search-mismatched-cursor-request.json",
      { query: "paged records", cursor: "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg==" }
    ],
    [
      "search-mismatched-page-size-request.json",
      { query: "example intervention", pageSize: 2 }
    ],
    [
      "search-mismatched-query-request.json",
      { query: "example intervention", pageSize: 2 }
    ]
  ])("rejects a provider response whose echoed request does not match (%s)", async (
    fixtureName,
    input
  ) => {
    const body = await fixture(fixtureName);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchEuropePmc(input);

    expectInvalidEuropePmcResponse(result);
  });

  it("rejects an impossible initial page with hits but no records", async () => {
    const body = await fixture("search-initial-false-empty.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchEuropePmc({ query: "false empty initial page" });

    expectInvalidEuropePmcResponse(result);
  });

  it("returns an explicit error for a provider page inconsistent with its hit count", async () => {
    const body = await fixture("search-inconsistent.json");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchEuropePmc({ query: "inconsistent provider page", pageSize: 1 });

    expect(result).toMatchObject({
      access_status: "error",
      pagination: { returned: 0, exhausted: false },
      error: {
        code: "europe_pmc_response_invalid",
        message: "Europe PMC response was invalid",
        retryable: false
      },
      data: []
    });
  });

  it("maps a final rate-limit response explicitly instead of to an empty complete result", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota detail", { status: 429 })));

    const pending = searchEuropePmc({ query: "rate limited query" });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      provider: "europe_pmc",
      record_type: "europe_pmc_search_result",
      access_status: "rate_limited",
      pagination: { returned: 0, exhausted: false },
      error: {
        code: "europe_pmc_rate_limited",
        message: "Europe PMC rate limit reached",
        http_status: 429,
        retryable: true
      },
      data: []
    });
    expect(JSON.stringify(result)).not.toContain("quota detail");
  });
});

function expectInvalidEuropePmcResponse(result: Awaited<ReturnType<typeof searchEuropePmc>>): void {
  expect(result).toMatchObject({
    access_status: "error",
    pagination: { returned: 0, exhausted: false },
    error: {
      code: "europe_pmc_response_invalid",
      message: "Europe PMC response was invalid",
      retryable: false
    },
    data: []
  });
}
