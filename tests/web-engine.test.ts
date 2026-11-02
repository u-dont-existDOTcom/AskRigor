import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REFUSAL_TEXT,
  WEB_SEARCH_USD,
  answerText,
  claudeToolFor,
  costOf,
  readPass,
  refusalFor,
  toolResultContent,
} from "../scripts/web-engine.mts";

describe("web-app engine trial", () => {
  it("refuses every save, submission, review, share and account change without calling AskRigor", () => {
    for (const name of [
      "save_research_findings", "submit_research_contribution", "submit_lesson_candidate",
      "review_research_contribution", "review_evidence_gap_submissions", "share_answer", "delete_shared_answer",
    ]) {
      expect(refusalFor(name, {})).toBe(REFUSAL_TEXT);
    }
    expect(refusalFor("manage_research_access", { action: "set_findings_save", findingsSave: true })).toBe(REFUSAL_TEXT);
    expect(refusalFor("manage_research_access", { action: "accept_free_contributor" })).toBe(REFUSAL_TEXT);
    expect(refusalFor("manage_research_access", {})).toBe(REFUSAL_TEXT);
    expect(refusalFor("manage_research_access", { action: "inspect" })).toBeUndefined();
    expect(refusalFor("finalize_research", { answer_draft: "..." })).toBeUndefined();
    expect(refusalFor("search_pubmed", { query: "x" })).toBeUndefined();
  });

  it("offers an MCP tool to Claude with its name, description and input schema", () => {
    const tool = claudeToolFor({
      name: "search_pubmed",
      description: "Search PubMed.",
      inputSchema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    });
    expect(tool).toEqual({
      name: "search_pubmed",
      description: "Search PubMed.",
      input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    });
  });

  it("shows the model a result's text and then its structured content", () => {
    expect(toolResultContent({
      content: [{ type: "text", text: "Loaded HRP section core, page 1 of 3." }],
      structuredContent: { ok: true, page: 1, text: "<HRP>..." },
    })).toEqual([
      { type: "text", text: "Loaded HRP section core, page 1 of 3." },
      { type: "text", text: "{\"ok\":true,\"page\":1,\"text\":\"<HRP>...\"}" },
    ]);
    expect(toolResultContent({ content: [] })).toEqual([{ type: "text", text: "(empty result)" }]);
  });

  it("prices a response from its usage: input, output, both cache writes, cache reads and searches", () => {
    const usage = {
      input_tokens: 1_000,
      output_tokens: 2_000,
      cache_creation_input_tokens: 30_000,
      cache_creation: { ephemeral_5m_input_tokens: 10_000, ephemeral_1h_input_tokens: 20_000 },
      cache_read_input_tokens: 100_000,
      server_tool_use: { web_search_requests: 3, web_fetch_requests: 2 },
      iterations: null,
    } as unknown as Parameters<typeof costOf>[0];
    // Claude Opus 5.5: $4 input, $20 output, $5 and $8 cache writes, $0.20 cache reads per million tokens.
    const expected = (1_000 * 4 + 2_000 * 20 + 10_000 * 5 + 20_000 * 8 + 100_000 * 0.2) / 1e6 + 3 * WEB_SEARCH_USD;
    expect(costOf(usage, "claude-opus-5-5")).toBeCloseTo(expected, 10);
  });

  it("prices a fallback attempt at the fallback model's own prices", () => {
    const usage = {
      input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
      cache_creation: null, server_tool_use: null,
      iterations: [
        { type: "message", input_tokens: 1_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
        { type: "fallback_message", model: "claude-opus-5", input_tokens: 1_000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cache_creation: null },
      ],
    } as unknown as Parameters<typeof costOf>[0];
    expect(costOf(usage, "claude-opus-5-5")).toBeCloseTo((1_000 * 4 + 1_000 * 5 + 100 * 25) / 1e6, 10);
  });

  it("delivers a response's text blocks, not its thinking or tool calls", () => {
    expect(answerText([
      { type: "thinking", thinking: "plan", signature: "s" },
      { type: "text", text: "First part.", citations: null },
      { type: "tool_use", id: "t", name: "search_pubmed", input: {} },
      { type: "text", text: "Second part.", citations: null },
    ] as unknown as Parameters<typeof answerText>[0])).toBe("First part.\n\nSecond part.");
  });

  it("uses a sign-in only while it outlasts a case, and never echoes the pass", () => {
    const folder = mkdtempSync(join(tmpdir(), "web-engine-"));
    const path = join(folder, "token.json");
    expect(readPass(path, 1_000)).toEqual({ problem: expect.stringContaining("run the sign-in first") });
    writeFileSync(path, JSON.stringify({ access_token: "secret-pass", expires_at: 1_000 + 30 * 60 }));
    const soon = readPass(path, 1_000);
    expect(soon).toEqual({ problem: expect.stringContaining("sign in again") });
    expect(JSON.stringify(soon)).not.toContain("secret-pass");
    writeFileSync(path, JSON.stringify({ access_token: "secret-pass", expires_at: 1_000 + 24 * 3600 }));
    expect(readPass(path, 1_000)).toEqual({ token: "secret-pass", expiresAt: 1_000 + 24 * 3600 });
    writeFileSync(path, "not json");
    expect(readPass(path, 1_000)).toEqual({ problem: "the sign-in file is not JSON" });
  });
});
