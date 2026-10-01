# OutputFormatting: coverage

Replacement: `OutputFormatting.xml` (same root element and attribute, `priority="High"`).

Applied owner-accepted output defaults (brief rule 4): no fixed opener; research-process status (partial modules, access
gaps, handoffs) goes in one short plain-language limits note near the end (new rule `LimitsNote`); uncertainty is stated
at the claim (`ClaimLevelUncertainty`); everything the user needs stays (`ReaderFacingAnswer`, `ClinicianReviewPlan`,
R0–R5, footer).

Added (consolidation, not new requirements):
- `Purpose` (index summary).
- `ReaderFacingAnswer` also carries the existing ordinary-answer render controls (no internal codes, lock names, sampling
  or tool terms, compliance preambles; technical detail only in a technical audit or debug export). Today these live only
  in FS190, HRP 20.5.21 (revision history), the InternalAuditJargonLeaksIntoOrdinaryAnswer stress case, and
  TreatmentLandscapeAndVideoSelectionGate/SelectedVideoTreatmentRecord; this section is their natural runtime home.
- `LimitsNote`: "include every limit finalize_research returns" (the server contract: `ready_with_limits` lists limits the
  answer must state).

Pointers into ResearchOrchestrationAndModeSelectionGate name the section, not a rule: the sibling batch-1 draft merges
ConditionalPreResearchApprovalGate into step RO5 and PreflightOutputMinimum into PreflightOnlyResponse. Rule names cited
below are the current canonical ones.

## Rules

| Original (inventory id `HRP:OutputFormatting/...`) | Disposition | Where it is now / note |
|---|---|---|
| RecommendedResponseLevels/Level[R0–R5] (must keep R0; needs_owner_approval=true) | KEPT | Verbatim, same ids. |
| Rule@ResearchOrchestrationPreflightOutput | POINTER + KEPT | Field list: ResearchOrchestrationAndModeSelectionGate/PreflightOutputMinimum (see table A). Kept: heading “Proposed optimized research specification” before findings; required choices listed separately, not buried. "No estimated counts as completed counts": REMOVED_REDUNDANT (SourceBudgetAccounting). "No implied user-controlled mode": REMOVED_REDUNDANT (ModeAvailabilityAndUserControl, NoFalseDeepResearchClaim). |
| Rule@OptimizedResearchSpecificationApprovalOutput | KEPT (in ResearchOrchestrationPreflightOutput) + POINTER | All five end states and their content kept; status definitions: ConditionalPreResearchApprovalGate. "Does this look good?" clause: REMOVED_REDUNDANT (NoGenericApproveModifyPrompt). |
| Rule@EvidenceMapLabels | KEPT (in ClaimOrganizedSynthesis) | All eleven labels kept. EvidenceLayers does not contain this label set. |
| Rule@JargonControl | POINTER + KEPT | AudienceAccessibleTerminologyGate (first-use definitions, acronyms, local definitions, precise term kept). Kept in ReaderFacingAnswer: no jargon that hides meaning or uncertainty or signals authority. |
| Rule@PlainLanguageInterpretationLine | POINTER | AudienceAccessibleTerminologyGate/PlainLanguageThenTechnicalNuance (meaning first, then measure, then decision implication); pointer line in ReaderFacingAnswer. |
| Rule@NumbersBeforeAdjectives | POINTER | RiskLanguageOutput ("verbal labels only after these are clear"), RawCountsFirst, AbsoluteImpact; pointer line in ReaderFacingAnswer. |
| Rule@EvidenceTable | NEEDS_OWNER_APPROVAL (applied) | Now: ordinary answers use a compact table of the columns the decision needs; the full 29-column table belongs in a technical audit or debug export. Original text in table B for restoration. |
| Rule@QuantitativeRiskOutput | MERGED (ModuleOutputs) + POINTER | See table C. Every field kept either through a named QuantitativeRiskAndResearchAudit reporting rule or listed explicitly. |
| Rule@ComparatorAndAdverseEventOutput | POINTER + MERGED | Fields: ComparatorLineageOutput, AdverseEventAuditOutput (ModuleOutputs "each module's own output rule"). The do-not-bury list: kept verbatim in ClaimLevelUncertainty. |
| Rule@IntegratedCrossLayerSynthesisOutput | MERGED (ClaimOrganizedSynthesis) + POINTER | Home: BidirectionalEvidenceDiscoveryAndTriangulationLoop/IntegratedSynthesisByClaim (organize by claim; integrate layers; no detached appendix). Kept: applicability limits per claim; unresolved disagreement with most plausible discriminators; a separate forum-methods section is allowed. |
| Rule@ForumSignalOutput | MERGED (ModuleOutputs, LimitsNote) + POINTER | See table D. |
| Rule@CommunityAccessBoundaryOutput | MERGED (ClaimLevelUncertainty, LimitsNote) | See table E. Home: ProtocolExecutionAndComplianceGate/CommunityCorpusAccessBoundaryCompletion. |
| Rule@ExtendedHumanEvidenceOutput | MERGED (ModuleOutputs) + POINTER | See table F. |
| Rule@DecisionCriticalFullTextOutput | MERGED (LimitsNote, ClaimLevelUncertainty) + SERVER_GATE | See table G. |
| Rule@ResearchContinuationHandoffOutput | MERGED (LimitsNote), shape per brief rule 4 | See table H. |
| Rule@ExpertBookDiscoveryOutput | POINTER + KEPT | Home: ExpertBookAndMonographDiscoveryGate/BookDiscoveryOutput (books, relevance, access, terminology or citations contributed, verification, how the map changed). Kept in ModuleOutputs: clinical series or adverse reports contributed; bias or data-lineage concerns. |
| Rule@HistoricalEvidenceTransportOutput | KEPT | Every field kept; no other runtime output rule covers it. |
| Rule@HRPComplianceDisclosure | MERGED, shape per brief rule 4 | See table I. |
| Rule@DoseRegimeIntegrityOutput | REMOVED_REDUNDANT | DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch/OutputMinimum is a superset (exposure map, validity and applicability grades, direct vs mismatched, lowest adverse and beneficial doses, denominator and threshold limits, intended-use strata and chronology, functional outcomes, microdosing audit, research-contract accounting, correction propagation); ThresholdOutputMinimum too. ModuleOutputs points to each module's output rule. |
| Rule@ClinicianReviewPlan | KEPT | Verbatim content. |
| Rule@NoGenericConsultYourDoctor | MERGED (ClinicianReviewPlan) | Clinician role, why review is needed, useful questions or records; never a generic “consult your doctor.” |
| Rule@NoPrescriptionFormatting (needs_owner_approval=true) | KEPT | Verbatim. SafetyAndScopeGate/ResearchNotPrescription lacks the modality list, so this stays. |
| ComplexAnswerFooter/Item[1–6] | KEPT (1–4) + MERGED (5–6) | Items 1–4 kept (item 2 now names the R0–R5 scale it refers to). Item 5 (module status when compliance is material): the full audit record on request (ReaderFacingAnswer; ProtocolExecutionLedger form). Item 6 (best next move, handoff, minimum return packet, fallback): LimitsNote. |

## A. Preflight fields (ResearchOrchestrationPreflightOutput)

| Field | Home |
|---|---|
| decision and deliverable | PreflightOutputMinimum item 2 |
| optimized specification and copyable prompt | item 3 |
| population, dose or exposure, route, formulation, comparator, outcomes | item 5 |
| corpus boundaries, unit of analysis, deduplication and rechallenge | item 6 |
| stratification, sensitivity analyses | item 7 |
| distinctions added | ProvisionalOptimizedQuestion |
| method rationale | item 8 |
| steering questions with defaults and consequences | item 9 |
| approval status, exact approval or nonblocking basis | item 10 |
| separate reasoning and source-acquisition ratings | item 11 |
| user-controlled mode requirements | item 12 |
| one-pass feasibility | item 13 |
| pass and iteration plan | item 14 |
| heuristic source budgets | item 15 |
| access, extraction, privacy, language-community constraints | item 16 |
| what the research can and cannot estimate | item 17 |
| adaptive stopping criteria | item 18 |

## B. EvidenceTable original text (for restoration if not approved)

“For comparisons, use: Claim; Target Population; Exposure or Intervention; Intervention Scope; Comparator Class and Exact
Composition; Inferential Contrast; Comparator Ancestry and Baseline Debt; Exact Endpoint and Outcome Layer; Time Zero;
Selection Condition; Risk and Control Windows; Temporal Null Model and Lag-Dependent Ascertainment; Time Horizon and
Latency; Raw Counts; Descriptive Temporal Clustering; Comparative Excess Effect; Reconstructed Crude Effect; Adjusted
Effect; Absolute Effect; Relative Effect; Study Design; Adverse-Event Capture and Relatedness; Adjustment; Bias;
Intent-Attribution Level; Component-to-Program Applicability; Forum Signal; Actionability Gaps; and Next Discriminator.”
(priority Medium). Every column is a field of QuantitativeSafetyReview or ComparatorLineageAndAdverseEventAudit (Next
Discriminator = “Decision-changing next evidence”) except Claim (the row label), Relative Effect, Adjustment, Bias, and
Forum Signal, which the new rule names.

## C. QuantitativeRiskOutput fields

| Field | Now |
|---|---|
| reference population; exact comparator class and composition; inferential contrast; endpoint; observed or modeled; numerator and denominator (raw counts); absolute estimate; uncertainty; capture method; baseline evidence debt; actionability gaps | RiskLanguageOutput |
| formula and substituted values; crude and adjusted labeled separately | ReconstructableArithmeticDisclosure |
| interval; largest compatible increase and decrease | NullAssociationLanguageCalibration |
| risk and control windows; subwindows and multiplicity | RiskWindowMultiplicityAndAggregation |
| realistic comparator risks; nonaction risk | RiskContextualization |
| comparator ancestry; outcome layer; adverse-event relatedness and latency limits | ComparatorLineageOutput, AdverseEventAuditOutput (when those audits trigger) |
| clustering statistic kept separate from excess risk | DescriptiveTemporalClusteringVersusExcessRisk |
| plain-language definition of each effect measure or acronym | AudienceAccessibleTerminologyGate/EffectMeasureTranslationMinimum |
| intervention scope; time zero; selection condition; eligible person-time; temporal null model and expected-event calculation; lag-dependent ascertainment; major modifiers; what cannot be estimated | KEPT, listed explicitly in ModuleOutputs |

## D. ForumSignalOutput items

| Item | Now |
|---|---|
| "for every triggered audit, not only explicitly requested" | KEPT (ModuleOutputs) |
| principal platforms | RelativeForumSignal ("state the platforms") |
| why they are relevant | KEPT (ModuleOutputs) |
| communities searched; dominant inaccessible communities | RelativeForumSignal; ClosedPlatformAndAccessDisclosure |
| scope axes, working assumptions, clarification asked | KEPT ("scope axes and working assumptions"); ScopeAxesBeforeSampling |
| strict-core and adjacent-cohort definitions | KEPT |
| search terms, patient-language vocabulary, date window; threads or posts screened | RelativeForumSignal |
| approximate unique firsthand people and treatment episodes, or why counts are unreliable | KEPT (people and episodes); RelativeForumSignal (why unreliable) |
| report-quality, diagnosis-certainty, confounder-burden, access tiers; route- and formulation-specific counts; sensitivity analyses | RouteAndCohortSensitivityAnalysis; SnippetAndPartialAccessTier |
| claimed, opposite, no-effect, failure, adverse, discontinuation directions; objective vs subjective | RelativeForumSignal; ObjectiveSubjectiveSeparation |
| excluded questions, recommendations, speculation, reposts, proxies, duplicates | KEPT ("what was excluded") |
| formulation, route, dose, duration, baseline-trajectory, co-intervention patterns | KEPT |
| dropout, survivorship, moderation, deletion, selection, publication, commercial limits | RelativeForumSignal ("major selection and reporting biases"); SilentDenominator; CommercialAndCommunityBias |
| Community signal / Attribution confidence / Clinical-evidence concordance | ThreePartCommunityConclusion |
| community-to-formal and formal-to-community transfers; unresolved discordance | BidirectionalIterationOutput; DiscordancePreservationAndDiscriminatorSearch |
| what the forum evidence can support; what it cannot estimate | KEPT |
| copyable “check forums for…” prompt | KEPT, placed in LimitsNote (DeepForumAuditActivationPrompt) |
| no population rate from forum frequency | REMOVED_REDUNDANT (NoPopulationRateFromForumSample) |
| no classification without an actual search | REMOVED_REDUNDANT (ActualSearchRequired) |
| a deep-research plan alone does not satisfy | REMOVED_REDUNDANT (NoFalseDeepResearchClaim) |

## E. CommunityAccessBoundaryOutput items

| Item | Now |
|---|---|
| missing platform or corpus; acquisition attempted; evidence actually inspected | LimitsNote |
| what must not be inferred about the unseen corpus | ClaimLevelUncertainty |
| impact class (detail-only, confidence, ranking, conclusion) | LimitsNote ("likely impact") |
| report near the relevant conclusion; ranking could change materially; answer could change significantly | ClaimLevelUncertainty (stated at the affected claim or ranking) |
| current bounded conclusion | the answer itself; LimitsNote fallback |
| acquisition or export handoff when feasible and valuable | LimitsNote (user must act) |
| not research failure; execution vs coverage completeness | LimitsNote ("evidence-coverage gap, not research failure") |

## F. ExtendedHumanEvidenceOutput items

| Item | Now |
|---|---|
| source classes searched; human outcome evidence found; verified or preliminary; how it changed the evidence map; inaccessible source classes; comparator composition and ancestry; component-to-program scope; adverse-event ascertainment | ExtendedEvidenceOutput |
| historical terms and exact endpoints; named investigators and citation backchains; duplicate or overlapping datasets; major design limits | KEPT (ModuleOutputs) |
| source strata, textual dependencies, translation, material and preparation identity, dose-unit context | HistoricalEvidenceTransportOutput (kept) |
| expert books checked | BookDiscoveryOutput |
| decision-critical full texts inspected or escalated | LimitsNote (unread ones), ClaimLevelUncertainty |
| community-derived hypotheses that redirected the sweep | BidirectionalIterationOutput |
| no absence, anecdote-only, or preclinical-only claim before completion | REMOVED_REDUNDANT (NoHumanEvidenceAbsenceClaimBeforeSweep) |

## G. DecisionCriticalFullTextOutput items

| Item | Now |
|---|---|
| inaccessible studies and identifiers | LimitsNote ("with identifiers") |
| why decision-critical; exact claims whose certainty, comparison, or ranking could change | LimitsNote; ClaimLevelUncertainty |
| access status; routes attempted | LimitsNote ("what was tried and with what result"); SERVER_GATE: acquire_open_full_text returns the routes and `possibly_useful_lead`; finalize_research limits |
| optional upload, library, or service handoff | LimitsNote (user must act) |
| extraction fields needed | LimitsNote request, per IncompleteModuleContinuationHandoff |
| provisional conclusions | LimitsNote ("complete or provisional") |
| declined, failed, or downgraded | LimitsNote ("with what result") |

## H. ResearchContinuationHandoffOutput parts

| Part | Now |
|---|---|
| ends every Partial analysis and every preflight needing outside action | LimitsNote near the end; preflight includes the request (ResearchOrchestrationPreflightOutput) |
| fixed title “Research continuation handoff” and subsection list | Dropped per brief rule 4 (one short plain-language note). Full form stays in ResearchAuditTemplates/ResearchContinuationHandoff for when the user asks. |
| lead with one best next move; no undifferentiated menu | LimitsNote |
| requests executable as written; generic offers fail | LimitsNote |
| what to paste back; what this could change; fallback | LimitsNote |
| rank by decision value and dependency | LimitsNote |
| no extraction request before sources are identified | POINTER (IncompleteModuleContinuationHandoff) |

## I. HRPComplianceDisclosure parts

| Part | Now |
|---|---|
| fixed opener “Analyzed with Heterodox Research Protocol: v[VERSION] — check AskRigor.com…” | Removed (brief rule 4). The version and AskRigor.com line existed only as this opener, so it is not moved elsewhere; if the version comes up, the answer gives only the version used and AskRigor.com (ReaderFacingAnswer). Owner decision point: add a closing attribution line only if wanted. The sibling ProtocolExecutionAndComplianceGate draft (CompletionDisclosure) takes the same reading. |
| only when every applicable Critical module is complete | LimitsNote ("never call the answer a complete HRP analysis unless…") |
| preflight label “HRP research preflight: v[VERSION] — research not yet executed.” | Substance kept (preflight-only response says research has not been run); fixed label dropped per rule 4. |
| “Partial HRP analysis — incomplete modules:” opener | LimitsNote near the end (brief rule 4) |
| no update-check diagnostics in routine answers | KEPT (one clause in ReaderFacingAnswer); also UpdateCheckIsInformationalNotPrerequisite in the current gate |

## NEEDS_OWNER_APPROVAL

1. EvidenceTable: compact reader table by default; the 29-column table only in a technical audit or debug export
   (applied; original in table B).
2. Proposed, not applied: include the copyable forum-audit prompt only when the forum layer is incomplete or
   access-bounded and a deeper audit could change the answer. This needs a change to
   CrowdSourcedAndClinicalSignalAudit/DeepForumAuditActivationPrompt, which requires it in every response that reports
   forum signal. For now the prompt is kept and moved into the limits note.

## Cross-section conflicts created or exposed (to resolve in those sections' batches)

- In the current canonical file, ProtocolExecutionAndComplianceGate/ComplianceLabel requires the “Analyzed with…”,
  preflight, and “Partial HRP analysis” openers and an "early" coverage statement, and CanonicalTextUnavailableBlocksFullHRP,
  CompletionBlockBeforeSynthesis, and UserConstraintDisclosure require Partial labels. The sibling batch-1 draft of that
  gate (CompletionDisclosure, limits note near the end) already matches LimitsNote. Still to align elsewhere:
  ExpertBookAndMonographDiscoveryGate/DecisionRelevantBookEscalation ("synthesis Partial HRP"),
  CrowdSourcedAndClinicalSignalAudit/DeepForumAuditActivationPrompt (item 2 above), and FS136.
- The current UpdateCheckIsInformationalNotPrerequisite and FS136 say routine answers name the version and AskRigor.com;
  with the opener gone that statement has no place (the sibling gate draft already drops it).
- FS28, FS60, FS190 remain consistent.

## Size

| | Characters | Bytes |
|---|---:|---:|
| Old | 17,313 | 17,393 |
| New | 9,258 | 9,272 |
| Change | −47% | |

Above the 4,000–6,000 target because the output items that exist nowhere else (tables C, D, F, the do-not-bury list, the
historical-transport fields, the eleven evidence labels, R0–R5) were kept rather than dropped.
