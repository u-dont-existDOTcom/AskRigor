import { createHash } from "node:crypto";

import { okEnvelope } from "@askrigor/contracts";
import type { AuditableDocumentIndex, OpenFullTextAcquisitionData } from "@askrigor/sources";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDY_METHOD_AUDIT_DOMAINS } from "../apps/research-mcp/src/actions/study-method-audit.js";
import { REVIEW_METHOD_AUDIT_DOMAINS } from "../apps/research-mcp/src/actions/review-method-audit.js";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { resolveDoi } from "../packages/sources/src/crossref.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(), acquireOpenFullText: acquire
}));
const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");

const SECRET = "receipt-bound-pages-test-secret-0123456789ab";
const DOI = "10.1038/s43856-026-01574-x";
const LANDING_URL = "https://www.nature.com/articles/s43856-026-01574-x";
const PMC_URL = "https://europepmc.org/articles/PMC9876543";
const crossrefConfig = { mailto: "maintainer@example.test" };
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const work = {
  DOI: DOI.toUpperCase(), title: ["Synthetic registered landing page study"],
  author: [{ family: "Fixtureauthor" }], issued: { "date-parts": [[2026]] }
};
function stubWork(resource?: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    status: "ok", "message-type": "work", message: { ...work, resource }
  }), { status: 200 })));
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Crossref registered landing pages", () => {
  it.each([
    LANDING_URL,
    "http://publisher.example/paper",
    `https://publisher.example/${"x".repeat(474)}`
  ])("preserves the registered HTTP(S) page %s", async (url) => {
    stubWork({ primary: { URL: url, extra: true }, extra: true });
    const result = await resolveDoi(DOI, crossrefConfig);
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ resolved_doi: DOI, candidates: [{
      doi: DOI, title: work.title[0], first_author: "Fixtureauthor", year: "2026", landing_url: url
    }] });
    expect(url.length).toBeLessThanOrEqual(500);
  });

  it.each([
    ["missing resource", undefined], ["null resource", null], ["string resource", "unexpected"],
    ["number resource", 42], ["array resource", []], ["missing primary", {}],
    ["null primary", { primary: null }], ["string primary", { primary: "unexpected" }],
    ["array primary", { primary: [] }], ["missing URL", { primary: {} }],
    ["non-string URL", { primary: { URL: 42 } }],
    ["malformed URL", { primary: { URL: "not a URL" } }],
    ["relative URL", { primary: { URL: "/paper" } }],
    ["non-HTTP(S) URL", { primary: { URL: "ftp://publisher.example/paper" } }],
    ["username", { primary: { URL: "https://user@publisher.example/paper" } }],
    ["password", { primary: { URL: "https://:secret@publisher.example/paper" } }],
    ["over 500 characters", { primary: { URL: `https://publisher.example/${"x".repeat(476)}` } }]
  ])("ignores %s without changing the rest of the result", async (_name, resource) => {
    stubWork();
    const baseline = await resolveDoi(DOI, crossrefConfig);
    stubWork(resource);
    const result = await resolveDoi(DOI, crossrefConfig);
    expect(result.error).toBeUndefined();
    expect({ ...result, retrieved_at: baseline.retrieved_at }).toEqual(baseline);
    expect(result.data.candidates[0]).not.toHaveProperty("landing_url");
  });
});

let client: Client;
let server: ReturnType<typeof createAskRigorServer>;
describe("receipt-bound pages through the MCP endpoint", () => {
  beforeEach(async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("CROSSREF_MAILTO", crossrefConfig.mailto);
    acquire.mockReset();
    server = createAskRigorServer();
    client = new Client({ name: "receipt-bound-pages-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    await client.connect(a);
  });
  afterEach(async () => { await client?.close(); await server?.close(); });

  async function call(name: string, input: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return result.structuredContent as {
      research_receipt?: string;
      data?: { resolved_doi: string | null; candidates: unknown[] };
      coverage_receipt: { exhausted: boolean; document_handle: string };
    };
  }
  function receipt(output: { research_receipt?: string }) {
    expect(output.research_receipt).toBeTypeOf("string");
    const verified = verifyResearchReceipt(output.research_receipt!, { secret: SECRET });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error("Receipt not verified");
    return verified;
  }

  it("signs the resolved lowercased DOI and its registered page", async () => {
    stubWork({ primary: { URL: LANDING_URL } });
    const output = await call("resolve_doi", { doi_or_citation: DOI.toUpperCase() });
    const verified = receipt(output);
    expect(verified.kind).toBe("doi_resolution");
    expect(verified.claims).toEqual({ doi: DOI, url: LANDING_URL, t: expect.any(String) });
    expect(output.data?.candidates).toEqual([{
      doi: DOI, title: work.title[0], first_author: "Fixtureauthor", year: "2026", landing_url: LANDING_URL
    }]);
  });

  it("returns no receipt when the DOI has no registered page", async () => {
    stubWork();
    const output = await call("resolve_doi", { doi_or_citation: DOI });
    expect(output.data?.resolved_doi).toBe(DOI);
    expect(output).not.toHaveProperty("research_receipt");
  });

  it("signs only the candidate matching the resolved citation DOI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work-list", message: { "total-results": 2, items: [
        { ...work, DOI: "10.5555/other", title: ["Unrelated synthetic paper"], resource: { primary: { URL: "https://publisher.example/other" } } },
        { ...work, resource: { primary: { URL: LANDING_URL } } }
      ] }
    }), { status: 200 })));
    const output = await call("resolve_doi", { doi_or_citation: "Fixtureauthor A. Synthetic registered landing page study. Journal. 2026." });
    expect(receipt(output)).toMatchObject({ kind: "doi_resolution", claims: { doi: DOI, url: LANDING_URL } });
  });

  it("returns no receipt when citation candidates resolve to no single DOI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work-list", message: { "total-results": 2,
        items: [DOI, "10.5555/ambiguous"].map((doi) => ({ ...work, DOI: doi, resource: { primary: { URL: LANDING_URL } } })) }
    }), { status: 200 })));
    const output = await call("resolve_doi", { doi_or_citation: "Fixtureauthor A. Synthetic registered landing page study. Journal. 2026." });
    expect(output.data?.resolved_doi).toBeNull();
    expect(output.data?.candidates).toHaveLength(2);
    expect(output).not.toHaveProperty("research_receipt");
  });

  it("returns no receipt after a failed DOI lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    const result = await client.callTool({ name: "resolve_doi", arguments: { doi_or_citation: DOI } });
    expect(result.structuredContent).toMatchObject({
      data: { resolved_doi: null, candidates: [] }, error: { code: "crossref_record_not_found" }
    });
    expect(result.structuredContent).not.toHaveProperty("research_receipt");
  });

  it.each(["europe_pmc", "client_supplied"] as const)("binds fetched pages only on %s reading and audit receipts", async (provider) => {
    const index = documentIndex(provider);
    acquire.mockResolvedValueOnce(acquisition(index));
    const page = await call("acquire_open_full_text", { doi: DOI });
    expect(page.coverage_receipt.exhausted).toBe(true);
    const reading = receipt(page);
    expect(reading).toMatchObject({ kind: "full_text_read", claims: { doi: DOI } });
    if (provider === "europe_pmc") expect(reading.claims.url).toBe(index.source.canonical_url);
    else expect(reading.claims).not.toHaveProperty("url");
    for (const kind of ["study", "review"] as const) {
      const output = await call(`validate_${kind}_method_audit`, {
        document_handle: page.coverage_receipt.document_handle, audit: audit(index, kind)
      });
      const verified = receipt(output);
      expect(verified).toMatchObject({ kind: `${kind}_audit`, claims: { doi: DOI } });
      if (provider === "europe_pmc") expect(verified.claims.url).toBe(index.source.canonical_url);
      else expect(verified.claims).toMatchObject({ retrieval_provider: "client_search_index", host: "repository.example" });
      if (provider === "client_supplied") expect(verified.claims).not.toHaveProperty("url");
    }
  });

  it.each([
    ["HTTP", "http://repository.example/paper"],
    ["non-HTTP(S)", "ftp://repository.example/paper"],
    ["over 500 characters", `https://repository.example/${"x".repeat(500)}`],
    ["encoding exceeds the receipt size limit", `https://repository.example/${"\u00e9".repeat(400)}`]
  ])("keeps reading and audit receipts without a URL when %s", async (_name, url) => {
    const index = documentIndex("europe_pmc", url);
    acquire.mockResolvedValueOnce(acquisition(index));
    const page = await call("acquire_open_full_text", { doi: DOI });
    const reading = receipt(page);
    expect(reading.kind).toBe("full_text_read");
    expect(reading.claims).not.toHaveProperty("url");
    for (const kind of ["study", "review"] as const) {
      const output = await call(`validate_${kind}_method_audit`, {
        document_handle: page.coverage_receipt.document_handle, audit: audit(index, kind)
      });
      const verified = receipt(output);
      expect(verified).toMatchObject({ kind: `${kind}_audit`, claims: { doi: DOI } });
      expect(verified.claims).not.toHaveProperty("url");
    }
  });

  it("signs no unread candidate URL in a full-text lead receipt", async () => {
    acquire.mockResolvedValueOnce({ access_status: "not_found", data: {
      requested_doi: DOI, acquisition_state: "CANDIDATE_FOUND_FETCH_BLOCKED",
      discovery_attempts: [{ route: "europe_pmc", result: "not_found" }, { route: "unpaywall", result: "inaccessible", identifier: DOI }],
      public_copy_search: { status: "declared", query_count: 2 },
      candidates: [{ url: LANDING_URL, source_class: "publisher", source_class_basis: "declared",
        retrieval_provider: "direct", state: "CANDIDATE_FOUND_FETCH_BLOCKED", identity_verification: "not_verified",
        sections_observed: [], completeness: "unavailable", retrieved_at: "2026-10-16T00:00:00Z" }]
    } });
    const output = await call("acquire_open_full_text", { doi: DOI });
    const verified = receipt(output);
    expect(verified).toMatchObject({ kind: "full_text_lead", claims: { doi: DOI } });
    expect(verified.claims).not.toHaveProperty("url");
    expect(output.research_receipt).not.toContain(encodeURIComponent(LANDING_URL));
  });
});

function documentIndex(provider: "europe_pmc" | "client_supplied", url?: string): AuditableDocumentIndex {
  const text = "Synthetic source methods, results and discussion for page receipt tests.";
  return {
    source: { provider, primary_identifier: provider === "europe_pmc" ? "PMC9876543" : DOI, doi: DOI,
      pmid: "9876543", pmcid: "PMC9876543", canonical_url: url ?? (provider === "europe_pmc" ? PMC_URL : "https://repository.example/paper"),
      title: "Synthetic page receipt study", format: "plain_text", content_sha256: hash(text),
      document_completeness: "full_text_with_body", identity_verification: "doi_exact" },
    section_paths: [["Methods"]], blocks: [{ block_id: `direct_000001_${hash(text).slice(0, 12)}`,
      kind: "paragraph", section_path: ["Methods"], text, text_sha256: hash(text) }]
  };
}
function acquisition(index: AuditableDocumentIndex) {
  return okEnvelope({ provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: index.source.canonical_url }, pagination: { exhausted: true }, returned: 1,
    accessStatus: "complete", limitations: ["Method audit required."], data: {
      requested_doi: DOI, outcome: "full_text_indexed", discovery_attempts: [{ route: "europe_pmc", result: "indexed", identifier: DOI }],
      document_index: index
    } satisfies OpenFullTextAcquisitionData });
}
function audit(index: AuditableDocumentIndex, kind: "study" | "review") {
  const blockId = index.blocks[0]!.block_id;
  const program = { name: "synthetic program", components: ["generated component"], dose_or_intensity: "synthetic",
    frequency: "synthetic", duration: "synthetic", supervision: "synthetic", adherence: "synthetic", co_interventions: [], care_stage: "nonsurgical" };
  return { source_primary_identifier: index.source.primary_identifier, source_content_sha256: index.source.content_sha256,
    ...(kind === "study" ? { design_label: "synthetic study", design_capability_statement: "The label does not establish reliability.",
      population_and_stage: "generated participants", intervention_program: program, comparator_program: program, outcome_and_horizon: "generated outcome" }
      : { review_type: "systematic_review", search_end_date: "2026-01-01", included_source_families: ["synthetic studies"],
        program_fingerprints: [{ label: "synthetic", components: ["generated"], dose_or_intensity: "synthetic", frequency: "synthetic",
          duration: "synthetic", supervision: "synthetic", co_interventions: [], population_or_stage: "synthetic", outcome_and_horizon: "synthetic" }] }),
    domain_findings: (kind === "study" ? STUDY_METHOD_AUDIT_DOMAINS : REVIEW_METHOD_AUDIT_DOMAINS).map((domain) => ({ domain,
      status: "limitation_identified", plain_language_finding: "Synthetic fixture limitation.", evidence_block_ids: [blockId], unresolved_fields: [] })),
    claim_capabilities: [{ claim: "Generated narrow claim", capability: "can_support", reason: "Synthetic block", evidence_block_ids: [blockId] },
      { claim: "Generated broad claim", capability: "cannot_support", reason: "Synthetic limit", evidence_block_ids: [] }] };
}
