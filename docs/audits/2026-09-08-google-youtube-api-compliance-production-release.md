# Google/YouTube API compliance — production release receipt

PR #199 merged the compliance remediation to `main` as
`ec8ea4ddd49ab3f7996c75f25b2195b840a6927a`. The exact merge is deployed as
backend image
`sha256:ad010f8475f104b9a8db158b2f2d8095976dbfa008901c05e38ca6678990317b`
and public-site release
`/opt/askrigor/site/releases/ec8ea4ddd49ab3f7996c75f25b2195b840a6927a/site`.

The review established Path 1: AskRigor makes official YouTube Data API v3
requests with a server-side application API key and does not implement an
end-user Google/YouTube OAuth flow. Auth0 protects AskRigor's own research API
and is a separate identity boundary. The available source, production
configuration, Google Cloud credential inventory, and real request evidence do
not support classifying AskRigor's API-visible public YouTube reads as
`Authorized Data`.

The complete AskRigor project-number set is `927421077304` (current and sole
active project) and `1000928389599` (historical). A secure in-place comparison
matched the live key to the current project and an archived AskRigor rollback
key to the historical project without printing either credential. The legacy
key had no traffic from September 1 through September 8, 2026 and was deleted
on September 8 with Google's 30-day recovery window. The active key is
restricted to the production IP and YouTube Data API v3. The historical
project's unrelated desktop OAuth client was not changed.

The implementation now enforces the public lifecycle contract. Exact
YouTube-derived evidence in the controlled-session process cache expires after
72 idle hours or seven absolute days, is swept within one hour, and is released
immediately after successful report finalization. The encrypted checkpoint is
pruned at service startup and hourly as well as during access and inventory.
Denied or premature finalization preserves the session. Persistent checkpoint
tests exclude raw comments/replies, commenter identities, provider bodies,
provider cursors, and credentials.

The deployed Privacy Notice names the public video, channel, comment, reply,
and caption categories; purposes; fresh-read behavior; continuation, cache, and
checkpoint lifetimes; eviction/restart behavior; finalization and early-
deletion paths; logging boundary; configured-backup state; external-provider
retention; and the absence of an AskRigor-created Google authorization grant.
Independent HTTPS reads returned 200 and exact merge bytes for:

| URL | SHA-256 |
| --- | --- |
| `https://askrigor.com/privacy` | `cba2c21268a5061c3ba2d573fc295f9e56a7b791e0a4e98d75ee106b1f6a3481` |
| `https://askrigor.com/terms` | `edb0fa903c302a6ca309691be6f67f56ff28ae56e59cffdd440c848996ab0029` |
| `https://askrigor.com/support` | `f83b7b463b43058cd85ce7626d140cfe5f6b975abfb53386243f47e8b4d321ba` |

Post-deployment, a quota-bounded real request set returned HTTP 200 for
`search.list`, `videos.list`, `commentThreads.list`, and `comments.list` using
the restricted server key. It exercised discovery, metadata, top-level
comments, replies, and pagination without a user OAuth flow. The receipt
projection printed only status/count facts and printed neither credentials nor
provider content. The new production container log contained one startup line;
a fixed scanner found zero YouTube URL, credential, provider-body, or
request/response-body markers.

Production retains its security and data boundaries. The research container is
healthy, runs as `node`, uses a read-only root filesystem, drops all
capabilities, enables `no-new-privileges`, and joins only the expected public
and internal database networks. PostgreSQL and Caddy remain healthy. The exact
standard MCP catalog has 27 unique tools. A read-only in-memory MCP probe in the
live image returned exact Universal `20.5.20` and HRP `20.5.24` manifests. The
external health and OAuth protected-resource metadata remain correct, with
Auth0 and exactly `research:use` and `cases:review`.

The installed eight-file AskRigor Codex plugin remains current because this
release changes no declared plugin file. The personal-marketplace source and
installed package are byte-identical at SHA-256
`02c41b473c23a5442d72c65e8346b6986451d26c2fe68e297cd3532067084ae1`;
all seven non-manifest files are byte-identical to the merge, and the complete
manifest-declared skills inventory is present.

The accepted-contribution promotion timer was stopped before backend
activation. Its image selector was atomically updated to the deployed merge,
the required manual one-shot completed with `no_pending_promotion`, and a
bounded journal scan found no credential, database URL, account key, raw
payload, or private-health marker. The timer is enabled and active with a future
trigger, and no runner container remains.

Rollback is concrete. The prior image is retained as
`askrigor-research:rollback-pre-ec8ea4d`; root-only rollback directory
`/opt/askrigor/rollbacks/pre-ec8ea4ddd49ab3f7996c75f25b2195b840a6927a`
contains the prior compose/runtime/selector state, previous site target, and
container inspection. The prior immutable site release remains present.

Local validation used Node 24.18.0. Focused lifecycle/source tests, public-site
unit/deployment gates, typecheck, and build pass. The complete serialized suite
passes with 1,840 tests and six documented skips. PR #199 passed the exact
default `npm run verify`, PostgreSQL acceptance/fixture pilot, synthetic
forum/Discourse acceptance, repository workflow policy, and all four CodeQL
analyses. No review thread remained unresolved.

The final lesson checkpoint was available with one open candidate, one needing
review, zero accepted but not incorporated, four incorporated or closed, and
zero deletion-eligible. The unreviewed candidate did not alter this bounded
compliance release.

Typed completion claim: `OUTCOME`. Repository behavior, production behavior,
the public notice, and the Google response draft are aligned. The only owner
handoff is to insert the English-language screencast URL and send the prepared
response. Sending to Google remains an external representational action and was
not performed by this release.
