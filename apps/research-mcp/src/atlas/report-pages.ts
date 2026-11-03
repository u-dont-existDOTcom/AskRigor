import {
  ATLAS_REPORT_FIELD_LIMITS,
  type AtlasOwnReport,
  type AtlasPageReport,
  type AtlasReportAnswer,
  type AtlasReportInput,
  type AtlasReportTextField,
} from "@askrigor/evidence-repository";
import { z } from "zod";

import { containsCardReference } from "../findings/acceptance-checks.js";
import { contactDetailKinds, hasDirectionControl, linkKinds } from "./contact-check.js";
import { healthPath, HEALTH } from "./health-tree.js";
import { sourceIdentifierOf } from "./page-data.js";
import { pageGuardProblems } from "./page-guard.js";
import { displayNameProblem, normalizedDisplayName } from "./participation.js";
import { ACCOUNT_PATH, html, page, sourceLink, type AtlasPageReader, type SafeHtml } from "./pages.js";

/**
 * People's own reports on the Atlas (owner answer 229a, 3 Nov 2026; plan
 * docs/superpowers/plans/2026-11-03-atlas-reports-health-tree.md, sections 2 and 3): the "Share what worked for you"
 * form, a report's page with the research around it and the "it worked for me too" and "it didn't" answers, and a
 * reader's own reports. A report's text is its author's: refused at the form for contact details and links, as a
 * comment is, and shown as written, under the name chosen for it or none. An AI warning is the check's own words,
 * labelled as such. The research block is checked exactly: its links only to pages that are not YouTube, its studies
 * only by the identifiers the cards use, its counts by person computed here.
 */

export const SHARE_PATH = "/atlas/share";
export const OWN_REPORTS_PATH = "/atlas/account/reports";
export const reportPath = (publicId: string) => `/atlas/reports/${publicId}`;

/** The consent line the form requires, word for word. */
export const REPORT_CONSENT = "Publish my report on the Atlas in my own words, under the name above or no name. " +
  "I can take it down at any time.";
export const REPORT_LABEL = "A person’s own report, checked by an AI, not by a person";
export const AI_WARNING_LABEL = "AI warning";
export const REPORT_CONTACT_REFUSAL = "Reports can't include contact details or links.";

interface FieldSpec {
  field: Exclude<AtlasReportTextField, "displayName">;
  label: string;
  hint: string;
  long: boolean;
  required: boolean;
}

/** The form's fields in order, with the limits migration 0025 keeps. */
export const REPORT_FIELDS: readonly FieldSpec[] = [
  { field: "problem", label: "The problem", hint: "What it was for, in a few words.", long: false, required: true },
  { field: "tried", label: "What you tried", hint: "The product, food, practice or treatment, by name.", long: false,
    required: true },
  { field: "dose", label: "How much", hint: "The dose or amount, if there was one.", long: false, required: false },
  { field: "howUsed", label: "How you used it", hint: "When, how often, and how.", long: true, required: false },
  { field: "howLong", label: "For how long", hint: "How long you kept it up.", long: false, required: false },
  { field: "whatHappened", label: "What happened", hint: "What changed, and when.", long: true, required: true },
  { field: "howLongLasted", label: "How long it lasted", hint: "Whether it lasted, and for how long.", long: false,
    required: false },
  { field: "sideEffects", label: "Side effects", hint: "Anything unwanted, even if small.", long: true, required: false },
  { field: "otherChanges", label: "Anything else that changed at the same time", hint: "Other treatments, diet, " +
    "sleep, stress, the season.", long: true, required: false },
];

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

/** A field as it is stored: line breaks as \n, no surrounding space; empty is null. */
const normalized = (value: string | null) => {
  const text = (value ?? "").replace(/\r\n?/gu, "\n").trim();
  return text.length === 0 ? null : text;
};

export interface ReportDraft {
  text: Partial<Record<Exclude<AtlasReportTextField, "displayName">, string | null>>;
  displayName: string;
  consent: boolean;
}

export function reportDraftOf(form: URLSearchParams): ReportDraft {
  return {
    text: Object.fromEntries(REPORT_FIELDS.map(({ field }) => [field, normalized(form.get(field))])),
    displayName: normalizedDisplayName(form.get("displayName")),
    consent: form.get("consent") === "yes",
  };
}

/** Why one of a report's texts cannot be published, or undefined; it reads every language alike. */
export function reportTextProblem(text: string, label: string): string | undefined {
  if (CONTROL.test(text)) return `${label} can't hold control characters.`;
  if (hasDirectionControl(text)) return `${label} can't hold text-direction control characters.`;
  if (contactDetailKinds(text).length > 0 || linkKinds(text).length > 0) return REPORT_CONTACT_REFUSAL;
  if (containsCardReference(text)) return "Reports can't name a findings card.";
  const problems = pageGuardProblems(text);
  if (problems.includes("youtube_link")) return REPORT_CONTACT_REFUSAL;
  return problems.length > 0 ? `${label} can't hold that text.` : undefined;
}

/** Why a draft cannot be sent, or undefined. */
export function reportDraftProblem(draft: ReportDraft): string | undefined {
  for (const { field, label, required } of REPORT_FIELDS) {
    const value = draft.text[field] ?? null;
    if (value === null) {
      if (required) return `Fill in “${label}” first.`;
      continue;
    }
    if ([...value].length > ATLAS_REPORT_FIELD_LIMITS[field]) {
      return `“${label}” can be at most ${ATLAS_REPORT_FIELD_LIMITS[field].toLocaleString("en-US")} characters.`;
    }
    const problem = reportTextProblem(value, `“${label}”`);
    if (problem !== undefined) return problem;
  }
  if (draft.displayName.length > 0) {
    const problem = displayNameProblem(draft.displayName);
    if (problem !== undefined) return problem;
  }
  if (!draft.consent) return "Tick the box to say the report may be published.";
  return undefined;
}

export function reportInputOf(draft: ReportDraft): AtlasReportInput {
  return { ...draft.text, displayName: draft.displayName.length === 0 ? null : draft.displayName };
}

// The research block (section 3) ---------------------------------------------------------------------------------

export const REPORT_OUTCOMES = ["better", "no_change", "worse", "mixed"] as const;
export type ReportOutcome = typeof REPORT_OUTCOMES[number];

export const reportResearchSchema = z.object({
  others: z.array(z.object({
    url: z.string().trim().min(1).max(500).describe("The public thread or page where this person reported it."),
    outcome: z.enum(REPORT_OUTCOMES).describe("What this one person reported: better, no_change, worse or mixed."),
    said: z.string().trim().min(1).max(300).optional().describe("What they said, in a short paraphrase."),
  }).strict()).max(100).describe("One entry per person, each linked, never YouTube."),
  studies: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    year: z.number().int().min(1800).max(2100).nullable(),
    source: z.string().trim().min(1).max(200).describe("Its PMID, PMCID, DOI or NCT number, as a card names a source."),
    found: z.string().trim().min(1).max(800).describe("What it found for this remedy and this problem."),
  }).strict()).max(30),
  safety: z.string().trim().min(1).max(3_000).nullable().describe("Known harms, interactions and who should avoid it."),
  unknown: z.string().trim().min(1).max(2_000).nullable().describe("What isn't known."),
}).strict();
export type ReportResearch = z.infer<typeof reportResearchSchema>;

const YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];

/** Exact checks of a research block: what a schema cannot say. Each problem names its place. */
export function reportResearchProblems(research: ReportResearch): string[] {
  const problems: string[] = [];
  research.others.forEach(({ url, said }, index) => {
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {
      parsed = undefined;
    }
    const host = parsed?.hostname.toLowerCase() ?? "";
    if (parsed === undefined || parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" ||
      parsed.port !== "" || host.length === 0 || !host.includes(".")) {
      problems.push(`others[${index}].url is not a plain https address`);
    } else if (YOUTUBE_HOSTS.some((youtube) => host === youtube || host.endsWith(`.${youtube}`))) {
      problems.push(`others[${index}].url is YouTube, which the Atlas never links`);
    } else if (pageGuardProblems(url).length > 0) {
      problems.push(`others[${index}].url is refused by the pages' check`);
    }
    if (said !== undefined && reportTextProblem(said, "said") !== undefined) problems.push(`others[${index}].said`);
  });
  research.studies.forEach(({ title, source, found }, index) => {
    if (sourceIdentifierOf(source) === undefined) problems.push(`studies[${index}].source is not a PMID, PMCID, DOI or NCT number`);
    for (const [name, text] of [["title", title], ["found", found]] as const) {
      if (reportTextProblem(text, name) !== undefined) problems.push(`studies[${index}].${name}`);
    }
  });
  for (const name of ["safety", "unknown"] as const) {
    const text = research[name];
    if (text !== null && reportTextProblem(text, name) !== undefined) problems.push(name);
  }
  return problems;
}

/** How many people reported each outcome, counted from the listed people. */
export function outcomeCounts(research: ReportResearch): Record<ReportOutcome, number> & { people: number } {
  const counts = { better: 0, no_change: 0, worse: 0, mixed: 0, people: research.others.length };
  for (const { outcome } of research.others) counts[outcome] += 1;
  return counts;
}

// Pages -----------------------------------------------------------------------------------------------------------

const OUTCOME_WORDS: Record<ReportOutcome, string> = {
  better: "better", no_change: "no change", worse: "worse", mixed: "mixed",
};

const people = (count: number) => count === 1 ? "1 person" : `${count} people`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric",
  timeZone: "UTC" });

function researchSection(stored: Record<string, unknown> | null): SafeHtml {
  const parsed = stored === null ? undefined : reportResearchSchema.safeParse(stored);
  if (parsed === undefined || !parsed.success || reportResearchProblems(parsed.data).length > 0) {
    return html`<h2>The research around it</h2>
<p>The research around this report isn’t done yet.</p>
`;
  }
  const research = parsed.data;
  const counts = outcomeCounts(research);
  return html`<h2>What others report</h2>
${research.others.length === 0 ? html`<p>No one else’s report was found yet.</p>`
    : html`<p>${people(counts.people)}: ${counts.better} better, ${counts.no_change} no change, ${counts.worse} worse, ${counts.mixed} mixed, each counted once.</p>
<ul class="report-others">${research.others.map(({ url, outcome, said }) => html`<li><a href="${url}" rel="nofollow noopener noreferrer">${new URL(url).hostname.replace(/^www\./u, "")}</a>: ${OUTCOME_WORDS[outcome]}${said === undefined ? "" : html` — ${said}`}</li>`)}</ul>`}
<h2>What the studies show</h2>
${research.studies.length === 0 ? html`<p>No study of this for this problem was found.</p>`
    : html`<ul class="report-studies">${research.studies.map(({ title, year, source, found }) => {
      const link = sourceLink(sourceIdentifierOf(source)!);
      return html`<li><p><cite>${title}</cite>${year === null ? "" : html` (${year})`}${link === undefined ? ""
        : html` · <a href="${link.href}">${link.text}</a>`}</p><p>${found}</p></li>`;
    })}</ul>`}
<h2>Safety</h2>
<p>${research.safety ?? "Nothing about its safety was found."}</p>
<h2>What isn’t known</h2>
<p>${research.unknown ?? "Not stated."}</p>
`;
}

export interface AtlasReportPageView {
  /** A signed-in reader: the answer form's token, and their own answer; null for the report's author. */
  viewer?: { csrf: string; own: boolean; answer: AtlasReportAnswer | null };
  /** Signed out while answers are on: where to sign in. */
  signInHref?: string;
  subcategory?: { key: string; label: string } | null;
}

export function renderAtlasReport(report: AtlasPageReport, view: AtlasReportPageView = {}, reader?: AtlasPageReader): string {
  const text = report.text;
  const details: SafeHtml[] = [];
  for (const { field, label } of REPORT_FIELDS) {
    if (field === "problem" || field === "tried" || field === "whatHappened") continue;
    const value = text[field];
    if (value !== null) details.push(html`<dt>${label}</dt><dd>${value}</dd>`);
  }
  const answers = view.viewer === undefined
    ? view.signInHref === undefined ? "" : html`<p><a href="${view.signInHref}">Sign in</a> to say whether it worked for you.</p>`
    : view.viewer.own ? html`<p class="meta">Others can say here whether it worked for them.</p>`
      : html`<form method="post" action="${reportPath(report.publicId)}/answer" class="report-answer">
<input type="hidden" name="csrf" value="${view.viewer.csrf}">
<button type="submit" name="answer" value="worked"${view.viewer.answer === "worked" ? html` aria-pressed="true"` : ""}>It worked for me too</button>
<button type="submit" name="answer" value="did_not"${view.viewer.answer === "did_not" ? html` aria-pressed="true"` : ""}>It didn’t work for me</button>
${view.viewer.answer === null ? "" : html`<button type="submit" name="answer" value="clear">Take my answer back</button>`}
</form>`;
  return page({
    path: reportPath(report.publicId),
    title: `${report.text.tried} for ${report.text.problem} | AskRigor Atlas`,
    description: `A person’s report: ${report.text.tried} for ${report.text.problem}, with the research around it.`,
    current: "health", reader,
    // A person's report is checked by an AI only: kept out of search engines, like an unreviewed finding.
    noindex: true,
    body: html`${view.subcategory == null ? "" : html`<p class="meta"><a href="${healthPath()}">${HEALTH.label}</a> · <a href="${healthPath(view.subcategory.key)}">${view.subcategory.label}</a></p>
`}<p class="badge badge-report">${REPORT_LABEL}</p>
<h1>${text.tried} for ${text.problem}</h1>
<p class="meta">${report.displayName === null ? "By someone who chose no name" : html`By <bdi>${report.displayName}</bdi>`} · published ${day(report.publishedAt)} · ${report.publicId}</p>
${report.aiWarning === null ? "" : html`<div class="ai-warning" role="note"><p><strong>${AI_WARNING_LABEL}:</strong> ${report.aiWarning}</p></div>
`}<h2>What happened</h2>
<p class="report-words">${text.whatHappened}</p>
${details.length === 0 ? "" : html`<dl class="report-details">${details}</dl>`}
${researchSection(report.research)}
<h2 id="answers">Did it work for you?</h2>
<p>${people(report.answers.worked)} said it worked for them too; ${people(report.answers.didNot)} said it didn’t.</p>
${answers}
<p class="aside">A report is one person’s experience, not medical advice. Check with a doctor before you try something new, especially with other treatments or a health condition.</p>
` });
}

export interface AtlasShareView {
  csrf: string;
  displayName: string | null;
  draft?: ReportDraft;
  error?: string | null;
}

export function renderAtlasShare(view: AtlasShareView, reader?: AtlasPageReader): string {
  const value = (field: Exclude<AtlasReportTextField, "displayName">) => view.draft?.text[field] ?? "";
  const fields = REPORT_FIELDS.map(({ field, label, hint, long, required }) => {
    const id = `report-${field}`;
    const max = ATLAS_REPORT_FIELD_LIMITS[field];
    return html`<p><label for="${id}">${label}${required ? "" : html` <span class="meta">(if you can)</span>`}</label><br>
<span class="meta">${hint}</span><br>
${long ? html`<textarea id="${id}" name="${field}" rows="4" maxlength="${max}"${required ? html` required` : ""}>${value(field)}</textarea>`
      : html`<input id="${id}" name="${field}" maxlength="${max}" value="${value(field)}"${required ? html` required` : ""}>`}</p>`;
  });
  return page({ path: SHARE_PATH, title: "Share what worked for you | AskRigor Atlas", current: "health", reader,
    noindex: true, noReferrer: true,
    description: "Tell the Atlas what you tried for a health problem and what happened.",
    body: html`<h1>Share what worked for you</h1>
<p>Tell others what you tried for a health problem and what happened, good or bad. AskRigor adds the research around it: what others report, what the studies show, and what is known about its safety.</p>
<p>It stays private until AskRigor’s AI checks it. If it is safe to try, it is published, with an AI warning where one is needed; if the AI can’t tell, AskRigor’s owner decides. Contact details, links, promotion and spam are refused.</p>
${view.error ? html`<p class="notice-line" role="alert">${view.error}</p>
` : ""}<form method="post" action="${SHARE_PATH}" class="report-form">
<input type="hidden" name="csrf" value="${view.csrf}">
${fields}
<p><label for="report-name">The name to publish it under</label> <span class="meta">(leave it empty for no name)</span><br>
<input id="report-name" name="displayName" maxlength="40" value="${view.draft?.displayName ?? view.displayName ?? ""}"></p>
<p><label><input type="checkbox" name="consent" value="yes"${view.draft?.consent ? html` checked` : ""} required> ${REPORT_CONSENT}</label></p>
<p><button type="submit">Send my report</button></p>
</form>
<p class="aside">Not medical advice. <a href="${ACCOUNT_PATH}">Your account</a> lists your reports, where you can take any of them down.</p>
` });
}

export function renderAtlasShareSent(publicId: string, reader?: AtlasPageReader): string {
  return page({ path: null, title: "Report received | AskRigor Atlas", current: "health", reader, noindex: true,
    description: "Your report is received.",
    body: html`<h1>Thank you</h1>
<p>Your report ${publicId} is received. It stays private until AskRigor’s AI checks it, which can take a day.</p>
<p><a href="${OWN_REPORTS_PATH}">Your reports</a> shows where it stands, and lets you take it down at any time.</p>
` });
}

const STATE_WORDS: Record<AtlasOwnReport["state"], string> = {
  received: "Waiting for the AI check",
  published: "Published",
  held: "Waiting for AskRigor’s owner, since the AI couldn’t judge it",
  refused: "Not published",
};
const REFUSE_WORDS = { promotion: "it read as promotion", spam: "it read as spam",
  not_a_report: "it isn’t a report of your own experience" } as const;

export function renderAtlasOwnReports(reports: readonly AtlasOwnReport[], tokens: (publicId: string) => string,
  reader?: AtlasPageReader): string {
  return page({ path: null, title: "Your reports | AskRigor Atlas", current: "account", reader, noindex: true,
    description: "The reports you sent to the Atlas.",
    body: html`<h1>Your reports</h1>
${reports.length === 0 ? html`<p>You haven’t sent a report. <a href="${SHARE_PATH}">Share what worked for you</a>.</p>`
      : html`<ul class="own-reports">${reports.map((report) => html`<li>
<p>${report.state === "published" ? html`<a href="${reportPath(report.publicId)}">${report.tried} for ${report.problem}</a>`
          : report.state === "refused" ? html`${report.publicId}` : html`${report.tried} for ${report.problem}`} <span class="meta">(${report.publicId})</span></p>
<p class="meta">${STATE_WORDS[report.state]}${report.refuseReason === null ? "" : html`: ${REFUSE_WORDS[report.refuseReason]}`}</p>
<form method="post" action="${OWN_REPORTS_PATH}/${report.publicId}/delete"><input type="hidden" name="csrf" value="${tokens(report.publicId)}"><button type="submit">Take it down</button></form>
</li>`)}</ul>`}
<p><a href="${SHARE_PATH}">Share another</a> · <a href="${ACCOUNT_PATH}">Your account</a></p>
` });
}
