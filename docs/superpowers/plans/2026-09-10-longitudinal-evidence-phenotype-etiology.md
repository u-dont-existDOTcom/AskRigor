# Longitudinal evidence and phenotype–etiology integration plan

## Goal and authority

Integrate the owner-supplied longitudinal-evidence preservation and
phenotype–etiology firewall into AskRigor's current canonical reasoning,
clinical, project-routing, and pre-collection patient-story layers. The source
baseline is `origin/main` at
`2b2426a8794c8d65aa9adedbc3f40d66c68ceb44`: Universal 20.5.22 SHA-256
`d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`
and HRP 20.5.27 SHA-256
`65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`.

The current independent semantic-review DEVELOPMENT evaluation remains frozen
on its own branch and protocol baseline. This change must not alter, regenerate,
or influence that run before its consumer outputs are frozen and scored.

## Existing overlap and exact defect

- Universal already requires the highest-information qualifiers and tolerated
  controls before causal ranking, but does not require an individual-case
  longitudinal constraint map or protect that map from a salient cross-sectional
  label.
- HRP already preserves chronology, recurrence, dechallenge/rechallenge,
  treatment response, function, and source-specific attribution across several
  modules. Its patient-history gate does not bind those facts together before a
  differential, separate phenotype from etiology, or classify a later change as
  new evidence versus correction of evidence that was present all along.
- Patient-story v0.1 and evidence extension v0.2 can store the underlying facts.
  The v0.2 method cannot represent the 3–7 load-bearing longitudinal constraints,
  hypothesis-by-constraint predictions, phenotype-only findings, or later-update
  classification needed to enforce the new rule.

## Authorized changes

1. Advance Universal to 20.5.23 by extending the existing
   `evidence_discrimination_gate`, correction behavior, and point-of-generation
   check. Preserve all earlier gates and historical revisions.
2. Advance HRP to 20.5.28 by extending
   `PatientHistoryAndRecurrenceEvidenceGate`, the correction protocol, regression
   cases, version discipline, and final self-checks. Preserve all clinical
   management, safety, Dose-Regime, comparison, and benchmark-integrity rules.
3. Update the compact Project router so a fresh worker activates the canonical
   gate before an individual-case differential while remaining below 8,000
   characters.
4. Preserve patient-story v0.1 and v0.2 bytes. Create a v0.3 method and generated
   evidence contract that adds the causal-constraint, phenotype/etiology, and
   evidence-update ledgers without reinterpreting prior data.
5. Add focused semantic and contract regressions, including the de-identified
   image-overrides-longitudinal-history case. Synchronize only current protocol
   manifests and receipts from the final exact XML bytes.
6. Record the overlap, defect, changes, intentionally unchanged surfaces, and
   version boundary in a concise audit.

## Active lesson contract

| Lesson | Trigger and required behavior | Failure condition | Enforcement |
| --- | --- | --- | --- |
| Whole-argument reconstruction | Current protocols already distribute chronology, recurrence, specificity, and correction rules. Trace and extend their real homes. | A duplicate root architecture or an existing stronger rule is weakened. | Semantic + focused tests |
| Transformation preservation | Treat the two exact XML files and frozen v0.1/v0.2 contracts as the baseline; every changed byte must trace to this owner correction or current-receipt synchronization. | Historical version text or frozen contract bytes drift; unexplained files change. | Hash receipts + diff audit |
| Source/interpretation provenance | Keep observations, phenotype descriptions, etiologic claims, and later interpretations as distinct records. | A morphology/label becomes causal evidence without an independent bridge, or old evidence is called new. | Schema invariants + regressions |
| Task-time activation | Put the rule at the point of differential generation and later update, not only in an audit document. | Future workers can read the audit yet bypass the behavior. | Canonical protocols + Project router + self-checks |

## Validation

- Validate XML and exact version/date/hash manifests.
- Prove patient-story v0.1 and v0.2 remain byte-identical.
- Regenerate v0.3 JSON Schema from its typed contract and require a clean diff.
- Run focused longitudinal/interview/project/protocol/MCP tests.
- Run `git diff --check` and full `npm run verify` on Node 24.18.0.
- Inspect `git diff origin/main...HEAD` for scope, historical-receipt drift, and
  accidental evaluation changes.
