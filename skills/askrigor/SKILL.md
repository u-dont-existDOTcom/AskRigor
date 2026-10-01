---
name: askrigor
description: Run AskRigor with canonical protocols, provenance/access boundaries, and completion audits.
---

# AskRigor

## Research access and shared learning

Before any research call, call `manage_research_access` with
`action: "inspect"`. If the result is `UNENROLLED` or `REVOKED`, show the exact
returned notice and ask the user to choose one of these real options:

- accept free contributor mode; or
- use paid private mode if this account already has a verified entitlement.

Never infer agreement from the research request, continued conversation,
silence, prior use, or general acceptance of site terms. Never claim that a
price or checkout exists. Call `accept_free_contributor` only after the user
explicitly chooses it, with the returned notice version and all four agreement
fields true. Call `activate_paid_private` only when the user chooses it; if the
server reports no entitlement, explain that private access is unavailable for
that account and do not use research tools. `revoke` stops
research access and withdraws still-pending proposals.

Free contributor mode permits AskRigor to learn from eligible deidentified
structured research progress. It never permits submission of raw chat, prompts,
identity/contact details, private health narratives, uploads, raw source or
provider bodies, credentials, or YouTube/community posts, commenters, links or
video IDs. Paid private mode submits no shared contribution.

At the end of eligible free-mode work, submit the strict formal research
frontier with its exact coverage, candidate decisions, partial state, and open
trails. Submit every complete performed source-bound study/review analysis to
the extent actually performed, including limitations and future-analysis items.
Use `submit_research_contribution`; never invent missing fields or reconstruct
analysis from memory. A pending proposal is not canonical evidence;
never present it as accepted. Preserve partial corpora as usable and label them
partial. If no eligible structured formal-research proposal exists, submit
nothing.

For an authenticated allowlisted owner's proposal review, call
`review_research_contribution` and inspect the exact payload/hash first. Accept
or reject only on explicit instruction with a concise reason.
`accepted_pending_promotion` is a hash-bound one-shot promotion instruction,
not a canonical write or scientific validation. Use `status` to confirm its
exact receipt. Never expose or infer contributor identity.

## Protocol gate

Before the final answer, call `finalize_research` with every `research_receipt`, the `research_target` all discovery used, the studies your conclusions depend on, and a `findings_card` of the answer's best findings. On `not_ready`, do its next steps; otherwise copy its `caveats`. If they offer a save, call `save_research_findings` only after the user says yes. Never claim a step the server did not verify.

Load Universal first: `load_protocol` with `section: "index"`, then core sections and any that apply. Use its activation boundary. HRP applies unless the health/research task is both very simple and genuinely uncontroversial; if unclear, ask.

For HRP repeat the sequence with `protocol: "hrp"`, loading each section whose purpose or activation applies before the step that uses it. HRP wins conflicts; Universal supplies compatible rules. Use one orchestration/approval and applicability ledger. Execute every triggered module; claim compliance only after all checks pass, otherwise use an authorized bounded path.

Internally preserve exact `access_status`: `complete`,`api_visible_complete`,`partial`,`abstract_only`,`metadata_only`,`comments_disabled`,`inaccessible`,`rate_limited`,`not_found`,`error`. Failure/access gaps are not negative evidence; distinguish exhausted zero results from failed search.

Without a trusted frontier/question/topic selector, call `search_research_frontiers` with deidentified wording, then use only its selector in `get_research_frontier`; never guess. Both return control, not evidence. Inspect windows/gaps/trails and recheck currentness before deltas. `no_match`/`not_indexed` is not negative evidence. Disclose failures.

## Forum Signal routing

Use installed Project router before HRP; otherwise require Forum Signal whenever firsthand evidence could affect the answer. A personal or practical treatment decision (`good idea for me`; now versus wait or delay), treatment alternatives, avoiding replacement, joint replacement, or avoiding surgery requires it even if alternatives are unstated or population-level. A request to exclude forums limits execution, not applicability. Exceptions: simple definition or terminology; pure chemistry or mechanism with no real-world outcome or safety claim; emergency triage before stabilization; no meaningful user-experience corpus. If uncertain, require it; formal evidence cannot deselect it. Search the dominant and an independent community (subreddits, forums, groups via web search); YouTube receipts cover YouTube only.

For treatment endorsement/choice/start-defer-sequence (`do you agree`), build an option-space ledger across plausible classes: named or prescribed treatment; proposed care; diagnosis alternatives; nonaction/natural history; conventional nonsurgical; lifestyle/rehab/mechanical; relevant heterodox/adjunct; procedural/surgical. A request to omit alternatives limits execution, not applicability or the no-verdict gate. No verdict without realistic alternatives and nonaction risk. First passes still briefly cover every class and red flag.

For broad treatment/avoid-surgery, map classes before video selection. Never pool “exercise,” PT, diet, injections, or conservative care. Fingerprint components; dose/intensity/frequency/duration; supervision/adherence/cointerventions; stage/outcome/horizon; and pre-/postoperative care stage. Missing=`program not described`. Mismatched comparators narrow inference; no class-wide benefit/failure/ranking follows.

Per round call `scout_gemini_youtube_candidates` (condition, goal); after comment audits pass comment-named remedies/videos/creators as `rediscovery_leads`. `survey_youtube_community` (≤6 general/exact/contrarian/benefit/failure/harm/discriminator queries) is the fallback. “how I cured/reversed/fixed” and “what finally worked” are hooks, not claims. Rewrite/use cursors/new batches from new angles while information gain is positive; validate leads. Planning heuristics, not quotas: seek materially distinct program hypotheses; first pass stops at saturation, ~3 audited videos or ~2 rounds, then offers study/community focuses; deep runs to saturation. Two/three videos cannot establish broad coverage; caller corpus-size/scope labels cannot waive them.

`get_youtube_video`→`get_youtube_transcript`; require a contiguous first-to-exhausted chain and its opaque Action handle. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable`, label creator claims unverified, and never call undeclared tools. Metadata/comments cannot establish creator content. Call `audit_youtube_video_community`; consume its coverage receipt, continue while `continuation_recommended: true`, and defer false tokens.

Review every usable record from a partial corpus and label it partial; bound claims to the retrieved subset/window. Coverage locks govern completeness, representativeness, prevalence, and broad ranking—not evidence eligibility. Continue retrieval; never discard observed records because coverage is unfinished or characterize unseen records.

Comments↔formal reopen discovery. Before `support_not_located`, separate matched/adjacent evidence and steelman without inflation; gaps cannot erase signal. Deep research calls `assess_treatment_landscape_coverage` when advertised, else `assessor_tool_unavailable`, failing closed. Keep selection, video-depth, and overall locks separate. Only terminal nonretryable boundaries permit bounded non-ranking output. Full HRP needs all locks, audits, formal returns, and transfers resolved.

Decision-important DOI: exhaust `acquire_open_full_text`; call `validate_study_method_audit`/`validate_review_method_audit`; audit methods/results/harms/missing-data/conflicts/flexibility/reproducibility/replication/claim-limits. Until validated, use inspected citation/abstract facts; unseen content is a lead.

**Videos actually audited**: linked title, channel/date, program, value, and plain-language boundary. **Videos worth watching** need transcript-verified link/timestamp/value/boundary. Accept `api_visible_complete` only after all accessible top-level/reply pages; it excludes deleted, moderated, private, hidden, unavailable, and never-posted material. `search_youtube_comments` is query-bounded `partial` discovery.

A partial or bounded answer does not waive executable required work; one unavailable full text or inaccessible private community cannot stop it. Translate internal status codes into plain language; expose codes only when the user explicitly asks for a technical audit or debug export. Metadata proves retrieval, not efficacy, safety, causality, or recommendation.

Link decision-important quantitative/comparative/safety/causal/contested/time-sensitive/surprising claims on the shortest meaningful phrase without citation prose. Mark synthesis `(inferred)` and link each material basis; one link may cover grouped claims when mapping is obvious.
