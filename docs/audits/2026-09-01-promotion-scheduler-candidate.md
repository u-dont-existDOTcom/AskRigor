# Accepted-contribution promotion scheduler — candidate receipt

Task `askrigor-living-evidence-promotion-scheduler-v1` is complete as a local
release candidate on branch `task/promotion-scheduler-20260901`. Red contract
commit `aa6735d1ca329092d041d370dae2e53feb794855` proved all four scheduler
artifact checks failed before implementation. Code-bearing commit
`11ba00dae883e90fddca43ba472e3c3494f64b66` adds the fixed hardened service,
five-minute persistent timer, task controls, deployment/rollback runbook, and
privacy/architecture/recovery documentation.

PR #163 merged the initial candidate as
`f146539db8b794fce79a979980ec9d43da8c92a6`. Its first production manual run
failed before any promotion because `ProtectHome=yes` hid Docker's client
configuration and plugin discovery fell back to the base CLI. The timer remained
disabled, proposal/promotion counts remained zero, and public production stayed
healthy. Repair-red commit `c899df4118ec1ca4f27899c08825b934d00290da`
captures the failure. Repair commit
`2f90e17aede149d768f0217afd0ae3ea338cbb6b` invokes the reviewed
system-installed Compose plugin directly and provides a private empty Docker
configuration directory, preserving `ProtectHome=yes` without warnings.

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

The repaired service SHA-256 is
`a2b32e9c8352883b63a3b0d1aba7acb89f4ce263028fcba777d30de73e3ab3cc`;
the timer SHA-256 is
`873a8fe6d4ca1b79edcdd5cc851b89ac0a98c7956f36bb89cf2ff6ec902295cd`;
and the repaired runbook SHA-256 is
`4ec264244b826fb2a33bb0e8b5f54e109886bda1245063f49a6d29038e841e9c`.
`systemd-analyze verify` passes both units, and the calendar parser confirms the
exact five-minute UTC expression.

Focused scheduler, deployment, router, release, and continuity tests pass 57/57
across seven files. The complete Node 24.18.0 deterministic gate passes 126 test
files with one declared skip, 1,614 tests with six declared skips, typecheck,
and build before the production repair. After the repair, the same focused
57/57 gate, typecheck, and both systemd validators pass; the protected repair
gate remains the exact full-suite release boundary. The final diff passes
whitespace validation.

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
