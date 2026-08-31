# Issue #150 synthetic gap-to-research loop

## Objective

Prove one usable, local-only vertical slice for the synthetic question “What
precedes spontaneous prolactinoma remission?” The owner must be able to move
from the evidence-gap page through provenance, an unprompted synthetic account,
structured details, deidentified preview and consent, a bounded public research
lead, challenge, correction, withdrawal, and the linked evidence-check/research
proposal boundary.

## Scope boundary

- Reuse the existing synthetic community composer, lead, balanced-frontier,
  and research-pipeline services.
- Keep all runtime state in memory and bind the lab to `127.0.0.1`.
- Use synthetic records only; do not add migrations or a generalized backend.
- Preserve source distance, verification, missingness, and partial coverage.
- Give the non-remission comparator equal placement and explanatory weight.
- Keep recruitment inactive and do not display efficacy percentages, causal
  conclusions, or popularity-derived evidence upgrades.
- Do not modify or deploy the static public site.

## Implementation slices

1. Add a bounded orchestrator that composes existing services and exposes a
   sanitized snapshot plus contribution/challenge/correction/withdrawal actions.
2. Add a local HTTP shell and accessible static interaction page.
3. Add deterministic service and HTTP privacy/guardrail tests.
4. Run targeted tests, typecheck/build, local headless Brave acceptance, the
   complete deterministic gate, and a final diff review.
5. Commit coherent slices, push the dedicated branch, and preserve exact
   execution receipts.

## Acceptance invariants

- The raw unprompted account is saved before structured details and never
  appears in the public snapshot.
- A reported-remission lead and a same-exposure non-remission comparator are
  both visible without a denominator or effectiveness percentage.
- Public visibility does not upgrade verification or evidence capability.
- Correction creates a contiguous lead version and updates visible missingness.
- Withdrawal removes the projection, leaves a no-content tombstone, and marks
  linked research dependencies for review.
- The proposal remains synthetic, draft, review-required, and
  `recruitmentActive: false`.
