# ResearchOrchestrationAndModeSelectionGate: coverage

Replacement: `ResearchOrchestrationAndModeSelectionGate.xml`. Splice it over the exact range from
`<ResearchOrchestrationAndModeSelectionGate` through `</ResearchOrchestrationAndModeSelectionGate>`.

Dispositions as in ProtocolExecutionAndComplianceGate.coverage.md (OWNER_DEFAULT = owner-accepted output defaults).
Inventory rows with needs_owner_approval=true are marked (owner row); their substance is kept exactly.

## Elements

| # | Original element | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose | REMOVED_REDUNDANT | Summarized the rules below (and Architecture layer `research_orchestration_and_mode_selection`); rewritten as a 231-char index summary. |
| 2 | Activation/MandatoryTrigger | KEPT | Activation. Added "requests asking which mode or workflow works best" from AnswerShapeController/ResearchOrchestrationDefaultTrigger, which the inventory merges into this activation key; no other change. |
| 3 | Activation/NonActivation | KEPT | Activation. |
| 4 | Sequence RO0 to RO7 (owner row) | KEPT | Each step's original text kept verbatim as the lead sentence; the matching rules are folded into the steps instead of repeated. |
| 5 | PreflightBeforeBroadSearch | KEPT | Same name; plus "label them as scoping" from ProtocolExecutionAndComplianceGate/ResearchOrchestrationMustPrecedeSubstantiveSearch; visibility requirement is in RO4. |
| 6 | DecisionAndDeliverableDefinition | MERGED | RO1 (audience, acceptable uncertainty, action vs understanding, deliverable-specific thresholds). The deliverable-type list was examples (brief rule 5; Universal sequence step 1 covers the deliverable). |
| 7 | QuestionDecompositionAndEstimandPreview (owner row) | KEPT | RO2: both first sentences unioned; distinct-dimension list and the no-pooling-by-shared-name clause verbatim. |
| 8 | ProvisionalOptimizedQuestion | MERGED | RO4 (provisional question, resolved ambiguities, added distinctions, why better, no blank page). |
| 9 | UserVisibleOptimizedResearchSpecification (owner row) | KEPT | RO4: visibility rule, "include only material fields but evaluate all", all 16 fields verbatim, defaults, no design work transferred. |
| 10 | ConditionalPreResearchApprovalGate: five states | KEPT + POINTER | RO5; state definitions point to Universal approval_states (Universal defers to this gate for HRP tasks). |
| 11 | ConditionalPreResearchApprovalGate: approval_required axes, wait, no collection in same response; nonblocking conditions; not medical consent | KEPT | RO5; axes are the union of this rule, VerificationAndProceedingRule, and ProtocolExecutionAndComplianceGate/ResearchOrchestrationMustPrecedeSubstantiveSearch. |
| 12 | StructuredMaterialUserSteering | KEPT | RO5 (one to five, one axis, default, alternatives, consequences, answer codes). |
| 13 | NoGenericApproveModifyPrompt | KEPT + POINTER | RO5 (bare approve/modify fails; compact controls only after the specification and only if accurate). Example control phrases dropped as examples; "do not ask inferable preference questions" is Universal's self-resolution pass. |
| 14 | VerificationAndProceedingRule | MERGED | RO5 (axes unioned; do not re-ask after accepted defaults unless scope changes). |
| 15 | ReasoningRequirementAndSourceAcquisitionAreSeparate | KEPT | ModeSelection. |
| 16 | ReasoningRequirementLevels (4 levels) | KEPT | ModeSelection paragraph 3 (all four level definitions, compressed). |
| 17 | ScopeOptionReasoningComparison | KEPT | ModeSelection paragraph 3. |
| 18 | SourceAcquisitionLevels (5 levels) | KEPT + SERVER_GATE | ModeSelection paragraph 3; on connector runs the full-text level is the server's acquire, continue, validate chain (paragraph 1). |
| 19 | ModeAvailabilityAndUserControl | KEPT | ModeSelection. |
| 20 | InternalDeepModeTerminology | KEPT | ModeSelection ("HRP deep-audit mode" is not "ChatGPT Deep Research"). |
| 21 | DeepResearchBenefitsAndDownsides | KEPT | ModeSelection paragraph 4. |
| 22 | OnePassFeasibilityAudit | KEPT | Same name; factor list and overload thresholds (more than three questions, more than two languages or scripts, etc.) unchanged. |
| 23 | PassDecomposition (owner row) | KEPT | Verbatim. |
| 24 | ModeIterationPlan | KEPT | ModeSelection paragraph 4. |
| 25 | EstimatedSourceBudget | KEPT | SourceBudget paragraph 1. |
| 26 | SourceBudgetHeuristics (5 bands) | KEPT | SourceBudget paragraph 3 (all numbers unchanged). |
| 27 | SourceBudgetAccounting (owner row) | KEPT | SourceBudget paragraph 2, verbatim. |
| 28 | SourceCountIsNotQuality | KEPT | SourceBudget paragraph 1. |
| 29 | SourceAccessInventory | KEPT | Same name. |
| 30 | LanguageAndCommunityPlan (owner row) | KEPT | Verbatim. |
| 31 | PassSpecificEvidenceLedger | KEPT | Same name. |
| 32 | AdaptiveStoppingRule (owner row) | KEPT | Verbatim. |
| 33 | NoFalseDeepResearchClaim | KEPT | ModeSelection. |
| 34 | ModeSpecificPromptAndHandoff: immediate complete handoff; before and after research; exact mode, why, can and cannot resolve, return packet, next mode; no reflexive Deep Research | KEPT | Same name; also absorbs the Deep Research clause of IncompleteModuleContinuationHandoff (required vs recommended; cannot unlock private groups, subscription books, decision-critical full texts). |
| 35 | ModeSpecificPromptAndHandoff: Deep Research field enumeration | REMOVED_REDUNDANT | Restated the RO4 fields; now "the final optimized research specification". |
| 36 | FinalOptimizedResearchSpecificationAndApproval | MERGED | RO6 (restate final specification with prompt and approval basis) and RO5 (approval). |
| 37 | PreflightOutputMinimum | MERGED | PreflightOnlyResponse plus the items below. |

## PreflightOutputMinimum items

| Item | Disposition / home |
|---|---|
| 1 Protocol preflight status and exact version | Status KEPT (PreflightOnlyResponse: research not yet run). Version: NEEDS_OWNER_APPROVAL, together with the preflight label in ProtocolExecutionAndComplianceGate. |
| 2 Decision, audience, deliverable, acceptable uncertainty | RO1, RO4 |
| 3 Visible specification and copyable prompt | RO4 |
| 4 Primary estimand, secondary questions, exclusions, deferred questions | RO4 |
| 5 Population, exposure, dose strata, route, formulation, comparator, endpoints, horizons | RO4 |
| 6 Inclusion and exclusion; unit of analysis; deduplication, overlapping cohorts, rechallenge | RO4 |
| 7 Strict-core and adjacent cohorts, stratification, sensitivity analyses, verdict-changing findings | RO4 |
| 8 Why the method fits | RO4 ("and why it fits") |
| 9 Steering questions with defaults, alternatives, consequences | RO5 |
| 10 Approval status, approval needed or received, nonblocking basis | RO5, RO6, PreflightOnlyResponse |
| 11 Separate reasoning and source-acquisition ratings | ModeSelection, RO4 |
| 12 Mode availability without false activation claims | ModeSelection |
| 13 One-pass feasibility and overload factors | OnePassFeasibilityAudit |
| 14 Passes and iteration sequence | PassDecomposition, RO6, ModeSelection paragraph 4 |
| 15 Planning ranges labeled as heuristics | SourceBudget |
| 16 Access, extraction, privacy, language-community constraints | SourceAccessInventory, LanguageAndCommunityPlan, RO4 |
| 17 What the research can and cannot estimate | RO4 |
| 18 Stopping criteria and final confirmation | AdaptiveStoppingRule, RO6 |

## ChatGPT-mode reference text

An earlier draft cut the reasoning-level and source-acquisition definitions, the scope-option comparison, the Deep
Research benefits and downsides, the default iteration sequence, and the planning bands (inventory CUT_CANDIDATE rows)
and flagged them. They were restored into ModeSelection and SourceBudget in compressed form, so they are KEPT and
need no approval. Serving them only on ChatGPT surfaces would save about 2,300 characters elsewhere; that is an owner
decision.

## Size

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 26,157 | 26,185 |
| Replacement element | 18,992 | 19,008 |

The 6,000 to 8,000 target is not reachable while the seven owner rows keep their substance: they alone are about
5,600 characters, and the approval axes and states, activation key, and purpose add about 2,400. Further cuts the
inventory proposes but that need owner approval: move the RO4 field list into ResearchAuditTemplates (about 1,600);
point AdaptiveStoppingRule to BidirectionalIterationStoppingRule and the server's continuation flags (about 400); drop
the per-pass field list from PassDecomposition (about 150); serve the ChatGPT-mode text (ModeSelection paragraphs 3
and 4, the planning bands, the Deep Research handoff) only on ChatGPT surfaces (about 2,300).
