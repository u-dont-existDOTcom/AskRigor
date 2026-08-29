# AskRigor YouTube API use and presentation

## API Client and end users

AskRigor is a population-level research assistant presented to end users in an
AskRigor Custom GPT conversation in ChatGPT. The connected AskRigor backend
performs read-only public-source retrieval. End users do not sign in to Google
or YouTube through AskRigor, and AskRigor does not request OAuth consent or
Authorized Data.

## Official YouTube Data API v3 methods

| Method | Request purpose | Important request fields | Normalized use |
| --- | --- | --- | --- |
| `search.list` | Discover public videos for specific research queries | `part=snippet`, `type=video`, `q`, `maxResults`, optional `pageToken` | Candidate video ID, title, channel, publication time, canonical URL, pagination/access state |
| `videos.list` | Validate a selected public video and retrieve its metadata | `part=snippet,contentDetails,statistics,status`, `id` | Title, description, channel, publication time, duration, privacy/embeddability status, API-visible counts |
| `commentThreads.list` | Retrieve published public top-level comments and embedded replies | `part=snippet,replies`, `videoId`, `maxResults=100`, `textFormat=plainText`, `order=time`, optional `pageToken` | Public comment/reply records, page and thread counts, reply reconciliation state |
| `comments.list` | Complete replies not fully embedded in a thread response | `part=snippet`, `parentId`, `maxResults=100`, `textFormat=plainText`, optional `pageToken` | Missing public replies, deduplication and parent/video correlation, completion accounting |

All calls are `GET` requests authenticated with a server-side project API key.
The key is never included in the client response, report, logs, or attachment.

## Processing and safeguards

The backend validates the provider response schema, requested video identity,
reply parent correlation, pagination tokens, duplicate identifiers, and
provider-reported versus retrieved reply counts. It uses bounded page, record,
byte, request-attempt, and elapsed-time limits. A failure is kept as an explicit
complete, partial, unavailable, comments-disabled, or retryable boundary rather
than being treated as evidence.

The controlled research checkpoint can retain normalized public source
identities, counts, bounded semantic findings, limitations, and the bounded
reader report. It excludes raw provider bodies, raw comment text, commenter
identities, credentials, and keys. Temporary retrieval material remains in
bounded process memory and is discarded on expiry, eviction, or restart.

## How YouTube data appears at the API Client location

The final report is shown in the AskRigor Custom GPT conversation. It uses plain
language and source links rather than provider JSON. Depending on the authorized
report boundary, it can include:

- approaches or topics compared;
- a concise evidence result and uncertainty;
- **Public discussions checked**, with the linked video, API-reported public
  comment count when available, counts checked/analyzed, completion status,
  directional summary, and limitation;
- **Videos actually audited**, with the exact linked title, channel/date,
  program or topic examined, population/stage, outcome horizon, unique value,
  and transcript/discussion boundary; and
- **Videos worth watching** only when creator content was independently verified,
  with a timestamp link, reason it is useful, and a plain-language evidence
  limitation.

Raw commenter identity and comment text are not shown in the ordinary final
report. The report does not treat popularity, a creator statement, or a public
comment as proof that a treatment works.

## Public disclosures

- https://askrigor.com/
- https://askrigor.com/privacy/
- https://askrigor.com/terms/

## Reference implementation locations

- YouTube request construction and normalization:
  `packages/sources/src/youtube.ts`
- Per-video public-discussion acquisition and audit:
  `apps/research-mcp/src/youtube-video-community-audit.ts`
- Final reader-report contract:
  `apps/research-mcp/src/actions/research-report-synthesis.ts`
- End-user rendering instructions:
  `docs/custom-gpt-instructions.md`
- Privacy and retention map:
  `docs/privacy-data-map.md`
