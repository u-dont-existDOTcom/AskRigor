# Terminal-Bench-Science Meta-Analysis Integrity — Bounded Existing-Work Scan

**Scan date:** 2026-09-01  
**Owner-approved direction:** meta-analysis integrity primary  
**Decision:** retain the direction; adapt it to the unresolved report-lineage and estimand-integrity layer

## 1. Search boundary

This was a bounded go/no-go scan before substantial task construction. It covered:

- the current Terminal-Bench-Science repository, merged task tree, contribution guide, task-proposal rubric, release announcement, proposals discoverable through GitHub/web indexing, and adjacent clinical/statistical tasks;
- the strongest directly applicable systematic-review standards;
- mature study/report-linkage implementations;
- established statistical machinery for dependent effect sizes;
- SciCode-Verified's public correction and provenance architecture.

Representative search concepts:

- `meta-analysis`, `systematic review`, `pooled estimate`, `heterogeneity`;
- `overlapping cohorts`, `duplicate publications`, `multiple reports`, `same study`;
- `person-time`, `follow-up`, `shared control`, `dependent effect sizes`;
- `comparator`, `estimand`, `outcome definition`, `dose`, `route`, `regimen`.

The scan is not a claim that every proposal, private discussion, unpublished task, or non-indexed implementation has been found. It is sufficient to detect a direct collision and identify the strongest reusable baselines.

## 2. Direct Terminal-Bench collision

### Approved proposal already present

**Terminal-Bench-Science Discussion #333 / Task Proposal #178**  
**Title:** “Reconstructing a Reproducible Meta-Analysis from Messy Scientific Supplementary Tables”  
**Status:** proposal approved

Source:

- https://github.com/harbor-framework/terminal-bench-science/discussions/333

The approved proposal already covers:

- messy CSV/XLSX supplementary tables;
- multi-row headers, footnotes, mixed units, inconsistent identifiers and labels;
- missing SD recovery from SE or confidence intervals;
- duplicate or incompatible arm handling;
- tidy evidence-table construction;
- Hedges g or log response-ratio calculation;
- conventional random-effects meta-analysis;
- pooled estimate, confidence interval, heterogeneity, and included-study count;
- deterministic pytest checks plus a proposed hidden mini-fixture.

Its automated review also identified the main implementation risks: under-specified estimator and naming choices, difficulty driven by tedious cleaning rather than specialist reasoning, and subjective grading of prose audit reports.

### Consequence

The original broad AskRigor formulation would substantially duplicate Proposal #178. Renaming it or adding more spreadsheet mess would not create a distinct scientific task. Generic table cleaning, standard effect-size conversion, and ordinary random-effects pooling are therefore removed from the claimed novel core.

No merged task matching Proposal #178 was found in the current main task tree at commit `7cf20d48e9db760f5a2fb93f36a717cf9d4f2c77`, and no implementation PR was found through the bounded title/keyword search. That absence does not reopen the concept: an approved proposal is enough to treat the generic task as occupied.

## 3. Adjacent Terminal-Bench work

### Discussion #334 / Task Proposal #179

“Repairing Temporal Leakage in a MIMIC-IV Demo ICU Cohort Extraction Pipeline” addresses repeated patient stays, pre-index time windows, and patient-level split leakage. It is adjacent because it tests dependency and temporal validity, but it does not address multiple publications from the same study, cross-report estimand drift, or dependency-aware evidence synthesis.

Source:

- https://github.com/harbor-framework/terminal-bench-science/discussions/334

### Current merged task tree

Repository code searches found generic uses of `heterogeneity`, `pooled`, and `systematic`, but no merged task centered on:

- report-to-study lineage;
- duplicate or nested publications;
- partially overlapping clinical cohorts;
- cross-report treatment-regimen and estimand compatibility;
- correction of a report-as-study meta-analysis.

This is a bounded negative finding, not proof of universal novelty.

## 4. Established standards and implementations

### Cochrane Handbook

The Cochrane Handbook states that **studies, not reports, are the unit of interest** and that multiple reports of the same study must be identified and linked. It warns that duplicate publication can bias a meta-analysis and notes that duplicates may report different outcomes, time points, and participant counts.

Relevant current chapters:

- Chapter 4, sections 4.6.1–4.6.2: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04
- Chapter 5, section 5.2.1: https://www.cochrane.org/node/97
- Chapter 6, section 6.2.9: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06
- Chapter 23, section 23.3.4: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-23

Reusable rule: the benchmark should model report records separately from latent study/cohort units and should not reward double-counting a shared participant group.

### ICH E9(R1) estimands

ICH E9(R1) distinguishes the treatment effect being targeted from the estimator and numerical estimate, and requires alignment among the clinical question, design, analysis, and interpretation.

Primary regulatory source:

- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e9r1-statistical-principles-clinical-trials-addendum-estimands-and-sensitivity-analysis-clinical

Reusable rule: every candidate estimate must be matched to an explicit target comprising population, treatment condition, endpoint, handling of intercurrent events, and population-level summary. For this task, exposure-regime identity and time horizon must also be explicit because report-level labels are insufficient.

### Mature study/report-linkage tools

Cochrane Register of Studies stores studies and their multiple reports as linked entities:

- https://community.cochrane.org/help/tools-and-software/crs-cochrane-register-studies/about-crs

Covidence distinguishes ordinary duplicate references from “studification,” where multiple unique references describing the same study are merged under one study identity:

- https://support.covidence.org/help/merging-and-unmerging-studies
- https://support.covidence.org/help/manage-duplicates

Reusable rule: do not invent a flat deduplication concept. Preserve report identity, link reports to study/cohort entities, and make reversibility and provenance explicit.

### Existing dependence-aware statistics

Cochrane already specifies approaches for shared comparator groups, and `metafor::rma.mv` supports multivariate/multilevel models with a variance-covariance matrix. These methods are appropriate where the dependence structure is known and estimands are compatible.

Reusable rule: the benchmark must not imply that selecting one report is the only scientifically valid response to dependence. The fixture and protocol must specify whether the target analysis requires one independent estimate per cohort, a combined arm, or a covariance-aware model. Alternate valid approaches must be accepted when they produce the same target estimand and pass outcome checks.

### SciCode-Verified

SciCode-Verified records each accepted correction as decision data with fields such as `id`, `field`, `before`, `after`, `verdict`, `reason`, and `round`; derives release artifacts from a source of truth; binds consumption to a manifest; preserves audit history; and independently re-checks corrections.

Source pin:

- repository: https://github.com/flyingwagner/scicode-verified
- commit: `ddab4a92f8d80a7113ab946628e994b52354d838`

Reusable rule: benchmark corrections must create a new version/epoch and preserve original results rather than silently rewriting the evaluator.

## 5. Problem-status matrix

| Component | Status | Decision |
|---|---|---|
| Messy table parsing | Already solved/occupied | Reuse only as incidental input handling; do not claim as task core |
| Unit and label normalization | Already solved/occupied | Reuse exact conventions where needed |
| SE/CI-to-SD recovery | Already solved/occupied | Omit unless required by one report; do not center task on it |
| Standard effect-size calculation | Mature tooling | Reuse and cross-check against a standard implementation |
| Ordinary random-effects pooling | Mature tooling and occupied proposal | Reuse as terminal calculation |
| Reference-level deduplication | Mature review tooling | Reuse distinction between duplicate reference and same-study report |
| Study/report linkage | Standard requirement, only partly automated | Adapt to an explicit report-to-study/cohort graph |
| Nested/extended/partly overlapping cohorts | Methodologically recognized, difficult in practice | Retain as task core |
| Shared controls/dependent estimates | Statistically solved when covariance is known | Specify valid treatment; do not force arbitrary row deletion |
| Exposure-regime identity across reports | Partially addressed in review practice | Retain as task core with numerical dose/route/formulation/timing fields when available |
| Cross-report estimand compatibility | Established concept, weakly operationalized in common workflows | Retain as task core |
| Comparator validity for the declared question | Established causal/evidence-synthesis requirement | Retain as task core with explicit protocol-defined eligibility |
| Deterministic benchmark fixture and verifier for the combined failure | Not found in bounded scan | Build and experimentally validate |
| Benchmark correction governance | Strong precedent in SciCode-Verified | Adapt rather than invent |

## 6. Refined primary task

**Working title:** Dependency-Aware Clinical Meta-Analysis from Overlapping Reports

The task begins after literature searching. The input is a compact package of distinct clinical reports and structured supporting files. Several reports originate from the same latent study or participant cohort; others are nested subcohorts, extended follow-up reports, shared-control analyses, partially overlapping cohorts, or independent studies. Report labels alone do not reliably disclose those relations.

The agent must:

1. reconstruct a report-to-study/cohort lineage graph;
2. reconstruct each candidate estimate's exposure-indexed estimand;
3. determine which estimates answer the declared clinical question and can enter one synthesis without invalid dependence;
4. produce the corrected effect estimates, synthesis, and prespecified sensitivities;
5. emit machine-readable findings showing why the supplied naive report-level analysis is invalid.

The task is not “find the author's intended exclusions.” Multiple implementations are allowed. The verifier checks the scientific outcome: lineage relations, estimand compatibility, non-double-counted contribution set or equivalent covariance-aware result, numerical estimates, and declared sensitivity consequences.

## 7. Reuse/adapt/compose/invent/experiment decision

- **Reuse:** Cochrane study/report unit, ICH estimand framework, standard meta-analysis estimators, Harbor task format, standard CSV/JSON artifacts.
- **Adapt:** Covidence/CRS study-report data model and SciCode-Verified decision/provenance pattern.
- **Compose:** study lineage, participant dependence, exposure indexing, estimand matching, comparator eligibility, and synthesis.
- **Invent:** only the compact latent-study fixture, perturbation design, expected outcome graph, and deterministic verifier.
- **Experiment:** frontier-agent baseline, invalid-baseline controls, verifier mutation tests, alternate-correct-solution tests, and difficulty calibration.

## 8. Go/no-go gates before external proposal submission

Proceed only if all are true:

- the proposal explicitly distinguishes itself from Discussion #333;
- a miniature fixture proves that the lineage and estimand outputs can be graded deterministically;
- at least two materially different correct implementations pass;
- seeded scientific errors are reliably rejected;
- a domain reviewer can inspect the latent study graph and target estimand without trusting the author;
- the data package is redistributable, or its semisynthetic derivation is transparent and scientifically defensible;
- difficulty comes from specialist evidence identity and estimand reasoning rather than file volume or hidden instructions;
- author experience and AI/AskRigor conflicts are disclosed accurately.

If these gates fail by the scheduled decision boundary, switch to the pre-authorized absolute-risk reconstruction fallback rather than submit a duplicate or unverifiable task.
