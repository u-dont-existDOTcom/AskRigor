# Community Health Forum and Public Lead Frontier implementation plan

Date: 2026-08-30
Status: architecture-complete implementation plan; no real-data collection or deployment authorized
Primary spec: `../specs/2026-08-30-community-health-forum-and-public-lead-frontier.md`
Prior-work scan: `../../audits/2026-08-30-community-health-forum-and-public-lead-frontier-prior-work.md`
Machine contract: `../../community-health-forum-and-public-lead-contract-v0.1.0.json`

## 1. Objective

Implement a mature AskRigor peer forum connected to a public, provenance-typed community research frontier.

The implementation must permit deidentified public secondhand leads, including one-hop reports from friends or family, without presenting them as subject-verified stories. It must keep public visibility independent from evidence strength and convert community signals into evidence checks, research questions, proposals, and Research Missions.

## 2. Stack decision

**Compose rather than invent.**

- Discourse: raw forum topics/posts, discussion search, trust levels, moderation queues, notifications, categories/tags.
- AskRigor identity provider: canonical product identity and authorization.
- DiscourseConnect or another currently supported verified SSO mode: account bridge.
- Community Bridge: signed webhooks/API, idempotency, event ordering, cross-system IDs.
- AskRigor PostgreSQL living-evidence repository: structured leads, provenance, consent, public versions, clusters, evidence checks, questions, proposals, mission links.
- AskRigor public projection: condition/intervention frontier pages.
- Separate moderation, privacy, scientific-annotation, and safety queues.

Do not build a general-purpose forum engine, fork Discourse's core scientific semantics, or make the Discourse database a second evidence authority.

## 3. Branch and PR topology

Current design authority is `codex/public-discovery-atlas` / PR #140.

Current Phase-A contract implementation is stacked on it at `agent/discovery-atlas-phase-a-contract-fixtures-20260830` / PR #142.

Recommended continuation:

1. complete review/merge of the design PR;
2. rebase or retarget the Phase-A implementation PR onto the updated design authority;
3. create a new branch for the forum/lead synthetic implementation slice;
4. do not fold real forum deployment or real health data into the schema/bridge PR;
5. use a separate deployment/pilot PR after privacy, safety, and moderation gates.

## 4. Phase 0 — architecture and contract lock

Artifacts required:

- prior-work scan;
- implementation-ready spec;
- machine-readable contract bundle;
- synthetic Andy-like public-lead fixture;
- hostile acceptance matrix;
- updated Public Atlas read order and work queue;
- updated PR description and Codex handoff.

Acceptance:

- secondhand public lead is explicitly permitted at its tier;
- public narrative and public research lead are separate objects;
- forum substrate reuse is explicit;
- source distance, verification, completeness, evidence capability, visibility, discovery value, and research priority are independent;
- no real publication or collection is implied.

## 5. Phase 1 — isolated Discourse integration laboratory

### 5.1 Infrastructure

Create a local or isolated test-only Discourse instance with:

- no public DNS;
- synthetic accounts only;
- synthetic health topics only;
- outbound email disabled or captured locally;
- search-engine indexing disabled;
- explicit disposable database/volume;
- version pin and upgrade/rollback notes.

### 5.2 Identity spike

Test the supported SSO path with:

- AskRigor as identity authority;
- verified email boundary;
- stable external user ID;
- pseudonymous display name;
- suspended/banned forum user still able to use non-forum AskRigor features where intended;
- admin recovery path;
- account-link collision tests;
- logout/session invalidation;
- deletion/anonymization behavior.

Do not enable SSO in production until takeover/collision fixtures pass.

### 5.3 Forum structure

Create synthetic categories/tags from the spec:

- conditions;
- helped;
- harmed;
- no effect;
- regimen labs;
- study discussions;
- research questions/proposals;
- support;
- corrections/updates;
- governance.

Verify public/member/private and indexed/noindex combinations.

### 5.4 Webhook/API spike

Consume signed topic/post lifecycle events:

- create;
- edit;
- delete;
- visibility change;
- user suspension;
- tag/category changes.

Acceptance:

- replay is idempotent;
- out-of-order events reconcile by source version;
- delete cannot be followed by stale edit resurrection;
- failed events enter an inspectable dead-letter queue;
- raw forum content is not copied wholesale into the evidence repository.

## 6. Phase 2 — canonical schemas and migrations

### 6.1 Contracts package

Add typed schemas for:

- forum source reference;
- source-distance classification;
- reporter relationship;
- verification event;
- structured lead;
- public lead publication;
- subject claim/dispute;
- completeness profile;
- signal cluster;
- research question;
- evidence check;
- research proposal;
- moderation/scientific/privacy/safety events;
- consent/withdrawal.

Keep the existing patient-story v0.1 contracts parseable. Add a new version or adapter rather than silently changing prior semantics.

### 6.2 PostgreSQL migration

Add the tables listed in the spec with:

- row-level roles;
- private identity separation;
- public projection views;
- immutable version hashes;
- append-only audit events;
- foreign keys to existing findings, studies, research missions, and frontier records;
- deletion/withdrawal propagation markers;
- no raw private forum body in the evidence schema.

### 6.3 Repository service

Implement transactionally:

- create/update lead from approved structured intake;
- create public version after privacy gate;
- correct/supersede/withdraw;
- add verification without upgrading causal capability;
- link duplicates;
- compute source-independence view;
- create and version clusters;
- preserve provenance edges.

Acceptance:

- stale writers fail;
- duplicate event replay is no-op;
- private fields never appear in public projections;
- source deletion is reflected without silently destroying audit history;
- combination episodes remain combinations.

## 7. Phase 3 — structured forum composer and public lead workflow

### 7.1 Composer

Implement a progressive form embedded or linked from forum topics:

- self versus other-person report;
- information origin;
- condition certainty;
- intervention/combination;
- outcome direction;
- timing/persistence;
- co-interventions;
- harms;
- known unknowns;
- visibility/aggregation/recontact choices.

The user sees the proposed public paraphrase and provenance label before publication.

### 7.2 AskRigor conversion suggestion

AskRigor may propose:

> “This discussion contains a potentially useful experience report. Add a deidentified structured lead?”

The member must affirm conversion. No silent aggregation from ordinary discussion.

### 7.3 Public lead review

Route through:

- automated direct-identifier screening;
- rare-combination/reidentification checks;
- abuse/impersonation checks;
- human review for elevated privacy risk;
- safety candidate extraction;
- publication receipt.

Acceptance fixtures include the anonymized Andy-like lead passing and the identifiable variant failing until redacted.

## 8. Phase 4 — public frontier projection

### 8.1 Condition/intervention pages

Render:

- source-distance composition;
- directions: benefit/harm/no effect/mixed;
- exact program fingerprints;
- reported outcomes/horizons;
- completeness and verification;
- duplicate-independent counts;
- formal-evidence relationship;
- active research questions/proposals/missions;
- explicit self-selection and denominator boundary.

### 8.2 Lead page

Render every independent axis rather than one score.

Prohibit:

- efficacy percentages without a defensible denominator;
- popularity ordering as default;
- “verified treatment” labels based on identity verification;
- subject-voice language for proxy/relayed leads;
- silent omission of harm/no-effect records.

### 8.3 Cluster service

Cluster by exact condition/population/intervention/sequence/outcome/horizon and source independence.

Acceptance:

- renamed broad labels cannot manufacture diversity;
- one viral story remains one independent source;
- opposite outcomes stay in the same relevant analytical view;
- cluster membership is reproducible and versioned.

## 9. Phase 5 — moderation, annotation, privacy, and safety

### 9.1 Role separation

Implement separate capabilities for:

- conduct moderation;
- scientific annotation;
- privacy review;
- safety triage;
- research stewardship;
- methods/ethics review;
- administration.

Test every forbidden cross-role action.

### 9.2 Scientific context

Allow source-linked context notes and evidence relationships without editing the member's post.

Acceptance:

- experience remains visible when formal evidence conflicts;
- formal evidence is not downgraded by report count;
- corrected evidence propagates back to threads and lead pages;
- annotations are versioned and appealable.

### 9.3 Safety

Implement a candidate queue, not automatic regulatory submission.

Before any public pilot, produce:

- jurisdictional responsibility memo;
- serious-event triage SOP;
- crisis and imminent-harm response;
- follow-up/contact rules;
- manufacturer/product relationship assessment;
- audit and retention policy;
- human coverage/escalation plan.

## 10. Phase 6 — research question and proposal pipeline

### 10.1 Cluster-to-question

Create candidate PICO/PECO/implementation questions from clusters. Preserve originating reports and alternative explanations.

### 10.2 Evidence check

Use existing AskRigor research/frontier capability to classify answered, partially answered, conflicted, unanswered, ill-formed, or inaccessible.

### 10.3 Public proposal

Create versioned proposal pages with:

- signal basis;
- evidence gap;
- proposed design;
- outcomes/horizon;
- safety/ethics/privacy;
- methods review;
- community/clinician/researcher rankings separately;
- recruitment-interest boundary;
- mission status.

### 10.4 Closed-loop result

Research results must update the originating forum, lead, cluster, proposal, mission, and finding relationship.

## 11. Phase 7 — bounded real-user pilot

This phase requires separate owner authorization.

Preconditions:

- security review;
- privacy/reidentification red team;
- legal/regulatory review;
- moderator/safety staffing;
- transparent terms and consent;
- cache/search withdrawal test;
- abuse simulation;
- backup/restore/deletion acceptance;
- public rollback plan;
- no unresolved high-severity hostile fixture.

Pilot constraints:

- invitation only;
- narrow set of condition communities;
- human review of every public lead;
- no automated treatment ranking;
- no research recruitment without study-specific approval;
- predefined stop conditions;
- public transparency report.

## 12. Deterministic test matrix

### Identity and bridge

- SSO takeover/collision;
- verified email boundary;
- suspend versus product-access separation;
- event signature;
- replay;
- ordering;
- dead-letter recovery;
- delete/visibility changes.

### Lead provenance

- self report;
- direct-observer friend;
- one-hop subject relay;
- multi-hop hearsay;
- public-source extraction;
- mixed source;
- unknown source;
- later subject verification;
- later dispute;
- document corroboration;
- contradictory corroboration.

### Privacy

- direct identifiers;
- rare-condition reidentification;
- exact searchable quote;
- image/EXIF;
- minor;
- third-party records;
- public-source backlink;
- withdrawal/cache propagation.

### Evidence

- identity verification does not change causal capability;
- views/votes/reactions do not change certainty;
- duplicate viral posts do not increase independence;
- exact regimen cluster separation;
- no-effect/harm visibility;
- aligned contradiction versus outcome mismatch;
- stale finding update.

### Safety and moderation

- serious adverse event;
- immediate crisis;
- dangerous individualized instruction;
- commercial sockpuppet;
- doxxing;
- moderator/scientific role collision;
- appeal and reversal;
- member-post preservation under annotation.

### Research pipeline

- answered question closure;
- partial-answer narrowing;
- conflicting evidence;
- proposal cannot launch without methods/ethics state;
- popularity cannot override infeasible design;
- negative result returns to community.

## 13. Required documentation and receipts

For each implementation PR preserve:

- owner-outcome reconciliation;
- exact branch/base/head;
- changed files;
- schema and migration versions;
- test commands and output;
- privacy data-map delta;
- threat-model delta;
- role/permission matrix;
- source-storage delta;
- moderation/safety operating boundary;
- deployment/non-deployment statement;
- rollback;
- unresolved issues;
- next safe action.

## 14. Architecture completion boundary

The architectural work is complete when:

- the prior-work scan records reuse/adapt/invent decisions;
- the full spec resolves secondhand public leads and forum participation;
- the machine contract is parseable;
- the Public Atlas index gives the corrected read order;
- the work queue records the implementation sequence and gates;
- PR #140 describes the corrected outcome;
- no conflicting earlier clause remains controlling without a supersession note;
- a fresh Codex worker can implement the synthetic slice without the current chat.

Architecture completion does **not** mean the forum is built, a public lead is live, or real health data may be collected.

## 15. Codex start instruction

> Continue the AskRigor Community Health Forum and Public Lead Frontier from GitHub, not this prompt. Re-read `AGENTS.md`, the complete canonical Universal and HRP protocol files, `project/PROJECT_INSTRUCTIONS.md`, `project/FORUM_SIGNAL_MODULE.md`, `docs/public-atlas/INDEX.md`, and the forum/lead prior-work scan, spec, plan, and machine contract. Reconcile the current branch/PR stack first. Implement only the isolated synthetic Discourse integration laboratory and contract/migration/service fixtures. Use synthetic users and synthetic health reports. Do not collect real stories, deploy a public forum, index content publicly, activate research recruitment, publish a real lead, or automate regulatory reporting. Preserve the owner correction that deidentified secondhand reports may be public research leads and that public visibility is independent from evidentiary strength. Run the complete applicable deterministic gate, review the final diff, and save exact receipts in GitHub.
