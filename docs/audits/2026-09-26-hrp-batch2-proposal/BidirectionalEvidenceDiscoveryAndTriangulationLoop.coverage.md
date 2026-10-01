# BidirectionalEvidenceDiscoveryAndTriangulationLoop: coverage

Replacement: `BidirectionalEvidenceDiscoveryAndTriangulationLoop.xml`. Splice over the exact range from
`<BidirectionalEvidenceDiscoveryAndTriangulationLoop priority="Critical">` through
`</BidirectionalEvidenceDiscoveryAndTriangulationLoop>` (HRP 20.6.0 lines 2466 to 2632).

Dispositions: KEPT, MERGED, POINTER (home named), SERVER_GATE, REMOVED_META, REMOVED_REDUNDANT, NEEDS_OWNER_APPROVAL,
OWNER_DEFAULT (owner-accepted output shape: research-process status in the LimitsNote). "(owner row)" marks inventory
rows with needs_owner_approval=true; their substance is kept exactly.

The loop rules are the canonical home (batch 1 points OutputFormatting/ClaimOrganizedSynthesis, FinalSelfCheck
CommunityEvidence, the Architecture layer, and ProtocolExecutionAndComplianceGate here). The savings come from the
YouTube rules, whose shared content already lives in CrowdSourcedAndClinicalSignalAudit (always loaded with this loop,
since the loop requires a community layer) and CommunityCorpusCompletionGate, and from the server's acquisition gate.

## Method impact

Wording only, with two items absorbed from a sibling draft (rows 7, 11) so nothing is lost when the sibling
CrowdSourcedAndClinicalSignalAudit draft drops FormalFindingsMustRedirectCommunitySearch.

## Element map

| # | Original element / clause | Disposition | New location / note |
|---|---|---|---|
| 1 | Purpose: integrate the four layers as a feedback system; each layer discovers what the others failed to ask; keep inferential limits | KEPT | Purpose (228 characters, fits the index summary). |
| 2 | Purpose: "rather than independent sequential checkboxes" | REMOVED_REDUNDANT | NoFixedStudiesThenCommunitySequence; also core EvidenceLayers/EvidenceLayersAreNotAFixedDiscoveryOrder and the core HRP Purpose. |
| 3 | Per-rule `priority="Critical"` | KEPT | "Every rule here is Critical." in the Purpose. |
| 4 | Activation/MandatoryTrigger clause 1: both ExtendedHumanEvidence sweep and CrowdSourced audit triggered | POINTER | AnswerShapeController/BidirectionalEvidenceIterationDefaultTrigger (same condition, plus its presumptive list), named first in Activation. |
| 5 | MandatoryTrigger clauses 2 and 3: community reports could reveal [11 items] that change formal searching; or formal findings could redirect community sampling | KEPT | Activation, verbatim items. Kept because the router requires both conditions together ("and") while this module fires on either. |
| 6 | Activation/NonActivation: five exclusions; record the reason in structured or deep mode | KEPT | Activation. |
| 7 | NoFixedStudiesThenCommunitySequence (owner row) | KEPT | Same rule. Adds "even after a completed broad forum sample", the unique sentence of CrowdSourcedAndClinicalSignalAudit/FormalFindingsMustRedirectCommunitySearch, which the sibling draft of that section removes. |
| 8 | CommunityToFormalHypothesisTransfer (owner row): transfer list (15 items) and search-venue list (10 items) | KEPT | Same rule, all items. |
| 9 | ExtendedHumanEvidenceAndGreyLiteratureSweep/CommunityDerivedFormalSearchExpansion (other section of this batch) | MERGED | Into CommunityToFormalHypothesisTransfer: reopen the relevant extended source classes, the earlier sweep is not final, record which community leads changed the formal search map. Its item list is a subset of the transfer list. |
| 10 | FormalToCommunityDiscriminatorTransfer (13 items; seek disconfirmation) | KEPT | Same rule. |
| 11 | CrowdSourcedAndClinicalSignalAudit/FormalFindingsMustRedirectCommunitySearch (sibling draft removes it) | MERGED | Its search targets (study and excluded populations, exposure, duration, endpoint, adherence, adverse events, responder and nonresponder phenotypes) were already in row 10; "failures" added to row 10, and its "completed sample is not final" sentence to row 7. |
| 12 | CommunitySignalCanReorderResearchPriority (owner row) | KEPT | Same rule. |
| 13 | InternalValidityCanCarryApplicabilityCost (owner row): control can raise internal validity while narrowing scope | POINTER | Core HRP Purpose ("Methodological control can increase internal validity while narrowing population, exposure, or endpoint applicability"); the rule opens with the narrowing list (population, exposure, bundle, behavior, duration, adherence, endpoint) kept verbatim. |
| 14 | ... call it a scope or applicability limit, not a rigor defect; a narrow precise trial may be weak evidence for a broad claim; grade separately; let directly applicable evidence inform the next search | KEPT | Same rule. |
| 15 | DiscordancePreservationAndDiscriminatorSearch (owner row): no forced fit, averaging, or automatic privilege; report layers separately; 18 discriminators; keep unresolved and name the distinguishing evidence | KEPT | Same rule, all 18 discriminators. |
| 16 | YouTubeCreatorAndCommentEcosystems (owner row): when YouTube is principal (5 topic triggers); ecosystem elements; no Reddit or web substitute | KEPT | Same rule. |
| 17 | ... "rather than a peripheral social-media source" | REMOVED_REDUNDANT | Implied by "principal". |
| 18 | ... search more than one channel or discussion pool when feasible | POINTER | CrowdSourcedAndClinicalSignalAudit/MultipleIndependentCommunities (sample more than one principal community on a platform where access permits) and CommunityCorpusCompletionGate/QueryBoundedYouTubeSearchIsDiscoveryOnly (expand to more videos or pools). |
| 19 | YouTubeAcquisitionCoverageAndCapability: determine actual capability before claiming adequate search; never assume tools work because instructions or code exist | KEPT | Same rule ("bundled Python" and "browser comments" generalized to "bundled code" and "browser access"). |
| 20 | ... the six capability classes | POINTER | CrowdSourcedAndClinicalSignalAudit/YouTubeCreatorCommentCorpusHandling (states the same coverage classes) and ClosedPlatformAndAccessDisclosure (inaccessible). |
| 21 | ... identity minimization paragraph (owner row) | KEPT | Same rule, all three clauses. Storage is also server-governed (privacy data map: no YouTube or community persistence). |
| 22 | ... retrieve all accessible top-level comments and replies of material videos and reconcile reply counts | SERVER_GATE + POINTER | audit_youtube_video_community (reply reconciliation, completion_state, synthesis lock) and finalize_research (unaudited material video returns not_ready); prose home CommunityCorpusCompletionGate/QueryBoundedYouTubeSearchIsDiscoveryOnly. |
| 23 | ... call it API-visible or export-visible, not all comments ever posted | POINTER | CrowdSourcedAndClinicalSignalAudit/YouTubeCreatorCommentCorpusHandling ("do not describe API completion as proof that deleted, moderated, hidden, or never-posted failures were observed"). |
| 24 | ... when full acquisition is unavailable, apply CommunityCorpusAccessBoundaryCompletion | KEPT | Same rule. |
| 25 | YouTubeDualLaneDiscoveryAndSignal (owner row) | KEPT | Same rule: condition, both lane definitions, lexical-filter ban, translation, random or defensible residual sample, the adjudication permission. |
| 26 | YouTubeLongitudinalExtraction (owner row): creator versus commenter; person x episode unit, not comment x sentiment | KEPT | Same rule. |
| 27 | ... fields: video and channel identity, comment and reply IDs, author identity or ephemeral id, publication and update dates, thread structure | SERVER_GATE | The connector's audit records carry these (video_id, channel, comment_id, parent_id, top_level_comment_id, author_channel_id, published_at, updated_at); the rule says so. Identity handling: row 21. |
| 28 | ... fields: source role, language, exact firsthand intervention or exposure, own regimen facts versus own outcome claims, baseline diagnosis and severity, surgery or treatment recommendation, intervention-specific dechallenge or rechallenge | KEPT | Same rule. |
| 29 | ... fields: dose, formulation, duration, co-interventions, time to change, persistence, relapse, functional outcomes, baseline versus post-intervention objective evidence, later follow-ups, same person across videos | POINTER | CrowdSourcedAndClinicalSignalAudit/ContextExtraction and YouTubeCreatorCommentCorpusHandling (both named in the rule) state each of these. |
| 30 | ... separate episodes in one narrative; creator reply is firsthand but not independent replication; likes, ranking, reply volume are not votes | KEPT | Same rule. |
| 31 | YouTubeBiasAudit (owner row): creator-success bias, algorithmic ranking, channel-audience selection, search personalization, pinned-comment effects, inaccessible replies, monetization, cross-post duplication, outcome-free enthusiasm, success-makes-content and failure-makes-silence | KEPT | Same rule. |
| 32 | ... deleted or moderated comments, survivorship, affiliate incentives, treatment evangelism | POINTER | CrowdSourcedAndClinicalSignalAudit/CommercialAndCommunityBias (deleted or discouraged negative reports, moderation rules, survivor communities, affiliate links, treatment enthusiasm) and SilentDenominator, named in the rule. |
| 33 | ... preserve genuine negative and eventual-surgery reports, not noise | KEPT | Same rule. |
| 34 | CrossLayerDiscordanceMatrix | KEPT | Same rule, all 12 matrix fields. |
| 35 | IntegratedSynthesisByClaim | KEPT | Same rule (referenced by name from OutputFormatting/ClaimOrganizedSynthesis). |
| 36 | BidirectionalIterationStoppingRule (owner row) | KEPT | Same rule, all four conditions and the stop criterion. |
| 37 | BidirectionalIterationOutput: hypotheses moved, redirecting formal findings, unresolved disagreements, platform impact, saturation or access stop; no low-value narration | KEPT + OWNER_DEFAULT | Same rule; an access-limit stop is reported in the LimitsNote. |

## Tests and cross-references

- No test pins this section or its rule names.
- Protocol text names the section in AnswerShapeController (Mode structured, BidirectionalEvidenceIterationDefaultTrigger),
  ResearchOrchestrationAndModeSelectionGate/PassDecomposition, OutputFormatting/ClaimOrganizedSynthesis (also names
  `IntegratedSynthesisByClaim`, kept), and FinalSelfCheck CommunityEvidence. `CommunityCorpusAccessBoundaryCompletion`
  (defined in ProtocolExecutionAndComplianceGate) is still named.
- All rule names are kept, including all five YouTube rules, because batch-1 audit docs cite them as homes.
- VersionDiscipline/RegressionProtection capabilities kept: bidirectional formal-community iteration (rows 5 to 7),
  community-to-formal transfer (row 8), formal-to-community discriminator search (row 10), YouTube longitudinal-corpus
  handling (rows 16 to 33), discordance preservation without forced fit (row 15), integrated claim-level synthesis
  (row 35), cross-layer saturation (row 36). Claim-specific evidence utility lives in core EvidenceLayers.
- Stress cases covered (per inventory): StudiesThenForumSiloMissesCommunityDerivedIntervention, YouTubeDominantSelfExperimentCorpusOmitted,
  FormalCommunityDiscordanceForcedFit, TrialRigorMistakenForRealWorldCompleteness, YouTubeCompleteApiCorpusDoesNotRequireBlanketStrongModelPass,
  YouTubeCreatorReplyIsFirsthandNotIndependentReplication, MultiEpisodeNarrativeCannotUseOneSentimentLabel,
  BaselineImagingIsNotPostTreatmentObjectiveRecovery, EnglishLexicalFilterMissesMultilingualOutcome.

## Dependencies on sibling drafts (batch 2)

The POINTER rows assume these rules survive with their current content (checked against the drafts in this folder at
the time of writing): CrowdSourcedAndClinicalSignalAudit YouTubeCreatorCommentCorpusHandling, ContextExtraction,
CommercialAndCommunityBias, SilentDenominator, MultipleIndependentCommunities, ClosedPlatformAndAccessDisclosure;
CommunityCorpusCompletionGate QueryBoundedYouTubeSearchIsDiscoveryOnly. Rows 7 and 11 assume the sibling removes
FormalFindingsMustRedirectCommunitySearch; if it keeps it, the two additions are harmless duplicates.

## Sizes

Old 13,027 characters (13,043 bytes); new 11,203 characters. 86%.

## Optional further cuts (NEEDS_OWNER_APPROVAL, not applied)

| ID | Proposed change | Saves | What changes |
|---|---|---|---|
| BD-1 | Activation becomes: "AnswerShapeController/BidirectionalEvidenceIterationDefaultTrigger; a user-supplied current corpus shown to contain completed bidirectional iteration also excuses it. Record any nonactivation reason in structured or deep mode." | about 500 | Drops rows 5 and 6: the module would fire only on the router's combined condition, and its own exclusion list gives way to the router's "affirmative reason". In structured or deep health research the sweep always runs, so clause 1 covers most cases. |
| BD-2 | Move the unique YouTube content (rows 16, 19, 21, 25, 28, 30, 31, 33) into CrowdSourcedAndClinicalSignalAudit/YouTubeCreatorCommentCorpusHandling and leave one pointer rule here. The inventory recommends a single canonical YouTube rule. | about 3,300 here, about 1,800 overall | Placement only if done verbatim; needs the sibling section edited in the same change. |
| BD-3 | Shorten YouTubeDualLaneDiscoveryAndSignal to the lexical-filter ban and the adjudication permission, pointing to YouTubeCreatorCommentCorpusHandling for the two corpora, non-English reports, and residual audit. | about 370 | Loses the lane definitions, "translate or semantically process", and "random or otherwise defensible" (owner row). |
| BD-4 | Move CrossLayerDiscordanceMatrix to ResearchAuditTemplates/BidirectionalEvidenceIterationLedger (non-runtime). | about 470 | The running matrix stops being a runtime instruction. |
| BD-5 | Shorten the 18 discriminators in DiscordancePreservationAndDiscriminatorSearch to about six examples plus a pointer to CrowdSourcedAndClinicalSignalAudit/ForumSignalDoesNotOverrideDirectEvidenceAutomatically (inventory recommendation). | about 300 | Loses named discriminators (owner row). |
