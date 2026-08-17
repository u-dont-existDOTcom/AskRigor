# Custom GPT Action live acceptance

Status: **DEPLOYED — DIRECT ACCEPTANCE PASSED — GPT UI PARTIAL; YOUTUBE CONTINUATION PASSED, PROTOCOL UI REFRESH AND LESSON CONSENT PENDING**. The exact
production Action boundary and the formerly failing two-call YouTube chain have
passed both the sanitized direct checks and the repaired Custom GPT UI relay
test below. Production now serves canonical Universal `20.5.13`; the
unpublished Custom GPT still must demonstrate those current bytes and complete
the lesson-consent cases. Direct server proof is not relabeled as ChatGPT UI
proof.

Only synthetic, non-personal inputs were used. This record retains request
class, result, sanitized result, and limitation fields without raw protocol
text, provider bodies, comments, continuation tokens, credentials, private
issue content, or health details.

## Deployment identity

| Field | Value |
| --- | --- |
| UTC time | Universal `20.5.13` production acceptance completed through `2026-08-17T19:52:27Z`; accepted container started `2026-08-17T19:49:50.291758112Z`. |
| deployed commit | PR #27 merge `5585a9ca34ce01403044b1085b85d4f2de9783f4`; exact acceptance-evidence head `a745979af07a6931324887023ce5b63f2991a2a6`. Universal `20.5.13` integration commits `38d7b58` and `52a2201` and the repaired continuation release remain in its ancestry. |
| deployed image | `askrigor-research:5585a9ca34ce01403044b1085b85d4f2de9783f4`; image ID `sha256:95b86a1135701149c17125d1a5994e41063f868eefd903a38e28b4c09e0f6953`; healthy container `5dd468499d6806b506f69e003bf45d76e773682c549e735e6519eb92bdba8d5b`. |
| current runtime configuration | `/opt/askrigor/compose.yaml` SHA-256 `cf2fa82cbe4ba6e6b9ce515e2f260d07dacf09f1df6ac2feb66cfc485f9c69cf`; unchanged Caddy container `06ead4ec8e2aeeac99d13e36dc31b7c474a07d3bc61e3638275086daee174cf1`; runtime environment file remained `root:root` mode `0600` and was not read. |
| rollback image/config | `askrigor-research:rollback-5585a9c` resolves the immediately prior production image `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`; `/opt/askrigor/compose.yaml.rollback-5585a9c` has SHA-256 `c806aabe2949f976ab882baabae19c28216233b915b62f36a5ed3cc5c51284d9`. |
| deployment archives | Exact secret-free source archive SHA-256 `024cb1f552fddc82b24c89a6c2ca84ba5d8de4a66f76e50e88c4c2e77f0cf283`; exact built image archive SHA-256 `81da2e8e5c9e727e884c20dd560c76537072c5913380334130cd7bc7d14b0cf0`. |
| OpenAPI SHA-256 | Committed pretty artifact: `0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94`; semantically identical compact live response: `402e369f25a2b27da114c5f018be1c64cc5f8a2ef81983f2588b30c6875438e2`. |
| instructions SHA-256 | `ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad`. |
| privacy URL/result | `https://askrigor.com/privacy` returned `200`, byte SHA-256 `d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`, with the bounded transient-handle disclosure. Active site release: `/opt/askrigor/site/releases/56b3dff6d7c3/site`. |
| direct GPT URL | `pending` — requires saving/publishing the tested Custom GPT and copying its direct `/g/...` URL. |

## Universal 20.5.13 production freshness rollout — 2026-08-17

PR #27 merged the sanitized Custom GPT continuation receipt as
`5585a9ca34ce01403044b1085b85d4f2de9783f4` after all deterministic,
workflow-policy, and CodeQL checks passed on both the pull request and merge.
Relative to the prior production release, runtime source and public contracts
were unchanged; the runtime-relevant update was canonical Universal `20.5.13`,
with documentation, structure tests, and the pinned `tsx` development update
also in the exact source archive.

The image was built from that secret-free exact Git archive. Before traffic it
ran as `node` under a read-only root filesystem with all capabilities dropped
and `no-new-privileges`. Its disposable gate passed health, the exact 18 Action
operations, object-valued `components.schemas`, every description within 300
characters, unauthenticated lesson `401`, and Universal manifest, integrity,
and full ordered loading. The complete Universal stream used 3 contiguous
chunks and 98,154 bytes and matched SHA-256
`3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`.

Deployment changed only the `research-mcp` image selector. An automatic failure
trap preserved and would restore the old Compose file and image; it did not
fire. Caddy, the active site release, runtime environment, and lesson state
mount were unchanged. Fresh public acceptance passed health, exact OpenAPI,
the 17-tool MCP inventory byte-for-byte, HRP `20.5.18`, Universal `20.5.13`
manifest/integrity/full load, unauthenticated lesson isolation, and the
unchanged privacy hash. No provider call, lesson write, or completed YouTube UI
case was repeated because the application paths were unchanged.

## OpenAI Action importer compatibility deployment — 2026-08-16

The first GPT-editor import rejected the earlier schema for three exact reasons:
`components.schemas` was not an object, and the descriptions for
`get_youtube_comments` and `audit_youtube_community` exceeded OpenAI's
300-character operation-description limit. PR #17 added the explicit
`components.schemas` object, shortened both legacy descriptions to **201
characters**, and added generated-schema regression checks covering every
operation summary and description.

At the 2026-08-16 compatibility rollout, the exact PR #17 merge was deployed
reversibly. A disposable non-root smoke test
rejected the first unused candidate image before traffic because an
over-restrictive staging step had removed the runtime user's read permission
from archived source files. Production remained untouched. Re-extracting the
verified archive while preserving its internal file modes produced the final
compatibility-rollout image; its read-only, capability-dropped smoke test
passed. That historical image was superseded by the PR #23 image in the current
deployment-identity table above.
The rejected pre-traffic image remains tagged
`askrigor-research:rejected-permissions-6639086` for diagnosis.

Fresh public checks found 18 operations, an object-valued
`components.schemas`, no summary or description over 300 characters, and both
affected descriptions at exactly 201 characters. Health returned `200`, the
unauthenticated consequential lesson route still returned exact
`401 action_auth_required`, both protocol identities remained unchanged, and
the MCP inventory remained frozen at 17 tools. No provider call or lesson write
was repeated because that deployment changed only exported OpenAPI structure
and two descriptions. The editor subsequently imported the repaired schema,
and the 2026-08-16 product-interface run passed cases 1 through 5 below. The
2026-08-17 PR #23 release freshly reran direct health, schema, protocol, MCP,
and both YouTube audit paths. The repaired YouTube continuation passed through
the product interface on 2026-08-17; the lesson-consent cases remain pending.

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
two-call accepted.

## Custom GPT product-interface continuation evidence — 2026-08-17

The owner-provided output from a fresh Custom GPT run establishes the repaired
product-layer relay without retaining comment text, provider bodies, or the
continuation value. The required video `nIRABXSJwSw` was intentionally
off-topic for the health question, and the GPT kept that mismatch separate
from its substantive synthesis.

Call one retrieved 66 unique API-visible records, returned zero records for
analysis, recommended continuation, kept `synthesis_lock:block`, and returned
the expected 37-character Action handle. The unchanged handle was relayed into
call two. That call retrieved 83 more records, reached 149 cumulative unique
records, returned the deterministic 111-record analysis sample, recommended no
further continuation, reported no error, ended
`completed_with_access_boundary`, and set `synthesis_lock:pass`.
`reply_count_mismatches` was empty, while `replies_reconciled` truthfully
remained `false` because the moving-pagination/reply boundary prevented an
independent proof of provider-reported per-parent reply totals.

This product-interface pass loaded HRP `20.5.18` and the then-deployed Universal
`20.5.12`. Production now directly serves and verifies canonical Universal
`20.5.13`; the UI receipt therefore closes the short-handle continuation defect
but is not evidence that the newer Universal bytes were loaded by the Custom
GPT.

Lesson disposition: **transferable with bounded scope**. The evidence supports a
bounded warning about model-mediated relay of large opaque tool arguments, not
a rule that all continuations require server state. Direct programmatic MCP
clients are the explicit counterexample; any handle design must disclose its
privacy, restart, expiry, eviction, and horizontal-scaling limits. Promotion to
`universal-dev-architecture` is now eligible for an evidence-preserving owner
review; this project record does not claim that promotion already occurred.

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
showed the root cause without retaining identifiers or comment text: 50 valid
comment IDs returned HTTP `200` and exactly 50 items; 51 valid comment IDs
returned HTTP `400 invalidFilters` and zero items. The old implementation sent
batches of 100.

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

## Remaining exact Custom GPT UI sequence

Use a new chat in the same unpublished GPT with empty Knowledge. Paste this
first block exactly:

```text
Do not perform health research, provider searches, or lesson submission yet.

1. Call get_protocol_manifest for universal and require version 20.5.13, revision 2026-08-17, and SHA-256 3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4.
2. Call verify_protocol_integrity for universal with that exact expected_sha256 and require verified:true.
3. Call load_protocol for universal and continue with each returned cursor until complete:true. Verify contiguous byte ranges, every chunk digest, the final whole digest, exactly 3 chunks, and exactly 98,154 UTF-8 bytes. Do not quote or summarize the protocol text.
4. Report only the sanitized manifest, integrity, chunk/range, total-byte, and completion receipts.

After those checks, recheck this entirely synthetic correction: “You made a material factual claim without showing any source. After rechecking, do you agree that this is a valid AskRigor failure?” If it is valid, display the approved generalized candidate and the exact AskRigor consent question and reply options. Do not call submit_lesson_candidate until I reply with an authorized exact answer.
```

Require the complete protocol receipt and the exact lesson-consent shell, with
no lesson Action call yet. Then paste exactly:

```text
Yes
```

Accept ChatGPT's separate consequential-Action confirmation. Require a truthful
`submitted` or `existing_candidate` receipt with an `ARL-####` ID, anonymous
occurrence count, and human-review notice. To exercise append-only duplicate
handling, paste:

```text
Independently recheck the identical synthetic failure again. If it remains eligible, reuse exactly the same previously displayed generalized candidate, display the full consent shell again, and do not call submit_lesson_candidate until I reply.
```

After the exact shell appears, paste `Yes` again and accept the platform
confirmation. Require `existing_candidate`, the same candidate ID, and an
incremented occurrence count. Stop if the candidate text changes, consent is
skipped, the platform confirmation is bypassed, or any receipt is ambiguous.

### Case 1 — Universal complete protocol loading

- Request class: manifest → integrity verification → ordered protocol chunks.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-16)**.
- Protocol chunk coverage: 2/2 chunks, contiguous bytes `0..91599`, final
  `complete:true`, whole SHA-256
  `3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7`.
- Sanitized result: Universal `20.5.12`, revision `2026-08-16`; every chunk and
  the whole stream matched the manifest without retaining text.
- Limitation: the product proof is bounded to the recorded private Custom GPT
  chat and does not establish behavior in a future published GPT revision.

### Case 2 — HRP before bounded health research

- Request class: HRP manifest → integrity verification → ordered chunks.
- Result: **DIRECT PASS for protocol transport — GPT UI PASS (2026-08-16)**.
- Protocol chunk coverage: 11/11 chunks, contiguous bytes `0..490256`, final
  `complete:true`, whole SHA-256
  `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`.
- Sanitized result: HRP `20.5.18`, revision `2026-08-16`; all byte and hash
  invariants passed before any health-research prompt was sent.
- Limitation: the product-layer proof establishes ordered HRP loading; it is not
  evidence for any clinical claim or for a future published GPT revision.

### Case 3 — PubMed search and fetch

- Request class: public scholarly metadata retrieval.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-16)**.
- Sanitized result: PMID `13054692`, provider `pubmed`,
  `access_status:api_visible_complete`, pagination exhausted; full text was not
  claimed or evaluated.
- Limitation: current provider metadata only; the recorded UI result did not
  claim or evaluate full text.

### Case 4 — ClinicalTrials.gov search and fetch

- Request class: public trial-registry metadata retrieval.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-16)**.
- Sanitized result: `NCT04280705`, provider `clinicaltrials_gov`,
  `access_status:api_visible_complete`, registry status `COMPLETED`; no efficacy
  inference was made.
- Limitation: registry metadata and its recorded UI presentation are not
  clinical-validity proof.

### Case 5 — DOI resolution and retraction metadata

- Request class: public Crossref metadata retrieval.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-16)**.
- Sanitized result: DOI `10.1056/nejmoa2034577`, provider `crossref`,
  `access_status:metadata_only`, status `no_retraction_record_found`; no
  clinical-validity inference was made.
- Limitation: absence of a Crossref marker does not prove that no update exists
  elsewhere; the recorded UI response preserved that boundary.

### Case 6 — YouTube survey and terminal per-video audit

- Request class: public community-evidence discovery and continuation.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-17), INCLUDING REPAIRED TWO-CALL CHAIN**.
- Sanitized result: four directional searches returned `complete` with 22
  current candidates; all 22 had valid public URLs and valid provider comment
  counts, and target `W42rwWD6zjw` was present. Its audit retrieved all 16
  API-visible comments/replies in one call, returned all 16 for analysis,
  recommended no continuation, and ended `api_visible_complete` with
  `synthesis_lock:pass`. The repaired `nIRABXSJwSw` chain separately retained
  66 records on call one, reached 149 on call two, returned 111 deterministic
  analysis records, ended `completed_with_access_boundary`, and passed
  synthesis without an error or further continuation. The product-interface
  receipt matched those counts and states; `reply_count_mismatches` was empty
  while `replies_reconciled` remained `false` at the declared access boundary.
- Limitation: search results are provider-dynamic and are not population
  incidence. The UI proof covers the deployed HRP `20.5.18` / Universal
  `20.5.12` protocol pair and does not establish a later published GPT revision
  or Custom GPT loading of the now-deployed Universal `20.5.13`.

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
- Product-interface protocol chunk reconciliation (2026-08-16): **PASS** —
  Universal `20.5.12` in 2/2 and HRP `20.5.18` in 11/11 with manifest, chunk,
  contiguous-range, total-byte, and whole-file hash equality. Current production
  directly passed Universal `20.5.13` in 3/3; its fresh UI receipt remains the
  exact sequence above.
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
