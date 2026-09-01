# MAST Paired HRP Evaluation

**Status:** specified, not yet executed  
**Source pin:** `ARISENetwork/mast@57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee`  
**Purpose:** test whether the complete HRP instruction path improves or degrades clinically consequential reasoning when the underlying model and execution conditions are held constant

## 1. Primary comparison

Run one exact base-model snapshot under two conditions:

- `BARE`: minimal neutral system wrapper;
- `HRP`: identical endpoint/model/settings with the complete current Universal + HRP instruction path.

The first epoch is invalid unless these remain identical across conditions:

- provider and endpoint class;
- model identifier/snapshot;
- sampling and reasoning settings;
- context and output-token budgets;
- case text and ordering;
- retries and timeout policy;
- parser and answer extraction;
- benchmark source/data/scorer version;
- NOHARM judge configuration.

Condition labels should be blinded for item-level discordance review.

## 2. Benchmark components

At the pinned source identity:

- Script Concordance Test: 174 open items, deterministic scoring;
- First Do NOHARM v2 open set: 30 base cases, up to 11 variants each / 330 items under the documented default, specialist-authored rubrics, two-stage Gemini judge, severity-weighted F1 headline score.

The deterministic SCT run is the first reproducibility anchor. NOHARM is treated as a judge-mediated clinical safety instrument whose exact judge identity and drift limitations must be reported.

## 3. Execution stages

### Stage A — Adapter smoke

Use explicitly non-analytic development traffic or a tiny declared smoke subset to verify:

- OpenAI-compatible request/response shape;
- system-instruction placement;
- timeout and retry behavior;
- truncation absence;
- parser correctness;
- response preservation and hashing.

Smoke outputs may not be used to alter HRP's substantive content.

### Stage B — Complete SCT epoch

Run all 174 items under both conditions. Preserve one record per item and condition:

- exact input identity;
- raw response;
- parsed answer;
- score;
- latency, token usage, retry count, and provider metadata;
- response hash.

Primary statistic: paired score difference with item-level directionality and a justified uncertainty interval. Report condition wins, losses, ties, and domain/item strata available from the benchmark.

### Stage C — NOHARM pilot

Use a predeclared subset of base-case families only to estimate:

- judge stability;
- cost and latency;
- frequency/severity distribution;
- truncation and format failure rates;
- plausible smallest meaningful benefit and safety non-inferiority margin.

Freeze the complete-run analysis plan after this pilot and before seeing complete-suite results. Do not repair HRP in response to pilot cases.

### Stage D — Complete open NOHARM epoch

Run all 30 base cases and documented variants in both conditions. Preserve raw responses before judging. Record exact match-judge and review-judge model identifiers, prompts/configuration, retries, dates, and raw judge outputs.

### Stage E — Blinded discordance audit

Review all or a prespecified sample of condition-discordant cases under neutral labels. Classify:

- likely HRP improvement;
- likely HRP-induced harm;
- equivalent defensible answers;
- rubric ambiguity;
- possible rubric/reference defect;
- contestable mainstream norm;
- execution/scoring failure;
- unresolved.

Unblind only after the substantive classification and rationale are recorded.

## 4. Outcome hierarchy

### Primary outcomes

- paired SCT score difference;
- paired NOHARM `F1_weighted` difference.

### Safety constraints

- no material increase in severe harmful recommendations;
- no unacceptable reduction in the worst-variant floor;
- no aggregate gain that hides a major domain, perturbation, or case-family regression;
- no cost/latency increase disproportionate to measured benefit.

Exact numerical margins must be frozen after the pilot and before the complete NOHARM run.

### Diagnostic outcomes

- direction of change per item/case family;
- severity-weighted commissions and omissions;
- unnecessary intervention;
- failure to escalate or manage uncertainty;
- robustness across perturbations of the same base case;
- cases where HRP changes content without changing the official score;
- response length, cost, latency, and truncation.

## 5. Benchmark integrity

Apply `evaluation/governance/correction-and-recheck-policy.md`.

- Official MAST scores remain the official layer.
- Suspected evaluator defects are recorded separately.
- A score-changing correction requires reproducible evidence, independent recheck, and a new evaluator epoch.
- Preview judge drift is evaluator drift, not automatically model-under-test drift.
- A disagreement with mainstream practice is not automatically a rubric defect.
- Raw model and judge outputs must remain available for re-scoring where licenses and privacy permit.

## 6. Interpretation boundary

A favorable result would support the claim that HRP improved performance on these specific clinical safety and uncertainty instruments under the recorded conditions. It would not establish general medical reliability, heterodox evidence-synthesis validity, diagnostic accuracy in deployment, or patient benefit.

An unfavorable result must be decomposed before any protocol repair: true HRP harm, verbosity/truncation, system-instruction conflict, endpoint artifact, scorer/judge instability, or benchmark construct mismatch are different failure mechanisms.

## 7. Required files before execution

The next implementation slice should add:

- `configs/paired-open-v1.json`;
- `manifests/paired-open-v1.preflight.json`;
- endpoint adapter and response-preservation code;
- deterministic SCT analysis code;
- NOHARM pilot sampling declaration;
- blinded discordance form/schema;
- cost ceiling and abort rules;
- clean-room run instructions;
- validation tests for condition equality, parser behavior, and artifact hashing.

No paid judge run should begin until these are reviewed and the protocol identities are inserted exactly.
