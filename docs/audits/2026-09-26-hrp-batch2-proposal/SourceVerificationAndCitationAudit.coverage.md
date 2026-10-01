# SourceVerificationAndCitationAudit: coverage

Replacement: `SourceVerificationAndCitationAudit.xml`. Splice it over the exact range from
`<SourceVerificationAndCitationAudit` through `</SourceVerificationAndCitationAudit>`.

Dispositions: KEPT, MERGED, POINTER, SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
"(owner row)" marks inventory rows with needs_owner_approval=true; their substance is kept exactly.

**Method impact: wording only.** One rule is dropped as a restatement (NoInventedIdentifiers, see row 4); everything
else is kept, merged into a neighbouring rule of the same priority, or given the new index Purpose. No sentence below
needs owner approval.

## Names other sections, sibling drafts, or tests use (all kept)

| Name | Referenced by | Now |
|---|---|---|
| SourceVerificationAndCitationAudit | FinalSelfCheck DomainAudits and FS18 | Section name |
| WholeReportAudit | FinalSelfCheck FS18 ("SourceVerificationAndCitationAudit/WholeReportAudit"); ResearchAuditTemplates Purpose | Rule, same name |
| HistoricalVocabularyAndCitationBackchain | AnswerShapeController/HistoricalTerminologyAndEndpointExpansionTrigger; batch-2 ExtendedHumanEvidence draft (now its home for search vocabulary) | Rule, same name, full vocabulary list |
| HistoricalSourceStratificationAndTextualDependency | same two | Rule, same name |
| HistoricalMaterialAndPreparationIdentity | same two | Rule, same name |

Tests: no test names any rule of this section; no test string literal occurs in it.

## Elements

| # | Original element | Disposition | New location / note |
|---|---|---|---|
| 1 | (no Purpose) | ADDED (descriptive) | A 206-character Purpose so the section index shows what the section does; the old index summary was the first 240 characters of tier 1. States no requirement. |
| 2 | SourceHierarchy Tier 1 to 4 (owner row) | KEPT | Every source type, "primary only for the claims they directly document", the confidence clause, the tier-2 audit list, tier-3 and tier-4 uses. |
| 3 | PrimarySourceVerification | KEPT | Same name; preferred-document list and identifier list unchanged. |
| 4 | NoInventedIdentifiers | REMOVED_REDUNDANT | FinalSelfCheck FS168 ("Fabricate or silently repair nothing ...") and PremiseIntegrityAndTruthPriorityGate/NoFabricatedRepairsOrForcedConnections forbid fabricating anything, which covers every listed item (identifiers, quotations, numbers, table values, guideline titles, regulatory status, URLs, forum posts, poster counts, search terms, signal classifications). |
| 5 | IndexingAndPeerReviewAffectWeightNotExistence | MERGED | PrimarySourceVerification, verbatim substance (all six source kinds, tier placement, verification, the three confidence reducers). |
| 6 | CitationEntailment | KEPT | Both prohibited citation patterns kept. |
| 7 | CitationChainAudit (owner row) | KEPT | Verbatim substance. |
| 8 | CitationAndComparatorAncestryAreDistinct | MERGED | CitationChainAudit, all three sentences, with a pointer to ComparatorLineageAndProgramCongruenceAudit/EvidenceAncestryTrace. |
| 9 | SummaryIsMapNotAuthority | MERGED | CitationChainAudit, both sentences. |
| 10 | WholeReportAudit | KEPT | Same name, every audit item. |
| 11 | HistoricalVocabularyAndCitationBackchain | KEPT | Same name; every search term, backward and forward chaining, and the absence rule are verbatim substance. |
| 12 | HistoricalSourceStratificationAndTextualDependency (owner row) | KEPT | Verbatim substance. |
| 13 | HistoricalDiagnosisTranslationBoundary (owner row) | MERGED | HistoricalSourceStratificationAndTextualDependency, last sentence, verbatim substance. |
| 14 | HistoricalMaterialAndPreparationIdentity (owner row) | KEPT | Full processing list (the inventory's suggested shortening was not applied), both transport and attribution clauses. |
| 15 | BooksAreCitationMapsNotAutomaticAuthorities | KEPT | Every item. Not dropped to ExpertBookAndMonographDiscoveryGate: that gate runs only for neglected or fragmented topics and its bias list differs (no institutional or ideological commitments; adds symmetric treatment). |
| 16 | FullTextMethodsRule | MERGED | AbstractPreambleAndEscalation, first sentence, verbatim list. |
| 17 | DecisionRelevantControlDocuments (owner row) | KEPT | Every control document. |
| 18 | AdverseEventMethodsVerification | MERGED | DecisionRelevantControlDocuments, last sentence, verbatim. |
| 19 | AbstractPreambleAndEscalation | KEPT + POINTER | Disclosure and confidence clause verbatim; the decision-critical path names UniversalFullTextAcquisitionProtocol and its three steps (automatic lawful discovery, possibly useful lead, limitation bound to affected claims). |
| 20 | DocumentScope (High) | MERGED | DocumentScopeAndCurrentStatus (High). Kept although Universal `sources` says nearly the same, because Universal says "pattern-level evidence", not "multiple appropriate sources". |
| 21 | CurrentStatusVerification (High) | MERGED | DocumentScopeAndCurrentStatus (High). |
| 22 | PublicFacingSummaryBoundary (owner row) | KEPT | Verbatim substance. |
| 23 | InternalValidityAndApplicabilityAreIndependent | MERGED | PrimarySourceVerification, all three sentences. Not pointed to DoseRegimeIntegrity.../TwoAxisEvidenceHierarchy, which covers only decision-relevant sources and runs only when that module triggers. |

## Judgment calls (meaning believed unchanged)

| Where | Original | Now |
|---|---|---|
| Row 4 | "Never fabricate an identifier, quotation, numerical result, table value, guideline title, regulatory status, URL, forum post, poster count, search term, or signal classification." | Removed; FS168 "Fabricate or silently repair nothing" is unconditional (the PremiseIntegrity rule adds "merely to make the requested analysis work"). If the owner wants the list visible here, restoring it costs 190 characters. |
| Row 19 | "trigger automatic lawful full-text discovery, then preserve any unresolved source as a possibly useful lead and bind the limitation to the claims its unseen methods or results could change" | "apply the UniversalFullTextAcquisitionProtocol (automatic lawful full-text discovery, then a possibly useful lead with the limitation bound to the claims its unseen methods or results could change)" |

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| Proposal | Saves | What would change |
|---|---|---|
| Move the three historical rules (with QuantitativeRiskAndResearchAudit/HistoricalDoseAndRecipeTranslation and the historical ExtractionMinimum fields) into one section loaded only when historical or multilingual evidence is in scope, as the inventory notes for these owner rows | about 3,700 from ordinary runs across the three sections | New top-level section (the section-count test pins 60); AnswerShapeController/HistoricalTerminologyAndEndpointExpansionTrigger and the sibling ExtendedHumanEvidence draft would point to it. No text lost. |
| SourceHierarchy: cite Universal `sources` (a core section, always loaded) and list only HRP's additions (owner row) | about 450 | Tier wording would come from Universal ("strong secondary sources", "lead-level sources"). |
| PublicFacingSummaryBoundary: first sentence is near-verbatim in Universal `sources`; keep only the tracing and reporting clause (owner row) | about 270 | Universal says "not weight-bearing authorities ... unless they present primary evidence or an auditable review method". |
| Drop IndexingAndPeerReview... to ExtendedHumanEvidence.../PublicationStatusDoesNotUpgradeOrErase and EvidenceLayers/RelevanceControlsInclusionWeightControlsConclusion | about 300 | Those homes do not name observational, community-generated, or abstract-only sources, and the sweep runs only in structured or deep research. |
| Drop BooksAreCitationMaps... to ExpertBookAndMonographDiscoveryGate | about 300 | See row 15. |
| Drop SummaryIsMapNotAuthority and FullTextMethodsRule text to Universal `sources` and UFTAP/NoSilentAbstractSubstitution | about 400 | Universal lacks external-extractor outputs and "limitations"; NoSilentAbstractSubstitution says "infer unreported", not "describe uninspected". |

## Size

| | Characters | UTF-8 bytes |
|---|---:|---:|
| Original element | 10,857 | 10,859 |
| Replacement element | 10,172 | 10,172 |
| Change | −6% | |

This section compresses least: five of its rules are owner rows, three more are names other sections and the sibling
ExtendedHumanEvidence draft now point to as the canonical home, and the new Purpose adds 230 characters for the index.
