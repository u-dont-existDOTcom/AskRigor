# AskRigor work queue

This is the durable owner-facing queue for future product and architecture
questions that are important but not authorized implementation work. A queued
item does not override the canonical protocols, expand an active task, or
authorize new collection, persistence, publication, or provider spending.

## Queued: cumulative living evidence repository

Status: local isolated pilot implemented and merged in PR #128; exact
production study-audit read-through authorized and active under
`askrigor-living-evidence-readthrough-v1`; Railway hosting remains optional and
unprovisioned

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

The owner approved the isolated pilot, Railway use, and durable storage of the
complete AskRigor-authored study/review analysis to the extent performed,
including later clarifying versions. This approval remains bounded by the
active task lock, source-storage policy, privacy threat model, $5 monthly pilot
ceiling, no-public-endpoint rule, and prohibited-data classes. Production
study-audit read-through was separately authorized on 2026-08-29. Automatic
public-run write-through, review/external-audit reuse, and durable
YouTube/community records remain outside that active phase.

Local PostgreSQL implementation, protected review, merge, and restore
acceptance pass. Railway remains
unprovisioned because its workspace-wide $10 minimum hard limit and minimum
paid-volume shape cannot enforce the approved $5/1-GiB boundary; relaxing that
boundary is the remaining owner decision for the optional hosted phase.

### Desired outcome

Explore how AskRigor can become a cumulative, searchable repository system in
addition to a one-shot query system. Each run should be able to build on
validated prior work while current evidence, corrections, retractions, and
changed source access can update or invalidate what was previously known.

The design conversation should cover:

- a durable research frontier rather than a final-answer cache: exact discovery
  passes, searched date windows, pagination/exhaustion state, candidates found,
  inclusion/exclusion/defer reasons, unresolved questions, and promising trails
  that were not yet attempted or exhausted;
- delta-oriented continuation in which a later run starts from that frontier,
  revalidates what may have changed, searches the interval since the last
  complete pass, looks for newly relevant studies/videos/comments, and then
  deepens, challenges, or extends prior analysis;
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

A rendered prior answer is a derived output, not the repository unit that makes
AskRigor smarter. The canonical reusable base must distinguish what is known,
what was merely considered, where and when discovery looked, what coverage was
actually obtained, and what executable work remains. For YouTube specifically,
the desired frontier includes video identities and selection state, requested
and observed comment date ranges, provider-reported versus API-visible counts,
pagination/sampling/exhaustion receipts, interesting-comment leads or extracted
findings, and unsearched channels/videos/query variants. Those durable fields
remain inactive while the Google compliance answer and field-by-field owner
gate are pending.

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

The current product intentionally has no durable raw full-text, transcript,
candidate-packet, treatment-landscape, or server-side comment corpus. The pilot
adds durable AskRigor-authored analyses and their exact provenance; it does not
add a raw source corpus. Until the active YouTube compliance review and the
exact durable-field decision are complete, the pilot stores zero
YouTube/community records.
