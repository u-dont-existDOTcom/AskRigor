# Traditional-system account implementation (owner answer 402a)

Authority: the owner's 22 November 2026 implementation brief and approved “The fix, in four places” text.
Scope: uncommitted changes on `claude/systems-rule-20261122` only; no push, commit, deployment or paid API call.

1. Copy the approved HRP pointer and module verbatim; add the revision and twelve non-runtime stress cases.
2. Copy the approved screen and planner guidance, bump the patch/rubric versions, and update current pins and docs.
3. Preserve historical protocol fixtures with an exact rewind; check XML, core bytes, section summary and text identity.
4. Run the required focused tests and full suite with at most two workers; review all changes and report results.

Active constraints: owner wording is locked (literal comparison); unrelated source and historical records are
protected (diff and rewind hash); tests use two workers; all changes stay local and uncommitted.
UDA activation: live default-branch root and selected preservation, bounded-execution, continuation and delivery
rules loaded through the owner bootstrap and `project/DEVELOPMENT_INHERITANCE.md`. Direct owner maintenance
is the authority path; no autonomous delegated work or scientific-method choice is introduced.

Status: owner-requested local implementation complete; all requested tests passed. No commit, push or release performed.

Checks completed:
- HRP 20.6.45, revisionDate 2026-11-22: the next patch after 20.6.44, following the prior approved wording fix.
- HRP SHA-256: `475ee5aad42fdc0bba03f786eefa4e19bc17cd9b95f4ddd7e4aef3a600c54039`.
- XML valid; core sections total 39,983 bytes (39,995 with serving separators); module index Purpose 237 characters.
- Approved module exact bytes and both guidance strings match the supplied approved file.
- Rewind reproduces all original HRP bytes; historical fixture hashes and revision records remain unchanged.
- Rubric version 2026-11-22.2; twelve short non-runtime stress cases added; 61 HRP sections.
- Canonical vocabulary generator output equals the changed generated file; regenerated with its --write option.
- Build passed. Focused tests passed: 52 files, 776 tests, 93.19 seconds.
- Full suite passed: 400 files passed, 3 skipped; 7,506 tests passed, 8 skipped; 485.79 seconds.
- Final diff review and whitespace check passed; all changes remain uncommitted on the specified branch.

Commands (Node 24.18.0; each npm/node command uses
`PATH=/home/joel/.nvm/versions/node/v24.18.0/bin:$PATH`):

```bash
npm run build
node --import tsx scripts/generate-check-report-vocabulary.mts --write
npm run test:run -- --maxWorkers=2 tests/*protocol*.test.ts tests/research-steering.test.ts tests/research-planner.test.ts tests/mcp-tools.test.ts tests/research-frontier-repository.test.ts tests/whole-argument-reconstruction-structure.test.ts tests/owner-research-lessons.test.ts tests/research-dossier-instructions.test.ts tests/interview-evidence-integrity.test.ts tests/epistemic-phase-routing.test.ts tests/clinical-management-preservation.test.ts tests/longitudinal-evidence-preservation.test.ts
npm run test:run -- --maxWorkers=2
npm run lessons:status
git diff --check
```

The first focused attempt (48 files: 18 failed, 30 passed; 246 tests: 6 failed, 240 passed; 36.88 seconds) found
missing local build outputs and historical core comparisons/version pins; these
were repaired before the successful run. The sandbox blocks loopback listeners and some child-process operations
(EPERM); the following sandbox attempt was interrupted, its leftover test processes were identified by exact
worktree/command/start identity and stopped, and the successful focused run used authorized host execution.
Full-suite execution also uses the host. No paid model or live-provider test was requested or run.

Lesson queue (available through maintainer authentication): 51 open candidates, 14 needs review, 1 accepted but
not incorporated, 41 incorporated or closed, 3 deletion eligible. No unrecorded lane files; two unrecorded open-PR
items: cold-reader answer check and squat/testosterone first-turn physiology regression. These are outside this
owner-specified implementation scope.

No approved text could not be applied as written. The older steering-plan document's 2026-11-22.1 description is
historical and intentionally preserved; the current rubric documentation is 2026-11-22.2.

Closeout: no new checkouts were created. This worktree is retained because it contains the explicitly requested
uncommitted implementation. Other registered checkouts belong to other workstreams and were left alone. The five
task-created dist directories, five tsconfig.tsbuildinfo files and temporary logs/snapshots were removed after the
tests; they did not exist before this task. The supplied node_modules directory is retained as inherited input.
The interrupted sandbox test processes and completed host runs have stopped. No Mastro session was launched.

Active-contract result: PASS — exact approved bytes/strings verified; no unrelated source changes; historical
HRP reconstruction verified; required focused/full tests passed with --maxWorkers=2; no commit/push/deploy or paid
API action. The specified local outcome is SATISFIED. Production release and product-interface acceptance are
outside this brief, which explicitly stops at an uncommitted working tree.

Resume: on the laptop, read this file and review the uncommitted diff in `claude/systems-rule-20261122`; do not
commit, push or deploy without a new owner instruction.
GitHub handoff and the separate laptop handoff folder are not updated: the current brief forbids commit/push and
writing outside this worktree.

## Changed files

- `README.md` — current HRP version and hash.
- `apps/research-mcp/src/check-report-vocabulary.ts` — regenerated current protocol version.
- `apps/research-mcp/src/research-planner.ts` — approved planner guidance; rubric 2026-11-22.2 and history.
- `apps/research-mcp/src/research-steering.ts` — approved first-screen constant and placement.
- `docs/design-decisions.md` — owner answer 402a, rationale and rejected option b.
- `docs/research-contributor-access.md` — current screen and planner documentation.
- `docs/superpowers/plans/2026-11-22-traditional-system-account.md` — local plan, verification and recovery record.
- `protocols/HRP_Full.xml` — 20.6.45, exact pointer/module, revision and twelve stress cases.
- `scripts/instruction-layering-profile.json` — current HRP version pin.
- `tests/accepted-lessons-protocol-2026-10-12.test.ts` — current HRP version/hash pin.
- `tests/card-rule-wording-protocol-2026-11-04.test.ts` — historical core comparison at its original version.
- `tests/clinical-management-preservation.test.ts` — current HRP version/hash pin.
- `tests/contested-evidence-protocol-2026-10-12.test.ts` — current HRP version/hash pin.
- `tests/diminishing-returns-protocol-2026-10-11.test.ts` — current HRP version/hash pin.
- `tests/epistemic-phase-routing.test.ts` — current HRP version/hash pin.
- `tests/full-text-search-protocol-2026-10-10.test.ts` — current HRP version/hash pin.
- `tests/handoff-target-protocol-2026-10-12.test.ts` — current HRP version/hash pin.
- `tests/helpers/undo-safety-limits-disclosure.ts` — rewind the new change before historical fixtures.
- `tests/helpers/undo-traditional-system-account.ts` — exact rewind to HRP 20.6.44.
- `tests/interview-evidence-integrity.test.ts` — current HRP version/hash pin.
- `tests/lab-preparation-protocol-2026-10-11.test.ts` — current HRP version/hash pin.
- `tests/longitudinal-evidence-preservation.test.ts` — current HRP version/hash pin.
- `tests/mcp-tools.test.ts` — current HRP version/hash pin.
- `tests/mobile-notice-protocol-2026-10-15.test.ts` — current HRP version/hash pin.
- `tests/owner-answer-193-protocol-2026-10-29.test.ts` — current HRP version/hash pin.
- `tests/owner-question-109-protocol-2026-10-17.test.ts` — current HRP version/hash pin.
- `tests/owner-question-125-protocol-2026-10-20.test.ts` — current HRP version/hash pin.
- `tests/owner-question-149-protocol-2026-10-22.test.ts` — current HRP version/hash pin.
- `tests/owner-question-161-protocol-2026-10-22.test.ts` — current HRP version/hash pin.
- `tests/owner-question-93-protocol-2026-10-15.test.ts` — current HRP version/hash pin.
- `tests/owner-questions-103-104-protocol-2026-10-16.test.ts` — current HRP version/hash pin.
- `tests/owner-questions-152-153-protocol-2026-10-21.test.ts` — current HRP version/hash pin.
- `tests/owner-questions-86-89-protocol-2026-10-14.test.ts` — current HRP version/hash pin.
- `tests/owner-questions-90-92-protocol-2026-10-14.test.ts` — current HRP version/hash pin.
- `tests/owner-questions-97-99-protocol-2026-10-16.test.ts` — current HRP version/hash pin.
- `tests/owner-research-lessons.test.ts` — current HRP version/hash pin.
- `tests/protocol-sections.test.ts` — 61-section index pin.
- `tests/protocol.test.ts` — current HRP version/hash pin.
- `tests/read-depth-protocol-2026-10-11.test.ts` — current HRP version/hash pin.
- `tests/research-dossier-instructions.test.ts` — current HRP version/hash pin.
- `tests/research-frontier-repository.test.ts` — current HRP version/hash pin.
- `tests/research-planner.test.ts` — rubric version, exact guidance and placement.
- `tests/research-steering.test.ts` — exact guidance and ordering in every style.
- `tests/response-spread-protocol-2026-11-05.test.ts` — historical core comparison at its original version.
- `tests/review-provenance-protocol-2026-10-12.test.ts` — current HRP version/hash pin.
- `tests/safety-limits-protocol-2026-11-22.test.ts` — current HRP version/hash pin.
- `tests/study-map-single-leads-protocol-2026-11-05.test.ts` — historical core comparison at its original version.
- `tests/traditional-system-account-protocol-2026-11-22.test.ts` — module identity, core/summary bounds, cases and rewind.
- `tests/whole-argument-reconstruction-structure.test.ts` — current HRP version/hash pin.
- `tests/words-are-not-sizes-protocol-2026-11-09.test.ts` — current pins and historical core comparison.
