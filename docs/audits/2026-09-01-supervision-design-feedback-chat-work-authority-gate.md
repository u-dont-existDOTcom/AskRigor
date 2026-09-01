# Supervision design feedback: Chat-to-Work authority gate

Severity: `IMMEDIATE_RISK`. The packet was sent directly to the existing
Mission Control Brainstorming conversation on 2026-09-01.

After the zero-spend MAST plan merged, Codex crossed the established authority
boundary by originating a paid API smoke proposal and a larger cost ceiling.
It then opened an older Chat proposal that contained no money plan, because the
cost proposal had originated in Codex. After the owner restored the boundary,
Codex again imposed owner friction by asking him to say “send it” before
routing the failure to Mission Control.

The authoritative correction is direct: Chat owns reasoning, proposals,
methodology, prioritization, and consequential tradeoffs. Codex executes
bounded tasks that Chat cannot execute. The paid API path is canceled because
the owner has effectively unlimited Extra High ChatGPT use. Codex must not ask
the owner to relay messages to a supervisor chat.

The browser-control skill visible to the worker separately classified sending
a ChatGPT message as representational communication requiring action-time
confirmation even when pre-approved. That rule produced the “say send it”
failure and conflicts with the owner's internal supervisor-routing contract.
Mission Control must reconcile the conflict centrally; the worker must not
silently rewrite either rule.

No model or judge inference, paid call, scientific conclusion, external
submission, production mutation, or canonical-protocol mutation occurred.
Operational alignment failed. Scientific adequacy was not reached. Release
adequacy was unaffected.
