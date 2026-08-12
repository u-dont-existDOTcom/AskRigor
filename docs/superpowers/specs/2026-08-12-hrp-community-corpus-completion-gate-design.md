# HRP Community Corpus Completion Gate Design

## Status and approval

Approved for implementation on 2026-08-12. The user supplied the required gate, ledger fields, exact YouTube failure regression, version target `20.5.16`, and directed implementation to continue without another routine approval pause.

## Problem

HRP 20.5.15 already requires platform mapping, broad YouTube acquisition, pagination, reply reconciliation, coverage disclosure, and continuation while mandatory work remains. It nevertheless permits an execution failure in which a query-bounded YouTube comment search returns `access_status: partial` and `extraction_coverage: partial`, yet the model treats the result as reconnaissance, characterizes the unseen community signal, and finalizes.

This is an execution-reliability defect. Adding another general instruction to search more comments would duplicate existing rules without making the incomplete tool state control synthesis.

## Considered approaches

### 1. Expand the late YouTube acquisition rule

This would be the smallest textual change, but the relevant requirements are already present late in the protocol and were skipped. It does not address instruction salience or create an early completion barrier.

### 2. Add a TypeScript runtime blocker

A code-level state machine could enforce these fields if the plugin owned the complete research-and-synthesis loop. The current AskRigor plugin exposes deterministic tools and canonical protocol text; it does not own the consuming model's research loop. A local runtime blocker would therefore protect only selected tool calls, not the synthesis decision that failed.

### 3. Add an early machine-like protocol gate and exact regression

This is the selected approach. A compact top-level `CommunityCorpusCompletionGate` will translate concrete retrieval fields into an unambiguous incomplete state before the broader `ProtocolExecutionAndComplianceGate`. The existing detailed YouTube rules remain the acquisition method; the new gate becomes the synthesis barrier. Contract tests will protect the gate's position, trigger fields, ledger, and exact observed failure case.

## Architecture

HRP 20.5.16 will add one top-level critical gate near the beginning of the operative protocol, before `ProtocolExecutionAndComplianceGate`. The Architecture section will identify it as the controller for community-corpus completion state.

The gate contains four rules:

1. `PartialRetrievalCannotCompleteAudit` converts any non-complete principal retrieval, partial/search-only/ranked/manual/creator-only extraction, unconsumed cursor, `has_more=true`, or explicit query-bounded/incomplete limitation into an incomplete audit. It prohibits prevalence, direction, rarity, typicality, or signal-strength claims and requires automatic continuation when retrieval remains possible.
2. `QueryBoundedYouTubeSearchIsDiscoveryOnly` defines keyword/search-term retrieval as discovery only. Material selected videos require the broadest accessible unfiltered top-level corpus, pagination to exhaustion or a genuine access boundary, accessible replies, and reply reconciliation before directional classification.
3. `NoPrematureSaturation` prohibits saturation while retrievable pages, unfiltered comments, replies, material videos, or independent community pools remain. Restrictive-query scarcity is not corpus scarcity.
4. `CoverageStateBeforeSynthesis` requires a compact ledger and sets the only final coverage states to `complete`, `completed-with-access-boundary`, or `incomplete`. Full HRP synthesis is blocked while the state is incomplete.

The existing `CommunityCorpusAccessBoundaryCompletion` rule remains the sole exception. The new gate must not convert partial output into an access boundary automatically: it must first establish a genuine external boundary and satisfy every existing access-boundary condition.

## Required state ledger

Before synthesis, the protocol records:

- `principal_platforms_mapped`
- `acquisition_mode`
- `unfiltered_retrieval_attempted`
- `pagination_exhausted`
- `replies_reconciled`
- `unique_firsthand_people`
- `unique_treatment_episodes`
- `benefit_search_completed`
- `no_effect_search_completed`
- `harm_search_completed`
- `discontinuation_search_completed`
- `independent_discussion_pools_sampled`
- `final_coverage_state`

The fields will also be reflected in the protocol's execution/iteration templates so the gate can be instantiated rather than merely read.

## Exact regression

Add `OneQueryBoundedYouTubeCommentPresentedAsReconnaissance` to `StressTestExpectations`:

- A search for `used` returns one query-bounded comment with `access_status=partial` and `extraction_coverage=partial`.
- A search for `results` returns zero.
- The model then calls real-world evidence weak or indeterminate and finalizes.

Expected behavior: fail the audit; treat both searches as discovery-only; retrieve unfiltered comments for material videos; paginate to exhaustion; retrieve and reconcile replies; expand to additional relevant videos or independent communities; deduplicate person-by-treatment episodes; and perform benefit, no-effect, harm, and discontinuation sampling. If broader acquisition is genuinely impossible, run `CommunityCorpusAccessBoundaryCompletion`. Never characterize the unseen corpus from the single result.

## Versioning and integrity

Update the canonical HRP root and revision history to `20.5.16` with revision date `2026-08-12`. Recompute the SHA-256 only after the canonical XML is final, then update all current plugin manifest/integrity expectations and public-review fixtures that describe the live canonical protocol. Historical release evidence may retain the exact earlier version it documented.

## Testing

Tests must fail before the XML change and then prove:

- manifest version and revision date are `20.5.16` and `2026-08-12`;
- the new gate exists before `ProtocolExecutionAndComplianceGate`;
- all concrete incomplete-output triggers and prohibited synthesis claims are present;
- query-bounded search is discovery-only and unfiltered pagination/reply reconciliation are mandatory;
- every state-ledger field and all three final coverage states are present;
- the exact regression case and expected continuation/access-boundary behavior are present;
- XML remains well formed and the published digest matches exact canonical bytes;
- the MCP `load_protocol` response exposes the new manifest and exact text;
- typecheck, build, focused tests, the serialized full suite, and plugin validation pass.

## Scope boundaries

This revision does not redesign the YouTube connector, claim population incidence from community evidence, require costly strong-model adjudication of every comment, weaken privacy minimization, or alter the established access-boundary exception. It changes completion control and regression protection only.
