# AskRigor current state

## Active owner task: instruction optimization (2026-09-26)

The owner started a new task in a Claude Code session: make AskRigor at least as
rigorous with far less instruction text and more server-enforced rules, so it
can run well on GPT consumer chats as well as Claude. Plan, owner decisions, and
status: `docs/superpowers/plans/2026-09-26-instruction-optimization.md`.
Phase 0 findings: `docs/audits/2026-09-26-instruction-optimization-phase0.md`.
Checkpoint (2026-09-27, branch `claude/askrigour-instruction-optimization-cffyp2`,
draft PR #246, nothing merged or deployed): section-based protocol loading; signed
research receipts and the `finalize_research` completion gate on MCP; MCP result
size budgets for YouTube audits and full-text pages; compact pseudonymous comment
records; HRP 20.6.0 (process, output and meta sections consolidated, no method
change; review at `docs/audits/2026-09-26-hrp-20.6.0-consolidation.md`); HRP
20.6.1 (owner-directed: a capped first pass with open leads replaces the fixed
8-video / 6-program minimum, enforced by `finalize_research` and the landscape
checker); HRP 20.6.2 (owner-approved: ten method sections shortened with the
same meaning, after two independent meaning reviews); HRP 20.6.3 (conformance
with 20.6.1: a final self-check, a regression case, the Project router and the
Forum Signal module still stated the old minimum or told the model to keep
widening during a first pass); a coverage-checker fix from the smoke-run replay
(first-pass breadth gaps become open leads, and complete grouped blocker lists
replace eleven messages per call); Universal 20.5.29
(owner-approved: precise clinical terms replace the euphemism rule); scout-first
discovery (owner-approved: the Gemini scout finds videos, comment-named remedies
go back to it as `rediscovery_leads`, and the YouTube survey is the fallback,
because YouTube search is capped at 100 calls a day per project). Claude test runner and blinded Opus judge under
`evaluation/instruction-optimization/`. Open: the coverage-checker cost (owner
decision, see the plan); the GPT route (owner decision); the rerun on the fixed
head and the held-out comparison runs (YouTube search is capped at 100 calls a
day per project, and saved runs used 22 to 49 searches each). The MAST
records below are unchanged; the owner set aside a full MAST rerun for this task.

## Authority and parent task

Read `AGENTS.md` and `governance/chat-work-authority-policy.json` first.
The parent task is `askrigor-external-evaluation-contribution-v1` and remains OPEN.
This entrypoint reports operational status; it is not an execution grant, a
scientific verdict, or a release receipt.

## Last validated repository integration

PR #190 uses branch `task/mast-four-arm-zero-spend-harness-20260901`.
The accepted integration checkpoint is `9d88e7f23e52efa4d077168f19103aa66521cff9`,
tree `c893be468f09d92f7e77a1ce33de041f724ad0a4`, integrating accepted main
`7fb852758e01df60203f102d784c95e76ff9177b`.
Local verification and the ordinary hosted integration checks passed.
PR #190 remains draft and unmerged pending Project Manager source review.
These results apply to that checkpoint, not automatically to later edits.
Universal 20.5.18 is preserved from accepted main; HRP remains byte-identical.
This source checkpoint does not establish deployment or product acceptance.

## Current execution boundary

Every new controlled execution requires a current source-bound directive and fresh
authenticated runtime admission for that exact scope. Historical directives,
commands, and admission receipts grant no present execution allowance.
The retained `currentSlice` and earlier execution fields in `tasks/ACTIVE-TASK.json`
are historical records. Its separate `repositoryIntegration` record concerns
repository integration only; it does not reopen historical execution.
Calibration remains CLOSED_BLOCKED; no further browser diagnostic is authorized.
No new screenshot, upload, probe, generation, evaluation, rescoring,
or alteration of historical evidence or attempt counts is authorized here.
Reasoning Selection implementation and lesson promotion remain separate.
Paid model API inference remains forbidden; the external spend ceiling is USD 0.
Internal supervisory routing must not require owner relay.

## Recovery references

`docs/audits/2026-09-07-pr190-queue-reconciliation-v2.json` records the integration
pre-validation snapshot; PR #190's persisted implementation return records its
subsequent commit and check identities. Do not reinterpret snapshot fields as
newly pending work or repeat completed operations.
`docs/state/MAST-FOUR-ARM-BASE-BLINDED-EVALUATION-CURRENT-STATE.md` and
`docs/superpowers/plans/2026-09-06-mast-four-arm-base-post-gate-closeout.md`
retain chronological evidence. Earlier instructions there remain historical
unless explicitly reopened by a new source-bound directive and fresh admission.
Retain all original receipts and private artifacts unchanged; do not republish
private paths, payloads, or scientific findings in this entrypoint.
