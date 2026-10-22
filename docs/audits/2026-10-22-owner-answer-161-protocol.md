# Owner answer 161a: HRP 20.6.31

Date: 2026-10-22. Status: **BUILT on the local branch `build-161a-hrp-thread-audit-20261022`, from the build branch
`claude/askrigour-instruction-optimization-cffyp2` at c770afc1, for the next build.** Nothing is pushed, merged,
released or deployed; a release is a later owner decision (148a: "Releases still need the owner's explicit yes").

## Authority and scope

- **161a** (owner answer to question 161, 2026-10-22), from lesson #49 (category `missing_sources`, filed through the
  connector at 15:39 UTC against HRP 20.6.29): the lesson's two sentences go into HRP word for word, and its three
  invented cases become test cases.
- Those two sentences are the only new rule text. The lesson's further expected behavior (evaluate the substantive
  proposition apart from incidental wording errors; evidence of harm for one outcome does not automatically refute
  evidence of benefit for another) is in the cases' pass criteria, not in a rule.
- No other protocol text changes. Universal stays 20.5.46.
- No paid model call and no provider call.

## Why

The lesson's failure: "A source audit issued a decisive credibility judgment without checking the author's contextual
reply and supporting reference. It treated evidence for one outcome as disproving evidence about another, and a side
wording error as refuting a separate testable claim."

## Protocol wording (approved word for word)

HRP 20.6.31, revision date 2026-10-22. In `SourceVerificationAndCitationAudit`, right after `WholeReportAudit`, a new
rule `<Rule name="SocialMediaWholeThreadAudit" priority="Critical">`:

> When grading scientific or medical claims from social-media posts, evaluate the author's complete thread—including
> replies, attachments, corrections, and cited research—before reaching a credibility verdict. Inaccessible material
> must leave the audit incomplete rather than support a definitive negative judgment.

It is formatted like the rules around it: the opening tag on its own line, the text wrapped at 118 columns with three
spaces of indent, the closing tag on its own line, and a blank line on each side.

## Where it goes, and why

`load_protocol` serves exact canonical bytes in pages of 40,000 bytes. Its index lists HRP's 60 sections with a
summary of each; `core` loads the seven core sections in one call, which every research answer does first (loading
them one at a time took up to 31 calls before any research in the 15 Oct regressions); every other runtime section is
loaded by name when the question needs it (`Architecture/NotFlatMerge`: "Load and apply the smallest set of modules the
actual question needs"), and a named rule or case can be loaded on its own.

- **Not the core.** After 149a the core is 39,952 bytes, served as 39,964 with the separators: 36 bytes short of a
  second page. The rule is 400 bytes, so in the core it would make every research answer's first protocol load two
  pages, for a task only some questions have: grading the claims in a social-media post.
- **`SourceVerificationAndCitationAudit`.** It is the module that verifies "what each source is and can establish,
  and that each citation supports its exact claim", the work a fact-check or evidence critique of a post needs. Its
  source hierarchy already places social media in tier 4 ("evidence of what someone said, not population proof"), and
  it holds a rule for each kind of source that must be read beyond its surface before it is judged: public-facing
  summaries, books, abstracts, and a user-supplied report (`WholeReportAudit`, audited whole). A social-media thread is
  one more, so the rule goes right after `WholeReportAudit`. The section stays one page (11,028 to 11,430 bytes).
- **A rule of its own, not a sentence added to a rule.** No existing rule is about social-media posts:
  `WholeReportAudit` is about a user-supplied multi-claim report, the tier-4 entry is a definition, and
  `NonexistenceVersusNotFound` (in `PremiseIntegrityAndTruthPriorityGate`) would hold only the second sentence. A named
  rule can be loaded by its name and keeps one concern in one place (`Architecture/SingleSourceOfTruth`).
- **Not `CrowdSourcedAndClinicalSignalAudit`.** That module samples and weighs firsthand reports of what an
  intervention did (forum signal). The lesson is about the credibility of an author's own scientific or medical claims
  and the research they cite, which is source verification.

## Stress cases and regression cases

Each prompt is one of the lesson's own invented cases, in its words. Each expected behavior starts with that case's
requirement, in the lesson's words, and adds the part of the lesson's expected behavior that bears on it. They follow
`ObservationNotProvocation`, question 152's last case.

- `AuthorReplyBeforeVerdict` (case A): "An ambiguous claim appears in a post but the author's reply contains a study
  defining its population." Grading must remain incomplete until that reply is read; the claim is graded for the
  population the study defines, keeping its scope and uncertainty; an unreadable reply or study leaves the audit
  incomplete, with no definitive negative judgment from the post alone.
- `MistakenLabelNotFalseMeasurement` (case B): "A post uses a mistaken technical label but makes an independent
  measurable assertion." The label is corrected without being treated as proof the measurement is false; the assertion
  is evaluated on its own evidence, apart from the wording error, and evidence of harm for one outcome is not taken as
  refuting evidence of benefit for another.
- `CompleteThreadNegativeVerdict` (case C): "A fully read post and its replies make an unambiguously false
  assertion." A negative verdict grounded in the complete material is allowed and said plainly; it is not withheld,
  nor the audit called incomplete, when nothing relevant is missing.

`docs/owner-regressions.md`: "Lesson #49 (question 161)", one row per case, before "Earlier owner cases".

## Records and tests

- A Critical revision note for 20.6.31 at the top of the revision history: "Owner-approved, answer 161a (2026-10-22),
  from lesson #49, in which a source audit gave a decisive credibility verdict on a social-media post without checking
  the author's reply and supporting reference: added SocialMediaWholeThreadAudit to SourceVerificationAndCitationAudit,
  right after WholeReportAudit and outside the core, with stress cases AuthorReplyBeforeVerdict,
  MistakenLabelNotFalseMeasurement and CompleteThreadNegativeVerdict."
- A reversible edit fixture, `tests/fixtures/protocol-edits/2026-10-22-owner-question-161-hrp.json` (4 edits), chained
  from question 149's HRP 20.6.30; the undo chain in `tests/helpers/undo-read-depth.ts` undoes it first.
- `tests/owner-question-161-protocol-2026-10-22.test.ts` rebuilds the edits from the approved wording and reverses the
  file byte for byte, and checks the rule's exact text (each sentence once in the file), its place right after
  `WholeReportAudit` and its shape, that it is outside the core in a runtime section of one page, what `load_protocol`
  serves (the rule, its section, each case, and the core, unchanged on one page), each case's prompt and expected
  behavior word for word after question 152's cases, the pass criteria in the cases and in no rule, the revision note,
  the line widths, each changed section's exact growth, and that Universal is unchanged.
- The question 149 layer test now rebuilds HRP 20.6.30 from the current file, as the question 152 and 153 test did
  when 20.6.30 arrived.
- Current-version pins: `README.md`, `scripts/instruction-layering-profile.json` and the tests that pin the current
  HRP manifest. Records of past releases are unchanged.

## Sizes and fingerprints

- HRP: 616,546 to 619,007 bytes (+2,461: the revision note +520, `SourceVerificationAndCitationAudit` +402,
  `StressTestExpectations` +1,539), SHA-256 `b7c1df6eb235bcd1423e4d8fdb86245887e3cd0eac3f469f6cc91619a5c91ef8` to
  `29269d656e73c70b541226023b58b294e583188c721481c043d53f900ee0a8b5`.
- HRP core: unchanged, 39,952 bytes, served as 39,964 of the page's 40,000: one page, with 36 bytes left.
- `StressTestExpectations` stays four pages and `RevisionHistory` two; both are maintainer material (`runtime: false`).
- Universal: unchanged, 20.5.46, SHA-256 `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e`.

## Tests run

- `npm run verify` (typecheck, the full test suite and build) with Node 24.18.0 passed: 275 test files, 274 passed
  and 1 skipped; 4,427 tests, 4,421 passed and 6 skipped. The new test file's 9 tests all passed.
- `npm run test:site` passed (4 pages); the public site shows no protocol version.
