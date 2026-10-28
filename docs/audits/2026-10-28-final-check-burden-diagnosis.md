# Why the owner's bug reports keep coming back: the final check's burden (28 October 2026)

The owner, 28 Oct 2026, answering question 192 (the ChatGPT app directory) with c: "askrigor is still not very good i
don't think it's worth releasing yet. it still often fails its own checks and doesn't explain why and people will be
emailng me nonstop with bug reports. i've been filing many of the same bug reports and so far we haven't been able to
fix most of them".

This record answers the recurring-finding check (AGENTS.md, "Pre-reasoning epistemic routing"; UDA
`patterns/reasoning-selection.md`) and the no-progress review (UDA `patterns/outcome-advancement-and-strategy-efficacy.md`
sections 5.2, 9.2 and 11.1) for that complaint. The decision it leads to is owner question 193.

## What was measured, and how

Every number below is an exact count by a script over the Codex event logs of the owner regression runs (and, for
28 Oct, the 29 Atlas lane runs), all through the owner's ChatGPT AskRigor app. The logs are private and stay on the
maintainer's laptop under `/home/joel/askrigor-releases/<run>/regress/logs` (lane runs:
`/home/joel/askrigor-releases/20261027-next/lanes/logs`). The scripts are in
`/home/joel/askrigor-releases/20261027-next/diag/`:

- `finalize_stats.py`: each `finalize_research` result's status, whether its inputs failed validation (the check did
  not run), its `next_step_kinds`, and the calls up to a run's first pass;
- `step_texts.py`: the next steps of every `not_ready` result, by kind, with numbers and quotes blanked;
- `arg_keys.py`: the top-level fields the AI filled in per call;
- `harm_values.py`: the values sent in the most-failed field;
- `history.tsv`: each regression case's verdict in the judgments of 22, 23, 26 and 27 Oct (parsed from
  `docs/audits/2026-10-2{2,3,6,7}-owner-regressions-judgment.md`).

A "step" is one problem named in one result, so a problem repeated over rounds counts each time.

## The final check, run by run

| Run (build) | Fields filled per call | Calls to the first pass (median) | Calls whose inputs failed before the check ran |
|---|---|---|---|
| 15 Oct | 19.0 | 4 | 0% |
| 16 Oct | 22.8 | 4 | 0% |
| 17 Oct | 24.6 | 3 | 0% |
| 20 Oct | 28.4 | 4 | 11% |
| 21 Oct | 29.3 | 4 | 21% |
| 22 Oct | 32.7 | 4 | 22% |
| 23 Oct (`1582f06`) | 36.5 | 5 | 19% |
| 25 to 26 Oct (`ea672a3`) | 36.2 | 5 | 23% |
| 26 Oct (`ddba2b7`) | 37.7 | 5 | 20% |
| 27 to 28 Oct (`0a315a9`), regressions | 39.2 | 5 | 21% |
| 28 Oct (`0a315a9`), lane questions | 37.9 | 5 | 22% |

In the two runs of 27 to 28 Oct (124 research runs, 663 final-check calls):

- the check passed on its first call in 1 run of 124, and never passed in 12 (11 stopped at the round limit);
- 476 calls (72%) came back `not_ready`, and 140 (21%) failed on their inputs before the check ran;
- of the 3,904 next steps the check gave, 376 (9.6%) asked for more research. The rest asked for paperwork:
  1,561 (40.0%) a declaration (most often a list that was missing: `proposed_tests`, `user_observations`,
  `key_terms`, `mechanism_claims`, `another_pass_estimate`, `open_leads`, `scale_results`), 987 (25.3%) exact
  wording in the answer (caveats copied as written, terms explained in a set way), 966 (24.7%) input format, and 14
  other;
- 462 of the 966 input steps were one field: `harm_screen[].sources_searched`, where the AI wrote "PubMed",
  "pubmed_case_reports" or "Europe PMC searches" and the list wants `case_reports`, `label` and the like. Values
  outside the list appeared in 60 of the 365 calls with a harm screen, and each such call stopped the whole check;
- a delivered answer whose check never passed ends with a reason too short to act on: "some of its statements were
  not checked" (3), "a research step kept failing" (4), "research this answer needs is unfinished" (4), or the first
  two together (1). An answer given right after an input failure must end "the check could not run"; none of these
  runs ended there.

## The owner's bug reports, as regression cases

85 cases, judged in four runs since 22 Oct (`history.tsv`):

- full passes: 23 of 64 judged, then 38 of 78, 36 of 78 and 41 of 84. The rate rose once, then stayed flat through
  three fix cycles;
- 31 cases passed in both of the last two runs; 31 cases never fully passed in any run they were judged in;
- 44 of 219 consecutive pairs of verdicts (20%) changed from one run to the next; between 26 and 27 Oct, 5 cases
  became full passes and 5 stopped being full passes. With one run per case, most "better" and "worse" counts are
  within run-to-run variation.

## Diagnosis

**The class:** a research turn fails AskRigor's own final check again and again (median five calls), mostly for
paperwork, and the owner's reports about research judgment keep failing their regression cases.

**The mechanism and its fit:** since mid-October, nearly every lane item and lesson was adopted as a new declaration or
wording rule in `finalize_research` (`docs/suggested-fixes-ledger.md` shows the pattern: "a checked declaration",
"the final check requires", "finalize_research's absence_claims gains"). Code can decide exact things: that a list is
present, that a sentence is copied, that a number appears in it, that a receipt was signed. It cannot decide whether the
research was good: whether a study was missed, a question drifted, or a comparison was fair. So a report about research
judgment became a declaration the AI fills in to pass. Filling it in leaves the research as it was, so the cases keep
failing in part, while each rule adds paperwork: the fields per call doubled (19 to 39), the calls to a pass rose (3 to
4, then 5), and one call in five now fails on format. This is the recurring-finding check's case (a fix that adds
another rule to a list is a local exception, not a repair) and the requirement-accretion case (UDA
`patterns/owner-goal-followup-and-requirement-accretion.md`): added controls degraded the path they were meant to
protect.

**Strategy state:** the strategy "judge a run, add or tighten final-check rules for its recurring classes, release,
run again" is `REPLACEMENT_REQUIRED` for research-judgment classes: its mechanism was present through three cycles
while the direct outcome stayed flat (section 5.1, step 1, `ALREADY_FALSIFIED`). It remains suitable for exact
classes, such as a quote that is not in its source or a receipt that does not match.

## What changes, pending owner question 193

Held now: no new final-check rule for a research-judgment report until question 193 is answered.

The proposal put to the owner:

1. only a short, named list of exact checks blocks an answer, each one protecting a reader from being misled; the
   list goes to the owner before it is built;
2. the other rules stop blocking: what they find is returned once as notes and stated limits, not as another round;
3. no format slip stops the check: near-miss values are read, each part is checked on its own, and every problem
   comes back in one reply that says, in words a reader can act on, what did not pass and why;
4. reports about research judgment go into HRP's text and the regression list, and a case counts as fixed when it
   passes two runs in a row.

**Signals that would show it worked**, predeclared for the first regression run after it ships: most checks pass by
their second call; fewer than 4 of 124 runs never pass; no call fails on format; and the full passes on the regression
list stay at 41 of 84 or above.

## Limits

- The counts come from Codex runs through the owner's ChatGPT app. The owner's own chats in ChatGPT may differ: there,
  an error result without structured content shows only as "The tool failed internally".
- A next step's kind is the server's own label (`next_step_kinds`); a label can be coarse.
- The judgments were written by Claude helpers against the owner's criteria; they are judgments by meaning, not exact
  counts.
