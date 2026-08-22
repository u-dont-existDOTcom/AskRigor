# Treatment-landscape lesson closeout

Date: 2026-08-22

## Outcome

The treatment-landscape selection repair is merged in AskRigor, and its
domain-neutral lesson is promoted and closed in
`u-dont-existDOTcom/universal-dev-architecture`.

This record closes the cross-repository lesson loop. It does not change or
reinterpret deployment, Custom GPT installation, or product-interface state.

## Immutable AskRigor source receipt

- AskRigor pull request: https://github.com/u-dont-existDOTcom/AskRigor/pull/49
- AskRigor head: `afa9bd61ea4aa0d1b076818150a0feb8b266f0d3`
- AskRigor merge: `458190ab1be0849fba3f5193d59321a9c7f0d8df`
- Sanitized source artifact:
  `docs/audits/2026-08-21-treatment-landscape-selection-lock.md`
- Source-artifact SHA-256:
  `a6999861fd00c3047cbd0556d04e3c8ff2b8f93d1a9d0660f4e29ec985bcffd6`
- PR deterministic, workflow-policy, and CodeQL runs:
  `32531919082`, `32531919032`, and `32531917850`
- Merged-main deterministic, workflow-policy, and CodeQL runs:
  `32537572844`, `32537572899`, and `32537572805`

The source artifact remains byte-identical to the object Universal promoted.
Its pre-merge wording is historical provenance, not current status. This
separate closeout records the later merges without invalidating that digest.

## Universal promotion receipts

- Promoted pattern:
  `patterns/coverage-before-depth-in-selection.md`
- Promotion audit:
  `audits/2026-08-21-askrigor-coverage-before-depth-promotion.md`
- Universal promotion pull request:
  https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/30
- Promotion head and merge:
  `fc1ed2b8c9af1dd0cd36d1a2f106dda3c327f7c2` and
  `2e81fefcca500265cad0e1209bab5e8fa2306743`
- Promotion PR deterministic and CodeQL runs:
  `32538077171` and `32538075438`
- Promotion merged-main compliance and CodeQL runs:
  `32538146652` and `32538146322`
- Universal closeout pull request:
  https://github.com/u-dont-existDOTcom/universal-dev-architecture/pull/31
- Closeout head and merge:
  `13f414986eb87a5fa4bb8feb059cd00ad9d3619d` and
  `9c773e28c75b1ba87956fe0b5dfb9fd5593c8a1f`
- Closeout PR deterministic and CodeQL runs:
  `32538444059` and `32538442841`
- Final merged-main compliance and CodeQL runs:
  `32538513403` and `32538512484`

Universal's focused pattern suite passed 11/11, its full suite passed 108/108,
its repository audit reported no findings, and two independent reviews reported
no Critical, Important, or Minor findings before the respective merges.

## AskRigor closeout verification

- The focused closeout regression passed 2/2.
- The complete host-boundary gate passed typecheck and build, 65 test files
  with one declared skip, and 1,026 tests with five declared skips.
- An earlier sandboxed run was blocked by the environment's loopback and IPC
  prohibition (`listen EPERM`). It is retained as an execution-boundary result,
  not treated as a product failure or substituted for the passing host run.

## Durable behavior

The promoted rule prevents a broad comparison from being synthesized merely
because a narrow or repetitive selection was deeply audited. It requires
material-class coverage, decision-relevant candidate fingerprints, explicit
unknown and uncovered states, separate selection and depth locks, and complete
continuation receipts. Raw item counts remain planning aids rather than proof
of coverage.

The AskRigor implementation and Universal pattern both have causal regressions.
A later worker must not reopen the lesson as pending unless new evidence shows a
real regression.

## Boundaries

- The AskRigor source repair is merged, reviewed, and verified.
- The Universal lesson is promoted, reviewed, merged, and closed.
- Production still runs the separately recorded pre-repair version.
- The current 7,991-character Instructions and 20-operation Action schema are
  not deployed or installed merely because source and lesson work are complete.
- Fresh Custom GPT product-interface acceptance remains unverified.

## Lesson queue checkpoint

The required closeout checkpoint at `2026-08-21T23:55:34.292Z` was available:
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. The unreviewed candidate did
not expand this closeout.
