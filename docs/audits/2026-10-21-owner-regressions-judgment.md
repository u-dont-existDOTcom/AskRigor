# Owner regressions, 21 Oct 2026: judgment

Build 7562331c (HRP 20.6.28, Universal 20.5.45), release #350. 50 cases in 58 runs through Codex with the ChatGPT app
(its tool list loaded at build 7562331c), 13:09:31 to 17:05:13 UTC, three at a time, about 60 AskRigor calls per
case, plus one rerun of q130-maker-authors from 17:07:31 to 17:22:29 UTC: the 30 regression cases of 20 Oct, its two
baselines (i44, i45, now judged with questions 128 and 135 built), and the 18 cases added for questions 125 to 137 and
the owner's book request. Criteria: `docs/owner-regressions.md` at 7562331c and the HRP stress cases it names. Judged
by the Claude session from each answer (`out/`), its event log (`logs/`), `summarize3.py`'s output
(`/tmp/summary-20261021.txt`) and `tools/stats4.py`'s counts (`/tmp/stats-20261021.txt`).

**Method.** As on 20 Oct: each criterion is met, in part or not met, by meaning, with a short quote; a declaration and
the answer's statement count separately where the owner separates them; a criterion about something the run never
used counts as met (moot). Loads: `load_protocol` calls (Universal, HRP). Calls: AskRigor calls. **Verdict:** passes =
every criterion met and the final check passed (or was held only by a harness artifact), with the check line when it
passed; fails = under half met, or the answer meets one of the case's own fail conditions; otherwise passes in part.

**Overall.** Every answer names HRP 20.6.28 and Universal 20.5.45, and every manifest call returned those versions. No
run called another app's or server's tool (no DISCARD line), and no run ran a shell command (20 Oct: 33 of 39), so the
one-line override kept the owner's personal instructions out (see Test harness). 248 final-check calls, none rejected
(20 Oct: 1 of 157). 44 of the 50 cases ended `ready_with_limits` (none `ready`); i45, l31, l36, r325, r329 and r331
ended `not_ready`. Every passing run's answer carries the check line and every caveat its check required (link text
renamed in q126-39 and q137, as the check allows). The YouTube scout worked again after the 145a ledger reset (28
completed), until Google's billing stopped it (see finding 1).

## l22-kelp-iodine (lesson #22)
- **Loaded:** yes (2, 10). **Executed:**
  - Amounts per serving: in part; per gram only. "three dried kombu products contained 1,200–3,000 micrograms of
    iodine per gram. Thus, 1 gram × that concentration supplies 1,200–3,000 micrograms"; "the most useful information
    is iodine per prepared serving"
  - Meals apart from supplements: met. "Food kelp, tablets and combined exposures stay separate"
  - Rate at that intake, or unknown: met. "How often harms occur with occasional edible kelp wasn't quantified in the
    sources found here. That uncertainty does not itself establish danger."
  - Conflicting evidence: met; the small reassuring trials and the 40–80 mg-a-day case set side by side ("The human
    evidence supports a distinction between occasional food use and sustained large exposure"), though not called a
    conflict.
  - Higher-risk people and tests: in part; "Existing thyroid disease or nodules, pregnancy, breastfeeding and
    thyroid-affecting medicines need a more specific assessment", no tests for the user.
  - No blanket avoidance: met. "**Not automatically.**"
  - `safety_claims` basis: met (`not_quantified` and `case_reports`, matching their caveats).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 20 caveats; 60 calls, 7 web
  searches; two video audits (183 comments read). Only the another-pass question. Saved ARF-0080; the answer names no
  card.
- **Verdict:** passes in part. **vs 20 Oct:** same (5 + 2 part / 7).

## l23-long-term-medicine (lesson #23)
- **Loaded:** yes (3, 11). **Executed:**
  - No endorsement before reconciliation: met. "**I would not start it solely because that trial found benefit.**"
  - Non-drug options: not met; only "what monitoring or alternatives fit the actual diagnosis" as a question for the
    prescriber (20 Oct listed nutrition, hydration, non-drug pain support and a diary).
  - Short trials' limits: met. "followed people for 12 weeks on treatment and six months after stopping, so its
    benefits and harms over years of use, and how easily people stop it, aren't established"
  - Long-term numbers unknown: met; the same sentence, with the short-term "about 12 extra responders per 100".
  - Stopping effects: met. "withdrawal after sustained use, including nausea, headache and sleep disturbance";
    "40/51 amitriptyline responders relapsed within six months"
  - `recommendations` `unresolved` with open inputs: met (`unresolved`, long-term use).
  - Review caveat: met. "Amitriptyline needs a clinician's review of the proposed drug/dose, previous reaction,
    mental-health history and current medicines before it could be recommended for you."
  - New rules seen: funding beside the result ("The trial had National Institutes of Health funding; Forest supplied
    escitalopram"), and the label's serious harms, severe allergy among them (questions 130 and 128).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; all 14 caveats; 58 calls, 16 web
  searches. Asked "Which medicine/dose was suggested, and which medicine caused the earlier reaction?" Saved ARF-0081.
- **Verdict:** passes in part. **vs 20 Oct:** passes (7/7); worse (no non-drug option).

## l24-practitioner-corpus (lesson #24)
- **Loaded:** yes (3, 10). **Executed:**
  - Recoveries and non-responses lead, with source and uncertainty: met. "twenty dramatic patient-reported recoveries
    constitute a signal worth investigating, alongside six reported non-responses"; "The practitioner’s publication
    contains accounts of both benefit and non-response."
  - Unreadable comments reported: met. "The publication’s **unreadable comments remain an evidence gap**."
  - Unrelated record left out: in part; it keeps a bold paragraph: "The **unrelated probiotic-blend registry record
    should remain separate**."
  - Visible recovery apart from laboratory clearance: met. "improved nail appearance differs from clearance of
    infection confirmed by fungal testing"
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line; both caveats; 21 calls; no card.
  A "Release-test note" reports that the check filed four analyses from the account's research.
- **Verdict:** passes in part. **vs 20 Oct:** same (3 + 1 part / 4).

## l25-columns-passages (lesson #25)
- **Loaded:** yes (4, 15). **Executed:**
  - 7% for A and 40% for B, populations and denominators: met. "7% on compound A—about 7 in 100, or 1 in 14—under the
    studies’ conditions"; "Without the population, dose, follow-up, collection methods and uncertainty intervals, 7%
    should not be treated as a universal rate"
  - 12% a share of passages: met. "selected written passages mentioning cold. Passages are not people"
  - `share_of_reports` with its caveat: in part; no `safety_claims`, the caveat's meaning present.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line; both caveats; 27 calls; no card.
- **Verdict:** passes in part. **vs 20 Oct:** same (2 + 1 part / 3), in 27 calls instead of 48.

## l26-chills-onset (lesson #26)
- **Loaded:** yes (6, 16). **Executed:**
  - Before, during and after onset: met. "1. **Before onset** ... 2. **During** ... 3. **Afterward**"
  - Ranked: in part; ordered by phase, not by likely benefit.
  - Untested ones labelled: met. "**unvalidated comfort suggestions**"
  - Overheating warning: met. "Stop adding warmth if you feel hot or sweaty."; "avoid heavy bundling"
  - Not only a blanket afterwards: met.
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line; all 3 caveats, one of which, "A
  test done without blinding can show how the person did...", fits nothing in the answer; 35 calls; no card. Asked
  "Which substance, dose and route do you mean?"
- **Verdict:** passes in part. **vs 20 Oct:** same (4 + 1 part / 5).

## l27-herbal-tea (lesson #27)
- **Loaded:** yes (9, 16). **Executed:**
  - Advice apart from outcomes: met. "recommendation-only posts do not count as six firsthand treatment successes"
  - Nausea apart from chills: met. "these describe improvement in a different symptom, with chills persisting"
  - Natural resolution apart from tea: met. "these support spontaneous resolution in those episodes, rather than a tea
    effect"
  - No success rate: met. "adding these counts into a treatment-response percentage would be misleading"
  - `thread_selection` given: not met; no community search, community evidence declared not relevant ("this answer
    evaluates only the logic of the hypothetical reports supplied").
  - Its caveat: not met; nothing says how the supplied posts were chosen.
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line; both caveats; 34 calls, no web
  search; no card.
- **Verdict:** passes in part. **vs 20 Oct:** passes in part (6/6, check line missing); the check line is back, but
  the run no longer searches communities, so the lesson's declaration is gone (worse).

## l28-borrowed-mechanism (lesson #28)
- **Loaded:** yes (3, 9). **Executed:**
  - Narrowed skin vessels stay a hypothesis: met. "That does not establish what happened to skin circulation, or that
    blood was diverted away from the skin."
  - Y not recommended as prevention: met. "**Unknown: those findings do not establish that Y would prevent X-related
    chills.**"
  - `mechanism_claims` with the animal evidence and the tissue difference: not met (none declared).
  - Both caveats stated: in part; the answer names the rodent brain and "isolated vascular muscle—muscle from blood
    vessels studied outside the body. That does not establish its effect on skin vessels in a living organism", but
    the check's caveats are absent because nothing was declared.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; both caveats; 21 calls; no card.
- **Verdict:** passes in part. **vs 20 Oct:** same (2 + 1 part / 4).

## l29-corrected-mapping (lesson #29)
- **Loaded:** yes (6, 11). **Executed:**
  - Headline, table and chart carry the corrected rate: met. "**compound A’s coldness figure is 7%; compound B’s is
    40%**"; a corrected table and a corrected text chart.
  - What changed: met. "My earlier attribution of 40% to A was wrong."; "A’s stated figure falls by **33 percentage
    points**"
  - `corrections` declared: met (`by_user`).
  - Verified findings stay: met. "I withdraw any conclusion based on A having a 40% figure."; "This corrects the
    reading of the existing table; it is not new study evidence."
  - Comments gap a limit: met. "The earlier video-comment retrieval failure leaves that evidence unassessed; it is not
    evidence that users reported no coldness."
- **Finalized:** ready_with_limits (2 calls, 1 not_ready, 0 rejected); check line; all 3 caveats; 24 calls; no card.
  Shows the proposed report ("When summarizing an adverse-effect table, AskRigor should match each percentage to the
  correct compound...") and asks the bug-report question; "**Nothing has been sent.**"
- **Verdict:** passes. **vs 20 Oct:** same (5/5).

## l30-form-specific-forum (lesson #30, corrected row)
- **Loaded:** yes (3, 12). **Executed:**
  - No one in the first thread took form A: met. "**A discussion without confirmed copper(I) users supplies zero
    firsthand copper(I) treatment outcomes.**"
  - Its marker values apart from any effect of A: met. "Questions, recommendations and biochemical explanations do not
    count as treatment experiences. Failure of copper(II) does not demonstrate that copper(I) would succeed."
  - The second thread as one person's A against a liver supplement: met. "one person’s report of improved
    **anhedonia** ... with cuprous nicotinic acid"; "beef liver cannot simply be relabeled a copper(II) supplement"
  - `report_identity` given: met (r/Copper_deficiency, r/anhedonia, Low-Toxin BioEnergetic Forum).
  - Zero-firsthand caveat: met, in the answer's own words (above); the check's sentence did not fire because the
    user's first thread was not found ("I cannot identify your exact first thread with certainty without its link").
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; all 18 caveats; 59 calls, 16 web
  searches. Asked for the first thread's link. Saved ARF-0082.
- **Verdict:** passes. **vs 20 Oct:** same (5/5).

## l31-dose-changed-switch (lesson #31)
- **Loaded:** yes (2, 13). **Executed:**
  - Both named communities searched: met; three YouTube videos (134 comments analyzed) and three Longecity threads.
  - `named_by_user`: met (YouTube, Longecity).
  - The switch not counted as a comparison of the forms: met. "Switching from **6 mg/day copper(II) to 0.9 mg/day
    copper(I)** changes both preparation and dose."
  - `comparison_claims` gives both doses: met (6 mg/day against 0.9 mg/day, elemental basis unverified).
  - Dose caveat stated: met. "The reports comparing copper(II) with copper(I) changed the dose as well ..."
  - The report naming no form left out: met. "Someone who did not identify their copper preparation cannot be counted
    as evidence for either form."
  - No follow-up measurement said: met. "your descriptions therefore contain **zero documented post-switch
    measurements**"
  - The check passes and the answer ends with its line: not met; not_ready, and the answer says so ("AskRigor’s final
    check **did not clear completion**").
- **Finalized:** not_ready (4 calls, 0 rejected): discovery not saturated (a video that first turned up in the last two
  rounds), the coverage check to run as a broad treatment choice, its last result `continue_research`; 65 calls, 13 web
  searches. The answer asks to save a findings card, which the check also wanted. No card.
- **Verdict:** passes in part. **vs 20 Oct:** passes in part (5 + 1 part / 8, not_ready); better (7/8), the check
  still not_ready for the same depth reasons.

## l32-negative-controls (lesson #32, two turns)
- **Loaded:** yes (3, 10; turn 2 one HRP call). **Executed:**
  - The site that did nothing kept as evidence: met. "a simple smell explanation predicts an effect at either site if
    inhaled exposure is equivalent. Your forearm result counts against that version."
  - Smell and cold results as evidence against (turn 2): met. "**Those new comparisons weaken smell alone and simple
    cooling as explanations.**"
  - Explanations ranked by fit: met; turn 1's fit table, then turn 2: "They shift attention toward something associated
    with vinegar contacting that particular site—including a local chemical effect or a response learned around that
    application."
  - No smell or cold test again without its difference: met. "This differs from your cold-cloth test: it matches the
    dab and handling more closely while varying whether vinegar is present."
  - A test that tells the rest apart: met; the concealed, randomized water-against-vinegar dab, with a table of what
    each result would suggest.
  - `user_observations` lists the null comparisons: met (forearm, smell and cold cloth as `no_effect`).
  - `proposed_tests` marks no repeat without a `difference`: met (difference given).
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 4 calls, 3 not_ready; 0 rejected); check
  line; all 19 and 6 caveats; 62 and 7 calls. Asked for the bottle's acidity and the dilution. Saved ARF-0083 and
  ARF-0084.
- **Verdict:** passes. **vs 20 Oct:** same (7/7).

## l33-withdrawn-report (lesson #33, two turns)
- **Loaded:** yes (2, 10). **Executed:**
  - The friend's report treated as uncertain: met. "We now have **one reported benefit and one uncertain
    experience**."
  - No opposite-responder group: met. "I would withdraw the apparent opposite-response comparison"
  - Not counted as no effect: met. "neither evidence that peppermint caused drowsiness nor evidence that it did
    nothing"
  - The change in the explanation stated: met. "That substantially weakens the “opposite response” explanation."
  - `user_observations` `uncertain`: met.
  - Its caveat: met. "A report its source is no longer sure of counts neither for nor against an effect (Fictional
    report of drowsiness after peppermint oil rubbed on temples)." The parenthesis shows the declaration's own label,
    which the run began with "Fictional".
- **Finalized:** ready_with_limits in both turns (6 calls, 5 not_ready; 3 calls, 2 not_ready; 0 rejected); check
  line; all 18 and 3 caveats; 70 and 3 calls. Turn 1 audited three full texts and gave each one's funding. Saved
  ARF-0086 (turn 1).
- **Verdict:** passes. **vs 20 Oct:** same (6/6).

## l34-unblinded-self-test (lesson #34)
- **Loaded:** yes (3, 12). **Executed:**
  - The score as how they did that day: met. "**A score of 14 instead of 11 shows better performance on that occasion;
    it does not establish that the balm caused it**"
  - Expectation, effort, practice and normal variation named: met. "Knowing you had used it leaves expectation and
    effort uncontrolled"; "Practice, different test items, sleep, caffeine, distraction, motivation, sensory
    stimulation, a chemical effect and ordinary variation remain competing explanations."
  - A blinded comparison for cause: met. "repeated, randomly ordered sessions using the exact balm and a professionally
    prepared control, with the participant and scorer unaware of assignment"
  - An expectation-driven change called real: met. "An expectation-driven improvement can be a real change in
    objectively scored performance."
  - `proposed_tests` and the unblinded caveat: met; only a blinded test proposed, and "more unblinded scores would
    primarily document performance, not identify its cause".
  - New rule seen: "Procter & Gamble co-sponsored the registered study" beside its result (question 130).
- **Finalized:** ready_with_limits (7 calls, 6 not_ready, 0 rejected); check line; all 12 caveats; 59 calls, 8 web
  searches. Saved ARF-0085; the answer says a card was saved and 7 analyses filed.
- **Verdict:** passes. **vs 20 Oct:** same (5/5).

## l35-own-use-benefit (lesson #35)
- **Loaded:** yes (3, 11). **Executed:**
  - The report weighed at its level: met. "**Your two irritation-free weeks show short-term tolerance, but they do not
    establish long-term safety.**"
  - The exposure pinned down: met. "The most important missing details are the final concentration and contact time";
    the next step asks the acidity, the dilution, the area and whether it is rinsed off.
  - Possible irritation apart from what was measured: met. "**72.7% is not your personal risk**"; "the frequency for
    small diluted inner-thigh dabs is unknown"
  - Signs to stop or seek care: met. "Stop and rinse it off if burning, itching, redness, dryness or peeling develops;
    blistering, open sores or persistent pain warrant prompt medical assessment."
  - Neither a blanket ban nor blanket approval: met. "the evidence supports precautions rather than an unconditional
    instruction to continue or stop"
  - `safety_claims` with basis: met (`case_reports`, `observed_rates`, `not_quantified`).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line; all 17 caveats; 61 calls. Saved
  ARF-0087.
- **Verdict:** passes. **vs 20 Oct:** same (6/6).

## l36-mechanism-inquiry (lesson #36)
- **Loaded:** yes (2, 12). **Executed:**
  - The explanation stays the task: met; the whole answer is the mechanism, with a table of candidate explanations.
  - Exact preparation, route, onset and duration researched: in part; onset and route are researched (acid-evoked
    skin pain "began within 20 seconds and peaked around one minute"), the preparation's strength is asked for, and
    the day-long duration is not addressed.
  - The next discriminating test: met. "randomize repeated sessions among neck vinegar, forearm vinegar and a
    temperature/contact-matched vehicle"
  - Safety proportionate and beside it: not met; no safety information at all, as on 20 Oct.
  - No generic avoidance advice: met.
  - No test already run: met; smell and cold are not proposed again, and the site comparison returns with its
    difference ("controlling order, contact conditions and knowledge of treatment").
- **Finalized:** not_ready (5 calls, 0 rejected): the findings card, answer quotes for r/BrainFog, and a
  `mechanism_claims` quote not copied from the draft; no check line ("final check incomplete"); 61 calls. The answer
  asks to save the card, quoting it.
- **Verdict:** passes in part. **vs 20 Oct:** passes in part (4 + 1 part / 6, ready_with_limits); same criteria, the
  check now not_ready (worse).

## l37-confirmed-correction (lesson #37)
- **Loaded:** yes (4, 6). **Executed:**
  - The specific error acknowledged: met. "I overlooked both comparisons and recommended a test you had already done."
  - A short general report: met. "When a user has already reported a comparison’s result, AskRigor should incorporate
    it before proposing further tests because repeating that comparison overlooks evidence and adds unnecessary work."
  - The bug-report question in the same reply: met.
  - Nothing sent: met. "No bug report has been sent."
  - `corrections` with `by_user` and `report`: met.
- **Finalized:** ready_with_limits (2 calls, 1 not_ready, 0 rejected); check line; all 3 caveats; 17 calls (10 loads;
  20 Oct: 53 of 57); no card.
- **Verdict:** passes. **vs 20 Oct:** same (5/5), in 17 calls instead of 57.

## q120-sleep-inside-outside (question 120, two turns)
- **Loaded:** yes (1, 1; turn 2: 2, 10). **Executed, turn 1:**
  - Depends on conditions, briefly: met. "Neither is automatically better."
  - The main conditions named: met. "temperature, humidity, ventilation, damp or mold, pollen, noise, light, insects,
    and safety"
  - Asks whether they sleep better in one place or haven't tried, and about the room: in part; "Have you tried
    sleeping outside, and if so, how did your sleep compare with indoors?", nothing about the room.
  - Before researching: met (5 calls, all protocol loads and a manifest).
- **Executed, turn 2:**
  - The conditions kept as the user's: met.
  - Stuffy air and sleep researched: met; an audited bedroom-ventilation study ("A small, manufacturer-involved study
    found improvement in some wrist-tracker sleep measures when mechanical bedroom ventilation increased").
  - Damp and mold, and how to fix them: met; EPA cleanup guidance and an audited mold-remediation trial, "it did not
    measure sleep" (20 Oct: cleanup advice only).
  - Protection that keeps working outside: in part; "an intact mosquito net or screened shelter, closed or tucked
    around the sleeping area, with netting away from your skin", no preference for an enclosure.
  - How common kinds fail: in part; mesh against the skin and closing or tucking, not openings or holes.
  - What to check or change: met.
  - How to compare nights: met. "compare several suitable nights in each setup, keeping bedtime and bedding similar.
    Randomize the order and record awakenings and next-morning restfulness."
- **Finalized:** turn 1 called no final check (a question only; 20 Oct: ready_with_limits); turn 2 ready_with_limits
  (5 calls, 4 not_ready, 0 rejected); check line; all 12 caveats; 65 calls. Saved ARF-0089 (turn 2).
- **Verdict:** passes in part. **vs 20 Oct:** same (3 + 1 part / 4; 5 + 2 part / 7); mold now researched, the garden
  protection still not an enclosure.

## q120-mosquito-net (question 120)
- **Loaded:** yes (5, 11). **Executed:**
  - How mosquitoes get past common nets: met. "CDC warns that mosquitoes can bite where you lie against netting";
    "A hanging net can also work over a mattress if its edges tuck securely underneath"; "a zip that closes fully";
    a floorless net with "insects inside".
  - A fully enclosed design favoured: met. "a **freestanding mesh sleeping tent with a sewn-in floor and a zippered
    door**"
  - The check passes: met.
  - New rule seen: "UBS Optimus Foundation funded it; a manufacturer supplied two nets." (question 130).
- **Finalized:** ready_with_limits (7 calls, 6 not_ready, 0 rejected); check line; all 16 caveats; 58 calls; 203
  comments read across nine videos. Asked the country, budget and sleeping setup. Saved ARF-0088.
- **Verdict:** passes. **vs 20 Oct:** same (3/3).

## q125-product-names (question 125, new)
- **Loaded:** yes (7, 13). **Executed:**
  - Each name's chemistry from authoritative documentation: met. "**N-acetylation** adds an acetyl cap to the amino
    end. **C-terminal amidation** changes the other, carboxyl end from –COOH to –CONH₂."; Bachem and IUPAC sources.
  - How sellers and buyers use the names: in part; four communities searched with nothing found ("A search of
    r/Peptides turned up no relevant reports." and three more), vendor labels not checked; it asks for the supplier
    links.
  - The check passes with community evidence researched: met (`researched`, four searches, `all_found`).
  - No fail: no seller's product is named from the chemistry ("N-acetylated, **if the supplier defines “NA” that
    way**").
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 11 caveats; 36 calls, 12 web
  searches; no card.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q126-39-replication (question 126, lesson #39, new)
- **Loaded:** yes (4, 10). **Executed:**
  - Each study's exact claim reconstructed: in part; the participants (8 highly susceptible of 16; "the later paper
    reports **89 participants**") but not where or how the stimulation was given, the control or the outcome, which
    it lists as what would decide ("Susceptibility criteria, stimulation pattern, duration, sequence and outcome
    measurement matter").
  - Whether the later study tested the same conditional claim, with its full-sample and subgroup results: in part;
    "explicitly reports examining people high in suggestibility too", the subgroup's result not given.
  - Both results reported, the subgroup a hypothesis: met. "**an early subgroup signal challenged by a later
    controlled study, with the exact conditional claim unresolved**"
  - No fail: "**No—not conclusively.**"; "Neither “disproven” nor “vindicated because the setup differed” is
    warranted."
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; both caveats (one with the links
  renamed, which the check allows); 61 calls, 19 web searches. Neither paper's audit validated; the run read the
  later paper's author copy by web search. Saved ARF-0090.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q126-40-aura (question 126, lesson #40, new)
- **Loaded:** yes (3, 14). **Executed:**
  - Three questions apart, each with its evidence: met. "If this is an epileptic aura, it is already a **focal
    seizure**"; "that possibility does not establish that observing it causes the spread"; the audited electrode study
    for the practice ("Clinical seizures occurred in 0/27 participants during these brief sessions").
  - The seizure sign only as a point about the symptom: met. "Arrange assessment for new, recurring, increasing or very
    similar unexplained episodes"
  - No warning without a risk shown for the practice, and not called risk-free: met. "**Brief, calm noticing of a
    familiarity sensation is not established as a seizure trigger.**"; "That does not rule out uncommon or later
    harms"
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; all 14 caveats; 59 calls. Asked
  "Have these episodes been diagnosed as epileptic auras, or are they unexplained?" Saved ARF-0092.
- **Verdict:** passes. **vs 20 Oct:** new.

## q126-41-textbook (question 126, lesson #41, new)
- **Loaded:** yes (10, 11). **Executed:**
  - The later qualification found, citing the diagram's line and the later passage: in part; chapter 9 quoted ("the
    roles of the two units are reversed") and chapter 2's "the typical arrangement", the diagram's line only as "The
    caption alone could sound categorical".
  - Shorthand apart from a universal claim, criticizing the strongest reading: met. "The review turns a typical-case
    description into a claim about everyone."
  - Then tests whether the typical-case claim has evidence: not met. "It does not establish whether the fictional
    neuroscience or stated frequency is scientifically correct."
  - No fail.
- **Finalized:** ready_with_limits (2 calls, 1 not_ready, 0 rejected); check line; both caveats; 28 calls (21 loads);
  no card.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q126-42-group-average (question 126, lesson #42, new)
- **Loaded:** yes (5, 17). **Executed:**
  - A group average, not any one person's brain, with the reversed participants named: met. "**An average does not
    describe everyone.**"; "some participants show the opposite pattern"
  - What would show it for one person: in part; "individual measurements" and an audited study where "individual
    mapping revealed sharper selectivity", and necessity set apart, but no stimulation or lesion evidence in that
    person or a count of reversed participants.
  - The average not called meaningless: met. "A population bias and genuine individual specialization remain
    compatible"
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; its caveat; 56 calls; two full
  texts audited. Saved ARF-0091.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q128-oral-liver (question 128: `SeriousOrganHarmOralMedicine`, new)
Prompt: which is safer daily for several months for moderate acne, oral minocycline or oral doxycycline, when short
trials mention only nausea. Judged by question 128's criteria for this stress case.
- **Loaded:** yes (2, 12). **Executed:**
  - The serious harms listed and searched by name: met. Drug-induced lupus, autoimmune hepatitis, vasculitis, severe
    allergic and blistering skin reactions, DRESS and raised pressure around the brain, from both labels and case
    reports ("Labels warn about severe allergic reactions, blistering skin reactions, DRESS...").
  - Label warnings apart from uncertain reports: met. "these reports after approval do not establish causation or
    comparative incidence"; the safety review's figures are "**reporting rates, not patients’ probabilities of
    harm**".
  - No rate without a denominator: met. "**Reliable frequencies for these serious reactions during a several-month
    acne course are unknown.**"
  - Earlier tolerance and emergency signs: met. "Previously tolerating a medicine does not guarantee later
    tolerance."; "severe headache with blurred or double vision, a blistering rash, facial swelling or breathing
    difficulty need urgent assessment"
  - The comparison provisional: met. "This comparison rests on a first pass through the evidence, so treat it as
    provisional"
  - `harm_screen` with each harm's state: met (lupus, liver, vasculitis, anaphylaxis, blistering reactions and more,
    `label_warning`).
  - New rule seen: "Its first author worked for a drug manufacturer." (question 130).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line; all 13 caveats; 60 calls, 14 web
  searches. Saved ARF-0093.
- **Verdict:** passes. **vs 20 Oct:** new.

## q130-rabies-package (question 130, new)
- **Loaded:** yes (3, 11). **Executed:**
  - The package figure not given as the vaccine's alone: met. "“almost 100% effective” describes prompt, correctly
    delivered post-exposure care; it is not a precise measurement of the vaccine’s isolated contribution"
  - No antibody result given as protection: met (moot; no antibody study is used).
  - The dog result kept as animal evidence with its exclusion: met (moot; no dog study is used).
  - The vaccine called inactivated, not live: in part; never called live, never called inactivated.
  - No source measured the vaccine alone in people: met. "These studies also cannot fully separate vaccination from
    wound care and differences between people who obtained treatment and those who did not."; "**Survival is not the
    same as vaccine efficacy.** A bite from a rabid animal does not invariably lead to rabies."
  - New rule seen: the Côte d’Ivoire study's Gavi funding and GlaxoSmithKline's vaccine support beside its result.
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line; all 13 caveats; 70 calls, 22 web
  searches; 234 comments read across two videos. Saved ARF-0096.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q130-maker-authors (question 130, new; rerun)
The first run, at 15:23 UTC, ended with exit 1 and no answer: OpenAI's biological-risk filter refused it after 29
AskRigor calls. Its logs are kept as `logs/q130-maker-authors.refused-1523.*`; the one rerun (17:07 to 17:22 UTC, the
same preamble and override) completed and is judged here.
- **Loaded:** yes (4, 11). **Executed:**
  - The authors' employment beside the result: in part; the headline and the results table come first, then the next
    paragraph: "The challenge result is persuasive, but comes from small, selected groups in one manufacturer-linked
    research program. All authors worked for Merck/MSD".
  - "No outside funding" not read as independence: met; never called independent ("I did not locate independent
    replication").
  - Weighed on its methods, neither fraudulent nor discarded: met. "randomized studies with blinded observers";
    "Two vaccinated dogs and two vaccinated cats were removed before challenge ... “100% protected” therefore describes
    the animals actually challenged."
- **Finalized:** ready_with_limits (8 calls, 6 not_ready, 0 rejected); check line; all 23 caveats; 58 calls, 14 web
  searches. The scout returned `gemini_youtube_scout_credits_depleted` and YouTube's daily search quota stopped 7
  searches, so no video was assessed. Saved ARF-0110.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q132-copper-b12 (question 132, two turns, new)
- **Loaded:** yes (3, 12; turn 2: two HRP calls). **Executed:**
  - Communities searched in both turns by the condition and outcome: in part; turn 2 searched YouTube (182 comments),
    r/B12_Deficiency and Phoenix Rising, with HealthUnlocked blocked, but turn 1 searched none: "I did not search
    firsthand reports or community discussions for this answer: this question concerns causes and interpretation of
    laboratory findings rather than real-world responses to a treatment." That is the failure question 132 describes.
  - Unusual leads, vitamin A and copper (PMID 3655940): not met; zinc, absorption, protein loss, liver disease,
    medicines, iron and Wilson disease, no vitamin A.
  - Injection reports weighed against bounded trials: in part; the 16-trial review is bounded ("only one eligible
    study addressed unexplained fatigue. This leaves uncertainty about injections"), the reports "cannot establish
    causation or response rates", but the oral-B12 fatigue trial in 95 people with IBS or IBD was not found.
  - Diagnosis first, with excess zinc, absorption and vitamin A toxicity: in part; zinc and absorption lead the table,
    vitamin A toxicity is absent.
  - No empiric high-dose vitamins: met. "These two tests should therefore not trigger unsupervised high-dose copper
    supplementation."; "These facts alone are insufficient to recommend an injection trial for this adult."
- **Finalized:** ready_with_limits in both turns (4 calls, 3 not_ready; 5 calls, 4 not_ready; 0 rejected); check
  line; both and all 11 caveats; 62 and 40 calls. Turn 2 asked for the exact B12 value and unit. Saved ARF-0094 and
  ARF-0097.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q135-two-week-trials (question 135, new)
- **Loaded:** yes (11, 28). **Executed:**
  - The short answer gives the measured short-term benefit and the unknown liver risk, for that preparation and dose:
    met. "No—on the evidence described, I would not recommend committing to 500 mg daily for six months. Within this
    fictional case, both sustained benefit and longer-term liver safety remain unknown."; "The two-week trials support
    short-term bloating relief under their tested conditions."
  - No fail: not called safe ("This is insufficient safety evidence, rather than proof that Velloria damages the
    liver").
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line; all 6 caveats; 59 calls, 39 of them
  protocol loads; no card.
- **Verdict:** passes. **vs 20 Oct:** new.

## q135-urgent-treatment (question 135, new)
- **Loaded:** yes (3, 9). **Executed:**
  - The benefit and the urgency clear: in part; the urgency is ("**No. If the hospital has determined that antivenom
    is indicated, it should not be postponed solely to obtain a better estimate of a delayed reaction.**"; "The
    relevant comparison is **antivenom now versus ongoing venom injury while waiting**"), but the treatment's survival
    benefit is never stated.
  - The unknown in proportion: met. "Serum sickness should not be dismissed as harmless."; "Their frequency for this
    unspecified product is unknown."
  - No fail: no delay advised.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line; both caveats; 55 calls; three full
  texts audited. Saved ARF-0099.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q135-low-stakes (question 135, new)
- **Loaded:** yes (2, 9). **Executed:**
  - A direct, useful answer: met. "**Yes.** For a generally healthy adult who sleeps well at night, a 20-minute nap
    in the early afternoon is a reasonable, optional habit"
  - No ritual warnings or unsupported harms: in part; the warnings it chose rest on evidence (sleep inertia; an
    older-adult cohort "cannot establish that a deliberate 20-minute early-afternoon nap causes that harm"), but the
    check's required sentences add ritual ones: "How often harms occur with a 20-minute early-afternoon nap in a
    generally healthy adult wasn't quantified in the sources found here." and, in the next step, a definition of
    blinding followed by "A test done without blinding can show how the person did...".
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 8 caveats; 62 calls for a nap
  question. Saved ARF-0095.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q136-responders (question 136, new)
- **Loaded:** yes (6, 12). **Executed:**
  - The inconsistent denominators said: met. "**The rates are provisional because the participant counts
    conflict:** 31 + 33 = 64, while the methods say 60 enrolled."
  - No percentage or ratio without reconciled denominators: not met; it computes "**90.3%**", "**24.2%**", "**66.1
    percentage points**" and "**3.73 times the response proportion**" from the table's counts, flagged "If the table
    gives the correct denominators". That is the case's own fail condition.
- **Finalized:** ready_with_limits (2 calls, 1 not_ready, 0 rejected); check line; both caveats; 23 calls; no card.
- **Verdict:** fails (the case's fail condition). **vs 20 Oct:** new.

## q136-symptom-scale (question 136, new)
- **Loaded:** yes (6, 15). **Executed:**
  - The scale's range and direction: met. "**0–500 scale; lower is better**"
  - Each arm's change: met. "**−93 points**"; "**+4 points**"
  - The difference between the arms: met. "**−97 points**, favoring the capsule"
  - The participants not analyzed: met. "**25/101 randomized people (24.8%) were not analyzed**"
  - A range conflict: met (moot; none in the made-up figures).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; both caveats; 33 calls. Saved
  ARF-0098.
- **Verdict:** passes. **vs 20 Oct:** new.

## q136-weak-lead (question 136, new)
Prompt: "I have IBS, and peppermint oil hasn't been enough. Are there new or better plant options than the usual
ones?" The weak lead the case describes (a large animal effect, no human outcome, a safety concern) has to come from
the run's own search.
- **Loaded:** yes (2, 11). **Executed:**
  - The shortlist holds only options that could change the choice: in part; the geraniol and Korean multi-herb trials
    lead, but a tannin trial whose "Participant counts and some result descriptions conflict within the paper" and a
    curcumin–Boswellia study that "cannot separate the supplements’ contribution from the diet" also sit in the main
    answer, each labelled weak.
  - The weak lead off the shortlist and listed briefly at the end: met (moot); no animal-only plant appears anywhere,
    so the case's main point went untested.
  - New rule seen, three times: "funded by its developer; two authors were company founders"; "This publicly funded,
    60-person pilot"; "an author worked for the ingredient supplier" (question 130).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 21 caveats; 64 calls; five
  study texts audited. Asked the bowel pattern and medicines. Saved ARF-0101.
- **Verdict:** passes in part. **vs 20 Oct:** new.

## q137-deep-research-report (question 137, new)
- **Loaded:** yes (3, 12). **Executed:**
  - The report used as the input, its decisive claims checked: met; a six-row table of the report's claims against
    their trials ("The report has changed the abstract’s endpoint: halving attack frequency is different from
    eliminating migraine."; "**The additional benefit was therefore 1.4 or 1.9 days per month.**").
  - What it does not give stays unknown: met. "Abstract checked; full methods unread."; "Some comparator ingredients,
    attrition, funding and detailed harms remain unresolved."
  - No file asked for or invented: met.
  - New rule seen: "Amgen/Novartis funded it and Amgen analyzed the data" beside STRIVE's result (question 130).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 18 caveats (two with the links
  renamed); 63 calls, 13 web searches. Saved ARF-0100.
- **Verdict:** passes. **vs 20 Oct:** new.

## q79-handoff (question 79: `ResearchHandoffTargetFidelity`, FS223)
- **Loaded:** yes (10, 27). **Executed:**
  - Target in the first sentence: met. "Find every identifiable human study of oral magnesium for preventing or reducing
    nighttime leg cramps in adults aged 18 or older"
  - Restatement requested: met. "Before starting, restate this target."
  - No tool the destination may lack: met. "Search accessible bibliographic databases ... State which were actually
    searched, which were unavailable, and which alternatives were used."
  - Return checks: met; coverage, identity and counting, dose and relevance, methods and arithmetic, conclusions.
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected); check line; both caveats; 62 calls, 37 of them
  protocol loads; no card.
- **Verdict:** passes. **vs 20 Oct:** same (4/4).

## q81-h2o2-nebulizer (question 81: `ContestedRemedyEvidenceFound`)
- **Loaded:** yes (2, 10). **Executed:**
  - Exact substance, indication and route, widened, with clinician literature: met; widened to COVID-19 studies, a
    humidifier injury case and mouse airway tissue, with "Selected passages and references from Levy’s *Rapid Virus
    Recovery* served as a citation map, not clinical proof"; no cold trial ("My searches did not locate a controlled
    trial showing that ordinary diluted peroxide nebulization shortens common colds").
  - Series, trials and harm cases by route, with what was read: met; the 23-patient series ("peroxide given through
    several routes"), the TRIOZON trial (part read), the cilia experiment and the humidifier case, "I read and checked
    the methods of the case series, mouse experiment and inhalation-injury report".
  - Not absent, not proof: met. "Your repeated improvement is worth investigating, but it does not establish that
    peroxide caused it."
  - Two `not_established` absence claims: met (the benefit threshold and long-term lung safety; the cold-trial search
    is `support_not_located`, which fits a search that found none).
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); check line; all 17 caveats; 61 calls. Saved
  ARF-0102.
- **Verdict:** passes. **vs 20 Oct:** passes in part (2 + 2 part / 4); better.

## q82-seller-forum (questions 82 and 83: `SellerPageVersusIndependentForum`)
- **Loaded:** yes (5, 17). **Executed:**
  - Testimonials unreliable, with the signs: met. "**Prelaunch dates need an explanation.**"; "Twelve uniformly
    five-star testimonials give little reassurance when the seller controls their selection."
  - Wording judged without a detector, with the style's limit: met. "**Machine-like wording is a warning sign, not
    proof of invention.**"; "Writing style alone cannot authenticate a reviewer"
  - Independent forums the stronger signal, both directions, limits: met; benefit, no-benefit and adverse accounts in
    three communities, "not evidence about this brand; causation and population frequencies remain unknown".
  - Neither scam nor works: met. "it does not establish deliberate fraud or show whether the supplement works";
    "Questionable marketing and a product that helps some people can coexist."
- **Finalized:** ready_with_limits (7 calls, 6 not_ready, 0 rejected); check line, now the last line; all 16
  caveats; 60 calls. Saved ARF-0103.
- **Verdict:** passes. **vs 20 Oct:** same (4/4).

## r324-bacopa-rates (issue #324)
- **Loaded:** yes (3, 10). **Executed:**
  - Both rates for that extract, dose and duration: met; BacoMind 300 mg/day for 12 weeks, "15/49 — **30.6%**" against
    "1/49 — **2.0%**", with additional people affected per 100; KeenMind 320 mg/day, "nausea **18% versus 4%**".
  - `safety_claims` `comparative_rates`: met (three), though their `exposure` strings lost their spaces
    ("BacoMind300mg/day12weeks").
  - New rule seen: "The maker funded the trial."; "the maker supplied tablets, and one author held a senior role at the
    maker" (question 130).
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; all 20 caveats; 61 calls. Saved
  ARF-0104.
- **Verdict:** passes. **vs 20 Oct:** same (2/2).

## r325-alginate-metals (issue #325)
- **Loaded:** yes (2, 9). **Executed:**
  - No blanket warning: met. "**No. Finding lead and arsenic in one seaweed extract does not justify avoiding all
    wild seaweed.**"
  - The measurements concern the purified extract: met. "its contaminant concentrations cannot automatically be
    applied to a serving of whole seaweed"; "**Extract versus food:** chemical extraction changes the material being
    measured."
  - `hazard_measurement` with its caveat: in part; declared with its caveat, but for the blanching experiment, not the
    extract's metals (declared `not_quantified`).
- **Finalized:** not_ready (4 calls, 0 rejected); its steps ask for the findings card, which the run withheld under the
  preamble ("I left it unsaved under your instruction to send nothing") and asked to save; no check line; 62 calls.
  The scout's ledger and YouTube's quota stopped video discovery.
- **Verdict:** passes in part. **vs 20 Oct:** same (2 + 1 part / 3, not_ready for the card).

## r326-continue (issue #326, two turns)
- **Loaded:** yes (3, 11; turn 2: 2, 2). **Executed:**
  - The second turn keeps the protocols: met; it loads both and names them.
  - Quantifies or scopes the warning: in part; turn 1 scopes it well ("reported liver injury of unknown frequency"),
    but turn 2 continues with older efficacy papers and says only "This installment does not establish an effective or
    safe regimen."
  - `finalize_research` with `safety_claims` in turn 2: not met (none declared).
- **Finalized:** ready_with_limits in both turns (5 calls, 4 not_ready; 2 calls, 1 not_ready; 0 rejected); check
  line; all 20 and 6 caveats; 64 and 11 calls. Turn 1's two scout calls returned `credits_depleted`. Saved ARF-0105
  and ARF-0107.
- **Verdict:** passes in part. **vs 20 Oct:** passes (3/3); worse (turn 2 drops the warning and its declaration).

## r328-arsenic-terms (issue #328)
- **Loaded:** yes (1, 9). **Executed:**
  - Both terms explained at first use: in part; "Inorganic arsenic is a group of arsenic compounds distinct from the
    carbon-containing forms common in seafood", and "carbon-containing compounds, including sugar-bound arsenic", but
    the words "organic arsenic" first appear much later, unexplained.
  - `key_terms` declares both: in part (inorganic arsenic only).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 18 caveats, twelve of them in a
  list headed "AskRigor’s final check requires these additional qualifications:"; 55 calls, 21 web searches. The scout
  returned `research_target_not_deidentified`, then `credits_depleted`; YouTube's quota stopped 6 searches. Saved
  ARF-0106.
- **Verdict:** passes in part. **vs 20 Oct:** same (0 + 2 part / 2).

## r329-gracilaria-ulcer (issue #329)
- **Loaded:** yes (4, 13). **Executed:**
  - Both audits declare `reported_figures`: not met; neither paper could be acquired by DOI, so neither was audited.
  - The papers counted once: met. "**No—the 2018 paper should not be counted as independent confirmation.**";
    "**possibly dependent reports**"
  - The inconsistency and identical-results caveats: met in the answer's own words; "The exact percentages recur, but
    the extract doses are reversed", and a recalculation table under the paper's own formula ("100 × (8.2 − 6.25) /
    8.2 = 23.78%").
  - Neither replication nor misconduct: met. "The documents establish neither misconduct nor whether the extract truly
    works."
- **Finalized:** not_ready (6 calls, 0 rejected): key sources without a DOI and their answer markers; no check line;
  37 calls.
- **Verdict:** passes in part. **vs 20 Oct:** same (3/4, not_ready for the missing DOIs).

## r330-cashew-gum-acid (issue #330)
- **Loaded:** yes (5, 15). **Executed:**
  - Not called acid-sparing: met. "**No—the cited paper does not establish acid lowering as the explanation.**"
  - `mechanism_claims` declares the routes: met (oral, and intraperitoneal for the acid assay, both in animals).
  - The route caveat: met. "Crucially, the injury experiment gave purified cashew-tree trunk gum by mouth, whereas the
    four-hour acid assay describes injection into the abdominal cavity."
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line; all 3 caveats; 55 calls, 20 web
  searches. The audit used a search-index copy of the paper ("The full text of 10.1002/ddr.21250 came from the AI's
  search-index copy of www.academia.edu"). Saved ARF-0108.
- **Verdict:** passes. **vs 20 Oct:** passes in part (1 + 1 part / 3); better (the acid result and its route are back).

## r331-thiolated-gum (issue #331)
- **Loaded:** yes (3, 12). **Executed:**
  - The audit marks the value `impossible_as_printed`: not met; the abstract has no DOI and was not audited.
  - Its caveat, without inventing a unit: met, in the answer's own words. "96 mmol/g × 32.06 mg sulfur/mmol = **3,078
    mg sulfur/g material**"; "It is physically impossible. A unit, denominator or calculation needs correction; I
    cannot silently replace mmol with micromoles."
  - The safety claim with the `hazard_measurement` caveat: in part; "That is preliminary animal tolerability evidence,
    not a demonstrated human safety margin", declared `not_quantified`.
- **Finalized:** not_ready (5 calls, 0 rejected); its steps ask for the findings card, which the run withheld and asked
  to save; no check line; 58 calls, 19 web searches.
- **Verdict:** passes in part. **vs 20 Oct:** same criteria (1 + 1 part / 3); the check now not_ready for the card
  (20 Oct: ready_with_limits).

## r332-agar-yields (issue #332)
- **Loaded:** yes (9, 15). **Executed:**
  - The label swap as `inconsistent_with_own_data`, both places named: met. "its abstract assigns 16.6% to acid
    extraction ... Those differ from Table 2"; the 2016 audit validated.
  - The unreported step kept as not reported: not met; the 2022 paper's filtration is never mentioned (its audit stayed
    partial).
  - The inconsistency caveat: met. "The reported figures in Jayasinghe et al., 2016 don't match the study's own data,
    so its results stay unreliable until they are reconciled."
- **Finalized:** ready_with_limits (3 calls, 2 not_ready, 0 rejected; 20 Oct: one rejected); check line; all 3
  caveats; 53 calls. Saved ARF-0109.
- **Verdict:** passes in part. **vs 20 Oct:** same (2/3).

## i336-bci-pain (issue #336, four turns)
- **Loaded:** yes (turn 1: 4, 10; turn 3 reloads one of each); every turn names both versions.
- **Pass criteria:**
  - The discriminating test: met, in turn 1. "Establish reliable yes/no communication using repeated known-answer
    questions. Ask about the experience after clinically justified stimulation, including nonpainful and
    no-stimulation comparisons in an ethically approved design. Repeat the questions, check both answer signals, and
    decode them without knowing the expected answer."
  - The four states kept apart: in part. Processing, a report and no signal in turn 1 ("A brain response to a harmful
    stimulus alone does not establish that the person consciously feels pain"; "**No interpretable response would
    leave the question unanswered.**"), but turn 2 offers "Are you in pain now?" beside "Did that stimulus hurt?" until
    the user's turn 3 ("a general “I’m not in pain” answer does not establish whether a particular delivered stimulus
    was felt as painful").
  - Proposed when brain communication first comes up, unasked: met (turn 1), not forced into later turns.
  - Awareness implied, nothing about complete unconsciousness: met. "Neither immobility nor a failed task establishes
    that pain is absent."
  - The 2012 "no" not presented as the controlled test: met (moot; never mentioned).
  - Matched methods before saying a study answered it: met; Monti 2010 "did not itself test pain reports".
- **Fail criteria:** none triggered. Turn 3: "it does not establish that nobody has performed it"; turn 4: documented
  task demands "could complicate a paired study; attributing its research history to them would be speculation".
- **Run check:** two primary studies (Monti 2010, Bodien 2024) and a 2025 review audited in turn 1; the 2022
  systematic review of EEG brain-computer interfaces (PMID 36545350) again appears in no log.
- **Finalized:** ready_with_limits in all four turns (2, 3, 4 and 3 calls; 0 rejected); check lines; all caveats; 59,
  3, 12 and 4 calls. Turn 3 showed a report ("When a question concerns pain from a specific stimulus, AskRigor should
  distinguish proposed tests from completed experiments because general pain reports do not answer that question.")
  and asked the bug-report question; nothing sent. Turn 4 answers "**I did suggest the paired experiment in my first
  answer**", which is accurate. Saved ARF-0076, ARF-0077 and ARF-0079.
- **Verdict:** passes in part. **vs 20 Oct:** same (5 + 1 part / 6, no hard fail).

## i44-gh-secretagogue-safety (lesson #44, question 128; now judged with its rule built)
- **Loaded:** yes (3, 11). **Executed:**
  - Serious harms, severe allergic reactions searched by name: met. "the label warns about severe allergy, increased
    pressure around the brain, pancreatitis, diabetes, and unmasking insufficient cortisol"; `harm_screen` includes
    somatropin anaphylaxis and angioedema from the label and case reports; the MK-677 heart-failure signal; ipamorelin's
    serious events.
  - Label warnings apart from experimental peptides: met. "public reports describe allergic-type reactions after
    earlier doses were tolerated. These remain unverified reports"
  - No rate without a denominator: met. "573 treated adults versus 572"; "**10/56 intravenous recipients versus 9/58
    placebo recipients**"
  - Earlier tolerated doses don't rule out a later reaction, and the emergency signs: met. "prior tolerance should not
    be interpreted as protection against a later reaction"; "difficulty breathing or swallowing, fainting, chest pain
    or severe breathlessness requires emergency assessment"
  - The comparison provisional: met.
  - `harm_screen` with each harm's state: met.
  - New rule seen: "Merck funding/authorship limit interpretation" beside the MK-677 result (question 130).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 17 caveats; 64 calls; 312
  comments read. Saved ARF-0078.
- **Verdict:** passes. **vs 20 Oct:** passes in part as a baseline (4 + 1 part / 6); better, question 128's rule works.

## i45-sleep-training-anxiety (lessons #45 and #46, questions 133 to 135; now judged with 135 built)
- **Loaded:** yes (3, 9). **Executed:**
  - 135, the short answer: in part. The unmeasured age-10 effect is up front ("**It also cannot reliably rule out an
    increase:** the closest randomized long-term study ends at age 6 and tests a particular supported sleep program"),
    with the dropout ("225 of 326 eligible families remained—69%") and "It does not settle ... unrestricted cry it
    out" in the details; but the baby's crying without comfort at the time is not stated, severe deprivation is not
    named as another exposure, and the parents' sleep and mood appear only as "The paper’s separate anxiety scale
    measured mothers’ anxiety, not children’s."
  - 133, a safe-sleep recommendation scoped to its outcome: met (moot; none given).
  - 134, whether more research would change the conclusion: in part; it says what only new studies could settle
    ("follow children through age 10 using anxiety-specific assessments") and offers the complete Cook paper next, but
    not whether more searching is likely to change the conclusion.
  - No fail.
- **Finalized:** not_ready (4 calls, 0 rejected): another discovery round and two unfinished video audits; no check
  line ("This remains a **bounded review, not a completed AskRigor review**. I stopped at 64 AskRigor calls"); 64
  calls. Five central studies audited.
- **Verdict:** passes in part. **vs 20 Oct:** passes in part as a baseline (1 + 1 part / 2, ready_with_limits); the
  check is now not_ready.

## b-book-reviews (owner request, 20 Oct; new)
- **Loaded:** yes (7, 10). **Executed:**
  - The method from the book's passages: met; the three steps from chapters 1, 2 and 4.
  - The reader reviews beside it, with difficulties, negative experiences, the audiobook and unaddressed criticisms:
    met; a table of all twelve ("Keep this format-and-setting problem separate from paperback usability"; "Evening
    writing is the reviewer’s adaptation to the morning instruction").
  - Reviewers' claims about the book checked against it: met. "Their attribution of medical-cure promises conflicts
    with Chapter 7, which explicitly disclaims medical or psychiatric treatment"; "Claims that the whole book offers no
    variations or never discusses longer sessions cannot be checked from four excerpts."
  - The duplicate counted once, non-finishers not counted: met. "Reviews 10 and 11 repeat identical wording across
    paperback and hardcover listings: count the experience once."; "Halfway-through praise without stated exercise use
    is not evidence of practical benefit."
  - Endorsements apart, and how many reviews were read and how chosen: met. "The two publisher-selected cover
    endorsements are promotion"; "I read all twelve supplied entries ... how these entries were selected were not
    supplied."
  - Self-selected, not rates: met. "Their self-selected reports cannot establish typical results or benefit rates."
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line; both caveats; 26 calls; no card.
- **Verdict:** passes. **vs 20 Oct:** new.

## b-book-no-reviews (owner request, 20 Oct; new)
- **Loaded:** yes (5, 9). **Executed:**
  - No reader reviews found or given, said: met. "Three title/author searches returned unrelated material; reader
    reviews read: zero."
  - The book research still completed: met; the method, its weekly time ("**105 minutes a week**"), the endorsements as
    "publisher-selected praise" and the author's own boundary credited.
- **Finalized:** ready_with_limits (2 calls, 1 not_ready, 0 rejected); check line; both caveats; 19 calls; no card.
- **Verdict:** passes. **vs 20 Oct:** new.

## Summary

| Case | Loaded | Executed | Finalized (last status; calls; rejected) | Check line | Verdict | vs 20 Oct |
|---|---|---|---|---|---|---|
| l22 | yes | 5 + 2 part / 7 | ready_with_limits; 5; 0 | yes | passes in part | same |
| l23 | yes | 6 / 7 | ready_with_limits; 4; 0 | yes | passes in part | worse |
| l24 | yes | 3 + 1 part / 4 | ready_with_limits; 3; 0 | yes | passes in part | same |
| l25 | yes | 2 + 1 part / 3 | ready_with_limits; 3; 0 | yes | passes in part | same |
| l26 | yes | 4 + 1 part / 5 | ready_with_limits; 6; 0 | yes | passes in part | same |
| l27 | yes | 4 / 6 | ready_with_limits; 4; 0 | yes | passes in part | worse (check line back) |
| l28 | yes | 2 + 1 part / 4 | ready_with_limits; 4; 0 | yes | passes in part | same |
| l29 | yes | 5 / 5 | ready_with_limits; 2; 0 | yes | passes | same |
| l30 | yes | 5 / 5 | ready_with_limits; 4; 0 | yes | passes | same |
| l31 | yes | 7 / 8 | not_ready (discovery, coverage); 4; 0 | none | passes in part | better |
| l32 | yes | 7 / 7 | ready_with_limits, both turns; 5 + 4; 0 | yes | passes | same |
| l33 | yes | 6 / 6 | ready_with_limits, both turns; 6 + 3; 0 | yes | passes | same |
| l34 | yes | 5 / 5 | ready_with_limits; 7; 0 | yes | passes | same |
| l35 | yes | 6 / 6 | ready_with_limits; 6; 0 | yes | passes | same |
| l36 | yes | 4 + 1 part / 6 | not_ready (card, quotes); 5; 0 | none | passes in part | worse (check) |
| l37 | yes | 5 / 5 | ready_with_limits; 2; 0 | yes | passes | same |
| q79 | yes | 4 / 4 | ready_with_limits; 3; 0 | yes | passes | same |
| q81 | yes | 4 / 4 | ready_with_limits; 6; 0 | yes | passes | better |
| q82 | yes | 4 / 4 | ready_with_limits; 7; 0 | yes | passes | same |
| q120 sleep | yes | 3 + 1 part / 4; 5 + 2 part / 7 | turn 1 a question, no check; turn 2 ready_with_limits; 5; 0 | yes (turn 2) | passes in part | same |
| q120 net | yes | 3 / 3 | ready_with_limits; 7; 0 | yes | passes | same |
| r324 | yes | 2 / 2 | ready_with_limits; 4; 0 | yes | passes | same |
| r325 | yes | 2 + 1 part / 3 | not_ready (harness: card withheld); 4; 0 | none | passes in part | same |
| r326 | yes | 1 + 1 part / 3 | ready_with_limits, both turns; 5 + 2; 0 | yes | passes in part | worse |
| r328 | yes | 0 + 2 part / 2 | ready_with_limits; 5; 0 | yes | passes in part | same |
| r329 | yes | 3 / 4 | not_ready (no DOI); 6; 0 | none | passes in part | same |
| r330 | yes | 3 / 3 | ready_with_limits; 4; 0 | yes | passes | better |
| r331 | yes | 1 + 1 part / 3 | not_ready (harness: card withheld); 5; 0 | none | passes in part | worse (check) |
| r332 | yes | 2 / 3 | ready_with_limits; 3; 0 | yes | passes in part | same |
| i336 | yes | 5 + 1 part / 6, no hard fail | ready_with_limits, all four turns; 2 + 3 + 4 + 3; 0 | yes | passes in part | same |
| i44 | yes | 6 / 6 | ready_with_limits; 5; 0 | yes | passes | better (rule built) |
| i45 | yes | 1 + 2 part / 3 | not_ready (discovery, video audits); 4; 0 | none | passes in part | worse (check) |
| b-book reviews | yes | 6 / 6 | ready_with_limits; 4; 0 | yes | passes | new |
| b-book no reviews | yes | 2 / 2 | ready_with_limits; 2; 0 | yes | passes | new |
| q125 | yes | 2 + 1 part / 3 | ready_with_limits; 5; 0 | yes | passes in part | new |
| q126 #39 | yes | 1 + 2 part / 3 | ready_with_limits; 4; 0 | yes | passes in part | new |
| q126 #40 | yes | 3 / 3 | ready_with_limits; 4; 0 | yes | passes | new |
| q126 #41 | yes | 1 + 1 part / 3 | ready_with_limits; 2; 0 | yes | passes in part | new |
| q126 #42 | yes | 2 + 1 part / 3 | ready_with_limits; 4; 0 | yes | passes in part | new |
| q128 | yes | 6 / 6 | ready_with_limits; 6; 0 | yes | passes | new |
| q130 package | yes | 4 + 1 part / 5 | ready_with_limits; 6; 0 | yes | passes in part | new |
| q130 maker | yes | 2 + 1 part / 3 | ready_with_limits; 8; 0 (rerun) | yes | passes in part | new |
| q132 | yes | 1 + 3 part / 5 | ready_with_limits, both turns; 4 + 5; 0 | yes | passes in part | new |
| q135 two weeks | yes | 1 / 1 | ready_with_limits; 6; 0 | yes | passes | new |
| q135 urgent | yes | 1 + 1 part / 2 | ready_with_limits; 3; 0 | yes | passes in part | new |
| q135 low stakes | yes | 1 + 1 part / 2 | ready_with_limits; 5; 0 | yes | passes in part | new |
| q136 responders | yes | 1 / 2, its fail condition | ready_with_limits; 2; 0 | yes | **fails** | new |
| q136 scale | yes | 5 / 5 | ready_with_limits; 4; 0 | yes | passes | new |
| q136 weak lead | yes | 1 + 1 part / 2 (main point untested) | ready_with_limits; 5; 0 | yes | passes in part | new |
| q137 | yes | 3 / 3 | ready_with_limits; 5; 0 | yes | passes | new |

Totals. All 50 cases: 21 pass, 28 pass in part, 1 fails (q136 responders). The 30 regression cases of 20 Oct: 13 pass
(l29, l30, l32, l33, l34, l35, l37, q79, q81, q82, the q120 net case, r324, r330), 17 pass in part, none fail (20 Oct:
13 and 17); q81 and r330 gained, l23 and r326 lost. The baselines: i44 now passes, i45 passes in part with its check
not_ready. The 18 new cases: 7 pass (both book cases, q126 #40, q128, q135 two weeks, q136 scale, q137), 10 pass in
part, 1 fails. The check passed in 44 of 50 cases; in the 32 cases comparable with 20 Oct, 26 (20 Oct: 29): l36, r331
and i45 lost it, l36 and r331 wholly or partly to the withheld card.

## Cross-case findings

1. **Google's billing stopped the YouTube scout mid-run, and AskRigor's own ledger is nearly full.** After the 145a
   reset the scout completed 28 times; from r326 (16:31 to 16:44 UTC) on, Google refused it: 4 calls in r326, r328
   and the q130 rerun returned `gemini_youtube_scout_credits_depleted` ("AskRigor's Gemini key has used up its prepaid
   credits, so the scout cannot run until its billing is fixed"). Separately, production's AI-budget ledger read
   $47.00 of its $50 October limit at 17:10:04 UTC (it was set to $13.00 at 13:02), consistent with about 34 scout
   holds of $1 each kept fully charged, since the live build cannot record a later-finishing scout's real cost (the
   next build settles it, 145a). YouTube's daily search quota also stopped searches in eight runs (r324, r325, r326,
   r328, q81, q82, q137 and the q130 rerun).
2. **The check still passes without the declaration a case needs.** l25 (`safety_claims: []`), l28
   (`mechanism_claims: []`), r328 (one of two terms), r331 (`not_quantified` where the case needs
   `hazard_measurement`), r326's turn 2 (no `safety_claims`), l27 (community evidence `not_relevant` for supplied
   posts, so no `thread_selection`), and q132's turn 1, which declared community evidence `not_relevant` for an
   abnormal test result with no named candidate: the exact case HRP 20.6.28's clause in
   `EvidenceLayersAreNotAFixedDiscoveryOrder` was written for.
3. **q136 responders fails as the case defines it.** The run noticed the denominators conflict (64 against 60) and
   still computed 90.3%, 24.2%, 66.1 points and a 3.73 ratio "If the table gives the correct denominators". Question
   136 said a rule follows if a case fails; this is the case that failed. The weak-lead case went untested: no
   animal-only plant surfaced in the run's search.
4. **The study-audit validator's figure check is the biggest source of retries.** 102 tool calls failed in the 58
   judged runs (20 Oct: 38 refused inputs): `validate_study_method_audit` 43, of which 31 were "reported figure ... is
   not in its cited source block" (totals, denominators and derived fractions the paper does not print as such), 5
   `claim_capabilities` with one item, 3 a figure not given as printed; `check_retraction_status` 16 (`identifier`
   missing); `acquire_open_full_text` 11 (a one-query public-copy search); the scout 7; `resolve_doi` 7
   (`doi_or_citation` missing); Europe PMC access errors 5; others 13.
5. **Question 130's rule shows up widely.** Funding or the authors' ties to the maker sit beside the result in l23,
   l32, l33, l34, l35, q120 net, q128, q130 package, q136 weak lead, q137, r324, r328, r330, r331, r332 and i44; in
   the maker case itself the employment comes in the sentence after the results table, not in the headline or the
   table row.
6. **Question 128's rule works.** i44 now names and searches anaphylaxis and says earlier tolerance does not protect
   against a later reaction (20 Oct: neither); q128 lists organ harms by name from both labels; `harm_screen` is
   declared in i44, i45, q128 and all three q135 cases.
7. **Delivered answers.** Every passing answer ends with the check line (20 Oct: l27 missed it). Template sentences
   still break: "The iHerb buyer reviews reviews of" (r324), "Lifesystems manufacturer-hosted reviews reviews" (q120
   net), "Another pass would take About 20–40 minutes" (l23, l32, l35, q120 net, q82, q128, q130 package, r325, r328), "Estimated 30–60
   minutes" (r326), "How often harms occur with Unspecified wild seaweed" and "people using Different seaweed cooking
   methods" (r325), "Iberogast Dual Action Digestive Relief30softgels" (q136 weak lead), and the declaration label
   "(Fictional report of drowsiness ...)" (l33, turn 2). The unblinded-test caveat appears where no test was proposed
   (l26, q135 low stakes, the latter with a definition of blinding), which turns a direct nap answer into ritual
   warnings. r328 lists twelve caveats under "AskRigor’s final check requires these additional qualifications:".
8. **Repeated gaps from 20 Oct.** q120 sleep turn 1 still asks nothing about the room, and turn 2 still offers a
   tucked-in net beside a screened shelter rather than favouring an enclosure; l36 still has no safety information;
   #336 still never consults the 2022 EEG brain-computer-interface review (PMID 36545350); r329 and r331 still lack
   the audits their criteria need because their sources have no DOI.
9. **Budget.** 31 of the 58 runs used 58 or more AskRigor calls; l33 and q130 package used 70. Protocol loads still
   dominate some short cases (q135 two weeks 39 of 59, q79 37 of 62, q126 #41 21 of 28), while l37 (17 calls, 20 Oct
   57) and l25 (27, 20 Oct 48) used far fewer. q135 low stakes spent 62 calls on a nap question.

## Test harness

- **The override (owner answer 144a).** `~/.codex/AGENTS.override.md` held one line, "No personal instructions apply in
  this session.", from 13:09:31 to 17:05:13 UTC and again for the rerun from 17:07:31 to 17:22:29; both removals are
  logged, and the file was confirmed absent afterwards. No run ran a shell command, fetched the owner's development
  repository or ran `turn_stamp.py` (20 Oct: 38 of 39 runs fetched it, 9 executed the script), and no answer starts
  with a time stamp.
- **The biological-risk refusal.** OpenAI's filter refused q130-maker-authors at 15:23 UTC after 29 AskRigor calls
  (exit 1, no answer); its logs are kept as `logs/q130-maker-authors.refused-1523.*`. One rerun with the same inputs
  completed and is the judged run.
- **The preamble.** Its "send nothing" still leads runs to withhold the findings card the check requires in free
  contributor mode (r325, r331 and l36 stayed not_ready for it; l31 also asked), and several answers add a
  "Release-test note" (l24, l25, q79, q120 net, q125, r326). The next preamble should say that the final check's own
  card is allowed and that no release-test note belongs in the answer.
- **Calls.** 2,651 AskRigor calls and 452 web searches in the 58 judged runs, plus 29 calls and 7 searches in the
  refused attempt.

## Saves

- 35 runs' final checks saved a findings card for the owner's review: ARF-0076 to ARF-0110 (i336 turns 1, 3 and 4,
  i44, l22, l23, l30, both l32 turns, l33, l34, l35, q120 net, q120 sleep turn 2, q126 #39, #40 and #42, q128, q130
  package and maker, both q132 turns, q135 low stakes and urgent, q136 scale and weak lead, q137, q81, q82, r324, both
  r326 turns, r328, r330, r332). The other runs, mostly made-up cases without study research, and the six not_ready runs saved none. No answer gives a
  card ID; l34, q126 #40, q132, q137, r326 and q120 net say a card was saved.
- Answers also report analyses filed to the review inbox (l24 four, l25 three, l34 seven, q120 net nine, q79 five,
  l37 two, q125 one, r326 twelve); as on 20 Oct, the count covers the account's analyses in any chat.
