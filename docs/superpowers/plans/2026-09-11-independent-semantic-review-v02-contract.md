# Independent Semantic Representation Review v0.2 DEVELOPMENT contract

## Authority and boundary

This bounded continuation implements the exact next step selected by the frozen
Independent Semantic Representation Review v0.1 DEVELOPMENT result merged in
PR #213. It does not change `EpistemicStateV1`, deterministic verifier gates,
HRP, Universal Instructions, MAST evidence, production behavior, or deployment.

## Causal defects to repair

1. Two of three reviewers missed the natural-state distinction between a feature
   record existing and that record storing a value such as `present`.
2. The v0.1 controlled mutation base labeled as faithful omitted the named
   exposure, collapsed an upper timing bound into an exact scalar, and attached
   dose/timing semantics to a narrower hypothesis.

## Implementation

- Add a versioned DEVELOPMENT prompt that requires an explicit source-predicate
  to state-predicate truth-table check for every discriminator.
- Build a new prospective 11-pair controlled mutation corpus with new opaque IDs
  and hashes. Preserve the named exposure, use exact timing consistently, and
  keep the material hypothesis limited to the exact source claim.
- Keep reviewer dispatch blocked until every candidate has two independent
  source/state-only semantic adjudications and any disagreement has a third.
- Add deterministic tests for source/state facts, pair isolation, operator
  semantics, opaque identity, and the pre-adjudication block.

## Active universal lessons

- `codex-github-operating-system`: use a separate branch/worktree, exact-head
  checks, complete verification, and a reviewable PR.
- `task-time-lesson-activation`: bind the v0.1 observed failures to the prompt,
  fixture, and admission-test enforcement points in this plan.
- `independent-evaluation-separation`: keep construction gold out of blinded
  work packages and require actual independent adjudication before dispatch.
- `structured-output-failure-boundary`: preserve invalid reviewer output as an
  interface failure rather than silently normalizing it into a semantic result.
- `transformation-preservation-proof`: keep old frozen artifacts immutable and
  require each prospective pair to differ only at declared JSON Pointers.

## Completion for this slice

The candidate corpus and prompt are reproducible, focused tests and the complete
repository gate pass, and the repository records that no fresh reviewer run or
production integration has occurred.

## Prospective execution continuation

Before any reviewer trial, run two source/state-only adjudications for every
opaque candidate in fresh temporary consumer sessions. Freeze raw output and
controller-observed model, mode, conversation, message, timing, and byte-hash
provenance. Any per-dimension status or hard-relevance disagreement requires a
third fresh adjudication. Keep construction gold unopened until those initial
outputs are frozen, reconcile the adjudicated corpus, then run three fresh v0.2
reviews per candidate. No result from this DEVELOPMENT corpus authorizes
production integration.
