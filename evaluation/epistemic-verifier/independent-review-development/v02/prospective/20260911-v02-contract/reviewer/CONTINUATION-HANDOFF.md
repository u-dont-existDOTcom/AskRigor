# Continuation handoff: semantic reviewer v0.2 checkpoint 60

## Latest durable checkpoint: 60 of 66

Recorded at `2026-09-12T19:51:22.223Z` in `reviewer/checkpoint-060.json`.
There are **60 frozen sessions: 55 valid and 5 indeterminate**. In sequences
51–60, only sequence 52 failed deterministic source-span validation; its exact
raw/normalized output and error are preserved without content retry. The other
nine passed ingestion. Checkpoint 50 was committed and pushed as `bef5c31`
before sequence 51 was submitted.

The checkpoint integrity audit passed for dispatch identities, unique observed
message IDs, raw/normalized/provenance hashes, frozen inputs and original
session preservation, required model/mode/independence, and submission spacing.
Status reads after submissions 54 and 59 timed out, but accessibility checks on
the same tab confirmed generation; neither prompt was resubmitted. No scorer
access, browser substitution, paid API inference, or production change occurred.

Next: **sequence 61**, replicate 3, `MUTV02-4E5FF33C884A`, input SHA-256
`a9a4da8f9fc0d56fc4bae26dc6d5a6c73c1b0e4f285240624761e3b70fc7773f`.
After committing/pushing this checkpoint, continue through **66** under the
current owner authorization. Do not regenerate sequences 1–60 or open scorer
material. The sections below retain earlier checkpoint/recovery history.

## Latest durable checkpoint: 50 of 66

Recorded at `2026-09-12T19:24:45.284Z` in `reviewer/checkpoint-050.json`.
There are **50 frozen sessions: 46 valid and 4 indeterminate**. Sequences
41–50 each passed deterministic ingestion. All 200 files from sequences 1–40,
the prior checkpoint, admission/freeze controls, and all 66 dispatch inputs
were verified unchanged. All new sessions have unique observed message IDs,
verified raw/normalized/provenance hashes, iab/Sol/Extra High provenance,
fresh temporary nonpersonalized chats, and at least 60-second submission spacing.

Sequence 48 had one completion-read timeout; the same tab's accessibility state
confirmed completion and a subsequent read captured the output successfully.
There was no resubmission, session reset, or content retry. Raw whitespace is
preserved intentionally. No scorer material, paid model API, or other browser
was used. No production integration, merge, or deployment is authorized here.

Next: **sequence 51**, replicate 3, `MUTV02-9650D823B140`, input SHA-256
`116f2fa0454a873adc17f0d0652afe9325e4f9e3d69d103f37a5ba7350bd210e`.
Use its exact input path from `reviewer/dispatch-order.json`; continue through
66 under the current owner authorization. Commit the checkpoint before further
submissions, then preserve the next checkpoint at 60 and final completion at 66.
Never regenerate sequences 1–50. The earlier checkpoint/blocker sections below
are historical; use the latest durable checkpoint and artifact tree to resume.

## Recovery correction: iab available, continuation resumed

The owner reselected Browser. The installed Browser client's
`setupBrowserRuntime()` initialized successfully through the trusted Node REPL
browser service and exposed the current task's `iab` provider. The preceding
blocker was an incomplete setup check: absent CUA tools did not establish that
the Browser client could not work. No downgrade or alternate browser was needed.
See `reviewer/continuation-recovery-after-040-20260912.json` for the exact
bootstrap and first resumed submission. Continue the owner-authorized frozen
order through 66, preserving all prior sessions and keeping scorer material
unopened. Current checkpoint counts below will be superseded at the next durable
checkpoint; never regenerate an already-frozen sequence.

## Latest continuation: authorized through 66, blocked before 41

At `2026-09-12T18:50:41.187Z`, the owner requested continuation through all
remaining sequences. The starting branch, upstream, and live PR #215 head were
`c59c3aeb2e6a1f6263a9f8a37353b963c0ad6ae5`, with a clean worktree.
All 200 frozen session files were verified unchanged; the run remains at
40 sessions (36 valid, four indeterminate), with no sequence-41 submission.

The current turn does not expose the built-in browser controller used by the
preceding turn. Callable-tool and resource discovery found no browser-control
route, and the available generic JavaScript runtime has no initialized browser
controller. This is a tool-attachment blocker, not evidence of an iab crash or
another desktop package regression. No alternate browser, undocumented runtime
bootstrap, downgrade, paid API, or scorer access was attempted.

Restore the built-in `@Browser` attachment and verify `iab`, then resume at
**41 through 66** under the owner's current authorization, preserving the exact
model/mode, one-tab limit, spacing, inputs, raw outputs, ingestion, and
provenance rules below. Commit and push durable checkpoints to the same PR.
The earlier stop-at-40 boundary below describes the completed previous request;
it no longer limits the newly authorized continuation.

Evidence: `reviewer/continuation-blocker-after-040-20260912.json`.

## Current state: requested checkpoint reached

Recorded with `reviewer/checkpoint-040.json` at `2026-09-12T18:37:20.566Z`.

- Frozen reviewer sessions: **40 of 66**, with **36 valid** ingest receipts and
  **4 invalid/indeterminate** ingest errors.
- This continuation generated sequences **33–40** exactly once: six valid
  outputs and two indeterminate trials (35 and 39, source-span mismatch).
  Originals, normalized outputs, and rejection receipts are preserved without
  content repair or retry.
- All **160 existing files** in sequences 1–32 are byte-identical to starting
  head `67c7fee5b2b1ada31c12427772ef03f951f3c964`. All 66 dispatch-input hashes,
  the dispatch order, pre-generation freeze, and corrected admission artifact
  were verified unchanged.
- Starting branch, upstream, live remote, and PR #215 head matched that commit;
  the worktree was clean. It is the single documentary descendant of the
  owner's expected `724900de4e26eba1d321a8ca8e0b6b44469df536` (the earlier fresh
  iab blocker only), not a changed reviewer baseline.
- Built-in **iab worked** in this fresh desktop session. No downgrade, browser
  substitution, Brave interaction, paid model API, or scorer-key access occurred.
- Each new submission used a fresh temporary, nonpersonalized ChatGPT session,
  explicitly selected **GPT-5.6 Sol / Extra High** (`Très élevé`), one tab, and
  at least 60 seconds between submissions. The completed tab was closed after
  sequence 40; no reviewer tabs remain.
- Provider-rendered text was captured verbatim and hash-checked before freezing.
  Existing serialization-only normalization and deterministic ingestion were
  used. Self-reported metadata remains untrusted: sequence 40 says `Instant`,
  but controller-observed UI selection was Extra High and the message model
  slug was `gpt-5-6-thinking`; neither raw nor normalized content was altered
  to conceal that discrepancy. Completion timestamps for 33–40 are the first
  controller observation of completed output, not exact provider finish times.
- Diff whitespace warnings are confined to verbatim raw captures (33, 34, 36,
  37, and 39). Those bytes are intentionally preserved; non-raw files pass the
  whitespace check. Validation is the existing per-output normalizer/ingester
  plus checkpoint integrity audit; no scorer or full-corpus scoring gate ran.
- The authority gate passed. Lesson closeout: existing preservation and
  structured-output failure rules were applied; no new transferable lesson or
  broader methodology change is asserted by this execution-only checkpoint.
- **Stop at 40** for this owner's requested slice. No sequence 41 submission,
  scorer execution, production integration, merge, or deployment occurred.

### Next authorized continuation

First read the current repository authority and this handoff, reconcile the
branch/upstream/clean worktree and checkpoint commit against PR #215, and verify
the frozen artifacts. Preserve sequences **1–40**. Use only built-in iab; if it
is unavailable, record a sanitized blocker without creating reviewer output.
Do not perform the historical downgrade procedure below merely because it is
recorded: the required browser capability worked in this continuation.

Resume the frozen dispatch at:

- sequence: `41`
- replicate: `2`
- candidate: `MUTV02-769BB9A5909E`
- input: `evaluation/epistemic-verifier/independent-review-development/v02/prospective/20260911-v02-contract/adjudication/inputs/MUTV02-769BB9A5909E.txt`
- input SHA-256: `ace40477d0e87f0085940922f16a5cd05abe0fdc3068c463bfec45fc99a41cf7`

Retain the model/mode, fresh-session independence, one-tab limit, spacing,
exact input/raw hashes, normalization, ingestion, and controller provenance.
The model selector reset to Latest after each new chat in this session, so Sol
must be explicitly reselected and verified before each submission. Keep scorer
material unopened. This is a DEVELOPMENT / DISCOVERY checkpoint, not a result
confirming generalization or completion of the planned 66 sessions.

Evidence: `reviewer/continuation-preflight-20260912.json`,
`reviewer/checkpoint-040.json`, and `reviewer/outputs/033-*` through `040-*`.

## Historical handoff and recovery evidence (superseded state)

The remainder preserves the earlier 32-session blocker and its recovery
procedure as history. Its sequence-33 instructions and unavailable-browser
status are superseded by the current checkpoint above.

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
   `apt-mark`; the actual downgrade has not completed. The cached known-good
   package SHA-256 is
   `2caa7df314ce37e9048359d8e6a4a78e24574a3b54d6bf510f17754b66dda775`.
6. The owner's first downgrade paste split the package path at a newline. Apt
   rejected the directory argument, the package filename was treated as a
   separate command, and only `apt-mark hold chatgpt` succeeded.
7. The computer-use inventory attached to the present conversation still
   exposes only the Brave extension provider. Do not use Brave as a reviewer
   fallback. Resume only from a fresh desktop conversation in which the
   built-in `@Browser`/`iab` provider is actually available.

No reviewer output was generated during diagnosis, no scorer material was
opened, and no existing reviewer artifact was changed.

## Fresh desktop continuation blocker

Recorded: `2026-09-12T01:40:52Z`

- A fresh desktop conversation was started with the built-in Browser selected,
  and the first visible-tab creation request explicitly targeted `iab`.
- The provider rejected the request with the sanitized error
  `Browser is not available: iab`.
- No Brave fallback, provider substitution, browser reset, or reviewer
  submission was attempted.
- The durable branch was reconciled at
  `724900de4e26eba1d321a8ca8e0b6b44469df536`; its configured upstream and the
  live remote branch tip matched that commit, and the worktree was clean before
  this handoff-only update.
- The frozen reviewer tree still contained exactly 32 session directories, 30
  `ingest-receipt.json` files, two `ingest-error.json` files, and no directory
  beginning with `033-`. The sequence-33 input still matched SHA-256
  `36af2056b0244687065a21fe68d95a4be230d8da3c0f731bc344a727fa4ca6c4`.
- Sequence `33` was not generated or submitted, no scorer material was opened,
  and no frozen reviewer artifact was changed.

The reviewer run therefore remains stopped at the same transport boundary. A
future fresh desktop conversation must first expose a usable built-in `iab`
provider; only then may it resume the frozen order at sequence `33`.

## Exact continuation procedure

1. Locate the worktree for the branch above with `git worktree list --porcelain`.
   Reconcile `git status --short --branch`, `git rev-parse HEAD`, and the branch's
   upstream before touching reviewer artifacts.
2. Verify and simulate the exact rollback package. The simulation must list only
   `chatgpt` as downgraded:

   ```bash
   cd /var/cache/apt/archives
   sha256sum ./chatgpt_26.903.61454_amd64.deb
   apt-get install --simulate --allow-downgrades --allow-change-held-packages ./chatgpt_26.903.61454_amd64.deb
   ```

   The checksum must be
   `2caa7df314ce37e9048359d8e6a4a78e24574a3b54d6bf510f17754b66dda775`.
3. Complete the rollback with the package path on the same command line. The
   held-package override is required because the earlier attempt successfully
   held `chatgpt` even though it did not install the package:

   ```bash
   sudo apt-get install --yes --allow-downgrades --allow-change-held-packages ./chatgpt_26.903.61454_amd64.deb
   sudo apt-mark hold chatgpt
   ```

4. Verify the durable package state:

   ```bash
   dpkg-query -W -f='${Version}\n' chatgpt
   apt-mark showhold
   ```

   The expected version is `26.903.61454`, and `chatgpt` should remain held.
5. Fully close the temporary ChatGPT process, then launch ChatGPT normally from
   the installed package. Do not delete or clear the real profile.
6. Start a fresh ChatGPT/Codex desktop conversation with the built-in Browser
   selected. Verify that the available computer-use surfaces include `iab`.
7. If `iab` is still absent, stop reviewer execution and update this handoff with
   the new sanitized blocker. Do not switch to Brave and do not create sequence
   `33` artifacts.
8. If `iab` is available, resume the frozen dispatch exactly at sequence `33`,
   preserving the existing model/mode, one-tab limit, at-least-60-second accepted
   submission spacing, raw-output freeze, normalization, ingest, and provenance
   procedure used by sequences 1 through 32.
9. After sequence `40` is durably ingested, write and commit the required
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
