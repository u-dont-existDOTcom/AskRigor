import type { Pool } from "pg";

import { assertSafeAtlasSchema, atlasPool, type PostgresAtlasStoreOptions } from "./atlas-findings.js";

// Owner answer 229a (plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 1): where each Atlas
// item sits in the categories, as migration 0024 stores it. The tree is the application's; a placement holds only its
// keys, which the review checks against the tree before it writes. Nothing here is about a person.

/** The most placements one call sets, as migration 0024 takes them. */
export const ATLAS_PLACEMENTS_PER_CALL = 200;

const ITEM_NUMBER = /^[PFR]-[1-9][0-9]{3,}$/u;
const KEY = /^[a-z][a-z0-9-]{0,59}$/u;

export interface AtlasPlacement {
  /** A publication (P-), an accepted finding (F-) or a report (R-). */
  itemNumber: string;
  categoryKey: string;
  subcategoryKey: string;
  placedAt: string;
}

/** A change: both keys set an item's place, both null take it out of the tree. */
export interface AtlasPlacementChange {
  itemNumber: string;
  categoryKey: string | null;
  subcategoryKey: string | null;
}

export class AtlasPlacementError extends Error {
  constructor() {
    super("ATLAS_PLACEMENT_INPUT_INVALID");
  }
}

/** The review role's two placement functions. */
export interface AtlasPlacementStore {
  /** How many placements it set or removed. */
  setPlacements(changes: readonly AtlasPlacementChange[], at: string): Promise<number>;
  listPlacements(): Promise<AtlasPlacement[]>;
}

function checkChanges(changes: readonly AtlasPlacementChange[], at: string): void {
  const valid = Array.isArray(changes) && changes.length >= 1 && changes.length <= ATLAS_PLACEMENTS_PER_CALL &&
    new Set(changes.map(({ itemNumber }) => itemNumber)).size === changes.length &&
    changes.every(({ itemNumber, categoryKey, subcategoryKey }) => ITEM_NUMBER.test(itemNumber) &&
      ((categoryKey === null && subcategoryKey === null) ||
        (typeof categoryKey === "string" && KEY.test(categoryKey) && typeof subcategoryKey === "string" &&
          KEY.test(subcategoryKey)))) &&
    Number.isFinite(Date.parse(at));
  if (!valid) throw new AtlasPlacementError();
}

const byItem = (left: AtlasPlacement, right: AtlasPlacement) =>
  left.itemNumber < right.itemNumber ? -1 : left.itemNumber > right.itemNumber ? 1 : 0;

/** Placements in memory, with migration 0024's semantics. */
export class InMemoryAtlasPlacements implements AtlasPlacementStore {
  private readonly rows = new Map<string, AtlasPlacement>();

  async setPlacements(changes: readonly AtlasPlacementChange[], at: string): Promise<number> {
    checkChanges(changes, at);
    let changed = 0;
    for (const { itemNumber, categoryKey, subcategoryKey } of changes) {
      if (categoryKey === null || subcategoryKey === null) {
        if (this.rows.delete(itemNumber)) changed += 1;
      } else {
        this.rows.set(itemNumber, { itemNumber, categoryKey, subcategoryKey, placedAt: new Date(at).toISOString() });
        changed += 1;
      }
    }
    return changed;
  }

  async listPlacements(): Promise<AtlasPlacement[]> {
    return [...this.rows.values()].map((row) => ({ ...row })).sort(byItem);
  }
}

interface PlacementRow {
  placement_item: string;
  placement_category: string;
  placement_subcategory: string;
  placement_placed_at: Date | string;
}

const isoOf = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();

/** The placements in PostgreSQL, through the review role's two functions. */
export class PostgresAtlasPlacementStore implements AtlasPlacementStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresAtlasStoreOptions) {
    this.schema = assertSafeAtlasSchema(options.schema ?? "living_evidence");
    this.pool = atlasPool(options);
  }

  async setPlacements(changes: readonly AtlasPlacementChange[], at: string): Promise<number> {
    checkChanges(changes, at);
    try {
      const { rows } = await this.pool.query<{ changed: number }>(
        `SELECT ${this.schema}.set_atlas_placements($1::jsonb, $2::timestamptz) AS changed`,
        [JSON.stringify(changes.map(({ itemNumber, categoryKey, subcategoryKey }) =>
          ({ item: itemNumber, category: categoryKey, subcategory: subcategoryKey }))), at]);
      return rows[0]!.changed;
    } catch (error) {
      if (error instanceof Error && error.message.includes("ATLAS_PLACEMENT_INPUT_INVALID")) throw new AtlasPlacementError();
      throw error;
    }
  }

  async listPlacements(): Promise<AtlasPlacement[]> {
    const { rows } = await this.pool.query<PlacementRow>(
      `SELECT placement_item, placement_category, placement_subcategory, placement_placed_at
         FROM ${this.schema}.inspect_atlas_placements()`);
    return rows.map((row) => ({ itemNumber: row.placement_item, categoryKey: row.placement_category,
      subcategoryKey: row.placement_subcategory, placedAt: isoOf(row.placement_placed_at) }));
  }
}

/** The pages' read of the placements, in the reader's snapshot: the same rows, without the review's functions. */
export const ATLAS_PLACEMENTS_PAGE_SQL = (schema: string) =>
  `SELECT item_number, category_key, subcategory_key, placed_at FROM ${assertSafeAtlasSchema(schema)}.atlas_placements
    ORDER BY item_number`;
