# CommunityEvidenceIndependenceAndActionabilityGate: coverage map

Replacement: `CommunityEvidenceIndependenceAndActionabilityGate.xml`. The root element and attributes are unchanged: `<CommunityEvidenceIndependenceAndActionabilityGate priority="Critical">`. All three rule names are kept.

## Sizes

| | Characters | UTF-8 bytes |
|---|---|---|
| Original element | 1,581 | 1,581 |
| Replacement element | 1,569 | 1,569 |
| Reduction | 12 (0.8%) | 12 |

**Method impact:** wording only. The three rules are verbatim apart from a joined sentence; only the Purpose (the index summary, not a requirement) is reworded.

## Test pins (all kept)

tests/protocol.test.ts ("scopes independent community weighting and actionability to the HRP 20.5.17 gate") slices this gate, with whitespace normalized, and requires:

- `name="FormalAbsenceCannotEraseCommunitySignal"`
- "Community signal is an independent evidence layer"
- "support_not_located"
- "must not, by itself, downgrade the observed community signal"
- `name="MatchedContradictionAndOutcomeAlignment"`
- "materially aligned population, intervention, comparator, outcome, and timeframe"
- "outcome_mismatch"
- `name="ActionabilityIntegration"`
- "risk, cost, reversibility, and the opportunity cost of delay"
- "corroborated | contradicted | support_not_located | outcome_mismatch"

This gate also sits inside the raw slice that the CommunityCorpusCompletionGate test reads, which runs up to `<ProtocolExecutionAndComplianceGate`.

Other sections reference it: FinalSelfCheck CommunityEvidence names this gate for support_not_located, and the HipCommunitySignalWithoutMatchedFormalSupport case exercises it. Nearly all of its text is pinned, so the gate cannot shrink much.

## NEEDS_OWNER_APPROVAL

None.

## Element and clause map

| Original element or clause | Disposition | Note |
|---|---|---|
| Purpose | KEPT (reworded) | New: "Keep community signal an independent evidence layer so that neither missing formal support nor anecdote enthusiasm decides alone; compare aligned claims, then weigh risk and the cost of delay explicitly." It keeps the original's two-way framing. The inventory marks it CUT_CANDIDATE, but it is kept because it is the section-index summary. |
| FormalAbsenceCannotEraseCommunitySignal | KEPT | Verbatim. |
| MatchedContradictionAndOutcomeAlignment | KEPT | Two sentences joined with a semicolon. The structural-regeneration example is kept because it defines outcome_mismatch concretely. |
| ActionabilityIntegration | KEPT | Verbatim. |

## Options not applied

- **Drop the Purpose (inventory CUT_CANDIDATE):** saves about 250 characters. The index summary would then be the first rule's text, which omits actionability.
