import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  acquireOpenFullText,
  type AuditableDocumentIndex,
  type EuropePmcFullTextArticle,
  type UnpaywallFullTextData
} from "../packages/sources/src/index.js";

const DOI = "10.1234/recorded.example";

describe("automatic open-full-text routing", () => {
  it("uses an exact Europe PMC full text before Unpaywall", async () => {
    const article = await fixtureArticle();
    const acquireUnpaywallFullText = vi.fn();
    const result = await acquireOpenFullText(
      { doi: DOI },
      { email: "research@example.org" },
      {
        searchEuropePmc: async () => okEnvelope({
          provider: "europe_pmc",
          recordType: "europe_pmc_search_result",
          query: { query: `DOI:"${DOI}"` },
          pagination: { exhausted: true },
          returned: 1,
          accessStatus: "complete",
          data: [{
            source: "MED",
            id: "40123456",
            pmid: "40123456",
            pmcid: "PMC1234567",
            doi: DOI,
            has_full_text: true,
            is_open_access: true
          }]
        }),
        fetchEuropePmcFullText: async () => okEnvelope({
          provider: "europe_pmc",
          recordType: "europe_pmc_full_text",
          primaryIdentifier: "PMC1234567",
          sourceIdentity: { canonical_url: "https://europepmc.org/articles/PMC1234567" },
          pagination: { exhausted: true },
          returned: 1,
          accessStatus: "complete",
          limitations: ["Retrieval only."],
          data: article
        }),
        acquireUnpaywallFullText
      }
    );

    expect(acquireUnpaywallFullText).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "complete",
      data: {
        outcome: "full_text_indexed",
        discovery_attempts: [{
          route: "europe_pmc",
          result: "indexed",
          identifier: "PMC1234567"
        }],
        document_index: {
          source: {
            provider: "europe_pmc",
            primary_identifier: "PMC1234567",
            identity_verification: "pmcid_exact"
          }
        }
      }
    });
  });

  it("falls through to an Unpaywall-discovered PDF when Europe PMC has no match", async () => {
    const index = pdfIndex();
    const result = await acquireOpenFullText(
      { doi: DOI },
      { email: "research@example.org" },
      {
        searchEuropePmc: async () => okEnvelope({
          provider: "europe_pmc",
          recordType: "europe_pmc_search_result",
          query: { query: `DOI:"${DOI}"` },
          pagination: { exhausted: true },
          returned: 0,
          accessStatus: "complete",
          data: []
        }),
        acquireUnpaywallFullText: async () => unpaywallAcquisition(index)
      }
    );

    expect(result).toMatchObject({
      access_status: "complete",
      data: {
        outcome: "full_text_indexed",
        discovery_attempts: [
          { route: "europe_pmc", result: "not_found" },
          { route: "unpaywall", result: "indexed", identifier: DOI }
        ],
        document_index: {
          source: { provider: "unpaywall_open_location", version: "acceptedVersion" }
        }
      }
    });
  });

  it("preserves a study as a lead when no auditable copy can be acquired", async () => {
    const result = await acquireOpenFullText(
      { doi: DOI },
      undefined,
      {
        searchEuropePmc: async () => okEnvelope({
          provider: "europe_pmc",
          recordType: "europe_pmc_search_result",
          query: { query: `DOI:"${DOI}"` },
          pagination: { exhausted: true },
          returned: 0,
          accessStatus: "complete",
          data: []
        })
      }
    );

    expect(result).toMatchObject({
      access_status: "inaccessible",
      data: {
        outcome: "possibly_useful_lead",
        discovery_attempts: [{ route: "europe_pmc", result: "not_found" }]
      }
    });
    expect(result.limitations.join(" ")).toContain("unseen contents");
  });
});

async function fixtureArticle(): Promise<EuropePmcFullTextArticle> {
  const xml = await readFile(
    new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
    "utf8"
  );
  return {
    pmcid: "PMC1234567",
    pmid: "40123456",
    doi: DOI,
    title: "Recorded full-text study",
    format: "jats_xml",
    document_completeness: "full_text_with_body",
    content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
    content_bytes: Buffer.byteLength(xml, "utf8"),
    xml
  };
}

function pdfIndex(): AuditableDocumentIndex {
  const text = "Identity-checked PDF text";
  const textHash = createHash("sha256").update(text, "utf8").digest("hex");
  return {
    source: {
      provider: "unpaywall_open_location",
      primary_identifier: DOI,
      canonical_url: "https://repository.example.org/open.pdf",
      doi: DOI,
      title: "Recorded full-text study",
      version: "acceptedVersion",
      format: "pdf_text",
      content_sha256: createHash("sha256").update("pdf", "utf8").digest("hex"),
      document_completeness: "full_text_with_body",
      identity_verification: "doi_exact"
    },
    section_paths: [["Page 1"]],
    blocks: [{
      block_id: `pdf_000001_${textHash.slice(0, 12)}`,
      kind: "page_text",
      section_path: ["Page 1"],
      page_number: 1,
      text,
      text_sha256: textHash
    }]
  };
}

function unpaywallAcquisition(index: AuditableDocumentIndex) {
  return okEnvelope({
    provider: "unpaywall",
    recordType: "open_full_text_acquisition",
    primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: index.source.canonical_url },
    pagination: { exhausted: true },
    returned: 1,
    accessStatus: "complete",
    limitations: ["Method audit required."],
    data: {
      requested_doi: DOI,
      outcome: "full_text_indexed",
      discovery_status: "metadata_only",
      attempted_locations: [{
        url: index.source.canonical_url,
        version: "acceptedVersion",
        result: "indexed"
      }],
      document_index: index
    } satisfies UnpaywallFullTextData
  });
}
