# Community Health Forum and Public Lead Frontier — prior-work scan

Date: 2026-08-30
Status: bounded architecture research; no collection, publication, deployment, or moderation operation authorized
Owner correction: anonymized secondhand reports may be useful public research leads; public visibility must not be limited to subject-authored or subject-approved narratives

## Independent conception snapshot preserved before the scan

### Problem

Health forums contain valuable reports of what people believe helped, harmed, or failed, but ordinary threads are difficult to compare, easy to overinterpret, and rarely converted into inspectable research questions. AskRigor needs both:

1. a first-party forum where people talk with one another; and
2. a public frontier showing what community members and their friends report, with the report's provenance and evidentiary limits visible.

### Candidate mechanism

Compose a mature discussion platform with AskRigor's structured evidence system:

- free-form peer discussion remains social conversation;
- an explicit structured-experience action creates a research-lead record;
- self reports, direct proxy observations, relayed reports from friends or family, third-party hearsay, and public-source extractions remain separate;
- public visibility, provenance strength, completeness, corroboration, causal capability, discovery value, and research priority are independent dimensions;
- every non-abusive lead may remain visible at its actual level rather than being discarded because it is incomplete or secondhand;
- lead clusters become evidence checks, research uncertainties, proposals, and Research Missions without becoming efficacy claims by popularity.

### Constraints

- Do not present a relayed report as the affected person's direct testimony.
- Do not publish identifying or reasonably reidentifying details about a non-consenting third party.
- Do not convert popularity, repetition, votes, or vividness into scientific certainty.
- Preserve no-effect, harm, discontinuation, relapse, and contradictory reports.
- Separate community moderation from scientific annotation and from safety escalation.
- Preserve versioned provenance from source post through lead extraction, clustering, question formation, proposal, research, and eventual finding.
- Do not build another isolated truth store beside the living-evidence repository.

### Candidate insight

**Public visibility and evidentiary strength are orthogonal.** A deidentified report relayed by a friend can be weak evidence for causality but high-value public discovery material. Requiring the subject's exact-version approval for every public lead would erase much of the signal that makes health forums useful. Exact subject approval remains appropriate for an attributable personal narrative, direct quotation, identifiable record, document, image, or named case—not for every deidentified public lead.

## Existing-work scan

The scan searched the underlying problem rather than only AskRigor's terminology: patient communities with structured health data, proxy reporting, selective public sharing, provenance, research-priority setting, forum implementation, health-misinformation moderation, and digital-platform safety reporting.

### 1. PatientsLikeMe: structured health tracking plus peer discussion

PatientsLikeMe combines discussion, personal stories, health tracking, symptoms, treatments, and community comparison. Its current public materials describe more than 850,000 members across more than 2,800 reported conditions and explicitly connect peer discussion with structured health information.

Sources:

- https://www.patientslikeme.com/about
- https://www.patientslikeme.com/
- https://support.patientslikeme.com/hc/en-us/articles/201186434-What-is-PatientsLikeMe

Reusable:

- condition-centered communities;
- discussion plus structured tracking;
- treatment and symptom timelines;
- longitudinal updates;
- visible community experience as a participation engine.

Not sufficient for AskRigor:

- AskRigor needs stronger source-distance labels, explicit evidence-capability boundaries, exact provenance, formal-evidence relationships, research-frontier conversion, and public rival/counterexample visibility.

### 2. Open Humans: selective data sharing and reidentification awareness

Open Humans lets members choose which projects, users, or the public may receive data. Public sharing is not enabled by default and requires risk awareness because nominally deidentified data can remain identifiable.

Sources:

- https://www.openhumans.org/data-use/
- https://www.openhumans.org/public-data/

Reusable:

- granular sharing destinations;
- pseudonymous participation;
- explicit public-sharing activation;
- project-specific access;
- deletion and withdrawal semantics;
- clear reidentification warnings.

Adaptation:

AskRigor should distinguish public forum speech, structured aggregation, research use, recontact, quotation, identifiable narrative publication, and model training. Consent to one must not silently authorize another.

### 3. HL7 FHIR: subject, source, and author are different

FHIR QuestionnaireResponse explicitly distinguishes:

- the subject the answers concern;
- the source who supplied the answers; and
- the author who interpreted or recorded them.

FHIR permits a RelatedPerson—such as a relative or friend—to be the information source. This directly supports a non-self-report architecture without pretending that proxy or relayed information is self report.

Sources:

- https://hl7.org/fhir/R5/questionnaireresponse-definitions.html
- https://fhir.hl7.org/fhir/questionnaireresponse.html
- https://hl7.org/fhir/R5/relatedperson.html

Reuse:

- separate `subject`, `information_source`, and `record_author` identities;
- explicit proxy/related-person role;
- no inference about source when source is unknown.

AskRigor extension:

FHIR does not by itself distinguish direct observation from a subject's relayed account or multi-hop hearsay. AskRigor needs a more granular `information_origin` taxonomy.

### 4. W3C PROV-O: provenance through transformations

W3C PROV-O models entities, activities, and agents, including derivation, attribution, revision, quotation, and primary-source relationships.

Source:

- https://www.w3.org/TR/prov-o/

Reuse:

- source post/version as an entity;
- structured extraction as an activity;
- public lead, signal cluster, research question, proposal, and finding as derived entities;
- explicit agent responsibility and software-assisted extraction;
- immutable revision/supersession relationships.

### 5. James Lind Alliance: community uncertainties into research priorities

James Lind Alliance Priority Setting Partnerships collect uncertainties from patients, carers, and clinicians, consolidate them into questions, check whether existing research already answers them, and prioritize unresolved questions.

Representative sources:

- https://pubmed.ncbi.nlm.nih.gov/31473612/
- https://pubmed.ncbi.nlm.nih.gov/32606070/
- https://doi.org/10.1111/dme.13613

Reusable:

- gather first, deduplicate second;
- distinguish questions from answered claims;
- evidence-check candidate uncertainties;
- rank research priorities with multiple stakeholder groups;
- expose methods and conflicts of interest.

AskRigor extension:

The forum can generate a continuously updated lead frontier rather than a one-time priority-setting exercise. Voting and participation determine research attention, not evidence strength.

### 6. Discourse: mature forum substrate

Discourse already provides threaded topics, categories, tags, trust levels, flags, review queues, category moderators, APIs, webhooks, plugins, search, notifications, and single sign-on through DiscourseConnect.

Sources:

- https://docs.discourse.org/
- https://meta.discourse.org/t/setup-discourseconnect-official-single-sign-on-for-discourse-sso/13045
- https://meta.discourse.org/t/flagging-a-post-for-moderator-attention/32783
- https://meta.discourse.org/t/managing-user-reputation-and-flag-priorities/123464

Reuse decision:

Do not build a bespoke general forum. Use Discourse as the discussion system and AskRigor as the structured lead/evidence/provenance system. Connect them through a versioned identity boundary, webhooks/API, idempotent event ingestion, and stable cross-system identifiers.

Boundary:

Discourse trust or popularity is a moderation/community signal. It is not scientific authority and must never directly change evidence certainty.

### 7. Online health-community moderation and misinformation

Online health communities can provide peer support and practical information, but treatment discussions can also contain persistent misinformation. A 2023 content analysis found materially more correction in an expert-led community than a peer-led community and substantial uncorrected misinformation in both.

Source:

- https://www.jmir.org/2023/1/e44656/

Reusable implication:

- preserve peer discussion;
- add visible expert/scientific context rather than replacing the community voice;
- prioritize treatment, adverse-effect, and discontinuation threads for annotation;
- distinguish correction status from deletion/moderation status;
- measure unresolved high-impact claims.

Do not infer that moderators are infallible. Moderator actions, scientific annotations, and formal evidence must remain separately attributable and appealable.

### 8. Digital-platform safety reporting

ICH E2D(R1), issued by FDA as final guidance in March 2026, explicitly addresses social media and other digital platforms as postapproval safety data sources. It distinguishes minimum criteria for a valid individual case safety report and discusses monitoring of company-owned or externally reviewed digital platforms.

Source:

- https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e2dr1-post-approval-safety-data-definitions-and-standards-management-and-reporting-individual-case

Architecture implication:

AskRigor needs a separate safety-triage lane for serious adverse-event candidates, with jurisdiction, product, reporter/patient identifiability, follow-up feasibility, and reporting responsibility assessed. A forum post is not automatically a valid regulatory case, but it cannot be ignored merely because it is informal.

This requires legal/regulatory review before production. It does not justify suppressing public harm reports.

## What is already solved, partially solved, incompatible, and unresolved

### Already solved enough to reuse

- general forum mechanics, search, notifications, flags, trust levels, and moderator queues: Discourse;
- single-sign-on and event/API integration primitives: DiscourseConnect and Discourse APIs/webhooks;
- subject/source/author separation: FHIR;
- provenance vocabulary: W3C PROV;
- selective data-sharing principles: Open Humans;
- structured patient-community participation pattern: PatientsLikeMe;
- uncertainty consolidation and priority setting: James Lind Alliance.

### Partially solved; adapt

- proxy reporting: standards support a RelatedPerson, but AskRigor needs direct-observation versus relayed-account versus multi-hop-hearsay distinctions;
- public health-story publication: mature systems support public sharing, but AskRigor needs separate public narrative and public research-lead objects;
- moderation: general tools exist, but scientific annotation, evidence linking, and safety triage require AskRigor-specific roles;
- research prioritization: established methods are periodic; AskRigor needs a living frontier connected to evidence updates and Research Missions;
- adverse-event handling: reporting standards exist, but AskRigor's exact legal role must be determined by jurisdiction and product relationship.

### Incompatible with the owner's objective

- requiring the affected person's exact-version approval before every deidentified secondhand lead can be public;
- treating every public lead as a polished first-person case narrative;
- collapsing self report, direct proxy observation, subject-relayed report, and hearsay;
- hiding low-completeness reports instead of showing missingness;
- treating votes, views, likes, repetition, moderator trust, or community reputation as evidence weight;
- automatically turning every forum post into canonical evidence;
- allowing a scientific annotation to silently rewrite or erase what a community member said.

### Genuinely unresolved/compositional remainder

The scan did not locate a mature system that combines all of the following as one inspectable public pipeline:

`peer forum -> provenance-typed public lead -> exact regimen/outcome cluster -> formal evidence check -> public uncertainty -> research proposal -> durable research mission -> updated public finding`

That composition is the AskRigor-specific contribution.

## Build/adapt/reuse decision

**Decision: COMPOSE.**

- **Reuse** Discourse for the forum substrate.
- **Reuse/adapt** FHIR source/subject/author semantics and W3C provenance.
- **Adapt** Open Humans-style granular sharing controls.
- **Adapt** PatientsLikeMe's discussion-plus-structured-experience participation pattern.
- **Adapt** James Lind Alliance uncertainty checking and prioritization.
- **Invent only the remainder:** public research-lead classification, public frontier projections, evidence-linked clusters, and conversion into AskRigor research proposals and missions.

A bespoke forum implementation is not justified. A bespoke evidence/provenance bridge is justified because ordinary forum software does not supply AskRigor's scientific boundaries.

## Corrected publication policy

### Public narrative

A subject-authored or attributable narrative may include direct quotations, identity, documents, or a polished story. It requires the applicable subject consent and exact-version approval.

### Public research lead

A public research lead is an attributed claim about a possible experience, not a scientific case report and not necessarily the affected person's own publication.

A deidentified secondhand lead may be public when:

- the reporter consents to public display of their statement;
- the affected person is not named or reasonably reidentifiable;
- the record does not reproduce private documents, media, or exact quotations attributed to the affected person without permission;
- the source distance is prominent;
- the system does not imply subject verification;
- privacy, abuse, impersonation, and safety screening pass; and
- jurisdiction-specific restrictions do not prohibit publication.

The subject may later verify, correct, add detail, dispute, or request review/takedown. The system preserves a minimal audit tombstone after withdrawal without retaining the withdrawn public content in the public projection.

### Synthetic Andy-like display

> **Reported MCAS improvement — secondhand community lead**  
> A community member reports that an adult friend with reported MCAS experienced substantial improvement while using a combination of LDN, low-dose NAD+ injections, and low-dose tirzepatide. The report is secondhand, has not been independently verified, and currently lacks enough timing and sequencing detail to attribute the change to any component. It is retained as a public lead for similar-report discovery and future research design.

This preserves the useful lead without presenting it as Andy's direct testimony, a verified diagnosis, or causal proof.

## Baselines the implementation must beat

The AskRigor composition is not successful merely because it has more fields. It must demonstrate:

1. higher provenance clarity than an ordinary forum thread;
2. lower loss of incomplete and secondhand leads than a subject-approved-story-only registry;
3. better visibility of harm/no-effect/counterexamples than positivity-driven community feeds;
4. clearer separation of experience from efficacy than existing treatment-rating pages;
5. an auditable path from community signal to a question that existing research has or has not answered;
6. no increase in reidentification, harassment, unsafe instruction, or uncorrected high-impact misinformation;
7. meaningful conversion of community participation into follow-up data and research proposals;
8. no engagement metric that can silently overrule evidence or privacy gates.

## Scan conclusion

The owner's correction is accepted. The prior architecture conflated two different objects: an attributable public personal story and a deidentified public research lead. AskRigor should publish both, with different consent and provenance requirements. The first-party forum is not an optional engagement feature; it is the primary social acquisition surface for the living community frontier. The scientifically novel work is the bridge from conversation to transparent lead classification and research action—not the forum software itself.
