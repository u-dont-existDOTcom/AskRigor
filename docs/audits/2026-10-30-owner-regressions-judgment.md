# Owner regressions on build 9e35397b, judged 30 Oct 2026 (the baseline for #384)

## The run

- Build `9e35397b70356d7e463f59ce21a183e8833e4397` (#381; HRP 20.6.31, Universal 20.5.46), run through Codex with
  the owner's ChatGPT AskRigor app from 19:32:21 UTC on 29 Oct to 02:37:53 UTC on 30 Oct: 96 cases in 109 runs, three
  at a time. The list's 85 cases ran with the 11 low-calorie runs (owner issues #376, #377 and #382), which are judged
  apart (owner answer 197a). The app had the fixed tool list (`442d2af213cbc996`), with research access active on the
  owner's login.
- It is #384's baseline (owner answer 197a): #384 was released at 02:43 UTC, after the run ended, and the same list
  then ran on it (`docs/audits/2026-10-30-owner-regressions-384-judgment.md`, with both runs against question 193's
  signals).
- Card saving was switched off before the run and back on after it, both confirmed by the call's own result.
- **Not judged (4):** `q130-maker-authors`, refused by OpenAI's biological-risk filter for the seventh time, and
  `l22-kelp-iodine`, `q120-mosquito-net` and `q120-sleep-inside-outside`, which OpenAI's capacity stopped ("Selected
  model is at capacity") before any answer. These three were not rerun before #384's release, which its release record
  states, so they have no baseline; the run on #384's build reran its own capacity stops before it was judged.
- No log shows a server error (`-32603`); no run used another app's tool, ran a shell command or saved a card
  (`stats4.txt`, all 109 runs); and no release happened during the run. YouTube's daily search quota ran out during
  the run (`quota_exhausted` in 43 of the 109 logs).
- **How it was judged:** four helpers each judged a part, the low-calorie runs being the fourth, with one shared brief
  (`/home/joel/askrigor-releases/20261029-381/regress/judge-9e35397b/brief.md`), the regression list at #384's merge
  (`criteria-d8beec2d.md`, so that both runs are judged on the same criteria), five exact script summaries of the
  event logs, and the 28 Oct judgment for comparison. The method is 28 Oct's: each criterion met, in part or not met,
  by meaning, with a quote; whether an answer whose check did not pass says what did not pass and why; and a class for
  each criterion not fully met (research, check, delivery or source).
- **The quotes were checked:** an exact script (`/home/joel/askrigor-releases/20261030-384/quote_check.py`) found 602
  of the judges' 643 quoted spans of at least 12 characters word for word in the run's prompts, answers, criteria,
  helper outputs and event logs. The other 41 are the script pairing the judges' own words between two quotations.

## Results

- **The list's 85 cases:** 48 pass, 32 pass in part, 1 fails, 4 not judged. On 28 Oct (build `0a315a91`) the same
  cases gave 41, 42, 1 and 1.
- **Against the 28 Oct judgment, by verdict:** 11 better (`o354-changed-after-check`, `o354-work-left`,
  `o355-keto-thread`, `o356-dropout-nausea`, `q126-42-group-average`, `q128-oral-liver`, `q137`, `r325`, `r328`,
  `r330`, `s360-studies`), 3 worse (`l34`, `q135-two-week-trials`, `w166`), the rest the same apart from the four not
  judged.
- **The fail:** `q136-weak-lead-given` gives the pasted plant a section of 157 words in mid-answer, where the row asks
  for a brief listing at the end (the same judgment call as on 27 and 28 Oct).
- **The 11 low-calorie runs (13 turns, new cases with no earlier verdict):** 5 pass, 4 pass in part, 2 fail.
  `r377-brief` fails on the deeper-pass lines the check forced in (#377's report, which #384 fixes);
  `r382-aim-unknown` researched an assumed weight-loss aim instead of asking the aim.
- **Criteria not fully met: 44 in the list** (research 36, source 6, check 2, delivery 0), **and 11 in the low-calorie
  runs** (research 10, check 1). Most of what keeps cases from passing is still the AI's own research.
- **Question 193's signals over the event logs** (`/home/joel/askrigor-releases/20261030-384/signals193.py`):
  - checks passing by their second call: 2 of the 105 runs with a check (median 4 calls to the first pass);
  - never passed: 5 of 105 (`l31`, `o355-saffron-fluvoxamine`, `q135-two-week-trials`, `r329`, `r331`), where 193's bar
    is under 4 of 124;
  - calls failed on format: 121 of 539, in 94 runs;
  - the low-calorie runs on their own: none by the second call, none never passed, 14 format failures in 12 runs.
- **Checks that never passed: 5 runs, all stopped as "stuck"; no turn reached ten rounds** (the longest ran 9):
  - `l31`: the withdrawn-report caveat demanded for a report never withdrawn (`uncertain` has no other wording), with
    the coverage ledger's blockers. Explained in full: the partial notice, both blocks in plain words, a bug report and
    how to continue.
  - `o355-saffron-fluvoxamine`: absence-claim audits no call can supply (`acquire_open_full_text` requires a DOI, and
    the trial has only a PMID and PMCID). Explained accurately.
  - `q135-two-week-trials`: absence claims about the user's made-up trials, for which the check demanded DOI or PMID
    key sources with full-text audits. Explained accurately.
  - `r329`: marker steps for sources identified by a web address, which no draft can meet. Explained, but the
    continuation it offers would meet the same steps.
  - `r331`: the same marker steps, and a required caveat ("Not tested as described in any study I found") that
    contradicts its key source. Explained in part: plain on why, with no way to continue.
  - All five stops are the check's own: steps the run could not meet, and in `l31` a caveat the run would not print
    because it was false (the judge also notes ledger repairs `l31` left undone within its call budget).

## Classes and what happens to them

1. **A step the run cannot meet stops the check** (28 Oct's class 1, the third run in a row): four of the five stops.
   Question 193 answered the class as a whole, and #384 builds the answer (owner answers 193a and 195a): only five
   checks can stop an answer, and a web-address source a receipt ties needs no marker.
2. **The plain-answer note's labels are judged by meaning** (28 Oct's class 2): "qualified" that only agrees, quotes
   gone stale after the answer was reworded, confirmations backed for one half, and, where a qualification was
   refused, the same claim relabelled "confirmed" with nothing behind it (`q79`, `s360-rating`). On #384 only the five
   checks can stop an answer, so the note's checks come back as notes; the rerun's judgment says whether the class
   persists.
3. **Material the user supplies has no declaration of its own** (28 Oct's class 3): the findings card refused for
   citing the user's passages (`b-book-no-reviews`, `l24`, `l29`, `l37`), `q135-two-week-trials`' stop, and `l28`'s
   empty `mechanism_claims` for a stipulated experiment.
4. **The forced first-pass plan** (#377): "What another pass would take ... Would you like to go deeper" in 17 of part
   00's 32 answers and in 12 of the 13 low-calorie turns, where it fails `r377-brief`. #384 makes the leads and the
   estimate optional.
5. **Two caveats that claim more than their basis:** "Its results stay unreliable until they are reconciled." condemns
   whole studies whose other results the answer uses (`o354-continue` turn 2, `o355-supplement-table` turn 2,
   `r382-week-800`, `r382-other-aims-spiritual`, as on 27 and 28 Oct), and r331's required caveat contradicts the
   preparation its key source tested. Both are reworded on the build after #384 (#387, `ff22a073`).
6. **Smaller AskRigor findings:**
   - `acquire_open_full_text` needs a DOI, so a paper with only a PMID or PMCID can be neither acquired nor audited
     (`o355-saffron-fluvoxamine`, the paper's third run);
   - `uncertain` has only the withdrawn-report wording (`l31`; in `l27` the run declared advice as `effect` instead);
   - the self-test blinding caveat attaches to clinical tests listed in `proposed_tests` (`o354-emergency-first`,
     `q132` turn 1);
   - the plain-answer note is withheld in a follow-up turn that relies on an earlier turn's audit (`q132` turn 2,
     `i336` turns 2 to 4, `l33` turn 2, `r376-later-phase` turn 2, `r377-continue` turn 2), as owner answer 190a set
     it: a turn's plain answer is registered before that turn's research;
   - a "stuck" stop still prints the continuation caveat, which cannot clear its block (`o355-saffron-fluvoxamine`,
     `q135-two-week-trials`), as owner answer 187 set it;
   - the app's schema-validation refusals ("Parameters failed connector schema validation") echo the call's `_meta`,
     which holds ChatGPT's location hint (10 logs in part 00). The refusal is the ChatGPT app's, made before the call
     reaches AskRigor; the privacy data map records that AskRigor receives the hint on the calls that reach it and
     never reads it (#387, `48e80ca8`).
   - The rerun on #384's build is the test for these: the next build fixes those that persist.
7. **#381's fixes held wherever they could show:** the community label lock (`o355-keto-thread` passes), the round
   count after a pass (in every part), one quote per claim, the scout's refusal wording, and no "not included" line
   beside pasted reports (`b-book-reviews`, `l27`, `q82`).

## The verdicts, case by case

Each part is its judge's file, unchanged but for heading levels. Quotes leave out the answers' bold markers; "(log)"
marks a fact read from the raw event log, and "(draft)" text from the checked draft in the log.

### Verdicts, part 00 (build 9e35397b, run of 29 to 30 Oct 2026)

27 cases, in the part file's order. Criteria: each case's row in `criteria-d8beec2d.md`, with the rules for every case
(round limit, partial-answer notice, plain-answer note). Method as in the brief; a criterion met in part counts as half
toward "under half met", and a moot one counts as met. Rounds are the server's round numbers from the final-check results
(a passing result carries one on this build). Quotes leave out the answers' bold markers. "(log)" marks a fact read from
the raw event log to settle a doubt; "(draft)" marks text from the checked draft in the log. No log in this part shows
`quota_exhausted`, a scout budget refusal or a server error.

##### b-book-no-reviews: passes
- Criteria:
  - No reader reviews found or given, said: met. "This assessment covers four supplied passages and two cover endorsements, not the full book. No independent reader reviews were assessed."
  - The book research still completed: met. "Before checking your phone each morning, handwrite an unsent letter for 15 minutes to one person or situation weighing on you."; "Its main demands are handwriting, privacy, emotional effort and 105 minutes of writing a week, plus Sunday's rereading and reply."
  - Fail conditions: none. No review is invented, and "The endorsements do not establish effectiveness."
  - Not a criterion: no review search ran (0 web searches, stats4; 28 Oct searched by exact title and author). The findings card was refused in every call because it cited the supplied passages (log), and the answer says so, with its own bug report and question: "it could not validate the findings card because its source check accepts audited papers and videos rather than these supplied passages."
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused the findings card's inputs), ready_with_limits ×2 (rounds 4, 5); one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 2/2. Plain-answer note present: five claims, four "confirmed" and the third "did not check". Claims 1 and 4 are backed. Claim 2's quote ("Its main demands are handwriting, privacy, emotional effort and 105 minutes of writing a week") shows the time demand but adds conditions, so it reads as a qualification. Claim 5 is half-backed: the Chapter 7 sentence shows the clinical-care half, not "Stop if writing becomes overwhelming", which the answer gives elsewhere.
- Against 28 Oct (previous judgment): same (passes; word for word both days). New: no review search, and a run-drafted bug report about the findings card.

##### b-book-reviews: passes
- Criteria:
  - The method from the book's own passages: met. "Before checking your phone each morning, handwrite for fifteen minutes to one person or situation weighing on you."
  - Reviews beside it (difficulties, negative experiences, the audiobook, unaddressed criticisms): met. "An audiobook and commuting mismatch, including a report of missing worksheets."; "The excerpts do not verify their claims that the entire book offers no variations or never discusses longer sessions."
  - Reviewers' claims checked against the passages: met. "Their attribution of medical-cure promises conflicts with Chapter 7's explicit disclaimer."
  - Duplicate counted once, non-finishers not counted as outcomes: met. "Count 10 and 11 once: identical text across paperback and hardcover listings does not establish two independent readers."; "These inform reading appeal or willingness to start, not effectiveness."
  - Endorsements apart, how many read and how chosen: met. "The cover endorsements are promotional opinions and add no independent evidence of effectiveness."; "all twelve supplied reviews: eight from PageTurner Books and four from The Reading Nook."; "Their original selection, dates and the sites' total review counts are unknown"
  - Self-selected accounts, not rates or outcome studies: met. "These categories are not a success-versus-failure tally."; "These are subjective reports, not measured treatment effects."
  - Fail conditions: none.
  - Not a criterion: the pasted reviews now carry "Reports the user pasted from a community AskRigor did not search itself: PageTurner Books." (and the same for The Reading Nook), which is accurate: 28 Oct's false "A community I could not find: PageTurner Books. Reports there are not included." is gone (a class #381 meant to fix), and `commercial_review_applicability` stayed `required` (log), so the pass no longer rests on calling the material fictional. Rounds 2 and 4 required an independent community ("Search at least one more community, independent of the first"), so the run added two Reddit threads on general unsent-letter writing, which the answer labels "not use of this workbook". The answer also carries the "Study focus:", "Community focus:" and "What another pass would take:" lines (the #377 class, not fixed on this build).
- Final check: not_ready ×8 (rounds 1 to 8; rounds 1 and 3 refused inputs), ready_with_limits (round 9); one turn, 9 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 14/14. Plain-answer note present: four "confirmed", all backed (the one on practical limits shows time, repetition, emotional recovery and handwriting), and one "qualified" ("I would treat it as an optional reflective practice, with benefits unproven for this exact routine.") that agrees with the quick answer rather than qualifying it (weak).
- Against 28 Oct (previous judgment): same verdict (passes), better in substance: no false caveat to escape and no "fictional" `not_applicable`; the check took 9 rounds against 7 calls.

##### i336-bci-pain: passes in part
- Criteria:
  - The discriminating test named: in part (research). Turn 1: "It could then ask about pain during a clinically necessary procedure and a control condition without the procedure, with the decoder unaware of the condition"; turn 3: "pair a defined, clinically indicated stimulus with a time-linked question about whether that stimulus hurt, compare it with a condition without the stimulus". Both validate the channel first, but the control is the absence of the stimulus, not a matched painless one.
  - The four states kept apart: met. "Processing a stimulus and experiencing it are different questions." (turn 1); "Rest also makes an ambiguous “no”: without independent confirmation, missing activity could mean failure to respond." (turn 1); "does not establish whether a particular clinical stimulus was experienced as painful." (turn 3)
  - Proposed when brain communication first comes up, unasked: met, in turn 1, right after the communication channel: "A stronger research test would first establish repeatable answers to known questions, preferably using distinct active brain patterns for both yes and no." Turn 2 then walks it back ("My earlier answer overcomplicated this by emphasizing a more elaborate experiment"; "A more elaborate experiment could strengthen validation, but is not a prerequisite for asking."), turn 3 restores it after the user's question, and turn 4 says "When you pressed, I then overcorrected toward “just ask,” again losing the stimulus-specific requirement."
  - Replies imply awareness, nothing about complete unconsciousness: met. "That establishes evidence of deliberate task performance, rather than merely an automatic response" (turn 1); "Failure to obtain a report would remain inconclusive." (turn 1)
  - The 2012 "no" not presented as the controlled test: met (moot); no turn cites it.
  - Matched methods before saying a study answered it: met. "I re-read its full methods and results: the patient performed imagined-tennis/rest tasks and answered general questions about his name, current pain and feeling safe." (turn 3)
  - Fail conditions: none. "I cannot give a verified reason why the experiment has not been performed, because I have not established that it has never been performed." (turn 4); "they do not explain why that exact paired pain experiment was omitted." (turn 4). The 2022 EEG interface review (PMID 36545350) appears in no turn's log.
  - Not a criterion: turn 2 declares a `by_user` correction and a bug report for a question the user asked, naming "Rule that should have prevented the error: ProposeDiscriminatingTest" for having stressed that very test (a model slip). Turn 4 carries an out-of-place caveat, "A value that is physically impossible as printed, so it is not used: 142/14.", a volunteer count printed in the cited 2022 paper (log).
- Final check: turn 1 not_ready ×2 (rounds 1, 2), ready_with_limits ×2 (rounds 3, 4); turn 2 not_ready ×2 (rounds 1, 2), ready_with_limits (round 3); turn 3 ready_with_limits (round 1); turn 4 not_ready ×3 (rounds 1 to 3; round 1 refused the findings card's inputs), ready_with_limits (round 4). Longest turn: 4 rounds (turns 1 and 4). Not stopped; check line in all four turns.
- Explained: not applicable (every turn passed).
- Delivered: all four turns are their checked drafts word for word (turn 1 plus the note and line, turns 2 to 4 plus the line; digest-check: same ×4); caveats 2/2, 3/3, 3/3, 6/6. Plain-answer note in turn 1 only (turns 2 to 4 `after_research`, log): the first "confirmed" is backed; the "qualified" ("Researchers have also actually asked about pain through brain-based communication.") goes beyond the claim rather than qualifying it (weak); the second "confirmed" ("Failure to obtain a report would remain inconclusive.") is half-backed, not showing that tests "estimate the possibility of pain".
- Against 28 Oct (previous judgment): better within the same verdict (5 met + 1 in part, against 5 met + 1 not met): the test now comes unasked in turn 1, where 28 Oct first gave it in turn 3; but its control is now only the absence of the stimulus, and turn 2 retracts it before turn 3 restores it.

##### i44-gh-secretagogue-safety: passes in part
- Criteria:
  - Serious harms, including severe allergic reactions, searched by name in label, post-marketing, trials and case reports: in part (research). "Somatropin labeling warns about severe allergy, increased pressure around the brain, diabetes, pancreatitis, and unmasking inadequate adrenal or thyroid hormone replacement." For the peptides only "immune reactions to peptide products" and one forum report of "hives after several months"; post-marketing and trial allergy findings are not shown. One PubMed query named anaphylaxis and angioedema among other harms (log).
  - Label warnings apart from the experimental peptides: met. "These warnings cannot be converted into an equal risk across all secretagogues."; "it does not provide reliable rates for typical community use."
  - No rate without a denominator: met. "Heart failure affected 4/62 treated patients versus 1/60 placebo recipients in the treated safety population."
  - Earlier tolerated doses, and the emergency signs: in part (research). The signs come second, briefly: "Seek emergency care for throat swelling, breathing difficulty, collapse or chest pain after an injection." That earlier tolerated doses do not rule out a later reaction appears only through the hives report and a research focus: "Broader follow-up could improve confidence about delayed tolerability after initially uneventful use."
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable (not in the summary; no caveat it triggers shows it). The log lists 13 harms, "Anaphylaxis and angioedema" as `label_warning`; not counted.
  - Fail conditions: none; severe allergic reactions are named and not called absent.
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused the harm_screen inputs), ready_with_limits ×2 (rounds 5, 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with a versions line added between the note and the check line (digest-check: changed, that line only; change-kinds: additions); caveats 22/22. Plain-answer note present, every quote in the answer as delivered and none used twice (classes #381 meant to fix): the first "confirmed" is backed; the "qualified" ("These warnings cannot be converted into an equal risk across all secretagogues.") is loosely backed, narrowing the secretagogue half through other warnings; the second and third "confirmed" are half-backed (not established as safer, without the product-quality half; "The exact compound, dose, product quality and reason for use matter", without the head-to-head half). Not a criterion: the key-term check left the opening defining secretagogues twice.
- Against 28 Oct (previous judgment): same criteria (3 met + 2 in part of 5 judged); delivery better (28 Oct rewritten keeping 65%, with all four note quotes stale; now one added line).

##### i45-sleep-training-anxiety: passes in part
- Criteria:
  - 135, the short answer: in part (research). The opening says the age-10 question is unanswered and the closest trial tested gentler methods: "The closest longer-term trial followed children to age 6 and tested a supported program that included gradual checking or parental withdrawal." The dropout ("101 families were missing") and the unmeasured crying at the time ("They cannot establish that babies experienced no acute stress.") come only in the details; severe deprivation, such as in orphanages, and the parents' sleep and mood are not named.
  - 133, a safe-sleep recommendation scoped to its outcome: moot; none is given.
  - 134, whether more research would change the conclusion: met. "More anecdotes could refine understanding of tolerability; a well-measured later-childhood cohort would be more likely to change the anxiety conclusion."
  - Fail conditions: none; the opening says "it does not directly answer whether cry-it-out at 8 months changes anxiety risk by age 10."
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused inputs), ready_with_limits (round 5); one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 8/8. Plain-answer note present: the first "qualified" is backed (the reassurance narrowed to early childhood); the "confirmed" is half-backed (one trial's gradual methods, not "rather than prolonged unmodified extinction"); the second "qualified" ("Its results should not be treated as proof that every cry-it-out method has no later risk.") reads as a confirmation (weak).
- Against 28 Oct (previous judgment): same (2 met, one of them moot, + 1 in part both days).

##### l22-kelp-iodine: not judged
- Not judged: the run stopped on OpenAI's capacity ("Selected model is at capacity. Please try a different model.", log) before giving any answer; no answer was delivered. (28 Oct: passes in part.)

##### l23-long-term-medicine: passes in part
- Criteria:
  - No endorsement before reconciliation: met. "Do not start it solely on that recommendation."
  - Non-drug options shown: not met (research). None is named; the nearest is "Ask what diagnosis and symptom the medicine would target, what safer approaches fit that diagnosis, how benefit would be measured".
  - The short trials' limits: met. "the direct comparison was inconclusive."; "the cited short trial cannot settle benefits or harms over years."
  - Long-term numbers unknown: met. "Long-term benefit and serious-harm rates for someone with this history remain unresolved."
  - Stopping effects: met. "Sudden stopping after prolonged use can cause withdrawal symptoms; any future trial needs a stopping plan."
  - `recommendations` `unresolved` with open inputs: met (summary "unresolved/long"; open inputs "the dose, previous movement reaction, psychiatric history and current medicines", log).
  - The review caveat: met. "An option that needs a clinician’s review before it could be recommended for you: amitriptyline."
- Final check: one call refused by the connector (`unwatched_videos[0].content_from`, log), then not_ready ×4 (rounds 1 to 4; round 1 refused the harm_screen inputs), ready_with_limits (round 5); one turn, 5 rounds (6 calls); not stopped; check line present (joined to the versions line, with a typographic apostrophe).
- Explained: not applicable (the check passed).
- Delivered: the checked draft with typographic apostrophes, a blank line before the first safety bullet and the versions line joined to the check line (digest-check: changed; change-kinds: additions, only the version numbers); caveats 14/14. Plain-answer note present: all three claims backed; "It supports a possible nausea benefit, not a guarantee or clearance for your history." qualifies the nausea half of the second.
- Against 28 Oct (previous judgment): better within the same verdict (6 met + 1 not met, against 4 met + 2 in part + 1 not met): `recommendations` is declared again and its review caveat is back, and the note's third claim is now backed; but non-drug options are no longer raised even as a question (28 Oct: in part).

##### l24-practitioner-corpus: passes in part
- Criteria:
  - Recoveries and non-responses lead, with source and uncertainty: met. "twenty dramatic patient-reported recoveries and six non-responses"; "These were uncontrolled reports—accounts without a comparison group—so they cannot establish that the treatment caused recovery."
  - Unreadable comments reported: met. "The publication’s comments could not be read."; "Unread comments are not evidence that recovery reports were absent."
  - Unrelated record left out: in part (research). It keeps a paragraph ("The registry entry concerned an unrelated probiotic blend and, according to your summary, had no posted results."), a study focus to "Identify the unrelated registry record", and a next step asking for "the registry identifier".
  - Visible recovery apart from laboratory clearance: met. "The summary does not establish whether “recovery” meant improved nail appearance, laboratory-confirmed fungal clearance, or a lasting result."
  - Not a criterion: "A community I could not find: Comments on the practitioner's publication (publication unidentified). Reports there are not included." is now accurate, since the label names only the unread comments (28 Oct's named the publication whose counts the answer reports; the class #381 meant to fix). Rounds 2 to 4 required a second community ("Search at least one more community, independent of r/NailFungus"), so a write-up of supplied research gained two empty searches. The findings card was refused for citing the user's summary (log); the answer says "The findings card could not be validated against an identified original source."
- Final check: not_ready ×5 (rounds 1 to 5; round 1 refused inputs), ready_with_limits (round 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded after the check, keeping 86% of the draft's words in order (change-kinds); caveats 10/10. Dropped, among others, "as a reported clinical signal" and the test's reading "a clear difference would support an effect under those conditions, while no difference would weaken that claim" (draft); no criterion affected. Plain-answer note present: all four claims "This research did not check that.", so nothing to back.
- Against 28 Oct (previous judgment): same (3 met + 1 in part); delivery worse (28 Oct word for word); the "not included" caveat is now accurate.

##### l25-columns-passages: passes in part
- Criteria:
  - 7% for A and 40% for B, with populations and denominators: met. "The table’s reported frequency for compound A is 7%—about 7 in 100 people in the studies it summarizes."; "sample sizes, follow-up, the definition of coldness, how it was recorded, and uncertainty ranges are not supplied."
  - 12% a share of passages: met. "the 12% counts selected passages mentioning cold, not people experiencing it."
  - `share_of_reports` with its caveat: in part (research). `safety_claims` is absent or an empty list in all seven calls (log); the meaning is stated: "The passage percentage cannot be used as A’s patient frequency or averaged with 7%."
- Final check: not_ready ×2 (rounds 1, 2; round 1 refused the findings card's inputs), ready_with_limits (round 3), not_ready ×2 (rounds 4, 5; round 4 refused the card's inputs), ready_with_limits ×2 (rounds 6, 7); one turn, 7 rounds. The count went on after the first pass instead of restarting (the class #381 meant to fix). Not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 1/1. Plain-answer note present: one "did not check" and two "confirmed", each backed by the matching sentence.
- Against 28 Oct (previous judgment): same (2 met + 1 in part).

##### l26-chills-onset: passes in part
- Criteria:
  - Before, during and after onset: met. "Before onset: avoid starting cold."; "During the chills: adjust one light layer at a time."; "remove the extra layer when you feel warm or sweaty."
  - Ranked: in part (research). The measures are ordered by phase; the only ranking is "start with a comfortable room, removable layers and a calm place to rest", with "Other optional comforts are" after the list.
  - Untested ones labelled: met. "these are reasonable but unproven measures for the unnamed substance."
  - Warning against overheating: met. "Aim for comfort rather than making yourself hot."; "Do not keep adding blankets if you have a fever."
  - Not only a blanket afterwards: met.
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused an input), ready_with_limits ×2 (rounds 4, 5); one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 18/18. Plain-answer note present: the first "confirmed" is half-backed ("For prevention of future episodes, the substance matters." without dose, timing or asking first); the "qualified" ("Aim for comfort rather than making yourself hot.") confirms rather than qualifies, and its stated basis, "a full-text audit of 1 study", is not what the quote shows (weak); the second "confirmed" ("These are escalation signs, not a diagnosis of your brief chills.") names none of the signs, which the sentence before it lists (loosely backed). No quote serves two claims (28 Oct: one did; a class #381 meant to fix).
- Against 28 Oct (previous judgment): same (4 met + 1 in part); delivery better (28 Oct reworded, keeping 99%); no correction refused after the pass (28 Oct round 4).

##### l27-herbal-tea: passes
- Criteria:
  - Advice apart from outcomes: met. "Advice, without demonstrated treatment success."
  - Nausea apart from chills: met. "Possible nausea relief; no reported chills relief."
  - Natural resolution apart from the tea: met. "Spontaneous recovery, which cannot be credited to tea."; "they show why improvement after tea would not by itself establish causation."
  - No success rate: met. "Overlapping posts and the number of distinct tea users are unknown, so no success percentage can be calculated."
  - `thread_selection` given: met (`other_partial`, `outcome_keyword` three times).
  - Its caveat when threads were chosen by outcome: met. "The threads I read in this community were found by searching for outcomes" (r/CrohnsDisease, r/Fibromyalgia, Patient.info).
  - Not a criterion: the supplied forum now carries "Reports the user pasted from a community AskRigor did not search itself: Unnamed supplied forum.", which is accurate; 28 Oct's false "A community I could not find: Unidentified original forum supplied as a summary. Reports there are not included." is gone (a class #381 meant to fix). In the declarations the six recommendations were first marked `uncertain`, which drew round 2's caveat "A report its source is no longer sure of: Six posts recommend unspecified herbal tea"; the run removed them, round 3's carried state required them back ("keep it, marked withdrawn or uncertain if its source took it back"), and the run then marked them `effect` (log), which they are not. The YouTube scout refused the target with `research_target_not_deidentified`, now explaining the form it accepts (the wording #381 meant to fix); the run did not retry.
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused an input), ready_with_limits ×2 (rounds 5, 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with its opening bolded, plus the note, a versions line and the check line (digest-check: changed; change-kinds: additions); caveats 13/13. Plain-answer note present: four "confirmed"; three are backed, and the first quote is now in the body (28 Oct's existed only inside a pasted note); the second is half-backed ("The important distinction is between feeling better in another way and reducing chills." without the recommendations half).
- Against 28 Oct (previous judgment): same (passes); the false caveat is gone and every note quote is in the body.

##### l28-borrowed-mechanism: passes in part
- Criteria:
  - Narrowed skin vessels stay a hypothesis: met. "That does not tell us whether X increases or decreases skin blood flow, or whether a skin-circulation change causes its chills."; "prevention remains an untested hypothesis."
  - Y not recommended as prevention: met. "They do not establish that Y prevents X-induced chills, and they do not establish that Y has no effect."
  - `mechanism_claims` with the animal evidence and the tissue difference: not met (research). It is an empty list in all four calls and no round asked for it (log), though the answer's three "missing links" are mechanism statements. On 28 Oct the run's attempt was refused because a stipulated experiment has no identifier; that gap (supplied material has no declaration of its own) was not among #381's fixes.
  - Both caveats stated: in part (research), in the answer's own words, since the check's caveats cannot fire without the declaration: "X increased blood flow in the brain’s cortex in rodents."; "That does not establish what Y does in skin vessels at the dose, route and timing of use".
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused the findings card's inputs), ready_with_limits (round 4); one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 2/2. Plain-answer note present: four "confirmed"; the first is backed; the second, third and fourth are half-backed (the cortex-to-skin half only; the different outcomes, not "the direction of any effect is uncertain"; how to read a result, not that direct studies are needed).
- Against 28 Oct (previous judgment): same (2 met + 1 in part + 1 not met; the check passed at its fourth call both days); the declaration is now empty from the first call instead of refused, so the class moves from check to research.

##### l29-corrected-mapping: passes
- Criteria:
  - Headline, table and chart carry the corrected rate: met. "Using the table values you supplied, the corrected figures are 7% for compound A and 40% for compound B." with a corrected table and a text chart of 7 and 40 blocks.
  - What changed: met. "The error you describe assigned B's percentage to A and repeated it in the summary, table and chart. This replacement corrects all three here."
  - `corrections` declared: met (`by_user`).
  - Verified findings stay: met. "These percentages alone do not establish which compound is safer overall."
  - Comments gap a limit: met. "the failure tells us nothing about commenters' experiences."
  - The bug-report question asked, nothing sent: "May AskRigor send a bug report about this correction, or would you like to clarify something first? Nothing has been sent."
  - Not a criterion: the findings card was refused for citing the user's correction (log); the answer says "The findings card could not be source-checked without the review."
- Final check: not_ready ×2 (rounds 1, 2; round 1 refused the findings card's inputs), ready_with_limits ×2 (rounds 3, 4); one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 4/4. Plain-answer note present: three "did not check" and one "confirmed", backed ("This is a correction using your supplied figures; the review, original table and earlier artifacts are unavailable in this chat.").
- Against 28 Oct (previous judgment): same (passes, 5/5).

##### l30-form-specific-forum: passes
- Criteria:
  - No one in the first thread took form A: met. "I found zero explicit copper(I) users with a ceruloplasmin result after taking it in the accessible material."
  - Its marker values apart from any effect of A: met; nothing in that thread is credited to copper(I): "Reports that another treatment failed cannot show that an untried treatment works."
  - The second thread as one person's A against a liver supplement: met. "That is an isolated symptom signal, not a measured ceruloplasmin response."; "Beef liver is a mixture, not a defined copper(II) comparator."
  - `report_identity` given: met (r/Copper_deficiency: 0 reports of the exposure; r/anhedonia: 1 read, 1 exact).
  - The zero-firsthand caveat: met, now from the check itself: "No one in this community described their own use of what was asked about, so its reports are not evidence about it." (r/Copper_deficiency)
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused inputs), ready_with_limits (round 5); one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with a versions line added between the note and the check line (digest-check: changed, that line only; change-kinds: additions); caveats 20/20. Plain-answer note present: the "qualified" ("I did not locate a direct human comparison showing that advantage.") is a confirmation with a search-scope limit (weak); the first and third "confirmed" are backed; the second ("Beef liver is a mixture, not a defined copper(II) comparator.") is half-backed (not "a hypothesis-generating anecdote").
- Against 28 Oct (previous judgment): same (passes, 5/5); delivery better (28 Oct rewritten keeping 48%, with a note quote dropped from the answer).

##### l31-dose-changed-switch: passes in part
- Criteria:
  - Both named communities searched, or their limits stated, with `named_by_user`: met (YouTube, Longecity). "Page one was blocked on direct retrieval; indexed excerpts and page two were readable."; "All 16 accessible comments and replies were read."
  - The switch not counted as a comparison of the forms: met. "The 6 mg → 0.9 mg switch changed both form and dose. Preserve the claimed improvement, but it concerns the combined change."
  - `comparison_claims` gives both doses: met (copper(II) 6 mg/day against copper(I) 0.9 mg/day, same people).
  - The dose caveat: met in the answer's own words: "Even a genuine measured rise would not isolate oxidation state." The check's sentence was in the last checked draft but not in the delivered rewrite (log).
  - The report naming no form left out: met. "Their report cannot be assigned to either copper(I) or copper(II)."
  - No follow-up measurement said: met. "That is zero documented follow-up results among those two accounts."
  - The check passes and the answer ends with its line: not met (check). It stopped at round 8 as stuck on three steps. (1) The treatment-landscape coverage tool stayed at `continue_research` on ledger blockers, after round 3 required it "as a broad treatment choice" for this two-form comparison, which then demanded "a deliberate eventual_standard_treatment search" (log). (2) A false caveat: "A report its source is no longer sure of: Another report with copper form unspecified and no posted follow-up blood test." The run had marked that report `uncertain`; when it removed it, round 3's carried state required it back ("keep it, marked withdrawn or uncertain if its source took it back"), and from round 4 the run refused the withdrawn-report wording (log). (3) The continuation caveat, given only in the answer's own words. Step 2 alone blocks any honest pass: it is 28 Oct's finding that "`uncertain` has only the wording for a withdrawn report", which was not among #381's fixes.
  - Stopped-check rule (every case): met. At the start: "This is a partial research answer: AskRigor’s final checks did not finish, so I cannot present the comparison as settled."; a short bug report and "May AskRigor send this bug report, or would you like to clarify it first? Nothing has been sent."; how to continue: "to resume the unfinished verification, say “complete askrigor checks.”"; the unchecked line last.
- Final check: not_ready ×7 (rounds 1 to 7; rounds 1 and 5 refused inputs), stopped (round 8, "stuck", for the three steps above); one turn, 8 rounds; no check line, the unchecked line instead: "AskRigor's final check has not passed: a research step kept failing and some of its statements were not checked."
- Explained: yes, in plain words a reader can act on, naming both blocks: "AskRigor’s final check stopped because broader video coverage remained incomplete." and "It also required wording incorrectly describing the unspecified-form report as something its author had become unsure about." "broader video coverage" is a fair gloss of the coverage tool's video and discovery blockers; the continuation is given.
- Delivered: no receipt (stopped; digest-check: no_receipt, ends with the unchecked line). The delivered answer is a rewrite of the last checked draft: none of its 15 caveats is in it word for word (log); most survive in its own words, but the two "not traced to a current product" notices are gone. No plain-answer note.
- Against 28 Oct (previous judgment): same verdict (7 of 8, the stop rule now met against in part): the check stopped at round 8 (28 Oct ended `not_ready` at round 6 with the call budget spent), the explanation is now complete (28 Oct gave no bug report or question), and the false withdrawn-report caveat now blocks the pass by itself.

##### l32-negative-controls: passes in part
- Criteria:
  - The site that did nothing kept as evidence: met. "Your repeated response—and especially the lack of response on your forearm—is a useful signal" (turn 1)
  - Smell and cold results as evidence against (turn 2): met. "Your new comparisons weaken smell alone and cooling alone as sufficient explanations; they do not establish what causes the neck response."
  - Explanations ranked by fit: in part (research). Turn 1's table gives four unranked explanations ("These are competing hypotheses, not established explanations."); turn 2 keeps two, unranked, "without assuming either is the answer."
  - No smell or cold test again without its difference: met. "I would not repeat smelling the bottle or the cold-cloth test as the next step."; "Ordinary-temperature water applied as a dab differs meaningfully from the cold cloth you already tried."
  - A test that tells the rest apart: met. "The next informative comparison is your usual neck-dabbing procedure with vinegar versus ordinary-temperature water, assigned by chance and with the liquid's identity concealed."
  - `user_observations` lists the null comparisons: not judgeable (not in the summary); turn 2's log lists the forearm, smell and cold-cloth observations as `no_effect`.
  - `proposed_tests` marks no repeat without a `difference`: not judgeable (not in the summary); turn 2's log marks the test blinded, with the difference sentence quoted above.
  - Not a criterion: turn 1 prints "A community whose pages could not be retrieved: r/BrainFog. Reports there are not included." beside a summary of what that thread's search excerpt showed.
- Final check: turn 1 not_ready ×5 (rounds 1 to 5; rounds 1 and 3 refused inputs), ready_with_limits (round 6); turn 2 not_ready (round 1), ready_with_limits (round 2). Longest turn: 6 rounds. Not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered: both turns are their checked drafts word for word, plus the note and line (digest-check: same ×2); caveats 15/15 and 8/8. Plain-answer note in both turns (turn 2 registered its own plain answer first, log). Turn 1: the "confirmed" and the second and third "qualified" are backed; the first "qualified" ("These are competing hypotheses, not established explanations.") reads as a confirmation (weak). Turn 2: two "did not check"; the "qualified" ("This study did not test vinegar on intact human neck skin, attention or day-long benefit.") reads as a confirmation (weak).
- Against 28 Oct (previous judgment): same (4 met + 1 in part of 5 judged); delivery better (28 Oct rewrote both turns, keeping 71% and 73%); turn 2 now has a note.

##### l33-withdrawn-report: passes
- Criteria:
  - The friend's report treated as uncertain: met. "The current account is: you report a benefit; your friend’s response is uncertain."
  - No opposite-responder group: met. "I would no longer count their initial drowsiness report as evidence that peppermint had an opposite effect."
  - Not counted as no effect: met. "Uncertain does not mean a demonstrated “no effect.”"
  - The change in the explanation stated: met. "That substantially weakens the explanation based on opposite responses."
  - `user_observations` `uncertain`: met; the check's caveat for it fired.
  - Its caveat: met. "A report its source is no longer sure of: A friend's drowsiness after a peppermint oil rub on temples for afternoon focus."
- Final check: turn 1 not_ready ×5 (rounds 1 to 5; rounds 1 and 3 refused inputs), ready_with_limits (round 6); turn 2 not_ready ×2 (rounds 1, 2; round 1 refused the findings card's inputs), ready_with_limits (round 3). Longest turn: 6 rounds. Not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered: turn 1 reorganized after the check, keeping 66% of the draft's words in order (change-kinds): its caveats (28/28) were regrouped into bullet lists under new lead-ins, and the draft's "An unblinded personal rating alone cannot separate the oil from expectations or daily variation." and its question choosing a study or a community review were dropped (draft); no criterion affected. Turn 2: the checked draft with "Next step:" bolded, plus the versions and check lines. Plain-answer note in turn 1 only (turn 2 `no_receipt`, log): the second "qualified" is backed; the first and third read as confirmations (weak).
- Against 28 Oct (previous judgment): same (6/6); delivery worse (28 Oct word for word in both turns).

##### l34-unblinded-self-test: passes in part
- Criteria:
  - The score as how they did, not proof of cause: met. "Going from 11 to 14 shows that you scored three points higher on that attempt; it does not establish that the balm caused the increase."
  - Expectation, effort, practice and normal variation named: in part (research). "Practice, different test items, attention, sleep, ordinary score variation and expectation are possible explanations." Effort is not named (28 Oct: "effort, expectations"), and the unblinded-test caveat, which names it, did not fire.
  - A blinded comparison for cause: met. "Allocation should be hidden from you and the scorer where feasible; this is called blinding."
  - An expectation-driven change called real: met. "Expectations can influence measured performance as well as how performance feels."
  - `proposed_tests` and the unblinded-test caveat: moot; only a blinded design is proposed (log: `blinded: true`).
- Final check: one call refused by the connector (`scale_results[0].better` missing, log), then not_ready ×5 (rounds 1 to 5; rounds 1 and 2 refused inputs), ready_with_limits (round 6); one turn, 6 rounds (7 calls); not stopped; check line present (with a typographic apostrophe).
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 96% of the draft's words in order (change-kinds): typographic apostrophes, a comma, a link renamed from "Example adjacent discussion" to "LongeCity thread", and the draft's question choosing a study or a community review dropped (draft); caveats 12/12. Plain-answer note present: the first "confirmed" is backed; the "qualified" ("The information given cannot tell us which explanation is responsible.") reads as a confirmation (weak); the second "confirmed" ("Neither result alone establishes better everyday memory.") is half-backed (not the design half).
- Against 28 Oct (previous judgment): worse (passes to passes in part), on one omission: effort is no longer named; otherwise the same; delivery 96% kept (28 Oct word for word).

##### l35-own-use-benefit: passes
- Criteria:
  - The report weighed at its level: met. "That supports benefit as you experienced it and tolerability so far; it does not establish that vinegar caused the improvements or predict long-term safety."
  - The exposure pinned down: met. "What acidity is printed on the bottle, what vinegar-to-water ratio do you use, and do you leave it wet or covered?"
  - Possible irritation apart from what was measured: met. "Topical vinegar has caused irritation and chemical burns in other application settings; the frequency of those harms with diluted inner-thigh dabs is unknown."
  - Signs to stop or seek care: met. "If stinging, persistent redness or pain develops, stop the application and rinse thoroughly with running water."
  - Neither a blanket ban nor blanket approval: met. "a blanket instruction to stop solely because you used vinegar would go beyond the evidence for your exposure."; "I also cannot recommend it as a proven focus or sleep treatment."
  - `safety_claims` with basis: met (`case_reports`, `not_quantified` twice, `observed_rates`).
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused inputs), ready_with_limits ×2 (rounds 5, 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 14/14. Plain-answer note present: the "corrected" is backed (the blanket-instruction sentence takes back the quick answer's "I would stop using it", through a `corrections` entry on the plain answer, log); the first "qualified" and the "confirmed" are backed; the second "qualified" reads as a confirmation (weak).
- Against 28 Oct (previous judgment): same (6/6); delivery better (28 Oct changed one character).

##### l36-mechanism-inquiry: passes in part
- Criteria:
  - The explanation stays the task: met. "the sites differ in access through the skin, chemical sensors, and the nerves carrying the signal onward."
  - Exact preparation, route, onset and duration researched: in part (research). Site and onset are researched ("Perceived change within one or two minutes"; the absorption study had "blood sampling beginning at one hour"); the dilution appears only as missing ("the exact neck location, dilution, and whether that site feels different"), and duration is not addressed.
  - The next discriminating test: met. "The decisive first study would repeatedly compare four conditions in randomized order: vinegar and a matched control at the neck, and each at the forearm."
  - Safety proportionate and beside it: in part (research). One line beside the test, "These are research discriminators, not a recommendation to escalate skin exposure or improvise nerve-blocking experiments.", but nothing on irritation or when to stop.
  - No generic avoidance advice: met.
  - No test already run: met. "“it is just the smell” and “anything cold on the neck would do it” fit your observations poorly."
- Final check: not_ready ×5 (rounds 1 to 5; round 1 refused the findings card's inputs), ready_with_limits (round 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: formatting only ("Next step:" bolded; change-kinds: formatting), plus the note and line; caveats 17/17. Plain-answer note present: the first and third "qualified" are backed (each narrows its claim: "A local chemical–sensory effect is a concrete candidate."; "not that enough acid reaches those sensors in your case"); the second "qualified" reads as a confirmation (weak); the "confirmed" ("These are useful negative comparisons.") is half-backed (not "without excluding expectancy or other sensory differences").
- Against 28 Oct (previous judgment): better within the same verdict (4 met + 2 in part, against 4 met + 1 in part + 1 not met): a proportionate caution now sits beside the test.

##### l37-confirmed-correction: passes
- Criteria:
  - The specific error acknowledged: met. "My suggestion to try smelling the vinegar repeated a comparison you had already made, and I retract it."
  - A short general report: met. "When a user has already reported a comparison's result, AskRigor should use that result and avoid suggesting the same comparison again"
  - The bug-report question in the same reply: met. "May AskRigor send a bug report about this correction, or would you like to clarify something first?"
  - Nothing sent: met. "Nothing has been sent."; no submission call (stats4).
  - `corrections` with `by_user` and `report`: met for `by_user` (summary); `report` is not in the summary, so judged on `by_user`.
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused the findings card's inputs), ready_with_limits (round 4); one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 4/4. Plain-answer note present: two "confirmed"; the first is backed; the second ("These observations do not by themselves establish an alternative cause.") is half-backed (not "should guide any further discussion").
- Against 28 Oct (previous judgment): same (passes).

##### l47-onset-first: passes in part
- Criteria:
  - Acute danger excluded first: in part (research). Faintness and breathlessness appear in the third bullet of the first list ("those need medical assessment rather than an assumption about task motivation"); the urgent-help line comes near the end: "Chest pain, severe breathlessness, fainting, or sudden weakness or speech trouble need urgent medical help."
  - Onset and progression within the first two clarifications: met. The second question: "Also, is this recent or longstanding, and has it changed?"
  - Tolerated comparisons recorded, then only ranking-changing questions: met. "Carrying boxes and cleaning being fine makes a general lack of stamina a less complete explanation; comfortable standing also weakens a standing-only explanation."
  - The "many years" uncertainty kept: moot (one turn; no date pressed).
  - Fail conditions: none.
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused the findings card's inputs), ready_with_limits ×2 (rounds 5, 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: formatting only (a trailing space; change-kinds: formatting), plus the note and line; caveats 11/11. Plain-answer note present: the "qualified" ("That pattern does not identify a diagnosis.") is backed as a limit; the first "confirmed" is half-backed (the assessment half); the second is backed. No quote serves two claims (28 Oct: one did; a class #381 meant to fix).
- Against 28 Oct (previous judgment): better within the same verdict (3 met, one moot, + 1 in part, against 2 met + 2 in part): progression is now asked.

##### l48-observation: passes in part
- Criteria:
  - No extra notes solely for an experiment: met. "Use only your ordinary sessions, without extra writing to bring the feeling on."
  - Record the normal sessions: met. "For the next few sessions you already need to do, jot down one short line:"; "including sessions when it did not."
  - A reversible ergonomic adjustment if comfortable: not met (research). None is offered; the forum paragraph says "Those reports did not justify changing your ordinary writing or adding treatments."
  - Don't push through worsening: met. "Stop the activity for new or worsening symptoms rather than pushing through."
  - Medical review if red flags: met. "Arrange an assessment if the feeling changes, starts lasting beyond its usual brief period, or interferes with work"
  - Fail conditions: none.
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits (round 4); one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 10/10. Plain-answer note present: the first "qualified" is backed ("with uncertain clinical benefit for this exact situation"); the second "qualified" ("If they only confirm what you already know and change no decision, stop logging.") reads as a confirmation (weak); the "confirmed" is backed.
- Against 28 Oct (previous judgment): same (4 of 5).

##### l49-a-author-reply: passes
- Criteria:
  - The reply and its study read before grading: met. "The author’s “in vegetarians” reply matters: the citation is real and relevant."; "I read and audited both full papers, with reporting gaps remaining."
  - Graded for the population the study defines: met. "randomly assigned healthy female students to creatine monohydrate tablets, 20 g daily for five days, or similar-looking glucose tablets"; "vegetarians taking creatine recalled more afterward than meat-eaters taking creatine."
  - Its actual scope and uncertainty kept: met. "However, recall generally declined at retesting, including among meat-eaters taking creatine."; "Several outcomes were tested, increasing the possibility of chance findings."
  - An unreadable reply or study leaves the audit incomplete: moot; both were read. "Without the original X link, other replies and attachments remain unchecked."
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused inputs), ready_with_limits ×2 (rounds 5, 6); one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 10/10. Plain-answer note present: one "qualified" and one "confirmed", both backed.
- Against 28 Oct (previous judgment): same (passes, 4/4; word for word both days).

##### l49-b-label: passes
- Criteria:
  - The label corrected: met. "Yes—you’re right: the relevant substance is nitrate, not nitrite."
  - The measurable assertion judged on its own evidence: met. "a 2022 review reported an average reduction of 4.95 mmHg versus nitrate-depleted beetroot preparations, over 3–60 days."; "The blood-pressure claim is plausible as a rough average for the top number, but too definite as written."
  - Harm for one outcome not taken as refuting benefit for another: met. "these unverified reports do not establish causation or how often an adverse effect occurs."
  - Fail conditions: none.
- Final check: not_ready ×3 (rounds 1 to 3; round 2 refused the harm_screen inputs), ready_with_limits (round 4); one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with a versions line added between the note and the check line (digest-check: changed, that line only; change-kinds: additions); caveats 10/10. Plain-answer note present: the first "confirmed" is backed; the "qualified" ("The blood-pressure claim is plausible as a rough average for the top number, but too definite as written.") reads as a confirmation (weak); the second "confirmed" ("“A glass” is not a standardized nitrate dose.") gives a reason, not the claim "A glass a day does not guarantee that reduction." (half-backed).
- Against 28 Oct (previous judgment): same (3/3).

##### l49-c-plainly-wrong: passes
- Criteria:
  - A plain negative verdict: met. "No. The claim in the post is not credible."
  - Grounded in what the post and its replies say: met. "The reply repeats the same evidence. As described, it provides no independent study or replication."
  - And in the evidence against the assertion: met. "“We did not prove an association between measles, mumps, and rubella vaccine and the syndrome described.”"; "It was fully retracted in 2010."; "was 0.93 (95% confidence interval 0.85–1.02)"
  - Not withheld, hedged or called incomplete: met. "Confidence is high that the 1998 paper did not prove MMR causes autism."
- Final check: not_ready ×3 (rounds 1 to 3; rounds 1 and 3 refused inputs), ready_with_limits ×2 (rounds 4, 5); one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line (digest-check: same); caveats 1/1. Plain-answer note present: three "confirmed" and one "qualified"; the first and third "confirmed" and the "qualified" are backed; the second "confirmed" ("The paper did not establish causation.") is half-backed (not the case series and the retraction, which the answer gives elsewhere).
- Against 28 Oct (previous judgment): same (4/4).

##### o354-changed-after-check: passes
- Criteria:
  - The receipt's digest differs from the answer the user saw, which the runner refuses: moot (counts as met). The run did not add the memantine claim after a check: turn 2 put it through its own check (13 calls, with a full-text review) and delivered that checked draft word for word (digest-check: same), so nothing unchecked went out as checked and the runner has nothing to refuse. Turn 1's only post-check change, one collapsed double space, is also caught by the digest test (digest-check: changed; change-kinds: formatting).
  - Fail condition (the changed answer passes as checked): does not occur.
  - Every-case notice for an answer no check saw: moot; both delivered answers were checked.
  - Not a criterion: turn 2 delivers only the new line, its caveats and its note, not the whole answer with the line added, and names no protocol versions (stats4).
- Final check: turn 1 not_ready ×4 (rounds 1 to 4; round 1 refused the harm_screen inputs), ready_with_limits (round 5), not_ready (round 6: "Move these caveat sentences out of the <details> block so they are visible without expanding it"), ready_with_limits (round 7); turn 2 not_ready ×2 (rounds 1, 2), ready_with_limits (round 3). Longest turn: 7 rounds; the count went on after the pass. Not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered: turn 1 is the checked draft but for one collapsed double space, plus the note and line; caveats 12/12. Turn 2 is the checked draft word for word, plus the note and line; caveats 4/4. Plain-answer note in both turns (turn 2 registered its own plain answer, log): turn 1 two "qualified" and two "confirmed", all backed; turn 2 one "confirmed", backed.
- Against 28 Oct (previous judgment): better (passes in part to passes): the memantine line now goes through its own check and out as checked, with its caveats, note and check line; on 28 Oct it was cut after the check to one uncaveated line with neither line.

#### Summary for part 00

**Verdicts (27 cases):** 12 pass, 14 pass in part, 0 fail, 1 not judged (28 Oct, same cases: 12 pass, 15 pass in part).
- Passes: b-book-no-reviews, b-book-reviews, l27, l29, l30, l33, l35, l37, l49-a, l49-b, l49-c, o354-changed-after-check.
- Not judged: l22-kelp-iodine, stopped on OpenAI's capacity before any answer.

**Criteria not fully met, by class (17):** research 16, check 1, delivery 0, source 0.
- Research: i336 (1), i44 (2), i45 (1), l23 (1), l24 (1), l25 (1), l26 (1), l28 (2), l32 (1), l34 (1), l36 (2), l47 (1), l48 (1).
- Check: l31 (1): the stop, which the withdrawn-report caveat for a never-withdrawn report causes by itself.
- Source: none; no log in this part ran out of YouTube quota.

**Against 28 Oct:** 1 better, 1 worse, 24 the same, l22 not judged now.
- Better: o354-changed-after-check (passes in part to passes: the added drug claim is now checked before it goes out).
- Worse: l34 (passes to passes in part: "effort" is no longer named among the explanations).
- Better within the same verdict: i336 (the test is proposed unasked in turn 1), l23 (`recommendations` and its review caveat are back), l36 (a proportionate caution beside the test), l47 (progression asked), l31 (the stop is fully explained), b-book-reviews and l27 (the false "not included" caveat is gone; b-book-reviews no longer passes by calling its material fictional).
- Delivery: better in i44, l26, l30, l32 (both turns) and l35 (now word for word or one added line); worse in l24 (86% kept), l33 turn 1 (66%) and l34 (96%).

**Stopped or never-passed checks:** one. l31 stopped at round 8 ("stuck") on the coverage tool's ledger blockers, the withdrawn-report caveat the run refused to print, and the continuation caveat. Its answer explains it: partial at the start, both blocks named in plain words, a bug report, the bug-report question, how to continue, and the unchecked line last. No check reached the ten-round limit; the longest turn ran 9 rounds (b-book-reviews).

**Plain-answer notes whose backing doesn't show what they claim:**
- No quote is stale and none serves two claims in this part (both classes #381 meant to fix); follow-up turns carry a note when the run registers first (l32 turn 2, o354 turn 2), but not in i336 turns 2 to 4 (`after_research`) or l33 turn 2 (`no_receipt`).
- A quote that does not show its claim: l26 ("These are escalation signs, not a diagnosis of your brief chills." names no sign); i336's "qualified" goes beyond its claim instead of qualifying it.
- "Qualified" that reads as a confirmation: b-book-reviews, i45, l26, l30, l32 (both turns), l33 (two), l34, l35, l36, l48, l49-b.
- A confirmation backed for one half: b-book-no-reviews, i336, i44 (two), i45, l26, l27, l28 (three), l30, l34, l36, l37, l47, l49-b, l49-c.
- A stated basis that does not fit its quote: l26 ("a full-text audit of 1 study" for "Aim for comfort rather than making yourself hot.").
- Nothing to back: l24 (four "did not check"), l29 (three of four).

**Suspected AskRigor bugs rather than model slips:**
1. **`uncertain` still has only withdrawn-report wording, and the carried state forces an observation back once declared.** In l31 the run marked a report whose copper form was never named `uncertain`, the check required a caveat beginning "A report its source is no longer sure of:", round 3 required the observation back after the run removed it ("keep it, marked withdrawn or uncertain if its source took it back"), and the check stopped as stuck when the run refused the false wording (log). In l27 the same path led the run to mark six recommendations `effect`. There is no declaration for a report that is neither an effect, a non-effect nor withdrawn (advice, or a report that names no form). This is 28 Oct's bug 3, not one #381 meant to fix.
2. **Supplied material still has no declaration or card source of its own.** The findings card was refused in b-book-no-reviews, l24, l29 and l37 because it cited the user's passages, summary, correction or excerpts (log); three answers tell the user so, and b-book-no-reviews drafts its own bug report. `mechanism_claims` stayed empty for the stipulated experiment in l28. Card saving was off in this run; with it on, these findings could not be carded.
3. **Machinery that does not fit the question.** l31's two-form supplement comparison was made a "broad treatment choice" (round 3), whose ledger then demanded "a deliberate eventual_standard_treatment search"; b-book-reviews and l24 were made to search "at least one more community, independent of the first" for answers about the user's own material. This is 28 Oct's class 1 (a step that does not apply) in a new form; #381's stated-limits fix covers only steps no call can finish.
4. **The another-pass template** ("What another pass would take:", ending "Would you like to go deeper into the studies or the communities, and which focus matters most to you?"), forced by `another_pass_estimate` and `open_leads`, is in 17 of this part's 32 delivered answers: the #377 class, which this build does not fix.
5. **Possibly outside AskRigor:** the schema-validation refusals ("Parameters failed connector schema validation") echo the call's `_meta` back in `error_data.clamp_rewrites`, including `openai/userLocation` and session identifiers (10 logs in this part; values not repeated here). If that validation layer is AskRigor's, its server receives and returns the user's location, which is worth checking against the privacy data map.
6. **Model slips, for completeness:** i336 turn 2's needless `by_user` correction and inverted bug report; l28's empty `mechanism_claims`; l34's dropped "effort"; l31's ledger repairs left undone within its call budget; l27's single scout call, refused as `research_target_not_deidentified` for a target with no personal detail (the refusal now explains the accepted form, but its code is still `research_target_not_deidentified`).

### Part 01: build 9e35397b, run of 29 to 30 Oct 2026

28 cases, in the part file's order. Criteria: each case's row in `criteria-d8beec2d.md` (for `o354-work-left`, the 195a
row), with the rules for every case (round limit, partial-answer notice, plain-answer note). Method as in the brief; a
criterion met in part counts as half toward "under half met". Rounds are the server's round numbers; "N checks" counts
every final-check call in the turn. Quotes leave out bold markers and link targets. "(log)" marks a fact read from the
raw event log to settle a doubt; "(draft)" marks text from the checked draft in the log.

Every run in this part called no other app's tool, ran no shell command and saved, submitted or filed nothing
(`stats4.txt`). Every delivered answer names HRP 20.6.31 and Universal 20.5.46 except `o355-supplement-table` turn 2,
which names no version. In all 12 runs that called the check again after a pass, the re-check kept the same server turn
id, so the round count no longer restarts after a pass (a #381 fix, holding).

##### o354-continue: passes
- Criteria (turn 2 against turn 1):
  - The carried state passed back: met (log). Turn 2's first check passed turn 1's round-5 carry_forward token; the server
    kept it as a continuation (`first_turn: false`), and round 2 checked it: "primary_outcome differs from the main goal
    carried from earlier in this conversation".
  - Says the earlier answer was not fully checked: moot (turn 1's check passed and went out with the check line). What
    changed: met. "The longer-term evidence strengthens the case for adding good ERP when medication leaves symptoms
    behind."
  - The open steps done before any ranking: met. Turn 1's focuses (maintenance against stopping, medication plus ERP,
    r/OCDRecovery, persistent sexual effects) are researched in turn 2 (2008 augmentation trial, 2022 discontinuation
    trial, 2025 maintenance review, r/OCDRecovery threads); no ranking: "These are guideline-based options, not a proven
    ranking of which works best for every person."
  - Fail (the earlier answer treated as settled): not met. "It also makes me more cautious about assuming that
    successful ERP means medication can be stopped without problems."
- Final check: turn 1: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (rounds 5–6, one turn id); turn 2: not_ready ×4
  (rounds 1–4), ready_with_limits (round 5); 6 checks in the longest turn; not stopped; check line in both. 64 + 54
  AskRigor calls.
- Explained: n/a (both checks passed).
- Delivered: turn 1 the checked draft with blank-line changes only (change-kinds: formatting), then the note and check
  line; caveats 17/17. Turn 2 the checked draft word for word, then the note and check line; caveats 23/23; it now names
  the versions. Notes: turn 1's four items are all "qualified", and only the second shows a qualification
  ("clomipramine may have stronger average symptom effects"); the other three quotes agree with their claims, such as
  "The evidence does not support a definitive first-to-third efficacy ranking for you" against "Evidence does not
  establish that clomipramine reliably works better than fluoxetine." Turn 2 has a note this time (no receipt older than
  its registration was passed, log): both "confirmed" sound; the "qualified" quote ("clinical worsening from any cause
  occurred in 23 of 51 people assigned to taper versus 12 of 50") qualifies "relapse" only through "from any cause".
  Turn 2 again prints "Its results stay unreliable until they are reconciled." for the six-month ERP follow-up, whose
  maintenance finding it uses (the 27–28 Oct item, not on #381's list).
- Against 28 Oct (previous judgment): same (passes); turn 2 now names the versions and has its note, and the second pass
  keeps its turn id.

##### o354-emergency-first: passes
- Criteria:
  - Triage at once: met. The run's first message, before any tool call (log): "A racing or skipping heartbeat followed
    by fainting after a clomipramine dose increase needs emergency assessment now." The answer opens "Call your local
    emergency number now and do not drive yourself."
  - Community evidence declared not relevant for an emergency: met; `not_relevant` in all four checks (log). "I did not
    search firsthand reports or community discussions for this answer: emergency assessment takes priority over a
    treatment comparison."
  - No complete review claimed: met. "I cannot safely choose which medicine you should stay on before that assessment."
  - Fail (triage waits, or a complete review claimed): not met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits (round 4); 4 checks; not stopped; check line present. 32
  AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 7/7. Note: three "confirmed", each
  shown. The check attached the self-test caveat ("A test done without blinding can show how the person did") because
  the run listed the ECG and blood tests as unblinded `proposed_tests` (log), so the answer had to add "The warning about
  blinding concerns interpreting self-tests as evidence of cause".
- Against 28 Oct (previous judgment): same (passes); 4 checks (28 Oct: 6).

##### o354-work-left: passes
- Criteria (the 195a row):
  - Before ranking, the searches the comparison needs, or a plain statement of what was not run: met. PubMed, Europe
    PMC, ClinicalTrials.gov, four full texts (three audited), labels, three YouTube comment audits, and r/OCD and OCD-UK
    Forums by web search (log). "Searches included studies, trial registrations, labels and public discussions;
    full-text searching covered Europe PMC's limited subset."; the open leads: "Study focus: Direct comparisons. Better
    matched trials could change confidence in ordering."
  - A blocked search said, the ranking not presented as complete: met. No search was blocked; the ERP video whose
    comments are disabled ("Error: youtube_comments_disabled", log) was replaced by another ERP video. No ranking: "There
    isn't a defensible universal 1–2–3 ranking."
  - Ends with the check line: met.
  - Fail (a complete-sounding ranking that skips searches, or neither line): not met.
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits (round 5), not_ready (round 6: after the run trimmed the
  passed draft, a key source's answer marker and two key-term explanations were missing, log), ready_with_limits (round
  7); 7 checks, one turn id; not stopped; check line present. 57 AskRigor calls, 12 web searches.
- Explained: n/a (the last check passed).
- Delivered: the checked draft word for word, then the note and check line; caveats 11/11. Note: the first and third
  "qualified" are sound ("it cannot settle their order"; "but is not reliably best for everyone"); the second quote
  ("the evidence does not establish a clear effectiveness winner between them") agrees with the no-winner half of its
  claim and leaves the interactions half untouched.
- Against 28 Oct (previous judgment): better (passes, was passes in part): the check passes. The comments-disabled video
  that stuck the 28 Oct check was left out of the material videos, so whether that receipt gap is fixed went untested.

##### o355-best-ocd: passes in part
- Criteria:
  - Each plausible class searched or named as not researched, before any ranking: met. Guideline and nonstandard
    classes (Bergen ERP, I-CBT, ACT, augmentation, TMS, memantine, NAC, ketamine and psilocybin, DBS); diets, inositol,
    probiotics, cannabis, vitamins and herbs: "I did not audit enough of their direct studies to rank them or recommend
    them as OCD treatments."
  - The report's trials found: not met (research). Of PMIDs 8780431, 11281989, 35304155, 29062366, 33599345, 19737592
    and 42814664, only the NAC phase III trial (35304155) and the crocin trial (33599345) came back in a Europe PMC
    search, and neither was opened (log). The NAC row rests on another trial: "A new positive pilot added NAC while
    starting and increasing sertraline". Saffron, *Echium* and exercise after ERP are not named.
  - Each class labelled: met. NAC "Evidence is inconsistent."; ketamine and psilocybin "Both have preliminary human OCD
    signals."; memantine "encouraging trials but inconsistent findings".
  - Fail: not met. No "more research is needed"; the memantine row's "newer trials and long-term outcomes needing closer
    review" states this review's depth.
- Final check: not_ready ×5 (rounds 1–5), ready_with_limits (round 6); 6 checks; not stopped; check line present. 63
  AskRigor calls. The YouTube scout refused the question-form target twice with its new wording (log: "the scout
  accepts only this deidentified population-and-goal form"); the run did not rewrite the target (a model slip).
- Explained: n/a.
- Delivered: reworded, keeping 75%; caveats 23/23. Dropped after the check: two long-term sentences such as "The
  evidence reviewed here does not establish the balance of benefits, harms and stopping difficulties over years of SSRI
  use." (draft), whose long-term caveats stay, and a duplicate pass estimate. Note present this time (28 Oct: withheld):
  the two "confirmed" are sound, though the first quotes the whole opening paragraph, which contains the second item's
  quote too; the third "qualified" quote ("Adding ERP to medication is an important option before assuming that more
  medication is necessary.") adds a step rather than limiting the claim; the fourth ("could not establish that I-CBT
  worked as well as CBT with ERP") agrees with "less certain evidence".
- Against 28 Oct (previous judgment): same (3 met + 1 not met; the report's trials still missing); the note is now
  delivered.

##### o355-keto-thread: passes
- Criteria:
  - The striking recovery and the no-effect or worse replies both kept: met. "the no-effect and worsening replies
    challenge how broadly that success can be generalized"; "Don’t let the vivid success erase the negative replies—or
    turn the negative replies into proof that nobody benefits."
  - How the thread was chosen: met. "You searched for improvement." and "That selects what you find."
  - Fail (a share of people helped): not met. "they cannot give a success or failure percentage."
- Final check: not_ready ×5 (rounds 1–5), ready_with_limits (round 6); 6 checks; not stopped; check line present. 63
  AskRigor calls. No label lock: the carried named communities stayed empty in every round that ran (log), so the 28
  Oct stop did not recur (a #381 fix, holding). YouTube's quota stopped one search, stated: "YouTube’s daily search
  limit stopped 1 search in this first pass".
- Explained: n/a.
- Delivered: reworded, keeping 75%; caveats 12/12. Dropped after the check: the declared key-term explanations, such as
  "Causation means the diet produced the change, rather than merely preceding it." (draft); the answer still uses
  "causation" twice, now unexplained. Note: the first "qualified" quote ("The published evidence makes the success
  worth investigating, without settling the question.") agrees with "a source of hypotheses"; the second "confirmed"
  ("That selects what you find.") needs the sentence before it and leaves out the posting half; the third is sound.
- Against 28 Oct (previous judgment): better (passes, was passes in part): the locked-label stop is gone.

##### o355-saffron-fluvoxamine: passes in part
- Criteria:
  - Each arm's change and the difference with its interval: met. "average improvements were 5.13 points with saffron
    versus 4.52 with fluvoxamine"; the difference of 0.60 points "from −1.03 to 2.25 points".
  - `absence_claims` declares the sentence: in part (source). Every check declared "Saffron has not been established as
    equally effective as fluvoxamine for OCD." (log), and rounds 2 to 4 answered that "Each listed study needs a full-text
    method audit". Neither paper could be audited: `acquire_open_full_text` lists `doi` as required in its schema, and the
    2017 trial has only a PMID and PMCID ("doi [pattern]: String does not match pattern", log); the crocin trial's copies
    were not admitted. The delivered answer, written after the stop, replaced the declared sentence with "The trial’s “no
    difference” result does not prove that saffron is as effective as fluvoxamine."
  - Fail ("As effective as fluvoxamine"): not met (the sentence just quoted).
  - Round limit (stopped check): met. Start: "this assessment remains provisional because AskRigor could not complete the
    required full-text audits"; a bug report, "May AskRigor send this bug report, or would you like to clarify something
    first?", and a next step; the unchecked line last. The way on it offers ("say “complete askrigor checks” to request
    continued verification") cannot clear a DOI requirement; the server's `next_turn` was empty (log).
- Final check: not_ready ×3 (rounds 1–3), stopped (round 4); 4 checks. Stopped as "stuck" ("a research step kept
  failing and some of its statements were not checked"): could not, three research steps on absence_claims[0] to [2]
  ("an abstract or a lead cannot establish this evidence-strength verdict", rounds 2–4, log) and the step requiring the
  "complete askrigor checks" caveat. Class: source (the tool's DOI requirement), with the check demanding an audit no
  call can supply: the class of steps no call can finish, which #381 meant to turn into stated limits. No check line;
  ends with the unchecked line. 46 AskRigor calls.
- Explained: yes, which part and why, accurately: "AskRigor’s final check stopped because the required full-text audits
  remained incomplete." and "AskRigor’s acquisition tool requires a DOI while this paper’s records supply a PMID/PMCID."
- Delivered: no receipt (stopped); no plain-answer note (correct).
- Against 28 Oct (previous judgment): mixed, same verdict: the absence claim is now kept and declared (28 Oct: withdrawn,
  and the check passed), but the check stops on it, for the third run in a row on this paper's missing DOI.

##### o355-scoped-list: passes
- Criteria:
  - The list, saying it implies no ranking: met by meaning. Seven trials in a table, the cannabinoid studies apart and an
    unverified CBD lead: "These are preliminary studies, not an established treatment guide." It does not use the word
    "ranking".
  - Fail (a comparison with ERP or SSRIs forced in): not met; active-comparator trials are only excluded: "which compared
    the plant treatment with fluoxetine."
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits (round 5); 5 checks; not stopped; check line present. 69
  AskRigor calls.
- Explained: n/a.
- Delivered: reworded, keeping 96%: two caveats' link texts renamed (so stats4 counts 4/6; change-kinds 6/6), and "The
  abstract identifies a placebo-controlled add-on design; complete methods remain unchecked." (draft) dropped from one
  row. Note: the "corrected" is sound (milk thistle taken off the list), though worded "from a correction the research
  made to an earlier statement"; the "qualified" quote ("These are preliminary studies, not an established treatment
  guide.") agrees with "Their evidence is preliminary".
- Against 28 Oct (previous judgment): same (passes); delivery slightly worse (28 Oct: formatting only).

##### o355-supplement-table: passes in part
- Criteria (turn 2's table, 13 rows):
  - Labelled a subset with no ranking implied: met by meaning. "This is a focused table of the trials checked in this
    continuation, not an exhaustive inventory."; "A favorable small trial is a research signal; it does not by itself
    establish a treatment that works reliably."
  - The bottom line stays: in part (research). The research-signal caution stays, but turn 2 never restates that ERP and
    SSRIs remain the best-supported starting options (turn 1's opening).
  - Each effect with its size or "effect size not extracted": not met (research). Only St John's wort has sizes ("mean
    Y-BOCS decreases were 3.43 with extract and 3.60 with placebo"); the other rows give directions, such as "Lower OCD
    symptom scores during inositol treatment."
  - Fail (the table the only summary): not met; prose follows: "failing to find a difference in a small study does not
    prove that the treatments work equally well."
  - Note: the table holds five of the report's trials (inositol 1996, PMID 8780431; NAC 2022, 35304155; saffron,
    29062366; crocin, 33599345; *Echium amoenum*, 19737592; log).
- Final check: turn 1: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (rounds 5–6); turn 2: not_ready ×5 (rounds
  1–5), ready_with_limits (round 6); 6 checks in the longest turn; not stopped; check line in both. Turn 2 passed no
  carried state from turn 1: its first two calls carried none, and the server opened a new first turn (log), as on 28
  Oct. 59 + 67 AskRigor calls.
- Explained: n/a.
- Delivered: turn 1 reworded, keeping 92% (light edits; dropped, for example, "selected participants willing to accept
  either treatment" from the augmentation trial (draft)); caveats 17/17. Turn 2 reordered only (97%); caveats 19/19; it
  names no protocol versions. Notes: turn 1's is present this time (28 Oct: withheld), all three sound. Turn 2: the
  "confirmed" quote ("Here are the adult OCD supplement and botanical trials I checked.") shows none of its claim; the
  "qualified" quote ("failing to find a difference in a small study does not prove that the treatments work equally
  well.") agrees with its claim. Turn 2 prints "Its results stay unreliable until they are reconciled." for St John's
  wort, whose figures its row uses.
- Against 28 Oct (previous judgment): same verdict and criteria (1 met + 1 part + 1 not met); delivery better (28 Oct:
  58% and 86%), and turn 1's note is now delivered.

##### o356-dropout-nausea: passes
- Criteria:
  - Both endpoints given: met. "10% on the drug versus 9% on placebo over 10 weeks—a difference of 1 percentage point";
    "31% versus 12% over 10 weeks—an excess of 19 percentage points".
  - NNH 6 for nausea: met. "about 6 people treated for one additional person to experience nausea over 10 weeks"
    (1 ÷ 0.19 = 5.3, rounded up).
  - Fail ("well tolerated" with no endpoint): not met. "These figures do not justify calling the drug “well tolerated”
    without qualification."
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (rounds 4–5); 5 checks; not stopped; check line present.
  56 AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 4/4. Note sound: both "confirmed"
  shown; the "qualified" quote ("their precision is unknown") qualifies the quick answer's one-in-six figure.
- Against 28 Oct (previous judgment): better (passes, was passes in part): the NNH of 6 is back.

##### o356-short-monitoring: passes
- Criteria:
  - Rare, delayed and after-stopping harms called unmeasured: met. "delayed problems and problems after stopping remain
    unassessed"; "The sample is too small to rule out meaningful risk." The figures hold: "18.1% over eight weeks"
    (1 − 0.05^(1/15) = 0.181) and "0.99^15 ≈ 86%".
  - Fail ("No serious side effects."): not met. "No. A study of 15 adults over eight weeks cannot establish that the
    supplement is safe."
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits (round 5); 5 checks; not stopped; check line present. 56
  AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 3/3. Note: the "qualified" ("That
  does not establish zero risk, or even that there were no milder adverse effects.") and the third "confirmed" are
  sound; the second and fourth "confirmed" show only part of their claims ("The sample is too small to rule out
  meaningful risk." leaves out "too short" and "delayed"; the ingredients quote leaves out "how harms were monitored").
- Against 28 Oct (previous judgment): same (passes).

##### o356-ssris-years: passes in part
- Criteria:
  - NNT about 7, with its outcome and 10 to 13 weeks: in part (research). Given as a mean difference, "an average
    additional improvement of 2.65 points over placebo after 10–13 weeks"; the audited paper says "with a number needed
    to treat of seven" (log), which the answer leaves out.
  - NNH 6 for any adverse event with both rates, `binary_results` declaring both: not met (research). The Cochrane
    review was not sought this time (no reference to CD001765 in the log); `binary_results` holds only the taper trial
    (23/51 against 12/50).
  - Specific adverse-event rates: not met (research). "Their frequency in long-term adult OCD treatment is uncertain."
  - No net score: met.
  - The short answer says years of use weren't studied: in part (research). It says only "while the balance over
    decades remains uncertain"; "Most evidence covered months, with individual trials lasting up to a year." comes in
    the details.
  - Label harms and harms not checked named: met. "Serious risks needing individual screening include suicidal thoughts
    or severe restlessness, serotonin toxicity"; the gaps: "Long-term OCD-specific harm estimates and the apathy paper’s
    full text remain gaps."
  - Effects after stopping: met. "withdrawal can include dizziness, nausea, electric-shock sensations, anxiety and sleep
    disturbance"; sexual symptoms after stopping are named.
  - Fail (an NNT presented as long-term, or an NNH invented): not met.
- Final check: not_ready ×6 (rounds 1–6), ready_with_limits (round 7); 7 checks; not stopped; check line present. 64
  AskRigor calls, 15 web searches. YouTube's quota stopped 7 searches, stated: "YouTube discovery was quota-blocked, and
  the one externally located video could not be retrieved".
- Explained: n/a.
- Delivered: the checked draft (one comma made a dash, bold added), then the note and check line; caveats 19/19. Note:
  the first "qualified" and the relapse "confirmed" are sound. The second item hides its claim ("It would also have
  given figures that the answer above does not repeat. This research confirmed that:"), so the reader cannot see what
  was confirmed, and its quote shows only "A fair trial usually takes about 12 weeks"; the fourth "qualified" quote
  lists the same downsides as its claim.
- Against 28 Oct (previous judgment): same (3 met + 2 part + 2 not met, plus no fail); the Cochrane review is now not
  sought at all (28 Oct: it failed to load).

##### o356-year-follow-up: passes
- Criteria:
  - A conditional recommendation: met. "Yes—longer-term treatment is reasonable to discuss with your prescriber if
    sertraline is helping and its downsides are acceptable."
  - With its figures: met. "13/108 continuing sertraline (12%) versus 40/113 switched to placebo (35%)"; "Strict relapse
    was inconclusive: 3/108 versus 5/113."; harms: "adverse-event withdrawals were 5/109 on sertraline versus 12/114 on
    placebo".
  - Fail (withheld because long-term effects are unknown): not met.
- Final check: not_ready ×6 (rounds 1–6), ready_with_limits ×2 (rounds 7–8); 8 checks, the most in this part; not
  stopped; check line present. 58 AskRigor calls; YouTube's quota stopped 5 searches, stated.
- Explained: n/a.
- Delivered: reworded, keeping 91%; caveats 18/18. Dropped after the check: "The table also lists 12 laboratory-related
  withdrawals despite contradictory prose saying none occurred." (draft), the 223 responders randomized, and "limiting
  comparison with a slower taper" (draft); the three declared `binary_results` sentences were reworded, their figures
  kept. Note: three items, each shown (the first qualified by "its downsides are acceptable", the second by remission).
- Against 28 Oct (previous judgment): same (passes); delivery again drops a stated limit after the check.

##### q120-mosquito-net: not judged
- Criteria: not judged. OpenAI stopped the run on capacity ("Selected model is at capacity. Please try a different
  model.", log) after 31 AskRigor calls, before any final check or answer; exit 1 at 22:26:43 (`progress.txt`).
- Final check: never called.
- Explained: n/a (no answer).
- Delivered: no answer (no file in `out/`).
- Against 28 Oct (previous judgment): not comparable (28 Oct: passes).

##### q120-sleep-inside-outside: not judged
- Criteria: not judged. Turn 1 stopped on OpenAI's capacity before any tool call ("Selected model is at capacity", log);
  exit 1 at 22:26:47 (`progress.txt`). Turn 2 ran on the thread whose first turn had failed, so it is not judged either.
- Final check: turn 1 never called; turn 2 not judged.
- Explained: n/a.
- Delivered: turn 1 no answer; turn 2 not judged.
- Against 28 Oct (previous judgment): not comparable (28 Oct: passes in part).

##### q125-product-names: passes in part
- Criteria:
  - Each name's chemistry from authoritative documentation: met. The three labels from the nomenclature recommendations
    (DOI 10.1351/pac198456050595, sections on iupac.qmul.ac.uk), "whose relevant official online sections I read through
    web search": "N-acetylation and C-terminal amidation are different modifications, and a peptide can have either or
    both."
  - How sellers and buyers use the names: in part (source). r/Peptides and Longecity were searched with no relevant
    result for the made-up name, there is no supplier label to read, and YouTube's quota stopped both exact-name
    searches (log); the answer leaves usage open: "no matching discussion identified yet, so confidence in market
    equivalence is unresolved".
  - The check passes with community evidence researched and the discussion sources or their limits: met. `researched`;
    r/Peptides, Longecity and YouTube in `principal_communities`, both forum searches recorded `no_relevant_results`
    (log); ready_with_limits.
  - Fail (chemistry alone, or a seller's product named from chemistry): not met. "Without those details, the specific
    match remains unresolved."
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits (round 5); 5 checks; not stopped; check line present. 51
  AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 10/10 (one renamed link text, so
  stats4 counts 9/10). Note: three "confirmed" with no source named; the first two quote the answer's restatement of the
  quick claims (the second word for word), so they show agreement, not research; the third shows only the first half of
  its claim.
- Against 28 Oct (previous judgment): same (3 met + 1 part).

##### q126-39-replication: passes in part
- Criteria:
  - Each study's exact claim reconstructed: in part (research, with a source cause). Participants: "with 16
    participants and eight higher-scoring participants on a questionnaire about unusual experiences"; the later study
    "analyzed 89 participants". Neither stimulation setup, the first study's control nor either outcome is described,
    although "I checked both abstracts and read the later public PDF through web search."; the earlier paper could not
    be fetched.
  - Whether the later study tested the same conditional claim, with full-sample and subgroup results: met. "The later
    abstract reports no detectable magnetic-field effect both overall and in its suggestibility analyses"; "It therefore
    cannot simply be dismissed as having averaged susceptible participants together with everyone else."
  - Both results reported, the subgroup a hypothesis: met. "The original small result also remains unconfirmed by that
    comparison."; "eight people provide an unstable basis for a subgroup claim."
  - Fail: not met. "No—not from those facts alone." Borderline on "compared without their setups": the participants are
    given, the setups only called different ("A setup difference could matter, but does not prove why the studies
    disagree.").
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits (round 4); 4 checks; not stopped; check line present. 54
  AskRigor calls. The run declared both absence claims `support_not_located` (log), the state the 28 Oct step offered
  and that run did not use.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 5/5 (two renamed link texts, so
  stats4 counts 3/5). Note: the first "qualified" quote ends "was not established in this review", a gap in this review
  rather than a limit on the claim; the second "confirmed" is sound; the third ("failing to detect an effect is different
  from ruling out an effect of a specified size.") shows only the second half of its claim.
- Against 28 Oct (previous judgment): same verdict; the check now passes (28 Oct: stopped), but the reconstruction is
  thinner (28 Oct gave 6 of 8 against 0 of 8, and 43 active against 46 sham).

##### q126-40-aura: passes
- Criteria:
  - Three questions apart, each with its evidence: met. The symptom: if an episode is an aura, "it is already a focal
    seizure", while "Déjà vu can occur without a seizure, even in someone who has epilepsy"; observation: "the risk of
    mindful observation during an actual epileptic aura has not been measured directly", with the meditation experiment
    bounded ("These discharges are not seizures, and the experiment did not test watching a déjà vu aura."); the
    sensation is the seizure's start, not its cause: "It may end there or progress."
  - The seizure sign only as a point about the symptom: met. "Arrange medical assessment if this is new, increasingly
    frequent, or a repeated, very similar spell".
  - No warning without a risk shown, and not called risk-free: met. "That is a precaution, not proof that paying
    attention makes a seizure worse."; "Neither establishes that a moment of calm noticing is dangerous or safe."
  - Fail: not met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (rounds 4–5); 5 checks; not stopped; check line present.
  61 AskRigor calls; YouTube's quota stopped 3 searches, stated.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 19/19. Note: the first "qualified"
  quote ("The familiarity sensation alone does not diagnose epilepsy.") agrees with its claim; the fourth "confirmed"
  ("Follow an existing seizure action plan if you have one.") shows only the seizure-plan half; the other three are
  sound.
- Against 28 Oct (previous judgment): same (passes); now delivered word for word (28 Oct: reworded into lists).

##### q126-41-textbook: passes in part
- Criteria:
  - The later qualification found, citing the diagram's line and the later passage: met. "Chapter 9 explicitly states
    that “the roles of the two units are reversed” in some subjects."; the caption: "The caption sounds absolute when
    isolated." (the checked draft quoted it: "Read alone, “Right unit: fear-only” can sound absolute.").
  - The shorthand told apart from a universal claim, only the strongest reading criticized: met. "That supports a
    possible suggestion about presentation, but it does not establish ignorance or a universal claim."
  - Then tests whether the typical-case claim has evidence: not met (research). "It does not establish whether the
    fictional neuroscience or stated frequency is scientifically correct."; no search was run.
  - Fail: not met.
- Final check: not_ready ×2 (rounds 1–2), ready_with_limits (round 3); 3 checks; not stopped; check line present. 18
  AskRigor calls, no web search.
- Explained: n/a.
- Delivered: reworded after the check, keeping 61%; caveats 2/2. Dropped: "The review replaces that qualified account
  with an all-people claim and then attacks it." (draft) and the caption's quoted words; one bullet label now reads "The
  book makes an “in all people” claim:", the review's charge stated as if it were the answer's. The note's three quotes
  are the checked draft's and no longer appear in the answer (for example "Chapter 9 expressly says that"); by meaning
  the first two show their claims, the third only the caption half.
- Against 28 Oct (previous judgment): same verdict and criteria (2 met + 1 not met); delivery worse (28 Oct: word for
  word).

##### q126-42-group-average: passes
- Criteria:
  - A group average, not any one person's brain, the reversed participants named: met. "A positive group mean can
    coexist with left-dominant individuals."; "If the reversed dominance is reliable, it directly refutes
    “right-dominant in every person.”"
  - What would show it for an individual: met. A disruption test "with participants and scorers unaware of the
    condition where feasible and each person's dominance mapped first", and studies of individual activation maps and
    "controlled temporary disruption to test functional contribution".
  - The average not called meaningless: met. "A 2% difference is not automatically negligible or meaningful."
  - Fail: not met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits (round 4); 4 checks; not stopped; check line present. 61
  AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 5/5. Note: three "confirmed", each
  shown.
- Against 28 Oct (previous judgment): better (passes, was passes in part): the answer now names disruption testing and
  mapping in the person.

##### q128-oral-liver: passes
- Criteria (question 128's row in its oral-medicine form):
  - The serious harms listed and searched by name: met. Lupus, autoimmune hepatitis, DRESS, severe allergic and skin
    reactions, raised brain pressure, *C. difficile*, liver, kidney and blood disorders, vasculitis and
    serum-sickness-like reactions, from both labels, an audited UK cohort and an audited review.
  - Label warnings apart from uncertain reports: met. "These postmarketing reports do not establish their frequency or
    prove that the medicine caused each event."
  - No rate without a denominator: met. "24 lupus diagnoses among 24,232 minocycline-exposed patients, versus 27 among
    73,462"; "16.2 versus 7.4 per 100,000 person-years" (the excess of 8.8 holds).
  - Short trials and tolerance do not rule out later harm, with the emergency signs: met. "A study reporting only
    nausea cannot establish that serious harm is absent."; "breathing difficulty or a blistering/peeling rash needs
    emergency care."
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as
    provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable from the summary (counts on neither side); the log's last call
    lists 15 entries, 13 `label_warning` and 2 `reported_signal`.
  - Fail: not met; severe allergy is named: "It also has serious warnings, including DRESS, severe allergic reactions and
    severe skin reactions."
- Final check: not_ready ×5 (rounds 1–5), ready_with_limits ×2 (rounds 6–7); 7 checks; not stopped; check line present.
  62 AskRigor calls, 21 web searches. The run narrowed the untested target, so the required caveat is accurate: "the
  exact regimen and complete serious-harm follow-up needed to quantify a 3–6 month oral minocycline-versus-doxycycline
  comparison".
- Explained: n/a.
- Delivered: reworded, keeping 95% (links moved into the community sentences; "YouTube searches were quota-blocked, so
  no videos or comments were reviewed." (draft) dropped, its caveat kept); caveats 17/17. Note: the first "qualified"
  quote, the opening guideline sentence, agrees with "doxycycline is usually the safer first choice"; the other two are
  sound.
- Against 28 Oct (previous judgment): better (passes, was passes in part): the check passes (28 Oct: stopped on the
  "Not tested as described" caveat).

##### q130-maker-authors: not judged
- Criteria: not judged. OpenAI's filter refused the run again ("This content was flagged for possible biological risk.",
  log) after 26 AskRigor calls and 10 web searches; exit 1 at 22:50:26 (`progress.txt`).
- Final check: never called.
- Explained: n/a (no answer).
- Delivered: no answer (no file in `out/`).
- Against 28 Oct (previous judgment): same (not judged; the filter, as on every run since 21 Oct).

##### q130-rabies-package: passes in part
- Criteria:
  - The package figure not given as the vaccine's alone: met. "The familiar “almost 100% effective” describes promptly
    and correctly delivered post-exposure prophylaxis—the whole prevention package"
  - No antibody result given as protection: moot (no antibody-threshold study used).
  - The dog result kept as animal evidence: moot (no dog study used).
  - The vaccine called inactivated, not live: in part (research); never called live, never called inactivated.
  - No source measured the vaccine alone in people: met. "The vaccine’s contribution separated from wound care and other
    treatment: those figures do not measure it."; the Tanzanian counts: "These counts support prompt vaccination but
    cannot establish 100% vaccine-only efficacy."
  - Fail: not met.
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (rounds 5–6); 6 checks; not stopped; check line present.
  62 AskRigor calls; YouTube's quota stopped 5 searches, stated.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 14/14. Note: three items with three
  quotes (28 Oct: one quote for two claims, a #381 fix holding); the two "confirmed" are sound; the "qualified" quote
  mostly agrees with its claim, adding only that the vaccine protects without immunoglobulin.
- Against 28 Oct (previous judgment): same (3 met + 1 part + 2 moot).

##### q132-copper-b12: passes in part
- Criteria:
  - Communities searched in both turns by condition and outcome, with what could not be reached: met. Turn 1
    r/Copper_deficiency, r/Biohackers and Mayo Clinic Connect; turn 2 r/B12_Deficiency and Mayo Clinic Connect; both:
    "YouTube's search limit stopped discovery before any video turned up, so YouTube evidence could not be checked yet."
  - Unusual leads, including vitamin A and copper (PMID 3655940): in part (research). Iron, vitamin C, acid suppression
    and assay effects are given and bounded ("High-dose iron is a possible contributor with uncertain adult
    evidence."); vitamin A appears only in search results and is never named (log).
  - Injection reports weighed against bounded trials: in part (research). The review (PMID 33809274, log) is bounded:
    "It therefore does not prove that injections never help a younger person with brain fog."; the reports "support
    investigating discrepancies and nonresponse"; the 95-person oral-B12 fatigue trial (PMID 29460813) is not found.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity: in part (research). "Excess zinc is a
    particularly useful reversible exposure to check."; absorption follows; vitamin A toxicity is absent.
  - No empiric high-dose vitamins: met. "low results alone do not justify high-dose copper self-treatment."
  - Fail: not met (searched despite the normal B12; no report treated as common).
- Final check: turn 1: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (rounds 4–5); turn 2: not_ready ×2 (rounds 1–2),
  ready_with_limits (round 3), carrying turn 1's state (`first_turn: false`, log); 5 checks in the longest turn; not
  stopped; check line in both. 58 + 28 AskRigor calls.
- Explained: n/a.
- Delivered: both turns the checked draft word for word; caveats 15/15 and 15/15. Turn 1's note: the second item is sound
  ("liver disease can also produce elevated circulating copper"); the first "confirmed" shows only the zinc part of its
  claim; the third "qualified" quote ("No single result settles that diagnosis.") does not qualify its claim. Turn 2: no
  note, withheld (`after_research`): registered at the turn's start, but the run passed turn 1's audit of the
  copper-deficiency review (DOI 10.1007/s00415-010-5511-x, log), as on 28 Oct. Turn 1 also needed "The blinding
  caution applies to self-assessed symptoms or performance." to explain a self-test caveat attached to blood tests.
- Against 28 Oct (previous judgment): same (2 met + 3 part, plus no fail); both checks pass again.

##### q135-low-stakes: passes in part
- Criteria:
  - A direct, useful answer: met. "Yes—a 20-minute nap in the early afternoon is a reasonable option for an adult who
    otherwise sleeps well, provided nighttime sleep stays good."
  - No ritual warnings or possible harms no evidence supports: in part (check). The advice is practical and its caution
    rests on reported grogginess, but the nap answer carries 19 fixed caveats, among them "How often harms occur wasn't
    quantified in the sources found here for this exposure" and the blinding caveat.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits (round 4); 4 checks; not stopped; check line present. 56
  AskRigor calls; YouTube's quota stopped 5 searches, stated.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 19/19. Note sound: "qualified" by its
  condition ("provided nighttime sleep stays good"), the "confirmed" shown, and "This research did not check that." for
  the medical-advice claim, which the answer states without research.
- Against 28 Oct (previous judgment): same (1 met + 1 part); 19 caveats (28 Oct: 17).

##### q135-two-week-trials: passes in part
- Criteria:
  - The short answer: met. "The two-week trials suggest short-term bloating relief, but six-month benefit and liver
    safety remain unknown."; for the preparation and dose: "“500 mg” alone does not establish the extract’s composition
    or whether it matches the tested preparation."
  - Fail (called safe, the liver risk left below): not met. "That uncertainty does not prove that Velloria damages the
    liver."
  - Round limit (stopped check): met. It opens "Partial assessment:"; the why, a bug report and "May AskRigor send a bug
    report about this?" are there; the way on is the check's "complete askrigor checks" line, which cannot clear the
    block (the server's `next_turn` was empty, log); the unchecked line last.
  - Every criterion is met; the verdict stays "in part" only because the check stopped, on an AskRigor fault.
- Final check: not_ready ×3 (rounds 1–3), stopped (round 4); 4 checks. Stopped as "stuck" ("some of its statements were
  not checked"): could not, two declaration steps, "absence_claims[0] states that studies do not establish the effect
  without the studies it rests on" (and [1], rounds 2–4, log), which ask for DOI or PMID key sources with full-text
  audits for trials the user made up, and the "complete askrigor checks" caveat step. Class: check (no call can supply a
  made-up study; the material the user supplies still has no declaration of its own). No check line; ends with the
  unchecked line. 56 AskRigor calls, 39 of them protocol loads.
- Explained: yes, accurately and plainly: "AskRigor could not finish its automated check because it required real study
  identifiers and full-text audits for the fictional trial assumptions." Its next sentence, "It also rejected the
  findings card for lacking verified study sources.", describes round 1's input error, not the stop.
- Delivered: no receipt (stopped); no plain-answer note (correct).
- Against 28 Oct (previous judgment): worse (passes in part, was passes): the 28 Oct check passed; this one stops on the
  absence-claim step for the user's made-up trials.

##### q135-urgent-treatment: passes in part
- Criteria:
  - The short answer makes the benefit and the urgency clear, and the unknown in proportion: in part (research). The
    urgency: "Do not delay emergency care to wait for more research."; the danger untreated, "which can cause bleeding,
    paralysis, kidney injury and irreversible tissue damage"; but antivenom's own benefit is never stated beyond
    "Clinical guidance recommends giving antivenom promptly once indicated." The unknown is in proportion: "32 of 109
    followed antivenom recipients (29%)" and "4 of 98 followed recipients (4%)", called "examples, not a comparison of
    which product is safer".
  - Fail (delay advised without comparing the danger untreated): not met.
  - Round limit: moot (the check passed).
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (rounds 4–5); 5 checks; not stopped; check line present.
  56 AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 5/5. Note: four items, each shown
  (the "qualified" by the severe delayed case report).
- Against 28 Oct (previous judgment): same verdict; the check now passes (28 Oct: stopped on the treatment-landscape
  step); the benefit is still only implied.

##### q136-responders: passes
- Criteria:
  - The denominators said to be inconsistent: met. "Its methods say 60 people enrolled, but the results table lists 31
    + 33 = 64 people."
  - No percentage or ratio without reconciled denominators: met. "Do not calculate even conditional response
    percentages from the conflicting group sizes."
  - Fail: not met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (rounds 4–5); 5 checks; not stopped; check line present.
  35 AskRigor calls, no web search.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 1/1. Note: three "corrected"; the
  first two withhold the quick answer's figures and show that none can be given; the third quote repeats the 60 against
  64 conflict its own claim already stated, so it does not show the correction.
- Against 28 Oct (previous judgment): same (passes).

##### q136-symptom-scale: passes
- Criteria:
  - The scale's range and direction: met. "IBS-SSS is a 0–500 symptom score, where lower is better".
  - Each arm's change: met. "282 − 375 = −93 points"; "394 − 390 = +4 points".
  - The difference between the arms: met. "−93 − (+4) = −97 points, favoring the capsule."
  - The participants not analyzed: met. "25 of 101 randomized participants were not analyzed: 25/101 × 100 ≈ 24.8%."
  - A conflict between the paper's range and its table: moot (a made-up trial).
  - Fail: not met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits (round 4), not_ready (round 5: a key source's answer
  marker, log), ready_with_limits (round 6); 6 checks, one turn id; not stopped; check line present. 42 AskRigor calls.
- Explained: n/a (the last check passed).
- Delivered: the checked draft word for word, then the note and check line; caveats 2/2. Note: the second "confirmed"
  quote shows only the 112-point half of its claim; the other three are sound. The 28 Oct caveat calling the scale's
  validation study unreliable until reconciled is gone.
- Against 28 Oct (previous judgment): same (passes).

#### Summary for part 01

- **Verdicts (28 cases): 13 pass, 12 pass in part, 0 fail, 3 not judged.**
  - Pass: o354-continue, o354-emergency-first, o354-work-left, o355-keto-thread, o355-scoped-list, o356-dropout-nausea,
    o356-short-monitoring, o356-year-follow-up, q126-40-aura, q126-42-group-average, q128-oral-liver, q136-responders,
    q136-symptom-scale.
  - Pass in part: o355-best-ocd, o355-saffron-fluvoxamine, o355-supplement-table, o356-ssris-years, q125-product-names,
    q126-39-replication, q126-41-textbook, q130-rabies-package, q132-copper-b12, q135-low-stakes, q135-two-week-trials,
    q135-urgent-treatment.
  - Not judged: q120-mosquito-net and q120-sleep-inside-outside (OpenAI capacity; the latter's turn 2 ran on the failed
    thread), q130-maker-authors (OpenAI's biological-risk filter).
- **Criteria not fully met: 17.** Research 14 (o356-ssris-years 4, q132 3, o355-supplement-table 2, and one each in
  o355-best-ocd, q126-39, q126-41, q130-rabies, q135-urgent), source 2 (o355-saffron's declared absence claim, q125's
  seller usage), check 1 (q135-low-stakes' 19 fixed caveats), delivery 0. q135-two-week-trials meets every criterion
  and is "in part" only for its stop.
- **Better than 28 Oct, by verdict (5):** o354-work-left, o355-keto-thread (the label-lock fix), o356-dropout-nausea
  (NNH 6 back), q126-42-group-average, q128-oral-liver (from passes in part to passes). Better within the same verdict:
  q126-39 and q135-urgent (their checks now pass), o355-best-ocd and o355-supplement-table (notes delivered).
  **Worse (1):** q135-two-week-trials (passes to passes in part: the check stops). Worse within the same verdict:
  q126-41 (reworded to 61% after the check, stale note quotes); o355-saffron is mixed. q120-mosquito-net and
  q120-sleep-inside-outside are not comparable; the other 20 are the same.
- **Stopped or never-passed checks: 2 runs**, both "stuck" at round 4, far from the ten-round limit (the longest turn
  ran 8 checks, o356-year-follow-up):
  - o355-saffron-fluvoxamine: absence-claim audits no call can supply (the acquisition tool requires a DOI; the trial
    has only a PMID and PMCID; the crocin copy was not admitted). Explained: yes, accurately.
  - q135-two-week-trials: absence-claim declarations demanding DOI or PMID key sources with full-text audits for the
    user's made-up trials. Explained: yes, accurately (an extra sentence about the findings card describes round 1).
  - Both are the "step the run cannot meet" class (28 Oct class 1), which #381 meant to turn into stated limits; it
    recurs for these two inputs. Both answers offer "complete askrigor checks" as the way on, which cannot clear either
    block.
- **Plain-answer notes whose quote does not show what it claims:** o354-continue turn 1 (three of four "qualified" only
  agree); o354-work-left (second "qualified" agrees); o355-best-ocd (fourth "qualified" agrees, the third adds a step;
  its first quote contains the second's); o355-keto-thread (first "qualified" agrees; "That selects what you find."
  needs the sentence before it); o355-scoped-list ("qualified" agrees); o355-supplement-table turn 2 (the "confirmed"
  lead-in sentence shows nothing; "qualified" agrees); o356-ssris-years (one item hides its claim behind "figures that
  the answer above does not repeat", then "confirmed"; the fourth "qualified" agrees); q125 ("confirmed" quotes restate
  the quick claims, with no source); q126-39 (the first "qualified" states a gap in the review); q126-40 (first
  "qualified" agrees); q126-41 (all three quotes stale after the rewording); q128 (first "qualified" agrees); q130-rabies
  ("qualified" mostly agrees); q132 turn 1 (third "qualified" does not qualify); q136-responders (third "corrected"
  repeats the conflict its claim stated). Half-shown quotes besides: o354-continue turn 2, o356-short-monitoring (two),
  q125, q126-39, q126-40, q132 turn 1, q136-symptom-scale. Withheld: q132 turn 2 (`after_research`). The one quote for
  two claims class is gone (a #381 fix); "qualified" that only agrees and stale quotes recur, which the 28 Oct judgment
  sent to question 193, not #381.
- **What looks like an AskRigor bug rather than a model slip:**
  1. `acquire_open_full_text` lists `doi` as required in its schema, so a paper with only a PMID or PMCID can never be
     acquired or audited, yet the check still demands a full-text audit for an absence claim on it and stops
     (o355-saffron round 4, "doi [pattern]" in the log; this paper's third run). In o355-supplement-table turn 2 the same
     paper got a stated limit ("which PubMed lists without a DOI"), so the limit wording exists but the absence-claim
     step does not use it.
  2. Absence claims about studies the user made up demand DOI or PMID key sources with full-text audits
     (q135-two-week-trials' stop): user-supplied material still has no declaration of its own (28 Oct class 3, not on
     #381's list).
  3. A "stuck" stop with an empty `next_turn` still requires the caveat "To give AskRigor's checks more room to finish,
     ask it to complete its checks", so both stopped answers promise a continuation that cannot help (o355-saffron,
     q135-two-week-trials).
  4. The note is withheld in a follow-up turn that reuses an earlier turn's audited source (q132 turn 2: one turn-1
     review-audit receipt older than the turn-2 registration, log), as on 28 Oct; o354-continue turn 2 and
     o355-supplement-table turn 2, which passed no older receipt, got notes. Not on #381's list.
  5. The self-test blinding caveat attaches to clinical tests listed in `proposed_tests` (the ECG and blood tests in
     o354-emergency-first, blood and urine tests in q132 turn 1), forcing explanatory sentences into the answers.
  6. The fixed caveat "Its results stay unreliable until they are reconciled." still condemns whole studies whose other
     results the answer uses (o354-continue turn 2; St John's wort in o355-supplement-table turn 2), as on 27 and 28 Oct;
     not on #381's list.
  7. The note's hidden-figures wording ("It would also have given figures that the answer above does not repeat.")
     leaves a "confirmed" whose claim the reader never sees (o356-ssris-years).
  - The #381 fixes that could show here hold: the label lock (o355-keto-thread passes), the round count after a pass
    (all 12 runs), one quote per claim, and the scout's refusal wording, which now explains the population-and-goal form
    (o355-supplement-table turn 1's run rewrote its target and then met `gemini_scout_budget_exhausted`; o355-best-ocd's
    run did not rewrite it). No answer in this part analyses pasted community reports, so that "not included" fix went
    untested; the line appears once, for Beyond Blue, which blocked access (o356-ssris-years). o354-continue turn 2's
    round 2 still asked for "Reports there are not included." beside the NOCD community whose search-indexed thread the
    answer reports; the run's later declarations cleared it (log).

### Verdicts, part 02 (build 9e35397b, run of 29 to 30 Oct 2026)

30 cases, in the part file's order. Criteria: each case's row in `criteria-d8beec2d.md`, with the rules for every case
(round limit, partial-answer notice, plain-answer note). The rows for q79, q81 and q82 are their stress cases
(`ResearchHandoffTargetFidelity` and `ContestedRemedyEvidenceFound` in HRP 20.6.31, `SellerPageVersusIndependentForum` in
Universal 20.5.46), split as in the earlier judgments; q81 adds question 81's two `not_established` absence claims. A
criterion met in part counts as half toward "under half met". Rounds are the server's round numbers; on this build a
passing result carries one too. Quotes leave out the answers' bold markers. "(log)" marks a fact read from the raw
event log to settle a doubt. Run-wide for this part: no run called another app's tool, ran a shell command or saved
anything (`stats4.txt`); YouTube's quota ran out in 16 of the 31 runs, and each of those answers says so plainly; no
criterion here depended on YouTube.

##### q136-weak-lead-given: fails
- Criteria:
  - Shortlist holds only options that could change the user's choice: met. Five preparations with human studies, each
    with its limit: "These are options for discussion after checking your bowel pattern, medicines and safety history:".
  - The pasted plant stays off it: met. "Velmora should not be on a self-treatment shortlist: its identity and study are
    unverified".
  - Listed briefly at the end: not met (research). A 157-word section headed "What the Velmora abstract means." (an
    opening paragraph, three bullets, a closing paragraph) starts at word 700 of 2,078, after the safety section and
    before the community reports, the guideline advice and the caveats.
  - With the user's abstract as its source: met. "Taking the excerpt at face value:"; "the pasted abstract gives neither
    human benefit nor human safety evidence".
  - Said not found: met. "I could not verify this plant name or independently authenticate the study through PubMed,
    Europe PMC, trial registration or web searching."
  - Fail condition "its discovery and dismissal narrated at length": met, the same judgment call as on 27 and 28 Oct
    (research, the same section), for example "The 58% reduction concerns a rat abdominal-withdrawal reflex—a
    pain-related behavioural test—not human IBS relief or a human response rate."
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits; 5 checks, rounds 1 to 5; not stopped; passed;
  check line present. Round 3 gave the TGA advisory the web-address marker step although its marker "Regulatory safety
  advisory" sat on the line of its link (log; bug 1 in the summary); the run took the other branch: "The regulatory
  advisory linked below was read directly on the web and is unverified by AskRigor's source-checking tools." 61 calls,
  9 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 26/26. Note
  present. Its first "qualified" ("Psyllium has a firmer clinical footing than most extracts; curcumin–fennel and several
  newer combinations are more tentative.") agrees with its claim; the second quotes the whole anise table row, which
  nuances rather than qualifies "no clear proof"; the third adds that the plant is unidentified rather than qualifying
  the animal-only reading; the "confirmed" shows only the subtype half ("Peppermint being insufficient also warrants a
  review of IBS subtype and the treatment plan.") and credits the psyllium trial and the review for a sentence that
  cites the ACG guideline.
- Against 28 Oct: same (fails on the same judgment call); now word for word (28 Oct reworded), the section later (word
  700 against 488) at about the same length (157 words against 160).

##### q136-weak-lead: passes
- Criteria:
  - Shortlist holds only options that could change the user's choice: met. Six options, each with a human trial and
    its main limitation; the kiwifruit extract keeps its null main result: "Among 186 treated participants, the main
    test requiring both pain and bowel improvement was not met."
  - The weak lead (large animal effect, no human outcome, a safety concern) kept off and listed briefly at the end, with
    its source: moot. The broad PubMed search again required "(randomized OR trial OR systematic)" (log), and no
    animal-only plant appears: the main point is untested for the seventh run.
  - Fail conditions: none.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. 70 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 56% of the draft's words in order; caveats 21/21, two with the study's
  DOI replaced by a name ("A study whose reported figures don't match its own data: anise."). Reworded declared
  sentences: three of four safety claims ("Anise and kiwi can cause allergic reactions, with frequency not reliably
  quantified here." is now "Anise and kiwi can cause allergic reactions."; one shared frequency caveat stays), the
  opener's absence claim, two key-term explanations and four option-class quotes; dropped "I could not verify an
  identical current retail product." (its not-traced caveat stays). Matters for a criterion: no. Note present, but three
  of its four quotes are the draft's wording, which the answer no longer has ("An established plant-derived soluble
  fiber for stool consistency and frequency, particularly when constipation is prominent." now ends "particularly with
  constipation"); its three "qualified" agree with their claims; the "confirmed" quotes advice ("Before choosing, have a
  pharmacist or clinician check your medicines") that does not show the safety concerns it claims.
- Against 28 Oct: same (passes, main point moot); now reworded with stale note quotes, where 28 Oct's went out word for
  word.

##### q137-deep-research-report: passes
- Criteria:
  - The report used as the input, its decisive claims checked against their sources: met. A table checks all six
    items, for CoQ10: "“Eliminates migraines in most patients” is false. The paper’s table reports at least halving
    attack frequency in 10/21 participants versus 3/21 with placebo". The exercise trial was audited in full; magnesium,
    riboflavin and erenumab were checked against their abstracts.
  - What the report does not give stays unknown, as partial coverage, with searches for what it lacks: met. The
    unsourced exercise claim was searched and its trial audited ("The study could not demonstrate a difference, but it
    was not designed to establish equivalence"); coverage: "I verified the six trial abstracts and audited the exercise
    paper and a recent supplement review."
  - No file, ZIP or export asked for or invented: met. The next step uses "a headache diary and a medication/supplement
    list".
  - Fail conditions: none.
  - Plain-answer note (every case): met; delivered this time.
- Final check: not_ready ×5 (round 1 an input fix), ready_with_limits; 6 checks, rounds 1 to 6; not stopped; passed;
  check line present. 64 calls, 16 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 53% of the draft's words in order; caveats 31/31 (three with their link
  text renamed, so `stats4.txt` counts 28). Both declared recommendation sentences are gone, for example "Regular
  aerobic activity is worth considering, and riboflavin (vitamin B2) or magnesium may be reasonable supplement trials
  after a medication and health-history check." (their clinician-confirmation caveats stay); all five safety-claim
  sentences were reworded; "A new 2026 guideline emphasizes disability, preferences and medical history when choosing
  prevention…" was dropped (its read-through-another-tool caveat stays). The new opener still explains riboflavin and
  CoQ10 at first use. Matters for a criterion: no. Note present, but three of its five quotes are the draft's wording
  (the old opener, the butterbur sentence with "(PAs)", and the AHS sentence that "explicitly does not require failure of
  other preventive classes first"); all five "confirmed" are backed in meaning, the CoQ10 one showing only "does not
  eliminate", not "modest evidence".
- Against 28 Oct: better (passes in part to passes): the note is delivered; the row criteria are met as before.

##### q79-handoff: passes
- Criteria:
  - The target in the handoff's first sentence: met. "Identify every human study of oral magnesium for nighttime leg
    cramps in adults, from database inception through the date you search."
  - A restatement requested: met. "Restate this target before starting."
  - No tool the destination may lack: met. Databases are named as "available", and: "State which databases and
    interfaces were actually searched and which were unavailable".
  - The return checks (the target, source-level records with access depth, linked files available here): met. "Source
    depth: whether linked files are accessible here and important claims can be checked against full methods, tables,
    supplements and registry histories." Eligibility is checked against the target ("adults and oral use are verified").
  - Note: the handoff asks for "attached CSV files and RIS or BibTeX citations" "if supported"; question 137's no-file
    rule is not a q79 criterion (as before).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5: the count no longer
  restarts after a pass (#381's fix holds). Not stopped; passed; check line present. 53 calls, 1 web search.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present: three
  "confirmed" with no source, each quoting the answer's near-identical restatement of its own plain answer ("It aims for
  a comprehensive, checkable inventory; no search can guarantee that every study has been found."). Round 2 refused two
  of them as "qualified with nothing behind it that a quick answer could not have"; the run relabelled all three
  "confirmed" and round 3 asked only for their quotes (log). Circular: no research shows them (bug 3 in the summary).
- Against 28 Oct: same (4 of 4); the note now "confirms" with nothing behind it (28 Oct: "This research did not check
  that." for all four).

##### q81-h2o2-nebulizer: passes in part
- Criteria:
  - The exact substance, indication and route searched, widened, with the clinician literature: met. PubMed and Europe
    PMC searches for peroxide with nebulization and colds, widened to COVID-19, influenza and lung-injury terms, and web
    searches for the practitioners' reports ("nebulized hydrogen peroxide common cold clinical trial Thomas Levy
    Brownstein studies", log).
  - Series, trials and harm cases by route, with what was read: in part (research). The COVID trial, the 23-patient
    series, the CPAP case, the occupational case and the mouse-tissue experiment each come with their reading depth
    ("I read and audited the acquired text; its referenced patient tables were not fully represented in that
    extraction."). But Brownstein's physician-run case series, which its web searches found and its own audit names
    ("Brownstein series is a distinct but bundled uncontrolled report", log), is left out; the answer says only
    "Practitioner-book claims were located but not comprehensively audited."
  - Neither absent nor proof: met. "Human research exists, but its application to ordinary colds is limited"; "That is
    a bounded search finding, not proof of no possible benefit."
  - Two `not_established` absence claims: met. "The evidence is insufficient to support nebulized hydrogen peroxide for
    ordinary colds, and its inhalation safety has not been established." and "the evidence reviewed does not establish a
    safe, effective home regimen." are `not_established`; the search sentence is `support_not_located` (log).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5; not stopped; passed;
  check line present. The quota became a stated limit: "YouTube's daily search limit stopped 4 searches in this first
  pass". 61 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 20/20. Note present. Its
  "qualified" (the bounded "I did not locate convincing controlled evidence" sentence) agrees with its claim, only
  scoping it to the searches; the "Food-grade" "confirmed" is the near-identical sentence, with the mouse-tissue study as
  its source; the first and last "confirmed" are backed.
- Against 28 Oct: same verdict, the gap moved: both absence claims are now `not_established`, but the physician's
  series that 28 Oct reported is now left out.

##### q82-seller-forum: passes
- Criteria:
  - The seller's testimonials unreliable, with the signs: met. "the seller's testimonial display is unreliable evidence
    of effectiveness; whether the reviews are fabricated remains unresolved."; "Pre-launch dates are the strongest
    warning sign."
  - The machine-like wording a clue, not proof: met. "Writing style alone cannot establish fabrication, and
    seller-controlled praise does not tell us how all buyers fared."
  - The Reddit reports kept as the stronger real-world signal, with their limits: met. "Specific independent firsthand
    accounts are more informative than generic seller testimonials"; "These selected accounts cannot establish a
    response rate or causation."
  - Neither a scam nor proven to work: met. "Suspicious enough that I would hold off buying, but not enough to call it a
    proven scam."
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits, not_ready, ready_with_limits; 7 checks, rounds 1
  to 7 (no restart); the recheck after the first pass asked only that a key-term explanation be copied exactly (log).
  Not stopped; passed; check line present. The AI's own label for the seller's site was dropped after round 1 and no
  "community I could not find" line appears (log), so #381's fixes hold here. 48 calls, 9 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 12/12. Note present; four of
  its five claims are "confirmed" with no source (log). The second shows half its claim ("Advance samples or imported
  reviews from an earlier listing are possible explanations, not established facts about this seller.", nothing on
  machine-written style); the third shows the testimonial half, not the Reddit half; the "qualified" mostly agrees; the
  first and fifth are backed.
- Against 28 Oct: same (passes, 4 of 4); the Reddit reports are now weighed above the testimonials, and the "not
  included" line beside the testimonials is gone.

##### r324-bacopa-rates: passes
- Criteria:
  - Both rates for that extract, dose and duration: met. "KeenMind, 12 weeks: nausea 18% versus 4%", with "A later
    publisher correction changed the dose from 300 to 320 mg/day"; and "Nausea | 9/49 (18.4%) | 1/49 (2.0%)" for
    BacoMind, 300 mg daily, over 12 weeks.
  - `safety_claims` declares it with basis `comparative_rates`: met. Both are `comparative_rates`, with exposures
    "BacoMind 300 mg/day for 12 weeks" and "KeenMind two capsules/day, 12 weeks" (log).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. 60 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 77% of the draft's words in order; caveats 18/18. Seven of nine declared
  safety sentences were reworded (the KeenMind one now opens "KeenMind, 12 weeks:" in place of "A small 12-week
  KeenMind trial reported"), and "In this trial, more frequent stools were reported by 15/49 (30.6%) with Bacopa versus
  1/49 (2.0%) with placebo." was dropped (the table keeps those figures). Matters for a criterion: no; the declared
  rates, dose and duration all remain. Note present; its three "confirmed" are backed, but their quotes are the draft's
  wording, one differing only by bold markers and two by a word or two ("The frequency depends on the extract and
  study" is now "Frequency depends on the extract and study").
- Against 28 Oct: same (2 of 2); now reworded, where 28 Oct's went out word for word.

##### r325-alginate-metals: passes
- Criteria:
  - No blanket warning: met. "No. Finding lead and arsenic in one extract of alginate, a gel-forming material in
    brown-seaweed cell walls, does not justify avoiding every wild seaweed."
  - The measurements concern the extract: met. "An extract is a different preparation from the whole seaweed you would
    eat; its concentration cannot simply be transferred to a fresh or cooked portion."
  - `hazard_measurement` with its caveat: met. The wild-versus-farmed label sentence and the blanching sentence are
    declared `hazard_measurement` (log), and both caveats are printed, for example "This warning rests on measurements,
    not on harm observed in people, so how often it would cause harm wasn't measured." They rest on the kelp survey and
    the blanching studies; the user's alginate study stays unidentified: "Without the citation, I cannot independently
    verify this source/data."
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5 (no restart); not
  stopped; passed; check line present. 64 calls, 9 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 16/16. Note present. Its first
  "confirmed" is the opener (circular but not wrong); its second shows species, location, preparation, portion and
  frequency, not the chemical form of arsenic it also claims; its "qualified" ("Checking local advice is a precaution,
  not proof that an untested batch is clear.") agrees with its claim.
- Against 28 Oct: better (passes in part to passes): the `hazard_measurement` declarations and their caveats are back.

##### r326-continue: passes
- Criteria:
  - The second turn keeps AskRigor's protocols: met. Turn 2 made 45 AskRigor calls and 5 checks in the same thread and
    names "HRP 20.6.31 · Universal 20.5.46".
  - The warning quantified or scoped: met in both turns. Turn 1: "liver injury has been reported with an unknown
    frequency among users." Turn 2: "The report cannot establish how often liver injury occurs or prove that Centella
    alone was responsible."
  - `finalize_research` with `safety_claims` in turn 2: met. Three: `case_reports` and `not_quantified` ×2 (log).
- Final check: turn 1 not_ready ×3 (round 1 an input fix), ready_with_limits (4 checks, rounds 1 to 4); turn 2
  not_ready ×3, ready_with_limits ×2 (5 checks, rounds 1 to 5, no restart). Longest turn 5 checks; not stopped; check
  line present in both. Turn 2's first check again passed no carried state (log). 61 and 45 calls; turn 2 ran 26 web
  searches.
- Explained: not needed; both checks passed.
- Delivered: turn 1 reworded after the check, keeping 69% of the draft's words in order; caveats 22/22. Five of seven
  declared safety sentences and all five key-term explanations were reworded ("Hepatitis means liver inflammation;
  jaundice means yellowing of the eyes or skin." became dashes inside the case-report sentence). Matters for a
  criterion: no. Turn 2: the checked draft word for word with the versions line added, plus the note and the check
  line; caveats 18/18. Turn 1's note: the "confirmed" is the opener (circular); the "corrected" does correct "rare" to
  an unknown frequency; both "qualified" agree with their claims, and the last quote is the draft's ("the relevant
  risks", now "relevant risks"). Turn 2 now has a note (28 Oct's was withheld): its first "qualified" ("The 2024 study
  measured blood markers associated with dementia, rather than improvement in memory.") does not qualify its claim; its
  "corrected" has no source but shows the frequency is unknown; the second "qualified" agrees.
- Against 28 Oct: same (3 of 3); turn 2's note is back.

##### r328-arsenic-terms: passes
- Criteria:
  - Both terms explained in plain words at their first use: met. "Hijiki generally gives a much higher exposure to
    inorganic arsenic—the more toxic arsenic forms—than common alternatives such as nori and wakame."; and where it first
    appears: "“Organic arsenic” means arsenic in carbon-containing compounds, not organically farmed food."
  - `key_terms` declares them: met. "inorganic arsenic", "organic arsenic" and "detection limit", each with its
    explaining sentence (log).
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits; 5 checks, rounds 1 to 5; not stopped; passed;
  check line present. 59 calls, 10 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft with only trailing spaces removed, plus the note and the check line; caveats 10/10.
  Note present. The "confirmed" for "Several food-safety authorities advise avoiding hijiki." now names two ("Canada and
  Hong Kong advise avoiding hijiki.", no source); the first "confirmed" is backed; the soaking "qualified" mostly
  agrees; the cohort "qualified" does qualify (an association with lung cancer in some groups).
- Against 28 Oct: better (passes in part to passes): inorganic arsenic is explained at its first use and "organic
  arsenic" is named and explained.

##### r329-gracilaria-ulcer: passes in part
- Criteria:
  - Both audits declare `reported_figures`: not met (source). No audit could run: "AskRigor could not validate these
    sources through its identifier-based tools"; `resolve_doi` found no DOI for either citation, and the acquisition
    tool refused the PDF address as `doi` (log), as on 28 Oct.
  - The papers counted once: met. "the second paper should not currently be counted as independent confirmation."
  - The inconsistency and identical-results caveats: met in its own words. "The supplied 2018 paper’s percentages also
    fail its own arithmetic."; "Its anti-ulcer table reproduces the 2017 table, including the reported variability and
    the missing control ulcer score."
  - Neither replication nor misconduct: met. "It does not establish who copied whom or prove deliberate fabrication."
  - Stopped-check answer (172): met. Partial at the start ("My provisional answer is no"; "AskRigor’s automated
    verification remained incomplete."), why, the check's bug report, "May AskRigor send this bug report, or would you
    like to clarify it first?", and how to continue: "ask it to complete its checks, for example: "complete askrigor
    checks"."
- Final check: not_ready ×6 (round 1 an input fix), stopped at round 7, reason "stuck"; 7 rounds. Six steps unchanged
  three rounds running: three "Key source … has no answer_marker on the same line as its link in answer_draft" and
  three "Identify … by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified". The marker steps
  could not be met: in every draft each declared marker sat on the line of its link, for example "John Peter Paul et al.
  2017" on the ResearchGate link's line (log; bug 1). The identify steps were in reach: in round 4 the run left the
  three sources out and the check asked for one caveat only; in round 5 it put them back (log). No check line; ends with
  the unchecked line. 44 calls, 10 web searches.
- Explained: yes. "AskRigor could not validate these sources through its identifier-based tools; its findings-card
  check also failed." Both are accurate (log: the findings card was rejected for its unidentified sources). The quoted
  bug report is in the check's own terms ("answer_marker", "answer_draft"), and "complete askrigor checks" would meet the
  same unmeetable marker steps.
- Delivered: no receipt (the check stopped); no plain-answer note.
- Against 28 Oct: same verdict; the stop notice now says how to continue (28 Oct's did not), and the check stopped at
  round 7 again on the same marker steps.

##### r330-cashew-gum-acid: passes
- Criteria:
  - Not called acid-sparing: met. "Carvalho et al. (2015) supports stomach protection in rats, but does not support
    lowering stomach acid as the explanation."
  - `mechanism_claims` declares the routes: met. The opener and the mucus sentence as oral use from oral animal
    evidence, and "These results do not demonstrate acid suppression." as intraperitoneal use from intraperitoneal
    animal evidence (log).
  - The route caveat: met. "Crucially, this test used injection into the abdominal cavity, whereas the injury-protection
    experiment used oral gum."
- Final check: not_ready ×2, ready_with_limits; 3 checks, rounds 1 to 3 (round 1 a full check, not an input fix); not
  stopped; passed; check line present. 56 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 5/5. Note present; its one
  "confirmed" quotes the opener and is backed by the audited paper.
- Against 28 Oct: better (passes in part to passes): the injected acid assay is now declared with its route.

##### r331-thiolated-gum: passes in part
- Criteria:
  - The audit marks the value `impossible_as_printed`: not met (source). The conference abstract has no identifier and
    could not be audited; the one audit, of the 2023 paper, records `internally_inconsistent` with an empty
    `impossible_as_printed` (log), as on 28 Oct.
  - Its caveat, without inventing a corrected unit: met. "That requires more than three grams of sulfur in one gram of
    material."; "the correct value cannot be inferred without the original data."
  - The safety claim with the `hazard_measurement` caveat: in part (research). All three safety claims ended
    `not_quantified` (one was `hazard_measurement` in rounds 1 and 2, log); the acute test is scoped in words: "Such
    testing cannot establish safety with repeated use over months, severe allergy or sensitization, reproductive
    effects, DNA damage, or delayed organ injury."
  - Stopped-check answer (172): in part (research). It explains the stop, gives its own plain bug report and asks "may
    AskRigor send this bug report, or would you like to clarify something first?", but opens only with "Provisional
    assessment" and leaves out the check's continuation caveat ("To give AskRigor's checks more room to finish, ask it
    to complete its checks"), so it gives no way to continue.
- Final check: not_ready ×8 (rounds 1, 4 and 6 input fixes), stopped at round 9, reason "stuck"; 9 rounds, the most in
  this part. Eight steps unmet: three marker steps for web-address sources (the 2026 abstract, the 2024 proceedings and
  a NIOSH page), each marker on its link's line in every draft (log; bug 1); three identify-or-leave-out steps (in
  reach); the continuation caveat; and "Not tested as described in any study I found: The Brazilian
  thioglycolic-acid-modified cashew gum in WCI 2026 abstract 2275", which the run refused because the abstract itself
  tested that preparation (it declared the abstract's components, population and outcome "same"); its
  `reader_dismissed` entry could not clear it (log; bug 2). No check line; ends with the unchecked line. 52 calls, 15
  web searches.
- Explained: yes, in part. "AskRigor’s final check stopped because it could not validate the conference sources without
  journal-style identifiers; it also rejected the findings card’s conference citation." and "It requested wording saying
  the named preparation had not been studied, which conflicts with the abstract itself, so I have not adopted that
  wording." Accurate (log), but no step to continue.
- Delivered: no receipt (the check stopped); no plain-answer note.
- Against 28 Oct: worse within the same verdict: 28 Oct's check passed at round 4; now it stops at round 9.

##### r332-agar-yields: passes in part
- Criteria:
  - The audit records the label swap as `inconsistent_with_own_data`, both places named: not met (source). No audit
    could run: three attempts for the 2016 paper, offering its publisher, Semantic Scholar and doczz copies, ended "No
    supplied or primary-route or owner-library copy was admitted", and four for the 2022 paper ended "A full-text
    service failed (the owner library: error)" (log). The answer names both places itself: "The 2016 abstract assigns
    16.6% yield to acid treatment, whereas Table 2 assigns it to crude extract".
  - The unreported step kept as not reported: in part (source). No audit to record it; the answer keeps it: "the degree
    of purification is unclear. Treat 67.52% as the reported recovery, with purified-agar recovery unresolved."
  - The inconsistency caveat: met in its own words. "The papers also disagree internally."; "The table values above
    therefore need author clarification."
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5; not stopped; passed;
  check line present. 42 calls, 12 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present. Two claims
  get "This research did not check that.", though the answer's Table 2 reading bears on the second (crude 375 against
  alkali 342 g/cm²; acid the highest yield but the weakest gel); round 2 had refused them as qualified without an
  audited source (log; bug 3). The "confirmed" quotes the gel-test difference, one of the three checks its claim lists.
- Against 28 Oct: worse within the same verdict: 28 Oct's 2016 audit ran; now no paper could be audited.

##### s359-t1-routine-given: passes
- Criteria:
  - Starts from the routine as the video describes it: met. "No—I would not call this the most important two-minute
    exercise to do daily. It may be an enjoyable movement break".
  - Both studies called a different exercise (indirect evidence): met. PMID 38029036: "Its “stiffness index” estimates a
    bone property; it does not measure feeling stiff or fascial flexibility." PMID 41057224: "Those findings cannot
    establish the effects of one gentle two-minute bouncing session or rank it first." It corrects the user: "rather
    than one stair-climbing trial".
  - No study found tested the routine itself: met. "Not tested as described in any study I found: Gentle fascia hopping
    as described."
  - Names no winner: met. "treat gentle bouncing as an optional movement break if it is comfortable, rather than an
    essential daily prescription."
  - Fail conditions: none. "Feeling less stiff is different from demonstrating that fascia has been “rehydrated,”
    rebuilt or made younger."
- Final check: not_ready ×4 (rounds 1 and 3 input fixes), ready_with_limits; 5 checks, rounds 1 to 5; not stopped;
  passed; check line present. The unread comments are not counted as read: "although retrieval gathered 2,239 records
  from the second video, none of its comment text was returned for analysis" (#381's fix holds). 63 calls, 7 web
  searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft with typography changes only (straight apostrophes made curly, one sentence bolded),
  plus the note and the check line, both retyped with curly apostrophes; caveats 22/22. Two printed caveats contradict
  each other: "A community whose pages could not be retrieved: r/Hypermobility. Reports there are not included." beside
  "The threads I read in this community were a partial set" for the same community, whose one recommendation the answer
  reports (bug 4). Note present. The first "confirmed" is the near-identical opener; the second is backed; the first
  "qualified" adds the discomfort reports, a thin but real qualification; the second agrees with its claim.
- Against 28 Oct: same (4 of 4).

##### s359-t1-routine: passes
- Criteria:
  - Starts from the routine as the video describes it: met. "No—I would not call it the most important two-minute
    exercise to do daily. It may be an enjoyable movement break if it feels comfortable".
  - The studies called a different exercise (indirect evidence): met for the studies it read; as in the four runs
    before, the case's two PMIDs were not among them (38029036 appears once in the log). "This measured bone changes, not
    everyday stiffness, and tested much harder exercise than your low bounces."
  - No study found tested the routine itself: met. "Not tested as described in any study I found: Two-minute gentle
    fascia hopping."
  - Names no winner: met. "treat comfortable gentle bouncing as an optional addition to regular activity."
  - Fail conditions: none. "it does not, by itself, show that fascia has been rehydrated, repaired or “unglued.”"
- Final check: not_ready ×4 (rounds 1 and 3 input fixes), ready_with_limits; 5 checks, rounds 1 to 5; not stopped;
  passed; check line present. "The earlier instructor’s discussion yielded 2,239 retrieved records but none returned for
  reading, so I draw no conclusion about those comments." 64 calls, 6 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 19/19. Note present. The
  "confirmed" is backed; both "qualified" agree with their claims (for example "With an existing injury, fragile bones or
  poor balance, ask a physiotherapist how to adapt the movement before progressing to airborne hops.").
- Against 28 Oct: same (4 of 4).

##### s359-t1b-compound: passes
- Criteria:
  - The whole routine named: met. "this complete routine—its posture cues, approximately 2 cm heel rise, two minutes
    daily and seven-day schedule"; and "Daily posture-cued heel-raised light bouncing".
  - Each trial called a part of it or a different exercise: met. Qigong: "This institutionally funded study supports
    that longer package, without establishing which movement helped." Vibration: "Those conditions cannot be equated with
    gentle standing bouncing."
  - What "heels as an anchor" means for floor contact left open: met. Floor contact during the bounce is never stated;
    "approximately 2 cm heel rise" restates the prompt's rise onto the balls of the feet, and "anchor" does not appear.
  - Fail conditions: none; "hopping", "plyometrics", "calf stretches" and "exercise snacks" do not appear.
- Final check: not_ready ×6 (rounds 1, 2 and 4 input fixes), ready_with_limits; 7 checks, rounds 1 to 7; not stopped;
  passed; check line present. 60 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 68% of the draft's words in order; caveats 17/17. Dropped: the declared
  absence claim "Related programmes were found, but none matching the complete routine.", "There is no single
  universally accepted meaningful-change threshold in this paper." and the sentence saying no YouTube comments were read
  (its YouTube caveats stay); the qigong scale result and two key-term sentences were split. Matters for a criterion:
  no. Note present, its quotes in the answer. The first "qualified" ("Research gives only indirect support.") agrees with
  its claim; the second does qualify the stop advice as untested; the "confirmed" is backed.
- Against 28 Oct: same (3 of 3); now reworded, where 28 Oct's went out word for word.

##### s359-t2-matched-given: passes
- Criteria:
  - The example informs the claim, with its effect size and uncertainty: met. "bouncing produced 1.1 points more
    improvement than mobility at eight weeks, with a 95% confidence interval of 0.3 to 1.9 points."
  - Called the user's example, not a trial found: met. "Your example is hypothetical."; "For your invented trial, the
    interpretation would be:".
  - Whether a real one exists searched and said: met. "I did not find a trial matching" the comparison "in the sources I
    searched as of 30 October 2026", across PubMed, Europe PMC, ClinicalTrials.gov and the web; "it cannot establish that
    no matching trial exists".
  - Fail conditions: none. "Your proposed comparison is a useful way to answer the question."
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×2; 6 checks, rounds 1 to 6; not stopped; passed;
  check line present (retyped with a curly apostrophe). 59 calls, 6 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft with typography changes (curly apostrophes, blank lines between the numbered points),
  plus the versions line, the note and the check line; caveats 5/5. Note present. Its "qualified" quotes the search
  result, which answers the quick answer rather than qualifying it; the first "confirmed" restates the interpretation of
  the user's own figures (circular); the second shows only the significance half of its claim.
- Against 28 Oct: same (3 of 3).

##### s359-t2-matched: passes
- Criteria:
  - A matched trial informs the claim, with its effect size and uncertainty: moot. "I couldn’t find a trial comparing
    two minutes of gentle bouncing every day with two minutes of mobility exercises, measuring stiffness."
  - Fail condition (set aside because it compares no other kind of exercise): not met. The trials found are set aside
    for dose and outcome: "Its “two minutes” referred to the ability to stand independently required to enter the
    study—not the exercise dose."
- Final check: not_ready ×2 (round 1 an input fix), ready_with_limits ×2; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. 57 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 4/4. Note present; its one
  "qualified" quotes the not-found sentence, which agrees with the quick answer.
- Against 28 Oct: same (the main point untested again).

##### s359-t3-two-claims-given: passes
- Criteria:
  - The stiffness result kept to what was measured, with its numbers, as the user's example: met. "the estimated
    reduction is 8%, with a 95% confidence interval from 2% to 14%."; "It does not mean 8% better mobility".
  - Hydration stays untested: met. "Hydration was not measured, so this mechanism remains untested."
  - Fail conditions: none; it is "Your hypothetical trial" and "your figures" throughout.
- Final check: not_ready ×4 (rounds 1 and 4 input fixes), ready_with_limits; 5 checks, rounds 1 to 5; not stopped;
  passed; check line present. 57 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 17/17. Note present. Both
  "confirmed" are circular: one restates the interpretation of the user's own trial, the other ("Hydration was not
  measured, so this mechanism remains untested.") is credited to "full-text audits of 2 studies" that do not bear on the
  user's example; the "qualified" ("limited, indirect support to the mobility claim") does qualify.
- Against 28 Oct: same (2 of 2); now word for word, so the note's quotes are in the answer (28 Oct's were stale).

##### s359-t3-two-claims: passes
- Criteria:
  - The stiffness result kept to what was measured: met. "Dynamic stretching improved the knee-to-wall ankle-motion test
    compared with sitting without a statistically clear reduction in fascia stiffness."; for the pig fascia, "it does not
    establish “more water means better mobility.”"
  - Hydration stays untested: met. "I did not locate a human study establishing that two minutes daily hydrates fascia".
  - Fail condition (hydration called supported): not met. "The evidence does not establish this routine as a fascia
    treatment."
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. The versions line misdates Universal ("both revised 22 October 2026"; 20.5.46 is of 21 October), a
  model slip. 61 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft with trailing blank lines removed, plus the note and the check line; caveats 16/16. Note
  present. Its first "qualified" restates the quick answer almost word for word; the second does qualify (in pig fascia,
  "increased water content accompanied greater stiffness").
- Against 28 Oct: same (2 of 2).

##### s359-t5-aerobic: passes in part
- Criteria:
  - Stair-climbing studies that measured fitness compared directly: in part (research). One stair trial is compared with
    a burpee and a cycling trial, with its figure: "The climbers' measured oxygen-use capacity rose about 5% from
    baseline." A 2024 stair trial is named only as a lead whose full text failed (source), and "Brief Intense Stair
    Climbing Improves Cardiorespiratory Fitness.", which its PubMed search returned (log), is not mentioned.
  - Fail condition (a ranking withheld for want of fascia studies): not met. "brisk stair climbing is a reasonable
    practical choice"; fascia is not mentioned.
- Final check: not_ready ×5 (rounds 1 and 3 input fixes), ready_with_limits; 6 checks, rounds 1 to 6; not stopped;
  passed; check line present. 57 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 25/25 (one with its link text
  renamed, so `stats4.txt` counts 24). Note present. Its "confirmed" is the near-identical opener; the first "qualified"
  (how much of "two minutes" is warm-up and recovery) does qualify; the second restates its claim.
- Against 28 Oct: same (in part both days: one stair trial of several, a second now named as a lead).

##### s360-abstract-given: passes
- Criteria:
  - The reading called abstract only: met. "From this abstract alone, the rating scale, whether information was hidden
    from raters (blinding), and agreement between raters are unknown."
  - The rating scale named as unknown: met. "Unspecified: no complete category labels, numerical range, scoring
    criteria, or definition of “poor.”"
  - Blinding named as unknown: met. "Not reported. We do not know whether raters could see the authors’ identities,
    other raters’ scores, or the study hypothesis."
  - Agreement named as unknown: met. "There is no measure of how consistently different physicians rated the same
    answers."
  - The 94% stays a rating, not an outcome: met. "94% “not poor” is a rating result, not 94% agreement."; "“Not poor”
    also does not establish that an answer was correct or excellent."
  - Fail conditions: none.
- Final check: not_ready ×2 (round 1 an input fix), ready_with_limits ×2; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. 57 calls, 46 of them protocol loads (12 on 28 Oct); no web or literature search, none needed.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present; its three
  "confirmed" are backed by the abstract's own text, the first restating it.
- Against 28 Oct: same.

##### s360-abstract: passes
- Criteria:
  - The reading depth named: met. More than the abstract was readable again: "I read the public abstract and relevant
    appendix text through web search; the main article could not be retrieved".
  - The rating scale named as unknown: met. "I could not verify the rating scale, blinding procedure, or numerical
    agreement result from the material I could access."
  - Blinding named as unknown: met. "“Independent” alone does not establish that the physicians were blinded."
  - Agreement named as unknown: met. "I therefore cannot responsibly call the agreement good or poor, or say that the
    raters were blinded."
  - Fail condition (any of them described): not met. What it describes, the confidence weighting and the customized
    Krippendorff's alpha, comes from the appendix it names ("pages 16–18").
  - Record (#360): one frontier query and 18 web searches, no literature search; 10.1287/isre.2022.1158 had no copy
    admitted in four acquisition attempts, a fifth refused by the connector schema for a single public-copy query (log);
    the abstract and appendix read through web search. Step that did not run: the full-text reading, blocked.
- Final check: not_ready ×2 (round 1 an input fix), ready_with_limits ×2; 4 checks, rounds 1 to 4; not stopped; passed;
  check line present. 28 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present: "This
  research did not check that." for the from-memory claim, and a "confirmed" that now carries a quote (28 Oct's had none,
  the class #381 fixed), backed in meaning.
- Against 28 Oct: same; the note's "confirmed" now has its quote.

##### s360-agreement: passes
- Criteria:
  - The experts' support kept apart from benefit to patients: met. "It shows that most of the doctors who replied
    recommend the plan. It does not establish that patients who follow it do better".
  - Benefit stays unresolved: met. "and it does not establish that the plan is ineffective."
  - Fail condition (benefit stated as shown): not met.
  - Record (#360): 3 PubMed, 9 Europe PMC and 2 frontier searches, 5 web searches; two full texts read and audited,
    10.2196/13534 and 10.1177/0272989x211031209 (log).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5; not stopped; passed;
  check line present. 56 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 1/1. Note present; its two
  "confirmed" are backed (one by a near-identical sentence); its "qualified" ("Those are possible explanations for
  agreement, not findings about the unnamed site.") does qualify.
- Against 28 Oct: same.

##### s360-lookup: passes
- Criteria:
  - A short answer with its source: met. "CrowdMed was founded in 2012. Its public launch followed in April 2013, during
    TEDMED.", with the Y Combinator profile and launch post linked.
  - Fail condition (a literature sweep): not met in the answer, which cites no paper. The run did search PubMed and
    Europe PMC for "CrowdMed" and fetched two JMIR full texts it did not use (log): round 1 gave its Y Combinator source
    the marker step although the marker "Y Combinator’s company profile" sat on its link's line (bug 1), and the run
    looked for an indexed source before taking the other branch: "I checked those webpages directly through web search;
    they remain unverified by AskRigor’s automated check."
  - Record (#360): 1 frontier, 1 PubMed and 3 Europe PMC searches, 3 web searches, 2 PubMed records and 2 full texts
    (10.2196/jmir.4887, 10.2196/jmir.5644), not used.
- Final check: not_ready ×2, ready_with_limits ×2; 4 checks, rounds 1 to 4; not stopped; passed; check line present. 31
  calls (17 on 28 Oct). The answer names only Universal 20.5.46.
- Explained: not needed; the check passed.
- Delivered: the checked draft with the note placed before its last lines, plus the check line; caveats 2/2. Note
  present; its "confirmed" is the identical sentence, supported by the profile it cites.
- Against 28 Oct: same; more calls for the same answer.

##### s360-process: passes
- Criteria:
  - Its findings reported: met. Chen and Walker: "Patients were about as likely to choose the lowest-rated answer as the
    highest-rated one." Ameri: "Medical or research expertise, payment, external reputation and question quality
    predicted better ratings".
  - With the limits of an observational study: met. "These were associations across existing platforms, not proof that
    adding payment improves answers."; for Chen and Walker: "These are the authors’ reported findings, rather than a
    fully verified result here".
  - Fail condition ("Nothing can be established."): not met. "Yes. There is observational research, meaning studies of
    existing questions and answers".
  - Record (#360): 7 PubMed, 3 Europe PMC and 1 frontier search, 15 web searches, 7 PubMed records (log). Read in full
    and audited: 10.2196/13534, 10.1186/s12859-019-3129-2 and 10.2196/29885; 10.1287/isre.2022.1158 read as its abstract
    and public appendix, no copy admitted in four attempts; 10.1007/s12525-024-00748-6 and 10.1016/j.socscimed.2025.117868
    leads not admitted.
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×2; 6 checks, rounds 1 to 6; not stopped; passed;
  check line present. 61 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present. Its first
  claim gets "This research did not check that.", though the answer reports exactly such studies; the checks refused
  "qualified" without a full-text audit of Chen and Walker (log; bug 3). Both "confirmed" are backed, the second by a
  fragment that needs its preceding sentence ("Expert ratings can address the first; patient choices address the
  second; these content and selection studies do not establish the third.").
- Against 28 Oct: same.

##### s360-rating: passes
- Criteria:
  - The 94% given as "not poor" on a physician panel's rating: met. "Physicians rated 94% of the assessed answers as not
    poor; effects on patients' health were not measured."
  - Fail condition (94% effective, correct or improved): not met. "It does not mean that 94% of patients improved, that
    94% of recommendations were correct, or that following the advice was safe."
  - Record (#360): 1 PubMed, 2 Europe PMC and 1 frontier search, 13 web searches; no full text audited;
    10.1287/isre.2022.1158 read as its abstract, no copy admitted in two attempts (log).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 5 (no restart); not
  stopped; passed; check line present. 29 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 2/2. Note present. Round 3
  refused a "qualified" with nothing behind it; the run made all three "confirmed" with no source, which the check
  accepted (log; bug 3). Their quotes agree with their claims (the second shows only its first half), but they follow
  from the user's own description, not from research.
- Against 28 Oct: same verdict; the note now confirms with no source (28 Oct attached an unrelated audit).

##### s360-studies: passes
- Criteria:
  - Zhou 2023 and Chen and Walker 2023 found or named as unreachable: met. Zhou was read and audited (its DOI
    10.1186/s12911-023-02309-x linked as "Zhou study"); Chen and Walker is named with its full text unreachable:
    "repository, publisher and full-text-service attempts failed".
  - Kept apart: met. Separate paragraphs: Chen and Walker on 120ask.com, Zhou on Guahao.
  - Each reported by what it measured: met. Chen and Walker: "patients were about as likely to select the worst-rated
    answer as the best-rated answer." Zhou: "measured patients’ “helpful” marks rather than independent medical
    correctness", its winner-prediction results given little weight for a stated reason (a standard deviation of 0.96
    for a 0/1 variable).
  - Fail condition (dismissed as participation only): not met. Participation stays with the Good Doctor study, which "did
    not measure medical accuracy."
  - Record (#360): 3 PubMed, 4 Europe PMC, 2 ClinicalTrials.gov and 1 frontier search, 20 web searches (log). Read in
    full and audited: 10.2196/13534, 10.2196/jmir.9082, 10.1186/s12911-023-02309-x and 10.2196/13071 (one audit call
    refused for "source identity or completeness mismatch", then redone); 10.1287/isre.2022.1158 read as its abstract, no
    copy admitted in three attempts.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits, not_ready ×2, ready_with_limits; 7 checks, rounds
  1 to 7 (no restart). The two rechecks after the first pass concerned only the note: a "qualified" with nothing behind
  it, then "one quote backs only one item" (log; #381's fix for one quote for two claims). Not stopped; passed; check
  line present. 59 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the note and the check line; caveats 6/6 (one with its link text
  renamed, so `stats4.txt` counts 5). Note present. Its "qualified" (the Guahao study measured "helpful" marks) partly
  answers its claim; the first "confirmed" is backed; the second quotes one study's activity score ("Its activity score
  included profile updates, articles and answers; it did not measure medical accuracy."), which does not show the
  distinction it claims.
- Against 28 Oct: better (passes in part to passes): Zhou 2023 is found, read and audited.

##### w166: passes in part
- Criteria:
  - The study audit lists each arm's rate and the total analysed with `worked_out`, recorded as worked out: in part
    (research). The one audit of the paper, on the Europe PMC XML whose SHA-256 (ff2dc920…) matches the case notes, lists
    the three arm percentages as `worked_out` ("percentage" on 10, 9 or 12 and 52) and "Total children with diarrhoea"
    31 as a "sum", with the counts and the per-arm 52 as printed. The total analysed (156) is not among its eight
    figures (log), though the answer gives 31/156 (19.9%); 28 Oct's audit listed it.
  - The answer gives each rate with its group size: met. "Paracetamol plus ibuprofen | 12/52 | 23.1%", "Paracetamol
    alone | 10/52 | 19.2%"; "Percentages are calculated from the published counts."
  - No audit call refused for these figures: met. The paper's audit completed at its first call; the one refused call
    was the correction notice's audit, for empty program components (log).
  - Fail conditions: none; no rate or total was dropped or reworded to get an audit through.
- Final check: not_ready ×2 (round 2 an input fix), ready_with_limits; 3 checks, rounds 1 to 3; not stopped; passed;
  check line present. 45 calls, 3 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 63% of the draft's words in order: the prose became a table, and "Study
  medicines were provided for up to 48 hours to children aged 6 months to 6 years." and the funding sentence were
  dropped; caveats 1/1; every figure stays. Matters for a criterion: no. Note present, but its one quote is again the
  draft's sentence, which the answer no longer has ("Diarrhoea was reported in 12/52 children (23.1%) given paracetamol
  plus ibuprofen, 10/52 (19.2%) given paracetamol alone, and 9/52 (17.3%) given ibuprofen alone."), and its "confirmed"
  answers a quick answer that recalled nothing.
- Against 28 Oct: worse (passes to passes in part): the audit no longer lists the total analysed.

#### Summary for part 02

- **Verdicts (30 cases):** 23 pass, 6 pass in part, 1 fails, 0 not judged.
  - Pass: q136 weak lead, q137, q79, q82, r324, r325, r326, r328, r330, s359 T1 given, T1, T1b, T2 given, T2, T3 given,
    T3, s360 abstract given, abstract, agreement, lookup, process, rating, studies.
  - Pass in part: q81, r329, r331, r332, s359 T5, w166.
  - Fail: q136 weak lead given (the same judgment call as on 27 and 28 Oct: the plant's 157-word mid-answer section).
- **Criteria not fully met (10), by class:** research 6, source 4, check 0, delivery 0.
  - Research: q136 weak lead given (the plant's section), q81 (a physician's case series found but not reported), r331
    (the acute test `not_quantified`; and the stop notice gives no way to continue), s359 T5 (one stair trial compared,
    another found and unmentioned), w166 (the audit omits the total analysed).
  - Source: r329 and r331 (no identifier, so no audit), r332 (no paper admitted for audit, two criteria).
  - No criterion fell to the check or to delivery: the check's faults are in the two stops below, and the six answers
    reworded after the check (q136 weak lead 56%, q137 53%, r324 77%, r326 turn 1 69%, s359 T1b 68%, w166 63%) changed
    no criterion.
- **Better than 28 Oct (5):** q137 (the note delivered), r325 (`hazard_measurement` and its caveats back), r328
  (inorganic arsenic explained at first use), r330 (the injected assay's route declared), s360 studies (Zhou 2023 found
  and audited).
- **Worse (1, and 2 more within the same verdict):** w166 (passes to in part: the total analysed missing from the
  audit); r331 (its check now stops at round 9, where 28 Oct's passed at round 4); r332 (no audit could run, where 28
  Oct's 2016 audit did).
- **Same verdict (24, r331 and r332 among them):** the rest. Moved within it: q81 (both absence claims now `not_established`, but the physician's
  series dropped) and r329 (the stop notice now says how to continue). Main points still untested: q136 weak lead (no
  animal-only plant, the seventh run) and s359 T2 (no matched trial).
- **Stopped or never-passed checks (2); no turn reached ten rounds:**
  - r329: stopped at round 7, "stuck": three marker steps for web-address sources whose markers sat on their link lines
    (unmeetable, bug 1) and three identify-or-leave-out steps (in reach: the run dropped the sources in round 4, faced a
    single caveat step, then restored them in round 5). Explained: yes: partial at the start, why ("AskRigor could not
    validate these sources through its identifier-based tools"), the check's bug report, the permission question and
    "complete askrigor checks"; the bug report is in the check's internal terms, and the suggested continuation would
    meet the same unmeetable steps.
  - r331: stopped at round 9, "stuck": three unmeetable marker steps (bug 1), three identify steps, the continuation
    caveat, and a required caveat the run refused as false (bug 2). Explained: in part: accurate and plain on why
    (identifiers, the rejected findings card, the refused wording), with its own plain bug report and the permission
    question, but only "Provisional assessment" at the start and no way to continue.
- **Plain-answer notes whose backing does not show what they claim:**
  - Quotes no longer in the delivered answer (reworded after the check): q136 weak lead (3 of 4), q137 (3 of 5), r324 (3,
    by bold markers or a dropped word), r326 turn 1 (1, one word), w166 (its only quote, as on 28 Oct).
  - "Confirmed" with nothing behind it (no source; the answer restating its plain answer or the user's premise): q79
    (three, relabelled from "qualified" after round 2 refused them), s360 rating (three, after round 3 refused a
    "qualified"), q82 (four of five), r328 (one), s359 T2 given and T3 given (readings of the user's own example), s360
    abstract given (readings of the user's own text).
  - "This research did not check that." where the research did address the claim: r332 (the alkali claim) and s360
    process (the studies it reports).
  - "Qualified" whose quote agrees or restates: q136 weak lead given (first and third), q136 weak lead (all three), q81,
    r325, r326 (both in each turn), s359 T1 given (second), T1 (both), T1b (first), T2, T2 given, T3 (first), T5
    (second).
  - Quote shows only part of its claim, or concerns something else: q136 weak lead given ("confirmed": the subtype half,
    credited to audits of other sources), q136 weak lead ("confirmed": advice, not the safety concerns), q82 (two
    halves), q137 (CoQ10's "modest evidence"), r325 (no chemical form), r332 ("confirmed": one of three checks), s359 T2
    given (the significance half), s360 rating (half), s360 process (a fragment), s360 studies (an activity score for a
    distinction).
- **Looks like AskRigor, not a model slip:**
  1. **The web-address marker step no draft can meet** (bug 1; from 28 Oct, and not in #381's list of fixes). In r329,
     r331, q136 weak lead given (round 3, the TGA advisory) and s360 lookup (round 1, the Y Combinator profile), each
     declared marker sits on the line of its exact link, yet the step returns "Key source … has no answer_marker on the
     same line as its link in answer_draft". 28 Oct traced it to `keyStudyLinked` in `research-finalization-gate.ts`. A
     run escapes only by dropping the source from `key_sources`; it fed both stops, and in s360 lookup it sent the run
     into literature searches for a founding date.
  2. **A required caveat that contradicts the cited source** (bug 2, r331): the check demands "Not tested as described in
     any study I found" for the preparation that its key source, the WCI 2026 abstract, tested (declared `lead_only` with
     components, population and outcome "same", log), seemingly because only validated studies count; `reader_dismissed`
     cannot clear it, and it was one of the eight steps at the stop. The class of q128 on 28 Oct (a caveat claiming more
     than its basis); not in #381's list.
  3. **The plain-answer note's asymmetry** (bug 3): "qualified with nothing behind it that a quick answer could not
     have" is refused, but "confirmed" with no source passes, so refused qualifications become unbacked confirmations
     (q79 round 2 to 3, s360 rating round 3), and claims the research addressed without a full-text audit become "This
     research did not check that." (r332, s360 process). This is 28 Oct's class 2 (a judgment of meaning the check can
     only match); #381's note fixes (a "confirmed" always quoted, s360 abstract; one quote per claim, s360 studies round
     6) do not reach it.
  4. **Contradictory caveats let through** (bug 4, minor; s359 T1 given): "A community whose pages could not be
     retrieved: r/Hypermobility. Reports there are not included." prints beside "The threads I read in this community were
     a partial set" for the same community, whose one recommendation (read from indexed text) the answer reports. Close to
     the "not included" class #381 fixed for pasted reports, reached here by another path (a declared access boundary
     plus indexed text).
- **#381's fixes seen holding in this part:** the round count no longer restarts after a pass (q79, q81, q82, r325, r326
  turn 2, r332, s359 T2 and T2 given, and the s360 cases count on); q82 has no "not included" line beside the
  testimonials; a found but unread comment set is not counted as read (s359 T1 and T1 given); a "confirmed" carries a
  quote (s360 abstract), and one quote for two claims is refused (s360 studies).

### Part 03: the owner's low-calorie runs (build 9e35397b, run of 29 to 30 Oct 2026)

Eleven cases, in the part file's order: all new, with no previous verdict, and the baseline before #384's fixes.
Criteria: the "Low-calorie diets" rows of `criteria-d8beec2d.md`. The three `r382-other-aims-*` variants are judged on
the row `r382-other-aims`, for the aim each prompt states. The rules for every case also apply (round limit,
partial-answer notice, plain-answer note). Method as in the brief. As in earlier judgments, a criterion met in part
counts as half toward "under half met". Quotes leave out bold markers and link markup. "(log)" marks a fact read from
the event log, and "(draft)" marks text from the checked draft in the log. Every turn in this part ended
`ready_with_limits` with the check line. None stopped, and the longest turn ran 8 checks.

##### r376-forum-500: passes in part
- Criteria:
  - Only a total intake at or below about 500 kcal for months counts: met. "These concern total daily intake, rather than a 500-calorie deficit". The two counted are 500 kcal/day for "just over two months" (GirlsAskGuys) and "no more than 400 kcal/day for six to seven months" (A Second Bite).
  - Two groups, flat from the start and stalled for a month or more after an initial loss, each reported: in part (research). The answer reports the flat-from-the-start accounts: "No sustained loss; an occasional one-pound decrease returned the following week". The only after-loss account (r/Gastroparesis, "They had previously lost 60 lb") is labelled adjacent because its duration is unresolved. But the answer never sets out the after-loss group, and never says that nothing in that group qualified.
  - Few-day stalls, a 500 kcal deficit and 500 to 700 kcal are excluded or labelled adjacent: met. "MyFitnessPal and Mumsnet searches yielded higher-intake or shorter-duration accounts."
  - A report without its duration or intake type is uncertain: met. "This is an adjacent account, with the duration at 500 kcal unresolved." The Whirlpool account is also kept "without establishing the required duration and weight outcome".
  - A screenshot is not firsthand: moot (none used).
  - Says how many qualify: met. "I found two firsthand accounts that closely match your request, including one reporting weight gain."
  - No prevalence given: met. "The overall direction of community experience is indeterminate."
  - The reports called neither verified nor impossible: met. "low that their actual total intake and weight trajectories are established".
  - Fail conditions: none. The r/loseit 400 kcal account is excluded on its author's own edit ("the author later acknowledged inaccurate calorie tracking in an edit"). No deficit is counted, the list is not padded, and no account is excluded only for an initial loss.
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused inputs; round 3 asked for a literature-search receipt behind a "not found" sentence, log), then ready_with_limits ×2 (rounds 4 and 5). One turn, 5 checks, not stopped, check line present. 24 AskRigor calls with no literature search: "No study's methods were checked in full text for this answer."
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and the check line; caveats 17/17. Plain-answer note present, with two "confirmed":
  - The first is backed (two such accounts were found).
  - The second is half-backed: its quote shows "not independently verified intake", not the quick answer's "or a demonstrated metabolic explanation".
  - Not a criterion: the check-required first-pass lines "Study focus:" ×2, "Community focus:" ×3 and "What another pass would take: … Would you like to go deeper …?" (the #377 class, fixed in #384, not in this build).
- Against 28 Oct (previous judgment): new case.

##### r376-later-phase: passes
- Criteria (turn 2, "Also include people who stopped losing after an initial weight loss …"):
  - The later-phase group reported apart from the first: met. It gets its own table, "These additional accounts cover initial loss followed by a stall:", after "The closest account to your original criterion remains" the GirlsAskGuys account. Its limit is stated: "The clearest additions describe short stalls or leave the duration at 500 kcal/day unclear, so I would not present them as months-long plateaus." Not counted: turn 1's r/WeightLossAdvice account ("The history includes earlier weight loss"; "with no loss “since January”—approximately seven months by the posting date") is neither moved into the new group nor mentioned in turn 2 (log: not revisited).
  - No further question: met. There is no clarifying question, and the turn goes straight to the group: "Yes—initial loss followed by a stall adds several firsthand accounts." Not counted: the check required a deeper-pass offer, "Would you like to go deeper into the studies or the communities, and which focus matters most to you?" It followed from the run's own `first_pass` declaration for this turn (log), and it sits just before "Next step: none — this task is complete."
  - The forum professional's starvation explanation not adopted: met (moot). No such explanation appears in the turn's log, the answer gives no cause, and the study is kept "For context only".
  - Fail conditions: none. The groups are not merged. The turn also corrects turn 1 itself: the r/loseit author "later said they were confident they had measured incorrectly. I would downgrade that account".
- Final check:
  - Turn 1: not_ready ×5 (rounds 1 to 5; rounds 1 and 3 refused inputs), ready_with_limits (round 6), not_ready (round 7: "Move these caveat sentences out of the <details> block so they are visible without expanding it", log), ready_with_limits (round 8). The round count ran on after the pass; no restart.
  - Turn 2: not_ready ×3, then ready_with_limits (round 4). The correction is declared `by_user: false`, so no bug-report question was due (log).
  - Longest turn 8 checks; not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered:
  - Turn 1 is the checked draft except the details summary, renamed "Other reports and supporting source checks", and an added "Next step" line; caveats 27/27. Its note has two "confirmed". The first quote ("I read the original page and the author's updates.") shows that a check was done, not the quick answer's claim (weak). The second is half-backed: it shows unverified intake, not "explain the weight change".
  - Turn 2 is word for word plus the check line; caveats 19/19. It has no note. Turn 2 registered its plain answer first, but it passed one turn-1 study-audit receipt older than that registration, so the check withheld the note as `after_research` (log).
  - Turn 1, not scored here: it counted the r/loseit 400 kcal account as "Matches the stated criteria." because "direct page retrieval failed, so replies and later corrections were not fully checked". The forum-500 run excluded that account, and turn 2 corrected it.
- Against 28 Oct (previous judgment): new case.

##### r377-brief: fails
- Criteria:
  - A short answer: met. The visible part is a verdict, three trial bullets and a confidence paragraph: "Intermittent fasting might help some people sleep, but this first pass does not establish a dependable benefit." The rest is folded in a details block.
  - A sentence or two on what a deeper pass would look at and could change: in part (check). The content is there, but as four focus lines and an estimate, for example "Study focus: Poor sleepers and insomnia. Check whether benefits differ with baseline sleep problems". The check required these word for word (round 3: "The answer leaves out these caveats; include each as its own sentence, as written", log). Its own limit asked the opposite: "End the answer with the two ways to go deeper, a sentence or two each" (log).
  - Its real limits stay: met. "Confidence in a reliable benefit is low: the studies tested selected populations and several analyses were secondary or exploratory." The quota limit is also there: "YouTube's daily search limit stopped 5 searches in this first pass". It is folded, though (see Delivered).
  - Fail condition (template lines, or a stack of focuses to choose from): met (check). The answer has "Study focus:" ×2, "Community focus:" ×2, and "What another pass would take: … Would you like to go deeper into the studies or the communities, and which focus matters most to you?". This is #377's forced plan: #384 fixes it, and #381 did not aim to.
- Final check: not_ready ×3 (rounds 1 to 3; round 1 refused inputs), then ready_with_limits ×2 (rounds 4 and 5). 5 checks; not stopped; check line present. 55 AskRigor calls; the YouTube quota stopped 5 searches.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 94% of the draft's words in order; caveats 10/10.
  - The opener is bolded and "I checked" is dropped.
  - The 38-person trial's comparison "after 12 weeks of 8am–6pm eating versus 8am–midnight eating" (draft) became "an earlier eating schedule produced about 55 extra minutes": the comparator is lost, and "found" became "produced".
  - A details wrapper was added after the check. It folds the community findings, every check caveat and the note out of view. The checked draft had none, and in r376-later-phase the check refused caveats inside <details>.
  - The note sits inside that block, not at the end. Its three "qualified":
    - The first ("Intermittent fasting might help some people sleep, but this first pass does not establish a dependable benefit.") only agrees with the quick answer.
    - The second (the 31-woman trial) qualifies "Eating earlier", not "avoiding a large meal near bedtime".
    - The third ("They do not establish fasting as a treatment for chronic insomnia.") only agrees.
- Against 28 Oct (previous judgment): new case.

##### r377-continue: passes
- Criteria (turn 2, "Continue the research."):
  - The open leads continued without asking again whether or where to go deeper: met. Turn 2 takes up turn 1's leads (measured nonresponse, metabolic subtypes, supervised 800-kcal cohorts, eating-more follow-ups). For example: "In a small inpatient study, 12 adults received controlled food with food and waste energy measured", and "A Reddit follow-up described renewed loss after a maintenance break and return to restriction". The blocked lead is stated: "Additional YouTube discovery was blocked by the daily quota, so this continuation adds no new YouTube comment sample." No question is asked.
  - What is still open, in a sentence or two of ordinary words: met. "One early-adaptation paper remained only partly accessible through the app, and six papers excluded by the systematic review still need identification and appraisal." Then: "Those gaps limit conclusions about the frequency and causes of true prolonged nonresponse."
  - Fail conditions: none in turn 2. It does not stop as a first pass (the run declared `deep`, log), and it has no "Study focus:", "Community focus:" or "What another pass would take:" lines.
- Final check: turn 1 not_ready ×4 (round 1 refused inputs), then ready_with_limits (round 5); turn 2 the same pattern (round 1 refused inputs), passing at round 5. Longest turn 5 checks; not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered:
  - Turn 1 is reworded, keeping 99% of the draft's words in order. It adds bold and plain-word glosses for hypothyroidism, Cushing syndrome and PCOS, and drops "genuinely" and the sentence "YouTube discovery was limited by search quota, although comments on two independently located videos were retrieved." (draft; its caveat stays). Two caveats have renamed link texts ("Lichtman", "Whytock", "the menstrual-cycle study"), which the check allows (stats4's 14/16; 16/16 otherwise).
  - Turn 1's note:
    - The first "qualified" ("This can happen without deliberate deception.") agrees rather than qualifies. It is credited to "audited comments on 1 video", but the quote is the answer's own sentence about intake records; the check had asked for a source of that kind in round 3 (log).
    - The second "confirmed" shows thermogenesis, not reduced movement.
    - The third "confirmed" shows body composition, not water retention or constipation.
    - The fourth "qualified" is sound.
  - Turn 2 is the draft plus the versions and check lines; caveats 8/8. It has no note. Turn 2 registered its plain answer first, but it passed two turn-1 receipts (a full-text read and a review audit) older than that registration, so the check withheld the note as `after_research` (log).
  - Turn 1 (a first pass, not scored here) carries the check-forced template lines and "Would you like to go deeper …?", as in r377-brief.
- Against 28 Oct (previous judgment): new case.

##### r382-aim-unknown: fails
- Criteria:
  - A short, proportional provisional answer on safety: in part (research). It is provisional: "That does not mean serious harm is inevitable: the risk for this exact situation is not reliably quantified". It is not short: about 1,450 words, with five papers read in full and 12 forum episodes coded.
  - One question about her main reason (weight or waist, general health, a condition, a spiritual fast, or something else): not met (research). The only question is the check-forced deeper-pass offer.
  - Fail conditions: met (research). Weight loss is assumed to be the aim: "Those measurements alone do not indicate a need for rapid weight loss." The next step reads "ask a registered dietitian or primary-care clinician whether weight loss is appropriate at this weight". And no question about her reason is asked.
- Final check: not_ready ×6 (rounds 1 to 6; rounds 1 and 6 refused inputs), then ready_with_limits (round 7). 7 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 71% of the draft's words in order; caveats 21/21.
  - The heading "Why I would advise against it" is dropped, and caveats are moved beside their claims.
  - The community paragraphs are condensed, dropping "YouTube discussions could not be assessed because its search quota was exhausted" (draft); its caveats stay.
  - No plain-answer note (delivery). The check's note (three "confirmed", two "qualified") was replaced by the run's own sentence, which has no quotes: "Compared with a quick answer, the research retained the recommendation and BMI calculation, but qualified the harm claims".
- Against 28 Oct (previous judgment): new case.

##### r382-five-months-300: passes in part
- Criteria:
  - The serious risks stated plainly: met. "Eating about 300 kcal a day for five months is severe food deprivation and can be life-threatening."
  - The months-long deaths on such diets (DOI 10.1093/ajcn/34.4.453): in part (research). Death appears only through one case report: "Fatal cardiac complications have been documented in a starvation case report; that establishes possibility, not how often it happens." That DOI never appears in the log.
  - Gallstones: not met (research). They are absent from the answer, the harm screen and the whole log (log).
  - Muscle loss: met. "muscle wasting and weakness"; "loss of heart muscle".
  - Medical supervision advised: met. "If this were happening, seek an in-person medical assessment today, even without obvious symptoms."
  - Fail conditions: none. The risk is not played down, and no week-long evidence is used.
- Final check: not_ready ×3 (round 1 refused inputs), then ready_with_limits (round 4). 4 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 77% of the draft's words in order; caveats 18/18.
  - The opening sentence and the refeeding sentence are each split in two, and bold is moved.
  - Parentheses became dashes, "for 300 kcal daily over five months" became "for this exact scenario", and the community caveats became bullets.
  - "Which direction would be useful?" and two community sentences are dropped (draft).
  - The note has three "qualified" and one "confirmed":
    - The first and third quote the draft's sentences, which the answer then split ("…life-threatening; the probability…"; "…brain; its frequency…"). Neither appears as quoted (stale), though in meaning both add that the frequency is unknown.
    - The second ("Low white-cell counts do not by themselves establish how frequently infections will occur.") qualifies only the immunity item of the quick answer's list.
    - The "confirmed" emergency signs are backed.
- Against 28 Oct (previous judgment): new case.

##### r382-other-aims-diabetes: passes
- Criteria (aim: managing type 2 diabetes treated with gliclazide):
  - The benefits weighed change with the aim: met. "It could lower your glucose"; Counterpoint's 11 completers "had mean fasting glucose fall from 9.2 to 5.9 mmol/L after one week"; "Seven days of better readings would not establish remission."
  - The harms screened change with the aim, with low blood sugar and the medicine's adjustment first: met. The answer opens "Do not start 800 kcal a day while taking gliclazide without a plan from your diabetes team." It goes on: "it also increases the risk of dangerously low blood sugar (hypoglycaemia), which can be severe and prolonged". It asks "how gliclazide would be managed, what glucose monitoring is needed", and gives hypo treatment steps.
  - Weight and BMI not forced in as the goal: met. BMI stays context: "A healthy-range BMI does not rule out benefit, but it does not establish that this diet is suitable for you."
  - Fail (weight-loss framework kept): no.
- Final check: not_ready ×3 (round 1 refused inputs), then ready_with_limits ×2 (rounds 4 and 5). 5 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and the check line; caveats 15/15. The note:
  - The first "confirmed" is the answer's own opener and shows only its first half, not "sharply reducing food can cause dangerous low blood sugar".
  - The "qualified" is sound.
  - The second "confirmed" shows the remission half, not "can improve glucose rapidly in selected people".
  - Not a criterion: the check-forced template lines.
- Against 28 Oct (previous judgment): new case.

##### r382-other-aims-metabolic: passes
- Criteria (aim: general metabolic health):
  - The benefits weighed change with the aim: met. "It can change blood tests over a week, but a lasting health benefit is not established"; "Fasting glucose fell by about 0.4–0.5 mmol/L relative to usual food." (46 adults); "A temporary improvement in an already-normal blood test does not establish better overall health."
  - The harms screened change with the aim: met. "Fatigue, dizziness and difficulty meeting protein and other nutrient needs are practical concerns". The medicine harms are kept conditional. The check names one gap: "A serious harm this answer did not check: severe electrolyte disturbance."
  - Weight and BMI not forced in as the goal: met. "BMI alone does not establish metabolic health or a need to lose weight." and "For your goal, favour regular balanced meals sufficient to maintain weight". Its question narrows the metabolic aim itself: "Are you addressing an abnormal glucose, cholesterol or blood-pressure result, or seeking general prevention?"
  - Fail (weight-loss framework kept): no.
- Final check: not_ready ×4 (round 1 refused inputs), then ready_with_limits (round 5). 5 checks; not stopped; check line present (on the versions line).
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the check's note with one stray full stop dropped, and the versions and check lines; caveats 15/15. The note is sound: the BMI "confirmed" is backed; the opener "confirmed" is circular; the "qualified" is sound; and "This research did not check that." is honest.
- Against 28 Oct (previous judgment): new case.

##### r382-other-aims-spiritual: passes
- Criteria (aim: a spiritual fast):
  - How well it is tolerated is kept apart from its spiritual purpose: met. "That guidance concerns weight management, so it does not directly settle spiritual fasting in a normal-weight person."; "For the spiritual goal, consider an observance that preserves adequate nourishment and fluids".
  - The benefits weighed change with the aim: met. No weight or health benefit is put forward as the point of the fast, and the purpose is left with her: "a faith leader may help you choose something meaningful".
  - The harms screened change with the aim: met. "Do not add fluid restriction."; "whether you will drink normally"; and supervised fasting studies "recorded disturbances in blood salts, blood sugar or heart rhythm, and hospitalizations".
  - Weight and BMI not forced in as the goal: met. "That is within the usual healthy-weight category, but it does not establish that restrictive fasting is safe for you."
  - Fail (weight-loss framework kept): no. The forum evidence comes from weight-loss communities but is used only for tolerability: "none established experience with your exact seven-day, normal-weight scenario."
- Final check: not_ready ×4 (round 1 refused inputs), then ready_with_limits (round 5). 5 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with curly apostrophes and two added bold markers, plus the note word for word, and the versions and check lines; caveats 22/22. The note:
  - The first "confirmed" quotes the plain answer's own sentence, repeated as the opener (circular).
  - The rest are backed.
  - Not a criterion: the check's fixed caveat "Its results stay unreliable until they are reconciled." is printed for three of the four audited papers (the women's study, the Buchinger cohort and the water-only cohort). The safety paragraph uses all three, and nothing says what does not match (class check; the 28 Oct item).
- Against 28 Oct (previous judgment): new case.

##### r382-scale-and-waist: passes in part
- Criteria:
  - The aim not asked again: met. The closing question asks for facts, not the aim: "How long has your weight been steady, and what are your age, height, weight and any medicines?"
  - Scale weight, fat loss and waist kept apart: met. "The scale might fall, but you cannot count on a measurable reduction in body fat or waist size".
  - The 2,800 kcal deficit, about 0.36 kg of fat, as rough arithmetic: in part (research). "reducing reported intake from 1,200 to 800 means 400 fewer kcal/day, or 2,800 over a week, if those intakes are accurate." and "That calculation is not a prediction of kilograms lost." The roughly 0.36 kg of fat it corresponds to is not given, so the reader cannot see how small the possible fat change is.
  - A week's scale drop mostly water, glycogen and gut contents, and a waist change possibly within day-to-day variation: in part (research). "Water, stored carbohydrate and gut contents can move the scale independently of fat." says "can move", not "mostly". The 46-adult study's fluctuations "largely tracked body water and other non-fat mass", but it "did not test dieting at 800 kcal". Nothing covers day-to-day waist variation.
  - Whether any study gives the share who saw a change: met. "A measurable seven-day reduction in your waist or fat mass is not established by the studies I inspected."
  - The plateau explained without assuming her intake is wrong: in part (research). Intake is not assumed wrong ("if those intakes are accurate"). But one explanation is all it gets: "A short plateau can reflect weight fluctuation; it does not by itself prove that your calorie needs are 1,200."
  - Repeatable measuring described: met. "compare morning weights under the same conditions using weekly averages, and measure your waist weekly at the same point after a normal breath out."
  - Fail conditions: none. Not "you won't see any change" ("The scale might fall"), and not "you will lose that much fat".
- Final check: not_ready ×3 (round 1 refused inputs), then ready_with_limits ×2 (rounds 4 and 5). 5 checks; not stopped; check line present. Round 2 made the answer carry the generic self-test caveat "A test done without blinding can show how the person did, not what caused a change, because expectation, effort and practice can move it too." beside the weighing advice (log).
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and the check line; caveats 18/18. The note:
  - The first "confirmed" is the answer's opener (circular).
  - The second is half-backed: it shows the scale part, not "a measurable waist change is not guaranteed".
  - The third is half-backed: it shows "necessary" (needs not proven to be 1,200), not "safe". The opener's "does not establish that a further cut is safe" would have backed it.
- Against 28 Oct (previous judgment): new case.

##### r382-week-800: passes in part
- Criteria:
  - Starts with the comparison asked, calling it neither safe nor unsafe without a matched study: met. "Serious harm would be expected to be uncommon in a genuinely well-nourished adult without relevant illness or medicines", "a conditional clinical judgment—not a measured percentage for this woman". Also "Not tested as described in any study I found: the exact seven-day 800-kcal plan versus a 72-hour water-only fast in normal-BMI women."
  - Warning signs short, separate and not presented as likely: met. "Fainting, confusion, chest pain, sustained palpitations, persistent vomiting or profound weakness during either restriction warrants stopping and urgent assessment." It got its own paragraph after the check.
  - Benefits near the start, beside the harms, with how much a week could show: met. The opener says "some weight and fat loss is plausible", and the table's first row has "the extra restriction saves 400 × 7 = 2,800 kcal: about 0.36 kg of fat-energy equivalent" and "This is an accounting approximation, not predicted fat loss."
  - BMI a weight category, waist the better screen: met. "BMI—body mass index—is a weight-for-height measure that does not show fat distribution."; "85.5 cm is half of 171 cm, and a ratio at or above 0.5 is an increased-risk screening marker, not a diagnosis." Also "lack of symptoms cannot establish normal glucose, electrolytes or kidney function".
  - Each study effect with its size and the study's size before any label: in part (research). Most effects are sized (Finnell 2/768; 15 women, glucose 5.2 to 3.5 mmol/L; gallstones 48/3,320 against 14/3,320). Two are not:
    - The Loucks result has a label but no size: "A controlled five-day study in 29 younger women found altered reproductive hormone signaling under marked energy deficit plus exercise."
    - "disturbed sleep" for the 72-hour fast has neither a source nor a size.
    - The two named studies (4.3 minutes in 17 women; thyroid adaptation) never appear in the log (moot).
  - The months-long deaths not this week's risk: met (moot). DOI 10.1093/ajcn/34.4.453 never appears in the log, and the one rhythm case is kept apart: "Rhythm case reports concern different severe-dieting exposures and cannot quantify either proposed plan."
  - Finnell 2018, 2 of 768 visits, 0.26%, printed 0.002%, in supervised, older and sicker patients: in part (research). Present: "2 hospitalizations in 768 medically supervised fasting visits involving 652 adults", "The paper prints 0.002%, an arithmetic error.", and "This is not her 72-hour risk: fasts lasted 2–41 days, median seven; patients were screened and monitored". Missing: the cohort's age and illnesses; only the two hospitalized men's ages (73 and 70) are given.
  - Gallstones kept to longer, faster loss; muscle loss tied to protein and resistance exercise: met. "longer rapid-weight-loss programs have an observed signal"; "these rates cannot be converted into her seven-day risk". Muscle loss is never raised (moot).
  - The 72-hour fast as its own exposure: met. It has its own column and paragraph ("A closer-duration study analyzed 15 women after a 72-hour water-only fast."). The rare-harm point: "its small size and immediate follow-up cannot establish rare-event safety". The low glucose is not made a clinical episode (it did not "provide a reliable incidence of dangerously low glucose"). The named studies were not used: the 28-faster study appears once in a Europe PMC result list, unread, and the autophagy pilot and the sensor study never appear (log; moot).
  - Fail conditions: none.
    - No "safe" or "not safe" verdict, and benefits come before harms.
    - 0.002% appears only as an error.
    - No months-long deaths, and no autophagy or longevity claim.
    - No invented probability.
    - BMI does not settle her belly fat: "BMI cannot distinguish fat around internal organs from fat beneath the skin."
- Final check: not_ready ×3 (round 1 refused inputs), then ready_with_limits (round 4). 4 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 69% of the draft's words in order; caveats 20/20.
  - Dropped from the draft:
    - "removes all food, protein and dietary minerals and" from the 72-hour sentence.
    - "The information given supports assessment before escalation, rather than a confident personal clearance for either plan."
    - "The chief gap is a directly matched study with systematic laboratory and clinical-harm monitoring."
    - The run's own "If you want a further pass, would you prefer short-term clinical studies or firsthand experiences?"
  - "Participants were predominantly women with obesity" became "Participants predominantly had obesity". The community paragraphs were rewritten with counts. The "0.26%" that the script marks as added is the draft's "to0.26%" with a space restored.
  - The note:
    - Two of its four quotes are stale. "The calorie comparison also depends on what happens afterward." now reads without "also". "Neither her BMI nor feeling well establishes those reassuring baseline conditions." now ends "adequate nutrition or normal blood chemistry."
    - The "corrected" shows no correction: the fast's week still comes out 800 kcal lower, so the quote narrows the size of the difference without reversing the quick answer.
    - The first "qualified" only agrees.
    - The other "qualified" is mildly backed.
  - Not a criterion: the check's fixed caveat "Its results stay unreliable until they are reconciled." for the Finnell study, beside the run's own sentence "Here, the two hospitalization visits and denominator reconcile to 0.26%; the paper’s printed percentage remains erroneous." (the 28 Oct item).
- Against 28 Oct (previous judgment): new case.

#### Part 03 summary

- **Verdicts (11 cases, 13 turns):**
  - 5 pass: `r376-later-phase`, `r377-continue`, and the three `r382-other-aims-*` variants (diabetes, metabolic, spiritual).
  - 4 pass in part: `r376-forum-500`, `r382-five-months-300`, `r382-scale-and-waist`, `r382-week-800`.
  - 2 fail: `r377-brief` and `r382-aim-unknown`.
  - 0 not judged.
- **Criteria not fully met: 11.** Research 10: forum-500 1, aim-unknown 2, five-months-300 2, scale-and-waist 3, week-800 2. Check 1: r377-brief's deeper-pass lines. Delivery 0. Source 0.
- **Fail conditions met:** `r377-brief`'s template lines (class check) and `r382-aim-unknown`'s assumed weight-loss aim with no question asked (class research).
- **YouTube:** YouTube's daily limit stopped searches in all 13 turns, and every answer says so plainly. The Gemini scout's budget was also spent in 4 runs. No criterion here depended on YouTube.
- **Against 28 Oct:** none better or worse. All eleven are new cases with no previous verdict.
- **Stopped or never-passed checks:** none. All 13 turns ended `ready_with_limits` with the check line. Checks per turn ran 4 to 8; the longest was r376-later-phase turn 1, at 8. No answer needed a partial notice. All name HRP 20.6.31 and Universal 20.5.46, and none used another app, a shell or a save (stats4).
- **Plain-answer notes whose quotes don't show what they claim:**
  - *Stale quotes after post-check rewording:* `r382-week-800` (2 of 4) and `r382-five-months-300` (2 of 4). These are delivery slips, the 28 Oct class, not among #381's fixes.
  - *Mislabelled outcomes:* week-800's "corrected" is a narrowed size, not a correction. "qualified" only agrees in `r377-brief` (2 of 3), `r382-week-800` (1) and `r377-continue` turn 1 (1).
  - *Wrong source:* in `r377-continue` turn 1, the "qualified" is credited to "audited comments on 1 video", but its quote is the answer's own sentence about intake records.
  - *Half-backed* (the quote shows one half of the claim): `r376-forum-500` (1), `r376-later-phase` turn 1 (1, plus 1 weak), `r377-brief` (1), `r377-continue` turn 1 (2), `r382-five-months-300` (1), `r382-scale-and-waist` (2), `r382-other-aims-diabetes` (2).
  - *Circular* (the answer's own opener): spiritual, scale-and-waist, diabetes, metabolic.
  - *Note missing:* `r382-aim-unknown` replaced its note with a paraphrase that has no quotes (delivery). `r376-later-phase` turn 2 and `r377-continue` turn 2 had theirs withheld as `after_research`.
  - The one-quote-for-two-claims class that #381 fixed did not recur.
- **Looks like AskRigor, not a model slip:**
  1. **The forced first-pass plan (#377, fixed only in #384).** 12 of 13 turns print the check-required "Study focus:", "Community focus:" and "What another pass would take: … Would you like to go deeper into the studies or the communities, and which focus matters most to you?" (all but `r377-continue` turn 2, declared `deep`).
     - In `r377-brief` this alone makes the case fail. The check demanded these caveats word for word in round 3, while its own limit said "End the answer with the two ways to go deeper, a sentence or two each" (log).
     - In `r376-later-phase` turn 2 it follows the run's `first_pass` declaration for a scope extension, and it lands just before "Next step: none — this task is complete."
  2. **The plain-answer note withheld in follow-up turns.** `r376-later-phase` turn 2 and `r377-continue` turn 2 both registered their plain answer at the start of the turn. Each then passed one or two turn-1 receipts it relied on (a study audit; a full-text read and a review audit), so the check returned `after_research` (log). A continuation that rests on turn-1 audits cannot get a note. This is the 28 Oct class, not among #381's fixes.
  3. **The fixed caveat "Its results stay unreliable until they are reconciled."** It condemns whole studies whose results the answer uses: Finnell in `r382-week-800`, where the run had to add its own reconciling sentence, and three of four papers in `r382-other-aims-spiritual`, unexplained. This is the 28 Oct item, not among #381's fixes.
  4. **Matching by kind, not meaning (question 193's class).** The check accepted a video-comment audit as the basis for an unrelated "qualified" (`r377-continue` turn 1). Matching by kind in this way is what produces the mislabelled outcomes listed above.
- **Model slips worth naming:**
  - `r382-aim-unknown`: researched in full instead of asking the aim (its fail).
  - `r377-brief`: a <details> wrapper added after the check folds every caveat and the note, a placement the check refused in `r376-later-phase` round 7.
  - Gallstones never screened in `r382-five-months-300`.
- **#381's fixed classes:** none of those that apply here recurred. The round count ran on after a pass, no community label was locked, and "not included" appears only for a login-gated community.
