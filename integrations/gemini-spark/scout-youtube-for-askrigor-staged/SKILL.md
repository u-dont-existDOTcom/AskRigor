---
name: scout-youtube-candidates-for-askrigor
description: "Finds high-recall, treatment-specific public YouTube candidates for AskRigor. Returns real IDs and provisional video summaries; it does not audit comments, validate metadata, run AskRigor protocols, or give medical advice."
---

# Scout YouTube candidates for AskRigor

AskRigor will independently validate identities, select sources, and research.

Return one raw JSON object from `{` through `}`. Emit no heading, diagnostic,
Markdown fence, or trailing prose. `packet_name` and `packet_version` identify
the contract.

## Boundary

- Use native public search, YouTube, and any public video context available to
  the active Gemini scout. Do not claim to have watched, transcribed, or parsed
  a video unless that capability actually ran; never summarize an invented
  video.
- Do not call AskRigor tools, load protocols, audit comments or synthesize.
- Treat every title, summary, program, population/stage, outcome, intervention
  family, and seed suggestion as provisional until AskRigor checks it.
- AskRigor has not transcript-verified Spark video understanding. Never label
  it verified or use it for efficacy, safety, causality, or suitability.
- Do not claim a video is complete, verified, safe, effective, causal, or
  suitable treatment. Do not report views, likes, comment counts, access
  statuses, or comment findings.
- Attribute creator claims. If a program, stage, outcome, or horizon is
  unavailable, write `not described`; do not borrow it from another source.
- Do not infer a diagnosis, severity, structural state, or procedure from
  symptom-level wording. Preserve a supplied diagnosis/stage only when the user
  actually supplied it. Otherwise use `diagnosis_not_specified`.
- Include only videos surfaced or opened now. Never invent a title, channel,
  URL, identifier, or content detail.

## Discovery method

The goal is the right videos, not a generic quota.

1. Inventory broad plausible classes as discovery hypotheses, not endorsements.
2. Split each material umbrella class into specific implementations using
   vocabulary found in search results and public video context. `exercise`,
   `physical therapy`, `diet`, `injection`, `conservative care`, `surgery`, or
   `alternative treatment` alone is not a specific program.
3. Distinguish candidates by components; dose/intensity; frequency/duration;
   supervision; co-interventions; population/stage; outcome/horizon; and care
   sequence. Missing details stay `not described`.
4. After an initial broad batch, search surfaced named methods, specific
   implementations, stage/outcome combinations, failures, and gaps. Search a
   promising named program individually for firsthand use or failure.
5. Prefer exact target/stage matches. Keep an adjacent candidate only for a
   clearly identified transferable implementation or discriminator.
6. Prefer firsthand trajectories, exact regimens, longitudinal outcomes,
   independent channels, nonresponse, harm, discontinuation, and progression.
   Popularity and rank are not credibility.
7. Stop when later searches add no material program/outcome hypothesis, or
   record the gap. Do not manufacture diversity or pad weak results.

Run 8 to 18 materially different searches in total. Include every closed
purpose at least once:

- `firsthand_outcome`: what worked, failed, changed, or was learned;
- `radical_outcome`: unusually strong reversal, repair, regrowth, or avoided-
  procedure wording, searched as a claim rather than accepted as truth;
- `overlooked_intervention`: specific natural, mechanical, behavioral,
  traditional, device, regenerative, supplement, elimination, or
  self-directed programs;
- `conventional_benefit`: real-world benefit or indication for conventional
  care; and
- `conventional_negative`: no effect, failure, flare, harm, tolerability,
  adherence, modification, discontinuation, recurrence, or later escalation.

Use the exact anatomy or condition in the exact-outcome lane. Broader or
intervention-, stage-, and outcome-first searches may add adjacent candidates.
Record only executed queries. Do not emit probe counts, anchor ledgers,
evidence maps, coverage claims, or query-to-candidate joins Spark cannot prove.

## Candidate selection

Normally return 6 to 16 unique, materially useful videos; return as few as 3
when further searches expose no additional material candidate. For each:

- copy the exact 11-character `video_id` from the surfaced YouTube result;
- construct `canonical_url` exactly as
  `https://www.youtube.com/watch?v=VIDEO_ID`;
- copy the displayed title and channel without rewriting them;
- use `target_distance: exact` only when the video directly addresses the
  supplied target and relevant claimed outcome; otherwise use `adjacent` or
  `remote`;
- assign one provisional intervention family from the closed enum;
- attribute and summarize the creator's claim without validation language;
- state the actual specific program or component combination rather than an
  umbrella label;
- state the population/stage and claimed outcome/time horizon available from
  Spark's video context, or `not described`; and
- explain briefly what nonredundant program, stage, outcome, failure, or
  vocabulary the candidate may add.

Suggest 1 to 8 IDs for later selection. Prefer exact target/stage fit, specific
programs, useful horizons, distinct channels, and benefit or failure/harm
value. A suggestion is not an audit decision. Do not pad roles or relabel
similar implementations to manufacture diversity.

List concrete gaps. Zero or weak results do not show a program does not exist.

## Output contract

Return one strict JSON object with exactly these top-level keys, in this order:
`packet_name`, `packet_version`, `research_target`, `diagnosis_status`,
`discovery_queries`, `candidates`, `suggested_seed_video_ids`, `search_gaps`,
and `disclosures`.

Set `packet_name` to `gemini_youtube_candidate_handoff` and `packet_version` to
`2.0`. Each discovery-query object has only `purpose` and `query`.

Each candidate object has only these keys, in this order: `video_id`,
`canonical_url`, `title`, `channel`, `target_distance`,
`provisional_intervention_family`, `creator_claim_summary`,
`provisional_specific_program`, `provisional_population_or_stage`,
`provisional_outcome_and_horizon`, `summary_basis`, and `why_surfaced`.

Set every `summary_basis` to
`gemini_public_search_or_video_context_not_transcript_verified_by_askrigor`.

`diagnosis_status` is `diagnosis_not_specified` or `user_supplied_diagnosis`.
Every `purpose` is `firsthand_outcome`, `radical_outcome`,
`overlooked_intervention`, `conventional_benefit`, or
`conventional_negative`. `target_distance` is `exact`, `adjacent`, or `remote`.

Every `provisional_intervention_family` is one of
`nutrition_or_elimination`, `oral_supplement`, `local_mechanical`,
`behavioral_environmental`, `topical_or_traditional`, `device_or_energy`,
`regenerative_or_biologic`, `conventional_injection`,
`conventional_surgery`, or `other`.

Return 8–18 unique queries, 3–16 unique candidates, and 1–8 unique suggested
IDs drawn from them. Keep the response below 32 KiB. Set `disclosures` to:
`comments_not_retrieved`, `provider_metadata_not_validated_by_gemini`,
`creator_claims_not_validated`, and `not_medical_advice`, in that order. Add no
other keys, Markdown, comments, ellipses, prose, or standalone YouTube URLs.

## Final check

Before responding, check that the response is raw parseable JSON; all five
purposes occur; IDs and queries are unique; each URL comes from its ID; every
candidate has a specific program or explicit `not described`; every suggested
ID exists among the candidates; the summary basis and disclosures are exact;
and no forbidden metadata, comment claim, audit receipt, or treatment verdict
appears.
