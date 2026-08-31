# C19early / IVMmeta source-family and Discovery Atlas extension scan

Date: 2026-08-30
Status: bounded product/source-family scan and architecture extension; no third-party data import or scientific adoption authorized
Decision: model the entire linked site family as a versioned external `source_family`, not as a single IVMmeta integration; import claims only as attributed candidates and independently reconstruct the underlying evidence

## Owner correction incorporated

`ivmmeta.com` was only one member of a larger family of related treatment-analysis sites and pages. AskRigor should inspect the family as a whole because different members may contain useful:

- study inventories;
- treatment and outcome taxonomies;
- inclusion/exclusion decisions;
- pooled analyses and forest plots;
- study-level annotations;
- revisions and responses;
- data downloads or machine-readable assets;
- search/update methods; and
- cross-links to additional family members.

The integration unit is therefore a **source family with discovered members and versions**, not one hard-coded domain.

## Bounded family findings

The family is organized around a common early-treatment/meta-analysis architecture with an umbrella site, treatment-specific pages, alternate or memorable domains, and cross-linked methods/data/navigation. Family membership can change, mirrors can redirect, and treatment pages may share infrastructure while differing in topic, update cadence, methods, and available exports.

A fixed hand-written list would become stale. AskRigor should instead maintain a discovered and reviewed family registry seeded from canonical family entry points, then recursively inspect:

1. same-family links in navigation, methods, footer, and data pages;
2. redirects and canonical URLs;
3. treatment/topic identity;
4. page and data version/hash;
5. visible authorship and family relationship;
6. license for site-owned material;
7. third-party content restrictions;
8. available study identifiers and structured data;
9. methods, outcomes, subgroup/timing rules, and pooling choices;
10. revisions, exclusions, corrections, and responses;
11. last update and update mechanism; and
12. access failures or retired/mirrored pages.

## Required source-family registry

Create versioned records:

### `external_source_families`

- `family_id`;
- canonical name;
- seed URLs;
- owner/operator attribution;
- family description;
- discovery method and last discovery run;
- family-level license statement and limits;
- status: active, partial, inaccessible, retired, disputed;
- reviewer and approval receipt.

### `external_source_family_members`

- member URL and canonical URL;
- domain, path, redirect chain, and mirror relationship;
- topic/treatment;
- content type: overview, meta-analysis, study table, methods, data, revision, response, other;
- page/source version, retrieval time, and hash;
- visible license and third-party boundary;
- available exports and formats;
- last observed update;
- family-membership evidence;
- ingestion disposition.

### `external_interpretation_candidates`

Every imported conclusion remains an attributed candidate with:

- exact source-family member/version;
- original claim and scope;
- source identifiers cited by that member;
- inclusion/exclusion and synthesis recipe where available;
- AskRigor identity-resolution status;
- independent audit status;
- comparison status against rival syntheses;
- accepted, rejected, narrowed, conflict-mapped, or deferred disposition.

No source-family conclusion enters a current AskRigor finding merely because it is repeated across related sites.

## Family-wide AskRigor checks

For each treatment/topic member, AskRigor should be able to run:

1. **Study inventory reconciliation**
   - resolve DOI, PMID, registry ID, preprint, journal version, correction, retraction, and duplicate reports;
   - compare the family member's inventory with current high-recall searches and rival reviews;
   - expose missing, extra, inaccessible, excluded, and retracted records.

2. **Eligibility reconstruction**
   - identify the exact population, intervention/exposure, comparator, outcome, timing, design, and report rules;
   - reproduce inclusion/exclusion decisions where possible;
   - surface consequential discretionary choices.

3. **Study-method audit**
   - apply design-appropriate domain frameworks;
   - preserve exact evidence, uncertainty, and reviewer disagreement;
   - identify what each study can and cannot support.

4. **Synthesis reconstruction**
   - reconstruct compatible effect estimates and outcome definitions;
   - identify multiplicity and outcome-selection rules;
   - compare fixed/random effects, timing/subgroup choices, and integrity-sensitive exclusions when warranted;
   - do not pool incompatible estimands merely to match an external chart.

5. **Rival-synthesis comparison**
   - compare family conclusions with current systematic reviews, guidelines, integrity notices, and alternative reanalyses;
   - decompose disagreement into study set, data extraction, endpoint, timing, model, risk-of-bias, and inference.

6. **Freshness and correction check**
   - detect newly published studies, corrections, retractions, changed source content, changed access, or revised family conclusions;
   - preserve historical versions.

7. **Licensing check**
   - distinguish site-owned CC0/public-domain content from third-party papers, tables, figures, images, and datasets;
   - reuse source identifiers and permitted structured assertions without assuming downstream rights.

## Reusable family architecture

The family offers several useful product baselines:

- compact movement from treatment overview to study table and plot;
- outcome, design, timing, subgroup, and recency filters;
- visible recent additions;
- exclusions, methods, revisions, and responses;
- downloadable or inspectable study-level data where offered;
- treatment-specific deep links and memorable domains;
- continual surveillance rather than one-time publication.

AskRigor should reuse those patterns while adding:

- explicit source access and completeness;
- design-appropriate method audits;
- claim capability limits;
- integrity and correction lineage;
- rival-synthesis conflict maps;
- study information-contribution profiles;
- body-of-evidence certainty;
- public finding provenance classes;
- long-range resumable research state; and
- structured community-experience evidence kept separate from formal efficacy evidence.

## Study Lab extension

A public **Study Lab** should accept a DOI, PMID, registry ID, URL, or uploaded paper and answer three separate questions:

1. **How well was this study done?**
2. **What useful information does this study add?**
3. **How does it change—or fail to change—the overall picture?**

### Design-appropriate method profiles

The system must route to an applicable framework rather than use one universal checklist. Possible profiles include randomized trials, non-randomized interventions, diagnostic/prognostic studies, systematic reviews, prediction models, observational etiologic studies, qualitative studies, surveys, N-of-1 work, and case reports. A framework name is shown only when actually applied.

### Study information-contribution profile

Preserve separate dimensions:

- causal-identification strength for the target question;
- directness to population/intervention/comparator/outcome/horizon;
- precision and effective information size;
- outcome validity and decision relevance;
- follow-up duration;
- completeness and missing-data risk;
- preregistration and reporting consistency;
- data/code/material transparency;
- integrity status;
- transportability;
- unique contribution: new population, dose, comparator, endpoint, long-term follow-up, harms, mechanism, or replication;
- sensitivity/influence on the body-of-evidence conclusion;
- unresolved limitations.

This is not a single “best study” score. A smaller rigorous study may add unique long-term or mechanistic information while a larger study supplies more precise effectiveness evidence. The public comparison should explain that difference.

### Study comparison and overall picture

Users should be able to select multiple studies and see:

- side-by-side methods and domain judgments;
- scope compatibility;
- effect estimates and uncertainty;
- outcome/timing differences;
- unique information added by each;
- duplicate or overlapping populations;
- preregistration/reporting deviations;
- integrity/correction status;
- leave-one-out or other influence checks when valid;
- which conclusions depend on which studies;
- what remains unknown.

The body-of-evidence view then synthesizes by outcome, population, intervention, comparator, and horizon, not by paper prestige.

## Long-range research extension

AskRigor needs three execution modes:

### Interactive

A bounded research response completed inside the current conversation/session.

### Resumable

A multi-session research job with durable frontier state, checkpoints, explicit unfinished trails, and continuation tokens. The user can return through the plugin/app without restarting discovery.

### Long-range

A durable queued job that can run many worker cycles over hours or days, subject to declared source, model, cost, and supervision budgets. It emits checkpoints, partial evidence maps, blocking questions, and an immutable finalization receipt. The chat/plugin is the control and review surface; it must not be treated as a guarantee of indefinite background model compute.

Required job fields:

- immutable owner question and objective hash;
- protocol and rubric versions;
- population/intervention/comparator/outcome/horizon scope;
- search sources, date windows, languages, grey/community lanes, and exclusions;
- model/provider and credential mode;
- cost, time, source, and worker budgets;
- checkpoint cadence;
- supervisor and escalation policy;
- pause/resume/cancel state;
- research-frontier state and unresolved trails;
- public/private contribution policy;
- output/release target;
- finalization and incompleteness receipt.

A long-range job may finish with a bounded unresolved state; it may not silently convert elapsed time or worker activity into evidence completeness.

## Prediction feature accepted for implementation

Prediction has two distinct uses:

1. **Reader prediction:** before seeing a released finding, a reader predicts direction, magnitude range, and evidential certainty; the answer is then revealed and calibration is updated.
2. **Research forecast:** before a long-range search or synthesis, researchers/workers record a locked expectation. This provides a legitimate reference prior for AskRigor's unexpectedness assessment and reduces hindsight reconstruction.

Prediction records must be timestamped and frozen before reveal, scoped to the exact population/intervention/comparator/outcome/horizon, and separated from evidence. Aggregate predictions may describe what audiences expected; they cannot increase scientific certainty.

## Community Experience Registry extension

Community stories are a central product surface, not an afterthought. They remain a separate evidence class: **structured self-reported or secondhand experience**, useful for hypothesis generation, intervention discovery, outcome discovery, harms, sequencing, responder patterns, and research prioritization—but not by themselves proof of efficacy or causality.

### Fast core intake

Permit a useful submission even when details are incomplete:

- who is reporting: self, caregiver/family/friend, clinician/researcher, other;
- condition or problem and diagnosis basis;
- intervention(s) tried;
- what changed, including no effect or worsening;
- approximate timeline;
- whether other treatments/life changes occurred;
- adverse effects;
- current status;
- consent and recontact choices.

### Adaptive detailed intake

Ask follow-up questions only when applicable:

- diagnostic criteria, clinician involvement, date, severity, objective tests;
- symptom domains and baseline measures;
- intervention name, formulation, dose, route, frequency, timing, start/stop, adherence;
- sequence and interaction when multiple interventions were used;
- prior treatments and reasons stopped;
- co-interventions and major life/environment changes;
- time to benefit/harm, peak effect, durability, relapse;
- dechallenge/rechallenge or accidental interruption;
- objective markers, records, or clinician observations;
- adverse events and treatment burden;
- alternative explanations the contributor considers plausible;
- follow-up permission.

Incomplete stories receive a visible completeness map and targeted optional follow-ups; they are not discarded.

### Andy example as a questionnaire test case

The reported experience—substantial improvement from LDN, low-dose NAD+ injections, and low-dose tirzepatide for MCAS—demonstrates why the registry must support multi-component and sequential interventions. The useful unanswered fields include:

- whether Andy is the direct reporter and consents;
- how MCAS was diagnosed;
- which intervention started first and at what interval;
- exact reported regimens, route, adherence, and duration;
- baseline symptoms and function;
- timing and magnitude of change after each component;
- concurrent diet, medications, infections, environment, or other changes;
- objective measurements or clinician observations;
- adverse effects;
- interruption/rechallenge experience;
- durability and present status.

Joel's secondhand account may create a private lead, but it should not become a public Andy story or a causal finding without Andy's direct consent and review.

### Consent ladder

Collect distinct choices rather than one blanket checkbox:

- private research intake only;
- allow de-identified project-learning use;
- allow inclusion in aggregate counts/maps;
- allow a pseudonymous public story;
- allow a named public story;
- allow selected quotations;
- allow exact regimen details to be displayed;
- allow recontact and longitudinal follow-up;
- allow linkage to later submissions;
- deletion/withdrawal process and limits after a version has been cited or aggregated.

Public stories remain in the contributor's voice. AskRigor may add evidence labels, uncertainty, privacy redactions, and safety context; it must not silently strengthen or soften the person's report.

### Bias controls

- actively solicit no-effect, worsening, adverse-event, and stopped-treatment stories;
- display the recruitment channel and denominator when known;
- never infer prevalence from unsolicited reports;
- deduplicate people and treatment episodes while preserving longitudinal follow-up;
- distinguish verified documents from unverified recollection without dismissing either;
- flag secondhand reports;
- prevent popularity from changing formal evidence certainty;
- publish aggregate patterns only with explicit sampling and missingness limitations.

## Contribution and payment model

The owner's proposed model is directionally workable only after separating **project-learning contributions** from **sensitive health data** and respecting the code license/platform boundary.

### Community/plugin mode

Users who do not bring an API key or pay for hosted/private research should be encouraged to use the AskRigor ChatGPT plugin/app with their own ChatGPT account. Access to AskRigor's hosted research coordination may require contribution of a transparent, inspectable **project lesson packet**, such as:

- source corrections;
- failed or incomplete retrieval paths;
- rubric disagreements;
- accepted/rejected candidate leads;
- search terms that succeeded or failed;
- citation/display failures;
- de-identified product-quality feedback;
- prediction aggregates where separately consented.

Do not silently collect full conversations or raw health narratives as the price of access.

### Paid private mode

A paid user may disable project-learning contributions beyond minimum security, billing, abuse, and legally required operational records. Separate optional consent can still allow selected contributions.

### Self-host/open-source boundary

A telemetry/data-contribution condition cannot be assumed to bind people who independently use or modify AGPL-licensed code. The enforceable product distinction belongs to access to AskRigor-hosted services, shared repositories, coordinated worker infrastructure, or a separately accepted service agreement—not an undisclosed extra restriction on the open-source license.

### Health-story boundary

Even in community mode, story submission and public publication require separate granular consent. A user may contribute non-sensitive project lessons without donating a personal health story. Mandatory raw health disclosure would undermine meaningful consent and create avoidable privacy and platform risk.

## Architecture disposition

- **Reuse:** family navigation, study tables, plots, filters, revisions, continuous update posture.
- **Adapt:** family-wide attributed candidate ingestion, study-method profiles, study contribution comparisons, long-range durable jobs, and structured experience reports.
- **Compose:** formal evidence, community evidence, predictions, user questions, and worker research through one canonical graph while preserving evidence-class boundaries.
- **Invent/experiment:** locked public/research predictions, unexpectedness calibration, study information-contribution profiles, and longitudinal contributor-led story publication.

## Implementation order

1. Extend Phase 0 contracts and hostile fixtures for predictions, study appraisals/comparisons, long-range jobs, story intake/consent, and contribution modes.
2. Add source-family registry and disabled-by-default crawler/import manifest.
3. Implement Study Lab fixture UI and body-of-evidence comparison before real third-party ingestion.
4. Implement prediction lock/reveal/calibration against synthetic released findings.
5. Implement two-stage story intake, privacy checks, consent receipts, and synthetic public-story projection.
6. Implement resumable and long-range job contracts over the existing research-frontier ledger.
7. Run the C19early/IVMmeta family as an internal adversarial source-family benchmark.
8. Release real study checks and community stories only after privacy, licensing, health-safety, and public-review acceptance.