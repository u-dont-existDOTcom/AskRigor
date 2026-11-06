# Judgment of the owner regressions on #412's build (`bf3581aa`): the 41 runs NCBI's outage spared

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

## What it comes to

- On the runs NCBI's outage spared, #412's build is as good as or better than #394's: no case fails, 4 got better
  and 1 worse, and the final check behaved as designed.
- The biggest gap is the one the owner named: leads the research holds don't reach the search, so what "AI won't tell
  you" stays untold. The scout was off in this run; the measure of what it adds needs it working (owner question 247).
- The 61 outage cases wait for their rerun (owner question 248); their judgment will be added here.

No comment text, count drawn from YouTube comments, or forum post text beyond what the delivered answers say is
recorded here. The verdicts stay with the run's private files.
