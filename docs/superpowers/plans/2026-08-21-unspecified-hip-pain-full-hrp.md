# Unspecified hip pain full-HRP research plan

**Goal:** Complete a diagnosis-contingent AskRigor evidence synthesis for the
de-identified question `how can i fix my bad hip`, using the accepted Gemini
candidate packet and completed three-pool comment audit as inputs rather than as
verdicts.

## Optimized question and assumptions

For an adult with persistent hip pain or major functional limitation but no
specified diagnosis, what diagnosis-first pathway and intervention options best
improve pain and function without delaying time-sensitive care? Compare
nonaction/natural history, load-managed rehabilitation and education,
weight/activity adaptation, medications, corticosteroid or other injections,
orthobiologics, diet/supplements/devices/topicals, and surgery by diagnosis,
structural stage, outcome, time horizon, risks, cost, reversibility, and real-
world implementation.

Working assumptions:

- the prompt is de-identified and not an emergency report;
- age, duration, trauma history, pain location, examination, imaging,
  comorbidities, medications, and functional baseline are unknown;
- no diagnosis, structural regeneration, or surgical indication will be
  inferred from “bad hip”; and
- the deliverable is a safe decision framework, not individualized diagnosis or
  a substitute for examination.

## Applicable-module ledger

- `HRP`: `REQUIRED`.
- `DIRECT_HUMAN`: `REQUIRED` for benefits, failures, harms, tolerability, and
  recovery trajectories.
- `EXTENDED_GREY`: `REQUIRED` because rehabilitation protocols, practice
  guidance, devices, supplements, and regenerative claims are material.
- `FORUM_SIGNAL`: `REQUIRED` for a practical treatment decision, surgery
  avoidance, adherence, harms, and implementation differences.
- `BIDIRECTIONAL_ITERATION`: `REQUIRED` because community-derived regimens and
  stage discriminators must redirect formal searches, and formal findings must
  return as targeted community questions.
- `FINAL_COMPLETION_AUDIT`: `REQUIRED` before synthesis.

## Option-space ledger

1. Diagnosis alternatives and urgent/time-sensitive pathways.
2. Nonaction, watchful waiting, natural history, and opportunity cost.
3. Education, pacing, assistive devices, exercise, progressive loading,
   strengthening, mobility work, and condition-specific rehabilitation.
4. Weight management, general activity, sleep adaptation, and other lifestyle
   measures.
5. Topical/oral analgesic and anti-inflammatory medication.
6. Corticosteroid, hyaluronic-acid, and other conventional injections.
7. PRP, stem-cell, prolotherapy, and other orthobiologic procedures.
8. Diet, glucosamine/chondroitin, collagen, omega-3, and other supplements.
9. Heat, photobiomodulation, topical castor oil, traction, and other adjuncts.
10. Hip arthroscopy where diagnosis-specific and total hip replacement where
    clinically indicated, including rehabilitation and complication tradeoffs.

## Source and execution plan

- Acquire 4–6 current authoritative guidelines or decision resources.
- Acquire 8–12 recent systematic reviews/meta-analyses and 6–10 decisive human
  trials across the option space; inspect exact populations, programs,
  comparators, outcomes, follow-up, attrition, crossover, funding, and conflicts.
- Search trial registries for unresolved or active intervention questions.
- Expand YouTube to at least two independent relevant discussion pools for every
  material community signal when feasible, and search at least one independent
  non-YouTube community.
- Preserve creator-content claims only when transcript-backed; otherwise retain
  the recorded transcript access boundary.
- Transfer community findings on glute-focused dosing, diagnosis/stage mismatch,
  injection flare, sequential care, supplement cointerventions, and surgery
  recovery into formal searches.
- Return formal findings on diagnosis, expected benefit windows, adverse events,
  and intervention eligibility into targeted community searches.
- Stop only after terminal retrieval states and two consecutive wider passes add
  no decision-changing intervention, discriminator, contradiction, or
  actionability change.

## Completion gates

- [x] Safety and diagnosis-alternative boundary complete.
- [x] Formal, grey, and registry source ledgers complete.
- [x] Forum Signal acquisition and directional fields complete or terminally
  access-bounded.
- [x] Community-to-formal and formal-to-community transfers complete.
- [x] Major options decomposed by exact program, stage, outcome, and horizon.
- [x] Risk/cost/reversibility, opportunity cost, measurement, stop, and
  escalation rules complete.
- [x] Final module rerun permits synthesis.
- [x] Research report, sources, receipts, repository verification, and local
  commit complete without push or deployment.

## Execution closeout

- Primary synthesis:
  `docs/audits/2026-08-21-unspecified-hip-pain-full-hrp.md`.
- Machine-readable source and acquisition ledger:
  `docs/audits/2026-08-21-unspecified-hip-pain-source-ledger.json`.
- Six terminal YouTube discussion pools were used without persisting raw
  comments or identities. One pool retained its declared moving-pagination
  access boundary while passing the synthesis lock.
- Two broader evidence-frontier passes added no decision-changing option or
  contradiction. Creator transcripts remained terminally inaccessible through
  the required Chrome-only path and were excluded from claims.
- The host-boundary deterministic gate passed typecheck, 59 test files with one
  declared skip, 979 tests with five declared skips, and build. The sandbox-only
  attempt was non-evidentiary because loopback and IPC binds were denied with
  `EPERM`; the exact host rerun passed.
