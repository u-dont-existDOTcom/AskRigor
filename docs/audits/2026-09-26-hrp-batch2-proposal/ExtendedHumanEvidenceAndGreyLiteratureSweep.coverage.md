# ExtendedHumanEvidenceAndGreyLiteratureSweep: coverage

Replacement: `ExtendedHumanEvidenceAndGreyLiteratureSweep.xml`. Splice over the exact range from
`<ExtendedHumanEvidenceAndGreyLiteratureSweep priority="Critical">` through `</ExtendedHumanEvidenceAndGreyLiteratureSweep>`
(HRP 20.6.0 lines 2909 to 3045).

Dispositions: KEPT, MERGED, POINTER (home named), SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL,
OWNER_DEFAULT (owner-accepted output shape: research-process status in the LimitsNote). "(owner row)" marks inventory
rows with needs_owner_approval=true; their substance is kept exactly.

Batch 1 made this section the home for the no-absence-claim rule (Architecture SSOT pointer, OutputFormatting table F)
and for the extended-sweep output items, so those stay here in full.

## Method impact

Wording only.

## Element map

| # | Original element / clause | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose: identify systematic, clinically documented, unpublished, non-indexed, regional, recently completed, and otherwise hard-to-find human outcome evidence before concluding a treatment signal is absent, anecdotal only, or purely preclinical | KEPT | Purpose (238 characters, fits the index summary). |
| 2 | Purpose: "Prevent indexed-database searches from being mistaken for the complete human evidence base" | REMOVED_REDUNDANT | Restates BeyondConventionalIndexes and NoHumanEvidenceAbsenceClaimBeforeSweep. |
| 3 | Rule priorities (all Critical except SearchDisclosureAndStopping, High) | KEPT | "Unmarked rules: Critical." in the Purpose; `priority="High"` kept on SearchDisclosureAndStopping. |
| 4 | Activation/MandatoryTrigger: every structured or deep health, treatment, safety, repurposed-drug, oncology, comparative-treatment, contested-intervention, neglected-intervention, or evidence-sparse task | POINTER | AnswerShapeController/ExtendedHumanEvidenceDefaultTrigger (identical list, plus "mandatory even when indexed publications appear negative ... or limited to preclinical evidence"). |
| 5 | Activation/NonActivation: simple definitions, low-stakes quick explanations, emergency triage before stabilization, clearly non-health tasks | POINTER | Same trigger rule (identical list). |
| 6 | NonActivation: user-supplied corpus "already demonstrated" to include a complete and current sweep | KEPT | Activation. Kept because the router's wording ("a user-supplied complete and current ... corpus") drops "demonstrated". |
| 7 | NonActivation: record the reason in the applicable-module ledger | KEPT | Activation. |
| 8 | BeyondConventionalIndexes: all 13 source classes | KEPT | Same rule, every class and sub-item; books keep their purpose and gain a pointer to ExpertBookAndMonographDiscoveryGate (their search method). |
| 9 | IndependentOfForumSignal: sweep regardless of signal (7 states); forum may add names, outcomes, subgroups, formulations, search terms; not the activation gate | KEPT | Same rule. |
| 10 | StrongCommunitySignalIntensifiesButDoesNotReplace: strong signal requires deeper searches (8 targets); does not substitute; mandatory without the signal | MERGED | Into IndependentOfForumSignal, all targets kept ("mandatory without the signal" is the rule's first sentence). |
| 11 | CommunityDerivedFormalSearchExpansion: incorporate community-derived leads; reopen extended classes on a new decision-relevant hypothesis; record which leads changed the formal map | MERGED + POINTER | Into BidirectionalEvidenceDiscoveryAndTriangulationLoop/CommunityToFormalHypothesisTransfer (whose transfer list is a superset); IndependentOfForumSignal points there. |
| 12 | ActualHumanOutcomeDataFirst | KEPT | Same rule. |
| 13 | ExtendedSourceAppraisalMinimum (owner row): 12 extraction groups | KEPT | Same rule, every field ("study identity" is "identity"; "all events versus related events" is "all versus related events"). |
| 14 | PublicationStatusDoesNotUpgradeOrErase | KEPT | Same rule, all seven weighting factors. The "do not erase" half is also in SourceVerificationAndCitationAudit (sibling draft: PrimarySourceVerification) and ProtocolExecutionAndComplianceGate/MandatoryTriggeredModuleCompletion. |
| 15 | DuplicateAndDataLineageAudit | KEPT | Same rule. |
| 16 | HistoricalEndpointAndInvestigatorSweep: trigger (old, neglected, regionally published, renamed, fragmented); broad and endpoint-specific terms; historical diagnostic terms; record failed and successful terminology variants | KEPT | Same rule (name referenced by AnswerShapeController/HistoricalTerminologyAndEndpointExpansionTrigger). |
| 17 | ... exact endpoints, formulations, routes, named investigators, institutions, journals, conferences, citations from books and reviews | POINTER | SourceVerificationAndCitationAudit/HistoricalVocabularyAndCitationBackchain (same search list), named in the rule. |
| 18 | ... stratify original witnesses, quotations, compilations, reconstructions, translations, standardizations; deduplicate textual lineages | POINTER | SourceVerificationAndCitationAudit/HistoricalSourceStratificationAndTextualDependency, named. |
| 19 | ... record material, preparation, and co-ingredient differences | POINTER | SourceVerificationAndCitationAudit/HistoricalMaterialAndPreparationIdentity, named. |
| 20 | ... record dose-unit differences | POINTER | QuantitativeRiskAndResearchAudit/HistoricalDoseAndRecipeTranslation, named. |
| 21 | DecisionCriticalFullTextEscalationWithinSweep: citation or abstract is not inspected evidence; trigger UniversalFullTextAcquisitionProtocol | KEPT | Same rule. |
| 22 | ... automatically try lawful repositories and DOI open-access resolution; if access fails keep a possibly useful lead | SERVER_GATE + POINTER | acquire_open_full_text makes the attempts and returns `possibly_useful_lead`; finalize_research flags a DOI lead without an acquisition attempt. Prose home: UniversalFullTextAcquisitionProtocol/MandatoryProviderNeutralFullTextEscalation. |
| 23 | ... claim-local uncertainty; continue unrelated executable work | KEPT | Same rule. |
| 24 | NoHumanEvidenceAbsenceClaimBeforeSweep | KEPT | Same rule, all five preconditions and the narrowing clause. |
| 25 | SearchDisclosureAndStopping (High) | KEPT | Same rule. |
| 26 | ExtendedEvidenceOutput: source classes searched, evidence found, verified or preliminary, map change; the seven-way separation | KEPT | Same rule. |
| 27 | ExtendedEvidenceOutput: which material sources remained inaccessible | OWNER_DEFAULT | Reported in the LimitsNote. |

## Tests and cross-references

- No test pins this section or its rule names.
- Protocol text names the section in AnswerShapeController (Modes, ExtendedHumanEvidenceDefaultTrigger,
  HumanReachableExposureEfficacyTrigger), OncologyModule, and FinalSelfCheck DomainAudits; names
  `HistoricalEndpointAndInvestigatorSweep` in AnswerShapeController/HistoricalTerminologyAndEndpointExpansionTrigger (kept).
- Renamed or removed names: StrongCommunitySignalIntensifiesButDoesNotReplace and CommunityDerivedFormalSearchExpansion
  (rows 10, 11). Neither is referenced by a test or by protocol text; the stress inventory and batch-1 audit docs cite
  only the kept names.
- VersionDiscipline/RegressionProtection capabilities kept: mandatory extended human-evidence and grey-literature
  searching (rows 4, 8, 9), historical terminology and exact-endpoint expansion (rows 16, 17), historical source-stratum
  and preparation-identity controls and dose-unit translation (rows 18 to 20, homes named), decision-critical full-text
  verification (rows 21 to 23).
- Stress cases covered (per inventory): GreyLiteratureSweepNotConditionalOnForumSignal, BroadModernSearchMissesHistoricalHumanEvidence,
  DuplicateTextualLineageInflation.

## Dependencies on sibling drafts (batch 2)

Rows 17 to 20 and 22 assume these rules survive in the sibling drafts (checked at the time of writing):
SourceVerificationAndCitationAudit HistoricalVocabularyAndCitationBackchain, HistoricalSourceStratificationAndTextualDependency,
HistoricalMaterialAndPreparationIdentity; QuantitativeRiskAndResearchAudit HistoricalDoseAndRecipeTranslation;
UniversalFullTextAcquisitionProtocol MandatoryProviderNeutralFullTextEscalation.

## Sizes

Old 9,651 characters (9,651 bytes); new 8,092 characters. 84%.

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| ID | Proposed change | Saves | What changes |
|---|---|---|---|
| EX-1 | ExtendedSourceAppraisalMinimum keeps only the items missing from UniversalFullTextAcquisitionProtocol/ExtractionMinimum and StudyMethodReliabilityGate/DecisionImportantStudyAudit (source status and publication history; baseline trajectory; achieved exposure; independent outcome verification; lost and missing denominators; nonresponse and survivorship; natural-history comparator; clinic role, peer-review status, duplicate reporting; research-priority impact) and points to those two for the rest. | about 450 | The list is split across three sections, and those two apply to full-text studies, not every grey item (owner row). |
| EX-2 | SearchDisclosureAndStopping keeps only the stopping criteria; the "Record ..." list goes, since OutputFormatting/ModuleOutputs and the LimitsNote already require the searched terms, investigators, trails, and inaccessible sources. | about 200 | Date limits and last search date are no longer recorded. |
| EX-3 | Group the BeyondConventionalIndexes list (for example "conference and society materials", "grey repositories: theses, dissertations, institutional, government, regional"). | about 250 | Sub-items become implicit. |
