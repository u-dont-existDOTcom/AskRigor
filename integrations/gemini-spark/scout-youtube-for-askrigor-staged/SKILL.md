---
name: scout-youtube-candidates-for-askrigor
description: "Finds a small, high-recall set of public YouTube candidates for a separate AskRigor research agent. Use when a health, recovery, implementation, tolerability, harm, discontinuation, or real-world outcome question may benefit from firsthand or overlooked creator material. Returns candidate IDs and explicitly provisional annotations only; it does not audit comments, validate provider metadata, run AskRigor protocols, or give medical advice."
---

# Scout YouTube candidates for AskRigor

Find useful public YouTube candidates. AskRigor will independently validate the
packet and decide what merits protocol-governed research.

Return one raw JSON object. Its first non-whitespace character is `{` and its
last is `}`. Emit no heading, diagnostic line, Markdown fence, or trailing
prose. The strict `packet_name` and `packet_version` fields identify the
contract.

## Boundary

- Use native public search and YouTube capabilities available in Spark.
- Do not call AskRigor tools. AskRigor performs provider validation after the
  handoff.
- Do not load or interpret Universal or HRP, decide which protocol modules
  apply, audit comments, or produce the final AskRigor evidence synthesis.
- Treat titles, channels, content summaries, intervention families, and seed
  suggestions as provisional until AskRigor checks them.
- Do not claim a video is API-visible, public, complete, verified, safe,
  effective, causal, or suitable treatment. Do not report views, likes, comment
  counts, access statuses, or comment findings.
- Describe only claims made by the creator. Do not convert a creator claim into
  a medical fact or recommendation.
- Do not infer a diagnosis, structural state, or procedure from symptom-level
  wording. For a prompt such as `how can I fix my bad hip`, preserve `bad hip`
  or `hip pain` and use `diagnosis_not_specified`.
- Include only videos surfaced or opened in the current task. Never invent a
  title, channel, URL, video identifier, search result, or content detail.

## Discovery

Run 6 to 12 materially different searches. Include at least one search for each
closed purpose:

- `firsthand_outcome`: independent experience, what worked, what failed, or
  what the person learned;
- `radical_outcome`: unusually strong reversal, repair, regrowth, or avoided-
  procedure wording, searched as a claim rather than accepted as truth;
- `overlooked_intervention`: natural, mechanical, behavioral, traditional,
  device, regenerative, supplement, elimination, or self-directed approaches;
- `conventional_benefit`: real-world benefit or indication for conventional
  care; and
- `conventional_negative`: no effect, failure, flare, harm, tolerability,
  adherence, modification, discontinuation, or recurrence after conventional
  care.

Use the user's exact anatomy or condition in the exact-outcome lane. Broader
condition, anatomy, symptom, and intervention-first searches may add adjacent
candidates. Search promising intervention names individually when that can
surface firsthand use or failure reports. Prefer candidate diversity over many
near-duplicate tutorials.

Record only queries actually executed. The packet does not contain probe
counts, anchor ledgers, inferred coverage, or query-to-candidate joins.

## Candidate selection

Return 3 to 12 unique videos. For each candidate:

- copy the exact 11-character `video_id` from the surfaced YouTube result;
- construct `canonical_url` exactly as
  `https://www.youtube.com/watch?v=VIDEO_ID`;
- copy the displayed title and channel without rewriting them;
- use `target_distance: exact` only when the video directly addresses the
  supplied condition or symptom and claimed outcome; otherwise use `adjacent`
  or `remote`;
- assign one provisional intervention family from the closed enum in the output
  contract;
- summarize the creator's claim with attribution and no validation language;
  and
- say briefly why the candidate may expand AskRigor's evidence frontier.

Suggest 1 to 4 candidate IDs as possible comment-audit seeds. Prefer distinct
channels and a useful mix of firsthand outcome, unconventional discussion hub,
and conventional benefit/failure feedback when actually found. This suggestion
is not an audit decision. Do not pad missing roles or manufacture diversity by
relabeling exercise, stretching, loading, traction, gait, or somatic work as
behavioral.

List concrete search gaps observed in this run. A zero-result query is a search
gap, not evidence that no such video exists.

## Output contract

Return one strict JSON object with exactly these top-level keys, in this order:
`packet_name`, `packet_version`, `research_target`, `diagnosis_status`,
`discovery_queries`, `candidates`, `suggested_seed_video_ids`, `search_gaps`,
and `disclosures`.

Set `packet_name` to `gemini_youtube_candidate_handoff` and `packet_version` to
`1.0`. Each discovery-query object has only `purpose` and `query`. Each
candidate object has only `video_id`, `canonical_url`, `title`, `channel`,
`target_distance`, `provisional_intervention_family`, `creator_claim_summary`,
and `why_surfaced`.

`diagnosis_status` is `diagnosis_not_specified` or
`user_supplied_diagnosis`.

Every `purpose` is one of `firsthand_outcome`, `radical_outcome`,
`overlooked_intervention`, `conventional_benefit`, or
`conventional_negative`. Include all five across 6 to 12 query objects.

Every `target_distance` is `exact`, `adjacent`, or `remote`.

Every `provisional_intervention_family` is one of
`nutrition_or_elimination`, `oral_supplement`, `local_mechanical`,
`behavioral_environmental`, `topical_or_traditional`, `device_or_energy`,
`regenerative_or_biologic`, `conventional_injection`,
`conventional_surgery`, or `other`.

Return 6 to 12 unique query objects, 3 to 12 unique candidate objects, and 1 to
4 unique suggested IDs drawn from those candidates. Keep the complete response
below 32 KiB. Set `disclosures` to exactly these four strings in this order:
`comments_not_retrieved`, `provider_metadata_not_validated_by_gemini`,
`creator_claims_not_validated`, and `not_medical_advice`. Add no keys, Markdown,
comments, ellipses, trailing commas, prose, tables, embeds, cards, thumbnails,
or standalone YouTube URLs.

## Final check

Before responding, check that the response is raw parseable JSON,
all five search purposes occur, IDs and queries are unique, every URL is derived
from its ID, every suggested ID exists among the candidates, all required
disclosures are exact, and no forbidden metadata or comment claim appears.
