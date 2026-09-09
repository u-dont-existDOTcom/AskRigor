# Google/YouTube API Services compliance review

## Scope and verdict

This review responds to Google findings III.D.1c, III.A.2d, III.A.2h, and
III.E.4a–4g. It covers the complete AskRigor source tree, production runtime
configuration, Google Cloud Console state, provider calls, process stores,
encrypted research checkpoints, the private living-evidence database, logs,
backup configuration, and the public privacy/terms/support pages.

AskRigor uses the official YouTube Data API v3 only to read API-visible public
data with a server-side application API key. It does not implement an end-user
Google or YouTube OAuth flow, request YouTube OAuth scopes, obtain user access
or refresh tokens, or create a Google account connection. Auth0 authenticates
AskRigor accounts and is a separate identity boundary. The available evidence
therefore does not support Google's characterization that AskRigor accesses
YouTube `Authorized Data`.

Google correctly identified that a complete, explicit public lifecycle
disclosure was required. The production notice already disclosed the principal
public YouTube categories, API-key architecture, absence of end-user OAuth,
and non-persistence of raw comments and identities after the August 27
remediation. This closeout makes every storage, refresh, expiry, deletion,
logging, and account-revocation distinction explicit and makes implementation
behavior match the notice.

The complete project-number history is also broader than the current project.
AskRigor currently uses project `927421077304`. An archived production rollback
environment proved that AskRigor previously used an API key from project
`1000928389599`. That legacy key showed no traffic from September 1 through
September 8, 2026 and was deleted on September 8. Google Cloud permits recovery
for 30 days after deletion. The current key is restricted to the production IP
address and YouTube Data API v3. The complete set that should be disclosed to
Google is therefore `927421077304` (current) and `1000928389599` (historical,
retired).

## Evidence

| Claim | Repository, configuration, or runtime evidence |
| --- | --- |
| Official API calls use an application API key | `packages/sources/src/youtube.ts` defines `YoutubeConfig { apiKey: string }`; `search.list`, `videos.list`, `commentThreads.list`, and `comments.list` add only the `key` query parameter. `packages/sources/src/http.ts` performs the HTTPS requests without adding authentication headers. |
| No end-user Google/YouTube OAuth exists | Whole-tree searches found no Google OAuth client configuration, authorization-code exchange, YouTube OAuth scope, Google account linking, user access token, or user refresh token. Production configuration has `YOUTUBE_API_KEY` and Auth0 settings but no Google OAuth client/secret/scope/token setting. Google Cloud project `927421077304` has one API key and no OAuth clients or service accounts. |
| Auth0 is separate from YouTube access | Production `ASKRIGOR_OAUTH_*`/Auth0 issuer and JWKS settings protect AskRigor's connected research API. The YouTube adapter is called with the server-held `YOUTUBE_API_KEY`; it never receives the Auth0 token. |
| Current and historical Google Cloud projects are identified | Google Cloud Console shows current project `askrigor-youtube`, number `927421077304`. Secure in-place SHA-256 comparison, without reading or printing either credential, matched production `YOUTUBE_API_KEY` to that project's key. The same procedure matched the archived pre-migration AskRigor runtime key to project `optimal-relic-474606-e1`, number `1000928389599`. |
| The legacy credential no longer authorizes traffic | The old project's credential metrics showed no rows from September 1–8, 2026. Its historical AskRigor API key was deleted on September 8; the credentials page then showed no API keys. An unrelated desktop OAuth client in that project was left unchanged because it is not an AskRigor credential. |
| The current credential is bounded | Google Cloud Console shows application restriction `191.215.38.123` and API restriction `YouTube Data API v3`. After propagation, production returned HTTP 200 for search, metadata, top-level-comment, and reply requests. The smoke emitted only method status/count facts, no provider data or credential. |
| Public video data read | Search/metadata normalization can return video ID, title, description, channel ID/title, publication time, duration, tags, live-broadcast state, privacy/embeddability status, view/like/comment counts, and pagination state. |
| Public discussion data read | Comment normalization can return video ID, comment/reply ID, parent/top-level ID, public author channel ID/display name, comment/reply text, publication/update timestamps, like/reply counts, and pagination state. |
| Raw provider material is bounded in memory | Provider bodies are request-local and limited to 10 MiB. Direct MCP continuation is client-carried and expires after one hour. Action continuation handles and provider cursors are process-local, bounded, and expire after one hour. The controlled-session evidence cache can contain exact caption/comment material after author display names and channel IDs are removed; it is capped at 100 entries/64 MiB, expires after 72 idle hours and seven absolute days, is swept hourly, is released on successful report finalization, and is also discarded by eviction or restart. |
| Persistent checkpoints exclude raw YouTube data | The AES-256-GCM research-session checkpoint retains bounded public source identity, coverage state/counts/hashes, non-identifying findings, and opaque handles. Serialization tests reject/police raw comment text, commenter identity, raw provider bodies, raw provider cursors, and credentials. Checkpoints expire after 72 idle hours and seven absolute days and are physically removed at startup, access/inventory, and by an hourly sweep. The checkpoint directory has no configured backup. |
| The database does not persist YouTube/community data | The living-evidence schema restricts canonical source classes to formal sources and rejects YouTube/community identifiers and provider bodies. Production metadata inspection found no community source family and zero source versions marked as retaining raw content. No private rows or user content were opened for this review. |
| Application and reverse-proxy logs exclude YouTube content and credentials | The application emits no request/response-body or access log and its HTTP error projection retains only status and a bounded provider reason. Production container logs for the available 720-hour window contained only the startup line and one fixed PDF warning. A content-safe scanner found no YouTube URLs, provider bodies, comment material, IDs, or credentials. Caddy has no access-log directive. Docker's bounded local log rotation is not a research-content store. |
| Backup implications are explicit | No checkpoint backup job or systemd/cron backup was configured. The private database has no automatic off-host backup and cannot represent raw YouTube/community material. Connected clients, Google, and infrastructure providers control their own retention separately. |
| The public notice already carried material remediation | Git history shows the YouTube disclosure was added August 27, 2026. Before this closeout, `https://askrigor.com/privacy` already disclosed read-only public video/channel/comment/reply use, the server-side credential, no Google/YouTube sign-in or OAuth, no Authorized Data, excluded checkpoint fields, and bounded temporary process memory. |

## Defects and remediation

Two application-controlled lifecycle defects remained behind the otherwise
substantial disclosure:

1. The controlled-session evidence cache was capacity-bounded and process-local
   but did not enforce the declared time-based expiry or release its exact
   YouTube material after successful report finalization.
2. Expired encrypted checkpoint files were rejected and removed when accessed
   or inventoried, but a continuously running idle service did not guarantee
   physical removal within a stated interval.

The remediation adds 72-hour idle and seven-day absolute expiry to the exact
evidence cache, an unreferenced hourly sweep, immediate per-session release
after successful authorized or bounded report finalization, and startup/hourly
checkpoint pruning. Denied or premature finalization preserves the session so
the user can continue. Focused regression tests cover time expiry, absolute
caps, finalization release, denied-finalization preservation, physical
checkpoint deletion, persistent-checkpoint exclusions, API-key-only requests,
and the required public disclosure.

The public notice now identifies every YouTube data category and store, the
fresh-read behavior, the continuation/cache/checkpoint limits, restart and
eviction behavior, early-deletion route, logging boundary, absence of a
configured checkpoint backup, Google-controlled retention, and the precise
reason that there is no AskRigor-created Google authorization grant to revoke.
The data map carries the same contract.

## Validation and release record

- Runtime source base: `0f140272208d4698d531fc78ba0728194394d7f6`.
- Node/npm: Node 24.18.0, npm 11.16.0.
- Focused application tests: 53 tests across five lifecycle/source files pass.
- Public-site unit tests: 23 tests pass.
- Public-site validation: four pages pass.
- Public-site deployment tests: 28 tests pass.
- Real restricted-key production smoke at `2026-09-08T21:51Z`: HTTP 200 for
  `search.list`, `videos.list`, `commentThreads.list`, and `comments.list`;
  no Google/YouTube user OAuth, credential output, or provider-content output.
- PR #199 passed the exact default deterministic gate, PostgreSQL and synthetic
  forum acceptance, workflow policy, and all CodeQL analyses, then merged as
  `ec8ea4ddd49ab3f7996c75f25b2195b840a6927a`.
- That exact merge is deployed for the backend and site. Independent HTTPS
  fetches of Privacy, Terms, and Support returned 200 and exact merge bytes;
  the post-deployment YouTube smoke returned HTTP 200 for all four official
  request types. The immutable details are in
  `2026-09-08-google-youtube-api-compliance-production-release.md` and `.json`.

## Frozen and external boundaries

This change does not reinterpret an existing study, alter previously collected
data, create a durable YouTube corpus, add an OAuth flow, or add a provider
write. It does not delete the unrelated desktop OAuth client in the historical
Google Cloud project. Google, connected clients such as ChatGPT, and
infrastructure providers retain their own data under their own policies.

The English-language screencast remains an owner-supplied attachment. It should
show public-video discovery, metadata validation, public top-level comments,
replies, and the resulting AskRigor output. The exact response draft is
`../../deliverables/youtube-api-compliance-2026-09-08/google-response-draft.md`.
