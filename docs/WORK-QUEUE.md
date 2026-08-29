# AskRigor work queue

This is the durable owner-facing queue for future product and architecture
questions that are important but not authorized implementation work. A queued
item does not override the canonical protocols, expand an active task, or
authorize new collection, persistence, publication, or provider spending.

## Queued: cumulative living evidence repository

Status: architecture proposal complete; owner implementation/persistence
decision and required gates remain

Source: Joel, 2026-08-29

Design artifacts:

- `audits/2026-08-29-cumulative-living-evidence-prior-work.md` records the
  bounded standards, literature, implementation, and quality-framework scan and
  the explicit **compose** decision.
- `superpowers/specs/2026-08-29-cumulative-living-evidence-repository-design.md`
  proposes PostgreSQL as canonical authority, with explicit graph edges and
  Obsidian, Mermaid, full-text/search, and RO-Crate as generated views.
- `architecture/living-evidence-repository-map.md` is the living derived control
  surface for persistence, provenance, correction, freshness, and topic/evidence
  relationships.
- `superpowers/plans/2026-08-29-cumulative-living-evidence-pilot.md` defines the
  reversible single-topic pilot and keeps local implementation, Railway
  provisioning, and production integration behind separate gates.

The proposal selects a canonical architecture for review but does not authorize
collection, persistence, provisioning, provider spending, deployment, or
production integration.

### Desired outcome

Explore how AskRigor can become a cumulative, searchable repository system in
addition to a one-shot query system. Each run should be able to build on
validated prior work while current evidence, corrections, retractions, and
changed source access can update or invalidate what was previously known.

The design conversation should cover:

- a searchable map of topics and subtopics, including relationships among
  questions, claims, interventions, outcomes, populations, sources, and
  unresolved evidence gaps;
- reusable source and claim records with exact provenance, version history,
  retrieval dates, access boundaries, and links back to the research runs that
  produced or challenged them;
- study-quality assessments whose criteria, evidence, uncertainty, reviewer or
  validator provenance, and supersession history remain inspectable rather
  than collapsing into an unexplained score;
- YouTube comments and replies where storage, terms, copyright, privacy,
  retention, deletion, and API-policy review permit it, and a minimized
  alternative based on extracted evidence, non-identifying rediscovery leads,
  and corpus/access receipts where raw durable storage is not justified;
- freshness controls for new studies, corrections, retractions, updated
  guidelines, changed source content, changed quality judgments, and topics
  that have not been refreshed within a declared interval;
- retrieval that distinguishes current supported knowledge, historical or
  superseded knowledge, provisional interpretations, conflicts, unknowns, and
  stale or inaccessible evidence;
- an incremental update model that reuses valid prior work without allowing a
  stale summary, embedding, map, or ranking to overwrite newer canonical
  evidence.

### Architecture questions compared

Do not select a platform in advance. Compare at least a repository-native
knowledge graph, a queryable database/search index, Obsidian as an authoring or
inspection view, Mermaid as a generated navigational map, and a hybrid in which
views are derived from canonical structured evidence. Evaluate bidirectional
traceability, full-text and metadata search, graph traversal, incremental
updates, conflict representation, portability, backup/restore, schema
migration, privacy boundaries, and operating cost.

The research-before-reinvention scan compared repository-native graphs,
queryable databases/search, Obsidian, Mermaid, and a hybrid. The proposed
answer is a hybrid with PostgreSQL structured records and explicit edges as the
only canonical transactional authority. Obsidian, Mermaid, RO-Crate, full-text
indexes, and any later embeddings remain rebuildable projections. The proposed
single-topic pilot tests whether PostgreSQL alone answers the fixed retrieval,
update, portability, and deletion questions before adding a graph or vector
service.

### Required gates before implementation

- owner decision on product scope, canonical authority, and acceptable
  persistence;
- an updated privacy/data-flow/retention/deletion threat model, including
  YouTube and other provider terms;
- an explicit source-licensing and quotation policy;
- a reviewable study-quality rubric and disagreement/supersession model;
- freshness ownership, invalidation rules, monitoring cadence, and failure
  states that never present stale data as current;
- rollback, export, portability, and deletion acceptance criteria.

The current product intentionally has no durable full-text, transcript,
candidate-packet, treatment-landscape, or server-side comment corpus. The
design artifacts and queue update do not change that boundary. Until the active
YouTube compliance review and the exact durable-field decision are complete,
the proposed pilot stores zero YouTube/community records.
