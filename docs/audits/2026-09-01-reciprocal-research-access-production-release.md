# Reciprocal research access — production release receipt

PR #159 merged the free-contributor/private-entitlement slice to `main` as
`2559e4d54261bb04fbe45d48d1e5051d6cf6640c`. That exact tree is deployed as
immutable image
`sha256:5f2ac653d1676d5234304a83eebb9856c069b18fc923ab661def36241d86998a`
in healthy research container `9967f75cf0c`. Migration
`0009_research_contributor_access` is applied and the public privacy and terms
pages are served from the same immutable release.

The production product boundary is now explicit. Ordinary research requires an
OAuth-authenticated account in either `FREE_CONTRIBUTOR` mode or already
entitled `PAID_PRIVATE` mode. Free mode requires the versioned reciprocal notice
and all four explicit agreement statements. Paid-private mode contributes
nothing and cannot be activated without a pre-existing verified entitlement;
there is no invented price or checkout. Eligible free-mode writes stop in a
private `PENDING_REVIEW` proposal inbox and never automatically modify canonical
evidence. Partial formal corpora remain eligible and are labeled partial.

The shared proposal boundary excludes raw chat and prompts, identity and
contact details, private health narratives, uploads, raw source or provider
bodies, credentials, and YouTube or community material. OAuth subjects become
only HMAC-SHA-256 account keys. The production runtime has no entitlement-grant
authority and no canonical-evidence writer authority.

Production database acceptance used a rollback-only synthetic transaction. The
restricted role could create a free-mode account and a partial pending proposal,
the security-definer withdrawal operation withdrew exactly one pending row, and
the trigger rejected a late proposal after revocation. The role's complete
table grant set is limited to select/insert/update on access accounts, select on
verified entitlements, and select/insert on pending proposals. The transaction
rolled back. After product acceptance, production contains one pseudonymous
active `FREE_CONTRIBUTOR` account and zero proposals.

Auth0 now publishes `research:use` and `cases:review`. The existing AskRigor
ChatGPT reviewer application has 2/2 user-delegated permissions, public signup
is enabled, and a fresh authorization request renders the AskRigor signup form.
No test account or synthetic email address was created.

Direct production acceptance passes public health, exact semantic equality for
the ordered 26-tool standard MCP catalog, the expected ordered 22-tool Gemini
catalog, protected-resource metadata with both scopes, Auth0 discovery, the
deployed privacy and terms bytes, and the production security envelope. The
research and PostgreSQL containers are healthy, use read-only root filesystems,
and drop all Linux capabilities. Production logs contain only the startup line.

The reviewed eight-file Codex plugin was cache-busted and reinstalled as
`0.1.0+codex.20260901013905`. The personal-marketplace source and installed
package are byte-identical at SHA-256
`f5579ccc6b8517aba0b9c36886aa619a25d1d4f26ded34164e0dcd232b526ecf`.
All non-manifest files match the reviewed merge, and the manifest matches after
normalizing only its required cache-buster version. The prior source package is
preserved at `/home/joel/plugins/askrigor.rollback-20260901T013905Z`.

The primary ordinary-Chat connector was refreshed and directly exposed all 26
expected tools exactly once. In a fresh Extra High conversation, AskRigor first
returned the exact reciprocal notice and stopped. A second explicit owner
message accepted all required free-mode statements; AskRigor returned
`ACTIVE`, `FREE_CONTRIBUTOR`, and notice version
`free-contributor-v1-2026-09-01`. The same conversation then returned exact
Universal `20.5.15` and HRP `20.5.24` manifest hashes, a bounded
`prolactinoma spontaneous remission` frontier `no_match` with currentness
`not_assessed` and an explicit non-absence limitation, and one authenticated
PubMed result (PMID `39082175`). The smoke test submitted no contribution. The
conversation is
`https://chatgpt.com/c/6a963748-9998-83e9-899b-cf4b18eaae22`.

The rollback directory contains the prior compose files and root-only runtime
configuration, exact prior container inspections, the prior site selector, and
a PostgreSQL custom-format dump with SHA-256
`a776edeb4e8ac3ee0573b094dfa487e4caa836cc239cb5c601b06d23cdb913e9`.
The previous image remains tagged
`askrigor-research:rollback-pre-2559e4d`.

Closeout validation ran on Node 24.18.0. Typecheck and 92/92 release,
deployment, installed-package continuity, OAuth, contributor-access, and public
site tests pass across eight files; both machine records parse and the final
diff passes whitespace validation.

Typed completion claim: `OUTCOME`. Operational alignment passes for the exact
production runtime, database authority, Auth0 configuration, public signup,
installed plugin, refreshed 26-tool connector, explicit free-mode consent, and
authenticated primary-account research calls. Scientific adequacy is limited
to preserving protocol identity, partial/gap/currentness state, and non-negative
no-match semantics; this release makes no scientific or causal conclusion.
Release adequacy passes.

The final lesson checkpoint at `2026-09-01T02:23:27.869Z` was available with
zero open candidates, zero needing review, zero accepted but not incorporated,
four incorporated or closed, and zero deletion-eligible.
