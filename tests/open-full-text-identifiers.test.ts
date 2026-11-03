import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";

import { okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import { acquireOpenFullText, type AcquireOpenFullTextRuntime, type EuropePmcFullTextArticle } from "../packages/sources/src/index.js";
import { acquireOpenFullTextActionInputSchema, createOpenFullTextActionRoutes } from "../apps/research-mcp/src/actions/open-full-text-route.js";
import { syntheticArticleText, syntheticPdf } from "./helpers/synthetic-full-text.js";

const PMCID = "PMC1234567";
const PMID = "40123456";
const TITLE = "A synthetic study with no registered digital object identifier";
const metadata = (records: Array<{ source: string; id: string; pmid?: string; pmcid?: string; title?: string; year?: string }>) =>
  okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", pagination: { exhausted: true },
    returned: records.length, accessStatus: "complete", data: records });
const absent = () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_full_text",
  pagination: { exhausted: true }, returned: 0, accessStatus: "not_found", data: [] });

async function runtime(): Promise<AcquireOpenFullTextRuntime> {
  const xml = (await readFile(new URL("fixtures/europe-pmc/full-text.xml", import.meta.url), "utf8"))
    .replace(/\s*<article-id pub-id-type="doi">[^<]*<\/article-id>/u, "");
  const article: EuropePmcFullTextArticle = { pmcid: PMCID, pmid: PMID, title: TITLE, format: "jats_xml",
    document_completeness: "full_text_with_body", content_sha256: createHash("sha256").update(xml).digest("hex"),
    content_bytes: Buffer.byteLength(xml), xml };
  return {
    searchEuropePmc: vi.fn(async () => metadata([{ source: "MED", id: PMID, pmid: PMID, pmcid: PMCID, title: TITLE, year: "2026" }])),
    fetchEuropePmcFullText: vi.fn(async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_full_text",
      pagination: { exhausted: true }, returned: 1, accessStatus: "complete", data: article })),
    acquireUnpaywallFullText: vi.fn(), ownerLibrary: { access: "owner", fetchPdf: vi.fn() }
  };
}

describe("open full text without a DOI", () => {
  it.each([{ pmcid: PMCID }, { pmid: PMID }])("reads Europe PMC from %j without DOI-only routes", async (input) => {
    const routes = await runtime();
    const result = await acquireOpenFullText(input, { email: "research@example.org" }, routes);
    expect(result.access_status).toBe("complete");
    expect(result.data).toMatchObject({ outcome: "full_text_indexed", document_index: { source: {
      primary_identifier: PMCID, pmcid: PMCID, pmid: PMID, identity_verification: "pmcid_exact"
    } } });
    expect(result.data.requested_doi).toBeUndefined();
    expect(result.data.document_index?.source.doi).toBeUndefined();
    expect(routes.searchEuropePmc).toHaveBeenCalledWith({ query: "pmcid" in input
      ? `EXT_ID:"${PMCID}" AND SRC:PMC` : `EXT_ID:"${PMID}" AND SRC:MED`, pageSize: 10 });
    expect(routes.fetchEuropePmcFullText).toHaveBeenCalledWith(PMCID);
    expect(routes.acquireUnpaywallFullText).not.toHaveBeenCalled();
    expect(routes.ownerLibrary!.fetchPdf).not.toHaveBeenCalled();
  });

  it("leaves an unresolved PMID as a lead without trying DOI-only routes", async () => {
    const routes = await runtime();
    routes.searchEuropePmc = vi.fn(async () => metadata([]));
    const result = await acquireOpenFullText({ pmid: PMID }, undefined, routes);
    expect(result.data).toMatchObject({ requested_pmid: PMID, outcome: "possibly_useful_lead",
      discovery_attempts: [{ route: "europe_pmc", result: "not_found" }] });
    expect(routes.fetchEuropePmcFullText).not.toHaveBeenCalled();
    expect(routes.acquireUnpaywallFullText).not.toHaveBeenCalled();
    expect(routes.ownerLibrary!.fetchPdf).not.toHaveBeenCalled();
  });

  it("still verifies a supplied public copy against the resolved metadata", async () => {
    const routes = await runtime();
    routes.fetchEuropePmcFullText = vi.fn(async () => absent());
    const result = await acquireOpenFullText({ pmid: PMID, candidate_texts: [{
      url: "https://repository.example.org/study", retrieved_via: "client_search_index",
      text: syntheticArticleText(`${TITLE}\n2026`)
    }] }, undefined, routes);
    expect(result.data).toMatchObject({ outcome: "full_text_indexed", document_index: { source: {
      provider: "client_supplied", primary_identifier: PMID, pmid: PMID, identity_verification: "title_match"
    } } });
    expect(routes.acquireUnpaywallFullText).not.toHaveBeenCalled();
    expect(routes.ownerLibrary!.fetchPdf).not.toHaveBeenCalled();
  });

  it("extracts a supplied public PDF using its resolved title and PMID", async () => {
    const routes = await runtime();
    routes.fetchEuropePmcFullText = vi.fn(async () => absent());
    routes.candidateRuntime = { fetchDocument: async () => ({ finalUrl: "https://repository.example.org/study.pdf",
      contentType: "application/pdf", bytes: syntheticPdf(syntheticArticleText(`${TITLE}\n2026`)) }) };
    const result = await acquireOpenFullText({ pmid: PMID,
      candidate_urls: [{ url: "https://repository.example.org/study.pdf" }] }, undefined, routes);
    expect(result.data).toMatchObject({ outcome: "full_text_indexed", document_index: { source: {
      provider: "direct_candidate", primary_identifier: PMID, pmid: PMID, identity_verification: "title_match"
    } } });
    expect(result.data.document_index?.source.doi).toBeUndefined();
  });

  it.each([{ pmcid: PMCID }, { pmid: PMID }])("requires the available exact identifier in a public-copy search (%j)", async (input) => {
    const routes = await runtime();
    routes.fetchEuropePmcFullText = vi.fn(async () => absent());
    const result = await acquireOpenFullText({ ...input,
      public_copy_search: { queries: [`"${TITLE}" public copy`, `"${TITLE}" manuscript`] } }, undefined, routes);
    expect(result.data.public_copy_search).toMatchObject({ status: "missing_exact_identifiers",
      missing: ["pmcid" in input ? "pmcid" : "pmid"] });
    const found = await acquireOpenFullText({ ...input,
      public_copy_search: { queries: [`"${TITLE}" public copy`, `${"pmcid" in input ? PMCID : PMID} manuscript`] } }, undefined, routes);
    expect(found.data.public_copy_search).toEqual({ status: "declared", query_count: 2 });
  });

  it("refuses missing identifiers as an ordinary Action result without sending a request", async () => {
    const routes = await runtime();
    const action = createOpenFullTextActionRoutes({ acquire: (input, config) => acquireOpenFullText(input, config, routes) })
      .find(({ operationId }) => operationId === "acquire_open_full_text")!;
    const result = await action.handle({ request: {} as IncomingMessage, clientIp: "127.0.0.1", body: {} });
    expect(result).toEqual({ status: 200, body: { status: "possibly_useful_lead", discovery_attempts: [],
      access_boundary: "Give at least one paper identifier: doi, pmcid or pmid.", unseen_content_used_as_evidence: false } });
    expect(routes.searchEuropePmc).not.toHaveBeenCalled();
    expect(routes.fetchEuropePmcFullText).not.toHaveBeenCalled();
    expect(routes.acquireUnpaywallFullText).not.toHaveBeenCalled();
    expect(routes.ownerLibrary!.fetchPdf).not.toHaveBeenCalled();
  });

  it.each([{ pmcid: PMCID }, { pmid: PMID }])("publishes optional identifiers and passes %j through the Action", async (input) => {
    expect(acquireOpenFullTextActionInputSchema.safeParse(input).success).toBe(true);
    const routes = await runtime();
    const action = createOpenFullTextActionRoutes({ acquire: (value, config) => acquireOpenFullText(value, config, routes) })
      .find(({ operationId }) => operationId === "acquire_open_full_text")!;
    const result = await action.handle({ request: {} as IncomingMessage, clientIp: "127.0.0.1", body: input });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "full_text_available", source: { primary_identifier: PMCID } });
    expect(result.body).not.toHaveProperty("requested_doi");
  });

  it("rejects malformed PMIDs while permitting a missing-identifier ordinary refusal", () => {
    expect(acquireOpenFullTextActionInputSchema.safeParse({}).success).toBe(true);
    for (const pmid of ["0", "-12", "123x", "12345678901234567"]) {
      expect(acquireOpenFullTextActionInputSchema.safeParse({ pmid }).success).toBe(false);
    }
  });
});
