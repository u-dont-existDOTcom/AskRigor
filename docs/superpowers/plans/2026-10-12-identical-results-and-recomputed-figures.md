# Recompute a study's headline figures, and catch identical results across papers (issue #329)

## Authority and scope

- AskRigor issue #329, filed 2026-10-12 at 22:09 UTC from the owner's account.
- Two papers presented as separate (2017, aspirin model; 2018, pyloric-ligation model) on a methanolic extract of
  *Gracilaria corticata* report the identical ulcer-inhibition percentages, 74.25%, 65.25% and 53.25%, with the dose
  assignments swapped.
- Under its own stated formula, the 2018 paper's table gives 64.51%, 23.78% and 50.61%. The 2017 paper says gastric
  volume decreased, while its figures show an increase.
- This is classed as suspected data dependence or reporting error, not verified misconduct.
- The wording below is a draft. It ships only as exact text the owner approves (owner question 87).

## What exists, and what enforces it (checked on main at 808fb78a)

- **The protocols require it:**
  - HRP `LogicArithmeticAndCitationIntegrity`: inconsistent numbers "must be reconciled before synthesis";
  - `ReconstructableArithmeticDisclosure`: show the formula, substituted values and result;
  - `DuplicateAndDataLineageAudit`: count datasets, not documents;
  - `ConsilienceForPracticalEffectiveness` and `StudyMethodReliabilityGate`;
  - final checks FS170 (reconcile numbers), FS171 and FS212 (copies of one trial counted once);
  - Universal's numerical-coherence check.
- **Nothing triggers on it.** No rule treats identical unusual results in two separate-looking papers as a trigger,
  and the lineage rule is worded for human patients.
- **Nothing enforces it:**
  - The study-audit validator has no numeric field: arithmetic can only appear as free text.
  - An audit recording problems validates like a clean one, and no caveat reaches the answer.
  - `finalize_research` checks each key source alone, with nothing across sources.
  - The `StudyLab` independence contract (`INDEPENDENT`, `DEPENDENT_ANALYSIS`, …) is defined but unused.

## Design

1. **Study audit field `reported_figures`** (required).
   - **Contents:** the study's headline result figures, each with:
     - its evidence block;
     - the value as the paper reports it;
     - either the value recomputed from the paper's own table with its stated method, or why it can't be recomputed.
   - **Empty list:** allowed only with a reason the study reports no numeric result.
   - **Exact checks:**
     - each reported value appears in its cited block;
     - a recomputed value that differs from the reported one by more than rounding (the larger of 0.5 units and 1%)
       marks the audit receipt as internally inconsistent.
   - Whether the recomputation is right stays the auditor's declared work, recorded with its block.
2. **The study-audit receipt carries** the reported figures and the inconsistency mark.
3. **`finalize_research` reads them:**
   - **A key study whose audit is internally inconsistent:** the answer includes, as its own sentence, "The reported
     figures in {marker} don't match the study's own data, so its results stay unreliable until they are
     reconciled."
   - **Two key studies whose audits share two or more identical reported figures:** the answer includes "{marker A}
     and {marker B} report identical results, so they are counted once, not as independent replication."
   - Both checks are exact: the gate compares the declared numbers and finds the sentences. Which study is right, and
     why, stay the model's to say.
4. **Protocol wording** (draft below): HRP rule `IdenticalResultsAcrossPublications` after
   `DuplicateAndDataLineageAudit`, with case `SwappedIdenticalPercentages` and final check FS228.
5. **Tests:**
   - every check, including formatting variants of reported values ("74.25%", "74,25 %");
   - the rounding tolerance;
   - the two caveats, and the next-step contract;
   - the exact protocol text, with reversible fixtures.
6. **Acceptance:** #329's two papers as a regression in `docs/owner-regressions.md`, measured in the three stages of
   plan 86 (loaded, executed, finalized).

## Draft wording (for the owner's exact-text approval)

- **HRP rule `IdenticalResultsAcrossPublications`:**
  > When two publications presented as separate report identical or near-identical unusual results, treat them as
  > possibly one dataset until shown otherwise, in animal and laboratory studies as in human ones. Recompute each
  > paper's headline figures from its own tables with its stated method, record any mismatch, and compare authors,
  > laboratories, models and dates. Count them once, never as independent replication, and do not use one paper to
  > correct the other.
- **Case `SwappedIdenticalPercentages`:**
  - Prompt: "Two papers on the same seaweed extract, using different rat ulcer models a year apart, report the same
    three inhibition percentages with the doses swapped, and one paper's own table gives different percentages under
    its stated formula."
  - Expected: "Recompute both from their tables, report the mismatch and the identical figures, count the papers once
    at most, keep the extract as an exploratory lead, and claim neither replication nor misconduct."
- **Check FS228:** "Identical unusual results in publications presented as separate were checked against each
  paper's own tables and counted once, not as independent replication (IdenticalResultsAcrossPublications)."
- **Revision entry:** "Owner-approved, question 87 (2026-10-12), from issue #329: added
  IdenticalResultsAcrossPublications, which treats identical unusual results in separate-looking publications as
  possibly one dataset, recomputes each paper's figures from its own tables, and never counts them as replication,
  with a stress case and final check FS228."

## Owner items

1. Question 87: the server changes (sections 1 to 3) and the wording above. A: all; B: the server changes only;
   C: change a wording.
2. With question 86, one build and one release question.
