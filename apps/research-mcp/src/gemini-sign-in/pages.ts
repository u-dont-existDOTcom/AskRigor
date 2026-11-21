/**
 * The pages of Gemini's sign-in: the consent step and a fixed error page. No script, no outside resources, and no text
 * from the request except the interaction id (checked to be the library's url-safe alphabet) and the form token.
 */

const STYLE = `body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;margin:0;background:#f6f7f9;color:#1b1f24}
main{max-width:34rem;margin:3rem auto;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
h1{font-size:1.35rem;margin:0 0 1rem}ul{padding-left:1.2rem}li{margin:.35rem 0}.warn{background:#fff4e5;border-radius:8px;padding:.75rem 1rem}
.buttons{display:flex;gap:.75rem;margin-top:1.5rem}button{font:inherit;padding:.6rem 1.2rem;border-radius:8px;border:1px solid #c5ccd6;background:#fff;cursor:pointer}
button.allow{background:#1a56db;border-color:#1a56db;color:#fff}small{color:#57606a}
@media (prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}main{background:#161b22;box-shadow:none}.warn{background:#3b2a12}button{background:#21262d;color:#e6edf3;border-color:#30363d}button.allow{background:#1f6feb;border-color:#1f6feb}small{color:#8b949e}}`;

const UID = /^[A-Za-z0-9_-]{1,64}$/u;
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/u;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

/** The consent step, after the person signed in to AskRigor. Allow and Cancel post back to the same interaction. */
export function consentPage(input: { uid: string; formToken: string }): string {
  if (!UID.test(input.uid) || !TOKEN.test(input.formToken)) throw new Error("GEMINI_SIGN_IN_PAGE_INPUT_INVALID");
  const action = `/oauth/gemini/interaction/${input.uid}`;
  return page("Connect Google Gemini to AskRigor", `<h1>Connect Google Gemini to AskRigor?</h1>
<p>Google Gemini is asking to run AskRigor research as you, with the AskRigor account you just signed in to.</p>
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
