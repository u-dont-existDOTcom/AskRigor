# Accepting AskRigor's terms when the account is created (owner question 419)

Status: proposed on 25 November 2026; the owner chose 419a in chat on 26 November, and it is built on a branch, not
released (below, "Built (not released)"). Gemini's own sign-in step was built on 27 November on a branch stacked on it,
not released (below, "Gemini's sign-in"). Any change to AskRigor's sign-in at Auth0, and the server release, each need
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
  without Auth0. Built 27 November 2026 (below, "Gemini's sign-in").
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
  A request without a single token and state gets a page saying the link expired, and nothing is recorded; with the
  secret unset the page answers 503.
- **The security review of 26 November** (three fixes before the owner's release):
  1. *Single use.* The first POST, Accept or Decline, keeps the token's SHA-256 with its decision until the token
     expires (`research_terms_page_answers`; expired rows go at each use). A later POST records nothing: the same
     decision gets the same answer again (a double press), the other one is refused, so a copy of the page's address
     can't record a yes and a Decline never becomes one. A GET still writes nothing.
  2. *The version shown.* The notice's form carries the version it showed; an Accept for any other version records
     nothing and shows the page again with the current notice, as `accept_free_contributor` refuses an earlier one.
  3. *A way through.* A token that doesn't check out (a secret or issuer that differs from the Action's, an expired or
     altered token) or a database that doesn't answer sends the person on with a signed "not recorded" answer, and a
     plain link goes on when a browser or proxy stops the answer's form; the Action lets those through with nothing
     recorded, so the research tools' refusal stays the backstop. A Decline is honoured whenever the token is the
     Action's, and never gets the plain link. The Action logs one line per run of why it sent, skipped, ended or let a
     sign-in through, reason codes only. The Action's token also names the `/continue` of the domain the person signs in
     through, so a custom domain gets its answer.
- **The record**: `NOTICE_ACCEPTED_BY` gains `PERSON_SIGN_IN_PAGE`, and migration `0044_research_notice_sign_in_page`
  widens 0031's check for it, under the same name, and adds `research_terms_page_answers`, kept from every role but the
  research-access role (tried on PostgreSQL 16: migrate twice, an earlier image's migrate after it, the value written and
  read through the store, any other value refused, the rollback's mapping, the token claims). `inspect` and the Atlas
  show it as the person's own yes.
- **The Auth0 Action**, `ops/auth0/actions/terms-at-first-sign-in.js`, with its secrets, how its `NOTICE_VERSION` is
  kept in step with the server, the install steps and the rollback in `terms-at-first-sign-in.md` beside it. It
  redirects only an interactive OpenID Connect sign-in, never a refresh-token exchange or another grant, never
  `prompt=none`, at most once per transaction (Auth0's Action cache, by transaction ID), only for the applications in
  its `APPLY_TO` secret, and not when `app_metadata.askrigor_notice_version` already holds the current version. On
  return it checks the answer with `api.redirect.validateToken`, denies a verified Decline with a plain reason, records
  a verified acceptance's version in `app_metadata`, and lets anything else through with nothing recorded, logging why.
- **Tests**: `tests/account-terms.test.ts` and `tests/auth0-terms-action.test.ts`, the second with a round trip through
  the page in which Auth0's documented token behaviour is simulated; the migration's place and shape in
  `tests/living-evidence-production-deployment.test.ts`. No tool's name, description or schema changed.

### Gemini's sign-in (built 27 November 2026, not released)

The owner, 27 November 2026: "gemini is still not working ... can you pls fix that". The server's step log for the
owner's tries that day showed the whole sign-in succeeding and research calls reaching the server; research tools refuse
an account whose yes doesn't cover the current notice, and Gemini can't show the notice in its chat, so an account used
only through Gemini could never accept it (diagnosed 25 November).

- **What a Gemini user sees**: Gemini's link, AskRigor's sign-in through Auth0 as before, then, for an account whose yes
  doesn't cover the current notice, AskRigor's free-use notice on its own page: a sentence saying Gemini can't show it in
  its chat, so AskRigor shows it here before the person chooses whether to connect Gemini; the notice word for word with
  the Terms and Privacy links and "Accept and continue" and "Decline"; and a sentence saying either answer goes on to that
  choice, and what Decline means. Then "Connect Google Gemini to AskRigor?" with Allow and Cancel, as before, with one
  line above it saying what was recorded. An account whose yes covers the current notice, the owner's own free login and
  an active paid private account see the consent page exactly as before.
- **Accept** records the yes as `/account/terms` does, through the same code (`decideNotice` in
  `apps/research-mcp/src/account-terms/decision.ts`): `acceptFreeContributor` with the same agreement, noted
  `PERSON_SIGN_IN_PAGE`, only for the notice version the page showed (an Accept for another version shows the current
  notice again, recording nothing). The consent page then says the yes is recorded.
- **Decline** records nothing. The consent page follows all the same, saying nothing was recorded and that research tools
  won't run for the account until the notice is accepted (connecting Gemini to AskRigor again shows it; Claude or ChatGPT
  can too) or paid private access is active; Allow still connects Gemini, so a later yes or paid private use need no new
  link. The research tools keep refusing as before.
- **A step before the consent page, not on it**: each page asks one thing (the notice: Accept or Decline; the
  connection: Allow or Cancel), so the terms page's own notice page is reused as it is (`freeUseNoticePage`), and the
  consent page and its Allow path, fixed after the owner's tries of 22 to 24 November, stay as they were for every
  account the step doesn't ask.
- **The security review's three fixes, for this step**: (1) *single use*: the step's form token is an HMAC of the
  interaction and its login session under a key of its own (derived as `notice-form` from the Gemini sign-in's secret);
  the first POST keeps its SHA-256 with the decision in `research_terms_page_answers` until a minute past the
  interaction's end (about eleven minutes), so a double press gets the same answer, the other answer is refused ("This
  sign-in link was already answered") and a Decline never becomes a yes; (2) *the version shown*, as on the terms page;
  (3) *a way through*: an account store or answers table that doesn't answer leads on to the consent page with a line
  saying nothing was recorded, so the connection never stops on it and the research tools' refusal stays the backstop.
  The form is checked as the consent form is: a same-site POST (or `Origin: null` with `Sec-Fetch-Site: same-origin`
  behind production's proxy), the interaction's cookies and its token; an expired or ended link meets the existing
  "start again from Gemini" page and records nothing.
- **Gemini's research refusal** (only on `/mcp/gemini`) now also tells the person to remove AskRigor in Gemini's
  settings and add it again, which shows the notice when they sign in, besides opening AskRigor in Claude or ChatGPT.
  Already-linked accounts need this: their link was made without the step.
- **The step log** (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS`, off by default) gains a `notice` step with fixed outcomes:
  shown, shown_again, accepted, declined, not_needed, not_recorded (with the reason code) and answered_otherwise.
- Nothing changes for ChatGPT or Claude; no tool's name, description or schema changed. Tests:
  `tests/gemini-sign-in-notice.test.ts` (the page, Accept, Decline, the accounts not asked, the version shown, single
  use, refused requests, store failures, the kept key, production's proxy, the step log, the server's wiring) and two in
  `tests/gemini-sign-in-server.test.ts` (research ready on `/mcp/gemini` after Accept; refused, with the new guidance,
  after Decline).
- **Release needs** for this step: no new environment variable (not `ASKRIGOR_AUTH0_TERMS_SECRET`, which only the
  Action's page uses) and no Auth0 change. The server's release with migration 0044 run and the research-access role's
  provisioning re-run (step 1 below), so the yes and the step's answers can be written; without them nothing breaks, but
  nothing is recorded and every Accept meets the "couldn't take an answer" line. The privacy page's Gemini sentence goes
  out with it (in `site/privacy/index.html` on the branch); the release sets the page's effective date to its day. When
  the Action (below) also applies to Gemini's login application, its page comes first, and this step shows only when the
  Action let the sign-in through with nothing recorded.

**Environment variable**: `ASKRIGOR_AUTH0_TERMS_SECRET`, 43 or more base64url characters (for example 32 random bytes,
`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`), the same value as the Action's `TERMS_SECRET`; never committed.
The page also needs `ASKRIGOR_OAUTH_ENABLED=true` with `ASKRIGOR_OAUTH_ISSUER_URL`, and the research-access database.

**Auth0 steps, each with the owner's yes** (`ops/auth0/actions/terms-at-first-sign-in.md` has the detail):

1. Release the server with the secret set, migration 0044 run and the research-access role's provisioning re-run; until
   the Action is attached nobody reaches the page. Check that mcp.askrigor.com's proxy adds no content policy of its own
   to `/account/terms`, whose answer page must be free to post to Auth0.
2. Create the Action (Login / Post Login) from `terms-at-first-sign-in.js`, with its four secrets: `TERMS_SECRET`,
   `TERMS_PAGE_URL` (`https://mcp.askrigor.com/account/terms`), `NOTICE_VERSION` (`free-contributor-v6-2026-11-15`)
   and `APPLY_TO`, naming only a dev application's client ID.
3. Attach it to the Login flow (post-login trigger, after any other Action) and Apply.
4. Try it through the dev application and a dev connector, with Auth0's logs open: the page once, Decline ending the
   sign-in with its reason, Accept recorded and the sign-in finished, no page at the next sign-in, a token renewal
   untouched, and no log line saying "let through". Auth0's docs say nothing of clients registered dynamically
   (ChatGPT's and Claude's), so try those before step 5.
5. Then `APPLY_TO` `*`, for every application. Until that round trip has passed, `APPLY_TO` stays the dev application:
   every failure lets people through with nothing recorded, so a mistake would not show as an outage, only as everyone
   let in unasked.

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
- A second POST of the same decision gets the same answer again rather than a refusal, so a double press of Accept,
  whose second request is the one the browser shows, doesn't strand a person whose yes is already recorded; it records
  nothing, and the other decision is refused.
- The way through lets a person past a page that failed without asking them, so the page can be skipped (someone could
  go to `/continue` by hand), as anyone could sign in before 419a; nothing is recorded, and research still needs the
  notice accepted. If the database fails as a Decline is kept, the Decline still ends the sign-in, but its token isn't
  marked used.
- A revoked or never-enrolled account is asked; Accept enrols it in free use, as `accept_free_contributor` would.
- The answer page's content policy has no `form-action`: Auth0's `/continue` answers with redirects to whichever app
  is signing in, and Chromium checks each against `form-action` (Gemini's Allow page, 22 to 24 Nov). Its one script,
  which sends the form, is allowed by its hash.
- Gemini's link signs the person in through the same Auth0 login (`prompt=login`), so the Action covers it too; Gemini's
  own step (above) covers it without the Action.

**Privacy page, a draft not published** (for the release that attaches the Action, under "Research-account identity"):

> When you sign in to AskRigor from any app and your account doesn't yet hold a yes to AskRigor's current free-use
> notice, AskRigor shows the notice before the sign-in finishes (a paid private account isn't asked). If you choose
> Accept and continue, AskRigor records your yes on your research account, as it records a yes you give in an AI app:
> the notice version, the time, and that you gave it on that page; Auth0 also keeps that version with your login, so
> you aren't asked again until a new version collects or publishes more. If you choose Decline, nothing is recorded and
> you aren't signed in. So that the page's link can be used only once, AskRigor keeps a one-way fingerprint of the link
> with your answer for about twelve minutes. If the page can't take your answer, you are signed in with nothing
> recorded, and AskRigor's research tools ask for your yes before any research.

**Privacy page, Gemini's sentences** (built 27 November, in the "Connecting Google Gemini" section of
`site/privacy/index.html` on the branch, to go out with the server release, which sets the effective date):

> If your account doesn’t yet hold a yes to AskRigor’s current free-use notice, AskRigor shows you that notice before
> you choose, because Gemini can’t show it in its chat. If you choose Accept and continue, AskRigor records your yes on
> your research account, as it records a yes you give in an AI app: the notice version, the time, and that you gave it
> on that page. If you choose Decline, nothing is recorded, and you can still allow Gemini, but AskRigor’s research tools
> won’t run for your account until the notice is accepted or paid private access is active. So that each answer counts
> once, AskRigor keeps a one-way fingerprint of that step’s form with your answer for about eleven minutes.

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
