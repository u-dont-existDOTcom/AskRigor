# AskRigor Premise Integrity and Truth Priority Design

Date: 2026-08-16

## Decision

Adopt the owner's approved harmonized option: add a Critical, domain-general premise-integrity and truth-priority control to both the Universal instructions and HRP. The new control must prioritize factual accuracy over agreement with the prompt while preserving legitimate, explicitly labeled inference and estimation.

## Problem

The current protocols already contain strong anti-hallucination, source-verification, citation-entailment, arithmetic, uncertainty, and no-guessing protections in specific contexts. The remaining generalized failure mode is prompt-premise inheritance: a model can accept an asserted fact, source, quotation, event, relationship, or causal framing from the user's wording and then reason fluently from it without first checking whether the premise itself is true.

A literal blanket ban on all guessing or extrapolation would overcorrect. AskRigor must still be able to perform transparent inference, estimation, first-principles reasoning, and decision analysis when direct evidence is incomplete. The repair therefore distinguishes fabrication from labeled inference, and verified nonexistence from a failed search.

## Required behavior

Both protocols must enforce all of the following:

1. Accuracy outranks agreement, validation, compliance with a factual premise, rhetorical coherence, and satisfying the expected answer.
2. Factual assertions embedded in a prompt are claims to evaluate, not facts to inherit. Material premises must be independently checked to the degree needed for the answer.
3. Never fabricate or silently repair a nonexistent fact, event, quotation, citation, study, person, concept, dataset, coordinate, numerical value, relationship, causal connection, or source merely to make the requested analysis work.
4. If reliable evidence establishes that the requested thing does not exist, state plainly: `This does not exist.` If search or access only fails to establish existence, use `I could not verify that this exists` or the existing `Not found` state rather than converting failed retrieval into proof of nonexistence.
5. If a requested source, primary datum, quotation, or exact citation cannot be independently inspected or authenticated and that limitation is material, state plainly: `I cannot independently verify this source/data.`
6. Never agree with, validate, repeat, or build upon a claim merely because the user, source, authority, consensus, or expected answer presents it as true. Correct a false material premise directly.
7. When direct evidence is incomplete, do not fill gaps with plausible-sounding factual detail. Clearly separate verified fact, calculation, inference, extrapolation, assumption, hypothesis, and unknown. Labeled inference and estimation remain permitted when useful.
8. Verify material logic and arithmetic as well as factual premises. A citation does not rescue a claim it does not entail, and internally inconsistent numbers must be reconciled before synthesis.
9. Prefer exact observations, raw counts, source text, records, measurements, and reproducible calculations before interpretation. Synthesis may organize evidence; it may not manufacture missing evidence.

## Universal integration

Bump Universal from `20.5.11` to `20.5.12`, revision date `2026-08-16`.

Add:
- a new Critical revision-history entry;
- a dedicated `<premise_integrity_and_truth_priority_gate>` near the general execution/epistemic controls;
- a point-of-generation premise-integrity check;
- regression coverage in `tests/protocol.test.ts` for the required wording and distinctions.

Do not weaken the existing uncertainty taxonomy or its permission for conceptual reasoning.

## HRP integration

Bump HRP from `20.5.17` to `20.5.18`, revision date `2026-08-16`.

Add:
- a Critical revision-history entry;
- a dedicated `<PremiseIntegrityAndTruthPriorityGate>` immediately before the existing `EpistemicSafetyRules`;
- an Architecture layer making the gate part of the controlling stack;
- a `NoSilentOverride` reinforcement so prompt premises and expected-answer pressure cannot bypass the gate;
- stress/regression cases for false-premise compliance, nonexistent-source hallucination, search-failure/nonexistence confusion, confident-user assertions, forced causal connections, citation non-entailment, arithmetic contradiction, and legitimate labeled inference;
- final self-checks covering the same behaviors;
- future-revision protection so the gate is not silently dropped.

## Version and integrity behavior

The canonical XML files remain the single source of truth. Existing byte-derived manifest and SHA-256 tests must be updated to the exact new bytes. Do not reconstruct either canonical protocol from chat memory or a condensed summary.

## Implementation mechanism

Because this execution environment can inspect and write GitHub files but cannot clone the public repository into the local container, use a repository-contained deterministic updater on a task branch. The updater must:

- require the exact expected base versions or recognize the exact target versions;
- perform marker-guarded, fail-closed textual edits to the complete XML files in the GitHub Actions checkout;
- update `tests/protocol.test.ts` SHA-256 receipts after the complete new bytes are generated;
- be idempotent on the target versions;
- fail if any expected marker occurs zero or multiple times;
- preserve every unrelated byte except the intentional edits;
- run the repository's deterministic verification gate after generation.

A temporary branch-only workflow may execute the updater and commit the generated canonical bytes to the same task branch. It must not run on `main`, must avoid recursive bot-triggered execution, and must use the minimum write permission required.

## Acceptance criteria

- Universal root reports `20.5.12` / `2026-08-16`.
- HRP root reports `20.5.18` / `2026-08-16`.
- Both contain the approved truth-priority behavior and exact user-facing declarations.
- HRP contains the new stress cases and final checks.
- `tests/protocol.test.ts` asserts the new versions and behaviors.
- Exact SHA-256 receipts match the generated files.
- `npm run verify` passes on the resulting branch.
- The final diff contains no unrelated protocol edits.
- The updated complete XML files are available from the task branch as the requested output artifacts.
