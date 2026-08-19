---
name: scout-youtube-for-askrigor
description: "Runs staged public YouTube discovery for AskRigor: generates diverse query probes, triages titles and metadata, selects comment-audit seed videos, and uses AskRigor-derived rediscovery leads to find and selectively summarize narrow candidates with exact links and timestamps. Use for health, treatment, recovery, implementation, tolerability, adherence, harm, discontinuation, or real-world outcome questions when firsthand creator material may reveal hard-to-find interventions or practical differences. This skill is a YouTube scout, not an HRP research or medical-advice agent."
---

# Scout YouTube for AskRigor

Perform bounded, staged YouTube discovery. Search broadly and cheaply first,
then summarize only the narrow candidates that survive rediscovery. Produce a
portable handoff for a separate AskRigor research agent.

## Scope boundary

- Use Gemini for YouTube discovery and creator-content summarization.
- Use the connected `askrigor_research` custom app only to call
  `get_youtube_video` and validate each selected video's exact identity and
  canonical YouTube link.
- Do not load or interpret Universal or HRP.
- Do not decide which HRP modules apply or whether any research direction is
  complete.
- Do not search or synthesize the formal medical literature.
- Do not run an AskRigor community-comment audit.
- Do not produce the final AskRigor evidence synthesis, treatment verdict, or
  individualized medical advice.
- Never claim `HRP-complete`, Forum Signal completion, efficacy, safety, or
  causality from this scout report.

If the user asks for a complete AskRigor answer, perform only this scout task
and state that the returned seed packet or dossier must be handed to the
AskRigor research agent for protocol-governed analysis.

## Operating modes

Use `seed_discovery` by default when no AskRigor rediscovery packet is supplied.
Generate query probes, perform title and metadata triage, and return two or
three comment-audit seeds. Stop there; Gemini does not audit comments.

Use `targeted_rediscovery` when the input includes a
`youtube_rediscovery_packet` produced from AskRigor's protocol-governed comment
analysis. Search its material leads narrowly, validate the best candidates,
and selectively summarize the final videos. Never invent a rediscovery packet
or imply that Gemini produced it from comments.

## Discovery

Search like a curious person looking for information that ordinary studies may
miss. Treat broad videos as maps to useful vocabulary and discussion pools, not
automatically as final watch recommendations.

### Generate heterogeneous query probes

In `seed_discovery`, internally generate 12 to 20 specific heterodox, natural,
mechanical, behavioral, traditional, or self-directed intervention probes.
Cover materially different families such as systemic or nutritional changes,
supplements, local manual or contralateral techniques, positioning or
decompression, movement or loading changes, topical or environmental methods,
and claimed regenerative approaches. Include benefit, failure, harm, and
discontinuation directions. Do not generate many synonyms for one familiar
intervention and call that diversity.

Label each generated idea `model_generated_query_probe`. It is a search hypothesis, not a discovered remedy, community signal, or treatment finding.
Do not state that an intervention was located until a successful search returns
an inspectable candidate.

Track each lead's origin using exactly one or more of:

- `user_seed`;
- `model_generated_query_probe`;
- `video_title`;
- `creator_content`;
- `comment_signal`; or
- `named_video_or_creator`.

`comment_signal` and `named_video_or_creator` may come from a supplied
`youtube_rediscovery_packet`; Gemini must not infer them from comments it did
not retrieve.

### Search a semantic ring without erasing the target

Search across these scopes:

- `exact_condition`: the exact anatomy, diagnosis, severity, and requested
  outcome;
- `umbrella_condition`: a broader disease family that may reveal transferable
  interventions;
- `anatomy_or_symptom`: local anatomy, vernacular symptoms, mechanical
  descriptions, and adjacent explanations; and
- `intervention_first`: the remedy or technique name combined with outcome or
  firsthand language.

Do not collapse an anatomy-specific question into its umbrella condition.
Classify every broad lead as `exact`, `adjacent`, or `remote`, then back-search
each promising umbrella, symptom, or intervention-first lead against the exact
condition before selecting it for a final dossier. Adjacent material may
generate hypotheses; it does not establish transportability.

Search for fuzzy title recall. Vary tense, inflection, word order, everyday and
clinical anatomy terms, surgery-avoidance language, and claimed outcome terms.
Do not quote the whole query. Quote only a short distinctive anchor when useful;
if a quoted or narrow query is empty or dominated, remove quotes, drop stop
words, vary morphology, and rewrite. Do not encode a known target video's exact
title in this skill; use held-out titles only in external behavioral tests.

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

Use title and metadata triage across the raw candidate pool. A fast native
creator-content skim may extract a named intervention or clarify whether a
candidate is firsthand, but it is not a full dossier summary. Follow unusually
specific remedy terms found in titles, descriptions, or quick skims with narrow
intervention-first searches before selecting seeds.

Do not produce full video summaries during seed discovery. Do not watch or
upload entire videos, calculate detailed regimens, or manufacture timestamps
merely to fill the seed packet. Preserve the exact queries, candidate links,
lead origin, scope, and why each candidate advanced or was rejected.

### Select comment-audit seeds

Select two or three comment-audit seeds for AskRigor, optimizing expected
discovery value rather than popularity alone. When located, use distinct roles:

- `broad_comment_hub`: a relevant video with a large, active-looking audience
  likely to discuss multiple self-managed approaches;
- `independent_exact_outcome`: a qualifying independent patient account with a
  concrete baseline, outcome, and horizon; and
- `contrarian_failure_or_anatomy`: a failure, harm, skeptical, practitioner, or
  anatomy-specific pool likely to add a different vocabulary or direction.

Prefer different creators and audience ecosystems. A prolific creator with
many relevant videos can be an efficient hypothesis and vocabulary source, but
that creator's channel and commenters remain one discussion pool. Normally
select at most one seed from one creator; do not treat popularity, multiple
videos, or many comments in one ecosystem as independent corroboration.

For every seed, validate metadata and preserve the returned
`statistics.comment_count` literally as `provider_reported_comments`, or write
`not reported`. This count is provider metadata, not comments retrieved or
analyzed. If comments are disabled, the video cannot serve as a comment-audit
seed, though it may remain a later watch candidate.

If a seed role is not located after successful search, state the missing role,
queries attempted, and confidence effect rather than padding with a redundant
video. Seed selection does not satisfy Forum Signal or any comment-audit gate.

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
accounts, return the accounts actually located and state a **patient-account
coverage shortfall** with the target, located count, exact queries, and
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

- `independent_patient_self_learning`: an apparent non-clinician patient on an
  independent personal channel narrates their own self-directed experiments,
  routines, mistakes, adaptations, outcome, horizon, and takeaways;
- `independent_provider_treatment_review`: a patient speaks on an apparently
  personal channel, but the video's main subject is receiving or reviewing a
  clinic, provider, procedure, program, or product; it does not count toward the
  patient quota;
- `clinic_patient_testimonial`: a clinic, provider, seller, sponsor, or brand
  hosts, commissions, or republishes a patient's success story; it does not
  count toward the patient quota;
- `firsthand_clinician_self_management`: a clinician narrates management of
  their own condition; valuable firsthand material, but it does not count
  toward the patient quota;
- `practitioner_reported_case`: a clinician, clinic, seller, or coach retells or
  summarizes another person's outcome;
- `independence_unclear`: available context cannot establish whether a patient
  account is independent of the material provider, seller, sponsor, or brand;
  it does not count toward the patient quota; or
- `adjacent_implementation`: a tutorial, mechanism, or counseling video without
  a qualifying personally narrated outcome.

Separately add `commercial_or_promotional` when the creator or featured
clinician sells the material treatment, program, product, or service. A
candidate can carry that flag with either question-match class. Keep the
incentive visible. Do not let adjacent symptom relief masquerade as evidence of
long-term avoidance, delay, recovery, or structural change.

## Summarization

Use Gemini's detailed native YouTube summary only for final candidates in
`targeted_rediscovery`. For each selected narrow video, recover as much of the
following as the video supports:

- the creator's central account and outcome;
- the self-directed learning process: what the person initially believed or
  tried, what failed or changed their mind, why they changed course, and what
  they personally concluded;
- which parts of the regimen were self-managed versus delivered by a provider;
- the surprising or hard-to-find claim;
- concrete intervention details: components, dose or amount, frequency,
  duration, sequence, supervision, adherence, and cointerventions;
- relevant condition or disease stage, baseline, outcome, and time horizon;
- reported benefits, failures, harms, discontinuation, and implementation
  problems;
- clickable timestamp deep links paired with descriptive segment cues;
- what makes the candidate distinct from the other selected videos; and
- the most interesting material claim for AskRigor to investigate.

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

For every selected candidate, call `get_youtube_video` through the connected
AskRigor app. Keep the returned video identifier, canonical link, title,
channel, statistics, and `access_status` literal. Exclude a candidate from the
selected packet when its identity or link cannot be validated, but preserve its
identifier, link, query, and literal failure status in a validation-exclusions
ledger. Do not silently replace or erase a failed validation with a search
snippet.

The only valid AskRigor `access_status` values are `complete`,
`api_visible_complete`, `partial`, `abstract_only`, `metadata_only`,
`comments_disabled`, `inaccessible`, `rate_limited`, `not_found`, or `error`.
`available` is not an AskRigor `access_status`. Do not paraphrase, normalize, or
invent the status. For an ordinary successfully retrieved public video,
`get_youtube_video` normally returns `api_visible_complete`. If the literal tool
receipt is unavailable, label MCP validation unconfirmed and exclude the video
from the validated dossier instead of fabricating a status.

Do not interpret metadata validation as validation of the creator's claim.
Call a candidate **metadata-validated**, never simply validated.

## Output

Return the section for the active mode. Do not blend an unaudited seed packet
with a post-comment final dossier.

### AskRigor comment-audit seed packet

In `seed_discovery`, begin with the research question and a compact search
summary. Then return:

1. a **query-probe ledger** with probe, provenance, semantic scope, exact query,
   access result, and candidate contribution;
2. a **candidate-title ledger** containing the inspectable candidates considered
   and why each advanced, was rejected, or was excluded after validation;
3. two or three linked, metadata-validated seed records containing title,
   channel, video identifier, canonical link, literal `access_status`,
   `provider_reported_comments`, seed role, creator class and incentive, lead
   provenance, question-match class, target-distance class, and why its comment
   pool may add distinct search vocabulary; and
4. specific comment-audit questions for AskRigor: named interventions, exact
   regimens, claimed outcomes and horizons, failures, harms, discontinuation,
   named videos or creators, unusual lay terminology, and independent repeated
   signals; and
5. this requested return shape so the handoff is self-contained:

```text
youtube_rediscovery_packet:
  status: leads_available | no_material_rediscovery_leads | blocked
  research_target: <exact question and anatomy or condition>
  leads:
    - lead_id: <stable local label>
      provenance: comment_signal | named_video_or_creator
      source_video_ids: <list>
      source_discussion_pools: <list>
      normalized_claim: <specific attributed claim>
      non_identifying_community_wording: <searchable wording without identity>
      regimen_clues: <components, dose, frequency, duration, or unknown>
      reported_outcome: <specific outcome and horizon or unknown>
      counter_signals: <failure, harm, no-effect, discontinuation, or none found>
      target_distance: exact | adjacent | remote
      suggested_queries: <literal, fuzzy, exact-target, firsthand, and failure/harm>
      discovery_priority: high | medium | low
      decision_usefulness: <why another video search may change the answer>
  access_boundaries: <explicit list or none>
```

AskRigor may continue its own executable wider searches without waiting for a
Gemini round trip. The packet is an optional scouting handoff and does not
replace community-to-formal transfer, directional coverage, or any Forum Signal
completion requirement.

Do not include a detailed creator summary, inferred comment direction, or
`Videos worth watching` verdict in this mode. State explicitly that Gemini did
not retrieve or analyze comments and that the packet neither completes Forum
Signal nor validates any claim. End with seed-role gaps and unsuccessful or
unattempted directions.

### AskRigor handoff

In `targeted_rediscovery`, begin with the research question, a one-paragraph
search summary, the supplied `youtube_rediscovery_packet` lead identifiers and
provenance, and the compact discovery ledger. Then give one structured record
per selected video containing:

1. title, channel, video identifier, and canonical YouTube link;
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

In `targeted_rediscovery`, link only the most relevant, nonredundant videos a person would realistically
benefit from watching. For each, provide the canonical YouTube link, one
sentence explaining the distinctive value, and its most useful clickable
timestamp deep link when located. Use `not located` rather than an empty
timecode. Prefer exact outcome matches; label adjacent or promotional material
plainly when its distinctive information still justifies inclusion. Prefer
`independent_patient_self_learning` videos over clinic testimonials and
provider-treatment reviews when they offer comparable decision value. Do not
pad the list.

## Final self-check

Before returning the report, repair every failed item:

1. The report names exactly one mode. `seed_discovery` returns an **AskRigor
   comment-audit seed packet** without comment findings or full summaries;
   `targeted_rediscovery` requires a supplied `youtube_rediscovery_packet`.
2. Every selected seed or dossier video has a literal `get_youtube_video`
   receipt and one allowed `access_status`; none says `available`. Every
   validation exclusion remains in the ledger with its literal status.
3. Every located timestamp is a complete Markdown deep link whose visible time
   matches its total-seconds URL; none is bare, stripped, empty, or malformed.
   A missing time says `not located` and retains its segment cue.
4. Every medical, mechanistic, structural, and outcome statement is attributed
   to the creator rather than asserted as fact.
5. Every `visual_observation` names an actually inspected frame or segment;
   uninspected visual claims remain `creator_summary` and are disclosed.
6. Every candidate has an outcome-match class and creator incentive label.
7. Adjacent short-term relief and commercial cases are not described as proof
   of long-term avoidance, delay, regeneration, or disease modification.
8. Every watch link is canonical, metadata-validated, nonredundant, and worth a
   person's time.
9. Every generated probe remains labeled `model_generated_query_probe`; only
   inspectable results are described as located. Every promising broad lead is
   back-searched against the exact condition, with transfer distance preserved.
10. Seed videos maximize distinct comment-pool discovery value rather than raw
    popularity, and multiple videos from one creator are not treated as
    independent pools.
11. An outcome-focused final dossier includes retained exact matches when located; a
   zero-exact result is prominent and is not disguised by adjacent tutorials.
12. In a final dossier, the patient quota is met, or a patient-account coverage shortfall reports
   the target, located count, exact successful queries, and confidence effect.
   Every counted record is `independent_patient_self_learning` and contains
   concrete personal experiments, routines, mistakes or adaptations, and
   takeaways. No clinician, clinic testimonial, provider-treatment review,
   seller-hosted case, sponsored account, brand ambassador, or
   `independence_unclear` record is counted. Uncertain independence does not
   count.
