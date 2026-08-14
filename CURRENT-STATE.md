# Current state

## Goal

Keep AskRigor installable, verifiable, privacy-bounded, and faithful to its research-routing and completion contracts.

## Baseline

- Canonical branch: `main`
- Node: 24.18.0
- Complete deterministic gate: `npm run verify`
- Research router: `project/PROJECT_INSTRUCTIONS.md`

## Current checkpoint

The repository has passing deterministic CI and release evidence. The active governance change adds an exact agent map, documentation index, hardened CI, dependency maintenance, PR/recovery controls, and public security reporting.

## Remaining

- Merge the governance PR after its final checks pass.
- Protect `main` with the `verify` check through authenticated GitHub administration.
- Set the default Actions token to read-only and enable available public-repository security features.

## Next safe action

Complete the governance PR without changing AskRigor's research behavior, protocol semantics, or live-access boundaries.
