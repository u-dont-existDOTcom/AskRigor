import { NOTHING_RECORDED, freeUseNoticePage } from "../account-terms/pages.js";
import { escapeHtml } from "../atlas/page-guard.js";

/**
 * The pages of Gemini's sign-in: the free-use notice step, the consent step and a fixed error page. No script, no
 * outside resources, and no text from the request except the interaction id (checked to be the library's url-safe
 * alphabet) and the form tokens.
 */

const STYLE = `body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1b1f24}
main{max-width:34rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:1.35rem;margin:0 0 1rem}ul{padding-left:1.2rem}li{margin:.35rem 0}.warn{background:#fff4e5;border-radius:8px;padding:.75rem 1rem}
.note{background:#eef3fb;border-radius:8px;padding:.75rem 1rem}
.buttons{display:flex;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:1px solid #c5ccd6;background:#fff;cursor:pointer}
button.allow{background:#1a56db;border-color:#1a56db;color:#fff}small{color:#57606a}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}main{background:#161b22;box-shadow:none}.warn{background:#3b2a12}.note{background:#162338}button{background:#21262d;color:#e6edf3;border-color:#30363d}button.allow{background:#1f6feb;border-color:#1f6feb}small{color:#8b949e}}`;

const UID = /^[A-Za-z0-9_-]{1,64}$/u;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/u;
/** The library's own next step after a decision: a path on this server, and nothing else. */
export const RESUME_PATH = /^\/oauth\/gemini\/auth\/[A-Za-z0-9_-]{1,64}$/u;

function page(title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex">${head}<title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

/** The free-use notice step's address for an interaction: its form posts there (routes.ts). */
export function noticeStepPath(uid: string): string {
  if (!UID.test(uid)) throw new Error("GEMINI_SIGN_IN_PAGE_INPUT_INVALID");
  return `/oauth/gemini/interaction/${uid}/notice`;
}

/** Above the notice: why Gemini's sign-in shows it. */
export const NOTICE_STEP_LEAD = "Google Gemini can't show this notice in its chat, so AskRigor shows it here, before you " +
  "choose whether to connect Gemini.";
/** Below the buttons: what each answer does. */
export const NOTICE_STEP_AFTER = "Either answer goes on to that choice. If you decline, nothing is recorded, and " +
  "AskRigor's research tools won't run for this account until the notice is accepted or paid private access is active.";

/**
 * The free-use notice for an account whose yes doesn't cover the current notice (owner answer 419a), after the person
 * signed in and before the consent step: AskRigor's terms page's own notice and buttons (account-terms/pages.ts), posting
 * this interaction's notice form token and the version shown to the notice step. changed: shown again because the
 * notice changed while the page was open.
 */
export function noticeStepPage(input: { uid: string; formToken: string; noticeVersion: string; changed?: boolean }): string {
  if (!UID.test(input.uid) || !TOKEN.test(input.formToken)) throw new Error("GEMINI_SIGN_IN_PAGE_INPUT_INVALID");
  return freeUseNoticePage({
    action: noticeStepPath(input.uid),
    fields: [["form_token", input.formToken]],
    noticeVersion: input.noticeVersion,
    ...(input.changed === true ? { changed: true } : {}),
    lead: NOTICE_STEP_LEAD,
    after: NOTICE_STEP_AFTER,
  });
}

/**
 * What the consent step says when the notice step came first: the answer the person gave, that none could be taken, or
 * (unchecked) that the account couldn't be read, so whether it needed the notice is unknown.
 */
export type ConsentNoticeNote = "accepted" | "declined" | "not_recorded" | "unchecked";

const LATER = "To accept it later, connect Gemini to AskRigor again, or accept it in Claude or ChatGPT.";

export const CONSENT_NOTICE_NOTES: Readonly<Record<ConsentNoticeNote, string>> = Object.freeze({
  accepted: "You accepted AskRigor's free-use notice, and your yes is recorded on your AskRigor account.",
  declined: "You declined AskRigor's free-use notice, and nothing was recorded. You can still connect Gemini, but " +
    "AskRigor's research tools won't run for this account until the notice is accepted or paid private access is " +
    `active. ${LATER}`,
  not_recorded: `AskRigor couldn't take an answer to its free-use notice this time. ${NOTHING_RECORDED} ${LATER}`,
  unchecked: "AskRigor couldn't check your account's answer to its free-use notice this time, and nothing was " +
    "recorded. If your account hasn't accepted the notice, AskRigor's research tools won't run until it is accepted. " +
    LATER,
});

/**
 * The consent step, after the person signed in to AskRigor. Allow and Cancel post back to the same interaction. notice:
 * what the notice step before it recorded, said above the question; absent when no notice was shown or needed.
 */
export function consentPage(input: { uid: string; formToken: string; notice?: ConsentNoticeNote }): string {
  if (!UID.test(input.uid) || !TOKEN.test(input.formToken)) throw new Error("GEMINI_SIGN_IN_PAGE_INPUT_INVALID");
  const action = `/oauth/gemini/interaction/${input.uid}`;
  const note = input.notice === undefined ? "" : `<p class="note">${escapeHtml(CONSENT_NOTICE_NOTES[input.notice])}</p>\n`;
  return page("Connect Google Gemini to AskRigor", `<h1>Connect Google Gemini to AskRigor?</h1>
${note}<p>Google Gemini is asking to run AskRigor research as you, with the AskRigor account you just signed in to.</p>
<ul>
<li>It can use AskRigor's research tools with your account, under your account's notice and limits.</li>
<li>It can't use AskRigor's owner review tools.</li>
<li>The connection lasts up to 180 days. To end it sooner, remove AskRigor in Gemini's settings, or ask any AI app
connected to AskRigor to disconnect Gemini.</li>
</ul>
<p class="warn"><strong>Only continue if you just added AskRigor in your own Gemini app.</strong> If someone else sent you
this link, choose Cancel.</p>
<form method="post" action="${action}">
<input type="hidden" name="form_token" value="${input.formToken}">
<div class="buttons"><button class="allow" type="submit" name="decision" value="allow">Allow</button>
<button type="submit" name="decision" value="cancel">Cancel</button></div>
</form>
<p><small>Requested by accountlinking.google.com, Google's service for Gemini connectors.</small></p>`);
}

/** After Allow or Cancel: goes on to Google by itself, with a link where a browser doesn't (routes.ts, moveOn). */
export function moveOnPage(path: string): string {
  if (!RESUME_PATH.test(path)) throw new Error("GEMINI_SIGN_IN_PAGE_INPUT_INVALID");
  return page("Going back to Google Gemini", `<h1>Going back to Google Gemini</h1>
<p>If nothing happens, <a href="${path}">continue to Google Gemini</a>.</p>`,
  `<meta http-equiv="refresh" content="0;url=${path}">`);
}

const ERROR_TEXT: Readonly<Record<string, string>> = {
  invalid_client: "AskRigor couldn't confirm that this request comes from Google Gemini.",
  invalid_request: "The request to connect Gemini was incomplete or malformed.",
  invalid_redirect_uri: "The request named an address AskRigor doesn't send sign-ins to.",
  invalid_scope: "The request asked for access AskRigor doesn't give Gemini.",
  invalid_target: "The request was for a service other than AskRigor's Gemini connector.",
  unsupported_response_type: "The request used a sign-in method AskRigor doesn't support.",
  access_denied: "The connection was cancelled.",
  login_required: "You need to sign in to AskRigor to connect Gemini.",
  session_expired: "This sign-in took too long or was opened in another browser. Start again from Gemini.",
  server_error: "Something went wrong on AskRigor's side. Try again from Gemini in a few minutes.",
};

/** A fixed page per error code; any other code shows the generic text. Nothing from the request is shown. */
export function errorPage(code: string): string {
  const text = ERROR_TEXT[code] ?? "AskRigor couldn't connect Gemini this time. Start again from Gemini.";
  return page("AskRigor couldn't connect Gemini", `<h1>AskRigor couldn't connect Gemini</h1><p>${text}</p>
<p><small>If this keeps happening, write to joel@askrigor.com and say when it happened (no screenshots of codes or
links, please).</small></p>`);
}
