# Accepting AskRigor's terms when the account is created (owner question 419)

Status: proposed on 25 November 2026; the owner chose 419a in chat on 26 November, and it is built on a branch, not
released (below, "Built (not released)"). Any change to AskRigor's sign-in at Auth0, and the server release, each need
the owner's yes in chat.

## What happened (25 November 2026)

- **The owner's report** (chat, 15:00 UTC): askrigor.com/atlas/account/private said the page doesn't exist; the Atlas
  said the terms were not accepted; ChatGPT said the terms were accepted but not version 6, and never asked.
- **A read-only check of production** (15:05 UTC, from the laptop; counts, versions and times only): two research
  accounts, both the owner's own logins.
  - The connector's owner subject, an email-and-password login: free-use notice v6 accepted by the owner's standing
    instruction on 16 November; the one Atlas participant, from 2 November.
  - A second login, created on 6 October: notice v5, accepted by the person on 6 November, nothing since.
  - `ASKRIGOR_ATLAS_OWNER_SUBJECT` is not set, so only the first login is the owner on the Atlas. The private page
    answers "not found" to anyone else by design (`pages-http.ts`, `ownerPagesRoute`).
- **Why ChatGPT never asked:** for an account under an earlier notice, inspect returns the notice and the step "Show
  the user this notice, word for word, and ask whether they accept it" (`noticeNextStep`). ChatGPT did not follow it.
  Acceptance in the chat depends on every AI doing as told.
- **What the owner was told to do now:** use the email-and-password login everywhere (the Atlas, ChatGPT, Gemini), or
  name the second login as theirs (`ASKRIGOR_ATLAS_OWNER_SUBJECT`, a settings change that needs their yes).

## The owner's ask

"can we have a better way like creating the account is how they accept the terms of use i think tha't show like every
other website does it."

## Options put to the owner (question 419)

- **a (recommended): an AskRigor page right after the first sign-in.** The short notice, links to the full terms and
  the privacy page, and one button, "Create my account and accept"; then straight back to the app. A version that
  collects or publishes more shows the same page once, at the next sign-in or through a link the app gives.
- **b: the same page, by link only.** Sign-in stays as it is; the first research call answers with the link. No Auth0
  change; people sign in twice.
- **c: stricter acceptance in the chat.** Every research tool's refusal carries the notice and the question.

Every option keeps the notice's plain words on what free use saves and publishes, paid private use as the other
choice, and the owner's logins accepting new versions by the standing instruction of 6 November 2026.

## Design notes for a

- **Auth0's redirect step:** a post-login Action sends the person to AskRigor's page with a signed token
  (`api.redirect.sendUserTo`), and the page returns them to Auth0's continue endpoint. On return,
  `onContinuePostLogin` denies the sign-in when they declined; without that, the rest of the sign-in goes on. The
  Action asks AskRigor whether the account holds the current notice, so the page shows once and cannot loop. Whether
  the askrigor-prod tenant's plan allows redirect Actions is checked before anything is built.
- **Checked 26 Nov 2026, 10:52 UTC (owner chose 419a in chat at 01:14 UTC):** the tenant is on Auth0's Free plan
  (`docs/audits/2026-08-31-auth0-production-configuration.md`), and Auth0's pricing lists "Actions + Forms" on Free with
  a cap of 5, so a post-login redirect Action is allowed. Auth0's redirect page sets the limits: a redirect "won't work
  with ... Refresh Token exchange", and with `prompt=none` "any redirection will result in an
  `error=interaction_required`". So the Action redirects only on an interactive sign-in, skips token renewals and silent
  sign-ins (where the server's own `notice_not_current` refusal stays the backstop), and never redirects twice in one
  transaction. The data the page returns to `/continue` is a token signed with a secret shared by the Action and
  AskRigor's server, checked there with `api.redirect.validateToken` (signature, expiry, state), and POSTed so it cannot
  be replayed from a URL. The docs say nothing about OAuth clients registered dynamically (ChatGPT's and Claude's
  connectors), so the first test is a dev Auth0 application and a dev connector before the production tenant is touched.
- **The record:** the page writes the account's acceptance as the person's own (notice version and time), as
  `accept_free_contributor` does today; declining keeps no account data. A wording-only version still carries the yes
  forward, and a material one asks again once.
- **Gemini** already signs in through AskRigor's own pages (`gemini-sign-in`), where the same page can be shown
  without Auth0.
- **The apps:** the research tools' refusal and inspect give the page's link instead of asking the AI to relay the
  notice; `accept_free_contributor` stays for apps that cannot open a page, since the tool list is fixed.
- **Privacy page and data map:** when and how a yes is recorded, and that a declined sign-in keeps nothing.
- **Tests:** a new account cannot research before accepting; a material version asks again once; a wording-only one
  carries the yes; the owner's logins accept by the standing instruction; declining ends the sign-in and keeps
  nothing; the page cannot be loaded without the signed token.

## Built (not released)

Built on 26 November 2026 on a branch; nothing is deployed and no Auth0 setting is changed.

- **AskRigor's page**, `GET` and `POST /account/terms` on the research server (`apps/research-mcp/src/account-terms/`):
  the Auth0 Action's token (HS256 under the shared secret; the tenant the connector trusts as issuer, written as its
  hostname by `api.redirect.encodeToken`; audience `askrigor-terms`; valid ten minutes at most; a subject) and the
  address's `state` are checked on every request. A `GET` only reads: an account whose yes covers the current notice
  goes straight back as accepted, and any other is shown `RESEARCH_USE_NOTICE` word for word, one sentence per
  paragraph, with the Terms and Privacy links and "Accept and continue" and "Decline", both posting the same token
  back. Accept records the yes with `acceptFreeContributor`, the method `accept_free_contributor` calls, with the same
  agreement and version, noted as `PERSON_SIGN_IN_PAGE`; Decline records nothing. Both answer with a page that posts a
  new token (`iss` `askrigor-terms`, `sub`, `state`, `accepted`, `notice_version` when the yes covers the current
  notice, valid five minutes) to `https://<tenant>/continue?state=<state>` by itself, the token only in the body.
  Without a valid token the page says the link expired and records nothing; with the secret unset it answers 503.
- **The record**: `NOTICE_ACCEPTED_BY` gains `PERSON_SIGN_IN_PAGE`, and migration `0044_research_notice_sign_in_page`
  widens 0031's check for it, under the same name, and changes nothing else (tried on PostgreSQL 16: migrate twice, an
  earlier image's migrate after it, the value written and read through the store, any other value refused, the
  rollback's mapping). `inspect` and the Atlas show it as the person's own yes.
- **The Auth0 Action**, `ops/auth0/actions/terms-at-first-sign-in.js`, with its secrets, how its `NOTICE_VERSION` is
  kept in step with the server, the install steps and the rollback in `terms-at-first-sign-in.md` beside it. It
  redirects only an interactive OpenID Connect sign-in, never a refresh-token exchange or another grant, never
  `prompt=none`, at most once per transaction (Auth0's Action cache, by transaction ID), only for the applications in
  its `APPLY_TO` secret, and not when `app_metadata.askrigor_notice_version` already holds the current version. On
  return it checks the answer with `api.redirect.validateToken`, denies a declined sign-in with a plain reason, and
  records the accepted version in `app_metadata`.
- **Tests**: `tests/account-terms.test.ts` and `tests/auth0-terms-action.test.ts`, the second with a round trip through
  the page in which Auth0's documented token behaviour is simulated; the migration's place and shape in
  `tests/living-evidence-production-deployment.test.ts`. No tool's name, description or schema changed.

**Environment variable**: `ASKRIGOR_AUTH0_TERMS_SECRET`, 43 or more base64url characters (for example 32 random bytes,
`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`), the same value as the Action's `TERMS_SECRET`; never committed.
The page also needs `ASKRIGOR_OAUTH_ENABLED=true` with `ASKRIGOR_OAUTH_ISSUER_URL`, and the research-access database.

**Auth0 steps, each with the owner's yes** (`ops/auth0/actions/terms-at-first-sign-in.md` has the detail):

1. Release the server with the secret set and migration 0044 run; until the Action is attached nobody reaches the page.
   Check that mcp.askrigor.com's proxy adds no content policy of its own to `/account/terms`, whose answer page must be
   free to post to Auth0.
2. Create the Action (Login / Post Login) from `terms-at-first-sign-in.js`, with its four secrets: `TERMS_SECRET`,
   `TERMS_PAGE_URL` (`https://mcp.askrigor.com/account/terms`), `NOTICE_VERSION` (`free-contributor-v6-2026-11-15`)
   and `APPLY_TO`, naming only a dev application's client ID.
3. Attach it to the Login flow (post-login trigger, after any other Action) and Apply.
4. Try it through the dev application and a dev connector: the page once, Decline ending the sign-in with its reason,
   Accept recorded and the sign-in finished, no page at the next sign-in, a token renewal untouched. Auth0's docs say
   nothing of clients registered dynamically (ChatGPT's and Claude's), so try those before step 5.
5. Then `APPLY_TO` `*`, for every application.

**Rollback**: remove the Action from the post-login trigger and Apply; sign-ins go on as before at once. The page
itself can stay. A server rollback to an image from before migration 0044 first maps `PERSON_SIGN_IN_PAGE` to `PERSON`
(infra runbook, migration 0044), since such an image cannot read the value.

**Choices this build made that the plan left open**:

- Auth0 adds the transaction's `state` to the page's address only after the Action has run, so the Action's token
  cannot carry it; a `state` claim, when present, must equal the address's. The binding that counts is on the way
  back: the page's answer carries the state, and `validateToken` checks it against the transaction.
- The page goes straight back, asking nothing, for an active paid private account (accepted, with no version, so the
  Action records nothing and the page goes straight back at each sign-in) and for the owner's own free login, under the
  standing instruction (the instruction records its acceptance at the next research call, as now). It never switches a
  paid private account to free use; a second press of Accept, or a yes given meanwhile in an app, is not written over.
- A revoked or never-enrolled account is asked; Accept enrols it in free use, as `accept_free_contributor` would.
- The answer page's content policy has no `form-action`: Auth0's `/continue` answers with redirects to whichever app
  is signing in, and Chromium checks each against `form-action` (Gemini's Allow page, 22 to 24 Nov). Its one script,
  which sends the form, is allowed by its hash.
- Gemini's link signs the person in through the same Auth0 login (`prompt=login`), so the Action covers it too.

**Privacy page, a draft not published** (for the release that attaches the Action, under "Research-account identity"):

> When you sign in to AskRigor from any app and your account doesn't yet hold a yes to AskRigor's current free-use
> notice, AskRigor shows the notice before the sign-in finishes (a paid private account isn't asked). If you choose
> Accept and continue, AskRigor records your yes on your research account, as it records a yes you give in an AI app:
> the notice version, the time, and that you gave it on that page; Auth0 also keeps that version with your login, so
> you aren't asked again until a new version collects or publishes more. If you choose Decline, nothing is recorded and
> you aren't signed in.

## Sources

- Auth0, "Redirect with Actions": https://auth0.com/docs/customize/actions/flows-and-triggers/login-flow/redirect-with-actions
- Auth0, "GDPR: Track Consent with Lock" (a sign-up checkbox alone records nothing):
  https://auth0.com/docs/secure/data-privacy-and-compliance/gdpr/gdpr-track-consent-with-lock
- Auth0 Community, a declined terms page that did not stop the sign-in without `api.access.deny`:
  https://community.auth0.com/t/actions-pipeline-didnt-pause-when-redirect-user-to-custom-t-c-agreement-page/111068
- Auth0, the post-login API object (`api.redirect.encodeToken`, `sendUserTo`, `validateToken` and its
  `tokenParameterName`, `api.cache`, `api.access.deny`, `api.user.setAppMetadata`), read 26 Nov 2026:
  https://auth0.com/docs/actions/reference/post-login/post-login-api-object.md
- Auth0, the post-login event object (`event.transaction.id`, `protocol` and its values, `prompt`), read 26 Nov 2026:
  https://auth0.com/docs/actions/reference/post-login/post-login-event-object.md
