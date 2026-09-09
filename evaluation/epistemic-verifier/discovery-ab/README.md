# Blinded DEVELOPMENT/DISCOVERY A/B execution — 2026-09-09

Status: **partially executed; fresh consumer-session inference blocked by unavailable isolated-session capability in this chat.**

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

## What could not be validly executed

This reasoning session is contaminated for consumer inference because it has already read fixture identities, expected results, the verifier implementation, tests, and scoring key. The currently exposed tools cannot spawn or message a fresh isolated consumer ChatGPT session. Reusing this session would violate the requested blinding and would produce a misleading A/B result.

Therefore:
- Arm A consumer outputs: **not run**.
- Arm B consumer semantic states: **not run**.
- Consumer repair loops: **not run**.
- End-to-end A/B comparative claim: **not available**.

This is an `UNAVAILABLE_EXTERNAL_CAPABILITY_AFTER_ALL_NONBLOCKED_WORK` stop under repository governance, not a methodological choice to stop early.

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

## Next architecture decision

Do **not** claim that v0.1 materially outperforms prompt-only HRP until fresh paired consumer outputs exist.

The represented-invariant premise is currently supported: the deterministic kernel prevented all five fully represented hard challenges in its canonical DEVELOPMENT states. The one explicitly demonstrated remaining hole is source-to-state semantic omission, which the verifier cannot see unless an independent representation check catches it.

Accordingly, the next architectural slice should be selected from the actual fresh Arm B failure distribution:
1. representable verifier escapes -> fix verifier/state model before adding gates;
2. predominantly source-to-state translation failures -> build an independent semantic representation verifier;
3. no material Arm B improvement over Arm A -> challenge the executable-verifier premise rather than expanding it.

At this checkpoint, independent semantic representation verification is the **leading candidate**, but it is not promoted as the empirical A/B winner until the blocked fresh-consumer run is completed.
