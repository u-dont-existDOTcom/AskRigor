# What people want: the source line, the answer rules and two answer shapes

Branch `claude/what-people-want-20261104`, from #398's head `ac0ac3c3` (owner answer 237a, 4 Nov: "237 a"). #398 went out
on 4 Nov (owner answer 240a), and this branch now holds main. The owner approved the protocol wording as written and
left a quote not found as a note ("239 a1"). Nothing here is released: its release needs the owner's words naming it. The reasons are in the owner's private report on what people
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
3. **HRP 20.6.37, draft wording**, for the owner's approval before any release: `SourceLineBesideKeyClaim`,
   `CountsOutOf100WithEvidenceGrade`, `BottomLineEvenWhenUncertain`, `DoubtInFirstPerson`, `WhenCareIsOutOfReach`,
   `TestItYourselfEnding` and `FindingsCardForAPerson` in `OutputFormatting`; the `what_could_this_be` mode in
   `AnswerShapeController`; who paid for each key study in `StudyReadDepthDisclosure`; and, from the owner's request to
   improve how a person's question becomes research, a person's list as branches in `QuestionDecomposition` (RO2). The
   recorded edits are
   `tests/fixtures/protocol-edits/2026-11-04-what-people-want-hrp.json`.
4. **The reminder names `OutputFormatting`.** The core has 48 bytes free, so nothing new can go in it, and
   `OutputFormatting` isn't in the core. Every research result's reminder now names that section. It reaches the AI before
   it writes, which the final check's runtime description would not: that arrives with the first check of a finished
   draft.

The note that asks a research account for a findings card now says to send none when no finding passes, or it would pull
against `FindingsCardForAPerson`. The nine ChatGPT lanes showed the need: their published cards mostly repeat a quick
answer, and each pass's card replaced the last, because one research target is one research thread.

The wording changed from what question 237 described in one place: `what_could_this_be` asks its questions with a
one-line provisional answer, because `HealthFollowUpInformationGain` already asks for that and `ReaderFacingAnswer`
leads with the answer.

## Added after the owner's 240a and 239 a1

- **Saved cards wait for a test.** A finding a free contributor's save publishes is kept for AskRigor's research, with the
  reason `waiting for the quick-answer test (owner answer 240a)`, until a separate AI's quick-answer test shows it
  (`docs/atlas-quick-answer-test.md`). The research lookup still finds it. A held finding stays held, and a card the
  owner publishes shows at once.
- **A later card replaces an earlier one only on the same question.** The research thread stays the person's whole
  research, because `forget_card` finds their saves by it; each new card's marker adds its question's hash, and a card
  without one is never replaced.
- **The pages say so.** The Atlas home and the status block no longer say a finding is published as soon as it's saved.
  The two tool descriptions that do wait in `docs/tool-list-changes-waiting.md`.
- **Lessons 53 and 52** (owner rule 148a): `ResultThatChangesWithDose` and `SignIsNotADiagnosis` in OutputFormatting.
  Lesson 52 named `RelevanceBeforeWarning`, but that rule is in the core, which has no room, and the failure came before
  any rule was loaded, so a rule alone can't fully prevent it.

## Limits

- A quote found shows the words exist, not that they are fair. Whether they back the claim is the judge's, where it's on.
- AskRigor holds a full text for an hour after its last read, in memory. A check after that leaves those quotes unchecked
  and says so; reading the paper again restores them.
- A source with no full text held and no PMID has nothing to look in.
- A quote copied from a table or a figure caption is looked up as the fetched text gives it, which may differ.
- `TestItYourselfEnding` and `what_could_this_be` are protocol text only: no check looks at them, and no run has tested
  them yet.
- If keeping a saved finding fails, it stays on the pages until the next test run finds it. A failed keep never fails
  the save.
- The test is one quick AI's answer, read by another AI that has seen the card, so a pass means "missed by this search".

## Before a release

1. The owner names the release of this PR.
2. On release: HRP 20.6.37's manifest, plugin and connector receipts as for #394. `source_lines` is a later input, so the
   tool list doesn't change and no app needs a refresh. No migration and no role-script change.
3. Start the quick-answer test as a scheduled task on the owner's Claude plan, from `docs/atlas-quick-answer-test.md`.
4. Run real answers through the source line on the owner's dev account: a quote found, a quote not found, an expired text.

## Lesson closeout

`npm run lessons:status` at 12:33 UTC on 4 Nov: 36 open, 2 needing review, 1 accepted but not incorporated, 38 incorporated
or closed, none eligible for deletion, and no lane items unrecorded. The two needing review were about weighing an adverse
result in a dose-response study and the safety of soaked legumes, and both are now accepted and built here (lessons 53
and 52). They are marked incorporated when this PR is released.

One point of method, recorded here, so no new lesson is filed: a word search of the protocol isn't enough to say it lacks a
rule. Two rules were missed that way, because one is a `Condition` and the other doesn't use the word searched for, and the
owner was told of gaps that were narrower than they sounded. Read the rules that could cover a topic, and say where they
stop.
