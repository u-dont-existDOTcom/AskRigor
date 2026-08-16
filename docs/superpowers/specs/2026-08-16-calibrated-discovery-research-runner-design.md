# AskRigor Calibrated Discovery Research Runner Design

Date: 2026-08-16
Status: approved by the owner
Branch: `codex/calibrated-discovery-v0.2-design-2026-08-16`

## Objective

Reduce unwarranted certainty in AskRigor answers while improving discovery of
credible overlooked explanations. Creative Tail Sampling supplies adversarial
hypotheses; it does not supply evidentiary support. A new AskRigor-owned runner
will perform the bounded planning, retrieval, contradiction analysis, and
claim-level calibration that a paid deep-research task service would otherwise
perform.

The primary success criterion is fewer claims whose language outruns their
evidence. Novel-hypothesis yield is secondary.

## Approved decisions

- Keep the current public v0.1 submission frozen at its 17 read-only MCP tools.
  Do not change its tool inventory, schemas, deployment, Scan Tools evidence,
  demo evidence, or OpenAI review packet for this work.
- Build and benchmark the new behavior privately as a v0.2 candidate before
  proposing any public MCP surface.
- Do not purchase or call Parallel Task. AskRigor owns the orchestration and may
  use routine Exa Search and Parallel Search as independent retrieval lanes.
- Integrate the Creative Tail Sampling contract natively in TypeScript while
  preserving exact upstream provenance and cross-repository parity fixtures.
- Treat patient reports as a separate structured treatment-experience evidence
  lane. Never convert them into population effectiveness, incidence, or causal
  estimates.
- Exclude PatientsLikeMe from the v0.2 source strategy. Its current agreement
  prohibits automated access, and the owner reported that a signed-in
  tirzepatide search exposed only 10 treatment reports on 2026-08-16. Do not
  pursue outreach, licensing, scraping, or an adapter unless the owner later
  reverses this decision.

## Current baseline and provenance

This design starts from AskRigor `main` at
`33cb5d0004974caea82738c64faffa06d1d15ae4`.

The Creative Tail Sampling input is repository
`u-dont-existDOTcom/creativeTailSampling`, branch
`agent/exa-parallel-retrieval-ensemble`, commit
`293dd0636362cdd387f6f0c4717c08e0b4016c10`.

Pinned upstream design artifacts at that commit:

- `docs/superpowers/specs/2026-08-16-exa-parallel-retrieval-ensemble-design.md`
  SHA-256
  `86d496d4d206a1c85b03adb49eefc0099a5acf6236a63cf65e222f033bdb4d7e`
- `analysis/retrieval_ensemble/schema.json` SHA-256
  `771543801b0c0506dc589a0c74b465508bb928ce40275093a4879954bdddde8d`
- `analysis/retrieval_ensemble/benchmark_cases.json` SHA-256
  `8c8f21d29456af45e4abeaff9f726c7394765d8bbc9d847d9f3825b3d0b61015`

Those artifacts describe a retrieval/adjudication scaffold. They do not yet
perform provider calls and do not replace Parallel Task by themselves.

## Scope

The v0.2 candidate includes:

- a private, bounded research-task runner;
- a claim and uncertainty plan;
- retrieval-free tail-candidate generation after ordinary hypotheses are
  recorded;
- independent Exa, Parallel Search, and current AskRigor source lanes;
- structured patient-experience normalization from authorized sources;
- source, claim, contradiction, and access-state ledgers;
- claim-level warrant ceilings and explicit downgrade reasons;
- deterministic receipts for budgets, searches, coverage, and stopping;
- fixed regression fixtures for overconfidence and evidence discordance; and
- an opt-in evaluation path that cannot alter public v0.1 behavior.

This design does not:

- add, remove, rename, or redeploy a public v0.1 tool;
- make Creative Tail Sampling a source of proof;
- create one pseudo-precise numerical confidence score;
- scrape a source whose terms prohibit or do not clearly authorize automated
  access;
- transmit identifying health details to general web-search providers;
- treat spontaneous adverse-event reports or online reviews as controlled
  effectiveness evidence; or
- activate a public asynchronous research service before a separate design,
  privacy review, benchmark pass, and OpenAI submission review.

## Core epistemic invariants

1. Tail generation starts at `speculative` and cannot raise the confidence of a
   claim. It may preserve or lower the current confidence ceiling by exposing a
   live alternative. Independent evidence is required for any later upgrade.
2. A final claim cannot sound stronger than its weakest decisive dependency.
3. Community reports establish that a report or pattern exists in the inspected
   corpus. They do not establish frequency in a target population, causation,
   comparative effectiveness, or safety.
4. `not_found` means the executed search did not locate evidence. It is not
   evidence of no effect or safety.
5. A pivotal inaccessible or metadata-only source blocks a fully verified
   conclusion when its full content is required to decide the claim.
6. Material unresolved contradiction is preserved in the conclusion rather
   than averaged away.
7. Search-provider failure, rate limiting, or budget exhaustion lowers coverage;
   it never becomes evidence against an alternative.
8. Source authorization and access completeness are independent. Publicly
   viewable material is not automatically authorized for automated reuse.

## Architecture

### Public v0.1 freeze boundary

The production MCP remains the existing stateless, read-only 17-tool service.
The v0.2 runner is not registered in the public tool inventory, public OpenAPI
schema, plugin package, public review cases, production deployment, or public
submission packet.

Private evaluation must use a separate entry point and explicit opt-in. Its
failure cannot affect v0.1 health, startup, request capacity, or source tools.

For Phases 1 and 2, that entry point is a repository-owned command-line and
evaluation harness outside the registered `apps/research-mcp` tool surface. It
may reuse source packages and provider-adapter contracts, but it is not started
by the production server and is not reachable through the public endpoint.

### Runner state machine

The runner owns these states:

```text
planned
retrieving
adjudicating
followup_required
complete
complete_with_access_boundary
budget_exhausted
failed
```

Only `complete` and `complete_with_access_boundary` are synthesizable terminal
states. The latter must state the missing coverage and its likely effect.
`budget_exhausted` and `failed` return their partial ledgers but cannot produce a
full AskRigor conclusion.

The runner performs:

1. de-identify and bound the request;
2. decompose it into claims, comparisons, populations, outcomes, and decisive
   uncertainties;
3. record ordinary hypotheses before external retrieval;
4. generate retrieval-free tail alternatives when a trigger is present;
5. produce provider-independent initial queries;
6. retrieve and fetch through source-appropriate adapters;
7. normalize records without erasing access limitations;
8. deduplicate records and likely repeated treatment episodes;
9. map sources to exact claims and test citation entailment;
10. preserve contradictions and live alternatives;
11. run bounded follow-up searches for decision-changing gaps;
12. stop at evidence saturation, an access boundary, or an explicit budget; and
13. emit a research receipt and claim-warrant ledger for synthesis.

### Creative Tail Sampling integration

The TypeScript implementation ports the upstream query-family, normalization,
collision, and adjudication contracts rather than importing a Python runtime
into the production service.

The port must:

- record the upstream commit and hashes above;
- execute the upstream fixtures as parity tests;
- keep initial generation retrieval-free;
- keep Exa and Parallel initial queries independent;
- search target-domain precedent, alternate terminology, source-domain
  precedent, and falsification-oriented equivalents;
- distinguish direct collision, root-plus-residual narrowing, corroboration,
  ambiguous collision, and no collision found; and
- treat unresolved novelty as a research state, never proof of originality or
  truth.

Tail sampling is triggered only by at least one of:

- material formal/community discordance;
- a decisive claim supported only indirectly;
- an unresolved mechanism that changes actionability;
- surprising subgroup or treatment-response heterogeneity;
- incompatible findings from credible sources;
- evidence saturation with an important residual uncertainty; or
- an explicit request for overlooked explanations.

### Retrieval lanes

Initial lanes do not see one another's results:

- current structured AskRigor providers for PubMed, Europe PMC,
  ClinicalTrials.gov, Crossref, and YouTube;
- Exa Search for semantic nearest-neighbor and terminology-translation search;
- Parallel Search for an independent broad-web search and fetch pass;
- authorized structured treatment-experience sources; and
- explicitly selected open regulatory or consented datasets.

Results may be cross-fed only after each required initial lane reaches a
terminal state. Follow-up queries must record which prior result motivated
them.

Provider adapters preserve the exact query, retrieval time, canonical source,
access state, pagination state, content boundary, provider limitations, and
failure reason. Provider snippets are discovery evidence, not substitutes for
required full sources.

Exa Search and Parallel Search are routine retrieval services, not free local
dependencies. Their adapter configuration must make authentication, per-call
cost, retention or zero-data-retention status, and provider terms explicit.
Removing Parallel Task removes that product's task charge; it does not make the
remaining model, search, network, or hosting work cost-free.

## Structured treatment-experience lane

Each normalized treatment episode should retain, when available:

```text
source
source_record_id
condition_or_indication
treatment_and_formulation
dose_route_frequency
duration_and_chronology
reported_benefit
reported_harm
reported_no_effect
discontinuation_and_reason
reporter_type
objective_or_subjective_outcome
duplicate_or_related_episode_state
access_state
authorization_state
limitations
```

Directional summaries use `benefit`, `harm`, `no_effect`, `mixed`,
`discontinued`, and `unclear`. Counts are counts within the inspected source
sample only. They must not be described as response rates unless the source
provides a valid denominator and the design supports that estimate.

The lane must flag likely duplicates, promotional or spam-like material,
indication mismatch, missing dose/duration, implausible chronology, and absent
firsthand status. A flagged report is not silently deleted; its influence and
reason are recorded.

## Source-access policy

Official source terms were reviewed on 2026-08-16. They are time-sensitive and
must be rechecked before adapter activation.

| Source | Approved v0.2 use | Boundary |
| --- | --- | --- |
| PatientsLikeMe | `excluded_by_owner` | Its agreement prohibits automated access, and the owner's signed-in tirzepatide check found only 10 treatment reports. This observed query does not establish platform-wide coverage, but it is insufficient for AskRigor's intended use. Do not contact, license, scrape, or implement an adapter. |
| CURE ID | Public discovery and manually verified case exploration | FDA/NIH describe it as a public, curated treatment registry focused on repurposed drugs. A supported public programmatic interface was not verified. Do not scrape; verify an API or obtain permission before automated ingestion. |
| PsyTAR | Offline benchmark corpus with attribution | The published 891-review psychiatric-treatment corpus declares CC BY 4.0. It is historical, covers four drugs, and cannot represent current or general patient experience. |
| Open Humans | Public API discovery and separately authorized data | A public unauthenticated API exists for member-elected public files. Follow its public-data guidelines and each dataset's consent/use boundary; it is not a ready-made treatment-review corpus. |
| openFDA drug events | Open structured adverse-event lane | It covers reports of side effects, product-use errors, quality problems, and therapeutic failures. Spontaneous reports have no valid treatment-effectiveness denominator and cannot prove causation. |
| Drugs.com / AskAPatient / WebMD | `permission_required` or discovery-only | Do not automate without written permission or a documented authorized interface. Historical third-party datasets do not authorize new scraping. |

Sources:

- `https://www.patientslikeme.com/about/user_agreement`
- `https://www.patientslikeme.com/about/privacy_full`
- `https://support.patientslikeme.com/hc/en-us/sections/200248730-Research-Overview`
- `https://cure.ncats.io/`
- `https://cure.ncats.io/terms`
- `https://pmc.ncbi.nlm.nih.gov/articles/PMC6495095/`
- `https://www.openhumans.org/public-data-api/`
- `https://open.fda.gov/apis/drug/`
- `https://exa.ai/docs/reference/exa-mcp`
- `https://exa.ai/pricing?tab=api`
- `https://docs.parallel.ai/integrations/mcp/search-mcp`
- `https://parallel.ai/ai/pricing`
- `https://parallel.ai/privacy-policy`
- `https://developers.openai.com/api/docs/guides/your-data`

## Claim-warrant ledger

Every decision-relevant claim receives one ledger record:

```text
claim
claim_type
population_intervention_comparator_outcome_timeframe
supporting_sources
contradicting_sources
evidence_directness
source_access_completeness
population_and_treatment_match
replication_and_independence
causal_design_limit
community_selection_limit
live_alternatives
missing_decisive_evidence
maximum_permitted_epistemic_label
downgrade_reasons
```

`maximum_permitted_epistemic_label` uses AskRigor's existing labels rather than
creating a competing score: `verified`, `plausible`, `speculative`, `not_found`,
or `false` where stronger evidence actually contradicts the claim.

Ceiling rules include:

- community-only support: at most a plausible observed signal, with causal,
  frequency, and effectiveness claims remaining speculative;
- mechanism-only support: `speculative`;
- unresolved material contradiction: no unqualified `verified` conclusion;
- missing required full text: no `verified` claim that depends on that text;
- incomplete pivotal source lane: explicit partial result;
- newly generated tail hypothesis: `speculative`; and
- credible disconfirming evidence: downgrade with the exact conflict, rather
  than silently balancing source counts.

The user-facing synthesis need not print every internal field, but it must state
the decisive support, strongest live alternative, important contradiction,
access boundary, and why the chosen confidence language is warranted.

## Privacy, security, and retention

- Remove names, exact locations, account handles, contact details, and other
  health-identifying context before general web-search calls.
- Do not send raw private health files, full patient narratives, or protected
  source corpora to Exa or Parallel.
- Keep provider credentials server-side and out of receipts, logs, images, and
  repository fixtures.
- Use synthetic or explicitly licensed fixtures in deterministic tests.
- Store only the minimum bounded evidence required for a private evaluation
  receipt. Do not create a permanent patient-profile corpus.
- A future persistent or public asynchronous service requires a separate data
  retention, deletion, abuse, concurrency, and incident-response design.

## Budgets and stopping

Each task declares hard bounds for provider calls, fetched documents, content
bytes, model tokens, elapsed time, retries, and estimated external cost. No
provider may silently exceed its bound.

Evidence saturation requires all decisive claims to have terminal source states
and two consecutive bounded expansions to add no material source, contradiction,
alternative, subgroup, or decision change. A timeout alone is not saturation.

When a bound is reached first, return `budget_exhausted` or
`complete_with_access_boundary` as appropriate, preserve the partial ledgers,
and state which conclusion remains provisional.

## Regression design

Tests begin before behavioral implementation and cover at least:

1. a community-only apparent treatment benefit;
2. a formal/community conflict with aligned outcomes;
3. an apparent conflict caused by population or outcome mismatch;
4. a mechanism-only explanation with no direct human evidence;
5. no evidence located versus reasonably precise evidence of no effect;
6. an inaccessible pivotal full text;
7. an incomplete or rate-limited provider lane;
8. duplicate and copied treatment reviews;
9. promotional or spam-like reviews;
10. several community platforms pointing in different directions;
11. a treatment-review platform whose terms prohibit automation;
12. a tail hypothesis that is plausible but unsupported;
13. a tail hypothesis later corroborated by independent direct evidence;
14. a provider disagreement resolved by a bounded follow-up; and
15. exhausted cost or time before evidence saturation.

The regression fails when AskRigor:

- raises confidence merely because a tail hypothesis was generated;
- converts patient-review counts into population rates;
- erases a material no-effect, harm, or contradictory signal;
- calls missing evidence evidence of safety or no effect;
- claims source completeness after an unconsumed cursor or failed lane;
- retrieves a permission-required source automatically;
- leaks identifying health content into provider queries or artifacts; or
- changes the public v0.1 tool inventory or behavior.

The fixed high-risk benchmark must have zero critical overclaim failures before
the runner can leave private evaluation. Lower-severity scoring and promotion
thresholds will be made exact in the implementation plan after the design
review.

## Rollout

### Phase 1: deterministic private benchmark

Implement contracts, synthetic fixtures, upstream parity tests, source-policy
gates, and claim-warrant ceiling tests. No live calls and no public changes.

### Phase 2: bounded opt-in live evaluation

Exercise authorized providers with de-identified synthetic or public questions.
Compare v0.1 and v0.2 outputs for claim strength, contradictions preserved,
coverage truthfulness, cost, and latency. Save only bounded, secret-scanned
receipts.

### Phase 3: owner review

Review the benchmark, cost envelope, privacy map, source permissions, and model-
layer regressions. Decide whether the behavior should remain internal, become a
user-selectable private mode, or proceed to a separately reviewed public v0.2.

### Phase 4: possible public v0.2

Only after a separate approved design may the repository add asynchronous task
tools, persistence, public schemas, deployment changes, or a new OpenAI review
packet. The v0.1 submission remains a rollback-safe independent release.

## Verification and completion criteria

The design is implemented only when:

- upstream Creative Tail Sampling fixtures pass against the native port;
- all source-policy gates fail closed;
- all deterministic overconfidence regressions pass;
- the canonical protocol and current 17-tool v0.1 tests remain unchanged and
  green;
- the complete repository gate passes on the final candidate;
- the privacy and release evidence describe the private v0.2 boundary exactly;
- a bounded opt-in live evaluation confirms truthful access and stopping states;
- every substantive finding receives project-specific, provisional, promoted,
  superseded, or no-new-lesson disposition; and
- no public tool, deployment, or submission packet changes without the later
  explicit public-v0.2 decision.

## Remaining external opportunities, not blockers

- Investigate a documented CURE ID data interface or request permission from its
  maintainers. Public browsing alone does not authorize an undocumented scraper.
- Use PsyTAR as the first openly licensed treatment-review fixture, while
  preserving its narrow four-drug, historical scope.
- Evaluate Open Humans projects only when their public-data guidelines and the
  relevant member/project permissions support the proposed use.

None of these external opportunities blocks Phase 1.
