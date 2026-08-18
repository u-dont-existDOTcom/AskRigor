# AskRigor v0 public-review checklist

This packet is prepared for a future public-directory submission. It is not
permission to submit or publish. The machine-readable portal handoff is
`docs/public-submission-packet-v0.1.0.json`; its unverified external gates remain
explicit. The website/privacy/terms/support gate passed on 2026-08-12 for
immutable site release `f928b95e29cd`.
The live August 12 policy at release `f928b95e29cd` is the historical pre-lesson notice.
The August 13 lesson notice is deployed and live-accepted.
**PUBLIC SUBMISSION BLOCKED** still applies to
portal identity and domain-verification work, Scan Tools review, the demo
recording, the explicit opaque model-receipt release decision, final portal
review, and submission actions recorded in
`docs/public-submission-packet-v0.1.0.json` and
`docs/release-evidence-v0.1.0.md`. The owner reported that identity remains
`Verifying identity` on 2026-08-16; that is an in-progress report, not a
completion receipt. The fresh post-deployment ChatGPT interface check did not
reproduce the earlier routine-status regression.

## Optional lesson Action deployment truth

The consequential Custom GPT lesson Action remains deployed and was reverified
after the research service moved to application image tag
`d1af238325ee1e0584574e47bbcbe7764d17cf7e`, image ID
`sha256:8575134332df001ddbbb5b40a041a468cff76b3388b4f6deb267b1c3363998dd`.
The Action implementation itself remains the accepted behavior from revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; the newer application image retains
the repaired YouTube continuation and current Universal bytes while adding no
Action or MCP tool. The
August 13, 2026 privacy/terms
notice, private queue provisioning, exact GitHub App permission audit, protected
server credentials, synthetic submission and append-only duplicate, live
`npm run lessons:status`, failure isolation, and rollback evidence passed the
bounded production acceptance in `docs/release-evidence-v0.1.0.md`.

The lesson Action is separate from the read-only MCP inventory. It does not add
an MCP tool or change MCP schemas, provider behavior, or research semantics.
Disabling Actions or revoking the dedicated App must stop new private feedback
while MCP remains healthy. Updating instructions does not retrofit existing chats
with standing consent; acceptance starts in a new Custom GPT chat. The
setup runbook is `docs/custom-gpt-actions-setup.md`, and the public notice remains
`https://askrigor.com/privacy`.

The current Universal UI load, hardened consent shell, Action authentication,
and public-content review passed; the owner reported successful publication.
The public-only boundary preserves general and subgroup evidence while
prohibiting individualized diagnosis or treatment direction; it does not
narrow the plugin, MCP server, canonical protocols, or production tools. The
first authenticated published-GPT lesson call failed closed at the old privacy
model before GitHub. Its pinned-model repair is now deployed and passes the
exact-code non-stored privacy probe. Fresh-chat lesson acceptance submitted
`ARL-0007`; a separately consented identical duplicate returned the same ID
with occurrence count 2. The aggregate private queue independently confirmed
one open candidate awaiting review. The direct published GPT URL is
`https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
The reversible `gpt.askrigor.com` HTTP/HTTPS forward was independently verified
at `2026-08-18T01:34:40Z`: one temporary redirect reached that exact URL and
the final response was HTTP `200`.

## Source-generated MCP tools/list inventory

The complete reviewer inventory is generated directly from
`createAskRigorServer()` through an in-memory MCP `tools/list` call. It
contains all 17 exact tool names, **title absence** (no advertised `title`
property for any tool), descriptions, full advertised JSON-Schema Draft 7 input schemas, full
advertised JSON-Schema Draft 7 output schemas, and annotations. The committed
generated artifact is `docs/tool-inventory-v0.1.0.json`; regenerate it with:

```sh
npx tsx scripts/generate-tool-inventory.mts
```

The emitted inventory identifies itself as
`MCP tools/list against createAskRigorServer()`, gives the intended production
endpoint `https://mcp.askrigor.com/mcp`, and has the canonical compact-JSON
SHA-256 `dbff1edc405982fb58eac6a5b28840ffcf07fd93cad0e55c349f65b2fffcf5e9`.
`tests/release-packet.test.ts` regenerates the full inventory, asserts all 17
names/order, title absence, schema roots, annotations, exact checksum, and deep
equality with the committed full JSON artifact. A metadata or schema change
therefore requires an intentional inventory review, fresh Inspector/ChatGPT
checks, deploy, and Scan Tools rescan.

The generator returns the SDK's raw tool objects rather than a selected-field
projection. Therefore every advertised `tools/list` field is retained in the
JSON artifact, including each tool's `execution` object. The currently
advertised `execution.taskSupport` is `forbidden` for every tool. Internal SDK
properties with `undefined` values (including the absent `title` and `_meta`)
do not serialize and are explicitly checked as absent by the packet test.

All 17 generated entries advertise exactly:

```json
{"readOnlyHint":true,"destructiveHint":false,"openWorldHint":false}
```

Justification: protocol operations load/validate canonical files; all other
operations only retrieve or normalize provider data. No tool creates, modifies,
deletes, sends, approves, persists, or otherwise changes state. Valid, empty,
malformed, and unavailable calls are all read-only. The final list contains
exactly these names in source/deployed order:

```
get_protocol_manifest
load_protocol
verify_protocol_integrity
search_pubmed
fetch_pubmed_record
search_europe_pmc
search_clinical_trials
fetch_clinical_trial
resolve_doi
check_retraction_status
search_youtube
get_youtube_video
get_youtube_comments
search_youtube_comments
audit_youtube_community
survey_youtube_community
audit_youtube_video_community
```

The adaptive pre-synthesis path starts with `survey_youtube_community`, which
accepts a research question plus up to six labeled searches and returns bounded,
deduplicated candidates with canonical clickable URLs and provider-reported
comment counts. The client then calls `audit_youtube_video_community` for each
material video and repeats with its authenticated continuation token while
`continuation_recommended` is true. Results distinguish provider-reported
comments, API-visible records actually retrieved, and records returned for
analysis; they include exact page/reply accounting, a deterministic sample of
at most 500, and a literal `synthesis_lock` of `pass` or `block`. Each call is
bounded to 15 seconds, while the reasoning controller may continue for several
minutes when expected information gain remains positive. The legacy
`audit_youtube_community` remains advertised for compatibility. None of these
tools makes an efficacy, safety, causality, prevalence, or treatment judgment.

That paragraph describes the frozen MCP operation. The Custom GPT Action form
keeps the MCP token and operation schema unchanged internally but relays a
short one-hour handle backed by a bounded process-memory map. The map contains
only the existing signed minimized token, never comment text, author identity,
provider credentials, or protocol text; it is capped at 2,048 entries and 16
MiB and is not written to disk or application logs. An unavailable handle must
fail closed and restart from the video identifier. Product acceptance requires
a real continued audit ending with nonzero analyzed records and
`synthesis_lock:pass`; a short first response alone is insufficient.
`replies_reconciled:false` is acceptable only when an explicit terminal access
boundary explains the unresolved provider totals. If terminal sampled
identifiers are no longer all refetchable, the returned subset must remain
nonzero and deterministic, the acquired corpus count/digest must remain
unchanged, and the receipt/limitations must not claim a complete snapshot.

Fresh production acceptance on 2026-08-12 discovered the prior exact 15 tools and
annotations at `https://mcp.askrigor.com/mcp`. The compound tool returned
`api_visible_complete` plus `synthesis_lock:pass` for the recorded small
comment/reply corpus. For a deliberately oversized corpus it returned
`partial`, `youtube_comment_budget_elapsed_ms`, and `synthesis_lock:block`
within the default MCP request deadline; it did not relabel the unseen corpus as
complete.

Fresh production acceptance on 2026-08-14 returned the exact existing 17-tool
inventory in source order; its ordered-name SHA-256 is
`5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
The consequential lesson submission endpoint remains a separate Custom GPT
Action and is not counted as an MCP tool.

## Reviewer data and state boundary

The generated output schemas show every output field, including protocol text
and manifests; provenance (`provider`, `record_type`, identifiers,
`retrieved_at`, query, source identity, pagination, access status,
limitations); `raw_metadata`; structured errors; scholarly/trial records; and
public YouTube video, author/channel identity, display-name, comment/reply text,
timestamp, and completeness-manifest fields. Review these against
`docs/privacy-data-map.md` before submission.

Malformed inputs must fail MCP schema validation before upstream work. Empty or
not-found search/lookup outcomes must retain explicit provenance/access
semantics. Provider-unavailable results must retain an explicit access status or
error rather than appear as a successful empty result. No tool requires
confirmation and no tool may make a state change.

## Extended regression cases and portal selection

`docs/public-review-cases-v0.1.0.json` is the mechanically validated extended
regression suite:

- six positive cases and three negative cases, with fixed IDs/counts;
- literal user prompts, production-public input values, exact expected tool
  workflows/arguments, expected structured fields, and result-shape fields;
- explicit no-state-change expectation for every case; and
- a rationale for every negative case explaining why the plugin must not
  complete it.

OpenAI's final portal requires exactly five positive and three negative cases.
`docs/public-submission-packet-v0.1.0.json` therefore selects
`positive-1` through `positive-5` and `negative-1` through `negative-3` for the
portal. `positive-6` remains in the extended suite and historical runner
evidence as the compound YouTube survey/audit regression; it is not deleted or
relabelled. Its longest model-layer receipt remains opaque, so it is not one of
the five final portal positives.

Each case instead declares a distinct, concrete production-public input—no
repository fixture or internal context is required. Run its literal prompt
against the production endpoint and record selected tools, arguments, result
shape, errors, and confirmation/no-state outcome without exposing credentials
or unapproved personal data. The positive YouTube targets are `4x1fl67d_Ag`
for general comment retrieval and survey-selected patient-story video
`W42rwWD6zjw` for the compound audit. The distinct negative target is
`00000000000` and exercises the explicit
`inaccessible` video-visibility boundary. An empty successful `videos.list`
result cannot distinguish deleted, private, restricted, and otherwise
unavailable states, so it must not be relabeled `not_found` or replaced with a
scraping fallback.

The developer runner in `docs/public-review-automation.md` automates the direct
production-MCP and raw Responses API evidence for all nine cases. Its normal
entry point is `npm run review:public-live -- --live`; ordinary CI and
`npm run verify` do not make live or paid calls. The protected run
`20260815T110708.728Z-baa07445` used clean commit
`8ed8c0f7aaab9609dfb067780c05838f98903bab`, case-file SHA-256
`daf2b0e895956d759f382f9d592632d5ea094b0a28f0711efdc9c0f09f7bd7c1`,
and requested and received `chat-latest`. All 9/9 direct production cases
passed. Six of nine model cases passed; three are honestly `BLOCKED` because
the Responses remote-MCP layer returned opaque receipts that do not expose the
structured completion/error facts required by the contract:

- `positive-6`: exact survey and audit selections were visible, but the opaque
  outputs cannot prove whether authenticated continuation was conditionally
  required;
- `negative-1`: exact invalid PubMed selection was visible, but the generic
  `mcp_call_error` does not prove pre-provider schema rejection; and
- `negative-2`: exact inaccessible-video selection was visible, but the generic
  `mcp_call_error` does not prove the explicit visibility boundary.

The direct lane proves all three server-side contracts; it does not substitute
for the missing model-layer receipts. The sanitized report and summary passed
their checksum manifest and repository safety scanner.

Fresh post-deployment ChatGPT interface acceptance ran on 2026-08-15. Isolated
fresh chats visibly called `verify_protocol_integrity` once with the exact HRP
digest and returned `verified:true`, then visibly called `load_protocol` once
and returned the complete-text field with the same version, revision date, and
SHA-256. An explicit ordered three-tool prompt returned a concise receipt for
successful manifest, verification, and load operations. No write confirmation,
research synthesis, or routine update/status diagnostic appeared. The copied
combined transcript collapsed or mislabeled its visible tool card as
`get_protocol_manifest` even though the displayed response contained the load
tool's `text` field; the isolated tool cards and final receipt remove ambiguity
about the tool results, but that product-card presentation limitation remains
declared rather than rewritten as exact card-sequence proof.

## Submission execution gate

The publisher-matching HTTPS legal/support prerequisite was verified on
2026-08-12 at release `f928b95e29cd`. Remaining execution steps are:

1. Verify developer/business identity and complete the HTTPS domain challenge.
2. Submit `https://mcp.askrigor.com/mcp`, select **Scan Tools**, and compare
   the discovered data with a freshly generated inventory.
3. Record the privacy-safe reviewer demo using
   `docs/public-submission-demo-recording.md`, host it at an accepted HTTPS URL,
   and publish its verified receipt through the protected repository workflow.
4. Resolve the three opaque remote-MCP model receipts recorded by run
   `20260815T110708.728Z-baa07445`, or make an explicit release decision to
   accept that limitation. Do not relabel the 9/9 direct pass as model proof.
5. Confirm no response contains credentials, debug payloads, internal
   identifiers, or data not disclosed in the final privacy notice.
6. Reconcile each portal-only state in
   `docs/public-submission-packet-v0.1.0.json` from direct evidence before
   submission; repository files alone do not prove portal completion.
