# Durable research-frontier ledger

Date: 2026-08-30

Task ID: `askrigor-living-evidence-research-frontier-v1`

Assurance lane: release, with hard gates for privacy, truthful coverage, and
append-only correction lineage

Status: ready for protected merge

## Objective

Extend the PostgreSQL living-evidence repository so a later AskRigor run can
resume from the exact research frontier created by earlier work instead of
merely retrieving a prior answer. The durable frontier must show what formal
source lanes were searched, the requested and actually confirmed date windows,
which candidates were screened and why they were selected, excluded, deferred,
or left unresolved, which research trails remain executable or blocked, and
where a safe delta search should resume.

This is repository control state, not evidence. A stored candidate, search
receipt, map node, or prior analysis never becomes proof of a health claim
without the existing source-bound inspection and validation gates.

## Owner-approved boundary

- Preserve complete AskRigor-authored study/review analysis to the extent
  performed, including later clarification and correction versions.
- Use prior runs as a base for further research: retain found studies, searched
  windows, unresolved questions, unattempted or blocked trails, and delta state.
- Keep raw source bodies, provider responses, chat, prompts, personal health
  narratives, credentials, and authorization material outside durable storage.
- Keep all YouTube/community rows at exactly zero until the separate Google
  policy disposition and a later exact field-level approval.
- PostgreSQL remains canonical; Obsidian and Mermaid outputs are deterministic,
  rebuildable views rather than authority.

## Record model

Migration `0002` adds only append-only tables and projections:

1. A stable research frontier belongs to one existing structured question.
2. A stable lane identifies one formal-source search surface and provider.
3. A frontier contribution is one idempotent, hashed, sanitized transaction.
4. A discovery pass records a de-identified query, requested window, confirmed
   window, access/completion status, counts, receipt, and delta relationship.
   Requested work is never misreported as confirmed coverage.
5. A candidate has stable formal identifiers and append-only decision versions.
   Candidate versions may later be corrected or superseded without deletion.
6. A trail has append-only state versions for unresolved questions, unattempted
   searches, blocked sources, discriminator follow-up, coverage gaps, and delta
   searches. Every nonterminal state names an executable next capability;
   terminal blocked states name a bounded reason.
7. Current projections select only lineage leaves. Historical versions and
   failed or partial passes remain exportable.

Formal candidate kinds in this release are study, review, guideline, registry,
book, grey literature, and other formal material. Video, comment, reply,
channel, user, and person-level identities are deliberately not representable.

## Truthful coverage and delta rules

- Date windows are half-open: `[start, end_exclusive)`.
- Every lane uses one temporal coverage basis; publication-date, index-date,
  and unscoped coverage require separate lanes so their delta state is never
  compared as though equivalent.
- A complete pass is exhausted and, when a requested window exists, confirms
  that exact window.
- A partial pass is not exhausted and names the next executable capability.
- A retryable block names both a bounded reason and next capability. A terminal
  block names a reason and cannot pretend to cover a window.
- Contiguous, overlapping, and gapped deltas link to a prior pass in the same
  lane and are checked against its confirmed window.
- A gapped delta must create or carry an explicit coverage-gap trail for the
  missing interval. The projection exposes the gap instead of advancing the
  apparent continuous frontier through it.
- Search counts satisfy selected <= screened <= retrieved, and submitted
  candidate decisions reconcile with the pass counts.

## Interfaces

- Keep the stable study-analysis contribution contract unchanged.
- Add a separate `ResearchFrontierContribution` contract, preparation function,
  transactional `contributeFrontier` writer, and idempotent receipt.
- Add a read-only frontier query returning current candidate/trail projections,
  complete history, unresolved coverage gaps, and lane-specific delta state.
- Add writer-only `import-frontier` admin support with current protocol identity
  and the existing bounded-stdin/privacy gates.
- Add deterministic Markdown/Obsidian and Mermaid renderers over a returned
  frontier snapshot.
- Include the new canonical tables in repository export schema v2. Historical
  v1 export hashes remain historical receipts; no old receipt is relabeled.

The public MCP catalog remains exactly 21 tools in this slice, as required by
the current project release contract. Exposing repository-wide frontier search
to ordinary ChatGPT is the next integration boundary: it requires an explicit
catalog decision or a separately verified reuse of an existing operation, not
semantic overloading during this storage change.

## Test-first verification

Focused tests must first fail, then prove:

- strict contracts and nested prohibited-key rejection;
- no representable YouTube/community source class or identity field;
- requested versus confirmed window coherence;
- complete/partial/retryable/terminal state invariants;
- contiguous, overlap, and gap delta validation;
- mandatory gap trails and explicit next capabilities;
- candidate and trail append-only lineage, stale-branch rejection, and current
  projections;
- exact identifier and compatible source-class validation before a candidate
  may link to an audited source family;
- idempotent replay, payload collision rejection, transactional rollback, and
  database update/delete rejection;
- deterministic export, Obsidian, and Mermaid bytes;
- correction, freshness, and unresolved-state visibility; and
- preservation of every existing living-evidence and 21-tool contract.

Run targeted unit tests, the real-PostgreSQL acceptance wrapper, complete
`npm run verify`, privacy and release tests, final diff/secret review, and the
lesson checkpoint. Before any production migration, move this task to the
release lane, rerun the checkpoint, preserve exact database/source rollback,
and verify migration hashes, reader grants, export/readback, and zero community
rows. No production write or public-interface claim follows from local tests.

## Recovery and rollback

The isolated branch is `agent/research-frontier-ledger-20260830`. Baseline and
integration commit are `d446db7d1443058c24890d2cbe798cea1bccdba5`; the reachable
source rollback ref is `rollback/main-pre-research-frontier-20260830`.

Migration `0001` is immutable. `migrate()` must verify every previously applied
migration hash before applying `0002`. Source rollback does not delete frontier
rows; the new tables are append-only and may remain dormant. A production
database restore is the rollback for migration corruption, not destructive
manual row deletion.

## Lesson disposition

The current universal executable-frontier, living-Mermaid, provenance, and
assurance-lane patterns directly apply. This task adds project-specific formal
research state unless implementation evidence reveals a genuinely transferable
failure not already covered by those patterns.
