import { okEnvelope } from "@askrigor/contracts";
import { describe, expect, it, vi } from "vitest";

import { fetchDiscoveredDocument } from "../packages/sources/src/http.js";
import {
  acquireUnpaywallFullText,
  extractAuditablePdf,
  type UnpaywallOpenAccessData
} from "../packages/sources/src/index.js";

const DOI = "10.1234/open.study";
const CONFIG = { email: "research@example.org" };

describe("Unpaywall open-full-text acquisition", () => {
  it("extracts and identity-checks an open PDF before making it auditable", async () => {
    const bytes = minimalPdf(
      "A careful open study of treatment methods DOI 10.1234/open.study full methods results"
    );
    const result = await acquireUnpaywallFullText(DOI, CONFIG, {
      resolve: async () => resolution(openData()),
      fetchDocument: async () => ({
        finalUrl: "https://repository.example.org/open-study.pdf",
        contentType: "application/pdf",
        contentLength: bytes.byteLength,
        redirects: [],
        bytes
      })
    });

    expect(result).toMatchObject({
      provider: "unpaywall",
      record_type: "open_full_text_acquisition",
      access_status: "complete",
      data: {
        requested_doi: DOI,
        outcome: "full_text_indexed",
        attempted_locations: [{ result: "indexed" }],
        document_index: {
          source: {
            provider: "unpaywall_open_location",
            primary_identifier: DOI,
            doi: DOI,
            format: "pdf_text",
            document_completeness: "full_text_with_body",
            identity_verification: "doi_exact",
            version: "publishedVersion"
          }
        }
      }
    });
    if (result.data.document_index === undefined) throw new Error("missing index");
    expect(result.data.document_index.blocks[0]).toMatchObject({
      block_id: expect.stringMatching(/^pdf_000001_[a-f0-9]{12}$/u),
      kind: "page_text",
      page_number: 1
    });
  });

  it("keeps a discovered but mismatched PDF as a lead rather than evidence", async () => {
    const bytes = minimalPdf("A completely different paper with no matching title or identifier");
    const result = await acquireUnpaywallFullText(DOI, CONFIG, {
      resolve: async () => resolution(openData()),
      fetchDocument: async () => ({
        finalUrl: "https://repository.example.org/wrong.pdf",
        contentType: "application/pdf",
        contentLength: bytes.byteLength,
        redirects: [],
        bytes
      })
    });

    expect(result).toMatchObject({
      access_status: "inaccessible",
      data: {
        outcome: "possibly_useful_lead",
        attempted_locations: [{ result: "identity_not_verified" }]
      }
    });
    expect(result.data).not.toHaveProperty("document_index");
    expect(result.limitations.join(" ")).toContain("not treated as evidence");
  });

  it("does not call an HTML landing page a full text", async () => {
    const data = openData();
    data.best_location = {
      host_type: "publisher",
      version: "publishedVersion",
      landing_page_url: "https://publisher.example.org/article/123",
      candidate_full_text_url: "https://publisher.example.org/article/123",
      transport: "https"
    };
    data.oa_locations = [data.best_location];
    const fetchDocument = vi.fn();

    const result = await acquireUnpaywallFullText(DOI, CONFIG, {
      resolve: async () => resolution(data),
      fetchDocument
    });

    expect(fetchDocument).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ outcome: "possibly_useful_lead" });
    expect(result.data.access_boundary).toContain("no direct HTTPS PDF");
  });
});

describe("bounded discovered-document transport", () => {
  it("rejects private destinations before making a request", async () => {
    const fetcher = vi.fn();

    await expect(fetchDiscoveredDocument("https://127.0.0.1/full.pdf", {
      fetch: fetcher as typeof fetch
    })).rejects.toThrow("outside the public internet");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("pins production document requests to the vetted public DNS answers", async () => {
    const bytes = minimalPdf("DOI 10.1234/open.study");
    const requestDocument = vi.fn(async (
      url: URL,
      addresses: readonly string[]
    ) => {
      expect(url.hostname).toBe("repository.example.org");
      expect(addresses).toEqual(["93.184.216.34"]);
      return {
        status: 200,
        headers: new Headers({ "content-type": "application/pdf" }),
        bytes
      };
    });

    const result = await fetchDiscoveredDocument(
      "https://repository.example.org/open-study.pdf",
      {
        resolveAddresses: async () => ["93.184.216.34"],
        requestDocument
      }
    );

    expect(requestDocument).toHaveBeenCalledOnce();
    expect(result.bytes).toEqual(bytes);
  });

  it("rejects a mixed public/private DNS answer before the pinned requester", async () => {
    const requestDocument = vi.fn();

    await expect(fetchDiscoveredDocument(
      "https://repository.example.org/open-study.pdf",
      {
        resolveAddresses: async () => ["93.184.216.34", "169.254.169.254"],
        requestDocument
      }
    )).rejects.toThrow("outside the public internet");
    expect(requestDocument).not.toHaveBeenCalled();
  });

  it("rechecks a safe redirect and returns bounded bytes", async () => {
    const bytes = minimalPdf("DOI 10.1234/open.study");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://cdn.example.org/open.pdf" }
      }))
      .mockResolvedValueOnce(new Response(bytes, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(bytes.byteLength)
        }
      }));

    const result = await fetchDiscoveredDocument(
      "https://repository.example.org/record/123",
      {
        fetch: fetcher as typeof fetch,
        resolveAddresses: async () => ["93.184.216.34"]
      }
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      finalUrl: "https://cdn.example.org/open.pdf",
      redirects: ["https://cdn.example.org/open.pdf"],
      contentLength: bytes.byteLength
    });
  });
});

describe("PDF identity extraction", () => {
  it("accepts an exact title despite PDF line breaks when the DOI is absent", async () => {
    const index = await extractAuditablePdf({
      doi: DOI,
      title: "A careful open study of treatment methods",
      canonicalUrl: "https://repository.example.org/open-study.pdf",
      bytes: minimalPdf("A careful open study of\ntreatment methods Full methods and results")
    });

    expect(index?.source.identity_verification).toBe("title_match");
  });

  it("rejects unordered keyword overlap as insufficient title identity", async () => {
    const index = await extractAuditablePdf({
      doi: DOI,
      title: "A careful open study of treatment methods",
      canonicalUrl: "https://repository.example.org/wrong.pdf",
      bytes: minimalPdf("Treatment methods from an unrelated open paper and a careful separate study")
    });

    expect(index).toBeUndefined();
  });

  it("refuses a valid PDF whose study identity cannot be verified", async () => {
    const index = await extractAuditablePdf({
      doi: DOI,
      title: "A careful open study of treatment methods",
      canonicalUrl: "https://repository.example.org/wrong.pdf",
      bytes: minimalPdf("Unrelated document")
    });

    expect(index).toBeUndefined();
  });
});

function openData(): UnpaywallOpenAccessData {
  const best = {
    host_type: "repository",
    version: "publishedVersion",
    license: "cc-by",
    pdf_url: "https://repository.example.org/open-study.pdf",
    candidate_full_text_url: "https://repository.example.org/open-study.pdf",
    transport: "https" as const
  };
  return {
    doi: DOI,
    title: "A careful open study of treatment methods",
    is_oa: true,
    oa_status: "gold",
    full_text_lead_status: "open_location_available",
    best_location: best,
    oa_locations: [best]
  };
}

function resolution(data: UnpaywallOpenAccessData) {
  return okEnvelope({
    provider: "unpaywall",
    recordType: "open_access_location_resolution",
    primaryIdentifier: DOI,
    sourceIdentity: { canonical_url: `https://doi.org/${DOI}`, title: data.title },
    pagination: { exhausted: true },
    returned: 1,
    accessStatus: "metadata_only",
    limitations: ["Discovery metadata only."],
    data
  });
}

function minimalPdf(text: string): Uint8Array {
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, "ascii"));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "ascii");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
