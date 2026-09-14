# Lesson Incident Vault — Production Enablement Manifest

**Date:** 2026-09-14
**Status:** REVIEW-ONLY; PRODUCTION NOT AUTHORIZED

## Current acceptance result

`PERSISTENT_INCIDENT_VAULT_UNAVAILABLE`

No already-existing non-production durable private volume was established in the
available repository/runtime evidence that could be used for the requested
write → teardown → restart/reconstruction → remount/reopen → authenticated
read-back acceptance test without changing infrastructure. This is an
infrastructure-evidence boundary, not an implementation failure.

Local/repository tests cover encrypted write/read-back across a fresh vault
construction, crash recovery after an idempotency reservation, and backup/restore
into a new owner-private directory. They do **not** establish host/container
remount or redeploy persistence.

## Intended production storage boundary

- **Candidate mount/path:** a dedicated owner-private persistent mount at
  `/var/lib/askrigor-lesson-incidents`, configured through
  `ASKRIGOR_LESSON_INCIDENT_DIRECTORY`.
- **Status:** design target only; it is not provisioned or authorized by this
  manifest.
- **Ownership/mode:** runtime service user owns the directory; directory mode
  `0700` or stricter; encrypted envelope and idempotency files mode `0600`.
- **Symlinks:** rejected by the runtime ownership/path checks.
- **Contents:** AES-256-GCM encrypted incident envelopes plus non-secret opaque
  idempotency reservation metadata. Raw historical seed text must never be
  staged in Git, image layers, deployment manifests, CI artifacts, or logs.

## Key and secret injection

Production requires all three values together:

- `ASKRIGOR_LESSON_INCIDENT_DIRECTORY`
- `ASKRIGOR_LESSON_INCIDENT_KEY` — exactly 32 random bytes encoded as canonical
  unpadded base64url
- `ASKRIGOR_LESSON_INCIDENT_KEY_ID` — bounded non-secret identifier

The encryption key must use the existing protected service-secret injection
mechanism or an equivalently protected secret manager. The key must not be
placed in Git, image layers, command-line arguments, issue/PR text, CI logs,
backups beside ciphertext, or Custom GPT/plugin configuration. The exact
production secret source and operator procedure remain to be verified before
enablement.

## Restart, remount, and redeploy semantics

1. **Process/service restart:** expected to reconstruct the vault from the same
   absolute directory and same key/key ID. Repository tests prove the
   process-reconstruction case only.
2. **Container restart/redeploy:** acceptable only if the configured directory
   is a persistent private mount external to the replaceable container/image.
3. **Host remount/reboot:** acceptable only after the mount is proven to return
   the same ciphertext/idempotency files with the required ownership and modes.
4. **Failure behavior:** missing/partial configuration, wrong key/key ID,
   malformed/tampered ciphertext, or inaccessible storage fails closed.

No production persistence claim may be made until an authenticated record is
read back after the actual production-equivalent remount/redeploy boundary.

## Backup and recovery

Back up both encrypted incident envelopes and dot-prefixed idempotency
reservation files. Keep encryption keys in a separate protected secret system.
A restore is accepted only after:

1. restoring files to an owner-private `0700` directory with `0600` files;
2. injecting the matching key and key ID;
3. reconstructing the service/vault;
4. authenticated read-back of representative incidents with matching incident
   digests; and
5. replaying an existing idempotency key and receiving the original opaque
   provenance rather than creating a duplicate.

A repository regression test covers this file-level restore invariant. No
production backup destination, retention policy, or recovery operator run has
been authorized or proven.

## Key rotation

Live rotation/bulk re-encryption is not implemented. Existing records require
their original key and key ID. Any future rotation is a separate migration with
old-key retention, a backup/rollback copy, independently verified migrated
ciphertext, and proof that incident identity/digest semantics are preserved
before the old key is retired.

## Rollback

Until production is explicitly enabled, rollback is simply to leave the three
lesson-incident environment variables absent and retain the current production
runtime unchanged.

After a future authorized enablement, rollback must:

- disable the new incident-capture configuration/route without deleting vault
  files;
- retain the ciphertext and matching key material separately and safely;
- restore the previously reviewed service image/configuration; and
- verify that public MCP/OpenAPI/plugin/site surfaces still expose no raw
  incident read path.

Rollback must never delete incident evidence merely to make an older service
start successfully.

## Merge/deployment coupling

No GitHub Actions workflow in the reviewed repository evidence was found that
automatically deploys production on merge. External hosting/provider auto-deploy
or webhook coupling has not been proven absent. Therefore this manifest does
**not** authorize merge: merge remains blocked until that external deployment
coupling is explicitly determined or the owner separately authorizes the
consequence.

## Exact production changes still required

1. Identify the actual production hosting/deployment path and prove whether a
   merge of this PR triggers any production deployment.
2. Select or provision an already-authorized persistent private volume; no new
   paid infrastructure is authorized by this task.
3. Mount it at the reviewed vault path with the required owner/mode semantics.
4. Generate and inject a dedicated 32-byte encryption key plus non-secret key
   ID through the verified protected secret path.
5. Configure the lesson-incident directory/key/key-ID variables on the service.
6. Deploy the exact reviewed code only after separate production authorization.
7. Run the production-equivalent persistence acceptance test across service
   restart plus container/host remount/redeploy as applicable.
8. Establish encrypted-backup retention and perform one authenticated restore
   exercise with the key stored separately.
9. Verify there is still no public raw-incident read surface and no raw incident
   material in logs, CI artifacts, analytics, Git, or generalized lesson records.
10. Record rollback evidence and the exact deployed revision/configuration.

Until all applicable items are proven, production status remains blocked.
