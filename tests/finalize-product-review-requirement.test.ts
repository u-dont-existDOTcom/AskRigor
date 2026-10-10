import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  finalizeResearch,
  TOOL_LIST_REFRESH_HINT,
  type FinalizeResearchInput,
  type FinalizeResearchOutput
} from "../apps/research-mcp/src/research-finalization-gate.js";
import {
  issueResearchReceipt,
  verifyResearchReceipt,
  type ResearchReceiptOptions
} from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "product-review-requirement-test-secret-0123456789";
const OPTIONS = { secret: SECRET, now: () => new Date("2026-10-07T00:00:00.000Z") };
const TARGET = "Should people with fast COMT take EGCG?";
const PRODUCT = "EGCG (green tea extract) supplements";
const REQUIRED = { status: "required", products: [PRODUCT] } as const;
const NOT_APPLICABLE = {
  status: "not_applicable" as const,
  reason: "The question concerns unbranded exercise and involves no product or service people buy."
};
const STATE_STEP = "State in commercial_review_applicability whether the question concerns a product or service " +
  "people buy (a supplement, consumer health product, device, app, formulation, or health service). If it does, " +
  "map where its buyers review it and read those reviews as a community lane of their own (HRP PrincipalPlatformMapping).";
const MAP_STEP = `Map where buyers review ${PRODUCT} in principal_communities as platform review_site, the main ` +
  "one in the user's country and language first; no single retailer is required. A forum, Reddit or YouTube does " +
  "not stand in for buyer reviews (HRP PrincipalPlatformMapping).";
const SEARCH_STEP = "Search Local Health Reviews and record it in community_searches under platform review_site: " +
  "the reviews read, with review_corpora (each product, the reviews shown and read, and how they were chosen), or " +
  "the access_boundary that stopped the search.";

type Search = NonNullable<FinalizeResearchInput["community_searches"]>[number];
// Synthetic findings test the receipt/answer contract, not EGCG's effects. As in
// research-finalization-gate.test.ts, each read lane has its own linked paragraph
// and exact answer_quotes, and the final draft carries the gate's caveats.
const QUOTES = {
  benefit_reports: "Two reported a change.",
  no_effect_reports: "Two reported no change.",
  adverse_reports: "One reported nausea.",
  effect_on_answer: "These reports alone cannot establish an effect."
};
const search = (community: string, platform: Search["platform"], url: string): Search => ({
  community, platform, queries: ["EGCG fast COMT experiences"], threads_read: [{ url }],
  ...QUOTES, answer_quotes: { ...QUOTES }
});
const REDDIT = search("r/Supplements", "reddit", "https://www.reddit.com/r/Supplements/comments/abc123/egcg/");
const FORUM = search("COMT Forum", "forum", "https://comt.example/threads/egcg/");
const REVIEW_SITE = { name: "Local Health Reviews", platform: "review_site" as const };
const REVIEWS: Search = {
  ...search(REVIEW_SITE.name, "review_site", "https://reviews.example/products/egcg/reviews/"),
  review_corpora: [{ outcome_search: { queries: ["EGCG effects"], directions: ["benefit", "no_effect", "worse"] }, product: "Green Tea Extract 200 mg capsules", reviews_shown: 12, reviews_read: 12, item_identity: { exact_product: 12, variant_unresolved: 0, other_variant_excluded: 0 }, selection: "all" }]
};
const paragraph = (lane: Search) => `On [${lane.community}](${lane.threads_read[0]!.url}): ${Object.values(QUOTES).join(" ")}`;

function packageFor(
  overrides: Partial<FinalizeResearchInput> = {},
  receiptOptions: ResearchReceiptOptions = OPTIONS
): FinalizeResearchInput {
  return {
    // Genuine HMAC-signed study receipt, following the valid-package fixture in
    // research-finalization-gate.test.ts and fresh-receipt setup in
    // treatment-coverage-from-receipts.test.ts's in-memory MCP test.
    receipts: [issueResearchReceipt("study_audit", {
      id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields"
    }, receiptOptions)],
    community_evidence: "researched",
    full_text_search: { status: "not_needed", reason: "Synthetic fixtures isolate buyer review checks." },
    commercial_review_applicability: { ...REQUIRED, products: [...REQUIRED.products] },
    research_target: TARGET,
    research_depth: "deep",
    shopping: { status: "not_requested" },
    treatment_choice: "not_compared",
    intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded or multi-ingredient product." },
    key_sources: [{ id: "10.1002/art.41142", status: "validated" }],
    principal_communities: [{ name: REDDIT.community, platform: REDDIT.platform }, { name: FORUM.community, platform: FORUM.platform }],
    community_searches: [REDDIT, FORUM],
    answer_draft: "[Study](https://doi.org/10.1002/art.41142)\n\n" + [paragraph(REDDIT), paragraph(FORUM), paragraph(REVIEWS)].join("\n\n"),
    absence_claims: [], scale_results: [],
    ...overrides
  };
}

function withReviews(overrides: Partial<Search> = {}): Partial<FinalizeResearchInput> {
  return {
    principal_communities: [...packageFor().principal_communities!, REVIEW_SITE],
    community_searches: [REDDIT, FORUM, { ...REVIEWS, ...overrides }]
  };
}

function checked(input: FinalizeResearchInput): FinalizeResearchOutput {
  const first = assertNextStepsContract(finalizeResearch(input, OPTIONS));
  return assertNextStepsContract(finalizeResearch({ ...input, answer_draft: `${input.answer_draft}\n\n${first.caveats.join(" ")}` }, OPTIONS));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("finalize_research product review requirement", () => {
  it("blocks the EGCG regression when Reddit and forums omit buyer reviews", () => {
    const result = checked(packageFor());
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([MAP_STEP]);
    expect(result.finalization_receipt).toBeUndefined();
    expect(result.receipts_verified).toBe(1);
  });

  it("blocks omission of the whole commercial_review_applicability declaration", () => {
    const { commercial_review_applicability: _declaration, ...input } = packageFor();
    const result = checked(input);
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([STATE_STEP]);
    expect(result.next_steps.filter((step) => step === TOOL_LIST_REFRESH_HINT)).toHaveLength(1);
    expect(result.finalization_receipt).toBeUndefined();
  });

  it("requires products when commercial reviews are required", () => {
    const result = checked(packageFor({ commercial_review_applicability: { status: "required" } }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Give products in commercial_review_applicability when status is required: the products or services " +
        "concerned, each exact product and variant when the user named one; for an ingredient, the product forms " +
        "people buy."
    ]);
  });

  it("blocks a mapped review site without its matching search", () => {
    const result = checked(packageFor({ principal_communities: withReviews().principal_communities }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([SEARCH_STEP]);
  });

  it("does not let another platform satisfy a mapped review site", () => {
    const result = checked(packageFor(withReviews({ platform: "forum", review_corpora: undefined })));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([SEARCH_STEP]);
  });

  it("accepts a search of one of the mapped review sites", () => {
    const result = checked(packageFor({
      ...withReviews(),
      principal_communities: [...withReviews().principal_communities!, { name: "Second Reviews", platform: "review_site" }]
    }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
  });

  it("accepts matching review corpora with counts and selection, preserving the base status", () => {
    const base = checked(packageFor({
      research_target: "Experiences with unbranded exercise", commercial_review_applicability: NOT_APPLICABLE
    }));
    expect(base.status).toBe("ready_with_limits");
    const result = checked(packageFor({
      ...withReviews(),
      principal_communities: [...packageFor().principal_communities!, { ...REVIEW_SITE, name: "local-health reviews" }]
    }));
    expect(result.status).toBe(base.status);
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.finalization_receipt).toBeDefined();
  });

  it("reuses the existing missing-corpus message without duplication", () => {
    const result = checked(packageFor(withReviews({ review_corpora: undefined })));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "community_searches for Local Health Reviews lists reviews read on a review site: give review_corpora, " +
        "with each product, how many reviews the site shows, how many you read and how you chose them."
    ]);
  });

  it("reuses the existing missing-read-or-boundary message without duplication", () => {
    const result = checked(packageFor(withReviews({ threads_read: [], review_corpora: undefined })));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "community_searches for Local Health Reviews lists no thread read: add the threads you read, or the " +
        "access_boundary that stopped the search."
    ]);
  });

  it("accepts a review-site login boundary and requires its existing limit", () => {
    const input = packageFor(withReviews({
      threads_read: [], review_corpora: undefined, access_boundary: "login_required", url: "https://reviews.example/"
    }));
    const result = checked(input);
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.limits).toContain(
      "The search of Local Health Reviews ended at an access boundary (login_required); say so."
    );
    expect(result.caveats).toContain("Local Health Reviews needs a login to read, so reports there are not included.");
    expect(finalizeResearch(input, OPTIONS).status).toBe("not_ready");
    expect(finalizeResearch(input, OPTIONS).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("The answer leaves out");
  });

  it("accepts outcome-keyword selection and still requires the partial-selection limit", () => {
    const input = packageFor(withReviews({
      review_corpora: [{ ...REVIEWS.review_corpora![0]!, reviews_read: 3, item_identity: { exact_product: 3, variant_unresolved: 0, other_variant_excluded: 0 }, selection: "outcome_keyword" }]
    }));
    const result = checked(input);
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    expect(result.limits).toContain(
      "The 3 Local Health Reviews review(s) of Green Tea Extract 200 mg capsules you read (of 12 shown) were " +
        "found by searching for outcomes; say they show which experiences people report, not how common each is."
    );
    expect(finalizeResearch(input, OPTIONS).status).toBe("not_ready");
    expect(finalizeResearch(input, OPTIONS).next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT).join(" ")).toContain("not how common each one is");
  });

  it("accepts not_applicable with a reason and no review site", () => {
    const result = checked(packageFor({
      research_target: "Experiences with unbranded exercise", commercial_review_applicability: NOT_APPLICABLE
    }));
    expect(result.status).toBe("ready_with_limits");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
  });

  it("requires a reason for not_applicable", () => {
    const result = checked(packageFor({ commercial_review_applicability: { status: "not_applicable" } }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "Give reason in commercial_review_applicability when status is not_applicable: why no product or service " +
        "people buy is involved."
    ]);
  });

  it.each(["map", "search", "both"])("blocks not_applicable contradicted by a review-site %s", (location) => {
    const result = checked(packageFor({
      ...(location === "search" ? {} : { principal_communities: withReviews().principal_communities }),
      ...(location === "map" ? {} : { community_searches: withReviews().community_searches }),
      commercial_review_applicability: NOT_APPLICABLE
    }));
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([
      "commercial_review_applicability is not_applicable, but principal_communities or community_searches lists " +
        "platform review_site: change the declaration or the review-site entry so they agree."
    ]);
  });

  it.each([undefined, REQUIRED, { status: "not_applicable" as const }])(
    "preserves emergency_before_triage regardless of the commercial declaration (%j)", (declaration) => {
      const result = checked(packageFor({
        community_evidence: "not_relevant", commercial_review_applicability: declaration === undefined
          ? undefined : { ...declaration, ...("products" in declaration ? { products: [...declaration.products] } : {}) },
        not_relevant_basis: "emergency_before_triage", not_relevant_reason: "Emergency triage before stabilization."
      }));
      expect(result.status).toBe("ready");
      expect(result.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
    }
  );

  it("enforces the omitted review lane through the real MCP finalize_research tool", async () => {
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    // Reddit's verification fails locally, leaving the existing unverified-search
    // caveat intact. No provider or network access is needed by this MCP test.
    const fetch = vi.fn(async () => { throw new Error("Offline test lookup"); });
    vi.stubGlobal("fetch", fetch);
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "product-review-requirement-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const input = packageFor({}, { secret: SECRET });
      const call = async (request: FinalizeResearchInput) => {
        const result = await client.callTool({ name: "finalize_research", arguments: { ...request } });
        expect(result.isError).not.toBe(true);
        return assertNextStepsContract(result.structuredContent as FinalizeResearchOutput);
      };
      const withCaveats = async (request: FinalizeResearchInput) => {
        const first = await call(request);
        return call({ ...request, answer_draft: `${request.answer_draft}\n\n${first.caveats.join(" ")}` });
      };
      const missing = await withCaveats(input);
      expect(missing.status).toBe("not_ready");
      expect(missing.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([MAP_STEP]);
      expect(missing.receipts_verified).toBe(1);
      expect(missing.receipts_rejected).toEqual([]);
      expect(missing.finalization_receipt).toBeUndefined();
      const supplied = await withCaveats({ ...input, ...withReviews() });
      expect(supplied.status).toBe("ready_with_limits");
      expect(supplied.next_steps.filter((step) => step !== TOOL_LIST_REFRESH_HINT)).toEqual([]);
      expect(verifyResearchReceipt(supplied.finalization_receipt!, { secret: SECRET })).toMatchObject({
        ok: true, kind: "finalization", claims: { status: "ready_with_limits" }
      });
      expect(fetch).toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
