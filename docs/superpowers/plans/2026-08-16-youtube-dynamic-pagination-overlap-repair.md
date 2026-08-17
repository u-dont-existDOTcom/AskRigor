# YouTube dynamic-pagination overlap repair

## Objective

Allow the resumable YouTube community audit to finish when moving YouTube
pagination repeats a stable comment identifier at an adjacent page boundary or
later in the continuation chain, without double counting records or overstating
corpus completeness.

## Verified failure

The deployed continuation handle was accepted, but the second provider segment
repeated two prior records: one top-level comment and its reply. The segment was
otherwise internally unique and exhausted all provider page tokens. The first
repair only recognized adjacent-page overlap, so the live chain still threw
`youtube_video_audit_identifier_membership_restart_required` instead of
reconciling those exact prior identifiers.

## Design

1. Add regression fixtures for both top-level-page and reply-page overlap.
2. Retain only SHA-256 fingerprints of identifiers from the immediately
   preceding top-level page and reply page in the signed one-hour continuation
   cursor. Keep the arrays bounded by provider page maxima (20 and 100).
3. Use the immediately preceding page fingerprints to suppress adjacent repeats
   inside the source adapter before they cause redundant reply work. Across the
   signed continuation chain, reconcile any exact repeated stable identifier
   retained in the deterministic identifier set and count it as a moving-
   pagination boundary. A fixed-size signed membership filter covers every
   accepted identifier after the exact deterministic sample becomes bounded at
   500. A possible
   non-adjacent match fails closed; a filter false positive may therefore force
   restart, but cannot inflate the corpus count. Return a typed restart-required
   failure that preserves the prior accepted counters, and consume an unusable
   Custom GPT Action handle so retrying it cannot loop. Signed pre-upgrade
   continuations whose exact corpus already exceeded 500 receive a distinct
   migration/restart-required result; small pre-upgrade continuations remain
   resumable during their one-hour lifetime.
4. Count reconciled overlaps in the signed continuation state. When pagination
   eventually exhausts after any overlap, return bounded evidence as
   `completed_with_access_boundary`, keep the synthesis lock passable, and state
   that moving provider pagination prevents a stable complete-snapshot claim.
   Track cross-segment reply repeats separately and keep `replies_reconciled`
   false because raw provider reply totals cannot prove the accepted unique
   per-parent count after such a repeat.
5. Do not add a public tool input/output field or change the frozen MCP v0.1
   inventory. The existing `limitations`, `extraction_coverage`, and receipt
   fields carry the boundary truthfully.

## Post-merge live finding and terminal-refetch repair

The first exact-merge production acceptance acquired 66 then 82 unique records
for the selected 148-comment video and exhausted top-level pagination. The
terminal deterministic-ID refetch returned no analysis sample, so the receipt
correctly remained `incomplete` with `synthesis_lock:block`; the deployment was
rolled back. No comment text, identifier, continuation handle, or credential
was persisted in the acceptance evidence.

The follow-up repair must preserve the already accepted corpus count and digest
while distinguishing acquisition from later sample availability:

1. A `commentNotFound` response for a multi-ID refetch batch is split until the
   unavailable stable identifier is isolated, without discarding accessible
   peers. Splitting remains bounded by the existing 15-second ceiling and an
   explicit 50-request ceiling.
2. A nonempty verified subset may finish only as
   `completed_with_access_boundary`, with deterministic sample ordering,
   `synthesis_lock:pass`, the full acquired `corpus_count`, the smaller exact
   `sampled_count`, provider refetch limitations, and an explicit warning that
   the retained sample may not represent the full acquired corpus.
3. Zero refetchable records, duplicate/unrequested IDs, or a wrong-video record
   still fail closed and require restart.
4. No comment text or identifier is added to the Custom GPT handle map, logs,
   durable state, or committed evidence; the frozen MCP/Action schemas remain
   unchanged.

## Verification

- Failing tests first for top-level and reply overlap.
- Focused source, continuation-token, audit, and Action tests.
- Full `npm run verify`, public-site gates if documentation changes, portable
  audit, generated-packet idempotence, diff/secret review, and independent code
  review.
- Merge only after hosted checks pass, deploy the exact merge with an image and
  Compose rollback point, then repeat the live Action continuation chain.

## Limits

Stable-identifier de-duplication cannot prove that a mutable public corpus was a
perfect point-in-time snapshot. It prevents observed duplicate inflation while
preserving that uncertainty as an explicit access boundary. Once the exact
identifier sample is bounded at 500, an identifier omitted from that sample can
only be checked against the fixed-size membership filter. The filter has no
false negatives for inserted identifiers but can have false positives; those
stop the chain rather than accepting a possibly repeated record.
