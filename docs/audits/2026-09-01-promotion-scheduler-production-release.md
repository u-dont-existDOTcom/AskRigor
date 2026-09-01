# Accepted-contribution promotion scheduler — production release receipt

PR #163 merged the initial scheduler candidate as
`f146539db8b794fce79a979980ec9d43da8c92a6`. The first manual production run
failed before the admin container started because `ProtectHome=yes` hid Docker
client/plugin discovery and the base Docker CLI rejected the Compose-only
`--project-name` flag. The timer was never enabled, proposal and promotion
counts remained zero, and the healthy public runtime was unchanged.

The repair preserved the hardening boundary by invoking the reviewed
system-installed Compose plugin directly and supplying an empty private Docker
configuration runtime directory. PR #165 merged that exact repair as
`a8c61cf74b26d4f7f03ab5aec79b166ba32f60d3`; its protected checks and exact
post-merge deterministic, workflow-policy, and all four CodeQL analyses pass.

The installed service SHA-256 is
`a2b32e9c8352883b63a3b0d1aba7acb89f4ce263028fcba777d30de73e3ab3cc`;
the timer SHA-256 is
`873a8fe6d4ca1b79edcdd5cc851b89ac0a98c7956f36bb89cf2ff6ec902295cd`;
and the root-only exact-image selector SHA-256 is
`6e0d9e009acc0bd9077b714c28d03ba3e5e911bb049fe229da821f39203d77e1`.
The units are root-owned mode `0644`; the selector is root-owned mode `0600`.
`systemd-analyze verify` passes, and `systemd-analyze security` rates the host
service exposure `2.7 OK`.

The scheduler invokes only the existing
`living-evidence-admin promote-accepted` command. It accepts no arguments or
dynamic input, uses no shell, never pulls or builds an image, and processes at
most one already owner-accepted exact-hash intent per serialized activation.
The public runtime receives no writer credential, Docker socket, systemd
authority, or scheduler-launch operation. The scheduler makes no scientific or
causal decision; explicit owner acceptance remains the only decision boundary.

The repaired manual run completed at `2026-09-01T13:56:51Z` with the exact
bounded `no_pending_promotion` receipt and exit status zero. The timer was then
enabled. Its first actual automatic trigger began at
`2026-09-01T14:00:13Z` and completed at `14:00:15Z` with the same bounded
result. The service returned to inactive/dead, the timer remained active/waiting
with a future trigger, and no runner container remained. The journal privacy
scan found no database URL, credential, account key, payload, authorization
value, or private-health marker.

Closeout observed four successful automatic runs in total. The latest began at
`2026-09-01T14:15:14Z`, completed at `14:15:17Z` with the same bounded result,
and left the timer active/waiting for `14:20:11Z`. The exact Node 24.18.0
receipt gate also passes: five affected test files and 40 tests, typecheck,
systemd unit and calendar validation, JSON parsing, and diff checks.

Compose reports the separately managed `askrigor-caddy-1` container as an
orphan because the scheduler selects only the base and living-evidence Compose
files. This is bounded non-sensitive log noise. The scheduler deliberately does
not use `--remove-orphans`, so it cannot delete Caddy.

Production still runs the unchanged healthy research container
`4230d0de22d7cda81fbe2a4c9ae1e836ea3b9c9b5de6f312da6c71f886dbac55`
on image
`sha256:8bcfc2c8cc60b8f4f8af830a5115e2068e11f1857180ae4ce3156562c3d8a4da`.
It remains non-root, read-only, capability-free, and
`no-new-privileges`. Public health returns exact `ok / askrigor-research /
0.1.0`; the PostgreSQL container remains healthy. Production had zero proposals
and zero promotions before activation and after the scheduled run, so acceptance
changed no canonical evidence.

All three scheduler files were absent before deployment. Rollback therefore
stops and disables the exact timer, stops the service, removes only those three
files, reloads systemd, and resets the exact unit. It does not delete proposals,
intents, receipts, or canonical evidence. The existing manual one-shot command
remains available. The root-only rollback directory is
`/opt/askrigor/rollbacks/pre-promotion-scheduler-f146539db8b794fce79a979980ec9d43da8c92a6`.

Typed completion claim: `OUTCOME`. Operational alignment passes for the exact
installed units, manual and real timer-triggered execution, durable retry
boundary, rollback, and unchanged healthy public runtime. Scientific adequacy
is preserved but not expanded: the timer promotes only an exact intent created
by explicit owner acceptance and makes no independent scientific conclusion.
Release adequacy passes.

Receipt-only PR #166 preserves this closeout on protected `main`; its final
merge identity is attached to the PR after merge.

PR #164 merged a separate planning-only, queued external-evaluation lane while
this receipt was in review. The receipt branch reconciles its protected-main
merge `e47b122a2dd07d460bd50c008a62407278ccf958`, preserves all of that lane's
artifacts, corrects only its stale scheduler-predecessor wording, and does not
activate or otherwise adopt the queued program.

The final deployment lesson checkpoint at `2026-09-01T14:14:51.714Z` was
available with zero open candidates, zero needing review, zero accepted but not
incorporated, four incorporated or closed, and zero deletion-eligible. No
`SUPERVISION_DESIGN_FEEDBACK` packet is warranted; the production-discovered
Compose-plugin issue is a concrete project-local service-execution regression,
and its exact repair is now mechanically covered.
