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

The current canonical files identify HRP `20.5.23` (2026-08-24), SHA-256
`bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`,
and Universal Instructions `20.5.15` (2026-08-24), SHA-256
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
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
- Validate a complete high-recall Spark candidate response with
  `npm run validate:gemini-handoff -- path/to/spark-response.md`; this
  live command uses the existing `YOUTUBE_API_KEY` and is not part of the
  hermetic default gate

The default test commands do not contact external providers or consume provider
quota. They replay recorded fixtures and verify stable identifiers, explicit
access states, pagination/reply reconciliation, and data-derived protocol
manifests. MCP transport tests do bind a temporary localhost loopback server;
that local socket is not external provider access.

Phase D1 also contains internal, hermetically tested source primitives for rich
Crossref publication-update histories and FORRT FLoRA
replication/reproduction relationships. They are not public MCP tools or
Custom GPT Actions, are not yet connected to research-session completion, and
cannot establish study quality or a verified replication result. Provider,
license, privacy, and no-match boundaries are documented in
`docs/external-study-evidence-sources.md`.

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
analysis. Terminal corpora of 500 or fewer normally return every refetchable
record; larger terminal corpora receive a deterministic 500-record sample. If
YouTube stops exposing one or more already acquired sampled identifiers, the
refetch isolates them under the same request/time bounds and returns only the
still-verifiable deterministic subset as `completed_with_access_boundary`.
The limitations state that the sample may not represent the full acquired
corpus; zero refetchable records still block synthesis. The final report names
and links content-verified videos worth watching, and it cannot synthesize while
wider or deeper executable work is still likely to improve the answer. The
current source candidate adds a Custom GPT-only `get_youtube_transcript` read
with timestamped, cursor-bounded public caption segments,
language/automatic-caption provenance, explicit access failures, and compact
server-held chain metadata without caption text. Creator content and comment-corpus evidence
remain separate; titles, descriptions, and comments cannot substitute for a
transcript. The legacy `audit_youtube_community` remains available for
compatibility.

The read-only research path uses ChatGPT as the existing reasoning engine. It
adds no OpenAI API model call, local model, n8n workflow, database, durable
comment persistence, or additional paid inference. The sole cross-request
research state is the bounded one-hour Custom GPT YouTube handle maps described
below. The separate lesson Action uses the
fixed OpenAI API privacy check documented below; API billing is separate from
ChatGPT billing and is capped server-side at $50.00 per UTC month.
After deployment, refresh the developer-mode connection and start a new Project
chat so the new tool metadata and Project instructions are active.

## Custom GPT research Action bridge

The current source candidate replaces the Custom GPT's low-level research tool
graph with four authenticated controller operations:
`start_research_session`, `continue_research_session`,
`get_research_session_status`, and `finalize_research_report`. The GPT converts
a request to a de-identified population-level target, follows one server
directive at a time, and performs only an exact receipt-bound semantic work
package. Low-level Gemini/Spark discovery, YouTube transcript and community
retrieval, open-full-text acquisition, study/review checking, evidence
iteration, treatment-program coverage, and completion checks run inside the
server. Only server-authorized finalization can release a reader report.

Generate the exact four-operation schema, compact Instructions, runtime bundle,
and digest ledger with `npm run generate:custom-gpt`. Install
`docs/custom-gpt-instructions.md`, keep Knowledge empty, and import
`https://mcp.askrigor.com/actions/openapi.json` with API Key → Bearer
authentication. The separately consented lesson write remains the fifth Action.
The MCP surface is independent and remains exactly 21 read-only tools. Current
deployment and signed product-acceptance state is recorded in
`docs/custom-gpt-action-live-acceptance.md`.

### Historical pre-controller deployment chronology

The remainder of this section records prior low-level Action releases for audit
and rollback context. It is not the current editor installation contract.

Production now exposes the frozen 17 read-only research operations as public
Custom GPT Actions from merge
`dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`. The direct server acceptance has
passed. Custom GPT protocol and formal-source cases passed, but the first real
multi-call YouTube product test exposed unreliable relay of the previous
multi-kilobyte token. The bounded short-handle repair is merged, deployed,
directly accepted, and passed the fresh two-call Custom GPT UI retest on
2026-08-17. That UI run loaded the then-deployed Universal `20.5.12`; the
later Custom GPT UI freshness run loaded repository canonical protocol
`20.5.13` completely in three verified chunks. The following synthetic lesson
case failed safe before any write because the GPT displayed Action fields
instead of the canonical consent shell. The generated Instructions now contain
the full shell and explicit authority routing. The retest displayed that shell
and enforced exact consent, but the Action returned `action_auth_required`
before its existing editor entry was configured with the Bearer key. Saving the
corrected Action then triggered a public-content warning that the GPT may
provide tailored medical or health advice. The generated public Custom GPT
Instructions now retain general and subgroup evidence, treatment and harm
comparisons, mechanisms, guidelines, community reports, source provenance, and
clinician questions while explicitly prohibiting individualized diagnosis or
treatment directives. This public-only boundary does not change the plugin,
MCP server, canonical protocols, or production research tools. The owner then
reported successful public publication. The first authenticated lesson call
reached the server privacy gate but returned `privacy_rejected` for the fully
generalized synthetic source-audit lesson; the private queue remained
unchanged. PR #32 migrated the privacy check to pinned
`gpt-5.4-nano-2026-03-17`; exact merge `d1af238325ee1e0584574e47bbcbe7764d17cf7e`
is deployed and its non-stored safe-candidate probe passes. A fresh published-
GPT chat then submitted `ARL-0007`; the separately consented identical duplicate
returned the same ID with occurrence count 2. The aggregate private queue
confirmed one open candidate awaiting review. The published GPT is
`https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
At `2026-08-18T01:34:40Z`, both HTTP and HTTPS for `gpt.askrigor.com`
returned one temporary redirect to that exact direct URL; the final ChatGPT
response was `200` and identified **AskRigor.com Heterodox Research Protocol**.
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` enables only this research surface;
disabling it does not disable the existing lesson Action or MCP.

The deployed release exposes 25 public research reads plus the lesson write and
the exact 21-tool MCP. One Action-only automated Gemini scout accepts only a
de-identified population target and runs a storage-disabled
Google-grounded candidate search, reconstructs a compact fixed-column response
into the strict canonical packet, and independently validates public YouTube
identities. One storage-disabled no-search correction is allowed when the
initial packet is malformed; a second failure closes the route. Its complete
frontier is preserved, non-identity failures remain
unresolved, every validated candidate is screened, and provisional summaries
are not transcript verification or treatment evidence. The route is deployed
and its live correction-plus-identity-validation path has passed; downstream
research gates remain required.

The Actions use the same transient provider-retrieval implementation and one
shared per-client token bucket and concurrency pool with MCP. Application
request and response bodies are not logged or written to durable storage.
Direct MCP continuation remains stateless. For Custom GPT YouTube continuation,
the server returns a 37-character handle backed by process memory for no longer
than one hour. The comment-audit map stores the signed minimized token, no
comment text, and is bounded to 2,048 entries/16 MiB. The transcript map stores
only provider cursor, public video/selected-track and snapshot metadata,
page/segment counters, next expected index, and timestamp state—no caption
text—and is bounded to 2,048 entries/4 MiB. Restart, expiry, or eviction requires
that video's chain to restart. An exact repeated identifier is
reconciled anywhere in the chain and marks the result as a moving-pagination
access boundary. If that repeat is a reply, the receipt also keeps
`replies_reconciled` false because the provider's per-parent reply total can no
longer be independently proven. A pre-upgrade continuation whose exact corpus
already exceeded
500 records, or a possible non-adjacent membership match after the exact sample
becomes bounded, fails closed with a typed restart-required result. That result
preserves only the prior accepted cumulative counts; the unusable Action handle
is consumed. Action responses are
limited to **60,000 serialized UTF-8 bytes**. Exact canonical protocol text is
returned in ordered authenticated chunks of no more than **48,000 UTF-8
bytes**, and the client must continue through `complete: true`. A large
per-video YouTube result may reduce only the deterministic analysis sample; it
does not change corpus counts, digest, access state, or completion receipt.
Likewise, a terminal refetch that can no longer retrieve every sampled stable
identifier keeps the acquired corpus count and digest, returns only the
verified subset, and changes the access/completion state to an explicit bounded
boundary rather than claiming a complete snapshot.

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

The Phase K2 source candidate is not a public-release claim. It requires a
reviewed merge, exact-commit deployment, source-identical privacy publication,
five-operation editor import, empty Knowledge, plugin/MCP currency checks, and
a fresh signed-in acceptance challenge whose signed server receipt verifies.
The canonical current gate is recorded in `docs/public-review-checklist.md`.

### Historical public-review chronology

The deployed MCP connector serves the exact existing 17-tool read-only inventory
and the separate Action route. Production serves deployed HRP `20.5.18`
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

V0.1.0 is still **PUBLIC SUBMISSION BLOCKED**. A later fresh published-GPT
treatment-alternatives run skipped required formal retrieval and Forum Signal
work, then mislabeled the answer HRP-complete. A second treatment-decision run
used community evidence but stayed anchored to the clinician-proposed pathway.
PR #36's repair separated Forum Signal from option-space breadth, was deployed,
and was installed with empty Knowledge. Later runs still selected generic or
stage-mismatched videos, collapsed distinct programs, and missed plausible
hard-to-find hypotheses. PR #37 added candidate selection, program
decomposition, comparator scope, and steelman gates, but its product retest
showed that metadata and comment auditing still did not verify creator content.
The current generic repair uses vernacular evidence-frontier discovery,
specific-program fingerprints, optional independently validated Spark leads,
independent failure/harm comment audits, and a no-padding timestamped watchlist.
Topic-specific answers remain in held-out fixtures rather than production
instructions. Its merge, server/privacy deployment, editor installation, and
fresh product acceptance remain pending. The
associated lesson attempt returned non-retryable `privacy_rejected` and was not
resubmitted. After that
gate closes, remaining work includes the publisher-identity/domain path, Scan
Tools, demo recording, opaque model-receipt release decision, final portal
review, and public submission. The fresh post-deployment ChatGPT interface check no longer
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
