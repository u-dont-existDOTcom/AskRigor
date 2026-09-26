# MAST Round 5 raw-message recovery repair

Owner correction: a completed Send must be checked using lossless submitted-message state rather than rendered Markdown `innerText`. The existing Round-5 second response is authorized for recovery and the study is authorized to resume without resending that slot.

Scope:
- Preserve the frozen prompts, cohort, model/effort settings, arm schedule, judging, and decision rule.
- Preserve the original frozen commit as provenance; make transport-only changes on this repair branch.
- Recover a post-Send request only when the raw ChatGPT client message bytes exactly match the pre-Send source hash/length and a stable user message id exists.
- Rendered `innerText` is diagnostic only and must not gate exact identity.
- Never resend a slot that has `SEND_INTENT` or `SENT` state.
- Permit a previously recorded ambiguity receipt to be re-read and recovered if exact raw identity later becomes available.
- Add focused regression tests, deploy only the repaired transport to the private Round-5 VPS workspace, recover slot 2, then resume the existing run.
- Zero paid API inference; no production deployment.
