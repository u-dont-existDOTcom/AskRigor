# AskRigor v0 data map and privacy review

Status at 2026-08-17: this remains the detailed engineering inventory.
The live August 12, 2026 notice at release `f928b95e29cd` was the pre-lesson privacy notice.
The August 13, 2026 lesson notice is live and was reverified before the lesson Action was enabled.

## Purpose and boundary

AskRigor has three deliberately separate processing paths:

- **Research retrieval path:** the existing MCP research operations and, when
  independently enabled, their public read-only Custom GPT Action forms use the
  same provider-retrieval implementation. MCP continuation remains stateless
  and client-carried. The Custom GPT Action adapter uses the bounded in-memory
  handle exception described below. Requests may
  contain user search terms and public identifiers. Responses may contain
  public provider metadata, open publication text, and comment text. They return provider data to the
  invoking client and make no provider write or medical conclusion. Provider
  content is untrusted input; it is parsed as data and never executed as
  instructions.
- **Optional lesson path:** after AskRigor validates a concrete criticism and
  obtains separate consent, the consequential Custom GPT Action accepts a
  derived candidate, screens it, sends the derived fields to a fixed OpenAI
  privacy check, and writes a private GitHub review candidate plus anonymous
  occurrence metadata. It is not an MCP operation and cannot change code,
  protocols, instructions, providers, or releases.
- **Automated Gemini-candidate path:** a public read-only Action accepts only a
  de-identified population-level research target and a diagnosis-status enum.
  Deterministic screening rejects personal narratives, identifiers,
  credentials, raw chat, URLs, and control/injection-like text before any
  provider request. The server sends the screened target and checked-in public
  scout instructions to the fixed Gemini model with Google Search and
  `store:false`. Gemini returns a compact fixed-column packet that the server
  reconstructs and checks against the strict canonical candidate contract. If
  that check fails, the server may make exactly one storage-disabled,
  no-search correction request to the same model containing only the public
  candidate output, exact executed public searches, and bounded non-sensitive
  validation issues; it then validates again and fails closed. The server
  independently validates each public YouTube identity. It retrieves no comments or transcripts, makes no
  medical conclusion, and creates no content-bearing persistent store. The
  older operator-supplied validator remains only for backward-compatible
  technical inspection of historical packets; ordinary research does not
  require a person to transfer a packet.
- **Non-production research-session prototype:** an unregistered internal
  controller binds one research target to exact protocol identities, public
  candidate metadata, bounded semantic screening decisions, and per-video
  transcript/discussion coverage receipts. Phase D3 also binds material
  program-derived formal-search receipts, public source identities and access
  attempts, opaque open-full-text handles and content hashes, method-audit
  receipt projections, compact external-evidence hashes/directives, linked
  public source identities, and claim-capability state. Selected-video state may retain
  short opaque Action handles, attempts, public video/channel identity,
  access/completion status, caption-track/timestamp facts, cumulative counts,
  and corpus hashes. It never stores transcript segments, comment text,
  commenter identities, publication blocks/full text, raw provider bodies,
  provider cursors, credentials, or protocol text. The prototype is absent
  from the public MCP and Action inventories and is not deployed.
- **Non-production external-study evidence path:** an internal coordinator
  accepts only an opaque research-session ID and one public DOI, verifies exact
  Crossref identity, then invokes Crossref and FORRT itself. It normalizes
  ordered public publication-update assertions and provider-reported
  replication/reproduction relationships, derives bounded controller work, and
  issues a signed structural receipt. Optional unconfigured providers remain
  explicit coverage gaps. Phase D3 connects its signed result to the
  unregistered research-session prototype only; it remains absent from the
  public MCP, Custom GPT Actions, and deployment. Its bounded
  content-addressed in-memory artifact store can hold strict normalized
  provider envelopes for the lifetime of that non-production store object; it
  writes no durable storage. Portable output contains public study/provider
  metadata, hashes, directives, limitations, and artifact references—not
  artifact bodies, signing secrets, raw chat, or health details. Provider labels
  are leads, no-match is provider-scoped, and a signed structural receipt is not
  a study-quality or scientific-validity determination.
- **Non-production Retraction Watch snapshot path:** Phase D4 source can fetch
  the public Crossref Retraction Watch CSV only through an explicit operator
  command, outside user requests, and transform it into an immutable local
  manifest, normalized public integrity records, and DOI/PMID indexes. No user
  prompt, health detail, research query, credential, provider body, article
  text, or session identifier enters those files. The source candidate has no
  configured production directory, schedule, pruning, or retention policy and
  is not deployed. If Phase G activates it, the privacy/threat/retention map
  must first specify the exact active/previous snapshot files, permissions,
  deletion, rollback, stale-sync behavior, and deployment topology.

The lesson path is deployed from exact code revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a` and passed its bounded synthetic
submission, append-only duplicate, failure-isolation, and rollback acceptance.

The research Action bridge is gated by the exact literal
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true`, separately from the deployed lesson
switch. Its local candidate limits are **60,000 serialized UTF-8 bytes** per
response and **48,000 UTF-8 bytes** of exact protocol text per ordered chunk.
Research Actions and MCP use one shared per-client rate limit and concurrency
pool.
The bridge is live; its exact deployment and acceptance identities are recorded
separately in `docs/custom-gpt-action-live-acceptance.md` and
`docs/release-evidence-v0.1.0.md`.

## Data returned to the MCP or Custom GPT Action client

| Category | Examples returned | Why it is returned |
| --- | --- | --- |
| User-supplied search or lookup input | query terms, date ranges, PMIDs, NCT IDs, DOI/citation strings, YouTube video IDs/URLs, opaque cursors | Reproducibility and pagination in the provenance envelope. |
| Protocol responses | complete canonical protocol text from `load_protocol`; manifest/integrity outputs from `get_protocol_manifest` and `verify_protocol_integrity`, including protocol name, version, revision date, SHA-256, verification boolean, and protocol error code/message when applicable | Protocol activation, integrity checking, and source reproducibility. |
| Shared provenance | provider, record type, primary/provider IDs, retrieval timestamp, source URL/title/authors or channel, pagination, access status, limitations, and structured provider error | Makes source, time, coverage, and failure boundaries auditable. |
| Shared nested response fields | `raw_metadata` provider counters/freshness fields; `error` code/message/optional HTTP status/retryability; `source_identity` canonical URL/title/authors or channel; pagination cursor/next cursor/page size/returned/exhausted; limitations | These nested fields disclose response coverage, provider context, and failure semantics without exposing a raw provider payload. |
| Scholarly metadata | PMID, title, abstract when PubMed provides it, journal, dates, authors, DOI, publication types; Europe PMC source/IDs/title/authors/journal/year; Crossref candidates and backward-compatible update/retraction evidence; internal-only rich Crossref event assertions and FORRT relationship metadata in Phase D1 | Scholarly retrieval and discovery; citation, abstract, publication-event, or provider-reported replication metadata is not a substitute for inspecting the study and linked source. The new rich records are not public or session-connected in Phase D1. |
| Open publication full text and audit index | Requested DOI/optional PMCID; Europe PMC or Unpaywall discovery attempts; public source URL, title, manuscript version and format; exact document and block SHA-256 values; extracted public JATS or PDF text with section/page location; opaque document handle and cursor; source-linked study or review audit submissions and bounded validation receipts | Attempts a lawful, identity-checked full-text method audit. Retrieval, open availability, randomization, peer review, journal status, or guideline status is not treated as proof of reliability. If no complete copy passes access and identity checks, only a possibly useful lead is returned and unseen contents are not evidence. |
| Public trial metadata | NCT ID, title, status, study type/phases, conditions, interventions, sponsors, enrollment, dates, results flag, references, and last update | ClinicalTrials.gov record lookup/search. |
| Public YouTube video metadata | video ID, title, description, published time, channel title/ID, duration, privacy status, and API-visible counts where supplied | Video discovery and provenance. |
| Public YouTube comment data | comment/reply IDs, parent/top-level IDs, public YouTube author/channel IDs, optional public display names, public comment text, likes, and publication/update timestamps | Requested API-visible comment and reply retrieval with completeness accounting. |
| Public YouTube transcript data | public caption text, segment start/duration, selected and available caption languages, provider-reported automatic-caption status, public video/channel metadata, and canonical timestamp links | Custom GPT-only best-effort verification of what a video's selected public caption track says; not an efficacy, accuracy, or causality determination. |
| YouTube community survey | user-supplied research question and labeled YouTube queries; bounded, deduplicated candidate videos; canonical clickable URLs; public title/channel/date metadata; and provider-reported comment counts | Maps promising videos before deeper acquisition without treating query-bounded discovery as the comment corpus. |
| Compound YouTube audit | user-supplied research question and labeled YouTube queries; bounded candidate/video selection; a complete small corpus or deterministic sample; corpus SHA-256; and a completion/synthesis-lock receipt | Performs reproducible multi-query discovery and complete API-visible acquisition in one request without making a medical conclusion. |
| Adaptive per-video YouTube audit | video metadata; provider-reported comment count; exact top-level, reply, cumulative-retrieval, and returned-for-analysis counts; API-visible comments/replies; deterministic sample; rolling corpus digest; completion receipt; and optional opaque authenticated continuation state | Retrieves one important video's API-visible discussion over bounded calls while preserving exact depth and completion state. |
| Treatment-landscape coverage assessment | caller-supplied research target; receipt-linked discovery batch queries/scopes, specific implementation/discriminator terms and results, literal access/pagination states, class IDs, and candidate IDs; complete external-scout frontier digests and candidate partitions; treatment-class labels/search/formal-follow-up/omission states; structured program fields with `program not described` normalized; public video and stable channel IDs, titles/dates, selection and omission states; projected transcript chain/language/caption/timestamp fields; projected comment-audit metadata/access/count/reply/lock fields; directional-search states; and terminal/retryable/recovery boundary fields | Reconciles the supplied ledger, derives valid counts and normalized program signatures, excludes invalid records from aggregates, and returns separate selection, per-video-depth, and overall workflow locks plus compact per-video records. It makes no provider call, persistence, semantic-completeness claim, efficacy judgment, or medical conclusion. |
| Automated Gemini candidate scout and validation | screened de-identified population-level research target; diagnosis-status enum; checked-in scout instructions; aggregate token/Search usage; receipt-reconciled executed searches; public video IDs/URLs/titles/channels; provisional program/stage/outcome summaries; bounded safe validation issues when one correction is needed; independent public YouTube identity metadata; and a SHA-256 frontier partitioning validated, terminally rejected, and unresolved IDs | Finds a broad public candidate frontier without manual transfer. Gemini first receives the screened target and public instructions in a storage-disabled search request. If needed, one storage-disabled no-search correction returns only Gemini's public candidate output, exact public search receipts, and safe validation issues to the same provider. YouTube receives only candidate video IDs. Provisional summaries remain discovery annotations, not transcript verification or treatment evidence. No comments or transcripts are retrieved and no candidate content is persisted by AskRigor. |
| Legacy Gemini packet validation | operator-supplied de-identified research target, executed searches, public video identity fields, and provisional annotations | Preserves backward-compatible technical validation of historical packets. It is not the ordinary automated research path and creates no additional store. |
| Completeness/accounting data | top-level/reply counts, mismatch identifiers, page counts, API-visible coverage, output/text byte counts, elapsed time, and provider request attempts | Shows whether a comment corpus is complete, partial, inaccessible, or failed. |

The source-generated full MCP `tools/list` inventory, including every advertised
input and output schema (and therefore every returned nested category), is
committed as `docs/tool-inventory-v0.1.0.json` and regenerated by running
`npx tsx scripts/generate-tool-inventory.mts`. Its exact JSON output is
checksum-locked and equality-checked by `tests/release-packet.test.ts`; it is
the authoritative companion to this human-readable data map.

Public YouTube author/channel IDs, optional display names, and comment text can be
personal data even when made public by the author. The live pre-lesson notice
specifically discloses this research processing and its API-visible-only
limitation; the live August 13 notice preserves that disclosure and adds the
lesson boundary.

The optional continuation token contains only the video identifier, upstream
pagination cursor, one-hour issue/expiry timestamps, analysis limit, page and
record counters, bounded deterministic-sample comment identifiers, bounded
SHA-256 fingerprints of comment identifiers from the immediately preceding
top-level and reply pages, bounded reply-parent identifiers with provider-reported versus retrieved reply counts,
an authenticated fixed-size identifier-membership filter, and a rolling corpus
digest.
It contains no comment text, author identity, provider credential, or
continuation secret. The token is authenticated by a server-side secret. As a
control, the continuation secret is never returned or logged.

For MCP client-carried continuation state, the invoking client receives that
token and may resend it during the active request chain; the server keeps no
matching session record. The Custom GPT Action continuation handle map instead
stores only that already minimized signed token in process memory and returns a
37-character unguessable handle. It retains no comment text, author identity, provider credential, or protocol text. An entry exists for no longer than one
hour; the map is hard-bounded to 2,048 entries and 16 MiB of token-plus-handle
bytes. A server restart, expiry, or capacity eviction invalidates the handle
and requires restart from the video identifier. The map is never written to
disk or application logs and is not a durable research-session store. This
process-local design is limited to a single application replica and
must not be horizontally scaled unless an approved sticky-routing or shared-state design
preserves every continuation chain.

The Custom GPT transcript Action uses a separate 37-character handle backed by
compact process-memory chain state: provider cursor, public video ID, selected
language and automatic-caption flag, caption-snapshot SHA-256, page size/count,
cumulative segment count, next expected segment index, and timestamp-presence
state. It stores no caption text, title, channel name, request text, credential,
or protocol text. Entries expire within one hour; the map is bounded to 2,048
entries and 4 MiB, is never written to disk or logs, and has the same
single-replica/sticky-routing constraint.

The open-full-text Actions use a separate 37-character handle backed by the
exact identity-verified public document index and its next block/character
cursor. This state can include extracted public publication text, section/page
paths, public citation metadata, manuscript version, and SHA-256 values; it does
not include a user's health record, provider credential, or private publication
copy. Entries expire within one hour, are bounded to 64 entries and 128 MiB in
aggregate, are never written to disk or application logs, and have the same
single-replica/sticky-routing constraint. Expiry, eviction, or restart requires
reacquiring and rereading the exact document; chains cannot be combined.

The ordered protocol Action cursor contains only protocol identity, digest, byte offset, chunk index, and expiry. It contains no protocol text, health content, or secret. It is authenticated with a protocol-specific key derived
from the existing server-only continuation secret. The Action returns each
exact UTF-8 chunk transiently and keeps no protocol-loading session record.

## Research processing and retention

| Location | Data handled | Persistent storage in v0 |
| --- | --- | --- |
| MCP or Custom GPT research Action request and adapter memory | Request parameters, provider responses, normalized metadata, public open-publication content and audit fields, public YouTube identity/comment/caption data, screened Gemini scout target and provisional candidate annotations, treatment-landscape coverage fields, and the current bounded segment used to update a deterministic sample and rolling corpus digest | Used for the active request only except for the exact Action handle-map rows below. No database, file store, account profile, queue, durable full-text store, transcript-text store, candidate-packet store, treatment-landscape store, or server-side comment corpus is implemented. Gemini requests set `store:false`; AskRigor retains no provider interaction ID or candidate content after the active response. Transcript continuations re-fetch the selected track; only compact chain metadata is retained under the bounded row below. The coverage assessor makes no provider call. The Phase D1 Crossref/FORRT primitives are not reachable through these public transports. |
| Internal Phase D1 external-evidence adapter invocation | One public DOI; normalized Crossref publication events or FORRT replication/reproduction relationships; provider response hashes, access/error state, limitations, and FLoRA attribution | Transient process memory only. No public route, research-session connection, database, cache, response artifact, or durable provider-content store is added in Phase D1. Fixtures are synthetic. |
| MCP client-carried continuation state | The minimized, opaque authenticated continuation state described above | Returned to the invoking MCP client and processed transiently if resubmitted within one hour. The server keeps no matching MCP session record. |
| Custom GPT Action continuation handle map | A short random handle mapped to the existing signed minimized token; no comment/reply text, author identity, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 16 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires an approved sticky-routing or shared-state design. |
| Custom GPT transcript Action continuation handle map | A short random handle mapped to compact transcript chain metadata: provider cursor, public video ID, selected-track metadata, caption-snapshot hash, page size/count, cumulative segment count, next expected index, and timestamp-presence state; no caption text, title, channel name, request text, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 4 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires approved sticky routing or shared state. |
| Open-full-text Action handle map | A short random handle mapped to one exact identity-verified public document index plus the next block/character cursor, segment counts, public source metadata, manuscript version, and document/block hashes | Process memory only on the single application replica, no longer than one hour, at most 64 handles and 128 MiB total. The map may contain extracted public publication text but no private copy, provider credential, or user health record. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; horizontal scaling requires approved sticky routing or shared state. |
| MCP or Custom GPT research Action response | The normalized fields in the table above. Action protocol and open-full-text reads use exact ordered chunks; transcript pages contain bounded timestamped caption segments; oversized per-video community samples may be deterministically transport-bounded without changing retrieval counts, digest, access state, or receipt. | Delivered to the connected client. The client/ChatGPT may retain conversation or tool-result data under its own terms; AskRigor v0 does not control that retention. |
| Server logs | In routine operation the application emits a startup line only. A disabled-by-default MCP connector diagnostic can be enabled temporarily by a maintainer. It emits only a fixed route class, HTTP method class, coarse header/media-presence classes, selected JSON-RPC phase class, completion class, and response status. It never emits a URL or query, IP/network address, user-agent, header value, request or response body, JSON-RPC ID, tool name or argument, prompt, provider payload, comment text, user identifier, or credential. Infrastructure may independently process operational metadata such as time, route, HTTP status, latency, IP/network data, or security signals. | No request-body, response-body, candidate-content, or dedicated application access log is emitted or stored. The temporary connector diagnostic is restricted to a troubleshooting window and must be disabled by recreating the diagnostic container after the needed receipt is captured; its active container log is not a durable research-session store. Infrastructure retention and backups follow each provider's configured policy and are outside AskRigor's application storage. |
| Provider requests | Necessary query/identifier and fixed service contact values where required by a provider, including the service contact email sent to Unpaywall; the screened population-level target plus public scout instructions sent to Gemini; and, only after a malformed scout packet, one bounded correction containing Gemini's own public candidate output, exact executed public queries, and safe validation issues. If the internal Phase D1 adapters are invoked by later controller work, Crossref receives the public DOI and configured service contact, while FORRT receives only the public DOI and fixed headers. | Europe PMC, Unpaywall, public copy hosts, Crossref, FORRT, Google Gemini, Google Search, and YouTube process requests under their own policies. Both possible Gemini interactions use the paid fixed model with `store:false`; only the first can use Google Search. Provider keys and contacts remain server-only. AskRigor does not claim to control provider processing or retain a provider-side copy. Phase D1 itself does not expose or deploy the new internal adapters. |
| Aggregate AI budget ledger | UTC month, fixed $50 monthly limit, aggregate charged nano-USD, update time, and schema version shared by lesson privacy and Gemini scouting | Owner-only mode-0600 file. It contains no target, prompt, candidate, request, response, identity, or credential. Each Gemini call reserves at most $1 before provider execution. |
| Optional local legacy Gemini-candidate validator | Operator-supplied de-identified research target, executed search queries, public video IDs/URLs/titles/channels, provisional creator-claim annotations, and independently retrieved bounded public video metadata | The operator controls the historical input file and standard output. AskRigor creates no additional file, database row, log, account record, comment corpus, or transcript store. YouTube processes the video-ID lookups under its own policy. |
| Non-production research-session prototype | Research target and diagnosis-status enum; exact protocol identities; module/operation state; public candidate/video/channel metadata and provisional program fields; bounded candidate-screening decisions/rationales; selected-video attempt/status; short opaque Action handles; transcript/discussion coverage receipts; material program-derived formal queries; bounded PubMed/Europe PMC page receipts and public DOI/PMID/PMCID/source/version identity; full-text access attempts, opaque handles, content hashes and coverage counts; method/external receipt hashes; provider directives and linked public source IDs; claim-capability state and bounded work packages | Process memory only, one hour from issue or last successful replacement, at most 1,024 entries and 16 MiB total. Capacity eviction, expiry, or process restart removes the state. It stores no transcript/comment text, comment-author identity, publication blocks/full text, raw provider bodies, provider cursor, credential, signing secret, or private source. It is an unregistered development prototype, not a production data flow; durable storage remains an explicit later owner/privacy gate. |
| Non-production external-evidence artifact store | Strict normalized Crossref/FORRT envelopes for one public DOI; content-derived artifact ID; provider/source identity; media type; byte count; content and descriptor hashes | Unregistered process-memory abstraction only, with default bounds of 128 entries, 10 MiB per artifact, and 32 MiB total. Bytes are cloned, exact artifacts deduplicated, and entries explicitly revocable; process loss discards them. No timer, disk, database, object store, backup, production singleton, or public route is activated. Durable persistence remains a Phase G owner/privacy decision. |

Full application request bodies and response bodies are not logged or written
to durable storage for either research transport. The Action adapter retains
only the minimized signed discussion token, compact transcript chain metadata,
or exact public document index under the exact bounded exceptions above; it
never retains comment/caption text or publication text outside the specifically
disclosed bounded maps.
Infrastructure and upstream providers may retain
separately controlled operational or request data under their own policies.

## Optional lesson request and result contract

AskRigor receives only these generalized structured request fields from the
Custom GPT, never the raw chat:

| Request field | Meaning and implemented bound |
| --- | --- |
| `category` | One allowlisted product-failure category. |
| `general_lesson` | General product invariant, 40–600 characters. |
| `expected_behavior` | Correct AskRigor behavior, 40–1,200 characters. |
| `failure_reason` | General defect explanation, 20–800 characters. |
| `synthetic_regression_example` | Non-personal synthetic example, 20–1,200 characters. |
| `evidence_basis` | `assistant_self_check`, `tool_receipt_conflict`, `source_recheck`, or `instruction_mismatch`. |
| `askrigor_version` | Optional version string, at most 64 characters. |
| `protocol_identities` | Optional list of at most four name/version/optional SHA-256 identities. |
| `consent_scope` | `once` or `conversation`; screened for audit semantics but not stored in the GitHub issue. |

Unknown fields are rejected. There is no request field for raw user or
assistant messages, a user or conversation identifier, an account, email,
location, medical history, upload, or raw quotation. The complete decoded JSON
body is limited to 8,192 UTF-8 bytes.

The public result is one strict status shape: `submitted` or
`existing_candidate` returns only `candidate_id`, `occurrence_count`, and
`retryable:false`; `rate_limited` returns `retry_after_seconds`, an allowlisted
`reason_code`, and `retryable:true`; `privacy_rejected`,
`anonymizer_unavailable`, and `github_unavailable` return only their status,
retryability, and an allowlisted reason code. Results do not expose a private
URL, GitHub issue number, candidate text, or fingerprint.

## Lesson screening, recipients, and storage

The server applies deterministic screening before and after the fixed OpenAI
privacy check. Only already-derived fields are sent to
`gpt-5.4-nano-2026-03-17`; the Responses API request uses `store:false` and strict
structured output. Model uncertainty, failure, invalid output, or budget
exhaustion fails closed before GitHub. The OpenAI check generalizes privacy risk
but does not determine whether the lesson is scientifically correct.

If both screens pass, the private GitHub issue stores the category in its title
and labels; general lesson; expected behavior; failure reason; synthetic
regression example; evidence basis; optional AskRigor version and protocol
identities; the privacy-gate marker; optional prior public candidate ID; an
initial anonymous occurrence count; first-seen timestamp; and a hidden
deduplication fingerprint marker. Later duplicates leave that body unchanged
and append private generated comments containing only the anonymous count,
observation timestamp, and canonical fingerprint marker. Neither the issue nor
the generated comments store `consent_scope`, user identity, network identity,
conversation identifier, raw chat, raw quotation, medical history, or upload.

The ledger's four aggregate data values are UTC month, monthly limit, charged nano-USD, and update time; a non-content schema version is also stored.
Their implemented keys are `utc_month`, `monthly_limit_nano_usd`,
`charged_nano_usd`, and `updated_at`, plus `schema_version`. The ledger contains no candidate or request content.
It enforces the fixed $50.00 monthly limit; a new UTC month replaces the prior
aggregate ledger.

Recipients and provider boundaries are therefore distinct:

- the AskRigor server receives and validates the generalized structured lesson
  candidate;
- OpenAI receives those derived fields for the fixed privacy check;
- Google Gemini first receives only a deterministically screened,
  de-identified population-level research target plus the public
  candidate-scout instructions; Google Search runs inside that request. If the
  compact packet fails strict validation, one no-search correction may return
  that bounded public packet, the exact executed public queries, and safe
  validation issues to the same model. Both interactions use `store:false`;
- GitHub receives only the approved private issue fields and anonymous
  recurrence metadata;
- ChatGPT handles the surrounding conversation and Action result under its own
  terms and settings; and
- infrastructure providers may process bounded operational metadata for
  security and service operation.

OpenAI API, Google Gemini/Search, GitHub, ChatGPT, infrastructure, and research-data providers govern
their own processing and retention under their respective policies. AskRigor
does not claim to control provider-side copies or deletion schedules.

## Lesson logs, retention, and deletion

The application does not emit or store request-body logs, response-body logs, candidate-content logs, or a dedicated application access log. Its routine output is the startup line; the separately described disabled-by-default MCP connector diagnostic may temporarily emit only its bounded non-content classifications.
This application-log boundary coexists with the separately disclosed private GitHub issue storage of accepted generalized candidate fields and anonymous occurrence metadata, and with the aggregate budget ledger.
It also does not log raw chat, user identifiers, network identifiers, or
credentials. Infrastructure providers may independently process operational
metadata, IP/network data, or security signals under their own configured
policies; AskRigor does not claim that its application controls those provider
logs or retention periods.

Private lesson issues remain available for human review until a maintainer
deletes them. Rejected or incorporated issues become deletion-eligible strictly
after 90 complete days from the terminal review timestamp.
Deletion is not automatic in v1: `npm run lessons:status` flags eligible candidates, but
deletion is a deliberate maintainer operation and may occur later. A user can
request earlier deletion by sending the private-safe `ARL-####` receipt to
`joel@askrigor.com`. AskRigor can act only on data it controls; provider
retention and provider-side deletion remain governed by the provider.

## Research data not persistently stored in v0

- User accounts, profiles, authentication sessions, or user-entered research history.
- Search queries, research questions, directional labels, citations, protocol text, scholarly records, Crossref publication events, FORRT relationship records, trial records, YouTube videos, retrieved public caption segments, public YouTube author/channel IDs, display names, comments, replies, reply manifests, deterministic samples, corpus digests, transcript cursors, continuation tokens beyond the bounded in-memory Custom GPT handle exception, or completion receipts. The unregistered Phase D2 artifact store is a development-only process-memory exception for normalized public provider envelopes, not persistent storage. The Phase D4 Retraction Watch files are likewise source-only and not activated in production; if approved later, they contain only the public provider dataset's minimized integrity fields and verification metadata, never user/session content.
- Provider API keys, deployment credentials, or ChatGPT connection IDs in tracked repository files or MCP responses.
- Full article text, server-side transcript copies, private/deleted/held-for-review content, cookies, private communities, or generic scraped web pages.

The optional lesson path is the narrow durable-storage exception to the
research path's no-durable-persistence boundary. It stores only the screened private candidate and
anonymous recurrence metadata listed above; it does not create a research
history, transcript store, user profile, or automatic-learning database.

## Response minimization and security controls

- Every MCP tool is annotated `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`; the Action-only transcript, treatment-landscape, automated Gemini-candidate, and legacy validation routes are likewise public, read-only, and non-consequential. The automated scout consumes bounded provider quota but changes no provider, user, or server content.
- Strict Zod input/output schemas reject undeclared input fields. Pagination cursors are opaque at the MCP boundary.
- Internal external-evidence receipts use a server-held secret of at least 32
  UTF-8 bytes and domain-separated HMAC-SHA256; they bind session, study,
  protocol, provider artifacts/attempts, bundle, issue time, and key ID. Only
  placeholder environment names are checked in, and neither artifact bytes nor
  secret material enters the receipt.
- Adaptive YouTube continuations are HMAC-authenticated, expire one hour after the chain starts, and disclose neither the server secret nor comment/author content inside the token.
- Direct MCP clients carry that token. The Custom GPT Action returns a short
  handle backed only by the bounded, one-hour process-memory map described
  above; unavailable handles fail closed and require a restart from the video
  identifier.
- Transcript cursors bind the public video, selected language, segment offset,
  and a SHA-256 of the selected caption snapshot. They contain no caption text;
  a changed snapshot fails closed and requires a restart.
- Provider access failures remain explicit (`inaccessible`, `rate_limited`, `not_found`, or `error`) and never become negative evidence.
- The automated Gemini route rejects first-person or identifier-bearing targets before credentials, budget, or provider access; uses a fixed model, `store:false`, a compact fixed-column provider shape, unchanged strict canonical validation, reconciled Search-call receipts, at most one no-search correction, a 45-second deadline per interaction, one $1-per-scout reservation, and the shared $50 monthly aggregate limit; and never returns the provider key, invalid raw output, thought content, or search-result HTML.
- Transcript access uses an unofficial HTTPS-only, host-allowlisted YouTube interface with one bounded request deadline and bounded provider bodies. `api_visible_complete` covers only the selected caption track; caption text is not independently verified and may be automatic or inaccurate.
- The public route is fail-closed, has bounded request body/concurrency/rate limits, and does not return credentials. Source tests check that a test YouTube key never appears in results.
- Comment retrieval reports API-visible coverage only. It does not claim access to deleted, moderated, private, hidden, held-for-review, unavailable, or never-posted material.
- The lesson Action uses separate Bearer authentication, remains
  `x-openai-isConsequential:true`, and never appears in MCP `tools/list`.
- The dedicated GitHub App is restricted to metadata read and issues
  read/write on one private repository; it has no contents, pull-request,
  actions, administration, secrets, organization, or account permission.
- Only one lesson writer runs in v1. The server serializes duplicate handling
  and returns only an `ARL-####` candidate ID plus anonymous occurrence count.

## Public-policy status

The stable HTTPS policy at `https://askrigor.com/privacy` was independently
verified on 2026-08-12 against immutable release `f928b95e29cd` for the
read-only research service. The August 13, 2026 lesson disclosure from source
commit `56d13b73e74c377cfd6d513a5f4ceeec9949e0bf` was later deployed and
reverified before the lesson Action was enabled. Keep this internal map as the
more detailed implementation inventory. The August 16 Custom GPT research
transport disclosure in `site/privacy/index.html` is candidate source, not a
live-policy claim, until its transactional deployment is recorded. Re-review
the live notice whenever processing changes.
