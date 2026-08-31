# AskRigor expansion design: Study Lab, Research Missions, Predictions, and Story Registry

Date: 2026-08-30
Status: proposed architecture
Depends on:

- `2026-08-30-public-discovery-atlas-design.md`
- the living-evidence repository and research-frontier ledger
- the current Universal/HRP protocols for substantive health research

## 1. Product model

AskRigor becomes five connected but separately governed products:

1. **Discovery Atlas** — released public findings and evidence maps.
2. **Study Lab** — inspect one study, compare studies, and understand contribution to a body of evidence.
3. **Research Missions** — durable work continuing across conversations, workers, restarts, and scheduled updates.
4. **Prediction Registry** — locked pre-reveal forecasts and calibration.
5. **Patient Experience Observatory** — structured stories, aggregate patterns, public narratives with granular consent, and research leads.

All five use the canonical PostgreSQL living-evidence repository. None may create an independent truth store.

## 2. IVMmeta/CovidAnalysis family ingestion

### 2.1 Family manifest

Maintain a versioned source-family manifest rather than a fixed ivermectin importer.

Required family-member fields:

- stable `family_member_id`;
- domain/URL/alias;
- discovery source;
- direct-observation state: current, redirect, inactive, blocked, historical-unverified, or unknown;
- redirect chain and canonical target;
- page roles discovered;
- topic/treatment identity;
- first and last observation;
- latest HTTP/access state;
- content hash and parser version;
- visible site-level license;
- third-party-content restriction state;
- candidate counts and import receipt;
- supersession/alias relationships; and
- unresolved verification notes.

### 2.2 Current-corpus enumeration

A scheduled acquisition pass should:

1. retrieve the current `c19early.org` treatment selector;
2. enumerate every treatment and every `Meta` link;
3. enumerate linked study, appendix, methods, response, update, and downloadable-analysis pages;
4. reconcile identifiers and duplicates across pages;
5. compare with the previous manifest;
6. record additions, removals, redirects, content changes, and parser gaps; and
7. create attributed candidate records only.

The enumerator may not infer that a removed page was scientifically repudiated or that a new page is correct.

### 2.3 Per-treatment audit packet

For each treatment/topic:

- exact family source version and hash;
- all claimed included studies and source identifiers;
- extraction/outcome/timing rules;
- included, excluded, deferred, corrected, duplicated, and retracted studies;
- effect estimates and conversions;
- pooling model and heterogeneity;
- treatment-stage and outcome-specific analyses;
- combined-outcome rationale;
- trial integrity and registration history;
- comparison with high-quality rival reviews/guidelines;
- reproducibility result;
- sensitivity to study removal/reclassification/model choices;
- AskRigor can-support/cannot-support/uncertain conclusions; and
- unresolved source/access/licensing gaps.

### 2.4 Public status

Imported statements remain `THIRD_PARTY_CANDIDATE`. A public page may show an attributed comparison only after independent AskRigor validation. The public user must be able to see where AskRigor agrees, disagrees, cannot reproduce, or remains uncertain.

## 3. Study Lab

### 3.1 Entry modes

- DOI, PMID, registry ID, URL, title, citation, uploaded lawful copy, or AskRigor study ID.
- Compare two or more studies.
- Open from any finding, review, forest plot, or patient-story research lead.
- Ask “Which studies tell us the most, and why?”

### 3.2 Study identity and access panel

Display:

- canonical citation and identifiers;
- publication/version/correction/retraction history;
- protocol/registry/SAP relationships;
- duplicate or overlapping population relationships;
- funding/conflicts;
- access status and exact source used;
- coverage completeness;
- source hash/retrieval date; and
- available data/code/materials.

### 3.3 Methodological validity profile

Select a design-specific rubric. Examples include randomized, non-randomized intervention, diagnostic accuracy, prognostic/prediction model, qualitative, case report/series, and systematic review.

Every domain stores:

- question and allowed answers;
- judgment;
- exact supporting source locator;
- rationale;
- uncertainty/unresolved state;
- assessor identity/type;
- independent assessor result;
- adjudication if needed;
- rubric/version; and
- supersession history.

Do not manufacture an overall `8.7/10 quality` score. A compact public summary may say, for example, “low concern for randomization; high concern for missing outcomes; serious applicability limitation,” linked to the evidence.

### 3.4 Information contribution profile

This is separate from validity and is always synthesis-specific.

Required dimensions:

- `precision_contribution`: events, effective sample size, uncertainty reduction;
- `scope_directness`: match to population, intervention/exposure, comparator, outcome, horizon, and setting;
- `unique_coverage`: new subgroup, comparator, harm, timing, long follow-up, geography, or implementation context;
- `independence`: independent team/data/population versus duplicate or dependent evidence;
- `synthesis_weight`: contribution to each pooled/network estimate, never interpreted as quality;
- `result_influence`: change in effect, heterogeneity, interval, certainty, or decision under leave-one-out;
- `bias_sensitivity`: impact under alternative plausible bias parameters or exclusion;
- `replication_role`: original, direct replication, conceptual replication, contradiction, or extension;
- `decision_impact`: probability the study changes a decision or public finding;
- `gap_resolution`: which prior uncertainty it resolves;
- `reproducibility_contribution`: availability and independent reproduction of data/code/analysis; and
- `future_information_value`: remaining uncertainty and what next study would be most valuable.

Each value needs a calculation or rationale, method/version, and uncertainty.

### 3.5 Study comparison table

Default columns:

- exact question/scope;
- design;
- participants/events/follow-up;
- intervention/comparator fidelity;
- outcome relevance and measurement;
- major validity concerns;
- precision;
- directness;
- independence/overlap;
- unique information;
- synthesis contribution;
- influence/sensitivity;
- integrity/access/reproducibility; and
- bottom-line capability.

Users can switch between:

- **methods first**;
- **most decision-informative**;
- **most direct to this question**;
- **largest but most fragile**;
- **best long-term information**;
- **best harms information**; and
- **what changes the overall conclusion**.

### 3.6 Overall-picture view

For the selected question:

- explicit PICO/PECO/setting/horizon;
- eligible-study map;
- design and population distribution;
- study contribution matrix;
- effect table/forest/network view when valid;
- methodological concern overlay;
- publication/integrity/access gaps;
- consistent versus conflicting outcomes;
- subgroup/timing differences;
- leave-one-out and alternative-inclusion views;
- body-of-evidence certainty by outcome;
- can-support/cannot-support/uncertain;
- unresolved questions; and
- highest-value next research.

The “overall picture” must preserve heterogeneity rather than averaging away meaningful differences.

## 4. Research Missions

### 4.1 Mission versus session

A `research_session` is one bounded controller execution. A `research_mission` is the durable parent that can own many sessions, workers, updates, public releases, and scheduled surveillance cycles.

### 4.2 Mission modes

- `QUICK`: bounded answer, ordinarily minutes.
- `DEEP`: one sustained research pass, ordinarily hours.
- `LONG_RANGE`: multiple work cycles across days or weeks.
- `LIVING`: no fixed final endpoint; scheduled surveillance and versioned releases continue until paused or closed.

Durations are descriptive, not promises.

### 4.3 Mission authority

Required fields:

- mission ID and schema version;
- exact user/owner objective and hash;
- invariant purpose;
- amendable research questions/hypotheses;
- scope and exclusions;
- target audience/use;
- required protocol identities;
- source classes and jurisdiction/language constraints;
- contribution/privacy tier;
- budget ceilings and provider permissions;
- refresh cadence/stopping rules;
- release policy;
- owner-decision escalation rules; and
- cancellation/deletion policy.

The invariant purpose cannot be replaced by a worker checkpoint. Research questions may evolve through explicit, traceable amendments when evidence changes the most useful next question.

### 4.4 Mission lifecycle

`PROPOSED -> PREFLIGHT -> ACTIVE -> INTERIM_SNAPSHOT -> ACTIVE -> RELEASE_CANDIDATE -> RELEASED`

Additional states:

- `PAUSED_USER`;
- `PAUSED_BUDGET`;
- `BLOCKED_ACCESS`;
- `BLOCKED_OWNER_DECISION`;
- `WAITING_FOR_EVIDENCE`;
- `SCHEDULED_REFRESH`;
- `STALE_REFRESH_FAILED`;
- `CORRECTION_PENDING`;
- `CANCELLED`;
- `SUPERSEDED`;
- `CLOSED`.

A released mission may return to active work for a new version. Release is not evidence-frontier exhaustion forever.

### 4.5 Work packages and parallelism

Each work package has:

- exact mission/question/outcome IDs;
- contribution type;
- source and write set;
- prerequisites;
- independence/blinding requirement;
- worker class and reasoning tier;
- lease/fence token;
- budget;
- expected structured output;
- deterministic acceptance checks;
- scientific review state; and
- status/heartbeat.

Parallel workers are allowed when write sets and epistemic roles are explicit. Examples:

- independent discovery lanes by database/language/source class;
- blinded duplicate screening;
- independent method audits;
- formal versus community evidence;
- synthesis versus contradiction challenge;
- public explanation versus source verifier.

One active mission does not imply one exclusive worker.

### 4.6 Progress reporting

Do not show fabricated percent complete for an open evidence frontier. Show:

- source classes searched and pending;
- confirmed date windows;
- candidate/screened/included/deferred counts;
- full-text coverage;
- completed audits;
- outcome syntheses complete/pending;
- important contradictions;
- unresolved access gaps;
- current budget use;
- current state and next executable work;
- latest interim snapshot; and
- refresh status.

### 4.7 User controls

- start;
- add a question or source;
- change budget/cadence;
- pause;
- resume;
- cancel;
- request an interim snapshot;
- approve an expanded scope;
- choose private/community contribution tier;
- request public release review; and
- subscribe to material changes.

Cancellation stops new work promptly but preserves or deletes prior records according to the disclosed retention policy and legal obligations.

## 5. Community compute, app/plugin, and paid privacy

### 5.1 Tiers

#### Community ChatGPT tier

- User installs/selects the AskRigor app/plugin.
- Compatible search/reasoning uses the user's ChatGPT account and available plan quota.
- The service clearly discloses that completed community research requires an explicit contribution step for a minimized non-personal research capsule.
- The user sees the exact capsule and triggers the consequential submit action.
- No silent conversation harvesting.

Eligible capsule fields:

- mission/question identifiers;
- source identifiers and versions;
- searched source classes/date windows/query fingerprints;
- candidate decisions without personal content;
- source-linked study/review audit fields;
- generalized correction or product lesson;
- prediction record and score;
- unresolved research trail;
- model/tool/protocol version and receipt.

Excluded fields:

- raw chat;
- identity/contact information;
- individual health narrative;
- uploaded document body unless separately licensed and instructed;
- private workspace content;
- credentials;
- unrelated user data.

#### Bring-your-own-API tier

- User supplies a provider key through a secure server-side secret flow.
- User chooses community contribution or paid private/no-contribution terms.
- Provider cost, limits, and deletion boundary are explicit.

#### Hosted paid tier

- AskRigor supplies compute and long-range orchestration.
- Private/no-contribution option available.
- Voluntary contribution remains possible.

### 5.2 Deep Research composition

Because ChatGPT Deep Research currently uses app read/fetch actions but not app write actions:

1. AskRigor exposes read-only mission context and approved evidence to the research run.
2. The run returns a research artifact to the user.
3. A separate deliberate submit action sends the minimized contribution capsule, or the AskRigor server continues work through its own authenticated worker interface.
4. The server validates all contributions against mission state and source identity before commit.

The app is a useful worker/front end, not the canonical long-running orchestrator.

### 5.3 Story consent is never the price of research

Community research contribution can be a free-tier condition. Health-story donation, public-story publication, quotation, attachment use, recontact, or identifiable-data linkage cannot be bundled into it.

## 6. Prediction Registry

### 6.1 Prediction types

- `STUDY_OUTCOME`;
- `EFFECT_DIRECTION`;
- `EFFECT_MAGNITUDE_RANGE`;
- `REPLICATION_SUCCESS`;
- `FINDING_UPDATE` — whether new evidence changes a current finding;
- `METHOD_AUDIT` — predicted risk-of-bias or integrity issue;
- `TREATMENT_RANKING`;
- `RESEARCH_QUESTION_RESOLUTION`.

### 6.2 Prediction question contract

- stable question ID/version;
- exact hidden source or future event;
- population/intervention/comparator/outcome/horizon;
- resolution rule and authoritative source;
- open/close/reveal timestamps;
- eligibility and audience cohorts;
- known-leakage state;
- scoring rule;
- aggregation rule;
- public/private state; and
- cancellation/invalid-resolution handling.

### 6.3 Submission contract

Before reveal, store immutably:

- predictor pseudonymous ID/cohort;
- expertise/self-rated familiarity;
- declaration whether the result may already have been seen;
- probabilities summing to one or a defined distribution;
- optional effect interval and rationale;
- confidence and evidence consulted;
- timestamp;
- canonical serialized payload hash; and
- consent for aggregate/public display.

No edits after lock. A correction creates a new prediction version before close and preserves the original; scoring rules declare which version counts.

### 6.4 Reveal and scoring

- verify resolution source/version/hash;
- resolve deterministically where possible;
- permit adjudication for ambiguous outcomes;
- calculate Brier, log, interval, and calibration metrics as applicable;
- show individual history privately and cohort distributions publicly according to consent;
- distinguish expert, public, clinician, model, and AskRigor forecasts;
- analyze calibration and systematic expectation errors; and
- link prediction distributions to unexpectedness assessments without changing evidence certainty.

### 6.5 Anti-manipulation

- hidden answer and access controls;
- result-seen declaration;
- leak monitoring;
- rate and duplicate-account controls;
- no changing question after forecasts without creating a new version;
- minimum cohort/privacy thresholds;
- brigading/anomaly flags;
- no financial wagering in the MVP; and
- public audit log of question/reveal changes.

## 7. Patient Experience Observatory

### 7.1 Evidence lanes

Keep separate:

- `INDIVIDUAL_STORY`;
- `STRUCTURED_EPISODE`;
- `AGGREGATED_STORY_PATTERN`;
- `PROSPECTIVE_N_OF_1`;
- `FORMAL_OBSERVATIONAL_STUDY`;
- `FORMAL_TRIAL_OR_SYNTHESIS`.

Movement between lanes requires a new study/design record; many stories do not become a clinical trial by aggregation.

### 7.2 Intake channels

- `EXTERNAL_SECURE_PORTAL`: full story, identifiable contact, documents, follow-up.
- `DEIDENTIFIED_APP_INTAKE`: minimal story with no PHI or direct identifiers.
- `RESEARCHER_MODERATED_INTERVIEW`: separately consented and governed.
- `PUBLIC_SOURCE_EXTRACTION`: forum/video/public case source with provider and privacy rules.
- `BULK_REGISTRY_IMPORT`: later, separately reviewed.

The ChatGPT app should link to the secure portal for full intake rather than receive identifiable health data.

### 7.3 Progressive intake

#### Minimum useful submission

- broad condition/problem;
- intervention(s) or exposure(s);
- whether it helped, harmed, had no clear effect, or remains unclear;
- approximate timing;
- optional narrative;
- completeness acknowledgment; and
- consent choices.

#### Adaptive high-value follow-up

- diagnosis and certainty/source;
- onset and natural history;
- baseline severity/function;
- exact intervention form/route/dose/frequency;
- dates, changes, adherence;
- co-interventions and life changes;
- outcome definitions and baseline/follow-up values;
- onset, peak, persistence, loss of effect;
- adverse effects;
- stopping/restarting/rechallenge;
- objective tests or clinician observations;
- prior failed/successful treatments;
- competing explanations;
- current state; and
- willingness to follow up prospectively.

The question selector prioritizes fields that most reduce ambiguity for the reported treatment episode. Users may stop at any time; partial state remains explicit.

### 7.4 Combination episodes

For reports like the MCAS example:

- create separate intervention components for LDN, NAD+ injection, and tirzepatide;
- preserve exact or approximate start/change dates;
- record whether changes were simultaneous or staggered;
- record dose/route/frequency separately;
- record other co-interventions;
- map each outcome trajectory against the timeline;
- record the reporter's attribution and confidence;
- store AskRigor's attribution capability as `COMBINATION_ASSOCIATION_ONLY` unless stronger within-person or formal evidence exists.

Do not split a combination story into three independent success reports.

### 7.5 Completeness and evidentiary utility

Store a field-level completeness matrix, not a single “credible/not credible” label. Dimensions include:

- identity/linkability available privately;
- diagnosis detail;
- baseline;
- intervention specificity;
- timeline resolution;
- co-intervention coverage;
- outcome measurement;
- follow-up duration;
- adverse-event coverage;
- dechallenge/rechallenge;
- objective corroboration;
- source documents; and
- prospective versus retrospective collection.

Public aggregate filters can distinguish `minimal`, `moderate`, and `high-detail` records, with the underlying criteria visible.

### 7.6 Consent ledger

Every consent is versioned, specific, revocable where applicable, and independent:

- private service storage;
- de-identified aggregate research;
- human reviewer access;
- recontact/follow-up;
- public redacted story;
- real name, pseudonym, or anonymous attribution;
- direct quotations;
- document/image/media publication;
- external record linkage;
- future related research;
- generalized product improvement; and
- model training, if ever proposed, as a separate explicit consent not assumed by any other choice.

Record privacy notice version, consent text hash, timestamp, actor, channel, withdrawal, and downstream actions.

### 7.7 Public story workflow

`PRIVATE_DRAFT -> PRIVACY_REVIEW -> REDACTED_PREVIEW -> SUBJECT_APPROVED_EXACT_VERSION -> EDITORIAL_REVIEW -> PUBLISHED`

Side states:

- `DECLINED_PUBLICATION`;
- `REVISION_REQUESTED`;
- `WITHDRAWAL_REQUESTED`;
- `PUBLIC_WITHDRAWN`;
- `RECONTACT_NEEDED`;
- `LEGAL_OR_SAFETY_HOLD`.

Public pages show:

- what the person reported;
- timeline and treatment combination;
- completeness/limitations;
- whether outcomes were subjective/objective;
- formal evidence related to the story;
- patterns in similar stories only when minimum thresholds and bias warnings are met;
- explicit statement that the story does not prove treatment efficacy; and
- date/version.

### 7.8 Aggregate pattern analysis

Permitted analyses include:

- report counts and direction;
- treatment combinations;
- time-to-reported-effect;
- persistence/loss of effect;
- adverse-event patterns;
- subgroup hypothesis signals;
- dechallenge/rechallenge patterns;
- concordance/conflict with formal evidence;
- missing-data and selection-bias diagnostics; and
- candidate questions for formal research.

Never publish naive “X% cured” without denominator definition, recruitment mechanism, missing-data handling, follow-up, duplication controls, and severe self-selection caveats.

### 7.9 Prospective upgrade path

Offer willing contributors a prospective follow-up mode:

- predefine symptoms/outcomes;
- establish baseline period;
- record planned intervention change;
- repeated measures;
- adherence/co-interventions;
- adverse events;
- stopping/restart;
- scheduled follow-up; and
- optional clinician/lab corroboration.

This produces a stronger `PROSPECTIVE_N_OF_1` lane but still does not substitute for controlled population evidence.

## 8. Data architecture additions

Proposed canonical tables/entities:

- `source_families`, `source_family_members`, `source_family_observations`, `source_family_import_runs`;
- `study_audit_profiles`, `study_audit_domain_findings`, `study_information_contribution_profiles`, `study_synthesis_contributions`, `study_influence_analyses`;
- `research_missions`, `mission_amendments`, `mission_work_packages`, `mission_checkpoints`, `mission_snapshots`, `mission_subscriptions`;
- `prediction_questions`, `prediction_question_versions`, `prediction_submissions`, `prediction_reveals`, `prediction_scores`, `prediction_aggregate_snapshots`;
- `story_subjects_private`, `story_records`, `condition_episodes`, `intervention_episodes`, `story_outcomes`, `story_adverse_events`, `story_measurements`, `story_completeness_profiles`;
- `consent_records`, `consent_withdrawals`, `public_story_versions`, `story_pattern_analyses`; and
- `community_contribution_capsules`, `community_contribution_receipts`, `private_tier_elections`.

Direct identifiers and public/research records must be separated by database role/schema or stronger service boundary. Public Atlas readers receive no access to private story tables.

## 9. Release and learning firewalls

- Study audit does not automatically alter a public finding.
- Information contribution does not override methodological validity.
- Prediction accuracy does not grant scientific authority.
- Story popularity does not change evidence certainty.
- Community contribution does not bypass source/audit validation.
- A public story does not become a treatment recommendation.
- A mission interim snapshot does not become terminal evidence.
- A supervisor verdict does not replace the canonical owner/user objective or release checks.

## 10. MVP scope after current Atlas contracts

The first expansion slice should implement fixture-backed contracts for:

- one site-family manifest and import receipt;
- one Study Lab comparison with at least four studies and contribution/influence differences;
- one long-range mission with multiple work packages, pause/resume, and interim snapshot;
- ten prediction questions with reveal/scoring fixtures;
- six patient stories including one incomplete story, one harm, one no-change, one combination episode, one dechallenge/rechallenge, and one public-withdrawal case;
- granular consent and PHI-channel rejection; and
- one community contribution capsule versus paid-private election.

No real identifiable health story, public story page, autonomous long-range spending, or c19early import should be activated in this fixture slice.

## 11. Acceptance criteria

### Study Lab

- Methodological validity and information contribution are separate records and UI sections.
- Every compact judgment links to domain evidence and rubric version.
- Contribution is synthesis-specific and cannot be displayed as universal study quality.
- Leave-one-out/reclassification views reproduce from stored inputs.
- Overall-picture conclusions preserve scope, heterogeneity, and uncertainty.

### Research Missions

- Mission objective cannot be replaced by a subtask or checkpoint.
- Parallel work packages use explicit write sets/leases and stale commits fail.
- Pause/resume/restart preserves state and reopens only lost work.
- Interim snapshots are visibly nonterminal.
- Coverage and uncertainty replace false percent complete.
- Living refresh failure produces stale state, not silent currency.

### Predictions

- Predictions are locked before reveal and hash-verifiable.
- Outcome leakage/seen-result declarations are retained.
- Scoring is deterministic and versioned.
- Crowd expectations never alter evidence certainty.
- Question/reveal amendments remain public/auditable.

### Stories

- Partial submissions remain usable without fabricated data.
- Combination treatments remain one combination episode with components.
- Public publication requires exact-version preview approval.
- Story use, research aggregation, quotation, recontact, and product improvement have separate consent.
- App intake rejects PHI and directs full intake to the secure portal.
- Withdrawal propagates according to a declared policy and does not silently erase audit history.
- Aggregates expose recruitment, denominator, missingness, and self-selection limits.

### Community/private tiers

- Community submission shows the exact non-personal capsule before write.
- Raw chats and health stories are excluded.
- Paid private tier prevents contribution writes except required operational/security records.
- Deep Research read-only behavior is handled by an explicit post-run submit or server worker.
