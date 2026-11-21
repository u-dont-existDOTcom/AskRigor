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
  numbersMissingFrom,
  wordCount,
  type NewsCard,
} from "../apps/research-mcp/src/news/card.js";
import {
  newsDayPayloadDigest,
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

  it("counts the Finding's words without the tag: 12 pass, 13 don't, in a script without spaces too", () => {
    expect(codes(card((value) => { value.finding = "one two three four five six seven eight nine ten eleven twelve"; })))
      .toEqual([]);
    expect(codes(card((value) => {
      value.finding = "one two three four five six seven eight nine ten eleven twelve thirteen";
    }))).toEqual(["finding_too_long"]);
    expect(wordCount("毎日の散歩で血圧が下がった")).toBeGreaterThan(1);
  });

  it("needs people per 100 for both groups, shown in How much, for an outcome counted in people", () => {
    expect(codes(card((value) => { delete value.per_100; }))).toEqual(["per_100_missing"]);
    expect(codes(card((value) => { value.how_much = "Walkers did better within 6 months"; })))
      .toEqual(["per_100_not_in_how_much"]);
    expect(codes(card((value) => { value.outcome_kind = "scale"; delete value.per_100; }))).toEqual([]);
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
    expect(stale).toEqual({ status: "stale_base", latest: { day: "2026-11-22", version: 1, order: [first.number] } });
    const rebased = await publishNewsDay({ ...today, base: { day: "2026-11-22", version: 1 },
      order: [first.number, second.number] }, deps(store));
    expect(rebased).toMatchObject({ status: "committed", order: [first.number, second.number] });
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
    const passing = (number: string) => ({ number, kind: "main" as const, passed: true, reasons: [], reading: null,
      readingModel: null, retraction: null });
    const result = await store.commitDay(commit([yesterday.number], [passing(yesterday.number)]), AT.toISOString(),
      new Date(AT.getTime() + 60_000).toISOString());
    expect(result).toMatchObject({ status: "committed", order: [], keptBack: [{ number: yesterday.number, reasons: ["other_day"] }] });
    const older = await stage(store, card((value) => { value.how_much = `${value.how_much}.`; }));
    const newer = await stage(store, card((value) => { value.how_much = `${value.how_much}!`; }));
    await store.commitDay(commit([older.number], [passing(older.number)], "b"), AT.toISOString(),
      new Date(AT.getTime() + 60_000).toISOString());
    await store.commitDay(commit([newer.number], [passing(newer.number)], "c"), AT.toISOString(),
      new Date(AT.getTime() + 60_000).toISOString());
    const [olderItem, newerItem] = await store.inspectNumbers([older.number, newer.number], AT.toISOString());
    expect(olderItem).toMatchObject({ state: "withdrawn", withdrawnReason: "replaced" });
    expect(newerItem?.state).toBe("shadow");
  });

  it("binds a card staged again with another draft, still staged, to the newer draft", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
    const first = await stage(store, CARD);
    const again = await stage(store, CARD, `${DAY}T06:30:00.000Z`, `${DRAFT} A later revision.`);
    expect(again).toEqual({ ...first, alreadyStaged: true });
    const [item] = await store.inspectNumbers([first.number], AT.toISOString());
    expect(item!.draftSha256).toBe(sha256(`${DRAFT} A later revision.`));
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
    expect(result).toMatchObject({ status: "committed", linesKeptBack: [{ line: 0, reasons: ["not_staged"] }] });
    const listed = await store.inspectDay(DAY, AT.toISOString());
    expect(listed.day?.lines[0]).toMatchObject({ kind: "checked", passed: false, reasons: ["not_staged"] });
  });

  it("withdraws one item or every item, keeping why, and reads a card staged over 24 hours before as expired", async () => {
    const store = new InMemoryAtlasNewsStore(databaseClock);
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
