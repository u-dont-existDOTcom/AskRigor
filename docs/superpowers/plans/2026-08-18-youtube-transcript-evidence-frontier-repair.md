# YouTube Transcript and Evidence-Frontier Repair Plan

**Goal:** Make Forum Signal discover and verify unusually informative creator
content instead of treating provider-ranked videos or comment corpora as the
video itself, while keeping the behavior universal and preserving the frozen
17-tool public MCP contract.

**Observed failure:** A product run selected generic and stage-mismatched videos,
collapsed distinct intervention programs, omitted plausible evidence-frontier
hypotheses, and still claimed completion. The failed topic remains a regression
fixture, not a shipped list of required interventions.

## Owner decisions and constraints

- Discover high-information claims dynamically; do not hard-code the failed
  topic's missing interventions into production instructions.
- Treat cure/reversal/fixed/what-finally-worked language as a high-yield
  retrieval hook, never as evidence that the claim is true.
- Verify creator content from a transcript before describing what a video says.
  Keep creator-content evidence separate from the video's comment corpus.
- Link only the most relevant content-verified videos for the user, with a
  timestamp when the relevant section is located and a concise reason to watch.
- If transcript access fails, preserve the exact access state and do not infer
  the video's content from its title, description, or comments.
- Preserve canonical protocol XML bytes, the public non-tailored health
  boundary, the exact 17-tool MCP inventory, lesson consent, and fail-closed
  privacy controls. Do not deploy, install in the GPT editor, or run provider
  live acceptance without separate authority.

## Research-before-reinvention ledger

| Gate | Result |
| --- | --- |
| Required | Yes. Transcript acquisition is a mature external capability and a public-data access boundary. |
| Independent conception | Separate creator transcripts from community comments; bounded transcript pages with provenance; vernacular evidence-frontier discovery; content-verified watchlist links. |
| Official baseline | YouTube Data API `captions.list` and `captions.download` require OAuth and do not provide arbitrary public-video transcript retrieval to this API-key service. Video resources expose metadata and caption presence, not transcript text. |
| Mature baseline | `youtube-transcript-plus` 2.0.1 is MIT, Node 20+, zero runtime dependencies, provides timestamps/language/auto-caption metadata, injected fetches, aborts, and typed failure classes. It uses an unofficial Innertube path and may break or be blocked from datacenter IPs. |
| Disposition | Adapt the exact dependency behind AskRigor's HTTPS-host, timeout, response-size, pagination, provenance, and access-status contract; do not copy or reinvent its extraction internals. |
| Novel remainder | Action-only route that preserves the frozen MCP; exact error mapping; bounded cursor pages; transcript/comment separation; evidence-frontier routing; timestamped curated watchlist; held-out regression tests. |
| Research debt | Reliability from the production host and real-video acceptance remain unverified until explicitly authorized. Unofficial caption access can fail even when a transcript is visible in a browser. |

## Implementation sequence

1. Add hermetic RED tests for manual/automatic captions, language selection,
   missing/disabled/rate-limited/unavailable states, cursor binding, pagination,
   URL/response bounds, and exact 17-tool MCP preservation.
2. Add a source adapter around `youtube-transcript-plus@2.0.1`. Allow only the
   required HTTPS YouTube host, enforce one request deadline and bounded upstream
   bodies, return transcript segments with millisecond timing and canonical
   timestamp URLs, and never persist transcript text.
3. Add `get_youtube_transcript` as a public non-consequential Custom GPT Action
   only. Keep it out of `registerTools` and `RESEARCH_OPERATIONS`; update the
   generated OpenAPI/sync ledger and public processing documentation.
4. After survey discovery, use the existing `get_youtube_video` read to inspect
   plausible candidates' description/tags before the transcript call. Treat
   that metadata as a discovery aid, not creator-content verification; do not
   change the checksum-locked MCP survey or video schemas.
5. Replace the named-topic production rules with universal evidence-frontier
   search, candidate fingerprinting, transcript verification, independent
   failure/harm checks, and a no-padding content-verified watchlist gate.
6. Add a held-out synthetic fixture in another domain where popularity, generic
   terminology, postoperative content, and clickbait are distractors; the
   correct candidate is discoverable only through a distinctive claim and
   matching transcript.
7. Regenerate deterministic artifacts; update privacy, release, recovery, and
   public-review evidence without claiming deployment or UI acceptance.
8. Run focused tests, site checks if the public privacy source changes, the full
   deterministic `npm run verify`, artifact equality, `git diff --check`, lesson
   status, and final diff review. Commit a local candidate; leave publication
   and live provider acceptance pending owner authorization.

## Acceptance criteria

- No failed-topic intervention names appear in the production Project router,
  plugin skill, generated instructions, or the new held-out fixture.
- A video cannot enter **Videos worth watching** unless its creator content was
  transcript-verified; each entry has a canonical watch URL, unique decision
  value, and relevant timestamp when available.
- Missing transcript access blocks claims about the video's content but does
  not erase separately audited community evidence.
- Cure/reversal/fixed language expands discovery without increasing credibility.
- Generic, program-mismatched, stage-mismatched, or redundant videos cannot
  stand in for an exact material hypothesis.
- Transcript pagination stays below the 60,000-byte Action ceiling and reports
  `partial` until the selected API-visible caption track is exhausted.
- The MCP inventory remains the exact 17-operation checksum-locked contract;
  the Custom GPT schema gains one read-only transcript Action.
- Verification passes locally, while deployment, production transcript access,
  and GPT UI behavior remain explicitly unverified.
