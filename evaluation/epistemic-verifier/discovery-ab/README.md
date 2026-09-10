# Blinded DEVELOPMENT/DISCOVERY A/B execution — 2026-09-09

Status: **completed in the frozen run `runs/20260909-complete-3x8x2/`.**

This directory operationalizes issue #208's prompt-only-vs-executable comparison without touching frozen MAST evidence, HRP/Universal XML, benchmark metrics, or paid API inference.

Canonical base commit: `63f341502a9caa432ffbcf1074d1b8e133a6c52b`.

## What was executed

- Re-read the current authority/governance, issue #208, merged v0.1 implementation plan, evaluation README, the eight source-level DEVELOPMENT fixtures, verifier implementation, and tests at the pinned commit.
- Captured live canonical protocol manifests:
  - HRP 20.5.27 (2026-09-09), SHA-256 `65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`;
  - Universal 20.5.22 (2026-09-08), SHA-256 `d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`.
- Confirmed post-merge GitHub Actions run `34392380245` for `63f341502a9caa432ffbcf1074d1b8e133a6c52b` completed successfully. The repository CI executes `npm run verify`.
- Created a deterministic blinded surface variant of all eight DEVELOPMENT fixtures. Original fixture identities and expectations are isolated in the scorer-only key.
- Compared each short canonical `source_packet` with its canonical `stateForFixture()` builder. This exposed an under-specification problem: several short packets omit neutral case/comparator/discriminator scaffolding that the tests add before verification. The blind packets were corrected to include only those already-canonical test-state facts so Arm B cannot appear safer merely because an unrelated gate fails on an under-specified state.
- Frozen exact Arm A, Arm B state, Arm B repair, and Arm B synthesis prompts.
- Frozen a scoring contract that separates end-to-end escape, semantic translation, deterministic verifier failure, synthesis-boundary failure, false block, repair, and conclusion change, and forbids crediting collateral blocks caused by malformed/incomplete state as enforcement of the intended invariant.
- Derived the canonical deterministic gold-state baseline from the fixture expectations + test assertions + successful pinned CI run.

## Completed consumer execution

The later authorized consumer-browser route completed 48/48 independent fresh sessions: 24 Arm A outputs and 24 Arm B state, verification, repair, recheck, and synthesis chains. All blind outputs were committed at `32735f87b80e5fadbf222be7051b74a01b6244e6` before the scorer key was opened. The complete provenance, integrity incidents, unblinding receipt, scoring ledger, report, and machine-readable summary are preserved in `runs/20260909-complete-3x8x2/`.

## Deterministic v0.1 result at the pinned commit

The canonical tests assert the expected receipt for every deterministic fixture and the pinned CI run passed.

Developer baseline:
- fully represented hard-challenge fixtures: **5**;
- deterministic hard-invariant escapes: **0/5 (0%)**;
- narrow-pass controls: **2**;
- deterministic false blocks: **0/2 (0%)**;
- deliberate missing-high-information-qualifier challenge: deterministic verification relative to the incomplete state permits synthesis, while the separate representation audit blocks the omission **1/1**.

These are **not** Arm A/B consumer-performance estimates.

## Files

- `v01-blinded-development-packets.json` — safe packet set for blinded reasoning sessions; includes only canonical test-builder scaffolding needed to preserve intended gate representability.
- `v01-blinded-development-key.json` — scorer-only identity/gold/critical-semantics mapping; never show to either arm.
- `arm-a-prompt.txt` — exact prompt-only arm wrapper.
- `arm-b-state-prompt.txt` — exact state-production wrapper; no verifier code or expected outcomes.
- `arm-b-repair-prompt.txt` — receipt-directed repair wrapper.
- `arm-b-synthesis-prompt.txt` — final synthesis wrapper after verification.
- `SCORING.md` — metric definitions and cause attribution.
- `deterministic-baseline-receipt.json` — executed deterministic development baseline.
- `execution-manifest.json` — provenance, model/mode capture, spend, blocker, and result status.

## Development result and strategy decision

Arm A and Arm B each had 0/15 eligible end-to-end hard-invariant escapes, so this small DEVELOPMENT set showed no material comparative improvement and had a prompt-only floor effect. Arm B had initial or persistent semantic translation defects in 17/24 trials, while the deterministic verifier had 0/12 escapes conditional on a faithful intended-attributable hard state and 0/6 false blocks on faithful final controls.

Under the preregistered priority order, the next slice is one development-only independent semantic representation checker. The result does not authorize production integration, more deterministic gates, protocol edits, or a held-out validation claim.
