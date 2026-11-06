# Lesson #51 and UDA #444: HRP 20.6.33

Date: 2026-10-29. Status: **BUILT on `claude/next-build-20261029`, from #384's head `b7cacdae`, for the build after
#384.** Nothing is merged, released or deployed. Owner rule 148a builds each triaged lesson on the next-build branch
without asking; a release needs the owner's explicit yes.

## Authority and scope

- **Lesson #51** (`privacy_or_safety`, filed through the connector at 14:42 UTC on 29 Oct against HRP 20.6.31, labelled
  accepted at about 17:29 UTC): an answer took a laboratory profile named in a research question as the asker's own,
  suggested tests for them on that basis, and was later told the profile was someone else's. Its part to change is
  `HealthEvidenceRoleLedger`.
- **UDA #444**, the suggested fix `2026-10-29-manifest-first-cross-section-reading`, marked as the owner's request:
  before saying that a long or versioned document leaves something out, or that a method would be new to it, identify
  the current version, say how much was read, look for the concept under other names across the document, and give an
  honest status. Triaged as adapt on 29 Oct (`docs/suggested-fixes-ledger.md`).
- Neither changes an evidence threshold or a clinical or scientific method, so 148a builds both without asking. No new
  declaration, required field or required caveat is added to `finalize_research` (owner answers 193a and 195a); both
  are protocol text and stress cases, judged by the model and by the regression runs.
- Universal stays 20.5.46. No paid model call and no provider call.

## Protocol wording

HRP 20.6.33, revision date 2026-10-29, SHA-256 `6bac4fc9d673cdd737975ef62f382f4a5ddeeb33e76986ecec9eeeecf7fd4dea`
(from 20.6.32, `62f9e0a934800ae0a6002d3b433ed2c640e0b8263b6891d7d897a2c0c49b9c89`; 4,211 bytes added).

At the end of `HealthEvidenceRoleLedger`, in `PatientHistoryAndRecurrenceEvidenceGate`:

> Record also whom each statement is about: the user, someone else, or a study's participants. A condition or test
> result named in a question is the topic to research, not the user's own, unless they say it is theirs; until they
> do, do not call it theirs or base a test or advice for them on it. When they say it is theirs, it is their own
> report, weighed as a claim (PromptPremisesAreClaims).

A new rule, `LongDocumentCoverageAudit`, in `SourceVerificationAndCitationAudit`, right after
`SocialMediaWholeThreadAudit`:

> Before saying that a long or versioned document leaves an idea out, or that the idea would be new to it, find the
> document's current version and say which version was read and how much of it. Look for the idea under other names
> across all its sections, including later qualifications, then say whether it is present, present but scattered,
> partly covered, not read, or absent after an adequate search. When proposing to add something, say what it would do
> that the document does not already do; when an adequate search finds nothing, say plainly that it is absent.

Six stress cases follow lesson #49's last (`CompleteThreadNegativeVerdict`) in `StressTestExpectations`: the lesson's
three (`TopicConditionIsNotTheAskers`, `SomeoneElsesConditionStaysTheirs`, and the control `OwnResultIsTheirReport`)
and three from #444 (`IdeaUnderAnotherHeading`, `OlderEditionRead`, and the true-absence control
`TrueAbsenceAfterFullReading`, which the item asks for so the rule doesn't become a habit of assuming coverage).

## Where it goes, and why

The rule the lesson's sentence most resembles, `UserObservationLedger`, is in the core (`HeterodoxEpistemology`), which
every research answer loads on one page. The core is 39,952 bytes of its 40,000-byte page, so no sentence fits there.
The lesson names `HealthEvidenceRoleLedger` as its part to change, and that rule is outside the core, in the section
that applies to "any health evidence-gathering dialogue". `LongDocumentCoverageAudit` sits beside the other whole-source
audits. The core is byte for byte unchanged. The two edited sections are 8,174 and 12,083 bytes, each well within one
page.

The item's other parts are already covered and are not duplicated: read depth is one of the five checks that stop an
answer (195a), full-text acquisition records its coverage, and absence claims are declared. Whether a passage means
the same as an idea stays the model's judgment; nothing here matches words.

## Regression cases

Seven cases in `docs/owner-regressions.md`, run from the build after #384:

- lesson #51: `l51-topic`, `l51-colleague` and the control `l51-own-result`, the lesson's cases with real markers;
- #444: `u444-current-edition` (NICE's ME/CFS guideline, whose 2021 edition reversed the 2007 one on graded exercise
  therapy), and three on a made-up eight-section guide written into the list: `u444-under-another-name`,
  `u444-older-edition` and the control `u444-true-absence`.

## Tests

- `tests/lesson-51-and-uda-444-protocol-2026-10-29.test.ts`: the sentences word for word and in place, the new rule's
  neighbours, the six cases word for word and in order, the core unchanged, the manifest, the revision first, and the
  recorded edits (`tests/fixtures/protocol-edits/2026-10-29-lesson-51-and-uda-444-hrp.json`) reversing to 20.6.32.
- `tests/helpers/undo-read-depth.ts`: `undoLesson51AndUda444Hrp`, chained under `undoOwnerAnswer193Hrp`, so every older
  layer's test still rebuilds its own bytes.
- The current-version pins (README, the instruction-layering profile, the report vocabulary and 29 test files) carry
  20.6.33 and its SHA-256.
