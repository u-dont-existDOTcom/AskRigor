import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchClinicalTrial,
  searchClinicalTrials
} from "../packages/sources/src/index.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/clinical-trials/${name}`, import.meta.url), "utf8");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ClinicalTrials.gov v2", () => {
  it("preserves the provider page token and normalizes only documented trial metadata", async () => {
    const [searchBody, versionBody] = await Promise.all([
      fixture("search-page-1.json"),
      fixture("version.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(requests.length === 1 ? searchBody : versionBody, { status: 200 });
    }));

    const result = await searchClinicalTrials({
      query: "example intervention",
      pageSize: 1,
      pageToken: "previous+provider/token"
    });

    expect(result).toMatchObject({
      provider: "clinicaltrials_gov",
      record_type: "clinical_trial_search_result",
      access_status: "complete",
      pagination: {
        cursor: "previous+provider/token",
        next_cursor: "provider-token+/opaque",
        page_size: 1,
        returned: 1,
        exhausted: false
      },
      raw_metadata: { data_timestamp: "2026-08-10T12:00:00Z" },
      data: [{
        nct_id: "NCT01234567",
        title: "Recorded trial of an example intervention",
        status: "RECRUITING",
        study_type: "INTERVENTIONAL",
        phases: ["PHASE2"],
        conditions: ["Example condition"],
        interventions: [{ type: "DRUG", name: "Example treatment" }],
        sponsors: ["Recorded Research Institute", "Example University"],
        enrollment: { count: 120, type: "ESTIMATED" },
        start_date: "2025-01-15",
        completion_date: "2026-12-31",
        has_results: true,
        references: [{ pmid: "40123456", type: "DERIVED", citation: "Recorded source citation" }],
        last_update: "2025-07-01"
      }]
    });
    expect(result.data.every(({ nct_id }) => /^NCT\d{8}$/.test(nct_id))).toBe(true);
    expect(requests.map(({ pathname }) => pathname)).toEqual([
      "/api/v2/studies",
      "/api/v2/version"
    ]);
    expect(Object.fromEntries(requests[0]!.searchParams)).toEqual({
      "query.term": "example intervention",
      pageSize: "1",
      pageToken: "previous+provider/token"
    });
  });

  it("returns an explicit not_found envelope for a 404 study response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not here", { status: 404 })));

    const result = await fetchClinicalTrial("NCT99999999");

    expect(result).toMatchObject({
      provider: "clinicaltrials_gov",
      record_type: "clinical_trial",
      primary_identifier: "NCT99999999",
      access_status: "not_found",
      pagination: { returned: 0, exhausted: true },
      error: {
        code: "clinical_trial_not_found",
        message: "ClinicalTrials.gov study not found",
        http_status: 404,
        retryable: false
      },
      data: {}
    });
  });

  it("retains a valid trial when provider freshness retrieval fails", async () => {
    vi.useFakeTimers();
    const studyBody = await fixture("study-NCT01234567.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      requests.push(new URL(String(input)));
      return new Response(requests.length === 1 ? studyBody : "unavailable", {
        status: requests.length === 1 ? 200 : 503
      });
    }));

    const pending = fetchClinicalTrial("NCT01234567");
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      data: { nct_id: "NCT01234567" }
    });
    expect(result.error).toBeUndefined();
    expect(result.limitations).toContain(
      "ClinicalTrials.gov provider freshness metadata was unavailable; study data was retrieved without a data timestamp."
    );
    expect(result.raw_metadata).toBeUndefined();
    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(5);
  });

  it("caches valid provider freshness metadata for fifteen minutes", async () => {
    const [studyBody, versionBody] = await Promise.all([
      fixture("study-NCT01234567.json"),
      fixture("version.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      requests.push(request);
      return new Response(
        request.pathname === "/api/v2/version" ? versionBody : studyBody,
        { status: 200 }
      );
    }));

    await fetchClinicalTrial("NCT01234567");
    await fetchClinicalTrial("NCT01234567");

    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(1);
  });

  it("rejects invalid search input and invalid NCT identifiers before fetch", async () => {
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);

    await expect(searchClinicalTrials({ query: " " })).rejects.toThrow(
      "Invalid ClinicalTrials.gov search input"
    );
    await expect(searchClinicalTrials({ query: "valid", pageSize: 101 })).rejects.toThrow(
      "Invalid ClinicalTrials.gov search input"
    );
    await expect(searchClinicalTrials({ query: "valid", pageToken: "" })).rejects.toThrow(
      "Invalid ClinicalTrials.gov search input"
    );
    await expect(fetchClinicalTrial("nct01234567")).rejects.toThrow(
      "Invalid ClinicalTrials.gov NCT ID"
    );
    expect(upstream).not.toHaveBeenCalled();
  });
});
