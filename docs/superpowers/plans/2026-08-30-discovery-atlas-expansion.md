# Discovery Atlas expansion implementation plan

Date: 2026-08-30
Branch: `codex/public-discovery-atlas`
Status: implementation sequence proposed; fixture work authorized by design, while real health-story intake, public story publication, autonomous long-range spending, and c19early content import remain separately gated

## Objective

Extend the current Discovery Atlas design with four vertical slices:

1. full IVMmeta/CovidAnalysis source-family enumeration and attributed candidate import;
2. a Study Lab separating methodological validity from information contribution;
3. durable Research Missions spanning multiple sessions and scheduled refreshes;
4. a Prediction Registry and Patient Experience Observatory with strict consent and evidence boundaries.

## Mandatory starting authority

Before implementation, read fresh:

1. `AGENTS.md`
2. `docs/INDEX.md`
3. `project/CODEX-CURRENT-STATE.md`
4. current complete Universal and HRP protocols when substantive health evidence is handled
5. living-evidence and research-frontier audits/specs/plans
6. public Discovery Atlas audit/spec/plan
7. `docs/audits/2026-08-30-discovery-atlas-expansion-prior-work.md`
8. `docs/superpowers/specs/2026-08-30-study-lab-long-range-research-predictions-story-registry.md`
9. `docs/ivmmeta-covidanalysis-family-manifest-v0.1.0.json`
10. `docs/public-prediction-contract-v0.1.0.json`
11. `docs/patient-story-intake-contract-v0.1.0.json`
12. privacy, source-storage, threat-model, public-review, and resumability records indexed in `docs/INDEX.md`

## Phase A — contract validation and hostile fixtures

### A1. Validate the supplied JSON contracts

Add deterministic tests that:

- load each JSON file as valid JSON;
- compile it with a pinned JSON Schema 2020-12 validator;
- accept fixed valid fixtures;
- reject hostile invalid fixtures;
- verify all declared hashes in fixture receipts; and
- fail when unsupported additional fields are supplied.

Do not silently rewrite the contracts in application code. Any correction requires a new schema version or an explicit reviewed patch.

### A2. IVMmeta family fixtures

Create fixture observations for:

- current `c19early.org` home and treatment selector;
- verified `ivmmeta.com -> c19early.org/imeta.html` redirect;
- verified treatment-overview and meta-analysis redirects;
- inactive or access-failed legacy domain;
- new treatment page added between observations;
- removed/redirected page;
- changed visible license;
- parser failure;
- duplicate study identity across two pages; and
- third-party figure that must not be imported.

Acceptance:

- every output record remains `THIRD_PARTY_CANDIDATE`;
- current and historical aliases reconcile without deleting history;
- content changes produce new observations rather than overwrites;
- scientific conclusions are absent from the enumeration acceptance result.

### A3. Study Lab fixtures

Build at least six synthetic studies for one question:

1. large precise RCT with a consequential missing-outcome problem;
2. smaller rigorous RCT adding long-term harm information;
3. observational study with unique underrepresented population but serious confounding;
4. duplicate/overlapping cohort;
5. high-weight study whose removal reverses the pooled conclusion;
6. low-weight direct replication that materially improves confidence despite little precision gain.

Required assertions:

- validity and information contribution never share one scalar authority;
- synthesis weight cannot be labeled quality;
- directness and unique coverage can differ from precision;
- duplicate populations reduce independence contribution;
- leave-one-out results are deterministic;
- body-of-evidence output changes visibly when an influential biased study is excluded or down-weighted.

### A4. Research Mission fixtures

Create mission fixtures for:

- `QUICK`, `DEEP`, `LONG_RANGE`, and `LIVING` modes;
- two independent discovery lanes;
- blinded duplicate screening;
- a stale worker attempting to commit after lease expiry;
- pause/resume across a simulated restart;
- interim snapshot mistakenly offered as terminal completion;
- budget pause;
- blocked source access;
- waiting for future evidence;
- failed living refresh producing stale state; and
- explicit mission-question amendment that preserves the invariant purpose.

### A5. Prediction fixtures

Create at least ten prediction questions and thirty submissions covering:

- binary and categorical probabilities;
- effect interval;
- ranking;
- study result already seen;
- possible leakage;
- pre-close superseding version;
- question amendment requiring a new question version;
- ambiguous resolution invalidation;
- deterministic reveal/scoring;
- public, clinician, researcher, model, and AskRigor cohorts.

Acceptance:

- locked prediction payloads cannot be changed;
- probabilities are validated and normalized only when the rule explicitly permits it;
- result-seen submissions are excluded from primary scoring but retained;
- Brier/log/interval scores reproduce exactly;
- aggregate prediction results never mutate evidence certainty.

### A6. Patient-story fixtures

Create at least eight fully synthetic records:

1. minimal incomplete improvement report;
2. harm report;
3. no-clear-change report;
4. LDN + NAD+ injection + tirzepatide combination episode for an MCAS-like condition;
5. dechallenge/rechallenge report;
6. prospectively collected N-of-1 sequence;
7. public-story preview approved then withdrawn;
8. attempted identifiable ChatGPT-app intake that must fail and route to the secure portal.

Acceptance:

- missing facts remain missing;
- combination components stay linked to one combination episode;
- public publication fails without exact-version approval and specific consent;
- quotation/media/recontact/linkage/product-improvement/model-training consent remain independent;
- aggregate research excludes records lacking the relevant consent;
- direct identifiers are absent from public/research fixture projections;
- report direction does not become a causal finding.

## Phase B — package contracts

Create or extend `packages/public-atlas-contracts` with generated or hand-maintained TypeScript/Zod contracts that match the reviewed JSON contracts.

Recommended modules:

- `source-family.ts`;
- `study-lab.ts`;
- `research-mission.ts`;
- `prediction.ts`;
- `patient-story.ts`;
- `consent.ts`;
- `community-contribution.ts`.

Requirements:

- version discriminators;
- no unknown fields at write boundaries;
- explicit nullable/unknown states;
- deterministic canonical serialization for hashes;
- public/private DTO separation;
- no PHI-capable fields in the de-identified app DTO;
- migration tests for later versions.

## Phase C — persistence model

### C1. Source-family records

Add migrations and repository methods for:

- source families;
- members/aliases;
- observations and redirect chains;
- dynamic pages;
- import runs;
- attributed candidate links;
- license observations and unresolved rights state.

### C2. Study Lab records

Add:

- design-specific audit profiles and domain findings;
- assessor/adjudication lineage;
- synthesis-specific contribution profiles;
- influence/sensitivity analyses;
- duplicate/overlap relationships;
- value-of-information/research-priority assessments;
- generated current views.

### C3. Research Missions

Add a parent mission layer without weakening the current server-owned session controller:

- missions and amendments;
- work packages and dependencies;
- leases/fence tokens;
- checkpoints and interim snapshots;
- budget/cadence state;
- refresh cycles;
- subscriptions/change events;
- release links.

Reuse existing research sessions as executable children. Do not create a second research-state controller.

### C4. Predictions

Add question versions, submissions, locks, reveals, scores, aggregate snapshots, and audit events. Separate private predictor identity from public pseudonymous records.

### C5. Patient stories and consent

Use a strong service/database boundary:

- protected subject/contact store;
- structured story/episode store;
- documents encrypted and separately consented;
- consent ledger;
- public redacted versions;
- aggregate pattern records;
- withdrawal propagation.

The public Atlas database role must not be able to access private identity/contact/document tables.

## Phase D — private APIs and state machines

### D1. Source-family enumeration API

Private scheduled/import endpoints only. Require exact parser/version/source fingerprints and return an immutable observation receipt.

### D2. Study Lab API

Provide read endpoints for public/released audits and private write endpoints for controlled workers. Every write is state/source/rubric bound.

### D3. Mission API

Extend the private orchestration surface with mission-level create/status/pause/resume/cancel/snapshot/amend/subscribe operations. Mission advancement delegates executable work to the existing controller.

### D4. Prediction API

Public read/question endpoints; authenticated or privacy-preserving submission; server-side lock and hash; reveal/scoring worker; moderation and anomaly signals.

### D5. Story portal API

Separate from the ChatGPT app API. Require current privacy notice and granular consent. Use strict rate, abuse, encryption, authorization, audit, retention, deletion, and breach-response controls.

The ChatGPT app receives only:

- a secure portal launch/link token without health narrative content; or
- the de-identified minimal intake schema, with explicit PHI rejection.

## Phase E — user interfaces

### E1. Study Lab

- paste identifier or upload lawful source;
- identity/access panel;
- methods domains;
- contribution profile;
- compare studies;
- overall evidence picture;
- “what changes if removed?”;
- “what research would help most?”;
- source/audit/history links.

### E2. Research Mission console

- mission objective and current questions;
- mode and state;
- coverage matrix;
- active/blocked/pending work packages;
- budgets;
- interim snapshots;
- uncertainty/conflicts;
- pause/resume/cancel/amend;
- material-change subscription.

Avoid false progress percentages.

### E3. Predictions

- make prediction before reveal;
- probability/interval/ranking input;
- result-seen declaration;
- lock receipt;
- reveal and score;
- personal calibration history;
- cohort comparison;
- public “what people expected” view linked to finding unexpectedness.

### E4. Patient Experience Observatory

- low-friction initial story;
- adaptive missing-detail questions;
- timeline builder;
- combination treatment components;
- outcome/adverse-event measures;
- save partial and resume;
- consent center;
- redacted public-story preview;
- withdrawal/revision controls;
- related formal evidence;
- aggregate patterns with selection/missingness warnings.

## Phase F — app/plugin and contribution tiers

### F1. Community tier

Implement a read-oriented AskRigor app path that lets a user use their ChatGPT account for compatible research. At completion, construct a minimized non-personal contribution capsule.

Before write:

- display exact capsule;
- disclose that submission is required for the community tier;
- let the user choose paid private/no-contribution instead;
- invoke one consequential submit action;
- return exact validation receipt.

No raw chat or story content may be included.

### F2. Paid private tier

Persist the election and enforce it server-side. Suppress community contribution writes while retaining only required operational/security/account records disclosed in the privacy terms.

### F3. Deep Research limitation

Test that deep research only calls read/fetch tools. Contribution write-back must be an explicit subsequent app action or a server-owned mission worker.

## Phase G — real-source pilots

### G1. IVMmeta family pilot

After licensing/source review, enumerate only the current selector and a small set of representative treatment pages. Do not begin by crawling every page or importing full content.

Pilot treatment set should test:

- high-volume contested treatment;
- treatment with few studies;
- harmful/null conclusion;
- combination or timing-sensitive treatment;
- treatment with a retracted/integrity-flagged study.

### G2. Study Lab pilot

Use already-audited AskRigor studies and reviews where possible. Add one contested IVMmeta-family synthesis only after source-level validation.

### G3. Prediction pilot

Use public historical studies whose outcomes can be safely hidden from participants in a controlled challenge, plus future AskRigor audit predictions. Clearly mark retrospective challenge questions versus genuinely future outcomes.

### G4. Story pilot

Do not activate identifiable intake until privacy/security/legal review passes. Begin with synthetic data and optionally owner-provided stories only after exact consent and secure-portal readiness. The Andy example is a motivating synthetic structure until Andy himself consents; Joel cannot grant publication or research consent on Andy's behalf.

## Phase H — supervision and release

Use the shared supervision architecture plus the AskRigor long-range research extension. Required roles:

- mission coordinator;
- independent source/identity workers;
- method auditors;
- synthesis and contradiction workers;
- privacy/consent verifier;
- prediction integrity verifier;
- public release verifier.

Consequential evidence disagreements, original-discovery claims, public health wording, patient-story publication, and consent-policy changes require Pro/human review.

No worker or prediction/story analysis may directly publish an Atlas finding.

## Implementation order

1. Phase A hostile fixtures and schema validation.
2. Phase B package contracts.
3. Phase C persistence with real PostgreSQL acceptance.
4. Study Lab fixture UI.
5. Research Mission fixture lifecycle.
6. Prediction fixture UI and scoring.
7. Story fixture intake/consent/public-preview workflow.
8. Community/private tier fixtures.
9. Security/privacy threat model and deployment design.
10. Small real-source pilots behind separate gates.

## Exact next Codex handoff

> Continue AskRigor from GitHub canonical state. Use PR #140 branch `codex/public-discovery-atlas` as design authority only after reading fresh repository state and all governing files. Begin **Phase A only** from `docs/superpowers/plans/2026-08-30-discovery-atlas-expansion.md`: validate the three new machine-readable contracts, create hostile synthetic fixtures for the site-family manifest, Study Lab, Research Missions, Prediction Registry, and Patient Experience Observatory, and add deterministic tests. Do not ingest real c19early/IVMmeta content, collect a real health story, process PHI through the ChatGPT app, deploy publicly, enable autonomous long-range provider spending, or implement billing. Preserve methodological validity separately from information contribution; preserve story reports separately from causal/formal evidence; preserve the mission objective above all child tasks. Commit to a new task branch and PR with exact test receipts and unresolved contract defects.
