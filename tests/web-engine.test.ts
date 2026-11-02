import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REFUSAL_TEXT,
  WEB_SEARCH_USD,
  accountProblem,
  answerText,
  claudeToolFor,
  costOf,
  protocolLoaded,
  protocolsMissing,
  readPass,
  refusalFor,
  saveSign,
  skillBody,
  systemPrompt,
  toolResultContent,
} from "../scripts/web-engine.mts";

describe("web-app engine trial", () => {
  it("refuses every save, submission, review, share and account change without calling AskRigor", () => {
    for (const name of [
      "save_research_findings", "submit_research_contribution", "submit_lesson_candidate",
      "review_research_contribution", "review_evidence_gap_submissions",
    ]) {
      expect(refusalFor(name, {})).toBe(REFUSAL_TEXT);
    }
    for (const action of [
      "accept_free_contributor", "activate_paid_private", "revoke", "set_plain_answer_note",
      "set_detailed_lesson_reports", "set_findings_save", "share_answer", "delete_shared_answer", undefined,
    ]) {
      expect(refusalFor("manage_research_access", { action })).toBe(REFUSAL_TEXT);
    }
    expect(refusalFor("manage_research_access", { action: "inspect" })).toBeUndefined();
    // The plain answer is registered before research; the final check compares the answer with it (owner answer 217b).
    expect(refusalFor("manage_research_access", {
      action: "register_plain_answer", plainAnswer: { text: "Yes.", claims: ["Yes."] },
    })).toBeUndefined();
    expect(refusalFor("finalize_research", { answer_draft: "..." })).toBeUndefined();
    expect(refusalFor("search_pubmed", { query: "x" })).toBeUndefined();
  });

  it("tells the model the date, the server instructions and the AskRigor skill, which says to load the protocols", () => {
    const skill = skillBody(readFileSync(new URL("../skills/askrigor/SKILL.md", import.meta.url), "utf8"));
    expect(skill.startsWith("# AskRigor")).toBe(true);
    expect(skill).toContain("Load Universal first");
    const [block] = systemPrompt("Before research, call manage_research_access.", "2026-11-02", skill);
    expect(block?.text).toBe([
      "Today's date is 2026-11-02.",
      "AskRigor's tools are connected as the AskRigor app; you also have web search and web fetch.",
      "", "AskRigor's server instructions:", "Before research, call manage_research_access.",
      "", "AskRigor's skill, how to run AskRigor:", "", skill,
    ].join("\n"));
    expect(block?.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(systemPrompt(undefined, "2026-11-02", undefined)[0]?.text).toBe([
      "Today's date is 2026-11-02.",
      "AskRigor's tools are connected as the AskRigor app; you also have web search and web fetch.",
    ].join("\n"));
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

  it("runs only on an active dev account with card saving off, and on the account a run names", () => {
    const inspect = (overrides: Record<string, unknown>) => ({
      ok: true, access: { status: "ACTIVE", mode: "FREE_CONTRIBUTOR" }, findingsSave: false,
      accountReference: "aaaaaaaaaaaa", ...overrides,
    });
    expect(accountProblem(inspect({}), undefined)).toBeUndefined();
    expect(accountProblem(inspect({}), "aaaaaaaaaaaa")).toBeUndefined();
    expect(accountProblem(inspect({}), "bbbbbbbbbbbb")).toContain("other than the one named");
    expect(accountProblem(inspect({ findingsSave: true }), undefined)).toContain("card saving is on");
    expect(accountProblem(inspect({ findingsSave: undefined }), undefined)).toContain("not a dev account");
    expect(accountProblem(inspect({ access: { status: "UNENROLLED", mode: null } }), undefined)).toContain("UNENROLLED");
    expect(accountProblem(inspect({ ok: false }), undefined)).toContain("did not answer ok");
    expect(accountProblem(undefined, undefined)).toContain("did not answer ok");
  });

  it("stops a run whose case has not loaded Universal and HRP by its Nth AskRigor call", () => {
    expect(protocolLoaded("load_protocol", { protocol: "hrp", section: "core" }, { ok: true })).toBe("hrp");
    expect(protocolLoaded("load_protocol", { protocol: "universal", section: "index" }, { ok: true })).toBe("universal");
    expect(protocolLoaded("load_protocol", { protocol: "hrp" }, { ok: false })).toBeUndefined();
    expect(protocolLoaded("get_protocol_manifest", { protocol: "hrp" }, { ok: true })).toBeUndefined();
    expect(protocolsMissing(new Set(), 11, 12)).toBeUndefined();
    expect(protocolsMissing(new Set(), 12, 12)).toEqual(["universal", "hrp"]);
    expect(protocolsMissing(new Set(["hrp"]), 30, 12)).toEqual(["universal"]);
    expect(protocolsMissing(new Set(["hrp", "universal"]), 30, 12)).toBeUndefined();
    expect(protocolsMissing(new Set(), 30, undefined)).toBeUndefined();
  });

  it("stops at the first sign of saving, as the harness's save guard does", () => {
    expect(saveSign("manage_research_access", { ok: true, findingsSave: true })).toBe("saving_on");
    expect(saveSign("manage_research_access", { ok: true, findingsSave: false })).toBeUndefined();
    expect(saveSign("finalize_research", { findings_card: { saved: { status: "saved", card_id: "ARF-1" } } })).toBe("card_saved");
    expect(saveSign("finalize_research", { findings_card: { saved: { status: "already_saved" } } })).toBe("card_saved");
    expect(saveSign("finalize_research", { findings_card: { saved: { status: "not_saved" } } })).toBeUndefined();
    expect(saveSign("finalize_research", { status: "ready" })).toBeUndefined();
  });
});
