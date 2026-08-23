import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchEuropePmcFullText } from "../packages/sources/src/index.js";

const fixture = () => readFile(
  new URL("fixtures/europe-pmc/full-text.xml", import.meta.url),
  "utf8"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Europe PMC reusable full-text retrieval", () => {
  it("preserves exact XML, identity, completeness, and content hash", async () => {
    const xml = await fixture();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(xml, {
        status: 200,
        headers: { "content-type": "application/xml" }
      });
    }));

    const result = await fetchEuropePmcFullText("pmc1234567");

    expect(result).toMatchObject({
      provider: "europe_pmc",
      record_type: "europe_pmc_full_text",
      primary_identifier: "PMC1234567",
      access_status: "complete",
      pagination: { returned: 1, exhausted: true },
      source_identity: {
        canonical_url: "https://europepmc.org/articles/PMC1234567",
        title: "Recorded full-text study"
      },
      data: {
        pmcid: "PMC1234567",
        pmid: "40123456",
        doi: "10.1234/recorded.example",
        title: "Recorded full-text study",
        license: "Creative Commons Attribution 4.0",
        format: "jats_xml",
        document_completeness: "full_text_with_body",
        content_sha256: createHash("sha256").update(xml, "utf8").digest("hex"),
        content_bytes: Buffer.byteLength(xml, "utf8"),
        xml
      }
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1234567/fullTextXML"
    );
    expect(new Headers(requests[0]?.init?.headers).get("accept")).toContain(
      "application/xml"
    );
  });

  it("rejects a response whose PMCID does not match the request", async () => {
    const xml = (await fixture()).replaceAll("PMC1234567", "PMC7654321");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

    const result = await fetchEuropePmcFullText("PMC1234567");

    expect(result).toMatchObject({
      access_status: "error",
      pagination: { returned: 0, exhausted: false },
      error: {
        code: "europe_pmc_full_text_identity_mismatch",
        retryable: false
      },
      data: {}
    });
  });

  it("keeps unavailable full text as a lead rather than negative evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not available", { status: 404 })));

    const result = await fetchEuropePmcFullText("PMC1234567");

    expect(result).toMatchObject({
      access_status: "not_found",
      source_identity: {
        canonical_url: "https://europepmc.org/articles/PMC1234567"
      },
      error: {
        code: "europe_pmc_full_text_not_found",
        http_status: 404,
        retryable: false
      },
      data: {}
    });
    expect(result.limitations.join(" ")).toContain(
      "possibly useful research lead"
    );
    expect(JSON.stringify(result)).not.toContain("not available");
  });

  it("rejects invalid PMCIDs before making a request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(fetchEuropePmcFullText("1234567")).rejects.toThrow(
      "Invalid Europe PMC full-text PMCID"
    );
    expect(upstream).not.toHaveBeenCalled();
  });
});
