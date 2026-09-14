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
contain only AES-256-GCM ciphertext plus non-secret envelope metadata. The
envelope binds the storage key ID and incident digest as authenticated data.

## Durability

Local tests prove encrypted write/read-back across a fresh process-style vault
construction, crash recovery after an idempotency reservation, and restore into
a fresh owner-private directory. Production completion still requires the
configured directory to be backed by a persistent private volume that survives
service restart, ordinary redeploy/restart, and remount-equivalent
infrastructure boundaries. If that volume is unavailable, record
`PERSISTENT_INCIDENT_VAULT_UNAVAILABLE` and do not claim production readiness.

## Backup and restore

A complete vault backup must copy the encrypted incident envelope files **and**
the dot-prefixed idempotency reservation files. The reservations contain no raw
transcript text, but they are required to preserve retry identity and prevent a
post-restore duplicate incident for a previously accepted idempotency key.

Do not back up, commit, print, or store `ASKRIGOR_LESSON_INCIDENT_KEY` beside
the ciphertext. Restore into an owner-private `0700` directory, preserve files
at `0600`, inject the matching key and key ID through the protected runtime
secret path, reconstruct the vault, and authenticate-read representative
records. The restore is accepted only when the decrypted record digest matches
the authenticated envelope digest and an idempotent retry returns the original
opaque provenance.

## Key rotation

Live key rotation and bulk re-encryption are **not implemented by this change**.
A record encrypted under one key ID fails closed when opened with another key
ID or key. Therefore production must retain the active key for all records that
must remain readable.

Any future rotation is a separately authorized migration: preserve a tested
backup and rollback path, keep the old key available during migration, decrypt
with the old key, write a separately verified migrated copy under the new key,
and prove the incident identity/digest semantics before retiring the old key.
Do not overwrite the only ciphertext copy or claim rotation support merely
because the runtime can be configured with a different key.
