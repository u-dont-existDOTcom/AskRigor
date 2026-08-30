# Work queue — Community Health Forum and Public Lead Frontier

Date: 2026-08-30
Status: architecture complete; isolated synthetic Discourse plus composer/frontier/role-separated queue contract, migration, and service fixtures implemented and locally verified; no real-data collection, public deployment, recruitment, or automated safety reporting authorized
Owner source: Joel, 2026-08-30

## Owner outcome

AskRigor should operate a real peer forum where people talk with one another, not only with AskRigor. Community members should be able to report what seems to have helped, harmed, failed, or remained unclear for themselves and for people they know. Policy-compliant deidentified secondhand reports should be visible as public research leads at their actual evidentiary level and should feed future evidence checks, research questions, proposals, and long-range Research Missions.

Public visibility and evidence strength are independent. A weak, incomplete, or secondhand report may still be a useful public discovery lead. Popularity, repetition, votes, or moderator reputation may affect attention and moderation but may not change scientific certainty.

## Controlling architecture

Read in this order:

1. `../audits/2026-08-30-community-health-forum-and-public-lead-frontier-prior-work.md`
2. `../superpowers/specs/2026-08-30-community-health-forum-and-public-lead-frontier.md`
3. `../community-health-forum-and-public-lead-contract-v0.1.0.json`
4. `../fixtures/community-lead-andy-like-v0.1.0.json`
5. `../fixtures/public-lead-andy-like-v0.1.0.json`
6. `../superpowers/plans/2026-08-30-community-health-forum-and-public-lead-frontier.md`
7. `../public-atlas/COMMUNITY-FORUM-ARCHITECTURE-RECEIPT.md`

These files supersede any earlier downstream requirement that affected-person exact-version approval is necessary before every deidentified secondhand lead can be public. Exact affected-person approval remains required for attributable public narratives, subject-voice presentation, direct private quotations, identifiable or reasonably reidentifiable cases, private documents/media, and other explicitly consent-gated uses.

## Architecture decision

**Compose rather than invent.**

- Reuse Discourse for topics, posts, replies, forum search, notifications, trust levels, flags, categories, tags, and community moderation.
- Use AskRigor identity as the product authority and a supported verified SSO bridge.
- Add a signed, idempotent Community Bridge rather than duplicating the full forum corpus into the evidence repository.
- Use the existing AskRigor PostgreSQL living-evidence repository for structured leads, public versions, provenance, clusters, evidence relationships, research questions, proposals, mission links, corrections, and withdrawals.
- Keep community moderation, scientific annotation, privacy review, safety review, and research stewardship as separately auditable capabilities.

## Required independent dimensions

Implementation must store and display separately:

- forum/public visibility;
- reporter relationship;
- information origin and source distance;
- verification/corroboration;
- clinical-detail completeness;
- evidence capability;
- formal-evidence relationship;
- source independence and duplication;
- discovery value;
- research priority;
- privacy/safety/moderation state.

No unexplained credibility score may substitute for these fields.

## Required public objects

### Public narrative

A subject-authored or attributable story, quotation, profile, document, image, or other subject-voice publication. Apply exact-version subject approval and the relevant granular permissions.

### Public research lead

A deidentified report about a possible experience. It may be self reported, directly observed by another person, relayed by the affected person, multi-hop hearsay, or extracted from a permitted public source. It must state source distance, verification, missingness, evidence capability, and formal-evidence relationship and must not imply subject verification or efficacy.

A reporter-consented secondhand lead may be public without affected-person exact-version approval only when the public version passes privacy and abuse review, is not reasonably identifying, contains no affected-person private quotation, document, image, or media, and complies with jurisdiction-specific requirements.

## Immediate synthetic implementation slice

1. Reconcile the current PR stack and the pre-correction Phase-A story tests.
2. Create an isolated, non-public Discourse integration laboratory with synthetic users and synthetic health discussions only.
3. Implement supported verified SSO behavior and hostile account-linking/takeover fixtures.
4. Implement signed/idempotent webhook ingestion, version reconciliation, deletion, visibility changes, and dead-letter recovery.
5. Add TypeScript contracts and PostgreSQL migrations for forum references, community leads, public lead versions, verification, completeness, consent, withdrawal, clusters, questions, proposals, scientific annotations, privacy reviews, moderation events, and safety candidates.
6. Implement synthetic repository/service functions for create, structure, approve, publish, challenge, correct, verify, duplicate-link, cluster, withdraw, and project publicly.
7. Implement synthetic public-frontier projections and the progressive structured-experience composer.
8. Add hostile tests from the controlling specification, especially the Andy-like public secondhand lead, reidentification, duplicate virality, commercial sockpuppets, no-effect visibility, serious harms, role collisions, out-of-order events, and withdrawal propagation.
9. Update the privacy data map, threat model, source-storage policy, role matrix, and release/non-release receipts.
10. Run the complete applicable deterministic gate and independently review the final diff.

## Explicitly not authorized in the immediate slice

- real user accounts or health reports;
- a publicly reachable forum;
- search-engine indexing;
- publication of Andy's or any real person's experience;
- research recruitment or participant contact;
- public effectiveness percentages or treatment rankings from submitted reports;
- autonomous regulatory or manufacturer reporting;
- collection of identifiable medical records;
- paid provider spending or production deployment;
- changes to formal AskRigor findings based only on community reports.

## Synthetic implementation checkpoint — 2026-08-30

The bounded implementation slice now contains:

- an exact-source/exact-image Discourse development runtime with one
  loopback-only HTTP binding, outbound email disabled, deny-all robots policy,
  disposable storage, four `.invalid` fixture users, three marker-checked
  synthetic topics, and public/member/private permission acceptance;
- canonical TypeScript runtime contracts for forum events/references, accounts,
  structured leads, public narratives, public research leads, verification,
  challenges/corrections, duplicate-aware clusters, questions/evidence checks,
  proposals, roles, consent, safety, and withdrawal;
- signed DiscourseConnect and webhook fixtures with exact endpoint, account
  collision/recovery, session invalidation, replay/order/delete, hash-only
  sanitized dead letters, and every-source provenance checks;
- the third append-only PostgreSQL migration plus repository acceptance for
  synthetic accounts, events, leads, public versions, clusters, withdrawal,
  privacy constraints, and the nonautomation gates; and
- an exact runtime receipt under `../audits/` and a dedicated implementation
  receipt under `../public-atlas/`.

This checkpoint does not implement a visual/public frontier UI, staffed
moderation/privacy/safety operations, a real-user pilot, or a production
release. Those remain in the queue and still require the gates below. The root
outcome remains nonterminal.

## Synthetic composer/frontier/queue checkpoint — 2026-08-30

The next bounded contract/migration/service slice now adds:

- a member-controlled append-only composer state machine for direct structured
  intake or explicit forum-post conversion, early stop, preserved missingness,
  exact public paraphrase/provenance preview, acknowledgement, and granular
  public-lead permission;
- public-frontier cards and filters that preserve source distance,
  verification, completeness, evidence capability, formal-evidence
  relationship, versions, corrections/challenges/withdrawal, harms/no effect,
  confounders, research status, and duplicate-aware source independence;
- deterministic direction-balanced default ordering with no positive-first or
  engagement-driven ranking, no effectiveness percentage, and an adjacent
  self-selection/denominator boundary;
- explicit append-only actor-role assignments and capability-specific
  moderation, privacy, scientific, safety, research-stewardship,
  methods/ethics, and administration queues whose actions cannot rewrite the
  member's source-meaning hash; and
- a fourth PostgreSQL migration and 12-check synthetic repository acceptance,
  including independent-review collision and no-automated-reporting gates.

The next stacked synthetic service slice now adds:

- hostile-integrity records for commercial coordination, sockpuppets, vote
  brigading, impersonation, reidentification attempts, and dangerous
  instructions, bound to exact independent moderation, scientific, privacy, or
  safety queues without changing evidence or source independence;
- separate append-only moderation/scientific disagreement and publication-
  lifecycle records, with `APPROVED` explicitly not visible and only
  `SYNTHETIC_LAB_PROJECTION` able to establish initial lab visibility; an
  explicit `CHALLENGED` transition may preserve a visible dispute or place it
  on hold;
- exact withdrawal-propagation receipts that remove one projection, recompute
  or retire clusters, and mark dependent questions/proposals for review while
  retaining no public content; and
- exact cluster-version question dependencies and evidence-check-bound,
  nonrecruiting proposals, enforced by migration `0005` and a 14-check
  PostgreSQL acceptance path.

The next safe synthetic-only closure task is the remaining hostile acceptance
matrix and closed-loop result propagation: appeals/reversals, aligned formal
contradiction and stale-evidence updates, answered/partial/conflicted question
transitions, design-feasibility gates, and negative-result return to the
originating cluster/thread. It remains contract/service/migration/test work;
visual/public UI, real users, external indexing, recruitment, and deployment
remain separately gated.

## Gates before any real-user pilot

- owner authorization for the bounded pilot;
- security and SSO review;
- privacy/reidentification red team;
- applicable legal and regulatory review, including adverse-event responsibilities;
- moderator, privacy, and safety staffing/escalation coverage;
- consent, terms, retention, deletion, cache, and search-index withdrawal acceptance;
- forum/provider terms and source-storage review;
- abuse, impersonation, coordinated-promotion, and harassment controls;
- backup, restore, export, rollback, and deletion acceptance;
- transparent public evidence labels and no unresolved high-severity hostile fixture.

## Completion model

Architecture completion is not forum completion. The root product outcome remains open until a separately authorized implementation, pilot, review, deployment, and direct product acceptance establish that people can actually discuss, submit leads, see the public frontier, and follow the lead-to-research loop safely.

Current next state: `SYNTHETIC_HOSTILE_LIFECYCLE_RESEARCH_FOUNDATION_IMPLEMENTED`;
continue with the remaining synthetic hostile acceptance and closed-loop result
fixtures before any separately authorized visual UI or real-user pilot.
Root outcome remains nonterminal.
