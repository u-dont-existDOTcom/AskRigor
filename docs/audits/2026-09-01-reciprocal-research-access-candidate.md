# Reciprocal research access candidate receipt

- Recorded: 2026-09-01T01:12:20Z
- Branch: `task/free-contributor-private-entitlement-20260901`
- Baseline: `1a413cb6f9e0cbdcedc84760bb9a9185b663382a`
- Reviewed implementation head: `dc9f0e59b2ae1d3a4c6d738b1d945a21743cd6d9`

## Outcome

The local vertical slice implements the owner's product rule. Connected free
research requires explicit versioned agreement that eligible deidentified
structured formal-research progress may be submitted for shared learning.
Paid private mode submits nothing and activates only for an already verified
entitlement; no price or checkout is represented.

The public runtime can store only a strict `PENDING_REVIEW` frontier or
source-analysis proposal. Partial formal corpora remain eligible and labeled
partial. The runtime cannot grant entitlements, decide a review disposition, or
write canonical evidence. Account revocation and pending withdrawal are one
transaction, and the database rejects a late proposal unless the account is
still active in free-contributor mode.

The repository stores an HMAC account key rather than the raw OAuth subject or
contact details. Proposal contracts exclude raw chat/prompts, private health
narratives, uploads, raw source/provider bodies, credentials, and all
YouTube/community data.

## Exact verification

- `npm run verify`: 124 passing test files, one declared skip; 1,602 passing
  tests, six declared skips; typecheck and build passed.
- `npm run contributor-access:acceptance`: deterministic checks and real
  PostgreSQL 17.6 migration/least-privilege acceptance passed.
- The PostgreSQL run proved partial pending insertion, idempotency, unchanged
  canonical counts, atomic withdrawal, late-insert rejection, admin-only
  entitlements, paid-private non-contribution, and HMAC-only stored identity.
- `npm run test:site` and all 28 site-deployment tests passed.
- Official plugin validation and AskRigor skill validation passed.
- The standard catalog contains 26 operations: 24 reads and two explicit
  non-destructive writes. Inventory SHA-256 is
  `d2d88cde0862a9255af240879416da220594e1a016eeaaa7ce4d3bc71828d5f4`.
- The eight-member source plugin package SHA-256 is
  `0da097c582db0482d8c4a6af8f7bc810c706f6352490e0b2b54948ca1ae9ff35`.
- The final pre-release lesson checkpoint reported 0 open, 0 needing review,
  0 accepted-not-incorporated, 4 incorporated/closed, and 0 deletion eligible.

## Adequacy

Operational alignment passes for the local implementation and real database
boundary. Scientific adequacy is not claimed because this slice collects and
routes structured research progress; it does not establish a health or causal
conclusion. Release adequacy remains pending protected merge, deployment,
Auth0 account-flow activation, exact installed-package synchronization, and a
fresh ordinary-Chat product acceptance.

The machine-readable companion is
`docs/audits/2026-09-01-reciprocal-research-access-candidate.json`.
