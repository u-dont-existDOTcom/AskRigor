# AskRigor Codex Current State

Updated: 2026-08-16

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main`; active isolated task branch
  `codex/calibrated-discovery-v0.2-design-2026-08-16` cleanly integrates
  current `main` `265205c6b127d29848e6f56c61012a5b87436d5a` through local merge
  `da3919afd2eb615b08e8b7caf8d8a84bee8609d6`. Recovery branch
  `recovery/custom-gpt-bridge-pre-main-7be7923` preserves the exact pre-merge
  bridge candidate.
- Verified main boundary containing the packet repair:
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`
- Exact packet-repair head merged by PR #12:
  `9c2c78e86391457c4b1bcd81a862456661db216e`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Byte receipts: HRP `20.5.18` / 2026-08-16 / `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`; Universal `20.5.12` / 2026-08-16 / `3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7`
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`

## Active Custom GPT research bridge candidate

- The owner approved a Custom GPT compatibility bridge and preapproved clear,
  reversible specifications. The 17-tool MCP v0.1 inventory remains frozen.
- Design and execution plan commits are `5c149c7` and `eaaf671`. Implemented
  slices are registry `2a2a988`, read-only Action routes `1ea0c0b`, exact
  protocol chunks `b6575d1`, shared traffic/response limits `1387c2d`, truthful
  YouTube transport bounding `b441382`, generated GPT packet `ee52876`,
  documentation/privacy reconciliation `fbd9c28`, and installation-source
  classification `d14f530`.
- `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` independently enables research
  Actions. They share MCP's transient provider flow, per-client token bucket,
  and 16-request concurrency pool. Responses are limited to **60,000 serialized
  UTF-8 bytes** and protocol chunks to **48,000 UTF-8 bytes**.
- `npm run generate:custom-gpt` twice produced identical OpenAPI, instruction,
  and sync hashes. The final candidate hashes are OpenAPI
  `d281f5727ab57a9edb0a63276bf51e08b2fdd9ff1ba9722725fc1800d58fd1ec`,
  Instructions
  `e319343102b047c8a0a238c26db5325da0d27f934cf80cf17bd34df1f8ca3bdb`,
  and sync ledger
  `f87b63127ee95732ed92e289134ae583bfadd12d0a40e030e866569c0c6b13f7`.
  The generated Instructions source is
  `docs/custom-gpt-instructions.md`; Knowledge must remain empty.
- Focused gates passed: registry/MCP 237 tests; Action composition 84 tests;
  traffic/response boundaries 158 tests; YouTube/bridge 51 tests; generated
  packet 8 tests. Typecheck passed after each behavioral slice. The branch
  baseline `npm run verify` passed before implementation with 43 files, 848
  tests, five skips, typecheck, and build.
- Independent code review found two Important issues and no Critical issues.
  Commit `6df7784` now rejects research-Action startup unless the existing
  server-only continuation secret contains at least 32 UTF-8 bytes, and every
  generated Action operation declares the router-owned 500
  `action_internal_error` response. Focused red/green coverage passes 81/81.
  Commit `4eb6021` awaits a previously leaked durable-budget assertion after
  the full gate exposed the warning and resource-sensitive timeout. Full-suite
  parallel load then reproduced a valid durable `fsync` case at 5.743 seconds;
  commit `4f19cc1` gives only that durable-filesystem suite a 20-second ceiling
  without changing runtime behavior or assertions.
- After the new premise-integrity protocol authority on `main` was merged, the
  complete candidate gate passed again: `npm run verify` produced 49 passing
  files, one credential-gated file skipped, 881 passing tests, five skipped,
  and successful typecheck and build. The generated Custom GPT packet remained
  byte-identical because it loads the canonical protocols at runtime rather
  than embedding stale protocol copies.
- Final repository-visible gates also pass: the public-site validator covered
  four pages, the deployment suite passed 28/28, and the current universal
  portable audit returned `PASS: no findings.` The lesson checkpoint at
  `2026-08-16T06:32:42.747Z` remained available with zero open, needs-review,
  accepted-not-incorporated, or deletion-eligible candidates and one
  incorporated-or-closed record.
- This work is unpushed, unmerged, and not deployed. Existing production lesson
  Action and MCP evidence below is unchanged. The research bridge has pending GPT editor work and all live acceptance fields remain `pending`.
- Current task: run the final site and diff gates, publish through one focused
  PR, wait for protected checks, merge, and preserve a production rollback
  point before the reversible deployment. The GPT-editor acceptance remains a
  separate irreducible product step after the server is live.

## Completed

- Recovery inspected the complete instruction chain, profile/state/README/indexes, scripts/lock/runtime, workflows, ownership/dependency/security posture, recent commits, PR #7, and hardening issue #6.
- The dirty original `main` checkout and its unrelated untracked files remain untouched; all work is isolated here.
- Current `main` was semantically merged without losing the Action implementation, live-acceptance evidence, privacy/release records, or compliance controls. Project-installation conflicts preserve separate MCP/Action surfaces, governance-file exclusion, and complete-protocol authority.
- The repository profile declares only exact commands run on this candidate and distinguishes hermetic CI from the separately authorized bounded provider smoke.
- `npm ci` passed on Node `24.18.0`: 156 packages installed, 0 audited vulnerabilities.
- Current deterministic verification passed: 42 files passed, one credential-gated live file skipped; 843 tests passed, five skipped; typecheck and build passed.
- Site checks passed: four pages validated and 28/28 deployment tests passed. Protocol SHA-256 values match the authoritative XML bytes.
- The opt-in live provider smoke passed separately: two public-provider tests passed and three credential-gated providers skipped truthfully.
- `npm run lessons:status` returned available at `2026-08-15T22:33:40.515Z`: 0 open candidates, 0 needs review, 0 accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
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
- PR #9 merged into `main` as `e63a0f73ec28a4b91673eed768d8e72f41986418`.
  Post-merge deterministic verification, workflow policy, and both CodeQL
  analyses passed on that exact merge commit.
- Fresh post-deployment ChatGPT interface acceptance on 2026-08-15 visibly
  passed exact isolated integrity and load calls and returned a successful
  ordered manifest/verify/load receipt with the current HRP identity. It did not
  reproduce the earlier routine-status narration and showed no write
  confirmation. The copied combined transcript collapsed or mislabeled its tool
  card; that presentation limitation remains declared.
- Lesson closeout for this acceptance is project-specific / no-new-lesson; the
  three-layer proof distinction was already promoted and tested universally.
- PR #10 merged the interface evidence into `main` as
  `287bac798f9e61568b56194385e43a21b899a4f8`. Post-merge deterministic
  verification, workflow policy, and both CodeQL analyses passed on that exact
  merge commit.
- PR #11 merged the bounded interface-state closeout into `main` as
  `57340f4ee2d9165fc7d680fe01cae9c8ca0f251a`.
- OpenAI's current primary submission documentation was rechecked on
  2026-08-16. The owner approved Approach A and confirmed the durable design at
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`.
- The public plugin package no longer references environment-specific
  `.app.json`, uses the 28-character `Auditable research retrieval` short
  description, and includes self-contained square SVG logo/composer assets.
  The current local `plugin-creator` validator passes on the clean package.
- `docs/public-submission-packet-v0.1.0.json` now separates portal-only fields
  from package metadata, selects exactly `positive-1` through `positive-5` and
  `negative-1` through `negative-3`, and keeps every hosted gate explicit.
  The extended 6+3 case file and all historical receipts remain unchanged;
  `positive-6` remains extended regression evidence.
- TDD observed seven expected failures before the package/packet/assets
  existed. The final focused package/packet gate passes 12/12. The existing
  public-review safety suite passes 61/61 after its deliberately credential-
  shaped runtime fixture was assembled from safe source fragments so the
  portable repository audit does not mistake the test source for a credential.
- Final bootstrap passed on Node `24.18.0`: `npm ci` added 156 packages, audited
  161, and found zero vulnerabilities. `npm run lessons:status` returned
  available at `2026-08-16T00:49:00.120Z`: 0 open, 0 needs review, 0 accepted
  not incorporated, 1 incorporated-or-closed, and 0 deletion eligible.
- Final deterministic verification passes: 43 files passed, one live-provider
  file skipped; 848 tests passed, five credential-gated tests skipped;
  typecheck and build passed. Site validation covered four pages and deployment
  tests passed 28/28. The current universal portable audit passes with no
  findings. No live provider call, production deployment, portal submission,
  credential access, or protocol/application behavior change occurred.
- Lesson closeout for this repair is project-specific / no-new-lesson. The
  distinction between repository-visible and hosted proof and the runtime-
  fragmented credential-fixture pattern were already promoted and tested in
  the universal repository.
- PR #12 merged the exact packet-repair head into `main` as
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`. Post-merge deterministic
  verification run `31918684165`, workflow-policy run `31918685565`, and both
  CodeQL analyses in run `31918683952` passed on that exact merge commit.

## Current checkpoint

- PR #9 remains the last live-evaluated code/case release. Its exact commit is
  `8ed8c0f7aaab9609dfb067780c05838f98903bab`; later evidence and CI-timeout
  changes and this packet-only repair do not alter deployed application or
  runner behavior.
- Production is healthy on the refetch-fix application image. Rollback image
  `askrigor-research:rollback-9715812` and
  `/opt/askrigor/compose.yaml.rollback-9715812` are verified.
- Repository-controlled packet repair is merged and verified. V0.1.0 remains
  **PUBLIC SUBMISSION BLOCKED** for
  portal identity/domain verification, Scan Tools, a real demo-recording URL,
  the explicit release decision on three opaque remote-MCP model receipts,
  final portal response/privacy review, and submission.
  The direct production contract is 9/9 green and the ChatGPT interface check is
  complete with the declared card-presentation limitation.
- The owner reported `Verifying identity` in the OpenAI portal. The packet
  records this as `in_progress`; it does not claim completion or an identity
  service-level time.

## Remaining

- Observe developer/business identity completion and complete the portal HTTPS
  domain challenge.
- Run Scan Tools against `https://mcp.askrigor.com/mcp`, compare all 17 tools
  with the committed inventory, and review the portal's response/privacy output.
- Record and host the bounded demo from
  `docs/public-submission-demo-recording.md`; publish only its verified HTTPS
  URL and non-secret receipt.
- Resolve or expressly accept the three opaque remote-MCP receipts at the
  release-decision boundary; direct proof must not be relabeled as model proof.

## Blockers / unresolved

- No repository implementation, dependency, test, audit, deployment,
  credential, governance, or ChatGPT interface blocker remains.
- OpenAI's remote-MCP Responses receipts are opaque for conditional successful
  output and the two tested error boundaries. The runner preserves these as
  `model_output` blocks. Direct proof does not establish model-layer semantics.
- V0.1.0 public submission remains blocked by account-scoped identity/domain
  work, Scan Tools, a real demo recording, final portal review, and the explicit
  opaque-receipt release decision.

## Evidence / artifacts

- Repository profile: `.github/codex-repository.json`
- Compliance plan: `docs/superpowers/plans/2026-08-14-codex-github-compliance.md`
- Compliance report: `docs/audits/2026-08-14-codex-github-compliance.md`
- Release/production receipt: `docs/release-evidence-v0.1.0.md`
- Privacy/reviewer truth: `docs/privacy-data-map.md` and `docs/public-review-checklist.md`
- Portal handoff: `docs/public-submission-packet-v0.1.0.json`
- Demo recording script: `docs/public-submission-demo-recording.md`
- Repair design and plan:
  `docs/superpowers/specs/2026-08-16-public-submission-packet-repair-design.md`
  and
  `docs/superpowers/plans/2026-08-16-public-submission-packet-repair-implementation.md`
- Public-review runner/cases: `docs/public-review-automation.md` and
  `docs/public-review-cases-v0.1.0.json`
- Ignored local sanitized evidence:
  `.artifacts/public-review-eval/20260815T110708.728Z-baa07445/`
- Hosted follow-up: issue #6
- Universal promotion: `u-dont-existDOTcom/universal-dev-architecture/audits/2026-08-14-askrigor-transferable-controls.md`

## Next safe action

Review and publish the one Custom GPT bridge task branch, wait for the protected
checks, merge it, then preserve a production rollback point before enabling
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true`. The irreducible GPT-editor step uses
`docs/custom-gpt-instructions.md`, empty Knowledge, and the generated Action
schema; no live state may be inferred before the 11-case record is complete.

## Recovery rule

After interruption, inspect actual Git state, this checkpoint, complete protocol
files, current release evidence, merged PRs #9 through #12, closed issue #6, and
newer owner instructions. Resume from the latest verified boundary without
touching the dirty original checkout or repeating live production acceptance.
