import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  finalizeResearch, finalizeResearchInputSchema, TOOL_LIST_REFRESH_HINT,
  type FinalizeResearchInput, type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorHttpServer } from "../apps/research-mcp/src/server.js";
import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "review-outcome-search-test-secret-0123456789";
const PRODUCT = "Liver Supplement 200 mg capsules";
const TARGET = "Liver Supplement fibrosis and liver-enzyme outcomes";
const QUOTES = {
  benefit_reports: "Two reported improvement.", no_effect_reports: "Several reported no change.",
  adverse_reports: "One reported nausea.", effect_on_answer: "These selected reports cannot establish an effect."
};
type Search = NonNullable<FinalizeResearchInput["community_searches"]>[number];
type Corpus = NonNullable<Search["review_corpora"]>[number];
const OUTCOME_SEARCH: NonNullable<Corpus["outcome_search"]> = {
  queries: ["liver enzymes improved", "fibrosis no change", "ALT AST worse", "enzymes hépatiques"],
  directions: ["benefit", "no_effect", "worse"]
};
const PREVIEW = `On iHerb, the reviews of ${PRODUCT} could not be searched for the outcome, so the 10 read are a preview, not a measure of how often it helps or harms.`;

function packageFor(overrides: Partial<Corpus> = {}): FinalizeResearchInput {
  const reviews: Search = {
    community: "iHerb", platform: "review_site", queries: [TARGET],
    threads_read: [{ url: "https://reviews.example/liver-supplement/reviews/" }],
    ...QUOTES, answer_quotes: { ...QUOTES },
    review_corpora: [{ product: PRODUCT, ratings_shown: 65_000, reviews_shown: 1_200, reviews_read: 10,
      selection: "top_ranked", item_identity: { exact_product: 10, variant_unresolved: 0, other_variant_excluded: 0 },
      ...overrides }]
  };
  const forum: Search = {
    community: "Liver Forum", platform: "forum", queries: [TARGET],
    threads_read: [{ url: "https://forum.example/liver-supplement/" }],
    ...QUOTES, answer_quotes: { ...QUOTES }
  };
  return {
    receipts: [issueResearchReceipt("study_audit", { id: "10.1000/liver", status: "complete_no_unresolved_fields" }, { secret: SECRET })],
    research_target: TARGET, research_depth: "deep", treatment_choice: "not_compared", community_evidence: "researched",
    commercial_review_applicability: { status: "required", products: [PRODUCT] },
    intervention_identity: { status: "not_applicable", reason: "No coded or multi-ingredient study intervention." },
    shopping: { status: "not_requested" }, key_sources: [{ id: "10.1000/liver", status: "validated" }],
    principal_communities: [reviews, forum].map(({ community: name, platform }) => ({ name, platform })),
    community_searches: [reviews, forum], absence_claims: [], scale_results: [],
    answer_draft: "[Study](https://doi.org/10.1000/liver)\n\n" + [reviews, forum]
      .map((lane) => `On [${lane.community}](${lane.threads_read[0]!.url}): ${Object.values(QUOTES).join(" ")}`).join("\n\n")
  };
}

describe.each(["gate", "MCP endpoint"] as const)("buyer-review outcome search through %s", (surface) => {
  let server: Server | undefined;
  let client: Client | undefined;
  beforeAll(async () => {
    if (surface === "gate") return;
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINDINGS_LIBRARY", "false");
    server = createAskRigorHttpServer({ publicServerEnabled: true, actionsEnabled: false, researchActionsEnabled: false, privateOrchestrationEnabled: false });
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
    client = new Client({ name: "buyer-review-outcome-test", version: "0.1.0" });
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

  it("blocks the iHerb first-page preview without outcome_search or outcome_search_boundary", async () => {
    const result = await complete(packageFor());
    expect(result.status).toBe("not_ready");
    expect(result.finalization_receipt).toBeUndefined();
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      `Give outcome_search or outcome_search_boundary for ${PRODUCT} in iHerb: the searches run within the review text for the outcome and their directions, or why that search could not run.`
    ]);
    expect(result.next_steps.filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    expect(result.limits).toContain(PREVIEW);
    expect(result.caveats).toContain(PREVIEW);
  });

  it.each(["no_text_search", "search_blocked", "login_required"] as const)("accepts %s with the required preview caveat", async (boundary) => {
    const input = packageFor({ outcome_search_boundary: boundary });
    const first = await call(input);
    expect(first.status).toBe("not_ready");
    expect(first.next_steps.join(" ")).toContain(PREVIEW);
    const result = await complete(input);
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.finalization_receipt).toBeDefined();
    expect(result.limits).toContain(PREVIEW);
    expect(result.caveats.filter((caveat) => caveat === PREVIEW)).toHaveLength(1);
    expect(result.must_report).toContain(`iHerb, ${PRODUCT}: 65000 star ratings shown; 1200 written reviews shown; 10 reviews read; selection top_ranked; outcome-search boundary: ${boundary}.`);
    const dropped = await call({ ...input, answer_draft: `${input.answer_draft}\n\n${result.caveats.filter((caveat) => caveat !== PREVIEW).join(" ")}` });
    expect(dropped.status).toBe("not_ready");
    expect(dropped.next_steps.join(" ")).toContain(PREVIEW);
  });

  it.each(["worse", "adverse"] as const)("accepts benefit, no_effect and %s without a preview caveat", async (harm) => {
    const result = await complete(packageFor({ outcome_search: { ...OUTCOME_SEARCH, directions: ["benefit", "no_effect", harm] } }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps).toEqual([]);
    expect(result.caveats).not.toContain(PREVIEW);
    expect(result.limits).not.toContain(PREVIEW);
    // The community lane's own caveat already says AskRigor could not verify its searches.
    expect(result.caveats.join(" ")).toContain("could not verify");
    expect(result.must_report).toContain(`iHerb, ${PRODUCT}: 65000 star ratings shown; 1200 written reviews shown; 10 reviews read; selection top_ranked; outcome-search directions: benefit, no_effect, ${harm}.`);
  });

  it.each([
    { directions: ["no_effect", "worse"], missing: "benefit" },
    { directions: ["benefit", "adverse"], missing: "no_effect" },
    { directions: ["benefit", "no_effect", "stopped"], missing: "worse or adverse" },
    { directions: ["stopped"], missing: "benefit, no_effect, worse or adverse" }
  ] satisfies Array<{ directions: NonNullable<Corpus["outcome_search"]>["directions"]; missing: string }>)(
    "names missing directions: $missing", async ({ directions, missing }) => {
      const result = await complete(packageFor({ outcome_search: { ...OUTCOME_SEARCH, directions } }));
      expect(result.status).toBe("not_ready");
      expect(result.next_steps).toEqual([
        `outcome_search.directions for ${PRODUCT} in iHerb is missing ${missing}; record searches for each missing direction.`
      ]);
      expect(result.finalization_receipt).toBeUndefined();
    }
  );

  it("refuses both the outcome search and its boundary", async () => {
    const result = await complete(packageFor({ outcome_search: OUTCOME_SEARCH, outcome_search_boundary: "search_blocked" }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps).toEqual([
      `Give exactly one of outcome_search or outcome_search_boundary for ${PRODUCT} in iHerb, so the declarations agree.`
    ]);
  });

  it.each(["top_ranked", "outcome_keyword", "other_partial"] as const)("requires the preview caveat for %s without outcome search", async (selection) => {
    const result = await complete(packageFor({ selection }));
    expect(result.status).toBe("not_ready");
    expect(result.caveats.filter((caveat) => caveat === PREVIEW)).toHaveLength(1);
  });

  it("requires a search declaration for every corpus, including all written reviews", async () => {
    const input = packageFor({ outcome_search: OUTCOME_SEARCH });
    input.community_searches![0]!.review_corpora!.push({ product: "Second product", reviews_read: 2, reviews_shown: 2,
      selection: "all", item_identity: { exact_product: 2, variant_unresolved: 0, other_variant_excluded: 0 } });
    const result = await complete(input);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.some((step) => step.includes("Give outcome_search or outcome_search_boundary for Second product"))).toBe(true);
  });

  it("keeps star ratings apart from written-review denominators and omitted counts", async () => {
    // Star ratings are not a ceiling on written reviews read.
    const zeroRatings = await complete(packageFor({ ratings_shown: 0, outcome_search: OUTCOME_SEARCH }));
    expect(zeroRatings.next_steps).toEqual([]);
    expect(zeroRatings.must_report).toContain(`iHerb, ${PRODUCT}: 0 star ratings shown; 1200 written reviews shown; 10 reviews read; selection top_ranked; outcome-search directions: benefit, no_effect, worse.`);
    const omitted = await complete(packageFor({ ratings_shown: undefined, reviews_shown: undefined, outcome_search: OUTCOME_SEARCH }));
    expect(omitted.next_steps).toEqual([]);
    const line = omitted.must_report.find((entry) => entry.includes("selection top_ranked"))!;
    expect(line).toBe(`iHerb, ${PRODUCT}: written reviews shown: not given; 10 reviews read; selection top_ranked; outcome-search directions: benefit, no_effect, worse.`);
    expect(line).not.toContain("star ratings");
  });
});

describe("review outcome-search input contract", () => {
  it("accepts the query and direction bounds and multilingual review text", () => {
    for (const queries of [["é"], Array.from({ length: 12 }, () => "字".repeat(200))]) {
      expect(finalizeResearchInputSchema.safeParse(packageFor({ outcome_search: {
        queries, directions: ["benefit", "no_effect", "worse", "adverse", "stopped"]
      } })).success).toBe(true);
    }
  });
  it.each([
    { queries: [], directions: ["benefit"] },
    { queries: Array.from({ length: 13 }, () => "fibrosis"), directions: ["benefit"] },
    { queries: [" "], directions: ["benefit"] },
    { queries: ["x".repeat(201)], directions: ["benefit"] },
    { queries: ["fibrosis"], directions: [] },
    { queries: ["fibrosis"], directions: ["benefit", "benefit"] },
    { queries: ["fibrosis"], directions: ["benefit", "no_effect", "worse", "adverse", "stopped", "benefit"] },
    { queries: ["fibrosis"], directions: ["unknown"] }
  ])("rejects invalid query or direction declarations (%j)", (outcome_search) => {
    expect(finalizeResearchInputSchema.safeParse({ ...packageFor(), community_searches: [{
      ...packageFor().community_searches![0], review_corpora: [{ ...packageFor().community_searches![0]!.review_corpora![0], outcome_search }]
    }] }).success).toBe(false);
  });
  it.each([-1, 1.5])("rejects invalid star-rating count %s", (ratings_shown) => {
    expect(finalizeResearchInputSchema.safeParse(packageFor({ ratings_shown })).success).toBe(false);
  });
});
