# Owner answers 152a and 153a, 153b, 153c: HRP 20.6.29 and Universal 20.5.46

Date: 2026-10-21. Status: **BUILT on a local branch, for the next build.** Nothing is pushed, merged, released or
deployed; a release is a later owner decision (148a: "Releases still need the owner's explicit yes").

## Authority and scope

- **152a** (owner answer, 2026-10-21), from lessons #47 and #48: one sentence at the end of each of the core rules
  `HealthFollowUpInformationGain` and `RelevanceBeforeWarning`; each lesson's own invented case as an HRP stress case
  and an owner regression case.
- **153a, 153b, 153c** (owner answers, 2026-10-21), from bug reports AskRigor#355 (153a) and #356 (153b, 153c): one
  sentence at the end of each of HRP's `TreatmentSpaceInventoryBeforeSelection` and `NNTAndNNH`, and a clause in
  Universal's serious-harm sentence. Their regression cases already exist in "The OCD treatment comparison"
  (`docs/owner-regressions.md`), which this change does not edit.
- No paid model call.

## Protocol wording (approved word for word)

HRP 20.6.29, revision date 2026-10-21:

- `HealthFollowUpInformationGain` (core section `HeterodoxEpistemology`). The rule is one line, so the sentence goes on
  it, one space after "... before elaborating a mechanism.":

  > When a symptom's onset or course is unknown and could reorder the explanations, ask early whether it began recently or long ago and whether it has changed, without pressing for a date or reading an approximate answer as a lifelong pattern, and prefer one question that could reorder several explanations to a series of questions that each test one.

- `RelevanceBeforeWarning` (core section `EpistemicSafetyRules`), right after the owner's 126a sentence ("That an
  experience can be a symptom of a disorder does not make it, or paying attention to it, a cause of that disorder: ..."):

  > When a familiar, stable symptom comes with an activity the person must do anyway, recording ordinary episodes is observation, not provocation: caution only against extra or intensified repetitions and pushing through worsening, and advise avoiding the activity only for a risk shown for it, with a practical alternative.

- `TreatmentSpaceInventoryBeforeSelection` (`TreatmentLandscapeAndVideoSelectionGate`, outside the core), at the end:

  > The same inventory governs the study search and any comparison or ranking, in a first pass too: search each materially plausible class by name at least once, or say in the answer that it was not researched.

- `NNTAndNNH` (`StatisticalAndClinicalInterpretation`, outside the core), at the end:

  > Give an NNT or NNH with both groups' rates and the follow-up beside it, rounding the reciprocal up, and beside a benefit figure give the harms measured over the same follow-up, or say that none were found.

Each sentence that ends a wrapped rule starts a line of its own, wrapped at 118 columns, as questions 126's and 130's
did.

Universal 20.5.46, revision date 2026-10-21, in the core section `health_labs_supplements_environmental_health`: the
sentence that began "When asked how safe an exposure is, or which option is safer, list the serious harms ..." now
begins "When asked how safe an exposure is, or which option is safer, or when the answer ranks or puts forward a
medicine likely to be taken for months or years, list the serious harms ...". The rest of that sentence and everything
after it are unchanged.

Stress cases `OnsetBeforeMechanisms` (#47) and `ObservationNotProvocation` (#48), from the lessons' own invented cases,
follow `SeriousOrganHarmOralMedicine`, question 128's last case.

## Records and tests

- A Critical revision note at the top of each file, naming the answers and the reports.
- Reversible edit fixtures `2026-10-21-owner-questions-152-153-hrp.json` (7 edits) and
  `2026-10-21-owner-question-153-universal.json` (3 edits), chained from question 125's HRP 20.6.28 and the book-review
  layer's Universal 20.5.45; the undo chain in `tests/helpers/undo-read-depth.ts` undoes them first.
- `tests/owner-questions-152-153-protocol-2026-10-21.test.ts` rebuilds every edit from the approved wording, reverses
  both files byte for byte, and checks each sentence's place, the stress cases, the revision notes, the line widths,
  each changed section's exact growth, both cores on one page, and what `load_protocol` serves.
- The question 125 and book-review layer tests now rebuild their layer's result from the current files, as question
  109's test did when 20.6.28 arrived. The book-review server check names 153c's clause, because the server serves the
  current file.
- Current-version pins: `README.md`, `scripts/instruction-layering-profile.json` and the tests that pin the current
  manifests.

## Sizes and fingerprints

- HRP: 611,879 to 615,849 bytes, SHA-256 `a38e3e76b0983f9d4545325a90c6e14b76d087750600ce99623b3ec4aa22cef4` to
  `a72aed35746b86b084398cdb92fa1d36dac2d2941b31feea34e242678cf49b79`.
- Universal: 212,384 to 212,875 bytes, SHA-256 `564c8697fdd4aa69f08b0ecba228ca47cc7dc3e022e6ef55d84ea14f86fb416e` to
  `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e`.
- HRP core: 38,935 to 39,614 bytes (+679: `HeterodoxEpistemology` +349, `EpistemicSafetyRules` +330). Served with
  the separators, 39,626 of the page's 40,000 bytes: one page, with 374 bytes left. A later core addition larger than
  that makes the HRP core two pages. The 153a and 153b sentences and the stress cases are outside the core.
- Universal core: 25,114 to 25,206 bytes (+92), served as 25,222 bytes, one page.

## Regression cases

`docs/owner-regressions.md`: "Lessons #47 and #48 (question 152)", one row per lesson, before "Earlier owner cases".
