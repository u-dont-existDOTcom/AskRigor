import { createHash } from "node:crypto";

import { RESEARCH_USE_NOTICE_SENTENCES } from "@askrigor/evidence-repository";

import { escapeHtml } from "../atlas/page-guard.js";
import { ACCOUNT_TERMS_PATH, TERMS_STATE, TERMS_TOKEN_FIELD } from "./tokens.js";

/**
 * The pages of AskRigor's terms step at sign-in (owner answer 419a): the free-use notice with its two buttons, the page
 * that goes back to Auth0 by itself, and fixed pages for a link that is expired or not valid, an answer already given,
 * an unavailable step and too many requests. The notice is the one every AI app is given, word for word
 * (RESEARCH_USE_NOTICE_SENTENCES), with links to the full terms and the privacy page. A page shows nothing from the
 * request: the token, the state and the notice version only go back as hidden fields or in the tenant's address, each
 * checked first to be in its own narrow alphabet, and escaped. Gemini's sign-in shows the same notice page, posting to
 * its own step (freeUseNoticePage; gemini-sign-in/pages.ts).
 */

const STYLE = `body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1b1f24}
main{max-width:38rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:1.35rem;margin:0 0 1rem}p{margin:.6rem 0}.links{margin-top:1.25rem}.changed{background:#fff4e5;border-radius:8px;padding:.75rem 1rem}
.lead{font-weight:600}.after{color:#57606a;margin-top:1.25rem}
.buttons{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:1px solid #c5ccd6;background:#fff;color:inherit;cursor:pointer}
button.accept{background:#1a56db;border-color:#1a56db;color:#fff}
@media (max-width:40rem){main{margin:0;border-radius:0;padding:1.25rem 1rem}}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}main{background:#161b22;box-shadow:none}a{color:#58a6ff}.changed{background:#3b2a12}.after{color:#8b949e}button{background:#21262d;border-color:#30363d}button.accept{background:#1f6feb;border-color:#1f6feb}}`;

/** The one script any of these pages runs: the answer page's form sends itself. */
export const ANSWER_SCRIPT = 'document.getElementById("continue").submit();';
const ANSWER_SCRIPT_SOURCE = `'sha256-${createHash("sha256").update(ANSWER_SCRIPT, "utf8").digest("base64")}'`;

/** The notice's page and the fixed pages: no script, forms only to this server. */
export const PAGE_POLICY = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; " +
  "base-uri 'none'";
/**
 * The page that goes back to Auth0. Its form posts to the tenant's /continue, which answers with redirects to whichever
 * app the person is signing in to (ChatGPT, Claude, the Atlas, Gemini's link, an app on the person's own computer).
 * Chromium checks each redirect of a form's submission against form-action (Gemini's Allow page, 22 to 24 Nov 2026), and
 * those addresses cannot be listed, so this policy has no form-action; its only script is the one above, by its hash.
 */
export const ANSWER_POLICY = `default-src 'none'; style-src 'unsafe-inline'; script-src ${ANSWER_SCRIPT_SOURCE}; ` +
  "frame-ancestors 'none'; base-uri 'none'";

/** Where the full terms and the privacy page are, as the Atlas's pages link them. */
const SITE = "https://askrigor.com";

const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
const NOTICE_VERSION = /^free-contributor-v[1-9][0-9]*-[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
/** Said wherever a sign-in goes on without an answer (Gemini's sign-in too). */
export const NOTHING_RECORDED = "Nothing was recorded, and AskRigor's research tools won't run until its free-use notice " +
  "is accepted.";

function page(title: string, body: string): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    `<meta name="referrer" content="no-referrer"><title>${title}</title><style>${STYLE}</style></head>` +
    `<body><main>${body}</main></body></html>`;
}

function checkedToken(token: string): string {
  return escapeHtml(validToken(token));
}

function validToken(token: string): string {
  if (!TOKEN.test(token)) throw new Error("ACCOUNT_TERMS_PAGE_INPUT_INVALID");
  return token;
}

function checkedState(state: string): string {
  if (!TERMS_STATE.test(state)) throw new Error("ACCOUNT_TERMS_PAGE_INPUT_INVALID");
  return state;
}

/** The tenant's /continue with the transaction's state: the way on that needs no form and records nothing. */
export function wayOnHref(continueUrl: URL, state: string): string {
  const href = new URL(continueUrl);
  href.search = new URLSearchParams({ state: checkedState(state) }).toString();
  return escapeHtml(href.href);
}

/**
 * The current free-use notice, word for word, and its two answers; both post the same token back to this page, with the
 * notice version shown, so a yes is recorded only for the notice the person read. changed: shown again because the
 * notice changed while the page was open.
 */
export function noticePage(input: { token: string; state: string; noticeVersion: string; changed?: boolean }): string {
  return freeUseNoticePage({
    action: ACCOUNT_TERMS_PATH,
    fields: [[TERMS_TOKEN_FIELD, validToken(input.token)], ["state", checkedState(input.state)]],
    noticeVersion: input.noticeVersion,
    ...(input.changed === true ? { changed: true } : {}),
  });
}

/** A hidden field of the notice's form: a fixed name of the step's own, and a value the caller has checked. */
export type NoticeFormField = readonly [name: string, value: string];

const FIELD_NAME = /^[a-z_]{1,32}$/u;
/** Where the notice's form posts: a path on this server, in a narrow alphabet. */
const ACTION = /^\/[A-Za-z0-9_-]{1,64}(?:\/[A-Za-z0-9_-]{1,64}){0,5}$/u;

/**
 * The free-use notice's page wherever AskRigor shows it while a person signs in: the current notice, word for word, one
 * sentence per paragraph, the Terms and Privacy links, and "Accept and continue" and "Decline", which post to `action`
 * (a path on this server) with the step's own fields and the notice version shown. lead and after: the step's own plain
 * sentences, above the notice and below the buttons (Gemini's sign-in says why it shows the notice there, and what
 * Decline does). Every value is escaped; a field's name, the action and the version are checked first.
 */
export function freeUseNoticePage(input: {
  action: string;
  fields: readonly NoticeFormField[];
  noticeVersion: string;
  changed?: boolean;
  lead?: string;
  after?: string;
}): string {
  if (!ACTION.test(input.action) || !NOTICE_VERSION.test(input.noticeVersion) ||
    input.fields.some(([name]) => !FIELD_NAME.test(name) || name === "notice_version" || name === "decision")) {
    throw new Error("ACCOUNT_TERMS_PAGE_INPUT_INVALID");
  }
  const notice = RESEARCH_USE_NOTICE_SENTENCES.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join("\n");
  const fields = input.fields.map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">\n`)
    .join("");
  return page("AskRigor's free-use notice", `<h1>AskRigor's free-use notice</h1>
${input.lead === undefined ? "" : `<p class="lead">${escapeHtml(input.lead)}</p>\n`}${input.changed === true ? '<p class="changed">The notice changed while this page was open. This is the current one.</p>\n' : ""}${notice}
<p class="links"><a href="${SITE}/terms" target="_blank" rel="noopener noreferrer">Terms</a> ·
<a href="${SITE}/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></p>
<form method="post" action="${input.action}">
${fields}<input type="hidden" name="notice_version" value="${input.noticeVersion}">
<div class="buttons"><button class="accept" type="submit" name="decision" value="accept">Accept and continue</button>
<button type="submit" name="decision" value="decline">Decline</button></div>
</form>${input.after === undefined ? "" : `\n<p class="after">${escapeHtml(input.after)}</p>`}`);
}

/** What the answer page says above its form. */
export type AnswerPageKind = "accepted" | "declined" | "not_recorded";

/**
 * Back to Auth0 by itself: the answer posts to the tenant's /continue with the transaction's state in the address and
 * the signed answer in the body. Without script, the person presses Continue. Except for a Decline, a plain link also
 * goes on to the tenant, for a browser or proxy that stops the form: Auth0 then gets no answer, and the Action lets the
 * sign-in go on with nothing more recorded. A Decline gets no such link, so it can never become a sign-in.
 */
export function answerPage(input: { continueUrl: URL; token: string; state: string; kind: AnswerPageKind }): string {
  const token = checkedToken(input.token);
  const action = wayOnHref(input.continueUrl, input.state);
  const said = input.kind === "not_recorded"
    ? `<p>AskRigor couldn't take an answer this time. ${NOTHING_RECORDED}</p>\n`
    : "";
  const wayOn = input.kind === "declined"
    ? ""
    : `<p>If Continue doesn't work, <a href="${action}">go on to your app here</a>` +
      `${input.kind === "accepted" ? "; your answer is already recorded" : ""}.</p>\n`;
  return page("Continuing your sign-in", `<h1>Continuing your sign-in</h1>
${said}<form id="continue" method="post" action="${action}">
<input type="hidden" name="${TERMS_TOKEN_FIELD}" value="${token}">
<p>If nothing happens, choose Continue.</p>
<div class="buttons"><button class="accept" type="submit">Continue</button></div>
</form>
${wayOn}<script>${ANSWER_SCRIPT}</script>`);
}

/** A link without a valid token: nothing was shown or recorded. */
export function expiredPage(): string {
  return page("This sign-in link has expired", `<h1>This sign-in link has expired</h1>
<p>Nothing was recorded. Go back to the app you were signing in from and sign in to AskRigor again.</p>`);
}

/** The token was used already for the other answer: nothing changes, and the sign-in does not go on from here. */
export function answeredPage(): string {
  return page("This sign-in link was already answered", `<h1>This sign-in link was already answered</h1>
<p>Nothing was changed. Go back to the app you were signing in from and sign in to AskRigor again.</p>`);
}

/**
 * The step is off or not set up. With the transaction's state, a plain link goes on to the tenant: the sign-in then goes
 * on with nothing recorded.
 */
export function unavailablePage(wayOn?: { continueUrl: URL; state: string }): string {
  const link = wayOn === undefined
    ? "<p>Go back to the app you were signing in from and try again in a few minutes.</p>"
    : `<p>${NOTHING_RECORDED} <a href="${wayOnHref(wayOn.continueUrl, wayOn.state)}">Go on to your app here</a>.</p>`;
  return page("AskRigor's sign-in step isn't available", `<h1>AskRigor's sign-in step isn't available</h1>
${link}`);
}

export function tooManyRequestsPage(): string {
  return page("Too many requests", `<h1>Too many requests</h1>
<p>Nothing was recorded. Wait a minute, then sign in to AskRigor again from your app.</p>`);
}
