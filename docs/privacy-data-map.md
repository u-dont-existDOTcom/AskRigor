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

Since 2026-10-01 (opened at 20:19 UTC; `docs/audits/2026-10-01-pr246-production-release.md`), a findings library serves
free contributor mode (owner decisions Q9 to Q11): when `finalize_research`
checks a free contributor's answer, the server saves that answer's checked
findings card to a private GitHub review queue; a paid-private answer offers the
save, and its card is saved only after the user says yes to that save. It moves
the free contributor notice to a second version that says so. A card whose
findings the AI declares personal only is neither saved nor offered (owner
answer 156a, 2026-10-22). The notice's fourth version (owner answer 171,
2026-10-25; approved, built, not yet released) says free cards publish on save,
written without the person, with the unreviewed label, votes and comments;
deleting a card removes it from the Atlas unless its findings were accepted.
An accepted finding stays while it is valid. The public pages distinguish
free cards from paid private findings, which still publish only after
acceptance; the paid save offer keeps its acceptance sentence. See "Findings
library" below. Publication, votes and comments storage is a separate build
slice of decision 171; these notice changes do not implement that storage.
The owner approved the public wording on
2026-09-30; `https://askrigor.com/privacy` and `/terms` take it, with that day's
effective date, when the library goes live, and the library stays closed until
then.

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
  obtains separate consent, the consequential Custom GPT Action or the
  connector's `submit_lesson_candidate` tool (owner decision, 2026-09-30; behind
  the research-access guard) accepts a derived candidate. Both use one service:
  a deterministic screen and local schema check (production makes no model or
  API call on this path; see `apps/research-mcp/src/lessons/runtime.ts`), shared
  rate limits, and a private GitHub review candidate plus anonymous occurrence
  metadata. The connector tool takes no incident provenance; raw incident
  capture stays with the private incident Action. A connector lesson includes a
  detailed report of the failure only when the account turned on detailed
  lesson reports (owner question 154; see "Optional lesson request and result
  contract" below). Neither can change code,
  protocols, instructions, providers, or releases. The fixed OpenAI privacy check
  described below is legacy configuration that the production lesson path does
  not call.
- **Findings library path:** for a free contributor account,
  `finalize_research` (behind the research-access guard; live since 2026-10-01) needs a
  findings card with the answer, checks it, and saves the checked card and a
  server-written version stamp in a private GitHub review queue; the answer is
  never stored, and nothing asks the user. For a paid-private account the
  answer offers the save, and the connector's `save_research_findings` saves
  the checked card only after the user says yes to that save. A card whose
  findings the AI declares personal only is neither saved nor offered (owner
  answer 156a). Under notice v4 (owner answer 171; built, not yet released),
  free cards publish on save, written without the person and marked "Not checked
  by supervisors yet" until review; signed-in people can vote and comment. Paid
  private findings still publish only after acceptance. See "Findings library"
  below and the separate publications build in the decision 171 plan.
- **Automated Gemini-candidate path:** a public read-only Action and the
  `scout_gemini_youtube_candidates` MCP tool (behind the research-access guard)
  share one implementation and accept only a
  de-identified population-level research target, a diagnosis-status enum and,
  optionally, the person's language as a BCP 47 tag (`language`).
  Every route that reaches Gemini (this Action, Custom GPT research sessions,
  private orchestration and the MCP tool) applies the population-level screen
  described under the MCP tool below. The Action refuses any other target as
  invalid input. A research session records a scout boundary instead and
  continues with the YouTube survey.
  Deterministic screening rejects personal narratives, identifiers,
  credentials, raw chat, URLs, and control/injection-like text before any
  provider request. The server sends the screened target, any language tag
  with its English language name, and checked-in public scout instructions to
  the fixed Gemini model with Google Search. The
  low-level technical route uses `store:false`; controlled research uses
  `background:true` and `store:true`, retains only an opaque bounded job
  checkpoint, and requests provider deletion immediately after consuming the
  completed interaction. A resumed scout stopped before completion (its target
  fails the population screen, or the MCP tool's spend gate refuses it) has its
  interaction deleted without another poll. Until that deletion succeeds, or
  while a provider key is not configured, the checkpoint is kept so a later
  call can delete or resume it; an expired MCP continuation token still
  triggers the deletion. Gemini returns a compact fixed-column packet that the server
  reconstructs and checks against the strict canonical candidate contract. If
  that check fails, the server may make exactly one no-search correction
  request to the same model containing only the public
  candidate output, exact executed public searches, and bounded non-sensitive
  validation issues; it then validates again and fails closed. The server
  independently validates each public YouTube identity: an ID whose YouTube
  title is not the scout's (compared ignoring case, punctuation and YouTube's
  usual additions) is not confirmed, and is returned with both public titles
  for the model to judge. On the MCP tool, a named video with no usable ID, or
  an ID YouTube does not have, is looked up by its public title with one YouTube
  search each (at most four per call): a single exact title is accepted, and
  otherwise YouTube's three closest public results are returned for the model
  to judge. It retrieves no comments or transcripts, makes no
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
| Protocol responses | complete canonical protocol text from `load_protocol`; manifest/integrity outputs from `get_protocol_manifest` and `verify_protocol_integrity`, including protocol name, version, revision date, SHA-256, verification boolean, and protocol error code/message when applicable; on OAuth-protected `/mcp` and `/mcp/claude`, the manifest's `connection` status for the caller's own request (sign-in absent, refused with a fixed refusal class, or accepted; research-access state; next step) | Protocol activation, integrity checking, and source reproducibility; the connection status lets a client explain refused research calls. It is computed per request, returned only to that caller, and neither logged nor stored. |
| Shared provenance | provider, record type, primary/provider IDs, retrieval timestamp, source URL/title/authors or channel, pagination, access status, limitations, and structured provider error | Makes source, time, coverage, and failure boundaries auditable. |
| Shared nested response fields | `raw_metadata` provider counters/freshness fields; `error` code/message/optional HTTP status/retryability; `source_identity` canonical URL/title/authors or channel; pagination cursor/next cursor/page size/returned/exhausted; limitations | These nested fields disclose response coverage, provider context, and failure semantics without exposing a raw provider payload. |
| Scholarly metadata | PMID, title, abstract when PubMed provides it, journal, dates, authors, DOI, PubMed Central ID, publication types; Europe PMC source/IDs/title/authors/journal/year; Crossref candidates (DOI, title, first author, year, and the landing page Crossref lists as the DOI's registered page) and backward-compatible update/retraction evidence; internal-only rich Crossref event assertions and FORRT relationship metadata in Phase D1 | Scholarly retrieval and discovery; citation, abstract, publication-event, or provider-reported replication metadata is not a substitute for inspecting the study and linked source. The new rich records are not public or session-connected in Phase D1. |
| Open publication full text and audit index | Requested DOI/optional PMCID; Europe PMC or Unpaywall discovery attempts (optional `http_status` and `retryable` for Europe PMC full-text failures: public provider status and retryability, no user data); public source URL, title, manuscript version and format; exact document and block SHA-256 values; extracted public JATS or PDF text with section/page location; opaque document handle and cursor; source-linked study or review audit submissions and bounded validation receipts | Attempts a lawful, identity-checked full-text method audit. Retrieval, open availability, randomization, peer review, journal status, or guideline status is not treated as proof of reliability. If no complete copy passes access and identity checks, only a possibly useful lead is returned and unseen contents are not evidence. |
| Public trial metadata | NCT ID, title, status, study type/phases, conditions, interventions, sponsors, enrollment, dates, results flag, references, and last update | ClinicalTrials.gov record lookup/search. |
| Public YouTube video metadata | video ID, title, description, published time, channel title/ID, duration, privacy status, and API-visible counts where supplied | Video discovery and provenance. |
| Public YouTube comment data | comment/reply IDs, parent/top-level IDs, public YouTube author/channel IDs, optional public display names, public comment text, likes, and publication/update timestamps | Requested API-visible comment and reply retrieval with completeness accounting. |
| Public YouTube transcript data | public caption text, segment start/duration, selected and available caption languages, provider-reported automatic-caption status, public video/channel metadata, and canonical timestamp links | Custom GPT-only best-effort verification of what a video's selected public caption track says; not an efficacy, accuracy, or causality determination. |
| YouTube community survey | user-supplied research question and labeled YouTube queries; bounded, deduplicated candidate videos; canonical clickable URLs; public title/channel/date metadata; and provider-reported comment counts | Maps promising videos before deeper acquisition without treating query-bounded discovery as the comment corpus. |
| Compound YouTube audit | user-supplied research question and labeled YouTube queries; bounded candidate/video selection; a complete small corpus or deterministic sample; corpus SHA-256; and a completion/synthesis-lock receipt | Performs reproducible multi-query discovery and complete API-visible acquisition in one request without making a medical conclusion. |
| Adaptive per-video YouTube audit | video metadata; provider-reported comment count; exact top-level, reply, cumulative-retrieval, and returned-for-analysis counts; API-visible comments/replies; deterministic sample; rolling corpus digest; completion receipt; and optional opaque authenticated continuation state | Retrieves one important video's API-visible discussion over bounded calls while preserving exact depth and completion state. |
| Treatment-landscape coverage assessment | On MCP: the caller's research receipts (verified, then used only for this call), research target, treatment classes, program fields, per-video screening decisions and short notes, and specific-search terms with the exact executed queries, from which the server derives the ledger below. On the Custom GPT Action: caller-supplied research target; receipt-linked discovery batch queries/scopes, specific implementation/discriminator terms and results, literal access/pagination states, class IDs, and candidate IDs; complete external-scout frontier digests and candidate partitions; treatment-class labels/search/formal-follow-up/omission states; structured program fields with `program not described` normalized; public video and stable channel IDs, titles/dates, selection and omission states; projected transcript chain/language/caption/timestamp fields; projected comment-audit metadata/access/count/reply/lock fields; directional-search states; and terminal/retryable/recovery boundary fields | Reconciles the supplied ledger, derives valid counts and normalized program signatures, excludes invalid records from aggregates, and returns separate selection, per-video-depth, and overall workflow locks plus compact per-video records. It makes no provider call, persistence, semantic-completeness claim, efficacy judgment, or medical conclusion. |
| Automated Gemini candidate scout and validation | screened de-identified population-level research target; diagnosis-status enum; optional BCP 47 language tag (only a tag, never user text) and its English language name, sent to Gemini with the target so the scout looks for videos in that language; checked-in scout instructions; aggregate token/Search usage; receipt-reconciled executed searches; public video IDs/URLs/titles/channels; provisional program/stage/outcome summaries; bounded safe validation issues when one correction is needed; independent public YouTube identity metadata; and a SHA-256 frontier partitioning validated, terminally rejected, and unresolved IDs | Finds a broad public candidate frontier without manual transfer. The low-level technical route uses a storage-disabled request. Controlled research uses a temporarily stored background Interaction, retains only its opaque bounded checkpoint, and requests deletion immediately after consuming it. If needed, one similarly temporary no-search correction returns only Gemini's public candidate output, exact public search receipts, and safe validation issues to the same provider and is deleted after consumption. YouTube receives candidate video IDs and, for the MCP tool's title lookup, public video titles as search queries. Provisional summaries remain discovery annotations, not transcript verification or treatment evidence. No comments, transcripts, or Gemini output are persisted by AskRigor. A deletion request is not a claim about provider backups or policy-required retention. |
| Legacy Gemini packet validation | operator-supplied de-identified research target, executed searches, public video identity fields, and provisional annotations | Preserves backward-compatible technical validation of historical packets. It is not the ordinary automated research path and creates no additional store. |
| Gemini video reading ("check this video", MCP only) | the 11-character ID of a public YouTube video the person gave, rebuilt into its public watch URL (a share code, time or any other link parameter is dropped); AskRigor's fixed reading instructions, or for a follow-up the fixed form with one time; YouTube's public title, channel, length, privacy and live status for that video; Gemini's report of the video's health claims (times, short quotes, speakers, the evidence the video gives, doses and products, sponsorships, on-screen citations) or of one moment | Lets AskRigor check what a video claims without its captions. Gemini receives only the public watch URL and the fixed instructions: never the person's question, words, health details or identity. Only public videos are read; private, unlisted, live and over-two-hour videos are refused before any Gemini request. The background Interaction is stored at Google while Gemini reads and deleted right after its report is consumed; an expired or refused continuation deletes it too. On Gemini's free tier Google may use inputs and outputs to improve its products. The report goes back to the client labeled as Gemini's transcription, with links to each moment; it is not evidence, and AskRigor persists none of it. |
| Completeness/accounting data | top-level/reply counts, mismatch identifiers, page counts, API-visible coverage, output/text byte counts, elapsed time, and provider request attempts | Shows whether a comment corpus is complete, partial, inaccessible, or failed. |

The source-generated full MCP `tools/list` inventory, including every advertised
input and output schema (and therefore every returned nested category), is
committed as `docs/tool-inventory-v0.1.0.json` and regenerated by running
`npx tsx scripts/generate-tool-inventory.mts --write`. Its exact JSON output is
checksum-locked and equality-checked by `tests/release-packet.test.ts`; it is
the authoritative companion to this human-readable data map.

Public YouTube author/channel IDs, optional display names, and comment text can be
personal data even when made public by the author. The current notice
specifically discloses this research processing and its API-visible-only
limitation.

Official YouTube Data API v3 calls use only `YoutubeConfig.apiKey`, placed in
the HTTPS query as the server-side `key` parameter. The source and production
configuration contain no Google authorization-code flow, YouTube OAuth scope,
user access token, or user refresh token. Auth0 protects AskRigor's own connected
research API and is not Google/YouTube authorization. Consequently AskRigor
creates no end-user Google account connection or YouTube authorization grant.

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

Phase 1 public-copy recovery (2026-10-07, working-tree draft; no deployment or
live-policy approval is claimed) adds optional `candidate_urls` to the MCP and
Action acquisition inputs: one to five public HTTPS URLs with an optional
declared source class. Phase 1b also adds optional `candidate_texts`: one to two
entries containing a public HTTPS page URL, 2,000–400,000 characters of text
returned by the AI's own search tool, and `retrieved_via: client_search_index`.
These copies are inspected locally without fetching their URLs or sending their
text to a provider. The abstract cross-check uses only an abstract carried by
the existing Europe PMC DOI-search record; missing abstracts produce an explicit
skipped-check limitation and no additional lookup. Whole-page inspection and a
unique qualifying embedded-block fallback share identity and full-text admission
checks. The optional strict `public_copy_search` object contains
two to twelve trimmed queries (3–400 characters each). Queries are checked in
request memory for the exact DOI and a known title variant; they are never
stored, logged, echoed, checkpointed, or included in receipts. Only search
status, missing identifier kinds, and a query count are returned and may enter
the compact checkpoint. A lead receipt includes the acquisition state, not
the queries. A route-failure receipt includes the requested DOI, the failing Europe PMC
PMCID (or the requested PMCID, when present), the failed AskRigor routes (Europe PMC,
Unpaywall or the owner library), their HTTP statuses, timeout/network failure kinds or
"error" when a failure gives neither, and the acquisition state; it includes no
queries. A refusal (an HTTP 4xx other than 408 and 429) ends the search on its route
and earns no route-failure receipt. After the primary OA routes yield no admitted document,
the server sends a direct GET to each supplied URL. This is a new data flow:
the model supplies the destination, rather than Unpaywall alone choosing it.
The URL path and query are sent to that host; redirects send their resulting
path and query to the next host. Hosts and DNS infrastructure can observe the
server's request/network identity and timing and process them under their own
policies. No chat, health narrative, research target, account identity,
provider contact address, API credential, cookie, or authorization header is
added to these copy requests. Callers must supply public publication URLs;
the server cannot establish from a URL alone whether its path/query contains
private information or an access token. HTTPS/public-address checks are not
a semantic privacy screen and do not certify reuse rights.

The existing discovered-document guards also apply to supplied candidates:
HTTPS without URL credentials or custom ports; rejection of private/reserved
destinations and mixed public/private DNS answers; DNS-pinned production HTTPS;
fresh destination checks for every redirect; at most five redirects; a
20-second timeout per request; and a 30 MiB response cap. Retrieval accepts
PDF, HTML/XHTML, and plain text. HTML extraction is static: no JavaScript,
browser session, subresource fetches, login, or paywall bypass. Unknown formats,
malformed PDFs, failed providers, and blocked pages produce explicit unresolved
states. There is no Bright Data integration or new paid model call.

Retrieved bytes, supplied search-copy text, and rejected/partial/abstract text
remain request-local and are not logged or written to disk. Only identity-verified copies passing the
route-specific full-text admission check enter the existing one-hour,
64-entry/128-MiB document-handle map. Responses add acquisition state and per-copy
retrieved URL, class and its basis (`known_host`, `metadata_publisher_host`,
`declared`, or `unrecognized_host`), retrieval provider (`direct` or
`client_search_index`), optional `embedded_block` extraction, check limitations,
identity-verification status, observed sections, completeness, and timestamp. The research-session controller
may retain that compact public provenance (including returned URL paths and
URL query strings), route attempts, and acquisition state in its existing encrypted
checkpoint, under its existing 72-hour idle/seven-day absolute retention; it
does not retain candidate bodies there. Admitted search copies use the document
index source `client_supplied`; audit receipts bind their search-index provenance
and host, and finalization requires a caveat that AskRigor did not fetch the copy.
Connected clients can retain returned provenance and admitted text under their
own terms. The public notice change is
drafted in `site/privacy/index.html`, pending owner approval before deployment
of this changed processing.

The ordered protocol Action cursor contains only protocol identity, digest, byte offset, chunk index, and expiry. It contains no protocol text, health content, or secret. It is authenticated with a protocol-specific key derived
from the existing server-only continuation secret. The Action returns each
exact UTF-8 chunk transiently and keeps no protocol-loading session record.

## Research processing and retention

| Location | Data handled | Persistent storage in v0 |
| --- | --- | --- |
| MCP or Custom GPT research Action request and adapter memory | Request parameters, provider responses, normalized metadata, public open-publication content and audit fields, public YouTube identity/comment/caption data, screened Gemini scout target and provisional candidate annotations, treatment-landscape coverage fields, and the current bounded segment used to update a deterministic sample and rolling corpus digest | Used for the active request only except for the exact Action handle/checkpoint rows below. No database, account profile, queue, durable full-text store, transcript-text store, candidate-packet store, treatment-landscape store, or server-side comment corpus is implemented. The low-level Gemini route sets `store:false`. Controlled Gemini scouting retains only the opaque background-job checkpoint in the encrypted research session until completion/boundary and requests provider deletion after use. Transcript continuations re-fetch the selected track; only compact chain metadata is retained under the bounded row below. The coverage assessor makes no provider call. The Phase D1 Crossref/FORRT primitives are not reachable through these public transports. |
| ChatGPT's device hint on `finalize_research` | The optional, best-effort `openai/userAgent` hint ChatGPT may send with the call: the reader's browser or app user-agent string | Read in request memory only, to decide whether the answer must carry the owner's mobile notice (a user agent naming an iPhone, iPad, iPod, Android device or mobile browser). It is never logged, stored, returned, signed into a receipt or sent to a provider; the caveats returned to the same caller show only whether the notice is asked for. Without the hint, or with a wrong one, only that notice changes. |
| The plain answer before research (`manage_research_access` action `register_plain_answer`; owner answer 140b) | For a paid private account or a dev account, on the MCP connector only (`/mcp` and `/mcp/claude`): the short answer the model would give without AskRigor's tools (at most 1,500 characters), one to five of its sentences as its claims (at most 250 characters each), and the research target. The dev accounts are the account references (or whole account keys) the operator lists in `ASKRIGOR_DEV_ACCOUNT_KEYS`, a server setting that is not a secret. | Request-local: each claim is checked in memory to stand as one or more whole sentences of the text, then a `plain_answer` research receipt signs a 16-character digest of each claim, the text's SHA-256, the research target's 12-character digest, a 16-character HMAC under the receipt secret that binds it to the account (never the account key itself) and the receipt's issue order, and goes back to the same caller with the claims listed. The receipt holds no text of the plain answer and is never stored or logged; neither are the text and its claims. It is a token the client carries, like every research receipt. Nothing is sent to a provider, a second reader or the findings library, and paid private accounts still submit nothing. Custom GPT Actions do not reach it, and Gemini's catalog does not list it. |
| The tool list's version (`tool_list_version` on `get_protocol_manifest`, `manage_research_access` and `finalize_research`; owner request, 2026-10-22) | The version of AskRigor's tool list the app loaded, which the model copies from that field's description: 16 hexadecimal characters of a digest of the tool list itself, never user content. | Request-local: compared in memory with the version of the tool list the surface now serves; when it differs, the result asks the model to tell the user to refresh AskRigor in the app's settings, and when none is sent, to do so if its tool list has no such field. On `finalize_research` it is read only when a declaration is missing, and the same version means no refresh is suggested. Never stored, logged or sent anywhere. |
| The plain-answer comparison on `finalize_research` (`plain_answer_comparison`) and its note | For an account asked for a plain answer, with its plain-answer receipt: each claim, copied as registered, its outcome (`confirmed`, `corrected`, `qualified`, `not_checked`), the answer's sentence stating a change and the study or video identifiers behind it | Request-local: read in memory for that call only, never logged or stored, not signed into the finalization receipt, not in the carried state, never saved with a findings card and not sent to the second reader. Each claim is matched to the receipt's digests, the quoted sentence is compared with the answer draft, and the identifiers with that call's receipts. A receipt bound to another account, signed for another research target, or issued after any receipt passed with it gives no note. When the check passes and the account's note is on, the result returns to the same caller the note the answer ends with (`plain_answer_note`): the plain answer's claims quoted exactly unless a claim contains a figure absent from the checked draft (then a fixed sentence replaces that claim's words), what the research found, the answer's sentences and the server's counts of the work behind each change. So the plain answer reaches only the receipt and the answer. |
| The serious-harm screen on `finalize_research` (`harm_screen`, `safety_question`) | The model's declaration of up to 20 serious harms the research searched by name, required with an answer draft that has safety statements, answers a question the model marks a safety question (`safety_question`, a boolean) or puts forward or ranks a medicine the model marks for long-term use (`recommendations` with `long_term_use`): each harm in at most 150 characters, what the screen found (`label_warning`, `reported_signal`, `not_found` or `not_checked`), the kinds of source searched (six fixed values), the answer's sentence reporting a harm found, and for a harm not found the exact literature query it was searched with (at most 500 characters) | Request-local: read in memory for that call only, never logged or stored, not signed into the finalization receipt, not in the carried state, never saved with a findings card and not sent to the second reader. A query is compared with the call's literature-search receipts by its 12-hex digest and is never returned; a quoted sentence is compared with the answer draft. A harm comes back to the same caller only in that call's caveat and limit for a harm not checked ("A serious harm this answer did not check: …"), and in next steps that point to an entry by its position and name its declared harm. |
| The classes of treatment a comparison covers, on `finalize_research` (`option_classes`; owner answer 153a) | The model's declaration of up to 20 materially plausible classes of treatment, required with an answer draft that compares treatment options (`treatment_choice` `compared`), in a first pass too: each class in at most 120 characters, what was done (`researched`, `not_researched` or `inaccessible`), and for a class researched the exact literature query it was searched with by name (at most 500 characters) and the answer's sentence reporting what that search found | Request-local: read in memory for that call only, never logged or stored, not signed into the finalization receipt, not in the carried state, never saved with a findings card and not sent to the second reader. A query is compared with the call's literature-search receipts by its 12-hex digest and is never returned; a quoted sentence is compared with the answer draft. A class comes back to the same caller only in that call's caveat and limit for a class not researched or out of reach ("A class of treatment this answer did not research: …", "A class of treatment whose research this answer could not reach: …"), and in next steps that point to an entry by its position and name its declared class. |
| The one thing a question is about, and videos AskRigor could not read, on `finalize_research` (`named_target`, the six `target_` match fields of `key_sources`, `unwatched_videos`; AskRigor#359) | The model's declaration, when a question is about one specific intervention, product, program or video routine, and required whenever an `extract_youtube_video_claims` receipt is passed: a label in at most 160 characters, where its description comes from (`video_read`, `video_description_only`, `person` or `source_text`), an optional public video ID, and six fingerprint fields (components, dose or intensity, frequency and duration, population, outcome, time horizon), each at most 300 characters or "program not described"; for each key study, one of three fixed values per field (`same`, `different`, `not_described`); and for each video the tool could not read or did not finish reading, its public ID and where the answer's account of it comes from (`description_only` or `person`) | Request-local: read in memory for that call only, never logged or stored, not signed into the finalization receipt, not in the carried state, never saved with a findings card and not sent to the second reader. Video IDs are compared with the call's video receipts, and the fixed values with each other. The fingerprint fields never come back. The label comes back to the same caller only in that call's caveat and limit when no key study is declared the same on all six fields ("Not tested as described in any study I found: …"), and in a next step naming internal labels in it; an unread video's public ID comes back in its caveat's link and limit ("I could not watch [this video](…), so …") and in next steps that point to an entry by its position. |
| Internal Phase D1 external-evidence adapter invocation | One public DOI; normalized Crossref publication events or FORRT replication/reproduction relationships; provider response hashes, access/error state, limitations, and FLoRA attribution | Transient process memory only. No public route, research-session connection, database, cache, response artifact, or durable provider-content store is added in Phase D1. Fixtures are synthetic. |
| Internal Phase D5 optional-provider adapter invocation | A strict synthetic or future server-authorized record for one public DOI; bounded PubPeer message/thread state or Epistemonikos review-ancestry metadata; content/item hashes, status, pagination, classification provenance, directives, and limitations | Phase D5 has no live transport or new provider request. When a server executor is supplied in tests, the existing bounded in-memory artifact store and signed receipt are used; the research-session projection keeps hashes/status/work rather than message bodies. No durable store, token, public operation, or deployment activation is added. |
| MCP client-carried continuation state | The minimized, opaque authenticated continuation state described above | Returned to the invoking MCP client and processed transiently if resubmitted within one hour. The server keeps no matching MCP session record. |
| Custom GPT Action continuation handle map | A short random handle mapped to the existing signed minimized token; no comment/reply text, author identity, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 16 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires an approved sticky-routing or shared-state design. |
| Custom GPT transcript Action continuation handle map | A short random handle mapped to compact transcript chain metadata: provider cursor, public video ID, selected-track metadata, caption-snapshot hash, page size/count, cumulative segment count, next expected index, and timestamp-presence state; no caption text, title, channel name, request text, provider credential, or protocol text | Process memory only on the single application replica, no longer than one hour, at most 2,048 handles and 4 MiB. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; there is no durable research-session store. Horizontal scaling requires approved sticky routing or shared state. |
| Open-full-text Action handle map | A short random handle mapped to one exact identity-verified document index plus the next block/character cursor, segment counts, public source metadata, manuscript version, and document/block hashes | Process memory only on the single application replica, no longer than one hour, at most 64 handles and 128 MiB total. The map may contain extracted publication text, including an owner-library copy admitted for the verified owner, or for an active free-contributor or currently entitled paid-private account with a same-call public basis. Library PDF bytes and the private download URL are discarded after acquisition; the index records the public basis URL (or DOI URL for owner access), retrieval provider, identity check and content hash. It contains no provider credential or user health record. Server restart, expiry, or capacity eviction removes access. Nothing is written to disk or application logs; horizontal scaling requires approved sticky routing or shared state. |
| MCP or Custom GPT research Action response | The normalized fields in the table above. Action protocol and open-full-text reads use exact ordered chunks; transcript pages contain bounded timestamped caption segments; oversized per-video community samples may be deterministically transport-bounded without changing retrieval counts, digest, access state, or receipt. | Delivered to the connected client. The client/ChatGPT may retain conversation or tool-result data under its own terms; AskRigor v0 does not control that retention. |
| Server logs | In routine operation the application emits a startup line only. A disabled-by-default MCP connector diagnostic can be enabled temporarily by a maintainer. It emits only a fixed route class, HTTP method class, coarse header/media-presence classes, selected JSON-RPC phase class, completion class, and response status. It never emits a URL or query, IP/network address, user-agent, header value, request or response body, JSON-RPC ID, tool name or argument, prompt, provider payload, comment text, user identifier, or credential. Infrastructure may independently process operational metadata such as time, route, HTTP status, latency, IP/network data, or security signals. | No request-body, response-body, candidate-content, or dedicated application access log is emitted or stored. The temporary connector diagnostic is restricted to a troubleshooting window and must be disabled by recreating the diagnostic container after the needed receipt is captured; its active container log is not a durable research-session store. Infrastructure retention and backups follow each provider's configured policy and are outside AskRigor's application storage. |
| Provider requests | Necessary query/identifier and fixed service contact values where required by a provider, including the service contact email sent to Unpaywall; the screened population-level target, any language tag and public scout instructions sent to Gemini; the public watch URL of a video the person gave, with fixed reading instructions or the fixed one-time follow-up, sent to Gemini; and, only after a malformed scout packet, one bounded correction containing Gemini's own public candidate output, exact executed public queries, and safe validation issues. If the internal Phase D1 adapters are invoked by later controller work, Crossref receives the public DOI and configured service contact, while FORRT receives only the public DOI and fixed headers. | Europe PMC, Unpaywall, public copy hosts, Crossref, FORRT, Google Gemini, Google Search, and YouTube process requests under their own policies. The low-level Gemini route uses `store:false`; the controlled path uses `background:true`/`store:true` and requests deletion immediately after consumption. Only the first interaction can use Google Search. Provider keys and contacts remain server-only. AskRigor does not claim to control provider processing, backups, or policy-required retention. Phase D1 itself does not expose or deploy the new internal adapters. |
| Owner-library InfoAccess request and PDF transfer | Only the requested DOI is sent to the free `get_article_pdf` MCP tool, authenticated with the dedicated server token. The returned download URL, byte size, SHA-256 and at most 64 MiB of PDF bytes are checked in memory within a 120-second call deadline. No question, health detail or account identity is sent. | Enabled only with both `ASKRIGOR_INFOACCESS_URL` and `ASKRIGOR_INFOACCESS_TOKEN`. The library is consulted only when no public copy was admitted. Access is decided from the verified sign-in: configured reviewer/owner subject, or an active research account (free contributor, or paid private with a currently active entitlement) and a same-call public basis. Free accounts have had this route since owner answer 157a (2026-10-22); before it, only paid private accounts did. An unregistered or revoked account, a free account that has not accepted the current notice, and a paid account whose entitlement has lapsed have no route. Every account's library reads share InfoAccess's rate limits with the owner's own InfoAccess use; a rate-limited request is a route failure, not a completed lead and never a statement that the paper is inaccessible, and a later attempt can try again. The token is never logged or sent to the PDF download host; the private download URL never appears in client output. No paid InfoAccess tool is called. PDF bytes and transfer metadata are not persisted; extracted admitted text follows the bounded handle retention above. The public privacy notice's sentence on the operator's study library was owner-approved (question 62) and is effective October 10, 2026; owner answer 157a extends it to free accounts under the same condition ("for a free or paying account only while the same study is publicly available elsewhere"), and the notice's effective date is set to that change's release day. |
| Aggregate AI budget ledger | UTC month, fixed $50 monthly limit, aggregate charged nano-USD, update time, and schema version shared by lesson privacy and Gemini scouting | Owner-only mode-0600 file. It contains no target, prompt, candidate, request, response, identity, or credential. Each Gemini scout reserves at most $1 before provider execution; a dev account's Gemini 4 trial (owner answer 146b) reserves the same scout at that model's prices, about $1.97 through November and $3.52 from 1 December, and its trial arm travels in its continuation token. A background scout charges that maximum at job start as a hold; later polls do not reserve again, and the call that completes it settles its real cost, the same usage-based amount a one-call scout commits, refunding the rest to the hold's UTC month once (nothing once that month has ended). A boundary, failure, over-budget result, stopped, expired or abandoned scout, or a settlement this file cannot record keeps the whole hold charged, as does a scout started before holds existed. The hold (a random hold identity, the amount held and its UTC month) travels with the scout in the MCP continuation token or the research-session checkpoint, never in this file; to refund each hold once, the server process remembers the current month's settled hold identities in memory only (none survive a restart). |
| Gemini video daily ledger | Pacific calendar day, fixed 8-hour daily limit, total video seconds charged that day, update time, and schema version | Owner-only mode-0600 file beside the AI budget ledger. It contains no video ID, title, request, report, identity, or credential. Each Gemini video reading charges its video's whole length before it starts, a charge is never refunded, and a reading that would pass the limit is refused. The count restarts each Pacific day, when Google's daily quotas reset. |
| Optional local legacy Gemini-candidate validator | Operator-supplied de-identified research target, executed search queries, public video IDs/URLs/titles/channels, provisional creator-claim annotations, and independently retrieved bounded public video metadata | The operator controls the historical input file and standard output. AskRigor creates no additional file, database row, log, account record, comment corpus, or transcript store. YouTube processes the video-ID lookups under its own policy. |
| Phase G/K2 research-session controller checkpoint | Opaque execution ID; sensitive research target and diagnosis-status enum; exact protocol identities; module/operation/controller state; public candidate/video/channel/source metadata; bounded semantic screening/program/audit/transfer/treatment annotations; source-linked de-identified creator/community findings; exact study/review method findings and claim capabilities; the bounded reader report and its digest; compact coverage receipts, source identities, hashes, directives, limitations, unresolved state, and final-audit basis. While Gemini background scouting is unfinished it may also contain one opaque interaction ID, phase, poll count, bounded public executed-query receipts, aggregate usage counters, conservative charged amount, and its budget hold (a random hold identity, the amount held and its UTC month), which the completing call settles against the aggregate budget ledger. It excludes raw chat, transcript/comment/return-search text, commenter identity, article blocks/full text, raw provider bodies, Gemini responses, credentials, keys, cookies, and private sources. | With reviewed checkpoint configuration, one AES-256-GCM authenticated envelope is written per session to a mode-`0700` directory with mode-`0600` files; development without it uses the bounded in-memory adapter. Retention is 72 hours idle and seven days absolute, at most 1,024 sessions, 16 MiB plaintext and 24 MiB stored. It has no configured backup, rejects capacity rather than evicting unexpired sessions, physically removes expired files during access, inventory, and service startup and with an hourly sweep, supports internal deletion, and is single-writer/single-host only. The background checkpoint and its hold are removed when scouting completes or reaches a recognized boundary; a resumed scout stopped before completion keeps them until its interaction is deleted, and each consumed provider interaction receives a deletion request. The report remains below the Action response budget. K2 changes only the authenticated Custom GPT Action projection; MCP remains unchanged. |
| Phase K2 signed worker-payload chain | Exact bounded semantic-work descriptor, minimum task evidence, response schema, de-identified target, opaque session/state/work/payload digests, signed cursor, and terminal receipt | Returned transiently to the invoking Custom GPT in UTF-8-safe chunks no larger than 40,000 bytes. Cursors and receipts expire after one hour and use domain-separated HMAC. Raw evidence is not written into the checkpoint or server logs. ChatGPT may retain tool results under its own terms. |
| Phase K2 product-acceptance receipt | Fixed synthetic challenge ID, opaque session ID, exact installation-bundle and protocol digests, ordered capability/result and before/after state digests, final boundary, permit/report digests, issue/expiry times, key ID, payload hash, and signature | Issued only after authorized or bounded finalization of the fixed challenge and expires after one hour. It contains no prompt, health detail, source text, provider body, credential, or private content and replaces caller-authored acceptance counts/prose. |
| Phase H private orchestration request/result | Start may contain one screened de-identified target and diagnosis-status enum. Resume/status/finalize contain only an opaque session ID. Semantic submission contains that ID, exact state/package digest, and one bounded routing or candidate-screening assessment. Results contain minimized controller status, boundary, next capability, safe boundary codes/counts, and at most one bounded work package or compact finalization result. | The HTTP transport itself writes no body log or separate store. When enabled later, controller state follows the Phase G encrypted checkpoint rules above; raw provider/source material remains ephemeral. Authentication uses a distinct server-held secret. Browser Origin requests are refused, responses are non-cacheable, and neither secret nor raw research/source content is sent to an external orchestrator merely for convenience. Phase H adds no live external recipient or deployment. |
| Disabled Phase I/K1 Hermes semantic worker | One opaque session ID and state digest; the exact current state-only work descriptor; for the active bounded semantic task only, the minimum exact public evidence context required to inspect it (timestamped transcript segments, comment text with author identity removed, exact public article blocks, bounded external-audit records, or bounded current report evidence); for new-session module routing, the same deterministically screened de-identified population-level target accepted by the private start route; one dedicated model credential; provider/model and non-authoritative API-call/cost diagnostics | One fresh child process and temporary directory per work package. Hermes tools, memory, context files, trajectories, checkpoints, and background review are disabled. Evidence context is transient, never returned by private status, and never written to the checkpoint as raw source text. The temporary directory is removed after the turn; AskRigor writes no Hermes conversation or model output to a new store. The external model provider may process the transient public/de-identified package under its own terms. The child never receives commenter names/channel IDs, the private orchestration credential, production research-provider secrets, raw private health content, credentials, or a finalization permit. Phase K1 adds no deployment or live recipient. |
| Phase K1 process-local evidence-material cache | Exact timestamped public transcript segments and the bounded public discussion analysis sample for selected videos, indexed by opaque session/video identity and exact receipt hashes; commenter names and channel IDs are discarded on ingestion | Process memory only, default maximum 100 session/video entries and 64 MiB aggregate. Entries expire after 72 hours idle and seven days absolute and an hourly sweep removes expired entries; successful report finalization releases all entries for that session immediately. Least-recently-used entries may also be evicted because their loss reopens exact reacquisition rather than advancing state. The cache is never checkpointed, logged, returned by private status, or included in the reader report. Stored community findings reject direct identifiers and substantial verbatim source copying. A miss may trigger exact source reacquisition; mismatched replay receipts revoke the session cache and fail closed. Process loss discards the cache. |
| Disabled Phase J n8n control plane | AskRigor-side ephemeral state: opaque n8n execution ID, opaque AskRigor session ID, current digest/directive, bounded retry/no-progress counters, safe timestamps/reason codes, and after authorization only the output boundary and permit payload hash. n8n receives only the opaque n8n execution ID and safe projection; it does not receive the inner session ID or research content. | Process-memory AskRigor store only. The disposable pinned n8n runtime disables saving successful, failed, progress, and manual execution data and deletes its temporary database after validation. No durable database, backup, external notifier, production service, or new retention is approved. |
| Non-production external-evidence artifact store | Strict normalized Crossref/FORRT envelopes and, only when a server executor is supplied, Retraction Watch/PubPeer/Epistemonikos envelopes for one public DOI; content-derived artifact ID; provider/source identity; media type; byte count; content and descriptor hashes | Phase G deliberately keeps this store in process memory only, with default bounds of 128 entries, 10 MiB per artifact, and 32 MiB total. Bytes are cloned, exact artifacts deduplicated, and entries explicitly revocable; process loss discards them. There is no disk, database, object store, backup, production singleton, or public route. An interrupted audit reruns rather than retaining raw artifacts. |
| Retraction Watch public snapshot mirror | Fixed official source commit/path/file hash; normalized public publication-integrity fields; DOI/PMID indexes; manifest/file hashes; source-check and activation timestamps; current/previous pointer | Separate mode-`0700` host directory. A fixed daily one-shot container writes the mirror without receiving AskRigor runtime secrets; the application mount is read-only. Only active and previous verified generations are retained; abandoned staging and older generations are removed after verified activation. No backup. A pre-activation sync failure preserves the prior active pointer; post-activation cleanup failure remains visible and may temporarily leave an extra immutable generation. Older than 72 hours is stale/partial. The source-only implementation and deployment template are approved in Phase G, with final live activation evidence deferred to the release phase. |
| Curated production living-evidence study audit | Exact public DOI/PMID/PMCID identifiers and source-version hash; source locator/access state; complete AskRigor-authored validated 13-domain study-method audit and claim-capability findings, with the audit's declared headline figures (as printed, recomputed, its plausibility call and source block) and each program's route; unresolved/future-analysis items; canonical protocol, freshness, impact, and validator receipts | A one-shot administrator process receives the exact public document index transiently over bounded stdin and writes only the source-free strict contribution to a private PostgreSQL service on the AskRigor VPS. The public MCP canonical-lookup component uses a SELECT-only role, performs one 1.5-second lookup at acquisition and one at requested reuse, and writes no public-user request, chat, tool call, health narrative, article block, provider body, transcript, comment, reply, or identity to canonical tables. No database port is published and no automatic off-host backup is added in this phase. |
| Curated formal research frontier | Exact current protocol manifests; de-identified formal-source query/hash; provider and formal source class; requested and confirmed half-open publication/index windows; access/exhaustion/count receipt; public formal identifiers/title/date; append-only candidate decision/reason; unresolved, blocked, coverage-gap, discriminator, and delta trails with next capability or terminal reason. Read-only catalog search accepts transient free text and returns only stored topic/question metadata, exact selectors, lexical match fields, and descriptive coverage counts. | One strict writer-only `import-frontier` transaction in the same private PostgreSQL service. The contribution requires explicit false raw-source/raw-provider/personal/community persistence markers. Source/provider/candidate/trail scope and lineage are database-checked; update/delete fails. The canonical lookup role remains SELECT-only; catalog lookup runs in a read-only transaction. The distinct proposal role can insert only pending strict proposals, not canonical rows. YouTube/community classes and locators are rejected. Deterministic Obsidian/Mermaid exports are derived, non-authoritative views. |
| Owner-accepted topic link | Link UUID and idempotency key; the run's protocol manifests, times and provenance note; the two canonical topics' IDs and keys; one relation (`same`, `narrower`, `broader` or `related`); the model's deidentified rationale (at most 2,000 characters); the payload as reviewed and its SHA-256; how many aliases and edges it wrote. For `same`, each topic's label written as the other's alias; otherwise one topic edge under the link's UUID (owner answer 138b, 2026-10-20) | Written only by the canonical writer, under its lock, from the exact TOPIC_LINK proposal the owner accepted; the writer repeats the intake's exact checks (both topics exist under the IDs and keys named, no stored link contradicts or repeats it, no third topic holds the alias, the UUID is new) and otherwise ends the promotion `FAILED` with its code. It never moves, changes or deletes either topic, its aliases, edges or anything filed under it; update and delete fail. Whether two wordings name one topic is the model's declaration and the owner's judgment, not a server check. The canonical lookup role reads it SELECT-only, the catalog search reads the aliases, and the repository export includes the rows. No account key, chat, prompt, person's details or source content. |
| Connected research-use account and pending contribution proposal | HMAC-SHA-256 account key; active/revoked state; free-contributor or paid-private mode; exact notice/agreement fields and timestamps (the notice version accepted, now `free-contributor-v4-2026-10-25`, or v1, v2 or v3, whose account accepts v4 before free research continues; migration `0020_research_use_notice_v4`, owner answer 171); the plain-answer note setting (`plain_answer_note`, a boolean, on by default; owner answer 140b, migration `0013_research_plain_answer_note`); the detailed lesson reports setting (`detailed_lesson_reports`, a boolean, off by default, which only the user's `set_detailed_lesson_reports` turns on; owner question 154, migration `0015_research_detailed_lesson_reports`), never a report; the findings-card saving setting (`findings_save`, a boolean, on by default, which only a dev account listed in `ASKRIGOR_DEV_ACCOUNT_KEYS` may turn off or on through `set_findings_save`; owner answer 171, default 5, migration `0023_research_findings_save_switch`), never a card; verified-entitlement status; strict deidentified formal-frontier, source-analysis or topic-link proposal, proposal hash/kind/partial state, eight privacy false markers, and review timestamps/reason; optionally the UUID of the same account's own pending proposal of the same kind that the proposal supersedes (owner answer 138b, 2026-10-20); for a paid-private account's research map only, the SHA-256 of the finalization receipt whose offer the user said yes to (`consent_receipt_sha256`, owner answer 143a, migration `0014_research_map_consent`), never the receipt | A distinct least-privilege PostgreSQL role can select/insert access accounts and update only their enrollment/revocation columns and settings (including `findings_save`, never the account key or creation time), read entitlements, select/insert proposals, and execute one security-definer function that changes only pending proposals for a supplied HMAC account key to `WITHDRAWN`. It cannot grant entitlements, change proposal review dispositions, or write canonical evidence/frontier tables. The service, not the client, derives the key from the authenticated OAuth subject. Proposal payloads exclude raw chat/prompts, identity/contact data, private health narratives, uploads, raw source/provider bodies, credentials, and community/YouTube data. Pending rows have no automatic expiry in this slice and no automatic off-host backup. A database trigger accepts a supersedes link only to the same account's own pending proposal of the same kind, and refuses any other UUID with one answer, so a submitter learns nothing about another account's proposals; accepting the proposal rejects that draft, "superseded by <id>", in the same transaction. The same trigger admits a paid-private account's proposal only as a research map carrying that consent digest, and a free contributor's never carries one; a unique index lets one yes file one map, and the owner's review shows neither the account key nor the digest. The owner's review sees the link in both directions by proposal ID only, which shows that the two proposals come from one account, never the account key. Before storage, a frontier is reconciled with the canonical store by exact identity through the read-only canonical reader, so the stored payload may hold canonical IDs and labels in place of the ones sent; the submitter is told which IDs, all of them already public through the catalog tools. A topic link names two canonical topics by ID and key, one of four relations and a deidentified rationale; it is stored only after the same reader confirms both topics and that no stored link contradicts it, and when the reader cannot be read nothing is stored. |
| Held validated analysis (free contributor) | HMAC-SHA-256 account key; the study or review audit's SHA-256; the living-evidence contribution built from one validated method audit: source identifiers, title, content hash and locator, structured domain findings and claim capabilities, a study audit's declared headline figures and program routes, the audit receipt, the protocol identities, and a Crossref integrity-check hash | Process memory only, between a free contributor's successful `validate_study_method_audit` or `validate_review_method_audit` on MCP and a passing `finalize_research`. The final check then files it as a pending `SOURCE_ANALYSIS` proposal through the same intake and privacy checks as `submit_research_contribution`, so the AI no longer has to send it. Held only for active free contributor accounts, never paid private, and only for a source with a DOI and a clean Crossref integrity check; repository reuse is not held. No source text, chat, prompt or person's details; entries drop after 24 hours, past 500 entries, or on restart. A study a free contributor read from the operator's library (owner answer 157a) is held the same way: its locator is the public page that gave its public basis (or the canonical family's own), never the library's link. The contribution itself is the same data a pending proposal already stores. Owner answer 138b (2026-10-20): each audit is its own analysis, keyed by the audit and its protocols; when the source's identifiers name one canonical source family with no conflicting identifier, the public runtime's read-only canonical reader supplies that family's ID, title, version of the same bytes and freshness policy, which the contribution then carries instead of the document's; a new source version records no retrieval time. An audit the canonical store already holds under the same protocols, or one this account already filed (pending, accepted or rejected), is not filed again. |
| Owner-accepted contribution promotion | Promotion UUID; proposal UUID, strict kind and reviewed payload SHA-256; creation time; `PENDING`, `COMPLETED` or `FAILED` state; for `COMPLETED`, the completion time and the stable receipt (canonical identifiers and the writer's receipt) with its SHA-256; for `FAILED`, one failure code from a closed list of canonical conflict codes (never free text or payload content) and the failure time. The owner's decision, reason and review time stay on the proposal row. No claim, attempt count or error text is stored. | The public runtime cannot write this state or canonical evidence. One function-only owner-review call atomically creates the exact intent only on acceptance; the review role reads a failed intent's code through one more security-definer function, which returns no account key. That function also gives the owner's review the supersession links and the other proposals pending review or queued for promotion that share one of the proposal's identities (topic key or ID, frontier, question, source family, or a candidate or source identifier), by proposal ID, kind, state and the kinds of identity shared only: never an account key or another proposal's content. The review also reads the canonical store through the public runtime's read-only reader for the canonical records sharing those identities (IDs only) and a promotion preflight, a dry run of the writer's identity checks that stores nothing and names each conflict by its fixed code and payload path; neither is stored or sent anywhere but to the owner. A separate root-scheduled short-lived admin container receives only the existing canonical writer environment and promotes at most one accepted intent per activation; an intent whose canonical write conflicts deterministically ends `FAILED` with its code and the activation moves to the next (at most 20 per activation), while a transient error leaves it `PENDING` (owner answer 138b, 2026-10-20). The static unit accepts no user input and logs only the bounded operation receipt, including each failed intent's UUIDs, kind and code; it receives no raw chat, account key, private health narrative, upload, raw source/provider content, or community data. Disabling the timer preserves all rows. |
| Held YouTube findings (owner answer 173) | For each finding drawn from YouTube comments that a saved findings card leaves out, or of a card whose findings all rest on them, which is not saved as a card: its claim, certainty, whom it applies to, why the usual answer misses it, what would change it, its kind, subject and direction when declared, and its tags and verified bases (fixed values); the saved card's `ARF-####` issue number (none for a card not saved, which keeps instead the card's own general wording of the research question and its topic's key and label), the checked card's SHA-256, the finding's place on that card, and the save time. Never a source (a YouTube video ID), a link, the answer quote, a contributor or thread key, or any comment text, name, channel, comment or video ID. | Private PostgreSQL table `held_youtube_findings` (migration `0019_held_youtube_findings`), reached only through six security-definer functions: the research-access role holds a save's findings in the background (a failure never fails or delays the save; they are then not kept); the review role holds the findings moved out of cards stored before, reads, deletes a card's or a save's with no card, and deletes them all at once; the reader and every other role are refused. Only the owner sees them, in the owner-only review tool (a card's view, and `list_youtube_findings` for those with no card, a page at a time), with the day each was saved; never published, accepted into the Atlas or offered anywhere else. Kept until deleted (the owner's rule, 25 October 2026: "don't delete the summaries unless YT tells us to do that"): on request, with `delete_youtube_findings` for a card or a save with no card and `forget_card` with a card, or every one at once with `delete_all_youtube_findings` (with `confirm: true`) if YouTube asks. Nothing deletes one by its age, and none is refreshed. |

Contribution intake rejects frontier candidate and source-analysis identifier values beginning with `sandbox:` (case-insensitive), because a sandbox link points into another session and can never be opened.

The intake's contact, address and credential screen reads field names as well as values (20 Oct): a free name under
`receipts[].details` that matches one of those patterns is refused like a value would be, so it is never stored.

A rejected `submit_research_contribution` call (owner question 127) returns, to the caller only, every problem the
intake found: each problem's field path, rule name, what the contract expects there and a JSON example taken from
AskRigor's own example records, at most 25 problems and about 16,000 characters, with the count of the rest. It never
repeats a value sent: no text, number, identifier, link or matched contact pattern, and no key the contract does not
define (such a key, and a free name under `receipts[].details`, is shown as `*`); a privacy rule is named with its path,
never the text it matched. The rejection is not stored or logged, and refusals by account (sign-in, revoked or
unchosen mode, paid private) come before the record is read. Nothing new is collected.

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

The connector's `submit_lesson_candidate` takes the same fields without
`incident_provenance`, plus the required short diagnostics below, an optional
`related_issue` (described below) and,
only from an account that turned on detailed lesson reports, an optional
`detailed_report` (owner question 154, 2026-10-21). Detailed lesson reports are
off by default; the user turns them on or off with `manage_research_access`
action `set_detailed_lesson_reports`, which stores only that choice, in
`research_use_accounts.detailed_lesson_reports`.

Every connector lesson requires these short diagnostics, including when detailed
reports are off. The original short fields' bounds above are unchanged.

| Connector field | Meaning and implemented bound |
| --- | --- |
| `existing_rules` | Either `{rules: [{name, status, reason}]}` with 1–12 entries, or `{none: explanation}`. Each name is an exact current HRP/Universal element tag or selectable `name`/`id`, at most 160 characters. Status is `not_loaded`, `loaded_not_applied`, `applied_but_insufficient`, `not_triggered` or `unknown`. Each reason, or the explanation of the missing rule, is one nonempty line of at most 300 characters. |
| `observed_behavior` | What actually happened and the first observed failing step, 20–1,200 characters; generalized, with no real person's details. |
| `part_to_change` | `{kind, name}`: kind is `tool`, `protocol_rule` or `final_check`, the same kinds named by a detailed report; the specific part's name is 1–120 characters. |

The server checks every inventory name exactly against the parsed complete
protocols used by `load_protocol`. It checks declaration form, not whether a
rule covered the failure or why it was not followed. Every new prose field
(reasons, missing-rule explanation, observed behavior and part name) passes the
unchanged lesson privacy screen. These diagnostics stay outside the legacy
anonymizer, duplicate fingerprint and hidden metadata; the validated fields are
escaped and stored in the private issue or repeat comment. The tool tells the
model to show the inventory first and propose enforcing or fixing covering rules
before a new rule, and to show the short diagnostics before seeking consent.
These fields collect no raw incident or personal-data class and do not change
the detailed-report setting, rate limits, Action body limit, or anonymizer path.

The optional detailed report's fields are:

| Report field | Meaning and implemented bound |
| --- | --- |
| `steps` | The steps that led to the failure, 1–12, each at most 300 characters. |
| `observed` | What happened, at most 1,000 characters. |
| `expected` | What should have happened, at most 1,000 characters. |
| `causes` | 1–5 causes, each at most 300 characters with a confidence of `low`, `medium` or `high`. |
| `parts_to_change` | 1–8 parts of AskRigor to change (a tool, a protocol rule, the final check), each at most 120 characters. |
| `proposed_change` | The proposed change, at most 1,500 characters. |
| `test_cases` | 0–5 invented test cases, each at most 1,200 characters and marked as a negative control or not. |
| `uncertain` | What stays uncertain, at most 1,000 characters. |

All the report's texts together hold at most 10,000 characters, and unknown
fields are rejected. Every text passes the same deterministic screen as the
lesson's own fields, and any failure refuses the whole submission. On the
submission path the report never reaches a model: it stays out of the legacy
anonymizer's input, as incident provenance and `related_issue` do. A lesson carrying a report from an
account whose detailed lesson reports are off, or without a research account,
is refused before the screen, with the reason code below, and nothing is
stored.

The public result is one strict status shape: `submitted` or
`existing_candidate` returns only `candidate_id`, `occurrence_count`, and
`retryable:false`; `rate_limited` returns `retry_after_seconds`, an allowlisted
`reason_code`, and `retryable:true`; `privacy_rejected`,
`anonymizer_unavailable`, and `github_unavailable` return only their status,
retryability, and an allowlisted reason code. On the connector only,
`detailed_report_refused` returns only its status, `retryable:false` and the
reason code `detailed_reports_off`. Results do not expose a private
URL, GitHub issue number, candidate text, report text, or fingerprint.
The connector also returns `existing_rules_refused`, `retryable:false`, with
`invalid_existing_rules` for a missing/malformed inventory or
`unknown_protocol_element` for a name outside the current protocol elements.
Neither refusal echoes the submitted declaration or stores a lesson.

## Lesson screening, recipients, and storage

The server applies a deterministic screen and a local schema check; production
makes no model or API call on this path (`apps/research-mcp/src/lessons/runtime.ts`).
The legacy OpenAI privacy check is no longer called: a complete legacy
configuration (key, ledger path and the fixed $50 budget) is still validated if
present, but nothing consumes it, so no lesson field reaches OpenAI. The screen
checks privacy risk; it does not determine whether the lesson is scientifically
correct.

If the screen passes, the private GitHub issue stores the category in its title
and labels; a label naming the AskRigor surface that sent it (`source-custom-gpt`
for the Custom GPT's Action, `source-connector` for the MCP connector); general lesson; expected behavior; failure reason; synthetic
regression example; evidence basis; optional AskRigor version and protocol
identities; the privacy-gate marker; optional prior public candidate ID;
for a connector lesson, an optional number of a public `u-dont-existDOTcom/AskRigor`
issue, rendered by the server as a reference with no free text; for a connector
lesson from an account that turned on detailed lesson reports, its detailed
report as a "Detailed report" section rendered by the server from the validated
fields with the same escaping; for every connector lesson, the existing-rule
inventory as the first section, observed behavior and the part to change; an
initial anonymous occurrence count; first-seen timestamp; and a hidden
deduplication fingerprint marker. Later duplicates leave that body unchanged
and append private generated comments containing the anonymous count,
observation timestamp, the related issue reference when that repeat names one,
the repeat's detailed report when it carries one, and canonical fingerprint
marker. A detailed report is part of neither the fingerprint nor the hidden
metadata, and it is stored only there, in the private lessons repository.
For a connector repeat, the comment starts with that occurrence's inventory,
then its general lesson, observed and expected behavior, part to change, failure
reason and synthetic regression. This preserves occurrence-specific detail
without changing the duplicate key or rewriting an earlier report.
Neither the issue nor
the generated comments store `consent_scope`, user identity, network identity,
conversation identifier, raw chat, raw quotation, medical history, or upload.

The ledger's four aggregate data values are UTC month, monthly limit, charged nano-USD, and update time; a non-content schema version is also stored.
Their implemented keys are `utc_month`, `monthly_limit_nano_usd`,
`charged_nano_usd`, and `updated_at`, plus `schema_version`. The ledger contains no candidate or request content.
It enforces the fixed $50.00 monthly limit; a new UTC month replaces the prior
aggregate ledger.

Recipients and provider boundaries are therefore distinct:

- the AskRigor server receives and validates the generalized structured lesson
  candidate and, from an account that turned on detailed lesson reports, its
  detailed report;
- no AI provider receives the lesson candidate or a detailed report (the legacy
  OpenAI privacy check is not called, and a report is never in its input);
- Google Gemini first receives only a deterministically screened,
  de-identified population-level research target, any BCP 47 language tag
  with its English language name, and the public
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

## Findings library

Owner decisions Q9 to Q11 (2026-09-30): free AskRigor use is reciprocal, so what
AskRigor learns from free research is saved. When `finalize_research` checks a
free contributor account's answer, the server saves that answer's checked
findings card to a private review queue, with nothing asked of the user, and
the answer ends by naming the saved card's `ARF-####` id. A paid-private answer
whose findings rest on work a quick answer cannot do ends by offering the save,
and a card is saved only when the user accepts saving it for that answer,
through the connector's `save_research_findings`. The owner reviews every card
before it is accepted.

Owner answer 156a (2026-10-22): the library feeds the Atlas, which holds what
other people would benefit from, not every answer better than a quick one. So
the AI declares on each card whether its findings would help anyone beyond the
person asking (`public_value`, below). A card declared `personal_only` is
checked like any other but neither saved nor offered: a free contributor's
result says it was not saved (`saved.reason` `personal_only`) and its answer
ends with no saved line for it; a paid-private answer offers no save for it,
and so no research map either, since the map is asked for only in the card's
offer sentence; and `save_research_findings` refuses it even when the user
asks. The rest are saved or offered as before. Whether findings would help
other people is the model's declaration, by the owner's four-part test in the
field's description (other people face it, it was checked here, it could change
what someone does or believes, it adds something to well-known guidance); the
server checks only that the declaration is made and complete, and the owner
judges it in review.

It is live since 2026-10-01 (20:19 UTC). The owner approved the wording of the
in-app free contributor notice (in the code), `https://askrigor.com/privacy`
and `/terms` on 2026-09-30; the two pages took it, with that day's effective
date, when the library went live (2026-10-01, 20:18 UTC).

The free contributor notice's second version, `free-contributor-v2-2026-09-30`,
said each finished research answer's findings card is saved. A free account
that accepted `free-contributor-v1-2026-09-01` was shown as not yet enrolled,
and research tools refused it (`RESEARCH_ACCESS_REQUIRED`), until it accepted
v2. Migration `0011_research_use_notice_v2` let the account table hold either
version.

The notice is now version `free-contributor-v4-2026-10-25` (owner answer 171,
2026-10-25; exact wording approved, built, not yet released). All other v3
sentences stay, and the three changed sentences are:

> Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked "Not checked by supervisors yet" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.

> If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor's owner has already accepted its findings; no reason is needed.

> An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify anyone.

A free account accepting v1, v2 or v3 is shown as not yet enrolled, and research
tools refuse it until it accepts v4 through `manage_research_access`. Migration
`0020_research_use_notice_v4` widens 0011's same-named check to all four versions;
the service admits only the current one. The account stores the version and
agreement fields as before. The privacy page and terms carry the approved
free/paid publication distinction and comments paragraphs. Their effective
dates are left for the release. This slice implements consent only; the
publication and interaction storage is built separately under
`docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md`.

An image rollback below v4 first runs
`infra/living-evidence-production/research-use-notice-v4-hold.sql`. Each v4
account row is copied unchanged into `research_use_notice_v4_hold`, and the
account is marked revoked so the earlier image can read it and the person can
accept its notice. `research-use-notice-v4-restore.sql` restores accounts still
exactly in that state only once an image reading v4 serves, then empties the
table; changed accounts keep their newer rows. Only the migrator can read the
hold table, which stores no new kind of data and is empty outside rollback.
Neither script changes settings, entitlements, proposals or Atlas rows.
The v3 hold/restore pair remains for a target reading only v1 and v2, with
`research_use_notice_v3_hold` under the same privacy boundary. The v4 Docker
acceptance mirrors v3 and preserves both earlier versions and v3 accounts.

An image rollback to a version that reads only v1 also runs
`infra/living-evidence-production/research-use-notice-v2-hold.sql`. It copies
each v2 account row, unchanged, into `research_use_notice_v2_hold` and marks
the account revoked, so the earlier version reads it and the person can accept
v1 again. `research-use-notice-v2-restore.sql` puts back each account still in
that state once a v2 version serves, and empties the table. The table holds no
new kind of data, only the migrator role can read it, and it is empty except
during such a rollback.

The library is closed unless `ASKRIGOR_FINDINGS_LIBRARY` is set to `enabled`,
which the owner does once the wording is live and the private repository
exists. While it is closed, `finalize_research` needs no card, checks none and
saves none.

What the model sends, and when:

- In `finalize_research`, with `answer_draft`, a `findings_card`, which a free
  contributor's answer needs: the question in general terms (at most 300
  characters), what a quick ordinary answer would say (400), one to five
  findings, each with a claim (500), certainty, whom it applies to (300), one
  sentence copied from the answer (`answer_quote`), one to ten source
  identifiers (DOI, PMID, PMCID or YouTube video id; no tool verifies an NCT id
  yet, so a trial is cited through its paper), why the usual answer misses it
  (300), allowlisted tags and what would change it (300), whom the findings
  would help (`public_value`: `scope` `public`, with who else faces them,
  `who_else`, at most 300 characters, and what they could change for those
  people, `what_it_changes`, 300, both in general terms with no personal
  details; or `scope` `personal_only`, whose other two fields are not used),
  and up to six open leads (200 each). Optionally, the model name as the app
  reports it (`reported_model`, at most 80 characters). The gate checks the
  card against the answer and that call's verified sources, and that it
  declares `public_value`, with both fields when public. A rejected card is
  reported and not saved; it never holds back the answer. A card without
  `public_value`, as from an app whose tool list predates it, is rejected the
  same way. A checked card's SHA-256 digest is signed into the finalization
  receipt, a personal-only one's too; for a paid-private account a checked
  public card one of whose findings rests on work a quick answer cannot do
  (below) also adds the sentence offering its save to the caveats the answer
  must carry. For a caller with no research account the card is neither
  checked nor saved (`private`).
- Atlas phase 3 (built, not yet released; design
  `docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md`), in the same
  card, the fields the public Atlas pages need. Each finding gives its kind
  (`effect`, `harm`, `overlooked_option`, `correction`, `nothing_found` or
  `tested_vs_sold`), its subject (what it is about, as people know it, at most
  120 characters) and the subject's type (one of eight, such as `supplement`),
  its direction (`benefit`, `harm`, `no_effect`, `mixed` or `descriptive`), its
  numbers block (each two-group yes-or-no figure its claim gives: the outcome
  and which way is better, each group's name, events and total, the follow-up,
  and any number needed to treat or harm; at most 20, in `binary_results`' flat
  shape without its quotes), and, for a search that found nothing, the searches
  it made (each the database, `pubmed`, `europepmc` or `ctgov`, its exact
  query, at most 5,000 characters, as the search tools take, and, for a search
  restricted to publication dates, that range as the search took it, which
  PubMed and Europe PMC take and ClinicalTrials.gov does not; at most 10). The card gives its topic (a key
  in the Atlas's topic format and a label, at most 200 characters). The final
  check requires them on a card declared public, and checks only what is
  exact: each count is at most its group's size; each rate and number needed to
  treat or harm, worked out from the counts, is what the claim states, in
  digits of any script, with the harms over the same follow-up beside a number
  needed to treat; each figure is one that the call's `binary_results` gives;
  each search is one a `literature_search` receipt of that call verifies (its
  database, the digest of its query and its date range, or none when the search
  had none); searches go only with a search that
  found nothing, whose direction is `descriptive` and whose sentence is an
  `absence_claims` entry of state `support_not_located`, and a finding whose
  sentence the answer declares only in that state is such a finding. The kind, subject,
  direction and topic are the model's declarations, taken as given. A public
  card without them, as from an app whose tool list predates them, is rejected
  like one without `public_value`, and the answer goes ahead. Each new text
  passes the same privacy screen as the card's other texts, the topic's key
  included: since the Atlas keeps a topic's key for good, the screen reads it
  as the key followed by its words (each `.` and `_`, and each dash not between
  two digits, read as a space), so a joined token such as `555_867_5309` shows
  what it holds. In a search's query, and only there, a PubMed record number
  (up to nine digits written straight before `[uid]` or `[pmid]`, continuing
  no other number) is set aside as `PMID 40123456` is in any text, so a search
  for records by their numbers is not read as a phone number. The sentence on what
  communities reported that the pages may one day show (owner decision 4a) is
  not collected: no schema accepts it, and nothing stores it.
- In `save_research_findings`, only after a paid-private user says yes to that
  offer, or to a save they asked for: the same card, that finalization receipt,
  the literal consent `yes_to_this_save`, and optionally the model name as the
  app reports it.

What the server derives for each finding of a checked card (owner answer 139c,
2026-10-20), from fields the card already has and the receipts of the same
call, with no new input: its verified bases, work a quick answer cannot do.
`full_text_audit`: one of its sources has a study or review method-audit
receipt in that call. `comment_audit`: one of its sources is a video whose
comments that call's audits read. `bounded_absence`: its sentence is an
`absence_claims` entry the check accepted. `research_correction`: its sentence
is a `corrections[].change` that the research found (`by_user: false`). Each is
an exact comparison, the same in any language; they show depth, not that a
finding is better, which stays the model's `why_not_usual` for the owner's
review. The finalization receipt signs them with the card's digest, one list
entry per finding. A paid-private answer's offer appears only when at least one
finding has a basis, and names what was done with the server's counts, for
example "These findings rest on full-text audits of 2 studies and audited
comments on 3 videos, work a quick answer does not do. If you want them saved
to AskRigor's findings library for review, say yes; nothing is saved
otherwise. Saved findings that AskRigor's owner accepts may be published in
AskRigor's public Atlas, written without you.": counts of studies, videos,
absence claims and corrections, never card text. The last sentence follows the
offer, with or without the map below, so the user hears it before saying yes
(owner answers 159 and 160b, 2026-10-22; built, not yet released, its wording
waiting for the owner's word-for-word approval). With no basis there is no offer line; the receipt still signs the
card, so the user can still ask for the save. For a free contributor account,
once the server's save confirms, the result gives the line the answer ends
with, just before the check line: "Saved to AskRigor's findings library for
review as ARF-0042.", with the card's real id (an occurrence save names the
open card it joined). An unconfirmed or failed save gives no id and no line.
The id is the one a deletion request names.

This research's map (owner answer 143a, 2026-10-21), on the MCP connector only
(`/mcp` and `/mcp/claude`): a paid-private answer's offer asks, in the same
sentence, to file it, so one yes saves the card and files the map: "If you want
them saved to AskRigor's findings library for review, and this research's map
(the searches, the studies found and the leads left open, never this chat)
filed to AskRigor's shared research repository for review, say yes; nothing is
saved or filed otherwise.", followed by the same sentence on the public Atlas.
The finalization receipt then also signs
`map=offered` and a 16-character HMAC, under the receipt secret, that binds the
offer to the account (never the account key). Only after that yes does
`submit_research_contribution` file the map: the same strict deidentified
RESEARCH_FRONTIER proposal a free contributor files, with the literal consent
`yes_to_this_save` and that finalization receipt. The server checks the
receipt's signature, kind, 24-hour age, account binding and offer, and stores
only its SHA-256 with the proposal; the receipt itself is never stored. One yes
files one map. A paid-private account files nothing else. A filed map, in
either mode, returns a `research_map` receipt holding only the account binding
and its issue order; `finalize_research` counts a map filed after the research
began as this research's, and a free contributor's answer then ends with the
line naming what was saved, for example "Saved to AskRigor's findings library
for review as ARF-0042; this research's map (the searches, the studies found and
the leads left open, never this chat) was filed to AskRigor's shared research
repository for review." Free contributors are not asked: when their research
did work a quick answer cannot do and no map of it was filed, the final check
reminds the model to file it under the agreement they accepted.

The account reference (owner question, 2026-10-21): every
`manage_research_access` call returns the caller's own reference, the first 12
hexadecimal characters of their pseudonymous account key, so they can give it to
the owner, for example to be listed as a dev account. It is derived on each
call, never stored or logged, names no one and opens nothing; no call shows
another account's reference.

What the server checks before it saves: that the caller's OAuth token belongs
to an active research account (a free contributor under the current notice, at
the final check, or a paid-private account, through `save_research_findings`
after the user's yes); the receipt's
signature, kind and 24-hour age, and that it signed this exact card; that the
card declares its findings public (a `personal_only` card is refused as
`personal_only`, and a card checked before the declaration was asked for as
`public_value_missing`, to be checked again; neither consumes the rate limit);
the lesson queue's deterministic privacy screen over every text field, the
declaration's included (with study and
video identifiers, links to their pages, statistics-shaped numbers and in-word
apostrophes set aside first); sources by their form; and a rate limit of its
own (20 cards an hour and 100 a day per server process; later cards are not
saved). A model name that does not read as one is left out. There is no model
or API call on this path. Anything that fails is not stored, and the answer
goes ahead; a save that has not finished within ten seconds is reported as
unconfirmed, and the answer goes ahead while it completes.

What is stored, and where: one issue in the private GitHub repository
`u-dont-existDOTcom/AskRigor-findings` (or the repository named by
`ASKRIGOR_FINDINGS_REPOSITORY`, under the same owner), reached through the
lesson queue's GitHub App with a token scoped to that one private repository.
The issue holds the question as its title, the labels `findings-card` and
`pending-review` (and `beyond-quick-answer` when a finding has a verified
basis; an open card gets it too when a later save of the same findings with a
basis joins it), a readable copy of the card, and a JSON record: the card, its
SHA-256, and the server's version stamp. The stored card keeps its public-value
declaration (`public_value`: who else faces the findings and what they could
change for them, with no personal details), which the readable copy shows under
"Public value" for the owner's review; a later save that joins an open card
shows its own declaration in its comment. Each stored finding also keeps its
verified bases (`verified_bases`, the four values above, as the receipt signed
them; none from a receipt that signed none). From Atlas phase 3 the stored card
also keeps its topic and each finding's kind, subject, subject type, direction,
numbers block and searches as the checked card gave them, each text through the
same YouTube stripping as the others, and the readable copy shows them under
each finding and the topic at the top; a card saved before them has none. The
stored card holds no YouTube video
ID or link: a link keeps its text. It also holds no finding drawn from YouTube
comments (a YouTube video among its sources, `community_checked`, or a comment
audit among the bases its receipt signed): on 29 August 2026 the owner told
YouTube that AskRigor stores no YouTube-derived records until YouTube
clarifies, so such a finding is left out whole, and a card whose findings all
rest on YouTube comments is not saved as a card (`youtube_findings_only`; owner
answer 170, 24 October 2026). `stored_without` records what was left out; the
SHA-256 is still the checked card's. Each finding left out of a saved card is
held apart from the card, in the database, for the owner's review, and so are
the findings of a card not saved as a card, with its question and topic (held
YouTube findings, below; owner answer 173, 25 October 2026). The save's result
then says so: "Not saved as a card: its findings all rest on YouTube comments,
which AskRigor keeps only for its owner's review." A finding may still summarize what other public
communities reported, without posts, commenter names or links. The version stamp holds the
save time; the AskRigor version and build commit, or `unknown`; the HRP and
Universal names, versions and SHA-256; a SHA-256 of the tool catalog; the
endpoint, `/mcp` or `/mcp/claude`; the model name as reported, marked
unverified; and the research depth, status, finalization time and receipt
counts the receipt signed. A hidden marker holds the duplicate fingerprint (a
SHA-256 of the normalized question and claims), a SHA-256 of the finalization
receipt, used only to make a retried save write nothing new, the save time, and
the research thread: an HMAC, under the server's receipt secret, of the
pseudonymous account key and the research target's 12-character digest. From
decision 171 (built, not yet released) a new card's marker also says, as `true`
flags with nothing else, whether the saving account's card is published in the
Atlas as soon as it is saved (`atlas_publish`: a free contributor under the
current notice, not a dev account) and whether the save was made in paid private
mode (`paid_private`), whose findings are published only after the owner accepts
them (Atlas publications, below); it never holds the account, its mode's other
settings or its notice version. A later
save of the same question and claims from another thread, while the card is
open, adds a comment with its own record and stamp instead of a new issue; the
same thread reaching the same findings again adds nothing. A thread's new card
replaces its earlier open cards: each gets a comment naming the new card and is
closed as not planned, unless it also holds another thread's save or a comment,
when it stays open for the owner. The thread key cannot be reversed without the
server's secret, and one account's threads on different research targets do
not match.

Held YouTube findings (owner answer 173, 25 October 2026; built, not yet
released; the privacy page's paragraph is the owner's wording of 25 October).
Each finding drawn from YouTube comments that a saved card leaves out is kept
apart from the card, for the owner's review, and never refreshed. A card whose
findings all rest on YouTube comments is not saved as a card, and its findings
are kept the same way, with no card. They are kept until deleted: the owner's
rule, 25 October 2026, is "don't delete the summaries unless YT tells us to do
that".

- What: for each such finding, only what AskRigor wrote, each in a column of its
  own: its claim, certainty, whom it applies to, why the usual answer misses it
  and what would change it, its kind, subject and direction when the card
  declared them, and its tags and verified bases (fixed values), with the card's
  `ARF-####` issue number, the checked card's SHA-256, the finding's place on
  that card, and the save time. For a card not saved as a card there
  is no issue number: its findings are named by the checked card's SHA-256 and
  their place, and keep the card's own general wording of the research question
  (at most 300 characters) and its topic's key and label when it declared one,
  which passed the same privacy screen. A link in its texts keeps its words
  (a YouTube link reads "(YouTube video)", any other bare link "(link)"), and a
  video ID of the card's sources reads "(video)". Never its sources (YouTube
  video IDs), any link, the answer quote, the contributor or thread key, or any
  comment text, name, channel, comment or video ID: there is no column for them.
  The privacy screen the card passed covers the texts; a name or a comment's
  words written into the summary itself cannot be told apart exactly beyond it.
- Where: the private PostgreSQL table `held_youtube_findings` (migration
  `0019_held_youtube_findings`) in the living-evidence service, never the
  GitHub card. The research server writes it at the save, in the background,
  through the research-access role; a held store that fails never fails or
  delays the save, and the findings are then not kept. The review role reads,
  deletes and holds the findings moved out of cards stored before. Both reach it
  only through six security-definer functions; the public reader and every
  other role are refused, the reader's default-privilege SELECT included.
- Who sees them: only the owner, in the owner-only review tool: `inspect_finding`
  on a card lists its held findings with the day each was saved, and
  `list_youtube_findings` lists those with no card, newest first, 25 saves a
  page (its `nextCursor` shows the next, so every one can be seen), each with its
  question, topic and save day. They are never items of a card, so no decision
  takes one: they are never published, accepted into the Atlas or offered
  anywhere else.
- Deletion: only on request, or if YouTube asks; nothing deletes a held finding
  by its age. The owner deletes a card's held findings with
  `delete_youtube_findings` (with `card`), or those of a save with no card (with
  its `cardSha256`); `forget_card` deletes a card's with the card; and
  `delete_all_youtube_findings` deletes every one at once, of every card and
  every save with no card, only when the call says `confirm: true` after the
  owner said to, as when YouTube asks AskRigor to delete them. A save with no
  card has no `ARF-####` id for a deletion request to name, so its findings go
  on the owner's word. The same findings saved again keep their first save time.
- Cards stored before (owner answer 173: ARF-0007, ARF-0012 and ARF-0209): the
  owner's `move_youtube_findings` holds every one of their findings drawn from
  YouTube comments, each with its own save's time, and then rewrites the card and
  each later save exactly as one saved today without them would read (no card is
  changed unless the database holds each of its findings first); a later save
  left with no finding is deleted. Owner answer 179a: when the card and every
  later save have only findings drawn from YouTube comments, all are held with
  no card number, each save with its own checked card SHA-256, save time,
  research question and topic (through `heldYouTubeCardTextsOf`). Only after
  every finding is reported held are all issue comments deleted and the issue
  tombstoned and locked, using `forget_card`'s inbox operations: title replaced,
  labels removed, closed as not planned. The existing forgotten marker records
  only that issue number in `cards`, the removal time in `forgotten_at`, and
  `reason: "youtube_findings_held_without_card"`; it holds no card wording,
  digest or contributor/thread key. Card reads and listings treat it as gone.
  The owner deletes the issue in GitHub to remove its edit history too, as the
  reply instructs. A retry holds no duplicates and finishes an unlocked
  tombstone; no migration is needed. It changes nothing if any save cannot be
  read, a later save has a finding to keep when the whole card would go
  (`later_save_kept_findings`, naming its comment), or a decision names a
  finding the move would remove or renumber (any finding when the whole card
  goes). It also changes nothing if the card has any
  publication, including withdrawn ones, unless that publication's card was
  forgotten; publications also name findings by place. GitHub keeps each rewritten
  card's earlier text in its edit history until the owner deletes those revisions,
  as the reply lists them.

What is never stored: the chat, the answer beyond each finding's one quoted
sentence, the research target or its digest, the account key, the receipts
themselves, comment or caption text, commenter identities, the user's OAuth
subject, email or network identity, any upload, and any card declared personal
only, which reaches only the call that checks it. `finalize_research` reports
only whether the card was saved and its `ARF-####` id, with the line naming that
id that the answer ends with, never the issue number, link, card text or
fingerprint. Because a stored card carries no account
identity, revoking research access does not withdraw it; its deletion is
requested with its `ARF-####` id.

Deleting a card (owner answer 159, rule 7, as notice v4 and the public pages
say it; owner decision 7): a request names the card's `ARF-####` id and needs no
reason; asking why is optional. Under v4 the card also leaves the Atlas unless
its findings were already accepted. It removes the card and everything that ties
it to the person: the stored issue, with its readable copy, record, version stamp
and hidden marker, which holds the research thread key, the person's later
saves on other cards, and the owner's decision rows on the card. What stays is
only what is written without the person: a finding from the card that the
owner has accepted for the public Atlas stays while it is valid, is corrected
or taken down when someone shows it is wrong (a request that says why is
reviewed as a correction), and is rewritten or removed if it could identify
anyone (wording erasure, below). The owner's findings actions (below) are built
but closed until the owner opens them (`ASKRIGOR_ATLAS_REVIEW`); while they are
closed no finding can be accepted, and the owner deletes the issue by hand.
Once they are open, the owner's `forget_card` does the rest (below), and the
owner then deletes the stripped issues in GitHub.

The living-evidence and frontier stores hold no YouTube identifiers while the
YouTube compliance review is open, and neither does this library.

Cards have no automatic expiry: they stay in the private repository until the
owner deletes them. GitHub processes the stored issues under its own policies.
Until the private repository exists and is added to the App's installation, a
save answers that the library is unavailable and stores nothing.

## Atlas findings: owner review

Owner answers 159 and 160b (2026-10-22), Atlas phase 2 design
(`docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md`): the owner accepts
saved findings into AskRigor's evidence database, from which the public Atlas
pages will be built. The actions are on the owner-only
`review_research_contribution` (OAuth `cases:review` and the allowlisted owner
subject): `list_findings`, `inspect_finding`, `accept_finding`, `edit_finding`,
`reject_finding`, `withdraw_finding`, `link_findings` and `forget_card`, and for the
held YouTube findings (above; owner answer 173) `list_youtube_findings`,
`move_youtube_findings`, `delete_youtube_findings` and
`delete_all_youtube_findings`, with each card's held findings listed on its
`inspect_finding` view. They are closed unless
`ASKRIGOR_ATLAS_REVIEW` is `enabled`, which the release sets once migration
0017, the review role's grants and the promotion timer are verified; while
closed they answer `atlas_review_closed` and read and record nothing. Until
decision 171, nothing from a card is public until the owner accepts it; from it
(built, not yet released), a card saved in free contributor mode is published
as soon as it is saved, marked not checked by supervisors yet, and a paid private
card's findings only after the owner accepts them (Atlas publications, below).
Nothing is shown until the Atlas pages exist. The owner's call never writes canonical evidence: it
records a decision and a hash-bound intent through the review role's
functions, and the existing one-shot timer job writes the canonical rows within
about 5 minutes.

What the owner's call reads, for that call only: the card and its later saves
(occurrence comments) from the private findings repository, through the same
GitHub App; the review store's decisions and intents; the canonical Atlas
through the public runtime's read-only reader; and, for each source a finding
keeps, its public record and retraction status from Crossref, PubMed, Europe PMC
or ClinicalTrials.gov, with the provider tools' own calls and settings. Only the
identifier is sent to a provider. A complete source check is kept in process
memory for 10 minutes, so the accept binds what the inspect showed; nothing else
from the call is kept beyond what follows. The checks are exact: which save of
a card a finding comes from and whether it has a verified basis, community
evidence under decision 4a (a finding with no DOI, PMID, PMCID or NCT source is
refused, and one that also rested on audited comments needs the owner's confirm),
the numbers the AI declares against the wording, the providers' records and
retraction notices (a retracted source is bound as context only, after the
owner's confirm), the privacy screen and a guard against any card reference
(`ARF-` and four digits or more, as a card's id is written, so a gene such as
ARF-6 passes) over every text an intent would store (from Atlas phase 3 the topic's key too,
read as words as at the final check), the exact re-check key, and the rules for
links. The topic, the numbers and the links are the AI's declarations; the owner
accepts or rejects. From Atlas phase 3 (built, not yet released) a card's topic,
numbers block, kind, subject, subject type and direction are used by default,
and the owner changes any of them in the call; a card saved before them needs
the AI to declare them at acceptance (the kind, subject, subject type and
direction as flat `kind`, `subject`, `subjectType` and `direction` fields). The
code checks only what is exact: all four are present on an accepted finding,
and a correction keeps all four or none; a search that found nothing has
direction `descriptive`; and its searches come only from the card, as the final
check bound them, and are kept only while its kind stays `nothing_found`.

- **Decisions** (`atlas_card_decisions`): the card's issue number, the item
  number, the decision, the F number it took, the SHA-256 of the card record
  and its later saves as the owner inspected them, the owner's private reason
  (always for a rejection, optional otherwise) and the time. They are the only rows that name a card. They are kept
  until the card is forgotten (`forget_card`, decision 7), which deletes them,
  the owner's private reasons with them. The reader role can read them, as it
  can read every table today.
- **Intents** (`atlas_finding_intents`): the accepted texts (the question, the
  wording, whom it applies to, the card's usual answer, why the usual answer
  misses it, what would change it, and its public-value declaration's who-else
  and what-it-changes), its certainty, tags and verified bases, the numbers the
  AI declared, each kept source's identifiers with its check (provider, title,
  year, retraction status and notices, the owner's confirmation, a SHA-256 of
  the provider responses and the check time), the topic key and label, two
  wording keys (SHA-256 of the normalized question and claim, as found and as
  accepted), the version stamp (AskRigor version, build, protocol names,
  versions and SHA-256, research depth and status) and the research day. From
  Atlas phase 3 the accepted content also holds the finding's kind, subject,
  subject type and direction and, for a search that found nothing, its searches
  (each database and query, with its date range when the search had one); an
  intent queued before it holds none. A
  correction or edit holds the new version's texts, numbers and sources the same
  way, with its public note; a withdrawal and an unlink hold their public note; a
  link holds its relation, what the two findings disagree on and its rationale;
  the last three hold the AskRigor version, build and protocols that recorded
  them. Beside a later change's payload, never in it, the row keeps the owner's
  optional private reason. Each row also keeps its status, the writer's receipt
  or refusal code, the retry it answers and its times. An intent never holds a
  card reference. Its texts are erased with the finding's (wording erasure,
  below); an erasure intent holds only the F number, the version it was decided
  against, its scope, the reason code `could_identify_a_person` and the
  AskRigor version, build and protocols that recorded it.
- **Canonical Atlas records**: general knowledge written without the person,
  append-only; kept while valid, corrected by new versions, and withdrawn by an
  invalidated version; their wording is erased only on the path for findings
  that could identify someone (below). From Atlas phase 3 (migration
  `0018_atlas_card_fields`) each version also keeps its kind, its subject's type
  and its searches in three nullable columns of `atlas_finding_versions`, its
  subject in the claim model's `claim_versions.program_or_exposure` and its
  direction in `claim_versions.direction`; the claim's type
  (`claims.claim_type`) comes from its first version's kind. A version written
  before 0018 has none of them.
- **Wording erasure** (`eraseWording` on `edit_finding` and `withdraw_finding`;
  decision 7, choice 4a): when the owner judges that a finding's wording could
  identify a person, `edit_finding` with new general wording records a new
  version and the erasure of every earlier version's wording, in one
  transaction (the new version keeps a search that found nothing's searches
  with their databases, date ranges and research day, each query set to the fixed marker,
  since a query can identify a person as a wording can; Atlas phase 3), and
  `withdraw_finding` records the withdrawal and the erasure of
  every version's wording, the withdrawal's note included, which leaves the
  finding "withdrawn, wording removed" with its date; a finding withdrawn before
  can be erased the same way. The promotion runner applies each erasure as it
  applies any intent: it writes one `atlas_redactions` row per version erased
  (the finding, the version, the reason code, the time and the run) and then
  calls `erase_atlas_wording()`, the only function the append-only guard lets
  change a canonical row, which sets to the fixed marker `[wording removed]`:
  the version's claim texts (its subject among them) and its Atlas texts (the
  usual answer, why it misses, what would change it, who else and what it
  changes), the text labels of its numbers (outcome, option, comparator and
  follow-up; the counts, totals and directions stay), the query of each search
  that found nothing (its database and date range stay; Atlas phase 3, migration 0018), and
  the notes of its change records; its two wording
  keys, set to 64 zeros; the rationale of every link that touches the finding
  and the note of each such link's withdrawal; and the finding's question, only
  when no research frontier asks it and every other finding that answers it has
  had all its wording erased (a question still in use stays, and the owner's
  call names the F numbers that use it). Topic keys and labels are never erased
  (both are screened before they are stored), nor are a
  version's kind, subject type and direction, which identify no one. In the
  same transaction the runner sets the same texts to the marker in every intent
  it has finished with that names the finding (the earlier accept's and
  corrections' texts and wording keys, notes and link rationales, and the
  question when it went), keeping the payload of the correction that made the
  new general version, and records when (`texts_erased_at`); a pending intent
  keeps its texts until it is applied. A `wording_removed` change record dates
  the erasure without any text. The erasure itself holds no card reference, so
  the runner cannot tell which cards still hold the original wording: the
  owner's call names them (cards with a decision on the finding, and open cards
  whose wording keys match the erased ones) and suggests `forget_card` for
  each, and `inspect_finding` repeats it.
- **Forgetting a card** (`forget_card`, decision 7): the owner names the card's
  `ARF-####` id; no reason is needed. The call first reads the private findings
  repository: the person's cards are the named card and every card, open or
  closed, whose hidden marker holds the same research-thread key (the thread's
  earlier, replaced cards among them), plus any card a tombstone of an earlier
  call lists; the person's later saves are the occurrence comments with that
  key on other cards. Everything is read before anything changes: a later save
  on the person's cards that does not read as the library saved it stops the
  call with nothing changed, and so does a named card holding later saves from
  other research threads until the owner confirms (`confirm: true`), because
  those savers were told the card's id too. Then it deletes the person's cards'
  decision rows (`forget_atlas_cards`), and, within the GitHub App's
  `issues: write`, re-files each other person's later save on the person's cards
  as a card of its own (a new issue with that save's record and stamp, whose
  marker notes the forgotten card it came from), deletes the person's later
  saves on other cards, and, the named card last, deletes each of the person's
  cards' comments, replaces its title and body with a tombstone (a hidden
  marker listing the cards forgotten together and the time, nothing else),
  removes its labels, closes it as not planned and locks it. The reply names
  the F numbers that came only from these cards and those also accepted from
  other cards, all of which stay in the Atlas while valid, and asks the owner to
  delete each stripped issue in GitHub, which also removes its edit history
  (choice 5a: the App cannot delete issues). Calling again checks GitHub: when
  every issue answers 404 or 410 and no decision row names the card, the reply
  is `card_forgotten`; until then it is `card_forget_waiting_for_owner`, linking
  each issue still there. A call that fails part way is resumed by calling
  again; nothing done is redone.
- **GitHub additions**: each decision as a comment on the card, such as
  "Finding 1: accepted as F-1007, checked, 4 Nov 2026.", with a hidden marker
  holding the item, the decision, the F number and the time, never the owner's
  reason; the `reviewed` label in place of `pending-review` once every finding
  of the card has a decision, when the card is also closed as completed. A
  GitHub write that fails is redone, matched by its marker, on the next inspect
  or list. `forget_card` removes these with the card (above).
- **Never stored in the Atlas**: the account, the research thread key, the
  finalization receipt or its hash, and the duplicate fingerprint; the `ARF-`
  number outside the decisions table; save times, the reported model, the
  surface and the tool catalog hash; the answer quote, YouTube video IDs or
  counts, the comment-audit basis and community text, including the sentence on
  what communities reported (owner decision 4a), which no schema accepts.
- **Stated limits**: a person must name each `ARF-` id they want deleted,
  because their other cards cannot be found from the account alone. The privacy
  screen reads English for some patterns, as it does for cards. A card's record
  is read as GitHub holds it: the hidden marker binds its question, claims and
  save time, and a card stored whole binds every text, source and tag to the
  digest the final check signed, but its verified bases and version stamp are
  as GitHub holds them. An intent the writer refused stays in `list_findings`
  until the owner sends a corrected one, which is recorded as its retry.
  Forgetting finds the person's other saves only through the named card's
  research-thread key: saves from the person's other research threads are
  found only when they are named too. A card whose marker holds no thread key
  (saved before thread keys existed) is forgotten alone. GitHub keeps a
  stripped issue, with its edit history, until the owner deletes it; once the
  owner has deleted every tombstone, a later call for one of the cards can list
  only that card. Erasure replaces wording in the live rows: PostgreSQL keeps
  the earlier row versions in its data files until vacuum reclaims them and in
  its write-ahead log until it is recycled, and the database has no automatic
  off-host backup to hold them. `edit_finding` does not change a version's usual
  answer, who-else or what-it-changes texts, so a new general version keeps the
  earlier version's. When the question is erased, the kept version's accepted
  wording key is still a SHA-256 over the original question with the new
  wording. A search's query must match its receipt, so it cannot be reworded: a
  query the privacy screen refuses at acceptance keeps its finding from being
  accepted as a search that found nothing. During an image rollback below Atlas
  phase 3 the owner's Atlas actions stay closed, since the earlier image would
  leave a nothing-found finding's subject and queries in its intents if it
  erased one (`infra/living-evidence-production/README.md`).

## Atlas publications

Decision 171, section 4B (owner answers 168a and "171 approved", 24 October
2026; plan `docs/superpowers/plans/2026-10-25-171-atlas-publishing-votes-comments.md`),
built, not yet released: the findings of a card saved in free contributor mode
are published in the Atlas as soon as the card is saved, one publication per
finding, marked "Not checked by supervisors yet" until the owner reviews them.
The pages (section 4C) are built, not yet released, and switched off until
`ASKRIGOR_ATLAS_PAGES=enabled`; the bullet "The pages" below covers them.

- **What is published, and when.** Right after a confirmed save, without the
  answer waiting for it, the server publishes the card's findings when every
  exact check holds: the card was saved in free contributor mode by an account
  whose accepted notice is the current one (`RESEARCH_USE_NOTICE_VERSION`) and
  which `ASKRIGOR_DEV_ACCOUNT_KEYS` does not list; the card does not carry the
  `set-aside` label; and it declares its findings public. A finding drawn from
  YouTube comments (a YouTube video among its sources, the `community_checked`
  tag or a comment-audit basis, the rule the save applies, which also covers
  cards saved before it) is never published. A finding whose published text
  holds contact details (an email address, a phone number or a messaging handle,
  by the structural check in `apps/research-mcp/src/atlas/contact-check.ts`), a
  findings card's number (`ARF-` and four digits or more) or a YouTube link is
  held: stored with the state `held`, shown nowhere, waiting for the owner. A
  later save joining an open card publishes nothing of its own, and a retried
  save publishes nothing twice. Publishing at a save happens only while the
  owner's Atlas actions are open (`ASKRIGOR_ATLAS_REVIEW`), so the owner can
  always unpublish or set aside what was published.
- **What a publication holds** (`atlas_publications`, migration
  `0021_atlas_publications`): a public number (`P-1001` onward, from its own
  sequence, never derived from an `ARF-` number); the card's issue number and
  the SHA-256 the final check signed of the card with the finding's place on it,
  kept apart from the published fields, for moderation and so that publishing
  is idempotent; the published fields, projected from the stored card: the
  card's topic (key and label); the finding's claim, certainty, whom it applies
  to, kind, subject and its type, direction, numbers block (each group's counts
  and the follow-up; rates, the number needed to treat and the number needed to
  harm are worked out when the pages render, so the card's are not kept), the
  searches of a search that found nothing, its source identifiers, why the usual
  answer misses it and what would change it; its verified bases; the day the card
  was saved; and the AskRigor version from the card's stamp. Then its state
  (`unreviewed`, `accepted` with its F number, `edited`, `rejected`,
  `withdrawn` or `held`), why it is held (the kinds found, never the matched
  text) or withdrawn (`card_forgotten`, `card_set_aside`, `owner_unpublished`
  or `card_replaced`), the owner's private reason for unpublishing it, and its
  times. A publication never holds the `ARF-` number in its published fields,
  the account or contributor, the research thread key, the answer quote, the
  surface, the reported model, the build, the receipts, YouTube video IDs or
  counts, or anything from the public-value declaration. The rows are written
  only through six functions of the research review role; the reader role can
  read every column, as it can read every table today, and the pages read only
  the published fields, the public number, the state, the F number and the
  dates.
- **Who changes them.** The owner's `accept_finding` moves a finding's
  publications to `accepted` with its F number, `edit_finding` before or after
  acceptance to `edited` (the pages then show the Atlas finding the F number
  names, in its latest version), and `reject_finding` to `rejected`, which takes
  them off the pages; a move a decision's own call could not make is made on the
  next read of the card. `unpublish_finding` withdraws one by its number, with
  the owner's private reason; `set_aside_cards` labels cards `set-aside` in the
  private repository and withdraws their publications, and `list_findings` then
  leaves those cards out unless asked; a later save of the same research thread
  replacing a card withdraws that card's publications not yet reviewed; and
  `publish_cards` publishes cards the owner chooses (the owner's own research
  saved before publishing began, or a card whose publishing at its save did not
  complete, which `list_publications` lists), the owner's choice being the
  consent for the owner's own cards, so the notice and dev-account checks do not
  apply; it never publishes a card whose marker says it was saved in paid
  private mode, and it publishes again what was set aside, replaced or
  unpublished. Accepting or editing a finding whose card has no publication of
  it (a paid private card, whose findings are published only after the owner
  accepts them, or one of the owner's own older cards that `publish_cards` has
  not published) publishes it in that state, with the card's published fields,
  which its page does not show; a set-aside card and a finding drawn from
  YouTube comments stay unpublished, a finding with a publication in any state
  (withdrawn or unpublished included) gets no other, and a rejection publishes
  nothing. Every action is owner-only, on `review_research_contribution`,
  under the Atlas actions' switch.
- **How they are removed.** Deleting a card (`forget_card`, decision 7, as
  notice version 4 words it): every publication of the person's cards loses the
  card's digest, and each one not accepted (unreviewed, edited, held or
  rejected) is withdrawn with its published fields erased and the owner's
  private reason gone; an accepted one stays, as the card leaves the Atlas
  unless the owner has already accepted its findings. Erasing a finding's
  wording (`eraseWording`, decision 7) erases the published fields of every
  publication that names its F number, whatever its state. A withdrawn
  publication keeps its number, card number, finding place, state, reasons and
  times, so its number is never reused.
- **The pages** (section 4C, `apps/research-mcp/src/atlas/`): the research
  server renders `/atlas`, `/atlas/topics/<topic key>`,
  `/atlas/findings/P-<n>` and `/atlas/changes`, which the apex site proxies at
  `askrigor.com/atlas`. They read through the SELECT-only reader role, in one
  read-only snapshot per page, and select from `atlas_publications` only the
  public number, state, F number, published fields and dates of an unreviewed,
  accepted or edited publication: never the card's number or digest, the
  finding's place on the card, the owner's private reason, or why one was held
  or withdrawn. An unreviewed publication shows its published fields with the
  label "Not checked by supervisors yet"; an accepted or edited one shows its F
  number's latest version from the canonical Atlas (its wording, fields,
  numbers, searches and its sources' identifiers), its F number and the day it
  was checked, and nothing of the card's own wording; held, rejected and
  withdrawn publications, one whose F number the timer has not written yet, and
  a finding withdrawn after acceptance or whose latest wording was erased show
  nowhere ("What changed" lists such a withdrawal by its F number, date and
  public note only). Rates and the numbers needed to treat or harm are worked
  out from the counts as a page renders. Links to sources are built from the
  identifiers (DOI, PMID, PMCID, NCT), never taken from a card's text. No page
  shows an `ARF-` number, an account or contributor, an answer quote, a chat, a
  surface or model name, a link's rationale, or anything from YouTube, not even
  a count; a rendered page that holds a script, a card reference or a YouTube
  link is not served. Nothing about a reader who does not sign in is stored,
  logged or set as a cookie: the pages set them no cookie and keep no request
  log; the per-address rate limit holds, in memory only, a counter per address
  (an IPv6 address counted by its /64; at most 10,000, each dropped after 15
  minutes without a request), as the evidence-gap page's does, with the address
  the apex site's proxy forwards from the connection in `X-AskRigor-Client-IP`,
  believed only on requests for askrigor.com that carry the proxy's shared
  secret; and the 60-second page cache holds
  rendered pages that answered 200 for readers who are not signed in, never
  who asked for them. Signing in to
  vote or comment is mapped in "Atlas votes and comments" below.
- **Stated limits.** The contact-details check is structural: a phone number
  written as words, an address spelled out ("name at example dot com"), or a
  plain run of digits with no separator passes it, and a list of numbers spaced
  like a phone number may be held; the card's privacy screen ran on every text
  at the save as well. The card does not record the saving account's mode for a
  card saved before decision 171, so `publish_cards` cannot refuse such a card
  as paid private: it is for the owner's own cards and free contributors' only.
  A publication's card digest matches the finalization receipt the person's
  chat holds until the card is forgotten. PostgreSQL keeps erased row versions
  until vacuum and the write-ahead log recycle them, as for wording erasure.

## Atlas navigation and search

Owner answer 183b: `/atlas/findings` and `/atlas/topics` reuse only the public
publication/canonical fields above. Topic maps add the canonical public question
and unwithdrawn link relations; they never read a private card question or render
link rationale. Shown-publication rules also govern counts, search and map nodes.
No new database table, view, function, grant or migration is introduced.

Search queries (`GET /atlas/search?q=…`, at most 300 UTF-16 code units and 20
words) are request-local input. They are **not stored or logged**, not placed in
an index or cache, not sent to PostgreSQL or a provider, and not associated with
an account, session, address or reader record. The page does not inspect a session
or participant, carries no reader data or tokens, sets no cookie, and uses
`Cache-Control: private, no-store`; the HTML and response use `no-referrer`.
It shows the query only as escaped text and in its GET paging links. The browser
may keep a GET URL in its own history; that is not an AskRigor server record.
Keep proxy request/access/error URL logging disabled or query-redacted as part
of the runbook's page checks. The existing bounded, memory-only address limiter
counts search requests without their query. Other public pages retain their
existing bounded 60-second content cache; no reader identifiers enter its keys.
Search's generic sign-in entry, when enabled, returns to the query-free path.
With participation off the header still has the GET search form.

## Atlas votes and comments

Decision 171, sections 4D and 4E (owner answers 168a and "171 approved", 24
October 2026; design `docs/superpowers/plans/2026-10-25-171-pages-sign-in-design.md`,
sections D and E), built, not yet released, and switched off until
`ASKRIGOR_ATLAS_PARTICIPATION=enabled` with every part configured, the
Atlas's Auth0 application (the owner's step) among them: people who sign in
with an AskRigor account can vote on a published finding and comment on it.
While it is off, the pages show no participation form or sign-in link and keep nothing; the public GET search form remains.

- **Signing in.** The AskRigor login of the apps, through the same Auth0
  tenant, as a regular web application with the authorization code flow and
  PKCE, asking only for `openid`: no email address, name or profile is
  requested. The callback exchanges the code with the application's secret and
  the PKCE verifier, verifies the ID token (signature against the tenant's
  keys, issuer, audience, nonce and expiry) and keeps nothing of it but the
  participant key derived from its subject; the token, the subject, the account
  key and every other claim are dropped at once. Signing out of the Atlas
  clears its cookie; the page then offers a plain link that also signs out of
  the tenant's own login in that browser, which the Atlas does not do by itself.
- **The login cookie** (`__Host-askrigor-atlas-login`, path `/`, 10 minutes,
  HttpOnly, Secure, SameSite=Lax; the `__Host-` prefix keeps any other host,
  a sibling subdomain included, from setting it): the sign-in's random state,
  nonce and PKCE verifier, the `/atlas` page to return to and its expiry,
  encrypted and authenticated (AES-256-GCM). It is cleared at the callback,
  whether the sign-in completes or not, and expires otherwise. So that a
  callback is taken once, the server keeps each used state value in memory
  until its 10 minutes are over (at most 10,000), and nothing else of a
  sign-in.
- **The session cookie** (`__Host-askrigor-atlas`, path `/`, 30 days,
  HttpOnly, Secure, SameSite=Lax), set only at sign-in: the participant key, a
  random session ID that the forms' tokens are bound to, when the reader signed
  in, and its expiry, encrypted and authenticated. Signing out clears it; an
  altered or expired one, or a request carrying two of them, is read as no
  session, and the cookie is cleared; changing the session key
  (`ASKRIGOR_ATLAS_SESSION_KEY_BASE64URL`) signs everyone out. A signed-in
  reader's home, changes, topic and finding pages read it for the header and
  are rendered for them with `Cache-Control: private, no-store` and
  `Vary: Cookie`. `/atlas/account` also reads it and is never cached, whether
  signed in or out; it holds the account controls and links to their own votes
  and comments. Known action notices also bypass the shared page cache.
- **Ended sessions** (`atlas_session_ends`): "Sign out everywhere", and
  deleting everything one holds, end every session signed in before them, in
  every browser. The server keeps, for each participant who did, a SHA-256 hash
  of their key (under its own label, so it is not the key) and when their
  sessions ended, and checks it on every form and signed-in page. A row is kept
  for the 30 days a session can last, by the database's own clock (no caller
  sets the time), and deleted at the first check after them.
- **The participant key**: an HMAC-SHA256, under its own secret
  (`ASKRIGOR_ATLAS_PARTICIPANT_SECRET_BASE64URL`), of the account key the
  connector derives from the same subject (`researchAccountKeyForSubject`). It
  is the only identifier the Atlas stores. No page shows it, and the owner's
  review names a commenter only by a tag (`U-` and 12 hexadecimal characters of
  a SHA-256 of the key). The same person in the apps and the Atlas is one
  participant, but the Atlas tables never hold their research account's key,
  and the research tables hold nothing of the Atlas.
- **A participant's row** (`atlas_participants`, migration
  `0022_atlas_votes_comments`): the key, the tag, the random salt of their
  comments' marks, the display name chosen with the first comment, whether and
  since when the owner stopped them from commenting, and its times. It exists only while it holds a vote, a comment
  or the owner's stop: deleting the last of them deletes the row, display name
  and all.
- **The display name**: up to 40 characters, chosen with the first comment and
  changeable; refused, and not stored, when it holds contact details or a link
  (the structural check of `apps/research-mcp/src/atlas/contact-check.ts`), a
  findings card's number, a text-direction control, AskRigor's own name as a
  word or two words side by side (in any case or width, with accents, or a 0 or
  ø for an o; "Task Rigor" passes, and look-alike letters of other scripts are
  not read as Latin ones) or anything the pages' last check would refuse. Each comment
  keeps the name it was posted with, and shows after it a mark of six
  hexadecimal characters: a hash of the author's participant key, a random
  salt kept in their row (`mark_salt`, drawn when the row is made and again
  when they delete everything) and that name. Two people who chose one name
  get different marks; one person's comments under one name share a mark, as
  their name already shows; a new display name gives a new mark, and after
  deleting everything the mark is new, so it links no comments across a name
  change or a return.
- **Votes** (`atlas_votes`): one `agree` or `disagree` per participant and
  publication, with its time, changeable and withdrawable. Pages show only the
  totals, and to a signed-in voter their own vote; their own page
  (`/atlas/account/comments`) lists every vote of theirs, on findings that
  left the pages too, each with a button to withdraw it.
- **Comments** (`atlas_comments`): a public number (C-1001 onward), the
  publication, the participant key, the display name at posting, the body (up
  to 2,000 characters), the state `shown` or `hidden`, how many reports it has,
  and its times. A comment shows at once if it passes the automatic check for
  contact details (email addresses, phone numbers, messaging handles), links
  (URLs and bare domains) and findings card numbers; one that fails is refused
  with the reason ("Comments can't include contact details or links.") and not
  stored. A finding page shows its shown comments newest first, at most 50 and
  64 KiB of text at a time, with a link to older ones: each comment's display
  name, mark, body and date, never its author's key or full tag. A hidden
  comment shows only to its author, on their own comments page
  (`/atlas/account/comments`), which lists every comment of theirs in any
  state, on any publication, newest first, each with its delete button.
- **Reports** (`atlas_comment_reports`): one per comment and reporter, with its
  time. A signed-in reporter is their participant key (`p:`); anyone else is an
  HMAC of their address (the one the apex proxy forwards; an IPv6 address by its
  /64) under a random salt the server draws for each UTC day and keeps in memory
  only (`a:`), so the address is never stored and, once the day's salt is
  dropped, no secret can trace a stored hash back to it. The owner sees how many
  reports a comment has, never who made them.
- **The owner's actions** (owner-only, on `review_research_contribution`,
  under the Atlas actions' switch): list the newest comments, or the reported
  ones, with each commenter's tag; hide a comment (it leaves the pages and
  stays for the review), show it (back on the pages, its reports dealt with and
  deleted) or remove it (deleted with its reports); stop a commenter, named by
  their tag, from commenting, or restore them; and set the home page's picks
  (`atlas_home_picks`: up to five publications that show, each with the owner's
  public reason, which passes the comments' check).
- **How each is deleted.** A vote: withdrawn by its voter from its finding
  page or their own page, deleted outright. A
  comment: deleted by its author from its finding page or their own comments
  page (hidden, older or on a finding that left the pages included), or removed
  by the owner, each with its reports. Everything a participant holds: "Delete everything I hold
  in the Atlas", on `/atlas/account` while signed in, deletes their votes, their
  comments (hidden ones included, with the reports on them) and their own
  reports, then their row; for a participant the owner stopped, the row keeps
  only the key, tag, stop and times, so deleting cannot undo a stop, and it
  goes when the owner restores them. Reports: with their comment, when the
  owner shows the comment, or when their signed-in reporter deletes everything.
  A display name: replaced when changed, deleted with the row. Picks: replaced
  or cleared by the owner. The cookies: at sign-out, at the callback, or when
  they expire. An ended-sessions row: 30 days after, at the next check.
- **Limits, and no logs.** Per participant, 6 comments an hour (3 at once), 60
  votes an hour and 5 display-name changes an hour; per reporter, 5 reports an
  hour; every request also counts against the per-address page limit; form
  bodies at most 16 KiB. The counters live in memory only, keyed by
  participant key or reporter key (each dropped after two hours without a
  request) and by address (after 15 minutes). Nothing is logged about a
  reader, a voter or a commenter.
- **Stated limits.** Votes and comments on a publication that later leaves the
  pages (rejected, withdrawn or held) stay stored and shown nowhere but on
  their author's own page, until the author withdraws or deletes them or the
  owner removes the comments, and show again if the owner publishes the
  finding again. The contact check is
  structural, with the limits stated for publications above. The reader role
  can read every column of these tables, as of every table; the pages select
  only what they show. PostgreSQL keeps deleted row versions until vacuum and
  the write-ahead log recycle them.

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
- The plain answer a paid private or dev account registers before research (owner answer 140b), and its
  comparison with the checked answer: they reach only the calls that carry them and the answer, and the
  client-carried receipt holds only their digests. The account row keeps only whether the note comparing them is on.
- Provider API keys, deployment credentials, or ChatGPT connection IDs in tracked repository files or MCP responses.
- Full article text, server-side transcript copies, private/deleted/held-for-review content, cookies, private communities, or generic scraped web pages.

The optional lesson path is one narrow durable-storage exception. It stores
only the screened private candidate (with its screened detailed report, only
when the account turned on detailed lesson reports) and anonymous recurrence
metadata listed above; it does not create a transcript store or user profile. The free
contributor findings library, when deployed, is another: it stores only the
checked, screened cards, stamps and thread keys listed above, with no user
profile, and the held YouTube findings listed above, until deleted. The independently
disclosed living-evidence, frontier, participant-intake, research-access, and
pending-proposal stores have their own strict contracts and authority boundaries.

## Response minimization and security controls

- Of 33 MCP operations, 27 are annotated `readOnlyHint: true`. The six
  explicit writes (research-access mode, plain-answer note and detailed lesson reports settings, pending proposal, owner review, lesson
  candidate, `finalize_research`, which saves a free contributor's checked
  findings card, and `save_research_findings`, a paid-private card saved after
  the user's yes) are declared with `openWorldHint: false`, and all but owner
  review with `destructiveHint: false`; owner review is declared
  `destructiveHint: true`, since it withdraws accepted findings and, with
  decision 7, forgets cards (Atlas owner choice 6a). Owner review requires `cases:review`; the others
  require authenticated `research:use`; all ordinary research operations also
  require that scope and an active free-contributor or paid-private mode. The Action-only transcript,
  treatment-landscape, automated Gemini-candidate, and legacy validation routes
  remain read-only; legacy research Actions are omitted whenever OAuth research
  access is active so they cannot bypass the mode choice. The treatment-landscape
  assessor and the automated Gemini scout are also MCP tools; on MCP they sit
  behind the same research-access guard as the other research tools, and the
  assessor accepts videos without transcripts because MCP has no transcript tool.
- The MCP `audit_youtube_video_community` tool returns its analysis sample as
  compact records: comment id, parent id for a reply, a per-video pseudonymous
  author key (the first 8 hex characters of a SHA-256 over a fixed label, the
  video id and the author's channel id, or the comment id when YouTube gives no
  channel id; display names are not unique, so they never key a person), date, likes, an edited
  flag and the text. Author channel ids and display names are not sent to the
  MCP client; the key only lets the model count distinct people within one
  video. Records are cut to a 40,000-byte response budget in the deterministic
  sample order; retrieval counts, corpus hashes and receipts cover the whole
  corpus. The MCP one-call `audit_youtube_community` tool returns the same
  compact records, with one 40,000-byte budget shared by its videos, each
  keeping the same number of records. The Custom GPT Action output is
  unchanged. `search_youtube_comments` results carry
  `absence_inference_permitted: false`, since a query-bounded search says
  nothing about comments that did not match.
- Optional `product_identity` on `search_youtube`, `survey_youtube_community`,
  `audit_youtube_community` and `audit_youtube_video_community` contains exact
  product names, aliases, maker names and other-variant names. Names remain
  request-local: they are not logged, stored or sent to YouTube. Video and
  comment classes and per-video identity counts are returned. Product-aware
  audit continuations carry only the declaration's SHA-256 and cumulative
  class counts; each continuation call supplies the same request-local names.
  Survey and comment-audit research receipts return only the first normalized
  product name (at most 80 characters) and admitted video IDs grouped by class;
  aliases, maker names and other-variant names do not enter receipts.
- `finalize_research` receives `community_findings.product_corpora` (product,
  admitted video IDs, exact and optionally unresolved signal), review-corpus
  `item_identity` counts, `intervention_identity` (applicability or key-study
  labels, source IDs and resolved registry/maker/current-product identity), and
  `shopping` (request state, destination, product offers/URLs/states/roles or
  international routes searched). These declarations and product names are
  request-local and are not logged or persisted; the gate returns consistency
  problems, reporting requirements and caveats. Only the bounded receipt
  product claim described above is returned as a declared product name in a
  research receipt. Declarations do not cause external verification calls.
- `full_text_read` research receipts sign known DOI, PMID or PMCID identifiers
  and the first 16 hexadecimal characters of the document content SHA-256 after
  coverage is exhausted. They carry no document text; finalization verifies them
  with the same signature and expiry checks as study-audit receipts. When
  AskRigor fetched the copy itself, reading and study or review audit receipts
  also sign its public HTTPS URL (`url`, at most 500 characters), the same URL
  the tool returned; a search-index copy the AI supplied and a lead's unread
  candidate URLs are never signed. `resolve_doi` returns the landing page
  Crossref lists as the DOI's registered page (`landing_url`, an HTTP or HTTPS
  URL without credentials, at most 500 characters) and signs it with the
  resolved DOI in a `doi_resolution` receipt. `finalize_research` treats the
  identifiers one receipt names together, and these pages, as the same paper's,
  and compares the answer's links with them for that call only; no URL is
  fetched, logged or stored for this.
  `key_sources.read_depth` records declared reading depth, and `answer_marker`
  records the visible source label (3–80 characters), checked on the source
  link's line without judging its meaning. For a lead, `key_sources.other_route`
  (owner answer 147a) records how the model says it used another full-text tool
  the app has connected: `read`, `unavailable`, `cost` or `none`. AskRigor cannot
  see the app's other tools and sends nothing to them; a study declared `read`
  is reported as read through another tool, not audited by AskRigor. These
  declarations are request-local and are not logged or persisted.
- Public Atlas lookup (`search_research_frontiers`, 26 October 2026) receives bounded query words (300
  characters, 20 words), an optional exact topic key and an optional research target. It reads only the public
  Atlas page reader and stored formal-research plans; the Atlas content is public. No query is sent to an external
  search/model provider. The `atlas_lookup` receipt returns the **normalized words themselves**, not just a digest:
  they can name the user's research topic. It also contains the optional topic key, the usual research-target
  digest (not the target's text), returned public P/F numbers and checked state, the public page origin, fingerprints
  of sources' identifiers and the issue time. The client receives and holds this readable signed token
  and sends it back to `finalize_research`; AskRigor verifies it in memory, expires it after 24 hours, and does not
  persist or log the token or its query words. Atlas and finalization tokens have a 32,768-character ceiling;
  other research receipt kinds retain 2,048. A lookup that could not run signs an attempt receipt marked failed, with
  no findings, which the final check accepts with a stated limit; it is never read as an empty successful search.
  The lookup needs sign-in but not research access: the Atlas content is public, and the stored research plans it
  returns hold research trails, no findings and no personal details.
  `atlas_reuse` sentences and page links are request-local and are not saved. A passing finalization receipt signs
  only the **used public numbers and declared relations**, and the private GitHub findings card and each later save
  retain those pairs as `atlas_basis` for owner review. They contain neither lookup words nor answer sentences.
  `inspect_finding` exposes these pairs to the owner; they do not create canonical Atlas links or expose an account.
- MCP research receipts (`research_receipt`) are HMAC-SHA256 tokens under a
  domain-separated key derived from the finalization signing secret, or else the
  YouTube continuation secret. They carry only public identifiers (YouTube
  video IDs, DOIs, PMIDs, PMCIDs), the public paper pages described above (a
  DOI's registered landing page; the URL of a copy AskRigor fetched), the
  bounded normalized product claim above
  when product identity was declared, completion states, a refusal's fixed
  code for a video not read, counts, the publication dates a literature search
  was restricted to (two dates, no query text), and the issue
  time; never comments or source text. The Atlas-lookup exception below carries query words that may reveal the user's topic. Other receipt kinds carry no questions or user data. Discovery
  receipts (surveys, searches, scouts, one-call community audits) also carry
  `q`, the first 12 hex characters of a SHA-256 over the round's normalized
  search terms, so the gate can tell rounds from different angles apart, and
  `open`, a count of unread result pages or unchecked candidates; the terms
  themselves are not in the receipt. Discovery receipts and treatment-coverage
  receipts also carry `target`, the same kind of 12-hex digest of the research
  target, never the target itself; `search_youtube` uses its optional
  `research_target` only for this digest and does not send it to YouTube. A
  treatment-coverage receipt also carries the check's answer boundary, lock,
  broad-choice flag and judged video IDs. So that
  `assess_treatment_landscape_coverage` can build its ledger from receipts, a
  per-video audit receipt also carries the audited video's public channel ID
  and the audit's counts and completion flags. A terminal identifier-membership
  error also delivers its signed audit receipt, with a fixed
  `boundary: identifier_membership` marker and counts from the last verified
  frontier; no comment or identifier sample is added. A scout receipt carries the unresolved
  and rejected candidate video IDs and the public IDs it left to the model's
  judgment (reworded titles and YouTube's closest results for a title it could
  not find), a literature search receipt (PubMed, Europe PMC or
  ClinicalTrials.gov) the database, the 12-hex digest of its query, its date
  range when a PubMed or Europe PMC search was restricted to publication dates
  (`dr`, the range the caller sent), and its
  record counts (and, for a Europe PMC query that searches within article
  sections, `ft`: the provider's section field codes it used, such as
  `METHODS` or `TABLE`), a search receipt its access status, and a
  one-call community audit receipt the IDs of the videos whose comments its
  response returned, and a per-video audit receipt how many comments its final
  view returned. A study audit receipt also carries its figures check: the
  status (`fig`), up to 20 of the headline values as the paper prints them,
  non-integer ones only (`figv`), and up to three values the audit marked impossible as printed
  (`imp`), all numbers from the published paper. Survey, search and one-call community audit receipts also
  count their searches that ended incomplete and those stopped by a rate limit
  or the daily quota, so the checks can state that limit themselves; a round a
  limit stopped is signed too. They also carry `pg` and `nx`, the results
  pages a search read and left: the 12-hex digest of the caller's query, then
  YouTube's opaque page token (an offset, not user data; a token that encodes
  to more than 64 characters is not signed). The query itself is never in the
  receipt. A later page's receipt settles the page before it.
  Every MCP receipt carries `t`, its
  issue time in milliseconds made strictly increasing within the server
  process, so the gate orders rounds without trusting the caller. They expire
  after 24 hours. `finalize_research` verifies the receipts the client passes
  back and returns next steps or limits; it keeps no ledger, and its optional
  free-text reasons, open-lead topics and its required research target are
  processed for that call only (the target only to compare its digest). Its
  `community_findings`, the model's short summary of what the comments it read
  showed (benefit, no-effect and adverse reports, creators versus commenters,
  effect on the answer, and the public video IDs), are checked against the
  audit receipts and returned in `must_report` for the same call only; the
  summary should not quote commenters or name them. Its `principal_communities`
  and `community_searches` (the names of the communities where people discuss
  the question, the model's own web-search queries, the public thread URLs it
  read, the community's public address when no thread was read, for a review
  site the product reviewed with how many reviews the site shows, how many the
  model read and how it chose them, and a short summary of what they showed or
  the access boundary that stopped it) are
  checked and returned in `must_report` for the same call only,
  and the summary should not quote or name posters. AskRigor fetches none of
  those pages. For each Reddit thread link it asks Reddit's public embed
  endpoint (`https://www.reddit.com/oembed`) whether the thread exists and
  under which subreddit and title, sending only the link; it compares the
  answer, keeps nothing, and discards the poster name the endpoint returns.
  When a thread's public title there differs from the one the model gave, the
  next step quotes Reddit's title (one line, at most 150 characters) so the
  model can check the link. Its `answer_draft`, the
  answer the model is about to give, can contain whatever the user shared; it
  is read in memory for that call only, to find internal labels, bare video
  IDs, a pasted long prompt, the sentences the model copies from it for each
  community lane (`answer_quotes`, inside `community_findings` and each
  `community_searches` entry) and the caveats, which an answer not in English
  gives in its own language (`caveat_renderings`, with the `answer_language`
  tag). When the check passes (`ready` or `ready_with_limits`), `finalize_research`
  returns the exact submitted draft, including its whitespace, as `checked_answer`
  only to the caller that sent it. The final-check panel shows that answer as
  plain text. This adds no recipient, storage or log; the answer remains
  request-local and is never included in a receipt, carried state or debug report.
  Caveat sentences and any check or unchecked line inside a `<details>` element must be moved outside it; other
  text may remain inside. This is a structural check of the server's sentences, not a judgment about other advice.
  The draft also supplies the sentences where it says something was not found, not studied
  or has no effect, or calls an intervention's evidence unconvincing, weak, not
  demonstrated or showing no benefit (`absence_claims`, each with its state and the study IDs it
  rests on, and `search_coverage`, the search classes covered beyond indexed
  databases), and reported scale or questionnaire results (`scale_results`,
  each with its quoted explanation, scale name, range, direction, values and
  benchmark), reported yes-or-no results (`binary_results`, each with its quoted
  sentence, the outcome and which direction is better, both groups' names,
  event counts and totals, the follow-up, and any number needed to treat or
  harm, with a number needed to treat the answer's sentence giving the harms
  over the same follow-up, `harms_quote`; next steps name the groups and the
  outcome), whether the question is
  about safety (`safety_question`), the sentences that warn of a harm or call
  something safe (`safety_claims`, each with its direction, the exposure it is about, its
  basis, what the cited evidence measured and the study IDs it rests on), the
  specialized terms a conclusion depends on with the sentence that first
  explains each (`key_terms`), mechanism claims (`mechanism_claims`, each
  with the route of the described use, the route of the evidence, whether the
  evidence came from people or animals, any difference in tissue and its study
  IDs), the interventions the answer puts forward for the person or ranks
  among the treatments it compares
  (`recommendations`, each with its sentence, its name as the answer gives it,
  whether the person's safety conflicts and inputs are resolved, the inputs
  still open in a few words, and for long-term use its longest follow-up and
  whether stopping is covered), and corrections made during the research
  (`corrections`, the wrong statement, the answer's sentence saying what
  changed, and whether the user pointed the error out, `by_user`). Each `community_searches` entry may also say how its threads were
  chosen (`thread_selection`, one of six fixed values), and `report_identity`
  declares counts by exposure and how many gave a measurement after the change.
  `comparison_claims` declares each comparison's quote, both exposures' doses
  and units, and whether the same people used both; `named_by_user` marks
  principal communities the user requested. These counts, doses, short labels
  and other declarations are request-local and are not stored or logged.
  `user_observations` adds short descriptions of what the user or others observed,
  which may be health details; `proposed_tests`, `corrections[].report`,
  `primary_outcome`, `rejected_options` and `reopened` are also request-local
  declarations: checked in the call, not stored or logged, not in the
  finalization receipt, and never saved with a findings card.
  When enabled, and only after the other final checks pass, a second reading sends
  the answer draft (which can contain health details) and its `safety_claims`,
  `key_terms` and `scale_results` declarations to the configured provider. This
  request is not stored or logged. The reading has a one-hour in-memory cache
  of at most 500 entries and a daily usage-based budget; nothing is written to disk.
  `reader_dismissed` is request-local like the other declarations, not stored or
  logged, added to the finalization receipt or saved with a findings card.
  The public privacy notice must describe the provider before the reader is enabled
  in production (owner questions 118 and 119).
  `carry_forward` holds the user's observations and goals, statements taken
  back, options rejected and communities named, and the last check's status
  with the kinds of step it left open (fixed values; AskRigor#354), as a signed,
  compressed token returned in the tool result, alongside the readable `carried`
  state. It also holds the issuing call's random 16-hex turn id, the first-turn boolean and, only when that turn
  began after an earlier turn's check that did not pass, that check's open kinds (fixed values). These added fields
  contain no personal data. The client
  passes the token back as `carried_state`; AskRigor verifies and rebuilds it
  in memory and never stores or logs it. It has no expiry and is readable by
  anyone who can read the conversation. It is not a research receipt.
  The output's `check_line` is a fixed server sentence for the answer to end with;
  it is not part of the signed finalization receipt. When the check does not
  pass, each next step has a kind (`next_step_kinds`, eight fixed values), and
  `unchecked_line` is a fixed server sentence, worded from those kinds, that an
  answer given before a pass ends with; `previous_check` repeats the kinds the
  carried state holds from an earlier turn's check that did not pass (AskRigor#354), preserved through this turn's
  later calls. A check
  that does not pass also returns `round` (which of the turn's at most ten
  rounds it was) and `round_token` (owner answer 172a), a signed token the
  client passes back as `round_token` on the turn's next call. The token holds
  the round number, the time it was issued, the research target's 32-hex digest, a random 16-hex turn id,
  and, for each step still asked for or stopped as
  stuck, a 16-hex digest of its kind and text with a count; never the steps'
  text. These token fields contain no personal data. AskRigor verifies it in memory and never stores or logs it;
  it lapses two hours after it was issued and counts for nothing with another research target. Carried state
  does not affect its binding. Steps that came back unchanged three rounds running
  return in `stuck_steps`, and a check that stops (`stopped`, after ten rounds or
  when only such steps are left) returns the steps it could not do and the
  steps the next turn can do, a short reason, and `bug_report`, the first unmet
  rule with inserted values masked, plus the number of other unmet steps. The
  answer shows it before asking whether AskRigor may send it; nothing is sent
  unless the user says yes and the model calls `submit_lesson_candidate` with
  the signed `check_report_token` described below. A stopped check returns no
  finalization receipt. The
  finalization receipt signs the SHA-256 of the answer draft the check read,
  without leading and trailing white space (`answer`), so whoever holds the
  receipt and the answer the user saw can tell whether that answer is the
  checked one. The receipt goes only to the caller;
  a saved findings card and a filed research map store only the receipt's own
  SHA-256, never the receipt.
  The panel resource renders the same result in the client's sandboxed frame; nothing new is collected, stored, logged or sent.
  Its `full_text_search` declaration (`run` with the Europe PMC section
  queries the model ran, or `not_needed` with a short reason) is request-local
  too: each query is compared by its 12-hex digest with a section-search
  receipt, and the reason is not judged.
  Its `lab_preparation` declaration is request-local too: its quotes are compared with the answer for that call only, and nothing from it is stored.
  None of their text is returned: of the answer, the
  result names only the labels and public video IDs it found, and points to an
  absence claim, scale result, safety claim, key term or mechanism claim by its
  position in the list; for a scale result, it also names declared numbers
  missing from the quote, and for a key term used before its explanation, the
  declared term. The caveats it writes for a harm or safety basis and for a
  route, species or tissue mismatch repeat the declared exposure, what the
  evidence measured, the tissues and the study's answer label, and those for a
  recommendation repeat the declared intervention, open inputs and follow-up,
  so the answer can state them; a recommendation's next step names the
  declared intervention. `not_relevant_basis` is one of two
  fixed values, and with `no_real_world_outcome`, `question_about` (owner
  answer 149a) is one of two more: `symptom_or_test_result`, which refuses the
  skip, or `other`. With `no_real_world_outcome`, the caveat the answer must state
  repeats the declared `not_relevant_reason` ("I did not search firsthand
  reports or community discussions for this answer: …"), and a reason showing
  internal labels gets a next step naming them; like the other declarations,
  the reason is request-local: not stored or logged, not in the finalization
  receipt or the carried state, and never saved with a findings card.
- The MCP `scout_gemini_youtube_candidates` tool runs the same de-identified,
  population-level scout as the controlled Action route, applying the same
  screen: a target with first-person words, contact details, links, keys or
  record fields is refused before any provider call. Its target also passes a
  stricter population-level screen that fails closed. The target must name a
  group of people, and is refused if it has any of:
  - third-person singular pronouns;
  - a single person's age;
  - a title before a name;
  - two capitalized words in a row that are not a medical or method term;
  - a capitalized word followed by a narrative verb, unless it names a group;
  - an identity or example marker ("named", "like …", "such as", "e.g.").

  So a narrative about one named person, even with a name no list knows, does
  not reach Gemini. The screen is heuristic. No pattern check can catch every
  name; a lowercase name with no marker passes. So the tool contract also asks
  the calling model for a population-level target. The screen reads English,
  so the calling model writes the target in English whatever the person's
  language, and gives the person's language apart in `language`: a BCP 47 tag
  (a language, then optionally a script and a region, such as `fr` or `pt-BR`,
  at most 12 characters) whose shape is checked exactly, so it is only a tag,
  never user text. The tag and its English language name go to Gemini with
  the English target, so the scout looks for videos in that language; the
  screen itself is unchanged. Under the
  owner's zero-spend policy it starts a new scout only when the deployment
  sets `ASKRIGOR_GEMINI_BILLING=none` for a key without billing. A later round may add up
  to eight rediscovery leads that audited comments mention. A lead is either
  a short public term for a remedy, method or product (at most eight words,
  refused if it could name or describe a person: names, pronouns, ages,
  titles or report verbs such as "says" or "cured"), or `video:<id>`, which
  AskRigor replaces with YouTube's own public title and channel for that video.
  Leads never carry commenter identity or comment text. The screen is
  heuristic in the same way: a name written without capitals can still pass. It runs in Gemini's background
  mode: Google stores the interaction until AskRigor consumes it and requests
  deletion, and the result reports `provider_storage_mode`. While the scout is
  still searching, the tool returns a signed, expiring continuation token that
  carries only that target, its language tag and leads, the diagnosis status, the provider checkpoint
  (opaque interaction identity, executed public search queries, counters),
  the budget already charged and its hold (a random hold identity, the amount
  held and its UTC month), which the call that completes the scout settles
  against the aggregate budget ledger; AskRigor stores none of it. The token
  is signed, not encrypted: the caller can read these fields but not change
  them.
  When the scout names a video it could not identify (a title with no visible
  ID, or an ID that does not exist), the tool sends that public title to
  YouTube search, at most four per call (100 quota units each), and returns
  only the matching public video IDs, titles and channels plus the titles it
  could not match.
- The MCP `extract_youtube_video_claims` tool ("check this video", AskRigor#248)
  takes only a video ID or YouTube link, an optional time, or its own
  continuation token; strict input refuses any other field, so no question or
  other text from the person reaches it. From a link it keeps only the
  11-character ID. It looks the video up with one YouTube `videos.list` call
  and refuses, before any Gemini request, a video that is not public, is live
  or upcoming, has no known length, or runs over two hours. Under the
  owner's zero-spend policy it runs only when the deployment sets
  `ASKRIGOR_GEMINI_BILLING=none`. Gemini then receives the rebuilt public
  watch URL with agentic video processing and a fixed prompt; a follow-up
  adds only a time in the fixed form "At MM:SS, quote what is said and
  describe what is shown." Gemini's report must pass a strict schema and is
  refused, never repaired, when it does not. While Gemini reads, the tool
  returns a signed, expiring continuation token that carries only the video
  ID and any time, the video's public title, channel and length, the opaque
  interaction identity and poll count, and the seconds charged; AskRigor
  stores none of it. A completed reading returns a research receipt that
  signs the video ID, the mode and the claim count. A call that ends without
  reading a video it identified (any refusal or boundary once the ID is known,
  except YouTube showing no public video under it) returns, in its refusal's
  text, a research receipt of its own that signs the video ID and the
  refusal's code, a fixed identifier such as `gemini_video_not_completed`, so
  `finalize_research` can tell a video that was read from one that was not
  (AskRigor#359). When Gemini no longer has a reading AskRigor polls (an HTTP
  404), the refusal says so in a fixed sentence; nothing from Gemini's reply
  and no interaction identity is kept. It is a connector tool
  only: no Custom GPT Action path, and absent from the Gemini-compatible
  catalog.
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

## Masked final-check debug reports (26 October 2026)

`finalize_research` constructs `check_report` in memory when the check stops. The report holds the deployed build
and protocol versions, stop reason and round; each step it could not do and each next-turn step, with its kind,
consecutive round count and masked rule; the last call's receipt counts by kind and verification rejection reasons;
and masked gate limitations, including a known missing-DOI boundary. It contains explicit counts of omitted steps,
receipt groups, limitations and characters. Serialized JSON is bounded to 6,000 characters; each rule to 1,200.

Privacy is enforced at construction, independently of language or privacy heuristics. A tagged rule retains its
fixed server wording separately from inserted values. Each value is shown only if it is exactly a registered tool
name, next-step kind, field path derived from the finalizer input schema (including valid array positions), a
source-derived enumeration code, a whole number, or a protocol version. Everything else is `…`. Untagged dynamic
strings are masked too. No free user prose can enter this report by construction: topics, names, study/video IDs,
quotes, observations and URLs are never copied unless the whole inserted value itself equals one of the explicitly
allowed names or numbers. No raw receipt, signature, research-target digest, account key, turn/conversation ID or
provider response is included. Normal model-facing steps continue to hold the information needed for the research;
the report is a separate masked projection.

The caller receives this report and `check_report_token`, which carries its exact JSON, not the unmasked template
values. Prefix `br1~` uses a domain-separated 128-bit HMAC-SHA256 signature (`askrigor final check report v1`) with
the existing receipt-signing secret. Maximum token length is 34,000 characters; it has no expiry and is readable to
anyone who can read the conversation. The server adds no state store or logging. After consent to the shown report,
the model passes this token unchanged to the connector lesson tool. Invalid, altered, foreign-server or foreign-domain
tokens return `check_report_refused` / `invalid_check_report_token`, without storing anything. After the existing
lesson privacy pipeline passes, the exact verified JSON is added in “The final check's report, as AskRigor recorded
it” in the private lesson issue or repeat comment. The token is not stored. Neither report nor token reaches the
legacy anonymizer, duplicate fingerprint or public receipt. This masked server report needs no detailed-reports
setting; model-authored `detailed_report` still requires it and still passes its existing privacy screen.

For a user's confirmed correction with a report, the finalizer and connector lesson accept `preventing_rule`,
an exact current HRP/Universal element tag or selectable `name`/`id`, or `no_rule` plus a one-line `missing_rule`
(maximum 300 characters). Names are checked against parsed complete protocol files, including lowercase Universal
names; missing-rule prose passes the existing lesson privacy screen. The answer shows the declaration with its
report and the lesson stores it as a separate fixed section, outside generalization and the duplicate fingerprint.
Invalid names or incomplete declarations return `correction_rule_refused` / `invalid_preventing_rule`. These
connector fields do not broaden the Action's request shape or preserve raw incidents.
