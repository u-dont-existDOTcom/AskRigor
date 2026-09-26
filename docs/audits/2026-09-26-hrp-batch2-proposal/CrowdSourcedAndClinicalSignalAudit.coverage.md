# CrowdSourcedAndClinicalSignalAudit: coverage map

Replacement: `CrowdSourcedAndClinicalSignalAudit.xml`. The root element and attributes are unchanged: `<CrowdSourcedAndClinicalSignalAudit priority="Critical">`. The Activation block (MandatoryTrigger, ConditionalTrigger, NonActivation) is unchanged. All 31 original rule names are kept except FormalFindingsMustRedirectCommunitySearch (30 kept). Nothing references that name, and its home is given below.

## Sizes

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 18,965 | 19,029 |
| Replacement element | 18,097 | 18,147 |
| Reduction | 868 (4.6%) | 882 |

**Method impact:** wording only. The changes are:

- three exclusion lists become one;
- three inaccessibility statements become one;
- two statements about not inferring population rates become one;
- one conditional restatement of the bidirectional loop is removed; the loop already contains it.

No trigger, list item, tier, comparison, output field, or template element is dropped or changed.

## Why this section shrinks so little

- **Owner-approval rows.** 21 of its 34 inventory rows are marked needs_owner_approval=true, so their substance must stay exact.
- **The inventory's MERGE targets are not true supersets.** Checked by searching the file:
  - AnswerShapeController ForumSignalDefaultTrigger and ForumSignalNonTrigger miss items that Activation has. They lack "explicit request", "comparative safety or tolerability", "timing differences", and the unconditional sparse-evidence trigger (theirs needs "a forum audit could materially alter the synthesis"); ForumSignalNonTrigger lacks "a clearly irrelevant crowd layer".
  - EvidenceLayers ClaimSpecificEvidenceUtility lacks "adverse events" (AnecdoteAsSignal).
  - DiscordancePreservationAndDiscriminatorSearch lacks "commercial incentives" and is active only with the bidirectional loop (ForumSignalDoesNotOverride…).
  - BidirectionalIterationStoppingRule uses different stopping criteria (SearchSaturationAndStopping).
  - DoseRegime's threshold rules lack the dose-unknown clause, and DoseRegime activates only for pharmacological questions.
- **This section is the home rule for others.** Batch 1 made it the home for FinalSelfCheck and OutputFormatting items:
  - OutputFormatting ModuleOutputs names RelativeForumSignal, RouteAndCohortSensitivityAnalysis, ThreePartCommunityConclusion, and ClosedPlatformAndAccessDisclosure.
  - OutputFormatting LimitsNote names DeepForumAuditActivationPrompt.
  - The batch-1 coverage docs point more than 20 former checks here.
- **Little is server-enforced.** On the connector, finalize_research enforces only that a YouTube survey exists and that each material video has a terminal audit. The forum method itself (cohorts, tiers, directions, counts, biases, conclusion fields) has no server gate.

## What the tests and other sections pin

- **Tests.** tests/ contains no string from this section. tests/protocol-sections.test.ts uses the Activation text as the section index summary, and that is unchanged.
- **Other sections** (all names kept):
  - OutputFormatting ModuleOutputs: RelativeForumSignal, RouteAndCohortSensitivityAnalysis, ThreePartCommunityConclusion, ClosedPlatformAndAccessDisclosure.
  - OutputFormatting LimitsNote: DeepForumAuditActivationPrompt.
  - The section name, from AnswerShapeController ForumSignalDefaultTrigger, AnswerShapeController BidirectionalEvidenceIterationDefaultTrigger, BidirectionalEvidenceDiscoveryAndTriangulationLoop Activation, and FinalSelfCheck CommunityEvidence.
  - CommunityCorpusAccessBoundaryCompletion (ProtocolExecutionAndComplianceGate). This section points to it.
- **VersionDiscipline RegressionProtection.** Preserved: "platform-specific relative forum-signal auditing", "automatic forum-signal activation", "separation of visible signal prevalence from causal attribution", and "YouTube longitudinal-corpus handling".

## NEEDS_OWNER_APPROVAL

None applied. Options that would need approval are listed at the end.

## Element and clause map

| Original element or clause | Disposition | New location or home | Note |
|---|---|---|---|
| Activation/MandatoryTrigger | KEPT | same | Verbatim. It is also the section's index summary. |
| Activation/ConditionalTrigger | KEPT | same | Verbatim. |
| Activation/NonActivation | KEPT | same | Verbatim. |
| AnecdoteAsSignal | KEPT | same | Verbatim. |
| ActualSearchRequired | KEPT | same | "without performing an actual" became "without an actual". The list of substitutes that do not count is verbatim. |
| PrincipalPlatformMapping: congregation mapping, 10 platform types, prioritize principal and treatment-specific communities | KEPT | same | Verbatim. |
| same: "General web results, PubMed, or an unrelated public forum do not stand in for a dominant closed or poorly indexed platform." | MERGED | ClosedPlatformAndAccessDisclosure ("Never infer the signal of such a platform … from Reddit or another unrelated public forum, general web results, PubMed or other published literature, public previews, or its general reputation") | A dominant closed or poorly indexed platform is one of the principal platforms that rule covers. |
| ScopeAxesBeforeSampling: estimand axes; ask only when material; strict-core versus labeled adjacent cohorts; no pooled headline count | KEPT | same | Wording only; "merely because" kept. |
| TieredInclusionInsteadOfPrematureExclusion: no discard for self-reported diagnosis, short post, missing dose, or incomplete chronology; broad sensitivity set; coding fields; at least 3 quality tiers; 3 confounder levels | KEPT | same | Wording only. |
| same: "Questions, recommendation-only comments, speculation, secondhand stories, copied testimonials, and intervention-free discussion remain excluded from firsthand counts." | MERGED | NoForumSignalByProxy (the single exclusion list); TieredInclusion keeps a pointer | Every item is kept. |
| SnippetAndPartialAccessTier | KEPT | same | Wording only; all conditions, labels, no-inference items, sensitivity analysis, and the three "do not by themselves" limits are kept. |
| RouteAndCohortSensitivityAnalysis | KEPT | same | The four minimum comparisons are inline; "lead with the instability" and the dominant-route clause are kept. |
| ForumVocabularyExpansion | KEPT | same | Wording only. |
| DirectionalSearchSymmetry | KEPT | same | The seven quoted negative terms are kept verbatim. |
| RelativeForumSignal: compare unique firsthand reports across six directions; counts or why they are unreliable; six-way classification; disclosure list | KEPT | same | Verbatim. |
| same: "Separate objective outcomes from subjective impressions" | KEPT + POINTER | same, with "(ObjectiveSubjectiveSeparation)", the definitions' home in this section | |
| same: "…and actual experiences from questions, recommendations, speculation, reposts, quotations, promotional claims, and duplicate posters" | MERGED | NoForumSignalByProxy now also lists reposts, quotations, and promotional claims; "duplicate posters" stays here | |
| same: "Never infer population incidence or prevalence from forum frequency." | MERGED | NoPopulationRateFromForumSample (verbatim); RelativeForumSignal keeps a pointer | One home for the no-population-rate rule (inventory note). |
| SignalPrevalenceAndCausalAttributionAreSeparate | KEPT | same | Wording only. |
| MultipleIndependentCommunities | KEPT | same | Wording only. |
| UniqueFirsthandUnit | KEPT | same | Verbatim; "preferred counting unit" kept. |
| NoForumSignalByProxy | KEPT (merged list) | same | Union of three lists: practitioner summaries; vendor testimonials; "many users report" articles; AI summaries; copied stories or testimonials; recommendation-only comments; questions, including hypothetical; secondhand stories or accounts; speculation; reposts; quotations; promotional claims; intervention-free discussion. |
| ObjectiveSubjectiveSeparation | KEPT | same | Examples kept; they define the two classes. |
| ContextExtraction | KEPT | same | Verbatim (inventory NOA=true). |
| DoseUnknownReportsCannotDefineThreshold | KEPT | same | Verbatim; the original's broken indentation is fixed. |
| SilentDenominator | KEPT | same | Verbatim. |
| CommercialAndCommunityBias | KEPT | same | Verbatim. |
| ClosedPlatformAndAccessDisclosure: state restricted, poorly indexed, or partly visible principal platforms; do not infer their signal from other sources; dominant platform inadequately searched means inaccessible or indeterminate, plus the effect on cross-platform conclusions | KEPT | same | Absorbs the two items below. The "state how this limits any cross-platform conclusion" duty stays tied to the dominant platform, as in the original. |
| InaccessibleForumStatus para 1: "If relevant communities cannot be searched or enough firsthand reports cannot be inspected, classify that platform's forum signal as inaccessible or indeterminate. Do not infer the likely result from general reputation." | MERGED | ClosedPlatformAndAccessDisclosure | Both conditions and the reputation ban are kept. |
| InaccessibleForumStatus para 2: inaccessibility does not erase a useful synthesis; apply CommunityCorpusAccessBoundaryCompletion; state whether the missing corpus adds detail, changes confidence, changes ranking, or could change the conclusion | KEPT + POINTER | InaccessibleForumStatus → ProtocolExecutionAndComplianceGate/CommunityCorpusAccessBoundaryCompletion, condition 4 (the decision-impact class) | The detail, confidence, ranking, or conclusion wording is that condition's decision-impact class, so it is named rather than re-listed. |
| same: "Do not issue a directional classification for the unobserved platform." | REMOVED_REDUNDANT | ClosedPlatformAndAccessDisclosure (classify as inaccessible or indeterminate); CommunityCorpusAccessBoundaryCompletion condition 3; NoSilentAccessFailure | |
| SearchSaturationAndStopping | KEPT | same | Verbatim. |
| FormalFindingsMustRedirectCommunitySearch | REMOVED_REDUNDANT | BidirectionalEvidenceDiscoveryAndTriangulationLoop/FormalToCommunityDiscriminatorTransfer (a superset list) and /NoFixedStudiesThenCommunitySequence ("A formal finding that could explain or challenge the community pattern reopens community sampling") | The rule applied only "when the bidirectional iteration module is active", when that module is loaded. The name is referenced nowhere in the repo. Risk: see below. |
| YouTubeCreatorCommentCorpusHandling (3 paragraphs) | KEPT | same, one paragraph | Every clause is kept. "Keep creator self-reports separately labeled from independent replication" joins the creator clause; "Keep baseline imaging or diagnosis evidence separate from objective evidence of change" joins the extraction clause. Inventory makes this the canonical YouTube rule, so nothing here points to the bidirectional loop's YouTube rules. |
| ProspectiveBeatsRetrospective | KEPT | same | Verbatim (NOA=true). |
| RechallengeWeight | KEPT | same | Verbatim (NOA=true). |
| ForumSignalDoesNotOverrideDirectEvidenceAutomatically | KEPT | same | Verbatim content. |
| ThreePartCommunityConclusion | KEPT | same | Verbatim content. |
| DeepForumAuditActivationPrompt: in every forum-signal response, brief or completed; topic-specific; copyable; adapt the brackets; expand "check forums for…" | KEPT | same | Framing compressed. The template is verbatim. Placement is OutputFormatting LimitsNote (unchanged). |
| NoPopulationRateFromForumSample | KEPT (+ merged sentence) | same | See RelativeForumSignal. |
| VolunteerEthics | KEPT | same | Verbatim. |

## Risk: dependency on the bidirectional loop

The removal of FormalFindingsMustRedirectCommunitySearch relies on BidirectionalEvidenceDiscoveryAndTriangulationLoop keeping two things:

- the FormalToCommunityDiscriminatorTransfer target list: tested and excluded populations, exposure, duration, adherence, endpoint, nonresponders, adverse effects, withdrawals, responder subgroups, and so on;
- the NoFixedStudiesThenCommunitySequence reopening sentence.

The inventory marks FormalToCommunityDiscriminatorTransfer GATE_CANDIDATE ("keep a one-clause method statement"). If that section's batch-2 draft shortens the list, restore this rule. Its original text is in _work/orig/.

## Cross-check against the sibling's bidirectional-loop draft

Checked BidirectionalEvidenceDiscoveryAndTriangulationLoop.xml, the in-progress draft in this directory, at 21:05.

- **The two rules this section now relies on are intact.** FormalToCommunityDiscriminatorTransfer has its full list, with "failures" added. NoFixedStudiesThenCommunitySequence keeps the reopening sentence, now ending "even after a completed broad forum sample".
- **That draft points into this section.** It names YouTubeCreatorCommentCorpusHandling, ContextExtraction, CommercialAndCommunityBias, and SilentDenominator here, and CommunityCorpusCompletionGate, in place of content it removed from its YouTube rules. All of these are kept unshortened, so later edits to them must account for that dependency.

## Options not applied (each needs owner approval; savings approximate)

| Id | Change (inventory row) | Saves | What changes |
|---|---|---|---|
| CO1 | Activation → pointer to AnswerShapeController ForumSignalDefaultTrigger and ForumSignalNonTrigger, after adding the missing items there | ~900 here, ~150 added there | The index summary would come from a new short Purpose. Trigger scope must be reconciled first (see above). |
| CO2 | PrincipalPlatformMapping: drop the 10-platform enumeration (NOA row) | ~190 | Less prompting toward closed platforms such as Facebook and Telegram. |
| CO3 | ContextExtraction → merge with YouTubeLongitudinalExtraction and AnecdoteChronologyReconstruction (NOA row) | ~500 | The general forum extraction list would live in YouTube- and dose-specific rules. |
| CO4 | DoseUnknownReportsCannotDefineThreshold → DoseRegime ThresholdOutputMinimum (NOA row) | ~400 here, ~200 there | Applies only when DoseRegime triggers, which is pharmacological only. |
| CO5 | SilentDenominator + CommercialAndCommunityBias (+ loop YouTubeBiasAudit) → one bias rule (NOA rows) | ~250 | Cross-section merge. |
| CO6 | ForumSignalDoesNotOverride… reasons → DiscordancePreservationAndDiscriminatorSearch, adding "commercial incentives" there (NOA row) | ~350 | The home is active only with the bidirectional loop. |
| CO7 | RechallengeWeight → CommunitySignalCanReorderResearchPriority (NOA row) | ~190 | Cross-section. |
| CO8 | Cut ProspectiveBeatsRetrospective (NOA row, CUT_CANDIDATE) | ~160 | Relies on model default. |
| CO9 | DeepForumAuditActivationPrompt: template → list of required elements (~650 saved); or a one-line offer, omitted after a completed tool-backed audit (~1,300 saved) | ~650–1,300 | The user-facing prompt wording would no longer be fixed. The second variant also narrows when the prompt appears. |
| CO10 | Fold SignalPrevalenceAndCausalAttributionAreSeparate into ThreePartCommunityConclusion (NOA row) | ~300 | The RegressionProtection item would be kept in the merged text. |
| CO11 | YouTubeCreatorCommentCorpusHandling to about 650 characters, with coverage statements taken from audit receipts (NOA row) | ~800 | Relies on receipt fields; the connector-only benefit. |
| CO12 | SearchSaturationAndStopping → BidirectionalIterationStoppingRule | ~370 | The stopping criteria differ, and the home is active only with the loop. |
| CO13 | ScopeAxesBeforeSampling ask-the-user clause → CheckForumsForCommandTrigger (NOA row) | ~150 | That trigger covers only "check forums for" requests. |

All options together save about 5,200–5,900 characters, taking the section to roughly 12,200–12,900.

## Validation

- **Splice and tests.** Same run as the other drafts: all four spliced into a copy of HRP_Full.xml and the full suite run there. All content tests pass; the only failures are SHA-256 digest pins and one test that needs a .git directory. See TreatmentLandscapeAndVideoSelectionGate.coverage.md.
- **Well-formedness.** The XML is well-formed.
- **Cross-references.** Every name referenced from other sections still has exactly one definition.
