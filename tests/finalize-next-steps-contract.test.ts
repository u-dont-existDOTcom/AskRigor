import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FINALIZE_RESEARCH_CONTRACT, TOOL_LIST_REFRESH_HINT, finalizeResearch,
  type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  allowedNextStepIdentifiers, assertNextStepsContract, inventory, schemaIdentifiers, unknownNextStepIdentifiers
} from "./helpers/finalize-next-steps-contract.js";

const SECRET = "finalizer-contract-links-test-secret-0123456789";
const TARGET = "How clinoptilolite ion exchange works";
const DOI = "10.1000/x";
const PMID = "34285282";
const PMCID = "PMC10518852";
const VIDEO = "aaaaaaaaaaa";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });
const study = (id = DOI) => sign("study_audit", { id, status: "complete_no_unresolved_fields" });
const declaration = { status: "not_applicable" as const, reason: "Pure ion-exchange mechanism involves no product or service people buy." };
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => ({
  full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate other completion checks." },
  receipts: [study()], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", not_relevant_reason: "Pure chemical mechanism with no real-world outcome.",
  commercial_review_applicability: declaration, intervention_identity: declaration,
  key_sources: [{ id: DOI, status: "validated" }], absence_claims: [], scale_results: [],
  answer_draft: `[Study](https://doi.org/${DOI}) describes ion exchange.`, ...overrides
});
const sourceInput = (id: string, answer: string, receipts = [study(id)]) => base({
  receipts, key_sources: [{ id, status: "validated" }], answer_draft: answer
});
const discovery = (claims: Parameters<typeof issueResearchReceipt>[1] = {}) => sign("youtube_survey", {
  videos: [VIDEO], q: "angle1", t: Date.now() - 20_000, target: researchTargetDigest(TARGET), access: "complete", ...claims
});
const findings = {
  videos_reviewed: [VIDEO], benefit_reports: "One improvement.", no_effect_reports: "One no change.",
  adverse_reports: "No harms reported.", creators_versus_commenters: "Independent reports.", effect_on_answer: "Weak signal."
};
const reviewSearch = {
  community: "Reviews", platform: "review_site" as const, queries: [TARGET],
  threads_read: [{ url: "https://reviews.example/product" }],
  review_corpora: [{ outcome_search: { queries: [TARGET], directions: ["benefit" as const, "no_effect" as const, "worse" as const] }, product: "Clinoptilolite", reviews_read: 2, selection: "all" as const }]
};

describe("finalize next-step identifier contract", () => {
  it("derives allowed identifiers from all schema depths, enums, tool names and reviewed output fields", () => {
    expect(inventory.tools).toHaveLength(33);
    for (const identifier of ["registry_code", "other_variant_excluded", "outcome_search", "outcome_search_boundary",
      "full_text_search", "run", "not_needed", "ratings_shown", "no_text_search", "search_blocked", "benefit", "no_effect", "worse", "adverse", "stopped", "minimal_important_difference",
      "none_established", "finalize_research", "research_receipt"]) expect(allowedNextStepIdentifiers.has(identifier)).toBe(true);
    expect(schemaIdentifiers({ properties: { array: { items: { anyOf: [
      { properties: { nested_field: { enum: ["enum_value"] } } }, { const: "literal_value" }
    ] } } } })).toEqual(new Set(["array", "nested_field", "enum_value", "literal_value"]));
    expect(unknownNextStepIdentifiers(["Give unknown_not_sendable."])).toEqual(["unknown_not_sendable"]);
    // Other AskRigor tools' published inputs are legitimate routes for a next step.
    for (const published of ["rediscovery_leads", "research_question", "broad_treatment_choice", "product_identity", "pmcid"])
      expect(allowedNextStepIdentifiers.has(published)).toBe(true);
  });
  it("pins descriptive catalog wording for the changed contract and link fields", () => {
    const tool = inventory.tools.find(({ name }) => name === "finalize_research")!;
    expect(tool.description).toContain(
      "visible links to each key study, and the caveats, and is not stored. Result: " +
      "contract (the server's input contract version); not_ready with the remaining steps and one connector-refresh " +
      "hint when a required declaration is missing;"
    );
    const input = tool.inputSchema as { properties: Record<string, { description: string }> };
    expect(input.properties.key_sources!.description).toBe(
      "Lists each study the conclusions depend on: validated after a full-text method audit, or lead_only " +
      "when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text. " +
      "With answer_draft, each study has a visible link containing its identifier or its PubMed-receipt DOI."
    );
    expect(input.properties.commercial_review_applicability!.description).toContain(
      "Records a required declaration when community evidence is researched, or when no_real_world_outcome is declared with key studies."
    );
    const searches = tool.inputSchema as { properties: { community_searches: { items: { properties: {
      review_corpora: { description: string; items: { properties: Record<string, {
        description: string; properties?: Record<string, { description: string }>
      }> } }
    } } } } };
    const corpora = searches.properties.community_searches.items.properties.review_corpora;
    expect(corpora.description).toBe(
      "Records each product's review corpus on a review_site: star ratings when given, written reviews shown, " +
      "reviews read and their selection, and outcome-search queries and directions or the review-text search boundary."
    );
    const fields = corpora.items.properties;
    expect(fields.ratings_shown!.description).toBe("Records the star-rating count shown by the site, separate from written reviews.");
    expect(fields.reviews_shown!.description).toBe("Records the written-review count shown by the site, separate from star ratings.");
    expect(fields.outcome_search!.description).toBe("Records outcome searches run within this product's written reviews, as the model's declaration. Exactly one of outcome_search or outcome_search_boundary is present.");
    expect(fields.outcome_search_boundary!.description).toBe("Records why this product's reviews could not be searched for the outcome; the reviews read are a preview, not a measure of how often it helps or harms.");
    expect(fields.outcome_search!.properties!.queries!.description).toBe("Lists searches run in the site's review text for the outcome, in reviewers' everyday words and languages.");
    expect(fields.outcome_search!.properties!.directions!.description).toBe("Lists distinct searched directions, including benefit, no_effect and worse or adverse.");
    for (const name of ["finalize_research", "get_protocol_manifest"]) {
      const output = inventory.tools.find((entry) => entry.name === name)!.outputSchema as { properties: Record<string, { description: string }> };
      expect(output.properties.contract!.description).toBe("Records the server's finalize_research input contract version.");
    }
  });

  // These inputs use the signed discovery, study/lead, coverage, community and
  // product declarations from the existing finalizer fixtures. The helper also
  // checks every call in those suites, including their finer branch variations.
  const corpus: Array<[string, Partial<FinalizeResearchInput>]> = [
    ["legacy request", { community_evidence: "researched", commercial_review_applicability: undefined,
      intervention_identity: undefined, scale_results: undefined }],
    ["missing nontrigger declarations", { not_relevant_basis: undefined, not_relevant_reason: undefined }],
    ["contradictory comparison", { treatment_choice: "compared" }],
    ["rejected receipt", { receipts: ["not-a-receipt"] }],
    ["missing answer", { answer_draft: undefined }],
    ["missing scale", { scale_results: undefined }],
    ["missing absence claims", { absence_claims: undefined }],
    ["missing full-text declaration", { full_text_search: undefined }],
    ["unmatched full-text query", { full_text_search: { status: "run", queries: ["METHODS:fixture"] } }],
    ["missing commercial reason", { commercial_review_applicability: { status: "not_applicable" } }],
    ["missing commercial products", { commercial_review_applicability: { status: "required" } }],
    ["missing intervention reason", { intervention_identity: { status: "not_applicable" } }],
    ["inconsistent intervention", { intervention_identity: { status: "not_applicable", reason: declaration.reason,
      interventions: [{ study_ids: [DOI], label: "Coded product", status: "resolved" }] } }],
    ["missing interventions", { intervention_identity: { status: "checked" } }],
    ["missing resolved identity", { intervention_identity: { status: "checked", interventions: [{ study_ids: [DOI], label: "Coded product", status: "resolved" }] } }],
    ["foreign intervention source", { intervention_identity: { status: "checked", interventions: [{ study_ids: ["10.1000/other"], label: "Coded product", status: "unresolved" }] } }],
    ["unresolved identity", { intervention_identity: { status: "checked", interventions: [{ study_ids: [DOI], label: "Coded product", status: "unresolved", identity: { registry_code: "C1", sponsor_or_maker: "Maker", current_product: "Product" } }] } }],
    ["unknown key study", { key_sources: [{ id: "unidentified study", status: "validated" }] }],
    ["PMID without receipt", { key_sources: [{ id: PMID, status: "validated" }] }],
    ["PMID with DOI", { receipts: [sign("pubmed_record", { pmid: PMID, doi: DOI })], key_sources: [{ id: PMID, status: "validated" }] }],
    ["PMID with open PMC but no DOI", { receipts: [sign("pubmed_record", { pmid: PMID, doi: "", pmcid: PMCID })], key_sources: [{ id: PMID, status: "lead_only" }] }],
    ["untried open PMC", { receipts: [sign("pubmed_record", { pmid: PMID, doi: DOI, pmcid: PMCID }), sign("full_text_lead", { doi: DOI })], key_sources: [{ id: PMID, status: "lead_only" }] }],
    ["unproven DOI lead", { receipts: [], key_sources: [{ id: DOI, status: "lead_only" }] }],
    ["unproven PMCID lead", { receipts: [], key_sources: [{ id: PMCID, status: "lead_only" }] }],
    ["first pass missing offers", { research_depth: "first_pass" }],
    ["first pass excessive focuses", { research_depth: "first_pass", open_leads: Array.from({ length: 4 }, (_, n) => ({ direction: "studies", topic: `Focus ${n}`, why: "Incomplete methods." })), another_pass_estimate: "some time" }],
    ["absent null sources", { absence_claims: [{ quote: "No effect.", state: "direct_null_evidence" }] }],
    ["unaudited null sources", { absence_claims: [{ quote: "No effect.", state: "bounded_exclusion", studies: ["10.1000/other"] }] }],
    ["no literature search", { absence_claims: [{ quote: "Not found.", state: "support_not_located" }] }],
    ["scale problems", { scale_results: [{ quote: "No score.", scale: "ISI", range: { min: 0, max: 28 }, better: "lower", values: [6], benchmark: { value: 7, kind: "clinical_cutoff" } }] }],
    ["internal labels", { answer_draft: "api_visible_complete; finalize_research. strict-core cohort and separately labeled adjacent cohorts. Z8jn_6WMquo" }],
    ["missing answer language", { caveat_renderings: [{ caveat: "Caveat.", text: "Limite." }] }],
    ...["continue_research", "first_pass_with_open_leads"].map((boundary): [string, Partial<FinalizeResearchInput>] => [boundary, {
      receipts: [study(), sign("treatment_coverage", { target: researchTargetDigest(TARGET), broad: false, boundary })], treatment_choice: "compared"
    }]),
    ...["not_requested", "buy_options", "no_live_option_found"].map((status): [string, Partial<FinalizeResearchInput>] => [status, {
      shopping: { status: status as "buy_options", offers: [{ product: "Product", url: "https://seller.example/product", role: "buy_option", offer_state: "domestic_orderable" }] }
    }]),
    ["product declarations", { community_evidence: "researched", commercial_review_applicability: { status: "required", products: ["Clinoptilolite"] },
      receipts: [study(), discovery(), sign("youtube_video_audit", { video: VIDEO, records: 2, state: "api_visible_complete", lock: "pass" })],
      community_findings: findings, principal_communities: [{ name: "Reviews", platform: "review_site" }, { name: "YouTube", platform: "youtube" }], community_searches: [reviewSearch] }],
    ["unadmitted product corpus", { community_evidence: "researched", commercial_review_applicability: { status: "required", products: ["Clinoptilolite"] },
      community_findings: { ...findings, product_corpora: [{ product: "Other product", video_ids: [VIDEO], exact_product_signal: "Weak signal." }] } }],
    ...[{ inc: 1 }, { inc: 1, rl: 1 }, { target: researchTargetDigest("other target") }, { videos: [], q: "" }].map((claims): [string, Partial<FinalizeResearchInput>] => [JSON.stringify(claims), {
      community_evidence: "researched", receipts: [study(), discovery(claims)], material_video_ids: [VIDEO]
    }])
  ];
  it.each(corpus)("uses sendable identifiers: %s", (_name, overrides) => {
    assertNextStepsContract(finalizeResearch(base(overrides), { secret: SECRET }));
  });
  it("reports the contract when receipt verification is unavailable", () => {
    expect(finalizeResearch(base(), { secret: undefined })).toMatchObject({ contract: FINALIZE_RESEARCH_CONTRACT, status: "receipts_unavailable" });
  });
});

describe.each(["gate", "MCP endpoint"] as const)("finalizer contract, links and applicability through %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorHttpServer({ publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false, privateOrchestrationEnabled: false });
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
    client = new Client({ name: "finalizer-contract-test", version: "0.1.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)));
  });
  afterAll(async () => {
    await client?.close();
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
  });
  const call = async (input: FinalizeResearchInput): Promise<FinalizeResearchOutput> => {
    if (surface === "gate") return assertNextStepsContract(finalizeResearch(input, { secret: SECRET }));
    const result = await client!.callTool({ name: "finalize_research", arguments: { ...input } });
    expect(result.isError).not.toBe(true);
    return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
  };
  const complete = async (input: FinalizeResearchInput) => {
    const first = await call(input);
    return call({ ...input, answer_draft: `${input.answer_draft}\n\n${first.caveats.join(" ")}` });
  };

  it("names missing declarations and appends the exact refresh hint once for version skew", async () => {
    const old = base({ community_evidence: "researched", commercial_review_applicability: undefined, intervention_identity: undefined, scale_results: undefined });
    const result = await call(old);
    expect(result.contract).toBe("2026-10-07");
    expect(result.status).toBe("not_ready");
    for (const field of ["commercial_review_applicability", "intervention_identity", "scale_results"])
      expect(result.next_steps.some((step) => step.includes(field))).toBe(true);
    expect(result.next_steps.filter((step) => step.includes(TOOL_LIST_REFRESH_HINT))).toEqual([TOOL_LIST_REFRESH_HINT]);
    expect(result.next_steps.at(-1)).toBe(TOOL_LIST_REFRESH_HINT);
    expect((await call(base())).next_steps).toEqual([]);
    const corrections = await call(base({ answer_draft: `PMID ${PMID}.` }));
    expect(corrections.next_steps).not.toContain(TOOL_LIST_REFRESH_HINT);
  });
  it("names missing product_corpora, item_identity and shopping with one refresh hint", async () => {
    const result = await call(base({ community_evidence: "researched",
      commercial_review_applicability: { status: "required", products: ["Clinoptilolite"] },
      receipts: [study(), discovery(), sign("youtube_video_audit", { video: VIDEO, records: 2, state: "api_visible_complete", lock: "pass" })],
      community_findings: findings, principal_communities: [{ name: "Reviews", platform: "review_site" }, { name: "YouTube", platform: "youtube" }],
      community_searches: [reviewSearch]
    }));
    for (const field of ["product_corpora", "item_identity", "shopping"])
      expect(result.next_steps.some((step) => step.includes(field))).toBe(true);
    expect(result.next_steps.filter((step) => step.includes(TOOL_LIST_REFRESH_HINT))).toEqual([TOOL_LIST_REFRESH_HINT]);
  });

  it.each([PMID, DOI, PMCID])("refuses an unlinked key study %s and names its canonical page", async (id) => {
    const result = await complete(sourceInput(id, `Study ${id} describes the mechanism.`));
    expect(result.status).toBe("not_ready");
    const page = id === PMID ? `https://pubmed.ncbi.nlm.nih.gov/${id}/` : id === PMCID
      ? `https://pmc.ncbi.nlm.nih.gov/articles/${id}/` : `https://doi.org/${id}`;
    expect(result.next_steps).toContain(`Key study ${id} has no link in the answer; link it to the page AskRigor's tools returned, such as ${page}.`);
    expect(result.finalization_receipt).toBeUndefined();
  });
  it.each([
    [PMID, `https://pubmed.ncbi.nlm.nih.gov/${PMID}/`], [PMID, `https://europepmc.org/abstract/MED/${PMID}`],
    [DOI, `https://doi.org/${DOI}`], [DOI, "https://publisher.example/articles/10.1000%2FX"],
    [PMCID, `https://pmc.ncbi.nlm.nih.gov/articles/${PMCID.toLowerCase()}/`], [PMCID, `https://europepmc.org/article/PMC/${PMCID}`]
  ])("accepts a visible identifier link for %s at %s", async (id, url) => {
    expect((await call(sourceInput(id!, `[Study](${url}) describes the mechanism.`))).status).toBe("ready");
  });
  it("accepts a PMID's receipt DOI link, including an answer in French", async () => {
    const result = await call(sourceInput(PMID, `[Cette étude](https://doi.org/${DOI}) décrit le mécanisme.`, [
      study(), sign("pubmed_record", { pmid: PMID, doi: DOI })
    ]));
    expect(result.status).toBe("ready");
  });
  it("accepts a bare URL and URL-decoded PMID in visible prose", async () => {
    expect((await call(sourceInput(PMID, `Study page: https://pubmed.ncbi.nlm.nih.gov/${PMID}/`))).status).toBe("ready");
    expect((await call(sourceInput(PMID, `Study page: https://pubmed.ncbi.nlm.nih.gov/${PMID}.`))).status).toBe("ready");
    expect((await call(sourceInput(PMID, "[Study](https://europepmc.org/abstract/MED/%33%34%32%38%35%32%38%32)"))).status).toBe("ready");
  });
  it.each(["https://doi.org/10.1000/x(f(y))", "https://doi.org/10.1000%2Fx%28f%28y%29%29"])(
    "preserves a parenthesized DOI in %s", async (url) => {
      expect((await call(sourceInput("10.1000/x(f(y))", `[Study](${url}) describes the mechanism.`))).status).toBe("ready");
    }
  );
  it.each([
    `\`https://doi.org/${DOI}\``, `\n\n\`\`\`\nhttps://doi.org/${DOI}\n\`\`\``,
    `\n\n> [Study](https://doi.org/${DOI})`, `<!-- https://doi.org/${DOI} -->`,
    `![Study](https://doi.org/${DOI})`, `[Study](https://example.test "https://doi.org/${DOI}")`,
    `[https://doi.org/${DOI}](https://example.test)`
  ])("ignores study links outside visible prose or outside the target (%s)", async (hidden) => {
    expect((await complete(sourceInput(DOI, `Study ${DOI}. ${hidden}`))).next_steps.join(" ")).toContain("has no link in the answer");
  });
  it("checks each key study, including a source acquired only as a lead", async () => {
    const input = base({ receipts: [study(), sign("full_text_lead", { doi: "10.1000/lead" })],
      key_sources: [{ id: DOI, status: "validated" }, { id: "10.1000/lead", status: "lead_only" }] });
    const result = await call(input);
    expect(result.next_steps.join(" ")).toContain("Key study 10.1000/lead has no link");
  });
  it("does not check study links before an answer draft is present", async () => {
    const result = await call(base({ answer_draft: undefined }));
    expect(result.next_steps.join(" ")).not.toContain("has no link");
    expect(result.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
  });

  it("refuses the apple pectin versus clinoptilolite comparison's not_relevant bypass", async () => {
    const result = await complete(base({ research_target: "Apple pectin versus clinoptilolite as binders", treatment_choice: "compared" }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).toContain("treatment_choice is compared");
    expect(result.next_steps.join(" ")).toContain("community and buyer-review layer");
  });
  it.each(["commercial product", "buy_options", "no_live_option_found"])("refuses no_real_world_outcome with %s", async (trigger) => {
    const result = await complete(base(trigger === "commercial product" ? {
      commercial_review_applicability: { status: "required", products: ["Clinoptilolite"] }, shopping: { status: "not_requested" }
    } : { shopping: { status: trigger as "buy_options", destination: "Mauritania" } }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).toContain("community_evidence cannot be not_relevant");
  });
  it("accepts the noncommercial ion-exchange mechanism question", async () => {
    expect((await call(base())).status).toBe("ready");
  });
  it("requires commercial applicability with key studies and no_real_world_outcome", async () => {
    const result = await call(base({ commercial_review_applicability: undefined }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).toContain("commercial_review_applicability");
    expect(result.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
  });
  it("allows the practical comparison once its community and buyer-review lanes record access boundaries", async () => {
    const result = await complete(base({ community_evidence: "researched", treatment_choice: "compared",
      commercial_review_applicability: { status: "required", products: ["Clinoptilolite"] }, shopping: { status: "not_requested" },
      receipts: [study(), sign("treatment_coverage", { target: researchTargetDigest(TARGET), broad: true, boundary: "bounded_nonranking_only" })],
      principal_communities: [{ name: "Reviews", platform: "review_site" }, { name: "Forum", platform: "forum" }],
      community_searches: [
        { community: "Reviews", platform: "review_site", queries: [TARGET], threads_read: [], url: "https://reviews.example/", access_boundary: "no_web_search" },
        { community: "Forum", platform: "forum", queries: [TARGET], threads_read: [], url: "https://forum.example/", access_boundary: "no_web_search" }
      ]
    }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.caveats.join(" ")).toContain("could not search");
  });
  it("preserves emergency_before_triage and the no-key-study mechanism exception", async () => {
    const emergency = await complete(base({ not_relevant_basis: "emergency_before_triage", treatment_choice: "compared",
      commercial_review_applicability: undefined, research_depth: "first_pass", key_sources: [],
      shopping: { status: "buy_options", destination: "Mauritania", offers: [{ product: "Product", url: "https://seller.example/product", role: "buy_option", offer_state: "live_destination_orderable" }] },
      answer_draft: "Emergency triage. [Offer](https://seller.example/product)" }));
    expect(emergency.status).toBe("ready_with_limits");
    expect(emergency.next_steps).toEqual([]);
    const noStudies = await complete(base({ key_sources: [], commercial_review_applicability: undefined }));
    expect(noStudies.status).toBe("ready_with_limits");
  });
  if (surface === "MCP endpoint") it("lists the additive contract in both schemas and returns it in get_protocol_manifest", async () => {
    const { tools } = await client!.listTools();
    expect(tools).toHaveLength(33);
    for (const name of ["finalize_research", "get_protocol_manifest"]) {
      const schema = tools.find((tool) => tool.name === name)!.outputSchema!;
      expect((schema.properties as Record<string, unknown>).contract).toMatchObject({ const: "2026-10-07" });
    }
    for (const protocol of ["hrp", "universal"]) {
      const result = await client!.callTool({ name: "get_protocol_manifest", arguments: { protocol } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ ok: true, contract: "2026-10-07" });
    }
  });
});
