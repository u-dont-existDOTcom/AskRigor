# Auth0 evidence-gap production release — acceptance receipt

PR #155 merged the bounded Auth0-backed public evidence-gap release to `main`
as commit `7c0e589d50325de537ee042b4e3df3ed81adbd4b`. That exact source was built
and deployed as immutable image
`sha256:59abaee8b3ca08a30a5c4837526c6d84e8a056a9a582c8731a4762ecbffbab77`.
The public site is served from immutable release `7c0e589d5032`. The previous
image and configuration remain reachable through the recorded rollback tag and
directory.

The owner boundary did not change. AskRigor remains public: 22 research tools
and the evidence-gap contribution flow work anonymously, participant recovery
keys reach only the participant's own case, incomplete cases remain included
and labeled partial, and only cross-user private review requires OAuth scope
`cases:review`. Raw participant submissions are not public. Auth0 authenticates
the one owner/reviewer account; participants do not need Auth0 accounts.

Production acceptance passed health, public evidence-gap page, protected
resource metadata, Auth0 discovery, exact 23-tool MCP inventory, 22-tool Gemini
inventory, live Universal and HRP manifest hashes, one anonymous read-only
connector probe, and rejection of protected review without OAuth. A clearly
synthetic partial comparison case passed start, unprompted narrative, partial
details, submit, participant recovery inspection, public non-exposure, and
withdrawal. The withdrawn narrative is absent from the repository and live
review surface.

Migration `0008_public_evidence_gap_intake` is applied. The production intake
role can select, insert, and update only the intake table. Transactional probes
proved that it cannot delete, read another repository table, create a schema
object, or create a temporary table. The database is not publicly networked;
the application and database containers are healthy, read-only where declared,
and run with all Linux capabilities dropped.

The installed Codex plugin has the exact declared eight-file package inventory.
Every skill and asset matches the reviewed source. The manifest differs only by
the required cache-busted version; semantic normalization matches and the full
normalized tree receipt is
`59c13b699a7b966ff0afb390d51ae51b6ef80e4f131fe5491967a7c86d2c3a70`.
The live MCP catalog and canonical protocol manifests also match the release.

The exact source merge previously passed the complete deterministic gate: 121
test files passed with one declared skip, 1,581 tests passed with six declared
skips, and typecheck and build passed. On this receipt branch, typecheck plus
the release-packet, production-deployment, and OAuth-review suites pass 23/23;
both JSON receipts parse and `git diff --check` passes. The pre-closeout lesson
checkpoint is available with zero open, needs-review, accepted-but-not-
incorporated, or deletion-eligible entries and four incorporated/closed entries.

The primary ChatGPT account has a new mixed-auth connector named `AskRigor
Reviewer`. ChatGPT discovered the exact Auth0 endpoints, `client_secret_post`,
the `cases:review` scope, and both anonymous and signed-in connection modes.
The OAuth callback completed and ChatGPT shows a linked primary-owner
connection plus all 23 tool schemas. In a fresh Extra High Chat conversation,
ChatGPT called `review_evidence_gap_submissions` against one temporary synthetic
partial pregnancy/postpartum non-remission comparison case. It returned exactly
one total/partial/comparison case and zero remission/regression cases, preserved
all three missing-information categories, `PARTICIPANT_REPORTED_UNVERIFIED`,
false baseline/follow-up documentation flags, the explicit synthetic marker,
and `causalAnalysisPermitted: false`. No causal inference was made.

Cleanup is complete. The browser confirmation control for the temporary
synthetic case did not complete reliably, so the confirmed withdrawal was
applied at the production database boundary with exact submission ID,
pseudonym, creation timestamp, and `SUBMITTED` predicates. Exactly one row was
updated using the service's withdrawal semantics: narrative ciphertext,
structured data, consent, and missing fields were cleared; status is
`WITHDRAWN`; and the submitted review queue is zero. No real case was touched.

The superseded ChatGPT plugin `AskRigor` is uninstalled, the inert Auth0 CIMD
application `ChatGPT` is deleted, and the unused Auth0 `AskRigor Reviewer` role
is deleted. The working `AskRigor Reviewer` connector and confidential Auth0
application remain. A fresh post-cleanup call through that working connector
succeeded and returned zero total, partial, and comparison/non-remission queue
items.

During configuration, a superseded client-secret value became visible in a
controlled browser-tool trace. It was rotated immediately before any connector
used it. The replacement was transferred without rendering it, the clipboard
was cleared, and no credential or token is stored in Git. This sanitized event
is retained so the release record does not silently omit a credential incident.

Typed completion claim: `OUTCOME`. Operational alignment passes for the
deployed runtime, direct interfaces, and primary-account ChatGPT protected-
review product interface.
Scientific adequacy passes only for the bounded provenance, missingness,
participant-reported/unverified, partial-case, comparator, and noncausal
semantics; no causal or medical conclusion is claimed. Release adequacy passes.
