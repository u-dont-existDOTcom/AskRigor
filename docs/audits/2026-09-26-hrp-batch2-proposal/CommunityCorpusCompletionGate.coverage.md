# CommunityCorpusCompletionGate: coverage map

Replacement: `CommunityCorpusCompletionGate.xml`. The root element and attributes are unchanged: `<CommunityCorpusCompletionGate priority="Critical">`. All four rule names are kept, and the section stays in its place before ProtocolExecutionAndComplianceGate, which a test requires.

## Sizes

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 4,365 | 4,365 |
| Replacement element | 4,333 | 4,333 |
| Reduction | 32 (0.7%) | 32 |

**Method impact:** wording only.

## Why this gate barely shrinks

**Test pins.** tests/protocol.test.ts ("preserves the HRP community corpus completion gate and regression") slices the raw text from `<CommunityCorpusCompletionGate` to `<ProtocolExecutionAndComplianceGate`. The slice is not whitespace-normalized, and it also contains CommunityEvidenceIndependenceAndActionabilityGate. Each of these must appear unbroken on one line:

- "discovery operation only"
- "unfiltered top-level comment corpus"
- "paginate until exhausted"
- "retrieve accessible replies"
- "reconcile expected versus retrieved replies"
- "continue automatically"
- "never exclude them solely because the corpus is partial"
- "Do not extrapolate their composition, prevalence, direction, rarity, typicality"
- "CommunityCorpusAccessBoundaryCompletion"
- "complete and api_visible_complete"

The whole file must also contain:

- the tag `<CommunityCorpusCompletionGate priority="Critical">`;
- the four rule names;
- access_status, extraction_coverage, next_cursor, and has_more=true;
- "complete / completed-with-access-boundary / partial".

That leaves little text that is not pinned, and what remains is canonical: FinalSelfCheck FS197, MandatoryTriggeredModuleCompletion, and the batch-1 docs point here.

**Server enforcement is partial.**

- On the connector, audit_youtube_video_community performs QueryBoundedYouTubeSearchIsDiscoveryOnly's per-video steps: unfiltered top-level comments, reply pagination, and reconciliation of expected against retrieved replies.
- finalize_research requires a survey receipt and a terminal audit receipt for each material video.
- search_youtube_comments is always labeled partial.

The prose stays because it is test-pinned, it applies on every surface, and nothing checks the ledger in CoverageStateBeforeSynthesis. For the same reason no server note was added: ProtocolExecutionAndComplianceGate ServerCompletionGate and the connector's server instructions already say this.

## NEEDS_OWNER_APPROVAL

None.

## Element and clause map

| Original element or clause | Disposition | New location | Note |
|---|---|---|---|
| Purpose | KEPT | Purpose | "This gate controls completion, representativeness, and broad-ranking claims; the platform-specific community and YouTube rules control acquisition, extraction, deduplication, and evidence grading" is kept. The index summary is truncated at 240 characters, as the original was. |
| PartialRetrievalRemainsBoundedEvidence: terminal success values; partial triggers (other access_status, incomplete extraction_coverage classes, next_cursor, has_more=true, query-bounded limitation); preserve records, denominator, method, scope, window, pagination, limitations | KEPT | same | "an explicit limitation stating that" became "an explicit limitation that". All pins are unbroken. |
| same: review as bounded evidence; never exclude for partiality; no extrapolation of 8 properties; zero matches are not evidence; continue automatically, keeping reviewed evidence; partial output alone is not an access boundary; apply CommunityCorpusAccessBoundaryCompletion when completion depends on it | KEPT | same | Wording only. |
| QueryBoundedYouTubeSearchIsDiscoveryOnly: query-filtered retrieval is discovery only and never by itself the directional corpus | KEPT | same | Two sentences joined. |
| same: for every material selected video, broadest unfiltered top-level corpus; paginate until exhausted or genuine boundary; accessible replies; reconcile expected against retrieved replies before directional use | KEPT (partly SERVER_GATE on the connector) | same | Unconditional scope kept ("For every material selected video"). On the connector, audit_youtube_video_community does these steps and finalize_research requires its terminal receipt. |
| same: expand to more videos or pools when platform coverage requires; deduplicate person x episode, not comments | KEPT | same | "when required for platform coverage" became "when platform coverage requires it". |
| NoPrematureSaturation | KEPT | same | Verbatim content. |
| CoverageStateBeforeSynthesis: 13 ledger fields | KEPT | same | Verbatim. Test-pinned in the two ResearchAuditTemplates forms, not in this section. |
| same: missing count is unknown, not zero | KEPT | same | Moved up beside the field list. "rather than silently converted to zero" became "never silently as zero". |
| same: three final states and their definitions; partial evidence reviewed, bounded synthesis with prominent coverage label, no complete, representative, prevalence, or broad-ranking claim | KEPT | same | "prominent coverage label" kept. OutputFormatting decides placement: ClaimLevelUncertainty and LimitsNote. |

## Options not applied (each needs owner approval; savings approximate)

| Id | Change | Saves | What changes |
|---|---|---|---|
| GO1 | Have finalize_research derive the CoverageStateBeforeSynthesis ledger from receipts; keep only the three states and the partial-evidence semantics in prose. | ~450 | Needs a server change. The field names stay in the templates, so tests pass. |
| GO2 | Replace QueryBoundedYouTubeSearchIsDiscoveryOnly's per-video mechanics with "audit each material video with the comment-audit tool until its receipt is terminal". | ~350 | Needs the section-sliced test pins updated. Surfaces without that tool lose the mechanics. |

## Validation

All four drafts were spliced into a copy of HRP_Full.xml and the full suite was run there (see TreatmentLandscapeAndVideoSelectionGate.coverage.md). Every section-sliced and whole-file pin above passes, as do the section order and the test for this regression (OneQueryBoundedYouTubeCommentPresentedAsReconnaissance and ApiVisibleCompleteYouTubeCorpusIsTerminalSuccess are unchanged in StressTestExpectations).
