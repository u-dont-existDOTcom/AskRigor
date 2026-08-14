# AskRigor Codex Current State

Updated: 2026-08-14

## Goal

- Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Branch: `main`
- Protocol authority: the current complete canonical `HRP_Full.xml` and `Universal_Instructions.xml`, plus explicit current owner correction.
- Universal engineering entry point: `u-dont-existDOTcom/universal-dev-architecture/LESSON-INDEX.md`.

## Completed

- A repository profile now records AskRigor as public, active, long-running, critical-risk software and records hosted controls as unverified rather than assumed.
- `npm ci` is recorded as the reproducible dependency-install baseline because the repository has a committed npm lockfile.

## Current checkpoint

- Current step: verify the actual project instruction hierarchy, canonical orchestration command, test/lint/typecheck/build commands, CI workflows, and hosted GitHub controls.
- Last verified durable boundary: repository classification/profile and this checkpoint were added.

## Remaining

- Identify and record exact authoritative commands without guessing from historical chat.
- Audit root/nested `AGENTS.md` against current protocol authority.
- Audit Actions permissions, immutable action pins, untrusted-PR handling, release credentials, and artifact provenance.
- Verify branch rules, secret scanning, push protection, code scanning, Dependabot, CODEOWNERS, security policy, and release controls through GitHub.
- Add the portable repository audit and required CI gate after exact commands are known.

## Blockers / unresolved

- Hosted GitHub controls cannot be inferred from repository files.
- The canonical test/orchestration command must be derived from current repository scripts and documentation, not remembered summaries.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Universal operating standard: `patterns/codex-github-operating-system.md` in `universal-dev-architecture`
- Central baseline: `audits/2026-08-14-connected-repositories.md` in `universal-dev-architecture`

## Next safe action

- Read the current root and nested instruction files, `package.json`, workflow files, and project entry-point documentation; then update the repository profile with exact commands and this file's path before enforcing CI.

## Recovery rule

After interruption, a fresh thread, context compaction, or model switch, inspect actual repository state and recent commits first. Reconcile this checkpoint, identify exactly what survived, and resume from the latest verified durable boundary without repeating completed work.
