# AskRigor v0 data map and privacy review

Status at 2026-09-01: this remains the detailed engineering inventory.
The live August 12, 2026 notice at release `f928b95e29cd` was the pre-lesson privacy notice.
The August 13, 2026 lesson notice is live and was reverified before the lesson Action was enabled.
The August 30 publisher-identity notice is deployed from merge
`4d4bd43303045223394480b13153e7ae3b9149bd` and states that AskRigor is a
product operated by Mayan Roots LLC. Its public privacy-notice effective date is
August 30, 2026. This identity clarification changes no processing, collection,
retention, recipient, or access boundary in this data map.

The August 31 release candidate adds an accurate public notice for the public
evidence-gap form. Active drafts/submissions currently have no automatic
expiration and remain in the private VPS database until withdrawal or operator
deletion. There is no automatic off-host backup. Withdrawal removes active
content and leaves a no-content row; PostgreSQL write-ahead/storage remnants
age out through ordinary maintenance. The participant browser stores the case
ID and recovery key in local storage; the server stores only the key hash.

The September 1 release candidate adds reciprocal connected research access.
Free use requires an explicit versioned agreement permitting eligible
deidentified structured formal-research progress to enter a private proposal
review path. Paid private use contributes nothing and activates only for an
already verified entitlement. The proposal path excludes raw chat/prompts,
identity and contact data, private health narratives, uploads, raw source and
provider bodies, credentials, and all community/YouTube content. It is not an
automatic evidence-authority path.

## Purpose and boundary

### Approved isolated living-evidence pilot

On 2026-08-29 the owner approved one isolated cumulative living-evidence pilot
and required complete storage of every study/review analysis to the extent
AskRigor actually performed it, plus future clarifying analysis as later
versions. This is a new durable **analysis** class, not a raw-source corpus.

Allowed pilot records are public formal-source identifiers and version hashes;
complete ordered AskRigor-authored analysis sections with lossless byte/hash
receipts; structured method-domain findings; claim capabilities and reasons;
evidence locators and validation receipts; uncertainty, disagreements,
limitations, unresolved fields, and future-analysis items; and append-only
clarification/correction/supersession/invalidation/freshness events.

The pilot rejects raw publication/book bodies, transcripts, descriptions,
comments/replies, creator/commenter identity, person-linked community episodes,
raw chat/prompts, private research or personal health narratives, model/provider
bodies, credentials, authorization headers, and secrets. YouTube/community
persistence is exactly zero while its compliance review remains unresolved.
Historical work for which only a durable summary survives is labeled
`partial_historical_capture`; no missing analysis is reconstructed from memory.

The owner also approved a separate durable **formal research-frontier** class
so later work can resume discovery instead of merely retrieving a prior answer.
Its allowlisted records are de-identified formal-source queries; requested and
confirmed half-open publication/index windows; provider/access/exhaustion
receipts and counts; formal bibliographic identifiers, titles, dates, and
versioned candidate decisions; and versioned unresolved, unattempted, blocked,
coverage-gap, discriminator, and delta-search trails. Every nonterminal record
names an executable next capability, while terminal blocks name a bounded
reason. Four required false markers attest that raw source content, raw provider
responses, personal data, and community data are not persisted.

This frontier cannot represent YouTube/community source classes, video/comment/
reply/channel/user/person identifiers, or common community-provider locators.
Canonical frontier rows write only through the one-shot administrator profile.
An authenticated free-contributor runtime may submit the same strict shape
only to a separate `PENDING_REVIEW` proposal table. It cannot promote or write
canonical frontier rows. Canonical PostgreSQL rows and hashes remain authoritative.
Obsidian and Mermaid renderings are deterministic derived views and cannot
establish search completion, source quality, or a health claim.

The dedicated `get_research_frontier` MCP operation adds no collection or
write-through. It returns only these existing allowlisted formal frontier
projections through the restricted SELECT-only reader for one exact frontier
UUID, question UUID, or canonical topic key. It echoes that selector, returns
`frontier_currency:not_assessed`, distinguishes `not_indexed` from external
evidence absence, and sanitizes repository/configuration failures. Optional
history is the existing append-only candidate/trail history; raw source or
provider bodies, chat/prompts, private health material, credentials, opaque
provider state, and YouTube/community data remain unrepresentable.

### Public self-serve evidence-gap intake

Migration `0008` introduces a separate private class for cases voluntarily
submitted through one public evidence-gap form. This is a self-serve product
flow, not an institutional research program or public story directory. It may
retain a random UUID and pseudonym, recovery-key SHA-256, provenance class,
AES-256-GCM narrative envelope, optional participant-reported health/timing
fields, consent choices, completeness/missingness labels, lifecycle state, and
timestamps. It collects no name, account, email address, or outbound-contact
destination in this slice.

The raw submission is never returned by the public gap metadata route and has
no public case page. A per-case recovery key permits inspection or withdrawal;
only its hash is stored. Withdrawal clears the active narrative envelope,
structured fields, consent, and review-queue membership, leaving a no-content
row. The encryption key and private review bearer key are runtime secrets, not
database fields. Structured JSON is private but not separately application-
encrypted in this MVP. Active drafts and submitted cases have no automatic
expiration. The private VPS database has no automatic off-host backup.

An authenticated internal review route may return explicitly consented cases
to AskRigor/GPT as participant-reported, unverified leads. It applies basic
email, phone, and URL pattern removal to the narrative but explicitly does not
claim full de-identification. Provenance, partial/substantial completeness,
named missing fields, and non-remission comparator status remain visible;
neither completeness nor visibility upgrades verification. The route prohibits
causal analysis in its machine response. Public deployment still requires an
accurate public notice for GPT/provider processing, active and backup
retention, key operation, and the limits of deterministic redaction.

The public AskRigor plugin requires connected-account OAuth for ordinary
research. Before use, the person must explicitly activate free contributor
mode or an already entitled paid private mode. Authentication does not itself
grant canonical repository write authority: free mode may submit only strict
deidentified proposals, while paid private mode submits none. Cross-user
retrieval is a separate boundary.
The `review_evidence_gap_submissions` MCP operation requires a validated OAuth
JWT with the exact `cases:review` scope. The resource server validates
signature, issuer, audience, expiry, client identity, and scopes before
attaching identity to the MCP request. Its OAuth challenge and protected-
resource metadata contain only endpoint and scope metadata. The tool receives
the already bounded review projection; it does not receive recovery keys,
encryption material, contact destinations, raw database envelopes, or OAuth
tokens in its result. Auth0 is the approved external identity provider. It
processes connected-account identity, login/consent, and related security
metadata; public evidence-gap participants do not authenticate with Auth0, and
AskRigor sends it no participant case or proposal content. API RBAC restricts
`cases:review` to the owner role; the exact owner subject is checked again by
AskRigor and is not a global research-user allowlist.

The local and conditionally authorized Railway pilot boundaries are defined by
`docs/living-evidence-source-storage-policy.md` and
`docs/living-evidence-repository-threat-model.md`. Railway must be isolated,
private-only, limited to $5/month, 0.5 vCPU, 512 MiB memory, and 1 GiB volume,
and retained for at most 30 days without a new owner extension or production
promotion. Current Railway controls cannot enforce that exact $5/1-GiB
boundary, so no Railway resource has been provisioned and relaxing it requires
a new owner decision. No automated pilot snapshot is approved. Logical exports
inherit the same classification and deadline. Production ingestion, user/private
analysis persistence, raw-source storage, multi-user access, and long-term
backup remain separately gated.

### Isolated synthetic Community Forum laboratory

The Community Forum implementation branch adds a third, strictly synthetic
development class. A pinned Discourse development runtime binds only to
`127.0.0.1`, uses a disposable local volume, disables outbound email and
search indexing, and accepts only synthetic accounts and synthetic health
discussions. It is not a public forum, real-user pilot, or production data
store.

The AskRigor fixture repository may store synthetic account IDs, a SHA-256 of a
synthetic `.invalid` email address, pseudonymous synthetic display names,
signed event metadata, topic/post IDs, content hashes, source versions,
structured synthetic leads, consent/privacy/safety fixture states, and an
allowlisted synthetic public projection. It does not store an email value, raw
forum body, private subject reference, direct subject quotation, document, or
media body. Failed webhook payloads retain only a bounded error code, event ID
when syntactically valid, and raw-body SHA-256. Validation failures map to a
fixed code rather than storing exception text derived from the rejected body.

Migration `0004` extends only this synthetic class. It stores append-only
composer draft versions (entry point, explicit post-conversion state,
structured synthetic fields, declared unknowns/missingness, granular
permission state, and a reporter-reviewed public paraphrase/provenance label),
synthetic frontier snapshots, capability-specific queue items, explicit active
role assignments, and append-only operational actions. Frontier snapshots
retain direction, evidence-state, version/correction/challenge/withdrawal,
duplicate-aware independence, denominator-boundary, and discussion-activity
fields; discussion activity is explicitly incapable of changing evidence
state. Operational actions retain only hashes of source meaning and must keep
the before/after hash equal. These fixtures add no raw post body, private
quotation, document/media body, real identity, or real health report.

Migration `0005` remains inside the same synthetic class. It adds content-free
integrity signals, exact queue references, moderation/scientific disagreement
links, publication-lifecycle events, exact cluster-version dependencies for
research questions, evidence-check links for nonrecruiting proposals, and
withdrawal-propagation receipts. Integrity and lifecycle rows carry immutable
before/after evidence fields; engagement cannot affect evidence state.
Withdrawal receipts retain only typed identifiers, version/disposition state,
review-required dependency markers, and hashes. They require the exact lab
projection to be absent and `publicContentRetained=false` while preserving
append-only provenance. No forum text, instruction text, identity, health
narrative, quotation, document, media, or provider body is added.

Migration `0006` adds only synthetic closed-loop governance metadata:
append-only moderation appeals/reversals, exact cluster-version formal-
evidence updates, exact question-version transitions, proposal-feasibility
assessments, and result-propagation target references. It may retain typed IDs,
versions, state enums, hashes, synthetic popularity counts, and content-free
target arrays. It stores no appeal narrative, forum/report/result body, real
identity, real health fact, quotation, document/media, provider response, or
contact data. Originating reports and source meaning cannot be erased or
rewritten; launch, recruitment, causal claims, and effectiveness percentages
remain false.

Migration `0007` adds only synthetic, content-free privacy/provenance decision
metadata: before/after reidentification risk flags and generalization state;
lead-bound adult/minor/unknown status plus guardian and legal/privacy review
state; synthetic `.invalid` external-source URL, visibility, provider-terms,
attribution, quotation, privacy, and deletion state; deleted-source event,
version, consent/policy, no-body and retained-provenance state; and a paid-
private-intake boundary. It stores no external-source body, intake body, real
URL, real identity, health narrative, quotation, document/media, contact data,
or provider response. External/deleted/private sources fail closed, minor or
unknown-age fixtures cannot use ordinary projection, and paid private intake
creates neither a forum record nor a public projection.

The two publication objects remain distinct. `PUBLIC_NARRATIVE` requires
subject exact-version approval. A deidentified `PUBLIC_RESEARCH_LEAD` may model
a reporter-consented secondhand report without subject exact-version approval
only after the synthetic privacy, abuse, and jurisdiction gates pass and the
projection contains no reasonably identifying subject, direct private subject
quotation, document, or media. Lab visibility cannot upgrade verification,
evidence capability, completeness, or formal-evidence relationship. The branch
activates no public DNS, indexing, recruitment, real lead publication,
regulatory report, provider account, or deployment.

AskRigor has deliberately separate processing paths:

- **Connected research-access path:** Auth0 validates the connected account.
  AskRigor HMACs its stable subject with a server-held key and stores only that
  derived account key, access mode, versioned agreement/status, and timestamps.
  Free contributor mode can submit only an existing strict formal-frontier or
  source-analysis payload plus exact privacy false markers to a private pending
  proposal table. Paid private mode cannot submit a proposal. Revocation blocks
  later calls and withdraws pending proposals; accepted canonical history is a
  separate reviewed boundary.

- **Controlled Custom GPT research path:** four authenticated Actions start,
  continue, inspect technical status, and finalize one server-owned research
  session. Start contains a screened de-identified population-level target and
  diagnosis-status enum. Continue contains the opaque session ID, exact state
  digest, and at most one signed paging cursor or receipt-bound semantic result.
  Low-level retrieval and automatic Gemini scouting run inside the server. An
  exact bounded semantic package is returned in signed sequential chunks; only
  server finalization returns a reader report. Caller completion assertions,
  operation counts/lists, and manually pasted Gemini packets cannot advance it.

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
  scout instructions to the fixed Gemini model with Google Search. The
  low-level technical route uses `store:false`; controlled research uses
  `background:true` and `store:true`, retains only an opaque bounded job
  checkpoint, and requests provider deletion immediately after consuming the
  completed interaction. Gemini returns a compact fixed-column packet that the server
  reconstructs and checks against the strict canonical candidate contract. If
  that check fails, the server may make exactly one no-search correction
  request to the same model containing only the public
  candidate output, exact executed public searches, and bounded non-sensitive
  validation issues; it then validates again and fails closed. The server
  independently validates each public YouTube identity. It retrieves no comments or transcripts, makes no
  medical conclusion, and creates no content-bearing provider-output store.
  The encrypted research checkpoint may temporarily retain the opaque Gemini
  interaction ID, phase, public search receipts, usage counters, and poll count;
  it never retains Gemini output. The
  older operator-supplied validator remains only for backward-compatible
  technical inspection of historical packets; ordinary research does not
  require a person to transfer a packet.
- **Server-owned research-session controller:** the controller binds one
  research target to exact protocol identities, public
  candidate metadata, bounded semantic screening decisions, and per-video
  transcript/discussion coverage receipts. Phase D3 also binds material
  program-derived formal-search receipts, public source identities and access
  attempts, opaque open-full-text handles and content hashes, method-audit
  receipt projections, compact external-evidence hashes/directives, linked
  public source identities, and claim-capability state. Selected-video state may retain
  short opaque Action handles, attempts, public video/channel identity,
  access/completion status, caption-track/timestamp facts, cumulative counts,
  and corpus hashes. Phase E additionally retains exact hashes identifying the
  selected community/formal evidence frontier, bounded per-source semantic
  dispositions and rationales, transfer/disagreement categories, normalized
  program/outcome/query fields, query-limited return-search hashes/counts and
  terminal/retryable status, treatment-lock assessor receipts, and a compact
  final-audit checklist/digest. It does not retain the returned comment bodies
  from a formal-to-community discriminator search. It never stores transcript segments, comment text,
  commenter identities, publication blocks/full text, raw provider bodies,
  credentials, or protocol text. A bounded query-limited return search may
  retain only its opaque provider continuation in the same ephemeral session
  state until that exact search completes; it is never exported as evidence or
  written durably. The controller is projected through four authenticated
  Custom GPT Actions; its low-level provider operations remain absent from that
  Action inventory and the MCP inventory is unchanged.
  Phase F can issue a compact, short-lived HMAC-SHA256 finalization permit only
  from authoritative controller state. The permit contains an opaque execution
  ID, exact protocol identities, state/authorization/limitation digests,
  boundary/artifact type, issue/expiry time, key ID, payload hash, and
  signature. It contains no research target, diagnosis, health details,
  transcript/comment text, publication text, raw provider response, credential,
  or signing secret. The finalization response carries separately derived
  plain-language permitted scope and limitations; their exact set is bound by
  the permit digest. Same-session replay is accepted only for the unchanged
  state before expiry. Cross-session, changed-state, changed-protocol, expired,
  malformed, or tampered permits fail. Neither permits nor finalization
  responses are durably stored in Phase F.
- **Disabled private orchestration path:** Phase H adds five authenticated
  server routes under `/internal/research/v1/` for start, resume, minimized
  status/next-work, exact semantic submission, and finalize. The namespace is
  disabled unless its separate switch and at-least-32-byte Bearer secret are
  both present. It rejects every browser Origin and emits no CORS permission.
  Requests are JSON-only and bounded to 256 KiB; responses are bounded to 512
  KiB; a separate 30/minute token bucket and four-request concurrency limit
  apply. Start accepts only a deterministically screened de-identified
  population-level target. Ordinary responses expose only an opaque session
  ID, controller-state digest, authoritative status/boundary, next capability,
  safe boundary codes/counts, and at most one source-bounded semantic work
  package. They do not expose the raw target, diagnosis narrative, source text,
  provider body, transcript/comment corpus, or credential. The application
  emits no private request/response body log. The path reuses the same
  controller and, when the complete Phase G configuration exists, the approved
  encrypted local checkpoint store. It is absent from public MCP/Actions and is
  not activated in Phase H.
- **Disabled Hermes worker pilot:** Phase I adds an AskRigor-owned parent loop
  around the private orchestration path and a one-shot official Hermes semantic
  worker. The parent alone holds the private orchestration credential. The
  child receives one exact package, a transient de-identified target only when
  module routing needs it, public candidate identity/annotation fields, and a
  dedicated model credential. It receives no raw chat, personal medical record,
  comment/transcript/full-text corpus, checkpoint key, research-provider
  credential, repository tool, or finalization authority. Hermes memory,
  context-file loading, trajectories, checkpoints, background review, and
  toolsets are disabled; its temporary directory is removed after the turn.
  The model provider may process the transient package under its own terms.
  Phase I does not activate or deploy the worker.
- **Disabled n8n control-plane pilot:** Phase J adds a second authenticated
  private adapter and an ephemeral AskRigor-side control store. After
  initialization n8n receives only an opaque control-plane execution ID and a
  safe server directive, optional retry delay/reason, timestamps, and—only for
  an authorized terminal result—the exact output boundary and permit payload
  hash. n8n never receives the AskRigor session ID, research target, diagnosis,
  semantic work package, transcript/comment/full-text data, raw provider
  output, final report, private-orchestration key, signing key, model/provider
  key, or checkpoint key. The pinned disposable runtime disables execution
  saving for success, error, progress, and manual runs. Phase J adds no durable
  database, backup, paid service, external notification recipient, public
  webhook, production deployment, or new retention.
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
  Phase F additionally projects bounded provider outcome/access status plus the
  exact provider-attempt hash, publication-integrity state plus event-kind/hash,
  and server-derived claim-local limitation text/hash into the ephemeral
  research session. These projections support honest final limitations without
  retaining raw provider bodies. Provider no-match remains explicitly limited
  to that provider; an unconfigured provider remains an explicit gap; an active
  retraction/withdrawal excludes ordinary effect claims.
- **Disabled optional-provider adapter boundary:** Phase D5 adds strict
  server-side normalization for authorized PubPeer post-publication records and
  Epistemonikos review ancestry. No live transport, key/token, endpoint,
  provider hostname, account, deployment setting, or new provider disclosure is
  introduced. Synthetic fixtures cover bounded message text/links,
  visible/edited/deleted state, review bibliographic identities,
  classifications, counts, cursors, and failures. If a later reviewed server
  transport is activated, only one public DOI and the minimum authorized
  provider request may be sent; that activation must update this data map and
  current terms, secrets, retention, logging, and live-smoke evidence first.
- **Approved Retraction Watch snapshot path:** Phase G authorizes the fixed
  public Crossref Retraction Watch CSV to be refreshed daily by a host-scheduled
  isolated container, outside user requests, and transformed into an immutable
  local manifest, normalized public integrity records, and DOI/PMID indexes.
  No user prompt, health detail, research query, credential, provider body,
  article text, or session identifier enters those files. Only the active and
  previous verified generations are retained without backup. The application
  receives a separate read-only mount; a pre-activation sync failure preserves
  the prior pointer and a source check older than 72 hours is partial/stale.

The lesson path is deployed from exact code revision
`1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a` and passed its bounded synthetic
submission, append-only duplicate, failure-isolation, and rollback acceptance.

The controlled research Action bridge is gated by the exact literal
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true`, separately from the deployed lesson
switch. Its local candidate limits are **60,000 serialized UTF-8 bytes** per
response and **48,000 UTF-8 bytes** of exact protocol text per ordered chunk.
Controlled research Actions and MCP use the existing shared per-client rate
limit and concurrency pool. Controlled Actions additionally require the Bearer
key; they are not anonymous public reads.
The bridge is live; its exact deployment and acceptance identities are recorded
separately in `docs/custom-gpt-action-live-acceptance.md` and
`docs/release-evidence-v0.1.0.md`.

## Data returned to the MCP or Custom GPT Action client

| Category | Examples returned | Why it is returned |
| --- | --- | --- |
| User-supplied search or lookup input | query terms, date ranges, PMIDs, NCT IDs, DOI/citation strings, YouTube video IDs/URLs, opaque cursors | Reproducibility and pagination in the provenance envelope. |
| Stored formal research-frontier lookup | One exact frontier UUID, question UUID, or canonical topic key; optional history flag; de-identified formal discovery passes and requested/confirmed windows; formal candidate identifiers/titles/decisions; unresolved or blocked trails; next capabilities; terminal reasons; receipt/canonical hashes | Lets a later run resume prior formal research-control state and pursue current delta work. The output is not evidence or a conclusion, does not assess currentness, and performs no write. |
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
| Automated Gemini candidate scout and validation | screened de-identified population-level research target; diagnosis-status enum; checked-in scout instructions; aggregate token/Search usage; receipt-reconciled executed searches; public video IDs/URLs/titles/channels; provisional program/stage/outcome summaries; bounded safe validation issues when one correction is needed; independent public YouTube identity metadata; and a SHA-256 frontier partitioning validated, terminally rejected, and unresolved IDs | Finds a broad public candidate frontier without manual transfer. The low-level technical route uses a storage-disabled request. Controlled research uses a temporarily stored background Interaction, retains only its opaque bounded checkpoint, and requests deletion immediately after consuming it. If needed, one similarly temporary no-search correction returns only Gemini's public candidate output, exact public search receipts, and safe validation issues to the same provider and is deleted after consumption. YouTube receives only candidate video IDs. Provisional summaries remain discovery annotations, not transcript verification or treatment evidence. No comments, transcripts, or Gemini output are persisted by AskRigor. A deletion request is not a claim about provider backups or policy-required retention. |
| Legacy Gemini packet validation | operator-supplied de-identified research target, executed searches, public video identity fields, and provisional annotations | Preserves backward-compatible technical validation of historical packets. It is not the ordinary automated research path and creates no additional store. |
| Completeness/accounting data | top-level/reply counts, mismatch identifiers, page counts, API-visible coverage, output/text byte counts, elapsed time, and provider request attempts | Shows whether a comment corpus is complete, partial, inaccessible, or failed. |

The source-generated full MCP `tools/list` inventory, including every advertised
input and output schema (and therefore every returned nested category), is
committed as `docs/tool-inventory-v0.1.0.json` and regenerated by running
`npx tsx scripts/generate-tool-inventory.mts --write`. Its exact JSON output is
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
| MCP or Custom GPT research Action request and adapter memory | Request parameters, provider responses, normalized metadata, public open-publication content and audit fields, public YouTube identity/comment/caption data, screened Gemini scout target and provisional candidate annotations, treatment-landscape coverage fields, and the current bounded segment used to update a deterministic sample and rolling corpus digest | Used for the active request only except for the exact Action handle/checkpoint rows below. No database, account profile, queue, durable full-text store, transcript-text store, candidate-packet store, treatment-landscape store, or server-side comment corpus is implemented. The low-level Gemini route sets `store:false`. Controlled Gemini scouting retains only the opaque background-job checkpoint in the encrypted research session until completion/boundary and requests provider deletion after use. Transcript continuations re-fetch the selected track; only compact chain metadata is retained under the bounded row below. The coverage assessor makes no provider call. The Phase D1 Crossref/FORRT primitives are not reachable through these public transports. |
| Internal Phase D1 external-evidence adapter invocation | One public DOI; normalized Crossref publication events or FORRT replication/reproduction relationships; provider response hashes, access/error state, limitations, and FLoRA attribution | Transient process memory only. No public route, research-session connection, database, cache, response artifact, or durable provider-content store is added in Phase D1. Fixtures are synthetic. |
| Internal Phase D5 optional-provider adapter invocation | A strict synthetic or future server-authorized record for one public DOI; bounded PubPeer message/thread state or Epistemonikos review-ancestry metadata; content/item hashes, status, pagination, classification provenance, directives, and limitations | Phase D5 has no live transport or new provider request. When a server executor is supplied in tests, the existing bounded in-memory artifact store and signed receipt are used; the research-session projection keeps hashes/status/work rather than message bodies. No durable store, token, public operation, or deployment activation is added. |
| MCP client-carried continuation state | The minimized, opaque authenticated continuation state described above | Returned to the invoking MCP client and processed transiently if resubmitted within one hour. The server keeps no matching MCP session record. |
| Custom GPT Action continuation handle map | A short random handle mapped to the existing signed minimized token; no comment/reply text, author identity, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 16 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires an approved sticky-routing or shared-state design. |
| Custom GPT transcript Action continuation handle map | A short random handle mapped to compact transcript chain metadata: provider cursor, public video ID, selected-track metadata, caption-snapshot hash, page size/count, cumulative segment count, next expected index, and timestamp-presence state; no caption text, title, channel name, request text, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 4 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires approved sticky routing or shared state. |
| Open-full-text Action handle map | A short random handle mapped to one exact identity-verified public document index plus the next block/character cursor, segment counts, public source metadata, manuscript version, and document/block hashes | Process memory only on the single application replica, no longer than one hour, at most 64 handles and 128 MiB total. The map may contain extracted public publication text but no private copy, provider credential, or user health record. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; horizontal scaling requires approved sticky routing or shared state. |
| MCP or Custom GPT research Action response | The normalized fields in the table above. Action protocol and open-full-text reads use exact ordered chunks; transcript pages contain bounded timestamped caption segments; oversized per-video community samples may be deterministically transport-bounded without changing retrieval counts, digest, access state, or receipt. | Delivered to the connected client. The client/ChatGPT may retain conversation or tool-result data under its own terms; AskRigor v0 does not control that retention. |
| Server logs | In routine operation the application emits a startup line only. A disabled-by-default MCP connector diagnostic can be enabled temporarily by a maintainer. It emits only a fixed route class, HTTP method class, coarse header/media-presence classes, selected JSON-RPC phase class, completion class, and response status. It never emits a URL or query, IP/network address, user-agent, header value, request or response body, JSON-RPC ID, tool name or argument, prompt, provider payload, comment text, user identifier, or credential. Infrastructure may independently process operational metadata such as time, route, HTTP status, latency, IP/network data, or security signals. | No request-body, response-body, candidate-content, or dedicated application access log is emitted or stored. The temporary connector diagnostic is restricted to a troubleshooting window and must be disabled by recreating the diagnostic container after the needed receipt is captured; its active container log is not a durable research-session store. Infrastructure retention and backups follow each provider's configured policy and are outside AskRigor's application storage. |
| Provider requests | Necessary query/identifier and fixed service contact values where required by a provider, including the service contact email sent to Unpaywall; the screened population-level target plus public scout instructions sent to Gemini; and, only after a malformed scout packet, one bounded correction containing Gemini's own public candidate output, exact executed public queries, and safe validation issues. If the internal Phase D1 adapters are invoked by later controller work, Crossref receives the public DOI and configured service contact, while FORRT receives only the public DOI and fixed headers. | Europe PMC, Unpaywall, public copy hosts, Crossref, FORRT, Google Gemini, Google Search, and YouTube process requests under their own policies. The low-level Gemini route uses `store:false`; the controlled path uses `background:true`/`store:true` and requests deletion immediately after consumption. Only the first interaction can use Google Search. Provider keys and contacts remain server-only. AskRigor does not claim to control provider processing, backups, or policy-required retention. Phase D1 itself does not expose or deploy the new internal adapters. |
| Aggregate AI budget ledger | UTC month, fixed $50 monthly limit, aggregate charged nano-USD, update time, and schema version shared by lesson privacy and Gemini scouting | Owner-only mode-0600 file. It contains no target, prompt, candidate, request, response, identity, or credential. Each Gemini scout reserves at most $1 before provider execution. A background scout charges that maximum at job start; later polls do not reserve or charge again. |
| Optional local legacy Gemini-candidate validator | Operator-supplied de-identified research target, executed search queries, public video IDs/URLs/titles/channels, provisional creator-claim annotations, and independently retrieved bounded public video metadata | The operator controls the historical input file and standard output. AskRigor creates no additional file, database row, log, account record, comment corpus, or transcript store. YouTube processes the video-ID lookups under its own policy. |
| Phase G/K2 research-session controller checkpoint | Opaque execution ID; sensitive research target and diagnosis-status enum; exact protocol identities; module/operation/controller state; public candidate/video/channel/source metadata; bounded semantic screening/program/audit/transfer/treatment annotations; source-linked de-identified creator/community findings; exact study/review method findings and claim capabilities; the bounded reader report and its digest; compact coverage receipts, source identities, hashes, directives, limitations, unresolved state, and final-audit basis. While Gemini background scouting is unfinished it may also contain one opaque interaction ID, phase, poll count, bounded public executed-query receipts, aggregate usage counters, and conservative charged amount. It excludes raw chat, transcript/comment/return-search text, commenter identity, article blocks/full text, raw provider bodies, Gemini responses, credentials, keys, cookies, and private sources. | With reviewed checkpoint configuration, one AES-256-GCM authenticated envelope is written per session to a mode-`0700` directory with mode-`0600` files; development without it uses the bounded in-memory adapter. Retention is 72 hours idle and seven days absolute, at most 1,024 sessions, 16 MiB plaintext and 24 MiB stored. It has no backup, rejects capacity rather than evicting unexpired sessions, prunes expiry, supports internal deletion, and is single-writer/single-host only. The background checkpoint is removed when scouting completes or reaches a recognized boundary; each consumed provider interaction receives a deletion request. The report remains below the Action response budget. K2 changes only the authenticated Custom GPT Action projection; MCP remains unchanged. |
| Phase K2 signed worker-payload chain | Exact bounded semantic-work descriptor, minimum task evidence, response schema, de-identified target, opaque session/state/work/payload digests, signed cursor, and terminal receipt | Returned transiently to the invoking Custom GPT in UTF-8-safe chunks no larger than 40,000 bytes. Cursors and receipts expire after one hour and use domain-separated HMAC. Raw evidence is not written into the checkpoint or server logs. ChatGPT may retain tool results under its own terms. |
| Phase K2 product-acceptance receipt | Fixed synthetic challenge ID, opaque session ID, exact installation-bundle and protocol digests, ordered capability/result and before/after state digests, final boundary, permit/report digests, issue/expiry times, key ID, payload hash, and signature | Issued only after authorized or bounded finalization of the fixed challenge and expires after one hour. It contains no prompt, health detail, source text, provider body, credential, or private content and replaces caller-authored acceptance counts/prose. |
| Phase H private orchestration request/result | Start may contain one screened de-identified target and diagnosis-status enum. Resume/status/finalize contain only an opaque session ID. Semantic submission contains that ID, exact state/package digest, and one bounded routing or candidate-screening assessment. Results contain minimized controller status, boundary, next capability, safe boundary codes/counts, and at most one bounded work package or compact finalization result. | The HTTP transport itself writes no body log or separate store. When enabled later, controller state follows the Phase G encrypted checkpoint rules above; raw provider/source material remains ephemeral. Authentication uses a distinct server-held secret. Browser Origin requests are refused, responses are non-cacheable, and neither secret nor raw research/source content is sent to an external orchestrator merely for convenience. Phase H adds no live external recipient or deployment. |
| Disabled Phase I/K1 Hermes semantic worker | One opaque session ID and state digest; the exact current state-only work descriptor; for the active bounded semantic task only, the minimum exact public evidence context required to inspect it (timestamped transcript segments, comment text with author identity removed, exact public article blocks, bounded external-audit records, or bounded current report evidence); for new-session module routing, the same deterministically screened de-identified population-level target accepted by the private start route; one dedicated model credential; provider/model and non-authoritative API-call/cost diagnostics | One fresh child process and temporary directory per work package. Hermes tools, memory, context files, trajectories, checkpoints, and background review are disabled. Evidence context is transient, never returned by private status, and never written to the checkpoint as raw source text. The temporary directory is removed after the turn; AskRigor writes no Hermes conversation or model output to a new store. The external model provider may process the transient public/de-identified package under its own terms. The child never receives commenter names/channel IDs, the private orchestration credential, production research-provider secrets, raw private health content, credentials, or a finalization permit. Phase K1 adds no deployment or live recipient. |
| Phase K1 process-local evidence-material cache | Exact timestamped public transcript segments and the bounded public discussion analysis sample for selected videos, indexed by opaque session/video identity and exact receipt hashes; commenter names and channel IDs are discarded on ingestion | Process memory only, default maximum 100 session/video entries and 64 MiB aggregate. Least-recently-used entries may be evicted because their loss reopens exact reacquisition rather than advancing state. The cache is never checkpointed, logged, returned by private status, or included in the reader report. Stored community findings reject direct identifiers and substantial verbatim source copying. A miss may trigger exact source reacquisition; mismatched replay receipts revoke the session cache and fail closed. Process loss discards the cache. |
| Disabled Phase J n8n control plane | AskRigor-side ephemeral state: opaque n8n execution ID, opaque AskRigor session ID, current digest/directive, bounded retry/no-progress counters, safe timestamps/reason codes, and after authorization only the output boundary and permit payload hash. n8n receives only the opaque n8n execution ID and safe projection; it does not receive the inner session ID or research content. | Process-memory AskRigor store only. The disposable pinned n8n runtime disables saving successful, failed, progress, and manual execution data and deletes its temporary database after validation. No durable database, backup, external notifier, production service, or new retention is approved. |
| Non-production external-evidence artifact store | Strict normalized Crossref/FORRT envelopes and, only when a server executor is supplied, Retraction Watch/PubPeer/Epistemonikos envelopes for one public DOI; content-derived artifact ID; provider/source identity; media type; byte count; content and descriptor hashes | Phase G deliberately keeps this store in process memory only, with default bounds of 128 entries, 10 MiB per artifact, and 32 MiB total. Bytes are cloned, exact artifacts deduplicated, and entries explicitly revocable; process loss discards them. There is no disk, database, object store, backup, production singleton, or public route. An interrupted audit reruns rather than retaining raw artifacts. |
| Retraction Watch public snapshot mirror | Fixed official source commit/path/file hash; normalized public publication-integrity fields; DOI/PMID indexes; manifest/file hashes; source-check and activation timestamps; current/previous pointer | Separate mode-`0700` host directory. A fixed daily one-shot container writes the mirror without receiving AskRigor runtime secrets; the application mount is read-only. Only active and previous verified generations are retained; abandoned staging and older generations are removed after verified activation. No backup. A pre-activation sync failure preserves the prior active pointer; post-activation cleanup failure remains visible and may temporarily leave an extra immutable generation. Older than 72 hours is stale/partial. The source-only implementation and deployment template are approved in Phase G, with final live activation evidence deferred to the release phase. |
| Curated production living-evidence study audit | Exact public DOI/PMID/PMCID identifiers and source-version hash; source locator/access state; complete AskRigor-authored validated 13-domain study-method audit and claim-capability findings; unresolved/future-analysis items; canonical protocol, freshness, impact, and validator receipts | A one-shot administrator process receives the exact public document index transiently over bounded stdin and writes only the source-free strict contribution to a private PostgreSQL service on the AskRigor VPS. The public MCP canonical-lookup component uses a SELECT-only role, performs one 1.5-second lookup at acquisition and one at requested reuse, and writes no public-user request, chat, tool call, health narrative, article block, provider body, transcript, comment, reply, or identity to canonical tables. No database port is published and no automatic off-host backup is added in this phase. |
| Curated formal research frontier | Exact current protocol manifests; de-identified formal-source query/hash; provider and formal source class; requested and confirmed half-open publication/index windows; access/exhaustion/count receipt; public formal identifiers/title/date; append-only candidate decision/reason; unresolved, blocked, coverage-gap, discriminator, and delta trails with next capability or terminal reason. Read-only catalog search accepts transient free text and returns only stored topic/question metadata, exact selectors, lexical match fields, and descriptive coverage counts. | One strict writer-only `import-frontier` transaction in the same private PostgreSQL service. The contribution requires explicit false raw-source/raw-provider/personal/community persistence markers. Source/provider/candidate/trail scope and lineage are database-checked; update/delete fails. The canonical lookup role remains SELECT-only; catalog lookup runs in a read-only transaction. The distinct proposal role can insert only pending strict proposals, not canonical rows. YouTube/community classes and locators are rejected. Deterministic Obsidian/Mermaid exports are derived, non-authoritative views. |
| Connected research-use account and pending contribution proposal | HMAC-SHA-256 account key; active/revoked state; free-contributor or paid-private mode; exact notice/agreement fields and timestamps; verified-entitlement status; strict deidentified formal-frontier or source-analysis proposal, proposal hash/kind/partial state, eight privacy false markers, and review timestamps/reason | A distinct least-privilege PostgreSQL role can select/insert/update access accounts, read entitlements, select/insert proposals, and execute one security-definer function that changes only pending proposals for a supplied HMAC account key to `WITHDRAWN`. It cannot grant entitlements, change proposal review dispositions, or write canonical evidence/frontier tables. The service, not the client, derives the key from the authenticated OAuth subject. Proposal payloads exclude raw chat/prompts, identity/contact data, private health narratives, uploads, raw source/provider bodies, credentials, and community/YouTube data. Pending rows have no automatic expiry in this slice and no automatic off-host backup. |
| Owner-accepted contribution promotion | Proposal UUID, strict kind and SHA-256; explicit owner decision/reason and timestamps; pending/claimed/completed/failed promotion state; bounded attempt metadata; canonical identifiers; stable receipt and receipt SHA-256 | The public runtime cannot write this state or canonical evidence. One function-only owner-review call atomically creates the exact intent only on acceptance. A separate root-scheduled short-lived admin container receives only the existing canonical writer environment and processes one accepted intent per activation. The static unit accepts no user input and logs only the bounded operation receipt; it receives no raw chat, account key, private health narrative, upload, raw source/provider content, or community data. Disabling the timer preserves all rows. |

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
  validation issues to the same model. The low-level technical route uses
  `store:false`. The controlled route runs each interaction in the background
  with temporary provider storage, retains only the opaque checkpoint, and
  requests deletion immediately after consuming it;
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

## Research data not persistently stored

- Raw OAuth subjects, account email/contact fields, access tokens, passwords,
  authentication sessions, raw chat/prompts, or unrestricted user-entered
  research history. The narrowly disclosed HMAC research-use account and strict
  pending-proposal records are the exception.
- Raw search-result bodies, captions, transcripts, comments, replies, commenter
  identities/display names, return-search result text, full article blocks/text,
  unrestricted provider bodies, Gemini prompts/responses, or provider
  interaction IDs. The encrypted Phase G checkpoint can retain the minimum
  bounded controller fields, public source identities, semantic annotations,
  receipts, and hashes enumerated above, but never these raw bodies. The D2
  artifact store remains process-memory only. The separate Retraction Watch
  mirror contains only the public provider dataset's minimized integrity fields
  and verification metadata, never user/session content.
- Provider API keys, deployment credentials, or ChatGPT connection IDs in tracked repository files or MCP responses.
- Full article text, server-side transcript copies, private/deleted/held-for-review content, cookies, private communities, or generic scraped web pages.

The optional lesson path is one narrow durable-storage exception. It stores
only the screened private candidate and anonymous recurrence metadata listed
above; it does not create a transcript store or user profile. The independently
disclosed living-evidence, frontier, participant-intake, research-access, and
pending-proposal stores have their own strict contracts and authority boundaries.

## Response minimization and security controls

- Of 26 MCP operations, 24 are annotated `readOnlyHint: true`. The two explicit
  research-access/proposal operations are declared writes with
  `destructiveHint: false` and `openWorldHint: false`. They require authenticated
  `research:use`; all ordinary research operations also require that scope and
  an active free-contributor or paid-private mode. The Action-only transcript,
  treatment-landscape, automated Gemini-candidate, and legacy validation routes
  remain read-only; legacy research Actions are omitted whenever OAuth research
  access is active so they cannot bypass the mode choice.
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
- The automated Gemini route rejects first-person or identifier-bearing targets before credentials, budget, or provider access; uses a fixed model, a compact fixed-column provider shape, unchanged strict canonical validation, reconciled Search-call receipts, at most one no-search correction, one $1-per-scout reservation, and the shared $50 monthly aggregate limit; and never returns the provider key, invalid raw output, thought content, or search-result HTML. The low-level technical route remains a bounded 45-second `store:false` request. Controlled research instead uses resumable background interactions with 20-second start/poll/delete request bounds and at most 120 provider polls, keeps only an opaque encrypted checkpoint, and requests deletion after consumption.
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
