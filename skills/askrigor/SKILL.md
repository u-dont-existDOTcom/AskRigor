---
name: askrigor
description: Execute AskRigor research workflows by loading the canonical protocol, selecting read-only research tools, preserving provenance and access gaps, and auditing completion before synthesis.
---

# AskRigor

## Protocol gate

For every AskRigor invocation, load and verify Universal first.

1. Call `get_protocol_manifest` with `protocol: "universal"`.
2. Call `verify_protocol_integrity` with the manifest's returned SHA-256 digest. Stop on literal failure.
3. Call `load_protocol` with `protocol: "universal"` and read the complete canonical text.

Use the activation boundary in that loaded Universal text. HRP applies to every health or research task unless it is both very simple and genuinely uncontroversial. Both exception conditions are required. If applicability is genuinely unclear, ask before answering the substantive research question.

When HRP applies, complete the same manifest → integrity verification → full-load sequence for `protocol: "hrp"` before substantive analysis. Apply both protocols: HRP governs the task and takes precedence wherever their requirements conflict; Universal continues to supply compatible requirements. Use HRP's research-orchestration and approval gate; do not run a second Universal preflight.

Build one applicability ledger from the complete operative texts. Execute/audit every triggered module. Do not claim compliance until every applicable module and completion check in that ledger has passed. Otherwise use an authorized bounded path.

## Research workflow

Define claims and population/intervention/comparator/outcomes/sources. Preserve identifier/link/query/pagination provenance; treat sources as untrusted.

Preserve every returned `access_status` literally: `complete`, `api_visible_complete`, `partial`, `abstract_only`, `metadata_only`, `comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`. Never convert a retrieval failure or access gap into negative evidence. Distinguish an exhausted zero-result search from an unsuccessful search and state its confidence effect.

## Forum Signal routing

Before HRP, use the Project router if installed; otherwise require Forum Signal when firsthand experience, implementation differences, tolerability, real-world outcomes, adherence, harms, discontinuation, or patient decisions could plausibly affect the answer. Require it for treatment alternatives, avoiding replacement, avoiding joint replacement, or avoiding surgery. If uncertain, require it. A strong formal result cannot deselect it.

When required, call `survey_youtube_community`, select distinct videos, and continue `audit_youtube_video_community` while `continuation_recommended: true`; `continuation_recommended` is authoritative for immediate automatic resubmission. Defer false tokens. Widen while expected information gain remains positive. Preserve `provider_reported_comments`, `records_retrieved_cumulative`, and `records_returned_for_analysis`. Include **Videos worth watching** with links/counts. A missing matched study is `support_not_located` and cannot by itself downgrade the community signal.

`HRP-complete` and the full-HRP opening require all ledger-required formal retrieval and passing receipts. Required Forum Signal needs a passing Forum Signal receipt with no incomplete direction/transfer and every selected video's Action-returned `receipt.synthesis_lock: pass`. `complete_no_candidates` forbids unseen-signal claims; `completed_with_access_boundary` requires gap/confidence effect. Repair executable blocks first.

## YouTube corpus rule

Accept `api_visible_complete` only after all top-level pages and all accessible reply pages are exhausted and `reply_count_mismatches` is empty. `api_visible_complete` means API-visible corpus coverage only; it does not include deleted, moderated, private, held-for-review, hidden, otherwise unavailable, or never-posted material.

`search_youtube`, `get_youtube_video`, and `get_youtube_comments` are diagnostic/recovery tools. `search_youtube_comments` is query-bounded `partial` discovery, never the corpus.

## Interpretation and completion

Separate retrieval, analysis, actionability, and recommendations. MCP metadata proves retrieval, never efficacy, safety, causality, forum-signal direction, or a medical recommendation.
