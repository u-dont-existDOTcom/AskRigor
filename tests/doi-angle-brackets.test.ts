import { okEnvelope } from "@askrigor/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireOpenFullTextActionInputSchema, acquireOpenFullTextRuntimeInputSchema
} from "../apps/research-mcp/src/actions/open-full-text-route.js";
import { angleBracketDoiNote } from "../apps/research-mcp/src/register-tools.js";
import { canonicalDoiSchema } from "../packages/contracts/src/study-external-evidence.js";
import {
  doiUrl, normalizeDoiIdentifier, resolveDoi, resolveUnpaywallOpenAccess, type AcquireOpenFullTextRuntime
} from "../packages/sources/src/index.js";

// The owner regressions on #412's build (judged 6 Nov 2026): acquire_open_full_text refused a valid Wiley DOI at its
// schema, as no DOI pattern took "<" or ">", which older SICI-form DOIs carry (q126-42-group-average call 38). A synthetic
// DOI of that form, which names no real paper.
const SICI = "10.1002/(SICI)1099-0000(19990101)1:1<1::AID-SYN1>3.0.CO;2-X";
const CANONICAL = SICI.toLowerCase();
const ESCAPED = SICI.replace("<", "%3C").replace(">", "%3E");
const LINK = "https://doi.org/10.1002/(sici)1099-0000(19990101)1:1%3C1::aid-syn1%3E3.0.co;2-x";

describe("DOIs with \"<\" or \">\"", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("reads each form of one, percent-escaped or not, as the DOI, and still refuses a space", () => {
    for (const given of [SICI, ESCAPED, `doi:${SICI}`, `doi: ${ESCAPED}`, `https://doi.org/${SICI}`, `https://doi.org/${ESCAPED}`]) {
      expect(normalizeDoiIdentifier(given), given).toBe(CANONICAL);
    }
    expect(normalizeDoiIdentifier("10.1002/two words")).toBeUndefined();
    // A "%" that starts no valid escape is a character of the DOI, as it was.
    expect(normalizeDoiIdentifier("10.1002/%ZZ100")).toBe("10.1002/%zz100");
    expect(canonicalDoiSchema.safeParse(CANONICAL).success).toBe(true);
  });

  it("encodes what a link can't carry, and leaves an ordinary DOI's link as it was", () => {
    expect(doiUrl(CANONICAL)).toBe(LINK);
    expect(doiUrl("10.1000/xyz(1)-2;3")).toBe("https://doi.org/10.1000/xyz(1)-2;3");
    expect(doiUrl("10.1000/a#b%c")).toBe("https://doi.org/10.1000/a%23b%25c");
    expect(new URL(doiUrl(CANONICAL)).pathname).toBe(new URL(`https://doi.org/${CANONICAL}`).pathname);
  });

  it("asks Unpaywall and Crossref for it encoded", async () => {
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      return new Response(JSON.stringify(url.hostname === "api.crossref.org"
        ? { status: "ok", "message-type": "work", message: { DOI: SICI, title: ["Synthetic SICI-form study"] } }
        : { doi: CANONICAL, title: "Synthetic SICI-form study", is_oa: false, best_oa_location: null, oa_locations: [] }),
      { status: 200 });
    }));
    const unpaywall = await resolveUnpaywallOpenAccess(SICI, { email: "research@example.org" });
    expect(requests[0]!.pathname).toBe(`/v2/${encodeURIComponent(CANONICAL)}`);
    expect(unpaywall.source_identity.canonical_url).toBe(LINK);
    const crossref = await resolveDoi(ESCAPED, { mailto: "maintainer@example.test" });
    expect(requests[1]!.pathname).toBe(`/works/${encodeURIComponent(CANONICAL)}`);
    expect(crossref.data.resolved_doi).toBe(CANONICAL);
    expect(crossref.source_identity.canonical_url).toBe(LINK);
  });

  it("acquires a full text by it", async () => {
    const searchEuropePmc = vi.fn(async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result",
      pagination: { exhausted: true }, returned: 0, accessStatus: "complete", data: [] }));
    const acquireUnpaywallFullText = vi.fn(async () => okEnvelope({ provider: "unpaywall", recordType: "unpaywall_full_text",
      pagination: { exhausted: true }, returned: 0, accessStatus: "not_found", data: {} }));
    const runtime = { searchEuropePmc, acquireUnpaywallFullText } as unknown as AcquireOpenFullTextRuntime;
    // The tool's tests below stand acquisition in; this one runs it.
    const { acquireOpenFullText } = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    for (const doi of [SICI, ESCAPED]) {
      const result = await acquireOpenFullText({ doi }, { email: "research@example.org" }, runtime);
      expect(result.data.requested_doi, doi).toBe(CANONICAL);
      expect(result.source_identity.canonical_url, doi).toBe(LINK);
    }
    expect(searchEuropePmc).toHaveBeenCalledWith(expect.objectContaining({ query: `DOI:"${CANONICAL}"` }));
    expect(acquireUnpaywallFullText.mock.calls.map((call) => (call as unknown[])[0])).toEqual([CANONICAL, CANONICAL]);
  });

  it("is taken by the tool's runtime form, while its published pattern stays as the tool lists froze it", () => {
    expect(acquireOpenFullTextActionInputSchema.safeParse({ doi: SICI }).success).toBe(false);
    expect(acquireOpenFullTextActionInputSchema.safeParse({ doi: ESCAPED }).success).toBe(true);
    for (const doi of [SICI, ESCAPED, `https://doi.org/${SICI}`]) {
      expect(acquireOpenFullTextRuntimeInputSchema.safeParse({ doi }).success, doi).toBe(true);
    }
    expect(acquireOpenFullTextRuntimeInputSchema.safeParse({ doi: "10.1002/two words" }).success).toBe(false);
  });

  it("is named, escaped, where a literature result lists one", () => {
    expect(angleBracketDoiNote([{ doi: "10.1000/plain" }])).toBe("");
    const note = angleBracketDoiNote([{ doi: CANONICAL }, { doi: "10.1000/plain" }]);
    expect(note).toContain("acquire_open_full_text's published doi pattern refuses");
    expect(note).toContain(CANONICAL.replace("<", "%3C").replace(">", "%3E"));
    expect(note).toContain("later_inputs.doi");
    expect(angleBracketDoiNote({ resolved_doi: CANONICAL, candidates: [{ doi: CANONICAL }] })).toContain("A DOI listed here");
  });
});

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(), acquireOpenFullText: acquire
}));

describe("acquire_open_full_text with such a DOI", () => {
  let client: Client;
  let close: () => Promise<void>;
  beforeEach(async () => {
    acquire.mockReset();
    acquire.mockImplementation(async (input: { doi?: string }) => okEnvelope({ provider: "open_full_text",
      recordType: "open_full_text_acquisition", primaryIdentifier: input.doi, pagination: { exhausted: true }, returned: 0,
      accessStatus: "not_found", data: { requested_doi: input.doi, outcome: "possibly_useful_lead",
        discovery_attempts: [{ route: "europe_pmc", result: "not_found" }], access_boundary: "Synthetic: no copy." } }));
    const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");
    const server = createAskRigorServer();
    client = new Client({ name: "doi-angle-brackets-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    close = async () => { await client.close(); await server.close(); };
  });
  afterEach(async () => { await close(); });

  it("takes it at the top level, in later_inputs, or percent-escaped, and refuses it in both places", async () => {
    for (const args of [{ doi: SICI }, { later_inputs: { doi: SICI } }, { doi: ESCAPED }]) {
      const result = await client.callTool({ name: "acquire_open_full_text", arguments: args });
      expect(result.isError, JSON.stringify(args)).not.toBe(true);
      expect(acquire).toHaveBeenLastCalledWith(expect.objectContaining({ doi: args.doi ?? SICI }), expect.anything(),
        undefined);
    }
    const both = await client.callTool({ name: "acquire_open_full_text", arguments: { doi: SICI, later_inputs: { doi: SICI } } });
    expect(both.isError).toBe(true);
    expect(JSON.stringify(both.content)).toContain("doi is also given at the top level");
  });

  it("names such a DOI where a Europe PMC search lists it, and nothing where none is", async () => {
    const page = (doi: string) => JSON.stringify({ version: "6.9", hitCount: 1, nextCursorMark: "*",
      request: { queryString: "synthetic group average", resultType: "lite", cursorMark: "*", pageSize: 20, format: "json" },
      resultList: { result: [{ source: "MED", id: "40123499", pmid: "40123499", doi, title: "Synthetic SICI-form record" }] } });
    for (const [doi, named] of [[SICI, true], ["10.1234/plain.example", false]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(page(doi), { status: 200 })));
      const result = await client.callTool({ name: "search_europe_pmc", arguments: { query: "synthetic group average" } });
      const text = (result.content as Array<{ text: string }>).map(({ text: line }) => line).join("\n");
      expect(text.includes("%3C1::AID-SYN1%3E") && text.includes("later_inputs.doi"), doi).toBe(named);
      vi.unstubAllGlobals();
    }
  });
});
