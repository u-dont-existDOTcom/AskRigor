# Owner regressions on build 61215c0b (#393), judged 2 Nov 2026

## The run

- Build `61215c0be5d5254aeff8eb08725499548f16a5a9` (#393; HRP 20.6.35, Universal 20.5.46), live from 16:39 UTC on 1 Nov
  (owner answer 214a), run through Codex with the owner's ChatGPT AskRigor app from 16:42 UTC on 1 Nov to 01:09 UTC on
  2 Nov: the same 100 cases as the run on #389's build (`docs/audits/2026-11-01-owner-regressions-389-judgment.md`), in
  113 runs, three at a time, with the fixed tool list (`442d2af213cbc996`) and research access active on the owner's
  login.
- Three cases timed out at 35 minutes (`n389-niche-forum`, `n389-symptom-cluster`, `n389-video-map`). They ran again on
  the same build from 10:19 to 10:52 UTC on 2 Nov with the new case below, and every rerun ended without an error.
- `q130-maker-authors` was refused by OpenAI's biological-risk filter again, in 11 of its 12 runs since 21 Oct (one
  rerun on 21 Oct answered), and is not judged. Owner answer 216a (2 Nov) replaces it from this run on with
  `q130-maker-authors-turmeric`: the same rule, on a hot-water turmeric extract whose trials were all written by its
  maker's employees (`docs/owner-regressions.md`). It ran in the reruns and is judged apart.
- Card saving was switched off before each batch and back on after it, all four confirmed by the call's own result.
  During the reruns, something outside the harness switched it on (below).
- YouTube's daily searches ran out at about 21:00 UTC (40 of the 114 event logs contain `quota_exhausted`). The Gemini
  scout also failed often, and its budget ran out in 10 runs. Every answer it touched says so.
- No run used another app's tool or ran a shell command (`stats4.txt`). One AskRigor call failed on the network (in
  `i336-bci-pain`'s second turn), and that turn finished.
- **How it was judged:** as before, with one shared brief (`/home/joel/askrigor-releases/20261101-393/regress/
  judge-61215c0b/brief.md`), the criteria at #393's merge plus the turmeric row, six exact script summaries of the
  event logs, and the previous verdicts. Six helpers judged six parts. The brief added two things: name any figure the
  delivered answer gives that its checked draft did not have, and count the plain-answer note's "did not check that"
  lines.
- **The quotes were checked** (`/home/joel/askrigor-releases/20261030-384/quote_check.py`): 979 of the judges' 1,027
  quoted spans of at least 12 characters are word for word in the run's prompts, answers, criteria, helper outputs and
  event logs. Of the other 48, most are the script pairing the text between two quotes, and a few drop the answer's
  italics.

## Question 193's signals

The first three are exact counts over the event logs (`signals193.py`); the last two compare the verdicts
(`compare-verdicts.py`, output `compare-verdicts.txt`).

| Signal (question 193, as asked) | #389's build | #393's build | Met |
|---|---|---|---|
| "most checks pass by their second call" | 110 of 112 | 111 of 113 (68 at the first; median 1) | yes |
| "fewer than 4 of 124 runs never pass" | 0 of 112 | 0 of 113 | yes |
| "no call fails on format" | 2 of 425 | 1 of 408 | no |
| "your list keeps at least its 41 full passes" | 44 | 45 | yes |
| "a case counts as fixed after two passing runs in a row" | 40 | 38 | 38 fixed |

- **The one format failure** was a call the app refused before it reached AskRigor: `o356-ssris-years` declared a
  video known only from its description as `video_description`, a spelling its copy of the schema lacks. The forum
  reader's release (#394) accepts it.
- **The low-calorie runs on their own** (13 runs): by the second call 13 of 13; never passed 0; format failures 0.

## Results

- **The list's 86 cases:** 45 pass, 39 pass in part (the new turmeric case among them), 1 fails
  (`q136-weak-lead-given`, the same judgment call as on every run since 27 Oct), 1 not judged (`q130-maker-authors`).
- **Against #389's build, the 84 judged in both:** 8 better, 6 worse, 70 the same.
  - Better: `i44-gh-secretagogue-safety` (the peptide's anaphylaxis searched by name, the answer word for word),
    `o356-dropout-nausea` (from fails to passes), `q126-42-group-average`, `q128-oral-liver`, `r324-bacopa-rates`,
    `r330-cashew-gum-acid`, `r332-agar-yields`, `s360-rating`.
  - Worse: `l34-unblinded-self-test` and `o355-saffron-fluvoxamine` (the check's note paraphrased after the check),
    `q120-mosquito-net` (its note replaced), `s359-t3-two-claims` and `s359-t3-two-claims-given` (the note replaced and
    figures reworded after the check), `s360-studies` (a 2023 study not found).
- **The 11 low-calorie runs:** 6 pass, 4 pass in part, 1 fails (`r376-forum-500`, on its own fail condition again).
  4 are better (`r376-later-phase`, `r377-brief`, `r377-continue`, `r382-other-aims-spiritual`) and none is worse
  (on #389's build 2, 8 and 1).
- **The four `n389` cases:** all pass in part, as on #389's build. `n389-niche-forum` now says that reports from contact
  lens wearers are few; `n389-forum-depth` read fewer discussions than before.
- **The turmeric case (new):** passes in part. "No external funding" is not read as independence, and the trials are
  weighed on their methods. But the authors' employment by the maker is given only in the paragraph under the results
  table, not beside the results: the failure the rule names.
- **Criteria not fully met:** 65 in the list (research 50, delivery 12, source 3, check 0; on #389's build 62: research
  49, delivery 9, source 4), 11 in the low-calorie runs (research 10, delivery 1; on #389's build 16), and 11 in the
  `n389` cases (research 8, delivery 2, source 1; the judge added the comment-map criterion to two of them).
- **The check:** no check stopped, no turn went past round 2, and every `not_ready` was one of the five checks,
  correctly applied. Every checked answer carries the check line.

## What #393 changed, and what it did

Exact counts (`measures393.py`, the same method on #389's run, which reproduces #389's record):

- **Pasted limits: fixed.** No answer pastes three or more of its check's limits word for word (on #389's build 9 turns,
  up to 26 of 27). The paste note came back in one run, which then dropped the paste.
- **The plain-answer note stays more often.** 86 turns end with the note their last passing check returned (#389: 75).
  The check returned none in 6 (#389: 20), since one unbacked claim no longer withholds it (210b). The judges counted 61
  "This research did not check that." lines. Many "qualified" items only agree, and some bases don't fit the claim.
- **InfoAccess one request at a time:** the library route ended in `error` on none of 367 attempts (#389: 174 of 402,
  43%). Its outcomes now: 99 indexed, 99 partial text, 119 not found, 27 abstract only, 23 identity mismatch.
- **Forum depth:** 78 runs declared forum searches. At their last check the median had read 3 threads (#389: 2), and 13
  had read at least five in more than one community (#389: 10). Answers say how many threads they read, rarely how
  many they found. The forum reader in #394 is meant for this.
- **The no-thread note** was answered where it came back (`r331`, `s359-t1-routine`, `s359-t1-routine-given`,
  `s359-t1b-compound`).

## Two problems this run brought out

1. **Answers changed after a passing check, a class that keeps coming back.** In 21 turns the note the last passing
   check returned was dropped or replaced (#389: 17), and in one part the judges found 9 of 23 turns reworded after a
   passing check, still ending "Checked with AskRigor's final check". The rewording now replaces notes and declared
   sentences too. The AI writes the answer after the check, and nothing ties the delivered text to the checked draft,
   so another instruction will not fix it. On 1 Nov the owner found an answer whose delivered text carried figures the
   check never saw (owner question 217). This goes to the owner as its own question.
2. **Saving switched on during the reruns** (owner questions 218 and 219). Card saving is one switch for the owner's
   whole account. Something outside the harness turned it on at about 10:20 to 10:30 UTC and off again before about
   10:48: each case's first `manage_research_access` call shows the state at its start. Three regression cards were
   saved and, as free-contributor cards are, published at once, seven publications in all. One finding rests on
   YouTube comments while its card listed two studies as its sources, so the hold for findings drawn from YouTube
   comments missed it. The owner decides whether to take them down (218) and whether to hold cards whose research read
   YouTube comments (219). The next run's harness checks after every case whether saving was on, switches it off again,
   and stops the run on a saved card (`tools/save-guard.py`).

## What each AskRigor finding comes to (for the next build, owner answer 148a)

- **The check:** a note asks for a source to be added to `key_sources`, and the sources check then refuses it. In
  `n389-video-map` the refusal was wrong: the call had passed that video's `get_youtube_video` receipt.
- **Figures:** 171 cm, written 1.71 m, read as missing; "but not its figures" where the validated audit worked them out
  (`w166`).
- **The plain-answer note:**
  - any audited study is accepted as backing;
  - a run's own comparison sentence inside the checked draft passes unseen (`q81`, `r329`);
  - rewording `research_target` drops the whole note with no note or step saying so (`q136-weak-lead-given`);
  - follow-up turns still lose it as `after_research` (`l32`, `l33`, `q120-sleep-inside-outside`).
- **The scout's de-identification screen** refuses copper(I)'s "I", "age 10" and the word "including".
- **Forum counting:**
  - links to the pages of one discussion count as separate threads;
  - threads count in communities the same call marks unreadable;
  - the forum note comes back on every check.
- **Limits and notes:**
  - the unblinded-test limit fires on clinical monitoring;
  - a "different tissue" limit appears when both tissues were the same;
  - the evidence-strength note fires on what case reports can show by design.
- **Fixed in #394 already:** the full-text tool's DOI requirement (a trial with only a PMCID stayed unaudited) and the
  `video_description` spelling.
- **The harness:** `forum-depth.py` does not detect #393's no-thread note.
- **Not AskRigor:** OpenAI's filter (`q130-maker-authors`), and once Codex reported a tool "not available to the model".

## Files

All under `/home/joel/askrigor-releases/20261101-393/regress/`: `progress.txt`, `cases/`, `out/` and `logs/` (the
timed-out first runs in `out/run1/` and `logs/run1/`), and `judge-61215c0b/` (the brief, the criteria, the six
summaries, `verdicts-00.md` to `verdicts-05.md`, `signals193.txt`, `measures.txt` with `measures393.py`,
`compare-verdicts.txt` and `quote-check.txt`).
