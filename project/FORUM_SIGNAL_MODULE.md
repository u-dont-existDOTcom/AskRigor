# Forum Signal Module

Run this module after the Project router marks `FORUM_SIGNAL REQUIRED`. It acquires and analyzes firsthand community evidence as an independent evidence layer, then returns structured evidence to HRP synthesis. It does not decide the final ranking alone.

## Acquisition controller

1. Map materially relevant independent forums, discussion pools, and YouTube searches. Record platform, query, date, access result, and whether material is firsthand. Use ordinary web research for accessible non-YouTube communities.
2. Prepare up to six YouTube searches across the general landscape, prevention/avoidance, exact intervention variants, contrarian or practitioner critique, benefit, no effect/failure, harm/discontinuation, and formal discriminators. Combine compatible directions within the six-call limit. Call `survey_youtube_community` and preserve queries, cursors, and candidates.
3. Before auditing, build a candidate-selection ledger. For every shortlist choice record query/direction, unique hypothesis, decision usefulness, likely firsthand value, creator/discussion-pool independence, and nonredundancy; provider rank, views, and comment volume show discoverability or potential corpus density, not credibility. Select up to three materially different videos per batch; if the ledger is weak or redundant, rewrite queries, use cursors, or start another batch rather than treating the first provider page as “best.”
4. Call `audit_youtube_video_community` once per selected video. Continue the same chain whenever `continuation_recommended: true`. Query-bounded comment search is discovery-only and is never the corpus.
5. For each video preserve `provider_reported_comments`, `top_level_comments_retrieved_cumulative`, `replies_retrieved_cumulative`, `records_retrieved_cumulative`, and `records_returned_for_analysis`. These are different count classes. Provider metadata may exceed or differ from the API-visible corpus.
6. When a materially relevant video reports at least 300 available comments but fewer than 300 records were retrieved, label it `insufficient_depth` and continue unless the complete corpus is smaller or a genuine boundary stops retrieval. Analyze all records when the complete corpus contains 500 or fewer; for a larger completely acquired corpus use the returned deterministic 500-record sample.

A terminal `completed_with_access_boundary` receipt with `replies_reconciled: false` preserves usable bounded evidence after all page tokens are exhausted, but it is not a complete corpus. Report the exact reply mismatches and confidence limitation.

`retrieved` does not mean persisted or user-downloadable. AskRigor processes public material transiently and does not create a comment archive.

## Episode analysis and evidence weighting

Deduplicate at the person × treatment episode level. Separate firsthand reports from hearsay, creator claims, and opinions. Preserve benefit, no effect, harm, discontinuation, mixed trajectories, diagnoses, co-interventions, follow-up, and parent/reply context. Translate “cured” into the specific evidenced outcome; pain, function, range of motion, or avoided surgery does not establish structural regeneration.

Never weight an umbrella label such as exercise, PT, diet, or supplement as one intervention. Decompose exact intervention and comparator programs: components, dose/intensity/frequency/duration, supervision, fidelity/adherence, cointerventions, disease stage/eligibility, target outcome, and follow-up. Separate preoperative conservative care intended to prevent or defer surgery from postoperative rehabilitation; evidence for one does not establish the other.

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

For the exact old-hip regression, repeated firsthand improvement with gelatin, keto, or swimming may be promising for the specific reported outcome. If matched formal support was not located, that signal must not become `weak`, `ineffective`, or `disproved` merely because the formal pass was empty. A low-risk, low-cost, reversible option may justify a measured time-bounded trial when opportunity cost and diagnostic delay are controlled.

Separate gelatin/collagen, hydration, swimming/aquatic exercise, and distinct preoperative PT programs. A generic PT/exercise or postoperative-rehabilitation video satisfies none; require matched video or explicit no-candidate/access disposition to complete. Discovery is not endorsement: preserve exact, indirect, mechanistic, grey, and community lanes and their uncertainty.

## Bidirectional and adaptive iteration

Community → formal: convert material interventions, practitioner critiques, subgroups, outcomes, regimens, adverse effects, and dechallenge/rechallenge into targeted formal and grey searches. Record `no_material_transferable_hypotheses` only when none exist.

Formal → community: convert decision-critical formal findings into targeted community discriminators. Record `no_material_discriminators` only when none exist. Preserve discordance rather than forcing either layer to win automatically.

Continue deeper immediately when a selected video reports `continuation_recommended: true`, fewer than 300 records despite at least 300 plausibly available, incomplete directional coverage, unresolved replies, or a material community/formal conflict. `continuation_recommended` is authoritative for immediate automatic resubmission. A token paired with `continuation_recommended: false` is deferred recovery state: preserve it, report the retry-later blocker, and do not auto-resubmit it in the same pass. Continue wider when a material signal comes from only one creator or discussion pool, fewer than two independent relevant videos were audited despite plausible candidates, a direction is missing, a new hypothesis could change actionability, another search page contains plausible candidates, or comments expose a new intervention or discriminator. A new decision-relevant claim reopens community and formal discovery.

Elapsed time is not evidence saturation. Stop after terminal video states and directional coverage when two consecutive wider expansions add no material intervention, outcome, discriminator, contradiction, or actionability change, independent pools have been sought for every material signal, and remaining candidates are unlikely to change the answer. A genuine access or quota boundary may also stop expansion.

If wider or deeper work remains executable and `further_expansion_likely_to_improve_answer` would be `yes`, continue. A final answer may contain only `no` or `blocked` with an explicit reason.

Normal Project chat is the primary YouTube pagination workflow. Deep Research is optional for later broad literature or web synthesis when AskRigor is available there; Deep Research does not make YouTube pagination faster.

## Required user-facing output

Include a **Videos worth watching** table ranked by decision usefulness, not positivity or popularity. A video rich in failures, harms, or difficult recovery may rank first. Each row needs the clickable canonical title link, channel, publication date, unique hypothesis/why it matters, provider-reported count, API-visible top-level comments and replies retrieved, records returned for analysis, firsthand people or episodes (or bounded unknown), completion state, directional summary, and limitation. State what candidate selection and cross-layer iteration changed in the evidence map.

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
  community_to_formal: complete | no_material_transferable_hypotheses | incomplete
  formal_to_community: complete | no_material_discriminators | incomplete
  platforms_and_queries: <explicit list>
  unique_people: <count or bounded unknown>
  unique_treatment_episodes: <count or bounded unknown>
  access_boundaries: <explicit list or none>
  confidence_effect: <explicit text>
```

`complete` requires every applicable field complete. `completed_with_access_boundary` requires a terminal provider boundary, the missing material, and its confidence effect. This receipt is an input to HRP synthesis, not a treatment verdict.
