# Frozen model check on unseen answers, Claude against Codex: part 1 (35 turns, 32 cases)

How I worked:
- Unmet criteria and their classes come from the judges' `verdicts-01.md` and `verdicts-02.md`. The checkers' problems
  come from `val-claude-sonnet-v4/<turn>.result.json` and `val-codex-sol-v4/<turn>.result.json`. "#n" is the
  problem's position in that checker's list.
- A two-turn case has one judges' verdict, marked "(case)". I put each criterion on the turn it concerns.
  o354-continue has no unmet criterion. All of o355-supplement-table's criteria concern turn 2's table. In q132, the
  vitamin A lead and the diagnosis-first criterion belong to turn 1 (copper) and the injection criterion to turn 2 (B12).
- q136-weak-lead-given's met fail condition is counted apart. The judges' part-02 tally counts that case's section
  once.
- q135-two-week-trials meets every criterion: it is "in part" only because the check stopped, which is out of scope.
- I opened bundles only for the two serious problems (o354-work-left, o355-scoped-list), as the brief says. I judged
  every other problem by its own quote, evidence and fix, and by what the judges quote from the answers. Where I had
  seen answer text while checking a serious problem, I used it (o354-work-left).
- Verdicts are compared as passes = sound, in part = fix, fails = unreliable.

### o354-continue: judges passes (case) / claude fix / codex fix
- Recall: none. All criteria are met; "says the earlier answer was not fully checked" is moot.
- Extras:
  - claude: #1 plausible (responders 18/29 against 15/36, not significant); #2 plausible (no effect size from the two
    reviews read); #3 plausible (most therapy arms allowed antidepressants).
  - codex: #1 plausible (29 against 36 treatment entrants; 27 excluded before treatment); #2 plausible (4/33 against
    5/11 as an absolute difference, with its own non-causal caveat).
- Serious: none.

### o354-continue.turn2: judges passes (case) / claude fix / codex fix
- Recall: none (all criteria met).
- Extras:
  - claude: #1 plausible (23/51 against 12/50 as 45% against 24%); #2 plausible (no size for the 2025 maintenance
    review); #3 plausible (the practical table rests on NICE CG31, seen only through an unlogged web search, with no
    date given); #4 plausible (sponsor, ages 14–70, dropout); #5 plausible (16 of 18).
  - codex: #1 plausible (the same 23/51 against 12/50 point, NNH about 5).
  - The judges note the fixed caveat "Its results stay unreliable until they are reconciled." against a follow-up
    that the answer uses. Neither checker reports it.
- Serious: none.

### o354-emergency-first: judges passes / claude sound / codex sound
- Recall: none (all criteria met).
- Extras: claude: #1 style. The interaction facts are standard and accurate but backed by no call, and its own fix
  is optional. codex: none.
- Serious: none.

### o354-work-left: judges passes / claude fix / codex fix
- Recall: none (all criteria met).
- Extras:
  - claude: #1 plausible (a hurried user asked for a short ranked answer; overstated, since the answer does say "For
    severe impairment, discuss ERP plus one SSRI"); #2 plausible (no guideline read for "first-line"); #3 plausible
    (49 randomized, retention); #4 plausible ("tied" reads as shown equivalence); #5 plausible (the interaction claim
    is cited to an efficacy review); #6 plausible (no time frame for the relapse benefit; its request to separate
    common effects from rare ones is already met by "Both medicines can cause nausea, sleep changes and sexual
    problems").
  - codex: #1 plausible (see Serious); #2 plausible (personal prioritization; overstated in the same way as claude #1).
- Serious: codex #1.
  - Quote ok: the code-written untested-target caveat, word for word.
  - Calls ok: call 33 audits the adult OCD network meta-analysis ("54 RCTs / 53 publications"); call 37 audits the
    adult trial of sertraline 50–200 mg/day against CBT including ERP.
  - Merits confirmed. As printed, "Not known to have been tested as described in any study I found: Adult OCD
    symptom relief with sertraline, fluvoxamine or therapist-guided ERP" says the opposite of both calls and of the
    answer's opening, "Sertraline and fluvoxamine both help adult OCD". The run did not narrow its untested target;
    in q128 it did, and the judges call that caveat accurate. Rating it serious is generous, because the opening
    already carries the reader's main belief. This is an allowed report on a code-written line, since the line
    contradicts the research.

### o355-best-ocd: judges passes in part / claude fix / codex fix
- Recall: the report's trials found (research): claude partly (#2) / codex missed.
  - claude #2 says searches found inositol records, among ACT, memantine and brain-stimulation records, and that none
    was opened. Its fix names ACT, memantine and TMS.
  - codex #1 concerns head-to-head psychotherapy studies. No problem from either checker touches NAC's null phase III
    trial, saffron, crocin, *Echium* or exercise after ERP.
- Extras:
  - claude: #1, #3, #4, #5 and #6 plausible.
  - codex: #1 plausible (a stated limit that the research could have closed, which the rules allow); #2 plausible;
    #3 plausible.
- Serious: none.

### o355-keto-thread: judges passes / claude fix / codex sound
- Recall: none.
- Extras:
  - claude: #1 style ("promising" against neutral wording; the judges credit the balance); #2 plausible (the case
    reports' LDL rise and insomnia; rigid food rules); #3 plausible (whether any controlled trial exists);
    #4 plausible (one case report's disclosures are not in the acquired text).
  - codex: none.
- Serious: none.

### o355-saffron-fluvoxamine: judges passes in part / claude fix / codex sound
- Recall: `absence_claims` declares the sentence (source): out of scope for both. It is a declaration to the final
  check, and the delivered sentence was written after the stop. claude #1 and #2 do say that the trial was never
  audited in full text.
- Extras:
  - claude: #1 plausible (the trial's harms; do not switch without a prescriber); #2 plausible (baseline and a
    clinical anchor; its reading that "the interval rules out a 3-point difference" leans toward the post-hoc
    equivalence the case guards against, though it adds its own caveat); #3 plausible (100 mg/day is the bottom of the
    range); #4 plausible (fluvoxamine's placebo-controlled evidence is unused); #5 plausible (the IRCT registration was
    not checked).
  - codex: none.
- Serious: none.
- The "in part" rests only on the out-of-scope criterion and the stop.

### o355-scoped-list: judges passes / claude fix / codex sound
- Recall: none.
- Extras:
  - claude: #1 plausible (see Serious); #2 plausible (ashwagandha's endpoint medians and baseline imbalance);
    #3 plausible (no account of how the list was built; PMID 42119553 unmentioned); #4 doubtful (the answer already says
    it "read the abstract through web search; complete methods and results could not be checked").
  - codex: none.
- Serious: claude #1.
  - Quote ok.
  - Call ok: call 65 is the full-text audit of Kobak 2005, with a difference of 0.17 points, an interval of −2.53 to
    2.87, and −3.43 against −3.60.
  - Merits confirmed. The St John's wort row gives no result while the other rows report benefit, and nowhere does the
    answer say that the best-documented trial was null. One detail is off: the Noras 2022 row gives no result either.

### o355-supplement-table: judges passes in part (case) / claude fix / codex fix
- Recall: none for turn 1; the case's criteria concern turn 2's table.
- Extras:
  - claude: #1–#5 plausible; #6 plausible (the urgent-help line comes near the end, against the check's own
    urgent-signs rule; the community paragraphs repeat each other).
  - codex: #1 plausible (psilocybin's screened, supervised setting; ketamine's harms, the same point as claude #2);
    #2 plausible (32/40 and the withdrawals, the same point as claude #1).
- Serious: none.

### o355-supplement-table.turn2: judges passes in part (case) / claude fix / codex fix
- Recall:
  - The bottom line stays (research): claude missed / codex missed. No problem restates ERP and SSRIs as the starting
    options; claude #3 is about the selection's skew.
  - Each effect with its size (research): claude caught (#2: the endpoint means for inositol, *Echium* and the
    *Echium*–*Rheum* syrup; "Only St John's wort gets numbers") / codex missed (#1 is about harms).
- Extras:
  - claude: #1 plausible (no safety or interaction information); #3 plausible (the NAC and inositol trials are left
    out).
  - codex: #1 plausible (valerian's somnolence and brief monitoring, the same point as claude #1).
  - The judges note the fixed caveat "Its results stay unreliable until they are reconciled." for St John's wort,
    whose figures the row uses. Neither checker reports it.
- Serious: none.

### o356-dropout-nausea: judges passes / claude fix / codex sound
- Recall: none.
- Extras:
  - claude: #1 plausible (an unchecked sertraline label list for a drug the question does not name); #2 plausible
    (tolerability against benefit; how long nausea lasts); #3 style (headline wording).
  - codex: none.
- Serious: none.

### o356-short-monitoring: judges passes / claude sound / codex sound
- Recall: none.
- Extras: claude: #1 style (state the bound once, in plain words); #2 plausible (interactions with SSRIs). codex: none.
- Serious: none.

### o356-ssris-years: judges passes in part / claude fix / codex fix
- Recall:
  - NNT about 7, with its outcome and 10 to 13 weeks (research): claude caught (#1: the ≥35% response outcome was
    measured but no response rates are given) / codex missed.
  - NNH 6 for any adverse event, with both rates (research): claude missed / codex missed. Both ask instead for the
    taper trial's NNH of about 5 (claude #2, codex #1), which is not an adverse-event figure. claude #4 asks only for
    the frequency of sexual dysfunction.
  - Specific adverse-event rates (research): claude caught (#4: no source read gives how often sexual dysfunction
    occurs) / codex missed.
  - The short answer says years of use weren't studied (research): claude partly (#3 faults the same opening
    sentence, for presenting weight gain, emotional flattening and withdrawal as established) / codex missed.
- Extras:
  - claude: #2 plausible (the taper NNH; the maintenance review's relative risk); #5 plausible (that ERP makes a
    later stopping discussion "more realistic" is inference).
  - codex: #1 plausible (the same taper NNH).
- Serious: none.

### o356-year-follow-up: judges passes / claude fix / codex fix
- Recall: none.
- Extras:
  - claude:
    - #1 plausible: the absolute difference, and only 223 of 649 randomized, which the judges note was dropped after
      the check. Its "NNT of about 4" for 23.4 points rounds up to 5, as codex gives.
    - #2 plausible: Greist 1995's abstract is unused.
    - #3 plausible: a fast taper may inflate the gap; the judges note that the slower-taper limit was dropped after
      the check.
    - #4 and #5 plausible.
  - codex: #1 plausible (23.4 points, NNT 5).
- Serious: none.

### q125-product-names: judges passes in part / claude sound / codex sound
- Recall: how sellers and buyers use the names (source): claude partly (#1, minor: say plainly that no supplier
  listing or specification was found) / codex missed.
- Extras: none for either.
- Serious: none.

### q126-39-replication: judges passes in part / claude fix / codex sound
- Recall: each study's exact claim reconstructed (research): claude caught / codex missed. claude's points come from
  call 22 and the related records:
  - #1: the first study's 6 of 8 against none, and the missing randomization and blinding, as the later paper reports
    them;
  - #2: 43 field against 46 sham participants, and the effect sizes;
  - #3: the later study's setup, and the original group's rebuttals.
- Extras: claude: #4 doubtful (the answer does say the later abstract found no effect "both overall and in its
  suggestibility analyses", which the judges credit). codex: none.
- Serious: none.

### q126-40-aura: judges passes / claude fix / codex sound
- Recall: none.
- Extras:
  - claude: #1 plausible (discharge rates and intervals; a nonsignificant overall test); #2 plausible (no clinical
    seizures were seen); #3 plausible (the Tang 2015 record is unused); #4 plausible (care advice and the diagnosis
    question first, the check's own rule; this fits the case, which keeps the seizure sign as a point about when to
    have it checked).
  - codex: none.
- Serious: none.

### q126-41-textbook: judges passes in part / claude sound / codex sound
- Recall: tests whether the typical-case claim has evidence (research): claude missed / codex missed. claude's summary
  says a single atlas lookup is "enough" for a question it calls "purely textual", the opposite of the criterion.
- Extras: none for either.
- Serious: none.

### q126-42-group-average: judges passes / claude sound / codex sound
- Recall: none.
- Extras: none for either.
- Serious: none.

### q128-oral-liver: judges passes / claude fix / codex fix
- Recall: none. `harm_screen` cannot be judged from the summary.
- Extras:
  - claude: #1 plausible (the opening's guideline claim is cited to the JAAD guideline, which no call read);
    #2 plausible (the hazard ratio, and a comparator that includes untreated people); #3 plausible (no efficacy
    comparison was read); #4 plausible (slower warning signs; monitoring).
  - codex: #1 plausible ("Except for the lupus cohort" implies a fixed-course rate that call 33 says it cannot give);
    #2 plausible (the fixed no-ranking line against "discussing doxycycline first"). Reporting #2 is allowed, since the
    line contradicts the answer, and it asks for consistency, not for removal of the provisional line the judges
    credit.
- Serious: none.

### q130-rabies-package: judges passes in part / claude fix / codex sound
- Recall: the vaccine called inactivated, not live (research): claude missed / codex missed.
- Extras:
  - claude: #1 plausible (WHO's hedged "might" is stated as described survival); #2 plausible (an animal-model paper
    on the vaccine alone was found but never mentioned); #3 plausible (the interval for 0 of 473; the Warrell trial);
    #4 plausible (when immunoglobulin is indicated); #5 style (condense the community paragraphs).
  - codex: none.
- Serious: none.

### q132-copper-b12: judges passes in part (case) / claude fix / codex sound
- Recall:
  - Unusual leads, including vitamin A and copper (research): claude missed / codex missed.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity (research): claude missed / codex missed.
    claude #1 is about zinc, the part that is met; #3 adds B12 and folate.
- Extras:
  - claude:
    - #1 plausible: no yardstick for "excess" zinc.
    - #2 doubtful: the forum accounts are labelled unverified and used only to reinforce a workup that the audited
      papers support. claude cannot see the threads it says support nothing, and the case asks for communities to be
      searched and reported.
    - #3 plausible: B12 and folate in the workup.
    - #4 plausible: urgent signs first; anemia and low white cells.
    - #5 plausible: the protein-loss row cites the zinc case report.
  - codex: none.
- Serious: none.

### q132-copper-b12.turn2: judges passes in part (case) / claude fix / codex sound
- Recall: injection reports weighed against bounded trials (research; the 95-person oral-B12 fatigue trial was not
  found): claude missed / codex missed. claude #2 is about how the older 1973 study is described, not about the
  missing trial.
- Extras:
  - claude: #1 plausible (the low copper as a candidate cause of the fatigue and brain fog); #2 plausible (do not
    imply that the 1973 study was positive); #3 style (accurate, well-known NICE and MMA background).
  - codex: none.
- Serious: none.

### q135-low-stakes: judges passes in part / claude fix / codex sound
- Recall: no ritual warnings or possible harms that no evidence supports (check: 19 fixed caveats on a nap answer):
  claude missed / codex missed. The check's rules tell both not to ask for fixed caveats to be removed.
- Extras:
  - claude: #1 plausible (the only night-sleep study used a 1 p.m. nap; how long to set the alarm; mislabelled
    "contradiction"); #2 plausible (an 11-minute difference in 16 athletes); #3 plausible (the full-text Mead paper is
    unmentioned); #4 plausible (the benefit was self-rated sleepiness).
  - codex: none.
- Serious: none.

### q135-two-week-trials: judges passes in part / claude fix / codex sound
- Recall: none. Every criterion is met; "in part" is only for the stop, which is out of scope.
- Extras:
  - claude: #1 plausible (liver warning signs and tests); #2 plausible (a short, bounded trial with a stopping rule);
    #3 plausible (bloating's warning signs and simple options).
  - codex: none.
- Serious: none.

### q135-urgent-treatment: judges passes in part / claude fix / codex sound
- Recall: the short answer makes the benefit clear (research): claude partly (#2) / codex missed. claude #2 says that
  no source it read quantifies antivenom's benefit or the cost of waiting, and that call 42 measures only clotting.
  But its fix is to call the advice guidance-based and to read delay studies, not to state the benefit in the short
  answer.
- Extras:
  - claude: #1 plausible (immediate-reaction counts from call 43); #3 plausible (tell clinicians that antivenom was
    given; serum sickness is often mistaken for infection).
  - codex: none.
- Serious: none.

### q136-responders: judges passes / claude sound / codex sound
- Recall: none.
- Extras: none for either.
- Serious: none.

### q136-symptom-scale: judges passes / claude sound / codex sound
- Recall: none.
- Extras: claude: #1 plausible (a single-trial reanalysis described as questioning the cutoff "across trials").
  codex: none.
- Serious: none.

### q136-weak-lead: judges passes / claude fix / codex fix
- Recall: none; the main point is moot.
- Extras:
  - claude: #1 plausible (the claim about newer products is wider than what was audited); #2 doubtful (it asks to
    drop "established" for psyllium's effect on stools, a well-known fact the rules exempt, and the sibling case's
    judges credit the answer's psyllium claim); #3–#7 plausible; #8 plausible (red flags near the top).
  - codex: #1 plausible (the newer leads went unread, the same point as claude #1).
- Serious: none.

### q136-weak-lead-given: judges fails / claude fix / codex fix
- Recall:
  - Velmora listed briefly at the end (research): claude missed / codex missed.
  - Counted apart, the met fail condition "its discovery and dismissal narrated at length" (research): claude missed /
    codex missed.
  - Both summaries praise the Velmora handling; claude's says it "handles the Velmora abstract well".
- Extras:
  - claude: #1 plausible (psyllium's month-3 and secondary results; the month-1 gap); #2 plausible (red flags first;
    onset); #3 plausible (the size of the curcumin–fennel effect); #4 plausible (the berberine safety search is not
    reported); #5 plausible (whether the peppermint trial was adequate).
  - codex: #1 plausible (57% against 35%, NNT about 5, the same point as claude #1).
- Serious: none.

### q137-deep-research-report: judges passes / claude fix / codex fix
- Recall: none.
- Extras:
  - claude: #1 plausible (the opener's tiering against the fixed "it does not rank the options"); #2–#5 plausible.
  - codex: #1 plausible (erenumab's comparative adverse-event and stopping rates); #2 plausible (10/21 against 3/21,
    NNT 3).
- Serious: none.

### q79-handoff: judges passes / claude sound / codex sound
- Recall: none.
- Extras: claude: #1 plausible (minor: the planning ranges sit below the hit counts the research saw). codex: none.
- Serious: none.

### q81-h2o2-nebulizer: judges passes in part / claude fix / codex fix
- Recall: series, trials and harm cases by route, with what was read (research; Brownstein's series is left out):
  claude missed / codex missed. Both report a different point: the harms left out from the trial and the Mexico
  series.
- Extras:
  - claude: #1 plausible; #2 plausible (stock strength and dilution); #3 plausible (lower-risk options for colds; a
    blinded comparison with saline); #4 plausible.
  - codex: #1 plausible (the same point as claude #1).
- Serious: none.

### q82-seller-forum: judges passes / claude fix / codex sound
- Recall: none.
- Extras:
  - claude: #1 plausible (checks the buyer can run: archive snapshots, reverse search); #2 plausible (the speed signal
    came after a single dose; the trial sizes); #3 plausible (the older trials are not mentioned in the body).
  - codex: none.
- Serious: none.

### r324-bacopa-rates: judges passes / claude fix / codex fix
- Recall: none.
- Extras:
  - claude: #1 plausible (no review of adverse events was read); #2 plausible (palpitations, 18% against 8%);
    #3 plausible (the serious-harm searches were not read); #4 plausible (absolute differences); #5 plausible (sleep,
    mood and headache are not in the audited trials).
  - codex: #1 plausible (28.6, 16.3, 16.3 and 14.3 points; NNH 4, 7, 7 and 7); #2 plausible (palpitations). These are
    the same points as claude #4 and #2.
- Serious: none.

## Counts for part 1

### Recall

There are 19 criteria not fully met: research 16, source 2, check 1. One is out of scope for both: o355-saffron's
`absence_claims` (source). That leaves 18 in scope: research 16, source 1, check 1.

| Checker | Class | Caught | Partly | Missed |
|---|---|---|---|---|
| claude | research (16) | 4 | 3 | 9 |
| claude | source (1) | 0 | 1 | 0 |
| claude | check (1) | 0 | 0 | 1 |
| claude | **all 18** | **4** | **4** | **10** |
| codex | research (16) | 0 | 0 | 16 |
| codex | source (1) | 0 | 0 | 1 |
| codex | check (1) | 0 | 0 | 1 |
| codex | **all 18** | **0** | **0** | **18** |

- Out of scope: 1, the same for both.
- Counted apart: q136-weak-lead-given's met fail condition (research), missed by both.
- The stops in o355-saffron and q135-two-week-trials are out of scope.

### Problems

claude: 126 problems in 35 turns, 3.60 per turn; 3 turns have none.
- Classified: 10 matched, 106 plausible, 6 style, 4 doubtful.
- Severity: 1 serious, 93 worth fixing, 32 minor.
- Kinds: number 32, gap 26, harm 20, unsupported 14, certainty 13, clarity 11, question 8, contradiction 2.

codex: 22 problems in 35 turns, 0.63 per turn; 21 turns have none.
- Classified: 0 matched, 22 plausible, 0 style, 0 doubtful.
- Severity: 1 serious, 21 worth fixing, 0 minor.
- Kinds: number 11, harm 4, gap 3, contradiction 2, question 1, clarity 1.

Per turn, in part-file order (claude/codex):

| Turn | Claude/Codex | Turn | Claude/Codex |
|---|---|---|---|
| o354-continue | 3/2 | q126-41-textbook | 0/0 |
| o354-continue.turn2 | 5/1 | q126-42-group-average | 0/0 |
| o354-emergency-first | 1/0 | q128-oral-liver | 4/2 |
| o354-work-left | 6/2 | q130-rabies-package | 5/0 |
| o355-best-ocd | 6/3 | q132-copper-b12 | 5/0 |
| o355-keto-thread | 4/0 | q132-copper-b12.turn2 | 3/0 |
| o355-saffron-fluvoxamine | 5/0 | q135-low-stakes | 4/0 |
| o355-scoped-list | 4/0 | q135-two-week-trials | 3/0 |
| o355-supplement-table | 6/2 | q135-urgent-treatment | 3/0 |
| o355-supplement-table.turn2 | 3/1 | q136-responders | 0/0 |
| o356-dropout-nausea | 3/0 | q136-symptom-scale | 1/0 |
| o356-short-monitoring | 2/0 | q136-weak-lead | 8/1 |
| o356-ssris-years | 5/1 | q136-weak-lead-given | 5/1 |
| o356-year-follow-up | 5/1 | q137-deep-research-report | 5/2 |
| q125-product-names | 1/0 | q79-handoff | 1/0 |
| q126-39-replication | 4/0 | q81-h2o2-nebulizer | 4/1 |
| q126-40-aura | 4/0 | q82-seller-forum | 3/0 |
| | | r324-bacopa-rates | 5/2 |

Which problems fall where:
- claude, matched (10): o355-best-ocd #2; o355-supplement-table.turn2 #2; o356-ssris-years #1, #3 and #4; q125 #1;
  q126-39 #1, #2 and #3; q135-urgent #2.
- claude, style (6): o354-emergency-first #1; o355-keto-thread #1; o356-dropout-nausea #3; o356-short-monitoring #1;
  q130 #5; q132.turn2 #3.
- claude, doubtful (4): o355-scoped-list #4 (a stated limit); q126-39 #4 (something the answer says); q132 #2
  (forum threads claude cannot see); q136-weak-lead #2 (a well-known fact).

### Serious problems
- claude, 1 (o355-scoped-list #1): quote ok, call number right, merits confirmed.
- codex, 1 (o354-work-left #1): quote ok, call numbers right, merits confirmed; the serious rating is generous.

### Verdicts against the judges'

The judges have 19 "passes" turns, 15 "in part" turns and 1 "fails" turn.

| Checker | On passes (19) | On in part (15) | On fails (1) | Matches |
|---|---|---|---|---|
| claude | sound 6, fix 13 | sound 2 (q125, q126-41), fix 13 | fix 1 | 19 of 35 |
| codex | sound 11, fix 8 | sound 10, fix 5 | fix 1 | 16 of 35 |

- Neither checker says unreliable anywhere.
- Three of the 15 "in part" turns have no in-scope unmet criterion in that turn: o355-saffron,
  o355-supplement-table turn 1 and q135-two-week-trials.
- On the other 12 "in part" turns, claude says fix on 10 and codex on 4 (o355-best-ocd, o355-supplement-table turn 2,
  o356-ssris-years, q81). Codex's fix verdicts there rest on problems that match no criterion.

### Criteria one checker caught and the other missed

Claude caught, codex missed (4):
- o355-supplement-table.turn2, each effect with its size: claude #2 gives the endpoint means for the "favorable" rows.
- o356-ssris-years, NNT about 7: claude #1 asks for the response-rate difference on the ≥35% outcome.
- o356-ssris-years, specific adverse-event rates: claude #4 says no source read gives the frequency of sexual
  dysfunction.
- q126-39, each study reconstructed: claude #1 to #3 give call 22's setup, 6 of 8 against none, and 43 against 46.

Claude partly, codex missed (4):
- o355-best-ocd, the report's trials: claude #2 names inositol records that were never opened.
- o356-ssris-years, the short answer on years of use: claude #3 faults the same opening sentence.
- q125, seller and buyer usage: claude #1 asks for a plain "no supplier specification found".
- q135-urgent, the benefit made clear: claude #2 says antivenom's benefit is not quantified by anything read.

Codex caught, claude missed: none.

### Patterns
- **Recall.** Claude matches 8 of the 18 in-scope criteria (4 caught, 4 partly); codex matches none. Codex rates 8 of
  the 12 "in part" turns that have an in-scope unmet criterion as "sound" with no problems: q125, q126-39, q126-41,
  q130, q132 (both turns), q135-low-stakes and q135-urgent.
- **Precision.** All 22 of codex's problems are plausible. Of claude's 116 unmatched problems, 10 are style (6) or
  doubtful (4). The doubtful ones re-raise a stated limit or something the answer says, rely on content claude cannot
  see, or attack a well-known fact.
- **Overlap.** By my reading, 13 of codex's 22 problems make the same point as one of claude's, mostly absolute
  differences, NNT or NNH from counts, and omitted harms. Its 9 problems of its own include the one serious problem,
  a code-written line that contradicts the research (o354-work-left), which claude does not report.
- **Code-written lines.** Codex uses the allowed exception twice (o354-work-left; q128 #2) and claude once (q137 #1).
  Neither reports the fixed "Its results stay unreliable until they are reconciled." caveats that the judges note in
  o354-continue turn 2 and o355-supplement-table turn 2.
- **Shared blind spots.** Neither catches:
  - the specific missing leads the cases name: vitamin A in q132, Brownstein's series in q81, the oral-B12 trial, and
    "inactivated" in q130;
  - a set-aside lead given too much space: q136-weak-lead-given, where both summaries praise the Velmora section;
  - the textbook's evidence test in q126-41;
  - the burden of fixed caveats in q135-low-stakes, which the rules steer the checkers away from.
- **Numbers.** Both apply the NNT and NNH rule from counts. Codex rounds up consistently; claude once gives "about 4"
  for 23.4 points (o356-year-follow-up #1).
- **Verdicts.** Claude says fix on 13 of the 19 passing turns, always on unmatched extras; codex says fix on 8. Neither
  calls the one failing turn unreliable.
