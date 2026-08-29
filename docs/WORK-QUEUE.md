# AskRigor work queue

This is the durable owner-facing queue for future product and architecture
questions that are important but not authorized implementation work. A queued
item does not override the canonical protocols, expand an active task, or
authorize new collection, persistence, publication, or provider spending.

## Queued: cumulative living evidence repository

Status: owner brainstorming and architecture decision required

Source: Joel, 2026-08-29

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

### Architecture questions to compare

Do not select a platform in advance. Compare at least a repository-native
knowledge graph, a queryable database/search index, Obsidian as an authoring or
inspection view, Mermaid as a generated navigational map, and a hybrid in which
views are derived from canonical structured evidence. Evaluate bidirectional
traceability, full-text and metadata search, graph traversal, incremental
updates, conflict representation, portability, backup/restore, schema
migration, privacy boundaries, and operating cost.

Before bespoke design, run the current research-before-reinvention scan across
evidence graphs, living systematic reviews, evidence surveillance, research
repositories, and mature knowledge-management tools. Define a small reversible
pilot only after the scan and owner discussion identify the canonical data
model and the decision the pilot must resolve.

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
candidate-packet, treatment-landscape, or server-side comment corpus. This
queue entry does not change that boundary.
