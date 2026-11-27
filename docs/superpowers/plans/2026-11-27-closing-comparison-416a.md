# The closing comparison counts what was read and shows the paper's sentence (owner answer 416a, 27 Nov 2026)

Owner answer 416a (24 Nov 2026, "both changes"): build both behind a switch, measure them on the owner's saved questions,
then ask the release question. Status (27 Nov): built on `claude/closing-comparison-416a-20261127`, stacked on #520's
branch, switch off, not released, not measured.

## The decision

Question 416 named two faults in the owner's saved answers. A "confirmed" whose only proof was the answer's own sentence:
a magnesium note said a full-text audit confirmed that acute kidney injury slows magnesium clearance, and that paper
never mentions acute kidney injury. And "did not check" said of points the research had read about: in ten saved answers
11 of 47 points, 5 to 8 of them looked up in abstracts, partly read papers, reports or web pages. The owner chose both
changes, with their stated costs: a point can rest on an abstract, and the note gets longer. Reports and web pages still
don't count; comments, threads and "nothing found" points stay as they are; nothing new can stop an answer; no app needs a
refresh.

## What is built

`apps/research-mcp/src/closing-comparison.ts`, the note in `research-finalization-gate.ts` (`plainAnswerNote`), the lookups in
`register-tools.ts`, and the registration's passage in `research-contributor-access-tool.ts`. The behavior, its limits and
the notes are in `docs/final-check.md` (owner answer 416a's paragraph); the decision in `docs/design-decisions.md`.

1. **Counting.** A paper behind a point counts at the deepest reading its verified receipts show: an audit (as before), a
   full text read to its end (`full_text_read`), or an abstract (`pubmed_record` with one). "from the abstract of 1 study",
   "from the full text of 1 study, methods not audited". Each paper once, by any of its identifiers.
2. **The sentence.** `source_sentence` in each entry of `plain_answer_comparison`'s later form (at the top level or in
   `later_inputs`), looked up once the check passes with the source lines' exact matcher, in the text AskRigor holds for
   each of the point's papers, under the source lines' deadline. Found in a text AskRigor fetched: shown, and "This
   research confirmed that". Otherwise: "The AI says this research confirmed that".
3. **The switch.** `ASKRIGOR_CLOSING_COMPARISON`: off (default, and any other value), trial, dev or on, as #520's three
   switches; in trial, a dev account's test window turns it on with `closingComparison: true`
   (`manage_research_access` action `set_research_trial`, `later_inputs.researchTrial`), a setting a window may leave out.
   Off, every result is as before: `tests/closing-comparison-off.test.ts` compares seven calls with the results recorded
   on the commit before the switch.

A deliberate difference from the brief's wording: the sentence is matched as one or more whole sentences of the paper
(the source lines' rule), not as any containment, since containment lets a part of a sentence that leaves out its
negation through, the failure #417's review found in the source lines.

## The measurement before the release question

On the owner's saved answers (the owner's private pages, `askrigor/runs/`: the ten behind question 416, saved 21 to 24
Nov), offline, with the branch's own functions:

1. Rebuild each final check: the runner's notes keep the receipts' tokens, whose claims are re-signed with a test secret
   at their own times; `plain_answer_comparison` is rebuilt from the saved note and the answer's citations (the entries
   themselves were never kept, so sources are the measurer's reading, a limit to state).
2. For each point resting on a paper, the paper's own sentence, copied from the text AskRigor's free readers fetch again
   (open full text, PubMed abstract), as an AI following the registration's passage would give it.
3. Run each check with the switch off and on (lookups through `lookUpComparisonSentences` on the refetched texts) and
   count: points the off note credits as checked that the on note gives as "The AI says" (the false "confirmed", the
   magnesium point the known one); "did not check" or "did not show what backs" points whose papers were read in full or
   as an abstract, and how many the on note now credits; sentences found and refused; the note's length; and that status,
   steps, limits and receipts never change.
4. Then a test round in the owner's ChatGPT with a trial window on a dev account, after a deploy the owner approves, to
   see whether the AI gives `source_sentence` at all: 3 or 4 of the same questions, the switch on and off.
5. The release question with those numbers.

## What is not done

- The measurement above and the release question.
- The published `plain_answer_comparison` still names only audited studies and has no `source_sentence`; that waits for
  the next tool-list change (`docs/tool-list-changes-waiting.md`).
- The meaning judge's rubric is unchanged: it still judges whether a change's sources back it, now also for points
  resting on an abstract or an unaudited full text.
