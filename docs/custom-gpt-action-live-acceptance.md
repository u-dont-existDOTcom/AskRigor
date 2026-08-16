# Custom GPT Action live acceptance

Status: **DEPLOYED — DIRECT ACCEPTANCE PASSED — GPT UI PARTIAL; YOUTUBE CONTINUATION BLOCKED**. The exact
production Action boundary has passed the sanitized direct checks below. A new
unpublished Custom GPT still must import the deployed schema and run the
product-interface cases. Direct server proof is not relabeled as ChatGPT UI
proof.

Only synthetic, non-personal inputs were used. This record retains request
class, result, sanitized result, and limitation fields without raw protocol
text, provider bodies, comments, continuation tokens, credentials, private
issue content, or health details.

## Deployment identity

| Field | Value |
| --- | --- |
| UTC time | Original direct acceptance completed through `2026-08-16T07:34:43.932Z`; compatibility container started `2026-08-16T08:36:23.509309507Z`. |
| deployed commit | Compatibility merge `6639086a33b44f029c9f8405f69bd06b725e78d0`; exact accepted PR #17 head `b4d3db5d2b3f05debc4dd2c37cfa0d12290f67af`. The full direct behavior cases below were accepted on bridge merge `dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`. |
| deployed image | `askrigor-research:6639086a33b44f029c9f8405f69bd06b725e78d0`; image ID `sha256:05225a8210238f8099af90ba5e8525a142e50e04018547f0d0c6186f6d30544d`; healthy container `427d0ffc2a75275d4113d9ad1baf89275774a40774e6653be1e4c5283aad8220`. |
| rollback image/config | `askrigor-research:rollback-6639086` resolves the immediately prior production image `sha256:7e30222754d6e0c30d0b7fe1e02b206e68f87bdaa986c15ad5ef0985d88254cf`; `/opt/askrigor/compose.yaml.rollback-6639086` is present. |
| OpenAPI SHA-256 | Committed pretty artifact: `ca7abeb54ee688f4837637abe2c08cfa9de4565d013d49f267df9bbe2c08f377`; semantically identical compact live response: `fece1c89971fed1273fbc64eb3b62cfa4a458af1691009e6899e76c92f10ce53`. |
| instructions SHA-256 | `e319343102b047c8a0a238c26db5325da0d27f934cf80cf17bd34df1f8ca3bdb`. |
| privacy URL/result | `https://askrigor.com/privacy` returned `200`, byte SHA-256 `3dbe92623be62da3fd18edcbe20e71fa710b3f8f40419b2b91f3ce01459ad35e`, with the Custom GPT transient-flow disclosure. Active site release: `/opt/askrigor/site/releases/dd73d7dccb6b-v2/site`. |
| direct GPT URL | `pending` — requires saving/publishing the tested Custom GPT and copying its direct `/g/...` URL. |

## OpenAI Action importer compatibility deployment — 2026-08-16

The first GPT-editor import rejected the earlier schema for three exact reasons:
`components.schemas` was not an object, and the descriptions for
`get_youtube_comments` and `audit_youtube_community` exceeded OpenAI's
300-character operation-description limit. PR #17 added the explicit
`components.schemas` object, shortened both legacy descriptions to **201
characters**, and added generated-schema regression checks covering every
operation summary and description.

The exact merge was deployed reversibly. A disposable non-root smoke test
rejected the first unused candidate image before traffic because an
over-restrictive staging step had removed the runtime user's read permission
from archived source files. Production remained untouched. Re-extracting the
verified archive while preserving its internal file modes produced the final
image recorded above; its read-only, capability-dropped smoke test passed.
The rejected pre-traffic image remains tagged
`askrigor-research:rejected-permissions-6639086` for diagnosis.

Fresh public checks found 18 operations, an object-valued
`components.schemas`, no summary or description over 300 characters, and both
affected descriptions at exactly 201 characters. Health returned `200`, the
unauthenticated consequential lesson route still returned exact
`401 action_auth_required`, both protocol identities remained unchanged, and
the MCP inventory remained frozen at 17 tools. No provider call or lesson write
was repeated because this deployment changed only exported OpenAPI structure
and two descriptions. The 11 direct behavioral cases below therefore remain
evidence from the immediately preceding bridge deployment; GPT editor re-import
is still the required product-layer proof.

## Custom GPT product-interface evidence — 2026-08-16

The owner successfully imported the repaired schema. In a new private Custom
GPT chat with empty Knowledge, Universal loaded with exact 2/2 chunks and HRP
with exact 11/11 chunks, contiguous byte ranges, matching manifests, and final
complete receipts. PubMed search/fetch, ClinicalTrials.gov search/fetch, DOI
resolution, and conservative Crossref retraction-marker reporting also passed
without clinical inference.

The first real survey-first YouTube continuation case did not pass. Four
bounded search directions returned 15 candidates. The selected video
`nIRABXSJwSw` had 148 provider-reported comments. After one invalid
continuation and a restart, 66 API-visible records were retrieved cumulatively,
but the next continuation also failed. The terminal receipt returned zero
records for analysis, left top-level pagination unexhausted and replies
unreconciled, and correctly kept `synthesis_lock:block`. No health conclusion or
population-incidence estimate was produced.

The server's exact programmatic continuation tests pass; the failing product
path required ChatGPT to reproduce a several-thousand-character opaque token
exactly. The owner approved an Action-only, one-hour, bounded process-memory
handle repair. That repair is not live evidence until its merge, deployment,
direct two-call acceptance, and fresh Custom GPT continuation test pass.

Lesson disposition: **provisional transferable**. The evidence supports a
bounded warning about model-mediated relay of large opaque tool arguments, not
a rule that all continuations require server state. Direct programmatic MCP
clients are the explicit counterexample; any handle design must disclose its
privacy, restart, expiry, eviction, and horizontal-scaling limits. Promotion to
`universal-dev-architecture` waits for the exact repair's deployment and
product-interface retest.

### Case 1 — Universal complete protocol loading

- Request class: manifest → integrity verification → ordered protocol chunks.
- Result: **DIRECT PASS — GPT UI pending**.
- Protocol chunk coverage: 2/2 chunks, contiguous bytes `0..91599`, final
  `complete:true`, whole SHA-256
  `3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7`.
- Sanitized result: Universal `20.5.12`, revision `2026-08-16`; every chunk and
  the whole stream matched the manifest without retaining text.
- Limitation: not yet repeated through a new unpublished Custom GPT chat.

### Case 2 — HRP before bounded health research

- Request class: HRP manifest → integrity verification → ordered chunks.
- Result: **DIRECT PASS for protocol transport — GPT UI pending**.
- Protocol chunk coverage: 11/11 chunks, contiguous bytes `0..490256`, final
  `complete:true`, whole SHA-256
  `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`.
- Sanitized result: HRP `20.5.18`, revision `2026-08-16`; all byte and hash
  invariants passed before any health-research prompt was sent.
- Limitation: the product-layer ordering and harmless synthetic health answer
  remain for the unpublished Custom GPT test.

### Case 3 — PubMed search and fetch

- Request class: public scholarly metadata retrieval.
- Result: **DIRECT PASS — GPT UI pending**.
- Sanitized result: PMID `13054692`, provider `pubmed`,
  `access_status:api_visible_complete`, pagination exhausted; full text was not
  claimed or evaluated.
- Limitation: current provider metadata only; the Custom GPT presentation is
  not yet tested.

### Case 4 — ClinicalTrials.gov search and fetch

- Request class: public trial-registry metadata retrieval.
- Result: **DIRECT PASS — GPT UI pending**.
- Sanitized result: `NCT04280705`, provider `clinicaltrials_gov`,
  `access_status:api_visible_complete`, registry status `COMPLETED`; no efficacy
  inference was made.
- Limitation: registry metadata is not clinical-validity proof; the Custom GPT
  presentation is pending.

### Case 5 — DOI resolution and retraction metadata

- Request class: public Crossref metadata retrieval.
- Result: **DIRECT PASS — GPT UI pending**.
- Sanitized result: DOI `10.1056/nejmoa2034577`, provider `crossref`,
  `access_status:metadata_only`, status `no_retraction_record_found`; no
  clinical-validity inference was made.
- Limitation: absence of a Crossref marker does not prove that no update exists
  elsewhere; the Custom GPT wording remains to be tested.

### Case 6 — YouTube survey and terminal per-video audit

- Request class: public community-evidence discovery and continuation.
- Result: **DIRECT PASS — GPT UI pending**.
- Sanitized result: four directional searches returned `complete` with 22
  current candidates; all 22 had valid public URLs and valid provider comment
  counts, and target `W42rwWD6zjw` was present. Its audit retrieved all 16
  API-visible comments/replies in one call, returned all 16 for analysis,
  recommended no continuation, and ended `api_visible_complete` with
  `synthesis_lock:pass`.
- Limitation: search results are provider-dynamic and are not population
  incidence. The GPT must still demonstrate survey-first selection and obey a
  continuation token if a future corpus requires one.

### Case 7 — Malformed and oversized requests

- Request class: negative transport boundaries.
- Result: **DIRECT PASS**.
- Sanitized result: malformed JSON returned `400 action_invalid_json`; a body
  over 8,192 bytes returned `413 action_body_too_large`; both were nonretryable
  and exposed no provider success.
- Limitation: the Custom GPT editor may prevent constructing these exact raw
  HTTP shapes, so this is appropriately server-boundary evidence.

### Case 8 — Shared rate and concurrency pressure

- Request class: public abuse-boundary pressure.
- Result: **DIRECT PASS for the live rate branch**.
- Sanitized result: an owner-approved 80-request burst from one client returned
  62 successes and 18 exact `429 action_rate_limit_exceeded` retryable
  responses. No response exposed request content, credentials, or stack data;
  `/healthz` remained healthy and a research Action recovered after refill.
- Limitation: production concurrency was not forced with 17 simultaneous slow
  provider calls because that would spend provider quota without adding safety
  value. The exact `503 action_concurrency_limit_exceeded` branch remains
  covered by deterministic HTTP integration tests against the deployed code.

### Case 9 — Separately consented synthetic lesson

- Request class: consequential private-review write.
- Result: **DIRECT BACKEND PASS — GPT UI consent pending**.
- Sanitized result: after `AskRigor-lessons` was made private, one server-held
  Bearer submission returned `200 submitted`, candidate `ARL-0006`, occurrence
  count 1, `retryable:false`. Private sanitization verified the fixed sections,
  metadata marker, privacy gate, and exact expected labels without recording
  the issue body.
- Limitation: the exact consent question, explicit `Yes`, ChatGPT platform
  confirmation, and user-facing human-review notice must still be observed in
  a new unpublished Custom GPT chat.

### Case 10 — Append-only duplicate synthetic lesson

- Request class: consequential duplicate write.
- Result: **DIRECT BACKEND PASS — GPT UI pending**.
- Sanitized result: the byte-identical synthetic input returned
  `200 existing_candidate`, the same `ARL-0006`, and occurrence count 2. The
  original issue-body SHA-256 remained
  `5a864c560a2389f3540ca49a8a0336c2bf4e58f0176f3176f913439d38f10c3a`;
  exactly one canonical count/timestamp comment was added and contained no
  repeated candidate text.
- Limitation: the duplicate prompt still must be exercised through the Custom
  GPT interface.

### Case 11 — Lesson failure isolation

- Request class: induced consequential-write failure plus read-only probes.
- Result: **DIRECT PASS**.
- Sanitized result: while the queue was public, the App scope verifier failed
  closed as `503 github_unavailable/github_auth_unavailable`; no candidate was
  created. After the queue became private, unauthenticated submission returned
  `401 action_auth_required`; `/healthz` remained `200`, and `/mcp` still
  returned exactly 17 frozen tools with ordered-name JSON SHA-256
  `5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
- Limitation: neither failure proves the Custom GPT product's confirmation-card
  presentation, which remains a UI test.

## Post-test freeze check

- Post-test MCP inventory: **PASS** — exactly 17 tools; ordered-name JSON
  SHA-256 `5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
- Research Action operation count/security: **PASS** — 18 total operations,
  exactly 17 public non-consequential reads and one Bearer-authenticated
  consequential lesson write; all 18 declare the router-owned 500 response.
- Protocol chunk coverage reconciliation: **PASS** — Universal 2/2 and HRP
  11/11 with manifest, chunk, contiguous-range, total-byte, and whole-file hash
  equality.
- Lesson queue status and synthetic cleanup: **PASS** — `ARL-0006` was labeled
  `rejected`, removed from `needs-review`, received the explicit synthetic-only
  disposition, and closed `not_planned`; its body remained unchanged. Final
  queue status at `2026-08-16T07:34:43.932Z`: 0 open, 0 needs review, 0 accepted
  not incorporated, 2 incorporated or closed, 0 deletion eligible.
- Hosted privacy boundary: **PASS WITH DECLARED EXCEPTION** —
  `AskRigor-lessons` is private and the GitHub App is selected-repository only
  with `issues:write` and `metadata:read`. GitHub Free returned HTTP 403 for
  private-branch protection: `Upgrade to GitHub Pro or make this repository
  public to enable this feature.`
- Publish/repoint decision: **pending** — do not repoint `gpt.askrigor.com`
  until the unpublished Custom GPT cases pass and its actual direct `/g/...`
  URL is verified.

Lesson closeout: **project-specific / no-new-lesson**. This run reinforces the
already-promoted distinction between server, model, and product-interface proof
and the existing fail-closed private-queue boundary. It does not create a new
transferable architecture rule.
