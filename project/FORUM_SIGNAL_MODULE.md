# Forum Signal Module

Run this module after the Project router marks `FORUM_SIGNAL REQUIRED`. It acquires and analyzes firsthand community evidence as an independent evidence layer, then returns structured evidence to HRP synthesis. It does not decide the final ranking alone.

## Acquisition controller

1. Map materially relevant independent forums, discussion pools, and YouTube searches. Record platform, query, date, access result, and whether material is firsthand. Use ordinary web research for accessible non-YouTube communities.
2. Prepare up to six YouTube searches across the general landscape, prevention/avoidance, exact variants, contrarian/practitioner critique, benefit, failure, harm/discontinuation, and formal discriminators. Include high-yield vernacular patterns such as `how I cured/reversed/fixed my [condition]`, `what finally worked`, `after [standard care] failed`, and `avoided [procedure]`, plus exact implementation and failure terms. These phrases locate claims; they do not validate them. Combine compatible directions within six searches. Call `survey_youtube_community` and preserve queries, cursors, and candidates.
3. Build a candidate-selection ledger before content or comment auditing. Record query/direction; the exact claim fingerprint (intervention/program components, dose/frequency/duration, population/stage, outcome, horizon); what is surprising or hard to recover from studies; decision usefulness; likely firsthand value; creator/discussion-pool independence; and nonredundancy. Provider rank, views, and comment volume show discoverability or corpus density, not credibility. Select up to three materially different videos per batch; rewrite queries, use cursors, or start another batch when choices are generic, mismatched, or redundant.
4. For every shortlisted creator-content candidate, call `get_youtube_video`. If `get_youtube_transcript` is available, call it and continue cursors until the selected track reports `api_visible_complete` or a terminal access boundary. If `get_youtube_transcript` is unavailable, record `transcript_tool_unavailable` as a terminal creator-content boundary, withhold creator claims and the watchlist, continue at step 5, and never call an undeclared tool. Preserve language, automatic-caption flag, timestamps, pagination, and `access_status` when returned. Titles/descriptions are discovery metadata; comments describe the discussion; neither establishes the video's creator content. If transcript access fails, do not say what the video teaches or recommends. Transcript retrieval verifies wording, not efficacy, accuracy, or causality.
5. Separately call `audit_youtube_video_community` for the video's discussion. Continue whenever `continuation_recommended: true`. Query-bounded comment search is discovery-only and never the corpus. Test whether independent commenters reproduce the claimed implementation/outcome and actively seek failure, harm, discontinuation, cointerventions, and stage mismatch; never count the creator's claim as a firsthand commenter episode.
6. Preserve `provider_reported_comments`, `top_level_comments_retrieved_cumulative`, `replies_retrieved_cumulative`, `records_retrieved_cumulative`, and `records_returned_for_analysis`. These are different count classes. Provider metadata may exceed or differ from the API-visible corpus.
7. When a materially relevant video reports at least 300 available comments but fewer than 300 records were retrieved, label it `insufficient_depth` and continue unless the complete corpus is smaller or a genuine boundary stops retrieval. Analyze all records when the complete corpus contains 500 or fewer; for a larger completely acquired corpus use the returned deterministic 500-record sample.

A terminal `completed_with_access_boundary` receipt with `replies_reconciled: false` preserves usable bounded evidence after all page tokens are exhausted, but it is not a complete corpus. Report the exact reply mismatches and confidence limitation.

`retrieved` does not mean persisted or user-downloadable. AskRigor processes public material transiently and does not create a comment archive.

## Episode analysis and evidence weighting

Deduplicate at the person × treatment episode level. Keep creator-content claims, commenter experiences, and formal evidence in separate lanes. Separate firsthand reports from hearsay and opinions. Preserve benefit, no effect, harm, discontinuation, mixed trajectories, diagnoses, co-interventions, follow-up, and parent/reply context. Translate “cured” into the specific evidenced outcome; symptom or functional change does not establish structural reversal, permanent cure, or causality.

Never weight an umbrella label such as exercise, PT, rehabilitation, diet, or supplement as one intervention. Decompose exact intervention and comparator programs: components, dose/intensity/frequency/duration, supervision, fidelity/adherence, cointerventions, disease stage/eligibility, target outcome, and follow-up. If those material details are absent, label the evidence program unspecified; it cannot support a class-wide benefit, failure, comparison, or ranking. Separate preoperative conservative care intended to prevent or defer surgery from postoperative rehabilitation; evidence for one does not establish the other.

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

Community → formal: convert material interventions, practitioner critiques, subgroups, outcomes, regimens, adverse effects, and dechallenge/rechallenge into targeted formal and grey searches. Record `no_material_transferable_hypotheses` only when none exist.

Formal → community: convert decision-critical formal findings into targeted community discriminators. Record `no_material_discriminators` only when none exist. Preserve discordance rather than forcing either layer to win automatically.

Continue deeper immediately when a selected video reports `continuation_recommended: true`, fewer than 300 records despite at least 300 plausibly available, incomplete directional coverage, unresolved replies, or a material community/formal conflict. `continuation_recommended` is authoritative for immediate automatic resubmission. A token paired with `continuation_recommended: false` is deferred recovery state: preserve it, report the retry-later blocker, and do not auto-resubmit it in the same pass. Continue wider when a material signal comes from only one creator or discussion pool, fewer than two independent relevant videos were audited despite plausible candidates, a direction is missing, a new hypothesis could change actionability, another search page contains plausible candidates, or comments expose a new intervention or discriminator. A new decision-relevant claim reopens community and formal discovery.

Elapsed time is not evidence saturation. Stop after terminal video states and directional coverage when two consecutive wider expansions add no material intervention, outcome, discriminator, contradiction, or actionability change, independent pools have been sought for every material signal, and remaining candidates are unlikely to change the answer. A genuine access or quota boundary may also stop expansion.

If wider or deeper work remains executable and `further_expansion_likely_to_improve_answer` would be `yes`, continue. A final answer may contain only `no` or `blocked` with an explicit reason.

A partial or bounded answer does not waive executable required work. Even one unavailable full text or inaccessible private community limits only that source or lane and cannot stop available YouTube discovery, creator transcripts, comment auditing, formal retrieval, or cross-layer iteration. Do not replace omitted required work with a long conventional summary.

Normal Project chat is the primary YouTube pagination workflow. Deep Research is optional for later broad literature or web synthesis when AskRigor is available there; Deep Research does not make YouTube pagination faster.

## Required user-facing output

Translate internal status codes into plain language: for example, say that the available public comments were fully checked, only an abstract was available, or a source could not be accessed. Do not show raw enums, receipt field names, snake_case labels, or tool terminology there. Preserve them in the internal audit and expose them only when the user explicitly asks for a technical audit or debug export; always lead with a plain-language summary.

Keep the answer concise. Name each materially different program in ordinary terms and say briefly how it differs; do not collapse the findings back into an exercise, PT, diet, or supplement bucket. Use short reader-facing sections such as **Approaches compared**, **What the evidence found**, **Public discussions checked**, **What remains uncertain**, and **Videos worth watching** when applicable. Do not lead with protocol compliance or a research-receipt dump.

Include **Videos worth watching** only for creator content verified from the selected transcript track. Rank by decision usefulness, novelty, and exact match—not positivity or popularity. Each row needs the canonical title link with the relevant timestamp when located, channel/date, exact creator claim or demonstration, why it adds unique decision value, whether captions were human- or automatically generated when known, and a plain-language evidence limitation. Do not pad the list with generic, redundant, stage-mismatched, or comments-only candidates. If none qualify, say plainly that no video's contents could be verified; keep `No content-verified watchlist candidate located` only in the internal record.

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

`complete` requires every applicable field complete, no unresolved material claim fingerprint, no creator-content assertion without transcript support, and every selected discussion audit locked. `completed_with_access_boundary` requires a terminal provider boundary, the missing material, and its confidence effect. This receipt is an input to HRP synthesis, not a treatment verdict.
