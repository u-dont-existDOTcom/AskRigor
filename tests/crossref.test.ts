import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkRetractionStatus,
  resolveDoi
} from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/crossref/${name}`, import.meta.url), "utf8");
const crossrefConfig = { mailto: "maintainer@example.test" };

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

    const result = await checkRetractionStatus("https://doi.org/10.1021/AM300292V", crossrefConfig);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.pathname).toBe("/works/10.1021%2Fam300292v");
    expect(requests[0]!.searchParams.get("mailto")).toBe("maintainer@example.test");
    expect(userAgents).toEqual(["askrigor-research/0.1.0 (mailto:maintainer@example.test)"]);
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
          doi: "10.1021/acsami.9b11759",
          date: "2024-03-04",
          source: "retraction-watch",
          raw_label: "updated-by | inbound | Retraction"
        }]
      }
    });
  });

  it("reports no_retraction_record_found only after a successful supported-source response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("work-no-marker.json"),
      { status: 200 }
    )));

    const result = await checkRetractionStatus("doi:10.5555/NO.MARKER", crossrefConfig);

    expect(result.data).toEqual({
      doi: "10.5555/no.marker",
      status: "no_retraction_record_found",
      evidence: [],
      sources_checked: ["crossref"]
    });
    expect(result.error).toBeUndefined();
    expect(result.limitations).toContain(
      "No inbound retraction, expression-of-concern, correction, or update marker was present in the successful Crossref metadata response; this does not prove unretracted status everywhere."
    );
  });

  it("applies deterministic retraction precedence across update-to, updated-by, and relation metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("work-mixed-markers.json"),
      { status: 200 }
    )));

    const result = await checkRetractionStatus("10.5555/mixed.markers", crossrefConfig);

    expect(result.data.status).toBe("retracted");
    expect(result.data.evidence).toEqual([
      {
        type: "corrected_or_updated",
        doi: "10.5555/mixed.correction",
        date: "2021-02-03",
        source: "publisher",
        raw_label: "update-to | outbound | Correction"
      },
      {
        type: "expression_of_concern",
        doi: "10.5555/mixed.concern",
        date: "2022-03-04",
        source: "publisher",
        raw_label: "updated-by | inbound | Expression of concern"
      },
      {
        type: "retracted",
        doi: "10.5555/mixed.retraction",
        date: "2023-04-05",
        source: "retraction-watch",
        raw_label: "is-retracted-by | inbound"
      }
    ]);
  });

  it("returns unknown when a successful HTTP response does not contain a valid Crossref work", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"status\":\"ok\"}", { status: 200 })));

    const result = await checkRetractionStatus("10.5555/malformed.response", crossrefConfig);

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

    const result = await checkRetractionStatus("10.5555/requested.work", crossrefConfig);

    expect(result).toMatchObject({
      access_status: "error",
      data: { doi: "10.5555/requested.work", status: "unknown", evidence: [] },
      error: { code: "crossref_response_invalid" }
    });
  });

  it("returns unknown rather than negative evidence when Crossref retrieval fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream-secret", { status: 503 })));

    const result = await checkRetractionStatus("10.0000/unresolvable", crossrefConfig);

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

    const result = await checkRetractionStatus("https://invalid.example/10.5555/not-allowed", crossrefConfig);

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

    const result = await checkRetractionStatus("https://doi.org/10.5555/%", crossrefConfig);

    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      data: { status: "unknown", evidence: [] },
      error: { code: "crossref_identifier_invalid" }
    });
  });

  it("resolves a canonical DOI through the encoded works endpoint", async () => {
    const body = await fixture("work-no-marker.json");
    const requests: Array<{ url: URL; userAgent: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), userAgent: new Headers(init?.headers).get("user-agent") });
      return new Response(body, { status: 200 });
    }));

    const result = await resolveDoi(" DOI:10.5555/NO.MARKER ", crossrefConfig);

    expect(requests[0]!.url.pathname).toBe("/works/10.5555%2Fno.marker");
    expect(result.data).toMatchObject({
      resolved_doi: "10.5555/no.marker",
      candidates: [{ doi: "10.5555/no.marker", title: "Recorded work without an update marker" }]
    });
  });

  it("uses exactly five bibliographic candidates and resolves only an exact title, author, and year match", async () => {
    const body = await fixture("citation-candidates.json");
    const requests: Array<{ url: URL; userAgent: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), userAgent: new Headers(init?.headers).get("user-agent") });
      return new Response(body, { status: 200 });
    }));

    const result = await resolveDoi("Smith J. A fixture study of Crossref matching. Journal. 2024.", crossrefConfig);

    expect(Object.fromEntries(requests[0]!.url.searchParams)).toMatchObject({
      "query.bibliographic": "Smith J. A fixture study of Crossref matching. Journal. 2024.",
      rows: "5",
      mailto: "maintainer@example.test"
    });
    expect(requests[0]!.userAgent).toBe("askrigor-research/0.1.0 (mailto:maintainer@example.test)");
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

    const result = await resolveDoi("Brown Q. An unrelated paper. Journal. 2019.", crossrefConfig);

    expect(result.access_status).toBe("metadata_only");
    expect(result.data.resolved_doi).toBeNull();
    expect(result.data.candidates).toHaveLength(2);
  });

  it.each([
    ["missing status", { "message-type": "work", message: { DOI: "10.5555/envelope.test" } }],
    ["non-success status", { status: "queued", "message-type": "work", message: { DOI: "10.5555/envelope.test" } }],
    ["wrong single-work message type", { status: "ok", "message-type": "work-list", message: { DOI: "10.5555/envelope.test" } }]
  ])("returns unknown for a %s single-work envelope", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    const result = await checkRetractionStatus("10.5555/envelope.test", crossrefConfig);
    expect(result).toMatchObject({ data: { status: "unknown", evidence: [] }, error: { code: "crossref_response_invalid" } });
  });

  it.each([
    ["update-to", { "update-to": [{ DOI: 12 }] }],
    ["update-to DOI", { "update-to": [{ DOI: "not-a-doi", type: "correction" }] }],
    ["updated-by", { "updated-by": [{ type: "retraction" }] }],
    ["relation", { relation: { "is-retracted-by": [{ DOI: 12 }] } }]
  ])("returns unknown when a present %s marker container is malformed", async (_name, marker) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work", message: { DOI: "10.5555/marker.test", ...marker }
    }), { status: 200 })));
    const result = await checkRetractionStatus("10.5555/marker.test", crossrefConfig);
    expect(result).toMatchObject({ data: { status: "unknown", evidence: [] }, error: { code: "crossref_response_invalid" } });
  });

  it("does not apply an outbound notice update-to marker to the notice itself", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("work-notice-outbound.json"), { status: 200 })));
    const result = await checkRetractionStatus("10.1021/acsami.9b11759", crossrefConfig);
    expect(result.data).toMatchObject({
      status: "no_retraction_record_found",
      evidence: [{
        type: "retracted",
        doi: "10.1021/am300292v",
        raw_label: "update-to | outbound | Retraction"
      }]
    });
  });

  it.each([
    ["missing status", { "message-type": "work-list", message: { "total-results": 0, items: [] } }],
    ["non-success status", { status: "queued", "message-type": "work-list", message: { "total-results": 0, items: [] } }],
    ["wrong citation message type", { status: "ok", "message-type": "work", message: { "total-results": 0, items: [] } }],
    ["missing total-results", { status: "ok", "message-type": "work-list", message: { items: [] } }]
  ])("rejects a %s citation envelope", async (_name, response) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(response), { status: 200 })));
    const result = await resolveDoi("Smith J. A citation. Journal. 2024.", crossrefConfig);
    expect(result).toMatchObject({ access_status: "error", error: { code: "crossref_response_invalid" } });
  });

  it("rejects a malformed returned citation candidate instead of silently filtering it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work-list", message: {
        "total-results": 2,
        items: [
          { DOI: "10.5555/exact.fixture", title: ["A fixture study of crossref matching"], author: [{ family: "Smith" }], issued: { "date-parts": [[2024]] } },
          { DOI: 12, title: ["Malformed candidate"], author: [{ family: "Smith" }], issued: { "date-parts": [[2024]] } }
        ]
      }
    }), { status: 200 })));
    const result = await resolveDoi("Smith J. A fixture study of Crossref matching. Journal. 2024.", crossrefConfig);
    expect(result).toMatchObject({ access_status: "error", data: { resolved_doi: null, candidates: [] }, error: { code: "crossref_response_invalid" } });
  });

  it("does not auto-resolve a hidden citation tie between two otherwise matching candidates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work-list", message: {
        "total-results": 2,
        items: [
          { DOI: "10.5555/tie.one", title: ["A fixture study of crossref matching"], author: [{ family: "Smith" }], issued: { "date-parts": [[2024]] } },
          { DOI: "10.5555/tie.two", title: ["A fixture study of crossref matching"], author: [{ family: "Smith" }], issued: { "date-parts": [[2024]] } }
        ]
      }
    }), { status: 200 })));
    const result = await resolveDoi("Smith J. A fixture study of Crossref matching. Journal. 2024.", crossrefConfig);
    expect(result.data).toMatchObject({ resolved_doi: null, candidates: [{ doi: "10.5555/tie.one" }, { doi: "10.5555/tie.two" }] });
  });

  it("rejects a citation response whose total-results is smaller than returned items", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok", "message-type": "work-list", message: {
        "total-results": 1,
        items: [
          { DOI: "10.5555/total.one" },
          { DOI: "10.5555/total.two" }
        ]
      }
    }), { status: 200 })));
    const result = await resolveDoi("Smith J. A citation. Journal. 2024.", crossrefConfig);
    expect(result).toMatchObject({ access_status: "error", error: { code: "crossref_response_invalid" } });
  });

  it("reports a bounded, non-exhausted partial citation page when Crossref has more than five matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("citation-many-results.json"), { status: 200 })));
    const result = await resolveDoi("Smith J. Candidate one. Journal. 2024.", crossrefConfig);
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { page_size: 5, returned: 5, exhausted: false },
      raw_metadata: { total_results: 8 }
    });
    expect(result.limitations).toContain("Crossref returned only the top 5 of 8 bibliographic candidates; additional candidates were not retrieved.");
  });

  it("returns a conservative configuration failure without an anonymous request or configuration leak", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const result = await checkRetractionStatus("10.5555/no.config", { mailto: "not an email" });
    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({ data: { status: "unknown", evidence: [] }, error: { code: "crossref_configuration_invalid" } });
    expect(JSON.stringify(result)).not.toContain("not an email");
  });
});
