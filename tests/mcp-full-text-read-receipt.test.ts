import { createHash } from "node:crypto";
import { okEnvelope } from "@askrigor/contracts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuditableDocumentIndex, OpenFullTextAcquisitionData } from "@askrigor/sources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";

const acquire = vi.hoisted(() => vi.fn());
vi.mock("@askrigor/sources", async (importOriginal) => ({
  ...await importOriginal<typeof import("@askrigor/sources")>(), acquireOpenFullText: acquire
}));
const { createAskRigorServer } = await import("../apps/research-mcp/src/server.js");
const SECRET = "full-text-reading-test-secret-0123456789ab";
const DOI = "10.1234/reading";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function documentIndex(text: string): AuditableDocumentIndex {
  return {
    source: { provider: "unpaywall_open_location", primary_identifier: DOI, doi: DOI,
      pmid: "9876543", pmcid: "PMC9876543", canonical_url: "https://repository.example.org/reading.pdf",
      title: "Synthetic reading receipt study", version: "acceptedVersion", format: "pdf_text",
      content_sha256: hash(`pdf:${text}`), document_completeness: "full_text_with_body", identity_verification: "doi_exact" },
    section_paths: [["Page 1"]], blocks: [{ block_id: `pdf_000001_${hash(text).slice(0, 12)}`,
      kind: "page_text", section_path: ["Page 1"], page_number: 1, text, text_sha256: hash(text) }]
  };
}
function acquisition(index: AuditableDocumentIndex) {
  return okEnvelope({ provider: "open_full_text", recordType: "open_full_text_acquisition", primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: index.source.canonical_url }, pagination: { exhausted: true }, returned: 1,
    accessStatus: "complete", limitations: ["Method audit required."], data: {
      requested_doi: DOI, outcome: "full_text_indexed", discovery_attempts: [{ route: "unpaywall", result: "indexed", identifier: DOI }],
      document_index: index
    } satisfies OpenFullTextAcquisitionData });
}
let client: Client;
let server: ReturnType<typeof createAskRigorServer>;
beforeEach(async () => {
  vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
  acquire.mockReset(); server = createAskRigorServer();
  client = new Client({ name: "reading-receipt-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a);
});
afterEach(async () => { await client?.close(); await server?.close(); vi.unstubAllEnvs(); });
async function call(name: string, input: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: input });
  expect(result.isError).not.toBe(true);
  return result.structuredContent as { research_receipt?: string; coverage_receipt: {
    exhausted: boolean; document_handle: string; source_content_sha256: string;
  } };
}
function checkReceipt(page: Awaited<ReturnType<typeof call>>, index: AuditableDocumentIndex) {
  expect(page.coverage_receipt.exhausted).toBe(true);
  const verified = verifyResearchReceipt(page.research_receipt!, { secret: SECRET });
  expect(verified).toMatchObject({ ok: true, kind: "full_text_read", claims: {
    id: DOI, doi: DOI, pmid: "9876543", pmcid: "PMC9876543", content: index.source.content_sha256.slice(0, 16)
  } });
  if (!verified.ok) throw new Error("Receipt not verified");
  expect(Object.keys(verified.claims).sort()).toEqual(["content", "doi", "id", "pmcid", "pmid", "t"]);
  expect(JSON.stringify(verified)).not.toContain(index.blocks[0]!.text);
  expect(verifyResearchReceipt(page.research_receipt!, { secret: `${SECRET}other` })).toEqual({ ok: false, reason: "signature_invalid" });
}
describe("full_text_read receipts through the MCP endpoint", () => {
  it("issues a text-free receipt when acquisition exhausts the first page", async () => {
    const index = documentIndex("Synthetic methods, results and conclusions for reading receipt checks.");
    acquire.mockResolvedValueOnce(acquisition(index));
    checkReceipt(await call("acquire_open_full_text", { doi: DOI }), index);
  });
  it("issues nothing before the last contiguous page, then signs the exact document hash", async () => {
    const index = documentIndex("Synthetic method-rich source paragraph. ".repeat(4_000));
    acquire.mockResolvedValueOnce(acquisition(index));
    let page = await call("acquire_open_full_text", { doi: DOI });
    expect(page.coverage_receipt.exhausted).toBe(false);
    const handle = page.coverage_receipt.document_handle;
    let pages = 1;
    while (!page.coverage_receipt.exhausted) {
      expect(page.research_receipt).toBeUndefined();
      page = await call("continue_open_full_text", { document_handle: handle });
      expect(page.coverage_receipt.document_handle).toBe(handle);
      expect(page.coverage_receipt.source_content_sha256).toBe(index.source.content_sha256);
      pages += 1;
    }
    expect(pages).toBeGreaterThan(2); checkReceipt(page, index);
  });
});
