import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupForrtReplicationRelationships } from "@askrigor/sources";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/forrt/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FORRT FLoRA replication relationship lookup", () => {
  it("uses the fixed DOI endpoint and preserves forward replications, reproductions, outcome labels, and attribution", async () => {
    const requests: Array<{ url: URL; headers: Headers }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), headers: new Headers(init?.headers) });
      return new Response(await fixture("forward-links.json"), { status: 200 });
    }));

    const result = await lookupForrtReplicationRelationships(" DOI:10.5555/ORIGINAL.STUDY ");

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url.origin).toBe("https://rep-api.forrt.org");
    expect(requests[0]!.url.pathname).toBe("/v1/original-lookup");
    expect(requests[0]!.url.searchParams.get("dois")).toBe("10.5555/original.study");
    expect(requests[0]!.headers.get("authorization")).toBeNull();
    expect(requests[0]!.headers.get("user-agent")).toBe("askrigor-research/0.1.0");
    expect(result).toMatchObject({
      provider: "forrt",
      record_type: "replication_relationships",
      primary_identifier: "10.5555/original.study",
      access_status: "metadata_only",
      pagination: { returned: 1, exhausted: true },
      raw_metadata: {
        relationship_rows_reported: 3,
        duplicate_relationship_rows_deduplicated: 1,
        attribution: {
          dataset: "FORRT Library of Replication Attempts (FLoRA)",
          dataset_doi: "10.17605/OSF.IO/9R62X",
          license: "CC-BY-4.0"
        }
      },
      data: {
        lookup_status: "records_available",
        rejected_relationship_rows: 0
      }
    });
    expect(result.data.relationships).toHaveLength(2);
    const replication = result.data.relationships.find((item) => item.relationship_kind === "replication")!;
    expect(replication).toMatchObject({
      relation_direction: "original_to_repetition",
      original_identity: { doi: "10.5555/original.study", identity_status: "provider_reported" },
      repetition_identity: { doi: "10.5555/replication.study", first_author: "Replicator" },
      provider: "forrt",
      provider_record_id: "rep-1",
      provider_reported_outcome: "failed",
      raw_provider_outcome: "failed",
      implementation_match_audit_status: "not_started",
      linked_source_audit_status: "not_started"
    });
    const reproduction = result.data.relationships.find((item) => item.relationship_kind === "reproduction")!;
    expect(reproduction).toMatchObject({
      relation_direction: "original_to_repetition",
      repetition_identity: {
        title: "A reproduction without a DOI",
        first_author: "Reproduction Consortium",
        identity_basis: ["bibliographic_metadata"]
      },
      provider_reported_outcome: "mixed"
    });
    expect(reproduction.repetition_identity).not.toHaveProperty("doi");
    expect(result.data.coverage_statement).toContain("provider");
    expect(JSON.stringify(result)).not.toContain("quality_score");
    expect(JSON.stringify(result)).not.toContain("replication_verified");
  });

  it("preserves reverse links without pretending the provider reported an outcome", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("reverse-link.json"), { status: 200 })));
    const result = await lookupForrtReplicationRelationships("10.5555/replication.study");
    expect(result.data.relationships).toHaveLength(1);
    expect(result.data.relationships[0]).toMatchObject({
      relationship_kind: "replication",
      relation_direction: "repetition_to_original",
      original_identity: { doi: "10.5555/original.study" },
      repetition_identity: { doi: "10.5555/replication.study" },
      provider_reported_outcome: "not_reported",
      raw_provider_outcome: null,
      linked_source_audit_status: "not_started"
    });
  });

  it("returns a provider-scoped no match only after a successful exact DOI response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("no-match.json"), { status: 200 })));
    const result = await lookupForrtReplicationRelationships("10.5555/no.match");
    expect(result).toMatchObject({
      access_status: "metadata_only",
      pagination: { returned: 0, exhausted: true },
      data: {
        doi: "10.5555/no.match",
        lookup_status: "no_match_in_provider",
        relationships: []
      }
    });
    expect(result.limitations.join(" ")).toContain("provider-scoped");
    expect(result.limitations.join(" ")).toContain("does not mean no replication");
  });

  it("returns partial when malformed relationship rows are excluded and preserves unknown outcome wording without interpreting it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(await fixture("partial-links.json"), { status: 200 })));
    const result = await lookupForrtReplicationRelationships("10.5555/partial.study");
    expect(result).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: true },
      data: { lookup_status: "records_available", rejected_relationship_rows: 1 }
    });
    expect(result.data.relationships).toHaveLength(1);
    expect(result.data.relationships[0]).toMatchObject({
      provider_reported_outcome: "not_reported",
      raw_provider_outcome: "unexpected provider phrase"
    });
    expect(result.limitations.join(" ")).toContain("could not be safely normalized");
  });

  it.each([
    ["wrong response key", { results: { "10.5555/other.study": null } }],
    ["mismatched result DOI", { results: { "10.5555/requested.study": { doi: "10.5555/other.study", title: null, authors: null, year: null, record: { replications: [], originals: [] } } } }],
    ["missing relationship arrays", { results: { "10.5555/requested.study": { doi: "10.5555/requested.study", title: null, authors: null, year: null, record: {} } } }],
    ["unexpected second result", { results: { "10.5555/requested.study": null, "10.5555/other.study": null } }]
  ])("fails closed for %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const result = await lookupForrtReplicationRelationships("10.5555/requested.study");
    expect(result).toMatchObject({
      access_status: "error",
      data: { lookup_status: "unknown", relationships: [] },
      error: { code: "forrt_response_invalid", retryable: false }
    });
  });

  it("rejects malformed DOI input without making a request", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const result = await lookupForrtReplicationRelationships("https://evil.example/10.5555/not-allowed");
    expect(upstream).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      access_status: "error",
      data: { doi: null, lookup_status: "unknown" },
      error: { code: "forrt_identifier_invalid", retryable: false }
    });
    expect(JSON.stringify(result)).not.toContain("evil.example");
  });

  it("sanitizes invalid JSON rather than exposing the provider body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private-provider-body", { status: 200 })));
    const result = await lookupForrtReplicationRelationships("10.5555/invalid.json");
    expect(result).toMatchObject({ error: { code: "forrt_response_invalid", retryable: false } });
    expect(JSON.stringify(result)).not.toContain("private-provider-body");
  });

  it("preserves exhausted provider rate limiting as retryable", async () => {
    const upstream = vi.fn(async () => new Response("rate-limit-body", { status: 429 }));
    vi.stubGlobal("fetch", upstream);
    const result = await lookupForrtReplicationRelationships("10.5555/rate.limit");
    expect(upstream).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      access_status: "rate_limited",
      data: { lookup_status: "unknown" },
      error: { code: "forrt_rate_limited", retryable: true, http_status: 429 }
    });
    expect(JSON.stringify(result)).not.toContain("rate-limit-body");
  });

  it("preserves exhausted upstream failure as retryable and not as no_match_in_provider", async () => {
    const upstream = vi.fn(async () => new Response("upstream-body", { status: 503 }));
    vi.stubGlobal("fetch", upstream);
    const result = await lookupForrtReplicationRelationships("10.5555/upstream.failure");
    expect(upstream).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({
      access_status: "error",
      data: { lookup_status: "unknown", relationships: [] },
      error: { code: "forrt_upstream_unavailable", retryable: true }
    });
    expect(JSON.stringify(result)).not.toContain("upstream-body");
  });

  it.each([401, 403])("preserves HTTP %i as inaccessible rather than a provider no-match", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("access-body", { status })));
    const result = await lookupForrtReplicationRelationships("10.5555/access.denied");
    expect(result).toMatchObject({
      access_status: "inaccessible",
      data: { lookup_status: "unknown", relationships: [] },
      error: { code: "forrt_access_denied", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("access-body");
  });

  it("preserves endpoint not-found as not_found rather than no_match_in_provider", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing-body", { status: 404 })));
    const result = await lookupForrtReplicationRelationships("10.5555/endpoint.missing");
    expect(result).toMatchObject({
      access_status: "not_found",
      data: { lookup_status: "unknown", relationships: [] },
      error: { code: "forrt_record_not_found", retryable: false, http_status: 404 },
    });
    expect(JSON.stringify(result)).not.toContain("missing-body");
  });

  it("keeps a transport timeout retryable and unresolved", async () => {
    const upstream = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", upstream);
    const result = await lookupForrtReplicationRelationships("10.5555/timeout");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      access_status: "error",
      data: { lookup_status: "unknown", relationships: [] },
      error: { code: "forrt_request_failed", retryable: true },
    });
    expect(JSON.stringify(result)).not.toContain("timed out");
  });
});
