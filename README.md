# AskRigor

AskRigor v0 is a protocol-aware research plugin with a read-only, deterministic
Model Context Protocol (MCP) server. The server exposes protocol manifests and
source adapters; it does not provide medical interpretation or treatment advice.
Production also contains a separate, consequential Custom GPT lesson Action for
optional, consented private feedback. That deployed Action is not an MCP tool
and cannot modify AskRigor code, protocols, instructions, or releases.

## Authority and source map

AskRigor uses this order when sources disagree:

1. current explicit owner correction;
2. the exact complete bytes of `protocols/HRP_Full.xml` and
   `protocols/Universal_Instructions.xml`;
3. byte-derived protocol manifests and integrity behavior in
   `packages/protocol/src/index.ts` and `tests/protocol.test.ts`;
4. the Project router and required module in `project/`;
5. source-access contracts and adapters in `packages/contracts/` and
   `packages/sources/`, then the public MCP implementation in
   `apps/research-mcp/`;
6. current release/reviewer evidence indexed by `docs/INDEX.md`; and
7. the recovery checkpoint at `project/CODEX-CURRENT-STATE.md`.

The current canonical files identify HRP `20.5.18` (2026-08-16), SHA-256
`4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`,
and Universal Instructions `20.5.12` (2026-08-16), SHA-256
`3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7`.
Those values are descriptive receipts derived from the exact XML bytes, not
substitutes for the files. A README, manifest, router, lesson, checkpoint,
release record, generated excerpt, or remembered summary never silently
replaces, truncates, or amends a complete protocol. Candidate evidence also
does not describe production until the documented release gates and rollout
acceptance pass.

## Requirements and verification

- Node.js 24.x and npm
- Install pinned dependencies with `npm ci`
- Run the deterministic fixture suite with `npm run test:run`
- Run the release verification sequence with `npm run verify`

The default test commands do not contact external providers or consume provider
quota. They replay recorded fixtures and verify stable identifiers, explicit
access states, pagination/reply reconciliation, and data-derived protocol
manifests. MCP transport tests do bind a temporary localhost loopback server;
that local socket is not external provider access.

## Opt-in live provider smoke tests

Live smoke tests are separate from the default suite:

```sh
npm run test:live
```

That command explicitly enables the guarded live suite. It makes only bounded,
small calls and checks stable semantics rather than changing exact result or
comment counts.

- Europe PMC and ClinicalTrials.gov use their public endpoints.
- PubMed runs only when `NCBI_EMAIL` is present. `NCBI_TOOL` and
  `NCBI_API_KEY` are optional.
- Crossref runs only when `CROSSREF_MAILTO` is present.
- YouTube runs only when both `YOUTUBE_API_KEY` and
  `ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID` are present; otherwise it reports a clear
  skip. Choose a deliberately bounded public video whose comments are enabled.
  The adapter—not merely the Vitest timeout—is capped at 30 provider attempts,
  2 top-level-comment pages, 20 independent reply pages, 200 top-level threads,
  500 total comments/replies, 1 MiB of normalized text, 2 MiB of normalized
  output, and 20 seconds elapsed. The surrounding test timeout is 30 seconds.
  When it runs, the test requires API-visible page exhaustion and
  top-level/reply reconciliation without asserting an exact changing count. If
  the selected video exceeds a ceiling, becomes unavailable, or disables
  comments, the smoke test fails truthfully; select a smaller fitting public
  comments-enabled video rather than treating the partial result as complete.

For example, after setting values in your shell or secret manager:

```sh
NCBI_EMAIL="$NCBI_EMAIL" \
CROSSREF_MAILTO="$CROSSREF_MAILTO" \
YOUTUBE_API_KEY="$YOUTUBE_API_KEY" \
ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID="$ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID" \
npm run test:live
```

Do not commit provider credentials. See `.env.example` for the provider
configuration variables; `ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID` is test-only and may
be set directly in the shell running the smoke test. Production adaptive
YouTube audits also require `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET`, supplied at
runtime with at least 32 UTF-8 bytes. It authenticates one-hour continuation
state—including bounded comment/reply identifiers and reply-reconciliation
counts. Direct MCP clients carry the signed state. The Custom GPT Action keeps
the same signed state in bounded process memory and returns only a short handle;
the secret itself is never returned by a tool or Action.

## Run the local MCP server

```sh
ASKRIGOR_PUBLIC_SERVER_ENABLED=true npm run dev:mcp
```

`/healthz` is always available for a basic process check. The public `/mcp`
route is fail-closed: unless `ASKRIGOR_PUBLIC_SERVER_ENABLED` is exactly
`true`, it returns `503 public_server_disabled` before reading a request body,
running the limiter, or creating an MCP tool server.

The MCP route has an in-memory token bucket allowing a burst of 60 HTTP
requests per client IP and refilling at 60 requests per minute. It stores at
most 10,000 client keys, lazily evicts keys idle for five minutes, and creates
no cleanup timer. This is per-process abuse protection, not authentication or a
distributed quota. `/healthz` is not throttled.

At most 16 MCP HTTP requests run concurrently in one server process. Additional
MCP requests receive `503 concurrency_limit_exceeded` before body parsing or
tool creation, and the permit is released after completion, error, or abort.
`/healthz` remains outside this concurrency cap.

Forwarding headers are ignored by default; the normalized socket peer address
is the rate-limit key. Set
`ASKRIGOR_TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip` only when a trusted
Cloudflare proxy overwrites that header before traffic reaches this process.
The server accepts exactly one syntactically valid IPv4 or IPv6 value. Blank,
malformed, duplicate, array-shaped, or comma-separated values fall back to the
socket peer. `Forwarded` and `X-Forwarded-For` are never trusted.

Public tool ceilings are deterministic:

| Retrieval operation | Ceiling per tool call |
| --- | ---: |
| PubMed, Europe PMC, ClinicalTrials.gov search page | 100 records |
| YouTube video search page | 50 videos |
| YouTube provider comment/reply page | 100 records |
| YouTube top-level comment pages | 500 pages |
| YouTube independently fetched reply pages | 750 pages |
| YouTube total provider request attempts | 1,000 attempts |

The YouTube page ceilings are separate so reply pagination remains independent
from top-level comment pagination. Hitting a retrieval budget preserves an
explicit partial/error access state and limitation; it is never reported as
complete merely because a ceiling was reached. Adapter responses likewise
preserve states such as `complete`, `metadata_only`, `inaccessible`,
`rate_limited`, and `error` instead of silently upgrading partial evidence.

## Build and run the production container

The production image is a pinned Node.js 24.18.0 multi-stage build. Its runtime
stage contains production dependencies, compiled workspaces, and canonical
protocol files, and runs as the unprivileged `node` user.

```sh
docker build -t askrigor-research:0.1.0 .
docker run --rm -p 3000:3000 \
  -e ASKRIGOR_PUBLIC_SERVER_ENABLED=true \
  askrigor-research:0.1.0
```

Do not bake provider credentials into the image. Supply them at runtime through
your deployment platform's secret manager. Keep the public-server switch off
until network access controls, transport security, monitoring, and provider
credentials are ready.

Protocol version and SHA-256 values are derived from the canonical XML bytes at
runtime. Replacing a valid protocol file therefore updates its manifest without
source-code changes, but a protocol change remains a substantive owner-reviewed
change and must pass the protocol integrity and semantic regressions.

## ChatGPT Developer Mode connection

The production MCP endpoint is `https://mcp.askrigor.com/mcp`. In ChatGPT,
enable developer mode for unverified connectors, create a connector using that
endpoint, and retain the generated technical connection ID.

Local or workspace testing may map that exact `asdk_app_...` connection ID in a
root `.app.json`. The mapping file is deliberately git-ignored because
connection IDs are environment-specific. The public directory package does not
reference that local mapping: submit the production server directly through
the portal's **With MCP** flow. Never add connection IDs, provider API keys, or
deployment credentials to the distributable manifest.

## ChatGPT Project router

AskRigor's recommended reasoning environment is a ChatGPT Project with the
copy-ready files in `project/`. Put the complete contents of
`project/PROJECT_INSTRUCTIONS.md` into the Project instructions and upload
`project/FORUM_SIGNAL_MODULE.md` as a Project file. The compact router selects
Forum Signal before the full HRP is used for synthesis.

When Forum Signal is required, ChatGPT first calls
`survey_youtube_community`, which returns bounded, deduplicated candidates with
clickable canonical links and provider-reported comment counts. It selects up
to three materially different videos, then calls
`audit_youtube_video_community` for each and automatically resubmits the opaque
continuation token while `continuation_recommended` is true. Each call is
bounded to about 15 seconds, but there is no arbitrary one-minute total limit:
the controller keeps spending additional minutes while expected information
gain is positive.

Each per-video result distinguishes the provider-reported comment count, the
API-visible comments/replies actually retrieved, and the records returned for
analysis. Complete corpora of 500 or fewer are all returned; larger complete
corpora receive a deterministic 500-record sample. The final report names and
links the videos worth watching, and it cannot synthesize while wider or deeper
executable work is still likely to improve the answer. The legacy
`audit_youtube_community` remains available for compatibility.

The read-only research path uses ChatGPT as the existing reasoning engine. It
adds no OpenAI API model call, local model, n8n workflow, database, durable
comment persistence, or additional paid inference. The sole cross-request
research state is the bounded one-hour Custom GPT YouTube handle map described
below. The separate lesson Action uses the
fixed OpenAI API privacy check documented below; API billing is separate from
ChatGPT billing and is capped server-side at $50.00 per UTC month.
After deployment, refresh the developer-mode connection and start a new Project
chat so the new tool metadata and Project instructions are active.

## Custom GPT research Action bridge

Production now exposes the frozen 17 read-only research operations as public
Custom GPT Actions from merge
`dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`. The direct server acceptance has
passed. Custom GPT protocol and formal-source cases passed, but the first real
multi-call YouTube product test exposed unreliable relay of the previous
multi-kilobyte token. The short-handle repair remains candidate behavior until
its merge, deployment, and fresh product retest are recorded. The actual direct
`/g/...` URL is still pending and must not be inferred from server proof.
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` enables only this research surface;
disabling it does not disable the existing lesson Action or MCP.

The Actions use the same transient provider-retrieval implementation and one
shared per-client token bucket and concurrency pool with MCP. Application
request and response bodies are not logged or written to durable storage.
Direct MCP continuation remains stateless. For only Custom GPT YouTube
continuation, the server maps a 37-character handle to the existing signed,
minimized token in process memory for no longer than one hour. The map stores no
comment text, author identity, provider credential, or protocol text; it is
bounded to 2,048 entries and 16 MiB, and restart, expiry, or eviction requires
the audit to restart from the video identifier. A pre-upgrade continuation
whose exact corpus already exceeded 500 records, an exact duplicate outside an
approved adjacent-page overlap, or a possible non-adjacent identifier match
after the exact sample becomes bounded fails closed with a typed
restart-required result. That result preserves only the prior accepted
cumulative counts; the unusable Action handle is consumed. Action responses are
limited to **60,000 serialized UTF-8 bytes**. Exact canonical protocol text is
returned in ordered authenticated chunks of no more than **48,000 UTF-8
bytes**, and the client must continue through `complete: true`. A large
per-video YouTube result may reduce only the deterministic analysis sample; it
does not change corpus counts, digest, access state, or completion receipt.

Run `npm run generate:custom-gpt` to reproduce the Action schema, compact
instructions, and hash ledger. The sole instruction artifact is
`docs/custom-gpt-instructions.md`; Custom GPT Knowledge must remain empty so a
stale upload cannot replace runtime-verified protocol bytes. Exact editor,
rollback, and acceptance steps are in `docs/custom-gpt-actions-setup.md` and
`docs/custom-gpt-action-live-acceptance.md`.

## Custom GPT lesson Action

The lesson Action accepts only a separately consented, generalized candidate,
runs deterministic and fixed-model privacy checks, and writes only to a private
human-review queue. It never receives raw chat, does not modify AskRigor, and
does not change the 17-tool read-only MCP inventory. Setup, secret handling,
synthetic acceptance, queue status, rollback, and key rotation are documented
in `docs/custom-gpt-actions-setup.md`.

The lesson Action is deployed and live-accepted from exact code revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`. Its August 13 privacy notice,
private queue, least-privilege GitHub App, protected runtime credentials,
synthetic submission and append-only duplicate, failure isolation, queue status,
and rollback path passed the bounded acceptance recorded in
`docs/release-evidence-v0.1.0.md`. Updating the server or instructions does not
retrofit existing chats with standing consent; start a new Custom GPT chat after
installation. Disabling the Action or revoking its repository-scoped App stops
new lessons while MCP remains available and unchanged.

## Public-review status

The deployed MCP connector serves the exact existing 17-tool read-only inventory
and the separate Action route. Production serves canonical HRP `20.5.18`
(2026-08-16), SHA-256
`4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`,
with the independent community-evidence weighting invariant and adaptive
YouTube regressions. The original website/privacy/terms/support gate passed on
2026-08-12 for site release `f928b95e29cd`, and the August 13 lesson disclosure
was later deployed and reverified before Action activation:
`https://askrigor.com/`,
`https://askrigor.com/privacy`, `https://askrigor.com/terms`, and
`https://askrigor.com/support` all passed direct HTTPS acceptance. The manifest
carries the schema-supported website, privacy-policy, and terms URLs. The
portal-only support URL and the exact remaining external-gate states are
maintained separately in `docs/public-submission-packet-v0.1.0.json` because the
current package-manifest schema has no support-URL field. The distributable
manifest also includes the required square logo and composer icon and no longer
publishes a local `.app.json` reference.

V0.1.0 is still **PUBLIC SUBMISSION BLOCKED** until the remaining portal
identity, domain-verification, Scan Tools, demo-recording, opaque model-receipt
release decision, final portal review, and public submission actions are
completed. The fresh post-deployment ChatGPT interface check no longer
reproduced the earlier routine-status regression; its bounded evidence and
presentation limitation are recorded in the release packet. See
`docs/privacy-data-map.md`, `docs/public-review-checklist.md`,
`docs/public-submission-packet-v0.1.0.json`,
`docs/public-submission-demo-recording.md`, and
`docs/release-evidence-v0.1.0.md` for the reviewer packet and release gates.

## License

AskRigor's original software is licensed under
`AGPL-3.0-or-later`. Complete canonical protocols, health-research policy,
research/release evidence, site editorial material, recorded fixtures, and
archived or third-party tools are Reserved Materials outside that grant. See
[`LICENSE.md`](LICENSE.md) for the exact path boundary and
[`LICENSES/AGPL-3.0-or-later.txt`](LICENSES/AGPL-3.0-or-later.txt) for the
complete license text.
