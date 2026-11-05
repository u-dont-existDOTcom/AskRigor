# The owner's private page on the Atlas

Status: built on `claude/atlas-owner-page-20261105` (stacked on `claude/atlas-review-fixes-20261105`), not yet released.

## Why

The owner, 5 November 2026: "i don't see my private pages, they don't show on my askrigor home page for some reason?"
On 2 November, of the comment maps: "i thought you were building this for me privately and then when yt ap[proves we can
publish"; on 31 October: "meanwhile you can save everything privately". Until now every "your private page" meant the
private GitHub repository owner-pages, where GitHub shows `comment-maps-atlas.html` as code: the owner has never seen the
maps as a page.

## What is built

- **The route.** `/atlas/account/private` (`PRIVATE_PAGES_PATH`), one of the account pages: there only while sign-in is
  on (`ASKRIGOR_ATLAS_PARTICIPATION=enabled`), GET and HEAD only.
  - Signed out: the account pages' plain sign-in prompt ("Sign in with your AskRigor account to see this page."), which
    names nothing that is there.
  - Signed in as anyone but the owner: the Atlas's own 404, the very page and headers an address with no page gives.
  - The owner: the page. Every response is `Cache-Control: private, no-store`, `Vary: Cookie`, `X-Robots-Tag: noindex,
    nofollow` and `Referrer-Policy: no-referrer`, with the robots and referrer meta tags; nothing is cached or stored.
- **Who the owner is.** A session is the owner's when its participant key is one of the owner's participant keys:
  `participantKeyFor(settings, subject)` of the connector's owner subject (`ASKRIGOR_OAUTH_ALLOWED_SUBJECT`, the subject
  `oauth-resource-server.ts` binds case review to) and, when set, `ASKRIGOR_ATLAS_OWNER_SUBJECT`, another login of the
  owner's. A value that is not a subject names no one. No subject is written in code.
- **Whether the Atlas sign-in gives the same subject.** From the code: the Atlas's sign-in (`sign-in.ts`) verifies its ID
  token against the tenant the connector uses (`ASKRIGOR_OAUTH_ISSUER_URL`, the same setting) and takes `sub` as it is,
  as the connector takes its access token's `sub`; the participant key is derived from it through the same account key
  (`researchAccountKeyForSubject`), and the design already rests on one person being one participant in the apps and
  the Atlas (reports sent through a person's own AI show on their Atlas account page). The runbook makes the Atlas's
  Auth0 application one of the same tenant "with the same connections", and Auth0 gives a user one `sub` across a
  tenant's applications, which the connector already relies on: one owner subject serves both `/mcp` and `/mcp/claude`,
  two applications. So the same login gives the same subject; this is established from the code and the configuration,
  not observed in a live sign-in. What neither can show is which login the owner uses on the Atlas: the 10 October
  release audit records a session signed in as another account than the owner subject, so the owner has more than one.
  Hence the second setting: if the owner signs in to the Atlas with another login, its Auth0 user ID goes in
  `ASKRIGOR_ATLAS_OWNER_SUBJECT`, and both logins count.
- **The maps.** `ASKRIGOR_PRIVATE_COMMENT_MAPS_FILE`, an absolute path on the server, outside the image: the owner-pages
  repository's `askrigor/comment-maps.json`, which the operator copies there (runbook). It is read afresh for each request
  of the owner's page, never for anyone else, and never cached. Unset or missing: "No comment maps are installed on the
  server yet." A relative path, a folder, a file over 16 MiB, or one that isn't `askrigor.comment-maps.v1` as
  `commentMapsFileSchema` reads it: "The comment maps file on the server can't be read, so no map is shown." Neither
  stops the page. The maps are rendered by `comment-map-pages.ts`'s `commentMapsBlock`, shared with the standalone page
  (whose bytes are unchanged), with headings one level down and each map linking its video.
- **The last check.** `atlasPageProblems` still guards every route, the owner's sessions on public routes included. On
  this route alone, `ownerPageProblems` sets aside each map's video link exactly as the renderer writes it
  (`<a href="https://www.youtube.com/watch?v=` and an 11-character ID); any other YouTube text, a script or a card's
  reference still fails, and then the page is shown without the maps.
- **Links.** The page links the owner's three pages on GitHub: `OWNER-QUESTIONS.md`, `atlas-forum-and-site-2026-11-05.md`
  and `comment-maps-2026-10-31.md` (the maps with their notes and claim checks). The signed-in owner's header shows "Your
  private pages" on every page, and the account page a line linking it; signed-in pages are never in the shared cache,
  so no one else is ever shown the link.

## Tests

`tests/atlas-owner-pages.test.ts`: the route only with sign-in; signed out, the generic prompt; another account, the same
404 as an address with no page, and no link anywhere; the owner, the page with its maps, video links and GitHub links,
its headers, HEAD; the owner's header and account page link it, a signed-out page doesn't; a second owner login; the
file read per request, and every missing or unreadable form; a map whose text holds other YouTube text or a card's
reference shows no map; the narrow exception; public routes still refused when their data holds a YouTube address, for
the owner too, while the owner's page is served; the owner from the environment. Every video ID and count there is
invented and checked by code against the owner's private maps file to match none of its maps.
`tests/atlas-comment-map-pages.test.ts` keeps the standalone page as it was.

## Release

The runbook's step (`infra/living-evidence-production/README.md`, "The owner's private page"): the operator creates
`/opt/askrigor/state/private-comment-maps` (UID and GID 1000, mode 0700), copies `comment-maps.json` there (mode 0600),
mounts the folder read-only at `/var/lib/askrigor-private-comment-maps` in `research-mcp`, and sets
`ASKRIGOR_PRIVATE_COMMENT_MAPS_FILE`. The owner signs in to the Atlas with the reviewer login (the email-and-password
login), or names their other login in `ASKRIGOR_ATLAS_OWNER_SUBJECT`.
