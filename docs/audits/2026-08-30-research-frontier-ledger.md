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
after the final repair. Protected CodeQL reanalysis remains mandatory before
merge.

## Remaining release boundaries

- Complete protected review and merge before any production image or migration.
- Apply migration `0002` to the private VPS only from the exact merged image,
  preserve a database dump and prior-image rollback, verify both migration
  hashes and reader SELECT-only privileges on every new relation, then perform
  direct non-secret readback.
- No seed based on an actual user run is included. A later curated import must
  separately pass the field and source review.
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
