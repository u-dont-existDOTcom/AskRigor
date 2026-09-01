# Dependency-Aware Clinical Meta-Analysis from Overlapping Reports

**Status:** candidate design for Terminal-Bench-Science v0.2 proposal  
**Domain:** Life Sciences → Medicine  
**Subfield:** clinical epidemiology / evidence synthesis  
**Owner decision:** meta-analysis integrity primary  
**Overlap constraint:** must remain substantively distinct from Terminal-Bench-Science Discussion #333

## 1. Scientific objective

Repair a clinical evidence-synthesis project in which the apparent rows of evidence are **reports**, not independent studies, and several report-level estimates do not identify the same treatment effect.

A valid solution must recover the study/cohort structure, match candidate estimates to the declared treatment estimand, prevent invalid participant double-counting, and calculate a reproducible synthesis and sensitivity profile.

The key scientific question is not whether the agent can run a random-effects function. It is whether the agent can determine **what the independent units of evidence are and whether they answer the same question**.

## 2. Target estimand

The task protocol will declare one target estimand using explicit fields:

- population;
- intervention identity;
- numerical dose and unit;
- route;
- formulation;
- single versus repeated schedule;
- timing and duration;
- comparator;
- outcome definition;
- assessment horizon;
- effect measure / population-level summary;
- handling of material intercurrent events when applicable.

Fields that are genuinely absent from a source remain `NOT_REPORTED`; they may not be guessed or collapsed into an umbrella label.

This field set adapts ICH E9(R1) and HRP's exposure-indexing rule. It is an implementation record, not a claim to a new scientific estimand framework.

## 3. Input package

The container should present a compact clinical review project with approximately 10–16 distinct reports arising from approximately 6–9 latent studies or cohorts. The exact counts will be calibrated after the miniature proof.

Candidate inputs:

- report abstracts or redistributable report excerpts;
- trial-registry or sponsor identifiers;
- author, site, recruitment-date, and participant-flow metadata;
- arm-level baseline summaries;
- intervention dose, route, formulation, schedule, and co-intervention fields;
- outcome definitions, event counts, denominators, person-time, and follow-up windows;
- a review protocol declaring the target estimand;
- a partially valid report-level analysis that treats reports as studies;
- data dictionaries and source-provenance records.

The package should contain realistic evidence relations:

- two reports from the same study reporting different outcomes or time points;
- a subgroup nested within a parent cohort;
- an extended-follow-up publication that includes earlier participants;
- a pair of cohorts with partial participant overlap or a shared control source;
- independent studies with superficially similar metadata;
- one unresolved relation for which the scientifically correct action is to label uncertainty and exclude it from the primary synthesis;
- one intervention report with a materially incompatible dose, route, formulation, or schedule;
- one outcome or time-window mismatch;
- one comparator that does not identify the declared contrast;
- at least one supplied result whose direction, threshold classification, or practical conclusion changes after the invalid contributions are removed.

## 4. Relation labels

Machine-readable output may use the following implementation labels:

- `SAME_STUDY_SAME_COHORT`
- `NESTED_SUBCOHORT`
- `EXTENDED_FOLLOWUP`
- `PARTIAL_PARTICIPANT_OVERLAP`
- `SHARED_CONTROL`
- `INDEPENDENT`
- `UNRESOLVED`

These labels are not a proposed general taxonomy. They are the minimum relation states needed by this fixture. Before implementation, the verifier must define the scientific consequence of each relation for the target analysis.

## 5. Required outputs

The candidate task should grade structured artifacts, not rhetorical quality.

### `results/report_lineage.csv`

One row per report with at least:

- `report_id`
- `study_id`
- `cohort_id`
- `relation_to_primary_report`
- `linked_report_ids`
- `relation_confidence`
- `evidence_codes`

### `results/estimand_table.csv`

One row per candidate report-level estimate with the explicit target attributes and a compatibility classification:

- `estimate_id`
- `report_id`
- exposure-regime fields;
- comparator;
- outcome definition;
- time horizon;
- effect measure;
- `target_compatible`;
- `incompatibility_codes`.

### `results/selection_decisions.csv`

One row per candidate estimate:

- `estimate_id`
- `primary_status` (`INCLUDE`, `EXCLUDE`, `UNRESOLVED`)
- `decision_codes`
- `dependency_group_id`
- `contribution_weight_rule` or equivalent representation.

### `results/effect_estimates.csv`

The independent or correctly dependence-adjusted estimates used in the primary analysis, including transformed effect, sampling variance, and source lineage.

### `results/meta_analysis.json`

At minimum:

- target estimand identifier;
- model identity and pinned conventions;
- included independent-study count;
- included estimate count;
- pooled estimate;
- confidence interval;
- heterogeneity outputs appropriate to the model;
- conclusion classification defined in the protocol;
- hashes of the input and preceding result artifacts.

### `results/sensitivity_matrix.csv`

Prespecified analyses that isolate the consequence of:

- report-as-study double counting;
- unresolved overlap;
- alternate valid report selection within the same study;
- incompatible exposure regimen;
- incompatible outcome/time horizon;
- invalid comparator;
- covariance-aware versus one-estimate-per-study treatment where the fixture supports both.

### `results/audit_findings.json`

Structured findings only. Each finding should include a source location, finding code, affected estimate/report, disposition, and numerical impact when calculable. A prose report may be generated for human use but should not carry substantial score weight.

## 6. Reference construction

The task author must construct and retain a latent source-of-truth package containing:

- report-to-study/cohort graph;
- participant-overlap and shared-control relations;
- target-estimand compatibility matrix;
- valid alternate contribution sets;
- exact statistical conventions;
- reference numerical outputs;
- provenance for every report-level datum;
- seeded-error ledger;
- rights/license record.

Released inputs must not expose hidden answer files or identifiers that make the task a join operation. The latent truth must remain inspectable by reviewers and reproducibly generate all expected verifier artifacts.

A semisynthetic fixture is acceptable only when:

- its clinical structure is derived from documented real review failures;
- transformations from source material are recorded;
- generated participant overlap and outcomes are internally coherent;
- the source and generated layers are distinguishable;
- no scientific claim about a real treatment is inferred from generated data.

## 7. Statistical boundary

The task will pin the target measure and estimator before evaluation. Candidate implementation options may include:

- selecting one compatible estimate per independent cohort according to the target estimand;
- combining relevant arms without double-counting a shared comparator;
- using a prespecified variance-covariance matrix in a multivariate model;
- using another mathematically equivalent dependence-aware implementation.

The verifier must accept materially equivalent scientific outputs within justified tolerances. It must not require a particular package, coding style, or row-deletion procedure.

The initial miniature fixture should use a treatment effect that is transparent to recompute, likely a log risk ratio or log rate ratio. Risk and rate estimands must not be mixed unless a source-supported transformation and common target estimand are explicitly provided.

## 8. Deterministic verifier

No LLM judge should be required.

The verifier should check:

1. file existence, schemas, finite values, and referential integrity;
2. report-to-study/cohort relations against allowed truth sets;
3. exposure, comparator, outcome, horizon, and measure compatibility;
4. absence of duplicate participant contributions in the primary analysis, or correct covariance-aware treatment;
5. effect-size and sampling-variance calculations from source values;
6. exact model conventions and pooled numerical outputs within tolerances justified by independent implementations;
7. sensitivity analyses and their inclusion sets;
8. conclusion classification derived from the numerical outputs, not free text;
9. hash linkage among inputs, decisions, and final results;
10. rejection of hard-coded visible answers using a hidden or generated variant.

Verifier development must include mutation tests for each seeded scientific error and alternate-correct-solution tests. A passing oracle alone is insufficient.

## 9. Error controls

The candidate must include deliberately invalid baselines:

- **Naive report-as-study baseline:** every report is pooled independently.
- **Clean-and-pool baseline:** labels and units are corrected, but study lineage and estimand compatibility are ignored. This represents the capability boundary already occupied by Discussion #333.
- **Single-rule dedup baseline:** duplicate-looking reports are dropped by citation similarity without preserving distinct outcomes or study relations.
- **Umbrella-exposure baseline:** different doses/routes/schedules are combined under a shared treatment name.
- **External-background baseline:** incompatible follow-up or population rates are treated as interchangeable controls.

Each must fail for a specific scientific reason visible in the structured outputs.

## 10. Difficulty hypothesis

The task should be difficult because a solver must integrate several weak signals across reports and understand their consequences for the treatment effect—not because there are many files or arbitrary formatting traps.

Expected frontier failure modes:

- clustering papers by title/author similarity while missing nested or extended cohorts;
- recognizing duplicate reports but choosing an estimate for the wrong time horizon;
- deduplicating participant sets while still mixing incompatible treatment regimens;
- comparing risk with incidence rate as though they were the same estimand;
- accepting an active comparator for a question about treatment versus no treatment;
- producing a plausible pooled estimate without an auditable lineage;
- noticing uncertainty but silently making a definitive inclusion decision;
- repairing the provided script without repairing the scientific data model.

A task that frontier agents solve consistently after reading the protocol should be recalibrated or rejected rather than made artificially obscure.

## 11. Baselines and acceptance experiments

Before proposal submission:

- implement the oracle;
- implement the five invalid baselines above;
- implement at least one alternate correct solution using a different internal method;
- verify that both correct solutions pass and every invalid baseline fails;
- run verifier mutation tests;
- estimate expert completion time on the miniature fixture;
- run at least one frontier-agent pilot only after answer leakage and rights checks.

Before upstream PR:

- run the current strongest available Terminal-Bench baseline agents under the prescribed Harbor configuration;
- target the benchmark's intended low solve-rate region without engineering hidden traps;
- document cost, runtime, attempts, and failure categories;
- obtain independent clinical-epidemiology and technical-verifier review.

## 12. Distinction from Discussion #333

Discussion #333 starts with messy arm-level tables and asks the solver to normalize them and compute a standard meta-analysis.

This task starts with multiple reports whose **scientific identities and treatment questions are not already resolved**. Ordinary table cleaning can succeed while the scientific synthesis remains invalid. The central scored objects are the latent study/cohort lineage, estimand compatibility, dependence treatment, and corrected conclusion.

If the implementation drifts back toward spreadsheet cleaning plus conventional pooling, it should be stopped as duplicative.

## 13. Rights and safety constraints

- Use only source material with explicit compatible redistribution rights, public-domain regulatory/registry material, or transparently semisynthetic excerpts.
- Do not redistribute full copyrighted articles merely because they are accessible.
- Do not make or imply a clinical recommendation from fixture results.
- Use neutral or clearly fictional intervention labels for generated numerical data unless the source license and scientific context support a real intervention.
- Preserve exact source claims and uncertainty; do not silently correct contested source interpretations.
- Do not include identifiable patient-level data.

## 14. Current unresolved implementation questions

These are implementation research items, not owner-policy decisions:

- Which open report family offers the best combination of realistic lineage, compatible licensing, and tractable ground truth?
- Should the first fixture require one-estimate-per-cohort selection, covariance-aware synthesis, or both as valid alternatives?
- What relation-confidence representation permits honest `UNRESOLVED` decisions without making the verifier subjective?
- Which hidden-variant construction best tests generalization without changing the scientific problem?
- What numerical conclusion threshold is meaningful without incentivizing threshold gaming?

The next work slice is to answer these through a miniature fixture and verifier proof, not by adding more prose to the specification.
