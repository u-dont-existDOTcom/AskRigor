import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SEARCH_INDEXES } from "../apps/research-mcp/src/later-inputs.js";
import {
  ALL_JOURNALS_LIMIT_NOTE, ALL_JOURNALS_OUTAGE_NOTE, ALL_JOURNALS_READ_NOTE
} from "../apps/research-mcp/src/register-tools.js";
import { searchRecords } from "../apps/research-mcp/src/reading-summary.js";
import { ALL_JOURNALS_AT_THE_SCREEN, framingGuidance } from "../apps/research-mcp/src/research-steering.js";
import { discoveryQueryDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { MCP_RESULT_MAX_BYTES } from "../apps/research-mcp/src/config.js";
import {
  abstractFromInvertedIndex, OPENALEX_ABSTRACT_MAX_CHARACTERS, OPENALEX_LIMITATIONS, searchOpenAlex
} from "../packages/sources/src/index.js";

// Owner answer 283a (9 Nov 2026): search a free index of nearly all journals, OpenAlex, as a new input of the existing
// search tools, so no app needs a refresh. Synthetic works below name no real paper.
const SECRET = "all-journals-search-test-secret-0123456789";
const KEY = "synthetic-openalex-key-never-shown";
const work = (overrides: Record<string, unknown> = {}) => ({
  id: "https://openalex.org/W1000000001",
  doi: "https://doi.org/10.9999/SYNTH.1999.1",
  title: "Analyse de l'huile d'une graine synthétique",
  display_name: "Analyse de l'huile d'une graine synthétique",
  publication_year: 1999,
  type: "article",
  cited_by_count: 12,
  ids: { openalex: "https://openalex.org/W1000000001", doi: "https://doi.org/10.9999/SYNTH.1999.1",
    pmid: "https://pubmed.ncbi.nlm.nih.gov/10000001", pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1000001" },
  primary_location: { source: { display_name: "Acta Exempli Botanica" } },
  open_access: { is_oa: true, oa_url: "https://example.org/oil.pdf" },
  authorships: [{ author: { display_name: "A. Exemple" } }, { author: { display_name: "B. Specimen" } }],
  abstract_inverted_index: { "L'huile": [0], extraite: [1], des: [2], graines: [3], "contient": [4], "0,9": [5], "%": [6] },
  ...overrides
});
const page = (results: unknown[], meta: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ meta: { count: results.length, next_cursor: null, ...meta }, results }), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the OpenAlex adapter", () => {
  it("rebuilds an abstract from the inverted index in reading order", () => {
    expect(abstractFromInvertedIndex({ b: [1, 3], a: [0], c: [2] })).toBe("a b c b");
    expect(abstractFromInvertedIndex({})).toBe("");
  });

  it("maps a work to the Europe PMC record's fields, and sends only the search words", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return page([work()]);
    }));
    const result = await searchOpenAlex({ query: "huile graine alcaloïdes", dateRange: { start: "1990-01-01", end: "2000-12-31" } });
    expect(result).toMatchObject({ provider: "openalex", record_type: "openalex_search_result", access_status: "complete",
      raw_metadata: { hit_count: 1 }, pagination: { page_size: 25, exhausted: true }, limitations: OPENALEX_LIMITATIONS });
    expect(result.data).toEqual([{
      source: "OPENALEX", id: "W1000000001", pmid: "10000001", pmcid: "PMC1000001", doi: "10.9999/SYNTH.1999.1",
      title: "Analyse de l'huile d'une graine synthétique", abstractText: "L'huile extraite des graines contient 0,9 %",
      authors: ["A. Exemple", "B. Specimen"], journal: "Acta Exempli Botanica", year: "1999", cited_by: 12,
      is_open_access: true, oa_url: "https://example.org/oil.pdf", type: "article"
    }]);
    expect(requests).toHaveLength(1);
    const url = requests[0]!;
    expect(url.origin + url.pathname).toBe("https://api.openalex.org/works");
    expect(url.searchParams.get("search")).toBe("huile graine alcaloïdes");
    expect(url.searchParams.get("filter")).toBe("from_publication_date:1990-01-01,to_publication_date:2000-12-31");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.has("api_key")).toBe(false);
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "filter", "per_page", "search", "select"]);
  });

  it("sends the operator's key to OpenAlex only, and never returns it", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return page([work()], { count: 40, next_cursor: "next-page" });
    }));
    const result = await searchOpenAlex({ query: "seed oil", apiKey: KEY, pageSize: 1 });
    expect(requests[0]!.searchParams.get("api_key")).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result.pagination).toEqual({ page_size: 1, next_cursor: "next-page", exhausted: false, returned: 1 });
  });

  it("cuts a long abstract and says so", async () => {
    const words = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`word${index}`, [index]]));
    vi.stubGlobal("fetch", vi.fn(async () => page([work({ abstract_inverted_index: words })])));
    const [record] = (await searchOpenAlex({ query: "long" })).data;
    expect(record!.abstract_cut).toBe(true);
    expect(record!.abstractText!.length).toBeLessThanOrEqual(OPENALEX_ABSTRACT_MAX_CHARACTERS + 1);
    expect(record!.abstractText!.endsWith("…")).toBe(true);
  });

  it("reports a spent free allowance as rate_limited after one request, never retrying", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    const result = await searchOpenAlex({ query: "seed oil", apiKey: KEY });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.access_status).toBe("rate_limited");
    expect(result.error).toMatchObject({ code: "openalex_rate_limited", http_status: 429, retryable: true });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("refuses a response that doesn't fit, as invalid", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ meta: { count: 0 }, results: [work()] }), { status: 200 })));
    expect((await searchOpenAlex({ query: "x" })).error).toMatchObject({ code: "openalex_response_invalid" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ meta: { count: 1 }, results: [{ id: "W1" }] }), { status: 200 })));
    expect((await searchOpenAlex({ query: "x" })).error).toMatchObject({ code: "openalex_response_invalid" });
  });
});

async function callSearch(args: Record<string, unknown>) {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
  const server = createAskRigorServer();
  const client = new Client({ name: "all-journals-search-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    return await client.callTool({ name: "search_europe_pmc", arguments: args });
  } finally { await client.close(); await server.close(); }
}

describe("search_europe_pmc with later_inputs.index all_journals", () => {
  it("is a later input with Europe PMC the default", () => {
    expect(SEARCH_INDEXES).toEqual(["europe_pmc", "all_journals"]);
  });

  it("searches OpenAlex, returns its records and signs a literature search the final check can count", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return page([work(), work({ id: "https://openalex.org/W1000000002", doi: null, ids: {}, title: "Only an id" })],
        { count: 2 });
    }));
    const result = await callSearch({ query: "seed oil alkaloids", page_size: 100, later_inputs: { index: "all_journals" } });
    expect(result.isError, JSON.stringify(result)).not.toBe(true);
    expect(requests.map((url) => url.hostname)).toEqual(["api.openalex.org"]);
    expect(requests[0]!.searchParams.get("per_page")).toBe("50");
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain("OpenAlex (all journals) search returned 2 record(s); access status complete.");
    expect(text).toContain("Its pages hold at most 50 records here.");
    expect(text.endsWith(ALL_JOURNALS_READ_NOTE)).toBe(true);
    const output = result.structuredContent as { provider: string; data: Array<{ id: string }>; research_receipt: string };
    expect(output.provider).toBe("openalex");
    expect(output.data.map(({ id }) => id)).toEqual(["W1000000001", "W1000000002"]);
    const verified = verifyResearchReceipt(output.research_receipt, { secret: SECRET });
    expect(verified).toMatchObject({ ok: true, kind: "literature_search",
      claims: { src: "openalex", q: discoveryQueryDigest(["seed oil alkaloids"]), ret: "2", n: "2" } });
    if (!verified.ok) throw new Error("Receipt failed verification");
    // Each record counted once: the first by its DOI, PMID and PMCID together, the second by its own OpenAlex id.
    expect(searchRecords(verified.claims, (value) => value.toLowerCase())).toEqual([
      ["10.9999/synth.1999.1", "10000001", "pmc1000001"], ["openalex:OPENALEX:W1000000002"]
    ]);
  });

  // The review of 12 Nov 2026: with abstracts of up to 2,000 characters, a page of 50 came to about 130 KB.
  it("shows the records that fit one result, says exactly how many of how many, and signs only those", async () => {
    const words = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`mot${index}`, [index]]));
    const works = Array.from({ length: 50 }, (_, index) => work({ id: `https://openalex.org/W20000000${10 + index}`,
      doi: `https://doi.org/10.9999/SYNTH.2001.${index}`, ids: {}, abstract_inverted_index: words }));
    vi.stubGlobal("fetch", vi.fn(async () => page(works, { count: 120, next_cursor: "next-page" })));
    const result = await callSearch({ query: "seed oil", page_size: 50, later_inputs: { index: "all_journals" } });
    expect(result.isError, JSON.stringify(result).slice(0, 300)).not.toBe(true);
    // A client that reads only text gets the structured content's JSON in the text too; one that reads the structured
    // content alone gets less.
    expect((result.content as Array<{ text: string }>).reduce((sum, { text }) => sum + Buffer.byteLength(text, "utf8"), 0))
      .toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
    expect((result.content as Array<{ text: string }>).at(-1)!.text).toBe(JSON.stringify(result.structuredContent));
    const output = result.structuredContent as { data: Array<{ id: string }>; records_shown: { shown: number; of: number };
      pagination: Record<string, unknown>; research_receipt: string };
    const shown = output.data.length;
    expect(shown).toBeGreaterThan(5);
    expect(shown).toBeLessThan(50);
    expect(output.data.map(({ id }) => id)).toEqual(works.slice(0, shown).map(({ id }) => id.split("/").at(-1)));
    expect(output.records_shown).toEqual({ shown, of: 50 });
    expect(output.pagination).toMatchObject({ returned: shown, exhausted: false });
    expect(output.pagination).not.toHaveProperty("next_cursor");
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain(`OpenAlex (all journals) search returned 50 record(s); access status complete.`);
    expect(text).toContain(` This result shows ${shown} of the 50 records OpenAlex returned, the first ${shown} in its ` +
      `order: with their abstracts, more would not fit in one result. To read the others, search again with page_size ` +
      `${shown} and follow next_cursor page by page; this result gives no next_cursor, which would skip them.`);
    const verified = verifyResearchReceipt(output.research_receipt, { secret: SECRET });
    expect(verified).toMatchObject({ ok: true, claims: { ret: String(shown), n: "120" } });
    if (!verified.ok) throw new Error("Receipt failed verification");
    expect(searchRecords(verified.claims, (value) => value.toLowerCase())).toHaveLength(shown);
  });

  // Greptile's review of 12 Nov 2026: a small search is read whole, so following the advice to search again with a
  // smaller page_size read it whole again and cut it to the same first records. Its continuation now reads it whole and
  // shows it from the first record not shown, so every record is reached once.
  it("gives a cut small search a continuation that reaches every record once", async () => {
    const words = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`mot${index}`, [index]]));
    const works = Array.from({ length: 40 }, (_, index) => work({ id: `https://openalex.org/W30000000${10 + index}`,
      doi: `https://doi.org/10.9999/SYNTH.2002.${index}`, ids: {}, abstract_inverted_index: words }));
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      const perPage = Number(url.searchParams.get("per_page"));
      // A small search is read from its start: AskRigor's continuation never reaches OpenAlex as a cursor.
      expect(url.searchParams.get("cursor")).toBe("*");
      return page(works.slice(0, perPage), { count: 40, next_cursor: perPage < 40 ? "openalex-next" : null });
    }));
    type Output = { data: Array<{ id: string }>; pagination: { next_cursor?: string; returned: number };
      records_shown?: { shown: number; of: number } };
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      expect(pages, "pages stopped moving").toBeLessThan(15);
      const result = await callSearch({ query: "seed oil", ...(cursor === undefined ? {} : { cursor }),
        later_inputs: { index: "all_journals" } });
      pages += 1;
      expect(result.isError, JSON.stringify(result).slice(0, 300)).not.toBe(true);
      expect((result.content as Array<{ text: string }>).reduce((sum, { text }) => sum + Buffer.byteLength(text, "utf8"),
        0)).toBeLessThanOrEqual(MCP_RESULT_MAX_BYTES);
      const output = result.structuredContent as Output;
      seen.push(...output.data.map(({ id }) => id));
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      if (output.pagination.next_cursor !== undefined) {
        expect(output.pagination.next_cursor).toBe(`askrigor-whole-search-from:${seen.length}`);
        expect(text).toContain("To read the others, search again with the same query, later_inputs.index " +
          "all_journals and cursor set to this result's next_cursor, page by page.");
      }
      if (cursor !== undefined) expect(text).toContain(`, from record ${seen.length - output.data.length + 1} of the ` +
        "whole search on, as next_cursor asked;");
      cursor = output.pagination.next_cursor;
    } while (cursor !== undefined);
    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(works.map(({ id }) => (id as string).split("/").at(-1)));
  });

  it("uses the operator's key when one is set, and never shows it", async () => {
    vi.stubEnv("OPENALEX_API_KEY", KEY);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return page([work()]);
    }));
    const result = await callSearch({ query: "seed oil", later_inputs: { index: "all_journals" } });
    expect(requests[0]!.searchParams.get("api_key")).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("says the index could not be searched when the free allowance is spent, and signs no receipt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const result = await callSearch({ query: "seed oil", later_inputs: { index: "all_journals" } });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text.endsWith(ALL_JOURNALS_LIMIT_NOTE)).toBe(true);
    expect(result.structuredContent).toMatchObject({ provider: "openalex", access_status: "rate_limited",
      error: { code: "openalex_rate_limited" } });
    expect((result.structuredContent as { research_receipt?: string }).research_receipt).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const down = await callSearch({ query: "seed oil", later_inputs: { index: "all_journals" } });
    expect((down.content as Array<{ text: string }>)[0]!.text.endsWith(ALL_JOURNALS_OUTAGE_NOTE)).toBe(true);
  });

  it("still searches Europe PMC by default and with index europe_pmc", async () => {
    for (const later of [undefined, { index: "europe_pmc" }]) {
      const requests: URL[] = [];
      vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
        requests.push(new URL(String(input)));
        return new Response(JSON.stringify({ version: "6.9", hitCount: 0,
          request: { queryString: "seed oil", cursorMark: "*", pageSize: 20 }, resultList: { result: [] } }), { status: 200 });
      }));
      const result = await callSearch({ query: "seed oil", page_size: 20, ...(later === undefined ? {} : { later_inputs: later }) });
      expect(requests.map((url) => url.hostname)).toEqual(["www.ebi.ac.uk"]);
      expect((result.structuredContent as { provider: string }).provider).toBe("europe_pmc");
    }
  });

  it("refuses an index it doesn't know", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await callSearch({ query: "seed oil", later_inputs: { index: "everything" } });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is named at the screen for plant, food, farming and traditional remedies", () => {
    const steering = { style: "balanced", checkBackMinutes: 10, adjustmentDetail: "flagged" } as const;
    expect(framingGuidance(steering, undefined)).toContain(ALL_JOURNALS_AT_THE_SCREEN);
    expect(ALL_JOURNALS_AT_THE_SCREEN).toContain('search_europe_pmc with later_inputs.index "all_journals"');
  });
});
