# AskRigor Lesson Incident Vault Implementation Packet

Date: 2026-09-14
Directive: exact lesson-incident preservation + historical failure recovery
Worker role: Work/Codex bounded implementation
Production deployment: not authorized
Paid model API spend: 0 USD
Held-out MAST/validation evidence: not consumed

## Source State

- AskRigor base branch: `origin/task/private-lesson-incident-vault-20260914`
- AskRigor work branch: `task/private-lesson-incident-vault-impl-20260914`
- AskRigor base head: `c366cf46f7a716ab6da7ec92eff868bf8cb7fcde`
- AskRigor current main observed: `260fea5fd066a8d934119580f7a0b6bb0a19d003`
- AskRigor-lessons base branch: `origin/task/opaque-lesson-incident-provenance-20260914`
- AskRigor-lessons work branch: `task/opaque-lesson-incident-provenance-impl-20260914`
- AskRigor-lessons base head: `edafc79`

## Implemented Locally

- Added strict `askrigor_lesson_incident_evidence_v1` and capture request contract.
- Added dedicated owner-private encrypted file vault using AES-256-GCM, key ID, owned non-symlink root, mode checks, bounded reads, atomic write and fsync.
- Added private consequential Action `preserve_lesson_incident` at `/actions/lesson-incidents` with 128 KiB route cap and opaque receipt only.
- Extended generalized lesson candidate/intake with optional `incident_provenance` containing only `incident_id`, `incident_sha256`, and preservation status.
- Added owner-private replay packet helper that materializes raw windows only after vault read, plus raw-free public replay manifest helper.
- Added sanitized historical recovery manifest from the private seed only: 0 exact, 3 partial, 4 lesson-only, 0 capture-failed. No raw seed or raw recovered chat was committed.
- Added AskRigor-lessons schema/validator support for multiple opaque `incident_occurrences`, with rejection of raw/private incident fields.

## Local Evidence

- Node: 24.18.0
- npm: 11.16.0
- `npm ci`: passed under Node 24.18.0.
- AskRigor `npm run typecheck`: passed.
- AskRigor focused tests: 183 passed across:
  - `tests/lesson-incident-vault.test.ts`
  - `tests/lesson-action.test.ts`
  - `tests/lesson-service.test.ts`
  - `tests/lesson-github-queue.test.ts`
  - `tests/lesson-privacy-screen.test.ts`
  - `tests/action-http.test.ts`
- AskRigor-lessons tests/audits: 26 tests passed; `validate_lessons.py` 0 errors; `validate_workflows.py` 0 errors.
- Lesson queue checkpoint: available; 1 open candidate needing review; 0 accepted-not-incorporated; 4 incorporated/closed.

## Boundary

The workspace can prove encrypted write/read-back across fresh process-style vault construction. It cannot prove the configured production incident directory survives ordinary service/container restart, redeploy/restart path, or persistent-volume remount because no durable private production volume was configured or deployment authorized in this directive.

Recorded boundary: `PERSISTENT_INCIDENT_VAULT_UNAVAILABLE`.

No production deploy was attempted. No paid infrastructure, Netcup, or Hostinger changes were made. No raw historical incident text was committed.

## Supervisor Question

Given the implemented local code and tests, should Work/Codex stop at this mandatory infrastructure boundary with local implementation preserved, or is there an already-authorized existing durable private volume/configuration that should be used for a non-production durability proof without changing deployment or spending?
