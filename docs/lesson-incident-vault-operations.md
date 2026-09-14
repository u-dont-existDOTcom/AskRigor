# Private Lesson Incident Vault Operations

The lesson incident vault stores only encrypted exact incident records for
validated AskRigor lessons. The generalized lesson queue receives only opaque
incident provenance.

## Configuration

- `ASKRIGOR_LESSON_INCIDENT_DIRECTORY`: absolute owner-private vault directory.
- `ASKRIGOR_LESSON_INCIDENT_KEY`: exactly 32 random bytes as unpadded base64url.
- `ASKRIGOR_LESSON_INCIDENT_KEY_ID`: stable non-secret key identifier.

The directory must be owned by the runtime user, must not be a symlink, and must
be mode `0700` or stricter. Files are opaque JSON envelopes with mode `0600` and
contain only AES-256-GCM ciphertext plus non-secret envelope metadata.

## Durability

Local tests prove encrypted write/read-back across a fresh process-style vault
construction. Production completion still requires the configured directory to
be backed by a persistent private volume that survives service restart,
ordinary redeploy/restart, and remount-equivalent infrastructure boundaries.
If that volume is unavailable, record `PERSISTENT_INCIDENT_VAULT_UNAVAILABLE`
and do not claim production readiness.

## Backup And Restore

Back up ciphertext envelopes only. Do not back up, commit, print, or store
`ASKRIGOR_LESSON_INCIDENT_KEY` beside the ciphertext. Restore must preserve the
same files and verify that the incident digest in each envelope matches the
decrypted plaintext record.

## Rotation

Rotation is a controlled maintenance migration: configure a new key ID and key,
read old records with the old key, write migrated copies with the new key, and
verify unchanged incident digests. Do not overwrite or bulk re-encrypt originals
without a separately authorized migration step and rollback plan.
