# Research-frontier catalog discovery — local candidate receipt

Task `askrigor-living-evidence-frontier-catalog-discovery-v1` is complete as a
local release candidate on `task/frontier-catalog-discovery-20260831` at
implementation head `b15d2b77023a6d85802a49d2511314d458a3f5d7`, based on
`27bcfdcdc8b7667eaf1da6076304fe3af4c2bd00`.

## Outcome

`search_research_frontiers` is standard MCP operation 23. A new ordinary
conversation can search stored topic keys, labels, aliases, questions, and
structured dimensions, receive exact frontier/question/topic selectors with
descriptive coverage state, and then call the existing operation-22 exact
lookup. Operation 24 remains the OAuth-scoped case-review tool.

The operation is read-only, adds no migration, and performs no automatic
contribution. It persists no request, raw source/provider content, personal
data, or YouTube/community material. A catalog match is research-control state,
not evidence or a health conclusion. Currentness remains not assessed; partial,
blocked, and coverage-gap counts remain visible; and a no-match result explicitly
does not mean external evidence is absent.

The standard catalog contains 24 tools, 23 anonymous and one OAuth-scoped. The
compact Gemini catalog remains at 22 because including the new schema exceeds
its enforced 25,000-byte compatibility budget. This preserves Gemini
compatibility while prioritizing the owner's primary ordinary-Chat plugin.

## Exact local verification

- Focused affected gate: 10 files and 129 tests passed.
- Real PostgreSQL gate: `npm run living-evidence:local` passed 42 checks,
  including lexical match, cross-field match labeling, gap projection,
  non-negative no-match, append-only integrity, dump/wipe/restore, and zero raw
  source/community content.
- Complete `npm run verify`: typecheck and build passed; 122 test files passed,
  one declared file skipped, 1,586 tests passed, and six declared tests skipped.
- Generated 24-tool inventory SHA-256:
  `0b223e5b5ff48aea39cce4ed7dfbd04b85b4ff5cab14d37c0c8f8cdc44fc7036`.
- Generated sync ledger SHA-256:
  `2c9aff7ef7208fd29a3beb7c134930dab39a74c75962cdf8758e3bf5b31d3e72`.
- Controlled Instructions remain 4,752 characters, SHA-256
  `2ac7368d003e8bef1eee243f9612f39ec88b4b07eb7df6a11125576575a2c514`.
- Exact eight-member source plugin package SHA-256:
  `8b6029a31ee878b49d0e71748fc51684ffd161c121e9fc9944dd3536f2050aa5`.
- Required pre-release lesson checkpoint was available at
  `2026-08-31T23:37:30.267Z`: zero open candidates, zero needing review, zero
  accepted but not incorporated, four incorporated or closed, and zero
  deletion-eligible.
- Final whitespace/diff check passed.

## Adequacy

- Operational alignment: pass locally for tool, registry, PostgreSQL, and
  restore behavior.
- Scientific adequacy: pass only for bounded lexical discovery, partial/gap
  preservation, currentness-not-assessed, and non-negative no-match semantics.
  The operation performs no scientific synthesis.
- Release adequacy: pending protected merge, immutable deployment, exact
  package synchronization, and fresh primary ordinary-Chat
  search-to-exact-lookup acceptance.

The remaining work is release execution, not another architecture or backend
expansion.
