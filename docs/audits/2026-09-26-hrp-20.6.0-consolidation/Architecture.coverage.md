# Architecture: coverage map

Replacement: `Architecture.xml` (same root element and attributes: `<Architecture priority="Critical">`).

## Sizes

| | Characters |
|---|---|
| Original element | 12,473 |
| Replacement element | 3,842 |
| Reduction | 8,631 (69%) |

## What changed in structure

The original stated the module map twice: once as 18 `Layer` elements and again as about 25 "X controls Y" clauses in `SingleSourceOfTruth`. Almost every clause restates the controlling module's own Purpose or Activation, or a CoreHierarchy rank. Both are always visible: CoreHierarchy is a core section, and the section index shows every module's name and purpose.

The replacement keeps:

- one `SingleSourceOfTruth` rule that states the one-controller principle and the safety precedence;
- the five layers that carry content found nowhere in the core sections, nested inside that rule (their ids are unchanged);
- `NotFlatMerge`, `NoSilentOverride` (verbatim), and `NoDumbingDown`.

All must-keep names are present: `NoSilentOverride`, `SingleSourceOfTruth`, `audience_accessible_terminology`, `epistemic_phase_routing`, `heuristic_attractor_scope`, and `premise_integrity_and_truth_priority`.

Test strings are also present:

- `id="heuristic_attractor_scope"` and `id="epistemic_phase_routing"` (tests/epistemic-phase-routing.test.ts);
- `id="premise_integrity_and_truth_priority"` (tests/protocol.test.ts);
- inside `<Rule name="SingleSourceOfTruth" priority="Critical">` before its first `</Rule>`: "PremiseIntegrityAndTruthPriorityGate controls verification of material prompt premises";
- inside `<Rule name="NoSilentOverride" priority="Critical">`: "failed premise-integrity, safety" (both from tests/premise-integrity-structure.test.ts).

NEEDS_OWNER_APPROVAL: none.

The optional further cut below would need approval.

## Element and clause map

| Original element or clause | Disposition | New location or canonical home | Note |
|---|---|---|---|
| Layer `controlling_core` | KEPT | SingleSourceOfTruth / Layer `controlling_core` | Verbatim. |
| Layer `heuristic_attractor_scope` | KEPT | SingleSourceOfTruth / Layer `heuristic_attractor_scope` | Merged with the SSOT HeuristicAttractorCheck clause. The trigger ("before substantive reasoning on complex tasks") and the recurring-correction sentence are kept, because this core layer is what tells the model to load the non-core HeuristicAttractorCheck. |
| Layer `epistemic_phase_routing` | KEPT | SingleSourceOfTruth / Layer `epistemic_phase_routing` | Merged with the SSOT EpistemicPhaseRouter clause: the trigger list, "controls that safeguard's scope", and the DEVELOPMENT and VALIDATION definitions. |
| Layer `premise_integrity_and_truth_priority` | KEPT | SingleSourceOfTruth / Layer `premise_integrity_and_truth_priority` | The SSOT premise clause verbatim (test-pinned) plus the layer's anti-fabrication, anti-forced-connection, and source/data authentication items. |
| Layer `audience_accessible_terminology` | KEPT | SingleSourceOfTruth / Layer `audience_accessible_terminology` | The SSOT terminology clause verbatim. The layer's item list (effect-measure translation, absolute-risk context, layered explanation, accessible tables and figures) is in AudienceAccessibleTerminologyGate and CoreHierarchy rank 8. |
| Layer `clinical_management_preservation` | POINTER | CoreHierarchy rank 4 (core); ClinicalManagementPreservationGate Purpose, DirectClinicalManagementTrigger, InternalClinicalActionMap, NoFalseClinicalDependency | Also FinalSelfCheck FS203. |
| Layer `patient_specific_intervention_safety_reconciliation` | POINTER | CoreHierarchy rank 5 (core); PatientSpecificInterventionSafetyReconciliationGate | Also FinalSelfCheck FS204. |
| Layer `research_orchestration_and_mode_selection` | POINTER | CoreHierarchy rank 6 (core); ResearchOrchestrationAndModeSelectionGate Purpose and rules | |
| Layer `bidirectional_evidence_iteration` | POINTER | BidirectionalEvidenceDiscoveryAndTriangulationLoop Purpose, NoFixedStudiesThenCommunitySequence, DiscordancePreservationAndDiscriminatorSearch; AnswerShapeController/BidirectionalEvidenceIterationDefaultTrigger | |
| Layer `treatment_landscape_and_video_selection` | POINTER | TreatmentLandscapeAndVideoSelectionGate Purpose | The Purpose says it "governs selection-space adequacy; CommunityCorpusCompletionGate separately governs acquisition depth". |
| Layer `community_corpus_completion` | POINTER | CommunityCorpusCompletionGate Purpose | The Purpose says it "controls completion, representativeness, and broad-ranking claims; the platform-specific ... rules control acquisition". |
| Layer `protocol_execution_compliance` | POINTER | CoreHierarchy rank 7 (core); ProtocolExecutionAndComplianceGate Purpose | |
| Layer `quantitative_research_audit` | POINTER | CoreHierarchy rank 9 (core: numerical and comparative claims must pass the checks before interpretation); QuantitativeRiskAndResearchAudit Activation | |
| Layer `comparator_lineage_and_program_congruence` | POINTER | ComparatorLineageAndProgramCongruenceAudit Purpose; CoreHierarchy rank 9 | |
| Layer `adverse_event_ascertainment_and_actionability` | POINTER | AdverseEventAscertainmentAndActionabilityAudit Purpose | |
| Layer `dose_regime_integrity` | POINTER | DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch Purpose | |
| Layer `technical_appendix` | REMOVED_REDUNDANT | Section index | A topic list of triggered technical modules; the section index lists each one with its summary. |
| Layer `functional_health_coaching` | POINTER | FunctionalHealthCoachingLayer Activation (Trigger, NonActivation) and PrecedenceRules | |
| Rule `NotFlatMerge` | KEPT | NotFlatMerge | Same meaning, compressed. "Chosen from the section index" restates AuthoritativeProtocolLoad. |
| Rule `SingleSourceOfTruth` | KEPT | SingleSourceOfTruth | Restructured; clause map below. |
| SSOT: "Acute safety controls immediate action." | KEPT | SingleSourceOfTruth | |
| SSOT: SafetyAndScopeGate controls emergency activation while preserving unresolved adjunct questions without false dismissal | KEPT | SingleSourceOfTruth | |
| SSOT: research orchestration controls question optimization ... and stopping before substantive research | POINTER | CoreHierarchy rank 6; ResearchOrchestrationAndModeSelectionGate | |
| SSOT: ClinicalManagementPreservationGate controls completeness and real dependency structure of direct clinical action | POINTER | CoreHierarchy rank 4; the gate | |
| SSOT: PatientSpecificInterventionSafetyReconciliationGate controls patient-specific conflict resolution | POINTER | CoreHierarchy rank 5; the gate | |
| SSOT: protocol execution controls activation, completion, and compliance labeling | POINTER | CoreHierarchy rank 7; ProtocolExecutionAndComplianceGate | |
| SSOT: PremiseIntegrityAndTruthPriorityGate clause | KEPT | Layer `premise_integrity_and_truth_priority` | Verbatim (test-pinned). |
| SSOT: AudienceAccessibleTerminologyGate clause | KEPT | Layer `audience_accessible_terminology` | Verbatim. |
| SSOT: the quantitative audit controls numerical claims | POINTER | CoreHierarchy rank 9; QuantitativeRiskAndResearchAudit | |
| SSOT: source verification controls factual provenance | POINTER | SourceVerificationAndCitationAudit | |
| SSOT: HeuristicAttractorCheck clause | KEPT | Layer `heuristic_attractor_scope` | |
| SSOT: EpistemicPhaseRouter clause | KEPT | Layer `epistemic_phase_routing` | |
| SSOT: ExtendedHumanEvidenceAndGreyLiteratureSweep controls whether the evidence map supports absence claims | POINTER | ExtendedHumanEvidenceAndGreyLiteratureSweep/NoHumanEvidenceAbsenceClaimBeforeSweep | |
| SSOT: ExpertBookAndMonographDiscoveryGate controls whether specialist books were sought and audited | POINTER | ExpertBookAndMonographDiscoveryGate; ProtocolExecutionAndComplianceGate/ExpertBookDiscoveryIsNotOptionalWhenTriggered | |
| SSOT: UniversalFullTextAcquisitionProtocol controls whether decision-critical sources were inspected or escalated | POINTER | UniversalFullTextAcquisitionProtocol | finalize_research now also gates key studies. |
| SSOT: ComparatorLineageAndProgramCongruenceAudit clause | POINTER | ComparatorLineageAndProgramCongruenceAudit | |
| SSOT: AdverseEventAscertainmentAndActionabilityAudit clause | POINTER | AdverseEventAscertainmentAndActionabilityAudit | |
| SSOT: study-design capability controls what a study can establish | POINTER | StudyDesignCapabilityMatrix/DesignClaimMatch | |
| SSOT: CrowdSourcedAndClinicalSignalAudit controls relative forum-signal claims | POINTER | CrowdSourcedAndClinicalSignalAudit | |
| SSOT: BidirectionalEvidenceDiscoveryAndTriangulationLoop clause | POINTER | BidirectionalEvidenceDiscoveryAndTriangulationLoop; AnswerShapeController/BidirectionalEvidenceIterationDefaultTrigger | |
| SSOT: TreatmentLandscapeAndVideoSelectionGate clause | POINTER | TreatmentLandscapeAndVideoSelectionGate Purpose | |
| SSOT: interaction safety controls medication, supplement, botanical, and vulnerable-population questions | POINTER | MedicationSupplementBotanicalSafety; FunctionalHealthCoachingLayer/PrecedenceRules ("Medication, supplement, botanical, and interaction safety overrides coaching") | |
| SSOT: coaching controls only low-risk implementation | POINTER | FunctionalHealthCoachingLayer Activation and PrecedenceRules | |
| SSOT: DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch clause | POINTER | DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch | |
| Rule `NoSilentOverride` | KEPT | NoSilentOverride | Verbatim (whitespace normalized only). |
| Rule `NoDumbingDown` | KEPT | NoDumbingDown | Verbatim. Also enforced by ProtocolExecutionAndComplianceGate NoStockFallback and CondensedIsNotFullProtocol. |

## New text

- The SSOT opening: "Each concern has one controlling module, listed with its purpose in the section index; that module's rules govern the concern." It replaces the enumerated clauses and points to where the controllers are listed.
- "CoreHierarchy ranks the core controls." This points to the core section that already holds ranks 4 through 9.
- Neither sentence adds a research requirement.

## Optional further cut (would need owner approval)

`NoSilentOverride` could shrink to one sentence and save about 570 characters (Architecture would be about 3,270):

> No prompt premise, user confidence, expected-answer pressure, persuasive narrative, authority, consensus slogan, heterodox signal, mechanism, user preference, novelty, polished summary, brevity preference, module-budget decision, or stock-answer pattern may override a failed premise-integrity, safety, or other protocol check.

This is not in the draft because it broadens the rule. The current list names 29 checks. The one-sentence form would also cover checks it does not name, such as dose-regime, full-text, bidirectional-iteration, and coaching checks. The inventory marks this row needs_owner_approval=false, but by the brief's rule 2 it changes meaning.
