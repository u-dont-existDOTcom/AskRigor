import { atlasLookupFixture } from "./helpers/atlas-lookup-fixture.js";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  FINALIZE_RESEARCH_CONTRACT, MOBILE_NOTICE, TOOL_LIST_REFRESH_HINT, finalizeResearch, finalizeResearchPublishedInputSchema,
  optionClassCaveat, type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { discoveryQueryDigest, issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { PUBLIC_RATE_LIMIT } from "../apps/research-mcp/src/config.js";
import { createTokenBucketLimiter } from "../apps/research-mcp/src/rate-limit.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import {
  allowedNextStepIdentifiers, assertNextStepsContract, inventory, schemaIdentifiers, unknownNextStepIdentifiers
} from "./helpers/finalize-next-steps-contract.js";
import { withCommunitySkip } from "./helpers/community-skip.js";
import { COMPLETE_CHECKS_TIP } from "../apps/research-mcp/src/final-check-messages.js";

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
// The answer carries the sentence its no_real_world_outcome declaration requires (owner question 125).
const base = (overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput => withCommunitySkip({
  lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
  full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate other completion checks." },
  receipts: [study()], research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared",
  community_evidence: "not_relevant", not_relevant_basis: "no_real_world_outcome", question_about: "other", not_relevant_reason: "Pure chemical mechanism with no real-world outcome.",
  commercial_review_applicability: declaration, intervention_identity: declaration,
  key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: DOI, status: "validated" }], absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
  answer_draft: `[Study](https://doi.org/${DOI}) describes ion exchange.`, ...overrides
} satisfies FinalizeResearchInput);
const sourceInput = (id: string, answer: string, receipts = [study(id)]) => base({
  receipts, key_sources: [{ read_depth: "partial_text" as const, answer_marker: answer.startsWith("[Cette étude]") ? "Cette étude" : answer.startsWith("Study page:") ? "Study page" : "Study", id, status: "validated" }], answer_draft: answer
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
// A comparison lists each plausible class of treatment (owner answer 153a): searched in PubMed and reported in a
// sentence of its own, or not researched, which the answer states in the server's caveat.
const CLASS_QUERY = "clinoptilolite binder";
const CLASS_SENTENCE = "A PubMed search for mineral binders found only the study above.";
const CLASS_DRAFT = `[Study](https://doi.org/${DOI}) describes ion exchange.\n\n${CLASS_SENTENCE}`;
const classSearch = () => sign("literature_search", { src: "pubmed", q: discoveryQueryDigest([CLASS_QUERY]), ret: 1, n: 1 });
const researchedClass = { option_class: "mineral binders", state: "researched" as const, search_query: CLASS_QUERY,
  answer_quote: CLASS_SENTENCE };

describe("finalize next-step identifier contract", () => {
  it("derives allowed identifiers from all schema depths, enums, tool names and reviewed output fields", () => {
    expect(inventory.tools).toHaveLength(33);
    for (const identifier of ["registry_code", "other_variant_excluded", "outcome_search", "outcome_search_boundary",
      "read_depth", "answer_marker", "full_text_audited", "full_text_read", "partial_text", "abstract_only",
      "conference_abstract", "secondary_only", "metadata_only", "inaccessible", "route_error", "lab_preparation", "covered", "answer_quotes", "not_applicable", "full_text_search", "run", "not_needed", "ratings_shown", "no_text_search", "search_blocked", "benefit", "no_effect", "worse", "adverse", "stopped", "minimal_important_difference",
      "none_established", "not_established", "finalize_research", "research_receipt", "checked_answer", "withdrawn_named_communities", "current_turn_named_communities", "supplied_by_user"]) expect(allowedNextStepIdentifiers.has(identifier)).toBe(true);
    expect(schemaIdentifiers({ properties: { array: { items: { anyOf: [
      { properties: { nested_field: { enum: ["enum_value"] } } }, { const: "literal_value" }
    ] } } } })).toEqual(new Set(["array", "nested_field", "enum_value", "literal_value"]));
    expect(unknownNextStepIdentifiers(["Give unknown_not_sendable."])).toEqual(["unknown_not_sendable"]);
    // Other AskRigor tools' published inputs are legitimate routes for a next step.
    for (const published of ["rediscovery_leads", "research_question", "broad_treatment_choice", "product_identity", "pmcid"])
      expect(allowedNextStepIdentifiers.has(published)).toBe(true);
  });
  it("names only published fields in the stopped tip's missing-caveat step", () => {
    const input = base({ absence_claims: undefined });
    let result = finalizeResearch(input, { secret: SECRET });
    for (let round = 2; round <= 3; round += 1) {
      result = finalizeResearch({ ...input, round_token: result.round_token }, { secret: SECRET });
    }
    expect(result.status).toBe("stopped");
    const steps = [...result.stopped!.could_not, ...result.stopped!.next_turn].map(({ step }) => step);
    expect(steps.some((step) => step.includes(COMPLETE_CHECKS_TIP))).toBe(true);
    expect(unknownNextStepIdentifiers(steps)).toEqual([]);
  });
  it("pins descriptive catalog wording for the changed contract and link fields", () => {
    const tool = inventory.tools.find(({ name }) => name === "finalize_research")!;
    const output = tool.outputSchema as { properties: Record<string, { description?: string }> };
    expect(output.properties.checked_answer!.description).toBe("When ready or ready_with_limits with answer_draft: " +
      "the exact answer_draft this check read, byte for byte, returned only to its caller and shown in the result panel; not stored or logged.");
    expect(tool.description).toContain(
      "visible links to each key study, and the caveats, and is not stored; once the other checks pass, a second model may read the answer for harm " +
      "statements, specialized terms and scale results the declarations leave out (reader_dismissed answers them); " +
      "in this turn or a later one, the carry_forward value the last check returned (carried_state), with primary_outcome, rejected_options and reopened; " +
      "and after a not_ready result in this turn, its round_token. Result: " +
      "second_reading, whether it ran; " +
      "carry_forward, the conversation's state to pass back in this turn or a later one; contract (the server's input contract version); not_ready with the remaining steps and one connector-refresh " +
      "hint when a required declaration is missing, each step's kind (next_step_kinds), the line an answer given " +
      "before a pass ends with (unchecked_line), the round of this turn (round) and round_token for the next call, " +
      "and steps that came back unchanged 3 rounds running, which it stopped asking for (stuck_steps); stopped, the " +
      "turn's final result, after 10 rounds or when only such steps are left, with what AskRigor could not do, what " +
      "the next turn can do and a bug report; previous_check when the conversation's previous check did not pass;"
    );
    const input = tool.inputSchema as { properties: Record<string, { description: string }> };
    expect(input.properties.carried_state!.description).toBe(
      "The carry_forward value the last final check in this conversation returned, passed back exactly in this turn " +
      "or a later one; left out before the conversation's first final check."
    );
    expect(input.properties.key_sources!.description).toBe(
      "Lists each study the conclusions depend on: validated after a full-text method audit or from a checked Atlas finding (read_depth atlas_checked), or lead_only " +
      "when the acquisition (or, for a PMID without a DOI, the PubMed record) receipt shows no open full text. " +
      "The audit's validation checks that its findings cite the document's own blocks and that every domain is " +
      "covered, not that each interpretation is right. " +
      "With answer_draft, each study has a visible link with its DOI, PMID or PMCID, or to a page AskRigor's receipts " +
      "tie to it: a copy read here, or the page resolve_doi found the DOI registered to. With named_target, each study " +
      "also says how it matches each of its fields (target_components to target_time_horizon)."
    );
    expect(input.properties.commercial_review_applicability!.description).toContain(
      "Records a required declaration when community evidence is researched, or when no_real_world_outcome is declared with key studies."
    );
    expect(input.properties.lab_preparation!.description).toBe(
      "Records the model's declaration of lab preparation: covered with one to five quotes from " +
      "answer_draft giving collection conditions or preparation advice, or not_applicable with its reason when the " +
      "answer interprets no lab result and plans no test. Required when key_sources is non-empty; each covered quote " +
      "is compared with the answer for this call only. Applicability and advice quality remain the model's declaration."
    );
    const searches = finalizeResearchPublishedInputSchema({ relaxed: false }) as { properties: { community_searches: { items: { properties: {
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
    ["option class problems", { treatment_choice: "compared", option_classes: [
      { option_class: "mineral binders", state: "researched" }, { option_class: "Mineral  binders.", state: "not_researched" },
      { option_class: "fibre supplements", state: "researched", search_query: "a query no receipt has" },
      { option_class: "binding resins", state: "inaccessible" }
    ] }],
    ["empty option classes", { treatment_choice: "compared", option_classes: [] }],
    // The caveat quotes the declared class, so the answer states it as written; the labels step names the class.
    ["option class internal labels", { treatment_choice: "compared",
      option_classes: [{ option_class: "binder_products", state: "inaccessible" }],
      answer_draft: `[Study](https://doi.org/${DOI}) describes ion exchange. ${optionClassCaveat("inaccessible", "binder_products")}` }],
    ["rejected receipt", { receipts: ["not-a-receipt"] }],
    ["missing answer", { answer_draft: undefined }],
    ["missing scale", { scale_results: undefined }],
    ["missing absence claims", { absence_claims: undefined }],
    ["missing read-depth declaration", { key_sources: [{ id: DOI, status: "validated", answer_marker: "Study" }] }],
    ["missing marker declaration", { key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited" }] }],
    ["unsupported depth", { receipts: [], key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Study" }] }],
    ["unshown marker", { key_sources: [{ id: DOI, status: "validated", read_depth: "full_text_audited", answer_marker: "Missing label" }] }],
    ["missing lab declaration", { lab_preparation: undefined }],
    ["unshown lab quote", { lab_preparation: { status: "covered", answer_quotes: ["This sentence is missing from the answer."] } }],
    ["lab quote without answer", { answer_draft: undefined, lab_preparation: { status: "covered", answer_quotes: ["This sentence needs an answer draft."] } }],
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
    ["unknown key study", { key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "unidentified study", status: "validated" }] }],
    ["PMID without receipt", { key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: PMID, status: "validated" }] }],
    ["PMID with DOI", { receipts: [sign("pubmed_record", { pmid: PMID, doi: DOI })], key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: PMID, status: "validated" }] }],
    ["PMID with open PMC but no DOI", { receipts: [sign("pubmed_record", { pmid: PMID, doi: "", pmcid: PMCID })], key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: PMID, status: "lead_only" }] }],
    ["untried open PMC", { receipts: [sign("pubmed_record", { pmid: PMID, doi: DOI, pmcid: PMCID }), sign("full_text_lead", { doi: DOI })], key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: PMID, status: "lead_only" }] }],
    ["unproven DOI lead", { receipts: [], key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: DOI, status: "lead_only" }] }],
    ["unproven PMCID lead", { receipts: [], key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: PMCID, status: "lead_only" }] }],
    ["first pass missing offers", { research_depth: "first_pass" }],
    ["first pass excessive focuses", { research_depth: "first_pass", open_leads: Array.from({ length: 4 }, (_, n) => ({ direction: "studies", topic: `Focus ${n}`, why: "Incomplete methods." })), another_pass_estimate: "some time" }],
    ["absent evidence-strength sources", { absence_claims: [{ quote: "Evidence is weak.", state: "not_established" }] }],
    ["unaudited evidence-strength sources", { absence_claims: [{ quote: "Evidence is weak.", state: "not_established", studies: ["10.1000/other"] }] }],
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
    // These tests call the endpoint more often than the public 60-a-minute limit allows one address.
    server = createAskRigorHttpServer({ publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false, privateOrchestrationEnabled: false,
      rateLimiter: createTokenBucketLimiter({ ...PUBLIC_RATE_LIMIT, capacity: 1_000 }) });
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

  it("asks a phone's answer for the owner's mobile notice, from ChatGPT's user-agent hint (2026-10-15)", async () => {
    const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
    const desktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
    const caveats = async (agent: string | undefined): Promise<string[]> => {
      if (surface === "gate") return finalizeResearch(base(), { secret: SECRET, mobileClient: agent === phone }).caveats;
      const result = await client!.callTool({
        name: "finalize_research", arguments: { ...base() }, ...(agent === undefined ? {} : { _meta: { "openai/userAgent": agent } })
      });
      expect(result.isError).not.toBe(true);
      return (result.structuredContent as FinalizeResearchOutput).caveats;
    };
    expect((await caveats(phone))[0]).toBe(MOBILE_NOTICE);
    for (const agent of [desktop, undefined]) expect(await caveats(agent)).not.toContain(MOBILE_NOTICE);
  });

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
    expect((await call(sourceInput(id!, `[Study](${url}) describes the mechanism.`))).status).toBe("ready_with_limits");
  });
  it("accepts a PMID's receipt DOI link, including an answer in French", async () => {
    const result = await call(sourceInput(PMID, `[Cette étude](https://doi.org/${DOI}) décrit le mécanisme.`, [
      study(), sign("pubmed_record", { pmid: PMID, doi: DOI })
    ]));
    expect(result.status).toBe("ready_with_limits");
  });
  it("accepts a bare URL and URL-decoded PMID in visible prose", async () => {
    expect((await call(sourceInput(PMID, `Study page: https://pubmed.ncbi.nlm.nih.gov/${PMID}/`))).status).toBe("ready_with_limits");
    expect((await call(sourceInput(PMID, `Study page: https://pubmed.ncbi.nlm.nih.gov/${PMID}.`))).status).toBe("ready_with_limits");
    expect((await call(sourceInput(PMID, "[Study](https://europepmc.org/abstract/MED/%33%34%32%38%35%32%38%32)"))).status).toBe("ready_with_limits");
  });
  it.each(["https://doi.org/10.1000/x(f(y))", "https://doi.org/10.1000%2Fx%28f%28y%29%29"])(
    "preserves a parenthesized DOI in %s", async (url) => {
      expect((await call(sourceInput("10.1000/x(f(y))", `[Study](${url}) describes the mechanism.`))).status).toBe("ready_with_limits");
    }
  );
  it.each([
    `\`https://doi.org/${DOI}\``, `\n\n\`\`\`\nhttps://doi.org/${DOI}\n\`\`\``,
    `\n\n> [Study](https://doi.org/${DOI})`, `<!-- https://doi.org/${DOI} -->`,
    `![Study](https://doi.org/${DOI})`
  ])("ignores study links outside visible prose or outside the target (%s)", async (hidden) => {
    expect((await complete(sourceInput(DOI, `Study ${DOI}. ${hidden}`))).next_steps.join(" ")).toContain("has no link in the answer");
  });
  // A DOI in a link's title or text is not its target: the step names the target no receipt ties to the study.
  it.each([`[Study](https://example.test "https://doi.org/${DOI}")`, `[https://doi.org/${DOI}](https://example.test)`])(
    "names a target outside the study's identifiers (%s)", async (hidden) => {
      expect((await complete(sourceInput(DOI, `Study ${DOI}. ${hidden}`))).next_steps.join(" "))
        .toContain(`Key study ${DOI} is linked by https://example.test, which no receipt passed here ties to it`);
    });
  it("checks each key study, including a source acquired only as a lead", async () => {
    const input = base({ receipts: [study(), sign("full_text_lead", { doi: "10.1000/lead" })],
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: DOI, status: "validated" }, { read_depth: "partial_text" as const, answer_marker: "Study", id: "10.1000/lead", status: "lead_only" }] });
    const result = await call(input);
    expect(result.next_steps.join(" ")).toContain("Key study 10.1000/lead has no link");
  });
  it("does not check study links before an answer draft is present", async () => {
    const result = await call(base({ answer_draft: undefined }));
    expect(result.next_steps.join(" ")).not.toContain("has no link");
    expect(result.next_steps).toContain(TOOL_LIST_REFRESH_HINT);
  });

  it("refuses the apple pectin versus clinoptilolite comparison's not_relevant bypass", async () => {
    // Its classes of treatment are declared, so the bypass is what holds it back.
    const result = await complete(base({ research_target: "Apple pectin versus clinoptilolite as binders", treatment_choice: "compared",
      option_classes: [researchedClass], receipts: [study(), classSearch()], answer_draft: CLASS_DRAFT }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).not.toContain("option_classes");
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
    expect((await call(base())).status).toBe("ready_with_limits");
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
      option_classes: [researchedClass], answer_draft: CLASS_DRAFT,
      receipts: [atlasLookupFixture(TARGET, { secret: SECRET }), study(), classSearch(), sign("treatment_coverage", { target: researchTargetDigest(TARGET), broad: true, boundary: "bounded_nonranking_only" })],
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
      option_classes: [{ option_class: "other binding products", state: "not_researched" }],
      answer_draft: "Emergency triage. [Offer](https://seller.example/product)" }));
    expect(emergency.status).toBe("ready_with_limits");
    expect(emergency.next_steps).toEqual([]);
    expect(emergency.caveats).toContain("A class of treatment this answer did not research: other binding products.");
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
