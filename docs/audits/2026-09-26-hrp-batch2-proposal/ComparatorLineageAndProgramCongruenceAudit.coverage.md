# ComparatorLineageAndProgramCongruenceAudit: coverage

Replacement: `ComparatorLineageAndProgramCongruenceAudit.xml`. Splice it over the exact range from
`<ComparatorLineageAndProgramCongruenceAudit` through `</ComparatorLineageAndProgramCongruenceAudit>`. In the current
file the opening tag follows `</DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch>` on the same line; leave that
join as it is.

Dispositions: KEPT, MERGED, POINTER, SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
"(owner row)" marks inventory rows with needs_owner_approval=true; their substance is kept exactly.

**Method impact: wording only.** Restatements were merged into the rule they repeat, the trigger list defers to the
router (keeping the triggers the router lacks), and QuantitativeRiskAndResearchAudit's outcome-layer rule now points
here. No sentence below needs owner approval.

## Names other sections or tests use (all kept)

| Name | Referenced by | Now |
|---|---|---|
| ComparatorLineageAndProgramCongruenceAudit | AnswerShapeController/ComparatorLineageTrigger; FinalSelfCheck DomainAudits; QuantitativeRiskAndResearchAudit QA2, QA6, QA10; SourceVerificationAndCitationAudit/CitationChainAudit | Section name |
| ComparatorLineageOutput | OutputFormatting/ModuleOutputs ("what its own output rule requires"; batch-1 table C) | Rule, same name, every field |
| OutcomeLayerDecomposition, EvidenceAncestryTrace | new pointers from QuantitativeRiskAndResearchAudit QA6 and SourceVerificationAndCitationAudit/CitationChainAudit | Rules, same names |
| "baseline evidence debt" (term) | about 13 sections | BaselineEvidenceDebt keeps the definition |

Tests: no test names any rule of this section; no test string literal occurs in it.

## Elements

| # | Original element | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose | KEPT | Compressed to a 235-character index summary (the old one was truncated at 240). |
| 2 | Activation/MandatoryTrigger | KEPT + POINTER | "Mandatory under AnswerShapeController/ComparatorLineageTrigger", the router that already activates this module for controlled studies, noninferiority or equivalence, placebo or sham disputes, predecessors, external controls, component subtraction, combinations and concurrent administration, cumulative schedules, programs, and component-to-bundle claims. The four triggers the router lacks are kept here: any active-comparator trial (the router says active-comparator safety claim), simultaneous or sequential bundle, indirect-effect claim, and a claim that evidence for one level of an intervention establishes another. The effective trigger set (router plus module) is unchanged. |
| 3 | Activation/NonActivation | REMOVED_REDUNDANT | Its cases (simple definitions, emergency triage, noncomparative mechanistic questions) never meet the trigger, and ProtocolExecutionAndComplianceGate/ApplicableModuleLedger already records a reason for every not-applicable module. |
| 4 | ComparatorClasses, 10 classes (owner row) | KEPT | Every can-estimate clause and every limit, one line per class; the XML ids became plain labels (no protocol text or test referenced the ids). |
| 5 | ExactComparatorIdentityAndComposition | KEPT | Verbatim substance. |
| 6 | ComparatorTerminologyPrecision | MERGED | ExactComparatorIdentityAndComposition, all three sentences and the full label list. |
| 7 | InferentialScopeByComparator (owner row) | KEPT | Verbatim substance. |
| 8 | NoUniversalComparatorDogma (owner row) | MERGED | InferentialScopeByComparator: "an inert placebo is not automatically required" (= not every controlled trial requires one), "an active-comparator trial is not inherently invalid or incapable of supporting useful safety or efficacy conclusions", "never present a relative active-comparator result as an absolute non-exposure result", "name the unresolved contrast and identify the most ethical and feasible evidence needed". |
| 9 | EvidenceAncestryTrace (owner row) | KEPT | Verbatim substance. |
| 10 | BaselineEvidenceDebt (owner row) | KEPT | Definition and both "not proof" clauses verbatim. |
| 11 | NoCertaintyCompoundingAcrossLineage | MERGED | EvidenceAncestryTrace, both sentences. |
| 12 | ExternalAndHistoricalControlBoundary | KEPT | Same name, same priority, every audit item. |
| 13 | ComponentBundleProgramCongruence (owner row) | KEPT | Verbatim substance. |
| 14 | BundleIsolationSymmetry | MERGED | ComponentBundleProgramCongruence, verbatim substance. |
| 15 | ScheduleAndCumulativeExposureMatch | MERGED | ComponentBundleProgramCongruence, verbatim substance. |
| 16 | OutcomeLayerDecomposition | KEPT | Every layer; "indirect effects" from QuantitativeRiskAndResearchAudit/OutcomeLayerFirewall joins "population protection", so this rule is now the single home for both rules' layer lists (union; the QRRA rule already required it). |
| 17 | ComparatorLineageOutput | KEPT | Every reporting field. |

## Judgment calls (meaning believed unchanged)

| Where | Original | Now |
|---|---|---|
| Row 12 | "Do not present an external comparison as randomized simply because matching or adjustment was used." | "Never present an external comparison as randomized because matching or adjustment was used." |
| Row 16 | "... secondary transmission, indirect population protection, and eradication separate." | "... secondary transmission, indirect effects including population protection, and eradication separate." |

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| Proposal | Saves | What would change |
|---|---|---|
| ComparatorClasses (owner row): three classes are restated in StudyDesignCapabilityMatrix (vehicle- or component-matched, active comparator or noninferiority, external or historical); point to those rows and keep the other seven | about 630 | Wording would come from the matrix ("cannot automatically support ... immunity from calendar-time ... bias" instead of "can dominate the contrast"). The self-controlled row is not a safe pointer: the matrix omits regression to the mean and time trends. |
| Drop ComparatorLineageOutput to OutputFormatting | about 330 | OutputFormatting now defers to each module's output rule, so this would need an OutputFormatting change. |

## Size

| | Characters | UTF-8 bytes |
|---|---:|---:|
| Original element | 9,322 | 9,326 |
| Replacement element | 7,795 | 7,799 |
| Change | −16% | |

Five of the thirteen rules plus the ten classes are owner rows whose substance must stay; the savings come from merging
the seven restatements and the router-duplicated trigger list.
