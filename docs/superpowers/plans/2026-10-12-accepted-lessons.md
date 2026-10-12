# Incorporate the accepted lessons #21, #20, #11 and #17's leftover (owner decision, 2026-10-12)

## Authority and scope

- Owner, 2026-10-12: "approve all the lessons". Lessons #21, #20, #17 and #11 in `AskRigor-lessons` are accepted.
- The wording below is a draft. It ships only as exact text the owner approves (owner question 84).
- The cases are synthetic.

## What already exists (checked on main, HRP 20.6.18 and Universal 20.5.38)

- **#17:** all three rules shipped in HRP 20.6.9 (2026-10-03):
  - `CouplingBeforeMechanism`;
  - `DirectionLabelsNeedOutcomeNeutralSelection`, with `ReviewCorpusSelectionAndCounts` and
    `NoPopulationRateFromForumSample`;
  - `AverageNullDoesNotRuleOutConditionalEffect`.

  The lesson is now marked incorporated. One leftover: Universal's forum-signal sentence still classifies a searched
  sample as common or rare without asking that the sample not be selected by outcome.
- **#21:** continuation rules exist:
  - HRP `ProactiveDiminishingReturns` ("Keep the parent mission"), `IncompleteModuleContinuationHandoff` and
    `AdaptiveStoppingRule`;
  - Universal's forward-motion gate.

  But nothing says a finished installment or a saved report is not completion while authorized leads remain. HRP
  judges completion by mandatory modules, not open leads, and Universal's self-resolution rule 9 says "Next step:
  none — this task is complete" whenever no user action remains.
- **#20:** incentives, conflicts, citation entailment and animal-to-human limits are covered (`CommercialAndCommunityBias`,
  `SymmetricCOI`, `COINotAutomaticDisqualification`, `CitationEntailment`, the shopping module), but nothing treats a
  clinician's endorsement as its own kind of evidence: prewritten or AI-assisted endorsement text, credential checks,
  incentives stated beside the endorsement, being listed versus firsthand use.
- **#11:** HRP's `AverageNullDoesNotRuleOutConditionalEffect` applies after a null, in health research. Nothing asks,
  before an evaluation is designed or run, whether it could detect an effect confined to a subgroup or state.

## Design

- **HRP 20.6.21**, on top of question 79's 20.6.20:
  - rule `InstallmentIsNotCompletion` after `ProactiveDiminishingReturns`;
  - rule `ClinicianEndorsementAudit` after `CommercialAndCommunityBias`;
  - two stress cases and final checks FS224 and FS225.
- **Universal 20.5.41**, on top of questions 82 and 83's 20.5.40:
  - a qualifier in self-resolution rule 9;
  - a new epistemic-phase rule 12;
  - an outcome-selection condition in the forum-signal sentence.
- Tests: exact text and placement, reversible fixtures chained from the versions current at build time, independent
  approved constants.

## Draft wording (for the owner's exact-text approval)

- **HRP rule `InstallmentIsNotCompletion`** (lesson #21):
  > Ending a research installment, or saving its report or file, does not complete the user's research while material,
  > authorized leads remain open. Keep the status of the current pass apart from the status of the user's objective,
  > continue the next executable lead when the tools allow, and when they don't, say exactly what was completed and
  > what remains. A first pass that stops to offer deeper work lists its open leads as the next step, not as finished
  > work.
- **Case `InstallmentSavedLeadsOpen`:**
  - Prompt: "In a continuing survey of unusual plants with clinically interesting effects, the assistant has saved a
    report on 12 candidates, while three original trials can still be checked and several plant classes are
    unexplored."
  - Expected: "Say the installment is complete and the project open, name the remaining leads, and check the original
    trials next; do not say the research is complete or that no step remains."
- **Check FS224:** "A finished installment or saved report was not called completion while material, authorized leads
  remained open, and the pass and the user's objective kept separate statuses (InstallmentIsNotCompletion)."
- **Universal self-resolution rule 9** (lesson #21): "If no user action remains, state: “Next step: none — this task
  is complete.”" becomes "If neither user action nor executable work remains, state: “Next step: none — this task is
  complete.”"
- **HRP rule `ClinicianEndorsementAudit`** (lesson #20):
  > Treat a clinician's endorsement of a health product as promotion until shown otherwise. Check whether the platform
  > supplies prewritten or AI-assisted endorsement text, state any free samples, commissions or discount codes beside
  > the endorsement, verify the clinician's credentials independently, and keep being listed apart from firsthand use,
  > prescribing or observed patient outcomes. Check each study an endorsement cites against what it actually measured.
  > Incentives or machine-like wording do not show that an endorser is fictitious or fraudulent.
- **Case `ClinicianEndorsementDirectory`:**
  - Prompt: "A wellness product lists many clinicians on a discount-sharing directory, with only a few written
    endorsements; the directory offers free samples and optional draft review text, and one endorsement claims a human
    benefit from a study in laboratory animals."
  - Expected: "Separate the clinicians' identity from any product experience, state the incentives, report that the
    cited study tested animals, and do not call the clinicians fictitious or fraudulent without evidence."
- **Check FS225:** "A clinician's endorsement was weighed as promotion: its incentives, the source of its text, the
  endorser's credentials and the studies it cites were checked, and no fraud was alleged without evidence
  (ClinicianEndorsementAudit)."
- **Universal epistemic-phase rule 12** (lesson #11):
  > 12. Before designing or running an evaluation of an effect that may be confined to a minority, an intermittent
  > state or a condition, name at least one plausible way the effect could be real and check that the design would
  > detect it, for example by a power calculation or a simulation. An average that could not detect that form of the
  > effect does not test whether it exists.
- **Universal forum-signal sentence** (lesson #17's leftover): "classify the searched sample as common, mixed, minority,
  rare, absent, or indeterminate" becomes "classify the searched sample as common, mixed, minority, rare, absent, or
  indeterminate only when it was not selected by outcome (an outcome-keyword search shows that an experience exists,
  not how often)".
- **HRP revision entry:** "Owner-approved, question 84 (2026-10-12), from accepted lessons #21 and #20: added
  InstallmentIsNotCompletion, which keeps a finished installment apart from the user's research objective while
  authorized leads remain, and ClinicianEndorsementAudit, which weighs a clinician's endorsement of a health product as
  promotion and checks its incentives, text, credentials and cited studies, with two stress cases and final checks
  FS224 and FS225."
- **Universal revision entry:** "Owner-approved, question 84 (2026-10-12), from accepted lessons #21, #11 and #17:
  "Next step: none" now needs no executable work left as well as no user action; the epistemic-phase router checks
  that an evaluation could detect an effect confined to a subgroup or state; and forum frequency labels need a sample
  not selected by outcome."

## Owner items

1. Question 84: this wording. A: all; B: only some, named; C: change a wording.
2. Whether it joins the pending release (question 80: "80 b") or the next one.

Question 84 answered "84a" on 2026-10-12; built on #319, at the top of the stack: HRP 20.6.21 and Universal 20.5.41.
