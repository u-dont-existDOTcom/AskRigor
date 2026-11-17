import type {
  PublicDossierCopy,
  PublicDossierHistoryEntry,
  PublicDossierPageSource,
} from "@askrigor/evidence-repository";

import {
  dossierDisagreements,
  dossierPagePath,
  readPublicDossier,
  resultCompares,
  resultSizes,
  type PublicDossier,
  type PublicDossierFinding,
  type PublicDossierResult,
  type PublicDossierStudy,
} from "../findings/dossier-publication.js";
import {
  DOSSIER_ORDER_LINE,
  dossierRankItems,
  findingStudies,
  rankDossierFindings,
  studyPeople,
  type DossierEvidencePart,
  type DossierRankItem,
} from "./dossier-ranking.js";
import { NOT_CHECKED_LABEL } from "./page-data.js";
import { rowPassesPageGuard } from "./page-guard.js";
import { AI_LABEL, html, page, sourceLink, topicPath, type AtlasPageReader, type SafeHtml } from "./pages.js";
import { ATLAS_TOPIC_FAMILIES, atlasTopicFamily } from "./topic-families.js";

/**
 * AskRigor#477, stage 2 (owner answers 331a, 332a and 333a; the owner's note on 329: "the best possible visual
 * interface for people to click into further details at a glance and get a understanding quickly on main interesting
 * points"): research dossiers on the Atlas's pages, behind ASKRIGOR_PUBLIC_DOSSIERS=enabled.
 *
 * Layered: a topic page leads with its dossiers' main points at a glance, ranked by rule 333a (dossier-ranking.ts), each
 * a line that opens, with one click and no script, onto what it rests on: its studies with their sizes and how
 * AskRigor read them, its results with their figures, and what would change it. Then every finding by form (forms
 * apart, never treated as one another), where dossiers disagree, the dossiers themselves, and the related topics. A
 * dossier's own page (/atlas/dossiers/D-1001) adds what was checked and how deeply, the searches, every study and
 * result, people's reports apart (counted per thread, never as how often something happens), the open questions and
 * its versions. Every comparison carries its group sizes; every finding its kind of evidence. A dossier the owner has
 * not accepted is marked "Not checked by supervisors yet", its page is kept out of search engines, and its text out of
 * search snippets. Nothing about the person who asked, or where the research ran, is shown. The pages use the Atlas's
 * own page frame and a few plain classes (dossier-*), so a restyle changes the stylesheet alone.
 */

export const DOSSIER_GLANCE_COUNT = 8;
const SHOWN_READ = 500;

export interface ShownDossier {
  copy: PublicDossierCopy;
  dossier: PublicDossier;
}

export interface DossierRelatedTopic {
  key: string;
  label: string;
  /** declared by a dossier, sharing a study with this topic's dossiers, or in the same curated family. */
  why: "declared" | "shared_studies" | "family";
}

export interface DossierDisagreementView {
  form: string;
  left: { publicNumber: string; claim: string };
  right: { publicNumber: string; claim: string };
}

export interface DossierTopicModel {
  topicKey: string;
  name: string;
  otherNames: string[];
  dossiers: ShownDossier[];
  ranked: DossierRankItem[];
  forms: Array<{ form: string | null; findings: DossierRankItem[] }>;
  disagreements: DossierDisagreementView[];
  related: DossierRelatedTopic[];
}

export interface DossierPageModel {
  shown: ShownDossier;
  ranked: DossierRankItem[];
  forms: Array<{ form: string | null; findings: DossierRankItem[] }>;
  history: PublicDossierHistoryEntry[];
  disagreements: DossierDisagreementView[];
  related: DossierRelatedTopic[];
}

/** A shown copy whose payload reads as a public dossier and passes the pages' last check; else left out. */
function shownOf(copy: PublicDossierCopy): ShownDossier | undefined {
  const dossier = readPublicDossier(copy.payload);
  return dossier === undefined || dossier.topic.key !== copy.topicKey || !rowPassesPageGuard(dossier)
    ? undefined : { copy, dossier };
}

const identityKeys = (dossier: PublicDossier) => new Set(dossier.studies.flatMap((study) =>
  study.identifiers.map(({ scheme, value }) => `${scheme}:${value.toLowerCase()}`)));

function byForm(ranked: readonly DossierRankItem[], forms: readonly string[]): DossierTopicModel["forms"] {
  const groups = new Map<string, { form: string | null; findings: DossierRankItem[] }>();
  for (const form of forms) groups.set(form.toLocaleLowerCase("en"), { form, findings: [] });
  for (const item of ranked) {
    const key = item.finding.form?.toLocaleLowerCase("en") ?? "";
    const group = groups.get(key) ?? { form: item.finding.form ?? null, findings: [] };
    group.findings.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].filter(({ findings }) => findings.length > 0)
    .sort((left, right) => Number(left.form === null) - Number(right.form === null));
}

function disagreementsAmong(dossiers: readonly ShownDossier[]): DossierDisagreementView[] {
  const views: DossierDisagreementView[] = [];
  for (let left = 0; left < dossiers.length; left += 1) {
    for (let right = left + 1; right < dossiers.length; right += 1) {
      const a = dossiers[left]!;
      const b = dossiers[right]!;
      for (const found of dossierDisagreements(a.dossier, b.dossier)) {
        views.push({
          form: found.form,
          left: { publicNumber: a.copy.publicNumber, claim: a.dossier.findings.find(({ id }) => id === found.mine)!.claim },
          right: { publicNumber: b.copy.publicNumber, claim: b.dossier.findings.find(({ id }) => id === found.theirs)!.claim },
        });
      }
    }
  }
  return views.slice(0, 50);
}

/**
 * The topics a topic links: those its dossiers name, those whose dossiers share a study with them, and the curated
 * family it belongs to, each only where a page shows (a shown dossier, or a card topic the caller knows).
 */
async function relatedTopics(topicKey: string, own: readonly ShownDossier[], all: readonly ShownDossier[],
  cardTopicLabel: (key: string) => Promise<string | undefined>): Promise<DossierRelatedTopic[]> {
  const names = new Map<string, string>();
  for (const { dossier } of all) if (!names.has(dossier.topic.key)) names.set(dossier.topic.key, dossier.topic.name);
  const wanted = new Map<string, DossierRelatedTopic["why"]>();
  for (const { copy } of own) for (const key of copy.relatedTopicKeys) if (key !== topicKey) wanted.set(key, "declared");
  const ownIds = new Set(own.flatMap(({ dossier }) => [...identityKeys(dossier)]));
  for (const { dossier } of all) {
    if (dossier.topic.key === topicKey || wanted.has(dossier.topic.key)) continue;
    if ([...identityKeys(dossier)].some((key) => ownIds.has(key))) wanted.set(dossier.topic.key, "shared_studies");
  }
  const own_names = new Set([topicKey, ...own.flatMap(({ dossier }) => [...dossier.forms, ...dossier.topic.other_names])
    .map((name) => name.toLocaleLowerCase("en"))]);
  for (const family of ATLAS_TOPIC_FAMILIES) {
    if (family.key === topicKey || wanted.has(family.key)) continue;
    if (family.aliases.some((alias) => own_names.has(alias.toLocaleLowerCase("en")))) wanted.set(family.key, "family");
  }
  const related: DossierRelatedTopic[] = [];
  for (const [key, why] of wanted) {
    const label = names.get(key) ?? atlasTopicFamily(key)?.label ?? await cardTopicLabel(key);
    if (label !== undefined) related.push({ key, label, why });
  }
  return related.sort((left, right) => left.label.localeCompare(right.label, "en")).slice(0, 20);
}

/** A topic's shown dossiers, ranked; undefined when none shows. */
export async function loadDossierTopic(source: PublicDossierPageSource, topicKey: string,
  cardTopicLabel: (key: string) => Promise<string | undefined> = async () => undefined):
  Promise<DossierTopicModel | undefined> {
  const all = (await source.listShown({ limit: SHOWN_READ })).flatMap((copy) => shownOf(copy) ?? []);
  const dossiers = all.filter(({ copy }) => copy.topicKey === topicKey);
  if (dossiers.length === 0) return undefined;
  const ranked = rankDossierFindings(dossierRankItems(dossiers.map(({ copy, dossier }) =>
    ({ publicNumber: copy.publicNumber, dossier, shownAt: copy.shownAt, accepted: copy.accepted }))));
  const newest = dossiers[0]!.dossier;
  const forms = [...new Map(dossiers.flatMap(({ dossier }) => dossier.forms)
    .map((form) => [form.toLocaleLowerCase("en"), form])).values()];
  return {
    topicKey,
    name: dossiers.find(({ copy }) => copy.accepted)?.dossier.topic.name ?? newest.topic.name,
    otherNames: [...new Set(dossiers.flatMap(({ dossier }) => dossier.topic.other_names))].slice(0, 20),
    dossiers,
    ranked,
    forms: byForm(ranked, forms),
    disagreements: disagreementsAmong(dossiers),
    related: await relatedTopics(topicKey, dossiers, all, cardTopicLabel),
  };
}

/** One shown dossier's page model; undefined when it does not show. */
export async function loadDossierPage(source: PublicDossierPageSource, publicNumber: string,
  cardTopicLabel: (key: string) => Promise<string | undefined> = async () => undefined):
  Promise<DossierPageModel | undefined> {
  const all = (await source.listShown({ limit: SHOWN_READ })).flatMap((copy) => shownOf(copy) ?? []);
  const shown = all.find(({ copy }) => copy.publicNumber === publicNumber);
  if (shown === undefined) return undefined;
  const ranked = rankDossierFindings(dossierRankItems([{ publicNumber, dossier: shown.dossier,
    shownAt: shown.copy.shownAt, accepted: shown.copy.accepted }]));
  const onTopic = all.filter(({ copy }) => copy.topicKey === shown.copy.topicKey);
  return {
    shown,
    ranked,
    forms: byForm(ranked, shown.dossier.forms),
    history: await source.history([publicNumber]),
    disagreements: disagreementsAmong([shown, ...onTopic.filter((other) => other !== shown)])
      .filter(({ left, right }) => left.publicNumber === publicNumber || right.publicNumber === publicNumber),
    related: await relatedTopics(shown.copy.topicKey, [shown], all, cardTopicLabel),
  };
}

/** The topics with shown dossiers, for the topics list: key, name and how many findings they show. */
export async function loadDossierTopicList(source: PublicDossierPageSource):
  Promise<Array<{ key: string; label: string; count: number }>> {
  const topics = new Map<string, { key: string; label: string; count: number }>();
  for (const copy of await source.listShown({ limit: SHOWN_READ })) {
    const shown = shownOf(copy);
    if (shown === undefined) continue;
    const topic = topics.get(copy.topicKey) ?? { key: copy.topicKey, label: shown.dossier.topic.name, count: 0 };
    topic.count += shown.dossier.findings.length;
    topics.set(copy.topicKey, topic);
  }
  return [...topics.values()];
}

// Words ------------------------------------------------------------------------------------------------------------

const IMPORTANCE_WORDS = {
  decision_changing: "Could change a decision",
  important: "Important",
  context: "Background",
} as const;
const KIND_WORDS: Readonly<Record<string, string>> = {
  helps: "Helps", harms: "Harms", no_difference: "Measured: no difference", mixed: "Mixed results",
  not_known: "Not known", correction: "Corrects a common claim", overlooked_option: "An option quick answers leave out",
  tested_vs_sold: "What was tested and what is sold",
};
const CERTAINTY_WORDS: Readonly<Record<string, string>> = {
  high: "high certainty", moderate: "moderate certainty", low: "low certainty", very_low: "very low certainty",
};
const EVIDENCE_WORDS: Readonly<Record<string, [string, string]>> = {
  human_trial: ["human trial", "human trials"],
  review: ["review", "reviews"],
  human_observational: ["human observational study", "human observational studies"],
  case_report: ["case report", "case reports"],
  animal: ["animal study", "animal studies"],
  lab: ["lab study", "lab studies"],
  people_reports: ["forum thread of people's reports", "forum threads of people's reports"],
  searches: ["search that found nothing", "searches that found nothing"],
};
const NOT_IN_PEOPLE: ReadonlySet<string> = new Set(["animal", "lab"]);
const READ_WORDS: Readonly<Record<string, string>> = {
  full_text_audited: "Full text, with its methods audited by AskRigor",
  search_copy_audited: "Full text in a copy the AI found, with its methods audited by AskRigor",
  full_text_read: "Full text read; its methods weren’t audited",
  search_copy_read: "Full text read in a copy the AI found; its methods weren’t audited",
  abstract: "Abstract only",
  record_only: "Its public record only",
  from_atlas: "Read for an earlier Atlas finding",
  found_in_search: "Found in a search, not read",
  not_in_receipts: "Not read in this research",
};
const DIRECTION_WORDS: Readonly<Record<string, string>> = {
  benefit: "Benefit", harm: "Harm", no_difference: "No difference", mixed: "Mixed", unclear: "Unclear",
};
const DATABASE_WORDS: Readonly<Record<string, string>> = {
  pubmed: "PubMed", europepmc: "Europe PMC", openalex: "OpenAlex", ctgov: "ClinicalTrials.gov",
};
const CHECK_WORDS: Readonly<Record<string, string>> = {
  receipts: "every source and search rests on AskRigor’s own records of this research",
  papers: "each study is one paper, entered once",
  searches: "each search is the one AskRigor ran",
  arithmetic: "counts, numbers needed to treat or harm, and calculated figures add up",
  references: "every finding and result points at a study, result or search of the dossier",
  coverage: "benefits, harms, results showing no effect, conflicts, usual options and people’s reports were each answered",
  forms: "each finding keeps to the form its studies used",
  forum_reads: "people’s reports come only from forum threads AskRigor read",
  youtube_comments: "nothing comes from YouTube comments",
  privacy_screen: "every text passed AskRigor’s privacy screen",
};
const NOT_CHECKED_WORDS: Readonly<Record<string, string>> = {
  papers_support_claims: "that each paper says what a finding claims: the researching AI’s reading",
  figures_match_papers: "that each figure matches its paper",
  value_judgement: "that it saves a reader substantial work: the researching AI’s own judgement",
};
const COVERAGE_WORDS: Readonly<Record<string, string>> = {
  benefits: "Benefits", harms: "Harms", null_results: "Results showing no effect", conflicts: "Conflicting results",
  mainstream_options: "Usual options", people_reports: "People’s reports",
};

const joined = (items: readonly SafeHtml[], separator: SafeHtml) =>
  items.flatMap((item, index) => index === 0 ? [item] : [separator, item]);
const people = (count: number) => `${count.toLocaleString("en-US")} ${count === 1 ? "person" : "people"}`;
const percent = (events: number, total: number) => {
  const value = Math.round(1_000 * events / total) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
};
const dayOf = (value: string) => value.slice(0, 10);

function evidencePart(part: DossierEvidencePart): string {
  const [one, many] = EVIDENCE_WORDS[part.kind] ?? [part.kind, part.kind];
  const label = `${part.count} ${part.count === 1 ? one : many}`;
  if (part.kind === "searches") return label;
  if (part.kind === "people_reports") return `${label}, ${people(part.people)} reporting`;
  const sized = part.people > 0 ? `${people(part.people)}${part.unsized > 0 ? `, and ${part.unsized} without a size` : ""}`
    : "size not given";
  return `${label} (${sized})${NOT_IN_PEOPLE.has(part.kind) ? ", not yet shown in people" : ""}`;
}

function statusBadge(accepted: boolean): SafeHtml {
  return accepted ? html`<p class="badge badge-checked">Checked by supervisors</p>`
    : html`<p class="badge badge-unreviewed">${NOT_CHECKED_LABEL}</p> <p class="ai-label">${AI_LABEL}</p>`;
}

function identifierLinks(study: PublicDossierStudy): SafeHtml[] {
  return study.identifiers.flatMap((identifier) => {
    const link = sourceLink(identifier);
    return link === undefined ? [] : [html`<a href="${link.href}" rel="noopener nofollow">${link.text}</a>`];
  });
}

/** A result's figure with its sizes: counts as "x of n (p%)" for each group; a value with its groups' sizes. */
function figureText(result: PublicDossierResult): SafeHtml | "" {
  const figure = result.figure;
  const sizes = resultSizes(result);
  if (figure?.kind === "counts") {
    return html`${figure.option_events} of ${figure.option_total} (${percent(figure.option_events, figure.option_total)}) against ${figure.comparator_events} of ${figure.comparator_total} (${percent(figure.comparator_events, figure.comparator_total)})${figure.nnt === undefined ? "" : html`; number needed to treat ${figure.nnt}`}${figure.nnh === undefined ? "" : html`; number needed to harm ${figure.nnh}`}`;
  }
  const value = figure?.kind === "value"
    ? html`${figure.measure === undefined ? "" : html`${figure.measure}: `}${figure.value} ${figure.unit}` : "";
  const sized = sizes === undefined ? "" : sizes.comparator === undefined ? html`${people(sizes.option)}`
    : html`groups of ${sizes.option} and ${sizes.comparator}`;
  if (value === "" && sized === "") return "";
  return html`${value}${value !== "" && sized !== "" ? " · " : ""}${sized}`;
}

function resultItem(dossier: PublicDossier, result: PublicDossierResult): SafeHtml {
  const study = dossier.studies.find(({ id }) => id === result.study);
  const facts: SafeHtml[] = [html`${DIRECTION_WORDS[result.direction] ?? result.direction}`,
    html`${CERTAINTY_WORDS[result.certainty] ?? result.certainty}`];
  if (result.comparator !== undefined) facts.push(html`against ${result.comparator}`);
  if (result.follow_up !== undefined) facts.push(html`followed ${result.follow_up}`);
  const figure = figureText(result);
  const provenance = result.provenance === "calculated" ? "calculated by the AI from the paper’s numbers"
    : result.provenance === "from_table" ? "read from a table" : result.provenance === "reported" ? "as reported" : null;
  return html`<li><p><strong>${result.outcome}</strong>${study === undefined ? "" : html` (${studyLabel(dossier, study)})`}</p>
<p class="meta">${joined(facts, html` · `)}</p>
${figure === "" ? "" : html`<p class="dossier-figure">${figure}${provenance === null ? "" : html` <span class="meta">(${provenance})</span>`}</p>`}
</li>`;
}

function studyLabel(dossier: PublicDossier, study: PublicDossierStudy): SafeHtml {
  const [one] = EVIDENCE_WORDS[study.kind] ?? [study.kind];
  const size = studyPeople(dossier, study);
  return html`${one}${study.form === undefined ? "" : html`, ${study.form}`}${size === undefined ? ", size not given"
    : html`, ${people(size)}`}`;
}

function studyItem(dossier: PublicDossier, study: PublicDossierStudy): SafeHtml {
  const facts: SafeHtml[] = [];
  if (study.dose !== undefined) facts.push(html`Dose: ${study.dose}`);
  if (study.route !== undefined) facts.push(html`Route: ${study.route}`);
  if (study.population !== undefined) facts.push(html`Who: ${study.population}`);
  if (study.comparator !== undefined) facts.push(html`Against: ${study.comparator}`);
  if (study.design !== undefined) facts.push(html`Design: ${study.design}`);
  const links = identifierLinks(study);
  return html`<li><p><strong>${studyLabel(dossier, study)}</strong>${links.length === 0 ? "" : html` · ${joined(links, html` · `)}`}</p>
${facts.length === 0 ? "" : html`<p class="meta">${joined(facts, html` · `)}</p>`}
<p class="meta">How AskRigor read it: ${READ_WORDS[study.read] ?? study.read}${study.decision === "set_aside"
    ? html` · Set aside${study.decision_reason === undefined ? "" : html`: ${study.decision_reason}`}` : ""}</p>
</li>`;
}

/** One finding as a line that opens onto what it rests on. */
function glanceItem(item: DossierRankItem, showDossier: boolean): SafeHtml {
  const { dossier, finding } = item;
  const evidence = item.evidence.parts.map(evidencePart);
  const results = finding.rests_on.flatMap((reference) => dossier.results.filter(({ id }) => id === reference));
  const studies = findingStudies(dossier, finding);
  const searches = finding.rests_on.flatMap((reference) => dossier.searches.filter(({ id }) => id === reference));
  const community = finding.rests_on.includes("community") ? dossier.community : undefined;
  return html`<li class="dossier-finding dossier-${finding.importance}">
<details>
<summary><span class="dossier-importance">${IMPORTANCE_WORDS[finding.importance]}</span>${finding.hard_to_find
    ? html` <span class="dossier-hard">Hard to find</span>` : ""} <span class="dossier-claim">${finding.claim}</span>
<span class="dossier-evidence">${KIND_WORDS[finding.kind] ?? finding.kind} · ${evidence.length === 0 ? "evidence not given"
    : evidence.join("; ")} · ${CERTAINTY_WORDS[finding.certainty] ?? finding.certainty}${finding.form === undefined ? ""
    : html` · ${finding.form}`}</span></summary>
<div class="dossier-detail">
<p>For: ${finding.applies_to}</p>
${results.length === 0 ? "" : html`<h4>Results it rests on</h4><ul>${results.map((result) => resultItem(dossier, result))}</ul>`}
${studies.length === 0 ? "" : html`<h4>Studies</h4><ul>${studies.map((study) => studyItem(dossier, study))}</ul>`}
${community === undefined ? "" : html`<h4>People’s reports</h4>${communityText(community)}`}
${searches.length === 0 ? "" : html`<h4>Searches</h4><ul>${searches.map((search) =>
    html`<li>${DATABASE_WORDS[search.database] ?? search.database}: ${search.query}${search.records_found === null ? ""
      : html` (${search.records_found.toLocaleString("en-US")} records)`}</li>`)}</ul>`}
<p>What would change it: ${finding.what_would_change_it}</p>
${showDossier ? html`<p class="meta">From research dossier <a href="${dossierPagePath(item.publicNumber)}">${item.publicNumber}</a>, ${
    item.accepted ? "checked by supervisors" : NOT_CHECKED_LABEL.toLocaleLowerCase("en")}</p>` : ""}
</div>
</details>
</li>`;
}

function communityText(community: NonNullable<PublicDossier["community"]>): SafeHtml {
  const { better, no_change: same, worse, mixed } = community.people;
  return html`<p>${community.threads_read} forum ${community.threads_read === 1 ? "thread" : "threads"} read${
    community.communities.length === 0 ? "" : html` (${community.communities.join(", ")})`}: ${people(better)} said better, ${
    people(same)} no change, ${people(worse)} worse, ${people(mixed)} mixed.</p>
<p class="meta">Counted once per thread. These are what people chose to post, so they don’t show how often anything happens.</p>`;
}

function glanceList(items: readonly DossierRankItem[], showDossier: boolean): SafeHtml {
  return html`<ol class="dossier-glance">${items.map((item) => glanceItem(item, showDossier))}</ol>`;
}

function formSections(forms: DossierTopicModel["forms"], showDossier: boolean, idPrefix: string): SafeHtml {
  return html`${forms.length > 1 ? html`<p class="dossier-forms-nav">${joined(forms.map((group, index) =>
    html`<a href="#${idPrefix}-form-${index}">${group.form ?? "Across forms"}</a>`), html` · `)}</p>` : ""}
${forms.map((group, index) => html`<section aria-labelledby="${idPrefix}-form-${index}">
<h4 id="${idPrefix}-form-${index}">${group.form ?? "Across forms"}</h4>
${glanceList(group.findings, showDossier)}
</section>`)}`;
}

function disagreementList(disagreements: readonly DossierDisagreementView[]): SafeHtml | "" {
  if (disagreements.length === 0) return "";
  return html`<h3>Where dossiers disagree</h3>
<p class="meta">Two dossiers reached opposite kinds of conclusion for the same form. They may be about different outcomes or people; AskRigor checks such conflicts when they matter.</p>
<ul class="dossier-conflicts">${disagreements.map((entry) => html`<li>${entry.form}: “${entry.left.claim}” (<a href="${dossierPagePath(entry.left.publicNumber)}">${entry.left.publicNumber}</a>) and “${entry.right.claim}” (<a href="${dossierPagePath(entry.right.publicNumber)}">${entry.right.publicNumber}</a>)</li>`)}</ul>`;
}

function relatedList(related: readonly DossierRelatedTopic[]): SafeHtml | "" {
  if (related.length === 0) return "";
  return html`<h3>Related topics</h3>
<ul class="dossier-related">${related.map((topic) => html`<li><a href="${topicPath(topic.key)}">${topic.label}</a>${
    topic.why === "shared_studies" ? html` <span class="meta">(shares studies with this topic)</span>` : ""}</li>`)}</ul>`;
}

function dossierSummary({ copy, dossier }: ShownDossier): SafeHtml {
  const used = dossier.studies.filter(({ decision }) => decision === "used").length;
  return html`<li><a href="${dossierPagePath(copy.publicNumber)}">${copy.publicNumber}</a>: ${dossier.question}
<span class="meta">${copy.accepted ? "Checked by supervisors" : NOT_CHECKED_LABEL} · version ${copy.versionNumber}, ${
    dayOf(copy.shownAt)} · ${dossier.searches.length} ${dossier.searches.length === 1 ? "search" : "searches"}, ${used} ${
    used === 1 ? "study" : "studies"} used, ${dossier.findings.length} ${dossier.findings.length === 1 ? "finding" : "findings"}</span></li>`;
}

/** Whether every dossier on a page is unreviewed: the page then stays out of search engines, its text out of snippets. */
const unreviewed = (dossiers: readonly ShownDossier[]) => dossiers.some(({ copy }) => !copy.accepted);

/** The dossiers' part of a topic page: main points at a glance, all findings by form, conflicts, dossiers, related. */
export function dossierTopicSection(model: DossierTopicModel): SafeHtml {
  const glance = model.ranked.slice(0, DOSSIER_GLANCE_COUNT);
  return html`<section class="dossier-section" aria-labelledby="dossiers-heading"${unreviewed(model.dossiers)
    ? html` data-nosnippet` : ""}>
<h2 id="dossiers-heading">Research dossiers: main points at a glance</h2>
${unreviewed(model.dossiers) ? statusBadge(false) : statusBadge(true)}
<p class="meta">${DOSSIER_ORDER_LINE} Open a line for what it rests on.</p>
${glanceList(glance, true)}
${model.ranked.length > glance.length || model.forms.length > 1 ? html`<details class="dossier-more">
<summary>All ${model.ranked.length} findings, by form</summary>
${formSections(model.forms, true, "topic")}
</details>` : ""}
${disagreementList(model.disagreements)}
<h3>The dossiers</h3>
<ul class="dossier-list">${model.dossiers.map(dossierSummary)}</ul>
${relatedList(model.related)}
</section>`;
}

/** A topic page that only dossiers show (no card finding has the topic). */
export function renderDossierTopicPage(model: DossierTopicModel, reader?: AtlasPageReader): string {
  return page({
    path: topicPath(model.topicKey),
    noindex: model.dossiers.every(({ copy }) => !copy.accepted),
    reader,
    title: `${model.name} | AskRigor Atlas`,
    description: `Research dossiers about ${model.name} in the AskRigor Atlas: main points first, every study a click away.`,
    body: html`<p class="breadcrumbs"><a href="/atlas">Atlas</a> › <a href="/atlas/topics">Topics</a></p>
<h1>${model.name}</h1>
${model.otherNames.length === 0 ? "" : html`<p class="lede">Also called: ${model.otherNames.join(", ")}</p>`}
${dossierTopicSection(model)}`,
  });
}

function checkedSection(dossier: PublicDossier): SafeHtml {
  const reads = new Map<string, number>();
  for (const study of dossier.studies) reads.set(study.read, (reads.get(study.read) ?? 0) + 1);
  const databases = [...new Set(dossier.searches.map(({ database }) => DATABASE_WORDS[database] ?? database))];
  const records = dossier.searches.reduce((sum, { records_found: found }) => sum + (found ?? 0), 0);
  return html`<section class="dossier-checked" aria-labelledby="checked-heading">
<h2 id="checked-heading">What was checked, and how deeply</h2>
<p>${dossier.searches.length} ${dossier.searches.length === 1 ? "search" : "searches"}${databases.length === 0 ? ""
    : html` in ${databases.join(", ")}`}${records === 0 ? "" : html`, ${records.toLocaleString("en-US")} records found`}; ${
    dossier.studies.length} ${dossier.studies.length === 1 ? "study" : "studies"} considered:</p>
<ul>${[...reads].map(([read, count]) => html`<li>${count}: ${READ_WORDS[read] ?? read}</li>`)}</ul>
<p>AskRigor’s exact checks, which passed: ${dossier.checked.checks.map((check) => CHECK_WORDS[check] ?? check).join("; ")}.${
    dossier.checked.privacy_reading ? " An AI privacy reading found nothing about a person." : ""}</p>
<p>Not checked: ${dossier.checked.not_checked.map((item) => NOT_CHECKED_WORDS[item] ?? item).join("; ")}. The researching AI judged it ${
    dossier.value.confidence === undefined ? "without saying how sure it is" : `with ${dossier.value.confidence} confidence`}.</p>
<h3>What it covered</h3>
<ul>${Object.entries(dossier.coverage).map(([area, entry]) => html`<li>${COVERAGE_WORDS[area] ?? area}: ${
    entry.status === "entries" ? "covered" : entry.status === "none_found" ? "searched for, none found"
      : html`not researched${entry.reason === undefined ? "" : html` (${entry.reason})`}`}</li>`)}</ul>
<p class="meta">Researched ${dossier.checked.on} with AskRigor ${dossier.checked.askrigor_version}${
    dossier.checked.hrp === undefined ? "" : html` and its protocol ${dossier.checked.hrp}`}; ${
    dossier.checked.receipts_checked} of AskRigor’s records of this research checked.</p>
</section>`;
}

/** A dossier's own page. */
export function renderDossierPage(model: DossierPageModel, reader?: AtlasPageReader): string {
  const { copy, dossier } = model.shown;
  const studies = [...dossier.studies].sort((left, right) =>
    Number(left.decision === "set_aside") - Number(right.decision === "set_aside"));
  const comparisons = dossier.results.filter(resultCompares).length;
  return page({
    path: dossierPagePath(copy.publicNumber),
    noindex: !copy.accepted,
    reader,
    title: `${dossier.topic.name}: research dossier ${copy.publicNumber} | AskRigor Atlas`,
    description: `A research dossier about ${dossier.topic.name}: main points first, then every study, result and check.`,
    body: html`<p class="breadcrumbs"><a href="/atlas">Atlas</a> › <a href="${topicPath(dossier.topic.key)}">${dossier.topic.name}</a></p>
<div${copy.accepted ? "" : html` data-nosnippet`}>
<h1>${dossier.question}</h1>
${statusBadge(copy.accepted)}
<p class="lede">Research dossier ${copy.publicNumber}, version ${copy.versionNumber}, shown ${dayOf(copy.shownAt)}: ${
    dossier.findings.length} ${dossier.findings.length === 1 ? "finding" : "findings"} from ${dossier.studies.length} ${
    dossier.studies.length === 1 ? "study" : "studies"}, written by an AI without the person whose research it was.</p>
${dossier.value.quick_answer === undefined && dossier.value.reason === undefined ? "" : html`<section class="dossier-value">
${dossier.value.quick_answer === undefined ? "" : html`<p><strong>What a quick answer gives:</strong> ${dossier.value.quick_answer}</p>`}
${dossier.value.reason === undefined ? "" : html`<p><strong>What this adds:</strong> ${dossier.value.reason}</p>`}
</section>`}
<h2>Main points at a glance</h2>
<p class="meta">${DOSSIER_ORDER_LINE} Open a line for what it rests on.</p>
${glanceList(model.ranked.slice(0, DOSSIER_GLANCE_COUNT), false)}
${model.ranked.length > DOSSIER_GLANCE_COUNT || model.forms.length > 1 ? html`<details class="dossier-more">
<summary>All ${model.ranked.length} findings, by form</summary>
${formSections(model.forms, false, "dossier")}
</details>` : ""}
${disagreementList(model.disagreements)}
${checkedSection(dossier)}
<details class="dossier-more"><summary>Every study (${studies.length})</summary>
<ul class="dossier-studies-list">${studies.map((study) => studyItem(dossier, study))}</ul></details>
${dossier.results.length === 0 ? "" : html`<details class="dossier-more"><summary>Every result (${dossier.results.length}, ${comparisons} ${
    comparisons === 1 ? "comparison" : "comparisons"} with group sizes)</summary>
<ul>${dossier.results.map((result) => resultItem(dossier, result))}</ul></details>`}
${dossier.searches.length === 0 ? "" : html`<details class="dossier-more"><summary>Every search (${dossier.searches.length})</summary>
<ul>${dossier.searches.map((search) => html`<li>${DATABASE_WORDS[search.database] ?? search.database}: ${search.query}${
    search.date_range === undefined ? "" : html`, ${search.date_range.start} to ${search.date_range.end}`}${
    search.records_found === null ? "" : html` (${search.records_found.toLocaleString("en-US")} records)`}</li>`)}</ul></details>`}
${dossier.community === undefined ? "" : html`<h2>People’s reports</h2>${communityText(dossier.community)}`}
${dossier.open_trails.length === 0 ? "" : html`<h2>Still unknown</h2><ul>${dossier.open_trails.map((trail) => html`<li>${trail}</li>`)}</ul>`}
${model.history.length <= 1 ? "" : html`<h2>Versions</h2><ul>${model.history.map((entry) => html`<li>Version ${entry.versionNumber}, ${
    dayOf(entry.decidedAt)}: ${entry.state === "shown" ? "shown now" : "replaced by a later version"}${entry.accepted
    ? ", checked by supervisors" : ""}${entry.revised ? "; AskRigor’s review changed how much one of its findings matters"
    : ""}</li>`)}</ul>`}
${relatedList(model.related)}
</div>`,
  });
}
