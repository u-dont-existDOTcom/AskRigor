# The meaning judge's development measurement (owner answer 221), 2 Nov 2026

## What was measured

- **The judge:** `apps/research-mcp/src/meaning-judge.ts`, rubric `2026-11-02.6` (frozen), `claude-opus-5-5` at effort
  `low`, structured JSON output, the rubric first so the prompt cache serves it. One call per passing check, for the
  owner's dev accounts only; notes only, except that a finding it reads as resting on YouTube comments is held.
- **The data, development only:** #393's regression run (`/home/joel/askrigor-releases/20261101-393/regress/`), each
  turn's last passing `finalize_research` call (113 turns), read from the Codex event logs the way the server reads a
  check (`scripts/measure-meaning-judge.mts`). Added: two calls where the judges found a misfiring limit
  (`r382-five-months-300` call 3, and `o354-emergency-first` call 2, a not-ready call the server would not judge), and
  one synthetic bundle carrying Atlas publication P-1020's published claim and "whom it applies to" beside a finding of
  the same research that names its subject. #394's run was not read: it is kept for validation.
- **Two approximations,** because the run's receipts were signed by the production server and cannot be verified here:
  whether comments were read is taken from each call's `community_findings`, which the check requires whenever its
  receipts show comments were read; and the comparison entries the note credits are taken as those naming sources or
  whose sentence is a declared absence claim or a correction the research found.
- **The labels:** the judges' verdicts on #393's run (`judge-61215c0b/verdicts-00.md` to `verdicts-05.md`), as the
  known cases the task named: `n389-video-map`'s finding about commenters (and the finding with a video among its
  sources in `n389-forum-depth`); the unblinded-test limit where the judges called it ritual or clinical monitoring
  (seven turns) and where they said it mattered (two); the "different tissue" limit naming one tissue twice; comparison
  items the judges found backed by a source that does not fit, or sound (35 items in 20 turns; items they faulted only
  for restating the claim or for their outcome label are left out, since the job judges backing); and standalone-ness
  for P-1020 and two fragments like it, with two findings that stand.
- **Not covered:** the evidence-strength item the judges named (`r326-continue` turn 2) is a note, not a limit, and it
  had gone by that turn's last passing call; the judge reads the result's limits, as specified, not its notes.

## Tuning (development subset: 26 turns, the two named calls and P-1020's bundle)

| Rubric | Comparison: agree (caught, false flags) | Limits: agree (caught, false flags) | YouTube | Standalone | Cost of 29 calls |
|---|---|---|---|---|---|
| v2, low | 32/35 (17/19, 1 of 16) | 13/14 (8/8, 1 of 6) | 4/4 | 5/5 | USD 0.90 |
| v3, low | 30/35 (19/19, 5 of 16) | 12/14 (6/8, 0 of 6) | 4/4 | 5/5 | USD 1.15 |
| v3, medium | 29/35 (19/19, 6 of 16) | 12/14 (6/8, 0 of 6) | 4/4 | 5/5 | USD 1.45 |
| v4, low | 27/35 (11/19, 0 of 16) | 12/14 (6/8, 0 of 6) | 4/4 | 5/5 | USD 1.09 |
| v5, low | 31/35 (17/19, 2 of 16) | 13/14 (7/8, 0 of 6) | 4/4 | 5/5 | USD 1.17 |

- v2 listed only the limits it judged not to apply and named some it then said applied; from v3 it judges every limit
  with a yes or no. v3's rule that a sentence on a different point is not backed caught every faulty item but flagged
  five sound ones; v4's rule that a study backs what it did not test, and that a search result backs an item whatever
  it names, flagged none but missed eight. v5 keeps v2's backing rules, lets a video's comments or a forum thread back
  what such reports can show, and holds that a source an item names must still have examined its point. v6 adds, for
  standalone-ness, that the page shows the topic and subject above the claim.
- **Effort:** medium caught one more comparison item than low on v3 and added a false flag, for 26% more cost and
  about twice the wait (median 14.6 s against 7.9 s). The judge runs at low.

## The frozen judge on all 116 calls

- **Calls and spend:** 116 calls (113 turns, the 2 named calls and P-1020's bundle), all answered; none timed out,
  was refused or could not be read. USD 3.47 in all: per call USD 0.030 on average (median 0.031, lowest 0.003, highest
  0.058).
- **Wait per call:** median 6.9 s, average 7.3 s, 90th percentile 11.4 s, longest 20.5 s, against a 60 s timeout.
- **Tokens per call:** about 4,000 input tokens (at most 8,600), the 3,000-token rubric read from the prompt cache on
  every call, and about 650 output tokens (at most 1,560), of which about 130 are thinking.
- **Agreement with the known cases:**

| Job | Agreement | Problems caught | Good items flagged |
|---|---|---|---|
| 1. Rests on YouTube comments | 4 of 4 | 2 of 2 (`n389-video-map`'s finding about commenters, and `n389-forum-depth`'s finding with a video among its sources) | 0 of 2 |
| 2. Comparison backed | 33 of 35 | 18 of 19 (missed: `b-book-no-reviews`' first item, whose sentence is on another point than its claim) | 1 of 16 (`l30`'s search result, credited also to two studies the judges counted as fitting) |
| 3. Limit applies | 13 of 14 | 7 of 8 (the unblinded-test limit on clinical monitoring in six of seven turns, the same-tissue limit) | 0 of 6 |
| 4. Stands on its own | 5 of 5 | 3 of 3 (P-1020, and two other fragments) | 0 of 2 |

- **Over the 113 turns:** job 1 judged 86 findings in the 35 turns whose research read comments and flagged the same two
  findings; job 2 judged 69 of 260 credited comparison items not backed (27%); job 3 judged 23 of 1,402 limits not to
  apply (1.6%); job 4 judged 97 of 219 card findings not to stand on their own (44%).
- **The same rubric run twice** (the run before this one differed only in how an empty reason was read) gave the same
  comparison verdict on 250 of 265 items, 21 limit flags in common (27 and 25 in all), and 88 standalone failures in
  common (99 and 98). Borderline items move between runs: the unblinded-test limit on clinician-led tracking was caught
  in 6 or 7 of the 8 labeled cases across three runs.

## What it comes to

- **Job 1** catches the case owner answer 219b was about: a finding resting on commenters' reports whose sources list
  only studies. Its other negatives that mention reports or people were checked by hand; each rests on a trial or a
  review.
- **Job 2** agrees with the judges on the items they named, and flags about a quarter of all credited items, in line
  with their finding that many credits do not show their claim (arithmetic, guidance or a forum report credited to a
  study's audit). It cannot see what an audit recorded that the answer does not say (`l32` turn 1's 2021 audit), and
  it judges backing, not whether an item's outcome label fits.
- **Job 3** flags few limits, and beyond the labeled ones the 18 others in this run were read by hand: four
  unblinded-test limits with no self-test, three communities marked as not retrieved whose pages the answer read, six
  "no one described their own use" limits where the answer reports such use, four not-found limits on answers that say
  nothing was not found, and one "only one community" limit where none was found. Each reads as a limit whose premise
  the answer contradicts, sometimes because the declaration behind it was wrong; the note helps either way.
- **Job 4** fails P-1020 and the fragments like it. In a hand-read sample of 22 failures from an earlier run, most were
  caveats about studies or carried a "whom it applies to" that describes the research; a few were borderline, with the
  missing context in the subject the page shows above the claim, which v6's rubric now asks the judge to read.
- **Cost:** at about USD 0.03 a check, the default daily cap of USD 10 allows about 330 checks a day, and a regression
  run of 113 turns costs about USD 3.5, well inside the owner's monthly credit.
- **Next:** the rubric is frozen at `2026-11-02.6`. The validation step is #394's run, which nothing here has read, and
  the judge stays notes-only until a regression run has measured it against the owner's judges.

Total spend in development: USD 16.30 of the owner's monthly Claude API credit, in 497 calls (a probe, the five tuning
runs, a run cut short after 3 calls, two earlier full runs and this one), each priced at Opus 5.5's list prices from
its reply's token counts. No comment text, comment-derived count or key material is recorded here.
