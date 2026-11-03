import { describe, expect, it } from "vitest";

import { REFUSAL_TEXT } from "../scripts/web-engine.mts";
import { afterCall, beforeCall, newState, structuredFrom } from "../scripts/web-engine-worker.mts";

const askrigor = (tool: string) => `mcp__askrigor__${tool}`;

describe("web-app engine trial on a Claude plan worker", () => {
  it("refuses in the hook what the engine refuses, and lets research calls, web search and web fetch through", () => {
    const state = newState(100, undefined, []);
    for (const tool of ["save_research_findings", "submit_research_contribution", "review_research_contribution"]) {
      expect(beforeCall(state, { tool_name: askrigor(tool), tool_input: {} })).toEqual({ deny: REFUSAL_TEXT });
    }
    expect(beforeCall(state, { tool_name: askrigor("manage_research_access"), tool_input: { action: "set_findings_save" } }))
      .toEqual({ deny: REFUSAL_TEXT });
    expect(beforeCall(state, { tool_name: askrigor("manage_research_access"), tool_input: { action: "inspect" } })).toBeUndefined();
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed"), tool_input: { query: "x" } })).toBeUndefined();
    expect(beforeCall(state, { tool_name: "WebSearch", tool_input: { query: "x" } })).toBeUndefined();
    expect(beforeCall(state, { tool_name: "WebFetch", tool_input: { url: "https://example.org" } })).toBeUndefined();
    expect(beforeCall(state, { tool_name: "Bash", tool_input: { command: "ls" } })).toEqual({ deny: expect.stringContaining("Not available") });
    expect(state).toMatchObject({ refusedCalls: 4, turnAskRigorCalls: 2, webSearches: 1, webFetches: 1 });
  });

  it("holds a turn to the engine's limit of AskRigor calls, and refuses the self-check's tools", () => {
    const state = newState(2, undefined, ["get_protocol_manifest"]);
    expect(beforeCall(state, { tool_name: askrigor("get_protocol_manifest") })).toEqual({ deny: expect.stringContaining("self-check") });
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed") })).toBeUndefined();
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed") })).toBeUndefined();
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed") })).toEqual({ deny: expect.stringContaining("limit of 2") });
  });

  it("stops the turn once a case has completed N AskRigor calls without loading Universal and HRP", () => {
    const state = newState(100, 2, []);
    const loaded = (protocol: string) => ({
      tool_name: askrigor("load_protocol"), tool_input: { protocol, section: "index" },
      tool_response: { content: [{ type: "text", text: "Loaded." }], structuredContent: { ok: true, text: "<x/>" } },
    });
    expect(beforeCall(state, loaded("hrp"))).toBeUndefined();
    expect(afterCall(state, loaded("hrp"))).toBeUndefined();
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed") })).toBeUndefined();
    expect(afterCall(state, { tool_name: askrigor("search_pubmed"), tool_response: [{ type: "text", text: "{\"ok\":true}" }] }))
      .toBeUndefined();
    expect(beforeCall(state, { tool_name: askrigor("search_pubmed") })).toEqual({ stop: "protocol_guard: not loaded after 2 AskRigor calls: universal" });
    expect(beforeCall(state, { tool_name: "WebSearch" })).toEqual({ stop: expect.stringContaining("protocol_guard") });

    const both = newState(100, 2, []);
    for (const protocol of ["universal", "hrp"]) { beforeCall(both, loaded(protocol)); afterCall(both, loaded(protocol)); }
    expect(beforeCall(both, { tool_name: askrigor("search_pubmed") })).toBeUndefined();
    expect(both.protocolsLoaded).toEqual(["universal", "hrp"]);
  });

  it("stops at the first result that shows saving on or a card saved, however the result reaches the hook", () => {
    const state = newState(100, undefined, []);
    expect(afterCall(state, {
      tool_name: askrigor("finalize_research"),
      tool_response: [{ type: "text", text: JSON.stringify({ findings_card: { saved: { status: "saved" } } }) }],
    })).toEqual({ stop: "save_guard: card_saved at finalize_research" });
    expect(structuredFrom({ structuredContent: { ok: true } })).toEqual({ ok: true });
    expect(structuredFrom({ content: [{ type: "text", text: "{\"ok\":true}" }] })).toEqual({ ok: true });
    expect(structuredFrom("{\"findingsSave\":true}")).toEqual({ findingsSave: true });
    expect(structuredFrom([{ type: "text", text: "Loaded HRP core." }])).toBeUndefined();
  });
});
