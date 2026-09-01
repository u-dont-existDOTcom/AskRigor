# SUPERVISION_DESIGN_FEEDBACK

Lane: `supervision-architecture/20260901T162500Z`

Shared meta-review receipt: [universal-dev-architecture issue #55](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/55)

## Immediate-risk finding

The private Terminal-Bench miniature had strong verifier evidence—two different correct candidates passed, eight invalid candidates failed, and six verifier mutants were killed—so the work queue advanced toward a frontier-agent difficulty probe. The later anti-leakage preflight found that the sole agent-facing file contains only six report IDs and hashes. It contains none of the observed evidence, target estimand, event or person-time inputs, requested outputs, or sensitivity questions needed to solve the task.

A frontier failure on that packet would measure context starvation while looking like scientific task difficulty. No frontier agent was invoked.

## Supervision loophole

Evidence from the grader/verifier layer silently deselected a distinct subject-facing solvability requirement. This is the same structural class as allowing strong evidence from one required layer to stand in for another, even though the artifact types and acceptance questions differ.

## Meta-review question

Should recurring supervision maintain a separate subject-to-contract readiness state before external evaluation begins, distinct from verifier-to-contract validity, independent-evaluator separation, worker-to-contract alignment, and contract-to-owner alignment?

A candidate control for review is to require exact inventories for subject-facing inputs and grader-only artifacts, mechanical leakage checks, and a solvability-from-disclosed-evidence gate before any paid or conclusion-bearing difficulty inference. This packet does not rewrite the shared rules.

## AskRigor repair

AskRigor now has an answer-free bundle contract, leakage mutants, an exact private preflight, and defect `TB-MINI-001-agent-input-evidence-absent`. The earlier verifier-feasibility epoch remains preserved. Any frontier-difficulty claim fails closed until a non-answer-bearing observable-evidence layer exists and receives independent method review.

Operational alignment passes for the project repair. Scientific adequacy fails closed for frontier difficulty. Release adequacy is not implicated: no external submission or production mutation occurred.
