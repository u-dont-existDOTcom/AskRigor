# Phase D2 composite external-evidence audit and receipt

**Status:** implementation plan for roadmap Phase D2 only
**Branch:** `agent/execution-control-phase-d2-20260824`
**Base:** `bf716e40e04fc025e5fe0ceebd9ce199e51df3b5`

## Goal

Turn the Phase D1 Crossref/FORRT primitives into one internal server-owned
external-study evidence operation. The operation must derive its own provider
work, normalized bundle, directives, limitations, content-addressed artifacts,
and signed receipt. It remains outside the public MCP and Action inventories
and does not advance research-session state until Phase D3.

## Existing mechanisms reused

- `checkCrossrefPublicationIntegrity` and
  `lookupForrtReplicationRelationships` remain the only open-core provider
  adapters. No competing Crossref or FORRT client is introduced.
- `studyExternalEvidenceBundleSchema` remains the canonical normalized record.
- Existing protocol manifest objects supply the exact HRP/Universal identities.
- Existing HMAC-SHA256 receipt/continuation patterns supply minimum-secret,
  domain-separation, canonical-payload, and timing-safe verification behavior.
- The existing public `studyMethodAuditSubmissionSchema`, receipt schema, and
  open-full-text Action remain unchanged. External references use a separate
  internal compatibility layer in the same study-audit module.

## Design

### 1. Content-addressed in-memory artifact store

Add `apps/research-mcp/src/actions/evidence-artifact-store.ts` with:

- a strict artifact descriptor containing an opaque content-derived artifact
  ID, SHA-256, media type, public provider/source identity, byte count, and
  creation time;
- a small `EvidenceArtifactStore` interface supporting put/read/has/revoke;
- one bounded in-memory implementation with clone-on-write/read, exact byte and
  entry ceilings, content deduplication, deterministic IDs, and no timer;
- no disk, database, object storage, environment URL, or production singleton.

The coordinator stores normalized provider envelopes as JSON artifacts. The
abstraction is capable of holding later authorized raw responses, notices, or
discussion artifacts, but Phase D2 does not acquire or persist those new
content classes.

### 2. Internal coordinator input and dependencies

Add `apps/research-mcp/src/actions/study-external-evidence.ts`.

The strict input contains only:

- one authoritative research-session ID;
- one bounded DOI/DOI-URL identifier.

It accepts no caller-authored provider list, completion Boolean, counts,
identity status/hash, protocol hash, bundle hash, directive, limitation,
artifact hash, or receipt field.

Construction dependencies provide:

- exact current Universal/HRP manifest identities;
- Crossref configuration;
- server-held receipt secret and nonsecret key ID;
- clock and in-memory artifact store;
- provider executors, defaulting to the D1 adapters, injectable only for
  hermetic tests.

The secret must contain at least 32 UTF-8 bytes. The key ID is bounded and
non-secret. Configuration adds placeholder-only environment readers; it does
not activate a runtime route.

### 3. Identity and provider execution

The coordinator canonicalizes the DOI, calls Crossref first, and derives the
verified identity from a successful exact Crossref DOI/source response. A
Crossref identity failure stops before FORRT and returns no signed audit
receipt. The caller cannot assert that identity resolution happened.

After verified identity, the coordinator calls FORRT itself. Crossref and FORRT
envelopes are converted into exact provider-attempt records. A successful
provider no-match remains provider-scoped. Partial, inaccessible, rate-limited,
not-found, malformed, and transport failure remain literal and never become a
negative scientific result.

The initial optional providers (Retraction Watch local snapshot, PubPeer,
Epistemonikos, and Scite) are represented as explicit `not_configured`
coverage attempts/limitations. Phase D2 does not add their hosts or credentials.

### 4. Bundle, directives, and unresolved work

The server constructs and strict-parses one normalized bundle. It derives:

- publication events and FORRT relationships from exact provider output;
- provider-scoped limitations for no marker/no match/partial/failure and
  unconfigured optional sources;
- notice-audit/exclusion/invalidation directives for publication events;
- linked-source-acquisition directives for every provider-reported
  replication/reproduction relationship;
- bounded unresolved items and claim-local limitations for every material
  provider boundary or not-yet-audited linked item.

Provider labels never set implementation/source audit status to complete and
never create a quality, validity, reliability, or replication-verification
field.

The bundle hash is SHA-256 over a recursively key-sorted canonical JSON form of
the complete bundle payload excluding `bundle_hash`. Arrays retain their
semantic order; provider attempts and generated directives are deterministically
ordered before hashing.

### 5. Server-issued receipt

The strict receipt includes:

- receipt name/version and fixed domain;
- session ID;
- canonical study identity hash;
- exact Universal and HRP protocol identities/hashes;
- complete provider-attempt records;
- normalized provider artifact IDs/content hashes;
- normalized bundle hash;
- issued time and key ID;
- a SHA-256 receipt-payload digest;
- an HMAC-SHA256 base64url signature derived with a fixed external-evidence
  domain-separation label.

Verification requires the receipt, exact expected session/study/protocol/bundle
context, and server secret. It strict-parses the receipt, recomputes hashes,
compares context, and verifies the signature with `timingSafeEqual`.
Cross-study, cross-session, cross-protocol, cross-bundle, cross-provider-
artifact, tampered, malformed, and wrong-secret receipts fail.

The receipt carries a literal limitation that it proves structural provenance
and execution, not that the normalized interpretation or provider assertion is
scientifically true.

### 6. Typed method-audit references without a public schema change

Keep the existing public submission/receipt schemas and validator byte-for-byte
compatible. Add separate internal schemas and a validator for an
external-evidence-bound study audit:

- external references contain receipt-payload SHA-256, canonical study
  identity hash, provider, item kind, and item hash;
- only `replication_contradiction_and_evidence_ancestry` may contain those
  references;
- other domains retain the existing document-block requirements and reject
  external references;
- the ancestry domain may use real document blocks, verified external
  references, or both; it cannot use invented `jats_*`/`pdf_*` IDs;
- every external reference must exist in the verified current bundle under the
  declared provider and item kind;
- the submission and resulting receipt bind the external receipt digest,
  identity hash, and bundle hash;
- changed/tampered/cross-study external evidence invalidates validation.

The extended receipt remains an internal controller artifact in D2. Existing
public Action/OpenAPI schema snapshots must remain exact.

## Hostile tests

Add focused tests proving:

- the coordinator calls Crossref then FORRT itself and rejects caller
  completion/provider/count/hash injection;
- failed Crossref identity verification stops before FORRT and emits no receipt;
- complete, no-match, relationship, partial, rate-limit, inaccessible, and
  malformed provider states remain distinct;
- retraction, withdrawal, expression of concern, correction, reinstatement,
  and linked repetitions create the required directives/unresolved work;
- optional providers cannot silently disappear;
- bundle hashing is deterministic and changes when material evidence changes;
- artifact bytes are cloned, deduplicated, bounded, and absent from session or
  portable receipt state;
- tampered/cross-session/cross-study/cross-protocol/cross-bundle/wrong-secret
  receipts fail;
- provider-reported replication wording cannot become audited or verified;
- the ancestry domain can cite verified external items without fake blocks;
- other domains still require real document blocks and reject external refs;
- unknown/mismatched external item hashes or receipts fail;
- existing public study-audit and 21-tool/26-Action schemas remain unchanged.

## Documentation and closeout

Update the external-source boundary, privacy map, roadmap, and current-state
checkpoint after all gates pass. Document placeholder receipt configuration,
in-memory-only artifacts, absence of raw content from receipts/session state,
and structural-not-semantic receipt meaning.

Run focused tests throughout, then `npm run test:run` and `npm run verify` at
the host boundary. Inspect the complete diff, run lesson status, open/review a
PR, require deterministic CI/workflow policy/CodeQL, merge, discard this
worktree, and begin Phase D3 from fresh `main`.

## Explicit non-goals

- no research-session integration or completion-state advancement (D3);
- no durable artifact store or retention decision (Phase G owner gate);
- no Retraction Watch snapshot sync (D4);
- no PubPeer, Epistemonikos, Scite, or commercial-provider activation;
- no new public Action/MCP operation or generated Custom GPT/plugin change;
- no production deployment/config activation;
- no global study-quality score, scientific badge, or provider-outcome verdict.
