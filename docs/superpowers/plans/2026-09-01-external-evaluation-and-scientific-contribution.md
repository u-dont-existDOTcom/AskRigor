# AskRigor External Evaluation and Scientific Contribution Plan

**Task ID:** `askrigor-external-evaluation-contribution-v1`  
**Program:** Phase 2.2 — External Evaluation, Benchmark Integrity, and Scientific Contribution  
**Owner approval:** `APPROVED — meta-analysis integrity primary`  
**Branch:** `task/external-evaluation-phase22-execution-20260901`
**Integration baseline:** `4556b58e55fc445920f831b7a1451c805283a697`
**Independent-conception baseline:** `c7138eff5dbbce22bb25f727da78006e543fa476`  
**Status:** active parent program; rights/verifier and MAST sealed-preflight child slice ready for protected merge
**Completed predecessor:** `askrigor-living-evidence-promotion-scheduler-v1`
**Assurance lane:** evaluation and scientific-governance iteration; no production mutation

## 1. Owner outcome

Organize and execute the AskRigor work queue around four linked developments:

1. measure whether HRP improves or degrades clinically consequential reasoning using MAST;
2. submit a scientifically legitimate HRP-derived task to Terminal-Bench-Science v0.2 before its fixed deadline;
3. adapt SciCode-Verified's benchmark-correction architecture so evaluator defects do not silently become AskRigor truth;
4. later test authentic open-ended AskRigor requests with a K-Bench-like multidimensional design where no single gold answer is defensible.

The approved Terminal-Bench primary remains meta-analysis integrity. A bounded existing-work scan found a directly overlapping approved proposal for generic reconstruction of a meta-analysis from messy supplementary tables. The owner-approved direction is therefore preserved but narrowed to its unsolved remainder: **clinical report lineage, participant dependence, exposure/estimand compatibility, and comparator validity before pooling**.

This program was approved while another worker completed the promotion-scheduler release. PR #166 preserves its exact VPS activation and immutable closeout, and PR #168 activates this parent program from that protected baseline. The current execution branch preserves that canonical activation while closing only the bounded rights/verifier and MAST sealed-preflight child slice.

## 2. Independent conception preserved

The pre-scan conception is preserved verbatim in substance at:

`evaluation/conception/2026-09-01-independent-conception-snapshot.md`

Its candidate mechanism was paired bare-versus-HRP evaluation plus an executable meta-analysis-integrity task, governed by versioned evaluator provenance and later supplemented by a no-clean-ground-truth evaluation. Existing work supplements this conception; it does not retroactively replace it.

## 3. Existing-work reconciliation

### 3.1 Already solved or reusable

- MAST supplies a runnable OpenAI-compatible clinical benchmark harness, 174 open Script Concordance Test items with deterministic scoring, and 30 open First Do NOHARM cases with up to 330 case variants and specialist-rubric/LLM-judge scoring.
- Terminal-Bench-Science supplies Harbor task packaging, proposal review, automated review, domain review, technical review, final bar-raiser review, versioning, and repair procedures.
- Cochrane treats the study rather than the report as the unit of interest and requires multiple reports of the same study to be linked.
- ICH E9(R1) supplies the estimand discipline needed to distinguish the treatment effect being targeted from the estimator and numerical estimate.
- Covidence and the Cochrane Register of Studies implement study/report linkage in mature review tooling.
- Standard meta-analysis software already computes conventional effect sizes, random-effects models, multilevel/multivariate models, and covariance-aware synthesis when dependence is known.
- SciCode-Verified supplies the most relevant benchmark-repair pattern: source of truth, decision-as-data ledger, preserved before/after states, manifest-bound artifacts, and independent domain re-check.

### 3.2 Direct overlap

Terminal-Bench-Science Discussion #333, approved Task Proposal #178, already proposes:

- parsing messy CSV/XLSX supplementary tables;
- normalizing labels and units;
- recovering SD from SE or confidence intervals;
- resolving duplicate or incompatible arms;
- computing Hedges g or log response ratios;
- running a random-effects meta-analysis;
- emitting an evidence table, effect sizes, pooled estimates, heterogeneity, and an audit report.

AskRigor must not submit that task again under different wording.

### 3.3 Novel remainder retained

The AskRigor contribution will instead test whether an agent can reconstruct the **latent study and estimand structure** from multiple clinical reports before performing synthesis. The central failures are:

- treating reports as independent studies;
- double-counting identical, nested, partially overlapping, or shared-control participants;
- combining different doses, routes, formulations, timing, or treatment policies as one exposure;
- mixing event risks, incidence rates, follow-up windows, or materially different outcome definitions;
- accepting a comparator that does not identify the declared treatment contrast;
- presenting a pooled result whose direction or practical conclusion changes after invalid evidence is removed.

The generic cleaning and random-effects mechanics are reused as baseline infrastructure, not claimed as innovation.

## 4. Explicit build decision

**Decision: compose and adapt; invent only the benchmark fixture and verifier needed for the unresolved remainder.**

- **Reuse:** Harbor task format, Cochrane study/report model, ICH estimand framing, standard effect-size and random-effects calculations, standard machine-readable output formats.
- **Adapt:** SciCode-Verified's provenance, correction, independent re-check, versioning, and original-versus-corrected preservation.
- **Compose:** report lineage + exposure-indexed estimand matching + dependency-aware selection + deterministic synthesis.
- **Invent:** a compact benchmark instance and verifier that make those linked judgments objectively testable without an LLM judge.
- **Experiment:** measure frontier-agent solve rate, anti-shortcut robustness, verifier false-rejection risk, and whether the task remains difficult for scientifically substantive reasons.

## 5. Queue order

### P0.0 — Queue registration and predecessor preservation — complete

Completion boundary:

- the promotion scheduler remained the exclusive active task until its exact production receipt reached protected `main`;
- this program, its child lanes, source identities, overlap decision, and next actions were stored as a queued-next record;
- `tasks/ACTIVE-TASK.json` was replaced by PR #168 only after the scheduler terminal closeout and fresh priority check;
- prior production identities remain preserved;
- the private lesson queue is checked and recorded.

### P0.1 — MAST paired HRP evaluation

Strategic priority: highest for HRP validity once this program becomes active.

Run the same base model in two sealed conditions:

- bare model with a minimal neutral wrapper;
- identical model and execution settings with the complete current Universal + HRP instruction path.

Order:

1. endpoint and parser smoke test on non-analytic development traffic;
2. complete 174-item SCT run;
3. bounded NOHARM pilot to freeze analysis margins and estimate judge stability/cost;
4. complete 30-case, 330-variant open NOHARM run;
5. blinded audit of condition-discordant cases;
6. only after sealing the epoch, derive any HRP repair candidates.

Primary outcomes:

- paired SCT score difference;
- paired NOHARM severity-weighted F1 difference.

Safety constraints:

- no material increase in severe harmful recommendations;
- no unacceptable deterioration in worst-variant performance;
- aggregate gains may not conceal domain, perturbation, or case-family regressions;
- official benchmark scores remain unchanged even when a separate contestability audit identifies a possible rubric defect.

### P0.2 — Terminal-Bench-Science v0.2 contribution

Calendar priority: equal to MAST until submission because the current official release announcement states a pull-request deadline of **2026-10-05**.

Approved primary, refined after overlap scan:

**Dependency-Aware Clinical Meta-Analysis from Overlapping Reports**

Target dates are measured from the scheduler closeout but retain the external hard deadline:

- first three active days: overlap, standards, source-rights, and task-boundary dossier complete;
- first six active days: miniature fixture and verifier proof complete; proposal ready;
- first seven active days: proposal submitted early, subject to owner-controlled external fields;
- 2026-09-20 target: complete task candidate;
- 2026-09-27 target: upstream PR;
- 2026-10-05: hard external PR deadline.

The absolute-risk reconstruction task remains a pre-authorized fallback only if the refined primary fails author-fit, rights, objective-verification, overlap, or difficulty gates.

### P0.3 — Benchmark integrity governance

Before interpreting full MAST results or freezing the Terminal-Bench verifier:

- bind every result to exact benchmark, dataset, scorer, judge, model, protocol, endpoint, and code identities;
- preserve raw outputs and original scores;
- record every suspected defect with exact location, before/after state, justification, disposition, and affected epochs;
- require an independent domain re-check for any correction that changes a scientific conclusion or score;
- publish corrected results as a new evaluator epoch rather than overwriting the original;
- treat gold answers as versioned evidentiary claims, not constitutional truth.

### P1 — K-Bench-inspired authentic-request evaluation

Defer until the Terminal-Bench submission is secure. Use authentic AskRigor requests and original source packets, blinded condition labels, multiple judges, artifact inspection, and a profile of scientific accuracy, reasoning, evidence use, uncertainty, overclaiming, practical usefulness, and communication. Do not claim direct K-Bench comparability without its unreleased task set.

## 6. Lesson queue check

Authenticated inspection of `u-dont-existDOTcom/AskRigor-lessons` on 2026-09-01 found:

- four total lesson-candidate issues;
- zero open candidates;
- zero `needs-review` candidates;
- zero accepted-but-not-incorporated candidates;
- four terminal candidates;
- zero deletion-eligible candidates under the 90-day rule.

The incorporated evidence-weighting lesson remains active here: compare exact programs, comparators, and analyzable evidence rather than hiding missingness under umbrella labels.

## 7. Source identities

Machine-readable identities and source-specific discrepancies are recorded at:

`evaluation/governance/source-registry.json`

Principal pins:

- independent-conception baseline: `c7138eff5dbbce22bb25f727da78006e543fa476`;
- integration baseline including the merged scheduler candidate: `f146539db8b794fce79a979980ec9d43da8c92a6`;
- MAST: `57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee`;
- Terminal-Bench-Science: `7cf20d48e9db760f5a2fb93f36a717cf9d4f2c77`;
- SciCode-Verified: `ddab4a92f8d80a7113ab946628e994b52354d838`;
- K-Bench: `arXiv:2608.21601v1`;
- SciCode-Verified paper: `arXiv:2608.04975v1`.

## 8. Invariants

- The active promotion-scheduler task and its production-activation requirements are not overwritten, weakened, or represented as complete.
- No production deployment, MCP behavior, database schema, public form, plugin package, connector, access agreement, or canonical health protocol is changed by this program-planning slice.
- No external benchmark result is represented as proof of general medical reliability.
- No benchmark case may be used to tune HRP before the first paired epoch is sealed.
- MAST's mainstream specialist rubrics are a safety/management baseline, not exclusive authority over heterodox evidence synthesis.
- No external benchmark defect is silently corrected; official and audit-adjusted interpretations remain separate.
- No copyrighted full-text study packet is redistributed without an explicit compatible license or permission.
- No author qualification, affiliation, or institutional endorsement is invented.
- All AI assistance and AskRigor-related conflict of interest will be disclosed to Terminal-Bench-Science.
- Numerical pharmacological claims in the task must be exposure-indexed whenever the source permits: dose, unit, route, formulation, schedule, timing, comparator/exposure, dependence or tolerance context when relevant, outcome, and onset/follow-up.

## 9. Stop triggers

Stop and return to the owner only if:

- a materially different primary task has stronger scientific value and comparable deadline feasibility;
- the contribution requires a false or misleading author-qualification claim;
- no redistributable or defensibly semisynthetic data package can support the required workflow;
- objective verification cannot distinguish correct from scientifically invalid solutions;
- the refined task still substantially duplicates an approved or merged Terminal-Bench task;
- a security, privacy, legal, or clinical-safety concern cannot be bounded without changing the approved objective;
- an external submission requires owner-controlled identity/contact fields or assent that cannot be supplied through repository work;
- a new higher-priority exclusive task appears and materially threatens the 2026-10-05 external deadline, requiring explicit owner arbitration.

## 10. Immediate execution sequence

1. [x] Commit the queued-next program record, conception snapshot, source registry, overlap scan, refined task design, proposal draft, governance controls, and recovery checkpoint.
2. [x] Open and complete protected review without modifying the active scheduler pointer.
3. [x] Preserve the program on `main` as queued next after review.
4. [x] Complete the scheduler's exact VPS activation and immutable release closeout through PR #166.
5. [x] Activate the parent program from a fresh protected-main baseline through PR #168.
6. [x] Build a miniature latent-study fixture and deterministic verifier proof in a non-public environment.
7. [x] Run negative controls that intentionally double-count reports, mix estimands, accept an invalid comparator, and mishandle person-time.
8. [x] Use those results to tighten the proposal without prescribing one implementation path.
9. Submit the proposal once owner-controlled contact fields and external form assent are available.
10. [x] In parallel after activation, implement the MAST endpoint adapter and sealed paired-run manifest without executing model inference or the paid NOHARM judge run.

## 11. Historical completion boundary for the planning slice

PR #164 completed the planning slice and PR #168 completed protected parent-program activation. The current execution child does not claim that MAST model inference has run, that the Terminal-Bench proposal has been submitted, that an upstream PR exists, or that production behavior changed.
