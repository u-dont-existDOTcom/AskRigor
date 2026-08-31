# Community Forum privacy/provenance hostile-matrix closure — execution contract

Date: 2026-08-31
Task ID: `community-forum-privacy-provenance-matrix-20260831`
Status: `ARTIFACT_READY_PENDING_GITHUB`

## Result and authority

Continue from the exact green PR #145 head. Audit all 30 hostile cases in the
controlling Community Forum specification against executable contracts,
services, migrations, and tests from PRs #142–#145. Implement only confirmed
synthetic Stage-A gaps in privacy and provenance. Do not create public UI,
collect real content, activate external providers, index, recruit, report,
deploy, or merge stacked PRs.

## Confirmed bounded gap set

1. Exact reidentification/generalization decision for rare condition plus
   location, clinic, age/date, quote/media, backlink, or relational signals.
2. Explicit minor/unknown-age enhanced privacy and guardian/legal review gate.
3. Low-detail multi-hop hearsay public-tier fixture preserving missingness and
   low provenance without forcing privacy merely because evidence is weak.
4. External-source extraction boundary for terms, attribution, source
   visibility, quotation permission, privacy, deletion, and raw-body storage.
5. Deleted-source retention decision that distinguishes independent lead
   consent/policy from source-post deletion and preserves content-free
   provenance.
6. Paid/private intake boundary: no forum record or public projection without a
   later, separately versioned affirmative public-lead consent workflow.

## Non-satisfying proxies

- a privacy-risk enum without an executable eligible/hold/block decision;
- `subjectIdentifiable=false` standing in for generalization evidence;
- guardian consent standing in for legal/privacy review of a minor;
- `PUBLIC_SOURCE_EXTRACTED` as a label without terms/attribution/deletion
  enforcement;
- deleting source provenance or retaining raw deleted content;
- treating payment/private intake as public consent;
- adding duplicates of hostile cases already executable.

## Verification and supervision

- red fixtures precede implementation;
- new state is append-only, synthetic/lab-only, and content-free;
- PostgreSQL acceptance exercises the exact gap gates;
- complete deterministic verification precedes a stacked PR;
- stacked base:
  `agent/community-forum-closed-loop-hostile-20260831@8e20185f69086395fb2cf4ae2cf814938515a874`;
- shared supervision bootstrap:
  `u-dont-existDOTcom/universal-dev-architecture@90a230e85f78063080dc627ec36a0237c3234f72`;
- owner source:
  `docs/audits/2026-08-31-community-forum-privacy-provenance-matrix-owner-source.txt`;
- worker-to-contract: `YELLOW_PENDING_GITHUB_REPRODUCTION`;
- contract-to-owner: `MATCH`;
- completion claim: `ARTIFACT_READY` (local, nonterminal);
- operational alignment: `ALIGNED_FOR_LOCAL_SYNTHETIC_ARTIFACT`;
- scientific adequacy: `NOT_APPLICABLE`;
- release adequacy: `FAIL_CLOSED`;
- root outcome: nonterminal;
- supervision-design feedback: none.

## Local completion evidence

- post-closure hostile matrix: 30 of 30 executable;
- focused privacy/provenance suite: 6 of 6 passed after an intentional 5-fail,
  1-pass red baseline;
- PostgreSQL Community acceptance `community_acceptance_1477796`: 20 of 20;
- living-evidence acceptance `living_evidence_acceptance_1477815`: 35 of 35;
- complete deterministic gate: 117 passed test files and 1 skipped; 1,554
  passed tests and 6 skipped; typecheck and build passed;
- remaining action: commit, publish the stacked PR, and capture exact GitHub
  deterministic/workflow-policy receipts.
