# Execution-control Phase D5 implementation plan

**Status:** implementation candidate

**Branch:** `agent/execution-control-phase-d5-20260824`

**Baseline:** `1fd17c89a514a04f1f8a2b35d032964c231e33ad`

**Roadmap phase:** D5 — PubPeer + Epistemonikos optional adapters

## Objective

Add strict, bounded, server-injected adapter boundaries for PubPeer
post-publication discussion and Epistemonikos review ancestry. Extend the
existing signed external-study-evidence coordinator so a provider that is
configured by the server must be executed and bound into the authoritative
receipt, while an unconfigured provider remains an explicit coverage gap.

This phase implements versioned normalization contracts, deterministic fixture
tests, coordinator composition, linked-work derivation, and documentation. It
does **not** add a live PubPeer or Epistemonikos HTTP client, provider hostname,
API key, token, environment binding, account, new cost, public tool, protocol
change, deployment, Custom GPT change, or plugin change.

## Current provider boundary

- PubPeer's current official FAQ says API data access requires contacting
  PubPeer to request a key and does not publish a stable response contract.
  PubPeer also explicitly says comments are not scientifically reviewed or
  warranted as true, comments can be edited or moderated, and comment counts
  must be interpreted cautiously.
- Epistemonikos' official API site describes its last documented version as
  dated 2017-08-07, calls it a restricted beta, and requires a private access
  token. No current token, negotiated terms, or live response-shape smoke is
  available in this phase.
- Therefore D5 will not guess endpoints or silently add either provider to the
  ordinary HTTP allowlist. It will define the exact minimized response contract
  that a future reviewed, authorized server transport must satisfy. Activation
  later consists of mapping the then-current official response to this
  contract and supplying the executor at server construction; the coordinator
  and completion-authority model do not change.

## Design

### 1. PubPeer authorized-provider adapter boundary

Add a source adapter that consumes only a versioned, strict server-side
authorized-provider record. It will:

- require the queried canonical DOI to match the response DOI exactly;
- bound thread/message/count/text/link collections and reject unknown fields;
- require unique message identities;
- preserve comment versus identified-author-reply role;
- preserve posted/updated time, provider revision ID, visible/edited/deleted-or-
  unavailable state, raw provider classification, and classification source;
- preserve bounded visible excerpts and link identities while hashing the
  exact normalized message content/state;
- represent deleted/unavailable content explicitly without inventing text;
- preserve provider-reported total, returned count, cursor, and exhausted state;
- return `partial` when pagination is not exhausted or provider totals do not
  reconcile, and never convert partial/no-match into no-concern evidence;
- set materiality to `unknown` and message audit to `not_started` unless content
  is unavailable, which is a bounded source boundary; and
- state plainly that every comment/reply remains an unaudited claim, not a
  scientific or misconduct verdict.

Malformed authorized-provider records become bounded provider errors. Separate
strict failure fixtures preserve rate limit, authentication denial, timeout,
not-found, inaccessible, retryable, and nonretryable state without raw provider
body leakage.

### 2. Epistemonikos authorized-provider adapter boundary

Add a separate source adapter for versioned review-ancestry records. It will:

- require exact queried DOI identity;
- preserve the Epistemonikos record ID, relationship kind, raw relationship
  label, current/removed/unknown relation state, and provider classification
  provenance;
- normalize bounded review bibliographic identities without inventing a DOI;
- retain provider-reported DOI/title/author/year identities as provisional;
- preserve returned/total/page/cursor/exhaustion information and return
  `partial` on incomplete or inconsistent pagination;
- set every review link audit status to `not_started` when its source is
  retrievable and `bounded` when removed or missing sufficient identity;
- state that review inclusion/exclusion/citation is provider metadata, not
  approval of the review or study; and
- hash exact normalized link state deterministically.

Malformed and failure records follow the same explicit provider-state boundary
without sharing PubPeer-specific semantics.

### 3. Shared evidence contracts

Extend existing generic post-publication/review-ancestry records only where
needed to preserve D5 evidence:

- post-publication message revision/update/classification provenance;
- thread provider counts, visible/unavailable counts, and pagination
  completeness; and
- review-link provider, provider record/raw relationship, relation state, and
  classification provenance.

These fields remain provider metadata. They do not create a study-quality
score, materiality shortcut, replication conclusion, or finalization permit.

### 4. Existing coordinator integration

Extend, rather than duplicate, the D2-D4 coordinator:

- accept optional server-injected PubPeer and Epistemonikos executors;
- after exact Crossref DOI verification, execute every configured provider;
- store each normalized envelope in the existing bounded in-memory artifact
  store and bind its artifact/attempt into the signed receipt;
- omit `not_configured` only for providers actually supplied by the server;
- derive overall `blocked_retryable`, `bounded_nonretryable`, `partial`, or
  `complete` from every configured provider state;
- include PubPeer threads and Epistemonikos ancestry in the signed bundle;
- schedule visible PubPeer messages for source-linked semantic audit;
- preserve deleted/unavailable messages as bounded unresolved items;
- schedule exact-DOI review links for full-text/review-method audit and keep
  incomplete bibliographic identities bounded;
- add claim-local limitations stating that provider labels/comments/relations
  are unaudited; and
- use each ancestry link's actual provider in method-audit evidence keys rather
  than hard-coding `review_risk_of_bias`.

The public input remains only opaque session ID plus DOI. Caller-supplied
providers, provider output, counts, classification, completion, or receipt
fields remain rejected. A configured executor that is omitted or throws cannot
produce a signed successful output.

### 5. Verification

Add deterministic saved-fixture/hostile tests covering:

- PubPeer valid visible, edited, identified-author reply, deleted/unavailable,
  no-match, partial pagination, duplicate IDs, DOI mismatch, malformed required
  fields, oversized text/collections, unexpected fields, rate limit,
  authentication denial, timeout, and normalized limitations;
- Epistemonikos valid include/exclude/cite/update relationships, current/removed
  state, exact and bibliographic-only identities, no-match, partial pagination,
  duplicate links, DOI mismatch, malformed/oversized/unexpected fields, rate
  limit, authentication denial, timeout, and normalized limitations;
- configured provider execution and artifact/attempt/receipt binding;
- unconfigured provider disclosure;
- retryable, terminal, and partial provider state cannot become complete;
- PubPeer message and review-ancestry directives/unresolved work cannot vanish;
- forged caller provider/completion fields remain rejected;
- receipt tamper/cross-session/provider-state tests continue to pass;
- session ingestion creates post-publication/review linked work using the exact
  provider and cannot turn provider classifications into conclusions; and
- public inventories remain 21 MCP tools and 26 Actions.

Run focused tests during implementation, then one merge-ready
`npm run test:run` and the mandatory `npm run verify`, with the current universal
test-efficiency observer.

## Files expected to change

- `packages/contracts/src/study-external-evidence.ts`
- `packages/sources/src/pubpeer-postpublication.ts` (new)
- `packages/sources/src/epistemonikos-ancestry.ts` (new)
- `packages/sources/src/index.ts`
- `apps/research-mcp/src/actions/study-external-evidence.ts`
- `apps/research-mcp/src/actions/study-method-audit.ts`
- existing formal-evidence integration as needed for provider-bound ancestry
- focused adapter/coordinator/session/contract tests and fixtures
- roadmap, current-state, source/privacy/index documentation

## Exit criteria

- Strict adapter fixtures preserve the required D5 content/status/provenance
  without exposing a live unsupported provider transport.
- Every server-configured optional provider is executed and bound into the
  signed bundle/receipt; its failure or partial state cannot be skipped.
- Unconfigured PubPeer/Epistemonikos remain explicit coverage gaps.
- Provider comments/classifications/ancestry remain unaudited leads that create
  exact downstream work or claim-local bounded limits.
- No provider token, endpoint allowlist, live request, public tool, protocol,
  Custom GPT, plugin, deployment, or production configuration change lands.
- Focused and complete deterministic gates, hosted CI, PR review, and merge
  pass before Phase D6 begins.
