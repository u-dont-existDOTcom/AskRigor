# Cumulative living evidence repository pilot

Status: proposed — architecture documented; provisioning and persistence are
not authorized

Assurance lane: private, isolated, reversible product experiment after owner
and privacy gates

## Objective

Implement a single-topic pilot that tests whether PostgreSQL can be AskRigor's
portable canonical living-evidence store while Obsidian, Mermaid, full-text
search, and RO-Crate remain generated views. The pilot must prove exact
provenance, history, freshness, correction propagation, export, deletion, and
restore without changing production or persisting raw research/community data.

Design authority:

- `../specs/2026-08-29-cumulative-living-evidence-repository-design.md`
- `../../audits/2026-08-29-cumulative-living-evidence-prior-work.md`
- `../../architecture/living-evidence-repository-map.md`

## Current state and recovery

- Design branch: `agent/living-evidence-architecture-20260829`
- Design baseline: AskRigor `main` commit
  `48553d823f128000dded1d86fdd0ff091a545662`
- Railway is connected with app-specific “Allow all actions,” but this task
  deliberately uses no Railway mutation. The available Codex session does not
  expose Railway project/service actions in any case.
- Existing production, Custom GPT, public 21-tool MCP, canonical protocols,
  and durable privacy boundaries are unchanged.
- The original checkout contains unrelated owner files and must not be used for
  pilot work. Continue in a dedicated task worktree/branch.

## Phase 0 — decision and policy gates

Do not begin implementation until the owner approves the optimized brief and
the following artifacts exist:

- [ ] exact pilot topic and fixture inventory;
- [ ] allowed and prohibited data-class matrix;
- [ ] updated privacy/data-flow/retention/deletion and backup threat model;
- [ ] source licensing and quotation policy;
- [ ] exact study/review rubric profiles and disagreement rules;
- [ ] freshness cadence/owner/failure table by source class;
- [ ] YouTube compliance decision for every proposed durable community field;
- [ ] Railway project/environment, resource/spend limits, access roles, secret
  boundary, and rollback target; and
- [ ] explicit authorization to provision the isolated pilot.

If YouTube review is unresolved, the pilot proceeds with **zero YouTube or
community-derived durable records**. That limitation does not block the formal
evidence schema experiment.

## Phase 1 — executable contract and schema fixtures

1. Add a versioned schema package outside the public MCP tool surface.
2. Encode typed tables, enums, foreign keys, uniqueness constraints, immutable
   version rules, and allowlisted edge types from the design.
3. Map current study/review audit, bounded-evidence, and finalization receipts
   to import DTOs without changing those public/runtime schemas.
4. Build a reviewed fixture pack from the approved hip osteoarthritis PRP
   evidence only. Fixtures contain public identifiers, normalized nonverbatim
   claims, hashes, domain findings, unresolved fields, relationships, and
   synthetic events—never raw source text or personal data.
5. Add schema and fixture manifests with exact SHA-256 hashes and explicit
   source/access/retention classes.

Verification:

- migrations create a clean local PostgreSQL database;
- invalid edge types, orphan versions, missing receipt bindings, mutable
  history, and unclassified artifacts fail closed;
- fixtures contain no credentials, raw source/comment/transcript bodies, author
  identities, prompts, provider responses, or personal health information; and
- current production/public inventories remain byte-identical.

## Phase 2 — repository service and current projection

1. Implement private ingestion and query functions with separate reader,
   writer, refresh-worker, migration, and backup roles.
2. Make ingestion idempotent on stable IDs, version hashes, and receipt hashes.
3. Store source, claim, assessment, and event history append-only.
4. Implement the transactional current projection and a blocked
   `stale_pending_impact` state.
5. Implement exact-identifier, structured, PostgreSQL full-text, and recursive
   edge queries.
6. Emit machine-readable query receipts naming canonical version IDs and the
   projection generation used.

Hostile tests:

- replayed imports;
- hash collision/mismatch simulations;
- conflicting identifiers;
- cycles in edge classes that must be acyclic;
- source correction with dependent claims;
- retraction and access loss;
- partial impact-worker failure;
- stale projection replay;
- assessment disagreement and later adjudication; and
- a generated-view attempt to reintroduce a superseded claim.

## Phase 3 — freshness and correction propagation

1. Add per-source-class policy records, leases, retries, and missed-run states.
2. Use fixture-only refresh workers initially; no live provider calls.
3. Inject synthetic no-change, changed-content, correction, retraction,
   inaccessible, and rubric-revision events.
4. Traverse affected evidence bindings, claims, assessments, and reports.
5. Require an impact receipt before a new current projection becomes visible.
6. Prove that stale/inaccessible states are expressed as coverage limits, not
   negative evidence.

Acceptance requires every affected current query and generated view to change
consistently while historical queries preserve the prior state and reason.

## Phase 4 — generated views and portability

1. Generate a read-only Obsidian bundle with stable internal links and a clear
   “derived from canonical database” banner.
2. Generate topic/subtopic, review/study, intervention/outcome, claim-lineage,
   and freshness Mermaid views.
3. Export the same repository as RO-Crate/JSON-LD with W3C PROV mappings.
4. Create a logical database dump, export inventory, excluded-artifact list,
   deletion manifest, and event-chain receipt.
5. Wipe only the disposable local pilot database, restore it, regenerate every
   view, and compare counts, stable IDs, source/receipt hashes, histories, and
   current query results.

The normal command must end by printing the exact smallest review artifact,
for example:

```text
REVIEW THIS FILE: /absolute/path/living-evidence-pilot-review.zip
```

The bundle contains no database credential or prohibited source content.

## Phase 5 — fixed retrieval decision benchmark

Run an owner-reviewed set of queries across:

- flat Markdown/JSON fixture search;
- PostgreSQL exact/structured/full-text plus edge traversal; and
- an optional temporary embedding index only if PostgreSQL misses a material
  semantic query.

Measure answerability, exact provenance, stale/superseded filtering, correction
propagation, latency, operational complexity, backup/restore, and deletion.

Decision rules:

- retain PostgreSQL-only if it answers all material queries and passes
  integrity/operability gates;
- add `pgvector` only for a demonstrated semantic-recall gap that cannot be
  repaired by aliases, structured fields, or full-text configuration; and
- consider a separate graph service only for a demonstrated traversal or
  scaling failure, with a separate consistency and rollback design.

## Phase 6 — optional Railway pilot

This phase requires a fresh explicit provisioning authorization after local
acceptance.

1. Re-run `npm run lessons:status` and policy/provider freshness checks.
2. Create an isolated Railway project/environment with explicit cost/resource
   limits and a recorded deletion target.
3. Provision private PostgreSQL, a private repository API, and a short-lived
   fixture-only refresh worker. Do not expose a public database or service
   domain.
4. Apply migrations with a dedicated migrator role and import the exact
   reviewed fixture manifest.
5. Repeat query, synthetic-update, export, restore, privacy, log, and cost
   acceptance.
6. Record the exact project/service/environment IDs without recording secrets.
7. Test rollback and deletion accounting, including snapshot/backup retention.

Railway failure must not affect production AskRigor. The same dump must restore
to local PostgreSQL, proving provider portability.

## Phase 7 — separately gated production proposal

Do not connect production automatically after a successful pilot. Produce a
new owner decision record covering:

- which completed research runs are eligible for repository contribution;
- human/model validation and disagreement workflow;
- source/provider refresh ownership and cost;
- user data, consent, deletion, export, and multi-user authorization;
- whether any community-derived fields have been approved;
- production backup, recovery-point, recovery-time, and incident response;
- query/API surface and threat model;
- Custom GPT and public MCP implications; and
- staged deployment, plugin synchronization, product acceptance, and rollback.

## Verification gates

For every implementation change:

- targeted schema, import, query, freshness, export, restore, privacy, and
  hostile tests;
- `npm run test:run`;
- complete deterministic `npm run verify` before a pull request is merged;
- final diff and secret/privacy scan;
- exact protocol and public inventory comparison;
- living Mermaid map update when architecture or state changes;
- pull request with protected hosted checks; and
- post-merge recovery receipt before any separately authorized deployment.

Live/provider checks remain separate and run only when explicitly required and
credentials are available.

## Rollback

Before any mutable pilot action, preserve:

- exact repository commit and migration version;
- fixture and export SHA-256 manifests;
- pre-action database dump and event-chain head;
- exact Railway resource IDs if applicable; and
- a tested local restore path.

Rollback never rewrites or deletes production Git history. A pilot environment
is destroyed only after exact target resolution, final export/receipt, owner
authorization for the destructive action, and separate backup/snapshot
accounting.

## Non-goals

- No production ingestion or user-facing repository in this plan.
- No raw article, transcript, comment, chat, prompt, provider-response, or
  identity-linked health corpus.
- No change to canonical protocols, public MCP tools, Custom GPT Actions, or
  current production behavior.
- No automatic study/review score, medical conclusion, or treatment ranking.
- No graph/vector/object-store dependency without benchmark evidence and a
  separate approval.

## Lesson disposition

No new universal lesson is proposed at design time. Existing current patterns
already cover research before reinvention, living maps, exact provenance,
reversible work, and return-artifact closure. Revisit only after the pilot
provides validated evidence that a distinct general pattern is missing.
