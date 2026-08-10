import type { readFile as ReadFile } from "node:fs/promises";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
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
  resolveDoi,
  searchClinicalTrials,
  searchEuropePmc,
  searchPubmed
} from "../packages/sources/src/index.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
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

  it("carries a discovered YouTube video through MCP metadata and complete comment reconciliation", async () => {
    const machine = await createYoutubeFlowMachine();
    const previousApiKey = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = YOUTUBE.apiKey;
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      machine.respond(new URL(String(input)))
    ));
    const server = createAskRigorServer();
    const client = new Client({ name: "askrigor-regression", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const search = await client.callTool({
        name: "search_youtube",
        arguments: { query: "recorded subject", page_size: 1 }
      });
      expect(search).toMatchObject({
        structuredContent: {
          provider: "youtube",
          record_type: "youtube_search_result",
          access_status: "complete",
          data: [{ video_id: "XpZHKGGCK-o" }]
        }
      });
      const discoveredId = (
        search.structuredContent as { data: Array<{ video_id: string }> }
      ).data[0]!.video_id;

      const video = await client.callTool({
        name: "get_youtube_video",
        arguments: { video_id_or_url: discoveredId }
      });
      expect(video).toMatchObject({
        structuredContent: {
          provider: "youtube",
          record_type: "youtube_video",
          primary_identifier: "XpZHKGGCK-o",
          access_status: "api_visible_complete",
          data: { video_id: "XpZHKGGCK-o", privacy_status: "public" }
        }
      });
      const verifiedId = (
        video.structuredContent as { data: { video_id: string } }
      ).data.video_id;

      const comments = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: verifiedId }
      });
      expect(comments).toMatchObject({
        structuredContent: {
          provider: "youtube",
          record_type: "youtube_comments",
          access_status: "api_visible_complete",
          pagination: { returned: 6, exhausted: true },
          data: {
            manifest: {
              video_id: "XpZHKGGCK-o",
              top_level_comments_retrieved: 2,
              expected_replies: 4,
              replies_retrieved: 4,
              total_comments_and_replies: 6,
              reply_count_mismatches: [],
              pages: { comment_threads: 2, replies: 3 },
              extraction_coverage: "api_visible_complete"
            }
          }
        }
      });
      const commentRows = (
        comments.structuredContent as {
          data: {
            comments: Array<{
              comment_id: string;
              parent_id: string | null;
              is_reply: boolean;
            }>;
          };
        }
      ).data.comments;
      expect(commentRows.filter(({ is_reply }) => !is_reply).map(({ comment_id }) => comment_id))
        .toEqual(["UgxTop00000000000000001", "UgxTop00000000000000002"]);
      expect(commentRows.filter(({ is_reply }) => is_reply).map(({ comment_id, parent_id }) =>
        `${parent_id}:${comment_id}`
      ).sort()).toEqual([
        "UgxTop00000000000000001:UgxReply0000000000000001",
        "UgxTop00000000000000001:UgxReply0000000000000002",
        "UgxTop00000000000000001:UgxReply0000000000000003",
        "UgxTop00000000000000002:UgxReply0000000000000004"
      ]);
      expect(machine.completedSteps()).toEqual([
        "search:recorded subject",
        "video:XpZHKGGCK-o",
        "threads:XpZHKGGCK-o:first",
        "threads:XpZHKGGCK-o:thread-page-2",
        "replies:UgxTop00000000000000001:first",
        "replies:UgxTop00000000000000001:reply-top-1-page-2",
        "replies:UgxTop00000000000000002:first"
      ]);
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previousApiKey);
      await client.close();
      await server.close();
    }
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

interface YoutubeFlowStep {
  label: string;
  path: string;
  params: Record<string, string>;
  body: string;
}

interface YoutubeFlowMachine {
  respond(url: URL): Response;
  completedSteps(): string[];
}

async function createYoutubeFlowMachine(): Promise<YoutubeFlowMachine> {
  const [
    searchBody,
    videoBody,
    threadsPageOne,
    threadsPageTwo,
    firstParentPageOne,
    firstParentPageTwo,
    secondParentPageOne
  ] = await Promise.all([
    fixture("youtube/search-page-1.json"),
    fixture("youtube/video-found.json"),
    fixture("youtube/comment-threads-page-1.json"),
    fixture("youtube/comment-threads-page-2.json"),
    fixture("youtube/comments-top-1-page-1.json"),
    fixture("youtube/comments-top-1-page-2.json"),
    fixture("youtube/comments-top-2-page-1.json")
  ]);
  const commonCommentParams = {
    key: YOUTUBE.apiKey,
    maxResults: "100",
    textFormat: "plainText"
  };
  const steps: YoutubeFlowStep[] = [
    {
      label: "search:recorded subject",
      path: "/youtube/v3/search",
      params: {
        key: YOUTUBE.apiKey,
        maxResults: "1",
        part: "snippet",
        q: "recorded subject",
        type: "video"
      },
      body: searchBody
    },
    {
      label: "video:XpZHKGGCK-o",
      path: "/youtube/v3/videos",
      params: {
        id: "XpZHKGGCK-o",
        key: YOUTUBE.apiKey,
        part: "snippet,contentDetails,statistics,status"
      },
      body: videoBody
    },
    {
      label: "threads:XpZHKGGCK-o:first",
      path: "/youtube/v3/commentThreads",
      params: {
        ...commonCommentParams,
        order: "time",
        part: "snippet,replies",
        videoId: "XpZHKGGCK-o"
      },
      body: threadsPageOne
    },
    {
      label: "threads:XpZHKGGCK-o:thread-page-2",
      path: "/youtube/v3/commentThreads",
      params: {
        ...commonCommentParams,
        order: "time",
        pageToken: "thread-page-2",
        part: "snippet,replies",
        videoId: "XpZHKGGCK-o"
      },
      body: threadsPageTwo
    },
    {
      label: "replies:UgxTop00000000000000001:first",
      path: "/youtube/v3/comments",
      params: {
        ...commonCommentParams,
        parentId: "UgxTop00000000000000001",
        part: "snippet"
      },
      body: firstParentPageOne
    },
    {
      label: "replies:UgxTop00000000000000001:reply-top-1-page-2",
      path: "/youtube/v3/comments",
      params: {
        ...commonCommentParams,
        pageToken: "reply-top-1-page-2",
        parentId: "UgxTop00000000000000001",
        part: "snippet"
      },
      body: firstParentPageTwo
    },
    {
      label: "replies:UgxTop00000000000000002:first",
      path: "/youtube/v3/comments",
      params: {
        ...commonCommentParams,
        parentId: "UgxTop00000000000000002",
        part: "snippet"
      },
      body: secondParentPageOne
    }
  ];
  const completed: string[] = [];

  return {
    respond(url) {
      const expected = steps[completed.length];
      if (expected === undefined) {
        throw new Error(`Unexpected extra YouTube request: ${url.pathname}${url.search}`);
      }
      const sortParams = ([leftKey, leftValue]: [string, string], [rightKey, rightValue]: [string, string]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue);
      const actualParams = [...url.searchParams.entries()].sort(sortParams);
      const expectedParams = Object.entries(expected.params).sort(sortParams);
      if (
        url.origin !== "https://www.googleapis.com" ||
        url.pathname !== expected.path ||
        JSON.stringify(actualParams) !== JSON.stringify(expectedParams)
      ) {
        throw new Error(
          `YouTube flow step ${expected.label} received ${url.pathname}${url.search}`
        );
      }
      completed.push(expected.label);
      return new Response(expected.body, { status: 200 });
    },
    completedSteps: () => [...completed]
  };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
