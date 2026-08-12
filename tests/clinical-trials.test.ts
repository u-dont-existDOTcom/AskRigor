import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchClinicalTrial,
  searchClinicalTrials
} from "../packages/sources/src/index.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";

const fixture = (name: string) =>
  readFile(new URL(`fixtures/clinical-trials/${name}`, import.meta.url), "utf8");

afterEach(() => {
  resetClinicalTrialsFreshnessCacheForTests();
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
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
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
    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(1);
  });

  it("caches valid provider freshness metadata for fifteen minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
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

  it("coalesces concurrent freshness refreshes into one version request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2032-01-01T00:00:00Z"));
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

    const results = await Promise.all([
      fetchClinicalTrial("NCT01234567"),
      fetchClinicalTrial("NCT01234567")
    ]);

    expect(results.map(({ access_status }) => access_status)).toEqual([
      "api_visible_complete",
      "api_visible_complete"
    ]);
    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(1);
  });

  it("caches a failed freshness request for the full TTL without retrying it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2033-01-01T00:00:00Z"));
    const studyBody = await fixture("study-NCT01234567.json");
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      requests.push(request);
      return new Response(request.pathname === "/api/v2/version" ? "provider-secret" : studyBody, {
        status: request.pathname === "/api/v2/version" ? 503 : 200
      });
    }));

    const first = fetchClinicalTrial("NCT01234567");
    await vi.runAllTimersAsync();
    const second = fetchClinicalTrial("NCT01234567");
    await vi.runAllTimersAsync();
    const results = await Promise.all([first, second]);

    expect(results.map(({ access_status }) => access_status)).toEqual([
      "api_visible_complete",
      "api_visible_complete"
    ]);
    expect(results.every(({ raw_metadata }) => raw_metadata === undefined)).toBe(true);
    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(1);
    expect(JSON.stringify(results)).not.toContain("provider-secret");
  });

  it("refreshes freshness metadata at the exact fifteen-minute expiry boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2034-01-01T00:00:00Z"));
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
    vi.advanceTimersByTime(15 * 60 * 1_000);
    await fetchClinicalTrial("NCT01234567");

    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(2);
  });

  it.each([
    ["successful", 200, true],
    ["failed", 503, false]
  ])("starts the full freshness TTL when a delayed %s version request settles", async (
    _kind,
    versionStatus,
    hasTimestamp
  ) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-06-01T00:00:00Z"));
    const [studyBody, versionBody] = await Promise.all([
      fixture("study-NCT01234567.json"),
      fixture("version.json")
    ]);
    const requests: URL[] = [];
    let settleVersion: ((response: Response) => void) | undefined;
    let versionStartedResolve: (() => void) | undefined;
    const versionStarted = new Promise<void>((resolve) => {
      versionStartedResolve = resolve;
    });
    vi.stubGlobal("fetch", vi.fn((input: URL | RequestInfo) => {
      const request = new URL(String(input));
      requests.push(request);
      if (request.pathname !== "/api/v2/version") {
        return Promise.resolve(new Response(studyBody, { status: 200 }));
      }
      if (requests.filter(({ pathname }) => pathname === "/api/v2/version").length > 1) {
        return Promise.resolve(new Response(versionBody, { status: 200 }));
      }
      versionStartedResolve!();
      return new Promise<Response>((resolve) => {
        settleVersion = resolve;
      });
    }));

    const firstRequest = fetchClinicalTrial("NCT01234567");
    await versionStarted;
    vi.advanceTimersByTime(5 * 60 * 1_000);
    settleVersion!(new Response(versionStatus === 200 ? versionBody : "provider-secret", {
      status: versionStatus
    }));
    const first = await firstRequest;

    expect(first.raw_metadata === undefined).toBe(!hasTimestamp);
    vi.advanceTimersByTime(15 * 60 * 1_000 - 1);
    await fetchClinicalTrial("NCT01234567");

    expect(requests.filter(({ pathname }) => pathname === "/api/v2/version")).toHaveLength(1);
  });

  it("uses only an explicit provider hasResults flag", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
    const [searchBody, versionBody] = await Promise.all([
      fixture("search-results-flags.json"),
      fixture("version.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      return new Response(request.pathname === "/api/v2/version" ? versionBody : searchBody, {
        status: 200
      });
    }));

    const result = await searchClinicalTrials({ query: "results flags", pageSize: 3 });

    expect(result.data).toEqual([
      { nct_id: "NCT11111111", has_results: true },
      { nct_id: "NCT22222222", has_results: false },
      { nct_id: "NCT33333333" }
    ]);
  });

  it.each([
    ["malformed JSON", 200, "{provider-secret", "error", "clinical_trials_response_invalid", "ClinicalTrials.gov response was invalid", false],
    ["rate limit", 429, "provider-secret", "rate_limited", "clinical_trials_rate_limited", "ClinicalTrials.gov rate limit reached", true],
    ["unauthorized", 401, "provider-secret", "inaccessible", "clinical_trials_access_denied", "ClinicalTrials.gov access denied", false],
    ["forbidden", 403, "provider-secret", "inaccessible", "clinical_trials_access_denied", "ClinicalTrials.gov access denied", false],
    ["upstream failure", 503, "provider-secret", "error", "clinical_trials_upstream_unavailable", "ClinicalTrials.gov upstream service unavailable", true]
  ])("maps %s to a sanitized explicit search envelope", async (
    _name,
    status,
    body,
    accessStatus,
    code,
    message,
    retryable
  ) => {
    vi.useFakeTimers();
    const upstream = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal("fetch", upstream);

    const pending = searchClinicalTrials({ query: "provider mapping" });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toMatchObject({
      provider: "clinicaltrials_gov",
      record_type: "clinical_trial_search_result",
      access_status: accessStatus,
      pagination: { page_size: 20, returned: 0, exhausted: false },
      error: { code, message, ...(status === 200 ? {} : { http_status: status }), retryable },
      data: []
    });
    expect(JSON.stringify(result)).not.toContain("provider-secret");
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
