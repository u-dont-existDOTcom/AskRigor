# Spark candidate-quality repair plan

**Goal:** Restore Gemini Spark as AskRigor's optional high-recall YouTube
discovery lane, preserve its useful provisional video understanding, and make
specific-program relevance—not generic class coverage or raw video count—the
selection gate on every treatment landscape.

## Owner correction and failure diagnosis

- The 2026-08-22 product answer found more videos but still selected weak or
  generic candidates and collapsed materially different implementations under
  labels such as exercise.
- This is not a hip-specific exception. The defect applies whenever an umbrella
  class hides materially different programs, populations or stages, outcomes,
  and time horizons.
- The retired staged Spark skill found useful real videos. Its primary failure
  was unsupported audit precision—self-reported counts, joins,
  classifications, evidence maps, and metadata—not that every provisional
  creator summary was unusable.
- The candidate-only replacement overcorrected by shrinking discovery and
  omitting the program/stage/outcome detail AskRigor needed for good selection.

## Existing-work and reuse decision

- Universal's `coverage-before-depth-in-selection` pattern already requires a
  material class inventory, decision-relevant fingerprints, unknown-state
  preservation, and separate selection/depth locks.
- AskRigor already has strict Gemini packet parsing, independent YouTube
  identity validation, transcript retrieval, discussion auditing, and a
  deterministic treatment-landscape controller.
- Direct Gemini video summaries were previously useful on five real videos but
  were explicitly not evidence of efficacy or truth. Ungrounded generation of
  YouTube identifiers failed and remains forbidden.
- **Disposition:** compose. Extend the existing provisional handoff and its
  deterministic validator; do not restore the staged packet's pseudo-audit
  ledgers and do not invent a condition-specific taxonomy.

## Acceptance criteria

- [x] Spark runs iterative, nonredundant discovery from umbrella classes into
  specific program hypotheses and relevant population/stage, outcome, and
  horizon vocabulary.
- [x] The Spark contract emits a broader candidate set with provisional
  specific-program, population/stage, outcome/horizon, and summary-basis fields.
- [x] Spark summaries are usable for candidate discovery when AskRigor cannot
  retrieve captions, but are plainly labeled as not transcript-verified and
  cannot support efficacy, safety, causal, comparative, or recommendation
  claims.
- [x] Generic terms such as exercise, PT, diet, injection, or conservative care
  cannot satisfy specific-program candidate quality.
- [x] Independent YouTube metadata validation remains mandatory; invented or
  mismatched identifiers, titles, channels, or links remain rejected.
- [x] A public read-only Custom GPT Action validates a pasted Spark handoff in
  one call and returns the validated provisional candidate frontier.
- [x] Custom GPT and Codex plugin instructions prioritize every validated Spark
  candidate for program/stage/outcome screening before substituting generic
  native search results.
- [x] Canonical HRP and Forum Signal rules are condition-agnostic and contain
  regression cases for many generic candidates missing specific implementations
  and for discarding useful provisional scout leads solely because captions are
  unavailable.
- [x] Privacy, Action schema, Custom GPT sync, release evidence, and recovery
  state are updated without retaining user prompts, packets, summaries, or
  provider output.
- [ ] Focused tests, mutation-style negative cases, the full deterministic gate,
  site/deployment checks, independent review, PR checks, merge, production
  deployment, plugin reinstall/receipt comparison, and Custom GPT installation
  are completed or left at an exact external boundary.

## Execution sequence

1. Extend the Spark packet and deterministic validator with backward-compatible
   legacy support and a richer current contract.
2. Add the bounded public read-only Action and deterministic OpenAPI coverage.
3. Rewrite the Spark skill around specific-program candidate quality and
   provisional-summary boundaries.
4. Update HRP, Forum Signal, Project/Custom GPT, and plugin instructions with
   condition-agnostic selection and fallback rules.
5. Add regressions, regenerate manifests and Custom GPT artifacts, then run
   focused and complete verification.
6. Review, close the lesson loop, merge, deploy, synchronize the installed
   plugin, and prepare the exact Spark and Custom GPT installation artifacts.

## Rollback and boundaries

- Preserve `origin/main` at `d4f2af0f86844c743b3b5fbc6c70f66c72a4637d`
  as the starting rollback point.
- Do not let Spark-generated identifiers bypass provider validation.
- Do not treat a provisional summary as creator-content evidence merely because
  it is usually accurate.
- Do not claim transcript verification when captions were not retrieved.
- Do not automate or focus browser windows without renewed owner authorization.
