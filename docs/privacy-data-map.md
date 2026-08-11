# AskRigor v0 data map and privacy review

Status at 2026-08-11: this is an implementation inventory, not a substitute for a
public privacy notice. Public listing is blocked until an accurate HTTPS privacy
policy is live at a publisher-matching URL.

## Purpose and boundary

AskRigor v0 is a stateless, read-only MCP retrieval service. It returns provider
data to the invoking MCP client and makes no user account, database, write API,
or medical conclusion. Provider content is untrusted input; it is parsed as data
and never executed as instructions.

## Data returned to the MCP client

| Category | Examples returned | Why it is returned |
| --- | --- | --- |
| User-supplied search or lookup input | query terms, date ranges, PMIDs, NCT IDs, DOI/citation strings, YouTube video IDs/URLs, opaque cursors | Reproducibility and pagination in the provenance envelope. |
| Shared provenance | provider, record type, primary/provider IDs, retrieval timestamp, source URL/title/authors or channel, pagination, access status, limitations, and structured provider error | Makes source, time, coverage, and failure boundaries auditable. |
| Scholarly metadata | PMID, title, abstract when PubMed provides it, journal, dates, authors, DOI, publication types; Europe PMC source/IDs/title/authors/journal/year; Crossref candidates and update/retraction evidence | Scholarly retrieval only; no full-text scraping or clinical interpretation. |
| Public trial metadata | NCT ID, title, status, study type/phases, conditions, interventions, sponsors, enrollment, dates, results flag, references, and last update | ClinicalTrials.gov record lookup/search. |
| Public YouTube video metadata | video ID, title, description, published time, channel title/ID, duration, privacy status, and API-visible counts where supplied | Video discovery and provenance. |
| Public YouTube comment data | comment/reply IDs, parent/top-level IDs, public YouTube author/channel IDs, optional public display names, public comment text, likes, and publication/update timestamps | Requested API-visible comment and reply retrieval with completeness accounting. |
| Completeness/accounting data | top-level/reply counts, mismatch identifiers, page counts, API-visible coverage, output/text byte counts, elapsed time, and provider request attempts | Shows whether a comment corpus is complete, partial, inaccessible, or failed. |

Public YouTube author/channel IDs, optional display names, and comment text can be
personal data even when made public by the author. A public privacy notice must
specifically disclose this processing, the API-visible-only limitation, and the
recipient/client-facing disclosure described here.

## Processing and retention

| Location | Data handled | Persistent storage in v0 |
| --- | --- | --- |
| MCP request and adapter memory | Request parameters, provider responses, normalized metadata, public YouTube identity/comment data | Used only for the active request. No database, file store, account profile, queue, or transcript store is implemented. |
| MCP response | The normalized fields in the table above | Delivered to the connected client. The client/ChatGPT may retain conversation or tool-result data under its own terms; AskRigor v0 does not control that retention. |
| Server logs | The application source emits a startup line only and does not log tool arguments, raw provider payloads, comment text, user identifiers, or credentials. Operational deployments may keep aggregate server logs (for example, request counts, HTTP status, latency, or capacity signals); they must not add raw request/response bodies or provider secrets. | No application-level request/content log is persistently stored by v0. Deployment/proxy retention must be disclosed by the eventual public notice. |
| Provider requests | Necessary query/identifier and fixed service contact values where required by a provider | Providers process their requests under their own policies; AskRigor does not persist a provider-side copy. |

## Data not persistently stored in v0

- User accounts, profiles, authentication sessions, or user-entered research history.
- Search queries, citations, protocol text, scholarly records, trial records, YouTube videos, public YouTube author/channel IDs, display names, comments, replies, or reply manifests.
- Provider API keys, deployment credentials, or ChatGPT connection IDs in tracked repository files or MCP responses.
- Full article text, YouTube transcripts, private/deleted/held-for-review content, cookies, private communities, or generic scraped web pages.

## Response minimization and security controls

- Every tool is annotated `readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`; no tool changes provider, user, or server state.
- Strict Zod input/output schemas reject undeclared input fields. Pagination cursors are opaque at the MCP boundary.
- Provider access failures remain explicit (`inaccessible`, `rate_limited`, `not_found`, or `error`) and never become negative evidence.
- The public route is fail-closed, has bounded request body/concurrency/rate limits, and does not return credentials. Source tests check that a test YouTube key never appears in results.
- Comment retrieval reports API-visible coverage only. It does not claim access to deleted, moderated, private, hidden, held-for-review, unavailable, or never-posted material.

## Required public-policy gate

Before public submission, publish a stable HTTPS privacy policy under the verified
AskRigor publisher identity. It must accurately cover the data above, including
public YouTube identity/comment processing, provider sharing, operational-log
retention, end-user/client disclosure, contact method, and applicable
rights/retention terms. Do not copy this internal map into the manifest as a
legal URL.
