# Open health options and living traditions (owner answer 410b)

Authority: the owner's local `build-brief.md` and approved `v2.md` in
`/home/joel/askrigor-releases/20261122-options-rule/`, 22 November 2026.
Scope: local, uncommitted implementation on `claude/options-rule-20261122`;
no commit, push, network, deployment or paid API call.

1. Preserve the approved wording exactly in HRP, screen guidance and planner step 3.
2. Use HRP 20.6.46 and rubric 2026-11-22.3; update current pins and documentation.
3. Add eleven non-runtime stress cases and exact structural regression tests;
   preserve historical protocol fixtures through an exact rewind to 20.6.45.
4. Run protocol, steering, planner and frozen-list tests with two workers, then
   typecheck and build; review the diff and record results here.

Preservation checks: approved text identity, both approved Purpose openings in the index,
unchanged core section bytes (39,983), unchanged Universal bytes, exact historical
HRP reconstruction, and ask-first stops before research guidance in both outputs.
Meaning remains the model's judgment; tests check declared text and structure.

For the treatment-landscape Purpose, retain the old second sentence after the
approved replacement. The community gate's Purpose and rules discuss completion
and acquisition but do not restate selection-space adequacy versus each selected
discussion pool's acquisition depth. Its index summary is checked separately.

Instruction activation: live UDA default-branch root AGENTS.md and lesson index
were retrieved during the mandatory bootstrap, before the local brief revealed
its no-network restriction. No further network access is permitted. Current
task-specific authority overrides general commit/publication/online-status steps;
no research-protocol execution or new scientific decision is claimed. Relevant
preservation and continuation rules are enforced by literal comparisons, history
rewind and the requested deterministic tests. Further live UDA pattern retrieval
and lesson/suggested-fix queue status are unavailable under the no-network rule;
unavailable is not a zero count. Historical queue totals are not current evidence.

Status: the requested local implementation is complete; all required checks pass.
The specified outcome is SATISFIED. No commit, push or release is authorized.

Base commit: `9c117aa7344cde90ec8a2ee46a3616d3e8b3f21e`.
Source SHA-256 receipts:
- `build-brief.md`: `ffb09141de2943208aa8b056f6589b915cb8ab7e73baa909b5646aa3be2f8f3b`.
- `v2.md`: `918c34751be23920b6ed3005627480f51d4bfb13cc9e25006ffbe5eb88e58f58`.

Verified results:
- HRP `20.6.46`, revisionDate `2026-11-22`, SHA-256
  `d7dd99297c422faa381ef4ecb0db1a95ed0ad27ed52a1f574fc458c47dab6e65`.
- Planner rubric `2026-11-22.3`.
- All five approved pieces match the supplied source exactly, allowing only XML
  and rubric line wrapping. The XML rule block matches every byte of v2.md.
- Option b's two new sentences match exactly. The old second sentence is retained
  after them for the reason recorded above; no approved piece required alteration.
- TraditionalSystemAccount Purpose and index summary: 209 characters, complete.
- TreatmentLandscapeAndVideoSelectionGate Purpose: 347 characters with the retained
  sentence; index summary: 240 characters. Both approved new sentences are fully
  visible before the summary truncates the retained sentence.
- All seven core sections are byte-identical to the baseline: 39,983 bytes in total.
  Universal is byte-identical. The section count remains 61.
- Eleven new non-runtime stress cases cover every requested scenario. The exact
  rewind reproduces the complete prior HRP SHA-256, preserving historical fixtures.
- Text and structured next steps carry the new guidance after 402a for guided,
  balanced and autonomous, with and without redirecting questions; ask-first stops
  remain first. The integration tests cover both MCP surfaces.
- The new steering/planner tests were run before implementation: 14 failed as
  expected, proving they detect the missing change (274 unrelated tests skipped).
- Final focused run: 54 files passed, 817 tests passed, 89.71 seconds, exit 0.
  This includes the requested glob plus nine other tests whose current pins changed.
- `npm run typecheck`: passed, exit 0. Final `npm run build`: passed, exit 0.
- Generated check-report vocabulary equals the generator's output exactly. Exact
  diff review confirms 35 files contain only current version/hash pin updates.
- Final diff review and `git diff --check`: passed. All changes are uncommitted.

Commands used (each npm/node command had the exact prefix
`PATH=/home/joel/.nvm/versions/node/v24.18.0/bin:$PATH`):

```bash
npm run build
npm run test:run -- --maxWorkers=2 tests/research-steering.test.ts tests/research-planner.test.ts --testNamePattern='open health options'
npm run test:run -- --maxWorkers=2 tests/*protocol*.test.ts tests/research-steering.test.ts tests/research-planner.test.ts tests/*frozen*.test.ts
npm run test:run -- --maxWorkers=2 tests/*protocol*.test.ts tests/research-steering.test.ts tests/research-planner.test.ts tests/*frozen*.test.ts tests/mcp-tools.test.ts tests/research-frontier-repository.test.ts tests/whole-argument-reconstruction-structure.test.ts tests/owner-research-lessons.test.ts tests/research-dossier-instructions.test.ts tests/clinical-management-preservation.test.ts tests/epistemic-phase-routing.test.ts tests/interview-evidence-integrity.test.ts tests/longitudinal-evidence-preservation.test.ts
npm run typecheck
npm run build
node --import tsx scripts/generate-check-report-vocabulary.mts > /tmp/askrigor-options-rule-20261122/check-report-vocabulary.ts
cmp apps/research-mcp/src/check-report-vocabulary.ts /tmp/askrigor-options-rule-20261122/check-report-vocabulary.ts
git diff --check
```

The first requested suite attempt stalled in the sandbox and was interrupted
(exit 130); its exact runner and known workers were verified stopped before the
authorized host retry. The first host run had 44 files pass and one fail (646 tests
passed, one failed, 71.82 seconds): an escaped regex current-version pin remained
at 20.6.45. That pin and all four matching pins outside the requested glob were
updated before the final successful 54-file run. Local HTTP test listeners require
host execution here; no live-provider or paid-inference test was run. Test logs
were temporary and their results are preserved in this plan.

Closeout: reuse the supplied worktree and node_modules. Retain the worktree for
the explicitly requested uncommitted diff; do not alter other actors' checkouts.
No Mastro session is needed. Remove only disposable task-created build outputs
and temporary files after verification, preserving inherited outputs.

Resume: read this plan, the build brief and v2.md; review the uncommitted diff in
the supplied worktree. Do not commit, push or deploy without new owner authority.
GitHub handoff is unsaved because the brief forbids commit, push and network.

Final closeout: host process inspection found no remaining task test/build
processes. Removed the five task-created dist directories and five tsbuildinfo
files, which were absent at the baseline. The temporary task logs, snapshots and
comparison files were also removed after recording their results here. Inherited
node_modules is retained; no other actor's checkout or cache was touched. This
worktree is retained for the requested uncommitted implementation, so it cannot
be removed as a clean reproducible checkout. No Mastro session was launched.

The prior 402a plan and historical rubric/version mentions remain historical;
current pins and current screen/rubric documentation use the new versions.
Lesson/suggested-fix queue status remains unavailable under the explicit local
no-network boundary. No queue totals or new queue dispositions are inferred.

## Changed files

- `README.md` — current HRP version and SHA-256.
- `apps/research-mcp/src/check-report-vocabulary.ts` — current HRP version; generator equality verified.
- `apps/research-mcp/src/research-planner.ts` — approved step-3 guidance, rubric version and history.
- `apps/research-mcp/src/research-steering.ts` — approved exported constant in the screen and all framing next steps.
- `docs/design-decisions.md` — 410b choice, rationale and rejected option a.
- `docs/research-contributor-access.md` — current screen and rubric guidance.
- `docs/superpowers/plans/2026-11-22-options-from-living-traditions.md` — implementation plan, authority, exact checks, commands and results.
- `protocols/HRP_Full.xml` — approved rule and Purposes, inventory class, revision and eleven stress cases.
- `scripts/instruction-layering-profile.json` — current HRP version pin.
- `tests/accepted-lessons-protocol-2026-10-12.test.ts` — current HRP version and/or hash pin.
- `tests/clinical-management-preservation.test.ts` — current HRP version and/or hash pin.
- `tests/contested-evidence-protocol-2026-10-12.test.ts` — current HRP version and/or hash pin.
- `tests/diminishing-returns-protocol-2026-10-11.test.ts` — current HRP version and/or hash pin.
- `tests/epistemic-phase-routing.test.ts` — current HRP version and/or hash pin.
- `tests/full-text-search-protocol-2026-10-10.test.ts` — current HRP version and/or hash pin.
- `tests/handoff-target-protocol-2026-10-12.test.ts` — current HRP version and/or hash pin.
- `tests/helpers/undo-options-from-living-traditions.ts` — exact rewind to every byte of HRP 20.6.45.
- `tests/helpers/undo-traditional-system-account.ts` — rewind 410b before the historical 402a layer.
- `tests/interview-evidence-integrity.test.ts` — current HRP version and/or hash pin.
- `tests/lab-preparation-protocol-2026-10-11.test.ts` — current HRP version and/or hash pin.
- `tests/longitudinal-evidence-preservation.test.ts` — current HRP version and/or hash pin.
- `tests/mcp-tools.test.ts` — current HRP version and/or hash pin.
- `tests/mobile-notice-protocol-2026-10-15.test.ts` — current HRP version and/or hash pin.
- `tests/options-from-living-traditions-protocol-2026-11-22.test.ts` — approved XML, index, core, stress and rewind regressions.
- `tests/owner-answer-193-protocol-2026-10-29.test.ts` — current HRP version and/or hash pin.
- `tests/owner-question-109-protocol-2026-10-17.test.ts` — current HRP version and/or hash pin.
- `tests/owner-question-125-protocol-2026-10-20.test.ts` — current HRP version and/or hash pin.
- `tests/owner-question-149-protocol-2026-10-22.test.ts` — current HRP version and/or hash pin.
- `tests/owner-question-161-protocol-2026-10-22.test.ts` — current HRP version and/or hash pin.
- `tests/owner-question-93-protocol-2026-10-15.test.ts` — current HRP version and/or hash pin.
- `tests/owner-questions-103-104-protocol-2026-10-16.test.ts` — current HRP version and/or hash pin.
- `tests/owner-questions-152-153-protocol-2026-10-21.test.ts` — current HRP version and/or hash pin.
- `tests/owner-questions-86-89-protocol-2026-10-14.test.ts` — current HRP version and/or hash pin.
- `tests/owner-questions-90-92-protocol-2026-10-14.test.ts` — current HRP version and/or hash pin.
- `tests/owner-questions-97-99-protocol-2026-10-16.test.ts` — current HRP version and/or hash pin.
- `tests/owner-research-lessons.test.ts` — current HRP version and/or hash pin.
- `tests/protocol.test.ts` — current HRP version and/or hash pin.
- `tests/read-depth-protocol-2026-10-11.test.ts` — current HRP version and/or hash pin.
- `tests/research-dossier-instructions.test.ts` — current HRP version and/or hash pin.
- `tests/research-frontier-repository.test.ts` — current HRP version and/or hash pin.
- `tests/research-planner.test.ts` — exact guidance, placement, version and structured MCP result regressions.
- `tests/research-steering.test.ts` — exact screen/next-step text across styles and framing branches.
- `tests/review-provenance-protocol-2026-10-12.test.ts` — current HRP version and/or hash pin.
- `tests/safety-limits-protocol-2026-11-22.test.ts` — current HRP version and/or hash pin.
- `tests/traditional-system-account-protocol-2026-11-22.test.ts` — preserve 402a byte checks through the exact historical view.
- `tests/whole-argument-reconstruction-structure.test.ts` — current HRP version and/or hash pin.
- `tests/words-are-not-sizes-protocol-2026-11-09.test.ts` — current HRP version and/or hash pin.
