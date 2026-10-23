# Owner regressions, 23 Oct 2026: judgment

Build 1582f063 (HRP 20.6.31, Universal 20.5.46), release #361. 79 cases in 90 runs through Codex with the owner's
ChatGPT AskRigor app, 12:30:54 to 19:43:04 UTC, three at a time: the 65 cases of 22 Oct and the 14 new rows of the
regression list (issue #359: five; issue #360: six; lesson #49: three). The app's tool list was current: at 12:29 UTC it
named build 1582f063 with both versions, listed 33 tools and had every new final-check field, and the account's
research access was active on notice v3 (`connector-probe-refresh-d1.md`). Whether the owner refreshed the app or it
updated by itself is not known: the laptop's checks from 22:38 UTC on 22 Oct to 07:25 UTC on 23 Oct all found build
71f09f63. Criteria: `docs/owner-regressions.md` at 1582f063 (unchanged on the build branch since). Judged by three
Claude helpers, a third of the cases each, from each answer (`out/`) and five exact script outputs over the event
logs, which stay on the laptop: `summarize3.py` (protocol loads, the final-check sequence and the last call's
declarations, caveats and steps), `tools/stats4.py` (calls, web searches, shell commands, final-check statuses,
versions, check line, caveats, saves), `digest-check.py` (whether each delivered answer is the draft its check read),
`change-kinds.py` (how it differs, and whether the check's caveats survived word for word) and
`after-check-details.py` (failed calls, the scout's statuses, figures added or dropped after the check).

**Method.** As on 21 and 22 Oct: each criterion is met, in part or not met, by meaning, with a short quote; a
declaration and the answer's statement count separately where the owner separates them; a criterion about something
the run never used counts as met (moot). A criterion on a declaration the summary does not print is not judgeable
unless a caveat it triggers shows it, and counts on neither side. **Verdict:** passes = every criterion met and the
final check passed (or was held only by a harness artifact), with the check line when it passed; fails = under half
met, or the answer meets one of the case's own fail conditions; otherwise passes in part. **Against the checked draft
(exact):** `change-kinds.py`'s comparison for each turn whose own check passed, after the check's own closing lines are
taken out.

## Harness and run-wide facts

- **Every run stayed inside AskRigor.** No run called another app's or server's tool (`regress-scan-tools.py`
  discarded none), none ran a shell command, and `~/.codex/AGENTS.override.md` held its one line from 12:30:54 to
  19:43:04 UTC ("override in place", "override removed" in `progress.txt`).
- **OpenAI's filter again.** q130-maker-authors stopped at 16:59:25 UTC after 19 AskRigor calls: "This content was
  flagged for possible biological risk", as on 21 and 22 Oct. Not rerun.
- **The final check.** 467 calls, none rejected (22 Oct: 349, none rejected). 73 of the 79 cases ended
  `ready_with_limits` (22 Oct: 55 of 65), none `ready`; q137 deep research report, r328 arsenic terms, r329 gracilaria
  ulcer, r332 agar yields and s359 T1b compound ended `not_ready`; q130 maker never reached it. q120 sleep's first
  turn asked the user a question before researching and called no check, as its criteria ask (its case section has
  the details).
- **The checked draft, delivered.** Of the 83 turns whose check passed, 50 delivered the checked draft word for word
  (22 Oct: 5 of 64), 6 changed only its formatting, 3 only added text, and 24 reworded it. 81 kept every caveat word
  for word; o354 changed after check turn 2 kept none of its 8 (it rewrote the answer, keeping 9% of the draft's
  words in order) and r326 continue kept 21 of 22. The fix of 22 Oct (`981e2a92`: give the checked draft word for
  word, then only the check's closing lines) is working; the 24 rewordings are the rest of that problem.
- **Calls and searches.** 4,652 AskRigor calls and 779 web searches in 90 runs (22 Oct: 3,760 and 670 in 76). 64
  answers saved a findings card (ARF-0176 to ARF-0239).
- **Failed calls: 131** (22 Oct: 148), 55 of them inputs a tool refused before running (22 Oct: 74).
  - `check_retraction_status`: 0 (22 Oct: 27). The tool now takes the DOI as `doi` too.
  - `validate_study_method_audit`: 71 (22 Oct: 67), 42 of them "Study audit reported figure ... is not in its cited
    source block" (22 Oct: 45): totals, group sizes and differences the paper does not print as such, such as
    "Complete-case sample", "Analyzed participants across both arms" and "Placebo responder percentage".
  - The scout: 21 failed (22 Oct: 10), 15 of them `research_target_not_deidentified`, 4 refused inputs and 2
    `rediscovery_lead_video_unavailable`; 21 searches completed.
  - `acquire_open_full_text` 12, `validate_review_method_audit` 11, YouTube's daily search quota 3, and a few others.
- **Sentences with the AI's words spliced in.** In 26 of the 89 delivered answers (22 Oct: 19 of 75), a phrase the
  AI wrote starts with a capital letter in the middle of one of AskRigor's fixed sentences, 44 times (22 Oct: 24).
  Most are ordinary words: "Another pass would take About 20–40 minutes" (14 times), and the new sentence of issue
  #359, "None of the studies I found tested Occasional ordinary edible kelp as described" (16 times). The new sentence
  doubled the class; it is the first of the two proposals from 22 Oct.

## Results

**79 cases: 38 pass, 38 pass in part, 2 fail, 1 not judged** (22 Oct: 23, 39, 2 and 1 of 65). Against 22 Oct, of the
64 cases judged both days: 15 better, 11 worse, 38 the same. The 14 new cases: all three of lesson #49 and all six of
issue #360 pass; of issue #359's five, T1, T2 and T3 pass and T1b and T5 pass in part. The two failures:
o355-supplement-table, as on 22 Oct (no effect sizes, the bottom line gone), and r332-agar-yields, whose audit never
ran after a full-text source failure.

The session checked the helpers' quotes against the sources: of 523 quoted passages, 494 appear word for word in the
delivered answers, the prompts or the script outputs, and 18 in the check's own drafts and steps in the event logs, the
criteria or the HRP case text, as the sections say; the other 11 are the checker pairing one quote's closing mark with
the next one's opening mark.

## Findings

1. **The final check passes far more often, and most answers now arrive as checked.** 73 of 79 cases passed the check
   (22 Oct: 55 of 65), and all eight cases it held on 22 Oct passed (both book cases, i45, l24, l31, o354 continue,
   o355 keto thread, o355 saffron). 50 of the 83 turns whose check passed delivered the checked draft word for word
   (22 Oct: 5 of 64): the 22 Oct fix (`981e2a92`) works. The 24 rewordings still matter, in new ways:
   - o354 work left and o354 changed after check (turn 1) moved every caveat into a collapsed `<details>` block, in
     work left with the urgent-care signs and "it does not rank the options";
   - o354 changed after check's turn 2 delivered only its first line: no check line, no unchecked line, none of its 8
     caveats;
   - answers dropped limits of their own after the check: i45 (not a representative survey), l30, l36, i44 (search
     coverage), o354 continue ("A personal efficacy ranking remains uncertain.");
   - i44 added "from 1,106 retrieved", which the check never read; and five plain-answer notes quote a sentence the
     delivered answer no longer has (o354 changed after check, o356 year follow-up, l47, s360 agreement, s360
     studies).
   The step 22 Oct named for this case: the final-check panel in the apps shows the checked answer itself.
2. **The check still gets stuck, in two new ways.**
   - **A full-text source that keeps failing.** In q137 and r332 the check's last step was only "Try
     acquire_open_full_text for <DOI> before treating it as lead_only". Every attempt (8 in q137, 9 in r332) returned
     "A source failed (an outage or rate limit), so this is not yet a completed lead and has no receipt.", so the step
     could never close. A failed attempt should count as trying.
   - **A caveat the run's own evidence contradicts.** In s359 T1b the check required "YouTube's search limit stopped
     discovery before any video turned up, so YouTube evidence could not be checked yet." The run had found two
     videos through its own web search and read 269 of their comments. Its correction was refused ("corrections[0]
     takes back words of the check's own caveat", the 22 Oct rule), and the answer tells the user the check is wrong.
     The caveat should not be required when the run audited videos.
   - Not deadlocks: r329's key sources have no DOI, PMID or PMCID, and the run neither identified them nor labelled
     them unverified; r328 left out two caveats while YouTube's daily quota stopped seven searches.
3. **Sentences with the AI's words spliced in: twice as many** (owner question 165). See the run-wide facts: 44 in
   26 answers. Beyond "Another pass would take About …" and #359's "None of the studies I found tested …", the same
   mechanism shows in "The reported figures in Burpee–cycling trial don't match the study's own data", "The exact
   product tested in crocin capsules was not traced to a current product", "How often harms occur with 20-minute
   early-afternoon nap in adults with good nighttime sleep wasn't quantified", "measurements of Infant salivary
   cortisol", "I could not find Unidentified practitioner's publication and its comments" and "A search of MyFitnessPal
   public fitness forum turned up no relevant reports".
4. **Figures a study audit works out itself are refused** (owner question 166): 42 refused audit calls (22 Oct: 45).
   In l22 the refusal kept the answer per gram: the per-serving amount ("Kombu assumed 8-g portion from rounded species
   mean") was refused twice.
5. **The check passes answers with a declaration missing** (22 Oct's finding 4, again): l23 left `recommendations`
   empty in all 6 calls; l28 declared one mechanism and dropped its `tissue` field; l25 declared no `safety_claims`;
   o355 saffron passed with `absence_claims` empty beside "We do not yet know whether saffron is as effective as
   fluvoxamine"; o356 dropout and nausea gives no NNH, and o356 SSRIs for years no NNT or NNH; r324 changed its
   basis to `not_quantified` rather than give both groups' rates, so the answer says "How often this happens wasn't
   quantified" beside a table that quantifies it.
6. **Corrections of a draft the user never saw.** On the owner's dev account each run first writes a plain answer
   that the user does not see (owner answer 158a). l26, l48 and l49 author reply declared `corrections` against it, and
   l48 then asked the user to approve a bug report about it. A correction should cover only what the user was shown.
   Two other runs asked to report the check's own sentences as bugs: o355 saffron (the dose-comparison rule applied to
   randomized trial arms) and q135 urgent treatment (the figure-mismatch caveat over minor misprints). And the note
   that compares the plain answer with the checked one can reprint what a case forbids: in q136 responders it quoted
   "the tea response rate is 28/31 (90.3%) and the placebo rate is 8/33 (24.2%)", the rates the case refuses; the
   answer left the note out after the check.
7. **Fixed sentences that contradict the answer.** "Pages from r/OCD could not be retrieved, so reports there are not
   included." beside the r/OCD excerpts it reports, and one NAC caveat twice (o355 best OCD); the not-found caveat's
   "so reports there are not included" where the user supplied those reports (b-book reviews, l24, each adding a
   sentence to reconcile them); the figure-mismatch caveat on a paper cited only for its notation (q125); the
   unblinded-test caveat without a proposed test (l26); l29's "automatically sent five existing study/review analyses
   from this account to its review inbox", which counts analyses "in this chat or another".
8. **Coverage fell in a few cases.** o355 best OCD names no botanicals, cannabis, EMDR or ECT and finds none of the
   report's trials (22 Oct named them); o355 scoped list has no sentence saying the list ranks nothing; q126 #41 never
   quotes the diagram's "fear-only" line; i336's first turn no longer pairs the stimulus with a painless control; l22's
   conflicting evidence is down to two committees' upper levels.
9. **Gains.** o354 emergency first gave the triage in its first message, before any tool call; q136 responders no
   longer computes rates from conflicting group sizes (HRP 20.6.30, owner answer 149a); q128 says injuries can appear
   after months of uneventful use; q126 #39 reconstructs both studies; q120 sleep asks before researching; r330
   declares both routes; the #360 cases keep agreement, ratings and benefit apart and name what they read.
10. **Findings cards hit the account's daily limit.** After ARF-0239, later runs' cards were checked but not saved
   ("its daily limit was reached"), which the answers say. It comes from running 79 cases on one account in a day and
   touches no verdict.
11. **Budget.** About 52 AskRigor calls a run (22 Oct: 49). Protocol loads still dominate some short cases: l25 31 of
   52 calls, l48 29 of 57, q136 responders 26 of 43, q79 25 of 63, l37 19 of 30, s360 lookup 11 of 19.
12. **Main points that depend on what the run finds went untested.** q136 weak lead (no animal-only plant, the third
   run), s359 T1 (different studies from the case's), T2 (no matched trial found), T3 (no ankle-stiffness trial) and
   s360 abstract (the appendix was readable): to test their rules, these cases need their fixture in the prompt.

The cases follow, in the regression folder's order.

## b-book-no-reviews (owner request, 20 Oct)
- **Loaded:** yes (5, 9). **Executed:**
  - No reader reviews found or given, said: met. "I assessed the supplied excerpts and cover copy, not the complete workbook, and read no independent reader reviews." It also says why it did not search: "the supplied title is hypothetical and has no identifiable readership to evaluate."
  - The book research still completed: met; the four steps, "105 minutes of morning writing each week", "The cover endorsements are promotional opinions." and Chapter 7's limits ("It would be unfair to turn its modest self-help claim into a promise to cure illness.").
  - No fail: the endorsements are not used as evidence and no review is invented. The 22 Oct claim that the chat's tool list was outdated is gone.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes (retyped with a curly apostrophe, like the saved line); delivered answer = the checked draft with emphasis, typographic apostrophes and a versions line added; 52 calls, 4 web searches; caveats 7/7; saved ARF-0176.
  - Changed after the check: bold phrases, apostrophes and "Applied: HRP 20.6.31 (2026-10-22) and Universal 20.5.46 (2026-10-21)."; no criterion affected.
- **Against the checked draft (exact):** the checked draft with text added.
- **Verdict:** passes. **vs 22 Oct:** better (2/2 both days; the check, then not_ready, now passes).

## b-book-reviews (owner request, 20 Oct)
- **Loaded:** yes (5, 12). **Executed:**
  - The method from the book's passages: met; "The passages teach four steps:" with the four chapter instructions.
  - The reader reviews beside it, with difficulties, negative experiences, the audiobook and unaddressed criticisms: met; a table of all twelve: "Review 2 reports anger and quitting after three days"; "An audiobook/commute mismatch, including reportedly missing worksheets."; "This challenges the fifteen-minute budget; whether the full book discusses overruns is unverified."
  - Reviewers' claims about the book checked against it: met. "Their attributed cure promises conflict with Chapter 7's explicit disclaimer; they do not establish that the author made those promises."
  - The duplicate counted once, non-finishers not counted: met. "Count once: a report of reduced work worry after a month, not two independent successes."; "A half-read impression and a criticism of tone from someone who never tried the exercises."
  - Endorsements apart, and how many reviews were read and how chosen: met. "The cover endorsements are promotional opinions, not reader-use evidence or clinical validation."; "I read all **12 supplied entries"; "site totals, dates and original review selection are unknown"
  - Self-selected, not rates: met. "these selected entries do not measure how often the method helps or harms"
  - No fail.
- **Finalized:** ready_with_limits (9 calls, 7 not_ready, 0 rejected); check line yes; delivered answer same as checked (plus the check's plain-answer note, saved and check lines); 43 calls, 13 web searches; caveats 8/8; saved ARF-0178. The two invented sites now pass as not found ("I could not find PageTurner Books, so reports there are not included."), and the answer adds a sentence to square that caveat with the supplied reviews: "Your twelve supplied excerpts are included in the analysis above." The not_ready steps were refused inputs, the named sites' records, missing caveats and "Search at least one more community, independent of the first", which sent the run to two Reddit threads on letter writing in general, kept apart: "not reviews of this workbook".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (6/6); the check, held on 22 Oct only by the fixture's invented sites, now passes.

## i336-bci-pain (issue #336, four turns)
- **Loaded:** yes (turn 1: 1, 9; turn 2: 0, 1; turn 3: 0, 0; turn 4: 0, 1); every turn names both versions. **Executed:**
  - The discriminating test: met, in turn 3. "A direct test would first establish a reliable voluntary yes/no code using known-answer questions, then ask whether a defined, clinically justified stimulus hurt; repeated trials would include randomly ordered nonpainful controls". Turn 1 has it only in part, with no painless comparison: "Once communication is reliable, ask whether they feel pain now, or whether a clinically necessary procedure hurt."
  - The four states kept apart: in part; turn 1: "A brain response to a harmful stimulus alone does not establish that it consciously hurts." and "Failure to answer does not establish absence of pain."; turn 2: "**No usable answer** is inconclusive; it is not a no." but it treats a general question as the test ("asking “Does it hurt?” is the direct next step") until turn 3: "A general pain report does not establish whether a particular stimulus hurt."
  - Proposed when brain communication first comes up, unasked: in part; turn 1's stimulus question has no painless control, and turn 4 now concedes: "I should have proposed the paired experiment when I introduced brain communication."
  - Awareness implied, nothing about complete unconsciousness: met, as judged on 21 and 22 Oct. "Showing consciousness is not the same as showing pain from a particular stimulus."; "Failure to answer does not establish absence of pain."
  - The 2012 "no" not presented as that controlled test: in part. Turn 2: "Researchers have already reported doing this." (Routley "was reported to have answered no when asked whether he was in pain"); turn 3: "My previous answer treated a general pain report as if it answered whether a particular stimulus hurt." No stimulus was claimed, so no hard fail.
  - Matched methods before saying a study answered it: met. Turn 1: "The 2013 study tested factual communication, not pain reporting"; turn 3: "It does not document a specified clinical stimulus paired with that question."
- **Fail criteria:** none triggered. Turn 4: "I have not established that the paired experiment has never been performed." and "I cannot give a documented reason for an assumed absence."; its practical constraints are said not to explain why the test was not run. No turn cites the 2022 EEG interface review (PMID 36545350). Turn 2 again declared the user's question a correction (`by_user`) and asked the bug-report question; turns 3 and 4 did so for real corrections.
- **Finalized:** ready_with_limits in all four turns (4, 3, 2, 2 calls; 2, 2, 0, 1 not_ready; 0 rejected); check line yes; all four delivered as checked (plus the check's own lines); 63, 14, 7, 12 calls, 13, 4, 3, 5 web searches; caveats 2/2, 3/3, 2/2, 2/2; saved ARF-0177, 0179, 0181, 0182.
- **Against the checked draft (exact):** the checked draft, unchanged, in all four turns.
- **Verdict:** passes in part. **vs 22 Oct:** worse (3 + 3 part / 6 against 4 + 2 part / 6): turn 1 no longer pairs the stimulus with a painless control, and turn 4 now concedes the test was not proposed when brain communication came up.

## i44-gh-secretagogue-safety (lesson #44, question 128)
- **Loaded:** yes (3, 10). **Executed:**
  - Serious harms, severe allergic reactions searched by name: in part. From the label: "Somatropin prescribing information also warns about severe allergic reactions, raised pressure around the brain, pancreatitis"; for the peptides, "concerns about immune reactions and peptide impurities"; no search of reports or case reports for allergic reactions shows in the answer.
  - Label warnings apart from experimental peptides: met; the label paragraph, then the FDA ipamorelin notice: "This is a warning signal, not a measured death risk from under-the-skin ipamorelin."
  - No rate without a denominator: met. "listed as affecting at least **1 in 10 adults** in the UK Genotropin product information"; "15,809 treated patients, followed for an average of 5.3 years"
  - Earlier tolerated doses don't rule out a later reaction, and the emergency signs: in part. "Seek urgent care for breathing difficulty, facial or throat swelling, chest pain, severe headache with vision changes, or persistent severe abdominal pain."; nothing on earlier tolerated doses.
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable; the summary shows no `harm_screen` (six `safety_claims`, all `not_quantified`).
  - New rule seen: "The MK-677 trial was NIH-funded with Merck supplying the drug" (question 130), in a paragraph after the table rather than in the MK-677 row; the KIMS result sits beside "in Pfizer’s registry".
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected; a pass, then not_ready, then a pass); check line yes; delivered answer changed after the check (wording); 61 calls, 12 web searches; all 16 caveats (two with renamed link text, "[the MK-677 older-adult trial]" and "[the hip-fracture study]"); 1,106 YouTube comments retrieved, 222 read; saved ARF-0180. Template break: "None of the studies I found tested Prescribed growth hormone injections versus experimental GH secretagogues as described".
  - Changed after the check: the opening rewritten in bold, the table rows and community counts reworded (numbers in words), "from 1,106 retrieved" added, and the draft's sentence on search coverage dropped; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 73% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** same (3 + 2 part / 5 judged).

## i45-sleep-training-anxiety (lessons #45 and #46, questions 133 to 135)
- **Loaded:** yes (2, 9). **Executed:**
  - 135, the short answer: in part. "**For your exact question—cry-it-out at 8 months and anxiety by age 10—the change in risk is unknown.**"; "they do not establish that no-check-in cry-it-out is harmless through age 10". The age-6 trial's dropout and method come only in the details ("About **31% of eligible families were missing** at age 6."; "rather than isolating unmodified extinction"); the baby's uncomforted crying at the time is not in the short answer (later: "Gradisar’s daytime cortisol sampling did not measure the immediate response during nighttime crying"); severe deprivation and the parents' sleep and mood go unnamed.
  - 133, a safe-sleep recommendation scoped to its outcome: met (moot; none given).
  - 134, whether more research would change the conclusion: in part; what new studies must do ("A more decisive study would document a clearly specified home method and comparator, record what families actually did, retain children through at least ten") and next searches ("Study focus: Age-10 cohort full text and later follow-ups."), but not whether more searching would likely change the conclusion ("Further discovery had not exhausted the available sources.").
  - No fail.
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, layout; the saved line retyped with a curly apostrophe); 66 calls, 17 web searches; all 18 caveats; 1,284 YouTube comments retrieved, 173 read; saved ARF-0183. Template breaks: "None of the studies I found tested Cry-it-out sleep training begun around 8 months as described" and "This warning rests on measurements of Infant salivary cortisol before sleep and 20 minutes after sleep onset, on days 1 and 3 of a nurse-led residential program, without an untreated comparator, not on harm observed in people using Residential extinction program, so how often it would cause harm wasn’t measured."
  - Changed after the check: the opening bolded and a sentence added ("The evidence reviewed does not justify saying that cry-it-out causes later anxiety."), the methods and the trial's limits set as lists; dropped a limit of its own (the draft's "This is not a representative parent survey or a complete community review; the second Mumsnet page was unavailable.") and an earlier check's caveat on mixed home methods; no criterion's result changes.
- **Against the checked draft (exact):** reworded, keeping 67% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** better (1 + 2 part / 3 both days; the check, then not_ready on YouTube's quota, now passes).

## l22-kelp-iodine (lesson #22)
- **Loaded:** yes (2, 13). **Executed:**
  - Amounts per serving: in part; per gram only. "One gram therefore supplied 1,200–3,000 micrograms."; "check the species, iodine per prepared serving and portion rather than relying on the word “kelp.”" The run's per-portion figure ("Kombu assumed 8-g portion from rounded species mean") was refused twice by the study-audit tool as not in its source block.
  - Meals apart from supplements: met. "Neither is a study of an occasional ordinary meal."; the dietary case, the mixed weight-loss product and "One tablet user reported marked palpitations after several daily doses" kept apart.
  - Rate at that intake, or unknown: met. "How often harms occur with occasional culinary kelp wasn't quantified in the sources found here."
  - Conflicting evidence: in part; only the two committees' upper levels side by side ("sets an upper level of 1,100 micrograms/day from all sources; the European assessment uses 600 micrograms/day") and a commenter's normal thyroid tests beside a tablet user's palpitations. No population evidence (the HRP case's "conflicting population evidence"); 22 Oct's reassuring tablet and single-meal studies are gone.
  - Higher-risk people and tests: in part. "With thyroid disease or nodules, pregnancy/breastfeeding, or thyroid-affecting medication, advice should be specific to that exposure before making high-iodine kelp a habit"; no test for the user.
  - No blanket avoidance: met. "the iodine mechanism alone does not justify a blanket ban."
  - `safety_claims` basis: met (`not_quantified`, `case_reports`, `not_quantified`), with "Case reports show that this harm can happen, not how often it happens."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, caveats moved); 67 calls, 8 web searches; all 14 caveats; 344 YouTube comments read; saved ARF-0184. Template break: "None of the studies I found tested Occasional ordinary edible kelp as described".
  - Changed after the check: the draft's lead-in to the distinctions became "The useful distinctions are:", "The YouTube comments" became "The comments", two caveats moved up, a versions line added; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 91% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** worse (4 + 3 part / 7 against 5 + 2 part / 7): the conflicting evidence is down to the two upper levels.

## l23-long-term-medicine (lesson #23)
- **Loaded:** yes (3, 12). **Executed:**
  - No endorsement before reconciliation: met. "**Do not start it solely because of that trial.**"
  - Non-drug options: not met; only "what alternatives fit your history" among the questions for the prescriber.
  - Short trials' limits: met. "This is a possible short-term benefit for selected patients with diagnosed dyspepsia."
  - Long-term numbers unknown: met. "This review leaves long-term benefit and harm unresolved." beside the 12-week rates ("51/97 people assigned amitriptyline (53%) and 39/97 assigned placebo (40%)").
  - Stopping effects: met. "abrupt withdrawal after prolonged amitriptyline use can cause symptoms, with frequency unknown"
  - `recommendations` `unresolved` with open inputs: not met; `recommendations` is empty in all six calls, though the answer names the open inputs ("The proposed medicine, dose and diagnosis remain unknown.").
  - Review caveat: met by meaning, in the answer's own words (the check's caveat cannot fire without the declaration): "Your previous severe movement reaction and episodes of losing touch with reality need a prescriber review before a new medicine is chosen"
  - New rules seen: "NIH funded the trial; Forest supplied escitalopram and its dummy pills." beside the result (question 130); the label's serious harms, "serious allergic or skin reactions" among them (question 128).
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check (formatting only); 54 calls, 11 web searches; all 14 caveats; 125 YouTube comments read; saved ARF-0185.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes in part. **vs 22 Oct:** worse (5/7 against 6/7): no `recommendations` declared; still no non-drug option.

## l24-practitioner-corpus (lesson #24)
- **Loaded:** yes (2, 8). **Executed:**
  - Recoveries and non-responses lead, with source and uncertainty: met. "twenty patient-reported dramatic recoveries and six non-responses in one practitioner’s publication"; "these counts cannot supply a treatment success rate"
  - Unreadable comments reported: met. "Because they could not be read, their contents remain unknown."
  - Unrelated record left out: in part; a bullet keeps it ("**Registry:** According to your summary, the registry concerned an unrelated probiotic blend and had no posted results."), and the next step asks for its "registry identifier".
  - Visible recovery apart from laboratory clearance: met. "Whether they documented elimination of the fungus, improved nail appearance, or sustained recovery remains unresolved here."
- **Finalized:** ready_with_limits (7 calls, 6 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording); 26 calls, 4 web searches; all 14 caveats; no card. The run recorded made-up descriptions as user-named communities, which now pass as not found, and squares the caveat with the supplied counts: "The twenty recoveries and six non-responses above remain supplied findings, rather than independently retrieved accounts." Template breaks: "I could not find Unidentified practitioner's publication and its comments, so reports there are not included."; "I could not find Comments on the unidentified practitioner's publication, so reports there are not included."; "In r/NailFungus, no one described their own use of The unnamed botanical treatment, so its reports are not evidence about it." (and the same for Earth Clinic).
  - Changed after the check: nearly every sentence reworded; the draft's "Keep it separate" before the registry and its counts in digits dropped (counts now in words); no criterion's result changes.
- **Against the checked draft (exact):** reworded, keeping 43% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** better (3 + 1 part / 4 both days; the check, then not_ready, now passes).

## l25-columns-passages (lesson #25)
- **Loaded:** yes (6, 25). **Executed:**
  - 7% for A and 40% for B, populations and denominators: met. "**The table’s reported figure for compound A is 7%**"; "That describes the people and conditions represented in the table"; "How broadly the 7% applies depends on the participant counts, doses, follow-up, symptom definition and collection method, and uncertainty around the estimate. Those details were not supplied."
  - 12% a share of passages: met. "The 12% figure counts selected written passages mentioning cold, not people experiencing it"
  - `share_of_reports` with its caveat: in part; no `safety_claims` declared, the caveat's meaning in the answer.
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer same as checked; 52 calls, 31 of them protocol loads, 2 web searches; all 3 caveats; saved ARF-0186. The plain-answer note gives two of the answer's own sentences as the quick answer's claims, each then "confirmed" by itself.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (2 + 1 part / 3).

## l26-chills-onset (lesson #26)
- **Loaded:** yes (6, 14). **Executed:**
  - Before, during and after onset: met. "1. Before onset, arrange a comfortable room"; "2. During chills, pause strenuous activity"; "3. Afterwards: record how long the chills lasted"
  - Ranked: in part; steps by phase, with the light layer first when simply cold ("If your temperature is normal and you are simply cold, try the light layer"), but no ranking of the options.
  - Untested ones labelled: met. "Treat these as comfort suggestions, not a promise of prevention."
  - Overheating warning: met. "Do not try to sweat it out with heavy blankets or intense external heat."
  - Not only a blanket afterwards: met.
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered answer same as checked; 51 calls, 6 web searches; all 14 caveats; saved ARF-0187. As on 22 Oct the unblinded-test caveat appears though no test is proposed ("Do not take another dose just to test a remedy."), and the declared term lands mid-step: "Blinding means keeping the intervention's identity hidden during assessment." 22 Oct's template breaks are gone. A correction was declared against the run's own unshown quick answer: "This research corrected that, from a correction the research made to an earlier statement".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (4 + 1 part / 5).

## l27-herbal-tea (lesson #27)
- **Loaded:** yes (4, 14). **Executed:**
  - Advice apart from outcomes: met. "Six recommendations are not six demonstrated treatment successes."
  - Nausea apart from chills: met. "Possible nausea benefit; chills did not improve in those episodes."
  - Natural resolution apart from tea: met. "Spontaneous recovery, not a tea response."
  - No success rate: met. "so no response percentage is justified"
  - `thread_selection` given: met; three `community_searches` with `outcome_keyword`.
  - Its caveat: met. "The Patient Communities threads that I read were found by searching for outcomes, so they show which experiences people report, not how common each one is."
  - New rule seen: "It had university funding and no commercial sponsorship." (question 130).
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer same as checked; 60 calls, 7 web searches; all 12 caveats; saved ARF-0189.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (6/6).

## l28-borrowed-mechanism (lesson #28)
- **Loaded:** yes (5, 12). **Executed:**
  - Narrowed skin vessels stay a hypothesis: met. "It does not show that blood was diverted away from the skin."
  - Y not recommended as prevention: met. "**Unknown. From those two findings alone, we cannot predict whether Y would prevent X-induced chills. Prevention remains a hypothesis to test.**"
  - `mechanism_claims` with the animal evidence and the tissue difference: not met; the one entry declares the human heating study (`other<-other/people`), not the rodent or isolated-muscle evidence, and the passing call dropped the `tissue` field the first two calls had.
  - Both caveats stated: in part; in the answer's own words ("Increased flow in a rodent's cortex—the brain's outer layer—does not tell us whether X increases, decreases or leaves skin blood flow unchanged."; "A response in isolated vessel muscle does not establish that Y reaches the relevant skin vessels at an effective concentration"), the check's caveats absent because nothing was declared for that evidence.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer same as checked; 54 calls, 2 web searches; both caveats; saved ARF-0188.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (2 + 1 part / 4).

## l29-corrected-mapping (lesson #29)
- **Loaded:** yes (5, 10). **Executed:**
  - Headline, table and chart carry the corrected rate: met. "**Using the table values you supplied, compound A’s reported coldness rate is 7%, and compound B’s is 40%.**"; a corrected table and a text chart.
  - What changed: met. "The error was assigning B’s value to A."; "I withdraw the 40% claim for A and any conclusion or recommendation that depended on it."
  - `corrections` declared: met (`by_user`).
  - Verified findings stay: met. "This correction alone does not establish which compound is safer overall"
  - Comments gap a limit: met. "Their contents remain unchecked; retrieval failure does not establish that adverse experiences were absent."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer same as checked; 24 calls, 0 web searches; all 3 caveats; the bug-report question and "This bug report has not been sent."; no card. The answer relays one of the check's status lines to the user: "AskRigor’s final check reports that it automatically sent five existing study/review analyses from this account to its review inbox." (the check's line counts analyses "in this chat or another").
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (5/5).

## l30-form-specific-forum (lesson #30, corrected row)
- **Loaded:** yes (2, 11). **Executed:**
  - No one in the first thread took form A: met, now through the check's caveat ("In r/FunctionalMedicine, no one described their own use of Copper(I), so its reports are not evidence about it.") and "A discussion without confirmed copper(I) use supplies no firsthand copper(I) outcome evidence."
  - Its marker values apart from any effect of A: met. "those cannot be credited to copper(I)"
  - The second thread as one person's A against a liver supplement: met. "one person reports improved anhedonia—difficulty feeling pleasure—after cuprous nicotinic acid, a copper(I) formulation"; "no comparable-dose copper(I)-versus-copper(II) experiment"; "The beef-liver product’s copper content and chemical form were not verified."
  - `report_identity` given: met (r/FunctionalMedicine 0 read; r/anhedonia 1 read, 1 exact; r/Copper_deficiency 1 read, 1 exact, 1 measured).
  - Zero-firsthand caveat: met (above).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, layout); 63 calls, 16 web searches; all 16 caveats; 237 YouTube comments retrieved, 110 read; saved ARF-0191. Template breaks: "In r/FunctionalMedicine, no one described their own use of Copper(I), so its reports are not evidence about it." and "None of the studies I found tested Oral copper(I) versus copper(II) for low ceruloplasmin as described".
  - Changed after the check: the draft's own sentence for the first thread (no identifiable firsthand copper(I) report) and its explanation of the +1 and +2 charges dropped, as were two limits of its own (the scope sentence and the partly read 2006 case report); the first criterion now rests on the check's caveat; no criterion's result changes.
- **Against the checked draft (exact):** reworded, keeping 57% of the draft's words in order.
- **Verdict:** passes. **vs 22 Oct:** same (5/5).

## l31-dose-changed-switch (lesson #31)
- **Loaded:** yes (2, 8). **Executed:**
  - Both named communities searched: met; two Longecity threads and eight YouTube discussions ("Across eight videos, 925 comments/replies were retrieved and 346 returned for reading.").
  - `named_by_user`: met (YouTube, Longecity).
  - The switch not counted as a comparison of the forms: met. "that sequence cannot isolate oxidation state from timing, earlier copper exposure, other supplements, or ordinary measurement variation"
  - `comparison_claims` gives both doses: met (6 mg/day against 0.9 mg/day, same people).
  - Dose caveat stated: met. "The reports comparing copper(II) with copper(I) changed the dose as well (6 mg/day against 0.9 mg/day), so they cannot show which works better."
  - The report naming no form left out: met. "A second person who did not identify their copper form cannot count as a responder to either form or as an independent comparison."
  - No follow-up measurement said: met. "Without a follow-up blood test, it is an unverified claim of improvement, not a documented ceruloplasmin response."
  - The check passes and the answer ends with its line: met.
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer same as checked; 68 calls, 12 web searches; all 14 caveats; saved ARF-0192. A `corrections` entry was declared for the poster who named no form, with "Unknown formulation and absent measurements are missing information, not an outcome withdrawn by its source." Template breaks: "Another pass would take About 30 minutes and 12 targeted searches or source checks" and "None of the studies I found tested Oral copper(I) versus copper(II) for low ceruloplasmin as described".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** better (8/8 against 7/8): the check now passes.

## l32-negative-controls (lesson #32, two turns)
- **Loaded:** yes (turn 1: 1, 7; turn 2: 0, 1). **Executed:**
  - The site that did nothing kept as evidence: met. "But a smell-only explanation would predict a forearm response too if exposure at your nose were equivalent."; "The forearm result also needs explaining"
  - Smell and cold results as evidence against (turn 2): met. "**Your new comparisons substantially weaken simple smell-only and cooling-only explanations. They do not identify the cause.**"
  - Explanations ranked by fit: in part; turn 1's four-row fit table is unranked, and turn 2 leaves "Two possibilities remain worth separating" with only a working focus ("I would now focus on what is specific to contact between this preparation and your neck").
  - No smell or cold test again without its difference: met. "I would not ask you to repeat bottle-smelling or the cold cloth as the next step."; "it differs from the cold cloth you already tried"
  - A test that tells the rest apart: met. "Compare the existing preparation with a control liquid at the same neck site"; "This adds masked liquid identity and randomized order to your existing comparisons."
  - `user_observations` lists the null comparisons: not judgeable (not in the summary); the turn-2 table lists the forearm, the bottle and the cold cloth, each "No effect".
  - `proposed_tests` marks no repeat without a `difference`: not judgeable (not in the summary); the answer states the difference (above).
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 3 calls, 2 not_ready; 0 rejected); check line yes; both turns changed after the check; 66 and 12 calls, 9 and 1 web searches; all 20 and 9 caveats; saved ARF-0190 and ARF-0193. Template breaks: "In Earth Clinic, no one described their own use of Posterior-neck diluted vinegar for focus, so its reports are not evidence about it."; "This finding comes from inhalation in review of odor experiments"; turn 2: "This finding comes from test-tube experiments in laboratory study of acid sensing".
  - Changed after the check: turn 1 gained a paragraph the check never read ("The **day-long duration is particularly unresolved**.") and dropped its own scope limits; turn 2's table turned the user's report (in the draft, sharper focus within 1–2 minutes) into "Rapid improvement lasting most of the day" and dropped two sentences on smell and cooling; the bold verdict stays, so no criterion's result changes.
- **Against the checked draft (exact):** turn 1: reworded, keeping 73% of the draft's words in order; turn 2: reworded, keeping 62% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** same (4 + 1 part / 5 judged).

## l33-withdrawn-report (lesson #33, two turns)
- **Loaded:** yes (turn 1: 1, 6; turn 2: 0, 1). **Executed:**
  - The friend's report treated as uncertain: met. "I would now describe the situation as one reported benefit and one uncertain experience"
  - No opposite-responder group: met. "**That removes the main reason for explaining an opposite response.**"
  - Not counted as no effect: met. "Their uncertainty also does not establish that the rub had no effect."
  - The change in the explanation stated: met. "Your friend’s original drowsiness report should no longer support the sedation hypothesis."
  - `user_observations` `uncertain`: met; the check's caveat for an uncertain report fired, twice (the field is not in the summary).
  - Its caveat: met. "A report its source is no longer sure of counts neither for nor against an effect (Friend reported feeling drowsy after temple peppermint oil rub; repeatability, formulation identity and amount unspecified.)." The splice leaves ".)."; the second instance labels the friend's update itself ("Friend now unsure the temple peppermint rub did anything").
- **Finalized:** ready_with_limits in both turns (6 calls, 4 not_ready; 5 calls, 4 not_ready; 0 rejected); check line yes; both turns changed after the check; 61 and 7 calls, 14 and 0 web searches; all 19 and 6 caveats; saved ARF-0195 (turn 2 no card). Template breaks (turn 1): "Another pass would take About 20–40 minutes for 1 focused full-text/subgroup pass"; "None of the studies I found tested Peppermint oil rub on the temples for afternoon focus as described"; "The exact product tested in Peppermint, eucalyptus and ethanol mixture applied to forehead and temples was not traced to a current product".
  - Changed after the check: emphasis, a list, one sentence reworded, a citation link dropped, versions lines; no criterion affected.
- **Against the checked draft (exact):** turn 1: reworded, keeping 97% of the draft's words in order; turn 2: the checked draft with text added.
- **Verdict:** passes. **vs 22 Oct:** same (6/6).

## l34-unblinded-self-test (lesson #34)
- **Loaded:** yes (2, 11). **Executed:**
  - The score as how they did that day: met. "Your result shows that you scored higher after using the balm; it does not establish that the balm caused the improvement."
  - Expectation, effort, practice and normal variation named: met. "this observation cannot distinguish it from practice, expectations or ordinary variation"; "Knowing you had applied it leaves expectations, effort and attention free to change."
  - A blinded comparison for cause: met. "A blinded comparison would conceal which condition was used from the participant and scorer."
  - An expectation-driven change called real: met. "An expectation-related improvement would still be a real performance change; it would not establish a specific chemical effect of menthol."
  - `proposed_tests` and the unblinded caveat: met; only a randomized, concealed design, and "a difference confined to openly identified sessions would leave sensory and expectation explanations unresolved" (the field is not in the summary; no unblinded caveat fired).
  - New rule seen: "One author was affiliated with the company supplying the cognitive-testing system" (question 130).
- **Finalized:** ready_with_limits (8 calls, 6 not_ready, 0 rejected; a pass, then not_ready, then a pass); check line yes; delivered answer same as checked; 65 calls, 9 web searches; all 20 caveats; 604 YouTube comments retrieved under one video, 40 sampled; saved ARF-0196. The checked draft carries two sentence fragments: "Within the threads inspected." and "For the exact wrist-balm memory question."
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (5/5).

## l35-own-use-benefit (lesson #35)
- **Loaded:** yes (2, 11). **Executed:**
  - The report weighed at its level: met. "**No irritation for two weeks is favorable evidence about your tolerance so far.** It does not establish the absence of subtle skin changes, absorbed exposure, or longer-term harm."
  - The exposure pinned down: met. "What is the bottle’s acidity, your vinegar-to-water ratio, roughly how much you dab, and whether you rinse it off or cover it while wet?"; "“Diluted” needs a number"
  - Possible irritation apart from what was measured: met. "That is an observed count for this soaking regimen, not your personal risk"; "the inner thigh was not the site tested in the forearm study"
  - Signs to stop or seek care: met. "Stop and rinse if burning, itching, persistent redness or peeling develops."
  - Neither a blanket ban nor blanket approval: met. "Pausing is a reasonable precaution if you want to remove the exposure, but the evidence does not justify telling you that your symptom-free routine has already harmed you."
  - `safety_claims` with basis: met (`case_reports`, `not_quantified`, `observed_rates`).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, layout); 65 calls, 10 web searches; all 18 caveats; 1,447 YouTube comments retrieved, 274 read; saved ARF-0194. Template breaks: "Another pass would take Roughly 20–30 minutes"; "None of the studies I found tested Diluted apple cider vinegar dabbed on adult inner-thigh skin as described"; "In Earth Clinic insomnia and topical remedy pages, no one described their own use of Topical apple cider vinegar intended to improve sleep or focus"; "The Earth Clinic insomnia and topical remedy pages threads that I read"; "The reported figures in 2021 skin-bacteria study don't match the study's own data"; "How often harms occur with unknown-concentration vinegar wraps plus elevation and usual care, one month wasn't quantified in the sources found here."
  - Changed after the check: bullets and bold, the community paragraph split, "Creator claims were not verified from video viewing." added, the draft's further-work sentence with its own time estimate dropped; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 83% of the draft's words in order.
- **Verdict:** passes. **vs 22 Oct:** same (6/6).

## l36-mechanism-inquiry (lesson #36)
- **Loaded:** yes (3, 9). **Executed:**
  - The explanation stays the task: met. "**A common substance can act differently at different skin sites because local delivery, sensory receptors and nerve connections can differ.**"
  - Exact preparation, route, onset and duration researched: in part; route and onset researched ("Different local delivery."; "Different neural routing."; "Fits rapid signaling or contextual processes"), preparation and duration only named as missing: "The decisive missing details are the final acid concentration, precise neck location, whether skin sensation differs between sites, repeatability, duration of the effect".
  - The next discriminating test: met. "blinded, randomized, repeated vinegar-versus-vehicle comparisons at neck and forearm, controlling application, temperature, odor and skin sensation"
  - Safety proportionate and beside it: not met; nothing on skin irritation beyond "This is a research design, not a home-use protocol." (as on 20 to 22 Oct).
  - No generic avoidance advice: met.
  - No test already run: met. "This differs from your existing controls because it masks substance identity and tests the substance-by-site interaction."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, layout); 65 calls, 8 web searches; all 19 caveats; `mechanism_claims` declared (cells and animals, tissue; people, tissue); saved ARF-0197. Template breaks: "This finding comes from test-tube experiments in Weak-acid experiments"; "This finding was measured in cultured cells and rat nasal preparations in Weak-acid experiments, not in human posterior-neck skin."; "under electrical stimulation in Occipital-stimulation study"; "The reported figures in Skin-site study don't match the study's own data"; "The reported figures in Occipital-stimulation study don't match the study's own data"; "None of the studies I found tested Diluted apple cider vinegar dabbed on posterior neck as described"; "no one described their own use of Posterior-neck diluted apple cider vinegar with rapid focus outcome"; "Another pass would take About 20–40 minutes".
  - Changed after the check: opening and hypothesis rewritten in bold, paragraphs split, two limits of its own dropped (the unread 2025 paper's sentence, now only in a study-focus caveat, and the draft's note that the community search was bounded); no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 79% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** same (4 + 1 part / 6).

## l37-confirmed-correction (lesson #37)
- **Loaded:** yes (8, 11). **Executed:**
  - The specific error acknowledged: met. "My suggestion repeated a comparison you’d already tried; I withdraw it, and I’m sorry I missed that."
  - A short general report: met. "“When a user has already reported that a comparison had no effect, AskRigor should retain that result and reassess explanations before suggesting tests, because repeating the same comparison ignores available evidence.”"
  - The bug-report question in the same reply: met. "May AskRigor send a bug report about this correction, or would you like to clarify something first?"
  - Nothing sent: met. "No bug report has been sent."
  - `corrections` with `by_user` and `report`: met for `by_user`; the summary does not show the `report` field.
- **Finalized:** ready_with_limits (5 calls, 2 not_ready, 0 rejected); check line yes; delivered answer same as checked; 30 calls, 19 of them protocol loads, 0 web searches; all 3 caveats; no card.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes (the `report` field unseen). **vs 22 Oct:** same (5/5).

## l47-onset-first (lesson #47: `OnsetBeforeMechanisms`)
- **Loaded:** yes (5, 10). **Executed:**
  - Acute danger excluded first: met; the first question asks about "breathless, or lightheaded", and the urgent signs come next, before any possibility: "If it comes with chest pressure, severe breathing difficulty, fainting, or new trouble swallowing, seek urgent medical help"
  - Onset and progression within the first two clarifications: in part; onset is in the first question ("and is this new or longstanding?"), progression is never asked; "is new or worsening" appears only as a reason for a primary-care review.
  - Tolerated comparisons recorded, then only ranking-changing questions: met. "Carrying boxes, cleaning floors and standing comfortably are important clues"; "Comfortable reading or other equally close work would weaken this explanation."
  - "Many years" kept as uncertain: met (moot in one turn; nothing presses for a date).
  - No fail: no run of questions on lights, hunger, humidity or temperature. The answer also carries lesson #48's advice, which l48's own answer lacks: "bringing the work closer and supporting your forearms is a reversible comfort adjustment".
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording); 57 calls, 6 web searches; all 10 caveats; saved ARF-0198. Template breaks: "Another pass would take About 15–25 minutes"; "None of the studies I found tested Task-specific fatigue during parcel wrapping as described".
  - Changed after the check: the bold opening rewritten, dropping the sentence the check's plain-answer note quotes; the note still reads "This research confirmed that, from full-text audits of 3 studies: “That is a clue, not a diagnosis, and it does not establish that the cause is physical or psychological.”", which the delivered answer no longer contains. The urgent signs stay second; no criterion's result changes.
- **Against the checked draft (exact):** reworded, keeping 81% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** better (3 + 1 part / 4 against 2 + 2 part / 4): the urgent signs now come before the possibilities.

## l48-observation (lesson #48: `ObservationNotProvocation`)
- **Loaded:** yes (6, 23). **Executed** (the owner's sentence, part by part):
  - No extra notes solely for an experiment: met. "Keep the workload ordinary; do not add writing, test your limits or push through worsening symptoms for the record."
  - Record the normal sessions: met. "Recording writing you already need to do is observation."; "Whether the familiar tiredness occurred—including sessions when it did not."
  - A reversible ergonomic adjustment if comfortable: not met; none offered (l47's answer has one).
  - Don't push through worsening: met (above, scoped "for the record").
  - Medical review if red flags: met. "Sudden loss of feeling or inability to move the wrist or hold things calls for urgent assessment."
  - No fail: the log is endorsed ("Yes—a brief record of the next few ordinary note-taking sessions could help you describe the tiredness"), with "If the log adds nothing useful or feels burdensome, stop recording."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check (white space); 57 calls, 29 of them protocol loads, 7 web searches; all 12 caveats (one with renamed link text); saved ARF-0199. The run declared a correction of its own unshown quick answer (three to five sessions) and asks the user about it: "May AskRigor send this as a bug report, or would you like to clarify it first?" Template break: "Another pass would take About 20–30 minutes".
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes in part. **vs 22 Oct:** better (4/5 against 3 + 1 part / 5): not pushing through worsening symptoms is now said; still no ergonomic adjustment.

## l49-a-author-reply (lesson #49, question 161: `AuthorReplyBeforeVerdict`, new)
- **Loaded:** yes (5, 12). **Executed:**
  - The reply and its study read before the claim is graded: met. "The reply matters, and the citation is genuine."; "I read and audited the full texts of the 2011 trial, the 2023 trial and the 2024 review."
  - Graded for the population the study defines: met. "**Partly credible, but overstated—even with the vegetarian qualification.**"; "tested creatine monohydrate, 20 g/day for five days, against glucose tablets in young women"
  - Its actual scope and uncertainty kept: met. "does **not report the direct creatine-versus-placebo memory effect within vegetarians**"; "the size and everyday relevance of any benefit remain uncertain"
  - An unreadable reply or study leaves the audit incomplete: met (moot; both were read).
  - No fail: the verdict follows the reply, and nothing unread supports it. Funding beside the result: "The manufacturer donated supplements; otherwise there was no external funding." (question 130).
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer same as checked; 60 calls, 9 web searches; all 3 caveats (one with renamed link text, "[Rae and colleagues (2003)]"); saved ARF-0200. A correction was declared against the run's own quick answer ("a correction the research made to an earlier statement"), with no bug-report question.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new (4/4).

## l49-b-label (lesson #49, question 161: `MistakenLabelNotFalseMeasurement`, new)
- **Loaded:** yes (3, 11). **Executed:**
  - The label corrected: met. "Yes—**nitrates** is the right correction."; "Nitrite is part of that pathway."
  - The measurable assertion judged on its own evidence, apart from the wording: met. "The post has a reasonable basis for a modest blood-pressure effect, but **4–5 points is a rough study average for the upper reading, not a guaranteed result from any daily glass.**"; "Removing the influential Kapil trial reduced the estimate to about 2.7 mmHg."
  - Harm for one outcome not taken as refuting benefit for another: met; the commenters' "diarrhoea or dizziness" stay reports beside benefit and no-benefit accounts: "These accounts support variability, not a causal effect size or a response rate."
  - No fail: the label error is not used against the measurement.
- **Finalized:** ready_with_limits (9 calls, 6 not_ready, 0 rejected); check line yes; delivered answer changed after the check (wording, order); 64 calls, 6 web searches; all 11 caveats; 325 YouTube comments retrieved, 278 read; saved ARF-0202. It says "This focused first pass checks the quoted sentence, not the author’s full thread." (none was supplied). Template break: "None of the studies I found is known to have tested Daily beetroot juice as described".
  - Changed after the check: paragraphs split and reordered, the dose sentence now "“A glass” also leaves the dose unspecified.", the closing search request dropped; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 82% of the draft's words in order.
- **Verdict:** passes. **vs 22 Oct:** new (3/3).

## l49-c-plainly-wrong (lesson #49, question 161: `CompleteThreadNegativeVerdict`, new)
- **Loaded:** yes (3, 8). **Executed:**
  - A plain negative verdict: met. "No. On the post and replies you describe, the claim that the 1998 Lancet paper “proved” that the measles, mumps and rubella (MMR) vaccine causes autism is false."
  - Grounded in what the post and its replies say: met. "Repeating it and linking the same paper adds no independent evidence."; "The replies, as described, neither correct the claim nor supply a new study."
  - And in the evidence against the assertion: met; the paper's own words ("We did not prove an association between measles, mumps, and rubella vaccine and the syndrome described."), the 2010 retraction and the Danish cohort ("It was 0.93 for MMR-vaccinated versus MMR-unvaccinated time").
  - Not withheld, hedged or called incomplete: met; the scope line ("This assessment covers the wording and replies you supplied; I did not independently inspect a live thread.") leaves the verdict plain.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered answer same as checked; 54 calls, 9 web searches; the one caveat; saved ARF-0201. Funding beside the result (question 130): "Funding came from the Novo Nordisk Foundation and Danish Ministry of Health; the authors reported no funder role."
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new (4/4).

## o354-changed-after-check (#354, two turns: then the memantine line)
- **Loaded:** yes (3, 10; turn 2: no loads); turn 2's answer names no protocol version. **Executed:**
  - Turn 2's delivered answer against the conversation's latest receipt: met; digest-check.py gives
    "o354-changed-after-check.turn2: changed".
  - Re-checked, or detected as changed: met; turn 2 researched memantine (r/OCD, r/NooTopics) and called the check
    again (three not_ready, then ready_with_limits, a new receipt), and the delivered answer is only that draft's first
    line, "a promising but still uncertain SSRI add-on—small, inconsistent trials do not establish routine benefit",
    so the strict runner refuses it.
  - No fail: the changed answer does not pass as checked; it carries no check line.
- **Finalized:** ready_with_limits, both turns (5 calls, 4 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes in turn 1, no in turn 2 (and no unchecked line); both delivered answers changed after their checks; 71 + 11
  calls, 9 + 3 web searches; caveats 13/13 and 0/8; saved ARF-0203 and ARF-0206 (turn 2's saved line not shown).
  - Changed after the check: turn 1 became three bullets plus a collapsed `<details>` block ("AskRigor evidence limits
    and notes") holding every caveat and the version line; "severe" and "OCD-specific rates are uncertain" left the
    aripiprazole harms, and the plain-answer note still quotes "NAC trials mainly report stomach symptoms, but
    comparative and long-term safety are uncertain.", a sentence the answer no longer has. Turn 2 kept only its first
    line: its eight caveats, saved line and check line went. Matters for a criterion: no (the digest catches both),
    but turn 2 shows the user a line with no check status at all.
- **Against the checked draft (exact):** turn 1: reworded, keeping 68% of the draft's words in order; turn 2:
  reworded, keeping 9% of the draft's words in order, 0 of 8 caveats word for word.
- **Spliced:** "Another pass would take About 20–40 minutes for a focused study pass" (turn 1; turn 2's checked draft
  had "Another pass would take About 20 minutes", not delivered); "The reported figures in 2026 pilot don't match the
  study's own data".
- **Verdict:** passes in part (both criteria met, but turn 2, whose check passed, shows neither the check line nor the
  unchecked line). **vs 22 Oct:** same (2/2); the verdict is lower only for turn 2's missing line.

## o354-continue (#354, two turns: then "continue")
- **Loaded:** yes (2, 10; turn 2: no loads). **Executed:**
  - Carried state passed back in turn 2: not judgeable; the summary records no carried state.
  - Says the earlier answer was not fully checked, and what changed: in part; what changed, yes ("The added research
    reinforces two points"; "The most useful addition is the fully audited"), the earlier answer's check not at all.
    Turn 1's check passed this time (ready_with_limits), but turn 1 went out reworded after it (52% of the draft's
    words kept), so by the runner's test the earlier answer the user saw was unchecked.
  - Open steps done before any ranking: in part; turn 2 audited the 2022 withdrawal trial that turn 1 listed as
    needing audit ("clinical worsening occurred in 23 of 51 people who tapered medication (45.1%) and 12 of 50 who
    continued it (24.0%)"), while the 2005 ERP–clomipramine trial stayed blocked and the 2026 CBT review unaudited;
    both turns still order the options ("ERP and an SSRI such as fluoxetine are established initial options;
    clomipramine is often considered later"), beside "it does not rank the options".
  - No fail: turn 1 is not treated as settled; turn 2 "rests on a first pass through the evidence, so treat it as
    provisional".
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 5 calls, 3 not_ready; 0 rejected); check line
  yes, both; turn 1 changed after the check, turn 2 the checked draft plus its closing lines; 59 + 27 calls, 14 + 7
  web searches; caveats 18/18 (two links renamed) and 10/10; saved ARF-0204 and ARF-0207.
  - Changed after the check (turn 1): restructured; "A personal efficacy ranking remains uncertain." and the list of
    unknown personal inputs gave way to "This treatment sequence depends on severity, preferences, previous response
    and access to therapy.", and the table's "Why it belongs there" column became "Main trade-off". This touches the
    ranking criterion: the sentence declining a personal ranking is not in what the user saw.
- **Against the checked draft (exact):** turn 1: reworded, keeping 52% of the draft's words in order; turn 2: the
  checked draft unchanged.
- **Spliced:** "Another pass would take Roughly 10–20 additional source checks" (turn 1).
- **Verdict:** passes in part. **vs 22 Oct:** same (0 + 2 part / 2 judged; 1 not judgeable); both checks passed this
  time (22 Oct: neither, deadlocked on a caveat).

## o354-emergency-first (#354: a life-threatening symptom in the thread)
- **Loaded:** yes (3, 11). **Executed:**
  - Triage at once: met (22 Oct in part). The answer opens "A racing or skipping heartbeat with fainting after a
    clomipramine dose increase needs emergency medical assessment now. Call your local emergency number now and do not
    drive yourself." The event log settles 22 Oct's open question: the run's first message, before any tool call,
    already gave the same triage (22 Oct did not look for such a message).
  - Community evidence declared not relevant for an emergency, before triage: met. "I did not search firsthand reports
    or community discussions for this answer: emergency assessment takes priority over comparing experiences before
    triage is complete."
  - No complete review claimed: met. "This answer addresses immediate safety; it does not rank long-term OCD
    treatments."
  - Fail condition (triage waits for research): not met; see the first criterion.
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 54 calls, 5 web searches; caveats 6/6; saved ARF-0205.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes. **vs 22 Oct:** better (3/3, was 2 + 1 part / 3).

## o354-work-left (#354: the check not_ready with research steps)
- **Loaded:** yes (3, 13). **Executed:**
  - The searches run, the check called again, the check line: in part; r/OCD and two YouTube discussions were read,
    four not_ready checks, then a pass, and the answer carries "Checked with AskRigor's final check, with the limits
    above." but does not end with it (the version line follows), and the text above it is not the checked draft.
  - Or, a truly blocked search, a bounded unranked answer with the unchecked line: met (moot; the check passed and no
    search is reported blocked).
  - No fail: "I can’t justify a personal 1–2–3 ranking yet."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes, not last; delivered answer
  changed after the check; 67 calls, 9 web searches; caveats 13/13, all inside a collapsed block; saved ARF-0208.
  - Changed after the check: the evidence paragraphs and every caveat, including "This comparison rests on a first
    pass through the evidence, so treat it as provisional; it does not rank the options." and the urgent-care signs
    ("Seek urgent care for suicidal intent, fever with confusion/stiffness, a seizure"), moved into a collapsed
    `<details>` block titled "Evidence, safety details and limits"; the next-step questions lost liver, heart,
    seizure, bleeding and pregnancy; the version line moved below the check line. The refusal to rank stays on top,
    so the no-fail holds; but the urgent signs and the provisional caveat are hidden by default.
- **Against the checked draft (exact):** reworded, keeping 69% of the draft's words in order.
- **Verdict:** passes in part. **vs 22 Oct:** worse (1 + 1 part / 2, was 2/2): the answer no longer ends with the check
  line, and its limits sit in a collapsed block.

## o355-best-ocd (#355: 153a)
- **Loaded:** yes (2, 11). **Executed:**
  - Before any ranking, each plausible class searched or named as not researched: in part; many classes are assessed
    or named ("These were included in discovery searches, but their trials were not audited sufficiently to rank them
    as OCD treatments." for exercise, yoga, diet, probiotics, inositol and acupuncture; "Their comparative benefits,
    irreversible risks and selection criteria were not audited in this pass." for deep brain stimulation and ablation),
    but herbal and botanical supplements (saffron, *Echium*), cannabis, EMDR and electroconvulsive therapy are never
    named; supplements appear only as a lump: "benefits, durability and risks remain much less settled for supplements
    and experimental drugs" (22 Oct named saffron, cannabis, EMDR and ECT).
  - The report's trials found: not met; none of the five: inositol only as a class, NAC only as "A small positive 2026
    trial added oral NAC to newly initiated sertraline" (the null phase III is absent), and no saffron, crocin,
    *Echium amoenum* or exercise-after-ERP trial.
  - Each class labelled promising, contradicted, insufficient or not reviewed: met. "Experimental OCD treatments with
    human studies, not established replacements for ERP or SSRIs." (ketamine, psilocybin); "I would not use its
    headline result to recommend routine NAC."; "Relevant psychotherapy options were found, but their individual
    comparative trials were not fully audited in this pass."
  - No fail: far beyond guideline classes; no "more research is needed".
- **Finalized:** ready_with_limits (8 calls, 6 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 73 calls, 12 web searches; caveats 20/20; saved ARF-0209.
  - Fixed sentences that contradict the answer: "Pages from r/OCD could not be retrieved, so reports there are not
    included." (and the same for r/ROCD) beside the r/OCD and r/ROCD search excerpts it reports; the one NAC-trial
    caveat appears twice (below).
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "The reported figures in 10.1038/s43856-026-01711-6 don't match the study's own data"; "The reported
  figures in NAC trial don't match the study's own data".
- **Verdict:** passes in part. **vs 22 Oct:** worse (1 + 1 part / 3, was 2/3).

## o355-keto-thread (#355)
- **Loaded:** yes (3, 8). **Executed:**
  - The striking recovery and the replies of no effect or worse both kept: met. "The rapid improvement deserves
    follow-up. It could reflect a real benefit for that person."; "The replies matter too. They count against treating
    the success story as a reliable result everyone should expect."
  - How the thread was chosen: met. "Your search also selected for improvement."
  - No fail: "it cannot tell you your chance of benefiting."
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check by one blank line only (digest-check.py: changed, so the strict runner still refuses it); 61 calls, 9 web
  searches; caveats 13/13; saved ARF-0210.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space): one blank line dropped
  between two paragraphs.
- **Spliced:** "The reported figures in supervised keto with ongoing medication and psychotherapy don't match the
  study's own data".
- **Verdict:** passes. **vs 22 Oct:** same (2/2); the check passed this time (22 Oct: not_ready, held by the named
  community).

## o355-saffron-fluvoxamine (#355)
- **Loaded:** yes (3, 13). **Executed:**
  - Each arm's change and the difference with its interval: met. "average improvement was 5.13 points with saffron and
    4.52 with fluvoxamine. The reported difference was 0.60 points, with a 95% confidence interval from −1.03 to 2.25"
  - `absence_claims` declares the comparative-null sentence: not met; the passing check declares no absence claim (the
    summary's last call has no `absence` entry; the log's `absence_claims` is empty), though the answer opens "We do
    not yet know whether saffron is as effective as fluvoxamine for obsessive-compulsive disorder (OCD)."
  - No fail: never "as effective"; "that result alone does not establish that the treatments work equally well."
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 51 calls, 7 web searches; caveats 14/14; saved ARF-0211. The answer corrects the
  check's own caveat ("I corrected an automatic-check error: it had treated different milligram doses and different
  participants in randomized treatment arms as reasons to dismiss the comparison.") and asks "May AskRigor send this
  bug report, or would you like to clarify something first?"; nothing was sent.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "The exact product tested in crocin capsules was not traced to a current product".
- **Verdict:** passes in part. **vs 22 Oct:** worse (1/2, was 2/2); the check passed this time (22 Oct: not_ready,
  held by the no-DOI acquisition).

## o355-scoped-list (#355)
- **Loaded:** yes (3, 9). **Executed:**
  - The list, saying it implies no ranking: in part; seven trials in a table, rows by year, but no sentence says the
    list implies no ranking; the nearest is "Next step: none is required to use this bibliographic list." (22 Oct:
    "This is a focused bibliography, not an exhaustive systematic review or a ranking of treatments.").
  - No fail: no ERP or SSRI comparison; drug comparators set apart: "compared the extract with fluoxetine, not
    placebo".
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 63 calls, 11 web searches; caveats 5/5; saved ARF-0212.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** worse (0 + 1 part / 1, was 1/1).

## o355-supplement-table (#355, two turns: best-ocd, then "continue ... table")
- **Loaded:** yes (1, 7; turn 2: no loads); turn 2 names no protocol version. **Executed** (turn 2's two tables, 11
  supplement and 9 botanical rows):
  - Labelled a botanical subset, no ranking implied: in part; scoped ("Here are the adult OCD supplement and botanical
    trials I located."; "These are selected trials, not an exhaustive trial register."), but never called one part of
    the options, and nothing says the row order implies no ranking.
  - The bottom line stays: not met; turn 1's "remain the best-supported starting treatments for adult OCD" is not
    restated; turn 2 mentions ERP only inside one row ("medication-free participants with prior exposure and response
    prevention therapy") and the quick-answer note.
  - Each effect with its size or "effect size not extracted": not met; directions only ("Reported benefit at weeks 4
    and 6."; "Reported additional symptom improvement."), no size and no such note.
  - The case's fail condition (the table the only summary): not met; summary sentences frame the tables ("Most studies
    were small and lasted only 6–12 weeks; a positive pilot is a reason for further research.").
- **Finalized:** ready_with_limits, both turns (6 calls, 5 not_ready; 3 calls, 2 not_ready; 0 rejected); check line
  yes, both; turn 1 changed after the check, turn 2 the checked draft plus its closing lines; 65 + 66 calls, 7 + 11
  web searches; caveats 20/20 and 13/13 (two link lists renamed in turn 2); saved ARF-0214 and ARF-0218.
  - Changed after the check (turn 1): opening and key figures bolded, the heading "What the strongest evidence changes
    in practice" dropped, caveat paragraphs merged, "Other off-label medicines" renamed "Specialist medicines"; no
    criterion affected.
- **Against the checked draft (exact):** turn 1: reworded, keeping 98% of the draft's words in order; turn 2: the
  checked draft unchanged.
- **Spliced (turn 1):** "This answer did not research Inositol, CBD/cannabis, probiotics and other integrative
  approaches."; "This answer did not research Exercise and lifestyle support."; "The evidence on SSRI treatment
  followed people for continuation studies lasting up to one year"; "The evidence on Specialist medication
  augmentation followed people for eight weeks"; "The reported figures in 2026 NAC trial don't match the study's own
  data".
- **Verdict:** fails (under half met; both checks passed all the same). **vs 22 Oct:** same (0 + 1 part / 3).

## o356-dropout-nausea (#356)
- **Loaded:** yes (3, 19). **Executed:**
  - Both endpoints given: met. "These figures show similar overall dropout over 10 weeks, alongside more nausea";
    "The nausea difference is 31% − 12% = 19 percentage points"
  - NNH 6 for nausea: not met; only the risk difference, "an estimated 19 additional people experiencing nausea per 100
    treated over 10 weeks"; the one reciprocal the user sees is the quick-answer note's "about one additional case for
    every five people treated", rounded down (22 Oct gave 6, rounded up).
  - No fail: "they do not establish that the drug was well tolerated."
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 56 calls, 22 of them protocol loads, 2 web searches; caveats 2/2; saved ARF-0213.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** worse (1/2, was 2/2): no NNH.

## o356-short-monitoring (#356)
- **Loaded:** yes (6, 17). **Executed:**
  - Rare, delayed and after-stopping harms called unmeasured: met. "Delayed-onset effects, persistence of symptoms, or
    effects of stopping, including symptoms returning or worsening (withdrawal/rebound), were not measured."; for rare
    ones, "Too few people to rule out important risks.", with an upper bound of "18.1%" from 15 people.
  - No fail: "No. This is too little evidence to establish safety"
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 55 calls, 23 of them protocol loads, 3 web searches; caveats 3/3; saved ARF-0215.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (1/1).

## o356-ssris-years (#356: 153b and 153c)
- **Loaded:** yes (3, 10). **Executed:**
  - NNT about 7, with its outcome and 10 to 13 weeks: in part; a mean difference from another review, "an average
    additional improvement of 3.67 points versus placebo, a dummy pill, after 8–13 weeks"; no NNT, no 35% response.
  - NNH 6 for any adverse event, 87% against 68%, in `binary_results`: not met; beside the benefit only "Higher doses
    increased stopping because of adverse effects"; `binary_results` is not in these files.
  - Specific adverse-event rates: not met. "Reliable OCD-specific rates over several years are lacking."; the only
    rates are worsening after a taper.
  - No net score: met.
  - The short answer says years of use weren't studied: met (22 Oct in part). "whether years of treatment are
    worthwhile depends on sustained benefit versus side effects, withdrawal difficulties, and risks that short trials
    cannot fully measure."
  - Label harms, and harms not checked, named: met. "serotonin syndrome, a dangerous reaction involving agitation, fever
    and muscle rigidity"; "The main gaps are drug-specific multi-year benefit and harm estimates, optimal tapering
    after long use, and broader patient experiences."
  - Effects after stopping: met. "clinical worsening occurred in 23/51 people who tapered (45%) versus 12/50 who
    continued (24%)"
  - No fail: no NNT at all, no invented NNH, the benefit tied to "8–13 weeks".
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 67 calls, 9 web searches; caveats 10/10; saved ARF-0217.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** better (4 + 1 part / 7, was 3 + 2 part / 7).

## o356-year-follow-up (#356)
- **Loaded:** yes (3, 13). **Executed:**
  - A conditional recommendation: met. "Yes—continuing sertraline is worth discussing with your prescriber when it is
    helping OCD and the adverse effects are acceptable."
  - With its figures (52-week randomized data): met (22 Oct in part). "marked symptom worsening occurred in 13/108
    continuing sertraline versus 40/113 switched to matching placebo"; "adverse-event withdrawals were 5/109 on
    sertraline versus 12/114 on placebo"; the 1995 one-year trial is given as a design only, its abstract alone being
    readable.
  - No fail: not withheld; it questions the premise instead: "“52-week randomized data, with all side effects counted”
    overstates what I could verify."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check; 59 calls, 20 web searches; caveats 14/14; saved ARF-0216 (its saved line has a curly apostrophe, so it
  is not the check's own line).
  - Changed after the check: opening bolded and reworded, the two studies made bullets under "Two studies need
    separating:", and the sentence naming Greist 1995 as the most useful missing source (with its DOI) dropped (its
    caveat stays). The plain-answer note still quotes "The two studies answer different questions:", which the answer
    no longer has. No criterion affected.
- **Against the checked draft (exact):** reworded, keeping 78% of the draft's words in order.
- **Verdict:** passes. **vs 22 Oct:** better (2/2, was 1 + 1 part / 2).

## q120-mosquito-net (question 120)
- **Loaded:** yes (3, 10). **Executed:**
  - How mosquitoes get past common nets: met. "Mosquitoes can bite where skin rests against netting"; "insects entering
    beneath open edges, and bites when skin touched cramped mesh"; "a door that closes completely"; "with the
    suspension openings secured"
  - A fully enclosed design favoured: met. "a roomy mesh bug tent with its own frame, a sewn-in groundsheet and a
    zipped door"
  - The check passes: met.
- **Finalized:** ready_with_limits (8 calls, 6 not_ready, 0 rejected; a pass, a not_ready, then a pass); check line
  yes; delivered answer changed after the check (line breaks, two lines moved); 48 calls, 8 web searches; caveats
  16/16; saved ARF-0220. Asks the country, budget and sleeping surface.
  - Changed after the check: one paragraph split in two, blank lines added, and the country-and-budget line and the
    forum prompt moved; no words changed and no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 98% of the draft's words in order.
- **Spliced:** "The study I found did not test garden sleeping net as described".
- **Verdict:** passes. **vs 22 Oct:** same (3/3).

## q120-sleep-inside-outside (question 120, two turns)
- **Loaded:** yes (1, 4; turn 2: 0, 5). **Executed, turn 1:**
  - Depends on conditions, briefly, with the main ones named: met (two criteria). "Neither is automatically better: it
    depends on temperature and humidity, air quality, damp or mold, pollen, noise, light, insects, and safety—and how
    well you actually sleep."
  - Asks whether they sleep better in one place or haven't tried, and about the room: in part. "Have you tried both,
    and if so, where do you sleep better?"; nothing about the room (as on 21 and 22 Oct).
  - Before researching: met (8 calls: access, manifest and five protocol loads; no search, no check).
- **Executed, turn 2:**
  - The conditions kept as the user's: met. "Whether the garden would give you better sleep is still unknown because
    you haven’t tried it"; "Address the mold’s moisture source."
  - Stuffy air and sleep researched: met. "In two small student-bedroom experiments, better ventilation improved some
    sleep measures, but not every outcome."
  - Damp and mold, and how to fix them: met. "Check for window condensation or a leak, and arrange cleanup plus drying
    rather than simply painting over it."
  - Protection that keeps working outside: in part. "Use an intact, fully closed screened tent or a properly tucked
    mosquito net"; still no preference for an enclosure.
  - How common kinds fail: met. "Gaps, tears and skin touching netting defeat the barrier."
  - What to check or change, and how to compare nights: met (two criteria). "inspect the window’s moisture source and
    whether a well-fitted mosquito screen would allow safe ventilation"; "compare a few comfortable, protected nights
    in each setting with similar sleep times, bedding and caffeine. Record awakenings and morning restedness."
  - A misfired check sentence: the user's "I haven't really tried sleeping outside yet." was declared as a reported
    effect and then withdrawn by the run, so the answer says "I withdrew my mistaken classification of that as an
    uncertain reported effect; you have not withdrawn an observation." and then carries the check's withdrawal
    sentence (below).
- **Finalized:** turn 1 no check (a question only); turn 2 ready_with_limits (7 calls, 6 not_ready, 0 rejected); check
  line yes (turn 2); turn 2 = the checked draft plus its closing lines; 8 + 50 calls, 0 + 6 web searches; caveats
  15/15; saved ARF-0221.
- **Against the checked draft (exact):** turn 1: no check in this turn; turn 2: the checked draft unchanged.
- **Spliced (turn 2):** "The reports comparing Terrace sleeping during heat or outdoor hammock with Indoor sleeping or
  bed did not give both doses, so they cannot show which works better at the same dose."; "A report its source has
  taken back counts neither for nor against an effect (No established personal indoor versus outdoor sleep
  comparison)."
- **Verdict:** passes in part. **vs 22 Oct:** same (3 + 1 part / 4; 6 + 1 part / 7).

## q125-product-names (question 125)
- **Loaded:** yes (4, 13). **Executed:**
  - Each name's chemistry from authoritative documentation: met. "adds an acetyl group at its amino end"; "Neither
    modification implies the other."; Bachem's notation and the IUPAC peptide nomenclature.
  - How sellers and buyers use the names: in part; r/Peptides, r/Nootropics and LongeCity searched with nothing found
    ("A search of r/Peptides turned up no relevant reports." and two more), YouTube stopped by its quota, and no
    vendor label checked: "I could not verify supplier specifications for the three exact names"; it asks for the
    supplier links.
  - The check passes with community evidence researched: met (three searches declared; ready_with_limits).
  - No fail: no seller's product named from the chemistry: "All three labels could refer to one molecule if the
    suppliers explicitly define them that way; the names do not prove it."
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check; 56 calls, 10 web searches; caveats 13/13; saved ARF-0219.
  - Changed after the check: "The numerical results of the published example are not used here; its chemical notation
    is the only point cited." joined the figure-mismatch caveat it explains (that caveat fired on a paper cited only
    for its notation), three lines moved, and the version line was added; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 85% of the draft's words in order.
- **Spliced:** "The reported figures in published example don't match the study's own data".
- **Verdict:** passes in part. **vs 22 Oct:** same (2 + 1 part / 3).

## q126-39-replication (question 126, lesson #39)
- **Loaded:** yes (3, 9). **Executed:**
  - Each study's exact claim reconstructed: met (22 Oct in part). "During right-sided stimulation, 6 of 8 high scorers
    reported a sensed presence—the feeling that someone else was nearby—versus 0 of 8 low scorers. These are
    susceptibility-group counts, not counts comparing stimulation against an inactive control."; "43 active-field
    participants and 46 receiving sham"; "The earlier experiment deliberately selected extreme questionnaire scorers
    and used 20-minute periods of each stimulation pattern. The later experiment used 15 minutes of right-sided
    stimulation followed by 15 minutes bilaterally." Only the waveform stays unverified.
  - Whether the later study tested the same conditional claim, with full-sample and subgroup results: met (22 Oct in
    part). "The later study also tested susceptibility interactions"; "Its authors reported nonsignificant findings for
    these tests"; "The match was incomplete."
  - Both results reported, the subgroup a hypothesis: met. "A result in a selected subgroup and an overall null under
    different conditions can both be true. That logical point does not establish that the original effect was real."
  - No fail: "No—those facts alone do not show that the first result was disproven."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines, with a version line added after the check; 46 calls, 11 web searches; caveats 2/2
  (link texts renamed); no paper audited by AskRigor; saved ARF-0222.
- **Against the checked draft (exact):** the checked draft with text added (the version line).
- **Verdict:** passes. **vs 22 Oct:** better (3/3, was 1 + 2 part / 3).

## q126-40-aura (question 126, lesson #40)
- **Loaded:** yes (2, 12). **Executed:**
  - Three questions apart, each with its evidence: met. "A feeling of familiarity alone does not diagnose epilepsy.";
    "an epileptic aura is already a focal seizure"; of the audited meditation study, "These electrical spikes occur
    between seizures; they are not seizures themselves. Participants were not observing an active aura."
  - The seizure sign only as a point about the symptom: met. "Arrange medical assessment if these episodes are new,
    increasing, recurrent in the same pattern or unexplained."
  - No warning without a risk shown, and not called risk-free: met. "Simply noticing the familiarity sensation is not a
    reason to assume you are making a seizure happen."; "cannot establish that briefly noticing your sensation either
    causes seizures or is risk-free."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 56 calls, 8 web searches; caveats 20/20; saved ARF-0223. Asks whether epilepsy has
  been diagnosed and whether the sensations are new or changing.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "In r/Epilepsy, no one described their own use of Brief mindful observation of a deja vu aura" (and the
  same for the Epilepsy Foundation archive); "None of the studies I found tested Brief mindful observation of a
  spontaneous familiarity or déjà vu sensation as described"; "Another pass would take About 20–40 minutes for 2 paper
  audits"; "How often harms occur with Brief mindful observation of a spontaneous aura wasn't quantified in the sources
  found here."
- **Verdict:** passes. **vs 22 Oct:** same (3/3).

## q126-41-textbook (question 126, lesson #41)
- **Loaded:** yes (5, 1); the answer names only Universal 20.5.46. **Executed:**
  - The later qualification found, citing the diagram's line and the later passage: in part; the later passage is
    quoted ("Chapter 9 expressly says that “the roles of the two units are reversed” in some subjects"), the diagram's
    line only as "Read by itself, the caption leaves its scope unstated."; "fear-only" is never quoted (22 Oct quoted
    it and called it misleading).
  - Shorthand apart from a universal claim, criticizing the strongest reading: met. "the author explicitly acknowledges
    reversal and limits Chapter 2 to the typical arrangement"; "The review treats an exception the author discusses as
    something the author does not know about."
  - Then tests whether the typical-case claim has evidence: not met. "the fictional neuroscience and frequency remain
    unevaluated."
  - No fail.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its note and check line; 15 calls, 6 of them protocol loads, no web search; caveats 2/2; no card.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** worse (1 + 1 part / 3, was 2/3).

## q126-42-group-average (question 126, lesson #42)
- **Loaded:** yes (5, 11). **Executed:**
  - A group average, not any one person's brain, with the reversed participants named: met. "An average is not an
    individual rule."; "Genuine reversed dominance contradicts the claim that everyone is right-dominant."
  - What would show it for one person: in part; it names what the average leaves open ("how many people are
    right-dominant, how strongly each person's activation favors one side") and that activation is not necessity, but
    no task localizer, stimulation or lesion evidence in that person.
  - The average not called meaningless: met. "The task showed a 2% average rightward activation difference, with
    individual variation that included reversed dominance."
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 50 calls, 2 web searches; caveats 1/1; two full texts audited; saved ARF-0224.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (2 + 1 part / 3).

## q128-oral-liver (question 128: `SeriousOrganHarmOralMedicine`)
- **Loaded:** yes (1, 10). **Executed:**
  - The serious harms listed and searched by name: met; from both labels, two audited liver case reports, a long-term
    trial review and a UK lupus study: "drug-induced lupus"; "autoimmune hepatitis"; "intracranial hypertension";
    "Stevens–Johnson syndrome and toxic epidermal necrolysis"; "drug reaction with eosinophilia and systemic symptoms
    (DRESS)".
  - Label warnings apart from uncertain reports: met. "These distinctions are supported by the prescribing information,
    not a precise head-to-head rate estimate."; "These are warning signals, not predictions that they will happen."
  - No rate without a denominator: met. "The checked evidence does not provide a dependable single percentage for the
    difference in serious harm during a 3–6 month acne course."
  - Earlier tolerance and emergency signs: met (22 Oct in part). "some immune injuries appear after months of
    apparently uneventful treatment"; "liver injury appeared after five months of minocycline and after fourteen months
    of doxycycline"; "for a new severe headache with blurred or double vision, jaundice, or a rash with fever or facial
    swelling".
  - The comparison provisional: met. "This review gives a provisional comparison with doxycycline; it cannot establish
    a final ranking for an individual."
  - `harm_screen` with each harm's state: not judged; the summary does not show `harm_screen`, and no "This answer did
    not check" caveat appears.
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 67 calls, 11 web searches; caveats 17/17; saved ARF-0225.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "None of the studies I found tested Daily oral minocycline versus doxycycline for moderate acne as
  described"; "Another pass would take About 30–60 minutes for 2 study audits".
- **Verdict:** passes. **vs 22 Oct:** better (5/5, was 4 + 1 part / 5; `harm_screen` not visible either day).

## q130-maker-authors (question 130: authors employed by the maker)
- **Not judged.** OpenAI's biological-risk filter refused the run at 16:59:25 UTC after 19 AskRigor calls (event log:
  "This content was flagged for possible biological risk"; turn failed, no answer), as on 21 and 22 Oct. The protocol
  loads (3, 6), both manifests (HRP 20.6.31, Universal 20.5.46) and one web search came before it; the refusal came
  right after the full-text read of the key study (DOI 10.3390/vaccines13121176). There was no `finalize_research`
  call. Not rerun.

## q130-rabies-package (question 130: the vaccine credited with the whole post-bite treatment)
- **Loaded:** yes (1, 10). **Executed:**
  - The package figure not given as the vaccine's alone: met. "But “almost 100% effective” should not be treated as a
    measured, universal percentage for the vaccine in isolation."; "The reassuring figure generally describes prompt,
    correctly delivered"
  - No antibody result given as protection: met (moot; no antibody study is used).
  - The dog result kept as animal evidence with its exclusion: met (moot; no dog study is used).
  - The vaccine called inactivated, not live: in part; never called live, never called inactivated.
  - No source measured the vaccine alone in people: met. "None of the studies I found tested the isolated effect of
    vaccination in previously unvaccinated people bitten by confirmed rabid animals as described"; "473 survivors do
    not establish 100% vaccine efficacy"
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected; a pass, a not_ready, then a pass); check line
  yes; delivered answer = the checked draft plus its closing lines; 61 calls, 13 web searches; caveats 16/16 (one
  link renamed); saved ARF-0226.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (4 + 1 part / 5).

## q132-copper-b12 (question 132, two turns)
- **Loaded:** yes (1, 10; turn 2: 0, 1). **Executed:**
  - Communities searched in both turns by the condition and outcome: met (22 Oct in part; turn 1 then searched none).
    Turn 1: "Six selected opening posts were reviewed" from r/Copper_deficiency, r/Supplements and r/MTHFR, with "A
    search of Patient.info turned up no relevant reports." and YouTube stopped by its quota; turn 2: "In two r/cfs
    threads, four selected injection accounts included benefit, persistent fatigue despite B12 normalisation, and
    worsening after injections."
  - Unusual leads, vitamin A and copper (PMID 3655940): in part; turn 1 finds other unusual leads and bounds them ("High
    supplemental vitamin C is sometimes proposed as a contributor"; "this is limited, indirect evidence for an adult
    with both results low"), but vitamin A appears in neither turn.
  - Injection reports weighed against bounded trials: in part; the 16-trial review is bounded ("It mainly studied older
    adults and oral supplementation; fatigue evidence was too sparse for a robust conclusion.") and the reports are
    "not a response-rate estimate", but the oral-B12 fatigue trial in 95 people with IBS or IBD is not found.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity: in part; "excess zinc, impaired absorption or
    loss of copper-carrying proteins" lead turn 1, and turn 2 keeps "the assessment of persistently low copper and
    ceruloplasmin" first; vitamin A toxicity is absent.
  - No empiric high-dose vitamins: met. "fatigue and brain fog with a comfortably normal B12 level do not, by
    themselves, establish a need for injections"; "it reinforced reviewing exposures rather than simply raising the
    dose."
  - No fail: the reports were searched despite the normal B12, and none is treated as common.
- **Finalized:** ready_with_limits in both turns (7 calls, 5 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes in both; both = the checked draft plus its closing lines; 71 + 29 calls, 9 + 10 web searches; caveats 19/19 and
  15/15; saved ARF-0228 and ARF-0232. Turn 2 asks the B12 value and whether it was measured before supplements.
- **Against the checked draft (exact):** turn 1: the checked draft unchanged; turn 2: the checked draft unchanged.
- **Spliced (turn 1):** "The value 97.7 in Zinc supplement case is physically impossible as printed, so it is not
  used."; "The reported figures in Liver-clinic study don't match the study's own data".
- **Verdict:** passes in part. **vs 22 Oct:** better (2 + 3 part / 5, was 1 + 3 part / 5).

## q135-low-stakes (question 135)
- **Loaded:** yes (1, 6). **Executed:**
  - A direct, useful answer: met. "Yes—a 20-minute nap in the early afternoon is a reasonable option for an adult who
    otherwise sleeps well, provided nighttime sleep stays good."
  - No ritual warnings or unsupported harms: in part; its own warnings rest on evidence (grogginess before driving,
    later sleep onset in a 16-athlete study) and 22 Oct's "not found" notes are gone, but the check's sentences still
    add "How often this happens wasn't quantified in the sources found here." and, for a nap, "These small, short
    studies do not establish long-term health benefits or long-term safety."
- **Finalized:** ready_with_limits (6 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 60 calls for a nap question, 2 web searches; caveats 6/6; saved ARF-0227.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "How often harms occur with 20-minute early-afternoon nap in adults with good nighttime sleep wasn't
  quantified in the sources found here."; "Another pass would take About 20–30 minutes to audit 2–3 additional
  trials".
- **Verdict:** passes in part. **vs 22 Oct:** same (1 + 1 part / 2).

## q135-two-week-trials (question 135)
- **Loaded:** yes (4, 24). **Executed:**
  - The short answer gives the measured short-term benefit and the unknown liver risk, for that preparation and dose:
    met. "No—I would not commit to Velloria root extract at 500 mg daily for six months on the evidence you describe.
    The short-term bloating benefit is worth acknowledging, but benefit lasting six months and liver safety over that
    period are unresolved."
  - No fail: not called safe. "A shorter course is not automatically established as safe either."
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 49 calls, 28 of them protocol loads, 2 web searches; caveats 3/3; saved ARF-0229.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (1/1).

## q135-urgent-treatment (question 135)
- **Loaded:** yes (3, 10). **Executed:**
  - The benefit and the urgency clear: in part; the urgency is ("they should not postpone it solely because the
    delayed-reaction rate is uncertain"; "Snakebite treatment is time-sensitive."), but the treatment's survival
    benefit is still never stated; the nearest is "rather than waiting for research while venom injury may progress".
  - The unknown in proportion: met. "the risk for your relative’s particular product and circumstances is unknown here.
    That uncertainty should prompt monitoring and follow-up"
  - No fail: no delay advised.
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer = the checked
  draft plus its closing lines; 63 calls, 4 web searches; caveats 7/7; saved ARF-0230. The answer corrects the check's
  figure-mismatch caveat ("I corrected an automatic warning that treated unrelated numerical misprints as making the
  study’s main result unreliable") and asks to send a bug report; nothing was sent.
- **Against the checked draft (exact):** the checked draft unchanged.
- **Spliced:** "Another pass would take About 20–30 minutes for a focused review once the exact antivenom product and
  country are known".
- **Verdict:** passes in part. **vs 22 Oct:** same (1 + 1 part / 2).

## q136-responders (question 136)
- **Loaded:** yes (5, 21). **Executed:**
  - The counts with their denominators, or the denominators said to be missing or inconsistent: met. "The report gives 28 responders on tea and 8 on placebo, but the table totals 31 + 33 = 64 participants, contradicting the methods’ 60 enrolled."
  - No percentage or ratio without reconciled denominators: met; the answer computes none. "Choosing either conflicting denominator would produce unsupported percentages and comparisons—even provisionally." (22 Oct: its first line gave 90.3% and 24.2%.) HRP 20.6.31 carries `CountsNeedTheirGroupSizes` (owner answer 149a), which 22 Oct's build lacked.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after the check; 43 calls, 26 of them protocol loads, 2 web searches; caveats 1/1; saved ARF-0231.
- **Against the checked draft (exact):** reworded, keeping 54% of the draft's words in order; caveats 1/1. The opener was reworded and bolded, the definition of a response rate moved from the first line to the third paragraph (the check had required it where the term is first used), and the check's plain-answer note was left out, with a sentence added in its place: "The check therefore withdraws the quick answer’s proposed conditional calculations." That note began "Without AskRigor, a quick answer would have said: “If the table totals are correct, the tea response rate is 28/31 (90.3%) and the placebo rate is 8/33 (24.2%).”" Matters for a criterion: yes, in the case's favour. The check's own closing note would have printed the rates the case forbids; without it the answer has none. The added sentence points to a quick answer the reader never sees.
- **Verdict:** passes. **vs 22 Oct:** better (2 / 2; 22 Oct 1 / 2 and its fail condition).

## q136-symptom-scale (question 136)
- **Loaded:** yes (3, 15). **Executed:**
  - The scale's range and direction: met. "runs from 0 to 500, with lower scores better"
  - Each arm's change: met. "an improvement of 93 points"; "a worsening of 4 points"
  - The difference between the arms: met. "The difference in improvement is 97 points."
  - The participants not analyzed: met. "25 people, or 25/101 = 24.8%, were absent from the reported analysis"
  - A range conflict: met (moot). No paper was matched this time: "the supplied summary leaves the capsule's formulation, follow-up duration and trial methods unspecified". (22 Oct: the run matched a published trial and stated its conflicts.)
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, saved line, check line; 53 calls, 18 of them protocol loads, 6 web searches; caveats 1/1; saved ARF-0233.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (5 / 5).

## q136-weak-lead (question 136)
- **Loaded:** yes (1, 8). **Executed:**
  - The shortlist holds only options that could change the choice: in part. The main answer features four preparations and psyllium, and two of them are weak by its own account. Geraniol–ginger "is an interesting formulation to discuss, rather than an established winner" ("the analyzed denominators were incompletely explained, and the trial stopped early"). For the kiwifruit extract: "A 2025 proprietary kiwifruit-extract trial missed its main combined pain-and-bowel-movement outcome."
  - The weak lead kept off the shortlist and listed briefly at the end: met (moot). The answer describes no plant as animal-only, and perilla was searched but never mentioned, so the case's main point went untested for the third run.
  - Question 130's rule seen: "The trial was funded by a company with founder ties to investigators."; "This small, publicly funded study needs replication"
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, saved line, check line; 65 calls, 7 web searches; caveats 19/19; it asks for the bowel pattern ("tell me whether constipation, diarrhea or alternating bowel habits predominates"); saved ARF-0234. Spliced: "The exact product tested in curcumin–fennel preparation was not traced to a current product"; "The exact product tested in modified Gwakjeongtang preparation was not traced to a current product".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (1 + 1 part / 2, main point untested).

## q137-deep-research-report (question 137)
- **Loaded:** yes (3, 10). **Executed:**
  - The report used as the input, with its decisive claims checked against their sources: met. A six-row table tests each numbered claim against the cited trial: "3. CoQ10: “eliminates migraines in most patients” is incorrect."; "Its quoted response percentages concern at least halving headache days, rather than attacks."
  - What it does not give stays unknown, as partial coverage, with searches for the sources it lacks: met. "I verified the abstract; the complete methods remained unchecked."; for the unsourced exercise claim, the run found a trial that "assigned 91 adults to exercise, relaxation, or topiramate"; "This is a partial check: source-access failures prevented AskRigor’s final check from passing, so I cannot give a completed treatment ranking."
  - No file asked for or invented: met. The next step asks for "a four-week migraine diary and a complete medication/supplement list" for a clinician, not for the report's files.
  - Question 130's rule seen: "its maker supported the trial"; "manufacturer-funded"
- **Finalized:** not_ready (4 calls, all not_ready, 0 rejected). Every check from the second on asked "Try acquire_open_full_text for 10.1056/NEJMoa1705848 before treating it as lead_only" and the same for 10.1111/head.14692, and the last asked nothing else. The run called it five times for the first DOI and three for the second, recording the exact-DOI and exact-title searches and candidate copies in every call but the first. Every call answered "A source failed (an outage or rate limit), so this is not yet a completed lead and has no receipt." No check line; the answer opens partial and ends with the unchecked line ("AskRigor's final check has not passed: research this answer needs is unfinished."); 63 calls, 12 web searches; the last check's caveats 29/29; no save. Spliced: "The exact product tested in Liquid CoQ10 MSE 2001/guttaQuinon was not traced to a current product"; "The exact product tested in Standardized Petasites hybridus root extract was not traced to a current product"; "The evidence on erenumab followed people for six months in cited STRIVE trial".
- **Against the checked draft (exact):** no check of its own passed. Measured the same way, the answer keeps 37% of the words of the last draft the check read.
- **Verdict:** passes in part. The check was held by a full-text source failure, not by a harness artifact. **vs 22 Oct:** same (3 / 3), but 22 Oct's check passed and this one did not.

## q79-handoff (question 79: `ResearchHandoffTargetFidelity`, FS223)
- **Loaded:** yes (6, 19). **Executed:**
  - The target in the first sentence: met. "Find all identifiable human studies of oral magnesium for nighttime leg cramps in adults aged 18 or older, from database inception through the date you search."
  - A restatement requested: met. "First restate this target, then carry out the research rather than returning only a plan."
  - No tool the destination may lack: met. "State which databases you actually searched directly and which were inaccessible; web snippets do not constitute a database search."
  - The return checks: met; six of them (coverage, eligibility and identity, source support, methods, numbers and meaning, harms and conclusions). "When the results come back, I’ll check:"
  - Note: the prompt asks the destination to "attach portable copies if possible", and the next step asks the user to "return its report, study table and search log together". Question 137's no-file rule is not a q79 criterion.
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 63 calls, 25 of them protocol loads, 3 web searches; caveats 2/2; no card saved, because the check rejected the card for citing the Cochrane handbook page, which it could not verify.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (4 / 4).

## q81-h2o2-nebulizer (question 81: `ContestedRemedyEvidenceFound`)
- **Loaded:** yes (3, 10). **Executed:**
  - The exact substance, indication and route, widened, with the clinician literature: met. "I did not locate a controlled human trial showing that nebulized peroxide shortens common colds." The search widened to COVID-19 series, an airway-device humidifier injury, mouse airway tissue and a rat mist study, and it took in a physician's report: "remains unverified by AskRigor. I read its publisher’s text through web search"
  - Series, trials and harm cases by route, with what was read: met. "analyzed 23 patients receiving combinations of nebulized, swallowed and gargled peroxide alongside other medicines. I read and audited its full text."; "after using peroxide in an overnight airway-pressure device’s humidifier for a week"
  - Neither absent nor proof: met. "Your repeated improvement is a useful observation. Without a comparison, it cannot separate peroxide’s contribution from spontaneous recovery, saline/moisture, other treatments or expectation."
  - Two `not_established` absence claims: met by meaning. One `not_established` claim's sentence covers both benefit and safety ("Benefit remains unproven, and I could not establish a safe home-nebulizer concentration and schedule; the frequency of lung injury at diluted doses is unknown."), and the cold-trial search is declared `support_not_located`. (22 Oct: two separate claims.)
  - Also: the emergency signs follow the opener ("If use was recent and you have new breathlessness, wheezing, chest pain or coughing blood, stop exposure and contact poison control or urgent medical care."); it asks "What final concentration and schedule did you use?"; question 130's rule: "The authors declared no conflicts; a funding source was not clear."
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, saved line, check line; 64 calls, 10 web searches; caveats 19/19; saved ARF-0236.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (4 / 4).

## q82-seller-forum (questions 82 and 83: `SellerPageVersusIndependentForum`)
- **Loaded:** yes (3, 10). **Executed:**
  - Testimonials unreliable, with the signs: met. "the unexplained prelaunch dates undermine trust"; "Prelaunch sampling or a date error could explain the timing; neither explanation is established here."
  - The wording judged without a detector, with the style's limit: met. "style alone does not establish who wrote it or whether the experience happened."
  - Independent forums the stronger signal, in both directions, with limits: met. "describe better focus or less brain fog, no noticeable benefit, and unpleasant experiences followed by stopping"; "none could be matched to this brand, and none supplied a measured change." As on 22 Oct, the forums are not called the stronger signal, since no post named the brand.
  - Neither a scam nor proven to work: met. "Suspicious enough to pause buying; insufficient to call it a proven scam."; "None authenticates this unnamed brand or establishes that its formulation will help you."
  - Question 130's rule seen: "two authors worked for a business selling lion’s mane drinks"; "A newer maker-funded preprint"
- **Finalized:** ready_with_limits (8 calls, 7 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, saved line, check line; 62 calls, 8 web searches; caveats 15/15; saved ARF-0235.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** same (4 / 4).

## r324-bacopa-rates (issue #324)
- **Loaded:** yes (1, 8). **Executed:**
  - Both rates for that extract, dose and duration: met. "In the 12-week BacoMind trial, healthy adults aged 55–86 took 300 mg daily after food or matched placebo"; its table gives nausea in "9/49 (18.4%)" against "1/49 (2.0%)". The KeenMind trial's 18% against 4% is no longer given: "its published symptom percentages cannot be cleanly reconstructed from its stated group sizes".
  - `safety_claims` with basis `comparative_rates`: not met. The digestive warning is declared `not_quantified`, and no claim is `comparative_rates` (22 Oct: three). The second check said "safety_claims[0] rests on rates against a comparator, but its sentence gives fewer than two numbers: give the rate in each group in that sentence." The run changed the basis instead of the sentence, so the answer now carries "How often this happens wasn't quantified in the sources found here." beside a table that quantifies those symptoms.
  - Question 130's rule seen: "The active tablets were supplied by Herbs of Gold"; "MediHerb supplied tablets and one author was its research director."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered = checked draft (white space only) + plain-answer note, saved line, check line; 72 calls, 12 web searches; caveats 18/18; saved ARF-0237. Spliced, mildly: "How often harms occur with 5% saponin university ethanol extract 300 or 600 mg/day wasn't quantified in the sources found here."; "Pages from iHerb individual written Bacopa reviews could not be retrieved".
- **Against the checked draft (exact):** formatting only (two blank lines dropped). Matters for a criterion: no.
- **Verdict:** passes in part. **vs 22 Oct:** worse (1 / 2; 22 Oct 2 / 2).

## r325-alginate-metals (issue #325)
- **Loaded:** yes (3, 11). **Executed:**
  - No blanket warning: met. "Finding lead and arsenic in one sample of this extract does not establish that you should avoid all wild seaweed."
  - The measurements concern the purified extract: met. "The extract and the seaweed as eaten are different materials: processing, water content and serving size can change the exposure."
  - `hazard_measurement` with its caveat: in part. It is declared twice with caveats, for hijiki's measured inorganic arsenic and for soaking and boiling, but not for the extract's metals (as on 22 Oct). The run never found the extract study: "I cannot independently verify the particular study without its title or link."
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft (white space only) + plain-answer note, saved line, check line; 58 calls, 11 web searches; caveats 17/17; saved ARF-0239, the last card this run saved. 22 Oct's spliced community sentences are gone.
- **Against the checked draft (exact):** formatting only (one blank line dropped). Matters for a criterion: no.
- **Verdict:** passes in part. **vs 22 Oct:** same (2 + 1 part / 3).

## r326-continue (issue #326, two turns)
- **Loaded:** yes (2, 11; turn 2: 0, 0, with no reload; 22 Oct's turn 2 reloaded HRP twice). **Executed:**
  - The second turn keeps the protocols: met. It runs AskRigor's research and check again (32 calls, 5 checks) and names "HRP 20.6.31 · Universal 20.5.46".
  - Quantifies or scopes the warning: met in both turns. Turn 1: "At 1,200 mg/day for six months, a diabetes trial reported stomach or bowel symptoms in 5/34 analyzed gotu kola recipients versus 0/36 placebo recipients"; "Case reports show that this harm can happen, not how often it happens." Turn 2: "support caution but cannot tell us how often injury occurs"
  - `finalize_research` with `safety_claims` in turn 2: met (three: one `case_reports`, two `not_quantified`).
  - Also in turn 2: "This answer did not check serious allergic reactions." (question 128).
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 5 calls, 4 not_ready; 0 rejected); check line yes in both; 61 and 32 calls, 9 and 17 web searches; caveats 21/22 and 15/15 word for word (turn 1 keeps the 2025-trial caveat with its subject turned into a link); saved ARF-0238 for turn 1, while turn 2's card was checked but not saved (daily limit). Spliced: "The iHerb reviews displayed on Vitacost reviews of Nature's Answer gotu kola 475mg capsule listing that I read were a partial set"; "The exact product tested in gotu kola preparations was not traced to a current product". Made after the check: "However: The reported figures in the 2022 exercise trial don't match the study's own data"; "Its full text was checked, but: The reported figures in".
- **Against the checked draft (exact):** turn 1 reworded, keeping 51% of the draft's words in order; turn 2 formatting only (blank lines). In turn 1 the opener was reworded ("Long-term safety remains uncertain, and liver injury has been reported."), and several caveats moved from the closing block into the trial bullets. The 2022 trial's size and population ("assigned 60 older adults with thinking or memory difficulties to three groups") were dropped, along with the limit "Four full texts were method-audited; the blocked 2008 trial and incompletely verified liver report limit those claims." The liver bullet's 2005 case-report link was replaced by the read-through-another-tool caveat. Matters for a criterion: no; both warnings stay quantified or scoped.
- **Verdict:** passes. **vs 22 Oct:** same (3 / 3).

## r328-arsenic-terms (issue #328)
- **Loaded:** yes (1, 12). **Executed:**
  - Both terms explained at their first use: met. Inorganic arsenic, named in the opener, is explained in the next sentence: "Inorganic arsenic is the form with established cancer-causing potential." Organic arsenic is explained where it first appears: "Other seaweeds often contain predominantly organic arsenic—arsenic attached to carbon-containing molecules."; "“Organic” here does not mean organically grown or automatically harmless."
  - `key_terms` declares both: met ("inorganic arsenic", "organic arsenic"; 22 Oct: one).
- **Finalized:** not_ready (4 calls, all not_ready, 0 rejected). Two things held it: YouTube's quota ("7 search(es) in the latest discovery rounds did not complete, 7 stopped by YouTube's rate limit or daily quota") and two caveats the answer left out. No check line; the answer opens "This is a bounded answer because part of the community review could not be completed." and ends with the unchecked line; 59 calls, 12 web searches; the last check's caveats 0/13 in the answer; no save.
- **Against the checked draft (exact):** no check of its own passed. Measured the same way, the answer keeps 22% of the words of the last draft the check read and none of that check's 13 caveats. It gives some of them in its own words: "YouTube searches hit a daily quota, two Reddit pages could not be fully retrieved, and eGullet blocked access."
- **Verdict:** passes in part (the check did not pass). **vs 22 Oct:** better (2 / 2; 22 Oct 1 + 1 part / 2), but 22 Oct's check passed and this one did not.

## r329-gracilaria-ulcer (issue #329)
- **Loaded:** yes (4, 11). **Executed:**
  - Both audits declare `reported_figures`: not met. No audit ran: "AskRigor could not complete its source-linked validation because its acquisition route requires identifiers I could not resolve for these papers."
  - The papers counted once: met. "the second paper should not yet be counted as reliable independent confirmation"; "These similarities raise a substantial concern about shared data or reporting dependence."
  - The inconsistency and identical-results caveats: met in the answer's own words. "The 2017 paper reports the same three percentages, with the extract doses reversed"; "Rounding cannot explain these discrepancies."
  - Neither replication nor misconduct: met. "They do not establish fabrication, copying direction or the extract’s actual biological effect."
  - New this run: a second publisher-hosted 2018 PDF. "Its anti-ulcer table reproduces every numerical entry—including uncertainty values—from the 2017 table."
- **Finalized:** not_ready (7 calls, all not_ready, 0 rejected). The key sources have no DOI ("Identify ... by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified in the answer"), and the run did neither. No check line; the answer opens "Partial assessment" and ends with the unchecked line ("AskRigor's final check has not passed: some of its statements were not checked."); 43 calls, 12 web searches; the last check's caveats 1/1; no save.
- **Against the checked draft (exact):** no check of its own passed. Measured the same way, the answer keeps 59% of the words of the last draft the check read.
- **Verdict:** passes in part. **vs 22 Oct:** same (3 / 4).

## r330-cashew-gum-acid (issue #330)
- **Loaded:** yes (3, 10). **Executed:**
  - Not called acid-sparing: met. "Carvalho et al. (2015) does not establish acid lowering as the explanation."
  - `mechanism_claims` declares the routes: met, oral (mucus and inflammation markers) and intraperitoneal (the acid assay); 22 Oct declared only the oral one. The acid claim's use route is declared intraperitoneal rather than the oral use the user asked about, so the check's own route caveat could not fire.
  - The route caveat: met in the answer's own words. "Crucially, the acid experiment specifies injection into the abdominal cavity, whereas injury prevention used oral gum."
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 54 calls, 12 web searches; caveats 3/3 (one link renamed); the card was checked but not saved (daily limit), as the answer says: "AskRigor checked the findings card but could not save it because its daily limit was reached."
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** better (3 / 3; 22 Oct 2 + 1 part / 3).

## r331-thiolated-gum (issue #331)
- **Loaded:** yes (5, 12). **Executed:**
  - The audit marks the value `impossible_as_printed`: not met. The abstract was not audited (it has no DOI): "The two conference reports remain unverified study claims". The run's one audit is of a different 2023 paper, whose ratio and thiol units it marks `inconsistent_with_own_data`.
  - Its caveat, without inventing a unit: met in the answer's own words. "96 mmol/g × 32.06 mg/mmol = 3,077.76 mg sulfur/g material."; "I cannot substitute micromoles per gram without the original data."
  - The safety claim with the `hazard_measurement` caveat: in part. It is scoped ("It cannot establish safety during repeated human use, pregnancy, or delayed disease."), but both claims are declared `not_quantified`.
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 56 calls, 16 web searches; caveats 7/7; the card was checked but not saved (daily limit). Spliced: "The reported figures in earlier 2023 paper don't match the study's own data".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** same (1 + 1 part / 3).

## r332-agar-yields (issue #332)
- **Loaded:** yes (4, 12). **Executed:**
  - The audit records the label swap as `inconsistent_with_own_data`, with both places named: not met. No audit ran ("Neither received an AskRigor-validated method audit"); the answer itself names both places: "the abstract labels 16.6% as acid-treated, while the table assigns it to crude extract".
  - The unreported step kept as not reported: not met. The 2022 paper's filtration is not mentioned: "extracted 50 g dried powder in 1 L water, then gelled and dried the extract."
  - The inconsistency caveat: met in the answer's own words. "the prose also gives crude G. edulis strength as 482 rather than 375 g/cm²"; "the conflicting printed values remain unresolved"
- **Finalized:** not_ready (6 calls, all not_ready, 0 rejected). The last three checks asked only "Try acquire_open_full_text for 10.4038/rjs.v13i1.111 before treating it as lead_only". Nine calls for that DOI returned no receipt, six of them reporting that a source failed; the answer says "its 2022 library route repeatedly failed". No check line; the answer opens with a "partial comparison" and ends with the unchecked line; 48 calls, 17 web searches; the last check's caveats 2/2; no save.
- **Against the checked draft (exact):** no check of its own passed; the answer is the last draft the check read.
- **Verdict:** fails (1 / 3, under half). The cause is that no audit ran, after a full-text source failure; the answer's own account of the inconsistencies is sound. **vs 22 Oct:** worse (1 / 3; 22 Oct 2 / 3, with an audit).

## s359-t1-routine (issue #359: the routine itself, T1, new)
- **Loaded:** yes (1, 9). **Executed:**
  - Starts from the routine as the video describes it: met. "No—I wouldn’t call gentle bouncing the most important two-minute exercise to do daily. It may be an enjoyable movement break, but I did not locate a controlled study showing that this exact two-minute routine relieves age-related stiffness better than other exercise." It found a matching video: "I cannot confirm either is yours."
  - The studies called a different exercise (indirect evidence): met. "The closest studies tested different routines:" (high-impact single-leg hopping, jump training, maximal jumps and the LIFE program; not the case's countermovement-jump and stair-snack studies); "These figures describe that harder program, not gentle bouncing."
  - No study found tested the routine itself: met; through the check's caveat, which carries a spliced phrase: "None of the studies I found tested Two-minute daily gentle floor fascia hopping as described".
  - Names no winner: met. "This is a practical option, not a proven ranking for stiffness."; "This supports the whole program, without identifying a single best exercise or proving relief of stiffness."
  - Fail conditions: none. On fascia: "The claim that two minutes of bouncing “unglues” or rehydrates it enough to reverse stiffness remains unestablished."
  - Question 130's rule seen: "LIFE had mainly public funding and some investigators disclosed commercial ties."
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 69 calls, 5 web searches; caveats 17/17; the card was checked but not saved (daily limit).
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s359-t1b-compound (issue #359: a compound routine, T1b, new)
- **Loaded:** yes (3, 11). **Executed:**
  - The whole routine named: met. "This partial assessment found no direct research support for the complete routine as described. Brief relief is plausible, but the posture, roughly 2 cm heel lift, two minutes daily and seven-day promise remain unverified."
  - Each trial called a part of it or a different exercise: met. "It included toe bouncing, but used 40-minute sessions, three times weekly for 12 weeks"; "it cannot isolate bouncing or establish a seven-day neck/back effect"; "It tested resistance exercise and pain, rather than bouncing and stiffness."
  - What ‘heels as an anchor’ means for floor contact left open: met. The answer never says whether the heels leave the floor; the nearest it comes is the community label "heel-bouncing routine".
  - Fail conditions: none (the words hopping, plyometrics, calf stretches and exercise snacks do not appear). One inferred detail: the stiffness becomes "neck/back", which the prompt does not say.
- **Finalized:** not_ready (7 calls, all not_ready, 0 rejected). The last check asked only for the caveat "YouTube's search limit stopped discovery before any video turned up, so YouTube evidence could not be checked yet." The run had read 269 comments under two videos it found through its own web search, and a correction taking those words back was refused ("corrections[0] takes back words of the check's own caveat"). The answer tells the user so: "AskRigor's final check remains unresolved: it incorrectly treats the blocked video search as if no YouTube evidence was inspected, although its comment tools returned the two sets described above." No check line; the answer opens partial and ends with the unchecked line; 63 calls, 13 web searches; the last check's caveats 21/22; no save. Spliced: "Another pass would take About 30–60 minutes for 3 full texts and 4 repeated YouTube searches after quota reset"; "The reported figures in Baduanjin knee-arthritis trial don't match the study's own data"; "None of the studies I found tested the described two-minute, seven-day bouncing routine as described".
- **Against the checked draft (exact):** no check of its own passed; the answer is the last draft the check read.
- **Verdict:** passes in part. The check deadlocked on a caveat that the run's own comment audits contradict. **vs 22 Oct:** new.

## s359-t2-matched (issue #359: a matched trial, T2, new)
- **Loaded:** yes (3, 9). **Executed:**
  - A matched trial informs the claim, with its effect size and uncertainty: met (moot). No matched trial was found: "I could not verify a trial matching that exact comparison: a gentle two-minute daily bounce versus two minutes of mobility exercises for stiffness." The two related trials are set aside for their different doses and outcomes, not for comparing no other kind of exercise: "Neither trial measured stiffness relief from the two-minute routine you describe, so neither answers whether it works better than the same time spent on mobility exercises." The case's main point went untested.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 62 calls, 7 web searches; caveats 4/4; the card was checked but not saved (daily limit). Spliced: "None of the studies I found tested Gentle two-minute daily bounce versus time-matched mobility exercises for stiffness as described".
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes, with the main point untested. **vs 22 Oct:** new.

## s359-t3-two-claims (issue #359: two claims, one measured, T3, new)
- **Loaded:** yes (1, 10). **Executed:**
  - The stiffness result kept to what was measured: met. No bouncing trial that measured ankle stiffness turned up, and each study found is kept to its own measure: "greater hydration was associated with greater stiffness, not demonstrated improvement in human mobility"; "without directly measuring fascia-specific hydration or mobility"; "Hydration means tissue water content. Stiffness means resistance to stretching. These are different outcomes from mobility."
  - Hydration stays untested: met. "I did not find a human trial showing that two minutes of gentle bouncing daily hydrates fascia and thereby improves mobility."; "These experiences leave temporary symptom relief plausible but do not verify fascia hydration."
  - Fail condition (hydration called supported): no. The opener: "The claim is plausible in part, but unproven as stated."
  - Question 130's rule seen: "its funding included Rolfing organizations"
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 62 calls, 11 web searches; caveats 17/17; the card was checked but not saved (daily limit). Spliced: "None of the studies I found tested Two minutes daily of gentle bouncing as described"; "Another pass would take About 20–30 minutes and 10–15 targeted searches"; "In r/Rebounding, no one described their own use of Two-minute floor bouncing for fascia hydration and mobility; nine selected outcome-bearing reports about adjacent mini-trampoline routines informed the discussion, so its reports are not evidence about it."
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s359-t5-aerobic (issue #359: a fair ranking, T5, new)
- **Loaded:** yes (1, 10). **Executed:**
  - Stair-climbing studies that measured fitness compared directly: in part. Stairs are set beside burpees, cycling and short breaks by protocol ("Stairs, burpees and stationary cycling are candidates, but the useful distinction is two minutes per bout versus two minutes for the entire session."), and the burpee trial's measured change is given ("The supervised burpee group reportedly rose from 37.9 to 42.9 mL/kg/min, versus 37.6 to 37.5 in controls."). Neither stair trial's fitness result is given, though: "I read its abstract, so it remains a research lead."; "A small stair trial improved fitness using three 20-second climbs, but each complete session lasted ten minutes." No option is ranked: "There is no established best two-minute activity."
  - Fail condition (a ranking withheld for want of fascia studies): no. Fascia is never mentioned, and the limits given are the trials' own: "Cycling changes disagree between tables, dropout accounting is unclear, and weight loss affects this weight-adjusted measure."
  - Question 130's rule seen: "Some authors disclosed financial interests in exercise-related companies."
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered = checked draft + check line; 57 calls, 8 web searches; caveats 14/14; the card was checked but not saved (daily limit). Spliced: "The reported figures in Burpee–cycling trial don't match the study's own data"; "A search of MyFitnessPal public fitness forum turned up no relevant reports."
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 22 Oct:** new.

## s360-abstract (issue #360: only the abstract, new)
- **Loaded:** yes (2, 6). **Executed:**
  - The reading depth named: met. More than the abstract was readable here (the public online appendix), and the answer says exactly what was read: "This is a partial answer: the publisher and SSRN retrievals were blocked; I read the abstract and 20-page appendix through web search." The key source is declared `partial_text`.
  - The rating scale named as unknown: met. "the exact rating anchors, blinding procedure and numerical agreement results remain unresolved because I could not retrieve the main article’s methods"; "that observed range alone does not establish the physicians’ response options or their meanings"
  - Blinding named as unknown: met. "Blinding: Unresolved. An independent panel is not necessarily a blinded panel."
  - Agreement between raters named as unknown: met. "The numerical alpha and its interval remain unresolved, so I cannot substantiate a judgment of good or poor agreement."
  - Fail condition (any of them described): no. What it describes (confidence-weighted averaging, an observed 0–5 range, a customized Krippendorff's alpha) is attributed to the appendix pages it read, not to the abstract. The case's premise (only the abstract readable) did not hold.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 32 calls, 41 web searches; caveats 2/2; the card was checked but not saved (daily limit).
- **Record (#360):** 5 AskRigor searches (Europe PMC and the frontier index, by DOI and title), 6 full-text attempts and 41 web searches. DOI 10.1287/isre.2022.1158 was a lead only, read as partial text (the abstract and appendix) through web search. Step skipped: none.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s360-agreement (issue #360: agreement is not benefit, new)
- **Loaded:** yes (3, 9). **Executed:**
  - The experts' support kept apart from benefit to patients: met. "No. Agreement among doctors does not, by itself, establish that the plan will help patients." Agreement, advice quality and patient benefit stay three separate questions.
  - Benefit stays unresolved: met. "No condition or plan was specified here, so its effectiveness remains unassessed."
  - Fail condition (benefit stated as shown): no.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after the check; 63 calls, 6 web searches; caveats 2/2; the card was checked but not saved (daily limit), as the answer says.
- **Record (#360):** 6 AskRigor searches (PubMed and the frontier index) and 6 web searches. Three DOIs were read in full and audited: 10.1001/jamanetworkopen.2019.0096, 10.1177/0272989x211031209 and 10.2196/13534. Step skipped: none.
- **Against the checked draft (exact):** reworded, keeping 81% of the draft's words in order; caveats 2/2. The opener was reworded and bolded, the clause "so they are not wholly independent evidence streams" was dropped from the Human Dx sentence, and the advice on comparisons was shortened. The plain-answer note still quotes the draft's opener ("No. It means most doctors who chose to reply recommended the plan; ..."), which the answer no longer contains. Matters for a criterion: no.
- **Verdict:** passes. **vs 22 Oct:** new.

## s360-lookup (issue #360: a simple lookup, new)
- **Loaded:** yes (5, 6). The answer names only Universal 20.5.46 ("Applied AskRigor Universal 20.5.46 (October 21, 2026)"). **Executed:**
  - A short answer with its source: met. "CrowdMed was founded in 2012. Its public launch followed in April 2013." The answer cites the Y Combinator company profile and launch post, in 141 words.
  - Fail condition (a literature sweep): no. The run called no literature search: it made 4 web searches, and 11 of its 19 AskRigor calls were protocol loads.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 19 calls, 4 web searches; caveats 2/2. No card was saved: the check rejected it for citing web pages it could not verify, as the answer says ("which also could not validate a findings card based on these webpage sources").
- **Record (#360):** no literature search. The sources were two Y Combinator pages, read through web search. Step skipped: none.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s360-process (issue #360: process evidence counts, new)
- **Loaded:** yes (4, 10). **Executed:**
  - Its findings reported: met. "The abstract reports generally high quality, with about 6% of rated answers classified as low quality, but says patients were as likely to choose the worst answer as the best."; "users’ preferred answers matched professionals’ choices in 36 of 60 questions: 36 ÷ 60 = 60%"
  - With the limits of an observational study: met. "Because it compared nine differing platforms observationally, it does not establish that paying causes better answers or that every reputation system fails."; "Full-paper retrieval was blocked, so I cannot independently assess its rating rules"
  - Fail condition (‘Nothing can be established’): no.
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 61 calls, 19 web searches; caveats 2/2 (links renamed); the card was checked but not saved (daily limit).
- **Record (#360):** 10 AskRigor searches (PubMed, Europe PMC including full-text sections, and the frontier index) and 19 web searches. 10.1287/isre.2022.1158 was read as an abstract only and 10.1016/j.lisr.2018.09.005 as partial text, both through web search; 10.2196/13534 was read in full and audited. Step skipped: none.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s360-rating (issue #360: a rating is not an outcome, new)
- **Loaded:** yes (5, 12). **Executed:**
  - The 94% given as ‘not poor’ on a physician panel's rating: met. "The accurate wording is: “Physicians rated 94% of the evaluated answers ‘not poor’; patient benefit was not measured.”"; "“94% rated not poor” describes answer quality, not a 94% rate of patient benefit."
  - Fail condition (94% called effective, correct diagnoses or improvement): no. "zero benefit would be an equally unsupported conclusion"
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered = checked draft + plain-answer note, check line; 50 calls, 24 web searches; caveats 2/2 (links renamed); the card was checked but not saved (daily limit).
- **Record (#360):** 11 AskRigor searches (PubMed, Europe PMC and the frontier index) and 24 web searches. 10.1287/isre.2022.1158 was read as an abstract only and 10.1111/j.1468-0009.2005.00397.x as partial text, both through web search; no full-text audit. Step skipped: none.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 22 Oct:** new.

## s360-studies (issue #360: the studies that exist, new)
- **Loaded:** yes (3, 8). **Executed:**
  - Zhou 2023 and Chen and Walker 2023 found, or named as unreachable: met. Chen and Walker was found, with its abstract read and its full text blocked ("Repository, publisher and exact-title/DOI searches did not yield an admitted full text; publisher retrieval was blocked."). Zhou was found, read and audited: "8,313 psychology-related questions and 115,822 replies on Guahao".
  - Kept apart: met. Chen and Walker (120ask.com) and Zhou (Guahao) are reported in separate places.
  - Each reported by what it measured: met. For Chen and Walker: "Independent physicians assessed about 13,000 answers. The authors report generally good average advice, but patients were as likely to choose the worst-rated answer as the best-rated answer." For Zhou: "The authors associate conclusive and emotionally supportive language with patient selection."; "It measured helpfulness marks, not independently verified medical correctness."
  - Fail condition (dismissed as participation only): no. "bounties have some observational support for attracting participation, but evidence that the bounty itself improves answer accuracy or patient outcomes remains insufficient."
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after the check; 65 calls, 13 web searches; caveats 6/6; the card was checked but not saved (daily limit), as the answer says.
- **Record (#360):** 9 AskRigor searches (PubMed, Europe PMC including full-text sections, ClinicalTrials.gov and the frontier index) and 13 web searches. Chen and Walker was read as an abstract only; five DOIs were read in full and audited: 10.2196/16704, 10.2196/13534, 10.1186/s12911-023-02309-x, 10.2196/jmir.4887 and 10.2196/jmir.5644. Step skipped: none.
- **Against the checked draft (exact):** reworded, keeping 84% of the draft's words in order; caveats 6/6. The opener was bolded and softened ("direct empirical studies" became "direct studies", and "The clearest directly matching study" became "The most directly matching study"). The other studies were turned into a table, and Zhou's row lost "so I give it little weight". The limits paragraph was shortened, with "inter-rater agreement" becoming "physician agreement", and the versions line was added. The plain-answer note still quotes the draft's two opening sentences, which the answer no longer contains word for word. Matters for a criterion: no.
- **Verdict:** passes. **vs 22 Oct:** new.
