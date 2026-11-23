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
import { newsPubmedFallback, type NewsPubmedSource } from "../apps/research-mcp/src/news/pubmed-fallback.js";
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

  const call = (laterInputs: Record<string, unknown>, extraReceipts: string[] = [], secondSource = false) => ({
    ...finalizeResearchInputSchema.parse({
      lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
      full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the news card's staging." },
      receipts: [issueResearchReceipt("study_audit", {
        id: "PMC10518852", doi: "10.1002/art.41142", status: "complete_no_unresolved_fields", handle: HANDLE,
      }, { secret: SECRET }), ...extraReceipts],
      community_evidence: "not_relevant",
      not_relevant_basis: "no_real_world_outcome", question_about: "other",
      commercial_review_applicability: { status: "not_applicable", reason: "Drug clearance involves nothing people buy." },
      not_relevant_reason: "How the body clears a drug, with no real-world outcome.",
      treatment_choice: "not_compared",
      research_target: "How the body clears a drug in adults",
      research_depth: "deep",
      intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded product." },
      key_sources: [{ read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" },
        ...(secondSource ? [{ read_depth: "abstract_only" as const, answer_marker: "Second", id: "33333333",
          status: "validated" }] : [])],
      absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [], safety_claims: [],
      safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
      answer_draft: `${QUOTE}\n\n[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)` +
        `${secondSource ? "\n\nA second invented study was read too. [Second](https://pubmed.ncbi.nlm.nih.gov/33333333/)" : ""}` +
        `\n\n${SKIP}`,
    }),
    later_inputs: laterInputs,
  });

  async function setUp(mode: "off" | "shadow", devAccount = true, extra: Partial<RegisterToolsOptions> = {}) {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = await accessService();
    if (devAccount) process.env.ASKRIGOR_DEV_ACCOUNT_KEYS = researchAccountReference(service.accountKeyForSubject(SUBJECT));
    else delete process.env.ASKRIGOR_DEV_ACCOUNT_KEYS;
    const store = new InMemoryAtlasNewsStore();
    return { store, finalize: finalizeTool({ researchContributorAccessService: service,
      atlasNews: { mode, staging: store }, ...extra }) };
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

  it("looks the news card's lines up by the news card's rules: a quote that keeps its section's label is found", async () => {
    // The 23 Nov 2026 news audit (fix 2): "FUNDING: …" was looked for whole, and the who-paid line was not found.
    const { finalize } = await setUp("shadow");
    const labelled = { ...NEWS_CARD, item_id: "item-0044",
      backing: [{ field: "who_paid", source: "PMC10518852", quote: `FUNDING: ${FUNDING}` }] };
    const structured = (await finalize(call({ news_card: labelled, findings_save: "off" })))
      .structuredContent as Record<string, any>;
    expect(structured.news).toMatchObject({ status: "staged" });
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims).toMatchObject({ nl: ["1:f:full_text"], ns: ["1:Funding"] });
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

  it("stages no card whose DOI isn't one the call's verified receipts name", async () => {
    const { store, finalize } = await setUp("shadow");
    const otherPaper = { ...NEWS_CARD, sources: ["PMC10518852", "10.1000/another.paper"], doi: "10.1000/another.paper" };
    const structured = (await finalize(call({ news_card: otherPaper, findings_save: "off" })))
      .structuredContent as Record<string, any>;
    expect(structured.news).toEqual({ status: "not_staged", reason: "doi_not_verified" });
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims.news).toBeUndefined();
    // A DOI resolution of another paper doesn't make it the paper the check read.
    const resolved = (await finalize(call({ news_card: otherPaper, findings_save: "off" },
      [issueResearchReceipt("doi_resolution", { doi: "10.1000/another.paper" }, { secret: SECRET })])))
      .structuredContent as Record<string, any>;
    expect(resolved.news).toEqual({ status: "not_staged", reason: "doi_not_verified" });
    // Nor does a key source the card doesn't quote: the DOI must be the paper behind its backing lines.
    const unquoted = { ...NEWS_CARD, sources: ["PMC10518852", "10.1002/art.41142", "33333333"], doi: "10.1000/second.paper" };
    const second = (await finalize(call({ news_card: { ...unquoted, sources: [...unquoted.sources, "10.1000/second.paper"] },
      findings_save: "off" }, [issueResearchReceipt("pubmed_record", { pmid: "33333333", doi: "10.1000/second.paper", abs: "1" },
      { secret: SECRET })], true))).structuredContent as Record<string, any>;
    expect(second.status).toMatch(/^ready/u);
    expect(second.news).toEqual({ status: "not_staged", reason: "doi_not_verified" });
    expect(await store.inspectDay(new Date().toISOString().slice(0, 10), new Date().toISOString()))
      .toEqual({ day: null, items: [] });
  });

  it("never lets a news card change the check: one that breaks a rule is named, and the answer passes as it would", async () => {
    const { store, finalize } = await setUp("shadow");
    const without = (await finalize(call({ findings_save: "off" }))).structuredContent as Record<string, any>;
    const broken = (await finalize(call({ findings_save: "off",
      news_card: { ...NEWS_CARD, finding: Array.from({ length: 25 }, (_, place) => `word${place + 1}`).join(" ") } })))
      .structuredContent as Record<string, any>;
    expect(broken.status).toBe(without.status);
    expect(broken.next_steps).toEqual(without.next_steps);
    expect(broken.news).toMatchObject({ status: "not_staged", reason: "card_rejected" });
    expect(broken.news.problems[0]).toContain("25 words; at most 24");
    expect(without.news).toBeUndefined();
    expect(await store.inspectDay(new Date().toISOString().slice(0, 10), new Date().toISOString()))
      .toEqual({ day: null, items: [] });
  });

  // The 23 Nov 2026 news audit (fix 3): a short news item the full-text tool admitted no copy of (it refused a JAMA news
  // piece under its 2,000-character floor), whose PubMed record the check never fetched, left its card unverified. Its
  // PubMed record is now read by AskRigor itself, through a stubbed PubMed here.
  const NEWS_DOI = "10.1000/invented.news.item";
  const NEWS_PMID = "99999903";
  const NEWS_TITLE = "An invented society advises on an invented drug while breastfeeding.";
  const NEWS_ABSTRACT = "The invented society now advises shared decisions about the invented drug while breastfeeding.";
  const NEWS_ITEM_CARD = {
    ...NEWS_CARD,
    item_id: "item-0043",
    check_id: "check-0043",
    finding: "An invented society advises shared decisions about an invented drug while breastfeeding",
    who_paid: { status: "not_checked", industry_funded: "not_checked", funders: [], declarations: [] },
    read: { depth: "secondary_only", method_audit: "not_validated" },
    sources: [NEWS_DOI],
    doi: NEWS_DOI,
    backing: [
      { field: "limits", source: NEWS_DOI, quote: NEWS_ABSTRACT },
      { field: "finding", source: NEWS_DOI, quote: "An invented society advises on an invented drug while breastfeeding" },
    ],
  };
  const newsItemCall = (receipts: string[]) => {
    const base = call({ news_card: NEWS_ITEM_CARD, findings_save: "off" }, receipts);
    return { ...base,
      key_sources: [...base.key_sources, { read_depth: "secondary_only", answer_marker: "News", id: NEWS_DOI,
        status: "lead_only" }],
      answer_draft: `${base.answer_draft}\n\nAn invented journal's news item was read in a secondary copy only. ` +
        `[News](https://doi.org/${NEWS_DOI})` };
  };
  const lead = (state = "ABSTRACT_ONLY") => issueResearchReceipt("full_text_lead", { doi: NEWS_DOI, state },
    { secret: SECRET });
  const pubmed = (recordDoi = NEWS_DOI) => {
    const asked: string[] = [];
    const source: NewsPubmedSource = {
      pmidsForDoi: async (doi) => { asked.push(doi); return [NEWS_PMID]; },
      record: async (pmid) => ({ pmid, doi: recordDoi, title: NEWS_TITLE, abstract: NEWS_ABSTRACT }),
    };
    return { asked, source };
  };

  it("reads a short news item the full-text tool admitted no copy of in its PubMed record, and says so", async () => {
    const { asked, source } = pubmed();
    const { store, finalize } = await setUp("shadow", true, { newsPubmed: source });
    const structured = (await finalize(newsItemCall([lead()]))).structuredContent as Record<string, any>;
    expect(structured.status).toMatch(/^ready/u);
    expect(asked).toEqual([NEWS_DOI]);
    const digest = newsCardDigest(newsCardSchema.parse(NEWS_ITEM_CARD));
    expect(structured.news).toEqual({ status: "staged", number: "N-1001", card_digest: digest, already_staged: false,
      pubmed_record: NEWS_PMID });
    // The quotes were looked up in the record's abstract and title, and the receipt signs which record that was.
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims).toMatchObject({ news: digest, nl: ["1:f:abstract", "2:f:abstract"],
      ns: ["2:Title"], np: NEWS_PMID });
    const [item] = await store.inspectNumbers(["N-1001"], new Date().toISOString());
    expect(item!.receiptClaims).toMatchObject({ np: NEWS_PMID, nl: ["1:f:abstract", "2:f:abstract"] });
  });

  it("keeps a news item unverified when PubMed's record has another DOI, or the full-text tool was never tried", async () => {
    const other = pubmed("10.1000/another.item");
    const mismatched = await setUp("shadow", true, { newsPubmed: other.source });
    const refused = (await mismatched.finalize(newsItemCall([lead()]))).structuredContent as Record<string, any>;
    expect(other.asked).toEqual([NEWS_DOI]);
    expect(refused.news).toEqual({ status: "not_staged", reason: "doi_not_verified" });
    const signed = verifyResearchReceipt(refused.finalization_receipt as string, { secret: SECRET });
    expect(signed.ok && signed.claims.np).toBeUndefined();
    // With no lead or route failure from the full-text tool for it, no record is fetched: the DOI stays as it was.
    const untried = pubmed();
    const quiet = await setUp("shadow", true, { newsPubmed: untried.source });
    const unread = (await quiet.finalize(newsItemCall([issueResearchReceipt("doi_resolution", { doi: NEWS_DOI },
      { secret: SECRET })]))).structuredContent as Record<string, any>;
    expect(untried.asked).toEqual([]);
    expect(unread.news).toEqual({ status: "not_staged", reason: "doi_not_verified" });
    for (const store of [mismatched.store, quiet.store]) {
      expect(await store.inspectDay(new Date().toISOString().slice(0, 10), new Date().toISOString()))
        .toEqual({ day: null, items: [] });
    }
  });
});

describe("the news card's PubMed fallback reads a DOI as acquisition and the final check do", () => {
  // Codex's review of #517: a SICI-form DOI given with "<" and ">" percent-escaped, as acquire_open_full_text's published
  // pattern takes it, is the same DOI as its record's own spelling.
  const record = { pmid: "99999905", doi: "10.1000/(SICI)invented<item>2.0.CO;2-X", title: "An invented news item.",
    abstract: "An invented council paid for the invented trial." };
  const source: NewsPubmedSource = {
    pmidsForDoi: async () => [record.pmid],
    record: async (pmid) => pmid === record.pmid ? record : undefined,
  };

  it("keeps the record for the escaped form, the link form and the plain form alike", async () => {
    for (const doi of ["10.1000/(sici)invented%3Citem%3E2.0.co;2-x", "https://doi.org/10.1000/%28SICI%29invented%3Citem%3E2.0.CO%3B2-X",
      "doi: 10.1000/(SICI)invented<item>2.0.CO;2-X"]) {
      expect((await newsPubmedFallback(doi, source))?.pmid).toBe(record.pmid);
    }
  });

  it("still refuses a record whose own DOI is another", async () => {
    expect(await newsPubmedFallback("10.1000/(sici)invented%3Citem%3E2.0.co;2-y", source)).toBeUndefined();
  });
});
