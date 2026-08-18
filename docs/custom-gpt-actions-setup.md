# AskRigor Custom GPT Action setup

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
| `ASKRIGOR_ACTIONS_API_KEY` | Dedicated Action Bearer secret; installed only on the server and in the GPT editor authentication control. |
| `OPENAI_API_KEY` | Dedicated server-only OpenAI API project key for the privacy check. |
| `ASKRIGOR_AI_BUDGET_LEDGER` | Exact absolute path `/var/lib/askrigor-actions/ai-budget.json`. |
| `ASKRIGOR_AI_MONTHLY_BUDGET_USD` | Canonical production literal `50.00`; the runtime accepts only exact `50` or `50.00`. |
| `ASKRIGOR_GITHUB_APP_ID` | Positive decimal App ID. |
| `ASKRIGOR_GITHUB_INSTALLATION_ID` | Positive decimal installation ID. |
| `ASKRIGOR_GITHUB_PRIVATE_KEY_BASE64` | Base64-encoded dedicated server-only App private key. |
| `ASKRIGOR_LESSONS_REPOSITORY` | Exact private repository name `u-dont-existDOTcom/AskRigor-lessons`. |

The server enforces a hard monthly cap of **$50.00**, recorded as an aggregate
nano-USD ledger. The server accepts only the fixed privacy model
`gpt-5.4-nano-2026-03-17`; no moving alias is allowed.
The request uses `store: false`. Budget exhaustion, ledger failure,
privacy-model failure, or invalid structured output fails closed; none bypasses
screening or reaches GitHub.

## 3. Configure the Custom GPT from the generated packet

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
5. Confirm the 18 research operations are non-consequential, including the
   Action-only `get_youtube_transcript`, and the single
   `submit_lesson_candidate` operation remains consequential. The MCP inventory
   must remain the frozen 17-tool contract.
6. Save the GPT without publishing and test in a new chat.
7. After live acceptance and publication, copy the direct `/g/...` GPT URL.
   Do not use a `/share/...` conversation URL for `gpt.askrigor.com`.

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

## 4. Research Action behavior and limits

`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` independently exposes the public,
read-only `/actions/research/*` routes. It does not disable lesson capture or
MCP when false. The research Actions and MCP use the same shared per-client token
bucket and 16-request concurrency pool, so the compatibility surface cannot
double the public allowance. Both are the same transient provider-retrieval
flow; full application request and response bodies are not logged or written to
durable storage. Direct MCP continuation remains client-carried and stateless.
For `audit_youtube_video_community` only, the Custom GPT Action stores the
existing signed minimized continuation token in process memory and returns a
37-character handle. The map expires entries after one hour without renewal,
holds at most 2,048 entries and 16 MiB, contains no comment text, author
identity, provider credential, or protocol text, and is never written to disk
or application logs. A missing, expired, restarted, or evicted handle returns
`youtube_action_continuation_invalid_or_expired`; restart that audit from its
video identifier. A valid continuation that returns
`youtube_video_audit_continuation_migration_restart_required` or
`youtube_video_audit_identifier_membership_restart_required` also requires a
fresh audit from the video identifier. Its reported cumulative counts stop at
the last accepted segment and must not be combined with the restarted chain.

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
It re-fetches the selected public caption track on each cursor page and stores
no transcript session or caption text between requests. Continue its cursor
until `access_status:api_visible_complete` or a terminal access/error boundary.
That completion covers only the selected API-visible caption track and does not
prove caption accuracy or access to deleted, private, hidden, unavailable, or
never-published caption material. Automatic-caption status and language are
returned explicitly. The provider uses an unofficial YouTube interface, so a
browser-visible transcript can still be `inaccessible`, `rate_limited`,
`not_found`, or `error` through the Action; preserve that gap and do not infer
creator content from metadata or comments.

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
preserving `/healthz`, the exact 17-tool `/mcp` inventory, and the lesson
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
