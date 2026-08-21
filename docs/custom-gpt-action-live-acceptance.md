# Custom GPT Action live acceptance

Status: **CURRENT RUNTIME AND PRIVACY SITE DEPLOYED; DIRECT ACCEPTANCE PASS;
EDITOR INSTALLATION OWNER-REPORTED; FRESH GPT-UI ACCEPTANCE PENDING**. PR #41 merged the
Gemini-compatible production reconciliation and transcript/evidence-frontier
release as `386497415a187354c6396e69a902d5bece9a9c96`. That exact revision is
active in production and passed the sanitized direct acceptance recorded
below. After reviewing the complete current Instructions, the owner reported
that they were already installed in the existing Custom GPT. This record does
not independently inspect editor state or claim that the refreshed GPT UI has
exercised them.

Historical direct and repaired Custom GPT UI evidence is retained below for
the earlier bridge releases. It does not substitute for a fresh UI run against
the current editor packet. Direct server proof is never relabeled as ChatGPT UI
proof.

The latest owner-provided GPT-UI result exposed a partial-answer escape,
umbrella-program conflation, and raw implementation labels. PR #44 merged the
reviewed instruction repair as
`b8e110404130d1d1e85d56112b837c499106086e`. Its generated Instructions are
7,962 characters with SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`;
its synchronization-ledger SHA-256 is
`a1e6e4390fb640a95ab01e51be9b3c70774368fa3208d65cc0723e1df4427ecc`.
The exact post-merge deterministic verification, workflow policy, and CodeQL
checks passed. The Action document is unchanged. Installation is owner-reported;
fresh UI acceptance remains unverified.

The direct acceptance cases below used only synthetic, non-personal inputs. The
owner-provided private product result is not reproduced; only its sanitized,
generalized product defects are recorded above. This record retains request
class, result, sanitized result, and limitation fields without raw protocol
text, provider bodies, comments, continuation tokens, credentials, private
issue content, or health details.

## Deployment identity

| Field | Value |
| --- | --- |
| UTC time | Production deployment and direct acceptance completed on `2026-08-21`; exact Instructions installation was owner-reported at `2026-08-21T15:20:33Z`; fresh GPT UI acceptance remains pending. |
| deployed commit | PR #41 merge `386497415a187354c6396e69a902d5bece9a9c96` (parents PR #40 merge `94062f8d5595ff8cef368f8c2b06732a4826ae57` and compatibility head `3ebfb5be67207dd04f9c70e6af340662c790c96c`). |
| deployed image | `askrigor-research:386497415a187354c6396e69a902d5bece9a9c96`; image ID `sha256:84fb1527d37f4003dc0f3670818c3d7f5987a1a1c53861fca236da1f8975db1e`; healthy container `c1dc68972ded`; only the research service changed during runtime activation. |
| current runtime configuration | `/opt/askrigor/compose.yaml` SHA-256 `ecfeaf12db7de685edc84d200485866a699f9a0f7df569e8bc4450bb4c77361c`; Caddy container `18209d960259`; runtime environment mode remained root-owned `0600` and its contents were not read. Request diagnostics remain disabled by default and were not enabled in production. |
| hardening | Runtime user `node`; read-only root filesystem; all Linux capabilities dropped; `no-new-privileges:true`; final container health `healthy`; loopback and public health both returned `200`; application log remained one startup-only line after acceptance. |
| rollback image/config | `askrigor-research:rollback-3864974-predeploy` preserves image ID `sha256:df01992c604e618af4e5f7df733a30759855da2c973c48ab2ebbd67e39f86452`; rollback Compose is `/opt/askrigor/releases/386497415a187354c6396e69a902d5bece9a9c96/compose.pre-3864974.yaml`, SHA-256 `5f3d6fb76174f0edb2dac290db9c64e153ae95cf8d6d5c2d30d9ca928a28f3af`. |
| deployment archive | Exact secret-free Git archive from the deployed merge: SHA-256 `61db400d75de3627fcaa77370eeed44a6a1c26033f6b292d04bf483401502fe0`; 377 members, 1,010,125 bytes. The image was built on the server from that verified archive; no image archive was created. |
| OpenAPI SHA-256 | Committed pretty artifact: `9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`; semantically identical compact live response: `368b0bb0c98a121a66cc64d46d7c391f83cfc28d56faa55f83596fa19015e9b9`. |
| instructions SHA-256 | Current generated editor source: `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`, 7,962 characters. The owner reports these exact displayed Instructions are installed; the editor was not independently inspected. Knowledge must remain empty. |
| current Action/MCP boundary | The Action exposes 18 non-consequential research reads plus the consequential lesson write. `get_youtube_transcript` is Action-only. Standard MCP and Gemini-compatible MCP each preserve the same exact 17 read-only handlers; Gemini uses the compact service name `askrigor_research`. |
| privacy URL/result | `https://askrigor.com/privacy` returned `200`, byte SHA-256 `229ea4e7a86efcfc005570666b1c2fbb2c8fefda8b1f2ca60ee7c802f9995abc`, with effective date `2026-08-21` and the disabled-by-default bounded diagnostic disclosure. Active site release: `/opt/askrigor/site/releases/386497415a18/site`. |
| direct GPT URL | `https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`; the public page returned `200` and identified **AskRigor.com Heterodox Research Protocol**. |

## Current direct production acceptance — 2026-08-21

- Standard MCP advertised service `askrigor-research`, the exact ordered 17-tool
  catalog and strict annotations, HRP `20.5.18`, and Universal `20.5.14` with
  their canonical hashes. Gemini MCP advertised `askrigor_research`, exposed
  the same 17 handlers in a 12,239-byte compatibility catalog, omitted the
  unsupported `outputSchema` and `execution` fields, and retained strict input
  rejection and exact protocol manifests.
- The Action document exposed the expected 19 ordered operation IDs. Strict
  transport checks returned `400` for malformed JSON, `422` for an unexpected
  transcript field, and non-retryable `413 action_body_too_large` for an
  8,193-byte request. The unauthenticated lesson route remained isolated at
  `401`.
- Complete Action reconstruction loaded HRP in 11 contiguous chunks totaling
  490,256 bytes and Universal in 3 contiguous chunks totaling 105,798 bytes;
  both whole-document hashes matched their manifests and integrity verification
  returned true. Protocol text was held only in process memory and was not
  printed or persisted in this receipt.
- The transcript adapter truthfully returned `not_found` for the selected hip
  candidates whose public captions were unavailable. A captioned public
  control completed at `api_visible_complete` with 61 timestamped English
  segments, exhausted pagination, and no continuation cursor. No transcript
  text was printed or retained.
- Bounded live Action probes passed PubMed, Europe PMC, ClinicalTrials.gov,
  DOI metadata, and YouTube video metadata with their declared access states.
  No raw provider body, comment, transcript, credential, or private lesson
  content was retained.
- Gemini CORS preflight returned `204` on both MCP paths; an untrusted origin
  returned `403`. A disposable exact-image burst produced 60 declared `406`
  responses and 20 declared `429` responses, with no undeclared status; health
  bypass remained `200`. The disposable container and script were removed.
- Final post-acceptance checks confirmed the exact image/container identity,
  hardening, active privacy release, public and loopback health `200`, one
  startup-only application log line, and no lingering test container or script.
- The four active public pages returned `200`: `/`
  `29790a12adbfaec6f59089292b94f2aa01cab2d828b739bc6e3b0a80a8ebbf65`,
  `/privacy`
  `229ea4e7a86efcfc005570666b1c2fbb2c8fefda8b1f2ca60ee7c802f9995abc`,
  `/terms`
  `3dc4e708cdf75bdb00fbb84bd9234cf46a855245a30c6aafa4b90e78650a890c`,
  and `/support`
  `3f263bf2ff279fd53584713ae054ec0a05557f0f808737b8c13dcab36d42f5be`.
  HTTP privacy redirected once with `308` to HTTPS, and the sampled HTTPS
  responses did not expose a `Server` header.

This is **DIRECT PASS — CURRENT GPT UI PENDING**. The owner reports the generated
Instructions are already saved in the signed-in Custom GPT editor. The remaining
acceptance is a fresh GPT UI run; historical UI passes below do not close that
boundary.

## Treatment-decision regressions and universal transcript candidate — 2026-08-18

A later fresh published-GPT run loaded and verified Universal and HRP, then
answered a treatment-alternatives question without executing PubMed, Europe
PMC, ClinicalTrials.gov, or the required Forum Signal YouTube survey/audits.
It nevertheless labeled the answer HRP-complete. A later audit correctly
identified the missing formal retrieval, missing community module, and failed
completion ledger, but that later work does not retroactively validate the
first answer.

The GPT separately attempted to submit the validated product failure as a
lesson, and the Action returned non-retryable `privacy_rejected`. That failed
candidate was not retried or resubmitted. The public receipt cannot identify
which fail-closed privacy stage rejected it, and no request body, raw prompt,
health topic, private model output, or lesson text is retained here.

A second fresh treatment-decision run did execute YouTube community work, but
it stayed anchored to the clinician-proposed celecoxib-to-surgery pathway. It
audited experiences with the named treatments without first discovering and
comparing the realistic treatment option space. The answer therefore failed
HRP's broad heterodox review purpose even though the Forum Signal module ran.

PR #36 merged, deployed, and was installed with empty Knowledge. A new broad
treatment-pathway acceptance then triggered Forum Signal and option-space work,
but exposed a deeper quality failure: four conventional/provider-ranked video
pools were treated as sufficient without a documented candidate comparison;
“exercise/PT” was not decomposed into the programs actually studied or claimed;
preoperative surgery-avoidance care was not separated from postoperative
rehabilitation; decisive arthroplasty trials were not bounded by their exact
comparators; and hydration/collagen signals received little structured
steelman analysis after exact matched studies were not located. The run's 1,179
retrieved and 418 analyzed records establish corpus work, not adequate discovery
or weighting.

PR #37 merged the complete first discovery/weighting candidate, after which the
owner supplied an installation receipt and a fresh initialization receipt
before returning another broad-pathway product
result. The editor does not independently expose an instruction digest, so this
remains an owner-provided product receipt rather than a host-verified hash. The
run selected only three community pools: generic conservative care
(`partial` / `completed_with_access_boundary`, 272 provider-reported and
retrieved records, 71 returned for analysis), general NSAID experience
(`api_visible_complete`, 197/197/110), and postoperative replacement mistakes
(`api_visible_complete`, 989/989/103). It omitted separate gelatin/collagen and
hydration discovery, did not locate program-matched preoperative PT videos, and
again collapsed materially different PT/exercise programs while labeling the
answer `HRP-complete`. Those exact retrieval counts prove tool execution, not
hypothesis coverage or a passing completion audit.

The local test-first repair separates two gates. Forum Signal now explicitly
applies to personal or practical treatment decisions even when alternatives
are unstated. Treatment endorsement, choice, or start/defer/sequence decisions independently
require an option-space ledger spanning proposed care, diagnosis alternatives,
nonaction/natural history, conventional nonsurgical care,
lifestyle/rehabilitation/mechanical approaches, relevant heterodox or adjunct
approaches, and procedural or surgical care; plausible classes must be
searched and exclusions justified. It blocks both an
`HRP-complete` label and the full-HRP opening until all formal retrieval
required by the applicability ledger and every required receipt pass. For the
Custom GPT, the Forum Signal gate is grounded in each selected video's
Action-returned `receipt.synthesis_lock: pass`, not a fabricated aggregate
Action field. The fixed privacy model receives one additional privacy-qualified
example explaining that an already-generalized protocol-execution lesson about
required modules, formal retrieval, completion receipts, or inaccurate
completion labels is safe only when it contains no private or identifying
material. Strict parsing, deterministic pre/post screening, exact metadata
preservation, `store:false`, and fail-closed uncertainty remain unchanged.

The static routing matrix has 15 required and 9 not-required Forum Signal
cases; the separate option-space matrix has 9 broad-review and 6 narrow-review
controls. The discovery/weighting matrix now has eight cases across broad,
bounded, narrow, and not-applicable review modes. A separate held-out synthetic
fixture uses an unrelated condition and makes popularity, cure-title clickbait,
generic terminology, and stage mismatch distractors; production instructions
contain none of its topic-specific answers.

The current universal repair treats cure/reversal/fixed phrasing as a discovery
hook rather than proof, fingerprints exact creator claims by program, stage,
outcome, and horizon, and requires creator transcripts before describing video
content. It audits comments separately for replication, failure, and harm, and
allows only exact, nonredundant, transcript-verified entries in **Videos worth
watching**, with a canonical timestamp link and reason to watch. Missing caption
access stays an explicit gap and cannot be replaced with title, description, or
comment inference.

The source candidate adds the Action-only `get_youtube_transcript` read with
bounded timestamped caption pages, language/automatic-caption provenance, and
literal access states. The selected caption track is `partial` until exhausted
and then `api_visible_complete`; that status does not cover unavailable,
deleted, private, or never-published caption material and does not establish
caption accuracy. The adapter uses an unofficial public YouTube interface, so
production availability remains unverified. The generated Instructions are
7,797 characters with SHA-256
`4b0d3382ee1f214a54c87e8c493d34b42e02467a66ee031f06fd33a2215b90bc`;
the generated OpenAPI SHA-256 is
`9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`.
The synchronization-ledger SHA-256 is
`1ca16c082fcfed4f1c90e919aa541827fe1ca8c37e7b1de5c4968cba96ad2f3e`.
The focused router/skill/matrix/packet/transcript/registry suite passed 53/53;
the complete Node `24.18.0` gate passed typecheck, 57 test files with one
declared credential-gated file skipped, 960 tests with five declared skips, and
build. Public-site validation covered four pages and the deployment suite passed
28/28. The exact candidate was subsequently merged, deployed, and directly
accepted as recorded above. Current Instructions installation is owner-reported;
fresh product-interface acceptance remains pending. Static repository tests and
direct server receipts do not establish GPT UI behavior.

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
and both YouTube audit paths. The repaired YouTube continuation and Universal
freshness passed through the product interface on 2026-08-17; the lesson shell
then failed safe before any consequential call and awaits hardened retesting.

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
`20.5.12`. The later product-interface freshness run recorded below loaded
canonical Universal `20.5.13`; the continuation receipt itself remains bounded
to the earlier protocol pair.

Lesson disposition: **transferable with bounded scope**. The evidence supports a
bounded warning about model-mediated relay of large opaque tool arguments, not
a rule that all continuations require server state. Direct programmatic MCP
clients are the explicit counterexample; any handle design must disclose its
privacy, restart, expiry, eviction, and horizontal-scaling limits. Promotion to
`universal-dev-architecture` is now eligible for an evidence-preserving owner
review; this project record does not claim that promotion already occurred.

## Universal freshness pass and lesson-shell safe failure — 2026-08-17

The next owner-provided Custom GPT output completed the exact Universal
freshness sequence. It returned version `20.5.13`, revision `2026-08-17`, and
SHA-256 `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`;
integrity was verified before loading. Three contiguous chunks covered exact
UTF-8 byte ranges `[0, 48000)`, `[48000, 96000)`, and `[96000, 98154)`.
Their SHA-256 digests were respectively
`12f461edfd56c9a58b780484f091502af0212e64175f847330b1ffbbaae07432`,
`ba39ff6311f038e3cea2c859a7e75b171e5cd8eb3021347ed3f4e32ddbd35eb3`, and
`d4483802a9dc3e928a0e9aefd3bb9cb4420ad9a10b033a564db98e571ac7b57a`.
Every chunk digest matched on re-retrieval, the total was 98,154 bytes, and the
terminal whole digest matched with `complete:true`.

The same run rechecked the entirely synthetic missing-source correction and
accepted it as a valid AskRigor failure. It then displayed the structured
candidate fields instead of the approved user-facing shell and incorrectly
claimed that canonical consent wording was unavailable from Universal and the
Action schema. The wording actually belongs to the Custom GPT Instructions.
The exact consent question and reply line did not appear, no authorized reply
was requested, and no lesson Action call occurred. No pending candidate or
standing consent is treated as established from that invalid presentation.

This is **GPT UI FAIL SAFE**: the consequential boundary held, but the
interaction contract failed. The compact generated Instructions were hardened
to include the complete shell verbatim, declare those Instructions as its
authority, forbid raw Action fields as a substitute, and require an exact
trimmed authorization before the call. The following fresh-chat retest records
that repaired interaction contract passing.

## Lesson authentication and public-content follow-up — 2026-08-17

The hardened Instructions were installed in a fresh chat. The complete consent
shell appeared, lowercase `yes` was correctly rejected, and exact `Yes` reached
ChatGPT's separate consequential confirmation. Two approved submissions then
returned `401 action_auth_required`; no lesson was submitted. The editor key
had not yet been applied to the existing imported Action. A production-internal
probe used the configured key only in memory and intentionally sent the wrong
content type; exact `415 action_json_content_type_required` proved the valid-key
path without creating a candidate or exposing the key. The private queue
remained 0 open, 0 needs review, 0 accepted not incorporated, 2 incorporated or
closed, and 0 deletion eligible.

After the owner applied the existing Bearer key to that Action, saving triggered
the builder warning `May provide tailored medical/health advice`. This is a
public-content eligibility boundary, not evidence that the lesson feature
caused medical advice or that server authentication failed. **Only me** is not
accepted as product completion. The new instruction candidate applies to the
public Custom GPT only: it retains general and subgroup evidence, treatment and
harm comparisons, mechanisms, guidelines, community reports, source
provenance, and clinician questions, while prohibiting individualized diagnosis
or treatment directives. It does not change the plugin, MCP server, canonical
protocols, or production tools. The owner subsequently reported successful
public publication after installing that instruction candidate. At that
checkpoint, the direct `/g/...` URL had not yet been captured or independently
verified; the 2026-08-18 routing acceptance below closes that gate.

## Published lesson privacy-filter repair and UI acceptance — 2026-08-17/18

In a new published-GPT chat, the complete consent shell appeared around the
fully generalized lesson that material factual claims need traceable supporting
sources. Exact `Yes` plus ChatGPT's consequential confirmation reached the
authenticated Action. The result was `privacy_rejected` with
`unsafe_candidate`, non-retryable; no lesson was submitted. A fresh private
queue check remained 0 open, 0 needs review, 0 accepted not incorporated, 2
incorporated or closed, and 0 deletion eligible.

The exact displayed lesson passes the deterministic privacy screen. The release
history already records a one-off model rejection of the existing safe
synthetic fixture followed by `safe:true` on an isolated identical-input check.
Official OpenAI documentation now marks the previously deployed fixed model
`gpt-5-nano-2025-08-07` deprecated. PR #32 pins
`gpt-5.4-nano-2026-03-17`, updates exact token-cost accounting and reasoning
syntax, and adds explicit privacy-only classification guidance without weakening
either deterministic screen or the fail-closed result contract. A non-stored,
GitHub-disconnected compatibility probe using only synthetic inputs returned
8/8 valid safe-case generalizations and 3/3 safely generalized-or-rejected
identifier cases with zero identifier leakage.

PR #32 merged exact repair head
`87433b8829da835f1e8c2b1bd5cd613ac14046b6` as
`d1af238325ee1e0584574e47bbcbe7764d17cf7e` after the pull-request and
post-merge deterministic, workflow-policy, and CodeQL checks passed. The first
transactional switch deliberately rolled back to the healthy prior image when
a post-check compared Docker's short Caddy ID with the recorded full ID. The
rollback restored the exact prior Compose hash, image, loopback/public health,
and full Caddy identity. Repeating the same exact image switch with a full-ID
comparison succeeded; only the research container was recreated.

Post-deployment checks passed the immutable image identity, loopback/public
health, unchanged 18-operation OpenAPI SHA-256, unauthenticated lesson `401`,
read-only root filesystem, dropped capabilities, no-new-privileges, exact state
mount, image-only Compose delta, unchanged Caddy identity, and exact 17-tool
ordered-name SHA-256
`5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
One exact-code, non-stored, GitHub-disconnected safe-candidate probe returned
`generalized`; its in-memory accounting was 348,500 nano-USD and did not touch
the production budget ledger. The private queue remained 0 open, 0 needs
review, 0 accepted not incorporated, 2 incorporated or closed, and 0 deletion
eligible. The published-GPT lesson and duplicate cases remain the only required
UI retest at that checkpoint.

On 2026-08-18, the owner ran the exact sequence below in a new published-GPT
chat. The complete canonical shell displayed before each consequential call.
Exact `Yes` plus ChatGPT's confirmation returned `Submitted successfully` with
candidate `ARL-0007`. An independent recheck reused the byte-identical displayed
candidate, required a new shell and exact consent, and returned the same
`ARL-0007` with occurrence count 2. A read-only aggregate check at
`2026-08-18T00:32:43.437Z` independently confirmed 1 open candidate, 1 needs
review, 0 accepted not incorporated, 2 incorporated or closed, and 0 deletion
eligible. The aggregate does not expose private issue content or independently
reconstruct the occurrence count; that count is retained only as the sanitized
owner-provided product receipt.

## Direct GPT URL and short-domain routing acceptance — 2026-08-18

The owner supplied the published direct URL
`https://chatgpt.com/g/g-6a64103633d8819187f57c7b2986e505-askrigor-com-heterodox-research-protocol`.
A read-only public request returned HTTP `200`, and the page identified
**AskRigor.com Heterodox Research Protocol**. This is direct URL reachability
and public-page identity evidence; the prior publication action remains an
owner-provided product receipt.

Before the routing change, `gpt.askrigor.com` used Porkbun URL forwarding and
returned HTTP `302` to
`https://chatgpt.com/share/6a641db3-2ab4-83ea-b48f-5393b1f2479f`.
That exact prior target is the rollback value. DNS remained the existing
`uixie.porkbun.com` forwarding topology; no AskRigor VPS, Caddy, production
container, Action, MCP, protocol, or privacy configuration changed.

After the destination was corrected, the accepted check at
`2026-08-18T01:34:40Z` observed both `http://gpt.askrigor.com` and
`https://gpt.askrigor.com` return one temporary HTTP `302` redirect whose exact
`Location` was the direct `/g/...` URL above. Following either route ended at
that exact URL with HTTP `200` and one redirect. The production health endpoint
also remained HTTP `200`. An intermediate destination containing one accidental
space failed validation with a `403`; it was corrected before acceptance and is
not the current route.

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

## Completed exact Custom GPT lesson UI sequence

With the privacy-model repair deployed, the published GPT Instructions remained
at exact `docs/custom-gpt-instructions.md`, Knowledge remained empty, and the
owner started a new chat without repeating the completed protocol-freshness or
YouTube tests. The exact first prompt was:

```text
Do not perform health research, provider searches, or lesson submission yet. Do not repeat the completed protocol-freshness or YouTube acceptance tests. Follow only any normal protocol loading your Instructions require for this new chat, without reporting it as a new acceptance result.

Recheck this entirely synthetic correction: “You made a material factual claim without showing any source. After rechecking, do you agree that this is a valid AskRigor failure?” If it is valid, display one generalized lesson sentence inside the complete canonical consent shell from your Custom GPT Instructions. The shell wording comes from those Instructions, not Universal, HRP, Knowledge, or the Action schema. Do not substitute a list of Action fields. Do not call submit_lesson_candidate until I reply with an authorized exact answer. Stop immediately after displaying the shell.
```

The exact lesson-consent shell appeared with no lesson Action call yet. The
owner then pasted exactly:

```text
Yes
```

After ChatGPT's separate consequential-Action confirmation, the Action returned
the truthful `submitted` receipt for `ARL-0007`. To exercise append-only
duplicate handling, the owner pasted:

```text
Independently recheck the identical synthetic failure again. If it remains eligible, reuse exactly the same previously displayed generalized candidate, display the full consent shell again, and do not call submit_lesson_candidate until I reply.
```

The exact shell appeared again; the owner pasted `Yes` and accepted the platform
confirmation. The Action returned the same candidate ID and incremented
occurrence count 2. Candidate text did not change, and neither consent nor the
platform confirmation was bypassed.

### Case 1 — Universal complete protocol loading

- Request class: manifest → integrity verification → ordered protocol chunks.
- Result: **DIRECT PASS — GPT UI PASS (2026-08-17)**.
- Protocol chunk coverage: 3/3 chunks, contiguous bytes `0..98154`, final
  `complete:true`, whole SHA-256
  `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`.
- Sanitized result: Universal `20.5.13`, revision `2026-08-17`; every chunk and
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
- Result: **DIRECT BACKEND PASS — GPT UI PASS (2026-08-18)**.
- Sanitized result: after `AskRigor-lessons` was made private, one server-held
  Bearer submission returned `200 submitted`, candidate `ARL-0006`, occurrence
  count 1, `retryable:false`. Private sanitization verified the fixed sections,
  metadata marker, privacy gate, and exact expected labels without recording
  the issue body. In the product run, the canonical consent shell did not
  appear: structured candidate fields were shown and the GPT incorrectly said
  the wording was unavailable. No authorized reply was requested and no lesson
  Action call occurred. A later pre-repair run passed the shell/authentication
  boundaries but failed closed at the old classifier. After PR #32 deployed, a
  new published-GPT chat displayed the exact shell, accepted exact `Yes` plus
  platform confirmation, and returned `Submitted successfully. Candidate ID:
  ARL-0007.`
- Limitation: the UI receipt is owner-provided sanitized evidence. The aggregate
  queue check independently confirms one open candidate awaiting review without
  exposing its private body.

### Case 10 — Append-only duplicate synthetic lesson

- Request class: consequential duplicate write.
- Result: **DIRECT BACKEND PASS — GPT UI PASS (2026-08-18)**.
- Sanitized result: the byte-identical synthetic input returned
  `200 existing_candidate`, the same `ARL-0006`, and occurrence count 2. The
  original issue-body SHA-256 remained
  `5a864c560a2389f3540ca49a8a0336c2bf4e58f0176f3176f913439d38f10c3a`;
  exactly one canonical count/timestamp comment was added and contained no
  repeated candidate text. In the published-GPT retest, the byte-identical
  displayed `ARL-0007` candidate required a second consent shell and platform
  confirmation, then returned `Recorded as another occurrence of the existing
  candidate ARL-0007. Occurrence count: 2.`
- Limitation: the private aggregate exposes queue state, not occurrence count;
  count 2 is evidenced by the sanitized owner-provided UI receipt.

### Case 11 — Lesson failure isolation

- Request class: induced consequential-write failure plus read-only probes.
- Result: **DIRECT PASS**.
- Sanitized result: while the queue was public, the App scope verifier failed
  closed as `503 github_unavailable/github_auth_unavailable`; no candidate was
  created. After the queue became private, unauthenticated submission returned
  `401 action_auth_required`; `/healthz` remained `200`, and `/mcp` still
  returned exactly 17 frozen tools with ordered-name JSON SHA-256
  `5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
- Limitation: these induced failures are server-boundary evidence; the separate
  successful lesson and duplicate cases above establish the product UI path.

## Post-test freeze check

- Post-test MCP inventory: **PASS** — exactly 17 tools; ordered-name JSON
  SHA-256 `5719a8539fbf75c8bb2db58fc5aa7849c8ed307216544c221ab602bf7b983b29`.
- Research Action operation count/security: **PASS** — 18 total operations,
  exactly 17 public non-consequential reads and one Bearer-authenticated
  consequential lesson write; all 18 declare the router-owned 500 response.
- Product-interface protocol chunk reconciliation (2026-08-16): **PASS** —
  Universal `20.5.12` in 2/2 and HRP `20.5.18` in 11/11 with manifest, chunk,
  contiguous-range, total-byte, and whole-file hash equality. The 2026-08-17
  UI freshness run also passed Universal `20.5.13` in 3/3 contiguous chunks and
  98,154 bytes with the exact manifest and whole-file digest.
- Lesson queue status and synthetic cleanup: **PASS** — `ARL-0006` was labeled
  `rejected`, removed from `needs-review`, received the explicit synthetic-only
  disposition, and closed `not_planned`; its body remained unchanged. Final
  queue status at `2026-08-17T03:13:06.118Z`: 0 open, 0 needs review, 0 accepted
  not incorporated, 2 incorporated or closed, 0 deletion eligible.
- Published lesson queue status: **PASS** — after the consented `ARL-0007`
  submission and duplicate, the read-only aggregate at
  `2026-08-18T00:32:43.437Z` reported 1 open, 1 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- Hosted privacy boundary: **PASS WITH DECLARED EXCEPTION** —
  `AskRigor-lessons` is private and the GitHub App is selected-repository only
  with `issues:write` and `metadata:read`. GitHub Free returned HTTP 403 for
  private-branch protection: `Upgrade to GitHub Pro or make this repository
  public to enable this feature.`
- Publish/repoint decision: **PASS** — publication is owner-reported; the direct
  `/g/...` page identity, reversible `gpt.askrigor.com` HTTP/HTTPS redirect, and
  final HTTP `200` response are independently verified above.

Architecture-lesson closeout: **project-specific / no new architecture
lesson**. This run reinforces the
already-promoted distinction between server, model, and product-interface proof
and the existing fail-closed private-queue boundary. The missing full shell was
a Custom GPT packet defect now covered by a generated-instruction regression;
current universal guidance already requires explicit instruction authority and
representative final-output testing. It does not create a new transferable
architecture rule.
