# Public Discovery Atlas: independent concept and prior-work scan

Date: 2026-08-30
Status: design-stage scan complete; no public application or automated publication authorized by this document
Decision: **compose** mature living-evidence, evidence-map, evidence-grading, ontology, screening, and public-navigation patterns around AskRigor's canonical claim and receipt system; **experiment** with a versioned unexpectedness model

## Independent conception snapshot

Before examining external systems, Joel's concept was preserved as follows:

- Create a public dashboard showing discoveries AskRigor has made, with health research as the first major domain.
- Automate research with parallel workers while keeping the public product understandable at a glance.
- Reuse useful findings and architecture from the family of sites represented by `ivmmeta.com` when they fit.
- Let people see the most important and most unexpected findings first.
- Let people sort and filter by evidence level and finding category.
- Let people search by health condition.
- Let people ask follow-up questions.
- Let AskRigor learn from user questions, corrections, leads, and experience without confusing popularity or anecdote with evidential strength.

The central product insight is not merely "put meta-analyses on a website." It is to turn AskRigor's cumulative, provenance-governed evidence repository into a public, navigable atlas with transparent ranking, conversational drill-down, correction history, and a structured learning loop.

## Scan question and boundary

Which parts of this concept are already solved by mature evidence websites, standards, research workflows, and health-decision frameworks? Which parts require AskRigor-specific adaptation or new experiments?

The bounded scan covered:

- the public information architecture and update model visible on the `ivmmeta.com` / c19early family;
- AskRigor's already-merged cumulative living-evidence repository and research-frontier ledger;
- living systematic reviews and living evidence maps;
- evidence gap maps and review-to-study matrices;
- GRADE and evidence-to-decision patterns;
- RoB 2 and AMSTAR 2 domain-led appraisal;
- MeSH-style controlled condition vocabulary and aliases;
- active-learning-assisted screening such as ASReview;
- evidence-based-medicine representations in FHIR as an interoperability benchmark;
- statistical and Bayesian work on surprise, prior expectations, replication, and credibility; and
- health-priority and multi-criteria decision frameworks.

This was a product and architecture scan, not an audit of every health claim on IVMmeta and not authorization to republish third-party source content.

## Existing work inventory

| Existing work | What it already solves | AskRigor disposition |
| --- | --- | --- |
| IVMmeta / c19early family | Dense treatment navigation, outcome and study-design filters, forest plots, study tables, recent additions, methods, responses, exclusions, revisions, and continuous surveillance | **Reuse interaction patterns; ingest only as attributed candidate evidence.** Do not import its pooled conclusions as AskRigor findings without current source-level revalidation and synthesis |
| AskRigor living-evidence repository | Versioned sources, claims, evidence bindings, assessments, runs, receipts, freshness, correction, and generated views under PostgreSQL authority | **Reuse as canonical authority.** The public atlas must be a projection, not a second knowledge base |
| AskRigor research-frontier ledger | Discovery passes, requested versus confirmed windows, candidates, inclusion/exclusion/defer decisions, unresolved trails, coverage gaps, and delta state | **Reuse for worker automation and update completeness.** Keep private operational detail separate from public findings |
| Cochrane living-review discipline | Recurrent surveillance, incorporation of new eligible evidence, and explicit living status | **Adapt** for topic refresh schedules, stale-state handling, and publication gates |
| Epistemonikos-style review/study matrix | Navigable relationships among reviews and included primary studies | **Compose** into condition and finding drill-down views |
| 3ie and other evidence gap maps | Visual intervention-by-outcome or topic-by-study maps with linked evidence and visible gaps | **Compose** into condition landscapes and unresolved-question maps |
| Living Evidence Maps | Rapidly updated visual maps, click-through to underlying publications, and evidence briefs | **Benchmark** public overview and update workflows |
| GRADE | Outcome-specific certainty across a body of evidence | **Reuse by reference when actually applied.** Never pretend every AskRigor label is formal GRADE |
| GRADE Evidence-to-Decision and health-priority frameworks | Explicit dimensions such as effects, certainty, values, resources, equity, acceptability, feasibility, burden, and actionability | **Adapt** into an inspectable importance profile, not a hidden universal score |
| RoB 2 and AMSTAR 2 | Domain-led appraisal with reasons and critical domains | **Reuse/adapt** within intended scope; preserve domain findings and disagreements rather than reducing them to a star rating |
| MeSH | Stable health-condition descriptors, hierarchical relationships, entry terms, and synonyms | **Reuse as the initial condition vocabulary and lay-alias backbone**, while allowing AskRigor-specific facets and later terminology mappings |
| ASReview and related active-learning screening | Reviewer-assisting prioritization of likely relevant records | **Experiment behind a human-controlled screening protocol.** It may order work but cannot decide final eligibility by itself |
| EBMonFHIR | Emerging structured representations for evidence, variables, summaries, and certainty | **Benchmark/export target**, not the first internal storage model; the current implementation guide is still evolving |
| Statistical/Bayesian surprise and replication methods | Quantify inconsistency with a specified model or prior and assess credibility/replication | **Use as conceptual inputs**, not as a ready-made cross-topic public “unexpectedness score” |
| Multi-criteria health priority setting | Makes value judgments and weights explicit rather than hiding them in one ranking | **Adapt** for importance, with selectable audience profiles and visible component values |

## What is solved enough to reuse

- Public browsing by treatment, condition, outcome, study type, and recency.
- Forest plots, study tables, exclusions, methods, and revision history as drill-down patterns.
- A canonical versioned evidence repository with explicit provenance and correction lineage.
- Living-review surveillance and a durable research frontier.
- Review-to-study and intervention-to-outcome maps.
- Controlled condition vocabulary plus synonyms.
- Domain-led risk-of-bias, review-quality, and body-of-evidence certainty frameworks.
- Machine-assisted prioritization of screening work while humans retain eligibility authority.

## Partially solved and requiring AskRigor adaptation

### “Discovery” identity

Most evidence systems publish findings but do not reliably distinguish:

- an original AskRigor discovery;
- an established finding independently validated by AskRigor;
- a known but neglected finding surfaced by AskRigor;
- a finding AskRigor challenged, narrowed, or corrected;
- a third-party synthesis imported as a research lead; and
- an unresolved hypothesis.

AskRigor needs explicit provenance labels before using the word “discovery” publicly. The safe default public name is **Findings surfaced by AskRigor**. “Original discovery” requires a separate novelty scan and release decision.

### Importance

Established frameworks identify relevant dimensions, but there is no context-free objective order of all health findings. AskRigor must expose a vector—burden/reach, absolute impact, certainty, actionability, benefit-harm balance, access/cost, equity, and freshness—plus a named, versioned weighting profile. Users may sort by individual dimensions or a declared profile. A hidden prestige score is incompatible.

### Unexpectedness

Statistical surprise depends on a specified model or prior. Public surprise also depends on whose expectation is being violated: current guidelines, common clinical belief, mechanistic intuition, an earlier AskRigor synthesis, or an individual user's prior. No scanned system supplies a validated, general-purpose rank of “most unexpected health findings.”

AskRigor therefore needs an experimental, auditable model based on:

1. a timestamped expectation record and source;
2. a declared audience or reference prior;
3. the observed direction and magnitude;
4. evidence certainty and replication;
5. plausible alternative explanations and measurement artifacts; and
6. a human-approved plain-language sentence, “Unexpected because …”.

Low-certainty surprises belong in a separate **provocative/provisional** lane, not above credible findings merely because they are sensational.

### Public conversational answers

General retrieval-augmented chat is solved technically, but AskRigor requires claim-level citation, freshness, capability ceilings, dissent, and access-state propagation. The model may explain released records; it may not promote worker drafts or fill missing evidence from memory.

### Learning from users

Questions, corrections, source leads, comprehension failures, importance preferences, and lived experiences can improve discovery and presentation. They cannot directly alter evidence certainty. User input must enter a triage frontier with explicit type, consent, privacy, and validation state.

## Incompatible shortcuts

- Copying IVMmeta's conclusions and relabeling them AskRigor discoveries.
- Treating a source's CC0 site-level text or data license as permission to republish all referenced papers, figures, tables, or images.
- A single unexplained “evidence score.”
- A single unexplained “importance score.”
- A context-free “surprise score” driven by headline novelty.
- Publishing direct worker output before claim, source, audit, contradiction, and release gates pass.
- Letting user votes increase scientific certainty.
- Mixing the private worker-control dashboard with the public evidence atlas.
- Storing raw user health narratives, worker chats, full texts, or community content by default.
- Using embeddings as identity, provenance, entailment, or supersession authority.

## Genuinely unresolved remainder

1. The exact public-release record that projects canonical claims, source versions, assessments, freshness, dissent, and limitations without duplicating authority.
2. A tested importance rubric and the default public weighting profile.
3. A reliable, non-sensational unexpectedness protocol and evaluation set.
4. Which condition taxonomy extensions are needed beyond MeSH and lay aliases.
5. The minimum evidence threshold for homepage promotion versus condition-page inclusion.
6. The public handling of conflicting high-quality syntheses.
7. Which user-feedback fields may be retained, for how long, and in what aggregated form.
8. The source-by-source licensing manifest for imported IVMmeta-owned material and every linked third-party artifact.
9. The condition set that best tests generality without making the launch synonymous with one contested treatment dispute.
10. The supervision and release throughput achievable when parallel workers scale.
11. The runtime/catalog and consent boundary for letting ordinary AskRigor
    runs read prior frontier state or propose minimized contributions; the
    public Atlas projection does not itself solve cumulative write-through.

## Composition decision

### Reuse

- AskRigor's PostgreSQL evidence repository and exact receipts as authority.
- The research-frontier ledger for automated continuation.
- IVMmeta-style navigation, filtering, drill-down, forest plots, recent additions, exclusions, and revision history.
- MeSH descriptors and entry terms for initial condition search.
- Formal appraisal frameworks only within their intended scope.

### Adapt

- Evidence maps into condition landscapes and open-question maps.
- Evidence-to-decision and health-priority dimensions into transparent importance profiles.
- Active-learning screening into a worker-assistance lane with deterministic human-controlled gates.
- Living-review cadence into source-class-specific freshness policies.

### Compose

- Canonical claims + public release records + condition ontology + maps + search + conversational explanation + user-feedback triage.
- IVMmeta candidate records + independent AskRigor study audits + rival syntheses + integrity/retraction evidence, preserving disagreement rather than forcing one uninspectable verdict.

### Invent/experiment

- Versioned public unexpectedness assessments.
- A provenance-safe label system for original, validated, surfaced, challenged, corrected, and provisional findings.
- An interface that shows “why important,” “why unexpected,” “what could overturn this,” and “who disagrees” on the same finding card.

## Strongest baselines for implementation

The public atlas should be benchmarked against:

1. IVMmeta/c19early for dense treatment navigation, forest plots, study tables, recency, and revisions.
2. Epistemonikos/3ie/living evidence maps for evidence relationships, visual gaps, and click-through.
3. GRADE/MAGIC-style multilayer summaries for progressively disclosed certainty and rationale.
4. Plain PostgreSQL structured filters plus full-text search before adding vector retrieval.
5. ASReview-style reviewer assistance for screening efficiency, with ordinary independent dual screening as the validity baseline.
6. A flat static condition page as the comprehension and performance baseline.

## Recommended pilot boundary

Use two deliberately different benchmark tracks:

- **Adversarial internal benchmark:** ivermectin/COVID. Import IVMmeta's owned structured assertions only as attributed candidates, then compare source identity, trial integrity, exclusions, retractions, outcome selection, pooled results, Cochrane conclusions, and AskRigor audit outcomes. This tests whether the system can represent profound disagreement without laundering any side into authority.
- **Public generalization benchmark:** one or more less-politicized health conditions for which AskRigor already has completed, source-linked audits. This tests ordinary condition search, finding cards, harms, uncertainty, and question answering without making the entire product look like an ivermectin advocacy or rebuttal site.

## Rescan triggers

Rescan is required before:

- claiming an AskRigor finding is scientifically novel;
- activating automated public publication;
- adopting a universal numerical importance or surprise score;
- importing or republishing third-party figures, tables, source text, or datasets;
- storing identifiable or longitudinal user health information;
- using an ontology, appraisal framework, or AI screener outside its validated scope;
- making EBMonFHIR or another evolving external schema a hard production dependency; or
- materially changing the evidence repository, public release, or worker-supervision model.

## Source and access note

The scan used current public material on 2026-08-30. IVMmeta/c19early is useful as a product and adversarial-analysis precedent, not as presumed ground truth. Its site-level CC0 notice does not erase restrictions attached to referenced third-party material. Provider pages, standards, licenses, and methods are time-sensitive and require implementation-time verification.
