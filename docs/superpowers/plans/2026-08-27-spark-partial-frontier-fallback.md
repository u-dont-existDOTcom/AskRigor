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
   Spark attempts retryable. Once the Spark frontier contains independently
   validated identities, a bounded native attempt cannot prevent screening:
   retain complete native identities and exclude incomplete identities with an
   explicit access boundary.
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
   attempt whenever a usable Spark frontier exists. Preserve a specific search
   access boundary and migrate the retained pre-fix checkpoint.
7. A second production read showed six complete native searches, 20 validated
   native identities, and 32 unresolved native identities. Bound that completed
   native identity attempt too, screen only the 26 independently validated
   Spark/native identities, and keep all 32 unresolved identities excluded and
   explicit. Migrate the exact durable retryable checkpoint shape without
   reopening native discovery.

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

## Completion receipt (2026-08-28)

- PR #117 merged as `34c52a23106c025ba4fae8813b49a45249284fce`.
- PR #118 merged as `0546732106c8cdec712a1ae71eb13552d9c0fe17`.
- PR #119 merged as `fa7f9d0521f192c658924b73b58eb5584e2b21b7` and is
  the exact deployed source.
- Protected verification passed 106 files and 1,426 tests, with one declared
  live file and six declared live tests skipped; workflow policy and all
  CodeQL analyses passed.
- Production image ID is
  `sha256:fef899dfacb4bb7505b234bdc2813bc979748e3782e7d74547f284415d31ed10`;
  active Compose SHA-256 is
  `20d7db364cd06968a4b5312f13214d97e6a324788e296c2dd0355f1e72f59ccc`.
- Immediate rollback preserves image ID
  `sha256:0850e840dc1bbef66d54ff5f58713a75b9282638669c83936f8c2fb0b34bb717`
  and Compose SHA-256
  `131d4488098a4577c3c75d8cb2cf208a8ce3034513b0515c73e74c63bb457347`.
- Public health/schema/auth/MCP/manifests, plugin connector and byte receipts,
  runtime security, and persistent mounts passed.
- The preserved production session now exposes 26 validated screening
  candidates, excludes 32 unresolved native identities, and emits
  `perform_semantic_work / candidate_screening` instead of retrying native
  discovery. The authorized signed-in retry then completed candidate and
  formal-source screening, accumulated 143 formal records, selected 17 videos,
  and advanced to transcript and discussion work. It ultimately stopped at the
  distinct retryable `DISCUSSION_DEPTH_RETRYABLE` provider boundary after one
  additional bounded server-owned recovery. Full product finalization remains
  deliberately unclaimed.
