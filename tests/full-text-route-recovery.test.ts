import { errorEnvelope, okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import { createOpenFullTextExecutor } from "../apps/research-mcp/src/actions/open-full-text-route.js";
import { acquireOpenFullText, acquireUnpaywallFullText, type AcquisitionState, type FrozenArticleIdentity, type AcquireOpenFullTextRuntime } from "../packages/sources/src/index.js";
import { admitFullText, classifySource } from "../packages/sources/src/full-text-admission.js";
import { fetchCandidateDocument, UpstreamHttpError } from "../packages/sources/src/http.js";
import { planAcceptanceIdentities } from "./helpers/full-text-acceptance-identities.js";
import { syntheticArticleText, syntheticBody, syntheticPdf } from "./helpers/synthetic-full-text.js";

const IDENTITY = { doi: "10.1234/synthetic.target", pmid: "99901", title: "Exact synthetic target article", first_author: "Fixtureauthor A", year: "2001", journal: "Synthetic Journal" };
const CONFIG = { email: "research@example.test" };
const URL = "https://www.academia.edu/synthetic-copy";
const FRONT = `${IDENTITY.title}\n${IDENTITY.first_author} ${IDENTITY.year}\nDOI ${IDENTITY.doi}`;
function html(front = FRONT): string {
  return `<html><body><h1>${front.split("\n")[0]}</h1><p>${front.split("\n").slice(1).join(" ")}</p><h2>Abstract</h2><p>Synthetic summary.</p><h2>Methods</h2><p>${syntheticBody("methods")}</p><h2>Results</h2><p>${syntheticBody("results")}</p><h2>Discussion</h2><p>${syntheticBody("discussion")}</p></body></html>`;
}
function unavailable(status: "rate_limited" | "error" | "not_found" = "error") {
  return errorEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: status,
    primaryIdentifier: IDENTITY.doi, pagination: { exhausted: true }, returned: 0, code: "synthetic_provider_failure", message: "Synthetic response", retryable: status !== "not_found", data: {} });
}
function runtime(content: string | Uint8Array, options: { identity?: FrozenArticleIdentity; type?: string; failure?: number; urls?: Record<string, string> } = {}): AcquireOpenFullTextRuntime {
  const identity = options.identity ?? IDENTITY;
  return {
    searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", accessStatus: "complete", pagination: { exhausted: true }, returned: 1,
      data: [{ source: "MED", id: identity.pmid ?? "99901", doi: identity.doi, pmid: identity.pmid, title: identity.title,
        authors: [identity.first_author!], year: identity.year, journal: identity.journal, pii: identity.pii }] }),
    unpaywallRuntime: { resolve: async () => unavailable() },
    candidateRuntime: { documentFetchRuntime: {
      resolveAddresses: async () => ["93.184.216.34"],
      requestDocument: async (url) => ({ status: options.failure ?? 200,
        headers: new Headers({ "content-type": options.type ?? "text/html" }),
        bytes: typeof content === "string" ? new TextEncoder().encode(options.urls?.[url.toString()] ?? content) : content })
    }, now: () => new Date("2026-10-07T00:00:00Z") }
  };
}
async function acquire(content: string | Uint8Array, options: Parameters<typeof runtime>[1] = {}) {
  const rt = runtime(content, options);
  const identity = options.identity ?? IDENTITY;
  const executor = createOpenFullTextExecutor({ acquire: (input) => acquireOpenFullText(input, CONFIG, rt), unpaywallConfig: CONFIG });
  return executor.acquire({ doi: identity.doi, candidate_urls: [{ url: URL }] });
}

describe("Phase 1 full-text route recovery", () => {
  it.each(["rate_limited", "error"] as const)("keeps Unpaywall %s as a failed route, never inaccessible", async (status) => {
    const unpaywall = await acquireUnpaywallFullText(IDENTITY.doi, CONFIG, { resolve: async () => unavailable(status) });
    expect(unpaywall.access_status).toBe("error");
    expect(unpaywall.data.acquisition_state).toBe("PROVIDER_UNAVAILABLE");
    const rt = runtime(html());
    rt.unpaywallRuntime = { resolve: async () => unavailable(status) };
    const result = await acquireOpenFullText({ doi: IDENTITY.doi }, CONFIG, rt);
    expect(result.data.discovery_attempts).toEqual([{ route: "europe_pmc", result: "not_found" }, { route: "unpaywall", result: "error", identifier: IDENTITY.doi }]);
    expect(result.data.acquisition_state).toBe("PRIMARY_OA_ROUTES_EXHAUSTED");
    expect(result.data.access_boundary).toContain(`title "${IDENTITY.title}", DOI ${IDENTITY.doi}, PMID ${IDENTITY.pmid}`);
    expect(result.data.access_boundary).toContain("candidate_urls");
    expect(result.data.access_boundary).not.toContain("inaccessible");
  });
  it("recovers Europe PMC not_found plus Unpaywall failure with an Academia HTML copy and a handle", async () => {
    const output = await acquire(html());
    expect(output).toMatchObject({ status: "full_text_available", acquisition_state: "FULL_TEXT_READABLE",
      discovery_attempts: [{ route: "europe_pmc", result: "not_found" }, { route: "unpaywall", result: "error" }, { route: "candidate", result: "indexed" }],
      candidates: [{ url: URL, source_class: "researcher_upload", retrieval_provider: "direct", state: "FULL_TEXT_READABLE", identity_verification: "doi_exact", sections_observed: ["methods", "results", "discussion"], completeness: "full_text", retrieved_at: "2026-10-07T00:00:00.000Z" }],
      coverage_receipt: { document_handle: expect.stringMatching(/^aft1_/u) } });
  });
  it.each(planAcceptanceIdentities)("recovers the plan's DOI identity for PMID $pmid ($first_author)", async (identity) => {
    const front = `Synthetic fixture for PMID ${identity.pmid} (title unavailable offline)\n${identity.first_author} ${identity.year} ${identity.journal}\nDOI ${identity.doi}`;
    const output = await acquire(html(front), { identity });
    expect(output).toMatchObject({ requested_doi: identity.doi, status: "full_text_available", acquisition_state: "FULL_TEXT_READABLE",
      candidates: [{ identity_verification: "doi_exact", source_class: "researcher_upload", sections_observed: ["methods", "results", "discussion"] }] });
    expect(output).toHaveProperty("coverage_receipt.document_handle");
  });

  it.each([
    ["abstract-only researcher upload", `<h1>${IDENTITY.title}</h1><p>DOI ${IDENTITY.doi}</p><h2>Abstract</h2><p>${syntheticBody("abstract").repeat(4)}</p>`, "ABSTRACT_ONLY"],
    ["similar title for a different paper", html(`Exact synthetic target article revisited\nOtherauthor 2002\nDOI 10.1234/other.paper`), "IDENTITY_MISMATCH"],
    ["review quoting the target paper", html(`A review of synthetic measurements\nReviewauthor 2010\nDOI 10.1234/a.review`).replace("</body>", `<h2>References</h2><p>${FRONT}</p></body>`), "IDENTITY_MISMATCH"],
    ["login page", '<h1>Login required</h1><form><input type="password"></form>', "PAYWALL_OR_LOGIN_REQUIRED"],
    ["paywall page", '<h1>Subscription required</h1>', "PAYWALL_OR_LOGIN_REQUIRED"],
    ["challenge page", '<h1>Just a moment...</h1><div id="cf-challenge">Checking your browser</div>', "CANDIDATE_FOUND_FETCH_BLOCKED"],
    ["JavaScript-only page", '<div id="app"></div><script src="/app.js"></script>', "CANDIDATE_FOUND_FETCH_BLOCKED"],
    ["missing discussion", html().replace(/<h2>Discussion<\/h2>[\s\S]*?<\/body>/u, "</body>"), "PARTIAL_TEXT_READABLE"],
    ["short three-section text", `<h1>${IDENTITY.title}</h1><p>DOI ${IDENTITY.doi}</p><h2>Methods</h2><p>${"Synthetic method. ".repeat(10)}</p><h2>Results</h2><p>${"Synthetic result. ".repeat(10)}</p><h2>Discussion</h2><p>${"Synthetic discussion. ".repeat(10)}</p>`, "PARTIAL_TEXT_READABLE"]
  ] as const)("rejects admission for %s", async (_label, content, state) => {
    const output = await acquire(content);
    expect(output).toMatchObject({ status: "possibly_useful_lead", acquisition_state: state, candidates: [{ state }] });
    expect(output).not.toHaveProperty("coverage_receipt");
    expect(output).not.toHaveProperty("blocks");
  });
  it("rejects a PDF containing only front matter", async () => {
    const output = await acquire(syntheticPdf(FRONT), { type: "application/pdf" });
    expect(output).toMatchObject({ status: "possibly_useful_lead", acquisition_state: "ABSTRACT_ONLY", candidates: [{ state: "ABSTRACT_ONLY", identity_verification: "doi_exact" }] });
    expect(output).not.toHaveProperty("coverage_receipt");
  });
  it("admits a candidate PDF using the same identity and completeness rule", async () => {
    expect(await acquire(syntheticPdf(syntheticArticleText(FRONT)), { type: "application/pdf" }))
      .toMatchObject({ status: "full_text_available", source: { provider: "direct_candidate", format: "pdf_text" } });
  });
  it.each(["text/plain", "application/xhtml+xml"])("admits bounded %s documents", async (type) => {
    const output = await acquire(type === "text/plain" ? syntheticArticleText(FRONT) : html(), { type });
    expect(output.status).toBe("full_text_available");
  });
  it("preserves entity-encoded French headings and exact article identity", async () => {
    const content = html().replace("Methods", "M&eacute;thodes").replace("Results", "R&eacute;sultats").replace("Discussion", "Conclusions");
    expect(await acquire(content)).toMatchObject({ status: "full_text_available", candidates: [{ sections_observed: ["methods", "results", "discussion"] }] });
  });
  it("decodes a declared public-text charset without executing HTML", async () => {
    const content = html().replace("Methods", "Méthodes").replace("Results", "Résultats").replace("Discussion", "Conclusions");
    expect(await acquire(new Uint8Array(Buffer.from(content, "latin1")), { type: "text/html; charset=iso-8859-1" })).toMatchObject({ status: "full_text_available" });
  });

  it.each([401, 402, 403, 429, 503, 404, 410])("classifies candidate HTTP %i without calling the paper inaccessible", async (status) => {
    const output = await acquire("", { failure: status });
    const state: AcquisitionState = status === 401 || status === 402 ? "PAYWALL_OR_LOGIN_REQUIRED" : status === 404 || status === 410 ? "NO_COPY_FOUND_AFTER_EXPANDED_SEARCH" : status === 503 ? "PROVIDER_UNAVAILABLE" : "CANDIDATE_FOUND_FETCH_BLOCKED";
    expect(output).toMatchObject({ status: "possibly_useful_lead", candidates: [{ state }], acquisition_state: state });
    expect(output).not.toHaveProperty("coverage_receipt");
  });
  it("preserves network failure as blocked and continues subsequent candidates", async () => {
    const rt = runtime(html());
    const goodFetch = rt.candidateRuntime!.documentFetchRuntime!.requestDocument!;
    rt.candidateRuntime!.documentFetchRuntime!.requestDocument = vi.fn().mockRejectedValueOnce(new Error("synthetic network error")).mockImplementation(goodFetch);
    const result = await acquireOpenFullText({ doi: IDENTITY.doi, candidate_urls: [{ url: URL }, { url: "https://zenodo.org/open" }] }, CONFIG, rt);
    expect(result.data).toMatchObject({ acquisition_state: "FULL_TEXT_READABLE", candidates: [{ state: "CANDIDATE_FOUND_FETCH_BLOCKED" }, { state: "FULL_TEXT_READABLE" }], document_index: { source: { canonical_url: "https://zenodo.org/open" } } });
  });
  it.each(["author", "year"])("accepts the exact normalized title plus %s without a DOI", async (basis) => {
    const content = html(`${IDENTITY.title}\n${basis === "author" ? IDENTITY.first_author : IDENTITY.year}`);
    const output = await acquire(content);
    expect(output).toMatchObject({ status: "full_text_available", candidates: [{ identity_verification: "title_match" }] });
  });
  it("rejects the exact title without an author or year", async () => {
    expect(await acquire(html(IDENTITY.title))).toMatchObject({ acquisition_state: "IDENTITY_MISMATCH" });
  });
  it("prefers full repository text over full researcher upload, but full upload over a repository abstract", async () => {
    const rt = runtime(html(), { urls: { "https://zenodo.org/abstract": `<h1>${IDENTITY.title}</h1><p>DOI ${IDENTITY.doi}</p><h2>Abstract</h2><p>Synthetic summary.</p>` } });
    for (const repositoryUrl of ["https://zenodo.org/full", "https://zenodo.org/abstract"]) {
      const result = await acquireOpenFullText({ doi: IDENTITY.doi, candidate_urls: [{ url: URL }, { url: repositoryUrl }] }, CONFIG, rt);
      expect(result.data.document_index?.source.canonical_url).toBe(repositoryUrl.endsWith("full") ? repositoryUrl : URL);
    }
  });
  it("bounds the number of candidate blocks before issuing a handle", async () => {
    const text = `${FRONT}\nMethods\n${"Synthetic line.\n".repeat(100_001)}`;
    expect(await acquire(text, { type: "text/plain" })).toMatchObject({ status: "possibly_useful_lead", acquisition_state: "CANDIDATE_FOUND_FETCH_BLOCKED" });
  });

  it("budgets first-page candidate provenance and long URLs within client limits", async () => {
    const rt = runtime(html().replaceAll(syntheticBody("methods"), syntheticBody("methods").repeat(8)));
    const executor = createOpenFullTextExecutor({ acquire: (input) => acquireOpenFullText(input, CONFIG, rt), unpaywallConfig: CONFIG });
    const output = await executor.acquire({ doi: IDENTITY.doi, candidate_urls: Array.from({ length: 5 }, (_, n) => ({ url: `https://www.academia.edu/${"s".repeat(3_500)}?copy=${n}` })) });
    expect(output.status).toBe("full_text_available");
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(40_000);
    expect(output.discovery_attempts.filter(({ route }) => route === "candidate").map(({ identifier }) => identifier)).toEqual(["candidate_1", "candidate_2", "candidate_3", "candidate_4", "candidate_5"]);
  });

  it("classifies exact hosts before declared class and refuses suffix lookalikes", () => {
    expect(classifySource(URL, "publisher")).toBe("researcher_upload");
    expect(classifySource("https://researchgate.net/doc", undefined)).toBe("researcher_upload");
    expect(classifySource("https://ncbi.nlm.nih.gov/doc", "other")).toBe("repository");
    expect(classifySource("https://www.sciencedirect.com/doc", "other")).toBe("publisher");
    expect(classifySource("https://resolved.example.org/doc", "other", "resolved.example.org")).toBe("publisher");
    expect(classifySource("https://academia.edu.evil.example/doc", undefined)).toBe("other");
    expect(classifySource("https://person.example.org/doc", "author_copy")).toBe("author_copy");
  });
  it("requires 6,000 body characters without inflating them with an abstract", () => {
    const blocks = ["Methods", "Results", "Discussion"].map((heading) => ({ kind: "paragraph" as const, section_path: [heading], text: "S".repeat(2_000) }));
    expect(admitFullText(blocks).state).toBe("FULL_TEXT_READABLE");
    blocks[0]!.text = "S".repeat(1_999);
    expect(admitFullText([...blocks, { kind: "abstract", section_path: ["Abstract"], text: "S".repeat(12_000) }]).state).toBe("PARTIAL_TEXT_READABLE");
    expect(admitFullText([{ kind: "paragraph", section_path: [], text: "Synthetic unlabeled body. ".repeat(300) }]).state).toBe("PARTIAL_TEXT_READABLE");
  });

  it.each([
    ["Méthodes", "Résultats", "Conclusions"], ["Materiales y métodos", "Resultados", "Discusión"],
    ["Materiais e métodos", "Resultados", "Discussão"], ["Material und Methoden", "Ergebnisse", "Schlussfolgerungen"],
    ["Materiali e metodi", "Risultati", "Conclusioni"], ["Experimental procedures", "Results", "Conclusions"]
  ])("recognizes exact structural headings %s / %s / %s", (methods, results, discussion) => {
    const blocks = [methods, results, discussion].map((heading) => ({ kind: "paragraph" as const, section_path: [heading], text: syntheticBody("content") }));
    expect(admitFullText(blocks).state).toBe("FULL_TEXT_READABLE");
    expect(admitFullText([{ kind: "paragraph", section_path: [], text: `This prose mentions ${methods}, ${results}, and ${discussion}.` }]).state).toBe("ABSTRACT_ONLY");
  });
});

describe("candidate transport reuses SSRF boundaries", () => {
  it.each(["https://127.0.0.1/doc", "https://169.254.169.254/doc", "https://[::1]/doc", "https://[fec0::1]/doc", "https://[2001:0db8::1]/doc", "https://user:secret@public.example/doc", "http://public.example/doc"])("rejects %s before a request", async (url) => {
    const requestDocument = vi.fn();
    await expect(fetchCandidateDocument(url, { resolveAddresses: async () => ["93.184.216.34"], requestDocument })).rejects.toThrow();
    expect(requestDocument).not.toHaveBeenCalled();
  });
  it("rechecks redirect DNS and rejects a rebound destination", async () => {
    const requestDocument = vi.fn(async () => ({ status: 302, headers: new Headers({ location: "https://rebound.example/doc" }), bytes: new Uint8Array() }));
    await expect(fetchCandidateDocument("https://public.example/doc", { resolveAddresses: async (host) => host === "public.example" ? ["93.184.216.34"] : ["10.0.0.1"], requestDocument })).rejects.toThrow("outside the public internet");
    expect(requestDocument).toHaveBeenCalledOnce();
  });
  it("enforces the byte cap on candidate HTML", async () => {
    await expect(fetchCandidateDocument(URL, { resolveAddresses: async () => ["93.184.216.34"], maximumBytes: 10,
      fetch: vi.fn(async () => new Response("synthetic oversized body", { headers: { "content-type": "text/html" } })) as typeof fetch })).rejects.toThrow("byte limit");
  });
});
