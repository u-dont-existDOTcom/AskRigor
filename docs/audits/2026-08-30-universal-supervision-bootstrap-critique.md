# Current universal Codex/Pro supervision bootstrap critique

Date: 2026-08-30
Source reread:

- repository: `u-dont-existDOTcom/universal-dev-architecture`
- branch: `architecture/codex-pro-supervision-mission-control-20260830`
- path: `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`

Status: bounded architecture critique for applying the shared bootstrap to AskRigor parallel research

## Core verdict

The updated shared architecture is pointed at the correct class of failure: ordinary execution monitoring is insufficient when the task contract itself has already narrowed or substituted the owner's real objective. The bootstrap should be retained as the common entry point, but AskRigor must not treat text-level instructions alone as proof that the owner objective, task contract, worker heartbeats, supervisor packet, and completion claim remain aligned.

The remaining requirement is **machine-checkable objective reconciliation and independent supervisor source receipt**.

## What the architecture gets right

The current supervision direction correctly recognizes that:

- a worker can appear compliant while pursuing a laundered objective;
- scope contraction, objective substitution, and completion illusion are distinct from ordinary implementation drift;
- the owner request, task contract, acceptance criteria, current canonical state, worker progress, and supervisor verdict must be treated as separate objects;
- a dashboard is an audit/observability layer rather than another autonomous authority;
- review readiness, artifact production, deployment readiness, and actual outcome completion are different states;
- consequential ambiguity and tradeoffs require owner escalation, while ordinary deterministic continuation should proceed;
- GitHub/current runtime state must be refreshed rather than inferred from an old handoff.

Those are necessary corrections to the failure in which “humanize the article and measure it with Pangram” was narrowed into “produce an editorially reviewable preservation packet,” allowing supervision to approve a task that had stopped at 13.82% Human.

## Remaining weaknesses

### 1. The owner source needs immutable identity

A phrase such as “compare with the original owner request” is not sufficient unless every worker and supervisor receives the same immutable object or canonical locator.

Required fields:

- `owner_request_id`;
- exact source or canonical locator;
- `owner_request_sha256`;
- capture timestamp;
- append-only owner corrections with their own identities;
- a rule that later summaries cannot overwrite the source block.

Without identity, two agents can honestly report reconciliation against different summaries.

### 2. The supervisor must receive the owner source independently

The worker's full handoff can be comprehensive and still preserve the worker's framing mistake. The supervisor packet should therefore contain:

- an independently supplied owner-source block;
- a separately supplied current task contract;
- the worker's interpretation;
- the objective-to-criterion reconciliation matrix.

The worker may annotate the owner request, but may not be the only channel through which the supervisor sees it.

### 3. Reconciliation needs a required output schema

Before substantive work, require a versioned matrix:

| Owner requirement | Worker interpretation | Task criterion | Evidence/acceptance test | Status | Authorized change |
| --- | --- | --- | --- | --- | --- |

Every owner requirement must be mapped, explicitly excluded by the owner, or escalated. “Preserve existing acceptance criteria” is unsafe before this matrix passes.

### 4. Completion claims need typed states

Use separate machine states:

- `WORKING`;
- `ARTIFACT_READY`;
- `TESTS_PASS`;
- `READY_FOR_OWNER_REVIEW`;
- `READY_FOR_RELEASE`;
- `OWNER_OUTCOME_ACHIEVED`;
- `PARTIAL_OUTCOME`;
- `BLOCKED_OWNER_DECISION`.

A worker or supervisor cannot infer `OWNER_OUTCOME_ACHIEVED` from any of the preceding states. If the requested outcome was a review packet, the reconciliation matrix makes that explicit.

### 5. Mission Control needs contract-integrity telemetry

Add to every heartbeat and supervisor checkpoint:

```json
{
  "owner_request_sha256": "...",
  "task_contract_sha256": "...",
  "objective_reconciliation_status": "MATCH | PARTIAL | DIVERGED | SOURCE_MISSING",
  "unmapped_owner_requirements": [],
  "authorized_scope_changes": [],
  "completion_claim_type": "WORKING | ARTIFACT_READY | REVIEW_READY | OUTCOME_ACHIEVED",
  "contract_divergence": [],
  "evidence_receipts": []
}
```

Mission Control should display an independent **contract integrity** state in addition to worker alignment.

A worker can be 100% aligned with an invalid task contract. The dashboard must be able to show:

- worker-to-contract alignment: green;
- contract-to-owner alignment: red.

### 6. Fail closed when the owner source is missing

The supervisor cannot issue `ON_TRACK` or approve completion when:

- the owner source cannot be retrieved;
- a material owner requirement is unmapped;
- the task contract diverges;
- the only completion evidence is review readiness or artifact existence;
- a consequential scope change lacks authorization.

Use explicit verdicts such as:

- `OBJECTIVE_SOURCE_MISSING`;
- `CONTRACT_RECONCILIATION_REQUIRED`;
- `OBJECTIVE_DIVERGED`;
- `COMPLETION_CLAIM_UNSUPPORTED`.

### 7. Reconciliation must recur, not only happen at bootstrap

New evidence may show that the original plan cannot produce the intended outcome. Re-run reconciliation:

- after a material discovery;
- before a major phase transition;
- before review readiness;
- before release/deployment;
- whenever the worker changes acceptance tests;
- whenever an owner correction arrives.

This catches plan inadequacy even when no worker has “drifted” in the ordinary sense.

### 8. Owner corrections must be append-only and non-retroactive

A later correction can change future work, but it must not silently rewrite earlier checkpoints. Preserve:

- what the worker believed at each checkpoint;
- what evidence supported that belief;
- when the owner correction occurred;
- which future criteria it superseded;
- whether prior approvals remain historically valid, invalidated, or merely incomplete.

### 9. The Pro supervisor still needs a bounded epistemic role

For AskRigor, the supervisor should assess:

- whether the research question and evidence scope still match the owner objective;
- whether the worker is prematurely synthesizing;
- whether source access or study-method limits cap the claim;
- whether contradictory evidence has been sought;
- whether a public release is safe and warranted.

The supervisor should not become a second untracked researcher, silently add evidence, or rewrite the task. New substantive evidence must enter canonical records with provenance.

### 10. Separate operational, scientific, and release verdicts

AskRigor needs at least three supervisor outputs:

- **Operational alignment:** is the worker executing its assigned lane?
- **Scientific adequacy:** does the current evidence/audit justify the proposed inference?
- **Release adequacy:** may this version be exposed publicly under the product, privacy, licensing, and freshness rules?

A single `ON_TRACK/WATCH/REDIRECT` verdict is not enough for health evidence publication.

## AskRigor-specific supervision extension

Each parallel research job should bind:

- original owner question and hash;
- protocol identities;
- topic and PICO/PECO scope;
- research-frontier identity;
- source/date/language/community lanes;
- worker role and allowed mutations;
- search/source/model/cost budgets;
- exact output schema;
- current coverage and unresolved trails;
- public-release prohibition;
- supervisor escalation criteria.

Worker lanes report evidence-producing events rather than prose progress:

- discovery pass opened/completed;
- candidate identity resolved;
- source access verified/failed;
- study audit completed;
- eligibility decision proposed/verified;
- synthesis contribution added;
- contradiction/integrity trail opened/resolved;
- importance/unexpectedness assessment proposed;
- public explanation drafted;
- release check passed/failed.

## Acceptance tests for the shared bootstrap

The architecture should include hostile fixtures in which:

1. The task contract omits a material sentence from the owner request.
2. The worker substitutes “ready for review” for the requested measured outcome.
3. The worker preserves all current acceptance criteria, but those criteria encode the wrong goal.
4. The supervisor receives only the worker's polished handoff.
5. The owner source is unavailable.
6. A later owner correction changes future criteria without rewriting prior history.
7. A worker is perfectly aligned to a diverged contract.
8. A material discovery makes the approved plan incapable of answering the question.
9. Tests pass while the user-visible product outcome remains absent.
10. Scientific adequacy passes but licensing/privacy blocks public release.

The correct system must detect and classify each failure without relying on the worker to volunteer that it has reframed the task.

## AskRigor adoption decision

**Adopt and extend.** Use the shared bootstrap as the common worker entry point, but add a small AskRigor supervision contract that machine-enforces:

- immutable owner-source identity;
- independent supervisor source receipt;
- objective-to-criterion reconciliation;
- typed completion states;
- recurring reconciliation;
- separate operational/scientific/release verdicts;
- canonical evidence-event heartbeats;
- a hard publication firewall.

Do not fork the general architecture's principles into an unrelated AskRigor-only system. Add the generic contract-integrity fields upstream where possible, then keep only health-research-specific evidence and release fields inside AskRigor.