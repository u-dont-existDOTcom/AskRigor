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

Use an isolated worktree or task branch and a pull request. For complex work, maintain a committed plan under `docs/superpowers/plans/`. Keep hermetic CI separate from live checks. Run the complete applicable gate, inspect results, review the final diff, update release/privacy documentation when affected, and complete lesson closeout before reporting completion.

## Branch roles

- `main`: canonical public source and release baseline
- task branches: proposed implementation, documentation, protocol, or evidence changes

## Safety

Do not commit credentials, private user data, raw private research content, or unrestricted provider output. Preserve explicit inaccessible, partial, deferred, and error states. Health/research policy and substantive protocol changes require owner judgment.

## Code review rules

- A required module or receipt cannot be treated as complete without its executable evidence; strong evidence from another layer does not silently deselect it.
- Do not synthesize a full verdict while the project router says required work is incomplete or blocked.
- Preserve the privacy data map and bounded live-validation contract; never broaden collected or exported data accidentally.

Treat chat as disposable working memory. A fresh worker must be able to recover from this repository without the old transcript.
