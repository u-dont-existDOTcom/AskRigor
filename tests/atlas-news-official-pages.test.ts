import { createHash } from "node:crypto";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryAtlasNewsStore,
  InMemoryResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  researchAccountReference,
} from "@askrigor/evidence-repository";
import type { ForumPage } from "@askrigor/sources";

import { forumTextDigest, forumThreadDigest } from "../apps/research-mcp/src/forum-thread-links.js";
import { checkNewsCard, newsCardDigest, newsCardSchema, type NewsCard } from "../apps/research-mcp/src/news/card.js";
import { publishNewsDay, type NewsDayPayload, type NewsReading } from "../apps/research-mcp/src/news/day.js";
import {
  lookUpNewsPages, NEWS_PAGE_LIMIT, NEWS_PAGE_MILLISECONDS, type NewsLine, type NewsPageRequest,
} from "../apps/research-mcp/src/news/web-page.js";
import { registerTools, type RegisterToolsOptions } from "../apps/research-mcp/src/register-tools.js";
import { finalizeResearchInputSchema } from "../apps/research-mcp/src/research-finalization-gate.js";
import { issueResearchReceipt, verifyResearchReceipt } from "../apps/research-mcp/src/research-receipts.js";
import { communitySkipCaveat } from "./helpers/community-skip.js";
import { withSourceReading } from "./helpers/source-reading.js";

// Atlas news (the 24 Nov 2026 news audit): every quote from gov.uk or fda.gov came back unchecked, so an official
// notice's card was always kept back (N-1001 on 22 Nov, N-1013 on 24 Nov). A quote from a page the check read with
// read_forum_thread is now looked up in that page, read again and unchanged. Every agency, medicine, figure, page and
// sentence here is invented.

const NOTICE = "https://www.invented-agency.example/safety/invented-medicine-label-change";
const OTHER = "https://www.invented-office.example/guidance/invented-medicine";
const ACTION = "The agency is requiring makers of the invented medicine to add a warning about a rare eye injury to its label.";
const FIGURES = "Overall, the results showed an eye injury rate of 6.4 events per 100,000 person-years in patients treated " +
  "with the invented medicine and 3.8 events per 100,000 person-years in comparator-treated patients.";
const ADVICE = "Patients should contact their health care professional right away if they have any of these symptoms.";
const filler = (words: number) => Array.from({ length: words }, (_, place) => `Invented sentence number ${place + 1} says nothing more.`)
  .join("\n");
const NOTICE_TEXT = ["Invented Agency", "Skip to main content", "What is the agency doing?", ACTION,
  "What did the agency find?", FIGURES, "What should patients do?", ADVICE, filler(30)].join("\n");
const YEARLY = "People taking the invented medicine should have their eyes checked every year.";
const OTHER_TEXT = ["The invented office says what follows.", YEARLY, filler(40)].join("\n");
const SIGNED = [forumTextDigest(NOTICE_TEXT)];
const OTHER_SIGNED = [forumTextDigest(OTHER_TEXT)];

const page = (text: string, change: Partial<ForumPage> = {}): ForumPage =>
  ({ url: NOTICE, access_state: "read", page_text: text, truncated: false, ...change });
const line = (sentence: string, field: NewsLine["field"] = "official_action", source = NOTICE): NewsLine =>
  ({ source, sentence, field });
const request = (place: number, url = NOTICE, texts: readonly string[] = SIGNED): NewsPageRequest =>
  ({ line: place, keySource: true, handles: [], pmids: [], page: { url, texts } });
const outcomes = (lookups: Awaited<ReturnType<typeof lookUpNewsPages>>) =>
  lookups.map(({ sentence, text, reason }) => [sentence, text, reason]);

describe("a news card's quote is looked up in the page its check read, read again and unchanged", () => {
  it("finds a whole sentence of a page that reads as its receipt signed, and calls a changed one missing", async () => {
    const lines = [line(ACTION), line(FIGURES, "how_much"),
      line(FIGURES.replace("6.4", "4.6"), "how_much"),
      // The news card's own matching: the white space beside a dash is set aside, as in a paper's text.
      line("Overall, the results showed an eye injury rate of 6.4 events per 100,000 person - years in patients treated " +
        "with the invented medicine and 3.8 events per 100,000 person-years in comparator-treated patients.", "how_much")];
    const read = vi.fn(async () => page(NOTICE_TEXT));
    const lookups = await lookUpNewsPages(lines, lines.map((_, place) => request(place)), read);
    expect(outcomes(lookups)).toEqual([["found", "web_page", undefined], ["found", "web_page", undefined],
      ["not_found", "web_page", undefined], ["found", "web_page", undefined]]);
    // Read once for the check, whatever the lines.
    expect(read.mock.calls).toEqual([[NOTICE]]);
  });

  it("finds no part of a sentence that a page's tags broke over lines", async () => {
    const text = ["Invented Agency", "The invented medicine did", "not", "reduce the rate of eye injuries in adults.",
      filler(30)].join("\n");
    const lines = [line("reduce the rate of eye injuries in adults."),
      line("The invented medicine did not reduce the rate of eye injuries in adults.")];
    const lookups = await lookUpNewsPages(lines, lines.map((_, place) => request(place, NOTICE, [forumTextDigest(text)])),
      async () => page(text));
    expect(lookups.map(({ sentence }) => sentence)).toEqual(["not_found", "not_found"]);
    // Whole with what its lines run on from: the page's first line has no full stop of its own.
    const whole = [line("Invented Agency The invented medicine did not reduce the rate of eye injuries in adults.")];
    expect((await lookUpNewsPages(whole, [request(0, NOTICE, [forumTextDigest(text)])], async () => page(text)))[0]!.sentence)
      .toBe("found");
  });

  it("leaves a quote unchecked when the page now reads otherwise, even by one character", async () => {
    const changed = NOTICE_TEXT.replace("Skip to main content", "Skip to the main content");
    expect(changed).toContain(ACTION);
    const lookups = await lookUpNewsPages([line(ACTION)], [request(0)], async () => page(changed));
    expect(outcomes(lookups)).toEqual([["not_checked", undefined, "text_changed"]]);
    // Read twice in the research, with two texts: either one is the text that was read.
    const twice = [request(0, NOTICE, [...SIGNED, forumTextDigest(changed)])];
    expect((await lookUpNewsPages([line(ACTION)], twice, async () => page(changed)))[0]!.sentence).toBe("found");
  });

  it("leaves a quote unchecked when the page can't be read again, whatever stops it", async () => {
    for (const answer of [
      async () => page("", { access_state: "blocked" }),
      async () => page("", { access_state: "robots_disallowed" }),
      async () => page("", { access_state: "needs_a_browser" }),
      async () => page("", { access_state: "unavailable" }),
      async () => ({ url: NOTICE, access_state: "read" }) as ForumPage,
      async () => undefined as unknown as ForumPage,
      async () => { throw new Error("unreached"); },
      () => { throw new Error("refused at once"); },
    ]) {
      expect(outcomes(await lookUpNewsPages([line(ACTION)], [request(0)], answer)))
        .toEqual([["not_checked", undefined, "text_unavailable"]]);
    }
  });

  it("waits for a page no longer than it may, and a slow page costs another page's lines nothing", async () => {
    const lines = [line(ACTION), line(YEARLY, "what_you_can_do", OTHER)];
    const started = Date.now();
    const lookups = await lookUpNewsPages(lines, [request(0), request(1, OTHER, OTHER_SIGNED)],
      (url) => url === NOTICE ? new Promise(() => undefined) : Promise.resolve(page(OTHER_TEXT)), 50);
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(outcomes(lookups)).toEqual([["not_checked", undefined, "text_unavailable"], ["found", "web_page", undefined]]);
    // Within the final check's own eight seconds for the news card's lines.
    expect(NEWS_PAGE_MILLISECONDS).toBeLessThan(8_000);
  });

  it("reads two pages at once and looks each line up in its own", async () => {
    const asked: string[] = [];
    let release: () => void = () => undefined;
    const both = new Promise<void>((resolve) => { release = resolve; });
    const read = async (url: string) => {
      asked.push(url);
      if (asked.length === 2) release();
      await both;
      return page(url === NOTICE ? NOTICE_TEXT : OTHER_TEXT);
    };
    const lines = [line(ACTION), line(YEARLY, "what_you_can_do", OTHER), line(YEARLY, "what_you_can_do"),
      line(ACTION, "for", OTHER)];
    const lookups = await lookUpNewsPages(lines, [request(0), request(1, OTHER, OTHER_SIGNED), request(2),
      request(3, OTHER, OTHER_SIGNED)], read);
    expect(lookups.map(({ sentence, text }) => [sentence, text])).toEqual([["found", "web_page"], ["found", "web_page"],
      ["not_found", "web_page"], ["not_found", "web_page"]]);
    expect(asked.sort()).toEqual([NOTICE, OTHER].sort());
  });

  it("reads at most three pages a check, the ones the day call asks for first", async () => {
    const urls = ["a", "b", "c"].map((name) => `https://www.invented-${name}.example/page`);
    const lines = [...urls.map((url) => line(ADVICE, "limits", url)), line(ACTION, "official_action")];
    const requests = [...urls.map((url, place) => request(place, url)), request(3)];
    const read = vi.fn(async () => page(NOTICE_TEXT));
    const lookups = await lookUpNewsPages(lines, requests, read);
    expect(NEWS_PAGE_LIMIT).toBe(3);
    expect(read.mock.calls.map(([url]) => url)).toEqual([NOTICE, urls[0], urls[1]]);
    expect(outcomes(lookups)).toEqual([["found", "web_page", undefined], ["found", "web_page", undefined],
      ["not_checked", undefined, "text_unavailable"], ["found", "web_page", undefined]]);
  });

  it("never reads Reddit, and reads nothing for a quote too short to mean much", async () => {
    const read = vi.fn(async () => page(NOTICE_TEXT));
    for (const url of ["https://www.reddit.com/r/invented/comments/abc123/", "https://redd.it/abc123", "https://old.reddit.com./x"]) {
      expect(outcomes(await lookUpNewsPages([line(ACTION, "official_action", url)], [request(0, url)], read)))
        .toEqual([["not_checked", undefined, "text_unavailable"]]);
    }
    expect(outcomes(await lookUpNewsPages([line("It is required.")], [request(0)], read)))
      .toEqual([["not_checked", undefined, "too_short"]]);
    expect(read).not.toHaveBeenCalled();
  });

  it("doesn't call a quote missing from a page the reader cut at its size limit", async () => {
    const lookups = await lookUpNewsPages([line(ACTION), line("The rest of the page says something else entirely.")],
      [request(0), request(1)], async () => page(NOTICE_TEXT, { truncated: true }));
    expect(outcomes(lookups)).toEqual([["found", "web_page", undefined], ["not_checked", "web_page", "text_unavailable"]]);
  });

  it("finds no sentence the reader's cut left unfinished, though what is left of it looks whole", async () => {
    const before = "The whole sentence before the cut says one thing.";
    const last = "The invented medicine lowers the rate of eye injuries";
    for (const text of [`${before} ${last}`, `${before} ${last}.`, `${before} ${last} by 12.`, `${before} ${last} (see `]) {
      const full = [filler(30), text].join("\n");
      const lines = [line(before), line(`${last}.`), line(`${last} by 12.`)];
      const texts = [forumTextDigest(full)];
      const requests = lines.map((_, place) => request(place, NOTICE, texts));
      const cut = await lookUpNewsPages(lines, requests, async () => page(full, { truncated: true }));
      expect(cut.map(({ sentence }) => sentence), text).toEqual(["found", "not_checked", "not_checked"]);
    }
    // The same words at a page's own end are its last sentence.
    const whole = [filler(30), `${before} ${last}.`].join("\n");
    expect((await lookUpNewsPages([line(`${last}.`)], [request(0, NOTICE, [forumTextDigest(whole)])],
      async () => page(whole)))[0]!.sentence).toBe("found");
  });

  it("digests the text as returned: one text one digest, another text another", () => {
    expect(forumTextDigest(NOTICE_TEXT)).toMatch(/^[0-9a-f]{32}$/u);
    expect(forumTextDigest(NOTICE_TEXT)).toBe(createHash("sha256").update(NOTICE_TEXT, "utf8").digest("hex").slice(0, 32));
    expect(forumTextDigest(`${NOTICE_TEXT} `)).not.toBe(forumTextDigest(NOTICE_TEXT));
  });
});

const SECRET = "atlas-news-official-pages-secret-0123456789abcdef";
const IDENTITY_SECRET = new TextEncoder().encode("synthetic-research-identity-secret-with-at-least-thirty-two-bytes");
const SUBJECT = "auth0|news-official";
const HANDLE = `aft1_${"f".repeat(32)}`;
const PAPER = "10.1002/art.41142";
const STUDY = "The invented medicine's effect on the eye was seen in 12 of 400 patients.";
const SKIP = communitySkipCaveat("What an agency's label says, with no real-world outcome.");

const NOTICE_CARD = {
  item_id: "item-0101",
  check_id: "check-0101",
  label: "safety_notice",
  finding: "An invented agency requires a label warning about a rare eye injury for an invented medicine",
  for: "Adults taking the invented medicine",
  how_much: "6.4 against 3.8 events per 100,000 person-years",
  outcome_kind: "none",
  how_sure: { level: "low", reason: "The agency's own review" },
  what_you_can_do: "Call a health care professional right away about a change in vision",
  who_can_do_it: "with_a_prescription",
  availability: [{ region: "everywhere", status: "prescription_only" }],
  design: "official_notice",
  published: "2026-11-09",
  reach: "over_10_million",
  size: "small",
  urgency: "soon",
  can_act_now: "yes_with_a_doctor",
  meets_our_bar: { meets: true, reason: "Changes what a person taking it watches for" },
  other_outcomes: "None reported",
  harms: "A rare, permanent loss of vision",
  limits: "The rate with and without the medicine is the agency's own figure",
  who_paid: { status: "not_checked", industry_funded: "not_checked", funders: [], declarations: [] },
  read: { depth: "full_text", method_audit: "not_validated" },
  sources: [NOTICE, "PMC10518852"],
  official_action: "The invented agency required a label warning about a rare eye injury.",
  backing: [
    { field: "official_action", source: NOTICE, quote: ACTION },
    { field: "how_much", source: NOTICE, quote: FIGURES },
    { field: "what_you_can_do", source: NOTICE, quote: ADVICE },
    { field: "limits", source: "PMC10518852", quote: STUDY },
  ],
};

describe("finalize_research looks an official notice's quotes up in the page its check read", () => {
  afterEach(() => {
    delete process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET;
    delete process.env.ASKRIGOR_DEV_ACCOUNT_KEYS;
  });

  async function setUp(read: (url: string) => Promise<ForumPage>, devAccount = true) {
    process.env.ASKRIGOR_FINALIZATION_SIGNING_SECRET = SECRET;
    const service = new ResearchContributorAccessService({ store: new InMemoryResearchContributorAccessStore(),
      identitySecret: IDENTITY_SECRET });
    await service.acceptFreeContributor(SUBJECT, { noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true, prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true, paidPrivateAlternativeAcknowledged: true });
    if (devAccount) process.env.ASKRIGOR_DEV_ACCOUNT_KEYS = researchAccountReference(service.accountKeyForSubject(SUBJECT));
    const store = new InMemoryAtlasNewsStore();
    const reader = vi.fn(read);
    const handlers = new Map<string, (input: unknown, extra?: unknown) => Promise<CallToolResult>>();
    registerTools({ registerTool: (name: string, _config: unknown, execute: (input: unknown) => Promise<CallToolResult>) => {
      handlers.set(name, execute);
    } } as unknown as McpServer, {
      researchAccessRequired: true, mcpSurface: "/mcp/claude", researchContributorAccessService: service,
      atlasNews: { mode: "shadow", staging: store }, forumPageReader: reader as RegisterToolsOptions["forumPageReader"],
      sourceLineTexts: { fullText: (handle) => handle === HANDLE ? { kind: "full_text", blocks: [{ text: STUDY, section: "Results" }] }
        : undefined, abstract: async () => undefined },
    });
    const call = async (name: string, input: Record<string, unknown>) => (await handlers.get(name)!(input, {
      authInfo: { token: "synthetic-token", clientId: "synthetic-client", scopes: ["research:use"],
        expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject: SUBJECT } },
    })).structuredContent as Record<string, any>;
    /** The research: the notice read through the tool itself, and a paper's audit. Reads so far are forgotten. */
    const receipts = async (url = NOTICE) => {
      const read = await call("read_forum_thread", { url });
      reader.mockClear();
      return [read.research_receipt as string, issueResearchReceipt("study_audit", { id: "PMC10518852", doi: PAPER,
        status: "complete_no_unresolved_fields", handle: HANDLE }, { secret: SECRET })];
    };
    const finalize = (given: string[], laterInputs: Record<string, unknown>, source = NOTICE) => call("finalize_research",
      withSourceReading({
        ...finalizeResearchInputSchema.parse({
          lab_preparation: { status: "not_applicable", reason: "Synthetic fixture interprets no lab result and plans no test." },
          full_text_search: { status: "not_needed", reason: "Synthetic fixture isolates the news card's lookups." },
          receipts: given,
          community_evidence: "not_relevant",
          not_relevant_basis: "no_real_world_outcome", question_about: "other",
          commercial_review_applicability: { status: "not_applicable", reason: "A label change involves nothing people buy." },
          not_relevant_reason: "What an agency's label says, with no real-world outcome.",
          treatment_choice: "not_compared",
          research_target: "What an invented agency's label change says",
          research_depth: "deep",
          intervention_identity: { status: "not_applicable", reason: "These key studies do not concern a coded product." },
          key_sources: [
            { read_depth: "full_text_read" as const, answer_marker: "Notice", id: source, status: "validated" },
            { read_depth: "partial_text" as const, answer_marker: "Study", id: "PMC10518852", status: "validated" },
          ],
          absence_claims: [], scale_results: [], binary_results: [], user_observations: [], proposed_tests: [],
          safety_claims: [], safety_question: false, key_terms: [], mechanism_claims: [], recommendations: [],
          answer_draft: `${ACTION} [Notice](${source})\n\n${FIGURES}\n\n${STUDY} ` +
            `[Study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10518852/)\n\n${SKIP}`,
        }),
        later_inputs: laterInputs,
      }) as Record<string, unknown>);
    return { store, reader, call, receipts, finalize };
  }

  const claims = (structured: Record<string, any>) => {
    expect(structured.status, JSON.stringify(structured.next_steps)).toMatch(/^ready/u);
    const signed = verifyResearchReceipt(structured.finalization_receipt as string, { secret: SECRET });
    if (!signed.ok) throw new Error("unverified");
    return signed.claims;
  };

  it("signs which lines were found in the page, read again by the tool's own reader, and stages the card", async () => {
    const { store, reader, receipts, finalize } = await setUp(async (url) => page(NOTICE_TEXT, { url }));
    const given = await receipts();
    // The read's receipt signs the text it returned, beside its length, its link and what it signed before.
    const read = verifyResearchReceipt(given[0]!, { secret: SECRET });
    expect(read).toMatchObject({ ok: true, kind: "forum_thread_read", claims: { u: forumThreadDigest(NOTICE), v: "page",
      n: String(NOTICE_TEXT.length), e: "1", tx: forumTextDigest(NOTICE_TEXT) } });
    const structured = await finalize(given, { news_card: NOTICE_CARD, findings_save: "off" });
    expect(claims(structured)).toMatchObject({ nl: ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text"],
      ns: ["4:Results"], news: newsCardDigest(newsCardSchema.parse(NOTICE_CARD)) });
    expect(reader.mock.calls.map(([url]) => url)).toEqual([NOTICE]);
    expect(structured.news).toMatchObject({ status: "staged", number: "N-1001" });
    const [item] = await store.inspectNumbers(["N-1001"], new Date().toISOString());
    expect(item!.receiptClaims.nl).toEqual(["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text"]);
    // Nothing of the page is kept: the record holds what it held before.
    expect(JSON.stringify(item)).not.toContain("Skip to main content");
  });

  it("reads the page by any link that names it as the gate compares links, https always", async () => {
    const { reader, receipts, finalize } = await setUp(async (url) => page(NOTICE_TEXT, { url }));
    const given = await receipts();
    const link = `${NOTICE.replace("https://www.", "http://")}/?utm_source=feed`;
    const card = { ...NOTICE_CARD, sources: [link, "PMC10518852"],
      backing: NOTICE_CARD.backing.map((backing) => backing.source === NOTICE ? { ...backing, source: link } : backing) };
    expect(claims(await finalize(given, { news_card: card, findings_save: "off" }, link)).nl)
      .toEqual(["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text"]);
    expect(reader.mock.calls.map(([url]) => url)).toEqual([link.replace("http:", "https:")]);
  });

  it("leaves the lines unchecked when the page changed, and still finds the paper's", async () => {
    let text = NOTICE_TEXT;
    const { receipts, finalize } = await setUp(async (url) => page(text, { url }));
    const given = await receipts();
    text = NOTICE_TEXT.replace("a rare eye injury", "an eye injury");
    expect(claims(await finalize(given, { news_card: NOTICE_CARD, findings_save: "off" })).nl)
      .toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
  });

  it("leaves a page that doesn't answer unchecked after its own time, and finds the paper's line all the same", async () => {
    let answers = true;
    const { reader, receipts, finalize } = await setUp(async (url) => answers ? page(NOTICE_TEXT, { url })
      : new Promise<ForumPage>(() => undefined));
    const given = await receipts();
    answers = false;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const pending = finalize(given, { news_card: NOTICE_CARD, findings_save: "off" });
      // The event loop turns, no fake time passing, until the page is asked for.
      for (let turn = 0; turn < 5_000 && reader.mock.calls.length < 1; turn += 1) await vi.advanceTimersByTimeAsync(0);
      expect(reader).toHaveBeenCalledTimes(1);
      let settled = false;
      void pending.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(NEWS_PAGE_MILLISECONDS - 1_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(claims(await pending).nl).toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the lines unchecked, as before, when no read of the page was passed or its receipt signs no text", async () => {
    const { reader, receipts, finalize } = await setUp(async (url) => page(NOTICE_TEXT, { url }));
    const [, audit] = await receipts();
    const unsigned = issueResearchReceipt("forum_thread_read", { u: forumThreadDigest(NOTICE), n: NOTICE_TEXT.length, v: "page",
      e: "1", pv: "0", pa: "0" }, { secret: SECRET });
    expect(claims(await finalize([unsigned, audit!], { news_card: NOTICE_CARD, findings_save: "off" })).nl)
      .toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
    // A Reddit read of the same link, or another page's read, names no page here either.
    const reddit = issueResearchReceipt("forum_thread_read", { u: forumThreadDigest(NOTICE), n: 3, v: "reddit",
      tx: forumTextDigest(NOTICE_TEXT), e: "1" }, { secret: SECRET });
    expect(claims(await finalize([reddit, audit!], { news_card: NOTICE_CARD, findings_save: "off" })).nl)
      .toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
    expect(reader).not.toHaveBeenCalled();
  });

  it("reads a page again only for the owner's own news check: a dev account, marked off", async () => {
    const dev = await setUp(async (url) => page(NOTICE_TEXT, { url }));
    const given = await dev.receipts();
    expect(claims(await dev.finalize(given, { news_card: NOTICE_CARD })).nl)
      .toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
    expect(dev.reader).not.toHaveBeenCalled();
    delete process.env.ASKRIGOR_DEV_ACCOUNT_KEYS;
    const stranger = await setUp(async (url) => page(NOTICE_TEXT, { url }), false);
    expect(claims(await stranger.finalize(await stranger.receipts(), { news_card: NOTICE_CARD, findings_save: "off" })).nl)
      .toEqual(["1:u:none", "2:u:none", "3:u:none", "4:f:full_text"]);
    expect(stranger.reader).not.toHaveBeenCalled();
  });

  it("looks no other line up in a page: a source line from the same page is as it was", async () => {
    const { reader, receipts, finalize } = await setUp(async (url) => page(NOTICE_TEXT, { url }));
    const given = await receipts();
    const sourceLines = [
      { source: NOTICE, claim: "The agency requires a warning.", sentence: ACTION, conclusion: ADVICE, against: "None found." },
      { source: "PMC10518852", claim: "It was seen in 12 of 400.", sentence: STUDY, conclusion: STUDY, against: "One study." },
    ];
    const alone = await finalize(given, { source_lines: sourceLines });
    expect(reader).not.toHaveBeenCalled();
    const both = await finalize(given, { source_lines: sourceLines, news_card: NOTICE_CARD, findings_save: "off" });
    expect(claims(both).nl).toEqual(["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text"]);
    expect(alone.source_lines.map(({ sentence, conclusion, text, reason }: Record<string, unknown>) =>
      [sentence, conclusion, text, reason])).toEqual([["not_checked", "not_checked", undefined, "no_text"],
      ["found", "not_checked", "full_text", "same_quote"]]);
    expect(both.source_lines).toEqual(alone.source_lines);
  });
});

const DAY = "2026-11-24";
const AT = new Date(`${DAY}T07:00:00.000Z`);
let clock = AT;
beforeEach(() => { clock = AT; });
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const DRAFT = "An invented agency requires a label warning: 6.4 against 3.8 events per 100,000 person-years, and 1.41 more " +
  "in an earlier invented study.";

/** What the day call says of a card staged with these signed lookups: the reasons it is kept back, none when stored. */
async function dayCall(value: Record<string, unknown>, nl: string[], draft = DRAFT): Promise<string[]> {
  const result = checkNewsCard(value);
  if (result.status !== "checked") throw new Error(JSON.stringify(result.problems));
  const { card } = result;
  const store = new InMemoryAtlasNewsStore(() => clock);
  const staged = await store.stage({ itemId: card.item_id, checkId: card.check_id, card: card as Record<string, unknown>,
    cardSha256: newsCardDigest(card), draft, draftSha256: sha256(draft.trim()), receiptClaims: { news: newsCardDigest(card), nl,
      ns: [], nr: [] }, receiptIssuedAt: AT.toISOString(), doi: card.doi ?? null }, `${DAY}T06:00:00.000Z`);
  const reading: NewsReading = { number: staged.number, card: newsCardDigest(card), draft: sha256(draft.trim()),
    model: "claude-opus-5-5", advice: "no",
    fields: { finding: "supported", for: "supported", how_much: "supported", how_sure: "supported",
      what_you_can_do: "supported", other_outcomes: "supported", harms: "supported", limits: "supported",
      meets_our_bar: "supported", official_action: "supported", who_paid: "supported" },
    numbers: { how_much: "same" } };
  const payload: NewsDayPayload = { day: DAY, not_after: Math.floor(AT.getTime() / 1000) + 3600, base: null, rerank: false,
    order: [staged.number], places: [{ number: staged.number, reason: "First." }], moves: [], readings: [reading], lines: [],
    line_readings: [], footer: null };
  const day = await publishNewsDay(payload, { store, now: () => AT, paperStatus: async () => "no_retraction_record_found" });
  if (day.status !== "committed") throw new Error(JSON.stringify(day));
  expect(day.order).toEqual(day.keptBack.length === 0 ? [staged.number] : []);
  return day.keptBack[0]?.reasons ?? [];
}

// N-1001 of 22 Nov, in shape: an agency's label change, its How much from the notice and an earlier study's figure from a
// paper. N-1013 of 24 Nov, in shape: guidance changed, with product information and a paper that paid for itself.
const N1001 = { ...NOTICE_CARD, item_id: "item-1001", check_id: "check-1001",
  how_much: "6.4 against 3.8 events per 100,000 person-years; an earlier invented study: 1.41 more",
  sources: [NOTICE, "10.1000/invented.earlier", OTHER],
  backing: [
    { field: "official_action", source: NOTICE, quote: ACTION },
    { field: "how_much", source: NOTICE, quote: FIGURES },
    { field: "what_you_can_do", source: NOTICE, quote: ADVICE },
    { field: "for", source: OTHER, quote: "People taking the invented medicine should have their eyes checked every year." },
    { field: "how_much", source: "10.1000/invented.earlier", quote: "The invented earlier study found 1.41 more events." },
  ] };
const N1013 = { ...NOTICE_CARD, item_id: "item-1013", check_id: "check-1013", label: "safety_notice",
  how_much: "Infant harm not reported as a reliable absolute risk",
  who_paid: { status: "quoted", industry_funded: "yes", funders: [{ name: "An invented maker", backing: 3 }],
    declarations: [{ author: "A. Invented", declared: "employed by an invented maker", backing: 4 }] },
  sources: [NOTICE, OTHER, "10.1000/invented.interaction"],
  backing: [
    { field: "finding", source: OTHER, quote: "Overall, the invented medicine could be considered during breast-feeding." },
    { field: "how_much", source: NOTICE, quote: FIGURES },
    { field: "official_action", source: NOTICE, quote: ACTION },
    { field: "who_paid", source: "10.1000/invented.interaction", quote: "An invented maker funded the study." },
    { field: "who_paid", source: "10.1000/invented.interaction", quote: "A. Invented is employed by an invented maker." },
  ] };
const change = (value: Record<string, any>, edit: (copy: Record<string, any>) => void): Record<string, any> => {
  const copy = structuredClone(value);
  edit(copy);
  return copy;
};

describe("the day call and an official notice's quotes found in its page", () => {
  it("stores the 22 Nov notice (N-1001) once its action and figures are found in the page, as its paper's are in the paper", async () => {
    expect(await dayCall(N1001, ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:web_page", "5:f:full_text"])).toEqual([]);
    // As on 22 Nov, before: nothing of the notice was looked up, and the paper's sentence wasn't found.
    expect(await dayCall(N1001, ["1:u:none", "2:u:none", "3:u:none", "4:u:none", "5:n:full_text"]))
      .toEqual(["official_action_quote_not_found", "how_much_quote_not_found"]);
    // The notice's own figures never stand in for the paper's, which wasn't found.
    expect(await dayCall(N1001, ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:web_page", "5:n:full_text"]))
      .toEqual(["how_much_quote_not_found"]);
    // Without the earlier study, the notice's figures are what the notice itself says.
    const alone = change(N1001, (copy) => { copy.backing.pop(); copy.how_much = NOTICE_CARD.how_much; });
    expect(await dayCall(alone, ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:web_page"])).toEqual([]);
    // A page that changed or couldn't be read again leaves it kept back, as before.
    expect(await dayCall(alone, ["1:u:none", "2:u:none", "3:u:none", "4:f:web_page"]))
      .toEqual(["official_action_quote_not_found", "how_much_quote_not_found"]);
  });

  it("stores the 24 Nov notice (N-1013) once its action is found in the page and who paid in the paper", async () => {
    const found = ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text", "5:f:full_text"];
    expect(await dayCall(N1013, found)).toEqual([]);
    expect(await dayCall(N1013, ["1:u:none", "2:u:none", "3:u:none", "4:n:full_text", "5:f:full_text"]))
      .toEqual(["who_paid_quote_not_found", "official_action_quote_not_found"]);
    // Who paid for a paper is only ever the paper's own sentence.
    expect(await dayCall(N1013, [...found.slice(0, 3), "4:n:full_text", "5:f:full_text"])).toEqual(["who_paid_quote_not_found"]);
    expect(await dayCall(N1013, [...found.slice(0, 3), "4:f:web_page", "5:f:full_text"])).toEqual(["who_paid_quote_not_found"]);
  });

  it("never counts a web page for a paper's figures or who paid for it, on any other card", async () => {
    const paper = "10.1000/invented.trial";
    const trialPage = "https://www.invented-journal.example/trial";
    const trial: Record<string, any> = change(NOTICE_CARD, (copy) => {
      Object.assign(copy, { item_id: "item-0201", label: "harm_signal", design: "people_controlled_study", doi: paper,
        sources: [paper, trialPage, NOTICE], official_action: undefined,
        who_paid: { status: "quoted", industry_funded: "yes", funders: [{ name: "An invented maker", backing: 1 }], declarations: [] },
        read: { depth: "partial_text", method_audit: "validated" },
        backing: [{ field: "how_much", source: trialPage, quote: FIGURES },
          { field: "who_paid", source: trialPage, quote: "An invented maker funded the invented trial." }] });
      delete copy.official_action;
    });
    expect(await dayCall(trial, ["1:f:web_page", "2:f:web_page"])).toEqual(["who_paid_quote_not_found", "how_much_quote_not_found"]);
    // With an agency's action found on its page, that alone is backed by it.
    const approved = change(trial, (copy) => {
      copy.official_action = "The invented agency approved the invented medicine.";
      copy.backing.push({ field: "official_action", source: NOTICE, quote: ACTION });
    });
    expect(await dayCall(approved, ["1:f:web_page", "2:f:web_page", "3:f:web_page"]))
      .toEqual(["who_paid_quote_not_found", "how_much_quote_not_found"]);
    const quoted = change(approved, (copy) => { copy.backing[0].source = paper; copy.backing[1].source = paper; });
    expect(await dayCall(quoted, ["1:f:full_text", "2:f:abstract", "3:f:web_page"])).toEqual([]);
  });

  it("counts for an official notice only what the notice itself says: a line from the site its action was found on", async () => {
    // Figures from another site's page (a journal's, say) aren't the notice's.
    const elsewhere = change(NOTICE_CARD, (copy) => {
      copy.sources.push(OTHER);
      copy.backing[1].source = OTHER;
    });
    expect(await dayCall(elsewhere, ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text"]))
      .toEqual(["how_much_quote_not_found"]);
    // Another page of the same site is.
    const sameSite = change(NOTICE_CARD, (copy) => {
      copy.sources.push("https://reviews.invented-agency.example/review");
      copy.backing[1].source = "https://reviews.invented-agency.example/review";
      copy.who_paid = { status: "quoted", industry_funded: "no", funders: [{ name: "The invented agency", backing: 4 }], declarations: [] };
      copy.backing.push({ field: "who_paid", source: NOTICE, quote: "The invented agency paid for this review." });
    });
    expect(await dayCall(sameSite, ["1:f:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text", "5:f:web_page"])).toEqual([]);
    // Without its action found on a page, no page is known as the notice's.
    expect(await dayCall(sameSite, ["1:n:web_page", "2:f:web_page", "3:f:web_page", "4:f:full_text", "5:f:web_page"]))
      .toEqual(["who_paid_quote_not_found", "official_action_quote_not_found", "how_much_quote_not_found"]);
  });

  it("reads every other lookup as before: a paper's find counts wherever it was found", async () => {
    const card: NewsCard = newsCardSchema.parse(change(N1013, (copy) => { copy.sources = ["10.1000/invented.interaction"];
      copy.backing = copy.backing.map((backing: Record<string, unknown>) => ({ ...backing, source: "10.1000/invented.interaction" })); }));
    for (const kind of ["full_text", "abstract", "search_copy", "library_copy"]) {
      expect(await dayCall(card, card.backing.map((_, place) => `${place + 1}:f:${kind}`))).toEqual([]);
    }
    expect(await dayCall(card, card.backing.map((_, place) => `${place + 1}:u:none`)))
      .toEqual(["who_paid_quote_not_found", "official_action_quote_not_found"]);
  });
});
