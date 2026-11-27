# Atlas Traditions tab — local build

Owner answer 403 1b 2a, 22 November 2026. Source: the owner's build brief and approved design in the supplied release
folder. Implement the four sections, separate review labels, TCM/CCM disagreements, public pages and finding lines.
Adding a section changes one entry in `ATLAS_TRADITIONS`. Existing Health placements and visibility rules stay in force.

The current task ends at an uncommitted local build. No commit, push, network, paid inference, production command or
release record is authorized. The mandatory live UDA bootstrap was retrieved before the brief's no-network limit
was known. No further network is used. Live lessons and suggested-fix queue status are unavailable under that limit;
no counts are inferred. Additional live governance retrieval and GitHub handoff writes are likewise outside this build.

## Work

1. Add migration 0044, memory/PostgreSQL stores, reviewer grants and snapshot reads.
2. Add `label_traditions` and `list_traditions` to runtime review actions and later inputs only; preserve frozen lists.
3. Add section index and pages, the shared navigation tab, short cards, guarded disagreement links and full-page lines.
4. Document review wording, including blessed preparations, and record the owner's design choice.
5. Run focused and affected tests with two workers, frozen-list tests, typecheck, build and the full suite if practical.
6. Review the final diff and preserve local recovery and exact verification results in the release folder.

## Verification boundaries

These are rendering, storage and access checks, not research on traditional medicine or a scientific verdict. No
findings or tradition labels are published by this build. Migration execution against a real PostgreSQL instance is
reported separately from SQL contract checks and mocked adapter calls. The supplied worktree is the task's only
checkout; retain it while changes are uncommitted. Build outputs belong to the existing ignored package build trees.

## Implementation and closeout notes

The store, runtime review actions, pages, finding lines and documentation are implemented. Validation covers replacement
and removal, input bounds and enums, reviewer-only access, accepted F-number labels, duplicate publications, snapshot
reads, guarded text and links, counts, sorting, disagreement visibility and extending the section list. New runtime
values also require regenerating `check-report-vocabulary.ts`; the migration chain and exact reviewer grants have
matching acceptance inventories. Historical public-reach fixture bytes remain intact; its comparison excludes only
the exact new Traditions navigation line, which the new page tests verify separately.

The reports box reuses `/atlas/share`, as the current Health page does. The current repository has no three-choice
report prompt to copy; this build adds no new report-answer mechanism or stored report field.

Lesson closeout: when adding runtime review actions and migrations, update the generated diagnostic vocabulary and
exact input, grant and migration inventories together. Deduplicate accepted findings after resolving P-number labels,
so a label on a rechecked publication is retained. These are local engineering notes, not submitted lessons or a
change to scientific method. Full verification results and commands are in the release folder's `build-report.md`.

Storage closeout: no checkout or dependencies were created. Retain this task's supplied worktree because all changes
must stay uncommitted. Other actors' worktrees and existing dependencies are untouched. No Mastro session was launched.

Final checkpoint: typecheck and build passed. The complete suite passed with 7,423 tests passed and 8 skipped
(400 files passed, 3 skipped). Task-owned test processes stopped; the disposable local Vitest results cache was
removed. Retained the supplied worktree, dependencies and compiled output for review, with every source change
uncommitted as required. No release or GitHub handoff was performed.
