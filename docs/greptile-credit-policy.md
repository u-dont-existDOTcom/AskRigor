# Greptile: manual-only, high-impact review policy

**Owner cost-conservation decision, 13 Nov 2026.** Keep Greptile as a scarce independent reviewer, not an automatic PR/checkpoint step. This is a project-specific development rule; it does not alter HRP, Universal public instructions, required CI, or existing owner approvals.

## Default
Do **not** run a Greptile review on every PR, every push, every requested fix, or on unchanged code. Existing deterministic tests, source-level review, and Claude-author → Codex-review are the default. The recommended repository-wide `.greptile/config.json` sets `autoReview: []`, `skipReview: "AUTOMATIC"`, and `triggerOnUpdates: false` to suppress unsolicited review while preserving explicit manual requests. A PR source branch carries its own Greptile configuration; verify any higher-precedence `.greptile/config.json` and org/account settings separately.

## Exception review (a deliberate decision, not a mandatory gate)
Request one *manual* Greptile Base review only if a specific outstanding risk justifies scarce credits, such as:
- high-risk auth/privacy/security or payment/deletion/rollback code;
- multi-module, async-concurrency, or protocol/step-order behavior that earlier reviewers demonstrably missed;
- production or research-integrity change with unclear failure modes and an expected decision impact from independent review;
- an owner-requested unusually consequential independent pass.

Record before the request: PR and exact head SHA, exact review question, unresolved failure or risk, current free/paid credit allowance if known, and why Claude/Codex plus tests are not sufficient. If allowance is unknown, do not assume a no-cost review.

Use the lowest adequate review tier; Plus/Apex require a specific additional expected benefit and current owner spend authorization. Do not request a second review merely because a previous one found fixes; repeat only if materially new code or a separate high-risk question warrants it. Manual review does not authorize changes to protocol or publishing.

## Evidence and counterweight
Greptile recently found five confirmed P1 issues and later two P2 issues during AskRigor's research steering repairs (merged PR #441, Nov 2026). This supports retaining exceptional use, not blanket review of every PR. Track confirmed decision-changing bugs per credit and false alarms; compare against the existing author/cross-model review baseline.

## Verification boundary
Root `.greptile/config.json` is repo-side configuration, **not proof of account-wide automatic-trigger settings**. Review Greptile organization/team settings and `.greptile/` precedence when accessible. No Greptile call is part of verifying this policy; no new credits are consumed by this change.

## Observed boundary in the guard-change PR

The initial AskRigor pull request for manual-only configuration still received an automatic Greptile Base review (2 files, 0 findings), even though `greptile.json` was present in its source branch. This is observed provider behavior, not evidence that this repository's new guard is effective. The fallback was switched to the recommended `.greptile/config.json` format; do not spend another Greptile review to test it. The charge, if any, and the dashboard's effective organization override remain unverified. The exact provider trigger configuration should be checked without causing another review.
