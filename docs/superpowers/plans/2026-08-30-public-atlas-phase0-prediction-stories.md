# Public Atlas Phase 0: predictions, Study Lab, long-range jobs, and community stories

Date: 2026-08-30
Branch: `codex/public-discovery-atlas`
Status: first contract/test slice implemented; no real story collection, third-party ingestion, public UI, or long-running provider execution activated

## Objective

Freeze and test the public contracts required by four newly authorized product capabilities:

1. blind reader and research-team predictions;
2. study appraisal/comparison and overall-picture synthesis;
3. resumable and long-range research jobs; and
4. structured community experience reports with granular publication consent.

The slice must preserve five boundaries:

- predictions describe expectations, not evidence;
- community stories are structured experience evidence, not proof of efficacy;
- study usefulness remains multidimensional, not an unexplained score;
- long-range activity does not equal research completion;
- free/community project contribution does not silently compel raw conversations or health stories.

## Implemented contract file

`packages/evidence-repository/src/public-atlas-phase0.ts`

The file adds pure TypeScript contracts and deterministic validators for:

- public finding state and provenance;
- evidence scope and canonical lineage;
- versioned importance dimensions;
- locked prediction questions, prereveal submissions, reveals, Brier scoring, privacy-suppressed aggregates, and unexpectedness assessments;
- structured experience conditions, interventions, outcomes, harms, consent, completeness, and public projection;
- study design, method domains, information contribution, appraisal, and comparison;
- interactive/resumable/long-range research jobs;
- immutable owner/task reconciliation fields;
- community versus private project-contribution policies;
- publication firewall and resource-bound validation.

## Implemented tests

`tests/public-atlas-phase0.test.ts`

The fixture suite covers:

- a prediction must be scoped and locked before submission;
- revealed questions reject new predictions;
- prereveal categorical predictions receive a proper Brier score;
- small audience aggregates remain suppressed;
- minimally useful but incomplete stories remain eligible for research triage;
- secondhand stories require direct subject consent before publication;
- exact regimen details remain hidden without separate display consent;
- potential identifiers trigger privacy review;
- study comparison explicitly prohibits a universal quality score;
- community contribution can require inspectable minimized lesson packets while excluding raw conversations and raw health stories;
- private mode cannot secretly retain project-learning categories;
- long-range jobs require objective reconciliation, an explicit resource bound, and a hard public-release prohibition.

## Prediction product protocol

### Reader flow

1. Select a released or soon-to-be-revealed question.
2. Display a neutral, locked population/intervention/comparator/outcome/horizon prompt.
3. Collect probabilities across benefit, harm, no meaningful difference, mixed, and insufficient evidence.
4. Optionally collect magnitude and expected-certainty predictions.
5. Record the submission before reveal.
6. Reveal the released AskRigor finding and explanation.
7. Calculate Brier score and longitudinal calibration when consented.
8. Aggregate only above a configured privacy threshold.

### Research forecast flow

Before a long-range evidence run, workers/reviewers may record predictions against the immutable research protocol. The aggregate can later support a public “unexpected because” assessment, but worker forecasts never alter the formal body-of-evidence result.

### Hostile cases still required

- question wording leaks the likely result;
- prediction made after partial source exposure;
- result changes after correction/retraction;
- finding scope differs from prediction scope;
- a small clinician subgroup risks identification;
- prediction popularity is mistakenly used as evidence;
- user edits a prediction after reveal;
- a voided study question remains in calibration.

## Community Experience Registry protocol

### Minimal intake

Accept a story when it contains:

- reporter relationship;
- at least one condition/problem;
- at least one intervention;
- at least one reported outcome;
- overall direction;
- basic consent.

The registry should then return a completeness map and optional adaptive questions rather than reject an informative but imperfect report.

### Detailed intake

Collect, when available:

- diagnosis basis and baseline severity/function;
- formulation, reported dose, route, frequency, timing, sequence, adherence, start/stop;
- baseline and follow-up outcomes, measurement, time to change, durability;
- co-interventions and alternative explanations;
- prior treatments;
- adverse effects;
- interruption/rechallenge;
- objective records;
- follow-up permission.

### Publication consent

Keep separate flags for:

- private research;
- de-identified project learning;
- aggregate inclusion;
- pseudonymous publication;
- named publication;
- quotations;
- exact regimen display;
- recontact;
- longitudinal linkage;
- approval of the exact public version.

A friend/caregiver account may create a private lead. Public publication requires the subject's direct approval.

### Public projection

The projection must:

- remove contact/identifier fields;
- suppress regimen details unless specifically approved;
- identify self versus secondhand report;
- display completeness/missingness;
- state that the story does not establish causality;
- preserve no-effect, worsening, and harm reports;
- keep the contributor's substantive account intact.

### Longitudinal follow-up

Later work should support consented follow-ups at configurable intervals. Each follow-up is a versioned episode update, not a silent edit of the original report.

## Study Lab protocol

### Intake

Accept DOI, PMID, registry ID, URL, or uploaded source. Resolve all known versions, registration, protocol, supplements, corrections, retractions, and overlapping reports.

### Appraisal

Route by study design to an applicable framework. Store domain evidence and rationale. Do not display a framework brand unless its actual questions and version were applied.

### Information contribution

Each appraisal explains:

- how well the design identifies the target effect/association;
- how directly it answers the user's question;
- how precise/informative it is;
- whether outcomes and follow-up are decision-relevant;
- reporting, missingness, transparency, and integrity;
- transportability;
- what unique information it adds;
- which conclusions depend on it;
- what it cannot answer.

### Comparison and synthesis

A comparison can say one study provides a more credible causal estimate while another adds longer follow-up or uncommon harms. It must not collapse all dimensions into “Study A: 83/100.”

The overall-picture view groups compatible evidence by scoped outcome and shows disagreement, influence, exclusions, sensitivity, and unresolved gaps.

## Long-range research protocol

### Execution modes

- `INTERACTIVE`: bounded current-session research.
- `RESUMABLE`: checkpointed research continued across user sessions.
- `LONG_RANGE`: queued, budgeted, supervised multi-cycle research.

### Compute/credential modes

- AskRigor-hosted paid execution;
- bring-your-own API key;
- ChatGPT app/plugin relay across resumable user sessions;
- sponsored public-interest jobs.

The ChatGPT app is a control/review surface. A ChatGPT subscription must not be represented as guaranteed indefinite background API compute.

### Required controls

- immutable owner question and SHA-256;
- task-contract SHA-256 and objective reconciliation;
- protocol identities;
- scope and source lanes;
- date/language boundary;
- model/cost/source/worker limits;
- checkpoint cadence;
- research frontier and unresolved trails;
- supervisor policy;
- pause/resume/cancel;
- contribution policy;
- publication firewall;
- explicit partial/incomplete finalization.

## Community and private service tiers

### Community/plugin tier

Use the user's ChatGPT account as the interactive interface and require, where contractually appropriate, an inspectable minimized project lesson packet for access to AskRigor-hosted coordination. Permitted required categories include retrieval failures, source corrections, search performance, rubric disagreements, candidate dispositions, and product/citation failures.

Raw conversations and raw health stories are excluded from the mandatory packet. Stories and predictions have separate consent flows.

### Paid private tier

Disable project-learning contribution beyond minimal security, abuse, billing, and legal records. Optional contribution remains available.

### Self-hosted AGPL tier

Do not represent hosted-service data terms as an additional restriction on independent use of AGPL-licensed code. The code license and hosted service agreement are separate authorities.

## Next code slice

1. Split the phase-0 contracts into dedicated modules after contract review.
2. Add database migration tables for prediction locks/submissions/reveals, experience stories/consents/versions, study appraisals/comparisons, and long-range job contracts.
3. Add hostile fixtures listed above.
4. Add synthetic API/service functions; no public routes yet.
5. Add private fixture UI for prediction and story intake.
6. Perform privacy, licensing, health-safety, and supervision review before real data.

## Codex handoff

> Continue from `u-dont-existDOTcom/AskRigor` branch `codex/public-discovery-atlas`. Re-read the current canonical repository state and the shared supervision bootstrap from `u-dont-existDOTcom/universal-dev-architecture` branch `architecture/codex-pro-supervision-mission-control-20260830`, path `templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`. Read the public atlas prior-work/design/plan, the C19early source-family extension audit, the supervision critique, this plan, and `packages/evidence-repository/src/public-atlas-phase0.ts` with its tests. Audit the implemented contracts against the owner request before changing them. Then implement only the database/service fixture slice and hostile tests. Do not collect real stories, ingest the C19early family, publish health findings, deploy public routes, spend provider funds, or let workers authorize public release. Save exact test receipts and unresolved contract conflicts to GitHub.