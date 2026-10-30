import { advisoryNotes } from "./helpers/finalize-next-steps-contract.js";
import { describe, expect, it } from "vitest";
import { InMemoryAtlasPageSource, InMemoryAtlasPublicationStore, type AtlasPageSource, type AtlasPageFinding } from "@askrigor/evidence-repository";
import { atlasLookupInputSchema, lookupAtlas } from "../apps/research-mcp/src/atlas/lookup-tool.js";
import { loadAtlasFindings } from "../apps/research-mcp/src/atlas/page-data.js";
import { atlasSearchQuery } from "../apps/research-mcp/src/atlas/search.js";
import { ATLAS_LOOKUP_FAILED_CAVEAT, atlasReceiptFinding, atlasSourceDigest, checkAtlasReuse, uncheckedAtlasCaveat } from "../apps/research-mcp/src/atlas/reuse.js";
import { issueResearchReceipt, researchTargetDigest, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { finalizeResearch, type FinalizeResearchInput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { RESEARCH_OPERATIONS, registerTools } from "../apps/research-mcp/src/register-tools.js";
import { publications } from "./helpers/atlas-participation-fixture.js";

const SECRET = "atlas-lookup-test-secret-01234567890123456789";
const now = () => new Date("2026-11-04T12:00:00.000Z");
const receipt = { secret: SECRET, now };
const TARGET = "Zentarine in Velmor syndrome";
const origin = "https://askrigor.com";
const url = `${origin}/atlas/findings/P-1001`;
const reader = { getResearchFrontier: async () => { throw new Error("RESEARCH_FRONTIER_NOT_FOUND"); },
  searchResearchFrontiers: async () => ({ catalog_schema: "askrigor.living-evidence.research-frontier-catalog.v1", result_count: 0, has_more: false, matches: [] }) };
const source = async () => new InMemoryAtlasPageSource({ publications: await publications() });
const lookup = async (input: object = {}) => lookupAtlas({ query: "zentarine", research_target: TARGET, ...input }, { source: await source(), reader, receipt, now });
const verified = (token: string) => {
  const value = verifyResearchReceipt(token, receipt);
  if (!value.ok) throw new Error(value.reason);
  return { kind: value.kind, claims: value.claims };
};
const sign = (found: string[] = [], target = TARGET) => issueResearchReceipt("atlas_lookup", {
  words: ["zentarine"], target: researchTargetDigest(target), found, origin,
}, receipt);
const check = (found: string[], declarations: unknown[], draft = "", extra: string[] = []) => checkAtlasReuse({
  receipts: [verified(sign(found)), ...extra.map(verified)], target: researchTargetDigest(TARGET), required: true,
  declarations: declarations as never, draft,
});

describe("Atlas lookup through the existing public search tool", () => {
  it("matches exactly what the pages search and signs normalized words, public numbers, time and target", async () => {
    const output = await lookup({ query: "ZÉNTARINE" });
    const page = await loadAtlasFindings(await source(), { search: atlasSearchQuery("ZÉNTARINE").query! });
    expect(output.findings.map((f) => f.publication_number)).toEqual(page.findings.map((f) => f.publicationNumber));
    expect(output.findings).toHaveLength(3);
    expect(output.findings[0]).toMatchObject({ state: "Not checked by supervisors yet", certainty: "low", wording: expect.any(String), sources: [[{ scheme: "pmid", value: "40123456" }]], topic: { key: "velmor-syndrome" } });
    expect(output.findings[0]!.page_url).toBe(`${origin}/atlas/findings/${output.findings[0]!.publication_number}`);
    expect(verifyResearchReceipt(output.research_receipt!, receipt)).toMatchObject({ ok: true, kind: "atlas_lookup", issued_at: now().toISOString(), claims: {
      words: ["zentarine"], target: researchTargetDigest(TARGET), found: page.findings.map(atlasReceiptFinding),
    } });
    expect(verifyResearchReceipt(output.research_receipt!.replace("zentarine", "changed"), receipt).ok).toBe(false);
    expect(verifyResearchReceipt(output.research_receipt!, { ...receipt, now: () => new Date("2026-11-06T12:00:00Z") }).ok).toBe(false);
  });
  it("supports exact topic keys, empty matches and one-character searches", async () => {
    expect((await lookup({ query: undefined, topic_key: "velmor-syndrome" })).findings).toHaveLength(3);
    const empty = await lookup({ query: undefined, topic_key: "other-topic" });
    expect(empty.findings).toEqual([]);
    expect(empty.research_receipt).toBeDefined();
    expect((await lookup({ query: "z" })).findings).toEqual([]);
    expect((await lookup({ query: "zent" })).findings).toEqual([]);
  });
  it("preserves the pages' bounds, and returns a bounded slice with more state", async () => {
    for (const query of ["", "a".repeat(301), Array(21).fill("word").join(" ")]) expect(atlasLookupInputSchema.safeParse({ query }).success).toBe(false);
    expect(atlasLookupInputSchema.safeParse({ query: "zentarine", limit: 21 }).success).toBe(false);
    const output = await lookup({ limit: 1 });
    expect(output.findings).toHaveLength(1);
    expect(output.has_more).toBe(true);
  });
  it("never exposes rejected, held, withdrawn or accepted-but-not-written publications", async () => {
    const store = await publications();
    await store.decide({ cardNumber: 4242, findingNumber: 1, state: "rejected", atlasNumber: null, decidedAt: now().toISOString() });
    await store.withdraw({ reason: "owner_unpublished", publicationNumbers: ["P-1002"], ownerReason: "private reason", withdrawnAt: now().toISOString() });
    await store.decide({ cardNumber: 4243, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: now().toISOString() });
    const output = await lookupAtlas({ query: "zentarine", research_target: TARGET }, { source: new InMemoryAtlasPageSource({ publications: store }), reader, receipt, now });
    expect(output.findings).toEqual([]);
    expect(JSON.stringify(output)).not.toContain("private reason");
  });
  it("shows checked current canonical wording, source IDs, links, question and topic leads", async () => {
    const store = await publications();
    await store.decide({ cardNumber: 4242, findingNumber: 1, state: "accepted", atlasNumber: "F-1001", decidedAt: now().toISOString() });
    const memory = new InMemoryAtlasPageSource({ publications: store });
    const finding: AtlasPageFinding = { atlasNumber: "F-1001", question: "What comes next?", links: [{ atlasNumber: "F-1002", relation: "narrows", direction: "outgoing" }], entryKind: "lead", label: "lead", topic: { key: "velmor-syndrome", label: "Velmor syndrome" }, versionNumber: 1,
      content: { wording: "Current canonical zentarine lead", certainty: "very_low", appliesTo: "Adults", numbers: [], verifiedBases: [], whyNotUsual: "Open question", whatWouldChangeIt: "A trial" },
      erased: false, acceptedOn: "2026-11-04", researchCheckedOn: "2026-11-04", askrigorVersion: "0.1.0",
      sources: [[{ scheme: "doi", value: "10.0000/lead" }]], contradicts: [], replacedBy: [] };
    const publicSource: AtlasPageSource = { read: (work) => memory.read((reads) => work({ ...reads,
      listPublications: (query) => reads.listPublications({ ...query, topicKey: undefined }),
      readFindings: async (numbers) => numbers.includes("F-1001") ? [finding] : [],
    })) };
    const output = await lookupAtlas({ query: "zentarine", research_target: TARGET }, { source: publicSource, reader, receipt, now });
    expect(output.findings.find((f) => f.publication_number === "P-1001")).toMatchObject({ state: "checked", atlas_number: "F-1001", wording: finding.content.wording, question: finding.question, links: finding.links });
    expect(output.topic_leads[0]!.findings[0]!.atlas_number).toBe("F-1001");
  });
  it("returns matching stored plans' open trails, excludes resolved trails, and reports truncation", async () => {
    const frontierId = "11111111-1111-4111-8111-111111111111";
    const topic = { topic_id: "22222222-2222-4222-8222-222222222222", canonical_key: "velmor-syndrome", label: "Velmor syndrome" };
    const question = { question_id: "33333333-3333-4333-8333-333333333333", normalized_question: "Does zentarine help?",
      dimensions: { population: null, program_or_exposure: null, comparator: null, outcome: null, horizon: null, setting: null } };
    const coverage = { lane_count: 1, pass_count: 1, partial_pass_count: 0, blocked_pass_count: 0, candidate_count: 0,
      selected_candidate_count: 0, open_trail_count: 25, coverage_gap_count: 0, latest_pass_at: null };
    const calls: object[] = [];
    const plans = {
      searchResearchFrontiers: async (input: object) => { calls.push(input); return {
        catalog_schema: "askrigor.living-evidence.research-frontier-catalog.v1", result_count: 1, has_more: false,
        matches: [{ frontier_id: frontierId, topic: { ...topic, aliases: [] }, question, frontier_state: "actionable", coverage, match_fields: ["question"], text_rank: 1 }],
      }; },
      getResearchFrontier: async (input: object) => { calls.push(input); return {
        frontier_schema: "askrigor.living-evidence.research-frontier.v1", result_count: 1,
        frontiers: [{ frontier_id: frontierId, topic, question, lanes: [], passes: [], current_candidates: [],
          current_trails: Array.from({ length: 27 }, (_, i) => ({
            trail_id: `${String(i + 10000000)}-1111-4111-8111-111111111111`, frontier_id: frontierId,
            trail_kind: "formal_followup", version_id: frontierId, lane_id: null, target_start: null, target_end_exclusive: null,
            description: `Research trail ${i}`, rationale: "Synthetic open question", priority: "high",
            state: i < 25 ? "open" : "resolved", next_capability: "search_pubmed", blocked_reason_code: null, resolution_note: null,
          })), contribution_receipts: [], frontier_state: "actionable", next_capabilities: [], terminal_boundaries: [], canonical_sha256: "a".repeat(64) }],
      }; },
    };
    const output = await lookupAtlas({ query: "zentarine", research_target: TARGET }, { source: await source(), reader: plans, receipt, now });
    expect(output.status).toBe("complete");
    expect(output.open_trails).toHaveLength(20); expect(output.trails_have_more).toBe(true);
    expect(output.open_trails.every((trail) => trail.state === "open")).toBe(true);
    expect(calls).toEqual([{ query: "zentarine", limit: 10 }, { frontierId, includeHistory: false }]);
    const unavailable = await lookupAtlas({ query: "zentarine", research_target: TARGET }, { source: await source(), receipt, now });
    expect(unavailable.status).toBe("partial"); expect(unavailable.findings).toHaveLength(3);
    expect(unavailable.research_receipt).toBeDefined();
  });
  it("bounds large responses by whole findings and signs exactly the remaining records", async () => {
    const memory = await source();
    const large: AtlasPageSource = { read: (work) => memory.read(async (reads) => {
      const prototype = (await reads.listPublications({ limit: 1 }))[0]!;
      return work({ ...reads, listPublications: async () => Array.from({ length: 30 }, (_, i) => ({
        ...prototype, publicationNumber: `P-${2000 + i}`, state: "unreviewed" as const, atlasNumber: null,
        published: { ...prototype.published!, topic: null,
          sources: Array.from({ length: 10 }, (_, n) => `10.0000/${n}${"a".repeat(280)}`),
          claim: `zentarine ${"a".repeat(480)}`, applies_to: "b".repeat(290),
        },
      })) });
    }) };
    const output = await lookupAtlas({ query: "zentarine", research_target: TARGET, limit: 20 }, { source: large, reader, receipt, now });
    expect(output.findings.length).toBeGreaterThan(0); expect(output.findings.length).toBeLessThan(20);
    expect(output.has_more).toBe(true); expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThanOrEqual(52_000);
    const signed = verified(output.research_receipt!).claims.found as string[];
    expect(signed.map((row) => row.split("|")[0])).toEqual(output.findings.map((f) => f.publication_number));
  });
  it("signs bounded any-script query words even when their encoded token exceeds the ordinary receipt limit", async () => {
    const output = await lookup({ query: "अ".repeat(300) });
    expect(output.research_receipt!.length).toBeGreaterThan(2048);
    expect(verifyResearchReceipt(output.research_receipt!, receipt).ok).toBe(true);
  });
  it("distinguishes inaccessible and failed reads from no match without signing success", async () => {
    expect(await lookupAtlas({ query: "zentarine" })).toMatchObject({ status: "inaccessible", findings: [] });
    const output = await lookupAtlas({ query: "zentarine" }, { source: { read: async () => { throw Error("PRIVATE ERROR"); } }, receipt, now });
    expect(output.status).toBe("error"); expect(output.research_receipt).toBeUndefined();
    expect(JSON.stringify(output)).not.toContain("PRIVATE ERROR");
  });

  it("signs an attempt receipt marked failed when the lookup cannot run, which the check accepts with a stated limit", async () => {
    // 26 Oct regressions, finding 2: a step no call can close this turn must not stall the check.
    const unconfigured = await lookupAtlas({ query: "zentarine", research_target: TARGET }, { reader, receipt, now });
    const failing = await lookupAtlas({ query: "zentarine", research_target: TARGET },
      { source: { read: async () => { throw Error("PRIVATE ERROR"); } } as never, reader, receipt, now });
    for (const [output, status] of [[unconfigured, "inaccessible"], [failing, "error"]] as const) {
      expect(output.status).toBe(status);
      expect(output.findings).toEqual([]);
      const token = output.research_receipt!;
      expect(verified(token).claims).toMatchObject({ failed: status, target: researchTargetDigest(TARGET) });
      const result = checkAtlasReuse({ receipts: [verified(token)], target: researchTargetDigest(TARGET), required: true,
        declarations: [], draft: "" });
      expect(result.steps.map(({ text }) => text).join(" ")).not.toContain("Search the Atlas first");
      expect(result.caveats).toEqual([ATLAS_LOOKUP_FAILED_CAVEAT]);
    }
    // A successful lookup beside a failed one is a lookup that ran: no limit for it.
    const mixed = checkAtlasReuse({ receipts: [verified(unconfigured.research_receipt!), verified(sign())],
      target: researchTargetDigest(TARGET), required: true, declarations: [], draft: "" });
    expect(mixed.caveats).not.toContain(ATLAS_LOOKUP_FAILED_CAVEAT);
    expect(JSON.stringify(failing)).not.toContain("PRIVATE ERROR");
  });
  it("keeps 33 tools and allows the public lookup without enrolling a research account", async () => {
    const tools = new Map<string, { config: any; execute: Function }>();
    registerTools({ registerTool: (name: string, config: any, execute: Function) => tools.set(name, { config, execute }) } as never,
      { researchAccessRequired: true, atlasLookupSource: await source(), atlasLookupReader: reader });
    expect(RESEARCH_OPERATIONS).toHaveLength(33);
    const tool = tools.get("search_research_frontiers")!;
    expect(tool.config._meta.securitySchemes).toContainEqual({ type: "noauth" });
    const result = await tool.execute({ query: "zentarine", research_target: TARGET }, {});
    expect(result.isError).not.toBe(true); expect(result.structuredContent.findings).toHaveLength(3);
  });
});

describe("Atlas reuse declarations: exact, any-language checks", () => {
  const row = "P-1001|F-1001|c|";
  const quote = `日本語の所見を更新します。[所見](${url})`;
  const entry = { number: "F-1001", relation: "updates", answer_quote: quote, page_url: url };
  it("requires one declaration per finding, accepts not_relevant without a quote, and accepts no matches", () => {
    expect(check([row], []).steps[0]!.text).toContain("P-1001");
    expect(check([row], [{ number: "P-1001", relation: "not_relevant" }]).steps).toEqual([]);
    expect(check([], []).steps).toEqual([]);
    expect(check([row], [entry], quote).steps).toEqual([]);
  });
  it("rejects invented numbers, repeated aliases, changed quotes and another finding's page", () => {
    expect(check([row], [{ ...entry, number: "P-9999" }], quote).steps.some((s) => s.text.includes("not returned"))).toBe(true);
    expect(check([row], [entry, { ...entry, number: "P-1001" }], quote).steps.some((s) => s.text.includes("repeats"))).toBe(true);
    expect(check([row], [entry], "not that sentence").steps.some((s) => s.text.includes("copy"))).toBe(true);
    for (const bad of [`${url}9`, `${url}?fake=1`, `${origin}/atlas/findings/P-1002`]) {
      const badQuote = `[Atlas](${bad})`;
      expect(check([row], [{ ...entry, answer_quote: badQuote }], badQuote).steps.some((s) => s.text.includes("own Atlas"))).toBe(true);
    }
  });
  it("makes an unchecked finding a lead until at least one of its sources is read again", async () => {
    const result = await lookup();
    const claims = verified(result.research_receipt!).claims;
    const row = (claims.found as string[]).find((s) => s.startsWith("P-1001|"))!;
    const used = { ...entry, number: "P-1001" };
    expect(check([row], [used], quote).steps).toContainEqual(expect.objectContaining({ kind: "research" }));
    expect(check([row], [used], quote).caveats).toContain(uncheckedAtlasCaveat("P-1001"));
    expect(check([row], [{ ...used, lead_only: true }], quote).steps).toEqual([]);
    const read = issueResearchReceipt("full_text_read", { doi: "10.0000/synthetic-velmor-a" }, receipt);
    expect(check([row], [used], quote, [read]).steps).toEqual([]);
    const metadataOnly = issueResearchReceipt("doi_resolution", { doi: "10.0000/synthetic-velmor-a" }, receipt);
    expect(check([row], [used], quote, [metadataOnly]).steps.some((s) => s.kind === "research")).toBe(true);
  });
});

const researchInput = (tokens: string[] = []): FinalizeResearchInput => ({ receipts: tokens, research_target: TARGET,
  research_depth: "deep", treatment_choice: "not_compared", community_evidence: "researched", key_sources: [],
  answer_draft: "A synthetic research answer.", absence_claims: [], scale_results: [], binary_results: [], safety_claims: [], safety_question: false,
  key_terms: [], recommendations: [], mechanism_claims: [], user_observations: [], proposed_tests: [],
});
const finalCheck = (input: FinalizeResearchInput) => finalizeResearch(input, receipt);
const atlasSteps = (input: FinalizeResearchInput) => advisoryNotes(finalCheck(input)).filter((s) => /Atlas|atlas_/u.test(s));
describe("final check Atlas admission", () => {
  it("asks for the lookup as a research step, bound to this research target", () => {
    const input = researchInput(); const result = finalCheck(input);
    expect(advisoryNotes(result)).toEqual(expect.arrayContaining([expect.stringContaining("Search the Atlas first")]));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(atlasSteps(researchInput([sign([], "other target")]))).toHaveLength(1);
    expect(atlasSteps(researchInput([sign()]))).toEqual([]);
  });
  it("exempts the same short lookups and pre-triage emergencies, but not symptom questions", () => {
    const input = { ...researchInput(), community_evidence: "not_relevant" as const, not_relevant_reason: "A short lookup.", question_about: "other" as const };
    expect(atlasSteps({ ...input, not_relevant_basis: "no_real_world_outcome" })).toEqual([]);
    expect(atlasSteps({ ...input, not_relevant_basis: "emergency_before_triage" })).toEqual([]);
    expect(atlasSteps({ ...input, not_relevant_basis: "no_real_world_outcome", question_about: "symptom_or_test_result" })).not.toEqual([]);
  });
});


describe("passing final check carries Atlas reuse into the saved-card receipt", () => {
  it("signs each used number and relation, excludes not_relevant, and requires the unchecked caveat", async () => {
    const { CARD } = await import("./helpers/findings-fixtures.js");
    const audit = issueResearchReceipt("study_audit", { doi: "10.1002/art.41142", content: "a".repeat(16) }, receipt);
    const quote = `Cette réponse précise [le constat](${url}).`;
    const declarations = [{ number: "P-1001", relation: "narrows", answer_quote: quote, page_url: url },
      { number: "P-1002", relation: "not_relevant" }];
    const input = { ...researchInput([audit, sign(["P-1001|F-1001|c|", "P-1002||u|"])]),
      community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other",
      not_relevant_reason: "A synthetic definition used to isolate this exact check.",
      commercial_review_applicability: { status: "not_applicable", reason: "The fixture concerns no commercial product." },
      intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient intervention." },
      lab_preparation: { status: "not_applicable", reason: "No lab result is interpreted or test planned." },
      full_text_search: { status: "not_needed", reason: "The fixture isolates the Atlas reuse contract." },
      key_sources: [{ id: "10.1002/art.41142", status: "validated", read_depth: "full_text_audited", answer_marker: "2020 review" }],
      atlas_reuse: declarations, findings_card: CARD, answer_draft: `${CARD.findings[0]!.answer_quote}\n\n${quote}`,
    } as FinalizeResearchInput;
    const first = finalizeResearch(input, { ...receipt, findings: "save" });
    const passed = finalizeResearch({ ...input, answer_draft: `${input.answer_draft}\n\n${first.caveats.join("\n\n")}` }, { ...receipt, findings: "save" });
    expect(passed.next_steps).toEqual([]);
    expect(passed.findings_card.status).toBe("checked");
    expect(verified(passed.finalization_receipt!).claims.atlas).toEqual(["P-1001:narrows"]);
    const hash = atlasSourceDigest({ scheme: "doi", value: "10.1002/art.41142" });
    const fromAtlas = { ...input, receipts: [sign([`P-1001|F-1001|c|${hash}`])], atlas_reuse: [declarations[0]!],
      key_sources: [{ ...input.key_sources[0]!, read_depth: "atlas_checked" as const }],
      findings_card: { ...CARD, findings: [{ ...CARD.findings[0]!, tags: [] }] },
    } as FinalizeResearchInput;
    const atlasFirst = finalizeResearch(fromAtlas, { ...receipt, findings: "save" });
    const atlasPassed = finalizeResearch({ ...fromAtlas, answer_draft: `${fromAtlas.answer_draft}\n\n${atlasFirst.caveats.join("\n\n")}` }, { ...receipt, findings: "save" });
    expect(atlasPassed.next_steps).toEqual([]); expect(atlasPassed.findings_card.status).toBe("checked");
    expect(verified(atlasPassed.finalization_receipt!).claims.bases).toEqual(["none"]);
    expect(atlasPassed.findings_card.beyond_quick_answer).toBe(0);
    for (const bad of ["P-1001||u|", "P-1001|F-1001|c|different-source"]) {
      const refused = finalCheck({ ...fromAtlas, receipts: [sign([bad])] });
      expect(refused.next_steps.some((step) => step.includes("no checked Atlas finding"))).toBe(true);
    }
    const unchecked = { ...input, receipts: [audit, sign(["P-1001||u|"])], atlas_reuse: [{ ...declarations[0]!, lead_only: true }] };
    const result = finalCheck(unchecked);
    expect(result.caveats).toContain(uncheckedAtlasCaveat("P-1001"));
    expect(result.limits.some((s) => s.includes("P-1001"))).toBe(true);
  });
});
