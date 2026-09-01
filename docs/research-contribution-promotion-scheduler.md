# Research contribution promotion scheduler

## Boundary

This scheduler closes the already released reciprocal-contribution loop. It
runs only after `review_research_contribution` has recorded an explicit owner
acceptance and created the exact hash-bound promotion intent in the same
transaction. The scheduler makes no scientific decision, cannot accept or edit
a proposal, and does not receive participant identity, raw chat, private health
narrative, uploads, raw source/provider content, or community data.

The public `research-mcp` container receives no canonical-writer credential,
Docker socket, systemd control, or scheduler-launch operation. The existing
`living-evidence-admin promote-accepted` command remains the sole scheduled
entry point. It processes one accepted intent per activation, revalidates the
stored payload and hash, uses the existing idempotent canonical writer, and
stores one durable receipt.

## Installed files

Install the reviewed repository bytes as root:

- `deploy/systemd/askrigor-research-promotion.service` to
  `/etc/systemd/system/askrigor-research-promotion.service`, owner/group
  `root:root`, mode `0644`;
- `deploy/systemd/askrigor-research-promotion.timer` to
  `/etc/systemd/system/askrigor-research-promotion.timer`, owner/group
  `root:root`, mode `0644`;
- `/opt/askrigor/living-evidence-image.env`, owner/group `root:root`, mode `0600`,
  containing only
  `ASKRIGOR_RESEARCH_IMAGE=askrigor-research:<exact-merged-sha>` and a final
  newline.

The image file is non-secret but root-only because it controls privileged code
selection. Update it atomically only after the exact image is locally present,
reviewed, and selected for the healthy production runtime. Never place the
writer URL or password in that file. Writer credentials remain only in the
existing root-owned mode-`0600`
`/opt/askrigor/living-evidence-writer.env`, which Compose supplies solely to the
short-lived admin container.

The service has no shell and accepts no arguments or dynamic input. It uses the
fixed base and living-evidence Compose files, the fixed admin profile,
`--no-deps`, `--pull never`, and a fixed container name. The host service is
restricted to Unix-domain communication with the already running Docker daemon;
the short-lived container joins only the existing internal PostgreSQL network.
It invokes the system-installed Compose plugin directly at
`/usr/libexec/docker/cli-plugins/docker-compose` and gives Docker an empty
private runtime configuration directory. This preserves `ProtectHome=yes`
without depending on or warning about root's Docker client configuration.

## Pre-activation checks

1. Record the current production research image/tag/container, health response,
   database container, proposal/promotion counts, unit absence or prior hashes,
   and timer state. Preserve exact rollback copies before replacing any file.
2. Confirm there is no active promotion service and no container named
   `askrigor-research-promotion-runner`.
3. Confirm the exact scheduled image is already present locally and the reviewed
   system Compose plugin path is executable. Do not pull or build from the
   scheduler.
4. Validate the tracked units with:

   `systemd-analyze verify deploy/systemd/askrigor-research-promotion.service deploy/systemd/askrigor-research-promotion.timer`

5. Validate the five-minute expression with:

   `systemd-analyze calendar '*-*-* *:00/5:00 UTC' --iterations=3`

6. After installing the exact bytes and image-selection file, run
   `systemctl daemon-reload` and use `systemctl cat` plus SHA-256 readback to
   prove the installed units match the reviewed merge.

## Staged activation

1. Start `askrigor-research-promotion.service` manually before enabling the
   timer. With no accepted intent, it must exit successfully with the bounded
   `no_pending_promotion` result. If an already owner-accepted intent exists,
   one exact promotion and receipt is the expected bounded mutation.
2. Inspect `systemctl status askrigor-research-promotion.service` and the bounded
   `journalctl -u askrigor-research-promotion.service` output. Logs may contain
   operation state, proposal UUID/hash, canonical identifiers, and receipt hash;
   they must not contain a database URL, credential, raw payload, account key,
   or private content.
3. Enable and start `askrigor-research-promotion.timer`. Verify it is loaded,
   enabled, and active, then use `systemctl list-timers
   askrigor-research-promotion.timer` to record a future trigger.
4. Verify the public health response, exact research container image/security
   envelope, 27-tool catalog, and canonical protocol manifests remain unchanged.
5. Record current proposal, pending-intent, completed-promotion, and failed-
   intent counts. Do not interpret a successful scheduler start as scientific
   evidence or as proof that no unreviewed proposal exists.

The timer is persistent and runs every five minutes with at most fifteen seconds
of jitter. systemd serializes the oneshot service, so an overlapping trigger
does not create a second concurrent activation. At current volume the bounded
throughput is intentionally one accepted intent per activation. A maintainer can
start the same service repeatedly for an immediate backlog drain; do not add a
shell loop or unbounded batch mode.

## Failure and recovery

- No pending intent: exit zero with `no_pending_promotion`; the timer remains
  healthy.
- Database, image, Compose, credential, or writer failure: the service exits
  nonzero and remains visible as failed. The durable intent is not discarded;
  the next timer activation retries it.
- Crash after canonical commit but before promotion-receipt commit: the intent
  remains pending and the existing canonical idempotency key lets the next run
  complete the one receipt without a duplicate logical write.
- Missing exact image: `--pull never` fails closed. Update the root-owned image
  selection only through an exact reviewed backend release.
- Unexpected log content: stop and disable the timer, preserve the bounded
  journal receipt for private review, and treat it as a privacy incident until
  resolved.

Useful read-only checks are `systemctl status`, `systemctl list-timers`,
`journalctl`, `docker ps --filter name=askrigor-research-promotion-runner`, and
the existing owner review `status` action. Never print either production
environment file.

## Rollback

1. `stop and disable` `askrigor-research-promotion.timer`.
2. Stop the service if active and remove only the fixed ephemeral container if
   it remains after failure.
3. Restore the exact prior unit/image-selection bytes if they existed, or remove
   the newly installed service, timer, and image-selection file.
4. Run `systemctl daemon-reload` and `systemctl reset-failed` for the exact
   service.
5. Verify no next trigger exists and the public runtime/database remain healthy.

Do not delete proposals, promotion intents, promotion receipts, or canonical
evidence during scheduler rollback. Disabling the timer restores manual
`promote-accepted` operation and does not reverse an exact promotion that
already completed. A scientific correction or evidence withdrawal uses the
repository's explicit supersession/withdrawal paths, not timer rollback.

## Release and upgrade rule

Every backend release must confirm that the image-selection file names the exact
deployed reviewed image before the timer is re-enabled. Validate the service
manually once, then verify the next timer trigger. Unit bytes, image-selection
bytes, prior timer state, manual result, next trigger, journal privacy check,
production health, and rollback path belong in the release receipt.
