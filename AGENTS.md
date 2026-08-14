# AskRigor agent map

## Authority

1. Current owner and task requirements
2. `project/PROJECT_INSTRUCTIONS.md` for research routing and completion gates
3. `project/FORUM_SIGNAL_MODULE.md` when that module is required
4. `docs/INDEX.md` for validation, privacy, public-review, and release evidence
5. Current code, tests, artifacts, and Git history
6. Relevant current patterns from `u-dont-existDOTcom/universal-dev-architecture`

Never reconstruct a missing current protocol from chat memory.

## Validation

- Runtime: Node 24.18.0 (`.nvmrc`)
- Install: `npm ci`
- Targeted tests: `npm run test:run`
- Complete deterministic gate: `npm run verify`
- Public-site checks when affected: `npm run test:site` and `npm run test:site-deploy`
- Live/provider smoke only when explicitly required and credentials are available: `npm run test:live`

## Workflow

Use an isolated worktree or task branch and a pull request. For complex work,
maintain a committed plan under `docs/superpowers/plans/`. Keep hermetic CI
separate from live checks. Run the complete applicable gate, inspect results,
review the final diff, update release/privacy documentation when affected, and
complete lesson closeout before reporting completion.

### Lesson-queue checkpoints

Run `npm run lessons:status` using the maintainer's local GitHub authentication:

- at the start of every AskRigor development session;
- before designing a change related to the lesson queue or a relevant lesson category;
- before every release or deployment; and
- whenever the user asks for AskRigor project status.

Report the available result concisely: open candidates, needs review, accepted
but not incorporated, incorporated or closed, deletion eligible, and any
requested relevant-category count. An unavailable result is not a zero count:
report that status is unavailable and its allowlisted reason instead of
inventing queue totals.

Unreviewed lessons cannot silently expand the current task's scope or block an
unrelated release. Bring a potentially critical lesson relevant to the current
work to the user's attention and obtain direction before expanding scope.

## Branch roles

- `main`: canonical public source and release baseline
- task branches: proposed implementation, documentation, protocol, or evidence changes

## Safety

Do not commit credentials, private user data, raw private research content, or
unrestricted provider output. Preserve explicit inaccessible, partial,
deferred, and error states. Health/research policy and substantive protocol
changes require owner judgment.

## Code review rules

- A required module or receipt cannot be treated as complete without its executable evidence; strong evidence from another layer does not silently deselect it.
- Do not synthesize a full verdict while the project router says required work is incomplete or blocked.
- Preserve the privacy data map and bounded live-validation contract; never broaden collected or exported data accidentally.

Treat chat as disposable working memory. A fresh worker must be able to recover
from this repository without the old transcript.
