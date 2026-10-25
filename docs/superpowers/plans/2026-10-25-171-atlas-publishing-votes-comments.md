# Decision 171: publishing every card, with votes and comments (build plan, 25 October 2026)

Status: plan, being built on the build branch. Owner answers: "168a" (24 Oct, about 15:55 UTC: every new card published
automatically with the label, public votes and comments from signed-in accounts, under notice version 4) and "171
approved" (24 Oct, 23:29 UTC: the exact wording and the six defaults below). It replaces phase 4 of
`2026-10-22-public-atlas-build.md` where the two differ; phases 1 to 3 there stand, and so do the page organization of
question 159 (`docs/public-atlas/2026-10-22-atlas-organization-draft.md`, answers 1b 2a 3b 4a 5a 6a and 7) and 156a.
The release waits for the owner's yes, as every release does.

## 1. The approved wording, word for word

Everything else in these texts stays as it is.

**The free notice, version 4,** which free accounts accept once more:

- Instead of "Findings that AskRigor's owner accepts may be published in AskRigor's public Atlas, written without you.":
  > Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and
  > marked "Not checked by supervisors yet" until AskRigor's owner has reviewed them, and people who sign in can vote
  > and comment on them.
- Instead of "If you ask to delete a findings card, everything that ties it to you is removed, and no reason is needed.":
  > If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas
  > unless AskRigor's owner has already accepted its findings; no reason is needed.
- "A published finding stays while it is valid: …" begins "An accepted finding stays while it is valid: …".

**The privacy page:** instead of "Findings that AskRigor's owner accepts from a saved findings card, in either mode, may
be published in AskRigor's public Atlas, written without the person.":

> Findings cards saved in free contributor mode are published in AskRigor's public Atlas as soon as they are saved,
> written without the person and marked "Not checked by supervisors yet" until AskRigor's owner has reviewed them.
> Findings from a paid private card are published only after AskRigor's owner accepts them.

A new section, "Votes and comments in the Atlas":

> To vote on a finding or comment on it, you sign in with an AskRigor account. AskRigor stores each vote and comment
> with a key derived from the account, never its email address. Votes are shown only as totals. A comment is public and
> is shown with the display name you choose, so don't post contact details or anything that identifies you or someone
> else. AskRigor checks comments for contact details and links before showing them, and its owner may hide or remove
> any comment. You can delete your own votes and comments at any time.

**The terms:** the same replacement sentences (with "you" for "the person"), and:

> Comments in the Atlas must be about the finding. Your own experiences are welcome, and comments are not medical
> advice. Don't post contact details, personal information about anyone else, advertising or harassment. AskRigor may
> hide or remove any comment and stop an account from commenting. By posting a comment you let AskRigor show it in the
> Atlas, and you can delete it at any time.

## 2. The approved defaults

1. **Votes:** "agree" or "disagree" on each finding, one per account and changeable, shown as totals.
2. **Comments** appear at once, after the automatic check for contact details and links, with a "report" link. The
   owner hides or removes them from the review tool.
3. **Sign-in:** the AskRigor login people already use in the apps.
4. **Only free-account cards publish automatically;** paid cards still wait for the owner's acceptance.
5. **Before anything is published,** the regression runs stop saving cards, and the test cards ARF-0116 to ARF-0239
   are set aside, not published.
6. **No findings drawn from YouTube comments** on cards until YouTube answers (question 173).

## 3. What changes from the 22 October phase 4 plan

- **Publishing no longer waits for acceptance** for free cards. A finding is public from its save, with the label,
  until the owner accepts it (the label goes), edits it (the edited version shows) or rejects it (it leaves the pages).
- **The pages have dynamic parts:** votes, comments and sign-in. The 22 Oct plan's "static pages, no cookies" holds for
  readers who don't sign in: they get no cookie.
- **People appear on pages, by choice:** a comment shows the display name its author chose. Still never an account, an
  ARF number, a chat, an answer quote or a contributor.
- **YouTube:** nothing derived from YouTube appears on any page, not even a count of videos read (default 6 and the
  23 Oct quota grant). Owner answer 173 (25 Oct) keeps findings drawn from YouTube comments apart from the card, for
  the owner's review only, until deleted on request or because YouTube asks (the owner's rule the same day; branch
  `claude/release-167-youtube-30-days-20261025`, migration 0019 there, merged into this build on 25 Oct); they are
  never published, so the publication rules above still leave them out.

## 4. How it is built (the session's design; method within the owner's decisions)

**A. Wording and consent.** As phase 1 did for version 3 (`4e90274d`, migration 0016, rollback step `20287bdb`):
the notice version constant becomes version 4, migration 0020 admits it, the notice text takes the three changes,
the privacy page and the terms take theirs (and their effective date), and the rollback step sets accepted version 4
accounts aside safely if the release is undone. The paid save offer keeps its sentence: paid cards still publish only
after acceptance. Free accounts accept version 4 once, through `manage_research_access`; today that is the owner.

**B. Publications.** A finding is published when all of these hold, each an exact check:

- its card was saved in free contributor mode by an account that has accepted version 4;
- the account is not a dev account (`ASKRIGOR_DEV_ACCOUNT_KEYS`): dev accounts' cards are published only on acceptance,
  a safety net for default 5;
- the card is not set aside (default 5) and declares its findings public (156a);
- the finding is not drawn from YouTube comments (the stored-card rule of 170, applied again to cards saved before it);
- its text passes the same contact-details and link check as comments; a finding that fails waits for the owner.

What a page shows of a finding, from the stored card: the card's topic; the finding's claim, certainty, whom it applies
to, kind, subject and direction; the numbers block, with rates, NNT and NNH worked out by code; for "nothing found",
the searches; its sources as links; why it isn't the usual view and what would change it; the date it was saved; and
the AskRigor version. Never the ARF number, the account, the contributor, the answer quote, the chat or the surface.

Storage: a publications table in the Atlas database (migration 0021), one row per published finding, with a public
number (P-1001 upward, never an ARF number), the card's digest and finding index, the published fields, and its state:
`unreviewed`, `accepted` (with its F-number), `edited`, `rejected`, `withdrawn` (card deleted) or `held` (failed the
contact check). The save path writes the rows right after a confirmed save, idempotently by card digest; a backfill
publishes the eligible cards saved before (after the owner accepts version 4). A deleted card's unreviewed findings
leave the pages; accepted ones stay (version 4's wording). Accepting, editing and rejecting stay the phase 2 actions;
they now also move the publication's state.

Status (25 Oct): B and F's publication actions are built on `claude/171b-publications-20261025`, not released.
Migration `0021_atlas_publications` (table, P-number sequence, six review-role functions) and its store; the exact
eligibility and the projection (`apps/research-mcp/src/atlas/publication.ts`); the contact-details and links check
(`atlas/contact-check.ts`); publishing right after a confirmed free save, in the background; `list_publications`,
`unpublish_finding`, `publish_cards` and `set_aside_cards` (`list_findings` leaves set-aside cards out unless
`includeSetAside`); accept, edit and reject move the state, an erasure erases the published fields, and `forget_card`
withdraws and erases what is not accepted. The backfill is `publish_cards`, after the owner accepts version 4.
Accepting or editing a finding that has no publication (a paid private card's, or one of the owner's older cards' not
yet chosen with `publish_cards`) publishes it in that state (`reconcileCardPublications`), so every accepted finding has
a page once the timer writes its F number; a rejection publishes nothing, and a set-aside card stays off the pages.

**C. The pages.** Served by the research server at `https://askrigor.com/atlas`, which the apex site's Caddy
reverse-proxies there; rendered on the server from the database, with no client script and the site's strict content
policy; forms post to the same origin. Page types, from the 159 draft: home (recently published, recently checked,
the owner's "most important now" picks with their reasons (2a), contested), topic (a card topic or condition), finding
(the label, numbers, sources, votes and comments) and what changed. Rendered pages are cached briefly for readers who
aren't signed in. Search and the retraction warnings (6a) follow in phase 5.

Status (25 Oct): C is built on `claude/171c-pages-20261025`, not released, and switched off until
`ASKRIGOR_ATLAS_PAGES=enabled`. The pages (`apps/research-mcp/src/atlas/pages.ts`, `page-data.ts`, `pages-http.ts`) read
the publications and the accepted findings through the reader role (`PostgresAtlasPageSource` in
`packages/evidence-repository/src/atlas-pages.ts`; no migration): home (recently published, recently checked,
contested; the owner's picks lane has its place and renders nothing until its owner action exists), topic, finding
(an accepted or edited one as its F number's latest version, from the timer's write on) and what changed, with the
/atlas headers, no cookie, a 60-second cache dropped on every publication or review write in the process, the
per-address limit and the apex Caddy route. The finding page's place for votes and comments renders nothing until E.

**D. Sign-in.** The AskRigor login of the apps, through the same Auth0 tenant and connections: an Auth0 regular web
application with the authorization code flow and PKCE, callback `https://askrigor.com/atlas/auth/callback`. The server
derives the same account key the connector derives, and keeps only a key derived from it (never the email address).
The session is a signed, encrypted, HttpOnly, Secure, SameSite=Lax cookie on `/atlas`, with an expiry, set only on
sign-in; sign-out clears it. **Owner action:** create the Auth0 application (or let the session create it) and put its
client secret into the server's runtime settings; the session never types a secret.

Status (25 Oct): D is built on `claude/171c-pages-20261025`, not released, and switched off until
`ASKRIGOR_ATLAS_PARTICIPATION=enabled` with every part configured (`apps/research-mcp/src/atlas/sign-in.ts`,
`participation.ts`, `pages-http.ts`): `/atlas/auth/login` (code flow with PKCE S256 and `scope=openid`; the state,
nonce and verifier in a 10-minute encrypted cookie on `/atlas/auth`; sign-in always starts on the public origin), the
callback (state checked, the code exchanged with the client secret and the verifier, the ID token verified against the
tenant's keys for issuer, audience, nonce and expiry), the participant key (an HMAC under
`ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL` of the account key `researchAccountKeyForSubject` derives), the
AES-256-GCM session cookie on `/atlas` (30 days, no server-side store) and sign-out by form post, after which the page
offers the tenant's own sign-out as a plain link. Settings: `ASKRIGOR_ATLAS_AUTH0_CLIENT_ID`,
`ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET`, `ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL`,
`ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL` and `ASKRIGOR_ATLAS_PUBLIC_ORIGIN`, with the connector's issuer and keys;
tested against a fake tenant. Creating the Auth0 application stays the owner's step (infra README).

**E. Votes and comments** (migration 0022, with D's sign-in):

- a vote: one per account and finding, `agree` or `disagree`, changeable or withdrawn; pages show totals only;
- a comment: up to 2,000 characters with the author's display name (up to 40, checked like comments), shown at once
  if it passes the automatic check for contact details (email addresses, phone numbers, messaging handles) and links
  (URLs and bare domains), which are exact, structural patterns that work in any language; a comment that fails is
  refused with the reason and not stored;
- a "report" link on each comment, for anyone, rate-limited; reported comments are listed for the owner;
- the author can delete their own votes and comments at any time; the owner can hide, show or remove any comment and
  stop an account from commenting (the terms' wording);
- rate limits per account and per address, and request-size limits, as the evidence-gap intake has;
- forms carry a CSRF token tied to the session.

Status (25 Oct): E and F's comment actions are built on `claude/171c-pages-20261025`, not released, behind the same
switch. Migration `0022_atlas_votes_comments` (after 0021, the publications, and before 0023, G's save switch, since
the merge into the build on 25 Oct) holds participants, votes, comments, reports and the home page's
picks, with seven participation functions for the research-access role and five moderation functions for the review
role (`packages/evidence-repository/src/atlas-participation.ts`). A finding page shows the vote totals and the comments,
with forms to vote or withdraw a vote, comment (the display name comes with the first comment), delete one's own
comment, report a comment (anyone; a reader who is not signed in with a token for the day), change one's display name
and delete everything one holds; each form posts to the same origin, passes the Origin check and carries a token bound
to the session and the form's purpose, within the design's limits. The contact-details-and-links check refuses a
comment or a display name with the design's reason. `review_research_contribution` (still 33 tools) takes
`list_comments`, `hide_comment`, `show_comment` (which also clears the comment's reports), `remove_comment`,
`stop_commenter`, `restore_commenter` and `set_picks`, which fills the home page's picks lane. Tests:
`tests/atlas-participation.test.ts`; the PostgreSQL acceptance covers 0022.

Status (25 Oct, after an independent security review: four medium and five low findings, all fixed on the same branch,
each confirmed exploit now a test in `tests/atlas-participation-hardening.test.ts`): nothing the pages' last check would
refuse can be written, and a stored row that would trip it is left out rather than stopping a page; the
contact-and-links check refuses text-direction controls and reads domains under IANA's whole root zone list in any case
(`atlas/iana-tlds.ts`); the owner's tool quotes comment names and texts as untrusted JSON; the apex Caddy block goes
straight to the research server with Host askrigor.com and `X-AskRigor-Client-IP`, believed only for that host, IPv6
counted by /64 (the installer takes and checks `ASKRIGOR_ATLAS_UPSTREAM`); "sign out everywhere" and deleting everything
end every earlier session (`atlas_session_ends`, 30 days, by a hash of the key), a callback is taken once, and the
cookies are `__Host-`; display names cannot be AskRigor's and each comment shows a short commenter mark; comments show
newest first within 50 and 64 KiB a page, and `/atlas/account/comments` lists each reader's own in every state.

**F. The review tool and the inbox.** Owner actions join `review_research_contribution` (the connector stays at 33
tools): list and unpublish publications, set cards aside, list recent and reported comments, hide, show and remove a
comment, and stop or restore a commenter. The list of waiting cards leaves out set-aside and dev-account cards unless
asked for them.

**G. Regression runs (default 5).** A dev-account setting through `manage_research_access` turns card saving off; the
regression harness switches it off before a run and back on after, and the run record shows both. With the safety net
in B, a forgotten switch still publishes nothing. Before anything is published, every test card gets the set-aside
label: the 211 cards saved during the regression runs of 15 to 23 Oct (ARF-0016 to ARF-0239, checked against each
run's start and end in its progress log), the planted-error test of 21 Oct (ARF-0111 to ARF-0115) and the synthetic
release test ARF-0001, 217 in all: ARF-0001, ARF-0016 to ARF-0038, ARF-0042 and ARF-0043, and ARF-0049 to ARF-0239. The owner's question named ARF-0116 to ARF-0239 because it counted only the last two
runs; the default's intent, that test cards are not published, covers them all. The owner's own earlier cards
(ARF-0005 to ARF-0013, ARF-0039 to ARF-0041, ARF-0044 to ARF-0048, ARF-0240) are not published automatically: they
were saved before version 4, from what is now a dev account. The owner picks which to publish ("publish chosen cards"
in 4B's actions), after reading them; some come from the sessions behind the owner's bug reports #39 to #42.

## 5. Order and checks

Migration numbers (25 Oct, the merge of owner answer 173's held YouTube findings into this build): that release
goes to production first with `0019_held_youtube_findings`, unchanged, so this build's migrations follow it:
notice version 4 is `0020_research_use_notice_v4` and the publications `0021_atlas_publications` (0019 and 0020
before the merge). Parts D and E (sign-in, votes and comments) take migration 0022, and G's save switch takes
0023; both are merged into the build (25 Oct), and every migrate applies 0019 to 0023 in that order.

1. A (wording and consent), with its tests and the site checks.
2. B (publications) and F's publication actions, with migration 0021's publication table.
3. C (pages, read-only), with the Caddy route and the site-deploy checks.
4. D and E (sign-in, votes, comments) and F's comment actions; the Auth0 application is the owner's step.
5. G, the privacy data map's new rows (publications, votes, comments, display names, sessions, reports), the release
   record, the Docker database acceptance with migrations 0019 to 0023, the full gate, and the release question.

The release question names the build. If the Auth0 application isn't ready when the rest is, the question offers to
release with votes and comments switched off until it is.
