# The meaning judge's validation on #394's run (owner answer 221), 4 Nov 2026

## What was measured

- **The judge:** `apps/research-mcp/src/meaning-judge.ts` with the rubric frozen at `2026-11-02.6` after development
  (`2026-11-02-meaning-judge-development.md`), `claude-opus-5-5` at effort `low`, run by
  `scripts/measure-meaning-judge.mts` from the code as it stood when the rubric was frozen (`b08bdc19`). The rubric on
  main has since become `2026-11-04.1` (the source line's job); it was not used here.
- **The data, validation only:** #394's regression run (`/home/joel/askrigor-releases/20261101-394/regress/`), each
  turn's last passing `finalize_research` call: 111 calls. Nothing in the rubric's development had read this run.
- **Calls and spend:** 111 calls in three stages set before results (20, then 76 on 3 Nov, then the 15 left on 4 Nov),
  all answered; none was cached, timed out, refused or unreadable. USD 3.20 in all (USD 2.84 on 3 Nov, USD 0.36 on
  4 Nov, each day under owner answer 221's USD 3), USD 0.029 a call on average (highest 0.069). Wait per call: median
  6.0 s, 90th percentile 12.0 s, longest 22.9 s.
- **The labels:** the judges' verdicts on that run (`judge-b9e658e2/verdicts-00.md` to `verdicts-05.md`), read by six
  helpers that did not see the judge's output. Each copied, with the verdict's own words, every place the verdicts
  said a plain-answer comparison item's sources do or don't back its claim, a limit doesn't apply or matters, a card
  finding stands or doesn't stand on its own, or a finding rests on YouTube comments: 482 labels. A seventh helper,
  also without the judge's output, matched each comparison label and each "doesn't apply" limit label to the check's
  item (128 of 134 matched; the 6 others name items the judged check did not list, such as an item with no source).
  Each match records whether the verdict judged the item's sources or only how its quote shows the claim, and whether
  a limit was called inapplicable or only unimportant to the reader.
- **Not covered:** card saving was off for the whole run, and the verdicts judge no card finding, so jobs 1 (findings
  resting on YouTube comments) and 4 (findings that stand on their own) have no labels here. Their flags were read by
  hand instead (below).

## Results

| Job | Items the judges assessed | Agreement | Problems caught | Sound items flagged |
|---|---|---|---|---|
| 2. Comparison backed (sources) | 90 | 68 of 90 (76%) | 21 of 35 (60%) | 8 of 55 (15%) |
| 3. Limit applies (premise) | 9 named as not applying | 1 of 9 caught | 1 of 9 | 2 of the judge's 16 flags contradict a judges' label |

Development on #393's run, for comparison: job 2 agreed on 33 of 35 (18 of 19 caught, 1 of 16 flagged) and job 3 on
13 of 14.

- **Job 2, where the two sides differ.** The judge accepts a source that examined something near the claim: another
  preparation, part of the claim, the tissue or the population next to the one claimed (about nine of its 14 misses).
  It also accepts a declared search that found nothing as backing, as it was built to, including one declared only to
  pass the check (2 misses). In the other direction it refuses points that rest on guidance or definitions credited to
  a study, which the judges accepted as backed in meaning (5 of its 8 false flags). The judges are not consistent on
  these two questions either. The 25 labels that judge only how an item's quote shows its claim fall outside the job;
  the judge's verdicts agree with 19 of them.
- **Job 3.** The judge flagged 16 of 1,277 limits. Twelve hold: one matches a judges' label, and 11 read by hand state
  something the answer contradicts. Seven say no one in a community described their own use where the answer reports
  people who did. The others say a community's pages could not be read where the answer read them, call a harm's
  frequency unquantified where the person supplied it, treat a pasted study abstract as pasted community reports, or
  attach the self-test limit to a proposed trial. Two are borderline (a neighbouring condition's reports; a symptom
  record kept for a clinician). Two contradict the judges, who said the self-test limit fits there.
  It missed 8 of the 9 limits the judges named as not applying: three limits about a community ("reports not
  included", "only one community") that the answer contradicts and two self-test limits on symptom diaries, the same
  kinds as some of its flags; two not-found limits on answers that claim nothing is absent; and one limit whose wording the server had made
  out of date, which the judge cannot know. Four limits the judges called true but unimportant to the reader were not
  flagged, which is outside the job.
- **Job 1, read by hand.** 4 of 60 findings flagged. None rests mainly on comments: each mentions a comment review as
  context or among searches that found nothing. The rubric resolves doubt toward "rests", which would hold such
  findings: the safe direction for owner answer 219b, at the cost of findings that could have been shown.
- **Job 4, read by hand.** 66 of 192 findings flagged (34%). A sample of eight all refer back to the research ("the
  trial", "the study") or are caveats whose "whom it applies to" describes the research, as in development.

## What it comes to

- **Job 2 does not hold up on new data.** Agreement fell from 33 of 35 in development to 68 of 90, and both its misses
  and its false flags follow two questions of strictness the rubric was tuned on #393's labels to settle. As a note it
  would be wrong on about a quarter of the items a judge would check; it is not fit to stop an answer.
- **Job 3's flags are mostly right, but it finds few of the problems.** As a note it adds information the judges
  missed in eleven places, and it is no substitute for them.
- **Jobs 1 and 4 are not validated.** They need a run with findings cards judged, or a labelled set of cards.
- **Nothing changed for users:** production's judge is off (`runtime.env` has no `ASKRIGOR_MEANING_JUDGE` line).
- **Next, if the judge is pursued:** #394's run is now development data. Revise job 2's rule on near-miss sources and on
  guidance-derived points, and job 3's consistency on the kinds it missed; freeze the rubric; validate on the next
  regression run, which nothing has read. Turning the judge on, even for the owner's dev accounts, stays the owner's
  decision.

Total spend on the judge: USD 16.30 in development and USD 3.20 in validation, of the owner's monthly Claude API
credit. The labels, matches and the judge's outputs hold answer text, so they stay outside the repository (this
session's scratchpad). No comment text, comment-derived count or key material is recorded here.
