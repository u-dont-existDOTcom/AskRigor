# Comparison and interview-evidence protocols — production release receipt

PR #198 merged the comparison-set and estimand integrity update as
`301c5f0e80cdfa7e67f11e1003598f76e341bab2`. PR #201 merged the interview-
evidence and information-gain update as
`d1b83dbbfd1f4258ba17f137598296a1a0a007b9`. Production now runs an image built
only from an immutable archive of that exact final merge.

The release advances Universal Instructions from 20.5.20 in the prior image to
20.5.22 and HRP from 20.5.24 to 20.5.26. The comparison release preserves
reference/comparison sets, estimands, comparability before ordering, ranking
resolution, evidence depth versus effect magnitude, fixed-dose response versus
potency/Emax, cross-agent exposure comparability, dose-rescue discrimination,
endpoint triangulation, mixture attribution, and uncertainty-aware ranking. The
interview release preserves generalized recurrence self-report as evidence,
separates specificity from evidential independence, probes exceptions before
confirming anecdotes, separates evidence roles, requires a valid opportunity
sampling frame for frequency, rejects example quotas, and gates optional
follow-ups by expected information gain.

Independent review before PR #201 merged found four defects in the unreleased
patient-story v0.2 extension: defined-frame independence could be attached to a
direct report without a frame; textual role payloads could be empty in the
Zod contract; the typed and JSON contracts could disagree about opportunity
counts; and volunteered exceptions could be preserved only by inventing probe
provenance. The final contract reserves defined-frame statuses for sampled
opportunities, rejects blank payloads, records target-event and non-target-event
opportunities as coherent denominator components, and permits volunteered
exceptions while their calibration status remains `NOT_YET_PROBED`. The
confirming-example JSON regression was also isolated from the mixed-role rule.
No collection used the unreleased defective candidate, so no frozen method or
prior data required migration.

The protocol migration was replayed from exact PR #198 canonical bytes in a
disposable worktree. All 18 protocol and current-receipt outputs matched the PR
#201 branch byte-for-byte, and a second replay was idempotent. The frozen
patient-story v0.1 contract and implementation retained their historical exact
hashes. The final current identities are:

| Artifact | Identity |
| --- | --- |
| Universal Instructions | 20.5.22; `d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6` |
| HRP | 20.5.26; `19b23a6b66162a2b734c3197fc287ce740a82bee92cd84d5a9e1e2b9380e8659` |
| Project router | `143e17ecffb330f98a0be85f52c0cd284a05d0ca08f325afd9443054bb9efc43` |
| Patient-story v0.2 JSON Schema | `776f69b7e2c5fc5494b1fe58298a9062a4286ce85259dd0e774758048d8d7537` |

## Build, candidate, and rollback

The deterministic gzip source archive contains 1,030 members, is 3,406,939
bytes, and has SHA-256
`3bdce5737b22a32d2230a47e0df4fa5ff3051c0d2f62c306fad08b2d2bf77ebd`.
Its decompressed exact `git archive` tar digest is
`f13264436e95481bdc3f01f9f46e9756b63646630ea4f573ba37e57f398f2c39`.
The resulting image is
`askrigor-research:d1b83dbbfd1f4258ba17f137598296a1a0a007b9`, image ID
`sha256:2d02147e8ca9b5ff5c28065a98dcfcb401d5a933fea4a3692bdb823339f130e4`.
The transferred 108,402,096-byte image archive has SHA-256
`c518f0626e4b3fb2dfe4ab4d923603e372c3f402444a6d5d6dc75f4180e6b916`;
the VPS verified its sidecar before loading it.

A disposable no-secret candidate passed health, exact 27-tool inventory,
24-read-only/three-non-destructive-write annotations, both protocol manifest
and integrity calls, and the runtime security envelope. It ran as `node` with a
read-only root, all capabilities dropped, `no-new-privileges`, a 1 GiB memory
limit, and only the bounded `/tmp` tmpfs.

Before traffic changed, the existing promotion timer was stopped, the service
and fixed runner were absent, and the prior image and root-only configuration
were preserved. The prior image remains tagged
`askrigor-research:rollback-pre-d1b83db`, image ID
`sha256:ad010f8475f104b9a8db158b2f2d8095976dbfa008901c05e38ca6678990317b`.
The rollback directory is
`/opt/askrigor/rollbacks/pre-d1b83dbbfd1f4258ba17f137598296a1a0a007b9`,
owner `root:root`, mode `0700`. A failure before acceptance would have recreated
only `research-mcp` from the prior image and restarted the timer; repository,
proposal, intent, receipt, and site state were never deletion targets.

The active production container is
`787cfa61ecdc01451fa4997bcafdd67e393a320e4fcc2b85b49b5efd4b3a9b5f`.
It is healthy, runs as `node`, retains the read-only/capability-free security
envelope, has only the two expected state mounts, and joins exactly
`askrigor_default` and `askrigor_living_evidence_private`. The existing
PostgreSQL container remained healthy and unchanged.

## Live and product acceptance

Direct HTTPS and the authenticated installed connector both returned Universal
20.5.22 and HRP 20.5.26 with the exact hashes above. Integrity verification
passed for both. The live MCP catalog equals the complete committed inventory,
whose SHA-256 is
`5dd514a9e865da0b312a3f9f6a106a4a3d0bd9872e7bfec0e95db6bbe9c7dab0`:
27 unique tools, 24 read-only and three non-destructive writes. A fresh
read-only PubMed search through the authenticated connector completed and
returned one record from a provider-reported result set.

A quota-bounded production YouTube test exercised public video discovery,
metadata, top-level comments, and replies through the server-side application
credential. Search returned three candidates; metadata returned one public
video with three provider-reported comment records; complete comment retrieval
returned two top-level comments and one independently paginated reply with no
reply-count mismatch. No YouTube-user OAuth flow occurred. Only counts and
states are recorded here. The research container retained exactly one startup
log line after the test; its credential/provider-content marker scan and exact
test-video-ID scan both returned zero.

OAuth-based AskRigor research access intentionally disables the legacy research
Action routes. The live Action schema contains only `/actions/lessons` and is
byte-for-byte equivalent as JSON to that one-route projection of the committed
five-route schema. This is the repository-defined production configuration,
not a schema drift. The full generated document and Custom GPT sync files remain
unchanged and retain their protected deterministic receipts.

The public site was not redeployed because neither PR changed site bytes. Caddy
remains on the exact compliance release at
`/opt/askrigor/site/releases/ec8ea4ddd49ab3f7996c75f25b2195b840a6927a/site`.
Independent HTTPS reads returned 200, and the live bytes equal current `main`:

| URL | SHA-256 |
| --- | --- |
| `https://askrigor.com/` | `e921c942ba7d732958eaf520516425ac5b8493720d6d79d9091bc2094056e4ff` |
| `https://askrigor.com/privacy` | `cba2c21268a5061c3ba2d573fc295f9e56a7b791e0a4e98d75ee106b1f6a3481` |
| `https://askrigor.com/terms` | `edb0fa903c302a6ca309691be6f67f56ff28ae56e59cffdd440c848996ab0029` |
| `https://askrigor.com/support` | `f83b7b463b43058cd85ce7626d140cfe5f6b975abfb53386243f47e8b4d321ba` |

The source plugin receipt is
`60d20c3bd1efcb29dd11e74040a511be135ec59676028b091d5340dac5ea69b7`
at version 0.1.0. The personal-marketplace and installed receipts are identical
at version `0.1.0+codex.20260901124016`, package SHA-256
`02c41b473c23a5442d72c65e8346b6986451d26c2fe68e297cd3532067084ae1`.
All eight declared files are present; all seven non-manifest files match the
merge exactly. The only source-to-installed difference is the intentional
manifest cachebuster, so no reinstall was required.

The promotion selector was atomically changed to the exact deployed image. Its
SHA-256 is
`02e0c97cc2f50e14c06eb9b517dd3063b2b065bdd1c113fa972190a75fb1b247`,
owner `root:root`, mode `0600`. The required manual one-shot exited zero with
`no_pending_promotion`. Subsequent scheduled runs returned the same bounded
state, the journal privacy scan found zero sensitive markers, the service is
inactive between runs, no runner remains, and the enabled active timer showed a
future trigger at `2026-09-09T01:45:00Z`.

## Verification and disposition

PR #201's protected clean runner passed `npm run verify`, PostgreSQL living-
evidence acceptance/fixture pilot, synthetic Community Forum/Discourse
acceptance, workflow policy, and all four CodeQL analyses. The deterministic
run was `34298796150`, job `102301093703`. The branch also passed schema
generation, 16 focused interview-evidence tests, the 13 affected suites (162
tests), typecheck, build, XML parsing, diff checks, and the independent migration
replay. Local full-suite attempts under a workstation load average near 20 hit
the same unrelated fixed-duration process-spawn timeouts reproduced on
`origin/main`; no production or test logic was weakened for that host condition.

The release-time lesson checkpoint was available with one open candidate, one
needing review, zero accepted but not incorporated, four incorporated or
closed, and zero deletion-eligible. The unreviewed candidate did not expand or
block this release.

Typed completion claim: `OUTCOME`. The merged source, production image,
canonical protocols, project router, evidence schema, MCP catalog, installed
connector, public site, promotion scheduler, and rollback state agree. No
external blocker remains for this release.
