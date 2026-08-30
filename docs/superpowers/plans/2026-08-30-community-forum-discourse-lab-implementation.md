# Community Forum synthetic Discourse laboratory — execution contract

Date: 2026-08-30
Task ID: `community-forum-discourse-lab-20260830`
Owner-outcome epoch: `1`
Status: `TASK_COMPLETE` for this bounded synthetic slice; root product
nonterminal and release forbidden

## Normalized owner result

Reconcile PR #142 with the corrected Community Health Forum/Public Lead
architecture, then implement and verify only the isolated synthetic Discourse
integration laboratory and its TypeScript contract, PostgreSQL migration, and
repository/service fixtures. The implementation must use only synthetic users
and synthetic health reports, must preserve the two-object publication model,
and must save exact implementation and verification receipts in GitHub.

The root Community Health Forum/Public Lead product remains open. This slice
does not authorize a real forum, real-data collection, public indexing,
research recruitment, a real public lead, deployment, provider spending, or
automated regulatory reporting.

## Controlling semantic invariants

1. `PUBLIC_NARRATIVE` remains subject-voice or attributable publication and
   requires applicable exact-version subject approval.
2. `PUBLIC_RESEARCH_LEAD` is a distinct deidentified attributed report. A
   reporter-consented secondhand lead may pass without subject exact-version
   approval only after privacy and abuse review, with no reasonably identifiable
   subject, private subject quotation, document, image, audio, record, or media,
   no implication of subject verification, prominent source distance and
   limitations, and a satisfied jurisdiction-specific policy gate.
3. Public visibility is independent from verification, completeness, evidence
   capability, formal-evidence relationship, and scientific certainty.
4. Identity verification, votes, reactions, repetition, visibility, and
   moderator status never upgrade causality, prevalence, efficacy, or evidence
   capability.
5. Raw forum bodies are not copied wholesale into the evidence repository.
6. Out-of-order webhook events reconcile by source version; deletion cannot be
   reversed by a stale edit; replay is idempotent; failures remain inspectable.

## Work products

- rebased and reconciled PR #142 branch, with a rollback ref to its prior head;
- deterministic test-only Discourse lab configuration with no public DNS,
  indexing, live email, real accounts, or persistent production data;
- hostile synthetic identity, SSO, event, edit/delete/order, and dead-letter
  fixtures;
- TypeScript runtime contracts for forum references, leads, the two public
  publication objects, consent/privacy gates, events, and public projection;
- PostgreSQL migration for the minimal synthetic bridge/lead/public-version
  slice, with private/public separation and no raw forum body column;
- transactional in-memory repository/service fixture proving the same state
  transitions before any database or provider activation;
- focused hostile tests plus the complete applicable deterministic gate;
- exact branch, commit, diff, test, nondeployment, and rollback receipts in the
  pull request.

## Objective reconciliation matrix

| Owner requirement | Worker interpretation | Task criterion | Acceptance evidence | Status | Authorized change |
| --- | --- | --- | --- | --- | --- |
| Continue from GitHub and reread controlling sources | Treat PR #140 head and its linked artifacts as authority over chat summaries | Exact source commits/hashes and protocol manifests recorded | Source/protocol receipt in task audit | Satisfied | None |
| Rebase and reconcile PR #142 | Preserve useful Phase-A work while replaying it onto corrected PR #140 and replacing the blanket story-only publication gate | PR base is `9d4aa933...`; rollback ref preserves `b0c8c5c...`; hostile two-object tests pass | Git graph, diff, tests, PR receipt | Satisfied locally | Explicit owner-required rebase |
| Implement only the isolated synthetic Discourse laboratory | Build a deterministic local/test harness, not a public provider deployment | Lab rejects non-synthetic identities/reports and disables indexing/outbound/public surfaces | Config validation, pinned runtime acceptance, and hostile tests | Satisfied locally | None |
| Add contract/migration/service fixtures | Implement the minimal forum bridge and publication path required by the corrected architecture | Typed contracts, SQL migration, repository/service and projections agree | Typecheck, nine-check PostgreSQL acceptance, service tests | Satisfied locally | None |
| Use synthetic users and health reports | Every executable fixture carries an enforced synthetic marker | Non-synthetic fixture input is rejected | Four `.invalid` runtime users, three marker-checked topics, and negative tests | Satisfied locally | None |
| Preserve deidentified secondhand public leads | Do not require subject approval for a policy-compliant `PUBLIC_RESEARCH_LEAD`; retain stronger gate for `PUBLIC_NARRATIVE` | Andy-like lead passes; identifiable/quoted/media variants fail; narrative without authorized subject approval fails | Hostile tests | Satisfied locally | None |
| Keep visibility separate from evidence strength | Model and test each axis independently | Publication transitions cannot mutate scientific fields | Mutation-invariance tests and exact public-version record hash | Satisfied locally | None |
| Do not perform real-world/public/recruitment/regulatory actions | No provider credentials, public endpoints, real records, email, indexing, recruitment, or reports | Static inventory and tests show synthetic/nondeployment boundary | Runtime cleanup, privacy/source-storage review, and nondeployment receipt | Satisfied locally | None |
| Run complete gate and review the diff | Use Node 24.18.0, focused tests, `npm run verify`, then inspect exact final diff | All applicable deterministic checks pass and review findings are closed | 51 focused tests; PostgreSQL 9/9; pinned Discourse runtime; 1,528/6 complete test gate; successful build; staged-tree review | Satisfied locally | None |
| Save exact receipts in GitHub | Commit, push with protected rollback, and update PR #142 with exact identities/results | PR #142 body, implementation commit `8000b7ff...`, deterministic run `33336704801`, workflow-policy run `33336704778`, and final PR receipt | Satisfied | None |

## Non-satisfying proxy states

- the corrected architecture documents existing;
- PR #142's old green checks;
- a successful rebase without semantic reconciliation;
- TypeScript typecheck alone;
- synthetic fixtures without a runtime service path;
- tests passing without final-diff/privacy/source-storage review;
- PR readiness, supervisor approval, or deployment readiness;
- any release or public deployment claim.

## Supervision checkpoint

- shared bootstrap: `u-dont-existDOTcom/universal-dev-architecture@90a230e85f78063080dc627ec36a0237c3234f72`, `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`;
- owner source: `docs/audits/2026-08-30-community-forum-discourse-lab-owner-source.txt`;
- independent source limitation: no durable external message identifier was exposed to the worker, so the exact current owner message is preserved as an immutable repository block and hashed by deterministic tooling;
- worker-to-contract alignment: `GREEN`; implementation, the complete local
  gate, final diff review, protected push, independent GitHub checks, and exact
  receipts are complete;
- contract-to-owner alignment: `MATCH` after restoring the corrected two-object rule and the synthetic-only boundary;
- completion claim: `TASK_COMPLETE` for this bounded implementation contract;
  the root Community Forum/Public Lead product remains explicitly nonterminal;
- operational alignment: `ALIGNED_FOR_SYNTHETIC_SLICE`;
- scientific adequacy: `NOT_APPLICABLE` for health-outcome inference; the implementation may encode evidence-capability boundaries but makes no scientific or clinical conclusion;
- release adequacy: `FAIL_CLOSED`; release permission is false and no deployment/publication is authorized;
- contract repair: locally complete; the former public-story helper is explicitly narrative-only and the new two-object runtime contract preserves a reporter-consented deidentified secondhand lead path;
- exact local verification: Node `24.18.0`; focused 2 files/51 tests;
  PostgreSQL acceptance `community_acceptance_20260830g` 9/9; pinned
  Discourse acceptance and owned-runtime cleanup pass; `npm run verify` 113
  files passed/1 skipped and 1,528 tests passed/6 skipped, followed by a
  successful TypeScript build;
- final local review: staged diff is 35 intended files, JSON parses, shell
  syntax and exact-source Compose expansion pass, the lab validator passes,
  no credential/private-owner-data signature was found, and no unresolved
  `TODO`/placeholder marker remains;
- GitHub verification: implementation commit
  `8000b7ff21106a8cf6405b6ca2d219f0e7984a6b`; deterministic run
  `33336704801` / job `99324809018` passed the 1,528-test gate, build,
  35-check living-evidence acceptance, and 9-check Community Forum acceptance;
  workflow-policy run `33336704778` / job `99324809037` passed;
- supervision-design feedback: none identified at this checkpoint.

The required recurring reconciliations were completed after semantic repair,
before the complete gate, before the protected rewrite, and before this typed
completion claim.
