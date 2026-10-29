# Owner answers 190a and 189a — 27 October 2026

Scope: implement 190a first, then the one-time catalog change and freeze in 189a on
`claude/next-build-20261027`, following `d89b459f`. No external network, commits or release.
The live UDA bootstrap and lesson/suggested-fix queue cannot be retrieved under this constraint.

1. Request and compare the plain answer for all active research accounts. Preserve request-local handling,
   connector-only exposure, and exclusion from findings cards, the Atlas and the second reader.
2. Move release identity from tool definitions to manifest results; retain handshake identity and list currency.
3. Separate every tool's permissive SDK input schema from its runtime schema. The wrapper merges and validates
   later shapes, including redeclarations of existing enums, nested inputs and limits. Publish the three growing
   action/category inputs as strings; keep other input enums exact. Open output objects and values recursively.
   Measure Gemini's budget and record any envelope omissions.
4. Verify behavior across all three surfaces; generate the inventory and any required vocabulary, then freeze
   canonical served lists and verify their digests. Run the complete deterministic gate offline.

Evidence and closeout are recorded here after verification. This worktree is the user's active checkout; no
additional checkout or dependency installation is needed.

## Implementation and review evidence

190a is implemented before the catalog freeze. The free-contributor connector fixtures cover inspect,
registration, the note's on/off setting, final-note ordering, saved-card exclusion and second-reader exclusion.
Actions remain unavailable for this path, and Gemini still omits the access/final-check tools.

189a uses `later-inputs.ts` as the declaration registry and registration/merge helper. Every tool currently
has an empty later shape. Every SDK parser is permissive and publishes its fixed JSON; the wrapper checks the
merged input against the separate runtime object extended by the later shape. The strict final-check parser
uses that same registry and retains its existing empty-list normalization before validation.

The compatibility-gap followup covers all seven requested items:

1. `withLaterInputs` validates runtime inputs for 31 of the 33 tools (the review correction below covers the other two). Problems return `isError: true`, with JSON text
   containing `error.code: invalid_input`, a message and every problem's path. They omit `structuredContent`:
   the SDK client validates that field against the success schema even for errors, which otherwise hides the
   actual input problems behind a second validation error. Result metadata names the same error code so the
   legacy Actions adapter retains HTTP 422 for malformed calls. `RegisteredResearchOperation` retains runtime
   input/output and publication schemas separately; Gemini uses the latter to preserve its existing default-field publication.
2. A new input gets a later shape entry; a newer form of an existing input redeclares that input in the later
   shape. Both are accepted at the top level or through `later_inputs`, with duplicate locations rejected.
   Unredeclared published inputs retain the existing “give it at the top level” error inside the envelope.
3. `manage_research_access.action`, `review_research_contribution.action` and `submit_lesson_candidate.category`
   publish required strings with the current values and “or another value an AskRigor result names.” Their
   exact runtime enums reject unknown values and list valid ones. A new action/category changes only its
   runtime enum and is named in results or the protocol; the frozen descriptions are independent of enum growth.
4. `openToolOutputSchema` removes every published output `enum` and `const`, in addition to opening nested
   objects. The actual output parsers retain their original enum, literal and object checks. The derived debug-report and
   next-step vocabularies read exact runtime declarations, so opening publication cannot erase known result codes.
5. `get_protocol_manifest` computes running versions inside its `try`; failure reaches `protocolErrorResult`
   without attempting to read missing versions. Existing versions still accompany other protocol failures.
6. `later-inputs.test.ts` exercises raw-shape enum growth through the SDK at both locations, duplicate rejection,
   relaxed limits, open action/category runtime growth, unknown values and version failures. Its finalization
   fixture redeclares `key_sources` with a new nested field in the envelope and verifies gate input, carried
   state and receipt creation. `frozen-tool-lists.test.ts` checks every property and required input against
   runtime on all three surfaces and checks that all published outputs lack enums/consts. It also proves that
   future output values pass the retained schema but fail the unchanged server parser. Existing finalization
   and contribution tests cover the new error contract; contribution privacy screening remains tested.
7. The registry header and frozen-list failure message document new entries, redeclarations, runtime-only
   action/category growth and guidance in results or the protocol. This plan records the implementation and gates.

A direct comparison against the pre-followup catalogs proved exact JSON bytes unchanged except for the three
published string inputs and output enum/const removals. Gemini is byte-identical. Tool descriptions remain
unchanged; the new input descriptions are descriptive. The Actions OpenAPI snapshot is unchanged.
The complete deterministic gate is recorded below after its final run.
The standalone freeze checker uses the JSON wire form before strict equality: the in-memory SDK can preserve
undefined metadata properties that HTTP, canonical JSON digests and fixture files omit.

Canonical list versions (fixtures generated after typecheck, inventory and vocabulary):

| Surface | tool_list_version | Catalog bytes | Tools with later_inputs |
| --- | --- | ---: | ---: |
| `/mcp` | `442d2af213cbc996` | 341628 | 33/33 |
| `/mcp/claude` | `a53242ad0740d6bb` | 404530 | 33/33 |
| `/mcp/gemini` | `3f619c4c16156097` | 24982 | 3/22 |

Gemini's 25,000-byte budget fits the envelope only on `get_protocol_manifest`, `load_protocol` and
`verify_protocol_integrity`. It omits it on `search_pubmed`, `fetch_pubmed_record`, `search_europe_pmc`,
`acquire_open_full_text`, `continue_open_full_text`, `validate_study_method_audit`, `validate_review_method_audit`,
`search_clinical_trials`, `fetch_clinical_trial`, `resolve_doi`, `check_retraction_status`, `search_youtube`,
`get_youtube_video`, `get_youtube_comments`, `search_youtube_comments`, `audit_youtube_community`,
`survey_youtube_community`, `audit_youtube_video_community` and `get_research_frontier`. Existing Gemini inputs
are preserved; the fixture pins these omissions.

Release handoff: deploying this one-time 189a catalog change needs one final app refresh. Subsequent releases
keep these lists and digests fixed unless a tool is added or removed; a release with such a change must record
the refresh requirement. This task authorizes no deployment and makes no commit or network publication.

Closeout: no extra checkout or dependency installation was created. The supplied active worktree remains
with reviewable uncommitted changes. `AGENTS.md` and site files are untouched. Lesson and suggested-fix queue
counts were not queried because the owner prohibited external network access; their status is unavailable,
not zero. No lesson handling expands this task's scope.

## Compatibility-gap final validation

Final `npm run verify` on Node 24.18.0 passes with exit 0. External connections are blocked by a local Node socket
guard while loopback and local IPC are enabled; npm runs offline. The initial sandbox denied even local sockets,
so the local HTTP checks use the approved socket-capable execution mode. No external network was used.
Generation order: `npm run typecheck`, `npx tsx scripts/generate-tool-inventory.mts --write`, derived check-report
vocabulary, then `npx tsx scripts/freeze-tool-lists.mts --write` last. Both standard surfaces have all 33 envelopes;
Gemini keeps the same three and the same 19 omissions. All earlier 190a changes remain in this worktree.

Final result:

```text
npm run verify — exit 0
Test Files  299 passed | 1 skipped (300)
Tests       5022 passed | 6 skipped (5028)
> askrigor@0.1.0 build
> tsc -b packages/contracts packages/protocol packages/sources packages/evidence-repository apps/research-mcp
```

The final focused schema/Actions/report run passes all 59 tests in four files. The frozen-list suite passes all
17 tests as part of the full gate. The standalone checker, exact allowed-change comparison, final diff review
and `git diff --check` pass. Actions snapshot SHA-256 remains
`aac39368d9e4804dda8ca87bc19f939874d3b6903c939293ee216bf51df4c034`.
The initial full run exposed old `not_ready` transport expectations and consumers that read closed values from
publication. Those consumers now use exact runtime schemas; direct gate semantics and privacy checks remain
covered. The report vocabulary generator also reads runtime declarations, preserving imported package codes
independently of open tool publication.

Lesson closeout: published schemas describe the client contract; internal exact-code consumers require the
separate runtime declarations. This is recorded here without a network write to the lesson queue. No site or
protocol files changed. Test telemetry records 355.61 seconds across nine test invocations, with no repeated
green full suite; one failed full checkpoint was corrected before the passing one. The owner-provided worktree
and draft PR remain uncommitted at `d89b459f`, on `claude/next-build-20261027`.

## Review correction (Claude Code session, 27 October)

The followup also moved finalize_research's and submit_research_contribution's input checks into the wrapper,
which replaced their own results with `invalid_input` errors without `structuredContent`. ChatGPT shows such a
result only as "The tool failed internally" and hides its text (owner reports, 2026-10-03 and 2026-10-06), and those
two tools exist to name each problem visibly:

- the final check returns a `not_ready` result whose steps name each problem, with the hidden shapes as JSON;
- the contribution service names each problem by rule without echoing a submitted value, and runs its account and
  privacy checks first.

So `RuntimeInputOptions.handler` keeps both on their own validation:

- `"merges"` (finalize_research) passes the raw call on, and `parseFinalizeResearchInput` merges later_inputs with
  `mergeLaterInputs`, so a later_inputs problem is one more step in the same not_ready result;
- `"validates"` (submit_research_contribution) merges later_inputs in the wrapper and passes the merged call on
  unparsed.

The tests those two tools had before the followup are restored unchanged, except that the published-schema checks
compare the list without `later_inputs`. For the other 31 tools, the wrapper's isError text result has the shape the
SDK's own input validation produced before (SDK 1.32.1 `createToolError`), so nothing changes there.
