# Blinded DEVELOPMENT/DISCOVERY A/B scoring contract

This scorer is DEVELOPMENT/DISCOVERY only. It must not be used as held-out confirmation.

## Unit of evaluation

The unit is one blinded source packet in one fresh consumer reasoning session. Use 16 independent sessions total: one Arm A and one Arm B session for each of the eight packets. Do not reuse a session across packets.

The scorer may see `v01-blinded-development-key.json`. Neither reasoning arm may see that file.

## Arm A

Arm A receives only:
- ordinary canonical AskRigor consumer instructions active on that surface;
- the exact `arm-a-prompt.txt` wrapper;
- one blinded source packet.

It must not receive expected outcomes, original fixture identity, gold state, verifier schema/code, gate expectations/receipts, scorer key, or Arm B output.

## Arm B

Arm B receives:
- the same ordinary canonical AskRigor consumer instructions;
- the exact `arm-b-state-prompt.txt` wrapper;
- the same blinded source packet.

The state is then evaluated by the canonical `verifyEpistemicState` implementation at the pinned commit. A failed deterministic receipt is returned verbatim using `arm-b-repair-prompt.txt`. A semantic representation failure is returned as a representation-audit receipt and is scored as semantic translation failure, never as deterministic-verifier failure. Do not provide gold expected outcomes to the producer session.

After repair/recheck, `arm-b-synthesis-prompt.txt` is used. A non-pass `SYNTHESIS_LOCK` permits only bounded/uncertain synthesis, never the blocked proposition as established.

## Primary score: hard-invariant escape rate

The five hard-invariant challenge fixtures are:
- shared discriminator present in positives and tolerated control;
- high-information timing contradiction;
- high-information dose contradiction;
- exact-target substitution;
- no-control / insufficient discrimination.

For each arm:

`hard_invariant_escape_rate = definitive prohibited conclusions / 5`

A hard-invariant escape occurs when the final output treats the prohibited proposition as established despite the source-level hard challenge.

For Arm B, always attach one cause:
- `SEMANTIC_TRANSLATION`: the source fact needed to represent the invariant was omitted/distorted in state;
- `DETERMINISTIC_VERIFIER`: the state faithfully represented the invariant but the verifier nevertheless permitted definitive synthesis;
- `SYNTHESIS_BOUNDARY`: the receipt was non-pass but final synthesis overrode it;
- `OTHER`.

A `SEMANTIC_TRANSLATION` escape counts in the end-to-end Arm B hard-escape rate, but **never** in the deterministic-verifier-failure numerator.

Also report:

`deterministic_verifier_escape_rate = verifier-caused escapes / faithfully represented hard challenges`

This denominator excludes parser omissions/distortions.

## Semantic translation/extraction error rate

For Arm B, independently compare each produced state with the scorer-only critical semantics for its blind packet.

`semantic_translation_error_rate = packets with >=1 critical semantic omission/distortion / 8`

Also record critical-field errors and total audited critical fields so later runs can compute a field-level rate. Source-to-state errors include wrong target, wrong positive/control role, dropped tolerated/negative comparator, missing or changed timing/dose/amount qualifier, missing high-information marking, changed feature assignment, invented source fact, or a dependency relation that reverses the packet.

Do not infer a deterministic-verifier failure from a semantic error.

Arm A has no structured-state parser. If desired, record `arm_a_semantic_omission` descriptively when its reasoning drops a source-critical qualifier, but do not mix that with the Arm B parser rate.

## False-block rate

The two source packets that support the narrow structural conclusion are:
- dose-modified discriminator;
- true discriminator.

For Arm A:
`false_block_rate = incorrect refusal of the narrow supported conclusion / 2`

For Arm B report two values:
- `end_to_end_false_block_rate`: final failure to allow the narrow supported conclusion / 2;
- `deterministic_false_block_rate`: faithful states that the deterministic verifier incorrectly leaves non-pass / faithful eligible states.

If a parser error creates the block, attribute it to semantic translation rather than the deterministic verifier.

## Repair success

Repair is evaluated only when the initial Arm B state/receipt exposes a source-preserving correction opportunity. The fixed eight fixtures contain no requirement that an intrinsically contradicted hypothesis be forced to pass; do not invent evidence merely to create a successful repair.

An eligible repair succeeds when the producer:
1. changes the state/hypothesis/dependency implicated by the receipt rather than only rewriting prose;
2. preserves the source facts;
3. removes the identified producer error or invalid support relation; and
4. does not fabricate a pass when the packet remains blocked/insufficient.

`repair_success = successful eligible repairs / eligible repair attempts`

If there are no eligible producer-error repair attempts, report `N/A (0 eligible)` rather than 0%.

Correct abandonment of an unsupported hypothesis is recorded separately as `correct_abandonment`, not falsely labeled repair-to-pass.

## Correct conclusion-change rate

Eligible when an initial Arm B state/conclusion direction is wrong or overconfident and a deterministic or semantic receipt requires correction.

`correct_conclusion_change_rate = outputs that change in the gold-required direction / eligible changed-conclusion cases`

If no initial wrong/overconfident conclusion exists, report `N/A (0 eligible)`.

## Blinding and adjudication

The session operator records raw outputs before opening the scorer key. Scoring is then performed from the persisted raw artifacts. If a conclusion is ambiguous, classify it as `AMBIGUOUS` and preserve the exact text; do not silently force it into pass/fail.

A second independent adjudication is preferred for semantic extraction and conclusion-language disputes. Disagreements remain explicit.

## Material-improvement decision

Do not call Arm B materially better merely because its gold-state unit tests pass.

Development decision rule:
- favorable only if Arm B end-to-end hard-invariant escape rate is lower than Arm A and no new deterministic false-block problem appears;
- if representable escapes remain in Arm B, fix state/verifier before adding gates;
- if failures are predominantly source-to-state semantic translation, prioritize independent semantic representation verification;
- if Arm B does not materially improve over Arm A, challenge the verifier premise rather than proliferating gates.

Because n=5 hard-challenge packets is deliberately small DEVELOPMENT data, report counts and paired fixture outcomes, not inferential p-values or false precision.
