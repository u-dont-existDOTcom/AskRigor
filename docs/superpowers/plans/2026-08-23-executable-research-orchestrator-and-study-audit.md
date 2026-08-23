# Executable research orchestrator and study-audit plan

**Status:** Owner-approved architecture; feasibility implementation in progress.

**Goal:** Replace prompt-only research compliance with a server-owned,
evidence-bound workflow that automatically uses the configured high-recall
video scout, audits exact treatment programs, deeply inspects accessible full
studies, preserves inaccessible studies as unresolved leads, and permits a
comparative synthesis only after a real product replay demonstrates that the
required work occurred.

## Owner corrections captured by this plan

1. A randomized controlled trial is a study design, not a synonym for science,
   truth, reliability, reproducibility, or applicability. Peer review and
   journal prestige are also not certificates of validity.
2. Evidence must be audited deeply enough to determine what the study actually
   tested and what its methods and data can support. An abstract cannot support
   a decision-important comparison when omitted methods or results could change
   the interpretation.
3. Distinct implementations must not be collapsed into labels such as
   `exercise`, physical therapy, diet, injections, conservative care, or
   alternative treatment. A study of one resistance-training program does not
   adjudicate swimming, gait retraining, differently dosed strengthening,
   mobility work, load modification, or a multimodal program.
4. Freely and lawfully accessible full texts should be acquired and audited.
   Some studies will remain inaccessible. Those studies should be preserved as
   clearly identified, possibly useful research leads requiring further
   investigation. Their unseen contents are not evidence, but their
   inaccessibility does not freeze all other executable research or prevent a
   bounded synthesis from the sources that were actually inspected.
5. Gemini Spark candidate discovery must no longer require the owner to copy a
   packet between products. The integration must produce and validate its own
   candidate frontier or fail honestly before downstream work is built around
   it.
6. The goal is the right videos and materially different treatment programs,
   not a video quota. Counts may expose obvious undercoverage but cannot replace
   relevance, exact program identity, stage, outcome, horizon, failure and harm
   coverage, or information gain.
7. Repository tests cannot stand in for the installed Custom GPT. A release is
   not accepted until fresh chats in the actual product expose the expected
   Actions, execute the workflow, and produce compliant ordinary-language
   output.

These corrections are generic. The repair must not encode a special exception
for hip arthritis or any other single condition.

## Confirmed failure diagnosis

The current repository already contains prose rules against most of the
observed behavior, yet the installed GPT still relied on an abstract, treated a
randomized comparison as broadly dispositive, collapsed distinct exercise
programs, skipped Spark, audited only one discussion from a larger candidate
frontier, skipped the treatment-coverage assessment, and synthesized anyway.

The failure is therefore not explained by one missing instruction.

### Enforcement gaps

- The model decides whether to call the coverage Action. Nothing prevents it
  from answering when it skips the call.
- The treatment-coverage Action checks a caller-assembled ledger for internal
  consistency. It does not own the search session or independently prove that
  the represented searches and audits occurred.
- The current Spark Action validates a supplied packet but does not invoke
  Spark or another Gemini scout. The required producer step remains manual.
- The public research surface can retrieve PubMed citation metadata and
  abstracts but has no full-text acquisition and study-method audit Action.
- The current product-acceptance command validates a supplied JSON record of
  installed and observed state. Its passing unit fixture constructs that state;
  it is not a real Custom GPT replay.
- HRP is approximately 535 KB and Universal approximately 106 KB before the
  compact Custom GPT instructions and tool descriptions. Protocol size is not
  by itself proven causal, but requiring the model to load and remember this
  entire workflow makes instruction-only enforcement fragile.
- Availability-conditioned video minima prevent obviously narrow coverage but
  can encourage filler when they are treated as the objective. They do not
  prove that the selected candidates are the decision-important ones.

### Epistemic gaps

- Design names are still used as credibility shorthand in generated answers,
  even though canonical HRP says otherwise.
- No executable receipt currently demonstrates registration and protocol
  consistency, intervention fidelity, comparator competence, attrition,
  crossover, missing data, outcome switching, analysis flexibility, harms
  capture, conflicts, data/code access, or independent replication for a
  decision-important study.
- Systematic reviews and guidelines can be quoted without auditing their search
  coverage, included-program heterogeneity, study-level limitations,
  publication bias, model choices, or citation entailment.
- Formal sources and community sources are too easily presented as a fixed
  hierarchy. In reality they have different claim capabilities and failure
  modes. Neither source class automatically resolves the other.

## Target architecture

### 1. Server-owned resumable research session

Expose a small, bounded Action workflow instead of asking the Custom GPT to
coordinate many independent low-level calls from prose:

- `start_research_session`
- `continue_research_session`
- `get_research_session_status`
- `finalize_research_report`

The exact names remain implementation details until the route design is
reviewed. The invariant is that the server owns the session state and decides
the next required operation. Each continuation performs a bounded amount of
work and returns a server-issued opaque handle. The server records:

- exact protocol versions and hashes;
- applicability and module state;
- discovery batches and queries;
- native and external-scout candidate frontiers;
- validated source identities;
- treatment classes and exact program records;
- transcript and discussion acquisition receipts;
- formal searches, source identities, access boundaries, and full-text audits;
- community-to-formal and formal-to-community transfers;
- unresolved hypotheses and potential decision impact;
- allowed output boundary.

Caller-authored counts, Boolean completion flags, or renamed identifiers cannot
unlock completion. Existing source adapters and signed continuation receipts
should be reused where they already establish real retrieval.

`finalize_research_report` returns a comparative report only when the session's
server-derived state permits it. Otherwise it returns the remaining executable
work or a bounded report whose limitations are generated from actual state.

### 2. Automated high-recall scout

The first implementation phase is a feasibility spike, not a protocol rewrite.
It must determine whether Gemini Spark exposes a supported callable route or
whether an official Gemini API configuration can reproduce the useful
high-recall candidate behavior.

The automated scout must:

- consume the exact research target and diagnosis/stage actually supplied;
- execute materially different discovery searches;
- return real public YouTube identifiers and provisional summaries;
- identify the specific program or state `program not described`;
- keep stage, outcome, horizon, benefit, failure, harm, discontinuation, and
  progression distinctions;
- validate every identity independently before selection;
- label summaries as provisional until AskRigor checks captions;
- run without the owner copying a packet between products;
- remain a discovery source, not a treatment-evidence source.

The existing validator remains useful downstream, but validator availability
must never again be reported as if the producer were integrated.

### 3. Quality-first candidate selection

The research session combines the automated scout frontier with native search
and deduplicates by stable video identity and normalized program content.

For each candidate record:

- exact title, channel identity, date, and canonical URL;
- source frontier and discovery query;
- target and diagnosis/stage distance;
- components;
- dose or intensity;
- frequency and duration;
- supervision and adherence expectations;
- co-interventions;
- baseline severity or stage;
- outcome and time horizon;
- preoperative, postoperative, nonsurgical, or unrelated care stage;
- firsthand, clinician, commercial, testimonial, educational, failure, harm,
  or other relevant provenance;
- decision value and redundancy reason;
- transcript and discussion availability.

Selection optimizes nonredundant decision value. Raw thresholds remain
undercoverage alarms, not success criteria. A selected set must deliberately
seek materially different programs and benefit, no-effect, failure, harm,
discontinuation, durability, progression, nonaction, and eventual-standard-care
trajectories where applicable.

Discovery continues while later batches add a program or outcome hypothesis
likely to change the evidence map. It stops when the latest well-targeted batch
adds no material hypothesis or a genuine access boundary is reached.

### 4. Accessible full-text acquisition

Add lawful source acquisition for freely accessible study text. Start with
direct reusable full-text repository records such as Europe PMC, then use
Unpaywall DOI resolution to discover additional lawful publisher, author, and
institutional-repository copies. Unpaywall location metadata is a discovery
lead: the linked object must still be fetched, identity-checked, classified by
version, and checked for completeness before it becomes audited full text.
Other lawful machine-readable sources may be added when current terms,
stability, security, and testability justify them.

Every acquired document must carry:

- stable source identifiers and canonical location;
- access route and retrieval date;
- exact access state;
- content hash;
- document type and completeness;
- section, table, figure, appendix, page, or paragraph provenance for extracted
  facts where available;
- correction, retraction, and version state;
- extraction errors and missing sections.

An abstract, summary, search snippet, or AI paraphrase is never silently
upgraded to full text.

### 5. Inaccessible-study boundary

An inaccessible study is represented as a research lead, not as negative
evidence and not as silently verified evidence. Record:

- exact title and identifiers;
- what access routes were attempted;
- whether only metadata or an abstract was inspected;
- why the paper might be useful;
- the methods, tables, outcomes, harms, or other fields still needing
  investigation;
- whether the likely impact is detail-only, confidence-changing,
  ranking-changing, potentially conclusion-changing, or unknown.

Continue all other executable research. A bounded synthesis may use audited
accessible sources and state plainly that the inaccessible paper may be useful
but was not deeply checked. It must not quote unseen details, let an abstract
control a treatment ranking, or turn inaccessible content into a global
completion blocker.

This owner correction supersedes the current rule that every inaccessible
decision-critical full text necessarily keeps the entire answer in a generic
`Partial HRP` state. The revised protocol should instead bind the limitation to
the affected claim and disclose it in ordinary language.

### 6. Study reliability audit

Do not assign one prestige or hierarchy score. Produce domain-level findings
and two explicit statements for each decision-relevant study:

- what this source can support;
- what this source cannot support.

Audit, when applicable:

1. source identity, complete document access, versions, corrections, and
   retractions;
2. registration, protocol, and statistical-analysis-plan timing and
   consistency;
3. exact population, diagnostic criteria, baseline severity, selection, and
   transportability;
4. exact intervention program, delivery, fidelity, adherence, contamination,
   co-interventions, rescue care, and care stage;
5. exact comparator composition, quality, fidelity, inherited evidence, and
   causal contrast;
6. sequence generation, allocation concealment, blinding feasibility, and
   deviations from assigned care;
7. enrolled, assigned, exposed, completed, and analyzed denominators;
8. crossover, attrition, missing data, exclusions after allocation, analysis
   population, and sensitivity analyses;
9. prespecified primary and secondary outcomes, measurement validity,
   patient-important versus surrogate outcomes, clinical importance, and
   follow-up horizon;
10. raw results, absolute effects, uncertainty, baseline imbalance,
    multiplicity, subgroup flexibility, model dependence, and stopping;
11. adverse-event solicitation, definitions, windows, adjudication,
    discontinuation, and follow-up adequacy;
12. funding, sponsor and investigator roles, analytic control, conflicts, data
    and code availability, and reproducibility;
13. independent replication, shared cohorts or investigators, implementation
    match, contradictions, and relevant negative evidence.

Randomization affects the audit of confounding. It does not bypass any other
domain. Peer review, indexing, institutional authority, guideline inclusion,
and journal prestige remain contextual metadata.

### 7. Review and guideline audit

For decision-relevant systematic reviews, meta-analyses, and guidelines,
inspect rather than inherit:

- protocol or registration;
- search dates, databases, historical terms, grey sources, and exclusions;
- duplicate cohorts and publication families;
- exact intervention-program and comparator heterogeneity;
- outcome and time-horizon compatibility;
- study-level risk domains and whether pooled inputs are fit to combine;
- model choices, prediction intervals, sensitivity analyses, small-study and
  publication-bias signals;
- sponsor or panel conflicts;
- currency and citation entailment;
- whether recommendations go beyond the evidence actually reviewed.

A review or guideline can be useful without being treated as an authority that
closes the inquiry.

### 8. Claim-level synthesis

The final report maps each material claim to the sources capable of supporting
that exact claim. It keeps separate:

- causal comparative effects;
- population frequencies;
- real-world implementation and adherence;
- mechanisms;
- rare harms and long-term outcomes;
- firsthand outcomes and hypothesis discovery;
- unverified creator claims;
- inaccessible-study leads;
- inference.

Formal and community evidence do not receive automatic global rank. Weight is
claim-specific. A community report may be the best evidence that a program is
used or that a particular implementation problem occurs, while still being
unable to estimate causal efficacy. A rigorously audited comparative study may
estimate one exact contrast while saying nothing about materially different
programs.

Ordinary output must use plain language. Internal access codes, locks, receipt
names, protocol versions, and implementation jargon remain available only for
an explicitly requested technical audit.

### 9. Compact Custom GPT contract

Keep complete canonical protocols as repository and server authority, but do
not depend on the Custom GPT remembering the complete protocol corpus and a
large low-level tool graph during every answer. The session binds to exact
verified protocol hashes and the server returns only the current required step,
the evidence records needed for display, and the permitted answer boundary.

The Custom GPT Instructions should become a small public-scope and transport
contract:

- start or resume the server-owned session;
- continue while the server reports executable work;
- do not independently manufacture a comparative synthesis;
- render the finalized report in ordinary language;
- preserve the public educational boundary and urgent escalation;
- expose technical audit fields only when requested.

If the GPT repeatedly bypasses even this compact contract, the Custom GPT is
not accepted as the primary synthesis surface. Move final synthesis to a
controlled AskRigor application and use the GPT only as an optional display or
discovery client.

## Implementation phases and gates

### Phase 0 — Preserve the incident and baseline

- [x] Save the owner-approved plan and full-text correction in this document.
- [ ] Record the failed output as a sanitized regression fixture without user
      identity, medical details, credentials, or private provider content.
- [x] Inventory the exact current operations and distinguish real producers,
      validators, retrieval adapters, consistency checkers, and synthetic
      acceptance surfaces.
- [x] Update the recovery checkpoint with the branch, baseline, plan, and next
      safe action.

**Gate:** No protocol, runtime, deployment, Spark, plugin, or Custom GPT change
before the failure contract and rollback baseline are durable.

### Phase 1 — Feasibility spikes

- [x] Investigate current supported automation for Gemini Spark or an official
      Gemini capability with materially equivalent candidate discovery.
- [x] Implement the smallest isolated scout prototype without committing user
      credentials or assuming browser automation is production-suitable.
- [ ] Benchmark it against saved successful Spark frontiers and unrelated
      held-out treatment questions.
- [x] Investigate lawful machine-readable full-text providers and implement a
      read-only acquisition prototype that preserves identity, completeness,
      provenance, and hashes.
- [ ] Prototype a server-owned research session with one bounded continuation
      and one refusal to finalize incomplete work.

**Gate:** Stop and report before broad implementation if automated scouting is
unsupported or materially worse than the saved Spark behavior, if accessible
full text cannot be distinguished reliably from abstracts and summaries, or if
the session cannot own completion state independently of model assertions.

### Phase 2 — Server-owned orchestration

- [ ] Define session state and opaque continuation contracts.
- [ ] Integrate native search, the external scout, identity validation,
      transcripts, discussions, formal search, and accessible full text.
- [ ] Make the server generate candidate, program, source, and coverage records
      from real operation results.
- [ ] Preserve retryable, terminal, partial, inaccessible, and unresolved state
      without converting gaps into negative evidence.
- [ ] Implement finalization boundaries for complete comparative reports and
      bounded reports with claim-local uncertainty.

**Gate:** Mutation tests must show that omitted search batches, skipped Spark,
one-of-many audited videos, forged counts, mixed continuation chains,
uninspected full text, and unresolved material hypotheses cannot produce a
completed comparative report.

### Phase 3 — Scientific-method auditing

- [ ] Implement the accessible full-text evidence envelope.
- [ ] Implement study and review audit receipts with source-linked fields.
- [ ] Implement exact intervention/comparator identity and claim-capability
      output.
- [ ] Implement replication and evidence-ancestry records.
- [ ] Reconcile existing HRP full-text rules with the owner's claim-local
      inaccessible-source boundary.
- [ ] Remove language that allows design names, peer review, journal prestige,
      guidelines, or reviews to operate as reliability shortcuts.

**Gate:** An abstract-only randomized trial cannot produce `high confidence`,
`strongest evidence`, class-wide treatment conclusions, or the public word
`science` as a credibility label. An audited study can support only its exact
program, population, comparator, outcomes, and horizon.

### Phase 4 — Candidate quality and bidirectional discovery

- [ ] Replace quota-seeking selection with decision-value selection while
      retaining structural undercoverage alarms.
- [ ] Require the automated scout and native search frontiers to be reconciled.
- [ ] Reopen formal searching for every material program or outcome discovered
      from creator content or discussion reports.
- [ ] Reopen community searching for formal evidence about nonresponse, harms,
      durability, adherence, stage, and implementation.
- [ ] Preserve `program not described` instead of filling gaps.

**Gate:** The known broad-treatment failure and unrelated held-out cases must
recover materially different program implementations. Extra redundant videos
cannot improve the coverage result.

### Phase 5 — Regression and product acceptance

Add deterministic and model-facing cases for at least:

- 32 candidates found, one discussion audited, premature synthesis attempted;
- automated scout missing or validator-only integration;
- one abstract-only randomized study presented as decisive science;
- one exact exercise program generalized to all exercise or physical therapy;
- a peer-reviewed study with major registration, attrition, comparator, or
  outcome-reporting problems;
- a systematic review pooling materially incompatible programs;
- an inaccessible possibly useful study incorrectly treated as inspected;
- an inaccessible paper incorrectly freezing unrelated executable research;
- a strong community program signal erased because matched formal support was
  not located;
- community reports incorrectly used as causal response rates;
- jargon leakage in an ordinary answer;
- a final answer that omits the exact audited source links.

Run repeated fresh-chat product replays across the known failure and multiple
non-hip held-out treatment questions. Capture actual operation IDs, server
session state, finalization result, and ordinary output. Do not allow a manually
authored record to substitute for observation.

**Gate:** Require every planned replay to pass. Any failure returns the project
to diagnosis; do not deploy another keyword patch. Follow current official
OpenAI guidance to test the configured Action in Preview, and preserve the
observed product result as acceptance evidence.

### Phase 6 — Release and installation

- [ ] Run focused tests, `npm run test:run`, and `npm run verify`.
- [ ] Run site and deployment tests when their surfaces change.
- [ ] Review the final diff and complete lesson disposition.
- [ ] Open and review a pull request; merge only after required checks pass.
- [ ] Deploy the exact merge with a concrete rollback image and configuration.
- [ ] Verify runtime health, Action inventory, protocol hashes, privacy
      boundaries, and protected secret handling.
- [ ] Synchronize and reinstall the personal plugin from the exact merge.
- [ ] Install the exact generated Custom GPT Instructions and Action schema.
- [ ] Install or configure the exact automated scout integration.
- [ ] Run fresh real product acceptance before calling the release current.

## Acceptance criteria

The repair is complete only when all of the following are true:

1. Broad treatment research can invoke the configured scout without owner
   packet copying.
2. The server, not the model, owns the evidence and completion ledger.
3. Accessible full texts are identifiable, provenance-bound, and audited.
4. Inaccessible studies are clearly labeled possible leads and cannot be
   silently cited as inspected evidence.
5. Design labels, peer review, prestige, and guidelines cannot bypass the
   study-method audit.
6. Exact programs remain distinct throughout discovery, formal evidence,
   community evidence, and final synthesis.
7. The finalizer refuses premature broad comparisons.
8. Ordinary answers contain no internal implementation jargon unless the user
   requests a technical audit.
9. Repeated held-out replays in the actual Custom GPT pass, including the known
   failure shape.
10. Repository, deployed runtime, plugin, automated scout, and Custom GPT
    installation are synchronized to the same reviewed release.

## Abort and fallback criteria

- If there is no supported way to automate Spark or a materially equivalent
  Gemini scout, stop before pretending the validator is an integration.
- If accessible full-text acquisition cannot prove document identity and
  completeness, keep it out of decision-grade synthesis.
- If the Custom GPT continues to bypass the compact server-directed contract,
  stop treating it as the authoritative synthesis surface. Move synthesis to a
  controlled AskRigor application rather than adding more instructions.
- If a source remains inaccessible, continue other executable research and
  report that source as a possibly useful lead with its claim-local uncertainty.
- Never lower acceptance merely to complete a release.

## Security, privacy, and cost boundaries

- Do not commit or display Gemini, OpenAI, YouTube, Action, deployment, or other
  credentials.
- Any newly required paid provider, account, recurring cost, or external data
  retention requires a separate owner decision before activation.
- Preserve public educational scope and the existing privacy data map.
- Do not persist raw private research conversations or unrestricted provider
  output in product-acceptance artifacts.
- Keep live/provider tests separate from hermetic CI.

## Recovery

- Source baseline: `origin/main` at
  `93814af9b8a2c77bf5dedb254a38394dc6f5e3a0`.
- Working branch: `agent/executable-research-orchestrator-20260823`.
- This plan is the durable task contract. Chat summaries do not supersede it.
- Preserve existing production rollback records until the replacement passes
  real product acceptance.
- Do not modify or delete unrelated root-checkout files, credentials, or
  untracked work.

## Lesson disposition expectation

The project-specific incident evidence remains in AskRigor. The transferable
lesson is provisional until implementation and real product acceptance show
that server-owned completion, real replay testing, and claim-capability study
audits improve outcomes. Promote it to `universal-dev-architecture` only with
that validation and exact provenance.
