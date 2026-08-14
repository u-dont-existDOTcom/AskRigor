# Contributing

AskRigor is public, critical-risk research software. Bug reports and bounded
technical feedback are welcome. Before submitting code, protocol content, or a
pull request, obtain explicit maintainer confirmation because contribution and
reuse licensing terms have not been established.

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
submission risk, and licensing decisions require the repository owner's
explicit decision.

The repository currently grants no public reuse license. Publication and any
review of a proposed contribution do not by themselves grant rights to reuse
the repository. Do not contribute material you are not authorized to submit.
