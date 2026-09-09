# Interview-evidence and information-gain audit (2026-09-08)

## Source lesson and supplied method review

The controlling lesson is universal-dev-architecture draft PR #84 at head
`1a7c1d02b9c6bae919704cf2b3b6c86025881aa2`:
`patterns/interview-evidence-information-gain.md`, SHA-256
`723d6d129e883c561f0699fa96c10ad6e04da379b0244da179359a789b792958`.

Before changing AskRigor, the audit also inspected the owner-supplied Life
Patterns interview v4 package and HumanDesign draft PR #24 at head
`85e665d4e8edaa20728fac314e4f59c19fa0e41b`: the interview-methods shortlist,
full-text adaptation, recurrence-evidence v2 policy and prior-work scan,
plain-language calibration guide, and human-calibration UI requirements. Those sources
already separate general patterns from bounded incidents, reject fabricated
precision, preserve exact source/provenance, route follow-ups by material
uncertainty, and require a usable theory-neutral human interface. Their newer
recurrence correction identifies the episode-centric rule as a pre-collection
method defect and preserves the old frozen method for history.

## Existing AskRigor overlap

- Universal already enforced evidence direction, positive-versus-control
  specificity, target and estimand preservation, phase routing, source
  authority, and minimizing unnecessary questions.
- HRP already preserved chronology, solicitation method, denominators,
  patient-versus-episode counting, deduplication, adverse-event ascertainment,
  dose/formulation, and the boundary between anecdotes and population claims.
- Patient-story v0.1 already treated a story as patient-reported evidence rather
  than causal proof and preserved strict privacy, consent, combination, and
  release rules.
- The public evidence-gap form already takes an open narrative before optional
  structured prompts, accepts incomplete reports, and includes non-remission
  controls. It does not impose a confirming-example quota.

## Defects found

1. The canonical protocols did not preserve generalized symptom or behavioral
   recurrence as a distinct evidence role. A worker could treat “every time” as
   valueless without an incident, or treat a selected incident as independent
   frequency support.
2. Recurrence follow-up had no canonical exception-first order or explicit
   protection against silently retaining exceptionless “always” after an
   exception was acknowledged.
3. Evidence roles, valid opportunity sampling, trait-versus-behavior separation,
   and the information gain of nonmandatory questions were not represented in
   the generic patient-story contract.
4. Patient-story v0.1 exposes machine interchange fields but no method-level rule
   preventing raw serialization from becoming a human annotation interface.
5. No AskRigor layer explicitly required a versioned, theory- or target-blind
   repair when a load-bearing collection defect is found before collection.
6. The first local v0.2 contract candidate treated every observation from a
   defined sampling frame as statistically independent. That was too strong for
   repeated or clustered observations; the reviewed contract now preserves
   independent, dependent/clustered, or unknown dependence separately.

## Changes

- Universal 20.5.22 adds one Interview-Evidence and Information-Gain Gate and
  merges compact independence, follow-up, and supplied-method clauses into the
  existing reasoning selector.
- HRP 20.5.26 applies that gate to patient history, symptom/adverse-effect
  recurrence, behavioral/lifestyle history, surveys, extraction, and health
  dialogue, including the “every time I eat X” regression.
- `project/PROJECT_INSTRUCTIONS.md` activates the canonical rules for fresh
  AskRigor workers.
- `patient-story-evidence-extension-v0.2.0.json` and its typed contract add an
  append-only, hash-linked evidence-role and follow-up ledger. The generator is
  deterministic and the tests compare its output to the checked-in schema. A
  sampling frame is required for opportunity-frequency observations but does
  not itself prove statistical independence.
- `patient-story-interview-method-v0.2.0.md` defines the human flow, ordinary
  controls, sampling boundary, export mapping, and pre-collection version gate.
- Focused tests protect current protocol structure, historical protocol receipts,
  evidence-role invariants, schema synchronization, and v0.1 byte identity.

## Intentionally unchanged

- `docs/patient-story-intake-contract-v0.1.0.json` and
  `packages/contracts/src/patient-story.ts` remain byte-identical. Existing
  records are not backfilled or reinterpreted.
- Frozen MAST, Life Patterns, HumanDesign, calibration, and previously collected
  artifacts remain unchanged.
- The study-specific public evidence-gap form remains unchanged because it does
  not contain the audited quota/recurrence defect; expanding it would change a
  frozen study-specific collection surface.
- Study/review audit JSON contracts remain machine-to-machine validation
  contracts. This change does not relabel them as human interfaces or start a
  human annotation pass.
- Existing HRP episode, forum, privacy, consent, Dose-Regime, comparison,
  specificity, evidence-direction, and causal-attribution controls remain active.

## Version and migration boundary

The fail-closed protocol migration accepts only the exact PR #198 canonical
inputs: Universal 20.5.21 SHA-256
`c85378c9993731bf93daa65a9d49438d25b1008e065bd3eb9aaac215c0af1426`
and HRP 20.5.25 SHA-256
`2da6edf410c54182b3aa333d7cf9e9a11c24cf86138dfcaa508b019e3a84e2e9`.
It produces Universal 20.5.22 and HRP 20.5.26 and synchronizes current manifest
consumers from the resulting bytes. Historical revision expectations are not
globally replaced.

The patient-story change is an additive v0.2 evidence extension linked to a
v0.1 story by ID and exact payload digest. `prior_data_reinterpreted` is fixed to
false. No data migration is required because no AskRigor collection pass used
this extension or the defective recurrence rule. Before a future human reviewer
pass, its actual form/review surface must satisfy the ordinary-control contract;
the JSON schema itself is not that interface.

Canonical output receipts and validation results are recorded in the pull
request after generation and full verification.
