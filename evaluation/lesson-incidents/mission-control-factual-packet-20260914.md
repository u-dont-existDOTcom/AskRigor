# AskRigor Lesson Incident Vault Review Packet

Date: 2026-09-14
Directive: exact lesson-incident preservation + historical failure recovery
Production deployment: not authorized
Production configuration change: not authorized
Netcup/Hostinger infrastructure change: not authorized
Paid model API spend for this task: 0 USD
Held-out MAST/validation evidence: not consumed

## Current Source State

- AskRigor implementation is under review in PR #224 against `main`.
- The active PR branch was rebuilt onto a clean current-base lineage after private historical recovery wording was found in superseded branch history. That superseded material is not reachable from the active PR branch.
- Provider-side deletion of formerly reachable but now-unreachable Git objects or caches has not been proven and must not be claimed.
- The AskRigor-lessons opaque-provenance change is already merged to `main`; a duplicate follow-up PR was closed without merge.
- The actual PR head and hosted checks must be read live before merge; this packet intentionally does not embed a self-staling head SHA.

## Implemented Scope

- Strict versioned exact-incident capture/evidence contracts.
- Caller-supplied per-message SHA-256 values are verified against the exact UTF-8 bytes; mismatches are rejected before persistence. The canonical incident digest is recomputed from the validated record.
- Exact-current-incident structural gate requires the minimum `user -> assistant -> user` failure window rather than correction-keyword matching.
- Dedicated owner-private AES-256-GCM file vault with key ID, owned non-symlink root, restrictive permissions, bounded reads/records, atomic/fsynced writes, authenticated read-back, and ciphertext-only envelopes.
- Idempotent private-capture retries use a persisted reservation containing the incident identity, original capture time, and canonical request digest before the encrypted incident record is written. Identical retries reuse that reservation even after time advances or a crash occurs between reservation and record write; divergent reuse fails closed.
- Private consequential `preserve_lesson_incident` Action at `/actions/lesson-incidents`; it is not a public MCP tool and returns opaque provenance only.
- Vault integrity/tampering and divergent-idempotency failures map to a nonretryable privacy/security boundary rather than a retryable storage outage.
- Current lesson workflow is fail-closed: generalized submission is blocked unless private incident capture succeeded and returned opaque provenance. Historical recovery may truthfully remain partial or lesson-only when source turns no longer exist.
- Opaque incident provenance is withheld from the model anonymizer and the exact server-validated tuple is reattached afterward, so model output cannot drop or rewrite the incident linkage.
- Repeated generalized-submission retries carrying the same incident identity/digest/status do not create a second anonymous occurrence; a distinct incident still increments the occurrence count. Conflicting metadata for the same incident ID fails closed.
- Generalized lesson intake carries only opaque incident ID, digest, and preservation status; raw incident text remains excluded from the generalized/GitHub path.
- Owner-private replay materialization plus raw-free replay manifest.
- Historical recovery manifest contains only opaque recovery references, truthful preservation status, generalized defect category, and replay availability: 0 exact, 3 partial, 4 lesson-only, 0 capture-failed. Descriptive historical labels, local paths, dates, and narrative notes are excluded.
- Custom GPT/OpenAPI generated artifacts include the two distinct consequential lesson Actions.
- AskRigor-lessons ledger/schema validation supports multiple opaque incident occurrences and rejects raw/private occurrence fields.

## Verification Evidence

Previously completed checkpoints on the implementation lineage established:

- Node `v24.18.0`, npm `11.16.0`, and locked dependency install succeeded.
- Focused incident/action/privacy tests passed before review repair.
- A full AskRigor `npm run verify` checkpoint passed before the later bounded review fixes.
- Hosted deterministic verification and repository-workflow-policy checks passed on an earlier clean implementation head.
- AskRigor-lessons local suite: 26 tests passed; lesson validator 0 errors; workflow validator 0 errors; hosted Lesson integrity passed before merge.

The exact-head review repair adds or preserves targeted regressions for:

- caller-digest mismatch rejection against exact UTF-8 bytes;
- time-stable idempotent private-capture retries;
- crash recovery after idempotency reservation but before encrypted record write;
- divergent idempotency-key reuse rejection, including reservation-only recovery state;
- nonretryable integrity/privacy routing;
- fail-closed generalized submission when current incident capture fails;
- standing-consent state wording after failed versus completed two-phase capture;
- exact incident-provenance preservation across model generalization; and
- same-incident occurrence idempotency in the private lesson queue.

Unrelated timeout-widening changes introduced during earlier troubleshooting are absent from the active PR.

**Merge gate:** the complete hosted deterministic verification and repository-workflow-policy results must be green on the actual final PR head. Earlier green checkpoints are supporting evidence only.

## Privacy / History Audit

- The active PR diff intentionally contains no raw historical lesson conversation or private recovery seed corpus.
- The active branch lineage excludes the superseded history that contained descriptive private recovery wording; provider-side purge of unreachable objects remains unverified.
- Public recovery metadata is limited to opaque references/status, generalized categories, and replay availability; descriptive historical labels/notes and owner-local filesystem locators are excluded.
- No production vault key, GitHub/OpenAI credential, decrypted vault payload, or real private incident locator is intentionally committed.
- Generalized-lesson surfaces carry opaque occurrence metadata only and reject raw/private incident fields.
- Final privacy review must re-scan the actual final PR diff/history and PR-visible text before merge.

## Non-production Durability Proof

A synthetic-only encrypted write/read-back proof was completed on already-existing owner-private non-production persistent storage. Exact machine-local locators and receipts remain outside the repository. The proof reconstructed the vault through a separate reader process, authenticated/decrypted the stored envelope, and matched the incident digest after reconstruction.

This demonstrates non-production persistent-storage behavior across process reconstruction. It does **not** establish production remount/redeploy readiness.

## Production-enablement Boundary

Committed manifest: `evaluation/lesson-incidents/production-enablement-manifest-20260914.json`.

Production still requires a separate decision and authorization for:

1. replacing/disabling the pre-existing paid model API anonymizer in the generalized lesson path to comply with the current zero-spend owner policy, unless a newer explicit owner authorization supersedes it;
2. final persistent private volume/directory;
3. runtime-service ownership and restrictive directory/file modes;
4. dedicated `ASKRIGOR_LESSON_INCIDENT_KEY` secret installation;
5. `ASKRIGOR_LESSON_INCIDENT_KEY_ID`;
6. `ASKRIGOR_LESSON_INCIDENT_DIRECTORY`;
7. synthetic production restart/remount acceptance;
8. ciphertext-only backup/restore handling with keys stored separately;
9. retention, deletion, and rotation authority; and
10. production deployment/release itself.

Repository workflow inspection shows PR merge triggers verification, not a repository-defined production deploy. Source review/merge itself does not invoke paid model inference or authorize production configuration, Netcup, Hostinger, or production service mutation.

## Remaining Review Actions

- Read final-head hosted verification after the last code/documentation update.
- Re-check final PR diff/history and PR-visible text for raw private text, secrets, owner-local locators, generated-artifact drift, and unrelated scope.
- Return the exact final-head factual receipt through the registered supervisor route for the merge decision.
- Keep production enablement blocked on the zero-spend runtime migration and production storage/key/backup/retention decisions.
