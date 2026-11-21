import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";

// Atlas news, stage 1 (design v4, sections 3.3 and 3.8; plan docs/superpowers/plans/2026-11-21-atlas-news-stage1.md), as
// migration 0043 stores it: each news check's passing card staged by the research-access role inside finalize_research;
// one owner call a day commits the day whole, or nothing, through the review role; nothing is shown in stage 1.

export const ATLAS_NEWS_ITEM_STATES = ["staged", "expired", "shadow", "kept_back", "withdrawn"] as const;
export type AtlasNewsItemState = typeof ATLAS_NEWS_ITEM_STATES[number];
/** The most cards staged in one UTC day (a bound should the dev-account test ever fail). */
export const ATLAS_NEWS_STAGED_PER_DAY = 20;
/** A staged card no day commits within a receipt's life is expired. */
export const ATLAS_NEWS_STAGED_LIFE_MS = 24 * 60 * 60 * 1000;
/** Items stay in the default order for seven days: committed on day d, they are carried on days d to d + 6. */
export const ATLAS_NEWS_CARRIED_DAYS = 7;
export const ATLAS_NEWS_NUMBER = /^N-[1-9][0-9]{3,}$/u;
export const ATLAS_NEWS_RETRACTION_STATUSES = [
  "no_retraction_record_found", "corrected_or_updated", "expression_of_concern", "retracted", "unknown", "no_doi",
] as const;
export type AtlasNewsRetractionStatus = typeof ATLAS_NEWS_RETRACTION_STATUSES[number];

export const ATLAS_NEWS_ERROR_CODES = ["INPUT_INVALID", "DAY_FULL", "OTHER_DAY", "ORDER_INVALID", "LATE"] as const;
export type AtlasNewsErrorCode = typeof ATLAS_NEWS_ERROR_CODES[number];
export class AtlasNewsError extends Error {
  constructor(readonly code: AtlasNewsErrorCode) {
    super(`ATLAS_NEWS_${code}`);
  }
}

/** The receipt's news claims, as finalize_research signed them. */
export interface AtlasNewsReceiptClaims {
  news: string;
  nl: string[];
  ns: string[];
  nr: string[];
}

export interface AtlasNewsStageInput {
  itemId: string;
  checkId: string;
  card: Record<string, unknown>;
  cardSha256: string;
  draft: string;
  draftSha256: string;
  receiptClaims: AtlasNewsReceiptClaims;
  receiptIssuedAt: string;
  doi: string | null;
}

export interface AtlasNewsStaged {
  number: string;
  cardSha256: string;
  alreadyStaged: boolean;
}

export interface AtlasNewsDecision {
  number: string;
  kind: "main" | "line";
  passed: boolean;
  /** Why it is kept back: empty exactly when it passed. */
  reasons: string[];
  reading: Record<string, unknown> | null;
  readingModel: string | null;
  retraction: AtlasNewsRetractionStatus | null;
}

export interface AtlasNewsDayCommit {
  day: string;
  payloadSha256: string;
  base: { day: string; version: number } | null;
  rerank: boolean;
  /** The seven-day order as given: the carried items and the day's new main items, by N-number. */
  order: string[];
  /** One for each new main item in the order and each "checked" line's card. */
  decisions: AtlasNewsDecision[];
  moves: Array<Record<string, unknown>>;
  lines: Array<Record<string, unknown>>;
  footer: Record<string, unknown> | null;
}

export interface AtlasNewsKeptBack {
  number: string;
  reasons: string[];
}

export type AtlasNewsCommitOutcome =
  | { status: "committed" | "replayed"; day: string; version: number; order: string[]; keptBack: AtlasNewsKeptBack[] }
  | { status: "stale_base"; latest: { day: string; version: number; order: string[] } | null };

/** An item as the day's list shows it, without its draft. */
export interface AtlasNewsItemSummary {
  number: string;
  itemId: string;
  checkId: string;
  cardSha256: string;
  label: string | null;
  finding: string | null;
  doi: string | null;
  stagedAt: string;
  state: AtlasNewsItemState;
  kind: "main" | "line" | null;
  keptReasons: string[] | null;
  committedVersion: number | null;
  readingModel: string | null;
  retraction: string | null;
  withdrawnReason: string | null;
}

/** An item in full, its draft and receipt claims included, for the day call's checks and the shadow readers. */
export interface AtlasNewsItem extends Omit<AtlasNewsItemSummary, "label" | "finding"> {
  card: Record<string, unknown>;
  draft: string;
  draftSha256: string;
  receiptClaims: AtlasNewsReceiptClaims;
  receiptIssuedAt: string;
  committedDay: string | null;
  reading: Record<string, unknown> | null;
}

export interface AtlasNewsDayRecord {
  day: string;
  version: number;
  payloadSha256: string;
  base: { day: string; version: number } | null;
  rerank: boolean;
  order: string[];
  moves: Array<Record<string, unknown>>;
  lines: Array<Record<string, unknown>>;
  footer: Record<string, unknown> | null;
  keptBack: AtlasNewsKeptBack[];
  committedAt: string;
}

/** The latest committed day before another, with each of its order's items' state and commit day. */
export interface AtlasNewsBase {
  day: string;
  version: number;
  order: string[];
  items: Array<{ number: string; state: AtlasNewsItemState; committedDay: string | null }>;
}

/** The research-access role's one function. */
export interface AtlasNewsStagingStore {
  stage(item: AtlasNewsStageInput, at: string): Promise<AtlasNewsStaged>;
}

/** The review role's three functions. */
export interface AtlasNewsReviewStore {
  /** Throws AtlasNewsError("LATE") when the function passes `deadline` (read from its own clock as its last step). */
  commitDay(commit: AtlasNewsDayCommit, at: string, deadline: string): Promise<AtlasNewsCommitOutcome>;
  withdraw(target: string, reason: string, at: string): Promise<Array<{ number: string; state: AtlasNewsItemState }>>;
  inspectDay(day: string, at: string): Promise<{ day: AtlasNewsDayRecord | null; items: AtlasNewsItemSummary[] }>;
  inspectBefore(day: string, at: string): Promise<AtlasNewsBase | null>;
  inspectNumbers(numbers: readonly string[], at: string): Promise<AtlasNewsItem[]>;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const DOI = /^10\.\d{4,9}\/\S{1,300}$/u;

const utcDay = (at: string | number | Date) => new Date(at).toISOString().slice(0, 10);
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const isSunday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
const newsNumber = (number: number) => `N-${number}`;
const numberOf = (text: string) => Number(text.slice(2));

function checkStageInput(item: AtlasNewsStageInput, at: string): void {
  const claims = item.receiptClaims;
  const valid = ID.test(item.itemId) && ID.test(item.checkId) && item.card !== null && typeof item.card === "object" &&
    !Array.isArray(item.card) && Buffer.byteLength(JSON.stringify(item.card)) <= 32_768 && SHA256.test(item.cardSha256) &&
    typeof item.draft === "string" && item.draft.length >= 1 && item.draft.length <= 60_000 &&
    SHA256.test(item.draftSha256) && claims !== null && typeof claims === "object" && typeof claims.news === "string" &&
    [claims.nl, claims.ns, claims.nr].every((list) => Array.isArray(list) && list.every((entry) => typeof entry === "string")) &&
    Buffer.byteLength(JSON.stringify(claims)) <= 40_000 && Number.isFinite(Date.parse(item.receiptIssuedAt)) &&
    (item.doi === null || DOI.test(item.doi)) && Number.isFinite(Date.parse(at));
  if (!valid) throw new AtlasNewsError("INPUT_INVALID");
}

function checkCommit(commit: AtlasNewsDayCommit, at: string, deadline: string): void {
  const valid = DAY.test(commit.day) && SHA256.test(commit.payloadSha256) && typeof commit.rerank === "boolean" &&
    (commit.base === null || (DAY.test(commit.base.day) && Number.isSafeInteger(commit.base.version) &&
      commit.base.version >= 1)) &&
    Array.isArray(commit.order) && commit.order.every((number) => ATLAS_NEWS_NUMBER.test(number)) &&
    Array.isArray(commit.decisions) && Array.isArray(commit.moves) && Array.isArray(commit.lines) &&
    commit.decisions.every((decision) => ATLAS_NEWS_NUMBER.test(decision.number) &&
      (decision.kind === "main" || decision.kind === "line") && typeof decision.passed === "boolean" &&
      Array.isArray(decision.reasons) && decision.passed === (decision.reasons.length === 0)) &&
    Number.isFinite(Date.parse(at)) && Number.isFinite(Date.parse(deadline));
  if (!valid) throw new AtlasNewsError("INPUT_INVALID");
}

interface MemoryItem extends Omit<AtlasNewsItem, "state"> {
  state: Exclude<AtlasNewsItemState, "expired">;
  ownerReason: string | null;
  changedAt: string;
}

/** The news tables in memory, with migration 0043's semantics; `clock` stands for the database's clock_timestamp(). */
export class InMemoryAtlasNewsStore implements AtlasNewsStagingStore, AtlasNewsReviewStore {
  private readonly items = new Map<number, MemoryItem>();
  private readonly days: AtlasNewsDayRecord[] = [];
  private next = 1001;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async stage(item: AtlasNewsStageInput, at: string): Promise<AtlasNewsStaged> {
    checkStageInput(item, at);
    for (const [number, stored] of this.items) {
      if (stored.itemId === item.itemId && stored.cardSha256 === item.cardSha256) {
        return { number: newsNumber(number), cardSha256: item.cardSha256, alreadyStaged: true };
      }
    }
    const today = utcDay(at);
    if ([...this.items.values()].filter((stored) => utcDay(stored.stagedAt) === today).length >= ATLAS_NEWS_STAGED_PER_DAY) {
      throw new AtlasNewsError("DAY_FULL");
    }
    const number = this.next++;
    this.items.set(number, {
      number: newsNumber(number), itemId: item.itemId, checkId: item.checkId, card: structuredClone(item.card),
      cardSha256: item.cardSha256, draft: item.draft, draftSha256: item.draftSha256,
      receiptClaims: structuredClone(item.receiptClaims), receiptIssuedAt: new Date(item.receiptIssuedAt).toISOString(),
      doi: item.doi, stagedAt: new Date(at).toISOString(), state: "staged", kind: null, keptReasons: null,
      committedDay: null, committedVersion: null, reading: null, readingModel: null, retraction: null,
      withdrawnReason: null, ownerReason: null, changedAt: new Date(at).toISOString(),
    });
    return { number: newsNumber(number), cardSha256: item.cardSha256, alreadyStaged: false };
  }

  async commitDay(commit: AtlasNewsDayCommit, at: string, deadline: string): Promise<AtlasNewsCommitOutcome> {
    checkCommit(commit, at, deadline);
    const replayed = this.days.find((day) => day.day === commit.day && day.payloadSha256 === commit.payloadSha256);
    if (replayed !== undefined) {
      return { status: "replayed", day: replayed.day, version: replayed.version, order: [...replayed.order],
        keptBack: structuredClone(replayed.keptBack) };
    }
    if (commit.day !== utcDay(at)) throw new AtlasNewsError("OTHER_DAY");
    if (commit.rerank && !isSunday(commit.day)) throw new AtlasNewsError("ORDER_INVALID");
    const latest = this.latestBefore(commit.day);
    if ((latest === undefined) !== (commit.base === null) ||
      (latest !== undefined && (latest.day !== commit.base!.day || latest.version !== commit.base!.version))) {
      return { status: "stale_base",
        latest: latest === undefined ? null : { day: latest.day, version: latest.version, order: [...latest.order] } };
    }
    const carriedExpected = latest === undefined ? [] : latest.order.filter((number) => {
      const item = this.items.get(numberOf(number));
      return item !== undefined && item.state === "shadow" && item.committedDay !== null &&
        dayNumber(item.committedDay) >= dayNumber(commit.day) - (ATLAS_NEWS_CARRIED_DAYS - 1);
    });
    const carriedGiven: string[] = [];
    const newNumbers: string[] = [];
    for (const number of commit.order) {
      if (carriedGiven.includes(number) || newNumbers.includes(number)) throw new AtlasNewsError("ORDER_INVALID");
      (carriedExpected.includes(number) ? carriedGiven : newNumbers).push(number);
    }
    if (carriedGiven.length !== carriedExpected.length ||
      (!commit.rerank && carriedGiven.some((number, place) => number !== carriedExpected[place]))) {
      throw new AtlasNewsError("ORDER_INVALID");
    }
    const decided = new Set<string>();
    for (const decision of commit.decisions) {
      if (decided.has(decision.number) || (decision.kind === "main") !== newNumbers.includes(decision.number) ||
        carriedExpected.includes(decision.number)) throw new AtlasNewsError("INPUT_INVALID");
      decided.add(decision.number);
    }
    if (commit.decisions.filter(({ kind }) => kind === "main").length !== newNumbers.length) {
      throw new AtlasNewsError("INPUT_INVALID");
    }
    const version = Math.max(0, ...this.days.filter((day) => day.day === commit.day).map((day) => day.version)) + 1;
    // Changes are made on copies and kept only if the deadline holds, as the transaction's rollback does.
    const changed = new Map<number, MemoryItem>();
    const current = (number: number) => changed.get(number) ?? this.items.get(number);
    const keptBack: AtlasNewsKeptBack[] = [];
    const keptMain = new Set<string>();
    const commitTime = new Date(at).toISOString();
    for (const decision of commit.decisions) {
      const number = numberOf(decision.number);
      const stored = current(number);
      // Staged today, or committed by an earlier version of today's call: a changed payload makes a new version.
      const redecidable = stored !== undefined && (stored.state === "staged" ||
        ((stored.state === "shadow" || stored.state === "kept_back") && stored.committedDay === commit.day));
      const forced = !redecidable ? "not_staged"
        : utcDay(stored.stagedAt) !== commit.day ? "other_day"
        : Date.parse(stored.stagedAt) < Date.parse(at) - ATLAS_NEWS_STAGED_LIFE_MS ? "expired" : undefined;
      const common = { kind: decision.kind, committedDay: commit.day, committedVersion: version,
        reading: decision.reading === null ? null : structuredClone(decision.reading), readingModel: decision.readingModel,
        retraction: decision.retraction, changedAt: commitTime };
      if (forced === undefined && decision.passed) {
        changed.set(number, { ...stored!, ...common, state: "shadow", keptReasons: null });
        // A newer card of an item already committed takes its place.
        for (const other of this.items.keys()) {
          const item = current(other)!;
          if (other !== number && item.itemId === stored!.itemId && item.state === "shadow") {
            changed.set(other, { ...item, state: "withdrawn", withdrawnReason: "replaced", changedAt: commitTime });
          }
        }
      } else {
        const reasons = forced === undefined ? [...decision.reasons] : [forced];
        keptBack.push({ number: decision.number, reasons });
        if (decision.kind === "main") keptMain.add(decision.number);
        if (redecidable) changed.set(number, { ...stored!, ...common, state: "kept_back", keptReasons: reasons });
      }
    }
    const order = commit.order.filter((number) => !keptMain.has(number));
    if (this.clock().getTime() > Date.parse(deadline)) throw new AtlasNewsError("LATE");
    for (const [number, item] of changed) this.items.set(number, item);
    this.days.push({ day: commit.day, version, payloadSha256: commit.payloadSha256,
      base: commit.base === null ? null : { ...commit.base }, rerank: commit.rerank, order,
      moves: structuredClone(commit.moves), lines: structuredClone(commit.lines),
      footer: commit.footer === null ? null : structuredClone(commit.footer), keptBack, committedAt: commitTime });
    return { status: "committed", day: commit.day, version, order: [...order], keptBack: structuredClone(keptBack) };
  }

  async withdraw(target: string, reason: string, at: string): Promise<Array<{ number: string; state: AtlasNewsItemState }>> {
    if ((target !== "all" && !ATLAS_NEWS_NUMBER.test(target)) || typeof reason !== "string" || reason.length < 1 ||
      reason.length > 2000 || !Number.isFinite(Date.parse(at))) throw new AtlasNewsError("INPUT_INVALID");
    const changed: Array<{ number: string; state: AtlasNewsItemState }> = [];
    for (const [number, item] of [...this.items].sort(([left], [right]) => left - right)) {
      if (item.state === "withdrawn" || (target !== "all" && numberOf(target) !== number)) continue;
      this.items.set(number, { ...item, state: "withdrawn", withdrawnReason: "owner_unpublished", ownerReason: reason,
        changedAt: new Date(Math.max(Date.parse(at), Date.parse(item.changedAt))).toISOString() });
      changed.push({ number: newsNumber(number), state: "withdrawn" });
    }
    return changed;
  }

  async inspectDay(day: string, at: string): Promise<{ day: AtlasNewsDayRecord | null; items: AtlasNewsItemSummary[] }> {
    if (!DAY.test(day) || !Number.isFinite(Date.parse(at))) throw new AtlasNewsError("INPUT_INVALID");
    const record = this.days.filter((stored) => stored.day === day).sort((left, right) => right.version - left.version)[0];
    const items = [...this.items.values()]
      .filter((item) => utcDay(item.stagedAt) === day || item.committedDay === day)
      .sort((left, right) => numberOf(left.number) - numberOf(right.number))
      .map((item): AtlasNewsItemSummary => ({
        number: item.number, itemId: item.itemId, checkId: item.checkId, cardSha256: item.cardSha256,
        label: typeof item.card.label === "string" ? item.card.label : null,
        finding: typeof item.card.finding === "string" ? item.card.finding : null, doi: item.doi, stagedAt: item.stagedAt,
        state: this.visibleState(item, at), kind: item.kind, keptReasons: item.keptReasons,
        committedVersion: item.committedVersion, readingModel: item.readingModel, retraction: item.retraction,
        withdrawnReason: item.withdrawnReason,
      }));
    return { day: record === undefined ? null : structuredClone(record), items };
  }

  async inspectBefore(day: string, at: string): Promise<AtlasNewsBase | null> {
    if (!DAY.test(day) || !Number.isFinite(Date.parse(at))) throw new AtlasNewsError("INPUT_INVALID");
    const latest = this.latestBefore(day);
    if (latest === undefined) return null;
    return {
      day: latest.day, version: latest.version, order: [...latest.order],
      items: latest.order.flatMap((number) => {
        const item = this.items.get(numberOf(number));
        return item === undefined ? [] : [{ number, state: item.state, committedDay: item.committedDay }];
      }).sort((left, right) => numberOf(left.number) - numberOf(right.number)),
    };
  }

  async inspectNumbers(numbers: readonly string[], at: string): Promise<AtlasNewsItem[]> {
    if (numbers.length < 1 || numbers.length > 20 || !numbers.every((number) => ATLAS_NEWS_NUMBER.test(number)) ||
      !Number.isFinite(Date.parse(at))) throw new AtlasNewsError("INPUT_INVALID");
    const wanted = new Set(numbers.map(numberOf));
    return [...this.items.entries()].filter(([number]) => wanted.has(number))
      .sort(([left], [right]) => left - right)
      .map(([, item]) => {
        const { ownerReason: _reason, changedAt: _changed, ...shown } = structuredClone(item);
        return { ...shown, state: this.visibleState(item, at) };
      });
  }

  private latestBefore(day: string): AtlasNewsDayRecord | undefined {
    return this.days.filter((stored) => stored.day < day)
      .sort((left, right) => left.day === right.day ? right.version - left.version : right.day.localeCompare(left.day))[0];
  }

  private visibleState(item: MemoryItem, at: string): AtlasNewsItemState {
    return item.state === "staged" && Date.parse(item.stagedAt) < Date.parse(at) - ATLAS_NEWS_STAGED_LIFE_MS
      ? "expired" : item.state;
  }
}

async function call<Row extends object>(pool: Pool, sql: string, values: unknown[]): Promise<Row[]> {
  try {
    return (await pool.query(sql, values) as unknown as { rows: Row[] }).rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    for (const code of ATLAS_NEWS_ERROR_CODES) {
      if (message.includes(`ATLAS_NEWS_${code}`)) throw new AtlasNewsError(code);
    }
    throw error;
  }
}

const iso = (value: unknown) => value === null || value === undefined ? null
  : (value instanceof Date ? value : new Date(String(value))).toISOString();

/** The news tables in PostgreSQL, through migration 0043's functions: one store per role's connection. */
export class PostgresAtlasNewsStore implements AtlasNewsStagingStore, AtlasNewsReviewStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async stage(item: AtlasNewsStageInput, at: string): Promise<AtlasNewsStaged> {
    checkStageInput(item, at);
    const [row] = await call<{ news_public_id: string; staged_card_sha256: string; already_staged: boolean }>(this.pool,
      `SELECT news_public_id, staged_card_sha256, already_staged FROM ${this.schema}.stage_atlas_news_card($1::jsonb, $2::timestamptz)`,
      [JSON.stringify(item), at]);
    return { number: row!.news_public_id, cardSha256: row!.staged_card_sha256, alreadyStaged: row!.already_staged };
  }

  async commitDay(commit: AtlasNewsDayCommit, at: string, deadline: string): Promise<AtlasNewsCommitOutcome> {
    checkCommit(commit, at, deadline);
    const [row] = await call<{ outcome: AtlasNewsCommitOutcome }>(this.pool,
      `SELECT ${this.schema}.commit_atlas_news_day($1::jsonb, $2::timestamptz, $3::timestamptz) AS outcome`,
      [JSON.stringify(commit), at, deadline]);
    return row!.outcome;
  }

  async withdraw(target: string, reason: string, at: string): Promise<Array<{ number: string; state: AtlasNewsItemState }>> {
    return (await call<{ news_public_id: string; item_state: AtlasNewsItemState }>(this.pool,
      `SELECT news_public_id, item_state FROM ${this.schema}.withdraw_atlas_news_items($1::text, $2::text, $3::timestamptz)`,
      [target, reason, at])).map((row) => ({ number: row.news_public_id, state: row.item_state }));
  }

  async inspectDay(day: string, at: string): Promise<{ day: AtlasNewsDayRecord | null; items: AtlasNewsItemSummary[] }> {
    const result = await this.inspect({ day }, at) as { day: AtlasNewsDayRecord | null; items: AtlasNewsItemSummary[] };
    return {
      day: result.day === null ? null : { ...result.day, committedAt: iso(result.day.committedAt)! },
      items: result.items.map((item) => ({ ...item, stagedAt: iso(item.stagedAt)! })),
    };
  }

  async inspectBefore(day: string, at: string): Promise<AtlasNewsBase | null> {
    return (await this.inspect({ before: day }, at) as { latest: AtlasNewsBase | null }).latest;
  }

  async inspectNumbers(numbers: readonly string[], at: string): Promise<AtlasNewsItem[]> {
    const result = await this.inspect({ numbers }, at) as { items: AtlasNewsItem[] };
    return result.items.map((item) => ({ ...item, stagedAt: iso(item.stagedAt)!,
      receiptIssuedAt: iso(item.receiptIssuedAt)! }));
  }

  private async inspect(request: Record<string, unknown>, at: string): Promise<unknown> {
    const [row] = await call<{ result: unknown }>(this.pool,
      `SELECT ${this.schema}.inspect_atlas_news($1::jsonb, $2::timestamptz) AS result`, [JSON.stringify(request), at]);
    return row!.result;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
