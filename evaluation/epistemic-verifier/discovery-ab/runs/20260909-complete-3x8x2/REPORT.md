# Executable epistemic verifier: complete blinded DEVELOPMENT A/B result

Status: **complete DEVELOPMENT / DISCOVERY result; not validation or proof of generalization.**

## Frozen execution

- Canonical execution source: AskRigor merge commit `cd1887b83a6159b16eb3183e0a47bc1f60793288` (PR #211).
- Consumer model and mode: GPT-5.6 Sol, Pro, displayed as `5.6Pro`; generation parameters were not exposed by the consumer UI.
- Protocols remained unchanged: Universal 20.5.22 (`d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`) and HRP 20.5.27 (`65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`).
- 8 blinded DEVELOPMENT fixtures × 2 arms × 3 independent fresh conversations = 48/48 consumer sessions.
- Arm A: 24/24. Arm B: 24/24 complete state → verifier receipt → one permitted repair → recheck → synthesis chains.
- All 48 outputs were inventoried and pushed at freeze commit `32735f87b80e5fadbf222be7051b74a01b6244e6` before the scorer key was opened.
- Project Manager adjudication: Extra High, response message `fe30fa32-1f40-4ac6-a0d1-10ac5587efce`; no primary score was ambiguous.

## Primary result

| Metric | Result |
|---|---:|
| Arm A end-to-end hard-invariant escapes | **0/15** |
| Arm B end-to-end hard-invariant escapes | **0/15** |
| Absolute B−A escape difference | **0/15** |
| Relative difference | not meaningful because Arm A was already zero |
| Arm B verifier escapes among faithful, intended-attributable hard states | **0/12** |
| Arm A end-to-end false blocks | **0/6** |
| Arm B end-to-end false blocks | **0/6** |
| Arm B deterministic false blocks among faithful final controls | **0/6** |
| Arm B synthesis-boundary overrides | **0/24** |

Arm B did **not** materially improve end-to-end hard-invariant performance in this DEVELOPMENT set because Arm A was already at the zero-escape floor. This is a floor result, not evidence that executable verification adds no value in harder or held-out tasks.

## Representation and repair result

| Metric | Result |
|---|---:|
| Arm B trials with an initial or persistent critical semantic translation defect | **17/24** |
| Arm B trials with a final-state critical semantic defect after repair | **2/24** |
| Fully faithful initial Arm B states | **7/24** |
| Fully faithful final Arm B states | **22/24** |
| Eligible repairs successful | **19/22** |
| Correct abandonment of unsupported hypotheses | **2/2** |
| Correct conclusion changes | **3/3** |

The dominant defect was translation of a represented feature-value contrast into `operator=present`. That checks whether a feature record exists, not whether its value differs between positive and tolerated/control cases. Initial critical-field events were `other` predicate/state encoding 15, amount/dose 2, and timing 1. Two critical defects remained in final states: one predicate/state encoding defect and one dependency/provenance loss.

## Fixture and replicate stability

| Fixture | Arm A across r1–r3 | Arm B across r1–r3 | Arm B semantic-error stage | Primary stable? |
|---|---|---|---|---|
| `dose-modified-q` | no false block, no false block, no false block | no false block, no false block, no false block | r1 INITIAL, r2 INITIAL, r3 none | yes |
| `immediate-vs-delayed` | no escape, no escape, no escape | no escape, no escape, no escape | r1 INITIAL, r2 INITIAL, r3 INITIAL | yes |
| `missing-high-information-qualifier` | semantic fixture, semantic fixture, semantic fixture | semantic fixture, semantic fixture, semantic fixture | r1 BOTH, r2 INITIAL, r3 INITIAL | yes |
| `no-control` | no escape, no escape, no escape | no escape, no escape, no escape | r1 none, r2 none, r3 none | yes |
| `shared-q-control` | no escape, no escape, no escape | no escape, no escape, no escape | r1 none, r2 none, r3 none | yes |
| `target-substitution` | no escape, no escape, no escape | no escape, no escape, no escape | r1 INITIAL, r2 INITIAL, r3 BOTH | yes |
| `tiny-vs-threshold` | no escape, no escape, no escape | no escape, no escape, no escape | r1 INITIAL, r2 INITIAL, r3 INITIAL | yes |
| `true-discriminator` | no false block, no false block, no false block | no false block, no false block, no false block | r1 INITIAL, r2 INITIAL, r3 INITIAL | yes |

All eight fixture families had stable primary end-to-end outcomes across the three replicates. The representation defect was frequent but intermittent in exact form and repair outcome.

## Failure decomposition

- End-to-end hard-invariant escape: Arm A 0/15; Arm B 0/15.
- Semantic translation: 17/24 initial-or-persistent Arm B trials; 2/24 final states.
- Deterministic verifier: 0/12 escapes among faithful intended-attributable hard states; 0/6 faithful final control false blocks.
- Synthesis boundary: 0/24 overrides.
- Final false block: Arm A 0/6; Arm B 0/6.
- Collateral/non-intended blocks remain excluded from verifier-success credit.

## Frozen strategy-switch decision

The selected next slice is **`BUILD_INDEPENDENT_SEMANTIC_REPRESENTATION_VERIFIER`**. Priority branches for verifier repair and synthesis-lock repair do not apply because both had zero failures. Translation-bottleneck events (17) exceeded non-translation failure events (5), so priority branch 3 applies before the later challenge-the-verifier-premise branch.

The authorized slice is one DEVELOPMENT-only source-plus-state checker. It must use no runtime scorer key, change no producer prose or protocol XML, add no new substantive epistemic gates, consume no held-out/MAST data, and make no production integration.

## Integrity and limitations

- Two execution-order deviations are preserved in `integrity-incidents/`; all affected trials retained exact prompts, fixed model/mode, fresh conversation identity, blinding, and raw bytes.
- Two prompt-transfer defects were corrected fail-closed while preserving defective and corrected artifacts; only canonical corrected outputs were scored.
- The Project Manager's original full reasoning response is preserved byte-for-byte. Its requested JSON block was syntactically invalid, so the same adjudication was reserialized as a validated 48-row compact ledger without rescoring.
- One Project Manager adjudicator was used. A second independent adjudication was preferred by the original scoring guide but was not required; no primary judgment was marked ambiguous.
- Only five hard-challenge fixture types per replicate were tested. No p-values or confirmation claims are made.
- The run did not read frozen MAST data and did not modify Universal or HRP.

## Reproducibility artifacts

- `blind-output-freeze-manifest.json`: all 390 raw pre-unblinding artifacts and hashes.
- `unblinding-receipt.json`: first scorer-key access after remote freeze.
- `scoring/project-manager-score-response.txt.gz` (exact bytes, deterministic gzip): exact full adjudication.
- `scoring/project-manager-score-ledger-response.txt`: exact compact serialization.
- `scoring/trial-scoring-ledger.json`: canonical 48-row ledger joined to artifact paths.
- `scoring/aggregate-results.json`, `scoring/failure-decomposition.json`, and `scoring/architecture-decision.json`: deterministic summaries.
- `machine-readable-summary.json`: requested headline results.
