import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryAtlasNewsStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";

import { newsCardDigest, newsCardSchema } from "../apps/research-mcp/src/news/card.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { finalizeResearchInputSchema } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Atlas news, stage 1 (plan docs/superpowers/plans/2026-11-21-atlas-news-stage1.md): a news check's finalize_research
// call stages its own card. Every study, figure and funder here is invented; the identifiers are synthetic.

const SECRET = "atlas-news-finalize-test-secret-0123456789abcdef";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");
const SUBJECT = "auth0|news";
const HANDLE = `aft1_${"d".repeat(32)}`;
const QUOTE = "The liver clears this drug within a few hours.";
const FUNDING = "This invented study was funded by a public research council.";
const SKIP = communitySkipCaveat("How the body clears a drug, with no real-world outcome.");

const NEWS_CARD = {
  item_id: "item-0042",
  check_id: "check-0042",
  label: "evidence_uncertain",
  finding: "The liver clears this drug within hours in adults",
  for: "Adults taking this drug",
  how_much: "not reported in this invented study",
  outcome_kind: "none",
  how_sure: { level: "low", reason: "One small study" },
  what_you_can_do: "Nothing to do yet",
  who_can_do_it: "nothing_to_do",
  availability: [{ region: "everywhere", status: "unknown" }],
  design: "people_no_comparison_group",
  published: "2026-11-20",
  reach: "unknown",
  size: "unknown",
  urgency: "no_rush",
  can_act_now: "nothing_to_do",
  meets_our_bar: { meets: false, reason: "Changes no decision", reason_code: "no_decision" },
  other_outcomes: "None reported",
  harms: "None reported",
  limits: "One small study",
  who_paid: { status: "quoted", industry_funded: "no", funders: [{ name: "A public research council", backing: 0 }],
    declarations: [] },
  read: { depth: "partial_text", method_audit: "validated" },
  sources: ["PMC10518852", "10.1002/art.41142"],
  doi: "10.1002/art.41142",
  backing: [{ field: "who_paid", source: "PMC10518852", quote: FUNDING }],
};

describe("finalize_research stages the owner's news check's own card (Atlas news, stage 1)", () => {
  afterEach(() => {
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    delete process.env.ASKRIGOR_DEV_ACCOUNT_KEYS;
  });

  async function accessService() {
    const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
      identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor(SUBJECT, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    return service;
  }

  function finalizeTool(options: RegisterToolsOptions) {
    let handler: ((input: unknown, extra?: unknown) => Promise<CallToolResult>) | undefined;
    registerTools({
      registerTool: (registered: string, _config: unknown, execute: typeof handler) => {
        if (registered === "finalize_research") handler = execute;
      },
    } as unknown as McpServer, {
      researchAccessRequired: true, mcpSurface: "/mcp/claude",
      sourceLineTexts: { fullText: (handle) => handle === HANDLE
        ? { kind: "full_text", blocks: [{ text: QUOTE, section: "Results" }, { text: FUNDING, section: "Funding" }] }
        : undefined, abstract: async () => undefined },
      ...options,
    });
    return async (input: Record<string, unknown>) => handler!(withSourceReading(input), {
      authInfo: {
        token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: SUBJECT },
      },
    });
  }

  const call = (laterInputs: Record<string, unknown>) => ({
    ...finalizeResearchInputSchema.parse({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the news card's staging." },
      receipts: [issueResearchReceipt("study_audit", {
        id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields", handle: HANDLE,
      }, { secret: SECRET })],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome", question_about: "other",
      commercial_review_applicability: { status: "not_applicable", reason: "Drug clearance involves nothing people buy." },
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: "How the body clears a drug in adults",
      research_depth: "deep",
      intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded product." },
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" }],
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
      safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
      answer_draft: `${QUOTE}\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)\n\n${SKIP}`,
    }),
    later_inputs: laterInputs,
  });

  async function setUp(mode: "off" | "shadow", devAccount = true) {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    if (devAccount) process.env.ASKRIGOR_DEV_ACCOUNT_KEYS = researchAccountReference(service.accountKeyForSubject(SUBJECT));
    else delete process.env.ASKRIGOR_DEV_ACCOUNT_KEYS;
    const store = new InMemoryAtlasNewsStore();
    return { store, finalize: finalizeTool({ researchContributorAccessService: service,
      atlasNews: { mode, staging: store } }) };
  }

  it("stages a passing news check's card, marked off, from a dev account, and signs the news claims into its receipt", async () => {
    const { store, finalize } = await setUp("shadow");
    const result = await finalize(call({ news_card: NEWS_CARD, findings_save: "off" }));
    const structured = result.structuredContent as Record<string, any>;
    expect(structured.status).toMatch(/^ready/u);
    const digest = newsCardDigest(newsCardSchema.parse(NEWS_CARD));
    expect(structured.news).toEqual({ status: "staged", number: "N-1001", card_digest: digest, already_staged: false });
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims).toMatchObject({ news: digest, nl: ["1:f:full_text"], ns: ["1:Funding"], fs: "off" });
    const [item] = await store.inspectNumbers(["N-1001"], new Date().toISOString());
    expect(item).toMatchObject({ itemId: "item-0042", checkId: "check-0042", state: "staged", cardSha256: digest });
    expect(item!.draft).toContain(QUOTE);
    // The same check again stages nothing new: the same number comes back.
    const again = await finalize(call({ news_card: NEWS_CARD, findings_save: "off" }));
    expect((again.structuredContent as Record<string, any>).news).toMatchObject({ status: "staged", number: "N-1001",
      already_staged: true });
  });

  it("stages nothing without the mark, from an account that isn't a dev account, or with news off, and says why", async () => {
    const unmarked = await setUp("shadow");
    expect((await unmarked.finalize(call({ news_card: NEWS_CARD }))).structuredContent)
      .toMatchObject({ news: { status: "not_staged", reason: "not_marked_off" } });
    const stranger = await setUp("shadow", false);
    expect((await stranger.finalize(call({ news_card: NEWS_CARD, findings_save: "off" }))).structuredContent)
      .toMatchObject({ news: { status: "not_staged", reason: "not_a_dev_account" } });
    const off = await setUp("off");
    const result = await off.finalize(call({ news_card: NEWS_CARD, findings_save: "off" }));
    const structured = result.structuredContent as Record<string, any>;
    expect(structured.news).toEqual({ status: "not_staged", reason: "news_off" });
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims.news).toBeUndefined();
    for (const store of [unmarked.store, stranger.store, off.store]) {
      expect(await store.inspectDay(new Date().toISOString().slice(0, 10), new Date().toISOString()))
        .toEqual({ day: null, items: [] });
    }
  });

  it("never lets a news card change the check: one that breaks a rule is named, and the answer passes as it would", async () => {
    const { store, finalize } = await setUp("shadow");
    const without = (await finalize(call({ findings_save: "off" }))).structuredContent as Record<string, any>;
    const broken = (await finalize(call({ findings_save: "off",
      news_card: { ...NEWS_CARD, finding: "one two three four five six seven eight nine ten eleven twelve thirteen" } })))
      .structuredContent as Record<string, any>;
    expect(broken.status).toBe(without.status);
    expect(broken.next_steps).toEqual(without.next_steps);
    expect(broken.news).toMatchObject({ status: "not_staged", reason: "card_rejected" });
    expect(broken.news.problems[0]).toContain("13 words");
    expect(without.news).toBeUndefined();
    expect(await store.inspectDay(new Date().toISOString().slice(0, 10), new Date().toISOString()))
      .toEqual({ day: null, items: [] });
  });
});
