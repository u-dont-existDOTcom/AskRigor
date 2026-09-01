# Terminal-Bench-Science v0.2 Proposal Draft

**Working title:** Repairing Dependency and Estimand Errors in a Clinical Meta-Analysis from Multiple Reports

**Submission status:** draft only; not submitted  
**External deadline:** 2026-10-05 pull-request deadline according to the current Terminal-Bench-Science 0.1 release announcement  
**Owner-controlled fields still required at submission:** preferred public name, contact email, external-form assent, and any desired affiliation wording

## Scientific Domain

Life Sciences > Medicine > Clinical epidemiology and evidence synthesis

## Scientific Problem

A systematic review rarely receives one clean, independent estimate per study. One clinical study can generate a protocol, primary report, subgroup analysis, secondary-outcome paper, conference abstract, and extended follow-up report. Separate studies can also share participants or controls. At the same time, reports that use the same treatment name may differ in dose, route, formulation, schedule, comparator, outcome definition, follow-up horizon, or handling of intercurrent events. Treating every report as an independent and compatible study can create a precise but scientifically invalid meta-analysis.

This task asks an AI agent to repair a compact clinical evidence-synthesis project in which the supplied pipeline treats reports as studies and pools estimates that do not all target the declared treatment effect. The agent must reconstruct report-to-study/cohort lineage, identify nested or overlapping participant sets and shared controls, reconstruct each estimate's exposure-indexed estimand, determine which estimates can contribute to the primary synthesis, and produce a corrected meta-analysis plus prespecified sensitivity analyses.

This is a real research workflow in clinical systematic reviews and reproducibility audits. Cochrane explicitly treats the study rather than the report as the unit of interest and warns that duplicate publications, different time points, and shared groups can create bias or unit-of-analysis errors. ICH E9(R1) separately requires clarity about the treatment effect being estimated. The task operationalizes the intersection of those requirements in an executable, outcome-verified workflow.

## Distinction from Existing Terminal-Bench Work

Terminal-Bench-Science Discussion #333 / approved Task Proposal #178 already covers reconstructing a conventional meta-analysis from messy supplementary CSV/XLSX tables: unit and label normalization, missing-SD recovery, duplicate-arm handling, standard effect sizes, random-effects pooling, heterogeneity, and an audit report.

This proposal does not repeat that workflow. Its inputs are multiple clinical reports whose underlying study/cohort identities and target treatment effects have not been resolved. A solver can clean every table and reproduce a conventional random-effects calculation while still failing this task. The central graded objects are:

- report-to-study/cohort lineage;
- participant-dependence relations;
- exposure-regime and estimand compatibility;
- comparator eligibility;
- a non-double-counted or correctly covariance-adjusted contribution set;
- the numerical consequence of correcting the invalid report-level synthesis.

Ordinary effect-size and random-effects calculations are reused as infrastructure and baseline controls rather than claimed as novel difficulty.

## Workflow Details

The task repository will contain a compact clinical review project with approximately 10–16 report records arising from approximately 6–9 latent studies or cohorts. Inputs will include redistributable report excerpts or structured report records, registry/sponsor identifiers, author/site/recruitment metadata, participant-flow and baseline summaries, intervention-regimen fields, outcome definitions, event counts or person-time, follow-up windows, a short target-estimand protocol, and a partially valid analysis pipeline.

The report family will contain realistic relations such as:

- multiple reports from the same study;
- a subgroup nested in a parent cohort;
- an extended follow-up publication;
- partially overlapping cohorts or a shared control source;
- independent reports with superficially similar metadata;
- one genuinely unresolved relation that should not be converted into false certainty;
- one incompatible exposure regimen;
- one incompatible outcome or follow-up horizon;
- one comparator that does not identify the declared treatment contrast.

The agent must run the project and produce machine-readable outputs under `results/`:

- `report_lineage.csv`: report, study, cohort, relation, linked reports, confidence, and evidence codes;
- `estimand_table.csv`: population, intervention dose/route/formulation/schedule/timing, comparator, outcome, horizon, effect measure, and compatibility;
- `selection_decisions.csv`: inclusion/exclusion/unresolved status, reason codes, dependency group, and contribution rule;
- `effect_estimates.csv`: the independent or dependence-adjusted estimates used in the primary analysis;
- `meta_analysis.json`: exact model identity, included units, pooled estimate, interval, heterogeneity outputs, conclusion class, and artifact hashes;
- `sensitivity_matrix.csv`: prespecified alternate analyses isolating report double-counting, unresolved overlap, exposure mismatch, outcome/time mismatch, invalid comparator, and alternate valid report choices;
- `audit_findings.json`: structured source-linked findings and numerical impact.

The agent has latitude to implement the repair with any suitable language or statistical package. It is not required to delete particular rows or reproduce the reference code. Scientifically equivalent one-estimate-per-cohort and covariance-aware approaches will be accepted when they target the same declared estimand and produce equivalent outcomes.

## Dependencies and System Requirements

Expected container requirements:

- Python 3.11;
- pandas, numpy, scipy, and statsmodels or a small supplied meta-analysis utility;
- pytest for verification;
- optional R + metafor only for author/reviewer cross-checking, not required for the agent;
- CPU only;
- approximately 2 CPU cores, 4 GB RAM, less than 1 GB disk;
- expected task runtime under 10 minutes after environment startup.

The benchmark run will require no network access, credentials, proprietary database, or identifiable patient-level data.

## Dataset

The task will be self-contained. The preferred construction is a small report family derived from explicitly redistributable open clinical reports and public trial-registry/regulatory records, with a complete provenance and rights ledger. If no suitable report family supports objective latent ground truth and redistribution, the fallback is a transparently semisynthetic fixture based on documented real review failure modes.

A semisynthetic fixture will be generated from a hidden coherent study/cohort source of truth rather than by independently editing rows. That source will determine participant overlap, recruitment periods, arms, outcomes, and report-specific slices. Every transformation from source material will be recorded. Generated results will use neutral or fictional intervention identities and will not be presented as evidence about a real treatment.

The public package will expose enough metadata and quantitative information for a domain expert to reconstruct the correct result, but it will not expose a direct study-ID join key or hidden answer file. A second generated or hidden mini-fixture will test generalization and prevent hard-coded visible answers.

## Evaluation Strategy

Evaluation will be deterministic; no LLM judge is planned.

The verifier will check:

1. required output schemas and referential integrity;
2. report-to-study/cohort relations against allowed truth sets;
3. target-estimand compatibility for exposure regimen, comparator, outcome, horizon, and effect measure;
4. absence of participant double-counting in the primary synthesis, or correct use of the supplied covariance structure;
5. effect-size and sampling-variance calculations from source values;
6. pooled estimate, interval, model-specific heterogeneity outputs, and included independent-unit counts within independently justified tolerances;
7. exact contribution sets for prespecified sensitivities or scientifically equivalent outputs;
8. conclusion classes derived mechanically from numerical results;
9. input/result hash binding;
10. generalization on a hidden or generated variant.

Verifier development will include mutation tests for every seeded scientific error and at least two materially different correct implementations. Passing the author's oracle will not be treated as sufficient evidence that the verifier is valid.

The task will include invalid baseline implementations that:

- pool every report as an independent study;
- clean labels and units but ignore lineage and estimand compatibility;
- deduplicate by citation similarity without preserving study/report structure;
- collapse different dose/route/schedule regimes under one intervention name;
- mix risks, rates, outcome definitions, or follow-up windows;
- accept an invalid comparator.

Each invalid baseline must fail for a specific scientific reason visible in the structured artifacts.

## Complexity and Difficulty

For a clinical epidemiologist or experienced systematic reviewer who understands the target estimand and the report family, the full task is expected to require approximately 4–8 hours. The conventional meta-analysis calculation is not the hard part. Difficulty comes from integrating identifiers, recruitment windows, sites, participant counts, treatment regimens, outcomes, and time horizons across reports; distinguishing duplicate, nested, extended, shared-control, overlapping, independent, and unresolved evidence; and then propagating those judgments into a valid synthesis.

Expected frontier-agent failures are scientifically realistic: treating papers as studies, resolving uncertainty by confident guess, selecting the wrong time point, mixing exposure regimes, confusing event risk with incidence rate, using an active comparator for a no-treatment question, or repairing code without repairing the evidence model. The fixture will be calibrated against current frontier agents. If they solve it reliably, the task will be rejected or substantively recalibrated rather than padded with arbitrary formatting traps.

## Scientific Grounding

The task instantiates established requirements rather than proposing a new meta-analysis method:

- Cochrane Handbook: studies, not reports, as the unit of interest; link multiple reports; avoid duplicate participant and shared-control counting.
- ICH E9(R1): define the treatment effect of interest and align estimand, estimator, and interpretation.
- Mature review tools: Cochrane Register of Studies and Covidence preserve study/report linkage.
- Mature statistical tools: conventional and multivariate/multilevel meta-analysis can be independently cross-checked with standard software.

The new contribution is the executable benchmark instance that combines report lineage, exposure/estimand compatibility, participant dependence, comparator validity, and consequence-sensitive verification.

## References and Resources

- Cochrane Handbook, Chapter 4: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04
- Cochrane Handbook, Chapter 5: https://www.cochrane.org/node/97
- Cochrane Handbook, Chapter 6: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-06
- Cochrane Handbook, Chapter 23: https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-23
- FDA / ICH E9(R1): https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e9r1-statistical-principles-clinical-trials-addendum-estimands-and-sensitivity-analysis-clinical
- Covidence study merging: https://support.covidence.org/help/merging-and-unmerging-studies
- Cochrane Register of Studies: https://community.cochrane.org/help/tools-and-software/crs-cochrane-register-studies/about-crs
- Existing TB-Science proposal #178: https://github.com/harbor-framework/terminal-bench-science/discussions/333

## Author Information and Disclosures

**Public name:** owner to specify before submission  
**Contact email:** owner to supply through the external form; do not commit private contact information unless explicitly directed  
**Role:** independent health-research protocol developer and evidence-audit practitioner  
**Institutional affiliation:** none asserted in this draft  
**Relevant experience:** repeated structured audits of clinical studies and evidence syntheses, including comparator validity, absolute-risk reconstruction, denominator and time-window mismatches, duplicated cohorts, exposure-regime integrity, and sensitivity analysis  
**AI assistance disclosure:** the task conception, scan, proposal drafting, and eventual implementation use AI assistance under owner supervision; this will be disclosed  
**Conflict-of-interest disclosure:** the task is derived from recurring methodological concerns in AskRigor/HRP, a project controlled by the author; the benchmark task will remain standalone and will not require endorsement of HRP  
**Funding:** none asserted  
**Recommended reviewers:** clinical epidemiology/systematic-review domain reviewer plus an independent verifier/statistical reviewer

## Pre-Submission Evidence Required

This draft should not be submitted until the repository contains:

- miniature fixture and latent study graph;
- passing oracle and alternate correct implementation;
- failing invalid baselines;
- verifier mutation-test results;
- source-rights determination;
- bounded frontier-agent difficulty probe;
- independent domain review or a documented request for one;
- exact author-controlled submission fields and assent.
