# MAST four-arm base blinded-evaluation execution plan

**Task:** `askrigor-external-evaluation-contribution-v1`

**Lane:** bounded blinded evaluation

**Active directive:**
`docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport-v2-recovery.json`

**Retired calibration transport:**
`docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport.json`

## Objective

Execute the Project Manager's source-bound zero-spend blinded evaluator slice:
two independent judgments for each of the 96 frozen responses, mechanical
validation, predeclared disagreement detection, conditional fresh J3
adjudication, and per-response nonofficial projected MAST metrics while the
condition map remains sealed. Evaluator v1 produced two malformed calibration
outputs and was retired with zero valid judgments; v2 restarts the identical
sealed order using chunk identifiers and a compact output schema.

## Steps

1. [x] Freeze and accept all 96 primary generation responses.
2. [x] Return the factual generation receipt to the Project Manager and capture
   the exact evaluator directive source receipt.
3. [x] Obtain authenticated Mission Control `mayExecute:true` for the exact
   evaluator directive.
4. [x] Verify the generation ledger and pinned MAST commit/tree and source-file
   identities.
5. [x] Implement and test the private evaluator packet builder, strict output
   validator, byte-identical retry ledger, metric adapter, and fail-closed
   primary-capture recorder.
6. [x] Construct and seal the 96 opaque response identities, 192-item primary
   order, source identity ledger, and exact evaluator packets outside the
   repository.
7. [x] Preserve the two v1 invalid-JSON attempts, halt at the source-fixed retry
   boundary, route exact evidence automatically, source-bind evaluator v2, and
   obtain authenticated v2 runtime admission.
8. [x] Verify v2 chunk reconstruction across all 96 frozen responses, reuse the
   exact v1 order and opaque IDs, and test strict positive/negative v2 parser
   fixtures. Retire the first preflight after two packet-QA runs proved its
   concept-grouped display omitted the distinct canonical source order required
   by validation; preserve those runs with zero valid judgments, declare the
   exact source order in every packet, and pass a fresh 96-packet preflight.
9. [ ] Execute and freeze 192 primary GPT-5.6 Sol Extra High judgments in fresh
   condition-blind chats, retaining every mechanical failure and automatic tool
   process measure.
10. [ ] After all 192 primaries are frozen, implement and run the predeclared
   disagreement detector, sealed J3 schedule, J3 capture ledger, and every
   required fresh independent J3 adjudication before inspecting any comparison.
11. [ ] Construct the fail-closed final acceptance command and final blinded
   per-response records, compute only the directed
   per-response `NONOFFICIAL_PROJECTED_MAST_METRICS`, and freeze the complete
   blinded evaluation ledger.
12. [ ] Run the complete applicable deterministic gate, review the final diff,
    and return the factual blinded-evaluation receipt automatically to the
    Project Manager.
13. [ ] Stop before condition-map disclosure, arm/family aggregation,
    continuation-gate application, tuning, or scientific interpretation.

## Acceptance for this slice

- exactly 192 mechanically valid v2 primary evaluator judgments or the exact
  v2 unresolved-slot failure claim;
- one fresh clean condition-blind conversation per judgment;
- exact packet/output/source/model/mode provenance and retained retry receipts;
- all required J3 adjudications executed independently from scratch;
- final metrics are response-level only and labeled
  `NONOFFICIAL_PROJECTED_MAST_METRICS`;
- condition mapping remains sealed and no arm/family result is computed;
- no provider API credentials, paid inference, owner relay, or external spend;
- no Codex-authored scientific interpretation or official MAST/HRP claim.

Operational, scientific, and release adequacy remain separate Project Manager
review fields; this plan records execution evidence only.
