import {
  ATLAS_PLACEMENTS_PER_CALL,
  AtlasPlacementError,
  type AtlasPlacementStore,
  type AtlasPublicationStore,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { HEALTH } from "./health-tree.js";

/**
 * Where Atlas items sit in the categories (owner answer 229a, 3 Nov 2026: "All the health things should be in Health
 * category and whatever applicable subcategories"; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md,
 * section 1), on review_research_contribution as runtime actions (owner answer 189a: the published tool list stays
 * fixed). place_items sets each item's subcategory under Health, or takes it out of the tree with a null subcategory;
 * list_unplaced lists the shown publications that sit in none yet. The owner's 229a decided the rule, so placing needs
 * no confirmation per item; it publishes nothing and hides nothing.
 */

export const ATLAS_PLACEMENT_ACTIONS = ["place_items", "list_unplaced"] as const;
export type AtlasPlacementAction = typeof ATLAS_PLACEMENT_ACTIONS[number];
export const ATLAS_PLACEMENT_OUTCOMES = ["items_placed", "unplaced_listed"] as const;
export type AtlasPlacementOutcome = typeof ATLAS_PLACEMENT_OUTCOMES[number];

/** How many unplaced publications one page of list_unplaced lists. */
export const UNPLACED_PER_PAGE = 50;
const INSPECT_PAGE = 100;

const ITEM = /^[PFR]-[1-9][0-9]{3,}$/u;
const SUBCATEGORY_KEYS = HEALTH.subcategories.map(({ key }) => key) as [string, ...string[]];

/** later_inputs.placements on place_items. */
export const placementsInputSchema = z.array(z.object({
  item: z.string().trim().toUpperCase().regex(ITEM)
    .describe("A publication (P-1003), an accepted finding (F-1007) or a report (R-1001)."),
  subcategory: z.enum(SUBCATEGORY_KEYS).nullable()
    .describe("Its subcategory under Health, by key, such as mens-health; null takes it out of the tree."),
}).strict()).min(1).max(ATLAS_PLACEMENTS_PER_CALL);

export const atlasPlacementsSchema = z.object({
  changed: z.number().int().nonnegative().nullable(),
  subcategories: z.array(z.object({ key: z.string(), label: z.string() }).strict()),
  unplaced: z.array(z.object({
    publication: z.string().regex(/^P-[1-9][0-9]{3,}$/u),
    atlasNumber: z.string().regex(/^F-[1-9][0-9]{3,}$/u).nullable(),
    state: z.string(),
    claim: z.string().nullable().describe("The finding's claim, at most 200 characters of it."),
  }).strict()).max(UNPLACED_PER_PAGE),
  nextCursor: z.string().nullable(),
}).strict();
export type AtlasPlacements = z.infer<typeof atlasPlacementsSchema>;

export interface AtlasPlacementRequest {
  action: AtlasPlacementAction;
  placements?: z.infer<typeof placementsInputSchema>;
  cursor?: string;
}

export interface AtlasPlacementResult {
  ok: boolean;
  text: string;
  outcome?: AtlasPlacementOutcome;
  error?: { code: "invalid_request"; message: string };
  placements?: AtlasPlacements;
}

const clip = (text: string, length: number) => text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
const subcategories = () => HEALTH.subcategories.map(({ key, label }) => ({ key, label }));
const labelOf = (key: string) => HEALTH.subcategories.find((entry) => entry.key === key)?.label ?? key;

export class AtlasPlacementReview {
  constructor(private readonly deps: { placements: AtlasPlacementStore; publications?: AtlasPublicationStore;
    now: () => Date }) {}

  async run(request: AtlasPlacementRequest): Promise<AtlasPlacementResult> {
    return request.action === "place_items" ? await this.place(request.placements) : await this.unplaced(request.cursor);
  }

  private async place(placements: AtlasPlacementRequest["placements"]): Promise<AtlasPlacementResult> {
    const parsed = placementsInputSchema.safeParse(placements);
    if (!parsed.success) {
      return { ok: false, text: "place_items needs later_inputs.placements: 1 to 200 entries of {item, subcategory}, " +
        "each item once, each subcategory one of Health's keys (or null).", error: { code: "invalid_request",
        message: "later_inputs.placements is missing or not valid." } };
    }
    let changed: number;
    try {
      changed = await this.deps.placements.setPlacements(parsed.data.map(({ item, subcategory }) => ({
        itemNumber: item,
        categoryKey: subcategory === null ? null : HEALTH.key,
        subcategoryKey: subcategory,
      })), this.deps.now().toISOString());
    } catch (error) {
      if (error instanceof AtlasPlacementError) {
        return { ok: false, text: "The placements were not valid; nothing was changed.",
          error: { code: "invalid_request", message: "later_inputs.placements is not valid." } };
      }
      throw error;
    }
    const lines = parsed.data.map(({ item, subcategory }) =>
      subcategory === null ? `${item}: out of the tree` : `${item}: Health > ${labelOf(subcategory)}`);
    return {
      ok: true,
      outcome: "items_placed",
      text: `${changed} placement(s) set or removed. ${lines.join("; ")}.`,
      placements: { changed, subcategories: subcategories(), unplaced: [], nextCursor: null },
    };
  }

  private async unplaced(cursor: string | undefined): Promise<AtlasPlacementResult> {
    const before = cursor === undefined ? undefined : /^u([1-9][0-9]{3,})$/u.exec(cursor)?.[1];
    if (cursor !== undefined && before === undefined) {
      return { ok: false, text: "That cursor is not one list_unplaced returned.",
        error: { code: "invalid_request", message: "cursor is not valid." } };
    }
    if (this.deps.publications === undefined) {
      return { ok: false, text: "list_unplaced needs the Atlas publications, which are not configured here.",
        error: { code: "invalid_request", message: "The publications are not configured." } };
    }
    // As on the pages, a placement counts only where it names a subcategory the tree has.
    const placed = new Set((await this.deps.placements.listPlacements())
      .filter(({ categoryKey, subcategoryKey }) => categoryKey === HEALTH.key && SUBCATEGORY_KEYS.includes(subcategoryKey))
      .map(({ itemNumber }) => itemNumber));
    const unplaced: AtlasPlacements["unplaced"] = [];
    let below = before === undefined ? undefined : Number(before);
    let nextCursor: string | null = null;
    for (;;) {
      const page = await this.deps.publications.inspect({ states: ["unreviewed", "accepted", "edited"],
        limit: INSPECT_PAGE, ...(below === undefined ? {} : { before: below }) });
      for (const view of page) {
        if (view.state === "unreviewed" && view.published === null) continue;
        if (placed.has(view.publicationNumber) || (view.atlasNumber !== null && placed.has(view.atlasNumber))) continue;
        if (unplaced.length === UNPLACED_PER_PAGE) {
          nextCursor = `u${unplaced.at(-1)!.publication.slice(2)}`;
          break;
        }
        unplaced.push({ publication: view.publicationNumber, atlasNumber: view.atlasNumber, state: view.state,
          claim: view.published === null ? null : clip(view.published.claim, 200) });
      }
      if (nextCursor !== null || page.length < INSPECT_PAGE) break;
      below = Number(page.at(-1)!.publicationNumber.slice(2));
    }
    return {
      ok: true,
      outcome: "unplaced_listed",
      text: unplaced.length === 0 ? "Every shown publication sits in a subcategory."
        : `${unplaced.length} shown publication(s) sit in no subcategory yet${nextCursor === null ? "" : " (more with " +
          "the cursor)"}. Place them with place_items and later_inputs.placements: [{item, subcategory}], the ` +
          "subcategory one of the keys listed in placements.subcategories.",
      placements: { changed: null, subcategories: subcategories(), unplaced, nextCursor },
    };
  }
}
