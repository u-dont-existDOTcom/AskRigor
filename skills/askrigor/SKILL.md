---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

## Protocol gate

Load and verify Universal first.

1. Call `get_protocol_manifest` for `protocol: "universal"`.
2. Verify via `verify_protocol_integrity` using its returned SHA-256; stop-on-failure.
3. Call `load_protocol` for `protocol: "universal"`; read all canonical text.

Use Universal's loaded activation boundary. HRP applies to every health/research task unless both very simple and genuinely uncontroversial. Both conditions are required. If unclear, ask first.

For HRP, repeat that full sequence for `protocol: "hrp"` before analysis. HRP wins conflicts; Universal supplies compatible rules. Use HRP orchestration/approval; no second Universal preflight.

Build one applicability ledger from the complete operative texts. Execute/audit every triggered module. Claim compliance only after every applicable check passes; otherwise use an authorized bounded path.

Preserve every returned `access_status` literally: `complete`,`api_visible_complete`,`partial`,`abstract_only`,`metadata_only`,`comments_disabled`,`inaccessible`,`rate_limited`,`not_found`,`error`; preserve identifier/link/query/pagination provenance. Never convert a retrieval failure or access gap into negative evidence. Distinguish an exhausted zero-result search from an unsuccessful search; confidence-effect.

## Forum Signal routing

Use installed Project router before HRP; otherwise require Forum Signal when firsthand experience/implementation differences/tolerability/real-world outcomes/adherence/harms/discontinuation/patient decisions could plausibly affect the answer. Any personal or practical treatment decision (`good idea for me`, now versus wait or delay) requires it even if alternatives are unstated or population-level. Require treatment alternatives/avoiding replacement/avoiding joint replacement/avoiding surgery. A request to exclude forums limits execution, not applicability. Exceptions: simple definition or terminology; pure chemistry or mechanism with no real-world outcome or safety claim; emergency triage before stabilization; no meaningful user-experience corpus. If uncertain, require it; formal evidence cannot deselect it.

For treatment endorsement/choice/start-defer-sequence (`do you agree`), build an option-space ledger across plausible classes: named or prescribed treatment; proposed care; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; procedural/surgical. A request to omit alternatives limits execution, not applicability or the no-verdict gate. No verdict without realistic alternatives and nonaction risk.

Call `survey_youtube_community`; ≤6 general/exact/contrarian/benefit/failure/harm/discriminator searches: `how I cured/reversed/fixed my [condition]`, `what finally worked`. Hooks are not conclusions. Rewrite/use-cursor/new-batch if generic/redundant; widen while expected information gain is positive. Ledger query/direction; fingerprint(program/stage/outcome/horizon); surprise/value/independence/nonredundancy; rank/popularity≠credibility.

Shortlist: `get_youtube_video`→`get_youtube_transcript`; selected-track `api_visible_complete` or terminal boundary. Preserve status/language/auto/timestamps. Metadata/comments cannot establish creator content; transcript≠truth/efficacy. Separately call `audit_youtube_video_community`; continue while `continuation_recommended: true`, defer false tokens, seek replication/failure/harm. Preserve `provider_reported_comments`/`records_retrieved_cumulative`/`records_returned_for_analysis` and each Action receipt's `synthesis_lock`.

Audit exact intervention/comparator programs: components/dose/frequency/duration, supervision/adherence/cointerventions, stage/outcome/horizon; bound contrast; assess transportability; mismatch narrows inference; preop conservative≠postop rehab. Before `support_not_located`, separate exact-matched-outcome support from adjacent-human/mechanistic/grey/practitioner/community evidence; steelman without inflation. A formal gap alone cannot downgrade observed community signal.

**Videos worth watching**: transcript-verified exact/nonredundant; Action canonical link + timestamp/value/boundary. Comments separate; no padding. `HRP-complete`/full-HRP opening need formal retrieval, no unresolved material fingerprint/direction/transfer; passing receipts. `complete_no_candidates`: no unseen-signal claims; `completed_with_access_boundary`: gap/confidence effect.

Accept `api_visible_complete` after exhausting all top-level and accessible reply pages with empty `reply_count_mismatches`. It covers only the API-visible corpus, excluding deleted, moderated, private, held-for-review, hidden, unavailable, or never-posted material.

`search_youtube_comments` is query-bounded `partial`, never corpus.

Separate retrieval/analysis/actionability/recommendations; MCP metadata proves retrieval—not efficacy/safety/causality/forum-signal direction/medical recommendation.
