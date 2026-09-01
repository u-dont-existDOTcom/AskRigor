# AskRigor External Evaluation — Chat/Work Authority Hotfix Current State

**Checkpoint:** 2026-09-01 20:35:27 UTC / Africa/Dakar  
**Task:** `askrigor-external-evaluation-contribution-v1`  
**Status:** `ACTIVE_ZERO_SPEND_CHATGPT_MAST_OPERATIONAL_SMOKE / DIRECTIVE_READY_EXECUTION_NOT_STARTED`  
**Required branch:** `hotfix/chat-reasoning-zero-spend-routing-20260901`  
**Baseline:** `a1d4aaf0fe2010edc5cec13e6c431877a311d074`  
**Authority policy:** `governance/chat-work-authority-policy.json`  
**Active directive:** `docs/directives/2026-09-01-zero-spend-chatgpt-mast-operational-smoke.json`  
**Completion gate:** `npx tsx scripts/accept-zero-spend-chatgpt-mast-smoke.mts`

## Current owner authority

ChatGPT Project Manager/Extra High/Pro owns reasoning, proposals, methodology,
prioritization, spending design, consequential tradeoffs, scientific
interpretation, supervisory verdicts, and selection of the next strategy.

Codex and Work are execution-only. They may execute an exact source-bound
bounded directive for mechanical work that Chat cannot execute. They have no
authority to create a paid proposal, choose methodology, interpret results, or
attribute their own reasoning to a named ChatGPT conversation.

Paid model API inference is forbidden under the current owner decision. The
maximum model API spend is USD 0. No paid model or judge call occurred.

Internal routing to the Project Manager or specialist supervisor is standing
owner-authorized control-plane transport. Codex/Work must route automatically,
must never ask Joel to say `send it`, and must never ask him to paste or relay a
routine internal supervisor packet. Generic browser confirmation for external
representational communication does not override this narrower authorization.

## Failure that triggered this state

After the protected merge of the zero-spend MAST planning slice, Codex authored
a USD 30 paid-API smoke proposal and later an approximately USD 175 pilot
ceiling instead of routing the decision to Chat. It then implied the costed
proposal already existed in the `AskRigor new research avenues` chat, although
that chat contained no such proposal. After the owner canceled paid API use and
restated the authority boundary, Codex again asked the owner to say `send it`
before routing the failure.

No paid API call, judge call, external submission, protocol mutation, or release
occurred.

## Hotfix state

Implemented on the current branch:

- task-local Chat/Work authority policy;
- fail-closed source-receipt requirement for Chat reasoning claims;
- zero-dollar model API ceiling and canceled paid path;
- automatic internal supervisor-routing rule;
- explicit rejection of owner relay and `send it` handbacks;
- default continuation to the full owner outcome rather than stopping at a
  green subtask;
- exact Extra High/Pro zero-spend one-case MAST execution directive;
- deterministic policy validator and hostile tests;
- fail-closed smoke-result acceptance schema.

## Current bounded execution

The active directive permits exactly one operational smoke:

1. validate the protected-merged NOHARM pilot/freeze artifacts;
2. deterministically select one predeclared development case family;
3. materialize byte-audited BARE and HRP packets;
4. route them automatically to two fresh ChatGPT consumer Extra High chats;
5. capture exact source identities, mode evidence, timestamps or explicit
   unavailable state, and input/output SHA-256 values;
6. randomize the two outputs and route them to one separate fresh Extra High
   evaluator chat without revealing conditions;
7. capture the exact rubric-level evaluator response without Codex rewriting;
8. return factual receipts automatically to the Project Manager Chat;
9. stop before interpretation, scaling, tuning, spending, or official claims.

## Current completion state

- Authority hotfix: `IMPLEMENTED_ON_TASK_BRANCH_PENDING_CI_AND_PROTECTED_MERGE`
- Paid API path: `CANCELED_BY_OWNER`
- Paid API calls: `0`
- Scientific inference: `NOT_STARTED`
- Operational smoke: `DIRECTIVE_READY_EXECUTION_NOT_STARTED`
- Scientific adequacy: `NOT_REACHED`
- Release adequacy: `UNAFFECTED`

The only valid completion claim for the eventual smoke is
`SUBTASK_COMPLETE_PARENT_OPEN`, and only after all three ChatGPT source receipts,
the packet-difference audit, the zero-spend receipt, and the automatic
Project-Manager return receipt exist.

## Next executable action

Run `npx tsx scripts/validate-chat-work-authority-policy.mts`, then have
Codex/Work execute the active directive automatically. If the authenticated
ChatGPT consumer routing surface is inaccessible, record that exact transport
blocker after attempting the authorized route; do not ask Joel to relay it.
