# What people want: the source line, the answer rules and two answer shapes

Branch `claude/what-people-want-20261104`, from #398's head `ac0ac3c3` (owner answer 237a, 4 Nov: "237 a"). Owner answer
238b holds #398 and this build; nothing here is released. The reasons are in the owner's private report on what people
want from AI answers. Its top finding: people want the source to really say what the answer claims, and the final
check only proved that a paper exists and was read as deeply as declared.

## Built

1. **The source line** (`e6badaf8`). `finalize_research` takes `source_lines`, a later input (owner answer 189a keeps the
   published list fixed; this is the one optional field 237a added): the key source, the claim, the paper's sentence and
   its own conclusion, and the strongest thing against the claim. Once a check passes, `lookUpSourceLines`
   (`apps/research-mcp/src/source-lines.ts`) looks both quotes up word for word in the full text AskRigor holds, through
   the `handle` the `full_text_read`, `study_audit` and `review_audit` receipts now sign, or otherwise the PubMed abstract.
   The panel and the runtime `source_lines` say what was found and in which section. A quote not found is a note and a
   line in the panel, not a step, since the six blocking checks don't name it (`docs/final-check.md`). The final check's
   runtime description names the field to every AI.
2. **Meaning judge job 5** (`e6badaf8`). Whether a line's quotes back its claim, for the dev accounts where the judge is
   on. Rubric `2026-11-04.1`. It hasn't been run against real answers yet: the 15 validation runs left under owner
   answer 226b were planned for jobs 1 to 4, on #398's build.
3. **HRP 20.6.37, draft wording** (`493654de`, `3f53cb84`), for the owner's approval before any release:
   `SourceLineBesideKeyClaim`, `CountsOutOf100WithEvidenceGrade`, `BottomLineEvenWhenUncertain`, `DoubtInFirstPerson`,
   `WhenCareIsOutOfReach` and `TestItYourselfEnding` in `OutputFormatting`; the `what_could_this_be` mode in
   `AnswerShapeController`; who paid for each key study in `StudyReadDepthDisclosure`. The recorded edits are
   `tests/fixtures/protocol-edits/2026-11-04-what-people-want-hrp.json`.
4. **The reminder names `OutputFormatting`** (`3f53cb84`). The core has 48 bytes free, so nothing new can go in it, and
   `OutputFormatting` isn't in the core. Every research result's reminder now names that section. It reaches the AI before
   it writes, which the final check's runtime description would not: that arrives with the first check of a finished
   draft.

The wording changed from what question 237 described in one place: `what_could_this_be` asks its questions with a
one-line provisional answer, because `HealthFollowUpInformationGain` already asks for that and `ReaderFacingAnswer`
leads with the answer.

## Limits

- A quote found shows the words exist, not that they are fair. Whether they back the claim is the judge's, where it's on.
- AskRigor holds a full text for an hour after its last read, in memory. A check after that leaves those quotes unchecked
  and says so; reading the paper again restores them.
- A source with no full text held and no PMID has nothing to look in.
- A quote copied from a table or a figure caption is looked up as the fetched text gives it, which may differ.
- `TestItYourselfEnding` and `what_could_this_be` are protocol text only: no check looks at them, and no run has tested
  them yet.

## Before a release

1. The owner approves the wording on the owner questions page, and says whether a quote not found stops an answer. A
   change of wording goes through the recorded edits again and moves the version pins.
2. The owner names the release. #398 goes first, or the two together; this branch is based on #398's, so this PR retargets
   to `main` when #398 merges.
3. On release: HRP 20.6.37's manifest, plugin and connector receipts as for #394. `source_lines` is a later input, so the
   tool list doesn't change and no app needs a refresh.
4. Run real answers through the source line on the owner's dev account: a quote found, a quote not found, an expired text.
