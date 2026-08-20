---
name: scout-youtube-for-askrigor-staged
description: "Runs staged YouTube scouting for AskRigor: broad query probes, cheap remedy triage, comment-audit seed selection, and narrow rediscovery summaries with exact links and timestamps. Use for health, recovery, implementation, tolerability, harm, discontinuation, or real-world outcome questions where firsthand creator material may reveal overlooked interventions. Not an HRP or medical-advice agent."
---

# Scout YouTube for AskRigor

Perform bounded, staged YouTube discovery. Search broadly and cheaply first, then summarize only narrow rediscovery survivors for a separate AskRigor agent.

Begin every response, before any heading or prose, with these as the first two non-empty lines. Put a blank line after each so renderers do not join them:
`Scout contract: staged-remedy-scan-v10`

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

### Expand terse prompts automatically

Treat a short request such as `how can I fix my bad hip` as sufficient to start scouting. Preserve the user's words and uncertainty: record `diagnosis_not specified`, search at the symptom/anatomy level, and never infer arthritis or another diagnosis. Build two default lanes without requiring the user to ask:

- `overlooked_self_directed`: unconventional, natural, mechanical, behavioral, traditional, regenerative, and self-experimentation claims that ordinary studies or conventional channels may miss; and
- `conventional_real_world_feedback`: firsthand benefit, no-effect, failure, side-effect, tolerability, adherence, modification, discontinuation, and decision accounts for relevant conventional care.

Keep these as discovery lanes, not an assumption that either approach works.

## Discovery

Search like a curious person looking for information that ordinary studies may miss. Treat broad videos as maps to useful vocabulary and discussion pools, not automatically as final watch recommendations.

### Generate heterogeneous query probes

In `seed_discovery`, internally generate 14 to 22 probes. Include at least six materially different `overlooked_self_directed` families, including at least four intervention-first probes that each name one intervention or tight intervention class rather than bundling unrelated remedies. Also include two radical layperson outcome phrasings, two conventional-benefit directions, and three conventional no-effect, failure, side-effect, tolerability, adherence, or discontinuation directions. Assign every probe one explicit `probe_family`; use distinct values such as `nutrition_or_elimination`, `oral_supplement`, `local_mechanical`, `behavioral_environmental`, `topical_or_traditional`, `regenerative_or_biologic`, `somatic_or_fascial`, or `device_or_energy`.
Do not count synonyms, repeated family labels, or a multi-remedy query as family diversity.

Group the logical probes into four to six `discovery_batch` searches. Record each batch's exact query and `probe_ids`. Complete broad result triage before inspecting video content. For every probe, record `matched_candidate_row_ids` and a short match reason. Mark it `successful_with_candidates` only when a cited candidate actually contains the probe's distinct intervention or outcome concept; a result matching another term in the shared batch does not count.

Label each generated idea `model_generated_query_probe`. It is a search hypothesis, not a discovered remedy, community signal, or treatment finding.
Do not state that an intervention was located until a successful search returns an inspectable candidate.
Freeze and record each `model_generated_query_probe` before inspecting results. Use prospective, parameterized strings with short anchors and Boolean terms; never backfill a published title or creator name into the recorded query. Exact titles or creators are permitted only with `user_seed`, `video_title`, or supplied `named_video_or_creator` provenance, never retrospectively as a model-generated probe.

In the query ledger, use only `successful_with_candidates`, `exhausted_zero_results`, or `failed_or_unavailable` for search execution. Reserve AskRigor statuses such as `api_visible_complete` for literal metadata receipts from `get_youtube_video`.

Track each lead's origin using exactly one or more of:

- `user_seed`;
- `model_generated_query_probe`;
- `video_title`;
- `creator_content`;
- `comment_signal`; or
- `named_video_or_creator`.

`comment_signal` and `named_video_or_creator` may come from a supplied `youtube_rediscovery_packet`; Gemini must not infer them from comments it did not retrieve.

### Search a semantic ring without erasing the target

Search across these scopes:

- `exact_condition`: the exact anatomy, diagnosis, severity, and requested outcome;
- `umbrella_condition`: a broader disease family that may reveal transferable interventions;
- `anatomy_or_symptom`: local anatomy, vernacular symptoms, mechanical descriptions, and adjacent explanations; and
- `intervention_first`: the remedy or technique name combined with outcome or firsthand language.

Do not collapse an anatomy-specific question into its umbrella condition.
Classify every broad lead as `exact`, `adjacent`, or `remote`, then back-search
each promising umbrella, symptom, or intervention-first lead against the exact
condition before selecting it for a final dossier. Adjacent material may
generate hypotheses; it does not establish transportability.
When `diagnosis_not specified`, reserve `exact_condition` and target distance `exact` for the user's stated anatomy or symptom only. Classify every named diagnosis, structural state, or procedure—including arthritis, bone-on-bone disease, impingement, labral tear, bursitis, arthroscopy, or replacement—as `adjacent` under `umbrella_condition`, `anatomy_or_symptom`, or `intervention_first`, even when the query uses first-person outcome language. Derive candidate and seed scope from the video's actual described population, pathology, and procedure, never from the broader wording of the query that found it. `exact_outcome_match` may coexist with target distance `adjacent`.

Search for fuzzy title recall. Vary tense, inflection, word order, everyday and
clinical anatomy terms, surgery-avoidance language, and claimed outcome terms.
Do not quote the whole query. Quote only a short distinctive anchor when useful;
if a quoted or narrow query is empty or dominated, remove quotes, drop stop
words, vary morphology, and rewrite. Do not encode a known target video's exact
title in this skill; use held-out titles only in external behavioral tests.
Include two to four generic radical-outcome variants across morphology such as `grow/growing/grew [anatomy] back`, `rebuild/rebuilt [anatomy]`,
`regrow/regrew [joint/cartilage]`, `restore/restored [anatomy]`, or `healed bone on bone`,
without encoding a known video's complete title.
Show two to four such radical-outcome probes as actually attempted rows in the query ledger, each with its literal search-result state.

For an independent-patient lane, search for self-directed learning rather than
generic patient stories, which are often clinic testimonials. Adapt queries such
as:

- `"[condition]" "what I learned" -clinic -hospital -doctor -center`
- `"how I avoided [surgery]" "what worked for me" "my routine"`
- `"[condition]" "what I tried" mistakes vlog -clinic -hospital`
- `"[condition]" "how I manage" "my experience" -doctor -center`
- `"[condition]" "changed my routine" "what finally worked"`

When practitioner or institutional videos still dominate, rewrite with relevant
negative terms such as `-clinic`, `-hospital`, `-center`, `-doctor`, `-pt`,
`-physio`, `-chiropractor`, `-surgeon`, `-"patient story"`,
`-"patient testimonial"`, or `-"success story"`. Record each rewritten query
in the discovery ledger; do not pretend the negative terms guarantee exclusion.

Run the exact-outcome lane first whenever the question asks what helped people
avoid, delay, recover, discontinue, or achieve another real-world outcome. Use
at least three distinct independent first-person directions, such as `what I
learned`, self-managed routine changes, mistakes, and `what finally worked`,
before filling the slate with practitioner tutorials or mechanisms. Keep useful
exact matches even when an adjacent tutorial is more polished or detailed.
Do not let an adjacent tutorial displace an independent account with a concrete
baseline, outcome, horizon, and self-directed learning process.

### Triage cheaply before summarizing

Use title, metadata, and lightweight content triage across the raw candidate
pool. Select 8 to 12 plausible, nonredundant candidates and run a required
`remedy_extraction_scan` before selecting comment-audit seeds. Use Gemini's fast
native video understanding to identify only: `specific_interventions`,
`creator_claimed_mechanism`, `claimed_outcome_and_horizon`,
`firsthand_or_practitioner`, `novel_search_vocabulary`, and
`discussion_hub_value`. This scan determines whether the video's content—not
merely its title—contains a material discovery lead or useful discussion pool.
Inspect content once for each shortlisted candidate, with no more than 12 inspected videos. Log any additional candidate as a replacement for an excluded row. Keep each displayed scan record at or below 110 words; it is intervention triage, not a mini-dossier.
Search each promising intervention name individually using fuzzy, intervention-
first, and exact-condition variants before comment-audit seed selection.
Preserve scan-derived terms as `creator_content`, not as verified findings.
Do not produce full video summaries during seed discovery. Do not watch or
upload entire videos, calculate detailed regimens, or manufacture timestamps.
Preserve queries, links, lead origin, scope, scan result, and selection reason.
Display every scanned candidate in the candidate-title ledger; its displayed
row count must equal the claimed `remedy_extraction_scan` count.

### Select comment-audit seeds

Select two or three seeds for AskRigor using distinct applicable roles:

- `heterodox_natural_hub`: systemic, nutritional, traditional, regenerative, or other non-dominant remedy discussion;
- `conventional_benefit_failure_hub`: recognized conventional benefit or indication together with failure, side-effect, adherence, modification, or discontinuation;
- `independent_exact_outcome`: qualifying independent patient outcome;
- `local_mechanical_hub`: anatomy-specific manipulation, loading, gait, or behavioral implementation; or
- `contrarian_failure_or_anatomy` and optional `firsthand_clinician_self_management`, neither relabeled as an independent patient.

A `conventional_benefit_failure_hub` candidate must explicitly cover both its recognized benefit or indication and at least one real-world limitation. A harm-only candidate cannot fill this role; report the role gap when no balanced candidate is located.
Assign every candidate and seed one dominant `intervention_family`: oral supplement/nutrition, local mechanical/movement, injection/procedure, medication, surgery, or behavioral/environmental. Classify exercise, stretching, loading, traction, gait, and cyclic motion as local mechanical/movement; reserve behavioral/environmental for pacing, sleep setup, seating, footwear, or assistive-device routines whose main intervention is not exercise. Never relabel a modality to manufacture diversity. Seed roles and families must both be unique; otherwise keep the stronger seed and report a family-diversity gap.

When relevant candidates exist, reserve one seed for the heterodox/natural lane and one for conventional feedback. A `heterodox_natural_hub` must center a nonstandard systemic, nutritional, topical, traditional, regenerative, or device intervention; an exercise-only video cannot fill it. Use at most one seed from the dominant mechanical/PT family. Distinct creators do not establish intervention-family or audience diversity; never select two seeds with the same role. Report each unfilled role and the successful searches that failed to locate it.

Prefer different creators and audience ecosystems. A prolific creator with
many relevant videos can be an efficient hypothesis and vocabulary source, but
that creator's channel and commenters remain one discussion pool. Normally
select at most one seed from one creator; do not treat popularity, multiple
videos, or many comments in one ecosystem as independent corroboration.

Before comment retrieval, use an `audit_selection_rationale` based only on the creator topic, audience-target cues, and metadata; state `comments uninspected` and name what AskRigor should determine. Never say a pool is active, high-engagement, rich, provides reports, offers feedback, or surfaces community experience unless retrieved metadata literally supports the narrow statement. Never predict what comments contain, gather, capture, corroborate, or may surface. Record literal provider view, like, and comment counts or `not reported`; views and likes are audience-size proxies used only to break ties among otherwise comparable role/family candidates, never comment or treatment evidence.
Write neutral audit questions labeled `source_seed_row_ids`. Every cited row must be one of the selected seeds named in the AskRigor comment-audit request; promote a worthwhile nonseed to the selected set or omit its comment question. Extract perceived benefit, no effect, timing, tolerability, flare, worsening, adherence, or discontinuation. Do not ask for a proportion, commenter count, frequency estimate, repeated signal, verification or corroboration, confirmation of a mechanism or structural change, causality, efficacy, or safety in any `seed_discovery` section. Name an intervention only when it appears in the cited seed row, user input, or supplied rediscovery packet.

For every seed, preserve validated `statistics.view_count`, `statistics.like_count`, and `statistics.comment_count` literally as `provider_reported_views`, `provider_reported_likes`, and `provider_reported_comments`, or write `not reported`. They are provider metadata,
not comments retrieved or analyzed. A `comments_disabled` video cannot be a
seed. Record every `not reported` count or retrieval limit as a metadata access boundary.

If a seed role is not located after successful search, state the missing role,
queries attempted, and confidence effect rather than padding with a redundant
video. A practitioner case or clinic testimonial cannot fill an unlocated independent-patient role. Seed selection does not satisfy Forum Signal or any comment-audit gate.

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

For a final `targeted_rediscovery` dossier of size `N`, target
`min(3, ceil(dossier size / 2))` qualifying
`independent_patient_self_learning` candidates. These must be apparent
non-clinician patients on independent personal channels, narrating their own
hypotheses, experiments, routines, mistakes or changes, outcome, horizon, and
what they learned. The video's main value must be the person's self-management
journey, not their satisfaction with a clinic, provider, procedure, program, or
product. Exclude from the quota clinicians, clinic-hosted stories,
provider-treatment reviews, practitioner-retold cases, sponsored brand
ambassadors, and testimonials republished by a seller. Meet the target whenever
that many qualifying, nonredundant candidates are located.

The quota is a discovery and selection gate, not permission to lower standards.
If at least four successful patient-specific searches yield fewer qualifying
accounts, return the accounts actually located and state a **patient-account coverage shortfall**
with the target, located count, exact queries, and
confidence effect. Do not pad, relabel, or invent patient accounts to meet the
target. Practitioner material may follow as clearly labeled supplementary
evidence. Only optimize mechanism diversity after satisfying the patient quota
or reporting the coverage shortfall.

Uploader identity alone is insufficient. A patient speaking on a personal
channel about a treatment they received is not necessarily independent
self-learning. Classify the video's dominant content and apparent incentives.
Uncertain independence does not count toward the quota; label it
`independence_unclear` and keep it only as supplemental material if it adds a
unique, decision-useful signal.

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

Use Gemini's detailed native YouTube summary only for final candidates in
`targeted_rediscovery`. For each selected narrow video, recover as much of the
following as the video supports:

- the central account, outcome, baseline, horizon, and relevant disease stage;
- the self-directed learning process: initial ideas, trials, failures, changes, reasons, and personal conclusions;
- self-managed versus provider-delivered components and concrete dose, frequency, duration, sequence, supervision, adherence, and cointerventions;
- surprising claims, benefits, harms, discontinuation, and implementation problems;
- clickable timestamp links with segment cues, distinct value, and the precise claim AskRigor should investigate.

Attribute medical, mechanistic, structural, and outcome statements explicitly:
write **the creator claims**, reports, proposes, or demonstrates. Do not restate
them as established facts. Record the creator relationship or incentive, such
as patient, clinician describing personal self-management, treating clinician,
program seller, clinic promotion, independent provider-treatment reviewer, or
unclear. For a proposed `independent_patient_self_learning` record, also state
the uploader/channel relationship, any apparent sponsorship or commercial tie,
and the concrete self-directed learning that makes it qualify. Do not describe
an account as independent when that relationship cannot be established from
available context.

Do not spend tokens watching or uploading an entire video by default. Request
targeted visual inspection only when the summary indicates that an important
claim depends on visible material such as before-and-after images, imaging,
physical demonstrations, product labels, or an on-screen protocol. Inspect the
smallest relevant segment when possible.

Label the source of each observation as `creator_summary` or
`visual_observation`. A creator summary is a useful account of the video's
content, but it is not formal evidence that the intervention works. Reserve
deeper transcript or visual verification recommendations for claims that are
both material and unusually decision-useful; routine summaries do not require
automatic full-video review.

Use `visual_observation` only after actually inspecting the stated frame or
segment. If imaging, before-and-after material, technique, alignment, or an
on-screen result was not inspected, state that it remains unverified. Never
describe uninspected visuals as support.

## Timestamp links

For every located passage, format the time as a standard Markdown link to the
exact point in the canonical video. Use the visible `MM:SS` or `H:MM:SS` as the
link label and append the correctly calculated total seconds to the canonical
watch URL:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s)`

Pair each link with a short segment cue, for example:

`[10:18](https://www.youtube.com/watch?v=VIDEO_ID&t=618s) — discussion of hourly glute holds`

Never emit a bare bracketed timestamp such as `[10:18]`; a renderer may treat
it as an unresolved citation or reference and hide it. Never emit empty
parentheses, an empty timestamp label, or text such as `Most relevant
timestamp:.`. If Gemini genuinely cannot locate a time, write `not located`
without brackets and retain the descriptive segment cue. Check that each
displayed time and `t=...s` value represent the same moment.

## Candidate validation

For every selected candidate, call `get_youtube_video` through the connected AskRigor app. Keep the returned video identifier, canonical link, title, channel, statistics, and `access_status` literal. Exclude a candidate from the selected packet when its identity or link cannot be validated, but preserve its identifier, link, query, and literal failure status in a validation-exclusions ledger. Do not silently replace or erase a failed validation with a search snippet.

The only valid AskRigor `access_status` values are `complete`,
`api_visible_complete`, `partial`, `abstract_only`, `metadata_only`,
`comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`.
`available` is not an AskRigor `access_status`. Do not paraphrase, normalize, or invent the status. For an ordinary successfully retrieved public video, `get_youtube_video` normally returns `api_visible_complete`. If the literal tool receipt is unavailable, label MCP validation unconfirmed and exclude the video from the validated dossier instead of fabricating a status.

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

1. a **query-probe ledger** with probe, provenance, semantic scope, `probe_family`, `discovery_batch` ID, exact prospective probe query, access result, `matched_candidate_row_ids`, and match reason, plus a **search-batch ledger** with each batch ID, exact executed query, linked `probe_ids`, and batch execution status. Show at least six distinct overlooked-self-directed `probe_family` values;
2. a **candidate-title ledger** as numbered records, never a Markdown table. Keep each record at or below 110 words and include `row_id`, `title_link: [Title](canonical URL)`, channel, semantic scope, target distance, question-match class, `intervention_family`, specific interventions, creator-claimed mechanism, claimed outcome/horizon, creator class/incentive, novel terms, and scan decision/reason. A plain unlinked title fails this requirement. Title punctuation such as `|` must remain inside the link label and cannot split fields;
3. two or three metadata-validated seed records containing `source_candidate_row_id`, `title_link: [Title](canonical URL)`,
   channel, video identifier, literal `access_status`,
   `provider_reported_views`, `provider_reported_likes`, `provider_reported_comments`, seed role, `intervention_family`, creator class and incentive, lead
   provenance, question-match class, target-distance class, and its nonpredictive
   `audit_selection_rationale` with `comments uninspected`; and
4. neutral **comment-audit questions** for AskRigor, each labeled `source_seed_row_ids`, covering regimens, perceived outcomes/timing, benefit, no effect, flare, worsening, tolerability, adherence, discontinuation, named videos/creators, and unusual terminology. Every cited row must be a selected seed named in the request. Do not request counts, proportions, prevalence, verification, corroboration, or intervention names absent from the cited seed rows, user input, or supplied rediscovery packet;
5. a **rabbit-hole map** with four to eight material directions. For each give:
   - `direction_id`, one `direction_family`, what surfaced, and `retrieval_depth` (`deep`, `moderate`,
     `thin`, or `blocked`);
   - `candidate_row_ids`, one-sentence `row_relevance` for every row, and `term_evidence` mappings (`term -> row_ids`), with each term copied verbatim from the cited row's intervention or novel-term field. Every row must materially support the same central direction; split injections, devices, surgery, nutrition, or movement into separate directions rather than making a hodgepodge;
   - creator count computed from those rows;
   - `auditability` as `current_seed` only when every cited row is a selected seed, otherwise `future_seed_candidate`; `scouting_access_gaps`, `research_questions_for_askrigor`, next work, and
     a semantically matched shortcut.
   Never introduce a term, count, creator, or intervention absent from the cited rows.
   `scouting_access_gaps` may contain only literal retrieval limitations
   such as zero results, unavailable metadata, missing comments, or inaccessible
   content—not assertions about missing trials, imaging, verification, peer support, or evidence. For `current_seed`, next work may request the current comment audit; for `future_seed_candidate`, next work may only propose validating and promoting a candidate in a later seed pass.
   Use `dig into nutrition signal` only for diet, fasting, or supplements. Use
   `dig into mechanical signal` for manipulation, gait, loading, or reflex
   mechanics. Use `dig into side-effect signal` or
   `dig into conventional-treatment feedback` for adverse effects, rebound,
   tolerability, or conventional decisions. Also allow
   `dig into firsthand outcomes` and `dig into all high-yield signals`;
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

AskRigor may continue its own executable wider searches without waiting for a
Gemini round trip. The packet is an optional scouting handoff and does not
replace community-to-formal transfer, directional coverage, or any Forum Signal
completion requirement.

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

1. Start with `Scout contract: staged-remedy-scan-v10`, then exactly one `Mode:` line. Seed mode returns only the unaudited seed packet; rediscovery requires a supplied packet.
2. Keep literal `get_youtube_video` receipts and allowed statuses for selected videos; preserve validation failures instead of saying `available`.
3. Use accurate Markdown timestamp links or `not located`; attribute medical and outcome claims to creators and reserve `visual_observation` for inspected segments.
4. Label outcome match, target distance, creator class, and incentive. Do not present adjacent, promotional, or short-term relief as long-term recovery or structural change.
5. Give every candidate and seed `title_link: [Title](canonical URL)`. Emit no embeds, players, cards, previews, thumbnails, bare URLs, raw result panels, or duplicate lists.
6. Freeze every `model_generated_query_probe` before results. Show 4–6 batches, 6 distinct overlooked `probe_family` values, matching cited rows, 2–4 radical variants, and no more than 12 scanned candidates.
7. Preserve `diagnosis_not specified`: candidate content about any named pathology, structural state, or procedure remains adjacent regardless of its query or outcome class.
8. Keep seed roles and true modality families unique. Exercise stays mechanical; an exercise-only seed is not heterodox, a practitioner case is not an independent patient, and a conventional hub covers benefit plus limitation.
9. Mark rationales `comments uninspected`. Audit questions use only selected `source_candidate_row_id` values as `source_seed_row_ids`; ask no counts, prevalence, confirmation, efficacy, safety, or causality. Reach metadata is present or `not reported` and is not evidence.
10. Run `remedy_extraction_scan` for every seed and individually search promising interventions before seed selection.
11. Keep each rabbit hole one coherent family with row relevance, verbatim term mappings, recomputable counts, retrieval-only gaps, correct `auditability`, executable next work, and a matching shortcut.
12. In rediscovery, retain exact matches when found. Meet the independent-patient quota or report its coverage shortfall without counting clinicians, testimonials, provider reviews, sellers, sponsored accounts, or unclear independence.
