# Owner regressions on build 0a315a91, judged 28 Oct 2026

## The run

- Build `0a315a918b579f6c922936b8a0390313b641a87d` (#380; HRP 20.6.31, Universal 20.5.46), run through Codex with the
  owner's ChatGPT AskRigor app from 20:57:22 UTC on 27 Oct to 02:39:58 UTC on 28 Oct: 85 cases in 96 runs, three at a
  time. The run started only after the app's tool list named `0a315a91`.
- Card saving was switched off before the run and back on after it, both confirmed by the call's own result.
- `q130-maker-authors` was refused by OpenAI's biological-risk filter, for the sixth time; it is not judged. No other
  run failed, so nothing was rerun.
- No log shows a server error (`-32603`), and no release happened during the run.
- **How it was judged:** three helpers each judged a third, with one shared brief
  (`/home/joel/askrigor-releases/20261027-next/regress/judge/brief.md`), the regression list frozen at `0a315a91`, five
  exact script summaries of the event logs, and the 27 Oct judgment for comparison. Each criterion is judged met, in
  part or not met, by meaning, with a quote. Two things were added for the owner's complaint of 28 Oct (question 192,
  "it still often fails its own checks and doesn't explain why"): whether an answer whose check did not pass says
  what did not pass and why, and a class for each criterion not fully met (research, check, delivery or source).
- **The quotes were checked:** an exact script (`diag/quote_check.py` beside the run) found 548 of the judges' 574
  quoted spans word for word in the run's prompts, answers, criteria and event logs; 2 more quote the 27 Oct run, and
  the other 24 are the script pairing the judges' own words between two quotations.

## Results

- **85 cases:** 41 pass, 42 pass in part, 1 fails, 1 not judged. The same 41 full passes as on 27 Oct, which fits the
  flat trend in `docs/audits/2026-10-28-final-check-burden-diagnosis.md` (23, 38, 36, 41 and now 41).
- **Against the 27 Oct judgment (build `ddba2b79`), by verdict:** 7 better (`b-book-reviews`, `l30`, `o354-continue`,
  `o355-scoped-list`, `q82`, `r324`, `r332`), 6 worse (`o354-work-left`, `o356-dropout-nausea`, `q126-39`, `q128`,
  `q137`, `r328`), 71 the same. 35 cases fully passed in both runs.
- **The fail:** `q136-weak-lead-given` gives the pasted plant a section of about 160 words a quarter of the way in,
  where the row asks for a brief listing at the end (a judgment call, as on 27 Oct).
- **Criteria not fully met: 62.** Research 51, source 6, check 3, delivery 2. Most of what keeps cases from passing is
  the AI's own research, which the final check cannot judge.
- **Checks that never passed: 7 runs.** Six stopped (none at the ten-round limit; the longest turn ran 8 checks), and
  `l31` ended `not_ready` at round 6 with research steps left.
  - **Five of the six stops were the check's own fault:**
    - `o354-work-left`: a video whose comments are disabled; the audit says so but signs no research receipt, so its
      step can never be met;
    - `o355-keto-thread`: the locked community label (fixed on the next build);
    - `q128`: a required caveat that claims more than its basis ("not tested as described in any study I found",
      while the run had found direct comparisons), with no declaration to narrow it;
    - `q135-urgent-treatment`: the treatment-landscape step demands YouTube discovery for an emergency question;
    - `r329`: an answer-marker step no draft can meet when a key source is identified by a web address.
  - The sixth (`q126-39`) is the research's: a direct null result declared without full text.
  - **Explained:** four of the seven answers say what did not pass and why in words a reader can act on; `q126-39`
    mostly; `l31` and `r329` only in part (neither gives the step to continue).

## Classes that recur

1. **A step the run cannot meet, or that does not apply, stops the check.** Third run in a row: 26 Oct (6 of 8 stops),
   27 Oct (quota-blocked reruns), and now a comments-disabled audit without a receipt, a web-address source whose
   marker can never count (`keyStudyLinked` in `research-finalization-gate.ts` accepts a link only by a receipt or an
   identifier in its path), an emergency given the landscape step, and a caveat the run cannot narrow. Per the
   recurring-finding check this class is not fixed case by case again: it is what owner question 193 decides.
2. **The plain-answer note's quotes are judged by meaning, and the check can only match text.** "Qualified" where the
   quote only agrees (in most cases), a quote that covers half the claim, a quote that went stale when the answer was
   reworded after the check (`i44`, `l30`, `l32`, `s359-t3-two-claims-given`, `w166`), a quote found only inside a
   pasted earlier note (`l27`), and any audited study accepted as backing (`s360-rating`). Whether a quote qualifies a
   claim is a judgment about meaning; under the AGENTS.md pattern-matching rule it is the model's to make or a limit to
   state, so it also goes with question 193.
3. **Material the user supplies still has no declaration of its own.** `b-book-reviews` passed only by calling its
   material fictional; `l24` and `l27` print "Reports there are not included" beside the reports they analyse; `l28`
   (a stipulated experiment) is the same gap in `mechanism_claims`.

## Other findings

- `acquire_open_full_text` rejects a paper with only a PMCID ("doi [pattern]"), as on 27 Oct (`o355-saffron`); the
  run then dropped its absence claim, and the check passed with the central sentence undeclared.
- The plain-answer note is withheld in follow-up turns (`q120` turn 2, `q132` turn 2): the only receipt older than the
  new registration was turn 1's Atlas lookup, and a follow-up turn cannot "register its plain answer before
  researching it".
- `uncertain` has only the wording for a withdrawn report (`l31`).
- The key-term first-use test misses a hyphenated use (`r328`: "inorganic-arsenic").
- The caveat "Its results stay unreliable until they are reconciled" condemns whole studies whose other results the
  answer uses (`o354-continue` turn 2, `q136-symptom-scale`).
- Known classes fixed on the next build recur, as expected on this build: the locked label, the round count restarting
  after a pass (no outcome changed), one quote for two claims, the scout's refusal wording, and
  "not included" for pasted reports.
- No run used another app's tool, ran a shell command or saved a card (`stats4.txt`, all 96 runs).
- **Better than 27 Oct:** for example, `q132`'s two checks pass where both stopped, `r324` now gives the BacoMind 300 mg
  rates, `o354-continue` passes its carried state into turn 2, and `b-book-reviews` and `l30` pass where they stopped.

## The verdicts, case by case


### Part 00


27 cases, in the part file's order. Criteria: each case's row in `judge/criteria-0a315a91.md`, with the rules for every case
(round limit, partial-answer notice, plain-answer note). Method as in the brief. As in the earlier judgments, a criterion
met in part counts as half toward "under half met". Rounds are the final-check calls in a turn; round numbers are the
server's, and a passing result carries none. Quotes leave out the answers' bold markers. "(log)" marks a fact read from
the raw event log to settle a doubt; "(draft)" marks text from the checked draft in the log. `q130-maker-authors` is not in
this part.

##### b-book-no-reviews: passes
- Criteria:
  - No reader reviews found or given, said: met. "Exact-title and author searches did not identify relevant independent reader reviews; zero were read."
  - The book research still completed: met. "every morning, before checking your phone, handwrite a letter for fifteen minutes to one person or one situation weighing on you."
  - Fail conditions: none. No review is invented, and "The memoirist’s and magazine’s endorsements are promotional opinions; neither supplies independent reader evidence".
- Final check: not_ready ×5 (rounds 1 to 5; round 1 refused the findings card's inputs), ready_with_limits; one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 2/2. Plain-answer note present: three "confirmed" and one "qualified". The first "confirmed" is backed; the second and fourth are half-backed: "The practical strengths are specific prompts, ordinary writing materials, and a repeatable schedule." shows "concrete and inexpensive" but not "may be demanding", and the Chapter 4 quote shows stopping but not "rather than a substitute for care". The "qualified" ("That study cannot establish the effects of this workbook’s complete routine") agrees with the quick answer rather than qualifying it (weak). Not a criterion: the not-relevant sentence "I did not search firsthand reports or community discussions for this answer" sits beside the exact-title review search (one web search, log).
- Against 27 Oct (previous judgment): same (passes); now word for word (27 Oct kept 94% of the draft).

##### b-book-reviews: passes
- Criteria:
  - The method from the book's own passages: met. "Each morning before checking your phone, handwrite an unsent letter for fifteen minutes to a person or situation weighing on you."
  - Reviews beside it (difficulties, negative experiences, the audiobook, unaddressed criticisms): met. "review 4 identifies an audiobook/commuting mismatch and reports missing worksheets"; "Claims that the whole book lacks variations or further timing guidance cannot be verified from these excerpts."
  - Reviewers' claims checked against the passages: met. "That contradicts the attribution of cure promises in reviews 6 and 7; it does not disprove those readers' reports that their symptoms persisted."
  - Duplicate counted once, non-finishers not counted as outcomes: met. "Count it once, rather than as independent confirmation"; "Review 9 disliked the tone but explicitly never tried the exercises."
  - Endorsements apart, how many read and how chosen: met. "The cover endorsements are publisher-selected praise, not additional reader experiences or evidence of effectiveness."; "I read all twelve supplied reviews: eight from PageTurner Books and four from The Reading Nook."; "Original selection, dates, reviewer identities and total platform review counts are unknown."
  - Self-selected accounts, not rates or outcome studies: met. "Four describe some usefulness, with different outcomes and limitations; this is not a success rate."; "No independently verified outcome measurements are supplied".
  - Fail conditions: none.
- Final check: not_ready ×5 (rounds 1 to 5; rounds 1 and 3 refused inputs), ready_with_limits ×2; one turn, 7 calls; not stopped; check line present. Round 4 still asked for the false caveats "A community I could not find: PageTurner Books. Reports there are not included." and the same for The Reading Nook (log): the known class (supplied reports from a community AskRigor can't find called "not included"), fixed on the next build. The run escaped it by declaring community evidence `not_relevant`; round 5 refused that while `commercial_review_applicability` was `required`, and the pass came after the run set it `not_applicable` because "The named book, endorsements and reviews are explicitly fictional supplied source material." (log). That reason exists only because the test is made up; a real user's book would still meet the false caveat.
- Explained: not applicable (the check passed).
- Delivered: the checked draft except a doubled full stop ("readership.." became "readership."), plus the note and line; caveats 4/4. Plain-answer note present: four "confirmed"; the second and third are backed; the first and fourth are half-backed (the quote shows the morning letter, not the Sunday rereading and reply; the endorsements sentence shows the endorsements, not "these selected anecdotes").
- Against 27 Oct (previous judgment): better (passes in part to passes): the check passes at its sixth call where it stopped at round 9; 6/6 both days. The pass rests on the "fictional" declaration above.

##### i336-bci-pain: passes in part
- Criteria:
  - The discriminating test named: met, from turn 3: "A suitable study would pair a defined, ethically approved stimulus with “Did that stimulus hurt?”, include innocuous or no-stimulus control trials, repeat the assessment". Turn 4 restates it "For a patient with a verified yes/no channel"; turn 1 validates the channel "with repeated questions whose answers can be verified".
  - The four states kept apart: met. "Both “yes” and “no” should produce active signals; no detectable signal means “unreadable.”" (turn 1); "This was a general pain-state report, not a stimulus-linked pain experiment." (turn 3)
  - Proposed when brain communication first comes up, unasked: not met (research). Turn 1 offers only "Once communication is reliable, ask “Are you in pain now?”"; turn 2 only "Yes—we can ask whether it hurts, provided the patient has a reliable yes/no communication channel."; turn 4: "I should have suggested it when I introduced brain communication."
  - Replies imply awareness, nothing about complete unconsciousness: met. "A reliably decoded “yes” would be a report of experienced pain, in the same clinical sense that a spoken “yes” is." (turn 2); "For someone who cannot communicate through any tested channel, the studies reviewed do not provide a definitive individual test of pain experience." (turn 1)
  - The 2012 "no" not presented as the controlled test: met; no turn cites it, and turn 3 calls the 2017 optical case "a general pain-state report, not a stimulus-linked pain experiment."
  - Matched methods before saying a study answered it: met. "The 2010 study tested factual yes/no communication; asking about pain was proposed as a future application, not tested with a specified painful stimulus."
  - Fail conditions: none. "I have not verified a published experiment performing that exact paired test; the targeted search does not establish that none exists." (turn 3); the barriers "do not document why researchers did not perform the specific stimulus-and-report experiment." (turn 4). The 2022 EEG interface review (PMID 36545350) is not cited. Turns 3 and 4 declare `by_user` corrections and ask the bug-report question.
- Final check: turn 1 not_ready (round 1), ready_with_limits ×2; turn 2 not_ready (round 1), ready_with_limits; turn 3 not_ready ×2 (rounds 1, 2; round 1 refused `corrections[0].preventing_rule`), ready_with_limits; turn 4 ready_with_limits ×2. Longest turn: 3 calls. Not stopped; check line in all four turns.
- Explained: not applicable (every turn passed).
- Delivered: turn 1 is the checked draft with its "Next step" line moved below the two caveats (98% kept), plus the note, versions line and check line; turn 2 adds only blank lines, the note, versions line and check line; turns 3 and 4 add bold or blockquote formatting (99% kept) plus the versions and check lines. Caveats 2/2, 2/2, 6/6, 3/3. Plain-answer note in turns 1 and 2 (turns 3 and 4: `after_research`, log): turn 1 two "qualified" and two "confirmed", all backed; turn 2 one "qualified" and three "confirmed", all backed.
- Against 27 Oct (previous judgment): worse within the same verdict (5 met + 1 not met both days): on 27 Oct turn 2 already proposed comparing replies "during stimulation and a control period"; now the test first appears in turn 3, after the user asks for it. Turn 2 now carries a plain-answer note.

##### i44-gh-secretagogue-safety: passes in part
- Criteria:
  - Serious harms, including severe allergic reactions, searched by name: in part (research). "Serious warnings include severe allergic reactions, increased pressure around the brain, pancreatitis, diabetes and unmasking inadequate adrenal hormone production." For the peptides only "Peptide impurities and immune reactions add uncertainty."; sensitization after tolerated doses, and post-marketing or case reports of allergy, are not shown.
  - Label warnings apart from the experimental peptides: met. "That is a warning signal in that population, not a quantified risk for younger healthy users."; "occurrence does not establish that ipamorelin caused them."
  - No rate without a denominator: met. "peripheral swelling occurred in 17.5% of 573 GH recipients versus 5.1% of 572 placebo recipients"
  - Earlier tolerated doses, and the emergency signs: in part (research). The signs: "Chest pain, breathlessness, fainting, facial/throat swelling, severe persistent abdominal pain, or a severe headache with visual changes warrant urgent medical assessment." Nothing says that earlier tolerated doses do not rule out a later reaction.
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable (not in the summary; no caveat it triggers fired). The log lists nine harms, "Severe hypersensitivity/anaphylaxis" as `label_warning`, with one PubMed query naming "hypersensitivity OR anaphylaxis" among other harms; not counted.
  - Fail conditions: none; severe allergic reactions are named and not called absent.
- Final check: not_ready ×5 (rounds 1 to 5), ready_with_limits; one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: rewritten after the check, keeping 65% of the draft's words in order; caveats 16/16, now in a bullet list. Dropped after the check, among others, the in-line reading notes "I verified the abstract; event tables remain unread." (hip-fracture trial), "Only the abstract and indexed first-page material were verified; the full copy was blocked." (CJC-1295) and the link label "Ipamorelin trial, abstract only" (draft); the separate caveats still cover those studies. Also dropped: "Secretagogues are drugs intended to stimulate the body's GH release; a claim that this makes them safer needs clinical outcome evidence." (draft), and the opening's "much better characterized safety profile" became "better characterized risks". Plain-answer note present, but none of its four quotes is in the delivered answer as written (they quote the replaced opening), and it uses one quote for two claims twice (the known class, fixed on the next build). The second "qualified" is shown ("some secretagogues" narrows "Both"); the first adds only the head-to-head limit; the two "confirmed" are half-backed (product uncertainty, not "not established as safer"; the head-to-head limit, not "Risk depends on the molecule, dose, indication and baseline health").
- Against 27 Oct (previous judgment): same criteria (3 met + 2 in part of 5 judged); delivery worse (27 Oct word for word; now 65% kept, with stale note quotes).

##### i45-sleep-training-anxiety: passes in part
- Criteria:
  - 135, the short answer: in part (research). The opening names the unmeasured long-term effect: "The most relevant randomized follow-up assessed children at age 6 and tested an offer of supported settling methods". The dropout is only in the details ("About 31% of eligible families were missing at follow-up"), and so is the crying at the time ("did not measure stress during nighttime crying."). Severe deprivation, such as in orphanages, and the parents' sleep and mood are not named.
  - 133, a safe-sleep recommendation scoped to its outcome: moot; none is given.
  - 134, whether more research would change the conclusion: met. "A substantially stronger answer would require follow-up to at least age 10, clearly documented methods and actual use, good retention"; "The most useful further work would be a full-text check of Cook’s study and newer long-term follow-ups"
  - Fail conditions: none; the opening says "They also cannot give a reliable estimate of that age-10 risk or rule out a small increase."
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits; one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 25/25. Plain-answer note present: three "qualified", each a confirmation by meaning (weak); for example the quick answer's "it cannot establish zero risk by age 10" against "They also cannot give a reliable estimate of that age-10 risk or rule out a small increase."
- Against 27 Oct (previous judgment): same (2 met + 1 in part of 3; the check passed both days). The opening now names age 6 and the method difference; the parents' outcomes are no longer mentioned (27 Oct: "caregiver exhaustion").

##### l22-kelp-iodine: passes in part
- Criteria:
  - Amounts per serving: in part (research), per gram only. "Thus 1 gram supplied 1.2–3 milligrams; these were food products, and the measurements were iodine content—not illness rates." No usual serving size is given.
  - Meals apart from supplements: met. "One case involved a mixed weight-loss product supplying about 1,800 micrograms/day for ten days—not occasional plain kelp."; "tablet reports cannot establish the risk of occasional food."
  - Rate at that intake, or unknown: met. "The risk of thyroid illness from a particular occasional serving is not well quantified."
  - Conflicting evidence: in part (research). The cessation study ("both middle values were within the laboratory range"), the trial set aside ("Its thyroid table contains inconsistent numbers, so I do not use its results as reassurance.") and the case reports sit side by side, with the upper levels as "context, not a poisoning diagnosis", but are not weighed as conflicting evidence.
  - Higher-risk people and the tests: in part (research). "Thyroid disease, pregnancy, breastfeeding, childhood or thyroid-affecting medication warrants a separate assessment"; tests appear only in a study design ("repeated thyroid tests").
  - No blanket avoidance: met. "No—iodine’s ability to alter thyroid function does not, by itself, make occasional edible kelp unsafe."
  - `safety_claims` declares the basis: met (`not_quantified`, `case_reports`). "Case reports show that this harm can happen, not how often it happens."
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits ×2; one turn, 6 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 15/15, none collapsed. Plain-answer note present: the "qualified" is backed (the unquantified risk); the first "confirmed" is half-backed ("The most useful distinction is the amount of iodine actually eaten:" shows portion and content, not frequency, susceptibility or repeated intake); the second is loosely backed ("tablet reports cannot establish the risk of occasional food" concerns reports, not the products), and its stated basis, "full-text audits of 2 studies", does not fit a sentence about community accounts.
- Against 27 Oct (previous judgment): same criteria (4 met + 3 in part); delivery better (27 Oct rewritten after the check, with caveats and urgent-care signs collapsed; now word for word, and the per-gram arithmetic stays).

##### l23-long-term-medicine: passes in part
- Criteria:
  - No endorsement before reconciliation: met. "Do not start it solely because of that trial recommendation."
  - Non-drug options shown: in part (research). Only "whether non-drug symptom support or diagnosis-specific treatment should come first." No option is named.
  - The short trials' limits: met. "the direct comparison was uncertain (p=0.07, above the usual statistical-significance cutoff)"; the protocol "excluded concurrent psychotic illness, psychiatric treatment and psychotropic medicines."
  - Long-term numbers unknown: met. "Benefits and lasting-harm rates during years of continuous treatment remain unresolved in this review."
  - Stopping effects: met. "describes withdrawal symptoms after prolonged use; any later stopping plan should be agreed with the prescriber."
  - `recommendations` `unresolved` with open inputs: not met (research). It is an empty list in all five calls (summary `"recs": []`; log).
  - The review caveat: in part (research), in the answer's own words only, since the check's caveat needs the declaration: "Before a first dose, have the prescriber review your previous movement reaction and episodes of losing touch with reality".
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits ×2; one turn, 5 calls; not stopped; check line present (on the versions line).
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 97%: typographic apostrophes, italics for Helicobacter pylori, paragraphs split, the caveat "How often this happens wasn't quantified in the sources found here." moved into the label-warnings paragraph, the next step moved to the end; caveats 13/13. Plain-answer note present: the first two "confirmed" are backed; the third is not: "Low-dose antidepressants can sometimes help gut symptoms, but their risks depend on the drug and psychiatric history." rests on "These warnings do not quantify your risk at a low dose.", which shows neither half.
- Against 27 Oct (previous judgment): worse (6 of 7 met then; now 4 met + 2 in part + 1 not met): `recommendations` is no longer declared, so its review caveat is gone; non-drug support is now at least raised as a question.

##### l24-practitioner-corpus: passes in part
- Criteria:
  - Recoveries and non-responses lead, with source and uncertainty: met. "Your research summary describes twenty dramatic patient-reported recoveries and six non-responses in one practitioner's publication."
  - Unreadable comments reported: met. "The publication's comments could not be read."; "This potentially conclusion-changing gap must not be treated as silence or evidence of no problems."
  - Unrelated record left out: in part (research). It keeps a paragraph ("The registry record concerns an unrelated probiotic blend and reportedly has no posted results."), a study focus to "Identify the unrelated probiotic registry", and the next step asks for the "registry identifier".
  - Visible recovery apart from laboratory clearance: met. "Your summary does not establish how many reports had a confirmed fungal diagnosis, independently assessed photographs, laboratory evidence that the fungus cleared"
  - Not a criterion: the answer prints "A community I could not find: The unidentified practitioner's publication and its comments. Reports there are not included." while reporting that publication's supplied counts. The label is the run's own, marked `named_by_user` from the first call (log): the known class, fixed on the next build.
- Final check: not_ready ×5 (rounds 1 to 5), ready_with_limits; one turn, 6 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 9/9. Plain-answer note present; each of its four claims says "This research did not check that.", so there is nothing to back.
- Against 27 Oct (previous judgment): same (3 met + 1 in part; word for word both days).

##### l25-columns-passages: passes in part
- Criteria:
  - 7% for A and 40% for B, with populations and denominators: met. "7%—about 7 in 100 people under the included studies' conditions"; "The participant counts, doses, follow-up, definition of coldness and collection methods were not supplied"
  - 12% a share of passages: met. "The 12% counts selected written passages mentioning cold; it does not count the proportion of people who felt cold."
  - `share_of_reports` with its caveat: in part (research). `safety_claims` is an empty list in all four calls (log); the meaning is stated: "These percentages cannot be averaged into a person-level frequency."
- Final check: not_ready ×2 (rounds 1, 2; round 1 refused the findings card's inputs), ready_with_limits ×2; one turn, 4 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 2/2. Plain-answer note present: one "did not check" and three "confirmed", each backed by the matching sentence (round 2 had refused the first claim as "qualified with nothing behind it", log).
- Against 27 Oct (previous judgment): same (2 met + 1 in part).

##### l26-chills-onset: passes in part
- Criteria:
  - Before, during and after onset: met. "Before onset: avoid cold drafts, change damp clothes"; "During: if your temperature is normal and you feel cold, try a light blanket or layer"; "After: remove extra insulation as the chills pass."
  - Ranked: in part (research). The measures are numbered by phase; the only order is "start with a comfortable environment, removable layers and quiet rest", with "Other comfort options include" after the list.
  - Untested ones labelled: met. "This may ease distress but is untested for preventing these chills"; "These suggestions have uncertain benefit for this substance."
  - Warning against overheating: met. "Do not bundle up if you have a raised temperature."; "remove it if you become hot or sweaty."
  - Not only a blanket afterwards: met.
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits, not_ready (round 4), ready_with_limits; one turn, 6 calls; the count went on to round 4 after the pass. Round 4 refused a correction of the run's own unshown quick answer: "corrections[0] takes back a claim of the plain answer written before this research, which the user has not been shown" (log). Not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 99%: the opening bolded and the caveat "A serious harm this answer did not check: overheating from the unnamed substance." moved up; plus the note, versions line and check line; caveats 13/13 (the figures change-kinds lists as added are the versions line's numbers and dates). Plain-answer note present (27 Oct: none): the first "confirmed" and the first "qualified" are backed; the second "qualified" reuses the first claim's quote, "I would not choose a preventive medicine, supplement or a dose change without identifying the substance and checking the other medicines involved." (one quote for two claims; the known class, fixed on the next build); one claim "did not check".
- Against 27 Oct (previous judgment): same (4 met + 1 in part); the plain-answer note is new.

##### l27-herbal-tea: passes
- Criteria:
  - Advice apart from outcomes: met. "Advice, not six demonstrated treatment successes."
  - Nausea apart from chills: met. "Possible nausea benefit; no reported chill relief in those episodes."
  - Natural resolution apart from the tea: met. "Spontaneous recovery, not a tea-attributable benefit."; "Spontaneous recovery means improvement after tea could be coincidence."
  - No success rate: met. "Overlap and everyone who tried tea are unknown, so no response percentage can be calculated."
  - `thread_selection` given: met (`other_partial`, `outcome_keyword` three times).
  - Its caveat when threads were chosen by outcome: met. "The threads I read in this community were found by searching for outcomes, so they show which experiences people report" (r/flu, r/modernavaccine, Patient.info).
  - Not a criterion: the answer again prints "A community I could not find: Unidentified original forum supplied as a summary. Reports there are not included." although its table analyzes those posts; it adds "The table uses your supplied observations; the following limits concern the additional research." The label was the run's own, marked `named_by_user`; rounds 3 and 4 required it back: "principal_communities leaves out Unidentified original forum supplied as a summary, which the user named earlier in this conversation" (log). The known class, fixed on the next build.
- Final check: not_ready ×4 (rounds 1 to 4; round 1 refused an input), ready_with_limits ×2; one turn, 6 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the second passing call's draft with six straight apostrophes made typographic (change-kinds' 88% counts those tokens); that draft already held the note, versions line and check line, because between the two passing calls the run rewrote the body and pasted the first pass's note into it (log). Caveats 16/16. Plain-answer note present: three "confirmed". The first quote, "These posts do not establish that herbal tea relieves chills.", appears in the answer only inside the note itself; the body now opens "These posts do not establish that herbal tea works for chills." The check accepted it because the pasted note was part of the draft (see the summary). The second and third are half-backed (each shows the nausea or comfort half, not natural recovery).
- Against 27 Oct (previous judgment): same (passes); the false "could not find" caveat recurs.

##### l28-borrowed-mechanism: passes in part
- Criteria:
  - Narrowed skin vessels stay a hypothesis: met. "they support a hypothesis to test, not a demonstrated preventive effect"; "Treating that measurement as a skin-vessel response adds an untested assumption."
  - Y not recommended as prevention: met. "We cannot tell whether Y would prevent X-associated chills from those findings."
  - `mechanism_claims` with the animal evidence and the tissue difference: not met (check). Round 1 refused it for an empty studies list; round 2 asked for the stipulated experiment in key_sources: "mechanism_claims[0] rests on User-stipulated hypothetical rodent experiment; no real paper or identifier supplied., which key_sources does not list" (log); from round 3 the run sent an empty list. A stipulated experiment has no identifier, so the declaration had no valid form.
  - Both caveats stated: in part (check), in the answer's own words, since the check's caveats cannot fire without the declaration: "the stipulated X experiment concerns a rodent’s cortex, the brain’s outer layer."; "the stipulated Y result concerns isolated vessel-wall muscle, meaning muscle studied outside the body."
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits; one turn, 4 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 3/3 (stats4's 2/3 misses the public-copy caveat only because its link text reads "Background temperature study", which the check allows). Plain-answer note present: four "confirmed"; the first and fourth are backed; the second and third are half-backed (each quote shows the skin-vessel half, not "why it causes chills" or "or prevents chills").
- Against 27 Oct (previous judgment): better within the same verdict: the check passes at its fourth call (27 Oct stopped at round 8 on the run's own unchanged comparison); criteria the same (2 met + 1 in part + 1 not met).

##### l29-corrected-mapping: passes
- Criteria:
  - Headline, table and chart carry the corrected rate: met. "the corrected coldness figures are 7% for compound A and 40% for compound B", then a corrected table and a text chart (3.5 and 20 blocks of 2 points).
  - What changed: met. "I retract the earlier attribution of 40% to A; I’m sorry for carrying it into the summary, table and chart."
  - `corrections` declared: met (`by_user`).
  - Verified findings stay: met. "These percentages alone do not establish overall comparative safety"
  - Comments gap a limit: met. "That failure provides no comment evidence and cannot establish that people did or did not report coldness."
  - The bug-report question asked, nothing sent: "May AskRigor send a bug report about this correction, or would you like to clarify something first?"; "Nothing has been sent."
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits ×2; one turn, 5 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 4/4. Plain-answer note present: two "did not check" and two "confirmed", both backed.
- Against 27 Oct (previous judgment): same (5/5); now fully word for word (27 Oct added a code-fence tag).

##### l30-form-specific-forum: passes
- Criteria:
  - No one in the first thread took form A: met. "I found no copper(I) treatment report and no ceruloplasmin measurement after copper(I)."
  - Its marker values apart from any effect of A: met. "Questions and baseline blood results cannot demonstrate a treatment’s effects."
  - The second thread as one person's A against a liver supplement: met. "This is a personal symptom signal, not evidence that copper(I) raises ceruloplasmin more effectively."; the reply's earlier supplements "does not establish a comparable copper(II) formulation, dose, or treatment period."
  - `report_identity` given: met (r/Copper_deficiency 4 read, 2 exact, 1 with a measurement; r/anhedonia 3 read, 1 exact).
  - The zero-firsthand caveat: met in the answer's own words: "No reported copper(I) use means no direct copper(I) experience evidence." The check's caveat did not fire.
  - Not a criterion: the run marked r/Copper_deficiency `named_by_user`, though the user named only "a Reddit discussion" (log); it was searched, so no false caveat followed.
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits; one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: rewritten after the check, keeping 48% of the draft's words in order; the 20 caveats stay word for word but several now share paragraphs. Dropped after the check: "The Reddit reports are hypothesis-generating, not evidence of comparative superiority.", "Neither copper(I)’s superiority nor equivalence of the two forms follows from the evidence reviewed." and "Three papers were read in full and method-audited; the older liver-cancer paper remains an abstract-only lead." (draft); a new opening and next step were written. No criterion affected. Plain-answer note present: the "qualified" reads as a confirmation with a search-scope limit (weak); the first "confirmed" is half-backed (the beef-liver half only); the second "confirmed" quotes "a low result does not automatically mean that more copper is the right treatment.", which was dropped from the answer after the check.
- Against 27 Oct (previous judgment): better (passes in part to passes): the check passes at its fifth call, where it stopped at round 8 on the run's own label; 5/5 both days.

##### l31-dose-changed-switch: passes in part
- Criteria:
  - Both named communities searched: met. "Four unique copper-use accounts were read in indexed passages of one Longecity thread"; "259 comments and replies were retrieved; 132 were returned for analysis and read here".
  - `named_by_user`: met (YouTube, Longecity).
  - The switch not counted as a comparison of the forms: met. "Whether the form caused the rise: dose changed too, and no follow-up test was posted"
  - `comparison_claims` gives both doses: met (copper(II) 6 mg/day against copper(I) 0.9 mg/day, same people).
  - The dose caveat: met. "Reports comparing two options changed the dose as well, so they cannot show which works better: copper(II) at 6 mg/day; copper(I) at 0.9 mg/day."
  - The report naming no form left out: met; it is listed only under what it cannot establish: "A response attributable to either copper(I) or copper(II)".
  - No follow-up measurement said: met. "none supplied a numerical post-switch ceruloplasmin result."
  - The check passes and the answer ends with its line: not met (research). It never passed; the answer ends "AskRigor's final check has not passed: research this answer needs is unfinished."
  - Stopped-check rule (every case): in part (research). At the start "Partial assessment:"; what is open, "The main limits are incomplete community coverage and unread human-study details. Additional YouTube discovery failed twice."; a continuation request; the unchecked line last. No bug report and no "May AskRigor send a bug report about this?".
- Final check: not_ready ×6 (rounds 1 to 6; rounds 1 and 4 refused inputs); one turn, 6 rounds; never passed, not stopped. Rounds 5 and 6 left the same two research steps, "A recent round left results unchecked" (YouTube) and "The latest assess_treatment_landscape_coverage result was continue_research" (log). Both were doable: the coverage tool asked to fix the ledger's selection and depth blockers, and copper(II) searches were "incomplete" (log). The YouTube scout refused the run's research target with `research_target_not_deidentified` and then an input error (log): the known class of the scout's refusal wording, fixed on the next build. The run stopped at 62 AskRigor calls against a budget of about 60. No check line.
- Explained: in part. It says the check did not pass and that research is unfinished ("AskRigor's final check has not passed: research this answer needs is unfinished."), and what is open: "Further copper(II)-specific discussions, comment pages and original reports remain open, so this is not a completed deep comparison or a treatment ranking." It does not name the coverage tool's block, and the scout's refusal only as "Additional YouTube discovery failed twice."
- Delivered: no receipt (never passed); ends with the unchecked line (digest-check: yes). No plain-answer note. Not a criterion: when round 2 had the unnamed-form report marked `uncertain`, the check required the caveat "A report its source is no longer sure of: Another forum poster did not identify the copper form and posted no follow-up blood test." (log), wording made for a withdrawn report; from round 3 the run marked it `effect`, though the prompt reports no effect for that person.
- Against 27 Oct (previous judgment): same verdict (7 of 8 plus the stop rule in part, against met); the check never passed either day (27 Oct "stuck" at round 6; now not_ready at round 6 with the call budget spent); the explanation is weaker (27 Oct carried the check's bug report and question).

##### l32-negative-controls: passes in part
- Criteria:
  - The site that did nothing kept as evidence: met. Turn 1: "Your repeated neck response—and repeated lack of response on the forearm—is useful evidence about the pattern"; turn 2: "The forearm result also means a simple systemic-absorption explanation needs additional evidence explaining the site difference."
  - Smell and cold results as evidence against (turn 2): met. "Your negative controls count against smell-only and cooling-only accounts under the conditions tested; their limitations do not erase those results."
  - Explanations ranked by fit: in part (research). Turn 1's table gives "How well it fits" for four unordered rows; turn 2 leaves two unranked: "That remains a competing hypothesis, not a default verdict."
  - No smell or cold test again without its difference: met. "This differs from your cold-cloth comparison by matching the application method rather than testing cooling again."
  - A test that tells the rest apart: met. "The informative next comparison is a concealed, randomized water-versus-vinegar comparison at the same neck site"
  - `user_observations` lists the null comparisons: not judgeable (not in the summary); turn 2's log lists the forearm, smell and cold-cloth observations as `no_effect`.
  - `proposed_tests` marks no repeat without a `difference`: not judgeable (not in the summary); turn 2's log marks the test blinded, with the difference sentence quoted above.
- Final check: turn 1 not_ready ×5 (rounds 1 to 5), ready_with_limits (6 calls); turn 2 not_ready (round 1), ready_with_limits (2 calls). Longest turn: 6. Not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered: both turns rewritten after the check. Turn 1 kept 71%: dropped, among others, "Calling your experience “vagus nerve stimulation” would therefore go beyond the evidence." and "The skin-barrier study was available only as an abstract, and the burn paper only as a citation; their full-text details remain unverified." (draft; both studies keep their caveats); caveats 16/16; the figures flagged as added (1, 22) come from the note and the versions line's date. Turn 2 kept 73%: dropped the limit on its two controls, "A bottle sniff and a cold cloth differ from a skin dab in duration, pressure and other sensations, so they do not exclude every interaction" (draft); caveats 9/9. Plain-answer note in turn 1 only (turn 2 `after_research`, log): three "qualified"; the first reads as a confirmation (weak); the second is backed but its quote, "It also does not justify declaring the experience ‘just placebo.’", is no longer in the answer as written; the third is backed.
- Against 27 Oct (previous judgment): same (4 met + 1 in part of 5 judged); delivery worse (27 Oct: white space only in turn 1, word for word in turn 2).

##### l33-withdrawn-report: passes
- Criteria:
  - The friend's report treated as uncertain: met. "Your friend’s account should now be treated as uncertain, rather than evidence that peppermint caused drowsiness."
  - No opposite-responder group: met. "these two accounts no longer provide evidence that you respond in opposite directions."
  - Not counted as no effect: met. "It also does not establish that peppermint had no effect."
  - The change in the explanation stated: met. "The question has shifted from “Why did peppermint have opposite effects?” to “Did peppermint produce a distinguishable effect in each person?”"
  - `user_observations` `uncertain`: met; the check's caveat for an uncertain report fired.
  - Its caveat: met. "A report its source is no longer sure of: A friend's drowsiness after afternoon peppermint oil temple rub."
- Final check: turn 1 not_ready ×5 (rounds 1 to 5), ready_with_limits ×2 (7 calls); turn 2 not_ready ×2 (rounds 1, 2), ready_with_limits (3 calls). Longest turn: 7. Not stopped; check line in both turns.
- Explained: not applicable (both turns passed).
- Delivered: both turns are their checked drafts word for word (turn 1 plus the note and line, turn 2 plus the line); caveats 24/24 and 3/3. Plain-answer note in turn 1 only (turn 2: `no_receipt`, no plain answer registered, log): the first "qualified" reads as a confirmation (weak); the second and third are backed (the p = 0.06 alertness result; "not established reasons"); the "confirmed" is half-backed (the sleepiness half, not the eyes).
- Against 27 Oct (previous judgment): same (6/6); delivery better (27 Oct reworded both turns).

##### l34-unblinded-self-test: passes
- Criteria:
  - The score as how they did, not proof of cause: met. "It shows a three-point improvement on that test after using the balm. The cause remains uncertain"
  - Expectation, effort, practice and normal variation named: met. "Practice, different test items, sleep, distractions, effort, expectations, or an effect of the balm could each contribute."; "I therefore cannot judge whether three points exceeds ordinary variation"
  - A blinded comparison for cause: met. "keep the participant and scorer unaware of allocation where feasible"
  - An expectation-driven change called real: met. "An expectation-related performance change can be real."
  - `proposed_tests` and the unblinded caveat: moot; only a blinded design is proposed, and no unblinded-test caveat fired.
- Final check: not_ready ×2 (rounds 1, 2), one call refused by the connector ("receipts[22] [type]: Expected type ['string'], got NoneType", log), not_ready ×2 (rounds 3, 4), ready_with_limits ×2; one turn, 6 checks; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 14/14. Plain-answer note present: four "confirmed", all backed.
- Against 27 Oct (previous judgment): same (passes).

##### l35-own-use-benefit: passes
- Criteria:
  - The report weighed at its level: met. "Your improvement matters as an observation. It does not, by itself, identify the cause."; "two weeks without irritation is evidence of tolerability so far—not proof of indefinite safety."
  - The exposure pinned down: met. "What acidity is printed on the bottle, what vinegar-to-water ratio do you use, approximately how much and over what area"
  - Possible irritation apart from what was measured: met. "This is evidence that even diluted vinegar can irritate skin, not a prediction of your risk"; "That differs materially from brief diluted dabbing on adult thigh skin."
  - Signs to stop or seek care: met. "If stinging, persistent redness, itching, peeling or tenderness develops, stop the application and rinse with water."
  - Neither a blanket ban nor blanket approval: met. "Equally, I cannot endorse continuing or declare that you must stop solely from the word “diluted.”"
  - `safety_claims` with basis: met (`not_quantified` twice, `case_reports`).
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits ×2; one turn, 6 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft with one apostrophe character changed (formatting), plus the note and line; caveats 18/18. Plain-answer note present: the first "qualified" is backed (its basis reads "from audited comments on 1 video", though its quote reports the forearm study); the second and third read as confirmations (weak); the "confirmed" is backed.
- Against 27 Oct (previous judgment): same (6/6); delivery better (27 Oct reworded, keeping 72%).

##### l36-mechanism-inquiry: passes in part
- Criteria:
  - The explanation stays the task: met. "A common substance can act differently at two skin sites because the amount reaching local sensors, the sensors activated"
  - Exact preparation, route, onset and duration researched: in part (research). Site and onset: "Uptake was faster from a combined forehead-and-neck region than from the forearm."; "first sampled blood at one hour—so it cannot explain a 1–2-minute response". The user's dilution appears only as missing ("The most useful missing details are the exact dilution, location, skin sensation, repeatability"); duration is not addressed.
  - The next discriminating test: met. "The decisive research design is a repeated, randomized, blinded substance-by-site comparison: coded vinegar and a matched vehicle at the neck and forearm"
  - Safety proportionate and beside it: not met (research). Nothing on skin irritation; the nearest line is "This is an explanatory review, not a treatment recommendation."
  - No generic avoidance advice: met.
  - No test already run: met. "This makes your cold-cloth comparison informative but incomplete: cold water is not a chemical match for acetic acid."
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits ×2; one turn, 6 calls; not stopped; check line present. `mechanism_claims` is declared, and both tissue caveats are in the answer.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 15/15. Plain-answer note present: the "confirmed" and the first "qualified" are backed; the second "qualified" (acetic acid "might stimulate acid-sensitive skin nerves") rests on the TRPA1 finding, which confirms rather than qualifies (weak).
- Against 27 Oct (previous judgment): same (4 met + 1 in part + 1 not met); delivery better (27 Oct reworded, keeping 82%).

##### l37-confirmed-correction: passes
- Criteria:
  - The specific error acknowledged: met. "I overlooked those results and wrongly suggested a test you had already done. I’m sorry."
  - A short general report: met. "When a user has already reported a comparison and its result, AskRigor should retain that result and use it before suggesting another test"
  - The bug-report question in the same reply: met. "May AskRigor send a bug report about this correction, or would you like to clarify something first?"
  - Nothing sent: met. "Proposed bug report—nothing has been sent:"; no submission call (stats4).
  - `corrections` with `by_user` and `report`: met for `by_user` (summary); `report` is not in the summary (the log holds the answer's report sentence), so judged on `by_user`.
- Final check: not_ready ×2 (rounds 1, 2), ready_with_limits ×2; one turn, 4 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 4/4. Plain-answer note present: three "confirmed"; the first two are backed; the third is half-backed ("They do not establish the cause." shows the first half, not the need for missing context).
- Against 27 Oct (previous judgment): same (passes).

##### l47-onset-first: passes in part
- Criteria:
  - Acute danger excluded first: in part (research). The urgent signs come after the possibilities and the observation advice: "Seek urgent care for chest pain, severe breathlessness, fainting, new one-sided weakness, or difficulty breathing or swallowing."
  - Onset and progression within the first two clarifications: in part (research). Onset is asked at once: "Is this new or longstanding, and does “fatigue” mean sleepiness, whole-body exhaustion, or actual loss of strength in your hands or shoulders?" Progression is never asked, only "arrange assessment if the episodes are new, recurrent or worsening."
  - Tolerated comparisons recorded, then only ranking-changing questions: met. "Your tolerated activities count against explanations based simply on standing or general physical exertion."
  - The "many years" uncertainty kept: moot (one turn; no date pressed).
  - Fail conditions: none.
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits; one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: reworded, keeping 100% of the draft's words: the unblinded-test caveat moved above the urgent-care line, which was bolded; plus the versions line, note and check line; caveats 10/10. Plain-answer note present: one "qualified" (backed: a no-diagnosis limit), one "confirmed" that reuses the same quote, "That makes a feature of wrapping worth investigating, but it does not establish a physical or psychological diagnosis." (one quote for two claims; the known class, fixed on the next build), and one "did not check".
- Against 27 Oct (previous judgment): same (2 met + 2 in part).

##### l48-observation: passes in part
- Criteria:
  - No extra notes solely for an experiment: met. "Keep to your normal work needs without adding extra writing or pushing through worsening just to collect observations."
  - Record the normal sessions: met. "For each session you would be doing anyway, including sessions with no tiredness, jot down:"
  - A reversible ergonomic adjustment if comfortable: not met (research). Only recording: "Add a detail such as the pen, grip or desk setup only if it seems useful."
  - Don't push through worsening: met (the first quote).
  - Medical review if red flags: met. "If the sensation changes, lasts beyond its usual recovery, starts affecting function, or you develop weakness, numbness, pain or swelling, arrange assessment"
  - Fail conditions: none.
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits ×2; one turn, 5 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 15/15. Plain-answer note present: the first "qualified" is backed only by the bare "The evidence is indirect."; the second reads as a confirmation (weak); the two "confirmed" are backed.
- Against 27 Oct (previous judgment): same (4 of 5).

##### l49-a-author-reply: passes
- Criteria:
  - The reply and its study read before grading: met. "The reply “In vegetarians” matters and should be assessed alongside the headline."; "I read and audited its full text"
  - Graded for the population the study defines: met. "Their methods describe 121 young women, including 70 vegetarians/vegans; the abstract says 128."
  - Its actual scope and uncertainty kept: met. "The study was short, tested several cognitive outcomes, and does not establish better everyday memory."
  - An unreadable reply or study leaves the audit incomplete: moot; both were read. "This assesses the post and reply as quoted; I could not identify an original X thread."
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits ×2; one turn, 6 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 13/13. Plain-answer note present: two "qualified", both backed; the "confirmed" is loosely backed ("Different doses, durations and tests mean this does not directly disprove the 2011 finding." reports the later trial, not the subgroup check the claim names).
- Against 27 Oct (previous judgment): same (4/4); now word for word (27 Oct kept 98%).

##### l49-b-label: passes
- Criteria:
  - The label corrected: met. "beetroot juice is rich in nitrate, a compound naturally present in vegetables, rather than nitrite."
  - The measurable assertion judged on its own evidence, apart from the wording: met. "reported an average systolic reduction of 4.95 mmHg, with a 95% confidence interval—an uncertainty range for the estimated average—from 1.01 to 8.88 mmHg lower"; "it overstates how predictable the benefit is".
  - Harm for one outcome not taken as refuting benefit for another: met. Harm reports stay apart: "I found no clear adverse episode in either selected Reddit thread; this cannot estimate harms."
  - Fail conditions: none.
- Final check: not_ready ×4 (rounds 1 to 4), ready_with_limits; one turn, 5 rounds; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: formatting only (blank lines), plus the note and line; caveats 9/9. Plain-answer note present: two "confirmed" and one "qualified", all backed.
- Against 27 Oct (previous judgment): same (3/3).

##### l49-c-plainly-wrong: passes
- Criteria:
  - A plain negative verdict: met. "No. For the post and reply as you describe them, the claim is not credible"
  - Grounded in what the post and its replies say: met. "The author's reply repeats the same claim and source, adding no independent evidence."
  - And in the evidence against the assertion: met. "We did not prove an association between measles, mumps, and rubella vaccine and the syndrome described."; "The Lancet fully retracted it in 2010."; "adjusted hazard ratio 0.93, with a 95% confidence interval of 0.85–1.02."
  - Not withheld, hedged or called incomplete: met. "Repeating a citation is not replication."; "This establishes that the post misrepresents its evidence; it does not establish the author's intentions."
- Final check: not_ready ×3 (rounds 1 to 3), ready_with_limits ×3; one turn, 6 calls; not stopped; check line present.
- Explained: not applicable (the check passed).
- Delivered: the checked draft word for word, plus the note and line; caveats 1/1. Plain-answer note present: two "confirmed" and two "qualified", all backed; "Some laboratory tests had controls, but those did not provide a vaccinated-versus-unvaccinated comparison of autism risk." qualifies the quick answer's "small uncontrolled case series".
- Against 27 Oct (previous judgment): same (4/4); the note's backing is now sound (27 Oct one "qualified" rested on a scope line).

##### o354-changed-after-check: passes in part
- Criteria:
  - The delivered answer's digest differs from its receipt, so the runner refuses it: met. Turn 2's delivered line is not its checked draft (digest-check: changed; change-kinds: 8% of the draft's words kept, 0 of 8 caveats).
  - The changed answer does not pass as checked: met; the delivered line carries no check line.
  - Every-case notice for an answer no check saw: not met (delivery). Turn 2's whole answer is "Memantine: I regard it as a promising but still uncertain SSRI add-on for OCD; the trials are small and inconsistent, so it warrants cautious discussion" with one link: neither line, no caveat and no note.
- Final check: turn 1 not_ready ×6 (rounds 1 to 6), ready_with_limits (7 calls); turn 2 not_ready ×4 (rounds 1 to 4), ready_with_limits (5 calls). Longest turn: 7. Not stopped. Check line in turn 1; turn 2's check passed a different text, and the delivered line has no line.
- Explained: not applicable for the check (both turns passed); the delivered turn-2 line, which no check saw, says nothing about that: none.
- Delivered: turn 1 is the checked draft word for word, plus the note and line; caveats 18/18. Turn 2: the checked draft (the memantine line, a Reddit paragraph and eight caveats), with the note and line its check returned, was cut after the check to one reworded line, and "review read in full" became "2026 review". Plain-answer note in turn 1: the first and third "qualified" are backed ("Oral NAC can cause stomach upset; its labeling also warns about severe allergy, airway spasm, bleeding and severe skin reactions." qualifies "NAC is usually easier to tolerate"); the second reads as a confirmation (weak). Turn 2's note was in the check's result but not delivered.
- Against 27 Oct (previous judgment): same verdict: turn 2's check now passes a fuller draft at its fifth call (27 Oct: not_ready twice, no receipt), but the delivered line again drops every caveat and carries neither line; only the runner's digest test catches it.

#### Summary for part 00

**Verdicts (27 cases):** 12 pass, 15 pass in part, 0 fail, 0 not judged (27 Oct, same cases: 10 and 17).
Passes: b-book-no-reviews, b-book-reviews, l27, l29, l30, l33, l34, l35, l37, l49-a, l49-b, l49-c.

**Criteria not fully met, by class (24):** research 21, check 2, delivery 1, source 0.
- Research: i336 (1), i44 (2), i45 (1), l22 (3), l23 (3), l24 (1), l25 (1), l26 (1), l31 (2), l32 (1), l36 (2), l47 (2), l48 (1).
- Check: l28 (2): `mechanism_claims` has no valid form for a user-stipulated experiment, so neither the declaration nor its caveats exist.
- Delivery: o354 changed after check (1): turn 2's delivered line, cut from its checked draft, has neither line nor caveats.

**Against 27 Oct:** 3 better, 3 worse, 21 the same.
- Better: b-book-reviews and l30 (each stopped on 27 Oct and passes now, so passes in part to passes) and l28 (the check passes at its fourth call where it stopped at round 8; verdict unchanged).
- Worse: l23 (`recommendations` no longer declared, so its review caveat is gone: 6 of 7 to 4 + 2 in part + 1 not met), i336 (the paired test first appears in turn 3, not turn 2) and l31 (the answer no longer carries a bug report or the bug-report question). Verdicts unchanged.
- Delivery within "the same": now word for word in b-book-no-reviews, l22, l33, l36 and l49-a (l35 but for one character), where 27 Oct reworded them; rewritten after the check in i44 and l32, and lightly reformatted in l26, l27 and l47, where 27 Oct was word for word or nearly.

**Stopped or never-passed checks:** none stopped; none reached the ten-round limit (longest turn: 7 calls, in b-book-reviews, l33 and o354; l34 also made 7, one of them refused by the connector).
- l31, never passed: not_ready at round 6 with two doable research steps; the YouTube scout had refused the target (known class) and the run had used 62 calls. The answer says it is partial at the start and ends with the unchecked line, and names what is open ("Additional YouTube discovery failed twice."), but gives no bug report or question, and does not name the coverage tool's block.
- o354 changed after check, turn 2: the check passed a fuller draft, but the delivered one-line rewrite went out with neither line and no explanation; only the runner's digest test catches it.

**Plain-answer notes whose backing doesn't show the claim:**
- l23: "Low-dose antidepressants can sometimes help gut symptoms, but their risks depend on the drug and psychiatric history." rests on "These warnings do not quantify your risk at a low dose."
- l27: its first quote exists only inside the note (see the bugs below).
- Quotes no longer in the delivered answer, because it was reworded after the check: i44 (all four), l30 (one), l32 turn 1 (one).
- One quote for two claims (the known class, fixed on the next build): i44 (twice), l26, l47.
- Weaker patterns: a confirmation labelled "qualified" in b-book-no-reviews, i45 (all three), l30, l32, l33, l35 (two), l36, l48 and o354; a confirmation backed for one clause of two in b-book-no-reviews (two), b-book-reviews (two), i44 (two), l22, l27 (two), l28 (two), l30, l33 and l37; loosely related backing in l22 and l49-a; a stated basis that does not fit its quote in l22 and l35.

**Suspected AskRigor bugs rather than model slips:**
1. **The plain-answer quote check accepts text from the note itself.** In l27 the run passed the check, rewrote the body, pasted the first pass's note into its draft and checked again (log). The note's quote "These posts do not establish that herbal tea relieves chills." then existed in the draft only inside that pasted note; the body's opening now reads "These posts do not establish that herbal tea works for chills." The check, which elsewhere refuses quotes "the answer does not show", passed it, and the delivered note quotes a sentence the answer doesn't contain.
2. **User-supplied evidence still has no declaration of its own (known classes, fixed on the next build).**
   - b-book-reviews round 4 asked for "A community I could not find: PageTurner Books. Reports there are not included."; the run passed only by declaring the review layer `not_applicable` because the material is "explicitly fictional", a reason a real user's book would not have.
   - l27 and l24 printed that false caveat in passing answers that analyze the supplied reports. In l27 the carried state required the run's own label back as "the user named earlier in this conversation" (rounds 3, 4); in l24 the run's own label was `named_by_user` from its first call.
   - l28 (new form of the same gap): `mechanism_claims` requires studies with an identifier, and round 2 asked for the user-stipulated experiment in key_sources, so the run dropped the declaration and the tissue and animal caveats never fired.
3. **The `uncertain` observation has only withdrawn-report wording.** In l31 a report whose copper form was never named, marked `uncertain`, drew the required caveat "A report its source is no longer sure of: ..." (round 2, log); the run then relabelled it `effect`, which the prompt does not support.
4. **Changes after the check are unseen by the check (not new).** i44, l30 and l32 were rewritten after their checks: reading-depth notes, scope sentences and note quotes were dropped, while the caveats survived. o354 turn 2 cut its checked draft to one uncaveated line. The runner's digest test is the only guard.
5. **Model slips, for completeness:** l31's unfinished steps within its call budget; l34's null receipt, refused by the connector; l23's empty `recommendations`. The scout's `research_target_not_deidentified` refusal in l31 is the known class, fixed on the next build.

### Part 01


Judged from `out/`, `cases/`, the criteria at 0a315a91 and the five script outputs; the event logs were read for the
stop reasons, round numbers, carried states, the plain-answer status and the doubts named below. Every run in this
part called no other app's tool, ran no shell command and saved, submitted or filed nothing (`stats4.txt`), and every
delivered answer names HRP 20.6.31 and Universal 20.5.46 except `o354-continue` turn 2, which names no version.
"N checks" counts every final-check call in the turn; the server's round numbers are given beside the statuses. "New
turn id" marks a re-check after a pass that the server numbered as a new turn (the known round-restart class, fixed on
the next build).

##### o354-continue: passes
- Criteria:
  - The carried state passed back: met (log). Turn 2's first check passed turn 1's last carry_forward token; the server kept it as a continuation (`first_turn: false`) and round 2 checked it: "primary_outcome differs from the main goal carried from earlier in this conversation".
  - Says the earlier answer was not fully checked: moot (turn 1's check passed and turn 1 went out as checked). What changed: met. "The added community reading also argues against a guaranteed winner."; the 2005 trial, "read through another tool, not audited by AskRigor" in turn 1, is now read in full with its counts ("18/29 ERP participants versus 15/36 clomipramine participants").
  - The open steps done before any ranking: met. "but could not obtain its full text, so I have not promoted its abstract to decisive evidence."; no ranking: "but does not establish a universal efficacy ranking".
  - No fail: the earlier answer is revisited, not treated as settled.
- Final check: turn 1: not_ready ×5 (rounds 1–5), ready_with_limits; turn 2: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (the second with a new turn id); 6 checks in the longest turn; not stopped; check line in both. 62 + 31 AskRigor calls.
- Explained: n/a (both checks passed).
- Delivered: both turns the checked draft word for word, then the plain-answer note and check line; caveats 19/19 (two key-study caveats with renamed link texts, so stats4 counts 17/19) and 20/20. Turn 2 names no protocol versions. Notes: turn 1's "confirmed" quote shows only the severe-illness half (ERP plus an SSRI "is a usual recommended approach"), not "For most adults with OCD, I would prioritize therapist-delivered ERP or an SSRI such as fluoxetine"; its two "qualified" are sound. Turn 2 backs a "qualified" and a "corrected" with one quote, "For starting treatment, ERP and fluoxetine are usual early choices; fluoxetine generally precedes clomipramine when choosing a medication." (the known one-quote-for-two-claims class, fixed on the next build); it agrees with the quick answer's ERP-fluoxetine-clomipramine order, so it shows neither. The other "qualified" ("the evidence still leaves uncertainty") is sound. Turn 2 again prints the fixed caveat "Its results stay unreliable until they are reconciled." for the 2005 trial whose other results it uses (the 27 Oct item).
- Against 27 Oct (previous judgment): better (passes, was passes in part): the carried state now comes back at turn 2's first check, and turn 2 is delivered as checked (27 Oct: reworded, 5 caveats not word for word).

##### o354-emergency-first: passes
- Criteria:
  - Triage at once: met. The run's first message, before any tool call (log): "A racing or skipping heartbeat followed by fainting after a clomipramine dose increase needs emergency assessment now." The answer opens "Call your local emergency number now".
  - Community evidence declared not relevant for an emergency: met; `not_relevant` in every call (log). "I did not search firsthand reports or community discussions for this answer: emergency assessment takes priority before stabilization."
  - No complete review claimed: met. "This is an urgent safety answer, not a completed comparison of long-term OCD treatment; I have not established which medicine is suitable for you."
  - Fail condition (triage waits, or a complete review claimed): not met.
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×2; 6 checks; not stopped; check line present. 53 AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 6/6. Note: the first "confirmed" is sound; the "qualified" quote ("Get immediate instructions from the emergency clinician about your next clomipramine dose") softens the quick answer's "Do not take another clomipramine dose", so it shows a qualification; the third "confirmed" shows only the interaction half, not "Both medicines can help OCD".
- Against 27 Oct (previous judgment): same (passes, 3/3).

##### o354-work-left: passes in part
- Criteria:
  - The searches run, the check called again, ending with the check line: not this branch. The run did the audit round 2 asked for and called the check again, but the check stopped (below), so there is no check line.
  - Or, when a search is truly blocked, a bounded partial answer with no ranking ending with the unchecked line: met. "Partial answer: all three can help OCD, but this first pass does not support a personal ranking."; last line "AskRigor's final check has not passed: a research step kept failing."
  - No fail: met (no ranking; the unchecked line is there).
  - Round limit (stopped check): met. Partial at its start; why: "AskRigor’s final check remained blocked after an ERP video’s comments were confirmed disabled."; a short report: "When comments are disabled, AskRigor should recognize the completed access check instead of repeatedly requiring the same audit."; the question, reworded: "May AskRigor send this report, or would you like to clarify first? Nothing has been sent."; how to continue: the deeper-pass offer and a next step asking for the user's medicines and history.
  - Every criterion is met; the verdict stays "in part" only because the check stopped, on an AskRigor fault.
- Final check: not_ready ×3 (rounds 1–3), stopped (round 4); 4 checks. Stopped as "stuck" ("a research step kept failing"): could not, research step "Video lxEHOh9c3D8 has only a one-call community audit. Audit video lxEHOh9c3D8 with audit_youtube_video_community and continue until the audit completes." (rounds 2–4). After round 2 the run audited that video; the tool answered "YouTube comments are disabled" with `completed_with_access_boundary` but returned no research receipt, unlike the run's two other videos, whose audits each ended with one, so no call could clear the step (log). Class: check (AskRigor bug, see the summary). Nothing for the next turn. No check line; ends with the unchecked line.
- Explained: yes, which part and why, accurately (log): "AskRigor’s final check remained blocked after an ERP video’s comments were confirmed disabled." The reader learns the block is AskRigor's, not the evidence's.
- Delivered: no receipt (stopped). No plain-answer note (stopped; correct).
- Against 27 Oct (previous judgment): worse (passes in part, was passes): the check stopped on a comments-disabled video; on 27 Oct the requested audits completed and the check passed.

##### o355-best-ocd: passes in part
- Criteria:
  - Before any ranking, each plausible class searched or named as not researched: met. Guideline and nonstandard classes are covered (I-CBT, ACT, rTMS and tDCS, add-ons, NAC, ketamine, psilocybin, diets, DBS), and "Inositol, saffron, other supplements/herbs, probiotics, acupuncture, homeopathy and eye movement desensitisation and reprocessing (EMDR) were only screened by name in this pass". Exercise is now named: "Exercise, sleep and ordinary nutritional care can support a treatment plan."
  - The report's trials found: not met (research). None of PMIDs 8780431, 11281989, 35304155, 29062366, 33599345 or 19737592 appears in the log; the exercise-after-ERP trial (PMID 42814664) came back in one Europe PMC search but was not opened, and the exercise sentence cites nothing. The NAC evidence is another trial: "A positive 2026 NAC-plus-sertraline pilot has response-percentage and dropout inconsistencies".
  - Each class labelled: met. Diets "An interesting, very uncertain signal."; NAC "Findings remain inconsistent."; ketamine and psilocybin "Research signals deserve attention, but do not establish that either outperforms ERP or SSRIs."
  - No fail: met; far beyond guideline classes, and no "more research is needed": "This is a provisional first pass, not an exhaustive ranking."
- Final check: not_ready ×6 (rounds 1–6), ready_with_limits ×2 (the second with a new turn id); 8 checks; not stopped; check line present. 71 AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the check line; caveats 18/18. No plain-answer note: the check withheld it (`after_research`). The YouTube scout refused the question-form target (`research_target_not_deidentified`, the known scout-wording class, fixed on the next build), and the run re-registered its quick answer with a new target after two Europe PMC searches (log).
- Against 27 Oct (previous judgment): better by tally (2 + 1 not met / 3, was 1 + 1 part + 1 not met): exercise and the botanicals are named again; the report's trials are still missing.

##### o355-keto-thread: passes in part
- Criteria:
  - The striking recovery and the no-effect or worse replies both kept: met. "Firsthand accounts of no benefit or worsening count against a claim that keto reliably helps everyone." and "They do not disprove a benefit in that particular poster."
  - How the thread was chosen: met. "Searching for people whose OCD improved makes success stories easier to encounter."
  - No fail (a share of people helped): met. "The thread cannot tell you your chance of benefit or worsening."
  - Round limit (stopped check): met. A bold "partial assessment" in the first sentence; why: "AskRigor’s final check also stopped because it retained my earlier, inconsistent subreddit labels after I corrected them; full final verification did not finish."; the server's bug report quoted; "May AskRigor send this bug report, or would you like to clarify something first?"; next: "share the thread link for an assessment of the actual post, replies and follow-up."; the unchecked line last.
- Final check: not_ready ×5 (rounds 1–5), stopped (round 6); 6 checks. Stopped as "stuck" ("some of its statements were not checked"): could not, two `carried_state` steps such as "principal_communities leaves out Reddit r/OCD, which the user named earlier in this conversation" (rounds 4–6). From the log: the user wrote only "Reddit"; the run declared "Reddit r/OCD" and "Reddit r/keto" `named_by_user: true` in rounds 1–2; round 2 itself asked to "Name the Reddit community Reddit r/keto by its subreddit, as r/<name>"; the run renamed both (`named_by_user: false`) and in round 5 also recorded the old labels `not_found`, but the carried labels could not be cleared. This is the known locked-label class, fixed on the next build. Class: check. No check line; ends with the unchecked line.
- Explained: yes, accurately and in plain words (quote above); the server bug report it quotes keeps internal words ("principal_communities", "named_by_user").
- Delivered: no receipt; no plain-answer note (stopped). The fixed caveat "A community whose pages could not be retrieved: r/NutritionalPsychiatry. Reports there are not included." contradicts the answer, whose search-index text from that subreddit "contained two keto benefit accounts" (the "not included" family, here for a retrieval failure).
- Against 27 Oct (previous judgment): same (passes in part; the same label-lock stop, now at round 6 instead of 7).

##### o355-saffron-fluvoxamine: passes in part
- Criteria:
  - Each arm's change and the difference with its interval: met. "average improvement was 5.13 points with saffron and 4.52 with fluvoxamine; the reported difference was 0.60 points favoring saffron", "from −1.03 to 2.25".
  - `absence_claims` declares the sentence: not met (source). Rounds 1–2 declared "Saffron has not been established as equally effective as fluvoxamine for OCD." (log). Round 2's step answered "Each listed study needs a full-text method audit.", and AskRigor's acquisition tool refused the trial, which has a PMCID and no DOI ("doi [pattern]: String does not match pattern"). From round 3 the run passed `absence_claims: []`, and the check passed with the central sentence ("does not, by itself, show that saffron is as effective as fluvoxamine") undeclared.
  - No fail: met; never "as effective": "Failing to detect a difference alone satisfies neither requirement."
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×3 (the last two each with a new turn id); 7 checks in the Codex turn (5 under one server turn id); not stopped; check line present.
- Explained: n/a.
- Delivered: reworded, keeping 67% (change-kinds); caveats 17/17 (two with renamed link texts, so stats4 counts 15/17). Dropped after the check, among others: "The main paper’s numerical findings and methodological interpretation therefore retain that verification limit." and "Additional search-index-only community reports remain provisional." Note: three "confirmed"; items 1 and 3 reuse one quote, "The findings are compatible with similar short-term benefit, but do not establish that saffron is an interchangeable substitute for fluvoxamine." (the known one-quote-for-two-claims class), though here it shows both; item 2 is sound.
- Against 27 Oct (previous judgment): mixed, same verdict: the check now passes (27 Oct: stopped), but the absence claim is now withdrawn altogether (was in part).

##### o355-scoped-list: passes
- Criteria:
  - The list, saying it implies no ranking: met by meaning. Eight trials in a table, cannabis apart and one unverified lead: "This is a trial inventory, not a treatment recommendation." It does not use the word "ranking".
  - No fail (a comparison with ERP or SSRIs forced in): met; active-comparator trials are only excluded: "these are not placebo-controlled trials".
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (the second with a new turn id); 5 checks; not stopped; check line present. 64 AskRigor calls.
- Explained: n/a.
- Delivered: formatting only (the checked draft, then the note and check line); caveats 8/8. Note: both "confirmed" sound; the "qualified" quote ("The studies range from a few hours to 12 weeks of observation, so this inventory cannot guide long-term treatment choices.") agrees with the quick answer's "small and short" rather than qualifying it.
- Against 27 Oct (previous judgment): better (passes, was passes in part): the answer now says the list is an inventory, not a recommendation, and it is delivered as checked (27 Oct: reworded to 65%).

##### o355-supplement-table: passes in part
- Criteria (turn 2's table, 20 rows):
  - Labelled a subset with no ranking implied: met. "Trials are grouped by substance, not ranked."
  - The bottom line stays: in part (research). "this inventory does not establish a supplement or botanical as a replacement for established OCD care"; ERP and SSRIs are not restated as the starting treatments.
  - Each effect with its size or "effect size not extracted": not met (research); directions only, such as "Abstract reports better OCD symptom scores; small positive trial."
  - Fail (the table the only summary): not met; prose follows: "Three distinctions matter."
  - Note: the table holds the report's trials (inositol 1996 and 1999, NAC 2022, saffron, crocin, *Echium amoenum*).
- Final check: turn 1: not_ready ×3 (rounds 1–3), ready_with_limits; turn 2: the same; 4 checks in the longest turn; not stopped; check line in both. Turn 2's checks passed no carried state from turn 1 (the server gave turn 2 a new first turn). 65 + 64 AskRigor calls.
- Explained: n/a.
- Delivered: turn 1 reworded, keeping 58%; caveats 19/19. Dropped after the check include "Do not increase doses or stop medication abruptly on your own." and the plain explanation of mania, a declared key term ("mania (abnormally elevated or irritable mood)"), so "mania" now goes unexplained. Turn 2 reworded, keeping 86%; caveats 13/13 (five with renamed link texts, so stats4 counts 8/13); dropped: "Most outcomes were clinician-rated OCD symptom scores, not lasting recovery." Notes: turn 1 none, withheld (`after_research`): after two scout refusals (`research_target_not_deidentified`, the known class) the run re-registered its quick answer after an Atlas lookup and a Europe PMC search (log). Turn 2: three "qualified", each quote agreeing with its claim (for example "N-acetylcysteine (NAC) has several controlled trials, including negative ones" against "NAC has mixed trial results, including a larger negative trial."), so none shows a qualification.
- Against 27 Oct (previous judgment): same verdict and criteria (1 + 1 part + 1 not met); delivery worse (27 Oct: turn 1 word for word, turn 2 formatting only).

##### o356-dropout-nausea: passes in part
- Criteria:
  - Both endpoints given: met. "10% versus 9% over 10 weeks is a difference of 1 percentage point"; nausea 31% against 12%, "19 percentage points more".
  - NNH 6 for nausea: in part (research). No number needed to harm is given; the excess is put as "equivalent to 19 additional people reporting nausea per 100 treated at those rates" (1 ÷ 0.19 ≈ 5.3, so about 6).
  - No fail: met. "Not on these data alone."
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits; 4 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 3/3. Note: both "confirmed" sound. The "qualified" quote, on missing confidence intervals and dropout risk, shows a qualification of precision but leaves the quick answer's "roughly one extra case for every five people treated" standing; the answer gives no NNH that would correct it.
- Against 27 Oct (previous judgment): worse (passes in part, was passes): the NNH of 6 given on 27 Oct is gone.

##### o356-short-monitoring: passes
- Criteria:
  - Rare, delayed and after-stopping harms called unmeasured: met. "A study this small can easily miss harm."; "Stopping monitoring at the last dose leaves later-onset harms and new symptoms or worsening OCD after stopping unmeasured". The figures hold: "(0.99)^15 ≈ 86%" and "1 − 0.05^(1/15) ≈ 18%" (18.1%).
  - No fail: met. "It cannot establish safety, especially for delayed harms, longer use or problems after stopping."
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (the second with a new turn id); 5 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 5/5. Note: the first "confirmed" is sound; the second quote shows only the monitoring half of its claim; the "qualified" quote ("The unnamed herb, dose, preparation, other medicines and product quality prevent a product-specific safety judgment.") restates the quick answer rather than qualifying it.
- Against 27 Oct (previous judgment): same (passes).

##### o356-ssris-years: passes in part
- Criteria:
  - NNT about 7, with its outcome and 10 to 13 weeks: in part (research). The individual-patient analysis (PMID 40369939) is given as a mean difference, "an average advantage over placebo—a comparison pill without the SSRI—of 2.65 points", in trials that "lasted 10–13 weeks"; its text in the log says "number needed to treat of seven", which the answer leaves out.
  - NNH 6 for any adverse event with both rates, `binary_results` declaring both: not met (source). The Cochrane review would not load ("Europe PMC's full-text service failed for PMC7025764 (HTTP 500)", log); the run did not take the browsing route the tool offered; `binary_results` holds only the taper trial (23/51 against 12/50).
  - Specific adverse-event rates: not met (research). "The years-long, OCD-specific frequencies are unknown."
  - No net score: met.
  - The short answer says years of use weren't studied: in part (research). It names "uncertainty about very long-term outcomes"; the 10–13 weeks and "Most evidence concerns months" come only further down.
  - Label harms and harms not checked named: met. "Serious warnings include suicidal thoughts or behavior, especially in younger adults early in treatment or around dose changes"; not checked: pregnancy ("this overview does not estimate those risks") and the persistent-sexual-effects study focus.
  - Effects after stopping: met. "Stopping or missing doses can produce dizziness, nausea, electric-shock sensations, insomnia and anxiety."
  - No fail: met (no NNT shown as long-term, no invented NNH).
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×2; 6 checks; not stopped; check line present. 63 AskRigor calls.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 14/14. Note: four "qualified". The sexual-effects one is sound ("their frequency and predictors are uncertain"). The relapse quote ("A 2025 review found less relapse when people who had already improved continued their antidepressant rather than switched to placebo.") confirms its claim rather than qualifying it; the NICE quote confirms the review half and leaves the ERP half unshown; the first ("Some improve substantially; others retain troublesome symptoms.") qualifies "help many" only weakly.
- Against 27 Oct (previous judgment): same (3 + 2 part + 2 not met / 7); the check's own note is now delivered (27 Oct: replaced by the run's sentence).

##### o356-year-follow-up: passes
- Criteria:
  - A conditional recommendation: met. "Yes—longer-term sertraline is reasonable to discuss with your prescriber when it is helping OCD and its side effects are acceptable."
  - With its figures: met. "Acute OCD worsening occurred in 13/108 continuing sertraline versus 40/113 switched to placebo—about 12% versus 35%."; strict relapse 3/108 against 5/113, risk ratio 0.63 (holds), interval 0.15–2.56; harms: "adverse-event withdrawals were 5/109 on sertraline versus 12/114 on placebo".
  - No fail: not withheld.
- Final check: not_ready ×6 (rounds 1–6), ready_with_limits ×2 (the second with a new turn id); 8 checks; not stopped; check line present. 59 AskRigor calls, 29 web searches.
- Explained: n/a.
- Delivered: reworded, keeping 75%; caveats 15/15. Dropped after the check: the limit that Greist 1995's "year-long benefit and harms claims remain provisional" and the sentence naming its pages 57–65 (change-kinds); one Patient.info link changed after the check (patient.info/forums/… became community.patient.info/t/…). Note: four "confirmed", each shown; the "qualified" NICE quote adds the remission detail to an agreeing statement, closer to a confirmation.
- Against 27 Oct (previous judgment): same (passes); delivery worse (27 Oct: additions only).

##### q120-mosquito-net: passes
- Criteria:
  - How mosquitoes get past common nets: met. "Mosquitoes can bite through netting resting against your skin."; "Check the floor, seams and closed zip for gaps."; "A zip avoids repeatedly untucking the net."; YouTube commenters "described awkward entry, gaps, snagging"; a mosquito mesh that does not exclude midges.
  - A fully enclosed design favoured: met. "freestanding mesh tent with a sewn-in floor and a zipped door"
  - The check passes: met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (the second with a new turn id); 5 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 10/10. Note: four "confirmed" and one "did not check that". The third quote ("Mosquitoes can bite through netting resting against your skin.") shows only the first part of "Keep the mesh off your skin, close every gap, and check for holes."; the others are sound.
- Against 27 Oct (previous judgment): same (passes); the gaps and untucked edges are now explicit, and it is delivered as checked (27 Oct: reworded to 61%).

##### q120-sleep-inside-outside: passes in part
- Criteria, turn 1 (10 AskRigor calls: access, quick-answer registration, protocol loads, one Atlas lookup with 0 findings, two checks; no literature or web search):
  - Depends on conditions, said briefly, the main ones named: met. "The better choice depends on the conditions in each place: temperature and humidity, fresh air, damp or mold, pollen, noise, light, insects, and safety."
  - Asks whether they sleep better in one place or haven't tried: met. "Have you already tried both and slept better in one, or are you deciding whether to try sleeping outside?"
  - Asks what their room is like: not met (research); nothing about the room.
  - Before researching: met.
- Criteria, turn 2:
  - Kept as the user's observations: met; `user_observations` lists all four with source `user` (log): "Given your stuffy bedroom and summer mosquitoes".
  - What stuffy air does to sleep, researched: met. "some wrist-tracker sleep measures improved, but a broad improvement in sleep or next-day performance was not established" (23 bedrooms, audited).
  - Damp or mold and how to fix them: in part (research). Fixes from EPA and CDC ("Find and fix the moisture source—window condensation, a leak, or both—and remove the mold."), but nothing on what damp or mold does to sleep: "Your description cannot establish the extent of hidden damp or whether it affects your health."
  - Protection that keeps working outside: met. "use an intact, fully enclosed mosquito net or zipped screened tent, keep netting off your skin, and close or tuck every edge"
  - How common kinds fail: met. "Backpacking Light reports described gaps letting mosquitoes in and awkward net setup."; nets cut airflow (audited study).
  - What to check or change: met. "arrange a check of the window’s moisture source and whether a secure insect screen can allow ventilation"
  - How to compare nights inside and outside: met. "keep sleep times similar and note awakenings, next-day restedness, bites and breathing symptoms"
  - The check passes: met.
- Final check: turn 1: not_ready (round 1), ready_with_limits; turn 2: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (the second with a new turn id); 6 checks in the longest turn; not stopped; check line in both. Turn 2's first check passed turn 1's last carried state (`first_turn: false`).
- Explained: n/a.
- Delivered: turn 1: the checked draft, then the note ("This research did not check that." three times) and check line; caveats 2/2. Turn 2: the checked draft word for word, then the check line; caveats 19/19. No note in turn 2: withheld (`after_research`). The run registered turn 2's quick answer before any turn-2 research, but the one older receipt it passed was turn 1's Atlas lookup with 0 findings, new in #380 (log).
- Against 27 Oct (previous judgment): better: turn 2 now meets protection, failure modes and the night comparison (27 Oct: in part); turn 1 the same (no room question).

##### q125-product-names: passes in part
- Criteria:
  - Each name's chemistry from authoritative documentation: met. N-acetylation "adds an acetyl cap to its amino end (the N-terminus)", from Thermo Fisher's and MIT's pages.
  - How sellers and buyers use the names: in part (source). "Seller and buyer usage of these exact labels remains unverified."; r/Peptides and r/Nootropics found nothing for the made-up name, no vendor label exists to read, and YouTube's quota stopped a search.
  - The check passes with community evidence researched and the discussion sources or their limits: met (r/Peptides and r/Nootropics declared; ready_with_limits).
  - No fail: met. "The names alone do not establish that they are the same product."
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (the second with a new turn id); 5 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 11/11. Note: both "confirmed" sound; the "qualified" quote ("The exact-name PubMed and Europe PMC searches did not verify that these three labels identify the same molecule.") agrees with the quick claim that the supplier's specification must be checked, rather than qualifying it.
- Against 27 Oct (previous judgment): same (3 + 1 part).

##### q126-39-replication: passes in part
- Criteria:
  - Each study's exact claim reconstructed: in part (research). Participants and outcomes are there ("selected eight high scorers and eight low scorers on a questionnaire about unusual experiences associated with temporal-lobe sensitivity"; 6 of 8 against 0 of 8; 89 people, 43 active and 46 sham), but not how either stimulation was given beyond "right-sided" and "its participant selection and exposure duration differed".
  - Whether the later study tested the same conditional claim, with full-sample and subgroup results: met. "They examined whether stimulation effects varied with temporal-lobe signs and related traits, reporting no detectable variation."; "the paper does not provide the subgroup estimates and uncertainty intervals needed to exclude a particular subgroup effect quantitatively".
  - Both results reported, the subgroup result a hypothesis: met. "But protocol differences also do not establish that the first result was real."
  - No fail: met. "No—not from those facts alone."
  - Round limit (stopped check): in part (research). Partial near the start ("My assessment of these particular papers remains partial."), the why, a report and the question are there; how to continue is not: it names "The missing second page of the original paper—page 448" but not how to supply it or what a next turn would do.
- Final check: not_ready ×4 (rounds 1–4), stopped (round 5); 5 checks. Stopped as "stuck" ("a research step kept failing and some of its statements were not checked"): could not, the research step on the later study's declared direct null result, "an abstract or a lead cannot show a null result. Audit each, or state it as support_not_located.", and its answer-draft twin asking for the estimate and interval (rounds 3–5). Neither paper's full text was admitted (log). The step offered `support_not_located`; the run kept `direct_null_evidence` under `research_depth: deep`. Class: research (with a source cause). No check line; ends with the unchecked line.
- Explained: mostly. "AskRigor could not complete the full-text audits or establish quantitative bounds for the reported subgroup null result." It names the part and why, but not that restating the null result as not located would have cleared it.
- Delivered: no receipt; no plain-answer note (stopped).
- Against 27 Oct (previous judgment): worse (passes in part, was passes): the check stopped, and the stimulation setups are no longer reconstructed (27 Oct gave both schedules).

##### q126-40-aura: passes
- Criteria:
  - Three questions apart, each with its evidence: met. Symptom: an aura can be a focal seizure "rather than merely a warning before one"; the sensation as a cause: "It may remain isolated or progress; that does not establish that noticing it causes progression."; observation: the Soni study, with "Those electrical events do not establish an increase in clinical seizure risk".
  - The seizure sign only as a point about the symptom: met. Assessment "if the episodes are new, changing, recurring in a very similar pattern".
  - No warning without a risk shown, and not called risk-free: met. "neither a promise of zero risk nor a claim that attention itself is dangerous is justified"
  - No fail: met.
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits; 5 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: every sentence of the checked draft kept; the aura steps and 14 caveats were set as bulleted lists (change-kinds: reworded, 89%); caveats 19/19. Note: both "confirmed" sound. The first item reads "This research did not check that." although the answer states it ("Déjà vu alone does not establish epilepsy.") with a link; the check had refused it as "qualified" without an audited source. The "corrected" rests on a correction the run declared against its own quick answer, retracting "Treating intensive meditation or prolonged attention as established clinical seizure risks for this exposure." (log), which the quick answer never claimed (it said "could be risky"); the quote shows no correction.
- Against 27 Oct (previous judgment): same (passes).

##### q126-41-textbook: passes in part
- Criteria:
  - The later qualification found, citing the diagram's line and the later passage: met. "Chapter 9 states that “the roles of the two units are reversed” in some subjects"; "The caption's “Right unit: fear-only” could sound universal when read alone."
  - Shorthand apart from a universal claim, criticizing only the strongest reading: met. "Read together, the book's position is a typical mapping with stated exceptions."
  - Then tests whether the typical-case claim has evidence: not met (research). "it does not establish that the brain model or the book's reported frequency is scientifically correct"; no search was run.
  - No fail: met.
- Final check: not_ready ×2 (rounds 1–2), ready_with_limits; 3 checks; not stopped; check line present. 28 AskRigor calls, 20 of them protocol loads; no web search.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 2/2. Note: three "confirmed", each shown (the third quote covers the presentation half; the next sentence covers the rest).
- Against 27 Oct (previous judgment): same (2 met + 1 not met).

##### q126-42-group-average: passes in part
- Criteria:
  - A group average, not any one person's brain, the reversed participants named: met. "It does not even tell you how many participants favored each side."; "Reliable reversed dominance is a counterexample to universal right-side dominance."
  - What would show it for an individual: in part (research). It asks for individual results ("You would need the measurement’s definition, sample size, uncertainty and individual results.") but names no task localizer, stimulation or lesion evidence in a person.
  - The average not called meaningless: met. "This still allows genuine hemispheric specialization"
  - No fail: met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits; 4 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 1/1. Note: both "confirmed" sound; the "qualified" quote restates "Reversed dominance contradicts the universal claim." with one added word, "Reliable".
- Against 27 Oct (previous judgment): same (2 met + 1 part).

##### q128-oral-liver: passes in part
- Criteria (question 128's row in its oral-medicine form):
  - The serious harms listed and searched by name: met; from both labels, an audited 2024 long-term review and a 1999 lupus study: lupus-like illness, autoimmune hepatitis, liver failure, multi-organ hypersensitivity, severe allergy, blistering skin reactions, *C. difficile*, raised brain pressure, pancreatitis, blood disorders.
  - Label warnings apart from uncertain reports: met. "These are signals requiring awareness, not proof that every reported event was caused by treatment."
  - No rate without a denominator: met (none given; the community figures are counts).
  - Earlier tolerance and the emergency signs: met. "Feeling less nauseated on minocycline does not answer whether its delayed immune risks are preferable."; "Breathing difficulty, facial swelling or extensive skin peeling require emergency care."
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable from the summary (counts on neither side); the log's last call lists 10 entries, each `label_warning`.
  - No fail: severe allergic reactions are named: "Both carry warnings about severe allergic reactions".
  - Round limit (stopped check): met. Start: "This is a partial, provisional review: AskRigor’s final check did not pass because it required an inaccurate statement about direct comparative studies."; before the end: "AskRigor’s check stopped over the inaccurate “no direct study found” caveat.", a report, "May AskRigor send this bug report, or would you like to clarify something first?", the gaps a next pass could take; the unchecked line last.
- Final check: not_ready ×7 (rounds 1–7), stopped (round 8); 8 checks, the highest round number in this part. Stopped as "stuck" ("some of its statements were not checked"): could not, one answer-draft step requiring the caveat "Not tested as described in any study I found: oral minocycline versus oral doxycycline for moderate acne." (rounds 6–8). The check builds it from the two declared key sources' target matches; the run had found direct acne comparisons in the partly read Cochrane review and declined it, trying `reader_dismissed`, a declaration for another purpose, without effect (log). Class: check. No check line; ends with the unchecked line.
- Explained: yes (quotes above): it names the part, a required caveat, and why, that the caveat would overstate the evidence gap, in plain words.
- Delivered: no receipt; no plain-answer note (stopped).
- Against 27 Oct (previous judgment): worse (passes in part, was passes): the content meets the same standard, but the check stopped.

##### q130-maker-authors: not judged
- Criteria: not judged. OpenAI's filter refused the run again (log: "This content was flagged for possible biological risk"), after 31 AskRigor calls and 12 web searches; exit 1 at 00:10:50 (`progress.txt`).
- Final check: never called.
- Explained: n/a (no answer).
- Delivered: no answer (no file in `out/`).
- Against 27 Oct (previous judgment): same (not judged; the filter, as on 21, 22, 23, 25 and 26 Oct).

##### q130-rabies-package: passes in part
- Criteria:
  - The package figure not given as the vaccine's alone: met. "the familiar “almost 100% effective” claim is not a clean measurement of the vaccine’s effect by itself"
  - No antibody result given as protection: moot (no antibody-threshold study used; antibodies appear only as the mechanism).
  - The dog result kept as animal evidence with its exclusion: moot (no dog study used).
  - The vaccine called inactivated, not live: in part (research); never called live, never called inactivated: "Modern rabies vaccine provides strong protection after exposure".
  - No source measured the vaccine alone in people: met. "Not tested as described in any study I found: the isolated contribution of rabies vaccination after a bite."; the Tanzanian 0 of 473 result is bounded: "it does not establish “100% vaccine-alone efficacy.”"
  - No fail: met.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits ×2 (the second with a new turn id); 5 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 12/12. Note: one quote ("That is evidence supporting protection without immunoglobulin, but it does not establish “100% vaccine-alone efficacy.”") backs both a "qualified" and a "confirmed" (the known one-quote-for-two-claims class); as a qualification it mostly agrees with the quick answer. The immunoglobulin "confirmed" is sound.
- Against 27 Oct (previous judgment): same (3 met + 1 part; the antibody criterion now moot rather than met).

##### q132-copper-b12: passes in part
- Criteria:
  - Communities searched in both turns by condition and outcome, with what could not be reached: met. Turn 1 r/Supplements and r/Copper_deficiency; turn 2 r/B12_Deficiency and r/cfs; both name YouTube's quota: "YouTube's search limit stopped discovery before any video turned up, so YouTube evidence could not be checked yet."
  - Unusual leads, including vitamin A and copper (PMID 3655940): in part (research). Iron, vitamin C and thyroid are given and bounded ("High-dose iron is a less certain contributor than zinc"); vitamin A is never searched or named (log).
  - Injection reports weighed against bounded trials: in part (research). The 16-trial review (DOI 10.3390/nu13030923) is bounded: "Most treatment was oral, and fatigue evidence was sparse, so this cannot settle whether injections would help this particular adult."; the reports "keep possible responders visible but cannot diagnose deficiency"; the 95-person oral-B12 fatigue trial (PMID 29460813) is not found.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity: in part (research). It leads with "excess zinc, impaired intestinal absorption, protein loss, or reduced production by the liver"; vitamin A toxicity is absent.
  - No empiric high-dose vitamins: met. "Avoid using escalating copper doses as a diagnostic trial."
  - No fail: met (searched despite the normal B12; no report treated as common).
  - Round limit: moot (both checks passed).
- Final check: turn 1: not_ready ×5 (rounds 1–5), ready_with_limits ×2 (the second with a new turn id); turn 2: not_ready ×2 (rounds 1–2), ready_with_limits; 7 checks in the longest turn; not stopped; check line in both. Both turns declared `first_pass` (27 Oct: deep), so the quota did not stop them; turn 2's first check passed a turn-1 carried state (`first_turn: false`).
- Explained: n/a.
- Delivered: both turns the checked draft word for word; caveats 14/14 and 12/12. Turn 1's note: the zinc "confirmed" is sound; the "qualified" quote ("Kidney disease with substantial protein loss in urine can lower ceruloplasmin and contribute to copper loss.") agrees and covers only the kidney part of its claim; the Wilson "confirmed" shows only its last clause. Turn 2: no note, withheld (`after_research`): registered at turn 2's start, but after the turn-1 receipts it passed (log).
- Against 27 Oct (previous judgment): better: both checks pass (27 Oct: both stopped on the quota step); the criteria are the same (3 met + 3 part).

##### q135-low-stakes: passes in part
- Criteria:
  - A direct, useful answer: met. "Yes—a 20-minute nap in the early afternoon is a reasonable option for an adult who otherwise sleeps well at night"
  - No ritual warnings or possible harms no evidence supports: in part (check). The advice is practical and claims no unsupported harm, but a nap answer carries 17 fixed caveats, such as "How often harms occur wasn't quantified in the sources found here for this exposure" and a blinding caveat, beside "do not establish long-term health safety or guarantee that nighttime sleep will be unaffected".
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (the second with a new turn id); 6 checks; not stopped; check line present. 54 AskRigor calls for a nap.
- Explained: n/a.
- Delivered: formatting only (the checked draft, then the note and check line); caveats 17/17. Note sound: "qualified" by its condition ("provided it leaves nighttime sleep undisturbed"); both "confirmed" shown.
- Against 27 Oct (previous judgment): same (1 met + 1 part).

##### q135-two-week-trials: passes
- Criteria:
  - The short answer: met. "they support short-term bloating relief, while the six-month benefit and liver risk remain unknown"
  - Fail condition (called safe, the liver risk left below): not met. "Missing long-term liver data do not prove liver harm, but they leave that risk uncertain."
- Final check: not_ready ×4 (rounds 1–4), ready_with_limits ×2 (the second with a new turn id); 6 checks; not stopped; check line present. 57 AskRigor calls, 28 of them protocol loads.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 6/6. Note: three "confirmed", each quoting a sentence the answer took from the quick answer (two word for word), so they show agreement with no research behind the quote; circular, though not wrong for a made-up product.
- Against 27 Oct (previous judgment): same (passes).

##### q135-urgent-treatment: passes in part
- Criteria:
  - The short answer makes the benefit and the urgency clear: in part (research). Urgency: "No—if the hospital judges antivenom is indicated, they should not wait for a better estimate of delayed-reaction risk."; danger untreated: "Venom poisoning can cause bleeding, paralysis, kidney injury and tissue damage."; antivenom's survival benefit is never stated.
  - The remaining unknown in proportion: met. "4/98 followed antivenom recipients (4.1%)", with "These figures are not predictions for your relative."
  - Fail (delay advised without comparing the danger untreated): not met.
  - Round limit (stopped check): in part (research). The start says it is partial ("The research review below is partial because AskRigor’s final check could not finish"), with the why, a report and "May AskRigor send a bug report about this?", but nothing on what a next turn could do or how to continue; its next step is clinical only.
- Final check: not_ready ×4 (rounds 1–4), stopped (round 5); 5 checks. Stopped as "stuck" ("a research step kept failing"): could not, the treatment-landscape step, "fix its selection and depth blockers and call it again until it allows the answer (deep research needs ledger_consistent_for_synthesis)." (rounds 3–5). The landscape tool's blockers asked for YouTube discovery batches and benefit, failure, harm, discontinuation and eventual-standard searches for "indicated_antivenom, delay" (log); the run had declared `research_depth: deep` for an emergency. Class: check (with the run's deep choice). No check line; ends with the unchecked line.
- Explained: yes, accurately (log) and in plain words: "AskRigor could not complete its final check because it continued requiring video-based treatment discovery for this emergency question." It also keeps care first: "Continue the urgent discussion with the treating team now; do not postpone indicated antivenom while waiting for more research."
- Delivered: no receipt; no plain-answer note (stopped).
- Against 27 Oct (previous judgment): worse, same verdict: the check stopped on the treatment-coverage step, as on 26 Oct (27 Oct: passed); the criteria are otherwise the same.

##### q136-responders: passes
- Criteria:
  - The denominators said to be inconsistent: met. "31 + 33 = 64 participants conflicts with the methods' 60 enrolled"
  - No percentage or ratio without reconciled denominators: met; none, and "Neither total should be silently corrected, and 30 per group should not be assumed."
  - Fail condition: not met.
- Final check: not_ready ×2 (rounds 1–2), ready_with_limits; 3 checks; not stopped; check line present. 49 AskRigor calls, 29 of them protocol loads; one web search.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 1/1. Note: three "corrected", each quote showing that no figure can be given yet; the note withholds the quick answer's figures ("Without AskRigor, a quick answer would have given figures this research does not support."). The third rests on a correction the run declared of the quick answer's conditional calculations, which is what the note compares.
- Against 27 Oct (previous judgment): same (passes).

##### q136-symptom-scale: passes
- Criteria:
  - The scale's range and direction: met. "runs from 0 to 500, with lower scores meaning fewer or less severe symptoms"
  - Each arm's change: met. "Capsule 375 → 282 gives −93 points; placebo 390 → 394 gives +4 points."
  - The difference between the arms: met. "The difference in mean changes is −93 − (+4) = −97 points, favoring the capsule."
  - The participants not analyzed: met. "25/101, or 24.8%, were excluded from the analysis"
  - A conflict between the paper's range and its table: moot (a made-up trial).
  - No fail.
- Final check: not_ready ×3 (rounds 1–3), ready_with_limits; 4 checks; not stopped; check line present.
- Explained: n/a.
- Delivered: the checked draft word for word, then the note and check line; caveats 3/3. Note: four "confirmed", each shown. The fixed caveat "Its results stay unreliable until they are reconciled." is applied to the Spanish validation used only for the scale's context.
- Against 27 Oct (previous judgment): same (passes).

#### Summary for part 01

**Verdicts (28 cases): 10 pass, 17 pass in part, 0 fail, 1 not judged.**
- Pass: o354-continue, o354-emergency-first, o355-scoped-list, o356-short-monitoring, o356-year-follow-up, q120-mosquito-net, q126-40-aura, q135-two-week-trials, q136-responders, q136-symptom-scale.
- Pass in part: o354-work-left, o355-best-ocd, o355-keto-thread, o355-saffron-fluvoxamine, o355-supplement-table, o356-dropout-nausea, o356-ssris-years, q120-sleep-inside-outside, q125-product-names, q126-39-replication, q126-41-textbook, q126-42-group-average, q128-oral-liver, q130-rabies-package, q132-copper-b12, q135-low-stakes, q135-urgent-treatment. Three of them (o354-work-left, o355-keto-thread, q128-oral-liver) meet every criterion and are held only by a stopped check.
- Not judged: q130-maker-authors (OpenAI's biological-risk filter again).

**Not-fully-met criteria by class (23):** research 19, source 3 (o355-saffron's undeclared absence claim after the acquisition tool refused a PMCID-only trial; o356-ssris-years' Cochrane review, HTTP 500; q125's seller usage for a made-up name), check 1 (q135-low-stakes' fixed caveats), delivery 0. The five stopped checks are counted apart below: check 4, research 1.

**Against 27 Oct:**
- Better (5): o354-continue (carried state passed back; turn 2 delivered as checked), o355-best-ocd (exercise and botanicals named), o355-scoped-list (inventory, not a recommendation), q120-sleep-inside-outside (turn 2's mosquito and night-comparison points), q132-copper-b12 (both checks pass, were stopped).
- Worse (5): o354-work-left, q126-39-replication, q128-oral-liver and q135-urgent-treatment (checks stopped where they passed); o356-dropout-nausea (the NNH of 6 gone).
- Mixed (1): o355-saffron-fluvoxamine (check passes, was stopped; the absence claim now withdrawn).
- Same (17), among them o355-supplement-table and o356-year-follow-up, whose delivery is worse (more rewording after the check).

**Stopped or never-passed checks (5 turns in 5 cases; none at the ten-round limit; the longest turn ran 8 checks, in q128-oral-liver, o355-best-ocd and o356-year-follow-up; q128's stop at round 8 was the highest round number):**
- o354-work-left, round 4, research step on a video whose comments are disabled; class check (AskRigor bug below). Explained: yes ("remained blocked after an ERP video’s comments were confirmed disabled").
- o355-keto-thread, round 6, `carried_state` steps on labels the run itself marked user-named; the known locked-label class, fixed on the next build; class check. Explained: yes ("it retained my earlier, inconsistent subreddit labels after I corrected them").
- q126-39-replication, round 5, a declared direct null result with no full text; the step offered `support_not_located`, which the run did not take; class research (source behind it). Explained: mostly; it does not say the claim could have been restated.
- q128-oral-liver, round 8, a required caveat the run judged inaccurate; class check. Explained: yes ("it required an inaccurate statement about direct comparative studies").
- q135-urgent-treatment, round 5, the treatment-landscape step under deep research; class check, with the run's deep choice. Explained: yes ("it continued requiring video-based treatment discovery for this emergency question").
- Never called: q130-maker-authors (the filter).

**Plain-answer notes whose backing does not show what they claim:**
- One quote for two claims (the known class, fixed on the next build): o354-continue turn 2 (shows neither), q130-rabies-package, o355-saffron-fluvoxamine (here it shows both).
- "qualified" where the quote agrees or restates: o354-continue turn 2, o355-scoped-list, o355-supplement-table turn 2 (all three), o356-short-monitoring, o356-ssris-years (two, a third weak), o356-year-follow-up (borderline), q125-product-names, q126-42-group-average, q130-rabies-package, q132-copper-b12 turn 1.
- Covering only part of its claim: o354-continue turn 1, o354-emergency-first, o356-short-monitoring, q120-mosquito-net, q132-copper-b12 turn 1 (two items).
- Leaving a wrong figure standing: o356-dropout-nausea ("roughly one extra case for every five people treated"; 1 ÷ 0.19 gives about 6).
- A "corrected" resting on a correction the run declared for a claim its quick answer never made: q126-40-aura; the same note says "did not check that" for a point the answer states with a source.
- Circular: q135-two-week-trials (all three quotes are the quick answer's own sentences).
- Withheld by the check (`after_research`): o355-best-ocd and o355-supplement-table turn 1 (re-registered after the scout refused the target), q120-sleep-inside-outside turn 2 and q132-copper-b12 turn 2 (follow-up registrations after earlier turns' receipts).

**What looks like AskRigor rather than the model:**
1. **A comments-disabled video audit returns no research receipt (o354-work-left).** The audit of lxEHOh9c3D8 came back `access_status: comments_disabled`, `extraction_coverage: completed_with_access_boundary`, with no `research_receipt`, while the audits of the run's two other videos each ended with an `rr1~youtube_video_audit~` receipt. The step "continue until the audit completes" could never be met; it repeated in rounds 2–4 and stopped the check. Same family as the known "steps no call can finish" class, with its own cause.
2. **A forced caveat says more than its basis (q128-oral-liver).** "Not tested as described in any study I found" is built from the declared key sources' target matches only, so it reads as if no direct study was found, though the run had found direct comparisons in the Cochrane review it had not finished. No declaration lets the run narrow it; the run's attempt through `reader_dismissed` did nothing, and the check stopped at round 8.
3. **The treatment-landscape step applies to an urgent give-now-or-wait question (q135-urgent-treatment).** Under `research_depth: deep` the check required `assess_treatment_landscape_coverage`, whose blockers asked for YouTube program discovery and five kinds of broad searches for "indicated_antivenom, delay"; it stopped the check, as on 26 Oct.
4. **The acquisition tool refuses a PMCID-only paper (o355-saffron-fluvoxamine).** `acquire_open_full_text` takes a `pmcid` field but rejected the call with an empty DOI ("doi [pattern]: String does not match pattern"); the check then demanded a full-text audit for the absence claim, the run withdrew `absence_claims`, and the check passed with the answer's central sentence ("does not, by itself, show that saffron is as effective as fluvoxamine") undeclared. Seen on 27 Oct too.
5. **The plain-answer note is withheld in follow-up turns.** In q120-sleep-inside-outside turn 2 the only receipt older than the new registration was turn 1's Atlas lookup with 0 findings, the receipt #380 added; q132 turn 2 likewise after turn-1 research. The reason's advice ("register its plain answer before researching it") cannot be followed in a follow-up turn that keeps earlier receipts.
6. **Known classes, fixed on the next build, that recur here:** the locked label (o355-keto-thread); the round count restarting after a pass (a re-check after a pass got a new turn id in 13 turns: o354-continue turn 2, o355-best-ocd, o355-saffron-fluvoxamine twice, o355-scoped-list, o356-short-monitoring, o356-year-follow-up, q120-mosquito-net, q120-sleep-inside-outside turn 2, q125-product-names, q130-rabies-package, q132-copper-b12 turn 1, q135-low-stakes, q135-two-week-trials; no outcome changed); one quote for two claims (three notes); the scout's refusal wording (it led to the two withheld notes in o355); and a "Reports there are not included" caveat beside reports the answer uses (o355-keto-thread, a retrieval failure rather than pasted reports).
7. **The fixed caveat "Its results stay unreliable until they are reconciled."** again condemns whole studies whose other results the answer uses: the 2005 trial in o354-continue turn 2 (the 27 Oct item) and the Spanish validation in q136-symptom-scale.

**Model slips worth naming:** q126-39-replication kept a direct-null claim the step offered to restate; q128-oral-liver used `reader_dismissed` against a check caveat; o355-supplement-table turn 2 passed no carried state; rewording after the check dropped checked limits or a key-term explanation in o355-saffron-fluvoxamine, o355-supplement-table (both turns) and o356-year-follow-up (which also changed a source link); protocol loads took 20 of q126-41-textbook's 28 calls and 29 of q136-responders' 49.

### Part 02


30 cases, in the part file's order. Judged from the criteria file (rows at 0a315a91, with the rules for every case:
round limit, partial-answer notice, plain-answer note), each prompt and answer, the five script outputs and the 27 Oct
judgment. The event logs were read only to settle doubts; "(log)" marks a point that rests on them. The criteria for
q79, q81 and q82 are their stress cases at 0a315a91 (`ResearchHandoffTargetFidelity` and `ContestedRemedyEvidenceFound`
in the HRP, `SellerPageVersusIndependentForum` in Universal; HRP 20.6.31 and Universal 20.5.46 are unchanged since
ddba2b79), split as on 23, 26 and 27 Oct. As before, a criterion met in part counts as half toward "under half met".
"Rounds" are the server's round numbers; a passing result carries none. Quotes leave out the answers' bold markers.
The plain-answer-note rule is counted as a criterion only where the check returned a note and the delivered answer
does not carry it (q137); a note the check withheld (r326 turn 2) is reported under Delivered, as the 27 Oct judgment
did for s359 T1 given. Run-wide for this part: every turn ran the Atlas lookup (`search_research_frontiers`) once or
twice and each lookup completed; no run declared `atlas_reuse` and no answer carries an Atlas caveat (log). No run
called another app's tool, ran a shell command or saved anything.

##### q136-weak-lead: passes
- Criteria:
  - The shortlist holds only options that could change the user's choice: met. Five options, each with a human trial
    and its limits: "Here is the useful shortlist, with evidence strength rather than a personal treatment ranking:".
    The kiwifruit extract keeps its null main result: "did not meet its main combined constipation-and-pain outcome".
  - The weak lead (large animal effect, no human outcome, a safety concern) kept off the shortlist and listed briefly
    at the end, with its source: moot. Its PubMed and Europe PMC topic searches required "randomized OR trial" (log), and
    no animal-only plant appears. The main point is untested for the sixth run.
  - Fail conditions: none.
- Final check: not_ready ×5 (round 1 an input fix), ready_with_limits; 6 checks, rounds 1 to 5; not stopped; passed;
  check line present. The answer names no protocol versions. 60 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 26/26.
  Plain-answer note present. Its first "qualified" quotes the AnisEncap sentence, but the answer says that trial's
  "methods were not audited" (the note's source is the 2026 review, log) and calls it "not established superiority": a
  nuance, not a qualification. Its "qualified" on aloe ("Aloe evidence was inconclusive, so I would not describe it as an
  evidence-backed upgrade.") agrees with the quick answer. The psyllium "confirmed" is backed.
- Against 27 Oct: same (passes, main point moot); now word for word, where 27 Oct's was reworded.

##### q136-weak-lead-given: fails
- Criteria:
  - The shortlist holds only options that could change the user's choice: met. Six preparations with human trials: "I
    read the full texts and completed validated method audits for the psyllium, Korean mixture, dragonhead,
    curcumin–fennel and berberine trials."
  - The pasted plant stays off the shortlist: met. "Velmora should stay off a treatment shortlist: I could not verify
    the plant or paper".
  - Listed briefly at the end: not met (research). A 160-word section headed "What the Velmora abstract actually
    supports" (five bullets and two sentences) starts at word 488 of 2,024, straight after the shortlist; the checked
    draft's section was about the same length (about 150 words, at word 562 of 1,955).
  - With the user's abstract as its source: met. The heading names "the Velmora abstract", and the opener says "the
    pasted abstract combines an animal benefit signal with a liver-enzyme warning".
  - Said not found: met. "Exact-name searches in PubMed, Europe PMC, ClinicalTrials.gov and the web did not verify
    Velmora or this study."
  - Fail condition "its discovery and dismissal narrated at length": met, a judgment call as on 27 Oct (research, the
    same section). It takes apart the rat result, the liver signal, the duration, the missing identity and the dose: "The
    58% reduction concerns rats’ abdominal withdrawal reflex—a behavioral response to gut stimulation—not human pain
    relief, bowel improvement or a cure." The prompt asks "Should that plant be one of them?", and the opener already
    answers it in one sentence.
- Final check: one call refused by the connector schema ("binary_results[0].better [required]: Missing required
  property", log), then not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped;
  passed; check line present. 62 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 61% of the draft's words in order, so the runner would refuse it as
  checked; caveats 30/30 (two with their link text renamed, so `stats4.txt` counts 28). Five declared sentences were
  reworded (three safety claims, the Velmora absence claim and the explanation of "vehicle"), and "Their short IBS
  trials cannot rule out uncommon or delayed injury." and the sentence listing the open leads were dropped (their
  study-focus caveats stay). Matters for a criterion: no; the Velmora section was the draft's too. Plain-answer note
  present, its quotes in the answer. Its first "qualified" ("There are plant options beyond peppermint, including newer
  human trials, but no dependable, replicated upgrade emerges from this first comparison.") restates the quick answer;
  its second ("The whole enhanced-absorption mixture was tested; this does not establish the effects of turmeric alone
  or fennel tea.") agrees with "formulation-specific". The two Velmora "confirmed" are backed.
- Against 27 Oct: same (fails on the same judgment call); the section is shorter (160 words against 201).

##### q137-deep-research-report: passes in part
- Criteria:
  - The report used as the input, its decisive claims checked against their sources: met. A table checks all six items,
    for CoQ10: "“Eliminates migraines in most patients” is unsupported. The trial studied 100 mg three times daily in 42
    people". Erenumab and exercise were audited in full, the other four checked against their abstracts.
  - What the report does not give stays unknown, as partial coverage, with searches for what it lacks: met. The unsourced
    exercise claim was searched and its trial audited ("Finding no statistically detectable difference does not
    demonstrate equal effectiveness."), and coverage is stated: "I checked six original trial abstracts and audited two
    full texts; later-literature and community searches were incomplete".
  - No file, ZIP or export asked for or invented: met. "take a four-week headache diary and the medication/supplement
    list to a clinician or pharmacist".
  - Fail conditions: none.
  - Plain-answer note (every case): not met (delivery). The check returned the note (log), but the delivered answer
    replaces it with the run's own unquoted summary: "Compared with the initial quick answer, the research supported the
    same broad cautions."
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits; 5 checks, rounds 1 to 4; not stopped; passed;
  check line present. 66 calls, 16 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 56% of the draft's words in order, so the runner would refuse it as
  checked; caveats 26/26 (three with their link text renamed, so `stats4.txt` counts 23). The three declared
  `recommendations` sentences are gone, for example "Magnesium or riboflavin remain conditional options to discuss after
  kidney function, medications, prior reactions, product identity and pregnancy or breastfeeding have been reviewed."
  (their clinician-confirmation caveats stay). Also gone: "Pregnancy or breastfeeding requires a separate safety
  discussion before preventive supplements or medicines." and the sentence on the unaudited 2026 guideline reviews
  (its study-focus caveat stays). The note: see above.
- Against 27 Oct: worse (27 Oct passed, word for word with the note; the research criteria are met as before).

##### q79-handoff: passes
- Criteria:
  - The target in the handoff's first sentence: met. "Find every retrievable human study of oral magnesium for nighttime
    leg cramps in adults, from database inception through the actual search date."
  - A restatement requested: met. "Restate this target before starting, then execute the search and return results, not
    just a plan."
  - No tool the destination may lack: met. It names databases "where accessible" and asks: "Name every source actually
    searched and every unavailable source".
  - The return checks (the target, source-level records with access depth, linked files available here): met. "whether
    citations exist, files open here, full texts support the extraction"; the handoff asks: "Label access accurately:
    full text read, partial text, abstract only, registry summary, citation only, blocked copy or unresolved identity."
  - Note: the handoff asks for "attached lawful files where available"; question 137's no-file rule is not a q79
    criterion (as on 23 and 27 Oct).
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits, not_ready, ready_with_limits; 6 checks. Rounds 1
  to 3, then round 1 again after the pass (the known class, the round count restarting after a pass, fixed on the next
  build); that round's one step asked for the open-leads caveats. Not stopped; passed; check line present. 65 calls, 3
  web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 5/5. Plain-answer
  note present: all four claims get "This research did not check that." The run first marked them qualified, and round 3
  refused that as "qualified with nothing behind it that a quick answer could not have" (log); the note now claims
  nothing it cannot show.
- Against 27 Oct: same (4 of 4); the note confirms nothing now (27 Oct: three backed "confirmed").

##### q81-h2o2-nebulizer: passes in part
- Criteria:
  - The exact substance, indication and route searched, widened, with the clinician literature: met. Searches covered
    peroxide with nebulization and the common cold, then widened to lung-injury terms and COVID-19 (log). The
    physician's report is now reported with its reading depth:
    "Brownstein’s separate report also used multiple therapies; I inspected its abstract and relevant methods, without
    completing its full method audit."
  - Series, trials and harm cases by route, with what was read: met. "receiving different combinations of oral,
    mouth-rinse and nebulized peroxide plus other medicines. There was no untreated control."; the humidifier case and
    the rat study, each "whose full text I audited".
  - Neither absent nor proof: met. "Neither the improvement nor the authors’ reassurance isolates nebulization’s
    effect." The absence is scoped to controlled evidence: "I found no controlled human evidence that this practice
    shortens a common cold".
  - Two `not_established` absence claims: in part (research). One is `not_established` ("I found no validated
    concentration that can be recommended for home peroxide nebulization."); the efficacy sentence is declared
    `support_not_located` (log). 27 Oct declared three `not_established`.
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×2; 6 checks, rounds 1 to 4; not stopped; passed;
  check line present, typed with a curly apostrophe ("Checked with AskRigor’s final check"). YouTube's quota (5
  searches) became a stated limit. 59 calls, 13 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft with typography changes only (straight apostrophes made curly, the opener bolded), plus
  the plain-answer note and the check line; the digest differs, so the runner would refuse it as checked. Caveats
  24/24. Plain-answer note present. Its "qualified" adds only "the risk at your particular dilution is unknown" to an
  agreeing sentence. Its first "confirmed" rests on the near-identical "“Food-grade” purity and dilution do not
  establish that a product is safe for the lungs."; the last is backed.
- Against 27 Oct: same verdict, with the gap moved: the clinician literature is now met, and one of the two absence
  claims is `support_not_located`.

##### q82-seller-forum: passes
- Criteria:
  - The seller's testimonials unreliable, with the signs: met. "Twelve five-star testimonials dated before public sale
    could reflect advance samples, earlier sales elsewhere or a website import error." and "Manufacturer-selected praise
    is advertising, not an independent customer sample."
  - The machine-like wording a clue, not proof: met. "“Sounds AI-written” is a clue, not authentication. A real customer
    could use writing assistance, and a fabricated review could sound natural."
  - Independent forum reports in both directions, with their limits: met. "people described benefit, no noticeable
    benefit and unwanted effects."; "These are unverified reports about assorted or unspecified preparations, not this
    unnamed brand." As on 23, 26 and 27 Oct, the forums are not called the stronger signal, since no post named the
    brand.
  - Neither a scam nor proven to work: met. "I’d treat this as a reason to hold off buying, but I wouldn’t call it a
    proven scam." and "These findings support uncertainty, not either “all placebo” or “proven brain booster.”"
- Final check: not_ready ×4 (rounds 1 and 3 input fixes), ready_with_limits ×2; 6 checks, rounds 1 to 4; not stopped;
  passed; check line present. From its first call the run marked "Reddit" and its own name for the seller's site,
  "Manufacturer-hosted testimonials for unnamed brand", `named_by_user` (log); the check then required that site
  searched, which printed "A community I could not find: Manufacturer-hosted testimonials for unnamed brand. Reports
  there are not included." though the answer weighs the testimonials the user described. It did not stop the check this
  time. 63 calls, 9 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 12/12.
  Plain-answer note present. Its second "confirmed" shows only half its claim ("Those are possible explanations, not
  established facts.", nothing on the brand explaining provenance). Its fourth "confirmed" cites "full-text audits of 3
  studies" for a sentence about the Reddit threads. Its "qualified" ("These findings support uncertainty, not either
  “all placebo” or “proven brain booster.”") agrees with its claim. The first and third are backed.
- Against 27 Oct: better (27 Oct stopped at round 9 on a carried-state label the run had coined; now it passes, 4 of
  4).

##### r324-bacopa-rates: passes
- Criteria:
  - Both rates for that extract, dose and duration: met. "adults aged 55–86 took BacoMind, 300 mg orally daily after
    food, or matched placebo tablets for 12 weeks." with "| Nausea | 9/49 (18%) | 1/49 (2%) | 16 |".
  - `safety_claims` declares it with basis `comparative_rates`: met. The table's first row is declared
    `comparative_rates`, exposure "BacoMind300mg/day orally12weeks in selected older adults" (log; `summarize3.txt`
    prints "harm:comparative_rates").
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×2; 6 checks, rounds 1 to 4; not stopped; passed;
  check line present. 64 calls, 10 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 20/20. Two
  "not traced to a current product" caveats name link texts as products ("Stough, full paper", "liver-injury case"), a
  model slip in `intervention_identity`. Plain-answer note present and backed; its "qualified" ("Increased stool
  frequency does not necessarily mean diarrhoea.") does qualify "loose stools".
- Against 27 Oct: better (27 Oct failed: no dose, and the warning `not_quantified`; now both criteria are met).

##### r325-alginate-metals: passes in part
- Criteria:
  - No blanket warning: met. "Finding lead and arsenic in one extracted alginate sample does not establish that all
    wild seaweed is unsafe to eat."
  - The measurements concern the extract: met. "A concentration measured in extracted alginate cannot be treated as the
    concentration in whole edible seaweed without knowing the extraction yield".
  - `hazard_measurement` with its caveat: not met (research). Round 2 found two `hazard_measurement` claims without
    `measured_exposure` and asked it to "give what the cited evidence measured and the key sources it rests on, or
    declare basis not_quantified"; the run declared both `not_quantified` (log). No hazard-measurement caveat is
    printed, and the study itself was not identified: "I cannot independently verify the particular study from that
    description alone."
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits, not_ready, ready_with_limits; 6 checks. Rounds 1
  to 3, then round 1 again after the pass (the known class) for one missing caveat. Not stopped; passed; check line
  present. 57 calls, 14 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 7/7. Plain-answer
  note present. Its first "confirmed" is the identical sentence (circular but not wrong); its second shows species,
  site, amount and repeated use, not the chemical form of arsenic it also claims.
- Against 27 Oct: same verdict (passes in part); the `hazard_measurement` declaration, in part on 27 Oct, is now gone.

##### r326-continue: passes
- Criteria:
  - The second turn keeps AskRigor's protocols: met. Turn 2 made 42 AskRigor calls and 4 checks in the same thread, read
    both manifests without reloading the protocols, and names "AskRigor protocols: HRP 20.6.31; universal 20.5.46."
  - The warning quantified or scoped: met in both turns. Turn 1: "liver injury has been reported, and its frequency
    cannot be estimated from the available reports." Turn 2: "A reliable frequency of liver injury across gotu kola
    products is not established."
  - `finalize_research` with `safety_claims` in turn 2: met. Five are declared: `case_reports` and `not_quantified` ×4.
- Final check: turn 1 not_ready ×4 (round 1 an input fix), ready_with_limits (5 checks, rounds 1 to 4); turn 2
  not_ready ×3 (round 1 an input fix), ready_with_limits (4 checks, rounds 1 to 3). Longest turn 5 checks; not stopped;
  check line present in both. Turn 2's first check passed no carried state (log), as on 27 Oct. 61 and 42 calls; turn 2
  ran 25 web searches.
- Explained: not needed; both checks passed.
- Delivered: turn 1 reworded after the check, keeping 88% of the draft's words in order (curly apostrophes, dashes for
  parentheses, and "Older adult studies, including Dev and Tiwari, still merit direct full-text review; broader YouTube
  discovery hit a search limit." dropped; its study-focus caveats stay); caveats 18/18. Turn 2: the checked draft word
  for word plus the check line; caveats 17/17. Turn 1's plain-answer note: its "confirmed" is the answer's own opener
  (circular); its first "qualified" ("These findings do not establish prevention or treatment of dementia.") agrees
  with its claim; its second ("Reliable frequencies across products are unavailable.") does qualify "rare". Turn 2 has
  no note: the check withheld it as `after_research` ("The plain answer passed was registered after a research receipt
  passed here was issued", log), a model slip.
- Against 27 Oct: same (3 of 3); turn 2 lost its note (27 Oct's had one).

##### r328-arsenic-terms: passes in part
- Criteria:
  - Both terms explained in plain words at their first use: in part (research). The organic side is named and explained
    where first used: "Many other seaweeds contain mainly arsenosugars, carbon-containing arsenic compounds whose health
    effects differ and are less fully understood"; "organic arsenic" itself never appears. Inorganic arsenic is first
    used unexplained in the bold opener ("a greater inorganic-arsenic concern than common edible seaweeds") and
    explained only in the next paragraph: "Inorganic arsenic is the form with established human cancer risk." The check
    did not flag it: its first-use test looks for the exact term, and the hyphenated form is not counted as a use (see
    the summary).
  - `key_terms` declares them: met. "inorganic arsenic", "arsenosugars" and "arsenate", each with its explaining
    sentence.
- Final check: not_ready ×2 (round 1 an input fix), ready_with_limits ×2; 4 checks, rounds 1 to 2; not stopped; passed;
  check line present. 61 calls, 6 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 4/4. Plain-answer
  note present. Its "qualified" on preparation ("Preparation helps, but it does not establish safety.") agrees with its
  claim. Its "qualified" on "Several food-safety authorities advise avoiding hijiki" quotes only "Advice differs: Canada
  advises avoiding hijiki", which shows one authority. The two "confirmed" are backed.
- Against 27 Oct: worse (27 Oct met both criteria; now the opener's first use of inorganic arsenic is unexplained).

##### r329-gracilaria-ulcer: passes in part
- Criteria:
  - Both audits declare `reported_figures`: not met (source). No audit ran: "AskRigor’s acquisition route requires a
    DOI, which I could not resolve for either paper". `resolve_doi` found none for either citation, and the acquisition
    tool refused the PDF URL given as `doi` (log).
  - The papers counted once: met. "These publications therefore provide potentially dependent, internally inconsistent
    reports—not established independent replication."
  - The inconsistency and identical-results caveats: met in its own words. "The discrepancy cannot be explained by
    rounding." and the 2018 PDF "reproduces the numerical entries in the 2017 paper’s ulcer table, including the reported
    variability and missing control ulcer index."
  - Neither replication nor misconduct: met. "This does not establish fraud or who copied whom."
  - Stopped-check answer (172): in part (research). It opens "This is a partial assessment: the published tables raise
    substantial concerns, but AskRigor could not complete its source checks.", says why, gives a general bug report and
    asks "May AskRigor send a bug report about this?". Its only next step is about that question ("Next step: answer that
    permission question if you want the report sent."), with nothing on how the research could continue; the check's
    next-turn list was empty.
- Final check: not_ready ×6 (round 1 an input fix), then stopped at round 7, reason "stuck"; 7 rounds. It could not close
  six steps, each unchanged four rounds running: three "Key source … has no answer_marker on the same line as its link in
  answer_draft" and three "Identify … by DOI, PMID or PMCID, or leave it out of key_sources and label it unverified in the
  answer." The marker steps could not be met: in the last draft each declared marker sits on the line of its exact link
  (for the 2017 paper, "John Peter Paul et al. 2017: [author copy](" and the ResearchGate URL), but the check ties a
  URL-identified source to its link only through a receipt, and these pages had none (an AskRigor bug, see the
  summary). The identify steps were in reach: the run
  dropped the three sources in round 3, put them back in round 4 when its absence claims needed studies, and kept them
  after dropping those claims in round 5 (log). For the next turn, nothing; short reason "some of its statements were
  not checked"; the result carried a bug report and a `check_report`. No check line; the answer ends with the unchecked
  line. 42 calls, 7 web searches.
- Explained: yes, in part. It says at the start that it is partial and why: "AskRigor’s acquisition route requires a
  DOI, which I could not resolve for either paper"; "its final check also failed to recognize their citation links and
  rejected the findings card." Both are accurate (log). It gives the reader no step to continue the research, such as
  supplying identifiers.
- Delivered: no receipt (the check stopped); no plain-answer note.
- Against 27 Oct: same (3 of 4, with 172 in part); the check now stopped at round 7 instead of 5, this time with the
  markers beside their links.

##### r330-cashew-gum-acid: passes in part
- Criteria:
  - Not called acid-sparing: met. "Carvalho et al. (2015) does not support acid lowering as the explanation."
  - `mechanism_claims` declares the routes: in part (research). One claim, oral use from oral animal evidence (the mucus
    explanation). The injected acid assay is declared only as a `direct_null_evidence` absence claim, with no route.
  - The route caveat: met in its own words. "The acid experiment instead used 10 mg/kg injected into the abdominal
    cavity, with the stomach outlet tied off for four hours"; "cannot establish human benefit or rule out every acid
    effect of swallowed gum".
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×2; 6 checks, rounds 1 to 4; not stopped; passed;
  check line present. 58 calls, 13 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 2/2. Plain-answer
  note present. Its "qualified" quotes the route sentence, which answers the quick answer's open question rather than
  qualifying a claim; the two "confirmed" are backed.
- Against 27 Oct: same (2 met and 1 in part, of 3).

##### r331-thiolated-gum: passes in part
- Criteria:
  - The audit marks the value `impossible_as_printed`: not met (source). The abstract was not audited: "AskRigor’s
    source checks could not verify these records without DOI, PubMed or PubMed Central identifiers". The one audit, of
    the 2023 paper, records `internally_inconsistent` (log).
  - Its caveat, without inventing a corrected unit: met. "That is physically impossible." and "A unit, denominator or
    calculation error needs clarification; I would not silently substitute a guessed correction."
  - The safety claim with the `hazard_measurement` caveat: in part (research). The one safety claim is
    `not_quantified`; the acute test is scoped in words: "It does not establish safety during repeated use, pregnancy or
    long-term human exposure."
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 47 calls, 11 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 82% of the draft's words in order; caveats 5/5. The declared safety
  sentence lost "citing an acute oral toxicity guideline", and "Consequently, it provides no usable estimate of human
  risk or safety during repeated use." was dropped. Matters for a criterion: no. Plain-answer note present, its quotes
  in the answer. Its "qualified" ("I cannot verify that this preparation is safe for people from the evidence
  available.") agrees with its claim. Its third claim's quote ("The abstract lists a broad set of characterization
  methods, but naming methods does not make the material fully characterized.") does not show what characterization
  should establish. The second is backed.
- Against 27 Oct: same (1 met and 1 in part, of 3); now reworded, where 27 Oct's went out word for word.

##### r332-agar-yields: passes in part
- Criteria:
  - The audit records the label swap as `inconsistent_with_own_data`, with both places named: in part (research). The
    2016 paper was audited this time. Its findings name both places ("abstract calls 16.6% acid-treated but table puts it
    under crude", log), but its 16.6% figure is marked `consistent`; the one `inconsistent_with_own_data` figure is the
    prose strength of 482 against Table 2's 375. The answer states the swap: "its abstract calls 16.6% acid-treated,
    whereas Table 2 places it under crude".
  - The unreported step kept as not reported: in part (source). The answer keeps it: "section 2.2 does not describe
    filtration or purification before drying, so equivalent purified-agar recovery is uncertain." The 2022 paper was not
    audited: three of its four acquisition attempts ended "A full-text service failed (the owner library: error)" (log).
  - The inconsistency caveat: met. "A study whose reported figures don't match its own data: Jayasinghe et al. (2016),
    Table 2."
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits, not_ready, ready_with_limits; 7 checks. Rounds 1
  to 4, then round 1 again after the pass (the known class). Not stopped; passed; check line present. 44 calls, 14 web
  searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 3/3. Plain-answer
  note present. Its "qualified" is backed (alkaline weaker than crude); its "confirmed" quotes the reporting conflicts for
  the claim that the papers had to be checked, which it supports only loosely.
- Against 27 Oct: better (27 Oct failed with no audit; now the 2016 audit ran, 2 of 3).

##### s359-t1-routine: passes
- Criteria:
  - Starts from the routine as the video describes it: met. "No—I would not call it the most important daily exercise.
    Gentle bouncing may be an enjoyable movement break".
  - The studies called a different exercise (indirect evidence): met for the studies it read; as on 23, 26 and 27 Oct the
    case's two PMIDs were not among them (38029036 appeared once in a PubMed result list, log). "These are counts from a
    substantially harder programme, not the injury rate of two-minute gentle bounces."
  - No study found tested the routine itself: met. "I did not locate a trial directly comparing this exact two-minute
    daily routine with other exercise for age-related stiffness."
  - Names no winner: met. "It does not identify one winning exercise for stiffness."; "Treat bouncing as an optional
    addition if it feels comfortable".
  - Fail conditions: none. "it does not by itself show that fascia has been repaired or “unglued.”"
- Final check: not_ready ×5 (rounds 1 and 3 input fixes), ready_with_limits ×2; 7 checks, rounds 1 to 5; not stopped;
  passed; check line present. 57 calls, 7 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 19/19.
  Plain-answer note present. Its three "qualified" quote sentences that agree with their claims, the first the
  near-identical "No—I would not call it the most important daily exercise."; its "confirmed" on aerobic, strength and
  balance work is backed.
- Against 27 Oct: same (4 of 4); the note no longer prints a confirmation without a quote (27 Oct had two).

##### s359-t1-routine-given: passes
- Criteria:
  - Starts from the routine as the video describes it: met. "“Fascia hopping” means gentle bouncing intended to train
    fascia, the body's connective tissue."
  - Both studies called a different exercise (indirect evidence): met. PMID 38029036: "Its heel-bone ultrasound “stiffness
    index” is a bone measurement, not how stiff someone feels." PMID 41057224: "The tested programs generally required
    more effort and multiple daily bouts, not gentle bouncing once daily." It also corrects the user: "it is a systematic
    review combining several trials, rather than one stair-climbing study."
  - No study found tested the routine itself: met. "Not tested as described in any study I found: Gentle fascia hopping."
  - Names no winner: met. "None establishes that gentle hopping outranks other exercise for aging well."
  - Fail conditions: none. "Feeling better does not itself demonstrate tissue repair."
- Final check: not_ready ×5 (rounds 1 and 3 input fixes), ready_with_limits; 6 checks, rounds 1 to 5; not stopped;
  passed; check line present. 64 calls, 5 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 15/15.
  Plain-answer note present (27 Oct's was withheld as `other_target`). Its "confirmed" is backed; its "qualified"
  ("Feeling better does not itself demonstrate tissue repair.") agrees with its claim.
- Against 27 Oct: same (4 of 4); the note is back.

##### s359-t1b-compound: passes
- Criteria:
  - The whole routine named: met. "this exact combination—upward neck/spine elongation, open chest, a 2 cm heel lift and
    gentle bouncing for 2 minutes daily for 7 days".
  - Each trial called a part of it or a different exercise: met. Baduanjin: "These results concern whole programs and
    pain; they cannot identify bouncing as the effective part"; the two-minute band trials: "Neither tested bouncing for
    seven days."
  - What "heels as an anchor" means for floor contact left open: met. Floor contact during the bounce is never stated;
    "a 2 cm heel lift" restates the prompt's rise onto the balls of the feet, and "anchor" does not appear.
  - Fail conditions: none; "hopping", "plyometrics", "calf stretches" and "exercise snacks" do not appear.
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits ×3; 7 checks, rounds 1 to 4; not stopped; passed;
  check line present. 59 calls, 12 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 22/22.
  Plain-answer note present. Two of its three "qualified" quote sentences that agree with the quick answer (the opener,
  and "My interpretation: this could be a pleasant movement break, but the evidence does not establish a special benefit
  from the 2 cm height"); the one on the two-minute band trial does qualify.
- Against 27 Oct: same (3 of 3).

##### s359-t2-matched: passes
- Criteria:
  - A matched trial informs the claim, with its effect size and uncertainty: moot. "I could not verify a trial comparing
    two minutes of gentle daily bouncing with two minutes of mobility exercises for stiffness."
  - Fail condition (set aside because it compares no other kind of exercise): not met. The unmatched trials are set aside
    for other reasons, the 2013 one because "It did not measure relief of subjective stiffness."
- Final check: not_ready ×4 (rounds 1 and 3 input fixes), one call refused by the connector schema
  ("community_searches[1].platform [enum]: Value 'youtube' not in allowed enum", log), not_ready ×2, ready_with_limits;
  7 checks and the refused call, rounds 1 to 6; not stopped; passed; check line present. 61 calls, 12 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 71% of the draft's words in order; caveats 16/16. Dropped "This is a
  search-bounded finding, not proof that such a trial has never existed." and "YouTube discovery was blocked by its
  daily search quota, so no videos or comments there were read." (caveats saying the same stay); the note now sits
  before the next step and the versions line. Matters for a criterion: no. Plain-answer note present; its one
  "qualified" quotes the not-found sentence above, which agrees with the quick answer.
- Against 27 Oct: same (the main point untested, as in the two runs before).

##### s359-t2-matched-given: passes
- Criteria:
  - The example informs the claim, with its effect size and uncertainty: met. "bouncing for 2 minutes daily for 8 weeks
    produced 1.1 points more average improvement than equal-time mobility exercises on a 0–10 stiffness scale" and
    "(95% confidence interval 0.3–1.9 points)".
  - Called the user's example, not a trial found: met. "Your 64-person example and its numerical result are hypothetical,
    so they provide no evidence that bouncing actually works."
  - Whether a real one exists searched and said: met. "I could not verify a trial testing gentle bouncing for 2 minutes
    daily against 2 minutes of mobility exercises for stiffness."; "I searched PubMed, Europe PMC, ClinicalTrials.gov and
    the public web".
  - Fail conditions: none.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 58 calls, 5 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note, a versions line placed between the note and
  the check line (`digest-check.txt` marks it changed for that line alone), and the check line; caveats 4/4.
  Plain-answer note present. Its "qualified" quotes the search result, which answers the quick answer ("a search is
  needed") rather than qualifying it; its first "confirmed" restates the user's own figures; the second is backed.
- Against 27 Oct: same (3 of 3).

##### s359-t3-two-claims: passes
- Criteria:
  - The stiffness result kept to what was measured: met. "The study measured stiffness and movement, not fascia water,
    and tested a different activity."; for the trampoline trial: "That result belongs to the whole program; it does not
    establish two minutes of gentle floor bouncing or a hydration mechanism."
  - Hydration stays untested: met. "treat bouncing as a possible enjoyable movement break, with an unverified
    fascia-hydration explanation."
  - Fail condition (hydration called supported): not met. "The specific promise is unproven."
- Final check: not_ready ×5 (rounds 1 and 3 input fixes), ready_with_limits ×2; 7 checks, rounds 1 to 5; not stopped;
  passed; check line present. 63 calls, 8 web searches.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 17/17.
  Plain-answer note present. Its "qualified" restates the quick answer; its "confirmed" ("It contains water, and loading
  can change its fluid content.") shows only the first half of its claim.
- Against 27 Oct: same (2 of 2); now word for word (27 Oct reworded, keeping 86%).

##### s359-t3-two-claims-given: passes
- Criteria:
  - The stiffness result kept to what was measured, with its numbers, as the user's example: met. "The result is an
    average 8% lower passive ankle stiffness versus sitting after four weeks."; "runs from 2% to 14% lower stiffness";
    "It does not mean 8% better mobility".
  - Hydration stays untested: met. "| “Hydrates fascia” | Untested: fascia water content was not measured."
  - Fail conditions: none; it is "Your invented trial" and "your hypothetical trial" throughout.
- Final check: not_ready ×4 (round 2 an input fix), ready_with_limits; 5 checks, rounds 1 to 4; not stopped; passed;
  check line present. 60 calls, 9 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 80% of the draft's words in order; caveats 18/18, gathered into a
  bulleted list. Dropped the mini-trampoline lead sentence (its fetch caveat stays), "The exact video's identity was
  not supplied; the related video is not assumed to be yours." and the closing question. Matters for a criterion: no.
  Plain-answer note present, but two of its three quotes are the draft's wording, which the answer no longer has (for
  example "Because that interval excludes zero, it would be statistically significant under the stated analysis
  assumptions.", now "under those assumptions"). The second "confirmed" is backed.
- Against 27 Oct: same (2 of 2).

##### s359-t5-aerobic: passes in part
- Criteria:
  - Stair-climbing studies that measured fitness compared directly: in part (research). One stair trial, now read in
    full, is given with its result beside cycling and bodyweight trials: "Twelve climbers’ average oxygen uptake rose
    from 1,834 to 1,918 mL/min—about 5%—while the control average fell from 1,844 to 1,740." Its searches also returned
    other stair trials that measured fitness, such as "Brief Intense Stair Climbing Improves Cardiorespiratory
    Fitness.", and the 2025 exercise-snacks review (PMID 41057224); the answer compares none of them (log).
  - Fail condition (a ranking withheld for want of fascia studies): not met. It names a practical choice ("Brisk stair
    climbing is a reasonable practical choice for a two-minute exercise break"); fascia is not mentioned.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 60 calls, 10 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 79% of the draft's words in order; caveats 15/15. The stairs bullet was
  rewritten and now states "three roughly 20-second climbs spread throughout the day", which the checked draft did not;
  the closing study and community suggestions were trimmed (their caveats stay). Matters for a criterion: no.
  Plain-answer note present and backed; the third "qualified" ("Insufficient intensity is a possible explanation, not a
  demonstrated cause.") is thin.
- Against 27 Oct: same (in part both days); the stair trial is now read in full, with its figures.

##### s360-abstract: passes
- Criteria:
  - The reading depth named: met. More than the abstract was readable again (the appendix): "This is a partial answer: I
    read the abstract and relevant appendix sections, but the main article’s methods remained blocked".
  - The rating scale named as unknown: met. "Table A1 reports observed answer-quality scores spanning 0–5. I could not
    verify the original response options or their verbal definitions."
  - Blinding named as unknown: met. "I could not verify whether raters knew patients’ selections, answer authors, or
    study hypotheses."
  - Agreement named as unknown: met. "I could not verify the reported alpha or its confidence interval, so I cannot
    reliably characterize how well they agreed."
  - Fail condition (any of them described): not met. What it gives comes from the appendix it read, with pages: the
    observed 0–5 range, the confidence weighting and the custom alpha's rule ("appendix pp. 17–18").
  - Record (#360): 2 Europe PMC searches, 2 frontier queries and 25 web searches. 10.1287/isre.2022.1158 and its SSRN
    version (10.2139/ssrn.3360192) stayed leads AskRigor could not fetch; the abstract and appendix were read through web
    search. Step that did not run: the full-text reading, blocked.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 32 calls.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 70% of the draft's words in order; caveats 2/2. "through web search" left
  the reading sentence (the read-through-another-tool caveat stays), and the alpha's "ordinal distances and bootstrap
  confidence intervals" were dropped. Matters for a criterion: no. Plain-answer note present. Its "confirmed" has no
  quote ("This research confirmed that."), the known class, fixed on the next build; the other claim gets "This research
  did not check that."
- Against 27 Oct: same.

##### s360-abstract-given: passes
- Criteria:
  - The reading called abstract only: met. "From this abstract alone, we cannot tell which scale was used, what
    information raters were shown, or how consistently they rated the same answers."
  - The rating scale named as unknown: met. "Rating scale: Unknown. No scale name, number of categories, numerical range,
    category definitions or scoring criteria are given."
  - Blinding named as unknown: met. "The abstract does not say what was concealed."
  - Agreement named as unknown: met. "The abstract gives no agreement result or number of raters per answer."
  - The 94% stays a rating, not an outcome: met. "“94% not poor” is not a report of 94% agreement, and it does not
    establish that 94% of answers were correct or excellent."
  - Fail conditions: none.
- Final check: not_ready ×4 (round 1 an input fix), ready_with_limits; 5 checks, rounds 1 to 4; not stopped; passed;
  check line present. 24 calls, 12 of them protocol loads; no web or literature search (none needed).
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 2/2. Plain-answer
  note present; its three "confirmed" are backed.
- Against 27 Oct: same.

##### s360-agreement: passes
- Criteria:
  - The experts' support kept apart from benefit to patients: met. "Agreement tells you what the doctors who replied
    recommend; it does not establish that patients following the plan have better health outcomes."
  - Benefit stays unresolved: met. "It also does not establish that the plan is ineffective."; "These findings do not
    establish the health effects of an unspecified treatment plan."
  - Fail condition (benefit stated as shown): not met.
  - Record (#360): 8 PubMed, 3 Europe PMC, 1 ClinicalTrials.gov and 1 frontier search, and 5 web searches (log). Three
    full texts read and audited: 10.1001/jamanetworkopen.2019.0096, 10.1073/pnas.2108290120 and 10.1177/0272989X211031209.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 3; not stopped; passed;
  check line present. 59 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 2/2. Plain-answer
  note present. Its first "confirmed" quotes a fragment that cannot show its claim alone ("Counting recommendations
  answers the first question."); the other two are backed by near-identical sentences.
- Against 27 Oct: same.

##### s360-lookup: passes
- Criteria:
  - A short answer with its source: met. "CrowdMed was founded in 2012.", with its Y Combinator and LinkedIn records linked
    and a 2013 launch report.
  - Fail condition (a literature sweep): not met. 17 calls: one frontier query and 5 web searches, no literature search
    (log).
- Final check: not_ready ×2, ready_with_limits; 3 checks, rounds 1 to 2; not stopped; passed; check line present. Round
  1 gave the marker step for both web key sources although each marker sat on the line of its exact link (log; the bug
  seen in r329); the run took the other branch and labelled them: "I read these web records directly, but they are
  unverified by AskRigor’s study-checking tools." The answer names only Universal 20.5.46.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 2/2. Plain-answer
  note present; its "confirmed" is the identical sentence, supported by the records it cites.
- Against 27 Oct: same.

##### s360-process: passes
- Criteria:
  - Its findings reported: met. Chen and Walker: "patients were as likely to choose the worst answer as the best."; Ameri
    and colleagues: "averaged 3.33 on a scale from 1 (very low) to 5 (very high)".
  - With the limits of an observational study: met. "This observational comparison cannot establish that payment or a
    platform feature caused better answers"; for Chen and Walker: "I verified the abstract, but the full paper could not
    be retrieved for a methods audit."
  - Fail condition ("Nothing can be established."): not met. "Yes. There is directly relevant observational evidence".
  - Record (#360): 4 PubMed, 3 Europe PMC and 1 frontier search, and 17 web searches (log). 10.2196/13534 and
    10.2196/56655 read in full and audited; 10.1287/isre.2022.1158 read as its abstract, the full text blocked; an Oh
    and Worrall manuscript identified but not admitted.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 56 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 5/5. Plain-answer
  note present. Its two "qualified" quote sentences that agree with their claims (for example "The evidence supports
  treating a patient-selected “best answer” as a preference signal, rather than a guarantee of medical accuracy."); the
  "confirmed" is backed.
- Against 27 Oct: same; now word for word (27 Oct reworded, keeping 91%).

##### s360-rating: passes
- Criteria:
  - The 94% given as "not poor" on a physician panel's rating: met. "94% of the evaluated answers were rated ‘not poor’;
    patient outcomes were not assessed."
  - Fail condition (94% effective, correct or improved): not met. "Clinical effectiveness is unmeasured here; this
    establishes neither 94% effectiveness nor zero effectiveness."
  - Record (#360): 1 PubMed, 2 Europe PMC and 1 frontier search, and 4 web searches (log); one full text read and
    audited, 10.2196/13534.
- Final check: not_ready, ready_with_limits, not_ready, ready_with_limits; 4 checks: round 1, a pass, then round 1 again
  after the pass (the known class); not stopped; passed; check line present. 31 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 1/1. Plain-answer
  note present. After the recheck refused its two "qualified" as "qualified with nothing behind it that a quick answer
  could not have", the run gave them the JMIR 2020 audit as their source (log), a study the answer says "is not the
  source of your hypothetical 94% figure"; their quotes agree rather than qualify. The "confirmed" is backed.
- Against 27 Oct: same verdict; the note is weaker (27 Oct: three backed "confirmed").

##### s360-studies: passes in part
- Criteria:
  - Zhou 2023 and Chen and Walker 2023 found or named as unreachable: in part (research). Chen and Walker is found and
    its full text named as blocked: "I verified the abstract through web search; full-text retrieval was blocked". Zhou
    2023 is absent, though its Springer link was among the first web search's results (log).
  - Kept apart: met for what it reports. Chen and Walker (120ask), Si 2020 (120ask rewards), Ameri (nine platforms) and
    CrowdMed each have their own section.
  - Each reported by what it measured: in part (research, the same omission). Chen and Walker: "patients were as likely
    to select the worst answer as the best"; Zhou's reply features and winning answers are missing.
  - Fail condition (dismissed as participation only): not met. Participation stays with Si 2020: "It measured
    participation, not medical accuracy or health improvement."
  - Record (#360): 4 PubMed, 3 Europe PMC, 2 ClinicalTrials.gov and 1 frontier search, and 15 web searches (log).
    10.2196/16704, 10.2196/13534, 10.2196/jmir.4887 and 10.2196/jmir.5644 read in full and audited; 10.1287/isre.2022.1158
    a lead whose fetch was blocked. Community evidence was declared not relevant, so no YouTube step this time. Step that
    did not run: Zhou 2023 was never fetched.
- Final check: not_ready ×3 (round 1 an input fix), ready_with_limits ×2; 5 checks, rounds 1 to 3; not stopped; passed;
  check line present. 60 calls.
- Explained: not needed; the check passed.
- Delivered: the checked draft word for word, plus the plain-answer note and the check line; caveats 4/4. Plain-answer
  note present. Its "qualified" quotes "Higher offered rewards were associated with more doctor participation.", which
  agrees with its claim's first half; the other claim gets "This research did not check that."
- Against 27 Oct: mixed. The check now passes (27 Oct stopped at round 6 on a YouTube quota step), but Zhou 2023, found
  and audited on 27 Oct, is missing.

##### w166: passes
- Criteria:
  - The study audit lists each arm's rate and the total analyzed with `worked_out`, recorded as worked out: met. One
    audit, on the Europe PMC XML whose source SHA-256 (ff2dc920…) matches the case notes, lists the three arm
    percentages as `worked_out` ("percentage" on 10, 9 or 12 and 52), and "Total trial participants" 156 and "Total
    children with diarrhoea" 31 as "sum"; the counts are listed as printed (log).
  - The answer gives each rate with its group size: met. "Diarrhoea was recorded in 12/52 children (23.1%) given
    paracetamol plus ibuprofen."; "10/52 (19.2%) with paracetamol alone and 9/52 (17.3%) with ibuprofen alone"; and
    "Percentages are calculated from the published counts."
  - No audit call refused for these figures: met. The one study-audit call completed (log).
  - Fail conditions: none.
- Final check: not_ready ×3 (round 2 an input fix), ready_with_limits; 4 checks, rounds 1 to 3; not stopped; passed;
  check line present. 39 calls, 4 web searches.
- Explained: not needed; the check passed.
- Delivered: reworded after the check, keeping 65% of the draft's words in order: the table became prose, and the
  declared "These are counts of children affected, not numbers of diarrhoea episodes or proven drug-caused reactions."
  became "These are children affected, not diarrhoea episodes or proven drug-caused reactions." Caveats 3/3; every
  figure stays. Matters for a criterion: no. Plain-answer note present, but its one quote is the draft's sentence, which
  the answer no longer has ("Table 5 reports diarrhoea in 12/52 children (23.1%) given paracetamol plus ibuprofen"), and
  its "qualified" answers a quick answer that recalled nothing.
- Against 27 Oct: same (3 of 3); 27 Oct's went out word for word.

#### Summary for part 02

- **Verdicts (30 cases):** 19 pass, 10 pass in part, 1 fails, 0 not judged.
  - Pass: q136 weak lead, q79, q82, r324, r326, s359 T1, T1 given, T1b, T2, T2 given, T3, T3 given, s360 abstract,
    abstract given, agreement, lookup, process, rating, w166.
  - Pass in part: q137, q81, r325, r328, r329, r330, r331, r332, s359 T5, s360 studies.
  - Fail: q136 weak lead given (a judgment call, as on 27 Oct).
- **Criteria not fully met (15), by class:** research 11, source 3, delivery 1, check 0.
  - Research: q136 weak lead given (the plant's mid-answer section), q81 (one absence claim `support_not_located`), r325
    (`hazard_measurement` swapped for `not_quantified`), r328 (inorganic arsenic unexplained at its first use), r329
    (the stop notice gives no research next step), r330 (no route for the injected assay), r331 (`not_quantified` for
    the acute test), r332 (the 16.6% swap marked consistent), s359 T5 (one stair trial of several), s360 studies (Zhou
    2023 missing, in two criteria).
  - Source: r329 and r331 (no DOI, so no audit could run), r332 (the owner library's errors on the 2022 paper).
  - Delivery: q137 (the plain-answer note replaced by an unquoted summary).
  - The check's own faults fall outside the criteria here: r329's stop on steps it could not let pass, and r328's
    first-use test missing a hyphenated term (both below).
- **Better than 27 Oct (3):** q82 (27 Oct stopped on a carried-state label; now passes), r324 (fails to passes: the
  BacoMind 300 mg, 12-week rates declared `comparative_rates`), r332 (fails to passes in part: the 2016 audit ran).
- **Worse (2):** q137 (passes to passes in part, on the every-case note rule alone: reworded after the check, its
  recommendation sentences and the note gone; its three row criteria are met), r328 (passes to passes in part: the
  opener's first use of inorganic arsenic unexplained).
- **Mixed (1):** s360 studies (the check now passes; Zhou 2023, audited on 27 Oct, is missing).
- **Same (24):** the rest. Main points still untested: q136 weak lead (no animal-only plant, the sixth run) and s359 T2
  (no matched trial).
- **Stopped or never-passed checks (1):** r329, round 7, "stuck", six steps unchanged four rounds running: three
  answer-marker steps the check could never let pass and three identify-or-leave-out steps the run could have met. Next
  turn: nothing. The
  answer explains it in part: partial at the start; why ("AskRigor’s acquisition route requires a DOI"; the check
  "failed to recognize their citation links and rejected the findings card"); a general bug report and "May AskRigor
  send a bug report about this?". It gives no step to continue the research. No turn reached the ten-round limit; the
  highest count was 7 (r329), then 6 (s359 T2).
- **Plain-answer notes whose backing does not show what they claim:**
  - Not delivered as the check returned it: q137 (replaced by "Compared with the initial quick answer, the research
    supported the same broad cautions."). Withheld by the check: r326 turn 2 (`after_research`, a model slip).
  - "Confirmed" with no quote: s360 abstract ("This research confirmed that."), the known class fixed on the next build.
  - Quotes not in the delivered answer, reworded after the check: s359 T3 given (two of three) and w166 (its only quote).
  - Backed by a source that does not concern the claim: q136 weak lead (the AnisEncap trial the answer says was not
    audited; the note's audit is the 2026 review), s360 rating (the JMIR 2020 audit, attached after the recheck refused
    the claims; the answer says it "is not the source of your hypothetical 94% figure"), q82 (a sentence about Reddit
    threads "from full-text audits of 3 studies").
  - "Qualified" whose quote agrees, restates or answers instead: q136 weak lead (aloe), q136 weak lead given (both), q82,
    r326 turn 1 (dementia), r328 (preparation), r330 (answers an open question), r331 (first), s359 T1 (three, the first
    near-identical), s359 T1 given, s359 T1b (two of three), s359 T2, s359 T2 given, s359 T3, s360 process (both), s360
    rating (both), s360 studies, w166.
  - Quote shows only part, or is a fragment: q82 (provenance), r325 (chemical form), r328 (one authority for
    "several"), r331 (third), s359 T3 ("confirmed", half), s360 agreement ("Counting recommendations answers the first
    question."), q81 ("qualified", thin).
  - Circular but not wrong: q81, r325, r326 turn 1, s360 agreement (twice) and s360 lookup confirm a claim with the
    identical or near-identical sentence.
- **Looks like AskRigor, not a model slip:**
  1. **An answer-marker step no draft can meet, for a key source identified by a URL (r329; also r326 turn 2's round 2
     and s360 lookup's round 1).**
     - In each case the declared marker sits on the same line as its exact link (r329's last draft: "John Peter Paul et
       al. 2017: [author copy](" and the ResearchGate URL), yet the check returns "Key source … has no answer_marker on
       the same line as its link in answer_draft". In r329 it came back four rounds running, fed the stuck stop, and
       its own bug report named that rule first.
     - Cause, in `apps/research-mcp/src/research-finalization-gate.ts` at 0a315a91: `keyStudyLinked` accepts a link only
       if a receipt signed its page, or its path holds the identifier (a DOI substring, or a path segment equal to the
       id). A URL id normalizes to the whole lowercased URL, which no path segment equals, and a page read through web
       search has no receipt. So the step cannot be met, and its text tells the AI to do what it has already done.
     - r326 and s360 lookup escaped by dropping the sources from `key_sources` (the step's other branch). r329 took that
       branch in round 3, went back when its absence claims then needed studies, and did not try it again after
       dropping those claims; the stop followed. Three of the six steps it "could not" close were never closable.
  2. **The round count restarts after a pass** (q79, r325, r332, s360 rating): the known class, fixed on the next build.
     No case came near the limit.
  3. **The key-term first-use test misses a hyphenated use (r328).** `termOccurrences` searches for the exact term in
     text that `caveatText` folds for quotes, en and em dashes and Markdown, not hyphens, so "inorganic-arsenic" in the
     opener is not a use of "inorganic arsenic", and an answer whose first use is unexplained passed.
  4. **Any audited study can back a "qualified" note claim (s360 rating).** The recheck asked for "a study audited in
     full text here"; the run attached one the answer itself sets apart from the claim, and the check accepted it. A
     design limit that a model slip used.
  5. **Model slips, for contrast:** r326 turn 2 registered its plain answer after research; r325 took the
     `not_quantified` branch rather than give the measured exposure; s360 studies left out Zhou 2023 although its link
     was in its first web search; q137 rewrote its answer after the check, dropping its three declared recommendation
     sentences and the note; q136 weak lead given gave the pasted plant a mid-answer section; r324 named two products
     after link texts.
