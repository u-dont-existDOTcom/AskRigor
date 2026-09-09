# MAST-derived clinical gates — production release receipt

PR #205 merged the reviewed candidate
`f4fda4918ea3a54e61596d2e1bd7565c576e3cea` as
`17f432ff147fc674e2035fb570c42c22d1e4fbdb`. The merge tree is byte-for-byte
identical to the PR head. Production now runs an image built only from an
immutable `git archive` of that merge.

The release advances HRP from 20.5.26 to 20.5.27, revision 2026-09-09, SHA-256
`65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`.
Universal Instructions remain 20.5.22 at
`d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`.
The merged HRP contains the root-level `ClinicalManagementPreservationGate`,
`PatientSpecificInterventionSafetyReconciliationGate`, the exact
`REQUIRED_NOW`, `CONTINGENT_LATER`, `OPTIONAL_ALTERNATIVE`, and `AVOID` action
map, and FinalSelfCheck items FS203 and FS204.

The benchmark-target-integrity mechanism remains a DEVELOPMENT / DISCOVERY
governance control rather than a family-specific production clinical rule.
`npm run external-evaluation:governance` passed with one registered target
review, one `BENCHMARK_TARGET_CONFLICT`, and zero target-based tuning
permissions. The frozen 96-response MAST benchmark was not rerun, rescored, or
reclassified. No private clinical payload or archive was opened, copied, or
committed.

## Build, deployment, and rollback

The deterministic source archive contains 1,037 members, is 3,428,010 bytes,
and has SHA-256
`a5240efac543d34cb6da090d2c602c20c4da2d70a3a156033f71ec35d5b4330f`.
Its decompressed tar SHA-256 is
`6d8f21dba980e9720bfcb606ebffb052b66bff2da5afb4f39f5ba26bb81de856`.
The resulting image is
`askrigor-research:17f432ff147fc674e2035fb570c42c22d1e4fbdb`, image ID
`sha256:ebc8216536a1d63e5df37b2e809b179aafecf4c5e75a511ca73eae039c36ed6c`.
The transferred 108,407,332-byte image archive has SHA-256
`b6ec3142688d3d6df11f2573497c48fee4bd86ac512cd46af2e574dcbe13213d`;
the VPS verified its sidecar before loading it.

A disposable no-secret candidate passed health, exact 27-tool schema equality,
the 24-read-only/three-non-destructive-write split, both protocol manifests,
HRP integrity, and the runtime security envelope. The active production
container is `d86231b537c7`; it is healthy, runs as `node`, has a read-only root,
drops all capabilities, uses `no-new-privileges`, retains the 1 GiB memory and
256-PID limits, has only the two expected state mounts, and joins exactly
`askrigor_default` and `askrigor_living_evidence_private`.

Before traffic changed, the promotion timer was stopped and the prior runtime
was preserved. The prior image remains tagged
`askrigor-research:rollback-pre-17f432ff147f`, image ID
`sha256:2d02147e8ca9b5ff5c28065a98dcfcb401d5a933fea4a3692bdb823339f130e4`.
Root-only configuration and a non-secret manifest are in
`/opt/askrigor/rollbacks/pre-17f432ff147fc674e2035fb570c42c22d1e4fbdb`,
owner `root:root`, mode `0700`. Rollback stops the promotion timer, recreates
only `research-mcp` with the preserved image/configuration, restores the prior
selector, verifies health, and restarts the timer. It does not delete database
rows, proposals, intents, receipts, sessions, or site state.

## Active worker and scheduler verification

The authenticated installed AskRigor Reviewer connector returned HRP 20.5.27
with the exact revision and digest, verified that digest, and loaded the
complete 583,605-character protocol. Direct inspection of that returned text
confirmed both root clinical gates, all four action-map states, and FS203/FS204.
The active connector catalog exposes exactly 27 tools. A fresh read-only PubMed
probe returned one record with a truthful partial pagination state.

The source plugin receipt remains
`60d20c3bd1efcb29dd11e74040a511be135ec59676028b091d5340dac5ea69b7`.
The marketplace and installed packages are exact at version
`0.1.0+codex.20260901124016`, package SHA-256
`02c41b473c23a5442d72c65e8346b6986451d26c2fe68e297cd3532067084ae1`,
with all eight declared files present. All seven non-manifest members equal the
reviewed source; only the intentional cachebuster manifest differs. The
installed AskRigor skill requires manifest lookup, exact integrity verification,
and complete protocol loading, so no package reinstall was required.

The production image selector is root-owned mode `0600` with SHA-256
`de41fb568da67927eca92326f091bc041c7114957fe20603c2b0ef86f2f13552`.
The required manual promotion one-shot exited zero with
`no_pending_promotion`; its bounded journal scan found zero sensitive markers
and no runner remained. A subsequent scheduled trigger at
2026-09-09 13:10:11 UTC also succeeded, the service returned to inactive, no
runner remained, and the timer exposed its next trigger at
2026-09-09 13:15:13 UTC.

The new container retained one startup log line; the credential/provider-body
marker scan returned zero. HTTPS health returned 200 and the live Action schema
retained the repository-defined OAuth production projection with only
`/actions/lessons`. PR #205 changed no public-site bytes, so the site was not
redeployed. `/`, `/privacy`, `/terms`, and `/support` all returned 200 and the
current site selector remains the previously verified compliance release.

## Verification and disposition

PR #205's exact final head passed deterministic run `34305008052`, workflow
policy run `34305008000`, and all CodeQL analyses in run `34305006165`. The
merge tree equals that head. Under Node 24.18.0, the focused protocol,
governance, and MCP group passed 101 tests; the clinical-management and external
governance subset passed 14 tests; XML parsing, exact hashes, build, and diff
checks passed. A redundant local full-suite attempt on the saturated workstation
reproduced the pre-existing fixed-duration Hermes transport timeout and was
stopped after the first substantive failure; no test or gate was weakened. The
protected clean runner remains the complete-gate evidence for the exact tree.

The release-time lesson checkpoint was available with one open candidate, one
needing review, zero accepted but not incorporated, four incorporated or
closed, and zero deletion-eligible. Typed completion claim: `OUTCOME`. No
release blocker remains.
