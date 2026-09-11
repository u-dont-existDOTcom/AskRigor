# Longitudinal evidence and phenotype–etiology firewall — production release

PR #214 merged reviewed head
`8ad7e3f3424c2f3751338e0d75b76f6a6efe11f0` as
`23b14f205621352f2c7f67a074bddb7e91c65ee1`. The merge tree is byte-for-byte
identical to the PR head. Production now runs an immutable image built from an
exact archive of that merge.

The release advances Universal Instructions to 20.5.23, revision 2026-09-10,
SHA-256
`321686bf6cfb718ecef6ae4887a4691f0969304caedbbabee2c97ee19afaa303`,
and HRP to 20.5.28, revision 2026-09-10, SHA-256
`bb886e1e1874eeba1d645b773937043c7d9d88c84a3427ad7c0fe7f4a9be713f`.
The root protocols, project router, and patient-story evidence v0.3 contract now
preserve the three-to-seven strongest longitudinal constraints before an
individual-case differential, separate phenotype or morphology from etiology,
test every leading hypothesis against the complete temporal and treatment-
response pattern, and classify later conclusion changes as new evidence or a
correction/reweighting of already-present evidence. The image-overrides-history
regression and HRP FinalSelfCheck FS206 enforce the failure case.

Patient-story v0.1 and v0.2 remain frozen and unchanged. The versioned v0.3
extension adds the new typed evidence roles without silently reinterpreting
previously collected data. The canonical migration reproduced Universal, HRP,
and the project router exactly from its declared base; a second run was
idempotent. The generated v0.3 JSON schema has no drift.

## Build, deployment, and rollback

The source tar contains 3,006 members, is 22,435,840 bytes, and has SHA-256
`f67083eb6f37fa16444af9b74d2d194ec17a8be3d95f0739bf72d92617917baa`.
Its 4,334,111-byte gzip form has SHA-256
`3afbd00b64d128652c3a924769a18d20aa30004fab9667d259f161dee379d24f`.
The resulting image is
`askrigor-research:23b14f205621352f2c7f67a074bddb7e91c65ee1`, image ID
`sha256:6fc07da58a795e1e0e7af2c8f75c4058cff1a9cef2c717809c9406842db3d68b`.
The transferred 108,441,787-byte image archive has SHA-256
`3ab712d3401ce96076c312ab8f87ec93260c34781026c2fc68729a6e30b0e89b`;
the VPS recomputed the digest before loading it.

A disposable no-secret container passed health and the production security
envelope. Active container
`5d32b76a8101a7d70ba0e442e662f277d0655feca6f1d2ed78ce58c7bfef9634`
is healthy, runs as `node`, has a read-only root filesystem, drops all Linux
capabilities, uses `no-new-privileges`, retains the 1 GiB memory and 256-PID
limits, has only the two expected state mounts, and joins exactly
`askrigor_default` and `askrigor_living_evidence_private`. PostgreSQL remained
healthy and was not recreated.

Before traffic changed, the promotion timer was stopped and the previous
runtime was preserved. The prior image remains tagged
`askrigor-research:rollback-pre-23b14f205621`, image ID
`sha256:ebc8216536a1d63e5df37b2e809b179aafecf4c5e75a511ca73eae039c36ed6c`.
Root-only configuration, selector, and manifests are in
`/opt/askrigor/rollbacks/pre-23b14f205621352f2c7f67a074bddb7e91c65ee1`,
owner `root:root`, mode `0700`. Rollback stops and disables the exact promotion
timer, restores the preserved selector/configuration, recreates only
`research-mcp`, verifies health, and then restores the prior timer state. It
does not delete database rows, proposals, intents, receipts, sessions, or site
state.

## Active worker, plugin, and scheduler

The authenticated installed AskRigor Reviewer connector exposes exactly 27
tools. It returned both new manifests, verified both digests, and loaded the
complete canonical texts: 150,219 Universal characters and 590,082 HRP
characters. Exact digest equality plus direct marker checks establishes that
the active worker receives the longitudinal constraint map, phenotype–etiology
firewall, complete-pattern prediction rule, correction classification,
regression, and FS206. A fresh read-only PubMed probe completed without an
access limitation and returned one record.

The source plugin receipt remains
`60d20c3bd1efcb29dd11e74040a511be135ec59676028b091d5340dac5ea69b7`.
The installed package remains version `0.1.0+codex.20260901124016`, SHA-256
`02c41b473c23a5442d72c65e8346b6986451d26c2fe68e297cd3532067084ae1`.
All eight declared members are present, and all seven non-manifest members equal
the reviewed source. The sole difference is the installed manifest's required
cachebuster version, so reinstalling an unchanged package was unnecessary.

The production image selector is root-owned mode `0600`, SHA-256
`0f6940f78da58bf83d744f4977ca15a01385e7149b28fb8a692670164f6ce2bf`.
The required manual promotion one-shot exited zero with no pending promotion,
left no runner, and logged no sensitive marker names. The next scheduled run at
2026-09-11 09:25:07 UTC also succeeded; a later scheduled run at 09:30:13 UTC
confirmed continuing operation. The timer remains enabled and active.

## Live acceptance and disposition

`https://mcp.askrigor.com/healthz` returned 200. The research container retained
one startup line, and its credential/provider marker scan returned zero. The
live Action document remains the repository-defined OAuth production
projection: only `/actions/lessons`, SHA-256
`94a3635e4a4ac398f2151b4debb383cd7b78136ebba50a908e85c210e7c71e6f`.
OAuth research access intentionally omits the legacy controlled-research Action
routes so they cannot bypass the active account-mode boundary.

One diagnostic fixed-challenge attempt through the legacy Custom GPT correctly
failed closed before creating a server session or rendering a research
conclusion because that retired Action path is absent. It is not counted as
active-worker acceptance. The ordinary OAuth AskRigor connector is the current
research surface, and its catalog, protocol, integrity, complete-load, and
provider checks all passed. The single diagnostic browser tab was closed.

PR #214 changed no public-site bytes, so the site was not redeployed. `/`,
`/privacy`, `/terms`, and `/support` all returned 200 and matched current `main`
byte-for-byte.

The exact PR head passed deterministic run `34583026328`, workflow-policy run
`34583026390`, and all CodeQL analyses in run `34583022697`. On Node 24.18.0,
the focused changed suite passed 211 tests across 17 files. Full `npm run verify`
passed 1,910 tests across 162 files, with the six declared tests and one file
skipped, followed by typecheck and production build. XML parsing, exact hashes,
diff checks, the authority validator, schema generation, migration replay, and
idempotence all passed.

The documentation-only release-receipt branch's local full-parallel repeat
reached 1,909 passing tests before the known fixed 10-second workstation timeout
hit one controlled-research test; there was no failed assertion. The exact
`tests/controlled-research-route.test.ts` suite then passed 16/16 in isolation.
The protected clean runner remains the required exact-head full-gate evidence
for the receipt branch.

The release-time lesson checkpoint was available with one open candidate, one
needing review, zero accepted but not incorporated, four incorporated or
closed, and zero deletion-eligible. Typed completion claim: `OUTCOME`. No
release blocker remains.
