# Longitudinal-evidence preservation and phenotype–etiology audit

## Authority and scope

The owner supplied a domain-general correction for individual-case causal
reasoning on 2026-09-10. The exact repository baseline was `origin/main` at
`2b2426a8794c8d65aa9adedbc3f40d66c68ceb44`. Relevant universal patterns were
retrieved from `u-dont-existDOTcom/universal-dev-architecture` `origin/main` at
`764be99e4c7e9a324ea497d495d274b644b4694a`: whole-argument reconstruction,
source/interpretation provenance, transformation preservation, and task-time
lesson activation.

The active independent semantic-review DEVELOPMENT evaluation is intentionally
unchanged and remains frozen on its original protocol baseline. This candidate
does not rerun, regenerate, score, or reinterpret any evaluation artifact.

## Existing overlap

- Universal 20.5.22 already required evidence-direction prediction, positive
  versus tolerated-control specificity, target/estimand preservation, and
  exact update reporting.
- HRP 20.5.27 already preserved chronology, recurrence, dechallenge/rechallenge,
  dose/form, treatment response, functional outcomes, patient-specific safety,
  and direct clinical-management actions across their applicable modules.
- The patient-story v0.1 record already stores timeline, exposure, outcomes,
  adverse events, measurements, source documents, treatment response, and
  dechallenge/rechallenge. The v0.2 extension preserves recurrence roles,
  sampling status, source text, exceptions, uncertainty, and information-gain
  decisions.

## Defects found

1. No canonical gate required workers to bind the three to seven strongest
   longitudinal observations into one source-linked constraint set before an
   individual-case differential.
2. A photograph, morphology, diagnostic label, common pattern, biomarker, or
   other cross-sectional observation could become an implicit etiologic answer
   even when it explained less of the supplied trajectory.
3. Hypotheses were not required to predict every selected longitudinal
   constraint, so compatibility with a salient appearance could outrank a more
   complete causal explanation without a stated reason.
4. Later correction handling did not explicitly distinguish genuinely new
   evidence from reweighting or semantic recovery of evidence that had been
   available all along.
5. The frozen v0.2 patient-story evidence method had no fields or human-interface
   controls for these constraints. Editing it in place would violate the
   pre-collection version rule.

## Changes

- Universal 20.5.23 extends the existing Evidence-Discrimination Gate with a
  3–7-observation high-information check and a phenotype–etiology firewall. Its
  correction and point-of-generation rules classify later updates accurately.
- HRP 20.5.28 extends the root Patient-History and Recurrence-Evidence Gate with
  a source-linked longitudinal constraint map, complete-pattern hypothesis
  predictions, phenotype/etiology separation, update classification, the
  `ImageOverridesLongitudinalHistory` regression, and FinalSelfCheck items
  FS205–FS206.
- The Project router activates those canonical rules before a fresh worker
  generates an individual-case differential and remains below the 8,000-
  character installation limit.
- Patient-story method and evidence extension v0.3 add typed and generated
  ledgers for longitudinal constraints, phenotype observations, hypothesis
  predictions, and later-update classification. The contract blocks missing
  constraint coverage, unlinked evidence, silent phenotype-to-etiology
  promotion, and a conflicting hypothesis outranking a complete-pattern fit
  without an explicit reason.
- Focused regressions protect the protocol semantics, Project activation,
  generated contract, and historical byte identities.

## Intentionally unchanged

- Patient-story v0.1 and v0.2 source, method, generated schema, and prior records
  are not modified, migrated, or reinterpreted.
- The public evidence-gap form and frozen study-specific collection surfaces do
  not perform individual-case causal ranking and remain unchanged.
- Existing Universal specificity, evidence-direction, target, estimand,
  comparison, interview, and phase controls remain in force.
- Existing HRP clinical-management, patient-safety, Dose-Regime, forum,
  benchmark-target-integrity, privacy, and scientific gates remain in force.
- No disease, image diagnosis, exposure, treatment class, or intervention is
  hard-coded as a production causal rule. The regression is de-identified and
  tests only the generalized evidence architecture.

## Version and migration boundary

The fail-closed migration accepts only Universal 20.5.22 SHA-256
`d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`,
HRP 20.5.27 SHA-256
`65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`,
and Project router SHA-256
`143e17ecffb330f98a0be85f52c0cd284a05d0ca08f325afd9443054bb9efc43`.
It produces Universal 20.5.23 SHA-256
`321686bf6cfb718ecef6ae4887a4691f0969304caedbbabee2c97ee19afaa303`,
HRP 20.5.28 SHA-256
`bb886e1e1874eeba1d645b773937043c7d9d88c84a3427ad7c0fe7f4a9be713f`,
and Project router SHA-256
`b34ddb6cffbbadafd8981ccb887247c24390c017133ba4791e2c49a4793ffcf0`.

No prior-data migration is required because no collection pass used the v0.2
method. Future collection or human review must use a v0.3 human-facing surface;
the JSON schema remains a machine interchange format rather than the annotation
interface.

## Validation

Validation used the exact final candidate bytes. The repository runtime is Node
24.18.0.

- `git diff --check`: passed.
- Focused Vitest execution across the new regression and 16 affected protocol,
  router, manifest, release, and orchestration suites: 17 files passed; 211
  tests passed.
- The focused affected suite passed with 17 files and 211 tests. The especially
  slow `controlled-research-route.test.ts` also passed all 16 tests alone under
  Node 24.18.0.
- On this HDD-backed workstation, the exact Node 24.18.0 `npm run verify`
  reaches the full Vitest run but times out in pre-existing 10-second route
  tests when 160 files compete concurrently. The same unmodified command on a
  clean `origin/main` worktree fails in the same file for the same timeout-only
  reason, while the file passes alone. This candidate changes no route logic or
  timeout. Exact-head GitHub Actions remains the authoritative concurrent full
  gate.
- Under Node 24.18.0 with local Vitest scheduling constrained to one worker,
  the complete unchanged test population passed: 159 files passed, one
  skipped, 1,898 tests passed, and six skipped. Node 24 TypeScript checking and
  the complete package build also passed.
- As a supplemental run, the complete gate passed under the workstation's
  default Node 26.8.1: TypeScript checking succeeded; Vitest reported 159 files
  passed, one skipped, 1,898 tests passed, and six skipped; then the complete
  package build succeeded. This does not replace the required Node 24 CI gate.
- Both canonical protocol files parsed as XML. Their final byte hashes match
  the receipts above and the current README/package manifests.
- The migration was replayed from an `origin/main` archive. It produced exact
  byte matches for Universal, HRP, and the Project router, then produced the
  same files and receipts on a second idempotence run.
- `npm run generate:patient-story-evidence-schema` reproduced the committed
  v0.3 schema without drift. Its SHA-256 is
  `bcbfe657e5aede0d39b823d181601f8421ce447f8c1ff149d02cd4d3fe9afac7`.
- Frozen v0.1 and v0.2 artifacts retained their pre-change SHA-256 receipts in
  the focused regression suite; no historical bytes or prior records changed.
