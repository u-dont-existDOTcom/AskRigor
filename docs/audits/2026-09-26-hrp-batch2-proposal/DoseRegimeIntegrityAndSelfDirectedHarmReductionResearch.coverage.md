# DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch: coverage

Replacement: `DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch.xml`. Splice over the exact range from
`<DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch priority="Critical">` through
`</DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch>` (HRP 20.6.0 lines 1894 to 2060; the closing tag is followed
on the same line by `<ComparatorLineageAndProgramCongruenceAudit`, which is outside the span and stays).

Dispositions: KEPT, MERGED, POINTER (home named), SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
"(owner row)" marks inventory rows with needs_owner_approval=true; their substance is kept exactly.

This section is the canonical home for its rules (Architecture layer `dose_regime_integrity` points to it; batch 1 made
OutputMinimum the home for dose output when it removed OutputFormatting/DoseRegimeIntegrityOutput; the sibling
SourceVerificationAndCitationAudit draft now points its pharmacological grading to TwoAxisEvidenceHierarchy and
NoCrossDoseEvidenceLaundering). Copies of its rules live in other sections, so little here could be removed as a
restatement; the savings are wording, the CompactRule, one pointer, and per-rule priority attributes.

## Method impact

Wording only. Two route/formulation example lists were shortened (rows 5, 6); see notes.

## Element map

| # | Original element / clause | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose (owner row): keep high-quality but exposure-mismatched evidence from controlling a pharmacological conclusion; preserve directly applicable low-dose and microdose evidence without inflating it; technically useful harm-reduction analysis for the circumstances that actually exist | KEPT | Purpose. "High-quality but" folded into "exposure-mismatched evidence" (all such evidence, whatever its quality; TwoAxisEvidenceHierarchy says rank does not repair applicability). "For the circumstances that actually exist" is in ClinicianReferralDoesNotReplaceAnalysis. Purpose is now 234 characters so the index summary is not truncated. |
| 2 | Per-rule `priority="Critical"` | KEPT | "Every rule here is Critical." in the Purpose. |
| 3 | Activation/MandatoryTrigger (topic list and exposure-dimension clause) | KEPT | Activation, verbatim content. Adds a pointer to AnswerShapeController/DoseRegimeIntegrityDefaultTrigger, whose extra trigger (evidence transported across exposure regimes) already activates this module. |
| 4 | Activation/NonActivation (three exclusions; record the reason in structured or deep mode) | KEPT | Activation. |
| 5 | ExposureIndex/Field dose, schedule, timing, agonist_or_coexposure, dependence_state, population, outcome, measurement_confidence (owner row) | MERGED | Into ExposureIndexedPharmacologicalClaims as an inline field list; every sub-item kept ("titration or taper structure when relevant" is covered by "relevant ExposureIndex fields"). Field ids kept as written. |
| 6 | ExposureIndex/Field route: "Oral, sublingual, transdermal, intranasal, intravenous, intramuscular, subcutaneous, inhaled, rectal, or other route." | REMOVED_REDUNDANT | Example list of routes (brief rule 5); the field "route" stays. |
| 7 | ExposureIndex/Field formulation: "Immediate release, extended release, depot, solution, tablet, compounded preparation, concentration, excipients, or other formulation details." | KEPT | "release type, depot, solution, tablet, compounding, concentration, excipients, or other detail". |
| 8 | ExposureIndexedPharmacologicalClaims (owner row): no claim without the relevant exposure fields whenever available; mark unknowns | KEPT | Same rule; "ExposureIndex" kept as an explicit mention (cited by batch-1 audit docs and the stress inventory). |
| 9 | NumericExposureOverridesAmbiguousLabels (owner row): label examples (ULDN, VLDN, LDN, standard, therapeutic, high dose, depot, brand shorthand) are not sufficient exposure definitions | KEPT | Same rule. |
| 10 | ... map each source to actual dose, unit, route, formulation, schedule, duration, co-use; stratify by numeric exposure when one label covers different ranges | POINTER | ResearchQuestionAndEstimandGate/AmbiguousDoseLabelDefinitionAndStratification (records numeric dose, units, route, formulation, frequency, duration, cumulative exposure, co-use; dose-category map; analyze exact doses, not labels), named in the rule; the "map and stratify by numeric exposure" instruction is also kept inline. |
| 11 | TwoAxisEvidenceHierarchy (owner row) | KEPT | Same rule; "institutional authority, publication prestige" shortened to "authority, prestige". Sibling SourceVerification draft points here. |
| 12 | NoCrossDoseEvidenceLaundering (owner row) | KEPT | Same rule. Sibling SourceVerification draft points here. |
| 13 | SymmetricThresholdReasoning (owner row): all four statements | KEPT | Same rule, near-verbatim. |
| 14 | ThresholdOutputMinimum (owner row): six distinctions | KEPT | Same rule. |
| 15 | ThreeThresholdModel (owner row) | KEPT | Same rule (three thresholds, the explicit three-way answer, no collapsing). |
| 16 | IntendedUseSeparation (owner row) | KEPT | Same rule, all six strata. |
| 17 | AnecdoteChronologyReconstruction (owner row) | KEPT | Same rule, all fifteen items. |
| 18 | ResearchContractFidelity | KEPT | Same rule, all fields and both prohibitions. Not server-enforced today (inventory GATE_CANDIDATE). |
| 19 | ClinicianReferralDoesNotReplaceAnalysis (owner row) | KEPT | Same rule. |
| 20 | MicrodosingMeasurementAudit (owner row) | KEPT | Same rule, all fifteen checks, formula display, drop calibration, syringe-measured milliliters in analysis. |
| 21 | FunctionalOutcomesFirstClass (owner row) | KEPT | Same rule. |
| 22 | CitationPersistenceThroughTransformation | KEPT | Same rule. Only copy in either protocol, so it stays here (see DR-4). |
| 23 | DoseRegimeCorrectionPropagation: retract, identify misapplied evidence, corrected exposure-specific wording, review downstream recommendations, update derived guides; old operational rule active is incomplete | KEPT | Same rule; adds a pointer to EvidenceUpdateAndCorrectionProtocol/CorrectionPropagationIsMandatory (its general twin). |
| 24 | CompactRule (owner row): five sentences | REMOVED_REDUNDANT | Summary of this section's own rules: no generalizing across regimes without labeling (row 12), exact exposures (row 8), threshold distinctions (row 14), validity versus applicability (row 11), microdosing arithmetic (row 20). |
| 25 | OutputMinimum/Item 1 to 10 | KEPT | One OutputMinimum element, all ten items ("when each applies" carries the items' own "when relevant/applicable" qualifiers; item 4 names ThresholdOutputMinimum, a superset of "lowest adverse and beneficial doses, denominator status, threshold limits"). "Beside the claims they support" restates OutputFormatting/ModuleOutputs. |

## Tests and cross-references

- `tests/interview-evidence-integrity.test.ts` pins `<DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch` (open-tag prefix). Kept.
- Named in protocol text by AnswerShapeController/DoseRegimeIntegrityDefaultTrigger, ResearchQuestionAndEstimandGate/
  ExposureIndexBeforePharmacologicalSynthesis, MedicationSupplementBotanicalSafety/DoseRegimeIntegrityRequired, and
  FinalSelfCheck DomainAudits (section name only). No rule name in this section is referenced by tests or protocol text;
  all rule names are kept anyway because batch-1 audit docs and the stress-test inventory cite them.
- VersionDiscipline/RegressionProtection capabilities kept: dose-regime integrity, internal validity versus applicability
  (row 11), cross-dose laundering ban (row 12), symmetric threshold reasoning (rows 13, 14), three-threshold model (row 15),
  microdosing arithmetic and delivery audit (row 20).
- Stress cases covered (per inventory): SubMicrogramEvidenceLaunderedFromStandardDose, UnknownThresholdConvertedToNoSafeThreshold,
  NoReportsBelowDoseConvertedToSafety, BroadNonOpioidRequestRemainsOpioidCentered, FortyOneAnecdotesPresentedAsHundreds,
  AcuteAndProtractedWithdrawalPooled, KratomSevenOHAndSRChronologyConfused, DropDilutionAcceptedWithoutCalibration,
  InstitutionalInductionGuidanceWithoutDose, ClinicianReferralReplacesTechnicalAnalysis, BenefitWithoutEndpoint,
  TranslationDropsCitations, AmbiguousLDNVersusULDNLabelsPooled: each governing rule is kept.

## Sizes

Old 11,840 characters (11,864 bytes); new 9,877 characters. 83%.

## Why this section stays large

Nearly all of it is the only statement of its method; 15 of 21 inventory rows are owner rows. The duplicates are in
other sections and could shrink there in a later batch: QuantitativeRiskAndResearchAudit/ThresholdEvidenceSymmetry
(still present in the sibling draft) and DoseRegimeCompatibilityFirewall, MedicationSupplementBotanicalSafety/
DoseRegimeIntegrityRequired, SourceVerificationAndCitationAudit/InternalValidityAndApplicabilityAreIndependent (already
a pointer in the sibling draft), and FinalSelfCheck.

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| ID | Proposed change | Saves | What changes |
|---|---|---|---|
| DR-1 | Activation becomes: "AnswerShapeController/DoseRegimeIntegrityDefaultTrigger; also any structured or deep claim whose answer may change with frequency, duration, indication, population, or abstinence state." plus the unchanged exclusions. | about 200 | The module's own trigger ("questions involving" the topic list) is replaced by the router's narrower "questions in which [these] could change the conclusion". |
| DR-2 | ExposureIndex sub-items become a bare field list: "dose and unit; route; formulation, including concentration and excipients; schedule and cumulative exposure; timing relative to agonists, interacting substances, or withdrawal phase; co-exposures; dependence state; population; exact outcome and onset; measurement confidence". | about 400 | Drops the per-field details (release type, titration or taper, meals and sleep timing, tolerance, abstinence duration, prior withdrawal, transition sequence, population sub-items, outcome sub-types). Inventory note: "a one-line field list preserves the method" (owner row). |
| DR-3 | OutputMinimum becomes: "Report beside its claims the result of each rule above that applied, including the distinct role of clinical monitoring and whether a correction was propagated." | about 450 | The ten named output items become one generic instruction. |
| DR-4 | Move CitationPersistenceThroughTransformation to OutputFormatting (inventory: "generic output rule misplaced in the dose module"). | about 330 here, about 0 overall | Placement only; needs an OutputFormatting edit in the same change. |
