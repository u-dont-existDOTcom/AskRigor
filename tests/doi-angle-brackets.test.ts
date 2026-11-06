import { okEnvelope } from "@askrigor/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireOpenFullTextActionInputSchema, acquireOpenFullTextRuntimeInputSchema
} from "../apps/research-mcp/src/actions/open-full-text-route.js";
import { sourceIdKey } from "../apps/research-mcp/src/findings/research-behind.js";
import { angleBracketDoiNote } from "../apps/research-mcp/src/register-tools.js";
import { finalizeResearch, normalizeIdentifier } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { canonicalDoiSchema } from "../packages/contracts/src/study-external-evidence.js";
import {
  decodedDoi, doiFromInput, doiUrl, escapedDoi, normalizeDoiIdentifier, resolveDoi, resolveUnpaywallOpenAccess,
  type AcquireOpenFullTextRuntime
} from "../packages/sources/src/index.js";

// The owner regressions on #412's build (judged 6 Nov 2026): acquire_open_full_text refused a valid Wiley DOI at its
// schema, as no DOI pattern took "<" or ">", which older SICI-form DOIs carry (q126-42-group-average call 38). A synthetic
// DOI of that form, which names no real paper.
const SICI = "10.1002/(SICI)1099-0000(19990101)1:1<1::AID-SYN1>3.0.CO;2-X";
const CANONICAL = SICI.toLowerCase();
const ESCAPED = SICI.replaceAll("<", "%3C").replaceAll(">", "%3E");
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
    expect(escapedDoi(CANONICAL)).toBe(CANONICAL.replaceAll("<", "%3C").replaceAll(">", "%3E"));
    expect(decodedDoi(escapedDoi(SICI))).toBe(SICI);
  });

  // The review of #421: decoding every escape at each of three layers read "10.1000/x%2541" as "10.1000/xa" by the time
  // it reached Unpaywall, made "%2522" a quote mark that the full-text route refused, and refused a literal "%20" that
  // used to be taken. Only "%3C" and "%3E" are read, so reading a DOI again changes nothing.
  // The review of #421, round 2: a doi.org link escapes more than "<" and ">" ("%28SICI%29…%3A9%3C1083%3A%3A…%3B2-2");
  // read only for those two, its other escapes reached Europe PMC and Unpaywall as they were. A doi.org link is decoded
  // in full, once; a bare DOI only for "%3C" and "%3E"; and reading the result again changes nothing.
  it("decodes a doi.org link in full, once, and a bare DOI only for its angle brackets", async () => {
    const link = "https://doi.org/10.1002/%28SICI%291099-0000%2819990101%291%3A1%3C1%3A%3AAID-SYN1%3E3.0.CO%3B2-X";
    expect(normalizeDoiIdentifier(link)).toBe(CANONICAL);
    expect(doiFromInput(link)).toBe(CANONICAL);
    expect(doiFromInput("10.1002/%28SICI%29x")).toBe("10.1002/%28sici%29x");
    for (const given of [link, ESCAPED, SICI, "10.1000/x%2541", `https://doi.org/${CANONICAL.replaceAll("<", "%253C")}`]) {
      expect(doiFromInput(doiFromInput(given)), given).toBe(doiFromInput(given));
      const once = normalizeDoiIdentifier(given);
      if (once !== undefined) expect(normalizeDoiIdentifier(once), given).toBe(once);
    }
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response("{}", { status: 404 });
    }));
    const searchEuropePmc = vi.fn(async (_: { query: string }) => okEnvelope({ provider: "europe_pmc",
      recordType: "europe_pmc_search_result", pagination: { exhausted: true }, returned: 0, accessStatus: "complete", data: [] }));
    const { acquireOpenFullText } = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    const result = await acquireOpenFullText({ doi: link }, { email: "research@example.org" },
      { searchEuropePmc } as unknown as AcquireOpenFullTextRuntime);
    expect(result.data.requested_doi).toBe(CANONICAL);
    expect(searchEuropePmc.mock.calls.at(-1)?.[0].query).toBe(`DOI:"${CANONICAL}"`);
    expect(requests.filter((url) => url.hostname === "api.unpaywall.org").map((url) => url.pathname))
      .toEqual([`/v2/${encodeURIComponent(CANONICAL)}`]);
  });

  it("reads only the escaped angle brackets, so a DOI read again is the same DOI", async () => {
    for (const doi of ["10.1000/x%2541", "10.1000/x%2522", "10.1000/a%20b", ESCAPED, `${ESCAPED}%253C`]) {
      const once = normalizeDoiIdentifier(doi);
      expect(once, doi).toBeDefined();
      expect(normalizeDoiIdentifier(once!), doi).toBe(once);
      expect(decodedDoi(decodedDoi(doi)), doi).toBe(decodedDoi(doi));
    }
    expect(normalizeDoiIdentifier("10.1000/a%20b")).toBe("10.1000/a%20b");
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(String(input));
      return new Response("{}", { status: 404 });
    }));
    const searchEuropePmc = vi.fn(async (_: { query: string }) => okEnvelope({ provider: "europe_pmc",
      recordType: "europe_pmc_search_result", pagination: { exhausted: true }, returned: 0, accessStatus: "complete", data: [] }));
    const { acquireOpenFullText } = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
    for (const doi of ["10.1000/x%2541", "10.1000/x%2522"]) {
      requests.length = 0;
      const result = await acquireOpenFullText({ doi }, { email: "research@example.org" },
        { searchEuropePmc } as unknown as AcquireOpenFullTextRuntime);
      expect(result.data.requested_doi, doi).toBe(doi);
      expect(searchEuropePmc.mock.calls.at(-1)?.[0].query, doi).toBe(`DOI:"${doi}"`);
      // Unpaywall is asked for the same DOI, so the route is tried rather than refused for the input.
      expect(requests.filter((url) => new URL(url).hostname === "api.unpaywall.org").map((url) => new URL(url).pathname), doi)
        .toEqual([`/v2/${encodeURIComponent(doi)}`]);
    }
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
    expect(note).toContain(CANONICAL.replaceAll("<", "%3C").replaceAll(">", "%3E"));
    expect(note).toContain("later_inputs.doi");
    expect(angleBracketDoiNote({ resolved_doi: CANONICAL, candidates: [{ doi: CANONICAL }] })).toContain("A DOI listed here");
  });
});

// The review of #421: acquisition reads "%3C" and "%3E", so its receipts sign the "<" form, and the result note asks for the
// escaped form; the final check compared key sources only lower-cased, so a key source given escaped matched none of its
// receipts and held the answer back, and the doi.org link it offered was escaped twice ("%253C").
describe("the final check with such a DOI", () => {
  const SECRET = "doi-angle-brackets-final-check-secret-0123456789";
  const AUDITED = "full text read, methods audited by AskRigor";
  const REASON = "Synthetic fixture isolates the DOI forms.";
  const NA = { status: "not_applicable" as const, reason: REASON };
  const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
    issueResearchReceipt(kind, claims, { secret: SECRET });
  const input = (keyId: string, draft: string, receipts = [sign("study_audit", { doi: CANONICAL, content: "a".repeat(16) })],
    keySource: Record<string, unknown> = { status: "validated", read_depth: "full_text_audited" }) => ({
    receipts, research_target: "Synthetic SICI-form DOI", research_depth: "deep", treatment_choice: "not_compared",
    community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage", not_relevant_reason: REASON,
    commercial_review_applicability: NA, intervention_identity: NA, lab_preparation: NA,
    full_text_search: { status: "not_needed", reason: REASON },
    key_sources: [{ id: keyId, answer_marker: "Trial", ...keySource }],
    absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], key_terms: [],
    safety_claims: [], safety_question: false, mechanism_claims: [], recommendations: [], answer_draft: draft,
    later_inputs: { source_reading: [{ source: keyId, reading: "full_text_audited", quote: AUDITED }] }
  });
  const linked = `[Trial](${LINK.replaceAll("(", "%28").replaceAll(")", "%29")}) (${AUDITED}) tested it.`;

  it("matches a key source given in any form to the receipts signing the DOI", () => {
    // A doi.org link with escapes beyond the angle brackets is read as acquisition reads it, in full (the review of #421).
    const link = "https://doi.org/10.1002/%28SICI%291099-0000%2819990101%291%3A1%3C1%3A%3AAID-SYN1%3E3.0.CO%3B2-X";
    expect(normalizeIdentifier(link)).toBe(CANONICAL);
    expect(sourceIdKey(link)).toBe(sourceIdKey(CANONICAL));
    for (const keyId of [CANONICAL, SICI, ESCAPED, `https://doi.org/${ESCAPED}`, link]) {
      const result = finalizeResearch(input(keyId, linked) as never, { secret: SECRET });
      expect(result.status, keyId).toBe("ready");
      expect(result.next_steps, keyId).toEqual([]);
    }
    expect(normalizeIdentifier(ESCAPED)).toBe(CANONICAL);
    expect(sourceIdKey(ESCAPED)).toBe(sourceIdKey(SICI));
    expect(sourceIdKey(`https://doi.org/${ESCAPED}`)).toBe(CANONICAL);
  });

  it("offers its doi.org link escaped once, and names it escaped where it asks for an acquisition", () => {
    const unlinked = finalizeResearch(input(ESCAPED, `Trial (${AUDITED}) tested it.`) as never, { secret: SECRET });
    const step = unlinked.next_steps.find((text) => text.startsWith(`Key study ${ESCAPED} has no link in the answer`));
    expect(step).toContain(LINK);
    expect(step).not.toContain("%253");
    // A lead whose PubMed record lists a PubMed Central copy the attempt didn't try: the call it asks for names the DOI
    // in the form the published doi pattern takes.
    const lead = finalizeResearch(input(ESCAPED, linked.replace(AUDITED, "abstract only"), [
      sign("full_text_lead", { doi: CANONICAL, state: "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" }),
      sign("pubmed_record", { pmid: "40123499", doi: CANONICAL, pmcid: "PMC7654321" })
    ], { status: "lead_only", read_depth: "abstract_only" }) as never, { secret: SECRET });
    const asked = [...lead.next_steps, ...(lead.notes ?? [])].find((text) => text.includes("PubMed lists an open copy"));
    expect(asked).toContain(`call acquire_open_full_text with DOI ${escapedDoi(CANONICAL)} and pmcid PMC7654321`);
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
