# Continuation handoff: semantic reviewer v0.2 after desktop-app regression

Recorded: `2026-09-12T01:04:13Z`

## Durable task identity

- Pull request: `#215` (`Prepare semantic representation review v0.2`)
- Branch: `task/epistemic-semantic-review-v02-contract-20260911`
- Pre-handoff head: `6ce36d10d54ea62b8f9dfeb65ca5a457970ecdd0`
- Development phase: `DEVELOPMENT / DISCOVERY`; no production integration is authorized by this run.
- The scorer key remains unopened by the reviewer execution.

## Frozen reviewer state

- Planned reviewer sessions: `66`
- Frozen reviewer sessions: `32`
- Valid ingest receipts: `30`
- Explicit invalid/indeterminate ingest errors: `2`
- Sequence `33` has not been generated or submitted.
- The next required durable checkpoint is after sequence `40`.

This state was reconciled against the artifact tree at handoff: it contains
exactly 32 reviewer session directories, 30 `ingest-receipt.json` files, two
`ingest-error.json` files, and no directory beginning with `033-`.

The next frozen dispatch entry is:

- sequence: `33`
- replicate: `2`
- candidate: `MUTV02-A45506610272`
- input: `evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract/adjudication/inputs/MUTV02-A45506610272.txt`
- input SHA-256: `36af2056b0244687065a21fe68d95a4be230d8da3c0f731bc344a727fa4ca6c4`

Do not recreate, reorder, or rerun sequences 1 through 32.

## Desktop app and browser recovery state

The earlier receipt
`reviewer/iab-crash-diagnosis-after-032.json` correctly records the original
isolated-browser lifecycle and IPC failure, but its proposed update repair was
falsified by direct testing:

1. ChatGPT desktop `26.908.31748` installed successfully and passed package-file
   and shared-library integrity checks.
2. Its local Codex app-server initialized successfully, but the renderer failed
   on every tested launch with the sanitized error `TypeError: n is not a
   function` in `AppRoutes`, producing the visible `ChatGPT hit a snag` page.
3. A launch with a disposable Electron user-data directory reproduced the same
   renderer failure, so clearing the real profile is not justified.
4. The cached `26.903.61454` package was extracted without installation and its
   binary launched against the same account/project state. The primary route
   mounted successfully and its isolated-browser backend reported ready.
5. At this handoff, that temporary known-good build is the active ChatGPT window.
   The system-installed package remains `26.908.31748` and is held with
   `apt-mark`; the actual downgrade has not completed.
6. The owner's first downgrade paste split the package path at a newline. Apt
   rejected the directory argument, the package filename was treated as a
   separate command, and only `apt-mark hold chatgpt` succeeded.
7. The computer-use inventory attached to the present conversation still
   exposes only the Brave extension provider. Do not use Brave as a reviewer
   fallback. Resume only from a fresh desktop conversation in which the
   built-in `@Browser`/`iab` provider is actually available.

No reviewer output was generated during diagnosis, no scorer material was
opened, and no existing reviewer artifact was changed.

## Exact continuation procedure

1. Locate the worktree for the branch above with `git worktree list --porcelain`.
   Reconcile `git status --short --branch`, `git rev-parse HEAD`, and the branch's
   upstream before touching reviewer artifacts.
2. Complete the rollback as two independent shell commands so the package path
   cannot be split:

   ```bash
   cd /var/cache/apt/archives
   sudo apt-get install --yes --allow-downgrades ./chatgpt_26.903.61454_amd64.deb
   ```

3. Verify the durable package state:

   ```bash
   dpkg-query -W -f='${Version}\n' chatgpt
   apt-mark showhold
   ```

   The expected version is `26.903.61454`, and `chatgpt` should remain held.
4. Fully close the temporary ChatGPT process, then launch ChatGPT normally from
   the installed package. Do not delete or clear the real profile.
5. Start a fresh ChatGPT/Codex desktop conversation with the built-in Browser
   selected. Verify that the available computer-use surfaces include `iab`.
6. If `iab` is still absent, stop reviewer execution and update this handoff with
   the new sanitized blocker. Do not switch to Brave and do not create sequence
   `33` artifacts.
7. If `iab` is available, resume the frozen dispatch exactly at sequence `33`,
   preserving the existing model/mode, one-tab limit, at-least-60-second accepted
   submission spacing, raw-output freeze, normalization, ingest, and provenance
   procedure used by sequences 1 through 32.
8. After sequence `40` is durably ingested, write and commit the required
   checkpoint before continuing.

## Future desktop-update preflight

Keep ChatGPT held until a newer candidate has been downloaded without installing,
verified, extracted into disposable storage, and launch-tested for primary-route
rendering, local app-server initialization, project access, and isolated-browser
availability. Retain the last known-good package and exact rollback command.
Only then unhold and install the exact tested candidate. This is a project-local
application of the already-current universal transactional-update pattern, not
a new transferable lesson.

## Evidence pointers

- `reviewer/checkpoint-032.json`
- `reviewer/checkpoint-032-browser-unavailable-after-codex-relaunch.json`
- `reviewer/iab-crash-diagnosis-after-032.json`
- `reviewer/dispatch-order.json`
- `reviewer/pre-generation-freeze.json`
- Official Linux app guidance: <https://learn.chatgpt.com/docs/linux/linux-app>
