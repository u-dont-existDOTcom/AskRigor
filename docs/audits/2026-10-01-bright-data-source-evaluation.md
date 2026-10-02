# Bright Data source evaluation

Date: 2026-10-01

## Question

The owner asked, in the reasoning chat
[Get me started with Bright Data](https://claude.ai/code/session_01GqJMSg1M3maAy2BTapKnYk)
(2026-10-01, 01:23 and 01:24 UTC), whether Bright Data would work better than
AskRigor's current methods for finding the best videos, pulling comments and
pulling transcripts, and how it would do for other social sources (Facebook,
Reddit if ChatGPT cannot reach it, and so forth).

This record is the measured evidence for that question, capability by
capability, followed by an assessment. The directive was written for a Codex
worker and left the verdict to a reasoning chat. After the run, the owner
corrected that: a Claude session does its own reasoning
(u-dont-existDOTcom/universal-dev-architecture#305, u-dont-existDOTcom/AskRigor#255).
So the assessment is this session's own. Spending decisions stay with the owner.

## Assessment

- **Default research: don't use Bright Data.** Its YouTube keyword search takes
  2 to 3 minutes a query, against under a second for the official search. Its
  video records take about 80 seconds, against 2.5 seconds for AskRigor's own
  transcripts. For YouTube comments the official API is better on every
  measure: complete with replies, faster, and free. The owner reached the same
  conclusion from these results.
- **Use it as a transcript fallback.** YouTube rate-limited AskRigor's own
  transcript route after about 30 consecutive requests, and it stayed limited
  for at least 30 minutes. Bright Data returned all 17 transcripts, including
  the two AskRigor lost. Called only when AskRigor's route answers
  `youtube_transcript_rate_limited`, it costs one credit and a minute or two
  per video.
- **Use it for the deeper community pass, when the user asks for one.** The
  first pass already offers "deeper community research". Bright Data reaches
  what the user's AI can't:
  - TikTok comments;
  - public Facebook groups;
  - X posts;
  - Reddit when the AI is Claude. The owner found on 29 Sep that ChatGPT reads
    Reddit itself.

  Skip Instagram (no comments in either test) and Facebook pages (search
  couldn't reach them). Run the platforms in parallel. The measured passes
  would take about 5 to 15 minutes, set by TikTok.
- **Cost per deeper pass, as measured.**
  - Without Reddit, about 70 to 120 credits (TikTok 56 to 105, Facebook groups
    6, X up to 5, searches about 5). Reddit adds about 90 to 140, three
    threads' comments plus lookups. Worst case near 600, if every thread is
    long.
  - At Bright Data's pay-as-you-go price of $1.50 per 1,000 records, that's
    about $0.11 to $0.18 a pass without Reddit and about $0.31 with it.
  - The free 5,000 credits a month cover about 40 to 70 passes without Reddit,
    or about 23 with it, shared with the owner's other Bright Data use.
  - The Scale plan ($499 a month for 384,000 records, then $1.30 per 1,000)
    only pays off at thousands of passes a month.
- **Not worth more work: Bright Data video search and its relevance labels.**
  Speed keeps its video search out of the default path, so labeling its
  candidates would not change this assessment. The blinded pools stay on the
  receipt page if a future question needs them.
- **What building the two uses would take:**
  - a Bright Data key on the AskRigor server, which the owner sets up;
  - a privacy data map and public privacy page entry naming Bright Data as a
    processor. It would receive public URLs and search phrases derived from the
    research topic.
  - dropping every author field the platforms return before anything is stored
    or shown;
  - a spending decision: free credits only, or pay-as-you-go with a monthly
    cap.
- **Two AskRigor findings to fix, separately from Bright Data:**
  - Production serves no transcript route, neither Action nor MCP tool. So
    connector users currently get no transcripts; the research-session runtime
    uses the route only internally.
  - Called without a language, the route picks the first listed caption track.
    For 4 of 17 videos that was a track in an unrelated language. It should
    prefer the video's own language or its manual track.

## Owner decision (2026-10-01)

The owner answered the spending question (question 16 on the owner questions
page) at 16:44 UTC: "free users don't get to use this option, it would be a
paid feature using up AskRigor credits that they purchase (altho of course I as
the owner can use it as i wish)".

- Free contributor accounts get no Bright Data use. That covers both uses
  above, since the transcript backup also spends Bright Data credits; the
  owner can still choose to give everyone the transcript backup.
- Paid accounts would spend AskRigor credits they buy. AskRigor has no credits,
  prices or checkout yet: paid private access is a yes-or-no entitlement, and
  the 2026-09-01 entitlement plan deferred pricing, the billing provider,
  checkout, invoicing and refunds. The paid use therefore waits for that billing
  work, whose own decisions (provider, credit price, credits per pass, refunds)
  go to the owner when it starts.
- The owner may use both without limit. The owner's use runs on Bright Data's
  free 5,000 credits a month until the owner adds a payment method in Bright
  Data; AskRigor adds none and spends nothing beyond the free tier itself.
- Order, after AskRigor#246 merges: AskRigor's own two transcript fixes above,
  for everyone; then both Bright Data uses for the owner's account only, with
  the privacy entry in the owner's wording; then paid accounts, once the
  credits exist.
- Owner requirement, 2026-10-02: no paid feature is dropped silently for a
  free user. A message such as "Facebook, TikTok, Instagram posts can only be
  inspected with the paid version" names only what the paid search really
  covers, so Instagram stays in only if a retest before launch works.
- OpenAI's Plugin Guidelines (checked 2026-10-02) forbid scraping or
  integrating third parties without their authorization, and bypassing their
  access controls. Where this search may run is therefore owner question 23.
  Both points are in `docs/superpowers/plans/2026-10-02-free-user-paid-feature-notes.md`.

This was an isolated evaluation. It changed no MCP or Action tool, Custom GPT,
plugin, protocol, privacy map, deployment or Railway setting. Raw provider
responses stayed in a scratch folder on the owner's laptop and were deleted at
the end of the run. This record holds identifiers, counts, timings, hashes and
derived metrics only: no comment or post bodies, author handles or profile
links, or transcript text.

## Authority and execution

- Directive `askrigor-bright-data-eval-20261001`, written by the reasoning chat
  above and delivered by the owner at 02:08 UTC: 19,978 bytes, SHA-256
  `ad963aed0a433a4d6189ca03bf899dcab73aad6192b1c9bda2ba6629872cfb84`. The local
  session rechecked those bytes from the copy the owner placed on the laptop.
- Owner addendum, 02:14 UTC: "also you can use all 5000 credits on bdata and ask
  if you need more". The run cap is therefore 5,000 credits instead of 1,500, and
  the lane caps are scaled by 5,000 / 1,500: A 1,333, B 133, C 1,667, D 1,000,
  E 667, F 133.
- `scripts/validate-chat-work-authority-policy.mts --request` returned
  `CHAT_WORK_AUTHORITY_GATE_PASS` for an owner-attested, bounded
  `EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE` request with zero model API spend
  (first in the cloud session, again locally at 04:20 UTC). Its canonical
  directive check covers the repository's default directive, not this one,
  which has no canonical JSON record.
- Executor: Claude Code on Opus 5.5 (`claude-opus-5-5`) at max effort, on the
  owner's Claude plan, with no model API spend. A cloud session ran the
  preflight, the plan and the official-search baselines for Q1 and Q2. The
  owner then moved the work to a local session on the laptop, which ran
  everything else. The directive named a Codex worker on GPT-6.1 Sol; no Codex
  worker took part.
- Bright Data: free monthly credits only. No deposit, payment method, plan
  change or promo code. `bdata` CLI 0.3.7 and `brightdata-sdk` 2.5.2, with SDK
  clients built with `auto_create_zones=False`, so the run could not create
  account zones. The SDK read its key in-process from the CLI login; the key
  was never printed, logged or passed as an argument.
- Lesson queue (`npm run lessons:status`): unavailable in the cloud session at
  02:17:57 UTC (`gh_unavailable`); available locally at 04:08:59 UTC with 2 open
  candidates, 2 needing review, 0 accepted but not incorporated, 5 incorporated
  or closed, 0 eligible for deletion.
- UDA suggested-fixes lane for AskRigor: three items (claim-integrity checks,
  the shopping module, shopping activation and coverage). None concerns
  community sources, YouTube acquisition or Bright Data, so none was handled in
  this evaluation-only session; they stay open in the lane.

## Current methods

Confirmed at main `745b780`:

| Capability | Current method |
|---|---|
| Finding videos | The Gemini scout (`scout_gemini_youtube_candidates`) plans grounded searches; AskRigor checks its candidates with the YouTube Data API. The native survey runs model-supplied or fallback queries through `search.list` (100 quota units each). The static fallback families (`fallbackNativeQueries` in `research-candidate-frontier.ts`) are six templates: treatment experience, what worked, no improvement failed, side effects worsening, stopped treatment, evidence comparison trial. |
| Transcripts | `get_youtube_transcript` over YouTube's unofficial Innertube interface, continued with one-hour handles. |
| YouTube comments | The official YouTube Data API through `getYoutubeComments` and `audit_youtube_video_community`, with reply-count mismatch receipts. |
| Other communities | The host assistant's ordinary web research; no AskRigor adapter. |

Finding about the transcript baseline: production does not serve the
transcript Action. `POST https://mcp.askrigor.com/actions/research/get_youtube_transcript`
returned HTTP 404 on 2026-10-01, and production's Action document lists two
paths, neither a research Action. At `745b780` the route is defined
(`createYoutubeTranscriptActionRoute`, exported in
`createActionOnlyResearchRoutes`), but the default HTTP server does not mount
it, and the server also drops public research Actions whenever OAuth research
access is configured. The research-session runtime calls the route
internally. The AskRigor side of Lane B therefore ran the same route code from
`745b780` on a local server bound to `127.0.0.1` (research Actions on, a random
continuation secret), from the laptop's network rather than production's.

Gemini-planned queries (G) are unavailable for all three questions. Hard limit
8 allows a scout call only through its existing configuration, and only if that
configuration is zero-spend under the policy. At `745b780` the scout is an
Action route (`createAutomatedGeminiScoutActionRoute`, in the same
`createActionOnlyResearchRoutes` set), which production does not serve, like the
transcript Action. The route prices each grounded search at USD 0.014 against a
budget, capped at USD 1 a request, and the policy's model API ceiling is USD 0.
Zero spend could not be confirmed for that configuration, so no scout call was
made, as the directive says to do in that case. Every Lane A comparison uses
the static query list S.

## Questions and data use

- Q1, DEVELOPMENT: hip osteoarthritis, avoiding hip replacement. Held-out
  target `XpZHKGGCK-o`.
- Q2, DEVELOPMENT: persistent plantar heel pain, what helped people recover.
- Q3, VALIDATION: frozen shoulder (adhesive capsulitis), recovering without
  surgery.

The S list for each question is the six fallback templates applied to the
question's wording, as `boundedNativeQuerySubject` passes it. Lanes D and E use
the question's wording as the topic; Lane F uses it with "forum" and "reviews".

Development runs on Q1 and Q2 found harness faults, which were fixed before Q3
(listed under "Failures and access boundaries"). The lane scripts, query lists
and metric code were then frozen at 05:52:02 UTC, before any Q3 call, with
these SHA-256 values:

| File | SHA-256 |
|---|---|
| `bdeval.py` (lanes A to F) | `4aba7197a35fbb6b49dcc395418b674561578faac8146d8a0601217634b9cbb9` |
| `baseline.mts` (official-search and comment baselines) | `4c16fa857d635dfd7d55b8aef04700494b6b6badbf14decab6631a1de6ddfbce` |
| `analyze.py` (metrics) | `29cd70f6f7ea2ca0214bfa98541505b8158fee703e7b514da9104753d0f2207b` |
| `select_bc.py` (Lane B and C selection) | `f24767c1dc7e129bb42873b41d37471b9c75f1c1ac44d2ee55da990725bf0d54` |
| `freeze.py` (this receipt) | `ec0bf36c99a9e8b062ebec886d869e5f37f34042e24d7f5308e59c3a5827d7bf` |

Every Q3 run checked these hashes first, and none changed afterwards. Lane C,
which does not use Q3, crashed on a field type just before the freeze. Its
corrected processing was written after the freeze, in a separate `lane_c2.py`,
so the frozen files stay unchanged.

## Results

### Lane A: finding videos

T1 is the official YouTube Data API search through AskRigor's `searchYoutube`
(top 10). T2 is the SDK's `search.youtube.videos_by_keyword(num_of_posts=10)`,
where each returned video is one credit and carries its transcript and top
comments. T3 is `bdata search "site:youtube.com <query>" --country us --language en`
at one credit per search. Failed searches were not retried in this lane, so its
failure counts are measured as they occurred.

| Question | Transport | Queries (failed) | Unique candidates | Unique to this transport | Median latency per query | `XpZHKGGCK-o` |
|---|---|---|---|---|---|---|
| Q1 | T1 | 6 (0) | 36 | 15 | 0.36 s | not found |
| Q1 | T2 | 6 (0; 2 fetched after the client timed out) | 45 | 23 | 141.7 s | not found |
| Q1 | T3 | 6 (1) | 34 | 28 | 3.8 s | not found |
| Q2 | T1 | 6 (0) | 27 | 19 | 0.41 s | n/a |
| Q2 | T2 | 6 (0) | 40 | 27 | 163.3 s | n/a |
| Q2 | T3 | 6 (1) | 30 | 24 | 5.6 s | n/a |
| Q3 | T1 | 6 (0) | 31 | 16 | 0.31 s | n/a |
| Q3 | T2 | 6 (0) | 40 | 24 | 151.6 s | n/a |
| Q3 | T3 | 6 (0) | 34 | 28 | 3.7 s | n/a |

Overlap of candidate sets (Jaccard):

| Question | T1 and T2 | T1 and T3 | T2 and T3 |
|---|---|---|---|
| Q1 | 0.350 | 0.077 | 0.082 |
| Q2 | 0.136 | 0.018 | 0.094 |
| Q3 | 0.246 | 0.066 | 0.072 |

T2 records:

| Question | Records | With a transcript | Median transcript coverage | With embedded comments |
|---|---|---|---|---|
| Q1 | 60 | 96.7% | 1.000 | 78.3% |
| Q2 | 60 | 98.3% | 1.000 | 70.0% |
| Q3 | 60 | 95.0% | 0.999 | 63.3% |

T3 returned YouTube video links for 98% (Q1), 100% (Q2) and 87% (Q3) of its organic results.

- Q3, the validation question run with the frozen method, repeats the
  development pattern. T2 returns the most candidates and the most candidates
  unique to one transport. The three transports overlap little (Jaccard 0.02 to
  0.35 across questions), and T3 overlaps T1 least. T1 answers in well under a
  second, T3 in about 4 to 6 seconds, and T2 in 2 to 3 minutes per query.
- Cost: T1 used 600 YouTube quota units per question (six `search.list`
  calls). T2 used ten credits per query, T3 one.
- The SDK's default 240-second poll ran out on two Q1 T2 searches. Their
  collections finished on Bright Data's side and were fetched from the
  snapshot, not searched again. From then on T2 waited up to 900 seconds.
- None of the three transports found the held-out video `XpZHKGGCK-o` with the
  static queries for Q1.
- Relevance labels: not done. The blinded pools were built, but labels would
  not change the assessment, because speed keeps Bright Data's video search out
  of the default path. The pools stay on the receipt page.

### Lane B: transcripts

Seventeen videos: the twelve listed in the directive plus five edge cases
picked mechanically from Lane A's results. Candidates were taken in a fixed
order (Q1 then Q2; T1, T2, then T3; query index, then rank). Each class took
the first unused candidate that met it, using YouTube Data API metadata. No
age-restricted video turned up, and the directive asks for one only if it
does. Each side ran all seventeen back to back: the AskRigor route to
exhaustion with its `coverage_receipt`, and `bdata pipelines youtube_videos`
(SDK with `transcription_language` for the non-English pick).

| Video | Edge case | Length (s) | AskRigor: status, segments, coverage | AskRigor track (language, automatic) | AskRigor latency (s) | Bright Data: segments, coverage | Bright Data latency (s) | WER | Median start difference (ms) |
|---|---|---|---|---|---|---|---|---|---|
| `XpZHKGGCK-o` | | 902 | ok, 141, 0.999 | en, no | 3.6 | 123, 0.996 | 80.3 | 0.045 | 460 |
| `-IX2RCCaVeo` | | 1,282 | ok, 172, 0.995 | en, no | 2.5 | 172, 0.995 | 135.1 | 0.000 | 0 |
| `KpcPqnzAl_E` | | 1,221 | ok, 510, 0.993 | en, yes | 6.0 | 510, 0.993 | 106.6 | 0.025 | 0 |
| `Hz3Gd51hBn0` | | 1,418 | ok, 631, 1.001 | en, yes | 8.2 | 631, 1.001 | 125.8 | 0.047 | 0 |
| `LnlhK4MBaPw` | | 1,055 | ok, 537, 1.001 | en, yes | 6.3 | 537, 1.001 | 68.6 | 0.032 | 0 |
| `2LFgGibgJG0` | | 238 | ok, 110, 0.989 | en, yes | 2.0 | 110, 0.989 | 102.1 | 0.040 | 0 |
| `stZdnA9zeQE` | | 231 | ok, 191, 1.004 | ar, yes | 1.6 | 111, 1.008 | 63.2 | 1.239 | n/a |
| `CD2vs-Ud6bo` | | 342 | ok, 151, 1.000 | en, yes | 2.2 | 151, 1.000 | 114.6 | 0.036 | 0 |
| `WKEvbMgkg8w` | | 369 | ok, 153, 0.981 | en, yes | 1.9 | 153, 0.981 | 71.3 | 0.040 | 0 |
| `2Fmx-iHsKYg` | | 330 | ok, 175, 1.004 | en, yes | 2.0 | 175, 1.004 | 61.4 | 0.026 | 0 |
| `0sZEvvPWq88` | | 390 | ok, 70, 0.997 | zh-Hans, no | 2.0 | 70, 0.997 | 64.7 | 4.871 | n/a |
| `qfPjRBqADKk` | | 2,682 | ok, 1,824, 0.999 | ar, yes | 20.9 | 473, 0.998 | 67.4 | 1.308 | n/a |
| `_lgzIx5gr3c` | no creator captions | 568 | ok, 301, 0.996 | en, yes | 4.0 | 301, 0.996 | 352.8 | 0.037 | 0 |
| `Eq0SssY4ZXs` | non-English audio (es-419) | 772 | ok, 549, 0.998 | ar, yes | 6.9 | 549, 0.998 | 150.9 | 0.001 | 0 |
| `6kKc2mTEb2c` | Short (58 s) | 58 | ok, 16, 0.995 | en, no | 1.7 | 16, 0.995 | 149.7 | 0.034 | 0 |
| `jn49FjEM4EU` | over 60 minutes | 4,108 | rate limited after 1,000, 0.532 | en, yes | 11.5 | 1,911, 1.000 | 71.6 | 0.894 | 0 |
| `iV_uMFtgOF0` | live replay | 1,885 | rate limited, 0 | none | 2.2 | 859, 1.000 | 78.2 | n/a | n/a |

- Availability: AskRigor 15 of 17 complete; Bright Data 17 of 17. AskRigor's
  two failures were the last two calls of the run: YouTube answered
  `youtube_transcript_rate_limited` after about 30 consecutive transcript
  requests from the laptop, and still did about 30 minutes later. Bright Data
  saw no rate limiting.
- Speed: median latency per video 2.5 s for AskRigor against 80.3 s for
  Bright Data.
- Coverage: the same where both succeeded (median 0.998 on each side).
- Text: median WER 0.039 over the 16 pairs, and 0.035 over the 12 pairs left
  after removing the three pairs in different languages and the rate-limited
  partial. Start times matched exactly (median difference 0 ms) wherever
  text-matched segments existed, except `XpZHKGGCK-o` (460 ms; 141 against 123
  segments, so the two sides segmented the English track differently).
- Language: called without a language, AskRigor's route takes the first listed
  track. For four videos that was a track in another language (`ar` three times,
  `zh-Hans` once), so their WER compares different languages and is not a text
  agreement measure. For `Eq0SssY4ZXs`, the API reports Spanish audio (`es-419`),
  but its caption list has no Spanish track: a manual English track and
  automatic tracks in other languages. Its `ar`-labeled AskRigor text matched
  Bright Data's output (WER 0.001), so the label, not the text, differs there.
  The non-English edge case was therefore not truly exercised. These are
  AskRigor findings, listed under "Assessment"; nothing was changed.
- Credits: 17, one per video record.

### Lane C: YouTube comments

The three listed videos all had 400 comments or fewer (34, 168 and 352), so
none was replaced. AskRigor's comment adapter ran to completion with the
laptop's YouTube key, and Bright Data's `scrape.youtube.comments` was asked for
the provider count capped at 250.

| Video | Official: top-level + replies (state) | Official latency | Bright Data requested / returned | Matched by comment ID | Replies from Bright Data | Bright Data latency | Embedded comments in the Lane B record (matched) |
|---|---|---|---|---|---|---|---|
| `stZdnA9zeQE` | 19 + 15 (`api_visible_complete`, 0 mismatches) | 2.4 s | 34 / 19 | 19 of 19 top-level | counts only (sum 15), no text | 14.2 s | 19 (19) |
| `0sZEvvPWq88` | 88 + 80 (`api_visible_complete`, 0 mismatches) | 6.7 s | 168 / 88 | 88 of 88 top-level | counts only (sum 80), no text | 12.9 s | 20 (20) |
| `Hz3Gd51hBn0` | 197 + 155 (`api_visible_complete`, 0 mismatches) | 12.8 s | 250 / 197 | 197 of 197 top-level | counts only (sum 155), no text | 34.2 s | 20 (20) |

- Bright Data returned every top-level comment and nothing else: 304 records,
  all matching official comment IDs, none extra. Replies came back only as
  per-comment counts, which equal the official reply totals. None of the 250
  reply texts came back.
- Billing: one credit per returned top-level comment (304). Replies were not
  billed because none were returned.
- The directive's call passes no reply option, so the SDK's reply-loading
  parameter was not exercised.
- The 19 to 20 comments embedded in each Lane B video record all matched
  official comments by normalized text hash, at no extra cost.

### Lane D: Reddit

`bdata search "site:reddit.com <topic>" --country us`, then the first three
public threads with 30 to 150 comments. A plain fetch with curl's defaults
tried each thread page and its `.json` form. The comment count came from the
`.json` form when it answered, else from `bdata pipelines reddit_posts`.

| Question | Thread | Comments shown | `reddit_posts`: comments included | `scrape.reddit.comments(days_back=3650)`: records (share of shown) | Nested replies | Deleted or removed | Latency |
|---|---|---|---|---|---|---|---|
| Q1 | `1gqm9d2` | 56 | 23 | 32 (0.57) | 9 | 3 | 119.6 s |
| Q1 | `1irk9yd` | 132 | 25 | 91 (0.69) | 21 | 7 | 34.8 s |
| Q1 | `18ttdoe` | 58 | 11 | 13 (0.22) | 11 | 2 | 77.8 s |
| Q3 | `15oyv1r` | 69 | 15 | 26 (0.38) | 15 | 2 | 76.6 s |
| Q3 | `10nh2qg` | 62 | 14 | 26 (0.42) | 14 | 3 | 55.7 s |
| Q3 | `1upunlq` | 61 | 18 | 33 (0.54) | 16 | 0 | 34.4 s |

- Plain access: for all six screened Q1 threads, the page returned HTTP 200 but
  an almost empty shell (under 500 visible characters), and the `.json` form
  returned HTTP 403. Ordinary unauthenticated access is effectively closed from
  this network.
- The comment scraper returned a median of 57% of the comments shown on Q1's
  threads and 42% on Q3's (range 22% to 69% across all six). The post record
  alone carried 11 to 25 comments.
- Q3 repeated Q1's plain-access result: all five screened threads returned an
  empty page shell and HTTP 403 for `.json`.
- Structure: every comment record carries `parent_comment_id`; nested replies
  come back inside records; deleted or removed comments are marked. Fields
  include `user_posted` and `community_name` (author data present).
- ChatGPT capability probe: `chatgpt_reddit_probe_unattempted: relay_unavailable`;
  the owner's 29 Sep report that ChatGPT reads Reddit covers its question (see
  "Labeling and routing").

### Lane E: other social platforms

Run for Q1 (development) and Q3 (validation). Comment pulls were capped at 50
per post. The CLI sends only a URL for TikTok and Instagram comments, so those
used the same Bright Data datasets through the SDK's executor, with
`limit_per_input=50` and `limit_multiple_results=50`. Bright Data documents
both as capping a collection's records.

Q1:

- TikTok: keyword discovery returned 5 posts in 320 s. Comments for the two
  posts with the most comments: the post showing 261 returned one
  `crawl_error` record after 745 s; the post showing 69 returned exactly 50
  (cap held), with reply counts and nested replies, in 224 s. Post records carry
  creator profile fields; comment records carry `commenter_id`,
  `commenter_url` and `commenter_user_name`. A plain fetch of the post pages
  returned a challenge or an empty shell.
- Instagram: one search failed (`redirect location was rejected`); on the retry
  run a public post was found. Its capped comment pull finished in 13 s with 0
  records, and a plain fetch of the post returned a challenge page.
- Facebook page post: in the first run, Google ignored `site:facebook.com`
  (no Facebook results), and the second query failed. On a rerun, the first
  query's first match was an SEO-style `/posts/<slug>` link, which the comments
  scraper refused with HTTP 400 ("Invalid input provided"). Once matching was
  limited to ID-form post links, neither query found a page post.
- Facebook group: one public group found; `posts_by_group(num_of_posts=5)`
  returned 5 posts (34 s and 161 s on two runs). Records carry poster fields
  (`user_url`, `user_username_raw`, `profile_id`, `avatar_image_url`).
- X: three posts found; `bdata pipelines x_posts` returned one record each in 3
  to 11 s, with reply counts but no reply text, and author fields `name`,
  `user_id`, `user_posted` and `profile_image_link`. Plain fetches returned
  HTTP 200 pages.

Q3 (validation, frozen method):

- TikTok: 5 posts in 141 s. The two posts showing 146 and 73 comments returned
  exactly 50 each (cap held), with replies, in 77 s and 152 s. Plain fetches
  returned challenge pages.
- Instagram: a public post was found; the capped comment pull finished in 24 s
  with 0 records, and a plain fetch returned a challenge page. Across both
  questions Instagram returned no comments.
- Facebook page post: no ID-form post link in either search's results, so no
  comments were requested.
- Facebook group: one public group found; 5 posts returned in 77 s.
- X: the `site:x.com` search failed (`redirect location was rejected`), and its
  immediate retry was refused: Bright Data asks for at least 15 seconds before
  a failed query is retried. The `site:twitter.com` search returned one profile
  link and no post, so no X record was requested.

Across both questions: TikTok comments (capped) and Facebook group posts
worked; X posts worked when search found post links; Instagram comments
returned nothing; no public Facebook page post could be reached by the search
step. Every working platform returns author identifiers (profile IDs, handles,
URLs or avatars) alongside the content, which is a privacy note for any
production use.

### Lane F: blocked forums and review pages

For each question, searches for "<topic> forum" and "<topic> reviews" (up to two
result pages each) gave candidate pages. A plain fetch was tried first, and a
page was kept only if that failed (403, 429, a challenge page or an empty
JavaScript shell), two per question. Each kept page was fetched with
`bdata scrape <url> -f markdown`. General searches return Google `/goto`
redirect links, which were resolved to their destination with one header
request before fetching.

| Question | Plain fetches (failed) | Kept page | Plain result | Bright Data result | Content | Latency | Replies present |
|---|---|---|---|---|---|---|---|
| Q1 | 18 (2) | ukclimbing.com forum thread | HTTP 403 | success | 33,307 chars | 7.9 s | yes, about 28 |
| Q1 | | aromotion.com article | HTTP 403 | success | 12,159 chars | 3.0 s | no |
| Q2 | 8 (2) | pmc.ncbi.nlm.nih.gov article | challenge page | refused by Bright Data policy | 0 | 14.3 s | n/a |
| Q2 | | mayoclinic.org information page | HTTP 403 | success | 30,294 chars | 6.4 s | no |
| Q3 | 3 (2) | pmc.ncbi.nlm.nih.gov article | challenge page | refused by Bright Data policy | 0 | 6.3 s | n/a |
| Q3 | | mayoclinic.org information page | HTTP 403 | success | 29,098 chars | 8.0 s | no |

- Most forum and review pages were reachable with a plain fetch: 22 of 29
  attempts succeeded, one returned HTTP 203, and six failed (the six kept
  pages: four HTTP 403 and two challenge pages).
- Bright Data's Web Unlocker returned all four non-government pages it was
  given. It refused PubMed Central both times with "classified as Government
  and blocked by Bright Data as it might breach Bright Data usage policy".
- Whether replies are present is a reading judgment, made by a Claude Haiku 4.5
  subagent on the scraped Markdown (page type, and whether posts from more than
  one person are visible). It is not a mechanical measure.

## Credits

The ledger counts one credit per returned record, search or page fetch, the
directive's definition. Bright Data's own balance could not be read (`bdata
budget` answers 403 for this key), so these are the run's own counts. The
SDK's `.cost` field is a US-dollar estimate (USD 0.002 per YouTube record) and
is kept in the JSON ledger as such.

| Lane | Credits | Cap (scaled) | What used them |
|---|---|---|---|
| Preflight | 1 | 3 | one `youtube_videos` record |
| A | 216 | 1,333 | T2 200 (180 fetched records plus 20 superseded after a harness fault), T3 16 |
| B | 17 | 133 | one video record per video |
| C | 304 | 1,667 | one per top-level comment returned |
| D | 234 | 1,000 | comment records 221, post records 11, searches 2 |
| E | 192 | 667 | TikTok comments 151 and posts 10, Facebook group posts 15, X posts 3, searches 13 |
| F | 12 | 133 | searches 8, scraped pages 4 |
| Total | 976 | 5,000 | 136 calls |

Unit costs as measured: T2 is 10 credits for one 10-video search (with
transcripts and top comments), against 100 YouTube quota units for a
`search.list` call, which returns IDs and snippets only. A video record is one
credit. YouTube comments, Reddit comments and TikTok comments cost one credit
per returned comment. A Google search or one Web Unlocker page is one credit.
Failed calls returned no records and are counted at zero; one TikTok error
record is counted at one. No cap was reached, and no credits beyond the free
monthly pool were requested.

## Failures and access boundaries

- Bright Data Google searches (`bdata search`) failed 13 times in 52 calls (25%), with
  "redirect location was rejected", a 30-second page-load timeout, or "This
  query recently failed and cannot be retried yet".
- Bright Data dataset collections take minutes: T2 keyword discovery took a
  median of 142 to 163 s per query, video records 61 to 353 s, and TikTok
  comments up to 745 s.
- Harness faults found during development, all before the Q3 freeze:
  - The ledger writer crashed on an SDK field (`elapsed_ms` is a method) after
    the first Q1 T2 search, and the Q2 run was stopped mid-call. Both searches
    completed on Bright Data's side (10 records each). Their 20 credits are
    logged as superseded, and both were searched again.
  - A refactor left a stale variable in a progress line and stopped the Q2 run
    after its first query. That query's calls were already logged, and the
    rerun reused them from the ledger rather than paying twice.
  - General Google searches return `/goto` redirect links. The first Lane F run
    therefore took google.com as the host and handed the redirect link to the
    scraper, which refused it. In the second run links were resolved, but a
    failed search read the previous run's output file. Both runs are kept as
    superseded records; stale files are now deleted before each call.
  - Lane E's first Facebook match was an SEO-style post link, which the
    scraper refuses.
  - Lane C's processing assumed reply lists where Bright Data returns counts.
- AskRigor-side rate limiting: YouTube throttled the laptop's Innertube
  transcript requests after about 30 consecutive calls, for at least 30
  minutes.
- Bright Data's policy refusal of government sites (PubMed Central).
- The production transcript Action is not served (see "Current methods").

## Labeling and routing

- Blinded pools were built for each question from Lanes A, D and E. Each item
  has a neutral random ID, the title, channel or community, length, date, public
  counts and at most 300 characters of public description. Items carry no
  transport or method label and no comment text or commenter data, and are
  shuffled with a fixed seed. The unblinding key holds IDs only. It is kept
  outside the repository until labels return, so the pools stay blind, and its
  SHA-256 is in the JSON.
- The configured route to the AskRigor Project Manager chat is Mission
  Control's ChatGPT relay, which pastes queued packets into registered chats.
  The relay host has been offline since about 2026-09-19 (its Desktop Commander
  device was last seen 291 hours before 05:10 UTC on 2026-10-01). This session
  also holds no Mission Control worker credential. Nothing was queued or sent;
  the transport blocker is `relay_unavailable`.
- The pools and the results packet therefore went into the final receipt. After
  the owner's correction, a Claude session reports to the owner directly, so no
  packet needs routing. The pools were not labeled (see "Assessment").
- ChatGPT Reddit capability probe:
  `chatgpt_reddit_probe_unattempted: relay_unavailable`. The question it would
  answer was settled by the owner's own report on 29 Sep: ChatGPT reads Reddit.
  Bright Data's Reddit use is therefore scoped to Claude.

## Data handling

- Only public URLs and the benchmark queries went to Bright Data. Nothing came
  from users, private research or AskRigor's stores.
- Raw responses (Bright Data records, search pages, page fetches and the
  AskRigor transcript segments) were kept only under
  `~/bd-eval-20261001-scratch/raw` on the laptop. At 06:15:53 UTC the run
  deleted all 225 raw files and the folder, removing comment and post bodies,
  author fields and transcript text.
- The local copies of the blinded pools were deleted once the receipt was
  published. YouTube metadata files were reduced to IDs, counts and flags, with
  titles, channel names and descriptions removed.
- One ledger error string quoted a Facebook post URL; it is redacted, and the
  URL's SHA-256 remains the row's input.
- Kept on the laptop: the ledger, the derived metrics, the unblinding key (IDs
  only), the scripts and the run logs.
- Before the move, the cloud session's scratchpad held the official-search
  result pages for Q1 and Q2. That session is stopped and cannot be reached from
  the laptop, so their deletion could not be done or confirmed here.
- The repository receives this record, its JSON (IDs, counts, timings, hashes,
  derived metrics, and the ledger without Bright Data job IDs), one
  `docs/INDEX.md` line and the plan's execution record.

## Nonclaims

This record makes no claim about the efficacy or safety of any treatment, the
platforms' terms, or the legal suitability of production use. Q1 and Q2 are
development data and are not generalized. Q3 is one validation question, and
all samples here are small.

## Verification

- `npm run verify` on this branch (Node 24.18.0, C locale): typecheck, 1,984
  tests passed with 6 skipped, and build.
- `git diff --check`: clean.
- Credential scan of the branch's added lines, using the repository's
  live-suite patterns (`AIza` keys and API-key assignments) plus Bright Data,
  bearer and GitHub token shapes, and exact matches for the run's YouTube and
  Gemini key values (loaded in-process, never printed): no match.
- The freeze check (`freeze.py check`) passed before every Q3 run and after the
  last one.
