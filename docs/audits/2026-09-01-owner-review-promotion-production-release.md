# Owner review and promotion — production release receipt

PR #161 merged the owner-review bridge to `main` as
`bfc2918476d2c4d5ae9b01df6c3a603fd3418596`. That exact tree is deployed as
immutable image
`sha256:8bcfc2c8cc60b8f4f8af830a5115e2068e11f1857180ae4ce3156562c3d8a4da`
in healthy research container `4230d0de22d7`. Migration
`0010_research_contribution_review` is applied, and production contains exactly
ten migrations.

The release adds one owner-only `review_research_contribution` operation. An
authorized owner can inspect the immutable structured proposal projection and
explicitly accept or reject the exact proposal SHA-256. Acceptance creates an
exact hash-bound promotion intent atomically; a separate one-shot process owns
the canonical writer credential and records one durable promotion receipt. The
public runtime does not receive that credential. No scientific acceptance is
automatic, and no scheduler was activated.

This remains an ordinary public product, not an institutional research program
or pilot. Eligible deidentified structured research progress can enter the
private proposal queue only under the existing reciprocal-contribution
agreement. Partial formal corpora remain usable and labeled partial. Raw chat,
identity/contact data, private health narratives, uploads, provider bodies,
credentials, and YouTube/community material remain outside this bridge.

The production review role has zero direct table grants. It can execute only
the bounded inspect and decision functions: inspecting a random nonexistent
proposal returns zero rows, while direct proposal-table reads and temporary
table creation are denied. The review runtime contains exactly four configured
review keys. The separate one-shot promoter returned
`no_pending_promotion`; production remained at zero proposals and zero
promotions.

The exact production container runs as `node`, uses a read-only root filesystem,
drops all capabilities, and enables `no-new-privileges`. The health response is
exact, the standard MCP exposes all 27 ordered tools including the new review
operation, and the compact Gemini surface remains unchanged at 22 tools.
OAuth protected-resource metadata publishes exactly `research:use` and
`cases:review`. Universal `20.5.15` and HRP `20.5.24` have the exact canonical
SHA-256 manifests recorded in the machine receipt.

The generated synchronization ledger has SHA-256
`6d6e86e1b999cc13f5d431281858caf3a489769861351dbb65d0eb0538f17df3`.
The unchanged controlled Instructions remain 4,752 characters with SHA-256
`2ac7368d003e8bef1eee243f9612f39ec88b4b07eb7df6a11125576575a2c514`.

The reviewed eight-file Codex plugin was cache-busted and reinstalled as
`0.1.0+codex.20260901124016`. The personal-marketplace source and installed
package are byte-identical at SHA-256
`02c41b473c23a5442d72c65e8346b6986451d26c2fe68e297cd3532067084ae1`.
The complete declared inventory is recorded in the machine receipt. The prior
source package is preserved at
`/home/joel/plugins/askrigor.rollback-20260901T123900Z`.

The primary ordinary-Chat connector was refreshed in headless Brave without
touching the user's visible browser. It exposed all 27 expected tools exactly
once. A fresh Extra High conversation returned active free-contributor access,
the exact Universal and HRP manifests, one complete authenticated PubMed record
for PMID `40223676`, and `no_pending_proposal` from the new inspect operation.
The call explicitly reported that canonical evidence did not change. No
contribution was submitted, accepted, rejected, or promoted. The acceptance
conversation is
`https://chatgpt.com/c/6a96cc25-558c-83e9-8719-2bfb42b6c0ba`.
Both temporary browser-profile clones were removed after normalization and
shutdown; the original profile was not modified.

The rollback directory contains the prior compose/runtime inputs, container
inspections, living-evidence scripts, and a root-only PostgreSQL custom dump
with SHA-256
`ba2b29b84d04d7f8ae11c42fa84bc0e5673f7cb17aef73d95fc3df1b1363da96`.
The previous image remains tagged `askrigor-research:rollback-pre-bfc2918`.
One initial activation wrapper restored the prior runtime through its exit trap
after additive migration 0010 had applied. An isolated check then proved the
function-only grants, and exact activation and all acceptance checks completed.
This recovery changed no user or proposal data.

The protected product PR passed deterministic verification, workflow policy,
and all CodeQL jobs before merge. The exact image built locally, its no-secret
security gate passed, and PostgreSQL 17.6 migration/authority acceptance passed.
The Node 24.18.0 closeout passes typecheck and 48 focused release, deployment,
review, authorization, configuration, and plugin-package tests across seven
files. Its first focused run correctly detected that the current-state rewrite
had dropped the unchanged generated synchronization identities; restoring those
exact identities made the gate pass. Both machine records parse and the final
diff passes whitespace validation. The receipt-only protected closeout remains
to be merged as PR #162.

Typed completion claim: `OUTCOME`. Operational alignment passes for the exact
merge, production runtime, database least privilege, one-shot promotion runner,
installed plugin, refreshed connector, and primary ordinary-Chat acceptance.
Scientific adequacy is preserved but not expanded: the owner still makes the
proposal decision, and this release makes no scientific or causal conclusion.
Release adequacy passes.

The final lesson checkpoint at `2026-09-01T13:09:01.569Z` was available with
zero open candidates, zero needing review, zero accepted but not incorporated,
four incorporated or closed, and zero deletion-eligible.
