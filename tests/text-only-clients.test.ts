import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { protocolSections } from "../packages/protocol/src/index.js";
import { RESEARCH_OPERATIONS } from "../apps/research-mcp/src/register-tools.js";
import { createAskRigorHttpServer, createAskRigorServer } from "../apps/research-mcp/src/server.js";
import {
  isChatGptCall, PROTOCOL_PAGE_IN_STRUCTURED_CONTENT, PROTOCOL_PAGE_IN_TEXT, resultForClient,
} from "../apps/research-mcp/src/tool-result.js";
import { FROZEN_TOOL_LIST_SURFACES, frozenSurfaceServer } from "../scripts/freeze-tool-lists.mts";
import {
  builtContent,
  CLAUDE_APP_RESULT_CHARACTERS,
  CLAUDE_CODE_INLINE_CHARACTERS,
  clientViewBytes,
  textOnly,
} from "./helpers/text-payload.js";

// Lesson #59 (7 Nov 2026): an app that hands the model only a result's content text never saw a payload kept only in
// structuredContent. Every result now carries it in text too, except for ChatGPT, which shows the model both.

const CHATGPT_META = { "openai/locale": "en-US", "openai/userAgent": "Mozilla/5.0 (Macintosh)" };
const clients: Client[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connected(server: McpServer = createAskRigorServer()): Promise<Client> {
  const client = new Client({ name: "text-only-client-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  clients.push(client);
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** What a client that reads only text learns from a load_protocol page: its fields, from the JSON block, and its bytes. */
function protocolPageFromText(result: { content?: unknown }) {
  const texts = textOnly(result);
  const fields = JSON.parse(texts.at(-2)!) as {
    page: number; page_count: number; complete: boolean; scope_sha256: string; scope_bytes: number;
  };
  return { summary: texts[0]!, fields, bytes: texts.at(-1)! };
}

describe("a client that reads only content text (lesson #59)", () => {
  it("gets the Universal core's exact canonical bytes in text, whose SHA-256 matches scope_sha256", async () => {
    const client = await connected();
    const result = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: "core" } });
    expect(result.isError).not.toBe(true);
    const page = protocolPageFromText(result);
    expect(page.fields).toMatchObject({ page: 1, page_count: 1, complete: true });
    expect(sha256(page.bytes)).toBe(page.fields.scope_sha256);
    expect(Buffer.byteLength(page.bytes, "utf8")).toBe(page.fields.scope_bytes);
    expect(page.bytes).toBe((result.structuredContent as { text: string }).text);
    expect(page.summary).toMatch(/^Loaded AskRigor\.com universal saved instructions priority, .+ \(exact canonical bytes of each, in this order, a blank line between two\)\./u);
    expect(page.summary.endsWith(PROTOCOL_PAGE_IN_TEXT)).toBe(true);
    // The JSON block is the structured content without the page's text, which comes once, raw.
    const { text: _text, ...fields } = result.structuredContent as Record<string, unknown>;
    expect(textOnly(result).at(-2)).toBe(JSON.stringify(fields));
  });

  it("gets every page of the HRP core in text, and the pages joined hash to scope_sha256", async () => {
    const client = await connected();
    const pages: string[] = [];
    let expected: string | undefined;
    for (let number = 1; ; number += 1) {
      const result = await client.callTool({ name: "load_protocol", arguments: { protocol: "hrp", section: "core", page: number } });
      expect(result.isError).not.toBe(true);
      const page = protocolPageFromText(result);
      expect(page.fields.page).toBe(number);
      expected ??= page.fields.scope_sha256;
      expect(page.fields.scope_sha256).toBe(expected);
      pages.push(page.bytes);
      if (page.fields.complete) break;
    }
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(sha256(pages.join(""))).toBe(expected);
    const canonical = await readFile(new URL("../protocols/HRP_Full.xml", import.meta.url));
    const core = protocolSections("hrp", canonical.toString("utf8")).filter(({ core: isCore }) => isCore);
    expect(pages.join("")).toBe(core.map(({ byte_start, byte_end_exclusive }) =>
      canonical.subarray(byte_start, byte_end_exclusive).toString("utf8")).join("\n\n"));
  });

  it("keeps each part of every protocol page under Claude Code's inline limit, and the whole under the apps' limit", async () => {
    // The review of 7 Nov: the text copy doubles a result. Claude Code counts the part it shows (structured content, or
    // the text where a setting turns it round), and claude.ai and Desktop take a whole result up to their limit, so
    // each part and the whole are held to those, for every page of every protocol and section.
    const client = await connected();
    const sizes: string[] = [];
    for (const args of [{ protocol: "universal", section: "core" }, { protocol: "hrp", section: "core" },
      { protocol: "universal", section: "index" }, { protocol: "hrp", section: "index" }, { protocol: "universal" },
      { protocol: "hrp" }]) {
      for (let page = 1; ; page += 1) {
        const result = await client.callTool({ name: "load_protocol", arguments: { ...args, page } });
        expect(result.isError).not.toBe(true);
        const bytes = clientViewBytes(result, "load_protocol");
        sizes.push(`${JSON.stringify(args)} page ${page}: text ${bytes.textOnly}, structured ${bytes.structured}, whole ${bytes.whole}`);
        expect(bytes.textOnly, sizes.at(-1)).toBeLessThanOrEqual(CLAUDE_CODE_INLINE_CHARACTERS);
        expect(bytes.structured, sizes.at(-1)).toBeLessThanOrEqual(CLAUDE_CODE_INLINE_CHARACTERS);
        expect(bytes.whole, sizes.at(-1)).toBeLessThanOrEqual(CLAUDE_APP_RESULT_CHARACTERS);
        if ((result.structuredContent as { complete?: boolean }).complete !== false) break;
      }
    }
    expect(sizes.length).toBeGreaterThan(6);
  });

  it("gets the index in text, listing every section with its fields", async () => {
    const client = await connected();
    const result = await client.callTool({ name: "load_protocol", arguments: { protocol: "universal", section: "index" } });
    expect(result.isError).not.toBe(true);
    const listed = JSON.parse(textOnly(result).at(-1)!) as { index: Array<Record<string, unknown>>; core_sections: string[] };
    const canonical = await readFile(new URL("../protocols/Universal_Instructions.xml", import.meta.url), "utf8");
    expect(listed.index.map(({ name }) => name)).toEqual(protocolSections("universal", canonical).map(({ name }) => name));
    for (const section of listed.index) {
      expect(Object.keys(section).sort()).toEqual(["bytes", "core", "name", "pages", "runtime", "sha256", "summary"]);
    }
    expect(listed.core_sections.length).toBeGreaterThan(0);
  });

  it("gets a PubMed record's title and abstract in text", async () => {
    vi.stubEnv("NCBI_TOOL", "askrigor-text-only-tests");
    vi.stubEnv("NCBI_EMAIL", "maintainer@example.test");
    const body = await readFile(new URL("fixtures/pubmed/efetch-record.xml", import.meta.url), "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const client = await connected();
    const result = await client.callTool({ name: "fetch_pubmed_record", arguments: { pmid: "40123456" } });
    expect(result.isError).not.toBe(true);
    const record = (result.structuredContent as { data: { title: string; abstract: string } }).data;
    expect(record.title.length).toBeGreaterThan(10);
    expect(record.abstract.length).toBeGreaterThan(10);
    const joined = textOnly(result).join("\n");
    expect(joined).toContain(JSON.stringify(record.title));
    expect(joined).toContain(JSON.stringify(record.abstract));
    expect(JSON.parse(textOnly(result).at(-1)!)).toEqual(result.structuredContent);
  });
});

describe("ChatGPT keeps the compact text", () => {
  it("adds no copy for a call whose _meta carries ChatGPT's hints, and leaves structuredContent byte for byte", async () => {
    // One clock for both calls, so both records carry the same retrieval time.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
    vi.stubEnv("NCBI_TOOL", "askrigor-text-only-tests");
    vi.stubEnv("NCBI_EMAIL", "maintainer@example.test");
    const body = await readFile(new URL("fixtures/pubmed/efetch-record.xml", import.meta.url), "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 200 })));
    const client = await connected();
    const plain = await client.callTool({ name: "fetch_pubmed_record", arguments: { pmid: "40123456" } });
    const chatGpt = await client.callTool({ name: "fetch_pubmed_record", arguments: { pmid: "40123456" }, _meta: CHATGPT_META });
    expect(chatGpt.content).toEqual(builtContent(plain));
    expect(JSON.stringify(chatGpt.structuredContent)).toBe(JSON.stringify(plain.structuredContent));
  });

  it("says where a protocol page's bytes are, and both forms carry the same structuredContent as the tool built", async () => {
    const client = await connected();
    const args = { protocol: "universal", section: "core" };
    const plain = await client.callTool({ name: "load_protocol", arguments: args });
    const chatGpt = await client.callTool({ name: "load_protocol", arguments: args, _meta: { "openai/subject": "v1/synthetic" } });
    const [summary] = builtContent(plain, "load_protocol") as Array<{ type: "text"; text: string }>;
    expect(chatGpt.content).toEqual([{ type: "text", text: `${summary!.text}${PROTOCOL_PAGE_IN_STRUCTURED_CONTENT}` }]);
    const operation = RESEARCH_OPERATIONS.find(({ name }) => name === "load_protocol")!;
    const built = await operation.execute(args);
    expect(built.content).toEqual([summary]);
    for (const result of [plain, chatGpt]) {
      expect(JSON.stringify(result.structuredContent)).toBe(JSON.stringify(built.structuredContent));
    }
  });

  it("reads ChatGPT's User-Agent from the HTTP request, and copies the payload for any other", async () => {
    const httpServer = createAskRigorHttpServer({ publicServerEnabled: true });
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const { port } = httpServer.address() as AddressInfo;
    try {
      const call = async (userAgent: string) => {
        const client = new Client({ name: "user-agent-test", version: "1.0.0" });
        try {
          await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { "User-Agent": userAgent } }
          }));
          return await client.callTool({ name: "verify_protocol_integrity", arguments: { protocol: "universal" } });
        } finally {
          await client.close();
        }
      };
      const chatGpt = await call("openai-mcp/1.0.0");
      expect(chatGpt.content).toEqual([{ type: "text", text: expect.stringMatching(/^Protocol integrity verified for /u) }]);
      const other = await call("claude-code/2.1.312 (cli)");
      expect(other.content).toEqual([...chatGpt.content as CallToolResult["content"],
        { type: "text", text: JSON.stringify(other.structuredContent) }]);
      expect(JSON.stringify(other.structuredContent)).toBe(JSON.stringify(chatGpt.structuredContent));
    } finally {
      await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it("identifies ChatGPT only by exact structural signals", () => {
    expect(isChatGptCall({ _meta: { "openai/locale": "fr-FR" } })).toBe(true);
    expect(isChatGptCall({ _meta: { progressToken: 1, "openai/session": "v1/synthetic" } })).toBe(true);
    expect(isChatGptCall({ requestInfo: { headers: { "user-agent": "openai-mcp/1.0.0" } } })).toBe(true);
    expect(isChatGptCall({ requestInfo: { headers: { "user-agent": ["openai-mcp/2.0", "other"] } } })).toBe(true);
    for (const extra of [
      undefined, null, {}, { _meta: {} }, { _meta: { progressToken: 1 } }, { _meta: { "OpenAI/locale": "en" } },
      { _meta: { openai: "x", "openaiX/locale": "en" } }, { _meta: { "anthropic/client": "claude" } },
      { requestInfo: { headers: { "user-agent": "Mozilla/5.0 openai-mcp/1.0.0" } } },
      { requestInfo: { headers: { "user-agent": "OpenAI-MCP/1.0.0" } } },
      { requestInfo: { headers: { "user-agent": "claude-code/2.1.312" } } }, { requestInfo: { headers: {} } },
      { surface: "action" },
    ]) expect(isChatGptCall(extra), JSON.stringify(extra)).toBe(false);
  });

  it("leaves a result without structured content alone, and copies an error result's details", () => {
    const plain: CallToolResult = { content: [{ type: "text", text: "Nothing structured." }], isError: true };
    expect(resultForClient("search_pubmed", plain, false)).toBe(plain);
    expect(resultForClient("search_pubmed", plain, true)).toBe(plain);
    const failed: CallToolResult = {
      content: [{ type: "text", text: "Protocol request failed: Pages are whole numbers from 1." }],
      structuredContent: { ok: false, protocol: "hrp", error: { code: "protocol_page_out_of_range", message: "Pages are whole numbers from 1." } },
      isError: true,
    };
    expect(resultForClient("load_protocol", failed, false).content).toEqual([...failed.content,
      { type: "text", text: JSON.stringify(failed.structuredContent) }]);
    expect(resultForClient("load_protocol", failed, true)).toBe(failed);
  });
});

// Every tool on every surface, called once as a client without ChatGPT's signals and once with them, with fixtures the
// suite already has and with no other network: whatever a call returns, a result with structured content carries it
// in its text only without ChatGPT's signals.
const FIXTURES = new URL("fixtures/", import.meta.url);
const fixture = (path: string) => readFile(new URL(path, FIXTURES), "utf8");
const HANDLE = `aft1_${"A".repeat(32)}`;
const SWEEP_ARGUMENTS: Readonly<Record<string, Record<string, unknown>>> = {
  get_protocol_manifest: { protocol: "hrp" },
  load_protocol: { protocol: "universal", section: "core" },
  verify_protocol_integrity: { protocol: "universal" },
  search_pubmed: { query: "example intervention[Title/Abstract]", page_size: 2 },
  fetch_pubmed_record: { pmid: "40123456" },
  search_europe_pmc: { query: "example intervention" },
  acquire_open_full_text: { doi: "10.1234/recorded.example" },
  continue_open_full_text: { document_handle: HANDLE },
  validate_study_method_audit: { document_handle: HANDLE, audit: {} },
  validate_review_method_audit: { document_handle: HANDLE, audit: {} },
  search_clinical_trials: { query: "example" },
  fetch_clinical_trial: { nct_id: "NCT01234567" },
  resolve_doi: { doi_or_citation: "10.1234/recorded.example" },
  check_retraction_status: { doi: "10.1234/recorded.example" },
  search_youtube: { query: "example" },
  get_youtube_video: { video_id_or_url: "XpZHKGGCK-o" },
  get_youtube_comments: { video_id_or_url: "XpZHKGGCK-o" },
  search_youtube_comments: { video_id_or_url: "XpZHKGGCK-o", query: "worked" },
  audit_youtube_community: { research_question: "Synthetic question", searches: [{ direction: "general", query: "example" }] },
  survey_youtube_community: { research_question: "Synthetic question", searches: [{ direction: "general", query: "example" }] },
  audit_youtube_video_community: { video_id_or_url: "XpZHKGGCK-o" },
  get_research_frontier: { topic_key: "synthetic-topic" },
  search_research_frontiers: { query: "synthetic topic" },
  manage_research_access: { action: "inspect" },
  submit_research_contribution: { proposalKind: "RESEARCH_FRONTIER", privacyBoundary: {}, payload: {} },
  review_research_contribution: { action: "list_findings" },
  review_evidence_gap_submissions: { gap_slug: "prolactinoma-spontaneous-remission" },
  assess_treatment_landscape_coverage: {
    research_target: "Synthetic target", broad_treatment_choice: false, substantial_youtube_corpus: false,
    further_expansion_likely_to_improve_answer: false, receipts: [], treatment_classes: [], program_fingerprints: [],
    directional_searches: [],
  },
  scout_gemini_youtube_candidates: { research_target: "Adults with a synthetic condition", diagnosis_status: "confirmed" },
  extract_youtube_video_claims: { video: "XpZHKGGCK-o" },
  finalize_research: {
    receipts: [], community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome",
    not_relevant_reason: "Synthetic sweep.", treatment_choice: "not_compared", research_target: "Synthetic sweep",
    key_sources: [], answer_draft: "A synthetic answer.",
  },
  submit_lesson_candidate: { category: "missing_sources" },
  save_research_findings: { findings_card: {}, finalization_receipt: "synthetic", user_consent: "yes_to_this_save" },
  read_forum_thread: { url: "https://forum.example.test/t/synthetic-thread/1" },
  search_reddit_threads: { query: "synthetic remedy" },
};

async function sweepFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.endsWith("/esearch.fcgi")) return new Response(await fixture("pubmed/esearch-page-1.json"), { status: 200 });
  if (url.pathname.endsWith("/efetch.fcgi")) return new Response(await fixture("pubmed/efetch-record.xml"), { status: 200 });
  if (url.hostname === "www.ebi.ac.uk" && url.pathname.endsWith("/search")) {
    return new Response(await fixture("europe-pmc/search-page-1.json"), { status: 200 });
  }
  if (url.hostname === "clinicaltrials.gov") {
    const file = url.pathname.endsWith("/version") ? "version.json"
      : url.pathname.endsWith("/NCT01234567") ? "study-NCT01234567.json" : "search-page-1.json";
    return new Response(await fixture(`clinical-trials/${file}`), { status: 200 });
  }
  if (url.hostname === "api.crossref.org") {
    return new Response(await fixture(url.pathname === "/works" ? "crossref/citation-candidates.json" : "crossref/work-no-marker.json"),
      { status: 200 });
  }
  return new Response("Not found", { status: 404 });
}

describe("every registered tool (sweep)", () => {
  it.each(FROZEN_TOOL_LIST_SURFACES)("carries the payload in text on %s, except for ChatGPT's calls", async (surface) => {
    vi.stubEnv("NCBI_TOOL", "askrigor-text-only-tests");
    vi.stubEnv("NCBI_EMAIL", "maintainer@example.test");
    vi.stubEnv("YOUTUBE_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(sweepFetch));
    const client = await connected(frozenSurfaceServer(surface));
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    const structured: string[] = [];
    for (const { name } of tools) {
      const args = SWEEP_ARGUMENTS[name];
      expect(args, `${name} needs sweep arguments`).toBeDefined();
      const plain = await client.callTool({ name, arguments: args });
      const chatGpt = await client.callTool({ name, arguments: args, _meta: CHATGPT_META });
      if (plain.structuredContent === undefined) {
        expect(chatGpt.structuredContent, name).toBeUndefined();
        expect(plain.content, name).toEqual(chatGpt.content);
        continue;
      }
      structured.push(name);
      // Without ChatGPT's signals the payload follows what the tool built; with them, nothing follows.
      const built = builtContent(plain, name);
      expect(chatGpt.content, name).toHaveLength(built.length);
      const payload = JSON.stringify(chatGpt.structuredContent);
      expect(textOnly(chatGpt).some((text) => text === payload), name).toBe(false);
      if (name === "load_protocol") {
        expect(textOnly(chatGpt).some((text) => text === (chatGpt.structuredContent as { text: string }).text)).toBe(false);
      }
    }
    // The sweep reaches the payload of most tools with these fixtures (27 of 35 on /mcp and /mcp/claude, 19 of 22 on
    // /mcp/gemini); the rest refuse their synthetic input before any structured result, which the loop checks too.
    expect(structured.length, structured.join(", ")).toBeGreaterThanOrEqual(Math.ceil(tools.length * 0.75));
  }, 120_000);
});
