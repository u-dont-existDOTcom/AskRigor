import type { AtlasPagePlacement, AtlasPageReport, AtlasPageSource } from "@askrigor/evidence-repository";

import { HEALTH, healthPath, type AtlasCategory, type AtlasSubcategory } from "./health-tree.js";
import { allShown, byStrength, oncePerFinding, type ShownFinding } from "./page-data.js";
import { differenceRange } from "../difference-range.js";
import { findingList, findingPath, html, outOf100, page, unreviewedOnly, type AtlasPageReader } from "./pages.js";
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
  /** The page's first section: the problem at a glance (owner, 3 Nov: GPT's scorecard, "make that prominent"). */
  glance: AtlasGlance;
}

/**
 * One row of a page at a glance, in the shape of the practitioner scorecard: what it is, its result with the
 * comparison it was measured against, its follow-up, and its limit. Built from a finding's declared fields alone, so
 * every language reads alike: a two-group result whose 95% range leaves out no difference (difference-range.ts) is a
 * controlled result, encouraging when the option did better on that outcome and failed when it did worse; a finding
 * declared a harm, or no effect, goes with what failed or harmed.
 */
export interface GlanceRow {
  publicationNumber: string;
  claim: string;
  kind: "controlled" | "harm" | "no_effect";
  result: string | null;
  comparison: string | null;
  followUp: string | null;
  sure: string | null;
  appliesTo: string | null;
}

export interface AtlasGlance {
  encouraging: GlanceRow[];
  failed: GlanceRow[];
  reports: { count: number; worked: number; didNot: number };
}

const SURE_WORDS = { high: "Highly sure", moderate: "Moderately sure", low: "A little sure", very_low: "Very unsure" } as const;

export function glanceOf(findings: readonly ShownFinding[], reports: readonly AtlasPageReport[]): AtlasGlance {
  const encouraging: Array<GlanceRow & { size: number }> = [];
  const failed: GlanceRow[] = [];
  for (const finding of findings) {
    const base = { publicationNumber: finding.publicationNumber, claim: finding.claim,
      sure: finding.certainty === null ? null : SURE_WORDS[finding.certainty], appliesTo: finding.appliesTo };
    let placed = false;
    for (const entry of finding.numbers) {
      const range = differenceRange({ option_events: entry.optionEvents, option_total: entry.optionTotal,
        comparator_events: entry.comparatorEvents, comparator_total: entry.comparatorTotal });
      if (!range.clear) continue;
      const better = entry.better === "more" ? range.difference > 0 : range.difference < 0;
      const row: GlanceRow = { ...base, kind: "controlled",
        result: `${entry.outcome}: ${outOf100(entry.optionEvents / entry.optionTotal)} out of 100 with ${entry.option} ` +
          `(${entry.optionEvents} of ${entry.optionTotal}) against ${outOf100(entry.comparatorEvents / entry.comparatorTotal)} ` +
          `out of 100 (${entry.comparatorEvents} of ${entry.comparatorTotal})`,
        comparison: entry.comparator, followUp: entry.followUp };
      if (better) encouraging.push({ ...row, size: Math.abs(range.difference) });
      else failed.push(row);
      placed = true;
      break;
    }
    if (placed) continue;
    if (finding.kind === "harm" || finding.direction === "harm") {
      failed.push({ ...base, kind: "harm", result: null, comparison: null, followUp: null });
    } else if (finding.direction === "no_effect") {
      failed.push({ ...base, kind: "no_effect", result: null, comparison: null, followUp: null });
    }
  }
  encouraging.sort((left, right) => right.size - left.size);
  return {
    encouraging: encouraging.map(({ size: _size, ...row }) => row),
    failed,
    reports: { count: reports.length, worked: reports.reduce((sum, report) => sum + report.answers.worked, 0),
      didNot: reports.reduce((sum, report) => sum + report.answers.didNot, 0) },
  };
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
  return { category: { key: HEALTH.key, label: HEALTH.label }, subcategory, findings, reports,
    glance: glanceOf(findings, reports) };
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
${glanceSection(model.glance)}
${model.findings.length === 0 && model.reports.length === 0 ? html`<p>Nothing is here yet.</p>` : ""}
${model.reports.length === 0 ? "" : html`<h2>People’s reports</h2>
<p class="meta">Each is one person’s experience in their words, checked by an AI, with the research around it.</p>
<ul class="report-list">${model.reports.map((report) => html`<li><a href="${reportPath(report.publicId)}">${report.text.tried} for ${report.text.problem}</a> <span class="meta">(${report.answers.worked} worked for them too, ${report.answers.didNot} didn’t)</span></li>`)}</ul>
`}${model.findings.length === 0 ? "" : html`<h2>Findings</h2>
<p>Checked findings come first, then the stronger claims.</p>
${findingList(model.findings)}`}
<p><a href="${SHARE_PATH}">Share what worked for you</a></p>` });
}

const KIND_LINES = { controlled: "A controlled comparison", harm: "A harm", no_effect: "No effect found" } as const;

function glanceRow(row: GlanceRow) {
  const parts = [
    ...(row.result === null ? [] : [html`${row.result}`]),
    ...(row.comparison === null ? [] : [html`Compared with ${row.comparison}`]),
    ...(row.followUp === null ? [] : [html`Followed for ${row.followUp}`]),
    ...(row.sure === null ? [] : [html`${row.sure}`]),
    ...(row.appliesTo === null ? [] : [html`For ${row.appliesTo}`]),
  ];
  return html`<li><p><span class="badge">${KIND_LINES[row.kind]}</span> <a href="${findingPath(row.publicationNumber)}">${row.claim}</a></p>
${parts.length === 0 ? "" : html`<p class="meta">${parts.map((part, index) => index === 0 ? part : html` · ${part}`)}</p>`}</li>`;
}

/** The problem at a glance: encouraging results first, then what failed or harmed, then people's reports. */
function glanceSection(glance: AtlasGlance) {
  if (glance.encouraging.length === 0 && glance.failed.length === 0 && glance.reports.count === 0) return "";
  return html`<section class="glance" aria-labelledby="at-a-glance"><h2 id="at-a-glance">At a glance</h2>
<p class="meta">Results with a clear difference between two groups, each with what it was compared with, how long it was followed and how sure AskRigor is; then what failed or harmed.</p>
<h3>Encouraging results</h3>
${glance.encouraging.length === 0 ? html`<p>None with a clear difference yet.</p>`
    : html`<ul class="glance-list">${glance.encouraging.map(glanceRow)}</ul>`}
<h3>What failed or harmed</h3>
${glance.failed.length === 0 ? html`<p>Nothing yet.</p>` : html`<ul class="glance-list">${glance.failed.map(glanceRow)}</ul>`}
${glance.reports.count === 0 ? "" : html`<p>People’s reports here: ${glance.reports.count}. ${glance.reports.worked} ${glance.reports.worked === 1 ? "person said" : "people said"} one worked for them too; ${glance.reports.didNot} said it didn’t.</p>`}
</section>
`;
}

