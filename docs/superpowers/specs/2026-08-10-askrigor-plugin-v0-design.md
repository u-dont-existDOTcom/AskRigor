# AskRigor Plugin v0 — Design Specification

Date: 2026-08-10
Status: design approved in principle via Option B; written-spec review pending

## 1. Objective

Build the smallest useful public AskRigor plugin that makes the AskRigor research workflow executable rather than relying only on prompt instructions.

The v0 product is a **plugin containing an AskRigor skill plus a read-only research app backed by a remote Model Context Protocol (MCP) server**.

The skill remains the epistemic/research-orchestration layer. The MCP service is deliberately non-interpretive: it retrieves, normalizes, verifies, paginates, and reports provenance/access state. It does not decide whether a treatment works, rank medical interventions, or emit medical recommendations.

## 2. Product boundary

### In scope for v0

1. AskRigor skill package
   - activation and routing guidance;
   - canonical protocol loading rules;
   - research-tool selection guidance;
   - evidence/completeness status handling;
   - no hard-coded protocol version in application logic.

2. Read-only Research MCP service
   - protocol manifest/integrity tools;
   - PubMed adapter;
   - Europe PMC adapter;
   - ClinicalTrials.gov adapter;
   - Crossref/DOI-resolution adapter;
   - retraction-status lookup using configured authoritative/traceable sources, returning unknown when no supported source can establish status;
   - YouTube video discovery/metadata;
   - YouTube public comment + reply acquisition;
   - normalized provenance, pagination, deduplication, and access-status envelopes.

3. Automated tests
   - unit tests for adapters/normalizers;
   - contract tests using recorded fixtures;
   - end-to-end tests against live public endpoints where appropriate;
   - regression cases for incomplete access and YouTube reply completeness.

### Explicitly deferred

- database or persistent evidence ledger;
- user accounts/billing;
- dashboards or custom UI;
- arbitrary-URL scraping;
- write/modify actions;
- medical recommendation/conclusion engine inside MCP;
- general YouTube transcript extraction;
- private/closed-community access;
- generic forum scraper;
- vector database;
- background agents/queues unless a source later requires them.

## 3. Architecture

Use a TypeScript/Node monorepo. TypeScript is the default because the public-facing integration is an MCP/ChatGPT app, the tool contracts are schema-heavy, and a single runtime reduces deployment and packaging complexity. Scientific/NLP utilities may later live in Python without becoming a runtime dependency of the MCP server.

Proposed structure:

```text
AskRigor/
├── apps/
│   └── research-mcp/
│       ├── src/server/
│       ├── src/tools/
│       └── src/config/
├── packages/
│   ├── contracts/
│   │   ├── provenance.ts
│   │   ├── pagination.ts
│   │   ├── access-status.ts
│   │   └── source-records.ts
│   ├── protocol/
│   │   ├── loader.ts
│   │   ├── integrity.ts
│   │   └── manifest.ts
│   └── sources/
│       ├── pubmed/
│       ├── europe-pmc/
│       ├── clinical-trials/
│       ├── crossref/
│       └── youtube/
├── skills/
│   └── askrigor/
│       └── SKILL.md
├── protocols/
│   ├── HRP_Full.xml
│   └── Universal_Instructions.xml
├── tests/
│   ├── contract/
│   ├── regression/
│   └── fixtures/
└── docs/
```

The source adapters depend only on shared HTTP/retry utilities and normalized contracts. The MCP tool layer calls adapters; adapters do not import ChatGPT-specific logic. This lets the retrieval code later power a web service, CLI, or other client without rewriting it.

## 4. Canonical protocol handling

The protocol files are data, not application constants.

At server startup and on explicit protocol-tool calls:

1. load the complete configured protocol file;
2. parse its internal name/version/revision date;
3. compute SHA-256;
4. return manifest metadata;
5. fail closed on malformed XML, missing file, internal/file mismatch when a pinned hash is configured, or unreadable content;
6. never claim a version from a filename alone.

Initial tools:

- `get_protocol_manifest`
- `load_protocol`
- `verify_protocol_integrity`

`load_protocol` returns canonical text only when needed by the client and may support bounded sections later; v0 must always make complete loading possible because HRP explicitly prohibits replacing the canonical full file with summaries/retrieval aids.

Protocol upgrades should normally be a data/release change, not a source-code change.

## 5. MCP tool surface

### Protocol

```text
get_protocol_manifest(protocol)
load_protocol(protocol)
verify_protocol_integrity(protocol, expected_sha256?)
```

### Scholarly

```text
search_pubmed(query, date_range?, page_size?, cursor?)
fetch_pubmed_record(pmid)
search_europe_pmc(query, date_range?, page_size?, cursor?)
search_clinical_trials(query, status?, page_size?, cursor?)
fetch_clinical_trial(nct_id)
resolve_doi(doi_or_citation)
check_retraction_status(identifier)
```

`check_retraction_status` is an evidence lookup, not an inference engine. It checks only configured sources whose provenance can be returned. If those sources do not establish a status, it returns `unknown` with the sources checked; absence of a retraction hit must not be converted into an affirmative claim that the work is valid or unretracted everywhere.

### YouTube

```text
search_youtube(query, page_size?, cursor?)
get_youtube_video(video_id_or_url)
get_youtube_comments(video_id_or_url, include_replies=true, cursor?)
search_youtube_comments(video_id_or_url, query, include_replies=true, cursor?)
```

`get_youtube_comments` is the decision-critical v0 community tool. It must separately fetch replies when the thread endpoint does not contain all replies, preserve thread relationships and timestamps, and expose completeness accounting instead of returning only relevance-ranked samples.

The first release does not expose a generic `search_forums` because that name would imply cross-platform coverage we cannot honestly guarantee.

## 6. Normalized result contract

Every tool returns a common envelope in addition to source-specific fields.

```ts
type ProvenanceEnvelope<T> = {
  provider: string;
  record_type: string;
  primary_identifier?: string;
  retrieved_at: string;
  query?: unknown;
  source_identity: {
    canonical_url?: string;
    title?: string;
    authors_or_channel?: string[];
  };
  pagination: {
    cursor?: string;
    next_cursor?: string;
    page_size?: number;
    returned: number;
    exhausted?: boolean;
  };
  access_status:
    | "complete"
    | "api_visible_complete"
    | "partial"
    | "abstract_only"
    | "metadata_only"
    | "comments_disabled"
    | "inaccessible"
    | "rate_limited"
    | "not_found"
    | "error";
  limitations: string[];
  raw_metadata?: unknown;
  data: T;
};
```

Source adapters may add fields, but cannot silently omit provenance or access state.

## 7. YouTube data contract

The YouTube adapter preserves enough raw structure for later AskRigor person×treatment-episode analysis while avoiding clinical interpretation in the retrieval layer.

Per comment/reply:

```text
video_id
comment_id
parent_id
top_level_comment_id
is_reply
author_channel_id (when API provides it)
author_display_name (raw retrieval only)
text
like_count
published_at
updated_at
```

Per video retrieval manifest:

```text
video metadata
API-visible comment count when available
top-level comments retrieved
expected replies from thread metadata
replies retrieved
reply-count mismatches
API calls/pages
comments-disabled/error state
retrieval timestamp
```

The MCP layer does not call a comment a cure, failure, adverse event, or treatment response. Semantic health classification belongs to the AskRigor reasoning/analysis layer or a later separately validated analysis service.

## 8. Error and incompleteness semantics

A primary v0 design requirement is that source failure remains explicit.

Rules:

- never turn timeout, quota, robots/access restriction, comments-disabled, abstract-only access, or parsing failure into “no evidence”;
- distinguish zero results from failed search;
- retries use bounded exponential backoff for transient failures;
- provider error codes/messages are retained in normalized form without leaking secrets;
- cursors are opaque to clients;
- duplicate records are identified by provider-stable IDs when available;
- a partially retrieved page/corpus is marked partial rather than returned as complete.

AskRigor can still produce a bounded answer when a layer is unavailable; the tool contract exists to let the skill say how incompleteness could affect confidence rather than falsely treating missing access as negative evidence.

## 9. Secrets, privacy, security, and abuse controls

- v0 is read-only.
- API keys and credentials come from deployment secrets/environment variables, never protocol files, tool output, or repository commits.
- Tool descriptions and source content are treated as untrusted data, not executable instructions.
- The server uses an allowlist of upstream source domains.
- Inputs receive explicit length/type validation.
- HTTP responses have size/time limits.
- Logs redact credentials and avoid persisting raw health-comment corpora by default.
- Public YouTube identities are retrieval metadata; persistence/profile-building is not part of v0.
- Public/no-end-user-auth deployments still require server-side rate limiting, request-size limits, bounded provider pagination, concurrency limits, and a deployment kill switch to prevent quota exhaustion or abuse.
- Before public launch, YouTube API policy/privacy handling receives a separate compliance review.

## 10. Authentication and deployment

The ChatGPT-facing endpoint is a **remote MCP server** suitable for creation as a custom ChatGPT app. Local development may use a local MCP client or secure tunnel, but ChatGPT is not assumed to connect directly to localhost.

v0 should support a deployment mode with no end-user authentication for public-data-only tools, while keeping the server architecture compatible with OAuth/API-key protection later. Public unauthenticated mode is a deployment option, not a public-launch entitlement: it must remain behind the abuse controls in Section 9 and may be replaced with lightweight authentication if live testing shows unacceptable quota/security exposure. Provider credentials such as the YouTube Data API key stay server-side.

No hosting provider is selected in this design; deployment is intentionally adapter-neutral. The first implementation plan should choose the smallest remote Node deployment that supports streaming/HTTP MCP reliably and can be replaced later without changing tool contracts.

## 11. Skill/app division of labor

### Skill owns

- when AskRigor/HRP activates;
- loading the canonical protocol through the protocol tools;
- applicable-module routing;
- deciding which source tools to call;
- bidirectional formal↔community research iteration;
- evidence weighting and applicability;
- completion/incompleteness audits;
- user-visible research specification and answer structure.

### MCP app owns

- deterministic retrieval;
- identifiers and exact source metadata;
- pagination;
- retries/rate-limit state;
- source-specific normalization;
- deduplication identifiers;
- retrieval timestamps;
- access/completeness status;
- raw provider metadata needed for auditability.

### Explicit boundary

The MCP server must not decide whether a study is convincing, whether forum signal is favorable, whether an intervention works, or what a user should do medically.

## 12. Test strategy

### Unit/contract tests

- protocol XML parse/version/hash integrity;
- DOI/PMID/NCT/video-ID normalization;
- pagination and cursor handling;
- retry classification;
- provenance envelope required fields;
- duplicate detection;
- comments-disabled and empty-result distinction;
- YouTube separate-reply pagination and reply-count reconciliation.

### Recorded-provider fixtures

Every external adapter gets recorded JSON fixtures so the main test suite does not depend on live network stability or consume provider quotas.

### Live smoke tests

Opt-in tests verify current provider compatibility without becoming required for every local unit-test run.

### End-to-end regression cases

1. **Ordinary indexed question** — PubMed/Europe PMC retrieval works with exact identifiers and no unnecessary source expansion.
2. **Neglected/contested intervention** — trial registry/grey-source adapters can return relevant material even when PubMed is sparse; absence is not inferred from one source.
3. **YouTube real-world signal acquisition** — a known public video can be discovered, metadata fetched, and all API-visible top-level comments + replies reconciled.
4. **Decision-critical inaccessible source** — access state remains abstract-only/inaccessible rather than being promoted to full-text evidence.
5. **Protocol upgrade** — replacing a valid canonical XML with a new internal version changes the manifest without code edits.

## 13. Observability

Structured logs should record:

```text
request/tool name
provider
retrieval timestamp
latency
pages/API calls
returned records
access status
rate-limit/retry events
correlation/request ID
```

No raw comment text or full article text in default production logs.

## 14. Release definition for v0

v0 is complete when:

1. the plugin skill and research MCP packages build from a clean clone;
2. protocol manifest/load/integrity tools pass tests;
3. PubMed, Europe PMC, ClinicalTrials.gov, Crossref, and YouTube adapters pass recorded contract tests;
4. YouTube comment retrieval proves full API-visible top-level + reply reconciliation on a public test video;
5. all tool results use the normalized provenance/access envelope;
6. failures cannot masquerade as negative evidence;
7. all five end-to-end regression cases in Section 12 pass;
8. a remote MCP endpoint can be scanned by ChatGPT Developer Mode;
9. README documents local test, deployment, required secrets, and ChatGPT connection steps;
10. no database/write action/UI is required to demonstrate useful AskRigor research retrieval.

## 15. Deferred architecture hooks

Design stable interfaces now for later addition of:

- evidence/search-history ledger;
- persistent person×episode community analysis;
- additional grey-literature adapters;
- specialist books/full-text extraction;
- forum-specific connectors;
- multilingual semantic retrieval;
- optional Apps SDK UI;
- authenticated/premium services.

Do not implement those hooks beyond interfaces required by v0.

## 16. Implementation-order recommendation

After written-spec approval, implementation should proceed in this order:

1. monorepo/tooling + shared contracts;
2. protocol loader/integrity tools;
3. MCP server skeleton and tool registration;
4. PubMed + Europe PMC adapters;
5. ClinicalTrials.gov + Crossref/retraction adapter;
6. YouTube metadata/search;
7. YouTube complete comment/reply retrieval and manifest;
8. skill package;
9. regression tests and fixtures;
10. remote deployment + ChatGPT Developer Mode scan;
11. security/privacy/compliance review before public distribution.

This order proves the architecture early and puts the previously demonstrated YouTube bottleneck into v0 rather than deferring it.