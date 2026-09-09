# Blinded DEVELOPMENT/DISCOVERY A/B for epistemic verifier v0.1

## Owner outcome

Determine whether typed `EpistemicStateV1` + deterministic gates materially reduce hard-invariant escapes compared with the current prompt-only HRP path, using the eight existing synthetic DEVELOPMENT fixtures and zero-spend consumer ChatGPT surfaces only.

## Canonical boundary

Base commit: `63f341502a9caa432ffbcf1074d1b8e133a6c52b`.

Do not modify:
- `protocols/HRP_Full.xml`;
- `protocols/Universal_Instructions.xml`;
- frozen MAST validation evidence;
- benchmark metrics;
- paid-model inference policy.

The existing eight fixtures remain DEVELOPMENT/DISCOVERY data and may influence verifier design; they are not confirmation evidence.

## Execution architecture

One independent fresh consumer session per arm per packet (16 total).

Arm A:
`blind source packet -> ordinary canonical AskRigor reasoning -> synthesis`

Arm B:
`same blind source packet -> semantic EpistemicStateV1 -> canonical deterministic verifier -> optional receipt-directed state/hypothesis repair -> reverify -> bounded/definitive synthesis according to SYNTHESIS_LOCK`

Semantic fidelity is audited independently from deterministic enforcement. Any source-to-state omission/distortion is attributed to semantic translation, not the deterministic verifier.

## Blinding

The safe blind packet file contains no original fixture ids or gold outcomes. Session operators must persist raw reasoning outputs before opening the scorer-only key.

Arm A cannot see:
- verifier schema/code;
- gate expectations or receipts;
- expected outcomes;
- original fixture ids;
- Arm B output;
- scorer key.

Arm B producer cannot see:
- verifier implementation/tests;
- expected outcomes;
- original fixture ids;
- Arm A output;
- scorer key.

Arm B may see the public state schema necessary to emit `EpistemicStateV1`; it receives verifier receipts only after committing its initial state.

## Surface randomization

Use semantic-preserving alias substitution only. Preserve exact logical structure, polarity, quantities, target relation, comparison roles, and high-information qualifiers. Randomize packet order and surface names. Do not create paraphrases that change whether an invariant is representable.

## Reproducibility

Persist for every session:
- blind packet id;
- exact prompt bytes/hash;
- consumer model label;
- mode/product surface exactly as displayed, or `not exposed`;
- timestamp;
- canonical HRP/Universal manifest versions and SHA-256;
- raw Arm A output;
- raw initial Arm B state;
- deterministic receipt;
- semantic representation audit;
- every repair prompt/state/receipt;
- final synthesis;
- scoring receipt and adjudicator identity;
- repository commit and verifier version.

## Scoring

Use `SCORING.md`. Never collapse semantic translation failure into deterministic-verifier failure.

## Strategy switch

- Any faithfully represented invariant escape in Arm B -> stop expanding gates; diagnose/fix state/verifier first.
- Predominantly source-to-state failures -> prioritize independent semantic representation verification.
- No material Arm B improvement over Arm A -> challenge the verifier premise.
- Favorable improvement with acceptable false blocks -> classify additional HRP rules as deterministic/semantic/hybrid/advisory before migration.

## Current execution checkpoint

The deterministic canonical portion is executed and green. Fresh consumer inference is blocked in the present reasoning chat because no tool can create a fresh isolated consumer ChatGPT session and this session is contaminated by gold/verifier reads. See `execution-manifest.json`.

This plan remains the recovery artifact for a fresh consumer-enabled worker; it must not reconstruct the method from chat memory.
