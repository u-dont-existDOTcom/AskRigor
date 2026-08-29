# Living-evidence PostgreSQL pilot operations

## Local and CI surfaces

`npm run living-evidence:local` starts the digest-pinned PostgreSQL 17.6 image
on loopback only, uses a temporary filesystem, runs the adversarial database
acceptance suite, imports the public historical pilot records, writes a
mode-0600 review artifact under `/tmp/askrigor-living-evidence-pilot`, and
removes the container. CI runs the same database acceptance against its
isolated PostgreSQL service after `npm run verify`.

No raw article body, transcript, comment, private research payload, provider
response, credential, or public database endpoint is part of either surface.

## Railway hard stop discovered 2026-08-29

The owner authorized an isolated Railway pilot subject to the task-lock limits:
$5 monthly spend, 0.5 vCPU, 512 MB RAM, a maximum 1 GB volume, no public
endpoint, and no provisioning when those boundaries cannot be enforced.

Current Railway controls do not implement those exact boundaries:

- Compute hard limits are workspace-wide, not project-specific, have a $10
  minimum, and take every workload in the workspace offline when reached.
- Per-service replica limits can enforce CPU and RAM, but not total project
  spend.
- Paid-plan volumes default to 5 GB or more, can grow, and cannot be downsized;
  Railway bills actual usage but exposes no 1 GB hard quota.
- PostgreSQL is private by default, so the no-public-endpoint boundary is
  enforceable.

Therefore no Railway resource may be provisioned under the current task lock.
Do not change a workspace usage limit, create a public TCP proxy, or accept a
larger volume/spend boundary without a new owner decision. A Railway receipt is
valid only when every field in `railway-pilot-receipt.schema.json` is populated
from readback after provisioning and `limits.enforcement_status` is `enforced`.

## Required Railway shape after an approved boundary exists

- Dedicated project and `pilot` environment; no production linkage.
- One private PostgreSQL service; no public domain or TCP proxy.
- One replica with explicit CPU and RAM limits.
- No automatic or manual backups during the 30-day pilot unless separately
  approved and accounted for.
- Repository migrations run at runtime, never at build time.
- Import only the public authored-analysis fixture and source identifiers,
  hashes, locators, and receipts. Source bodies remain absent.
- Read back project, environment, service, plan, resource limits, networking,
  volume capacity, backups, current and estimated project usage, deployment
  identity, migration hash, acceptance result, and the scheduled deletion date.
- Export and verify a logical JSON artifact before deletion. Railway volume
  deletion has a recovery window and becomes permanent later; record both.

Current platform references:

- <https://docs.railway.com/pricing/cost-control>
- <https://docs.railway.com/cli/usage>
- <https://docs.railway.com/volumes/reference>
- <https://docs.railway.com/databases/postgresql>
- <https://docs.railway.com/networking/private-networking/how-it-works>
