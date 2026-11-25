import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it } from "vitest";

import {
  AtlasNewsError,
  InMemoryAtlasNewsStore,
  type AtlasNewsDayCommit,
  type AtlasNewsReviewStore,
} from "@askrigor/evidence-repository";

import {
  checkNewsCard,
  newsCardDigest,
  newsCardFromCall,
  newsPer100Words,
  newsPublicTexts,
  numbersMissingFrom,
  wordCount,
  type NewsCard,
} from "../apps/research-mcp/src/news/card.js";
import {
  NEWS_CHECK_V7_DAY,
  newsDayPayloadDigest,
  newsExpiredItems,
  newsLatestDay,
  publishNewsDay,
  type NewsDayPayload,
  type NewsReading,
  type PaperStatus,
} from "../apps/research-mcp/src/news/day.js";
import { runAtlasNewsAction } from "../apps/research-mcp/src/news/review.js";
import { createResearchContributionReviewHandler } from "../apps/research-mcp/src/research-contribution-review-tool.js";

// Atlas news, stage 1 (plan docs/superpowers/plans/2026-11-21-atlas-news-stage1.md). Every study, figure, funder and
// identifier here is invented.

const DOI = "10.1000/walk.trial";
const CARD = {
  item_id: "item-0001",
  check_id: "check-0001",
  label: "benefit_supported",
  finding: "Daily walking lowered blood pressure in adults with mild hypertension",
  for: "Adults with mild high blood pressure, about 100 million people worldwide",
  how_much: "12 in 100 walkers reached normal blood pressure within 6 months, against 7 in 100 without",
  outcome_kind: "people_event",
  per_100: { treated: 12, comparison: 7, outcome: "normal blood pressure", time_frame: "6 months" },
  how_sure: { level: "moderate", reason: "One large randomized trial" },
  what_you_can_do: "Walk most days; people with heart disease ask their doctor first",
  who_can_do_it: "on_your_own",
  availability: [{ region: "everywhere", status: "approved_or_sold" }],
  design: "people_controlled_study",
  published: "2026-11-18",
  reach: "over_10_million",
  size: "moderate",
  urgency: "no_rush",
  can_act_now: "yes_on_their_own",
  meets_our_bar: { meets: true, reason: "Changes a common daily choice" },
  other_outcomes: "Weight did not change",
  harms: "No serious harms were reported",
  limits: "One trial, in one country",
  who_paid: { status: "quoted", industry_funded: "no", funders: [{ name: "A public research council", backing: 1 }],
    declarations: [] },
  read: { depth: "full_text", method_audit: "validated" },
  sources: [DOI],
  doi: DOI,
  backing: [
    { field: "how_much", source: DOI, quote: "Normal blood pressure was reached by 12% of walkers and 7% of controls." },
    { field: "who_paid", source: DOI, quote: "This trial was funded by a public research council." },
  ],
};
const DRAFT = "In one invented trial, 12 in 100 walkers reached normal blood pressure within 6 months, against 7 in 100 " +
  "without; about 100 million adults have mild high blood pressure.";
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const card = (change: (value: Record<string, any>) => void = () => undefined): Record<string, any> => {
  const copy = structuredClone(CARD) as Record<string, any>;
  change(copy);
  return copy;
};
const checked = (value: unknown) => {
  const result = checkNewsCard(value);
  if (result.status !== "checked") throw new Error(JSON.stringify(result.problems));
  return result;
};
const codes = (value: unknown) => {
  const result = checkNewsCard(value);
  return result.status === "checked" ? [] : result.problems.map(({ code }) => code);
};

describe("the news card: its shape and its rules, in code and in any language", () => {
  it("checks a card that keeps every rule, and digests it by its content, not its key order", () => {
    const result = checked(CARD);
    const reordered = Object.fromEntries(Object.entries(CARD).reverse());
    expect(newsCardDigest(checked(reordered).card)).toBe(result.digest);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("counts the Finding's words without the tag: 24 pass, 25 don't, about 20 the aim, in a script without spaces too", () => {
    // The 23 Nov 2026 news audit: a finding cut to 12 words lost its group, comparator or time frame.
    const words = (count: number) => Array.from({ length: count }, (_, place) => `word${place + 1}`).join(" ");
    expect(codes(card((value) => { value.finding = words(24); }))).toEqual([]);
    const tooLong = checkNewsCard(card((value) => { value.finding = words(25); }));
    expect(tooLong.status === "rejected" && tooLong.problems).toEqual([{ code: "finding_too_long",
      message: expect.stringMatching(/has 25 words; at most 24, about 20 the aim/u) }]);
    // A 24-word finding in long words still fits its character limit: the word cap is the one that acts.
    const long = "Antihypertensive medication prevented considerably more cardiovascular hospitalisations than " +
      "injurious falls among septuagenarians, octogenarians and nonagenarians independently across socioeconomically " +
      "heterogeneous neighbourhoods over approximately ten years";
    expect(wordCount(long)).toBe(24);
    expect(long.length).toBeGreaterThan(200);
    expect(codes(card((value) => { value.finding = long; }))).toEqual([]);
    expect(wordCount("毎日の散歩で血圧が下がった")).toBeGreaterThan(1);
  });

  it("needs people per 100 for both groups, shown in How much, for an outcome counted in people", () => {
    expect(codes(card((value) => { delete value.per_100; }))).toEqual(["per_100_missing"]);
    expect(codes(card((value) => { value.how_much = "Walkers did better within 6 months"; })))
      .toEqual(["per_100_not_in_how_much"]);
    expect(codes(card((value) => { value.outcome_kind = "scale"; delete value.per_100; }))).toEqual([]);
  });

  it("takes a comparison of \"none\" for a study of one group, only with its reason, and shows it as no figure", () => {
    // The 22 Nov 2026 news audit: a records review of one treatment has no comparison figure, and null was refused.
    const single = card((value) => {
      value.design = "people_no_comparison_group";
      value.label = "harm_signal";
      value.meets_our_bar = { meets: false, reason: "One group, no comparison", reason_code: "early_uncontrolled" };
      value.how_much = "About 4 in 100 people treated had the invented reaction within 6 months";
      value.per_100 = { treated: 4, comparison: "none", no_comparison_reason: "Records of treated people only",
        outcome: "the invented reaction", time_frame: "6 months" };
    });
    const accepted = checked(single);
    expect(accepted.card.per_100).toEqual({ treated: 4, comparison: "none",
      no_comparison_reason: "Records of treated people only", outcome: "the invented reaction", time_frame: "6 months" });
    expect(newsPer100Words(accepted.card.per_100!)).toBe("4 in 100; no comparison figure: Records of treated people only");
    expect(newsPer100Words(checked(CARD).card.per_100!)).toBe("12 in 100 against 7 in 100");
    // The reason is shown beside How much's figures, so it is held to the draft's numbers like them.
    expect(newsPublicTexts(accepted.card).how_much).toBe("About 4 in 100 people treated had the invented reaction " +
      "within 6 months\nRecords of treated people only");
    // "none" needs its reason; a number takes none; How much still shows the treated group's figure.
    expect(codes(card((value) => { value.per_100 = { ...value.per_100, comparison: "none" }; })))
      .toEqual(["per_100_no_comparison_reason"]);
    expect(codes(card((value) => { value.per_100 = { ...value.per_100, no_comparison_reason: "No comparison" }; })))
      .toEqual(["per_100_no_comparison_reason"]);
    expect(codes(card((value) => {
      value.per_100 = { ...single.per_100, treated: 9 };
      value.how_much = single.how_much;
    }))).toEqual(["per_100_not_in_how_much"]);
    // null, as on 22 Nov, and any other word, stay unreadable.
    expect(codes(card((value) => { value.per_100 = { ...value.per_100, comparison: null }; }))).toEqual(["card_unreadable"]);
    expect(codes(card((value) => { value.per_100 = { ...value.per_100, comparison: "not studied" }; })))
      .toEqual(["card_unreadable"]);
  });

  it("keeps a safety notice to official notices, and work in animals or cells out of the main items", () => {
    expect(codes(card((value) => { value.label = "safety_notice"; }))).toEqual(["safety_notice_not_official"]);
    expect(codes(card((value) => { value.design = "animals_or_cells_only"; }))).toEqual(["bar_design"]);
    expect(codes(card((value) => {
      value.design = "people_no_comparison_group";
      value.availability = [{ region: "EU", status: "not_approved" }, { region: "US", status: "not_approved" }];
    }))).toEqual(["bar_design"]);
    expect(codes(card((value) => {
      value.design = "animals_or_cells_only";
      value.meets_our_bar = { meets: false, reason: "Only in mice", reason_code: "animal_or_cell" };
    }))).toEqual([]);
    expect(codes(card((value) => { value.meets_our_bar = { meets: false, reason: "Nothing changes" }; })))
      .toEqual(["reason_code_missing"]);
  });

  it("names a funder only through a quoted line, and says the paper is silent only after the full text", () => {
    expect(codes(card((value) => { value.who_paid.funders = []; }))).toEqual(["who_paid_inconsistent"]);
    expect(codes(card((value) => { value.who_paid.funders[0].backing = 0; }))).toEqual(["backing_line_missing"]);
    expect(codes(card((value) => {
      value.who_paid = { status: "paper_doesnt_say", industry_funded: "not_stated", funders: [], declarations: [] };
      value.backing = [value.backing[0]];
      value.read.depth = "abstract";
    }))).toEqual(["who_paid_inconsistent"]);
  });

  it("ties every backing line to one of the card's sources, and the numbers of How much to a line", () => {
    expect(codes(card((value) => { value.backing[0].source = "10.1000/another"; }))).toEqual(["backing_source_unknown"]);
    expect(codes(card((value) => { value.backing = [value.backing[1]]; value.who_paid.funders[0].backing = 0; })))
      .toEqual(["backing_line_missing"]);
    expect(codes(card((value) => { value.doi = "10.1000/elsewhere"; }))).toEqual(["doi_not_a_source"]);
    expect(codes(card((value) => { value.colour = "blue"; }))).toEqual(["card_unreadable"]);
  });

  it("finds a field's numbers in the draft by any of their readings, in any script", () => {
    expect(numbersMissingFrom("1,234 people", "In all, 1234 people took part.")).toEqual([]);
    expect(numbersMissingFrom("١٢ in 100", "12 in 100")).toEqual([]);
    expect(numbersMissingFrom("9 in 100", "12 in 100")).toEqual(["9"]);
  });

  it("reads the card from later_inputs, from later_inputs given as text, or at the top level", () => {
    expect(newsCardFromCall({ later_inputs: { news_card: CARD } })).toEqual(CARD);
    expect(newsCardFromCall({ later_inputs: JSON.stringify({ news_card: CARD }) })).toEqual(CARD);
    expect(newsCardFromCall({ news_card: CARD })).toEqual(CARD);
    expect(newsCardFromCall({ later_inputs: {} })).toBeUndefined();
  });
});

const DAY = "2026-11-23";
const AT = new Date(`${DAY}T07:00:00.000Z`);
/** The database's clock in these tests: the call's own time unless a test moves it. */
let clock = AT;
const databaseClock = () => clock;
beforeEach(() => { clock = AT; });
const claimsOf = (value: NewsCard) => ({ news: newsCardDigest(value), nl: value.backing.map((_, place) => `${place + 1}:f:full_text`),
  ns: [], nr: ["1:full_text_audited:-"] });

async function stage(store: InMemoryAtlasNewsStore, value: Record<string, any>, at = `${DAY}T06:00:00.000Z`,
  draft = DRAFT) {
  const { card: parsed } = checked(value);
  return await store.stage({ itemId: parsed.item_id, checkId: parsed.check_id, card: parsed as Record<string, unknown>,
    cardSha256: newsCardDigest(parsed), draft, draftSha256: sha256(draft.trim()), receiptClaims: claimsOf(parsed),
    receiptIssuedAt: at, doi: parsed.doi ?? null }, at);
}

function reading(number: string, value: Record<string, any>, change: (read: NewsReading) => void = () => undefined,
  draft = DRAFT): NewsReading {
  const parsed = checked(value).card;
  const read: NewsReading = {
    number, card: newsCardDigest(parsed), draft: sha256(draft.trim()), model: "claude-opus-5-5",
    fields: { finding: "supported", for: "supported", how_much: "supported", how_sure: "supported",
      what_you_can_do: "supported", other_outcomes: "supported", harms: "supported", limits: "supported",
      who_paid: "supported", meets_our_bar: "supported" },
    numbers: { for: "same", how_much: "same" },
    advice: "no",
  };
  change(read);
  return read;
}

function payload(overrides: Partial<NewsDayPayload> = {}): NewsDayPayload {
  return {
    day: DAY, not_after: Math.floor(AT.getTime() / 1000) + 3600, base: null, rerank: false, order: [], places: [],
    moves: [], readings: [], lines: [], line_readings: [], footer: { text: "Health and medicine only. We read 18 of 20 sources." },
    ...overrides,
  };
}

const clean: () => Promise<PaperStatus> = async () => "no_retraction_record_found";
const deps = (store: AtlasNewsReviewStore, paper: (doi: string) => Promise<PaperStatus> = clean, now = AT) => {
  clock = now;
  return { store, now: () => now, paperStatus: paper };
};

describe("the day call: one day, whole or nothing, never late", () => {
  it("commits a day's passing items in shadow, keeps back what fails its checks with the reason, and stores the rest", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const unread = await stage(store, card((value) => { value.item_id = "item-0002"; }));
    const otherCard = await stage(store, card((value) => { value.item_id = "item-0003"; }));
    const numbers = await stage(store, card((value) => { value.item_id = "item-0004"; }), undefined,
      "A draft that gives no figure at all.");
    const advice = await stage(store, card((value) => { value.item_id = "item-0005"; }));
    const retracted = await stage(store, card((value) => { value.item_id = "item-0006"; value.doi = "10.1000/retracted";
      value.sources = ["10.1000/retracted"]; value.backing = value.backing.map((line: any) => ({ ...line, source: "10.1000/retracted" })); }));
    const skipped = await stage(store, card((value) => { value.item_id = "item-0007";
      value.meets_our_bar = { meets: false, reason: "Changes no decision today", reason_code: "no_decision" }; }));
    const order = [good.number, unread.number, otherCard.number, numbers.number, advice.number, retracted.number];
    const result = await publishNewsDay(payload({
      order,
      places: order.map((number) => ({ number, reason: "By the size of the benefit." })),
      readings: [
        reading(good.number, CARD),
        reading(unread.number, card((value) => { value.item_id = "item-0002"; }), (read) => { delete read.fields.harms; }),
        { ...reading(otherCard.number, card((value) => { value.item_id = "item-0003"; })), card: "f".repeat(64) },
        reading(numbers.number, card((value) => { value.item_id = "item-0004"; }), undefined,
          "A draft that gives no figure at all."),
        reading(advice.number, card((value) => { value.item_id = "item-0005"; }), (read) => { read.advice = "yes"; }),
        reading(retracted.number, card((value) => { value.item_id = "item-0006"; value.doi = "10.1000/retracted";
          value.sources = ["10.1000/retracted"]; value.backing = value.backing.map((line: any) => ({ ...line, source: "10.1000/retracted" })); })),
        reading(skipped.number, card((value) => { value.item_id = "item-0007";
          value.meets_our_bar = { meets: false, reason: "Changes no decision today", reason_code: "no_decision" }; })),
      ],
      lines: [
        { kind: "checked", number: skipped.number },
        { kind: "abstract_read", doi: "10.1000/mice", title: "An invented mouse study", journal: "Invented Journal",
          year: 2026, reason_code: "animal_or_cell", quote: "All experiments in this study were done in laboratory mice only.",
          usefulness: "Nothing anyone can do with it yet: the study was only in mice." },
        { kind: "abstract_read", doi: "10.1000/hype", title: "An invented cohort", journal: "Invented Journal", year: 2026,
          reason_code: "overclaims", quote: "Too short", usefulness: "The headline claims more than the study." },
      ],
      line_readings: [{ line: 1, verdict: "supported" }, { line: 2, verdict: "supported" }],
    }), deps(store, async (doi) => doi === "10.1000/retracted" ? "retracted" : "no_retraction_record_found"));
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(result.order).toEqual([good.number]);
    const kept = Object.fromEntries(result.keptBack.map(({ number, reasons }) => [number, reasons]));
    expect(kept[unread.number]).toEqual(["reading_missing:harms"]);
    expect(kept[otherCard.number]).toEqual(["reading_of_another_card"]);
    expect(kept[numbers.number]).toEqual(expect.arrayContaining(["numbers_not_in_draft:how_much", "numbers_not_in_draft:for"]));
    expect(kept[advice.number]).toEqual(["advice_to_change_treatment"]);
    expect(kept[retracted.number]).toEqual(["paper_retracted"]);
    expect(kept[skipped.number]).toBeUndefined();
    expect(result.linesKeptBack).toEqual([{ line: 2, reasons: ["reason_needs_full_check", "quote_too_short"] }]);
    const listed = await store.inspectDay(DAY, AT.toISOString());
    expect(listed.day?.order).toEqual([good.number]);
    expect(listed.items.find(({ number }) => number === good.number)?.state).toBe("shadow");
    expect(listed.items.find(({ number }) => number === skipped.number)).toMatchObject({ state: "shadow", kind: "line" });
    expect(listed.items.find(({ number }) => number === unread.number)?.state).toBe("kept_back");
  });

  it("keeps back an item that fails on every count without blocking its day, with at most 20 reasons", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const bad = await stage(store, CARD, undefined, "A draft with no figure.");
    const good = await stage(store, card((value) => { value.item_id = "item-0002"; }));
    const empty = reading(bad.number, CARD, (read) => { read.fields = {}; read.numbers = {}; read.advice = "yes"; },
      "A draft with no figure.");
    const result = await publishNewsDay(payload({ order: [good.number, bad.number],
      places: [good, bad].map(({ number }) => ({ number, reason: "Placed." })),
      readings: [reading(good.number, card((value) => { value.item_id = "item-0002"; })), empty] }),
    deps(store, async () => "unknown"));
    expect(result).toMatchObject({ status: "committed", order: [] });
    const kept = (result as { keptBack: Array<{ number: string; reasons: string[] }> }).keptBack;
    const reasons = kept.find(({ number }) => number === bad.number)!.reasons;
    expect(reasons.length).toBeLessThanOrEqual(20);
    expect(reasons).toEqual(expect.arrayContaining(["reading_missing:finding", "advice_to_change_treatment",
      "numbers_not_in_draft:how_much"]));
    expect(kept.find(({ number }) => number === good.number)!.reasons).toEqual(["paper_unchecked"]);
  });

  it("names a funder, relies on an agency's action and quotes How much only through lines found in the text fetched", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const { card: parsed } = checked(CARD);
    // The receipt signed the How much line found and the funder's line not found.
    const staged = await store.stage({ itemId: parsed.item_id, checkId: parsed.check_id,
      card: parsed as Record<string, unknown>, cardSha256: newsCardDigest(parsed), draft: DRAFT,
      draftSha256: sha256(DRAFT.trim()), receiptClaims: { news: newsCardDigest(parsed), nl: ["1:f:full_text", "2:n:full_text"],
        ns: [], nr: [] }, receiptIssuedAt: AT.toISOString(), doi: DOI }, `${DAY}T06:00:00.000Z`);
    const otherDraft = reading(staged.number, CARD, undefined, "Another draft, of another check.");
    const result = await publishNewsDay(payload({ order: [staged.number],
      places: [{ number: staged.number, reason: "First." }], readings: [otherDraft] }), deps(store));
    expect((result as { keptBack: Array<{ reasons: string[] }> }).keptBack[0]!.reasons)
      .toEqual(["who_paid_quote_not_found", "reading_of_another_card"]);
  });

  it("commits nothing once the database's UTC date has passed the day's", async () => {
    const store = new InMemoryAtlasNewsStore(() => new Date(`${DAY}T23:59:59.000Z`));
    const good = await stage(store, CARD);
    const late = new Date(`${DAY}T23:59:58.000Z`);
    const crossing = new InMemoryAtlasNewsStore(() => new Date("2026-11-24T00:00:01.000Z"));
    const crossed = await stage(crossing, CARD);
    expect(await publishNewsDay(payload({ not_after: Math.floor(late.getTime() / 1000) + 3600, order: [crossed.number],
      places: [{ number: crossed.number, reason: "First." }], readings: [reading(crossed.number, CARD)] }),
    { store: crossing, now: () => late, paperStatus: clean })).toEqual({ status: "late", day: DAY });
    expect(good.number).toBe(crossed.number);
  });

  it("answers a replay with the version it committed, and makes a new version for a changed payload", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const day = payload({ order: [good.number], places: [{ number: good.number, reason: "First." }],
      readings: [reading(good.number, CARD)] });
    const first = await publishNewsDay(day, deps(store));
    const again = await publishNewsDay(day, deps(store));
    expect(first).toMatchObject({ status: "committed", version: 1 });
    expect(again).toMatchObject({ status: "replayed", version: 1 });
    // A changed payload for the same day is a new version, which decides the day's items again.
    const changed = await publishNewsDay({ ...day, footer: { text: "Another footer." } }, deps(store));
    expect(changed).toMatchObject({ status: "committed", version: 2, order: [good.number], keptBack: [] });
    const unread = await publishNewsDay({ ...day, footer: { text: "A third footer." }, readings: [] }, deps(store));
    expect(unread).toMatchObject({ status: "committed", version: 3, order: [],
      keptBack: [{ number: good.number, reasons: ["no_reading"] }] });
    // The first payload again, after not_after: its own version, as stored, never a new judgment.
    expect(await publishNewsDay(day, deps(store, clean, new Date(day.not_after * 1000 + 60_000))))
      .toMatchObject({ status: "replayed", version: 1, order: [good.number] });
  });

  it("stores nothing after not_after, nothing for another UTC day, and says unknown when the database doesn't answer", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const day = payload({ order: [good.number], places: [{ number: good.number, reason: "First." }],
      readings: [reading(good.number, CARD)] });
    expect(await publishNewsDay({ ...day, not_after: Math.floor(AT.getTime() / 1000) - 1 }, deps(store)))
      .toEqual({ status: "late", day: DAY });
    // A day committed in time is never reported late: its replay after not_after reads it back.
    const later = new Date(AT.getTime() + 600_000);
    const inTime = { ...day, not_after: Math.floor(AT.getTime() / 1000) + 300 };
    expect(await publishNewsDay(inTime, deps(store))).toMatchObject({ status: "committed", version: 1 });
    expect(await publishNewsDay(inTime, deps(store, clean, later))).toMatchObject({ status: "replayed", version: 1 });
    expect(await publishNewsDay({ ...day, day: "2026-11-22" }, deps(store))).toMatchObject({ status: "refused", reason: "other_day" });
    // The database passes its deadline midway: the function's last step refuses, and nothing is stored.
    const slow = new InMemoryAtlasNewsStore(() => new Date(AT.getTime() + 51_000));
    const slowGood = await stage(slow, CARD);
    expect(await publishNewsDay({ ...day, order: [slowGood.number], places: [{ number: slowGood.number, reason: "First." }],
      readings: [reading(slowGood.number, CARD)] }, deps(slow))).toEqual({ status: "late", day: DAY });
    expect((await slow.inspectDay(DAY, AT.toISOString())).day).toBeNull();
    const fresh = new InMemoryAtlasNewsStore(databaseClock);
    const freshGood = await stage(fresh, CARD);
    const hanging: AtlasNewsReviewStore = { inspectDay: fresh.inspectDay.bind(fresh),
      inspectBefore: fresh.inspectBefore.bind(fresh), inspectNumbers: fresh.inspectNumbers.bind(fresh),
      withdraw: fresh.withdraw.bind(fresh), commitDay: () => new Promise(() => undefined) };
    expect(await publishNewsDay({ ...day, order: [freshGood.number], places: [{ number: freshGood.number, reason: "First." }],
      readings: [reading(freshGood.number, CARD)] }, { ...deps(hanging), handlerMilliseconds: 30 }))
      .toEqual({ status: "unknown", day: DAY });
    expect((await fresh.inspectDay(DAY, AT.toISOString())).day).toBeNull();
  });

  it("answers a stale base with the server's latest day, and commits once the day's items are re-inserted into it", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const first = await stage(store, CARD, "2026-11-22T06:00:00.000Z");
    const monday = new Date("2026-11-22T07:00:00.000Z");
    expect(await publishNewsDay(payload({ day: "2026-11-22", not_after: Math.floor(monday.getTime() / 1000) + 600,
      order: [first.number], places: [{ number: first.number, reason: "First." }], readings: [reading(first.number, CARD)] }),
      deps(store, clean, monday))).toMatchObject({ status: "committed" });
    const second = await stage(store, card((value) => { value.item_id = "item-0009"; }));
    const today = payload({ order: [second.number], places: [{ number: second.number, reason: "Second." }],
      readings: [reading(second.number, card((value) => { value.item_id = "item-0009"; }))] });
    const stale = await publishNewsDay(today, deps(store));
    // The latest day comes with what the news check needs to re-insert exactly: the items this day must carry, in order,
    // and the day each was first committed (digest.py publish-json --rebase).
    expect(stale).toEqual({ status: "stale_base", latest: { day: "2026-11-22", version: 1, order: [first.number],
      carried: [first.number], committed: { [first.number]: "2026-11-22" } } });
    const rebased = await publishNewsDay({ ...today, base: { day: "2026-11-22", version: 1 },
      order: [first.number, second.number] }, deps(store));
    expect(rebased).toMatchObject({ status: "committed", order: [first.number, second.number] });
  });

  it("answers a day committed between the base check and the commit with the base read again, carried items and days", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const raced = { number: "N-1999", state: "shadow" as const, committedDay: "2026-11-22" };
    let reads = 0;
    // The database sees a newer day at the commit (another call stored it after this call's base check).
    const racing: AtlasNewsReviewStore = { inspectDay: store.inspectDay.bind(store), inspectNumbers: store.inspectNumbers.bind(store),
      withdraw: store.withdraw.bind(store),
      inspectBefore: async () => (reads += 1) === 1 ? null
        : { day: "2026-11-22", version: 1, order: [raced.number], items: [raced] },
      commitDay: async () => ({ status: "stale_base", latest: { day: "2026-11-22", version: 1, order: [raced.number] } }) };
    expect(await publishNewsDay(payload({ order: [good.number], places: [{ number: good.number, reason: "First." }],
      readings: [reading(good.number, CARD)] }), deps(racing))).toEqual({ status: "stale_base", latest: {
      day: "2026-11-22", version: 1, order: [raced.number], carried: [raced.number],
      committed: { [raced.number]: "2026-11-22" } } });
    expect(reads).toBe(2);
  });

  it("leaves out of a stale base's carried items the withdrawn ones and those older than seven days", () => {
    const base = { day: "2026-11-27", version: 2, order: ["N-1001", "N-1002", "N-1003", "N-1004"], items: [
      { number: "N-1001", state: "shadow" as const, committedDay: "2026-11-27" },
      { number: "N-1002", state: "withdrawn" as const, committedDay: "2026-11-26" },
      { number: "N-1003", state: "shadow" as const, committedDay: "2026-11-22" },
      { number: "N-1004", state: "shadow" as const, committedDay: "2026-11-21" },
    ] };
    expect(newsLatestDay(base, "2026-11-28")).toEqual({ day: "2026-11-27", version: 2, order: base.order,
      carried: ["N-1001", "N-1003"], committed: { "N-1001": "2026-11-27", "N-1002": "2026-11-26",
        "N-1003": "2026-11-22", "N-1004": "2026-11-21" } });
    expect(newsLatestDay(null, "2026-11-28")).toBeNull();
  });

  it("keeps carried items in their place on a weekday and lets only a Sunday's re-rank move them, each with a reason", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const saturday = new Date("2026-11-21T07:00:00.000Z");
    const a = await stage(store, card((value) => { value.item_id = "item-a"; }), "2026-11-21T06:00:00.000Z");
    const b = await stage(store, card((value) => { value.item_id = "item-b"; }), "2026-11-21T06:00:00.000Z");
    expect(await publishNewsDay(payload({ day: "2026-11-21", not_after: Math.floor(saturday.getTime() / 1000) + 600,
      order: [a.number, b.number], places: [a, b].map(({ number }) => ({ number, reason: "Placed." })),
      readings: [reading(a.number, card((value) => { value.item_id = "item-a"; })),
        reading(b.number, card((value) => { value.item_id = "item-b"; }))] }), deps(store, clean, saturday)))
      .toMatchObject({ status: "committed", order: [a.number, b.number] });
    const sunday = new Date("2026-11-22T07:00:00.000Z");
    const base = { day: "2026-11-21", version: 1 };
    const sundayDay = { day: "2026-11-22", not_after: Math.floor(sunday.getTime() / 1000) + 600, base };
    expect(await publishNewsDay(payload({ ...sundayDay, order: [b.number, a.number] }), deps(store, clean, sunday)))
      .toMatchObject({ status: "refused", reason: "order_invalid" });
    expect(await publishNewsDay(payload({ ...sundayDay, rerank: true, order: [b.number, a.number] }), deps(store, clean, sunday)))
      .toMatchObject({ status: "refused", reason: "order_invalid" });
    expect(await publishNewsDay(payload({ ...sundayDay, rerank: true, order: [b.number, a.number],
      moves: [{ number: b.number, reason: "Its harm now matters more." }, { number: a.number, reason: "Below the harm." }] }),
    deps(store, clean, sunday))).toMatchObject({ status: "committed", order: [b.number, a.number] });
    // A re-rank on a weekday is refused, moves or not.
    const monday = new Date("2026-11-23T07:00:00.000Z");
    expect(await publishNewsDay(payload({ day: "2026-11-23", not_after: Math.floor(monday.getTime() / 1000) + 600,
      base: { day: "2026-11-22", version: 1 }, rerank: true, order: [a.number, b.number],
      moves: [{ number: a.number, reason: "Up." }] }), deps(store, clean, monday)))
      .toMatchObject({ status: "refused", reason: "order_invalid" });
  });

  it("leaves out of the stored order a carried item withdrawn since, or replaced by a newer card of the same item", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const monday = new Date("2026-11-23T07:00:00.000Z");
    const tuesday = new Date("2026-11-24T07:00:00.000Z");
    const wednesday = new Date("2026-11-25T07:00:00.000Z");
    const a = await stage(store, card((value) => { value.item_id = "item-a"; }), "2026-11-23T06:00:00.000Z");
    const b = await stage(store, card((value) => { value.item_id = "item-b"; }), "2026-11-23T06:00:00.000Z");
    await publishNewsDay(payload({ day: "2026-11-23", not_after: Math.floor(monday.getTime() / 1000) + 600,
      order: [a.number, b.number], places: [a, b].map(({ number }) => ({ number, reason: "Placed." })),
      readings: [reading(a.number, card((value) => { value.item_id = "item-a"; })),
        reading(b.number, card((value) => { value.item_id = "item-b"; }))] }), deps(store, clean, monday));
    // The owner withdraws a; the news check doesn't know, and carries it; b gets a newer card.
    await store.withdraw(a.number, "Not needed.", monday.toISOString());
    const newer = card((value) => { value.item_id = "item-b"; value.harms = "No serious harms were reported in 6 months"; });
    const b2 = await stage(store, newer, "2026-11-24T06:00:00.000Z",
      `${DRAFT} No serious harms were reported in 6 months.`);
    const tuesdayDay = await publishNewsDay(payload({ day: "2026-11-24", not_after: Math.floor(tuesday.getTime() / 1000) + 600,
      base: { day: "2026-11-23", version: 1 }, order: [a.number, b.number, b2.number],
      places: [{ number: b2.number, reason: "Its newer check." }],
      readings: [reading(b2.number, newer, (read) => { read.numbers.harms = "same"; },
        `${DRAFT} No serious harms were reported in 6 months.`)] }), deps(store, clean, tuesday));
    expect(tuesdayDay).toMatchObject({ status: "committed", order: [b2.number], keptBack: [] });
    const [oldB] = await store.inspectNumbers([b.number], tuesday.toISOString());
    expect(oldB).toMatchObject({ state: "withdrawn", withdrawnReason: "replaced" });
    // The next day's base is the stored order: only the newer card is carried.
    expect(await publishNewsDay(payload({ day: "2026-11-25", not_after: Math.floor(wednesday.getTime() / 1000) + 600,
      base: { day: "2026-11-24", version: 1 }, order: [b2.number] }), deps(store, clean, wednesday)))
      .toMatchObject({ status: "committed", order: [b2.number] });
  });

  it("stores a day with no main item: its carried order, its lines and its footer", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const result = await publishNewsDay(payload({
      lines: [{ kind: "abstract_read", doi: "10.1000/cells", title: "An invented cell study", journal: "Invented Journal",
        year: 2026, reason_code: "animal_or_cell", quote: "These experiments used cultured human cells and no living people.",
        usefulness: "Nothing anyone can do with it yet: the study was only in cells." }],
      line_readings: [{ line: 0, verdict: "supported" }],
    }), deps(store));
    expect(result).toMatchObject({ status: "committed", version: 1, order: [], keptBack: [], linesKeptBack: [] });
    const listed = await store.inspectDay(DAY, AT.toISOString());
    expect(listed.day?.lines).toHaveLength(1);
    expect(listed.day?.footer).toEqual({ text: "Health and medicine only. We read 18 of 20 sources." });
  });

  it("drops items older than seven days from the carried order, and refuses a payload that keeps them", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const old = await stage(store, CARD, "2026-11-15T06:00:00.000Z");
    const then = new Date("2026-11-15T07:00:00.000Z");
    await publishNewsDay(payload({ day: "2026-11-15", not_after: Math.floor(then.getTime() / 1000) + 600,
      order: [old.number], places: [{ number: old.number, reason: "First." }], readings: [reading(old.number, CARD)] }),
    deps(store, clean, then));
    // On the 22nd, an item committed on the 15th is eight days old.
    const later = new Date("2026-11-22T07:00:00.000Z");
    const base = { day: "2026-11-15", version: 1 };
    expect(await publishNewsDay(payload({ day: "2026-11-22", not_after: Math.floor(later.getTime() / 1000) + 600, base,
      order: [] }), deps(store, clean, later))).toMatchObject({ status: "committed", order: [] });
  });

  it("lets a carried item expire after its seven days with its reason, one staged before version 7 too, never judged again", async () => {
    // The 23 Nov 2026 news audit: a card stored on 22 Nov, before the news check's version 7, is carried by the
    // seven-day order. Nothing keeps it there for good: it leaves after its seven days, as every item does, and the
    // day says why; it is never read or judged again (the payload gives it no reading, the call no decision).
    expect(NEWS_CHECK_V7_DAY).toBe("2026-11-23");
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const at = (day: string) => new Date(`${day}T07:00:00.000Z`);
    const day = (on: string, rest: Partial<NewsDayPayload>) =>
      payload({ day: on, not_after: Math.floor(at(on).getTime() / 1000) + 600, ...rest });
    const before = await stage(store, CARD, "2026-11-22T06:00:00.000Z");
    expect(await publishNewsDay(day("2026-11-22", { order: [before.number],
      places: [{ number: before.number, reason: "First." }], readings: [reading(before.number, CARD)] }),
    deps(store, clean, at("2026-11-22")))).toMatchObject({ status: "committed", order: [before.number] });
    const sevenCard = card((value) => { value.item_id = "item-0010"; });
    const seven = await stage(store, sevenCard, "2026-11-23T06:00:00.000Z");
    const monday = await publishNewsDay(day("2026-11-23", { base: { day: "2026-11-22", version: 1 },
      order: [before.number, seven.number], places: [{ number: seven.number, reason: "Below the first." }],
      readings: [reading(seven.number, sevenCard)] }), deps(store, clean, at("2026-11-23")));
    expect(monday).toMatchObject({ status: "committed", order: [before.number, seven.number] });
    expect(monday).not.toHaveProperty("expired");
    // 29 Nov: the card of 22 Nov has had its seven days; the order carries only the card of 23 Nov.
    const sunday = await runAtlasNewsAction({ action: "publish_news_day", news_day: day("2026-11-29",
      { base: { day: "2026-11-23", version: 1 }, order: [seven.number] }) }, deps(store, clean, at("2026-11-29")));
    expect(sunday.news).toMatchObject({ status: "committed", result: { order: [seven.number],
      expired: [{ number: before.number, committed: "2026-11-22", reason: "seven_days_staged_before_v7" }] } });
    expect(sunday.text).toContain(`expired from the seven-day order: ${before.number} (its seven days passed; staged ` +
      "before the news check's version 7, it was never judged by that version's bar, nor judged again, first stored " +
      "2026-11-22)");
    // 30 Nov: the card of 23 Nov expires too, for its seven days alone.
    expect(await publishNewsDay(day("2026-11-30", { base: { day: "2026-11-29", version: 1 }, order: [] }),
      deps(store, clean, at("2026-11-30")))).toMatchObject({ status: "committed", order: [],
      expired: [{ number: seven.number, committed: "2026-11-23", reason: "seven_days" }] });
    // Its row is never changed by its expiry: still the decision of the day that stored it.
    expect((await store.inspectNumbers([before.number, seven.number], at("2026-11-30").toISOString()))
      .map(({ state, committedDay, committedVersion }) => ({ state, committedDay, committedVersion })))
      .toEqual([{ state: "shadow", committedDay: "2026-11-22", committedVersion: 1 },
        { state: "shadow", committedDay: "2026-11-23", committedVersion: 1 }]);
  });

  it("names as expired only the base's items on show that the day no longer carries", () => {
    const base = { day: "2026-11-28", version: 1, order: ["N-1001", "N-1002", "N-1003", "N-1004"], items: [
      { number: "N-1001", state: "shadow" as const, committedDay: "2026-11-21" },
      { number: "N-1002", state: "withdrawn" as const, committedDay: "2026-11-22" },
      { number: "N-1003", state: "shadow" as const, committedDay: "2026-11-23" },
      { number: "N-1004", state: "shadow" as const, committedDay: "2026-11-24" },
    ] };
    expect(newsExpiredItems(base, "2026-11-30")).toEqual([
      { number: "N-1001", committed: "2026-11-21", reason: "seven_days_staged_before_v7" },
      { number: "N-1003", committed: "2026-11-23", reason: "seven_days" },
    ]);
    expect(newsExpiredItems(base, "2026-11-28")).toEqual([{ number: "N-1001", committed: "2026-11-21",
      reason: "seven_days_staged_before_v7" }]);
    expect(newsExpiredItems(null, "2026-11-30")).toEqual([]);
  });

  it("stores a card whose study had one group, its comparison \"none\" with its reason, and reads it so", async () => {
    const single = card((value) => {
      value.item_id = "item-0011";
      value.design = "people_no_comparison_group";
      value.how_much = "About 4 in 100 people treated had the invented reaction within 6 months";
      value.per_100 = { treated: 4, comparison: "none", no_comparison_reason: "Records of treated people only",
        outcome: "the invented reaction", time_frame: "6 months" };
    });
    const draft = "In an invented records review, about 4 in 100 people treated had the invented reaction within 6 " +
      "months; records of treated people only. About 100 million adults have mild high blood pressure.";
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const staged = await stage(store, single, undefined, draft);
    const result = await publishNewsDay(payload({ order: [staged.number],
      places: [{ number: staged.number, reason: "First." }], readings: [reading(staged.number, single, undefined, draft)] }),
    deps(store));
    expect(result).toMatchObject({ status: "committed", order: [staged.number], keptBack: [] });
    const [item] = await store.inspectNumbers([staged.number], AT.toISOString());
    expect(item!.card.per_100).toEqual(single.per_100);
    const one = await runAtlasNewsAction({ action: "list_news_items", news_number: staged.number }, deps(store));
    expect(one.text).toContain("people per 100: 4 in 100; no comparison figure: Records of treated people only;");
  });
});

describe("the in-memory store keeps migration 0043's rules", () => {
  it("stages a card once per item and digest, and at most 20 a UTC day", async () => {
    const store = new InMemoryAtlasNewsStore();
    const first = await stage(store, CARD);
    expect(await stage(store, CARD)).toEqual({ ...first, alreadyStaged: true });
    for (let index = 1; index < 20; index += 1) await stage(store, card((value) => { value.item_id = `item-${index + 100}`; }));
    await expect(stage(store, card((value) => { value.item_id = "item-0999"; }))).rejects.toEqual(new AtlasNewsError("DAY_FULL"));
  });

  it("keeps back a card staged on another day or over 24 hours before, and a newer card of an item replaces the older", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const yesterday = await stage(store, CARD, "2026-11-22T23:00:00.000Z");
    const commit = (order: string[], decisions: AtlasNewsDayCommit["decisions"], version = "a"): AtlasNewsDayCommit => ({
      day: DAY, payloadSha256: sha256(version), base: null, rerank: false, order, decisions, moves: [], lines: [], footer: null,
    });
    const passing = (number: string, value: Record<string, any> = CARD) => ({ number, kind: "main" as const, passed: true,
      reasons: [], reading: { card: newsCardDigest(checked(value).card), draft: sha256(DRAFT.trim()) },
      readingModel: null, retraction: null });
    const result = await store.commitDay(commit([yesterday.number], [passing(yesterday.number)]), AT.toISOString(),
      new Date(AT.getTime() + 60_000).toISOString());
    expect(result).toMatchObject({ status: "committed", order: [], keptBack: [{ number: yesterday.number, reasons: ["other_day"] }] });
    const older = await stage(store, card((value) => { value.how_much = `${value.how_much}.`; }));
    const newer = await stage(store, card((value) => { value.how_much = `${value.how_much}!`; }));
    await store.commitDay(commit([older.number], [passing(older.number,
      card((value) => { value.how_much = `${value.how_much}.`; }))], "b"), AT.toISOString(),
    new Date(AT.getTime() + 60_000).toISOString());
    await store.commitDay(commit([newer.number], [passing(newer.number,
      card((value) => { value.how_much = `${value.how_much}!`; }))], "c"), AT.toISOString(),
    new Date(AT.getTime() + 60_000).toISOString());
    const [olderItem, newerItem] = await store.inspectNumbers([older.number, newer.number], AT.toISOString());
    expect(olderItem).toMatchObject({ state: "withdrawn", withdrawnReason: "replaced" });
    expect(newerItem?.state).toBe("shadow");
  });

  it("binds a card staged again with another draft, still staged, to the newer draft, never to an older receipt's", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const first = await stage(store, CARD);
    const again = await stage(store, CARD, `${DAY}T06:30:00.000Z`, `${DRAFT} A later revision.`);
    expect(again).toEqual({ ...first, alreadyStaged: true });
    // A receipt older than the one kept, delivered late, changes nothing.
    await stage(store, CARD, `${DAY}T05:00:00.000Z`, `${DRAFT} An older revision.`);
    const [item] = await store.inspectNumbers([first.number], AT.toISOString());
    expect(item!.draftSha256).toBe(sha256(`${DRAFT} A later revision.`));
  });

  it("keeps the newest receipt whatever its draft, and refuses another draft signed in the same second", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const first = await stage(store, CARD, `${DAY}T05:00:00.000Z`);
    // The same draft, newer receipt: the receipt advances.
    await stage(store, CARD, `${DAY}T06:00:00.000Z`);
    // Another draft with a receipt between the two: changes nothing.
    await stage(store, CARD, `${DAY}T05:30:00.000Z`, `${DRAFT} An older revision.`);
    const [item] = await store.inspectNumbers([first.number], AT.toISOString());
    expect(item).toMatchObject({ draftSha256: sha256(DRAFT.trim()), receiptIssuedAt: `${DAY}T06:00:00.000Z` });
    await expect(stage(store, CARD, `${DAY}T06:00:00.000Z`, `${DRAFT} Signed in the same second.`))
      .rejects.toEqual(new AtlasNewsError("DRAFT_CONFLICT"));
  });

  it("never lets an older version of an item displace a newer one already on show", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const olderCard = card((value) => { value.limits = "One trial"; });
    const older = await stage(store, olderCard, `${DAY}T05:00:00.000Z`);
    const newer = await stage(store, CARD, `${DAY}T06:00:00.000Z`);
    expect(await publishNewsDay(payload({ order: [newer.number], places: [{ number: newer.number, reason: "First." }],
      readings: [reading(newer.number, CARD)] }), deps(store))).toMatchObject({ status: "committed", order: [newer.number] });
    expect(await publishNewsDay(payload({ order: [older.number], places: [{ number: older.number, reason: "Changed." }],
      readings: [reading(older.number, olderCard)] }), deps(store)))
      .toMatchObject({ status: "committed", order: [], keptBack: [{ number: older.number, reasons: ["superseded"] }] });
    const [stillShown] = await store.inspectNumbers([newer.number], AT.toISOString());
    expect(stillShown?.state).toBe("shadow");
  });

  it("lets a version that fails on any count, a missing DOI included, never displace one that passes", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const older = await stage(store, CARD, `${DAY}T05:00:00.000Z`);
    const noDoi = card((value) => { delete value.doi; value.limits = "One trial, no DOI given"; });
    const newer = await stage(store, noDoi, `${DAY}T06:00:00.000Z`);
    const result = await publishNewsDay(payload({ order: [older.number, newer.number],
      places: [older, newer].map(({ number }) => ({ number, reason: "Placed." })),
      readings: [reading(older.number, CARD), reading(newer.number, noDoi)] }), deps(store));
    expect(result).toMatchObject({ status: "committed", order: [older.number],
      keptBack: [{ number: newer.number, reasons: ["no_doi"] }] });
  });

  it("keeps one version of a news check item a day, the newest, and keeps back the rest as superseded", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const older = await stage(store, CARD, `${DAY}T05:00:00.000Z`);
    const newerCard = card((value) => { value.limits = "One trial, in one country; follow-up was short"; });
    const newer = await stage(store, newerCard, `${DAY}T06:00:00.000Z`);
    const result = await publishNewsDay(payload({ order: [older.number, newer.number],
      places: [older, newer].map(({ number }) => ({ number, reason: "Placed." })),
      readings: [reading(older.number, CARD), reading(newer.number, newerCard)] }), deps(store));
    expect(result).toMatchObject({ status: "committed", order: [newer.number],
      keptBack: [{ number: older.number, reasons: ["superseded"] }] });
  });

  it("refuses a day with control characters in its stored text, or too large to store", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const line = { kind: "abstract_read" as const, doi: "10.1000/cells", title: "An invented cell study",
      journal: "Invented Journal", year: 2026, reason_code: "animal_or_cell" as const,
      quote: "These experiments used cultured human cells and no living people.",
      usefulness: "Nothing anyone can do with it yet: the study was only in cells." };
    expect(await publishNewsDay(payload({ lines: [{ ...line, title: "A title\u0001 with a control character" }] }), deps(store)))
      .toMatchObject({ status: "refused", reason: "invalid_payload" });
    // The stores refuse a day over the row's size, whatever sent it.
    const huge: AtlasNewsDayCommit = { day: DAY, payloadSha256: sha256("huge"), base: null, rerank: false, order: [],
      decisions: [], moves: [], lines: [{ kind: "abstract_read", quote: "x".repeat(160_000) }], footer: null };
    await expect(store.commitDay(huge, AT.toISOString(), new Date(AT.getTime() + 60_000).toISOString()))
      .rejects.toEqual(new AtlasNewsError("INPUT_INVALID"));
  });

  it("keeps back an item whose card was staged again with a newer draft after its reading was made", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const racing: AtlasNewsReviewStore = { inspectDay: store.inspectDay.bind(store),
      inspectBefore: store.inspectBefore.bind(store), inspectNumbers: store.inspectNumbers.bind(store),
      withdraw: store.withdraw.bind(store),
      commitDay: async (commit, at, deadline) => {
        await stage(store, CARD, `${DAY}T06:45:00.000Z`, `${DRAFT} A revision made while the day call ran.`);
        return await store.commitDay(commit, at, deadline);
      } };
    expect(await publishNewsDay(payload({ order: [good.number], places: [{ number: good.number, reason: "First." }],
      readings: [reading(good.number, CARD)] }), deps(racing)))
      .toMatchObject({ status: "committed", order: [], keptBack: [{ number: good.number, reasons: ["reading_not_bound"] }] });
  });

  it("stores each checked line with its card's final decision, even when the card is withdrawn mid-call", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const skippedCard = card((value) => { value.meets_our_bar = { meets: false, reason: "Changes no decision today",
      reason_code: "no_decision" }; });
    const skipped = await stage(store, skippedCard);
    const racing: AtlasNewsReviewStore = { inspectDay: store.inspectDay.bind(store),
      inspectBefore: store.inspectBefore.bind(store), inspectNumbers: store.inspectNumbers.bind(store),
      withdraw: store.withdraw.bind(store),
      commitDay: async (commit, at, deadline) => {
        await store.withdraw(skipped.number, "Withdrawn while the day call ran.", at);
        return await store.commitDay(commit, at, deadline);
      } };
    const result = await publishNewsDay(payload({ lines: [{ kind: "checked", number: skipped.number }],
      readings: [reading(skipped.number, skippedCard)] }), deps(racing));
    expect(result).toMatchObject({ status: "committed", linesKeptBack: [{ line: 0, reasons: ["withdrawn"] }] });
    const listed = await store.inspectDay(DAY, AT.toISOString());
    expect(listed.day?.lines[0]).toMatchObject({ kind: "checked", passed: false, reasons: ["withdrawn"] });
  });

  it("withdraws one item or every item, keeping why, and reads a card staged over 24 hours before as expired", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    // A kept-back item is withdrawn as any other, its reasons left to the day's record.
    const keptBack = await stage(store, card((value) => { value.item_id = "item-kept"; }));
    await publishNewsDay(payload({ order: [keptBack.number], places: [{ number: keptBack.number, reason: "Placed." }] }),
      deps(store));
    expect(await store.withdraw(keptBack.number, "Not needed.", AT.toISOString()))
      .toEqual([{ number: keptBack.number, state: "withdrawn" }]);
    const [gone] = await store.inspectNumbers([keptBack.number], AT.toISOString());
    expect(gone).toMatchObject({ state: "withdrawn", keptReasons: null });
    const old = await stage(store, CARD, "2026-11-21T06:00:00.000Z");
    const fresh = await stage(store, card((value) => { value.item_id = "item-0002"; }));
    const [oldItem] = await store.inspectNumbers([old.number], AT.toISOString());
    expect(oldItem?.state).toBe("expired");
    expect(await store.withdraw(fresh.number, "Not needed.", AT.toISOString())).toEqual([{ number: fresh.number, state: "withdrawn" }]);
    expect(await store.withdraw("all", "Every item.", AT.toISOString())).toEqual([{ number: old.number, state: "withdrawn" }]);
  });
});

describe("the owner's news actions on review_research_contribution", () => {
  const OWNER = "auth0|owner";
  const auth = (subject: string) => ({ authInfo: { token: "synthetic-token", clientId: "synthetic-client",
    scopes: ["cases:review"], expiresAt: Math.floor(Date.now() / 1_000) + 60, extra: { subject } } });
  const handlerWith = (mode: "off" | "shadow", store: InMemoryAtlasNewsStore) => createResearchContributionReviewHandler({
    allowedReviewerSubjects: new Set([OWNER]),
    atlas: { enabled: true, providers: () => ({ crossref: { mailto: "test@example.invalid" }, pubmed: {} } as never),
      news: { mode, store, paperStatus: clean, now: () => AT } },
  });

  it("commits, lists, reads one item in full and withdraws, for the owner's login only", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const good = await stage(store, CARD);
    const handler = handlerWith("shadow", store);
    const day = payload({ order: [good.number], places: [{ number: good.number, reason: "First." }],
      readings: [reading(good.number, CARD)] });
    expect((await handler({ action: "publish_news_day", news_day: day }, auth("auth0|other"))).isError).toBe(true);
    const published = await handler({ action: "publish_news_day", news_day: day }, auth(OWNER));
    expect(published.structuredContent).toMatchObject({ ok: true, news: { action: "publish_news_day", status: "committed",
      result: { version: 1, order: [good.number] } } });
    const listed = await handler({ action: "list_news_items", news_date: DAY }, auth(OWNER));
    expect(listed.structuredContent).toMatchObject({ ok: true, news: { status: "listed", result: { day: { version: 1 } } } });
    const one = await handler({ action: "list_news_items", news_number: good.number }, auth(OWNER));
    expect(one.structuredContent).toMatchObject({ news: { result: { item: { draft: DRAFT, state: "shadow" } } } });
    const withdrawn = await handler({ action: "withdraw_news_item", reason: "A test.", news_number: "all" },
      auth(OWNER));
    expect(withdrawn.structuredContent).toMatchObject({ ok: true, news: { result: { withdrawn: [good.number] } } });
    expect(newsDayPayloadDigest(day)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("answers every news action within its time, and says when the store can't be reached", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const hanging = { ...store, inspectDay: () => new Promise<never>(() => undefined),
      withdraw: () => Promise.reject(new Error("connection refused")) } as unknown as InMemoryAtlasNewsStore;
    expect(await runAtlasNewsAction({ action: "list_news_items", news_date: DAY },
      { store: hanging, now: () => AT, paperStatus: clean, handlerMilliseconds: 30 }))
      .toMatchObject({ ok: false, news: { status: "unknown" } });
    expect(await runAtlasNewsAction({ action: "withdraw_news_item", news_number: "all", reason: "A test." },
      { store: hanging, now: () => AT, paperStatus: clean }))
      .toMatchObject({ ok: false, news: { status: "unavailable" } });
  });

  it("says news is off, and refuses a news input given to another action", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const off = await handlerWith("off", store)({ action: "list_news_items", news_date: DAY }, auth(OWNER));
    expect(off.structuredContent).toMatchObject({ ok: false, error: { code: "review_service_unavailable" } });
    const misplaced = await handlerWith("shadow", store)({ action: "list_publications", news_date: DAY },
      auth(OWNER));
    expect(misplaced.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
    const both = await handlerWith("shadow", store)({ action: "list_news_items",
      news_date: DAY, news_number: "N-1001" }, auth(OWNER));
    expect(both.structuredContent).toMatchObject({ ok: false, error: { code: "invalid_request" } });
  });
});

describe("nothing in shadow leaks", () => {
  it("leaves the news tables to the news modules and migration 0043: no page, search, lookup or sitemap reads them", async () => {
    const root = new URL("../", import.meta.url);
    const sourceDirectory = new URL("apps/research-mcp/src/", root);
    const files = (await readdir(sourceDirectory, { recursive: true })).filter((name) => name.endsWith(".ts"));
    const readers: string[] = [];
    for (const name of files) {
      const text = await readFile(new URL(name, sourceDirectory), "utf8");
      if (/atlas_news|AtlasNews(?:Review|Staging)?Store|inspectNumbers|inspectDay/u.test(text)) readers.push(name);
    }
    expect(readers.sort()).toEqual(["news/day.ts", "news/review.ts", "news/runtime.ts", "news/staging.ts",
      "research-contribution-review-tool.ts"]);
    const migration = await readFile(new URL("packages/evidence-repository/migrations/0043_atlas_news_items.sql", root), "utf8");
    expect(migration).toContain("REVOKE ALL ON TABLE atlas_news_items FROM askrigor_reader;");
    expect(migration).toContain("REVOKE ALL ON TABLE atlas_news_days FROM askrigor_reader;");
    expect(migration).not.toMatch(/GRANT /u);
  });
});
