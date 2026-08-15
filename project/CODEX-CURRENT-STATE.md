# AskRigor Codex Current State

Updated: 2026-08-15

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main`; active task branch: `codex/public-review-automation-2026-08-15`
- Current `origin/main` base for the public-review candidate: `9134e22784e4d26dcf3c6d24a299bb5f783455ad`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Byte receipts: HRP `20.5.17` / 2026-08-13 / `d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`; Universal `20.5.11` / 2026-08-07 / `1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa`
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`

## Completed

- Recovery inspected the complete instruction chain, profile/state/README/indexes, scripts/lock/runtime, workflows, ownership/dependency/security posture, recent commits, PR #7, and hardening issue #6.
- The dirty original `main` checkout and its unrelated untracked files remain untouched; all work is isolated here.
- Current `main` was semantically merged without losing the Action implementation, live-acceptance evidence, privacy/release records, or compliance controls. Project-installation conflicts preserve separate MCP/Action surfaces, governance-file exclusion, and complete-protocol authority.
- The repository profile declares only exact commands run on this candidate and distinguishes hermetic CI from the separately authorized bounded provider smoke.
- `npm ci` passed on Node `24.18.0`: 156 packages installed, 0 audited vulnerabilities.
- Final deterministic verification passed: 41 files passed, one credential-gated live file skipped; 779 tests passed, five skipped; typecheck and build passed.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-14T23:02:10.872Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- The current universal portable audit passes with 0 errors and four truthful hosted-control warnings after token-shaped privacy fixtures were runtime-fragmented without changing their tested values.
- Release-truth TDD now rejects stale pre-deployment claims. README, privacy map, review checklist, and release evidence consistently record the deployed Action, live August 13 notice, exact 17-tool inventory, rollback, and still-blocked public submission gates.
- Production Action acceptance is preserved from exact code revision `1c32ab047e20db9c833ac5a18b9e0eda1bc3c11a`; it remains a separate consequential route and not an MCP tool. PR #8 merged the code as `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`.
- Universal PR #4 exact head `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8` contains the promoted AskRigor controls and passed run `31848203559`, job `94918801742`.
- The owner selected a scoped `AGPL-3.0-or-later` grant for original software.
  `LICENSE.md` keeps complete protocols, health-research policy, evidence,
  editorial content, recorded fixtures, and archived/third-party tools outside
  that grant; the exact official license bytes are integrity-tested.
- Hosted governance is directly verified. Active ruleset `20882388` requires
  pull requests plus strict `Deterministic verification` and `workflow-policy`,
  blocks deletion/force pushes, and retains the sole owner as the only bypass
  without requiring fake independent approval.
- Actions are limited to the three exact SHA-pinned checkout/setup-node
  revisions used by current workflows; default workflow tokens are read-only.
  Secret scanning, push protection, vulnerability alerts, Dependabot security
  updates, private vulnerability reporting, and CodeQL are enabled.
- CodeQL setup run `31862487322` succeeded. Two alerts were dismissed with
  durable false-positive/test-only reasons. The real prototype-pollution alert
  has a red/green regression and a null-prototype path-map fix on this branch.
- Public-review automation now binds every run to the exact Git commit and
  committed case-file bytes, separates direct MCP and raw Responses evidence,
  enforces serial request/case/full-run limits, and writes only checksum-covered
  sanitized artifacts. A Git-capable runner image is pinned by Node digest and
  Debian Git version after the first end-to-end attempt exposed the missing Git
  executable before network evaluation.
- The live YouTube comment-ID response-shape regression has a failing-then-green
  fixture test. Production research image
  `sha256:e4838746679323050adb636f132ee3c4f72eb8d6c7765906357718531c54578b`
  is healthy; the prior image and Compose file remain explicit rollback points.
  Caddy was not recreated, the Action state/auth boundary is unchanged, and all
  17 public MCP tools remain read-only.
- Final protected run `20260815T110708.728Z-baa07445` used clean commit
  `8ed8c0f7aaab9609dfb067780c05838f98903bab`: all 9 direct cases passed,
  6 model cases passed, and 3 model cases remained honestly blocked by opaque
  remote-MCP receipts. The report/summary manifest and evidence safety scan
  passed. Exact bounded evidence is in `docs/release-evidence-v0.1.0.md`.

## Current checkpoint

- PR #9 is the sole public-review automation PR. Its last live-evaluated code
  and case commit is `8ed8c0f7aaab9609dfb067780c05838f98903bab`; evidence-only closeout changes
  follow that commit and do not alter the deployed application or runner logic.
- Production is healthy on the refetch-fix application image. Rollback image
  `askrigor-research:rollback-9715812` and
  `/opt/askrigor/compose.yaml.rollback-9715812` are verified.
- V0.1.0 remains **PUBLIC SUBMISSION BLOCKED** for the routine-status
  presentation, portal identity/domain verification, Scan Tools/submission,
  fresh post-deployment ChatGPT interface check, and three opaque remote-MCP
  model receipts. The direct production contract itself is 9/9 green.

## Remaining

- Run `npm run lessons:status` and the final canonical repository gate on the
  evidence-closeout tree; review the complete diff and secret scan; push the
  final PR #9 head; and wait for `Deterministic verification` and
  `workflow-policy`.
- Merge PR #9 only if those required checks stay green and the final review has
  no Critical or Important finding. The public-submission blocks are product
  exceptions, not a reason to omit the automation or falsify its result.
- Run one fresh post-deployment ChatGPT interface spot check before any public
  submission claim. Resolve or expressly accept the three opaque remote-MCP
  receipts at the release-decision boundary.

## Blockers / unresolved

- No implementation, deployment, credential, or repository-governance blocker
  remains for PR #9.
- OpenAI's remote-MCP Responses receipts are opaque for conditional successful
  output and the two tested error boundaries. The runner preserves these as
  `model_output` blocks. Direct proof does not establish model-layer semantics.
- V0.1.0 public submission remains blocked by the separate product/release
  gates above; merging the truthful automation does not accept or bypass them.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Public-review runner/cases: `docs/public-review-automation.md` and
  `docs/public-review-cases-v0.1.0.json`
- Ignored local sanitized evidence:
  `.artifacts/public-review-eval/20260815T110708.728Z-baa07445/`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Run the final lessons-status and repository gates, publish the PR #9 evidence
closeout, verify both required checks, and merge the PR if the final review
remains clean.

## Recovery rule

After interruption, inspect actual Git state, this checkpoint, complete protocol files, current release evidence, PR #9/checks, issue #6, and newer owner instructions. Resume from the latest verified boundary without touching the dirty original checkout or repeating live production acceptance.
