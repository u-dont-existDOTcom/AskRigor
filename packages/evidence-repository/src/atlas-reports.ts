import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";
import type { InMemoryAtlasPlacements } from "./atlas-placements.js";

// Owner answer 229a (plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, sections 2 and 3): people's
// own reports of what they tried and what happened, as migration 0025 stores them. A report is known by its participant
// key only, published under the name its author chose for it or none, and moved once by the review's check: published
// (with an AI warning when the check wrote one), held for the owner, or refused (its text deleted). Its author can take
// it down at any time. "It worked for me too" and "it didn't" are one answer per signed-in person, shown as totals.

export const ATLAS_REPORT_DOORS = ["form", "ai_app"] as const;
export type AtlasReportDoor = typeof ATLAS_REPORT_DOORS[number];
export const ATLAS_REPORT_STATES = ["received", "published", "held", "refused"] as const;
export type AtlasReportState = typeof ATLAS_REPORT_STATES[number];
export const ATLAS_REPORT_VERDICTS = ["publish", "publish_with_warning", "hold", "refuse"] as const;
export type AtlasReportVerdict = typeof ATLAS_REPORT_VERDICTS[number];
export const ATLAS_REPORT_HOLD_REASONS = ["not_safe", "unsure", "too_far_out"] as const;
export type AtlasReportHoldReason = typeof ATLAS_REPORT_HOLD_REASONS[number];
export const ATLAS_REPORT_REFUSE_REASONS = ["promotion", "spam", "not_a_report"] as const;
export type AtlasReportRefuseReason = typeof ATLAS_REPORT_REFUSE_REASONS[number];
export const ATLAS_REPORT_ANSWERS = ["worked", "did_not"] as const;
export type AtlasReportAnswer = typeof ATLAS_REPORT_ANSWERS[number];

/** Each text field's longest length, as migration 0025's constraints have them; null fields may be left out. */
export const ATLAS_REPORT_FIELD_LIMITS = {
  displayName: 40, problem: 300, tried: 300, dose: 300, howUsed: 1_000, howLong: 300, whatHappened: 3_000,
  howLongLasted: 300, sideEffects: 2_000, otherChanges: 2_000,
} as const;
export type AtlasReportTextField = keyof typeof ATLAS_REPORT_FIELD_LIMITS;
export const ATLAS_REPORT_REQUIRED_FIELDS = ["problem", "tried", "whatHappened"] as const;
export const ATLAS_REPORT_RESEARCH_MAX_BYTES = 65_536;
export const ATLAS_REPORT_AI_WARNING_MAX = 800;
/** A day's reports per author, and how many may wait for the check at once. */
export const ATLAS_REPORTS_PER_DAY = 5;
export const ATLAS_REPORTS_WAITING_MAX = 20;
export const ATLAS_REPORTS_PER_INSPECT = 20;

export type AtlasReportText = Partial<Record<AtlasReportTextField, string | null>>;

export interface AtlasReportInput extends AtlasReportText {
  /** The research around it (section 3), already checked by the application; null when it comes with none. */
  research?: Record<string, unknown> | null;
}

/** A report as the review sees it: everything but its author's key. */
export interface AtlasReportView {
  publicId: string;
  door: AtlasReportDoor;
  text: Record<AtlasReportTextField, string | null>;
  research: Record<string, unknown> | null;
  state: AtlasReportState;
  aiWarning: string | null;
  holdReason: AtlasReportHoldReason | null;
  refuseReason: AtlasReportRefuseReason | null;
  receivedAt: string;
  checkedAt: string | null;
  answers: { worked: number; didNot: number };
}

export interface AtlasReportDecision {
  publicId: string;
  verdict: AtlasReportVerdict;
  /** With publish_with_warning only. */
  aiWarning: string | null;
  /** With hold (a hold reason) or refuse (a refuse reason) only. */
  reason: AtlasReportHoldReason | AtlasReportRefuseReason | null;
  /** The check's research for a report that came with none; null keeps what it has. */
  research: Record<string, unknown> | null;
  /** With publish and publish_with_warning only: where it sits. */
  categoryKey: string | null;
  subcategoryKey: string | null;
  at: string;
}

export type AtlasReportErrorCode = "INPUT_INVALID" | "LIMIT" | "NOT_SHOWN" | "OWN" | "ALREADY_DECIDED";

export class AtlasReportError extends Error {
  constructor(readonly code: AtlasReportErrorCode) {
    super(`ATLAS_REPORT_${code}`);
  }
}

/** The public runtime's four report functions. */
export interface AtlasReportStore {
  /** Returns the new report's id, R-<n>. */
  submitReport(participantKey: string, door: AtlasReportDoor, report: AtlasReportInput, at: string): Promise<string>;
  /** False when its author has no report with that id. */
  takeDown(participantKey: string, publicId: string): Promise<boolean>;
  /** A null answer takes it back; returns the report's totals after it. */
  setAnswer(participantKey: string, publicId: string, answer: AtlasReportAnswer | null, at: string):
    Promise<{ worked: number; didNot: number }>;
  forgetReports(participantKey: string): Promise<{ reports: number; answers: number }>;
}

/** The review role's two report functions. */
export interface AtlasReportReviewStore {
  inspectReports(state: AtlasReportState, after: number | undefined, limit: number): Promise<AtlasReportView[]>;
  /** Null when no report has that id. */
  decideReport(decision: AtlasReportDecision): Promise<AtlasReportState | null>;
}

/** A published report as its page shows it, and a signed-in viewer's own answer when one is given. */
export interface AtlasPageReport {
  publicId: string;
  displayName: string | null;
  text: Record<AtlasReportTextField, string | null>;
  research: Record<string, unknown> | null;
  aiWarning: string | null;
  publishedAt: string;
  answers: { worked: number; didNot: number };
  viewer: { own: boolean; answer: AtlasReportAnswer | null } | null;
}

/** One of a signed-in reader's own reports, in any state, for their account page. */
export interface AtlasOwnReport {
  publicId: string;
  problem: string | null;
  tried: string | null;
  state: AtlasReportState;
  holdReason: AtlasReportHoldReason | null;
  refuseReason: AtlasReportRefuseReason | null;
  receivedAt: string;
}

// Checks shared by memory and PostgreSQL ---------------------------------------------------------------------------

const PARTICIPANT_KEY = /^[a-f0-9]{64}$/u;
const REPORT_ID = /^R-[1-9][0-9]{3,}$/u;
const KEY = /^[a-z][a-z0-9-]{0,59}$/u;
const TEXT_FIELDS = Object.keys(ATLAS_REPORT_FIELD_LIMITS) as AtlasReportTextField[];
const invalid = () => new AtlasReportError("INPUT_INVALID");
const validAt = (at: string) => typeof at === "string" && Number.isFinite(Date.parse(at));
const trimmedWithin = (value: unknown, max: number) =>
  typeof value === "string" && value === value.trim() && value.length >= 1 && [...value].length <= max;

export const atlasReportId = (number: number) => `R-${number}`;
export const atlasReportNumber = (publicId: string) => Number(publicId.slice(2));

function checkKey(participantKey: string): void {
  if (typeof participantKey !== "string" || !PARTICIPANT_KEY.test(participantKey)) throw invalid();
}

function checkId(publicId: string): void {
  if (typeof publicId !== "string" || !REPORT_ID.test(publicId)) throw invalid();
}

function checkReport(report: AtlasReportInput): void {
  if (report === null || typeof report !== "object") throw invalid();
  for (const field of Object.keys(report)) {
    if (field !== "research" && !(TEXT_FIELDS as string[]).includes(field)) throw invalid();
  }
  for (const field of TEXT_FIELDS) {
    const value = report[field];
    if (value === undefined || value === null) {
      if ((ATLAS_REPORT_REQUIRED_FIELDS as readonly string[]).includes(field)) throw invalid();
      continue;
    }
    if (!trimmedWithin(value, ATLAS_REPORT_FIELD_LIMITS[field])) throw invalid();
  }
  const research = report.research;
  if (research !== undefined && research !== null && (typeof research !== "object" || Array.isArray(research) ||
    new TextEncoder().encode(JSON.stringify(research)).length > ATLAS_REPORT_RESEARCH_MAX_BYTES)) throw invalid();
}

function checkDecision(decision: AtlasReportDecision): void {
  const { publicId, verdict, aiWarning, reason, research, categoryKey, subcategoryKey, at } = decision;
  checkId(publicId);
  const publishes = verdict === "publish" || verdict === "publish_with_warning";
  const valid = (ATLAS_REPORT_VERDICTS as readonly string[]).includes(verdict) &&
    (verdict === "publish_with_warning") === (aiWarning !== null) &&
    (aiWarning === null || trimmedWithin(aiWarning, ATLAS_REPORT_AI_WARNING_MAX)) &&
    (verdict !== "hold" || (ATLAS_REPORT_HOLD_REASONS as readonly unknown[]).includes(reason)) &&
    (verdict !== "refuse" || (ATLAS_REPORT_REFUSE_REASONS as readonly unknown[]).includes(reason)) &&
    (!publishes || reason === null) &&
    publishes === (categoryKey !== null && subcategoryKey !== null) &&
    (categoryKey === null || KEY.test(categoryKey)) && (subcategoryKey === null || KEY.test(subcategoryKey)) &&
    (research === null || (typeof research === "object" && !Array.isArray(research) &&
      new TextEncoder().encode(JSON.stringify(research)).length <= ATLAS_REPORT_RESEARCH_MAX_BYTES)) &&
    validAt(at);
  if (!valid) throw invalid();
}

function checkInspect(state: AtlasReportState, after: number | undefined, limit: number): void {
  if (!(ATLAS_REPORT_STATES as readonly string[]).includes(state) ||
    (after !== undefined && (!Number.isSafeInteger(after) || after < 0)) ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > ATLAS_REPORTS_PER_INSPECT) throw invalid();
}

const emptyText = (): Record<AtlasReportTextField, string | null> =>
  Object.fromEntries(TEXT_FIELDS.map((field) => [field, null])) as Record<AtlasReportTextField, string | null>;

// In memory ----------------------------------------------------------------------------------------------------------

interface ReportRow {
  number: number;
  participantKey: string;
  door: AtlasReportDoor;
  text: Record<AtlasReportTextField, string | null>;
  research: Record<string, unknown> | null;
  state: AtlasReportState;
  aiWarning: string | null;
  holdReason: AtlasReportHoldReason | null;
  refuseReason: AtlasReportRefuseReason | null;
  receivedAt: string;
  checkedAt: string | null;
  stateChangedAt: string;
}

/** Reports and answers in memory, with migration 0025's semantics, for tests and the hermetic scenarios. */
export class InMemoryAtlasReports implements AtlasReportStore, AtlasReportReviewStore {
  private readonly rows = new Map<number, ReportRow>();
  private readonly answers = new Map<number, Map<string, { answer: AtlasReportAnswer; at: string }>>();
  private next = 1001;

  /** Placements move with publishing, take-down and forgetting, as the SQL functions move them. */
  constructor(private readonly placements?: InMemoryAtlasPlacements) {}

  async submitReport(participantKey: string, door: AtlasReportDoor, report: AtlasReportInput, at: string): Promise<string> {
    checkKey(participantKey);
    if (!(ATLAS_REPORT_DOORS as readonly string[]).includes(door) || !validAt(at)) throw invalid();
    checkReport(report);
    const day = new Date(at).toISOString().slice(0, 10);
    const own = [...this.rows.values()].filter((row) => row.participantKey === participantKey);
    if (own.filter((row) => row.receivedAt.slice(0, 10) === day).length >= ATLAS_REPORTS_PER_DAY ||
      own.filter((row) => row.state === "received").length >= ATLAS_REPORTS_WAITING_MAX) {
      throw new AtlasReportError("LIMIT");
    }
    const number = this.next++;
    const text = emptyText();
    for (const field of TEXT_FIELDS) text[field] = report[field] ?? null;
    const when = new Date(at).toISOString();
    this.rows.set(number, { number, participantKey, door, text, research: report.research ?? null, state: "received",
      aiWarning: null, holdReason: null, refuseReason: null, receivedAt: when, checkedAt: null, stateChangedAt: when });
    return atlasReportId(number);
  }

  async takeDown(participantKey: string, publicId: string): Promise<boolean> {
    checkKey(participantKey);
    checkId(publicId);
    const row = this.rows.get(atlasReportNumber(publicId));
    if (row === undefined || row.participantKey !== participantKey) return false;
    this.rows.delete(row.number);
    this.answers.delete(row.number);
    await this.unplace(publicId);
    return true;
  }

  async setAnswer(participantKey: string, publicId: string, answer: AtlasReportAnswer | null, at: string):
    Promise<{ worked: number; didNot: number }> {
    checkKey(participantKey);
    checkId(publicId);
    if ((answer !== null && !(ATLAS_REPORT_ANSWERS as readonly string[]).includes(answer)) || !validAt(at)) throw invalid();
    const row = this.rows.get(atlasReportNumber(publicId));
    if (row === undefined || row.state !== "published") throw new AtlasReportError("NOT_SHOWN");
    if (row.participantKey === participantKey) throw new AtlasReportError("OWN");
    const answers = this.answers.get(row.number) ?? new Map();
    if (answer === null) answers.delete(participantKey);
    else answers.set(participantKey, { answer, at: new Date(at).toISOString() });
    this.answers.set(row.number, answers);
    return this.totals(row.number);
  }

  async forgetReports(participantKey: string): Promise<{ reports: number; answers: number }> {
    checkKey(participantKey);
    let reports = 0;
    for (const row of [...this.rows.values()]) {
      if (row.participantKey !== participantKey) continue;
      this.rows.delete(row.number);
      this.answers.delete(row.number);
      await this.unplace(atlasReportId(row.number));
      reports += 1;
    }
    let answers = 0;
    for (const given of this.answers.values()) if (given.delete(participantKey)) answers += 1;
    return { reports, answers };
  }

  async inspectReports(state: AtlasReportState, after: number | undefined, limit: number): Promise<AtlasReportView[]> {
    checkInspect(state, after, limit);
    return [...this.rows.values()]
      .filter((row) => row.state === state && (after === undefined || row.number > after))
      .sort((left, right) => left.number - right.number)
      .slice(0, limit)
      .map((row) => this.view(row));
  }

  async decideReport(decision: AtlasReportDecision): Promise<AtlasReportState | null> {
    checkDecision(decision);
    const row = this.rows.get(atlasReportNumber(decision.publicId));
    if (row === undefined) return null;
    if ((row.state !== "received" && row.state !== "held") || (row.state === "held" && decision.verdict === "hold")) {
      throw new AtlasReportError("ALREADY_DECIDED");
    }
    const at = new Date(decision.at).toISOString();
    row.checkedAt = at;
    row.stateChangedAt = at > row.stateChangedAt ? at : row.stateChangedAt;
    if (decision.verdict === "refuse") {
      Object.assign(row, { text: emptyText(), research: null, aiWarning: null, holdReason: null, state: "refused",
        refuseReason: decision.reason as AtlasReportRefuseReason });
      return row.state;
    }
    row.state = decision.verdict === "hold" ? "held" : "published";
    row.aiWarning = decision.verdict === "publish_with_warning" ? decision.aiWarning : null;
    row.holdReason = decision.verdict === "hold" ? decision.reason as AtlasReportHoldReason : null;
    if (decision.research !== null) row.research = decision.research;
    if (row.state === "published") {
      await this.placements?.setPlacements([{ itemNumber: decision.publicId, categoryKey: decision.categoryKey,
        subcategoryKey: decision.subcategoryKey }], at);
    }
    return row.state;
  }

  // The pages' reads (the reader's snapshot in PostgreSQL).

  async pageReport(publicId: string, viewerKey: string | null): Promise<AtlasPageReport | null> {
    const row = REPORT_ID.test(publicId) ? this.rows.get(atlasReportNumber(publicId)) : undefined;
    return row === undefined || row.state !== "published" ? null : this.pageView(row, viewerKey);
  }

  async publishedReports(): Promise<AtlasPageReport[]> {
    return [...this.rows.values()].filter((row) => row.state === "published")
      .sort((left, right) => right.number - left.number).map((row) => this.pageView(row, null));
  }

  async ownReports(participantKey: string): Promise<AtlasOwnReport[]> {
    return [...this.rows.values()].filter((row) => row.participantKey === participantKey)
      .sort((left, right) => right.number - left.number)
      .map((row) => ({ publicId: atlasReportId(row.number), problem: row.text.problem, tried: row.text.tried,
        state: row.state, holdReason: row.holdReason, refuseReason: row.refuseReason, receivedAt: row.receivedAt }));
  }

  private totals(number: number): { worked: number; didNot: number } {
    const given = [...(this.answers.get(number)?.values() ?? [])];
    return { worked: given.filter(({ answer }) => answer === "worked").length,
      didNot: given.filter(({ answer }) => answer === "did_not").length };
  }

  private view(row: ReportRow): AtlasReportView {
    return { publicId: atlasReportId(row.number), door: row.door, text: { ...row.text },
      research: row.research === null ? null : structuredClone(row.research), state: row.state, aiWarning: row.aiWarning,
      holdReason: row.holdReason, refuseReason: row.refuseReason, receivedAt: row.receivedAt, checkedAt: row.checkedAt,
      answers: this.totals(row.number) };
  }

  private pageView(row: ReportRow, viewerKey: string | null): AtlasPageReport {
    return { publicId: atlasReportId(row.number), displayName: row.text.displayName, text: { ...row.text },
      research: row.research === null ? null : structuredClone(row.research), aiWarning: row.aiWarning,
      publishedAt: row.checkedAt ?? row.stateChangedAt, answers: this.totals(row.number),
      viewer: viewerKey === null ? null : { own: row.participantKey === viewerKey,
        answer: this.answers.get(row.number)?.get(viewerKey)?.answer ?? null } };
  }

  private async unplace(publicId: string): Promise<void> {
    if (this.placements === undefined) return;
    if ((await this.placements.listPlacements()).some(({ itemNumber }) => itemNumber === publicId)) {
      await this.placements.setPlacements([{ itemNumber: publicId, categoryKey: null, subcategoryKey: null }],
        new Date().toISOString());
    }
  }
}

// PostgreSQL ---------------------------------------------------------------------------------------------------------

const ERROR_CODES: ReadonlyArray<readonly [string, AtlasReportErrorCode]> = [
  ["ATLAS_REPORT_INPUT_INVALID", "INPUT_INVALID"],
  ["ATLAS_REPORT_LIMIT", "LIMIT"],
  ["ATLAS_REPORT_NOT_SHOWN", "NOT_SHOWN"],
  ["ATLAS_REPORT_OWN", "OWN"],
  ["ATLAS_REPORT_ALREADY_DECIDED", "ALREADY_DECIDED"],
];

async function call<Row extends object>(pool: Pool, sql: string, values: unknown[]): Promise<Row[]> {
  try {
    return (await pool.query(sql, values) as unknown as { rows: Row[] }).rows;
  } catch (error) {
    const code = error instanceof Error ? ERROR_CODES.find(([message]) => error.message.includes(message))?.[1] : undefined;
    if (code !== undefined) throw new AtlasReportError(code);
    throw error;
  }
}

const iso = (value: Date | string | null) => value === null ? null : (value instanceof Date ? value : new Date(value)).toISOString();

const inputJson = (report: AtlasReportInput) => JSON.stringify(Object.fromEntries(
  [...TEXT_FIELDS.map((field) => [field, report[field] ?? null] as const), ["research", report.research ?? null] as const]));

/** The report functions of the public runtime's access role. */
export class PostgresAtlasReportStore implements AtlasReportStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async submitReport(participantKey: string, door: AtlasReportDoor, report: AtlasReportInput, at: string): Promise<string> {
    checkKey(participantKey);
    if (!(ATLAS_REPORT_DOORS as readonly string[]).includes(door) || !validAt(at)) throw invalid();
    checkReport(report);
    const [row] = await call<{ report_public_id: string }>(this.pool,
      `SELECT report_public_id FROM ${this.schema}.submit_atlas_report($1::text, $2::text, $3::jsonb, $4::timestamptz)`,
      [participantKey, door, inputJson(report), at]);
    return row!.report_public_id;
  }

  async takeDown(participantKey: string, publicId: string): Promise<boolean> {
    checkKey(participantKey);
    checkId(publicId);
    const [row] = await call<{ removed: boolean }>(this.pool,
      `SELECT ${this.schema}.take_down_atlas_report($1::text, $2::text) AS removed`, [participantKey, publicId]);
    return row!.removed === true;
  }

  async setAnswer(participantKey: string, publicId: string, answer: AtlasReportAnswer | null, at: string):
    Promise<{ worked: number; didNot: number }> {
    checkKey(participantKey);
    checkId(publicId);
    if ((answer !== null && !(ATLAS_REPORT_ANSWERS as readonly string[]).includes(answer)) || !validAt(at)) throw invalid();
    const [row] = await call<{ worked: string | number; did_not: string | number }>(this.pool,
      `SELECT worked, did_not FROM ${this.schema}.set_atlas_report_answer($1::text, $2::text, $3::text, $4::timestamptz)`,
      [participantKey, publicId, answer, at]);
    return { worked: Number(row!.worked), didNot: Number(row!.did_not) };
  }

  async forgetReports(participantKey: string): Promise<{ reports: number; answers: number }> {
    checkKey(participantKey);
    const [row] = await call<{ reports_deleted: string | number; answers_deleted: string | number }>(this.pool,
      `SELECT reports_deleted, answers_deleted FROM ${this.schema}.forget_atlas_reports($1::text)`, [participantKey]);
    return { reports: Number(row!.reports_deleted), answers: Number(row!.answers_deleted) };
  }
}

interface ReportViewRow {
  report_number: string | number;
  door: AtlasReportDoor;
  display_name: string | null;
  problem: string | null;
  tried: string | null;
  dose: string | null;
  how_used: string | null;
  how_long: string | null;
  what_happened: string | null;
  how_long_lasted: string | null;
  side_effects: string | null;
  other_changes: string | null;
  research: Record<string, unknown> | null;
  state: AtlasReportState;
  ai_warning: string | null;
  hold_reason: AtlasReportHoldReason | null;
  refuse_reason: AtlasReportRefuseReason | null;
  received_at: Date | string;
  checked_at: Date | string | null;
  answers_worked: string | number;
  answers_did_not: string | number;
}

export const ATLAS_REPORT_TEXT_COLUMNS: Record<AtlasReportTextField, string> = {
  displayName: "display_name", problem: "problem", tried: "tried", dose: "dose", howUsed: "how_used",
  howLong: "how_long", whatHappened: "what_happened", howLongLasted: "how_long_lasted", sideEffects: "side_effects",
  otherChanges: "other_changes",
};

export function atlasReportTextOf(row: Record<string, unknown>): Record<AtlasReportTextField, string | null> {
  return Object.fromEntries(TEXT_FIELDS.map((field) => {
    const value = row[ATLAS_REPORT_TEXT_COLUMNS[field]];
    return [field, typeof value === "string" ? value : null];
  })) as Record<AtlasReportTextField, string | null>;
}

/** The report functions of the review role. */
export class PostgresAtlasReportReviewStore implements AtlasReportReviewStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async inspectReports(state: AtlasReportState, after: number | undefined, limit: number): Promise<AtlasReportView[]> {
    checkInspect(state, after, limit);
    return (await call<ReportViewRow>(this.pool,
      `SELECT * FROM ${this.schema}.inspect_atlas_reports($1::text, $2::bigint, $3::integer)`,
      [state, after ?? null, limit])).map((row) => ({
      publicId: atlasReportId(Number(row.report_number)),
      door: row.door,
      text: atlasReportTextOf(row as unknown as Record<string, unknown>),
      research: row.research,
      state: row.state,
      aiWarning: row.ai_warning,
      holdReason: row.hold_reason,
      refuseReason: row.refuse_reason,
      receivedAt: iso(row.received_at)!,
      checkedAt: iso(row.checked_at),
      answers: { worked: Number(row.answers_worked), didNot: Number(row.answers_did_not) },
    }));
  }

  async decideReport(decision: AtlasReportDecision): Promise<AtlasReportState | null> {
    checkDecision(decision);
    const rows = await call<{ report_state: AtlasReportState }>(this.pool,
      `SELECT report_state FROM ${this.schema}.decide_atlas_report($1::text, $2::text, $3::text, $4::text, $5::jsonb,
         $6::text, $7::text, $8::timestamptz)`,
      [decision.publicId, decision.verdict, decision.aiWarning, decision.reason,
        decision.research === null ? null : JSON.stringify(decision.research), decision.categoryKey,
        decision.subcategoryKey, decision.at]);
    return rows[0]?.report_state ?? null;
  }
}
