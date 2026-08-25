# Research-session resumability deployment runbook

Status: Phase G reviewed configuration; execute during the later private-
interface/release transaction, not as an independent change to the current
public service

## Fixed topology

Use the existing single AskRigor VPS and one research-service replica. Do not
add an external database, object store, shared volume, n8n persistence, or
backup target.

Private controller checkpoints:

- host: `/opt/askrigor/state/research-sessions`
- container: `/var/lib/askrigor-research-sessions`
- mount: read-write for the non-root research container only
- host directory: UID/GID 1000, mode `0700`
- files: mode `0600`
- backup: excluded

Public Retraction Watch mirror:

- host: `/opt/askrigor/state/retraction-watch`
- sync container: `/var/lib/askrigor-retraction-watch`, read-write
- research container: `/var/lib/askrigor-retraction-watch`, read-only
- host directory: UID/GID 1000, mode `0700`
- retained: active and previous verified generations only
- backup: excluded

The two directories must not be the same path or nested inside each other.

## Protected configuration

Add these names to the existing root-owned mode-`0600`
`/opt/askrigor/runtime.env` only when the private Phase H interface is ready to
instantiate the file-backed store:

| Name | Exact boundary |
| --- | --- |
| `ASKRIGOR_RESEARCH_SESSION_DIRECTORY` | `/var/lib/askrigor-research-sessions` |
| `ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_BASE64URL` | Exactly 32 random bytes encoded as canonical unpadded base64url; install with the existing hidden-input/secret procedure and never print it |
| `ASKRIGOR_RESEARCH_SESSION_ENCRYPTION_KEY_ID` | Bounded non-secret identifier such as `session-key-2026-08` |
| `ASKRIGOR_RETRACTION_WATCH_DIRECTORY` | `/var/lib/askrigor-retraction-watch` |
| `ASKRIGOR_PRIVATE_ORCHESTRATION_ENABLED` | Exact literal `true` only during the later reviewed private-interface activation; absent/false keeps the namespace unavailable |
| `ASKRIGOR_PRIVATE_ORCHESTRATION_API_KEY` | Separate random secret of at least 32 UTF-8 bytes; never reuse the public Action key or expose it to a browser, Custom GPT, n8n workflow JSON, Hermes memory, logs, or command arguments |
| `ASKRIGOR_FINALIZATION_SIGNING_SECRET` | Separate random secret of at least 32 UTF-8 bytes used only for domain-separated controller finalization permits; never expose it outside the server runtime |
| `ASKRIGOR_FINALIZATION_KEY_ID` | Bounded nonsecret identifier for the active finalization signing key |

Do not put the key in Compose, Git, chat, shell arguments, systemd unit bytes,
logs, validation output, or the Custom GPT editor. Verify only the variable
name, nonempty state, file ownership/mode, and a fail-closed application startup
check. The Retraction Watch one-shot container receives none of these variables
and never receives `/opt/askrigor/runtime.env`.

## Staged activation

1. Capture the exact current image, Compose bytes/hash, healthy container ID,
   public inventory, and rollback image/config before any mutation.
2. Create both host directories with UID/GID 1000 and mode `0700`; explicitly
   exclude the private checkpoint directory from every configured backup or
   snapshot job.
3. Install the tracked systemd service and timer bytes from `deploy/systemd/`,
   run `systemd-analyze verify`, reload systemd, and run the service once.
4. Verify that `active.json` and exactly one initial verified snapshot exist,
   the snapshot reader reports current coverage, and the one-shot container had
   no env-file or other AskRigor state mount.
5. Add the Retraction Watch host path to the research service as a read-only
   mount and set only its non-secret directory name. Recreate the research
   service and verify that its root filesystem remains read-only, it remains
   non-root with dropped capabilities/no-new-privileges, and its public
   inventory is unchanged.
6. During Phase H, add the separate checkpoint read-write mount and three
   protected configuration names, then instantiate the encrypted store only for
   the private orchestration boundary. The public Action/MCP paths remain on
   their existing storage behavior unless a later reviewed phase says otherwise.
7. Start a synthetic de-identified session, advance it to handle-dependent
   work, recreate the application container, and verify the same opaque session
   resumes with only lost ephemeral work reopened. Verify that finalization
   remains denied until the reopened work is completed.
8. Verify a fully authorized synthetic session survives an ordinary restart,
   protocol drift still blocks it, tampering makes it unavailable, and deleting
   it prevents resume.
9. Enable and start the timer. Record its next trigger and a successful fixed-
   source synchronization receipt without copying provider data into the
   repository.

## Failure and recovery

- Session volume unavailable, key absent/malformed, directory unsafe, or
  checkpoint corrupt: fail the private interface closed. Do not fall back to a
  caller-supplied state or treat the session as complete.
- Key loss/rotation: existing checkpoints become restart-required. Do not keep
  a key archive merely to preserve short-lived sessions.
- Capacity: reject a new session; never evict an unexpired checkpoint.
- Application crash during a claim: the five-minute lease expires; a new worker
  can claim with a new fence token, and the stale worker cannot commit.
- Retraction Watch pre-activation sync failure: preserve the active pointer. At
  72 hours, report stale/partial; do not convert no-match into favorable
  evidence.
- Corrupt/missing active snapshot: fail closed. Use the verified rollback
  command only if the previous generation passes complete verification.

## Rollback

1. Stop and disable `askrigor-retraction-watch-sync.timer`.
2. Restore the prior Compose bytes/image and recreate only the affected research
   service.
3. Remove the Retraction Watch read-only mount and private checkpoint read-write
   mount from the active Compose selection.
4. Remove the four Phase G configuration names, both Phase H private-interface
   names, and both finalization-signing names with the existing secret-safe
   editor; never print the removed key.
5. Unlink private checkpoint files and remove the private directory after
   confirming no active private session is expected to survive. No completion
   state is migrated.
6. The public Retraction Watch mirror may be removed because it has no backup or
   unique data; it can be rebuilt from the fixed official source.
7. Re-run health, inventory, protocol-manifest, and public synthetic checks and
   record exact rollback evidence.

Unlinking an encrypted file is application deletion, not a claim of physical
media sanitization. The directory's backup exclusion and short key lifetime are
part of the control.
