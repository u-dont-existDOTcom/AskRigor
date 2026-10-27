# Owner regression mechanisms, 27 October 2026

Scope: the six fixes explicitly requested from the 27 October judgment, after owner answer 187, on
`claude/next-build-20261027`. No clinical or scientific method changes, external network, commits or release.
Live UDA bootstrap and lesson-queue retrieval were unavailable to Codex under its brief's no-network restriction (the session ran both).

1. Separate earlier-turn and current-turn community names, version state and accept exact withdrawals.
2. Convert source-marked tool limits into fixed caveats immediately, preserving actionable transient failures.
3. Issue round tokens on passes and preserve the turn and ten-round count through rechecks.
4. Distinguish user-supplied community reports from searches and inaccessible reports.
5. Require distinct draft quotes for plain-answer findings, reject colon lead-ins, and avoid fictional first-turn corrections.
6. Explain the scout's existing accepted target form and its difference from the finalizer's target.

Validation: synthetic case-named regressions; published-field next-step checks; typecheck, generated tool inventory
and check-report vocabulary if required; full `npm run verify`. Preserve all changes uncommitted in this worktree.

Completed: all six mechanisms and synthetic case-named tests. State overflow preserves the previous token and
requires explicit withdrawals; it cannot silently drop names. Tool limits remain limits in stopped debug reports
as well as passing results. The inventory and check-report vocabulary were regenerated after typecheck.

Evidence: running the targeted regressions against the original four source files at `2db887d1` produced 22 failures
covering all six fixes; the changed files were restored byte for byte afterwards. Final `npm run verify` exited 0:
297 test files passed, one skipped; 4,988 tests passed, six skipped; typecheck and build passed. Local synthetic logs:
`/tmp/askrigor-20261027-red.log` and `/tmp/askrigor-20261027-verify.log`.

Closeout: no checkout or dependency installation was created. The requested active worktree and all changes remain
for review; no commit, external network request, deployment or release was performed. Codex's brief excluded the network; the session itself ran the UDA bootstrap and the lesson-queue status (32 open, none needing review).
