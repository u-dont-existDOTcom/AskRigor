import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";

// The owner, 3 Nov 2026, on GPT's practitioner scorecard: "make that prominent" (plan
// docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 4). A problem's rows at a glance beside the
// ones computed from findings, as migration 0027 stores them: proposed privately, shown only on the owner's yes for
// each, withdrawn for good. A row naming a person holds published outcomes only.

export const ATLAS_GLANCE_CLASSES = ["controlled", "practitioner", "programme", "lead", "failed"] as const;
export type AtlasGlanceClass = typeof ATLAS_GLANCE_CLASSES[number];
export const ATLAS_GLANCE_STATES = ["proposed", "shown", "withdrawn"] as const;
export type AtlasGlanceState = typeof ATLAS_GLANCE_STATES[number];
export const ATLAS_GLANCE_LIMITS = { what: 300, result: 800, comparison: 300, followUp: 200, limits: 800, source: 300 } as const;
export const ATLAS_GLANCE_SOURCES_MAX = 10;

export interface AtlasGlanceRowInput {
  categoryKey: string;
  subcategoryKey: string;
  rowClass: AtlasGlanceClass;
  what: string;
  result: string;
  comparison: string | null;
  followUp: string | null;
  limits: string;
  /** Each a study identifier (PMID, PMCID, DOI, NCT) or an https address, as the application checks them. */
  sources: readonly string[];
  namesAPerson: boolean;
}

export interface AtlasGlanceRow extends AtlasGlanceRowInput {
  publicId: string;
  state: AtlasGlanceState;
  proposedAt: string;
  shownAt: string | null;
}

export class AtlasGlanceError extends Error {
  constructor(readonly code: "INPUT_INVALID" | "WITHDRAWN") {
    super(`ATLAS_GLANCE_${code}`);
  }
}

/** The review role's three glance functions. */
export interface AtlasGlanceStore {
  propose(row: AtlasGlanceRowInput, at: string): Promise<string>;
  /** Null when no row has that id. */
  setState(publicId: string, state: "shown" | "withdrawn", at: string): Promise<AtlasGlanceState | null>;
  inspect(state: AtlasGlanceState, after: number | undefined, limit: number): Promise<AtlasGlanceRow[]>;
}

const KEY = /^[a-z][a-z0-9-]{0,59}$/u;
const ROW_ID = /^G-[1-9][0-9]{3,}$/u;
const within = (value: unknown, max: number) =>
  typeof value === "string" && value === value.trim() && value.length >= 1 && [...value].length <= max;

function checkRow(row: AtlasGlanceRowInput, at: string): void {
  const valid = KEY.test(row.categoryKey) && KEY.test(row.subcategoryKey) &&
    (ATLAS_GLANCE_CLASSES as readonly string[]).includes(row.rowClass) &&
    within(row.what, ATLAS_GLANCE_LIMITS.what) && within(row.result, ATLAS_GLANCE_LIMITS.result) &&
    (row.comparison === null || within(row.comparison, ATLAS_GLANCE_LIMITS.comparison)) &&
    (row.followUp === null || within(row.followUp, ATLAS_GLANCE_LIMITS.followUp)) &&
    within(row.limits, ATLAS_GLANCE_LIMITS.limits) && Array.isArray(row.sources) &&
    row.sources.length >= 1 && row.sources.length <= ATLAS_GLANCE_SOURCES_MAX &&
    row.sources.every((source) => within(source, ATLAS_GLANCE_LIMITS.source)) &&
    typeof row.namesAPerson === "boolean" && Number.isFinite(Date.parse(at));
  if (!valid) throw new AtlasGlanceError("INPUT_INVALID");
}

const glanceId = (number: number) => `G-${number}`;

/** Glance rows in memory, with migration 0027's semantics. */
export class InMemoryAtlasGlanceRows implements AtlasGlanceStore {
  private readonly rows = new Map<number, AtlasGlanceRow>();
  private next = 1001;

  async propose(row: AtlasGlanceRowInput, at: string): Promise<string> {
    checkRow(row, at);
    const number = this.next++;
    this.rows.set(number, { ...row, sources: [...row.sources], publicId: glanceId(number), state: "proposed",
      proposedAt: new Date(at).toISOString(), shownAt: null });
    return glanceId(number);
  }

  async setState(publicId: string, state: "shown" | "withdrawn", at: string): Promise<AtlasGlanceState | null> {
    if (!ROW_ID.test(publicId) || (state !== "shown" && state !== "withdrawn") || !Number.isFinite(Date.parse(at))) {
      throw new AtlasGlanceError("INPUT_INVALID");
    }
    const row = this.rows.get(Number(publicId.slice(2)));
    if (row === undefined) return null;
    if (row.state === "withdrawn") throw new AtlasGlanceError("WITHDRAWN");
    row.state = state;
    row.shownAt = state === "shown" ? row.shownAt ?? new Date(at).toISOString() : null;
    return row.state;
  }

  async inspect(state: AtlasGlanceState, after: number | undefined, limit: number): Promise<AtlasGlanceRow[]> {
    if (!(ATLAS_GLANCE_STATES as readonly string[]).includes(state) || !Number.isSafeInteger(limit) || limit < 1 ||
      limit > 50) throw new AtlasGlanceError("INPUT_INVALID");
    return [...this.rows.entries()].filter(([number, row]) => row.state === state && (after === undefined || number > after))
      .sort(([left], [right]) => left - right).slice(0, limit).map(([, row]) => structuredClone(row));
  }

  /** The shown rows, for the in-memory pages. */
  shownRows(): AtlasGlanceRow[] {
    return [...this.rows.values()].filter((row) => row.state === "shown").map((row) => structuredClone(row));
  }
}

interface GlanceRowRecord {
  row_number: string | number;
  category_key: string;
  subcategory_key: string;
  row_class: AtlasGlanceClass;
  what: string;
  result: string;
  comparison: string | null;
  follow_up: string | null;
  limits: string;
  sources: string[];
  names_a_person: boolean;
  state: AtlasGlanceState;
  proposed_at: Date | string;
  shown_at: Date | string | null;
}

const iso = (value: Date | string | null) => value === null ? null : (value instanceof Date ? value : new Date(value)).toISOString();

/** A stored row as the review and the pages read it. */
export function atlasGlanceRowOf(record: GlanceRowRecord): AtlasGlanceRow {
  return {
    publicId: glanceId(Number(record.row_number)), categoryKey: record.category_key, subcategoryKey: record.subcategory_key,
    rowClass: record.row_class, what: record.what, result: record.result, comparison: record.comparison,
    followUp: record.follow_up, limits: record.limits, sources: record.sources, namesAPerson: record.names_a_person,
    state: record.state, proposedAt: iso(record.proposed_at)!, shownAt: iso(record.shown_at),
  };
}

async function call<Row extends object>(pool: Pool, sql: string, values: unknown[]): Promise<Row[]> {
  try {
    return (await pool.query(sql, values) as unknown as { rows: Row[] }).rows;
  } catch (error) {
    if (error instanceof Error && error.message.includes("ATLAS_GLANCE_INPUT_INVALID")) throw new AtlasGlanceError("INPUT_INVALID");
    if (error instanceof Error && error.message.includes("ATLAS_GLANCE_WITHDRAWN")) throw new AtlasGlanceError("WITHDRAWN");
    throw error;
  }
}

/** The glance rows in PostgreSQL, through the review role's three functions. */
export class PostgresAtlasGlanceStore implements AtlasGlanceStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async propose(row: AtlasGlanceRowInput, at: string): Promise<string> {
    checkRow(row, at);
    const [result] = await call<{ row_public_id: string }>(this.pool,
      `SELECT row_public_id FROM ${this.schema}.propose_atlas_glance_row($1::jsonb, $2::timestamptz)`,
      [JSON.stringify({ category: row.categoryKey, subcategory: row.subcategoryKey, rowClass: row.rowClass, what: row.what,
        result: row.result, comparison: row.comparison, followUp: row.followUp, limits: row.limits, sources: row.sources,
        namesAPerson: row.namesAPerson }), at]);
    return result!.row_public_id;
  }

  async setState(publicId: string, state: "shown" | "withdrawn", at: string): Promise<AtlasGlanceState | null> {
    const rows = await call<{ row_state: AtlasGlanceState }>(this.pool,
      `SELECT row_state FROM ${this.schema}.set_atlas_glance_row_state($1::text, $2::text, $3::timestamptz)`,
      [publicId, state, at]);
    return rows[0]?.row_state ?? null;
  }

  async inspect(state: AtlasGlanceState, after: number | undefined, limit: number): Promise<AtlasGlanceRow[]> {
    return (await call<GlanceRowRecord>(this.pool,
      `SELECT * FROM ${this.schema}.inspect_atlas_glance_rows($1::text, $2::bigint, $3::integer)`,
      [state, after ?? null, limit])).map(atlasGlanceRowOf);
  }
}

/** The pages' read of the shown rows, in the reader's snapshot. */
export const ATLAS_GLANCE_PAGE_SQL = `SELECT row_number, category_key, subcategory_key, row_class, what, result, comparison,
  follow_up, limits, sources, names_a_person, state, proposed_at, shown_at
  FROM atlas_glance_rows WHERE state = 'shown' ORDER BY row_number`;
export type { GlanceRowRecord as AtlasGlanceRowRecord };
