# Evidence for a contested intervention the user names: search before judging, and keep the user's route (owner report, 2026-10-12)

## Authority and scope

- UDA lane `2026-10-12-hydrogen-peroxide-covid-extended-human-evidence-sweep-omission.md`, filed 2026-10-12 at the
  owner's request, marked high priority.
- The report is about retrieval and route fidelity. It is not a request to validate the intervention, and finding
  studies is not to be read as proof that it works.
- Personal health details stay out of this public repository; the cases below are synthetic.
- The protocol wording is a draft for the owner's exact-text approval (owner question 77).

## What happened

- Asked about a contested home remedy the user named, an answer said the evidence showed no convincing benefit.
  Several sources existed and were never found:
  - an indexed case series of the exact route;
  - a hospital cohort and a randomized trial of related routes;
  - the clinician literature the user's sources pointed to.
- Only a harm case was cited.
- The answer also changed the routes the user had described, for example turning "swallowed, diluted in water" into
  inhalation.

## Diagnosis

- **The rules exist.** HRP's `NoHumanEvidenceAbsenceClaimBeforeSweep` forbids calling evidence absent before a full
  sweep, `SmallResultSetAndExposureDecomposition` widens a sparse search, and `WholeInterventionIdentityTrace` makes
  route part of identity.
- **One gap in the final check.** `absence_claims` covers sentences saying something was not found, not studied or
  has no evidence. "No convincing benefit" and "not shown to work" are evidence-strength verdicts outside those words,
  so they escape the declaration and its coverage checks.
- **Route fidelity has no rule.** Nothing says the user's own description of what they used, and how, must be kept
  exactly through later summaries.
- **Likely activation failure.** The answer was a follow-up in a long conversation. Such answers may never reach
  `finalize_research`, and in chats with outdated tool lists the newer checks can't run. Question 71's
  `ToolListCurrency` covers the second part.

## Design

1. **`finalize_research`: `absence_claims` covers evidence-strength verdicts.** Its description and next steps say
   that a sentence calling an intervention's evidence unconvincing, weak, not demonstrated or showing no benefit is
   also an absence claim. It needs its state and its sources, or `support_not_located` with search coverage, like any
   other. The server still never judges meaning: the model declares, and the server checks the quotes, receipts and
   coverage exactly.
2. **HRP rule `UserNamedInterventionSweep`** (draft below), directly after `NoHumanEvidenceAbsenceClaimBeforeSweep`.
3. **HRP rule `UserReportedUseFidelity`** (draft below), directly after `WholeInterventionIdentityTrace`.
4. **Two stress cases** after the newest case (`ActiveLaneNotSaturated`, question 73), and **final check FS222**.
5. **Tests:** an evidence-strength sentence without its absence claim is refused, and one with it passes. Plus
   placement and exact sentences, and the chain from HRP 20.6.18.
6. **Acceptance:** run report regressions 1, 2 and 6 through the AskRigor connector in a Claude session (no API spend),
   with synthetic wording.

## Draft wording (for the owner's exact-text approval)

- **Rule `UserNamedInterventionSweep`:**
  > When the user names an intervention, especially a contested one they have used, search before judging its
  > evidence: its exact identity and synonyms, the indication, and the exact route, in human studies, case series and
  > cohorts. Search with and without the narrowing terms, and widen when results are few. Also search the clinician
  > and grey literature the user's sources point to, and follow their citations to the original studies. Report what
  > was found by route: positive observations, negative controlled comparisons and safety signals, with what was read.
  > "Not shown to work" never becomes "nothing published", and finding studies does not prove the intervention works.
- **Rule `UserReportedUseFidelity`:**
  > Keep the user's own description of what they used, and how, exactly as given: the substance, the form, the route
  > and the purpose. When the user corrects it, carry the correction into every later summary. Judge evidence and
  > safety for the route actually used, never for a different one, and keep any causal conclusion the user draws
  > separate from what they observed.
- **Case `ContestedRemedyEvidenceFound`:**
  - Prompt: "A user says a diluted household antiseptic, inhaled through a nebulizer, helped several colds, and asks for
    the evidence and the risks."
  - Expected: "Search the exact substance, indication and route, widening when results are few, and the clinician
    literature; report the case series, cohorts, trials and harm cases found, by route, with what was read; do not
    call the evidence absent or treat the studies as proof."
- **Case `RouteCorrectionKept`:**
  - Prompt: "The user corrects an earlier summary: the remedy was swallowed, diluted in water, not inhaled, and another
    substance was only smelled, not aerosolized."
  - Expected: "Restate both uses exactly as corrected, judge evidence and safety for those routes only, and carry the
    correction into every later summary."
- **Check FS222:** "Before judging the evidence for an intervention the user named, its exact identity, indication and
  route were searched, widened when results were few, along with the clinician literature, and the user's own
  description of their use was kept exactly (UserNamedInterventionSweep, UserReportedUseFidelity)."
- **Revision entry:** "Owner-approved, question 77 (2026-10-12): added UserNamedInterventionSweep and
  UserReportedUseFidelity, which search the exact route before judging a user-named intervention's evidence and keep
  the user's own description of their use, with two stress cases and final check FS222."

## Owner items

Question 77 answered "77a" on 2026-10-12; built on this branch.

1. Question 77: the wording above and the `absence_claims` change. A: all; B: the `absence_claims` change only;
   C: change a wording.
2. The release question, after the build. It stacks on question 73's HRP 20.6.18.
