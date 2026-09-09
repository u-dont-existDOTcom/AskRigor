# Response to Google YouTube API Services compliance review

Hello YouTube API Services Team,

Thank you for the opportunity to clarify AskRigor's architecture and complete
the review items.

## III.D.1c — Google Cloud project numbers

The complete Google Cloud project-number set associated with AskRigor's
YouTube API Services access is:

- `927421077304` — the sole project currently used by AskRigor; and
- `1000928389599` — a historical project whose AskRigor API key was retired and
  deleted on September 8, 2026. It had no traffic from September 1 through
  September 8, 2026.

AskRigor does not currently use any project other than `927421077304` for
YouTube API Services. The active key is restricted to AskRigor's production IP
address and to YouTube Data API v3.

## III.A.2d — Privacy Policy

We have verified and expanded AskRigor's Privacy Notice at
https://askrigor.com/privacy.

It now describes the API-visible public YouTube data AskRigor can process,
including video IDs, titles, descriptions, channel IDs and titles, publication
times, durations, tags, live/privacy/embeddability status, API-visible counts,
comment and reply IDs, parent/top-level IDs, public author channel IDs and
optional display names, comment/reply text, timestamps, like/reply counts, and
pagination state. It explains that these public data are used for read-only
research discovery, identity/metadata validation, public-discussion retrieval,
coverage accounting, and source-linked output. It also gives the exact
transient and persistent handling, expiry, refresh, deletion, logging, and
backup behavior summarized below.

## III.A.2h — Authorized Data and revocation

AskRigor does not request OAuth 2.0 authorization from YouTube users and does
not access Authorized Data associated with a user's YouTube account. AskRigor
accesses API-visible public YouTube data using a server-side application API
key. It does not direct users to a Google consent screen, request YouTube OAuth
scopes, receive user access or refresh tokens, or link a Google account.

Accordingly, AskRigor does not create a Google/YouTube authorization grant for
an end user to revoke. We clarified this architecture in the Privacy Notice and
linked to Google Account connections for general information while making clear
that using AskRigor does not create such a connection. If a particular AskRigor
request has been classified as Authorized Data, please identify the applicable
API endpoint or OAuth scope so that we can reconcile that classification.

## III.E.4a–4g — Storage, refresh, update, and deletion

AskRigor's behavior is as follows:

1. Each new YouTube search, video-metadata lookup, comment retrieval, or reply
   retrieval reads the current API-visible data from YouTube. AskRigor does not
   operate a background-synchronized YouTube mirror or durable raw-comment
   corpus.
2. Raw provider responses are held only for the active bounded HTTPS request.
   Direct MCP continuation state is returned to the invoking client and expires
   after one hour. Custom GPT continuation handles and provider cursors are
   process-local and expire after one hour.
3. During an active controlled research session, a bounded process-memory cache
   may temporarily hold exact public caption segments and comment/reply text and
   IDs after author display names and author channel IDs are removed. It is
   limited to 100 entries and 64 MiB, expires after 72 hours without use and no
   later than seven days after creation, is swept within one hour after expiry,
   and is released immediately after successful report finalization. Capacity
   eviction or application restart also discards it.
4. The encrypted research-session checkpoint may retain public video/channel
   identifiers and titles, publication times, retrieval/coverage state, counts,
   hashes, bounded non-identifying findings, and opaque continuation handles.
   It does not store raw comment or reply text, commenter display names or
   channel IDs, raw YouTube response bodies, credentials, or raw provider
   pagination tokens. Checkpoints expire after 72 hours without use and no
   later than seven days after creation. They are removed during access,
   inventory, and service startup and by an hourly expiry sweep.
5. If temporary exact material expires while a session remains eligible,
   AskRigor fetches it again from YouTube and requires the new coverage receipts
   to match before use. It does not silently reuse stale raw data.
6. AskRigor has no configured backup for its checkpoint directory or process
   caches. Its formal living-evidence database cannot represent raw
   YouTube/community content and has no automatic off-host backup. AskRigor's
   application and reverse proxy do not log YouTube queries, URLs, identifiers,
   comment text, request or response bodies, provider bodies, or credentials.
7. A user may request earlier deletion of an AskRigor-controlled encrypted
   checkpoint by contacting joel@askrigor.com with the opaque research session
   ID. No Google/YouTube authorization revocation is needed because AskRigor
   creates no user authorization grant. Google, the connected client, and
   infrastructure providers apply their separately controlled retention
   policies.

We also verified the active production architecture with read-only requests to
`search.list`, `videos.list`, `commentThreads.list`, and `comments.list`. All
four returned successfully using the server-side project key without a user
OAuth flow.

## Screencast

The English-language screencast demonstrates public-video discovery, metadata
validation, public top-level comments, replies, and AskRigor's resulting
ChatGPT output:

[INSERT ENGLISH-LANGUAGE SCREENCAST URL]

Public links:

- Privacy Notice: https://askrigor.com/privacy
- Terms of Use: https://askrigor.com/terms
- Support: https://askrigor.com/support

Best regards,

Joel

AskRigor

joel@askrigor.com
