# MAST Fresh Validation Round 2 execution plan

## Objective

Create and execute a new prospective 12-family MAST validation study without reusing Round 1 as evidence. Freeze the entire executable path before response 1, preserve the historical judge configuration, and produce separate raw benchmark and clinically reconciled interpretations.

## Phase 1 — executable freeze

1. Derive the cohort only from pinned Git-tree identifiers and record all historical access classes.
2. Implement and test the append-only stage machine, runtime schemas, source binding, blinding, adjudication, unblinding, scoring, reporting, and failure receipts.
3. Bind every executable and prompt hash in the environment manifest and bind the environment/family manifests in the preregistration.
4. Run focused adversarial tests, typecheck, build, repository governance checks, `git diff --check`, and the complete deterministic gate once at the freeze checkpoint.
5. Commit, push, open a draft freeze pull request, and wait for required checks to pass.
6. Seal the private freeze receipt against the exact commit/tree, CI receipt, dispatch seed, and preregistration digest.
7. Before response 1, require an automated VPS consumer seam acceptance proving exact source-to-destination and destination-to-composer equality, the frozen model/effort/session state, response capture, and append-only sealing. Human copy/paste and file attachment are forbidden substitutes.

No benchmark payload is opened and no response is generated before Phase 1 passes.

## Phase 2 — generation

1. Build 144 private packets only after the freeze receipt passes.
2. Execute generation sequentially through the single authenticated VPS ChatGPT tab; independent later evaluation slots may be parallelized only where the frozen browser/session controls safely permit it.
3. Transfer the complete frozen packet set once into the private VPS filesystem using the authenticated machine-to-machine channel. Verify every source and destination hash, then have local Node/Playwright attach to the existing Brave browser over loopback CDP. Read only the current local packet, insert it directly in one DOM operation, and compare the complete composer hash and lengths with source and destination before Send. Capture raw output, citation/tool provenance, exact transport receipt, and visible provider configuration append-only. Reject tool use or configuration drift.
4. Never rerun a successful slot. Resume from the first missing slot after interruption.
5. Seal generation only at 144/144 valid captures.

### Consumer transport boundary

The packet never becomes an attachment, receives no wrapper text, enters a public location, or crosses an external relay. Packet contents remain inside the VPS filesystem and local browser-automation process. Browser-required line-ending conversion is prospectively limited to CRLF or CR becoming LF. Pre-send transport/UI failures may receive one bounded retry; any state in which Send may have occurred is preserved as ambiguous and is never blindly regenerated. A successfully captured or locally sealed run is never sent again.

## Phase 3 — blinded evaluation

1. Build opaque packets and a sealed condition map after generation is sealed.
2. Run independent J1 and J2 passes with the exact frozen configuration.
3. Preserve malformed artifacts and failure receipts; enforce the three-attempt ceiling without silent repair.
4. Detect every score-vector disagreement mechanically and build the J3 schedule.
5. Run J3 only for disagreements and preserve all three raw judgments.

## Phase 4 — unblind, score, and reconcile

1. Require complete J1/J2 and triggered J3 coverage before explicit unblinding.
2. Join only by opaque IDs and bound output hashes.
3. Calculate family and aggregate D−B/D−C, omission, commission, and severe-commission results with exact arithmetic.
4. Review flagged benchmark targets separately against current high-authority evidence; never alter raw scores.
5. Emit family, aggregate, machine-readable, failure, exposure, unblind, and final-validity artifacts.

## Stop and invalidation conditions

Any frozen source/hash mismatch fails closed. Any material component change after response 1 invalidates validation status, stops dependent processing, preserves all artifacts, and reclassifies exposed families as development data. Partial or invalid results are never efficacy, safety, superiority, or generalization evidence.
