# PatientHistoryAndRecurrenceEvidenceGate: coverage

Replacement: `PatientHistoryAndRecurrenceEvidenceGate.xml`. Splice over the exact range from
`<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">` through `</PatientHistoryAndRecurrenceEvidenceGate>`
(HRP_Full.xml lines 707 to 733 in 20.6.0). Same root element and attribute.

Dispositions: KEPT, MERGED, POINTER (home named), SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
No inventory row for this section is needs_owner_approval=true.

Design: this gate is the health application of two Universal sections, `interview_evidence_information_gain_gate`
and `evidence_discrimination_gate`, whose rules are near-verbatim twins of the ten HRP rules. The rules now name the
Universal twin and keep only the health-specific clauses inline. Every clause the twin covers was checked against the
Universal text (all quoted phrases present). The Purpose now names both Universal sections by their loadable names,
so `load_protocol` can fetch them.

## Method impact

Wording only. Behavior depends on the model also loading the two named Universal sections (see Risk).

## Element map

| # | Original element / clause | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose: apply the compatible Universal interview-evidence, information-gain, evidence-discrimination, and longitudinal-evidence gates | KEPT | Purpose, now naming `interview_evidence_information_gain_gate` and `evidence_discrimination_gate` (the longitudinal checks live in the latter). |
| 2 | Purpose: scope list (patient-history intake, symptom recurrence, adverse-effect reports, behavioral and lifestyle history, surveys, reviewer extraction, individual-case differentials, any health evidence-gathering dialogue) | KEPT | Purpose (all eight items). |
| 3 | Purpose: without weakening HRP chronology, denominator, Dose-Regime, safety, causal-attribution, privacy, or forum controls | KEPT | Purpose ("never weakens ..."), same list. "Compatible" is carried by this clause. |
| 4 | Per-rule `priority="Critical"` | KEPT | Replaced by "Every rule here is Critical." in the Purpose. |
| 5 | ReportedRecurrenceIsEvidence: statement such as “this happens every time I eat X” is direct evidence of reported recurrence | KEPT | Same rule; test-pinned phrase kept. |
| 6 | ... not zero evidence | POINTER | Universal DirectRecurrenceSelfReport ("Do not discard it merely because it is not a bounded episode"). |
| 7 | ... not automatic proof of true frequency or causality | KEPT | Same rule. |
| 8 | Preserve event or behavior, original quantifier, eligible exposures or opportunities, life period and context, exceptions, uncertainty | POINTER | Universal DirectRecurrenceSelfReport (proposition, quantifier, scope or denominator, life period or context, exceptions, uncertainty); the rule now declares the patient statement a DirectRecurrenceSelfReport, so the list applies to symptom recurrence too. |
| 9 | Preserve dose or formulation when relevant, timing | KEPT | Same rule ("Also preserve ..."). Health-only delta. |
| 10 | Keep behavioral or symptom recurrence separate from trait labels and diagnostic or causal interpretations | KEPT | Same rule. |
| 11 | PatientExceptionFirstProbe: before asking for a confirming incident | KEPT | Same rule. |
| 12 | ... which exposures count; when the outcome does not happen; how often it fails at natural precision | POINTER | Universal ExceptionFirstRecurrenceProbe (same three probes, natural resolution, no false precision). |
| 13 | ... whether dose, form, co-exposure, timing, setting, or relevant period changes the pattern | KEPT | Same rule (period kept inline so it stays unconditional, as in HRP; the Universal twin asks about periods only "when material"). |
| 14 | ... which tolerated controls or failure cases discriminate competing explanations | KEPT | Same rule. |
| 15 | Qualify “always” or “every time” by acknowledged exceptions; do not silently rescue the universal wording | POINTER | Universal OrdinaryLanguageQuantifierCalibration, named in the rule. |
| 16 | HealthEvidenceRoleLedger: eight evidence roles | POINTER | Universal EvidenceRoleSeparation (same eight roles; "patient causal explanation" and "reviewer or coder inference" named inline). |
| 17 | Conditionally elicited confirming anecdote may clarify chronology, exposure, consequences, mechanism, or a boundary; not an independent frequency observation | KEPT + POINTER | Chronology, exposure, and the independence clause inline; consequences, mechanism, boundary via Universal SpecificityIsNotIndependence (named). |
| 18 | Do not merge repeated tellings or several volunteered examples into independent support | KEPT | Same rule. |
| 19 | OpportunityFrequencySampling: five sampling designs with a defined frame | POINTER | Universal FrequencySamplingFrame (same five designs). |
| 20 | Never infer incidence, prevalence, or unbiased personal frequency from story count, forum count, or volunteered-example quota | KEPT | Same rule. |
| 21 | LongitudinalCausalConstraintMap: before a differential or causal ranking, review complete history, record three to seven constraints | KEPT | Same rule. |
| 22 | Constraint kinds (onset relative to candidate exposures, sequence, persistence, recurrence, dechallenge or rechallenge, functional trajectory, negative or tolerated comparisons) | POINTER | Universal high_information_qualifier_check (identical list), named in the rule. |
| 23 | Repeated response to a mechanistically relevant treatment class | KEPT | Same rule ("including when present"). Universal says only "treatment-class response". |
| 24 | Link each constraint to source statement or record; preserve uncertainty; test every leading hypothesis against every constraint, not only the current appearance | KEPT | Same rule. |
| 25 | PhenotypeEtiologyFirewall: keep what the lesion is separate from what initiated or maintains it | POINTER | Universal phenotype_etiology_firewall (named). |
| 26 | Cross-sectional observations describe phenotype unless independent evidence establishes etiology; must not erase stronger chronology, recurrence, treatment-response, functional, dechallenge/rechallenge, or comparator evidence | KEPT | Same rule. HRP extends the Universal "morphological diagnosis" wording to all cross-sectional observations, so it stays inline. |
| 27 | Common morphological diagnosis may coexist with an upstream infectious, immune, toxic, pharmacological, environmental, or other trigger | POINTER | Universal phenotype_etiology_firewall (same sentence). |
| 28 | CompleteLongitudinalPredictionCheck: five-way classification per constraint | KEPT | Same rule (Universal has only three classes). |
| 29 | Visually salient fit must not outrank a complete-pattern fit without an explicit evidence-supported reason | KEPT | Same rule. |
| 30 | AlreadyPresentEvidenceUpdateClassification (all clauses, labels) | KEPT | Same rule, near-verbatim. Related home: EvidenceUpdateAndCorrectionProtocol/AlreadyPresentEvidenceIsNotNew (adds rerun and revise); both are test-pinned singletons, so neither is removed. |
| 31 | HealthFollowUpInformationGain: state the uncertainty and a plausible answer that would change the differential, causal assessment, recommendation, evidence code, or next question | POINTER | Universal FollowUpExpectedInformationGain (same test; "causal assessment" = inference, "evidence code" = code). |
| 32 | Ask for a bounded incident only when it resolves such uncertainty or belongs to a valid sampling design | POINTER | Universal IncidentInformationGain. |
| 33 | Consent, acute safety, legal, provenance, owner-required, predetermined valid study fields remain mandatory when applicable | KEPT | Same rule. |
| 34 | HealthCollectionMethodIntegrity: never make a patient, interviewer, or reviewer manipulate JSON or JSONL for substantive judgment | KEPT | Same rule (stronger than the Universal "not the default interface", so kept inline). |
| 35 | Ordinary controls preserving exact schema, invalid-combination rules, provenance, uncertainty, blinding | POINTER | Universal HumanJudgmentInterface. |
| 36 | Pre-collection defect: preserve old frozen artifact, record defect, new theory- or target-blind version, regenerate dependents, collect only under corrected version | POINTER | Universal PreCollectionMethodDefect. |
| 37 | ... and prior data unchanged | KEPT | Same rule (HRP-only delta). |
| 38 | RegressionCase EveryFoodExposureRecurrenceReport: scenario | KEPT | Verbatim (test-pinned id and phrase). |
| 39 | EveryFood RequiredBehavior: preserve as direct recurrence self-report; probe denominator, exceptions, conditions, dose or form, timing, contrasts first; defined sampling frame | REMOVED_REDUNDANT | Restated rules 5 to 20; now "Apply ReportedRecurrenceIsEvidence through OpportunityFrequencySampling". |
| 40 | EveryFood RequiredBehavior: do not demand a confirming meal as though it independently validated frequency | KEPT | Same case. |
| 41 | RegressionCase ImageOverridesLongitudinalHistory: scenario | KEPT | Compressed, all facts kept (widespread lesions, immediate onset after exposure, years of systemic illness, repeated treatment-class response, common-dermatosis photograph). |
| 42 | ImageOverrides RequiredBehavior: morphology separate from etiology; chronology, trajectory, treatment-class response as major constraints | REMOVED_REDUNDANT | Restated rules 21 to 27; now "Apply LongitudinalCausalConstraintMap through AlreadyPresentEvidenceUpdateClassification". |
| 43 | ImageOverrides: do not make the exposure incidental unless independent evidence contradicts it; later correction of already-present facts is a weighting or representation failure | KEPT | Same case. |

## Tests and cross-references

- `tests/interview-evidence-integrity.test.ts` pins in HRP: the open tag `<PatientHistoryAndRecurrenceEvidenceGate priority="Critical">`
  (exactly once), `name="ReportedRecurrenceIsEvidence"`, `name="PatientExceptionFirstProbe"`, `name="HealthEvidenceRoleLedger"`,
  `name="OpportunityFrequencySampling"`, `name="HealthFollowUpInformationGain"`, `name="HealthCollectionMethodIntegrity"`,
  `id="EveryFoodExposureRecurrenceReport"`, and the phrase `this happens every time I eat X`. All kept.
- `tests/longitudinal-evidence-preservation.test.ts` pins as exact singletons: the open tag, `name="LongitudinalCausalConstraintMap"`,
  `name="PhenotypeEtiologyFirewall"`, `name="CompleteLongitudinalPredictionCheck"`, `name="AlreadyPresentEvidenceUpdateClassification"`,
  `id="ImageOverridesLongitudinalHistory"`; and contains `name="ReportedRecurrenceIsEvidence"`, `name="PatientExceptionFirstProbe"`. All kept once.
- Other sections: FinalSelfCheck FS205 names this section; FS202, FS205, FS206 restate its rules (not changed here).
- VersionDiscipline/RegressionProtection capabilities kept: pre-differential three-to-seven constraint map (rule 21),
  source-linked predictions across the complete trajectory (rules 24, 28), phenotype–etiology separation and protection
  against cross-sectional erasure (rules 25 to 29), new versus already-present correction classification (rule 30).
- Checked by splicing all four drafts into a copy of HRP 20.6.0: XML valid, 60 sections, every pinned string present
  with the required counts, pages within the 40,000-byte limit.

## Sizes

Old 7,765 characters (7,789 bytes); new 5,788 characters. 75%.

## Risk

The rules now rely on the two named Universal sections for their shared clauses. The Purpose names them and
the AskRigor skill loads applicable Universal sections first, but neither is a Universal core section. If the owner
prefers self-contained HRP rules, restore rows 6, 8, 12, 15, 16, 19, 22, 25, 27, 31, 32, 35, 36 inline (about +1,900
characters).

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| ID | Change | Saves | What changes |
|---|---|---|---|
| PH-1 | Move both RegressionCase elements out of this runtime section into StressTestExpectations as `<Case id="EveryFoodExposureRecurrenceReport">` and `<Case id="ImageOverridesLongitudinalHistory">` (same text; `Prompt` = Scenario, `ExpectedBehavior` = RequiredBehavior). The inventory marks both MOVE_OUT_OF_RUNTIME (eval fixtures). | about 1,000 | Runtime text only. Must land in the same change as the StressTestExpectations insertion, or both tests fail (the ids are pinned in HRP). |
