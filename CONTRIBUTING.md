# Contributing

AskRigor is public, critical-risk research software. Bug reports and bounded
technical feedback are welcome. Contributions to Covered Software are accepted
under `AGPL-3.0-or-later`. Obtain explicit maintainer confirmation before
submitting anything under a Reserved Materials path; those materials are not
covered by the software license.

Before proposing a change:

1. Read `AGENTS.md`, `docs/INDEX.md`, and the current recovery checkpoint.
2. Preserve complete protocol-byte authority, explicit source-access states,
   privacy boundaries, and candidate-versus-production release truth.
3. Install with `npm ci` and run the complete deterministic gate with
   `npm run verify`.
4. Use the pull-request template and provide exact branch, commit, command,
   result, CI, risk, rollback, and residual-uncertainty evidence.

Provider/live tests are opt-in and must never receive secrets through a public
pull request. Substantive HRP or Universal policy changes, public release or
submission risk, changes to the Reserved Materials boundary, and other
licensing decisions require the repository owner's explicit decision.

Read `LICENSE.md` before contributing. Do not contribute material you are not
authorized to submit; third-party material remains governed by its own rights
and notices.
