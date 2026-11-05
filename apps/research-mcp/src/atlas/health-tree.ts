/**
 * The Atlas's categories (owner answer 229a, 3 Nov 2026: "All the health things should be in Health category and
 * whatever applicable subcategories"; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section 1).
 * Health holds every health item, each in one subcategory named as on the 30 Oct channel-registry list, so the Atlas,
 * the registry and the news check share one tree. Another field gets a category of its own when its first item
 * arrives. Where an item sits is data (a placement the review sets with place_items), not code.
 */

export interface AtlasSubcategory {
  /** The page's path segment, such as colds-flu-and-infections. */
  key: string;
  label: string;
}

export interface AtlasCategory {
  key: string;
  label: string;
  subcategories: readonly AtlasSubcategory[];
}

const subcategory = (key: string, label: string): AtlasSubcategory => Object.freeze({ key, label });

export const HEALTH: AtlasCategory = Object.freeze({
  key: "health",
  label: "Health",
  subcategories: Object.freeze([
    subcategory("colds-flu-and-infections", "Colds, flu and infections"),
    subcategory("dizziness-balance-and-ears", "Dizziness, balance and ears"),
    subcategory("neck-and-back-pain", "Neck and back pain"),
    subcategory("joints-muscles-and-pain", "Joints, muscles and pain"),
    subcategory("diet-and-weight", "Diet and weight"),
    subcategory("blood-sugar", "Blood sugar"),
    subcategory("heart-and-blood-pressure", "Heart and blood pressure"),
    subcategory("sleep", "Sleep"),
    subcategory("mental-health-and-stress", "Mental health and stress"),
    subcategory("gut-health", "Gut health"),
    subcategory("womens-health", "Women’s health"),
    subcategory("mens-health", "Men’s health"),
    subcategory("strength-and-fitness", "Strength and fitness"),
    subcategory("supplements", "Supplements"),
    subcategory("long-term-illnesses", "Long-term illnesses"),
    subcategory("skin-hair-and-nails", "Skin, hair and nails"),
    subcategory("eyes", "Eyes"),
    subcategory("brain-and-memory", "Brain and memory"),
    subcategory("bladder-and-kidneys", "Bladder and kidneys"),
    subcategory("hospital-care", "Hospital care"),
    subcategory("toxins-and-detox", "Toxins and detox"),
    subcategory("home-and-environment", "Home and environment"),
  ]),
});

/** Every category the Atlas has; Health is the first and, for now, the only one. */
export const ATLAS_CATEGORIES: readonly AtlasCategory[] = Object.freeze([HEALTH]);

export const CATEGORY_KEY = /^[a-z][a-z0-9-]{0,59}$/u;

export const healthPath = (subcategoryKey?: string) =>
  subcategoryKey === undefined ? "/atlas/health" : `/atlas/health/${subcategoryKey}`;

export function categoryOf(key: string): AtlasCategory | undefined {
  return ATLAS_CATEGORIES.find((category) => category.key === key);
}

export function subcategoryOf(categoryKey: string, subcategoryKey: string): AtlasSubcategory | undefined {
  return categoryOf(categoryKey)?.subcategories.find((entry) => entry.key === subcategoryKey);
}
