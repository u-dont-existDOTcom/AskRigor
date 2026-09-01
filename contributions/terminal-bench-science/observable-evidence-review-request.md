# Independent review request: Terminal-Bench observable evidence

## Requested outcome

Help prepare and independently review the **agent-visible** evidence packet for AskRigor's fictional, semisynthetic `Dependency-Aware Clinical Meta-Analysis from Overlapping Reports` miniature.

This is a narrow benchmark-method review. It is not a clinical study, a public participant program, or a request for a medical conclusion.

Routing receipt: [AskRigor issue #172](https://github.com/u-dont-existDOTcom/AskRigor/issues/172).

## Why this is open

The deterministic verifier miniature is useful, but its current `fixture.json` exposes only six report identifiers and fictional-abstract hashes. It does not expose the target estimand, observed report clues, event/person-time inputs, requested outputs, or sensitivity questions needed to solve the task. The exact preflight therefore returned 17 readiness findings and blocked any frontier run. Running a model now would measure missing context, not scientific reasoning difficulty.

Canonical baseline: AskRigor PR #171, merge `4a1e740fd239491a18de8c503b4ccf1f2c6143ca`. Blocking defect: `TB-MINI-001-agent-input-evidence-absent`.

## Two separated roles

1. **Source-layer author:** create a clean source-only export and materialize the agent-visible observations and raw numerical inputs. This role may use only information that a benchmark solver is meant to see. Do not inspect, infer from, or copy grader-only answer values.
2. **Independent clinical-epidemiology reviewer:** review the candidate agent packet and public contracts, independently of the packet author and verifier author. Do not request or inspect grader-only files or values.

The current implementation worker is not the independent reviewer. One person must not fill both roles for this acceptance gate.

## Agent-visible packet must contain

- clear task instructions and the declared target estimand;
- observed evidence supporting report-lineage reasoning, including recruitment windows, participant flow, relation clues, exposure regimen, comparator, outcome, horizon, and effect measure;
- raw event/denominator or event/person-time inputs for every requested estimate;
- the six exact structured outputs already defined by the task;
- explicit sensitivity questions;
- provenance codes and a SHA-256 bound to the disclosed payload.

The executable contract is `evaluation/terminal-bench/difficulty-probe-contract.ts`. Missing source fields must remain explicitly missing; they may not be guessed.

## Must remain withheld from both roles

- latent study and cohort identifiers;
- allowed relation labels;
- dependency groups;
- compatibility verdicts or incompatibility codes;
- allowed primary contribution sets;
- expected sensitivity inclusion sets;
- numeric tolerances or expected pooled outputs;
- oracle, alternate, invalid-candidate, proof, or truth values.

## Reviewer questions

Return `PASS`, `NEEDS_REPAIR`, or `BLOCKED`, with field-level findings, for each question:

1. Can a qualified solver complete the task from the disclosed packet alone?
2. Do the disclosed observations support lineage reasoning without exposing the intended relation labels?
3. Is the target estimand operational and exposure-indexed?
4. Do the raw inputs support every requested risk or rate calculation?
5. Can genuine uncertainty be represented without forcing a hidden classification?
6. Do the requested outputs and sensitivities match the scientific task?
7. Does difficulty come from scientific evidence-identity and estimand reasoning rather than omitted context or formatting traps?
8. Is the packet free of grader/answer leakage?

Please also state whether you previously saw any grader-only values. A reviewer who has seen them should recuse from this acceptance check rather than try to discount that knowledge.

## Acceptance boundary

A frontier difficulty probe remains blocked until:

- the candidate agent packet passes the mechanical completeness, payload-hash, and leakage preflight; and
- the independent reviewer returns `PASS` on all eight questions.

This request does not authorize paid inference, an external Terminal-Bench submission, publication of the latent fixture, or any production/clinical-protocol change.
