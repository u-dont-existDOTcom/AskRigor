# AskRigor v0 public-review checklist

This packet is prepared for a future plugin draft. It is not permission to submit
or publish. The website/privacy/terms/support gate passed on 2026-08-12 for
immutable site release `f928b95e29cd`, including the live privacy policy at
`https://askrigor.com/privacy`. **PUBLIC SUBMISSION BLOCKED** still applies to
the separate routine-status presentation regression, portal identity and
domain-verification work, Scan Tools review, and submission actions recorded in
`docs/release-evidence-v0.1.0.md`.

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
SHA-256 `f803181f8378a3489c630fde4b4dce49f6beec90c017e670b586d844e40c1c91`.
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

Fresh production acceptance on 2026-08-12 discovered the prior exact 15 tools and
annotations at `https://mcp.askrigor.com/mcp`. The compound tool returned
`api_visible_complete` plus `synthesis_lock:pass` for the recorded small
comment/reply corpus. For a deliberately oversized corpus it returned
`partial`, `youtube_comment_budget_elapsed_ms`, and `synthesis_lock:block`
within the default MCP request deadline; it did not relabel the unseen corpus as
complete.

The current local release candidate advertises 17 tools. Its two adaptive tools
and updated inventory must not be described as deployed until rollout and fresh
production discovery complete.

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

## Portal test cases

`docs/public-review-cases-v0.1.0.json` is the reviewer-ready, mechanically
validated case set:

- six positive cases and three negative cases, with fixed IDs/counts;
- literal user prompts, production-public input values, exact expected tool
  workflows/arguments, expected structured fields, and result-shape fields;
- explicit no-state-change expectation for every case; and
- a rationale for every negative case explaining why the plugin must not
  complete it.

Each case instead declares a distinct, concrete production-public input—no
repository fixture or internal context is required. Run its literal prompt
against the production endpoint and record selected tools, arguments, result
shape, errors, and confirmation/no-state outcome without exposing credentials
or unapproved personal data. The positive YouTube target is `4x1fl67d_Ag`; the
distinct negative target is `00000000000` and exercises explicit `not_found`,
not unverified comments-disabled behavior.

## Submission execution gate

The publisher-matching HTTPS legal/support prerequisite was verified on
2026-08-12 at release `f928b95e29cd`. Remaining execution steps are:

1. Verify developer/business identity and complete the HTTPS domain challenge.
2. Submit `https://mcp.askrigor.com/mcp`, select **Scan Tools**, and compare
   the discovered data with a freshly generated inventory.
3. Re-run all nine cases in `docs/public-review-cases-v0.1.0.json` with the
   production-public inputs and expected fields.
4. Confirm no response contains credentials, debug payloads, internal
   identifiers, or data not disclosed in the final privacy notice.
5. Resolve or expressly accept the recorded routine-status presentation
   regression before claiming release-quality ChatGPT presentation.
