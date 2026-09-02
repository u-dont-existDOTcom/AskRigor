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
6. [x] Reconcile unavoidable consumer automatic-tool behavior through the exact
   source-bound Project Manager transport amendment; preserve the first three
   first-pass responses, the two original invalid receipts, and the superseded
   sequence-1 recovery attempt.
7. [x] Restore and deterministically verify the canonical live Mission Control
   admission endpoint, deploy only the source-bound recovery revision, and
   preserve an authenticated `mayExecute: true` receipt bound to the exact
   zero-spend MAST directive and transport amendment. Candidate
   `079881125ccd555cdff4f8502773f7e1b301232d` passed isolated and live L1-L5
   acceptance; L5 returned `mayExecute: true`.
8. [ ] Capture the remaining 44 primary first-pass GPT-5.6 Sol Extra High
   responses, logging automatic tool behavior without conditional retry. The
   first 24 are frozen and preserved without rerun. Sequence 24 attempt 1 is a
   retained provider-rate-limit failure with no assistant output; attempt 2 is
   frozen as valid. Sequences 25 through 52 are also frozen; resume at sequence
   53 after the provider cooldown.
9. [ ] Freeze the exact raw-output/provenance ledger and validate completeness,
   uniqueness, modes, hashes, zero spend, no manual tools, complete automatic
   tool-process logging, and no cross-run context.
10. [ ] Return a factual receipt to the Project Manager automatically.
11. [ ] Stop at the directive's generation boundary; the next evaluation slice
   requires the already-frozen plan and a new bounded execution receipt.

## Acceptance for this slice

- exactly 96 valid responses and no denominator shrinkage;
- one fresh clean conversation per valid response;
- exact input/output hashes and verbatim private bytes;
- exact ChatGPT chat/message/model/mode provenance;
- no manual tools, provider APIs, credentials, or spend; automatic model tool
  behavior is logged for every response under constant ambient availability;
- no rubric/guidance inspection before the generation ledger is frozen;
- no evaluation, unblinding, perturbation, tuning, or efficacy claim;
- deterministic tests and final repository verification pass before PR handoff.

Operational, scientific, and release adequacy must be reported separately.
