# Research-frontier read-only tool and partial-corpus evidence receipt

Date: 2026-08-31

Task: `askrigor-living-evidence-frontier-readonly-tool-v1`

Branch: `agent/research-frontier-readonly-tool-20260831`

Baseline and rollback commit:
`36aa56a44c9be4f35c29e20329961838163355ca`

## Owner objective and reconciliation

This candidate adds one dedicated read-only `get_research_frontier` operation
so prior formal-research work can guide current delta discovery without being
treated as evidence, a cached answer, or a health conclusion. It also implements
the owner's correction that usable records from partial corpora remain eligible
for bounded evidence review. Partial coverage is labeled and limits corpus-wide
claims; it does not erase observed evidence.

Worker-to-contract alignment: **ALIGNED**. Contract-to-owner alignment:
**ALIGNED**. Typed completion claim: **WORKING**, because protected review,
production, installed-package synchronization, and fresh product acceptance are
still required.

## Implemented contract

- Operation 22 accepts exactly one trusted `frontier_id`, `question_id`, or
  canonical `topic_key`; `include_history` is optional and defaults false.
- The operation reuses the governed PostgreSQL reader and has no write path.
  Missing runtime configuration remains a typed unavailable state; the catalog
  does not silently shrink.
- Success preserves current lanes, passes, candidates, trails, gaps, next
  capabilities, terminal boundaries, receipts, optional append-only history,
  and the repository canonical hash. Currentness remains `not_assessed`.
- A missing selector result is `not_indexed` and explicitly does not mean that
  no external evidence exists. Repository errors are sanitized.
- No migration, automatic contribution, raw source/provider body, prompt/chat,
  private health material, YouTube/community persistence, credential, or opaque
  provider state was added.
- Both per-video and legacy YouTube community audits materialize usable records
  from an unfinished corpus. They retain `partial`/incomplete coverage and the
  continuation or completion lock, state the retrieved denominator and window,
  and prohibit extrapolation to unseen records or corpus-wide prevalence,
  direction, rarity, or typicality.
- HRP is `20.5.24` and makes evidence eligibility independent from completion,
  representativeness, and broad-ranking gates. Project, Forum Signal, MCP,
  controlled Custom GPT, and installed skill surfaces carry the same rule.

## Exact local evidence

- `npm run living-evidence:preflight`: `READY`; exact branch, baseline, and
  rollback ref reconciled.
- `npm run living-evidence:local`: **PASS** with 37 PostgreSQL acceptance checks.
  It directly retrieved nonempty frontier history, rejected the negative-
  evidence interpretation of a known miss, preserved append-only/database
  mutation guards, and passed dump/wipe/restore equivalence.
- PostgreSQL pilot canonical SHA-256:
  `f4170f9864d4230ce1cd9fc6f48e6b764838693daff3396bea48a9e85423ed3d`.
  Restore receipt dump SHA-256:
  `198603361546d5582dd4de9b6a57ae40cebab4b4a70d24d7578be624ac250f8c`.
  The receipt reported `raw_source_content_included:false` and
  `community_data_included:false`.
- Focused release/protocol/package/partial-corpus suite: 150/150 tests passed.
- Instruction regression repair suite: 47/47 tests passed; Project router is
  746 words and AskRigor skill is 699 words.
- `npm run verify`: **PASS** — typecheck, 1,559 tests passed, 6 skipped by
  design, and production build passed.
- `npm run test:site`: **PASS**, four public pages validated.
- `npm run test:site-deploy`: **PASS**, 28/28 tests.
- Skill validation: **PASS**. Plugin validation: **PASS**.
- `git diff --check`: **PASS**.
- Lesson status at `2026-08-31T10:04:17.301Z`: 0 open, 0 needs review,
  0 accepted-not-incorporated, 4 incorporated/closed, 0 deletion eligible.

## Byte-derived candidate identities

- HRP `20.5.24`, revision date `2026-08-31`, SHA-256
  `dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1`.
- Universal `20.5.15`, revision date `2026-08-24`, SHA-256
  `69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`.
- Exact 22-tool canonical inventory SHA-256
  `c23e9f3adf48110f4a7ce6882476274d28a81ec04810c18058370372425f21d8`.
- Controlled Custom GPT Instructions: 4,752 characters, SHA-256
  `2ac7368d003e8bef1eee243f9612f39ec88b4b07eb7df6a11125576575a2c514`.
- Controlled five-operation Action schema remains unchanged, SHA-256
  `cf7018c447baad2b1c9fce8d1ca880998863c2f15a4c3a36a9e672aec7e0d930`.
- Synchronization ledger SHA-256
  `f9390dce34c947cefb72553796bc29c4a77a1200194fad2ad40864a7b88de7fc`.
- Complete source plugin-package candidate has eight regular files, package
  SHA-256
  `0e9b73cd1db9c48be4b02570257a885c0f15b297e5f58c5d21f93eeae48e3c74`;
  `skills/askrigor/SKILL.md` SHA-256 is
  `e8d54c6954a5409d6d3cabf5a6e75e59a06edeafcbdf2cb7ce703d566f74f586`.

## Separate adequacy states

- Operational alignment: **PASS LOCALLY**. Exact-selector, state, read-only,
  catalog, repository, and sanitization behavior have executable evidence.
- Scientific adequacy: **PASS LOCALLY FOR THIS BOUNDED CHANGE**. Retrieved
  partial-corpus records are reviewed and labeled; coverage denominators and
  limitations remain explicit; unseen records and corpus-wide properties are
  not inferred. The frontier operation itself performs no scientific synthesis.
- Release adequacy: **PENDING**. It requires protected merge, immutable
  production deployment, direct 22-tool/protocol/read-only acceptance, exact
  installed-package readback, controlled-instruction installation, and fresh
  headless primary-account ordinary-ChatGPT acceptance.

No universal supervision-rule change was identified. The corrected
eligibility-versus-completion distinction is a project scientific contract and
canonical HRP change, not a silent rewrite of universal supervision design.
