# Owner regressions, 22 Oct 2026: judgment

Build 71f09f63 (HRP 20.6.29, Universal 20.5.46), release #358. 65 cases in 76 runs through Codex with the ChatGPT app,
01:36:36 to 07:18:16 UTC, three at a time: the 50 cases of 21 Oct and the 15 new rows of the regression list (the OCD
reports #354 to #356 and lessons #47 and #48). The app's tool list was current: at 01:36:36 it named build 71f09f63 with
both versions, listed 33 tools and had every new final-check field (`connector-probe-refresh-1.md`). Criteria:
`docs/owner-regressions.md` at 71f09f63 and the HRP stress cases it names. Judged by three Claude helpers, a third of
the cases each, from each answer (`out/`), `summarize3.py`'s output (`/tmp/summary-20261022.txt`), `tools/stats4.py`'s
counts (`/tmp/stats-20261022.txt`) and `digest-check.py`'s comparison (`/tmp/digest-20261022.txt`). The event logs
stayed on the laptop, where two exact scripts read them: `change-kinds.py` (how each delivered answer differs from the
draft its own check passed, and whether the check's caveats survived word for word) and `after-check-details.py`
(failed calls, the scout's statuses, and each figure added or dropped after the check, with its sentence). The session
checked the helpers' quotes against the answers (310 of 328 word for word; the other 18 quote the check's steps,
checked drafts or 21 Oct's answers, as they say) and their account of each change against the exact comparison.

**Method.** As on 21 Oct: each criterion is met, in part or not met, by meaning, with a short quote; a declaration and
the answer's statement count separately where the owner separates them; a criterion about something the run never
used counts as met (moot). A criterion on a declaration the summary does not print (`harm_screen`,
`user_observations`, `proposed_tests`, a correction's `report`, `binary_results`, carried state) is not judgeable
unless a caveat it triggers shows it, and counts on neither side. Loads: `load_protocol` calls (Universal, HRP).
Calls: AskRigor calls. **Verdict:** passes = every criterion met and the final check passed (or was held only by a
harness artifact), with the check line when it passed; fails = under half met, or the answer meets one of the case's
own fail conditions; otherwise passes in part. **Against the checked draft (exact):** `change-kinds.py`'s comparison
for each turn whose own check passed, after the check's own closing lines are taken out: the draft unchanged;
formatting only (emphasis, heading, quote, list and table markers, link text, white space); the draft with text added;
or reworded, with the share of the draft's words the answer keeps in order.

**Overall.** Every answer names HRP 20.6.29 and Universal 20.5.46 except q126 #41, which names only Universal. No run
called another app's or server's tool, and none ran a shell command. 349 final-check calls, none rejected (21 Oct:
248). 55 of the 65 cases ended `ready_with_limits` (none `ready`); both book cases, i45, l24, l31, o354 continue, o355
keto thread, o355 saffron and r329 ended `not_ready`, and q130 maker never reached the check: OpenAI's
biological-risk filter refused it at 05:25:29 UTC after 26 AskRigor calls, as it refused the case's first run on 21 Oct
(not rerun). The YouTube scout ran again (24 searches completed); YouTube's daily search quota stopped 12 searches.
Most delivered answers were changed after their check passed (finding 1), and the check deadlocked in three ways
(finding 2).

## l22-kelp-iodine (lesson #22)
- **Loaded:** yes (3, 9). **Executed:**
  - Amounts per serving: in part; per gram only. "Thus, 1 gram could supply 1.2–3 milligrams"; "the useful
    information is **iodine per prepared serving**"
  - Meals apart from supplements: met. Forum reports "concerned supplement or bundled-program use"; "Sea-moss reports
    were excluded."; tablets and single meals kept apart.
  - Rate at that intake, or unknown: met. "How often harms occur with occasional edible kelp wasn't quantified in the
    sources found here."
  - Conflicting evidence: met as on 21 Oct; the reassuring tablet and single-meal studies beside the TSH fall after
    stopping and the 40–80 mg-a-day case, not called a conflict.
  - Higher-risk people and tests: in part. "Thyroid disease or nodules, pregnancy or breastfeeding, childhood, and
    medicines affecting the thyroid warrant individual dietary advice"; no test for the user.
  - No blanket avoidance: met. "**Occasional edible kelp is not automatically unsafe"
  - `safety_claims` basis: met (`not_quantified`, `case_reports`), with "Case reports show that this harm can happen,
    not how often it happens."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 58 calls, 11 web searches; all 19 caveats; saved ARF-0121, named in the answer.
  - Changed after the check: bold opening, the per-gram sum reworded; per gram either way, so no criterion changes.
- **Against the checked draft (exact):** reworded, keeping 67% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (5 + 2 part / 7).

## l23-long-term-medicine (lesson #23)
- **Loaded:** yes (3, 12). **Executed:**
  - No endorsement before reconciliation: met. "**The trial alone is not enough reason to start it.**"
  - Non-drug options: not met; only "alternatives that fit it" among the prescriber's review items.
  - Short trials' limits: met; the 12-week trial's dosing, then "For use over months or years, your balance of lasting
    benefit and persistent harm remains unknown."
  - Long-term numbers unknown: met; the same sentence, beside the short-term "about 12 percentage points".
  - Stopping effects: met. "Withdrawal can include nausea, headache and sleep disturbance"
  - `recommendations` `unresolved` with open inputs: met (`unresolved`).
  - Review caveat: met. "Amitriptyline needs a clinician’s review of the proposed drug and dose, the earlier reaction,
    psychiatric history"
  - New rules seen: "It was funded by the US National Institutes of Health, with industry supplying escitalopram"
    (question 130); the label's serious harms, "severe allergic reactions" among them (question 128).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 61 calls, 16 web searches; all 17 caveats; saved ARF-0122.
  - Changed after the check: the placebo, funding and pantoprazole sentences reworded; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 91% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (6/7, still no non-drug option).

## l24-practitioner-corpus (lesson #24)
- **Loaded:** yes (3, 10). **Executed:**
  - Recoveries and non-responses lead, with source and uncertainty: met. "twenty patient-reported dramatic recoveries
    and six non-responses"; "these counts cannot supply a cure rate"
  - Unreadable comments reported: met. "**The unread comments:** Their contents and direction remain unknown."
  - Unrelated record left out: in part; a bullet keeps it ("**The registry:** The unrelated probiotic blend ...
    supplies no outcome evidence for the botanical treatment"), and the next step asks for its "registry identifier".
  - Visible recovery apart from laboratory clearance: met. "Reported recovery also needs to be distinguished from
    laboratory-confirmed fungal clearance"
- **Finalized:** not_ready (4 calls, 4 not_ready, 0 rejected): an address and a web search for "Unidentified
  publication comments", and caveats left out or paraphrased ("Only one community seems to discuss this..." is
  missing); check line no; no check passed (ends with the unchecked line, typed with a curly apostrophe, so the
  digest reads "no"); 21 calls, 2 web searches.
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** worse (3 + 1 part / 4 both days; the check, then ready_with_limits, is
  now not_ready).

## l25-columns-passages (lesson #25)
- **Loaded:** yes (4, 19). **Executed:**
  - 7% for A and 40% for B, populations and denominators: met. "**The table’s reported rate for compound A is 7%—about
    7 in 100 people under the study conditions.**"; "B’s **40%** does not change A’s reported rate."; "uncertain
    without sample sizes, dose, follow-up, symptom assessment methods"
  - 12% a share of passages: met. "The **12%** counts selected passages, not people."
  - `share_of_reports` with its caveat: in part; no `safety_claims` declared, the caveat's meaning in the answer.
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 48 calls, 3 web searches; both caveats, one a figure-mismatch sentence for a methods study cited
  only for its counting point; saved ARF-0123.
  - Changed after the check: the 12% and methods-study sentences shortened; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 80% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (2 + 1 part / 3), in 48 calls instead of 27.

## l26-chills-onset (lesson #26)
- **Loaded:** yes (5, 23). **Executed:**
  - Before, during and after onset: met. "1. **Before onset:**", "2. **During the chills:**", "**Afterward:**"
  - Ranked: in part; a lead ("start with a comfortable room, removable layers and rest"), then phases, and "it does not
    rank the options".
  - Untested ones labelled: met. "These are comfort suggestions. For rest, breathing, movement and warm drinks, I
    cannot assess effectiveness against these particular chills."
  - Overheating warning: met. "Do not keep adding heat because shaking continues."
  - Not only a blanket afterwards: met.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording, layout); 52 calls, 4 web searches; all 19 caveats, the unblinded-test sentence again though no
  test is proposed; template breaks "Comfort measures depends on" and "did not research Preventive medicines"; saved
  ARF-0125.
  - Changed after the check: the unblinded caveat moved into "Afterward", the evidence paragraph reworded; no
    criterion affected.
- **Against the checked draft (exact):** reworded, keeping 59% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (4 + 1 part / 5).

## l27-herbal-tea (lesson #27)
- **Loaded:** yes (5, 14). **Executed:**
  - Advice apart from outcomes: met. "Endorsements, not six demonstrated successes."
  - Nausea apart from chills: met. "Possible benefit for nausea; no reported chills relief."
  - Natural resolution apart from tea: met. "Natural recovery can explain apparent improvement."
  - No success rate: met. "We cannot calculate a response rate"
  - `thread_selection` given: met; communities searched again, four `community_searches` with `outcome_keyword`.
  - Its caveat: met. "The r/herbalism threads that I read were found by searching for outcomes, so they show which
    experiences people report, not how common each one is."
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 51 calls, 10 web searches; all 16 caveats; saved ARF-0124.
  - Changed after the check: bold opening, one evidence sentence reworded, a versions line added; no criterion
    affected.
- **Against the checked draft (exact):** the checked draft with text added.
- **Verdict:** passes. **vs 21 Oct:** better (6/6 against 4/6): the community search and its declaration are back.

## l28-borrowed-mechanism (lesson #28)
- **Loaded:** yes (3, 17). **Executed:**
  - Narrowed skin vessels stay a hypothesis: met. "That observation cannot tell us the direction of a skin blood-flow
    response or explain why chills occur."
  - Y not recommended as prevention: met. "**Unknown. Y’s effect on X-related chills remains unresolved.**"
  - `mechanism_claims` with the animal evidence and the tissue difference: not met (none declared).
  - Both caveats stated: in part; in the answer's own words ("Y relaxed isolated vascular muscle—the muscle in
    blood-vessel walls, studied outside the intact body."), the check's caveats absent because nothing was declared.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (versions line); 47 calls, 0 web searches; the one caveat; saved ARF-0126.
  - Changed after the check: only a versions line inserted before the check's lines; no criterion affected.
- **Against the checked draft (exact):** the checked draft with text added.
- **Verdict:** passes in part. **vs 21 Oct:** same (2 + 1 part / 4), in 47 calls instead of 21.

## l29-corrected-mapping (lesson #29)
- **Loaded:** yes (4, 11). **Executed:**
  - Headline, table and chart carry the corrected rate: met. "**coldness was 7% for compound A and 40% for compound
    B**"; a corrected table and a "Replacement chart".
  - What changed: met. "I retract the earlier attribution of 40% to A."; "**40 − 7 = 33 percentage points**"
  - `corrections` declared: met (`by_user`).
  - Verified findings stay: met; only the attribution is withdrawn, and "These figures alone do not establish which
    compound is safer overall."
  - Comments gap a limit: met. "The earlier video-comment failure leaves those reports unassessed; it does not show
    that adverse experiences were absent."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (blank lines); 23 calls, 0 web searches; all 3 caveats; the bug-report question and "Nothing has been
  sent."; no card.
  - Changed after the check: three blank lines added; the text is the checked draft.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes. **vs 21 Oct:** same (5/5).

## l30-form-specific-forum (lesson #30, corrected row)
- **Loaded:** yes (1, 12). **Executed:**
  - No one in the first thread took form A: met. "I found **0 explicit copper(I) users** in the accessible comments"
  - Its marker values apart from any effect of A: met. "It cannot tell us whether copper(I) helped or failed."
  - The second thread as one person's A against a liver supplement: met. "one clearly identified copper(I) user
    reports improved anhedonia"; "following unsuccessful beef-liver supplements"; "a different, incompletely
    characterized comparator"
  - `report_identity` given: met (r/Copper_deficiency 0 read; r/anhedonia 3 read, 1 exact).
  - Zero-firsthand caveat: met, now the check's own sentence. "In r/Copper_deficiency, no one described their own use
    of copper(I), so its reports are not evidence about it."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (layout); 62 calls, 15 web searches; all 18 caveats; saved ARF-0127.
  - Changed after the check: caveat sentences joined into paragraphs; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 87% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (5/5).

## l31-dose-changed-switch (lesson #31)
- **Loaded:** yes (1, 11). **Executed:**
  - Both named communities searched: met; Longecity's 38-post thread and "all 422 accessible comments and replies"
    under three YouTube videos.
  - `named_by_user`: met (Longecity, YouTube).
  - The switch not counted as a comparison of the forms: met. "changed both form and dose"; "it would not isolate
    oxidation state"
  - `comparison_claims` gives both doses: met (6 mg/day against 0.9 mg/day).
  - Dose caveat stated: met. "The reports comparing copper(II) with copper(I) changed the dose as well"
  - The report naming no form left out: met. "The other person’s unspecified copper cannot be assigned to either
    form."
  - No follow-up measurement said: met. "**zero documented post-switch ceruloplasmin measurements**"
  - The check passes and the answer ends with its line: not met; not_ready.
- **Finalized:** not_ready (5 calls, 5 not_ready, 0 rejected): one YouTube search stopped by the quota, and the
  coverage check still `continue_research`; check line no; no check passed (ends with the unchecked line); 70 calls,
  28 web searches; no card.
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** same (7/8, not_ready for depth reasons again).

## l32-negative-controls (lesson #32, two turns)
- **Loaded:** yes (1, 11; turn 2: 0, 1). **Executed:**
  - The site that did nothing kept as evidence: met. "the forearm result weighs against a simple smell-only account"
  - Smell and cold results as evidence against (turn 2): met. "Your added controls make **smell alone and cooling
    alone less convincing explanations**."
  - Explanations ranked by fit: in part; turn 1's fit table, but "These are possibilities to discriminate, not an
    evidence-based probability ranking.", and turn 2 leaves the rest unranked ("Neither absorption, a particular
    nerve pathway, nor expectation wins by elimination.").
  - No smell or cold test again without its difference: met. "I would not repeat those unchanged controls."
  - A test that tells the rest apart: met; coded conditions A, B and C at both sites. "This differs from your
    previous forearm comparison because both sites are treated on each occasion and you are not told where the
    vinegar went."
  - `user_observations` lists the null comparisons: not judgeable (not in the summary); the answer lists "no
    improvement after forearm application; none from bottle-smelling; and none from a cold neck cloth".
  - `proposed_tests` marks no repeat without a `difference`: not judgeable (not in the summary); the answer states
    the difference (above).
- **Finalized:** ready_with_limits in both turns (7 calls, 6 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes; turn 1 changed after the check, turn 2 same as checked; 64 and 12 calls, 15 and 3 web searches; all 22 and 4
  caveats; saved ARF-0128 and ARF-0130.
  - Changed after the check (turn 1): opening reworded, the three-column fit table recast as two columns; no criterion
    affected as far as shown.
- **Against the checked draft (exact):** turn 1: reworded, keeping 68% of the draft's words in order; turn 2: the
  checked draft, unchanged.
- **Verdict:** passes in part. **vs 21 Oct:** worse (4 + 1 part / 5 judged against 7/7): the explanations are no
  longer ranked.

## l33-withdrawn-report (lesson #33, two turns)
- **Loaded:** yes (3, 12; turn 2: 0, 2). **Executed:**
  - The friend's report treated as uncertain: met. "your friend’s uncertainty about any effect—not two clear
    responses pointing in opposite directions"
  - No opposite-responder group: met. "**It substantially weakens the “opposite responses” explanation.**"
  - Not counted as no effect: met. "**Do not turn “unsure” into “no effect.”**"
  - The change in the explanation stated: met. "**Drop your friend’s report as evidence of peppermint-induced
    drowsiness.**"
  - `user_observations` `uncertain`: met; the check's caveat for an uncertain report fired (the field is not in the
    summary).
  - Its caveat: met. "A report its source is no longer sure of counts neither for nor against an effect (Friend
    reported drowsiness after peppermint oil rub on temples for afternoon focus)." The label no longer says
    "Fictional".
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes; both turns changed after the check; 64 and 7 calls, 14 and 0 web searches; every caveat (two with renamed link
  text); saved ARF-0129 and ARF-0131.
  - Changed after the check: rewording; turn 2's points recast as three bullets, same content; no criterion affected.
- **Against the checked draft (exact):** turn 1: reworded, keeping 59% of the draft's words in order; turn 2:
  reworded, keeping 58% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (6/6).

## l34-unblinded-self-test (lesson #34)
- **Loaded:** yes (2, 11). **Executed:**
  - The score as how they did that day: met. "It shows a three-point improvement on that occasion; what caused it
    remains uncertain."
  - Expectation, effort, practice and normal variation named: met. "Practice, different test items, sleep, caffeine,
    distraction, effort"; "expectation could change attention or effort"; "ordinary test variation"
  - A blinded comparison for cause: met. "repeated sessions assigned by chance to the exact balm or a suitable
    control"; "Concealing assignment and checking participants’ guesses matters"
  - An expectation-driven change called real: met. "that would be a real performance change. It does not follow that
    the result was “just placebo.”"
  - `proposed_tests` and the unblinded caveat: met; only a concealed test, and "Simply repeating an unblinded test
    would still measure performance without establishing why it changed." (field not in the summary; no unblinded
    caveat fired).
  - New rule seen: "Procter & Gamble funded it and helped with aspects of its design." (question 130).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording, order); 63 calls, 10 web searches; all 18 caveats; saved ARF-0132.
  - Changed after the check: bold opening, the expectation paragraph moved up; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 55% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (5/5).

## l35-own-use-benefit (lesson #35)
- **Loaded:** yes (2, 10). **Executed:**
  - The report weighed at its level: met. "They indicate perceived benefit and tolerability so far, without
    establishing what caused the improvement or predicting future tolerance."
  - The exposure pinned down: met. "tell me the bottle’s acidity, your vinegar-to-water ratio, approximate
    amount/area, and whether you rinse it off or leave it under clothing"
  - Possible irritation apart from what was measured: met. "These were forearm soaks, which cannot supply a risk
    percentage for your inner-thigh dabbing."
  - Signs to stop or seek care: met. "If persistent redness, burning, tenderness, peeling or blisters appear, stop
    applying it and rinse it off; suspected burns, open skin or persistent pain need prompt medical advice."
  - Neither a blanket ban nor blanket approval: met. "an exposure-specific concern about skin injury, without
    establishing that every diluted application is dangerous"
  - `safety_claims` with basis: met (`case_reports`, `observed_rates`, `not_quantified`).
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (emphasis); 60 calls, 8 web searches; all 23 caveats; 61 YouTube comments read; saved ARF-0134.
  - Changed after the check: bold opening and labels, and sentences reworded (the 2019 forearm study and the
    2012 burn report kept); no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 83% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (6/6).

## l36-mechanism-inquiry (lesson #36)
- **Loaded:** yes (3, 11). **Executed:**
  - The explanation stays the task: met. "the site is part of the exposure"
  - Exact preparation, route, onset and duration researched: in part; route and onset ("Some channel responses
    occurred within seconds."; "delivery into intact neck skin"), "Exact dilution, contact time, precise neck
    location" asked for, the day-long duration not addressed.
  - The next discriminating test: met. "repeated, randomized vinegar-versus-carrier application at both sites, with
    odor and application conditions controlled"
  - Safety proportionate and beside it: not met; no safety information, as on 20 and 21 Oct.
  - No generic avoidance advice: met.
  - No test already run: met. "This describes a research design, not a request to repeat your existing controls"
- **Finalized:** ready_with_limits (7 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (layout); 55 calls, 9 web searches; all 23 caveats; `mechanism_claims` declared (cells and animals;
  people); template break "Another pass would take About 20–40 minutes"; saved ARF-0133.
  - Changed after the check: caveat and focus sentences regrouped into paragraphs; no criterion affected.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes in part. **vs 21 Oct:** better (4 + 1 part / 6 both days; the check, then not_ready, now
  passes).

## l37-confirmed-correction (lesson #37)
- **Loaded:** yes (5, 8). **Executed:**
  - The specific error acknowledged: met. "I missed both results and wrongly recommended repeating the smell test; I
    retract that recommendation."
  - A short general report: met. "When a user has already reported that a comparison produced no effect, AskRigor
    should retain that result" ... "because doing so ignores available evidence."
  - The bug-report question in the same reply: met.
  - Nothing sent: met. "No bug report has been sent."
  - `corrections` with `by_user` and `report`: met for `by_user`; the summary does not show the `report` field.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (emphasis, layout); 18 calls, 0 web searches; all 3 caveats; no card.
  - Changed after the check: a bold sentence, the report set as a quotation, "No bug report has been sent." on its
    own line; no criterion affected.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes (the `report` field unseen). **vs 21 Oct:** same (5/5).

## l47-onset-first (lesson #47: `OnsetBeforeMechanisms`, new)
- **Loaded:** yes (4, 13). **Executed:**
  - Acute danger excluded first: in part; the first question takes in "dizziness/breathlessness", but the urgent
    signs come after the mechanisms: "Chest pain, fainting, severe breathlessness, sudden weakness or trouble
    breathing/swallowing need urgent assessment."
  - Onset and progression within the first two clarifications: in part; onset is the first question ("**Did this
    begin recently or long ago**"), progression is never asked, only "if this is new, worsening, persistent".
  - Tolerated comparisons recorded, then only ranking-changing questions: met. "**Your tolerated activities point
    toward something specific to wrapping.**"; "a general lack of stamina or simply standing fits your comparisons
    less well"; the other questions (kind of fatigue, one room or adhesive) could reorder the branches.
  - "Many years" kept as uncertain: met (moot in one turn; "tell me roughly when this began" presses for no date).
  - No fail: no run of questions on lights, hunger, humidity or temperature.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer same as
  checked; 57 calls, 10 web searches; YouTube's quota stopped 3 searches. Saved ARF-0136.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 21 Oct:** new (2 + 2 part / 4).

## l48-observation (lesson #48: `ObservationNotProvocation`, new)
- **Loaded:** yes (6, 12). **Executed** (the owner's sentence, part by part):
  - No extra notes solely for an experiment: met. "there is no need to add writing, extend a session, or
    deliberately bring on tiredness"
  - Record the normal sessions: met. "Recording the writing you already need to do is observation"; "Use one short
    entry per session, including sessions without tiredness"
  - A reversible ergonomic adjustment if comfortable: not met; a change is only noted if it happens: "note an obvious
    difference such as a different pen or unusually long session".
  - Don't push through worsening: in part; worsening leads to assessment, not to easing off the writing: "seek
    clinical assessment rather than waiting to finish the log".
  - Medical review if red flags: met. "Severe pain or sudden loss of hand function warrants urgent care."
  - No fail: the log is endorsed ("Yes—a brief log of the next few ordinary note-taking sessions could be useful"),
    and nothing says to avoid testing.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer same as
  checked; 55 calls, 4 web searches; community evidence declared not relevant ("how to describe your own ordinary
  sessions"). Saved ARF-0135.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 21 Oct:** new (3 + 1 part / 5).

## q120-sleep-inside-outside (question 120, two turns)
- **Loaded:** yes (1, 1; turn 2: 0, 7). **Executed, turn 1:**
  - Depends on conditions, briefly, with the main ones named: met (two criteria). "Neither is automatically better:
    the choice depends on temperature, humidity, air quality, damp or mold, pollen, noise, light, insects, and safety."
  - Asks whether they sleep better in one place or haven't tried, and about the room: in part. "**Have you tried
    both, and if so, where do you sleep better?**"; nothing about the room (as on 21 Oct).
  - Before researching: met (3 calls, no search, no check).
- **Executed, turn 2:**
  - The conditions kept as the user's: met. "Your current room needs attention"
  - Stuffy air and sleep researched: met; "opening a window or supplying outdoor air with a quiet intake fan improved
    some short-term sleep measures", from the full ventilation study.
  - Damp and mold, and how to fix them: met. "Check whether the window area gets wet ... and correct that source"
  - Protection that keeps working outside: in part. "A screened tent or properly suspended mosquito net"; still no
    preference for an enclosure.
  - How common kinds fail: met (21 Oct in part). "needs no holes, a sealed or tucked-in lower edge, and mesh held away
    from your skin. Gaps and skin touching mesh can defeat protection."
  - What to check or change, and how to compare nights: met (two criteria). "compare several comfortable nights in
    each setting, keeping bedtime, caffeine and bedding as similar as practical"
- **Finalized:** turn 1 no check (a question only); turn 2 ready_with_limits (6 calls, 5 not_ready, 0 rejected); check
  line yes (turn 2); turn 2 changed after the check (wording); 3 + 70 calls, 0 + 10 web searches. Saved ARF-0150.
- **Changed:** "This is a provisional practical starting point" dropped from the opening (the provisional caveat
  stays) and steps reworded; no criterion affected.
- **Against the checked draft (exact):** turn 1: no check of its own passed; turn 2: reworded, keeping 92% of the
  draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** better (3 + 1 part / 4; 6 + 1 part / 7, was 5 + 2 part / 7).

## q120-mosquito-net (question 120)
- **Loaded:** yes (3, 10). **Executed:**
  - How mosquitoes get past common nets: met. "mosquitoes can bite through netting pressed against it"; "keep every
    opening closed"; "reliance on keeping loose edges tucked in"; "mosquitoes passing through cut holes"
  - A fully enclosed design favoured: met. "**roomy, freestanding mesh bug tent with a sewn-in floor and a fully
    zipped door**"
  - The check passes: met.
  - New rule seen: "The UBS Optimus Foundation funded it; the authors reported no sponsor role." (question 130).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (bullet labels); 49 calls, 12 web searches; 15 product reviews read. Asked the country, budget and
  sleeping surface. Saved ARF-0149.
- **Changed:** the "Look for" bullets got bold labels and the floor, door and pegging items were regrouped
  ("**A complete enclosure:**"); no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 89% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (3/3).

## q125-product-names (question 125)
- **Loaded:** yes (5, 9). **Executed:**
  - Each name's chemistry from authoritative documentation: met. "If the supplier defines **NA** as **N-acetyl**, an
    acetyl group is attached at the amino end"; Bachem's naming guidance and the IUPAC/IUB recommendations.
  - How sellers and buyers use the names: in part; three communities searched, nothing found ("A search of r/Peptides
    turned up no relevant reports." and two more), no vendor label checked; it asks for the supplier links.
  - The check passes with community evidence researched: met (three searches declared; ready_with_limits).
  - No fail: no seller's product named from the chemistry: "particular supplier equivalence remains unresolved".
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 42 calls, 8 web searches; all 12 caveats, one link renamed. Saved ARF-0151.
- **Changed:** "two separate changes" became "separate changes", and the table's header and rows were reworded with
  the same meaning; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 75% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (2 + 1 part / 3).

## q126-39-replication (question 126, lesson #39)
- **Loaded:** yes (7, 10). **Executed:**
  - Each study's exact claim reconstructed: in part; the later paper's 89 analyzed and its susceptibility analysis,
    but neither study's stimulation, control or outcome, which it lists as what a refutation needs: "comparable
    susceptible participants, stimulation waveform, strength, placement and duration; an appropriate sham control".
  - Whether the later study tested the same conditional claim, with full-sample and subgroup results: in part.
    "explicitly examined whether stimulation effects varied with susceptibility scores"; no subgroup result.
  - Both results reported, the subgroup a hypothesis: met. "The narrower claim remains uncertain: a particular
    stimulation pattern might affect a particular susceptible group."; "It also does not establish that the
    original effect was genuine."
  - No fail: "“disproven” is too strong on those facts alone".
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (saved line only); 54 calls, 19 web searches; all 3 caveats, links renamed; neither paper audited.
  Saved ARF-0152.
- **Changed:** the saved line reads "AskRigor’s" with a curly apostrophe, so it is not the check's own line; no
  criterion affected.
- **Against the checked draft (exact):** the checked draft with text added.
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 2 part / 3).

## q126-40-aura (question 126, lesson #40)
- **Loaded:** yes (1, 13). **Executed:**
  - Three questions apart, each with its evidence: met. "An epileptic aura is already part of a seizure"; "The fact
    that a sensation can be a seizure symptom does not establish that noticing it causes the seizure."; the audited
    meditation study: "brief electrical events between seizures, not a measured increase in clinical seizure risk".
  - The seizure sign only as a point about the symptom: met. "Seek medical assessment for new, increasing, repeated
    identical episodes"
  - No warning without a risk shown for the practice, and not called risk-free: met. "not an established seizure
    trigger"; "its added seizure risk is unknown"; "This description does not establish it as safe".
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 55 calls, 5 web searches; all 19 caveats. Asked whether epilepsy has been diagnosed and
  whether the sensations are new or changing. Saved ARF-0153.
- **Changed:** opening bolded, and "which differ from a few seconds of noticing" dropped after "meditation
  sessions"; "The study cannot tell us the risk of observing déjà vu." stays, so no criterion changes.
- **Against the checked draft (exact):** reworded, keeping 72% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (3/3).

## q126-41-textbook (question 126, lesson #41)
- **Loaded:** yes (11, 2); the answer names only Universal 20.5.46. **Executed:**
  - The later qualification found, citing the diagram's line and the later passage: met (21 Oct in part). "Chapter 9
    explicitly acknowledges that the roles can reverse"; "**“Right unit: fear-only” could mislead someone reading the
    caption alone.**"
  - Shorthand apart from a universal claim, criticizing the strongest reading: met. "That is a qualified claim about
    those subjects, not a claim about all people."; "a potentially misleading caption does not establish ignorance"
  - Then tests whether the typical-case claim has evidence: not met. "It does not establish whether the fictional
    brain model or its roughly one-in-ten figure is scientifically correct"
  - No fail.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (typography); 20 calls, 13 of them protocol loads, no web search; no card.
- **Changed:** apostrophes curled and the two quoted errors bolded; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 80% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** better (2 / 3, was 1 + 1 part / 3).

## q126-42-group-average (question 126, lesson #42)
- **Loaded:** yes (6, 7). **Executed:**
  - A group average, not any one person's brain, with the reversed participants named: met. "**No. The reviewer
    turns an average tendency into a universal claim.**"; "they directly contradict “right-dominant in every
    person.”"
  - What would show it for one person: in part; "individual results", and a real study's 250 left-dominant, 37
    weakly or non-lateralized and 10 right-dominant adults, but no localizer, stimulation or lesion evidence in one
    person.
  - The average not called meaningless: met. "Right-side activation was 2% greater on average under these task and
    measurement conditions, with individual variation including reversed dominance."
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (content trimmed); 50 calls, 8 web searches; two full texts audited. Saved ARF-0154.
- **Changed:** "Dominance here means the side showing greater task-related activation." dropped, though `key_terms`
  declares "dominance", and "Taking the study as a hypothetical" cut from the opening; no case criterion changes,
  but the declared term goes unexplained in the answer the user saw.
- **Against the checked draft (exact):** reworded, keeping 58% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (2 + 1 part / 3).

## q128-oral-liver (question 128: `SeriousOrganHarmOralMedicine`)
- **Loaded:** yes (1, 11). **Executed:**
  - The serious harms listed and searched by name: met; from both labels, a UK lupus study and a French safety
    survey: "Greater concern about a lupus-like illness"; "immune-mediated liver inflammation"; "a severe allergic
    illness affecting skin and internal organs"; "Labels warn about raised pressure inside the skull"; "Severe
    allergy, skin reactions and liver injury are also reported".
  - Label warnings apart from uncertain reports: met. "These are documented warnings and clinical signals, rather
    than proof that most users will develop them."; "Spontaneous reports cannot supply reliable incidence."
  - No rate without a denominator: met. "The frequencies of these serious reactions during a 3–6-month acne course
    are not reliably quantified here."
  - Earlier tolerance and emergency signs: in part; the signs are there ("trouble breathing, facial swelling, a
    blistering rash, or a severe headache with blurred/double vision needs urgent medical assessment"), but nothing
    says that tolerating the first weeks does not rule out a later reaction; only "short follow-up can miss delayed
    illness", about trials (21 Oct: "Previously tolerating a medicine does not guarantee later tolerance.").
  - The comparison provisional: met. "but this comparison is provisional"
  - `harm_screen` with each harm's state: not judged; the summary does not show `harm_screen`. The check passed with
    eight `safety_claims`, which requires at least one entry, and no "This answer did not check" caveat appears, so
    no listed harm was left unchecked; which harms it lists cannot be seen.
  - New rule seen: "Its authors reported no funding or conflicts." beside the long-term review (question 130).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; all 20 caveats (two links
  renamed); delivered answer changed after the check; 63 calls, 11 web searches. Saved ARF-0155.
- **Changed after the check:** the table header (Issue, What matters for the comparison) became Medicine, Safety
  considerations, with bold drug names; the opener differs past the digest's cut. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 73% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** worse (6 / 6; now 4 + 1 part / 5, `harm_screen` not visible): no
  earlier-tolerance sentence.

## q130-rabies-package (question 130: the vaccine credited with the whole post-bite treatment)
- **Loaded:** yes (1, 12). **Executed:**
  - The package figure not given as the vaccine's alone: met. "The often quoted “almost 100%” describes prompt,
    correctly delivered"; "the full treatment’s success cannot be assigned entirely to the vaccine"
  - No antibody result given as protection: met (moot; no antibody study is used).
  - The dog result kept as animal evidence with its exclusion: met (moot; no dog study is used).
  - The vaccine called inactivated, not live: in part; never called live, never called inactivated.
  - No source measured the vaccine alone in people: met. "there is no single well-established percentage for the
    vaccine completely on its own"; "it is not a measured 99.2–100% causal efficacy for the vaccine alone"
  - New rule seen: "The study reported charitable funding and no conflicts of interest." beside the Tanzania result.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; all 13 caveats (one link
  renamed); delivered answer changed after the check; 61 calls, 14 web searches. YouTube's quota stopped 5 searches;
  r/rabies and Patient.info could not be retrieved. Saved ARF-0156.
- **Changed after the check:** the WHO sentences left the immunoglobulin bullet for a paragraph of their own and the
  0/473 against 77/469 result was bolded; the opener differs past the digest's cut. Matters for a criterion: no.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes in part. **vs 21 Oct:** same (4 + 1 part / 5).

## q130-maker-authors (question 130: authors employed by the maker)
- **Not judged.** OpenAI's biological-risk filter refused the run at 05:25:29 UTC after 26 AskRigor calls ("This
  content was flagged for possible biological risk"; exit 1, no answer), as it refused this case's first run on 21 Oct.
  The protocol loads (3, 10) and both manifests (HRP 20.6.29, Universal 20.5.46) came before it; there was no
  `finalize_research` call. Not rerun: the rule it tests shows in twelve other answers (finding 9). Its 21 Oct rerun
  passed in part.

## q132-copper-b12 (question 132, two turns)
- **Loaded:** yes (2, 9; turn 2: 0, 3). **Executed:**
  - Communities searched in both turns by the condition and outcome: in part; turn 2 read five r/B12_Deficiency
    threads ("Among 17 selected reports, 13 described firsthand B12 injections"), with YouTube's quota and
    HealthUnlocked blocking the rest, but turn 1 again searched none: "I did not search firsthand reports or community
    discussions for this answer: This asks for acquired causes and laboratory interpretation".
  - Unusual leads, vitamin A and copper (PMID 3655940): not met; vitamin A appears in neither turn.
  - Injection reports weighed against bounded trials: in part; the 16-trial review is bounded ("A systematic review
    of controlled trials mainly studied older adults, mostly using oral supplements") and the reports "cannot
    establish how commonly injections help", but the oral-B12 fatigue trial in 95 people with IBS or IBD is not found.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity: in part; "excess zinc, impaired intestinal
    absorption, and loss or reduced production of copper-carrying proteins" lead, vitamin A toxicity is absent.
  - No empiric high-dose vitamins: met. "These results therefore need clinical interpretation before escalating
    copper supplementation."; the supervised injection trial is "expert opinion for selected situations, not proof
    of benefit for everyone with fatigue and normal B12."
  - New rules seen (turn 2): it asks "when the fatigue and brain fog began and whether they are changing" (question
    152), and "The clinical review includes an author who advises a B12 clinic startup" (question 130).
- **Finalized:** ready_with_limits in both turns (3 calls, 2 not_ready; 6 calls, 5 not_ready; 0 rejected); check line
  yes in both (turn 1's with a curly apostrophe); all 6 and 13 caveats (a link renamed in each); both answers changed
  after the check; 64 and 37 calls, 5 and 16 web searches. Turn 2 asked the B12 value. Saved ARF-0157 and ARF-0161.
- **Changed after the check:** turn 1, curly apostrophes and a bold lead on the nerve warning; turn 2 dropped its bold
  lead on normal results against B12 function, added what it audited, and dropped a sentence on the allergy history
  (its caveat keeps cobalt allergy). Matters for a criterion: no.
- **Against the checked draft (exact):** turn 1: reworded, keeping 98% of the draft's words in order; turn 2:
  reworded, keeping 95% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 3 part / 5); turn 1 still declares community evidence not
  relevant for an abnormal result with no named candidate, and the check still passes it.

## q135-two-week-trials (question 135)
- **Loaded:** yes (6, 27). **Executed:**
  - The short answer gives the measured short-term benefit and the unknown liver risk, for that preparation and
    dose: met. "I would not recommend committing to Velloria root extract at 500 mg daily for six months on that
    evidence."; "Its benefit over six months and its longer-term liver safety are unknown."; "the two randomized
    trials support a short-term bloating-relief signal under their tested conditions"
  - No fail: not called safe. "It does not prove Velloria is dangerous, and it does not establish a safe shorter
    course or lower dose."
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 5 caveats; delivered
  answer changed after the check; 62 calls, 33 of them protocol loads (21 Oct: 39 of 59), 3 web searches. Saved
  ARF-0158.
- **Changed after the check:** only the first sentence was bolded (the digest's diff is complete). `digest-check.py`
  accepts emphasis only after the checked draft, not inside it, so this is a harness artifact. Matters: no.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes. **vs 21 Oct:** same (1 / 1).

## q135-urgent-treatment (question 135)
- **Loaded:** yes (3, 9). **Executed:**
  - The benefit and the urgency clear: in part; the urgency is ("they should not postpone it just to obtain a more
    precise estimate of delayed-reaction risk"; "Waiting has its own risks."), but the treatment's survival benefit is
    still never stated.
  - The unknown in proportion: met. "Its frequency for the unspecified product and patient is unknown."; "Uncertainty
    about that rate should prompt counselling and follow-up alongside urgent treatment."
  - No fail: no delay advised; "without asking them to hold indicated antivenom for further research".
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; both caveats; delivered answer
  changed after the check; 59 calls, 6 web searches. Saved ARF-0160.
- **Changed after the check:** the opener and the terms serum sickness and anaphylaxis bolded; the sentence on the
  unresolved personal risk moved to the end. Matters for a criterion: no.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 1 part / 2).

## q135-low-stakes (question 135)
- **Loaded:** yes (3, 8). **Executed:**
  - A direct, useful answer: met. "Yes—a 20-minute nap in the early afternoon is a reasonable option for an adult who
    otherwise sleeps well, provided nighttime sleep stays good."
  - No ritual warnings or unsupported harms: in part; its own warnings rest on evidence (grogginess before driving,
    persistent sleepiness) and 21 Oct's blinding caveat is gone, but the check's sentences still add "How often harms
    occur with a 20-minute early-afternoon nap wasn't quantified in the sources found here." and two notes on what
    "not found" means ("Where this answer says something was not found"), though the answer reports nothing not found.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 8 caveats; delivered
  answer changed after the check; 58 calls for a nap question, 6 web searches. Saved ARF-0159.
- **Changed after the check:** the opener bolded and reworded, the bullets rewritten (one lead phrase dropped), and the
  grogginess sentence now uses the check's frequency wording. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 66% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 1 part / 2).

## q136-responders (question 136)
- **Loaded:** yes (6, 13). **Executed:**
  - The inconsistent denominators said: met. "31 + 33 = 64 conflicts with the stated enrollment of 60"
  - No percentage or ratio without reconciled denominators: not met; the answer now opens with them: "Using the
    table’s group sizes, the response rates are 90.3% for tea and 24.2% for placebo.", then "66.1 percentage
    points", "3.73 times as high" and "273% higher". That is the case's own fail condition.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; both caveats; delivered answer
  changed after the check; 26 calls, 19 of them protocol loads, no web search; no card saved.
- **Changed after the check:** the opener reworded and bolded (the draft also led with the rates); the 66.1-point and
  3.73-times lines follow the rate lines (where the draft had them is past the digest's cut; its `key_terms` already
  explain percentage points). Matters for a criterion: no; the fail condition holds either way.
- **Against the checked draft (exact):** reworded, keeping 76% of the draft's words in order.
- **Verdict:** fails (the case's fail condition). **vs 21 Oct:** same (1 / 2, its fail condition); the rates now lead.
  Owner decision 149a's sentence is not in this build.

## q136-symptom-scale (question 136)
- **Loaded:** yes (4, 10). **Executed:**
  - The scale's range and direction: met. "runs from 0 to 500, with lower scores indicating fewer or less severe
    symptoms"
  - Each arm's change: met. "−93 points"; "+4 points"
  - The difference between the arms: met. "−97 points, favoring the capsule"
  - The participants not analyzed: met. "25/101, or 24.8%, were left out"
  - A range conflict: met; the run reports a published trial matching the figures (a *Dracocephalum kotschyi*
    capsule) and states its conflicts: "Its Table 3 reports an 18.8-point placebo change that conflicts with the
    means" (21 Oct: moot, the figures treated as made up).
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; all 3 caveats, one naming the
  paper "Matching trial"; delivered answer changed after the check; 42 calls, 4 web searches. Saved ARF-0162.
- **Changed after the check:** a curly apostrophe, the species name in italics, and the community sentence split from
  the inconsistency caveat. Matters for a criterion: no.
- **Against the checked draft (exact):** the checked draft with text added.
- **Verdict:** passes. **vs 21 Oct:** same (5 / 5).

## q136-weak-lead (question 136)
- **Loaded:** yes (3, 12). **Executed:**
  - The shortlist holds only options that could change the choice: in part; the table leads with four options, two
    weak by its own account: the chestnut–quebracho trial "contains contradictory participant counts and reversed
    symptom-severity labels", and the kiwifruit extract "did not establish an overall combined
    pain-and-bowel-movement benefit over placebo".
  - The weak lead off the shortlist and listed briefly at the end: met (moot); no plant is described as animal-only,
    so the case's main point went untested again; "perilla remained a search lead in this pass", with no source.
  - New rule seen, twice (21 Oct: three times): "a coauthor works for the extract maker"; "This small, publicly funded
    pilot".
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; all 20 caveats (two links
  renamed); delivered answer changed after the check; 65 calls, 7 web searches. Asked the bowel pattern and
  medicines. Saved ARF-0165.
- **Changed after the check:** the opener reworded and bolded, and the options table moved ahead of the fiber and
  peppermint paragraph. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 48% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 1 part / 2, main point untested).

## q137-deep-research-report (question 137)
- **Loaded:** yes (1, 10). **Executed:**
  - The report used as the input, its decisive claims checked: met; a six-row table tests its claims against the
    cited trials: "The report misstates the CoQ10 abstract: response meant at least halving attacks, rather than
    migraine freedom."; "the quoted responder percentages refer to at least halving"
  - What it does not give stays unknown: met. "Abstract checked; full methods not audited."; "comparative diarrhea
    counts were not available"
  - No file asked for or invented: met.
  - New rule seen: "Amgen/Novartis funded the trial; Amgen analyzed the data."; "Funding included public/foundation
    sources and GSK/AstraZeneca."
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; all 33 caveats (two links
  renamed); delivered answer changed after the check; 70 calls, 15 web searches; 21 comments read under one video.
  Template text breaks: "Another pass would take Planning estimate", "and2026 reviews", "Rerun3 blocked". Saved
  ARF-0163.
- **Changed after the check:** the opener reworded, and the table header Report claim became Option, its rows
  reworded. Matters for a criterion: no; the rows still test the report's claims.
- **Against the checked draft (exact):** reworded, keeping 48% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (3 / 3).

## q79-handoff (question 79: `ResearchHandoffTargetFidelity`, FS223)
- **Loaded:** yes (5, 12). **Executed:**
  - Target in the first sentence: met. "Find every identifiable human study of oral magnesium for nighttime leg cramps
    in adults, from database inception through your actual search date."
  - Restatement requested: met. "Restate this research target and the following scope before starting"
  - No tool the destination may lack: met. "State which you genuinely accessed, which were inaccessible, and which
    were searched only indirectly."
  - Return checks: met; coverage, study identity, source accuracy, doses and arithmetic, interpretation ("When the
    results come back, I’ll check:").
  - Note: the next step asks the user to "return its report, study tables, search log and accessible source files";
    question 137's case asks for no file (not a q79 criterion).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 4 caveats; delivered answer
  same as checked (plus the saved and check lines); 65 calls, 17 of them protocol loads, 3 web searches. Saved
  ARF-0164.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes. **vs 21 Oct:** same (4 / 4).

## q81-h2o2-nebulizer (question 81: `ContestedRemedyEvidenceFound`)
- **Loaded:** yes (3, 12). **Executed:**
  - Exact substance, indication and route, widened, with clinician literature: met; widened to COVID-19 reports, a
    humidifier injury and mouse airway tissue, with a clinician's report ("described 107 COVID-19 patients treated
    with combinations including nominal 0.04% peroxide"); "I did not locate a controlled human study showing that
    nebulized peroxide shortens common colds in the searches completed."
  - Series, trials and harm cases by route, with what was read: met. "23 analyzed COVID-19 patients receiving
    peroxide through several routes, including nebulized 0.2%"; "after peroxide was added to a sleep-apnea humidifier
    nightly for a week"; "This was a focused first pass, including three full-text method checks"
  - Not absent, not proof: met. "Your repeated improvement is a useful personal signal, but it does not establish
    what caused it."
  - Two `not_established` absence claims: met (two, and `support_not_located` for the cold-trial search).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; all 17 caveats; delivered
  answer changed after the check; 62 calls, 11 web searches. Saved ARF-0166.
- **Changed after the check:** the opener and the emergency sentence bolded; the question heading on what supports
  benefit became a line acknowledging favorable observations, and the series bullets were reworded. Matters: no.
- **Against the checked draft (exact):** reworded, keeping 64% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (4 / 4).

## q82-seller-forum (questions 82 and 83: `SellerPageVersusIndependentForum`)
- **Loaded:** yes (3, 11). **Executed:**
  - Testimonials unreliable, with the signs: met. "are seller-controlled marketing"; "Dates before sale need a
    documented explanation."
  - Wording judged without a detector, with the style's limit: met. "Machine-like wording does not prove a fictitious
    reviewer or experience."; "AI can help someone express a real experience."
  - Independent forums the stronger signal, both directions, limits: met; better focus, no benefit and unwanted
    effects in two threads, 26 accounts classified, none about this brand: "these are unverified reports about other
    or unspecified products, with causation and frequency unknown". Not called the stronger signal, as none named
    the brand.
  - Neither scam nor works: met. "insufficient evidence to call it a confirmed scam"; "These small studies leave
    benefits uncertain"
  - New rule seen: "The maker supplied the product."; "Two authors worked for a company using lion’s mane".
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; all 18 caveats; delivered
  answer changed after the check; 68 calls, 9 web searches. Saved ARF-0167.
- **Changed after the check:** the dates sentence shortened, the study paragraph turned into bullets, the Reddit
  paragraph moved. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 58% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (4 / 4).

## r324-bacopa-rates (issue #324)
- **Loaded:** yes (3, 10). **Executed:**
  - Both rates for that extract, dose and duration: met; BacoMind 300 mg/day, "in one 12-week trial, nausea
    affected" "9/49 people (18.4%) versus 1/49 (2.0%) on placebo"; the Stough trial "printed these 12-week
    percentages", nausea 18% against 4%, at "320 mg/day" after its dose correction.
  - `safety_claims` `comparative_rates`: met (three).
  - New rule seen: "The manufacturer supplied the Bacopa tablets"; "Another small, maker-funded"; "a coauthor was a
    maker director".
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 21 caveats (two links
  renamed); delivered answer changed after the check; 60 calls, 11 web searches. Saved ARF-0168.
- **Changed after the check:** the opener bolded, the BacoMind paragraph and table headers reworded (the header lost
  its 12 weeks, which the sentence above keeps), the withdrawals note moved below the table. Matters: no.
- **Against the checked draft (exact):** reworded, keeping 59% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** same (2 / 2).

## r325-alginate-metals (issue #325)
- **Loaded:** yes (2, 11). **Executed:**
  - No blanket warning: met. "does not, by itself, mean you should avoid all wild seaweed"
  - The measurements concern the purified extract: met. "Measuring contaminants in that extract does not directly
    tell us their concentration in the whole seaweed"
  - `hazard_measurement` with its caveat: in part; declared twice with caveats, for the blanching study and Canada's
    hijiki measurements, not for the extract's metals.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 17 caveats; delivered
  answer changed after the check; 60 calls, 17 web searches. Template breaks: "no one described their own use of
  Wild seaweed ingestion outcomes", "people using Hijiki as food". Saved ARF-0170.
- **Changed after the check:** the leading No bolded alone and the second paragraph's repeated definition of alginate
  dropped; list items reworded past the digest's cut. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 83% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** better (2 + 1 part / 3 both days; the check now passes with its line,
  21 Oct not_ready for the withheld card).

## r326-continue (issue #326, two turns)
- **Loaded:** yes (4, 11; turn 2: 0, 2). **Executed:**
  - The second turn keeps the protocols: met; it reloads HRP twice and names "HRP 20.6.29 · Universal 20.5.46".
  - Quantifies or scopes the warning: met in both turns; turn 2: "Liver injury is the clearest serious warning.";
    "the frequency and exact responsible ingredients remain uncertain"; "I would not calculate a dependable
    excess-risk estimate from it."
  - `finalize_research` with `safety_claims` in turn 2: met (six: one `case_reports`, five `not_quantified`).
  - Also in turn 2: "This answer did not check severe allergic reaction." (question 128), and "Indena supplied the
    extract, and one researcher disclosed consultancy for the capsule manufacturer." (question 130).
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes in both; all 20 and 18 caveats (two links renamed in turn 2); both answers changed after the check; 63 and 23
  calls, 11 and 17 web searches. Saved ARF-0169 and ARF-0172.
- **Changed after the check:** turn 1's opener bolded and split, its lead-in and trial bullets reworded; turn 2's
  opener bolded and its paragraphs reordered (the liver paragraph later, under a bold lead). Matters: no.
- **Against the checked draft (exact):** turn 1: reworded, keeping 50% of the draft's words in order; turn 2:
  reworded, keeping 67% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** better (1 + 1 part / 3): turn 2 keeps the scoped warning and declares it.

## r328-arsenic-terms (issue #328)
- **Loaded:** yes (5, 12). **Executed:**
  - Both terms explained at first use: met; inorganic arsenic, first named in the opener, is explained in the next
    paragraph beside the organic forms: "Inorganic arsenic is the more toxic group; much of the arsenic in other
    seaweeds occurs in carbon-containing compounds, often called arsenosugars."; "“Organic” here describes chemistry,
    not organic farming".
  - `key_terms` declares both: in part; inorganic arsenic and arsenosugars, not organic.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; all 17 caveats, none under 21
  Oct's heading of required qualifications; delivered answer changed after the check; 61 calls, 9 web searches.
  Saved ARF-0171.
- **Changed after the check:** the community caveats regrouped into one paragraph per community. Matters: no.
- **Against the checked draft (exact):** reworded, keeping 93% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** better (0 + 2 part / 2): organic is now explained where it first
  appears.

## r329-gracilaria-ulcer (issue #329)
- **Loaded:** yes (3, 12). **Executed:**
  - Both audits declare `reported_figures`: not met; "citation searches did not resolve a DOI for either paper", so
    neither was audited.
  - The papers counted once: met. "it does not establish credible independent confirmation of the first"; "should be
    treated as potentially dependent evidence until clarified"
  - The inconsistency and identical-results caveats: met in the answer's own words. "Exactly the same three
    percentages recur, with the extract doses reversed."; "The 2018 percentages also fail its own arithmetic."
  - Neither replication nor misconduct: met. "It does not prove copying, fabrication, or intent"; "rather than two
    established replications"
- **Finalized:** not_ready (6 calls, all not_ready, 0 rejected): key sources without a DOI; no check line, and no
  check passed (digest `no_receipt`); the answer ends with the unchecked line ("AskRigor's final check has not
  passed"); 38 calls, 12 web searches; no save.
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** same (3 / 4, not_ready for the missing DOIs); it now ends with the
  unchecked line.

## r330-cashew-gum-acid (issue #330)
- **Loaded:** yes (3, 9). **Executed:**
  - Not called acid-sparing: met. "the cited paper does not demonstrate that cashew gum protects by lowering stomach
    acid"
  - `mechanism_claims` declares the routes: in part; one claim, oral use from oral evidence in animals; the
    intraperitoneal acid assay is no longer declared (21 Oct: both routes).
  - The route caveat: met. "whereas the acid experiment describes"; "That limits conclusions about oral use."
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; all 3 caveats; delivered
  answer changed after the check; 56 calls, 15 web searches; the audit read a search-index copy. Saved ARF-0175.
- **Changed after the check:** Table 3's introduction and labels reworded (the dose moved into the column header,
  the control-vehicle definition dropped with the term). Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 64% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** worse (3 / 3): the acid assay's route is not declared, and the check
  passed without it.

## r331-thiolated-gum (issue #331)
- **Loaded:** yes (1, 11). **Executed:**
  - The audit marks the value `impossible_as_printed`: not met; the abstract has no DOI and was not audited ("remain
    unverified by AskRigor’s identifier-based study check").
  - Its caveat, without inventing a unit: met in the answer's own words. "96 mmol/g × 0.001 mol/mmol × 32.06 g
    sulfur/mol = 3.08 g sulfur per gram."; "It should not be used quantitatively or silently changed to micromoles
    per gram."
  - The safety claim with the `hazard_measurement` caveat: in part; scoped ("It cannot establish safety during
    repeated human use."), but declared `not_quantified`.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; all 8 caveats; delivered
  answer changed after the check; 55 calls, 15 web searches. Saved ARF-0173.
- **Changed after the check:** the opener shortened (the candidate is now promising rather than interesting), the
  abstract's link added, the OECD paragraph reworded. Matters for a criterion: no.
- **Against the checked draft (exact):** reworded, keeping 76% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** better (1 + 1 part / 3 both days; the check now passes with its line,
  21 Oct not_ready for the withheld card).

## r332-agar-yields (issue #332)
- **Loaded:** yes (6, 13). **Executed:**
  - The label swap as `inconsistent_with_own_data`, both places named: met. "Its abstract assigns 16.6% to
    acid-treated agar, whereas Table 2 places it under crude extract and gives acid-treated agar 37%."
  - The unreported step kept as not reported: not met; the 2022 paper's filtration is never mentioned, and that paper
    was "read through another tool, not audited by AskRigor".
  - The inconsistency caveat: met. "The reported figures in Jayasinghe et al. (2016), Table 2 don't match the
    study's own data"
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line yes; all 3 caveats; delivered answer
  same as checked (plus the saved and check lines); 50 calls, 19 of them protocol loads, 13 web searches. Saved
  ARF-0174.
- **Against the checked draft (exact):** the checked draft, unchanged.
- **Verdict:** passes in part. **vs 21 Oct:** same (2 / 3).

## i336-bci-pain (issue #336, four turns)
- **Loaded:** yes (turn 1: 4, 7; turns 2 to 4: 0, 1 each); every turn names both versions. **Executed:**
  - The discriminating test: met, in turn 1. "compare reports during clinically necessary potentially painful care
    with rest and gentle-touch conditions, repeat questions, reverse the yes/no encoding"
  - The four states kept apart: in part; turn 1 separates "**nociception**" from "**pain**" and keeps no answer open
    ("failure to respond would remain inconclusive"), but turn 2 calls a general pain question "exactly the approach"
    until the user's turn 3.
  - Proposed when brain communication first comes up, unasked: met (turn 1); turn 4: "I **did suggest it in my first
    answer**".
  - Awareness implied, nothing about complete unconsciousness: met, as judged on 21 Oct. "**A negative brain test
    cannot establish absence of pain.**"
  - The 2012 "no" not presented as that controlled test: in part. Turn 2: "Researchers have already reported doing
    this. Adrian Owen describes asking a patient whether he was in pain and decoding a “no”"; turn 3: "I overstated
    what the example established." No stimulus was claimed, so no hard fail.
  - Matched methods before saying a study answered it: met; Naci and Owen's "questions concerned identity and
    location, rather than pain", and turn 3 reads the case's Table 1 ("a general question asked once").
- **Fail criteria:** none triggered. No turn cites the 2022 EEG interface review (PMID 36545350); turn 2 declared the
  user's question a correction (`by_user`) and proposed a bug report.
- **Finalized:** ready_with_limits in all four turns (4, 2, 2, 3 calls; 3, 1, 1, 2 not_ready; 0 rejected); check line
  yes; all four changed after the check; 60, 8, 8, 8 calls, 7, 6, 5, 2 web searches; saved ARF-0116 to 0118, 0120.
  - Changed after the check: emphasis and rewording, turn 4's bug report moved lower; the turn-2 draft already had
    "Researchers have already reported doing this", so no criterion changes.
- **Against the checked draft (exact):** turn 1: reworded, keeping 74% of the draft's words in order; turn 2:
  reworded, keeping 66% of the draft's words in order; turn 3: reworded, keeping 65% of the draft's words in order;
  turn 4: reworded, keeping 83% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** worse (4 + 2 part / 6 against 5 + 1 part / 6): turn 2 offers the 2012
  "no" as already done.

## i44-gh-secretagogue-safety (lesson #44, question 128)
- **Loaded:** yes (1, 10). **Executed:**
  - Serious harms, severe allergic reactions searched by name: in part. From the label, "Serious somatropin warnings
    include severe allergic reactions, raised pressure around the brain, pancreatitis"; for the peptides, "immune
    reactions and impurities"; no search of reports or case reports for allergic reactions shows in the answer.
  - Label warnings apart from experimental peptides: met; the label paragraph, then FDA notices whose reports "do not
    establish causation or quantify the risk".
  - No rate without a denominator: met. "17.5% of 573 treated adults versus 5.1% of 572 placebo recipients over six
    months"
  - Earlier tolerated doses don't rule out a later reaction, and the emergency signs: in part. "Seek urgent care for
    breathing difficulty or throat swelling, fainting with a racing heart"; nothing on earlier tolerated doses.
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as
    provisional; it does not rank the options."
  - `harm_screen` with each harm's state: not judgeable; the summary shows no `harm_screen` (15 `safety_claims`, all
    `not_quantified`).
  - New rule seen: "The Pfizer-sponsored Pfizer International Metabolic Database" study, beside its result
    (question 130).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 67 calls, 7 web searches; all 19 caveats; 263 YouTube comments; saved ARF-0119.
  - Changed after the check: the opening and the three table rows reworded; no criterion affected as far as shown.
- **Against the checked draft (exact):** reworded, keeping 67% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** worse (3 + 2 part / 5 judged against 6/6): nothing on earlier tolerated
  doses, and allergy only from the label.

## i45-sleep-training-anxiety (lessons #45 and #46, questions 133 to 135)
- **Loaded:** yes (2, 9). **Executed:**
  - 135, the short answer: in part. "Current evidence does not establish that cry-it-out at 8 months increases anxiety
    problems by age 10. However, the research is too indirect and incomplete to rule out an increase or estimate its
    size."; "does not automatically apply to prolonged crying without check-ins"; "69% retained; 31% were missing".
    The baby's uncomforted crying at the time is only in the details ("cannot prove an absence of distress during
    training"); severe deprivation and the parents' sleep and mood go unnamed.
  - 133, a safe-sleep recommendation scoped to its outcome: met (moot; none given).
  - 134, whether more research would change the conclusion: in part; what only new studies could settle ("follow
    clearly documented methods begun around 8 months through at least age 10") and a next search ("trial supplements
    and the age-10 cohort"), but not whether more searching would likely change the conclusion.
  - No fail.
- **Finalized:** not_ready (4 calls, 4 not_ready, 0 rejected): one YouTube discovery search stopped by the quota;
  check line no; no check passed (ends with the unchecked line); 66 calls, 16 web searches. The answer names the open
  step ("revisit that search after its allowance resets").
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** same (1 + 2 part / 3, not_ready).

## b-book-reviews (owner request, 20 Oct)
- **Loaded:** yes (2, 12). **Executed:**
  - The method from the book's passages: met; four steps under "The passages teach this routine".
  - The reader reviews beside it, with difficulties, negative experiences, the audiobook and unaddressed criticisms:
    met; a table of all twelve: "Anger or crying disrupted the routine"; "An audiobook/commuting mismatch and reported
    missing worksheets"; "The criticism of tone matters for appeal".
  - Reviewers' claims about the book checked against it: met. "Their attribution of medical cure promises conflicts
    with Chapter 7’s explicit disclaimer."
  - The duplicate counted once, non-finishers not counted: met. "Identical to #10: count the account once"; "six
    distinct reviews clearly describing exercise use"
  - Endorsements apart, and how many reviews were read and how chosen: met. "The cover endorsements are
    publisher-selected praise, not reader outcome evidence."; "I assessed all twelve supplied entries"; "Your
    selection method, review dates and each site’s total review count are unknown."
  - Self-selected, not rates: met. "These selected accounts cannot establish causation or predict your response.";
    "they do not establish a harm rate"
- **Finalized:** not_ready (6 calls, 6 not_ready, 0 rejected); check line no; no check passed (ends with the unchecked
  line); 59 calls, 17 web searches. Held only by the two invented review sites: the check wants each named site's
  address and a web search of it, which a made-up site cannot have (a fixture artifact); the answer says so ("it
  requires live community addresses that were not established for the supplied reviews"). Template break: "Another
  pass would take Rough estimate: 20–40 minutes".
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes (the check held only by the fixture's invented sites). **vs 21 Oct:** same (6/6); the check,
  then ready_with_limits, is now held by that artifact.

## b-book-no-reviews (owner request, 20 Oct)
- **Loaded:** yes (5, 4). **Executed:**
  - No reader reviews found or given, said: met. "This assessment covers four supplied chapter excerpts and two
    endorsements. Zero independent reader-use reviews were assessed." (It does not say whether it searched.)
  - The book research still completed: met; the five steps with "Chapter 4’s pause option", "**105 minutes per
    week**", the endorsements "**not independent reader-use reviews**" and Chapter 7's limits.
- **Finalized:** not_ready (3 calls, 3 not_ready, 0 rejected); check line no; no check passed (ends with the unchecked
  line); 13 calls, 1 web search. Held by the run's own record: one made-up community, "Open-web book-review
  discovery", with no address and no second community. The answer blames the chat instead: "This chat’s tools list
  older protocol versions than the app supplies" and asks whether to refresh the connector; the app's
  tool list was current (finding 3).
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** worse (2/2 both days; the check, then ready_with_limits, is now
  not_ready).

## o354-work-left (#354: the check not_ready with research steps, new)
- **Loaded:** yes (1, 11). **Executed:**
  - The searches run, the check called again, the check line: met; r/OCD, NOCD and OCD-UK searched, three not_ready
    checks, then a pass, and the answer ends "Checked with AskRigor's final check, with the limits above."
  - Or, a truly blocked search, a bounded unranked answer with the unchecked line: met (moot; the check passed, and
    the YouTube block stays a stated limit: "YouTube's daily search limit stopped 5 searches in this first pass").
  - No fail: "**A firm personal 1–2–3 ranking would be misleading.**"
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (opening and option bullets rewritten); 55 calls, 9 web searches. Saved ARF-0140.
- **Changed:** the opening split into a bold line and "All three are established OCD treatments", and the joint
  sertraline-and-fluvoxamine bullet split in two; the same content as far as the digest shows, so no criterion
  changes, but the check line now sits under text the check did not read.
- **Against the checked draft (exact):** reworded, keeping 68% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** new (2/2).

## o354-continue (#354, two turns: then "continue", new)
- **Loaded:** yes (2, 12; turn 2: no loads). **Executed:**
  - Carried state passed back in turn 2: not judgeable; the summary records no carried state.
  - Says the earlier answer was not fully checked, and what changed: in part; what changed, yes ("The additional
    research adds two useful findings:"), the earlier check only by implication: "AskRigor’s final check still
    requires an unsupported conclusion about the failed YouTube leads, which I have not adopted."
  - Open steps done before any ranking: in part; turn 2's 22 calls cleared turn 1's steps on the DailyMed source and
    added two trials, but the YouTube caveat stayed refused, and the options are still ordered ("**ERP and fluoxetine
    are usual first choices; clomipramine is commonly considered later.**"), as a priority, "not a reliable ranking".
  - No fail: turn 1 is not treated as settled; both turns end "AskRigor's final check has not passed: some of its
    statements were not checked."
- **Finalized:** not_ready, both turns (5 calls, 5 not_ready; 4 calls, 4 not_ready; 0 rejected); check line no, the
  unchecked line instead; no check passed; 63 + 22 calls, 14 + 5 web searches. The check deadlocked on its own
  caveat: turn 1 said to leave out "None of the 3 videos found was worth a close look, so YouTube evidence on this is
  thin." as "a statement taken back in an earlier turn"; turn 2 said "The answer leaves out this caveat". Both
  answers ask to send a bug report; nothing was sent.
- **Against the checked draft (exact):** turn 1: no check of its own passed; turn 2: no check of its own passed.
- **Verdict:** passes in part. **vs 21 Oct:** new (0 + 2 part / 2 judged; 1 not judgeable).

## o354-emergency-first (#354: a life-threatening symptom in the thread, new)
- **Loaded:** yes (2, 7). **Executed:**
  - Triage at once: in part; it leads the answer ("**Call your local emergency number now or have someone take you
    to an emergency department. Do not drive yourself.**"), but that answer came after 51 calls and five checks,
    with "four direct-comparison trial abstracts" inspected; these files hold no earlier message.
  - Community evidence declared not relevant for an emergency, before triage: met; no community search was run: "I
    deferred community reports because this emergency assessment must come first." (The summary does not give the
    declared basis; no skip caveat was required, as with `emergency_before_triage`.)
  - No complete review claimed: met. "This is an urgent safety assessment, not a completed comparison of long-term
    OCD treatment."
  - Fail condition (triage waits for research): not settled without the event log; see the first criterion.
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (typography); 51 calls, 7 web searches. Saved ARF-0138.
- **Changed:** apostrophes curled and paragraphs re-spaced around the fluvoxamine warning; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 91% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** new (2 + 1 part / 3).

## o354-changed-after-check (#354, two turns: then the memantine line, new)
- **Loaded:** yes (3, 12; turn 2: no loads). **Executed:**
  - Turn 2's delivered answer against the conversation's latest receipt: met; digest-check.py gives
    "o354-changed-after-check.turn2: changed".
  - Re-checked, or detected as changed: met; turn 2 researched memantine and called the check again (not_ready, then
    ready_with_limits, a new receipt), and the delivered answer differs from that receipt's draft (the r/OCD caveat
    line moved across a blank line), so the strict runner refuses it.
  - No fail: the changed answer does not pass as checked.
- **Finalized:** ready_with_limits, both turns (5 calls, 4 not_ready; 2 calls, 1 not_ready; 0 rejected); check line
  yes, both; both delivered answers changed after their checks; 60 + 7 calls, 10 + 3 web searches. Turn 2 delivers
  the memantine paragraph alone ("**Memantine:** an off-label SSRI add-on"), not the first answer with a line added.
  Saved ARF-0137 and ARF-0139.
- **Changed:** turn 1's opening reworded ("This is an indirect evidence comparison" became "This compares evidence
  strength") and its paragraphs made bullets; turn 2 moved one line. No criterion is affected; the digest catches
  both, which is what the case tests.
- **Against the checked draft (exact):** turn 1: reworded, keeping 78% of the draft's words in order; turn 2:
  reworded, keeping 95% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** new (2/2).

## o355-best-ocd (#355: 153a, new)
- **Loaded:** yes (2, 9). **Executed:**
  - Before any ranking, each plausible class searched or named as not researched: met; thirteen classes assessed and
    the rest named: "Inositol, saffron, probiotics, acupuncture, cannabis, and other promoted approaches were not
    assessed sufficiently here to recommend or rank."; "This answer did not research EMDR and electroconvulsive
    therapy."
  - The report's trials found: not met; of the five, only the 2022 NAC phase III appears, as a lead with no result
    ("remains a follow-up lead because its full-text fetch was blocked"); inositol and saffron are named as not
    assessed; crocin, *Echium amoenum* and exercise after ERP are absent.
  - Each class labelled promising, contradicted, insufficient or not reviewed: met. "Encouraging human research,
    still experimental" (psilocybin); "inconsistent OCD trial results" (NAC); "A research lead" (ketogenic diets)
  - No fail: far beyond guideline classes, and "not assessed sufficiently here", not "more research is needed".
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (emphasis, a heading dropped); 73 calls, 10 web searches; 10 YouTube comments read. Saved ARF-0141.
- **Changed:** bold added, the heading "What has the strongest practical case" dropped, the ERP paragraph reworded;
  no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 53% of the draft's words in order; 25 of 26 caveats word
  for word.
- **Verdict:** passes in part. **vs 21 Oct:** new (2 / 3).

## o355-saffron-fluvoxamine (#355, new)
- **Loaded:** yes (4, 12). **Executed:**
  - Each arm's change and the difference with its interval: met. "**5.13 points with saffron and 4.52 with
    fluvoxamine**"; "about 0.6 points favoring saffron"; "ran from saffron improving 1.03 points less to 2.25 points
    more"
  - `absence_claims` declares the comparative-null sentence: met as far as these files show; one `not_established`
    claim, its sentence not in the summary. The answer: "it has not been established as equally effective as
    fluvoxamine".
  - No fail: never "as effective"; "This paper instead tested for a detectable difference."
- **Finalized:** not_ready (6 calls, 6 not_ready, 0 rejected); check line no, the unchecked line instead; no check
  passed; 61 calls, 18 web searches. Held by the trial's PubMed Central-only record: the check would not take
  `full_text_read` without an acquisition receipt (it offered `partial_text`, which would understate the reading),
  and acquisition needs a DOI ("This is a tool limitation, not an inaccessible paper"), the no-DOI class that held
  r329 on 21 Oct.
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part (criteria met, check not passed). **vs 21 Oct:** new (2/2).

## o355-keto-thread (#355, new)
- **Loaded:** yes (3, 15). **Executed:**
  - The striking recovery and the replies of no effect or worse both kept: met. "**The contrary replies matter.**
    Firsthand accounts of no change or worsening belong alongside the success story."; "The person’s relief could
    be real"
  - How the thread was chosen: met. "**Your search selected for success.** Searching for people whose OCD improved
    makes improvement stories more likely to appear."
  - No fail: "their proportions are not treatment success or harm rates".
- **Finalized:** not_ready (8 calls, 8 not_ready, 0 rejected); check line no, the unchecked line instead; no check
  passed; 60 calls, 8 web searches; 38 YouTube comments read. Held by the named community: "The user named Reddit:
  search it with your web search and record it in community_searches", which the run answered with r/OCD and
  r/keto, plus the check's tool-list refresh hint for a missing declaration; the answer reports "AskRigor’s final
  checker requires a separate Reddit record while rejecting that name" and asks to send a bug report.
- **Against the checked draft (exact):** no check of its own passed.
- **Verdict:** passes in part (criteria met, check not passed). **vs 21 Oct:** new (2/2).

## o355-supplement-table (#355, two turns: best-ocd, then "continue ... table", new)
- **Loaded:** yes (2, 7; turn 2: no loads). **Executed** (turn 2's 21-row table of supplement and botanical trials):
  - Labelled a botanical subset, no ranking implied: in part; scoped, no winner ("**No supplement or botanical here
    has evidence strong enough to call it the best treatment for adult OCD.**"), but never called one part of the
    options, and nothing says the row order implies no ranking.
  - The bottom line stays: not met; turn 1's "**The best-established starting treatments for adult OCD are
    specialist cognitive behavioral therapy (CBT) with exposure and response prevention (ERP), an SSRI
    antidepressant, or both.**" is gone, and turn 2 never mentions ERP.
  - Each effect with its size or "effect size not extracted": not met; directions only ("Reported better symptoms at
    weeks 4 and 6."; "Reported greater improvement."), no size and no such note.
  - The case's fail condition (the table the only summary): not met; two summary sentences precede the table.
- **Finalized:** ready_with_limits, both turns (6 calls, 5 not_ready; 4 calls, 3 not_ready; 0 rejected); check line
  yes, both; both delivered answers changed after the check; 65 + 80 calls, 9 + 17 web searches. Saved ARF-0145 and
  ARF-0148.
- **Changed:** turn 1's opening rewritten and paragraphs moved, and a required caveat now reads "Selecting an SSRI or
  clipramine" (17 of 18 caveats as written); turn 2's definitions, column names and rows reworded. No criterion is
  affected; the typo breaks a caveat the check required.
- **Against the checked draft (exact):** turn 1: reworded, keeping 51% of the draft's words in order; 17 of 18 caveats
  word for word; turn 2: reworded, keeping 78% of the draft's words in order.
- **Verdict:** fails (under half met; the check passed all the same). **vs 21 Oct:** new (0 + 1 part / 3).

## o355-scoped-list (#355, new)
- **Loaded:** yes (3, 9). **Executed:**
  - The list, saying it implies no ranking: met; seven trials in a table, then "This is a focused bibliography, not
    an exhaustive systematic review or a ranking of treatments."
  - No fail: no ERP or SSRI comparison; the active-comparator trials are set apart: "used active drugs as comparators
    and therefore do not belong in the placebo-controlled list".
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (wording); 61 calls, 12 web searches; all 12 caveats, five with links renamed. Saved ARF-0142.
- **Changed:** a column renamed ("source read" to "reading depth") and rows reworded, the unverified-placebo notes
  moved under the table; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 82% of the draft's words in order.
- **Verdict:** passes. **vs 21 Oct:** new (1/1).

## o356-ssris-years (#356: 153b and 153c, new)
- **Loaded:** yes (1, 8). **Executed:**
  - NNT about 7, with its outcome and 10 to 13 weeks: in part; the same 10–13-week analysis, given as a mean
    difference: "**2.65 points versus placebo after 10–13 weeks** (95% confidence interval 1.85–3.46)"; no NNT, no
    35% response.
  - NNH 6 for any adverse event, 87% against 68%, in `binary_results`: not met; beside the benefit only "The
    analysis lacked detailed adverse-event and quality-of-life data"; `binary_results` is not in these files.
  - Specific adverse-event rates: not met. "reliable rates for years-long OCD use are not available from the studies
    reviewed"; the only rates are worsening after a taper.
  - No net score: met.
  - The short answer says years of use weren't studied: in part. "the evidence is much less certain about the overall
    benefit–harm balance over decades"; "up to one year" comes only in a caveat further down.
  - Label harms, and harms not checked, named: met. "serotonin syndrome (dangerous serotonin toxicity ...), bleeding,
    low blood sodium"; "Study focus: Decades-long safety, persistent sexual dysfunction and bone/fall risks."
  - Effects after stopping: met. "**23 of 51 people who tapered (45%) versus 12 of 50 who continued (24%)**"
  - No fail: no NNT at all, no invented NNH, the benefit tied to "10–13 weeks".
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (structure); 65 calls, 7 web searches; five full texts audited. Saved ARF-0146.
- **Changed:** opening bolded, the headings "How well do they work?" and "What matters when taking one for years?"
  dropped, paragraphs reordered; no criterion affected.
- **Against the checked draft (exact):** reworded, keeping 82% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** new (3 + 2 part / 7).

## o356-dropout-nausea (#356, new)
- **Loaded:** yes (11, 22). **Executed:**
  - Both endpoints given: met. "Over 10 weeks, dropout was 10% on the drug versus 9% on placebo, while nausea was
    31% versus 12%."
  - NNH 6 for nausea: met. "**6 over 10 weeks** (1 ÷ 0.19 = 5.26, rounded up)"
  - No fail: "**These figures do not establish that the drug is well tolerated overall.**"
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (emphasis); 53 calls, 33 of them protocol loads, 1 web search. Saved ARF-0143.
- **Changed:** "19 additional people with nausea per 100 treated" bolded, the saved and check lines run together; no
  criterion affected.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes. **vs 21 Oct:** new (2/2).

## o356-short-monitoring (#356, new)
- **Loaded:** yes (2, 25). **Executed:**
  - Rare, delayed and after-stopping harms called unmeasured: met. "ending monitoring at the last dose leaves later
    outcomes unmeasured"; "Whether this supplement causes delayed problems, withdrawal or rebound remains unknown.";
    for rare ones, an upper bound of "**18.1%**" from 15 people.
  - No fail: "**“No serious side effects” does not mean “no harm.”**"
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (white space); 48 calls, 27 of them protocol loads, 7 web searches. Saved ARF-0144.
- **Changed:** blank lines only, then the saved and check lines; no criterion affected.
- **Against the checked draft (exact):** formatting only (emphasis, markers or white space).
- **Verdict:** passes. **vs 21 Oct:** new (1/1).

## o356-year-follow-up (#356, new)
- **Loaded:** yes (3, 12). **Executed:**
  - A conditional recommendation: met. "**Yes—continuing sertraline longer is reasonable to consider with your
    prescriber if it is helping and its side effects are acceptable.**"
  - With its figures (52-week randomized data): in part; the designs, not the results: "325 adults", "its first 52
    weeks", "for another 28 weeks", then "Its abstract reports advantages for symptom worsening" and "These sources do
    not establish reliable one-year OCD-specific rates for these harms."
  - No fail: not withheld; it asks for the dose and any side effects.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line yes; delivered answer changed after
  the check (structure); 62 calls, 15 web searches. Saved ARF-0147.
- **Changed:** opening bolded and the two studies made bullets under "Two studies need distinguishing:"; no
  criterion affected.
- **Against the checked draft (exact):** reworded, keeping 70% of the draft's words in order.
- **Verdict:** passes in part. **vs 21 Oct:** new (1 + 1 part / 2).

## Summary

| Case | Loaded | Executed | Finalized (last status; calls; rejected) | Check line | Against the checked draft | Verdict | vs 21 Oct |
|---|---|---|---|---|---|---|---|
| l22 | yes | 5 + 2 part / 7 | ready_with_limits; 5; 0 | yes | reworded 67% | passes in part | same |
| l23 | yes | 6 / 7 | ready_with_limits; 4; 0 | yes | reworded 91% | passes in part | same |
| l24 | yes | 3 + 1 part / 4 | not_ready (address, caveats); 4; 0 | no | no check passed | passes in part | worse (check) |
| l25 | yes | 2 + 1 part / 3 | ready_with_limits; 5; 0 | yes | reworded 80% | passes in part | same |
| l26 | yes | 4 + 1 part / 5 | ready_with_limits; 5; 0 | yes | reworded 59% | passes in part | same |
| l27 | yes | 6 / 6 | ready_with_limits; 7; 0 | yes | added | passes | better |
| l28 | yes | 2 + 1 part / 4 | ready_with_limits; 4; 0 | yes | added | passes in part | same |
| l29 | yes | 5 / 5 | ready_with_limits; 5; 0 | yes | formatting | passes | same |
| l30 | yes | 5 / 5 | ready_with_limits; 5; 0 | yes | reworded 87% | passes | same |
| l31 | yes | 7 / 8 | not_ready (quota, coverage); 5; 0 | no | no check passed | passes in part | same |
| l32 | yes | 4 + 1 part / 5 judged | ready_with_limits, 2 turns; 7+4; 0 | yes | reworded 68%; same | passes in part | worse |
| l33 | yes | 6 / 6 | ready_with_limits, 2 turns; 5+4; 0 | yes | reworded 59%; reworded 58% | passes | same |
| l34 | yes | 5 / 5 | ready_with_limits; 5; 0 | yes | reworded 55% | passes | same |
| l35 | yes | 6 / 6 | ready_with_limits; 5; 0 | yes | reworded 83% | passes | same |
| l36 | yes | 4 + 1 part / 6 | ready_with_limits; 7; 0 | yes | formatting | passes in part | better (check) |
| l37 | yes | 5 / 5 | ready_with_limits; 4; 0 | yes | formatting | passes | same |
| l47 onset first | yes | 2 + 2 part / 4 | ready_with_limits; 4; 0 | yes | same | passes in part | new |
| l48 observation | yes | 3 + 1 part / 5 | ready_with_limits; 4; 0 | yes | same | passes in part | new |
| q120 sleep | yes | 3 + 1 part / 4; 6 + 1 part / 7 | no check; ready_with_limits; 6; 0 | turn 2 | no check passed; reworded 92% | passes in part | better |
| q120 net | yes | 3 / 3 | ready_with_limits; 6; 0 | yes | reworded 89% | passes | same |
| q125 | yes | 2 + 1 part / 3 | ready_with_limits; 6; 0 | yes | reworded 75% | passes in part | same |
| q126 #39 | yes | 1 + 2 part / 3 | ready_with_limits; 6; 0 | yes | added | passes in part | same |
| q126 #40 | yes | 3 / 3 | ready_with_limits; 4; 0 | yes | reworded 72% | passes | same |
| q126 #41 | yes | 2 / 3 | ready_with_limits; 4; 0 | yes | reworded 80% | passes in part | better |
| q126 #42 | yes | 2 + 1 part / 3 | ready_with_limits; 3; 0 | yes | reworded 58% | passes in part | same |
| q128 | yes | 4 + 1 part / 5, +1 unseen | ready_with_limits; 6; 0 | yes | reworded 73% | passes in part | worse |
| q130 package | yes | 4 + 1 part / 5 | ready_with_limits; 5; 0 | yes | formatting | passes in part | same |
| q130 maker | no answer | not judged | no check (OpenAI's filter refused the run); 0; 0 | no | no answer | not judged | not comparable |
| q132 | yes | 1 + 3 part / 5 | ready_with_limits, both turns; 3 + 6; 0 | yes | reworded 98%; reworded 95% | passes in part | same |
| q135 two weeks | yes | 1 / 1 | ready_with_limits; 4; 0 | yes | formatting | passes | same |
| q135 urgent | yes | 1 + 1 part / 2 | ready_with_limits; 5; 0 | yes | formatting | passes in part | same |
| q135 low stakes | yes | 1 + 1 part / 2 | ready_with_limits; 4; 0 | yes | reworded 66% | passes in part | same |
| q136 responders | yes | 1 / 2, its fail condition | ready_with_limits; 4; 0 | yes | reworded 76% | **fails** | same |
| q136 scale | yes | 5 / 5 | ready_with_limits; 5; 0 | yes | added | passes | same |
| q136 weak lead | yes | 1 + 1 part / 2 (untested) | ready_with_limits; 6; 0 | yes | reworded 48% | passes in part | same |
| q137 | yes | 3 / 3 | ready_with_limits; 6; 0 | yes | reworded 48% | passes | same |
| q79 | yes | 4 / 4 | ready_with_limits; 4; 0 | yes | same | passes | same |
| q81 | yes | 4 / 4 | ready_with_limits; 5; 0 | yes | reworded 64% | passes | same |
| q82 | yes | 4 / 4 | ready_with_limits; 6; 0 | yes | reworded 58% | passes | same |
| r324 | yes | 2 / 2 | ready_with_limits; 4; 0 | yes | reworded 59% | passes | same |
| r325 | yes | 2 + 1 part / 3 | ready_with_limits; 4; 0 | yes | reworded 83% | passes in part | better (check) |
| r326 | yes | 3 / 3 | ready_with_limits, both turns; 5 + 4; 0 | yes | reworded 50%; reworded 67% | passes | better |
| r328 | yes | 1 + 1 part / 2 | ready_with_limits; 5; 0 | yes | reworded 93% | passes in part | better |
| r329 | yes | 3 / 4 | not_ready (no DOI); 6; 0 | none | no check passed | passes in part | same |
| r330 | yes | 2 + 1 part / 3 | ready_with_limits; 3; 0 | yes | reworded 64% | passes in part | worse |
| r331 | yes | 1 + 1 part / 3 | ready_with_limits; 4; 0 | yes | reworded 76% | passes in part | better (check) |
| r332 | yes | 2 / 3 | ready_with_limits; 4; 0 | yes | same | passes in part | same |
| i336 | yes | 4 + 2 part / 6 | ready_with_limits, 4 turns; 4+2+2+3; 0 | yes | reworded 74%; reworded 66%; reworded 65%; reworded 83% | passes in part | worse |
| i44 | yes | 3 + 2 part / 5 judged | ready_with_limits; 6; 0 | yes | reworded 67% | passes in part | worse |
| i45 | yes | 1 + 2 part / 3 | not_ready (YouTube quota); 4; 0 | no | no check passed | passes in part | same |
| b-book reviews | yes | 6 / 6 | not_ready (invented sites); 6; 0 | no | no check passed | passes | same |
| b-book no reviews | yes | 2 / 2 | not_ready (no address); 3; 0 | no | no check passed | passes in part | worse (check) |
| o354 work left | yes | 2 / 2 | ready_with_limits; 4; 0 | yes | reworded 68% | passes | new |
| o354 continue | yes | 0 + 2 part / 2 (1 unjudged) | not_ready ×2; 5 + 4; 0 | no | no check passed | passes in part | new |
| o354 emergency first | yes | 2 + 1 part / 3 | ready_with_limits; 5; 0 | yes | reworded 91% | passes in part | new |
| o354 changed after check | yes | 2 / 2 | ready_with_limits, both; 5 + 2; 0 | yes | reworded 78%; reworded 95% | passes | new |
| o355 best OCD | yes | 2 / 3 | ready_with_limits; 6; 0 | yes | reworded 53% | passes in part | new |
| o355 saffron | yes | 2 / 2 | not_ready (no DOI); 6; 0 | no | no check passed | passes in part | new |
| o355 keto thread | yes | 2 / 2 | not_ready (Reddit record); 8; 0 | no | no check passed | passes in part | new |
| o355 supplement table | yes | 0 + 1 part / 3 | ready_with_limits ×2; 6 + 4; 0 | yes | reworded 51%; reworded 78% | **fails** | new |
| o355 scoped list | yes | 1 / 1 | ready_with_limits; 3; 0 | yes | reworded 82% | passes | new |
| o356 SSRIs for years | yes | 3 + 2 part / 7 | ready_with_limits; 5; 0 | yes | reworded 82% | passes in part | new |
| o356 dropout and nausea | yes | 2 / 2 | ready_with_limits; 4; 0 | yes | formatting | passes | new |
| o356 short monitoring | yes | 1 / 1 | ready_with_limits; 6; 0 | yes | formatting | passes | new |
| o356 year of follow-up | yes | 1 + 1 part / 2 | ready_with_limits; 5; 0 | yes | reworded 70% | passes in part | new |

Totals. 65 cases: 23 pass, 39 pass in part, 2 fail (q136 responders, on its own fail condition; o355 supplement
table, under half met) and 1 not judged (q130 maker, refused by OpenAI's filter). The 50 cases of 21 Oct: 18 pass, 30
pass in part, 1 fails, 1 not judged (21 Oct: 21, 28 and 1); against 21 Oct, 8 better (l27, l36, q120 sleep, q126 #41,
r325, r326, r328, r331), 7 worse (b-book no reviews, i336, i44, l24, l32, q128, r330), 34 the same. The 15 new cases: 5
pass (o354 work left, o354 changed after check, o355 scoped list, o356 dropout and nausea, o356 short monitoring), 9
pass in part, 1 fails. The check passed in 55 of the 65 cases; in the 50 of 21 Oct, 43 (21 Oct: 44): l36, r325 and r331
gained it, both book cases, l24 and q130 maker lost it.

## Cross-case findings

1. **Answers are still changed after the check, and the changes reached what the check had read.** Of the 64 turns
   whose own check passed, 5 delivered the checked draft unchanged (l32 turn 2, l47, l48, q79, r332), 8 changed only
   formatting, 4 only added text (a versions line in l27, l28 and q136 scale, the saved line in q126 #39) and 47
   reworded it, keeping 48% to 98% of the draft's words in order (median 72%). In 62 of the 64 every caveat the check
   required survived word for word; o355 best OCD put a lead-in before one ("For the dietary harm signal, case reports
   show ..."), and o355 supplement table delivered a required caveat as "Selecting an SSRI or clipramine", a drug name
   misspelled after the check. Other content the check had read was lost or changed: q126 #42 dropped the definition of
   the term its check declared (`key_terms` "dominance"); q137 turned "reported a subset achieving at least a 50%
   reduction in attack frequency in month three" into "reported benefit in month three", dropped its doses from the
   table's row labels and dropped the sentence saying what its searches covered and when; two answers dropped a limit
   of their own, l32 "The 2019 publisher full text was fetch-blocked." and q81 the sentence saying its 2012, 1988 and
   1946 sources stayed abstract-only or unresolved; 14 turns added a versions line the check never read. Figures
   changed in 23 more turns; read sentence by sentence (`after-check-details.py`), 19 are rewordings that keep the
   values (numbers spelled out, a citation's year dropped, sentences split or merged), o355 scoped list added a limit
   ("the syrup dose was also unverified for the 2022 trial"), and l32, q81 and q137 are the losses above. Built since,
   not yet released: a passing check tells the AI to give its draft word for word, followed only by the check's own
   lines (981e2a92), and the strict runner refuses anything else (38c96e5f).
2. **The check deadlocked in three ways, each a check bug.**
   - A correction that takes back one of the check's own caveats. o354 continue declared the YouTube caveat "None of
     the 3 videos found was worth a close look, so YouTube evidence on this is thin." as a statement it took back
     (`corrections`); every later check, carrying that forward, refused the answer for repeating "a statement taken
     back in an earlier turn" while still requiring the caveat, through 9 checks over both turns. The answer asked to
     send a bug report.
   - A platform the user names. In o355 keto thread the user named Reddit; the run searched and recorded r/OCD and
     r/keto, but the check keys a community by its name, so "The user named Reddit: search it with your web search and
     record it in community_searches" stayed open through eight checks, and the answer reports "AskRigor’s final
     checker requires a separate Reddit record while rejecting that name".
   - A community that cannot be found. Since 29 Sep the check wants an address for every community not read on
     Reddit, and a community that cannot be found has none: the book cases' two invented review sites, the made-up
     "Open-web book-review discovery" and l24's "Unidentified publication comments". The fixtures' sites do not exist,
     but a user can as easily name a real community that cannot be found.
   Built since, not yet released (afd5937f): a correction cannot take back one of the check's own caveats, and the
   step says why; a platform the user names is searched when any community on it is; a community that could not be
   found is recorded so (`access_boundary` `not_found`), without an address, with a caveat saying it, and counts as no
   discussion pool of its own.
3. **The check's refresh hint made an answer blame the app.** b-book no reviews told the user "This chat’s tools list
   older protocol versions than the app supplies" and offered to refresh the connector, though the app's tool list was
   current. The run had left a declaration out, and the check's step for a missing declaration reads "If this chat's
   AskRigor tool has no such field, its tool list is outdated: ...", which the AI took as a fact. Built since, not yet
   released (afd5937f): finalize_research takes the app's tool-list version too (the next build's refresh alert,
   abe63489, knows each surface's), so a missing declaration asks for a refresh only when the app's list is older, and
   the hint for a call that sends none now says that a tool list with the field is current.
4. **The check still passes answers without what the case needs** (21 Oct, finding 2). q132's turn 1 again declared
   community evidence not relevant for an abnormal test result with no named candidate, the case HRP 20.6.28's clause
   in `EvidenceLayersAreNotAFixedDiscoveryOrder` was written for; the next build's `question_about` (owner answer 149a,
   981e2a92) refuses that skip for a symptom or a test result. Also l25 (no `safety_claims`), l28
   (`mechanism_claims` none), r328 (one term of two), r330 (one route of two), r331 (`not_quantified` where the case
   needs `hazard_measurement`), o356 SSRIs for years (no NNT, NNH or harm rate), o355 best OCD (1 of the report's 5
   trials) and o355 supplement table's turn 2 (no effect sizes, the bottom line dropped).
5. **q136 responders fails again**, now with the rates in its first line ("Using the table’s group sizes, the response
   rates are 90.3% for tea and 24.2% for placebo."). HRP 20.6.30's `CountsNeedTheirGroupSizes` (owner answer 149a) is
   built for this case and not yet released.
6. **148 tool calls failed (21 Oct: 102 in 58 runs), nearly all inputs a tool refused.**
   - `validate_study_method_audit` 67: 48 "Study audit reported figure ... is not in its cited source block" (21 Oct:
     31), for figures the paper does not print as such: totals, percentages, reconstructed differences ("Randomized
     completers", "Crude active symptom-score decrease"); 17 other refused inputs; 2 a source identity mismatch.
   - `check_retraction_status` 27 (21 Oct: 16): `identifier` missing.
   - `validate_review_method_audit` 15: `program_fingerprints` empty (7), `search_end_date` in another form (4), a
     required statement missing (4).
   - `search_youtube` 12: YouTube's daily quota. `acquire_open_full_text` 11: one public-copy query where two are
     needed (6), a DOI in another form (4), no candidate URL (1).
   - The scout 10: 8 `research_target_not_deidentified`, 2 refused inputs. `resolve_doi` 3; one each for
     `audit_youtube_community` (`max_videos` 4 against 3), `continue_open_full_text` and `load_protocol` (no section
     named "Safety").
   The figure rule and the retraction check's `identifier` lead both days: a recurring cost, not a one-off.
   Proposed: a derived figure names the printed figures it comes from and the server checks the arithmetic (a change
   to how audits record figures, for the owner), and `identifier` leads the retraction check's description.
7. **Template sentences still break** (21 Oct, finding 7). "Another pass would take Rough estimate: 20–40 minutes"
   (b-book reviews), "... take About", "Approximately" or "Roughly" (seven answers), "Another pass would take Planning
   estimate" (q137), "Comfort measures depends on" and "did not research Preventive medicines" (l26), "The evidence on
   Selecting an SSRI or clomipramine followed people" (o355 supplement table), "no one described their own use of Wild
   seaweed ingestion outcomes" and "people using Hijiki as food" (r325), "did not check Heat illness" (q120 sleep).
   The class is one mechanism: a server sentence with a model-written phrase spliced into its grammar. Patching each
   word (a leading "About", a capital letter) would be another local fix of a recurring class; the splice itself has
   to change, to a form that holds any phrase in any language (the server's words, a colon, the phrase), or to the
   model writing the sentence and the check comparing what it declares. Proposed for the next build.
8. **Budget.** 3,760 AskRigor calls and 670 web searches in the 76 runs (21 Oct: 2,651 and 452 in 58), about 49 calls
   a run. Protocol loads still dominate some short cases: o356 dropout and nausea 33 of 53, q135 two weeks 33 of 62,
   o356 short monitoring 27 of 48, q136 responders 19 of 26, r332 19 of 50, q79 17 of 65, q126 #41 13 of 20. q135 low
   stakes used 58 calls on a nap question (21 Oct: 62).
9. **The rules of questions 128, 130 and 152 show up beside the cases built for them.** Funding or an author's tie to
   the maker sits beside the result in l23, l34, i44, q120 net, q128, q130 package, q132, q136 weak lead, q137, q82,
   r324 and r326 (question 130); r326's turn 2 says "This answer did not check severe allergic reaction." and l23 lists
   the label's serious harms (question 128); q132's turn 2 asks when the fatigue began and whether it is changing
   (question 152).

## Test harness

- **The override (owner answer 144a).** `~/.codex/AGENTS.override.md` held one line from 01:36:36 to 07:18:16 UTC
  ("override in place", "override removed" in `progress.txt`) and was absent at 11:51. No run ran a shell command or
  fetched the owner's development repository, and no answer starts with a time stamp.
- **The preamble.** The findings card goes to the final check, and no notes about the test: no answer carries a
  release-test note (21 Oct: 6), and no run withheld its card (21 Oct: r325, r331 and l36, which now pass the check).
- **The biological-risk refusal.** OpenAI's filter refused q130-maker-authors at 05:25:29 UTC after 26 AskRigor calls
  (exit 1, no answer), as on 21 Oct; its log is kept. Not rerun (see the case).
- **Other servers.** Codex also starts the owner's other MCP servers; one (Consensus) logged a sign-in error at start,
  and no run called any of them.
- **The comparison scripts.** `digest-check.py` (21 Oct's handoff) accepts emphasis only after the checked draft, so
  q135 two weeks, bold on its first sentence alone, reads "changed"; `change-kinds.py` classes it as formatting only.
  `stats4.py` counted no failed calls this time: Codex now logs a refused call with `status` "failed" and no `error`,
  which `change-kinds.py` and `after-check-details.py` read.
- **Calls.** 3,760 AskRigor calls, 670 web searches and 349 final checks in the 76 runs, none rejected; 26 calls and 3
  web searches in the refused run.

## Saves

- 60 runs' final checks saved a findings card for the owner's review: ARF-0116 to ARF-0175, one per run, no gaps.
  All 60 answers carry the check's saved line naming the card, three of them retyped with a curly apostrophe (l23,
  q126 #39, q132's turn 1); on 21 Oct no answer gave a card ID. The 16 runs without a card: the 10 whose check did not
  pass, q120 sleep's first turn (a question), q130 maker, and l29, l37, q126 #41 and q136 responders.
- No run submitted a research contribution or a lesson candidate.
