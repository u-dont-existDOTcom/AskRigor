# Epistemic phase router and heuristic-hijack repair

## Objective

Repair two recurring, domain-general reasoning failures in the canonical
AskRigor protocols:

1. validation safeguards suppressing legitimate discovery because the data's
   epistemic phase was not classified first; and
2. a generally useful heuristic becoming over-salient and controlling a task
   outside its intended problem, phase, or context.

## Authority and baseline

- Owner request dated 2026-08-24.
- Base commit: `b9a9b4b` from current `main` after fetch and fast-forward.
- Canonical source baselines:
  - Universal `20.5.14`, 2026-08-18,
    `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`.
  - HRP `20.5.22`, 2026-08-23,
    `9389f0f364280f32e5d0c8e9d6b26f93473a205f3134f1f4ab9ef819ca4e3fcf`.
- The one-shot workflow and migration script on current `main` are temporary
  bootstrap machinery, not canonical protocol content. They are inspected for
  wording only and removed in the repaired change.

## Authorized changes

- Increment Universal to `20.5.15` and HRP to `20.5.23`, dated 2026-08-24.
- Add the complete Universal heuristic-attractor check and epistemic phase
  router, including the owner's two behavioral regression scenarios.
- Mirror the controlling phase distinction in HRP because HRP otherwise wins
  conflicts, and bind it into HRP architecture, regression protection, stress
  tests, and final checks.
- Add compact worker/project routing at `AGENTS.md` and
  `project/PROJECT_INSTRUCTIONS.md` while preserving XML authority.
- Update exact byte-derived manifests, current source map/checkpoint, and tests.
- Preserve the Custom GPT architecture: generated editor instructions load the
  complete protocols from runtime Actions and do not embed a competing protocol
  excerpt or stale version snapshot.
- Remove the obsolete self-modifying one-shot workflow and migration script.

## Preservation obligations

- Preserve all pre-existing canonical Universal and HRP content except root
  identity metadata and the explicitly authorized additions.
- Preserve public MCP and Action inventories, source-access behavior, product
  health policy, privacy boundaries, and unrelated generated artifacts.
- Historical release and audit records remain historical; do not rewrite them
  to imply a release or deployment that has not happened.

## Verification

- [x] Parse both canonical XML files.
- [x] Run the dedicated phase-router/heuristic-hijack regression test.
- [x] Run protocol and generated Custom GPT synchronization tests.
- [x] Run `npm run test:run` and `npm run verify`.
- [x] Inspect the complete final diff and verify the obsolete one-shot files are
  gone.

The final `npm run verify` result is green: typechecking passed; 98 test files
passed with one declared skip; 1,327 tests passed with six declared skips; and
the production build passed. The canonical hashes are Universal
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172` and
HRP `bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`.

The required lesson checkpoint at `2026-08-24T21:03:55.162Z` was available:
1 open candidate, 1 needing review, 0 accepted but not incorporated, 3
incorporated or closed, and 0 deletion eligible. Neither queued item expands
this task. No separate lesson artifact is needed because the owner-directed
general rule is being incorporated directly into the canonical protocols and
protected by executable regressions.
