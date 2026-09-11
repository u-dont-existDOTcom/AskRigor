# Failure analysis

## Hard-defect misses

`NAT-EB3FBFA2694D` accounts for both valid individual hard-defect false passes
(trials 6 and 132) and the sole majority false pass. Trial 72 detected and
hard-classified the reconciled gold predicate defect. The two misses reasoned
that a `present` discriminator was adequate because the represented cases all
contained the feature record. The frozen gold requires preserving the source's
stored-value predicate even when record existence happens to have the same
extension in the supplied cases. This is the specific contract distinction the
next reviewer revision must make explicit and test prospectively.

Trial 135 also concerned a gold hard-defect state, but its response failed the
exact-source-span contract. It is an invalid/indeterminate submission rather
than a false pass.

## False-block appearance

Frozen-label scoring reports 31/47 individual and 11/16 majority faithful-state
false blocks. All majority false blocks occur in the controlled-mutation track;
the independently adjudicated natural faithful states have 0/15 individual
and 0/5 majority hard false blocks.

The mutation generator labeled each unmutated shared base `FAITHFUL` without a
full independent source/state adjudication of that base. The base omits the
explicit `compound Sol` exposure identity and represents an upper-bound onset
as a scalar. Reviewer agreement on those issues is recurrent across nominally
independent candidates because all 11 pairs reuse the same template. The
resulting Track 2 false-block metric is therefore confounded by a defective
negative-control construction and cannot be attributed wholly to reviewer
overconstraint.

Historical artifacts are unchanged. `target-integrity-review.json` records the
conflict and the prospective migration required for a valid rerun.

## Hard relevance

Whenever a contract-valid reviewer detected the exact frozen-gold defect, its
`affects_hard_invariant` classification agreed with gold: 80/80 individual
reviews and 27/27 candidate majorities. Remaining hard escapes came from
semantic detection, not from downgrading a detected critical defect to
non-hard.

## Output-contract failures

Three of 138 eligible reviews were invalid: one missing required source
evidence and two nonmatching source spans. All 5,006 JSON pointers resolved.
The dominant output-contract weakness is therefore exact source quoting, not
state-pointer production.

## Model transition

The consumer UI automatically substituted `gpt-6-pro` for trials 104–106 and
returned to `gpt-5-6-thinking` at trial 107. Those three trials are retained
under the preregistered technically-impossible exception and are separately
stratified. Their sample is too small for an architecture conclusion. Removing
them does not remove the v0.1 hard miss or the mutation-control integrity defect.
