# MAST four-arm base blinded-evaluation execution plan

**Task:** `askrigor-external-evaluation-contribution-v1`

**Lane:** bounded blinded evaluation

**Directive:**
`docs/directives/2026-09-02-zero-spend-chatgpt-mast-blinded-evaluator-transport.json`

## Objective

Execute the Project Manager's source-bound zero-spend blinded evaluator slice:
two independent judgments for each of the 96 frozen responses, mechanical
validation, predeclared disagreement detection, conditional fresh J3
adjudication, and per-response nonofficial projected MAST metrics while the
condition map remains sealed.

## Steps

1. [x] Freeze and accept all 96 primary generation responses.
2. [x] Return the factual generation receipt to the Project Manager and capture
   the exact evaluator directive source receipt.
3. [x] Obtain authenticated Mission Control `mayExecute:true` for the exact
   evaluator directive.
4. [ ] Verify the generation ledger and pinned MAST commit/tree and source-file
   identities.
5. [ ] Implement and test the private evaluator packet builder, schema
   validator, retry ledger, disagreement detector, J3 schedule, metric adapter,
   and fail-closed acceptance command.
6. [ ] Construct and seal the 96 opaque response identities, 192-item primary
   order, source identity ledger, and exact evaluator packets outside the
   repository.
7. [ ] Execute and freeze 192 primary GPT-5.6 Sol Extra High judgments in fresh
   condition-blind chats, retaining every mechanical failure and automatic tool
   process measure.
8. [ ] After all 192 primaries are frozen, detect only the predeclared
   disagreements and run every required fresh independent J3 adjudication.
9. [ ] Construct final blinded per-response records, compute only the directed
   per-response `NONOFFICIAL_PROJECTED_MAST_METRICS`, and freeze the complete
   blinded evaluation ledger.
10. [ ] Run the complete applicable deterministic gate, review the final diff,
    and return the factual blinded-evaluation receipt automatically to the
    Project Manager.
11. [ ] Stop before condition-map disclosure, arm/family aggregation,
    continuation-gate application, tuning, or scientific interpretation.

## Acceptance for this slice

- exactly 192 mechanically valid primary evaluator judgments or the exact
  unresolved-slot failure claim;
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
