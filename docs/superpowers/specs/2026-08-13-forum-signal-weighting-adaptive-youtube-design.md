# Forum-Signal Weighting and Adaptive YouTube Depth Design

## Goal

Make AskRigor preserve useful firsthand evidence as an independent evidence layer, acquire enough YouTube material to support a defensible qualitative report, and continue wider or deeper YouTube research automatically whenever a few more minutes are reasonably likely to improve the answer.

The design must prevent two observed failures:

1. a strong formal result or an unsuccessful bounded literature search erases a promising community signal; and
2. AskRigor retrieves a YouTube corpus but does not tell the user which videos mattered, how much material was available, how much was retrieved, or how much ChatGPT actually analyzed.

## Scope and non-goals

This revision covers:

- a detailed intervention-level evidence-weighing contract in the Forum Signal module;
- one concise anti-erasure invariant in the canonical HRP;
- a two-stage YouTube survey and per-video acquisition flow;
- multi-call continuation without an arbitrary total-time cutoff;
- a required, clickable per-video coverage report;
- deterministic wider/deeper expected-information-gain rules;
- Project, plugin, protocol, MCP, regression, packaging, and deployment updates needed to ship the behavior.

This revision does not add:

- n8n or another external orchestrator;
- paid OpenAI API inference inside the AskRigor server;
- persistent research sessions or stored comment corpora;
- a downloadable comment archive;
- a Sci-Bot or Sci-Hub integration;
- a guarantee that ChatGPT cannot answer without calling a tool.

ChatGPT remains the reasoning and synthesis engine. The AskRigor server remains a read-only acquisition and provenance service.

## Core evidence decision

Use both the detailed Forum Signal module and a narrow HRP invariant. They have different responsibilities and must not duplicate the full workflow.

### Forum Signal responsibility

The Forum Signal module owns acquisition, episode extraction, signal characterization, outcome alignment, formal/community comparison, risk-cost-reversibility assessment, opportunity-cost assessment, and actionability.

For each material intervention it returns:

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
  measurement_and_stop_rules: <explicit text when a trial is reasonable>
```

`support_not_located` means that the executed formal search did not locate directly matching support. It is not a synonym for ineffective, implausible, disproved, or unsupported.

`contradicted` requires directly relevant evidence with materially aligned population, intervention, comparator, outcome, and timeframe. A study about structural joint regeneration does not contradict reports of reduced pain or improved function. An outcome mismatch must be reported as `outcome_mismatch`.

A self-report that an intervention "cured" a condition must be translated into the outcome actually evidenced by the report. Pain resolution, improved walking, restored range of motion, or avoided surgery may be meaningful firsthand outcomes without proving cartilage regeneration or permanent structural cure.

Community signal and formal evidence are compared but are not collapsed into one hierarchy. A promising community signal may justify a low-cost, reversible, time-bounded trial even when matched formal support was not located, provided individual risk is acceptable and the trial does not delay diagnosis, urgent care, or a time-sensitive effective treatment. Safety and actionability are assessed separately for each intervention; gelatin, swimming, dietary restriction, supplements, injections, and surgery do not inherit one another's risk classification.

### HRP responsibility

The canonical HRP receives one compact invariant near its operative evidence-integration rules:

```text
Community signal is an independent evidence layer. Failure to locate matched formal
support must be recorded as support_not_located and must not, by itself, downgrade
the observed community signal. Formal contradiction requires materially aligned
evidence. Final actionability integrates community-signal credibility, matched
formal evidence, risk, cost, reversibility, and the opportunity cost of delay.
```

The HRP continues to govern final synthesis and evidentiary caveats. It must not repeat the Forum Signal acquisition procedure or become the routing mechanism again.

## YouTube architecture

Use a two-stage flow rather than sharing one short acquisition deadline across several videos.

### Stage 1: survey

Add a read-only `survey_youtube_community` tool. It accepts the research question and up to six labeled searches: `general`, `benefit`, `no_effect`, `harm`, `discontinuation`, and `formal_discriminator`.

The tool:

1. retrieves a bounded provider-ranked candidate page for every distinct query;
2. deduplicates video IDs while preserving every query and direction that found each video;
3. retrieves candidate metadata;
4. returns canonical watch URLs, title, channel, publication date, duration when available, provider-reported comment count, access state, limitations, and search cursors;
5. makes no community-signal or medical conclusion.

The survey result clearly states that YouTube discovery is bounded and not an exhaustive platform search. The provider-reported comment count is labeled as provider metadata, not as a guaranteed count of retrievable public comments.

The Forum Signal controller selects up to three materially different videos for the standard pass. Selection considers topical relevance, likely firsthand-report value, independent creators or discussion pools, directional diversity, and comment volume. It must not select only positive videos or treat YouTube's provider rank as a materiality judgment.

### Stage 2: per-video acquisition

Add a read-only `audit_youtube_video_community` tool that audits one selected video per call. Retain `audit_youtube_community` during migration for backward compatibility, but the Project workflow uses the two-stage tools after deployment.

For the initial call, the per-video tool accepts a video ID or canonical URL and an analysis limit. The default and maximum analysis limit is 500 records. It retrieves unfiltered top-level comments and independently paginates accessible replies. Query-bounded comment search is never used as the corpus.

The output distinguishes:

- `provider_reported_comments` from video metadata;
- `top_level_comments_retrieved`;
- `replies_retrieved`;
- `records_retrieved_this_call`;
- `records_retrieved_cumulative`;
- `records_returned_for_analysis`;
- top-level and reply page counts;
- reply-count mismatches;
- extraction coverage and access status;
- whether the chain began at the first page and ended at exhaustion;
- a canonical watch URL and video metadata;
- a continuation token when more pages remain.

When a complete API-visible corpus contains 500 or fewer comments and replies, all records are returned for analysis. When a complete corpus contains more than 500, the tool returns a deterministic chronological sample of 500 and the complete-corpus count and digest. Sampling limits what ChatGPT analyzes, not what the acquisition receipt claims to have retrieved.

For an incomplete call, the tool returns a truthful provisional segment and an opaque continuation token. It must not describe the whole video corpus as complete or characterize unseen comments.

### Stateless continuation

Individual YouTube calls remain bounded below the client timeout, but the overall research pass has no one-minute or other arbitrary wall-clock cutoff. The controller calls the per-video tool repeatedly when continuation is valuable.

Continuation must not require storing comment text or research sessions on the VPS. The opaque token is authenticated by the server and carries only the state needed to resume and verify the chain: video identity, upstream cursor, chain position, cumulative counters, rolling corpus digest state, bounded deterministic-sample identifiers, issue time, and expiry. It contains no API key and no raw comment text. A dedicated runtime secret authenticates tokens. Tokens expire after one hour because a multi-call public comment corpus can change over time; an expired or invalid token produces a truthful restart-required result, never a fabricated completion.

At terminal exhaustion the tool can refetch the bounded deterministic sample identifiers when needed and return the final sample plus a mechanically validated receipt covering the chain from the first page through exhaustion. The receipt reaches `api_visible_complete` only when top-level pagination is exhausted, all accessible reply pages are exhausted, and reply mismatches are empty.

## Adaptive research controller

Elapsed time alone is not a stopping rule. AskRigor automatically spends additional minutes and tool calls when the expected information gain is material to the answer. It does not ask the user for approval merely because another safe, read-only pass may take longer.

### Automatic deeper continuation

Continue deeper on an already selected video when any of these conditions holds:

- the tool returns a continuation token for a materially relevant video;
- provider metadata indicates at least 300 comments may exist but fewer than 300 records have been retrieved;
- fewer than 300 records have been analyzed and additional records are likely available, unless the complete corpus is smaller;
- benefit, no-effect, harm, or discontinuation coverage remains incomplete;
- a community/formal conflict or high-impact discriminator remains unresolved;
- additional replies are likely to change interpretation of a material top-level report.

A materially relevant video with at least 300 available records cannot be presented as a strong qualitative basis when fewer than 300 were retrieved. It is labeled `insufficient_depth` until repaired or a genuine boundary is reached.

### Automatic wider continuation

Run wider YouTube searches without asking when any of these conditions holds:

- a material intervention signal comes from only one creator or discussion pool;
- fewer than two independent materially relevant videos were audited despite plausible candidates;
- one or more directional outcomes remain unexamined;
- comments generate a distinct intervention, subgroup, failure mode, or discriminator that could change actionability or the final ranking;
- the last search page contains additional plausible material candidates;
- formal evidence and the sampled community evidence materially conflict and an independent pool could resolve whether the conflict is isolated.

### Evidence saturation

Stop wider or deeper expansion when:

- all selected material video chains are terminally complete or have a genuine declared access boundary;
- required directional outcomes have terminal states;
- at least two independent discussion pools have been examined for each material signal when such pools are findable;
- two consecutive wider expansions add no new material intervention, outcome pattern, discriminator, contradiction, or actionability change and mostly duplicate known reports;
- remaining candidates are materially less relevant and are unlikely to change the answer or its confidence;
- an upstream quota, access restriction, disabled-comment state, invalid continuation, or other genuine boundary prevents useful progress.

The controller records its stopping rationale. A restrictive query, one small result, or elapsed time is never by itself evidence saturation.

If a genuine boundary prevents completion, the answer uses the bounded partial label required by HRP and identifies the missing corpus and confidence effect. It does not silently substitute a quick answer.

## Required user-facing YouTube report

Every completed Forum Signal answer with material YouTube evidence includes a `Videos worth watching` table. Each row contains:

- a clickable canonical `https://www.youtube.com/watch?v=<video_id>` link using the actual title;
- channel and publication date;
- why the video is decision-useful;
- provider-reported comment count;
- API-visible comments and replies retrieved;
- comments and replies returned to ChatGPT for analysis;
- number of relevant firsthand people or treatment episodes, or `bounded unknown`;
- completion state;
- a short directional summary and important limitation.

The report ranks videos by decision usefulness, not positivity. A video rich in failures, harms, or difficult recovery can rank above a promotional success video.

The answer also includes:

```text
youtube_expansion_report:
  deeper_expansion_performed: yes | no
  deeper_calls: <count>
  deeper_reason: <explicit text>
  wider_expansion_performed: yes | no
  wider_searches: <explicit list>
  wider_reason: <explicit text>
  material_new_information: <explicit text or none>
  further_expansion_likely_to_improve_answer: yes | no | blocked
  stopping_reason: <explicit text>
```

If `further_expansion_likely_to_improve_answer` would be `yes` and the work remains executable, the controller continues instead of finalizing. `yes` is therefore a nonterminal internal state. A final answer may report only `no` or `blocked` and explain why.

Use `retrieved` rather than `downloaded` in v0. AskRigor processes public comments transiently and does not create a user-downloadable archive. Comment-file export is a separate future feature because it changes persistence, output-size, and privacy requirements.

## Synthesis language

For a promising, low-risk, reversible signal with no matched formal support located, the permitted pattern is:

> The forum and YouTube signal for `<intervention>` is promising for `<specific outcome>`. This formal pass did not locate directly matching human evidence; that is an evidence gap, not evidence that the reports are false. Given `<risk/cost/reversibility assessment>`, a measured time-bounded trial may be reasonable if `<guardrails>` and if it does not delay `<diagnostic or time-sensitive care>`.

The answer must separately state what the community evidence cannot establish, such as population response rates, causality, permanent cure, or structural regeneration.

## Deep Research boundary

Deep Research is not required for YouTube acquisition and is not expected to make YouTube pagination faster. The normal Project chat and its explicit multi-call controller are the primary YouTube workflow. Deep Research may be useful for later broad formal-literature or general-web synthesis only when the AskRigor connection is actually available on that surface.

No OpenAI deep-research API call is added to the AskRigor server.

## Sci-Bot boundary

The public plugin, its tool metadata, Project instructions, protocol instructions, starter prompts, and user-facing fallback language must not integrate, promote, or recommend Sci-Bot or Sci-Hub. A private plugin would not by itself cure missing third-party authorization, terms, copyright, privacy, or marketplace-policy problems.

AskRigor instead emits a provider-neutral `deeper_literature_handoff` when formal support remains unresolved:

```text
deeper_literature_handoff:
  unresolved_claims: <explicit list>
  population_intervention_outcomes: <explicit text>
  synonyms_and_searches_run: <explicit list>
  papers_and_identifiers_inspected: <explicit list>
  missing_evidence: <explicit text>
```

The user can use that packet with a lawful literature service or with documents they are authorized to access. Any future third-party literature integration requires a separate design and proof of authorized API access and compliant terms before implementation.

## Error and access-boundary behavior

- `complete` and `api_visible_complete` remain the source-appropriate successful terminal access states.
- Partial retrieval, an unconsumed continuation token, non-exhausted pagination, unresolved reply mismatches, or an invalid chain blocks a complete YouTube receipt while repair remains possible.
- Disabled comments, provider inaccessibility, quota exhaustion, expired continuation, and malformed upstream data are reported literally with their confidence effects.
- Provider-reported comment counts may differ from the API-visible corpus. The report presents both without pretending that either counts deleted, hidden, moderated, held-for-review, private, or otherwise unavailable material.
- A complete zero-result search forbids claims about an unseen community signal.
- Query-bounded comment searches remain discovery-only.
- The controller does not loop indefinitely after a stable terminal boundary or evidence saturation.

## Regression and verification plan

### Evidence-weighting regressions

Use the exact prompt:

```text
@AskRigor best way to fix an old hip that barely works and hurts
```

Fixtures include repeated firsthand reports for gelatin/collagen, dietary change, and swimming or strengthening, plus formal searches that locate no directly matched trial for at least one intervention.

The regression fails if AskRigor:

- converts `support_not_located` into ineffective or disproved;
- treats a structural-regeneration evidence gap as contradiction of pain/function reports;
- omits the promising community signal from the final comparison;
- recommends or rejects a trial without explicit risk, cost, reversibility, and delay-opportunity analysis;
- allows a strong arthroplasty RCT to deselect or erase the Forum Signal module.

### YouTube coverage regressions

Tests prove that:

- a complete 399-record corpus reports provider count, 399 retrieved, 399 analyzed, and a clickable canonical URL;
- a complete corpus larger than 500 reports the complete retrieved count and a deterministic 500-record analysis sample;
- a material corpus with at least 300 available records cannot produce a strong directional report after fewer than 300 are retrieved;
- a partial segment returns a continuation token and blocks completion;
- valid chained calls eventually produce one mechanically verified terminal receipt;
- tampered, expired, out-of-order, cross-video, and replayed continuation tokens cannot fabricate completion;
- all accessible reply pages are retrieved independently and reconciled;
- provider-reported, API-retrieved, and model-analyzed counts never collapse into one field;
- selected videos include actual titles and canonical clickable URLs;
- decision-useful negative videos are not suppressed in favor of positive videos.

### Adaptive-expansion regressions

Tests prove that:

- no one-minute total-time rule exists;
- additional calls continue automatically while a material continuation token remains and expected information gain is positive;
- wider searching occurs when a promising signal is confined to one pool or directional coverage is incomplete;
- two consecutive low-yield expansions can establish saturation;
- a final answer cannot say further expansion is likely to improve the answer while executable expansion remains undone;
- the expansion report accurately states extra calls, new information, and stopping rationale.

### Public-package regressions

Tests scope assertions to the relevant Project, Forum Signal, HRP, skill, and tool nodes. They prove that the public runtime and model-facing package contain the provider-neutral literature handoff and do not add a Sci-Bot or Sci-Hub connector or recommendation.

Run the existing typecheck, build, deterministic suite, replay suite, mutation/invariant gates, plugin validator, public-site validator, and deployment verification in addition to the new focused tests.

## Deployment and compatibility

This is an additive public-plugin release. Keep the existing compound YouTube tool available during migration so installed clients do not break, but update the Project package and AskRigor skill to prefer survey plus per-video audit. Regenerate the tool inventory, plugin package, integrity digests, and release artifacts.

Deployment adds one server-held continuation-authentication secret. It does not add a user API key, OpenAI API dependency, comment database, background worker, or n8n. Update the production runtime safely, rebuild and redeploy the MCP container, refresh the ChatGPT developer-mode connection, replace the Project instructions and Forum Signal module, and validate the exact hip regression in a new chat.

The public privacy page is reviewed against the final token payload and tool responses. If implementation follows this design and stores no comment text or session state, the existing transient-processing and client-retention disclosures remain the intended data boundary; any deviation requires a privacy-page update before release.
