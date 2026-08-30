# Discovery Atlas expansion: independent conception and prior-work scan

Date: 2026-08-30
Status: design-stage scan complete; no collection, public release, billing change, or provider activation authorized by this document
Decision: **compose** established study-appraisal, contribution, long-running orchestration, forecasting, case-report, registry, consent, and health-privacy patterns around AskRigor's existing evidence repository and frontier; **invent/experiment** only where no adequate established model exists

## Independent conception snapshot

Before the expanded scan, Joel's additional product conception was preserved as follows:

- Search and audit the full family of sites related to IVMmeta, not only `ivmmeta.com`; any of their treatment pages or findings may be useful candidates for AskRigor.
- Let users submit a study and see how well it was done, which studies contribute more information with better methods, and what the overall body of evidence shows.
- Support research that continues for hours, days, weeks, or as a living topic instead of forcing every question into one approximately twenty-minute answer.
- When users do not supply an API key or pay for hosted research, encourage them to install the AskRigor ChatGPT app/plugin and use their own ChatGPT account. Community use should contribute improvements to AskRigor unless the user pays for a private/no-contribution tier.
- Implement a prediction feature in which people record what they expect before seeing a result.
- Make structured treatment stories a central evidence-discovery feature. Accept incomplete stories, seek missing details adaptively, ask separately whether a story may be published, and show how AskRigor is learning from patterns across stories.
- A motivating example is a report that LDN, low-dose NAD+ injections, and low-dose tirzepatide together helped a person substantially with MCAS.

The expanded product is therefore not only a public evidence dashboard. It is a **public evidence atlas + study laboratory + durable research mission system + prediction registry + patient-experience observatory**.

## Scan boundary

The bounded scan covered:

- the current `c19early.org` consolidated treatment corpus and historical domains associated with the CovidAnalysis/IVMmeta family;
- study-design-specific appraisal frameworks and methods for determining contribution to an evidence synthesis;
- network-meta-analysis contribution matrices, influence/sensitivity analysis, quantitative bias analysis, and value-of-information methods;
- durable research-session orchestration already present in AskRigor;
- systematic pre-result forecasting and preregistration;
- CARE case-report fields, patient registries, patient-experience research, structured questionnaire exchange, and phenotypic data representation;
- current OpenAI app/deep-research and sensitive-data restrictions; and
- current US health-app breach/privacy boundaries.

This was not a scientific audit of the thousands of studies in the c19early corpus and not a legal conclusion about any future business model or story registry.

## Existing work inventory and disposition

| Existing work | What it already solves | AskRigor disposition |
| --- | --- | --- |
| Current `c19early.org` corpus | A consolidated, continuously updated treatment index with treatment categories, study pages, per-treatment meta-analysis pages, timing/outcome/design views, forest plots, recent additions, corrections, and cost/efficacy views | **Import as a versioned site family and candidate-source corpus.** Independently validate every source identity, study audit, inclusion decision, extraction, and synthesis before AskRigor release |
| Historical IVMmeta/CovidAnalysis domains | Legacy treatment-specific entry points and aliases, many now redirecting or represented in the consolidated corpus | **Preserve in a family manifest** with observed status, redirect target, retrieval date, page hash, and licensing status; never assume a historical domain is current authority |
| Design-specific appraisal tools | Domain-led evaluation of randomized, non-randomized, diagnostic, prognostic/model, and review methods | **Reuse only within scope.** Preserve answers, evidence, uncertainty, rubric version, and reviewer disagreement rather than a generic quality score |
| CINeMA contribution matrix | Shows how much each study contributes to a network-meta-analysis estimate while confidence is assessed across bias, indirectness, imprecision, heterogeneity, incoherence, and across-study bias | **Adapt** the contribution concept to synthesis-specific AskRigor views; contribution is not methodological quality |
| Influence and sensitivity analysis | Shows whether conclusions change under leave-one-out, alternative model, endpoint, inclusion, or bias assumptions | **Reuse/adapt** as “what changes if this study is removed or reclassified?” |
| Quantitative bias analysis | Estimates how specified confounding, measurement, or selection bias could alter an effect | **Experiment where data permit**; show assumptions and ranges, never an opaque correction |
| Value of information | Estimates which remaining uncertainty is decision-relevant and what future information would be valuable | **Adapt** for research-priority and “what study would help most next?” views |
| AskRigor private orchestration and encrypted resumability | Server-owned start/resume/status/advance/submit/finalize state, state-digest binding, leases/fencing, restart recovery, and fail-closed completion | **Reuse as the execution kernel**, then add a mission layer for multi-session and living research |
| Systematic prediction collection and preregistration | Time-stamped predictions before result exposure, calibration measurement, null-result interpretation, and separation of prediction from hindsight | **Reuse/adapt** for public and expert predictions with immutable pre-reveal locks |
| CARE case-report checklist | Patient information, timeline, diagnosis, intervention, dose/duration/change, follow-up, adverse events, patient perspective, and informed consent | **Adapt** as the minimum episode/timeline backbone, not as proof of causal efficacy |
| Patient registries and DIPEx-style narrative research | Consistent longitudinal data and methodical collection/analysis of patient experiences | **Compose** a structured story registry with an optional narrative layer and separate public-story consent |
| FHIR Questionnaire/QuestionnaireResponse | Versioned questionnaires, partial/complete responses, authors/subjects/sources, and research case-report forms | **Benchmark/export target** for questionnaires and completion state; do not make FHIR the initial transactional authority |
| GA4GH Phenopackets | Machine-readable phenotype, disease, measurement, onset, and treatment chronology | **Benchmark/export target** for de-identified clinical/phenotypic exchange |
| OpenAI app and deep-research rules | App request purpose limitation, separate sensitive-data obligations, prohibition on app processing of HIPAA-defined PHI, and read-only app use during deep research | **Design around**, not around assumed capabilities: research reads may happen in ChatGPT; deliberate post-run contribution and identifiable story intake need separate routes |
| FTC Health Breach Notification Rule | Applies to many non-HIPAA health apps and unauthorized acquisition/disclosure of identifiable health information | **Treat the story registry as a high-risk health-data system** with security, minimization, breach response, and no advertising trackers |

## Full IVMmeta/CovidAnalysis family finding

The legacy network should not be modeled as a short hand-written list of favored domains. The current useful source is a consolidated, dynamically changing corpus at `c19early.org` with hundreds of treatment pages and thousands of studies. Historical domains and aliases remain important for provenance, redirects, old citations, and change detection.

The correct AskRigor object is a **site-family manifest** containing:

- family member or alias;
- discovery source;
- observed URL and redirect chain;
- first/last observed dates;
- page type: home, treatment overview, meta-analysis, study, methods, response, appendix, download;
- treatment/topic identity;
- retrieval timestamp and content hash;
- visible license and third-party-content boundary;
- parser version;
- candidate records produced;
- access or parsing failures; and
- supersession/current-status relationship.

The acquisition worker should enumerate the current treatment selector and every per-treatment `Meta` link, then separately reconcile historical domains. New pages or domains become candidates automatically. No treatment claim becomes an AskRigor finding merely because it appears in the family.

## Study quality versus information contribution

The user request contains two distinct questions:

1. **How trustworthy are this study's methods and result?**
2. **How much useful information does this study add to the overall evidence picture?**

A methodologically strong study can add little new information if it duplicates an already precise comparison. A smaller or imperfect study can add unique population, harm, timing, or long-term information. A large biased study can dominate a pooled estimate while reducing rather than improving confidence. Therefore AskRigor must not rank studies with one “quality” number.

The reusable decomposition is:

### Methodological validity

- appropriate design-specific rubric and version;
- randomization/allocation or confounding control;
- missing data;
- outcome measurement;
- selective reporting and registration consistency;
- analysis validity;
- integrity/correction/retraction state;
- applicability and directness;
- reproducibility/data availability; and
- unresolved reviewer disagreement.

### Information contribution

- effective sample size, events, precision, and follow-up;
- directness to the exact population/intervention/comparator/outcome/horizon;
- unique population, comparator, timing, endpoint, harm, or setting coverage;
- independence from prior evidence and duplicate-population risk;
- contribution weight to each synthesis estimate;
- influence on effect, heterogeneity, certainty, or decision under leave-one-out and alternative assumptions;
- ability to resolve a current evidence gap;
- value of additional information or decision relevance; and
- source/access completeness.

The public Study Lab may summarize these dimensions, but every judgment must remain inspectable.

## Long-range research finding

AskRigor already has a server-owned resumable research-session controller. The unresolved part is a durable **Research Mission** above any one controller session or ChatGPT conversation.

A mission needs:

- a stable owner/user objective and amendable research questions;
- modes `QUICK`, `DEEP`, `LONG_RANGE`, and `LIVING`;
- source classes, search windows, update cadence, and explicit stopping/refresh rules;
- work packages, independent lanes, leases, checkpoints, retries, and duplicate-work protection;
- cost/compute/provider budgets;
- pause, resume, cancel, supersede, and re-scope events;
- interim evidence snapshots that are explicitly nonterminal;
- current coverage, uncertainty, disagreement, and blocked trails rather than misleading percent-complete;
- durable final and subsequent update releases; and
- notifications for important changes, failures, or owner decisions.

A ChatGPT Deep Research run can be one work package. It cannot be the durable authority for a mission because current deep research uses app read actions but not app write actions. AskRigor must perform deliberate post-run contribution or continue through its own server-controlled orchestration.

## Community-compute and improvement finding

A workable tiering model is:

### Community / own-ChatGPT tier

- Encourage installation of the AskRigor app/plugin.
- Use the user's available ChatGPT model/deep-research quota for compatible read/reasoning work.
- Require, as a disclosed condition of this free tier, contribution of a **non-personal structured research capsule** when the user explicitly initiates completion/submission: source identifiers, search frontier, de-identified methodological judgments, accepted corrections, prediction records, and generalized product lessons.
- Show the exact capsule before consequential submission and provide a receipt.
- Do not silently collect the conversation or repurpose app requests beyond responding to the user's instruction.

### Paid private tier

- Hosted compute or user-supplied key options.
- No required community contribution beyond operational/security records needed to provide the service.
- Optional voluntary contribution.

### Non-negotiable separation

Health stories, identifiable/sensitive information, public-story permission, quoted text, attachments, and future recontact may **not** be bundled into the community-compute condition. Those require separate granular consent. A user may use free community research without donating a health story.

## Prediction feature finding

The prediction feature is justified and should move into the MVP contract. It needs:

- a source/question whose outcome is hidden or not yet known to the predictor;
- immutable time-stamped pre-reveal submission and content hash;
- declaration of prior exposure or possible leakage;
- probabilities or distributions, not only vague confidence;
- predicted direction and optional effect range;
- predictor cohort and expertise, with privacy-preserving identity;
- embargo/reveal event bound to a verified source version;
- Brier/log/calibration scoring where applicable;
- explicit separation between crowd surprise and scientific evidence; and
- anti-leak, duplicate, brigading, and post-hoc-edit controls.

Useful prediction objects include study outcomes, replication success, likely effect range, whether a new study will change a released finding, and which methodological defect an audit will uncover.

## Patient-story registry finding

Structured stories can be central without pretending they establish efficacy. Public language should be:

- “people reported improvement”;
- “people reported harm”;
- “no clear change reported”;
- “pattern worth investigating”; or
- “formal evidence agrees/disagrees/is absent.”

The motivating MCAS story is a **combination episode**, not evidence that LDN, NAD+ injections, or tirzepatide individually caused the outcome. The intake must preserve start dates, dose/form/route, co-interventions, staggered changes, dechallenge/rechallenge, baseline fluctuation, objective measures, and alternative explanations.

Incomplete stories are still useful if the system stores a completeness profile and never invents missing fields. The questionnaire should begin with a low-friction narrative or minimal structured intake, then ask the highest-value missing questions adaptively.

Separate consent decisions are required for:

1. private storage to provide the story service;
2. de-identified aggregation and research;
3. human follow-up or recontact;
4. public story publication;
5. direct quotation;
6. images/documents/media;
7. linkage to future submissions or external records; and
8. use in product/model improvement beyond the specific research registry.

Public publication requires a redacted preview, explicit approval of that exact version, pseudonym/attribution choice, revision history, and a withdrawal process. Aggregate records and derived research findings must have a declared policy for what withdrawal can and cannot reverse.

Because current OpenAI app terms prohibit an app from processing HIPAA-defined PHI, identifiable story intake should use a separate secure web portal. The ChatGPT app may open that portal or accept a deliberately de-identified minimal signal, but the full identifiable narrative must not transit an App Request.

## What is genuinely novel

The novel remainder is not a new generic risk-of-bias score or questionnaire form. It is the composition of:

- exact study audit;
- synthesis-specific information contribution;
- living research missions;
- pre-result predictions;
- structured patient episodes and narratives;
- formal/community-evidence separation;
- public correction and conflict history; and
- transparent contribution/private-use tiers

under one versioned evidence and consent architecture.

## Strongest baselines

- IVMmeta/c19early for high-density treatment/study navigation and adversarial synthesis comparison.
- Design-specific appraisal frameworks for validity.
- CINeMA-style contribution matrices plus influence/sensitivity views for study contribution.
- Value-of-information methods for future-research priority.
- AskRigor's existing server-owned controller for execution integrity.
- Systematic forecasting/preregistration for prediction integrity.
- CARE plus patient-registry/DIPEx practice for case chronology and narrative collection.
- A conventional prospective registry with fixed outcome instruments as the stronger evidentiary baseline against which retrospective self-reports must be compared.

## Rescan triggers

Rescan and legal/privacy review are required before:

- activating collection of identifiable or longitudinal health stories;
- publishing any individual story;
- conditioning any service on sensitive-data contribution;
- advertising treatment success rates derived from self-selected stories;
- adding passive tracking, advertising, or third-party analytics to story pages;
- claiming a study-contribution metric is validated across study designs;
- activating autonomous multi-day provider spending;
- launching required community write-back through a ChatGPT app;
- adopting FHIR/Phenopackets or another external schema as a hard production dependency; or
- importing or republishing third-party content from the c19early family.

## Sources consulted

- Current `c19early.org` home, treatment selector, treatment meta-analysis pages, and study pages, observed 2026-08-30.
- Historical domain inventory attributed to the CovidAnalysis network, retained as a secondary discovery lead pending direct redirect/DNS verification.
- Nikolakopoulou et al., CINeMA contribution/confidence framework.
- Jackson et al., value-of-information methods.
- Brown et al., quantitative bias analysis.
- DellaVigna, Pope, and Vivalt, systematic prediction collection.
- Nosek et al., preregistration and prediction/postdiction separation.
- CARE case-report checklist and literature on aggregation of case reports.
- Patient-registry and DIPEx patient-narrative methods.
- HL7 FHIR Questionnaire/QuestionnaireResponse and GA4GH Phenopackets.
- OpenAI App Developer Terms updated 2026-07-09 and current deep-research/app documentation.
- FTC Health Breach Notification Rule guidance for health apps.
