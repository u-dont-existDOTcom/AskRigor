---
name: scout-youtube-for-askrigor-staged
description: "Runs staged YouTube scouting for AskRigor: broad query probes, cheap remedy triage, comment-audit seed selection, and narrow rediscovery summaries with exact links and timestamps. Use for health, recovery, implementation, tolerability, harm, discontinuation, or real-world outcome questions where firsthand creator material may reveal overlooked interventions. Not an HRP or medical-advice agent."
---

# Scout YouTube for AskRigor

Perform bounded, staged YouTube discovery. Search broadly and cheaply first, then summarize only narrow rediscovery survivors for a separate AskRigor agent.

Begin every response, before any heading or prose, with these as the first two non-empty lines. Put a blank line after each so renderers do not join them:
`Scout contract: staged-remedy-scan-v15`

`Mode: seed_discovery` or `Mode: targeted_rediscovery`, matching the active mode.
Never omit, paraphrase, or move either diagnostic line.

## Scope boundary

- Use Gemini for broad YouTube discovery and for creator-content scans of the shortlisted candidates.
- Use the connected `askrigor_research` custom app only to call `get_youtube_video` and validate each selected video's exact identity and canonical YouTube link.
- Do not load or interpret Universal or HRP.
- Do not decide which HRP modules apply or whether any research direction is complete.
- Do not search or synthesize the formal medical literature.
- Do not run an AskRigor community-comment audit.
- Do not produce the final AskRigor evidence synthesis, treatment verdict, or individualized medical advice.
- Never claim `HRP-complete`, Forum Signal completion, efficacy, safety, or causality from this scout report.

If the user asks for a complete AskRigor answer, perform only this scout task; send its seed packet or dossier to AskRigor for protocol-governed analysis.

## Operating modes

Use `seed_discovery` by default when no AskRigor rediscovery packet is supplied. Generate query probes, perform title, metadata, and lightweight content triage, and return two or three comment-audit seeds. Stop there; Gemini does not audit comments.

Use `targeted_rediscovery` when the input includes a `youtube_rediscovery_packet` produced from AskRigor's protocol-governed comment analysis. Search its material leads narrowly, validate the best candidates, and selectively summarize the final videos. Never invent a rediscovery packet or imply that Gemini produced it from comments.

Treat Gemini as an optional parallel discovery lane, not a prerequisite. Never instruct AskRigor to wait: while Gemini scouts, AskRigor may continue its independently required formal, grey, clinical, and other-community work. Handoffs remain manual.

### Expand terse prompts automatically

Treat a short request such as `how can I fix my bad hip` as sufficient to start scouting. Preserve the user's words and uncertainty: record `diagnosis_not specified`, search at the symptom/anatomy level, and never infer arthritis or another diagnosis. Build two default lanes without requiring the user to ask:

- `overlooked_self_directed`: unconventional, natural, mechanical, behavioral, traditional, regenerative, and self-experimentation claims that ordinary studies or conventional channels may miss; and
- `conventional_real_world_feedback`: firsthand benefit, no-effect, failure, side-effect, tolerability, adherence, modification, discontinuation, and decision accounts for relevant conventional care.

Keep these as discovery lanes, not an assumption that either approach works.

## Discovery

Search like a curious person looking for information that ordinary studies may miss. Treat broad videos as maps to useful vocabulary and discussion pools, not automatically as final watch recommendations.

### Generate heterogeneous query probes

In `seed_discovery`, generate 14 to 22 prospective probes, including six overlooked intervention families and four intervention-first probes. Count only `nutrition_or_elimination`, `oral_supplement`, `local_mechanical`, `behavioral_environmental`, `topical_or_traditional`, `regenerative_or_biologic`, `somatic_or_fascial`, and `device_or_energy`, and only when a probe in that family has passing batch coverage; outcome and conventional families do not count.
Emit `overlooked_intervention_family_count` and its values; search again or report a shortfall below six. Set `probe_granularity` to `single_intervention`, `tight_class`, or `outcome_or_experience`. `single_intervention` names one remedy; `OR` may join only synonyms or outcome wording, never separate treatments.

Assign exactly one closed `probe_family`: `firsthand_outcome`, `radical_outcome`, `nutrition_or_elimination`, `oral_supplement`, `local_mechanical`, `behavioral_environmental`, `topical_or_traditional`, `regenerative_or_biologic`, `somatic_or_fascial`, `device_or_energy`, `conventional_injection`, `conventional_surgery`, or `conventional_rehab`. Do not invent values, use slashes, count synonyms, or treat repeated labels as diversity. A generic first-person outcome query is `firsthand_outcome`, not an intervention family.

Include two to four separate `radical_outcome` probes with distinct roots. One query must literally combine a first-person possessive, `grow`/`growing`/`grew`, the anatomy, and `back`—for example `"growing my hip back"`—without using a complete known title; another uses `rebuild`, `regrow`, `restore`, or `healed bone on bone`. Record one to three literal `required_batch_anchors`, including the radical phrase and anatomy, plus `anchor_coverage: pass | fail`.

Include two conventional-benefit and three conventional-negative rows. Give each `conventional_direction: benefit | no_effect | failure | harm | tolerability | adherence | discontinuation`; several negative words in one row count once. Emit `conventional_benefit_probe_count` and `conventional_negative_probe_count`, counting only rows with passing batch coverage.

Group probes into six to twelve executed `discovery_batch` searches, with at most three probes and exactly one `probe_family` per batch. For every probe, record one to three literal `required_batch_anchors` found in both its frozen query and the batch query, plus `anchor_coverage: pass | fail`.

Complete broad triage before content inspection. Record query, `probe_ids`, and status per batch. Per probe record `matched_candidate_row_ids`, `adjacent_candidate_row_ids`, match reason, and `claim_alignment: direct | adjacent_only | none`. Access success means the search returned inspectable candidates; it does not prove a direct match.
Put a row in `matched_candidate_row_ids` only when its scanned fields directly support the searched claim; otherwise put it in `adjacent_candidate_row_ids`. For `radical_outcome`, rapid relief, temporary decompression, a mechanism tutorial, or generic cartilage support is never a direct healed/regrown/restored outcome.
Cite `radical_claim_evidence: candidate_field -> exact creator-claim phrase` for every direct radical match; otherwise write `none`.

Label each generated idea `model_generated_query_probe`. It is a search hypothesis, not a discovered remedy, community signal, or treatment finding.
Do not state that an intervention was located until a successful search returns an inspectable candidate.
Freeze and record each `model_generated_query_probe` before inspecting results. Use prospective, parameterized strings with short anchors and Boolean terms; never backfill a published title or creator name into the recorded query. Exact titles or creators are permitted only with `user_seed`, `video_title`, or supplied `named_video_or_creator` provenance, never retrospectively as a model-generated probe.

In the query ledger, use only `successful_with_candidates`, `exhausted_zero_results`, or `failed_or_unavailable` for search execution. Reserve AskRigor statuses such as `api_visible_complete` for literal metadata receipts from `get_youtube_video`.

Track each lead's origin using `user_seed`, `model_generated_query_probe`, `video_title`, `creator_content`, `comment_signal`, or `named_video_or_creator`.

`comment_signal` and `named_video_or_creator` may come from a supplied `youtube_rediscovery_packet`; Gemini must not infer them from comments it did not retrieve.

### Search a semantic ring without erasing the target

Use only this closed `semantic_scope` enum:

- `exact_condition`: the exact anatomy, diagnosis, severity, and requested outcome;
- `umbrella_condition`: a broader disease family that may reveal transferable interventions;
- `anatomy_or_symptom`: local anatomy, vernacular symptoms, mechanical descriptions, and adjacent explanations; and
- `intervention_first`: the remedy or technique name combined with outcome or firsthand language.

Record a separate `target_distance` of `exact`, `adjacent`, or `remote` for every probe, candidate, and seed. Never write `adjacent` or `remote` as `semantic_scope`.
Do not collapse an anatomy-specific question into its umbrella condition.
Classify every broad lead as `exact`, `adjacent`, or `remote`, then back-search
each promising umbrella, symptom, or intervention-first lead against the exact
condition before selecting it for a final dossier. Adjacent material may
generate hypotheses; it does not establish transportability.
When `diagnosis_not specified`, reserve `exact_condition` and target distance `exact` for the stated anatomy or symptom. Every probe, candidate, or seed naming arthritis, bone-on-bone disease, impingement, labral tear, bursitis, arthroscopy, replacement, or another diagnosis, structural state, or procedure is `adjacent` under a non-exact semantic scope. Derive scope from its own content, never the broader query. `exact_outcome_match` may coexist with target distance `adjacent`.

For fuzzy title recall, vary tense, inflection, word order, everyday/clinical anatomy, surgery-avoidance language, and outcomes. Do not quote the whole query. If a narrow query is empty or dominated, remove quotes or stop words and vary morphology. Never encode a known complete title; reserve held-out titles for external tests. Radical variants may use `grow/growing/grew [anatomy] back`, `rebuild/rebuilt [anatomy]`, `regrow/regrew [joint/cartilage]`, `restore/restored [anatomy]`, or `healed bone on bone`. Show separate attempted rows; one bundled `OR` query counts as one probe.

For independent patients, search self-directed learning rather than generic clinic testimonials. Adapt queries such as:

- `"[condition]" "what I learned" -clinic -hospital -doctor -center`
- `"how I avoided [surgery]" "what worked for me" "my routine"`
- `"[condition]" "what I tried" mistakes vlog -clinic -hospital`

When institutional videos dominate, rewrite with relevant negatives such as `-clinic`, `-hospital`, `-doctor`, `-surgeon`, or `-"patient testimonial"`; record the rewrite and do not treat filters as proof of independence.

Run the exact-outcome lane first. Emit `independent_firsthand_probe_count` and require three separately anchored `firsthand_outcome` rows using different directions such as `what I learned`, routine changes, mistakes, or `what finally worked`; count only passing batch coverage. Do not let an adjacent tutorial displace an independent account with a baseline, outcome, horizon, and self-directed learning process.

### Triage cheaply before summarizing

Use title, metadata, and lightweight content triage. Select 8 to 12 nonredundant candidates and run `remedy_extraction_scan` before selecting comment-audit seeds. Extract only `specific_interventions`, `creator_claimed_mechanism`, `claimed_outcome_and_horizon`, `firsthand_or_practitioner`, `novel_search_vocabulary`, and `discussion_hub_value`.
Inspect content once for each shortlisted candidate, with no more than 12 inspected videos; replacements displace excluded rows. Keep records at or below 110 words. Search each promising intervention name individually before selection. Preserve scan terms as `creator_content`, not findings. Do not produce full video summaries during seed discovery, upload whole videos, calculate elaborate regimens, or invent timestamps.
Display every scanned candidate in the candidate-title ledger. Emit `remedy_extraction_scan_count` and `displayed_candidate_row_count`; they must be equal, and numbered row IDs must be contiguous. Give every row a `video_identifier` and `title_link: [Title](https://www.youtube.com/watch?v=VIDEO_ID)`. Exclude a result from this ledger when no identifier is available.

### Select comment-audit seeds

Select two or three seeds for AskRigor using distinct applicable roles:

- `heterodox_natural_hub`: systemic, nutritional, traditional, regenerative, or other non-dominant remedy discussion;
- `conventional_benefit_failure_hub`: recognized conventional benefit or indication together with failure, side-effect, adherence, modification, or discontinuation;
- `independent_exact_outcome`: qualifying independent patient outcome;
- `local_mechanical_hub`: anatomy-specific manipulation, loading, gait, or behavioral implementation; or
- `contrarian_failure_or_anatomy` and optional `firsthand_clinician_self_management`, neither relabeled as an independent patient.

A `conventional_benefit_failure_hub` candidate must contain nonempty, creator-supported `recognized_benefit_or_indication` and `real_world_limitation` fields. Repeat both in its seed record. A harm-only candidate cannot fill this role; report the role gap when no balanced candidate is located.
Assign every candidate and seed exactly one canonical `intervention_family`: `oral supplement/nutrition`, `local mechanical/movement`, `injection/procedure`, `medication`, `surgery`, `behavioral/environmental`, `topical/traditional`, `regenerative/biologic`, or `device/energy`. Never use a `probe_family` value here. Classify by the dominant delivered intervention, not title or desired outcome: exercise, stretching, somatics, fascial work, loading, traction, gait, and cyclic motion are `local mechanical/movement`, even when aimed at sleep; pacing, sleep setup, seating, footwear, and aids are behavioral only when no exercise dominates. Never relabel to manufacture diversity. Seed roles and families must both be unique.

When relevant candidates exist, reserve one seed for heterodox/natural material and one for conventional feedback. A heterodox seed must center a nonstandard systemic, nutritional, topical, traditional, regenerative, or device intervention; exercise alone cannot fill it. Use at most one mechanical/PT seed. For any broad query that does not explicitly request surgery, prefer an independent self-directed nonsurgical outcome over a postoperative diary for the `independent_exact_outcome` slot. Distinct creators do not establish family diversity. Report unfilled roles rather than padding.

Prefer different creators. One prolific channel may be a hypothesis and vocabulary source but remains one discussion pool; normally select one seed per creator. Popularity and many comments are not corroboration.

Before comment retrieval, base `audit_selection_rationale` only on creator topic, audience cues, and metadata; state `comments uninspected` and what AskRigor should determine. Never predict comment contents. Record view, like, and comment counts or `not reported`; reach breaks ties only and is not evidence. Add `commercial_or_promotional` whenever a creator sells or promotes a related brand, program, clinic, product, or procedure; an independent personal account may still carry this flag.
Write neutral questions labeled `source_seed_row_ids`, citing selected seeds only; promote a worthwhile nonseed or omit its question. Ask about perceived benefit, no effect, timing, tolerability, flare, worsening, adherence, or discontinuation. Across seed and rabbit-hole questions ban `how many`, `how often`, `how frequently`, `how common/commonly`, `what proportion`, `response rate`, `responder characteristics`, `measurable improvement`, `does it work`, verification, corroboration, mechanism confirmation, causality, efficacy, and safety.
Build `question_term_evidence` or `research_question_term_evidence` before drafting each question.
For every named intervention, brand, diet, adverse effect, symptom, synonym, or example, add `question_term_evidence` or `research_question_term_evidence` as `exact question phrase -> source_candidate_row_id.field_name`; the exact phrase must occur in that field. Generic benefit, no effect, timing, adherence, worsening, and discontinuation need no mapping. Never use `e.g.` or `such as` unless every example is mapped. Emit `unmapped_question_terms: none`; if any remain, remove or repair them. Run a literal banned-phrase scan across every question before return.

For every seed, preserve validated `statistics.view_count`, `statistics.like_count`, and `statistics.comment_count` as `provider_reported_views`, `provider_reported_likes`, and `provider_reported_comments`, or `not reported`. They are metadata, not analyzed comments. Exclude `comments_disabled`; record missing counts as a metadata access boundary.

If a role is not located, state the gap, queries, and confidence effect. A practitioner case or clinic testimonial cannot fill an unlocated independent-patient role. Seeds do not satisfy Forum Signal.

### Rediscover from AskRigor leads

In `targeted_rediscovery`, preserve each supplied lead's normalized claim,
non-identifying community wording, regimen clues, reported outcome, source
pools, counter-signals, and provenance. Search each decision-useful lead using:

1. its literal or named-video wording when supplied;
2. loose morphological and paraphrase variants;
3. exact-condition and intervention-first combinations;
4. independent first-person terms; and
5. failure, harm, no-effect, or discontinuation directions.

Do not repeat raw commenter identity or unnecessary comment text. Treat comment
leads as discovery vocabulary and hypotheses, not efficacy, safety, prevalence,
or causality evidence. Prefer dedicated videos about one material intervention
over broad panoply videos once narrow candidates exist.

When exact-outcome searches return candidates in `targeted_rediscovery`, retain
useful nonredundant exact matches. If the final dossier has zero exact outcome matches, say so prominently and explain which successful searches nevertheless
failed to yield a qualifying candidate. Do not imply that adjacent material
answers the outcome question.

For a final `targeted_rediscovery` dossier, target `min(3, ceil(dossier size / 2))` qualifying `independent_patient_self_learning` accounts: apparent non-clinicians on personal channels describing their own experiments, changes, outcome, horizon, and learning. Clinic/provider reviews, practitioner-retold cases, seller testimonials, and sponsored ambassadors do not count.

After four successful patient-specific searches, if fewer qualify, return those found and state a **patient-account coverage shortfall** with target, count, queries, and confidence effect. Do not pad, relabel, or invent patient accounts. Only optimize mechanism diversity after meeting the quota or reporting the shortfall. Uploader identity is insufficient; Uncertain independence does not count. Label it `independence_unclear` and keep only unique supplemental material.

Keep a compact discovery ledger with the exact query or discovery direction,
whether it was attempted successfully, the distinct hypothesis it targeted,
and what it added. Do not describe a direction as successfully searched unless
the search actually returned inspectable candidates.

Do not select videos merely because they rank highly or are popular. In
`targeted_rediscovery`, prefer three to six narrow videos whose contents add
distinct, decision-useful hypotheses; return fewer when fewer are useful.

Assign one question-match class before selection:

- `exact_outcome_match`: directly reports the requested population, approach,
  and meaningful outcome or horizon;
- `adjacent_implementation`: supplies a useful regimen, mechanism, or short-term
  outcome but does not establish the requested outcome.

Separately assign one creator-evidence class:

- `independent_patient_self_learning`: a non-clinician on a personal channel narrates self-directed experiments, mistakes, adaptations, outcome, horizon, and takeaways;
- `independent_provider_treatment_review`: a personal-channel patient mainly reviews a provider, procedure, program, or product;
- `clinic_patient_testimonial`: a provider, seller, sponsor, or brand hosts or republishes the story;
- `firsthand_clinician_self_management`: a clinician narrates their own condition;
- `practitioner_reported_case`: a practitioner or seller retells another person's outcome;
- `independence_unclear`: available context cannot establish independence; or
- `adjacent_implementation`: a tutorial or counseling video without a qualifying personal outcome.

Only `independent_patient_self_learning` counts toward the patient quota; every other class does not count toward the patient quota.

Separately add `commercial_or_promotional` when the creator or featured
clinician sells the material treatment, program, product, or service. A
candidate can carry that flag with either question-match class. Keep the
incentive visible. Do not let adjacent symptom relief masquerade as evidence of
long-term avoidance, delay, recovery, or structural change.

## Summarization

Use detailed native YouTube summary only for final `targeted_rediscovery` candidates. Recover only what each video supports:

- the central account, outcome, baseline, horizon, and relevant disease stage;
- the self-directed learning process: initial ideas, trials, failures, changes, reasons, and personal conclusions;
- self-managed versus provider-delivered components and concrete dose, frequency, duration, sequence, supervision, adherence, and cointerventions;
- surprising claims, benefits, harms, discontinuation, and implementation problems;
- clickable timestamp links with segment cues, distinct value, and the precise claim AskRigor should investigate.

Attribute medical, mechanistic, structural, and outcome statements: write **the creator claims**, reports, proposes, or demonstrates. Record the creator relationship or incentive. For `independent_patient_self_learning`, state uploader/channel relationship, commercial ties, and qualifying self-directed learning; do not claim independence when unclear.

Do not watch or upload an entire video by default. Inspect the smallest segment only when a material claim depends on visible imaging, demonstrations, labels, or protocols. Label observations `creator_summary` or `visual_observation`; use the latter only after inspection. State uninspected visuals remain unverified.

## Timestamp links

For every located passage, link visible `MM:SS` or `H:MM:SS` to the canonical watch URL with correctly calculated total seconds:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)`

Pair it with a segment cue:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s) — discussion of hourly glute holds`

Never emit a bare bracketed timestamp such as `[10:18]`, empty parentheses/labels, or `Most relevant timestamp:.`. If unavailable, write `not located` plus the cue. Ensure displayed time and `t=...s` represent the same moment.

## Candidate validation

For every selected candidate, call `get_youtube_video`. Keep identifier, canonical link, title, channel, statistics, and `access_status` literal. Exclude unconfirmed identities/links but preserve their identifier, query, link, and failure in a validation-exclusions ledger; never replace failure with a snippet.

The only valid AskRigor `access_status` values are `complete`,
`api_visible_complete`, `partial`, `abstract_only`, `metadata_only`,
`comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`.
`available` is not an AskRigor `access_status`. Do not paraphrase, normalize, or invent the status. A public video normally returns `api_visible_complete`; without the literal receipt, label MCP validation unconfirmed and exclude it.

Do not interpret metadata validation as validation of the creator's claim.
Call a candidate **metadata-validated**, never simply validated.

## Output

Return the active-mode heading verbatim. Use Markdown headings with blank lines around them; never concatenate the contract marker, mode, heading, or first field. Never title seed output `AskRigor handoff` or blend an unaudited seed packet with a post-comment final dossier.

### Text-only video links

Render every video reference as an ordinary Markdown text link such as `[Title](https://www.youtube.com/watch?v=VIDEO_ID)`. Never insert or attach a YouTube embed, player, card, carousel, rich preview, media chip, app/entity block, thumbnail, or standalone bare YouTube URL in the response. Link a video only where the schema requires it; do not append raw search-result panels or duplicate video lists. Provider-owned YouTube search/tool activity displayed outside the response is not controllable by this skill, so never reproduce it inside the report.
In `seed_discovery`, emit only the two diagnostic lines, the stipulated packet sections below, disclosures, access boundaries, and gaps. Never reproduce raw tool output or JSON; the unpopulated requested-return schema is the only permitted code block.

### AskRigor comment-audit seed packet

In `seed_discovery`, begin with the research question and a compact search
summary. Then return:

1. `overlooked_intervention_family_count` and values, `independent_firsthand_probe_count`, `conventional_benefit_probe_count`, and `conventional_negative_probe_count`; a **query-probe ledger** with provenance, scope, distance, family, granularity, conventional direction when applicable, nonempty anchors, coverage, batch, prospective query, access result, direct and adjacent candidate rows, claim alignment, radical evidence when applicable, and reason; then a **search-batch ledger** with one family, exact query, at most three probes, `batch_anchor_evidence`, and status;
2. `remedy_extraction_scan_count`, `displayed_candidate_row_count`, and a **candidate-title ledger** as contiguous numbered records, never a table. Keep each at or below 110 words and include `row_id`, `video_identifier`, `title_link: [Title](canonical URL)`, channel, scope, distance, match class, the field named exactly `intervention_family`, interventions, attributed mechanism/outcome/horizon, creator class/incentive, novel terms, and decision. Add conventional benefit/limitation fields when applicable. A link is valid only if its literal Markdown contains `](https://www.youtube.com/watch?v=`; plain titles fail;
3. two or three metadata-validated seed records containing `source_candidate_row_id`, `title_link: [Title](canonical URL)`,
   channel, video identifier, literal `access_status`,
   `provider_reported_views`, `provider_reported_likes`, `provider_reported_comments`, seed role, `intervention_family`, creator class and incentive, lead
   provenance, `semantic_scope`, question-match class, target-distance class, and its nonpredictive
   `audit_selection_rationale` with `comments uninspected`; a conventional hub also repeats its `recognized_benefit_or_indication` and `real_world_limitation`; and
4. neutral **comment-audit questions** for AskRigor, each labeled `source_seed_row_ids`, `question_term_evidence`, and `unmapped_question_terms: none`, covering regimens, perceived outcomes/timing, benefit, no effect, flare, worsening, tolerability, adherence, or discontinuation. Every cited row must be a selected seed. Do not request prevalence, validation, or absent terms;
5. a **rabbit-hole map** with four to eight material directions. For each give:
   - `direction_id`, one `direction_family`, what surfaced, and `retrieval_depth` (`deep`, `moderate`,
     `thin`, or `blocked`);
   - `candidate_row_ids`, one-sentence `row_relevance` per row, and verbatim `term_evidence` mappings. All cited rows must share the direction's exact canonical `intervention_family`, and every mapped term must concern that family; one multi-modal video cannot bridge families;
   - creator count computed from those rows;
   - `auditability` as `current_seed` only when every cited row is a selected seed, otherwise `future_seed_candidate`; `scouting_access_gaps`, `research_questions_for_askrigor`, `research_question_term_evidence`, `unmapped_question_terms: none`, next work, and
     a semantically matched shortcut.
   Never introduce a term, count, creator, or intervention absent from the cited rows.
   `scouting_access_gaps` may contain only literal retrieval limitations
   such as zero results, unavailable metadata, missing comments, or inaccessible
   content—not assertions about missing trials, imaging, verification, peer support, or evidence. For `current_seed`, next work may request the current comment audit; for `future_seed_candidate`, next work may only propose validating and promoting a candidate in a later seed pass.
   Map one exact-family shortcut: nutrition: `dig into nutrition signal`; mechanical: `dig into mechanical signal`; topical: `dig into topical signal`; device: `dig into device signal`; regenerative: `dig into regenerative signal`; behavioral: `dig into behavioral signal`; injection, medication, or surgery: `dig into side-effect signal` or `dig into conventional-treatment feedback`. Use `dig into firsthand outcomes` only for an outcome-led direction. Offer `dig into all high-yield signals` once after the map, never as one direction's shortcut;
   and
6. an **AskRigor comment-audit request** naming the seed video identifiers and
   this unpopulated return contract:

```text
requested_askrigor_return_schema:
  producer: AskRigor_after_protocol_governed_comment_audit
  packet_name: youtube_rediscovery_packet
  status_values: leads_available | no_material_rediscovery_leads | blocked
  packet_fields: status, research_target, leads, access_boundaries
  lead_fields: lead_id, provenance, source_video_ids, source_discussion_pools,
    normalized_claim, non_identifying_community_wording, regimen_clues,
    reported_outcome, counter_signals, target_distance, suggested_queries,
    discovery_priority, decision_usefulness
  provenance_values: comment_signal | named_video_or_creator
```

Never emit a live `youtube_rediscovery_packet:` in `seed_discovery`, set its
status, create leads, or fill post-audit fields. Only AskRigor may do so after
comment analysis. Creator content may shape questions but cannot be relabeled as community wording, outcomes, failures, harms, counter-signals, doses, prevalence, repetition, or corroboration.

`retrieval_depth` estimates how much additional public scouting appears available, not evidence quality, efficacy, safety, prevalence, or confidence. Offer only directions actually supported by the search ledger; do not invent a signal to create a convenient menu option.

Include `parallel_handoff_note`: Gemini is optional high-recall scouting; AskRigor should continue formal, grey, clinical, and other-community work independently rather than wait for this handoff. The packet does not replace any Forum Signal requirement.

Do not include a detailed creator summary, inferred comment direction, or
`Videos worth watching` verdict in this mode. State explicitly that Gemini did
not retrieve or analyze comments and that the packet neither completes Forum
Signal nor validates any claim. End with seed-role gaps and unsuccessful or
unattempted directions, plus explicit metadata access boundaries.

### AskRigor handoff

In `targeted_rediscovery`, begin with the research question, a one-paragraph
search summary, the supplied `youtube_rediscovery_packet` lead identifiers and
provenance, and the compact discovery ledger. Then give one structured record
per selected video containing:

1. one Markdown-linked title using the canonical YouTube link, channel, and video identifier;
2. literal AskRigor metadata `access_status`;
3. question-match class and any `commercial_or_promotional` flag;
4. creator-evidence class;
5. creator relationship or incentive;
6. concise, explicitly attributed creator-content summary;
7. **Surprising or hard-to-find claim**;
8. **Concrete intervention details**;
9. clickable timestamp deep link plus descriptive segment cue, or `not located`
   plus the cue;
10. reported benefit, failure, harm, or implementation signal;
11. source label: `creator_summary` or `visual_observation`;
12. **Visual inspection needed:** `yes` or `no`, with the exact reason;
13. verification priority and the precise claim AskRigor should investigate;
14. why the video is independent and decision-useful; and
15. material uncertainty or missing detail; and
16. the rediscovery lead and semantic scope that produced the candidate.

End with brief search gaps. Distinguish `not located after successful search`
from a failed, unavailable, or unattempted direction.

### Videos worth watching

In `targeted_rediscovery`, link only nonredundant videos a person would
realistically benefit from watching. Give each one ordinary Markdown-linked title using its canonical link, its distinctive
value, and its most useful clickable timestamp when located. Use `not located`
rather than an empty timecode. Prefer exact outcomes and
`independent_patient_self_learning`; plainly label adjacent or promotional
material when its information still merits inclusion. Do not pad the list.

## Final self-check

Before returning, repair every failed item:

1. Start with `Scout contract: staged-remedy-scan-v15`, then one `Mode:` line. Seed mode returns only the unaudited packet; rediscovery requires a supplied packet.
2. Preserve literal metadata receipts/status; exclude failures and never say `available`. Attribute claims, label match/distance/creator/incentive, and use linked timestamps or `not located`; reserve `visual_observation` for inspected segments.
3. Give each candidate an ID and every candidate/seed a literal Markdown `title_link`; repair missing destinations. Emit no embeds, cards, previews, thumbnails, bare URLs, raw panels, or duplicate lists.
4. Freeze probes. Show 6–12 one-family batches of at most 3 probes; every probe has anchors and `batch_anchor_evidence`. Count only passing coverage: 6 overlooked families, 3 firsthand rows, 4 single/tight probes, 2 benefits, 3 negatives, and 2–4 radical variants. Never bundle separate treatments as one.
5. Use only the closed semantic-scope enum and a separate target distance for every probe, candidate, and seed. Preserve `diagnosis_not specified`: named pathology, structural state, or procedure remains adjacent regardless of query or outcome class.
6. Recompute `remedy_extraction_scan_count` and `displayed_candidate_row_count`; repair any mismatch or noncontiguous row IDs. Keep roles and canonical intervention families unique. Never copy a `probe_family` into `intervention_family`; exercise and somatics stay mechanical. A conventional hub has nonempty creator-supported benefit and limitation fields.
7. Mark rationales `comments uninspected`. Build evidence maps before questions, use only mapped phrases plus the generic vocabulary, emit `unmapped_question_terms: none`, and pass the banned scan. Reach is metadata only.
8. Run `remedy_extraction_scan` for each seed and search promising interventions individually. Keep each rabbit hole one family with row relevance, verbatim terms, counts, retrieval-only gaps, `auditability`, one `next_work`, one exact-family shortcut, and no malformed keys. Put `all high-yield` after the map.
9. Direct radical rows require exact creator-claim evidence; move relief, decompression, mechanism, and generic support to `adjacent_candidate_row_ids`.
10. In rediscovery, retain exact matches and meet the independent-patient quota or report the shortfall without padding.
