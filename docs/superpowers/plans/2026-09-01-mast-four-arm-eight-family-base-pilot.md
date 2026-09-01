# MAST four-arm eight-family base pilot execution plan

**Task:** `askrigor-external-evaluation-contribution-v1`

**Lane:** bounded decision experiment

**Directive:**
`docs/directives/2026-09-01-zero-spend-chatgpt-mast-four-arm-eight-family-base-pilot.json`

## Objective

Execute the Project Manager's frozen zero-spend base-generation slice exactly:
96 independent responses across eight untouched MAST families, four arms, and
three trials. Preserve complete mechanical provenance and stop before
evaluation, perturbations, tuning, or scientific interpretation.

## Steps

1. [x] Reconcile protected main after All001 and Card001 calibration merges.
2. [x] Capture and source-bind the corrected Project Manager directive.
3. [x] Implement a generation-only preflight that cannot inspect rubric or
   guidance files.
4. [x] Verify the zero-spend Chat/Work execution gate.
5. [x] Freeze the exact 96 inputs and deterministic opaque dispatch schedule in
   a private mode-0700 artifact root.
6. [ ] Capture 96 valid fresh-chat GPT-5.6 Sol Extra High responses, retaining
   any invalid mechanical attempt before an identical fresh-chat retry.
7. [ ] Freeze the exact raw-output/provenance ledger and validate completeness,
   uniqueness, modes, hashes, zero spend, no tools, and no cross-run context.
8. [ ] Return a factual receipt to the Project Manager automatically.
9. [ ] Stop at the directive's generation boundary; the next evaluation slice
   requires the already-frozen plan and a new bounded execution receipt.

## Acceptance for this slice

- exactly 96 valid responses and no denominator shrinkage;
- one fresh clean conversation per valid response;
- exact input/output hashes and verbatim private bytes;
- exact ChatGPT chat/message/model/mode provenance;
- no tools, browsing, provider APIs, credentials, or spend;
- no rubric/guidance inspection before the generation ledger is frozen;
- no evaluation, unblinding, perturbation, tuning, or efficacy claim;
- deterministic tests and final repository verification pass before PR handoff.

Operational, scientific, and release adequacy must be reported separately.
