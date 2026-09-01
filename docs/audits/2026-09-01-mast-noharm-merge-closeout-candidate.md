# MAST NOHARM merge closeout candidate

The exact implementation candidate
`a3566797b1e74ed004b08fc3abbc636a9d49769e` (tree
`4bedbb35ee1a2c4218ec3868a907a6bf6f0fc195`) closes the factual release
boundary after PR #175 merged the zero-spend NOHARM pilot/freeze plan to
protected `main` as `a1d4aaf0fe2010edc5cec13e6c431877a311d074`.

The active-task and recovery records now contain the exact merge, protected
checks, candidate identity, and scope. The acceptance gate validates the
protected-merge receipt and the routed supervision packet. The worker-authored
paid API path is canceled, Chat's reasoning authority is restored, and no
replacement evaluation, methodology, cost, or prioritization proposal was
created in this closeout.

The branch also fixes an existing filesystem portability defect: URL pathname
decoding failed when the checkout path contained Unicode (`Téléchargements`).
The two affected tests now use Node's `fileURLToPath`, so the repository root is
resolved correctly without percent-encoded path segments.

Dependency installation reported zero vulnerabilities. Branch preflight,
artifact acceptance, strict NodeNext typecheck, and 13 focused tests across
three files pass. The complete deterministic gate passes 133 test files with
one declared skip and 1,644 tests with six declared skips; project typecheck and
build pass. The final test duration was 355.73 seconds, and the diff check is
clean.

Mission Control received the immediate-risk authority-gate packet and began a
response. This candidate does not infer an unfinished Chat response and records
that no exact replacement directive has yet been received.

Lesson status at `2026-09-01T21:20:18.903Z`: zero open, zero needing review,
zero accepted-not-incorporated, four incorporated/closed, zero
deletion-eligible.

Typed claim: `SUBTASK_COMPLETE_PARENT_OPEN`. Operational alignment passes for
the factual protected-merge closeout and routed correction. Scientific
adequacy remains limited to an outcome-blind plan with no benchmark, HRP, or
clinical result. Release adequacy is ready for protected review and includes no
paid inference, external submission, production mutation, or protocol
mutation.
