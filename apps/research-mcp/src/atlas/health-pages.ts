import type { AtlasPagePlacement, AtlasPageReport, AtlasPageSource } from "@askrigor/evidence-repository";

import { HEALTH, healthPath, type AtlasCategory, type AtlasSubcategory } from "./health-tree.js";
import { allShown, byStrength, oncePerFinding, type ShownFinding } from "./page-data.js";
import { findingList, html, page, unreviewedOnly, type AtlasPageReader } from "./pages.js";
import { SHARE_PATH, reportPath } from "./report-pages.js";

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
  /** People's published reports placed here (owner answer 229a), newest first. */
  reports: AtlasPageReport[];
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

interface Placed {
  findings: Array<{ finding: ShownFinding; subcategoryKey: string | undefined }>;
  reports: Array<{ report: AtlasPageReport; subcategoryKey: string | undefined }>;
}

async function placedItems(source: AtlasPageSource, category: AtlasCategory): Promise<Placed> {
  return await source.read(async (reads) => {
    const placements = new Map((await reads.listPlacements()).map((placement) => [placement.itemNumber, placement]));
    const shown: ShownFinding[] = [];
    for await (const finding of allShown(reads)) shown.push(finding);
    const subcategoryOf = (number: string) => {
      const placement = placements.get(number);
      return placement !== undefined && placement.categoryKey === category.key &&
        category.subcategories.some(({ key }) => key === placement.subcategoryKey) ? placement.subcategoryKey : undefined;
    };
    return {
      findings: oncePerFinding(shown).map((finding) => ({ finding, subcategoryKey: placementOf(finding, placements, category) })),
      reports: (await reads.listReports()).map((report) => ({ report, subcategoryKey: subcategoryOf(report.publicId) })),
    };
  });
}

export async function loadAtlasHealth(source: AtlasPageSource): Promise<AtlasHealthModel> {
  const placed = await placedItems(source, HEALTH);
  const counts = new Map<string, number>();
  let unplaced = 0;
  for (const { subcategoryKey } of [...placed.findings, ...placed.reports]) {
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
  const placed = await placedItems(source, HEALTH);
  const findings = placed.findings
    .filter((entry) => entry.subcategoryKey === subcategoryKey)
    .map(({ finding }) => finding)
    .sort(order);
  const reports = placed.reports.filter((entry) => entry.subcategoryKey === subcategoryKey).map(({ report }) => report);
  return { category: { key: HEALTH.key, label: HEALTH.label }, subcategory, findings, reports };
}

const itemsWord = (count: number) => count === 1 ? "1 item" : `${count} items`;

export function renderAtlasHealth(model: AtlasHealthModel, reader?: AtlasPageReader): string {
  return page({ path: healthPath(), title: `${model.category.label} | AskRigor Atlas`, current: "health", reader,
    description: "Every health finding in the AskRigor Atlas, each under one subcategory.",
    body: html`<h1>${model.category.label}</h1>
<p>Every health item on the Atlas sits under one of these, by the problem it is about: checked findings, and people’s own reports with the research around them. <a href="${SHARE_PATH}">Share what worked for you</a>.</p>
<ul class="category-list">${model.subcategories.map((entry) => entry.count === 0
      ? html`<li>${entry.label} <span class="meta">(nothing yet)</span></li>`
      : html`<li><a href="${healthPath(entry.key)}">${entry.label}</a> <span class="meta">(${itemsWord(entry.count)})</span></li>`)}</ul>
${model.unplaced === 0 ? "" : html`<p class="meta">${itemsWord(model.unplaced)} ${model.unplaced === 1 ? "isn’t" : "aren’t"} placed yet. <a href="/atlas/findings">Browse all findings</a>.</p>
`}` });
}

export function renderAtlasSubcategory(model: AtlasSubcategoryModel, reader?: AtlasPageReader): string {
  return page({ path: healthPath(model.subcategory.key), title: `${model.subcategory.label} | AskRigor Atlas`,
    // Reports are checked by an AI only, so a page of them alone stays out of search engines too.
    current: "health", reader, noindex: unreviewedOnly(model.findings),
    description: `${model.subcategory.label}: findings in the AskRigor Atlas.`,
    body: html`<p class="meta"><a href="${healthPath()}">${model.category.label}</a></p>
<h1>${model.subcategory.label}</h1>
${model.findings.length === 0 && model.reports.length === 0 ? html`<p>Nothing is here yet.</p>` : ""}
${model.reports.length === 0 ? "" : html`<h2>People’s reports</h2>
<p class="meta">Each is one person’s experience in their words, checked by an AI, with the research around it.</p>
<ul class="report-list">${model.reports.map((report) => html`<li><a href="${reportPath(report.publicId)}">${report.text.tried} for ${report.text.problem}</a> <span class="meta">(${report.answers.worked} worked for them too, ${report.answers.didNot} didn’t)</span></li>`)}</ul>
`}${model.findings.length === 0 ? "" : html`<h2>Findings</h2>
<p>Checked findings come first, then the stronger claims.</p>
${findingList(model.findings)}`}
<p><a href="${SHARE_PATH}">Share what worked for you</a></p>` });
}
