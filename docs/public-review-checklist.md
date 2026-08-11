# AskRigor v0 public-review checklist

This packet is prepared for a future plugin draft. It is not permission to submit
or publish. **Public submission remains blocked** by the website, privacy, terms,
and support URL findings in `docs/release-evidence-v0.1.0.md`.

## Source-generated MCP tools/list inventory

The complete reviewer inventory is generated directly from
`createAskRigorServer()` through an in-memory MCP `tools/list` call. It
contains all 14 exact tool names, **title absence** (`title: null` for every
tool), descriptions, full advertised JSON-Schema Draft 7 input schemas, full
advertised JSON-Schema Draft 7 output schemas, and annotations. The committed
generated artifact is `docs/tool-inventory-v0.1.0.json`; regenerate it with:

```sh
npx tsx scripts/generate-tool-inventory.mts
```

The emitted inventory identifies itself as
`MCP tools/list against createAskRigorServer()`, gives the intended production
endpoint `https://mcp.askrigor.com/mcp`, and has the canonical compact-JSON
SHA-256 `f52b3627acae229e6c6cd6a40e0b74f9b383b198efd18a165b21371a0fea2eb6`.
`tests/release-packet.test.ts` regenerates the full inventory, asserts all 14
names/order, title absence, schema roots, annotations, exact checksum, and deep
equality with the committed full JSON artifact. A metadata or schema change
therefore requires an intentional inventory review, fresh Inspector/ChatGPT
checks, deploy, and Scan Tools rescan.

All 14 generated entries advertise exactly:

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
```

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

- five positive cases and three negative cases, with fixed IDs/counts;
- literal user prompts, local recorded fixture paths, exact expected tool
  workflows/arguments, expected structured fields, and result-shape fields;
- explicit no-state-change expectation for every case; and
- a rationale for every negative case explaining why the plugin must not
  complete it.

Use the referenced fixtures to reproduce the protocol, PubMed, clinical trial,
Crossref/retraction, YouTube video, comment/reply, malformed-input,
comments-disabled, and unsupported-write/medical boundaries locally. For public
portal review, rerun the equivalent prompt against the production endpoint and
record selected tools, arguments, result shape, errors, and confirmation/no-state
outcome without exposing credentials or unapproved personal data.

## Submission execution gate

Only after real publisher-matching HTTPS legal/support pages are live:

1. Verify developer/business identity and complete the HTTPS domain challenge.
2. Submit `https://mcp.askrigor.com/mcp`, select **Scan Tools**, and compare
   the discovered data with a freshly generated inventory.
3. Re-run all eight cases in `docs/public-review-cases-v0.1.0.json` with the
   recorded fixtures and expected fields.
4. Confirm no response contains credentials, debug payloads, internal
   identifiers, or data not disclosed in the final privacy notice.
5. Resolve or expressly accept the recorded routine-status presentation
   regression before claiming release-quality ChatGPT presentation.
