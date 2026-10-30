import { advisoryNotes } from "./helpers/finalize-next-steps-contract.js";
import { withoutLaterInputs } from "./helpers/tool-schema.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";
import { finalizeResearch, finalizeResearchInputSchema, finalizeResearchPublishedInputSchema, parseFinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { CARD } from "./helpers/findings-fixtures.js";

const base = {
  answer_draft: "Synthetic answer.", receipts: [], research_target: "Synthetic declaration check", research_depth: "deep",
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

describe("final check format recovery (owner answer 193a)", () => {
  const options = { secret: "format-recovery-secret-0123456789abcdef" };
  const usable = {
    ...base, answer_draft: "Synthetic answer.", absence_claims: [], scale_results: [], binary_results: [],
    safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
    user_observations: [], proposed_tests: []
  };
  const draft = () => [usable.answer_draft, ...finalizeResearch(usable, options).caveats].join("\n\n");

  it("checks the answer with two notes after dropping a database name and an unknown key", () => {
    const result = finalizeResearch({ ...usable, invented: true,
      harm_screen: [{ harm: "Synthetic harm", state: "not_found", sources_searched: ["PubMed"] }]
    }, options);
    expect(result.answer_checked).toBe(true);
    expect(result.notes).toHaveLength(4);
    expect(result.notes!.join(" ")).toContain("sources_searched[0]");
    expect(result.notes!.join(" ")).toContain("invented");
    expect(result.next_step_kinds).not.toContain("input_invalid");
    expect(result.next_steps.join(" ")).not.toContain("invented");
    expect(result.next_steps.join(" ")).not.toContain("PubMed");
  });

  it("maps only exact unambiguous enum spellings and leaves a database name unmapped", () => {
    const parsed = parseFinalizeResearchInput({ ...usable,
      harm_screen: [{ harm: "Synthetic harm", state: "Not Found", sources_searched: ["Case-Reports", "PubMed"] }]
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.harm_screen![0]).toMatchObject({ state: "not_found", sources_searched: ["case_reports"] });
    expect(parsed.notes).toHaveLength(3);
  });

  it("drops only a malformed findings card and still checks the answer", () => {
    const result = finalizeResearch({ ...usable, answer_draft: draft(), findings_card: {
      ...CARD, findings: [{ ...CARD.findings[0], certainty: "absolutely certain" }]
    } }, options);
    expect(result.answer_checked).toBe(true);
    expect(result.notes).toHaveLength(1);
    expect(result.notes![0]).toContain("findings_card.findings[0].certainty");
    expect(result.findings_card.status).toBe("rejected");
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
  });

  it("preserves valid sibling fields and list items when nested values fail", () => {
    const raw = { ...usable, full_text_search: { status: "run", queries: [], reason: "A valid explanation remains." },
      harm_screen: [
        { harm: "One harm", state: "not_found", sources_searched: ["pubmed_case_reports", "case_reports"], extra: true },
        { harm: 7, state: "not_checked" },
        { harm: "Another harm", state: "not_checked" }
      ]
    };
    const before = structuredClone(raw);
    const parsed = parseFinalizeResearchInput(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.full_text_search).toEqual({ status: "run", reason: "A valid explanation remains." });
    expect(parsed.data.harm_screen).toEqual([
      { harm: "One harm", state: "not_found", sources_searched: ["case_reports"] },
      { harm: "Another harm", state: "not_checked" }
    ]);
    // The second entry goes with its unusable required harm, and a note says so (the 30 Oct rerun).
    expect(parsed.notes).toHaveLength(5);
    expect(parsed.notes).toContain("harm_screen[1]: dropped as a whole, since its required harm could not be used: " +
      "send it again with that field usable, or leave it out.");
    expect(raw).toEqual(before);
  });

  it("returns every format problem once and does not spend another round on dropped fields alone", () => {
    const first = finalizeResearch({ ...usable, answer_draft: draft() }, options);
    const result = finalizeResearch({ ...usable, answer_draft: draft(), round_token: first.round_token,
      receipts: Array(35).fill(3), invented: true
    }, options);
    expect(result.notes).toHaveLength(36);
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.round).toEqual(first.round);
    expect(result.stopped).toBeUndefined();
  });

  it.each([null, [], "answer", { ...usable, answer_draft: undefined }, { ...usable, research_target: undefined }])(
    "keeps one clear not_ready message for an unusable call: %s", (raw) => {
      const result = finalizeResearch(raw, options);
      expect(result.status).toBe("not_ready");
      expect(result.answer_checked).toBe(false);
      expect(result.next_steps).toHaveLength(1);
      expect(result.next_steps[0]).toMatch(/needs.*answer_draft|needs.*research_target/u);
      expect(result.round).toBeUndefined();
    }
  );
});

describe("finalize_research published schemas and handler validation", () => {
  it.each(["/mcp", "/mcp/claude"] as const)("publishes the derived schema exactly on %s and passes invalid arguments to the handler", async (surface) => {
    await withClient(surface, async (client) => {
      const listed = (await client.listTools()).tools.find(({ name }) => name === "finalize_research")!;
      expect(withoutLaterInputs(listed.inputSchema)).toEqual(finalizeResearchPublishedInputSchema({ relaxed: surface === "/mcp" }));
      const invalid = { ...base, receipts: 9, invented: "field" };
      expect(finalizeResearchInputSchema.safeParse(invalid).success).toBe(false);
      const response = await client.callTool({ name: "finalize_research", arguments: invalid });
      expect(response.isError).not.toBe(true);
      expect(response.structuredContent).toMatchObject({ status: "receipts_unavailable", receipts_verified: 0, answer_checked: false });
      expect((response.structuredContent!.notes as string[]).join("\n")).toContain("invented");
    });
  });

  it("keeps the Claude schema identical to the strict schema's SDK conversion", () => {
    expect(finalizeResearchPublishedInputSchema({ relaxed: false })).toEqual(z.toJSONSchema(finalizeResearchInputSchema, { target: "draft-7", io: "input" }));
  });

  it.each([
    [{ findings_card: { findings: [{ claim: "Example", certainty: "moderate", applies_to: "Example", answer_quote: "Example", sources: [], why_not_usual: "Example", what_would_change_it: "Example" }] } }, "findings_card.findings[0].sources", "at least 1 item."],
    [{ intervention_identity: { status: "checked", interventions: [{ study_ids: ["10.1000/example"], label: "Example", status: "resolved", identity: { sponsor_or_maker: "Example", current_product: "Example" } }] } }, "intervention_identity.interventions[0].identity.registry_code", "expected text"],
    [{ community_searches: [{ ...community, review_corpora: [{ ...corpus, selection: "newest reviews" }] }] }, "community_searches[0].review_corpora[0].selection", "not a supported value"],
    [{ community_searches: [{ ...community, report_identity: [{ ...report, exact_firsthand: 1 }] }] }, "exact_firsthand", "unknown field"],
    [{ community_searches: [{ ...community, threads_read: 7 }] }, "community_searches[0].threads_read", "expected a list"]
  ])("reports malformed nested inputs as notes while checking the answer: %s", async (overrides, path, detail) => {
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", "input-validation-secret-01234567890123456789");
    await withClient("/mcp", async (client) => {
      const response = await client.callTool({ name: "finalize_research", arguments: { ...base, ...overrides } });
      expect(response.isError).not.toBe(true);
      const result = response.structuredContent!;
      expect(result).toMatchObject({
        answer_checked: true,
        receipts_rejected: [],
        receipts_verified: 0,
        status: "ready_with_limits"
      });
      const notes = (result.notes as string[]).join("\n");
      expect(notes).toContain(path); expect(notes).toContain(detail);
      expect(result.next_step_kinds).not.toContain("input_invalid");
      expect(result).toHaveProperty("carry_forward"); expect(result.finalization_receipt).toEqual(expect.any(String));
    });
  });

  it("returns every issue through the handler without a thirty-note cutoff", async () => {
    await withClient("/mcp", async (client) => {
      const response = await client.callTool({ name: "finalize_research", arguments: { ...base, receipts: Array(35).fill(3) } });
      expect(response.isError).not.toBe(true);
      const notes = response.structuredContent!.notes as string[];
      expect(notes).toHaveLength(35); expect(notes[34]).toContain("receipts[34]:");
      expect(response.structuredContent!.next_step_kinds).not.toContain("input_invalid");
    });
  });

  it("reads optional empty lists as none, preserves the raw input, and drops other unusable empty fields with a note", () => {
    const raw = { ...base, principal_communities: [], intervention_identity: { status: "checked", interventions: [] }, community_searches: [{ ...community, review_corpora: [], report_identity: [] }], findings_card: { findings: [] } };
    const original = structuredClone(raw);
    const parsed = parseFinalizeResearchInput(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.principal_communities).toBeUndefined(); expect(parsed.data.findings_card).toBeUndefined();
    expect(parsed.data.intervention_identity?.interventions).toBeUndefined();
    expect(parsed.data.community_searches![0]!.review_corpora).toBeUndefined(); expect(parsed.data.community_searches![0]!.report_identity).toBeUndefined();
    expect(raw).toEqual(original);
    const tooShort = parseFinalizeResearchInput({ ...base, full_text_search: { status: "run", queries: [] } });
    expect(tooShort.success).toBe(true);
    if (tooShort.success) expect(tooShort.data.full_text_search?.queries).toBeUndefined();
    expect(tooShort.notes.join(" ")).toContain("full_text_search.queries");
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
