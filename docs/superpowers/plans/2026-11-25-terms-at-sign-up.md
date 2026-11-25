# Accepting AskRigor's terms when the account is created (owner question 419)

Status: proposed on 25 November 2026; nothing is built or changed until the owner chooses 419a, b or c. Any change to
AskRigor's sign-in at Auth0, and the server release, each need the owner's yes in chat.

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

## Sources

- Auth0, "Redirect with Actions": https://auth0.com/docs/customize/actions/flows-and-triggers/login-flow/redirect-with-actions
- Auth0, "GDPR: Track Consent with Lock" (a sign-up checkbox alone records nothing):
  https://auth0.com/docs/secure/data-privacy-and-compliance/gdpr/gdpr-track-consent-with-lock
- Auth0 Community, a declined terms page that did not stop the sign-in without `api.access.deny`:
  https://community.auth0.com/t/actions-pipeline-didnt-pause-when-redirect-user-to-custom-t-c-agreement-page/111068
