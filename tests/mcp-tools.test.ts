import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import type { IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAskRigorHttpServer,
  createAskRigorServer
} from "../apps/research-mcp/src/server.js";
import { resetClinicalTrialsFreshnessCacheForTests } from "../packages/sources/src/clinical-trials.js";

const TOOL_NAMES = [
  "get_protocol_manifest",
  "load_protocol",
  "verify_protocol_integrity",
  "search_pubmed",
  "fetch_pubmed_record",
  "search_europe_pmc",
  "search_clinical_trials",
  "fetch_clinical_trial",
  "resolve_doi",
  "check_retraction_status",
  "search_youtube",
  "get_youtube_video",
  "get_youtube_comments",
  "search_youtube_comments"
];

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false
};

const clients: Client[] = [];
const clinicalFixture = (name: string) =>
  readFile(new URL(`fixtures/clinical-trials/${name}`, import.meta.url), "utf8");
const youtubeFixture = (name: string) =>
  readFile(new URL(`fixtures/youtube/${name}`, import.meta.url), "utf8");

afterEach(async () => {
  resetClinicalTrialsFreshnessCacheForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("AskRigor MCP tools", () => {
  it("registers exactly the fourteen read-only retrieval tools", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();

      expect(tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
      expect(tools.map(({ annotations }) => annotations)).toEqual(
        TOOL_NAMES.map(() => READ_ONLY_ANNOTATIONS)
      );
      expect(tools.every(({ inputSchema, outputSchema }) =>
        inputSchema.type === "object" && outputSchema?.type === "object"
      )).toBe(true);
    } finally {
      await server.close();
    }
  });

  it("publishes strict, retrieval-only YouTube discovery schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_youtube");
      const video = tools.find(({ name }) => name === "get_youtube_video");

      expect(search).toMatchObject({
        description: "Search YouTube videos and return API-visible metadata with explicit pagination and access state; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1, maxLength: 5000 },
            page_size: { type: "integer", minimum: 1, maximum: 50 },
            cursor: { type: "string", minLength: 1, maxLength: 4096 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(video).toMatchObject({
        description: "Retrieve one API-visible YouTube video by supported ID or URL without interpreting its content or making medical conclusions.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url"],
          additionalProperties: false,
          properties: { video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 } }
        },
        outputSchema: { type: "object" }
      });
      expect(search!.outputSchema.properties.data).toMatchObject({
        type: "array",
        maxItems: 50
      });
      expect(search!.outputSchema.properties.data.items).toMatchObject({
        type: "object",
        additionalProperties: false
      });
      expect(search!.outputSchema.properties.data.items.properties).toMatchObject({
        video_id: { type: "string", pattern: "^[A-Za-z0-9_-]{11}$" },
        channel_id: { type: "string", pattern: "^UC[A-Za-z0-9_-]{22}$" },
        title: { type: "string", minLength: 1, maxLength: 10000 },
        description: { type: "string", maxLength: 100000 },
        published_at: { type: "string", pattern: expect.any(String) }
      });
      const videoDataVariants = video!.outputSchema.properties.data.anyOf;
      expect(videoDataVariants).toHaveLength(2);
      expect(videoDataVariants[0]).toMatchObject({
        type: "object",
        required: ["video_id"]
      });
      expect(videoDataVariants[0].properties.duration).toMatchObject({ type: "string", pattern: expect.any(String) });
      expect(videoDataVariants[0].properties.video_id).toMatchObject({ pattern: "^[A-Za-z0-9_-]{11}$" });
      expect(videoDataVariants[0].properties.statistics.properties.view_count).toMatchObject({ pattern: "^\\d+$" });
      expect(videoDataVariants[0].properties.published_at).toMatchObject({ pattern: expect.any(String) });
      expect(videoDataVariants[0].properties.live_broadcast_content).toMatchObject({ enum: ["none", "live", "upcoming"] });
      expect(videoDataVariants[0].properties.privacy_status).toMatchObject({ enum: ["public", "private", "unlisted"] });
      expect(videoDataVariants[1]).toMatchObject({
        type: "object",
        additionalProperties: false
      });
    } finally {
      await server.close();
    }
  });

  it("returns a deterministic missing-key YouTube MCP error before an upstream request", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.YOUTUBE_API_KEY;

    try {
      const result = await client.callTool({
        name: "search_youtube",
        arguments: { query: "recorded subject" }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube search returned 0 video record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_search_result",
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
        data: []
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns the same deterministic missing-key envelope for YouTube video retrieval", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.YOUTUBE_API_KEY;

    try {
      const result = await client.callTool({
        name: "get_youtube_video",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube video retrieval finished with access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_video",
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing", message: "YouTube API key is not configured" },
        data: {}
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns deterministic structured YouTube search and video successes through MCP", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    const [searchBody, videoBody] = await Promise.all([
      youtubeFixture("search-page-1.json"),
      youtubeFixture("video-found.json")
    ]);
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return new Response(url.pathname.endsWith("/search") ? searchBody : videoBody, { status: 200 });
    }));

    try {
      const search = await client.callTool({
        name: "search_youtube",
        arguments: { query: "recorded subject", page_size: 1 }
      });
      const video = await client.callTool({
        name: "get_youtube_video",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(search.isError).not.toBe(true);
      expect(search.content).toEqual([{
        type: "text",
        text: "YouTube search returned 1 video record(s); access status complete."
      }]);
      expect(search.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_search_result",
        access_status: "complete",
        data: [{ video_id: "XpZHKGGCK-o", published_at: "2025-01-02T03:04:05Z" }]
      });
      expect(video.isError).not.toBe(true);
      expect(video.content).toEqual([{
        type: "text",
        text: "YouTube video retrieval finished with access status api_visible_complete."
      }]);
      expect(video.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_video",
        access_status: "api_visible_complete",
        data: { video_id: "XpZHKGGCK-o", duration: "PT12M34S", privacy_status: "public" }
      });
      expect(JSON.stringify([search, video])).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("publishes strict, source-aligned retrieval-only YouTube comment schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const getComments = tools.find(({ name }) => name === "get_youtube_comments");
      const searchComments = tools.find(({ name }) => name === "search_youtube_comments");

      expect(getComments).toMatchObject({
        description: "Retrieve all API-visible YouTube top-level comments and, by default, every independently paginated reply with explicit completeness accounting; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url"],
          additionalProperties: false,
          properties: {
            video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 },
            include_replies: { type: "boolean", default: true },
            cursor: { type: "string", minLength: 1, maxLength: 4096 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(searchComments).toMatchObject({
        description: "Retrieve a query-bounded API-visible YouTube comment-thread subset and independently paginate replies with explicit partial coverage; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["video_id_or_url", "query"],
          additionalProperties: false,
          properties: {
            video_id_or_url: { type: "string", minLength: 1, maxLength: 2048 },
            query: { type: "string", minLength: 1, maxLength: 5000 },
            include_replies: { type: "boolean", default: true },
            cursor: { type: "string", minLength: 1, maxLength: 4096 }
          }
        },
        outputSchema: { type: "object" }
      });

      for (const tool of [getComments!, searchComments!]) {
        const commentData = tool.outputSchema.properties.data.anyOf[0];
        expect(commentData).toMatchObject({
          type: "object",
          required: ["comments", "manifest"],
          additionalProperties: false
        });
        expect(commentData.properties.comments.items).toMatchObject({
          type: "object",
          required: [
            "video_id", "comment_id", "parent_id", "top_level_comment_id",
            "is_reply", "text", "like_count", "published_at", "updated_at"
          ],
          additionalProperties: false
        });
        expect(commentData.properties.manifest).toMatchObject({
          type: "object",
          required: [
            "video_id", "top_level_comments_retrieved", "expected_replies",
            "replies_retrieved", "total_comments_and_replies",
            "reply_count_mismatches", "pages", "extraction_coverage"
          ],
          additionalProperties: false
        });
      }
    } finally {
      await server.close();
    }
  });

  it("returns a complete reconciled YouTube comment manifest through MCP", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) =>
      mcpCompleteCommentResponse(new URL(String(input)))
    ));

    try {
      const result = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 6 comment/reply record(s); access status api_visible_complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "youtube",
        record_type: "youtube_comments",
        access_status: "api_visible_complete",
        data: {
          manifest: {
            expected_replies: 4,
            replies_retrieved: 4,
            reply_count_mismatches: [],
            extraction_coverage: "api_visible_complete"
          }
        }
      });
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns targeted YouTube comment search as query-bounded partial without isError", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/commentThreads")
        ? new Response(await youtubeFixture("comment-threads-query.json"), { status: 200 })
        : new Response(await youtubeFixture("comments-query-parent.json"), { status: 200 });
    }));

    try {
      const result = await client.callTool({
        name: "search_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o", query: "recorded episode" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube targeted comment retrieval returned 2 comment/reply record(s); access status partial."
      }]);
      expect(result.structuredContent).toMatchObject({
        query: { query: "recorded episode" },
        access_status: "partial",
        data: { manifest: { extraction_coverage: "partial" } }
      });
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("returns deterministic comments-disabled and missing-key MCP errors", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;

    try {
      delete process.env.YOUTUBE_API_KEY;
      const missingKey = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });
      expect(missingKey.isError).toBe(true);
      expect(missingKey.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 0 comment/reply record(s); access status inaccessible."
      }]);
      expect(missingKey.structuredContent).toMatchObject({
        access_status: "inaccessible",
        error: { code: "youtube_api_key_missing" },
        data: {}
      });

      process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
      vi.stubGlobal("fetch", vi.fn(async () => new Response(
        await youtubeFixture("error-comments-disabled.json"), { status: 403 }
      )));
      const disabled = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });
      expect(disabled.isError).toBe(true);
      expect(disabled.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 0 comment/reply record(s); access status comments_disabled."
      }]);
      expect(disabled.structuredContent).toMatchObject({
        access_status: "comments_disabled",
        error: { code: "youtube_comments_disabled", message: "YouTube comments are disabled" }
      });
      expect(JSON.stringify(disabled)).not.toContain("provider-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("marks a mid-pagination YouTube MCP failure partial and never leaks raw provider details", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.YOUTUBE_API_KEY;
    process.env.YOUTUBE_API_KEY = "mcp-youtube-secret";
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/comments") && url.searchParams.has("pageToken")) {
        return new Response(await youtubeFixture("error-access-denied.json"), { status: 403 });
      }
      return mcpCompleteCommentResponse(url);
    }));

    try {
      const result = await client.callTool({
        name: "get_youtube_comments",
        arguments: { video_id_or_url: "XpZHKGGCK-o" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "YouTube comment retrieval returned 5 comment/reply record(s); access status partial."
      }]);
      expect(result.structuredContent).toMatchObject({
        access_status: "partial",
        error: { code: "youtube_access_denied", message: "YouTube access denied" },
        data: { manifest: { extraction_coverage: "partial" } }
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret-mid-pagination");
      expect(JSON.stringify(result)).not.toContain("mcp-youtube-secret");
    } finally {
      restoreEnvironment("YOUTUBE_API_KEY", previous);
      await server.close();
    }
  });

  it("publishes strict, retrieval-only DOI and retraction schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const resolve = tools.find(({ name }) => name === "resolve_doi");
      const retraction = tools.find(({ name }) => name === "check_retraction_status");

      expect(resolve).toMatchObject({
        description: "Resolve a DOI or bibliographic citation through Crossref metadata; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["doi_or_citation"],
          additionalProperties: false,
          properties: { doi_or_citation: { type: "string", minLength: 1, maxLength: 5000 } }
        },
        outputSchema: { type: "object" }
      });
      expect(retraction).toMatchObject({
        description: "Check traceable Crossref update metadata for a DOI without inferring validity, safety, or medical conclusions.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["identifier"],
          additionalProperties: false,
          properties: { identifier: { type: "string", minLength: 1, maxLength: 5000 } }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("returns a valid structured DOI resolution through the real in-memory MCP boundary", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const body = await readFile(new URL(
      "fixtures/crossref/work-no-marker.json",
      import.meta.url
    ), "utf8");
    process.env.CROSSREF_MAILTO = "mcp-maintainer@example.test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    try {
      const result = await client.callTool({
        name: "resolve_doi",
        arguments: { doi_or_citation: "10.5555/no.marker" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Crossref DOI resolution finished with access status metadata_only."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "crossref",
        record_type: "doi_resolution",
        primary_identifier: "10.5555/no.marker",
        access_status: "metadata_only",
        data: {
          resolved_doi: "10.5555/no.marker",
          candidates: [{ doi: "10.5555/no.marker" }]
        }
      });
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("returns a conservative retraction envelope as an MCP error when Crossref fails", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 503 })));
    process.env.CROSSREF_MAILTO = "maintainer@example.test";

    try {
      const result = await client.callTool({
        name: "check_retraction_status",
        arguments: { identifier: "10.0000/unresolvable" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Crossref retraction-status lookup finished with status unknown; access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "crossref",
        record_type: "retraction_status",
        access_status: "error",
        data: { status: "unknown", evidence: [], sources_checked: ["crossref"] },
        error: { code: "crossref_upstream_unavailable" }
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("requires CROSSREF_MAILTO and sends it only to Crossref", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const requests: Array<{ url: URL; userAgent: string | null }> = [];
    const body = await readFile(new URL("fixtures/crossref/work-no-marker.json", import.meta.url), "utf8");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), userAgent: new Headers(init?.headers).get("user-agent") });
      return new Response(body, { status: 200 });
    }));
    process.env.CROSSREF_MAILTO = "mcp-maintainer@example.test";

    try {
      const result = await client.callTool({ name: "check_retraction_status", arguments: { identifier: "10.5555/no.marker" } });
      expect(result.isError).not.toBe(true);
      expect(requests).toEqual([{
        url: expect.objectContaining({ pathname: "/works/10.5555%2Fno.marker" }),
        userAgent: "askrigor-research/0.1.0 (mailto:mcp-maintainer@example.test)"
      }]);
      expect(requests[0]!.url.searchParams.get("mailto")).toBe("mcp-maintainer@example.test");
      expect(JSON.stringify(result)).not.toContain("mcp-maintainer@example.test");
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("returns a structured Crossref error without a request when CROSSREF_MAILTO is absent", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = process.env.CROSSREF_MAILTO;
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    delete process.env.CROSSREF_MAILTO;

    try {
      const result = await client.callTool({ name: "check_retraction_status", arguments: { identifier: "10.5555/no.marker" } });
      expect(upstream).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        data: { status: "unknown", evidence: [] },
        error: { code: "crossref_configuration_invalid" }
      });
    } finally {
      restoreEnvironment("CROSSREF_MAILTO", previous);
      await server.close();
    }
  });

  it("publishes bounded PubMed input schemas and retrieval-only descriptions", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_pubmed")!;
      const fetchRecord = tools.find(({ name }) => name === "fetch_pubmed_record")!;

      expect(search.description).toBe(
        "Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated."
      );
      expect(search.inputSchema).toMatchObject({
        type: "object",
        required: ["query"],
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1 },
          page_size: { type: "integer", minimum: 1 },
          cursor: { type: "string", minLength: 1 },
          date_range: {
            type: "object",
            required: ["start", "end"],
            additionalProperties: false
          }
        }
      });
      expect(fetchRecord.description).toBe(
        "Retrieve one PubMed citation by PMID, preserving only metadata PubMed supplies and making no full-text or medical inference."
      );
      expect(fetchRecord.inputSchema).toMatchObject({
        type: "object",
        required: ["pmid"],
        additionalProperties: false,
        properties: {
          pmid: { type: "string", pattern: "^[1-9]\\d{0,15}$" }
        }
      });
      expect(search.outputSchema).toMatchObject({ type: "object" });
      expect(fetchRecord.outputSchema).toMatchObject({ type: "object" });
    } finally {
      await server.close();
    }
  });

  it("publishes a bounded read-only Europe PMC search schema", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_europe_pmc");

      expect(search).toMatchObject({
        description:
          "Search Europe PMC records while preserving provider source identifiers and cursors with explicit pagination and access state; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            cursor: { type: "string", minLength: 1 },
            date_range: {
              type: "object",
              required: ["start", "end"],
              additionalProperties: false
            }
          }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("publishes bounded ClinicalTrials.gov search and study retrieval schemas", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const { tools } = await client.listTools();
      const search = tools.find(({ name }) => name === "search_clinical_trials");
      const fetchStudy = tools.find(({ name }) => name === "fetch_clinical_trial");

      expect(search).toMatchObject({
        description:
          "Search ClinicalTrials.gov studies with provider pagination and explicit access state; no medical conclusions are generated.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["query"],
          additionalProperties: false,
          properties: {
            query: { type: "string", minLength: 1 },
            page_size: { type: "integer", minimum: 1, maximum: 100 },
            page_token: { type: "string", minLength: 1 }
          }
        },
        outputSchema: { type: "object" }
      });
      expect(fetchStudy).toMatchObject({
        description:
          "Retrieve one ClinicalTrials.gov study by NCT ID, preserving supplied metadata without medical inference.",
        annotations: READ_ONLY_ANNOTATIONS,
        inputSchema: {
          type: "object",
          required: ["nct_id"],
          additionalProperties: false,
          properties: { nct_id: { type: "string", pattern: "^NCT\\d{8}$" } }
        },
        outputSchema: { type: "object" }
      });
    } finally {
      await server.close();
    }
  });

  it("returns deterministic structured PubMed search results without exposing the API key", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/pubmed/esearch-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: {
          query: "example intervention[Title/Abstract]",
          page_size: 2
        }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed search returned 2 PMID record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "complete",
        data: [{ pmid: "40123456" }, { pmid: "39876543" }]
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("returns a normalized Europe PMC envelope with provider identifiers and cursor", async () => {
    const { client, server } = await createInMemoryClient();
    const body = await readFile(
      new URL("fixtures/europe-pmc/search-page-1.json", import.meta.url),
      "utf8"
    );
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "example intervention", page_size: 2 }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Europe PMC search returned 2 record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "complete",
        pagination: {
          next_cursor: "AoIIQHNhbXBsZS1uZXh0LWN1cnNvcg=="
        },
        data: [
          { source: "MED", id: "40123456" },
          { source: "PPR", id: "PPR987654" }
        ]
      });
      expect(JSON.stringify(result)).not.toContain("https://www.ebi.ac.uk");
    } finally {
      await server.close();
    }
  });

  it("marks Europe PMC provider failures as MCP tool errors", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider detail", {
      status: 403
    })));

    try {
      const result = await client.callTool({
        name: "search_europe_pmc",
        arguments: { query: "restricted record" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "Europe PMC search returned 0 record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "europe_pmc",
        record_type: "europe_pmc_search_result",
        access_status: "inaccessible",
        error: {
          code: "europe_pmc_access_denied",
          message: "Europe PMC access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("provider detail");
    } finally {
      await server.close();
    }
  });

  it("marks a normalized PubMed provider failure as an MCP tool error", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret-detail", {
      status: 403
    })));
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    process.env.NCBI_EMAIL = "maintainer@example.test";
    process.env.NCBI_API_KEY = "mcp-secret-value";

    try {
      const result = await client.callTool({
        name: "search_pubmed",
        arguments: { query: "restricted citation" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed search returned 0 PMID record(s); access status inaccessible."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_search_result",
        access_status: "inaccessible",
        pagination: { returned: 0, exhausted: false },
        error: {
          code: "pubmed_access_denied",
          message: "PubMed access denied",
          http_status: 403,
          retryable: false
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("mcp-secret-value");
      expect(JSON.stringify(result)).not.toContain("provider-secret-detail");
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("normalizes configuration failures into deterministic PubMed error envelopes", async () => {
    const { client, server } = await createInMemoryClient();
    const previous = {
      tool: process.env.NCBI_TOOL,
      email: process.env.NCBI_EMAIL,
      apiKey: process.env.NCBI_API_KEY
    };
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    process.env.NCBI_TOOL = "askrigor-mcp-tests";
    delete process.env.NCBI_EMAIL;
    delete process.env.NCBI_API_KEY;

    try {
      const result = await client.callTool({
        name: "fetch_pubmed_record",
        arguments: { pmid: "40123456" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "PubMed record 40123456 retrieval failed; access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "pubmed",
        record_type: "pubmed_record",
        primary_identifier: "40123456",
        access_status: "error",
        pagination: { returned: 0, exhausted: false },
        limitations: [
          "PubMed EFetch returns indexed citation metadata and abstracts when present; full-text availability was not evaluated."
        ],
        error: {
          code: "pubmed_configuration_failed",
          message: "PubMed configuration failed",
          retryable: false
        },
        data: {}
      });
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("NCBI_TOOL", previous.tool);
      restoreEnvironment("NCBI_EMAIL", previous.email);
      restoreEnvironment("NCBI_API_KEY", previous.apiKey);
      await server.close();
    }
  });

  it("returns a deterministic normalized ClinicalTrials.gov search result without provider URLs or bodies", async () => {
    const { client, server } = await createInMemoryClient();
    const [searchBody, versionBody] = await Promise.all([
      clinicalFixture("search-page-1.json"),
      clinicalFixture("version.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      return new Response(request.pathname === "/api/v2/version" ? versionBody : searchBody, {
        status: 200
      });
    }));

    try {
      const result = await client.callTool({
        name: "search_clinical_trials",
        arguments: { query: "example intervention", page_size: 1 }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov search returned 1 study record(s); access status complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial_search_result",
        access_status: "complete",
        pagination: { next_cursor: "provider-token+/opaque" },
        data: [{ nct_id: "NCT01234567" }]
      });
      expect(JSON.stringify(result)).not.toContain("https://clinicaltrials.gov");
    } finally {
      await server.close();
    }
  });

  it("marks a ClinicalTrials.gov not_found retrieval as an MCP tool error without leaking a provider body", async () => {
    const { client, server } = await createInMemoryClient();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 404 })));

    try {
      const result = await client.callTool({
        name: "fetch_clinical_trial",
        arguments: { nct_id: "NCT99999999" }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov study NCT99999999 retrieval finished with access status not_found."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial",
        primary_identifier: "NCT99999999",
        access_status: "not_found",
        error: {
          code: "clinical_trial_not_found",
          message: "ClinicalTrials.gov study not found",
          http_status: 404,
          retryable: false
        },
        data: {}
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      await server.close();
    }
  });

  it("returns a deterministic normalized ClinicalTrials.gov study retrieval result", async () => {
    const { client, server } = await createInMemoryClient();
    const [studyBody, versionBody] = await Promise.all([
      clinicalFixture("study-NCT01234567.json"),
      clinicalFixture("version.json")
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: URL | RequestInfo) => {
      const request = new URL(String(input));
      return new Response(request.pathname === "/api/v2/version" ? versionBody : studyBody, {
        status: 200
      });
    }));

    try {
      const result = await client.callTool({
        name: "fetch_clinical_trial",
        arguments: { nct_id: "NCT01234567" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov study NCT01234567 retrieval finished with access status api_visible_complete."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial",
        primary_identifier: "NCT01234567",
        access_status: "api_visible_complete",
        data: { nct_id: "NCT01234567" }
      });
      expect(JSON.stringify(result)).not.toContain("https://clinicaltrials.gov");
    } finally {
      await server.close();
    }
  });

  it("marks a ClinicalTrials.gov upstream failure as an MCP tool error", async () => {
    const { client, server } = await createInMemoryClient();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("provider-secret", { status: 503 })));

    try {
      const pending = client.callTool({
        name: "search_clinical_trials",
        arguments: { query: "upstream failure" }
      });
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([{
        type: "text",
        text: "ClinicalTrials.gov search returned 0 study record(s); access status error."
      }]);
      expect(result.structuredContent).toMatchObject({
        provider: "clinicaltrials_gov",
        record_type: "clinical_trial_search_result",
        access_status: "error",
        error: {
          code: "clinical_trials_upstream_unavailable",
          message: "ClinicalTrials.gov upstream service unavailable",
          http_status: 503,
          retryable: true
        },
        data: []
      });
      expect(JSON.stringify(result)).not.toContain("provider-secret");
    } finally {
      await server.close();
    }
  });

  it("returns the complete canonical protocol in structured content", async () => {
    const { client, server } = await createInMemoryClient();
    const canonicalText = await readFile(
      new URL("../protocols/HRP_Full.xml", import.meta.url),
      "utf8"
    );

    try {
      const result = await client.callTool({
        name: "load_protocol",
        arguments: { protocol: "hrp" }
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Loaded the complete canonical HRP protocol."
        }
      ]);
      expect(result.structuredContent).toMatchObject({
        ok: true,
        protocol: "hrp",
        manifest: {
          name: "HRP",
          version: "20.5.15",
          revisionDate: "2026-08-10",
          sha256: "a61181bb9325b84b542decf8795703f62bac880fa1e60bbeeb89051d874f61f0"
        },
        text: canonicalText
      });
    } finally {
      await server.close();
    }
  });

  it("surfaces integrity failures as explicit structured tool errors", async () => {
    const { client, server } = await createInMemoryClient();

    try {
      const result = await client.callTool({
        name: "verify_protocol_integrity",
        arguments: {
          protocol: "hrp",
          expected_sha256: "0".repeat(64)
        }
      });

      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Protocol operation failed: Protocol SHA-256 mismatch"
        }
      ]);
      expect(result.structuredContent).toEqual({
        ok: false,
        protocol: "hrp",
        error: {
          code: "protocol_error",
          message: "Protocol SHA-256 mismatch"
        }
      });
    } finally {
      await server.close();
    }
  });
});

describe("AskRigor Streamable HTTP server", () => {
  it("returns the exact health payload", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/healthz", baseUrl));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(
        '{"status":"ok","service":"askrigor-research","version":"0.1.0"}'
      );
    });
  });

  it("supports consecutive MCP requests through the real stateless SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const client = new Client({ name: "askrigor-test", version: "0.1.0" });

      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL("/mcp", baseUrl))
        );

        const tools = await client.listTools();
        const manifest = await client.callTool({
          name: "get_protocol_manifest",
          arguments: { protocol: "universal" }
        });

        expect(tools.tools.map(({ name }) => name)).toEqual(TOOL_NAMES);
        expect(manifest.isError).not.toBe(true);
        expect(manifest.structuredContent).toMatchObject({
          ok: true,
          protocol: "universal",
          manifest: {
            name: "AskRigor.com universal saved instructions",
            version: "20.5.11",
            revisionDate: "2026-08-07",
            sha256: "1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa"
          }
        });
      } finally {
        await client.close();
      }
    });
  });

  it("rejects an unfinished chunked MCP POST as soon as it exceeds 1 MiB", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await sendOpenChunkedPost(
        new URL("/mcp", baseUrl),
        1_048_577
      );

      expect(response.status).toBe(413);
      expect(response.body).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Request body exceeds 1 MiB limit"},"id":null}'
      );
    });
  });

  it("returns a sanitized parse error for malformed MCP JSON", async () => {
    await withHttpServer(async (baseUrl) => {
      const response = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: '{"secret":"do-not-echo"'
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toBe(
        '{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error: Invalid JSON"},"id":null}'
      );
    });
  });

  it("preserves SDK header validation before JSON parsing", async () => {
    await withHttpServer(async (baseUrl) => {
      const missingAccept = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"secret":"do-not-echo"'
      });
      const wrongContentType = await fetch(new URL("/mcp", baseUrl), {
        method: "POST",
        headers: { accept: "application/json, text/event-stream" },
        body: '{"secret":"do-not-echo"'
      });

      expect(missingAccept.status).toBe(406);
      expect(await missingAccept.json()).toMatchObject({
        error: {
          message: "Not Acceptable: Client must accept both application/json and text/event-stream"
        }
      });
      expect(wrongContentType.status).toBe(415);
      expect(await wrongContentType.json()).toMatchObject({
        error: {
          message: "Unsupported Media Type: Content-Type must be application/json"
        }
      });
    });
  });

  it("stays healthy after a client aborts a valid MCP POST before EOF", async () => {
    await withHttpServer(
      async (baseUrl) => {
        await abortPartialMcpPost(new URL("/mcp", baseUrl));
        await new Promise((resolve) => setTimeout(resolve, 25));

        const response = await fetch(new URL("/healthz", baseUrl));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          status: "ok",
          service: "askrigor-research",
          version: "0.1.0"
        });
      },
      (request) => {
        request.once("aborted", () => {
          const error = Object.assign(new Error("socket hang up"), {
            code: "ECONNRESET"
          });
          request.emit("error", error);
        });
      }
    );
  });

  it("delegates GET and DELETE semantics to the installed SDK transport", async () => {
    await withHttpServer(async (baseUrl) => {
      const getResponse = await fetch(new URL("/mcp", baseUrl));
      const deleteResponse = await fetch(new URL("/mcp", baseUrl), {
        method: "DELETE",
        headers: { "mcp-protocol-version": "2025-11-25" }
      });

      expect(getResponse.status).toBe(406);
      expect(await getResponse.json()).toMatchObject({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Not Acceptable: Client must accept text/event-stream"
        },
        id: null
      });
      expect(deleteResponse.status).toBe(200);
      expect(await deleteResponse.text()).toBe("");
    });
  });
});

async function createInMemoryClient(): Promise<{
  client: Client;
  server: ReturnType<typeof createAskRigorServer>;
}> {
  const server = createAskRigorServer();
  const client = new Client({ name: "askrigor-test", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function withHttpServer(
  callback: (baseUrl: URL) => Promise<void>,
  observeRequest?: (request: IncomingMessage) => void
): Promise<void> {
  const httpServer = createAskRigorHttpServer();
  if (observeRequest !== undefined) {
    httpServer.on("request", observeRequest);
  }
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const { port } = httpServer.address() as AddressInfo;

  try {
    await callback(new URL(`http://127.0.0.1:${port}`));
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function sendOpenChunkedPost(
  url: URL,
  byteLength: number
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });

    request.setTimeout(1_000, () => {
      request.destroy(new Error("Timed out waiting for early HTTP response"));
    });
    request.once("error", reject);
    request.once("response", (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => {
        request.destroy();
        resolve({ status: response.statusCode, body });
      });
    });

    request.write(Buffer.alloc(byteLength, 0x20));
  });
}

async function abortPartialMcpPost(url: URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      }
    });
    const timeout = setTimeout(() => {
      request.destroy();
      reject(new Error("Timed out waiting for aborted client request to close"));
    }, 1_000);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };

    request.once("error", finish);
    request.once("close", finish);
    request.once("socket", (socket) => {
      const sendAndAbort = () => {
        request.write('{"jsonrpc":"2.0","id":1');
        setTimeout(() => request.destroy(), 25);
      };

      if (socket.connecting) {
        socket.once("connect", sendAndAbort);
      } else {
        sendAndAbort();
      }
    });
  });
}

async function mcpCompleteCommentResponse(url: URL): Promise<Response> {
  if (url.pathname.endsWith("/commentThreads")) {
    return new Response(await youtubeFixture(
      url.searchParams.get("pageToken") === "thread-page-2"
        ? "comment-threads-page-2.json"
        : "comment-threads-page-1.json"
    ), { status: 200 });
  }
  if (url.searchParams.get("parentId") === "UgxTop00000000000000002") {
    return new Response(await youtubeFixture("comments-top-2-page-1.json"), { status: 200 });
  }
  return new Response(await youtubeFixture(
    url.searchParams.get("pageToken") === "reply-top-1-page-2"
      ? "comments-top-1-page-2.json"
      : "comments-top-1-page-1.json"
  ), { status: 200 });
}
