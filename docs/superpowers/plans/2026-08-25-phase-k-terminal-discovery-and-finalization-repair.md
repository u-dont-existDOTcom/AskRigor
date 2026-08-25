# Phase K terminal discovery and finalization repair

## Observed product failure

The fixed Custom GPT acceptance session reached
`CONTINUE_RESEARCH` after the automated Gemini scout recorded a terminal
invalid-packet boundary, but the server returned no next capability. The public
projection then converted that impossible state into a `finalize` directive.
Finalization was correctly denied, so the product entered a deterministic
dead end.

The encrypted production checkpoint confirmed two related controller defects:

1. a terminal automated-scout operation prevented independent native YouTube
   discovery even though validated candidates and reusable search queries were
   already present; and
2. the operation and candidate-frontier status could diverge after a later
   scout failure, leaving the operation terminal while the retained frontier
   remained retryable.

The checkpoint also confirmed that required module execution statuses are not
projected from the server-owned operations that implement them. Tests reached
successful finalization only by manually marking those modules complete.

A bounded pre-merge live replay against the repaired concrete acceptance
target exposed a separate integration-level quality regression. The checked-in
Spark skill asks for a broad, treatment-specific landscape, but the automated
compact transport invited only three candidates and forced low thinking. Nine
grounded searches then produced four IDs; two passed independent identity
validation and two were rejected for channel mismatch. The transport overlay,
not the underlying skill, was weakening discovery.

## Repair invariants

1. `CONTINUE_RESEARCH` must never be projected as `finalize`. A live continue
   state has server-directed semantic work or an executable next capability. If
   terminal boundaries leave no executable work, the projection returns a
   stable terminal-blocked directive rather than an internal exception or a
   finalization loop.
2. A retryable automated-scout failure remains retryable and blocks downstream
   substitution. A genuinely terminal automated-scout boundary is preserved as
   a limitation but cannot suppress still-executable native discovery.
3. Candidate-frontier status must be reconciled with the authoritative scout
   operation after terminal or retryable boundaries. Retained validated
   candidates and queries remain provenance, while unresolved terminal
   identities remain gaps rather than negative evidence.
4. Native discovery may use retained external queries after a terminal scout
   boundary. If no queries were retained, it uses a bounded, deterministic,
   target-derived discovery set; it never invents a successful external scout.
5. Candidate screening may proceed from complete or terminal discovery
   frontiers when at least one independently validated candidate exists and no
   retryable identity work remains. Any terminal frontier keeps the final
   answer bounded unless later protocol-owned state permits otherwise.
6. Required module execution statuses are derived from the exact operation
   groups that implement them. Clients and semantic workers still cannot author
   module completion.
7. The live acceptance target must exercise the known program-conflation
   regression with a concrete de-identified population and multiple specific
   exercise/nonexercise implementations. This is a product fixture, not a
   condition-specific protocol rule.
8. The automated compact transport must not weaken the checked-in scout skill.
   Broad treatment-choice targets request 8–16 materially distinct candidates,
   use medium thinking, and permit smaller packets only with a concrete gap.
9. A deterministic transition receipt must describe the resulting authoritative
   operation state. Progress, retryable boundaries, terminal boundaries, and
   actual operation completion are distinct outcomes.

## Verification

- Add hostile controller/frontier/controlled-route tests for terminal-scout
  continuation, retained frontier reconciliation, fallback discovery, absence
  of finalization loops, and automatic module projection.
- Run focused tests, `npm run test:run`, and `npm run verify`.
- Inspect the final diff, open a PR, review CI, merge, deploy the exact merge
  commit, then rerun the fixed real-product acceptance from a fresh session.

## Current verification

- [x] Hostile terminal-scout continuation and no-finalize-loop regressions.
- [x] Restored partial-frontier reconciliation regression.
- [x] Terminal fallback/native discovery and retryable-bypass regressions.
- [x] Automatic required-module projection through a successful fixture.
- [x] Concrete acceptance-target and compact-scout-quality regressions.
- [x] Focused controller/orchestration review-fix tests: 51/51; independent
  re-review: 25/25 with no remaining finding in the repaired paths.
- [x] Typecheck.
- [x] Full exact `npm run verify`: typecheck, 1,383 tests across 105 passing
  files with six declared skips and one skipped credential-guarded file, and
  production build. A preceding parallel test checkpoint hit one existing
  fixed-duration HTTP timeout and exposed stale generated-artifact hashes; the
  timeout and repaired release packet passed 59/59 in isolation before the
  clean exact full gate.
- [ ] PR review, merge, exact deployment, and fresh product acceptance.
