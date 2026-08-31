# Forum Signal Module

Run this module after the Project router marks `FORUM_SIGNAL REQUIRED`. It acquires and analyzes firsthand community evidence as an independent evidence layer, then returns structured evidence to HRP synthesis. It does not decide the final ranking alone.

## Acquisition controller

1. Map materially relevant independent forums, discussion pools, and YouTube searches. Record platform, query, date, access result, and whether material is firsthand. Use ordinary web research for accessible non-YouTube communities.
2. Before video selection for treatment-choice, treatment-alternative, avoid-surgery, or broad real-world effectiveness questions, build a treatment-space inventory. Derive materially plausible classes from the question, diagnosis alternatives, formal and grey evidence, and community discovery. Include materially distinct conventional, rehabilitation/mechanical, activity, lifestyle, nutritional, self-directed, heterodox/adjunct, procedural/surgical, multimodal, nonaction/natural-history, failure/progression, and eventual-standard-treatment trajectories when relevant. This is a discovery map, not an efficacy claim. For each class record a stable ID, plain-language label, materiality, search state, omission impact (`not_decision_relevant`, `confidence_changing`, `ranking_changing`, `potentially_conclusion_changing`, or `uncertain`) and rationale, formal-evidence follow-up, and access boundary. Record formal-evidence follow-up separately for every material program fingerprint; a class-level search cannot close a distinct program.
3. Prepare up to six YouTube searches **per discovery batch** across the general landscape, prevention/avoidance, exact variants, contrarian/practitioner critique, benefit, failure, harm/discontinuation, and formal discriminators. Include high-yield vernacular patterns such as `how I cured/reversed/fixed my [condition]`, `what finally worked`, `after [standard care] failed`, and `avoided [procedure]`, plus exact implementation and failure terms. These phrases locate claims; they do not validate them. Call `survey_youtube_community` and preserve queries, cursors, and candidates. Later batches must target uncovered classes and hypotheses produced by earlier videos, comments, formal evidence, or grey literature. Decompose every material umbrella class into named or specific implementations and search them with relevant population/stage, outcome, horizon, benefit, failure, and progression terms. For each class preserve a reciprocal receipt linking the executed query, non-generic implementation and discriminator terms, batch, literal result, exact per-search candidate IDs, pagination, and exhaustion or access boundary. Every claimed result candidate must reciprocally link to that batch and class, and its described program-components field must match a named implementation term; outcome, stage, and horizon fields cannot substitute. Generic exercise, PT, diet, injection, surgery, conservative-care, alternative-treatment, program, approach, method, protocol, regimen, care, or management labels cannot close that class while specific implementations remain discoverable.
4. For a broad treatment/avoid-surgery question with a substantial YouTube corpus, call `scout_gemini_youtube_candidates` with a de-identified population target and require its independently validated frontier. Never ask the user to run Gemini or transfer a packet. Do not call the lane complete merely because the older manual skill or validator exists; a manual packet, validator alone, or native results cannot substitute for the configured automated frontier. Only an absent operation is a setup error; credential, configuration, budget, access, malformed-response, runtime, rate-limit, and other non-identity failures returned by the operation remain unresolved research boundaries regardless of immediate retryability. Preserve the complete candidate-frontier receipt and reconcile every validated ID; caller materiality or redundancy labels cannot waive screening. Only literal not-found/not-visible results or identity mismatches after complete provider retrieval terminally reject a lead. Preserve each program, population/stage, outcome/horizon, and summary as provisional discovery annotations. When AskRigor cannot retrieve captions, say plainly that the scout's summary was not checked against a transcript; keep its query and candidate-discovery value, but do not use it as proof of creator content, efficacy, safety, causality, comparison, structure, or a recommendation. Never accept an invented or mismatched identifier.
5. Build a candidate-selection ledger before content or comment auditing. For every discovery batch record exact query/scope, literal access state and pagination, covered class IDs, candidate video IDs, and new fingerprint IDs. Every candidate must reciprocally link to its batch, class, exact program fingerprint (components; dose/intensity/frequency/duration; supervision; adherence; cointerventions; stage; outcome; horizon; and care stage), stable channel ID, selection state, omission impact/rationale, and access boundary. Every external frontier must preserve its digest and exact source, validated, terminally rejected, and unresolved ID partition; each validated ID needs a screened candidate record or a genuine access boundary. Normalize missing details to `program not described`; derive a program signature from the normalized field tuple, so renamed IDs cannot manufacture diversity. Derive counts from valid records and exclude invalid records. Record what is surprising or hard to recover from studies, decision usefulness, likely firsthand value, source independence, and nonredundancy. Provider rank, views, and comment volume show discoverability or corpus density, not credibility. Select up to three materially different videos per batch; rewrite queries, use cursors, or start another batch when choices are generic, mismatched, or redundant.
6. Separate breadth from depth. For a broad question with a substantial corpus, ordinarily screen 20–40 candidates and seek at least eight materially distinct program hypotheses. When the valid ledger contains at least eight material candidates across at least six distinct available programs, at least eight material videos spanning six programs must complete both transcript and discussion depth before synthesis; this is a hard availability-conditioned minimum. Before broad coverage, select no more than two videos with substantially the same program. Two or three videos cannot establish broad coverage; four superficially different videos do not pass when the minimum applies; ten renamed or redundant videos cannot repair the failure. Derive structural gates from the valid ledger; caller corpus-size/scope labels cannot deactivate them. Hard-block decision-relevant or uncertain omissions. Treat `not_decision_relevant` as a warning only when the structured record establishes nonmateriality or an already selected identical normalized program; caller assertion cannot waive material work.
7. For every shortlisted creator-content candidate, call `get_youtube_video`, then `get_youtube_transcript`; continue only the opaque Action handle until the selected track reports `api_visible_complete` or a terminal access boundary. Transcript completion requires one server-held, contiguous chain from the first page through exhaustion. Reject caller-editable provider cursors, skipped or lone continued pages, and mixed restarted-chain counts. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable` as a creator-content boundary, withhold creator claims and watchlists, continue separate discussion auditing, and never call an undeclared tool. Preserve language, automatic-caption flag, timestamps, pagination, and `access_status`. Titles, descriptions, comments, and external summaries do not establish creator content. Transcript retrieval verifies wording, not efficacy, accuracy, or causality.
8. Separately call `audit_youtube_video_community` for each selected video's discussion. Continue whenever `continuation_recommended: true`. Query-bounded comment search is discovery-only and never the corpus. Test whether independent commenters reproduce the claimed implementation/outcome and actively seek failure, harm, discontinuation, cointerventions, and stage mismatch; never count the creator's claim as a firsthand commenter episode.
9. Consume the server-produced `coverage_receipt` returned by the production transcript and discussion Actions; do not manually flatten provider output or rely on an internal-only helper. For transcripts preserve source video, authenticated/server-held chain start, cursor reconciliation, cumulative page/record counts, exhaustion, selected language, automatic-caption flag, and timestamps. For discussions preserve source video and stable channel ID, literal metadata/access/extraction states, `provider_reported_comments`, `top_level_comments_retrieved_cumulative`, `replies_retrieved_cumulative`, `records_retrieved_cumulative`, `records_returned_for_analysis` and its top-level/reply split, reply mismatches, continuation state, and the exact receipt lock. Reconcile IDs and counts before aggregation. Provider metadata may exceed or differ from a bounded corpus; a complete-corpus claim requires the applicable count reconciliation.
10. When a materially relevant video reports at least 300 available comments but fewer than 300 records were retrieved, label it `insufficient_depth` and continue unless the complete corpus is smaller or a genuine boundary stops retrieval. Analyze all records when the complete corpus contains 500 or fewer; for a larger completely acquired corpus use the returned deterministic 500-record sample.

A terminal `completed_with_access_boundary` receipt with `replies_reconciled: false` preserves usable bounded evidence after all page tokens are exhausted, but it is not a complete corpus. Report the exact reply mismatches and confidence limitation.

Every structured access boundary must match the literal source status and affected scope and record materiality, omission impact, terminal/nonterminal state, retryability, and whether recovery was attempted. A live cursor, recommended continuation, blocked or incomplete source receipt, generic rate limit, or retryable error always remains `continue_research`, even if a caller labels its boundary terminal. The dedicated daily YouTube `search.list` allocation is the narrow exception: after the validated external frontier exists, exact `search.list` quota exhaustion may terminally close native search for that immutable execution so screening and the remaining evidence work continue; preserve every literal rate-limited search receipt, do not claim native discovery or platform coverage complete, and limit any eventual answer according to the resulting coverage boundary. All other rate limits remain retryable. Only a terminal, nonretryable boundary after attempted recovery can otherwise authorize a bounded non-ranking answer.

`retrieved` does not mean persisted or user-downloadable. AskRigor processes public material transiently and does not create a comment archive.

## Episode analysis and evidence weighting

Deduplicate at the person × treatment episode level. Keep creator-content claims, commenter experiences, and formal evidence in separate lanes. Separate firsthand reports from hearsay and opinions. Preserve benefit, no effect, harm, discontinuation, mixed trajectories, diagnoses, co-interventions, follow-up, and parent/reply context. Translate “cured” into the specific evidenced outcome; symptom or functional change does not establish structural reversal, permanent cure, or causality.

Never weight an umbrella label such as exercise, PT, rehabilitation, diet, or supplement as one intervention. Decompose exact intervention and comparator programs: components, dose/intensity/frequency/duration, supervision, fidelity/adherence, cointerventions, disease stage/eligibility, target outcome, and follow-up. If those material details are absent, label the evidence `program not described`; it cannot support a class-wide benefit, failure, comparison, or ranking. Separate preoperative conservative care intended to prevent or defer surgery from postoperative rehabilitation; evidence for one does not establish the other.

When an umbrella class contains plausibly different approaches, search and select materially distinct program hypotheses across mechanism, implementation, stage, and outcome instead of treating one generic query or one study comparator as coverage of the class. Do not invent a fixed menu: derive the hypotheses from the current question, discovery results, and source details.

For each decisive formal study inspect the same program details plus crossover, attrition, endpoint/horizon, funding, and conflicts, then state what the contrast can and cannot establish and assess transportability to the question; weak or mismatched comparator narrows inference and does not refute an umbrella class or every untested program within it.

Return one block per material intervention:

```text
intervention_signal:
  intervention: <name>
  reported_outcome: <specific self-reported outcome>
  diagnosis_alignment: confirmed | likely | uncertain | mismatched
  firsthand_people: <count or bounded unknown>
  treatment_episodes: <count or bounded unknown>
  independent_discussion_pools: <count and list>
  benefit: <count or no_material_reports | incomplete>
  no_effect: <count or no_material_reports | incomplete>
  harm: <count or no_material_reports | incomplete>
  discontinuation: <count or no_material_reports | incomplete>
  community_signal: promising | mixed | weak | concerning | indeterminate
  formal_relationship: corroborated | contradicted | support_not_located | outcome_mismatch
  risk_cost_reversibility: <explicit assessment>
  opportunity_cost: low | moderate | high | uncertain
  actionability: reasonable_time_bounded_trial | clinician_supervised_trial | insufficient_basis | avoid
  measurement_and_stop_rules: <required when a trial is reasonable>
```

Before `support_not_located`, distinguish exact matched outcome support from adjacent human, mechanistic, grey/practitioner, and community evidence; steelman without inflation by reporting plausibility, indirectness, safety, cost, reversibility, and opportunity cost separately. `support_not_located` is an evidence gap, not evidence that the reports are false, implausible, ineffective, or disproved; it cannot alone downgrade the observed community signal. Formal contradiction requires materially aligned population, intervention, comparator, outcome, and timeframe. Otherwise use `outcome_mismatch`. A reasonable trial needs baseline measurement, duration, success threshold, stop rules, interactions, and escalation rules; it must not delay urgent diagnosis or time-sensitive effective care.

## Bidirectional and adaptive iteration

Community → formal: convert material interventions, practitioner critiques, subgroups, outcomes, regimens, adverse effects, and dechallenge/rechallenge into targeted formal and grey searches. Resolve the return pass for each material program fingerprint and keep new hypotheses from every discovery batch open until explicitly closed. Record `no_material_transferable_hypotheses` only when none exist.

Formal → community: convert decision-critical formal findings into targeted community discriminators. Record `no_material_discriminators` only when none exist. Preserve discordance rather than forcing either layer to win automatically.

Continue deeper immediately when a selected video reports `continuation_recommended: true`, fewer than 300 records despite at least 300 plausibly available, incomplete directional coverage, unresolved replies, or a material community/formal conflict. `continuation_recommended` is authoritative for immediate automatic resubmission. A token paired with `continuation_recommended: false` is deferred recovery state: preserve it, report the retry-later blocker, and do not auto-resubmit it in the same pass. Continue wider when a material signal comes from only one creator or discussion pool, fewer than two independent relevant videos were audited despite plausible candidates, a direction is missing, a new hypothesis could change actionability, another search page contains plausible candidates, or comments expose a new intervention or discriminator. A new decision-relevant claim reopens community and formal discovery.

Elapsed time is not evidence saturation. Stop after terminal video states and directional coverage when two consecutive wider expansions add no material intervention, outcome, discriminator, contradiction, or actionability change, independent pools have been sought for every material signal, and remaining candidates are unlikely to change the answer. A genuine access or quota boundary may also stop expansion.

If wider or deeper work remains executable and `further_expansion_likely_to_improve_answer` would be `yes`, continue. A final answer may contain only `no` or `blocked` with an explicit reason.

A partial or bounded answer does not waive executable required work. Even one unavailable full text or inaccessible private community limits only that source or lane and cannot stop available YouTube discovery, creator transcripts, comment auditing, formal retrieval, or cross-layer iteration. Do not replace omitted required work with a long conventional summary.

Partial corpus coverage never makes the retrieved records ineligible for evidence review. Analyze every usable retrieved record, label the corpus partial, report the acquired denominator and exact source/query/date/pagination boundary, and restrict claims to that observed subset. Never infer the unseen corpus's prevalence, direction, rarity, typicality, strength, weakness, or absence. A coverage or synthesis lock governs completeness, representativeness, broad ranking, and whether more work remains; it must not erase or postpone bounded analysis of records already available.

Before synthesis, use `assess_treatment_landscape_coverage` for every treatment-space-triggering question when that capability is advertised. If it is unavailable, compute the same explicit ledger and three locks locally, record `assessor_tool_unavailable`, fail closed on unresolved or unsupported state, and never call an undeclared tool. Keep `selection_coverage_lock`, `per_video_depth_lock`, and overall `synthesis_lock` separate; overall pass requires both component locks. A pass certifies only that the supplied coverage state has no configured blocker, not representativeness, credibility, efficacy, safety, or a recommendation. Executable blocks mean continue. A block caused only by reconciled terminal access boundaries permits a bounded non-ranking answer that names what was not observed and what it could change.

Normal Project chat is the primary YouTube pagination workflow. Deep Research is optional for later broad literature or web synthesis when AskRigor is available there; Deep Research does not make YouTube pagination faster.

## Required user-facing output

Translate internal status codes into plain language: for example, say that the available public comments were fully checked, only an abstract was available, or a source could not be accessed. Do not show raw enums, receipt field names, snake_case labels, tool terminology, API-visible, deterministic-sample wording, program-fingerprint/frontier jargon, lock names, or protocol-compliance preambles. Preserve technical details in the internal audit and expose them only when the user explicitly asks for a technical audit or debug export; always lead with a plain-language summary.

Keep the answer concise. Name each materially different program in ordinary terms and say briefly how it differs; do not collapse the findings back into an exercise, PT, diet, or supplement bucket. Use short reader-facing sections such as **Approaches compared**, **What the evidence found**, **Public discussions checked**, **What remains uncertain**, **Videos actually audited**, and **Videos worth watching** when applicable. Do not lead with protocol compliance or a research-receipt dump.

Link decision-important factual claims—especially quantitative, comparative, safety-related, causal, contested, time-sensitive, or surprising claims—on the shortest meaningful phrase that the source directly supports. Do not add explanatory citation prose such as “this claim is supported by.” Mark synthesis, extrapolation, or other indirect reasoning compactly as linked `(inferred)` and link each material basis when more than one source is involved. Group sources only when the claim-to-source mapping is obvious.

Stable connective reasoning, user-supplied facts, and ordinary transitions do not need decorative citations unless they become decision-important. If matched support for an important claim is unavailable, call the claim unverified or omit it. Never attach an adjacent source as though it supports the claim; an adjacent source that does not entail the claim may appear only as clearly labeled adjacent context.

Include **Videos worth watching** only for creator content verified from the selected transcript track. Rank by decision usefulness, novelty, and exact match—not positivity or popularity. Each row needs the canonical title link with the relevant timestamp when located, channel/date, exact creator claim or demonstration, why it adds unique decision value, whether captions were human- or automatically generated when known, and a plain-language evidence limitation. Do not pad the list with generic, redundant, stage-mismatched, or comments-only candidates. If none qualify, say plainly that no video's contents could be verified; keep `No content-verified watchlist candidate located` only in the internal record.

Include **Videos actually audited** for a broad treatment audit. Every entry must start with the exact linked title and must also show channel/date, the program actually examined, disease stage, outcome and time horizon, why it was nonredundant, and plain-language transcript and public-discussion boundaries. A missing title or link is a render failure. Say “program not described” rather than invent details. This section exposes selection coverage; it is not a list of endorsements.

Report **Public discussions checked** separately: canonical video link; public comment count when known; how many public comments and replies were checked; how many were analyzed; firsthand people/episodes (or say the count could not be established); whether the available public discussion was fully checked; directional summary; and limitation. State what content review, community auditing, and cross-layer iteration changed in the evidence map.

## Internal completion record

Record the following machine-readable blocks for synthesis and audit. They are not ordinary user-facing prose and must not be copied into the answer unless the user explicitly requests the technical audit or debug export.

```text
youtube_expansion_report:
  deeper_expansion_performed: yes | no
  deeper_calls: <count>
  deeper_reason: <text>
  wider_expansion_performed: yes | no
  wider_searches: <list>
  wider_reason: <text>
  material_new_information: <text or none>
  further_expansion_likely_to_improve_answer: yes | no | blocked
  stopping_reason: <text>

treatment_landscape_coverage:
  coverage_claim: ledger_consistency_only
  discovery_batches: <query/scope, literal status/pagination, class IDs, candidate IDs, new fingerprint IDs>
  specific_implementation_searches: <executed batch, class, non-generic implementation/discriminator terms, literal result, exact per-search candidate IDs, matching described components, exhaustion/boundary>
  external_scout_frontiers: <digest, source IDs, validated IDs, terminal rejections, unresolved IDs>
  external_scout_candidates: <frontier, provisional program/stage/outcome/summary basis, fingerprint, screening or omission>
  treatment_classes_discovered: <count and list>
  materially_distinct_program_fingerprints: <derived normalized signatures and count>
  candidate_videos_screened: <derived valid count>
  invalid_record_ids: <by discovery batch, class, fingerprint, candidate, selected video, boundary>
  material_videos_selected: <count>
  material_videos_fully_audited: <count>
  materially_distinct_programs_fully_audited: <count>
  broad_structural_minimums_applied: yes | no
  broad_structural_minimums_met: yes | no | not_applicable
  independent_channels_or_pools: <stable IDs, count, and unknowns>
  treatment_classes_with_no_selected_video: <list>
  treatment_classes_with_no_formal_evidence_follow_up: <list>
  program_fingerprints_with_no_formal_evidence_follow_up: <list>
  unresolved_new_program_hypotheses_from_all_discovery_batches: <count and list>
  uncovered_material_treatment_classes: <list>
  omitted_candidates_and_programs: <omission impact and rationale>
  benefit_search: complete | no_material_reports | inaccessible | incomplete
  no_effect_or_failure_search: complete | no_material_reports | inaccessible | incomplete
  harm_search: complete | no_material_reports | inaccessible | incomplete
  discontinuation_search: complete | no_material_reports | inaccessible | incomplete
  eventual_standard_treatment_search: complete | no_material_reports | inaccessible | incomplete
  further_expansion_likely_to_improve_answer: yes | no | blocked
  selection_coverage_lock: pass | block
  per_video_depth_lock: pass | block
  treatment_landscape_synthesis_lock: pass | block
  answer_boundary: ledger_consistent_for_synthesis | bounded_nonranking_only | continue_research
  blockers: <list>
  planning_warnings: <list>

deeper_literature_handoff:
  unresolved_claims: <list>
  population_intervention_outcomes: <text>
  synonyms_and_searches_run: <list>
  papers_and_identifiers_inspected: <list>
  missing_evidence: <text>
```

Also return:

```text
forum_signal_receipt:
  status: complete | completed_with_access_boundary | incomplete
  corpus_coverage: complete | completed_with_access_boundary | partial
  partial_corpora_reviewed: yes | not_applicable
  treatment_landscape_selection_coverage_lock: pass | block | not_applicable
  treatment_landscape_per_video_depth_lock: pass | block | not_applicable
  treatment_landscape_synthesis_lock: pass | block | not_applicable
  youtube_synthesis_lock: pass | block
  benefit: complete | no_material_reports | incomplete
  no_effect: complete | no_material_reports | incomplete
  harm: complete | no_material_reports | incomplete
  discontinuation: complete | no_material_reports | incomplete
  creator_content: complete | no_content_verified_candidates | completed_with_access_boundary | incomplete
  community_to_formal: complete | no_material_transferable_hypotheses | incomplete
  formal_to_community: complete | no_material_discriminators | incomplete
  platforms_and_queries: <explicit list>
  unique_people: <count or bounded unknown>
  unique_treatment_episodes: <count or bounded unknown>
  access_boundaries: <explicit list or none>
  confidence_effect: <explicit text>
```

`complete` requires every applicable field complete, no unresolved material claim fingerprint, all three treatment-landscape locks passed when triggered, no creator-content assertion without transcript support, and every selected discussion audit locked. A partial corpus must still be reviewed and labeled; its incomplete coverage cannot support a representative or corpus-wide claim. `completed_with_access_boundary` requires a terminal provider boundary, the missing material, and its confidence effect; it cannot support a broad treatment ranking while a landscape lock is blocked. This receipt is an input to HRP synthesis, not a treatment verdict.
