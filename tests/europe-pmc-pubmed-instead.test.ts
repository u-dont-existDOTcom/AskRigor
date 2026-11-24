import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { europePmcOnlySyntax } from "../apps/research-mcp/src/europe-pmc-sections.js";
import { EUROPE_PMC_OUTAGE_NOTE, PUBMED_INSTEAD_NOTE, RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import { FINALIZE_REMINDER } from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { builtContent, CLAUDE_CODE_INLINE_CHARACTERS, textOnly } from "./helpers/text-payload.js";

// The owner's test run of 24 Nov 2026 (09:52 UTC): Europe PMC answered none of three searches, one of them the only one
// that named seizures. The result said to search PubMed with the same words; the AI didn't, and the answer didn't say
// so. AskRigor now makes that PubMed search itself. Every record, title and query here is invented.

const SECRET = "europe-pmc-pubmed-instead-secret-0123456789abcdef";
const NAMES = ["NCBI_TOOL", "NCBI_EMAIL", "NCBI_API_KEY", "ASKRIGOR_FINALIZATION_SIGNING_SECRET"] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const clients: Client[] = [];
const QUERY = "invented compound AND (seizure OR \"convulsive episode\")";
const TODAY = `Europe PMC search returned 0 record(s); access status error.${EUROPE_PMC_OUTAGE_NOTE}`;

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.close()));
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

async function connected(): Promise<Client> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

function configured(): void {
  process.env.NCBI_TOOL = "askrigor-mcp-tests";
  process.env.NCBI_EMAIL = "maintainer@example.test";
  process.env.NCBI_API_KEY = "pubmed-instead-test-key";
  process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
}

type Answer = () => Response | Promise<Response>;
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
const unreachable: Answer = () => { throw new TypeError("fetch failed"); };
const pmid = (place: number) => String(90_000_001 + place);

/** Europe PMC as `europe` answers it, and a PubMed that holds `count` records; what each was asked, in order. */
function providers(europe: Answer, pubmed: { count: number; search?: (retmax: number) => Response | Promise<Response> | undefined }) {
  const asked = { europe: [] as URL[], pubmed: [] as URL[], summaries: 0 };
  vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "www.ebi.ac.uk") {
      asked.europe.push(url);
      return europe();
    }
    if (url.pathname.endsWith("/esearch.fcgi")) {
      asked.pubmed.push(url);
      const retmax = Number(url.searchParams.get("retmax"));
      const answered = pubmed.search?.(retmax);
      if (answered !== undefined) return answered;
      const returned = Math.min(retmax, pubmed.count);
      return json({ esearchresult: { count: String(pubmed.count), retmax: String(returned), retstart: "0",
        idlist: Array.from({ length: returned }, (_, place) => pmid(place)) } });
    }
    if (url.pathname.endsWith("/esummary.fcgi")) {
      asked.summaries += 1;
      const uids = (url.searchParams.get("id") ?? "").split(",");
      return json({ result: { uids, ...Object.fromEntries(uids.map((uid) => [uid, { title: `Invented trial ${uid}`,
        fulljournalname: "An Invented Journal", pubdate: "2024 Mar 2" }])) } });
    }
    throw new Error(`Unexpected request: ${url.hostname}`);
  }));
  return asked;
}

async function search(args: Record<string, unknown>, meta?: Record<string, unknown>) {
  const client = await connected();
  const result = await client.callTool({ name: "search_europe_pmc", arguments: args, ...(meta === undefined ? {} : { _meta: meta }) });
  return { result, structured: result.structuredContent as Record<string, any> };
}

/** A failed Europe PMC search's result exactly as it was before: the failed envelope alone, flagged as an error. */
function expectAsBefore(result: Awaited<ReturnType<typeof search>>["result"], code = "europe_pmc_unreachable"): void {
  expect(result.isError).toBe(true);
  expect(builtContent(result)).toEqual([{ type: "text", text: TODAY }]);
  expect(Object.keys(result.structuredContent as object).sort()).toEqual(["access_status", "data", "error", "limitations",
    "pagination", "provider", "query", "record_type", "retrieved_at", "source_identity"]);
  expect(result.structuredContent).toMatchObject({ provider: "europe_pmc", access_status: "error", error: { code }, data: [] });
}

describe("a search Europe PMC doesn't answer is answered from PubMed (the owner's test run of 24 Nov 2026)", () => {
  it("returns PubMed's own records and receipt beside the failed envelope, and says what AskRigor did", async () => {
    configured();
    const asked = providers(unreachable, { count: 3 });
    const { result, structured } = await search({ query: QUERY });

    expect(asked.europe).toHaveLength(1);
    expect(asked.pubmed.map((url) => url.searchParams.get("term"))).toEqual([QUERY]);
    // The failed envelope as it was.
    expect(structured).toMatchObject({ provider: "europe_pmc", record_type: "europe_pmc_search_result",
      access_status: "error", error: { code: "europe_pmc_unreachable", retryable: true }, query: { query: QUERY }, data: [],
      pagination: { returned: 0 } });
    // PubMed's beside it, labelled.
    expect(structured.pubmed_search_instead).toMatchObject({
      note: PUBMED_INSTEAD_NOTE.trim(),
      provider: "pubmed", record_type: "pubmed_search_result", access_status: "complete", query: { query: QUERY },
      raw_metadata: { total_count: 3 }, pagination: { returned: 3, exhausted: true },
      data: [0, 1, 2].map((place) => ({ pmid: pmid(place), title: `Invented trial ${pmid(place)}`,
        journal: "An Invented Journal", year: "2024" }))
    });
    expect(structured.pubmed_search_instead.error).toBeUndefined();
    // Its receipt shows what was really searched: PubMed, with this query, and the records it listed.
    const receipt = structured.pubmed_search_instead.research_receipt as string;
    expect(structured.research_receipt).toBe(receipt);
    expect(verifyResearchReceipt(receipt, { secret: SECRET })).toMatchObject({ ok: true, kind: "literature_search",
      claims: { src: "pubmed", q: discoveryQueryDigest([QUERY]), ret: "3", n: "3", ids: [pmid(0), pmid(1), pmid(2)] } });
    expect(verifyResearchReceipt(receipt, { secret: SECRET })).not.toHaveProperty("claims.rg");
    // The text says it, and the same words' small-search note as search_pubmed gives.
    const [summary, receiptBlock, reminder, ...more] = builtContent(result) as Array<{ text: string }>;
    expect(summary!.text.startsWith(`Europe PMC search returned 0 record(s); access status error.${PUBMED_INSTEAD_NOTE} ` +
      "PubMed search returned 3 PMID record(s); access status complete. Few records:")).toBe(true);
    expect(summary!.text).not.toContain("Search PubMed instead with search_pubmed");
    expect(receiptBlock!.text).toBe(`research_receipt: ${receipt}`);
    expect(reminder!.text).toBe(FINALIZE_REMINDER);
    expect(more).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("pubmed-instead-test-key");
    // The note says what wasn't searched and what the answer says if it lasts.
    expect(PUBMED_INSTEAD_NOTE).toContain("AskRigor searched PubMed instead with the same query");
    expect(PUBMED_INSTEAD_NOTE).toContain("say in the answer that Europe PMC could not be searched");
  });

  it("asks PubMed the same thing: the same words, dates and page size, and reads a small search whole", async () => {
    configured();
    const asked = providers(() => new Response("not json", { status: 200 }), { count: 35 });
    const { structured } = await search({ query: QUERY, page_size: 10, date_range: { start: "2015-01-01", end: "2026-10-22" } });

    expect(structured.error.code).toBe("europe_pmc_response_invalid");
    expect(asked.pubmed.map((url) => Object.fromEntries(["term", "retmax", "datetype", "mindate", "maxdate"]
      .map((name) => [name, url.searchParams.get(name)])))).toEqual(["10", "50"].map((retmax) =>
      ({ term: QUERY, retmax, datetype: "pdat", mindate: "2015/01/01", maxdate: "2026/10/22" })));
    expect(structured.pubmed_search_instead.pagination).toMatchObject({ returned: 35, exhausted: true });
    expect(structured.pubmed_search_instead.query).toEqual({ query: QUERY,
      date_range: { start: "2015-01-01", end: "2026-10-22" } });
    expect(verifyResearchReceipt(structured.research_receipt as string, { secret: SECRET })).toMatchObject({ ok: true,
      claims: { src: "pubmed", ret: "35", n: "35", dr: "2015-01-01/2026-10-22" } });
  });

  it("says how to read PubMed's next page, whose cursor is search_pubmed's", async () => {
    configured();
    providers(unreachable, { count: 120 });
    const { result, structured } = await search({ query: QUERY });
    const { note, pagination } = structured.pubmed_search_instead;
    expect(pagination).toMatchObject({ returned: 20, exhausted: false, next_cursor: expect.any(String) });
    expect(note).toBe(`${PUBMED_INSTEAD_NOTE.trim()} PubMed has more records: for its next page, call search_pubmed with ` +
      "the same query, dates and page size and the next_cursor in pubmed_search_instead.");
    expect((builtContent(result)[0] as { text: string }).text).toContain(note);
    // The failed Europe PMC search has no next page of its own to ask for.
    expect(structured.pagination.next_cursor).toBeUndefined();
  });

  it("answers with PubMed's empty page too, as PubMed's own nothing found", async () => {
    configured();
    providers(unreachable, { count: 0 });
    const { result, structured } = await search({ query: QUERY });
    expect(structured.pubmed_search_instead).toMatchObject({ access_status: "complete", raw_metadata: { total_count: 0 }, data: [] });
    expect(verifyResearchReceipt(structured.research_receipt as string, { secret: SECRET })).toMatchObject({ ok: true,
      claims: { src: "pubmed", ret: "0", n: "0" } });
    expect((builtContent(result)[0] as { text: string }).text).toContain("PubMed search returned 0 PMID record(s)");
  });

  it("gives no receipt while receipts are off, and the records all the same", async () => {
    configured();
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    const continuation = process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    delete process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET;
    try {
      providers(unreachable, { count: 2 });
      const { result, structured } = await search({ query: QUERY });
      expect(structured.research_receipt).toBeUndefined();
      expect(structured.pubmed_search_instead.research_receipt).toBeUndefined();
      expect(structured.pubmed_search_instead.data).toHaveLength(2);
      expect(builtContent(result)).toHaveLength(1);
    } finally {
      if (continuation !== undefined) process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET = continuation;
    }
  });

  it("leaves a query in Europe PMC's own syntax, or a later page, with the note it had", async () => {
    configured();
    for (const args of [
      { query: "AUTH:\"Invented A\" seizure" },
      { query: "(INTRO:\"convulsive episode\") AND invented" },
      { query: "seizure AND FIRST_PDATE:[2020-01-01 TO 2021-01-01]" },
      { query: "\"invented compound seizure\"~5" },
      { query: QUERY, cursor: "AoIIQHNhbXBsZQ==" },
    ]) {
      const asked = providers(unreachable, { count: 3 });
      const { result } = await search(args);
      expect(asked.europe, JSON.stringify(args)).toHaveLength(1);
      expect(asked.pubmed, JSON.stringify(args)).toEqual([]);
      expect(result.isError).toBe(true);
      expect(builtContent(result)).toEqual([{ type: "text", text: TODAY }]);
      expect(result.structuredContent).not.toHaveProperty("pubmed_search_instead");
      expect(result.structuredContent).not.toHaveProperty("research_receipt");
    }
  });

  it("asks PubMed nothing when Europe PMC refused the query or access", async () => {
    configured();
    for (const status of [400, 403]) {
      const asked = providers(() => new Response("refused", { status }), { count: 3 });
      const { result } = await search({ query: QUERY });
      expect(asked.pubmed).toEqual([]);
      expect(result.isError).toBe(true);
      expect((builtContent(result)[0] as { text: string }).text)
        .toBe(`Europe PMC search returned 0 record(s); access status ${status === 403 ? "inaccessible" : "error"}.`);
    }
  });

  it("leaves the result as it was when PubMed doesn't answer either", async () => {
    configured();
    for (const answer of [
      () => new Response("<html>Server Error</html>", { status: 200 }),
      () => new Response("refused", { status: 400 }),
      () => { throw new TypeError("fetch failed"); },
    ]) {
      const asked = providers(unreachable, { count: 3, search: answer });
      const { result } = await search({ query: QUERY });
      expect(asked.pubmed.length).toBeGreaterThan(0);
      expectAsBefore(result);
    }
    // PubMed not configured: nothing is asked of it.
    delete process.env.NCBI_EMAIL;
    const asked = providers(unreachable, { count: 3 });
    expectAsBefore((await search({ query: QUERY })).result);
    expect(asked.pubmed).toEqual([]);
  });

  it("waits 10 seconds for PubMed and no more, whatever PubMed does", async () => {
    configured();
    const asked = providers(unreachable, { count: 3, search: () => new Promise<Response>(() => undefined) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = search({ query: QUERY });
    for (let step = 0; step < 400 && asked.pubmed.length < 1; step += 1) await vi.advanceTimersByTimeAsync(1);
    expect(asked.pubmed).toHaveLength(1);
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expectAsBefore((await pending).result);
  });

  it("keeps PubMed's first page when reading the small search whole doesn't come in time", async () => {
    configured();
    const asked = providers(unreachable, { count: 35,
      search: (retmax) => retmax === 50 ? new Promise<Response>(() => undefined) : undefined });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = search({ query: QUERY, page_size: 20 });
    for (let step = 0; step < 400 && asked.pubmed.length < 2; step += 1) await vi.advanceTimersByTimeAsync(1);
    expect(asked.pubmed).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    const { structured } = await pending;
    expect(structured.pubmed_search_instead.pagination).toMatchObject({ returned: 20, exhausted: false });
    expect(verifyResearchReceipt(structured.research_receipt as string, { secret: SECRET })).toMatchObject({ ok: true,
      claims: { src: "pubmed", ret: "20", n: "35" } });
  });

  it("leaves a search Europe PMC answers exactly as it was, and asks PubMed nothing", async () => {
    configured();
    const asked = providers(() => json({ hitCount: 1, request: { queryString: QUERY, cursorMark: "*", pageSize: 20 },
      resultList: { result: [{ source: "MED", id: "90000001", pmid: "90000001", title: "Invented trial" }] } }), { count: 3 });
    const { result, structured } = await search({ query: QUERY });
    expect(asked.pubmed).toEqual([]);
    expect(result.isError).not.toBe(true);
    const { retrieved_at: _at, research_receipt: receipt, ...rest } = structured;
    expect(rest).toEqual({ provider: "europe_pmc", record_type: "europe_pmc_search_result", query: { query: QUERY },
      source_identity: {}, pagination: { page_size: 20, returned: 1, exhausted: true }, access_status: "complete",
      limitations: [], raw_metadata: { hit_count: 1 },
      data: [{ source: "MED", id: "90000001", pmid: "90000001", title: "Invented trial" }] });
    expect(verifyResearchReceipt(receipt as string, { secret: SECRET })).toMatchObject({ ok: true,
      claims: { src: "europepmc", ret: "1", n: "1" } });
    expect((builtContent(result)[0] as { text: string }).text)
      .toMatch(/^Europe PMC search returned 1 record\(s\); access status complete\. Few records:/u);
  });
});

describe("what each kind of app reads of a search answered from PubMed (tool-result.ts)", () => {
  const facts = (text: string, receipt: string) => {
    expect(text).toContain("Europe PMC's search did not work");
    expect(text).toContain("AskRigor searched PubMed instead with the same query");
    for (const place of [0, 1, 2]) expect(text).toContain(`Invented trial ${pmid(place)}`);
    expect(text).toContain(receipt);
  };

  it("reaches an app that reads only text, whole: it is no error, whose text an app may cut", async () => {
    configured();
    providers(unreachable, { count: 3 });
    const { result, structured } = await search({ query: QUERY });
    expect(result.isError).not.toBe(true);
    const texts = textOnly(result);
    expect(JSON.parse(texts.at(-1)!)).toEqual(structured);
    facts(texts.join("\n"), structured.research_receipt as string);
  });

  it("reaches an app that hands its model the structured content alone (Claude Code), a full page of 100 records too", async () => {
    configured();
    providers(unreachable, { count: 100 });
    const { result, structured } = await search({ query: QUERY, page_size: 100 });
    expect(result.isError).not.toBe(true);
    expect(structured.pubmed_search_instead.data).toHaveLength(100);
    const read = JSON.stringify(structured);
    facts(read, structured.research_receipt as string);
    expect(read.length).toBeLessThan(CLAUDE_CODE_INLINE_CHARACTERS);
    // As an error, Claude Code would read the text alone and keep about 10,000 characters of it.
    expect(textOnly(result).join("\n").length).toBeGreaterThan(11_024);
  });

  it("reaches ChatGPT, which reads the text and the structured content, with no copy in the text", async () => {
    configured();
    providers(unreachable, { count: 3 });
    const { result, structured } = await search({ query: QUERY }, { "openai/locale": "en-US" });
    expect(result.isError).not.toBe(true);
    const texts = textOnly(result);
    expect(texts).toHaveLength(3);
    expect(texts.some((text) => text.startsWith("{"))).toBe(false);
    expect(texts[0]).toContain(PUBMED_INSTEAD_NOTE);
    facts(texts.join("\n") + JSON.stringify(structured), structured.research_receipt as string);
  });

  it("fits what the server checks its results against, and the published schema, which is open", async () => {
    configured();
    providers(unreachable, { count: 3 });
    const { structured } = await search({ query: QUERY });
    const operation = RESEARCH_OPERATIONS.find(({ name }) => name === "search_europe_pmc")!;
    expect(operation.runtimeOutputSchema.safeParse(structured).error?.issues ?? []).toEqual([]);
    // Nothing else is let in beside it.
    expect(operation.runtimeOutputSchema.safeParse({ ...structured, pubmed_search_elsewhere: {} }).success).toBe(false);
    expect(operation.runtimeOutputSchema.safeParse({ ...structured, pubmed_search_instead: {
      ...structured.pubmed_search_instead, provider: "europe_pmc" } }).success).toBe(false);
  });
});

describe("Europe PMC's own query syntax, told by structure alone", () => {
  it("reads plain words, phrases, operators and punctuation as both indexes' own", () => {
    for (const query of [
      "seizure", "invented compound AND (seizure OR \"convulsive episode\")", "NOT placebo", "curcum* seizure",
      "IL-6 and TNF", "the 2:1 ratio of two compounds", "SARS-CoV-2: seizures", "p < 0.05", "about ~50% of patients",
      "\"AUTH:Invented\" seizure", "\"a distance~5 phrase\"", "does it cause seizures?", "épilepsie : carence", "épilepsie: carence",
      "発作 OR けいれん", "эпилепсия: дефицит", "10.1000/invented", "seizure[Title/Abstract]", "vitamine B6 & crises",
      "\"an escaped \\\" mark: inside\" seizure",
    ]) expect(europePmcOnlySyntax(query), query).toBe(false);
  });

  it("reads a field's name and colon, a distance, a weight or an open quotation mark as Europe PMC's", () => {
    for (const query of [
      "AUTH:\"Invented A\"", "auth:invented", "(INTRO:\"seizure\")", "seizure AND (METHODS:rat OR RESULTS:rat)",
      "FIRST_PDATE:[2020-01-01 TO 2021-01-01]", "SRC:MED AND seizure", "seizure sort_date:y", "TITLE_ABS:(seizure)",
      "\"invented compound seizure\"~5", "seizure~2", "seizure^3 AND compound", "\"seizure\"^2", "seizure \"convulsive",
      "DOI:10.1000/invented", "TNF: a review", "発作 OR AUTH:発作", "(OPEN_ACCESS:y)",
    ]) expect(europePmcOnlySyntax(query), query).toBe(true);
  });
});
