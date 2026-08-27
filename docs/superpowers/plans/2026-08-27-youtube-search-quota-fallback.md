# YouTube search-quota resilience and comment-page efficiency

## Goal

Keep controlled AskRigor research useful after the dedicated daily YouTube
`search.list` allocation is exhausted, and reduce `commentThreads.list` request
overhead by using the provider's 100-item page maximum.

## Authority and scope

- Owner direction on 2026-08-27 authorizes the larger comment page and asks
  that AskRigor continue to work after the 100-search daily limit.
- The external Gemini/Spark candidate frontier remains mandatory and must be
  independently identity-validated before native YouTube discovery starts.
- A native search-quota boundary must remain explicit. It must not be projected
  as completed native discovery or full platform coverage.
- Generic rate limits, provider errors, incomplete metadata, and unresolved
  identities remain retryable blockers. Only the dedicated `search.list`
  daily-quota error may end native search for the current execution and allow
  screening of already validated candidates.
- No canonical protocol text, privacy collection, public tool catalog, or
  credential handling changes are in scope.

## Design

1. Map YouTube `search.list` `quotaExceeded` responses to a distinct,
   non-secret error code while preserving `access_status: rate_limited`.
2. When a native survey is incomplete only because one or more search receipts
   have that exact code, and all discovered identities are reconciled, record a
   terminal boundary for the immutable research execution. Continue with the
   validated Spark/native candidates already present; retain the literal
   rate-limited search receipts and a boundary explaining the coverage gap.
3. Do not retry that terminal native-search step in a loop. The resulting
   execution remains bounded by the missing independent search lane; a later
   session after quota reset can run native discovery again.
4. Raise the controlled comment-thread page request from 20 to 100. Preserve
   the existing per-call provider/time budgets, exact page fingerprinting,
   within-page continuation offsets, overlap reconciliation, and 60 kB Action
   response bound. The resumable audit does not expose an unfinished segment's
   raw comments, so the larger provider page does not enlarge partial Action
   responses.

## Verification

- Add source tests for distinct search-quota mapping and ordinary rate-limit
  behavior.
- Add candidate/controller/advance tests proving exact quota exhaustion
  advances to screening while generic failures and unresolved identities do
  not.
- Add pagination tests proving 100-item requests, exact within-page resume, and
  no duplicate or omitted identifiers.
- Run focused tests, `npm run test:run`, and `npm run verify` under Node
  24.18.0.
- Review the final diff, record lesson disposition, open a pull request, pass
  protected checks, merge, deploy the exact merge commit, and perform required
  production/plugin acceptance where accessible.

## Recovery and rollback

- Task branch: `agent/youtube-search-quota-fallback-20260827`
- Baseline: `origin/main` at `d8229a1`
- Worktree: `.worktrees/youtube-search-quota-fallback-20260827`
- Before production deployment, preserve the current production version and
  deployment identifier. Roll back by redeploying that exact prior version;
  do not rewrite shared Git history.

## Completed release receipt

- PR #114 merged exact head `785270e8a3d363cb51a4b5a587433ae1c92bc887`
  as `f2b39d637fef95b95b80ef4252a07a739aa5d151` after all protected
  checks passed.
- Exact archive: 550 members, 1,695,059 bytes, SHA-256
  `79156c9d5fd1af1c54c9bdd824d92c646d8fe4226068505d4bb0ead043ce5c95`.
- Live image ID:
  `sha256:2f9f9be37cbc75fb2f2e835b09b1b95aa525f321b618917079fdc9e61d69aaf7`;
  healthy container `9d952deda964`; active Compose SHA-256
  `b716ee0609877e76b60b6b1ce5e27f4f938f683878131778a1631ae22f1bbd84`.
- Rollback image ID:
  `sha256:2a6ac954f85bf3529187bdf7e690f59864e954854597f04bc4a68d7d26fb5945`;
  rollback Compose SHA-256
  `f8c942fb370a29bcc23121cb594a2d120208b87ccfd408ad4fd2b46b7e9effbc`.
- Public health, exact five-Action semantic equality, unauthenticated 401,
  21-tool MCP inventory, both canonical manifests, read-only installed
  connector, and complete source/installed plugin receipts passed. No editor
  import or plugin reinstall was required because those surfaces are unchanged.
- A live discussion audit stopped at a generic retryable YouTube 403 during
  reply reconciliation. It does not stand in for the deterministic exact
  `search.list` quota-fallback regressions, and no full product-acceptance
  receipt is claimed.
