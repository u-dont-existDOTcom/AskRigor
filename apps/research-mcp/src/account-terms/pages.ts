import { createHash } from "node:crypto";

import { RESEARCH_USE_NOTICE_SENTENCES } from "@askrigor/evidence-repository";

import { escapeHtml } from "../atlas/page-guard.js";
import { ACCOUNT_TERMS_PATH, TERMS_STATE, TERMS_TOKEN_FIELD } from "./tokens.js";

/**
 * The pages of AskRigor's terms step at sign-in (owner answer 419a): the free-use notice with its two buttons, the page
 * that goes back to Auth0 by itself, and fixed pages for a link that is expired or not valid, for an unavailable step
 * and for too many requests. The notice is the one every AI app is given, word for word (RESEARCH_USE_NOTICE_SENTENCES),
 * with links to the full terms and the privacy page. A page shows nothing from the request: the token and the state
 * only go back as hidden fields, each checked first to be in its own narrow alphabet, and escaped.
 */

const STYLE = `body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1b1f24}
main{max-width:38rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:1.35rem;margin:0 0 1rem}p{margin:.6rem 0}.links{margin-top:1.25rem}
.buttons{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:1px solid #c5ccd6;background:#fff;color:inherit;cursor:pointer}
button.accept{background:#1a56db;border-color:#1a56db;color:#fff}
@media (max-width:40rem){main{margin:0;border-radius:0;padding:1.25rem 1rem}}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}main{background:#161b22;box-shadow:none}a{color:#58a6ff}button{background:#21262d;border-color:#30363d}button.accept{background:#1f6feb;border-color:#1f6feb}}`;

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

function page(title: string, body: string): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    `<meta name="referrer" content="no-referrer"><title>${title}</title><style>${STYLE}</style></head>` +
    `<body><main>${body}</main></body></html>`;
}

function checked(input: { token: string; state: string }): { token: string; state: string } {
  if (!TOKEN.test(input.token) || !TERMS_STATE.test(input.state)) throw new Error("ACCOUNT_TERMS_PAGE_INPUT_INVALID");
  return { token: escapeHtml(input.token), state: escapeHtml(input.state) };
}

/** The current free-use notice, word for word, and its two answers; both post the same token back to this page. */
export function noticePage(input: { token: string; state: string }): string {
  const { token, state } = checked(input);
  const notice = RESEARCH_USE_NOTICE_SENTENCES.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join("\n");
  return page("AskRigor's free-use notice", `<h1>AskRigor's free-use notice</h1>
${notice}
<p class="links"><a href="${SITE}/terms" target="_blank" rel="noopener noreferrer">Terms</a> ·
<a href="${SITE}/privacy" target="_blank" rel="noopener noreferrer">Privacy</a></p>
<form method="post" action="${ACCOUNT_TERMS_PATH}">
<input type="hidden" name="${TERMS_TOKEN_FIELD}" value="${token}">
<input type="hidden" name="state" value="${state}">
<div class="buttons"><button class="accept" type="submit" name="decision" value="accept">Accept and continue</button>
<button type="submit" name="decision" value="decline">Decline</button></div>
</form>`);
}

/**
 * Back to Auth0 by itself: the answer posts to the tenant's /continue with the transaction's state in the address and
 * the signed answer in the body. Without script, the person presses Continue.
 */
export function answerPage(input: { continueUrl: URL; token: string; state: string }): string {
  const { token } = checked(input);
  const action = new URL(input.continueUrl);
  action.search = new URLSearchParams({ state: input.state }).toString();
  return page("Continuing your sign-in", `<h1>Continuing your sign-in</h1>
<form id="continue" method="post" action="${escapeHtml(action.href)}">
<input type="hidden" name="${TERMS_TOKEN_FIELD}" value="${token}">
<p>If nothing happens, choose Continue.</p>
<div class="buttons"><button class="accept" type="submit">Continue</button></div>
</form>
<script>${ANSWER_SCRIPT}</script>`);
}

/** A link without a valid token: nothing was shown or recorded. */
export function expiredPage(): string {
  return page("This sign-in link has expired", `<h1>This sign-in link has expired</h1>
<p>Nothing was recorded. Go back to the app you were signing in from and sign in to AskRigor again.</p>`);
}

/** The step is off, or the account store didn't answer: no answer goes back to the sign-in. */
export function unavailablePage(): string {
  return page("AskRigor's sign-in step isn't available", `<h1>AskRigor's sign-in step isn't available</h1>
<p>Go back to the app you were signing in from and try again in a few minutes.</p>`);
}

export function tooManyRequestsPage(): string {
  return page("Too many requests", `<h1>Too many requests</h1>
<p>Nothing was recorded. Wait a minute, then sign in to AskRigor again from your app.</p>`);
}
