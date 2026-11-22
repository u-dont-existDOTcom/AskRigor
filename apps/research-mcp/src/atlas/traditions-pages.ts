import type { AtlasPageSource, AtlasTraditionDisagreement, AtlasTraditionRow } from "@askrigor/evidence-repository";
import { allShown, byStrength, type ShownFinding } from "./page-data.js";
import { html, page, findingPath, outOf100, unreviewedOnly, traditionLines, type AtlasPageReader } from "./pages.js";
import { rowPassesPageGuard } from "./page-guard.js";
import { ATLAS_TRADITIONS, traditionsPath, traditionSectionOf, type AtlasTraditionSection } from "./traditions-tree.js";
import { traditionLabelsOf } from "./tradition-text.js";
import { SHARE_PATH } from "./report-pages.js";

export interface TraditionEntry { finding: ShownFinding; label: AtlasTraditionRow }
export interface AtlasTraditionsModel { sections: Array<AtlasTraditionSection & { count: number }> }
export interface AtlasTraditionModel {
  section: AtlasTraditionSection; entries: TraditionEntry[];
  disagreements: Array<AtlasTraditionDisagreement & { tcm: ShownFinding; ccm: ShownFinding }>;
}
async function shownTraditions(source: AtlasPageSource) {
  return source.read(async (reads) => {
    const labels = await reads.listTraditions?.() ?? { labels: [], disagreements: [] };
    const shown: ShownFinding[] = [];
    for await (const finding of allShown(reads)) shown.push(finding);
    // Deduplicate after labeling: a P-number label on another publication of the same F-number still counts.
    const identity = (finding: ShownFinding) => finding.status.kind === "unreviewed"
      ? finding.publicationNumber : finding.status.atlasNumber;
    const seen = new Set<string>();
    const entries: TraditionEntry[] = [];
    for (const finding of shown) for (const label of traditionLabelsOf(finding, labels.labels)) {
      const key = `${identity(finding)}:${label.section}`;
      if (!seen.has(key)) { seen.add(key); entries.push({ finding, label }); }
    }
    const byNumber = new Map<string, string>();
    for (const finding of shown) {
      byNumber.set(finding.publicationNumber, identity(finding));
      byNumber.set(identity(finding), identity(finding));
    }
    const disagreements: AtlasTraditionModel["disagreements"] = [];
    for (const row of labels.disagreements) {
      const tcm = entries.find((entry) => entry.label.section === "tcm" &&
        identity(entry.finding) === byNumber.get(row.tcm_item))?.finding;
      const ccm = entries.find((entry) => entry.label.section === "ccm" &&
        identity(entry.finding) === byNumber.get(row.ccm_item))?.finding;
      if (tcm !== undefined && ccm !== undefined && rowPassesPageGuard(row)) disagreements.push({ ...row, tcm, ccm });
    }
    return { entries, disagreements };
  });
}
export async function loadAtlasTraditions(source: AtlasPageSource): Promise<AtlasTraditionsModel> {
  const { entries } = await shownTraditions(source);
  return { sections: ATLAS_TRADITIONS.map((section) => ({ ...section,
    count: entries.filter(({ label }) => label.section === section.key).length })) };
}
export async function loadAtlasTradition(source: AtlasPageSource, key: string): Promise<AtlasTraditionModel | undefined> {
  const section = traditionSectionOf(key);
  if (section === undefined) return undefined;
  const { entries, disagreements } = await shownTraditions(source);
  return { section, entries: entries.filter(({ label }) => label.section === key).sort((a, b) =>
    Number(b.label.quick_answer_misses) - Number(a.label.quick_answer_misses) || byStrength(a.finding, b.finding) ||
    Date.parse(b.finding.publishedAt) - Date.parse(a.finding.publishedAt)),
  disagreements: key === "tcm" || key === "ccm" ? disagreements : [] };
}
export function renderAtlasTraditions(model: AtlasTraditionsModel, reader?: AtlasPageReader): string {
  return page({ path: traditionsPath(), title: "Traditions | AskRigor Atlas", current: "traditions", reader,
    description: "What traditional medicine systems offer, and what modern evidence supports, corrects or has not tested.",
    body: html`<h1>Traditions</h1>
<p>What these systems offer, and what modern evidence supports, corrects or has not tested.</p>
<ul class="category-list">${model.sections.map((section) => html`<li><a href="${traditionsPath(section.key)}">${section.label}</a> <span class="meta">(${section.count === 1 ? "1 item" : `${section.count} items`})</span><p>${section.description}</p></li>`)}</ul>` });
}
function entryCard({ finding, label }: TraditionEntry) {
  const number = finding.numbers[0];
  return html`<li class="finding${finding.kind === "harm" || finding.direction === "harm" ? " tradition-harm" : ""}">
<p class="finding-claim"><a href="${findingPath(finding.publicationNumber)}">${finding.claim}</a></p>
${number === undefined ? "" : html`<p>${number.outcome}: ${outOf100(number.optionEvents / number.optionTotal)} out of 100 with ${number.option}, against ${outOf100(number.comparatorEvents / number.comparatorTotal)} out of 100 with ${number.comparator}, over ${number.followUp}.</p>`}
${traditionLines(label)}
${label.quick_answer_misses ? html`<p class="badge">A quick AI answer misses this</p>` : ""}
${finding.status.kind === "unreviewed" ? html`<p class="meta">Not checked by supervisors yet</p>` : ""}
</li>`;
}
export function renderAtlasTradition(model: AtlasTraditionModel, reader?: AtlasPageReader): string {
  const list = (key: AtlasTraditionRow["list"], heading: string) => {
    const entries = model.entries.filter(({ label }) => label.list === key);
    return html`<section><h2>${heading}</h2>${entries.length === 0 ? html`<p>Nothing here yet.</p>`
      : html`<ul class="finding-list">${entries.map(entryCard)}</ul>`}</section>`;
  };
  return page({ path: traditionsPath(model.section.key), title: `${model.section.label} | AskRigor Atlas`,
    current: "traditions", reader, description: model.section.description,
    noindex: unreviewedOnly(model.entries.map(({ finding }) => finding)) ||
      model.entries.some(({ finding }) => finding.personClaims?.noindex === true),
    body: html`<p class="breadcrumbs"><a href="${traditionsPath()}">Traditions</a></p>
<h1>${model.section.label}</h1><p>${model.section.description}</p>
<section class="notice"><h2>People’s reports</h2><p>Tried something from ${model.section.label}? Tell us what happened.</p><p><a href="${SHARE_PATH}">Share your experience</a></p></section>
${list("useful", "Most useful findings")}
${list("correction", "Most important corrections from modern science")}
${list("untested", "Untested")}
${model.section.key !== "tcm" && model.section.key !== "ccm" ? "" : html`<section><h2>Where TCM and CCM disagree</h2>
${model.disagreements.length === 0 ? html`<p>No disagreements listed yet.</p>` : html`<ul>${model.disagreements.map((row) => html`<li>${row.line} <a href="${findingPath(row.tcm.publicationNumber)}">TCM: ${row.tcm.claim}</a> · <a href="${findingPath(row.ccm.publicationNumber)}">CCM: ${row.ccm.claim}</a></li>`)}</ul>`}</section>`}` });
}
