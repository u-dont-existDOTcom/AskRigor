import type { AtlasPagePlacement, AtlasPageSource } from "@askrigor/evidence-repository";

import { HEALTH, healthPath, type AtlasCategory, type AtlasSubcategory } from "./health-tree.js";
import { allShown, byStrength, oncePerFinding, type ShownFinding } from "./page-data.js";
import { findingList, html, page, unreviewedOnly, type AtlasPageReader } from "./pages.js";

/**
 * The Health pages (owner answer 229a; plan docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, section
 * 1): /atlas/health lists the subcategories with how many items each holds, and /atlas/health/<key> lists a
 * subcategory's items, checked first, then the stronger claims, then the newest. An item shows under the subcategory
 * its placement names: a publication by its P number, or an accepted finding by its F number.
 */

export interface AtlasHealthModel {
  category: { key: string; label: string };
  subcategories: Array<AtlasSubcategory & { count: number }>;
  /** Shown items that sit in no subcategory yet. */
  unplaced: number;
}

export interface AtlasSubcategoryModel {
  category: { key: string; label: string };
  subcategory: AtlasSubcategory;
  findings: ShownFinding[];
}

/** The subcategory a shown finding sits in, by its publication's number first, then its accepted finding's. */
function placementOf(finding: ShownFinding, placements: ReadonlyMap<string, AtlasPagePlacement>, category: AtlasCategory):
  string | undefined {
  const numbers = [finding.publicationNumber, ...(finding.status.kind === "unreviewed" ? [] : [finding.status.atlasNumber])];
  for (const number of numbers) {
    const placement = placements.get(number);
    if (placement !== undefined && placement.categoryKey === category.key &&
      category.subcategories.some(({ key }) => key === placement.subcategoryKey)) {
      return placement.subcategoryKey;
    }
  }
  return undefined;
}

async function placedFindings(source: AtlasPageSource, category: AtlasCategory):
  Promise<Array<{ finding: ShownFinding; subcategoryKey: string | undefined }>> {
  return await source.read(async (reads) => {
    const placements = new Map((await reads.listPlacements()).map((placement) => [placement.itemNumber, placement]));
    const shown: ShownFinding[] = [];
    for await (const finding of allShown(reads)) shown.push(finding);
    return oncePerFinding(shown).map((finding) => ({ finding, subcategoryKey: placementOf(finding, placements, category) }));
  });
}

export async function loadAtlasHealth(source: AtlasPageSource): Promise<AtlasHealthModel> {
  const placed = await placedFindings(source, HEALTH);
  const counts = new Map<string, number>();
  let unplaced = 0;
  for (const { subcategoryKey } of placed) {
    if (subcategoryKey === undefined) unplaced += 1;
    else counts.set(subcategoryKey, (counts.get(subcategoryKey) ?? 0) + 1);
  }
  return {
    category: { key: HEALTH.key, label: HEALTH.label },
    subcategories: HEALTH.subcategories.map((entry) => ({ ...entry, count: counts.get(entry.key) ?? 0 })),
    unplaced,
  };
}

/** Undefined for a key the tree does not have; a subcategory with nothing in it yet still has its page. */
export async function loadAtlasSubcategory(source: AtlasPageSource, subcategoryKey: string):
  Promise<AtlasSubcategoryModel | undefined> {
  const subcategory = HEALTH.subcategories.find(({ key }) => key === subcategoryKey);
  if (subcategory === undefined) return undefined;
  const order = (left: ShownFinding, right: ShownFinding) =>
    Number(left.status.kind === "unreviewed") - Number(right.status.kind === "unreviewed") ||
    byStrength(left, right) ||
    Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  const findings = (await placedFindings(source, HEALTH))
    .filter((entry) => entry.subcategoryKey === subcategoryKey)
    .map(({ finding }) => finding)
    .sort(order);
  return { category: { key: HEALTH.key, label: HEALTH.label }, subcategory, findings };
}

const itemsWord = (count: number) => count === 1 ? "1 item" : `${count} items`;

export function renderAtlasHealth(model: AtlasHealthModel, reader?: AtlasPageReader): string {
  return page({ path: healthPath(), title: `${model.category.label} | AskRigor Atlas`, current: "health", reader,
    description: "Every health finding in the AskRigor Atlas, each under one subcategory.",
    body: html`<h1>${model.category.label}</h1>
<p>Every health item on the Atlas sits under one of these, by the problem it is about.</p>
<ul class="category-list">${model.subcategories.map((entry) => entry.count === 0
      ? html`<li>${entry.label} <span class="meta">(nothing yet)</span></li>`
      : html`<li><a href="${healthPath(entry.key)}">${entry.label}</a> <span class="meta">(${itemsWord(entry.count)})</span></li>`)}</ul>
${model.unplaced === 0 ? "" : html`<p class="meta">${itemsWord(model.unplaced)} ${model.unplaced === 1 ? "isn’t" : "aren’t"} placed yet. <a href="/atlas/findings">Browse all findings</a>.</p>
`}` });
}

export function renderAtlasSubcategory(model: AtlasSubcategoryModel, reader?: AtlasPageReader): string {
  return page({ path: healthPath(model.subcategory.key), title: `${model.subcategory.label} | AskRigor Atlas`,
    current: "health", reader, noindex: unreviewedOnly(model.findings),
    description: `${model.subcategory.label}: findings in the AskRigor Atlas.`,
    body: html`<p class="meta"><a href="${healthPath()}">${model.category.label}</a></p>
<h1>${model.subcategory.label}</h1>
${model.findings.length === 0 ? html`<p>Nothing is here yet.</p>`
      : html`<p>Checked findings come first, then the stronger claims.</p>
${findingList(model.findings)}`}` });
}
