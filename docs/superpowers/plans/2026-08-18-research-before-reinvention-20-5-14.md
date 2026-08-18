# Universal 20.5.14 research-before-reinvention plan

**Goal:** Apply the owner-supplied fail-closed Universal v20.5.13 → v20.5.14 Research-Before-Reinvention patch to the exact current canonical XML, preserving every unrelated byte and validating the resulting repository through the existing AskRigor gates.

**Baseline:** task branch was created from `main` `cfce806345fe65a13fd0330aa7e8f000c1587d01`; canonical `protocols/Universal_Instructions.xml` v20.5.13, revision 2026-08-17, SHA-256 `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`; owner-supplied `research-before-reinvention-patch-2026-08-18.zip`. During implementation `main` advanced concurrently, but the live Universal manifest was rechecked and remained the exact v20.5.13 source hash before patch application.

## Research-before-reinvention gate

- **Applicability:** `required`
- **Independent conception snapshot:** the supplied patch specifies a domain-general gate that preserves independent conception when fixation risk matters; scans academic work, standards/specifications, mature implementations/tools, and adjacent disciplines; classifies solved/partial/incompatible/unresolved; requires explicit reuse/adapt/compose/invent/experiment; identifies a novel remainder and strong external baseline; and permits only bounded research debt.
- **Existing-work scan:** `u-dont-existDOTcom/universal-dev-architecture` already contained a complementary scholarly semantic-discovery specialization on 2026-08-18. That live work was reused rather than independently reinvented; this AskRigor change implements the protocol-level orchestration supplied by the owner.
- **Existing-work map:** scholarly discovery was already solved/reusable at the architecture layer; protocol-level activation, output/specification requirements, research debt, and point-of-generation enforcement were the remaining implementation surface.
- **Disposition:** `adapt`
- **Novel remainder:** protocol-specific gate placement, revision record, task-specification bullet, point-of-generation check, and structural regression coverage.
- **External baseline:** exact Universal v20.5.13 bytes plus the composed universal-development architecture; unrelated bytes and semantics were preserved.
- **Research debt:** none.

## Source acceptance criteria

- [x] Patch refuses any source whose SHA-256 is not the exact canonical v20.5.13 hash.
- [x] Result parses as XML and reports v20.5.14 / 2026-08-18.
- [x] Revision 20.5.14, the complete `research_before_reinvention_gate`, task-specification prior-work bullet, and reinvention point-of-generation check are present exactly once in focused structural regression coverage.
- [x] Existing protocol/package tests derive the manifest from the new exact bytes without hard-coded drift; published digest contracts are advanced to the generated v20.5.14 SHA-256.
- [x] `npm run test:run` passes as part of the final deterministic verification gate.
- [x] `npm run verify` passes.
- [x] Final PR diff contains no temporary privileged automation used only to overcome connector patch-in-place limitations.
- [x] Protected workflow-policy gate passes.
- [x] Source change is merged to `main`.

**Generated Universal v20.5.14 SHA-256:** `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`.

## Implementation and verification receipts

- Source PR: `#38` — **Add Universal research-before-reinvention gate v20.5.14**.
- Final PR head: `7e2f6f664535783b7045af27baaca6b506442889`.
- Merge commit: `b02b7c5e5e08e472759a74786a9fbd161b260671`.
- Final deterministic verification run: `32132043176` — success; `npm run verify` completed successfully.
- Final workflow-policy run: `32132043207` — success.
- First deterministic run correctly exposed one stale v20.5.13 MCP manifest fixture; that regression was repaired rather than bypassed, then the full protected suite passed.
- Durable generated-digest receipt: `docs/superpowers/plans/2026-08-18-universal-20-5-14-sha256.txt`.

## Implementation note

The GitHub connector can replace a complete file but cannot apply a small textual patch to a 98 KB file in place. To avoid manually reconstructing canonical protocol bytes, branch-only temporary workflows ran the supplied fail-closed patcher, recorded the generated digest, and advanced one large stale fixture after CI exposed it. Every temporary write-capable workflow was deleted before final review and merge. The final source PR contained only ordinary protocol, test, patcher, and provenance files.

## Production deployment state

**Source implementation: complete. Production rollout: not complete in this execution environment.**

After merge, the connected AskRigor production service still reported:

- Universal version: `20.5.13`
- revision date: `2026-08-17`
- SHA-256: `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`

An integrity probe using the new source SHA-256 `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221` returned `Protocol SHA-256 mismatch`, confirming that the running service has not yet been rebuilt/redeployed from the merged source.

The canonical deployment/validation runbook requires a preconfigured SSH destination `ASKRIGOR_VPS` and protected server-side state under `/opt/askrigor`; the destination is deliberately not stored in GitHub. In the execution environment used for this task, `ASKRIGOR_VPS` is absent and no SSH configuration, SSH directory, or SSH binary is available. No installed or installable connector surfaced a compatible SSH/VPS deployment capability. Creating a new credential-bearing deployment path would broaden authority and security scope, so it was not fabricated as part of this protocol patch.

### Production completion trigger

When an authorized environment with the existing `ASKRIGOR_VPS` access is available:

1. deploy/rebuild the exact merged AskRigor revision containing commit `b02b7c5e5e08e472759a74786a9fbd161b260671` through the repository's existing production procedure without exposing `/opt/askrigor/runtime.env`;
2. call `get_protocol_manifest` for Universal and require v20.5.14 / 2026-08-18 / SHA-256 `8f929aa70bc71d8528da3527a22704b0cf85ffec08e9b7b13a186ead71505221`;
3. call `verify_protocol_integrity` with that exact SHA-256 and require success;
4. preserve the deployed image/revision and rollback receipt in the normal production evidence ledger.

## Completion

The uploaded patch is fully implemented, reviewed, tested, and merged in source. The only remaining boundary is deployment of the already-merged AskRigor image to the protected VPS. That boundary is recorded explicitly rather than conflated with source completion.
