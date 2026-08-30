# Public Discovery Atlas implementation plan

Date: 2026-08-30
Branch: `codex/public-discovery-atlas`
Status: design and implementation sequence proposed; this plan does not itself activate public publication, new provider spending, or user-health-data retention

## Objective

Deliver a small, rigorous public AskRigor health-evidence atlas that proves the complete path:

`canonical evidence -> reviewed public finding release -> searchable condition/finding UI -> cited follow-up answer -> correction/feedback loop`

The first implementation must reuse the existing living-evidence repository and research-frontier ledger. It must not create a second source of truth or allow parallel workers to publish directly.

## Required reading

1. `AGENTS.md`
2. `docs/INDEX.md`
3. `project/CODEX-CURRENT-STATE.md`
4. complete canonical Universal and HRP protocols when executing substantive health research
5. `docs/audits/2026-08-29-cumulative-living-evidence-prior-work.md`
6. `docs/superpowers/specs/2026-08-29-cumulative-living-evidence-repository-design.md`
7. `docs/audits/2026-08-30-research-frontier-ledger.md`
8. `docs/superpowers/plans/2026-08-30-research-frontier-ledger.md`
9. `docs/audits/2026-08-30-public-discovery-atlas-prior-work.md`
10. `docs/superpowers/specs/2026-08-30-public-discovery-atlas-design.md`
11. relevant privacy, source-storage, threat-model, and public-review documents indexed in `docs/INDEX.md`

## Workstream separation

Run two related but distinct products:

- **Public Evidence Atlas:** released findings, condition pages, maps, changes, methods, cited Q&A, and typed feedback.
- **Private Research Operations:** parallel-worker objectives, progress, coverage, drift, blocked trails, and release readiness.

Only signed/reviewed release records cross from private research operations to the public atlas.

Ordinary AskRigor runtime integration is a third, separate boundary. The
current public MCP service remains read-only and exposes 21 tools; this plan
does not decide whether a dedicated frontier-read tool or minimized staged
contribution path should be added. Public Atlas Phase 0 can be evaluated
independently, but it does not make AskRigor learn from ordinary runs.

## Phase 0 — contract fixtures before UI

### 0.1 Freeze a public finding fixture schema

Create `packages/public-atlas-contracts` with Zod/TypeScript contracts for:

- public finding summary and detail;
- provenance classification;
- public release state;
- condition and aliases;
- evidence dimensions;
- importance assessment and profile;
- expectation record and unexpectedness assessment;
- dissent/conflict summary;
- history/change event;
- question request/answer/citation;
- minimized feedback item; and
- third-party import manifest.

Keep IDs and version links compatible with existing canonical repository records.

### 0.2 Build a synthetic acceptance corpus

Create 12–18 synthetic findings spanning:

- benefit;
- harm;
- null/no meaningful difference;
- mixed/heterogeneous;
- association-only;
- correction/narrowing;
- contested conclusion;
- retracted source;
- stale finding;
- evidence gap;
- credible unexpected finding; and
- provocative low-certainty signal.

Hostile cases must include:

- a high-certainty trivial finding;
- a highly important low-certainty question;
- a surprising fraudulent/retracted result;
- a popular user-voted claim with weak evidence;
- a third-party imported claim not yet validated;
- an apparently current card whose source refresh failed;
- conflicting syntheses using different study sets; and
- a personalized question that generic evidence cannot answer.

### 0.3 Define rubric versions

Add machine-readable and human-readable versions for:

- `finding-provenance-v1`;
- `public-health-impact-v1`;
- `patient-decision-relevance-v1`;
- `unexpectedness-v1`;
- `public-release-check-v1`.

Every dimension must allow `unknown` and require rationale. Composite ordering is permitted; scalar authority is not.

### 0.4 Phase 0 tests

- schema round-trip and version rejection;
- no missing claim/source/release lineage;
- no importance/uncertainty field substitution;
- no `ORIGINAL_DISCOVERY` without novelty receipt;
- no credible-unexpected promotion without expectation and credibility records;
- imported candidate excluded from public current views;
- stale/retracted/superseded propagation;
- minimized feedback rejects free-form health narratives by default.

## Phase 1 — canonical public-release layer

### 1.1 Database migration

Extend the living-evidence repository with only public-specific records:

- public finding releases;
- provenance classifications;
- importance rubrics/profiles/assessments;
- expectation records;
- unexpectedness rubrics/assessments;
- public explanation versions;
- public release checks;
- public condition aliases;
- minimized feedback records;
- minimized question analytics;
- third-party import manifests.

Reuse existing claims, sources, versions, assessments, runs, receipts, freshness, and frontier records.

### 1.2 Constraints

Enforce in PostgreSQL and service code:

- immutable released versions;
- one current release pointer with historical preservation;
- foreign keys to canonical claim/source lineage;
- publication prohibited from draft worker roles;
- release-state transition rules;
- no current view for unvalidated third-party candidates;
- original-discovery receipt requirement;
- expectation predates unexpectedness release;
- stale/superseded/retracted invalidation of current promotion views;
- source/license manifest required for imported data.

### 1.3 Read models

Implement deterministic projections:

- current public findings;
- finding history;
- condition summary;
- search documents;
- evidence maps;
- recent changes;
- contested findings;
- cited Q&A corpus.

### 1.4 Repository/API interface

Expose a narrow read interface from `packages/evidence-repository`. The public app must never issue unrestricted SQL or receive private run/worker fields.

## Phase 2 — read-only vertical-slice application

### 2.1 Scaffold

Add:

- `apps/public-atlas` using Next.js, React, and TypeScript;
- `packages/public-atlas-contracts`;
- `packages/public-atlas-ranking` for pure deterministic ranking/profile functions.

Prefer server-rendered or statically generated condition/finding pages with release-event invalidation. Keep search dynamic and rate-limited.

### 2.2 Routes

Implement:

- `/` discover page;
- `/search`;
- `/conditions/[conditionId]`;
- `/findings/[findingId]`;
- `/findings/[findingId]/history`;
- `/changes`;
- `/methods`;
- `/ask`;
- `/contribute`.

### 2.3 Homepage modules

- most important under a visible named profile;
- unexpected with credible evidence;
- provocative but provisional;
- recently changed;
- contested;
- browse conditions/categories;
- recent released AskRigor work.

### 2.4 Finding page layers

Implement the progressive disclosure contract from the design spec. Ensure the compact layer remains comprehensible on mobile and every claim can reach its evidence/audit trail.

### 2.5 Evidence visualization

Start with accessible structured tables and simple forest plots only when compatible effect data exist. Add matrix/bubble views after the same data pass table-based acceptance. Never manufacture pooled estimates from incompatible endpoints.

## Phase 3 — search and condition vocabulary

### 3.1 Vocabulary seed

Create a versioned import for permitted MeSH descriptor/entry-term data or a thin mapping to stable public identifiers, subject to current license/usage verification.

Add versioned AskRigor lay aliases and common abbreviations with provenance.

### 3.2 Retrieval baseline

Implement:

1. exact ID/alias match;
2. structured filters;
3. PostgreSQL full-text ranking;
4. explicit relation expansion;
5. typo-tolerant fallback where safe.

Do not add embeddings until a fixed evaluation suite demonstrates meaningful lexical/structured misses.

### 3.3 Search evaluation

Create at least 100 queries covering:

- lay versus clinical condition names;
- abbreviations;
- intervention brand/generic names where allowed;
- misspellings;
- outcome and harm searches;
- population qualifiers;
- finding questions rather than entity names;
- ambiguous terms;
- no-result queries.

Grade entity retrieval, relevant-finding recall, misleading expansion, and stale/superseded leakage.

## Phase 4 — real evidence pilot

### 4.1 Select public pilot conditions

Choose three conditions from completed AskRigor work with:

- complete enough source/audit lineage;
- at least 8–15 defensible findings total per condition or a justified smaller set;
- benefit, harm, uncertainty, and evidence-gap coverage;
- different intervention/evidence structures;
- limited unresolved licensing barriers;
- no private health information.

Do not make ivermectin the sole or primary public launch corpus.

### 4.2 Internal adversarial IVMmeta benchmark

Build a disabled-by-default importer/comparison fixture for the IVMmeta/c19early ivermectin corpus:

- source/page/version/license manifest;
- permitted owned assertion and study-identifier extraction;
- all imports typed `THIRD_PARTY_CANDIDATE`;
- independent identifier resolution;
- current full-text/access revalidation;
- trial/review/integrity audit;
- included/excluded/deferred/retracted mapping;
- outcome/timing/model comparison;
- side-by-side IVMmeta, Cochrane, other credible synthesis, and AskRigor conclusions;
- disagreement decomposition;
- zero automatic public release.

The success criterion is faithful representation of disagreement and sensitivity, not convergence on a predetermined conclusion.

### 4.3 Populate public releases

For each real finding:

- atomic claim and scope;
- exact canonical lineage;
- provenance class;
- evidence dimensions;
- capability statement;
- harms and competing outcomes;
- dissent;
- freshness;
- importance assessment;
- optional unexpectedness assessment;
- public explanation layers;
- explicit release review receipt.

### 4.4 Blind comprehension test

Readers should reliably distinguish:

- evidence certainty from importance;
- important from surprising;
- no evidence from evidence of no meaningful difference;
- single-study signal from replicated/body-of-evidence conclusion;
- validated finding from provisional/contested/imported candidate;
- generic population evidence from personal medical advice.

## Phase 5 — cited follow-up questions

### 5.1 Retrieval corpus

Build only from released public finding versions and permitted supporting records. Index exact scopes, capabilities, dissent, history, and source locators.

### 5.2 Modes

Support:

- explain simply;
- strongest evidence;
- skeptical reading;
- who disagrees and why;
- what would change this;
- compare findings/interventions;
- unknowns;
- changes over time.

### 5.3 Fail-closed behavior

- no answer from worker drafts;
- no answer from model memory when released records are absent;
- no silent extrapolation outside population/outcome/horizon;
- stale/contested/retracted state included;
- personal treatment questions route to the complete HRP workflow;
- every factual health assertion claim-locally cited.

### 5.4 Evaluation set

Create adversarial tests for:

- unsupported causal upgrade;
- missing harm;
- population extrapolation;
- endpoint substitution;
- time-horizon substitution;
- certainty inflation;
- disagreement erasure;
- stale result;
- retracted source;
- question asking for personal dosing/treatment.

## Phase 6 — parallel-worker automation

### 6.1 Worker packet contract

Every worker receives:

- exact objective and scope;
- canonical protocol identities where applicable;
- source/access rules;
- current frontier state;
- allowed tools/providers/cost;
- required structured output schema;
- prohibition on public publication;
- escalation criteria;
- checkpoint/heartbeat format.

### 6.2 Worker lanes

Implement the lanes specified in the design: discovery, identity, screening, access, audit, synthesis, contradiction/integrity, importance, unexpectedness, explanation, and release verification.

### 6.3 Supervisor controls

The private operations dashboard must show:

- assigned objective;
- status and current step;
- alignment/drift assessment;
- last checkpoint;
- search/source coverage;
- blocked and unresolved trails;
- duplicate/overlapping work;
- test/receipt state;
- proposed next action;
- release readiness.

Use Pro review for consequential evidence, therapy/health interpretation, original-discovery, conflict-resolution, and release decisions. Use ordinary deterministic automation for plumbing and validation.

### 6.4 Publication firewall

A worker may create proposed canonical or public records. Only the release verifier plus authorized human/supervisor role may create the final immutable public release receipt and move the current release pointer.

## Phase 7 — user learning loop

### 7.1 Structured contribution endpoint

Accept typed corrections, sources, retraction/integrity notices, questions, explanation problems, importance preferences, equity/access concerns, and optional lived-experience signals.

### 7.2 Privacy and moderation

- no public comments in MVP;
- no raw health narrative retention by default;
- explicit consent before retaining free text;
- identifier minimization/redaction;
- abuse, spam, prompt-injection, and malicious-link controls;
- retention/deletion tests;
- separate public attribution consent.

### 7.3 Triage integration

Validated contribution leads enter the research-frontier ledger with source and decision lineage. User demand may affect research priority; it never changes evidence certainty directly.

### 7.4 Learning reports

Generate internal aggregates:

- high-frequency unanswered questions;
- zero-result searches;
- explanations marked confusing;
- frequently challenged findings;
- missing-condition demand;
- candidate sources accepted/rejected;
- feedback-to-correction yield;
- populations/outcomes users seek but the evidence does not cover.

## Phase 8 — deployment and public release

### 8.1 Deployment topology

Use a separate public web service and least-privilege read path. Keep research workers, write credentials, private operations, and provider secrets unreachable from public routes.

### 8.2 Pre-release gates

- public threat model updated;
- source/license manifest current;
- privacy/retention/deletion policy current;
- public review checklist extended for atlas claims;
- synthetic and real-corpus tests pass;
- blind comprehension passes;
- source and correction links verified;
- accessibility and mobile checks pass;
- rate/abuse controls pass;
- backup/restore/rollback pass;
- public domain/branding language does not overclaim original discovery.

### 8.3 Staged release

1. local synthetic corpus;
2. private deployed synthetic corpus;
3. private real-evidence pilot;
4. invitation-only read-only review;
5. public read-only atlas;
6. cited Q&A;
7. typed feedback;
8. expanded automated refresh;
9. open data/API after licensing and stability review.

Do not activate all stages together.

## Cross-phase acceptance metrics

- 100% of public findings have canonical lineage and release receipts.
- 0 unvalidated imported candidates in public current views.
- 0 worker drafts retrievable by public Q&A.
- 100% of visible evidence/importance/unexpectedness labels expose framework/profile and version.
- correction propagation reaches all projections and Q&A.
- fixed search suite meets declared recall/precision thresholds.
- blind readers distinguish certainty, importance, surprise, and public state.
- all source/license families have current manifests.
- feedback cannot directly mutate findings or certainty.
- private operations remain inaccessible from public service credentials/routes.

## Suggested first worker decomposition

### Worker A — contracts and fixtures

Implement Phase 0 schemas, rubrics, synthetic corpus, and hostile tests.

### Worker B — database/public-release model

Implement Phase 1 migrations, constraints, repository methods, projections, and PostgreSQL acceptance.

### Worker C — public application shell

Implement Phase 2 against fixtures only, including accessible cards, condition/finding pages, filters, history, and methods.

### Worker D — search/taxonomy

Implement Phase 3 vocabulary boundary, structured/full-text retrieval, query suite, and evaluation.

### Supervisor

Continuously verify that all four workers preserve one authority, do not collapse dimensions, and do not introduce autonomous publication or private-data leakage. Merge only after integrated fixture acceptance.

Workers A–D may proceed in parallel after contracts are frozen; Worker C consumes generated fixture DTOs and Worker B targets the same contracts.

## First implementation milestone

The first milestone is complete when a private local atlas renders the synthetic corpus and demonstrates:

- four distinct homepage lanes;
- condition search;
- finding history;
- transparent evidence/importance/unexpectedness dimensions;
- imported-candidate exclusion;
- stale/retracted propagation;
- cited fixture Q&A;
- typed feedback rejection of disallowed narrative fields; and
- a deterministic public projection rebuilt from PostgreSQL.

No external provider, real patient data, broad real-evidence import, or public deployment is required for this milestone.

## Codex continuation handoff

> After the owner selects the public-atlas milestone, continue AskRigor from GitHub canonical state on branch `codex/public-discovery-atlas`. Read `AGENTS.md`, `docs/INDEX.md`, `project/CODEX-CURRENT-STATE.md`, the cumulative living-evidence and research-frontier records, then `docs/audits/2026-08-30-public-discovery-atlas-prior-work.md`, `docs/superpowers/specs/2026-08-30-public-discovery-atlas-design.md`, and this plan. Begin Phase 0 only: contracts, rubric versions, synthetic hostile fixture corpus, and tests. Do not implement real health findings, IVMmeta ingestion, public deployment, provider spending, user-health-data retention, ordinary-run repository write-through, or autonomous publication. Save all work to a task branch/PR and report exact test receipts and unresolved design conflicts.
