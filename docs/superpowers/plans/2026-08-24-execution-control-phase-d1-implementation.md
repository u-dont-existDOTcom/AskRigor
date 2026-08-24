# Phase D1 external evidence contracts and open providers

**Status:** implementation plan for roadmap Phase D1 only  
**Branch:** `agent/execution-control-phase-d1-20260824`  
**Base:** `1d22fa0bd13682d79fc5a5c6a53629de492856e2`

## Goal

Give later controller phases strict, provider-scoped records for publication
updates and replication/reproduction links without changing the public Action
or MCP inventories. Phase D1 does not coordinate providers, issue receipts,
advance research sessions, or authorize synthesis.

## Verified upstream contracts

- Crossref exposes Crossmark update metadata in `update-to`/`updated-by` and
  identifies publisher versus Retraction Watch sources. Its metadata is a
  record of assertions and updates, not a validity or study-quality verdict.
- FORRT documents the production DOI endpoint as
  `https://rep-api.forrt.org/v1/original-lookup?dois=<doi>`. A successful
  response always has `results`; an absent DOI is `null`. A result can contain
  forward `replications`/`reproductions` and reverse `originals` links. FORRT's
  own current client treats relationship outcomes as provider fields, not as
  audited conclusions.
- Only the exact production FORRT hostname will be added to the existing
  HTTPS-only upstream allowlist. The adapter will not accept a base URL,
  credentials, arbitrary paths, or batch input.

## Design

### 1. Strict contracts

Create `packages/contracts/src/study-external-evidence.ts` with strict,
bounded Zod schemas and inferred types for:

- canonical study identities and identity status/basis/hash;
- provider attempts and provider-scoped outcomes;
- publication-integrity events with ordered sequence, conceptual event hash,
  and one or more source-preserving assertion records;
- replication/reproduction relationships, direction, raw and normalized
  provider outcomes, and explicit not-yet-audited implementation/source state;
- post-publication messages/threads, citation-context aggregates, review
  ancestry, result-specific imported risk-of-bias records, controller
  directives, unresolved items, claim-local limitations, and a normalized
  bundle contract for later Phase D2 hashing.

The contract will reject unknown normalized fields, invalid identifiers,
unbounded arrays/text, impossible hash shapes, and global quality/validity
shortcuts. The contracts package will declare its direct Zod dependency.

### 2. Crossref event history

Extend `packages/sources/src/crossref.ts` with an internal exported
`checkCrossrefPublicationIntegrity` operation while leaving the existing
`checkRetractionStatus` public payload unchanged.

The rich operation will:

- normalize all supported `update-to`, `updated-by`, and recognized relation
  containers into retraction, withdrawal, expression-of-concern, correction,
  update, reinstatement, or other events;
- map inbound/outbound assertions to exact original and notice DOI roles;
- preserve raw type, label, source, relation direction, date, reasons, and
  provider record ID when present;
- merge duplicate conceptual events while retaining distinct publisher and
  Retraction Watch assertions;
- order events deterministically and derive a conservative provider-scoped
  record state (`no_update_marker_found` is never “clean” or “valid”);
- derive the legacy status/evidence from the same normalized history so old
  callers keep their existing schema and failure semantics.

Malformed marker containers fail closed. Retrieval failures remain unknown,
with retryability and access status preserved.

### 3. FORRT DOI adapter

Add `packages/sources/src/forrt-replication.ts` and export it only from the
sources package. The adapter will:

- accept one bounded DOI and normalize DOI/DOI-URL forms;
- call only the fixed production endpoint through the existing bounded HTTP
  client;
- require the requested result key and exact returned DOI identity;
- normalize forward replications, forward reproductions, and reverse original
  links into the shared relationship contract;
- preserve FORRT's raw outcome while mapping only explicit values to
  `successful`, `failed`, `mixed`, or `unclear`; everything else becomes
  `not_reported`;
- set implementation-match and linked-source audit state to `not_started`;
- de-duplicate identical relationships by deterministic hash;
- return `no_match_in_provider` only for a successful response whose exact DOI
  value is `null`;
- return `partial` if a valid record contains malformed relationship rows,
  while never letting rejected rows influence normalized state;
- preserve rate-limit, upstream, malformed-response, and invalid-input
  semantics without exposing provider bodies.

### 4. Tests and fixtures

Add deterministic fixtures and focused tests covering:

- Crossref retraction, withdrawal, correction, expression of concern,
  reinstatement, unknown update kind, chronology, duplicate assertions from
  multiple sources, outbound notice roles, malformed containers, no marker,
  no match, rate limit, and upstream failure;
- FORRT forward replication, reproduction, reverse replication, duplicate
  relationships, no DOI for a linked reproduction, no match, partial malformed
  rows, malformed envelopes/identity, invalid JSON, rate limit, provider
  failure, exact path/query encoding, and strict host rejection;
- contract strictness, boundedness, provider-scope language, and the absence of
  any field that can be mistaken for global study quality or replication
  verification;
- unchanged 21-tool MCP and 26-operation Action inventories.

## Documentation and closeout

Update the data-source/licensing and privacy documentation for the new internal
FORRT metadata lookup and richer Crossref events, while making clear that no
new session retention, public operation, production activation, or completion
authority is added. Update the roadmap and current-state checkpoint only after
tests pass.

Run focused tests throughout, then `npm run test:run` and `npm run verify`.
Inspect the complete diff, run lesson status, open a PR, review CI/security
results and the actual diff, merge only if all requirements pass, and start D2
from fresh `main`.

## Explicit non-goals

- no composite coordinator or signed receipt (Phase D2);
- no research-session integration (Phase D3);
- no Retraction Watch snapshot (Phase D4);
- no PubPeer, Epistemonikos, Scite, or commercial provider activation;
- no durable artifact storage;
- no canonical protocol, Custom GPT, plugin, public MCP, or public Action
  change;
- no study-quality score, “scientific” badge, replication verdict, or evidence
  ranking shortcut.
