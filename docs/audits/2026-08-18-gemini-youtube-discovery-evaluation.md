# Gemini-assisted YouTube discovery evaluation

Date: 2026-08-18

## Question

Can AskRigor use Gemini's no-charge/free-tier-accessible capabilities to
improve YouTube discovery and creator-content triage without making every
shortlisted video pass through a full transcript audit or visual review?

This was an isolated provider evaluation. It did not change canonical
protocols, production code, the 17-tool MCP inventory, the Custom GPT editor,
deployment, or the public privacy contract. The supplied API key, raw provider
responses, and transcript text were not written to the repository.

## Modes tested

1. Existing static success/failure/harm/discontinuation query families.
2. Gemini 3.6 Flash query planning followed by the same YouTube search
   transport.
3. Gemini 3.5 Flash-Lite query planning followed by the same transport.
4. Ungrounded Gemini generation of exact YouTube URLs, with every URL validated
   independently through YouTube's public oEmbed endpoint.
5. Gemini 3.6 Flash semantic selection from real candidate metadata, followed
   by a second-round query proposal.
6. Direct Gemini 3.6 Flash summaries of five public YouTube URLs.
7. AskRigor transcript acquisition for the same five videos, with no transcript
   text retained.
8. A bounded, temporary, non-Gemini comment retrieval on the first-person hip
   video to test whether missed gelatin and hydration signals lived in the
   community corpus rather than creator content.
9. A follow-up official YouTube Data API metadata and comment benchmark after
   the owner enabled that API on a temporary local key.

Google Search grounding was not invoked because the Gemini API route is a paid
service. The official YouTube Data API was not initially enabled for the first
supplied Google project, so this local benchmark used the installed `yt-dlp`
search client as
an unofficial, read-only transport. Each query was limited to one provider-
ranked page. This transport is adequate for comparing query direction, but it
does not prove production YouTube Data API parity or platform exhaustion.
Google currently documents direct public YouTube URL processing as a no-charge
Preview feature with an eight-hour daily free-tier video limit. The API's
`serviceTier: standard` receipt does not by itself establish whether unrelated
text-generation tokens were billed.

The official Data API key is not a public-transcript credential. Google
documents
[`captions.download`](https://developers.google.com/youtube/v3/docs/captions/download)
as requiring OAuth and permission to edit the video. AskRigor's public-caption
adapter and `yt-dlp` instead use unofficial YouTube interfaces and can be
throttled independently of Data API or Gemini billing.

## Results

### Model and discovery behavior

- The model inventory listed Gemini 2.5 Flash, but an actual generation request
  returned HTTP 404 and said it is unavailable to new users. Gemini 3.6 Flash
  and Gemini 3.5 Flash-Lite completed successfully. Any integration therefore
  needs a configurable model rather than a hard-coded 2.5 dependency.
- Ungrounded exact-URL generation failed completely: Gemini 3.6 produced eight
  candidate watch URLs and Gemini 3.5 Flash-Lite produced six; all 14 returned
  `not_found` through independent oEmbed validation. This mode must not be used.
- On the held-out hip-osteoarthritis question, the static mode ran four queries,
  returned 40 records, and produced 32 unique candidates. Gemini 3.6 planning
  ran six queries, returned 50 records, and produced 47 unique candidates.
  Gemini 3.5 Flash-Lite planning returned 60 records and 55 unique candidates.
- Title-level diagnostics found no collagen/gelatin or hydration candidate in
  any first-round mode. Gemini-planned modes did find substantially more
  distinct physical-program candidates than the static mode, including a
  physiotherapist's own daily hip-arthritis regimen and a first-person
  nonsurgical restoration claim.
- Gemini's metadata selector produced useful nonredundant follow-up directions,
  but still did not independently propose collagen/gelatin or hydration.

### Generalization checks

Two unrelated prompts were kept free of the hip regression's missing concepts:

- For tool-intensive hand/wrist tendon pain, static searches returned 16
  unique candidates from four top-five pages. Gemini-planned searches returned
  25 from six pages and created materially more specific directions: work-
  preserving tool adaptations, progressive tendon loading, splint failure,
  forearm self-release, and shift-level pacing.
- For persistent plantar heel pain, static searches returned 16 unique
  candidates. Gemini planning returned 24 and surfaced separate directions for
  a formal named loading protocol, overlooked nerve entrapment, footwear
  transition, failed stretching, and procedure avoidance. The exact named-
  protocol query returned an exhausted zero-result top page; it was not treated
  as evidence that the program or videos do not exist.

These checks support Gemini as a query planner, but not as a complete video
finder by itself.

### Direct video summaries

Five direct YouTube summaries completed over approximately 110 minutes of
public video. Per-video latency was 22.7 to 33.9 seconds (mean 29.3 seconds).
Prompt usage was 82,152 to 171,688 tokens (mean 120,044), overwhelmingly video
tokens.

The summaries were decision-useful:

- [Growing My Hip Back](https://www.youtube.com/watch?v=XpZHKGGCK-o&t=610s)
  exposed a first-person combination claim involving diet, fasting, collagen,
  glucosamine/chondroitin, weight loss, and low-impact movement. Gemini also
  reported that the claimed before/after X-rays were not shown in the video.
- [How I Manage My Hip Arthritis as a Physiotherapist](https://www.youtube.com/watch?v=-IX2RCCaVeo&t=585s)
  yielded a distinct, dosed program: daily steps, specific morning stretches,
  bodyweight squats/lunges/balance work, and twice-weekly loaded work.
- [Alternatives to Hip Replacement Surgery](https://www.youtube.com/watch?v=KpcPqnzAl_E&t=705s)
  supplied a useful failure trajectory across PT, acupuncture, massage, PRP,
  and bone-marrow-derived treatment, including deep-water running after the
  procedure.
- A broad chronic-joint-pain video exposed a collagen claim but concerned
  rheumatoid arthritis and a commercial multi-phase program, so direct
  summarization revealed an important population/stage mismatch that titles
  alone concealed.
- The previously selected Sigrid story contained gait/glute-recruitment claims
  but omitted the exact exercise progression and was also promotional. It was
  not equivalent to the independently found dosed physiotherapist regimen.

These are creator-content descriptions, not efficacy, safety, causality, or
medical endorsements.

The 22.7-33.9 second latency is consistent with the developer mode that was
actually invoked. Google documents
[direct Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
as sampling visual frames at one frame per second, processing audio, and
consuming about 300 tokens per video-second at default resolution or about 100
at low resolution. The 82,152-171,688 input-token receipts therefore reflect
true multimodal processing rather than a transcript-only summary.

Consumer Gemini is a different surface. Its
[Connected YouTube app](https://support.google.com/gemini/answer/16622858)
is documented as using public YouTube information, but Google does not publish
an API or an exact retrieval contract for that consumer shortcut. The owner's
observed approximately one-second summary is compatible with
transcript/metadata retrieval or a cache hit, but that mechanism is an
inference rather than a verified consumer implementation detail. Google
documents
[NotebookLM's YouTube source behavior](https://support.google.com/notebooklm/answer/16215270)
more narrowly: it imports only the transcript, not images or video.

### Transcript comparison and access boundaries

The first AskRigor transcript pass returned `api_visible_complete` for all five
selected public caption tracks. Acquisition took 2.8 to 12.2 seconds per video,
substantially less than direct Gemini video processing, and returned 141 to 859
segments. Transcript acquisition alone is therefore faster; the uncompleted
comparison is transcript acquisition plus model analysis versus direct video
analysis.

The transcript pass confirmed collagen-related text in the first-person hip
video. A substring diagnostic also flagged hydration at three timestamps, but
the bounded fragments did not visibly contain the term and two targeted Gemini
clip checks reported no hydration discussion. Immediate transcript retries
then returned `rate_limited`, and independent subtitle download returned HTTP
429. Hydration is therefore unresolved and must not be reported as verified or
as absent. The access gap lowers confidence; it is not negative evidence.

The incomplete end-to-end text-analysis timing comparison must not be converted
into a speed verdict. The observed token difference nevertheless shows that
direct video analysis is much heavier than caption transport, so it should be
reserved for a shortlist or for content that likely depends on visuals.

### Independent comment-signal correction

The hydration discrepancy came from conflating creator content with community
content. Gemini's direct video input and caption analysis cannot see YouTube
comments. A later bounded `yt-dlp` retrieval therefore sampled 2,000 records in
YouTube's `top` order from
[Growing My Hip Back](https://www.youtube.com/watch?v=XpZHKGGCK-o). The video
metadata reported about 5,300 comments and the traversal estimated about 5,374,
so this retrieval is `partial`, not corpus-complete.

The sample did contain the missed signals. It included six literal
hydration/electrolyte discussions relevant or adjacent to the hip hypothesis,
plus one unrelated lexical match about dehydrated spinal discs. The relevant
records included high-water foods and staying hydrated, hydration and synovial
fluid, salt/magnesium claims, electrolyte use alongside conservative care, and
a creator reply listing magnesium and potassium for electrolytes. The sample
also contained 12 literal gelatin records, including a 54-like top-level
firsthand report about daily gelatin followed by a reply thread, and a separate
18-like report combining beef gelatin with swimming.

These findings recover candidate hypotheses and implementation differences;
they do not establish that hydration, electrolytes, gelatin, or any associated
regimen is effective or safe. Comment retrieval remains independent from video
selection, transcript verification, formal evidence, and recommendation.

### Official YouTube Data API follow-up

The temporary key successfully enabled the official YouTube Data API. One
`videos.list` request returned all three requested exact identifiers as
`api_visible_complete` in 344 milliseconds and reported 5,374 comments for the
discovery video.

The bounded `commentThreads.list` traversal exhausted its top-level
continuation after 11 pages and 5.358 seconds: 1,055 top-level threads, 921
embedded replies, and 1,976 unique comment records. Returned threads reported
1,625 total replies, leaving 35 reply-count mismatches because embedded thread
replies are not the complete reply corpus. Overall access is therefore
`partial`, not `api_visible_complete`, despite the exhausted top-level cursor.

Without retaining raw comments or author data, the official sample located nine
hydration/electrolyte records, including two uploader records; nine gelatin
records; and 119 collagen records. This was roughly seconds rather than minutes
for a similarly sized unofficial retrieval and confirms that the official API
should be the production search/metadata/comment transport. It does not solve
public-caption acquisition.

## Recommended architecture

Use a lazy escalation pipeline:

1. Gemini generates human-like, nonredundant evidence-frontier searches.
2. AskRigor executes those searches through the official YouTube Data API and
   preserves exact query, cursor, identifier, and access provenance.
3. Gemini ranks real metadata and proposes a bounded second search round.
4. Retrieve captions first and use bounded text analysis for promising,
   nonredundant URLs. Direct Gemini video ingestion stays off by default.
5. A video can be linked because its creator content is relevant, while exact
   material claims used in synthesis receive a timestamped transcript spot-
   check.
6. Use direct video input only for a small, identified segment when the caption
   or summary points to before/after images, imaging, technique/form, a product
   label, or another decision-useful claim that genuinely depends on visuals.
   Prefer low media resolution when the material visual detail permits it.
7. Comment corpus auditing remains an independent Forum Signal lane.
8. Link the most decision-useful verified videos for the user to watch; provider
   rank and popularity alone do not determine the watchlist.

Do not use ungrounded Gemini-generated video identifiers. Preserve Gemini output
as model interpretation rather than transcript evidence, and preserve all
provider failures and access boundaries literally.

## Remaining experiment

After the transcript provider's rate limit resets, one matched video can still
be repeated with identical extraction schemas for:

- transcript acquisition plus Gemini text analysis; and
- direct Gemini YouTube URL analysis.

Compare total latency, material-claim recall, timestamp accuracy, omitted
details, visual-only yield, token use, and access failures. The default is
already transcript-first because direct video consumed 82,152-171,688 input
tokens per video and did not include comments. The remaining comparison is only
needed to characterize a tightly bounded fallback, not to reopen that default.
No production integration is justified before a privacy/data-flow decision for
sending de-identified research prompts or public URLs to Google.

Consumer Gemini browser automation is not a supported integration surface. A
personal, user-operated laptop bridge could be evaluated separately, but it
would depend on a logged-in browser, mutable UI selectors, account challenges,
and compliance with Google's automated-access restrictions. A VPS would add
credential and datacenter-login risk. Neither should become a public AskRigor
dependency. Gemini Spark's custom MCP connection works in the reverse
direction—Gemini can call AskRigor tools—and does not expose consumer Gemini as
an AskRigor API. Gemini Notebook Enterprise exposes a preview YouTube-source
API, but it is transcript-only and requires an enterprise subscription, so it
is not proportionate for this use case.

### Gemini Spark supported-connection follow-up

Google's supported custom-app path requires one account-side connection. The
standard endpoint reached Gemini's `tools/list` request, but Gemini rejected its
richer MCP catalog. The smaller catalog-compatible endpoint
`https://mcp.askrigor.com/mcp/gemini` preserves the same ordered 17 read-only
tools and handlers and was accepted in the owner's account on 2026-08-19. The
production endpoint requires no credential.

The eligibility boundary is narrower than Spark access. Google's current help
pages require age 18+, a personal Google Account, Keep Activity enabled, Google
AI Pro or Ultra for Spark, and presence in the United States for custom apps.
The owner-facing Connected Apps UI initially did not expose **Custom apps for
Spark**. After the account and regional prerequisites were met, the UI exposed
the feature and accepted the Gemini-compatible endpoint. Gemini API billing is
separate and did not unlock the consumer feature.

A live 2026-08-19 MCP initialization and `tools/list` probe returned
`api_visible_complete`: connection in 1.205 seconds, listing in 1.037 seconds,
all 17 expected research tools, no tool without `readOnlyHint: true`, and no
tool with `destructiveHint: true`. The consequential lesson-submission Action
is not part of the MCP inventory.

The initial owner-uploadable skill incorrectly assigned Universal/HRP
orchestration and completion judgment to Gemini. It was replaced before
substantive use by
`integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md`. The replacement
uses Gemini only for public YouTube discovery, creator-content summaries, and
targeted visual observations. It calls AskRigor only to validate exact video
identities and links, then emits a structured handoff for a separate capable
AskRigor research agent. The skill neither loads HRP nor claims evidence
completeness.

This supported connection still runs in the reverse direction: Gemini can call
AskRigor, but AskRigor cannot pull consumer Gemini's generated summary. The app
connection and skill upload are one-time operations; one compact handoff remains
necessary per research task unless AskRigor later adds a separately reviewed
authenticated transfer or server-side supervisor. The setup and synthetic
scout acceptance procedure are recorded in `docs/gemini-spark-setup.md`.

## Verification

- The final bounded transcript retry still returned `rate_limited` for both
  matched videos after 5.8 and 3.1 seconds. A separate client listed the exact
  English caption track in 3.4 seconds, but its subtitle download failed after
  7.1 seconds with HTTP 429. This confirms a transport throttle rather than a
  missing-caption result; the incomplete matched text-analysis comparison
  remains open rather than inferred.
- The bounded comment retrieval returned 2,000 `top`-sorted records from an
  estimated 5,374 and is preserved as `partial`. Hydration/electrolyte and
  gelatin signals were located in that community sample. No comment text,
  author data, transcript, video, or unrestricted provider response was
  retained in the repository or sent to Gemini.
- The official Data API follow-up returned metadata in 344 milliseconds and
  1,976 unique comment records across 11 pages in 5.358 seconds. Top-level
  pagination was exhausted, but 35 reply-count mismatches make the literal
  access status `partial`. The temporary key, raw comments, and author data were
  not retained.
- The live Gemini Spark compatibility probe returned all 17 public MCP tools as
  `api_visible_complete`; all were read-only and non-destructive. The standard
  endpoint's catalog remained incompatible with Gemini, while the bounded
  `/mcp/gemini` profile was accepted in the owner's account. This proves the
  connection and catalog boundary, not HRP execution or a research verdict.
- The replacement scout skill passed the skill validator and its focused static
  contract 4/4. An independent capability-denied forward test kept discovery
  and validation as unattempted, returned no invented videos, and made no HRP
  or research-completion claim. A real consumer-Gemini scout task remains the
  required behavioral acceptance after owner upload.
- The first owner-run consumer-Gemini scout found a previously missed
  clinician self-management video and extracted unusually concrete regimen
  details, showing that the discovery/summary role is useful. It nevertheless
  failed acceptance: Gemini substituted the non-contract status `available`
  for the literal MCP status, emitted empty timestamps, blurred uninspected
  visuals with creator-summary support, and mixed exact outcome matches with
  adjacent short-term and promotional cases. No medical claim from that output
  was accepted as verified evidence. The revised skill adds a literal-status
  allowlist, timestamp fail-closed rule, attribution and visual-source checks,
  outcome-match and incentive labels, and a mandatory final self-check. A clean
  owner rerun remains pending.
- The second owner run corrected every metadata status to
  `api_visible_complete`, preserved creator attribution, supplied a real query
  ledger, exposed commercial incentives, and recovered a hydration regimen.
  Consumer Gemini still emitted blank timecode placeholders and retained six
  `adjacent_implementation` tutorials with zero exact outcome matches, despite
  the first run having found firsthand candidates. The skill now stops asking
  for bare timecodes, requires each located time as a clickable Markdown deep
  link paired with a descriptive segment cue, runs at least three exact-outcome
  discovery directions first, and prevents polished adjacent tutorials from
  displacing qualifying firsthand accounts. The owner confirmed that a direct
  correction made Gemini supply the missing times, so the defect was the
  skill's rendering-safe format contract rather than Gemini's ability to locate
  them. Clean behavioral acceptance remains pending.
- The next owner-provided output passed timestamp rendering and arithmetic,
  literal `api_visible_complete` statuses, attribution, and incentive labeling.
  It nevertheless reused six `adjacent_implementation` videos, ran only one
  broad avoidance query, and retained zero qualifying non-clinician patient
  accounts. The prior exact-outcome rule was soft and did not distinguish
  patient narration from clinician self-management or practitioner-retold
  cases. The revised selection gate uses patient-specific queries and negative
  clinic/practitioner terms, classifies `firsthand_patient_outcome`,
  `firsthand_clinician_self_management`, and `practitioner_reported_case`
  separately, and targets `min(3, ceil(dossier size / 2))` patient accounts.
  When a real corpus cannot meet the target, it must report a coverage shortfall
  rather than padding or misclassification. Clean behavioral acceptance remains
  pending.
- Owner review identified a narrower selection defect before the next rerun:
  creator identity alone could still allow a patient's personal-channel clinic
  review to satisfy the quota even when it contained no meaningful
  self-directed learning. The contract now counts only
  `independent_patient_self_learning` records centered on personal hypotheses,
  experiments, routines, mistakes, adaptations, and takeaways. It separates
  `independent_provider_treatment_review`, `clinic_patient_testimonial`, and
  `independence_unclear`; none counts toward the patient quota. This is a
  selection-contract correction, not a substantive judgment about any treatment
  claim. Clean behavioral acceptance remains pending.
- Further owner review reframed the scout as a staged browse graph rather than a
  one-pass dossier generator. The new default `seed_discovery` mode creates
  diverse model-labeled query probes, searches exact, umbrella, symptom/anatomy,
  and intervention-first rings, triages titles and metadata without full
  summaries, and returns two or three distinct comment-audit seeds. AskRigor—not
  Gemini—audits comments and may produce a `youtube_rediscovery_packet` of
  specific, non-identifying intervention vocabulary. Optional
  `targeted_rediscovery` then searches and summarizes narrow videos. Model probes
  and comment leads remain hypotheses, broad leads require exact-target
  back-searching, and one creator ecosystem remains one discussion pool. Clean
  two-stage consumer-Gemini acceptance remains pending.
- Owner review then corrected the first-stage ordering: title and metadata alone
  can hide the material intervention, while Gemini's lightweight native content
  scan is cheaper than a full AskRigor comment-corpus audit. `seed_discovery`
  now requires `remedy_extraction_scan` on 6–12 plausible candidates, extracts
  only intervention vocabulary and coarse claim/creator/hub fields, and searches
  each promising intervention individually before choosing comment-audit seeds.
  Detailed regimens, timestamps, visual verification, and full summaries remain
  deferred to targeted rediscovery. Clean staged consumer-Gemini acceptance
  remains pending.
- The complete deterministic host-boundary gate passed: 58 test files passed,
  one credential-gated file skipped; 967 tests passed, five skipped; typecheck
  and build passed. The identical sandbox run failed only on prohibited
  localhost and IPC listeners.
- `npm run verify` passed at the host boundary: 58 test files passed, one
  credential-gated file skipped; 964 tests passed, five skipped; typecheck and
  build passed. The initial sandbox run failed only because loopback and IPC
  listeners were prohibited with `EPERM`.
- `git diff --check` and the bounded credential-pattern scan passed. Public site
  sources, generated Custom GPT artifacts, source code, and canonical protocols
  were unchanged by this evaluation note.

## V15 forward run and v16 correction

The owner's first clean-uploaded v15 `seed_discovery` run returned the correct
diagnostic marker, 20 probes, 12 single-family batches, 10 displayed candidate
records, three nominal seed roles, mapped questions, six rabbit-hole directions,
and the unpopulated AskRigor return contract. It did not analyze comments or
claim Forum Signal completion.

Independent `get_youtube_video` calls at 2026-08-21T01:58Z returned
`api_visible_complete` for all 10 reported identifiers and matched every title.
The output therefore found real public videos, but failed behavioral acceptance
at its evidence joins:

- direct rows lacked source-aligned evidence. The report joined a Cissus video
  to a collagen/boron probe, a practitioner diet video to a firsthand carnivore
  probe, a side-effect explainer to a `did not help` probe, and a supplement-led
  personal account to an avoided-surgery probe without corresponding candidate
  fields;
- `probe_04` reported `exhausted_zero_results` while its linked batch reported
  `successful_with_candidates`. A separate AskRigor YouTube search at
  2026-08-21T02:00Z returned `XpZHKGGCK-o` for the exact frozen query
  `"growing my hip back"`. That countercheck demonstrates a recall discrepancy,
  not the exact internal result of Gemini's different search surface;
- the personal outcome video's API-visible description centers glucosamine and
  chondroitin as the claimed enabling remedy, while the packet classified it as
  mechanical movement. Correcting the dominant family would collide with the
  selected diet seed and invalidate the claimed family diversity; and
- the same metadata receipts exposed comment counts for all three selected
  seeds: 54, 4,156, and 100. The packet instead wrote `not reported` and declared
  a general comment-count access gap.

The pasted rendered copy did not retain hyperlink destinations, so literal
Markdown-link compliance remains unverified rather than failed. No creator
claim was accepted as medically verified evidence.

Contract v16 is a narrow repair. Every probe now copies its linked batch status;
every direct candidate join requires an exact candidate-field evidence map;
dominant family follows the remedy claimed to enable resumed activity; and seed
statistics come from one literal `get_youtube_video` receipt without discarding
a present `comment_count`. Candidate output also exposes the exact promotion
flag and final-checks the active heading. The current v16 file is 35,987 bytes,
has a 666-character maximum line, and SHA-256
`8ca33e86269841adfd237e8e4c92bbdef56cc157f274eadc744538fbf85a3a0b`.
The skill validator and focused contract passed 8/8. The complete deterministic
gate passed typecheck, 58 test files with one declared skip, 971 tests with five
declared skips, and build. V16 has no external upload, installed-byte, or
behavioral acceptance receipt yet.

## V16 forward-run stopping decision

The owner's v16 run found the held-out `XpZHKGGCK-o` account, used the correct
marker and heading, and returned 10 real public video identifiers. Independent
AskRigor validation matched all 10 titles as `api_visible_complete`. Discovery
recall is therefore useful.

The v16 evidence contract still failed:

- `overlooked_intervention_family_count` reported 6 while listing 7 values; only
  5 eligible families had probes because no `oral_supplement` or
  `behavioral_environmental` probe ran;
- many probes marked `anchor_coverage: pass` although their batch queries lacked
  required anchors. For example B01 omitted P03's `how I avoided` and
  `hip surgery`, and B07 omitted P15's `far infrared`;
- several direct probes left `matched_candidate_row_ids` empty. Their claimed
  exact evidence phrases were also absent from the cited candidate fields;
- candidate Row 1 declared `commercial_or_promotional: no` despite the
  API-visible description beginning with a paid self-management-program link.
  Row 6 likewise omitted promotion of the creator's hip-pain program, Row 2 was
  labeled clinician self-management without a personal condition account, and
  Row 9 relabeled exercise, traction, and stretching as behavioral;
- two seed questions omitted `source_seed_row_ids`; concrete digestive-complaint
  and post-procedure-flare terms lacked mappings; and several rabbit-hole row-ID
  lists or exact term mappings were empty or unsupported; and
- all three seed records again discarded provider comment counts. Literal
  `get_youtube_video` receipts at 2026-08-21T02:46Z returned 5,375 comments for
  `XpZHKGGCK-o`, 166 for `0sZEvvPWq88`, and 31 for `qfPjRBqADKk`.

Rendered-copy Markdown destinations remain unverified rather than failed. No
creator claim or generated evidence join was accepted as medical evidence.

This ends iterative large-contract revisions. V16 showed that adding explicit
fields can produce cosmetically complete but internally false ledgers; another
prose clause would not supply deterministic validation. Until a separately
reviewed compact handoff exists, treat Spark output only as an untrusted
high-recall list of candidate identifiers and provisional vocabulary. AskRigor
must independently validate identity, metadata, selection, and any later
comment audit. Do not ask the owner for another upload/rerun loop.

The focused Gemini contract remained green 8/8. The complete deterministic gate
passed typecheck, 58 test files with one declared skip, 971 tests with five
declared skips, and build.

## Candidate-only replacement

The separately reviewed replacement is now implemented locally as
`youtube-candidate-handoff-v1`. It does not attempt to make Gemini's search
ledger, metadata, comments, evidence mappings, or semantic seed selection
authoritative. Spark returns one bounded JSON object containing 6–12 executed
queries, 3–12 unique candidate IDs with explicitly provisional annotations,
1–4 suggested seed IDs, observed search gaps, and fixed disclosures. The skill
forbids AskRigor status/count claims, comment findings, protocol completion,
efficacy, safety, causality, or treatment advice.

AskRigor now owns a strict parser and independent validator. Raw strict JSON is
canonical; the earlier exact marker/fence form remains accepted for backward
compatibility. It fails before provider work on unrecognized framing, malformed
JSON, unexpected fields, oversized responses, duplicate IDs or normalized
queries, noncanonical watch links,
missing search purposes, or seeds outside the packet. It then calls the existing
YouTube adapter for every candidate and compares provider ID, canonical URL,
title, and channel. A suggested seed is mechanically eligible only after an
`api_visible_complete` identity receipt, a public privacy state when reported,
a positive provider comment count, and distinctness from earlier eligible
provider channels. That eligibility is not semantic materiality and does not
replace AskRigor's protocol-governed selection or comment acquisition.

The replacement skill is 6,577 bytes versus v16's 35,987 bytes. Its SHA-256 is
`1ecd387b95af48050590f8f5d8a6ea900b7cfb79b18a9dd8562057929560b02b`.
Skill-creator validation passed. The focused skill and validator suite passed
16/16. The host-boundary complete gate passed typecheck, 59 test files with one
credential-gated skip, 979 tests with five skips, and build. A negative CLI
smoke returned a structured framing error as designed. No local YouTube API key
was available for a new live call; the prior independently captured v16
metadata receipts remain the live identity evidence and were not relabeled as a
test of the new parser.

No public MCP or Action tool, canonical protocol, production service, or Gemini
account state changed.

## First candidate-only forward acceptance

The owner's 2026-08-21 forward run returned a raw
`gemini_youtube_candidate_handoff` v1.0 object rather than the redundant outer
marker and Markdown fence. The payload itself was complete and strict: 10
unique executed queries covered all five purposes, 7 unique candidates met the
closed schema, all 3 suggested IDs were candidates, and the four disclosures
were exact. Requiring an additional natural-language wrapper would have created
another needless manual correction loop, so the repository now treats raw JSON
as canonical and retains the previous exact framing only as compatibility.

Independent AskRigor metadata calls at approximately `2026-08-21T03:59Z`
validated all seven candidates as public and `api_visible_complete`, with exact
ID, canonical URL, title, and channel matches:

- `Hz3Gd51hBn0`: 68,554 views, 2,375 likes, 343 comments;
- `LnlhK4MBaPw`: 122,114 views, 3,936 likes, 545 comments;
- `2LFgGibgJG0`: 105,383 views, 1,981 likes, 390 comments;
- `stZdnA9zeQE`: 11,939 views, 99 likes, 32 comments;
- `CD2vs-Ud6bo`: 702,983 views, 29,541 likes, 1,251 comments;
- `WKEvbMgkg8w`: 203,803 views, 3,806 likes, 796 comments; and
- `2Fmx-iHsKYg`: 3,177,693 views, 118,868 likes, 1,577 comments.

The suggested seeds `Hz3Gd51hBn0`, `LnlhK4MBaPw`, and `stZdnA9zeQE` used
three distinct provider channels and had positive comment counts, yielding an
`accepted` mechanical validation result. This is the first clean behavioral
acceptance of the candidate-only handoff. It does not validate Gemini's
target-distance or intervention-family classifications, the attributed claim
summaries, semantic seed usefulness, comment accessibility or contents,
efficacy, safety, causality, or any medical conclusion. The owner should not be
asked to rerun or repair this accepted packet.
