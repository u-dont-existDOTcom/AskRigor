# Accepted-contribution promotion scheduler — candidate receipt

Task `askrigor-living-evidence-promotion-scheduler-v1` is complete as a local
release candidate on branch `task/promotion-scheduler-20260901`. Red contract
commit `aa6735d1ca329092d041d370dae2e53feb794855` proved all four scheduler
artifact checks failed before implementation. Code-bearing commit
`11ba00dae883e90fddca43ba472e3c3494f64b66` adds the fixed hardened service,
five-minute persistent timer, task controls, deployment/rollback runbook, and
privacy/architecture/recovery documentation.

The scheduler cannot accept, reject, edit, or supply a proposal. It invokes only
the existing `living-evidence-admin promote-accepted` command, with no shell or
dynamic input, against the exact locally present image with pulls and builds
disabled. Each systemd-serialized activation processes at most one already
owner-accepted exact-hash intent. The existing durable intent and canonical
idempotency key retain retry safety after database failure or a crash between
canonical commit and promotion-receipt commit.

The public runtime receives no writer credential, Docker socket, systemd
control, or scheduler-launch operation. The unit contains no database URL,
credential, proposal payload, account key, or private content. The separate
short-lived admin container continues to receive only its existing root-owned
writer environment. Journal output is limited to the bounded operation result.

The service SHA-256 is
`3e1ecc21e0dadfe2566d21382398f6e2357218535e88a106be08ebde80ba6da8`;
the timer SHA-256 is
`873a8fe6d4ca1b79edcdd5cc851b89ac0a98c7956f36bb89cf2ff6ec902295cd`;
and the runbook SHA-256 is
`db741cf221f185851abf6a02fd305720285e8969476c131e670bd8624bcffdd8`.
`systemd-analyze verify` passes both units, and the calendar parser confirms the
exact five-minute UTC expression.

Focused scheduler, deployment, router, release, and continuity tests pass 57/57
across seven files. The complete Node 24.18.0 deterministic gate passes 126 test
files with one declared skip, 1,614 tests with six declared skips, typecheck,
and build. The final diff passes whitespace validation.

Rollback stops and disables only the exact timer, restores or removes its unit
and image-selection bytes, and leaves proposals, promotion intents, receipts,
and canonical evidence intact. Manual one-shot promotion remains available.

Typed completion claim: `SUBTASK_COMPLETE_PARENT_OPEN`. Operational alignment
passes for the local candidate. Scientific adequacy is preserved but not
expanded: the owner remains the only scientific decision point and no causal or
quality conclusion is made. Release adequacy remains pending protected merge,
exact VPS installation, one manual service result, enabled/active timer and
future-trigger readback, bounded journal inspection, unchanged production
health, and an immutable release receipt.

The lesson checkpoint at `2026-09-01T13:36:28.105Z` was available with zero
open candidates, zero needing review, zero accepted but not incorporated, four
incorporated or closed, and zero deletion-eligible. No
`SUPERVISION_DESIGN_FEEDBACK` packet is warranted: this slice composes the
already approved exact owner-decision and one-shot-writer boundaries without a
new methodological or supervision-design choice.
