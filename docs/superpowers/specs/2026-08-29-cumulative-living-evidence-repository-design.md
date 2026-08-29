# AskRigor cumulative living evidence repository design

Date: 2026-08-29
Status: owner approved for the isolated pilot on 2026-08-29; production remains
separately gated
Branch: `agent/living-evidence-architecture-20260829`

## Optimized task specification

### Objective and decision

Turn AskRigor from a purely one-run research system into a cumulative living
evidence system that can reuse validated prior work while preserving source
access limits, uncertainty, corrections, retractions, and freshness.

The architecture decision is whether a portable relational evidence graph can
serve as canonical authority, with Obsidian, Mermaid, search indexes, and later
semantic retrieval generated from it. The design must also define a reversible
pilot whose result can justify or reject additional infrastructure.

### Audience and deliverables

The primary audience is the owner and future AskRigor implementers. Deliver:

1. a bounded prior-work scan and explicit reuse decision;
2. a canonical data and provenance model;
3. a freshness, invalidation, privacy, and provider-policy model;
4. a Railway-compatible but provider-portable pilot topology;
5. a living Mermaid architecture map; and
6. an implementation plan that does not itself authorize persistence.

### Inputs and authority

- complete canonical Universal 20.5.15 and HRP 20.5.23 bytes;
- existing source, method-audit, bounded-evidence, finalization, privacy, and
  checkpoint contracts;
- Joel's 2026-08-29 repository concept and Railway availability;
- the prior-work scan in
  `../../audits/2026-08-29-cumulative-living-evidence-prior-work.md`; and
- current provider and platform documentation, which must be rechecked before
  implementation because it is time-sensitive.

### Constraints and assumptions

- Current AskRigor intentionally has no durable raw full-text, transcript,
  comment, candidate-packet, or provider-response corpus. The approved pilot
  adds durable AskRigor-authored study/review analysis and exact provenance,
  while preserving those raw-corpus exclusions.
- The active YouTube API compliance review makes durable community-data fields
  an explicit later gate.
- No provider credential, private user research, personal health data, raw
  comment, transcript, article body, chat, or model-provider body enters the
  pilot.
- Exact receipts, hashes, access states, and source-version identities outrank
  a generated summary, diagram, embedding, or ranking.
- Railway is an optional deployment target. PostgreSQL and portable exports,
  not Railway-specific behavior, define the architecture.

### Success criteria

The proposed system succeeds only if it can:

- answer structured and text queries across topic, question, claim, source,
  program, population, comparator, outcome, horizon, quality domain, and
  freshness state;
- trace every displayed claim to exact source versions, evidence locators,
  extraction/validation receipts, and the runs that created or challenged it;
- preserve conflicting, uncertain, stale, inaccessible, superseded, and
  invalidated states without treating a failure as negative evidence;
- propagate a source correction or reassessment through dependent current
  projections without overwriting history;
- export, delete, wipe, restore, and independently verify a single-topic pilot;
  and
- demonstrate whether PostgreSQL edges and full-text search are sufficient
  before any graph or vector service is added.

### Copyable implementation brief

> Implement the approved single-topic AskRigor living-evidence pilot from this
> specification and its paired plan. Preserve all current protocol, privacy,
> public-tool, and no-durable-raw-corpus boundaries. Use PostgreSQL as the only
> canonical store; make maps, notes, full-text indexes, and any semantic index
> rebuildable projections. Import only approved minimized fixture records with
> exact hashes and receipts. Prove correction propagation, freshness failure
> states, export, wipe, restore, and exact hash equality. Do not provision
> Railway, ingest production or YouTube data, or connect the production runner
> until each named owner, privacy, licensing, retention, and rollback gate is
> explicitly satisfied.

## Current baseline

AskRigor already has strong record ingredients but no durable cross-run
repository:

- `apps/research-mcp/src/actions/study-method-audit.ts` and
  `review-method-audit.ts` emit version-bound, per-domain findings, unresolved
  fields, exact evidence block references, and claim capabilities.
- `apps/research-mcp/src/actions/research-bounded-evidence.ts` normalizes formal,
  creator, and community findings with source/access receipts and direct-
  identifier rejection.
- `apps/research-mcp/src/actions/research-report-synthesis.ts` binds report
  claims to formal capability IDs, creator findings, community findings, and
  explicit inference boundaries.
- `../../privacy-data-map.md` defines transient raw-source handling, bounded
  process-local artifacts, encrypted resumability limits, and explicit durable
  exclusions.

The repository layer should persist validated normalized knowledge and its
lineage, not weaken those executable contracts or become a second research
judge.

## Design decisions

### 1. Canonical authority is PostgreSQL plus immutable receipts

Use PostgreSQL as the sole transactional authority for the first architecture.
It provides constraints, transactions, recursive edge traversal, ordinary
full-text search, migrations, backups, and portable logical export without
introducing multiple consistency models.

Canonical records are structured rows plus exact external receipt/hash
references. An editable Obsidian vault, Mermaid map, search document,
embedding, report cache, or vector index is a projection and may be discarded
and rebuilt.

### 2. The data model is relational with explicit graph edges

Use stable opaque identifiers and immutable versions. Do not overload one
generic triple table with every invariant. Strongly typed tables hold core
entities; explicit edge tables hold navigable relationships.

| Record family | Core responsibility |
| --- | --- |
| `topics`, `topic_aliases`, `topic_edges` | Topic/subtopic taxonomy, aliases, and typed broader/narrower/related relationships |
| `questions`, `question_dimensions` | Structured research questions and exact population, program, comparator, outcome, setting, and horizon dimensions |
| `source_families`, `sources`, `source_identifiers` | Work/publication families, manifestations, and stable DOI/PMID/PMCID/NCT/YouTube or provider identifiers |
| `source_versions`, `access_events`, `source_edges` | Immutable content/version hashes, access state, retrieval boundary, correction/retraction/update relationships, and review-to-study ancestry |
| `claims`, `claim_versions`, `claim_edges` | Atomic scoped assertions and support/refute/qualify/duplicate/depend/supersede relationships |
| `evidence_bindings` | Claim-version to source-version linkage, exact locator/block IDs, polarity, extraction method, capability ceiling, and validating receipt |
| `rubrics`, `rubric_versions`, `assessments`, `assessment_domains` | Versioned study/review appraisal, evidence, unresolved fields, applicability, and disagreement without a hidden overall score |
| `runs`, `run_protocols`, `run_sources`, `run_outputs`, `receipts` | Reproducible relationship between a question, exact protocol manifests, inputs, outputs, completion state, and signed/hash-bound receipts |
| `freshness_policies`, `freshness_checks`, `repository_events`, `impact_jobs` | Per-source-class cadence, triggered checks, append-only changes, dependency traversal, and fail-closed projection status |
| `artifacts` | Minimized descriptors, hashes, media type, retention class, and storage pointer only for separately authorized artifacts |

Core edge types are allowlisted and directionally defined. At minimum:

- topic: `broader_than`, `narrower_than`, `related_to`;
- source: `version_of`, `corrects`, `retracts`, `updates`, `includes`,
  `excludes`, `duplicates`, `shares_population_or_dataset_with`;
- claim: `supports`, `refutes`, `qualifies`, `depends_on`, `duplicates`,
  `supersedes`, `contradicts`; and
- run: `produced`, `challenged`, `validated`, `invalidated`, `reused`.

Each edge has its own provenance, creation run, confidence/uncertainty state,
and optional superseding edge. A source can have multiple publications and a
publication can report multiple studies; the model must not force a
one-paper/one-study assumption.

### 3. Claims are atomic, scoped, and versioned

An atomic claim version contains:

```text
claim_id
claim_version_id
normalized_assertion
claim_type
population
program_or_exposure
comparator
outcome
horizon
setting
direction
inference_type
capability_state: can_support | cannot_support | uncertain
uncertainty_and_limitations
valid_from
valid_to
status
created_by_run_id
supersedes_claim_version_id
```

The normalized assertion is concise and nonverbatim. Exact quoted text is a
separately licensed artifact, never silently copied into the claim field. The
same source may support one scoped claim while being unable to support another.
Retrieval success, publication status, randomization, peer review, or a quality
label never upgrades capability by itself.

### 4. Evidence bindings preserve claim-level provenance

Every claim displayed as evidence-backed must have at least one valid evidence
binding that names:

- exact immutable source version and content SHA-256;
- access state and completeness boundary;
- section/table/page/block/timestamp locator where applicable;
- extraction type and responsible run;
- evidence direction and claim-capability ceiling;
- validation receipt ID and receipt SHA-256 where current actions provide one;
- relevant limitations and unresolved fields; and
- the rubric/assessment version when a methodological judgment controls use.

The external export maps records to [W3C PROV-O](https://www.w3.org/TR/prov-o/)
entities, activities, agents, derivations, revisions, and invalidations. The
internal receipt remains authoritative when the generic vocabulary is less
specific.

### 5. Quality remains a domain profile, not a magic score

Reuse the current study and review audit domains as the AskRigor-native rubric
profiles. Store:

- exact rubric and rubric-version identity;
- assessment target and exact source version;
- assessor type and identifier: deterministic validator, model, human, or
  imported external framework;
- each domain's state: `adequate`, `limitation_identified`, `unclear`, or
  `not_applicable`;
- plain finding, exact evidence bindings, unresolved fields, and limitations;
- separate internal-validity and applicability judgments;
- per-claim capability effects;
- disagreements and adjudication without erasing either assessment; and
- supersession or invalidation lineage.

[RoB 2](https://www.riskofbias.info/welcome/rob-2-0-tool/current-version-of-rob-2),
[AMSTAR 2](https://www.amstar.ca/Amstar-2.php), and
[GRADE](https://www.gradeworkinggroup.org/) may be stored only through explicit,
versioned profiles and within their intended scope. GRADE is outcome/body-of-
evidence certainty, not study quality. AMSTAR 2 must not be reduced to an
overall numerical score.

Interfaces may offer a transparent filtered summary such as “two critical
limitations identified, four domains unclear,” but the underlying domains and
reasons must remain one click away.

A user-requested quality ranking is a versioned, decision-specific query, not a
canonical property of a study. Its visible ordering keys may include exact
question applicability, decision-important source completeness, critical
domain limitations, claim capability, directness, replication/ancestry, and
currency. The result must show those keys, unresolved ties, and the query/rubric
version. It cannot silently combine them into one pseudo-precise global score.

### 6. Updates append; current knowledge is a computed projection

Never overwrite a source version, claim version, assessment, receipt, access
event, or correction event. A transaction that accepts a new event must:

1. append the event and immutable new version;
2. close the prior version's current interval when appropriate;
3. enqueue dependency/impact traversal;
4. mark affected current projections `checking` or `stale_pending_impact`;
5. recalculate dependent claim capabilities and generated views;
6. record the impact receipt; and
7. publish a new current projection only after the impact transaction passes.

Default queries return current usable records plus visible qualifications.
Historical mode exposes superseded and invalidated material with temporal
context. A stale map or embedding cannot re-promote an old claim because
canonical status filters are applied before projection generation.

### 7. Freshness is source-specific and failure-preserving

Use these public states:

```text
current
due
checking
stale
inaccessible
superseded
invalidated
```

An internal `stale_pending_impact` state may block projection publication while
dependency recalculation runs.

Each freshness policy names source class, trigger, cadence, maximum acceptable
age, retry/backoff, owner, required checks, and terminal/failure behavior.
Triggers include:

- periodic discovery for a living topic;
- Crossref/Retraction Watch correction or retraction signal;
- registry result/status change;
- guideline or review update;
- source-content hash change;
- changed access or license state;
- rubric or protocol revision; and
- a new run that challenges an existing claim.

`stale` and `inaccessible` are coverage limitations, never proof of no evidence
or no effect. The interface shows last successful check, next due date, failed
attempts, and affected claims. There is no silent fallback to the last map.

### 8. Retrieval is hybrid but canonical identity is exact

The initial retrieval stack is:

1. exact identifiers and aliases;
2. structured filters over question/claim/source/assessment/freshness fields;
3. PostgreSQL full-text search over normalized, authorized text; and
4. recursive graph traversal over typed edges.

An embedding index is deferred. If a fixed pilot query set shows material
semantic misses, add `pgvector` or an external vector service as a rebuildable
index whose rows point to exact canonical version IDs. Vector similarity never
establishes claim equivalence, source identity, support, contradiction, or
currency.

### 9. Obsidian, Mermaid, and evidence maps are generated views

Generate:

- one Obsidian note per current topic, question, claim, source family, and
  assessment, with stable links and a generated/read-only banner;
- the living architecture maps in
  `../../architecture/living-evidence-repository-map.md`;
- an intervention-by-outcome evidence gap map inspired by
  [3ie](https://www.3ieimpact.org/evidence-hub/evidence-gap-maps); and
- a review-by-included-study matrix inspired by
  [Epistemonikos](https://hps-primary.epistemonikos.org/en/about_us/how_to_use).

Manual annotations must enter through a reviewed import/change proposal that
creates canonical versions and provenance. Editing a generated note does not
silently mutate the database.

### 10. Community and YouTube data are minimized by default

The pilot stores no raw transcript, description, comment, reply, channel name,
author name, author channel ID, direct comment ID, or person-linked health
profile.

If future policy and owner review permit community-derived persistence, the
maximum proposed record is:

```text
public video identifier or non-identifying rediscovery lead
retrieval timestamp and exact access state
query/corpus scope and coverage receipt hash
nonverbatim finding scoped to program, population, outcome, and horizon
creator | community source role
firsthand-status and episode-confidence state
limitations, duplicate-risk state, and source-version dependency
mandatory refresh/delete date
```

Even that minimized record remains disabled until the owner approves the exact
fields after the YouTube compliance review. Current
[YouTube API policies](https://developers.google.com/youtube/terms/developer-policies)
generally require stored API data to be refreshed or deleted within 30 days,
subject to the exact data and authorization context; the
[derived-metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy)
does not turn comment text, titles, or creator identity into indefinitely
retainable data. Provider terms must be rechecked at implementation, and this
specification is not legal advice.

For public or reusable health-corpus work, raw public author identity remains
ephemeral within the acquisition job and only as long as needed for permitted
deduplication/follow-up. No persistent identity-linked health profile is
allowed merely because a comment is public.

### 11. Artifacts require an explicit retention class

The canonical row store can reference an artifact only when a policy record
defines:

- data class and lawful/contractual basis;
- content owner/source and license or quotation allowance;
- encryption and access-control requirements;
- maximum size and retention/refresh/deletion deadline;
- backup behavior and deletion propagation;
- exportability and subject/provider deletion workflow; and
- the claims that become stale or inaccessible when the artifact is removed.

No unclassified blob is accepted. The pilot uses identifiers, normalized
findings, fixtures, hashes, and locators only; it has no object store.

### 12. Runs reuse knowledge through a governed read/write loop

A new run begins by querying current repository records for the exact topic and
question dimensions. Returned records are evidence candidates, not inherited
conclusions. The runner must still:

1. load and verify the current canonical protocols;
2. compare the new question's population, program/exposure, comparator,
   outcome, horizon, and decision context with each prior record;
3. verify that the required source version, assessment, access state, and
   freshness policy remain usable;
4. reopen discovery for material gaps, contradictions, changed sources, or
   insufficiently applicable evidence; and
5. bind every reused claim to the new run and record why it was reused,
   narrowed, challenged, or rejected.

The run classifies material inputs and outputs as `development_discovery` or
`validation_confirmation`. Prior records may accelerate development and search.
Records consulted to create or revise a claim cannot independently validate the
revised claim; independent confirmation requires a frozen claim/analysis and
eligible validation evidence that did not influence it.

A completed run does not write arbitrary rows directly. It emits a contribution
proposal containing exact protocol manifests, source/claim/assessment versions,
receipts, access states, retention classes, and expected dependency impacts.
Deterministic validation rejects incomplete, prohibited, stale-by-policy, or
receipt-mismatched proposals. Accepted contributions append versions/events and
rebuild the current projection transactionally. Rejected proposals remain run
artifacts only under the existing bounded retention contract and do not become
repository knowledge.

This loop is how AskRigor becomes more capable with use: it reuses exact current
work and known gaps, not prose memory. It also prevents a frequently repeated
claim or embedding from gaining evidentiary authority merely through reuse.

### 13. Complete performed analysis is a first-class versioned record

For every analyzed study or review, persist the complete analysis that AskRigor
actually performed—not merely its final score, summary paragraph, or selected
claims. A complete captured analysis version includes:

- ordered full analysis sections and their reconstruction SHA-256;
- every applicable study/review method-domain finding and its exact state;
- claim capabilities, reasons, source locators, and evidence-binding receipts;
- internal-validity and applicability judgments kept separate;
- uncertainty, unresolved fields, limitations, disagreements, and alternative
  interpretations;
- the exact protocol, rubric, source, run, and validator versions; and
- every identified future-analysis item that could materially clarify the
  source, with priority, rationale, and resolution state.

Analysis sections are chunked for transport/storage but must reconstruct
byte-for-byte to the recorded full-analysis hash. A size boundary may reject an
entire contribution for review; it may not silently truncate it. Historical
runs for which only a durable summary survives are stored honestly as
`partial_historical_capture`, with the missing domain/section detail recorded
as unresolved rather than reconstructed from memory.

Later analysis appends a version linked as `clarifies`, `corrects`,
`supersedes`, or `invalidates`. It resolves or adds future-analysis items and
triggers dependency recalculation. Earlier analysis remains inspectable with
its original protocol, evidence, and limitations.

## Railway-compatible pilot topology

After the implementation gates are approved, the reversible pilot may use:

```text
Railway project / isolated pilot environment
├── PostgreSQL (private networking only)
├── repository-api (private service; no public domain)
└── refresh-worker (short-lived scheduled job, initially fixture-only)
```

[Railway private networking](https://docs.railway.com/networking/private-networking)
keeps service traffic on the internal network. The database has no public
endpoint. The API uses a least-privilege application role; migrations and
backup/restore use separate roles. All environments, secrets, cost/resource
limits, and logs are isolated from production AskRigor.

[Railway cron jobs](https://docs.railway.com/cron-jobs) are suitable for
short-lived scheduled checks but are UTC and not minute-exact. The repository
therefore records desired cadence, actual start/completion, lease, retry, and
missed-run state rather than assuming scheduling proves freshness.

For the pilot, use logical `pg_dump` plus portable JSON-LD/RO-Crate export.
Before production, combine and restore-test the applicable
[Railway backup methods](https://docs.railway.com/guides/postgres-backups-restores)
while accounting for the fact that backups extend deletion/retention scope.
Cost and resource limits follow current
[Railway cost-control guidance](https://docs.railway.com/pricing/cost-control).

Railway-specific configuration is deployment code, not the data model. The
pilot must also run locally from a standard PostgreSQL connection and restore
from the same logical export.

## Security and access model

The disposable single-process local acceptance may use one database owner and
migrator credential because it is loopback-only, tmpfs-backed, destroyed after
restore verification, and revokes every `PUBLIC` schema/object privilege. Any
hosted, multi-process, multi-user, or production use must instead provision and
accept separate roles:

- `repository_reader`: current/historical queries only;
- `repository_writer`: validated ingestion procedures, no schema or backup
  privileges;
- `refresh_worker`: source/freshness job lease and append-only events;
- `migrator`: schema migration only; and
- `backup_operator`: bounded export/restore workflow.

All writes occur through transactions or stored application procedures that
enforce immutable-version and receipt requirements. Production AskRigor, the
Custom GPT Action bridge, and the public 21-tool MCP catalog are not connected
in the pilot.

Logs contain record IDs, job states, counts, timings, and error classes, not
source bodies, comment text, prompts, credentials, health narratives, or model
provider responses. Audit events are append-only, but secrets and prohibited
content are rejected rather than immutably logged.

## Portability, export, deletion, and rollback

Every pilot build must produce:

1. schema migrations with forward and tested down/compensating paths;
2. a logical database dump;
3. an [RO-Crate 1.3](https://www.researchobject.org/ro-crate/specification/1.3/index.html)
   JSON-LD export containing stable IDs, relationships, hashes, and provenance;
4. an inventory of excluded/non-exportable artifacts;
5. a deletion manifest and backup-retention state; and
6. a restore receipt that compares counts, stable IDs, source hashes, claim
   versions, assessment versions, and event-chain hashes.

The single-topic pilot must be fully disposable. Rollback is: disconnect the
private services, export final evidence, destroy only the explicitly named
pilot environment after owner authorization, and verify no production route or
source behavior changed. Database deletion does not imply snapshot deletion;
the backup inventory must be checked separately.

## Reversible pilot definition

Use one already-audited, public, de-identified fixture topic: hip
osteoarthritis platelet-rich plasma (PRP), centered on review DOI
`10.7759/cureus.72057` and a bounded set of approximately 5–10 related study
records already represented in repository evidence. Exact pilot fixtures must
be reviewed before import.

Store only:

- public identifiers and bibliographic metadata allowed for the pilot;
- immutable source-version and receipt hashes;
- nonverbatim scoped claims;
- existing method-domain findings and unresolved fields;
- review-to-study and claim/source relationships;
- run/protocol/receipt identities; and
- synthetic freshness, correction, retraction, and access-loss events.

Do not store raw article text, chats, prompts, personal health information,
transcripts, comments, provider bodies, credentials, or private-source
material.

The pilot query set must cover:

- claims by topic, program, population, comparator, outcome, and horizon;
- current versus historical support, refutation, qualification, uncertainty,
  stale state, and invalidation;
- the review-to-study matrix and study/publication-family relationships;
- per-domain internal-validity and applicability findings with evidence;
- which runs and receipts produced or challenged a claim; and
- what changed after a synthetic correction, retraction, source update, access
  loss, or rubric revision.

The pilot then generates an Obsidian bundle, Mermaid views, and RO-Crate export;
performs export, wipe, and restore; and verifies exact record and hash equality.
The decision test is whether PostgreSQL structured/full-text retrieval plus
explicit edges answers the fixed query set with simpler and more reliable
operations than a second graph/vector service.

## Required owner and implementation gates

No provisioning, migration, ingestion, or production connection occurs until
all applicable gates have named decisions and acceptance evidence:

1. owner approval of product scope, canonical authority, and the exact pilot
   persistence classes;
2. updated privacy/data-flow/retention/deletion threat model, including backup
   behavior;
3. explicit source-licensing and quotation policy;
4. approved study/review rubric profiles and disagreement/supersession model;
5. freshness owners, source-specific cadence, invalidation rules, and missed-
   check behavior;
6. YouTube compliance disposition for every proposed durable field;
7. exact Railway project/environment, spend/resource limits, secrets, roles,
   export, restore, and rollback plan;
8. test fixtures confirmed to contain no prohibited or private data; and
9. proof that public tool catalogs, production deployment, and Custom GPT
   behavior remain unchanged during the isolated pilot.

## Non-goals

- No automatic medical recommendation or treatment ranking from repository
  presence, study design, quality labels, comment counts, or retrieval rank.
- No replacement of complete protocol execution by prior-run knowledge.
- No durable raw full-text, transcript, comment, chat, prompt, or provider-body
  corpus in the pilot.
- No public repository API, production runner integration, Custom GPT change,
  MCP catalog change, or provider spending authorization.
- No graph database, vector database, object store, or editable Obsidian source
  of truth without a measured pilot need and a separately approved design.
- No claim that repository freshness equals complete global evidence coverage.

## Lesson disposition

The general reusable architecture lessons already exist in current Universal
patterns: research before reinvention, living workflow maps, source
provenance, and reversible Git operations. This proposal introduces an
AskRigor-specific composition of current executable receipts and privacy
constraints; it is not yet validated implementation evidence for a new
universal lesson.
