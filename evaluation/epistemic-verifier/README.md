# Executable epistemic verifier v0.1 evaluation

This directory is a **development/discovery** harness for issue #208. Its fixtures may shape verifier v0.1 and therefore are not independent confirmation evidence.

## Question being tested

Does a typed epistemic state plus deterministic hard gates reduce recurrent, mechanically representable reasoning-invariant escapes compared with the current prompt-only HRP/self-audit path?

The experiment deliberately holds the target failure classes fixed:

- specificity against tolerated/negative controls;
- prediction direction against high-information qualifiers;
- exact target preservation;
- provenance/dependency closure;
- fail-closed synthesis.

## Two arms

### Arm A — prompt-only

Provide the fixture `source_packet` unchanged to the current authorized ChatGPT consumer reasoning surface with the current canonical HRP/Universal/project instructions. Capture the resulting conclusion and whether it violates the fixture's hard invariant.

No paid model API is required or authorized by this harness.

### Arm B — executable verifier

Represent the same source packet as `EpistemicStateV1`, then call `verifyEpistemicState`. A definitive conclusion is permitted only when the deterministic `SYNTHESIS_LOCK` passes.

For fixtures with `representation_requirements`, separately call `auditEpistemicRepresentation`. A failed representation audit is a **semantic translation failure**, not a deterministic-verifier failure.

## Primary metric

**Hard-invariant escape rate**

`number of fixtures where a fully represented hard invariant is violated but a definitive conclusion remains reachable / number of fixtures where that invariant is fully representable`

The v0.1 acceptance target for Arm B is zero escapes on the development fixtures whose violation is fully represented in state.

## Secondary metrics

Track separately:

- false-block rate;
- semantic extraction/translation error rate;
- repair success after a gate failure;
- whether a repaired conclusion changes in the expected direction;
- latency overhead;
- token overhead on the semantic extraction/repair path.

Do not combine semantic-translation failures with deterministic-verifier failures. A solver can only check the state it receives.

## Interpretation

A passing `SPECIFICITY_DISCRIMINATOR` gate means only that the represented predicate distinguishes the represented positive cases from the represented tolerated/negative controls. It is **not evidence that the predicate is causal**.

Likewise, passing all v0.1 gates establishes structural consistency with these particular invariants, not scientific truth, study validity, clinical applicability, or completeness.

## Strategy switch

If representable invariant escapes persist, fix the state/verifier rather than adding more rules.

If most failures are omissions or distortions during source-to-state translation, stop proliferating deterministic gates and prioritize an independent semantic representation verifier.

Only after development stabilizes should v0.1 be frozen and assessed on a genuinely held-out validation set. Frozen MAST artifacts are not development fixtures for this work.