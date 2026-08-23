# AskRigor agent map

## Authority

1. Current explicit owner correction and task requirements
2. Complete canonical `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml` bytes
3. `packages/protocol/src/index.ts` and protocol tests for byte-derived version, date, and SHA-256 manifests
4. `project/PROJECT_INSTRUCTIONS.md` for research routing and completion gates
5. `project/FORUM_SIGNAL_MODULE.md` when that module is required
6. Current source-access contracts, adapters, public MCP behavior, and tests
7. `docs/INDEX.md` for validation, privacy, public-review, and release evidence
8. `project/CODEX-CURRENT-STATE.md` for recovery only
9. Relevant current patterns from `u-dont-existDOTcom/universal-dev-architecture`

Never reconstruct a missing current protocol from chat memory. A manifest, hash,
router, module, status file, release record, generated excerpt, or lesson summary
cannot replace, truncate, or amend either complete canonical XML file.

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

### Release completion and plugin synchronization

For an authorized product change, source merge is an intermediate state. Keep
advancing through exact production deployment, direct acceptance, Custom GPT
editor installation, and fresh product-interface acceptance while those
surfaces are technically accessible and no genuine consequential boundary
intervenes.

At every backend or Custom GPT release, also verify the installed AskRigor
plugin against the release: exact 21-tool MCP catalog, live HRP/Universal
manifests, one read-only connector probe, and an exact installed-package
receipt covering `.codex-plugin/plugin.json`, `skills/askrigor/SKILL.md`, and
the packaged asset/inventory set. An unchanged catalog can become current
through the backend deployment without a package reinstall, but it does not
prove that the installed skill bytes are current. If installed-package bytes
cannot be read back, mark package currency unverified and reinstall the exact
reviewed package. Before refresh or reinstall, preserve a non-secret prior
package/registration receipt and an explicit rollback path. Never infer
plugin-package currency from source files, a working connector, or live
manifests alone.

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
