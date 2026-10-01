# UniversalFullTextAcquisitionProtocol: coverage

Replacement: `UniversalFullTextAcquisitionProtocol.xml`. Splice it over the exact range from
`<UniversalFullTextAcquisitionProtocol` through `</UniversalFullTextAcquisitionProtocol>`.

Dispositions: KEPT, MERGED, POINTER, SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
"(owner row)" marks inventory rows with needs_owner_approval=true; their substance is kept exactly.

**Method impact: wording only, plus one server note.** The workflow steps and the four extractor-era roles were folded
into the rules they repeat; the connector's acquire, continue, validate, and finalize chain is stated once. Every
trigger, definition, access state, batch size, extraction field, and boundary is kept. No sentence below needs owner
approval.

## Names other sections, sibling drafts, or tests use (all kept)

| Name | Referenced by | Now |
|---|---|---|
| UniversalFullTextAcquisitionProtocol | ProtocolExecution/IncompleteModuleContinuationHandoff ("a prioritized, identifier-verified batch per UniversalFullTextAcquisitionProtocol"); ExtendedHumanEvidence (current and batch-2 draft); FinalSelfCheck DomainAudits | Section name; batch size and EscalationRequestMinimum kept for the handoff |
| ClaimLocalStatusUntilMaterialGapResolved | AnswerShapeController/UsefulAnswerBeforeFullTextWorkflow; tests/protocol.test.ts | Rule, same name |

Test pins (tests/protocol.test.ts, "requires the HRP 20.5.22 study-method and claim-local full-text gate"):
`name="ClaimLocalStatusUntilMaterialGapResolved"`, "possibly useful research lead", and "Do not mark the whole answer
partial solely because one lawful full text cannot be obtained" are all present verbatim. Checked by splicing all four
drafts into a copy of HRP_Full.xml and running tests/protocol.test.ts and tests/protocol-sections.test.ts: everything
passes except the pinned HRP SHA-256, which any edit changes.

## Elements

| # | Original element | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose | KEPT | Compressed to a 226-character index summary. Its list of unknowns is shortened; the full list lives in DecisionCriticalSourceDefinition. |
| 2 | Activation/MandatoryTrigger | KEPT | Activation, every trigger. |
| 3 | Activation/DoNotTrigger | KEPT | Activation, every exclusion. |
| 4 | DecisionCriticalSourceDefinition | KEPT | Verbatim substance (all eleven inspected items, all five consequences). |
| 5 | FullTextAccessStatusClassification | KEPT | All seven states; "do not merge". |
| 6 | MandatoryProviderNeutralFullTextEscalation | KEPT + SERVER_GATE | Both paragraphs' substance. Server note added once: acquire_open_full_text, continue_open_full_text until exhausted, then validate_study_method_audit or validate_review_method_audit (which refuse unless the text was read to exhaustion), and finalize_research requiring a validated audit receipt for each key study or an acquisition receipt proving a lead. The prose stays because non-connector surfaces have no server. |
| 7 | NoSilentAbstractSubstitution | KEPT | Verbatim substance. |
| 8 | ClaimLocalStatusUntilMaterialGapResolved | KEPT | Both paragraphs verbatim (test-pinned). |
| 9 | UserDeclineOrUnavailableExtractor | MERGED | ClaimLocalStatusUntilMaterialGapResolved, last sentence, verbatim substance. |
| 10 | DivisionOfLabor/citation_mapper | MERGED | DecisionCriticalSourceDefinition ("prioritized citation map of direct human, close proxy, mechanistic, review, and safety sources"). |
| 11 | DivisionOfLabor/external_extractor | MERGED | AccessBoundary ("user-approved ... extracts explicitly reported full-text details only; ... does not adjudicate conclusions"). |
| 12 | DivisionOfLabor/auditor | MERGED | BatchAuditLedgerAndStopping (identifiers, internal consistency, endpoints, denominators, adjustments, missing fields, overclaims after each batch). |
| 13 | DivisionOfLabor/synthesizer | MERGED | BatchAuditLedgerAndStopping ("write the answer only from verified extraction and clearly labeled supplementary evidence"). |
| 14 | Workflow FT0 MaterialityTriage | MERGED | DecisionCriticalSourceDefinition, verbatim. |
| 15 | FT1 CitationMap | MERGED | DecisionCriticalSourceDefinition, verbatim. |
| 16 | FT2 LawfulAcquisitionAndLeadBoundary | MERGED + SERVER_GATE | MandatoryProviderNeutralFullTextEscalation (automatic lawful attempts; record identifiers, unresolved fields, claim impact; handoff "only when materially useful"). acquire_open_full_text performs these attempts on connector runs. |
| 17 | FT3 BatchExtraction | MERGED | MandatoryProviderNeutralFullTextEscalation ("about three to ten studies, fewer for dense trials, old scans, or complex safety reports", for handoffs and extraction). Kept although the inventory marked it a cut candidate, because the batch-1 ProtocolExecution handoff points here for the batch size. |
| 18 | FT4 PerBatchAudit | MERGED | BatchAuditLedgerAndStopping, every item. |
| 19 | FT5 RunningLedger | MERGED | BatchAuditLedgerAndStopping, every item. |
| 20 | FT6 StoppingRule | MERGED | BatchAuditLedgerAndStopping, all four conditions. |
| 21 | FT7 FinalAudit | MERGED | BatchAuditLedgerAndStopping. |
| 22 | EscalationRequestMinimum items 1 to 7 | KEPT | One sentence, every item. |
| 23 | ExtractionMinimum items 1 to 2 and 5 to 18 (owner row) | KEPT | One sentence, every field. |
| 24 | ExtractionMinimum items 3 to 4 (historical) | KEPT | Same sentence, every field (not dropped to the SourceVerification historical rules, which lack date and author or compiler). |
| 25 | AccessBoundary | KEPT | Verbatim substance, plus row 11. |

## Judgment calls (meaning believed unchanged)

| Where | Original | Now |
|---|---|---|
| Rows 12, 13 | DivisionOfLabor roles had no priority attribute | Their text now sits in a Critical rule (the section and the original Workflow were Critical). |

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| Proposal | Saves | What would change |
|---|---|---|
| ExtractionMinimum (owner row): on connector runs the study validator's 13 domains already demand block-cited findings for identity, registration, population, intervention, comparator, allocation, denominators, outcomes, results, harms, funding, data, and ancestry; keep only fields the domains lack (access status and provenance, observed versus modeled, component-to-program level, baseline evidence debt, adjustment set, historical fields) | about 900 | Non-connector surfaces would lose the explicit field list. |
| Unify ExtractionMinimum with ExtendedHumanEvidence.../ExtendedSourceAppraisalMinimum (about 60 percent overlap) | about 1,000 | Needs one agreed field list across two sections. |
| Drop the ledger, stopping, and final-audit sentences to ResearchOrchestrationAndModeSelectionGate/AdaptiveStoppingRule and ProtocolExecutionAndComplianceGate/MandatoryTriggeredModuleCompletion | about 550 | Those homes phrase the provisional-answer exit differently (a synthesis the user requests, not one the user accepts) and do not state the rerun of the quantitative audit across the combined evidence. |

## Size

| | Characters | UTF-8 bytes |
|---|---:|---:|
| Original element | 10,869 | 10,873 |
| Replacement element | 9,419 | 9,419 |
| Change | −13% | |
