# HRP batch 2 proposal: method sections (not applied; needs owner approval)

Date: 2026-09-26. Applies on top of HRP 20.6.0. Drafts and per-section coverage
tables: `docs/audits/2026-09-26-hrp-batch2-proposal/`.

## What it is

Twelve method sections compressed at an exact-meaning bar: every threshold,
trigger, definition and requirement kept; restatements merged; wording
tightened. The drafters rate the method impact of every applied change as
"wording only". Because these sections carry clinical and scientific method,
nothing is applied until you approve it.

| Section | Now (chars) | Draft | Change |
|---|---:|---:|---:|
| CrowdSourcedAndClinicalSignalAudit | 18,965 | 18,097 | −5% |
| QuantitativeRiskAndResearchAudit | 18,847 | 15,958 | −15% |
| TreatmentLandscapeAndVideoSelectionGate | 17,180 | 16,264 | −5% |
| BidirectionalEvidenceDiscoveryAndTriangulationLoop | 13,027 | 11,203 | −14% |
| DoseRegimeIntegrityAndSelfDirectedHarmReductionResearch | 11,840 | 9,877 | −17% |
| UniversalFullTextAcquisitionProtocol | 10,869 | 9,419 | −13% |
| SourceVerificationAndCitationAudit | 10,857 | 10,172 | −6% |
| ExtendedHumanEvidenceAndGreyLiteratureSweep | 9,651 | 8,092 | −16% |
| ComparatorLineageAndProgramCongruenceAudit | 9,322 | 7,795 | −16% |
| PatientHistoryAndRecurrenceEvidenceGate | 7,765 | 5,788 | −25% |
| CommunityCorpusCompletionGate | 4,365 | 4,333 | −1% |
| CommunityEvidenceIndependenceAndActionabilityGate | 1,581 | 1,569 | −1% |
| **Total** | **134,269** | **118,567** | **−12%** |

## The finding

Unlike the process and output sections (batch 1, which shrank 50% to 80%), the
method sections are dense: once restatements are merged, almost every sentence
is a distinct method item with no other home. Wording alone cannot halve them.
Bigger reductions need one of these choices from you:

1. **Load by relevance** (about 6,300 characters on typical runs): keep the
   historical-evidence rules and the post-exposure timing rules in their own
   sections, loaded only when historical evidence or a post-exposure timing claim
   is in scope.
2. **One home for YouTube method** (about 3,300): move the YouTube material that
   exists only in the bidirectional loop into the community-signal audit.
3. **Server enforcement of the treatment landscape** (about 12,000): make
   `finalize_research` require a signed result from
   `assess_treatment_landscape_coverage` (itself checking signed video-audit
   receipts), so the 8-video / 6-program minimum and the program-fingerprint
   rules are checked by the server and their prose can shrink. This is an
   engineering change first; the prose cut would follow with your approval.
4. Smaller items listed in each coverage table (about 3,000 together).

One item in the drafts touches wording you approved on 20.5.30: the treatment
gate states the 8-video / 6-program minimum once and defines "fully audited" by
the depth requirements that apply on the serving surface (as the 20.5.30
transcript decision already does).

## Decision needed

- Approve batch 2 as drafted (wording only, −12% on these sections), or not.
- Say which of options 1–4 to pursue.
