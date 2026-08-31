# Dedicated Read-only Research-frontier Tool Plan

Date: 2026-08-31

Task ID: `askrigor-living-evidence-frontier-readonly-tool-v1`

Branch: `agent/research-frontier-readonly-tool-20260831`

Baseline: `36aa56a44c9be4f35c29e20329961838163355ca`

Rollback: `rollback/main-pre-frontier-readonly-tool-20260831`

Assurance lane: release

## Objective reconciliation

| Source | Required objective | Alignment | Executable evidence |
| --- | --- | --- | --- |
| Owner | Make prior research a base for further research, including found sources, searched windows, unresolved questions, and unexplored trails | Aligned | Dedicated exact-selector frontier operation plus ordinary ChatGPT acceptance |
| Owner | Use one new operation rather than overloading an existing one | Aligned | Exact ordered registry grows from 21 to 22 with the original 21 unchanged |
| Owner | Keep writes and raw/community/private persistence out of this slice | Aligned | Read-only repository interface, restricted-reader acceptance, output schemas, privacy review |
| Canonical protocols | Preserve epistemic state and do not turn control metadata into evidence | Aligned | Typed limitations and `not_indexed` semantics; no scientific verdict synthesis |
| Project contract | Release through protected review, production, plugin sync, and fresh product acceptance | Aligned | Complete gate, PR checks, immutable image receipt, exact package receipt, headless primary-account run |
| Existing frontier architecture | Reuse the governed PostgreSQL projections and `getResearchFrontier` reader | Aligned | No migration; injected read-only adapter and real PostgreSQL acceptance |
| Owner correction | Partial corpora remain eligible for evidence review; label them partial instead of excluding retrieved records | Aligned | HRP 20.5.24, Project/plugin rules, partial-output samples, regressions, and product acceptance |

Worker-to-contract alignment and contract-to-owner alignment are tracked
separately in `tasks/ACTIVE-TASK.json`. The current typed completion claim is
`WORKING`.

## Bounded contract

Add `get_research_frontier` as operation 22. Accept exactly one of
`frontier_id`, `question_id`, or `topic_key`, with optional
`include_history=false`. Map that request to the existing canonical
`PostgresEvidenceRepository.getResearchFrontier` method. Return a strict public
envelope that distinguishes successful retrieval, not indexed, unavailable,
and sanitized operational errors.

Every response must state that frontier rows are research-control state rather
than evidence or a health conclusion. A missing match must not imply that no
external evidence exists. Existing frontier states, current candidates,
current trails, gaps, next capabilities, terminal boundaries, contribution
receipts, optional history, and canonical SHA-256 remain explicit and
unmodified.

The tool is always catalog-visible. Missing repository configuration yields a
typed unavailable response instead of silently shrinking the catalog. It is
read-only in MCP annotations and through the existing database reader. This
change adds no migration, write path, automatic contribution, source bodies,
provider bodies, chat/prompts, private health material, or YouTube/community
storage.

The owner additionally corrected the evidence-use boundary: every usable
record already retrieved from a partial corpus remains eligible for bounded
review. Preserve the partial label, observed denominator, exact retrieval
window, and limitations; do not extrapolate to unseen records. Completion and
broad-ranking locks may require more work, but cannot erase observed evidence.

## Implementation and verification

1. Lock the task and rollback ref, then require
   `npm run living-evidence:preflight` to report `READY`.
2. Add focused failing tests for selector exclusivity, mapping, nonempty
   success/history, not-indexed truth, unavailable/error sanitization,
   read-only annotations, Action/OpenAPI exposure, and exact ordered count 22.
3. Implement the operation in a small injected module and append it to the
   shared operation registry without changing the original 21-operation order.
4. Update current catalog contracts, generated inventory, submission packet,
   public-review instructions, repository maps, work queue, and AskRigor skill
   guidance. Historical 21-tool release receipts remain historical.
5. Run focused tests, real PostgreSQL nonempty acceptance, the complete
   applicable deterministic gate, inventory reproducibility, privacy/secret
   checks, and final diff review.
6. Commit, push, open protected review, reconcile all checks, and merge without
   rewriting shared history.
7. Preserve exact production rollback receipts, deploy only the reviewed
   research service image, and verify health, the ordered 22-tool catalog,
   protocol manifests, one read-only provider probe, production's truthful
   current `not_indexed` frontier result, and database read-only/no-write state.
8. Preserve the prior installed-package receipt, update/reinstall the exact
   reviewed AskRigor package, verify every manifest-declared skill and asset,
   then run a fresh headless primary-account ordinary ChatGPT acceptance that
   retrieves the production frontier state without inventing evidence.
9. Save exact operational, scientific, release, supervision, rollback,
   deployment, package, and product receipts; mark complete only when all
   required surfaces pass.

## Completion gates

- Operational alignment: exact selector and state semantics pass locally and
  in production.
- Scientific adequacy: the interface performs no scientific synthesis. For the
  owner-corrected partial-corpus behavior, adequacy requires inclusion of usable
  retrieved records, a partial label, observed-denominator/window limitations,
  and no extrapolation to unseen records.
- Release adequacy: protected merge, immutable deployment, exact 22-tool and
  protocol acceptance, restricted-reader proof, installed-package receipt,
  and fresh ordinary ChatGPT acceptance all pass.
- No completion claim while a required module or receipt is missing.
