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

## How pull requests are handled

- **Anyone can open an issue or a pull request.** Small, focused changes are the
  easiest to review and the quickest to merge.
- **Read the design decisions first.** `docs/design-decisions.md` says what
  AskRigor chose, why, and what it decided not to do. A change that undoes one
  of them is welcome when it says so and why; it then needs the owner's decision.
- **Who decides.** The repository owner decides what merges. Each pull request is
  reviewed, with AI help, and must pass the full checks. Changes to research
  method, health policy, privacy, licensing, or a release need the owner's
  explicit yes.
- **When `main` has moved on.** Merge the latest `main` into your branch and push
  again. Please don't rebase or force-push once review has started: reviewers
  lose track of what they already checked.
- **When two pull requests change the same thing.** The one that is reviewed and
  passing first goes in, and the other is asked to update. If yours overlaps with
  work already under way, we say so early and may fold your idea into that work,
  with credit.
- **Disagreements.** About what AskRigor should do, the owner decides, and the
  decision and its reason go into `docs/design-decisions.md`. About facts, the
  evidence decides.
- **Never include** secrets, private health information, or data drawn from
  YouTube comments.
- **AI-written changes are welcome** when you have read and checked them
  yourself. They go through the same review and checks.

