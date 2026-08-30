# Durable formal research-frontier ledger

Date: 2026-08-30

Task ID: `askrigor-living-evidence-research-frontier-v1`

Status: release candidate verified locally and ready for protected review;
production migration and ordinary-Chat frontier access are not claimed by this
receipt

Protected review: PR #139

## Outcome

The living-evidence repository now has a separate, append-only formal research
frontier. It preserves where discovery looked and what remains to do instead of
serving only a prior final answer. The stable study-analysis contribution is
unchanged.

One strict frontier transaction contains:

- exact current protocol and research-run provenance;
- one topic, structured question, and stable formal-source lanes;
- de-identified queries with recomputed SHA-256 and byte counts;
- separate requested and confirmed half-open date windows;
- completion/access/exhaustion/count/limitation receipts;
- public formal candidate identifiers, titles, dates, relevance, decisions,
  reasons, and append-only correction lineage; and
- unresolved, unattempted, blocked, discriminator, coverage-gap, and delta
  trails with either an executable next capability or terminal reason.

The lane delta projection resumes at the earliest unresolved coverage gap. If
no gap is open, it resumes at the latest confirmed complete window end. Search
receipts and candidates remain research-control state, not evidence.

## Privacy and authority boundary

Every contribution asserts false persistence for raw source content, raw
provider responses, personal data, and community data. Strict schemas,
prohibited-key scanning, formal-only source classes, provider/URL rejection,
and database checks keep YouTube, comments, replies, channels, users, people,
and other community records outside this store. No raw source/provider body,
chat, prompt, credential, opaque continuation state, or private health narrative
is representable through the importer.

Only the one-shot administrator profile exposes `import-frontier`. It loads and
compares the exact current Universal and HRP manifests before writing one
serializable hashed transaction. The public service keeps its SELECT-only role,
has no automatic write-through, and the public MCP catalog remains exactly 21
tools. PostgreSQL rows and hashes are canonical; Obsidian and Mermaid outputs
identify themselves as deterministic non-authoritative projections.

## Migration and transactional evidence

Migration `0001_living_evidence.sql` remains byte-unchanged with SHA-256
`6a0489aee2a03514a20fc89f138d9e556c3077a6164538f93aa00d9f6eac55e0`.
New migration `0002_research_frontier.sql` has SHA-256
`eeeee1872c72bc5b67f1cd71797c6bcb11a4d8aee172763daa7a92a83e845200`.
The runner executes and verifies both recorded hashes in order inside one
transaction; an applied-byte mismatch rolls back.

The real PostgreSQL acceptance passed 35 checks. Frontier-specific checks prove:

- the immutable two-migration chain;
- initial insert and exact idempotent replay;
- requested/confirmed coverage and an earliest-gap delta projection;
- one comparable temporal coverage basis per lane, including across separate
  contributions;
- deterministic, markup-inert Obsidian/Mermaid rendering bound to a canonical
  snapshot hash;
- candidate and trail correction projection with full history retained;
- a candidate can link to an audited source family only when its source class
  is compatible and the records share an exact formal identifier;
- stale sibling correction rejection and transaction rollback;
- a gapped delta referring to an already stored pass cannot omit its gap trail;
- an externally linked delta cannot mislabel its temporal relationship;
- injected failure after pass insertion leaves no contribution or child rows;
- prohibited community fields fail before storage;
- database update/delete mutation fails; and
- repository export schema v2 includes frontier tables while declaring raw
  source and community content absent.

The disposable local pilot contains one nonempty frontier, one lane, two
complete passes, one formal candidate, and two open trails. It generates a
frontier Obsidian note and Mermaid map, exports the canonical repository, dumps
PostgreSQL, drops the exact schema, restores the dump, and reproduces canonical
SHA-256 `318edb08597feaae31a6fdb34b5320055bf7eb67f0659f94831ab657ba6d1b6b`.
The restored inventory includes 1 frontier, 1 frontier contribution, 2 passes,
1 candidate/version/identifier, and 2 trails/versions, with community data
declared absent.

Focused frontier-contract and production-deployment coverage passes 16 tests.
The complete `npm run verify` gate passes typecheck, 1,470 tests across 110
passing files with one declared file skip and six declared test skips, and the
production build. Four integration tests that exceeded their five-second
allowance under a 4-core host load above 15 all passed in an isolated 56-test
rerun; the correctness-suite default is now 10 seconds while explicit long-test
limits remain unchanged. `npm run test:site` validates all four public pages and
`npm run test:site-deploy` passes 28/28. Final diff, whitespace,
high-confidence secret, privacy, and exact 21-tool boundary reviews pass.

The release lesson checkpoint at `2026-08-30T14:01:21.897Z` is available: 0
open candidates, 0 needing review, 0 accepted but not incorporated, 4
incorporated or closed, and 0 deletion eligible. This project-specific storage
implementation adds no new transferable lesson candidate.

Protected CodeQL flagged incomplete backslash handling in the generated-view
encoders. The first repair made Mermaid backslash handling explicit; reanalysis
correctly retained the alert for the Markdown encoder because it still
introduced punctuation escapes after doubling input backslashes. A hostile-
label regression reproduces both boundaries. Both encoders now emit backslashes
and Markdown control characters as numeric entities, with no ambiguous escape
ordering. The focused 16-test set, typecheck, and complete 1,470-test gate pass
after the final repair. Protected deterministic verification, workflow policy,
and all CodeQL analyses passed. PR #139 merged as
`036c343343ceb5348b0907f81a1333a59d8bace7`.

## Production deployment and direct acceptance

The exact merge archive has SHA-256
`3d5ca762ef4c5f8fc745dc9cbc54fde700f1d3d912bb1cda8a78bff7832920a3`.
Its migration members reproduce both reviewed hashes. The pinned Node 24 image
built with zero audited dependency vulnerabilities and is labeled with the
exact merge revision. Production now runs
`askrigor-research:036c343343ceb5348b0907f81a1333a59d8bace7`, image ID
`sha256:ff01d543194d60f771ad15475de2f6ab9c21f27b18872f37748f31f23e5435d6`,
in healthy container `1a1e8d448f03`. The container remains user `node`,
read-only-root, capability-dropped, `no-new-privileges`, and attached only to
the prior public network plus the internal living-evidence network. PostgreSQL
remained healthy and unchanged as container `393070e563f1`; Caddy remained
running and unchanged as `297c59cfb620`.

Before migration, production contained exactly 30 living-evidence relations,
one source family, one analysis, and only migration `0001`. The one-shot
read-only-root administrator completed migration `0002`. Post-migration
readback found both exact migration hashes and 42 relations; the source-family
and analysis counts remained one, and all nine frontier tables contained zero
rows. The ordinary reader has database CONNECT, schema USAGE, and SELECT on
all 42 relations; no relation is missing SELECT, INSERT/UPDATE/DELETE/TRUNCATE
grant counts are all zero, and `transaction_read_only=on`.

The predeployment database dump is 143,692 bytes with SHA-256
`293e3d430224f98b3faa0b970e7c7e32cf7ad1daae3b9aaa85b046ea2ece41d9`.
The prior production image is preserved as
`askrigor-research:rollback-frontier-036c343`, image ID
`sha256:7aa19ebbbddedaaad326e9de9be0a446a31bdffdb171fd3e8e941afab7692e6b`.
Exact predeployment Compose, database, and image receipts are mode-bounded
under
`/opt/askrigor/rollbacks/pre-036c343343ceb5348b0907f81a1333a59d8bace7`.
Code rollback recreates only `research-mcp` from the prior image; data rollback
uses the preserved dump and is not implied by a code rollback.

Fresh public HTTPS health returned 200. MCP initialization and `tools/list`
matched the committed ordered 21-tool inventory. Universal remains `20.5.15`
with SHA-256
`69c5186862ade61d6a97dc842b8c027324c7e2f3fd7147064a360049e0d25172`;
HRP remains `20.5.23` with SHA-256
`bf2adc1c4daea8241c47b2a111d4a19e6bf7427a6401ecf1b3ba75a58e046299`.
The read-only connector probe returned PMID `40223676` as
`api_visible_complete`.

The direct stored-study boundary reacquired the exact LEAP source SHA-256
`395c3c3fe33ad3c2913be783301947ca5a92c2a0349ff141d168ff4024634f8c`,
read all 58 blocks/segments to exhaustion with one continuation, and advertised
repository version `fa1f2594-c385-46d5-a7ce-bd471c3b1fe0`. A deliberately
wrong version failed closed as
`fresh_study_audit_required / candidate_missing`. The exact version returned
`source_linked_study_audit_validated`, audit SHA-256
`678a0720b775f9518c753cf6d785b8e9fe6580e537d3ea7a25a13b4d578b4ff6`,
and `compatibility_revalidated:true`. No source body was persisted by this
acceptance.

## Installed package and primary product acceptance

Source and installed receipts each cover the exact eight declared plugin
members. Source version `0.1.0` has package SHA-256
`398aa93d489ffcf80be61b5e8b3be21e0a2ec90ca932d4abc966797c04479bca`;
installed cachebuster `0.1.0+codex.20260830020029` has package SHA-256
`0e4db5e82818bf321a5c9dce50b73357faeaf5c6333183cf99a679fef267329a`.
Their manifests are semantically identical after normalizing the expected
version field, and every non-manifest member is byte-identical. The installed
AskRigor skill SHA-256 remains
`5fb0f9c62de8163c93939de0e5bf382fe9da0dc60b6db481f252afad1546fed5`.
Because no packaged byte changed and all installed bytes were readable, no
reinstall was needed.

The owner-designated primary ordinary ChatGPT account exposed AskRigor as an
installed plugin with all 21 exact actions. A new Chat-mode/Pro conversation at
`https://chatgpt.com/c/6a944152-49b0-83e9-997e-3e84a6c5b614` attached AskRigor
and completed after `Worked for 57s`. Its terminal table returned exact
Universal `20.5.15`, HRP `20.5.23`, both revision dates and SHA-256 values, and
PMID `40223676` as `api_visible_complete`. Headless Brave initially encountered
a persistent Cloudflare interstitial; the same isolated profile passed after a
normal Linux Chrome user agent and software WebGL were enabled, without a
visible window. The 547 MB temporary profile and two screenshots were moved to
trash after acceptance. The owner's original browser profile and visible Brave
window were not modified.

The final release lesson checkpoint at `2026-08-30T14:54:12.586Z` is available:
0 open candidates, 0 needing review, 0 accepted but not incorporated, 4
incorporated or closed, and 0 deletion eligible.

Evidence-closeout PR #141 reached clean mergeability at exact prepared head
`0c3c53bee210dd481ccd00ca8d60e3520d5b49ba`: deterministic verification,
real-PostgreSQL acceptance and fixture pilot, workflow policy, and all CodeQL
analyses passed. The remaining task-state completion marker is metadata-only
and must pass the same protected review before merge.

## Remaining product boundary

- No seed based on an actual user frontier is included. A later curated import
  must separately pass exact field and formal-source review.
- This slice intentionally does not add a 22nd public MCP tool. Ordinary
  ChatGPT cannot yet search an arbitrary topic frontier through a dedicated
  public operation. Doing so requires the next catalog/integration decision;
  semantic overloading of an unrelated existing tool is prohibited.
- YouTube/community persistence remains zero pending the separate Google policy
  disposition and later exact field-level approval.

## Rollback

Source rollback is reachable at
`rollback/main-pre-research-frontier-20260830`, commit
`d446db7d1443058c24890d2cbe798cea1bccdba5`. Source rollback does not delete
append-only repository rows. A migration-data rollback uses the preserved
database dump; manual destructive row deletion is not part of this plan.
