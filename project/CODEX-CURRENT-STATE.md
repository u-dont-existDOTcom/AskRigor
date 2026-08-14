# AskRigor Codex Current State

Updated: 2026-08-14

## Goal

- Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main`; active task branch: `codex/github-compliance-2026-08-14`, based on `50be9e4aba0efd6f4536b425ae9db5b61df1a6e0`.
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`.
- Current byte receipts: HRP `20.5.17` / 2026-08-13 / `d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`; Universal `20.5.11` / 2026-08-07 / `1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa`.
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`.
- Universal engineering entry point: `u-dont-existDOTcom/universal-dev-architecture/LESSON-INDEX.md`.

## Completed

- Recovery covered all applicable agent instructions, the repository profile, both state files, README/indexes, current scripts/lockfile/runtime, workflows, ownership/dependency automation, recent commits, open PRs, and the hardening-issue search.
- The original `main` checkout and its unrelated untracked secret-looking files remain untouched; this task uses an isolated worktree.
- `npm ci` completed with the committed lockfile on Node `24.18.0` and reported zero audited vulnerabilities.
- The recovered `main` gate had one real drift: its Project-package test rejected the already-committed Project governance files. The failing regression was preserved and the assertion was narrowed to the exact three installable files plus the two expected governance files.
- The complete deterministic gate passes with the Project and workflow-policy
  regressions: 26 test files passed, one live file skipped; 467 tests passed and
  five live tests skipped; typecheck and build passed.
- Repository-visible authority, security reporting, no-license-grant contribution posture, ownership, PR evidence, and CI presentation are committed without changing protocols, source states, MCP behavior, site behavior, or release state.
- The verified repository-visible implementation is committed as
  `3feae13af7f460143f090e5782d73c9794ea1eec`.
- Initial PR workflow-policy run `31776171520` failed because its substring
  detector matched its own `pull_request_target` source text. The red/green
  event-syntax repair is committed as
  `697bfe63a08b7fd8729d37b9e35a7cee75214076` and still rejects a real
  mapping-form privileged checkout.
- The current universal compliance PR now contains the structure-aware PEM
  detector fix and the AskRigor transferable-control lesson; its lesson commit
  is `7870cd2e649c8a09b0b09f96e0411c546e5f1782`.
- Hosted API evidence on 2026-08-14: public repository, one admin maintainer, no environments, no repository rulesets, private vulnerability reporting disabled; several admin/security endpoints returned HTTP 403 and remain `unverified`.
- Hardening issue [#6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6)
  contains the precise remaining hosted settings and owner licensing decision.

## Current checkpoint

- Current step: rerun final gates with this report/state update, publish one
  focused PR, and verify both final-head checks.
- Last verified durable boundary: workflow-policy fix commit
  `697bfe63a08b7fd8729d37b9e35a7cee75214076`; the compliance report records the
  exact recovered and final-candidate evidence.

## Remaining

- Rerun protocol-focused tests, the complete final deterministic gate, JSON/YAML/shell/diff checks, and the current universal portable audit.
- Commit and push the final candidate, open one PR, and verify both final-head checks.
- Protect `main` with the stable `Deterministic verification` check, enable private vulnerability reporting and supported security controls, and verify Actions defaults when an authenticated administration path is available.
- Keep V0.1.0 public submission blocked until its existing release gates pass or the owner expressly accepts the risk.

## Blockers / unresolved

- Classic `main` protection, Actions policy/default token, secret scanning/push protection, code scanning, vulnerability alerts, and Dependabot security updates are inaccessible to the connected GitHub App (`403 Resource not accessible by integration`) and remain `UNVERIFIED`.
- Repository rulesets are verified absent and private vulnerability reporting is verified disabled. These applicable critical-risk controls block a `COMPLIANT` result until corrected and verified.
- A public reuse license is not selected. `LICENSE.md` preserves the existing no-license-grant posture; choosing an open/public license remains an owner decision.
- The recovered portable-audit false positive is resolved in universal commit
  `4b8247cb335d2f4c0ff8470e7101863bf44325be`: it now requires a structurally
  plausible PEM block while preserving AskRigor's negative archive assertion.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Hosted follow-up: [hardening issue #6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6)
- Promoted universal lesson: `audits/2026-08-14-askrigor-transferable-controls.md`
  at universal commit `7870cd2e649c8a09b0b09f96e0411c546e5f1782`
- Universal operating standard: `patterns/codex-github-operating-system.md` in `universal-dev-architecture`
- Central baseline: `audits/2026-08-14-connected-repositories.md` in `universal-dev-architecture`

## Next safe action

- Review the complete candidate diff, run the final verification matrix, then create/update the single hardening issue and publish one focused PR. Do not deploy, submit publicly, run paid provider calls, or modify protocol policy as part of this compliance change.

## Recovery rule

After interruption, a fresh thread, context compaction, or model switch, inspect actual repository state and recent commits first. Reconcile this checkpoint, identify exactly what survived, and resume from the latest verified durable boundary without repeating completed work.
