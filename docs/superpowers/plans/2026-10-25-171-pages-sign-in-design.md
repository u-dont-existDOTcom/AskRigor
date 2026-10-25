# 171 parts C to E: the pages, sign-in, votes and comments (design, 25 October 2026)

Status: design for building parts C, D and E of `2026-10-25-171-atlas-publishing-votes-comments.md` (owner answers
168a and 171). Decisions there and in its sections 1 and 2 bind this design; nothing here changes them.

## C. The pages

- **Where:** routes under `/atlas` in the research server's HTTP handler (`apps/research-mcp/src/server.ts`), rendered
  from the publications and accepted findings, in a new module (for example `apps/research-mcp/src/atlas/pages.ts`).
  The apex site's Caddy block (`ops/public-site/Caddyfile.site`) gets a `handle /atlas*` that reverse-proxies to the
  research server. The repository has no copy of the production Caddyfile for `mcp.askrigor.com`, so the upstream is
  checked on the server at release (a read-only look); proxying to `https://mcp.askrigor.com` with its Host header
  works without knowing the container network.
- **Headers:** the site block's policy forbids forms (`form-action 'none'`). The `/atlas` handle sets its own: the
  same strict policy with `form-action 'self'`, no scripts at all, `style-src 'self'`, and `frame-ancestors 'none'`.
- **Routes:** `/atlas` (home), `/atlas/topics/<slug>`, `/atlas/findings/P-<n>`, `/atlas/changes`, `/atlas/atlas.css`.
  Unknown paths answer 404. Every page is plain HTML with escaped text; links to sources are built by code from
  identifiers (DOI, PMID, registry IDs), never taken from card text.
- **What a finding page shows:** its claim and certainty, whom it applies to, kind, subject and direction; the numbers
  with each group's count and size, and rates, NNT and NNH worked out by the existing binary-results helpers; the
  searches of a "nothing found"; the sources; why it isn't the usual view and what would change it; the date and
  version; "Not checked by supervisors yet" while unreviewed; for an accepted finding its F-number and the date it was
  checked; and the votes and comments (part E).
- **Home lanes:** recently published, recently checked, the owner's picks with their reasons (2a; an owner action sets
  them), and contested (an accepted "contradicts" link). No lane shows a held, rejected or withdrawn finding.
- **Caching:** pages for readers who aren't signed in are cached in memory for 60 seconds and dropped on any write.
- **Readers get no cookie.** Nothing about a reader is logged (the server keeps no request log by design).

## D. Sign-in

- **Owner step:** an Auth0 "Regular Web Application" in the same tenant as the apps' login, with the same connections,
  allowed callback `https://askrigor.com/atlas/auth/callback` and logout return `https://askrigor.com/atlas`. Its
  client ID and secret go into the server's runtime settings (`ASKRIGOR_ATLAS_AUTH0_CLIENT_ID`,
  `ASKRIGOR_ATLAS_AUTH0_CLIENT_SECRET`); the session never types a secret.
- **Flow:** `GET /atlas/auth/login?return=<an /atlas path>` makes a state, a nonce and a PKCE verifier, keeps them in a
  10-minute signed cookie on `/atlas/auth`, and redirects to the tenant's `/authorize` (code flow, `scope=openid`, so
  no email claim is ever requested). The callback checks the state, exchanges the code with the secret and the
  verifier, verifies the ID token (issuer, audience, nonce, expiry) against the tenant's keys, and derives from its
  subject the account key the connector derives (`accountKeyForSubject`), then the Atlas participant key:
  HMAC of the account key under a separate secret. The return path must be an `/atlas` path on the same origin.
- **Session:** an AES-GCM encrypted, HttpOnly, Secure, SameSite=Lax cookie on `/atlas` holding the participant key and
  an expiry (30 days), set only at sign-in; no server-side session store. Sign-out is a form post that clears it.
- **Off switch:** `ASKRIGOR_ATLAS_PARTICIPATION=enabled` turns sign-in, votes and comments on; without it the pages
  show neither forms nor sign-in links, so a release can go out before the Auth0 application exists.

## E. Votes and comments

- **Migration 0022** (the Atlas schema; 0021 before the held YouTube findings took 0019): participants (participant
  key, display name, whether stopped from commenting, times), votes (publication number, participant key, `agree` or
  `disagree`, time; one per pair), comments (id, public id, publication number, participant key, the display name at
  posting, body of at most 2,000 characters, time, state `shown` or `hidden`, report count) and reports (comment id, a
  reporter key or a daily-salted hash of the address, time; one per pair).
- **Forms,** all `POST` to the same origin, each with a CSRF token derived from the session and the form's purpose,
  and refused when `Origin` names another site: vote or clear a vote; post a comment (asking for a display name the
  first time); delete one's own comment; report a comment (anyone, rate-limited); change one's display name.
- **The automatic check** (the default's "contact details and links"): the contact-details and links check that part B
  adds (`apps/research-mcp/src/atlas/contact-check.ts`) on the comment and the display name. A comment that fails is
  refused with the reason ("Comments can't include contact details or links.") and is not stored.
- **Deleting:** an author's own comment or vote is deleted outright. The owner's "remove" deletes too; "hide" keeps the
  comment out of the pages and in the review tool. A deleted comment's reports go with it.
- **Limits:** per participant, 6 comments an hour (3 at once) and 60 votes an hour; per address, the server's token
  bucket; request bodies at most 16 KiB, as the evidence-gap intake.
- **Owner actions** in `review_research_contribution`: list recent and reported comments, hide, show and remove a
  comment, stop and restore a commenter, and set the home page's picks with their reasons.
- **Privacy data map:** rows for the participant key, the display name, votes, comments, reports and their address
  hashes, the login and session cookies, and how each is deleted.

Built (25 Oct) as migration `0022_atlas_votes_comments`, not 0021: a release branch's 0019 lands on the build branch
first, and the build branch's 0019 and 0020 then become 0020 and 0021. The plan's 4D and 4E status lines say what was
built.

## Tests

Rendering (escaping, labels, the numbers, no person or ARF number on any page, no script tag), the routes and headers,
the Caddy block (the site-deploy test), the login round trip against a fake tenant (state, nonce, PKCE, a forged or
expired token, an outside return path), the session cookie (tampering, expiry), CSRF and Origin checks, every form, the
contact-and-links check on comments and names in several languages, the limits, the off switch, the owner actions and
their access checks, and the PostgreSQL acceptance with migration 0022.
