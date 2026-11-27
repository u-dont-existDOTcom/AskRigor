# Auth0 Action: AskRigor's terms at the first sign-in

Owner answer 419a (26 November 2026); plan `docs/superpowers/plans/2026-11-25-terms-at-sign-up.md`. The code is
`terms-at-first-sign-in.js`, next to this file. **Not installed.** Creating the Action, adding its secrets and attaching
it to the Login flow are changes to AskRigor's Auth0 tenant, and each waits for the owner's yes in chat.

## What it does

On an interactive sign-in (the OpenID Connect browser flows), the Action sends the person to AskRigor's terms page,
`/account/terms` on the research server, with a token Auth0 signs under the shared secret; the token also names the
`/continue` of the domain the person signs in through. It never redirects a refresh-token exchange or any other token
grant, never a sign-in with `prompt=none`, at most once per transaction, only for the applications `APPLY_TO` names,
and not when the user's `app_metadata.askrigor_notice_version` already equals `NOTICE_VERSION`.

The page shows AskRigor's free-use notice with "Accept and continue" and "Decline", or goes straight back when the
account's yes already covers the current notice (an active paid private account also goes straight back). The token
answers once: the page keeps the first answer given with it, by the token's SHA-256, until the token expires, so a
copy of the page's address can't record a yes later, and a Decline never becomes one. The page posts its signed answer
to `/continue`, and the Action checks it with `api.redirect.validateToken`:

- a verified Decline ends the sign-in with a plain reason (`api.access.deny`);
- a verified acceptance records the version in `app_metadata.askrigor_notice_version`, the only thing the Action
  stores;
- anything else lets the sign-in go on with nothing recorded: an answer that doesn't verify, no answer at all (the
  page's plain "go on" link, for a browser or proxy that stops its form), or the page's "not recorded", which it sends
  when it can't take an answer (its database doesn't answer, a secret or issuer that differs from the Action's, an
  expired or altered token). AskRigor's research tools still refuse such an account until the notice is accepted, as
  before 419a, so a failure of the page never strands anyone and never records a yes.

Each run logs one line, in Auth0's logs, of why it sent, skipped, ended or let a sign-in through, for example
`askrigor-terms: skipped (not_interactive)` or `askrigor-terms: let through, nothing recorded (page:
account_store_unavailable)`: fixed words and reason codes only, never a user's ID, email, token, state or address.

## Secrets

Auth0 Actions keep their settings as secrets. The Action sends no one to the page while any is missing or malformed.

| Secret | Value |
| --- | --- |
| `TERMS_SECRET` | The same value as the research server's `ASKRIGOR_AUTH0_TERMS_SECRET`: 43 or more base64url characters, for example `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='`. Both sides sign and check with the text itself. Never committed, never pasted into a chat. |
| `TERMS_PAGE_URL` | `https://mcp.askrigor.com/account/terms` (or a test server's page). |
| `NOTICE_VERSION` | `free-contributor-v6-2026-11-15`, the server's `RESEARCH_USE_NOTICE_VERSION`. |
| `APPLY_TO` | The client ID of the dev application the first test uses; `*` (every application) only after the owner's yes (below). |

## Why `APPLY_TO` stays the dev application until a dev round trip passes

`APPLY_TO` names only the dev application until one whole round trip has passed through it (step 4 below). Auth0's
documentation leaves open three things only a real sign-in shows: whether `validateToken` returns every claim of the
page's answer, whether `encodeToken` passes the `aud` and `continue_uri` claims through, and how the clients that
ChatGPT and Claude register for themselves behave. Because every failure lets the sign-in through with nothing
recorded, a mistake there would not look like an outage: everyone would simply be let in without being asked, and the
logs would say `let through`. Only the dev round trip shows that the page really asks, records and ends a declined
sign-in; with `APPLY_TO` on `*` before it, a mistake would reach every person signing in.

## Keeping `NOTICE_VERSION` in step with the server

The server decides. The page records the server's current version and names it in its answer, and the server's own
research tools still refuse an account whose yes no longer covers the current notice, so a version that differs between
the Action and the server is never unsafe:

- **The Action behind the server** (a new material version is live, the secret still names the old one): people whose
  `app_metadata` holds the old version are not sent to the page, and accept the new notice in an AI app, as before 419a.
- **The Action ahead of the server** (the secret changed before the release): the page answers with the server's older
  version, so those people are sent to the page, which goes straight back, at each sign-in until the release.

So a release that changes `RESEARCH_USE_NOTICE_VERSION` changes the version in the table above in the same change
(`tests/auth0-terms-action.test.ts` fails until it does), and after that release is live, the Action's `NOTICE_VERSION`
secret is changed to it (an Auth0 change, with the owner's yes). A version that changes only wording carries an earlier
yes forward, so changing the secret then sends people to a page that goes straight back once.

## Installing (each step with the owner's yes)

1. Set `ASKRIGOR_AUTH0_TERMS_SECRET` on the research server, run migration 0044 and re-run the research-access role's
   provisioning, and release the server; until then `/account/terms` answers 503 and nothing else changes. Check that
   the proxy in front of mcp.askrigor.com adds no Content-Security-Policy of its own to `/account/terms` (it already
   replaces Referrer-Policy on every response): a browser applies both policies, and a `form-action` there would stop
   the page's answer from reaching Auth0's `/continue` (people could still go on by the page's link, with nothing
   recorded).
2. In the Auth0 dashboard, Actions, Library, Build Custom: trigger Login / Post Login, the newest Node runtime offered.
   Paste `terms-at-first-sign-in.js`, add the four secrets above with `APPLY_TO` naming only the dev application, and
   Deploy.
3. Actions, Triggers, post-login: add the Action after any others, and Apply.
4. Sign in through the dev application and a dev connector, with Auth0's logs open: the page shows once; Decline ends
   the sign-in with the reason; Accept records the yes and the sign-in finishes, and the log says `accepted (version
   recorded)`; a second sign-in skips the page; a token renewal and a `prompt=none` sign-in are never sent to it. No log
   line may say `let through` during these steps.
5. Only after that, and the owner's yes, set `APPLY_TO` to `*`.

## Rolling back

Remove the Action from the post-login trigger and Apply: sign-ins go on as before 419a at once. The `app_metadata`
entries it wrote stay and do nothing. The yes the page recorded stays on the research account, as one given in an AI app
does.
