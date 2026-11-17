import {
  PUBLIC_DOSSIERS_MAX_OFFSET,
  PUBLIC_DOSSIERS_PER_READ,
  readConflictFinding,
  type PublicDossierCopy,
  type PublicDossierHistoryEntry,
  type PublicDossierPageSource,
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
  type DossierRankKey,
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
/** A topic's dossiers a page at a time, newest first (Codex's review of stage 2, finding 8). */
export const DOSSIERS_PER_TOPIC_PAGE = 20;
export const DOSSIER_TOPIC_PAGES = 500;
/**
 * The most a page's list of every finding takes, as escaped bytes: the list stops at the first finding past it, in its
 * order, and says how many more there are and where (finding 8).
 */
export const DOSSIER_FINDING_BYTES = 1_000_000;
/**
 * The most a whole page that shows dossiers takes, as bytes (Codex's re-review of stage 2, P1): the list of every finding
 * gets what the rest of the page leaves, and when the rest alone is more, the main points at a glance are listed
 * without what each opens onto (fitDossierPage).
 */
export const DOSSIER_PAGE_BYTES = 2_000_000;
/** The topics list, while dossiers show, this many topics a page, in the order of their keys. */
export const DOSSIER_TOPIC_INDEX_PER_PAGE = 200;

/** How much of a page that shows dossiers its parts may take (fitDossierPage). */
export interface DossierPageSize {
  /** The bytes the list of every finding may take. */
  findingBytes?: number;
  /** The main points at a glance as lines alone, each linking its dossier, without what each opens onto. */
  compact?: boolean;
}

/**
 * A page that shows dossiers, within its whole size: the list of every finding is cut to what the rest of the page
 * leaves; if the rest alone is more, the main points at a glance are shown as lines alone. Everything else a dossier
 * part holds is bounded by its count and the dossier's own limits.
 */
export function fitDossierPage(render: (size: DossierPageSize) => string, bytes = DOSSIER_PAGE_BYTES): string {
  const sizeOf = (page: string) => Buffer.byteLength(page, "utf8");
  let findingBytes = Math.min(DOSSIER_FINDING_BYTES, bytes);
  for (let attempt = 0; attempt < 4 && findingBytes > 0; attempt += 1) {
    const page = render({ findingBytes });
    const size = sizeOf(page);
    if (size <= bytes) return page;
    findingBytes = Math.max(0, findingBytes - (size - bytes) - 4_096);
  }
  const page = render({ findingBytes: 0 });
  return sizeOf(page) <= bytes ? page : render({ findingBytes: 0, compact: true });
}
/** A dossier page compares it with the newest this many shown dossiers on its topic, and says so when there are more. */
const TOPIC_COMPARED = 200;
/** Topics sharing a study are looked for among the newest this many shown dossiers: a bounded look, never a lookup. */
const SHARED_STUDY_READ = 500;

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
  /** The form both findings are about; null when AskRigor's conflict check paired findings that name none. */
  form: string | null;
  left: { publicNumber: string; claim: string };
  right: { publicNumber: string; claim: string };
  /**
   * kinds: opposite kinds of conclusion for one declared form (dossierDisagreements); check: findings AskRigor's
   * conflict check read as contradicting, kept with a copy the review showed or admitted (Codex's third review, P1).
   */
  found: "kinds" | "check";
}

export interface DossierTopicModel {
  topicKey: string;
  name: string;
  otherNames: string[];
  /** This page's dossiers, newest first; page 1 is the newest. */
  page: number;
  /** Whether older dossiers follow on the next page. */
  more: boolean;
  dossiers: ShownDossier[];
  /**
   * The main points at a glance: the first findings of every shown dossier on the topic in the order of rule 333a, not
   * of this page's alone (Codex's re-review of stage 2), the same on every page.
   */
  glance: DossierRankItem[];
  /** How many shown dossiers the glance was ranked across, and whether that is every one on the topic. */
  glanceAcross: { dossiers: number; every: boolean };
  /** This page's findings, ranked, for the list of every finding by form. */
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
  /** False when its topic has more shown dossiers than the newest it was compared with. */
  comparedAll: boolean;
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

/**
 * Where dossiers disagree: the pairs of findings AskRigor's conflict check read as contradicting, kept with a copy the
 * review showed or admitted, where either copy is among those given and the other still shows as it was compared
 * (among known); then where two of those given reach opposite kinds of conclusion for one form. Each pair once.
 */
function disagreementsAmong(dossiers: readonly ShownDossier[], known: readonly ShownDossier[] = dossiers):
  DossierDisagreementView[] {
  const views: DossierDisagreementView[] = [];
  const listed = new Set<string>();
  const pairKey = (one: string, other: string) => [one, other].sort().join(" ");
  const given = new Set(dossiers.map(({ copy }) => copy.publicNumber));
  const byNumber = new Map(known.map((shown) => [shown.copy.publicNumber, shown]));
  for (const mine of byNumber.values()) {
    for (const kept of mine.copy.conflictFindings) {
      const pair = readConflictFinding(kept);
      const theirs = pair === undefined ? undefined : byNumber.get(pair.publicNumber);
      if (pair === undefined || theirs === undefined || theirs.copy.versionNumber !== pair.versionNumber ||
        (!given.has(mine.copy.publicNumber) && !given.has(theirs.copy.publicNumber))) continue;
      const left = mine.dossier.findings.find(({ id }) => id === pair.finding);
      const right = theirs.dossier.findings.find(({ id }) => id === pair.theirs);
      const key = pairKey(`${mine.copy.publicNumber}:${pair.finding}`, `${theirs.copy.publicNumber}:${pair.theirs}`);
      if (left === undefined || right === undefined || listed.has(key)) continue;
      listed.add(key);
      views.push({ form: left.form ?? right.form ?? null, found: "check",
        left: { publicNumber: mine.copy.publicNumber, claim: left.claim },
        right: { publicNumber: theirs.copy.publicNumber, claim: right.claim } });
    }
  }
  for (let left = 0; left < dossiers.length; left += 1) {
    for (let right = left + 1; right < dossiers.length; right += 1) {
      const a = dossiers[left]!;
      const b = dossiers[right]!;
      for (const found of dossierDisagreements(a.dossier, b.dossier)) {
        const key = pairKey(`${a.copy.publicNumber}:${found.mine}`, `${b.copy.publicNumber}:${found.theirs}`);
        if (listed.has(key)) continue;
        listed.add(key);
        views.push({
          form: found.form,
          found: "kinds",
          left: { publicNumber: a.copy.publicNumber, claim: a.dossier.findings.find(({ id }) => id === found.mine)!.claim },
          right: { publicNumber: b.copy.publicNumber, claim: b.dossier.findings.find(({ id }) => id === found.theirs)!.claim },
        });
      }
    }
  }
  return views.slice(0, 50);
}

/**
 * The shown dossiers the conflict check paired with those given, either way, beyond them: those their kept pairs name,
 * and those whose kept pairs name one of them, a bounded read each.
 */
async function conflictPartnersOf(source: PublicDossierPageSource, dossiers: readonly ShownDossier[]):
  Promise<ShownDossier[]> {
  const numbers = new Set(dossiers.map(({ copy }) => copy.publicNumber));
  if (numbers.size === 0) return [];
  const named = [...new Set(dossiers.flatMap(({ copy }) => copy.conflictFindings.flatMap((kept) =>
    readConflictFinding(kept)?.publicNumber ?? [])))].filter((number) => !numbers.has(number))
    .slice(0, PUBLIC_DOSSIERS_PER_READ);
  const read = [
    ...await source.listShown({ conflictsWith: [...numbers], limit: PUBLIC_DOSSIERS_PER_READ }),
    ...named.length === 0 ? [] : await source.listShown({ publicNumbers: named, limit: named.length }),
  ];
  const partners = new Map<string, ShownDossier>();
  for (const copy of read) {
    if (numbers.has(copy.publicNumber) || partners.has(copy.publicNumber)) continue;
    const shown = shownOf(copy);
    if (shown !== undefined) partners.set(copy.publicNumber, shown);
  }
  return [...partners.values()];
}

/**
 * The topics a topic links: those its dossiers name, those whose dossiers share a study with them (among the newest
 * shown dossiers, SHARED_STUDY_READ), and the curated family it belongs to, each only where a page shows (a shown
 * dossier, or a card topic the caller knows). A named topic's name is read by its own key.
 */
async function relatedTopics(source: PublicDossierPageSource, topicKey: string, own: readonly ShownDossier[],
  cardTopicLabel: (key: string) => Promise<string | undefined>): Promise<DossierRelatedTopic[]> {
  const all = (await source.listShown({ limit: SHARED_STUDY_READ })).flatMap((copy) => shownOf(copy) ?? []);
  const declared = [...new Set(own.flatMap(({ copy }) => copy.relatedTopicKeys))].filter((key) => key !== topicKey);
  if (declared.length > 0) {
    all.push(...(await source.listShown({ topicKeys: declared, limit: SHARED_STUDY_READ }))
      .flatMap((copy) => shownOf(copy) ?? []));
  }
  const names = new Map<string, string>();
  for (const { dossier } of all) if (!names.has(dossier.topic.key)) names.set(dossier.topic.key, dossier.topic.name);
  const wanted = new Map<string, DossierRelatedTopic["why"]>();
  for (const key of declared) wanted.set(key, "declared");
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

/**
 * The main points at a glance across every shown dossier on a topic (Codex's re-review of stage 2, P1: the newest
 * twenty alone hid an older decision-changing finding): every copy read a read at a time, each finding kept only as the
 * ranking reads it, ranked by rule 333a, and the dossiers of the first DOSSIER_GLANCE_COUNT read again whole by their
 * numbers, for what each line opens onto.
 */
async function topicGlance(source: PublicDossierPageSource, topicKey: string):
  Promise<{ glance: DossierRankItem[]; dossiers: number; every: boolean }> {
  const keys: DossierRankKey[] = [];
  const seen = new Set<string>();
  let every = true;
  for (let offset = 0; ; offset += PUBLIC_DOSSIERS_PER_READ) {
    if (offset > PUBLIC_DOSSIERS_MAX_OFFSET) {
      every = false;
      break;
    }
    const read = await source.listShown({ topicKeys: [topicKey], limit: PUBLIC_DOSSIERS_PER_READ, offset });
    for (const copy of read) {
      const shown = seen.has(copy.publicNumber) ? undefined : shownOf(copy);
      if (shown === undefined) continue;
      seen.add(copy.publicNumber);
      // Only what the ranking reads is kept: a finding and its evidence, never the dossier's other parts.
      keys.push(...dossierRankItems([{ publicNumber: copy.publicNumber, dossier: shown.dossier, shownAt: copy.shownAt,
        accepted: copy.accepted }]).map(({ publicNumber, finding, evidence, shownAt, place }) =>
        ({ publicNumber, finding, evidence, shownAt, place })));
    }
    if (read.length < PUBLIC_DOSSIERS_PER_READ) break;
  }
  const first = rankDossierFindings(keys).slice(0, DOSSIER_GLANCE_COUNT);
  const numbers = [...new Set(first.map(({ publicNumber }) => publicNumber))];
  const whole = new Map((numbers.length === 0 ? [] : await source.listShown({ publicNumbers: numbers,
    limit: numbers.length })).flatMap((copy) => {
    const shown = shownOf(copy);
    return shown === undefined ? [] : [[copy.publicNumber, shown] as const];
  }));
  const glance = first.flatMap((key) => {
    const shown = whole.get(key.publicNumber);
    const finding = shown?.dossier.findings[key.place];
    return shown === undefined || finding?.id !== key.finding.id ? [] : [{ ...key, dossier: shown.dossier, finding,
      accepted: shown.copy.accepted }];
  });
  return { glance, dossiers: seen.size, every };
}

/** One page of a topic's shown dossiers, ranked, read by the topic's key; undefined when none shows there. */
export async function loadDossierTopic(source: PublicDossierPageSource, topicKey: string,
  cardTopicLabel: (key: string) => Promise<string | undefined> = async () => undefined, page = 1):
  Promise<DossierTopicModel | undefined> {
  if (!Number.isInteger(page) || page < 1 || page > DOSSIER_TOPIC_PAGES) return undefined;
  const read = await source.listShown({ topicKeys: [topicKey], limit: DOSSIERS_PER_TOPIC_PAGE + 1,
    offset: (page - 1) * DOSSIERS_PER_TOPIC_PAGE });
  const dossiers = read.slice(0, DOSSIERS_PER_TOPIC_PAGE).flatMap((copy) => shownOf(copy) ?? []);
  if (dossiers.length === 0) return undefined;
  const ranked = rankDossierFindings(dossierRankItems(dossiers.map(({ copy, dossier }) =>
    ({ publicNumber: copy.publicNumber, dossier, shownAt: copy.shownAt, accepted: copy.accepted }))));
  const across = await topicGlance(source, topicKey);
  const newest = dossiers[0]!.dossier;
  const forms = [...new Map(dossiers.flatMap(({ dossier }) => dossier.forms)
    .map((form) => [form.toLocaleLowerCase("en"), form])).values()];
  return {
    topicKey,
    name: dossiers.find(({ copy }) => copy.accepted)?.dossier.topic.name ?? newest.topic.name,
    otherNames: [...new Set(dossiers.flatMap(({ dossier }) => dossier.topic.other_names))].slice(0, 20),
    page,
    more: read.length > DOSSIERS_PER_TOPIC_PAGE,
    dossiers,
    glance: across.glance,
    glanceAcross: { dossiers: across.dossiers, every: across.every },
    ranked,
    forms: byForm(ranked, forms),
    disagreements: disagreementsAmong(dossiers, [...dossiers, ...await conflictPartnersOf(source, dossiers)]),
    related: await relatedTopics(source, topicKey, dossiers, cardTopicLabel),
  };
}

/** One shown dossier's page model; undefined when it does not show. */
export async function loadDossierPage(source: PublicDossierPageSource, publicNumber: string,
  cardTopicLabel: (key: string) => Promise<string | undefined> = async () => undefined):
  Promise<DossierPageModel | undefined> {
  const [copy] = await source.listShown({ publicNumbers: [publicNumber], limit: 1 });
  const shown = copy === undefined ? undefined : shownOf(copy);
  if (shown === undefined) return undefined;
  const ranked = rankDossierFindings(dossierRankItems([{ publicNumber, dossier: shown.dossier,
    shownAt: shown.copy.shownAt, accepted: shown.copy.accepted }]));
  const read = await source.listShown({ topicKeys: [shown.copy.topicKey], limit: TOPIC_COMPARED });
  const onTopic = read.flatMap((other) => other.publicNumber === publicNumber ? [] : shownOf(other) ?? []);
  return {
    shown,
    ranked,
    forms: byForm(ranked, shown.dossier.forms),
    history: await source.history([publicNumber]),
    disagreements: disagreementsAmong([shown, ...onTopic], [shown, ...onTopic,
      ...(await conflictPartnersOf(source, [shown])).filter(({ copy }) => !onTopic.some((other) =>
        other.copy.publicNumber === copy.publicNumber))])
      .filter(({ left, right }) => left.publicNumber === publicNumber || right.publicNumber === publicNumber),
    comparedAll: read.length < TOPIC_COMPARED,
    related: await relatedTopics(source, shown.copy.topicKey, [shown], cardTopicLabel),
  };
}

export interface DossierTopicIndexPage {
  /** This page's topics, in the order of their keys, each once, its findings counted from cards and dossiers. */
  topics: Array<{ key: string; label: string; count: number }>;
  /** Whether more topics follow this page's last. */
  more: boolean;
}

/**
 * One page of the topics list while dossiers show (Codex's re-review of stage 2, P1: the list read every topic): the
 * card topics and the dossier topics as one list in the order of their keys, DOSSIER_TOPIC_INDEX_PER_PAGE at a time
 * after the key given, each topic once with the findings of both. The dossier topics are read one page at a time
 * from the reader's topics view, never all of them; a topic is listed only once every dossier topic up to its key is
 * read, so no count is cut.
 */
export async function loadDossierTopicIndex(source: PublicDossierPageSource,
  cardTopics: ReadonlyArray<{ key: string; label: string; count: number }>, after?: string): Promise<DossierTopicIndexPage> {
  const read = await source.listTopics({ ...(after === undefined ? {} : { after }), limit: DOSSIER_TOPIC_INDEX_PER_PAGE + 1 });
  const bound = read.length > DOSSIER_TOPIC_INDEX_PER_PAGE ? read.at(-1)!.topicKey : undefined;
  const topics = new Map<string, { key: string; label: string; count: number }>();
  for (const topic of cardTopics) if (after === undefined || topic.key > after) topics.set(topic.key, { ...topic });
  for (const { topicKey, name, findings } of read) {
    if (!rowPassesPageGuard(name)) continue;
    const known = topics.get(topicKey);
    if (known === undefined) topics.set(topicKey, { key: topicKey, label: name, count: findings });
    else known.count += findings;
  }
  const ordered = [...topics.values()].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  const complete = bound === undefined ? ordered : ordered.filter(({ key }) => key <= bound);
  return { topics: complete.slice(0, DOSSIER_TOPIC_INDEX_PER_PAGE),
    more: complete.length > DOSSIER_TOPIC_INDEX_PER_PAGE || complete.length < ordered.length || bound !== undefined };
}

/**
 * A page of a list within the whole size: as many of its entries as fit, at least one; returns how many and the page.
 */
export function fitDossierEntries(render: (count: number) => string, total: number, bytes = DOSSIER_PAGE_BYTES):
  { count: number; page: string } {
  const fits = (count: number) => Buffer.byteLength(render(count), "utf8") <= bytes;
  if (total <= 1 || fits(total)) return { count: total, page: render(total) };
  let low = 1;
  let high = total - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  return { count: low, page: render(low) };
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
/** What a study's size counts (Codex's review of stage 2, finding 11): animals, lab samples, or people. */
const UNIT_WORDS: Readonly<Record<string, [string, string]>> = {
  animal: ["animal", "animals"], lab: ["lab sample", "lab samples"],
};
const counted = (count: number, kind: string | undefined) => {
  const [one, many] = UNIT_WORDS[kind ?? ""] ?? ["person", "people"];
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
};
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
  const sized = part.people > 0 ? `${counted(part.people, part.kind)}${part.unsized > 0
    ? `, and ${part.unsized} without a size` : ""}` : "size not given";
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

/**
 * A result's figure with its sizes: counts as "x of n (p%)" for each group; a value with its groups' sizes, counted in
 * what its study counts.
 */
function figureText(result: PublicDossierResult, kind: string | undefined): SafeHtml | "" {
  const figure = result.figure;
  const sizes = resultSizes(result);
  if (figure?.kind === "counts") {
    return html`${figure.option_events} of ${figure.option_total} (${percent(figure.option_events, figure.option_total)}) against ${figure.comparator_events} of ${figure.comparator_total} (${percent(figure.comparator_events, figure.comparator_total)})${figure.nnt === undefined ? "" : html`; number needed to treat ${figure.nnt}`}${figure.nnh === undefined ? "" : html`; number needed to harm ${figure.nnh}`}`;
  }
  const value = figure?.kind === "value"
    ? html`${figure.measure === undefined ? "" : html`${figure.measure}: `}${figure.value} ${figure.unit}` : "";
  const sized = sizes === undefined ? "" : sizes.comparator === undefined ? html`${counted(sizes.option, kind)}`
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
  const figure = figureText(result, study?.kind);
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
    : html`, ${counted(size, study.kind)}`}`;
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

/** One finding as a line that opens onto what it rests on; compact, the line alone, linking its dossier. */
function glanceItem(item: DossierRankItem, showDossier: boolean, compact = false): SafeHtml {
  const { dossier, finding } = item;
  const evidence = item.evidence.parts.map(evidencePart);
  if (compact) {
    return html`<li class="dossier-finding dossier-${finding.importance}"><span class="dossier-importance">${
      IMPORTANCE_WORDS[finding.importance]}</span>${finding.hard_to_find ? html` <span class="dossier-hard">Hard to find</span>`
      : ""} <span class="dossier-claim">${finding.claim}</span>
<span class="dossier-evidence">${KIND_WORDS[finding.kind] ?? finding.kind} · ${evidence.length === 0 ? "evidence not given"
    : evidence.join("; ")} · ${CERTAINTY_WORDS[finding.certainty] ?? finding.certainty}${finding.form === undefined ? ""
    : html` · ${finding.form}`}${showDossier ? html` · <a href="${dossierPagePath(item.publicNumber)}">${item.publicNumber}</a>`
    : ""}</span></li>`;
  }
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

function glanceList(items: readonly DossierRankItem[], showDossier: boolean, compact = false): SafeHtml {
  return html`<ol class="dossier-glance">${items.map((item) => glanceItem(item, showDossier, compact))}</ol>`;
}

/**
 * Every finding by form, within a size: the findings in their order until the next would pass the bytes given, then a
 * line that says how many more there are and where they are.
 */
function formSections(forms: DossierTopicModel["forms"], showDossier: boolean, idPrefix: string, bytes: number,
  more: (count: number) => string): SafeHtml {
  let used = 0;
  let left = 0;
  const groups = forms.map((group) => ({ form: group.form, items: group.findings.flatMap((item) => {
    if (left > 0) { left += 1; return []; }
    const rendered = glanceItem(item, showDossier);
    used += Buffer.byteLength(rendered.value, "utf8");
    if (used > bytes) { left = 1; return []; }
    return [rendered];
  }) })).filter(({ items }) => items.length > 0);
  return html`${groups.length > 1 ? html`<p class="dossier-forms-nav">${joined(groups.map((group, index) =>
    html`<a href="#${idPrefix}-form-${index}">${group.form ?? "Across forms"}</a>`), html` · `)}</p>` : ""}
${groups.map((group, index) => html`<section aria-labelledby="${idPrefix}-form-${index}">
<h4 id="${idPrefix}-form-${index}">${group.form ?? "Across forms"}</h4>
<ol class="dossier-glance">${group.items}</ol>
</section>`)}
${left === 0 ? "" : html`<p class="meta">${more(left)}</p>`}`;
}

function disagreementList(disagreements: readonly DossierDisagreementView[]): SafeHtml | "" {
  if (disagreements.length === 0) return "";
  const entry = (item: DossierDisagreementView) => html`<li>${item.form === null ? "" : html`${item.form}: `}“${item.left.claim}” (<a href="${dossierPagePath(item.left.publicNumber)}">${item.left.publicNumber}</a>) and “${item.right.claim}” (<a href="${dossierPagePath(item.right.publicNumber)}">${item.right.publicNumber}</a>)</li>`;
  const checked = disagreements.filter(({ found }) => found === "check");
  const kinds = disagreements.filter(({ found }) => found === "kinds");
  return html`<h3>Where dossiers disagree</h3>
${checked.length === 0 ? "" : html`<p class="meta">AskRigor’s conflict check read these findings as contradicting each other.</p>
<ul class="dossier-conflicts">${checked.map(entry)}</ul>`}
${kinds.length === 0 ? "" : html`<p class="meta">Two dossiers reached opposite kinds of conclusion for the same form. They may be about different outcomes or people; AskRigor checks such conflicts when they matter.</p>
<ul class="dossier-conflicts">${kinds.map(entry)}</ul>`}`;
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

/**
 * The dossiers' part of a topic page: main points at a glance, all findings by form within their size, conflicts, this
 * page's dossiers with links to the newer and older ones, and related topics.
 */
export function dossierTopicSection(model: DossierTopicModel, size: DossierPageSize = {}): SafeHtml {
  const glance = model.glance;
  const pageOf = (page: number) => page === 1 ? topicPath(model.topicKey) : `${topicPath(model.topicKey)}?page=${page}`;
  const paged = model.page > 1 || model.more;
  return html`<section class="dossier-section" aria-labelledby="dossiers-heading"${unreviewed(model.dossiers)
    ? html` data-nosnippet` : ""}>
<h2 id="dossiers-heading">Research dossiers: main points at a glance</h2>
${unreviewed(model.dossiers) ? statusBadge(false) : statusBadge(true)}
<p class="meta">${DOSSIER_ORDER_LINE} Open a line for what it rests on.</p>
${model.glanceAcross.dossiers > model.dossiers.length ? html`<p class="meta">Ranked across ${model.glanceAcross.every
    ? "all" : "the newest"} ${model.glanceAcross.dossiers} dossiers on this topic.</p>` : ""}
${size.compact === true ? html`<p class="meta">Each line is on its dossier’s page with what it rests on.</p>` : ""}
${glanceList(glance, true, size.compact === true)}
${model.ranked.length > glance.length || model.forms.length > 1 || paged ? html`<details class="dossier-more">
<summary>All ${model.ranked.length} findings${paged ? " of the dossiers on this page" : ""}, by form</summary>
${formSections(model.forms, true, "topic", size.findingBytes ?? DOSSIER_FINDING_BYTES, (count) =>
    `${count} more ${count === 1 ? "finding is" : "findings are"} in the dossiers below, each on its own page.`)}
</details>` : ""}
${disagreementList(model.disagreements)}
<h3>${paged ? html`The dossiers, page ${model.page}` : "The dossiers"}</h3>
<ul class="dossier-list">${model.dossiers.map(dossierSummary)}</ul>
${paged ? html`<p class="dossier-pages">${model.page > 1 ? html`<a rel="prev" href="${pageOf(model.page - 1)}">Newer dossiers on this topic</a>` : ""}${
    model.page > 1 && model.more ? " · " : ""}${model.more ? html`<a rel="next" href="${pageOf(model.page + 1)}">Older dossiers on this topic</a>` : ""}</p>` : ""}
${relatedList(model.related)}
</section>`;
}

/** A topic page that only dossiers show (no card finding has the topic). */
export function renderDossierTopicPage(model: DossierTopicModel, reader?: AtlasPageReader,
  size: DossierPageSize = {}): string {
  return page({
    path: model.page === 1 ? topicPath(model.topicKey) : `${topicPath(model.topicKey)}?page=${model.page}`,
    noindex: model.dossiers.every(({ copy }) => !copy.accepted),
    reader,
    title: `${model.name}${model.page === 1 ? "" : `, research dossiers page ${model.page}`} | AskRigor Atlas`,
    description: `Research dossiers about ${model.name} in the AskRigor Atlas: main points first, every study a click away.`,
    body: html`<p class="breadcrumbs"><a href="/atlas">Atlas</a> › <a href="/atlas/topics">Topics</a></p>
<h1>${model.name}</h1>
${model.otherNames.length === 0 ? "" : html`<p class="lede">Also called: ${model.otherNames.join(", ")}</p>`}
${dossierTopicSection(model, size)}`,
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
export function renderDossierPage(model: DossierPageModel, reader?: AtlasPageReader, size: DossierPageSize = {}): string {
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
${glanceList(model.ranked.slice(0, DOSSIER_GLANCE_COUNT), false, size.compact === true)}
${model.ranked.length > DOSSIER_GLANCE_COUNT || model.forms.length > 1 ? html`<details class="dossier-more">
<summary>All ${model.ranked.length} findings, by form</summary>
${formSections(model.forms, false, "dossier", size.findingBytes ?? DOSSIER_FINDING_BYTES, (count) =>
    `${count} more ${count === 1 ? "finding is" : "findings are"} not listed here, to keep the page a readable size.`)}
</details>` : ""}
${disagreementList(model.disagreements)}
${model.comparedAll || model.disagreements.length === 0 ? "" : html`<p class="meta">Compared with the newest ${TOPIC_COMPARED} dossiers on its topic.</p>`}
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
