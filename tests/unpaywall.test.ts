import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveUnpaywallOpenAccess } from "../packages/sources/src/index.js";

const DOI = "10.1234/fixture.study";
const CONFIG = { email: "research-service@example.org" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const location = {
    host_type: "repository",
    is_best: true,
    license: "cc-by",
    repository_institution: "Fixture Repository",
    url: "https://repository.example.org/record/123",
    url_for_landing_page: "https://repository.example.org/record/123",
    url_for_pdf: "https://repository.example.org/record/123/file.pdf",
    version: "acceptedVersion"
  };
  return {
    doi: DOI,
    doi_url: `https://doi.org/${DOI}`,
    title: "Fixture controlled study",
    is_oa: true,
    oa_status: "green",
    has_repository_copy: true,
    updated: "2026-08-20T12:00:00Z",
    best_oa_location: location,
    oa_locations: [location],
    ...overrides
  };
}

describe("Unpaywall open-access resolution", () => {
  it("returns a versioned open-location lead without claiming full-text retrieval", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify(record()), { status: 200 });
    }));

    const result = await resolveUnpaywallOpenAccess(
      `https://doi.org/${DOI.toUpperCase()}`,
      CONFIG
    );

    expect(result).toMatchObject({
      provider: "unpaywall",
      record_type: "open_access_location_resolution",
      primary_identifier: DOI,
      access_status: "metadata_only",
      pagination: { returned: 1, exhausted: true },
      source_identity: {
        canonical_url: `https://doi.org/${DOI}`,
        title: "Fixture controlled study"
      },
      data: {
        doi: DOI,
        is_oa: true,
        oa_status: "green",
        full_text_lead_status: "open_location_available",
        best_location: {
          host_type: "repository",
          version: "acceptedVersion",
          license: "cc-by",
          candidate_full_text_url: "https://repository.example.org/record/123/file.pdf",
          transport: "https"
        }
      }
    });
    expect(result.limitations.join(" ")).toContain("not yet fetched");
    expect(requests).toHaveLength(1);
    const requestUrl = new URL(requests[0]!.url);
    expect(requestUrl.origin).toBe("https://api.unpaywall.org");
    expect(decodeURIComponent(requestUrl.pathname)).toBe(`/v2/${DOI}`);
    expect(requestUrl.searchParams.get("email")).toBe(CONFIG.email);
    expect(new Headers(requests[0]!.init?.headers).get("accept")).toBe("application/json");
  });

  it("preserves a closed record as a possibly useful lead", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(record({
      is_oa: false,
      oa_status: "closed",
      has_repository_copy: false,
      best_oa_location: null,
      oa_locations: []
    })), { status: 200 })));

    const result = await resolveUnpaywallOpenAccess(DOI, CONFIG);

    expect(result).toMatchObject({
      access_status: "metadata_only",
      data: {
        full_text_lead_status: "no_open_location_found",
        is_oa: false,
        oa_locations: []
      }
    });
    expect(result.limitations.join(" ")).toContain("possibly useful research lead");
  });

  it("rejects mismatched DOI metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(record({
      doi: "10.1234/different.study"
    })), { status: 200 })));

    const result = await resolveUnpaywallOpenAccess(DOI, CONFIG);

    expect(result).toMatchObject({
      access_status: "error",
      error: {
        code: "unpaywall_response_invalid",
        retryable: false
      },
      data: {}
    });
  });

  it("keeps an unknown DOI as an unresolved lead without provider body leakage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { reason: "private-provider-detail" }
    }), { status: 404 })));

    const result = await resolveUnpaywallOpenAccess(DOI, CONFIG);

    expect(result).toMatchObject({
      access_status: "not_found",
      error: {
        code: "unpaywall_doi_not_found",
        http_status: 404,
        retryable: false
      }
    });
    expect(JSON.stringify(result)).not.toContain("private-provider-detail");
  });

  it("does not call the provider with invalid service contact configuration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveUnpaywallOpenAccess(DOI, { email: "not-an-email" });

    expect(result.error?.code).toBe("unpaywall_configuration_invalid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
