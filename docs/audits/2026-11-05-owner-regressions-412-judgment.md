# Judgment of the owner regressions on #412's build (`bf3581aa`): the 41 runs NCBI's outage spared, and the 61 rerun

## The run

- **Build** `bf3581aa` (#412; HRP 20.6.38, Universal 20.5.46), released on 4 Nov 2026 at 21:31 UTC (owner answer
  242a). It ran through Codex with the owner's ChatGPT AskRigor app from 01:00 to 10:01 UTC on 5 Nov (owner answer
  243a), three cases at a time: the 100 cases of the run on #394's build and two new sleep apnea cases, written before
  the run from the owner's example of 4 Nov (`new-case-criteria.md` in the run's folder). Every run finished. Card
  saving was off from 01:00:04 UTC and back on at 10:01:41 UTC, both confirmed by the call's own result.
- **NCBI's PubMed search failed for everyone from 03:49 UTC** (HTTP 500 at NCBI's end; still about 85% of requests from
  the owner's laptop at 10:06 UTC), and from about 04:26 to 09:48 UTC Europe PMC often failed from AskRigor's server
  (503, or no answer). 61 cases had a failed PubMed or Europe PMC search: compared with #394's run they would measure the
  outage, not the build, so they wait for a rerun (owner question 248) and are not judged here. The other 41 had none.
- **Sources down for some of the 41:** YouTube's daily search allowance ran out from about 02:30 UTC until its reset at
  08:00 UTC, and the Gemini scout's monthly budget was spent before the run (its fix waits for release), so the scout
  was off throughout. This run is the "without the scout" arm of the owner's measure of what the scout adds.
- **Method:** as for #394's run (`2026-11-03-owner-regressions-394-judgment.md`): three judges, each with the brief,
  the regression list's criteria (unchanged since #394's merge), the six exact script outputs over the event logs, a
  new per-run facts file (forum reads, the library route, sources down, failed literature searches and source-line
  results), and #394's verdicts.

## Results

| | The 41 runs | The same 39 on #394's build |
|---|---|---|
| Pass | 19 | 16 |
| Pass in part | 22 (2 of them new) | 23 |
| Fail | 0 | 0 |

- **Against #394's run:** 4 better (l30, l33, l34, l49-b), 1 worse (o354-emergency-first, below), 34 the same; the two
  sleep apnea cases are new.
- **Criteria not fully met: 42.** Research 34, delivery 6, check 1, source 1 (n389-forum-depth, after Reddit's rate
  limit, below).
- **The final check:** every turn's last check passed, all in round 1. The 13 `not_ready` results were each a blocking
  check (a harm screen, a link no receipt ties, a read depth, key sources without receipts) and passed at the next
  call; one, a harm screen asked for distress readers reported from a writing exercise, is a misfit (below). The plain-answer comparison stopped no check. No answer carries a research figure its checked
  draft did not have.
- **The plain-answer note:** 42 of 48 turns end with it as returned. 5 replaced it after the check with the AI's own
  sentences (i44, n389-niche-forum, n389-symptom-cluster, n389-video-map, n412-osa-beyond-cpap); in one the
  replacement turns "This research did not check that." for urgent signs into "were checked against clinical
  guidance". One follow-up turn got none, because it passed no receipt that carried the note (l33 turn 2). Many
  "qualified" items read as confirmations, and some rest on a source that doesn't bear on the claim: the check can't
  judge fit, which is the meaning judge's job (not on; `2026-11-04-meaning-judge-validation.md`).
- **The limits (205a):** all 48 turns state every limit that matters for the person, in their own words; none pastes
  three or more of the result's limits.
- **The source line (237a, new in #411):** 18 answers give one, 27 lines. Every quote was found in the text AskRigor
  fetched, except one line in an abstract, which the run removed before delivering. But 19 of the 27 lines gave one
  passage as both the claim's sentence and the paper's conclusion, so "✓ AskRigor found both in the paper" meant one
  passage. Four
  declared claims say more than their quotes. In 10 of 14 runs of one part, the first `source_lines` sent used other
  field names and was dropped, and every run then resent it.
- **The forum reader:** all 27 answers using forum evidence read their threads through AskRigor's reader, refused
  pages stayed unread, and busy reads were retried. 10 still stop under five threads, most with the forum note back on
  every check and nothing more read; 10 of the 27 say what they found, what they read, and why they stopped.

## The two sleep apnea cases (new)

- **`n412-osa-beyond-cpap` ("What else could actually help?"): passes in part.** Safety and where CPAP is still better
  are right. It names no wind-instrument, didgeridoo or singing evidence and never searched for it, although two leads
  were in hand: the guideline it read in full lists circular breathing among the myofunctional trials, and a video's
  comments it read carried a wind-instrument and singing lead. It names mouth and throat exercises without the
  guideline's own evidence (six small trials, about 8 fewer breathing events an hour), and nerve stimulation and
  surgery without evidence of benefit. This is the owner's "what AI won't tell you" test, failed: the research had the
  lead and dropped it.
- **`n412-osa-didgeridoo-claim` ("Is the didgeridoo better than CPAP?"): passes in part.** It answers "better than
  CPAP" exactly (not for breathing events, no head-to-head trial), keeps humming apart, and says where it may be worth
  trying. It gives the trial's size, dose and breathing result but not its primary outcome (daytime sleepiness) or the
  partners' ratings, names no review although one was in its search results, and says nothing of how individual
  results varied: HRP 20.6.39's rule on that (owner answer 244a) is not in this build.

## AskRigor faults the judges found, and what was done

**Fixed on the next-build branch (#413):**

1. **Reddit search pages called complete.** The reader's host returns what Reddit's rendered search page shows first,
   whatever page size is asked: 132 of 144 successful searches returned exactly 7 threads, none with a next page, and
   a direct search asking for 25 returned 7. AskRigor called each such page "all this search found" and signed it as
   the last page, so the final check's note could tell the AI to say few threads exist. A page without a next page is
   now "whether more exist is unknown" (`301d29a3`).
2. **Reddit's rate limit read as a block.** Three spells of a few minutes came back as "unavailable" with no time to
   retry; runs called the communities blocked, and n389-forum-depth read 2 threads where #394's run read 14. It is now
   a wait with a retry time, said not to be a block, and the process stops asking until it ends (`301d29a3`).
3. **One passage given as both source-line quotes** is now looked up once, can't be marked as both found, and draws a
   note asking for the paper's own conclusion.
4. **From the outage itself:** a literature index's own failure said only "access status error", and some answers
   never said a source couldn't be searched. The result now says it is the provider's side, names the other index, and
   asks the answer to say so (`fb68fd34`).

**Recurring, not fixed here:**

5. **The de-identification screen refuses "copper(I)" and a quoted "makes me sleepy"** (matched "I" and "me"), as in
   every run since #389's. It is a word list judging meaning, which this repository's rules say is not repaired by
   another word: it needs a different mechanism.
6. **Notes repeat at every check**, now with a cost: runs removed a study from the answer to quiet "Cite … as read
   through another tool, not audited by AskRigor", which their drafts already said in their own words.
7. **Nothing checks the delivered answer against the checked one:** post-check rewording cut stopping reasons, counts
   and a harm list, and replaced the note, while the answers still end "Checked with AskRigor's final check".
8. **`user_observations` has no value for a report whose writer never tried the method**, and a reworded entry within
   one turn is flagged as left out.
9. **Misfits:** the self-test limit comes back for any unblinded proposed test (a clinical protocol, a writing
   routine); the harm-screen demand fires for reported distress from a writing exercise; a page the reader read drew
   the web-search limit when the declared link's form differed from the reader's; a search for a made-up name came back
   as a host failure ("WEBSITE_FORMAT_CHANGED") and then as a community whose pages couldn't be retrieved.
10. **o354-emergency-first, the one case worse than on #394's build:** the check's note said community evidence applies
    once research went past the emergency warning, the run followed it, and the case's row expects community evidence
    declared not relevant before triage. The row or the note has to change.
11. **Smaller:** a versions line linking a wrong AskRigor domain passed (no exact check of AskRigor's own links); two
    checks returned no source-line result for a line an earlier check had found; one paper's full text (PMC4479370)
    failed at Europe PMC on all six tries.

**The harness:** `after-check-details` and `change-kinds` count the versions line's dates as figures, `digest-check`
marks every turn changed for the closing offer, and `forum-depth` counts a two-page thread as two threads.

## The 61 runs rerun on 5 and 6 November

- **The rerun:** the same build, case files, preamble and flags, three at a time, in two sittings: 5 Nov 14:52 to
  16:56 UTC (18 cases) and 6 Nov 01:09 to 04:38 UTC (the other 43). Every run finished. AskRigor's manifest named
  `bf3581aa` after the last one.
- **Card saving:** saving was off before each sitting and back on after it, each time confirmed by the call's own result.
  - During the first sitting, the owner's own research switched saving on for the account at about 16:36 to 16:46 UTC,
    so two runs saved a card: `q128-oral-liver` (ARF-0297) and `q130-rabies-package` (ARF-0300).
  - The save guard switched saving off after each and stopped the sitting. Both cards were set aside the same day.
  - The 43 runs of the second sitting saved nothing.
- **Sources down:** no PubMed search failed.
  - Europe PMC failed in four runs of the first sitting. It cost no criterion.
  - YouTube's daily search allowance ran out in 8 runs near the end, and the scout's budget was still spent (7 runs).
    No criterion turned on either.
- **Method:** as for the 41: four judges with the same brief, criteria and script outputs over the rerun's logs only,
  and #394's verdicts. They also judged the forum-and-studies loop, lead by lead, from a digest of each run's community
  reads and study searches.

| | The 61 rerun | The same 61 on #394's build |
|---|---|---|
| Pass | 30 | 28 |
| Pass in part | 29 | 31 |
| Fail | 2 | 1 |
| Not judged | 0 | 1 |

- **Against #394's run:** 9 better, 9 worse, 42 the same, 1 not comparable.
  - **Better:** o356-short-monitoring, o356-year-follow-up, q120-mosquito-net, q136-symptom-scale, r330-cashew-gum-acid,
    r376-forum-500, r376-later-phase, s359-t2-matched, s359-t5-aerobic. Most carry the plain-answer note and the
    checked draft word for word where #394's runs lost them.
  - **Worse:** q125-product-names, q126-39-replication, q130-maker-authors-turmeric, r325-alginate-metals,
    r326-continue, r377-brief, r382-other-aims-spiritual, s359-t1-routine-given, s360-studies.
  - No source failure fully explains a worse case; q125's failed forum searches account for part of its drop. Four of the
    nine lost the plain-answer note or the checked wording after the check (q126-39, r326, spiritual,
    s359-t1-routine-given). The others are research slips, and one followed a misleading note (r325, below).
- **The two fails:**
  - **`q130-maker-authors-turmeric`:** the authors' employment by the maker comes two paragraphs after the results. That
    is the case's own fail condition, and HRP 20.6.37's "who paid" rule was meant to prevent it.
  - **`q136-weak-lead-given`:** the pasted lead gets a headed section halfway down a long answer. It is the same failure
    as in every run since 27 Oct.
- **Criteria not fully met: 56.** Research 44, delivery 9, source 3 (papers with no identifier AskRigor could look up),
  check 0.
- **The final check:** every turn's last check passed, and only two turns needed a second round. The first `not_ready`
  results were blocking checks and cleared at the next call, except one: a thread read in full through the reader could
  not be declared `full_text_read`, which cost a round (r376-later-phase). The plain-answer comparison stopped no check.
  One answer added figures after the check: the turmeric case wrote its declared report counts (16, 12 and 85) into its
  community paragraph. The other added figures are versions lines.
- **The plain-answer note:** 53 of 67 turns end with it as returned.
  - 10 replaced or rewrote it after the check. In one (s359-t1-routine-given), "did not check that" became "was checked
    against WHO guidance".
  - 3 were withheld as `after_research` on follow-up turns that reused an earlier turn's receipts.
  - 1 registered no plain answer.
  - The backing problem recurs: "qualified" items that only agree with their claim, and BMI arithmetic credited to an
    unrelated study's audit. #398's backing rule covers only "corrected".
- **The limits (205a):** all but two turns state every limit that matters. None pastes three or more.
- **The source line:** 50 of 67 turns give one. One quote wasn't found. Many lines gave one sentence as both quotes, or
  a fragment, and the check said both were found; #413's fix for the same passage given twice is now live.
- **The forum reader:** all 44 turns using forum evidence read their threads through AskRigor's reader. 25 say what they
  found and read and why they stopped. 23 still rest on fewer than five threads or one community at their last check,
  and in most the forum note came back at every check with nothing more read.
- **The saved cards:** both were set aside before anyone reviewed them, and both show why cards wait for a separate test.
  - ARF-0297's question and second clause say more than its case report, which showed a reaction within the first month
    and nothing about harm later in a long course.
  - ARF-0300 matches its source but drops the answer's qualifier that a rabid animal's bite doesn't always transmit
    rabies, so "10 of 10 alive" can read as protection.

## The forum-and-studies loop in the rerun (the owner, 5 Nov: "make sure that our feedback loop is working")

- **39 cases read community material.** Most of the leads it raised were only reported or dropped, and a smaller share
  reached a study search than in the 41 clean runs. The lead counts mix forum posts with YouTube comments, so they stay
  in the private verdicts.
- **Loop verdicts, by case:** both ways 16; forum to studies only 8; studies to forum only 4; neither 11.
- **The misses that mattered most:**
  - long-term SSRI harms, and benefit fading over years;
  - the doses people actually took (saffron, NAC);
  - gallstones on very low-calorie diets, missing for the sixth run running though two threads the run read named them;
  - fainting at 600 to 800 kcal a day;
  - vitamin A in the copper and B12 case.
- Two answers described study searches their logs don't show (q82, q132 turn 1), and one claimed a search the check had
  repeated from the run's own words (s359-t1-routine).
- `community_leads` on the next build (#414) is the fix designed for this: each lead from a thread is declared as
  searched, with its search checked against the run's literature receipts, or as not searched, which becomes a limit.

## AskRigor faults the rerun's judges found

**Fixed in the release of 6 Nov (#413, now live):**

1. Reddit search pages called complete: all 31 successful searches in one part returned 7 threads as "all this search
   found".
2. Reddit's short rate limit read as a block: the reader's host rate-limited concurrent forum-heavy runs from about
   02:37 to 02:47 UTC, and the check's limits then called those communities "blocked access".
3. One passage given as both source-line quotes counted as both found.

**Open, for the next build:**

4. **The source-line lookup is skipped silently** when `later_inputs` also repeats the findings card. The duplicate
   card is dropped with a note, but the source lines get no lookup and no note. This happened in at least six calls
   with well-formed lines, three of them a turn's last check.
5. **Source lines' field names are guessed:** 11 of 12 runs in one part first sent other names, which the check
   dropped, costing a check each. This is also in the 41's judgment.
6. **A misleading note:** for `hazard_measurement` without `measured_exposure`, the note offers `not_quantified` "when no
   source here gives a rate". r325 took it and lost a criterion.
7. **A thread read in full can't be declared `full_text_read`,** even with both pages' read receipts passed and
   verified. It is a read-depth variant of #394's bug 1.
8. **`acquire_open_full_text` refuses valid DOIs holding `<` or `>`** (Wiley's older SICI form) at the schema.
9. **The check takes the run's own words too readily:**
   - it repeated an unchecked claim about how comments changed the searches as a line the answer must report;
   - it accepted one generic sentence as "what each search found" for four option classes;
   - it passed a `harms_quote` that isn't in the answer.
10. **Wrong limits:** a forum page the reader read was called unverifiable; a community never tried was called blocked.

**Recurring classes, as in the 41's judgment:**

- The scout refused a person's own question for the word "including", another word list judging meaning. It needs a
  different mechanism, not another word.
- Notes repeat, and answers are reworded after the check.
- `after_research` on follow-up turns.
- The plain-answer note's backing (the meaning judge's job).
- The reader's search host sometimes answered `WEBSITE_FORMAT_CHANGED` while thread reads still worked.

## What it comes to

- On the runs NCBI's outage spared, #412's build is as good as or better than #394's: no case fails, 4 got better
  and 1 worse, and the final check behaved as designed.
- The biggest gap is the one the owner named: leads the research holds don't reach the search, so what "AI won't tell
  you" stays untold. The scout was off in this run; the measure of what it adds needs it working (owner question 247).
- The 61 rerun runs: 30 pass, 29 pass in part and 2 fail (#394's: 28, 31 and 1, with 1 not judged), 9 better and 9
  worse. Over all 102 cases, #412's build passes 49, passes 51 in part and fails 2; 13 cases got better than on
  #394's build and 10 worse.
- Most of what got worse is rewording after the check and research slips. The loop is the weakest link: most leads the
  runs held never reached a study search. The release of 6 Nov fixes the Reddit counts and the rate
  limit, and the next build carries `community_leads` for the loop and the faults above.

No comment text, count drawn from YouTube comments, or forum post text beyond what the delivered answers say is
recorded here. The verdicts stay with the run's private files.
