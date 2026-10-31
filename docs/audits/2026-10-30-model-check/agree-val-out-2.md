# Frozen model check (v4) on unseen answers, part 2: claude and codex against the judges

37 answer turns from `val-part-2`. Judges: `verdicts-02.md` (r325 to w166) and `verdicts-03.md` (r376, r377, r382).
Checkers: `val-claude-sonnet-v4` (claude) and `val-codex-sol-v4` (codex); all 74 results parsed.

How to read this:

- Problem numbers are 1-based in each checker's `problems`. Call numbers are the bundle's `call`.
- A two-turn case is judged once. Its verdict is shown on both turns, and each criterion sits on the turn it concerns:
  r326 on both turns (all met), r376-later-phase and r377-continue on turn 2 (all met).
- A met fail condition counts as an unmet criterion. There are two in this part (r377-brief, r382-aim-unknown), and the
  counts are given with and without them.
- Out of scope: the criterion rests on a final-check declaration, or on the notice an AskRigor rule requires at a stop,
  and the bundle has neither (r331's two). Study audits (`validate_study_method_audit`) are in the bundles with their
  arguments, so audit criteria are in scope.
- Extras get one standard for both checkers. Asking for a limit the answer already states plainly, or disputing what the
  judges credit, is doubtful. A wording or ordering preference, or a request only to relabel where a non-decisive claim
  came from, is style.

### r325-alginate-metals: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (gives no levels from the kelp survey it read), #2 plausible (no higher-risk groups; the audits say children and pregnancy are not covered), #3 plausible (lead did not fall with blanching in the Scottish study, call 45, and the user asked about lead), #4 style (wants a source for the extract-is-not-the-food point the answer already makes); codex: none.
- Serious: none.

### r326-continue: judges passes / claude fix / codex sound
- Recall: no unmet criterion (met in both turns).
- Extras: claude: #1 doubtful (asks for adverse-event counts the answer declined because the trial's denominators conflict; the instructions say declining is right), #2 plausible (the review's pooled working-memory estimate and interval, call 35), #3 plausible (leaves out the trials' liver and kidney monitoring, so the safety picture is one-sided), #4 plausible (found hepatotoxicity records and never opened them; turn 2 did read the case report), #5 plausible (minor: "from reading full texts" overstates, since the case report was read only in part); codex: none.
- Serious: none.

### r326-continue.turn2: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (the 2022 report has the same ethics approval code as the dementia publications, calls 105 and 93), #2 plausible (it stays unclear which 2021 paper is meant), #3 plausible (doesn't convey how severe the three liver cases were, or that the products were weight-loss tablets, call 87), #4 plausible (never reads the phase 1 randomized trial listed in the registry record, call 60; the point about the stale record is already in the answer), #5 plausible (no effect sizes for the 2023 study, call 104), #6 plausible (minor: 18 of 80 lost, with deaths unattributed, call 93); codex: none.
- Serious: none.

### r328-arsenic-terms: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (leaves out the prepared, as-eaten hijiki range in call 30), #2 plausible (no idea of what "regular" means or who is at higher risk), #3 plausible (the cohort's hazard ratios and intervals, call 36), #4 plausible (minor: the 2024 survey's figures, call 37), #5 plausible (minor: Park's audited conditions differ from "soaking and boiling ... discarded"); codex: none.
- Serious: none.

### r329-gracilaria-ulcer: judges passes in part / claude fix / codex unreliable
- Recall: both audits declare `reported_figures` (source): claude caught (#1, #2) / codex caught (#1). All three problems name the same failure. No tool read or audited either paper: call 6 refused the PDF address as a DOI, and calls 3, 4, 14 and 15 got only partial access. So the tables rest on reading the log does not hold.
- Extras: claude: #3 doubtful (the answer does discuss the two papers' different model labels, and its table shows the same protective direction), #4 plausible (minor: doesn't say what the literature and retraction searches found); codex: none.
- Serious: claude #1: quote ok, calls ok, merits partly. The gap is real, but neither paper has a DOI, so the retry it suggests may not be possible. The answer already says it compared public texts AskRigor could not validate, and calls itself provisional. claude #2: quote ok, calls ok (the alternate PDF appears in no call), merits partly. The claim is unchecked, but the judges credit the duplicated-table reading and the answer says how it read the texts. codex #1: quote ok, calls ok, merits partly (the same). Its "unreliable" verdict goes beyond the judges, who credit the conclusion. claude also kept a minor problem (#4) beside serious ones, against its instructions.

### r330-cashew-gum-acid: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (the ranitidine control shows the acid test could detect suppression; the paper is inconsistent about species and group size, call 24), #2 plausible (gives no size for the protection), #3 doubtful (objects to ranking the stomach-lining explanation, which the instructions ask for and the answer hedges as unproven); codex: none.
- Serious: none.

### r331-thiolated-gum: judges passes in part / claude fix / codex fix
- Recall: the audit marks the value `impossible_as_printed` (source): claude caught (#1) / codex caught (#1). Both say the value comes from an abstract no tool read; only call 3, a web search, touched it. The safety claim with the `hazard_measurement` caveat (research): out of scope (a final-check `safety_claims` declaration). Stopped-check answer, rule 172 (research): out of scope (what is missing is the notice AskRigor's rule requires at a stop, which the bundle does not state).
- Extras: claude: #2 style (asks to label the 2024 abstract's details as read on the web; they are not decisive), #3 plausible (leftover synthesis reagent is a direct safety concern, not only something that skews the assay, call 30), #4 style (minor: how it words the reading depth for the 2019 study); codex: none.
- Serious: claude #1: quote ok, calls ok, merits partly. The value is unchecked and decisive, so presenting it conditionally is fair. But the judges accept the reading and its caveat, and the answer says the conference sources could not be validated. claude also kept a minor problem (#4) beside a serious one.

### r332-agar-yields: judges passes in part / claude fix / codex sound
- Recall: the audit records the label swap (source): claude missed / codex missed. The unreported step kept as not reported (source): claude missed / codex missed. Both papers' texts were in calls 23 and 24, but no audit could run, and neither checker says so (the answer states "read through another tool, not audited"). claude #1 touches the purification difference only as an overstated headline.
- Extras: claude: #1 plausible (the opening sentence gives one outlying figure, from another paper's single method, as the answer to "which method"), #2 plausible (the 2022 extract has no pure-agar gel strength, and the same texts hold benchmarks); codex: none.
- Serious: claude #1: quote ok, calls ok (calls 23 and 24 carry the texts), merits partly. The points are sound, but the answer already calls the comparison across papers provisional and the 2022 purification unclear, so it is not serious.

### r376-forum-500: judges passes in part / claude fix / codex sound
- Recall: two groups each reported, flat from the start and stalled after an initial loss (research): claude missed / codex missed. claude #3 disputes which accounts match, not the missing second group.
- Extras: claude: #1 doubtful (asks to say the reports come from unlogged searches; the answer already says they come from its own web search, which AskRigor could not verify), #2 plausible (no note on the medical risk of the intake described), #3 doubtful (the judges credit the two counted accounts as qualifying), #4 style (minor: says "two posts" but links one); codex: none.
- Serious: none.

### r376-later-phase: judges passes / claude fix / codex sound
- Recall: no unmet criterion (the case's criteria concern turn 2).
- Extras: claude: #1 plausible (the "three matches" opening is stronger than its table; the judges' unscored note says this turn counted the r/loseit account with its replies unchecked), #2 plausible (unclear how long the r/WeightLossAdvice account was at the stated intake; the judges also note this account), #3 plausible (minor: no medical-risk note); codex: none.
- Serious: none.

### r376-later-phase.turn2: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (no medical-risk note), #2 style (the answer already says the additions are short stalls or unclear durations; claude wants a running tally), #3 doubtful (minor; the answer says the Reddit text came through the search index, and the judges credit the correction); codex: none.
- Serious: none.

### r377-brief: judges fails / claude fix / codex sound
- Recall: a sentence or two on what a deeper pass would look at and could change (check): claude missed / codex missed. Fail condition, template lines or a stack of focuses (check): claude missed / codex missed. claude #1 quotes a "Study focus:" line, but about an unread trial, not about the line's form. The check required these lines word for word, and the checker instructions say fixed caveats are written by code, which may explain both misses.
- Extras: claude: #1 plausible (a trial in poor sleepers and a meta-analysis were found but never read or mentioned, calls 14 and 25), #2 plausible (minor: the other eating windows' null results; sleep was a secondary outcome), #3 plausible (minor: what the 38-person trial compared and who was in it; the judges note the comparison was lost after the check); codex: none.
- Serious: none.

### r377-continue: judges passes / claude fix / codex sound
- Recall: no unmet criterion (the case's criteria concern turn 2).
- Extras: claude: #1 plausible (doesn't set how big metabolic adaptation is against the size of the deficit), #2 plausible (that study's exercise phase was at usual eating), #3 plausible (no safety note on months at very low intake), #4 style (minor: wants a more concrete test than the comparison the answer proposes); codex: none.
- Serious: none.

### r377-continue.turn2: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (in a "continue" turn, leaves the review's excluded no-loss papers and the nonresponse search hits unopened), #2 plausible (gives the mean loss but not the spread, call 80), #3 plausible (the 65 were selected successful completers, calls 90 and 92), #4 doubtful (the answer already lists intake error first and says several explanations are needed), #5 plausible (minor: the studied programmes were supervised and time-limited); codex: none.
- Serious: none.

### r382-aim-unknown: judges fails / claude fix / codex fix
- Recall: a short, proportional provisional answer (research): claude partly (#1 says indirect harms from other populations dominate the page, not that the answer is too long) / codex missed. One question about her main reason (research): claude caught (#2) / codex caught (#1). Fail condition, weight loss assumed and no question asked (research): claude caught (#2 quotes the same weight-loss next step) / codex caught (#1: "frames its practical next step around weight loss").
- Extras: claude: #3 doubtful (asks for more research where the case wants a short reply and one question); codex: #2 plausible (the gallstone counts with their absolute difference and number needed to harm; the arithmetic is right).
- Serious: none.

### r382-five-months-300: judges passes in part / claude fix / codex sound
- Recall: deaths over months on such diets (research): claude partly (#3: the evidence comes only from anorexia inpatients and very-low-calorie diet studies would fit better; it does not name deaths) / codex missed. Gallstones (research): claude missed / codex missed.
- Extras: claude: #1 plausible (never asks about the person's situation, and gives no pointer to eating-disorder support), #2 plausible (the cohort's complication rates, with its population, call 46), #4 style (minor: asks only to relabel the NICE line); codex: none.
- Serious: none.

### r382-other-aims-diabetes: judges passes / claude fix / codex fix
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (no simpler options for the stated diabetes aim), #2 plausible (the 14/20 result's size and context, call 26), #3 style (minor: asks to label the well-known low-blood-sugar risk of the medicine as product information); codex: #1 plausible (the gallstone comparison's absolute difference and number needed to harm).
- Serious: none.

### r382-other-aims-metabolic: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (never says plainly how likely harm is in one week), #2 plausible (gives harms from long exposures and other populations more space than their role), #3 plausible (minor: intervals, arm sizes and a normal starting value, call 46), #4 style (minor: the answer already names simple options; claude wants them ranked and a lab check); codex: none.
- Serious: none.

### r382-other-aims-spiritual: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (no plain bottom line on tolerability and little harm reduction; "nothing for someone who goes ahead" overstates, since the answer gives stop signs and fluid advice), #2 plausible (doesn't say the symptoms were transient or give raw hospitalisation counts), #3 plausible (minor: three paragraphs of weight-loss forum material that the answer itself sets aside); codex: none.
- Serious: none.

### r382-scale-and-waist: judges passes in part / claude fix / codex fix
- Recall: the week's deficit as rough fat arithmetic (research): claude caught (#2) / codex partly (#1 says the likely change over seven days goes unanswered, but gives no arithmetic). A week's scale drop mostly water, glycogen and gut contents, and a waist change within day-to-day variation (research): claude caught (#2) / codex partly (#1). The plateau explained without assuming her intake is wrong (research): claude caught (#3) / codex missed.
- Extras: claude: #1 plausible (never mentions a short very-low-calorie study it read in full, calls 13 and 17), #4 plausible (the gallstone absolute difference and the trial's adverse-event proportions), #5 style (minor: asks only to relabel a well-known drug warning; it also cites call 18, which is a NICE query); codex: #2 plausible (minor: the gallstone absolute difference and number needed to harm).
- Serious: none.

### r382-week-800: judges passes in part / claude fix / codex sound
- Recall: each study effect sized before any label (research): claude missed / codex missed. The Finnell cohort as supervised, older and sicker patients (research): claude partly / codex missed. claude #2 notes both events were in men over 70 and none in younger or healthier people, and adds an interval. But the answer already gives the two men's ages, and the cohort's age and illnesses stay unnamed.
- Extras: claude: #1 plausible (retrieves the seven-day restriction abstract, call 24, but never reports it), #3 plausible (minor: lean-mass loss, belly fat can't be targeted, gentler options); codex: #1 plausible (minor: absolute difference and number needed to harm).
- Serious: none.

### s359-t1-routine: judges passes / claude sound / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 doubtful (minor; objects to the "rehydrated, repaired or unglued" sentence the judges credit; those words are not in the logged research, but the video's claims were extracted), #2 plausible (minor: simple, general alternatives for stiffness); codex: none.
- Serious: none.

### s359-t1-routine-given: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (call 23 retrieved a likely matching video, in which a coach promotes his own fascia programme, yet the answer says the video is unidentified), #2 plausible (offers no alternatives or self-test for stiffness), #3 style (minor: "exercise snack" is the user's own term); codex: none.
- Serious: none.

### s359-t1b-compound: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (the qigong trial's side-effect counts and who should take care, call 24), #2 plausible (the other two trials' results with group sizes, calls 25 and 30), #3 plausible (qigong did no better than plain exercise therapy; baseline values), #4 plausible (minor: the self-test has no control, and stiffness fluctuates); codex: none.
- Serious: none.

### s359-t2-matched: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (doesn't name the rebound-versus-active-exercise trials it found, calls 20 and 25), #2 plausible (a mini-trampoline lead failed twice, calls 27 and 43, and goes unmentioned while the answer says the search is complete), #3 style (minor: wording of the hypothetical-trial sentence); codex: none.
- Serious: none.

### s359-t2-matched-given: judges passes / claude sound / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 style (minor: where an author-affiliation detail came from; not decisive); codex: none.
- Serious: none.

### s359-t3-two-claims: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (the bold "laboratory basis" frames as support what the pig data, more water with more stiffness, cut against), #2 plausible (the similar video may not involve bouncing), #3 plausible (proposes no self-test), #4 plausible (minor: who should take care); codex: none.
- Serious: none.

### s359-t3-two-claims-given: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 doubtful (the opening sentence does say the video's hydration claim is not established), #2 plausible (fetched the mobility study, call 9, but never read it, and left the bouncing-flexibility hits unopened), #3 plausible ("positive" and "encouraging" overstate lower passive stiffness, given the answer's own sources); codex: none.
- Serious: none.

### s359-t5-aerobic: judges passes in part / claude fix / codex fix
- Recall: stair-climbing studies that measured fitness compared directly (research): claude caught / codex missed. claude #5 says the fetched 2024 stair trial (call 7) and PMID 28009784 (call 12) go unused. By its DOI, 10.1249/MSS.0000000000001188, PMID 28009784 is the 2017 stair-climbing paper the judges name; the bundle shows no title. codex #1 is about the cycling arm.
- Extras: claude: #1 plausible (no burpee gains, call 24), #2 plausible (in the stair trial, call 25, the control group fell and an outlier was dropped), #3 plausible (the evidence comes from young, inactive volunteers, but the advice is broader), #4 plausible (never reads the harm-search hits, call 43), #6 plausible (minor: four community paragraphs on routines that match nothing); codex: #1 plausible (the audited trial's 110-second cycling arm fits the time budget, call 24).
- Serious: none. One detail is off: claude #5 says the abstract was visible for call 7, but in the bundle call 7 shows only a receipt.

### s360-abstract: judges passes / claude fix / codex fix
- Recall: no unmet criterion.
- Extras: claude: #1 doubtful (says the limit is unstated; the answer says "I read the public abstract and relevant appendix text through web search", and the judges credit the appendix reading), #2 doubtful (the same for the abstract), #3 plausible (minor: the confidence scale could be confused with the unknown quality scale); codex: #1 doubtful (asks to present the details as taken from web-search material, which the answer already does).
- Serious: claude #1: quote ok (it skips one bullet with "..." and drops the link), calls ok (call 2 is metadata only; 14, 19 and 22 failed), merits wrong. Its key claim, that the answer does not say the appendix was read through web search, is contradicted by the answer. claude also kept a minor problem (#3) beside a serious one.

### s360-abstract-given: judges passes / claude sound / codex sound
- Recall: no unmet criterion.
- Extras: none for either checker.
- Serious: none.

### s360-agreement: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 plausible (the audited Khoong result, pooled versus individual appropriateness, call 29, would back "can still be useful"), #2 plausible (no practical checks for judging a plan); codex: none.
- Serious: none.

### s360-lookup: judges passes / claude sound / codex sound
- Recall: no unmet criterion.
- Extras: none for either checker.
- Serious: none.

### s360-process: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 style (admits the limit is stated right after the findings and asks to move it first), #2 plausible (the appendix sentence on "similar ratings" is hard to square with the headline finding), #3 plausible (the audited Ameri paper's absolute quality level, explanatory power and rater agreement, call 45), #4 plausible (doesn't report the two leads' abstracts or other fetched records); codex: none.
- Serious: claude #1: quote ok, calls ok (11 is metadata; 14, 18, 32 and 56 failed; the rest are web searches), merits partly. The facts are right, but the answer states the limit, as the problem admits, and the judges credit it. Where the caveat sits does not make it serious.

### s360-rating: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 doubtful (disputes that Chen and Walker's physician-panel study matches; it does, and the answer says only its abstract was readable); codex: none.
- Serious: none.

### s360-studies: judges passes / claude fix / codex sound
- Recall: no unmet criterion.
- Extras: claude: #1 doubtful (the answer says it read only the abstract and that the findings are unverified, which the judges credit), #2 plausible (doesn't say how each study's setting fits a bounty service), #3 doubtful (minor; says no database query used contest terms, but call 5 has "contest*" and web queries used "best answer" and "crowdsourcing"); codex: none.
- Serious: none.

### w166: judges passes in part / claude sound / codex sound
- Recall: the study audit lists each arm's rate and the total analysed with `worked_out` (research): claude missed / codex missed (the audit's figures are in call 14's arguments).
- Extras: none for either checker.
- Serious: none.

## Counts for part 2

### Recall (21 unmet criteria: 19 in scope, 2 out of scope)

| Class | In scope | claude caught / partly / missed | codex caught / partly / missed |
|---|---:|---|---|
| research | 13 | 6 / 3 / 4 | 2 / 2 / 9 |
| source | 4 | 2 / 0 / 2 | 2 / 0 / 2 |
| check | 2 | 0 / 0 / 2 | 0 / 0 / 2 |
| delivery | 0 | - | - |
| **All** | **19** | **8 / 3 / 8** | **4 / 2 / 13** |

- Out of scope: 2 for both checkers, both research: r331's `hazard_measurement` safety caveat and its stop notice.
- Without the two met fail conditions (r377-brief, missed by both; r382-aim-unknown, caught by both), 17 criteria: claude caught 7, partly 3, missed 7; codex caught 3, partly 2, missed 12.

### Problems

- claude: 119 problems, 3.2 per turn (6 serious, 81 worth fixing, 32 minor). 10 matched an unmet criterion; of the 109 extras, 80 plausible, 14 style and 15 doubtful.
- codex: 10 problems, 0.27 per turn (1 serious, 7 worth fixing, 2 minor). 4 matched; of the 6 extras, 5 plausible, 0 style and 1 doubtful.

| Turn | claude n (matched / plausible / style / doubtful) | codex n (same) |
|---|---|---|
| r325-alginate-metals | 4 (0/3/1/0) | 0 |
| r326-continue | 5 (0/4/0/1) | 0 |
| r326-continue.turn2 | 6 (0/6/0/0) | 0 |
| r328-arsenic-terms | 5 (0/5/0/0) | 0 |
| r329-gracilaria-ulcer | 4 (2/1/0/1) | 1 (1/0/0/0) |
| r330-cashew-gum-acid | 3 (0/2/0/1) | 0 |
| r331-thiolated-gum | 4 (1/1/2/0) | 1 (1/0/0/0) |
| r332-agar-yields | 2 (0/2/0/0) | 0 |
| r376-forum-500 | 4 (0/1/1/2) | 0 |
| r376-later-phase | 3 (0/3/0/0) | 0 |
| r376-later-phase.turn2 | 3 (0/1/1/1) | 0 |
| r377-brief | 3 (0/3/0/0) | 0 |
| r377-continue | 4 (0/3/1/0) | 0 |
| r377-continue.turn2 | 5 (0/4/0/1) | 0 |
| r382-aim-unknown | 3 (2/0/0/1) | 2 (1/1/0/0) |
| r382-five-months-300 | 4 (1/2/1/0) | 0 |
| r382-other-aims-diabetes | 3 (0/2/1/0) | 1 (0/1/0/0) |
| r382-other-aims-metabolic | 4 (0/3/1/0) | 0 |
| r382-other-aims-spiritual | 3 (0/3/0/0) | 0 |
| r382-scale-and-waist | 5 (2/2/1/0) | 2 (1/1/0/0) |
| r382-week-800 | 3 (1/2/0/0) | 1 (0/1/0/0) |
| s359-t1-routine | 2 (0/1/0/1) | 0 |
| s359-t1-routine-given | 3 (0/2/1/0) | 0 |
| s359-t1b-compound | 4 (0/4/0/0) | 0 |
| s359-t2-matched | 3 (0/2/1/0) | 0 |
| s359-t2-matched-given | 1 (0/0/1/0) | 0 |
| s359-t3-two-claims | 4 (0/4/0/0) | 0 |
| s359-t3-two-claims-given | 3 (0/2/0/1) | 0 |
| s359-t5-aerobic | 6 (1/5/0/0) | 1 (0/1/0/0) |
| s360-abstract | 3 (0/1/0/2) | 1 (0/0/0/1) |
| s360-abstract-given | 0 | 0 |
| s360-agreement | 2 (0/2/0/0) | 0 |
| s360-lookup | 0 | 0 |
| s360-process | 4 (0/3/1/0) | 0 |
| s360-rating | 1 (0/0/0/1) | 0 |
| s360-studies | 3 (0/1/0/2) | 0 |
| w166 | 0 | 0 |

### Serious problems

- claude, 6 (r329 #1 and #2, r331 #1, r332 #1, s360-abstract #1, s360-process #1):
  - quote in the answer: 6 of 6 (s360-abstract's skips one bullet with "...");
  - call numbers right: 6 of 6;
  - merits: 0 confirmed, 5 partly, 1 wrong (s360-abstract #1), 0 doubtful.
- codex, 1 (r329 #1): quote ok, calls ok, merits partly.
- 6 of the 7 rest on reading the log doesn't hold, and in 5 of those the answer already states that limit. r331's answer
  says only that the conference sources could not be validated. The seventh, r332 #1, is about the headline figure.

### Verdicts against the judges'

| Judges | Turns | claude sound / fix / unreliable | codex sound / fix / unreliable |
|---|---:|---|---|
| passes | 26 | 4 / 22 / 0 | 24 / 2 / 0 |
| passes in part | 9 | 1 / 8 / 0 | 5 / 3 / 1 |
| fails | 2 | 0 / 2 / 0 | 1 / 1 / 0 |

Reading passes as sound, passes in part as fix and fails as unreliable: claude agrees on 12 of 37 turns (4 + 8 + 0), codex on 27 of 37 (24 + 3 + 0). Neither called a failing answer unreliable. codex called r377-brief, which fails, sound, and r329 unreliable.

### Criteria one checker caught and the other missed

- claude caught, codex missed:
  - r382-scale-and-waist, the plateau explained (claude #3 ranks several explanations; codex says nothing on it).
  - s359-t5-aerobic, stair studies compared (claude #5 names the fetched stair records; codex #1 points to the cycling arm instead).
- codex caught, claude missed: none.
- Smaller differences:
  - claude caught where codex was only partly right: r382-scale-and-waist's fat arithmetic, and its water and waist-variation point (claude #2; codex #1 only says the likely change goes unanswered).
  - claude partly right where codex missed: r382-aim-unknown's short, proportional answer; r382-five-months-300's deaths on such diets; r382-week-800's Finnell cohort.

### Patterns

- **Discrimination:** claude flags nearly everything (fix on 32 of 37 turns, including 22 of 26 that pass). codex flags very little (sound on 30 of 37, including 5 of 9 in-part turns and the failing r377-brief).
- **Recall:** claude finds about twice as much (8 caught and 3 partly, against 4 and 2, of 19). All of its extra recall is on research criteria: the low-calorie cases and s359-t5.
- **Precision:** codex's 6 extras hold 1 doubtful. claude's 109 extras hold 15 doubtful and 14 style. Of the 15 doubtful:
  - 5 ask for a web-read limit the answer already states (r376 two, s360 three);
  - 4 dispute what the judges or the case credit;
  - 3 ask for what the answer already does;
  - 2 go against the check's own instructions (ranking explanations; declining a rate when the counts conflict);
  - 1 misstates the research (s360-studies #3).
- **Shared blind spots:**
  - an audit that could not run when the text itself was visible (r332), and a figure missing from an audit (w166);
  - the template lines the check forced into r377-brief;
  - gallstones (r382-five-months-300), effect sizes (r382-week-800) and the after-loss group (r376-forum-500).
- **Serious problems:** all 7 quote and cite correctly, but none is fully right on the merits. Both checkers overrate reading the answer has already disclosed (r329), and codex turns it into "unreliable".
- **Rule-keeping:** in 3 turns (r329, r331, s360-abstract) claude kept minor problems beside serious ones, against its instructions. codex never did.
- **Repetition:** codex made one point, the gallstone absolute difference and number needed to harm, in four r382 turns, correct each time. claude asked for a medical-risk note on very low intake in five forum turns (r376 three, r377-continue two). The judges do not score that point; I counted it plausible.
