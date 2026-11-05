# Owner regressions on build b9e658e2 (#394), judged 3 Nov 2026

## The run

- **The build:** `b9e658e25d29e186b51557eb53b0634f1f2573f1` (#394; HRP 20.6.36, Universal 20.5.46), live from 11:52 UTC on
  2 Nov (owner answers 215a and 217b).
- **How it ran:** through Codex, with the owner's ChatGPT AskRigor app refreshed to the 35-tool list (`0d6016087ee4bc5a`),
  from 17:02 UTC on 2 Nov to 01:42 UTC on 3 Nov, three cases at a time. Research access was active on the owner's login.
  - It ran the same 100 cases as #393's run, with the turmeric case in the list (owner answer 216a), in 113 runs.
  - No run used another app's tool or ran a shell command (`stats4.txt` lists the forum reader's own AskRigor calls as
    "other").
- **Two runs failed on OpenAI's side** ("Selected model is at capacity", at about 00:17 UTC). Neither is judged; both will
  be rerun:
  - `r382-other-aims-metabolic` has no answer;
  - `r377-continue`'s second turn stopped before any check.
- **Card saving** was off when the run started. It had been switched off outside the harness. The harness confirmed it
  off before the cases (17:02 UTC), checked after every case, and left it off at the end. No card was saved.
- **YouTube and the scout:** YouTube's daily searches ran out from about 22:05 UTC (26 of the 113 event logs contain
  `quota_exhausted`). The Gemini scout's budget ran out in 10 runs.
- **InfoAccess, the full-text tool's last route, stopped answering.** Its route had 330 attempts and 117 ended in
  `error`.
  - In runs that ended before about 23:30 UTC, 49 of 259 attempts ended in `error`, 15 of them in one turn that sent 14
    requests at once.
  - After that, 68 of 71 did. Its last paper came back at 23:22 UTC.
  - It still answered "busy" at about 02:27 UTC with nothing else running, so its queue looks stuck.
  - The judges found it cost a criterion in `r332-agar-yields` and `s359-t5-aerobic`, which will be rerun once it
    answers.
- **Calls that failed in transport:**
  - 15 `acquire_open_full_text` calls timed out in the app ("MCP request timed out");
  - all four of the run's YouTube video tool calls that answered "Internal error" were in `o356-ssris-years`;
  - 3 forum reader calls lost their connection;
  - Reddit answered "unavailable" in bursts while runs overlapped.
- **How it was judged:** as before, with one shared brief (`/home/joel/askrigor-releases/20261101-394/regress/
  judge-b9e658e2/brief.md`). Six helpers judged six parts. They had:
  - the criteria at #394's merge, unchanged from #393's;
  - six exact script summaries of the event logs;
  - a table of each run's forum reader calls, InfoAccess results and quota (`run-facts.txt`);
  - #393's verdicts.

  The brief added three things: the plain-answer comparison as the sixth blocking check (217b), the forum reader, and
  the sources that went down.
- **The quotes were checked:** 997 of the judges' 1,036 quoted spans of at least 12 characters are word for word in the
  run's prompts, answers, criteria, helper outputs and event logs. Most of the other 39 are the script pairing the text
  between two quotes.

## Question 193's signals

The first three are exact counts over the event logs (`signals193.py`); the last two compare the verdicts
(`compare-verdicts.py`, output `compare-verdicts.txt`).

| Signal (question 193, as asked) | #393's build | #394's build | Met |
|---|---|---|---|
| "most checks pass by their second call" | 111 of 113 | 108 of 111 (72 at the first; median 1) | yes |
| "fewer than 4 of 124 runs never pass" | 0 of 113 | 0 of 111 | yes |
| "no call fails on format" | 1 of 408 | 1 of 385 | no |
| "your list keeps at least its 41 full passes" | 45 | 40 | no, by one |
| "a case counts as fixed after two passing runs in a row" | 38 | 33 | 33 fixed |

- **The one format failure** was a call the app refused before it reached AskRigor. `o355-supplement-table`'s second turn
  sent each option class's `search_query` as an object where the schema asks for text.
- **Runs with no final check:** `q120-sleep-inside-outside`, whose first turn asks its question first, by design; and
  `r377-continue`'s second turn (OpenAI's capacity).
- **The low-calorie runs on their own** (13 runs): by the second call 12 of 12; never passed 0; format failures 0.

## Results

- **The list's 85 cases** (the turmeric case included): 40 pass, 44 pass in part, and 1 fails
  (`q136-weak-lead-given`, the same judgment call as on every run since 27 Oct).
- **Against #393's build:** 7 better, 12 worse, 66 the same.
  - **Better:**
    - `o354-changed-after-check`;
    - `o355-saffron-fluvoxamine`: its 2017 trial, which has only a PMCID, was fetched and audited;
    - `q125-product-names`: the seller and buyer naming was found through the reader;
    - `q126-39-replication`;
    - `s359-t3-two-claims` and `s359-t3-two-claims-given`: the check's note was carried word for word;
    - `s360-studies`: the 2023 study was found and read.
  - **Worse:**
    - eight because the plain-answer note was dropped or replaced after the check: `i44-gh-secretagogue-safety`,
      `l30-form-specific-forum`, `l33-withdrawn-report`, `l49-b-label`, `o356-short-monitoring`,
      `o356-year-follow-up`, `q136-symptom-scale` and `s359-t2-matched`;
    - `o356-dropout-nausea`: the number needed to harm is missing again;
    - `q126-42-group-average`: the test that would show the effect in one person is missing;
    - `r324-bacopa-rates` and `r330-cashew-gum-acid`: declarations are missing, a class first seen on #389's build.

    The judges found none of the worse cases explained by a source failure.
- **The 11 low-calorie runs:** 4 pass, 6 pass in part, none fails, and 1 is not judged (`r382-other-aims-metabolic`). On
  #393's build: 6, 4 and 1 fail.
  - `r376-forum-500` is better (from fails to in part).
  - `r376-later-phase` is worse (its notes were changed after the check).
- **The four `n389` cases:** all pass in part, as before. `n389-symptom-cluster` is better within its verdict: it searched
  with the whole symptom combination, says the community reports changed the study search, and read 12 threads in 8
  communities against 5 in 5.
- **The turmeric case:** passes in part again. The authors' employment by the maker is still not beside each result.
- **Criteria not fully met:**
  - 64 in the list: research 45, delivery 13, source 5, check 1. On #393's build: 65 (research 50, delivery 12, source
    3, check 0).
  - 14 in the low-calorie runs: research 12, delivery 2. On #393's build: 11.
  - 9 in the `n389` cases: research 8, source 1. On #393's build: 11.
- **The check:**
  - No check stopped, and no turn went past round 2.
  - The plain-answer comparison stopped none.
  - Every `not_ready` was one of the blocking checks, but two were wrong (the forum reader's threads, below).
  - Every checked answer carries the check line.

## What #394 changed, and what it did

- **The forum reader: much deeper forum reading.** 73 runs declared forum searches (`forum-depth.txt`).
  - At their last check the median run had read 7 threads (quartiles 4 and 10). On #393's build: 3.
  - 45 had read at least five threads in two or more communities. On #393's build: 13.
  - 3 had read none. On #393's build: 11.
  - The reader ran in 70 runs: 169 searches and 583 thread reads. Every forum link the judges checked was read
    through it, and the pages a site refused stayed unread.
  - Only 26 of the 70 turns that use forum evidence say what they found, what they read and why they stopped.
    HRP 20.6.36 asks for this every time; it appears mostly where the forum note fires.
- **Papers with only a PMID or PMCID** were fetched where the run tried. Two loose ends:
  - the check's own wording and its `NO_DOI` limit still say the full-text tool requires a DOI;
  - one PMCID-only fetch found no metadata before Europe PMC answered HTTP 500 (`l35-own-use-benefit`).
- **The plain-answer comparison as a sixth check (217b) stopped no check.** It acts through the note: unbacked items
  become "This research did not check that."
  - Every judged turn registered its plain answer before research, except continuations that pass an earlier turn's
    receipts.
  - At the last passing check (`measures393.py`), the note was kept in 82 turns, none was returned in 8, it was dropped
    in 12 and replaced in 9. On #393's build: 86, 6, 12 and 9. So it is still lost after the check in 21 turns, as
    before.
  - The backing is still weak. Many "confirmed" quotes are circular, many "qualified" ones only agree, and a
    mislabeled source passes. Judging that backing is the meaning judge's second job (owner answer 221, in the next
    build).
- **Pasted limits:** no answer pastes three or more of its check's limits word for word (as on #393's build).

## Problems this run brought out

1. **The forum reader's threads are refused as key sources.** This is new with #394.
   - The final check says a thread "has no receipt showing it was found or looked up", although the call passed its
     `forum_thread_read` receipt and it was verified.
   - It then advises saying that AskRigor did not look it up, which is false.
   - This happened in `r376-forum-500` (call 3) and in `r376-later-phase`'s first turn (call 3), costing a round each.
2. **Reddit searches return one page of 7.**
   - 138 of the 148 searches that ran returned exactly 7 threads, and none offered a next page.
   - The client asks for no page size (`reddit-reader-client.ts`).
   - So "found N" counts a page, not what the topic holds, and can't tell a niche topic from a busy one.
3. **The reader answers "busy" to parallel reads, with no hint to retry.**
   - In `q128-oral-liver`, seven parallel reads all came back busy at once and were lost. One part counted 13 busy
     reads.
   - Reddit also answered "unavailable" in bursts while three runs overlapped.
4. **InfoAccess's queue stuck** (above), and 15 full-text calls ran past the app's time limit.
5. **The plain-answer note dropped or replaced after the check, a class that recurs unchanged** (21 turns on each
   build). Nothing ties the delivered text to the checked draft, so another instruction won't fix it.
   - Since 217b, the apps' panel shows the check's comparison, folded, whatever the AI's text does.
   - Codex shows no panel, so the regression runs see only the text.

## What each AskRigor finding comes to (for the next build, owner answer 148a)

- **The forum reader:**
  - accept a thread's verified `forum_thread_read` receipt as a key source;
  - ask Reddit for a full page, and say when more exist;
  - queue parallel reads instead of answering busy;
  - the panel's access limit says a community's reports aren't included while the answer uses them
    (`q120-sleep-inside-outside`'s second turn, `q135-low-stakes`);
  - the forum note counts the declared threads, not the reader's own receipts (`l49-b-label`: 3 declared, 9 read).
- **The check:**
  - the "requires a DOI" wording and the `NO_DOI` limit are out of date since #394 (`n389-forum-depth`,
    `o355-scoped-list`);
  - a note asks for sources to be added to `key_sources` that the sources check then refuses (`n389-forum-depth`,
    recurring from #393).
- **The plain-answer note:**
  - a "corrected" item passes with no backing, while unbacked "confirmed" and "qualified" items become "did not check"
    (`l32-negative-controls`);
  - the absence-claim route accepts any declared sentence as backing (`l23-long-term-medicine`);
  - a second registration after research began replaced the first, and the result still said "registered before
    research" (`q136-weak-lead-given`);
  - follow-up turns lose the note as `after_research` or `no_receipt` (`i336-bci-pain`, `l32-negative-controls`,
    `l33-withdrawn-report`, `o355-supplement-table`, `r326-continue`);
  - "but not its figures" appears when the figures are shown (`r382-aim-unknown`, recurring);
  - a stray period follows a bolded quote.
- **Notes and limits:**
  - the harm-screen demand misfires on made-up figures (`l25-columns-passages`);
  - the emergency note says community evidence applies before triage (`o354-emergency-first`);
  - the unblinded-test limit fires for symptom diaries (`l35-own-use-benefit`, `o355-best-ocd`,
    `o355-supplement-table`).
- **The de-identification screen** (the scout's, and now the reader's) refuses copper(I)'s "I" (`l30-form-specific-forum`,
  `l31-dose-changed-switch`) and a question that names no one (`o355-best-ocd`). This recurs since #389. A word pattern
  is deciding a question of meaning, so the fix is not another pattern.
- **Full text:**
  - the library route can outlast the app's time limit (15 timeouts);
  - one PMCID-only fetch returned no metadata.
- **YouTube:**
  - four "Internal error" answers in `o356-ssris-years`;
  - the video reader fails on one video in `n389-video-map`, four runs in a row.
- **Findings cards:** research that rests only on forum threads can't get a card, since card sources must be a DOI,
  PMID, PMCID or video ID. Saving was off, so nothing was lost here. Whether such findings belong on the Atlas is the
  owner's decision.
- **The harness:**
  - `stats4.py` counts the reader's AskRigor calls as other apps;
  - the scripts miss figures written as words;
  - `forum-depth.py` misses the no-thread note;
  - `after-check-details.py` lists no failed calls per case;
  - `digest-check.py` misses a dropped note.
- **Not AskRigor:** OpenAI's capacity (two runs), YouTube's quota, and InfoAccess's queue.

## Files

All under `/home/joel/askrigor-releases/20261101-394/regress/`:
- `progress.txt`, `cases/`, `out/` and `logs/`;
- `judge-b9e658e2/`: the brief, the criteria, the six summaries, `run-facts.txt`, `verdicts-00.md` to `verdicts-05.md`,
  `signals193.txt`, `measures.txt`, `compare-verdicts.txt` and `quote-check.txt`.
