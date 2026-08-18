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
- `npm run verify` passed at the host boundary: 57 test files passed, one
  credential-gated file skipped; 960 tests passed, five skipped; typecheck and
  build passed. The initial sandbox run failed only because loopback and IPC
  listeners were prohibited with `EPERM`.
- `git diff --check` and the bounded credential-pattern scan passed. Public site
  sources, generated Custom GPT artifacts, source code, and canonical protocols
  were unchanged by this evaluation note.
