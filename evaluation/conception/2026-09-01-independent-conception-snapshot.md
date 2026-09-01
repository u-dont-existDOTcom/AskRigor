# Independent Conception Snapshot — AskRigor External Evaluation

**Conception date:** 2026-09-01  
**Formalized after owner approval:** `APPROVED — meta-analysis integrity primary`  
**Exposure state:** this section preserves the conception established before the bounded overlap and standards scan described below.

## Pre-scan conception

### Problem

AskRigor needs evidence that HRP improves a frontier model rather than merely making its answers longer, more persuasive, or more consistent with its own assumptions. Conventional answer-key testing is inadequate for much of health evidence synthesis because clinically important questions may have contestable conclusions, incomplete evidence, incompatible studies, or no clean gold answer. At the same time, an entirely open-ended evaluation can become too subjective to detect safety regressions.

### Candidate mechanism

Use four complementary instruments:

1. a paired, same-model MAST comparison to test clinical management safety and reasoning under uncertainty;
2. an executable Terminal-Bench-Science task derived from recurring HRP evidence-audit failures;
3. a benchmark-integrity layer that preserves evaluator provenance, contestability, corrections, and original-versus-corrected results;
4. a later blinded multidimensional evaluation of authentic AskRigor requests where no single conclusion can serve as constitutional truth.

For MAST, hold the model, endpoint, sampling settings, cases, and execution environment constant while changing only the instruction condition: bare versus Universal + HRP.

For Terminal-Bench-Science, encode a real scientific workflow with robust verification rather than asking an agent to imitate HRP prose. The initial candidate task reconstructs a meta-analysis while detecting participant duplication, denominator or follow-up mismatch, incompatible comparators, and evidence whose exclusion changes the conclusion.

### Constraints

- Clinical expert rubrics can encode mainstream assumptions and may not test heterodox evidence synthesis well.
- LLM judges can drift and can become the dominant source of measurement error.
- Deterministic gold answers can reject scientifically valid alternatives or reward invalid shortcuts.
- Public benchmark exposure can induce tuning and contamination.
- Paired evaluation is invalid if the conditions differ in model, endpoint, token budget, or execution environment.
- A contribution must be scientifically realistic, difficult for substantive reasons, objectively verifiable, legally redistributable, and distinct from existing tasks.
- A fixed external deadline creates calendar pressure that must not override scientific validity.
- Pharmacological and clinical claims require exact exposure, comparator, outcome, and time-window identity rather than umbrella labels.

### Candidate insight

No single benchmark should decide whether HRP works. The strongest design is a composition:

- a conventional clinical safety baseline;
- an externally reviewed executable research workflow;
- an explicit benchmark-defect and correction ledger;
- a later no-clean-ground-truth evaluation that grades a profile of scientific behavior rather than one answer.

The executable contribution should expose an epistemic failure that repeatedly matters in real reviews: a polished pooled estimate can be invalid because the underlying units of evidence are not independent or do not estimate the same treatment contrast.

### Non-goals

- proving that HRP is generally medically reliable from one benchmark;
- replacing domain experts with an automated score;
- converting mainstream clinical consensus into AskRigor's only allowed conclusion;
- publishing proprietary HRP instructions as the benchmark task;
- building a general benchmark platform before the immediate evaluations justify one;
- tuning HRP on the evaluation cases before sealing the first result epoch.

---

## Post-scan reconciliation

The bounded scan did not invalidate the conception, but it materially narrowed the Terminal-Bench implementation.

An approved Terminal-Bench-Science proposal already covers generic reconstruction of a meta-analysis from messy supplementary tables, including label and unit normalization, SD recovery, duplicate-arm handling, conventional effect sizes, random-effects pooling, heterogeneity, and an audit report. Repeating that package would be reinvention.

The retained AskRigor contribution is therefore the unsolved layer that precedes ordinary pooling:

- reconstruct which reports describe the same, nested, extended, shared-control, partially overlapping, independent, or unresolved participant sets;
- reconstruct the exact target estimand, including population, exposure regimen, comparator, outcome, time horizon, and summary measure;
- decide which report-level estimates can contribute without double-counting or mixing incompatible estimands;
- calculate the corrected synthesis and prespecified sensitivity analyses;
- show the consequence of the invalid report-as-study analysis without treating the invalid analysis as a baseline truth.

### Build decision after scan

**Compose and adapt.** Reuse established study/report linkage, estimand, meta-analysis, Harbor, and benchmark-audit machinery. Invent only the benchmark fixture, latent dependency ground truth, machine-readable outputs, and verifier needed to test the unresolved combination. Benchmark the result against the approved generic meta-analysis task's capability boundary and against intentionally invalid report-level pooling.
