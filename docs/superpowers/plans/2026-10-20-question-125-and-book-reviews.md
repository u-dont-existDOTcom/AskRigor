# Owner question 125 (two names for one product) and book research with reader reviews

Date: 2026-10-20. Status: **BUILT on local branch `build-125a-book-reviews`, for the owner's review.** Nothing is pushed,
merged, released or deployed; release is a later owner decision. The owner's answers 126 to 137 and 128b extend the
same unreleased layer on branch `build-protocol-20261020b`: `2026-10-20-owner-answers-126-to-137.md`.

## Authority and scope

- **125a** (owner answer, 2026-10-20), from bug report AskRigor-lessons#38: asked whether two abbreviated peptide names
  meant the same product, the AI answered from chemistry alone, declared community evidence not relevant because the
  question had no real-world outcome, and the final check accepted that. A forum search the user asked for afterwards
  showed that people tell several variants apart but use the short names inconsistently. The approved parts:
  1. HRP: one sentence in `ForumSignalNonTrigger`, after its first sentence (below); a stress case from the report's
     example; the report as an owner regression case.
  2. The final check makes the skip visible: with `not_relevant_basis` `no_real_world_outcome`, the answer states "I did
     not search firsthand reports or community discussions for this answer: [reason]." with the reason the AI gave.
- **The owner's new Universal item** (2026-10-20), word for word, in the core section `sources`, with an owner
  regression case adapted from UDA's AskRigor lane item `2026-10-18-book-review-triangulation` (UDA #398, open there).
- Lessons #38 to #46 are under review; the lessons repository is not edited.

## Protocol wording (approved word for word)

HRP 20.6.28, revision date 2026-10-20, in `ForumSignalNonTrigger` (section `AnswerShapeController`, outside the core),
directly after "... or a topic with no meaningful user-experience corpus.":

> When the question is whether two product names or labels refer to the same thing, answer both parts: what the names mean chemically, from authoritative documentation, and how sellers and buyers actually use them, from vendor labels and buyer or specialist discussions; skip the second part only with a reason stated in the answer.

Stress case `ProductNameEquivalence`, after `ConditionsGiven`: a peptide sold as "NA-Peptide Z" while suppliers also
list "Peptide Z-amidate" and "N-acetyl Peptide Z-amidate"; the expected behavior is both parts, or a stated reason for
skipping the second.

Universal 20.5.45, revision date 2026-10-20, in `sources`, one line between the forum-signal line and the consilience
line (the one with "Reviews and forums detect discrepancies; they are not trials."):

> Book research should include reader-review evidence alongside primary-text reading, identifying practical difficulties, negative experiences, differences in usability, and criticisms that the author might not address. Reviews must be checked against the book, duplicates should not be counted as independent evidence, and self-selected reviews must not be mistaken for clinical outcome studies.

Why there: the line sits beside both pieces of guidance on reviews and forums (how forum reports are counted, with
duplicates and self-selection, and what reviews and forums can show), and question 50's tested-identity paragraph stays
directly after the consilience line, as its approved placement and test require.

Each protocol gets a Critical revision note. Reversible edit fixtures (`2026-10-20-owner-question-125-hrp.json`,
`2026-10-20-book-reviews-universal.json`) chain from question 109's layer; the undo chain, the pins and the layer tests
(`tests/owner-question-125-protocol-2026-10-20.test.ts`, `tests/book-reviews-protocol-2026-10-20.test.ts`) check every
approved sentence word for word and in place and both byte-exact reversals.

Sizes: the HRP core stays 38,208 bytes (one page; the rule is outside the core). The Universal core grows from 22,890 to
23,285 bytes (one page), `sources` from 5,847 to 6,242. These are this plan's changes alone; the sizes and fingerprints
of the whole layer, with the answers that extend it, are in `2026-10-20-owner-answers-126-to-137.md`.

## The final check (125, part 2)

- **Input:** the existing `not_relevant_reason`, already required with `not_relevant`, now documented in the input
  schema (both surfaces: ChatGPT's relaxed published schema and Claude's strict one derive from the same field) and in
  the tool description.
- **Caveat:** with `community_evidence` `not_relevant` and `not_relevant_basis` `no_real_world_outcome`, the server
  writes "I did not search firsthand reports or community discussions for this answer: " followed by the declared
  reason, its whitespace collapsed to one line and a period added unless it already ends a sentence. It is a limit
  (`ready_with_limits`) and a caveat, checked as the other caveats are: its own sentence, in prose a reader sees (not
  code, quotations or comments); an answer in another language gives its rendering in `caveat_renderings`. No word list
  reads the answer or the reason.
- **Reason in plain words:** the answer shows the reason, so a reason with internal labels (snake-case tokens,
  protocol names, internal phrases: the answer check's own detector) gets a next step naming them.
- **Privacy:** the reason is request-local like the other declarations: not stored or logged, not in the finalization
  receipt or the carried state, never saved with a findings card (`docs/privacy-data-map.md`).
- **Tests:** `tests/finalize-community-skip-caveat.test.ts`; fixtures of other checks that declare
  `no_real_world_outcome` now state the sentence (`tests/helpers/community-skip.ts`) and pass `ready_with_limits`.

## Regression cases

`docs/owner-regressions.md`: "Two names for one product (question 125)" and "Book research with reader reviews (owner
request, 20 Oct)", each with its prompt, pass criteria and fail criteria; both synthetic.

## Lane

`docs/suggested-fixes-ledger.md` records `2026-10-18-book-review-triangulation` as adopted (its row, from the 20 Oct
lane triage, also names UDA #409 and owner question 129's add-on sentences).
