# AskRigor Custom GPT Action setup

## Current controlled projection — Phase K2

The generated Custom GPT schema now contains exactly four authenticated,
non-consequential research operations—`start_research_session`,
`continue_research_session`, `get_research_session_status`, and
`finalize_research_report`—plus the authenticated consequential lesson write.
The low-level research routes documented later in this file are retained as
historical/internal technical behavior and are not installed in the Custom GPT.
The exact 21-tool MCP catalog is unchanged.

The controller runs automatic Gemini/Spark scouting, native discovery,
transcript and community depth, formal search, lawful open-full-text acquisition,
method checking, bidirectional iteration, treatment-program coverage, and report
validation. The GPT follows one returned directive at a time and performs only
an exact signed, resumable semantic package. It cannot unlock completion with a
claimed count, operation list, renamed field, or prose assertion. A final answer
comes only from the reader packet returned by authorized or bounded server
finalization.

The editor imports `docs/custom-gpt-instructions.md` with Knowledge empty and
imports `https://mcp.askrigor.com/actions/openapi.json` using the existing API
Key → Bearer authentication. Never paste a Gemini key or packet into the GPT.
Product acceptance uses the fixed synthetic challenge and a server-issued
signed receipt bound to the exact installation bundle, protocol identities,
session transitions, final boundary, permit, and report. Caller-authored
acceptance JSON is obsolete.

This runbook installs the read-only research bridge and preserves the existing
optional lesson-submission Action after the reviewed server build and privacy
notice are ready. The research bridge is a verified local candidate until the
deployment and live-acceptance record is complete. GPT Actions can
import OpenAPI JSON or YAML and can use an API key sent as a Bearer token. A
public GPT Action also requires a valid public privacy-policy URL, and users may
still be asked to approve a consequential call.

The OpenAI API project and its billing are operationally separate from a
ChatGPT subscription: **API billing is separate from ChatGPT billing**. The
privacy-check API key stays only in the protected VPS runtime environment. The
paid Gemini API project and billing are likewise separate from consumer Gemini
or Spark subscriptions, and its key stays only in that protected environment. The
dedicated Action Bearer key is installed only in the protected VPS environment
and the GPT editor's authentication control. Neither key belongs in GPT
instructions, the OpenAPI file, repository, image, issue queue, logs,
screenshots, or chat.

## 1. Prepare the private GitHub boundary

Create the private repository `u-dont-existDOTcom/AskRigor-lessons`; do not put
a link to it in any public surface. Create a dedicated GitHub App named
`AskRigor Lesson Submitter`, disable its webhook, restrict installation to only
that repository, and grant exactly:

- Metadata: Read-only
- Issues: Read and write
- Contents, pull requests, actions, administration, secrets, organization, and
  account permissions: No access

Generate one App private key and record the App ID and installation ID. Encode
the PEM locally for the single runtime value, then remove any unneeded local
copy. Do not paste a PEM or any credential into a command line, shell history,
chat, issue, test fixture, or tracked file. Before enabling the Action, verify
that an installation token reports selected-repository access to exactly the
private lesson repository and permissions of only `issues:write` and
`metadata:read`.

## 2. Prepare protected state and environment

Keep exactly one lesson-submission writer. Create a runtime-owned directory
with mode `0700`, mount it read/write only at `/var/lib/askrigor-actions`, and
keep the ledger file mode `0600`. Install values with a hidden-input editor,
secret manager, or an equivalent stdin-safe mechanism that does not expose
values in process arguments or output. Verify only names, ownership, mode, and
nonempty status; never print secret values.

The runtime requires these exact names and constraints:

| Environment variable | Required value or boundary |
| --- | --- |
| `ASKRIGOR_ACTIONS_ENABLED` | Exact literal `true` only when ready to accept Actions. |
| `ASKRIGOR_RESEARCH_ACTIONS_ENABLED` | Exact literal `true` only when ready to expose public read-only research Actions. |
| `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET` | Server-only secret containing at least 32 UTF-8 bytes; required at startup when research Actions are enabled and never returned or logged. |
| `ASKRIGOR_RESEARCH_SESSION_DIRECTORY` | Exact container path `/var/lib/askrigor-research-sessions` for the separately mounted encrypted checkpoint directory. |
| `ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_BASE64URL` | Exactly 32 random bytes encoded as canonical unpadded base64url; server-only and never printed. |
| `ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_ID` | Bounded non-secret identifier for the active checkpoint key. |
| `ASKRIGOR_FINALIZATION_SIGNING_SECRET` | Separate server-only secret of at least 32 UTF-8 bytes for domain-separated finalization and acceptance receipts. |
| `ASKRIGOR_FINALIZATION_KEY_ID` | Bounded non-secret identifier for the active finalization key. |
| `ASKRIGOR_UNPAYWALL_EMAIL` | Public service contact email sent to Unpaywall; defaults to `support@askrigor.com` when unset. It is not a secret or authentication credential. |
| `ASKRIGOR_ACTIONS_API_KEY` | Dedicated Action Bearer secret; installed only on the server and in the GPT editor authentication control. |
| `OPENAI_API_KEY` | Dedicated server-only OpenAI API project key for the privacy check. |
| `ASKRIGOR_GEMINI_API_KEY` | Dedicated restricted paid Gemini API project key for automated public-candidate scouting. The controlled path uses a temporary background Interaction and requests deletion after use. Without the key the server returns `gemini_provider_not_configured`; never paste it into chat or the GPT editor. |
| `ASKRIGOR_AI_BUDGET_LEDGER` | Exact absolute path `/var/lib/askrigor-actions/ai-budget.json`. |
| `ASKRIGOR_AI_MONTHLY_BUDGET_USD` | Canonical production literal `50.00`; the runtime accepts only exact `50` or `50.00`. |
| `ASKRIGOR_GITHUB_APP_ID` | Positive decimal App ID. |
| `ASKRIGOR_GITHUB_INSTALLATION_ID` | Positive decimal installation ID. |
| `ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64` | Base64-encoded dedicated server-only App private key. |
| `ASKRIGOR_LESSONS_REPOSITORY` | Exact private repository name `u-dont-existDOTcom/AskRigor-lessons`. |

The server enforces one shared hard monthly cap of **$50.00**, recorded as an aggregate
nano-USD ledger. Each Gemini scout reserves at most **$1.00** from that
same cap before provider execution. One scout can use one grounded-search
interaction and, only if its packet fails strict validation, one no-search
correction interaction under the same reservation. The server accepts only the fixed privacy model
`gpt-5.4-nano-2026-03-17`; no moving alias is allowed.
The lesson privacy check and the low-level Gemini route use provider storage-disabled modes. Controlled Gemini scouting uses temporary provider storage for background execution and requests deletion after each interaction. Budget exhaustion, ledger failure,
privacy-model failure, or invalid structured output fails closed; none bypasses
screening or reaches GitHub. The Gemini route also fails closed on missing
grounded-search receipts, mismatched executed queries, invalid candidate JSON
after the one bounded correction, or an oversized validated frontier.

## 3. Configure the Custom GPT from the generated packet

Treat installation as one transaction, not three independent edits. The
Instructions, live Action schema, and checked-in Gemini scout-instruction source must match the
single `installation_bundle` in `docs/custom-gpt-sync.json`. Updating only the
Instructions is a failed installation even when the editor saves successfully;
it leaves newly required tools invisible and must never be reported as current.

Use only this checked handoff:

```text
Instructions: docs/custom-gpt-instructions.md
Knowledge: empty
Action import: https://mcp.askrigor.com/actions/openapi.json
Authentication: API Key -> Bearer -> existing protected Action key
Privacy: https://askrigor.com/privacy
```

1. Confirm the privacy URL serves the reviewed current notice.
2. Replace the complete Instructions field with the complete generated file.
3. Remove every Knowledge file and keep Knowledge empty. Canonical protocols
   must arrive as verified runtime Action results, not stale uploaded copies.
4. Import the Action URL, select **API Key** then **Bearer**, and retain only
   the existing protected Action key in the editor authentication control.
5. Confirm exactly four research operations are present:
   `start_research_session`, `continue_research_session`,
   `get_research_session_status`, and `finalize_research_report`. They are
   authenticated and non-consequential. Confirm the separately consented
   `submit_lesson_candidate` operation remains authenticated and consequential.
   No low-level provider, transcript, comment, full-text, study-audit,
   treatment-lock, or Gemini operation belongs in the editor Action list. The
   MCP inventory must independently preserve the reviewed 21-tool contract.
6. Save the GPT without publishing and test in a new chat.
7. After live acceptance and publication, copy the direct `/g/...` GPT URL.
   Do not use a `/share/...` conversation URL for `gpt.askrigor.com`.

Before calling the installation current, record the exact three member digests
and bundle digest from `docs/custom-gpt-sync.json`. In the editor, confirm the
complete five-operation list after importing the live schema—not merely that an
Action with an old name still exists. A broad-treatment replay must visibly
start one controlled session, follow repeated server directives, perform only
receipt-bound semantic packages, and finalize only when directed. Gemini,
transcript, community, full-text, and method-audit calls are server-internal and
must not appear as manual GPT tool calls.

### Release completion and plugin synchronization

Do not stop at a source merge when deployment and installation are authorized.
Complete and verify each distinct surface in order:

1. deploy the exact reviewed `main` commit and retain a rollback image/config;
2. directly verify health, the five-operation Action document, protocol
   manifests/integrity, encrypted controller checkpoint, and security
   boundaries;
3. verify the installed AskRigor plugin exposes exactly the reviewed 21 MCP
   tools, returns the newly deployed protocol manifests, and completes one
   read-only probe;
4. compare an exact installed-package receipt covering `plugin.json`, every
   file under the manifest-declared `skills/` tree, and all packaged assets
   with the reviewed source package; the receipt must fail if any declared
   skill file is added, removed, or changed, and a matching tool catalog or
   working connector is not a package receipt;
5. if installed bytes cannot be read back, mark package currency unverified,
   preserve a non-secret prior package/registration receipt and rollback path,
   then reinstall the exact reviewed package;
6. install the exact generated Instructions and Action schema in the signed-in
   Custom GPT editor, keep Knowledge empty, preserve authentication and privacy
   settings, save, and start a fresh chat;
7. run fresh product-interface acceptance and record only observed results.

The release remains incomplete until the fixed synthetic acceptance challenge
completes through a fresh signed-in GPT chat and its server-issued receipt
passes the local product contract:

```text
npm run validate:custom-gpt-product -- /tmp/askrigor-custom-gpt-server-receipt.json
```

The JSON contains only the signed `product_acceptance_receipt` returned by the
fixed challenge. It has exact bundle/protocol digests, opaque transition and
finalization digests, and no research target, health detail, source text, or
answer prose. The validator rejects caller-authored counts, operation lists,
completion claims, or mutated receipts. Run it only where the protected
finalization verification key is available; never print that key.

Static repository tests, production health, and matching plugin bytes are
necessary but cannot substitute for this exact product replay. If the UI replay
has not passed, report the installation or acceptance state as pending—never as
implemented, installed, restored, or complete.

Plugin-package currency, backend currency, Custom GPT installation, and fresh
UI behavior are separate receipts. Never infer one from another.

Generate the reviewed source receipt with `npm run plugin:receipt`. Run the
same receipt generator against the installed package path and require the
package digest and every inventory member digest to match before recording the
package as current.

This boundary applies only to the public Custom GPT. It does not narrow the
plugin, MCP server, or canonical protocols.
Those surfaces retain their existing behavior; the public GPT is limited to
general evidence research, source-grounded synthesis, and clinician-question
preparation rather than personalized diagnosis or treatment direction.

If the builder reports that the GPT may provide tailored medical or health
advice, do not treat **Only me** as public completion and do not try to evade the
review. Preserve the exact warning, install the current generated Instructions,
and retry public review. If the explicit boundary is still rejected, use the
account's appeal route and keep public publication and `gpt.askrigor.com`
repointing blocked pending the decision.

The editor Instructions—not Universal, HRP, Knowledge, or the Action schema—are
the authority for this complete shell before the first eligible submission
unless conversation-local standing consent already applies:

> **Proposed anonymized lesson**
> When [general situation], AskRigor should [correct behavior] because [reason].
>
> **Submit this anonymized lesson to improve AskRigor?**
> Reply: **Yes**, **Yes always in this chat**, or **No**.

Replace the bracketed line with one generalized lesson sentence. A raw list of
Action fields is not the shell. Existing chats do not acquire new
standing-consent behavior after an instruction update. Start a new chat for
acceptance testing, and never carry standing consent between chats.

## 4. Historical low-level Action behavior and limits

This section documents the pre-K2 compatibility implementation and internal
retrieval primitives. It is retained for audit and rollback context. Do not use
it to configure the current Custom GPT; the current editor contract is the
four-operation controlled projection in sections 1–3 above.

`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` independently exposes the public,
read-only `/actions/research/*` routes. It does not disable lesson capture or
MCP when false. The research Actions and MCP use the same shared per-client token
bucket and 16-request concurrency pool, so the compatibility surface cannot
double the public allowance. Both are the same transient provider-retrieval
flow; full application request and response bodies are not logged or written to
durable storage. Direct MCP continuation remains client-carried and stateless.
For `audit_youtube_video_community`, the Custom GPT Action stores the
existing signed minimized continuation token in process memory and returns a
37-character handle. The map expires entries after one hour without renewal,
holds at most 2,048 entries and 16 MiB, contains no comment text, author
identity, provider credential, or protocol text, and is never written to disk
or application logs. A missing, expired, restarted, or evicted handle returns
`youtube_action_continuation_invalid_or_expired`; restart that audit from its
video identifier. A valid continuation that returns
`youtube_video_audit_continuation_migration_restart_required` requires a fresh
audit from the video identifier. A legacy deployment may return
`youtube_video_audit_identifier_membership_restart_required`; that historical
result also requires a fresh audit with counts kept separate. Current releases
return `youtube_video_audit_identifier_membership_boundary` when the bounded
membership structure cannot prove whether an identifier was already accepted.
That result preserves the last verified cumulative frontier as
`completed_with_access_boundary`, consumes the continuation handle, and is
terminal for the affected video; do not restart it, and continue independent
selected videos.

`get_youtube_transcript` uses a separate 37-character one-hour handle backed by
at most 2,048 entries/4 MiB of compact chain metadata: provider cursor, public
video and selected-track metadata, caption-snapshot hash, page/segment counters,
next expected segment index, and timestamp state. It stores no caption text,
title, channel name, request text, credential, or protocol text. A raw provider,
forged, expired, replayed, or mismatched handle returns
`youtube_transcript_action_continuation_invalid_or_expired`; restart that
video/language and never combine prior-chain counts.

`acquire_open_full_text` automatically tries an exact Europe PMC copy and then
Unpaywall for every supplied DOI. An Unpaywall result is only a discovery lead:
the server fetches the public PDF through bounded HTTPS transport, rejects
private/reserved or mixed DNS destinations, pins TLS to a vetted public address,
rejects oversized or non-PDF responses, extracts the
text, and verifies the requested DOI or a strong title match before indexing it.
The returned 37-character document handle keeps the exact public document index
and next block/character cursor in process memory for no more than one hour,
with at most 64 entries and 128 MiB total. Continue the handle to exhaustion
before calling `validate_study_method_audit` or
`validate_review_method_audit`. The audit must link every domain to returned
source blocks and limits synthesis to the methods and claims actually audited.
Unavailable, unreadable, or identity-unverified copies remain possibly useful
leads; their unseen contents are never evidence. Expired or evicted handles must
be reacquired and never combined with an earlier chain.

Every research Action response is limited to exactly **60,000 serialized UTF-8
bytes**. `load_protocol` returns at most **48,000 UTF-8 bytes** of exact protocol
text per ordered authenticated chunk. Continue until `complete: true`; missing,
repeated, expired, or inconsistent chunks block complete loading. Large
per-video YouTube results preserve the retrieval receipt, corpus counts, and
digest while returning a deterministic transport-bounded analysis sample.
Continue immediately with the returned short handle while
`continuation_recommended:true`; do not synthesize until
`receipt.synthesis_lock:pass`. Legacy bulk YouTube envelopes are never silently
trimmed.

`get_youtube_transcript` is a Custom GPT Action only; it is not an MCP tool.
It re-fetches the selected public caption track on each page and stores no
caption text between requests. Continue only its returned Action handle
until `access_status:api_visible_complete` or a terminal access/error boundary.
That completion covers only the selected API-visible caption track and does not
prove caption accuracy or access to deleted, private, hidden, unavailable, or
never-published caption material. Automatic-caption status and language are
returned explicitly. The provider uses an unofficial YouTube interface, so a
browser-visible transcript can still be `inaccessible`, `rate_limited`,
`not_found`, or `error` through the Action; preserve that gap and do not infer
creator content from metadata or comments.

`assess_treatment_landscape_coverage` is also a Custom GPT Action only. It
makes no provider call or stored state. It reconciles discovery batches and
specific-program query/term/result receipts with candidate/class/fingerprint
links, derives candidate counts and normalized
program signatures, uses stable channel IDs, and checks deterministic
projections of the actual transcript/comment receipt shapes. Invalid records do
not enter aggregates. Its strictly validated request may be up to **65,536
UTF-8 bytes**; a representative 15-video response is tested against the
60,000-byte response cap. A pass establishes supplied-ledger consistency only,
not semantic completeness, efficacy, safety, representativeness, or a
recommendation. Partial, retryable, rate-limited, or unrecovered work remains a
continue state; bounded output requires a terminal nonretryable boundary after
attempted recovery.

`validate_gemini_youtube_candidate_handoff` is a Custom GPT Action only. Pass
the complete raw JSON packet as the `packet` string. The Action validates the
v1 or v2 packet and independently checks every public YouTube identity. It
retrieves no comments or transcripts and stores nothing. Spark's program,
population/stage, outcome/horizon, and creator-summary fields remain clearly
provisional: use them to decide what to screen next, never as proof of what the
creator said or whether a treatment works. Preserve the returned complete
frontier receipt. Retryable identity failures remain unresolved; every
validated lead must be screened regardless of caller materiality or redundancy
labels before broad synthesis.

`scout_gemini_youtube_candidates` is the low-level technical route. Controlled
research invokes the same scout logic inside the server-owned session rather
than requiring the GPT or user to call this operation directly. Both paths accept
only a de-identified population-level target and diagnosis-status category,
reject personal or identifier-bearing text before any provider work, and
reconcile the actual Google Search
queries, reconstructs its compact fixed-column output into the strict canonical
packet before feeding it into the same independent YouTube validator. The
low-level route disables interaction storage. Controlled research uses a
resumable background interaction, retains only an opaque encrypted checkpoint,
and requests provider deletion after consumption. If strict validation fails,
either path permits exactly one no-search correction under its corresponding
storage mode and then fails closed. It retrieves no captions or discussions and cannot authorize
synthesis. The manual validator above exists for historical compatibility, not
as a step the user must perform.

## 5. Synthetic acceptance and queue status

Use only synthetic, non-personal text. A suitable test correction is:

> You made a material factual claim without showing any source. After
> rechecking, do you agree that this is a valid AskRigor failure?

Require the exact consent question, answer `Yes`, and accept any separate
ChatGPT platform confirmation. A success must return an `ARL-####` receipt and
say that human review is required. Privately verify that the candidate contains
only the generalized fields, privacy marker, labels, anonymous occurrence
metadata, and no raw prompt. Repeat the same synthetic lesson and require the
same candidate ID with an incremented anonymous occurrence count. The initial
issue body remains unchanged; later occurrences are count/timestamp-only
generated private comments with no repeated candidate text. Mark the test
candidate as synthetic and do not treat it as a product lesson.

Run `npm run lessons:status` with the maintainer's local GitHub authentication.
Record either the available queue counts or the explicit unavailable reason;
unavailable never means zero.

## 6. Rollback

Set `ASKRIGOR_RESEARCH_ACTIONS_ENABLED` to a value other than `true` and
recreate only the research service to remove public research Actions while
preserving `/healthz`, the exact 21-tool `/mcp` inventory, and the lesson
Action's prior enabled state. This does not disable lesson capture or MCP.

Separately, set `ASKRIGOR_ACTIONS_ENABLED` to a value other than `true` or
revoke the dedicated GitHub App installation to stop new lesson writes. **MCP remains available** because the lesson Action is isolated and is not an MCP
tool. Neither rollback deletes existing private candidates, the aggregate
budget ledger, protocol files, or provider state.

## 7. Key rotation

For Action-key rotation, create a new high-entropy value through the protected
secret workflow, update the VPS and the GPT editor without displaying it, test
the new key, then invalidate the old value. For OpenAI-key rotation, create a
replacement in the dedicated API project, install and test it on the VPS, then
revoke the old key. For GitHub App key rotation, generate and install a new App
private key, verify exact repository selection and permissions, then delete the
old App key. Never reuse one credential for another boundary, and never print a
credential while verifying rotation.
