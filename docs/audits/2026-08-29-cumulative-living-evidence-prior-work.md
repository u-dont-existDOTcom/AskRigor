# Cumulative living evidence repository: prior-work scan

Date: 2026-08-29
Status: complete design-stage scan; implementation not authorized
Decision: **compose** mature provenance, living-review, evidence-map, and
research-object patterns around AskRigor's existing claim and receipt contracts

## Independent conception snapshot

Before the external scan, Joel's working concept was preserved as follows:

- AskRigor should become a cumulative repository, not only a one-shot query
  system.
- Every topic and subtopic should be searchable and visibly connected.
- Prior runs should contribute reusable knowledge, including study findings,
  study-quality judgments, and useful material derived from YouTube comments
  where lawful and policy-compliant.
- A future run should build on validated prior work without allowing old
  summaries, maps, or rankings to become stale authority.
- Obsidian, Mermaid, a database, or a hybrid were possibilities rather than a
  preselected answer.

That snapshot identifies the real problem as versioned evidence reuse with
freshness and correction propagation, not merely note storage or semantic
search.

## Scan question and boundary

What established standards, review workflows, evidence products, quality
frameworks, and mature implementations already solve parts of a versioned,
searchable health-evidence repository? Which AskRigor-specific remainder still
requires design?

The bounded scan covered provenance standards, research-object packaging,
atomic claim models, living systematic reviews, evidence maps, research
knowledge graphs, risk-of-bias and certainty frameworks, PostgreSQL, and the
current YouTube API policy boundary. It did not treat vendor marketing or a
generic note-taking application as architecture evidence.

## Existing work inventory

| Existing work | What it already solves | AskRigor disposition |
| --- | --- | --- |
| [W3C PROV-O](https://www.w3.org/TR/prov-o/) | Standard vocabulary for entities, activities, agents, derivation, revision, invalidation, collections, and bundles | **Reuse** as the external provenance vocabulary and map AskRigor records to it; do not replace exact internal receipts with generic triples |
| [RO-Crate 1.3](https://www.researchobject.org/ro-crate/specification/1.3/index.html) | Portable JSON-LD packaging of related research objects and metadata | **Adapt** as the export/interchange package, with hashes and an AskRigor profile |
| [Nanopublication guidelines](https://nanopub.net/guidelines/working_draft/) | Small assertion/provenance/publication-information units | **Adapt** the atomicity principle for claims; do not require RDF as the transactional store |
| [Cochrane living systematic review guidance](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-22) | Recurrent surveillance and incorporation of new eligible evidence into an otherwise standard systematic review | **Adapt** its update discipline and explicit living status; AskRigor still needs source-specific cadence and failure states |
| [Epistemonikos matrix](https://hps-primary.epistemonikos.org/en/about_us/how_to_use) | Navigable relationships between systematic reviews and their included primary studies, including related evidence | **Compose** a review-to-study matrix view over canonical relationships |
| [3ie evidence gap maps](https://www.3ieimpact.org/evidence-hub/evidence-gap-maps) | Intervention-by-outcome evidence maps, linked studies/reviews, gaps, and review confidence | **Compose** a topic-facing matrix/map; preserve AskRigor's exact population, program, comparator, horizon, and uncertainty dimensions |
| [Open Research Knowledge Graph](https://docs.orkg.org/) | Mature structured scholarly comparisons and knowledge-graph workflows | **Benchmark** graph navigation and comparison UX; do not adopt it as the transactional authority before a focused fit test |
| [RoB 2](https://www.riskofbias.info/welcome/rob-2-0-tool/current-version-of-rob-2) | Domain-based risk-of-bias assessment for randomized trials | **Adapt** through versioned rubric profiles where applicable; keep the exact answers, evidence, and judgment provenance |
| [AMSTAR 2](https://www.amstar.ca/Amstar-2.php) | Sixteen-item appraisal of systematic reviews with critical domains | **Adapt** where applicable. Its authors explicitly discourage reducing the result to an overall score, matching AskRigor's domain-led model |
| [GRADE](https://www.gradeworkinggroup.org/) | Outcome-specific certainty assessment across a body of evidence | **Reuse by reference**, not as a study-quality score; store the exact profile and rationale when GRADE is actually applied |
| [PostgreSQL](https://www.postgresql.org/docs/current/index.html) | Transactions, constraints, recursive queries, full-text search, indexing, row security, and portable logical dumps | **Compose** as the first canonical store; test before adding a graph or vector database |
| [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) | Managed deployment path with private-by-default service connectivity and a standard `DATABASE_URL` | **Experiment later** as a reversible pilot host only after persistence gates are approved |
| Obsidian and Mermaid | Human-readable notes and navigational diagrams | **Generate** from canonical records; neither can resolve concurrency, integrity, access control, or invalidation as the source of truth |

## What is solved, partial, incompatible, and unresolved

### Solved enough to reuse

- Stable entity/activity/agent provenance vocabulary.
- Portable research-object export.
- Atomic assertion packaging.
- Living-review surveillance as a process pattern.
- Review-to-study and intervention-to-outcome map views.
- Domain-led assessment frameworks that preserve reasons rather than a prestige
  label.
- A relational database capable of transactional graph edges, ordinary search,
  recursive traversal, and exact constraints at pilot scale.

### Partially solved and requiring AskRigor adaptation

- Freshness: a publication search cadence is not the same as a retraction,
  source-content, provider-access, guideline, transcript, or comment refresh
  cadence.
- Claim identity: external systems rarely bind a normalized claim to
  AskRigor's exact source-version hash, program/population/outcome/horizon, and
  capability ceiling.
- Quality: generic tools do not preserve AskRigor's current study and review
  domain findings, unresolved fields, receipt hashes, and explicit
  `can_support` / `cannot_support` / `uncertain` capabilities as one auditable
  lineage.
- Community evidence: mature scholarly repositories do not supply AskRigor's
  creator/comment separation, person-by-treatment-episode model, completeness
  receipts, or identifier-minimization requirements.
- Correction propagation: provenance standards can express revision, but the
  application must identify and recalculate every dependent current projection.

### Incompatible as canonical authority

- One editable Markdown or Obsidian vault: convenient for people but weak for
  transactional integrity, concurrent updates, exact constraints, and complete
  deletion accounting.
- Mermaid diagrams: excellent control surfaces, but derived renderings can be
  stale and cannot become evidence.
- An embedding-only knowledge base: similarity is not identity, entailment,
  provenance, freshness, or supersession.
- A single unexplained study score: it erases domain disagreements,
  applicability, source access, rubric version, and outcome-specific certainty.
- Raw durable YouTube comment storage as a default: the current product privacy
  contract excludes it, and current [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies)
  impose refresh/deletion and use constraints on stored API data.

### Genuinely unresolved remainder

1. The exact canonical record model that joins AskRigor's existing source,
   audit, research-run, and finalization receipts without weakening them.
2. Which freshness policy applies to each source class and who owns failed or
   overdue checks.
3. Whether the minimum useful pilot needs more than PostgreSQL recursive edges
   and full-text search.
4. Which durable, non-identifying community-derived fields YouTube will permit
   after the active API compliance review, if any.
5. The source-licensing and quotation policy for durable excerpts beyond public
   identifiers, normalized findings, hashes, and locators.
6. How a corrected or invalidated claim propagates into cached reports,
   generated maps, quality judgments, and query projections without deleting
   historical evidence.

## Composition decision

Build the novel remainder as a thin AskRigor application layer over established
parts:

1. PostgreSQL is the canonical transactional store.
2. AskRigor's exact receipts and hashes remain the internal audit authority.
3. W3C PROV-O supplies the external provenance mapping.
4. RO-Crate/JSON-LD supplies portable export.
5. Atomic claims borrow nanopublication separation of assertion and provenance.
6. Living-review and evidence-map patterns supply refresh workflow and generated
   review/study and intervention/outcome views.
7. Obsidian and Mermaid are rebuildable human views.
8. Search indexes and any later embeddings are rebuildable projections, never
   canonical facts.

This is a **compose** decision. The bespoke part is limited to AskRigor's exact
claim-capability, access-state, program-fingerprint, community-evidence,
freshness, and correction-propagation contracts.

## External baselines for the pilot

The pilot must compare the proposed relational model against these practical
baselines:

- a flat bundle of the same records in Markdown/JSON;
- PostgreSQL full-text search plus explicit edge traversal;
- generated Epistemonikos-like review/study and 3ie-like
  intervention/outcome maps; and
- optional embedding retrieval only if a fixed query set shows a material miss
  that lexical and structured retrieval cannot repair.

A separate graph database, vector database, or editable Obsidian authority is
not justified by feature availability alone. It must win a role-relevant
retrieval, update, or operability test.

## Research debt and rescan triggers

The design scan is sufficient for a reversible single-topic pilot. Rescan is
required before any of the following:

- production-scale ingestion or a public novelty claim;
- durable storage of raw source bodies, transcripts, comments, author
  identities, or health narratives;
- a graph/vector service becoming a production dependency;
- adoption of a formal quality framework outside its intended study/design
  scope;
- automated clinical recommendation or population-level effectiveness
  ranking from repository records; or
- a material provider-policy, model, schema, or deployment change.

## Source and access note

This scan used current public documentation on 2026-08-29. Provider and policy
pages are time-sensitive and must be rechecked at implementation. The design is
an engineering and privacy boundary, not a legal determination that any
particular source may be copied or retained.
