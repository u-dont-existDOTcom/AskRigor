# Independent Semantic Representation Review v0.1 — full DEVELOPMENT result

This was a blinded `DEVELOPMENT / DISCOVERY` evaluation. It is not held-out
validation, does not establish generalization, and does not authorize production
integration.

## Frozen population and provenance

- 46 candidate states: 24 natural initial Arm B states and 22 controlled-mutation states.
- 138 eligible reviews: three fresh consumer conversations per candidate.
- 141 accepted consumer sessions: 138 eligible and three preserved operational exclusions.
- 135 contract-valid reviews and three preserved invalid reviews.
- 138 distinct controller-observed eligible conversation identities.
- 135 reviews used `gpt-5-6-thinking` with the visible `GPT-5.6 Sol` / `Extra High` control. Trials 104–106 used `gpt-6-pro` after an automatic product-side transition; the original model returned at trial 107. Those three trials remain separately identifiable in the ledger.
- The complete output population was frozen and pushed at commit `c634ea51df349eda5db71df315daf7a455bbe2c6` before scorer-gold access. Population inventory SHA-256: `ad979084a20b810993404be67a609a389d02979e5a8181e8b4aa7e57bed0c2b2`.
- First scorer-gold access occurred afterward at `2026-09-11T08:24:56Z` and is recorded in `scorer-unblinding-receipt.json`.

Invalid reviews were not regenerated. They remain `INDETERMINATE` and are
excluded from sensitivity/specificity denominators under the frozen rule:

- Trial 86 omitted required exact source evidence for one applicable finding.
- Trial 128 supplied a nonmatching source span.
- Trial 135 supplied a nonmatching source span.

## Frozen-gold results

| Metric | Individual reviews | Three-review majority |
|---|---:|---:|
| Exact semantic-defect sensitivity | 80/82 | 27/28 |
| Exact hard-defect sensitivity | 78/80 | 26/27 |
| Hard-defect false-pass rate | 2/80 | 1/27 |
| Faithful-state semantic specificity | 11/46 | 4/16 |
| Faithful-state false-block rate | 31/47 | 11/16 |
| Indeterminate rate | 4/138 | 0/46 |
| Hard-relevance accuracy, conditional on exact defect detection | 80/80 | 27/27 |

The hard-defect denominators exclude one contract-invalid hard-defect review.
The faithful semantic-specificity denominator excludes one contract-invalid
review and one valid semantically indeterminate review. The false-block
denominator includes every contract-valid faithful-state review.

The single majority hard escape was `NAT-EB3FBFA2694D`. Two of its three
reviewers treated feature-record existence as faithfully representing the
source predicate; one reviewer and the reconciled natural-state gold treated
the distinction between record existence and stored value as a hard-relevant
predicate error. This failure is stable across replicates rather than a
one-off serialization or ingestion failure.

## Natural and controlled-mutation tracks

| Track | Individual exact hard sensitivity | Majority exact hard sensitivity | Individual faithful specificity | Majority faithful specificity | Individual faithful false blocks | Majority faithful false blocks |
|---|---:|---:|---:|---:|---:|---:|
| Natural initial states | 45/47 | 15/16 | 11/14 | 4/5 | 0/15 | 0/5 |
| Controlled mutations, frozen labels | 33/33 | 11/11 | 0/32 | 0/11 | 31/32 | 11/11 |

The controlled-mutation hard defects were detected in all three replicates in
every one of the 11 dimensions. The corresponding whole-state specificity
numbers cannot cleanly estimate reviewer overblocking, however. The shared
state used for all 11 nominal faithful mutation controls contains material
source-to-state differences that were not independently adjudicated before it
was frozen as `FAITHFUL`:

- the source names `compound Sol`, while the state does not preserve that exposure identity;
- the source says onset is *within* two seconds, while the source-grounded observation stores scalar `onset_seconds: 2`;
- the state attaches additional modifier/prediction semantics to the hypothesis, producing a recurrent scope dispute.

All 11 nominal faithful mutation states received at least one defect finding.
Across their 33 reviews, reviewers flagged the omitted compound identity 19
times under `other` and the collapsed upper-bound timing 18 times under
`timing`. The frozen gold and raw scores remain unchanged, but Track 2
whole-state specificity and false-block rates are classified as a
load-bearing evaluation-target conflict. They are benchmark-conformity facts,
not a clean causal estimate of reviewer specificity.

The same-dimension matched-pair view remains informative. The intended hard
mutation was detected 3/3 in every dimension. On the nominal faithful partner,
the same dimension was called faithful in all determinate reviews for exact
target, case/comparison roles, amount/dose, feature value, high-information
qualifier, and dependency/provenance; recurring failures concentrated in the
shared timing, `other`/exposure-identity, and predicate-scope representation.
Exact per-dimension counts are in `aggregate-summary.json`.

## Evidence-contract and execution results

- Exact source-span objects: 1,811/1,813 valid.
- Complete source evidence by finding: 1,515/1,518 valid.
- Complete source evidence by submission: 135/138 valid.
- JSON pointers: 5,006/5,006 resolved.
- Complete JSON-pointer findings and submissions: 1,518/1,518 and 138/138 valid.
- Exact three-review semantic agreement: 38/46 candidates.
- At least two-of-three semantic agreement: 46/46 candidates.
- Exact latency available: 132/138 reviews; mean 149.716 seconds, median 143.327 seconds, p95 228.836 seconds.

## Architecture decision

Frozen strategy priority **A** triggers because one gold hard-relevant candidate
produced a majority false pass. Independent semantic review v0.1 is therefore
not ready for end-to-end DEVELOPMENT integration or production use.

The next architecture slice is one prospective v0.2 correction: clarify the
review contract around exact predicate truth conditions and then rebuild the
controlled mutation base so each nominal faithful state is independently
source-faithful before reviewer generation. The old run and gold stay frozen;
corrected states require new candidate IDs, hashes, reviews, and results.

No HRP, Universal protocol, deterministic epistemic gate, MAST artifact,
deployment, or production integration changed during this evaluation.
