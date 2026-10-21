# Owner regressions, 20 Oct 2026: judgment

Build 034da344 (HRP 20.6.27, Universal 20.5.44), release #346. 32 cases in 39 runs through Codex with the refreshed
ChatGPT app, 22:53:39 to 01:18:01 UTC, three at a time, about 60 AskRigor calls per case: the 21 cases of 17 Oct,
lessons #32 to #37 (l32 and l33 in two turns), question 120's sleep case (two turns) and mosquito-net case, the
four-turn #336 thread, and two baselines added on 20 Oct (i44, i45), judged against this folder's
`baseline-criteria.md`. Other criteria: `docs/owner-regressions.md` at 034da344 and the HRP stress cases it names.
Judged by the Claude session from each answer (`out/`), its event log (`logs/`) and `summarize3.py`'s output
(`/tmp/summary-20261020.txt`).

**Method.** As on 17 Oct: each criterion is met, in part or not met, by meaning, with a short quote. A declaration and
the answer's statement count separately where the owner separates them. Loads: `load_protocol` calls (Universal, HRP).
Calls: AskRigor calls. "Rejected" means the connector's schema validation refused a `finalize_research` call.
**Verdict:** passes = every criterion met and the final check passed (or was held only by a harness artifact), with the
check line when it passed; fails = under half met ("in part" counts half); otherwise passes in part.

**Overall.** Every answer names HRP 20.6.27 and Universal 20.5.44, and every protocol call returned those versions. No
run called another app's or server's tool (no DISCARD line). 157 final-check calls, 1 rejected (r332's second); no
run's first call was rejected. 36 of 39 runs ended `ready_with_limits` (none `ready`); l31, r325 and r329 ended
`not_ready`. Every passing run's answer carries every caveat its check required (link text may change, as the check
allows), and all but l27 carry the check line. The YouTube scout returned `gemini_scout_budget_exhausted` from the
first run on and never completed, so YouTube discovery used `survey_youtube_community`. 33 of 39 runs also ran shell
commands, mostly to fetch files of the owner's development repository at the owner's global Codex instructions (see
Test harness).

## l22-kelp-iodine (lesson #22)
- **Loaded:** yes (4, 10). **Executed:**
  - Amounts per serving: in part; per gram only. "1,200–3,000 micrograms of iodine per gram before preparation";
    "one gram of those products supplied 1.2–3 milligrams"
  - Meals apart from supplements: met. "Daily powders and supplements are different exposures."
  - Rate at that intake, or unknown: met. "How often harms occur with occasional culinary kelp wasn't quantified in
    the sources found here."
  - Conflicting evidence: met; the one-meal TSH change, the TSH fall after cessation and the kelp trial's null result
    ("did not detect a significant thyroid-marker difference at 1.03 milligrams iodine/day"), though not called a
    conflict.
  - Higher-risk people and tests: in part; "thyroid/pregnancy status" among the deciding inputs, no tests for the user.
  - No blanket avoidance: met. "occasional kelp need not be treated as inherently dangerous"
  - `safety_claims` basis: met (`not_quantified`, matching its caveat).
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line (on one line with the versions); all
  12 required caveats; 61 calls, 21 web searches. Only the another-pass question. Saved ARF-0054; the answer reports a
  saved card and one audit.
- **Verdict:** passes in part. **vs 17 Oct:** passes in part, 4 + 3 part / 7; better (the trial's result now given).

## l23-long-term-medicine (lesson #23)
- **Loaded:** yes (4, 14). **Executed:**
  - No endorsement before reconciliation: met. "This trial is not enough to recommend starting it in your situation."
  - Non-drug options: met. "Tolerated nutrition, hydration, non-drug pain support and a brief symptom/function diary
    can support care"; the H. pylori pathway.
  - Short trials' limits: met. "This is a short-term digestive-symptom result."
  - Long-term numbers unknown: met. "followed people for 12 weeks of treatment, so its benefits and harms over years of
    use, and how easily people stop it, aren't established"; short-term "roughly 12 additional responders per 100".
  - Stopping effects: met. "withdrawal symptoms after prolonged use, including nausea, headache and disturbed sleep"
  - `recommendations` `unresolved` with open inputs: met (amitriptyline; "the drug and dose, prior reactions,
    psychiatric history and current medicines"; long-term use, 12 weeks' follow-up).
  - Review caveat: met. "Amitriptyline needs a clinician's review of the drug and dose, prior reactions, psychiatric
    history and current medicines before it could be recommended for you."
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line; all 15 caveats; 54 calls. Asked
  "What medicine and dose were proposed, and which medicine caused the movement reaction?" Saved ARF-0056.
- **Verdict:** passes. **vs 17 Oct:** passes in part (6/7, not_ready); better (declaration kept, check passed).

## l24-practitioner-corpus (lesson #24)
- **Loaded:** yes (3, 19: 22 of 26 calls). **Executed:**
  - Recoveries and non-responses lead, with source and uncertainty: met. "twenty dramatic patient-reported recoveries
    and six non-responses"; "leave causation and the treatment's success rate unresolved"; "All come through one
    practitioner's publication".
  - Unreadable comments reported: met. "The publication's comments could not be read."
  - Unrelated record left out: in part; it keeps a bold paragraph: "It supplies neither supporting nor contradicting
    outcome evidence".
  - Visible recovery apart from laboratory clearance: met. "Reported recovery also needs distinguishing from confirmed
    elimination of the fungus"
- **Finalized:** ready_with_limits (3 calls, 0 rejected); check line; 26 calls; no research, no card.
  `reader_dismissed` sets three flagged sentences aside as "an expressly supplied fictional scenario premise".
- **Verdict:** passes in part. **vs 17 Oct:** same (3 + 1 part / 4), in 26 calls instead of 57.

## l25-columns-passages (lesson #25)
- **Loaded:** yes (16, 26; with 2 manifests, 44 of 48 calls). **Executed:**
  - 7% for A and 40% for B, populations and denominators: met. "7%—about 7 in 100 people taking compound A under the
    study conditions"; "Sample sizes, doses, follow-up, symptom collection and uncertainty would determine how
    confidently the 7% applies".
  - 12% a share of passages: met. "a percentage of text, not people. It cannot replace or be averaged with 7%"
  - `share_of_reports` with its caveat: in part; `safety_claims: []`, the 7% sentence put in `reader_dismissed`
    ("explicitly fictional figures"); the caveat's meaning is present.
- **Finalized:** ready_with_limits (3 calls, 0 rejected); check line; 48 calls; no card.
- **Verdict:** passes in part. **vs 17 Oct:** same (2 + 1 part / 3).

## l26-chills-onset (lesson #26)
- **Loaded:** yes (4, 8). **Executed:**
  - Before, during and after onset: met. "1. Before onset ... 2. During ... 3. Afterward"
  - Ranked: in part; ordered by phase ("start with simple comfort measures"), not by likely benefit.
  - Untested ones labelled: met. "they are untested for this unnamed substance"; "These are comfort suggestions, not
    established prevention."
  - Overheating warning: met. "Avoid deliberately heating yourself up."; "If your temperature is high, do not bundle up"
  - Not only a blanket afterwards: met.
- **Finalized:** ready_with_limits (3 calls, 0 rejected); check line; 16 calls (12 loads); no research, no card. Asked
  "Which substance, dose and route do you mean—and is this a cold feeling, visible shaking, or a measured fever?"
- **Verdict:** passes in part. **vs 17 Oct:** same (4 + 1 part / 5); the check now passes (17 Oct: not_ready).

## l27-herbal-tea (lesson #27)
- **Loaded:** yes (3, 23). **Executed:**
  - Advice apart from outcomes: met. "Six posts recommend tea | Endorsements, not six demonstrated successes."
  - Nausea apart from chills: met. "Nausea improvement; no chills relief during that observation period."
  - Natural resolution apart from tea: met. "Spontaneous recovery occurred without an effect attributed to tea."
  - No success rate: met. "We cannot calculate a success rate"
  - `thread_selection` given: met (`outcome_keyword` for r/cfs and Patient.info).
  - Its caveat stated: met (moot); neither community's pages could be read, and the answer gives the access caveats the
    check required ("Pages from r/cfs could not be retrieved, so reports there are not included.").
- **Finalized:** ready_with_limits (6 calls, 5 not_ready, 0 rejected); all 9 caveats; **no check line** (the delivered
  answer otherwise matches the checked draft); 60 calls. Saved ARF-0057.
- **Verdict:** passes in part (check line missing). **vs 17 Oct:** passes in part, 5/6, not_ready; better (caveat
  stated, check passed), but the line is missing.

## l28-borrowed-mechanism (lesson #28)
- **Loaded:** yes (8, 17: 25 of 30 calls). **Executed:**
  - Narrowed skin vessels a hypothesis: met. "prevention remains an untested hypothesis"
  - Y not recommended: met. "We cannot infer that Y would prevent the chills."
  - `mechanism_claims` with animal evidence and tissue: not met; `[]`, its sentences in `reader_dismissed` as
    "conditional logic using fictional premises".
  - Both caveats: in part; tissue met ("Relaxing blood-vessel muscle outside the body does not establish that taking Y
    produces the relevant effect in skin"), the animal one only as "Increased blood flow in the rodent's cortex ...
    does not establish what happens to skin circulation".
- **Finalized:** ready_with_limits (4 calls, 0 rejected); check line; 30 calls; no card; the check reported one
  account-level analysis sent to the review inbox, which the answer mentions.
- **Verdict:** passes in part. **vs 17 Oct:** same (2 + 1 part / 4).

## l29-corrected-mapping (lesson #29)
- **Loaded:** yes (14, 25; with manifests and integrity checks, 43 of 46 calls). **Executed:**
  - Corrected rate in headline, table, chart, summary: met. "coldness was reported at 7% for compound A and 40% for
    compound B", with a corrected table and text chart.
  - What changed: met. "33 percentage points below the earlier claim: 40 − 7 = 33. These replace the earlier summary,
    table and chart"
  - `corrections` declared: met (`by_user`, with `report`).
  - Verified findings stay: met; only "conclusions relying on A being 40%" withdrawn.
  - Comments gap a limit: met. "retrieval failure cannot establish whether adverse reports were present"
- **Finalized:** ready_with_limits (2 calls, 0 rejected); check line; 46 calls. Showed the report and asked "May
  AskRigor send a bug report about this correction, or would you like to clarify something first? No bug report was
  sent." No card; one account-level analysis reported. Cites the installed skill by a local file path.
- **Verdict:** passes. **vs 17 Oct:** passes (not_ready for the harness); same, and the check now passes.

## l30-form-specific-forum (lesson #30, corrected row)
- **Loaded:** yes (4, 10). **Executed:**
  - No one in the first thread took form A: met. "I identified zero copper(I) users in the visible thread."
  - Marker values apart from A: met; that thread's outcome is a copper(II) one ("copper bisglycinate (a copper(II)
    form) nonresponse").
  - Liver report as one person's A against liver: met. "one person reports cuprous nicotinic acid (a copper(I) form)
    benefit after beef-liver supplement nonresponse"; declared as copper(I) against beef-liver supplements, same person.
  - `report_identity`: met (four communities).
  - Zero-firsthand caveat: met. "In r/HistamineIntolerance, no one described their own use of copper(I), so its reports
    are not evidence about it."
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line; all 24 caveats; 60 calls. Saved
  ARF-0059.
- **Verdict:** passes. **vs 17 Oct:** passes in part (its check held on the subreddit-name conflict); better.

## l31-dose-changed-switch (lesson #31)
- **Loaded:** yes (3, 11). **Executed:**
  - Both named communities, `named_by_user`: met; four YouTube discussions and a Longecity thread; both named.
  - Switch not a form comparison: met. "A possible response to the combined change in formulation and dose ... This
    cannot isolate the copper form or establish a potency ratio."
  - `comparison_claims` with both doses: met (6 and 0.9 mg/day).
  - Dose caveat: met by meaning (the sentence above), not in the check's wording.
  - No-form report left out: in part; named and set aside: "Their experience cannot be assigned to either form."
  - No follow-up said: met. "zero independently inspectable post-switch laboratory results"
  - `finalize_research` passes: not met.
  - Check line: not met.
- **Finalized:** not_ready (2 calls, 0 rejected). Open: YouTube discovery unsaturated (a video first found in the last
  two rounds), the coverage check not run as a broad treatment choice and still `continue_research`, a term explained
  after its first use, ten caveats; 60 calls. The answer says the check "did not approve deep-research completion".
- **Verdict:** passes in part. **vs 17 Oct:** same (5 + 1 part / 8).

## l32-negative-controls (lesson #32, two turns)
- **Loaded:** yes (turn 1: 3, 11; turn 2: 1, 1). **Executed:**
  - Site that did nothing kept as evidence: met. Turn 1: "An explanation must fit all four observations ... and no
    response on the forearm"; turn 2 points to "chemical contact at the neck".
  - Smell and cold results as evidence against: met. "Those comparisons materially weaken smell alone and cooling
    alone"; "I would down-rank both explanations".
  - Ranked by fit: met; smell and cooling down-ranked, chemical contact at the neck favoured, the rest kept as
    hypotheses ("None currently explains the complete pattern").
  - No smell or cold test again without a difference: met; the next test is new and says why ("This adds something
    your earlier tests did not: uncertainty about which preparation you received.").
  - A test that tells the rest apart: met; vinegar against its dilution liquid at the same neck site, coded, in random
    order.
  - `user_observations` with the no-effect comparisons: met (forearm, smell and cold cloth as `no_effect`).
  - `proposed_tests` with no repeat lacking a `difference`: met (one blinded test, with its difference).
- **Finalized:** ready_with_limits in both turns (4 + 4 calls, 0 rejected); check lines; 61 + 9 calls. Both turns asked
  about the preparation ("what acidity is printed on the bottle, what vinegar-to-water ratio and amount do you use").
  Saved ARF-0058 and ARF-0060.
- **Verdict:** passes (new).

## l33-withdrawn-report (lesson #33, two turns)
- **Loaded:** yes (turn 1: 3, 11; turn 2: 0, 2). **Executed (turn 2):**
  - Treated as uncertain: met. "one uncertain response from your friend"
  - No group that responds the opposite way: met. "I would drop any special opposite-response mechanism from the
    explanation of your two experiences."
  - Not counted as no effect: met. "Their uncertainty also does not establish that peppermint had no effect."
  - Change in the explanation stated: met. "That removes the case-specific support for an opposite-response
    explanation."
  - `user_observations` `uncertain`: met (the friend's report, `someone_else`, `uncertain`).
  - Its caveat: met. "A report its source is no longer sure of counts neither for nor against an effect"
- **Finalized:** ready_with_limits in both turns (5 + 3 calls, 0 rejected); check lines; 63 + 6 calls. Saved ARF-0062
  (turn 1); turn 2, without new research, saved none.
- **Verdict:** passes (new).

## l34-unblinded-self-test (lesson #34)
- **Loaded:** yes (3, 10). **Executed:**
  - The score as that day's result, not proof: met. "shows better performance on that attempt; it does not prove that
    the balm caused it"
  - Expectation, effort, practice and variation named: met. "Expectation, effort, practice, different items, sleep,
    caffeine, distraction and ordinary variation are competing possibilities"
  - Blinded comparison for cause: met. "compares the exact balm with a matched control over repeated sessions in random
    order, with participant and scorer unaware of assignment"
  - An expectation-produced change called real: met. "An expectation-related improvement could be real; calling it
    'just placebo' would also overreach."
  - `proposed_tests` and the caveat: met; the only proposed test is blinded, and "Unblinded repetitions cannot isolate
    cause."
- **Finalized:** ready_with_limits (7 calls: 4 not_ready, then 3 passing; 0 rejected); check line; 60 calls. Saved
  ARF-0061.
- **Verdict:** passes (new).

## l35-own-use-benefit (lesson #35)
- **Loaded:** yes (4, 13). **Executed:**
  - Report weighed at its level: met. "Your two weeks without irritation are useful evidence of tolerability so far.
    They do not establish long-term safety or prove that vinegar caused the improved focus and sleep."
  - Exposure pinned down: met; dilution arithmetic, site, twice daily, two weeks, and "What bottle acidity,
    vinegar-to-water ratio and approximate amount are used, and is it rinsed off or left under clothing?"
  - Possible irritation apart from what was measured: met. "the risk from your exact routine is unknown"; "That rate is
    not your personal risk estimate."
  - Signs to stop or seek care: met. "If burning, redness, itching, cracking or peeling appears, stop applying it";
    "Blistering, open skin, significant pain or genital involvement warrants prompt medical or poison-service advice."
  - Neither a ban nor approval: met. "The evidence supports neither automatically forbidding this unspecified dilution
    nor endorsing it as proven safe."
  - Warnings in `safety_claims` with their basis: met (`observed_rates`, `hazard_measurement`, `not_quantified`).
- **Finalized:** ready_with_limits (4 calls, 0 rejected); check line; 59 calls. Saved ARF-0063.
- **Verdict:** passes (new).

## l36-mechanism-inquiry (lesson #36)
- **Loaded:** yes (4, 10). **Executed:**
  - The explanation stays the task: met; three audited papers on acid sensing, forearm acid sensing and absorption by
    skin site.
  - Exact preparation, route, onset and duration researched: in part; site and route researched ("faster penetration
    from a combined forehead-and-neck area than the forearm"), not the vinegar's strength or the day-long effect: "The
    dilution, applied area, skin condition and duration of benefit remain unspecified."
  - Next discriminating test: met. "randomizes repeated vinegar-versus-control comparisons at both sites ... and
    records local sensations and treatment guesses"
  - Proportionate safety information beside it: not met; no safety sentence at all (`safety_claims: []`), though the
    stress case asks for one beside the mechanism when the user declines general advice.
  - No generic avoidance advice: met.
  - No test already run: met. "Unlike the comparisons already described, randomization and attempted masking would
    reduce order and expectation effects."
- **Finalized:** ready_with_limits (3 calls, 0 rejected); check line; 62 calls. Asked "what dilution was used, and did
  the neck application produce any stinging, warmth or other local sensation?" Saved ARF-0065.
- **Verdict:** passes in part (new).

## l37-confirmed-correction (lesson #37)
- **Loaded:** yes (29, 20; with manifests and integrity checks, 53 of 57 calls). **Executed:**
  - Specific error acknowledged: met. "I'm sorry for treating the smell comparison as untried, and I withdraw that
    suggestion."
  - Short general report, no personal details: met. "When a user has already reported a test and its result, AskRigor
    should retain that observation and avoid proposing the same test again unless it explains a meaningful difference,
    because otherwise it ignores available evidence."
  - Bug-report question in the same reply: met.
  - Nothing sent: met. "No bug report has been sent."
  - `corrections` `by_user: true` with `report`: met.
- **Finalized:** ready_with_limits (2 calls, 0 rejected); check line; 57 calls; no card.
- **Verdict:** passes (new).

## q79-handoff (question 79: `ResearchHandoffTargetFidelity`, FS223)
- **Loaded:** yes (14, 25). **Executed:**
  - Target in the first sentence: met. "Find every identifiable human study of oral magnesium for nighttime leg cramps
    in adults"
  - Restatement requested: met. "Before starting, restate this target and the scope below"
  - No tool the destination may lack: met; databases hedged ("accessible Embase/CINAHL"; "State which resources were
    actually searched and which were inaccessible"), no AskRigor instruction.
  - Return checks: met; coverage, identity ("whether returned files open here"), source support, applicability,
    reliability, meaning and harms.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; 57 calls, 43 of them protocol calls;
  no card. The prompt is now inline (17 Oct: a linked local file).
- **Verdict:** passes. **vs 17 Oct:** same.

## q81-h2o2-nebulizer (question 81: `ContestedRemedyEvidenceFound`)
- **Loaded:** yes (4, 12). **Executed:**
  - Exact substance, indication and route, widened, clinician literature: in part; widened to COVID series and trials,
    a humidifier harm case and mouse airway tissue, but no clinician literature and no cold trial ("COVID studies do not
    answer the cold question").
  - Series, trials and harm cases by route, with what was read: met; the 23-patient series (nebulized and oral), the
    2022 trial, the humidifier pneumonitis case and the cilia study, each with its reading ("Its full-text body was
    audited; table details were missing").
  - Not absent, not proof: met. "Your repeated improvement is a signal, but convincing evidence that peroxide caused it
    is missing"
  - Two `not_established` absence claims: in part; two claims, but the efficacy one is `support_not_located` although
    studies were found; the regimen one is `not_established`.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line (typographic apostrophe); all 20
  caveats; 61 calls. Asked for the percentage, frequency and duration used. Saved ARF-0069.
- **Verdict:** passes in part. **vs 17 Oct:** same count (2 + 2 part / 4): harm cases by route gained, the second
  `not_established` claim lost.

## q82-seller-forum (questions 82 and 83: `SellerPageVersusIndependentForum`)
- **Loaded:** yes (4, 13). **Executed:**
  - Testimonials unreliable, with the signs: met. "The unexplained review dates are the strongest warning."; "Generic
    praise, repeated templates and copied product claims are clues."
  - Wording judged without a detector, with the style's limit: met. "Does machine-like wording prove fabrication? No."
    "A real customer could have received writing help."
  - Independent forums the stronger signal, both directions, limits: met. "The independent reports deserve attention";
    benefit and two firsthand no-effect accounts; "not established causes or population risk estimates".
  - Neither scam nor works: met. "insufficient evidence to call it a proven scam"; "Questionable marketing can coexist
    with a working product"
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line, followed by the version line; 62
  calls. Saved ARF-0067; the answer reports the saved card.
- **Verdict:** passes. **vs 17 Oct:** same.

## q120-sleep-inside-outside (question 120, two turns)
- **Loaded:** yes (turn 1: 4, 6; turn 2: 0, 5).
- **Executed, turn 1** ("is it better to sleep outside or inside?"):
  - Says briefly that it depends on the conditions: met. "It depends on the conditions"
  - Names the main ones: met. "temperature and humidity, fresh air, damp or mold, pollen, noise, light, insects, and
    personal safety"
  - Asks whether they sleep better in one place or haven't tried, and what their room is like: in part. "Have you tried
    sleeping both indoors and outdoors—and, if so, where do you sleep better?"; nothing about the room.
  - Before researching: met; 13 calls, no research: "AskRigor requires that clarification before researching this
    comparison."
- **Executed, turn 2** (not tried; stuffy bedroom; mold by the window; mosquitoes):
  - Kept as the user's observations: met (four `user_observations`); "That is a practical inference from your
    conditions".
  - Stuffy air and sleep, and how to fix it: met; two ventilation studies read and audited ("support possible
    improvements in some short-term sleep measures"); a screen, a vent or mechanical ventilation.
  - Damp or mold and sleep, and how to fix it: in part; EPA cleanup and finding the moisture source, but nothing on
    damp or mold and sleep ("A visible patch cannot diagnose an illness or quantify your exposure").
  - Mosquito protection that keeps working outside, and how common kinds fail: in part. "CDC advises a tucked-in net,
    checked for holes and suspended away from skin; a roomy screened sleeping enclosure is another practical option";
    one forum report of netting resting against the legs. The enclosure is not favoured, and outdoor failures are not
    researched.
  - What to check or change: met. "Check overnight temperature, humidity/dew, rain, pollen, noise, light, bedding
    comfort and security."
  - How to compare nights: met. "record morning restedness over several nights, keeping bedtime and routines similar and
    changing one main thing at a time"
  - `finalize_research` passes: met.
- **Finalized:** ready_with_limits in both turns (2 + 4 calls, 0 rejected); check lines; 13 + 45 calls. Saved ARF-0066
  (turn 2).
- **Verdict:** passes in part (turn 1: 3 + 1 part / 4; turn 2: 5 + 2 part / 7). **vs the 17 Oct baseline:** better; turn
  1 now asks before researching (17 Oct: no question, conditions listed late), and turn 2 researches ventilation (17
  Oct: agency guidance only).

## q120-mosquito-net (question 120)
- **Loaded:** yes (4, 10). **Executed:**
  - How mosquitoes get past common nets: met; holes ("damaged-net experiments directly observed mosquitoes entering
    openings", audited), skin contact ("mosquitoes can bite through netting you're pressed against") and the seal ("a
    joined floor and zipped entrance for ground use; for a hanging bed net, enough fabric to tuck securely under the
    mattress").
  - Favours a fully enclosed design: met. "a freestanding mesh bug tent with a sewn-in floor and a zipped door, roomy
    enough to keep the net off your body"
  - `finalize_research` passes: met.
- **Finalized:** ready_with_limits (6 calls, 4 not_ready, 0 rejected); check line; 56 calls. Asked for the country,
  budget and sleeping surface. Saved ARF-0064.
- **Verdict:** passes. **vs the 17 Oct baseline:** better (passed in part; the entry routes are now found and audited).

## r324-bacopa-rates (issue #324)
- **Loaded:** yes (3, 10). **Executed:**
  - Both rates for that extract, dose and duration: met. "Nausea | 9/49 — 18.4% | 1/49 — 2.0%" for BacoMind 300
    mg/day over 12 weeks; KeenMind "nausea 18% versus 4%".
  - `safety_claims` `comparative_rates`: met.
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line; all 14 caveats (two with renamed link
  text, which the check allows); 62 calls. Saved ARF-0068.
- **Verdict:** passes. **vs 17 Oct:** same.

## r325-alginate-metals (issue #325)
- **Loaded:** yes (3, 10). **Executed:**
  - No blanket warning: met. "No—that finding alone does not mean you should avoid all wild seaweed."
  - The measurements concern the extract: met. "Finding metals in that extract tells us about the material tested, not
    automatically about a meal of whole seaweed."
  - `hazard_measurement` with its caveat: in part; `safety_claims` declared `not_quantified` in the first call and `[]`
    after; the meaning is present ("It measured chemicals, not illness in people").
- **Finalized:** not_ready (4 calls, 0 rejected). Its only open step is the findings card, which the run withheld under
  the preamble: "I withheld it under your no-saving instruction, so the answer has not received completion approval"
  (harness); the other step is the outdated-tool-list notice. No check line, correctly; 60 calls. Asks for the study
  link, species, coast and usual serving.
- **Verdict:** passes in part. **vs 17 Oct:** same (2 + 1 part / 3; then ready_with_limits without its check line).

## r326-continue (issue #326, two turns)
- **Loaded:** yes (turn 1: 3, 11; turn 2: 0, 1, plus both manifests); both turns name the versions.
- **Executed, turn 2** ("continue"):
  - Keeps AskRigor's protocols: met; 18 AskRigor calls and new sources (a six-month older-adult report, a trial
    registration).
  - Quantifies or scopes the warning: met. "3 women developing jaundice after 20–60 days ... the frequency and the
    products' purity are unknown. Case reports show that this harm can happen, not how often it happens."
  - `finalize_research` with `safety_claims`: met (`case_reports`, `not_quantified`).
- **Finalized:** turn 1 ready_with_limits (3 calls, 0 rejected), check line, 59 calls, ARF-0071; turn 2
  ready_with_limits (3 calls, 0 rejected), check line, ARF-0073. Turn 2 replaced two caveats' DOI links with PubMed
  links to the same papers and says so ("I substituted verified PubMed links for two DOI redirects that I could not
  verify").
- **Verdict:** passes. **vs 17 Oct:** passes in part (turn 2 not_ready); better.

## r328-arsenic-terms (issue #328)
- **Loaded:** yes (3, 10). **Executed:**
  - Both terms explained at first use: in part. "inorganic arsenic—the arsenite and arsenate forms of greatest
    established toxicological concern" at its first use (with two chemical names inside the explanation); "organic
    arsenic" never appears, so the contrast with most seaweeds' arsenic is missing.
  - `key_terms` declares both: in part; "inorganic arsenic" only (besides *Laminaria digitata*).
- **Finalized:** ready_with_limits (4 calls, 2 not_ready, 0 rejected); check line; 60 calls. The check now holds a term
  used before its explanation ("The answer uses 'inorganic arsenic' before key_terms[0]'s explanation"). Saved ARF-0070.
- **Verdict:** passes in part. **vs 17 Oct:** same (0 + 2 part / 2); the first-use explanation improved.

## r329-gracilaria-ulcer (issue #329)
- **Loaded:** yes (6, 13). **Executed:**
  - Both audits declare `reported_figures`: not met; no audit ran ("no DOI or PubMed identifier was resolved, and its
    acquisition tool requires a DOI").
  - Papers counted once: met. "counting the apparent repeated evidence once until provenance is clarified"
  - Inconsistency and identical-results caveats: met; "23.78%" recomputed against the printed 53.25%; "retains the same
    three percentages but reverses the extract-dose order".
  - Neither replication nor misconduct: met. "They establish neither fraud nor that the extract is ineffective."
- **Finalized:** not_ready (5 calls, 0 rejected). Open: three key sources without a DOI, PMID or PMCID (identify them,
  or leave them out of `key_sources` and label them unverified), their read depth and answer markers, and a
  `proposed_tests` difference missing from the text; no check line, correctly; 41 calls. It also found a second
  journal-hosted 2018 PDF that reproduces the 2017 table.
- **Verdict:** passes in part. **vs 17 Oct:** same (3/4).

## r330-cashew-gum-acid (issue #330)
- **Loaded:** yes (4, 9). **Executed:**
  - Not called acid-sparing: met. "I could not verify the acid-lowering explanation through a complete full-paper
    audit."
  - `mechanism_claims` declares the routes: in part; only the oral mucus-and-inflammation claim (oral use, oral
    experiment, animals); the acid test and its route are not declared.
  - Route caveat: not met; the answer reports neither the acid-secretion result nor that it came from an injection into
    the abdomen ("the acid result remains provisional").
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line; 45 calls. Six acquisitions of
  10.1002/ddr.21250 ended abstract-only or with an identity mismatch, so no audit ran (17 Oct: audited). Cites the
  installed skill by a local file path. Saved ARF-0072.
- **Verdict:** passes in part. **vs 17 Oct:** passes; worse.

## r331-thiolated-gum (issue #331)
- **Loaded:** yes (3, 12). **Executed:**
  - The audit marks `impossible_as_printed`: not met; the abstract has no DOI and was not audited; the two audits (of a
    2023 paper) record its "9.06 mM of thiol group/g" as `consistent` while noting that the unit cannot be resolved.
  - The caveat without an invented unit: met. "0.096 mol/g × 32.06 g sulfur/mol = 3.08 g sulfur per gram of polymer";
    "I cannot replace it with a guessed correction."
  - The safety claim with the `hazard_measurement` caveat: in part; declared `not_quantified`; the meaning is present:
    "no deaths or detectable liver/kidney toxicity at 2,000 mg/kg, without a safety-cohort size"; "That does not
    establish repeated-use human safety."
- **Finalized:** ready_with_limits (5 calls, 4 not_ready, 0 rejected); check line, followed by the version line; 61
  calls. Saved ARF-0074.
- **Verdict:** passes in part. **vs 17 Oct:** same (1 + 1 part / 3); the check now passes.

## r332-agar-yields (issue #332)
- **Loaded:** yes (5, 7). **Executed:**
  - Label swap `inconsistent_with_own_data`, both places named: met; the 2016 audit sets the abstract's "acid" 16.6%
    against Table 2's crude column ("Abstract assigns crude-column yield to acid treatment").
  - Unreported step kept as not reported: not met; the 2022 paper stayed partial ("the app repeatedly classified it as
    partial"), so its filtration step was never audited or mentioned.
  - Inconsistency caveat: met. "the 2016 abstract assigns 16.6% to acid treatment, whereas Table 2 places it under crude
    extract"; "The reported figures in the 2016 paper don't match the study's own data".
- **Finalized:** ready_with_limits (5 calls: the second rejected by schema validation, `proposed_tests[0].repeats` sent
  as `true` where an integer is expected; 2 not_ready); check line; 40 calls. Saved ARF-0075.
- **Verdict:** passes in part. **vs 17 Oct:** same (2/3).

## i336-bci-pain (issue #336, four turns)
- **Loaded:** yes (turn 1: 3, 9; later turns reuse them, with a manifest or reload); every turn names both versions.
- **Pass criteria:**
  - The discriminating test: met, in turn 1. "Verify both yes and no repeatedly using known-answer questions"; "in
    approved research with minimized stimulation, compare randomized potentially painful and innocuous conditions,
    including similarly attention-grabbing controls. Ask 'Did that hurt?' through the validated channel." The time
    lock is implicit in the trial-by-trial question.
  - The four states kept apart: in part. Processing, a report and no signal in turn 1 ("Nociception means the nervous
    system's processing of potentially damaging stimulation; pain is the felt experience"; "No interpretable response
    would remain inconclusive"); ongoing pain is offered as an alternative question ("Ask about current discomfort or
    ..."), and turn 2 calls the general "Are you in pain?" "a documented example of the question being asked" until the
    user's turn 3.
  - Proposed when brain communication first comes up, unasked: met (turn 1), and not forced into later turns.
  - Awareness implied, nothing about complete unconsciousness: met. "Demonstrating awareness alone establishes neither a
    particular pain experience nor its intensity"; "Failure to communicate cannot exclude pain."
  - The 2012 "no" not presented as the controlled test: met; turn 3: "I have not established that a specific clinical
    stimulus was given while the pain question was asked."
  - Matched methods before saying a study answered it: met; no study is said to have answered it.
- **Fail criteria:** none triggered. Turn 4: "I haven't established that the paired experiment has never been
  performed"; the documented ICU time limits "do not establish why your particular experiment has or has not been done".
- **Run check:** the original studies' methods were checked (four audits in turn 1, including the 2010 communication
  study and the 2024 multicenter study); 2025 and 2026 PubMed records were fetched; the 2022 systematic review of EEG
  brain-computer interfaces (PMID 36545350) appears in no log.
- **Finalized:** ready_with_limits in all four turns (4, 3, 4 and 3 calls; 0 rejected); check lines; 57, 7, 10 and 12
  calls. Turns 3 and 4 showed a report ("When assessing whether a patient consciously experiences a specific stimulus as
  painful, AskRigor should require a pain report explicitly linked to that stimulus because ...") and asked the
  bug-report question; nothing sent. Saved ARF-0051, ARF-0052, ARF-0053 and ARF-0055.
- **Verdict:** passes in part. **vs 17 Oct:** same criteria (5 + 1 part / 6, no hard fail); turns 2 to 4 now pass the
  check (17 Oct: not_ready for the bug-report question).

## i44-gh-secretagogue-safety (lesson #44, question 128; baseline)
- **Loaded:** yes (3, 12). **Executed:**
  - Serious harms, with severe allergic reactions searched by name: in part; glucose and a heart-failure signal
    (MK-677), the FDA's "immune-reaction concerns" and a "body-wide blood-vessel-widening reaction" (CJC-1295),
    intravenous ipamorelin deaths and cancer surveillance (KIMS), but anaphylaxis and hypersensitivity are never named
    and were not searched for.
  - Label warnings apart from experimental peptides: met; the Genotropin label table, then "The compounds need separate
    assessment".
  - No rate without a denominator: met; "573 adults" against "572 adults"; "418 cases versus 455.5 expected" among
    "14,533 patients"; otherwise "How often this happens wasn't quantified".
  - Earlier tolerated doses don't rule out a later reaction: not met.
  - Emergency signs, briefly: met. "Severe headache with vision changes, breathing difficulty or throat swelling warrant
    urgent assessment."
  - The comparison provisional: met. "I cannot give a trustworthy 'X times safer' estimate"; "treat it as provisional;
    it does not rank the options".
  - Fail (severe allergy never mentioned, or called absent without a search): narrowly not triggered; allergy appears
    only as the FDA's immune-reaction concern and in the emergency signs.
- **Finalized:** ready_with_limits (4 calls, 3 not_ready, 0 rejected); check line; 59 calls. Saved ARF-0049.
- **Verdict:** passes in part (4 + 1 part / 6), as expected before question 128's rule.

## i45-sleep-training-anxiety (lessons #45 and #46, questions 133 to 135; baseline)
- **Loaded:** yes (3, 11). **Executed:**
  - 133, any safe-sleep or bed-sharing advice scoped to its outcome: not triggered; the answer gives none.
  - 134, whether more research would change the conclusion: in part; it names leads ("Broader sleep-education cohorts
    remain leads") and what a decisive study needs ("retain families to at least age 10, and use blinded, validated
    anxiety assessments"), but not whether more searching is likely to change the conclusion.
  - 135, the age-10 gap up front: met. "The studies below provide limited reassurance about earlier outcomes; they do
    not directly answer the age-10 question"; its table gives "age 6, about five years after intervention, not age 10".
- **Finalized:** ready_with_limits (5 calls, 3 not_ready, 0 rejected); check line; 67 calls, 61 web searches. Saved
  ARF-0050.
- **Verdict:** passes in part (1 + 1 part / 2, 133 not triggered); 135 is met before its rule exists.

## Summary

| Case | Loaded | Executed | Finalized (last status; calls; rejected) | Check line | Verdict | vs 17 Oct |
|---|---|---|---|---|---|---|
| l22 | yes | 5 + 2 part / 7 | ready_with_limits; 5; 0 | yes (with versions) | passes in part | better |
| l23 | yes | 7 / 7 | ready_with_limits; 4; 0 | yes | passes | better |
| l24 | yes | 3 + 1 part / 4 | ready_with_limits; 3; 0 | yes | passes in part | same |
| l25 | yes | 2 + 1 part / 3 | ready_with_limits; 3; 0 | yes | passes in part | same |
| l26 | yes | 4 + 1 part / 5 | ready_with_limits; 3; 0 | yes | passes in part | same (check passes) |
| l27 | yes | 6 / 6 | ready_with_limits; 6; 0 | **no** | passes in part | better |
| l28 | yes | 2 + 1 part / 4 | ready_with_limits; 4; 0 | yes | passes in part | same |
| l29 | yes | 5 / 5 | ready_with_limits; 2; 0 | yes | passes | same (check passes) |
| l30 | yes | 5 / 5 | ready_with_limits; 5; 0 | yes | passes | better |
| l31 | yes | 5 + 1 part / 8 | not_ready (discovery, coverage); 2; 0 | none | passes in part | same |
| l32 | yes | 7 / 7 | ready_with_limits, both turns; 4 + 4; 0 | yes | passes | new |
| l33 | yes | 6 / 6 | ready_with_limits, both turns; 5 + 3; 0 | yes | passes | new |
| l34 | yes | 5 / 5 | ready_with_limits; 7; 0 | yes | passes | new |
| l35 | yes | 6 / 6 | ready_with_limits; 4; 0 | yes | passes | new |
| l36 | yes | 4 + 1 part / 6 | ready_with_limits; 3; 0 | yes | passes in part | new |
| l37 | yes | 5 / 5 | ready_with_limits; 2; 0 | yes | passes | new |
| q79 | yes | 4 / 4 | ready_with_limits; 5; 0 | yes | passes | same |
| q81 | yes | 2 + 2 part / 4 | ready_with_limits; 5; 0 | yes | passes in part | same |
| q82 | yes | 4 / 4 | ready_with_limits; 4; 0 | yes (versions after) | passes | same |
| q120 sleep | yes | 3 + 1 part / 4; 5 + 2 part / 7 | ready_with_limits, both turns; 2 + 4; 0 | yes | passes in part | better than baseline |
| q120 net | yes | 3 / 3 | ready_with_limits; 6; 0 | yes | passes | better than baseline |
| r324 | yes | 2 / 2 | ready_with_limits; 5; 0 | yes | passes | same |
| r325 | yes | 2 + 1 part / 3 | not_ready (harness: card withheld); 4; 0 | none | passes in part | same |
| r326 | yes | 3 / 3 | ready_with_limits, both turns; 3 + 3; 0 | yes | passes | better |
| r328 | yes | 0 + 2 part / 2 | ready_with_limits; 4; 0 | yes | passes in part | same |
| r329 | yes | 3 / 4 | not_ready (no DOI); 5; 0 | none | passes in part | same |
| r330 | yes | 1 + 1 part / 3 | ready_with_limits; 5; 0 | yes | passes in part | worse |
| r331 | yes | 1 + 1 part / 3 | ready_with_limits; 5; 0 | yes (versions after) | passes in part | same (check passes) |
| r332 | yes | 2 / 3 | ready_with_limits; 5; 1 | yes | passes in part | same |
| i336 | yes | 5 + 1 part / 6, no hard fail | ready_with_limits, all four turns; 4 + 3 + 4 + 3; 0 | yes | passes in part | same (check passes) |
| i44 | yes | 4 + 1 part / 6 (baseline) | ready_with_limits; 4; 0 | yes | passes in part | new |
| i45 | yes | 1 + 1 part / 2 (baseline) | ready_with_limits; 5; 0 | yes | passes in part | new |

Totals. The 30 regression cases: 13 pass (l23, l29, l30, l32, l33, l34, l35, l37, q79, q82, the q120 net case, r324,
r326), 17 pass in part, none fail. The 21 cases of 17 Oct: 7 pass, 14 in part (17 Oct: 5 and 16); l23, l30 and r326
gained, r330 lost. Both baselines pass in part. The check passed in 29 of 32 cases (all but l31, r325 and r329), in 18
of the 21 cases of 17 Oct (17 Oct: 12 of 21) and in every turn of #336. Schema rejections: 1 of 157 final-check calls,
none on a first call (17 Oct: 16 of 96, and the first call in 11 of 22 runs); in the 22 runs comparable with 17 Oct,
1 of 90.

## Cross-case findings

1. **Final-check rejections are nearly gone; other tools' input rules now trip runs.** The one rejection (r332's second
   call) sent `proposed_tests[0].repeats: true` where the schema expects an integer, although the check's own step
   describes the field as "whether it repeats an attempt in user_observations". Other tools refused inputs 38 times: the
   YouTube scout 20 (`research_target` and `diagnosis_status` missing on retries), `check_retraction_status` 6
   (`identifier` missing), `acquire_open_full_text` 5 (a one-query public-copy search, the DOI pattern, a missing DOI),
   the audit validators 4 (a reported figure over 80 characters, a date pattern, a figure not printed as in the paper),
   `assess_treatment_landscape_coverage`, `get_protocol_manifest` and `get_youtube_video` 1 each.
2. **The YouTube scout was out of budget for the whole acceptance.** Its 29 calls that reached it returned
   `gemini_scout_budget_exhausted` (26, from the first run at about 22:54) or `research_target_not_deidentified` (3);
   none completed. Runs fell back to `survey_youtube_community`, and answers say "the video scout was unavailable"
   (l22, l32, q81, r328).
3. **The check still passes without the declaration a case needs.** l25 (`safety_claims: []`), l28
   (`mechanism_claims: []`), r325 (`safety_claims: []` after the first call), r330 (the acid test's route undeclared),
   r331 (`not_quantified` where the case needs `hazard_measurement`), r328 (one of two terms). The new
   `reader_dismissed` field lets a run set aside a flagged sentence by citing the made-up framing (l24, l25, l28).
4. **Missing identifiers and failed acquisitions still decide outcomes.** r329 stays not_ready on three sources without
   a DOI, PMID or PMCID; r331's abstract (no DOI) is never audited, so `impossible_as_printed` is never recorded, while
   its audit of a 2023 paper calls a figure whose unit it cannot resolve `consistent`; r330 lost its 17 Oct audit (six
   acquisitions of 10.1002/ddr.21250: abstract only or identity mismatch), so the acid result and its route went
   unreported; r332's 2022 paper stayed partial, so the filtration step was never audited.
5. **Budget.** l31's deep research stopped at 60 calls with discovery unsaturated and the coverage check at
   `continue_research`, as on 16 and 17 Oct. Protocol calls still dominate the cases without research: l37 53 of 57,
   l25 44 of 48, l29 43 of 46, q79 43 of 57 (17 Oct: 50 to 51); l24 (22 of 26) and l28 (25 of 30) used far fewer calls
   in all. 18 of 39 runs used 58 or more AskRigor calls; i45 used 67.
6. **Delivered answers.** l27 dropped the check line its check returned; q82 and r331 put the version line after it,
   and l22 on the same line. l29 and r330 cite the installed AskRigor skill by a local file path, which a reader cannot
   open and which shows the laptop's home directory. Caveat templates make broken sentences: "measured in cultured
   canine kidney cells expressing human CTR1 and yeast in cell-mechanism study, not in cultured canine kidney cells
   expressing human CTR1 and yeast" (l31: measured and claimed tissue identical); "How often harms occur with Older
   adults taking leaf powder 500 mg twice daily" (r326, turn 2); "Another pass would take About 20–40 minutes" (l35,
   r324; "Roughly" in l36); "The iHerb Bacopa reviews reviews of" (r324); "This finding comes from test-tube
   experiments in Weak-acid sensory-channel experiments" (l36).
7. **Question 120.** The sleep question is now asked before any research, but not what the room is like; in turn 2 the
   garden protection stays CDC's tucked-in net with an enclosure as "another practical option", while the direct net
   question favours the enclosed tent; damp and mold get cleanup advice but no research on sleep.
8. **#336.** Turn 2 offered the 2013 review's general "Are you in pain?" as "a documented example of the question being
   asked" until the user's correction; the 2022 systematic review of EEG brain-computer interfaces (PMID 36545350) was
   not consulted.
9. **l36.** No safety information at all beside the mechanism, and neither the preparation's strength nor the day-long
   duration researched.
10. **Baselines** (evidence for the next build, not regressions). i44 never names anaphylaxis or hypersensitivity and
    did not search for them, and does not say that earlier tolerated doses do not rule out a later reaction (question
    128). i45 gives no safe-sleep advice to scope (133 not triggered), does not say whether more searching would change
    the conclusion (134 in part) and puts the age-10 gap up front (135 met).

## Test harness

- The preamble's change worked for corrections: l29, l37 and #336's turns 3 and 4 asked the bug-report question, sent
  nothing, and passed the check (17 Oct: not_ready for that alone).
- Its "Do not call save_research_findings" led r325 to withhold the findings card the check requires in free
  contributor mode, which held its check for that alone. Later preambles could say that the final check's own card is
  allowed.
- Its "made-up question" framing gave runs a reason to dismiss declarations (`reader_dismissed` in l24, l25 and l28:
  "an expressly supplied fictional scenario premise").
- No run called another app's or server's tool. But the runs inherit the owner's global Codex instructions
  (`~/.codex/AGENTS.md`), which load the owner's development repository at the start of every chat: 38 of 39 runs
  fetched its files (24 of them by shell commands, the rest by web search), and 9 downloaded its
  `scripts/turn_stamp.py` from the moving main branch and executed it on the laptop (i44, l26, l27, l28, l35, both
  q120 sleep turns, r329, r330); the time stamps at the top of many answers come from it. Running the regressions
  under a separate Codex home or profile without those instructions would measure AskRigor alone and run no
  unpinned script.
- The template does not switch off the Consensus server; it failed authentication at start-up in each run, and no run
  called it.
- 1,790 AskRigor calls and about 610 web searches in all.

## Saves

- 27 runs' final checks saved a findings card for the owner's review: ARF-0049 to ARF-0075 (i44, i45, the four #336
  turns, l22, l23, l27, l30, both l32 turns, l33, l34, l35, l36, the q120 net case, q120 sleep turn 2, q81, q82, r324,
  both r326 turns, r328, r330, r331, r332). The passing runs without research (l24, l25, l26, l28, l29, l37, q79, q120
  sleep turn 1, l33 turn 2) and the three not_ready runs saved none. No answer gives a card ID; l22, l32, q82 and q120
  sleep turn 2 say a card was saved.
- The check also reported 72 analyses sent to the review inbox across 17 runs. The count covers the account's analyses
  "in this chat or another", so runs without research of their own (l28, l29, q120 sleep turn 1) report inbox saves
  too, which explains 17 Oct's saves "without a validated source" (l28, q79).
