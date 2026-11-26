# Auth0 Action: AskRigor's terms at the first sign-in

Owner answer 419a (26 November 2026); plan `docs/superpowers/plans/2026-11-25-terms-at-sign-up.md`. The code is
`terms-at-first-sign-in.js`, next to this file. **Not installed.** Creating the Action, adding its secrets and attaching
it to the Login flow are changes to AskRigor's Auth0 tenant, and each waits for the owner's yes in chat.

## What it does

On an interactive sign-in (the OpenID Connect browser flows), the Action sends the person to AskRigor's terms page,
`/account/terms` on the research server, with a token Auth0 signs under the shared secret. It never redirects a
refresh-token exchange or any other token grant, never a sign-in with `prompt=none`, at most once per transaction, and
not when the user's `app_metadata.askrigor_notice_version` already equals `NOTICE_VERSION`.

The page shows AskRigor's free-use notice with "Accept and continue" and "Decline", or goes straight back when the
account's yes already covers the current notice (an active paid private account also goes straight back). It posts its
signed answer to the tenant's `/continue`. The Action checks the answer with `api.redirect.validateToken`; a decline
ends the sign-in with a plain reason (`api.access.deny`), and an acceptance records the version in
`app_metadata.askrigor_notice_version`, the only thing the Action stores.

## Secrets

Auth0 Actions keep their settings as secrets. The Action sends no one to the page while any is missing or malformed.

| Secret | Value |
| --- | --- |
| `TERMS_SECRET` | The same value as the research server's `ASKRIGOR_AUTH0_TERMS_SECRET`: 43 or more base64url characters, for example `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='`. Both sides sign and check with the text itself. Never committed, never pasted into a chat. |
| `TERMS_PAGE_URL` | `https://mcp.askrigor.com/account/terms` (or a test server's page). |
| `NOTICE_VERSION` | `free-contributor-v6-2026-11-15`, the server's `RESEARCH_USE_NOTICE_VERSION`. |
| `APPLY_TO` | The client ID of the dev application the first test uses; `*` (every application) only after the owner's yes. |

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

1. Set `ASKRIGOR_AUTH0_TERMS_SECRET` on the research server and release the server; until then `/account/terms` answers
   503 and nothing else changes. Check that the proxy in front of mcp.askrigor.com adds no Content-Security-Policy of
   its own to `/account/terms` (it already replaces Referrer-Policy on every response): a browser applies both
   policies, and a `form-action` there would stop the page's answer from reaching Auth0's `/continue`.
2. In the Auth0 dashboard, Actions, Library, Build Custom: trigger Login / Post Login, the newest Node runtime offered.
   Paste `terms-at-first-sign-in.js`, add the four secrets above with `APPLY_TO` naming only the dev application, and
   Deploy.
3. Actions, Triggers, post-login: add the Action after any others, and Apply.
4. Sign in through the dev application and a dev connector: the page shows once; Decline ends the sign-in with the
   reason; Accept records the yes and the sign-in finishes; a second sign-in skips the page; a token renewal and a
   `prompt=none` sign-in are never sent to it.
5. Only after that, and the owner's yes, set `APPLY_TO` to `*`.

## Rolling back

Remove the Action from the post-login trigger and Apply: sign-ins go on as before 419a at once. The `app_metadata`
entries it wrote stay and do nothing. The yes the page recorded stays on the research account, as one given in an AI app
does.
