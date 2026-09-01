# Research-frontier catalog discovery — production release receipt

PR #157 merged the bounded read-only catalog slice as
`388e932e155af5c6000a7e3233ddb4672e3cff8e`. That exact tree is deployed as
image `sha256:83081706bf905966dd18260c5e5dec2004a2d5be30c352e94a3af1704a097926`
in healthy research container `26cce79dcf6d`. No migration was added; the
database and site containers were not recreated.

Direct production acceptance passes public health, the exact 24-tool standard
MCP catalog, the capacity-bounded 22-tool Gemini catalog, both canonical
protocol manifests, one anonymous read-only connector probe, and OAuth
rejection for private case review. `search_research_frontiers` returned the
truthful current production state for `prolactinoma spontaneous remission`:
zero lexical matches, currentness not assessed, and no claim that external
evidence is absent.

The prior image is preserved as
`askrigor-research:rollback-pre-388e932e155af5c6000a7e3233ddb4672e3cff8e`.
Both compose files are preserved under the matching rollback directory, and
their hashes plus the unchanged runtime-environment hash match the prior
release receipt.

The reviewed eight-file plugin package matched the merge at pre-cachebuster
SHA-256 `8b6029a31ee878b49d0e71748fc51684ffd161c121e9fc9944dd3536f2050aa5`.
It was reinstalled from the personal marketplace as
`0.1.0+codex.20260831234858`. The marketplace source and installed package are
byte-identical at SHA-256
`40fffb1192fa557928ab983cc4ca884c9bfd5db2e4fa139c09d40ce8ffac6713`;
all non-manifest members match the reviewed merge, and the manifest matches
semantically after normalizing only the cachebuster version. The exact prior
package remains at `/home/joel/plugins/askrigor.rollback-20260831T234831Z`.

Primary ordinary-Chat acceptance exposed and repaired one real cache boundary.
The first fresh Extra High conversation still saw the pre-release 23-tool
connector schema and correctly refused to invent the requested operation. The
AskRigor Reviewer management surface was then refreshed and directly showed
all 24 expected tools, including `search_research_frontiers`.

The first post-refresh conversation called the operation once but received a
retryable repository error while simultaneous direct MCP acceptance remained
healthy. A second fresh post-refresh conversation then called
`AskRigor_Reviewer.search_research_frontiers` exactly once with the requested
query and limit. Its visible tool receipt returned `no_match`, zero results,
`not_assessed` currency, all three limitation classes, and the explicit rule
that no stored lexical match does not mean no external evidence exists. The
successful conversation is
`https://chatgpt.com/c/WEB:10e7dd9e-7542-4a2f-9e1a-8eee0c2510ec`.

Typed completion claim: `OUTCOME`. Operational alignment passes for the
production runtime, direct MCP behavior, complete installed package, refreshed
24-tool connector schema, and fresh primary-account product interface.
Scientific adequacy passes only for bounded lexical discovery, explicit
partial/gap/currentness state, and non-negative no-match semantics; the
operation performs no scientific synthesis. Release adequacy passes.

The final lesson checkpoint at `2026-09-01T00:02:54.363Z` was available with
zero open candidates, zero needing review, zero accepted but not incorporated,
four incorporated or closed, and zero deletion-eligible.

Closeout validation parsed both machine records, passed `git diff --check`,
passed typecheck, and passed 21/21 release, production-deployment, and
installed-package continuity tests across three files.
