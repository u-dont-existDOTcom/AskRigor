# Formal source capacity boundary repair

## Recovery baseline

- Start from merged release commit `6b7b474e43f680af06f9ff67714f9406e083bed8`.
- Preserve the blocked production session and its encrypted checkpoint as diagnostic evidence only; never commit private research contents or decrypted state.
- The reproduced failing frontier digest is `4a062dbac699a1ca7a15f195423d0705cf6d93d5de242eae8f6f2df377d8a03b` with 1,968 stored formal sources.

## Observed failure and classification

An exact, non-committing replay of a copied encrypted checkpoint reproduced a Zod `too_big` issue at `sources`. The next PubMed page contained enough new identities to exceed the existing 2,000-source state-schema maximum. The route collapsed that deterministic capacity overflow into `action_internal_error` instead of preserving a truthful terminal boundary. This is a controller capacity bug, not provider unavailability or stale client state.

## Repair design

1. Keep the existing 2,000-source persistence maximum for checkpoint compatibility.
2. Admit unique identities only until the frontier reaches exactly 2,000. Preserve the provider page receipt and returned-record count, omit overflow identities, remove continuation cursors, and close all remaining open provider searches with the explicit terminal nonretryable `FORMAL_SOURCE_CAPACITY_REACHED` boundary.
3. Preserve already terminal provider receipts unchanged.
4. Screen the resulting formal frontier through deterministic signed batches of at most 100 pending identities. Bind each submission to every identity in its current batch, retain unscreened identities for the next batch, and let only the server declare frontier completion.
5. Limit each screening rationale to 350 characters and prove a maximally JSON-escaped 100-decision submission remains below the 256 KiB private Action request limit.

## Verification and release gates

- Unit coverage: capacity crossing, already-full closure, receipt/cursor preservation, multi-batch completeness, worker instruction/response contract, and request-size bound.
- Route coverage: a 1,999-source state crosses capacity with HTTP 200 and the next continuation issues formal source semantic work instead of an internal error.
- Run typecheck, focused tests, `npm run verify`, final diff review, and an exact non-committing replay against a fresh copy of the failed encrypted checkpoint.
- Open and merge a pull request only after protected checks pass; retain a concrete production rollback image and Compose receipt.
- Deploy the exact merged archive, run the postdeployment Action/MCP/protocol/plugin audit, then start a genuinely fresh signed-in Custom GPT session and continue through product acceptance.
- This controller-only repair does not change canonical protocol XML, the public OpenAPI surface, the 21-tool MCP catalog, privacy collection, or installed plugin package bytes.
