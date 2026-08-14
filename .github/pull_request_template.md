## Goal

State the problem, success criteria, and non-goals.

## Branch and revision

- Task branch:
- Final commit SHA:
- Base branch / release authority:

## Change

Summarize code, protocol, evidence, or documentation changes.

## Verification

List every exact command and its exact pass/fail/blocked result. Distinguish the
hermetic fixture gate from any explicitly requested bounded live-provider check.

- Final-head workflow/check name:
- Workflow run URL or ID:
- Hosted GitHub controls verified through API/settings:
- Hosted controls still `UNVERIFIED`, disabled, or unsupported:

## Research and privacy impact

State effects on routing, receipts, completion states, collected data, exports, and public review evidence.

## Recovery

Explain how to detect and reverse an incorrect change.

## Continuity and lesson closeout

- Canonical current-state path and update:
- Finding dispositions (`project-specific`, `promoted`, `provisional`,
  `superseded`, or `no-new-lesson`):
- Universal lesson PR/commit, if any:

## Residual risk and result

- Remaining owner decisions:
- Residual risk / declared exceptions:
- Terminal label (`COMPLIANT`, `COMPLIANT_WITH_DECLARED_EXCEPTIONS`, `BLOCKED`,
  or `NOT_COMPLIANT`):

- [ ] Final diff reviewed
- [ ] `npm run verify` passes
- [ ] Required evidence remains explicitly complete, partial, inaccessible, deferred, or blocked
- [ ] Final-head CI passes
- [ ] No provider credentials or uncontrolled live calls were used in ordinary PR CI
- [ ] Protocol hashes were derived from exact canonical XML bytes
- [ ] Candidate and production release state remain distinct
