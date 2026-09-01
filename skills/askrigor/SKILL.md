---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

## Research access and shared learning

Before any ordinary research call, call `manage_research_access` with
`action: "inspect"`. If the result is `UNENROLLED` or `REVOKED`, show the exact
returned notice and ask the user to choose one of these real options:

- accept free contributor mode; or
- use paid private mode if this account already has a verified entitlement.

Never infer agreement from the research request, continued conversation,
silence, prior use, or a general acceptance of site terms. Never claim that a
price or checkout exists. Call `accept_free_contributor` only after the user
explicitly chooses it, with the returned notice version and all four agreement
fields true. Call `activate_paid_private` only when the user chooses it; if the
server reports no entitlement, explain that private access is not currently
available for that account and do not use research tools. `revoke` stops later
research access and withdraws still-pending proposals.

Free contributor mode permits AskRigor to learn from eligible deidentified
structured research progress. It never permits submission of raw chat, prompts,
identity/contact details, private health narratives, uploads, raw source or
provider bodies, credentials, or YouTube/community data. Paid private mode
submits no shared contribution.

At the end of eligible free-mode work, submit the strict formal research
frontier with its exact coverage, candidate decisions, partial state, and open
trails. Submit every complete performed source-bound study/review analysis to
the extent actually performed, including limitations and future-analysis items.
Use `submit_research_contribution`; never invent missing fields or reconstruct
analysis from memory. A returned pending proposal is not canonical evidence,
does not establish a conclusion, and must not be presented as accepted merely
because it was submitted. Preserve partial corpora as usable and label them
partial. If no eligible structured formal-research proposal exists, submit
nothing.

## Protocol gate

Load Universal first: `get_protocol_manifest` → `verify_protocol_integrity` (SHA-256; stop-on-failure) → every `load_protocol` chunk. Use its activation boundary. HRP applies unless the health/research task is both very simple and genuinely uncontroversial; if unclear, ask.

For HRP repeat the sequence with `protocol: "hrp"`. HRP wins conflicts; Universal supplies compatible rules. Use one orchestration/approval and applicability ledger. Execute every triggered module; claim compliance only after all checks pass, otherwise use an authorized bounded path.

Internally preserve exact `access_status`: `complete`,`api_visible_complete`,`partial`,`abstract_only`,`metadata_only`,`comments_disabled`,`inaccessible`,`rate_limited`,`not_found`,`error`. Failure/access gaps are not negative evidence; distinguish exhausted zero results from failed search.

Without a trusted frontier/question/topic selector, call `search_research_frontiers` with deidentified wording, then use only its selector in `get_research_frontier`; never guess. Both return control, not evidence or answers. History=lineage. Inspect windows/gaps/trails and recheck currentness before deltas. `no_match`/`not_indexed` is not negative evidence. Disclose failures; read-only calls save nothing.

## Forum Signal routing

Use installed Project router before HRP; otherwise require Forum Signal whenever firsthand evidence could affect the answer. A personal or practical treatment decision (`good idea for me`; now versus wait or delay), treatment alternatives, avoiding replacement, joint replacement, or avoiding surgery requires it even if alternatives are unstated or population-level. A request to exclude forums limits execution, not applicability. Exceptions: simple definition or terminology; pure chemistry or mechanism with no real-world outcome or safety claim; emergency triage before stabilization; no meaningful user-experience corpus. If uncertain, require it; formal evidence cannot deselect it.

For treatment endorsement/choice/start-defer-sequence (`do you agree`), build an option-space ledger across plausible classes: named or prescribed treatment; proposed care; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; procedural/surgical. A request to omit alternatives limits execution, not applicability or the no-verdict gate. No verdict without realistic alternatives and nonaction risk.

For broad treatment/avoid-surgery, map classes before video selection. Never pool “exercise,” PT, diet, injections, or conservative care. Fingerprint components; dose/intensity/frequency/duration; supervision/adherence/cointerventions; stage/outcome/horizon; and pre-/postoperative care stage. Missing=`program not described`. Mismatched comparators narrow inference; no class-wide benefit/failure/ranking follows.

Per batch call `survey_youtube_community` with ≤6 general/exact/contrarian/benefit/failure/harm/discriminator queries; “how I cured/reversed/fixed” and “what finally worked” are hooks, not claims. Rewrite/use cursors/new batches while information gain is positive. Broad results require `scout_gemini_youtube_candidates`; validate every lead. Planning heuristics, not quotas: screen 20–40 candidates/≥8 materially distinct program hypotheses. A valid ≥8-candidate/≥6-program ledger blocks ranking below 8 audited videos/6 programs. Two/three videos cannot establish broad coverage; caller corpus-size/scope labels cannot waive them.

`get_youtube_video`→`get_youtube_transcript`; require a contiguous first-to-exhausted chain and its opaque Action handle. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable`, withhold creator claims/watchlist, and never call an undeclared tool. Metadata/comments cannot establish creator content. Call `audit_youtube_video_community`; consume its coverage receipt, continue while `continuation_recommended: true`, and defer false tokens.

Review every usable record from a partial corpus and label it partial; bound claims to the retrieved subset/window. Coverage locks govern completeness, representativeness, prevalence, and broad ranking—not evidence eligibility. Continue retrieval; never discard observed records because coverage is unfinished or characterize unseen records.

Comments↔formal reopen discovery. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation; gaps cannot erase signal. Call `assess_treatment_landscape_coverage` when advertised; otherwise record `assessor_tool_unavailable` and fail closed. Keep selection, video-depth, and overall locks separate. Only terminal nonretryable boundaries permit bounded non-ranking output. Full HRP needs all locks, audits, formal returns, and transfers resolved.

Decision-important DOI: exhaust `acquire_open_full_text`; call `validate_study_method_audit`/`validate_review_method_audit`; audit methods/results/harms/missing-data/conflicts/flexibility/reproducibility/replication/claim-limits. Until validated, use inspected citation/abstract facts; unseen content is a lead. Expired handle: reacquire; never combine chains.

**Videos actually audited**: linked title, channel/date, program, value, and plain-language boundary. **Videos worth watching** need transcript-verified link/timestamp/value/boundary. Accept `api_visible_complete` only after all accessible top-level/reply pages; it excludes deleted, moderated, private, hidden, unavailable, and never-posted material. `search_youtube_comments` is query-bounded `partial` discovery.

A partial or bounded answer does not waive executable required work; one unavailable full text or inaccessible private community cannot stop it. Translate internal status codes into plain language; expose codes only when the user explicitly asks for a technical audit or debug export. Metadata proves retrieval, not efficacy, safety, causality, or recommendation.

Link decision-important quantitative/comparative/safety/causal/contested/time-sensitive/surprising claims on the shortest meaningful phrase without citation prose. Mark synthesis `(inferred)` and link each material basis; one link may cover grouped claims when mapping is obvious.
