# AskRigor Benchmark Correction and Independent Recheck Policy

**Status:** provisional v0.1 for the MAST and Terminal-Bench-Science workstreams  
**Primary precedent:** SciCode-Verified at `ddab4a92f8d80a7113ab946628e994b52354d838`  
**Purpose:** prevent evaluator defects, mutable judges, and frozen answers from silently becoming AskRigor truth

## 1. Reuse decision

This policy adapts an established architecture rather than inventing a new benchmark-governance system.

From SciCode-Verified, AskRigor reuses:

- one source of truth from which evaluated artifacts are derived;
- one machine-readable decision record per approved correction;
- exact `before` and `after` states;
- a human-readable rationale tied to a source location;
- manifest-bound artifacts and hash verification;
- preservation of original and corrected evaluations;
- an independent domain re-check before release of score-affecting corrections.

AskRigor adds only controls required by paired protocol evaluation and clinical evidence synthesis: blinded condition labels, separation of official from audit-adjusted results, exposure/estimand identity, and explicit uncertainty when the evaluator cannot be adjudicated.

## 2. Core invariants

1. **Never overwrite an official result.** A correction creates a new evaluator version and result epoch.
2. **Never silently rewrite a gold answer, rubric, tolerance, judge prompt, parser, or dataset.** Every material change requires a ledger entry.
3. **Bind every score to exact identities.** At minimum: benchmark source, commit/version, data hashes, scorer, judge/model when applicable, code, runtime, model-under-test, protocol condition, and run parameters.
4. **Preserve raw model output.** Re-scoring must be possible without regenerating the answer whenever the external scorer permits it.
5. **Separate official and contestability layers.** AskRigor may report a suspected benchmark defect, but the published benchmark score remains unchanged and separately identified.
6. **Require independent recheck for consequential changes.** No score- or conclusion-changing correction is released on the original discoverer's judgment alone.
7. **Do not infer certainty from evaluator silence.** `UNRESOLVED` is a valid disposition.
8. **Do not tune on sealed evaluation cases.** The first bare-versus-HRP epoch must be frozen before case-level repair work begins.
9. **Preserve condition blinding during discordance review.** Reviewers should not know which response is bare or HRP until the substantive judgment is recorded.
10. **Exposure-index clinical claims.** When available, record numerical dose/unit, route, formulation, schedule, timing, comparator/exposure, relevant dependence/tolerance context, outcome, and follow-up/onset.

## 3. Artifact model

Each evaluation epoch should contain:

- `manifest.json`: immutable identity of inputs, conditions, scorer, runtime, and artifacts;
- `raw/`: unmodified responses and provider metadata;
- `official/`: outputs from the unmodified external benchmark;
- `audit/defects.jsonl`: suspected and adjudicated evaluator defects;
- `audit/discordance/`: blinded substantive reviews of condition-discordant items;
- `corrected/<evaluator-version>/`: separately versioned corrected scorer or interpretation artifacts, if approved;
- `comparison.json`: official versus corrected results and the exact affected items;
- `README.md`: bounded statement of what the epoch can and cannot establish.

The Terminal-Bench task authoring lane should use the same pattern for the task's latent source of truth, seeded-error ledger, verifier versions, oracle outputs, invalid baselines, and reviewer-visible evidence.

## 4. Minimum defect record

A machine-readable correction record should preserve the SciCode-Verified core fields and add only necessary adjudication metadata:

- `id`: stable defect identifier;
- `benchmarkId` and `evaluatorVersion`;
- `itemId` or source path;
- `field`: exact affected specification, rubric, target, tolerance, parser, judge, data, or dependency location;
- `before`: exact prior state or hash;
- `proposedAfter`: exact proposed state or hash;
- `verdict`: concise disposition label;
- `reason`: source-grounded scientific/technical justification;
- `evidence`: reproductions, counterexamples, independent calculations, or source citations;
- `impact`: items/conditions/epochs potentially affected;
- `severity`: `BLOCKER`, `MAJOR`, `MINOR`, or `NOT_ESTABLISHED`;
- `status`: `SUSPECTED`, `CONFIRMED`, `REFUTED`, `UNRESOLVED`, or `CORRECTED`;
- `discoverer` and date;
- `rechecker`, date, and decision when required;
- `correctionVersion` and new artifact hashes when released.

These are record fields, not a claim that AskRigor has created a new general defect taxonomy.

## 5. Defect classes used only when evidenced

Use the narrowest applicable class. Initial classes are limited to patterns already evidenced by SciCode-Verified, MAST's architecture, or the proposed clinical synthesis task:

- specification contradiction or missing convention;
- non-unique valid answer;
- incorrect reference target or rubric expectation;
- overly strict or overly permissive tolerance;
- non-deterministic or mutable judge behavior;
- parser/format failure that rejects a substantively valid response;
- dependency/environment drift;
- data provenance or version mismatch;
- study/report identity error;
- participant double-counting or unmodeled dependence;
- exposure/estimand incompatibility;
- comparator or outcome/time-window mismatch.

Do not add classes merely to make the ledger appear comprehensive. Add a class only after a concrete defect cannot be represented accurately by the existing set.

## 6. Triage and adjudication flow

### Step 1 — Preserve

Freeze the raw item, response, official score, benchmark identity, and run manifest before analysis.

### Step 2 — Reproduce

Demonstrate the suspected defect with at least one of:

- the benchmark's own reference or documentation failing its evaluator;
- two scientifically valid implementations receiving different verdicts;
- an independent calculation showing the target or tolerance is wrong;
- repeated judge runs showing material instability;
- a source-provenance mismatch;
- a clinical lineage/estimand reconstruction showing that the reference synthesis double-counts or pools incompatible evidence.

A reviewer intuition without reproducible evidence remains `SUSPECTED`.

### Step 3 — Bound impact

Identify exactly which items, scores, conditions, conclusions, or prior epochs could change. Do not extrapolate from one defect to the whole benchmark.

### Step 4 — Independent recheck

Required when a proposed correction can:

- change an item verdict or aggregate score;
- change the comparative ordering of bare and HRP conditions;
- change a clinical-safety interpretation;
- change the Terminal-Bench oracle or valid-solution set;
- create or remove a blocker.

The rechecker must examine the frozen evidence and may confirm, refute, or leave the issue unresolved. A second LLM invocation is not automatically independent domain review.

### Step 5 — Version

If confirmed, create a new evaluator or dataset version. Derive released artifacts from the source of truth and verify that every approved ledger `after` state landed and every source-of-truth change has a ledger entry.

### Step 6 — Compare

Report:

- original official result;
- corrected result;
- affected items;
- reason for each change;
- whether any program-level conclusion changes;
- remaining uncertainty.

### Step 7 — Release or hold

Release only when manifest checks, bidirectional ledger/source-of-truth checks, verifier tests, and independent recheck pass. Otherwise retain the official result and label the correction `UNRESOLVED` or `HOLD`.

## 7. MAST-specific controls

- SCT deterministic scoring is the first reproducibility anchor.
- First Do NOHARM raw responses must be preserved before judging.
- Record exact match-judge and review-judge model identifiers, prompts/configuration, retries, and dates.
- Preview-model judge drift must be treated as evaluator version drift, not model-under-test drift.
- Rejudge condition-discordant cases under blinded labels and, where feasible, with a second judge configuration.
- A mainstream-rubric disagreement is not automatically a benchmark defect. It requires an explicit scientific case and independent review.
- MAST official scores and AskRigor contestability findings must be reported side by side, never merged into one undocumented score.

## 8. Terminal-Bench-specific controls

Before the task verifier is treated as valid:

- at least two materially different correct implementations must pass;
- the oracle must pass from a clean environment;
- every seeded scientific error must have a failing mutation test;
- invalid report-level, estimand-mixing, comparator, and dependence baselines must fail;
- allowed alternate scientific approaches must be documented as outcome equivalence classes rather than reference-code imitation;
- hidden/generated variants must preserve the same scientific contract;
- task instructions must completely state what the verifier requires without revealing the answer;
- reviewer correction of the latent truth or verifier creates a new task version and preserves previous evaluation runs.

## 9. Claim language

Allowed:

- “Under benchmark version X and scorer version Y, condition A scored Z.”
- “A blinded review found N discordant items judged more defensible under condition A.”
- “A suspected rubric defect affects these specific items; official scores are unchanged.”
- “After independently confirmed evaluator correction version Y2, the score changed from Z1 to Z2.”

Not allowed:

- “HRP is medically reliable” based on one suite;
- “the benchmark is wrong” without bounded defect evidence;
- “the corrected score is the true score” without acknowledging the new evaluator assumptions;
- silently replacing official scores with preferred judgments;
- treating absence of a detected defect as proof that the evaluator is valid.

## 10. Review and revision boundary

This policy is intentionally narrow. It should be revised only when a concrete MAST or Terminal-Bench case exposes a missing control. Every revision must identify the triggering failure and compare the change against the SciCode-Verified baseline rather than expanding by speculation.
