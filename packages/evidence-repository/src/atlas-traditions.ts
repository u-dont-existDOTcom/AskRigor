import type { Pool } from "pg";
import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";

export const ATLAS_MODERN_CHECKS = ["supports", "corrects", "contradicts", "mixed", "too_little_evidence", "not_tested_as_used"] as const;
export const ATLAS_TRADITION_LISTS = ["useful", "correction", "untested"] as const;
export interface AtlasTraditionLabel {
  section: string;
  tradition: string;
  region?: string;
  preparation?: string;
  modern_check: typeof ATLAS_MODERN_CHECKS[number];
  match: string;
  list: typeof ATLAS_TRADITION_LISTS[number];
  quick_answer_misses: boolean;
}
export interface AtlasTraditionChange { item: string; labels: AtlasTraditionLabel[] }
export interface AtlasTraditionRow extends AtlasTraditionLabel { item: string; labeledAt: string }
export interface AtlasTraditionDisagreement { tcm_item: string; ccm_item: string; line: string }
export interface AtlasTraditions { labels: AtlasTraditionRow[]; disagreements: AtlasTraditionDisagreement[] }
export interface AtlasTraditionStore {
  /** Replaces every label of each named item. An empty labels list removes its labels. Omitted disagreements stay. */
  setTraditions(changes: readonly AtlasTraditionChange[], disagreements: readonly AtlasTraditionDisagreement[] | undefined,
    at: string): Promise<number>;
  listTraditions(): Promise<AtlasTraditions>;
}
export class AtlasTraditionError extends Error { constructor() { super("ATLAS_TRADITION_INPUT_INVALID"); } }
const ITEM = /^[PF]-[1-9][0-9]{3,}$/u;
const LABEL_KEYS = new Set(["section", "tradition", "region", "preparation", "modern_check", "match", "list", "quick_answer_misses"]);
const KEY = /^[a-z][a-z0-9-]{0,59}$/u;
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 &&
  Array.from(value).length <= max;
function validLabel(label: AtlasTraditionLabel): boolean {
  return Object.keys(label).every((key) => LABEL_KEYS.has(key)) && KEY.test(label.section) &&
    text(label.tradition, 160) && (label.region === undefined || text(label.region, 80)) &&
    (label.preparation === undefined || text(label.preparation, 120)) && text(label.match, 120) &&
    ATLAS_MODERN_CHECKS.includes(label.modern_check) && ATLAS_TRADITION_LISTS.includes(label.list) &&
    typeof label.quick_answer_misses === "boolean";
}
function validDisagreement(row: AtlasTraditionDisagreement): boolean {
  return Object.keys(row).every((key) => ["tcm_item", "ccm_item", "line"].includes(key)) &&
    ITEM.test(row.tcm_item) && ITEM.test(row.ccm_item) && text(row.line, 199) && !/[\r\n]/u.test(row.line);
}
function check(changes: readonly AtlasTraditionChange[], disagreements: readonly AtlasTraditionDisagreement[] | undefined,
  at: string) {
  if (!Array.isArray(changes) || changes.length > 200 || (changes.length === 0 && disagreements === undefined) ||
    !Number.isFinite(Date.parse(at)) || new Set(changes.map((row) => row.item)).size !== changes.length ||
    !changes.every((row) => ITEM.test(row.item) && Array.isArray(row.labels) && row.labels.length <= 200 &&
      new Set(row.labels.map((label: AtlasTraditionLabel) => label.section)).size === row.labels.length &&
      row.labels.every(validLabel)) ||
    (disagreements !== undefined && (!Array.isArray(disagreements) || disagreements.length > 200 ||
      new Set(disagreements.map((row) => `${row.tcm_item}:${row.ccm_item}`)).size !== disagreements.length ||
      !disagreements.every(validDisagreement)))) {
    throw new AtlasTraditionError();
  }
}
export class InMemoryAtlasTraditions implements AtlasTraditionStore {
  private rows = new Map<string, AtlasTraditionRow[]>();
  private disagreements: AtlasTraditionDisagreement[] = [];
  async setTraditions(changes: readonly AtlasTraditionChange[], disagreements: readonly AtlasTraditionDisagreement[] | undefined,
    at: string): Promise<number> {
    check(changes, disagreements, at);
    for (const { item, labels } of changes) {
      if (labels.length === 0) this.rows.delete(item);
      else this.rows.set(item, labels.map((label) => ({ ...label, item, labeledAt: new Date(at).toISOString() })));
    }
    if (disagreements !== undefined) this.disagreements = disagreements.map((row) => ({ ...row }));
    return changes.length;
  }
  async listTraditions(): Promise<AtlasTraditions> {
    return { labels: [...this.rows.values()].flat().map((row) => ({ ...row })).sort((a, b) =>
      a.item.localeCompare(b.item) || a.section.localeCompare(b.section)),
    disagreements: this.disagreements.map((row) => ({ ...row })).sort((a, b) =>
      a.tcm_item.localeCompare(b.tcm_item) || a.ccm_item.localeCompare(b.ccm_item)) };
  }
}
export class PostgresAtlasTraditionStore implements AtlasTraditionStore {
  readonly schema: string;
  private readonly pool: Pool;
  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }
  async setTraditions(changes: readonly AtlasTraditionChange[], disagreements: readonly AtlasTraditionDisagreement[] | undefined,
    at: string): Promise<number> {
    check(changes, disagreements, at);
    try {
      const { rows } = await this.pool.query<{ changed: number }>(
        `SELECT ${this.schema}.set_atlas_traditions($1::jsonb, $2::jsonb, $3::timestamptz) AS changed`,
        [JSON.stringify(changes), disagreements === undefined ? null : JSON.stringify(disagreements), at]);
      return rows[0]!.changed;
    } catch (error) {
      if (error instanceof Error && error.message.includes("ATLAS_TRADITION_INPUT_INVALID")) throw new AtlasTraditionError();
      throw error;
    }
  }
  async listTraditions(): Promise<AtlasTraditions> {
    const { rows } = await this.pool.query<{ traditions: AtlasTraditions }>(
      `SELECT ${this.schema}.inspect_atlas_traditions() AS traditions`);
    return rows[0]!.traditions;
  }
}
/** One statement reads both tables in the page's read-only snapshot. */
export const ATLAS_TRADITIONS_PAGE_SQL = `SELECT jsonb_build_object(
  'labels', coalesce((SELECT jsonb_agg(label || jsonb_build_object('item', item_number, 'labeledAt', labeled_at)
    ORDER BY item_number, section_key) FROM atlas_tradition_labels), '[]'::jsonb),
  'disagreements', coalesce((SELECT jsonb_agg(jsonb_build_object('tcm_item', tcm_item, 'ccm_item', ccm_item, 'line', line)
    ORDER BY tcm_item, ccm_item) FROM atlas_tradition_disagreements), '[]'::jsonb)) AS traditions`;
