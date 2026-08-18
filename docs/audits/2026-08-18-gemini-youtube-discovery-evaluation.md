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

Google Search grounding was not invoked because the Gemini API route is a paid
service. The official YouTube Data API was not enabled for the supplied Google
project, so this local benchmark used the installed `yt-dlp` search client as
an unofficial, read-only transport. Each query was limited to one provider-
ranked page. This transport is adequate for comparing query direction, but it
does not prove production YouTube Data API parity or platform exhaustion.
Google currently documents direct public YouTube URL processing as a no-charge
Preview feature with an eight-hour daily free-tier video limit. The API's
`serviceTier: standard` receipt does not by itself establish whether unrelated
text-generation tokens were billed.

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

## Recommended architecture

Use a lazy escalation pipeline:

1. Gemini generates human-like, nonredundant evidence-frontier searches.
2. AskRigor executes those searches through the official YouTube Data API and
   preserves exact query, cursor, identifier, and access provenance.
3. Gemini ranks real metadata and proposes a bounded second search round.
4. Gemini directly summarizes only the most promising, nonredundant URLs.
5. A video can be linked because its creator content is relevant, while exact
   material claims used in synthesis receive a timestamped transcript spot-
   check.
6. Targeted visual inspection occurs only when the summary or transcript points
   to before/after images, imaging, technique/form, a product label, or another
   visually dependent claim.
7. Comment corpus auditing remains an independent Forum Signal lane.

Do not use ungrounded Gemini-generated video identifiers. Preserve Gemini output
as model interpretation rather than transcript evidence, and preserve all
provider failures and access boundaries literally.

## Remaining experiment

After the transcript provider's rate limit resets, repeat one or two matched
videos with identical extraction schemas for:

- transcript acquisition plus Gemini text analysis; and
- direct Gemini YouTube URL analysis.

Compare total latency, material-claim recall, timestamp accuracy, omitted
details, visual-only yield, token use, and access failures. Then decide whether
the default shortlisted-video path should be transcript-first or direct-
Gemini-first. No production integration is justified before that matched
comparison and a privacy/data-flow decision for sending de-identified research
prompts to Google.

## Verification

- The final bounded transcript retry still returned `rate_limited` for both
  matched videos; the incomplete comparison remains open rather than inferred.
- `npm run verify` passed at the host boundary: 57 test files passed, one
  credential-gated file skipped; 960 tests passed, five skipped; typecheck and
  build passed. The initial sandbox run failed only because loopback and IPC
  listeners were prohibited with `EPERM`.
- `git diff --check` and the bounded credential-pattern scan passed. Public site
  sources, generated Custom GPT artifacts, source code, and canonical protocols
  were unchanged by this evaluation note.
