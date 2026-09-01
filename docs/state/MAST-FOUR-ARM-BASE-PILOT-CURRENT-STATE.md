# MAST four-arm base pilot current state

**Checkpoint:** 2026-09-01 23:20 UTC

**Task:** `askrigor-external-evaluation-contribution-v1`

**Branch:** `task/mast-four-arm-zero-spend-harness-20260901`

**Baseline:** `88eb6d252d7b7547d3a2039872bddc96707fee9e`

**Status:** `FOUR_ARM_BASE_INPUTS_FROZEN / GENERATION_PENDING`

## Authority and boundary

The exact corrected directive came from the configured ChatGPT Project Manager:

- chat: `https://chatgpt.com/c/6a974f49-19b4-83ea-becf-2974dde6fc66`;
- user message: `6e3dfb86-7f6f-4d1b-9db8-1df80416600b`;
- assistant message: `73fe6ae7-3faa-45b3-b7d2-2394ef852183`;
- exact private output SHA-256:
  `bf864a37c3da6b9e187a21865cf44546e45e2341dfac6f6f4d60a3d7ab5b3b33`;
- observed model/mode: GPT-5.6 Sol, Extra High 4/5.

Codex/Work performs only bounded mechanical generation and provenance capture.
It may not change methodology, inspect results scientifically, tune Universal or
HRP, evaluate before the freeze boundary, spend money, use provider APIs, or
ask Joel to relay an internal packet.

## Frozen generation design

- Development calibration only: `All001`, `Card001`.
- Untouched base families: `Derm001`, `Endo002`, `GI004`, `Heme010`, `ID008`,
  `Nephro005`, `Neuro007`, `Pulm005`.
- Arms: exact MAST default, exact MAST thorough, Universal only, Universal + HRP.
- Trials: three independent fresh chats per family-arm.
- Total: 8 × 4 × 3 = 96 responses.
- Provider: ChatGPT consumer chat, GPT-5.6 Sol, Extra High.
- Tools/browsing: forbidden.
- Spend/API credentials: zero/forbidden.
- Retry: mechanical failures only, with the invalid receipt retained.

MAST is pinned at commit
`57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee`, tree
`f73e1cb717d3e76353b190abc13739d7f3476798`. The preparation script verifies
the clean Git pin and only the generation artifacts: `items.jsonl`,
`default.md`, and `thorough.md`. It does not read rubric or guidance files.

## Exact frozen receipts

Private artifact root: `/tmp/askrigor-mast-four-arm-base-artifacts.dMzP1H`
(directory mode 0700; files mode 0600).

- preflight:
  `77950b8ec54a03c6be43d26b9b90c081bd9aa74ee5c0480feadb91ac8528c141`;
- arm manifest:
  `4fbb0d5ba2b47ced248eca8c57b873c1b62665ec5376a239ac2e3082495f971f`;
- opaque schedule:
  `eee6e05a9fa6db932a8db250b3446569eccd089d74d0506529b97ddd1dfeadd6`;
- private dispatch map:
  `8f1eedb3df5bcbecd4f708b264b4bda81e62a9bd450b5427706b4f23bfa4b5a2`.

## Verification completed

- focused harness, authority, active-task, and acceptance tests: 13 passed;
- strict direct TypeScript check: passed;
- Chat/Work zero-spend authority gate: passed;
- exact preflight execution: 96 private input files created with required modes;
- complete deterministic gate: 1,675 tests passed and 6 declared skips across
  140 passing files and 1 skipped file; typecheck and build passed;
- rubric/guidance inspection: not performed;
- untouched-family response generation: not started.

## Next executable action

Process the opaque schedule in order. For each entry, open one fresh clean
ChatGPT conversation, verify GPT-5.6 Sol Extra High, send the exact private input
with no added instruction, reject tool/browsing runs, and preserve chat URL,
message IDs, timestamps or explicit unavailable state, model/mode evidence,
input hash, verbatim output, and output hash. Freeze all 96 valid records before
any evaluator or rubric/guidance access.

Operational alignment: inputs frozen and ready; generation pending.

Scientific adequacy: not reached; no untouched output evaluated.

Release adequacy: unaffected; no release, deployment, API inference, spend, or
external submission.

Typed claim: `FOUR_ARM_BASE_INPUTS_FROZEN_GENERATION_PENDING`.
