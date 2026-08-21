# Treatment-landscape selection-lock audit

Date: 2026-08-21

## Validated failure

The prior hip review deeply retrieved two selected YouTube discussions but
treated that depth as though it established broad treatment coverage. The
selection frame remained concentrated in generic exercise and surgery-related
material even though materially different exercise programs, aquatic activity,
nutrition, injections, multimodal programs, nonaction, progression, and
eventual-surgery trajectories were discoverable.

This is a selection failure, not a pagination failure. Exhausting more comments
inside the same narrow sources cannot repair it.

## Implemented invariant

Broad treatment synthesis now requires two independent conditions:

1. the selected source set spans the materially plausible treatment/program
   space; and
2. each selected creator/discussion source reaches its applicable transcript and
   public-discussion completion state.

The deterministic `assess_treatment_landscape_coverage` Action derives separate
selection, per-video-depth, and overall locks from receipt-linked discovery
batches, reciprocal candidate/class/fingerprint records, normalized program
signatures, stable channel IDs, selected videos, deterministic projections of
the actual transcript/comment receipt shapes, directional searches, formal
return passes, omission impact, expansion state, and terminal-versus-retryable
access boundaries. Counts come only from valid reconciled records; invalid IDs
are returned separately. It is Action-only, public, read-only, strictly
schema-bound, and does not change the frozen 17-tool MCP surface. A pass means
only that the supplied ledger is internally consistent and has no configured
blocker; it does not independently establish semantic completeness,
representativeness, efficacy, safety, causality, or a medical recommendation.

## Enforcement

- HRP 20.5.19 adds `TreatmentLandscapeAndVideoSelectionGate`, the aggregate
  lock, ledger fields, final checks, and the exact owner-specified regressions
  `ManyVideosButOneTreatmentClass` and
  `TwoVideosPresentedAsBroadHipCommunityAudit`.
- The Project router, Forum Signal module, plugin skill, and generated Custom
  GPT Instructions require broad discovery before deep auditing, exact program
  fingerprints, bidirectional reopening, a plain-language **Videos actually
  audited** record, and the Action's three locks before broad synthesis. MCP and
  Project surfaces use an explicit fail-closed local fallback when the
  Action-only assessor is not advertised; the generated Custom GPT must call it.
- Planning ranges—20–40 screened candidates, at least eight hypotheses, and
  about 8–15 deep audits spanning at least six fingerprints when available—are
  warnings rather than evidence quotas. Decision-relevant omissions create the
  hard block.
- Renamed IDs cannot manufacture diversity: exact program tuples are normalized
  and hashed, while source independence uses stable channel IDs. Unitemized
  aggregate screen counts are gone; candidate counts are derived from the
  reciprocal discovery ledger.
- Caller-supplied corpus-size or scope labels cannot waive structural gates.
  A valid ledger with at least 20 candidates derives substantial-corpus state,
  and any broad selection of four or more videos concentrated in one or two
  normalized fingerprints blocks regardless of the caller label.
- Transcript continuation is bound to a one-hour, unguessable Action handle and
  server-held chain state. The Action rejects raw provider cursors, skipped or
  lone continued pages, mismatched tracks/snapshots/sources, replay, and mixed
  restart counts; only one contiguous first-page-to-terminal chain can produce
  the cumulative completion receipt. Retryable failures preserve the same
  handle without incrementing cumulative counts.
- A supported not-decision-relevant omission is a warning. Confidence-,
  ranking-, conclusion-changing, or uncertain omissions block. This avoids both
  silent omission and a select-everything quota.
- A genuine access boundary permits only a bounded non-ranking answer after it
  is terminal, nonretryable, and recovery has been attempted. Partial,
  rate-limited, retryable, or otherwise executable states require continued
  work. Missing material is not negative evidence.

## Privacy and transport

The controller performs no provider call and stores no state. Its larger
65,536-byte request cap applies only to this strictly validated read-only route;
existing Action request limits remain unchanged. The output avoids echoing the
candidate ledger and repeats only compact selected-video records so an accepted
15-video request remains within the 60,000-byte response cap.

The transcript Action keeps only typed continuation metadata for at most one
hour, 2,048 entries, and 4 MiB. It stores no caption text and never exposes the
provider cursor. Expired, evicted, malformed, or replayed handles fail closed
and require a clean restart of that video/language chain.

## Local verification

- Focused instruction-contract suite: 47/47 passed. Focused transcript,
  OpenAPI, and controller suite: 45/45 passed; the independent review's wider
  repaired-surface suite passed 83/83.
- Complete deterministic gate: typecheck and build passed; 64 test files passed,
  one declared live-provider file was skipped; 1,024 tests passed and five
  declared credential/live skips remained.
- Public-site source validation covered four pages; the deployment-boundary
  suite passed 28/28.
- `git diff --check` passed. The first adversarial review's eight bypasses and
  the follow-up review's skipped-transcript-chain and caller-label bypasses were
  repaired before these final gates; final independent re-review is recorded in
  the pull request.

The parallel full suite twice exposed a pre-existing five-second timeout in the
live-suite evidence-mount shell test while all other tests passed. The exact
test passed in isolation; its scoped timeout was raised to 15 seconds without
changing any assertion, then the exact complete gate passed.

These are source-candidate checks. They do not establish deployment, Custom GPT
editor installation, or fresh product-interface behavior.

## Lesson disposition

General lesson: deep inspection cannot repair a narrow selection frame; breadth
coverage and per-source depth need separate mechanically enforced gates.

The domain-neutral form is being promoted to
`u-dont-existDOTcom/universal-dev-architecture` as
`patterns/coverage-before-depth-in-selection.md`. Exact AskRigor merge and pull-
request provenance will be added there only after this change passes review and
merges.
