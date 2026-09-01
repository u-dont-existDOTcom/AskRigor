# AskRigor Phase 2.2 Work Queue

**Program:** External Evaluation, Benchmark Integrity, and Scientific Contribution  
**Task ID:** `askrigor-external-evaluation-contribution-v1`  
**Owner approval:** `APPROVED — meta-analysis integrity primary`  
**Queue state:** `ACTIVE — zero-spend NOHARM pilot and analysis-freeze plan merged; paid API path canceled; Chat directive pending`
**Required branch:** `task/mast-noharm-merge-closeout-20260901`
**Activation baseline:** `7964674b8a3dac804620a0e7d1dff62b00a68bf2`  
**Independent-conception baseline:** `c7138eff5dbbce22bb25f727da78006e543fa476`  
**Previous completed task:** `askrigor-living-evidence-promotion-scheduler-v1`  
**Activated:** 2026-09-01

## Queue policy

The promotion scheduler has exact production activation evidence and a protected immutable closeout. The fresh post-closeout priority check found no newer exclusive task, so Phase 2.2 is now the exclusive active program.

MAST is the highest strategic priority for determining whether HRP improves or degrades clinically consequential reasoning. Terminal-Bench-Science has equal calendar urgency until its fixed external deadline. Benchmark-integrity controls are shared infrastructure for both. K-Bench-style authentic-request evaluation remains deferred until the Terminal-Bench submission is secure.

No benchmark case may be used to tune HRP before the first paired evaluation epoch is sealed. No official benchmark result may be silently replaced by an audit-adjusted interpretation.

Partial corpora remain eligible for evidence review and must be explicitly labeled partial; incompleteness is a provenance and interpretation state, not an automatic exclusion rule.

## Current queue

| Priority | Lane | Current state | Next mechanically executable action | Completion boundary |
| --- | --- | --- | --- | --- |
| P0.0 | Activation and queue normalization | **COMPLETE — PR #168** | Preserve canonical activation during child-slice integration | Phase 2.2 is the exclusive protected-main task with the scheduler preserved as previous completed task |
| P0.1 | MAST paired HRP evaluation | **ZERO-SPEND NOHARM PILOT + FREEZE PLAN MERGED / PAID API PATH CANCELED** | Execute only the next exact Chat-authored directive using the owner's ChatGPT access; Codex may not design a replacement | Complete paired SCT and NOHARM epochs with official scores and blinded discordance review |
| P0.2 | Terminal-Bench-Science v0.2 | **DIFFICULTY PREFLIGHT MERGED FAIL-CLOSED / ISSUE #172 AUTHOR + REVIEWER HANDOFF OPEN** | Clean source-layer author constructs the answer-free packet; independent clinical-method reviewer approves it before preflight rerun | Proposal submitted early and a complete upstream PR opened before 2026-10-05 |
| P0.3 | Benchmark integrity governance | **MERGED / CONCRETE TERMINAL FIXTURE DEFECT OPEN** | Preserve the defect until the repaired input passes mechanical and independent review | Every result is version-bound, contestable, independently rechecked when consequential, and preserves original versus corrected epochs |
| P1 | K-Bench-inspired authentic-request evaluation | **DEFERRED** | Revisit after the Terminal-Bench PR is secure | Small blinded multidimensional study of authentic AskRigor requests without pretending there is one constitutional gold answer |

## Activation decision

All previously declared gates are satisfied:

1. the promotion scheduler has exact production activation and protected release receipt `7964674b8a3dac804620a0e7d1dff62b00a68bf2`;
2. protected `main` was resolved fresh after that closeout;
3. no newer open exclusive workstream outranked the owner-approved program;
4. the Terminal-Bench deadline remains feasible;
5. the active pointer preserves the scheduler's release identities as the previous completed task.

Closed PR #167 was a queued-state receipt rendered obsolete by the scheduler's concurrent closeout; none of its changes were merged.

## Terminal-Bench primary after overlap repair

**Working task:** `Dependency-Aware Clinical Meta-Analysis from Overlapping Reports`

The owner-approved direction is retained. The generic subproblem already covered by Terminal-Bench-Science Discussion #333—messy table cleaning, unit normalization, SD recovery, standard effect sizes, conventional random-effects pooling, and heterogeneity—is reused rather than resubmitted.

The retained task core is:

1. reconstruct report-to-study/cohort lineage;
2. distinguish same cohort, nested subgroup, extended follow-up, partial overlap, shared control, independent evidence, and genuinely unresolved relations;
3. reconstruct the target estimand, including population, exact exposure regimen, comparator, outcome, horizon, and effect measure;
4. prevent participant double-counting or model known dependence correctly;
5. exclude or isolate incompatible exposure, comparator, outcome, and time-window estimates;
6. calculate the corrected synthesis and prespecified sensitivities;
7. verify the scientific outcome deterministically rather than score prose.

### Primary go/no-go gates

Proceed to external proposal only when:

- the distinction from Discussion #333 is explicit and defensible;
- a miniature fixture proves objective verification is possible;
- at least two materially different correct implementations pass;
- seeded report-lineage, dependence, estimand, comparator, and time-window errors fail;
- data rights are compatible with redistribution, or semisynthetic construction is transparent and scientifically coherent;
- difficulty comes from specialist evidence identity and treatment-effect reasoning rather than file volume or hidden instructions;
- author experience, AI assistance, and AskRigor-related conflict are disclosed accurately.

The pre-authorized fallback remains absolute-risk reconstruction only if the primary fails one of these gates by the scheduled decision boundary.

## Calendar

| Boundary | Required result |
| --- | --- |
| 2026-09-03 | Source-family, redistribution-rights, and overlap dossier complete |
| 2026-09-06 | Miniature fixture and verifier proof complete; primary/fallback gate decided |
| 2026-09-07 | External proposal ready for submission, subject to owner-controlled identity/contact fields and form assent |
| 2026-09-20 target | Complete task candidate ready for independent scientific and technical review |
| 2026-09-27 target | Upstream pull request |
| 2026-10-05 hard deadline | Current external v0.2 pull-request deadline |

## Allocation until proposal submission

- Terminal-Bench-Science: approximately 45%, because of the fixed deadline;
- MAST paired evaluation: approximately 40%, because it is the highest-value HRP validity test;
- shared benchmark governance and review: approximately 15%.

A correctness or rights blocker in the Terminal-Bench lane transfers effort to MAST rather than lowering scientific standards.

## Completed architecture slice

PR #164 merged the following additive artifacts:

- `docs/superpowers/plans/2026-09-01-external-evaluation-and-scientific-contribution.md`
- `docs/state/EXTERNAL-EVALUATION-CURRENT-STATE.md`
- `evaluation/conception/2026-09-01-independent-conception-snapshot.md`
- `evaluation/governance/source-registry.json`
- `evaluation/governance/correction-and-recheck-policy.md`
- `evaluation/governance/benchmark-manifest.schema.json`
- `evaluation/governance/defect-ledger.schema.json`
- `evaluation/mast/README.md`
- `contributions/terminal-bench-science/overlap-scan.md`
- `contributions/terminal-bench-science/task-design.md`
- `contributions/terminal-bench-science/proposal-draft.md`
- this queue.

That registration preserved `tasks/ACTIVE-TASK.json` and the exact copy-ready files under `project/` until the scheduler release closed.

## Completed bounded child slice A — Terminal-Bench source family and verifier proof

Do not publish final benchmark data or latent answers in the public AskRigor repository. Work in a non-public environment or approved private fork. Public Git records may contain architecture, provenance, rights findings, verifier contracts, and non-answer-bearing test strategy.

Deliverables:

- candidate report-family matrix;
- rights and redistribution decision per source;
- latent study/cohort graph held outside public training surfaces;
- miniature oracle and alternate correct solution;
- invalid baselines and mutation-test results;
- deterministic verifier false-accept/false-reject audit;
- updated proposal evidence.

Bounded result on 2026-09-01: complete for this child slice. The rights decision uses project-authored fictional reports and structured data. A mode-0700 non-public miniature accepted two correct implementations, rejected eight invalid candidates—including distinct person-time/effect-measure and comparator errors—killed six verifier mutants, and observed zero false accepts or false rejects. The public repository contains only the generic verifier, illustrative non-final tests, and non-reversible proof hashes.

## Completed bounded child slice B — MAST adapter and sealed SCT preflight

Deliverables:

- exact paired-condition configuration;
- complete Universal and HRP identities;
- OpenAI-compatible endpoint adapter;
- raw-response preservation and hashing;
- equality tests for all non-instruction conditions;
- deterministic SCT dry run using shipped example data before any later Chat-authored evaluation execution;
- cost ceiling, retry, timeout, and abort rules;
- reviewed preflight manifest.

No paid NOHARM judging begins in this slice. The owner later canceled the paid
API path entirely; only an exact Chat-authored replacement execution directive
may advance this lane.

Bounded result on 2026-09-01: complete for this child slice. Exact paired settings, complete protocol hashes, a Responses API adapter, raw-byte preservation, retry/timeout handling, condition-equality tests, and the deterministic 174-item upstream SCT example reproduction pass. The sealed spend ceiling is zero and no inference occurred.

## Lesson queue status

Authenticated check on 2026-09-01:

- four total lesson candidates;
- zero open;
- zero needing review;
- zero accepted but not incorporated;
- four terminal;
- zero deletion-eligible under the 90-day rule.

The incorporated evidence-weighting lesson applies: broad labels must be decomposed into exact programs, comparators, exposures, and analyzable evidence.

## Deferred work

Until the Terminal-Bench proposal and implementation path are safe:

- no general AskRigor benchmark platform;
- no benchmark-governance taxonomy expansion without a concrete triggering defect;
- no HRP tuning on MAST cases;
- no production deployment, plugin, connector, database, access-agreement, or public-form changes;
- no unrelated corpus or feature expansion unless it blocks a P0 lane;
- no claim that one benchmark proves general medical reliability.

## Stop triggers requiring owner input

- a stronger materially different task competes with the approved primary;
- truthful author-qualification or external-form requirements cannot be satisfied;
- no defensible data-rights path exists;
- objective verification cannot separate correct from scientifically invalid solutions;
- the refined task still duplicates approved or merged work;
- a legal, privacy, security, or clinical-safety issue cannot be bounded without changing the approved objective;
- an external action requires owner-controlled identity, contact, or assent.

## Recovery authority

The controlling plan is:

`docs/superpowers/plans/2026-09-01-external-evaluation-and-scientific-contribution.md`

The exclusive active task is:

`tasks/ACTIVE-TASK.json`

The active program checkpoint is:

`docs/state/EXTERNAL-EVALUATION-CURRENT-STATE.md`
