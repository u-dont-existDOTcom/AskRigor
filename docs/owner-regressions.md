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

## Earlier owner cases

These run in the same acceptance, as their HRP stress cases describe them:

- the owner's hydrogen peroxide nebulizer question (question 81), with its two `not_established` absence claims;
- the research handoff target (question 79, `ResearchHandoffTargetFidelity`);
- seller pages against independent forums (questions 82 and 83, `SellerPageVersusIndependentForum`).
