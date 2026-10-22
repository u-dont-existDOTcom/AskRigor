# Owner answer 149a: HRP 20.6.30

Date: 2026-10-22. Status: **BUILT on the build branch `claude/askrigour-instruction-optimization-cffyp2`, for the
next build.** Nothing is merged, released or deployed; a release is a later owner decision (148a: "Releases still need
the owner's explicit yes").

## Authority and scope

- **149a** (owner answer to question 149, 2026-10-22), from the 21 Oct regression case "Responders" (question 136,
  `docs/owner-regressions.md`): one new rule in HRP's core section `EpistemicSafetyRules`.
- No other protocol text changes. Universal stays 20.5.46.
- No paid model call.

## Why

The case gives 28 responders against 8, with the group sizes missing or in conflict. On 21 Oct the answer saw that the
group sizes conflicted (31 + 33 = 64 against 60 enrolled) and still worked out 90.3%, 24.2%, 66.1 percentage points
and a ratio of 3.73, "If the table gives the correct denominators". That is the case's own fail condition, and the
only one of the 50 cases that failed (`audits/2026-10-21-owner-regressions-judgment.md`, q136-responders).

## Protocol wording (approved word for word)

HRP 20.6.30, revision date 2026-10-22. In `EpistemicSafetyRules`, right after `UnverifiedSpecificsLimitConfidence`,
which was the section's last rule, a new rule `<Rule name="CountsNeedTheirGroupSizes" priority="Critical">`:

> When counts are given without the group sizes they come from, or the group sizes conflict, give the counts and the
> conflict, and work out no percentage, difference or ratio from them, not even as a conditional figure, until the
> group sizes are reconciled.

It is formatted like the rules around it: the opening tag on its own line, the text wrapped at 118 columns with three
spaces of indent, the closing tag on its own line, and a blank line before it.

## Why the core

`EpistemicSafetyRules` is one of HRP's seven core sections. `load_protocol` serves them together as `core`, and every
research answer loads the core first; the other sections are loaded only when a question needs them. Counts without
their group sizes can turn up in any research answer, so the rule goes where every answer reads it.

## Records and tests

- A Critical revision note for 20.6.30 at the top of the revision history: "Owner-approved, answer 149a (2026-10-22),
  from the 21 Oct regression case Responders (question 136), which computed rates and a ratio from counts whose group
  sizes conflicted: added CountsNeedTheirGroupSizes to the core section EpistemicSafetyRules, which every research
  answer loads."
- A reversible edit fixture, `tests/fixtures/protocol-edits/2026-10-22-owner-question-149-hrp.json` (3 edits), chained
  from questions 152 and 153's HRP 20.6.29; the undo chain in `tests/helpers/undo-read-depth.ts` undoes it first.
- `tests/owner-question-149-protocol-2026-10-22.test.ts` rebuilds the edits from the approved wording and reverses the
  file byte for byte, and checks the rule's exact text, its place after `UnverifiedSpecificsLimitConfidence` in
  `EpistemicSafetyRules`, the revision note, the line widths, each changed section's exact growth, the core on one
  page, that `load_protocol` serves the rule and the core with the rule in it, and that Universal is unchanged.
- The question 152 and 153 layer test now rebuilds HRP 20.6.29 from the current file, as question 125's test did when
  20.6.29 arrived.
- Current-version pins: `README.md`, `scripts/instruction-layering-profile.json` and the tests that pin the current
  HRP manifest. Records of past releases, such as the 22 Oct release of HRP 20.6.29, are unchanged.

## Sizes and fingerprints

- HRP: 615,849 to 616,546 bytes (+697: the revision note +359, `EpistemicSafetyRules` +338), SHA-256
  `a72aed35746b86b084398cdb92fa1d36dac2d2941b31feea34e242678cf49b79` to
  `b7c1df6eb235bcd1423e4d8fdb86245887e3cd0eac3f469f6cc91619a5c91ef8`.
- HRP core: 39,614 to 39,952 bytes (+338). Served with the separators, 39,964 of the page's 40,000 bytes: one page,
  with 36 bytes left. A later core addition larger than that makes the HRP core two pages.
- Universal: unchanged, 20.5.46, SHA-256 `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e`.

## Tests run

- `npm run verify` (typecheck, the full test suite and build) with Node 24.18.0 passed: 272 test files, 271 passed
  and 1 skipped; 4,298 tests, 4,292 passed and 6 skipped. The new test file's 8 tests all passed.
- On the build branch, after the final check's part of 149a (commit 981e2a92), `npm run verify` passed again: 272 test
  files, 271 passed and 1 skipped; 4,301 tests, 4,295 passed and 6 skipped.
