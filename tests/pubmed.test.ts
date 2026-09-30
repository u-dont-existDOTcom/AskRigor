import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeCursor,
  fetchPubmedRecord,
  searchPubmed
} from "../packages/sources/src/index.js";
import { waitForNcbiRequestSlot } from "../packages/sources/src/ncbi-pacing.js";

// Unit tests run unpaced, so the slot function is wrapped to observe when a request takes one.
vi.mock("../packages/sources/src/ncbi-pacing.js", async (importOriginal) => {
  const pacing = await importOriginal<typeof import("../packages/sources/src/ncbi-pacing.js")>();
  return { ...pacing, waitForNcbiRequestSlot: vi.fn(pacing.waitForNcbiRequestSlot) };
});

const fixture = (name: string) =>
  readFile(new URL(`fixtures/pubmed/${name}`, import.meta.url), "utf8");

const NCBI = {
  tool: "askrigor-tests",
  email: "maintainer@example.test",
  apiKey: "ncbi-secret-value"
};

const ESEARCH_PATH = "/entrez/eutils/esearch.fcgi";
const ESUMMARY_PATH = "/entrez/eutils/esummary.fcgi";
const ESUMMARY_LIMITATION =
  "PubMed returned the IDs but not their titles; fetch_pubmed_record gives each record.";

// An ESearch body whose page is every match.
const esearchBody = (pmids: string[]) => JSON.stringify({
  header: { type: "esearch", version: "0.3" },
  esearchresult: {
    count: String(pmids.length),
    retmax: String(pmids.length),
    retstart: "0",
    idlist: pmids
  }
});

// An ESummary body: `uids` in the order given, then one entry per PMID.
const esummaryBody = (entries: Record<string, unknown>, uids: string[]) => JSON.stringify({
  header: { type: "esummary", version: "0.3" },
  result: { uids, ...entries }
});

// The summary of esearch-page-1.json's PMIDs, listed in the opposite order to ESearch's,
// with the fields a search page ignores (authors, publication types) left in.
const PAGE_1_SUMMARY = esummaryBody({
  "39876543": {
    uid: "39876543",
    pubdate: "2024 Dec",
    source: "J Earlier Rec Ex",
    authors: [{ name: "Okafor N", authtype: "Author" }],
    title: "An earlier recorded study of an example intervention.",
    fulljournalname: "Journal of Earlier Recorded Examples",
    pubtype: ["Journal Article"]
  },
  "40123456": {
    uid: "40123456",
    pubdate: "2025 Jan 30",
    epubdate: "2025 Jan 29",
    source: "J Rec Ex",
    authors: [{ name: "Nguyen A", authtype: "Author" }],
    title: "Recorded effects of an example intervention.",
    fulljournalname: "Journal of Recorded Examples",
    pubtype: ["Journal Article", "Randomized Controlled Trial"]
  }
}, ["39876543", "40123456"]);

type SummaryReply = string | (() => Response | Promise<Response>);

// Answers ESearch with `search` and ESummary with `summary` (a 200 body, or a reply
// that may throw); returns every request URL in the order it was made.
const stubNcbi = (search: string, summary: SummaryReply): URL[] => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    requests.push(url);
    if (url.pathname === ESEARCH_PATH) {
      return new Response(search, { status: 200 });
    }
    if (url.pathname === ESUMMARY_PATH) {
      return typeof summary === "string" ? new Response(summary, { status: 200 }) : summary();
    }
    throw new Error(`Unexpected NCBI request: ${url.pathname}`);
  }));
  return requests;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(waitForNcbiRequestSlot).mockReset();
});

describe("PubMed ESearch", () => {
  it("returns stable PMIDs and an adapter-validated opaque next cursor", async () => {
    const body = await fixture("esearch-page-1.json");
    const requests = stubNcbi(body, PAGE_1_SUMMARY);

    const result = await searchPubmed(
      {
        query: "example intervention[Title/Abstract]",
        dateRange: { start: "2024-01-02", end: "2025-03-04" },
        pageSize: 2
      },
      NCBI
    );

    expect(result.data.map(({ pmid }) => pmid)).toEqual(["40123456", "39876543"]);
    expect(result.access_status).toBe("complete");
    expect(result.pagination).toMatchObject({
      page_size: 2,
      returned: 2,
      exhausted: false
    });
    expect(result.pagination.next_cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(result.pagination.next_cursor!)).toEqual({ retstart: 2 });
    expect(result.raw_metadata).toEqual({ total_count: 3 });

    expect(requests.filter(({ pathname }) => pathname === ESEARCH_PATH)).toHaveLength(1);
    const request = requests[0]!;
    expect(request.origin + request.pathname).toBe(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    );
    expect(Object.fromEntries(request.searchParams)).toEqual({
      db: "pubmed",
      term: "example intervention[Title/Abstract]",
      retmode: "json",
      retstart: "0",
      retmax: "2",
      tool: "askrigor-tests",
      email: "maintainer@example.test",
      api_key: "ncbi-secret-value",
      datetype: "pdat",
      mindate: "2024/01/02",
      maxdate: "2025/03/04"
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
  });

  it("accepts PubMed's exact per-request page maximum", async () => {
    const body = await fixture("esearch-empty.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchPubmed({ query: "no matches", pageSize: 100 }, NCBI);

    expect(result.pagination).toMatchObject({ page_size: 100, returned: 0, exhausted: true });
    expect(requests[0]!.searchParams.get("retmax")).toBe("100");
  });

  it("rejects a PubMed page above the public ceiling before fetch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(
      searchPubmed({ query: "bounded query", pageSize: 101 }, NCBI)
    ).rejects.toThrow("Invalid PubMed search input");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("uses a validated cursor offset and returns complete exhausted empty search", async () => {
    const body = await fixture("esearch-empty-at-7.json");
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
    const requests = stubNcbi(body, esummaryBody({
      "30000002": {
        uid: "30000002",
        title: "A second record at the boundary.",
        fulljournalname: "Journal of Boundaries",
        pubdate: "2025"
      },
      "30000001": {
        uid: "30000001",
        title: "A first record at the boundary.",
        fulljournalname: "Journal of Boundaries",
        pubdate: "2025"
      }
    }, ["30000002", "30000001"]));

    const result = await searchPubmed(
      {
        query: "broad indexed query",
        pageSize: 2,
        cursor: "eyJyZXRzdGFydCI6OTk5OH0"
      },
      NCBI
    );

    expect(result.data.map(({ pmid }) => pmid)).toEqual(["30000002", "30000001"]);
    // The summary names this page's PMIDs, not the whole result set.
    expect(requests.at(-1)!.searchParams.get("id")).toBe("30000002,30000001");
    expect(result.pagination.next_cursor).toBeUndefined();
    expect(result.pagination.exhausted).toBe(true);
    expect(result.access_status).toBe("partial");
    expect(result.limitations).toEqual([
      "PubMed ESearch exposes only the first 10,000 results for a query; refine the query to retrieve additional records."
    ]);
  });

  it("caps the final ESearch request at the first-10,000-record boundary", async () => {
    const body = await fixture("esearch-boundary-last.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await searchPubmed(
      { query: "broad indexed query", pageSize: 2, cursor: "eyJyZXRzdGFydCI6OTk5OX0" },
      NCBI
    );

    expect(requests[0]!.searchParams.get("retmax")).toBe("1");
    expect(result.pagination).toMatchObject({ page_size: 1, returned: 1, exhausted: true });
    expect(result.pagination.next_cursor).toBeUndefined();
  });

  it.each([
    ["esearch-invalid-retstart.json", "returns a different retstart"],
    ["esearch-short-page.json", "claims matches but returns no IDs"],
    ["esearch-overfull-page.json", "returns more IDs than requested"]
  ])("returns an explicit error when ESearch %s", async (fixtureName) => {
    const body = await fixture(fixtureName);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchPubmed({ query: "inconsistent result", pageSize: 1 }, NCBI);

    expect(result.data).toEqual([]);
    expect(result.access_status).toBe("error");
    expect(result.pagination).toMatchObject({ returned: 0, exhausted: false });
    expect(result.error).toEqual({
      code: "pubmed_response_invalid",
      message: "PubMed response was invalid",
      retryable: false
    });
  });

  it.each([
    ["esearch-missing-retmax.json", "omits retmax"],
    ["esearch-nonnumeric-retmax.json", "returns a nonnumeric retmax"],
    ["esearch-inconsistent-retmax.json", "returns a retmax inconsistent with the page"]
  ])("returns an explicit error when ESearch %s", async (fixtureName) => {
    const body = await fixture(fixtureName);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await searchPubmed({ query: "inconsistent retmax", pageSize: 1 }, NCBI);

    expect(result.data).toEqual([]);
    expect(result.access_status).toBe("error");
    expect(result.pagination).toMatchObject({ returned: 0, exhausted: false });
    expect(result.error).toEqual({
      code: "pubmed_response_invalid",
      message: "PubMed response was invalid",
      retryable: false
    });
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

describe("PubMed search summaries", () => {
  it("names each PMID with its title, journal and year, in ESearch order", async () => {
    const requests = stubNcbi(await fixture("esearch-page-1.json"), PAGE_1_SUMMARY);

    const result = await searchPubmed(
      { query: "example intervention[Title/Abstract]", pageSize: 2 },
      NCBI
    );

    expect(result.data).toStrictEqual([
      {
        pmid: "40123456",
        title: "Recorded effects of an example intervention.",
        journal: "Journal of Recorded Examples",
        year: "2025"
      },
      {
        pmid: "39876543",
        title: "An earlier recorded study of an example intervention.",
        journal: "Journal of Earlier Recorded Examples",
        year: "2024"
      }
    ]);
    expect(result.access_status).toBe("complete");
    expect(result.limitations).toEqual([]);
    expect(result.pagination).toMatchObject({ page_size: 2, returned: 2, exhausted: false });
    expect(result.raw_metadata).toEqual({ total_count: 3 });

    expect(requests.map(({ pathname }) => pathname)).toEqual([ESEARCH_PATH, ESUMMARY_PATH]);
    const summary = requests[1]!;
    expect(summary.origin + summary.pathname).toBe(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
    );
    expect(Object.fromEntries(summary.searchParams)).toEqual({
      db: "pubmed",
      id: "40123456,39876543",
      retmode: "json",
      tool: "askrigor-tests",
      email: "maintainer@example.test",
      api_key: "ncbi-secret-value"
    });
    expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
  });

  it("trims summary fields, prefers the full journal name, and leaves out what PubMed does not give", async () => {
    stubNcbi(esearchBody(["101", "102", "103", "104"]), esummaryBody({
      "101": {
        uid: "101",
        title: "  A padded title.  ",
        fulljournalname: "   ",
        source: " Abbreviated J ",
        pubdate: "1998 Dec-1999 Jan"
      },
      "102": {
        uid: "102",
        title: "A title without a journal or a leading year.",
        pubdate: "Winter 2024"
      },
      "103": {
        uid: "103",
        title: "The full name wins over the abbreviation.",
        fulljournalname: "The Full Journal Name",
        source: "Full J Name",
        pubdate: "2025"
      },
      "104": {
        uid: "104",
        title: "A date whose first number is not a year.",
        pubdate: "20251 Jan"
      }
    }, ["101", "102", "103", "104"]));

    const result = await searchPubmed({ query: "field handling", pageSize: 4 }, NCBI);

    expect(result.data).toStrictEqual([
      { pmid: "101", title: "A padded title.", journal: "Abbreviated J", year: "1998" },
      { pmid: "102", title: "A title without a journal or a leading year." },
      {
        pmid: "103",
        title: "The full name wins over the abbreviation.",
        journal: "The Full Journal Name",
        year: "2025"
      },
      { pmid: "104", title: "A date whose first number is not a year." }
    ]);
    expect(result.limitations).toEqual([]);
  });

  it("keeps a PMID the summary does not title and reports the gap once", async () => {
    stubNcbi(esearchBody(["201", "202", "203", "204"]), esummaryBody({
      "201": {
        uid: "201",
        title: "A titled record.",
        fulljournalname: "Journal of Titles",
        pubdate: "2023 Mar 1"
      },
      "202": { uid: "202", error: "cannot get document summary" },
      "203": {
        uid: "203",
        title: "   ",
        fulljournalname: "Journal Without a Title",
        pubdate: "2022"
      }
    }, ["201", "202", "203"]));

    const result = await searchPubmed({ query: "partial summary", pageSize: 4 }, NCBI);

    expect(result.data).toStrictEqual([
      { pmid: "201", title: "A titled record.", journal: "Journal of Titles", year: "2023" },
      { pmid: "202" },
      { pmid: "203", journal: "Journal Without a Title", year: "2022" },
      { pmid: "204" }
    ]);
    expect(result.access_status).toBe("complete");
    expect(result.error).toBeUndefined();
    expect(result.limitations).toEqual([ESUMMARY_LIMITATION]);
  });

  it.each([
    ["a network failure", () => { throw new TypeError("fetch failed"); }],
    ["a timeout", () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }],
    ["an access-denied response", () => new Response("forbidden secret details", { status: 403 })],
    ["a body that is not JSON", () => new Response("<html>gateway page</html>", { status: 200 })],
    ["JSON that is not an ESummary result", () => new Response(esearchBody(["40123456", "39876543"]), { status: 200 })],
    ["an error object in place of the result", () => new Response(
      JSON.stringify({ error: "Invalid db name specified" }),
      { status: 200 }
    )],
    ["a result that is not an object", () => new Response(
      JSON.stringify({ result: "unavailable" }),
      { status: 200 }
    )]
  ] satisfies Array<[string, () => Response]>)(
    "returns the PMIDs and one limitation when the summary request ends in %s",
    async (_failure, reply) => {
      stubNcbi(await fixture("esearch-page-1.json"), reply);

      const result = await searchPubmed({ query: "summary unavailable", pageSize: 2 }, NCBI);

      expect(result.data).toStrictEqual([{ pmid: "40123456" }, { pmid: "39876543" }]);
      expect(result.access_status).toBe("complete");
      expect(result.error).toBeUndefined();
      expect(result.limitations).toEqual([ESUMMARY_LIMITATION]);
      expect(result.pagination).toMatchObject({ page_size: 2, returned: 2, exhausted: false });
      expect(decodeCursor(result.pagination.next_cursor!)).toEqual({ retstart: 2 });
      expect(result.raw_metadata).toEqual({ total_count: 3 });
      expect(JSON.stringify(result)).not.toContain("ncbi-secret-value");
      expect(JSON.stringify(result)).not.toContain("forbidden secret details");
    }
  );

  it("tries the summary once and keeps the search complete when it is rate limited", async () => {
    vi.useFakeTimers();
    const limited = await fixture("rate-limit.txt");
    const requests = stubNcbi(
      await fixture("esearch-page-1.json"),
      () => new Response(limited, { status: 429 })
    );

    const pending = searchPubmed({ query: "rate limited summary", pageSize: 2 }, NCBI);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(requests.map(({ pathname }) => pathname)).toEqual([ESEARCH_PATH, ESUMMARY_PATH]);
    expect(result.data).toStrictEqual([{ pmid: "40123456" }, { pmid: "39876543" }]);
    expect(result.access_status).toBe("complete");
    expect(result.error).toBeUndefined();
    expect(result.limitations).toEqual([ESUMMARY_LIMITATION]);
  });

  it("keeps the ESearch boundary status and limitation ahead of the summary limitation", async () => {
    stubNcbi(
      await fixture("esearch-boundary.json"),
      () => new Response("unavailable", { status: 403 })
    );

    const result = await searchPubmed(
      { query: "broad indexed query", pageSize: 2, cursor: "eyJyZXRzdGFydCI6OTk5OH0" },
      NCBI
    );

    expect(result.data).toStrictEqual([{ pmid: "30000002" }, { pmid: "30000001" }]);
    expect(result.access_status).toBe("partial");
    expect(result.pagination).toMatchObject({ returned: 2, exhausted: true });
    expect(result.limitations).toEqual([
      "PubMed ESearch exposes only the first 10,000 results for a query; refine the query to retrieve additional records.",
      ESUMMARY_LIMITATION
    ]);
  });

  it("requests no summary when the search returned no PMIDs", async () => {
    const requests = stubNcbi(await fixture("esearch-empty.json"), () => {
      throw new Error("ESummary must not be requested for an empty page");
    });

    const result = await searchPubmed({ query: "no matches" }, NCBI);

    expect(result.data).toEqual([]);
    expect(result.access_status).toBe("complete");
    expect(result.limitations).toEqual([]);
    expect(requests.map(({ pathname }) => pathname)).toEqual([ESEARCH_PATH]);
  });

  it.each([
    ["ESearch returns an inconsistent page", "esearch-short-page.json", 200],
    ["ESearch is denied", "rate-limit.txt", 403]
  ])("requests no summary when %s", async (_case, fixtureName, status) => {
    const body = await fixture(fixtureName);
    const upstream = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", upstream);

    const result = await searchPubmed({ query: "failed search", pageSize: 1 }, NCBI);

    expect(result.error).toBeDefined();
    expect(result.data).toEqual([]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["with an API key", NCBI, true],
    ["without an API key", { tool: NCBI.tool, email: NCBI.email }, false]
  ])("waits for an NCBI request slot before the summary request, as before the search, %s", async (
    _keyed,
    config,
    hasApiKey
  ) => {
    const events: string[] = [];
    vi.mocked(waitForNcbiRequestSlot).mockImplementation(async (keyed) => {
      events.push(`slot requested (api key: ${keyed})`);
      await Promise.resolve();
      events.push("slot granted");
    });
    const search = await fixture("esearch-page-1.json");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const { pathname } = new URL(String(input));
      events.push(`fetch ${pathname}`);
      return new Response(pathname === ESEARCH_PATH ? search : PAGE_1_SUMMARY, { status: 200 });
    }));

    const result = await searchPubmed({ query: "paced query", pageSize: 2 }, config);

    expect(result.data.map(({ title }) => title)).toEqual([
      "Recorded effects of an example intervention.",
      "An earlier recorded study of an example intervention."
    ]);
    expect(events).toEqual([
      `slot requested (api key: ${hasApiKey})`,
      "slot granted",
      `fetch ${ESEARCH_PATH}`,
      `slot requested (api key: ${hasApiKey})`,
      "slot granted",
      `fetch ${ESUMMARY_PATH}`
    ]);
  });
});

describe("PubMed EFetch", () => {
  it("reports the PubMed Central identifier, which marks an open full text", async () => {
    const body = (await fixture("efetch-record.xml")).replace(
      '<ArticleId IdType="doi">10.1234/recorded.example</ArticleId>',
      '<ArticleId IdType="pmc">pmc7654321</ArticleId>'
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("40123456", NCBI);

    expect(result.data).toMatchObject({ pmid: "40123456", pmcid: "PMC7654321" });
    expect(result.data).not.toHaveProperty("doi");
  });

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

  it("normalizes a current-DTD PubmedBookArticle without fabricating journal metadata", async () => {
    const body = await fixture("efetch-book-record.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("50123456", NCBI);

    expect(result.access_status).toBe("api_visible_complete");
    expect(result.data).toEqual({
      pmid: "50123456",
      title: "Recorded book chapter",
      abstract: "Recorded book abstract.",
      dates: [
        { type: "revised", value: "2025-02-03" },
        { type: "publication", value: "2024-Winter" },
        { type: "pubmed", value: "2025-02-04" }
      ],
      authors: ["Nia Okafor"],
      doi: "10.1234/book.chapter",
      publication_types: ["Review"]
    });
    expect(result.data).not.toHaveProperty("journal");
  });

  it("returns an explicit error for a malformed BookDocument", async () => {
    const body = await fixture("efetch-malformed-book.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("55123456", NCBI);

    expect(result.access_status).toBe("error");
    expect(result.error).toEqual({
      code: "pubmed_response_invalid",
      message: "PubMed response was invalid",
      retryable: false
    });
  });

  it("preserves inline citation text, ELocationID DOI, season, and explicit absences", async () => {
    const body = await fixture("efetch-inline-metadata.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("51123456", NCBI);

    expect(result.data).toEqual({
      pmid: "51123456",
      title: "Inline citation title",
      abstract: "BACKGROUND: Before inline after.",
      journal: "Journal of Inline Records",
      dates: [{ type: "publication", value: "2024-Winter" }],
      doi: "10.1234/location.only"
    });
    expect(result.data).not.toHaveProperty("authors");
    expect(result.data).not.toHaveProperty("publication_types");
  });

  it("keeps an explicit MedlineDate rather than inventing a structured date", async () => {
    const body = await fixture("efetch-medline-date.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("52123456", NCBI);

    expect(result.data.dates).toEqual([
      { type: "publication", value: "1998 Dec-1999 Jan" }
    ]);
    expect(result.data).not.toHaveProperty("doi");
  });

  it("returns not_found only for a semantically empty PubmedArticleSet", async () => {
    const body = await fixture("efetch-empty.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("40123456", NCBI);

    expect(result.access_status).toBe("not_found");
    expect(result.error).toEqual({
      code: "pubmed_record_not_found",
      message: "PubMed record not found",
      http_status: 404,
      retryable: false
    });
  });

  it("returns an explicit error when EFetch returns a different PMID", async () => {
    const body = await fixture("efetch-mismatched.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("40123456", NCBI);

    expect(result.access_status).toBe("error");
    expect(result.error).toEqual({
      code: "pubmed_record_mismatch",
      message: "PubMed returned a different record",
      retryable: false
    });
  });

  it.each([
    ["efetch-provider-error.xml", "provider error XML"],
    ["efetch-unrecognized.xml", "a valid but unsupported PubMed XML shape"]
  ])("returns an explicit error rather than not_found for %s", async (fixtureName) => {
    const body = await fixture(fixtureName);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("40123456", NCBI);

    expect(result.access_status).toBe("error");
    expect(result.error).toEqual({
      code: "pubmed_response_invalid",
      message: "PubMed response was invalid",
      retryable: false
    });
    expect(JSON.stringify(result)).not.toContain("record-token-123");
  });

  it("rejects a supported EFetch record accompanied by a provider error sibling", async () => {
    const body = await fixture("efetch-mixed-provider-error.xml");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    const result = await fetchPubmedRecord("56123456", NCBI);

    expect(result.access_status).toBe("error");
    expect(result.error).toEqual({
      code: "pubmed_response_invalid",
      message: "PubMed response was invalid",
      retryable: false
    });
    expect(JSON.stringify(result)).not.toContain("mixed-token-456");
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
