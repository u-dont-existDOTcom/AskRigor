# AskRigor Codex Current State

Updated: 2026-08-14

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
- Final deterministic verification passed: 40 files passed, one credential-gated live file skipped; 778 tests passed, five skipped; typecheck and build passed.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-14T23:02:10.872Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- The current universal portable audit passes with 0 errors and four truthful hosted-control warnings after token-shaped privacy fixtures were runtime-fragmented without changing their tested values.
- Release-truth TDD now rejects stale pre-deployment claims. README, privacy map, review checklist, and release evidence consistently record the deployed Action, live August 13 notice, exact 17-tool inventory, rollback, and still-blocked public submission gates.
- Production Action acceptance is preserved from exact code revision `1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; it remains a separate consequential route and not an MCP tool. PR #8 merged the code as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`.
- Universal PR #4 exact head `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` contains the promoted AskRigor controls and passed run `31848203559`, job `94918801742`.

## Current checkpoint

- PR #7 is the sole AskRigor compliance PR.
- The semantic merge is resolved and the final deterministic, live, site,
  protocol, portable-audit, metadata, workflow, and diff matrix is green. The
  exact published head and CI IDs are intentionally external evidence in PR #7;
  re-fetch them rather than trusting a self-referential state-file SHA.
- V0.1.0 remains **PUBLIC SUBMISSION BLOCKED** for the separate routine-status, portal identity/domain verification, Scan Tools, and submission gates.

## Remaining

- Keep PR #7 unmerged while required hosted controls remain absent, disabled, or inaccessible.
- Preserve the no-license-grant posture until the owner selects a license; do not infer a license from public visibility.

## Blockers / unresolved

- Repository rulesets are verified absent. Classic `main` protection, Actions policy/default token, secret scanning/push protection, code scanning, vulnerability alerts, and Dependabot security updates remain `UNVERIFIED` because the connected GitHub App returned `403` or could not inspect them.
- Private vulnerability reporting is verified disabled.
- A public reuse license is not selected. `LICENSE.md` accurately grants no license; an open-source license remains an owner decision.
- These applicable critical-risk governance gaps block `COMPLIANT`; issue [#6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6) is the durable follow-up.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Re-fetch PR #7 and issue #6. If the published head differs from local `HEAD` or either required check is not green, reconcile that evidence; otherwise proceed to the next repository without merging this hosted-control-blocked PR.

## Recovery rule

After interruption, inspect actual Git state, this checkpoint, complete protocol files, current release evidence, PR #7/checks, issue #6, and newer owner instructions. Resume from the latest verified boundary without touching the dirty original checkout or repeating live production acceptance.
