# AskRigor execution-control productionization roadmap

**Status:** Proposed continuation roadmap after PR #58/#59/#61. This document does not replace the complete canonical protocols or the owner-approved scientific corrections in `2026-08-23-executable-research-orchestrator-and-study-audit.md`. It reconciles that plan with the implementation that has already landed and defines the remaining stepwise path to hard execution enforcement, then Hermes/n8n orchestration.

**Audited baseline:** `main` at `d1e1756117d30eb547248b3d5bc1661a1d4e785a` on 2026-08-23.

## Goal

Make it increasingly impossible for an AskRigor execution client to skip required research and still reach a completed comparative synthesis.

The governing architectural rule is:

> Models may route, reason, select, audit, and execute bounded research work. Only the AskRigor server-owned controller may advance authoritative execution state or permit finalization.

Hermes, Codex, Custom GPT, n8n, or a future AskRigor UI are clients/workers. They never become protocol or completion authority.

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
9. Current production has 21 MCP tools and 25 public Actions after the full-text/method-audit release. The research-session prototype is deliberately **not** in the production inventory.

### Important remaining gaps

1. The session prototype automates only the scout step. Candidate screening, transcript acquisition, discussion audit, formal search, full-text acquisition, method audit, bidirectional return, and landscape finalization remain listed work rather than controller-owned transitions.
2. The session is broad-treatment oriented and does not yet encode the complete top-level routing vocabulary: `HRP`, `DIRECT_HUMAN`, `EXTENDED_GREY`, `FORUM_SIGNAL`, `BIDIRECTIONAL_ITERATION`, `FINAL_COMPLETION_AUDIT`.
3. The prototype has `in_progress`/`blocked` and always sets `synthesis_permitted=false`; it has no implemented successful finalization state yet.
4. The prototype binds protocol identities at start but must re-check current protocol identities before authoritative continuation/finalization so protocol drift cannot silently remain current.
5. The ephemeral store is process-local and one-hour TTL. It does not survive restart/deployment and is not yet suitable as a long-running external-orchestration checkpoint.
6. The current session state contains the raw `research_target`. Before adding persistence or external workflow storage, privacy boundaries must be re-reviewed. Do not push raw private research content into n8n, Hermes memory, logs, diagnostics, or a durable database by accident.
7. Existing treatment coverage validates a caller-assembled ledger. Its deterministic logic should be reused inside the session, but the session must increasingly generate/reconcile that ledger from actual operation results rather than trust caller counts or completion flags.
8. Method-audit submissions still contain semantic judgments produced by a worker/model. The server validates source identity, source-block links, required domains, and structure, but semantic correctness remains reviewable model work. Do not mislabel structural validation as truth.
9. No Hermes or n8n integration currently exists. Adding either before completing the server control boundary would merely automate the existing enforcement gap.
10. No generic cross-project execution-control package should be extracted yet. Prove the pattern in AskRigor first.

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
10. Ordinary user-facing output remains plain language; internal state names, locks, receipt schemas, and orchestrator jargon are technical-audit material only.
11. Do not broaden the 21-tool MCP catalog, public Action inventory, privacy map, data retention, paid-provider footprint, or production write capability without the relevant reviewed phase and owner gate.
12. Do not replace deterministic system behavior with Hermes/n8n prompts where code can own the invariant.

## Target execution model

The completed controller should distinguish at least these authoritative output boundaries:

- `CONTINUE_RESEARCH`: executable required work remains.
- `BOUNDED_NONRANKING_ONLY`: only terminal protocol-recognized access boundaries prevent completion; a bounded answer may describe inspected evidence and limitations but cannot provide the blocked comparison/ranking/verdict.
- `FINALIZATION_ALLOWED`: every required executable gate has passed and the server may issue a compact finalization permit/report package.

These names may be normalized to existing repository terminology during implementation, but there must be one canonical machine representation, not parallel synonyms across clients.

A successful finalization artifact should be server-generated and integrity-bound. Prefer an opaque server-held permit or a compact signed permit containing only an execution identifier, protocol identities, state/receipt digest, permitted boundary, issue/expiry metadata, and domain separation. Never put raw user prompts, medical details, transcript text, unrestricted provider output, credentials, or private research prose in a portable token.

## Stepwise roadmap

Each numbered phase is a separate reviewed PR unless an implementation plan shows that two adjacent phases are inseparable. Re-read current `main` before every phase. Do not continue from stale chat assumptions.

### Phase A — Reconcile and harden the existing prototype core

**Purpose:** turn the current feasibility prototype into a reusable controller core without exposing it to production clients yet.

Tasks:

- [ ] Refactor session state/transition logic out of the Action prototype so transport is not the source of truth.
- [ ] Add explicit controller schemas for module applicability/status covering `HRP`, `DIRECT_HUMAN`, `EXTENDED_GREY`, `FORUM_SIGNAL`, `BIDIRECTIONAL_ITERATION`, and `FINAL_COMPLETION_AUDIT` where current canonical protocols allow deterministic representation.
- [ ] Preserve uncertainty/fail-closed behavior from the project router. Do not invent a new applicability policy.
- [ ] Add canonical `required_next_capabilities` (or equivalent) derived directly from state conditions, not by parsing human blocker strings.
- [ ] Re-check current HRP/Universal manifests before authoritative continuation and finalization. Add explicit protocol-drift state and tests.
- [ ] Define one canonical output-boundary enum matching the three semantics above and map existing treatment-landscape boundaries into it without weakening them.
- [ ] Define the finalization-permit contract but keep successful permit issuance unreachable until later phases wire all required gates.
- [ ] Keep the prototype outside the production Action inventory.

Required hostile tests:

- [ ] `REQUIRED -> NOT_REQUIRED` caller demotion fails.
- [ ] caller-authored `complete`, `synthesis_permitted`, counts, or completed-operation arrays cannot advance state.
- [ ] current-protocol drift prevents finalization.
- [ ] stale/unknown session cannot advance.
- [ ] a treatment-landscape `continue_research` state maps only to continued work.
- [ ] `bounded_nonranking_only` cannot become full synthesis.
- [ ] removal of each major completion condition causes a mutation/regression failure.

**Exit gate:** a pure/controller-level test can simulate early synthesis, deny it, advance only through valid server-derived state, and still cannot reach success because downstream phases are intentionally unfinished.

### Phase B — Make discovery and candidate state server-derived

**Purpose:** stop asking a client to reconstruct the candidate frontier and program inventory from memory.

Tasks:

- [ ] Integrate automated Gemini scout output and native candidate discovery into session-owned frontier records.
- [ ] Independently validate all external-scout public identities before they enter decision-relevant state.
- [ ] Represent every candidate with stable source identity, discovery origin/query, target/stage distance, provisional program fields, materiality/redundancy state, and access status.
- [ ] Reuse normalized program-signature logic from treatment-landscape coverage.
- [ ] Preserve `program not described` instead of worker invention.
- [ ] Reconcile native and external scout frontiers rather than treating either as globally sufficient.
- [ ] Derive next capabilities for additional discovery, screening, or source acquisition.
- [ ] Keep raw quota counts as undercoverage diagnostics, not success criteria.

**Exit gate:** forged candidate counts, duplicate renamed programs, missing reciprocal frontier links, unresolved validated scout identities, or skipped required scout work cannot advance the session.

### Phase C — Make transcript and community-depth work controller-owned

**Purpose:** make actual retrieval depth and continuation state determine progress.

Tasks:

- [ ] Wire selected candidate identities to `get_youtube_video`/transcript retrieval and existing server-produced transcript receipts.
- [ ] Continue transcript handles until exhaustion or a valid boundary; never accept caller-reconstructed pagination.
- [ ] Wire selected discussions to `audit_youtube_video_community` and its server-produced receipt.
- [ ] Continue automatically while `continuation_recommended=true` unless a genuine nonretryable boundary applies.
- [ ] Store only the bounded provenance/receipt facts required for execution control; do not turn the session store into a raw transcript/comment archive.
- [ ] Derive per-video work packages and next capabilities from receipt state.

**Exit gate:** skipped/restarted/mixed chains, retryable failures, one-of-many audited discussions, transcript-free creator claims, or caller-reported exhaustion cannot satisfy depth requirements.

### Phase D — Make formal search, full text, and study/review audit session-owned

**Purpose:** connect the already-deployed full-text/method-audit machinery to execution state.

Tasks:

- [ ] Generate formal-search records for every material program/outcome hypothesis requiring follow-up.
- [ ] Track exact DOI/source identity and access attempts.
- [ ] For decision-important DOIs, invoke existing open-full-text acquisition and exhaust the document handle where a verified copy exists.
- [ ] Keep inaccessible/unverified sources as claim-local leads, not inspected evidence and not global freeze conditions.
- [ ] Bind study/review audit submissions to exact document identity/hash and known source blocks through the existing validators.
- [ ] Record worker-generated semantic audit findings separately from deterministic validation facts.
- [ ] Add evidence-ancestry/replication records still missing from the predecessor plan.
- [ ] Derive claim capability/non-capability state without letting design names, journal prestige, peer review, guideline status, or review labels satisfy reliability gates.

**Exit gate:** an abstract-only trial, unexhausted full text, unknown source block, identity mismatch, missing required audit domain, or unseen inaccessible paper cannot authorize a decision-important claim as inspected full-study evidence.

### Phase E — Bidirectional iteration and treatment-space finalization

**Purpose:** make discovery genuinely iterative rather than a one-way checklist.

Tasks:

- [ ] Reopen formal search for material programs, failure modes, harms, durability, adherence, progression, or implementation hypotheses surfaced by community/video evidence.
- [ ] Reopen community search for material discriminators surfaced by formal evidence.
- [ ] Represent both transfer directions explicitly and keep `incomplete` executable until resolved/bounded.
- [ ] Build the treatment-landscape assessor input from session-owned records as much as possible instead of accepting a caller-authored complete ledger.
- [ ] Reuse existing selection/depth/synthesis lock logic rather than reimplementing it.
- [ ] Derive `CONTINUE_RESEARCH`, `BOUNDED_NONRANKING_ONLY`, or `FINALIZATION_ALLOWED` from the complete session state.
- [ ] Require `FINAL_COMPLETION_AUDIT` before success where canonical protocol requires it.

**Exit gate:** known broad-treatment premature-synthesis fixture plus unrelated held-out cases cannot reach finalization with unresolved material hypotheses, incomplete bidirectional fields, unmet treatment locks, retryable work, or omitted required modules.

### Phase F — Implement real successful finalization and integrity permit

**Purpose:** create the first server-authoritative success path.

Tasks:

- [ ] Implement successful finalization only from controller-owned state.
- [ ] Issue an integrity-bound compact finalization permit/report package with no raw private content.
- [ ] Bind it to exact protocol identities and a deterministic digest of completion-relevant state/receipts.
- [ ] Make replay/cross-session/tamper behavior explicit and tested.
- [ ] Generate claim-local limitations automatically for valid bounded output.
- [ ] Keep technical execution evidence separable from ordinary reader-facing rendering.

Required hostile tests:

- [ ] tampered permit rejected;
- [ ] cross-session receipt/permit replay rejected where session binding applies;
- [ ] changed protocol hashes invalidate finalization currency;
- [ ] caller cannot construct a valid permit from public fields;
- [ ] all required valid receipts allow finalization in a complete fixture;
- [ ] a terminal boundary yields only its allowed bounded scope;
- [ ] finalization output contains none of the prohibited raw/private fields.

**Exit gate:** end-to-end deterministic fixture demonstrates denial -> required work -> valid receipts -> successful server finalization without a caller-authored completion assertion.

### Phase G — Decide and implement resumability/privacy boundary

**Purpose:** make long-running orchestration robust without accidentally creating a new sensitive-data store.

The current one-hour in-memory store is deliberately bounded. Persistence changes the privacy and deployment surface and therefore requires explicit review before activation.

Tasks before any persistence change:

- [ ] Define minimum data required to resume an execution.
- [ ] Separate opaque execution metadata/receipt digests from sensitive research payloads.
- [ ] Update the privacy data map and threat model.
- [ ] Compare safe options: bounded server-side persistence, sealed compact checkpoints, or restart-from-source behavior.
- [ ] Preserve current read-only/no-new-privileges posture as far as possible.
- [ ] Specify retention, deletion, encryption/secret handling, backup, and crash-recovery semantics.

**Owner gate:** any new durable store, external service, paid account, changed retention, or production write capability requires owner approval before activation.

**Exit gate:** restart/deployment behavior is explicit, privacy-reviewed, tested, and cannot silently lose state while claiming completion.

### Phase H — Add a private orchestration interface without changing public product surfaces

**Purpose:** give Hermes/n8n a controlled API before exposing the mechanism to Custom GPT.

Tasks:

- [ ] Expose the same controller core through a small authenticated orchestration boundary separate from the public Custom GPT Action document and ordinary MCP catalog unless review shows an existing transport is safer.
- [ ] Keep operations minimal: start/resume, status/next work, bounded work submission where needed, and finalize.
- [ ] Apply strict request/response schemas, authentication, rate/concurrency limits, body limits, no browser CORS by default, and bounded logs.
- [ ] Expose only the minimum machine state needed by an orchestrator: opaque session ID, authoritative status/boundary, next capabilities, retry/boundary classification, and safe diagnostics.
- [ ] Do not send raw private research content to an external workflow system merely because it is convenient.
- [ ] Prove the 21-tool MCP catalog and current public Action inventory remain unchanged in this phase.

**Exit gate:** an authenticated local/integration test can drive the same controller while public OpenAPI/MCP inventories remain byte/semantic stable.

### Phase I — Hermes worker pilot

**Purpose:** add persistence of effort, not policy authority.

Hermes must be treated as a worker that receives a bounded current work package and returns structured work/evidence. It must never decide that AskRigor is complete.

Tasks:

- [ ] Give Hermes only the minimum AskRigor orchestration capability plus explicitly required research/repo tools.
- [ ] Load repository `AGENTS.md`/project context for development tasks, but do not let Hermes memory supersede canonical protocols.
- [ ] For deterministic server-executable work, Hermes requests continuation rather than reproducing the logic.
- [ ] For semantic work such as candidate judgment or study interpretation, give Hermes a bounded source-linked work package; validate its submission before state advancement.
- [ ] Prevent direct writes to `main`, autonomous protocol changes, production-secret access, and direct finalization authority.
- [ ] Add a final-response hook/guard so a Hermes AskRigor task cannot be marked successful without a server-authorized boundary/permit.
- [ ] Benchmark against held-out research tasks for completion rate, unnecessary work, skipped gates, and cost.

**Exit gate:** Hermes can repeatedly complete a controlled research workflow without being able to bypass an AskRigor denial.

### Phase J — n8n control-plane pilot

**Purpose:** add durable workflow plumbing, retries, visibility, approvals, and cross-service orchestration while keeping policy in AskRigor.

Tasks:

- [ ] n8n stores only opaque execution IDs and safe orchestration metadata by default.
- [ ] n8n reads AskRigor authoritative status and branches only on documented machine fields; it never reimplements HRP/treatment completion rules in IF nodes.
- [ ] Route executable worker tasks to Hermes or deterministic services as directed by AskRigor.
- [ ] Add bounded retry/error workflows for retryable infrastructure failures.
- [ ] Stop at true owner gates and notify the owner; do not request ceremonial approval for routine read-only continuation.
- [ ] Add monitoring for stuck worker/no-progress conditions without treating elapsed time as evidence saturation.
- [ ] Require a valid AskRigor finalization boundary/permit before the n8n workflow can enter its `complete` state.
- [ ] Document export/backup of the n8n workflow and pin any custom node/version assumptions.

**Exit gate:** killing/restarting a worker or causing a retryable provider failure cannot make n8n report research complete; it resumes, blocks, or escalates according to AskRigor state.

### Phase K — Custom GPT projection and real product acceptance

**Purpose:** use the hardened controller to simplify the Custom GPT contract, without assuming the GPT is technically incapable of bypassing Actions.

Tasks:

- [ ] Decide the minimum public Action projection after Hermes/n8n pilots prove the controller.
- [ ] Keep public educational scope and current product-policy boundary.
- [ ] Shrink model-side workflow responsibility: start/resume, obey next required step, render server-authorized result, expose technical state only on request.
- [ ] Update Instructions/OpenAPI/synchronization ledgers only after the exact product projection is reviewed.
- [ ] Run fresh signed-in editor import and Preview acceptance.
- [ ] Run repeated fresh chats on the known failure shape and unrelated held-out treatment questions; record actual operation IDs and finalization result rather than a manually authored acceptance fixture.
- [ ] If the Custom GPT repeatedly bypasses even the compact server-directed contract, stop treating it as the authoritative synthesis surface. Keep AskRigor server/application finalization authoritative.

**Exit gate:** every planned fresh-product replay passes. Repository tests alone are not acceptance.

### Phase L — Release, deploy, and close out

- [ ] Run all targeted tests, `npm run test:run`, and `npm run verify`.
- [ ] Run public-site/deployment tests where affected.
- [ ] Complete privacy/security/release documentation and lesson disposition.
- [ ] Review final diff and CI; merge through PR only.
- [ ] Deploy exact merge with retained rollback.
- [ ] Directly verify runtime health, protocol hashes, expected Action/MCP inventories, orchestration auth boundary, rate limits, and privacy behavior.
- [ ] Synchronize/reinstall the personal plugin when its bytes/surface require it.
- [ ] Install exact Custom GPT artifacts only in the relevant projection phase.
- [ ] Run fresh real product acceptance before declaring the release current.

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
4. Work on exactly one roadmap phase at a time in an isolated worktree/task branch. A complex phase gets its own implementation plan under `docs/superpowers/plans/` if needed.
5. Use existing source adapters, receipt types, controller/coverage logic, and continuation stores before inventing new abstractions.
6. Add tests that prove the enforcement property, not merely that instruction text contains a sentence.
7. Run focused tests during development, then the complete applicable deterministic gate before PR completion.
8. Inspect the final diff and update current-state/release/privacy docs when affected.
9. Open/review/merge through PR according to repository policy. After merge, start the next phase from fresh `main` rather than carrying an old worktree forward.
10. Update this roadmap's checkboxes/status after each completed phase so a fresh worker can recover without chat history.
11. Continue autonomously through nonconsequential implementation phases. Stop for owner judgment only when the roadmap or canonical project rules identify a genuine boundary, including protocol/policy changes, new paid providers, new durable retention, production write capability, material privacy expansion, or a security tradeoff requiring acceptance.
12. Never claim the overall roadmap complete until real product acceptance and deployment gates relevant to the chosen surface have passed.

## Overall acceptance criteria

The execution-control program is complete only when all of these are true:

1. The server owns authoritative research-session state from routing through finalization.
2. Required applicability cannot be caller-demoted.
3. Real operation results/receipts, not caller completion claims, advance state.
4. Retryable executable work cannot be relabeled terminal by a worker.
5. Protocol drift is detected before authoritative finalization.
6. Candidate discovery, transcripts, community depth, formal search, full text, method audit, bidirectional iteration, treatment-space coverage, and final audit are controller-connected where required.
7. A valid terminal boundary can produce only its permitted bounded output.
8. A complete fixture can reach a server-issued integrity-bound finalization permit/report.
9. Tamper, replay, cross-session, and privacy tests pass for the chosen permit/state design.
10. Hermes cannot bypass controller denial.
11. n8n cannot mark a workflow complete without AskRigor authorization.
12. External orchestration does not become a second copy of research policy.
13. Public MCP/Action changes occur only in reviewed phases with exact inventory tests.
14. Fresh real-product acceptance passes for any Custom GPT projection claimed current.
15. Deployment, plugin, server, protocol, and product artifacts are synchronized to one reviewed release.

## Explicit non-goals

- Do not add another giant system prompt as the primary enforcement mechanism.
- Do not duplicate the existing treatment-landscape assessor in n8n/Hermes.
- Do not treat a signed receipt as semantic truth merely because its structure and provenance validate.
- Do not expose private health/research content to orchestrators unnecessarily.
- Do not give external agents protocol-change, production-secret, direct-main, or completion authority.
- Do not generalize to other projects until AskRigor proves the architecture end to end.

## Recovery and relationship to predecessor plan

The predecessor plan remains authoritative for the owner-approved scientific corrections, study/review audit requirements, accessible/inaccessible source policy, candidate-quality principles, and product-acceptance philosophy. This roadmap is a continuation/reconciliation after PR #58/#59/#61 and should be read together with it.

If this roadmap conflicts with a later explicit owner correction or the complete current canonical protocol bytes, the higher authority wins and this document must be amended through review. Chat summaries never supersede repository state.