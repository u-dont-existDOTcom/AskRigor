# Cumulative living evidence repository pilot

Status: active — owner approved implementation, complete performed-analysis
persistence, and isolated Railway use on 2026-08-29

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

- Active task: `askrigor-living-evidence-pilot-v1`
- Active branch: `agent/living-evidence-pilot-20260829`
- Integrated baseline: merge
  `59ee7846aa3b4d94fa0be2a4e5bc7d8aedb6ab6c`, preserving local acceptance
  parent `78960d4f224abd45756817a9f9b358bea832d1bb` and remote-main parent
  `26bad64db4b3df7a9158d06c160d2b2c909d4ce2`
- Railway use is owner-authorized for one isolated, private pilot capped at
  $5/month, 0.5 vCPU, 512 MiB memory, and 1 GiB volume. Stop before provisioning
  if those limits cannot be enforced. Current Railway documentation confirms
  that its compute hard limit is workspace-wide with a $10 minimum and paid
  volumes start at 5 GiB and cannot be downsized. No resource was provisioned
  and no workspace-wide billing control was changed. The exact readback and
  required future receipt are in `../../../infra/living-evidence-pilot/README.md`.
- Existing production, Custom GPT, public 21-tool MCP, canonical protocols,
  and durable privacy boundaries are unchanged.
- Implementation commit `864b767115ff17dd4a9464864dd7789157de9b72` is under
  protected review in PR #128.
- The original checkout contains unrelated owner files and must not be used for
  pilot work. Continue in a dedicated task worktree/branch.

## Phase 0 — decision and policy gates

The owner approved the optimized brief. Implementation proceeds only as each
remaining policy artifact or exact configuration becomes executable:

- [x] exact pilot topic and fixture inventory selected: hip osteoarthritis PRP
  systematic-review evidence and explicit synthetic correction/access events;
- [x] allowed and prohibited data-class matrix;
- [x] updated privacy/data-flow/retention/deletion and backup threat model;
- [x] source licensing and quotation policy;
- [x] exact study/review rubric profiles and disagreement rules;
- [x] freshness cadence/owner/failure table by source class;
- [x] YouTube compliance decision for this pilot: zero durable community or
  YouTube-derived records;
- [ ] Railway project/environment provisioned and read back; blocked because
  current platform controls cannot enforce the approved spend/volume limits;
- [x] explicit authorization to provision the isolated pilot, subject to the
  exact enforceable limits above.

If YouTube review is unresolved, the pilot proceeds with **zero YouTube or
community-derived durable records**. That limitation does not block the formal
evidence schema experiment.

## Phase 1 — executable contract and schema fixtures

Status: implemented locally. The migration and strict contribution schema
cover complete/partial analysis, protocol/run identity, topics/questions,
source and claim versions/edges, evidence bindings, transparent assessments,
freshness, impact jobs, append-only triggers, full-text indexes, and
prohibited-data rejection. The reviewed fixture has six source families and
one clearly labeled synthetic invalidation; historical gaps remain explicit.

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

Status: implemented for the isolated pilot. Idempotent transactional ingestion,
leaf-based current projections, exact/structured/full-text search, recursive
topic traversal, transparent assessment ordering, query receipts, and complete
logical export execute against PostgreSQL. Contribution writes are serializable
and transaction-serialized; hierarchy/dependency cycles and invalid future-item
resolution fail in the database. Current-mode search additionally requires a
current source-freshness receipt. Public/production surfaces are not connected.
Separate login roles remain a production concern; the isolated schema revokes
`PUBLIC` access and exposes no public endpoint.

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

Status: implemented as fixture-only acceptance. Six source-specific policies
and checks are stored. One explicitly synthetic access-loss event appends a
source version, analysis invalidation, claim supersession/invalidation,
assessment version, freshness state, graph edges, repository event, and
completed impact job. Historical queries retain both versions; current queries
exclude both the invalidated leaf and every surviving claim whose only source
receipt is stale. Those records remain explicit in historical mode rather than
being relabeled current.

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

Status: implemented locally. The normal pilot emits mode-0600 canonical JSON,
an Obsidian analysis bundle, Mermaid map, RO-Crate metadata, exclusion and
deletion manifests, fixed-query and ranking receipts, and a PostgreSQL custom
dump. The disposable schema is wiped, restored, and compared by canonical hash
and inventory before its container is removed.

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

Status: local fixed queries pass for exact DOI, full text, structured question
dimensions, current/history separation, three-level topic traversal, and
transparent quality ordering. No material query miss currently justifies
pgvector or a separate graph service. Flat JSON remains the portable/review
baseline, not the concurrent authority.

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

The owner has authorized this phase subject to the exact task-lock limits.
Provisioning is currently stopped because Railway cannot enforce the approved
$5 workspace-isolated hard limit or 1-GiB paid-volume cap. A relaxed boundary
requires a new owner decision; local work and protected review continue.

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
