# Bright Data source evaluation

## Authority and scope

- Directive `askrigor-bright-data-eval-20261001`, designed in the reasoning chat
  [Get me started with Bright Data](https://claude.ai/code/session_01GqJMSg1M3maAy2BTapKnYk)
  from the owner's requests of 2026-10-01 01:23 and 01:24 UTC. The owner
  delivered the directive to this execution session at 02:08 UTC.
- Received directive text: 19,978 bytes, SHA-256
  `ad963aed0a433a4d6189ca03bf899dcab73aad6192b1c9bda2ba6629872cfb84`
  (with a trailing newline added: `0afacb82753d8cdf27a53fe5b149664c049c3d840fc75eb4511ca0b32f169376`).
  The hash the reasoning chat gave the owner was not available here to compare.
- Owner addendum, 02:14 UTC: "also you can use all 5000 credits on bdata and
  ask if you need more". The run cap is 5,000 credits instead of 1,500, and the
  lane caps are scaled by the same factor (below). Zero spend still applies:
  free monthly credits only, no deposit, payment method, plan change or promo
  code.
- `scripts/validate-chat-work-authority-policy.mts --request` returned
  `CHAT_WORK_AUTHORITY_GATE_PASS` for an owner-attested, bounded
  `EXECUTE_SOURCE_BOUND_BOUNDED_DIRECTIVE` request with zero model API spend.
  The validator's canonical-directive check covers the repository's default
  directive file, not this directive, which has no canonical JSON record.
- Executor: a Claude Code cloud session, not the Codex worker the directive
  named. Bright Data calls run on the owner's laptop (where `bdata` is logged
  in) through Desktop Commander. The SDK reads the key in-process from the CLI
  login. Baselines run against AskRigor production or with the YouTube key
  already configured in the cloud session.
- Execution only. No adoption verdict, method change, relevance judgment or
  spend proposal. Owned paths: this plan, the audit `.md` and `.json`, and one
  `docs/INDEX.md` entry.

## Current methods, confirmed at main `745b780`

- **Finding videos.** The Gemini scout Action (`scout_gemini_youtube_candidates`)
  makes Gemini run 8 to 18 grounded Google searches itself and return
  candidates. AskRigor then checks the candidates with the YouTube Data API. The
  native community survey runs model-supplied or fallback queries through
  YouTube `search.list`. The static fallback families
  (`fallbackNativeQueries` in `research-candidate-frontier.ts`) are six
  templates on the research question: treatment experience, what worked, no
  improvement failed, side effects worsening, stopped treatment, evidence
  comparison trial.
- **Transcripts.** The public `get_youtube_transcript` Action, which uses
  YouTube's unofficial Innertube interface and continues with one-hour handles.
- **YouTube comments.** The official YouTube Data API through
  `getYoutubeComments` and the video community audit, with reply-count
  mismatch receipts.
- **Other communities.** Host-assistant web research only; no AskRigor adapter.

## Questions and data use

- Q1, DEVELOPMENT: hip osteoarthritis, avoiding hip replacement. Held-out
  target `XpZHKGGCK-o`.
- Q2, DEVELOPMENT: persistent plantar heel pain, what helped people recover.
- Q3, VALIDATION: frozen shoulder (adhesive capsulitis), recovering without
  surgery. Lane scripts, query lists and metric code are frozen, with SHA-256
  receipts, before any Q3 call and are not changed after Q3 results.

The S query list is the six fallback templates applied to each question's
wording above, exactly as `boundedNativeQuerySubject` would pass it.

G (the scout's planned queries) is unavailable for all three questions. Limit
8 allows a live scout call only if its configuration is zero-spend under the
policy. The scout's configuration uses paid Gemini Search grounding
(`gemini-scout-route.ts` prices each grounded search and caps a request at
USD 1), and the policy's model API ceiling is USD 0, so no scout call is made.

## Lanes, budgets and order

Lane caps scaled by 5,000 / 1,500: A 1,333, B 133, C 1,667, D 1,000, E 667,
F 133 (4,933), with the remainder as reserve. The method's own parameters, not
the caps, are expected to bound use.

1. Preflight (done): one `youtube_videos` record for `XpZHKGGCK-o` carried
   `transcript`, `formatted_transcript` (141 segments, millisecond times, last
   end equal to the duration), `transcript_language`, 20 top-level `comments`
   with `num_replies`, and 12 `recommended_videos`. SDK 2.5.2
   `test_connection()` returned true. SDK clients run with
   `auto_create_zones=False` so the run cannot create account zones.
2. Lane A for Q1 and Q2: T1 official search through `searchYoutube` (top 10),
   T2 SDK `search.youtube.videos_by_keyword(num_of_posts=10)`, T3
   `bdata search "site:youtube.com <q>" --country us --language en`.
3. Lane B: the 12 listed videos plus six mechanically picked edge cases;
   production transcript Action to exhaustion against `bdata pipelines
   youtube_videos` (SDK with `transcription_language` for the non-English one),
   all back to back per side. Word error rate with `jiwer`; start-time agreement
   on up to 10 exact normalized-text segment matches per video.
4. Lane C: three videos (replaced mechanically if over 400 comments); official
   API to completion against SDK `scrape.youtube.comments` with N equal to the
   provider count capped at 250, plus the 20 comments embedded in the Lane B
   records. Overlap by comment ID, else by normalized text hash.
5. Lanes D, E, F for Q1 (development), then freeze, then Lane A, D, E and F for
   Q3. Lane D includes the ordinary shell fetch of each thread and its `.json`
   form, and the ChatGPT capability probe through Mission Control's relay if
   that route is reachable; otherwise `chatgpt_reddit_probe_unattempted`.
6. Blinded labeling pools per question (random IDs, public metadata, no
   transport labels) routed to the configured AskRigor Project Manager chat if
   that route is reachable; otherwise placed in the receipt for the reasoning
   chat.

## Data handling

Raw responses stay in `~/bd-eval-20261001-scratch/raw` on the laptop and in
the cloud session scratchpad, never in the repository. At the end, comment
and post bodies, author handles and links, and transcript text are deleted;
only IDs, counts, timings, hashes and derived metrics are kept. Every Bright
Data call is logged in a ledger (lane, method, input ID or URL hash, records,
credits, latency, status). Nothing from users, private research or AskRigor's
stores is sent to Bright Data.

## Completion

`npm run verify`, `git diff --check` and the credential scan; push
`codex/bright-data-eval-20261001`; open a pull request and leave it open; route
the results packet if a route exists; final receipt to the owner and the
reasoning chat.

## Execution record (2026-10-01)

Results: `docs/audits/2026-10-01-bright-data-source-evaluation.md` and `.json`.

- Executor change: at 03:27 UTC the owner moved the work from the cloud session
  to a local Claude Code session on the laptop (Opus 5.5, max effort). The cloud
  session had finished the preflight, this plan and the official-search
  baselines for Q1 and Q2. The local session rechecked the directive's bytes
  from the owner's copy (19,978 bytes, same SHA-256) and reran the validator
  (`CHAT_WORK_AUTHORITY_GATE_PASS`).
- Transcript baseline: production returned HTTP 404 for the transcript Action,
  which `745b780` defines but does not mount, and which the server drops when
  OAuth research access is configured. The AskRigor side of Lane B therefore ran
  the same route code from `745b780` on a local server bound to `127.0.0.1`.
- Harness choices made on development data (Q1, Q2) before the freeze:
  - T2 waits up to 900 seconds. A search that outlives the client is fetched from
    its snapshot, not searched again.
  - Searches that only find input URLs for Lanes D to F are retried once; Lane A's
    transport searches are not.
  - Google `/goto` result links are resolved to their destination.
  - Facebook posts must be ID-form links.
  - Lane F keeps two blocked pages per question across Q1, Q2 and Q3 (six), with
    up to four searches per question.
  - Lane B's AskRigor side uses the route's default track. Bright Data receives
    full language names.
- Freeze: 05:52:02 UTC, before any Q3 call, with SHA-256 receipts for the lane
  scripts, query lists and metric code (listed in the audit). Every Q3 run
  checked them first. Lane C's corrected processing is in a separate file, so
  the frozen files stayed unchanged.
- Routing: the Mission Control relay to the AskRigor Project Manager chat is
  offline, so the blinded labeling pools and the results packet went into the
  final receipt, and the ChatGPT Reddit probe is `unattempted: relay_unavailable`.
- Assessment: after the owner's correction later on 1 Oct that a Claude session
  does its own reasoning (UDA #305, AskRigor #255), the audit gained this
  session's assessment. Bright Data stays out of the default path. It is
  recommended as a transcript fallback, and for the deeper community pass the
  user asks for, with measured costs. Spending decisions stay with the owner.
- Owner decision, 16:44 UTC (owner questions page, question 16): Bright Data is
  a paid feature that spends AskRigor credits users buy; free users don't get
  it; the owner uses it freely. AskRigor has no credits or checkout yet, so the
  build order is AskRigor's own transcript fixes, then both uses for the owner
  only, then paid accounts once billing exists. Recorded in the audit's "Owner
  decision" section.
