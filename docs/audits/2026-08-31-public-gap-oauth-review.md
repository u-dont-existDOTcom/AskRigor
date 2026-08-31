# Public AskRigor plugin with scoped case review — local receipt

Branch `task/public-gap-oauth-review-20260831` is stacked on public-intake
receipt commit `4130f4d9dd008cb1e47b1da1b6fbebf5382bf874`. Implementation commit
`f7a3c4131db915a66c7903ab171afac2f74310ef` keeps AskRigor public while
separating three authorization boundaries:

- 22 research tools and the public evidence-gap form remain anonymous;
- a participant's recovery key accesses only that participant's own case;
- `review_evidence_gap_submissions` requires a validated OAuth token with
  `cases:review` before retrieving stored submissions belonging to others.

The resource server publishes protected-resource metadata, declares per-tool
security metadata, emits a tool-level `mcp/www_authenticate` challenge, and
validates JWT signature, issuer, audience/resource, expiry, client identity,
and scope. Invalid or stale tokens are treated as unauthenticated and cannot
disable anonymous research tools. The tool reuses the existing redacted review
projection, preserves partial and comparison cases, and retains
`PARTICIPANT_REPORTED_UNVERIFIED` plus `causalAnalysisPermitted:false`.

Focused authorization/catalog/privacy verification passed 10 files and 142
tests. `npm run verify` passed typecheck, 121 test files with one declared skip,
1,579 tests with six declared skips, and build. `npm audit --omit=dev` reported
zero vulnerabilities. `git diff --check` passed. The lesson queue was available:
0 open, 0 needing review, 0 accepted-not-incorporated, 4 incorporated/closed,
and 0 deletion-eligible.

This is a local resource-server/tool outcome, not a public release. No external
identity provider was chosen or configured; no production deployment, plugin
installation, or fresh primary-account product acceptance occurred. Before
release, use an established OAuth provider, restrict `cases:review` to the
owner/reviewer identity, update the exact public processing/retention notice,
then deploy with rollback and perform fresh headless primary-account OAuth
acceptance.

Operational alignment passes locally. Scientific adequacy passes only for the
bounded provenance, missingness, participant-reported/unverified, comparator,
and noncausal review semantics; no scientific conclusion was produced. Release
adequacy is not applicable.
