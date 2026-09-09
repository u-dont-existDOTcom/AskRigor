# MAST Fresh Validation Round 1

Status: method frozen; detailed fresh-family content remains sealed pending the
second source-bound runtime admission.

## Goal and fixed sources

Test the merged AskRigor clinical-management and patient-safety protocol on a
prospectively selected set of twelve project-unexposed MAST base families. The
round is validation, not confirmation. It uses AskRigor commit
`0565222b1080f65ee70cde1be8daea160668e978`, Universal 20.5.22 at SHA-256
`d9364d98aa8c9805061aa53d21e7e3ed219675d8456b975b634bf54b2910c1b6`, HRP
20.5.27 at SHA-256
`65b099ce808012214e78f5f7b910e6a68858746978c160e29e177c3b444bf85a`, and
MAST commit `57a12c5490f3a7a6b0a6ce4e0d49f8e393ff49ee`.

The complete machine-readable freeze is
`evaluation/mast/fresh-validation-round-1-preregistration.json`. Its source
directive is held privately; the public record carries only its SHA-256. A
private 256-bit dispatch seed was generated before case access, and the public
manifest freezes only its SHA-256 commitment.

## Cohort and sequencing

The identifier-only selection covers all ten specialty prefixes, adds a second
All and Card family by the frozen arithmetic rule, and leaves eight families
untouched. The five requested older families are a separate DEVELOPMENT /
REGRESSION lane. They do not contribute to any fresh-family denominator or
pass criterion.

After the preregistration commit and second admission:

1. verify exact source bytes and freshness inventories without semantic review;
2. build the four frozen arm inputs and opaque, seed-derived dispatch schedule;
3. freeze all 144 fresh responses before opening detailed rubrics or guidance;
4. run the separate 60-response development/regression lane;
5. create two blinded evaluator passes, adjudicate every vector disagreement,
   and fail closed on unresolved records;
6. unblind once through explicit opaque-response and generation-record joins;
7. calculate the frozen raw-score gate, omission/commission and severe-
   commission results, and separate benchmark-target-conflict and clinical-
   validity layers; and
8. route the machine-readable result to the Project Manager for scientific
   interpretation.

Raw case inputs, responses, rubrics, judgment prose, condition maps, private
seeds, chat locators, and capture identities remain outside Git in mode-0700
directories with mode-0600 files. Public artifacts are limited to harness code,
tests, identifier-only manifests, hashes, counts, and sanitized numeric results.

## Stop conditions

Stop the dependent stage on source drift, freshness uncertainty, model-label
drift, protocol or threshold mutation, prohibited tool use, an invalid private
artifact identity, alias collision, explicit-ID join failure, denominator
shrinkage, or a denied/ambiguous runtime admission. Preserve all original
attempts and create corrected derivatives separately. Never replace a family,
silently retry for content, or reinterpret a frozen score.
