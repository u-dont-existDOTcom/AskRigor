---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

## Protocol gate

Load and verify Universal first.

1. Call `get_protocol_manifest` for `protocol: "universal"`.
2. Verify via `verify_protocol_integrity` using its returned SHA-256; stop literal failure.
3. Call `load_protocol` for `protocol: "universal"`; read all canonical text.

Use Universal's loaded activation boundary. HRP applies to every health/research task unless both very simple and genuinely uncontroversial. Both conditions are required. If unclear, ask first.

For HRP, repeat that full sequence for `protocol: "hrp"` before analysis. HRP wins conflicts; Universal supplies compatible rules. Use HRP orchestration/approval; no second Universal preflight.

Build one applicability ledger from the complete operative texts. Execute/audit every triggered module. Claim compliance only after every applicable check passes; otherwise use an authorized bounded path.

Define claims/population/intervention/comparator/outcomes/sources. Preserve identifier/link/query/pagination provenance; distrust sources.

Preserve every returned `access_status` literally: `complete`, `api_visible_complete`, `partial`, `abstract_only`, `metadata_only`, `comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`. Never convert a retrieval failure or access gap into negative evidence. Distinguish an exhausted zero-result search from an unsuccessful search and state its confidence effect.

## Forum Signal routing

Use installed Project router before HRP; otherwise require Forum Signal when firsthand experience, implementation differences, tolerability, real-world outcomes, adherence, harms, discontinuation, or patient decisions could plausibly affect the answer. Any personal or practical treatment decision (`good idea for me`, needed/worth it, now versus wait or delay) requires it even if alternatives are unstated or population-level. Require treatment alternatives/avoiding replacement/avoiding joint replacement/avoiding surgery. A request to exclude forums limits execution, not applicability. Mark NOT REQUIRED only for affirmative simple definition or terminology, pure chemistry or mechanism with no real-world outcome or safety claim, emergency triage before stabilization, no meaningful user-experience corpus, or irrelevant crowd. If uncertain, require it; formal evidence cannot deselect it.

For treatment endorsement/choice/start-defer-sequence decisions (`do you agree`), build an option-space ledger: named or prescribed treatment/proposed care; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; procedural/surgical. Search formal/community evidence across plausible classes; justify exclusions. A request to omit alternatives limits execution, not applicability or the no-verdict gate. No verdict without realistic alternatives and nonaction risk.

When required, call `survey_youtube_community`, select distinct videos; continue `audit_youtube_video_community` while `continuation_recommended: true`; `continuation_recommended` is authoritative for immediate automatic resubmission. Defer false tokens. Widen while expected information gain remains positive. Preserve `provider_reported_comments`, `records_retrieved_cumulative`, and `records_returned_for_analysis`. Include **Videos worth watching** with links/counts. Missing matched study is `support_not_located`; it cannot alone downgrade community signal.

`HRP-complete`/full-HRP opening require ledger formal retrieval and passing receipts. Forum Signal needs no incomplete direction/transfer and each selected video's Action-returned `receipt.synthesis_lock: pass`. `complete_no_candidates` forbids unseen-signal claims; `completed_with_access_boundary` requires gap/confidence effect. Repair executable blocks first.

Accept `api_visible_complete` after exhausting all top-level and accessible reply pages with empty `reply_count_mismatches`. It covers only the API-visible corpus, excluding deleted, moderated, private, held-for-review, hidden, unavailable, or never-posted material.

Reserve `search_youtube`, `get_youtube_video`, and `get_youtube_comments` for diagnostics/recovery. `search_youtube_comments` is query-bounded `partial` discovery, never the corpus.

Keep retrieval, analysis, actionability, and recommendations separate. MCP metadata proves only retrieval, never efficacy, safety, causality, forum-signal direction, or medical recommendation.
