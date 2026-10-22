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
entry point. It promotes one accepted intent per activation, revalidates the
stored payload and hash, uses the existing idempotent canonical writer, and
stores one durable receipt. An intent whose canonical write conflicts with what
the append-only store already holds ends `FAILED` with one fixed `failure_code`
from a closed list and its `failed_at` time (owner answer 138b, 2026-10-20), and
the same activation moves on to the next accepted intent, so a conflict no
longer holds the queue back; at most 20 intents can end `FAILED` in one
activation. Stored times are compared with the payload's as instants, so a run
or retrieval time written without milliseconds, with an offset or with
microseconds promotes.

Each intent goes to the canonical writer for its kind: `contribute` for a source
analysis, `contributeFrontier` for a frontier, and `contributeTopicLink` for a
topic link (owner answer 138b), which appends the link with either each topic's
label as the other's alias or one topic edge, and never moves, changes or
deletes a topic or anything filed under it.

## Atlas findings queue

Atlas phase 2 (owner answers 159 and 160b, 2026-10-22; design
`superpowers/plans/2026-10-22-atlas-phase-2-design.md`, section 3): the owner's
`review_research_contribution` findings actions record a decision and a
hash-bound intent in `atlas_finding_intents` (migration `0017_atlas_findings`),
and write nothing canonical. After the contribution queue, the same
`promote-accepted` activation runs the Atlas runner, which writes the canonical
Atlas rows. It runs even when the contribution queue failed, so a stuck intent
in one queue never holds the other back; either failure fails the activation.
The systemd units are unchanged.

- **Order.** Strictly first in, first out, because later intents depend on
  earlier ones (a link needs both findings written, a correction the version
  before it). A pass takes the oldest pending intent `FOR UPDATE NOWAIT` in one
  SERIALIZABLE transaction that already holds the canonical writers' lock; an
  activation that finds it held by another stops with `atlas_queue_busy` rather
  than skipping ahead.
- **Atomic pass.** The canonical rows are written in a savepoint inside that
  transaction, and the intent's `COMPLETED` receipt or `FAILED` code commits
  with them. An intent the writer already applied (an `atlas_intent_applications`
  row for it) is completed through the writer's idempotent replay.
- **Throughput.** One Atlas intent per activation (choice 7), after at most 20
  that end `FAILED` on the way to it, like the contribution queue.
- **Failures.** A deterministic conflict ends the intent `FAILED` with one fixed
  code from a closed list (for example `ATLAS_VERSION_STALE`,
  `ATLAS_FINDING_MISSING` or `SOURCE_IDENTIFIER_CONFLICT`), and the activation
  tries the next intent. A transient or unexpected error leaves the intent
  `PENDING`. The owner retries a failed decision under the same finding number.
- **Not yet applied.** An erasure intent (decision 7) waits `PENDING`, and the
  queue with it, until the build that applies it is deployed; the result says
  `intent_kind_not_applied`.
- **Receipts and logs.** Each line carries `"queue":"atlas_findings"`; a
  receipt holds only ids, hashes, the intent kind and its public `F-` number,
  and a failure line names the intent, its kind, its number and its code. No
  wording, card, account or chat is ever logged.

An earlier image has no Atlas runner, so it never selects an Atlas intent: they
stay `PENDING` and are neither lost nor failed.

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
   `no_pending_promotion` result, for both queues (the contribution line and the
   `"queue":"atlas_findings"` line). If an already owner-accepted intent exists,
   one exact promotion and receipt per queue is the expected bounded mutation.
2. Inspect `systemctl status askrigor-research-promotion.service` and the bounded
   `journalctl -u askrigor-research-promotion.service` output. Logs may contain
   operation state, proposal UUID/hash, canonical identifiers, receipt hash (a
   topic link's receipt names its link UUID, relation and how many aliases and
   edges it wrote), and each failed intent's promotion and proposal UUIDs, kind
   and fixed failure code; they must not contain a database URL, credential, raw
   payload, account key, or private content.
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
- Deterministic conflict: the canonical writer refuses the exact payload because
  it conflicts with what the append-only store already holds (an identity,
  idempotency, initial-version or lineage conflict, a canonical trigger, or a
  canonical constraint by its class). Nothing from the payload is written; the
  intent ends `FAILED` with its code, the receipt's `failed` list names it, and
  the activation tries the next intent. The same payload would fail on every
  retry, so a `FAILED` intent is never retried; filing the research again needs a
  corrected proposal. The owner review `status` action shows the code.
- Database, image, Compose, credential, transient writer failure (a lost
  connection, a timeout, a serialization failure), or an unexpected error: the
  service exits nonzero and remains visible as failed. The durable intent stays
  `PENDING` and is not discarded; the next timer activation retries it.
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

Do not delete proposals, promotion intents, promotion receipts, Atlas decisions
or Atlas intents, or canonical evidence during scheduler rollback. Disabling the timer restores manual
`promote-accepted` operation and does not reverse an exact promotion that
already completed. A scientific correction or evidence withdrawal uses the
repository's explicit supersession/withdrawal paths, not timer rollback.

## Release and upgrade rule

Every backend release must confirm that the image-selection file names the exact
deployed reviewed image before the timer is re-enabled. Validate the service
manually once, then verify the next timer trigger. Unit bytes, image-selection
bytes, prior timer state, manual result, next trigger, journal privacy check,
production health, and rollback path belong in the release receipt.
