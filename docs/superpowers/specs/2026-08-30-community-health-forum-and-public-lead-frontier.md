# AskRigor Community Health Forum and Public Lead Frontier

Date: 2026-08-30
Status: implementation-ready architecture; supersedes conflicting subject-approval-only publication assumptions in earlier Discovery Atlas story-registry drafts
Depends on:

- `../../audits/2026-08-30-community-health-forum-and-public-lead-frontier-prior-work.md`
- `2026-08-30-study-lab-long-range-research-predictions-story-registry.md`
- `2026-08-30-public-discovery-atlas-design.md`
- the canonical living-evidence repository and research-frontier ledger
- current Universal and HRP protocols for substantive health research

## 1. Owner correction and invariant product outcome

AskRigor must not restrict public community evidence to first-person, subject-approved narratives.

The product outcome is:

1. people can talk directly with one another in a real AskRigor health forum;
2. community members can report what helped, harmed, failed, or remains unclear for themselves or people they know;
3. policy-compliant reports can appear on a public frontier at their actual evidence level, including deidentified secondhand reports;
4. AskRigor converts those leads into structured hypotheses, evidence checks, research questions, proposals, and durable Research Missions;
5. no public lead becomes causal or population evidence merely because it is visible, popular, repeated, or emotionally compelling.

The prior rule requiring exact subject approval for every public story applied too broadly. It remains valid for attributable personal narratives, but not for every deidentified public research lead.

## 2. Product composition

AskRigor becomes six connected but separately governed public/research products:

1. **Discovery Atlas** — released findings and evidence maps.
2. **Study Lab** — methods audits, study comparison, and information contribution.
3. **Research Missions** — durable quick, deep, long-range, and living research.
4. **Prediction Registry** — locked forecasts, reveal, and calibration.
5. **Community Health Forum** — peer discussion, condition communities, treatment implementation, support, disagreement, and research participation.
6. **Patient Experience Observatory and Public Lead Frontier** — structured self/proxy/secondhand reports, signal clusters, public research questions, and proposal pipelines.

The Community Health Forum is the social conversation system. The Patient Experience Observatory is the structured evidence-discovery system. They are linked but not interchangeable.

## 3. Core principle: independent axes

The system must never collapse these dimensions into one credibility or quality score.

### 3.1 Public visibility

- `PRIVATE`
- `MEMBER_ONLY`
- `PUBLIC_POST`
- `PUBLIC_RESEARCH_LEAD`
- `PUBLIC_NARRATIVE`
- `WITHDRAWN_TOMBSTONE`

### 3.2 Information-source distance

- `FIRSTHAND_SUBJECT` — the affected person reports their own experience.
- `FIRSTHAND_OBSERVER` — a caregiver, family member, friend, or clinician reports what they directly observed.
- `ONE_HOP_SUBJECT_RELAY` — the affected person told the reporter, who relays it.
- `MULTI_HOP_HEARSAY` — the reporter did not hear it directly from the affected person.
- `PUBLIC_SOURCE_EXTRACTED` — extracted from an external public post, video, article, or case source.
- `MIXED`
- `UNKNOWN`

### 3.3 Reporter relationship

- `SELF`
- `FRIEND`
- `FAMILY`
- `CAREGIVER`
- `CLINICIAN`
- `RESEARCHER`
- `PUBLIC_SOURCE_AUTHOR`
- `OTHER`
- `UNKNOWN`

Relationship and information origin are separate. A friend may be a direct observer or merely relay what the subject said.

### 3.4 Verification state

- `UNVERIFIED`
- `REPORTER_ACCOUNT_VERIFIED`
- `REPORTER_IDENTITY_VERIFIED_PRIVATE`
- `SUBJECT_ACKNOWLEDGED`
- `SUBJECT_VERIFIED`
- `DOCUMENT_CORROBORATED`
- `CLINICIAN_CORROBORATED`
- `MULTIPLE_CORROBORATION_TYPES`
- `CONFLICTED`
- `UNVERIFIABLE`

Verification strengthens provenance, not causal inference by itself.

### 3.5 Clinical-detail completeness

Store field-level status for:

- condition and diagnostic basis;
- baseline symptoms/function;
- intervention identity;
- formulation, route, dose, frequency, duration;
- sequencing and combination components;
- adherence;
- co-interventions and major life/environment changes;
- outcomes and measurement type;
- time to change, peak, persistence, relapse;
- harms;
- dechallenge/rechallenge;
- objective corroboration;
- follow-up;
- source independence.

Public summaries may show `MINIMAL`, `PARTIAL`, `MODERATE`, or `HIGH_DETAIL`, but the underlying missing fields remain inspectable.

### 3.6 Evidence capability

- `LEAD_ONLY`
- `DESCRIPTIVE_REPORT_ONLY`
- `TEMPORAL_ASSOCIATION_ONLY`
- `COMBINATION_ASSOCIATION_ONLY`
- `DECHALLENGE_SIGNAL`
- `RECHALLENGE_SIGNAL`
- `PROSPECTIVE_N_OF_1_SIGNAL`
- `FORMAL_EVIDENCE_LINKED`
- `UNRESOLVED`

A verified identity or large improvement does not automatically raise this field.

### 3.7 Discovery value

Discovery value is not credibility. It captures whether further investigation may be useful. Store separate components:

- novelty;
- intervention specificity;
- outcome magnitude as reported;
- harm urgency;
- independent similar-report count;
- formal-evidence gap;
- biological or implementation plausibility, explicitly labeled;
- tractability of follow-up;
- feasibility of a prospective design;
- decision importance;
- equity/neglected-population importance;
- reversibility and opportunity cost;
- missing information that could materially change interpretation.

Each component needs a rationale and version. Do not publish an unexplained composite score.

### 3.8 Research priority

Research priority is determined from transparent factors such as:

- community interest;
- decision importance;
- evidence uncertainty;
- signal replication and independence;
- harm urgency;
- feasibility;
- expected information value;
- neglected population/outcome;
- cost and ethics;
- potential effect on a current AskRigor finding.

Votes are one input to attention. They never change evidence certainty.

## 4. Two public publication objects

### 4.1 Public narrative

A public narrative is presented as a person's story in their own voice or with attributable details.

Examples:

- first-person account;
- named or pseudonymous profile story;
- direct quotation;
- identifiable timeline;
- documents, images, recordings, or clinician records;
- polished editorial narrative attributed to the subject.

Required controls:

`PRIVATE_DRAFT -> PRIVACY_REVIEW -> REDACTED_PREVIEW -> SUBJECT_APPROVED_EXACT_VERSION -> EDITORIAL_REVIEW -> PUBLISHED`

Applicable permissions remain granular: identity, pseudonym, quotation, exact regimen, media, documents, linkage, research use, recontact, and future use.

### 4.2 Public research lead

A public research lead is an attributed report about a possible experience. It is not presented as the affected person's own publication and is not a scientific case report.

Examples:

- “A friend told me this combination helped them.”
- “I directly saw my partner's symptoms improve after…”
- a deidentified public-forum experience extracted under provider and privacy rules;
- an incomplete report with enough intervention/outcome detail to justify follow-up.

Workflow:

`FORUM_POST_OR_INTAKE -> LEAD_CANDIDATE -> STRUCTURED_LEAD -> PRIVACY_AND_ABUSE_REVIEW -> PUBLIC_LEAD -> CORRECTED_OR_SUPERSEDED`

Subject exact-version approval is not categorically required when the lead is genuinely deidentified, does not use the subject's direct quotations or records, and does not imply subject verification. Jurisdiction-specific restrictions may require a stronger gate.

Required display:

- who is making the report, by role;
- information-source distance;
- verification state;
- exact claim as paraphrased;
- condition certainty;
- intervention/regimen specificity;
- outcome and horizon;
- known missingness;
- evidence capability;
- formal-evidence relationship;
- version/date;
- correction/dispute state;
- explicit statement that it is a research lead, not proof of efficacy.

### 4.3 Andy-like public lead

A valid initial public projection is:

> **Reported substantial MCAS improvement — secondhand lead**  
> A community member reports that an adult friend with reported MCAS experienced substantial improvement while using LDN, low-dose NAD+ injections, and low-dose tirzepatide. This is a one-hop report relayed by a friend, has not been independently verified, and currently lacks enough sequencing, timing, dose, and co-intervention detail to attribute the improvement to the combination or any component. AskRigor retains it as a public lead and a candidate for follow-up, similar-report discovery, and prospective research design.

Do not display the friend's name, location, clinician, rare identifying details, or direct private quotations without the applicable permission.

## 5. Community Health Forum experience

### 5.1 Discussion spaces

Initial category architecture:

- **Condition communities** — condition-specific peer discussion.
- **What helped** — benefit reports and implementation details.
- **What harmed or made things worse** — adverse effects, discontinuation, and warning patterns.
- **What did not help** — no-change and failed-treatment reports.
- **Treatment and regimen labs** — exact formulations, sequences, combinations, adherence, and implementation differences.
- **Study discussions** — linked Study Lab audits and interpretation questions.
- **Research questions and proposals** — candidate uncertainties, designs, recruitment interest, and proposal critique.
- **Practical support** — access, cost, clinicians, testing, daily management, and non-efficacy support.
- **AskRigor corrections and evidence updates** — visible scientific context and changed findings.
- **Forum governance** — rules, moderation decisions, appeals, and community design.

Sensitive condition spaces may be member-only or non-indexed. Public lead publication remains an independent choice.

### 5.2 Topic types

A topic is explicitly typed:

- `DISCUSSION`
- `QUESTION`
- `SELF_EXPERIENCE`
- `PROXY_OR_SECONDHAND_EXPERIENCE`
- `HARM_OR_ADVERSE_EVENT`
- `NO_EFFECT_OR_FAILURE`
- `STUDY_CLAIM`
- `MECHANISM_HYPOTHESIS`
- `RESEARCH_IDEA`
- `RESEARCH_PROPOSAL`
- `SUPPORT_REQUEST`
- `MODERATION_OR_GOVERNANCE`

Typing helps routing but does not constrain normal conversation.

### 5.3 Structured experience composer

A member can choose **Add this experience to the public lead frontier** while posting or later.

The composer asks progressively, not as a blocking exhaustive form:

1. Is this about you or another person?
2. Did you directly experience/observe it, hear it from the person, hear it from someone else, or find it publicly?
3. What condition/problem was involved and how certain is that label?
4. What was tried, including combination components?
5. What changed: improved, worsened, no clear change, mixed, or unknown?
6. Approximate timing and persistence.
7. What else changed at the same time?
8. Any adverse effects?
9. What details are unknown?
10. May AskRigor display this as a public deidentified lead, aggregate it, ask follow-up questions, or use it in research-priority work?

The member can stop early. Missing fields remain missing; the system never invents them.

### 5.4 Ordinary posts are not automatically evidence records

A public forum post remains conversation unless one of these occurs:

- the user explicitly creates a structured lead;
- the user accepts an AskRigor suggestion to convert selected content;
- a moderator/researcher creates an attributed public-source candidate under the applicable provider, privacy, and licensing rules.

AskRigor may classify a post for moderation or safety without treating it as a research lead. It may not silently republish a conversational post into a different public product surface.

### 5.5 Peer interaction

Members can:

- reply and ask clarifying questions;
- follow conditions, interventions, topics, and proposals;
- mark “I had a similar experience,” “different outcome,” “harm,” or “no effect,” which opens a structured mini-intake rather than merely incrementing a reaction count;
- add longitudinal updates;
- compare exact regimen details;
- nominate a thread or lead for AskRigor evidence checking;
- challenge a source or interpretation;
- contribute a study, public source, or counterexample;
- help formulate a research question;
- volunteer for later opt-in prospective follow-up.

## 6. Public “what seems to be helping” frontier

### 6.1 Frontier purpose

The frontier is an inspectable map of submitted experience signals, not an effectiveness ranking.

A condition page should show:

- treatments and combinations being reported;
- benefit, harm, no-effect, mixed, and unknown directions;
- source-distance composition;
- exact regimen fingerprints;
- outcome and time-horizon differences;
- completeness and corroboration;
- independent-source and duplicate-cluster counts;
- follow-up duration;
- formal-evidence relationship;
- active questions, proposals, and missions;
- gaps in negative or long-term follow-up reporting.

### 6.2 Display counts

Permitted:

> 12 submitted reports: 5 firsthand self reports, 3 direct-observer reports, 2 reports relayed by the affected person to a friend/family member, and 2 public-source extractions. Seven described improvement, two no clear change, two worsening, and one mixed outcome.

Required adjacent boundary:

> These are submitted reports from a self-selected community, not a prevalence or treatment-effect estimate. Counts may include incomplete follow-up and reporting bias; linked duplicate reports are counted once in the independent-source view.

Not permitted without a defined denominator and valid sampling design:

- “58% effective”;
- “most people improve”;
- “community cure rate”;
- ranking treatments by positive-post percentage;
- converting reactions or views into patient counts.

### 6.3 Report cards

Each public lead card includes:

- lead title in neutral language;
- reported condition and diagnostic certainty;
- exact intervention/combination summary;
- reported outcome and horizon;
- reporter relationship and information-source distance;
- verification and completeness;
- direct-observation versus relayed boundary;
- adverse effects and no-effect information when available;
- competing explanations/co-interventions;
- formal evidence: corroborated, contradicted, adjacent, not located, or unresolved, with scope matching;
- similar and conflicting report clusters;
- latest version and follow-up date;
- challenge/correction/withdrawal status;
- research status;
- link to source discussion when permitted.

### 6.4 Sorting and filtering

Users may sort/filter by:

- newest;
- most followed-up;
- most detailed;
- firsthand only;
- direct observer;
- relayed/secondhand;
- benefit, harm, no effect, mixed;
- exact intervention or combination;
- outcome and horizon;
- verification type;
- formal-evidence relationship;
- active research proposal;
- most unresolved/high-information-value.

Default ranking must not privilege positive outcomes. It should mix directions and expose counterevidence.

### 6.5 Signal clusters

Cluster only when records match on material dimensions:

- condition/diagnostic scope;
- population/stage;
- intervention/program fingerprint;
- formulation, route, dose, frequency, duration;
- combination and sequence;
- outcome definition;
- time horizon;
- source independence.

Do not cluster all “LDN,” “diet,” “physical therapy,” “supplements,” or “tirzepatide” reports as one homogeneous treatment.

A lead may belong to multiple transparent analytical clusters, but every membership is versioned and justified.

## 7. Provenance and lifecycle

### 7.1 End-to-end lifecycle

`FORUM_POST`

`-> LEAD_CANDIDATE`

`-> STRUCTURED_LEAD`

`-> PUBLIC_LEAD`

`-> SIGNAL_CLUSTER`

`-> CANDIDATE_RESEARCH_QUESTION`

`-> EVIDENCE_CHECKED_UNCERTAINTY`

`-> RESEARCH_PROPOSAL`

`-> RESEARCH_MISSION / PROSPECTIVE_FOLLOW_UP / FORMAL_STUDY`

`-> RESULT`

`-> DISCOVERY_ATLAS_FINDING_OR_NO_CHANGE`

Every transition preserves the source version and responsible actor/activity.

### 7.2 Side states

- `INCOMPLETE`
- `DUPLICATE_LINKED`
- `CHALLENGED`
- `CORRECTED`
- `CONFLICTED`
- `PRIVACY_HOLD`
- `SAFETY_REVIEW`
- `ABUSE_OR_IMPERSONATION_REVIEW`
- `WITHDRAWAL_REQUESTED`
- `PUBLIC_WITHDRAWN`
- `SUPERSEDED`
- `UNVERIFIABLE`
- `OUT_OF_SCOPE`
- `REMOVED_POLICY_VIOLATION`

Weak evidence is not a removal reason. Privacy violation, impersonation, harassment, illegal content, dangerous instruction, spam, and manipulation may be.

### 7.3 W3C-PROV-aligned graph

Represent:

- post and post version as source entities;
- reporter, moderator, reviewer, AskRigor worker, and software as agents;
- extraction, redaction, clustering, evidence checking, proposal formation, and publication as activities;
- structured lead, public version, signal cluster, question, proposal, mission, and finding as derived entities;
- quote, revision, primary-source, derivation, attribution, and invalidation relationships.

Hash every immutable public version. Corrections create new versions; they do not rewrite history invisibly.

## 8. Consent, privacy, and third-party reporting

### 8.1 Independent permissions

Record separately:

- forum posting visibility;
- search-engine indexing;
- public lead projection;
- deidentified aggregation;
- public quotation of reporter;
- public quotation of affected person;
- exact regimen display;
- document/media display;
- recontact;
- subject-contact invitation;
- prospective follow-up;
- research use;
- external record linkage;
- product improvement;
- future model training, if ever proposed.

### 8.2 Third-party subject rule

A reporter may publicly state their own deidentified account of what another person reportedly experienced. AskRigor may structure and display it as a public lead when the privacy gate passes.

Require affected-person permission when the product would:

- identify or make the person reasonably reidentifiable;
- attribute direct private quotations to them;
- publish their documents, images, audio, or records;
- present the account as subject-verified;
- invite public contact with them;
- use a named/pseudonymous profile that is linkable to them;
- conduct research or recontact involving them directly;
- cross a jurisdiction-specific consent requirement.

### 8.3 Deidentification review

Automated checks flag:

- names, handles, email, phone, exact addresses;
- exact dates and age;
- clinician, clinic, employer, school, or rare occupation;
- rare diagnosis/intervention/geography combinations;
- unique quotations searchable elsewhere;
- images, EXIF, documents, and embedded identifiers;
- family relationships that identify a known member;
- minors;
- public-source links that trivially reveal identity.

High-risk cases require human privacy review. “Anonymous” is not accepted as proof of non-identifiability.

### 8.4 Subject claim, verification, correction, and takedown

An affected person may:

- privately claim a lead;
- acknowledge that the report concerns them;
- verify selected fields;
- contribute their own narrative or structured follow-up;
- correct or dispute the report;
- request deidentification review or takedown;
- decline further contact.

A subject correction does not automatically erase the reporter's fact that they made the report. Public display may be corrected, challenged, or withdrawn, with a minimal non-identifying tombstone and audit history.

### 8.5 Withdrawal

Withdrawal propagates to:

- public lead projection;
- search index;
- public clusters and counts;
- quotations;
- future research datasets where revocable;
- cached/generated views;
- downstream public proposal examples.

Aggregated analyses already irreversibly anonymized may remain only under the disclosed policy. The public UI must state what was removed and what cannot be reversed.

## 9. Moderation, scientific annotation, and disagreement

### 9.1 Separate roles

- **Community moderators** enforce conduct, spam, harassment, doxxing, and category rules.
- **Scientific annotators** classify claims, add source-linked context, and connect formal evidence.
- **Privacy reviewers** assess deidentification and third-party risk.
- **Safety reviewers** triage urgent harms and adverse-event candidates.
- **Research stewards** consolidate questions and proposals.
- **Administrators** operate the platform but do not receive scientific authority by role.

One person may hold multiple roles, but every action records the active role.

### 9.2 Annotation types

- `EXPERIENCE_REPORT`
- `SECONDHAND_REPORT`
- `DIRECT_OBSERVATION`
- `MECHANISM_HYPOTHESIS`
- `CAUSAL_CLAIM`
- `FORMAL_EVIDENCE_CLAIM`
- `SAFETY_CLAIM`
- `COMMERCIAL_OR_CONFLICT_DISCLOSURE`
- `ASKRIGOR_CONTEXT_NOTE`
- `CORRECTION`
- `UNRESOLVED_DISPUTE`

### 9.3 Context, not silent rewriting

AskRigor must not rewrite a member's post to make it scientifically cleaner. It may:

- ask for clarification;
- add a visibly separate context note;
- attach a structured lead paraphrase for approval by the reporter;
- label source distance and missingness;
- correct a factual evidence claim with sources;
- restrict dangerous or policy-violating content;
- preserve the original and edit history.

Subjective experience is not “fact-checked away.” Claims about mechanism, causality, prevalence, safety, or universal effectiveness can be challenged.

### 9.4 Appeals

Moderation removals, scientific annotations, privacy holds, safety escalations, duplicate decisions, and proposal closures must be appealable. Appeals preserve the original decision, evidence, reviewer, and outcome.

## 10. Safety architecture

### 10.1 Safety candidate detection

Create a separate `SAFETY_SIGNAL_CANDIDATE` when a post or lead mentions:

- death, hospitalization, disability, life threat, congenital issue, or other serious outcome;
- severe unexpected reaction;
- product contamination or batch issue;
- dangerous interaction;
- self-harm or immediate crisis;
- repeated similar harms;
- advice that may cause imminent harm.

The community post and scientific lead continue under their own state; safety review is an additional lane.

### 10.2 Triage record

Store:

- affected person and reporter identifiability state;
- product/intervention identity;
- event description and seriousness;
- timing;
- jurisdiction;
- manufacturer/marketing-authorisation-holder relationship, if any;
- follow-up feasibility;
- applicable regulatory responsibility assessment;
- urgent-user response;
- reporting action or reason none was required;
- audit trail.

Do not promise confidentiality that cannot be maintained when imminent safety or legal obligations apply.

### 10.3 Advice boundary

Allow people to describe what they did and discuss implementation, but enforce category-specific rules against:

- impersonating clinicians;
- guaranteed cure claims;
- coercive pressure to stop necessary care;
- individualized dangerous dosing or procurement instructions;
- sale/scams/undisclosed affiliate promotion;
- illegal or acutely hazardous instructions;
- delaying emergency evaluation.

Restrictions target harmful conduct, not unconventional experiences merely because they are unconventional.

## 11. Research-question and proposal pipeline

### 11.1 Candidate question formation

A signal cluster can produce one or more candidate questions. Preserve:

- originating leads and source-distance mix;
- exact population, intervention/combination, comparator, outcome, setting, and horizon;
- why the question matters;
- what existing evidence appears to answer;
- remaining uncertainty;
- information needed before a study is feasible;
- conflicts and counterreports;
- community and clinician relevance;
- potential study designs.

### 11.2 Evidence checking

Before calling a question unanswered:

1. search current formal evidence and registries;
2. inspect existing AskRigor findings and research frontier;
3. separate exact matched evidence from adjacent evidence;
4. identify ongoing studies;
5. classify:
   - `ANSWERED_FOR_SCOPE`;
   - `PARTIALLY_ANSWERED`;
   - `FORMAL_EVIDENCE_CONFLICTED`;
   - `NOT_ANSWERED`;
   - `QUESTION_NOT_YET_WELL_FORMED`;
   - `INACCESSIBLE_OR_UNRESOLVED`.

Community interest cannot make an answered question unanswered, but it may expose an unstudied regimen, subgroup, outcome, implementation, or horizon.

### 11.3 Proposal types

- targeted systematic or rapid review;
- evidence-map update;
- structured retrospective survey;
- prospective observational cohort;
- prospective community follow-up;
- N-of-1 protocol;
- case series with defined ascertainment;
- pragmatic trial;
- randomized trial;
- diagnostic/biomarker study;
- mechanistic study;
- pharmacovigilance analysis;
- qualitative implementation study;
- data-linkage study.

AskRigor proposes the design that can answer the question, not the design most likely to validate the community belief.

### 11.4 Proposal card

Public proposal pages show:

- question and scope;
- originating community signal;
- evidence check;
- competing explanations;
- proposed design;
- inclusion/exclusion;
- outcomes and horizon;
- sample-size/information target when applicable;
- safety/ethics requirements;
- data and privacy plan;
- budget/resource estimate;
- recruitment interest, not enrollment;
- community, clinician, methods, and funder endorsements separately;
- open critiques;
- status and next gate.

### 11.5 Prioritization

Use a James Lind Alliance-inspired but living process:

- gather;
- deduplicate;
- formulate;
- evidence-check;
- solicit patient/carer/clinician/researcher rankings;
- expose group differences;
- methods and ethics review;
- publish priority rationale;
- start a Research Mission or external proposal.

Do not collapse stakeholder groups into one opaque vote total.

### 11.6 Closed-loop return

When research completes, post results back to:

- originating forum threads;
- public lead cards;
- signal cluster;
- proposal page;
- Research Mission;
- Discovery Atlas finding;
- prediction outcomes when applicable.

Show whether the result supported, contradicted, narrowed, or failed to answer the original lead-generated question. Do not shame contributors for hypotheses that did not hold up.

## 12. Participation and incentive design

### 12.1 Reward useful behavior

Badges/reputation may recognize:

- longitudinal follow-up;
- reporting no effect or harm;
- adding a counterexample;
- clarifying exact regimen details;
- identifying duplicates;
- contributing sources;
- correcting one's own record;
- helping formulate an answerable question;
- proposal stewardship;
- constructive moderation.

Badges must not imply medical expertise, treatment efficacy, or scientific authority.

### 12.2 Do not optimize for positivity

The feed and frontier must deliberately solicit and surface:

- no effect;
- worsening;
- discontinuation;
- temporary benefit;
- relapse;
- failed implementation;
- access barriers;
- alternative explanations.

Positive-only engagement metrics create biased data and are prohibited as primary optimization targets.

### 12.3 Follow-up prompts

With permission, prompt at meaningful intervals such as:

- shortly after initial report;
- 1 month;
- 3 months;
- 6 months;
- 12 months;
- after stopping/restarting or major regimen change.

Intervals are configurable by condition/intervention and not treatment advice.

## 13. Technical architecture

### 13.1 Composition decision

Use:

- **Discourse** as the forum system of record for raw topics/posts, reactions, moderation queues, notifications, categories, tags, and discussion search;
- **AskRigor identity service** as the canonical product account and permission authority;
- **DiscourseConnect or another supported verified SSO configuration** for shared identity;
- **Community Bridge** for signed, idempotent webhook/API synchronization;
- **AskRigor living-evidence PostgreSQL** as the canonical structured lead, provenance, evidence, question, proposal, and mission authority;
- **Public projection/search service** for frontier pages;
- **Safety/privacy/moderation services** as separate controlled roles and queues.

Do not fork Discourse to encode scientific semantics in the forum database.

### 13.2 Service boundaries

#### Forum service

Owns:

- raw user-authored content;
- thread structure;
- forum reactions;
- ordinary edit history;
- category/tag membership;
- community moderation state;
- forum notifications.

#### Community Bridge

Owns:

- webhook authentication;
- idempotency;
- stable cross-system IDs;
- event version/order reconciliation;
- retry/dead-letter state;
- minimal post metadata and hashes;
- command callbacks for labels/context links.

#### Lead Intake service

Owns:

- structured intake;
- source-distance classification;
- reporter approval of paraphrase;
- completeness;
- consent;
- deidentification routing;
- public lead versions;
- follow-up prompts.

#### Evidence service

Owns:

- formal-evidence links;
- Study Lab audits;
- signal clusters;
- contradiction/adjacency classification;
- evidence-checking candidate questions;
- public findings.

#### Research Priority service

Owns:

- question formulation;
- stakeholder rankings;
- proposal versions;
- methods/ethics review state;
- Research Mission handoff.

#### Safety service

Owns:

- adverse-event/crisis candidates;
- safety triage;
- jurisdictional responsibility assessment;
- follow-up and reporting receipts.

### 13.3 Data-minimization boundary

Do not duplicate the complete forum corpus into the evidence repository by default.

Store in AskRigor:

- forum/topic/post stable IDs;
- source URL where permitted;
- source version/hash;
- author pseudonymous cross-system ID;
- timestamps and visibility state;
- selected approved excerpt or paraphrase;
- structured lead fields;
- provenance edges;
- moderation/scientific/safety references.

Raw private/member-only forum text remains in the forum service unless a separately authorized structured intake requires it.

### 13.4 Event contract

Minimum signed events:

- `forum.topic.created.v1`
- `forum.topic.updated.v1`
- `forum.topic.visibility_changed.v1`
- `forum.post.created.v1`
- `forum.post.edited.v1`
- `forum.post.deleted.v1`
- `forum.user.suspended.v1`
- `forum.lead_opt_in.created.v1`
- `lead.structured.v1`
- `lead.publication_requested.v1`
- `lead.published.v1`
- `lead.corrected.v1`
- `lead.challenged.v1`
- `lead.withdrawn.v1`
- `cluster.updated.v1`
- `research_question.created.v1`
- `proposal.status_changed.v1`
- `safety_candidate.created.v1`

Each event includes:

- event ID;
- schema version;
- producer;
- source aggregate ID/version;
- occurred and received timestamps;
- idempotency key;
- payload hash;
- visibility/privacy classification;
- trace/correlation ID.

Out-of-order edits and deletes must reconcile against source version, not arrival time.

### 13.5 Suggested API surface

Private/control APIs:

- `POST /community/events/discourse`
- `POST /community/leads`
- `POST /community/leads/{lead_id}/publications`
- `POST /community/leads/{lead_id}/corrections`
- `POST /community/leads/{lead_id}/verification-invitations`
- `POST /community/leads/{lead_id}/withdrawal`
- `POST /community/leads/{lead_id}/safety-review`
- `POST /community/clusters/recompute`
- `POST /community/questions/from-cluster`
- `POST /community/proposals`

Public read APIs:

- `GET /public/community/conditions/{condition_id}/frontier`
- `GET /public/community/interventions/{intervention_id}/frontier`
- `GET /public/community/leads/{lead_id}`
- `GET /public/community/clusters/{cluster_id}`
- `GET /public/community/questions/{question_id}`
- `GET /public/community/proposals/{proposal_id}`

All public projections return explicit provenance/evidence fields and omit private identities.

## 14. Canonical data model additions

Proposed entities/tables:

### Forum bridge

- `community_forum_accounts`
- `community_forum_topics`
- `community_forum_posts_minimal`
- `community_forum_post_versions`
- `community_forum_events`
- `community_bridge_dead_letters`

### Lead registry

- `community_leads`
- `community_lead_sources`
- `community_lead_reporters`
- `community_lead_subject_private_refs`
- `community_lead_conditions`
- `community_lead_interventions`
- `community_lead_combinations`
- `community_lead_outcomes`
- `community_lead_adverse_events`
- `community_lead_timeline_events`
- `community_lead_completeness`
- `community_lead_verifications`
- `community_lead_challenges`
- `community_lead_corrections`
- `community_lead_consents`
- `community_lead_public_versions`
- `community_lead_withdrawals`

### Frontier and research

- `community_signal_clusters`
- `community_signal_cluster_memberships`
- `community_signal_cluster_snapshots`
- `community_frontier_projections`
- `community_research_questions`
- `community_question_evidence_checks`
- `community_question_rankings`
- `community_research_proposals`
- `community_proposal_reviews`
- `community_proposal_endorsements`
- `community_mission_links`

### Governance/safety

- `community_moderation_events`
- `community_scientific_annotations`
- `community_privacy_reviews`
- `community_safety_candidates`
- `community_safety_actions`
- `community_appeals`
- `community_conflict_disclosures`

Direct identifiers stay behind a separate protected service/schema and database role. Public readers cannot join to private subject/reporter identity tables.

## 15. Authorization and role model

Roles:

- `COMMUNITY_MEMBER`
- `CATEGORY_MODERATOR`
- `GLOBAL_MODERATOR`
- `SCIENTIFIC_ANNOTATOR`
- `PRIVACY_REVIEWER`
- `SAFETY_REVIEWER`
- `RESEARCH_STEWARD`
- `METHODS_REVIEWER`
- `ETHICS_REVIEWER`
- `SYSTEM_SERVICE`
- `ADMINISTRATOR`

Permissions are capability-specific. An administrator cannot publish a scientific conclusion merely because they administer the system. A scientific annotator cannot expose private data. A moderator cannot silently change evidence classification.

## 16. Search and indexing

Maintain separate indexes for:

- public forum content;
- member-only forum content;
- public structured leads;
- signal clusters;
- research questions/proposals;
- formal evidence/findings.

A public lead can remain indexed after its source thread becomes member-only only when the lead has independent public-lead consent and privacy approval. Otherwise it is removed from public projection.

Sensitive categories default to `noindex` or member-only. Public lead pages are indexable only after explicit public-lead consent and privacy review.

## 17. Governance

### 17.1 Community governance board

Include:

- people living with represented conditions;
- carers/family;
- clinicians;
- methods researchers;
- privacy/safety expertise;
- community moderators;
- AskRigor product representatives.

Responsibilities:

- category and conduct rules;
- appeal policy;
- research-priority fairness;
- commercial-interest rules;
- transparency reports;
- neglected-population review;
- changes to public lead policy.

### 17.2 Conflicts and commercial behavior

Require disclosure for:

- manufacturers;
- clinics;
- paid advocates;
- affiliate links;
- researchers recruiting participants;
- authors discussing their own work;
- moderators/reviewers with relevant interests.

Undisclosed coordinated promotion can trigger reduced distribution, annotation, suspension, and cluster-independence correction. It does not erase authentic counterreports.

### 17.3 Transparency reports

Publish aggregate reports on:

- posts/leads by source-distance and direction;
- moderation actions and appeals;
- scientific annotations/corrections;
- privacy holds/withdrawals;
- safety candidates and handling categories, without exposing private cases;
- coordinated manipulation;
- proposal and research conversions;
- demographic/condition representation where safely measurable.

## 18. Metrics and anti-metrics

### 18.1 Success metrics

- active contributors and retained peer discussions;
- percentage of experience posts converted through explicit opt-in to structured leads;
- field-completion improvement after adaptive follow-up;
- longitudinal follow-up rate;
- harm/no-effect/mixed report share;
- independent-source deduplication accuracy;
- time from lead to formal-evidence relationship;
- time from cluster to well-formed research question;
- proposals created, reviewed, funded, launched, and completed;
- findings returned to originating community;
- correction and withdrawal propagation completeness;
- moderation, privacy, and safety response times;
- appeal overturn rates;
- reidentification and harassment incidents;
- contributor diversity and neglected-condition coverage.

### 18.2 Prohibited primary optimization targets

- raw time on site;
- controversy;
- positive-treatment post volume;
- views, likes, or replies without quality context;
- treatment conversion or sales;
- number of public leads irrespective of privacy/completeness;
- evidence certainty increased per community vote.

## 19. Launch stages and gates

### Stage A — synthetic integration laboratory

- isolated Discourse instance;
- synthetic users/posts/leads only;
- SSO and webhook replay;
- edit/delete/order/idempotency tests;
- role/permission tests;
- synthetic public frontier;
- no external indexing;
- no real health data.

### Stage B — internal moderated dogfood

- staff/approved testers;
- no public lead pages;
- test structured composer, context notes, appeals, and safety queue;
- privacy/red-team review;
- legal/regulatory classification.

### Stage C — bounded invitation pilot

- small opt-in condition communities;
- clear public/member/private surfaces;
- human review of every public lead;
- no automated efficacy aggregation;
- published transparency metrics;
- predefined rollback and deletion test.

### Stage D — public forum and frontier

Requires:

- moderation staffing and escalation coverage;
- privacy and reidentification acceptance;
- safety/regulatory operating procedure;
- verified SSO and account recovery;
- abuse/manipulation controls;
- public consent UX acceptance;
- withdrawal/search-cache propagation;
- forum/provider terms review;
- complete public disclaimers and evidence labels;
- independent security review.

### Stage E — research proposal and prospective programs

Requires proposal governance, methods/ethics review, applicable IRB/ethics approval, funding and conflict disclosure, data-management plan, and study-specific consent.

## 20. Hostile acceptance cases

The architecture is not accepted until fixtures/tests establish all of the following.

1. **Andy-like relayed lead:** a friend relays a subject's experience; a deidentified public lead is permitted, clearly labeled one-hop secondhand, without subject-voice claims.
2. **Reidentification risk:** the same lead includes rare condition, exact town, clinic, age, and date; public projection is blocked until adequately generalized.
3. **Private quotation:** the reporter pastes a message from the friend; direct quotation is withheld unless applicable permission exists; a neutral paraphrase may remain.
4. **Subject later verifies:** verification upgrades provenance but not causality.
5. **Subject disputes:** the lead becomes challenged; dispute is visible, review/takedown proceeds, and no silent deletion rewrites history.
6. **Incomplete hearsay:** a low-detail multi-hop report remains visible at its tier if policy-compliant, with missingness and low provenance prominent.
7. **Duplicate virality:** fifty reposts of one story count as one independent source and preserve duplicate relationships.
8. **Commercial sockpuppets:** coordinated clinic/vendor accounts do not manufacture an independent signal cluster.
9. **Positive selection:** ten benefit reports and zero denominator cannot yield an efficacy percentage.
10. **No-effect counterreport:** a no-effect report is displayed and can materially change cluster interpretation without being downranked for low engagement.
11. **Serious harm:** a severe adverse event creates a safety candidate while preserving the public report under the applicable privacy/safety rules.
12. **Dangerous instruction:** an experience report remains, but individualized acutely hazardous instructions can be restricted and separately annotated.
13. **Moderator edit:** moderator changes are versioned and do not silently alter the member's scientific meaning.
14. **Scientific disagreement:** AskRigor attaches contradicted/adjacent evidence without rewriting the member's account or declaring their subjective experience false.
15. **Vote brigading:** votes change neither evidence capability nor scientific certainty.
16. **Combination report:** LDN, NAD+ injections, and tirzepatide remain one combination episode with components, not three independent successes.
17. **Formal contradiction:** an aligned RCT conflict is shown; the community reports are not erased, and the formal evidence is not downgraded by report count.
18. **External-source extraction:** provider terms, attribution, source visibility, quotation, privacy, and deletion boundaries are enforced.
19. **Deleted source post:** public lead retention depends on independent lead consent and policy; provenance records deletion and version.
20. **Minor subject:** enhanced privacy and guardian/legal review block ordinary public projection.
21. **Public post without lead opt-in:** it remains in the forum and is not silently aggregated into the frontier.
22. **Paid private intake:** no forum or public projection occurs without explicit later consent.
23. **Withdrawal:** public pages, counts, search, caches, and proposal examples update; minimal audit tombstone remains.
24. **Stale evidence:** a changed formal finding updates the cluster relationship and originating threads.
25. **Research popularity:** a popular proposal still fails if the question is already answered or the design cannot answer it.
26. **Negative research result:** results return to the community without hiding or punishing the originating hypothesis.
27. **Role collision:** a moderator cannot self-approve scientific or privacy review where independence is required.
28. **Out-of-order webhook:** delete/edit events reconcile by version and do not resurrect removed content.
29. **SSO account takeover boundary:** external identity email verification and account-linking acceptance prevent unsafe identity merges.
30. **Publication-state confusion:** `PUBLIC_RESEARCH_LEAD` cannot render with `PUBLIC_NARRATIVE` subject-verification language.

## 21. Acceptance criteria

### Forum

- Members can talk to one another in full threaded discussions.
- Free-form conversation and structured lead intake coexist.
- The forum uses a mature substrate rather than a bespoke discussion engine.
- Community moderation state is separate from scientific annotation.
- Public, member-only, and private surfaces are explicit.

### Leads

- Self, direct observer, subject-relayed, hearsay, and public-source reports remain distinguishable.
- Evidence weakness never silently forces privacy when a deidentified public lead is otherwise permissible.
- Subject-approved narratives and deidentified public leads use different workflows.
- Incomplete reports remain useful and visible with missingness.
- Combination, sequence, outcome, and horizon are preserved.
- Public display never implies efficacy, prevalence, or subject verification without basis.

### Frontier

- Benefit, harm, no effect, mixed, and unknown reports are visible.
- Counts disclose recruitment/source-distance and cannot become naive percentages.
- Duplicates and coordinated sources do not inflate independence.
- Formal evidence relationships are scope-matched and versioned.
- Every cluster links to its member leads and derivation logic.

### Research pipeline

- Community leads can create evidence-checked research questions and proposals.
- Votes affect priority only.
- Answered questions close transparently; partially answered questions narrow.
- Proposals include methods, ethics, privacy, safety, cost, and conflicts.
- Research results return to originating forum and lead surfaces.

### Privacy and safety

- Third-party deidentification is actively tested, not assumed.
- Direct quotations, identifiable narratives, documents, and media use stronger consent gates.
- Withdrawal propagates across projections and indexes.
- Serious harm routes to a separate safety lane.
- Moderation, privacy, scientific, and safety roles are separately auditable.

## 22. Explicit non-goals

This architecture does not:

- declare community reports representative;
- replace trials or systematic reviews;
- promise that all leads are true;
- require the affected person to approve every anonymous relay;
- allow doxxing or publication of private medical records;
- make the forum a medical-practice service;
- permit votes to establish efficacy;
- turn every post into durable evidence;
- authorize a real-data pilot, public deployment, recruitment, or study;
- authorize automated regulatory reporting without a reviewed legal duty and operating procedure.

## 23. Final architecture decision

The AskRigor forum and public lead frontier are one acquisition-and-learning loop with two canonical systems:

- Discourse owns conversation.
- AskRigor owns structured provenance, evidence classification, public lead versions, signal clusters, research questions, proposals, missions, and findings.

Every policy-compliant lead can contribute at its real level. AskRigor's scientific contribution is not deciding which experiences are worthy of being heard; it is making the source distance, missingness, uncertainty, conflict, and next research step impossible to confuse with stronger evidence.
