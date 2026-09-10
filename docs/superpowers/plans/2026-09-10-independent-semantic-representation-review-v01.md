# Independent semantic representation review v0.1

Status: implementation in progress under the frozen strategy decision from the complete epistemic-verifier DEVELOPMENT A/B run.

## Trigger

The complete run produced 17/24 Arm B trials with an initial or persistent critical source-to-state translation defect, 0/12 deterministic verifier escapes conditional on faithful intended-attributable hard states, 0/6 deterministic false blocks on faithful final controls, and 0/24 synthesis-boundary overrides. The preregistered priority rule selects a semantic representation checker before any gate expansion.

## Boundaries

- DEVELOPMENT / DISCOVERY only.
- Exact source packet plus exact candidate `EpistemicStateV1`; no producer rationale.
- Fresh reviewer session distinct from the producer.
- No scorer key, expected answer, other-arm output, or verifier implementation in the review packet.
- No changes to Universal or HRP, existing deterministic verifier logic, production routing, MAST, or held-out data.
- One slice only; further architecture work requires a later decision from evidence.

## Implementation

- [x] Add a strict work-package schema with source/state SHA-256 binding and review-focused comparison/discriminator views.
- [x] Add an exhaustive field-level review submission covering target, comparison roles, controls, qualifiers, timing, amount/dose, route/form, feature values, predicate semantics, and dependency/provenance.
- [x] Enforce a distinct fresh reviewer identity, exact source spans, resolvable state JSON Pointers, and complete dimension coverage.
- [x] Derive fail-closed `pass`, `block`, or `indeterminate` receipts for critical representation.
- [x] Add a canonical reviewer prompt and focused tests, including the observed value-coded-feature versus `operator: present` defect.
- [x] Run the full repository gate and inspect the complete diff.
- [ ] Commit, push, open one PR, and verify hosted checks.

## Acceptance

The slice is complete when exact source-byte and canonical-state binding cannot be bypassed, self-review is rejected, missing/distorted hard-relevant semantics block, uncertainty is indeterminate, cited evidence is mechanically anchored, the observed predicate-translation defect is represented by a regression test, and `npm run verify` passes without protocol or production integration changes.
