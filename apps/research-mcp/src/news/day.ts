import { createHash } from "node:crypto";

import {
  ATLAS_NEWS_CARRIED_DAYS,
  ATLAS_NEWS_NUMBER,
  ATLAS_NEWS_STAGED_LIFE_MS,
  AtlasNewsError,
  type AtlasNewsCommitOutcome,
  type AtlasNewsDecision,
  type AtlasNewsItem,
  type AtlasNewsKeptBack,
  type AtlasNewsRetractionStatus,
  type AtlasNewsReviewStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { canonicalJson } from "../findings/card.js";
import {
  NEWS_PUBLIC_FIELDS,
  NEWS_SKIP_REASONS,
  newsCardDigest,
  newsCardProblems,
  newsCardSchema,
  newsPublicTexts,
  numbersIn,
  numbersMissingFrom,
  wordCount,
  type NewsCard,
} from "./card.js";

/**
 * Atlas news, stage 1: the owner's day call, publish_news_day (design v4, sections 3.4, 3.5, 3.7 and 3.8). Once a day the
 * news task sends the day's payload; the server checks each new main item and each line, then commits the day whole,
 * or nothing, in one transaction (commit_atlas_news_day). Bounds, so a late or lost call can never store anything late:
 * the payload's day must be today's UTC date; nothing is stored after `not_after`; the handler gives the database the
 * earlier of `not_after` and 50 seconds from the call's start, which the function compares with its own clock as its
 * last step, and answers within 60 seconds whatever happens ("unknown" when the database hasn't answered by then: a
 * replay or a read-back with list_news_items tells). The same payload again returns the version it committed.
 */

/** The handler answers within this, whatever the database does. */
export const NEWS_DAY_HANDLER_MS = 60_000;
/** The database stores nothing after this much of the call has passed (or after not_after, if earlier). */
export const NEWS_DAY_DATABASE_MS = 50_000;
/** Each paper's retraction check, all at once, within the handler's time. */
export const NEWS_PAPER_CHECK_MS = 15_000;
/** A "not worth reading" line's quote from an abstract: at least this many words. */
export const NEWS_LINE_QUOTE_WORDS = 8;
/** The reasons an abstract alone can support (design 3.5); "headline overclaims" needs a full check. */
export const NEWS_ABSTRACT_REASONS = ["animal_or_cell", "model_only", "early_uncontrolled", "cannot_show_cause"] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const numberSchema = z.string().regex(ATLAS_NEWS_NUMBER);
const reasonText = z.string().trim().min(1).max(300);
const verdict = z.enum(["supported", "stronger", "different", "absent"]);

export const newsReadingSchema = z.object({
  number: numberSchema,
  card: z.string().regex(SHA256).describe("The digest of the card this reading read, as its check staged it."),
  draft: z.string().regex(SHA256).describe("The digest of the draft this reading read the card against (SHA-256 of the " +
    "draft without leading and trailing white space, as the receipt's answer claim gives it)."),
  model: z.string().trim().min(1).max(100).describe("The model that made the reading."),
  fields: z.partialRecord(z.enum(NEWS_PUBLIC_FIELDS), verdict),
  numbers: z.partialRecord(z.enum(NEWS_PUBLIC_FIELDS), z.enum(["same", "different", "none"])),
  advice: z.enum(["no", "yes"]).describe("Whether any field tells a reader to start, stop or change a prescription " +
    "treatment on their own."),
}).strict();
export type NewsReading = z.output<typeof newsReadingSchema>;

const abstractLineSchema = z.object({
  kind: z.literal("abstract_read"),
  doi: z.string().trim().toLowerCase().regex(/^10\.\d{4,9}\/\S{1,300}$/u),
  title: z.string().trim().min(1).max(300),
  journal: z.string().trim().min(1).max(150),
  year: z.number().int().min(1900).max(2100),
  reason_code: z.enum(NEWS_SKIP_REASONS),
  quote: z.string().trim().min(1).max(600),
  usefulness: reasonText,
}).strict();

export const newsDayPayloadSchema = z.object({
  day: z.string().regex(DAY),
  not_after: z.number().int().positive().describe("Unix seconds: the run's deadline less five minutes."),
  base: z.object({ day: z.string().regex(DAY), version: z.number().int().min(1) }).strict().nullable(),
  rerank: z.boolean(),
  order: z.array(numberSchema).max(200),
  places: z.array(z.object({ number: numberSchema, reason: reasonText }).strict()).max(40),
  moves: z.array(z.object({ number: numberSchema, reason: reasonText }).strict()).max(60),
  readings: z.array(newsReadingSchema).max(40),
  lines: z.array(z.union([z.object({ kind: z.literal("checked"), number: numberSchema }).strict(), abstractLineSchema]))
    .max(30),
  line_readings: z.array(z.object({ line: z.number().int().min(0), verdict: z.enum(["supported", "not_supported"]) })
    .strict()).max(30),
  footer: z.object({ text: z.string().trim().min(1).max(2_000) }).strict().nullable(),
}).strict();
export type NewsDayPayload = z.output<typeof newsDayPayloadSchema>;

export type PaperStatus = AtlasNewsRetractionStatus;
export type PaperStatusLookup = (doi: string) => Promise<PaperStatus>;

export interface NewsDayDependencies {
  store: AtlasNewsReviewStore;
  now: () => Date;
  paperStatus: PaperStatusLookup;
  /** NEWS_DAY_HANDLER_MS and NEWS_DAY_DATABASE_MS, shorter only in tests. */
  handlerMilliseconds?: number;
  databaseMilliseconds?: number;
}

export type NewsDayResult =
  | { status: "committed" | "replayed"; day: string; version: number; order: string[]; keptBack: AtlasNewsKeptBack[];
      linesKeptBack: Array<{ line: number; reasons: string[] }> }
  | { status: "stale_base"; latest: { day: string; version: number; order: string[] } | null }
  | { status: "late" | "unknown"; day: string }
  | { status: "refused"; reason: "other_day" | "order_invalid" | "invalid_payload"; problems: string[] };

/** The digest the day call is idempotent on: sha256 of the payload's canonical JSON. */
export function newsDayPayloadDigest(payload: NewsDayPayload): string {
  return createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
}

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const isSunday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
const utcDay = (at: Date | string) => new Date(at).toISOString().slice(0, 10);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

async function settles<T>(work: Promise<T>, milliseconds: number, late: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([work, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(late), milliseconds); })]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The order problems a weekday's or a Sunday's order has against its carried items, as the function checks them. A base
 * item withdrawn since (`withdrawn`) may stay in the order; it is neither carried nor new, and isn't stored.
 */
export function newsOrderProblems(payload: NewsDayPayload, carried: readonly string[],
  withdrawn: readonly string[] = []): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const number of payload.order) {
    if (seen.has(number)) problems.push(`${number} is in the order twice.`);
    seen.add(number);
  }
  const given = payload.order.filter((number) => carried.includes(number));
  if (given.length !== carried.length) {
    problems.push(`The order must carry every item of the base still within seven days: ${carried
      .filter((number) => !given.includes(number)).join(", ") || "none missing"}.`);
  }
  const moved = given.filter((number, place) => number !== carried[place]);
  if (!payload.rerank) {
    if (moved.length > 0) problems.push(`On a day without a re-rank the carried items keep the base's order; moved: ${moved.join(", ")}.`);
    if (payload.moves.length > 0) problems.push("moves are given only with a Sunday's re-rank.");
  } else {
    if (!isSunday(payload.day)) problems.push("A re-rank is accepted only on a Sunday (UTC).");
    const reasons = new Set(payload.moves.map(({ number }) => number));
    const unexplained = moved.filter((number) => !reasons.has(number));
    if (unexplained.length > 0) problems.push(`Each moved item needs a reason in moves: ${unexplained.join(", ")}.`);
  }
  const fresh = payload.order.filter((number) => !carried.includes(number) && !withdrawn.includes(number));
  const placed = new Set(payload.places.map(({ number }) => number));
  const unplaced = fresh.filter((number) => !placed.has(number));
  if (unplaced.length > 0) problems.push(`Each new item needs its place's reason in places: ${unplaced.join(", ")}.`);
  return problems;
}

/** 3.4's steps 1, 2, 3 and 6 on one staged card (step 5, the paper, is read apart). The reasons it is kept back. */
export function newsItemReasons(item: AtlasNewsItem | undefined, kind: "main" | "line", day: string, at: Date,
  reading: NewsReading | undefined): { reasons: string[]; card?: NewsCard } {
  if (item?.state === "expired") return { reasons: ["expired"] };
  // A card staged today, or committed by an earlier version of today's call (a changed payload makes a new version).
  if (item === undefined || !(item.state === "staged" ||
    ((item.state === "shadow" || item.state === "kept_back") && item.committedDay === day))) {
    return { reasons: ["not_staged"] };
  }
  if (utcDay(item.stagedAt) !== day) return { reasons: ["other_day"] };
  if (Date.parse(item.stagedAt) < at.getTime() - ATLAS_NEWS_STAGED_LIFE_MS) return { reasons: ["expired"] };
  const parsed = newsCardSchema.safeParse(item.card);
  if (!parsed.success || newsCardDigest(parsed.data) !== item.cardSha256 || sha256(item.draft.trim()) !== item.draftSha256 ||
    item.receiptClaims.news !== item.cardSha256 || item.receiptClaims.nl.length !== parsed.data.backing.length) {
    return { reasons: ["card_not_as_staged"] };
  }
  const card = parsed.data;
  const reasons: string[] = newsCardProblems(card).map(({ code }) => `card_rules:${code}`);
  // What the receipt signed each backing line's lookup found (`nl`: line, outcome, text): a funder or an author is named,
  // an agency's action relied on and How much's figures quoted only through a line found word for word in the text
  // AskRigor fetched (design 3.3 and 3.6). A card that couldn't name them says "not checked" in a new check.
  const found = new Set(item.receiptClaims.nl.flatMap((entry) => {
    const [line, outcome] = entry.split(":");
    return outcome === "f" && line !== undefined && /^\d+$/u.test(line) ? [Number(line) - 1] : [];
  }));
  const named = [...card.who_paid.funders, ...card.who_paid.declarations];
  if (named.some(({ backing }) => !found.has(backing))) reasons.push("who_paid_quote_not_found");
  const linesOf = (field: string) => card.backing.flatMap((line, place) => line.field === field ? [place] : []);
  if (card.official_action !== undefined && !linesOf("official_action").some((place) => found.has(place))) {
    reasons.push("official_action_quote_not_found");
  }
  if (numbersIn(card.how_much).length > 0 && !linesOf("how_much").some((place) => found.has(place))) {
    reasons.push("how_much_quote_not_found");
  }
  if (kind === "main" && !card.meets_our_bar.meets) reasons.push("not_a_main_item");
  if (kind === "line" && card.meets_our_bar.meets) reasons.push("not_a_line");
  const texts = newsPublicTexts(card);
  for (const field of NEWS_PUBLIC_FIELDS) {
    if (numbersMissingFrom(texts[field], item.draft).length > 0) reasons.push(`numbers_not_in_draft:${field}`);
  }
  if (reading === undefined) {
    reasons.push("no_reading");
  } else if (reading.card !== item.cardSha256 || reading.draft !== item.draftSha256) {
    reasons.push("reading_of_another_card");
  } else {
    for (const field of NEWS_PUBLIC_FIELDS) {
      if (texts[field].trim() === "") continue;
      const read = reading.fields[field];
      if (read === undefined) reasons.push(`reading_missing:${field}`);
      else if (read !== "supported") reasons.push(`reading_${read}:${field}`);
      if (numbersIn(texts[field]).length > 0 && reading.numbers[field] !== "same") reasons.push(`numbers_differ:${field}`);
    }
    if (reading.advice !== "no") reasons.push("advice_to_change_treatment");
  }
  return { reasons: [...new Set(reasons)], card };
}

/** 3.5: an "abstract read" line's own checks; a "checked" line is checked through its card. */
export function abstractLineReasons(line: z.output<typeof abstractLineSchema>,
  reading: "supported" | "not_supported" | undefined): string[] {
  const reasons: string[] = [];
  if (!(NEWS_ABSTRACT_REASONS as readonly string[]).includes(line.reason_code)) reasons.push("reason_needs_full_check");
  if (wordCount(line.quote) < NEWS_LINE_QUOTE_WORDS) reasons.push("quote_too_short");
  if (reading === undefined) reasons.push("no_reading");
  else if (reading !== "supported") reasons.push("reading_not_supported");
  return reasons;
}

/** The day call. Never throws for a payload's content: every outcome is a result. */
export async function publishNewsDay(raw: unknown, deps: NewsDayDependencies): Promise<NewsDayResult> {
  const started = deps.now();
  const parsed = newsDayPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "refused", reason: "invalid_payload", problems: parsed.error.issues.slice(0, 12)
      .map((issue) => `news_day${issue.path.map((part) => typeof part === "number" ? `[${part}]` : `.${String(part)}`)
        .join("")}: ${issue.message}`) };
  }
  const payload = parsed.data;
  const midnight = Date.UTC(started.getUTCFullYear(), started.getUTCMonth(), started.getUTCDate() + 1);
  const deadline = new Date(Math.min(payload.not_after * 1000,
    started.getTime() + (deps.databaseMilliseconds ?? NEWS_DAY_DATABASE_MS), midnight - 1));
  const work = (async (): Promise<NewsDayResult> => {
    const payloadSha256 = newsDayPayloadDigest(payload);
    const at = started.toISOString();
    // A replay is recognised before anything else is checked, even after not_after: it is a read, and a day committed
    // in time must never be reported as late.
    const replay = (await deps.store.inspectDay(payload.day, at, payloadSha256)).day;
    if (replay !== null && replay.payloadSha256 === payloadSha256) {
      return { status: "replayed", day: replay.day, version: replay.version, order: replay.order,
        keptBack: replay.keptBack, linesKeptBack: linesKeptBackOf(replay.lines) };
    }
    if (started.getTime() > payload.not_after * 1000) return { status: "late", day: payload.day };
    if (payload.day !== utcDay(started)) {
      return { status: "refused", reason: "other_day", problems: [`news_day.day is ${payload.day}; the server stores ` +
        `only today's UTC date, ${utcDay(started)}.`] };
    }
    const base = await deps.store.inspectBefore(payload.day, at);
    const baseMatches = (base === null) === (payload.base === null) &&
      (base === null || (base.day === payload.base!.day && base.version === payload.base!.version));
    if (!baseMatches) {
      return { status: "stale_base", latest: base === null ? null : { day: base.day, version: base.version, order: base.order } };
    }
    const states = new Map((base?.items ?? []).map((item) => [item.number, item]));
    const recent = (base?.order ?? []).filter((number) => {
      const item = states.get(number);
      return item !== undefined && item.committedDay !== null &&
        dayNumber(item.committedDay) >= dayNumber(payload.day) - (ATLAS_NEWS_CARRIED_DAYS - 1);
    });
    const carried = recent.filter((number) => states.get(number)!.state === "shadow");
    // Withdrawn since the base (by the owner, or replaced by a newer card): it may stay in the order, and isn't stored.
    const withdrawn = recent.filter((number) => states.get(number)!.state === "withdrawn");
    const orderProblems = newsOrderProblems(payload, carried, withdrawn);
    if (orderProblems.length > 0) return { status: "refused", reason: "order_invalid", problems: orderProblems };
    const fresh = payload.order.filter((number) => !carried.includes(number) && !withdrawn.includes(number));
    const checkedLines = payload.lines.flatMap((line) => line.kind === "checked" ? [line.number] : []);
    const overlap = checkedLines.filter((number) => payload.order.includes(number) || checkedLines.indexOf(number) !==
      checkedLines.lastIndexOf(number));
    if (overlap.length > 0) {
      return { status: "refused", reason: "invalid_payload", problems: [`A "checked" line's card is neither in the ` +
        `order nor in two lines: ${[...new Set(overlap)].join(", ")}.`] };
    }
    const wanted = [...fresh, ...checkedLines];
    const items = new Map<string, AtlasNewsItem>();
    for (let start = 0; start < wanted.length; start += 20) {
      for (const item of await deps.store.inspectNumbers(wanted.slice(start, start + 20), at)) items.set(item.number, item);
    }
    const readings = new Map(payload.readings.map((reading) => [reading.number, reading]));
    const decided = wanted.map((number) => {
      const kind = fresh.includes(number) ? "main" as const : "line" as const;
      return { number, kind, ...newsItemReasons(items.get(number), kind, payload.day, started, readings.get(number)) };
    });
    // Step 5: each paper's retraction and correction status, read today; a retracted paper is kept back.
    const papers = await Promise.all(decided.map(async ({ card }): Promise<AtlasNewsRetractionStatus | null> => {
      if (card === undefined) return null;
      if (card.doi === undefined) return "no_doi";
      return await settles(deps.paperStatus(card.doi).catch(() => "unknown" as const), NEWS_PAPER_CHECK_MS, "unknown");
    }));
    const decisions: AtlasNewsDecision[] = decided.map(({ number, kind, reasons, card }, place) => {
      const paper = papers[place] ?? null;
      const all = [...reasons,
        ...(paper === "retracted" ? ["paper_retracted"] : []),
        ...(paper === "unknown" ? ["paper_unchecked"] : []),
        ...(paper === "no_doi" && card !== undefined && card.design !== "official_notice" ? ["no_doi"] : []),
      ];
      const reading = readings.get(number);
      // At most 20 reasons are kept on an item's row; the first ones are the decisive ones.
      return { number, kind, passed: all.length === 0, reasons: all.slice(0, 20),
        reading: reading === undefined ? null : { ...reading }, readingModel: reading?.model ?? null, retraction: paper };
    });
    const lineReadings = new Map(payload.line_readings.map(({ line, verdict: read }) => [line, read]));
    const lines = payload.lines.map((line, place) => {
      if (line.kind === "checked") {
        const decision = decisions.find(({ number }) => number === line.number)!;
        return { ...line, passed: decision.passed, reasons: decision.reasons };
      }
      const reasons = abstractLineReasons(line, lineReadings.get(place));
      return { ...line, passed: reasons.length === 0, reasons };
    });
    const moves = [...payload.places.map((entry) => ({ ...entry, kind: "place" })),
      ...payload.moves.map((entry) => ({ ...entry, kind: "move" }))];
    let outcome: AtlasNewsCommitOutcome;
    try {
      outcome = await deps.store.commitDay({ day: payload.day, payloadSha256, base: payload.base, rerank: payload.rerank,
        order: payload.order, decisions, moves, lines, footer: payload.footer }, at, deadline.toISOString());
    } catch (error) {
      if (error instanceof AtlasNewsError) {
        if (error.code === "LATE") return { status: "late", day: payload.day };
        if (error.code === "OTHER_DAY") return { status: "refused", reason: "other_day", problems: ["Not today's UTC date."] };
        if (error.code === "ORDER_INVALID") {
          return { status: "refused", reason: "order_invalid", problems: ["The database refused the order."] };
        }
        return { status: "refused", reason: "invalid_payload", problems: ["The database refused the day as invalid."] };
      }
      return { status: "unknown", day: payload.day };
    }
    if (outcome.status === "stale_base") return outcome;
    // The lines as the database stored them: each "checked" line with its card's final decision.
    const { lines: storedLines, ...stored } = outcome;
    return { ...stored, linesKeptBack: linesKeptBackOf(storedLines) };
  })();
  return await settles(work.catch((): NewsDayResult => ({ status: "unknown", day: payload.day })),
    Math.max(0, started.getTime() + (deps.handlerMilliseconds ?? NEWS_DAY_HANDLER_MS) - deps.now().getTime()),
    { status: "unknown", day: payload.day });
}

function linesKeptBackOf(lines: ReadonlyArray<Record<string, unknown>>): Array<{ line: number; reasons: string[] }> {
  return lines.flatMap((line, place) => line.passed === false && Array.isArray(line.reasons)
    ? [{ line: place, reasons: line.reasons.filter((reason): reason is string => typeof reason === "string") }] : []);
}
