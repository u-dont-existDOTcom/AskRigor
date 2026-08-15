# AskRigor v0 data map and privacy review

Status at 2026-08-14: this remains the detailed engineering inventory.
The live August 12, 2026 notice at release `f928b95e29cd` was the pre-lesson privacy notice.
The August 13, 2026 lesson notice is live and was reverified before the lesson Action was enabled.

## Purpose and boundary

AskRigor has two deliberately separate processing paths:

- **Research retrieval path:** the existing MCP research operations remain
  stateless, read-only, and transient. They return provider data to the invoking
  client and make no provider write or medical conclusion. Provider content is
  untrusted input; it is parsed as data and never executed as instructions.
- **Optional lesson path:** after AskRigor validates a concrete criticism and
  obtains separate consent, the consequential Custom GPT Action accepts a
  derived candidate, screens it, sends the derived fields to a fixed OpenAI
  privacy check, and writes a private GitHub review candidate plus anonymous
  occurrence metadata. It is not an MCP operation and cannot change code,
  protocols, instructions, providers, or releases.

The lesson path is deployed from exact code revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a` and passed its bounded synthetic
submission, append-only duplicate, failure-isolation, and rollback acceptance.

## Data returned to the MCP client

| Category | Examples returned | Why it is returned |
| --- | --- | --- |
| User-supplied search or lookup input | query terms, date ranges, PMIDs, NCT IDs, DOI/citation strings, YouTube video IDs/URLs, opaque cursors | Reproducibility and pagination in the provenance envelope. |
| Protocol responses | complete canonical protocol text from `load_protocol`; manifest/integrity outputs from `get_protocol_manifest` and `verify_protocol_integrity`, including protocol name, version, revision date, SHA-256, verification boolean, and protocol error code/message when applicable | Protocol activation, integrity checking, and source reproducibility. |
| Shared provenance | provider, record type, primary/provider IDs, retrieval timestamp, source URL/title/authors or channel, pagination, access status, limitations, and structured provider error | Makes source, time, coverage, and failure boundaries auditable. |
| Shared nested response fields | `raw_metadata` provider counters/freshness fields; `error` code/message/optional HTTP status/retryability; `source_identity` canonical URL/title/authors or channel; pagination cursor/next cursor/page size/returned/exhausted; limitations | These nested fields disclose response coverage, provider context, and failure semantics without exposing a raw provider payload. |
| Scholarly metadata | PMID, title, abstract when PubMed provides it, journal, dates, authors, DOI, publication types; Europe PMC source/IDs/title/authors/journal/year; Crossref candidates and update/retraction evidence | Scholarly retrieval only; no full-text scraping or clinical interpretation. |
| Public trial metadata | NCT ID, title, status, study type/phases, conditions, interventions, sponsors, enrollment, dates, results flag, references, and last update | ClinicalTrials.gov record lookup/search. |
| Public YouTube video metadata | video ID, title, description, published time, channel title/ID, duration, privacy status, and API-visible counts where supplied | Video discovery and provenance. |
| Public YouTube comment data | comment/reply IDs, parent/top-level IDs, public YouTube author/channel IDs, optional public display names, public comment text, likes, and publication/update timestamps | Requested API-visible comment and reply retrieval with completeness accounting. |
| YouTube community survey | user-supplied research question and labeled YouTube queries; bounded, deduplicated candidate videos; canonical clickable URLs; public title/channel/date metadata; and provider-reported comment counts | Maps promising videos before deeper acquisition without treating query-bounded discovery as the comment corpus. |
| Compound YouTube audit | user-supplied research question and labeled YouTube queries; bounded candidate/video selection; a complete small corpus or deterministic sample; corpus SHA-256; and a completion/synthesis-lock receipt | Performs reproducible multi-query discovery and complete API-visible acquisition in one request without making a medical conclusion. |
| Adaptive per-video YouTube audit | video metadata; provider-reported comment count; exact top-level, reply, cumulative-retrieval, and returned-for-analysis counts; API-visible comments/replies; deterministic sample; rolling corpus digest; completion receipt; and optional opaque authenticated continuation state | Retrieves one important video's API-visible discussion over bounded calls while preserving exact depth and completion state. |
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
record counters, bounded deterministic-sample comment identifiers, plus bounded reply-parent identifiers with provider-reported versus retrieved reply counts,
and rolling corpus digest. It contains no comment text, author identity,
provider credential, or continuation secret. The token is authenticated by a
server-side secret. As a control, the continuation secret is never returned or
logged.
The invoking client receives the token and may resend it during the active
request chain; the server keeps no
matching session record.

## Research processing and retention

| Location | Data handled | Persistent storage in v0 |
| --- | --- | --- |
| MCP request and adapter memory | Request parameters, provider responses, normalized metadata, public YouTube identity/comment data, and the current bounded segment used to update a deterministic sample and rolling corpus digest | Used for the active request only. No database, file store, account profile, queue, transcript store, server-side comment corpus, or research-session persistence is implemented. |
| Client-carried continuation state | The minimized, opaque authenticated continuation state described above | Returned to the invoking client and processed transiently if resubmitted within one hour. There is no server-side comment corpus or research-session persistence. |
| MCP response | The normalized fields in the table above | Delivered to the connected client. The client/ChatGPT may retain conversation or tool-result data under its own terms; AskRigor v0 does not control that retention. |
| Server logs | The application source emits a startup line only and does not log tool arguments, raw provider payloads, comment text, user identifiers, or credentials. Infrastructure may independently process operational metadata such as time, route, HTTP status, latency, IP/network data, or security signals. | No request-body, response-body, candidate-content, or dedicated application access log is emitted or stored. Infrastructure retention follows each provider's configured policy and is outside AskRigor's application storage. |
| Provider requests | Necessary query/identifier and fixed service contact values where required by a provider | Providers process their requests under their own policies; AskRigor does not persist a provider-side copy. |

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
`gpt-5-nano-2025-08-07`; the Responses API request uses `store:false` and strict
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
- GitHub receives only the approved private issue fields and anonymous
  recurrence metadata;
- ChatGPT handles the surrounding conversation and Action result under its own
  terms and settings; and
- infrastructure providers may process bounded operational metadata for
  security and service operation.

OpenAI API, GitHub, ChatGPT, infrastructure, and research-data providers govern
their own processing and retention under their respective policies. AskRigor
does not claim to control provider-side copies or deletion schedules.

## Lesson logs, retention, and deletion

The application does not emit or store request-body logs, response-body logs, candidate-content logs, or a dedicated application access log; its only log output is the startup line.
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
- Search queries, research questions, directional labels, citations, protocol text, scholarly records, trial records, YouTube videos, public YouTube author/channel IDs, display names, comments, replies, reply manifests, deterministic samples, corpus digests, continuation tokens, or completion receipts.
- Provider API keys, deployment credentials, or ChatGPT connection IDs in tracked repository files or MCP responses.
- Full article text, YouTube transcripts, private/deleted/held-for-review content, cookies, private communities, or generic scraped web pages.

The optional lesson path is the narrow exception to the research path's
no-persistence boundary. It stores only the screened private candidate and
anonymous recurrence metadata listed above; it does not create a research
history, transcript store, user profile, or automatic-learning database.

## Response minimization and security controls

- Every tool is annotated `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`; no tool changes provider, user, or server state.
- Strict Zod input/output schemas reject undeclared input fields. Pagination cursors are opaque at the MCP boundary.
- Adaptive YouTube continuations are HMAC-authenticated, expire one hour after the chain starts, and disclose neither the server secret nor comment/author content inside the token.
- Provider access failures remain explicit (`inaccessible`, `rate_limited`, `not_found`, or `error`) and never become negative evidence.
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
more detailed implementation inventory and re-review the live notice whenever
processing changes.
