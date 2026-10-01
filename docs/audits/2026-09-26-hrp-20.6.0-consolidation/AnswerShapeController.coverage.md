# AnswerShapeController: coverage

Replacement: `AnswerShapeController.xml` (same root element and attribute, `priority="Critical"`).

Structural changes (no meaning change):
- Added a `<Purpose>` so the section index summary says what the section is (the index takes its summary from the first Purpose).
- Per-rule `priority="Critical"` attributes removed: every rule was Critical, the same as the section; the Purpose says so.
- Order: safety triage first, then task, budget, modes, triggers. Every rule name and mode id is unchanged.

Pointers into ResearchOrchestrationAndModeSelectionGate name the section, not a rule: the sibling batch-1 draft of that
gate merges ModeAvailabilityAndUserControl, InternalDeepModeTerminology, and NoFalseDeepResearchClaim into ModeSelection
and PreflightOutputMinimum into PreflightOnlyResponse. Rule names cited below are the current canonical ones.

## Rules and modes

| Original (inventory id `HRP:AnswerShapeController/...`) | Disposition | Where it is now / note |
|---|---|---|
| Rule@PrimaryTaskFirst | KEPT (PrimaryTaskFirst) | Same task list; "clinical-signal evaluation, forum-signal evaluation" written as "clinical- or forum-signal evaluation". |
| Rule@ModuleBudget (must keep) | KEPT (ModuleBudget) | All four sentences kept; wording compressed. |
| Rule@ResearchOrchestrationDefaultTrigger | POINTER + KEPT | Activation and nonactivation: ResearchOrchestrationAndModeSelectionGate/Activation (MandatoryTrigger, NonActivation, including "record the reason"). Kept the one clause the gate lacks: presumptive activation when the user asks which mode or workflow will yield the best result. The gate's nonactivation list adds "direct editing or summarization with no new research"; such a task involves no research, so the trigger could not apply to it anyway. The gate's presumptive list is a superset of the rest of this rule's list. |
| Rule@HRPDeepModeIsNotDeepResearchTool | REMOVED_REDUNDANT | Duplicates InternalDeepModeTerminology, NoFalseDeepResearchClaim, and ModeAvailabilityAndUserControl (ResearchOrchestrationAndModeSelectionGate). A one-clause pointer stays in Mode `deep`. |
| Rule@QuantitativeDeepModeTrigger | KEPT (QuantitativeDeepModeTrigger) | Full condition list unchanged. Not a duplicate of the QuantitativeRiskAndResearchAudit Activation: it selects deep mode and lists conditions that Activation lacks. |
| Rule@ComparatorLineageTrigger (must keep) | KEPT (ComparatorLineageTrigger) | Every condition kept, including the "also activate" list (absolute vs relative risk, unclear control composition, product generations, disease reduction as evidence of reduced acquisition, shedding, transmission, indirect protection, eradication). |
| Rule@AdverseEventAscertainmentTrigger (must keep) | KEPT | Verbatim conditions. |
| Rule@ExtendedHumanEvidenceDefaultTrigger (must keep) | KEPT | All task types, "mandatory even when" conditions, community-signal clause, nonactivation list, and record-the-reason clause kept. |
| Rule@HistoricalTerminologyAndEndpointExpansionTrigger | KEPT + POINTER | Kept: trigger scope (old, neglected, renamed, regional, nonindexed, specialty-specific, terminology-fragmented), "vocabulary map before treating broad modern results as complete", "search the claim-specific endpoints, not only the user's broad label", "record the vocabulary map and citation trails searched". POINTER for the vocabulary-map contents and method: SourceVerificationAndCitationAudit/HistoricalVocabularyAndCitationBackchain (names, spelling variants, abbreviations, endpoints, route and formulation terms, investigators, institutions, journals, conferences, references in reviews or books; backward and forward chaining; no absence claim before searching), ExtendedHumanEvidenceAndGreyLiteratureSweep/HistoricalEndpointAndInvestigatorSweep (historical diagnostic terms, formulations, routes; recording terminology variants), HistoricalSourceStratificationAndTextualDependency (textual layers, dependent copies, standardizations, original wording, translation), HistoricalMaterialAndPreparationIdentity. The "brain damage" example was removed; the rule it illustrated is stated in words. |
| Rule@HistoricalInterventionAttributionTrigger | KEPT + POINTER | Trigger condition kept (PublicHealthInterventionAudit has no Activation of its own). Requirements (separate time series, case-definition and surveillance audit, timing and lag, concurrent changes, counterfactual): PublicHealthInterventionAudit/HistoricalInterventionAttribution, PretrendTimingAndCounterfactual, NoMonocausalHistoricalStory. |
| Rule@ExpertBookDiscoveryTrigger (must keep) | KEPT | Verbatim conditions and nonactivation clause. |
| Rule@DoseRegimeIntegrityDefaultTrigger (must keep) | KEPT | Verbatim conditions, including the exposure-regime transport clause. |
| Rule@ForumSignalDefaultTrigger (must keep; needs_owner_approval=true) | KEPT | Every condition and every trigger phrase kept; wording only ("not only when the user explicitly requests forums" written as "not only on request"). |
| Rule@BidirectionalEvidenceIterationDefaultTrigger (must keep) | KEPT | Verbatim. |
| Rule@CheckForumsForCommandTrigger | KEPT + POINTER | Kept: meaning of "check forums for…", scope-question cap of two and its seven axes, "state assumptions and proceed", no clarification to avoid the task, use a deep-research tool or an equivalent documented workflow, full workflow to final synthesis, resume a plan-only tool result. POINTER: when the user must select Deep Research in the interface (explain, give a copyable prompt, never claim the mode was used) is ModeAvailabilityAndUserControl and NoFalseDeepResearchClaim. |
| Rule@HumanReachableExposureEfficacyTrigger (needs_owner_approval=true) | KEPT | All ten triggered items and the three closing sentences kept; wording only. The inventory's proposal to drop the items owned by other triggers was not applied (owner approval). |
| Rule@ForumSignalNonTrigger | KEPT + SERVER_GATE | Nonactivation cases, affirmative-decision rule, record-the-reason, inaccessible-not-not-applicable all kept. Added once: finalize_research requires the community decision (researched, or not relevant with a reason) and checks the survey and per-video audit receipts. |
| Rule@EscalationOverridesBrevity (needs_owner_approval=true) | KEPT | Verbatim; moved to first position. |
| Rule@UsefulAnswerBeforeFullTextWorkflow | KEPT + SERVER_GATE + POINTER | Kept: a full-text workflow never replaces a useful answer; distinguish completed from provisional. SERVER_GATE: acquire_open_full_text tries lawful repositories and open-access resolvers and returns `possibly_useful_lead`; finalize_research returns not_ready for a DOI lead without an acquisition attempt. POINTER: lead preservation, claim-local uncertainty, no global Partial label (ClaimLocalStatusUntilMaterialGapResolved); continue other work and optional lawful handoff (DecisionCriticalFullTextCannotBeSilentlyDeferred, UserDeclineOrUnavailableExtractor). |
| Modes/Mode@research_preflight (must keep) | KEPT (id, trigger) + POINTER | Content (decision, spec and prompt, method and mode, steering, approval status, one-pass feasibility, passes and budgets, access and language inventory, proceeding basis) is the gate's Sequence RO1–RO7 and PreflightOutputMinimum. Kept: do not present the preflight as completed research. |
| Modes/Mode@simple (must keep) | KEPT | Verbatim. |
| Modes/Mode@coaching (must keep) | KEPT | Trigger unchanged; items kept (they match CoachingOutputMinimum). The no-aggressive-protocol clause stays here: FunctionalHealthCoachingLayer covers it only indirectly (NonActivation, NoCureClaim). |
| Modes/Mode@structured (must keep) | KEPT | Trigger unchanged; output list, named audits "whenever triggered", dose-regime clause, loop, and claim-level synthesis kept. |
| Modes/Mode@deep (must keep) | KEPT + POINTER | Trigger unchanged; all fifteen audits, conditional loop iteration, and pharmacological items kept. Deep Research disclaimer shortened to a pointer to the ResearchOrchestrationAndModeSelectionGate (InternalDeepModeTerminology today). |

## NEEDS_OWNER_APPROVAL

None applied. Proposed only: the inventory's compression of HumanReachableExposureEfficacyTrigger (drop the sweep, forum, and interaction items that other triggers already require). Not applied because the row needs owner approval.

## Why the size is above the 5,000–7,000 target

The protected content alone is about 10,000 characters: the seven must-keep triggers with exact conditions (about 5,300), the three owner-approval rules (HumanReachableExposureEfficacyTrigger, EscalationOverridesBrevity, ForumSignalDefaultTrigger, counted once), and the five mode definitions whose trigger attributes are definitions (about 3,000). Reaching 7,000 would require dropping trigger conditions or owner-gated text.

## Size

| | Characters | Bytes |
|---|---:|---:|
| Old | 19,097 | 19,143 |
| New | 15,397 | 15,431 |
| Change | −19% | |
