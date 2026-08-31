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
**ALIGNED** as last recorded by the reasoning supervisor. Typed completion
claim: **PARTIAL_OUTCOME**. Protected review, production, package
synchronization, and controlled-instruction installation completed, but fresh
ordinary-Chat product acceptance exposed only 21 of the 22 registered tools.
No terminal owner-outcome claim is made.

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
- Closeout lesson status at `2026-08-31T11:26:02.570Z`: 0 open, 0 needs
  review, 0 accepted-not-incorporated, 4 incorporated/closed, 0 deletion
  eligible.

## Protected merge, production, and package evidence

- PR #148 merged as
  `1e90b60bf743e9acc1b38b5464dc5581057761ca` at
  `2026-08-31T10:31:40Z`.
- The exact merge archive contained 709 members and had SHA-256
  `259d6a73307bb14449839de60c28218b77388ffcca59e491758a94304889f349`.
- Production runs image
  `askrigor-research:1e90b60bf743e9acc1b38b5464dc5581057761ca`, image ID
  `sha256:d3be6c3e11dc34146fd9bf38e06bf830ca88fb3df88ce6437395dacb93313443`,
  in healthy container
  `0ee98b06c8501dfe2871b3266a10484e5d71edd73cc30b1a645872b31cad69f3`.
  The container remains non-root, has a read-only root filesystem, drops all
  capabilities, and has `no-new-privileges`.
- The pre-release image remains reachable as
  `askrigor-research:rollback-readonly-frontier-1e90b60`, image ID
  `sha256:ff01d543194d60f771ad15475de2f6ab9c21f27b18872f37748f31f23e5435d6`.
  Rollback configuration is preserved under
  `/opt/askrigor/rollbacks/pre-1e90b60bf743e9acc1b38b5464dc5581057761ca/`.
- Direct production acceptance passed HTTPS health, both exact manifests,
  PubMed `40223676` as `api_visible_complete`, a truthful
  `not_found`/`not_indexed` frontier miss with currentness `not_assessed`, and
  the partial-corpus YouTube contract: 65 retrieved, 65 retained for bounded
  analysis, continuation available, completion incomplete, synthesis lock
  blocked, and no corpus-wide inference.
- Database role acceptance returned `askrigor_reader`,
  `transaction_read_only=on`, SELECT access to all 42 relations, zero missing
  SELECT grants, and zero write grants.
- The installed AskRigor package is
  `0.1.0+codex.20260831104512`. Its complete eight-member package SHA-256 is
  `fa45c89437048f12c70ad3af90987d451cbcf7b79a059a923d891487d893653d`;
  `skills/askrigor/SKILL.md` is
  `e8d54c6954a5409d6d3cabf5a6e75e59a06edeafcbdf2cb7ce703d566f74f586`.
  Prior source and installed package copies were preserved before refresh.
- The controlled Custom GPT editor saved the reviewed instruction text with
  its known single trailing-LF normalization: 4,751 editor characters,
  SHA-256
  `8389f4a05544f2e42ec32284c2acf8971db7f745c907200533aaaca706d8f352`,
  equal to the 4,752-character generated artifact after removing its final LF.

## Fresh primary-account product acceptance

The installed plugin was attached to a new ordinary primary-account Chat in
Chat mode with Extra High reasoning. The first bounded acceptance conversation
was `https://chatgpt.com/c/6a956069-53b8-83ea-99a6-78ccfb025105`.
After the plugin's explicit **Refresh** control, its settings enumerated all 22
registered operations, including `get_research_frontier`. A second fresh
ordinary-Chat acceptance was then run at
`https://chatgpt.com/c/6a95624a-2388-83ea-96ed-6955a944bef2`.

Both conversations received only 21 callable operations and omitted the final
`get_research_frontier` operation. Both truthfully refused to invent the
missing `not_indexed` result. In the refreshed run, the remaining bounded
checks passed:

- Universal `20.5.15` / `2026-08-24` /
  `69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`;
- HRP `20.5.24` / `2026-08-31` /
  `dd494d5665331e42b91232245dbba0392ecc9918d63b2638ef35c6e7528604d1`;
- PubMed `40223676` as `api_visible_complete` with one record and pagination
  exhausted; and
- YouTube `nIRABXSJwSw` as 65 retrieved/65 returned, partial, continuation
  available but unused, completion incomplete, and synthesis lock blocked.

The UI therefore demonstrates a product-surface discrepancy: plugin settings
can enumerate 22 operations, while a fresh attached Chat receives 21 and drops
the appended operation. This receipt does not choose which existing research
capability, if any, should be removed or consolidated to fit that product
surface. That is an unresolved product/architecture tradeoff, not an execution
detail.

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

- Operational alignment: **PARTIAL**. The implementation, production service,
  database boundary, package, editor instructions, and 22-operation plugin
  settings agree, but a fresh ordinary Chat receives only 21 operations and
  cannot invoke `get_research_frontier`.
- Scientific adequacy: **PASS FOR THE BOUNDED PARTIAL-CORPUS INVARIANT**.
  Retrieved
  partial-corpus records are reviewed and labeled; coverage denominators and
  limitations remain explicit; unseen records and corpus-wide properties are
  not inferred. The frontier operation itself performs no scientific synthesis.
- Release adequacy: **FAIL CLOSED AT PRODUCT INTERFACE**. Protected merge,
  production deployment, rollback, direct server acceptance, package readback,
  editor installation, and fresh headless primary-account acceptance all have
  receipts. The defining operation remains unavailable to ordinary Chat, so
  this release does not satisfy its product acceptance boundary.

Current-worker supervision hotfix receipt: the superseding bootstrap was read
in full from
`u-dont-existDOTcom/universal-dev-architecture`, branch
`architecture/codex-pro-supervision-mission-control-20260830`, path
`templates/CURRENT-CODEX-WORKER-SUPERVISION-BOOTSTRAP.md`. Existing evidence
was preserved; operational, scientific, and release adequacy remain separate;
no false terminal claim is made. No versioned chat-authored directive artifact
was available for choosing a 21-operation product contract, so
`SUPERVISION_DIRECTIVE_MISSING` applies to that unresolved strategy change.
Unaffected owner-authorized work may continue.

No universal supervision-rule change was identified. The corrected
eligibility-versus-completion distinction is a project scientific contract and
canonical HRP change, not a silent rewrite of universal supervision design.
