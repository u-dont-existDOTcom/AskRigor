# Recommendation-preflight integrity lesson — 2026-09-17

## Source and provenance

This portable lesson is promoted from the Universal Development Architecture recommendation-preflight repair merged on 2026-09-17 at commit `ea4febd1c6610f8b7a5931a0965eaa75f71f0610`. The originating Mission Control evidence is `feedback/mission-control/SDF-20260917-SHOPPING-RECOMMENDATION-PREFLIGHT-001.json` in that repository.

The source incident involved repeated shopping-recommendation failures. A candidate was endorsed before live orderability was checked; another was endorsed before its weak customer rating was considered; later owner-facing options already had known disqualifiers such as no purchase path, a serious recurring reliability complaint, or price misfit, and a value comparison omitted the prices that controlled the decision.

## Portable causal lesson

Recommendation must be the terminal classification of an evaluated candidate, not a promising discovery result followed by caveats that reverse the endorsement. Discovery candidates remain internal until every currently material criterion that could change the decision is resolved.

For shopping and other price-sensitive product choices, the material pre-endorsement set normally includes current orderability, visible current price and material delivery/forwarding costs, exact product or variant review signal and recurring serious defects, compatibility, actual-use performance, source/variant identity, and relative value against other valid candidates. Rejected or decision-relevant unknown candidates are not shortlist filler.

A durable note alone does not prevent recurrence. The lesson must also execute at the owner-facing recommendation boundary. Universal 20.5.26 therefore includes both the semantic gate and a point-of-generation check, plus focused regression tests.

## Transfer boundary

Promoted: the domain-general candidate-to-recommendation state transition, required shopping evidence, value/price rule, orderability rule, review/reliability rule, variant identity rule, reject suppression, and pre-delivery enforcement.

Not promoted: store names, product brands, exact prices, delivery arrangements, user location, or any private conversation locator. Those were incident-specific evidence, not universal runtime dependencies.

## Projection state

- Universal public protocol: projected in source as 20.5.26.
- Regression coverage: `tests/universal-recommendation-preflight-integrity.test.ts` plus current manifest/integrity tests.
- HRP: unchanged; HRP remains controlling for health-intervention tasks.
- Installation/deployment/live behavior: not established by source merge alone and must not be inferred from this record.
