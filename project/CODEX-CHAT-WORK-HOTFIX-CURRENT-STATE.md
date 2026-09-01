# AskRigor Codex/Work Current State — Chat Authority Hotfix

## Controlling state

- Task: `askrigor-external-evaluation-contribution-v1`
- Required branch: `hotfix/chat-reasoning-zero-spend-routing-20260901`
- Baseline: `a1d4aaf0fe2010edc5cec13e6c431877a311d074`
- Policy: `governance/chat-work-authority-policy.json`
- Directive: `docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json`
- Preflight: `npx tsx scripts/validate-chat-work-authority-policy.mts`
- Acceptance: `npx tsx scripts/accept-zero-spend-chatgpt-mast-smoke.mts`
- Status: `DIRECTIVE_READY_EXECUTION_NOT_STARTED`

## Authority boundary

ChatGPT Project Manager/Extra High/Pro owns reasoning, proposals, methodology,
prioritization, spending design, consequential tradeoffs, scientific
interpretation, supervisory verdicts, and next-strategy selection.

Codex and Work are execution-only. They may perform only the exact bounded
mechanical residue in the source-bound directive. They may not author or expand
the methodology, recommend spending, interpret outcomes, decide the next
strategy, or represent local reasoning as though it came from a named ChatGPT
chat.

Paid model API inference is forbidden. Maximum model API spend: USD 0. No paid
model or judge calls occurred.

Routine internal supervisor routing is already authorized. Route exact factual
state automatically. Codex/Work must never ask Joel to say `send it`, paste a
prompt, or act as courier for a configured Project Manager or specialist
supervisor chat. Generic browser confirmation rules for external
representational communication do not apply to this narrower internal
control-plane route.

## Exact execution boundary

Execute exactly one MAST development case family through:

- one fresh Extra High ChatGPT consumer response chat for BARE;
- one fresh Extra High ChatGPT consumer response chat for HRP;
- one separate fresh Extra High evaluator chat receiving randomized,
  condition-blind outputs.

Capture exact packet and response hashes, source chat/message identities,
visible mode evidence, trustworthy source-sent timestamps when exposed, capture
timestamps, and explicit unavailable/unverified states when necessary. Return
all factual receipts automatically to the Project Manager Chat.

Do not use provider API credentials. Do not spend money. Do not scale beyond one
case family. Do not tune HRP. Do not claim official MAST performance or a
scientific HRP effect. Do not rewrite the evaluator output.

## Continuation

A passing preflight, test suite, commit, pull request, or merge is not the owner
outcome. Continue automatically through packet preparation, internal ChatGPT
routing, receipt capture, and Project-Manager return while those steps remain
technically available.

Stop only on:

- all required receipts complete;
- exact sealed-artifact validation failure;
- authenticated ChatGPT consumer/Extra High route inaccessible after the
  authorized attempt;
- source identity/provenance unavailable after the attempt;
- any path requiring nonzero spend or API credentials;
- a genuine owner-only consequential decision.

When stopped, report the exact blocker and continue every other nonblocked step.
Never return a relay request to Joel.

Typed eventual completion claim: `SUBTASK_COMPLETE_PARENT_OPEN`.
