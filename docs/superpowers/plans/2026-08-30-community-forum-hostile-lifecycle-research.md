# Community Forum hostile lifecycle and lead-to-research fixtures — execution contract

Date: 2026-08-30
Task ID: `community-forum-hostile-lifecycle-research-20260830`
Owner-outcome epoch: `1`
Assurance lane: `iteration`, with privacy, role, withdrawal, and nonautomation hard gates
Status: `LOCAL_ARTIFACT_READY_PENDING_GITHUB`

## Owner result and authority

Continue the durable Community Health Forum/Public Lead work queue from the
verified PR #143 head. The next bounded result is a synthetic-only
contract/service/migration implementation for remaining hostile manipulation,
publication-state, withdrawal-propagation, and lead-to-research behavior.

Authority is the current owner-source receipt, the updated work-queue next
state, canonical protocol manifests, and controlling forum architecture. This
slice remains UI-neutral. It does not authorize visual generation, public
pages, real accounts or reports, indexing, recruitment/contact, provider
activation, regulatory reporting, deployment, or merging any stacked PR.

## Required outcomes

1. Commercial coordination, sockpuppets, vote brigading, impersonation,
   reidentification attempts, and dangerous instructions route to separately
   authorized integrity/moderation/safety work without increasing scientific
   certainty or source independence.
2. Moderation actions and scientific disagreements remain separate append-only
   records; neither silently rewrites member meaning or resolves the other
   discipline's question.
3. Publication lifecycle state and actual visibility are explicit. Approval,
   challenge, correction, withdrawal, and supersession cannot be confused with
   evidence strength or silently expose a record.
4. Withdrawal removes the exact synthetic public projection, recomputes or
   retires affected clusters, and marks dependent questions/proposals for
   review without erasing provenance or retaining public content.
5. Cluster-derived questions, evidence checks, and proposals use the existing
   contracts with contiguous versions, exact dependencies, unresolved-state
   preservation, and `recruitmentActive=false`.
6. All records and tests remain synthetic and lab-only. No health finding,
   efficacy percentage, autonomous safety/regulatory action, or real release is
   representable.

## Objective reconciliation matrix

| Owner requirement | Worker interpretation | Task criterion | Evidence | Status |
| --- | --- | --- | --- | --- |
| Always continue the work queue | Start a new stacked branch from green PR #143 without owner-mode selection | Exact base and durable next-state checkpoint | Git graph and plan | Satisfied locally |
| Preserve independent evidence axes | Manipulation/engagement/moderation cannot mutate verification, evidence capability, or independence | Before/after equality and duplicate-aware fixtures | Hostile tests | Satisfied |
| Preserve human governance | Dangerous/safety content is queued, never auto-reported; disagreements stay reviewable | Capability and nonautomation gates | Service and database tests | Satisfied |
| Preserve lifecycle integrity | Visibility and scientific state remain separate through challenge/correction/withdrawal | Typed transitions and propagation receipt | Service/migration acceptance | Satisfied |
| Continue research from leads | Questions/evidence checks/proposals advance only from exact cluster versions and remain nonrecruiting | Contiguous version and dependency checks | Focused tests | Satisfied |

## Non-satisfying proxy states

- merely labeling engagement as suspicious without proving evidence invariance;
- deleting a withdrawn lead while leaving a stale public cluster/question;
- one generic administrator action standing in for moderation, science,
  privacy, and safety;
- treating `APPROVED` as synonymous with publicly visible;
- generating a proposal without an exact question/evidence-check state;
- green unit tests without append-only PostgreSQL acceptance;
- PR readiness treated as root Community Forum completion.

## Verification strategy

- Start independent test-efficiency telemetry for this task.
- Add failing hostile fixtures before implementation.
- Use focused service tests in the inner loop.
- Exercise migration/repository behavior against disposable PostgreSQL.
- Run the complete deterministic gate at the pre-PR boundary.
- Review privacy, source-storage, lifecycle, role, and nonrelease changes before
  the completion claim.

## Supervision checkpoint

- bootstrap:
  `u-dont-existDOTcom/universal-dev-architecture@90a230e85f78063080dc627ec36a0237c3234f72`,
  `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`;
- independent owner source: exact message at
  `docs/audits/2026-08-30-community-forum-hostile-lifecycle-research-owner-source.txt`;
- stacked base:
  `agent/community-forum-composer-frontier-queues-20260830@0e3d2e963982f87e2d1338f3da8e74ae87a04fc9`;
- worker-to-contract alignment: `YELLOW_PENDING_GITHUB_REPRODUCTION`;
- contract-to-owner alignment: `MATCH`;
- completion claim: `ARTIFACT_READY` (local, nonterminal);
- operational alignment: `ALIGNED_FOR_LOCAL_SYNTHETIC_ARTIFACT`;
- scientific adequacy: `NOT_APPLICABLE`;
- release adequacy: `FAIL_CLOSED`;
- root outcome: nonterminal;
- supervision-design feedback: none identified.

Reconcile before database integration, before the stacked PR, and before any
completion claim.
