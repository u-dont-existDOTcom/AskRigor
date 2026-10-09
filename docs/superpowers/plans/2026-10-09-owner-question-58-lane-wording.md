# Owner question 58: approved lane wording

Authority: owner question 58, A (2026-10-09), applied from the owner's final
wording file. This is a bounded implementation on
`claude/finalizer-contract-20261007`, atop #288's HRP 20.6.12 / Universal 20.5.36.
Node 24.18.0; no external network; no commits, publication, or deployment.

## Implementation and placement

- Record every protocol replacement in
  `tests/fixtures/protocol-edits/2026-10-09-lane-wording.json`, preserving the
  previous canonical hashes and exact undo/reapply behavior.
- U1: `VendorClaimReconstruction`, Critical, in
  `whole_argument_reconstruction_gate`, after its existing rules. This is the
  closest existing section because it requires reconstructing a source's whole
  case before critique or judgment.
- U2: `SellerReputationAndProvenance`, Critical, directly after
  `VariantIdentityAndRelativeValue` in `recommendation_preflight_integrity_gate`,
  the shopping preflight rule's existing home.
- U3: `TraceablePhotographsForIdentification`, directly after the paragraph
  beginning "Exact tested identity applies" in `sources`.
- H1: `PrimaryOutcomeContinuity`, Critical, directly after
  `WholeInterventionIdentityTrace`. Append the five approved Prompt /
  ExpectedBehavior cases directly after `MixedMakerReviewPage` and FS216 / FS217
  directly after FS215.
- Add `exporter_lead` and its description to `finalize_research` shopping
  `offer_state`; retain `live_destination_orderable` as the buy-option gate.
  Test rejection as a buy option and acceptance as context through the function
  and the real in-memory MCP endpoint. Regenerate the inventory after typecheck.
- Update all current version/date/hash pins; preserve historical fixture and
  release receipts. Extend the earlier undo chains and independently test the
  approved sentences and XML placement.

## Canonical byte receipts

- HRP 20.6.13, revision date 2026-10-09:
  `b6e2b08322c52678520b3154a8058063ea3f1a049d0980b348b987c6d8bef3fa`.
- Universal 20.5.37, revision date 2026-10-09:
  `342e32e1568954ed62a8b53d75d1ad0efe39cba8d9ad7d143658f02dded169bb`.

## Validation and closeout

Targeted protocol chain, placement, sentence, and shopping tests passed: six
files, 69 tests. Full `npm run verify` passed (exit 0): typecheck and build
passed; 214 test files passed and one skipped; 2,622 tests passed and six skipped.
The run used Node 24.18.0 with an external-socket guard permitting only loopback
connections and Unix IPC, offline npm, and live provider tests disabled.
Typecheck preceded `npx tsx scripts/generate-tool-inventory.mts --write`; the
generated diff contains only the new offer state and description. Final diff
review and `git diff --check` passed. Historical hashes remain intact, and the
chain tests restore the prior canonical bytes exactly.

Live UDA bootstrap and lesson-queue status are unavailable under the explicit
no-network instruction; unavailable status is not a zero queue count. No
validated criticism or new lesson candidate arises from this approved wording
application. No provider smoke, package installation, or release is authorized
in this task. The local implementation is complete; the owner-facing result
reports changed files, final verification lines, and the canonical hashes.
