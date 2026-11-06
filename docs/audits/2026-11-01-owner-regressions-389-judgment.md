# Owner regressions on build ce7a664b (#389), judged 1 Nov 2026, against question 193's signals

## The run

- Build `ce7a664bda84caa6edf3efa49c9335b6be21250d` (#389; HRP 20.6.35, Universal 20.5.46), live from 14:43 UTC on 31
  Oct (owner answer 209a), run through Codex with the owner's ChatGPT AskRigor app from 14:46 UTC on 31 Oct to 23:11
  UTC: the same 96 cases as the run on #387's build (`docs/audits/2026-10-31-owner-regressions-387-judgment.md`) and
  four new ones, 100 cases in 113 runs, three at a time, with the fixed tool list (`442d2af213cbc996`) and research
  access active on the owner's login. The 11 low-calorie runs and the four new cases are judged apart.
- **An outage, then a rerun:** from 16:31 to 18:31 UTC Codex could not reach OpenAI from the laptop ("workspace routing
  discovery failed", failed lookups of chatgpt.com), then its usage limit ran out until the owner reset it. The 20 cases
  running then stopped, and three finished ones had AskRigor calls fail on the network. All 23 ran again on the same
  build from 23:13 UTC to 00:59 UTC on 1 Nov, every run ending without an error; the first run's files are kept apart.
- Card saving was switched off before each batch and back on after it, all four confirmed by the call's own result.
- `q130-maker-authors` was refused by OpenAI's biological-risk filter for the tenth time and is not judged.
- No run used another app's tool, ran a shell command or saved a card (`stats4.txt`, all 113 runs), and no release
  happened during the run.
- **YouTube's daily searches ran out at about 20:45 UTC,** six hours in (on #387's build, 33 minutes in): 47 of the 113
  event logs contain `quota_exhausted`, 18 of the rerun's 23 among them. Every answer it touched says so, and no criterion of
  the list turned on it.
- **How it was judged:** as before, with one shared brief (`/home/joel/askrigor-releases/20261031-389/regress/
  judge-ce7a664b/brief.md`), the same criteria as #387's, six exact script summaries of the event logs (the five of the
  last run and `forum-depth.txt`, from `tools/forum-depth.py`), and the previous verdicts. Five helpers judged the list
  in four parts and the low-calorie runs; the laptop Claude Code session judged the four new cases, whose criteria are
  HRP 20.6.35's and the owner's of 31 Oct (`verdicts-05.md`). The brief added one line per case: how many forum threads
  the answer says it found and read, and why it stopped.
- **The quotes were checked** (`/home/joel/askrigor-releases/20261030-384/quote_check.py`): all 918 of the judges'
  quoted spans of at least 12 characters are word for word in the run's prompts, answers, criteria, helper outputs and
  event logs.

## Question 193's signals, four runs

The first three are exact counts over the event logs (`/home/joel/askrigor-releases/20261030-384/signals193.py`); the
last two compare the verdicts (`compare-verdicts.py`, output `compare-verdicts.txt`).

| Signal (question 193, as asked) | #381's build | #384's build | #387's build | #389's build | Met |
|---|---|---|---|---|---|
| "most checks pass by their second call" | 2 of 105 runs | 103 of 108 | 107 of 107 | 110 of 112 (63 at the first; median 1) | yes |
| "fewer than 4 of 124 runs never pass" | 5 of 105 | 0 of 108 | 0 of 107 | 0 of 112 | yes |
| "no call fails on format" | 121 of 539 calls | 6 of 415 | 0 of 404 | 2 of 425 | no |
| "your list keeps at least its 41 full passes" | 48 | 45 | 49 | 44 | yes |
| "a case counts as fixed after two passing runs in a row" | (first run) | 38 | 40 | 40 | 40 fixed |

- **The two format failures** were first calls the app refused before they reached AskRigor, each for a required field
  its copy of the schema demands: `binary_results[].better` (`i44-gh-secretagogue-safety`) and
  `safety_claims[].direction` (`r382-five-months-300`). Both passed at the next call. The two late passes
  (`o356-dropout-nausea`, `q137-deep-research-report`) passed at the third.
- **The low-calorie runs on their own** (13 runs): by the second call 13 of 13; never passed 0; format failures 1 (the
  one above); verdicts 2 pass, 8 in part, 1 fails (on #387's build 4, 7 and 0); 1 passes in both runs.

## Results

- **The list's 85 cases:** 44 pass, 37 pass in part, 3 fail (`o356-dropout-nausea`; `q136-weak-lead-given`, the same
  judgment call as on every run since 27 Oct; `r332-agar-yields`), 1 not judged (`q130-maker-authors`).
- **Against #387's build, the 84 judged in both:** 4 better, 10 worse, 70 the same.
  - Better: `l34-unblinded-self-test` (the expectation-driven change is real again), `q135-low-stakes` (the owner's nap
    test now passes: a direct answer with no panel template), `q135-two-week-trials` (its note carried word for word),
    `r328-arsenic-terms` (the check's note carried).
  - Worse: `o354-changed-after-check` (both turns reworded after their checks, turn 2's note dropped),
    `o356-dropout-nausea` (the NNH of 6 gone; 40% of the checked draft kept; note replaced), `q120-sleep-inside-outside`
    (the mould and sleep evidence gone), `q126-39-replication` (the later study's sham and result gone; note lost),
    `q128-oral-liver` (rewritten after the check, note replaced), `q82-seller-forum` (note replaced, 49% kept),
    `r324-bacopa-rates` (the nausea and cramp warnings no longer declared as rates), `r330-cashew-gum-acid` (the test's
    route undeclared; note paraphrased), `r332-agar-yields` (neither paper's full text admitted, so no audit; note
    replaced), `s360-rating` (note replaced).
- **The 11 low-calorie runs:** 2 pass, 8 pass in part, 1 fails. `r382-other-aims-metabolic` moves up (the note is back,
  the false CALERIE limit gone); `r376-forum-500` fails on its own condition (a month-long stall after a month of loss is
  set aside for the loss); `r376-later-phase`, `r377-continue` and `r382-other-aims-spiritual` move down on their notes:
  withheld in both turns, lost to a late plain answer, replaced after the check.
- **The four new cases:** all pass in part (below).
- **Criteria not fully met: 62 in the list** (research 49, delivery 9, source 4, check 0; on #387's build 48: research
  41, delivery 4, source 3), **16 in the low-calorie runs** (research 13, delivery 3), and 6 in the new cases, all
  research.
- **The check:** no check stopped, no turn went past server round 2, and every `not_ready` was one of the five checks,
  correctly applied. Every checked answer carries the check line, then 200a's offer; nothing was shared.

## What #389 changed, and what it did

- **The forum-depth note did not deepen forum reading.** 77 runs declared forum searches; at their last check the median
  had read 2 threads, and 10 had read at least five in more than one community (on #387's build, before the note: 69
  runs, median 3, 11). The note came back in 70 runs, at every check of each; 12 read more threads after it (20 in all),
  and 7 more only declared another community. Answers do say how many threads they read and usually what stopped them (pages that would not open, "a first
  pass"), but almost none how many they found, and the niche case never says that few posts exist. It also fires on
  supplied material with no thread to read ("Forum evidence rests on 0 threads read in 0 communities.").
- **The comment map works.** `n389-video-map` names the video and gives the sample's size and how it was chosen
  (without outcome keywords), people's outcomes with counts, harms with counts, the other methods credited, promotion
  left out, and "not a success rate". `n389-symptom-cluster` gives a smaller one for the video it found. The counts
  stay off public pages until YouTube answers (owner answer 208b); they are on the owner's private page.
- **The symptom combination** (`n389-symptom-cluster`): what to try first and what to avoid are complete, with urgent
  signs; the combination was searched in the Atlas and the forums, but every study search went by one candidate cause.
- **The studies loop:** the `loop` note came back in 6 runs; five then searched and said so, and one said no community
  report changed the search.
- **205a's reference line and paste note work inside the checks** (`paste(N)` came back at an earlier check in 20 runs,
  and the next draft dropped the paste; in 4 it came back at the last check), but the pasting moved after the last check, where nothing sees it: `n389-symptom-cluster` (23 of 23, under
  "AskRigor's final check requires these evidence limits to remain explicit:"), `o355-best-ocd` (26 of 26),
  `r382-aim-unknown` (18 of 18), `s359-t1-routine` (14), `i44` (16), `s359-t5-aerobic` (12), `l27` (10), `i45` (9).
- **The fixes from #387's judgment:** no "Cite … as a lead" line is among any result's limits; the unblinded-test limit
  fits any unblinded test; scout refusals quote their match ("(matched "including")", "(matched "British Journal")");
  the note quotes each claim with its figures. An unbacked "confirmed" is now noted like an unbacked "qualified", and
  that has a side effect (below).
- **The plain-answer note was dropped or replaced after the check in 11 turns** (on #387's build, 4, and one quote), and
  withheld by the check in more: one unbacked item still withholds the whole note (190a), now also for "confirmed", and
  nothing a forum thread shows can back an item, so a forum-only answer can lose its note entirely (`r376-later-phase`,
  in both turns); `q125`, `q126-39` and `l37` lost theirs to one unbacked claim, and `r382-other-aims-diabetes` at its
  first call. Quoting each claim with its figures also
  puts figures the research rejected into the delivered answer (`q136-responders`), which may be why runs rewrite it.

## What each AskRigor finding comes to

1. **Built on the next build** (owner rule 148a; no method change), branch `claude/next-build-20261031`:
   - **A passing check's `caveats` are only the sentences the answer shows as written** (fcce644b). The cause of the
     pasting: the published schema, frozen by owner answer 189a, calls `caveats` "Sentences the answer must contain,
     each as its own sentence and as written"; the plugin skill says "otherwise copy its `caveats`"; and every passing
     result filled them with all its limits. A passing result now holds there only the mobile notice, the save offer,
     the correction-report question (78) and the community-skip sentence (125); the reference line leaves those out and
     gives each on its own "Include as written" line, and the paste note does not count them (part 00's finding that
     the paste counter counted required lines).
   - **The scout's lead refusal names each refused lead and its matches** (846f00a5), as the target's refusal does,
     never echoing a secret or contact detail.
   - **The plain-answer note stays** (cbe1653d, owner answer 210b).
   - **InfoAccess, one request at a time:** the server waits for its own requests and waits out a busy answer for up to 45
     seconds; `invalid_response` ends the search there, so it no longer holds back a lead or invites another try.
2. **Asked of the owner (answers below):** the plain-answer note when one item is unbacked, and forum depth by a causally
   different approach: the note does not change behaviour, so AskRigor reads forum threads itself.
3. **Design questions, recurring, not built:**
   - **The scout's word lists decide meaning** (bug 1 of the last three judgments): "including", "such as" and a journal's
     name are still refused, and re-registering for the scout's target costs the note.
   - **The carried state across turns:** follow-up turns still open new first turns and lose their notes as
     `after_research` (`i336`, `l32`, `l33`, `o354-continue`, `q132`).
   - **The full-text tool needs a DOI:** a PMID- or PMCID-only trial is refused (`o355-saffron-fluvoxamine`).
4. **The library's full-text route, partly AskRigor's** (corrected on 1 Nov: this record first called it a source limit,
   with a count taken while the rerun was still writing its logs). The route ended in `error` on 174 of the judged runs'
   402 attempts (43%; 41% on #387's build, 46% on #384's). Asked for again one at a time, 31 of the 73 papers that failed
   came back as PDFs and 42 answered `invalid_response`, and 22 of 25 requests sent together came back `busy`. AskRigor sent
   requests together, kept no code, did not retry, and let the `error` hold a paper back even from being cited as a lead, so
   runs repeated the call, up to 16 times for one paper; 156 of the 207 failed attempts, reruns included, were on the 42.
   `r332` lost at least one of its two audits to this. Built on the next build (below). The list is on the owner's page.
5. **Not AskRigor:** OpenAI's filter refused `q130-maker-authors` again.

## The owner's answers, 1 Nov

- **210b:** the plain-answer note stays when a claim isn't backed, showing it as "This research did not check that.", and
  a forum thread read in the research can back a claim about what people report, named as the AI's own reading. Built.
- **211a:** AskRigor reads forum threads itself, without contacting Reddit: question 33 settled that on 4 Oct, and the
  owner adds that approval is hard and the API lags by six months. The Reddit source is an open owner question.
- **212b:** the older records' YouTube figures stay as they are.

## Files

All under `/home/joel/askrigor-releases/20261031-389/regress/`: `progress.txt`, `RERUN-PLAN.md`, `cases/`, `out/` and
`logs/` (the first run's stopped files in `out/run1/` and `logs/run1/`), and `judge-ce7a664b/` (the brief, the criteria,
the six summaries, `verdicts-00.md` to `verdicts-05.md`, `quote-check.txt`, `compare-verdicts.txt`).
