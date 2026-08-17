# Custom GPT Action live acceptance

Status: **DEPLOYED — DIRECT ACCEPTANCE PASSED — GPT UI PARTIAL; YOUTUBE DIRECT CONTINUATION PASSED, GPT UI RETEST PENDING**. The exact
production Action boundary, including the formerly failing two-call YouTube
chain, has passed the sanitized direct checks below. The unpublished Custom GPT
still must repeat the repaired continuation and lesson-consent cases in a fresh
chat. Direct server proof is not relabeled as ChatGPT UI proof.

Only synthetic, non-personal inputs were used. This record retains request
class, result, sanitized result, and limitation fields without raw protocol
text, provider bodies, comments, continuation tokens, credentials, private
issue content, or health details.

## Deployment identity

| Field | Value |
| --- | --- |
| UTC time | YouTube terminal-refetch acceptance completed through `2026-08-17T03:13:01Z`; accepted container started `2026-08-17T03:07:50.748902185Z`. |
| deployed commit | PR #23 merge `905ac22ab42479c15ff0d6385a51de864271f862`; exact accepted head `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f`. Earlier repair merges PR #19 through PR #22 remain in its ancestry. |
| deployed image | `askrigor-research:905ac22ab42479c15ff0d6385a51de864271f862`; image ID `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`; healthy container `af7689e8f55ed12e86a863e3cbe7d03b2bfd27edc00fa4860d7083bd146271df`. |
| rollback image/config | `askrigor-research:rollback-905ac22a` resolves the immediately prior production image `sha256:b6bf6df118e47eff766371717b48c3b732edf91053ef9e7915eb55edb5534a95`; `/opt/askrigor/compose.yaml.rollback-905ac22a` has SHA-256 `eb3b85f080d008a4ab8b93b7506e22b9759a072a94b3281f2a788d85cbe3185d`. |
| OpenAPI SHA-256 | Committed pretty artifact: `0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94`; semantically identical compact live response: `402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2`. |
| instructions SHA-256 | `ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad`. |
| privacy URL/result | `https://askrigor.com/privacy` returned `200`, byte SHA-256 `d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`, with the bounded transient-handle disclosure. Active site release: `/opt/askrigor/site/releases/56b3dff6d7c3/site`. |
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

The failing product path required ChatGPT to reproduce a
several-thousand-character opaque token exactly. The owner approved an
Action-only, one-hour, bounded process-memory handle repair. That repair and
the follow-up overlap/refetch corrections are now merged, deployed, and direct
two-call accepted. A fresh Custom GPT continuation test is still required for
product-layer proof.

Lesson disposition: **provisional transferable**. The evidence supports a
bounded warning about model-mediated relay of large opaque tool arguments, not
a rule that all continuations require server state. Direct programmatic MCP
clients are the explicit counterexample; any handle design must disclose its
privacy, restart, expiry, eviction, and horizontal-scaling limits. Promotion to
`universal-dev-architecture` still waits for the product-interface retest.

## YouTube continuation and terminal-refetch release — 2026-08-17

PR #19 merged the bounded 37-character Action continuation handle as
`56b3dff6d7c32b732f37c6a59bf9e3a9c5506829`. PR #20 (`f03e38b`), PR #21
(`3b50000`), and PR #22 (`0d181be`) then repaired moving pagination overlap,
exact continuation-chain overlap, and fail-closed terminal sample handling.
All protected and post-merge deterministic, workflow-policy, and CodeQL checks
passed.

The first PR #22 production candidate was deliberately rolled back after the
exact product video `nIRABXSJwSw` reached 149 API-visible records but could not
refetch its terminal deterministic sample. A private, bounded provider probe
showed the root cause without retaining identifiers or comment text: YouTube
`comments.list` returned HTTP `200` with 50 valid IDs and HTTP `400
invalidFilters` with 51. The old implementation sent batches of 100.

PR #23 added the provider-boundary regression first, observed it fail against
the 100-ID implementation, and then limited comment-ID refetches to 50. Exact
head `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f` merged as
`905ac22ab42479c15ff0d6385a51de864271f862`. Focused tests passed 22/22; the
affected segment-plus-audit suites passed 49/49 under independent review; the
complete host-boundary gate passed 914 tests with five credential-gated skips,
plus typecheck and build. PR and post-merge checks passed, and independent
review found no Critical, Important, or Minor issue.

The exact merge image passed the disposable read-only, capability-dropped,
`no-new-privileges` gate with health `200`, 18 Action operations,
unauthenticated lesson `401`, and startup-only logs. Deployment recreated only
`research-mcp`; Caddy remained
`06ead4ec8e2aeeac99d13e36dc31b7c474a07d3bc61e3638275086daee174cf1`.
The image archive SHA-256 is
`b04dcc95e902e7c5b157f25d4a796964b3573c57972c3cb50cac5b65fecb8662`.

Fresh direct acceptance passed health, the exact 18-operation schema, both
canonical protocol identities, and the frozen 17-tool MCP inventory. The known
one-call video `W42rwWD6zjw` remained `api_visible_complete`, returning all 16
records with `synthesis_lock:pass`. The formerly failing video completed in two
Action calls: call one retained 66 records and returned a 37-character handle;
call two reached 149 cumulative records, returned a deterministic 111-record
sample, ended `completed_with_access_boundary`, reported no error or further
continuation, and set `synthesis_lock:pass`. The three limitations remain
truthful pagination/reply boundary disclosures rather than a false completeness
claim. No raw comment, provider body, continuation state, or credential is
retained here.

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
- Result: **DIRECT PASS, INCLUDING REPAIRED TWO-CALL CHAIN — GPT UI RETEST pending**.
- Sanitized result: four directional searches returned `complete` with 22
  current candidates; all 22 had valid public URLs and valid provider comment
  counts, and target `W42rwWD6zjw` was present. Its audit retrieved all 16
  API-visible comments/replies in one call, returned all 16 for analysis,
  recommended no continuation, and ended `api_visible_complete` with
  `synthesis_lock:pass`. The repaired `nIRABXSJwSw` chain separately retained
  66 records on call one, reached 149 on call two, returned 111 deterministic
  analysis records, ended `completed_with_access_boundary`, and passed
  synthesis without an error or further continuation.
- Limitation: search results are provider-dynamic and are not population
  incidence. The GPT must still demonstrate the repaired short-handle relay in
  a fresh product session; direct Action proof does not establish UI behavior.

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
  queue status at `2026-08-17T03:13:06.118Z`: 0 open, 0 needs review, 0 accepted
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
