# Community Forum synthetic Discourse laboratory receipt

Date: 2026-08-30
Task ID: `community-forum-discourse-lab-20260830`
Disposition: synthetic implementation slice complete; root product nonterminal;
no release authorized

## Result

PR #142's useful Phase-A contract work was rebased onto the corrected Public
Lead architecture and reconciled with the two-object publication model. The
branch now contains an isolated, disposable Discourse runtime plus executable
TypeScript contracts, service/repository fixtures, and PostgreSQL migration
acceptance for the synthetic Community Forum bridge.

This receipt covers invented users and invented health reports only. It does
not establish a public forum, accept real stories, publish a real lead, enable
indexing or outbound mail, recruit anyone, or automate a regulatory report.

## Git reconciliation and rollback

- corrected architecture base: `origin/codex/public-discovery-atlas`
  at `9d4aa933281c789db67b06c00506dee7abb9b762`;
- pre-reconciliation PR #142 head:
  `b0c8c5ccd7940ffae98677e36dcd36b3d8d51156`;
- reachable rollback ref:
  `rollback/pr142-pre-public-lead-reconciliation-20260830` at the same old
  head;
- rebased local Phase-A head before this slice:
  `0531364750d46b0211dee1135eafc54caffa119c`;
- task branch:
  `agent/discovery-atlas-phase-a-contract-fixtures-20260830`.

The rewritten remote update must use an exact `--force-with-lease` expectation
for the old head. This receipt does not authorize merging PR #142.

## Implemented surfaces

### Pinned synthetic Discourse substrate

`labs/discourse-synthetic/` and
`scripts/run-discourse-synthetic-acceptance.sh` define a disposable runtime
with:

- official Discourse source commit
  `768a4ed1cd8e6742fe1c1340a9c4ab01318285ec`;
- image
  `docker.io/discourse/discourse_dev@sha256:d8dc0097c0911ebbf1e4844e7db0426ebeae9469637d45fcabc7cd10c516940f`;
- a single `127.0.0.1:33000` HTTP binding, disposable storage, no public DNS,
  deny-all robots policy, `noindex, nofollow`, disabled outbound email, and
  disabled new registration;
- four `.invalid` synthetic users and three synthetic topics whose posts all
  carry `SYNTHETIC — NOT REAL HEALTH DATA`; and
- anonymous, member, moderator, member-only, and private-review permission
  assertions.

The runtime receipt is
`../audits/2026-08-30-community-forum-discourse-runtime-acceptance.json`.
Acceptance used container
`1a6a30325b16015f86deaa2f5aab42651ac59477b85335cc3dad02f33e7c29b4`,
then removed the owned container and volumes. No synthetic-labeled container
remained.

### Contracts and services

- `packages/contracts/src/community-forum.ts` defines account, signed event,
  exact source reference, lead, public-version, verification, challenge,
  correction, duplicate-aware cluster, research-question/evidence-check,
  proposal, moderation, scientific-annotation, safety, consent, and withdrawal
  contracts.
- `packages/evidence-repository/src/community-forum-service.ts` implements
  canonical DiscourseConnect signatures, once-only nonce use, exact loopback
  return routing, account-collision defenses, session invalidation, signed and
  idempotent webhook reconciliation, sanitized hash-only dead letters, public
  projection, and synthetic lead lifecycle fixtures.
- `packages/evidence-repository/src/community-postgres.ts` exercises the same
  boundaries transactionally against PostgreSQL, including signature-before-
  parse, source-event correspondence, monotonic versions, deletion dominance,
  exact public allowlisting, append-only withdrawal, and no raw email storage.
- `packages/evidence-repository/migrations/0003_community_forum_synthetic_lab.sql`
  adds the synthetic schema, append-only guards, recursive prohibited-key
  checks, public-release gates, cluster/proposal/safety nonautomation gates,
  restricted public views, and revoked direct public access.

### Role separation

| Capability | System of record | This slice |
| --- | --- | --- |
| Raw discussion, replies, categories, flags | Discourse | Executable pinned synthetic runtime |
| Account authority and SSO linkage | AskRigor identity plus DiscourseConnect | Executable synthetic service fixture |
| Event transport and source-version reconciliation | Signed Community Bridge | Executable service and PostgreSQL fixture |
| Structured lead and exact public versions | AskRigor evidence repository | Executable contract, migration, and repository fixture |
| Privacy and granular consent decisions | Separate review/event records | Contract and database gates; no staffed operational queue |
| Community moderation | Discourse plus auditable moderation events | Runtime permissions and contract/database records only |
| Scientific annotation and evidence checking | AskRigor scientific review | Contract/database records only; no scientific conclusion |
| Safety escalation | Human-owned safety queue | Candidate contract and no-auto-reporting database gate only |
| Research questions, proposals, mission linkage | Research stewardship | Contract/database records only; recruitment prohibited |

## Controlling publication semantics

`PUBLIC_NARRATIVE` and `PUBLIC_RESEARCH_LEAD` are different public objects.
An attributable narrative or subject-voice presentation requires the
applicable exact-version subject approval. A reporter-consented, deidentified
secondhand research lead may proceed without subject approval only when its
privacy, abuse, and jurisdiction gates pass and it includes no identifiable
subject, private subject quotation, document, image, audio, record, or other
media.

Public visibility remains independent from verification, completeness,
evidence capability, formal-evidence relationship, and scientific certainty.
Publication functions assert that those scientific fields do not change.
Popularity, repetition, identity verification, votes, reactions, or moderator
status do not upgrade them.

Every structured source reference binds the exact signed forum event as well as
forum/topic/post/version/visibility/author/time/content-hash provenance. Raw
forum bodies and raw email addresses are not copied into the evidence
repository. Public projection is a versioned allowlist with an exact record
hash; failures retain only bounded codes and body hashes.

## Verification

- Node runtime: `24.18.0`.
- Focused Community Forum suites: 2 files, 51 tests passed.
- PostgreSQL migration/repository acceptance:
  `community_acceptance_20260830g`, 9 of 9 checks passed.
- Pinned Discourse runtime acceptance: passed with 4 synthetic users, 3
  synthetic topics, all marker and permission checks true, registration/email/
  indexing disabled, and cleanup verified.
- Complete deterministic gate: `npm run verify` passed on stable source; 113
  test files passed and 1 skipped, 1,528 tests passed and 6 skipped, followed by
  a successful TypeScript project build.
- GitHub independently reproduced the implementation at commit
  `8000b7ff21106a8cf6405b6ca2d219f0e7984a6b`: deterministic run
  `33336704801` / job `99324809018` passed the same 1,528-test gate and build,
  the 35-check living-evidence PostgreSQL acceptance, and the 9-check synthetic
  Community Forum PostgreSQL acceptance. Workflow-policy run `33336704778` /
  job `99324809037` also passed.
- Test-efficiency observation: 36 runs, 2,169.487 seconds of test wall time,
  49.74% of task elapsed time; all 3 complete-gate runs passed and no redundant
  green run was forced.
- Lesson queue closeout: available; 0 open candidates, 0 needs review, 0
  accepted-not-incorporated, 4 incorporated/closed, and 0 deletion eligible.

## Adequacy verdicts

- Operational alignment: `ALIGNED_FOR_SYNTHETIC_SLICE`. The runtime,
  contracts, migration, services, tests, receipts, and cleanup satisfy this
  bounded implementation contract.
- Scientific adequacy: `NOT_APPLICABLE`. Synthetic fixtures prove software
  behavior only and support no inference about efficacy, causality,
  prevalence, safety, or real-world community signals.
- Release adequacy: `FAIL_CLOSED`. Privacy, consent, licensing, security,
  operations, moderation, safety staffing, public-review, and production
  acceptance for real data have not been established. Release permission is
  false.

## Remaining root-product queue

The progressive structured-experience composer and public-frontier UI remain
unimplemented, as do staffed moderation/privacy/safety queues and their hostile
fixtures. A real-user pilot, production deployment, search indexing, public
lead release, recruitment, and direct product acceptance all remain separately
gated in
`../work-queue/2026-08-30-community-health-forum-and-public-lead-frontier.md`.
