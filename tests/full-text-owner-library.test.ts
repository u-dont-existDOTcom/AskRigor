import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { okEnvelope } from "@askrigor/contracts";
import { InMemoryResearchContributorAccessStore, RESEARCH_USE_NOTICE_VERSION, ResearchContributorAccessService } from "@askrigor/evidence-repository";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInfoAccessClient, infoAccessClientFromEnv } from "../apps/research-mcp/src/infoaccess-client.js";
import type { AcquireOpenFullTextInput, AcquireOpenFullTextRuntime } from "../packages/sources/src/open-full-text.js";
import { syntheticArticleText, syntheticBody, syntheticPdf } from "./helpers/synthetic-full-text.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(), acquireOpenFullText: acquire
}));
const actual = await vi.importActual<typeof import("@askrigor/sources")>("@askrigor/sources");
const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");
const { createOpenFullTextExecutor } = await import("../apps/research-mcp/src/actions/open-full-text-route.js");

const DOI = "10.1234/synthetic.library";
const TITLE = "Synthetic library study of fixture participants";
const URL = "https://www.researchgate.net/synthetic-public-copy";
const LIBRARY_URL = "https://infoaccess.example/pdf/private-library-link";
const TOKEN = "synthetic-dedicated-library-token";
const CONFIG = { email: "test@example.test" };
const ABSTRACT = "Synthetic abstract of fixture participants and generated measurements. ".repeat(10);
const SEARCH = { queries: [`DOI ${DOI}`, `"${TITLE}"`] };
const FRONT = `${TITLE}\nDOI ${DOI}`;
const PARTIAL = `${FRONT}\nAbstract\n${ABSTRACT}\nMethods\n${syntheticBody("methods")}`;

let runtime: AcquireOpenFullTextRuntime;
let pdf: Uint8Array;
let advertisedHash: string | undefined;
let advertisedSize: number | undefined;
let outage: boolean;
let metadataFormat: "structured" | "resource" | "text" | "split";
let calls: Array<{ name: string; arguments: unknown }>;
let downloads: number;
let abstract: string | undefined;
let candidateText: string;
let candidateFailure: boolean;
let service: ResearchContributorAccessService;
let store: InMemoryResearchContributorAccessStore;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fakeLibrary() {
  return createInfoAccessClient({ url: "https://infoaccess.example/mcp", token: TOKEN,
    fetch: vi.fn(async (_url, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
      if (init?.method === "GET" || init?.method === "DELETE") return new Response(null, { status: 405 });
      const request = JSON.parse(String(init?.body));
      if (request.method.startsWith("notifications/")) return new Response(null, { status: 202 });
      if (outage) throw new Error(`Synthetic outage containing ${TOKEN} ${LIBRARY_URL}`);
      let result;
      if (request.method === "initialize") {
        result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-infoaccess", version: "1.0" } };
      } else {
        expect(request.method).toBe("tools/call");
        calls.push(request.params);
        expect(request.params).toEqual({ name: "get_article_pdf", arguments: { doi: DOI } });
        const metadata = { url: LIBRARY_URL, size: advertisedSize ?? pdf.byteLength, sha256: advertisedHash ?? hash(pdf) };
        result = metadataFormat === "resource"
          ? { content: [{ type: "resource_link", uri: LIBRARY_URL, name: "article.pdf", mimeType: "application/pdf", size: metadata.size, _meta: { sha256: metadata.sha256 } }] }
          : metadataFormat === "split" ? { content: [{ type: "resource_link", uri: LIBRARY_URL, name: "article.pdf", size: metadata.size }, { type: "text", text: JSON.stringify({ sha256: metadata.sha256 }) }] }
          : metadataFormat === "text" ? { content: [{ type: "text", text: JSON.stringify({ download_url: LIBRARY_URL, size: metadata.size, sha256: metadata.sha256 }) }] }
            : { content: [], structuredContent: metadata };
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
    documentFetchRuntime: { resolveAddresses: async () => ["93.184.216.34"],
      requestDocument: async (url, _addresses, options) => {
        expect(url.toString()).toBe(LIBRARY_URL);
        expect(options.maximumBytes).toBe(64 * 1024 * 1024);
        expect(options.timeoutMs).toBe(120_000);
        expect(options.signal).toBeDefined();
        downloads += 1;
        return { status: 200, headers: new Headers({ "content-type": "application/pdf" }), bytes: pdf };
      } }
  });
}

async function run(surface: "function" | "mcp", input: Partial<AcquireOpenFullTextInput> = {}, subject = "owner", authOverrides: Partial<AuthInfo> = {}, configured = true) {
  const library = fakeLibrary();
  if (surface === "function") {
    const access = subject === "owner" ? "owner" : subject === "paid" ? "public_only" : undefined;
    const rt = { ...runtime, ...(access === undefined ? {} : { ownerLibrary: { access, fetchPdf: library.fetchPdf } }) } as AcquireOpenFullTextRuntime;
    return createOpenFullTextExecutor({ acquire: (input) => actual.acquireOpenFullText(input, CONFIG, rt) }).acquire({ doi: DOI, ...input });
  }
  acquire.mockImplementation((input, _config, injected) => actual.acquireOpenFullText(input, CONFIG, { ...runtime, ...injected }));
  const server = createAskRigorServer("standard", { infoAccess: configured ? library : undefined, allowedReviewerSubjects: new Set(["owner"]), researchContributorAccessService: service });
  const client = new Client({ name: "library-test", version: "1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const send = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => send(message, { ...options, authInfo: {
    token: "synthetic-user-token", clientId: "synthetic-user-client", scopes: ["research:use"],
    expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject }, ...authOverrides
  } });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const output = await client.callTool({ name: "acquire_open_full_text", arguments: { doi: DOI, ...input } });
    expect(output.isError).not.toBe(true);
    expect(JSON.stringify(output)).not.toContain(LIBRARY_URL);
    expect(JSON.stringify(output)).not.toContain(TOKEN);
    return output.structuredContent as any;
  } finally { await client.close(); await server.close(); }
}

beforeEach(async () => {
  vi.stubEnv("ASKRIGOR_INFOACCESS_URL", "");
  vi.stubEnv("ASKRIGOR_INFOACCESS_TOKEN", "");
  vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", "library-receipt-secret-0123456789abcdef");
  acquire.mockReset();
  pdf = syntheticPdf(syntheticArticleText(FRONT));
  advertisedHash = undefined; advertisedSize = undefined; outage = false;
  metadataFormat = "structured"; calls = []; downloads = 0;
  abstract = ABSTRACT; candidateText = PARTIAL; candidateFailure = false;
  runtime = {
    searchEuropePmc: async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_search_result", accessStatus: "complete", returned: 1,
      pagination: { exhausted: true }, data: [{ source: "MED", id: "99901", doi: DOI, title: TITLE, abstractText: abstract }] }),
    unpaywallRuntime: { resolve: async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: "metadata_only", returned: 1,
      pagination: { exhausted: true }, data: { doi: DOI, title: TITLE, is_oa: false, oa_status: "closed", full_text_lead_status: "no_open_location_found", oa_locations: [] } }) },
    candidateRuntime: { fetchDocument: vi.fn(async () => {
      if (candidateFailure) throw new Error("Synthetic blocked candidate");
      const bytes = new TextEncoder().encode(candidateText);
      return { finalUrl: URL, bytes, contentLength: bytes.byteLength, redirects: [], contentType: "text/plain" };
    }) }
  };
  store = new InMemoryResearchContributorAccessStore();
  service = new ResearchContributorAccessService({ store, identitySecret: new TextEncoder().encode("synthetic-owner-library-identity-secret-0123456789") });
  await service.acceptFreeContributor("free", { noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true });
  store.grantPrivateEntitlement({ entitlementId: "88888888-8888-4888-a888-888888888888", accountKey: service.accountKeyForSubject("paid"),
    status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null, grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: null, revokedAt: null });
  await service.activatePaidPrivate("paid");
});
afterEach(() => vi.unstubAllEnvs());

for (const surface of ["function", "mcp"] as const) describe(`owner library through ${surface}`, () => {
  it.each(["structured", "resource", "text", "split"] as const)("admits the owner's library PDF from %s metadata", async (format) => {
    metadataFormat = format;
    const result = await run(surface);
    expect(result).toMatchObject({ status: "full_text_available", source: { provider: "owner_library", retrieval_provider: "owner_library",
      canonical_url: `https://doi.org/${DOI}`, identity_verification: "doi_exact" } });
    expect(result.source.public_basis).toBeUndefined();
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "indexed" });
    expect(calls).toEqual([{ name: "get_article_pdf", arguments: { doi: DOI } }]);
  });
  it.each(["fetched candidate", "supplied text"])("admits paid private using a partial %s and cites its public URL", async (kind) => {
    const input = kind === "fetched candidate" ? { candidate_urls: [{ url: URL }] } : {
      candidate_texts: [{ url: URL, text: PARTIAL, retrieved_via: "client_search_index" as const }] };
    const result = await run(surface, input, "paid");
    expect(result).toMatchObject({ status: "full_text_available", source: { retrieval_provider: "owner_library", canonical_url: URL,
      public_basis: { route: "candidate", url: URL } }, candidates: [{ state: "PARTIAL_TEXT_READABLE", identity_verification: "doi_exact" }] });
    expect(downloads).toBe(1);
  });
  it("admits paid private using an existing Unpaywall cc license", async () => {
    runtime.unpaywallRuntime!.resolve = async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: "metadata_only",
      returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title: TITLE, is_oa: true, oa_status: "gold", full_text_lead_status: "open_location_available",
        best_location: { license: "cc-by", landing_page_url: URL, transport: "https" }, oa_locations: [] } });
    expect(await run(surface, {}, "paid")).toMatchObject({ status: "full_text_available", source: { canonical_url: URL, public_basis: { route: "unpaywall", url: URL } } });
  });
  it.each([["europe_pmc", "owner"], ["unpaywall", "owner"], ["candidate", "owner"], ["europe_pmc", "paid"], ["unpaywall", "paid"],
    ["candidate", "paid"]] as const)("returns an admitted %s public copy for %s without reading the library", async (route, subject) => {
    if (route === "candidate") candidateText = syntheticArticleText(FRONT);
    if (route === "unpaywall") {
      runtime.unpaywallRuntime!.resolve = async () => okEnvelope({ provider: "unpaywall", recordType: "open_access_location_resolution", accessStatus: "metadata_only",
        returned: 1, pagination: { exhausted: true }, data: { doi: DOI, title: TITLE, is_oa: true, oa_status: "green", full_text_lead_status: "open_location_available",
          best_location: { pdf_url: URL, transport: "https" }, oa_locations: [] } });
      runtime.unpaywallRuntime!.fetchDocument = async () => ({ bytes: pdf, finalUrl: URL, contentLength: pdf.byteLength, redirects: [] });
    }
    if (route === "europe_pmc") {
      const search = runtime.searchEuropePmc!;
      runtime.searchEuropePmc = async (input) => {
        const result = await search(input);
        return { ...result, data: result.data.map((record) => ({ ...record, pmcid: "PMC1234567" })) };
      };
      const xml = (await readFile(new globalThis.URL("fixtures/europe-pmc/full-text.xml", import.meta.url), "utf8"))
        .replaceAll("10.1234/recorded.example", DOI);
      runtime.fetchEuropePmcFullText = async () => okEnvelope({ provider: "europe_pmc", recordType: "europe_pmc_full_text", accessStatus: "complete",
        returned: 1, pagination: { exhausted: true }, data: { pmcid: "PMC1234567", doi: DOI, xml, format: "jats_xml",
          content_bytes: Buffer.byteLength(xml), content_sha256: hash(new TextEncoder().encode(xml)), document_completeness: "full_text_with_body" } });
    }
    const result = await run(surface, route === "candidate" ? { candidate_urls: [{ url: URL }] } : {}, subject);
    expect(result.status).toBe("full_text_available");
    expect(result.source.provider).not.toBe("owner_library");
    expect(result.source.public_basis).toBeUndefined();
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("does not count an abstract-only public page as a basis", async () => {
    // A host page with the abstract and page furniture only: no body sections.
    const page = `${FRONT}\nAbstract\n${ABSTRACT}\n${Array(60).fill("Cite this page, share it, or follow the authors.").join("\n")}`;
    const result = await run(surface, { candidate_texts: [{ url: URL, text: page, retrieved_via: "client_search_index" }],
      public_copy_search: SEARCH }, "paid");
    expect(result.candidates).toMatchObject([{ state: "ABSTRACT_ONLY" }]);
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "not_public" });
    expect(calls).toEqual([]);
  });
  it("rechecks the public basis on each call", async () => {
    expect((await run(surface, { candidate_urls: [{ url: URL }] }, "paid")).status).toBe("full_text_available");
    const count = calls.length;
    candidateFailure = true;
    const result = await run(surface, { candidate_urls: [{ url: URL }], public_copy_search: SEARCH }, "paid");
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "not_public" });
    expect(calls).toHaveLength(count);
  });
  it.each(["abstract_only", "partial_text", "third_page_identity"])("rejects a library PDF with %s", async (kind) => {
    const text = kind === "abstract_only" ? `${FRONT}\nAbstract\n${ABSTRACT}` : kind === "partial_text" ? PARTIAL :
      `${Array(130).fill("Synthetic cover page line").join("\n")}\n${syntheticArticleText(FRONT)}`;
    pdf = syntheticPdf(text);
    const result = await run(surface, { public_copy_search: SEARCH });
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: kind === "third_page_identity" ? "identity_mismatch" : kind });
    expect(result.blocks).toBeUndefined();
  });
  it("returns not_public only after an exact public-copy search with no basis", async () => {
    const result = await run(surface, { public_copy_search: SEARCH }, "paid");
    expect(result).toMatchObject({ status: "possibly_useful_lead", public_copy_search: { status: "declared" } });
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "not_public" });
    expect(calls).toEqual([]);
  });
  it("returns the existing search-first step without an exact search", async () => {
    const result = await run(surface, {}, "paid");
    expect(result.status).toBe("possibly_useful_lead");
    expect(result.access_boundary).toContain("Exact public-copy discovery remains");
    expect(result.discovery_attempts.some((attempt: any) => attempt.result === "not_public")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("gives a free account no library runtime or attempt", async () => {
    const result = await run(surface, { public_copy_search: SEARCH }, "free");
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("refuses a SHA-256 mismatch as an error, with no text or private link", async () => {
    advertisedHash = "0".repeat(64);
    const result = await run(surface, { public_copy_search: SEARCH });
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "error" });
    expect(result.source).toBeUndefined(); expect(result.blocks).toBeUndefined(); expect(result.research_receipt).toBeUndefined();
  });
  it("refuses a wrong paper despite a valid checksum", async () => {
    pdf = syntheticPdf(syntheticArticleText("Different fixture paper DOI 10.1234/another.paper"));
    const result = await run(surface, { public_copy_search: SEARCH });
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "identity_mismatch" });
    expect(result.blocks).toBeUndefined();
  });
  it("preserves an InfoAccess outage as an error attempt", async () => {
    outage = true;
    const result = await run(surface, { public_copy_search: SEARCH });
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "error" });
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library" && attempt.result === "inaccessible")).toBe(false);
    expect(result.research_receipt).toBeUndefined();
  });
  it.each(["missing", "short", "mismatched"])("rejects supplied text as library public basis when its abstract is %s", async (kind) => {
    abstract = kind === "missing" ? undefined : kind === "short" ? "Too short" : "Another synthetic abstract unrelated to this study. ".repeat(10);
    const result = await run(surface, { candidate_texts: [{ url: URL, text: PARTIAL, retrieved_via: "client_search_index" }], public_copy_search: SEARCH }, "paid");
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "not_public" });
    expect(calls).toEqual([]);
  });
  it("rejects an unreadable bare URL as public basis", async () => {
    candidateFailure = true;
    const result = await run(surface, { candidate_urls: [{ url: URL }], public_copy_search: SEARCH }, "paid");
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "not_public" });
    expect(calls).toEqual([]);
  });
  it.each(["size mismatch", "too large"])("rejects %s before PDF admission", async (kind) => {
    advertisedSize = kind === "too large" ? 64 * 1024 * 1024 + 1 : pdf.byteLength + 1;
    const result = await run(surface);
    expect(result.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "error" });
    expect(downloads).toBe(kind === "too large" ? 0 : 1);
  });
});

describe("owner library sign-in and configuration", () => {
  it.each([{}, { ASKRIGOR_INFOACCESS_URL: "https://infoaccess.example/mcp" }, { ASKRIGOR_INFOACCESS_TOKEN: TOKEN }])("is off without both config values: %j", (env) => {
    expect(infoAccessClientFromEnv(env)).toBeUndefined();
  });
  it.each([{ expiresAt: 0 }, { scopes: [] }, { extra: {} }])("ignores unverified owner access: %j", async (auth) => {
    const result = await run("mcp", {}, "owner", auth);
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("gives the signed-in owner no library attempt when configuration is off", async () => {
    const result = await run("mcp", {}, "owner", {}, false);
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("checks bytes from an injected source runtime independently of the app client", async () => {
    const result = await actual.acquireOpenFullText({ doi: DOI }, CONFIG, { ...runtime, ownerLibrary: {
      access: "owner", fetchPdf: async () => ({ bytes: pdf, size: pdf.byteLength, sha256: "0".repeat(64) })
    } });
    expect(result.data.discovery_attempts.at(-1)).toMatchObject({ route: "owner_library", result: "error" });
    expect(result.data.document_index).toBeUndefined();
  });
  it("rechecks an expired paid entitlement before injecting library access", async () => {
    store.grantPrivateEntitlement({ entitlementId: "88888888-8888-4888-a888-888888888888", accountKey: service.accountKeyForSubject("paid"),
      status: "ACTIVE", source: "OWNER_GRANTED", externalReferenceSha256: null, grantedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-02T00:00:00.000Z", revokedAt: null });
    const result = await run("mcp", { candidate_urls: [{ url: URL }] }, "paid");
    expect(result.discovery_attempts.some((attempt: any) => attempt.route === "owner_library")).toBe(false);
  });
});
