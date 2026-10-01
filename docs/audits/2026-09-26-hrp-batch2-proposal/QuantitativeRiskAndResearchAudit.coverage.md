# QuantitativeRiskAndResearchAudit: coverage

Replacement: `QuantitativeRiskAndResearchAudit.xml`. Splice it over the exact range from `<QuantitativeRiskAndResearchAudit`
through `</QuantitativeRiskAndResearchAudit>` (first line has no leading space, the closing line has one, as in the
original range).

Dispositions: KEPT, MERGED, POINTER, SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL.
"(owner row)" marks inventory rows with needs_owner_approval=true; none of this section's rows are owner rows.

**Method impact: wording only.** The 45 rules were folded into the 14 audit steps they belonged to (the inventory's
recommendation: "compress the 45 rules into clauses under these steps"), so the sequence no longer restates the rules.
Every list item, threshold, condition, and prohibition is kept. The eight High-priority rules keep High priority in one
`SupportingChecks` rule; `AuditSequence` carries `priority="Critical"` because it now holds the Critical rules' text
(its steps were already inside the Critical section). No sentence below needs owner approval.

## Names other sections, sibling drafts, or tests use (all kept)

| Name | Referenced by | Now |
|---|---|---|
| QuantitativeRiskAndResearchAudit | FinalSelfCheck DomainAudits; UFTAP BatchAuditLedgerAndStopping | Section name |
| RiskLanguageOutput | OutputFormatting ReaderFacingAnswer, ModuleOutputs | Rule, same name |
| ReconstructableArithmeticDisclosure | OutputFormatting ModuleOutputs | Rule, same name |
| NullAssociationLanguageCalibration | OutputFormatting ModuleOutputs | Rule, same name |
| RiskWindowMultiplicityAndAggregation | OutputFormatting ModuleOutputs | Rule, same name |
| RiskContextualization | OutputFormatting ModuleOutputs (and batch-1 ProtocolExecution coverage) | Rule, same name |
| HistoricalDoseAndRecipeTranslation | batch-2 ExtendedHumanEvidence draft (HistoricalEndpointAndInvestigatorSweep) | Rule, same name |
| DescriptiveTemporalClusteringVersusExcessRisk | batch-1 OutputFormatting coverage, table C | Explicit mention in QA6 |

Tests: no test names any rule of this section (`grep` over `tests/`); no test string literal occurs in it.

## Rules

| # | Original element | Disposition | New location / note |
|---|---|---|---|
| 1 | Activation | KEPT | Verbatim (still the index summary, 220 characters). |
| 2 | RawCountsFirst | MERGED | QA3 RawCountsAndDenominators, verbatim substance. |
| 3 | ComparatorIdentityBeforeEffect | MERGED + POINTER | QA2 (step named ComparatorIdentityBeforeEffect): exact class and composition, background care, co-interventions, causal contrast; "never calculate an absolute non-exposure effect from an active-comparator contrast without an independently valid bridge" kept. Pointer to ComparatorLineageAndProgramCongruenceAudit added for QA2's ancestry and debt items. |
| 4 | DenominatorProvenance | MERGED | QA3, every item (source, inclusions, exclusions, whether observed, counted unit). |
| 5 | PopulationAlignment | MERGED | QA4. Items QA4 already listed stay unconditional; the rest (endemicity, age, sex, baseline disease severity, calendar period, access to care, inclusion criteria) keep "before combining estimates". |
| 6 | HotspotRegionalGlobalFirewall | MERGED | QA4 ("name each reference level, never treating a hotspot maximum and a province-wide, country-wide, or global average as one population"). |
| 7 | TreatmentHistoryFirewall | MERGED | QA4, verbatim substance including survivor selection. |
| 8 | ComponentProgramScopeFirewall | MERGED | QA10, verbatim substance. |
| 9 | EndpointFirewall | MERGED | QA6, full endpoint list and the broad-composite prohibition. |
| 10 | OutcomeLayerFirewall | MERGED + POINTER | QA6 keeps "never reuse a disease endpoint as a transmission endpoint without a validated bridge"; the layer list points to ComparatorLineageAndProgramCongruenceAudit/OutcomeLayerDecomposition, a near-verbatim superset (it adds colonization and laboratory-confirmed infection), to which this rule's "indirect effects" was added. |
| 11 | IncidenceFatalityFirewall | MERGED | QA6, both sentences. |
| 12 | ObservedModeledFirewall | MERGED | QA6, both sentences. |
| 13 | SurveillanceAlignment | MERGED | QA5 "Surveillance", verbatim substance. |
| 14 | AdverseEventCaptureAlignment | MERGED | QA5 "Adverse events": the separations stay unconditional; alignment stays "before comparing rates". |
| 15 | RelatednessFilterFirewall | MERGED | QA5 "Adverse events", both sentences (including mechanism assumptions). |
| 16 | ArithmeticCoherence | MERGED | QA7 (step named ArithmeticCoherence), verbatim substance. |
| 17 | MixtureModelCheck (High) | KEPT | SupportingChecks (High), first sentence; QA7 points to it. |
| 18 | ConditionalVersusMarginalRisk | MERGED | QA8, both sentences. |
| 19 | EffectMeasureDiscipline | MERGED + POINTER | QA8: the eight measures, the odds-ratio and hazard-ratio misreadings, conversion with assumptions or a statement that data do not permit it. "At first use, expand the measure name and translate what it compares" points to AudienceAccessibleTerminologyGate (EffectMeasureTranslationMinimum, FirstUseDefinitionBeforeDependency, AcronymExpansionAndCollisionControl), which require the same for every user-visible HRP response. |
| 20 | DoseRegimeCompatibilityFirewall | MERGED | QA4, full exposure list and "separate or explicitly labeled indirect". |
| 21 | ThresholdEvidenceSymmetry | KEPT | Same name. Not pointed to DoseRegimeIntegrity...: those threshold rules are scoped to pharmacology, this one to any dose threshold. |
| 22 | TimeAtRisk (High) | KEPT | SupportingChecks (High), with its seven-day example (the example carries the rule). |
| 23 | DescriptiveTemporalClusteringVersusExcessRisk | MERGED | QA6, every clause; name kept as an explicit mention. |
| 24 | TemporalNullModelSpecification | MERGED | QA5 "Null model", verbatim list and the uniform-distribution prohibition. |
| 25 | NullExplanationIsHypothesisNotFinding | MERGED | QA9, every word in both lists. |
| 26 | PassiveReportingLagAudit | MERGED | QA5 "Surveillance", every clause. |
| 27 | RiskWindowMultiplicityAndAggregation | KEPT | Same name (must keep). QA8 points to it. |
| 28 | NullAssociationLanguageCalibration | KEPT | Same name (must keep). QA8 points to it. |
| 29 | ReconstructableArithmeticDisclosure | KEPT | Same name (must keep). QA7 points to it. |
| 30 | TemporalAssociationTerminology (High) | KEPT | SupportingChecks (High), full estimand list. |
| 31 | HistoricalDoseAndRecipeTranslation | KEPT | Same name (must keep). The inventory suggested relocating it beside the historical rules; not done, because the sibling ExtendedHumanEvidence draft points to it here. |
| 32 | LatencyWindowFit | MERGED | QA5 "Latency", including recurrence. |
| 33 | UncertaintyIntervals (High) | KEPT + MERGED | "Report confidence, credible, or prediction intervals when available" kept in SupportingChecks (High); "sparse events can produce unstable estimates even when point estimates are large" merged into QA8's sparse-event sentence. |
| 34 | SparseEventRule | MERGED | QA8, both sentences. |
| 35 | MissingnessAndFollowUp (High) | KEPT | SupportingChecks (High), both sentences. |
| 36 | EcologicalFallacyAndTransportability | MERGED | QA9, both sentences (pointer to StudyDesignCapabilityMatrix added; its ecological row says the same). |
| 37 | SimpsonsParadoxCheck (High) | KEPT | SupportingChecks (High). |
| 38 | ThresholdPurposeAudit | MERGED | QA9, all eight purposes. |
| 39 | MarkerVersusCause | MERGED | QA9, both sentences. |
| 40 | DominantConfounderQuantification | MERGED | QA9, all three sentences. |
| 41 | CaseOnlyDesignLimit | MERGED | QA9, both sentences (pointer to StudyDesignCapabilityMatrix/case_only added). |
| 42 | SelectionAndColliderBias (High) | KEPT | SupportingChecks (High). |
| 43 | MultipleTestingAndSubgroups (High) | KEPT | SupportingChecks (High); not dropped to StatisticalAndClinicalInterpretation/Multiplicity, which lacks sparse cells and subgroup interaction tests. |
| 44 | BaseRateAndSeverity (High) | KEPT | SupportingChecks (High). |
| 45 | RiskContextualization | KEPT | Same name (must keep); QA12 points to it. |
| 46 | RiskLanguageOutput | KEPT | Same name (must keep). |
| 47 | AuditSequence QA1 to QA14 | KEPT | Same ids, now the section's spine; each step holds its rules. QA5's list is split into the labeled paragraphs; QA12's restatement of RiskContextualization became a pointer to it; QA13 and QA14 verbatim. |

## Judgment calls (meaning believed unchanged; listed so the owner can check)

| Where | Original | Now |
|---|---|---|
| QA4 | Hotspot rule: "Do not combine a hotspot maximum with a province-wide, country-wide, or global average as if they describe the same reference population. Name each level explicitly." | Under "Before combining estimates": "name each reference level, never treating a hotspot maximum and a province-wide, country-wide, or global average as one population". |
| QA8 | EffectMeasureDiscipline: "At first use, expand the measure name and translate what its numerator and denominator compare in plain language." | "translated at first use (AudienceAccessibleTerminologyGate)". |
| AuditSequence | `<AuditSequence>` (no priority attribute) | `<AuditSequence priority="Critical">` (holds the Critical rules). |

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| Proposal | Saves | What would change |
|---|---|---|
| Move the temporal-association audit (QA5 passive-reporting and null-model sentences, QA6 clustering sentences, NullExplanation clause, RiskWindowMultiplicityAndAggregation, the "temporal correlation" sentence) into a section loaded only for post-exposure temporal claims | about 2,600 from every quantitative run | New top-level section (the section-count test pins 60) and a router trigger (QuantitativeDeepModeTrigger already names post-exposure clusters and temporal null models). |
| Point HistoricalDoseAndRecipeTranslation to a conditional historical section (see the SourceVerification coverage) | about 470 | Same structural change as above. |
| Drop TimeAtRisk and BaseRateAndSeverity into RiskContextualization | about 300 | RiskContextualization covers like-for-like windows and severity only when contextualizing a risk, not every rate comparison; the rare-catastrophic-event screening sentence would go. |
| Drop SimpsonsParadoxCheck and MultipleTestingAndSubgroups into StatisticalAndClinicalInterpretation (Heterogeneity, Multiplicity) and CofactorAndMechanismAudit/CofactorEvidenceRequirements | about 330 | Loses "before declaring contradiction", sparse cells, and interaction tests for subgroups. |
| Drop the QA5 "Adverse events" paragraph to AdverseEventAscertainmentAndActionabilityAudit | about 300 | The home lacks "align definitions, seriousness criteria, windows, follow-up, and denominators before comparing rates" and "mechanism assumptions". |
| Drop the QA4 pharmacological sentence to DoseRegimeIntegrity.../NoCrossDoseEvidenceLaundering and ExposureIndex | about 250 | ExposureIndex also lists outcome and measurement confidence; unit and tolerance are only implicit. |

## Size

| | Characters | UTF-8 bytes |
|---|---:|---:|
| Original element | 18,847 | 18,881 |
| Replacement element | 15,958 | 15,990 |
| Change | −15% | |

The halving target is not reachable without dropping method content: after merging, almost every remaining sentence is
a distinct audit item (lists of populations, endpoints, windows, measures, thresholds) with no other home in HRP, and the
five output rules OutputFormatting relies on must stay whole. Markup and indentation are about 13% of the text.
