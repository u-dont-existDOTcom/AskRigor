import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkRetractionStatus,
  resolveDoi
} from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/crossref/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Crossref DOI and retraction retrieval", () => {
  it("normalizes DOI URLs and preserves a retraction marker as traceable evidence", async () => {
    const body = await fixture("work-retracted.json");
    const requests: URL[] = [];
    const userAgents: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push(new URL(String(input)));
      userAgents.push(new Headers(init?.headers).get("user-agent"));
      return new Response(body, { status: 200 });
    }));

    const result = await checkRetractionStatus("https://doi.org/10.1021/AM300292V");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.pathname).toBe("/works/10.1021%2Fam300292v");
    expect(userAgents).toEqual(["askrigor-research/0.1.0"]);
    expect(result).toMatchObject({
      provider: "crossref",
      record_type: "retraction_status",
      primary_identifier: "10.1021/am300292v",
      access_status: "metadata_only",
      data: {
        doi: "10.1021/am300292v",
        status: "retracted",
        evidence: [{
          type: "retracted",
          doi: "10.1021/am300292v.ret",
          date: "2024-03-04",
          source: "retraction-watch",
          raw_label: "Retraction"
        }]
      }
    });
  });

  it("reports no_retraction_record_found only after a successful supported-source response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("work-no-marker.json"),
      { status: 200 }
    )));

    const result = await checkRetractionStatus("doi:10.5555/NO.MARKER");

    expect(result.data).toEqual({
      doi: "10.5555/no.marker",
      status: "no_retraction_record_found",
      evidence: [],
      sources_checked: ["crossref"]
    });
    expect(result.error).toBeUndefined();
    expect(result.limitations).toContain(
      "No retraction, expression-of-concern, correction, or update marker was present in the successful Crossref metadata response; this does not prove unretracted status everywhere."
    );
  });

  it("applies deterministic retraction precedence across update-to, updated-by, and relation metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("work-mixed-markers.json"),
      { status: 200 }
    )));

    const result = await checkRetractionStatus("10.5555/mixed.markers");

    expect(result.data.status).toBe("retracted");
    expect(result.data.evidence).toEqual([
      {
        type: "corrected_or_updated",
        doi: "10.5555/mixed.correction",
        date: "2021-02-03",
        source: "publisher",
        raw_label: "Correction"
      },
      {
        type: "expression_of_concern",
        doi: "10.5555/mixed.concern",
        date: "2022-03-04",
        source: "publisher",
        raw_label: "Expression of concern"
      },
      {
        type: "retracted",
        doi: "10.5555/mixed.retraction",
        date: "2023-04-05",
        source: "retraction-watch",
        raw_label: "is-retracted-by"
      }
    ]);
  });

  it("returns unknown when a successful HTTP response does not contain a valid Crossref work", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"status\":\"ok\"}", { status: 200 })));

    const result = await checkRetractionStatus("10.5555/malformed.response");

    expect(result).toMatchObject({
      access_status: "error",
      data: { doi: "10.5555/malformed.response", status: "unknown", evidence: [] },
      error: { code: "crossref_response_invalid", message: "Crossref response was invalid" }
    });
  });

  it("returns unknown rather than accepting ambiguous metadata for another DOI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      message: { DOI: "10.5555/other.work" }
    }), { status: 200 })));

    const result = await checkRetractionStatus("10.5555/requested.work");

    expect(result).toMatchObject({
      access_status: "error",
      data: { doi: "10.5555/requested.work", status: "unknown", evidence: [] },
      error: { code: "crossref_response_invalid" }
    });
  });

  it("returns unknown rather than negative evidence when Crossref retrieval fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream-secret", { status: 503 })));

    const result = await checkRetractionStatus("10.0000/unresolvable");

    expect(result).toMatchObject({
      access_status: "error",
      data: { doi: "10.0000/unresolvable", status: "unknown", evidence: [] },
      error: {
        code: "crossref_upstream_unavailable",
        message: "Crossref upstream service unavailable",
        retryable: true
      }
    });
    expect(JSON.stringify(result)).not.toContain("upstream-secret");
  });

  it("returns unknown for malformed retraction identifiers without making a request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await checkRetractionStatus("https://invalid.example/10.5555/not-allowed");

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      data: { status: "unknown", evidence: [] },
      error: { code: "crossref_identifier_invalid", message: "Crossref DOI identifier is invalid" }
    });
    expect(JSON.stringify(result)).not.toContain("invalid.example");
  });

  it("safely rejects malformed DOI URL escaping as unknown without making a request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    const result = await checkRetractionStatus("https://doi.org/10.5555/%");

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      data: { status: "unknown", evidence: [] },
      error: { code: "crossref_identifier_invalid" }
    });
  });

  it("resolves a canonical DOI through the encoded works endpoint", async () => {
    const body = await fixture("work-no-marker.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await resolveDoi(" DOI:10.5555/NO.MARKER ");

    expect(requests[0]!.pathname).toBe("/works/10.5555%2Fno.marker");
    expect(result.data).toMatchObject({
      resolved_doi: "10.5555/no.marker",
      candidates: [{ doi: "10.5555/no.marker", title: "Recorded work without an update marker" }]
    });
  });

  it("uses exactly five bibliographic candidates and resolves only an exact title, author, and year match", async () => {
    const body = await fixture("citation-candidates.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(body, { status: 200 });
    }));

    const result = await resolveDoi("Smith J. A fixture study of Crossref matching. Journal. 2024.");

    expect(Object.fromEntries(requests[0]!.searchParams)).toMatchObject({
      "query.bibliographic": "Smith J. A fixture study of Crossref matching. Journal. 2024.",
      rows: "5"
    });
    expect(result.data).toMatchObject({
      resolved_doi: "10.5555/exact.fixture",
      candidates: [
        { doi: "10.5555/exact.fixture", title: "A fixture study of crossref matching", first_author: "Smith", year: "2024" },
        { doi: "10.5555/near.fixture", title: "A different fixture study", first_author: "Jones", year: "2023" }
      ]
    });
  });

  it("returns provider candidates without a DOI when the strict citation threshold is not met", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("citation-candidates.json"),
      { status: 200 }
    )));

    const result = await resolveDoi("Brown Q. An unrelated paper. Journal. 2019.");

    expect(result.access_status).toBe("metadata_only");
    expect(result.data.resolved_doi).toBeNull();
    expect(result.data.candidates).toHaveLength(2);
  });
});
