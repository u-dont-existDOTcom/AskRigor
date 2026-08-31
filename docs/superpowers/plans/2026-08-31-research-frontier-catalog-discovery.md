# Research-frontier Catalog Discovery Plan

Date: 2026-08-31

Task ID: `askrigor-living-evidence-frontier-catalog-discovery-v1`

Branch: `task/frontier-catalog-discovery-20260831`

Baseline: `27bcfdcdc8b7667eaf1da6076304fe3af4c2bd00`

Assurance lane: iteration with a read-only privacy/data-integrity hard gate;
release assurance begins only at merge/deployment.

## Objective

Let a new ordinary AskRigor conversation discover relevant stored formal
research frontiers without already knowing a frontier UUID, question UUID, or
canonical topic key. This is the smallest prerequisite for using prior work as
a base for further research instead of treating the repository as an
exact-selector cache.

## Bounded contract

Add one public read-only MCP operation, `search_research_frontiers`, after the
existing exact `get_research_frontier` operation. It searches only stored topic
keys, labels, aliases, normalized questions, and structured question
dimensions. It returns exact selectors, descriptive coverage counts, explicit
partial/blocked/gap state, match fields, and `frontier_currency:not_assessed`.

The operation is lexical catalog discovery, not semantic evidence synthesis.
A no-match result means no indexed lexical match; it is not evidence that no
external evidence exists. A returned frontier remains research-control state,
not a scientific conclusion. The caller uses the returned selector with the
existing exact lookup before deciding what must be refreshed or extended.
The compact Gemini catalog remains on its prior 22-tool set because adding the
new schema exceeds its enforced 25,000-byte compatibility budget; the owner's
primary ordinary-Chat plugin uses the complete standard catalog.

## Non-goals

- no migration or ontology expansion;
- no vector database, embeddings, graph service, or editable Obsidian source;
- no automatic ordinary-run contribution or write path;
- no raw source, provider, chat, health, YouTube, comment, or community storage;
- no causal inference or autonomous scientific conclusion;
- no institutional research workflow, pilot, staffing, or recruitment layer.

## Verification

1. Focused schemas and mocked reader tests for match, no-match, unavailable,
   sanitized error, partial-state preservation, Action/OpenAPI exposure, and
   exact operation ordering.
2. Real PostgreSQL acceptance proving lexical discovery, exact selectors,
   gap/count projection, no-match truth, read-only transaction behavior, and
   dump/wipe/restore compatibility.
3. Generated MCP inventory, plugin skill, sync ledger, privacy map, work queue,
   and current-state reconciliation.
4. Complete deterministic gate, final diff/secret/privacy review, protected
   PR, immutable deployment, exact package receipt, and fresh primary ordinary-
   Chat acceptance if the release boundary is reached.

## Active lesson contract

- Product outcome over architecture: the slice is complete only when an
  ordinary conversation can find a prior frontier; another generalized backend
  subsystem is a failure.
- Owner correction against institutional drift: public AskRigor remains a
  practical research tool; no pilot/staffing/ethics-program requirements are
  introduced.
- Partial evidence remains usable: partial/gapped counts are returned and never
  converted into exclusion or corpus-wide extrapolation.
- Continuous completion: proceed through routine implementation and validation;
  pause only for a consequential decision or unavailable release authority.
- Exclusive task and recovery: this file and `tasks/ACTIVE-TASK.json` bind the
  task to this branch; stale worktree queues cannot replace it.
