# Community Forum composer, frontier, and queue fixture receipt

Date: 2026-08-30
Task ID: `community-forum-composer-frontier-queues-20260830`
Disposition: bounded synthetic subtask implemented; root product nonterminal;
no release authorized

## Result

The stacked Community Forum branch now contains executable synthetic-only
composer transitions, balanced public-frontier view models, explicit
actor-role/capability operational queues, append-only PostgreSQL persistence,
and hostile fixtures. It builds on PR #142's reconciled synthetic Discourse and
public-lead foundation.

The slice uses invented accounts and invented health reports only. It does not
create a visual/public UI, collect a real story, run a public forum, index
content, publish a real lead, recruit anyone, contact a subject, automate a
regulatory report, activate a provider, or deploy anything.

## Git boundary and rollback

- stacked base: `agent/discovery-atlas-phase-a-contract-fixtures-20260830` at
  `4f702de7243a6b4d2faa20658b61fc76319aeff8`;
- task branch:
  `agent/community-forum-composer-frontier-queues-20260830`;
- the task is intended as a stacked PR against that exact base and does not
  authorize merging PR #142 or any descendant;
- rollback is the exact base commit above plus the task branch reflog; no
  shared history was rewritten.

## Implemented contract and service surfaces

### Progressive composer

- A forum post begins as `ORDINARY_CONVERSATION`. Lead conversion must be
  offered and accepted by the synthetic reporter. A direct structured intake
  uses a distinct entry point and cannot masquerade as a post conversion.
- The member may stop early. Null fields and `missingMaterialFields` remain
  explicit; no timing, persistence, co-intervention, harm, or unknown value is
  inferred.
- Reporter relationship, information origin, source distance, condition
  certainty, exact combination, direction, timing/persistence,
  co-interventions, harms, unknowns, and granular permissions remain separate.
- A synthetic publication request requires affirmative public-lead permission,
  a hashed exact paraphrase/source-distance/limitations preview, and reporter
  acknowledgement of that preview.

### Public-frontier view model

- Cards preserve exact public-version and lead/version identity, source
  distance, condition certainty, exact combination, reported direction,
  timing/persistence, verification, completeness, evidence capability, formal-
  evidence relationship, harms/no effect, confounders, clusters,
  challenges/corrections/withdrawal, research state, and discussion activity.
- The default view deterministically interleaves no-effect, harm, benefit,
  mixed, and unknown buckets. High views/replies cannot change ordering within
  a bucket or any evidence field.
- Counts are duplicate aware through source-independence keys. The view
  hardcodes `denominatorAvailable=false`,
  `effectivenessPercentageDisplayPermitted=false`, and the self-selected-report
  denominator boundary.

### Operational queues

- Moderation, privacy, scientific annotation, safety, research stewardship,
  methods/ethics, and administration have distinct queue types and capabilities.
- Append-only actor-role assignments and an explicit active role are required
  before action. Role/capability, queue/capability, action/capability, and
  action/resulting-state mappings are checked in TypeScript and PostgreSQL.
- An originator cannot perform a required independent review. Every action
  carries exact source-meaning before/after hashes, which must remain equal;
  scientific context is a separate annotation rather than a silent rewrite.
- Serious-harm candidates can enter human review, while both contract and
  database require `automatedRegulatoryReporting=false`.

## Persistence and privacy

`0004_community_forum_composer_frontier_queues.sql` adds append-only composer
versions, frontier snapshots, queue items, actor-role assignments, and actions.
The repository uses validated payload hashes, contiguous composer versions,
synthetic/lab-only markers, public-frontier prohibited-key screening,
assigned-role foreign keys, independent-review checks, immutable source
meaning, and nonautomation constraints.

The data map, source-storage policy, threat model, release evidence, work queue,
and Public Atlas index now describe this synthetic-only class. Raw forum
bodies, raw email values, private subject references, direct private subject
quotations, documents/media, credentials, real health data, and unrestricted
provider output remain prohibited.

## Verification

- Runtime: Node `24.18.0`.
- Focused Community Forum regression: 2 files, 31 tests passed.
- Disposable PostgreSQL acceptance schema `community_acceptance_1358163`:
  12 of 12 checks passed; the owned container was removed afterward.
- Complete deterministic gate: 114 files passed and 1 skipped; 1,537 tests
  passed and 6 skipped; TypeScript typecheck and build passed.
- Test-efficiency checkpoint before final GitHub verification: 20 observed
  runs, 584.20 seconds of test time, 29.29% of task wall time, no forced
  redundant green rerun. Two complete gates ran only because the final review
  materially hardened the source contract between them; both passed.
- Lesson queue at the pre-PR checkpoint: available; 0 open candidates, 0 needs
  review, 0 accepted-not-incorporated, 4 incorporated/closed, and 0 deletion
  eligible.

## Adequacy verdicts

- Operational alignment: `ALIGNED_FOR_SYNTHETIC_SUBTASK`. The executable
  contract, state services, migration, repository path, hostile tests, privacy
  records, and local gates satisfy this bounded slice.
- Scientific adequacy: `NOT_APPLICABLE`. Synthetic fixtures support no
  inference about efficacy, causality, prevalence, safety, or real community
  signals.
- Release adequacy: `FAIL_CLOSED`. No visual/public UI, real-data consent,
  legal/regulatory review, security review, staffed operations, deployment,
  indexing, recruitment, reporting, or direct product acceptance exists for
  this slice.

## Remaining root queue

The root Community Health Forum outcome remains open. The next bounded
synthetic service slice is the remaining hostile manipulation and lifecycle
frontier: commercial/sockpuppet coordination, vote brigading, dangerous-
instruction routing, moderator/scientific disagreement, publication-state
confusion, withdrawal propagation through clusters, and the existing
question/proposal lead-to-research contracts. Visual/public implementation and
every real-user or release step remain separately gated.
