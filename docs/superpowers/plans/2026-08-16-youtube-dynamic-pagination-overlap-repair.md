# YouTube dynamic-pagination overlap repair

## Objective

Allow the resumable YouTube community audit to finish when YouTube repeats a
comment thread or reply at an adjacent pagination boundary, without double
counting records or overstating corpus completeness.

## Verified failure

The deployed continuation handle was accepted, but the second provider segment
repeated two prior records: one top-level comment and its reply. The segment was
otherwise internally unique and exhausted all provider page tokens. The audit
then threw `Duplicate YouTube comment identifier in continuation chain`.

## Design

1. Add regression fixtures for both top-level-page and reply-page overlap.
2. Retain only SHA-256 fingerprints of identifiers from the immediately
   preceding top-level page and reply page in the signed one-hour continuation
   cursor. Keep the arrays bounded by provider page maxima (20 and 100).
3. Skip a provider record only when its stable identifier fingerprint occurred
   in the immediately preceding adjacent page. Continue rejecting duplicates
   within one page/segment and duplicates not justified by this cursor state.
4. Count reconciled overlaps in the signed continuation state. When pagination
   eventually exhausts after any overlap, return bounded evidence as
   `completed_with_access_boundary`, keep the synthesis lock passable, and state
   that moving provider pagination prevents a stable complete-snapshot claim.
5. Do not add a public tool input/output field or change the frozen MCP v0.1
   inventory. The existing `limitations`, `extraction_coverage`, and receipt
   fields carry the boundary truthfully.

## Verification

- Failing tests first for top-level and reply overlap.
- Focused source, continuation-token, audit, and Action tests.
- Full `npm run verify`, public-site gates if documentation changes, portable
  audit, generated-packet idempotence, diff/secret review, and independent code
  review.
- Merge only after hosted checks pass, deploy the exact merge with an image and
  Compose rollback point, then repeat the live Action continuation chain.

## Limits

Adjacent-page de-duplication cannot prove that a mutable public corpus was a
perfect point-in-time snapshot. It prevents observed duplicate inflation while
preserving that uncertainty as an explicit access boundary.
