# Check this video: Gemini reads a pasted YouTube video

Date: 2026-10-03. Status: **BUILT and live-checked; the release waits for owner
question 26** (privacy wording, merges, deploy), on
`claude/check-this-video-20261003`, PR #270.
Design source: u-dont-existDOTcom/AskRigor#248 (owner decision 2026-09-27).

## Why now

- The owner approved "check this video" on 2026-09-27, to start after #246
  merged (it did, on 2026-10-01).
- On 2026-10-02 the owner chose to keep the ChatGPT plugin on authorized sources
  (owner question 23: A). OpenAI's Plugin Guidelines forbid unauthorized
  scraping, and AskRigor's old transcript route reads YouTube's unofficial
  Innertube interface. Gemini reading a public YouTube URL is Google's own
  documented API, so it is the authorized way to read what a video says, on
  ChatGPT and Claude alike.
- The owner decided on 2026-10-03 (question 25: later) that the public
  `/version` address (#269) ships with this feature's release.

## Facts checked (Google, "Video understanding", updated 2026-09-23)

- **Request shape.** The Interactions API takes a public YouTube URL as one part
  of the `input` array: `{"type": "video", "uri": "https://www.youtube.com/watch?v=<id>"}`.
  Text parts go in the same array.
- **Agentic processing.** `"processing": "agentic"` sits inside the video part.
  Gemini 3.6 Flash, the scout's model, supports it.
- **Limits.** Public videos only, not private or unlisted. The free tier allows
  at most 8 hours of YouTube video a day. About 100 tokens per second at default
  resolution.
- **Times.** Prompts refer to moments as `MM:SS`.
- **Daily limits** (Google, "Rate limits", updated 2026-09-02, checked
  2026-10-03): daily quotas reset at midnight Pacific time and apply per
  project, not per API key.

## Design

1. **Client** (`packages/sources/src/gemini-video-claims.ts`).
   - One background Interaction per video, polled and deleted as the scout's
     are (Api-Revision `2026-05-20`, `store: true`, then `DELETE` after use).
   - The request holds only the public watch URL and a fixed prompt. It never
     holds the user's question, health details, identity or any other user
     text.
   - The prompt asks for a structured extraction, not a summary:
     - every health claim with its `MM:SS` start;
     - a short exact quote and who says it;
     - the evidence the video gives;
     - doses, durations, products and brands;
     - sponsorships, affiliate links and products sold;
     - studies shown on screen.

     The output is checked against a strict schema and bounded in size.
2. **Capacity.** Before a request, the server reads the video's duration and
   privacy status with one YouTube Data API `videos.list` call (1 quota unit;
   no `search.list`).
   - It refuses a video that isn't public, is live, or is longer than the
     configured maximum.
   - It keeps an owner-only daily ledger of video seconds sent to Gemini, per UTC
     day, and refuses before a request would pass 8 hours. Google's limit
     covers the whole key, which all users share.
3. **The tool** (`extract_youtube_video_claims`, MCP on `/mcp` and
   `/mcp/claude`).
   - **Input:** a video ID or URL, or the continuation token from an earlier
     call.
   - **While Gemini works:** `pending` with a signed, expiring continuation
     token (the scout's pattern, under Claude's 60-second tool limit).
   - **When done:** the claims, each with a link to its moment (`&t=<s>s`),
     and a signed research receipt. Quotes are labelled as Gemini's
     transcription, and nothing Gemini returns counts as evidence for a claim.
   - **Clean refusals:** without `ASKRIGOR_GEMINI_BILLING=none` (zero spend),
     without a Gemini or YouTube key, for a video that isn't public, and at the
     daily limit.
4. **Instructions.** A short router and skill entry for a pasted video: extract
   the claims, check each material claim with the usual tools (including the
   per-video comment audit), link each claim to its time, and say which claims
   weren't checked. No clinical or scientific method changes.
5. **Records.** The privacy data map gets a new Gemini flow: the public video
   URL and fixed instructions; Google may use free-tier inputs and outputs. The
   tool inventory, the catalog counts (32 to 33) and the owner-facing docs
   follow.

## Built (2026-10-03)

- **Source:** `packages/sources/src/gemini-video-claims.ts`.
  - It builds the whole request from a checked video ID and, for a follow-up,
    a whole-second time.
  - It handles start, poll and delete, with 120 polls at most.
  - A malformed report is refused, never repaired: no correction request, no
    clean-up (UDA structured-output failure boundary).
- **Daily ledger:** `apps/research-mcp/src/gemini-video-ledger.ts`.
  - It counts 8 hours per Pacific day, not per UTC day, since Google's quotas
    reset at Pacific midnight. A UTC count could allow about 16 hours in one
    Google day.
  - The file sits beside `ASKRIGOR_AI_BUDGET_LEDGER`
    (`/var/lib/askrigor-actions/gemini-video-seconds.json` in production), so
    production needs no new setting.
  - Each reading charges the video's whole length before it starts. A charge
    is never refunded: Google may count a failed request, so the ledger errs
    toward refusing.
- **Tool:** `apps/research-mcp/src/gemini-video-tool.ts` and
  `gemini-video-continuation.ts`. The tool is `extract_youtube_video_claims`.
  - **Input:** `video` (an ID or any YouTube link; only the 11-character ID
    is kept, so share codes never leave), an optional `at` (`MM:SS`) for the
    fixed-form follow-up, or `continuation_token`. Strict input refuses any
    other field, so no free text reaches the tool.
  - **Refused before any Gemini request:** a video that is not public, is
    live or upcoming, has no known length, or runs over 2 hours; a time past
    the end; and a reading the daily limit cannot take.
  - **Output:** claims with `&t=` links. A time past the video's end is flagged
    `time_outside_video` and linked to the start, never moved. The output also
    has sponsorships, on-screen citations, a source note labelling it all
    Gemini's transcription, and a `youtube_video_claims` research receipt.
  - **Surfaces:** connector only. There is no Custom GPT Action path (#248:
    "MCP first"), and the tool is absent from the Gemini-compatible catalog,
    like the scout.
- **finalize_research:** a verified `youtube_video_claims` receipt makes its
  video "found". Auditing the pasted video's comments then needs no discovery
  round. It is not a discovery round, so community discovery still runs. The
  receipt is not bound to a research target: the person named the video.
- **Instructions:**
  - The skill gets one paragraph. Its word budget goes from 1,125 to 1,200,
    following the precedent of the findings-card decisions.
  - The MCP server instructions (2,047 of Claude's 2,048 characters) and
    `project/PROJECT_INSTRUCTIONS.md` (7,996 of ChatGPT's 8,000) have no room.
    The tool's description carries the routing on MCP instead.
- **Records:**
  - The privacy data map gets the new flow, the ledger and the MCP tool.
  - The tool inventory and Custom GPT sync are regenerated.
  - The public-submission packet, AGENTS.md and tests now say 33 tools: 27
    read-only and the same six writes.

## Owner gates before release

- **The public privacy notice** names exactly what Gemini receives today, the
  scout's screened target only. The new flow is not covered.
  - Four sentences in `site/privacy/index.html`, approved word for word in
    owner question 34 ("34 A", 2026-10-04), effective October 4, 2026, the
    day they went live.
- **Live acceptance: done 2026-10-03** with the owner's unbilled Gemini key
  (`docs/audits/2026-10-03-check-this-video-live-acceptance.md`).
- **Release bundle** (question 26, option A): this PR, #269 (`/version`) and
  Dependabot #263 to #268. Test-merged together on a scratch copy of main, it
  passed `npm run verify`. #267 and #268 conflict with the others only in the
  package files, and need a rebase as the merges go in.

## Later, not in this pass

- `finalize_research` requiring each material claim to be checked or listed
  unchecked, keyed to the receipt.
- A Custom GPT Action (the Custom GPT work is dropped where it limits the
  design, owner 2026-09-27).

## Tests

- No request to Gemini contains user text.
- The request and response shapes, schema bounds, `MM:SS` parsing and time
  links.
- Pending, then complete, through the continuation token, and the stored
  interaction deleted after completion and after an abandoned token.
- Refusals: billing flag, missing keys, non-public or live video, too long,
  daily limit.
- The ledger refuses an unsafe directory, and its counts survive a restart.
- The receipt is signed and verifies.
- The catalog has 33 tools on both surfaces.

## Acceptance (live, before the release)

On three public health videos (one first-person, one by a clinician, one with a
sponsor), using the owner's unbilled Gemini key:

- the pass returns timestamped claims;
- spot-checked quotes match the video at the linked times;
- the stored interaction is deleted;
- the daily ledger records the seconds.

## Release

One release with `/version` (#269), after owner approval, following
`docs/superpowers/plans/2026-10-01-pr246-production-release.md`. The skill file
changes, so the plugin is reinstalled. The privacy page needs the owner's
wording only if it must name the new Gemini use: it already names Gemini for the
scout. That check is part of the release.
