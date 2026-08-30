# Community Health Forum and Public Lead Frontier — architecture receipt

Date: 2026-08-30
Disposition: `ARCHITECTURE_COMPLETE`
Root product disposition: `READY_FOR_SYNTHETIC_IMPLEMENTATION`, nonterminal
No real-data, publication, recruitment, deployment, provider-spending, or automated regulatory action authorized

## Owner outcome preserved

AskRigor must provide a real health forum where members talk with one another. People may report what helped, harmed, failed, or remained unclear for themselves and for people they know. Policy-compliant deidentified secondhand reports may be visible as public research leads at their real evidence level and should feed structured follow-up, signal discovery, evidence checks, research questions, proposals, and long-range Research Missions.

The controlling invariant is:

> Public visibility and evidentiary strength are independent. Weak, incomplete, secondhand, contradicted, or unverified reports may still be useful public discovery leads. Visibility, popularity, repetition, votes, or community reputation do not upgrade causality, prevalence, or formal evidence certainty.

## Correction to the earlier architecture

The earlier story-registry language conflated two publication objects.

### `PUBLIC_NARRATIVE`

A subject-authored or attributable personal story, direct quotation, named or linkable profile, document, image, media item, or subject-voice editorial narrative. Apply exact-version subject approval and the relevant granular permissions.

### `PUBLIC_RESEARCH_LEAD`

A deidentified attributed report about a possible experience. It may be self reported, directly observed by another person, relayed by the affected person, multi-hop hearsay, or extracted from a permitted public source. It must show source distance, verification, missingness, evidence capability, formal-evidence relationship, version, and correction/dispute state.

A reporter-consented secondhand lead may proceed without affected-person exact-version approval only when:

- the public version passes privacy and abuse review;
- the affected person is not named or reasonably reidentifiable;
- no affected-person direct private quotation, document, image, audio, record, or media is published;
- the system does not imply subject verification;
- source distance and limitations are prominent; and
- applicable jurisdiction-specific requirements are satisfied.

This corrected rule supersedes conflicting downstream subject-approval-only assumptions. It does not weaken the consent requirements for attributable narratives or identifiable third-party material.

## Existing-work decision

An independent conception snapshot was preserved before the bounded scan.

Decision: `COMPOSE`.

- Reuse Discourse for the general forum substrate.
- Reuse/adapt FHIR subject/source/author separation and W3C provenance.
- Adapt Open Humans-style granular sharing controls.
- Adapt PatientsLikeMe's discussion-plus-structured-experience participation pattern.
- Adapt James Lind Alliance-style uncertainty consolidation, evidence checking, and stakeholder priority setting.
- Invent only the AskRigor-specific remainder: provenance-typed public leads, exact signal clusters, public evidence relationships, and the closed loop from forum discussion to research question, proposal, mission, result, and updated finding.

A bespoke general forum engine is rejected. Ordinary forum trust, reactions, and popularity remain community/moderation signals, not scientific evidence weights.

## Controlling artifacts

| Artifact | Commit introducing/finalizing the artifact | Role |
|---|---|---|
| `docs/audits/2026-08-30-community-health-forum-and-public-lead-frontier-prior-work.md` | `2237babbef84a0f09f7108b67c2617e9d176655c` | independent conception and existing-work scan |
| `docs/superpowers/specs/2026-08-30-community-health-forum-and-public-lead-frontier.md` | `cae98aec4648a411759fe95a7312f832ff4b3c56` | complete product, data, governance, safety, moderation, privacy, and research architecture |
| `docs/superpowers/plans/2026-08-30-community-health-forum-and-public-lead-frontier.md` | `2f9d8eaeb8a172d706c9e9b18b0a4e4618663e61` | phased implementation and hostile acceptance plan |
| `docs/community-health-forum-and-public-lead-contract-v0.1.0.json` | `e32bd1940021d2164a469b9dc3b74d1df5d48888` | machine-readable publication, provenance, cluster, question, proposal, consent, withdrawal, moderation, privacy, annotation, and safety contract |
| `docs/fixtures/community-lead-andy-like-v0.1.0.json` | `985700a80bf225a4ccc72ba7308a1e55d976c4b8` | synthetic structured one-hop friend-relayed MCAS combination lead |
| `docs/fixtures/public-lead-andy-like-v0.1.0.json` | `3efd2117a129ac2ca52d90a0da778b14e5370aef` | synthetic approved deidentified public-research-lead projection |
| `docs/public-atlas/INDEX.md` | `be6cb4535c86eabef4b34b7c90e759df32dbc271` | controlling read order and supersession notice |
| `docs/work-queue/2026-08-30-community-health-forum-and-public-lead-frontier.md` | `d5f4dc9e40917fbf47377b975ae8f12e209fea0b` | durable nonterminal implementation queue and real-pilot gates |
| `CURRENT-STATE.md` | `9593f7490e0e34c20f14c6bf4176f804a0e69b2b` | current-state pointer and nondeployment boundary |
| `tests/community-forum-architecture-docs.test.ts` | `3752c3548cb11f041eb324ccabed58c09f99c261` | executable JSON and corrected public-lead architecture invariants |

## Architecture coverage

The controlling specification includes:

- condition communities, helped, harmed, no-effect, regimen-lab, study-discussion, support, research-proposal, corrections, and governance spaces;
- topic types and a progressive structured-experience composer;
- explicit opt-in conversion from forum conversation to structured lead;
- self, direct-observer, subject-relayed, multi-hop, public-source, mixed, and unknown source-distance states;
- separate visibility, reporter, origin, verification, completeness, evidence capability, formal-evidence relationship, discovery-value, research-priority, privacy, safety, moderation, and duplication dimensions;
- public condition/intervention frontiers showing benefit, harm, no effect, mixed, and unknown reports;
- prohibition on naive effectiveness percentages, cure rates, or positive-post rankings without a defensible denominator and sampling design;
- exact regimen/combination, outcome, horizon, diagnostic scope, and source-independence clustering;
- end-to-end provenance from post to lead, cluster, question, proposal, mission, result, and finding;
- granular forum, indexing, lead, aggregate, quotation, regimen, document/media, recontact, subject-contact, follow-up, linkage, product-improvement, and model-training permissions;
- subject claim, verification, correction, dispute, review/takedown, and withdrawal propagation;
- separate community moderation, scientific annotation, privacy review, safety review, research stewardship, methods review, ethics review, and administration capabilities;
- serious-harm candidate detection and a separate legal/regulatory responsibility assessment lane;
- a James Lind Alliance-inspired living research-priority pipeline;
- closed-loop return of results to originating discussions and leads;
- Discourse/AskRigor service boundaries, signed versioned events, idempotency, deletion/order reconciliation, API surfaces, tables, roles, indexes, governance, transparency reports, metrics, anti-metrics, launch stages, and 30 hostile acceptance cases.

## Synthetic Andy-like boundary

The synthetic fixture models:

- reporter relationship: `FRIEND`;
- information origin: `SUBJECT_RELAYED_TO_REPORTER`;
- source distance: `ONE_HOP_SUBJECT_RELAY`;
- condition: reported MCAS with unknown diagnostic basis;
- one combination episode containing LDN, low-dose NAD+ injections, and low-dose tirzepatide;
- one reported very-large global improvement outcome;
- verification: `UNVERIFIED`;
- evidence capability: `COMBINATION_ASSOCIATION_ONLY`;
- formal evidence: `NOT_CHECKED`;
- completeness: `PARTIAL`;
- public-lead reporter consent: yes;
- direct quotation, documents/media, and model-training permission: no;
- affected-person exact-version approval: absent;
- public projection: deidentified, paraphrased, non-quoted, explicitly secondhand, approved but not published.

No real person, real health record, real forum post, or real public publication is represented by the fixture.

## Verification receipt

Verified artifact head: `3752c3548cb11f041eb324ccabed58c09f99c261`
Pull-request merge test head: `00594d0d6b3e72c5abb327765193d397f8145562`
GitHub Actions workflow: `AskRigor deterministic verification`, run `33325576089`
Repository workflow-policy run: `33325576077`

Results:

- repository workflow policy: `SUCCESS`;
- TypeScript workspace typecheck: `PASS`;
- `tests/community-forum-architecture-docs.test.ts`: `PASS`, 7 tests;
- complete Vitest gate: 111 test files passed, 1 declared skip; 1,477 tests passed, 6 declared skips;
- workspace build: `PASS`;
- real-PostgreSQL living-evidence acceptance: `PASS`, 35 checks;
- living-evidence fixture pilot: `PASS`;
- pilot confirms `raw_source_content_included: false` and `community_data_included: false`.

The new tests establish that:

- the contract and both synthetic fixtures parse as JSON;
- public visibility is modeled independently from source distance, verification, and evidence capability;
- the one-hop friend-relayed fixture can be an approved deidentified `PUBLIC_RESEARCH_LEAD` with null subject approval without subject-voice or causal claims;
- the three interventions remain one combination episode rather than three independent successes;
- direct quotation and documents/media remain withheld;
- naive effectiveness percentages are prohibited in signal clusters;
- public narratives and public research leads have distinct conditional publication requirements.

## PR-stack reconciliation

### PR #140

The corrected architecture belongs on `codex/public-discovery-atlas` / PR #140. This receipt closes its Community Forum/Public Lead architectural scope but does not declare the broader root product built or deployed.

### PR #142

The existing Phase-A implementation remains useful but predates the correction. Its title/body now state that rebase and reconciliation are required. Before merge it must preserve the valid Patient Experience Observatory/privacy work while adapting the old public-story-only boundary to the two-object publication model and rerunning the complete deterministic gate.

An attempted connector operation to convert PR #142 to GitHub draft state failed because of a connector GraphQL schema error. The PR was therefore made visibly nonterminal through the title `DRAFT — Reconcile Phase A contracts with the public-lead/forum architecture` and a blocking owner-correction section in its body. Its GitHub `draft` boolean remains false and must not be misreported.

## Explicitly unresolved implementation work

Architecture is complete. The following are implementation, review, pilot, or release work—not missing architectural decisions:

- isolated synthetic Discourse laboratory;
- supported verified SSO/account-linking spike;
- signed webhook/API bridge and dead-letter reconciliation;
- TypeScript runtime contracts and PostgreSQL migrations;
- repository/service/public-projection implementation;
- progressive forum composer and public frontier UI;
- moderation, privacy, scientific-annotation, safety, and appeals queues;
- legal/regulatory review of digital-platform adverse-event responsibilities;
- security, privacy/reidentification, abuse/manipulation, backup/restore, deletion/cache, and rollback acceptance;
- bounded real-user pilot under separate owner authorization;
- production deployment and direct product acceptance.

## Exact Codex handoff

> Continue the AskRigor Community Health Forum and Public Lead Frontier from GitHub, not this prompt. Re-read `AGENTS.md`, the complete canonical Universal and HRP protocol files, `project/PROJECT_INSTRUCTIONS.md`, `project/FORUM_SIGNAL_MODULE.md`, `docs/public-atlas/INDEX.md`, and the forum/lead prior-work scan, spec, machine contract, synthetic fixtures, implementation plan, work-queue entry, and architecture receipt. Reconcile the current PR stack first: PR #142 predates the corrected public-lead rule and must be rebased/reconciled rather than merged as-is. Implement only the isolated synthetic Discourse integration laboratory and contract/migration/service fixtures. Use synthetic users and synthetic health reports. Do not collect real stories, deploy a public forum, index content publicly, activate research recruitment, publish a real lead, or automate regulatory reporting. Preserve the invariant that deidentified secondhand reports may be public research leads and that public visibility is independent from evidentiary strength. Run the complete applicable deterministic gate, review the final diff, and save exact receipts in GitHub.

## Final disposition

`ARCHITECTURE_COMPLETE`

`ROOT_PRODUCT_NOT_COMPLETE`

`READY_FOR_SYNTHETIC_IMPLEMENTATION`
