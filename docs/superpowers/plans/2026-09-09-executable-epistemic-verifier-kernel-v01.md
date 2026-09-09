# Executable epistemic verifier kernel v0.1

## Objective

Implement the smallest development-only slice that can test whether AskRigor benefits from moving recurrent mechanically checkable reasoning invariants out of prompt-only self-policing and into typed state plus deterministic synthesis locks.

This plan implements issue #208. It does not rewrite HRP, alter either canonical protocol XML file, rescore frozen MAST evidence, authorize new controlled MAST execution, or add paid model inference.

## Architecture decision

Use **composition/adaptation** of existing AskRigor patterns rather than a new theorem-proving framework.

Pipeline:

`source evidence -> semantic extraction -> EpistemicStateV1 -> deterministic gates -> optional independent semantic representation check -> synthesis boundary`

The LLM remains responsible for open-world semantic work: identifying the exact target, extracting observations and qualifiers, generating hypotheses, interpreting sources, and proposing explanatory modifiers. Ordinary deterministic TypeScript checks relationships that become mechanically decidable once those concepts are represented.

Do not add Z3/SMT in v0.1. Escalate to a solver only if later constraints cannot be expressed transparently with ordinary typed code.

## Repository reuse map

Reuse the pattern already present in `apps/research-mcp/src/actions/research-treatment-finalization.ts` and `treatment-landscape-coverage-route.ts`:

- strict Zod schemas for canonical typed state;
- explicit evidence/provenance bindings;
- deterministic lock derivation;
- fail-closed synthesis boundaries;
- diagnostics that identify blockers rather than hiding them;
- no model inference inside the deterministic verifier.

Respect `docs/architecture/mast-post-gate-evidence-review-v1.json`: do not build a parallel evaluator, change frozen metrics, or silently repair historical evidence. This v0.1 module is a generic development verifier that can later be composed with existing AskRigor receipts and locks if the experiment succeeds.

## Files

### 1. `apps/research-mcp/src/epistemic-verifier.ts`

Add:

- `EpistemicStateV1` strict schema;
- canonical source/provenance records;
- observations with direction, timing, amount/dose, route/form/context qualifiers and comparison role;
- case-feature assignments;
- comparisons identifying positive and tolerated/negative/unknown controls;
- hypotheses containing discriminator predicates and predictions;
- claims with target binding, dependencies, provenance and inference status;
- gate receipt and verifier receipt schemas;
- deterministic verifier functions.

Initial gates:

1. `SPECIFICITY_DISCRIMINATOR`
   - If there is no tolerated/negative control, return `insufficient` rather than pass/fail.
   - A feature/predicate proposed as the discriminator must not be identically present in all positive cases and a tolerated/negative control.
   - A hypothesis can use an explicit modifier (dose, form, route, context, interaction or another represented feature/value) only if the discriminator predicate itself differs across the relevant cases.
   - Passing this gate means only that the proposed discriminator survives the represented control contrast; it does not prove causality.

2. `EVIDENCE_DIRECTION`
   - Every material hypothesis must predict every high-information material observation that the state explicitly links to it.
   - `opposite` predictions produce a hard block.
   - `unexplained` predictions produce an insufficient/blocking state for definitive synthesis.
   - An exception mechanism must be a separate explicit claim/predicate in state, not prose relabeling.

3. `TARGET_PRESERVATION`
   - Every material conclusion claim must bind to the exact state target id.
   - Its material dependencies must ultimately reach at least one observation/evidence record bound to that target.
   - Claims about adjacent targets cannot satisfy the target merely because they are scientifically related.

4. `PROVENANCE_DEPENDENCY`
   - Every material observation and claim must have source provenance or be explicitly marked inference.
   - Every claim dependency must resolve to an existing observation or claim.
   - No unsupported material fact may silently enter a definitive conclusion path.

5. `SYNTHESIS_LOCK`
   - Definitive synthesis is reachable only when all hard gates pass.
   - `insufficient` remains non-definitive rather than being converted to a false pass.
   - Repair must change represented evidence/hypothesis/dependencies; rewriting final prose cannot alter the receipt.

### 2. `evaluation/epistemic-verifier/v01-development-fixtures.json`

Development/discovery fixtures only. Each fixture includes complete structured state and expected hard-gate results.

Required cases:

- shared-Q: X/Y react, Z tolerated, Q present in X/Y/Z -> Q-alone blocked;
- dose-modified-Q: Q shared but dose differs -> unmodified Q blocked, dose predicate may pass when represented;
- immediate-vs-delayed: immediate effect, hypothesis predicts delayed -> direction block;
- tiny-vs-threshold: tiny exposure, hypothesis predicts minimum threshold above observed amount -> direction block;
- target-substitution: target A, conclusion/dependencies only about adjacent B -> target block;
- true-discriminator: predicate present only in X/Y -> specificity pass without causal proof;
- no-control: no tolerated/negative comparator -> specificity `insufficient`;
- missing-qualifier: source/gold semantic state requires a high-information qualifier but candidate state omits it -> representation-audit failure fixture.

### 3. `tests/epistemic-verifier.test.ts`

Test schema strictness, all required fixtures, and hard invariants directly. Include negative tests proving:

- a prose/explanation field cannot override a failed gate;
- a modifier that does not actually discriminate does not repair specificity;
- missing dependencies/provenance fail closed;
- an adjacent-target claim remains blocked even when otherwise well supported;
- an insufficient comparator state cannot be promoted to `pass`.

### 4. `evaluation/epistemic-verifier/README.md`

Define the comparative A/B protocol without invoking paid inference:

- Arm A: current prompt-only HRP/self-audit output captured from an authorized consumer reasoning surface.
- Arm B: the same source packet represented as `EpistemicStateV1` and checked by v0.1.
- Primary metric: hard-invariant escape rate.
- Secondary metrics: false-block rate, semantic extraction error rate, repair success, conclusion-change correctness, latency/token overhead.
- Parser/translation failures and deterministic verifier failures are counted separately.

The development fixtures may shape v0.1. They are not independent confirmation. After development stabilizes, freeze v0.1 before any held-out validation.

## Semantic translation boundary

The deterministic verifier cannot establish that the LLM extracted the source correctly. v0.1 therefore also exposes a narrow representation-audit helper that compares a source/gold semantic requirement packet against a candidate `EpistemicStateV1` for required target ids, observation ids and high-information qualifier keys.

This helper is for synthetic development fixtures in v0.1. A later production semantic verifier should independently inspect source evidence plus state, not the producer model's prose justification.

## Acceptance criteria

The slice is accepted for further development only if:

1. every fully representable hard-invariant violation in the synthetic fixture suite is mechanically prevented from obtaining `definitive_synthesis = true`;
2. passing specificity is never described as proof of causality;
3. no-control cases return `insufficient`, not a fabricated pass/fail;
4. parser/representation omission is surfaced separately from deterministic verification;
5. no canonical protocol XML, frozen MAST artifact, benchmark score, historical judgment or existing synthesis metric is altered;
6. `npm run verify` passes in CI.

## Strategy-switch checkpoint

If the deterministic arm still allows representable invariant escapes, stop adding more gates and fix the verifier/state model first.

If most failures arise because semantic extraction drops or distorts the target, comparator or qualifiers, treat that as evidence that semantic representation is the bottleneck. Invest next in independent semantic state verification rather than proliferating deterministic gates.

If v0.1 materially reduces invariant escapes without excessive false blocks, next classify HRP rules as `DETERMINISTIC`, `SEMANTIC`, `HYBRID`, or `ADVISORY` and migrate only recurrent/high-impact deterministic or hybrid rules.

## Validation workflow

- Task branch: `task/executable-epistemic-verifier-kernel-v01-20260909`.
- Run targeted test: `npx vitest run tests/epistemic-verifier.test.ts`.
- Run full gate: `npm run verify`.
- Inspect final diff and hosted checks.
- Open a PR linked to issue #208.
- Do not merge on the basis of architecture reasoning alone; deterministic CI must be green.