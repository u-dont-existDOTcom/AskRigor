# MAST-derived clinical gates

**Status:** candidate ready for pre-PR verification on `task/mast-derived-clinical-gates-20260909`
**Baseline:** `3b95fb5` (`main`, 2026-09-09)
**Owner source:** current Codex user directive, SHA-256 `d60697e542f7a3fa7134ba2107f30d886a9612c0c2166702ac7c95cfbb4c5c08`

## Outcome

Add two small root-level Critical HRP gates that preserve complete, correctly sequenced clinical management and require patient-specific safety reconciliation before intervention ranking. Extend the existing evaluation-governance architecture so benchmark targets are checked against current high-authority evidence before benchmark-driven protocol changes.

## Boundaries

- Treat Neuro007, Derm001, Heme010, Endo002, and Pulm005 only as development/regression cases.
- Do not read, rerun, rescore, rewrite, or validate the frozen 96-response MAST epoch.
- Do not alter frozen benchmark results or historical audit/directive artifacts.
- Do not add case-specific clinical rules when a general gate is sufficient.
- Do not use paid model inference, private clinical payloads, or private archive contents.

## Implementation

1. Revise the canonical HRP with a pre-synthesis clinical action map and a pre-ranking patient-specific intervention safety reconciliation.
2. Add explicit FinalSelfCheck coverage and bounded generic regression cases, including positive controls for decisive management and clinically real sequencing.
3. Extend the benchmark correction policy and defect-ledger schema with a machine-readable `BENCHMARK_TARGET_CONFLICT` path that separates benchmark conformity from clinical validity.
4. Add focused structural/schema tests using the five named MAST families only as development labels.
5. Refresh only current protocol manifest references derived from the changed canonical bytes.

## Verification

- Focused protocol and benchmark-governance development tests.
- Affected protocol, MCP, frontier, and structural tests.
- Repository authority gate and lesson-queue status.
- One final `npm run verify` on the final materially changed state, with test-efficiency timing.
- Final diff, changed-path, secret/private-payload, and frozen-artifact review before commit and PR.
