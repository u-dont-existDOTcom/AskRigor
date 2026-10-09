import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeResearch, type FinalizeResearchInput, type FinalizeResearchOutput } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, researchTargetDigest } from "../apps/research-mcp/src/research-receipts.js";
import { createAskRigorServer } from "../apps/research-mcp/src/server.js";

import { assertNextStepsContract } from "./helpers/finalize-next-steps-contract.js";

const SECRET = "finalize-product-identity-test-secret-0123456789";
const TARGET = "Lisheng Nan Bao experiences";
const PRODUCT = "Tianjin Lisheng Nan Bao";
const VIDEO = "ccccccccccc";
const STUDY = "10.1000/herbs";
const URL = "https://seller.example/product/nan-bao";
const QUOTES = {
  benefit_reports: "Two reported improvement.", no_effect_reports: "One reported no change.",
  adverse_reports: "None reported harms.", effect_on_answer: "These reports alone cannot establish an effect."
};
const CREATOR = "The creator sells the product, while commenters describe their own use.";
const sign = (kind: Parameters<typeof issueResearchReceipt>[0], claims: Parameters<typeof issueResearchReceipt>[1]) =>
  issueResearchReceipt(kind, claims, { secret: SECRET });

function packageFor(overrides: Partial<FinalizeResearchInput> = {}): FinalizeResearchInput {
  const reviews = {
    community: "Local Reviews", platform: "review_site" as const, queries: [TARGET],
    threads_read: [{ url: "https://reviews.example/nan-bao" }], ...QUOTES, answer_quotes: { ...QUOTES },
    review_corpora: [{ outcome_search: { queries: [TARGET], directions: ["benefit" as const, "no_effect" as const, "worse" as const] }, product: PRODUCT, reviews_shown: 3, reviews_read: 3, selection: "all" as const,
      item_identity: { exact_product: 2, variant_unresolved: 0, other_variant_excluded: 1 } }]
  };
  const forum = { community: "Herbs Forum", platform: "forum" as const, queries: [TARGET],
    threads_read: [{ url: "https://forum.example/nan-bao" }], ...QUOTES, answer_quotes: { ...QUOTES } };
  return {
    receipts: [sign("study_audit", { id: STUDY, status: "complete_no_unresolved_fields" })],
    community_evidence: "researched", commercial_review_applicability: { status: "required", products: [PRODUCT] },
    treatment_choice: "not_compared", research_target: TARGET, research_depth: "deep",
    principal_communities: [{ name: reviews.community, platform: reviews.platform }, { name: forum.community, platform: forum.platform }],
    community_searches: [reviews, forum], key_sources: [{ id: STUDY, status: "validated" }],
    intervention_identity: { status: "not_applicable", reason: "This study does not test a coded or multi-ingredient product." },
    shopping: { status: "not_requested" }, absence_claims: [], scale_results: [],
    answer_draft: `[Study](https://doi.org/${STUDY})\n\n` + [reviews, forum].map((lane) => `On [${lane.community}](${lane.threads_read[0]!.url}): ${Object.values(QUOTES).join(" ")}`).join("\n\n"),
    ...overrides
  };
}

function productPackage(kind: "youtube_video_audit" | "youtube_community_audit" = "youtube_video_audit"): FinalizeResearchInput {
  const base = packageFor();
  const target = researchTargetDigest(TARGET);
  const start = Date.now() - 10_000;
  return {
    ...base, receipts: [...base.receipts,
      ...[0, 1, 2].map((n) => sign("youtube_survey", { videos: [VIDEO], access: "complete", q: `angle${n}`, target, t: start + n })),
      ...(kind === "youtube_community_audit" ? [sign("youtube_video_audit", { video: VIDEO, records: 3, state: "api_visible_complete", lock: "pass" })] : []),
      sign(kind, { ...(kind === "youtube_video_audit" ? { video: VIDEO, records: 3 } : { videos: [VIDEO], read: [VIDEO], target, q: "angle4", t: start - 1 }),
        state: "api_visible_complete", lock: "pass", product: "nan bao", exact: [VIDEO] })],
    material_video_ids: [VIDEO],
    community_findings: { videos_reviewed: [VIDEO], ...QUOTES, creators_versus_commenters: CREATOR,
      answer_quotes: { ...QUOTES, creators_versus_commenters: CREATOR },
      product_corpora: [{ product: PRODUCT, video_ids: [VIDEO], exact_product_signal: "Two exact-product comments reported improvement.", variant_unresolved_signal: "No unresolved variant signal." }] },
    answer_draft: `${base.answer_draft}\n\nOn [this video](https://www.youtube.com/watch?v=${VIDEO}): ${Object.values(QUOTES).join(" ")} ${CREATOR}`
  };
}

const unresolved = { status: "checked" as const, interventions: [{ study_ids: [STUDY], label: "SHL 1046", status: "unresolved" as const }] };
const interventionCaveat = "The exact product tested in SHL 1046 was not traced to a current product, so this answer does not present it as something to buy.";
const shoppingCaveat = `No seller with a live offer for Mauritania was found for ${PRODUCT}.`;
type Offer = NonNullable<NonNullable<FinalizeResearchInput["shopping"]>["offers"]>[number];
const shopping = (offer_state: Offer["offer_state"]) => ({
  status: "buy_options" as const, destination: "Mauritania", offers: [{ product: PRODUCT, url: URL, offer_state, role: "buy_option" as const }]
});
const routes = ["international_storefronts", "marketplaces", "exporters"] as const;

type Case = { name: string; input: () => FinalizeResearchInput; step?: string; caveat?: string };
const cases: Case[] = [
  { name: "counts one Changhong review as excluded from Lisheng", input: () => packageFor() },
  { name: "refuses missing item_identity", input: () => { const p = packageFor(); delete p.community_searches![0]!.review_corpora![0]!.item_identity; return p; }, step: "Give item_identity" },
  { name: "refuses review counts that do not add up", input: () => { const p = packageFor(); p.community_searches![0]!.review_corpora![0]!.item_identity!.exact_product = 3; return p; }, step: "does not add up to reviews_read" },
  { name: "requires a coded key-study intervention declaration", input: () => packageFor({ intervention_identity: undefined }), step: "Give intervention_identity" },
  { name: "requires a not-applicable intervention reason", input: () => packageFor({ intervention_identity: { status: "not_applicable" } }), step: "Give a reason" },
  { name: "requires interventions when checked", input: () => packageFor({ intervention_identity: { status: "checked" } }), step: "Give interventions" },
  { name: "binds intervention studies to key_sources", input: () => packageFor({ intervention_identity: { status: "checked", interventions: [{ study_ids: ["10.1000/other"], label: "SHL 1046", status: "unresolved" }] } }), step: "outside key_sources" },
  { name: "requires a resolved product identity", input: () => packageFor({ intervention_identity: { status: "checked", interventions: [{ study_ids: [STUDY], label: "SHL 1046", status: "resolved" }] } }), step: "Give the resolved identity" },
  { name: "accepts resolved whole-intervention identity", input: () => packageFor({ intervention_identity: { status: "checked", interventions: [{ study_ids: [STUDY], label: "SHL 1046", status: "resolved", identity: { registry_code: "CTR-1046", sponsor_or_maker: "SAVA Herbals", current_product: "MUSSK" } }] } }) },
  { name: "adds the exact unresolved-intervention caveat", input: () => packageFor({ intervention_identity: unresolved }), caveat: interventionCaveat },
  { name: "requires shopping when a commercial product is listed", input: () => packageFor({ shopping: undefined }), step: "Give shopping" },
  { name: "refuses offers when shopping was not requested", input: () => packageFor({ shopping: { ...shopping("live_destination_orderable"), status: "not_requested" } }), step: "not_requested cannot list offers" },
  ...["identity_only", "domestic_orderable", "international_storefront", "destination_confirmed", "exporter_lead"].map((offer_state) => ({
    name: `refuses ${offer_state} as a destination buy option`, input: () => packageFor({ shopping: shopping(offer_state as Offer["offer_state"]), answer_draft: `${packageFor().answer_draft}\n\n[Seller](${URL})` }), step: "must be live_destination_orderable"
  })),
  { name: "requires a destination", input: () => packageFor({ shopping: { ...shopping("live_destination_orderable"), destination: undefined }, answer_draft: `${packageFor().answer_draft}\n\n[Seller](${URL})` }), step: "Give the destination" },
  { name: "refuses a live buy option missing from the answer", input: () => packageFor({ shopping: shopping("live_destination_orderable") }), step: "missing from answer_draft" },
  { name: "refuses a URL hidden in a code fence", input: () => packageFor({ shopping: shopping("live_destination_orderable"), answer_draft: `${packageFor().answer_draft}\n\n\`\`\`\n${URL}\n\`\`\`` }), step: "missing from answer_draft" },
  { name: "accepts a linked live destination buy option", input: () => packageFor({ shopping: shopping("live_destination_orderable"), answer_draft: `${packageFor().answer_draft}\n\n[Seller](${URL})` }) },
  { name: "accepts a domestic seller only as context", input: () => packageFor({ shopping: { ...shopping("live_destination_orderable"), offers: [...shopping("live_destination_orderable").offers, { product: PRODUCT, url: "https://india.example/nan-bao", offer_state: "domestic_orderable", role: "context" }] }, answer_draft: `${packageFor().answer_draft}\n\n[Seller](${URL})` }) },
  { name: "accepts an exporter lead only as context", input: () => packageFor({ shopping: { status: "no_live_option_found", destination: "Mauritania", routes_searched: [...routes], offers: [{ product: PRODUCT, url: URL, offer_state: "exporter_lead", role: "context" }] } }), caveat: shoppingCaveat },
  { name: "refuses fewer than three no-result routes", input: () => packageFor({ shopping: { status: "no_live_option_found", destination: "Mauritania", routes_searched: ["international_storefronts", "marketplaces"] } }), step: "at least three distinct" },
  { name: "refuses duplicate routes as three routes", input: () => packageFor({ shopping: { status: "no_live_option_found", destination: "Mauritania", routes_searched: ["marketplaces", "marketplaces", "marketplaces"] } }), step: "at least three distinct" },
  { name: "adds the exact no-live-option caveat", input: () => packageFor({ shopping: { status: "no_live_option_found", destination: "Mauritania", routes_searched: [...routes] } }), caveat: shoppingCaveat },
  { name: "requires product_corpora for commercial YouTube findings", input: () => { const p = productPackage(); delete p.community_findings!.product_corpora; return p; }, step: "Give community_findings.product_corpora" },
  { name: "requires one corpus per listed product", input: () => { const p = productPackage(); p.community_findings!.product_corpora = []; return p; }, step: "exactly one entry" },
  { name: "accepts an empty product video corpus", input: () => { const p = productPackage(); p.community_findings!.product_corpora![0]!.video_ids = []; return p; } },
  ...["youtube_video_audit", "youtube_community_audit"].map((kind) => ({ name: `accepts matching admitted ${kind} receipts`, input: () => productPackage(kind as "youtube_video_audit") })),
  ...["variant_unresolved", "mixed_variants"].map((productClass) => ({ name: `accepts admitted ${productClass} receipts`, input: () => {
    const p = productPackage();
    p.receipts[p.receipts.length - 1] = sign("youtube_video_audit", { video: VIDEO, records: 3, state: "api_visible_complete", lock: "pass", product: "nan bao", [productClass]: [VIDEO] });
    return p;
  } })),
  ...["other product", "missing admission", "survey only", "other target", "unreviewed"].map((failure) => ({
    name: `refuses product corpus with ${failure}`, input: () => {
      const p = productPackage();
      const target = failure === "other target" ? researchTargetDigest("other") : researchTargetDigest(TARGET);
      p.receipts[p.receipts.length - 1] = sign(failure === "survey only" ? "youtube_survey" : failure === "other target" ? "youtube_community_audit" : "youtube_video_audit", {
        video: VIDEO, videos: [VIDEO], read: [VIDEO], target, state: "api_visible_complete", lock: "pass", records: 3,
        product: failure === "other product" ? "changhong" : "nan bao", ...(failure === "missing admission" ? { other_variant: [VIDEO] } : { exact: [VIDEO] })
      });
      if (failure === "unreviewed") p.community_findings!.product_corpora![0]!.video_ids = ["bbbbbbbbbbb"];
      return p;
    }, step: "without a comment-audit receipt"
  }))
];

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function exercise(c: Case, call: (input: FinalizeResearchInput) => Promise<FinalizeResearchOutput>) {
  const input = c.input();
  const first = assertNextStepsContract(await call(input));
  if (c.caveat) {
    expect(first.caveats).toContain(c.caveat);
    expect(first.status).toBe("not_ready");
  }
  const result = assertNextStepsContract(await call({ ...input, answer_draft: `${input.answer_draft}\n\n${first.caveats.join(" ")}` }));
  if (c.step) {
    expect(result.status).toBe("not_ready");
    expect(result.next_steps.join(" ")).toContain(c.step);
    expect(result.finalization_receipt).toBeUndefined();
  } else {
    expect(result.next_steps).toEqual([]);
    expect(result.status).toBe("ready_with_limits");
    expect(result.finalization_receipt).toBeDefined();
  }
  return result;
}

describe("finalize product identity and destination shopping declarations", () => {
  it.each(cases)("$name", async (c) => {
    const result = await exercise(c, async (input) => finalizeResearch(input, { secret: SECRET }));
    if (c.name.startsWith("counts one")) expect(result.must_report.join(" ")).toContain("1 other-variant review(s) excluded");
  });

  it("checks buy-option links only once an answer draft is given", () => {
    const input = packageFor({ shopping: shopping("live_destination_orderable"), answer_draft: undefined });
    expect(finalizeResearch(input, { secret: SECRET }).next_steps.join(" ")).not.toContain("missing from answer_draft");
  });

  it("checks every declaration rule through the real MCP endpoint", async () => {
    vi.stubEnv("ASKRIGOR_YOUTUBE_CONTINUATION_SECRET", SECRET);
    vi.stubEnv("ASKRIGOR_FINALIZATION_SIGNING_SECRET", SECRET);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No external network in this test"); }));
    const server = createAskRigorServer("standard", { researchAccessRequired: false, findingsLibrary: false });
    const client = new Client({ name: "finalize-product-identity", version: "0.1.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b); await client.connect(a);
      for (const c of cases) await exercise(c, async (input) => {
        const result = await client.callTool({ name: "finalize_research", arguments: { ...input } });
        expect(result.isError, c.name).not.toBe(true);
        return result.structuredContent as FinalizeResearchOutput;
      });
    } finally { await client.close(); await server.close(); }
  });
});
