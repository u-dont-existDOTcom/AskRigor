# Phase E — Bidirectional iteration and treatment-space finalization

Status: implemented and locally verified on
`agent/execution-control-phase-e-20260824`; PR/hosted-CI review pending

Authority: current owner requirements, complete current `protocols/HRP_Full.xml`
and `protocols/Universal_Instructions.xml`, then the productionization roadmap.
This plan does not amend protocol policy.

## Objective

Make both evidence-transfer directions and the treatment-landscape locks part of
server-owned research-session state. A client may perform bounded semantic work,
but it cannot assert that iteration, coverage, or finalization is complete.
Phase E may derive finalization readiness; Phase F remains the first phase that
can issue a finalization permit or authorize successful finalization.

## Existing mechanisms to reuse

- candidate identities, program fingerprints, selection decisions, and scout /
  native-search receipts in `research-candidate-frontier.ts`;
- transcript and complete-discussion receipt chains in
  `research-video-depth-controller.ts`;
- formal hypotheses, provider searches, lawful full text, method audits,
  external-study evidence, linked-source work, and claim capability in
  `research-formal-evidence.ts`;
- deterministic selection, per-video-depth, and synthesis locks in
  `treatment-landscape-coverage-route.ts`;
- protocol drift, monotonic applicability, immutable receipts, and the single
  top-level output boundary in `research-session-controller.ts`.

Do not add a second controller, duplicate the treatment assessor, expose a new
public Action/MCP tool, or store raw transcript/comment/provider content in
session state.

## Design

### 1. Server-owned bidirectional state

Add a transport-independent bidirectional controller with:

- an exact evidence-basis digest derived from selected candidate identities,
  transcript/discussion receipts, formal hypotheses/sources, full-text/method /
  external-evidence receipts, linked-work state, and claim capabilities;
- bounded worker packages listing every exact community and formal source that
  must be assessed;
- exact per-source assessments in both directions, so silence cannot masquerade
  as coverage;
- material transfer records for programs, failure/no-effect, harm, durability,
  adherence, progression, implementation, integrity, replication,
  reproduction, review ancestry, and formal discriminators;
- explicit pending, retryable, terminal-bounded, and completed states;
- discordance records that preserve disagreement instead of forcing
  reconciliation.

Worker submissions are semantic findings, not completion authority. They must
match the current work-package digest and exact packaged source identities.
The server derives transfer identities, execution state, and whether another
round is required.

### 2. Community-to-formal reopening

Material community/video transfers append new formal hypotheses monotonically.
Existing hypotheses, sources, receipts, and completed work remain immutable.
New hypotheses reopen only the formal operations their new work actually
requires. The formal frontier digest changes in a server-derived, append-only
way, and stale source-screening or bidirectional packages are rejected.

### 3. Formal-to-community return work

Formal/external findings create exact discriminator-search work against the
already selected, broadly acquired discussion pools. The controller executes
query-bounded return searches through an injected executor, stores only bounded
receipt/hash/count state, and marks query-bounded results as supplemental
discovery rather than a replacement for corpus acquisition.

Any result that may contain a new material community hypothesis requires a
second source-bound semantic assessment. A material result becomes a new
community-to-formal transfer and reopens formal work. Retryable search remains
executable; a genuine terminal provider boundary permits only bounded state.

### 4. Iteration convergence

A bidirectional round is complete only when:

- both directions were assessed against every exact eligible source;
- all material transfers were executed, audited, or genuinely bounded;
- every appended formal hypothesis completed the required formal/full-text /
  method/external/linked/recalculation path;
- formal return searches and their result assessments are resolved;
- the latest round is bound to the current evidence-basis digest; and
- no new material hypothesis remains open.

Evidence changes invalidate convergence and create a new bounded work package.
They do not erase prior rounds or receipts.

### 5. Session-derived treatment landscape

Create a treatment-landscape semantic work package from exact session-owned
candidate/search/program/video/formal/bidirectional records. A worker may label
semantic relationships that cannot be derived mechanically, but cannot supply
counts, source identities, access statuses, receipt completeness, or audit
completion.

The server constructs the existing `TreatmentLandscapeCoverageInput` from:

- exact scout/native discovery frontiers and queries;
- exact candidate/program/selection state;
- exact transcript/discussion receipts;
- exact formal follow-up state by program;
- exact bidirectional direction/expansion state; and
- source-bound semantic labels from the current work package.

It then calls `assessTreatmentLandscapeCoverage` unchanged. The resulting
selection, depth, and synthesis locks are stored as the authoritative treatment
state. A stale package, omitted candidate/search/program, invented identity, or
forged pass is rejected.

### 6. Output boundary and final audit

Derive Phase E readiness as:

- `CONTINUE_RESEARCH` for executable/incomplete/retryable work or failed locks;
- `BOUNDED_NONRANKING_ONLY` only for recognized terminal boundaries with no
  remaining executable work and no full-ranking permission;
- `FINALIZATION_ALLOWED` readiness only after current protocols, required
  modules, all deterministic receipt paths, bidirectional convergence,
  treatment locks, and required final-completion-audit state all pass.

Phase E does not issue a permit and `evaluateResearchFinalization` remains
denied. Phase F will bind a successful permit to the completed state digest.

## Implementation order

1. Add bidirectional schemas, work-package generation, source-bound submission,
   formal-hypothesis append/reopen, return-search receipts, diagnostics, and
   hostile unit tests.
2. Add append-only formal-frontier transition validation and session operation /
   capability projections.
3. Add session-derived treatment work package, structural projection into the
   existing assessor, stored outcome, diagnostics, and hostile tests.
4. Add Phase E readiness derivation and final-completion-audit prerequisite
   without enabling Phase F permit issuance.
5. Add known broad-treatment and unrelated held-out regression fixtures proving
   unresolved transfers, failed locks, retryable work, omitted modules,
   configured-provider gaps, and decision-changing linked work cannot reach
   readiness.
6. Update current-state, roadmap, privacy/security/release documentation and
   lesson disposition; run focused tests, `npm run test:run`, `npm run verify`,
   inspect the full diff, open/review/merge the PR, then restart Phase F from
   fresh `main`.

## Hostile-test minimums

- stale or cross-frontier semantic submission rejected;
- omitted or invented source assessment rejected;
- caller-authored completion/pass/count fields rejected by strict schemas;
- one transfer direction cannot satisfy both;
- material community transfer reopens formal work;
- new formal evidence invalidates a previously converged round;
- retryable discriminator search remains executable;
- query-bounded comment search cannot satisfy corpus-depth acquisition;
- unaudited decision-changing linked work prevents convergence/readiness;
- treatment input is reconstructed from session receipts, not caller counts;
- failed selection/depth/synthesis locks remain `CONTINUE_RESEARCH`;
- terminal bounded state is not full ranking or completion;
- FINAL_COMPLETION_AUDIT is required for readiness;
- no Phase E path can issue a finalization permit.

## Verification and boundaries

- No public MCP/Action inventory change in Phase E.
- No new provider, credential, endpoint, durable store, retention, deployment,
  plugin, Custom GPT, or protocol-byte change.
- Session state stores only bounded semantics, exact identities, receipts,
  hashes, counts, and limitations—never raw private prompts, transcript text,
  comment bodies, or unrestricted provider output.
- The prototype remains outside production inventory.

## Verification result

- Focused Phase E enforcement: 68/68 tests passed.
- Complete deterministic gate: `npm run verify` passed typechecking, 1,279
  tests with six declared skips, and the production build.
- Two unrelated load-sensitive tests timed out on separate initial parallel
  runs, then passed individually; the unchanged complete gate passed on rerun.
- Public inventory remains 21 MCP tools and 26 Actions.
