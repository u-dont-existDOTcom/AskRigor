import type { readFile as ReadFile } from "node:fs/promises";

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { protocolReadFile } = vi.hoisted(() => ({
  protocolReadFile: vi.fn()
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: protocolReadFile };
});

import { getProtocolManifest } from "@askrigor/protocol";
import {
  fetchPubmedRecord,
  getYoutubeComments,
  resolveDoi,
  searchClinicalTrials,
  searchEuropePmc,
  searchPubmed
} from "../packages/sources/src/index.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";

const NCBI = {
  tool: "askrigor-regression-tests",
  email: "maintainer@example.test"
};
const CROSSREF = { mailto: "maintainer@example.test" };
const YOUTUBE = { apiKey: "recorded-youtube-key" };

let actualReadFile: typeof ReadFile;

beforeAll(async () => {
  actualReadFile = (
    await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")
  ).readFile;
});

beforeEach(() => {
  protocolReadFile.mockReset();
  protocolReadFile.mockImplementation(actualReadFile);
  resetClinicalTrialsFreshnessCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AskRigor cross-adapter regressions", () => {
  it("preserves stable indexed identifiers and complete search state across PubMed and Europe PMC", async () => {
    const [pubmedBody, europePmcBody] = await Promise.all([
      fixture("pubmed/esearch-page-1.json"),
      fixture("europe-pmc/search-page-1.json")
    ]);
    const requests: URL[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.hostname === "eutils.ncbi.nlm.nih.gov") {
        return new Response(pubmedBody, { status: 200 });
      }
      if (url.hostname === "www.ebi.ac.uk") {
        return new Response(europePmcBody, { status: 200 });
      }
      throw new Error(`Unexpected fixture request: ${url.hostname}${url.pathname}`);
    }));

    const [pubmed, europePmc] = await Promise.all([
      searchPubmed({ query: "example intervention", pageSize: 2 }, NCBI),
      searchEuropePmc({ query: "example intervention", pageSize: 2 })
    ]);

    expect(pubmed).toMatchObject({
      access_status: "complete",
      pagination: { returned: 2 },
      data: [{ pmid: "40123456" }, { pmid: "39876543" }]
    });
    expect(europePmc).toMatchObject({
      access_status: "complete",
      pagination: { returned: 2 },
      data: [
        { source: "MED", id: "40123456", pmid: "40123456" },
        { source: "PPR", id: "PPR987654" }
      ]
    });
    expect(europePmc.data[0]!.id).toBe(pubmed.data[0]!.pmid);
    expect(new Set(requests.map(({ hostname }) => hostname))).toEqual(new Set([
      "eutils.ncbi.nlm.nih.gov",
      "www.ebi.ac.uk"
    ]));
  });

  it("continues to ClinicalTrials.gov when PubMed returns a valid sparse result", async () => {
    const [pubmedBody, trialsBody, versionBody] = await Promise.all([
      fixture("pubmed/esearch-empty.json"),
      fixture("clinical-trials/search-page-1.json"),
      fixture("clinical-trials/version.json")
    ]);
    const requestPaths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      requestPaths.push(url.pathname);
      if (url.hostname === "eutils.ncbi.nlm.nih.gov") {
        return new Response(pubmedBody, { status: 200 });
      }
      if (url.pathname === "/api/v2/studies") {
        return new Response(trialsBody, { status: 200 });
      }
      if (url.pathname === "/api/v2/version") {
        return new Response(versionBody, { status: 200 });
      }
      throw new Error(`Unexpected fixture request: ${url.hostname}${url.pathname}`);
    }));

    const pubmed = await searchPubmed({ query: "neglected intervention", pageSize: 20 }, NCBI);
    expect(pubmed).toMatchObject({
      access_status: "complete",
      pagination: { returned: 0, exhausted: true },
      data: []
    });

    const trials = await searchClinicalTrials({
      query: "neglected intervention",
      pageSize: 1
    });

    expect(trials).toMatchObject({
      access_status: "complete",
      pagination: { returned: 1 },
      data: [{ nct_id: "NCT01234567" }]
    });
    expect(requestPaths).toEqual([
      "/entrez/eutils/esearch.fcgi",
      "/api/v2/studies",
      "/api/v2/version"
    ]);
  });

  it("exhausts YouTube top-level pages and independently reconciles every reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return youtubeFixtureResponse(url);
    }));

    const result = await getYoutubeComments({
      video: "XpZHKGGCK-o",
      pageSize: 100
    }, YOUTUBE);

    expect(result).toMatchObject({
      access_status: "api_visible_complete",
      pagination: { returned: 6, exhausted: true },
      data: {
        manifest: {
          top_level_comments_retrieved: 2,
          expected_replies: 4,
          replies_retrieved: 4,
          total_comments_and_replies: 6,
          reply_count_mismatches: [],
          pages: { comment_threads: 2, replies: 3 },
          extraction_coverage: "api_visible_complete"
        }
      }
    });
    expect(new Set(result.data.comments.map(({ comment_id }) => comment_id)).size)
      .toBe(result.data.comments.length);
    expect(result.data.comments.filter(({ is_reply }) => is_reply)).toHaveLength(4);
  });

  it("keeps abstract-limited, metadata-only, and inaccessible evidence below full-text completion", async () => {
    const [pubmedBody, crossrefBody] = await Promise.all([
      fixture("pubmed/efetch-record.xml"),
      fixture("crossref/work-no-marker.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.hostname === "eutils.ncbi.nlm.nih.gov") {
        return new Response(pubmedBody, { status: 200 });
      }
      if (url.hostname === "api.crossref.org") {
        return new Response(crossrefBody, { status: 200 });
      }
      if (url.hostname === "www.ebi.ac.uk") {
        return new Response("access denied", { status: 403 });
      }
      throw new Error(`Unexpected fixture request: ${url.hostname}${url.pathname}`);
    }));

    const pubmed = await fetchPubmedRecord("40123456", NCBI);
    const crossref = await resolveDoi("10.5555/no.marker", CROSSREF);
    const inaccessible = await searchEuropePmc({ query: "decision-critical source" });

    expect(pubmed.access_status).toBe("api_visible_complete");
    expect(pubmed.limitations).toContain(
      "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated."
    );
    expect(pubmed.data).not.toHaveProperty("full_text");
    expect(crossref).toMatchObject({
      access_status: "metadata_only",
      data: { resolved_doi: "10.5555/no.marker" }
    });
    expect(inaccessible).toMatchObject({
      access_status: "inaccessible",
      pagination: { returned: 0, exhausted: false },
      error: { code: "europe_pmc_access_denied" },
      data: []
    });
    expect([crossref.access_status, inaccessible.access_status])
      .not.toContain("complete");
  });

  it("derives a changed protocol version and SHA-256 solely from replacement XML bytes", async () => {
    const first = "<?xml version=\"1.0\"?><Protocol name=\"HRP\" version=\"fixture-1\" revisionDate=\"2026-08-10\"><Purpose>first fixture</Purpose></Protocol>";
    const second = "<?xml version=\"1.0\"?><Protocol name=\"HRP\" version=\"fixture-2\" revisionDate=\"2026-08-11\"><Purpose>second fixture</Purpose></Protocol>";
    protocolReadFile
      .mockResolvedValueOnce(Buffer.from(first, "utf8"))
      .mockResolvedValueOnce(Buffer.from(second, "utf8"));

    const before = await getProtocolManifest("hrp");
    const after = await getProtocolManifest("hrp");

    expect(before).toEqual({
      name: "HRP",
      version: "fixture-1",
      revisionDate: "2026-08-10",
      sha256: "dde479111c45ac20abf80a3a08f490f661bdf1b1b6529e735e3c4cdcc0a532b9"
    });
    expect(after).toEqual({
      name: "HRP",
      version: "fixture-2",
      revisionDate: "2026-08-11",
      sha256: "b2ce4dfa193a333788fcec2887a1b7632f7e72280dd972f4295625e73d72d66e"
    });
    expect(after.sha256).not.toBe(before.sha256);
  });
});

async function fixture(relativePath: string): Promise<string> {
  return actualReadFile(new URL(`fixtures/${relativePath}`, import.meta.url), "utf8");
}

async function youtubeFixtureResponse(url: URL): Promise<Response> {
  if (url.pathname.endsWith("/commentThreads")) {
    return new Response(await fixture(
      url.searchParams.has("pageToken")
        ? "youtube/comment-threads-page-2.json"
        : "youtube/comment-threads-page-1.json"
    ), { status: 200 });
  }

  if (url.pathname.endsWith("/comments")) {
    const parentId = url.searchParams.get("parentId");
    if (parentId === "UgxTop00000000000000001") {
      return new Response(await fixture(
        url.searchParams.has("pageToken")
          ? "youtube/comments-top-1-page-2.json"
          : "youtube/comments-top-1-page-1.json"
      ), { status: 200 });
    }
    if (parentId === "UgxTop00000000000000002") {
      return new Response(await fixture("youtube/comments-top-2-page-1.json"), {
        status: 200
      });
    }
  }

  throw new Error(`Unexpected YouTube fixture request: ${url.pathname}${url.search}`);
}
