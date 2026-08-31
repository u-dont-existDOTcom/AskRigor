# Community Forum hostile lifecycle and research fixture receipt

Date: 2026-08-30
Task ID: `community-forum-hostile-lifecycle-research-20260830`
Disposition: bounded synthetic subtask implemented; root product nonterminal;
no release authorized

## Result

The stacked Community Forum branch now contains executable synthetic-only
integrity routing, moderation/scientific disagreement, publication state and
visibility transitions, withdrawal propagation, and exact
cluster-to-question-to-evidence-check-to-proposal services and persistence.
It builds on PR #143's composer, frontier, and assigned-role queue foundation.

Only invented accounts and invented health reports are used. This slice does
not create a visual/public UI, collect a real story, run a public forum, index
content, publish a real lead, recruit or contact anyone, automate regulatory
reporting, activate a provider, or deploy anything.

## Git boundary and rollback

- stacked base:
  `agent/community-forum-composer-frontier-queues-20260830` at
  `0e3d2e963982f87e2d1338f3da8e74ae87a04fc9`;
- task branch:
  `agent/community-forum-hostile-lifecycle-research-20260830`;
- reviewed implementation commit:
  `14a5c4af4b5b3df5adb9f40c8d8b0363070a61d9`; the final receipt-only commit
  and exact GitHub head are recorded in the PR receipt;
- the task is intended as a stacked PR against that exact base and does not
  authorize merging PR #142, PR #143, or any descendant;
- rollback is the exact base commit above plus the task branch reflog; no
  shared history is rewritten.

## Executable boundaries

### Integrity and human routing

- Commercial coordination, sockpuppets, vote brigading, impersonation,
  reidentification attempts, and dangerous instructions are typed integrity
  signals. Each binds the exact target and source-meaning hash to the required
  moderation/scientific/privacy/safety queues.
- Before/after source meaning, verification, evidence capability, formal-
  evidence relationship, and independent-source count must remain equal.
  Views, replies, and votes are explicitly non-evidentiary.
- Every queue requires independent human review; automated regulatory
  reporting remains false. No hostile instruction or report body is stored.

### Disagreement and publication lifecycle

- A review disagreement references one conduct-moderation event and one
  scientific annotation on the same target. Conduct disposition cannot resolve
  an unresolved scientific question or rewrite the member's meaning.
- Publication state and actual visibility are separate append-only fields.
  `APPROVED` remains `NOT_VISIBLE`; `SYNTHETIC_LAB_PROJECTION` establishes
  initial lab visibility. An explicit `CHALLENGED` transition may preserve a
  visible dispute or place the projection on hold, while withdrawal is always
  not visible. Transitions preserve lead identity and scientific evidence
  state.

### Withdrawal and lead-to-research continuation

- A complete withdrawal receipt requires the exact projection already absent,
  retains no public content, preserves provenance, records contiguous cluster
  recomputation or empty-cluster retirement, and marks dependent questions and
  proposals `REVIEW_REQUIRED`.
- Research questions bind exact cluster versions. Evidence checks bind exact
  question versions. A proposal binds that exact check and question version,
  is rejected when the scope is already answered, and always has
  `recruitmentActive=false` with ethics/privacy/safety review state visible.

## Persistence and privacy

`0005_community_forum_hostile_lifecycle_research.sql` adds seven append-only
surfaces: integrity signals, review disagreements, publication lifecycle
events, exact question/cluster dependencies, exact proposal/evidence-check
links, withdrawal events, and withdrawal-propagation receipts. Database
triggers validate exact
queue sets, review targets, lifecycle continuity, proposal/check identity, and
withdrawal-before-propagation. Constraints prevent evidence upgrades,
visibility confusion, public-content retention, autonomous reporting, and
mutation.

The data map, source-storage policy, threat model, release evidence, durable
work queue, and Public Atlas index describe the new synthetic-only class. Raw
forum bodies, instruction text, raw email values, real identities or health
reports, private subject references, quotations, documents/media, credentials,
provider output, and withdrawn public content remain prohibited.

## Verification

- Runtime: Node `24.18.0`.
- Test-first hostile lifecycle suite: 6 of 6 tests passed after the intentional
  six-test red baseline.
- Disposable PostgreSQL acceptance schema `community_acceptance_1401265`: 14
  of 14 checks passed.
- Living-evidence migration acceptance schema
  `living_evidence_acceptance_1401740`: 35 of 35 checks passed, including the
  immutable five-migration chain.
- Complete deterministic gate: 115 test files passed and 1 skipped; 1,543
  tests passed and 6 skipped; TypeScript typecheck and build passed.
- Test-efficiency checkpoint: 10 observed runs, 578.04 seconds of test time,
  30.46% of task wall time, no forced redundant green rerun. Two complete gates
  ran because final review materially hardened the lifecycle and migration
  contracts between them; both passed.
- Exact GitHub run identities are added to the PR receipt after CI reproduces
  the committed tree.
- Lesson queue at task start: available; 0 open candidates, 0 needs review, 0
  accepted-not-incorporated, 4 incorporated/closed, and 0 deletion eligible.

## Adequacy verdicts

- Operational alignment: `ALIGNED_FOR_LOCAL_SYNTHETIC_ARTIFACT_PENDING_GITHUB`.
  Contracts, services, migration, PostgreSQL acceptance, and privacy boundaries
  satisfy the bounded local slice; exact final GitHub reproduction remains.
- Scientific adequacy: `NOT_APPLICABLE`. Synthetic fixtures support no
  inference about efficacy, causality, prevalence, safety, or real community
  signals.
- Release adequacy: `FAIL_CLOSED`. No real-data consent, security/privacy/legal
  review, staffed operations, deployment, indexing, recruitment, reporting, or
  direct product acceptance exists for this slice.

## Remaining root queue

The root Community Health Forum outcome remains open. The next safe synthetic
closure slice is the remaining hostile acceptance matrix and closed-loop
result propagation: appeals/reversals, formal contradiction and stale-evidence
updates, answered/partial/conflicted question transitions, design-feasibility
gates, and negative-result return to the originating cluster/thread. Every
visual/public, real-user, recruitment, and release step remains separately
gated.
