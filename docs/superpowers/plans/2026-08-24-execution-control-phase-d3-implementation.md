# Phase D3 formal-evidence session enforcement

**Status:** implementation plan for roadmap Phase D3 only
**Branch:** `agent/execution-control-phase-d3-20260824`
**Base:** `d75d316952baaf179857cdc48930b07aa23c4cac`

## Goal

Connect formal discovery, open-full-text depth, source-linked method audit, and
the Phase D2 external-study evidence operation to the existing authoritative
research session. A caller must not be able to skip a material program, submit
provider-completion claims, cite an abstract or unseen paper as inspected, mix
source/receipt identities, or use an unresolved linked source without the
controller keeping finalization closed.

This phase remains an internal non-production prototype. It does not add a
public Action/MCP operation, successful finalization permit, durable store,
provider activation, deployment change, or generated Custom GPT/plugin change.

## Existing mechanisms reused

- Extend `research-session-controller.ts`, its bounded store, prototype
  projection, and transition checks; do not create a second completion
  authority.
- Derive formal hypotheses from the existing reconciled and semantically
  screened candidate frontier, preserving exact program signatures and the
  literal `program not described` boundary.
- Call the existing PubMed and Europe PMC source adapters directly through
  server dependencies. Provider envelopes, pagination, identifiers, and access
  states remain authoritative; a worker does not recreate them as JSON.
- Reuse the exact `acquire_open_full_text` / `continue_open_full_text` engine
  and handle store. Refactor only enough to expose an internal executor used by
  both the existing Action routes and the research session.
- Reuse the existing study/review method-audit validators and receipts.
- Reuse the Phase D2 external-evidence coordinator, receipt verifier, typed
  evidence references, and bounded in-memory artifact store.

## Design

### 1. Controller-owned formal hypothesis frontier

Add a bounded formal-evidence state inside the current session. After candidate
screening, the server derives one formal-search hypothesis for each materially
distinct program/outcome/stage/horizon fingerprint. Candidate duplicates may
share a hypothesis, but a generic label cannot collapse different program
signatures. A material candidate whose program is not described still creates
an explicit unresolved hypothesis; missing fields are never filled from model
memory.

Each record carries a deterministic hypothesis ID/digest, exact source video
IDs, program signature/fields, treatment class, claimed outcome/horizon, stage,
and a bounded provider query generated from those recorded fields. The session
schema verifies that the hypothesis frontier is exactly derivable from the
screened candidate state. A caller cannot omit or rename a material
hypothesis.

### 2. Formal search and source selection

For each hypothesis, the controller calls PubMed and Europe PMC itself. It
stores only bounded normalized search receipts and source identities:

- exact provider/query/page/cursor/exhaustion/access state;
- PMID, PMCID, canonical DOI when reported, title, author/year, publication
  types, canonical URL, and provider identity hash;
- source/abstract visibility and explicit provider limitations;
- hypothesis provenance and de-duplication by exact identifier/hash.

Retryable failures remain executable. Terminal provider boundaries remain
source/query-local. Pagination cannot be skipped or marked exhausted by a
caller. A bounded semantic source-screening work package may classify every
retrieved identity as decision-important or not, bind source type and possible
decision impact, and explain the decision. The server verifies the exact
frontier digest, requires every source once, and requires at least one selected
source for every hypothesis that produced candidates. This validation binds
worker judgment; it does not certify semantic truth.

The top-level formal-search operation becomes complete only when every formal
hypothesis has terminal provider receipts and every returned identity has a
validated screening decision.

### 3. Per-source open-full-text depth

Every decision-important source receives its own access state. Exact-DOI
sources are scheduled through the existing open-full-text executor. The
controller retains discovery attempts, opaque document handle, exact provider
source/version identity, content hash, block/segment totals, cumulative depth,
and exhaustion/synthesis receipt, but no full-text blocks.

Available text must be continued contiguously to exhaustion. Wrong source,
wrong handle, decreasing/mixed counts, changed content identity, unknown
version, or an unexhausted chain cannot open method audit. Expired/restart
chains discard stale depth and all dependent audits before retrying.

A source lacking a verified DOI or a source for which lawful acquisition is
exhausted becomes a `possibly useful lead` with exact attempts, unseen-content
boundary, and claim-local possible impact. It cannot contribute unrestricted
decision-important claims, but it does not freeze unrelated executable work.

### 4. Exact method-audit binding

After full-text exhaustion, the controller issues a source work package naming
the exact document handle, content hash, source identity/version, source kind,
and required study or review audit. It accepts only the existing server-
validated Action output and checks the full-text exhaustion receipt, handle,
source primary identifier, content hash, required domain coverage, and audit
kind before recording a compact audit receipt projection.

Unknown document blocks, identity/hash mismatch, missing domains, an abstract,
metadata-only record, unseen source, or caller-authored audit-complete field
cannot advance state. Inaccessible leads receive no synthetic method audit.

### 5. External study evidence and linked work

Every decision-important DOI study automatically schedules
`external_study_evidence_audit` after its exact method audit. The controller
invokes the Phase D2 coordinator and verifies its signed receipt against the
current session, study DOI/identity, exact protocols, provider attempts,
artifacts, and bundle.

Crossref and FORRT attempts are mandatory and unique. Missing, forged, mixed,
cross-source, cross-session, cross-protocol, or invalid provider receipts fail.
Retryable provider failures remain executable; configured/mandatory omissions
cannot become coverage gaps. No-match remains provider-scoped.

The session stores compact per-study provider/receipt/bundle projections,
directives, unresolved items, possible decision impact, claim-local
limitations, and linked item/source IDs. It does not store provider bodies.
Decision-changing replication/reproduction and publication-notice identities
become explicit linked-source work. Linked scientific sources enter the same
full-text/method/external pipeline; exact notices/messages use a bounded
source-linked work package and receipt. An unaudited provider label never
becomes a replication or contradiction conclusion.

### 6. Claim-capability recalculation

The controller derives, per source, whether ordinary effect use is:

- unavailable because only metadata/abstract/unseen content was inspected;
- limited to the original exact method-audit receipt;
- excluded by an active retraction/withdrawal;
- awaiting linked-source work;
- awaiting external-evidence-bound recalculation; or
- current under an exact externally bound method-audit receipt.

When external evidence changes a source audit, completion of linked work alone
does not restore old capabilities. A worker must submit the existing typed
external-evidence-bound study audit against the exact full-text index and
current signed external bundle. The server revalidates all document blocks,
external item references, receipt identity, and capability statements before
claim capability changes. New external evidence invalidates the prior
recalculation.

### 7. Session operations, capabilities, and immutability

Extend the current operation/capability vocabulary with per-study external
evidence, linked-source audit, and claim-capability recalculation. Top-level
operation status is projected from all per-hypothesis/per-source states; one
completed study cannot complete a multi-study operation.

The session view exposes only bounded diagnostics and work packages. The
transition guard makes completed formal searches, source identities, exhausted
full-text receipts, method audits, external receipts, and completed linked work
immutable. Any restart invalidates all dependent state rather than reusing a
stale receipt.

The one top-level answer boundary remains unchanged and successful
finalization remains disabled until Phase F. Phase D3 nevertheless adds
explicit denial reasons and mutation checks so incomplete/forged formal state
cannot become unrestricted use or unlock downstream synthesis.

## Hostile tests

Add focused fixtures/tests proving at least:

- every material distinct program/outcome hypothesis creates formal work;
- renamed, omitted, duplicate, or generic-pooled hypotheses fail;
- formal providers are called by the server and caller pagination/count/
  exhaustion/completion claims cannot advance state;
- mixed provider/source identities and forged semantic selection digests fail;
- an abstract-only or inaccessible source remains an unseen claim-local lead;
- accessible text is continued to exact exhaustion and unexhausted/mixed/
  changed-content chains cannot open method audit;
- unknown blocks, wrong hash/handle/source kind, and missing study/review audit
  domains fail;
- method audit automatically schedules external evidence for each exact study;
- Crossref/FORRT omission, provider failure hidden as no-match, forged or mixed
  signed receipts, and cross-study/session/protocol receipts fail;
- retraction/withdrawal excludes ordinary effect use; correction/update makes
  the old source audit stale; expression of concern cannot disappear;
- provider-reported replication labels create linked work and cannot become a
  conclusion before source audit;
- linked-source completion remains source/receipt-bound;
- changed external evidence requires claim-capability recalculation, and an
  old/external-unbound audit cannot restore capability;
- removing each major formal/full-text/method/external/linked check breaks a
  mutation regression;
- public inventory remains exactly 21 MCP tools and 26 Actions.

## Documentation and closeout

Update the roadmap D3 checkboxes, current-state checkpoint, and applicable
privacy/source-access documentation after the tests pass. Record that session
state remains bounded/ephemeral and contains no full text, raw provider body,
credential, or portable medical/research prose beyond the already approved
session target and bounded source metadata.

Run focused tests throughout, then `npm run test:run` and `npm run verify`.
Inspect the complete diff, run lesson status, open/review a PR, require hosted
deterministic/workflow/CodeQL checks, merge, discard the worktree, and begin D4
from fresh `main` unless its snapshot persistence/cron choice reaches the
roadmap's Phase G owner/privacy gate.

## Explicit non-goals

- no successful finalization permit (Phase F);
- no bidirectional/treatment-space finalization (Phase E);
- no verified local Retraction Watch snapshot or cron (D4/Phase G gate);
- no PubPeer, Epistemonikos, Scite, or commercial-provider activation;
- no durable session/artifact/full-text store (Phase G owner gate);
- no private orchestration API, Hermes, n8n, or production UI (Phases H-J);
- no public Action/MCP inventory, canonical protocol, generated Custom GPT,
  plugin, deployment, or production configuration change.
