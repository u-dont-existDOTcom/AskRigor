import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EUROPE_PMC_SECTIONS, EUROPE_PMC_FULL_TEXT_COVERAGE, europePmcSections } from "../apps/research-mcp/src/europe-pmc-sections.js";
import { finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT, type FinalizeResearchInput, type FinalizeResearchOutput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { assertNextStepsContract, inventory } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "full-text-section-search-test-secret-0123456789";
const QUERY = 'METHODS:"carbidopa"';
const DOI = "10.1000/section";
const CAVEAT = "Where it says something was not found, the full-text searches covered Europe PMC's full texts only, about 30% of PubMed records.";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const receipt = (query = QUERY, claims: Parameters<typeof issueResearchReceipt>[1] = {}) =>
  sign("literature_search", { src: "europepmc", q: discoveryQueryDigest([query]), ft: ["METHODS"], ...claims });
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  receipts: [sign("study_audit", { id: DOI, status: "complete_no_unresolved_fields" })],
  research_target: "Synthetic article section search", research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
  not_relevant_reason: "Synthetic exact syntax and receipt checks.",
  commercial_review_applicability: { status: "not_applicable", reason: "Synthetic fixture concerns no commercial product." },
  intervention_identity: { status: "not_applicable", reason: "Synthetic fixture contains no study intervention." },
  key_sources: [{ id: DOI, status: "validated" }], absence_claims: [], scale_results: [],
  answer_draft: `[Study](https://doi.org/${DOI}) reports a synthetic mechanism.`, ...overrides
});
const check = (input: FinalizeResearchInput) => assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Europe PMC section syntax", () => {
  it.each([
    ['"METHODS:x RESULTS:y" ABSTRACT:z', []],
    ['"an escaped \\" METHODS:x" TABLE:y', ["TABLE"]],
    ['methods:x OR Results:y OR METHODS:z', ["METHODS", "RESULTS"]],
    ['((INTRO:x AND (BODY:y OR COMP_INT:z)))', ["BODY", "COMP_INT", "INTRO"]],
    ['ABSTRACT:x TITLE:y', []], ['UNKNOWN:x NOTMETHODS:y _TABLE:z 2FIG:x éBODY:y 𐐀BODY:y METHODſ:z', []],
    ['METHODS :x RESULTS_MORE:x', []], ['', []], ['"METHODS:x', []]
  ] as Array<[string, string[]]>)("detects fields in %s", (query, expected) => {
    expect(europePmcSections(query)).toEqual(expected);
  });
  it("recognizes every supported code once in sorted order", () => {
    expect(europePmcSections(EUROPE_PMC_SECTIONS.map((code) => `${code}:x ${code.toLowerCase()}:y`).join(" OR ")))
      .toEqual([...EUROPE_PMC_SECTIONS].sort());
  });
  it("scans a long quoted phrase and unknown token without searching their suffixes", () => {
    expect(europePmcSections(`"${'METHODS:x '.repeat(10_000)}" ${'x'.repeat(100_000)}RESULTS:y FIG:z`)).toEqual(["FIG"]);
  });
});

describe("section search through the in-memory MCP endpoint", () => {
  it.each([
    [QUERY, ["METHODS"]], ['((results:x) OR methods:y)', ["METHODS", "RESULTS"]],
    ['ABSTRACT:x', []], ['plain terms', []], ['"METHODS:x" TITLE:y', []]
  ] as Array<[string, string[]]>)("returns scope and signed section claims for %s", async (query, sections) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      version: "6.9", hitCount: 0, request: { queryString: query, cursorMark: "*", pageSize: 20 }, resultList: { result: [] }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const server = createAskRigorServer();
    const client = new Client({ name: "section-search-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
    try {
      const result = await client.callTool({ name: "search_europe_pmc", arguments: { query, page_size: 20 } });
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      const output = result.structuredContent as { research_receipt: string; full_text_scope?: unknown };
      expect(output.full_text_scope).toEqual(sections.length === 0 ? undefined : {
        sections, coverage: EUROPE_PMC_FULL_TEXT_COVERAGE
      });
      const verified = verifyResearchReceipt(output.research_receipt, { secret: SECRET });
      expect(verified).toMatchObject({ ok: true, kind: "literature_search", claims: { src: "europepmc", q: discoveryQueryDigest([query]) } });
      if (!verified.ok) throw new Error("Receipt failed verification");
      expect(verified.claims.ft).toEqual(sections.length === 0 ? undefined : sections);
      expect(fetch).toHaveBeenCalledTimes(1);
      if (sections.length > 0) {
        const request = base({ receipts: [...base().receipts, output.research_receipt], full_text_search: { status: "run", queries: [query] } });
        const finalized = await client.callTool({ name: "finalize_research", arguments: { ...request } });
        expect(finalized.isError).not.toBe(true);
        expect(assertNextStepsContract(finalized.structuredContent as FinalizeResearchOutput).status).toBe("ready");
      }
    } finally { await client.close(); await server.close(); }
  });
  it("publishes the scope and descriptive declaration", () => {
    const tool = inventory.tools.find(({ name }) => name === "search_europe_pmc")!;
    expect(tool.description).toContain("Such results carry full_text_scope");
    expect(JSON.stringify(tool.outputSchema)).toContain('"full_text_scope"');
    const finalizer = inventory.tools.find(({ name }) => name === "finalize_research")!;
    expect(JSON.stringify(finalizer.inputSchema)).toContain("Records the model's declaration of full-text search");
  });
});

describe("full_text_search declaration gate", () => {
  it("requires a declaration with key sources and adds the refresh hint", () => {
    const result = check(base());
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toContain("Give full_text_search: status run with queries searched in Europe PMC article sections, or status not_needed with reason.");
    expect(result.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
  });
  it("does not require it without key sources", () => {
    expect(check(base({ key_sources: [] })).next_steps.join(" ")).not.toContain("full_text_search");
  });
  it("accepts every query matched to a verified section receipt", () => {
    const second = "RESULTS:harms";
    expect(check(base({ receipts: [...base().receipts, receipt(), receipt(second, { ft: ["RESULTS"] })],
      full_text_search: { status: "run", queries: [QUERY.toLowerCase(), second] } })).status).toBe("ready");
  });
  it.each([
    ["unmatched query", receipt("METHODS:other")],
    ["no section claim", receipt(QUERY, { ft: undefined })],
    ["empty section claim", receipt(QUERY, { ft: [] })],
    ["PubMed receipt", receipt(QUERY, { src: "pubmed" })],
    ["wrong kind", sign("youtube_search", { src: "europepmc", q: discoveryQueryDigest([QUERY]), ft: ["METHODS"] })],
    ["unverified receipt", issueResearchReceipt("literature_search", { src: "europepmc", q: discoveryQueryDigest([QUERY]), ft: ["METHODS"] }, { secret: "other-test-signing-secret-0123456789" })]
  ])("refuses %s with a precise executable step", (_name, token) => {
    const result = check(base({ receipts: [...base().receipts, token], full_text_search: { status: "run", queries: [QUERY] } }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.some((step) => step.includes(JSON.stringify(QUERY)) && step.includes("search_europe_pmc") && step.includes("research_receipt"))).toBe(true);
  });
  it("accepts not_needed with the model's reason", () => {
    expect(check(base({ full_text_search: { status: "not_needed", reason: "The question is answered by the audited abstracts." } })).status).toBe("ready");
  });
  it.each([
    { status: "not_needed" }, { status: "not_needed", reason: "short" },
    { status: "not_needed", reason: " ".repeat(10) }, { status: "not_needed", reason: "x".repeat(301) },
    { status: "not_needed", reason: "A valid reason here.", queries: [QUERY] },
    { status: "run", queries: [] }, { status: "run", queries: Array(11).fill(QUERY) },
    { status: "run", queries: [""] }, { status: "run", queries: ["x".repeat(501)] },
    { status: "run", queries: [QUERY], reason: "Not a published run field." }
  ])("rejects invalid strict union input %j", (full_text_search) => {
    expect(finalizeResearchInputSchema.safeParse({ ...base(), full_text_search }).success).toBe(false);
  });
  it("requires the coverage caveat, including its translated rendering", () => {
    const quote = "The searches did not locate support.";
    const request = base({ receipts: [...base().receipts, receipt()], full_text_search: { status: "run", queries: [QUERY] },
      absence_claims: [{ quote, state: "support_not_located" }], answer_draft: `${base().answer_draft} ${quote}` });
    const first = check(request);
    expect(first.caveats).toContain(CAVEAT);
    expect(first.limits).toContain("The answer says something was not found after full-text searches: bound that to their coverage, as the caveat does.");
    expect(first.status).toBe("not_ready");
    expect(check({ ...request, answer_draft: `${request.answer_draft} ${first.caveats.join(" ")}` }).status).toBe("ready_with_limits");
    const text = "Les recherches en texte intégral ne couvraient que les textes d'Europe PMC, environ 30 % des notices PubMed.";
    const translated = { ...request, answer_language: "fr", caveat_renderings: [{ caveat: CAVEAT, text }],
      answer_draft: `${request.answer_draft} ${first.caveats.filter((caveat) => caveat !== CAVEAT).join(" ")} ${text}` };
    expect(check(translated).status).toBe("ready_with_limits");
    expect(check({ ...translated, answer_draft: translated.answer_draft.replace(text, "") }).status).toBe("not_ready");
  });
  it("adds no coverage caveat for not_needed or for an answer without a not-found claim", () => {
    expect(check(base({ full_text_search: { status: "not_needed", reason: "No section search needed for this fixture." } })).caveats).not.toContain(CAVEAT);
    expect(check(base({ receipts: [...base().receipts, receipt()], full_text_search: { status: "run", queries: [QUERY] } })).caveats).not.toContain(CAVEAT);
  });
});
