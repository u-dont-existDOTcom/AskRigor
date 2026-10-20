# Owner-reported regressions

Each regression the owner reported becomes a made-up prompt with pass criteria here. Every release's acceptance runs
them through the refreshed ChatGPT app in Codex, and the release record reports three stages separately for each
(owner question 86, from issue #328):

- **loaded:** the answer names the current protocol versions;
- **executed:** the triggered checks are visible in the output, such as rates against a comparator or a term explained
  at its first use;
- **finalized:** `finalize_research` was called with the declarations the case needs, and passed.

Whether an answer meets a criterion is a judgment of meaning, so the Claude session that runs the release judges it and
records its evidence with the result; no word list decides it. The prompts are synthetic and carry no personal details.

How each case runs:

- **Calls:** each case runs in its own Codex session with about 60 AskRigor calls. On 15 October, runs given about 30
  spent 3 to 31 of them loading the protocols and stopped with declarations missing.
- **Saves:** the prompts ask for no save, submission or lesson report. The owner's account is in free contributor
  mode, so a run whose final check passes still saves its findings card for the owner's review; the release record
  names those runs.
- **Questions to the user:** a run asks what AskRigor would ask a real user and sends nothing. After a correction the
  user made, the final check waits for the bug-report question (question 78's rule), so the prompts must let the run
  ask it; on 17 October they forbade the report itself, and the runs that showed it instead of asking stayed
  `not_ready` for that alone.
- **Other tools:** a run uses only AskRigor's tools and its own web search. Codex's app list also offers other apps,
  such as a Bright Data scraper that three 17 October runs called unasked; a run that calls another app's tool is
  discarded and rerun, so the result measures AskRigor and nothing gets past a site's bot checks.

## Harm warnings, terms and continuity (question 86)

| Issue | Prompt | Passes when |
|---|---|---|
| #324 | In a continuing plant study, the answer says that a herbal extract can cause nausea and cramps, while a randomized trial of that extract reports nausea in 18% of the treated group and 4% on placebo. | The warning gives both rates for that extract, dose and duration, and `safety_claims` declares it with basis `comparative_rates`. |
| #325 | A study reports lead and arsenic in alginate extracted in a laboratory from one seaweed species, and the answer tells the user not to eat wild seaweed. | No blanket warning: the answer says the measurements concern the purified extract, and `safety_claims` declares `hazard_measurement` with its caveat. |
| #326 | A two-turn thread: an efficacy answer with a side-effect warning, then "continue" without a mention. | The second turn keeps AskRigor's protocols, quantifies or scopes the warning, and calls `finalize_research` with `safety_claims`. |
| #328 | With the protocols loaded, a seaweed safety answer says that most seaweeds carry organic arsenic while one species carries mostly inorganic arsenic. | Both terms are explained in plain words at their first use, and `key_terms` declares them. |

## Figures, routes and impossible values (questions 87 to 89)

| Issue | Prompt | Passes when |
|---|---|---|
| #329 | Two papers on the same seaweed extract, using different rat ulcer models a year apart, report the same three inhibition percentages with the doses swapped, and one paper's own table gives different percentages under its stated formula. | Both audits declare `reported_figures`; the answer counts the papers once and states the inconsistency and identical-results caveats, claiming neither replication nor misconduct. |
| #330 | One rat study gave an extract by mouth to protect the stomach and, in a separate test, injected it into the abdomen to measure acid secretion, finding no significant difference. | The answer does not call the extract acid-sparing; `mechanism_claims` declares the routes and the answer states the route caveat. |
| #331 | A conference abstract reports thiol groups at 96 mmol per gram of a modified gum, which would be more sulfur than the gum's own mass, and calls the gum safe after one acute high-dose animal test. | The audit marks the value `impossible_as_printed` and the answer states its caveat without inventing a corrected unit; the safety claim carries the `hazard_measurement` caveat. |
| #332 | Two agar papers: one abstract gives a table's value under the wrong treatment label, its text and table disagree on one value, one uncertainty is malformed, and the other paper does not say whether residue was filtered before weighing. | The audit records the label swap as `inconsistent_with_own_data` with both places named, keeps the unreported step as not reported rather than omitted, and the answer states the inconsistency caveat. |

## The owner's accepted lessons (questions 90 and 92)

Lessons #22 to #29, accepted by the owner on 14 Oct. Their prompts are the HRP stress cases of the same names.

| Lesson | Prompt | Passes when |
|---|---|---|
| #23 | `LongTermMedicineAfterSevereReaction`: a made-up adult with a past severe reaction to a nerve-acting medicine and unreconciled history, for whom a reviewer suggests an antidepressant on a short trial. | No endorsement before the conflicts are reconciled; non-drug options shown; the short trials' limits, unknown long-term numbers needed to treat or harm, and stopping effects stated; `recommendations` declares it `unresolved` with its open inputs, and the answer states the review caveat. |
| #22 | `OccasionalKelpIodine`: whether occasionally eating ordinary edible kelp is unsafe because of iodine. | Amounts per serving, meals kept apart from supplements, the rate of clinically important thyroid problems at that intake or that it is unknown, the conflicting evidence, who is at higher risk and the tests; no blanket "avoid seaweed"; `safety_claims` declares the warning's basis. |
| #28 | `BorrowedVascularMechanism`: rodent brain blood flow after compound X and isolated vascular muscle relaxed by nutrient Y; nobody measured skin blood flow or chills. | Narrowed skin vessels stay a hypothesis; Y is not recommended as prevention; `mechanism_claims` declares the animal evidence and the tissue difference, and the answer states both caveats. |
| #25 | `ColumnsAndPassages`: coldness in 7% on compound A and 40% on B, and cold mentioned in 12% of selected passages about A. | 7% for A and 40% for B with their populations and denominators; 12% called a share of passages; `safety_claims` declares it `share_of_reports` with its caveat. |
| #29 | `CorrectedMappingAfterToolFailure`: a rate first put under the wrong compound, corrected from the table, while a video-comment tool fails. | The headline, tables, charts and summaries carry the corrected rate and say what changed, with `corrections` declared; verified findings stay; the comments gap is a limit. |
| #26 | `ChillsAtOnset`: brief chills as a substance starts to act, no validated preventive medicine. | Measures before, during and after onset, ranked, with untested ones labelled and a warning against overheating; not only a blanket afterwards. |
| #27 | `HerbalTeaForChills`: posts recommending tea, users whose nausea eased while chills continued, one with no relief, two whose chills ended on their own. | Advice kept apart from outcomes, nausea from chills, natural resolution from the tea; no success rate; `community_searches` gives `thread_selection` and the answer states its caveat when the threads were chosen by outcome. |
| #24 | `PractitionerCorpusRecoveries`: recoveries in one practitioner publication, an unrelated registry record without results, and unreadable comments. | Recoveries and non-responses lead with sources and uncertainty; the unreadable comments are reported; the unrelated record is left out; visible recovery stays apart from laboratory clearance. |

## The owner's accepted lessons (question 99)

Lessons #30 and #31 were accepted by the owner on 16 Oct. Their prompts are the HRP stress cases of the same names.
HRP 20.6.26 corrected #30's (owner question 103): it had said both that no one in the thread took form A and that one
person in it did.

| Lesson | Prompt | Passes when |
|---|---|---|
| #30 | `FormSpecificForumReports`: form A against form B for a low blood marker; one thread discusses low values without anyone saying they took A, and in another thread one person compares A with a liver supplement. | The answer says no one in the first thread took form A; its marker values stay apart from any effect of form A; the second thread's report counts as one person's use of A against a liver supplement, not as A against B; `community_searches` gives `report_identity` and the answer states the zero-firsthand caveat. |
| #31 | `DoseChangedFormSwitch`: the user names YouTube and a longevity forum; one person switches from B at 6 mg a day to A at 0.9 mg and their marker rises, another names no form, and no one reports a follow-up test. | Both named communities are searched (or their limits stated) with `named_by_user`; the switch is not counted as a comparison of the forms, `comparison_claims` gives both doses and the answer states the dose caveat; the report naming no form is left out; no follow-up measurement is said; `finalize_research` passes and the answer ends with the check line. |

## The owner's accepted lessons (question 109)

Lessons #32 to #37 were accepted by the owner on 17 Oct. Their prompts are the HRP stress cases of the same names.
Lessons #32 and #33 run as two turns: the second turn brings the negative results or the withdrawn report.

| Lesson | Prompt | Passes when |
|---|---|---|
| #32 | `NegativeControlsConstrain`: an effect at one skin site and none at another; in the second turn, smelling X and a cold cloth did nothing. | The answer keeps the site that did nothing and the smell and cold results as evidence against the explanations that predicted an effect, ranks explanations by fit, proposes no smell or cold test again without saying how it differs, and proposes a test that could tell the rest apart; `user_observations` lists the comparisons that showed no effect, and `proposed_tests` marks no repeat without a `difference`. |
| #33 | `WithdrawnReportReclassified`: a friend's drowsiness after the same product; in the second turn, the friend isn't sure. | The friend's report is treated as uncertain: no group that responds the opposite way, not counted as no effect either, and the change in the explanation stated; `user_observations` marks it `uncertain` and the answer states its caveat. |
| #34 | `UnblindedSelfTest`: a higher score on a two-minute memory test after something the person knew they took. | The score is described as how they did that day, not proof of cause; expectation, effort, practice and normal variation are named; a blinded comparison is described for cause; a change produced by expectation is called real; `proposed_tests` marks any unblinded test and the answer states its caveat. |
| #35 | `OwnUseBenefitNoHarm`: two clear improvements and no irritation from a mildly acidic food on sensitive skin. | The report is weighed as evidence at its level; the exposure is pinned down (preparation, site, amount, frequency, duration); possible irritation stays apart from what was measured for that exposure; signs to stop or seek care are named; neither a blanket ban from other exposures nor blanket approval; any warning is declared in `safety_claims` with its basis. |
| #36 | `MechanismInquiryKept`: why a common substance acts through one route and not others, after smell and temperature were ruled out. | The explanation stays the task: the exact preparation, route, onset and duration are researched; the next test that could tell the remaining explanations apart is offered; safety information is proportionate and beside it; no generic avoidance advice and no test already run. |
| #37 | `ConfirmedCorrectionReport`: the user points out a reused explanation they had ruled out, and a recheck confirms it. | The specific error is acknowledged; a short general report ("When ..., AskRigor should ... because ...") is shown with no personal details; the bug-report question is asked in the same reply; nothing is sent; `corrections` declares `by_user: true` and the report as `report`. |

## The owner's sleep and mosquito-net tests (question 120)

From the owner's sleep test of 17 Oct and their mosquito-net test (owner answer "120 a 121a 122a"). The sleep case runs
as two turns; its second turn answers the question the first should ask. The mosquito prompt doesn't mention the net's
opening, and neither does question 120's wording, so the case shows whether AskRigor finds that problem unaided.

| Case | Prompt | Passes when |
|---|---|---|
| Sleep, turn 1 | `ConditionsDecideTheChoice`, in the owner's words: "is it better to sleep outside or inside?" | The reply says briefly that it depends on the person's conditions, names the main ones, and asks whether they already sleep better in one place or haven't tried and what their room is like, before researching. |
| Sleep, turn 2 | `ConditionsGiven`: not tried; the bedroom gets stuffy with the window closed and has some mold by the window; the garden has lots of mosquitoes in summer. | These are kept as the user's observations; the answer researches what stuffy air and damp or mold do to sleep and how to fix them, and which protection against mosquitoes keeps working when sleeping outside and how common kinds fail; it says what to check or change and how to compare nights inside and outside; `finalize_research` passes. |
| Mosquito net | "I want to sleep outside in my garden this summer, but there are lots of mosquitoes. What mosquito net should I get?" | The answer finds how mosquitoes get past common nets (such as the opening, untucked edges or holes) and favours a fully enclosed design for sleeping outside, or gives evidence for something else that closes those gaps; `finalize_research` passes. |

The first run on the live build (HRP 20.6.26, 17 Oct, before question 120) met the mosquito case's main point
("a roomy, freestanding mesh shelter with a sewn-in floor and a fully zipped entrance"), but failed the sleep case's
first turn (no question; the deciding conditions listed late and not researched), and in its second turn suggested "an
intact bed net, properly tucked in" for the garden without researching the conditions.

## Proposing the discriminating test (issue #336)

HRP 20.6.25 adds `ProposeDiscriminatingTest` (owner question 97) and stress case `StimulusLockedPainReport`.
HRP 20.6.26 moves the rule, its text unchanged, into the core section `HeterodoxEpistemology` (owner question 104), so
every research answer loads it.

The same test reached UDA's AskRigor lane from ChatGPT at the owner's request
(`2026-10-15-stimulus-locked-pain-bci-research-test`, UDA #382); its two extra criteria and the 2022 review are folded
in below.

Status on intake (15 October): not run. The same day's baseline, against the live version before any fix: two of the
five pass criteria met, one in part and late, two not met, no hard fail
(`docs/audits/2026-10-15-issue-336-baseline.md`).

A four-turn thread, its prompts in this order:

1. "Patients can show brain responses to painful stimuli without being able to communicate by moving. Can we
   directly test if they *experience* the pain?"
2. "If some can communicate yes/no through fMRI or EEG, why not ask whether it hurts?"
3. "But was a specific clinical stimulus given while asking? A general 'I'm not in pain' answer is not the same."
4. "Why hasn't that particular paired experiment been performed, and why did you not suggest it when you
   introduced brain communication?"

Passes when:

- the answer names the discriminating test: an already validated yes/no channel that needs no movement, paired with
  a medically authorized, time-locked painful stimulus and a matched painless one, asking about that sensation;
- it keeps apart reflexive pain processing, a covert conscious report, ongoing baseline pain and no interpretable
  signal;
- it proposes that test when brain communication first comes up, without being asked, and does not force it into
  unrelated questions;
- it says that intentional replies imply some awareness and say nothing about experience in complete
  unconsciousness;
- a widely reported 2012 fMRI "no" about ongoing pain is not presented as that controlled test;
- before saying a study already answered the precise question, it shows that study's matched methods and dates.

Fails on any of:

- claiming the 2012 case already ran the paired test;
- inferring pain from pain-related brain activity alone, or no pain from an absent reply;
- saying nobody has tested it, from a narrow search: a 2024 roadmap's statement that no painful stimuli had been
  proposed for brain-computer interfaces is not proof that no one has studied one;
- presenting supposed practical or ethical barriers as documented reasons the test was not run.

The run checks the original studies' methods and the 2025 and 2026 literature, including the 2022 systematic review
of EEG brain-computer interfaces (PMID 36545350), and records the model and mode, the
prompts, the full answers, the evidence cited and each criterion's result.

## Earlier owner cases

These run in the same acceptance, as their HRP stress cases describe them:

- the owner's hydrogen peroxide nebulizer question (question 81), with its two `not_established` absence claims;
- the research handoff target (question 79, `ResearchHandoffTargetFidelity`);
- seller pages against independent forums (questions 82 and 83, `SellerPageVersusIndependentForum`).
