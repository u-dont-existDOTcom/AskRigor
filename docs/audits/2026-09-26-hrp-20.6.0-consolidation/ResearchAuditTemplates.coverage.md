# ResearchAuditTemplates: coverage and decision

Replacement: `ResearchAuditTemplates.xml` (same root element and attribute, `priority="High"`). All 15 templates are
byte-identical to the original. The only change is a new leading `<Purpose>`, which the section index uses as the
summary: “Reference forms for the full audit record. Load only for a technical audit or debug export, when the user asks
for the full audit record or a full continuation handoff, or to audit a supplied multi-claim report (WholeReportAudit)…”

## Decision: (b) keep the text, serve it as reference material

Chosen over (a), a compact 4,000–6,000-character runtime version, because:

1. (a) cannot meet its own target without breaking a constraint. The 14 owner-approval rows (QuantitativeSafetyReview,
   ComparatorLineageAndAdverseEventAudit, ExtendedHumanEvidenceSweep, HistoricalEvidenceTransportAudit, seven
   ForumSignalAudit parts, DoseRegimeIntegrityAudit, two BidirectionalEvidenceIterationLedger parts) are about 14,700
   bytes of field lists whose substance must stay exact. Keeping them plus the must-keep templates gives about
   14,000–16,000 characters, not 4,000–6,000.
2. (b) removes the whole section from ordinary runs (about 35,500 characters, the measured cost) instead of about 20,000,
   with zero risk to method content.
3. Nothing a researcher needs while working is lost. The forms restate runtime module rules (the method lives in the
   modules; see the table below) and the process ledgers that the inventory marked GATE_CANDIDATE are now covered by
   research receipts and finalize_research. No runtime rule needs a template for an ordinary answer; the new
   OutputFormatting names templates only for technical exports and full records on request.
4. The forms are exactly what their real consumers need in full: a technical audit, a debug export, a full continuation
   handoff on request, and an audit of a supplied report (WholeReportAudit's 25-step checklist has the most unique
   runtime value, which is why the Purpose names it).
5. Tests pass unchanged: tests/protocol.test.ts requires `<Template id="ProtocolExecutionLedger">` and
   `<Template id="BidirectionalEvidenceIterationLedger">` each to contain the 13 community-corpus fields.

Implementation: the Purpose alone makes the index tell the model when to load the section (checked with
`protocolSections` on an assembled copy: summary starts “Reference forms for the full audit record. Load only for…”).
Optional hardening, outside this deliverable: a reference flag in packages/protocol/src/sections.ts so the index marks the
section as reference material; tests/protocol-sections.test.ts would need a matching update.

## Templates

| Template (must-keep marked *) | Disposition | Runtime home of the substance |
|---|---|---|
| ResearchOrchestrationPreflight * | KEPT (reference) | ResearchOrchestrationAndModeSelectionGate (Sequence, PreflightOutputMinimum, approval rules); OutputFormatting/ResearchOrchestrationPreflightOutput |
| ResearchPassLedger | KEPT (reference) | ResearchOrchestrationAndModeSelectionGate/PassSpecificEvidenceLedger, AdaptiveStoppingRule |
| ResearchContinuationHandoff * | KEPT (reference) | ProtocolExecutionAndComplianceGate/IncompleteModuleContinuationHandoff; OutputFormatting/LimitsNote |
| ProtocolExecutionLedger * | KEPT (reference) | ProtocolExecutionAndComplianceGate (AuthoritativeProtocolLoad, CanonicalSourceVerificationAttestation, ApplicableModuleLedger, CompletionBlockBeforeSynthesis); TreatmentLandscapeAndVideoSelectionGate/AggregateLandscapeSynthesisLock; CommunityCorpusCompletionGate/CoverageStateBeforeSynthesis; SERVER_GATE: survey and audit receipts, finalize_research |
| QuantitativeSafetyReview | KEPT (reference) | QuantitativeRiskAndResearchAudit (QA1–QA14, ArithmeticCoherence, MixtureModelCheck, PopulationAlignment, TimeAtRisk, RiskContextualization) |
| ComparatorLineageAndAdverseEventAudit | KEPT (reference) | ComparatorLineageAndProgramCongruenceAudit; AdverseEventAscertainmentAndActionabilityAudit; IntentAttributionScale |
| EvidenceUpdate * | KEPT (reference) | EvidenceUpdateAndCorrectionProtocol (UpdateStructure, NameExactFailure, ChallengeTriggersRecalculation) |
| WholeReportAudit * | KEPT (reference; Purpose names it for supplied-report audits) | SourceVerificationAndCitationAudit/WholeReportAudit plus each module |
| ExtendedHumanEvidenceSweep | KEPT (reference) | ExtendedHumanEvidenceAndGreyLiteratureSweep (BeyondConventionalIndexes, ExtendedSourceAppraisalMinimum, ExtendedEvidenceOutput) |
| HistoricalEvidenceTransportAudit | KEPT (reference) | SourceVerificationAndCitationAudit historical rules; QuantitativeRiskAndResearchAudit/HistoricalDoseAndRecipeTranslation; OutputFormatting/HistoricalEvidenceTransportOutput |
| DecisionCriticalFullTextEscalation * | KEPT (reference) | UniversalFullTextAcquisitionProtocol (EscalationRequestMinimum, ClaimLocalStatusUntilMaterialGapResolved); SERVER_GATE: acquire_open_full_text, finalize_research |
| ExpertBookDiscovery * | KEPT (reference) | ExpertBookAndMonographDiscoveryGate |
| ForumSignalAudit | KEPT (reference) | CrowdSourcedAndClinicalSignalAudit; TreatmentLandscapeAndVideoSelectionGate; CommunityCorpusCompletionGate; SERVER_GATE: survey and per-video audit receipts |
| DoseRegimeIntegrityAudit | KEPT (reference) | DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch (rules, OutputMinimum) |
| BidirectionalEvidenceIterationLedger * | KEPT (reference) | BidirectionalEvidenceDiscoveryAndTriangulationLoop; CommunityCorpusCompletionGate; TreatmentLandscapeAndVideoSelectionGate |

## Inventory rows (44)

Every row: disposition KEPT, text unchanged, loaded only as reference. Columns show the inventory's recommendation and why
leaving it out of ordinary runs loses nothing.

| Inventory row (`HRP:ResearchAuditTemplates/Template@...`) | Owner approval | Inventory rec. | Runtime coverage |
|---|---|---|---|
| ResearchOrchestrationPreflight#DecisionAndAudience | | MOVE_OUT | Gate RO1, DecisionAndDeliverableDefinition |
| ResearchOrchestrationPreflight#ProposedOptimizedResearchSpecification | | MOVE_OUT | UserVisibleOptimizedResearchSpecification |
| ResearchOrchestrationPreflight#MaterialSteering | | MOVE_OUT | StructuredMaterialUserSteering |
| ResearchOrchestrationPreflight#ApprovalGate | | MERGE | ConditionalPreResearchApprovalGate |
| ResearchOrchestrationPreflight#ModeAndFeasibility | | MOVE_OUT | ReasoningRequirementAndSourceAcquisitionAreSeparate, OnePassFeasibilityAudit |
| ResearchOrchestrationPreflight#PassPlanAndStopping | | MOVE_OUT | PassDecomposition, EstimatedSourceBudget, AdaptiveStoppingRule |
| ResearchOrchestrationPreflight#FinalConfirmation | | CUT | FinalOptimizedResearchSpecificationAndApproval |
| ResearchPassLedger | | MOVE_OUT | PassSpecificEvidenceLedger |
| ResearchContinuationHandoff | | COMPRESS | IncompleteModuleContinuationHandoff; OutputFormatting/LimitsNote |
| ProtocolExecutionLedger#ProtocolSourceAttestation | | GATE_CANDIDATE | CanonicalSourceVerificationAttestation; load_protocol hashes |
| ProtocolExecutionLedger#AudienceAndTerminologyAccessibility | | CUT | AudienceAccessibleTerminologyGate/TerminologyLedger |
| ProtocolExecutionLedger#ResearchOrchestration | | MERGE | ResearchOrchestrationAndModeSelectionGate |
| ProtocolExecutionLedger#ApplicableModules | | MERGE | ApplicableModuleLedger |
| ProtocolExecutionLedger#TreatmentLandscapeAndVideoSelection | | GATE_CANDIDATE | AggregateLandscapeSynthesisLock; finalize_research (unaudited material video) |
| ProtocolExecutionLedger#CommunityCorpusCompletion | | GATE_CANDIDATE | CoverageStateBeforeSynthesis; audit receipts; finalize_research |
| ProtocolExecutionLedger#PerModuleStatus | | GATE_CANDIDATE | ApplicableModuleLedger; finalize_research declarations |
| ProtocolExecutionLedger#CompletionGate | | GATE_CANDIDATE | CompletionBlockBeforeSynthesis; finalize_research |
| QuantitativeSafetyReview | yes | MOVE_OUT | QA1–QA14; ArithmeticCoherence and MixtureModelCheck hold the arithmetic check |
| ComparatorLineageAndAdverseEventAudit | yes | MOVE_OUT | ComparatorLineage and AdverseEvent audit sections |
| EvidenceUpdate | | MERGE | UpdateStructure |
| WholeReportAudit | | MOVE_OUT | SourceVerificationAndCitationAudit/WholeReportAudit; Purpose routes supplied-report audits here |
| ExtendedHumanEvidenceSweep | yes | MOVE_OUT | ExtendedHumanEvidenceAndGreyLiteratureSweep |
| HistoricalEvidenceTransportAudit | yes | MOVE_OUT | SourceVerification historical rules; HistoricalEvidenceTransportOutput |
| DecisionCriticalFullTextEscalation | | MERGE | UniversalFullTextAcquisitionProtocol; acquire_open_full_text |
| ExpertBookDiscovery | | MERGE | BookDiscoveryOutput |
| ForumSignalAudit#QuestionAndScopeAxes | yes | MOVE_OUT | ScopeAxesBeforeSampling |
| ForumSignalAudit#TreatmentSpaceAndSelectionCoverage | | GATE_CANDIDATE | TreatmentLandscapeAndVideoSelectionGate |
| ForumSignalAudit#SelectedVideoTreatmentRecords | | GATE_CANDIDATE | SelectedVideoTreatmentRecord; per-video audit receipts |
| ForumSignalAudit#CohortArchitecture | yes | MOVE_OUT | UniqueFirsthandUnit, TieredInclusionInsteadOfPrematureExclusion, SnippetAndPartialAccessTier |
| ForumSignalAudit#PlatformMapAndSearchSample | yes | MOVE_OUT | PrincipalPlatformMapping, RelativeForumSignal, ClosedPlatformAndAccessDisclosure, CommunityCorpusCompletionGate |
| ForumSignalAudit#DirectionalFindings | yes | MOVE_OUT | RelativeForumSignal, ObjectiveSubjectiveSeparation |
| ForumSignalAudit#SensitivityAnalysis | yes | MOVE_OUT | RouteAndCohortSensitivityAnalysis |
| ForumSignalAudit#BiasAudit | yes | MOVE_OUT | SilentDenominator, CommercialAndCommunityBias |
| ForumSignalAudit#Conclusion | yes | MOVE_OUT | ThreePartCommunityConclusion |
| ForumSignalAudit#CrossLayerIteration | | MERGE | Bidirectional loop transfer rules |
| ForumSignalAudit#DeepForumFollowUp | | CUT | DeepForumAuditActivationPrompt |
| DoseRegimeIntegrityAudit | yes | MOVE_OUT | DoseRegimeIntegrity rules and OutputMinimum |
| BidirectionalEvidenceIterationLedger#QuestionAndInitialReconnaissance | | MOVE_OUT | NoFixedStudiesThenCommunitySequence |
| BidirectionalEvidenceIterationLedger#CrossLayerTransfers | yes | MOVE_OUT | CommunityToFormalHypothesisTransfer, FormalToCommunityDiscriminatorTransfer |
| BidirectionalEvidenceIterationLedger#YouTubeTreatmentLandscapeFields | | MERGE | AggregateLandscapeSynthesisLock |
| BidirectionalEvidenceIterationLedger#YouTubeCorpusCompletionFields | | GATE_CANDIDATE | CoverageStateBeforeSynthesis; audit receipts |
| BidirectionalEvidenceIterationLedger#DiscordanceRegister | yes | MOVE_OUT | DiscordancePreservationAndDiscriminatorSearch, CrossLayerDiscordanceMatrix |
| BidirectionalEvidenceIterationLedger#Saturation | | MERGE | BidirectionalIterationStoppingRule, NoPrematureSaturation |
| BidirectionalEvidenceIterationLedger#FinalIntegratedSynthesisRule | | MERGE | IntegratedSynthesisByClaim |

Owner-approval rows: 14, all kept byte-identical.

## Known stale or conflicting lines left unchanged (option b keeps text)

The Purpose states that a form field never adds an answer section or overrides a runtime rule, so these no longer steer
ordinary answers. A later owner-approved cleanup could fix them in place:
- ProtocolExecutionLedger: “required opening: Partial HRP analysis — incomplete modules:” (conflicts with the new
  no-opener default) and “Full HRP label permitted?”.
- DecisionCriticalFullTextEscalation and ExpertBookDiscovery: “Full HRP completion blocked” (stale after the 20.5.22
  claim-local full-text rule; the book gate's DecisionRelevantBookEscalation still uses Partial wording).
- ResearchOrchestrationPreflight: “HRP version and revision” header field; ChatGPT-only mode fields (Pro, Deep Research).
- ForumSignalAudit#DeepForumFollowUp: copyable prompt field.
- Three copies of the treatment-landscape lock fields (ProtocolExecutionLedger, ForumSignalAudit,
  BidirectionalEvidenceIterationLedger).

## Size

| | Characters | Bytes |
|---|---:|---:|
| Old | 35,548 | 35,573 |
| New (file) | 36,059 | 36,084 |
| Loaded in an ordinary research run | about 35,500 before (runtime section) | 0 after (reference only) |
