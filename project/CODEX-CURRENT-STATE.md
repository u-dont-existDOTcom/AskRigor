# AskRigor Codex Current State

Updated: 2026-08-15

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main`; active task branch: `codex/github-compliance-2026-08-14`
- Current main integrated into the compliance candidate: `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Byte receipts: HRP `20.5.17` / 2026-08-13 / `d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`; Universal `20.5.11` / 2026-08-07 / `1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa`
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`

## Completed

- Recovery inspected the complete instruction chain, profile/state/README/indexes, scripts/lock/runtime, workflows, ownership/dependency/security posture, recent commits, PR #7, and hardening issue #6.
- The dirty original `main` checkout and its unrelated untracked files remain untouched; all work is isolated here.
- Current `main` was semantically merged without losing the Action implementation, live-acceptance evidence, privacy/release records, or compliance controls. Project-installation conflicts preserve separate MCP/Action surfaces, governance-file exclusion, and complete-protocol authority.
- The repository profile declares only exact commands run on this candidate and distinguishes hermetic CI from the separately authorized bounded provider smoke.
- `npm ci` passed on Node `24.18.0`: 156 packages installed, 0 audited vulnerabilities.
- Final deterministic verification passed: 41 files passed, one credential-gated live file skipped; 779 tests passed, five skipped; typecheck and build passed.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-14T23:02:10.872Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- The current universal portable audit passes with 0 errors and four truthful hosted-control warnings after token-shaped privacy fixtures were runtime-fragmented without changing their tested values.
- Release-truth TDD now rejects stale pre-deployment claims. README, privacy map, review checklist, and release evidence consistently record the deployed Action, live August 13 notice, exact 17-tool inventory, rollback, and still-blocked public submission gates.
- Production Action acceptance is preserved from exact code revision `1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; it remains a separate consequential route and not an MCP tool. PR #8 merged the code as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`.
- Universal PR #4 exact head `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` contains the promoted AskRigor controls and passed run `31848203559`, job `94918801742`.
- The owner selected a scoped `AGPL-3.0-or-later` grant for original software.
  `LICENSE.md` keeps complete protocols, health-research policy, evidence,
  editorial content, recorded fixtures, and archived/third-party tools outside
  that grant; the exact official license bytes are integrity-tested.
- Hosted governance is directly verified. Active ruleset `20882388` requires
  pull requests plus strict `Deterministic verification` and `workflow-policy`,
  blocks deletion/force pushes, and retains the sole owner as the only bypass
  without requiring fake independent approval.
- Actions are limited to the three exact SHA-pinned checkout/setup-node
  revisions used by current workflows; default workflow tokens are read-only.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled.
- CodeQL setup run `31862487322` succeeded. Two alerts were dismissed with
  durable false-positive/test-only reasons. The real prototype-pollution alert
  has a red/green regression and a null-prototype path-map fix on this branch.

## Current checkpoint

- PR #7 is the sole AskRigor compliance PR.
- The semantic merge is resolved and the final deterministic, live, site,
  protocol, portable-audit, metadata, workflow, and diff matrix is green. The
  exact published head and CI IDs are intentionally external evidence in PR #7;
  re-fetch them rather than trusting a self-referential state-file SHA.
- V0.1.0 remains **PUBLIC SUBMISSION BLOCKED** for the separate routine-status, portal identity/domain verification, Scan Tools, and submission gates.

## Remaining

- Re-run the exact final gates with the CodeQL repair and hosted evidence,
  publish the final PR #7 head, wait for both required checks, update/close
  issue #6, and merge.
- After merge, verify the default-branch CodeQL run closes the fixed alert.

## Blockers / unresolved

- No repository-baseline owner decision or hosted-control blocker remains.
  Historical integration `403` results and the disabled private-reporting
  observation are superseded by the dated authenticated API evidence in the
  repository profile. Issue
  [#6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6) is the durable
  record and is ready for final-head evidence and closure.
- V0.1.0 public submission remains blocked by its separate product/release
  gates; compliance does not accept or bypass those gates.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Run the full candidate gates, publish the evidence/CodeQL fix, wait for the two
required checks, merge PR #7, and verify the default-branch CodeQL alert state.

## Recovery rule

After interruption, inspect actual Git state, this checkpoint, complete protocol files, current release evidence, PR #7/checks, issue #6, and newer owner instructions. Resume from the latest verified boundary without touching the dirty original checkout or repeating live production acceptance.
