import type { AtlasLabel, AtlasPageSourceIdentifiers } from "@askrigor/evidence-repository";

import { binaryContrast, binaryGroups, withoutEndPunctuation } from "../binary-results.js";
import {
  NOT_CHECKED_LABEL,
  canonicalIdentifier,
  type AtlasChangeEntry,
  type AtlasChangesModel,
  type AtlasContestedPair,
  type AtlasFindingModel,
  type AtlasFindingParticipationView,
  type AtlasHomeModel,
  type AtlasOwnerPick,
  type AtlasTopicModel,
  type ShownFinding,
  type ShownNumber,
  type ShownRelated,
  type ShownSearch,
} from "./page-data.js";

/**
 * The public Atlas pages' HTML (decision 171, section 4C): plain, semantic, server-rendered pages with no script and no
 * inline style, under a content policy that allows only the same-origin stylesheet. Every text a page shows goes
 * through html``, which escapes it; only markup this module writes is ever raw. Links to sources are built here from
 * identifiers in canonical form, never taken from a card's text.
 */

// Escaping ------------------------------------------------------------------------------------------------------------

class SafeHtml {
  constructor(readonly value: string) {}
}

type HtmlValue = SafeHtml | string | number | null | undefined | false | readonly HtmlValue[];

/** Text made safe for HTML content and double- or single-quoted attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function part(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(part).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(String(value));
}

/** Markup with every interpolated value escaped, unless it is markup this module made. */
function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
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
} as const;
const DATABASE_WORDS = { pubmed: "PubMed", europepmc: "Europe PMC", ctgov: "ClinicalTrials.gov" } as const;
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
  const rounded = Math.round((1_000 * events) / total) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

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
        text: `DOI ${identifier.value}`,
      };
    case "pmid":
      return { href: `https://pubmed.ncbi.nlm.nih.gov/${identifier.value}/`, text: `PMID ${identifier.value}` };
    case "pmcid":
      return { href: `https://pmc.ncbi.nlm.nih.gov/articles/${identifier.value}/`, text: `PMCID ${identifier.value}` };
    case "nct":
      return { href: `https://clinicaltrials.gov/study/${identifier.value}`, text: `ClinicalTrials.gov ${identifier.value}` };
    default:
      return undefined;
  }
}

export const findingPath = (publicationNumber: string) => `/atlas/findings/${publicationNumber}`;
export const topicPath = (topicKey: string) => `/atlas/topics/${topicKey}`;
const CANONICAL_ORIGIN = "https://askrigor.com";

function relatedLink(related: ShownRelated): SafeHtml {
  return related.publicationNumber === null ? html`${related.atlasNumber}`
    : html`<a href="${findingPath(related.publicationNumber)}">${related.publicationNumber}</a>`;
}

// The layout ----------------------------------------------------------------------------------------------------------

interface PageFrame {
  /** The page's own path, for its canonical link; null for a page that answers an error, which has none. */
  path: string | null;
  title: string;
  description: string;
  current?: "home" | "changes";
  body: SafeHtml;
}

function page(frame: PageFrame): string {
  const current = (name: "home" | "changes") => frame.current === name ? html` aria-current="page"` : "";
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${frame.description}">
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
<li><a href="/atlas/changes"${current("changes")}>What changed</a></li>
<li><a href="${CANONICAL_ORIGIN}/">AskRigor</a></li>
</ul></nav>
</div></header>
<main id="content" class="shell">
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

const shortened = (text: string, length: number) =>
  text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;

// A finding in a list ---------------------------------------------------------------------------------------------------

function badge(finding: ShownFinding): SafeHtml {
  return html`<p class="badge badge-${finding.status.kind}">${STATUS_WORDS[finding.status.kind]}</p>`;
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
<p class="finding-claim"><a href="${findingPath(finding.publicationNumber)}">${finding.claim}</a></p>
<p class="meta">${joined(facts, " · ")}</p>
${extra === "" ? "" : html`${extra}
`}</li>
`;
}

function findingList(findings: readonly ShownFinding[]): SafeHtml {
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

export function renderAtlasHome(model: AtlasHomeModel): string {
  const body = html`<p class="eyebrow">Public research findings</p>
<h1>AskRigor Atlas</h1>
<p class="lede">Findings from research done with AskRigor, written without the people who asked.</p>
<div class="notice">
<p>A finding is published as soon as its findings card is saved, marked “${NOT_CHECKED_LABEL}” until AskRigor’s owner has reviewed it. A reviewed finding shows the wording the owner accepted, its Atlas number and the day it was checked; a rejected one leaves these pages.</p>
<p>How sure each finding is shows AskRigor’s rating, not a formal GRADE assessment. Rates and the numbers needed to treat or harm are worked out from each group’s counts. Nothing here is medical advice.</p>
</div>
${ownerPicks(model.picks)}<section aria-labelledby="recently-published">
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
`}<p><a href="/atlas/changes">See what changed in the Atlas</a></p>`;
  return page({
    path: "/atlas",
    title: "AskRigor Atlas",
    description: "Findings from research done with AskRigor, written without the people who asked.",
    current: "home",
    body,
  });
}

// A topic page ----------------------------------------------------------------------------------------------------------

const SECTION_NOTES: Partial<Record<AtlasTopicModel["sections"][number]["id"], string>> = {
  leads: "AskRigor’s owner kept these as leads: no full-text audit, documented search or research correction backs them yet.",
  earlier: "Newer findings replace these.",
};

export function renderAtlasTopic(model: AtlasTopicModel): string {
  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a></p>
<h1>${model.topic.label}</h1>
<p class="lede">Findings about ${model.topic.label}. Within each part, findings checked by supervisors come first.</p>
${model.sections.map((section) => html`<section aria-labelledby="part-${section.id}">
<h2 id="part-${section.id}">${section.heading}</h2>
${SECTION_NOTES[section.id] === undefined ? "" : html`<p>${SECTION_NOTES[section.id]!}</p>`}
${findingList(section.findings)}
</section>
`)}`;
  return page({
    path: topicPath(model.topic.key),
    title: `${model.topic.label} | AskRigor Atlas`,
    description: `Findings about ${model.topic.label} in the AskRigor Atlas.`,
    body,
  });
}

// A finding page --------------------------------------------------------------------------------------------------------

function statusBlock(finding: ShownFinding): SafeHtml {
  const status = finding.status;
  if (status.kind === "unreviewed") {
    return html`<div class="status status-unreviewed">
<p class="status-label">${NOT_CHECKED_LABEL}</p>
<p>It was published as soon as its findings card was saved. AskRigor’s owner has not reviewed it yet.</p>
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
  let needed: SafeHtml;
  if (contrast === undefined) {
    needed = html`The two groups’ rates are the same, so there is no number needed to treat or harm.`;
  } else {
    // The option did better when a larger share had an outcome more people should have, or a smaller share one fewer
    // should (atlasNumbersProblems reads it the same way).
    const optionBetter = contrast.optionHigher === (entry.better === "more");
    needed = html`<strong>Number needed to ${optionBetter ? "treat" : "harm"}: ${contrast.roundedUp}</strong>. About 1 in ${contrast.roundedUp} ${contrast.optionHigher ? "more" : "fewer"} people had this outcome with ${option.name} than with ${comparator.name}.`;
  }
  return html`<figure class="figure">
<figcaption><strong>${withoutEndPunctuation(entry.outcome)}</strong>, over ${withoutEndPunctuation(entry.followUp)} (${entry.better === "more" ? "more" : "fewer"} is better)</figcaption>
<table>
<thead><tr><th scope="col">Group</th><th scope="col">People with the outcome</th><th scope="col">Rate</th></tr></thead>
<tbody>
${[option, comparator].map(({ name, events, total }) => html`<tr><th scope="row">${name}</th><td>${events} of ${total}</td><td>${percent(events, total)}</td></tr>
`)}</tbody>
</table>
<p>${needed}</p>
${entry.harmsNoneFound ? html`<p>No harms were found over the same follow-up.</p>` : ""}
</figure>
`;
}

function search(entry: ShownSearch): SafeHtml {
  return html`<li><strong>${DATABASE_WORDS[entry.database]}</strong>: <code>${entry.query}</code>${entry.dateRange === null ? ""
    : html` (published ${day(entry.dateRange.start)} to ${day(entry.dateRange.end)})`}</li>
`;
}

function source(identifiers: AtlasPageSourceIdentifiers): SafeHtml | "" {
  const links = identifiers.flatMap((identifier) => {
    const link = sourceLink(identifier);
    return link === undefined ? [] : [html`<a href="${link.href}">${link.text}</a>`];
  });
  return links.length === 0 ? "" : html`<li>${joined(links, " · ")}</li>
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
 * for a signed-in reader, the vote, comment, delete, display-name, sign-out and delete-everything forms; for anyone
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
<p class="meta"><strong>${comment.displayName}</strong> · ${day(comment.postedAt)}</p>
<p class="comment-body">${comment.body}</p>
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
${viewer === null ? "" : viewer.stopped ? html`<p class="error-line">Your account can't comment in the Atlas.</p>`
    : html`<form method="post" action="${path}/comments" class="comment-form">
${hiddenFields(viewer.tokens.comment, path)}
${viewer.displayName !== null ? "" : html`<p><label for="display-name">Your display name, shown with your comments</label>
<input id="display-name" name="displayName" maxlength="40" required autocomplete="nickname" value="${view.draft?.displayName ?? ""}"></p>
`}<p><label for="comment-body">Your comment</label>
<textarea id="comment-body" name="body" rows="5" maxlength="2000" required>${view.draft?.body ?? ""}</textarea></p>
<p class="aside">${COMMENT_RULES} See the <a href="${CANONICAL_ORIGIN}/terms">terms</a>.</p>
<button type="submit">Post comment</button>
</form>`}
${viewer === null ? "" : html`<div class="account">
${viewer.displayName === null ? "" : html`<form method="post" action="/atlas/account/name" class="name-form">
${hiddenFields(viewer.tokens.name, path)}
<label for="new-name">Your display name</label>
<input id="new-name" name="displayName" maxlength="40" required autocomplete="nickname" value="${viewer.displayName}">
<button type="submit" class="quiet">Save name</button>
</form>
`}<form method="post" action="/atlas/auth/logout">
${hiddenFields(viewer.tokens.signOut, path)}
<button type="submit" class="quiet">Sign out</button>
</form>
<form method="post" action="/atlas/account/delete" class="forget-form">
${hiddenFields(viewer.tokens.forget, path)}
<p><input type="checkbox" id="forget-confirm" name="confirm" value="yes" required>
<label for="forget-confirm">Delete everything I hold in the Atlas: my votes, my comments and my reports</label></p>
<button type="submit" class="quiet">Delete them all</button>
</form>
</div>`}
</section>
`;
  return html`<div class="participation">
${view.notice === null ? "" : html`<p class="notice-line" role="status">${view.notice}</p>
`}${view.tenantSignOutHref === null ? "" : html`<p class="aside">The AskRigor login itself may still remember you in this browser: <a href="${view.tenantSignOutHref}">sign out of it too</a>, so that the next sign-in asks for your password.</p>
`}${view.error === null ? "" : html`<p class="error-line" role="alert">${view.error}</p>
`}${votes}${comments}</div>
`;
}

export function renderAtlasFinding(model: AtlasFindingModel, participationView?: AtlasFindingParticipationView): string {
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

  const body = html`<p class="breadcrumbs"><a href="/atlas">Atlas</a>${finding.topic === null ? ""
    : html` › <a href="${topicPath(finding.topic.key)}">${finding.topic.label}</a>`}</p>
${statusBlock(finding)}
<h1 class="claim">${finding.claim}</h1>
<p class="meta">${joined(dates, " · ")}</p>
${facts.length === 0 ? "" : html`<dl class="facts">
${joined(facts, "\n")}
</dl>`}
${finding.numbers.length === 0 ? "" : html`<section aria-labelledby="numbers">
<h2 id="numbers">The numbers</h2>
<p>Each rate is a group’s count divided by its size. The number needed to treat or harm is 1 divided by the difference between the two rates, rounded up; AskRigor works them out from the counts.</p>
${finding.numbers.map(figure)}</section>
`}${finding.searches.length === 0 ? "" : html`<section aria-labelledby="searches">
<h2 id="searches">What was searched, and found nothing</h2>
<ul class="search-list">
${finding.searches.map(search)}</ul>
</section>
`}${finding.whyNotUsual === null ? "" : html`<section aria-labelledby="usual">
<h2 id="usual">Why this isn’t the usual answer</h2>
<p>${finding.whyNotUsual}</p>
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

export function renderAtlasChanges(model: AtlasChangesModel): string {
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
    body,
  });
}

// Pages without a model -------------------------------------------------------------------------------------------------

export function renderAtlasNotFound(): string {
  return page({
    path: null,
    title: "Not found | AskRigor Atlas",
    description: "There is no Atlas page at this address.",
    body: html`<h1>Not found</h1>
<p>There is no Atlas page at this address. The finding may have left the Atlas, or the address may be mistyped.</p>
<p><a href="/atlas">Go to the Atlas home</a></p>`,
  });
}

export function renderAtlasUnavailable(): string {
  return page({
    path: null,
    title: "Unavailable | AskRigor Atlas",
    description: "The Atlas is unavailable right now.",
    body: html`<h1>The Atlas is unavailable right now</h1>
<p>Please try again in a few minutes.</p>`,
  });
}

/** A short page answering a form or a sign-in that could not go ahead, with the way back. */
export function renderAtlasMessage(title: string, message: string, back: { href: string; text: string }): string {
  return page({
    path: null,
    title: `${title} | AskRigor Atlas`,
    description: title,
    body: html`<h1>${title}</h1>
<p>${message}</p>
<p><a href="${back.href}">${back.text}</a></p>`,
  });
}

export function renderAtlasTooManyRequests(): string {
  return page({
    path: null,
    title: "Too many requests | AskRigor Atlas",
    description: "Too many requests for Atlas pages.",
    body: html`<h1>Too many requests</h1>
<p>Please wait a minute before loading more Atlas pages.</p>`,
  });
}

// The final check on a rendered page ------------------------------------------------------------------------------------

// What a page never holds, whatever its data: a script, a findings card's reference (ARF- and four digits or more, as
// the Atlas's own guards read one) or a YouTube link. The stores already refuse each of them; a page that holds one is
// not served.
const PAGE_SCRIPT = /<script\b/iu;
const PAGE_CARD_REFERENCE = /ARF-\d{4}/iu;
const PAGE_YOUTUBE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/iu;

export function atlasPageProblems(page: string): Array<"script" | "card_reference" | "youtube_link"> {
  return [
    ...(PAGE_SCRIPT.test(page) ? ["script" as const] : []),
    ...(PAGE_CARD_REFERENCE.test(page) ? ["card_reference" as const] : []),
    ...(PAGE_YOUTUBE.test(page) ? ["youtube_link" as const] : []),
  ];
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
.badge-checked { background: var(--checked-surface); color: var(--checked); }
.badge-contested { background: var(--contested-surface); color: var(--contested); }
.badge-lead, .badge-superseded { background: var(--quiet-surface); color: var(--quiet); }

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
