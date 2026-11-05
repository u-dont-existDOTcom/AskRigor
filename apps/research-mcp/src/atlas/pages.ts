import type {
  AtlasForumSignalStudies,
  AtlasLabel,
  AtlasPublishedRetraction,
  AtlasQuoteText,
  AtlasSourceFigures,
  AtlasSourceReading,
} from "@askrigor/evidence-repository";

import { binaryContrast, binaryGroups, differenceRange, withoutEndPunctuation } from "../binary-results.js";
import { shownCommunity } from "../forum-thread-links.js";
import type { AtlasAccountFeatures } from "./account-features.js";
import { escapeHtml } from "./page-guard.js";
import {
  ATLAS_FINDINGS_PER_PAGE,
  ATLAS_MAP_NEW_DAYS,
  ATLAS_SEARCH_MAX_PAGE,
  NOT_CHECKED_LABEL,
  SOURCE_SCHEME_WORDS,
  canonicalIdentifier,
  strengthOf,
  type AtlasChangeEntry,
  type AtlasChangesModel,
  type AtlasContestedPair,
  type AtlasFindingModel,
  type AtlasFindingParticipationView,
  type AtlasFindingsModel,
  type AtlasHomeModel,
  type AtlasMapFinding,
  type AtlasMapModel,
  type AtlasMapTopic,
  type AtlasOwnerPick,
  type AtlasSearchModel,
  type AtlasSitemapEntry,
  type AtlasTopicModel,
  type AtlasTopicsModel,
  type ShownFinding,
  type ShownForumSignal,
  type ShownNumber,
  type ShownQuoteLine,
  type ShownRelated,
  type ShownResearchSource,
  type ShownSearch,
  type ShownSource,
} from "./page-data.js";
import { ATLAS_SEARCH_MAX_LENGTH, type AtlasSearchField } from "./search.js";
import { STRENGTH_RULE, STRONG_CLAIM } from "./strength.js";

/**
 * The public Atlas pages' HTML (decision 171, section 4C): plain, semantic, server-rendered pages with no script and no
 * inline style, under a content policy that allows only the same-origin stylesheet. Every text a page shows goes
 * through html``, which escapes it; only markup this module and the Atlas's fixed-text pages (comment-maps-page.ts)
 * write is ever raw. Links to sources are built here from identifiers in canonical form, never taken from a card's text.
 */

// Escaping ------------------------------------------------------------------------------------------------------------

class SafeHtml {
  constructor(readonly value: string) {}
}

type HtmlValue = SafeHtml | string | number | null | undefined | false | readonly HtmlValue[];

// The escaping and the last check live in page-guard.ts, which the forms' checks share.
export { atlasPageProblems, escapeHtml } from "./page-guard.js";

function part(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

/** Markup with every interpolated value escaped, unless it is markup this module made. */
/** The type only: markup is made by html`` alone, never by constructing it elsewhere. */
export type { SafeHtml };

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, index) => {
    out += part(value) + strings[index + 1]!;
  });
  return new SafeHtml(out);
}

const joined = (items: readonly SafeHtml[], separator: string) =>
  new SafeHtml(items.map(({ value }) => value).join(escapeHtml(separator)));

// Words ---------------------------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CERTAINTY_WORDS = { high: "High", moderate: "Moderate", low: "Low", very_low: "Very low" } as const;
const KIND_WORDS = {
  effect: "An effect",
  harm: "A harm",
  overlooked_option: "An option quick answers leave out",
  correction: "A correction of a common claim",
  nothing_found: "Searched for, nothing found",
  tested_vs_sold: "What was tested and what is sold",
} as const;
const DIRECTION_WORDS = {
  benefit: "Benefit",
  harm: "Harm",
  no_effect: "No effect",
  mixed: "Mixed",
  descriptive: "Descriptive, with no effect either way",
} as const;
const BASIS_WORDS = {
  full_text_audit: "a full-text audit of a study",
  bounded_absence: "a documented search that found nothing",
  research_correction: "research correcting a common claim",
  // Owner answer 254a: forum threads AskRigor's own reader read.
  forum_read: "forum threads read in full by AskRigor",
} as const;
const DATABASE_WORDS = { pubmed: "PubMed", europepmc: "Europe PMC", ctgov: "ClinicalTrials.gov" } as const;
// Owner answer 252a: how AskRigor read a source, whether its printed figures match its own data, its retraction status,
// where a quote was found, and how studies relate to what people report (HRP FormalAbsenceCannotEraseCommunitySignal's
// four relationships, in plain words).
const READ_WORDS: Readonly<Record<AtlasSourceReading, string>> = {
  full_text_audited: "Full text, with its methods audited by AskRigor",
  search_copy_audited: "Full text, with its methods audited by AskRigor in a copy the AI found, which AskRigor didn’t fetch itself",
  full_text_read: "Full text read; its methods weren’t audited",
  search_copy_read: "Full text read in a copy the AI found, which AskRigor didn’t fetch itself; its methods weren’t audited",
  partial_text: "Part of the full text read; its methods weren’t audited",
  abstract_only: "Abstract only",
  atlas_checked: "Read for an earlier finding checked in the Atlas",
  secondary_only: "Known only through other papers’ accounts of it",
  not_read: "Not read here; its public record only",
};
const FIGURES_WORDS: Readonly<Record<AtlasSourceFigures, string>> = {
  consistent: "Its printed figures match its own data.",
  internally_inconsistent: "Some of its printed figures don’t match its own data.",
};
const RETRACTION_WORDS: Readonly<Partial<Record<AtlasPublishedRetraction, string>>> = {
  retracted: "This paper has been retracted.",
  expression_of_concern: "This paper carries an expression of concern from its journal.",
  corrected_or_updated: "This paper has been corrected or updated since it was published.",
};
const QUOTE_TEXT_WORDS: Readonly<Record<AtlasQuoteText, string>> = {
  full_text: "the full text AskRigor fetched",
  abstract: "its PubMed abstract",
};
const DISAGREEMENT_WORDS: Record<string, string> = {
  dose: "the dose",
  population: "who was studied",
  outcome: "the outcome",
  follow_up: "the follow-up",
  study_quality: "the quality of the studies",
  analysis: "the analysis",
};
const LABEL_WORDS: Record<AtlasLabel, string> = {
  checked: "checked",
  lead: "lead",
  contested: "contested",
  superseded: "superseded",
  withdrawn: "withdrawn",
};
const STATUS_WORDS = {
  unreviewed: NOT_CHECKED_LABEL,
  checked: "Checked by supervisors",
  contested: "Contested",
  lead: "Lead",
  superseded: "Superseded",
} as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})/u;

/** A day as "4 Nov 2026", in a time element; an instant is read as its UTC day. */
function day(value: string): SafeHtml {
  const match = DAY.exec(value);
  if (match === null) return html`${value}`;
  const month = MONTHS[Number(match[2]) - 1];
  if (month === undefined) return html`${value}`;
  return html`<time datetime="${match[0]}">${Number(match[3])} ${month} ${match[1]}</time>`;
}

/** A rate as a percentage with at most one decimal. */
export function percent(events: number, total: number): string {
  return `${outOf100(events / total)}%`;
}

/** A share as a number out of 100, to one decimal place where it has one. */
export function outOf100(share: number): string {
  const rounded = Math.round(1_000 * share) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

/** A difference out of 100 in words: "10 more", "3.5 fewer" or "no difference". */
const differenceWords = (share: number) => {
  const text = outOf100(Math.abs(share));
  return text === "0" ? "no difference" : `${text} ${share > 0 ? "more" : "fewer"}`;
};

const disagreementWords = (disagreement: string | null) =>
  disagreement === null ? "what they found" : DISAGREEMENT_WORDS[disagreement] ?? "how the studies were done";

// Links ---------------------------------------------------------------------------------------------------------------

/** Where a source identifier links, and how it reads: built from the identifier in canonical form only. */
export function sourceLink(identifier: { scheme: string; value: string }): { href: string; text: string } | undefined {
  if (!canonicalIdentifier(identifier)) return undefined;
  switch (identifier.scheme) {
    case "doi":
      return {
        href: `https://doi.org/${identifier.value.split("/").map(encodeURIComponent).join("/")}`,
        text: `${SOURCE_SCHEME_WORDS.doi} ${identifier.value}`,
      };
    case "pmid":
      return { href: `https://pubmed.ncbi.nlm.nih.gov/${identifier.value}/`, text: `${SOURCE_SCHEME_WORDS.pmid} ${identifier.value}` };
    case "pmcid":
      return { href: `https://pmc.ncbi.nlm.nih.gov/articles/${identifier.value}/`, text: `${SOURCE_SCHEME_WORDS.pmcid} ${identifier.value}` };
    case "nct":
      return { href: `https://clinicaltrials.gov/study/${identifier.value}`, text: `${SOURCE_SCHEME_WORDS.nct} ${identifier.value}` };
    default:
      return undefined;
  }
}

export const findingPath = (publicationNumber: string) => `/atlas/findings/${publicationNumber}`;
/** What a finding kept for AskRigor's research says at its top (owner answers 229a and 231a). */
export const KEPT_FOR_RESEARCH_LINE = "Kept for AskRigor’s research: AskRigor draws on this finding when it researches, " +
  "but it isn’t one of the Atlas’s picks, so no list, topic or search on the Atlas shows it.";
export const topicPath = (topicKey: string) => `/atlas/topics/${topicKey}`;
export const MAP_PATH = "/atlas/map";
/** How AskRigor's comment maps work (comment-maps-page.ts); the maps themselves are not shown (owner answer 208b). */
export const COMMENT_MAPS_PATH = "/atlas/comment-maps";
const CANONICAL_ORIGIN = "https://askrigor.com";

/** The label on every finding no person has reviewed yet (owner answer 224a, 2 Nov 2026). */
export const AI_LABEL = "Written by an AI, not yet reviewed by a person";

/** The mark on an unreviewed finding whose claim is strong (the owner, 2 Nov 2026: "the more it needs checking"). */
export const NEEDS_CHECKING_LABEL = "A strong claim: it needs checking";
const needsChecking = (finding: ShownFinding) =>
  finding.status.kind === "unreviewed" && strengthOf(finding).total >= STRONG_CLAIM;

/** Whether every finding a page lists is unreviewed, so the page is kept out of search engines (owner answer 224a). */
export const unreviewedOnly = (findings: readonly ShownFinding[]) => findings.every(({ status }) => status.kind === "unreviewed");

function relatedLink(related: ShownRelated): SafeHtml {
  return related.publicationNumber === null ? html`${related.atlasNumber}`
    : html`<a href="${findingPath(related.publicationNumber)}">${related.publicationNumber}</a>`;
}

// The layout ----------------------------------------------------------------------------------------------------------

export const ACCOUNT_PATH = "/atlas/account";

/** Reader state is supplied only while votes and comments are on; its name is untrusted text. */
export interface AtlasPageReader {
  signInHref: string;
  viewer: null | { displayName: string | null };
  notice?: string | null;
  tenantSignOutHref?: string | null;
}

export interface PageFrame {
  /** The page's own path, for its canonical link; null for a page that answers an error, which has none. */
  path: string | null;
  /**
   * Kept out of search engines (owner answer 224a): a page whose findings are all unreviewed, or not a content page; or
   * a finding kept for AskRigor's research only (owner answers 229a and 231a).
   */
  noindex?: boolean;
  title: string;
  description: string;
  current?: "home" | "changes" | "account" | "findings" | "health" | "topics" | "map" | "search";
  reader?: AtlasPageReader;
  noReferrer?: boolean;
  body: SafeHtml;
}

export function page(frame: PageFrame): string {
  const current = (name: PageFrame["current"]) => frame.current === name ? html` aria-current="page"` : "";
  const reader = frame.reader;
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${frame.description}">
${frame.noReferrer ? html`<meta name="referrer" content="no-referrer">` : ""}
${frame.noindex ? html`<meta name="robots" content="noindex">` : ""}
<title>${frame.title}</title>
${frame.path === null ? "" : html`<link rel="canonical" href="${CANONICAL_ORIGIN}${frame.path}">
`}<link rel="stylesheet" href="/atlas/atlas.css">
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header"><div class="shell masthead">
<a class="brand" href="/atlas">AskRigor Atlas</a>
<nav aria-label="Atlas navigation"><ul class="nav-list">
<li><a href="/atlas"${current("home")}>Atlas home</a></li>
<li><a href="/atlas/findings"${current("findings")}>All findings</a></li>
<li><a href="/atlas/health"${current("health")}>Health</a></li>
<li><a href="/atlas/topics"${current("topics")}>Topics</a></li>
<li><a href="${MAP_PATH}"${current("map")}>Findings map</a></li>
<li><a href="/atlas/changes"${current("changes")}>What changed</a></li>
${reader === undefined ? "" : reader.viewer === null
    ? html`<li><a href="${reader.signInHref}">Sign in</a></li>
` : html`<li><a href="${ACCOUNT_PATH}"${current("account")}>Your account${reader.viewer.displayName
      ? html` (<bdi>${reader.viewer.displayName}</bdi>)` : ""}</a></li>
`}<li><a href="${CANONICAL_ORIGIN}/">AskRigor</a></li>
</ul></nav>
${searchForm("atlas-header-query")}
</div></header>
<main id="content" class="shell">
${reader?.notice ? html`<p class="notice-line" role="status">${reader.notice}</p>
` : ""}${reader?.tenantSignOutHref ? tenantSignOutLine(reader.tenantSignOutHref) : ""}
${frame.body}
</main>
<footer class="site-footer"><div class="shell footer-row">
<p>The Atlas is not medical advice. Its findings are written without the people whose research produced them.</p>
<nav aria-label="Footer navigation"><ul class="nav-list">
<li><a href="${CANONICAL_ORIGIN}/privacy">Privacy</a></li>
<li><a href="${CANONICAL_ORIGIN}/terms">Terms</a></li>
<li><a href="${CANONICAL_ORIGIN}/support">Support</a></li>
</ul></nav>
</div></footer>
</body>
</html>
`.value;
}

function tenantSignOutLine(href: string): SafeHtml {
  return html`<p class="aside">The AskRigor login itself may still remember you in this browser: <a href="${href}">sign out of it too</a>, so that the next sign-in asks for your password.</p>
`;
}

const shortened = (text: string, length: number) =>
  text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;

/** Queries may themselves name a forbidden card or host. Numeric entities show the exact escaped text without
 * confusing the stored-content guard with user input. No input ever becomes markup, a source URL or a log entry. */
const queryText = (text: string) => new SafeHtml(Array.from(text,
  (character) => `&#${character.codePointAt(0)!};`).join(""));
const queryParameter = (text: string) => Array.from(new TextEncoder().encode(text),
  (byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");

function searchForm(id: string, query = ""): SafeHtml {
  return html`<form class="atlas-search" role="search" method="get" action="/atlas/search">
<label for="${id}">Search findings</label>
<input id="${id}" name="q" type="search" maxlength="${ATLAS_SEARCH_MAX_LENGTH}" value="${queryText(query)}">
<button type="submit">Search</button>
</form>`;
}

const FILTER_WORDS = { all: "All", checked: "Checked", unreviewed: NOT_CHECKED_LABEL, contested: "Contested" } as const;

export function renderAtlasFindings(model: AtlasFindingsModel, reader?: AtlasPageReader): string {
  const filters = Object.entries(FILTER_WORDS).map(([filter, label]) => html`<li><a
href="/atlas/findings?filter=${filter}"${filter === model.filter ? html` aria-current="page"` : ""}>${label}</a></li>`);
  return page({ path: "/atlas/findings", title: "All findings | AskRigor Atlas", current: "findings", reader,
    noindex: unreviewedOnly(model.findings),
    description: "Every finding published in the AskRigor Atlas, newest first.",
    body: html`<h1>All findings</h1><p>Every publication on the Atlas, newest first.</p>
<nav aria-label="Filter findings"><ul class="nav-list">${filters}</ul></nav>
${model.findings.length === 0 ? html`<p>No findings in this list yet.</p>` : findingList(model.findings)}
${model.before === null ? "" : html`<p><a rel="next" href="/atlas/findings?filter=${model.filter}&amp;before=${model.before}">Older findings</a></p>`}` });
}

export function renderAtlasTopics(model: AtlasTopicsModel, reader?: AtlasPageReader): string {
  return page({ path: "/atlas/topics", title: "Topics | AskRigor Atlas", current: "topics", reader,
    description: "Topics with published findings in the AskRigor Atlas.",
    body: html`<h1>Topics</h1>
${model.topics.length === 0 ? html`<p>No topics have findings yet.</p>` : html`<ul>${model.topics.map((topic) =>
      html`<li><a href="${topicPath(topic.key)}">${topic.label}</a> — ${topic.count} ${topic.count === 1 ? "finding" : "findings"}</li>`)}</ul>`}
<p>${model.withoutTopic} ${model.withoutTopic === 1 ? "finding has" : "findings have"} no topic (older cards). <a href="/atlas/findings">Browse all findings</a>.</p>
<p><a href="${MAP_PATH}">See the topics on the findings map</a></p>` });
}

const FOUND_IN_WORDS: Record<AtlasSearchField, string> = {
  wording: "the wording",
  question: "the question",
  usual_answer: "the usual answer",
  applies_to: "whom it applies to",
  subject: "the subject",
  topic: "the topic",
  why_not_usual: "why it isn’t the usual answer",
  what_would_change_it: "what would change it",
  numbers: "the numbers",
  research: "the research behind it",
  people: "what people report",
  searches: "what was searched",
  sources: "the sources",
  number: "its number",
};

/** How many matches a search lists across its pages. */
const LISTED_RESULTS = ATLAS_SEARCH_MAX_PAGE * ATLAS_FINDINGS_PER_PAGE;
const count = (value: number) => value.toLocaleString("en-US");

const searchPageHref = (text: string, page: number) =>
  `/atlas/search?q=${queryParameter(text)}${page === 1 ? "" : `&amp;page=${page}`}`;

export function renderAtlasSearch(model: { text: string; message: string | null; results: AtlasSearchModel | null },
  reader?: AtlasPageReader): string {
  const results = model.results;
  const pager: SafeHtml[] = [];
  if (results !== null && results.page > 1) {
    pager.push(html`<a rel="prev" href="${new SafeHtml(searchPageHref(model.text, Math.min(results.page - 1, results.pages)))}">Previous results</a>`);
  }
  if (results !== null && results.page < results.pages) {
    pager.push(html`<a rel="next" href="${new SafeHtml(searchPageHref(model.text, results.page + 1))}">Next results</a>`);
  }
  // Search never carries account state, a canonical query URL, form tokens or a personalized header.
  return page({ path: null, title: "Search findings | AskRigor Atlas", current: "search", reader, noReferrer: true,
    noindex: true,
    description: "Search the public findings in the AskRigor Atlas.",
    body: html`<h1>Search findings</h1>
${searchForm("atlas-query", model.text)}
<p>Search reads each finding’s whole text: its wording, question, whom it applies to, subject, topic, numbers, searches, why it isn’t the usual answer, what would change it, its sources and its number.</p>
<ul>
<li>Every word you type must be there. Case and accents don’t matter.</li>
<li>A word can be part of a longer one (for example, vitamin also finds vitamins). A word of one or two letters of an alphabet with capitals or digits (for example, the D in vitamin D, MS or D3) counts only where it stands on its own, and a number never counts inside a longer number (for example, 50 doesn’t find 500).</li>
<li>Findings whose wording holds all your words come first. Then whole words come before parts of words, your words as you typed them (for example a number such as P-1003, or a phrase) before the same words apart, stronger claims before weaker ones, and newer findings before older ones.</li>
</ul>
${model.message === null ? "" : html`<p role="status">${model.message}</p>`}
${results === null ? "" : html`<h2>Results for “${queryText(model.text)}”</h2>
<p role="status">${results.total === 0 ? "No findings match these words."
    : results.total > LISTED_RESULTS ? html`${count(results.total)} findings match; the first ${count(LISTED_RESULTS)} are listed, page ${results.page} of ${results.pages}. Add words to narrow the search.`
      : html`${count(results.total)} ${results.total === 1 ? "finding matches" : "findings match"}${results.pages === 1 ? "" : html`, page ${results.page} of ${results.pages}`}.`}</p>
${results.results.length === 0 ? (results.total === 0 ? "" : html`<p>There are no results on this page. <a href="${new SafeHtml(searchPageHref(model.text, 1))}">Go to the first page of results</a>.</p>`)
    : html`<ul class="finding-list">
${results.results.map(({ finding, foundIn }) => findingItem(finding,
    html`<p class="meta">Found in ${joined(foundIn.map((field) => html`${FOUND_IN_WORDS[field]}`), ", ")}.</p>`))}</ul>`}
${pager.length === 0 ? "" : html`<nav aria-label="Search result pages"><p>${joined(pager, " · ")}</p></nav>`}`}` });
}

// A finding in a list ---------------------------------------------------------------------------------------------------

function badge(finding: ShownFinding): SafeHtml {
  return html`<p class="badge badge-${finding.status.kind}">${STATUS_WORDS[finding.status.kind]}</p>${needsChecking(finding)
    ? html` <p class="badge badge-needs-checking">${NEEDS_CHECKING_LABEL}</p>` : ""}${finding.status.kind === "unreviewed"
    ? html`<p class="ai-label">${AI_LABEL}</p>` : ""}`;
}

function findingItem(finding: ShownFinding, extra: SafeHtml | "" = ""): SafeHtml {
  const facts: SafeHtml[] = [];
  if (finding.certainty !== null) facts.push(html`How sure: ${CERTAINTY_WORDS[finding.certainty]}`);
  if (finding.appliesTo !== null) facts.push(html`For: ${finding.appliesTo}`);
  if (finding.topic !== null) facts.push(html`<a href="${topicPath(finding.topic.key)}">${finding.topic.label}</a>`);
  if (finding.status.kind === "unreviewed") {
    if (finding.savedOn !== null) facts.push(html`Saved ${day(finding.savedOn)}`);
  } else {
    facts.push(html`${finding.status.kind === "lead" ? "Reviewed" : "Checked"} ${day(finding.status.checkedOn)}`);
  }
  return html`<li class="finding">
${badge(finding)}
${questionLine(finding)}
<p class="finding-claim"><a href="${findingPath(finding.publicationNumber)}">${finding.claim}</a></p>
<p class="meta">${joined(facts, " · ")}</p>
${extra === "" ? "" : html`${extra}
`}</li>
`;
}

/**
 * The question a listed finding's research answered, so a finding is never listed as a bare sentence; one published
 * without it says so (its topic follows in the facts line).
 */
function questionLine(finding: ShownFinding): SafeHtml {
  return finding.question === null
    ? html`<p class="finding-question">Published without its question${finding.topic === null ? " or a topic" : ""}</p>`
    : html`<p class="finding-question">Question: ${finding.question}</p>`;
}

export function findingList(findings: readonly ShownFinding[]): SafeHtml {
  return html`<ul class="finding-list">
${findings.map((finding) => findingItem(finding))}</ul>`;
}

// The home page ---------------------------------------------------------------------------------------------------------

/**
 * The owner's "most important now" picks with their reasons (decision 2a). The owner action that sets them comes later;
 * until it does, the home model has none and this renders nothing.
 */
function ownerPicks(picks: readonly AtlasOwnerPick[]): SafeHtml | "" {
  if (picks.length === 0) return "";
  return html`<section aria-labelledby="most-important">
<h2 id="most-important">Most important now</h2>
<ul class="finding-list">
${picks.map(({ finding, reason }) => findingItem(finding, html`<p class="reason">Why it is here: ${reason}</p>`))}</ul>
</section>
`;
}

function contestedItem(pair: AtlasContestedPair): SafeHtml {
  const [first, second] = pair.findings;
  const words = disagreementWords(pair.disagreement);
  const summary = second === undefined
    ? html`Another checked finding disagrees with it on ${words}.`
    : html`These two checked findings disagree on ${words}.`;
  return html`<li class="contested-pair">
<p class="meta">${summary}</p>
<ul class="finding-list">
${findingItem(first!)}${second === undefined ? "" : findingItem(second)}</ul>
</li>
`;
}

export function renderAtlasHome(model: AtlasHomeModel, reader?: AtlasPageReader): string {
  const body = html`<p class="eyebrow">Public research findings</p>
<h1>AskRigor Atlas</h1>
<p class="lede">Findings from research done with AskRigor, written without the people who asked.</p>
<div class="notice">
<p>A finding reaches these pages once a separate AI finds that a quick AI answer misses it, marked “${NOT_CHECKED_LABEL}” until AskRigor’s owner has reviewed it. A reviewed finding shows the wording the owner accepted, its Atlas number and the day it was checked; a rejected one leaves these pages.</p>
<p>How sure each finding is shows AskRigor’s rating, not a formal GRADE assessment. Rates and the numbers needed to treat or harm are worked out from each group’s counts. Nothing here is medical advice.</p>
</div>
${ownerPicks(model.picks)}<section aria-labelledby="strongest-checked">
<h2 id="strongest-checked">Strongest checked findings</h2>
<p>${STRENGTH_RULE} Only findings checked by supervisors are listed here; an unreviewed strong claim is marked “${NEEDS_CHECKING_LABEL}”.</p>
${model.strongestChecked.length === 0 ? html`<p>No finding has been checked by supervisors yet.</p>`
    : findingList(model.strongestChecked)}
</section>
<section aria-labelledby="recently-published">
<h2 id="recently-published">Recently published</h2>
${model.recentlyPublished.length === 0 ? html`<p>Nothing is published yet.</p>` : findingList(model.recentlyPublished)}
</section>
<section aria-labelledby="recently-checked">
<h2 id="recently-checked">Recently checked</h2>
${model.recentlyChecked.length === 0 ? html`<p>No finding has been checked by supervisors yet.</p>`
    : findingList(model.recentlyChecked)}
</section>
${model.contested.length === 0 ? "" : html`<section aria-labelledby="contested">
<h2 id="contested">Contested</h2>
<p>Checked findings that another checked finding disagrees with.</p>
<ul class="pair-list">
${model.contested.map(contestedItem)}</ul>
</section>
`}<section aria-labelledby="comment-maps">
<h2 id="comment-maps">Comment maps</h2>
<p>AskRigor maps what the people who commented under a health video say happened when they tried its method. The maps are kept privately for now, so none is shown here. <a href="${COMMENT_MAPS_PATH}">How comment maps work, what they can’t show, and why they aren’t here</a></p>
</section>
<p><a href="${MAP_PATH}">See every finding on the findings map</a> · <a href="/atlas/changes">See what changed in the Atlas</a></p>`;
  return page({
    path: "/atlas",
    noindex: unreviewedOnly([...model.picks.map(({ finding }) => finding), ...model.strongestChecked, ...model.recentlyPublished,
      ...model.recentlyChecked, ...model.contested.flatMap(({ findings }) => findings)]),
    title: "AskRigor Atlas",
    description: "Findings from research done with AskRigor, written without the people who asked.",
    current: "home",
    reader,
    body,
  });
}

// A topic page ----------------------------------------------------------------------------------------------------------

const SECTION_NOTES: Partial<Record<AtlasTopicModel["sections"][number]["id"], string>> = {
  leads: "AskRigor’s owner kept these as leads: no full-text audit, documented search, research correction or forum reading backs them yet.",
  earlier: "Newer findings replace these.",
};

const MAP_PANEL_SIZE = 12;
const MAP_COLUMNS = ["High", "Moderate", "Low", "Very low", "Not checked yet", "Open leads", "Unrated"];
const RELATION_WORDS = { same_as: "same as", narrows: "narrows", contradicts: "contradicts", replaces: "replaces" } as const;
const mapColumn = (finding: ShownFinding) => finding.status.kind === "unreviewed" ? 4
  : finding.status.kind === "lead" ? 5 : finding.certainty === null ? 6
    : ["high", "moderate", "low", "very_low"].indexOf(finding.certainty);
const WORDS = new Intl.Segmenter(undefined, { granularity: "word" });
// A wide character (Chinese, Japanese and Korean scripts, full-width forms) takes two columns of a label.
const WIDE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/u;
const columns = (text: string) => Array.from(text).reduce((sum, character) => sum + (WIDE.test(character) ? 2 : 1), 0);
// Closing punctuation never starts a line: it stays with the word before it.
const CLOSING = /^[\p{Pe}\p{Pf}\p{Po}]+$/u;

/**
 * A text in at most `lines` lines of at most `width` columns, broken between words as Unicode's word boundaries find
 * them in any script (Chinese, Japanese and Thai included); only a word longer than a line is cut. When text is left
 * over, the last line ends with "…", by whole words where it can.
 */
export function wrapWords(text: string, width: number, lines: number): string[] {
  const out: string[] = [];
  let line = "";
  let space = false;
  let leftOver = false;
  /** Starts a line with a segment, cutting a word longer than a line; false when no line is left. */
  const start = (segment: string): boolean => {
    let rest = segment;
    while (columns(rest) > width) {
      if (out.length === lines) return false;
      let head = "";
      for (const character of Array.from(rest)) {
        if (columns(head + character) > width) break;
        head += character;
      }
      out.push(head);
      rest = rest.slice(head.length);
    }
    if (out.length === lines) return false;
    line = rest;
    return true;
  };
  for (const { segment } of WORDS.segment(text.replace(/\s+/gu, " ").trim())) {
    if (segment === " ") {
      space = line !== "";
      continue;
    }
    const joined = `${line}${space ? " " : ""}${segment}`;
    space = false;
    if (line !== "" && (columns(joined) <= width || CLOSING.test(segment) && !joined.endsWith(` ${segment}`))) {
      line = joined;
      continue;
    }
    if (line !== "") {
      out.push(line);
      line = "";
    }
    if (!start(segment)) {
      leftOver = true;
      break;
    }
  }
  if (line !== "") {
    if (out.length < lines) out.push(line);
    else leftOver = true;
  }
  if (leftOver && out.length > 0) {
    let last = out.at(-1)!;
    while (columns(last) + 1 > width) {
      const words = [...WORDS.segment(last)].map(({ segment }) => segment);
      last = words.length > 1 ? words.slice(0, -1).join("").trimEnd()
        : Array.from(last).slice(0, -1).join("");
    }
    out[out.length - 1] = `${last}…`;
  }
  return out;
}

const chunks = <T,>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

/** Small diagrams keep labels and edges legible without a script or a giant dense graph. Finding panels place
 * nodes by certainty; relationship panels draw each directed link separately, including cross-topic links. */
function topicMap(model: AtlasTopicModel): SafeHtml {
  const findings = model.sections.flatMap(({ findings }) => findings);
  const questions = [...new Set(findings.flatMap(({ question }) => question === null ? [] : [question]))];
  // A finding published without its question is placed by its topic instead (the plan of 2 November 2026).
  const topicWords = (finding: ShownFinding) => `Topic: ${finding.topic?.label ?? model.topic.label}`;
  const questionNumber = (finding: ShownFinding) => finding.question === null ? topicWords(finding)
    : `Q${questions.indexOf(finding.question) + 1}`;
  const questionPanels = chunks(questions, MAP_PANEL_SIZE).map((panel, index) => html`<div class="map-scroll">
<svg class="topic-map" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 ${panel.length * 48 + 40}"
width="1120" height="${panel.length * 48 + 40}" role="img" aria-labelledby="questions-title-${index}">
<title id="questions-title-${index}">${model.topic.label}: questions, part ${index + 1}</title>
${panel.map((question, row) => {
    const finding = findings.find((finding) => finding.question === question)!;
    const y = row * 48 + 36;
    return html`<a href="${findingPath(finding.publicationNumber)}"><title>${question}</title>
<rect class="map-node" x="8" y="${y - 22}" width="1100" height="36" rx="5"/>
<text x="18" y="${y}">${questionNumber(finding)}: ${wrapWords(question, 125, 1)[0] ?? ""}</text></a>`;
  })}</svg></div>`);
  const panels = chunks(findings, MAP_PANEL_SIZE).map((panel, index) => {
    const rows = MAP_COLUMNS.map((_, column) => panel.filter((finding) => mapColumn(finding) === column));
    const height = 65 + Math.max(1, ...rows.map(({ length }) => length)) * 88;
    return html`<div class="map-scroll"><svg class="topic-map" xmlns="http://www.w3.org/2000/svg"
viewBox="0 0 1120 ${height}" width="1120" height="${height}" role="img" aria-labelledby="map-title-${index} map-desc-${index}">
<title id="map-title-${index}">${model.topic.label}: findings, part ${index + 1}</title>
<desc id="map-desc-${index}">Columns group checked findings by certainty, with unreviewed findings and open leads apart. Q numbers refer to the questions in the text alternative below. Each node links to its finding.</desc>
${rows.map((column, col) => html`<text class="map-heading" x="${col * 160 + 8}" y="25">${MAP_COLUMNS[col]}</text>
${column.map((finding, row) => {
      const x = col * 160 + 8;
      const y = 45 + row * 88;
      const [first = "", second = ""] = wrapWords(finding.claim, 19, 2);
      return html`<a href="${findingPath(finding.publicationNumber)}">
<title>${finding.publicationNumber}: ${finding.question ?? topicWords(finding)}. ${finding.claim}. ${STATUS_WORDS[finding.status.kind]}.</title>
<rect class="map-node" x="${x}" y="${y}" width="144" height="78" rx="5"/>
<text x="${x + 6}" y="${y + 17}">${finding.question === null ? finding.publicationNumber
        : `${finding.publicationNumber} · ${questionNumber(finding)}`}</text>
<text x="${x + 6}" y="${y + 36}">${first}</text>
<text x="${x + 6}" y="${y + 54}">${second}</text>
</a>`;
    })}`)}
</svg></div>`;
  });
  const edges = chunks(model.connections, MAP_PANEL_SIZE).map((panel, index) => html`<div class="map-scroll">
<svg class="topic-map map-links" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${panel.length * 60 + 40}"
width="760" height="${panel.length * 60 + 40}" role="img" aria-labelledby="links-title-${index}">
<title id="links-title-${index}">${model.topic.label}: connections, part ${index + 1}</title>
${panel.map((link, row) => {
    const y = row * 60 + 36;
    return html`<a href="${findingPath(link.from.publicationNumber!)}"><rect class="map-node" x="10" y="${y - 20}" width="180" height="35" rx="5"/>
<text x="24" y="${y + 2}">${link.from.publicationNumber}</text></a>
<path class="map-edge" d="M 195 ${y} H 540 l -8 -5 m 8 5 l -8 5"/>
<text x="310" y="${y - 7}">${RELATION_WORDS[link.relation]}</text>
<a href="${findingPath(link.to.publicationNumber!)}"><rect class="map-node" x="550" y="${y - 20}" width="180" height="35" rx="5"/>
<text x="564" y="${y + 2}">${link.to.publicationNumber}</text></a>`;
  })}</svg></div>`);
  return html`<section aria-labelledby="topic-map"><h2 id="topic-map">Topic map</h2>
<p>Findings by certainty, with open leads and findings not checked yet apart. Q numbers identify the questions below. Connections point from the first finding to the second.</p>
${questionPanels}
${findings.length === 0 ? html`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60" role="img" aria-label="No findings yet"><text x="10" y="35">No findings yet</text></svg>` : panels}
${edges}
<section aria-labelledby="map-text"><h3 id="map-text">Topic map: text alternative</h3>
${questions.length === 0 ? html`<p>No public questions recorded yet.</p>` : html`<ul>${questions.map((question, index) =>
    html`<li>Q${index + 1}: ${question}</li>`)}</ul>`}
${findings.length === 0 ? html`<p>No findings yet.</p>` : html`<ul>${findings.map((finding) => html`<li>
<a href="${findingPath(finding.publicationNumber)}">${finding.publicationNumber}: ${finding.claim}</a>.
${questionNumber(finding)}. ${STATUS_WORDS[finding.status.kind]}.
${finding.certainty === null ? "Certainty not recorded" : html`Certainty: ${CERTAINTY_WORDS[finding.certainty]}`}.
${finding.status.kind === "lead" ? html`Open lead: ${finding.whatWouldChangeIt ?? "Further evidence needed"}.` : ""}
</li>`)}</ul>`}
${model.connections.length === 0 ? html`<p>No connections recorded between public findings.</p>` : html`<ul>${model.connections.map((link) =>
    html`<li>${relatedLink(link.from)} ${RELATION_WORDS[link.relation]} ${relatedLink(link.to)}.</li>`)}</ul>`}
</section></section>`;
}

export function renderAtlasTopic(model: AtlasTopicModel, reader?: AtlasPageReader): string {
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<h1>${model.topic.label}</h1>
<p class="lede">Findings about ${model.topic.label}. Within each part, findings checked by supervisors come first.</p>
${topicMap(model)}
${model.sections.map((section) => html`<section aria-labelledby="part-${section.id}">
<h2 id="part-${section.id}">${section.heading}</h2>
${SECTION_NOTES[section.id] === undefined ? "" : html`<p>${SECTION_NOTES[section.id]!}</p>`}
${findingList(section.findings)}
</section>
`)}`;
  return page({
    path: topicPath(model.topic.key),
    noindex: unreviewedOnly(model.sections.flatMap(({ findings }) => findings)),
    reader,
    title: `${model.topic.label} | AskRigor Atlas`,
    description: `Findings about ${model.topic.label} in the AskRigor Atlas.`,
    body,
  });
}

// The findings map ------------------------------------------------------------------------------------------------------

/** A circle's radius for its points: its area grows with the points, so 0 points still draws a circle. */
export const mapRadius = (points: number) => Math.round(80 * Math.sqrt(points + 1)) / 10;
const MAP_GAP = 4;
const MAP_ISLAND_MARGIN = 8;
const MAP_PADDING = 6;
const MAP_MIN_WIDTH = 280;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const round = (value: number) => Math.round(value * 10) / 10;

/**
 * A topic's cluster, packed around its centre in the topic's order: the first circle in the middle, and each next one
 * on its own ray of a sunflower spiral (turning by the golden angle), as close to the middle as it fits beside the
 * circles already placed. Deterministic; rounded to a tenth, which the gap absorbs.
 */
export function clusterLayout(radii: readonly number[]): { centres: Array<{ x: number; y: number }>; extent: number } {
  const centres: Array<{ x: number; y: number }> = [];
  radii.forEach((radius, index) => {
    const angle = index * GOLDEN_ANGLE;
    for (let distance = 0; ; distance += 1) {
      const centre = { x: round(distance * Math.cos(angle)), y: round(distance * Math.sin(angle)) };
      if (centres.every((other, before) => Math.hypot(centre.x - other.x, centre.y - other.y) >= radius + radii[before]! + MAP_GAP)) {
        centres.push(centre);
        return;
      }
    }
  });
  return { centres, extent: Math.max(0, ...centres.map(({ x, y }, index) => Math.hypot(x, y) + radii[index]!)) };
}

/** Where a finding's points come from, in the rule's order. */
const pointWords = ({ finding, points }: AtlasMapFinding): string[] => [
  points.checked === 0 ? "" : "checked by supervisors +2",
  points.certainty === 0 ? "" : finding.certainty === "high" ? "high certainty +2" : "moderate certainty +1",
  points.numbers === 0 ? "" : "counted results +1",
  points.sources === 0 ? "" : "two or more sources +1",
  points.recent === 0 ? "" : `new in the last ${ATLAS_MAP_NEW_DAYS} days +1`,
].filter((words) => words !== "");
const pointsText = (total: number) => `${total} ${total === 1 ? "point" : "points"}`;

/** The marks a status draws: a solid disc, a ring, or a light disc with a dashed outline. */
function statusMarks(kind: ShownFinding["status"]["kind"], x: number, y: number, radius: number): SafeHtml {
  if (kind === "contested") {
    return html`<circle class="map-mark map-contested" cx="${x}" cy="${y}" r="${radius}"/><circle class="map-hole" cx="${x}" cy="${y}" r="${round(radius * 0.45)}"/>`;
  }
  const style = kind === "unreviewed" ? "map-unreviewed" : "map-checked";
  return html`<circle class="map-mark ${style}" cx="${x}" cy="${y}" r="${radius}"/>`;
}

function cluster(topic: AtlasMapTopic, headingId: string): SafeHtml {
  const radii = topic.findings.map(({ points }) => mapRadius(points.total));
  const { centres, extent } = clusterLayout(radii);
  const island = round(extent + MAP_ISLAND_MARGIN);
  const width = Math.ceil(Math.max(MAP_MIN_WIDTH, 2 * (island + MAP_PADDING)));
  const height = Math.ceil(2 * (island + MAP_PADDING));
  const cx = width / 2;
  const cy = height / 2;
  return html`<svg class="map-cluster" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="group" aria-labelledby="${headingId}">
<circle class="map-island" cx="${cx}" cy="${cy}" r="${island}"/>
${topic.findings.map((entry, index) => {
    const { finding, points } = entry;
    return html`<a href="${findingPath(finding.publicationNumber)}"><title>${finding.publicationNumber}: ${finding.claim} (${STATUS_WORDS[finding.status.kind]}; ${pointsText(points.total)})</title>
${statusMarks(finding.status.kind, round(cx + centres[index]!.x), round(cy + centres[index]!.y), radii[index]!)}</a>
`;
  })}</svg>`;
}

function topicCounts(topic: AtlasMapTopic): SafeHtml {
  const kinds = topic.findings.map(({ finding }) => finding.status.kind);
  const checked = kinds.filter((kind) => kind === "checked").length;
  const contested = kinds.filter((kind) => kind === "contested").length;
  const unreviewed = kinds.filter((kind) => kind === "unreviewed").length;
  const parts = [
    checked === 0 ? "" : `${checked} checked by supervisors`,
    contested === 0 ? "" : `${contested} contested`,
    unreviewed === 0 ? "" : `${unreviewed} not checked by supervisors yet`,
  ].filter((part) => part !== "");
  const shown = topic.findings.length;
  return html`${topic.count} ${topic.count === 1 ? "finding" : "findings"}${shown < topic.count ? html`, ${shown} on the map` : ""}: ${parts.join(", ")}.`;
}

const topicName = (topic: AtlasMapTopic) => topic.topic?.label ?? "No topic (older cards)";
const topicHref = (topic: AtlasMapTopic) => topic.topic === null ? "/atlas/findings" : topicPath(topic.topic.key);

function legendSwatch(kind: "checked" | "contested" | "unreviewed"): SafeHtml {
  return html`<svg class="map-swatch" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${statusMarks(kind, 12, 12, 9)}</svg>`;
}

export function renderAtlasMap(model: AtlasMapModel, reader?: AtlasPageReader): string {
  const sizes = [0, 3, 7];
  const sizeWidth = sizes.reduce((sum, points) => sum + 2 * mapRadius(points) + 8, 0);
  const sizeHeight = Math.ceil(2 * mapRadius(sizes.at(-1)!) + 4);
  let sizeX = 0;
  const sizeLegend = html`<svg class="map-swatch map-sizes" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(sizeWidth)} ${sizeHeight}" width="${Math.ceil(sizeWidth)}" height="${sizeHeight}" aria-hidden="true">${sizes.map((points) => {
    const radius = mapRadius(points);
    const x = round(sizeX + radius + 4);
    sizeX += 2 * radius + 8;
    return html`<circle class="map-mark map-size" cx="${x}" cy="${sizeHeight / 2}" r="${radius}"/>`;
  })}</svg>`;
  const rule = html`<section class="notice" aria-labelledby="map-rule">
<h2 id="map-rule">How the map is drawn</h2>
<p>Each finding gets points for what the Atlas holds about it, and more points draw a bigger circle:</p>
<ul>
<li>2 if supervisors checked it;</li>
<li>2 if AskRigor rated it high certainty, 1 if moderate;</li>
<li>1 if its page shows counted results for each group;</li>
<li>1 if its page links to two or more sources;</li>
<li>1 if it was published or checked in the last ${ATLAS_MAP_NEW_DAYS} days.</li>
</ul>
<p>In each topic, the stronger claims come first, in the middle of its cluster, then findings with more points, then the newest. ${STRENGTH_RULE} Topics with more findings come first. Leads, and findings a newer one replaced, are on each topic’s page instead.</p>
<p><strong>The map is not a ranking of treatments and not a recommendation.</strong> Nothing in the rule depends on what a finding says: a big circle can be a harm, a treatment that did nothing, or a search that found nothing. AskRigor’s certainty is its own rating, not a formal GRADE assessment, and nothing here is medical advice.</p>
</section>`;
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<h1>Findings map</h1>
<p class="lede">Published findings as circles, one cluster per topic. A bigger circle is a finding the Atlas holds more about, not a treatment that works better. Open a circle to read its finding.</p>
<ul class="map-legend" aria-label="Map key">
<li>${legendSwatch("checked")} Checked by supervisors</li>
<li>${legendSwatch("contested")} Contested: another checked finding disagrees</li>
<li>${legendSwatch("unreviewed")} ${NOT_CHECKED_LABEL}</li>
<li>${sizeLegend} 0, 3 and 7 points</li>
</ul>
${model.topics.length === 0 ? html`<p>Nothing is published yet.</p>
${rule}` : html`<p><a href="#map-rule">How the map is drawn</a> · <a href="#map-list">Skip the map and read it as a list</a></p>
<section aria-labelledby="map-topics">
<h2 id="map-topics">Topics</h2>
<div class="map-grid">
${model.topics.map((topic, index) => html`<section class="map-topic" aria-labelledby="map-topic-${index + 1}">
<h3 id="map-topic-${index + 1}"><a href="${topicHref(topic)}">${topicName(topic)}</a></h3>
<p class="meta">${topicCounts(topic)}</p>
${cluster(topic, `map-topic-${index + 1}`)}
${topic.findings.length < topic.count ? html`<p class="meta"><a href="${topicHref(topic)}">See all ${topic.count} on ${topic.topic === null ? "the list of all findings" : "the topic’s page"}</a></p>
` : ""}</section>
`)}</div>
</section>
${rule}
<section aria-labelledby="map-list">
<h2 id="map-list">The map as a list</h2>
<p>The same findings, topic by topic, in the map’s order, each with its points.</p>
${model.topics.map((topic) => html`<h3>${topicName(topic)}</h3>
<ul class="finding-list">
${topic.findings.map((entry) => {
    const reasons = pointWords(entry);
    return findingItem(entry.finding, html`<p class="meta">On the map: ${pointsText(entry.points.total)}${reasons.length === 0 ? "" : ` (${reasons.join(", ")})`}.</p>`);
  })}</ul>
`)}</section>`}`;
  return page({
    path: MAP_PATH,
    noindex: unreviewedOnly(model.topics.flatMap(({ findings }) => findings.map(({ finding }) => finding))),
    title: "Findings map | AskRigor Atlas",
    description: "Published findings in the AskRigor Atlas as circles, one cluster per topic, sized by a stated rule.",
    current: "map",
    reader,
    body,
  });
}

// A finding page --------------------------------------------------------------------------------------------------------

function statusBlock(finding: ShownFinding): SafeHtml {
  const status = finding.status;
  if (status.kind === "unreviewed") {
    return html`<div class="status status-unreviewed">
<p class="status-label">${NOT_CHECKED_LABEL}</p>
<p class="ai-label">${AI_LABEL}.</p>
${needsChecking(finding) ? html`<p class="badge badge-needs-checking">${NEEDS_CHECKING_LABEL}</p>
` : ""}<p>${finding.kept ? "" : "A separate AI found that a quick AI answer misses it. "}AskRigor’s owner has not reviewed it yet.${needsChecking(finding)
    ? " Its claim is strong, so it needs checking before anyone relies on it." : ""}</p>
</div>`;
  }
  const checked = html`AskRigor’s owner checked it on ${day(status.checkedOn)}.`;
  let detail: SafeHtml;
  switch (status.kind) {
    case "checked":
      detail = checked;
      break;
    case "contested": {
      const partners = finding.contested;
      detail = partners.length === 0
        ? html`${checked} Another checked finding disagrees with it.`
        : html`${checked} ${partners.map((partner, index) => html`${index === 0 ? "" : " "}${relatedLink(partner)} disagrees with it on ${disagreementWords(partner.disagreement)}.`)}`;
      break;
    }
    case "lead":
      detail = html`AskRigor’s owner reviewed it on ${day(status.checkedOn)} and kept it as a lead: no verified basis backs it yet.`;
      break;
    case "superseded":
      detail = finding.replacedBy.length === 0 ? html`${checked} A newer finding replaces it.`
        : html`${checked} A newer finding replaces it: ${joined(finding.replacedBy.map(relatedLink), ", ")}.`;
      break;
  }
  return html`<div class="status status-${status.kind}">
<p class="status-label">${STATUS_WORDS[status.kind]}</p>
<p>${detail}</p>
</div>`;
}

function figure(entry: ShownNumber): SafeHtml {
  const counts = {
    option: entry.option,
    option_events: entry.optionEvents,
    option_total: entry.optionTotal,
    comparator: entry.comparator,
    comparator_events: entry.comparatorEvents,
    comparator_total: entry.comparatorTotal,
  };
  // The two groups and the difference between their rates, by the helpers finalize_research and the owner's
  // acceptance check figures with.
  const [option, comparator] = binaryGroups(counts);
  const contrast = binaryContrast(counts);
  // Owner answer 225a: the difference out of 100 with its 95% range, and a number needed only when the range leaves
  // out no difference.
  const range = differenceRange(counts);
  const difference = html`<p>Difference: ${differenceWords(range.difference)} out of 100 with ${option.name} than with ${comparator.name} (95% range: ${differenceWords(range.lower)} to ${differenceWords(range.upper)}).</p>
`;
  let needed: SafeHtml;
  if (contrast === undefined) {
    needed = html`The two groups’ rates are the same, so there is no number needed to treat or harm.`;
  } else if (!range.clear) {
    needed = html`<strong>No clear difference</strong>: the range includes no difference, so there is no number needed to treat or harm.`;
  } else {
    // The option did better when a larger share had an outcome more people should have, or a smaller share one fewer
    // should (atlasNumbersProblems reads it the same way).
    const optionBetter = contrast.optionHigher === (entry.better === "more");
    needed = html`<strong>Number needed to ${optionBetter ? "treat" : "harm"}: ${contrast.roundedUp}</strong>. About 1 in ${contrast.roundedUp} ${contrast.optionHigher ? "more" : "fewer"} people had this outcome with ${option.name} than with ${comparator.name}.`;
  }
  return html`<figure class="figure">
<figcaption><strong>${withoutEndPunctuation(entry.outcome)}</strong>, over ${withoutEndPunctuation(entry.followUp)} (${entry.better === "more" ? "more" : "fewer"} is better)</figcaption>
<table>
<thead><tr><th scope="col">Group</th><th scope="col">People with the outcome</th><th scope="col">Out of 100</th></tr></thead>
<tbody>
${[option, comparator].map(({ name, events, total }) => html`<tr><th scope="row">${name}</th><td>${events} of ${total}</td><td>${outOf100(events / total)}</td></tr>
`)}</tbody>
</table>
${difference}<p>${needed}</p>
${entry.harmsNoneFound ? html`<p>No harms were found over the same follow-up.</p>` : ""}${entry.source === null ? ""
    : html`<p class="meta">From ${sourceName(entry.source)}.</p>
`}</figure>
`;
}

/** A source by its title and year, or its first identifier when no public record gave a title. */
function sourceName(entry: ShownSource): SafeHtml {
  if (entry.title !== null) return html`<cite>${entry.title}</cite>${entry.year === null ? "" : html` (${entry.year})`}`;
  const link = entry.identifiers.map(sourceLink).find((found) => found !== undefined);
  return html`${link?.text ?? "a study"}`;
}

/**
 * The research behind a finding (owner answer 252a), source by source: its title and links, a retraction or concern
 * notice, how AskRigor read it and whether its printed figures match its own data, the paper's own sentence and
 * conclusion found word for word, and the strongest thing against the finding, in AskRigor's words.
 */
function researchSection(research: readonly ShownResearchSource[]): SafeHtml | "" {
  if (research.length === 0) return "";
  return html`<section aria-labelledby="research">
<h2 id="research">The research behind it</h2>
<p>Each source this finding rests on, with how AskRigor read it. Words in quotation blocks are the paper’s own, which AskRigor found word for word in a text it fetched itself; the strongest thing against the finding is in AskRigor’s words.</p>
${research.map(researchSource)}</section>
`;
}

function researchSource(entry: ShownResearchSource): SafeHtml {
  const links = entry.source.identifiers.flatMap((identifier) => {
    const link = sourceLink(identifier);
    return link === undefined ? [] : [html`<a href="${link.href}">${link.text}</a>`];
  });
  const retraction = entry.retraction === null ? undefined : RETRACTION_WORDS[entry.retraction];
  return html`<article class="research-source">
<h3>${sourceName(entry.source)}</h3>
${links.length === 0 ? "" : html`<p class="meta">${joined(links, " · ")}</p>
`}${retraction === undefined ? "" : html`<p class="error-line" role="note">${retraction}</p>
`}${entry.read === null ? "" : html`<p><strong>How AskRigor read it:</strong> ${READ_WORDS[entry.read]}.${entry.figures === null ? ""
    : html` ${FIGURES_WORDS[entry.figures]}`}</p>
`}${entry.lines.map(quoteLine)}</article>
`;
}

function quoteLine(line: ShownQuoteLine): SafeHtml {
  const found = (section: string | null) =>
    html`Found word for word in ${QUOTE_TEXT_WORDS[line.text]}${section === null ? "" : html`, in ${section}`}.`;
  return html`${line.sentence === null ? "" : html`<blockquote class="quote"><p>${line.sentence}</p>
<footer>The paper’s sentence behind this finding. ${found(line.sentenceSection)}</footer></blockquote>
`}${line.conclusion === null ? "" : html`<blockquote class="quote"><p>${line.conclusion}</p>
<footer>The paper’s own conclusion. ${found(line.conclusionSection)}</footer></blockquote>
`}<p><strong>The strongest thing against it</strong> (AskRigor’s words): ${line.against}</p>
`;
}

const STUDIES_WORDS: Readonly<Record<AtlasForumSignalStudies, string>> = {
  corroborated: "Studies agree with these reports.",
  contradicted: "Studies that measured it the way these reports did found otherwise.",
  support_not_located: "No studies on this were found in the searches made for this research. That doesn’t count against these reports.",
  outcome_mismatch: "",
};

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

/** The forum a published thread link is on, as a reader knows it: its host in Unicode, as its community shows. */
function threadSite(link: string): string {
  try {
    const host = new URL(link).hostname.toLowerCase().replace(/^www\./u, "");
    return host === "reddit.com" || host.endsWith(".reddit.com") ? "Reddit" : shownCommunity(host);
  } catch {
    return "a forum";
  }
}

/**
 * What people report (owner answer 252a): AskRigor's counts of people by outcome and how good their reports are, a way it
 * could work, labelled as a mechanism, how studies relate to the reports in plain words, and the threads read, as links
 * with their communities. Never a username or anything a person wrote.
 */
function peopleSection(signal: ShownForumSignal | null): SafeHtml | "" {
  if (signal === null) return "";
  const { better, noChange, worse, mixed } = signal.people;
  const total = better + noChange + worse + mixed;
  const studies = signal.studies === "outcome_mismatch"
    ? html`The studies found measured something else: ${signal.studiesMeasured ?? "not the outcome these reports describe"}. They don’t count against these reports.`
    : html`${STUDIES_WORDS[signal.studies]}`;
  return html`<section aria-labelledby="people">
<h2 id="people">What people report</h2>
<p>From ${signal.threadsRead} forum ${signal.threadsRead === 1 ? "thread" : "threads"} AskRigor’s own reader read${signal.communities.length === 0 ? ""
    : html`, in ${joined(signal.communities.map((community) => html`${community}`), ", ")}`}. AskRigor counts people, not comments, and quotes no one.</p>
<dl class="facts">
<dt>Better</dt><dd>${people(better)}</dd>
<dt>No change</dt><dd>${people(noChange)}</dd>
<dt>Worse</dt><dd>${people(worse)}</dd>
<dt>Mixed</dt><dd>${people(mixed)}</dd>
</dl>
<p><strong>How good the reports are:</strong> of ${people(total)}, ${signal.quality.detailed} gave the details (what, how much, how long, and what else changed at the same time), ${signal.quality.measured} measured the change, and ${signal.quality.bare} wrote a bare one-liner.</p>
${signal.mechanism === null ? "" : html`<p><strong>A way it could work</strong> (a mechanism, in AskRigor’s words: it makes the reports plausible, but it isn’t a result): ${signal.mechanism}</p>
`}<p><strong>Studies:</strong> ${studies}</p>
${signal.threads.length === 0 ? "" : html`<ul class="thread-list">
${signal.threads.map((link, index) => html`<li><a href="${link}" rel="nofollow noopener noreferrer">Thread ${index + 1}</a> on ${threadSite(link)}</li>
`)}</ul>
`}</section>
`;
}

function search(entry: ShownSearch): SafeHtml {
  return html`<li><strong>${DATABASE_WORDS[entry.database]}</strong>: <code>${entry.query}</code>${entry.dateRange === null ? ""
    : html` (published ${day(entry.dateRange.start)} to ${day(entry.dateRange.end)})`}</li>
`;
}

function source(entry: ShownSource): SafeHtml | "" {
  const links = entry.identifiers.flatMap((identifier) => {
    const link = sourceLink(identifier);
    return link === undefined ? [] : [html`<a href="${link.href}">${link.text}</a>`];
  });
  if (links.length === 0) return "";
  const named = entry.title === null ? ""
    : html`<cite>${entry.title}</cite>${entry.year === null ? "" : html` (${entry.year})`}. `;
  return html`<li>${named}${joined(links, " · ")}</li>
`;
}

/** What the card's research found: every finding the pages show from it, this one marked and the others linked. */
function cardFindings(finding: ShownFinding, siblings: readonly ShownFinding[]): SafeHtml | "" {
  if (siblings.length === 0) return "";
  const all = [finding, ...siblings].sort((left, right) =>
    Number(left.publicationNumber.slice(2)) - Number(right.publicationNumber.slice(2)));
  return html`<section aria-labelledby="card-findings">
<h2 id="card-findings">What this research found</h2>
<p>${all.length} findings from the same research are published here. Each has its own page.</p>
<ol class="card-findings">
${all.map((entry) => html`<li${entry === finding ? html` aria-current="page"` : ""}>${badge(entry)}
<p class="finding-claim">${entry === finding ? html`<strong>This finding:</strong> ${entry.claim}`
    : html`<a href="${findingPath(entry.publicationNumber)}">${entry.claim}</a>`}</p>
${entry.certainty === null ? "" : html`<p class="meta">How sure: ${CERTAINTY_WORDS[entry.certainty]}</p>
`}</li>
`)}</ol>
</section>
`;
}

// The terms' approved words for comments (decision 171, section 1), shown by the comment form.
const COMMENT_RULES = "Comments in the Atlas must be about the finding. Your own experiences are welcome, and comments " +
  "are not medical advice. Don't post contact details, personal information about anyone else, advertising or harassment.";

function hiddenFields(token: string, returnPath: string): SafeHtml {
  return html`<input type="hidden" name="csrf" value="${token}"><input type="hidden" name="return" value="${returnPath}">`;
}

/**
 * Votes and comments (decision 171, section 4E): the totals and the comments that show, a report button on each, and,
 * for a signed-in reader, the vote, comment and delete forms and an account link; for anyone
 * else, the sign-in link. Every form posts to this origin with its token. Nothing renders while votes and comments are
 * switched off.
 */
function participation(publicationNumber: string, view: AtlasFindingParticipationView | undefined): SafeHtml | "" {
  if (view === undefined) return "";
  const path = findingPath(publicationNumber);
  const viewer = view.viewer;
  const votes = html`<section aria-labelledby="votes">
<h2 id="votes">Votes</h2>
<p class="totals">Agree: <strong>${view.totals.agree}</strong> · Disagree: <strong>${view.totals.disagree}</strong></p>
${viewer === null ? html`<p><a href="${view.signInHref}">Sign in with your AskRigor account</a> to vote or comment.</p>`
    : html`<form method="post" action="${path}/vote" class="vote-form">
${hiddenFields(viewer.tokens.vote, path)}
<button type="submit" name="vote" value="agree">Agree</button>
<button type="submit" name="vote" value="disagree">Disagree</button>
${viewer.vote === null ? "" : html`<button type="submit" name="vote" value="clear" class="quiet">Withdraw my vote</button>
`}</form>
<p class="meta">${viewer.vote === null ? "You have not voted on this finding." : html`Your vote: ${viewer.vote}.`}</p>`}
</section>
`;
  const comments = html`<section aria-labelledby="comments">
<h2 id="comments">Comments</h2>
${view.comments.length === 0 ? html`<p>No comments yet.</p>` : html`<ol class="comment-list">
${view.comments.map((comment) => html`<li class="comment" id="${comment.publicId}">
<p class="meta"><strong><bdi>${comment.displayName}</bdi></strong> <span class="marker" title="The same mark on one commenter's comments under this name">#${comment.marker}</span> · ${day(comment.postedAt)}</p>
<p class="comment-body" dir="auto">${comment.body}</p>
<div class="comment-actions">
${comment.deleteToken === null ? "" : html`<form method="post" action="/atlas/comments/${comment.publicId}/delete">
${hiddenFields(comment.deleteToken, path)}
<button type="submit" class="quiet">Delete my comment</button>
</form>
`}<form method="post" action="/atlas/comments/${comment.publicId}/report">
${hiddenFields(comment.reportToken, path)}
<button type="submit" class="quiet">Report</button>
</form>
</div>
</li>
`)}</ol>`}
${view.olderHref === null ? "" : html`<p><a href="${view.olderHref}">Older comments</a></p>
`}${viewer === null ? "" : viewer.stopped ? html`<p class="error-line">Your account can't comment in the Atlas.</p>`
    : html`<form method="post" action="${path}/comments" class="comment-form">
${hiddenFields(viewer.tokens.comment, path)}
${viewer.displayName !== null ? "" : html`<p><label for="display-name">Your display name, shown with your comments</label>
<input id="display-name" name="displayName" maxlength="40" required autocomplete="nickname" value="${view.draft?.displayName ?? ""}"></p>
`}<p><label for="comment-body">Your comment</label>
<textarea id="comment-body" name="body" rows="5" maxlength="2000" required>${view.draft?.body ?? ""}</textarea></p>
<p class="aside">${COMMENT_RULES} See the <a href="${CANONICAL_ORIGIN}/terms">terms</a>.</p>
<button type="submit">Post comment</button>
</form>`}
${viewer === null ? "" : html`<p><a href="${ACCOUNT_PATH}">Your account</a>, to find your votes and comments and manage your account</p>`}
</section>
`;
  return html`<div class="participation">
${view.notice === null ? "" : html`<p class="notice-line" role="status">${view.notice}</p>
`}${view.tenantSignOutHref === null ? "" : tenantSignOutLine(view.tenantSignOutHref)}${view.error === null ? "" : html`<p class="error-line" role="alert">${view.error}</p>
`}${votes}${comments}</div>
`;
}

export function renderAtlasFinding(model: AtlasFindingModel, participationView?: AtlasFindingParticipationView,
  reader?: AtlasPageReader): string {
  const finding = model.finding;
  const status = finding.status;
  const facts: SafeHtml[] = [];
  if (finding.certainty !== null) {
    facts.push(html`<dt>How sure</dt><dd>${CERTAINTY_WORDS[finding.certainty]} <span class="aside">(AskRigor’s rating, not formal GRADE)</span></dd>`);
  }
  if (finding.appliesTo !== null) facts.push(html`<dt>Whom it applies to</dt><dd>${finding.appliesTo}</dd>`);
  if (finding.kind !== null) facts.push(html`<dt>Kind</dt><dd>${KIND_WORDS[finding.kind]}</dd>`);
  if (finding.subject !== null) {
    facts.push(html`<dt>Subject</dt><dd>${finding.subject}${finding.subjectType === null ? "" : html` (${finding.subjectType})`}</dd>`);
  }
  if (finding.direction !== null) facts.push(html`<dt>Direction</dt><dd>${DIRECTION_WORDS[finding.direction]}</dd>`);
  if (finding.verifiedBases.length > 0) {
    facts.push(html`<dt>What the research verified</dt><dd>${joined(finding.verifiedBases.map((basis) => html`${BASIS_WORDS[basis]}`), "; ")}</dd>`);
  }
  const dates: SafeHtml[] = [html`${finding.publicationNumber}`];
  if (status.kind !== "unreviewed") dates.push(html`Atlas number ${status.atlasNumber}`);
  if (finding.savedOn !== null) dates.push(html`Saved ${day(finding.savedOn)}`);
  if (status.kind !== "unreviewed") {
    dates.push(html`${status.kind === "lead" ? "Reviewed" : "Checked"} by supervisors ${day(status.checkedOn)}`);
  }
  if (finding.researchCheckedOn !== null) dates.push(html`Research last checked ${day(finding.researchCheckedOn)}`);
  if (finding.askrigorVersion !== null) dates.push(html`AskRigor ${finding.askrigorVersion}`);
  const sources = finding.sources.map(source).filter((item): item is SafeHtml => item !== "");
  // The question its research answered opens the page, or a plain note when it was published without one.
  const question = finding.question !== null ? html`<p class="question"><span class="eyebrow">The question</span> ${finding.question}</p>`
    : html`<p class="question question-missing">This finding was published without the question its research answered${finding.topic === null
      ? ", and without a topic." : html`. Its topic: <a href="${topicPath(finding.topic.key)}">${finding.topic.label}</a>.`}</p>`;
  // The usual answer, then why this finding isn't it; without the usual answer, the why alone, as before.
  const usual = finding.usualAnswer !== null ? html`<section aria-labelledby="usual">
<h2 id="usual">The usual answer</h2>
<p>What a quick, ordinary answer would say: ${finding.usualAnswer}</p>
${finding.whyNotUsual === null ? "" : html`<p><strong>Why this finding isn’t it:</strong> ${finding.whyNotUsual}</p>
`}</section>
` : finding.whyNotUsual === null ? "" : html`<section aria-labelledby="usual">
<h2 id="usual">Why this isn’t the usual answer</h2>
<p>${finding.whyNotUsual}</p>
</section>
`;

  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a>${finding.topic === null ? ""
    : html` › <a href="${topicPath(finding.topic.key)}">${finding.topic.label}</a>`}</p>
${finding.kept ? html`<p class="notice-line" role="note">${KEPT_FOR_RESEARCH_LINE}</p>
` : ""}${statusBlock(finding)}
${question}
<h1 class="claim">${finding.claim}</h1>
<p class="meta">${joined(dates, " · ")}</p>
${facts.length === 0 ? "" : html`<dl class="facts">
${joined(facts, "\n")}
</dl>`}
${usual}${cardFindings(finding, model.siblings)}${finding.numbers.length === 0 ? "" : html`<section aria-labelledby="numbers">
<h2 id="numbers">The numbers</h2>
<p>Each group is shown as how many out of 100 had the outcome. The 95% range of the difference is worked out from the two groups’ counts by Newcombe’s method; it treats the groups as independent, so it does not allow for a crossover or clustered design. A number needed to treat or harm, 1 divided by the difference rounded up, is shown only when that range leaves out no difference. AskRigor works all of them out from the counts.</p>
${finding.numbers.map(figure)}</section>
`}${researchSection(finding.research)}${peopleSection(finding.forumSignal)}${finding.searches.length === 0 ? "" : html`<section aria-labelledby="searches">
<h2 id="searches">What was searched, and found nothing</h2>
<ul class="search-list">
${finding.searches.map(search)}</ul>
</section>
`}${finding.whatWouldChangeIt === null ? "" : html`<section aria-labelledby="change">
<h2 id="change">What would change it</h2>
<p>${finding.whatWouldChangeIt}</p>
</section>
`}${sources.length === 0 ? "" : html`<section aria-labelledby="sources">
<h2 id="sources">Sources</h2>
<ul class="source-list">
${sources}</ul>
</section>
`}${participation(finding.publicationNumber, participationView)}`;
  return page({
    path: findingPath(finding.publicationNumber),
    // Kept for research only: out of search engines, like every page no list links to (owner answers 229a and 231a).
    noindex: finding.status.kind === "unreviewed" || finding.kept,
    reader,
    title: `${finding.publicationNumber}: ${shortened(finding.claim, 70)} | AskRigor Atlas`,
    description: shortened(finding.claim, 160),
    body,
  });
}

// What changed ----------------------------------------------------------------------------------------------------------

function changeWords(entry: AtlasChangeEntry): SafeHtml {
  switch (entry.kind) {
    case "published":
      return html`Published`;
    case "accepted":
      return entry.labelAfter === "lead" ? html`Reviewed by supervisors and kept as a lead` : html`Checked by supervisors`;
    case "edited":
      return html`Wording edited by supervisors`;
    case "corrected":
      return html`Corrected`;
    case "rechecked":
      return html`Research checked again`;
    case "relabeled":
      return entry.labelBefore === null || entry.labelAfter === null ? html`Label changed`
        : html`Label changed from ${LABEL_WORDS[entry.labelBefore]} to ${LABEL_WORDS[entry.labelAfter]}`;
    case "withdrawn":
      return html`Withdrawn`;
  }
}

function changeItem(entry: AtlasChangeEntry): SafeHtml {
  const what = entry.finding === null
    ? html`<p>${entry.atlasNumber ?? ""} was withdrawn after it was checked, and left these pages.</p>`
    : html`${badge(entry.finding)}
<p class="finding-claim"><a href="${findingPath(entry.finding.publicationNumber)}">${entry.finding.claim}</a></p>`;
  return html`<li class="change">
<p class="meta">${day(entry.at)} · ${changeWords(entry)}</p>
${what}
${entry.note === null ? "" : html`<p class="note">${entry.note}</p>`}
</li>
`;
}

export function renderAtlasChanges(model: AtlasChangesModel, reader?: AtlasPageReader): string {
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<h1>What changed</h1>
<p class="lede">Findings published, checked, corrected and withdrawn, the newest first.</p>
${model.entries.length === 0 ? html`<p>Nothing has changed yet.</p>` : html`<ol class="change-list">
${model.entries.map(changeItem)}</ol>`}`;
  return page({
    path: "/atlas/changes",
    title: "What changed | AskRigor Atlas",
    description: "What changed in the AskRigor Atlas: findings published, checked, corrected and withdrawn.",
    current: "changes",
    reader,
    body,
  });
}

// The sitemap -----------------------------------------------------------------------------------------------------------

/** The sitemap's XML (sitemaps.org 0.9) on the public origin: reviewed findings and the pages that hold them. */
export function renderAtlasSitemap(entries: readonly AtlasSitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(({ path, lastModified }) => `<url><loc>${escapeHtml(`${CANONICAL_ORIGIN}${path}`)}</loc>${lastModified === null ? ""
    : `<lastmod>${escapeHtml(lastModified)}</lastmod>`}</url>
`).join("")}</urlset>
`;
}

// Pages without a model -------------------------------------------------------------------------------------------------

export function renderAtlasNotFound(reader?: AtlasPageReader): string {
  return page({
    reader,
    path: null,
    noindex: true,
    title: "Not found | AskRigor Atlas",
    description: "There is no Atlas page at this address.",
    body: html`<h1>Not found</h1>
<p>There is no Atlas page at this address. The finding may have left the Atlas, or the address may be mistyped.</p>
<p><a href="/atlas">Go to the Atlas home</a></p>`,
  });
}

export function renderAtlasUnavailable(reader?: AtlasPageReader): string {
  return page({
    reader,
    path: null,
    noindex: true,
    title: "Unavailable | AskRigor Atlas",
    description: "The Atlas is unavailable right now.",
    body: html`<h1>The Atlas is unavailable right now</h1>
<p>Please try again in a few minutes.</p>`,
  });
}

export interface AtlasAccountView {
  reader: AtlasPageReader;
  tokens: null | { name: string; signOut: string; signOutEverywhere: string; forget: string };
  /** The signed-in reader's AskRigor features, or why they are not shown; null or absent shows no section. */
  features?: AtlasAccountFeatures | null;
}

/**
 * The signed-in reader's AskRigor features (owner, 5 Nov 2026): each feature with whether it is on for them, who pays
 * for it and its limit, as account-features.ts words them; or a line saying why they are not shown.
 */
function featuresSection(features: AtlasAccountFeatures, signInHref: string): SafeHtml {
  return html`<h2 id="features">Your AskRigor features</h2>
${features.state === "sign-in-again" ? html`<p>To see your AskRigor features here, sign in again.</p>
<p><a href="${signInHref}">Sign in again</a></p>` : features.state === "unavailable"
    ? html`<p>AskRigor couldn't read your features just now. Reload the page to try again.</p>`
    : html`<p>How AskRigor stands for the account you signed in with: whether each feature is on for you, who pays
for it and its limit. Your AI app uses this same account when you connect it to AskRigor with the same sign-in.
AskRigor reads these each time you open this page and keeps no copy.</p>
<ul class="finding-list">
${features.rows.map((row) => html`<li class="finding feature" id="feature-${row.id}">
<h3>${row.name}</h3>
<p class="badge ${row.on ? "badge-on" : "badge-off"}">${row.on ? "On" : "Off"}</p>
<dl class="facts">
<dt>For you</dt><dd>${row.forYou}</dd>
<dt>Who pays</dt><dd>${row.whoPays}</dd>
<dt>Limit</dt><dd>${row.limit}</dd>
</dl>
</li>
`)}</ul>`}`;
}

/** Account controls have one home, even before any finding has been published. */
export function renderAtlasAccount(view: AtlasAccountView): string {
  const viewer = view.reader.viewer;
  const tokens = view.tokens;
  return page({
    path: null,
    noindex: true,
    current: "account",
    reader: view.reader,
    title: "Your account | AskRigor Atlas",
    description: "Your AskRigor account in the Atlas.",
    body: html`<h1>Your account</h1>
${viewer === null || tokens === null ? html`<p>Sign in with your AskRigor account to manage your votes and comments.</p>
<p><a href="${view.reader.signInHref}">Sign in with your AskRigor account</a></p>` : html`<p>You are signed in with your AskRigor account.</p>
${viewer.displayName === null ? html`<p>You choose a display name with your first comment.</p>`
    : html`${viewer.displayName === "" ? html`<p>Your display name cannot be shown here. You can change it below.</p>`
      : html`<p>Your display name is <strong><bdi>${viewer.displayName}</bdi></strong>.</p>`}
<form method="post" action="/atlas/account/name" class="name-form">
${hiddenFields(tokens.name, ACCOUNT_PATH)}
<label for="new-name">Your display name</label>
<input id="new-name" name="displayName" maxlength="40" required autocomplete="nickname" value="${viewer.displayName}">
<button type="submit" class="quiet">Save name</button>
</form>`}
<p><a href="${OWN_COMMENTS_PATH}">Your votes and comments</a>, to find and delete any of them</p>
<p><a href="/atlas/account/reports">Your reports</a>, to see where each stands and take any of them down · <a href="/atlas/share">Share what worked for you</a></p>
<h2>What the Atlas keeps</h2>
<p>The Atlas keeps your votes, your comments with the display name you choose, and your reports, under a key derived
from your account, never your email address. Votes are shown only as totals; comments are public. It keeps no record
of which pages you read. See the <a href="${CANONICAL_ORIGIN}/privacy">privacy page</a>.</p>
<p>You can withdraw votes and delete comments on your votes and comments page, or delete them all, with your reports,
using the form below.</p>
<div class="account">
<form method="post" action="/atlas/auth/logout">
${hiddenFields(tokens.signOut, ACCOUNT_PATH)}
<button type="submit" class="quiet">Sign out</button>
</form>
<form method="post" action="/atlas/auth/logout-everywhere">
${hiddenFields(tokens.signOutEverywhere, ACCOUNT_PATH)}
<button type="submit" class="quiet">Sign out everywhere</button>
</form>
<form method="post" action="/atlas/account/delete" class="forget-form">
${hiddenFields(tokens.forget, ACCOUNT_PATH)}
<p><input type="checkbox" id="forget-confirm" name="confirm" value="yes" required>
<label for="forget-confirm">Delete everything I hold in the Atlas: my votes, my comments and my reports</label></p>
<button type="submit" class="quiet">Delete them all</button>
</form>
</div>
${view.features ? featuresSection(view.features, view.reader.signInHref) : ""}`}`,
  });
}

/** Where a signed-in reader finds every comment of theirs. */
export const OWN_COMMENTS_PATH = "/atlas/account/comments";

/** A signed-in reader's own votes and comments, each with its withdraw or delete form, and the page's notice. */
export interface AtlasOwnCommentsView {
  votes: Array<{
    publicationNumber: string;
    vote: "agree" | "disagree";
    votedAt: string;
    publicationListed: boolean;
    withdrawToken: string;
  }>;
  olderVotesHref: string | null;
  comments: Array<{
    publicId: string;
    publicationNumber: string;
    /** Null when the text cannot be written on a page (the pages' last check would refuse it). */
    body: string | null;
    state: "shown" | "hidden";
    postedAt: string;
    publicationListed: boolean;
    deleteToken: string;
  }>;
  olderHref: string | null;
  notice: string | null;
}

export function renderAtlasOwnComments(view: AtlasOwnCommentsView, reader?: AtlasPageReader): string {
  return page({
    reader,
    path: null,
    noindex: true,
    title: "Your votes and comments | AskRigor Atlas",
    description: "The votes you gave and the comments you posted in the AskRigor Atlas.",
    body: html`<h1>Your votes and comments</h1>
${view.notice === null ? "" : html`<p class="notice-line" role="status">${view.notice}</p>
`}<h2 id="votes">Your votes</h2>
<p>Every vote you gave, the newest finding first, wherever the finding is now. Withdrawing one deletes it outright.</p>
${view.votes.length === 0 ? html`<p>You have no votes in the Atlas.</p>` : html`<ol class="comment-list">
${view.votes.map((vote) => html`<li class="comment" id="vote-${vote.publicationNumber}">
<p class="meta">${vote.publicationListed
    ? html`<a href="${findingPath(vote.publicationNumber)}">${vote.publicationNumber}</a>`
    : html`${vote.publicationNumber}, no longer on the pages`} · ${vote.vote} · ${day(vote.votedAt)}</p>
<form method="post" action="${findingPath(vote.publicationNumber)}/vote">
${hiddenFields(vote.withdrawToken, OWN_COMMENTS_PATH)}
<button type="submit" name="vote" value="clear" class="quiet">Withdraw my vote</button>
</form>
</li>
`)}</ol>`}
${view.olderVotesHref === null ? "" : html`<p><a href="${view.olderVotesHref}">Older votes</a></p>
`}<h2 id="comments">Your comments</h2>
<p>Every comment you posted in the Atlas, newest first, wherever it is: shown, hidden by AskRigor&#39;s owner, or on a
finding that is no longer on the pages. Deleting one deletes it outright, with its reports.</p>
${view.comments.length === 0 ? html`<p>You have no comments in the Atlas.</p>` : html`<ol class="comment-list">
${view.comments.map((comment) => html`<li class="comment" id="${comment.publicId}">
<p class="meta">${comment.publicId} · ${comment.publicationListed
    ? html`on <a href="${findingPath(comment.publicationNumber)}">${comment.publicationNumber}</a>`
    : html`on ${comment.publicationNumber}, no longer on the pages`} · ${day(comment.postedAt)}${comment.state === "hidden"
    ? html` · <strong>hidden by AskRigor&#39;s owner</strong>: only you see it here` : ""}</p>
${comment.body === null ? html`<p class="aside">Its text cannot be shown on the pages.</p>`
    : html`<p class="comment-body" dir="auto">${comment.body}</p>`}
<div class="comment-actions">
<form method="post" action="/atlas/comments/${comment.publicId}/delete">
${hiddenFields(comment.deleteToken, OWN_COMMENTS_PATH)}
<button type="submit" class="quiet">Delete this comment</button>
</form>
</div>
</li>
`)}</ol>`}
${view.olderHref === null ? "" : html`<p><a href="${view.olderHref}">Older comments</a></p>
`}<p><a href="/atlas">Atlas home</a></p>`,
  });
}

export function renderAtlasMessage(title: string, message: string, back: { href: string; text: string },
  reader?: AtlasPageReader): string {
  return page({
    reader,
    path: null,
    noindex: true,
    title: `${title} | AskRigor Atlas`,
    description: title,
    body: html`<h1>${title}</h1>
<p>${message}</p>
<p><a href="${back.href}">${back.text}</a></p>`,
  });
}

export function renderAtlasTooManyRequests(reader?: AtlasPageReader): string {
  return page({
    reader,
    path: null,
    noindex: true,
    title: "Too many requests | AskRigor Atlas",
    description: "Too many requests for Atlas pages.",
    body: html`<h1>Too many requests</h1>
<p>Please wait a minute before loading more Atlas pages.</p>`,
  });
}

// The stylesheet --------------------------------------------------------------------------------------------------------

/** /atlas/atlas.css: the site's palette and type, calm and readable, one column on a phone. */
export const ATLAS_CSS = `:root {
  color-scheme: light dark;
  --page: #f7f4ec;
  --surface: #fffdf8;
  --text: #1f2933;
  --muted: #52606d;
  --line: #d7d2c6;
  --accent: #145a8d;
  --accent-hover: #083e66;
  --focus: #ad5a00;
  --unreviewed: #8a5a00;
  --unreviewed-surface: #fff4dc;
  --checked: #1f6f43;
  --checked-surface: #e7f4ec;
  --contested: #a33a1f;
  --contested-surface: #fbe9e3;
  --quiet: #52606d;
  --quiet-surface: #eef0f2;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--page);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
  overflow-wrap: break-word;
}

a {
  color: var(--accent);
  font-weight: 600;
  text-decoration-thickness: 0.1em;
  text-underline-offset: 0.16em;
}

a:hover, a:focus-visible { color: var(--accent-hover); }

:focus-visible {
  outline: 0.2rem solid var(--focus);
  outline-offset: 0.2rem;
}

.skip-link {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 2;
  padding: 0.65rem 0.85rem;
  background: var(--text);
  color: var(--surface);
  transform: translateY(-160%);
}

.skip-link:focus { transform: translateY(0); }

.shell { width: min(100% - 2rem, 72ch); margin-inline: auto; }

.site-header, .site-footer { border-color: var(--line); border-style: solid; }
.site-header { border-width: 0 0 1px; background: var(--surface); }
.site-footer { border-width: 1px 0 0; margin-top: 3rem; padding: 1.25rem 0; color: var(--muted); }

.masthead, .footer-row, .nav-list { display: flex; align-items: center; gap: 1rem; }
.masthead, .footer-row { justify-content: space-between; padding: 0.9rem 0; }
.masthead, .nav-list { flex-wrap: wrap; }
.atlas-search { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.atlas-search input { max-width: 18rem; min-width: 8rem; }
.map-scroll { max-width: 100%; overflow-x: auto; margin: 1rem 0; }
.topic-map { display: block; font-size: 12px; }
.topic-map text { fill: currentColor; }
.topic-map .map-heading { font-weight: bold; }
.map-node { fill: var(--surface); stroke: currentColor; }
.map-edge { fill: none; stroke: currentColor; }
.topic-map a:focus .map-node { stroke-width: 3; }
.notice h2:first-child { margin-top: 0; }
.notice ul { margin: 0.5rem 0; padding-left: 1.25rem; }
.map-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 1rem 0; padding: 0; list-style: none; }
.map-legend li { display: flex; align-items: center; gap: 0.45rem; }
.map-swatch { display: block; flex: none; width: 1.5rem; height: 1.5rem; }
.map-swatch.map-sizes { width: auto; height: 2.75rem; }
.map-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 1rem; margin: 1rem 0; }
.map-topic { min-width: 0; padding: 0.85rem 1rem; background: var(--surface); border: 1px solid var(--line); border-radius: 0.5rem; }
.map-topic h3 { margin: 0; font-size: 1.1rem; }
.map-topic .meta { margin: 0.3rem 0 0.6rem; }
.map-cluster { display: block; width: 100%; height: auto; }
.map-island { fill: var(--page); stroke: var(--line); }
.map-mark { stroke-width: 2; }
.map-checked { fill: var(--checked); stroke: var(--checked); }
.map-contested { fill: var(--contested); stroke: var(--contested); }
.map-hole { fill: var(--surface); }
.map-unreviewed { fill: var(--unreviewed-surface); stroke: var(--unreviewed); stroke-dasharray: 4 3; }
.map-size { fill: none; stroke: var(--muted); stroke-width: 1.5; }
.map-cluster a:hover .map-mark { stroke: var(--accent-hover); stroke-dasharray: none; }
.map-cluster a:focus-visible { outline: none; }
/* The text colour stands apart from every status colour, in both themes. */
.map-cluster a:focus-visible .map-mark { stroke: var(--text); stroke-width: 5; stroke-dasharray: none; }
.brand { color: var(--text); font-size: 1.15rem; font-weight: 800; text-decoration: none; }
.nav-list { flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.nav-list a[aria-current="page"] { color: var(--text); text-decoration: none; }

main { padding: 2.5rem 0 1rem; }
h1, h2, h3 { line-height: 1.2; }
h1 { font-size: clamp(1.9rem, 6vw, 3rem); margin: 0 0 1rem; }
h1.claim { font-size: clamp(1.25rem, 4vw, 1.75rem); font-weight: 650; line-height: 1.3; }
h2 { margin-top: 2.4rem; font-size: clamp(1.25rem, 3.5vw, 1.6rem); }
p, li, dd { max-width: 72ch; }

.eyebrow, .meta, .breadcrumbs, .aside { color: var(--muted); }
.lede { font-size: 1.15rem; color: var(--muted); }
.notice {
  margin: 1.5rem 0;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
}
.notice p:first-child, .figure p:first-child { margin-top: 0; }
.notice p:last-child, .figure p:last-child { margin-bottom: 0; }

.finding-list, .pair-list, .change-list, .source-list, .search-list { margin: 0; padding: 0; list-style: none; }
.finding, .change, .contested-pair {
  margin: 1rem 0;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
}
.contested-pair .finding { margin: 0.75rem 0 0; }
.finding-claim { margin: 0.35rem 0; font-size: 1.05rem; }
.finding-claim a { font-weight: 600; }
.finding-question { margin: 0.45rem 0 0; color: var(--muted); font-size: 0.95rem; }
.question { margin: 0 0 0.75rem; font-size: 1.1rem; }
.question .eyebrow { display: block; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.02em; }
.question-missing { color: var(--muted); font-size: 1rem; }
.card-findings { margin: 0; padding-left: 1.5rem; }
.card-findings li { margin: 0.9rem 0; }
.card-findings li[aria-current] .finding-claim { font-weight: 600; }
.meta { margin: 0.35rem 0 0; font-size: 0.95rem; }
.reason, .note { margin: 0.5rem 0 0; }

.badge {
  display: inline-block;
  margin: 0;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
}
.badge-unreviewed { background: var(--unreviewed-surface); color: var(--unreviewed); }
.badge-needs-checking { background: var(--contested-surface); color: var(--contested); }
.ai-label { margin: 0.3rem 0 0; color: var(--muted); font-size: 0.9rem; font-style: italic; }
.status .ai-label { color: inherit; font-size: 1rem; }
.badge-checked { background: var(--checked-surface); color: var(--checked); }
.badge-contested { background: var(--contested-surface); color: var(--contested); }
.badge-lead, .badge-superseded { background: var(--quiet-surface); color: var(--quiet); }
.badge-on { background: var(--checked-surface); color: var(--checked); }
.badge-off { background: var(--quiet-surface); color: var(--quiet); }
.feature h3 { margin: 0 0 0.35rem; font-size: 1.1rem; }
.feature .facts { margin: 0.75rem 0 0; }

.status {
  margin: 0 0 1.25rem;
  padding: 0.85rem 1.1rem;
  border-left: 0.35rem solid var(--quiet);
  border-radius: 0.35rem;
  background: var(--quiet-surface);
}
.status p { margin: 0.25rem 0; }
.status-label { font-weight: 800; }
.status-unreviewed { border-color: var(--unreviewed); background: var(--unreviewed-surface); }
.status-unreviewed .status-label { color: var(--unreviewed); }
.status-checked { border-color: var(--checked); background: var(--checked-surface); }
.status-checked .status-label { color: var(--checked); }
.status-contested { border-color: var(--contested); background: var(--contested-surface); }
.status-contested .status-label { color: var(--contested); }

.facts {
  display: grid;
  grid-template-columns: minmax(8rem, max-content) 1fr;
  gap: 0.4rem 1.25rem;
  margin: 1.5rem 0;
}
.facts dt { font-weight: 700; }
.facts dd { margin: 0; }

.figure {
  margin: 1.25rem 0;
  padding: 1rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
}
.figure figcaption { margin-bottom: 0.5rem; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
thead th { font-size: 0.9rem; color: var(--muted); }
td:last-child, th:last-child { text-align: right; }

.search-list li, .source-list li { margin: 0.5rem 0; }
.research-source { margin: 1.25rem 0; padding-top: 0.75rem; border-top: 1px solid var(--line); }
.research-source h3 { margin: 0 0 0.25rem; font-size: 1.05rem; }
.quote {
  margin: 0.9rem 0;
  padding: 0.6rem 1rem;
  border-left: 0.3rem solid var(--line);
  background: var(--surface);
}
.quote p { margin: 0 0 0.35rem; }
.quote footer { color: var(--muted); font-size: 0.9rem; }
.thread-list { margin: 0.5rem 0; padding-left: 1.25rem; }
code {
  padding: 0.1em 0.3em;
  background: color-mix(in srgb, var(--line) 45%, transparent);
  border-radius: 0.2rem;
  overflow-wrap: anywhere;
}

.participation { margin-top: 2.5rem; border-top: 1px solid var(--line); }
.totals { font-size: 1.05rem; }
.notice-line, .error-line {
  margin: 1.25rem 0 0;
  padding: 0.6rem 0.9rem;
  border-radius: 0.35rem;
  border-left: 0.3rem solid var(--checked);
  background: var(--checked-surface);
}
.error-line { border-color: var(--contested); background: var(--contested-surface); }
.comment-list { margin: 0; padding: 0; list-style: none; }
.comment {
  margin: 0.9rem 0;
  padding: 0.85rem 1.1rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.5rem;
}
.comment-body { white-space: pre-wrap; margin: 0.4rem 0; }
.marker { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.comment-actions, .vote-form, .account { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.comment-actions form, .account form { margin: 0; }
.comment-form, .account { margin-top: 1.25rem; }
.name-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
label { display: block; font-weight: 700; margin-bottom: 0.25rem; }
.name-form label { display: inline; margin: 0; }
input[type="text"], input:not([type]), textarea {
  width: 100%;
  max-width: 72ch;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.name-form input { width: auto; flex: 1 1 12rem; }
.account .forget-form { flex-basis: 100%; margin-top: 0.75rem; }
.account .account-link { flex-basis: 100%; margin: 0; }
.forget-form p { margin: 0 0 0.4rem; }
.forget-form label { display: inline; font-weight: 400; }
button {
  padding: 0.5rem 0.95rem;
  border: 1px solid var(--accent);
  border-radius: 0.35rem;
  background: var(--accent);
  color: var(--surface);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
button.quiet { background: transparent; color: var(--accent); }
button:hover, button:focus-visible { background: var(--accent-hover); border-color: var(--accent-hover); color: var(--surface); }

@media (max-width: 40rem) {
  .masthead, .footer-row { align-items: flex-start; flex-direction: column; gap: 0.5rem; }
  .facts { grid-template-columns: 1fr; gap: 0.1rem; }
  .facts dd { margin-bottom: 0.6rem; }
  .finding, .change, .contested-pair, .figure { padding: 0.85rem 1rem; }
  th, td { padding: 0.35rem 0.3rem; }
  main { padding-top: 1.75rem; }
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: #13191f;
    --surface: #1d2730;
    --text: #f4f1e8;
    --muted: #c4d0d9;
    --line: #40515d;
    --accent: #72c2ed;
    --accent-hover: #c0e9ff;
    --focus: #ffbf69;
    --unreviewed: #ffcf70;
    --unreviewed-surface: #3a2e14;
    --checked: #8fdcae;
    --checked-surface: #173326;
    --contested: #ffad94;
    --contested-surface: #3d2019;
    --quiet: #c4d0d9;
    --quiet-surface: #26313b;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto; transition: none; }
}
`;
