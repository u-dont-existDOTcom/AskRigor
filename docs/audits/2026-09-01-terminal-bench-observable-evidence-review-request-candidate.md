# Terminal-Bench observable-evidence review-request candidate

The exact implementation candidate `045fda7d7b0d72f3d168f9b6b98b7b526a188e08` (tree `4096da747c806befae74c3707bd17385c95370a5`) binds the protected PR #171 merge and routes the clean-source author plus independent clinical-method reviewer handoff through [AskRigor issue #172](https://github.com/u-dont-existDOTcom/AskRigor/issues/172).

The machine contract requires thirteen categories of agent-visible evidence, eight explicit reviewer decisions, and separate mechanical and independent-review passes. Grader-only values remain withheld from both roles. The current implementation worker does not self-certify the review. No observable evidence packet has yet been constructed and the current verdict is `NOT_REVIEWED`.

The exact candidate passes branch preflight, artifact acceptance, review-request validation, 26 focused tests across six files, strict NodeNext typecheck with explicit Node types, and the complete deterministic gate. The full gate passed 132 test files with one declared skip and 1,640 tests with six declared skips; project typecheck and build passed. Dependency installation reported zero vulnerabilities. An initial ad-hoc narrow typecheck omitted Node types and was corrected before the authoritative full gate.

Lesson status at `2026-09-01T16:55:11.950Z`: zero open, zero needing review, zero accepted-not-incorporated, four incorporated/closed, and zero deletion-eligible.

Typed claim: `SUBTASK_COMPLETE_PARENT_OPEN`. Operational alignment passes for the routed review handoff pending protected merge. Scientific adequacy remains not reviewed because the answer-free agent packet is not constructed or independently approved. Release adequacy is pending protected source merge and includes no frontier invocation, paid inference, external benchmark submission, production mutation, public latent fixture, or protocol mutation.
