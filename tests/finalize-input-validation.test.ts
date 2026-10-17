import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { finalizeResearch, finalizeResearchInputSchema, finalizeResearchPublishedInputSchema, parseFinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";

const base = {
  receipts: [], research_target: "Synthetic declaration check", research_depth: "deep",
  community_evidence: "not_relevant", not_relevant_basis: "emergency_before_triage",
  not_relevant_reason: "Synthetic emergency fixture", treatment_choice: "not_compared", key_sources: []
};
const community = { community: "Example", platform: "forum", queries: ["example"], threads_read: [], access_boundary: "no_relevant_results" };
const corpus = { product: "Example", reviews_read: 1, selection: "most_recent" };
const report = { exposure: "Example", reports_read: 1, firsthand_exact: 1, exposure_unclear: 0, other_exposure: 0, not_firsthand: 0, measured_after: 0 };
async function withClient(surface: "/mcp" | "/mcp/claude", run: (client: Client) => Promise<void>) {
  const server = createAskRigorServer("standard", { mcpSurface: surface });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "input-validation-test", version: "1" });
  try { await server.connect(st); await client.connect(ct); await run(client); }
  finally { await client.close(); await server.close(); }
}
afterEach(() => vi.unstubAllEnvs());

describe("finalize_research published schemas and handler validation", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("publishes the derived schema exactly on %s and passes invalid arguments to the handler", async (surface) => {
    await withClient(surface, async (client) => {
      const listed = (await client.listTools()).tools.find(({ name }) => name === "finalize_research")!;
      expect(listed.inputSchema).toEqual(finalizeResearchPublishedInputSchema({ relaxed: surface === "/mcp" }));
      const invalid = { ...base, receipts: 9, invented: "field" };
      expect(finalizeResearchInputSchema.safeParse(invalid).success).toBe(false);
      const response = await client.callTool({ name: "finalize_research", arguments: invalid });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ status: "not_ready", receipts_verified: 0, answer_checked: false });
      expect((response.structuredContent!.next_steps as string[]).join("\n")).toContain("invented");
    });
  });

  it("keeps the Claude schema identical to the strict schema's SDK conversion", () => {
    expect(finalizeResearchPublishedInputSchema({ relaxed: false })).toEqual(z.toJSONSchema(finalizeResearchInputSchema, { target: "draft-7", io: "input" }));
  });

  it.each([
    [{ findings_card: { findings: [{ claim: "Example", certainty: "moderate", applies_to: "Example", answer_quote: "Example", sources: [], why_not_usual: "Example", what_would_change_it: "Example" }] } }, "findings_card.findings[0].sources", "findings_card.findings as JSON:"],
    [{ intervention_identity: { status: "checked", interventions: [{ study_ids: ["10.1000/example"], label: "Example", status: "resolved", identity: { sponsor_or_maker: "Example", current_product: "Example" } }] } }, "intervention_identity.interventions[0].identity.registry_code", "intervention_identity.interventions as JSON:"],
    [{ community_searches: [{ ...community, review_corpora: [{ ...corpus, selection: "newest reviews" }] }] }, "community_searches[0].review_corpora[0].selection", "one of all, condition_mentions, most_recent, random_or_stratified, top_ranked, outcome_keyword, other_partial"],
    [{ community_searches: [{ ...community, report_identity: [{ ...report, exact_firsthand: 1 }] }] }, "exact_firsthand", "community_searches[].report_identity as JSON:"],
    [{ community_searches: [{ ...community, threads_read: 7 }] }, "community_searches[0].threads_read", "community_searches[].threads_read as JSON:"]
  ])("returns malformed nested inputs as one not_ready result: %s", async (overrides, path, detail) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "input-validation-secret-01234567890123456789");
    await withClient("/mcp", async (client) => {
      const response = await client.callTool({ name: "finalize_research", arguments: { ...base, ...overrides } });
      expect(response.isError).not.toBe(true);
      const result = response.structuredContent!;
      expect(result).toMatchObject({ status: "not_ready", receipts_verified: 0, receipts_rejected: [], answer_checked: false, caveats: [], limits: [], must_report: [], sources: { validated: [], lead_only: [] } });
      const steps = (result.next_steps as string[]).join("\n");
      expect(steps).toContain(path); expect(steps).toContain(detail);
      if (steps.includes(".selection:")) expect(steps).toContain("community_searches[].review_corpora as JSON:");
      expect(result).not.toHaveProperty("carry_forward"); expect(result).not.toHaveProperty("finalization_receipt");
    });
  });

  it("caps issue lines at 30 and names the remaining count through the handler", async () => {
    await withClient("/mcp", async (client) => {
      const response = await client.callTool({ name: "finalize_research", arguments: { ...base, receipts: Array(35).fill(3) } });
      expect(response.isError).not.toBe(true);
      const steps = response.structuredContent!.next_steps as string[];
      expect(steps).toHaveLength(32); expect(steps[31]).toBe("and 5 more.");
      expect(steps[30]).toContain("receipts[29]:");
    });
  });

  it("reads optional empty lists as none, preserves the raw input, and leaves every other empty list invalid", () => {
    const raw = { ...base, principal_communities: [], intervention_identity: { status: "checked", interventions: [] }, community_searches: [{ ...community, review_corpora: [], report_identity: [] }], findings_card: { findings: [] } };
    const original = structuredClone(raw);
    const parsed = parseFinalizeResearchInput(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.principal_communities).toBeUndefined(); expect(parsed.data.findings_card).toBeUndefined();
    expect(parsed.data.intervention_identity?.interventions).toBeUndefined();
    expect(parsed.data.community_searches![0]!.review_corpora).toBeUndefined(); expect(parsed.data.community_searches![0]!.report_identity).toBeUndefined();
    expect(raw).toEqual(original);
    expect(parseFinalizeResearchInput({ ...base, full_text_search: { status: "run", queries: [] } }).success).toBe(false);
  });

  it("keeps a valid fixture's existing output unchanged by connector relaxation", async () => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "");
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", "");
    const expected = finalizeResearch(base, { secret: undefined, protocolNames: new Set(), findings: "closed" });
    await withClient("/mcp", async (client) => {
      const result = await client.callTool({ name: "finalize_research", arguments: base });
      expect(result.isError).not.toBe(true); expect(result.structuredContent).toEqual(expected);
    });
  });
});
