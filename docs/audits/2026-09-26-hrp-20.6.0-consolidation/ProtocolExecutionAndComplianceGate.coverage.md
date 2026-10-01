# ProtocolExecutionAndComplianceGate: coverage

Replacement: `ProtocolExecutionAndComplianceGate.xml`. Splice it over the exact range from
`<ProtocolExecutionAndComplianceGate` through `</ProtocolExecutionAndComplianceGate>` (the file's first line has no
leading space and its last line has one, matching the original byte range).

Dispositions: KEPT, MERGED, POINTER, SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL, plus
OWNER_DEFAULT = changed only by the output-shape defaults the owner accepted (brief rule 4: no fixed opener;
process status in one short plain-language limits note near the end; uncertainty at claim level).

## Rules

| # | Original element (inventory id) | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose: module enumeration | REMOVED_REDUNDANT | Restates ApplicableModuleLedger and Architecture layer `protocol_execution_compliance`. Purpose rewritten as a 212-char index summary (`sectionSummary()` reads Purpose; the old one was truncated at 240). |
| 2 | Purpose: dose-regime, applicability, emergency-pathway, task-fidelity, microdosing, functional-outcome, citation-persistence, correction-propagation enforcement | REMOVED_REDUNDANT | Restates ledger items and Architecture layer `dose_regime_integrity`; DoseRegimeIntegrityDefaultTrigger activates the module. |
| 3 | AuthoritativeProtocolLoad: when to load (explicit HRP, canonical reference, in-depth HRP task) | POINTER | Universal canonical_protocol_execution_gate (HRP activation boundary) and askrigor_keyword. |
| 4 | AuthoritativeProtocolLoad: load index, every core section, each applicable runtime section before the step that uses it | KEPT | AuthoritativeProtocolLoad. |
| 5 | AuthoritativeProtocolLoad: permitted sources of canonical text | SERVER_GATE + POINTER | load_protocol serves exact sections; saved/user-supplied/direct copies: Universal canonical_protocol_execution_gate item 1. |
| 6 | AuthoritativeProtocolLoad: no website fetch needed when version verifiable | MERGED | AuthoritativeProtocolLoad ("update checks are optional"). |
| 7 | AuthoritativeProtocolLoad: maintainer sections need not be loaded | POINTER | Section index `runtime` flag; Universal item 1 ("each runtime section"). |
| 8 | AuthoritativeProtocolLoad: except triage, no substantive work presented as HRP before loading | KEPT | "before the step that uses it" + triage-only fallback; also Universal item 5. |
| 9 | AuthoritativeProtocolLoad: substitutes forbidden (memory, condensed, prior answer, filename, version label, snippet, rendered summary, generic knowledge) | KEPT + POINTER | Memory, condensed instruction, summary, snippet, prior answer kept; filename, version label, cached rendering in Universal item 2. |
| 10 | CanonicalSourceVerificationAttestation: verify name, version, revision inside the copy | SERVER_GATE + POINTER | Byte-derived manifest ("byte-derived version"); Universal "verify ... from the loaded canonical text or its manifest". |
| 11 | CanonicalSourceVerificationAttestation: 7 internal record fields | SERVER_GATE / REMOVED_META | Bookkeeping now carried by the manifest and load calls. |
| 12 | CanonicalSourceVerificationAttestation: labels, filenames, metadata do not verify; no refetch to repeat version | POINTER / MERGED | Universal item 2; update-check clause. |
| 13 | UpdateCheckIsInformationalNotPrerequisite: no routine live check; failure never blocks, is no incomplete module, needs no partial label | KEPT | AuthoritativeProtocolLoad (last sentence). |
| 14 | UpdateCheck...: conditions that justify a live check | POINTER | Universal canonical_protocol_execution_gate item 3. |
| 15 | UpdateCheck...: latest version requested but unverifiable, say unresolved and name version used | REMOVED_META | Version-audit behavior; Universal item 4 covers "never claim latest without a successful check". |
| 16 | UpdateCheck...: no update diagnostics in routine answers | KEPT | AuthoritativeProtocolLoad; also Universal item 4 and askrigor_keyword item 8. |
| 17 | UpdateCheck...: routine answers state verified version and point to AskRigor.com | OWNER_DEFAULT | No fixed opener. Conflicts with Universal askrigor_keyword item 8 (needs the Universal pass). |
| 18 | DirectSourceConflictAndCacheHandling | REMOVED_META + SERVER_GATE | Live-version troubleshooting only; the manifest re-reads and hashes live bytes on every call. |
| 19 | CanonicalTextUnavailableBlocksFullHRP: triage and bounded partial analysis only; no simulated execution under tool/source failure or time pressure; update-site failure alone does not trigger | KEPT | AuthoritativeProtocolLoad. |
| 20 | CanonicalTextUnavailableBlocksFullHRP: "Partial HRP analysis — incomplete modules:" opener | OWNER_DEFAULT | Stated in the limits note. |
| 21 | ProtocolLoadingIsNotProtocolExecution | KEPT | ProtocolLoadingIsNotProtocolExecution; "convert rules into the ledger" is ApplicableModuleLedger. |
| 22 | ResearchOrchestrationMustPrecedeSubstantiveSearch | POINTER | ResearchOrchestrationAndModeSelectionGate: RO4 (visible specification; internal plan insufficient), RO5 (approval, union of axes), PreflightBeforeBroadSearch (scoping must be labeled as scoping). |
| 23 | CondensedIsNotFullProtocol | MERGED | AuthoritativeProtocolLoad (sentence kept); "sections loaded through the index satisfy execution" = load rule plus Universal item 1. |
| 24 | ApplicableModuleLedger: six status values | KEPT | ApplicableModuleLedger (verbatim values). |
| 25 | ApplicableModuleLedger: 51 listed items | POINTER + KEPT | Every module in the section index and every AnswerShapeController trigger (a superset); items that live inside modules kept by name. Item map below. |
| 26 | LedgerItem research_continuation_handoff | MERGED | IncompleteModuleContinuationHandoff (same fields). |
| 27 | MandatoryTriggeredModuleCompletion: execute every mandatory-triggered Critical module; community access-boundary exception; full-text stricter rules | KEPT | MandatoryTriggeredModuleCompletion. |
| 28 | MandatoryTriggeredModuleCompletion: boundary is not observation; prohibited for skip, proxy, unattempted feasible acquisition, invented signal | KEPT / REMOVED_REDUNDANT | Kept in CommunityCorpusAccessBoundaryCompletion; the prohibited cases restate its conditions 1 to 3. |
| 29 | MandatoryTriggeredModuleCompletion: brevity, length, convenience, familiarity, consensus, stronger evidence elsewhere, low tier, token economy never justify silent omission | KEPT | MandatoryTriggeredModuleCompletion. |
| 30 | CommunityCorpusAccessBoundaryCompletion: six conditions | KEPT | Same name (must-keep; referenced by CommunityCorpusCompletionGate and tests/protocol.test.ts). |
| 31 | CommunityCorpusAccessBoundaryCompletion: execution-completeness state with coverage debt; no upgrade, no forum-signal classification, no unperformed search satisfied, full-text rules not weakened | KEPT | Compressed; "unperformed search" is condition 1. |
| 32 | EvidenceLayerStatusRequired | KEPT | MandatoryTriggeredModuleCompletion (layer classified not applicable, inaccessible, or insufficient; tier changes weight). |
| 33 | TerminologyAccessibilityIsMandatory | KEPT + POINTER | NoShortcutCompletion (answer incomplete until fixed); method in AudienceAccessibleTerminologyGate. |
| 34 | ComparatorLineageIsNotOptionalWhenTriggered: audit content | POINTER | ComparatorLineageAndProgramCongruenceAudit (identity, classes, InferentialScopeByComparator, EvidenceAncestryTrace, BaselineEvidenceDebt, ComponentBundleProgramCongruence). |
| 35 | ComparatorLineage...: randomized or "placebo-controlled" does not complete it | POINTER | StudyMethodReliabilityGate/NoDesignOrPublicationStatusReliabilityShortcut ("randomized, controlled ... none completes [an audit]"; no comparator competence) and ComparatorTerminologyPrecision. |
| 36 | AdverseEventAscertainmentIsNotOptionalWhenTriggered (audit content and "no treatment-related events" shortcut) | POINTER | AdverseEventAscertainmentAndActionabilityAudit: AllEventsBeforeRelatednessFiltering, RelatednessAdjudicationTransparency, LatencyWindowCompatibility, PostDiscontinuationAndAttritionCapture, DiagnosticAndActionabilityGapRegister. |
| 37 | IntentAttributionCalibrationIsMandatory: grade on the scale; bias or conflict is not intent | POINTER | EvidenceQualityBiasAndCOI (IntentAttributionScale, IntentAttributionFirewall). |
| 38 | IntentAttributionCalibrationIsMandatory: unsupported intent language blocks completion | KEPT | NoShortcutCompletion. |
| 39 | DecisionCriticalFullTextCannotBeSilentlyDeferred: automatic lawful attempts, lead preservation, provisional claims, continue other work, handoff only when useful | SERVER_GATE + POINTER | acquire_open_full_text (lawful attempts, `possibly_useful_lead`); finalize_research (key study without validated audit, DOI lead without attempt); UniversalFullTextAcquisitionProtocol (MandatoryProviderNeutralFullTextEscalation, ClaimLocalStatusUntilMaterialGapResolved, NoSilentAbstractSubstitution, UserDeclineOrUnavailableExtractor). |
| 40 | DecisionCriticalFullText...: definition of decision-critical | POINTER + KEPT | DecisionCriticalSourceDefinition; the one element it lacks (could change intent attribution) kept in NoShortcutCompletion. |
| 41 | ExpertBookDiscoveryIsNotOptionalWhenTriggered: search scope, lawful access | POINTER | ExpertBookAndMonographDiscoveryGate (BookDiscoveryMinimum, LibraryFirstAndLawfulAccess, DecisionRelevantBookEscalation). |
| 42 | ExpertBookDiscovery...: journal searches alone do not complete it | KEPT | NoShortcutCompletion. |
| 43 | ExtendedHumanEvidenceIsNotOptionalPublicationDecoration: mandatory source classes; inaccessible, narrow the conclusion | POINTER | ExtendedHumanEvidenceDefaultTrigger, BeyondConventionalIndexes, NoHumanEvidenceAbsenceClaimBeforeSweep; ledger status "inaccessible". |
| 44 | ExtendedHumanEvidence...: publication status and design change weight, not inclusion | KEPT | MandatoryTriggeredModuleCompletion (also PublicationStatusDoesNotUpgradeOrErase). |
| 45 | BidirectionalEvidenceIterationIsNotOptionalWhenTriggered: one transfer pass each way, or record why | KEPT | NoShortcutCompletion. |
| 46 | BidirectionalEvidenceIteration...: discordance, targeted reruns, cross-layer stopping check | POINTER | Loop rules DiscordancePreservationAndDiscriminatorSearch, NoFixedStudiesThenCommunitySequence, BidirectionalIterationStoppingRule. |
| 47 | ForumSignalIsNotOptionalTierFourDecoration: mandatory question types; low causal power is no excuse | KEPT + POINTER + SERVER_GATE | MandatoryTriggeredModuleCompletion keeps the types ForumSignalDefaultTrigger lacks (lived experience, tolerability, formulation or route differences); finalize_research demands community "researched" or "not_relevant" with reason. |
| 48 | ForumSignalIsNotOptional...: forum ranks below controlled human evidence for causal and population claims | POINTER | EvidenceLayers; CrowdSourcedAndClinicalSignalAudit (ForumSignalDoesNotOverrideDirectEvidenceAutomatically, NoPopulationRateFromForumSample). |
| 49 | NoProxyCompletion | KEPT | NoShortcutCompletion (full list, incl. institutional complaint page, absent from NoForumSignalByProxy). |
| 50 | NoStockFallback | KEPT | MandatoryTriggeredModuleCompletion (also Architecture/NoDumbingDown). |
| 51 | NoSilentAccessFailure#p1 | KEPT | NoSilentAccessFailure. |
| 52 | NoSilentAccessFailure#p2 (optional update endpoint is not research access; no diagnostics) | MERGED | AuthoritativeProtocolLoad last sentence. |
| 53 | IncompleteModuleContinuationHandoff: trigger; finish executable work first; continue in chat unless interrupted, declined, or blocked | KEPT | IncompleteModuleContinuationHandoff. |
| 54 | IncompleteModuleContinuationHandoff: seven blocker classes | KEPT | Verbatim codes; reported "in plain words" (FS190 and owner default). |
| 55 | IncompleteModuleContinuationHandoff: 12 per-blocker report fields | KEPT | All 12, compressed into one sentence. |
| 56 | IncompleteModuleContinuationHandoff: unresolved source identity | KEPT | Same. |
| 57 | IncompleteModuleContinuationHandoff: extractor batch (three to ten) and field list | POINTER + KEPT | UniversalFullTextAcquisitionProtocol (batch size, EscalationRequestMinimum, ExtractionMinimum, a superset of the fields); "exact page or table provenance" kept. |
| 58 | IncompleteModuleContinuationHandoff: book request | POINTER + KEPT | DecisionRelevantBookEscalation (title, author, edition, ISBN, chapters or pages); year, index terms, bibliography sections, tables, and excerpts-sufficient kept. |
| 59 | IncompleteModuleContinuationHandoff: private or closed community request | KEPT | Same, incl. benefit, no-effect, failure, progression, harm, discontinuation, rechallenge. |
| 60 | IncompleteModuleContinuationHandoff: Deep Research prompt, required vs recommended, cannot unlock private groups, books, full texts | MERGED | ResearchOrchestrationAndModeSelectionGate/ModeSpecificPromptAndHandoff (single home). |
| 61 | IncompleteModuleContinuationHandoff: partial answer without handoff fails; access-boundary answer needs it when retrievable and ranking- or conclusion-changing | KEPT | Same. |
| — | Added during integration (not in the original): "Keep the handoff short and in the limits note (OutputFormatting LimitsNote): lead with the single best next move and give at most one copyable request per blocker; the user's answer comes first." | OWNER_DEFAULT | Applies the short-limits-note default and absorbs "lead with one best next move" from OutputFormatting/ResearchContinuationHandoffOutput. The original already asked for one exact request per blocker. |
| 62 | CompletionBlockBeforeSynthesis#p1 | MERGED | MandatoryTriggeredModuleCompletion (rerun ledger; blocked; boundary exception) and CommunityCorpusAccessBoundaryCompletion (coverage caveat). |
| 63 | CompletionBlockBeforeSynthesis#p2 (partial corpus stays bounded evidence) | POINTER + KEPT | CommunityCorpusCompletionGate (PartialRetrievalRemainsBoundedEvidence, CoverageStateBeforeSynthesis); "not an unexecuted module" kept. |
| 64 | CompletionBlockBeforeSynthesis#p3: exits (triage, preflight-only, tool or access limits, user-requested provisional synthesis) | KEPT | MandatoryTriggeredModuleCompletion. |
| 65 | CompletionBlockBeforeSynthesis#p3: preflight may stop only after specification, approval status, decision, handoff | MERGED | ResearchOrchestrationAndModeSelectionGate/PreflightOnlyResponse. |
| 66 | CompletionBlockBeforeSynthesis#p3: partial answer must complete handoff; continue useful work; omission conditions | KEPT | IncompleteModuleContinuationHandoff. |
| 67 | CompletionBlockBeforeSynthesis#p4: labels | OWNER_DEFAULT | CompletionDisclosure. Kept: no full-completion claim with incomplete modules; access-boundary answers state missing corpus, impact class, forbidden inferences (at the affected claims and in the limits note, replacing "prominently"). |
| 68 | ComplianceLabel: "Analyzed with Heterodox Research Protocol: v[VERSION] ..." opener | OWNER_DEFAULT | Dropped (also resolves the FS190 conflict the inventory flagged). The no-opener rule now lives in the OutputFormatting draft; CompletionDisclosure points to it. |
| 69 | ComplianceLabel: "Partial HRP analysis — incomplete modules:" opener, naming modules and provisional/narrowed/uncertain status | OWNER_DEFAULT | CompletionDisclosure: modules and status named in OutputFormatting/LimitsNote. |
| 70 | ComplianceLabel: preflight label "HRP research preflight: v[VERSION] — research not yet executed." | NEEDS_OWNER_APPROVAL | Fixed string and version dropped; kept in ResearchOrchestrationAndModeSelectionGate/PreflightOnlyResponse: say plainly research has not run and what approval is needed; not a completed or partial synthesis. |
| 71 | ComplianceLabel: no update diagnostics in routine answers | KEPT | AuthoritativeProtocolLoad. |
| 72 | ComplianceLabel: access-boundary answer uses early evidence-coverage statement | OWNER_DEFAULT | Claim-level plus limits note (CommunityCorpusAccessBoundaryCompletion). |
| 73 | NoComplianceClaimFromGoodIntent | MERGED | ProtocolLoadingIsNotProtocolExecution. |
| 74 | NoPostHocForumFabrication | MERGED | CorrectionRequiresMissingModuleExecution. |
| 75 | CorrectionRequiresMissingModuleExecution | KEPT | Same (duplicate of EvidenceUpdateAndCorrectionProtocol/MissingModuleMustBeRun; kept per brief). |
| 76 | UserConstraintDisclosure | KEPT + OWNER_DEFAULT | Same; "label Partial HRP" became "do not present as full HRP" plus the limits note. |
| — | New: ServerCompletionGate | SERVER_GATE | The single server note: receipts, finalize_research, and that it covers only community and key-study work. |

## ApplicableModuleLedger items (original list)

| Item(s) | Home |
|---|---|
| Acute safety and scope | SafetyAndScopeGate |
| Emergency-pathway versus unresolved-adjunct separation | Kept by name (SafetyAndScopeGate) |
| Audience, assumed knowledge, terminology, acronyms, effect-measure translation | AudienceAccessibleTerminologyGate |
| Orchestration trigger and status; decision and deliverable; provisional and final specification and prompt; steering axes, defaults, alternatives, approval status and evidence, bypass reason; reasoning level; source acquisition; one-pass feasibility; passes and iteration; source budget; access inventory; language-community plan; stopping | ResearchOrchestrationAndModeSelectionGate |
| Numeric definitions for dose labels | Kept by name (ResearchQuestionAndEstimandGate/AmbiguousDoseLabelDefinitionAndStratification) |
| Actual question and estimand | ResearchQuestionAndEstimandGate |
| Protocol version and source | AuthoritativeProtocolLoad; server manifest |
| Source verification; historical terminology, endpoint expansion, backchaining, strata, translation, preparation identity, dose units | SourceVerificationAndCitationAudit; AnswerShapeController/HistoricalTerminologyAndEndpointExpansionTrigger |
| Historical intervention attribution | AnswerShapeController/HistoricalInterventionAttributionTrigger (PublicHealthInterventionAudit) |
| Expert books | ExpertBookAndMonographDiscoveryGate |
| Extended human evidence and grey literature | ExtendedHumanEvidenceAndGreyLiteratureSweep |
| Decision-critical full text | UniversalFullTextAcquisitionProtocol; server chain |
| Quantitative risk (temporal estimand, windows, null model, lag, subwindows, arithmetic) | QuantitativeRiskAndResearchAudit |
| Comparator identity, scope, ancestry, baseline debt; component-to-program congruence | ComparatorLineageAndProgramCongruenceAudit |
| Adverse-event ascertainment, relatedness, diagnostic or actionability gaps | AdverseEventAscertainmentAndActionabilityAudit |
| Study-design capability | StudyDesignCapabilityMatrix |
| Bias, conflicts, intent attribution | EvidenceQualityBiasAndCOI |
| Mechanism and cofactors | CofactorAndMechanismAudit |
| Interaction and vulnerable-population safety | MedicationSupplementBotanicalSafety |
| Risk contextualization and realistic comparators | Kept by name (QuantitativeRiskAndResearchAudit/RiskContextualization) |
| Direct human outcomes | EvidenceLayers (core) |
| Clinical signal; relative forum signal | CrowdSourcedAndClinicalSignalAudit; ForumSignalDefaultTrigger |
| Treatment landscape and video selection (class inventory, fingerprints, screening, diversity, per-video records, return passes, trajectories, uncovered classes, locks) | TreatmentLandscapeAndVideoSelectionGate (same trigger in TreatmentSpaceInventoryBeforeSelection) |
| Bidirectional iteration (transfers, discriminators, discordance, YouTube longitudinal corpus, saturation) | BidirectionalEvidenceDiscoveryAndTriangulationLoop |
| Traditional or ethnobotanical evidence | EthnobotanicalSpecificity |
| Product quality and formulation | Kept by name (MedicationSupplementBotanicalSafety/ProductQuality) |
| Functional coaching | FunctionalHealthCoachingLayer |
| Continuation-handoff status | Kept by name (IncompleteModuleContinuationHandoff) |
| Output and clinician review | OutputFormatting |
| Dose-regime items (exposure indexing; validity versus applicability; cross-dose, route, formulation, timing, indication, dependence-state transport; three thresholds; chronology and intended use; harm-reduction context and clinician limits; microdosing; functional outcomes; research-contract fidelity and corpus counts; citation persistence; correction propagation) | DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch (Architecture layer `dose_regime_integrity` lists the same items) |

## Size

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 33,662 | 33,710 |
| Replacement element | 12,630 | 12,650 |

The repo copy spliced during integration matches this file except CompletionDisclosure, which this file now shortens
to a pointer to OutputFormatting (no-opener rule, claim-level uncertainty, LimitsNote) and PreflightOnlyResponse,
removing the restatement.

The 5,000 to 7,000 target is not met without dropping unique requirements. The rest is the must-keep six conditions,
the completion gate and its exits, the anti-shortcut clauses that exist nowhere else, and the canonical handoff rule.
Further cuts that need owner decisions: move the handoff field list and per-blocker request specs into
ResearchAuditTemplates/ResearchContinuationHandoff (about 1,200 chars); move the anti-shortcut clauses into their home
modules (about 600 chars).
