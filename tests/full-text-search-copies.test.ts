import type { AddressInfo } from "node:net";

import { okEnvelope } from "@askrigor/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDY_METHOD_AUDIT_DOMAINS } from "../apps/research-mcp/src/actions/study-method-audit.js";
import { REVIEW_METHOD_AUDIT_DOMAINS } from "../apps/research-mcp/src/actions/review-method-audit.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import type { AcquireOpenFullTextRuntime } from "../packages/sources/src/open-full-text.js";
import { syntheticBody } from "./helpers/synthetic-full-text.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(), acquireOpenFullText: acquire
}));
const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
const { createAskRigorHttpServer } = await import("../apps/research-mcp/src/server.js");

// Entirely generated metadata, abstract and body: no real study text.
const DOI = "10.1234/synthetic.green-tea";
const TITLE = "Synthetic green-tea intervention in fixture participants";
const PII = "S0123456726000999";
const CANDIDATE_URL = "https://www.academia.edu/synthetic-green-tea";
const SECRET = "search-copy-fixture-secret-0123456789abcdef";
const ABSTRACT = Array.from({ length: 8 }, (_, n) => `Synthetic abstract sentence ${n} describes generated fixture participants and generated measurements.`).join(" ");
const body = (kind: string) => syntheticBody(kind).replaceAll("\n", " ");
const fullText = () => `${TITLE}\nFixtureauthor A 2026 DOI ${DOI}\nAbstract\n${ABSTRACT}\nMethods\n${body("methods")}\nResults\n${body("results")}\nDiscussion\n${body("discussion")}`;
const embedded = (headings = ["MATERIALS AND METHODS", "RESULTS", "DISCUSSION"], front = `DOI ${DOI}`) =>
  `${front} ${TITLE} Fixtureauthor A 2026. ABSTRACT ${ABSTRACT} ${headings[0]} ${body("methods")} ${headings[1]} ${body("results")} ${headings[2]} ${body("discussion")} REFERENCES Synthetic reference list.`;
const chrome = `Menus and download controls\nRelated papers\n${"Synthetic related-paper summary. ".repeat(280)}\n`;
const supplied = (text = fullText(), url = CANDIDATE_URL) => ({ url, text, retrieved_via: "client_search_index" });

let runtime: AcquireOpenFullTextRuntime;
let abstract: string | undefined;
let fetchedText: string;
let client: Client;
let server: ReturnType<typeof createAskRigorHttpServer>;

beforeEach(async () => {
  vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", SECRET);
  abstract = ABSTRACT;
  fetchedText = fullText();
  runtime = {
    searchEuropePmc: vi.fn(async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result",
      accessStatus: "complete", returned: 1, pagination: { exhausted: true }, data: [{ source: "MED", id: "9990001",
        pmid: "9990001", doi: DOI, title: TITLE, authors: ["Fixtureauthor A"], year: "2026", pii: PII,
        ...(abstract === undefined ? {} : { abstractText: abstract }) }] })),
    unpaywallRuntime: { resolve: vi.fn(async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution",
      accessStatus: "metadata_only", returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title: TITLE,
        is_oa: false, oa_status: "closed", full_text_lead_status: "no_open_location_found", oa_locations: [] } })) },
    candidateRuntime: { fetchDocument: vi.fn(async (url) => ({ finalUrl: url, contentType: "text/html",
      bytes: new TextEncoder().encode(fetchedText) })), now: () => new Date("2026-10-09T00:00:00Z") }
  };
  acquire.mockReset().mockImplementation((input) => actual.acquireOpenFullText(input, { email: "fixture@example.test" }, runtime));
  server = createAskRigorHttpServer({ publicServerEnabled: true });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  client = new Client({ name: "phase1b-synthetic-test", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)));
});
afterEach(async () => {
  await client?.close();
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function call(name: string, arguments_: Record<string, unknown>) {
  return client.callTool({ name, arguments: arguments_ });
}
async function copy(text = fullText()) {
  const result = await call("acquire_open_full_text", { doi: DOI, candidate_texts: [supplied(text)] });
  expect(result.isError).not.toBe(true);
  return result.structuredContent as any;
}
function noHandle(output: any) { expect(output).not.toHaveProperty("coverage_receipt"); }

describe("Phase 1b search copies through the real HTTP MCP endpoint", () => {
  it("returns a carried synthetic abstract in the strict Europe PMC MCP output", async () => {
    const originalFetch = globalThis.fetch;
    let upstreamRequests = 0;
    vi.stubGlobal("fetch", async (input: URL | RequestInfo, options?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== "www.ebi.ac.uk") return originalFetch(input, options);
      upstreamRequests += 1;
      return new Response(JSON.stringify({ hitCount: 1, request: { queryString: `DOI:"${DOI}"`, cursorMark: "*", pageSize: 10 },
        resultList: { result: [{ source: "MED", id: "9990001", doi: DOI, abstractText: ABSTRACT }] } }), { status: 200 });
    });
    const result = await call("search_europe_pmc", { query: `DOI:"${DOI}"`, page_size: 10 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ data: [{ abstractText: ABSTRACT }] });
    expect(upstreamRequests).toBe(1);
  });
  it("admits a matching supplied copy with a handle and truthful provenance without fetching its URL", async () => {
    const output = await copy();
    expect(output).toMatchObject({ status: "full_text_available", acquisition_state: "FULL_TEXT_READABLE",
      source: { provider: "client_supplied", canonical_url: CANDIDATE_URL, format: "plain_text" },
      candidates: [{ retrieval_provider: "client_search_index", source_class: "researcher_upload", source_class_basis: "known_host" }] });
    expect(output.coverage_receipt.document_handle).toMatch(/^aft1_/u);
    expect(runtime.candidateRuntime!.fetchDocument).not.toHaveBeenCalled();
    expect(runtime.searchEuropePmc).toHaveBeenCalledTimes(1);
    expect(runtime.unpaywallRuntime!.resolve).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(output.candidates)).not.toContain(ABSTRACT);
    expect(output).not.toHaveProperty("candidate_texts");
  });
  it("extracts the synthetic green-tea Academia layout after menus and related papers", async () => {
    const output = await copy(chrome + embedded());
    expect(output).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE", candidates: [{ extraction: "embedded_block",
      identity_verification: "doi_exact", sections_observed: ["methods", "results", "discussion"] }] });
    expect(output.blocks.map((block: any) => block.text).join("\n")).not.toContain("Synthetic related-paper summary");
  });
  it("uses the same embedded extraction for a directly fetched HTML candidate", async () => {
    fetchedText = `<h1>Upload page and unrelated records</h1><p>${chrome.replaceAll("\n", "</p><p>")}</p><p>${embedded()}</p>`;
    const result = await call("acquire_open_full_text", { doi: DOI, candidate_urls: [{ url: CANDIDATE_URL }] });
    expect(result.structuredContent).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE",
      source: { provider: "direct_candidate", format: "html_text" }, candidates: [{ extraction: "embedded_block", retrieval_provider: "direct" }] });
  });
  it("keeps the whole-page result when it already passes despite ambiguous long lines", async () => {
    const output = await copy(fullText() + `\n${embedded()}\n${embedded()}`);
    expect(output.acquisition_state).toBe("FULL_TEXT_READABLE");
    expect(output.candidates[0]).not.toHaveProperty("extraction");
  });
  it("does not admit the same upload page without its own paper block", async () => {
    const output = await copy(`${TITLE}\nDOI ${DOI}\nAbstract\n${ABSTRACT}\n${chrome}`);
    expect(["ABSTRACT_ONLY", "IDENTITY_MISMATCH"]).toContain(output.acquisition_state);
    expect(output.candidates[0]).not.toHaveProperty("extraction");
    noHandle(output);
  });
  it("leaves ambiguous qualifying embedded blocks unextracted", async () => {
    const output = await copy(`${chrome}${embedded()}\n${embedded()}`);
    expect(output.acquisition_state).not.toBe("FULL_TEXT_READABLE");
    expect(output.candidates[0]).not.toHaveProperty("extraction");
    noHandle(output);
  });
  it.each(["doi", "pii", "title"])("finds an embedded block by its exact %s", async (kind) => {
    const front = kind === "doi" ? `DOI ${DOI}` : kind === "pii" ? `PII ${PII}` : TITLE.replaceAll("-", " ");
    const text = embedded(undefined, front).replace(TITLE, "Synthetic front matter");
    const output = await copy(chrome + text);
    expect(output).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE", candidates: [{ extraction: "embedded_block",
      identity_verification: kind === "doi" ? "doi_exact" : kind === "pii" ? "pii_exact" : "title_match" }] });
  });
  it("rejects an identity found only beyond the first 2,000 characters of a long line", async () => {
    const output = await copy(chrome + "Synthetic unrelated prefix. ".repeat(100) + embedded());
    expect(output.acquisition_state).not.toBe("FULL_TEXT_READABLE");
    expect(output.candidates[0]).not.toHaveProperty("extraction");
    noHandle(output);
  });
  it("does not extract a matching line below the 6,000-character minimum", async () => {
    const output = await copy(chrome + embedded().slice(0, 5_999));
    expect(output.candidates[0]).not.toHaveProperty("extraction");
    noHandle(output);
  });
  it.each([
    ["Methods", "Results", "Discussion"], ["Méthodes", "Résultats", "Discussion"],
    ["Métodos", "Resultados", "Discusión"], ["Métodos", "Resultados", "Discussão"],
    ["Methoden", "Ergebnisse", "Diskussion"], ["Metodi", "Risultati", "Discussione"]
  ])("splits sentence-bounded title-case headings %s / %s / %s", async (...headings) => {
    const output = await copy(chrome + embedded(headings));
    expect(output).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE", candidates: [{ extraction: "embedded_block" }] });
  });
  it.each([
    ["MATÉRIEL ET MÉTHODES", "RÉSULTATS", "DISCUSSION"], ["MATERIALES Y MÉTODOS", "RESULTADOS", "DISCUSIÓN"],
    ["MATERIAIS E MÉTODOS", "RESULTADOS", "DISCUSSÃO"], ["MATERIAL UND METHODEN", "ERGEBNISSE", "DISKUSSION"],
    ["MATERIALI E METODI", "RISULTATI", "DISCUSSIONE"]
  ])("splits letter-bounded caps headings %s / %s / %s", async (...headings) => {
    expect((await copy(chrome + embedded(headings))).acquisition_state).toBe("FULL_TEXT_READABLE");
  });
  it("credits inline combined results and discussion without double-counting the body", async () => {
    const text = `DOI ${DOI}. ABSTRACT ${ABSTRACT} MATERIALS AND METHODS ${body("methods")} RESULTS AND DISCUSSION ${body("combined")}`;
    expect((await copy(chrome + text)).acquisition_state).toBe("FULL_TEXT_READABLE");
  });
  it.each(["lowercase", "letters", "no_sentence", "no_capital", "unsupported"])("keeps %s inline forms partial", async (kind) => {
    let text = embedded();
    if (kind === "lowercase") text = embedded(["methods", "results", "discussion"]);
    if (kind === "letters") text = embedded(["preMETHODSpost", "preRESULTSpost", "preDISCUSSIONpost"]);
    if (kind === "no_sentence") text = embedded(["Methods", "Results", "Discussion"]).replaceAll(". Methods", ", Methods").replaceAll(". Results", ", Results").replaceAll(". Discussion", ", Discussion");
    if (kind === "no_capital") text = embedded(["Methods", "Results", "Discussion"]).replaceAll(" Synthetic methods", " synthetic methods").replaceAll(" Synthetic results", " synthetic results").replaceAll(" Synthetic discussion", " synthetic discussion");
    if (kind === "unsupported") text = embedded(["方法", "结果", "讨论"]);
    const output = await copy(chrome + text);
    expect(output.acquisition_state).not.toBe("FULL_TEXT_READABLE");
    expect(output.candidates[0].limitations.join(" ")).toContain("English, French, Spanish, Portuguese, German and Italian");
    noHandle(output);
  });
  it.each(["paraphrase", "different abstract", "interrupted prefix"])("refuses a supplied copy with a %s", async (kind) => {
    const replacement = kind === "paraphrase" ? ABSTRACT.replaceAll("describes", "summarizes")
      : kind === "different abstract" ? "Another generated study's abstract. ".repeat(30)
        : ABSTRACT.slice(0, 120) + " an inserted unrelated sentence " + ABSTRACT.slice(120);
    const output = await copy(fullText().replace(ABSTRACT, replacement));
    expect(output).toMatchObject({ acquisition_state: "IDENTITY_MISMATCH", candidates: [{ limitations: [expect.stringContaining("exact abstract cross-check failed")] }] });
    expect(output.blocks).toBeUndefined();
    noHandle(output);
    expect(JSON.stringify(output)).not.toContain(replacement);
  });
  it("matches the first 300 compact abstract characters across punctuation, case and Unicode normalization", async () => {
    const normalized = Array.from(ABSTRACT.toUpperCase()).map((character) => /[A-Z0-9]/u.test(character)
      ? String.fromCharCode(character.charCodeAt(0) + 0xfee0) : character).join("").replaceAll(" ", " - \n ");
    expect((await copy(fullText().replace(ABSTRACT, normalized))).acquisition_state).toBe("FULL_TEXT_READABLE");
  });
  it("cross-checks an abstract with static provider markup and encoded entities", async () => {
    abstract = `<p>${ABSTRACT.replaceAll("generated", "generat&#101;d")}</p>`;
    expect((await copy()).acquisition_state).toBe("FULL_TEXT_READABLE");
  });
  it("does not let a matching abstract replace article identity or body admission", async () => {
    const mismatch = await copy(fullText().replace(TITLE, "Different synthetic study of another intervention").replace(DOI, "10.1234/another.study"));
    expect(mismatch.acquisition_state).toBe("IDENTITY_MISMATCH");
    noHandle(mismatch);
    const partial = await copy(`${TITLE} DOI ${DOI}\nAbstract\n${ABSTRACT}\nMethods\n${body("methods")}`);
    expect(partial.acquisition_state).toBe("PARTIAL_TEXT_READABLE");
    noHandle(partial);
  });
  it("returns a bounded candidate refusal for too many supplied document blocks", async () => {
    abstract = undefined;
    const output = await copy("s\n".repeat(100_001));
    expect(output.acquisition_state).toBe("CANDIDATE_FOUND_FETCH_BLOCKED");
    expect(output.candidates[0].limitations.join(" ")).toContain("structural limits");
    noHandle(output);
  });
  it("reports a skipped abstract check when the existing metadata has no abstract", async () => {
    abstract = undefined;
    const output = await copy();
    expect(output).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE", candidates: [{ limitations: [expect.stringContaining("skipped")] }] });
    expect(runtime.searchEuropePmc).toHaveBeenCalledTimes(1);
    expect(runtime.candidateRuntime!.fetchDocument).not.toHaveBeenCalled();
  });
  it("checks the whole of a shorter abstract, and refuses a copy without it", async () => {
    const shortAbstract = "Synthetic shorter abstract reports generated fixture participants, generated measurements and one generated outcome for this check.";
    abstract = shortAbstract;
    expect((await copy(fullText().replace(ABSTRACT, shortAbstract))).coverage_receipt.document_handle).toMatch(/^aft1_/u);
    const missing = await copy(fullText().replace(ABSTRACT, "A different synthetic summary of other generated work, long enough to stand in for an abstract here."));
    expect(missing.candidates[0].limitations[0]).toContain("does not contain the study's abstract");
    noHandle(missing);
  });
  it("skips the abstract check for an abstract too short to identify a paper, and says so", async () => {
    abstract = "Synthetic short abstract.";
    const output = await copy(fullText().replace(ABSTRACT, abstract));
    expect(output.candidates[0].limitations.join(" ")).toContain("too short to identify it");
  });
  it("allows two supplied copies and preserves source ranking and input order", async () => {
    const result = await call("acquire_open_full_text", { doi: DOI, candidate_texts: [supplied(), supplied(fullText(), "https://zenodo.org/synthetic-copy")] });
    expect(result.structuredContent).toMatchObject({ source: { canonical_url: "https://zenodo.org/synthetic-copy" },
      candidates: [{ url: CANDIDATE_URL }, { url: "https://zenodo.org/synthetic-copy" }] });
  });
  it.each([
    ["third text", () => [supplied(), supplied(), supplied()]], ["empty list", () => []],
    ["short text", () => [supplied("s".repeat(1_999))]], ["long text", () => [supplied("s".repeat(400_001))]],
    ["HTTP URL", () => [supplied(fullText(), "http://public.example/copy")]],
    ["URL credentials", () => [supplied(fullText(), "https://user:secret@public.example/copy")]],
    ["custom port", () => [supplied(fullText(), "https://public.example:1234/copy")]],
    ["wrong route", () => [{ ...supplied(), retrieved_via: "direct" }]],
    ["extra field", () => [{ ...supplied(), extra: true }]]
  ])("refuses %s at the MCP schema boundary before acquisition", async (_name, candidates) => {
    const result = await call("acquire_open_full_text", { doi: DOI, candidate_texts: candidates() });
    expect(result.isError).toBe(true);
    expect(acquire).not.toHaveBeenCalled();
  });
  it.each([2_000, 400_000])("accepts the exact %i-character text schema boundary", async (length) => {
    const result = await call("acquire_open_full_text", { doi: DOI, candidate_texts: [supplied((fullText() + "s".repeat(400_000)).slice(0, length))] });
    expect(result.isError).not.toBe(true);
    expect(acquire).toHaveBeenCalledTimes(1);
  });
  it("returns all seven candidates when five fetched and two supplied copies coexist", async () => {
    const result = await call("acquire_open_full_text", { doi: DOI, candidate_urls: Array.from({ length: 5 }, (_, n) => ({ url: `https://zenodo.org/copy-${n}` })),
      candidate_texts: [supplied(), supplied(fullText(), "https://public.example/copy")] });
    expect(result.isError).not.toBe(true);
    const output = result.structuredContent as any;
    expect(output.candidates).toHaveLength(7);
    expect(output.source.provider).toBe("direct_candidate");
  });
  it.each(["study", "review"])("signs server-derived search provenance on a %s audit receipt and requires its finalization caveat", async (kind) => {
    let output = await copy(chrome + embedded());
    const source = output.source;
    const handle = output.coverage_receipt.document_handle;
    const blockId = output.blocks[0].block_id;
    while (!output.coverage_receipt.exhausted) {
      output = (await call("continue_open_full_text", { document_handle: handle })).structuredContent as any;
      expect(output.source.provider).toBe("client_supplied");
    }
    const program = { name: "synthetic program", components: ["generated component"], dose_or_intensity: "synthetic",
      frequency: "synthetic", duration: "synthetic", supervision: "synthetic", adherence: "synthetic", co_interventions: [], care_stage: "nonsurgical" };
    const audit = { source_primary_identifier: DOI, source_content_sha256: source.content_sha256,
      ...(kind === "study" ? { design_label: "synthetic fixture study", design_capability_statement: "The label does not establish reliability.",
        population_and_stage: "generated participants", intervention_program: program, comparator_program: program, outcome_and_horizon: "generated outcome" }
        : { review_type: "systematic_review", search_end_date: "2026-01-01", included_source_families: ["synthetic studies"],
          program_fingerprints: [{ label: "synthetic", components: ["generated"], dose_or_intensity: "synthetic", frequency: "synthetic",
            duration: "synthetic", supervision: "synthetic", co_interventions: [], population_or_stage: "synthetic", outcome_and_horizon: "synthetic" }] }),
      domain_findings: (kind === "study" ? STUDY_METHOD_AUDIT_DOMAINS : REVIEW_METHOD_AUDIT_DOMAINS).map((domain) => ({ domain,
        status: "limitation_identified", plain_language_finding: "Synthetic fixture limitation.", evidence_block_ids: [blockId], unresolved_fields: [] })),
      claim_capabilities: [{ claim: "Generated narrow claim", capability: "can_support", reason: "Synthetic block", evidence_block_ids: [blockId] },
        { claim: "Generated broad claim", capability: "cannot_support", reason: "Synthetic limit", evidence_block_ids: [] }] };
    const result = await call(`validate_${kind}_method_audit`, { document_handle: handle, audit });
    expect(result.isError).not.toBe(true);
    const receipt = (result.structuredContent as any).research_receipt;
    expect(verifyResearchReceipt(receipt, { secret: SECRET })).toMatchObject({ ok: true, kind: `${kind}_audit`,
      claims: { doi: DOI, retrieval_provider: "client_search_index", host: "www.academia.edu" } });
    const request = { receipts: [receipt], research_target: "Synthetic fixture target", research_depth: "first_pass", community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
      not_relevant_reason: "Pure fixture mechanism", treatment_choice: "not_compared", key_sources: [{ id: DOI, status: "validated" }],
      answer_draft: "Synthetic fixture answer.", absence_claims: [] };
    const finalResult = await call("finalize_research", request);
    expect(finalResult.isError, JSON.stringify(finalResult.content)).not.toBe(true);
    const finalized = finalResult.structuredContent as any;
    const caveat = `The full text of ${DOI} came from the AI's search-index copy of www.academia.edu; AskRigor did not fetch it.`;
    expect(finalized.caveats).toContain(caveat);
    expect(finalized.status).toBe("not_ready");
    expect(finalized.next_steps.join(" ")).toContain(caveat);
    const restated = (await call("finalize_research", { ...request, answer_draft: `Synthetic fixture answer. ${caveat}` })).structuredContent as any;
    expect(restated.next_steps.join(" ")).not.toContain(`"${caveat}"`);
  });
});
