# AskRigor Public Discovery Atlas design

Date: 2026-08-30
Status: proposed architecture
Working product name: **AskRigor Discovery Atlas**
Default public descriptor: **Findings surfaced, tested, or corrected by AskRigor**

## 1. Goal

Create a public health-evidence product that lets a reader:

- see the most important, unexpected, recently changed, and contested findings at a glance;
- search a health condition, intervention, outcome, population, or question;
- filter and sort by evidence certainty, finding type, status, recency, and transparent importance dimensions;
- understand what a finding says, whom it applies to, how large the effect may be, how certain it is, what contradicts it, and what could change the conclusion;
- drill down from a plain-language card to studies, reviews, audits, forest plots, exclusions, freshness, and revision history;
- ask source-grounded follow-up questions; and
- contribute corrections, sources, questions, and experience as typed research leads without turning votes or anecdotes into scientific certainty.

The atlas is a public projection of AskRigor's governed evidence repository. It is not a separate editable knowledge base and not a direct window into worker drafts.

## 2. Non-goals for the first release

- Automated diagnosis, prescribing, or personalized treatment recommendations.
- An unqualified claim that every listed finding was originally discovered by AskRigor.
- A universal scalar that pretends to combine evidence, importance, surprise, ethics, affordability, and preference into objective truth.
- Direct public access to worker prompts, private supervision, raw full text, raw user health narratives, or restricted provider material.
- A public social network, comments section, or popularity contest.
- Autonomous publication from parallel workers.
- A vector database or graph database before structured filters, full-text search, and explicit PostgreSQL edges fail a fixed benchmark.

## 3. Product surfaces

### 3.1 Public Evidence Atlas

Public, read-only, versioned, source-linked, and optimized for comprehension.

Primary pages:

1. **Home / Discover**
2. **Search and browse**
3. **Condition page**
4. **Finding page**
5. **Evidence map**
6. **Study/review page**
7. **Changes and corrections**
8. **Ask a follow-up question**
9. **Submit a correction, source, question, or experience**
10. **Methods, rubrics, data coverage, licensing, and known limitations**

### 3.2 Private Research Operations dashboard

Private control surface for parallel workers and supervisors. It tracks objectives, search coverage, current step, source access, drift, blocked trails, duplicate work, quality gates, and release readiness.

It must remain separate from the public atlas. Operational uncertainty can inform public freshness and coverage labels, but raw worker activity is not evidence.

## 4. Homepage information architecture

The first screen should answer four questions without scrolling through a research paper:

1. **What matters most?**
2. **What is genuinely surprising?**
3. **What changed recently?**
4. **What is uncertain or contested?**

Recommended modules:

### 4.1 Most important now

A small set of finding cards ranked under a named, versioned profile such as `public-health-impact-v1`. The profile and component values are visible. The module must not imply personal treatment advice.

### 4.2 Most unexpected, with credible evidence

Only findings with a published expectation record, an explicit “unexpected because …” rationale, and a credibility gate. Low-certainty anomalies appear in a separate **Provocative but provisional** module.

### 4.3 Changed since your last visit / recently changed

New evidence, changed certainty, correction, retraction, narrowed population, changed effect estimate, changed access status, or newly exposed disagreement. Anonymous local state may support “since your last visit”; no account is required for the MVP.

### 4.4 Contested findings

High-public-interest findings where credible analyses disagree. The card names the axis of disagreement: source inclusion, trial integrity, population, endpoint, timing, model, or inference.

### 4.5 Browse by condition and category

Condition search plus categories such as:

- prevention;
- diagnosis and screening;
- treatment benefit;
- treatment harm;
- prognosis;
- behavior and lifestyle;
- healthcare delivery;
- environmental or social determinants;
- research integrity;
- methods and measurement; and
- evidence gaps.

### 4.6 Recent AskRigor work

Newly released audits, updated syntheses, corrections, and unresolved research questions. Worker drafts are excluded.

## 5. Finding identity and public labels

Every public finding has exactly one provenance class:

- `ORIGINAL_DISCOVERY`: AskRigor claims a novel relationship or conclusion after a completed novelty scan and explicit release decision.
- `INDEPENDENTLY_VALIDATED`: an established external finding that AskRigor rechecked and found support for.
- `SURFACED`: a known but undernoticed result AskRigor made easier to see or connected to a decision.
- `CHALLENGED`: AskRigor found important evidence against a commonly stated conclusion.
- `CORRECTED_OR_NARROWED`: AskRigor identified a material error, boundary, subgroup, endpoint, time-horizon, or capability correction.
- `CONFLICT_MAPPED`: AskRigor mapped a genuine disagreement without forcing a false resolution.
- `PROVISIONAL_SIGNAL`: a potentially important signal that has not passed a normal evidence threshold.
- `EVIDENCE_GAP`: a consequential unanswered question or missing comparison.
- `THIRD_PARTY_CANDIDATE`: an imported claim or user lead awaiting AskRigor validation; never shown as an ordinary finding on the public homepage.

“Discovery” is therefore a governed subtype, not a marketing synonym for every card.

## 6. Finding card contract

Each card must expose enough information to prevent a confidence label from becoming the whole argument.

Required compact fields:

- one atomic plain-language claim;
- finding provenance class;
- direction: benefit, harm, no meaningful difference, mixed, association, mechanism, or unresolved;
- population, intervention/exposure, comparator, outcome, horizon, and setting where applicable;
- absolute effect or baseline-risk context when estimable;
- relative effect when useful;
- body-of-evidence certainty and the framework actually used;
- design mix and number of contributing studies/participants when meaningful;
- public state: validated, provisional, contested, stale, superseded, or retracted;
- last evidence refresh and next due state;
- “why this matters”;
- “why this is unexpected,” when applicable;
- the strongest limitation or reason for caution;
- whether material credible dissent exists;
- direct link to the finding page.

A card must never display `HIGH EVIDENCE` without naming what the evidence supports and for which outcome/population/horizon.

## 7. Finding page contract

Progressive disclosure layers:

### Layer 1: What it means

- plain-language claim;
- practical significance without individualized instruction;
- population and boundary;
- effect magnitude and uncertainty;
- state, certainty, and freshness;
- why important/unexpected;
- what could overturn or materially revise it.

### Layer 2: Why AskRigor believes this

- source-linked rationale;
- body-of-evidence profile;
- study-design mix;
- domain assessments;
- consistency, directness, precision, publication/integrity concerns;
- harms and competing outcomes;
- rival interpretations and AskRigor's response.

### Layer 3: Evidence explorer

- studies and reviews;
- forest plots or structured effect tables where valid;
- included/excluded/deferred records and reasons;
- source access and completeness;
- exact AskRigor audits;
- review-to-study relationships;
- retractions, corrections, expressions of concern, or integrity flags;
- subgroup and time-horizon views;
- unresolved evidence gaps.

### Layer 4: History

- finding versions;
- changed fields and reasons;
- evidence added or removed;
- certainty changes;
- correction/supersession lineage;
- release approver and rubric versions;
- previous public wording preserved as historical, not silently overwritten.

## 8. Evidence dimensions

Do not collapse these into one badge:

1. **Source access/completeness**
   - verified complete full text;
   - verified partial access;
   - abstract/registry only;
   - inaccessible;
   - retracted/corrected/expressed concern.

2. **Study/review methodological profile**
   - framework and version;
   - domain judgments;
   - unresolved items;
   - reviewer/validator provenance;
   - disagreements.

3. **Body-of-evidence certainty**
   - framework actually applied;
   - outcome-specific certainty;
   - reasons for upgrading/downgrading;
   - “not formally graded” when no formal framework was applied.

4. **Capability**
   - what the evidence can support;
   - what it cannot support;
   - what remains uncertain.

5. **Public release state**
   - validated;
   - provisional;
   - contested;
   - stale;
   - superseded;
   - retracted.

6. **Freshness/coverage**
   - last complete search window;
   - latest partial search;
   - known gaps;
   - overdue checks;
   - active blocked trails.

## 9. Importance model

### 9.1 Principle

Importance is a decision profile, not an intrinsic property of a paper. A finding can be highly important for a small severe population, broadly important with a modest effect, or scientifically important but not actionable.

### 9.2 Versioned dimensions

Store each dimension separately with rationale and provenance:

- `health_severity_or_burden`;
- `population_reach`;
- `absolute_effect_or_decision_impact`;
- `body_of_evidence_certainty`;
- `actionability`;
- `benefit_harm_decision_relevance`;
- `accessibility_and_cost_relevance`;
- `equity_relevance`;
- `neglect_or_information_gap`;
- `freshness_or_change_significance`.

Suggested ordinal values for the MVP: `0` not relevant, `1` low, `2` moderate, `3` high, plus `unknown`. Each value requires a short rationale and source or calculation where applicable.

### 9.3 Ranking profiles

A profile names its purpose and weights, for example:

- `public-health-impact-v1`;
- `patient-decision-relevance-v1`;
- `research-priority-v1`;
- `equity-priority-v1`;
- `recent-change-v1`.

The UI exposes both the profile and components. Users can sort by one component. A composite may order a list, but it is never presented as the evidence grade.

### 9.4 Promotion gate

Homepage “most important” promotion requires:

- a released finding;
- a complete importance assessment under the named profile;
- no hidden critical freshness failure;
- no unresolved source-identity break;
- explicit handling of important harms and dissent; and
- human release approval.

## 10. Unexpectedness model

### 10.1 Principle

Unexpectedness is meaningful only relative to an explicit prior expectation. It must not reward sensational low-quality anomalies.

### 10.2 Expectation record

Required fields:

- `reference_audience`: public, clinicians, guideline, researchers, mechanistic expectation, or AskRigor prior state;
- `expected_claim`;
- `expected_direction` and optional expected magnitude range;
- `expectation_source_type` and source/version;
- `expectation_recorded_at`;
- `recorder` and validation state;
- `scope`: population, intervention/exposure, comparator, outcome, horizon, setting.

The expectation must predate the unexpectedness release assessment. A post hoc “everyone thought X” assertion is insufficient.

### 10.3 Deviation types

- `CONSENSUS_REVERSAL`;
- `PLAUSIBLE_MECHANISM_NULL`;
- `BENEFIT_HARM_REVERSAL`;
- `SUBGROUP_OR_TIMING_REVERSAL`;
- `REPLICATION_FAILURE`;
- `MEASUREMENT_OR_ENDPOINT_ARTIFACT`;
- `LARGE_EFFECT_FROM_LOW_ATTENTION_INTERVENTION`;
- `SMALL_OR_NULL_EFFECT_DESPITE_WIDESPREAD_USE`;
- `INTEGRITY_DRIVEN_REVERSAL`;
- `OTHER_EXPLICIT`.

### 10.4 Credibility dimensions

- certainty of the observed finding;
- independent replication;
- integrity/access completeness;
- magnitude of deviation from the expectation;
- robustness to reasonable inclusion/model choices;
- plausible alternative explanations.

### 10.5 Public lanes

- **Unexpected with credible evidence:** normally moderate/high body-of-evidence certainty or an unusually robust repeated harm/integrity signal.
- **Provocative but provisional:** surprising low-certainty signals with prominent uncertainty.
- **Apparent surprise explained by methods:** headline result substantially explained by bias, endpoint choice, data integrity, or model choice.

### 10.6 No universal score in MVP

The MVP stores dimensions and an ordinal editorial tier with rationale. A numerical Bayesian or information-theoretic score may be tested later only when a defensible prior and likelihood model exist. Cross-topic “bits of surprise” should not be fabricated from subjective prose.

## 11. Search and taxonomy

### 11.1 Initial retrieval stack

1. Exact identifiers and canonical aliases.
2. Structured filters and explicit relationships.
3. PostgreSQL full-text search over released public fields.
4. Condition synonyms and entry terms seeded from MeSH, plus versioned lay aliases.
5. Query expansion over intervention, outcome, population, and common abbreviations.
6. Embeddings only after a fixed query suite demonstrates material misses not repairable through vocabulary, fields, or lexical ranking.

### 11.2 Search results

Return mixed entity types with clear labels:

- condition;
- intervention/exposure;
- finding;
- outcome;
- study/review;
- evidence gap;
- AskRigor audit;
- recent correction/change.

### 11.3 Facets

- condition/category;
- finding provenance class;
- direction;
- evidence certainty;
- public state;
- study/review design;
- population/age/setting;
- outcome;
- intervention/exposure;
- recency/freshness;
- important/unexpected/contested/recently changed;
- source access completeness.

## 12. Follow-up question contract

### 12.1 Corpus boundary

The public question system may retrieve only:

- released finding versions;
- released AskRigor-authored analyses;
- public source metadata and permitted excerpts/locators;
- published assessments, limitations, dissent, and history;
- public methods and rubric records.

It may not retrieve worker drafts, private supervision, hidden user feedback, restricted full text, raw community content, or unvalidated imported claims.

### 12.2 Answer modes

Offer explicit modes rather than one opaque chatbot:

- **Explain simply**;
- **Show strongest evidence**;
- **Show the skeptical reading**;
- **Who disagrees and why?**;
- **What would change this conclusion?**;
- **Compare two interventions/findings**;
- **What is still unknown?**;
- **Show changes over time**.

### 12.3 Answer requirements

- Every factual health claim maps to a released record and source locator.
- State the evidence date/freshness.
- Preserve population, comparator, outcome, and horizon.
- Distinguish absence of evidence from evidence of no meaningful effect.
- Surface material harms, dissent, and capability limits.
- Say the repository does not know when no released evidence supports an answer.
- Do not convert generic evidence into individualized medical advice.
- Personalized health questions route into AskRigor's full health-research protocol and remain separate from the public atlas corpus.

### 12.4 Learning signal

Retain by default only minimized analytics such as normalized question topic, whether an answer was found, which finding IDs were used, user-rated helpfulness, and a privacy-safe failure category. Do not retain raw health narratives by default.

## 13. User contribution and learning loop

### 13.1 Contribution types

- correction to wording or data;
- contradictory source;
- missing study/review/guideline;
- retraction or integrity notice;
- unanswered question;
- confusing explanation;
- importance preference;
- lived-experience signal;
- accessibility or equity concern.

### 13.2 Evidence boundary

- Votes affect navigation and research prioritization, not certainty.
- A source lead becomes a `THIRD_PARTY_CANDIDATE` until validated.
- Lived experience becomes a typed signal with explicit inability to establish population efficacy or causality.
- Repeated user questions can raise a research-priority dimension but not a scientific-confidence dimension.

### 13.3 Privacy default

- No public posting of narratives in the MVP.
- Ask contributors not to include identifying health details.
- Separate consent for any retained text.
- Prefer structured fields and minimized excerpts.
- Apply retention/deletion rules and redact identifiers before research triage.
- Never expose contributor identity to public finding pages without separate explicit consent and review.

### 13.4 Triage states

`RECEIVED -> PRIVACY_CHECKED -> DEDUPED -> RESEARCH_LEAD -> VALIDATING -> ACCEPTED / REJECTED / DEFERRED -> OPTIONAL_PUBLIC_ATTRIBUTION`

## 14. Parallel worker architecture

Workers propose structured records; they do not publish prose directly.

Recommended lanes:

1. **Topic scout**: searches current formal evidence and registers discovery coverage.
2. **Identity/dedup worker**: resolves DOI/PMID/registry/review/study identity and versions.
3. **Eligibility workers**: independently screen records against explicit criteria.
4. **Full-text acquisition and coverage worker**: obtains permitted text and records exact access/exhaustion.
5. **Study/review audit workers**: produce source-linked domain assessments and capability statements.
6. **Synthesis worker**: constructs outcome-specific body-of-evidence records.
7. **Contradiction and integrity worker**: seeks rival syntheses, corrections, retractions, data-integrity concerns, and sensitivity to exclusions/model choices.
8. **Importance assessor**: fills versioned dimensions with rationale.
9. **Unexpectedness assessor**: validates expectation records and classifies deviation/credibility.
10. **Public explanation worker**: drafts finding-card and layered explanation text from approved structured records.
11. **Release verifier/supervisor**: checks provenance, claim entailment, freshness, dissent, privacy, licensing, and public wording.

A consequential disagreement, unresolved evidence tradeoff, or original-discovery claim escalates to Pro/human review. Deterministic plumbing, schema validation, and projections remain ordinary automated work.

## 15. Publication state machine

`CANDIDATE -> IDENTITY_VERIFIED -> SOURCES_BOUND -> AUDITED -> SYNTHESIZED -> CONTRADICTION_CHECKED -> RANK_ASSESSED -> PUBLIC_DRAFT -> RELEASE_REVIEWED -> PUBLISHED`

Side states:

- `DEFERRED`;
- `BLOCKED_ACCESS`;
- `CONTESTED`;
- `STALE`;
- `CORRECTION_PENDING`;
- `SUPERSEDED`;
- `RETRACTED`.

No state transition may erase historical versions. A public projection reads only explicitly released versions.

## 16. Canonical data and public projection

### 16.1 Authority

PostgreSQL living-evidence records remain canonical. Existing source, claim, evidence-binding, assessment, run, receipt, freshness, and research-frontier records are reused.

### 16.2 New versioned records

Add only the public-specific remainder:

- `public_finding_releases`;
- `finding_provenance_classifications`;
- `finding_importance_assessments` and rubric/profile versions;
- `expectation_records`;
- `finding_unexpectedness_assessments` and rubric versions;
- `public_explanation_versions`;
- `public_release_checks`;
- `public_condition_aliases` where not covered by the canonical vocabulary;
- `public_feedback_items` with minimized/typed content;
- `public_question_analytics` with minimized fields;
- `third_party_import_manifests` and licensing status.

These records link to canonical claim and source-version IDs. They do not copy raw source bodies or create competing claim truth.

### 16.3 Read models

Generate read-only views/materialized projections such as:

- `public_finding_current_v`;
- `public_finding_history_v`;
- `public_condition_summary_v`;
- `public_search_document_v`;
- `public_evidence_map_v`;
- `public_recent_changes_v`;
- `public_contested_findings_v`;
- `public_question_corpus_v`.

All projections must be rebuildable from canonical and public-release records.

## 17. Application architecture

Recommended repository additions:

- `apps/public-atlas`: Next.js + React + TypeScript public application;
- `packages/public-atlas-contracts`: public DTOs, schemas, and versioning;
- either `apps/public-atlas-api` or narrowly scoped server routes in the app for the MVP;
- `packages/public-atlas-ranking`: pure, deterministic profile calculations;
- `packages/public-atlas-importers`: disabled-by-default, source-specific attributed candidate importers;
- `tests/public-atlas-*`: fixtures, release-gate, search, ranking, correction, and privacy tests.

The public service receives read-only database credentials or consumes a narrow read API. Research workers write through the private controlled evidence service, never through public routes.

Use static generation or cached server rendering for released condition/finding pages, with invalidation from a signed release event. Search and question endpoints remain dynamic and rate-limited.

## 18. Proposed public API surface

Read-only examples:

- `GET /api/v1/findings` with filters/sort/profile;
- `GET /api/v1/findings/{finding_id}`;
- `GET /api/v1/findings/{finding_id}/history`;
- `GET /api/v1/conditions`;
- `GET /api/v1/conditions/{condition_id}`;
- `GET /api/v1/search`;
- `GET /api/v1/changes`;
- `POST /api/v1/questions` returning a cited answer over released records;
- `POST /api/v1/feedback` with strict typed/minimized schema and abuse controls.

The public API never exposes raw database rows, private run state, prompts, secrets, user narratives, or restricted content.

## 19. IVMmeta/c19early composition

### 19.1 What to copy aggressively

- dense treatment/category navigation;
- outcome and design filters;
- forest-plot and study-table drill-down;
- recent additions;
- explicit exclusions and responses;
- revision history;
- continuous discovery/update posture;
- compact movement from overview to source detail.

### 19.2 What not to copy as authority

- a single system's inclusion, outcome-selection, pooling, confidence, or causal interpretation without independent audit;
- third-party figures or paper content merely because the surrounding site uses CC0;
- claims that obscure trial-integrity disputes or sensitivity to excluding problematic evidence;
- adversarial rhetoric as a substitute for inspectable disagreement records.

### 19.3 Import protocol

1. Record site/page/version, retrieval time, content hash, visible license, and third-party restrictions.
2. Parse only permitted owned structured assertions and source identifiers.
3. Store each interpretation as an attributed `THIRD_PARTY_CANDIDATE`.
4. Resolve every study/review identity independently.
5. Obtain and audit current accessible sources under AskRigor protocols.
6. Map included, excluded, deferred, corrected, and retracted records.
7. Reconstruct or independently calculate syntheses where authorized and methodologically valid.
8. Compare IVMmeta, Cochrane, other credible syntheses, and AskRigor results by explicit axis of disagreement.
9. Release only AskRigor-validated findings with complete attribution and licensing checks.

The ivermectin corpus is a valuable adversarial benchmark precisely because conclusions depend heavily on study validity, inclusion, endpoint, timing, and synthesis choices. It should not be the sole public launch corpus.

## 20. MVP boundary

A useful first release is deliberately small:

- 3 health conditions;
- 25–50 released findings;
- at least one benefit, harm, null/mixed, contested, correction, and evidence-gap example;
- homepage modules for important, unexpected, changed, and contested;
- condition search and structured filters;
- finding and condition pages;
- history/correction view;
- source-grounded follow-up questions over released records;
- private typed feedback intake;
- no public accounts, comments, personalization, or autonomous publication.

Use the ivermectin/IVMmeta comparison internally as a hard adversarial test. Select public conditions from completed AskRigor work with sufficient source coverage and diversity.

## 21. Acceptance criteria

### Evidence and release

- Every public health claim maps to an immutable released finding version.
- Every finding maps to canonical claim/source-version/receipt lineage.
- Every certainty label names its framework or says it was not formally graded.
- Every importance or unexpectedness assessment exposes dimensions, rubric version, rationale, and assessor/reviewer provenance.
- No imported third-party candidate is shown as an AskRigor finding before validation.
- Corrections and supersession propagate to search, cards, condition pages, Q&A, and feeds without destroying history.
- Material dissent and capability limits are visible.

### Search and comprehension

- A fixed lay/clinical synonym suite retrieves the correct condition and findings.
- Filters are deterministic and URL-addressable.
- Plain-language cards preserve population, outcome, comparator, and horizon.
- Blind readers can distinguish certainty, importance, and unexpectedness.
- Users can reach source/audit detail from every card.

### Q&A

- Answers cite released records and sources claim-locally.
- Unsupported questions fail closed.
- Stale, contested, superseded, or retracted status propagates into answers.
- The system does not answer from worker drafts or model memory.
- Personalized treatment questions are redirected to the full health-research workflow rather than improvised.

### Privacy, licensing, and security

- No public endpoint exposes private operations or raw user health narratives.
- Feedback schemas are minimized and abuse/rate controls are tested.
- Every imported source family has a current licensing manifest.
- Third-party content is not republished beyond authorized fields/excerpts.
- Public database access is read-only and least-privilege.

### Operations

- Parallel workers cannot transition a finding to `PUBLISHED`.
- Release requires an explicit reviewed receipt.
- Stale/failed refresh states never display as current without warning.
- Public projections rebuild deterministically from canonical records.
- Export, backup, correction, rollback, and deletion tests pass.

## 22. Default decisions adopted for the pilot

To avoid blocking on choices that can be reversed:

- Use the working name **AskRigor Discovery Atlas**.
- Describe ordinary content as **findings surfaced, tested, or corrected by AskRigor**.
- Reserve **original discovery** for novelty-audited releases.
- Keep public and worker dashboards separate.
- Use PostgreSQL structured/full-text retrieval first.
- Use MeSH plus lay aliases for initial condition search.
- Use transparent ordinal importance and unexpectedness dimensions, not universal scores.
- Keep all publication human/supervisor-gated.
- Use IVMmeta as a UX source, candidate-source family, and adversarial benchmark—not as truth authority.
- Launch with a small multi-condition corpus before broad automation.
