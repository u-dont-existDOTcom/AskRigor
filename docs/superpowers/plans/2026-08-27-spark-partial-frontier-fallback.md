# Spark partial-frontier fallback

## Goal

Keep AskRigor research moving from independently validated Spark-discovered
YouTube videos when one or more other Spark identities remain unresolved and
native YouTube `search.list` is unavailable or its daily quota is exhausted.

## Owner correction and authority

- The owner corrected the 2026-08-27 release after signed-in acceptance showed
  that a Spark frontier with eight source candidates, six independently
  validated identities, and one unresolved identity stopped before native
  discovery.
- A nonempty independently validated Spark subset is usable discovery evidence.
  Unresolved, rejected, or unvalidated identities are never admitted into the
  screening package.
- The unresolved Spark identities and any missing native-search coverage remain
  explicit access gaps. Neither frontier is described as complete, and the
  gaps cannot support a full-coverage or ranking claim.
- A packet with no independently validated candidates remains retryable and
  cannot unlock the fallback.
- No canonical protocol, public Action schema, tool catalog, privacy collection,
  or credential handling change is in scope.

## Design

1. Project a partial Spark validation receipt with at least one validated
   candidate as a terminally bounded frontier for the current execution. Use a
   distinct boundary code and retain the source, validated, rejected, and
   unresolved identity ledgers exactly.
2. Continue native discovery after that bounded partial frontier. If native
   discovery succeeds, reconcile its candidates with the validated Spark
   subset. If native `search.list` reaches its exact daily-quota boundary,
   continue to semantic screening from the validated Spark subset.
3. Keep wholly rejected, zero-validated, missing, and otherwise ungrounded
   Spark attempts retryable. Do not broaden the native quota exception to
   generic provider errors or incomplete identity metadata.
4. Reconcile pre-release durable checkpoints carrying the old
   `AUTOMATED_SCOUT_IDENTITIES_UNRESOLVED` retryable boundary into the new
   bounded-partial projection only when their authoritative state contains a
   nonempty validated subset and unresolved identities. This preserves the
   existing signed-in acceptance session.
5. Make every discovery route use the same resolved-frontier rule so no route
   repeatedly returns the Spark boundary instead of advancing native discovery.
6. Production acceptance showed that a mixed native survey could retain every
   returned identity as complete while one search direction remained under a
   generic retryable access boundary. Bound that native search after its one
   attempt whenever a usable Spark frontier exists and no returned native
   identity is unresolved. Preserve a specific access boundary and migrate the
   retained pre-fix checkpoint. Generic identity or metadata failures remain
   retryable and cannot unlock screening.

## Verification

- Regress the partial Spark frontier, zero-validated fail-closed behavior,
  native success, exact native daily-quota exhaustion, generic native failure,
  and restored legacy checkpoint migration.
- Prove that only validated identities enter screening and unresolved IDs stay
  in diagnostics and final limitations.
- Prove that the bounded state cannot pass full final completion.
- Run focused tests, `npm run test:run`, and `npm run verify` under Node 24.18.0.
- Review the final diff and secret scan, pass protected pull-request checks,
  merge the exact head, deploy the exact merge commit with a rollback receipt,
  and verify production, plugin, and the preserved signed-in product session.

## Recovery and rollback

- Task branch: `agent/spark-partial-frontier-fallback-20260827`
- Baseline: `origin/main` at `9b4451043c667824ad6183010815e44a363d9f64`
- Worktree:
  `.worktrees/youtube-search-quota-fallback-release-evidence-20260827`
- Before deployment, preserve the current exact production image and Compose
  receipt. Roll back by restoring those exact artifacts; do not rewrite shared
  Git history.
