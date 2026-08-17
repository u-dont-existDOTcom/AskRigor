# AskRigor Codex Current State

Updated: 2026-08-17

## Goal

Make AskRigor's Codex/GitHub workflow reproducible, reviewable, secure, and resumable without allowing workflow metadata, release receipts, or remembered lessons to supersede the complete canonical protocols.

## Authority / baseline

- Repository: `u-dont-existDOTcom/AskRigor`
- Canonical branch: `main` at deployed code merge
  `905ac22ab42479c15ff0d6385a51de864271f862`; the isolated evidence branch
  starts from that exact commit. Production runs the same merge and passed the
  direct two-call YouTube release acceptance.
  Recovery branch `recovery/custom-gpt-bridge-pre-main-7be7923` preserves the
  pre-integration bridge candidate.
- Verified packet-repair boundary:
  `0d8ef69fa7fd73c34c571a07723b5a6b5bad5fec`
- Exact packet-repair head merged by PR #12:
  `9c2c78e86391457c4b1bcd81a862456661db216e`
- Pre-integration recovery branch: `recovery/askrigor-compliance-pre-main-9d9dc78`
- Protocol authority: current explicit owner correction, then the exact complete bytes of `protocols/HRP_Full.xml` and `protocols/Universal_Instructions.xml`
- Byte receipts: HRP `20.5.18` / 2026-08-16 / `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`; Universal `20.5.12` / 2026-08-16 / `3413c1e400c9cbc78c2be81baee6de49b41e3587ce449e1dd7cb04cda17681c7`
- Runtime: Node `24.18.0`; bootstrap `npm ci`; complete deterministic gate `npm run verify`
- Universal policy: `u-dont-existDOTcom/universal-dev-architecture/patterns/codex-github-operating-system.md`

## Active Custom GPT research bridge acceptance

- PRs #19 through #23 are merged. The current release merge is
  `905ac22ab42479c15ff0d6385a51de864271f862`, exact PR #23 head
  `11f3a68a73bc68bc23f1854b6bd8d4c06f9b843f`. The exact formerly failing
  YouTube video now completes its direct two-call Action chain with a
  deterministic terminal sample and `synthesis_lock:pass`; the fresh Custom
  GPT UI retest remains pending.
- The owner approved the compatibility bridge and clear reversible changes.
  PR #15 merged accepted head `be641bf568c401992ff4aa9fe885552d6cfb2dca`
  as `dd73d7dccb6bc3f96b964aafa6a2f74f96ab16c4`; its deterministic,
  workflow-policy, and CodeQL checks passed before merge and again on the merge
  commit. The 17-tool MCP v0.1 inventory remains frozen.
- Design/implementation provenance remains `5c149c7`, `eaaf671`, `2a2a988`,
  `1ea0c0b`, `b6575d1`, `1387c2d`, `b441382`, `ee52876`, `fbd9c28`, and
  `d14f530`. Independent review's two Important findings were fixed before
  merge: enabled research Actions now require the server-only continuation
  secret at startup, and all operations declare the router-owned 500 response.
- Production runs terminal-refetch merge
  `905ac22ab42479c15ff0d6385a51de864271f862` as image
  `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`
  in healthy container
  `af7689e8f55ed12e86a863e3cbe7d03b2bfd27edc00fa4860d7083bd146271df`.
  Rollback is `askrigor-research:rollback-905ac22a` plus
  `/opt/askrigor/compose.yaml.rollback-905ac22a`, restoring image
  `sha256:b6bf6df118e47eff766371717b48c3b732edf91053ef9e7915eb55edb5534a95`.
  Only the research service was recreated for the application switch.
- `ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true` is active. Research Actions share
  MCP's transient provider flow, per-client token bucket, and 16-request
  concurrency pool. Responses remain limited to **60,000 serialized UTF-8
  bytes** and exact protocol chunks to **48,000 UTF-8 bytes**.
- The generated packet remains reproducible: deployed committed OpenAPI SHA-256
  `0e166153faf37b3c7b4963fde2ad0b9c02cc5c7a4acd9620446c308c291c8e94`,
  Instructions
  `ef4c9845b3e50d3978f718fe10fff64ef53e55a3a4c045e8b1eb389b15bb9aad`,
  and sync ledger
  `2ad66c7929cf86714fd45f421df2f21db3bd8928c4036eb6ebe18fb941cb9e97`.
  The sole editor instruction source is `docs/custom-gpt-instructions.md`;
  Knowledge must remain empty.
- The transactional site release is
  `/opt/askrigor/site/releases/56b3dff6d7c3/site`. All four pages returned
  200, and live privacy bytes match SHA-256
  `d73d9557852a17975b345ae20bfe24edc70267a3f595959b2bfb5d7198c26453`.
- Direct production acceptance passed complete Universal 2/2 and HRP 11/11
  byte coverage, PubMed, ClinicalTrials.gov, Crossref, YouTube survey/audit,
  malformed/oversized requests, rate limiting/recovery, exact 18-operation
  Action security, health, and the 17-tool MCP inventory. Detailed sanitized
  receipts are in `docs/custom-gpt-action-live-acceptance.md`. The 2026-08-17
  release reverified health, schema, protocols, inventory, the 16-record
  one-call audit, and the exact 149-record two-call terminal-refetch chain.
- `AskRigor-lessons` is private again. The exact selected-repository GitHub App
  path created synthetic `ARL-0006`; the duplicate returned the same ID with
  occurrence count 2 while preserving the issue body byte-for-byte. The issue
  was labeled rejected and closed as not planned. Final queue status has 0
  open, 0 needs review, 0 accepted-not-incorporated, 2 incorporated-or-closed,
  and 0 deletion eligible.
- GitHub Free cannot protect a private personal repository: the hosted API
  returned HTTP 403 with the exact Pro/public requirement. This is a declared
  `AskRigor-lessons` governance exception, not a claim of protection.
- The first Custom GPT schema import exposed three editor-compatibility defects:
  missing object-valued `components.schemas`, plus 357- and 493-character
  descriptions over OpenAI's 300-character operation limit. The deployed repair
  emits `schemas: {}`, gives both legacy YouTube Action routes
  exact 201-character descriptions, and rejects any future exported description
  over 300. Focused red/green coverage passed 16/16; complete verification
  passed 49 files and 881 tests with one file and five tests skipped as declared,
  typecheck/build passed, site validation covered four pages, deployment-policy
  tests passed 28/28, and the portable audit returned no findings. PR #17 merged
  the exact repair head `b4d3db5d2b3f05debc4dd2c37cfa0d12290f67af` as
  `6639086a33b44f029c9f8405f69bd06b725e78d0`; protected and post-merge
  deterministic, workflow-policy, and CodeQL checks all passed.
- The exact merge is deployed. Fresh public OpenAPI validation found 18
  operations, object-valued `components.schemas`, no description over 300
  characters, and both affected descriptions at exactly 201 characters. Health,
  unauthenticated lesson isolation, current protocol identities, and the frozen
  17-tool MCP inventory passed without provider calls or lesson writes.
- Custom GPT product testing is now partial rather than wholly pending.
  Universal loaded completely in 2/2 chunks and HRP in 11/11; PubMed,
  ClinicalTrials.gov, and conservative Crossref metadata cases passed through
  the product interface. A real survey-first YouTube case then exposed the
  remaining defect: ChatGPT altered the multi-kilobyte stateless continuation
  token twice. The server correctly rejected both attempts and kept
  `synthesis_lock:block`; 66 records had been retrieved before the terminal
  error, zero were returned for analysis, and replies were unreconciled.
- The owner approved an Action-only repair after the privacy tradeoff was
  disclosed. Design commit `b5a760a` and implementation commit `7701a68` keep
  the exact frozen MCP operation/inventory unchanged while the Custom GPT
  adapter maps a 37-character handle to the existing signed minimized token in
  process memory for at most one hour, 2,048 entries, and 16 MiB. Expiry,
  restart, or capacity eviction fails closed and requires restart from the video
  identifier. This is now deployed direct behavior; only the fresh product UI
  relay remains unverified.
- The first unused build candidate failed its disposable non-root smoke test
  because the staging workflow made archived source files unreadable to the
  runtime user. It never received traffic. Re-extracting the verified archive
  while preserving internal file modes produced the accepted image. This is a
  provisional transferable deployment lesson pending universal disposition;
  the OpenAI 300-character constraint remains project-specific evidence.
- Final lesson status for the deployed continuation repair was `available` at
  `2026-08-17T03:13:06.118Z`: 0 open, 0 needs review, 0 accepted not
  incorporated, 2 incorporated or closed, and 0 deletion eligible.
- Lesson closeout: the AskRigor product failure and its exact limits are
  preserved in `docs/custom-gpt-action-live-acceptance.md`. The model-mediated
  relay finding is **provisional transferable**: multi-kilobyte opaque,
  high-entropy continuation state can be mutated when an AI controller must
  reproduce it as a tool argument. The bounded short-handle adapter is not a
  universal default—it trades stateless restart resilience for short-lived
  server memory and needs truthful privacy disclosure. Promote only after the
  the fresh product retest establishes the UI relay; exact merge, deployment,
  and direct acceptance now pass. Direct MCP clients remain the counterexample
  that should stay stateless.
- Remaining Custom GPT editor/UI acceptance is the repaired multi-call YouTube
  chain plus lesson-consent cases. The editor must use
  `docs/custom-gpt-instructions.md`, empty Knowledge, the live OpenAPI URL,
  Bearer authentication, and a new unpublished chat. `gpt.askrigor.com` must
  not be repointed until those cases pass and the actual direct `/g/...` URL is
  verified.

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
- PRs #19 through #22 merged the short Action handle, pagination-overlap
  reconciliation, and fail-closed terminal sample handling. The PR #22
  candidate was rolled back after direct acceptance exposed YouTube's live
  comment-ID filter ceiling: 50 IDs returned `200`, while 51 returned `400
  invalidFilters`.
- PR #23 added the failure-sensitive 50-ID regression and merged as
  `905ac22ab42479c15ff0d6385a51de864271f862`. Focused tests passed 22/22;
  independent affected-suite verification passed 49/49 with no findings; the
  full host-boundary gate passed 914 tests with five credential-gated skips,
  typecheck, and build. PR and post-merge deterministic, workflow-policy, and
  CodeQL checks passed.
- Production is healthy on exact image
  `sha256:b7273c24f568bbd8d9c9f5a4758a89e08b9142af4d23a18d79a62e6df0b3b067`.
  The known 16-record audit remains one-call complete. The exact formerly
  failing video reached 149 records across two Action calls, returned a
  deterministic 111-record sample, ended `completed_with_access_boundary`,
  reported no error or continuation, and set `synthesis_lock:pass`. Caddy and
  the site release were unchanged; exact rollback image and Compose remain
  ready.

## Current checkpoint

- PR #23 is the current deployed code release. Production is healthy on the
  exact merged image, with the rollback image/config and active site release
  recorded above. Server-side direct acceptance, including the exact repaired
  two-call YouTube chain, is complete.
- Repository-controlled packet repair and bridge implementation are merged and
  verified. V0.1.0 remains
  **PUBLIC SUBMISSION BLOCKED** for
  portal identity/domain verification, Scan Tools, a real demo-recording URL,
  the explicit release decision on three opaque remote-MCP model receipts,
  final portal response/privacy review, and submission.
  The direct production contract is 9/9 green and the ChatGPT interface check is
  complete with the declared card-presentation limitation.
- The owner reported `Verifying identity` in the OpenAI portal. The packet
  records this as `in_progress`; it does not claim completion or an identity
  service-level time.
- The separate Custom GPT compatibility surface is deployed but unpublished.
  The corrected schema imported successfully, and protocol/formal-source UI
  cases passed. A fresh product-session retest of the repaired YouTube handle
  chain, the lesson-consent cases, publishing, and the direct `/g/...` URL
  remain pending.

## Remaining

- Rerun the survey-first multi-call YouTube case and lesson-consent cases in a
  fresh unpublished GPT chat with empty Knowledge. Direct acceptance is green;
  do not reuse it as UI proof.
- After the remaining YouTube and lesson-consent cases pass, publish the Custom GPT, verify its direct `/g/...`
  URL, and only then repoint `gpt.askrigor.com`.
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

- The importer fix is merged, green, deployed, and passed the product importer.
  Protocol and formal-source UI cases passed. The short-handle and terminal
  refetch repairs are deployed and directly accepted; only a fresh product
  session can prove the UI relay.
- `AskRigor-lessons` is private on GitHub Free, so private `main` branch
  protection is plan-limited and explicitly unverified/unavailable until Pro.
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

Repeat the irreducible Custom GPT product test using
`docs/custom-gpt-instructions.md`, empty Knowledge, the already imported live
Action schema, Bearer authentication, and a new unpublished chat. Require the
survey-first two-call YouTube chain to return a terminal sample with synthesis
unblocked, then run the lesson-consent cases. Do not repoint the GPT subdomain
until the UI receipts and direct `/g/...` URL are verified.

## Recovery rule

After interruption, inspect actual Git/GitHub and production state, this
checkpoint, complete protocol files, current release evidence, merged PRs #9
through #23, AskRigor hardening issue #6, private synthetic lesson `ARL-0006`,
and newer owner instructions. Resume from the latest verified boundary without
touching the dirty original checkout or repeating direct production acceptance
unless production identity has changed. This evidence branch starts from
deployed merge `905ac22ab42479c15ff0d6385a51de864271f862`.
