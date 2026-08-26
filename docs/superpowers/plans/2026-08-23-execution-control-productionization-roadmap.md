# AskRigor execution-control productionization roadmap

**Status:** Active. Phases A through J are merged. Phase H landed as
`8c292a4`, Phase I as `cc78d49`, and Phase J as `af8d96e`. Phase K is active;
its discovery-resilience repair is locally verified on
`agent/phase-k-discovery-resilience-20260826` and still requires reviewed
merge, exact deployment, direct controlled replay, and fresh signed-in product
acceptance. This document does not replace the complete canonical protocols or the
owner-approved scientific corrections in
`2026-08-23-executable-research-orchestrator-and-study-audit.md`.

**Audited baseline:** `main` at `795f1bc3aa1dc39676b8d03c8c564da32b0f6c7c` on 2026-08-23.

## Goal

Make it increasingly impossible for an AskRigor execution client to skip required research and still reach a completed comparative synthesis.

The governing architectural rule is:

> Models may route, reason, select, audit, and execute bounded research work. Only the AskRigor server-owned controller may advance authoritative execution state or permit finalization.

Hermes, Codex, Custom GPT, n8n, Gemini, or a future AskRigor UI are clients/workers. They never become protocol or completion authority.

## Audit reconciliation: what already exists

Do **not** build a second execution controller from scratch. The current repository already contains substantial pieces of the target architecture.

### Already implemented

1. The owner-approved architecture plan already calls for a server-owned resumable research session with `start`, `continue`, `status`, and `finalize` semantics.
2. `research-session-prototype-route.ts` implements a non-production server-owned session prototype. It:
   - binds the session to exact HRP and Universal protocol identities;
   - rejects caller-authored completion fields through strict schemas;
   - executes one bounded automated Gemini/YouTube scouting step;
   - records server-derived progress;
   - refuses finalization while required work remains;
   - blocks honestly if the scout is unavailable rather than substituting a manual packet.
3. `research-session-store.ts` supplies bounded ephemeral server-held state, opaque random session IDs, TTL/capacity limits, and claim/replace/rollback semantics.
4. `research-session-prototype.test.ts` proves the current prototype owns the initial state, rejects caller completion assertions, executes the scout step, blocks when the scout is unavailable, and refuses premature finalization.
5. `assess_treatment_landscape_coverage` already derives selection, depth, and synthesis locks plus `continue_research`, `bounded_nonranking_only`, and synthesis-eligible boundaries from receipt-linked ledger state.
6. YouTube transcript/discussion continuations already use server-owned/opaque continuation machinery and server-produced coverage receipts.
7. Open full-text acquisition, contiguous document handles, study/review method-audit receipts, and source-block identity checks are already implemented and deployed.
8. Study-method receipts prove document identity, block linkage, checklist coverage, and bounded claim capability/non-capability structure. They explicitly do **not** claim semantic correctness merely because the schema passed.
9. The current study audit already contains the domain `replication_contradiction_and_evidence_ancestry`; the predecessor plan identifies replication/evidence-ancestry records as unfinished work.
10. Current production has 21 MCP tools and 26 public Actions after the
    automated Gemini scout release. The research-session prototype remains
    deliberately **outside** the production inventory.

### Important remaining gaps

1. The session prototype automates only the scout step. Candidate screening, transcript acquisition, discussion audit, formal search, full-text acquisition, method audit, post-publication/external evidence audit, bidirectional return, and landscape finalization remain listed work rather than controller-owned transitions.
2. The session is broad-treatment oriented and does not yet encode the complete top-level routing vocabulary: `HRP`, `DIRECT_HUMAN`, `EXTENDED_GREY`, `FORUM_SIGNAL`, `BIDIRECTIONAL_ITERATION`, `FINAL_COMPLETION_AUDIT`.
3. The prototype has `in_progress`/`blocked` and always sets `synthesis_permitted=false`; it has no implemented successful finalization state yet.
4. The prototype binds protocol identities at start but must re-check current protocol identities before authoritative continuation/finalization so protocol drift cannot silently remain current.
5. The ephemeral store is process-local and one-hour TTL. It does not survive restart/deployment and is not yet suitable as a long-running external-orchestration checkpoint.
6. The current session state contains the raw `research_target`. Before adding persistence or external workflow storage, privacy boundaries must be re-reviewed. Do not push raw private research content into n8n, Hermes memory, logs, diagnostics, or a durable database by accident.
7. Existing treatment coverage validates a caller-assembled ledger. Its deterministic logic should be reused inside the session, but the session must increasingly generate/reconcile that ledger from actual operation results rather than trust caller counts or completion flags.
8. Method-audit submissions still contain semantic judgments produced by a worker/model. The server validates source identity, source-block links, required domains, and structure, but semantic correctness remains reviewable model work. Do not mislabel structural validation as truth.
9. Crossref already detects publication updates/retractions, but the normalized model does not yet preserve the complete ordered publication-integrity event history required by this roadmap.
10. No controller-owned FORRT FReD/FLoRA replication lookup, PubPeer integration, Epistemonikos ancestry lookup, Scite enrichment, or local Retraction Watch snapshot is currently part of session completion.
11. No Hermes or n8n integration currently exists. Adding either before completing the server control boundary would merely automate the existing enforcement gap.
12. No generic cross-project execution-control package should be extracted yet. Prove the pattern in AskRigor first.

## Non-negotiable invariants

These apply throughout every phase.

1. Current explicit owner requirements and complete canonical protocol bytes remain the highest project authorities according to `AGENTS.md`.
2. A client may never satisfy a required module with a caller-authored Boolean, count, status label, renamed identifier, or prose assertion.
3. Requirement applicability is monotonic within an execution: where canonical routing says `REQUIRED`, a later client claim cannot turn it into `NOT_REQUIRED`. New evidence may add requirements. It cannot silently remove an already-triggered one.
4. Completion is receipt/state based. Strong evidence in one layer cannot silently deselect another required layer.
5. Server-owned deterministic results should be ingested directly from the operation that produced them whenever technically possible.
6. Semantic model work must be bounded to a declared work package and then checked against deterministic identity/provenance contracts before it can advance state.
7. Retryable executable work remains executable. A client cannot call it terminal merely because it would prefer to stop.
8. A genuine terminal access boundary may authorize only the protocol-defined bounded output. It cannot be relabeled as complete comparative evidence.
9. Protocol drift must fail closed for authoritative finalization until the execution is explicitly revalidated or restarted under current bytes.
10. No single universal study-quality/reliability score may collapse publication status, post-publication criticism, replication, citation context, reporting transparency, risk of bias, applicability, or full-text access.
11. A provider no-match is provider-scoped only. It is never proof that no concern, replication, review, contradiction, or discussion exists elsewhere.
12. Comment quantity is not severity; provider-reported replication outcomes are leads until the linked work is inspected; corrections are not retractions; retraction does not itself prove misconduct or that every claim is false.
13. External provider records can create new work and constrain claims, but cannot substitute for inspection of the original/linked full text when decision-important.
14. Ordinary user-facing output remains plain language; internal state names, locks, receipt schemas, and orchestrator jargon are technical-audit material only.
15. Do not broaden the 21-tool MCP catalog, public Action inventory, privacy map, data retention, paid-provider footprint, or production write capability without the relevant reviewed phase and owner gate.
16. Do not replace deterministic system behavior with Hermes/n8n prompts where code can own the invariant.

## Target execution model

The completed controller should distinguish at least these authoritative output boundaries:

- `CONTINUE_RESEARCH`: executable required work remains.
- `BOUNDED_NONRANKING_ONLY`: only terminal protocol-recognized access boundaries prevent completion; a bounded answer may describe inspected evidence and limitations but cannot provide the blocked comparison/ranking/verdict.
- `FINALIZATION_ALLOWED`: every required executable gate has passed and the server may issue a compact finalization permit/report package.

These names may be normalized to existing repository terminology during implementation, but there must be one canonical machine representation, not parallel synonyms across clients.

A successful finalization artifact should be server-generated and integrity-bound. Prefer an opaque server-held permit or a compact signed permit containing only an execution identifier, protocol identities, state/receipt digest, permitted boundary, issue/expiry metadata, and domain separation. Never put raw user prompts, medical details, transcript text, unrestricted provider output, credentials, or private research prose in a portable token.

## Controller-owned external study evidence audit

Every decision-important scientific study, after exact identity resolution and full-text/method-audit handling, must pass through one controller-owned composite operation:

`external_study_evidence_audit`

Do not expose five independent provider tools and instruct a model to remember to call them. The server-owned research session schedules the composite operation, executes mandatory/configured providers, issues a server-owned receipt, derives new linked-source work or claim restrictions, and feeds those results back into finalization.

Canonical sequence for a decision-important study:

1. Resolve exact study/version identity.
2. Acquire accessible full text or record the claim-local access boundary.
3. Complete the existing study/review method audit against exact content identity.
4. Run mandatory external providers.
5. Run configured optional providers.
6. Derive controller directives and claim-local limitations.
7. Queue linked replications, reproductions, reviews, notices, comments, or citation contexts that could change a decision.
8. Acquire/audit every potentially decision-changing linked source that is executable.
9. Recalculate what the original study can and cannot support.
10. Mark the external evidence operation complete/partial/bounded from server-owned state only.

The caller may never submit `pubpeer_checked`, `replications_checked`, `no_concerns_found`, `external_audit_complete`, provider counts, or equivalent completion assertions.

### Provider roles for the first releases

**Crossref + Retraction Watch metadata**

- Mandatory integrity attempt for every decision-important DOI.
- Extend the existing Crossref adapter rather than creating a competing retraction adapter.
- Preserve a complete ordered event history: retraction, withdrawal, expression of concern, correction, update, reinstatement, other.
- Preserve publisher vs Retraction Watch assertion/source, relation direction, notice/original DOI, raw type/label, date, and provider record ID when present.
- Derive current publication-record state without using misleading labels such as `clean`, `valid`, or `unretracted`; `no_update_marker_found` means only that the checked source exposed no marker.
- De-duplicate duplicate assertions without destroying source provenance.

**FORRT FReD/FLoRA**

- Mandatory DOI lookup for every exact decision-important DOI in the initial open core, with provider coverage limits disclosed.
- Use the official DOI lookup adapter, bounded input, canonical DOI normalization, strict allowlisting, no caller-supplied base URL, and normalized relationship records.
- Preserve replication vs reproduction and `provider_reported` outcomes (`successful`, `failed`, `mixed`, `unclear`, `not_reported`).
- A relationship that could change confidence/ranking/conclusion creates `require_linked_replication_acquisition`; the provider label itself never closes the evidential question.
- No match means only `no_match_in_provider`.

**PubPeer**

- Define the adapter contract/fixtures, but keep live activation disabled until an authorized API key, official base URL/authentication/pagination/rate-limit contract, caching/redistribution/deletion/edit rules, and attribution requirements are known.
- Do not scrape PubPeer pages/search results/browser feeds.
- Preserve comments and identified author replies separately; a reply does not automatically resolve a concern.
- Store only bounded excerpts when permitted; full authorized responses belong in an evidence artifact store, not session state.
- Image/data/code allegations remain unresolved until the exact referenced artifact can be lawfully inspected.

**Epistemonikos**

- Optional/configured health-research evidence-ancestry provider.
- Use to find systematic reviews, study threads, relations, and evidence matrices; never treat review inclusion as study approval.
- Preserve machine vs human-validated classification status.
- Any decision-important review discovered becomes review acquisition + full-text review audit + family de-duplication + claim-entailment work.
- Production activation requires a bounded current live smoke and current terms/authentication confirmation.

**Scite**

- Defer from the core release. Treat as optional enrichment even when configured unless later protocol makes a particular citation-context check mandatory.
- Activate only with approved organizational server-side API, machine-to-machine credential, or tenant-aware per-user OAuth with secure token isolation.
- Supporting/contrasting/mentioning classifications are citation-context labels, not replication outcomes.
- Material contexts must lead to citing-source inspection before evidential use.

**Cochrane/review risk-of-bias import**

- Source-triggered, not a universal provider lookup.
- Import only when AskRigor has actually inspected the review and can bind the judgment to the exact study/result/comparison/outcome/numerical result/follow-up/domain/support/source location.
- Never transfer one outcome-specific judgment to the whole study.

**Ripeta**

- Do not implement initially. Reconsider only after current commercial integration documentation, pricing, data-use rights, and exact field definitions are available.
- AskRigor's own method audit already covers much of the relevant reporting/reproducibility hygiene.

### Canonical external evidence contract

Add a strict Zod contract under `packages/contracts/src/study-external-evidence.ts`, exported through the contracts package. The exact TypeScript syntax may follow repository conventions, but preserve these semantics:

- canonical study identity with DOI/PMID/PMCID/arXiv/title/first author/year, identity status/basis/hash;
- provider attempts with provider, checked time, access/outcome, query identifier, provider response hash/snapshot ID, coverage statement, limitations, error/retryability;
- publication integrity events with event kind/date/original + notice DOI/provider/source/record ID/relation direction/raw type/label/reasons/hash;
- replication/reproduction relationships with original/repetition identities, provider-reported outcome, implementation-match audit status, linked-source audit status, limitations, relation hash;
- post-publication threads/messages with comment/identified-author role, timestamps, hashes/bounded excerpts, audit status/materiality, links, limitations;
- citation-context aggregates with explicit provider-model statement and audit status;
- review ancestry links and result-specific imported risk-of-bias judgments;
- controller directives;
- unresolved items and claim-local limitations;
- deterministic bundle hash.

Raw provider fields must be normalized into strict AskRigor schemas before they can influence controller state.

### Server-issued external evidence receipt

The composite coordinator should issue a server-generated receipt bound to at least:

- receipt name/version and domain separation;
- session ID;
- exact canonical study identity hash;
- exact HRP/Universal protocol hashes;
- provider-attempt records;
- provider response/artifact hashes;
- normalized bundle hash;
- issue time and signing key ID.

Use the repository's established signing primitive if an appropriate one exists by implementation time; otherwise HMAC-SHA256 with a server-held secret of at least 32 random bytes is acceptable. Add only placeholder configuration, never a real secret. A receipt from another DOI/version/session/protocol/provider snapshot must not satisfy the current study.

The external evidence receipt is an integrity/provenance/completion receipt, not semantic proof that every concern or replication interpretation is correct.

### Identity and version rules

The external audit must never run on a guessed identity. Canonicalize supplied DOI forms, verify against Crossref, reconcile PubMed identifiers when available, preserve PMCID/arXiv/trial identifiers separately, compare title/author/year against acquired full text, hash the canonical identity, and stop at `ambiguous`/`unresolved` when candidates conflict.

Do not transfer PubPeer/retraction/replication/review records between a preprint and journal article solely because titles look similar. Link versions explicitly and audit the relationship.

### Study-method audit integration

The existing `replication_contradiction_and_evidence_ancestry` domain must support typed external evidence references without inventing fake `jats_*`/`pdf_*` block IDs.

A compatibility-preserving design may keep `evidence_block_ids` and add strict external references containing at least external receipt hash, provider, and item hash. Other method-audit domains retain their existing document-block requirements. Bind the resulting method-audit receipt to the relevant external-evidence receipt/identity hash so a changed publication version/provider snapshot cannot silently reuse an old ancestry finding.

### Session state additions

The authoritative session should eventually represent, per decision-important study:

- canonical identity hash/status;
- full-text state;
- method-audit state;
- `external_evidence_status` (`not_started`, `in_progress`, `complete`, `partial`, `blocked` or normalized equivalent);
- external evidence receipt hash;
- linked source IDs;
- unresolved external items;
- possible decision impact (`detail_only`, `confidence_changing`, `ranking_changing`, `potentially_conclusion_changing`, `unknown`).

Add controller work capabilities equivalent to:

- `external_study_evidence_audit`;
- `linked_replication_and_review_audit`.

Do not store one global Boolean for the whole research run.

### Mandatory/configured provider semantics

For the first production-capable release:

- Crossref integrity: mandatory attempt for each decision-important DOI.
- FORRT: mandatory attempt for each decision-important DOI.
- Retraction Watch local verified snapshot: optional until separately deployed/accepted; once enabled by policy/configuration, skipping it is an execution failure.
- PubPeer: mandatory attempt only when the authorized integration is configured.
- Epistemonikos: mandatory attempt for applicable health-research studies only when configured.
- Scite: optional enrichment unless later policy makes a context check decision-important.
- result-specific review risk-of-bias import: source-triggered.
- Ripeta: absent initially.

A configured provider that is skipped is an execution failure. An unconfigured optional provider is an explicit coverage limitation. Retryable outages remain retryable; after bounded retry exhaustion, missing information is claim-local unless its plausible impact is ranking/conclusion changing, in which case full finalization remains blocked/bounded.

### Controller directives/effects

At minimum support machine directives equivalent to:

- `exclude_source_from_effect_claims`;
- `require_update_notice_audit`;
- `invalidate_prior_source_audit`;
- `require_linked_replication_acquisition`;
- `require_postpublication_message_audit`;
- `require_review_acquisition`;
- `disclose_provider_coverage_gap`;
- `no_additional_work`.

Active retraction/withdrawal excludes the source from ordinary effect claims and requires notice audit. Expression of concern requires notice audit, serious unresolved-record disclosure, and prevents sole/decisive use. Correction requires notice/version comparison and prior-audit invalidation when affected content changes. Reinstatement preserves the historical event and requires reinstatement-notice inspection before normal claim capability returns. Material PubPeer concerns create message/artifact audit work. Known replications/reproductions create linked-source audit work when decision-material. Review ancestry creates review-audit work when it could reveal studies, conflicts, or result-specific bias judgments.

### External evidence finalization requirement

A decision-important study may contribute normally only when server-owned state shows, as applicable:

- identity verified;
- accessible full-text chain exhausted or an explicit claim-local boundary recorded;
- method audit exists or permitted access boundary is recorded;
- Crossref integrity attempt completed;
- FORRT attempt completed;
- every configured mandatory provider attempted;
- external evidence receipt matches current study/session/protocol/provider state;
- every potentially decision-changing linked item was audited or explicitly preserved as a claim-local unresolved limitation.

Finalization tests must fail for skipped external work, forged provider-completion fields, cross-study/session/protocol receipts, corrections newer than audited content, retracted studies used as ordinary effect evidence, omitted expressions of concern, unaudited provider-reported replication outcomes used as conclusions, comment counts converted to severity, no-match converted to no-concern, Scite counts converted to replication, globalized outcome-specific risk-of-bias judgments, or silently omitted unavailable-provider limitations.

### Evidence artifact storage boundary

Introduce a content-addressed `EvidenceArtifactStore` abstraction so raw authorized provider responses, correction notices, PubPeer messages, or citation contexts do not inflate the research-session object. Session state should hold only artifact IDs/hashes, normalized item hashes, provider statuses, directives, limitations, and bounded provenance.

Tests may use an in-memory store immediately. **Do not activate new durable production storage in this phase.** A persistent volume/object store, retention schedule, backups, encryption model, or new external service remains part of Phase G and its privacy/owner gate.

### Provider configuration and HTTP security

Configuration must fail closed. Do not permit environment-defined arbitrary provider URLs.

Core provider host activation may add only the exact FORRT host after the adapter contract is verified. PubPeer/Epistemonikos/Scite hosts are added only when those integrations are officially activated and their current contracts are confirmed.

Preserve HTTPS-only transport, no URL credentials, strict hostname allowlist, byte/time bounds, bounded retry, redirect restrictions appropriate to JSON APIs, strict parsing, provider-specific error normalization, and secret/log redaction.

Never log API/OAuth/refresh tokens, full PubPeer discussions, private session handles, signing secrets, unredacted authorization headers, or raw sensitive research targets. Provider queries should use only the minimum public identifiers required.

### Licensing/attribution

Technical receipts/data-source documentation must preserve provider attribution, retrieval time, relevant source/record/snapshot identifiers, and license/usage constraints. Do not cache or redistribute provider content beyond current terms. FLoRA-derived records retain required attribution. PubPeer edits/deletions and canonical thread linkage must be preserved when activation becomes authorized.

## Stepwise roadmap

Each numbered phase is a separate reviewed PR unless an implementation plan shows that two adjacent phases are inseparable. Re-read current `main` before every phase. Do not continue from stale chat assumptions.

### Phase A — Reconcile and harden the existing prototype core

**Purpose:** turn the current feasibility prototype into a reusable controller core without exposing it to production clients yet.

Tasks:

- [x] Refactor session state/transition logic out of the Action prototype so transport is not the source of truth.
- [x] Add explicit controller schemas for module applicability/status covering `HRP`, `DIRECT_HUMAN`, `EXTENDED_GREY`, `FORUM_SIGNAL`, `BIDIRECTIONAL_ITERATION`, and `FINAL_COMPLETION_AUDIT` where current canonical protocols allow deterministic representation.
- [x] Preserve uncertainty/fail-closed behavior from the project router. Do not invent a new applicability policy.
- [x] Add canonical `required_next_capabilities` (or equivalent) derived directly from state conditions, not by parsing human blocker strings.
- [x] Re-check current HRP/Universal manifests before authoritative continuation and finalization. Add explicit protocol-drift state and tests.
- [x] Define one canonical output-boundary enum matching the three semantics above and map existing treatment-landscape boundaries into it without weakening them.
- [x] Define the finalization-permit contract but keep successful permit issuance unreachable until later phases wire all required gates.
- [x] Keep the prototype outside the production Action inventory.

Required hostile tests:

- [x] `REQUIRED -> NOT_REQUIRED` caller demotion fails.
- [x] caller-authored `complete`, `synthesis_permitted`, counts, or completed-operation arrays cannot advance state.
- [x] current-protocol drift prevents finalization.
- [x] stale/unknown session cannot advance.
- [x] a treatment-landscape `continue_research` state maps only to continued work.
- [x] `bounded_nonranking_only` cannot become full synthesis.
- [x] removal of each major completion condition causes a mutation/regression failure.

**Exit gate:** a pure/controller-level test can simulate early synthesis, deny it, advance only through valid server-derived state, and still cannot reach success because downstream phases are intentionally unfinished.

Phase A verification: the pure controller and prototype hostile suites pass
12/12; the complete host-boundary deterministic suite passes 1,146 tests with
six declared skips, and the full verification gate passes typechecking and the
production build. The public inventory remains 21 MCP tools and 26 Actions.

### Phase B — Make discovery and candidate state server-derived

**Purpose:** stop asking a client to reconstruct the candidate frontier and program inventory from memory.

Tasks:

- [x] Integrate automated Gemini scout output and native candidate discovery into session-owned frontier records.
- [x] Independently validate all external-scout public identities before they enter decision-relevant state.
- [x] Represent every candidate with stable source identity, discovery origin/query, target/stage distance, provisional program fields, materiality/redundancy state, and access status.
- [x] Reuse normalized program-signature logic from treatment-landscape coverage.
- [x] Preserve `program not described` instead of worker invention.
- [x] Reconcile native and external scout frontiers rather than treating either as globally sufficient.
- [x] Derive next capabilities for additional discovery, screening, or source acquisition.
- [x] Keep raw quota counts as undercoverage diagnostics, not success criteria.

**Exit gate:** forged candidate counts, duplicate renamed programs, missing reciprocal frontier links, unresolved validated scout identities, or skipped required scout work cannot advance the session.

Phase B verification: exact Gemini packets enter the session only alongside the
existing independently produced YouTube validation receipt and verified
frontier digest. A second native YouTube discovery transition is mandatory;
the two frontiers are reconciled by stable video identity with exact reciprocal
query/origin links. Hostile tests reject count/list injection, one-way links,
skipped discovery, unresolved identities, and multiple “distinct” candidates
with the same normalized described program. Counts are projected diagnostics
only. The focused controller/frontier/prototype and public-inventory suite
passes 27/27; `npm run verify` passes typechecking, 1,152 tests with six
declared skips, and the production build.

### Phase C — Make transcript and community-depth work controller-owned

**Purpose:** make actual retrieval depth and continuation state determine progress.

Tasks:

- [x] Wire selected candidate identities to `get_youtube_video`/transcript retrieval and existing server-produced transcript receipts.
- [x] Continue transcript handles until exhaustion or a valid boundary; never accept caller-reconstructed pagination.
- [x] Wire selected discussions to `audit_youtube_video_community` and its server-produced receipt.
- [x] Continue automatically while `continuation_recommended=true` unless a genuine nonretryable boundary applies.
- [x] Store only the bounded provenance/receipt facts required for execution control; do not turn the session store into a raw transcript/comment archive.
- [x] Derive per-video work packages and next capabilities from receipt state.

**Exit gate:** skipped/restarted/mixed chains, retryable failures, one-of-many audited discussions, transcript-free creator claims, or caller-reported exhaustion cannot satisfy depth requirements.

Phase C verification: semantic candidate selection is accepted only for one
exact server-packaged discovery digest and every packaged public identity;
structural validation binds the worker decision to that package without
claiming the semantic judgment is automatically true. Selected identities
initialize exact transcript and discussion records. The controller derives
first-page and continuation Action inputs, follows only short server-issued
handles automatically, preserves retryable and terminal boundaries, and
requires every selected video to finish independently. State retains bounded
public identity, receipt, count/hash, attempt, and opaque-handle facts only;
transcript segments and comment records are not stored. Hostile tests reject
wrong-video receipts, skipped/replayed/decreasing or mixed chains, caller
cursor/count/exhaustion injection, stale evidence after restart, one-of-many
completion, missing transcript timestamps, and blocked discussion synthesis
locks. The focused controller/frontier/prototype suite passes 27/27 and the
complete host-boundary deterministic suite passes 1,161 tests with six
declared skips. Public inventory remains 21 MCP tools and 26 Actions; the
prototype remains unregistered.

### Phase D — Make formal search, full text, method audit, and external study evidence session-owned

**Purpose:** connect the already-deployed full-text/method-audit machinery and the new post-publication/replication evidence workstream to execution state.

Phase D is intentionally split into reviewed sub-PRs so the open-core provider work can land without forcing credentialed/commercial integrations or durable storage.

#### Phase D1 — External evidence contracts + open providers

- [x] Create/export the strict external-study-evidence contracts described above.
- [x] Extend the existing Crossref adapter to preserve complete ordered publication-integrity events while keeping existing callers/backward-compatible retraction checks working.
- [x] Add the FORRT FReD/FLoRA DOI adapter with bounded fixtures/tests and the exact approved host allowlist addition.
- [x] Preserve provider no-match/partial/rate-limit/error semantics and provider-reported replication labels.
- [x] Add deterministic fixtures for retraction, withdrawal, correction, expression of concern, reinstatement, duplicate assertions, reverse replication links, reproductions, malformed data, provider failure/rate limiting, and no match.
- [x] No public Action/MCP change; no canonical protocol change.

**D1 gate:** richer Crossref integrity events and FORRT relationships are normalized, hermetically tested, and cannot be mistaken for global truth/quality/replication verdicts.

Phase D1 candidate verification on `agent/execution-control-phase-d1-20260824`
passed the 74-test focused contracts/Crossref/FORRT/HTTP suite, the complete
1,186-test deterministic suite with six declared skips, and `npm run verify`
(typecheck, the same complete suite, and production build). The exact FORRT
production hostname is the only provider allowlist addition. Public inventories
remain 21 MCP tools and 26 Actions; protocol bytes and generated product
artifacts are unchanged. Reviewed merge remains required before Phase D2.

#### Phase D2 — Composite coordinator + receipt + typed audit references

- [x] Add internal `external_study_evidence_audit` coordinator; it calls providers itself and accepts no caller completion booleans/counts.
- [x] Add deterministic normalized bundle hashing, controller directives, unresolved/claim-local limitations, and server-issued study-external-evidence receipt.
- [x] Bind receipt to session, exact study identity, exact protocol hashes, provider attempts/response hashes, bundle hash, issue time, and key ID.
- [x] Add typed external evidence references to the existing replication/evidence-ancestry method-audit domain without fake document block IDs.
- [x] Preserve all existing document-block validation for other domains.
- [x] Define `EvidenceArtifactStore` abstraction + in-memory tests, but do not activate durable production persistence.
- [x] Add placeholder receipt-secret/key-ID configuration only; never expose secret material.
- [x] No public Action/MCP change.

**D2 gate:** tampered/cross-study/cross-session/cross-protocol receipts fail, and structural receipt validation is not mislabeled semantic truth.

Phase D2 candidate verification on `agent/execution-control-phase-d2-20260824`
passed the 81-test focused artifact/coordinator/provider/method-audit suite and
the 104-test public-schema/inventory regression suite. The complete host-
boundary deterministic suite passed 1,205 tests with six declared skips;
`npm run verify` passed typechecking, the same complete suite, and the
production build. The internal HMAC receipt is bound to exact session, study,
protocol, provider attempts/artifacts, bundle, issue time, and key ID; hostile
tests reject tampering and mixed contexts. The public method-audit schema,
21-tool MCP catalog, and 26-Action document remain unchanged. No session
integration, durable store, new host, public operation, production setting, or
deployment was added. Reviewed merge remains required before Phase D3.

#### Phase D3 — Session enforcement + formal/full-text integration

- [x] Generate formal-search records for every material program/outcome hypothesis requiring follow-up.
- [x] Track exact DOI/source/version identity and access attempts.
- [x] Invoke/exhaust existing open-full-text acquisition for decision-important accessible DOIs; keep inaccessible/unverified sources as claim-local leads.
- [x] Bind existing study/review audit submissions to exact content identity/hash.
- [x] Add per-study external-evidence state/work capabilities and automatic scheduling after method audit.
- [x] Queue decision-changing linked replications/reviews/notices/comments and require executable linked-source audit before unrestricted use.
- [x] Recalculate claim capability/non-capability after external evidence changes.
- [x] Add mutation tests proving skipped external work, forged provider completion, hidden retraction/provider failure, mixed receipts, or unaudited replication labels cannot unlock finalization.

**D3 gate:** an abstract-only trial, unexhausted full text, unknown source block, identity mismatch, missing required audit domain, unseen inaccessible paper, missing mandatory provider attempt, or unresolved decision-changing linked source cannot authorize unrestricted decision-important use.

Phase D3 candidate verification on
`agent/execution-control-phase-d3-20260824` connects the existing internal
research session to exact program-derived PubMed/Europe PMC searches, lawful
open-full-text continuation, study/review/notice method audits, the signed
Crossref/FORRT coordinator, linked-source execution, and externally bound
claim-capability recalculation. The session retains compact source identities,
hashes, handles, attempts, statuses, and work packages rather than article
text or provider bodies. Terminal provider/search/source boundaries remain
visible and claim-local while unrelated executable work continues.

Hostile tests reject omitted formal hypotheses and provider identities,
unexhausted or mixed full-text chains, forged source blocks, cross-protocol or
tampered external receipts, omitted mandatory provider attempts, hidden
provider boundaries, skipped external coverage, unaudited provider-reported
replication labels, and stale claim recalculation. New linked evidence may
reopen completed downstream gates only through server-derived source state.
Clean provider results still require an external-receipt-bound method audit;
partial provider coverage cannot become unrestricted use. Focused verification
passes 112 tests. The complete host-boundary deterministic suite passes 1,215
tests with six declared skips, and `npm run verify` passes typechecking, that
same suite, and the production build. Hosted CI passed on PR #74, merged as
exact commit `4bb6203951d9bf0f5ef701c7bdca7645ab8134d7`. Public
MCP/Action inventory, canonical protocol bytes, deployment, provider
configuration, and durable retention remain unchanged.

#### Phase D4 — Retraction Watch verified local snapshot

- [x] Implement only after the open-core lookup/coordinator is stable.
- [x] Add a controlled sync command using the official source, recording exact source commit/file hash/header schema/row count/sync time.
- [x] Parse with standards-compliant CSV handling; reject malformed/duplicate headers; build compact DOI/PMID indexes; atomic replace; verified rollback/stale-snapshot behavior.
- [x] Runtime consumes only verified local snapshot + manifest.
- [x] Do not dynamically fetch the dataset inside a user request and do not widen ordinary upstream allowlists for the snapshot source.

Phase D4 candidate verification on
`agent/execution-control-phase-d4-20260824` adds a fixed Crossref-GitLab sync,
exact-commit/source/header manifest, streaming standards-compliant parser,
immutable normalized records plus role-aware DOI/PMID indexes, complete runtime
reverification, same-filesystem atomic activation, source-check-time-bound
verified rollback, and explicit stale/no-match limits. The existing signed
external-evidence coordinator may consume a server-injected verified reader;
when absent, the prior `not_configured` gap remains unchanged. Configured
snapshot events and artifacts are bound into the receipt and existing
publication-history/claim-restriction path. Focused verification passes 29
tests and the complete deterministic suite passes 1,233 tests with six
declared skips. `npm run verify` passes typechecking, the same suite, and the
production build. The real dataset was not downloaded or committed, and no
production directory, schedule, retention, pruning, config binding, endpoint,
allowlist change, protocol, Custom GPT, plugin, or deployment change was made.
The Phase G production storage/scheduling owner gate remains open.

**Owner/privacy gate:** production activation of durable snapshot storage/cron must be reconciled with Phase G. The recommendation is to deploy a verified daily snapshot, but this roadmap does not silently waive retention/storage review.

#### Phase D5 — PubPeer + Epistemonikos optional adapters

- [x] Implement strict adapter contracts/fixtures as separate work.
- [x] Keep PubPeer live access disabled until official authorized API contract/terms are known.
- [x] Keep Epistemonikos disabled until token/current live contract/terms are verified.
- [x] Once configured, skipping a provider designated mandatory-by-configuration becomes an execution failure; unconfigured providers remain disclosed coverage gaps.
- [x] Preserve bounded provider content, edits/deletions, pagination/completeness, classification provenance, and linked-source audit requirements.

Phase D5 candidate verification on
`agent/execution-control-phase-d5-20260824` adds strict versioned
authorized-provider record adapters for PubPeer and Epistemonikos without live
HTTP transports. Exact DOI binding, bounded records, edit/delete/relation
state, raw classification provenance, count/cursor/exhaustion reconciliation,
and provider failures are preserved. Every optional executor supplied at
server construction runs and is bound as an artifact/attempt in the signed
external-evidence receipt; partial/retryable/failing configured work cannot
become complete, while absent providers remain explicit gaps. Visible messages
and exact current reviews create source-linked work; unavailable or
bibliographic-only records remain bounded. Focused verification passes 53
adapter/coordinator/formal tests, the complete deterministic suite passes 1,263
tests with six declared skips, and `npm run verify` passes typechecking, the
same suite, and the production build. Public inventories remain 21 MCP tools
and 26 Actions. No provider key, token, account, hostname, allowlist, live
request, durable store, protocol, deployment, plugin, or Custom GPT change is
included.

**D5 gate:** credentialed providers can be enabled without changing the completion-authority model or leaking provider content/secrets.

#### Phase D6 — Scite/commercial enrichments

- [ ] Do not begin Scite until an approved organization/server-to-server or tenant-aware OAuth architecture exists.
- [ ] Do not begin Ripeta until commercial API/documentation/data-rights decisions are available.
- [ ] Keep Scite citation classification explicitly separate from replication evidence.

**Exit gate for Phase D overall:** every decision-important study has controller-owned formal/full-text/method/external-evidence state sufficient to prove what was actually inspected, which provider coverage exists, which linked work remains, and what the study can/cannot support without relying on prestige/design labels or caller assertions.

### Phase E — Bidirectional iteration and treatment-space finalization

**Purpose:** make discovery genuinely iterative rather than a one-way checklist.

Tasks:

- [x] Reopen formal search for material programs, failure modes, harms, durability, adherence, progression, implementation hypotheses, integrity events, replications/reproductions, or review ancestry surfaced by community/video/external evidence.
- [x] Reopen community search for material discriminators surfaced by formal/external evidence.
- [x] Represent both transfer directions explicitly and keep `incomplete` executable until resolved/bounded.
- [x] Audit decision-changing linked replication/reproduction/review/post-publication sources before converting provider labels into evidential conclusions.
- [x] Build the treatment-landscape assessor input from session-owned records as much as possible instead of accepting a caller-authored complete ledger.
- [x] Reuse existing selection/depth/synthesis lock logic rather than reimplementing it.
- [x] Derive `CONTINUE_RESEARCH`, `BOUNDED_NONRANKING_ONLY`, or `FINALIZATION_ALLOWED` from the complete session state, including per-study external evidence requirements.
- [x] Require `FINAL_COMPLETION_AUDIT` before success where canonical protocol requires it.

Phase E on `agent/execution-control-phase-e-20260824` adds an exact, append-only
bidirectional evidence state. Every selected community receipt and every formal
hypothesis/source reference must receive an assessment in both directions.
Material community findings append source-bound formal hypotheses and reopen
the existing formal pipeline; formal discriminators create receipt-bound,
query-limited searches only inside already audited discussion pools. Retryable
work stays executable, terminal source gaps stay bounded, open discordances and
new evidence invalidate convergence, and no comment/result body enters session
state.

The session now derives the existing treatment-landscape assessor input from
its own discovery frontiers, candidate/program screening, selected-video depth
receipts, formal follow-up, and bidirectional state. Workers may submit only
frontier-bound semantic annotations; they cannot submit counts, receipts,
locks, assessor output, or completion. The unchanged selection/depth/synthesis
controller blocks broad comparisons that omit materially distinct programs or
benefit/failure/harm/discontinuation/eventual-treatment directions. Formal
access boundaries are no longer counted as completed follow-up: they produce
structured bounded-nonranking state.

A server-derived final completion audit checks exact protocol currency,
resolved/complete required modules and operations, current treatment locks,
current bidirectional convergence, and completion of every potentially
decision-changing linked item. Its checks and basis digest are schema-verified;
a caller cannot replace them. A genuine all-gates-complete fixture derives
`FINALIZATION_ALLOWED` readiness, but Phase F permit issuance remains disabled
and the canonical finalization endpoint still denies success. Focused Phase E
verification passes 68 enforcement tests; the complete host-boundary
`npm run verify` gate passes typechecking, 1,279 tests with six declared skips,
and the production build. Public inventories remain 21 MCP tools and 26
Actions. No protocol, provider, credential, durable-store,
deployment, plugin, generated Custom GPT, or public endpoint change is part of
this phase.

**Exit gate:** known broad-treatment premature-synthesis fixture plus unrelated held-out cases cannot reach finalization with unresolved material hypotheses, incomplete bidirectional fields, unmet treatment locks, retryable work, omitted required modules, missing configured provider attempts, or unaudited potentially decision-changing linked external sources.

### Phase F — Implement real successful finalization and integrity permit

**Purpose:** create the first server-authoritative success path.

Tasks:

- [x] Implement successful finalization only from controller-owned state.
- [x] Issue an integrity-bound compact finalization permit/report package with no raw private content.
- [x] Bind it to exact protocol identities and a deterministic digest of completion-relevant state/receipts, including study-external-evidence receipts where required.
- [x] Make replay/cross-session/tamper behavior explicit and tested.
- [x] Generate claim-local limitations automatically for valid bounded output, including unconfigured provider coverage gaps and unresolved linked external items.
- [x] Keep technical execution evidence separable from ordinary reader-facing rendering.

Required hostile tests:

- [x] tampered permit rejected;
- [x] cross-session receipt/permit replay rejected where session binding applies;
- [x] changed protocol hashes invalidate finalization currency;
- [x] caller cannot construct a valid permit from public fields;
- [x] all required valid receipts allow finalization in a complete fixture;
- [x] a terminal boundary yields only its allowed bounded scope;
- [x] retraction/correction/expression-of-concern state cannot be dropped from finalization-relevant state;
- [x] provider no-match cannot become a no-concern claim;
- [x] unaudited replication labels/citation classifications cannot become verified conclusions;
- [x] finalization output contains none of the prohibited raw/private fields.

Phase F on `agent/execution-control-phase-f-20260824` enables the first real
server-authorized success path without registering or deploying the prototype.
The controller issues a short-lived HMAC-SHA256 permit only from a current
passing final audit or the separately recognized bounded-nonranking terminal
state. It binds the execution ID, exact protocol tuple, complete state digest,
authorization basis, limitation set, output boundary, issue/expiry time, and
key identity. Cross-session, changed-state, changed-protocol, expired,
malformed, or tampered permits fail verification. Reader-facing scope and
plain-language limitations stay separate from the compact technical permit.

The external-evidence projection now retains bounded provider outcomes,
publication-integrity event identities, and server-derived claim-local
limitations so final rendering cannot drop an optional-provider gap, a
provider-scoped no-match boundary, a correction, an expression of concern, or
an active retraction/withdrawal. These projections are receipt-hash checked;
no raw provider body is added. Focused Phase F verification passes 46/46 tests.
The public inventory remains 21 MCP tools and 26 Actions, and the prototype
remains non-production. The complete local `npm run verify` gate passes
typechecking, 1,281 tests with six declared skips, and the production build.
Hosted verification remains the Phase F merge gate.

**Exit gate:** end-to-end deterministic fixture demonstrates denial -> required work -> valid receipts -> successful server finalization without a caller-authored completion assertion.

### Phase G — Decide and implement resumability/privacy boundary

**Purpose:** make long-running orchestration robust without accidentally creating a new sensitive-data store.

The current one-hour in-memory store is deliberately bounded. Persistence changes the privacy and deployment surface and therefore requires explicit review before activation.

Tasks before any persistence change:

- [x] Define minimum data required to resume an execution.
- [x] Separate opaque execution metadata/receipt/artifact digests from sensitive research payloads.
- [x] Decide whether/how the D2 `EvidenceArtifactStore` becomes durable in production; test retention/deletion/encryption/backup/rollback/crash recovery.
- [x] Decide whether/how the D4 Retraction Watch snapshot/cron is stored/deployed and how stale/failed sync behaves.
- [x] Update the privacy data map and threat model.
- [x] Compare safe options: bounded server-side persistence, sealed compact checkpoints, content-addressed artifact storage, or restart-from-source behavior.
- [x] Preserve current read-only/no-new-privileges posture as far as possible.

**Owner gate:** any new durable store, external service, paid account, changed retention, or production write capability requires owner approval before activation.

Phase G on `agent/execution-control-phase-g-20260824` records the owner-
delegated privacy decision and implements an optional single-host encrypted
controller checkpoint adapter. AES-256-GCM authenticates the sensitive state
and clear lifecycle metadata; strict filesystem modes, bounded bytes/counts,
72-hour idle/seven-day absolute expiry, explicit deletion, atomic writes, and
five-minute fenced claims prevent stale or caller-authored advancement. Raw
transcripts, comments, publication text, Gemini exchanges, and provider bodies
remain ephemeral. Restore reconciliation can only reopen work whose temporary
handle was lost. An exact-source full-text reacquisition preserves a completed
method/external receipt only when its source identity and content hash still
match; otherwise the dependent audit is invalidated.

The D2 raw evidence-artifact store remains in memory. The D4 public Retraction
Watch mirror gains active-plus-previous pruning, a compiled bounded sync CLI,
and reviewed hardened systemd service/timer templates. The later Phase H/L
deployment transaction may give the sync container the mirror's only write
mount and the application a separate read-only mount; no current public
service is changed by this phase. Threat model, privacy map, deployment,
recovery, backup exclusion, secret handling, and rollback are explicit.

Focused Phase G verification passes 85/85 tests. The complete host-boundary
deterministic suite passes 1,303 tests with six declared skips, and
`npm run verify` passes typechecking, that same suite, and the production
build. `systemd-analyze verify` passes the tracked service/timer. Public
inventories remain 21 MCP tools and 26 Actions. No protocol, public endpoint,
Custom GPT, plugin, provider account, external service, credential, production
mount, timer, or retention path is activated here.

**Exit gate:** restart/deployment behavior and external-evidence artifact/snapshot retention are explicit, privacy-reviewed, tested, and cannot silently lose state while claiming completion.

### Phase H — Add a private orchestration interface without changing public product surfaces

**Purpose:** give Hermes/n8n a controlled API before exposing the mechanism to Custom GPT.

Tasks:

- [x] Expose the same controller core through a small authenticated orchestration boundary separate from the public Custom GPT Action document and ordinary MCP catalog unless review shows an existing transport is safer.
- [x] Keep operations minimal: start/resume, status/next work, bounded semantic-work submission where needed, and finalize.
- [x] Keep deterministic provider coordination (`external_study_evidence_audit`) internal to the server; do not expose provider-by-provider completion toggles to Hermes/n8n.
- [x] Apply strict request/response schemas, authentication, rate/concurrency limits, body limits, no browser CORS by default, and bounded logs.
- [x] Expose only the minimum machine state needed by an orchestrator: opaque session ID, authoritative status/boundary, next capabilities, retry/boundary classification, and safe diagnostics.
- [x] Do not send raw private research/provider content to an external workflow system merely because it is convenient.
- [x] Prove the 21-tool MCP catalog and current public Action inventory remain unchanged in this phase.

Local Phase H exit evidence: the authenticated integration suite drives the
same controller through module routing, automated Gemini/native discovery,
candidate screening, status, and denied premature finalization. Hostile tests
reject missing/duplicate credentials, browser origins, non-JSON/malformed/
oversized bodies, caller completion/count/list/provider toggles, required-
module demotion, stale state, unknown sessions, protocol drift, excess output,
and exhausted rate/concurrency capacity. Focused Phase H tests pass 40/40; the
public-inventory/private-boundary suite passes 68/68 with exactly 21 MCP tools
and 26 Actions. `npm run test:run` passes 1,309 tests with six declared skips,
and `npm run verify` passes typechecking, the same suite, and the production
build. No public route, protocol, Custom GPT, plugin, provider, credential,
deployment, or production-retention change is made.

**Exit gate:** an authenticated local/integration test can drive the same controller while public OpenAPI/MCP inventories remain byte/semantic stable.

### Phase I — Hermes worker pilot

**Purpose:** add persistence of effort, not policy authority.

Hermes must be treated as a worker that receives a bounded current work package and returns structured work/evidence. It must never decide that AskRigor is complete.

Tasks:

- [x] Give Hermes only the minimum AskRigor orchestration capability plus explicitly required research/repo tools.
- [x] Load repository `AGENTS.md`/project context for development tasks, but do not let Hermes memory supersede canonical protocols.
- [x] For deterministic server-executable work, including configured external-study provider coordination, Hermes requests continuation rather than reproducing the logic.
- [x] For semantic work such as candidate judgment, study interpretation, replication implementation comparison, or material PubPeer concern analysis, give Hermes a bounded source-linked work package; validate its submission before state advancement.
- [x] Prevent direct writes to `main`, autonomous protocol changes, production-secret access, and direct finalization authority.
- [x] Add a final-response hook/guard so a Hermes AskRigor task cannot be marked successful without a server-authorized boundary/permit.
- [x] Benchmark against held-out research tasks for completion rate, unnecessary work, skipped gates, and cost.

Local Phase I exit evidence: AskRigor launches the reviewed official Hermes
release `v2026.8.19` at exact commit
`fcbd1076a93841fa88855acce810e342a5b78101` as a fresh no-tools/no-memory
process. The parent alone drives the authenticated private controller and
validates exact session/state/work/frontier-bound routing and candidate
submissions. Deterministic capabilities use `/resume`; the child receives no
orchestration/research-provider secret, repository tool, persistent memory, or
finalization authority. Hostile tests reject forged completion/count fields,
stale/cross-session/cross-frontier work, deterministic substitution, secret
inheritance, no-progress loops, and response release without a matching server
permit. The held-out control benchmark records authorized, bounded, and
rejected outcomes while keeping cost diagnostic only. The exact official
runtime passes two repeat loopback-only no-tools invocations. Focused Phase I
tests pass 17/17. Before the final per-turn checkout hardening,
`npm run test:run` and `npm run verify` passed all 1,321 tests with six declared
skips, typechecking, and the production build. After that hardening, focused
tests, exact official-runtime smoke, typechecking, and build pass; the complete
single-worker run passed 1,320/1,321 tests, with only the pre-existing package-
entrypoint test exceeding its fixed 10-second limit by 0.56 seconds under host
load near 16 and exhausted swap. That exact test then passed alone in 9.03
seconds without timeout changes. Hosted standard-concurrency CI remains the
merge gate.
The current real private-controller integration advances through routing,
server-owned Gemini/native scouting, and candidate screening, then preserves
the server denial because later work is not yet externally projected. Public
MCP/Action inventories, protocols, generated Instructions, plugin,
deployment, credentials, and retention remain unchanged.

**Exit gate:** Hermes can repeatedly complete a controlled research workflow without being able to bypass an AskRigor denial.

### Phase J — n8n control-plane pilot

**Purpose:** add durable workflow plumbing, retries, visibility, approvals, and cross-service orchestration while keeping policy in AskRigor.

Tasks:

- [x] n8n stores only opaque execution IDs and safe orchestration metadata by default.
- [x] n8n reads AskRigor authoritative status and branches only on documented machine fields; it never reimplements HRP/treatment/provider completion rules in IF nodes.
- [x] Route executable worker tasks to Hermes or deterministic services as directed by AskRigor.
- [x] Add bounded retry/error workflows for retryable infrastructure/provider failures.
- [x] Stop at true owner gates and notify the owner; do not request ceremonial approval for routine read-only continuation.
- [x] Add monitoring for stuck worker/no-progress conditions without treating elapsed time as evidence saturation.
- [x] Require a valid AskRigor finalization boundary/permit before the n8n workflow can enter its `complete` state.
- [x] Document export/backup of the n8n workflow and pin any custom node/version assumptions.

Local Phase J exit evidence: the private server now owns a single digest-bound
`advance` transition that chooses deterministic continuation or the exact
Hermes semantic package. The n8n adapter receives only an opaque execution ID
and safe directive. Its in-memory state uses fixed retry/no-progress bounds;
elapsed time cannot authorize output. The tracked 14-node built-in-only
workflow has strict mutation tests against quotas, credentials, private fields,
risky nodes, permit bypass, and incomplete-to-success rewiring. The exact
official n8n `2.35.7` image at digest
`sha256:166d7e3ca384afdffe75394bf00046c299d84a4bf17b19b35d6cf7773af0a147`
imports, exports, publishes, and executes the workflow in a disposable runtime.
Comparative, bounded, and retry-then-permit paths succeed; blocked, forged-
completion, and still-incomplete paths return non-success and terminate with an
error. Execution saving is disabled and no private research content enters
n8n. Public MCP/Action inventories, protocols, generated Instructions, plugin,
deployment, credentials, paid services, and retention remain unchanged.

**Exit gate:** killing/restarting a worker or causing a retryable provider failure cannot make n8n report research complete; it resumes, blocks, or escalates according to AskRigor state.

### Phase K — Custom GPT projection and real product acceptance

**Purpose:** use the hardened controller to simplify the Custom GPT contract, without assuming the GPT is technically incapable of bypassing Actions.

Phase K readiness re-audit after Phase J found two missing prerequisites: the
private controller transport stops after candidate screening, and successful
finalization returns authorization without the source-linked reader evidence
needed to render a scientific answer. The owner-directed implementation and
acceptance sequence is now specified in
`docs/superpowers/plans/2026-08-24-phase-k-controlled-research-and-report-projection.md`.
Do not project the compact Action contract until its K0 advancement and K1
report gates pass. This is a controller implementation repair, not a new
orchestration architecture or another model-instruction exception.

The first K3 product replay subsequently exposed a controller contradiction:
`CONTINUE_RESEARCH` had no next capability, while the Custom GPT projection
directed finalization and the server correctly denied it. The repair is tracked
in `docs/superpowers/plans/2026-08-25-phase-k-terminal-discovery-and-finalization-repair.md`.
K3 remains incomplete until that repair is merged, exactly deployed, and a
fresh challenge yields a server-signed product-acceptance receipt. The fixed
live scenario is a concrete regression for treatment-program diversity; it
does not add a condition-specific protocol branch.

After PR #98 was merged and deployed exactly, the next signed-in replay exposed
a separate retry-state projection defect under real YouTube search quota
exhaustion. The server retained the retryable native-discovery operation, but
the compact projection invited immediate continue calls; the unchanged retry
then became a generic dependency error and the GPT created replacement
sessions. The repair on
`agent/retryable-controller-resume-20260825` makes retry-blocked work a stable
same-session product state while preserving explicit later retryability. K3
also requires restored native-search capacity before another acceptance run.
PR #99 merged that repair as
`c543cf94360e73937221861667b69f144d2029af`; the exact merge is live and
passes the server/public boundary. The remaining K3 gate is replacement
YouTube capacity, one generated-bundle editor transaction, and a fresh
signed-in replay with a valid server product-acceptance receipt.

The owner subsequently installed the bundle and ran the fixed challenge.
Preserved session `ars1_VfivvctoY04Mxpdu0sBa1S9zuKm6e_3u` exposed another
execution-layer failure: a long grounded Gemini call timed out and was
misclassified as terminal, then the native fallback repeated the entire long
research target in each query and found no candidates. The generic repair and
its privacy/budget/acceptance gates are tracked in
`docs/superpowers/plans/2026-08-26-phase-k-discovery-resilience.md`. K3 remains
incomplete until that repair passes host verification, reviewed merge, exact
deployment, direct controlled replay, and fresh signed-in product acceptance.

PR #101 merged that repair as
`50a766e7eaddc7d718ceb7d0ad3ab65351e79a9a`; required CI passed and the
exact runtime/privacy release is live with rollback. Direct provider replay now
passes both background Gemini and the bounded native fallback. The first
authenticated controller replay then exposed a narrower projection omission:
server-owned scout progress was validly stored as `IN_PROGRESS`, but the
compact research-session view enum could not render that value. PR #102 merged
the generic route-level follow-up as
`acf4766989c828900118e7e968fb3a76718b6d3c`; its exact deployment and repeated
controlled replay pass. K3 remains incomplete only until a fresh signed-in
challenge returns and validates the server receipt.

Before merge, an exact-head isolated candidate replay passed the repaired
controller/provider boundary: three background progress states rendered,
automated scouting completed with eight reconciled candidates, native discovery
completed, and candidate screening was reached with 51 candidates. The
temporary unexposed container was removed. This is strong pre-merge execution
evidence, not a substitute for required CI, exact production deployment, or
the signed installed-product receipt.

PR #102 passed every required check and merged as
`acf4766989c828900118e7e968fb3a76718b6d3c`. That exact merge is deployed with
retained prior-image and Compose rollback. The direct production replay
rendered repeated background progress, retained a real retryable Gemini
boundary, resumed the same session, completed Gemini and native discovery, and
reached candidate screening with 49 reconciled candidates. The generated
Custom GPT artifacts and plugin bytes remain unchanged from the installed
bundle, so no editor import, Action/MCP URL update, or plugin reinstall is
required. K3 now waits only on a fresh signed-in product replay and its valid
server-issued acceptance receipt.

That replay reached the formal-evidence frontier with 900 retained candidates,
then exposed a generic terminal-page transition defect. A provider search that
had an in-progress cursor reached its exhausted page; the controller marked it
complete but retained the old cursor, so authoritative schema validation failed
and the Action surface returned `action_internal_error`. The repair must remove
prior cursor and retry-boundary state before projecting each current provider
page, prove the transition at both source and controlled-Action boundaries,
merge and deploy exactly, and complete a direct full-path replay before asking
for another signed-in acceptance run. This does not change research policy,
provider breadth, public inventories, or the compact Custom GPT contract.

PR #104 passed every protected check and merged the repair as
`37bb2744cb73e4d0bbcee67b85eb7134f95d189a`. That exact merge is deployed
in a healthy container with prior-image and exact-Compose rollback. Public
health/auth/schema/MCP/protocol and complete plugin-package receipts pass. The
exact failed transition and repeated same-session Action continuations now pass
without the stale-cursor error. The direct writer was stopped without
finalization after sanitized inspection found a distinct query-construction
defect: 41 hypotheses collapsed to 10 broad queries, one repeated 31 times,
and the first five completed hypotheses each mapped to the same 968-source set.
The follow-up candidate preserves all hypotheses, generates 40 bounded queries
on the exact checkpoint fixture, and reuses the one remaining semantically
identical receipt chain without provider calls. It still requires protected
review, exact deployment, direct replay, and a new
signed-in receipt. Complete host-bound verification now passes 105 test files,
1,400 tests, and the production build; protected review is next.

PR #105 passed all protected checks and merged as
`acd4d2f9664de0332f695a9099de111558aca918`. That exact merge is live in a
healthy, rollback-armed research container. Public Action/MCP/protocol checks,
the installed connector probe, and both complete plugin receipts pass. The
live image reproduced the 41-hypothesis/40-query bounded initializer result on
a disposable checkpoint copy. Bounded authenticated Action calls then advanced
the preserved session from five to seven completed hypotheses and persisted
both donor-provider bindings plus all 968 source links for the indistinguishable
pair. Fresh signed-in Custom GPT finalization remains the only current K3 gate;
it was unavailable because the browser runtime reported no available browsers.

Tasks:

- [x] Execute every later controller capability through one shared
  transport-independent advancement engine; fail closed on unsupported or
  no-progress states.
- [x] Preserve only bounded source-linked semantic findings and produce a
  server-validated reader packet; keep raw source/provider/private content out
  of the checkpoint.
- [x] Require a current report packet for final completion and bind its digest
  into the signed finalization permit.
- [x] Decide the minimum public Action projection after Hermes/n8n pilots prove the controller.
- [x] Keep the external provider coordinator internal during the first accepted server-owned release; do not expose separate Crossref/FORRT/PubPeer/etc. model-callable checkboxes.
- [x] If a later technical-audit operation is exposed, expose at most one composite read-only operation and never let caller-submitted output unlock session completion. No separate technical-audit operation is exposed in K2.
- [x] Keep public educational scope and current product-policy boundary.
- [x] Shrink model-side workflow responsibility: start/resume, obey next required step, render server-authorized result, expose technical state only on request.
- [x] Update Instructions/OpenAPI/synchronization ledgers only after the exact product projection is reviewed.
- [x] Confirm the installed generated Instructions, Action schema, MCP URL, and
  plugin remain exact for the server-only repair; no editor or plugin
  transaction is required.
- [ ] Run fresh signed-in Preview acceptance and validate its server-issued
  product-acceptance receipt.
- [ ] Run repeated fresh chats on the known failure shape and unrelated held-out treatment questions; record actual operation IDs and finalization result rather than a manually authored acceptance fixture.
- [ ] Include product cases where a study is retracted/corrected, FORRT has a linked repetition, and optional providers are unconfigured; output must remain plain-language and provider-scoped.
- [ ] If the Custom GPT repeatedly bypasses even the compact server-directed contract, stop treating it as the authoritative synthesis surface. Keep AskRigor server/application finalization authoritative.

The minimum reviewed projection is four controlled research operations
(`start`, `continue`, technical `status`, and `finalize`) plus the existing
consented lesson write. Low-level provider/source operations remain internal to
the controlled execution path and the 21-tool MCP catalog remains unchanged.
Real product acceptance requires a reversible exact-candidate deployment before
the editor/Preview replay; that deployment is Phase K test setup, while Phase L
retains final release and synchronization closeout.

**Exit gate:** every planned fresh-product replay passes. Repository tests alone are not acceptance.

### Phase L — Release, deploy, and close out

- [ ] Run all targeted tests, `npm run test:run`, and `npm run verify`.
- [ ] Run separately guarded live Crossref/FORRT/provider smoke tests when configured; verify identity/shape, not brittle exact counts.
- [ ] Run public-site/deployment tests where affected.
- [ ] Complete privacy/security/data-source/licensing/release documentation and lesson disposition.
- [ ] Review final diff and CI; merge through PR only.
- [ ] Deploy exact merge with retained rollback.
- [ ] Directly verify runtime health, protocol hashes, expected Action/MCP inventories, orchestration auth boundary, rate limits, enabled provider configuration, and privacy behavior.
- [ ] Verify known publication-integrity and FORRT relationship cases and prove forged/omitted external receipts cannot unlock finalization.
- [ ] Verify optional unconfigured providers appear as limitations and credentials/raw provider content do not appear in responses/logs.
- [ ] Synchronize/reinstall the personal plugin when its bytes/surface require it.
- [ ] Install exact Custom GPT artifacts only in the relevant projection phase.
- [ ] Run fresh real product acceptance before declaring the release current.

## External evidence implementation map

This map refines Phase D. Re-audit actual repository paths before implementation and follow current conventions if tests live at root rather than package-local locations.

### D1 expected files

Create or equivalent:

- `packages/contracts/src/study-external-evidence.ts`
- `packages/sources/src/forrt-replication.ts`
- deterministic FORRT fixtures/tests.

Modify or equivalent:

- `packages/contracts/src/index.ts`
- `packages/sources/src/index.ts`
- `packages/sources/src/crossref.ts`
- strict upstream HTTP allowlist/configuration code;
- Crossref tests;
- `.env.example` only for nonsecret flags/placeholders actually needed.

### D2 expected files

Create or equivalent:

- `apps/research-mcp/src/actions/study-external-evidence.ts`
- coordinator/receipt tests;
- evidence-artifact-store abstraction + tests.

Modify or equivalent:

- research MCP config;
- `study-method-audit.ts`;
- package exports as needed.

### D3 expected files

Modify the existing research-session controller/store/prototype and tests rather than creating a second controller. The prototype may be renamed when it becomes the real implementation.

### D4 expected files

Create or equivalent:

- controlled Retraction Watch sync script;
- verified snapshot reader/index;
- snapshot tests/manifest handling.

Add deployment cron only after atomic update, rollback, stale-snapshot, storage, and Phase G privacy review pass.

### D5/D6 expected files

PubPeer/Epistemonikos/Scite adapters follow current source adapter conventions and remain disabled until their respective credential/terms/architecture gates pass.

## External evidence test matrix

All ordinary CI/`npm run verify` tests use deterministic saved fixtures. Live tests are separately guarded/bounded.

Adapter tests should cover valid result, no match, partial result, pagination when applicable, rate limiting, auth failure, timeout, invalid JSON, unexpected fields, malformed required fields, oversized response, and normalized limitation language.

Coordinator/receipt/enforcement tests should cover at least:

- Crossref + FORRT complete;
- publication event + FORRT no match;
- FORRT relation + no publication update;
- optional providers disabled;
- configured provider inaccessible/rate-limited;
- correction invalidates or reopens prior audit when affected;
- active retraction excludes ordinary effect capability;
- expression of concern cannot silently disappear;
- material post-publication concern creates follow-up work;
- replication/reproduction link creates linked-source audit work;
- review ancestry creates review-audit work;
- deterministic canonical hashing;
- verification failure if session/DOI/identity/protocol/provider response/provider status/bundle/issue time/key/signature changes;
- skipped external operation, forged completion, mixed/cross-study receipts, omitted retraction/provider failure, no-match-as-no-concern, and unaudited provider labels cannot unlock finalization.

Live smoke tests should verify current response shape + exact identifier identity, not fixed relationship counts that may legitimately evolve. PubPeer live tests remain disabled until authorized official API access exists.

## Protocol/documentation sequencing

Do not change canonical protocol XML merely to make implementation easier. Land and verify executable runtime contracts first. If canonical protocol language genuinely needs updating to encode the new server-owned requirement, make that a later owner-reviewed change after the runtime semantics are proven.

Any later protocol update should narrowly preserve these principles:

- decision-important studies require the server-owned external-study-evidence requirement before unrestricted synthesis where the canonical policy adopts it;
- provider no-match is provider-scoped;
- post-publication comments are claims requiring evaluation, not verdicts;
- replication labels are provisional until linked implementation/result is audited;
- retraction, expression of concern, correction, and reinstatement are distinct publication-record events;
- no global study-quality score.

Update current-state, predecessor plan cross-references, README/privacy/data-source/release documentation as each reviewed phase affects them. Action/MCP inventory documents change only when public inventories actually change.

## Cross-project follow-on: only after AskRigor proves the pattern

Do not prematurely extract a universal framework. After AskRigor has real end-to-end acceptance, review which controller primitives are genuinely generic.

### HumanDesign

Potential reusable controls:

- frozen model/input/prediction hashes before responses or reveal;
- capability-separated workers so decoders/evaluators cannot access answer keys;
- authoritative `freeze -> collect -> seal -> reveal -> evaluate` state transitions;
- fail-closed V4.3 compliance and untouched-validation gates.

Do not mix HumanDesign epistemic rules into AskRigor's controller.

### Nansen

Potential reusable controls:

- experiment-stage advancement;
- immutable evidence/manifest gates;
- post-collection integrity and analysis orchestration;
- failure/recovery/reporting.

Do **not** replace exact systemd market-observation scheduling or sealed timing with an LLM/n8n worker. No trading/capital movement authority belongs in the generic controller.

### InnerSignal

InnerSignal already has a deterministic controller/autopilot philosophy. Reuse only genuinely shared primitives such as bounded state, receipts, owner gates, or diagnostics if doing so reduces complexity. Do not replace its existing controller with AskRigor infrastructure.

## Worker operating procedure for this roadmap

1. Start every session from current `main`; read `AGENTS.md`, complete canonical protocols, `project/PROJECT_INSTRUCTIONS.md`, relevant modules, `project/CODEX-CURRENT-STATE.md`, the predecessor orchestrator plan, and this roadmap.
2. Run `npm run lessons:status` using the maintainer's local GitHub authentication and report its exact available/unavailable result.
3. Re-audit the code touched by the next phase before designing changes. If the phase has already landed since this roadmap was written, update the roadmap instead of duplicating it.
4. Work on exactly one roadmap phase/subphase at a time in an isolated worktree/task branch. A complex phase gets its own implementation plan under `docs/superpowers/plans/` if needed.
5. Use existing source adapters, receipt types, controller/coverage logic, continuation stores, full-text/method-audit code, and Crossref behavior before inventing new abstractions.
6. Add tests that prove the enforcement property, not merely that instruction text contains a sentence.
7. Keep hermetic CI separate from live/provider smoke tests.
8. Run focused tests during development, then the complete applicable deterministic gate before PR completion.
9. Inspect the final diff and update current-state/release/privacy/data-source/licensing docs when affected.
10. Open/review/merge through PR according to repository policy. After merge, start the next phase from fresh `main` rather than carrying an old worktree forward.
11. Update this roadmap's checkboxes/status after each completed phase/subphase so a fresh worker can recover without chat history.
12. Continue autonomously through nonconsequential implementation phases. Stop for owner judgment only when the roadmap or canonical project rules identify a genuine boundary, including protocol/policy changes, new paid providers, credential/account commitments, new durable retention, production write capability, material privacy expansion, or a security/licensing tradeoff requiring acceptance.
13. Never claim the overall roadmap complete until real product acceptance and deployment gates relevant to the chosen surface have passed.

## Overall acceptance criteria

The execution-control program is complete only when all of these are true:

1. The server owns authoritative research-session state from routing through finalization.
2. Required applicability cannot be caller-demoted.
3. Real operation results/receipts, not caller completion claims, advance state.
4. Retryable executable work cannot be relabeled terminal by a worker.
5. Protocol drift is detected before authoritative finalization.
6. Candidate discovery, transcripts, community depth, formal search, full text, method audit, post-publication/integrity/replication evidence, bidirectional iteration, treatment-space coverage, and final audit are controller-connected where required.
7. Decision-important studies have provider-scoped publication-integrity/replication coverage and linked decision-changing sources are audited or claim-locally bounded.
8. No universal study-quality score or provider-count shortcut can unlock completion.
9. A valid terminal boundary can produce only its permitted bounded output.
10. A complete fixture can reach a server-issued integrity-bound finalization permit/report.
11. Tamper, replay, cross-session, cross-study, cross-protocol, provider-state, and privacy tests pass for the chosen receipt/permit/state design.
12. Hermes cannot bypass controller denial.
13. n8n cannot mark a workflow complete without AskRigor authorization.
14. External orchestration does not become a second copy of research/provider policy.
15. Public MCP/Action changes occur only in reviewed phases with exact inventory tests.
16. Fresh real-product acceptance passes for any Custom GPT projection claimed current.
17. Deployment, plugin, server, protocol, provider configuration, and product artifacts are synchronized to one reviewed release.

## Explicit non-goals

- Do not add another giant system prompt as the primary enforcement mechanism.
- Do not duplicate the existing treatment-landscape assessor in n8n/Hermes.
- Do not expose separate provider tools merely to make the model remember a checklist.
- Do not create a universal study-quality/reliability number.
- Do not treat a signed receipt as semantic truth merely because its structure and provenance validate.
- Do not treat provider no-match as proof of absence, comment count as severity, or provider-coded replication/citation labels as verified conclusions.
- Do not expose private health/research/provider content to orchestrators unnecessarily.
- Do not give external agents protocol-change, production-secret, direct-main, or completion authority.
- Do not activate new durable artifact/snapshot storage outside Phase G privacy/owner review.
- Do not generalize to other projects until AskRigor proves the architecture end to end.

## Owner/provider gates and recommended defaults

These gates do not block the open Crossref + FORRT + internal receipt/controller work.

- Public provider-tool exposure: default **no** for the first release; controller calls providers internally. At most one composite technical-audit operation may be considered later.
- Retraction Watch local snapshot: recommended **yes**, but production durable storage/cron activation remains reconciled with Phase G unless separately approved.
- PubPeer: implement adapter/fixtures but keep disabled until authorized API access/current terms are known.
- Epistemonikos: keep disabled until token/current contract/live smoke are verified.
- Scite/Ripeta: defer paid/commercial integration until open-core evidence shows a material remaining need and appropriate credentials/licensing exist.
- Health-first activation with a field-neutral external-evidence schema is the default architectural direction unless a later owner correction changes it.

## Recovery and relationship to predecessor plan

The predecessor plan remains authoritative for the owner-approved scientific corrections, study/review audit requirements, accessible/inaccessible source policy, candidate-quality principles, and product-acceptance philosophy. This roadmap is a continuation/reconciliation after PR #58/#59/#61/#62 and now includes the external-study-evidence workstream as a required part of the Phase D -> E -> F controller path.

If this roadmap conflicts with a later explicit owner correction or the complete current canonical protocol bytes, the higher authority wins and this document must be amended through review. Chat summaries never supersede repository state.
