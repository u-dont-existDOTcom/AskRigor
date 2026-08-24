import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkCrossrefPublicationIntegrity,
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
  it("preserves an ordered update history and merges duplicate assertions without losing source provenance", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      await fixture("work-integrity-history.json"),
      { status: 200 }
    )));

    const result = await checkCrossrefPublicationIntegrity(
      "10.5555/integrity.history",
      crossrefConfig
    );

    expect(result).toMatchObject({
      provider: "crossref",
      record_type: "publication_integrity",
      access_status: "metadata_only",
      data: {
        doi: "10.5555/integrity.history",
        record_state: "reinstatement_recorded",
        sources_checked: ["crossref"]
      }
    });
    expect(result.data.events.map((event) => event.event_kind)).toEqual([
      "other",
      "correction",
      "expression_of_concern",
      "retraction",
      "withdrawal",
      "reinstatement"
    ]);
    expect(result.data.events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    const retraction = result.data.events.find((event) => event.event_kind === "retraction")!;
    expect(retraction).toMatchObject({
      event_date: "2023-04-05",
      original_doi: "10.5555/integrity.history",
      notice_doi: "10.5555/integrity.retraction"
    });
    expect(retraction.assertions).toHaveLength(2);
    expect(new Set(retraction.assertions.map((assertion) => assertion.assertion_source))).toEqual(
      new Set(["publisher", "retraction_watch"])
    );
    expect(retraction.assertions.find((assertion) => assertion.assertion_source === "publisher"))
      .toMatchObject({ provider_record_id: "publisher-17", relation_direction: "inbound" });
    expect(retraction.assertions.find((assertion) => assertion.assertion_source === "retraction_watch"))
      .toMatchObject({ provider_record_id: "941", relation_direction: "inbound" });
    expect(retraction.event_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(new Set(result.data.events.map((event) => event.event_hash)).size).toBe(6);

    const legacy = await checkRetractionStatus("10.5555/integrity.history", crossrefConfig);
    expect(legacy.data.status).toBe("retracted");
    expect(legacy.data).not.toHaveProperty("events");
    expect(legacy.data).not.toHaveProperty("record_state");
  });

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
      status: "ok",
      "message-type": "work",
      message: {
        DOI: "10.5555/other.work",
        title: ["A valid but mismatched Crossref record"],
        author: [{ family: "Example" }],
        issued: { "date-parts": [[2024]] },
        "updated-by": [{
          DOI: "10.5555/other.notice",
          type: "retraction",
          updated: { "date-parts": [[2024, 2, 3]] },
          source: "publisher",
          label: "Retraction"
        }]
      }
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

  it("preserves outbound notice roles in the rich publication history", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("work-notice-outbound.json"), { status: 200 })));
    const result = await checkCrossrefPublicationIntegrity("10.1021/acsami.9b11759", crossrefConfig);
    expect(result.data).toMatchObject({
      record_state: "no_update_marker_found",
      events: [{
        event_kind: "retraction",
        original_doi: "10.1021/am300292v",
        notice_doi: "10.1021/acsami.9b11759",
        assertions: [{ relation_direction: "outbound" }]
      }]
    });
  });

  it("keeps Crossref rate limiting retryable and distinct from a provider no-marker result", async () => {
    const upstream = vi.fn(async () => new Response("rate-limited-secret", { status: 429 }));
    vi.stubGlobal("fetch", upstream);
    const result = await checkCrossrefPublicationIntegrity("10.5555/rate.limit", crossrefConfig);
    expect(upstream).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      access_status: "rate_limited",
      data: { record_state: "state_uncertain", events: [] },
      error: { code: "crossref_rate_limited", retryable: true, http_status: 429 }
    });
    expect(JSON.stringify(result)).not.toContain("rate-limited-secret");
  });

  it("preserves a missing Crossref work as not_found rather than no_update_marker_found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    const result = await checkCrossrefPublicationIntegrity("10.5555/not.found", crossrefConfig);
    expect(result).toMatchObject({
      access_status: "not_found",
      data: { record_state: "state_uncertain", events: [] },
      error: { code: "crossref_record_not_found", retryable: false, http_status: 404 }
    });
  });

  it("keeps the current publication state uncertain when same-date inbound assertions conflict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      "message-type": "work",
      message: {
        DOI: "10.5555/conflicting.state",
        "updated-by": [
          {
            DOI: "10.5555/conflicting.retraction",
            type: "retraction",
            updated: { "date-parts": [[2025, 4, 3]] },
            source: "publisher",
          },
          {
            DOI: "10.5555/conflicting.reinstatement",
            type: "reinstatement",
            updated: { "date-parts": [[2025, 4, 3]] },
            source: "publisher",
          },
        ],
      },
    }), { status: 200 })));

    const result = await checkCrossrefPublicationIntegrity("10.5555/conflicting.state", crossrefConfig);

    expect(result.data).toMatchObject({
      record_state: "state_uncertain",
      events: [
        { event_kind: "reinstatement", event_date: "2025-04-03" },
        { event_kind: "retraction", event_date: "2025-04-03" },
      ],
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

  it.each([
    [4, ["10.5555/short.four.1", "10.5555/short.four.2"]],
    [8, ["10.5555/short.eight.1", "10.5555/short.eight.2", "10.5555/short.eight.3"]]
  ])("rejects an internally short work-list with total-results %i", async (totalResults, dois) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      "message-type": "work-list",
      message: {
        "total-results": totalResults,
        items: dois.map((DOI) => ({ DOI }))
      }
    }), { status: 200 })));

    const result = await resolveDoi("Smith J. A citation. Journal. 2024.", crossrefConfig);

    expect(result).toMatchObject({
      access_status: "error",
      data: { resolved_doi: null, candidates: [] },
      error: { code: "crossref_response_invalid" }
    });
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
    expect(result.data.resolved_doi).toBeNull();
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
