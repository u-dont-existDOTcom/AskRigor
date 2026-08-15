# AskRigor Codex + GitHub Compliance Report

Date: 2026-08-15
Repository: `u-dont-existDOTcom/AskRigor`
Branch: `codex/github-compliance-2026-08-14`
Recovered base: `50be9e4aba0efd6f4536b425ae9db5b61df1a6e0`
Compliance line before main integration: `9d9dc78294abbed06cf3acabe9e764ece0f57be8`
Integrated current main: `f8e7ca1e10c096e050207828eeb9eb7957d7ef6f`

The exact published PR-head SHA and final-head workflow run belong in the pull
request and final worker report. A file inside a commit cannot truthfully name
the SHA of the commit that contains it.

## Classification and preserved boundaries

- Kind: public, active, long-running software.
- Risk: critical because the repository supports protocol-aware health and
  research work through a public MCP endpoint.
- Canonical branch: `main`; candidate work uses the isolated task branch above.
- The original local `main` checkout was ahead/behind its remote and contained
  unrelated untracked secret-looking files. It was not read, staged, moved,
  reset, stashed, or modified.
- Complete `protocols/HRP_Full.xml` and
  `protocols/Universal_Instructions.xml` bytes remain authoritative after
  current explicit owner correction. No protocol or substantive research policy
  changed.
- Current main's source-access states, pagination/reply reconciliation, MCP
  request/rate/work ceilings, proxy trust, deployed lesson Action, privacy, and
  rollback behavior are preserved. The compliance diff does not change runtime
  behavior or production; it repairs stale release-state documentation.
- V0.1.0 remains **PUBLIC SUBMISSION BLOCKED** under the existing release gates.

## Protocol-byte evidence

- `protocols/HRP_Full.xml`: version `20.5.17`, revision date `2026-08-13`,
  SHA-256
  `d09d60c5c9b7694c08520314349007edccb6283e3d4d991f74cc209ff6934242`.
- `protocols/Universal_Instructions.xml`: version `20.5.11`, revision date
  `2026-08-07`, SHA-256
  `1a4c61627b593a8ddabbc68608f69d4c7062896535b480056b6b5efe5f47d9aa`.
- `tests/protocol.test.ts` verifies exact byte-derived manifests/text and fails
  closed for stale digest, unreadable/missing file, malformed XML, invalid
  UTF-8, and missing required root attributes.

## Changed files and purpose

- `AGENTS.md`, `README.md`, `docs/INDEX.md`, `project/README.md` — establish the
  exact authority/source chain and separate copy-ready Project files from
  governance metadata.
- `.github/codex-repository.json` — record only successfully executed canonical
  commands, the canonical state path, dated hosted evidence, and the separately
  authorized live command as explicitly optional rather than ordinary CI.
- `CURRENT-STATE.md`, `project/CODEX-CURRENT-STATE.md` — provide one obvious
  canonical recovery checkpoint and preserve the exact blocker/evidence state.
- `tests/project-router.test.ts` — repair the recovered failing exact-package
  regression while continuing to enumerate all expected Project files.
- `tests/lesson-privacy-screen.test.ts` — preserve exact token-shaped rejection
  cases without committing scanner-matching provider-token literals.
- `README.md`, `docs/privacy-data-map.md`, `docs/public-review-checklist.md`,
  `docs/release-evidence-v0.1.0.md`, `tests/release-packet.test.ts` — test-first
  reconciliation of the already-deployed Action/privacy notice and 17-tool
  production receipt; public-submission gates remain blocked.
- `.github/workflows/ci.yml` — expose the stable unique `Deterministic
  verification` check with exact `.nvmrc`, lockfile install, read-only token,
  non-persisted checkout credentials, immutable Action pins, timeout, and
  ref-scoped cancellation.
- `.github/workflows/repository-workflow-policy.yml`,
  `tests/workflow-policy.test.ts` — retain the separate immutable-pin/permission
  policy gate, add bounded concurrency/non-persisted checkout credentials, and
  require actual YAML event syntax instead of self-matching the detector text.
- `.github/CODEOWNERS`, `.github/pull_request_template.md` — cover protocol,
  source-access, MCP, security, deployment/release, state, and policy paths and
  require exact completion evidence.
- `SECURITY.md` — establish the already-published private email reporting path
  while truthfully recording that hosted private reporting is disabled.
- `CONTRIBUTING.md`, `LICENSE.md`, and
  `LICENSES/AGPL-3.0-or-later.txt` — license original software under scoped
  `AGPL-3.0-or-later` terms while keeping complete protocols, policy, evidence,
  editorial material, fixtures, and archived/third-party tools outside the
  grant.
- `tests/license-posture.test.ts` — fail closed when the approved scope map,
  protocol-authority boundary, generated-interface exceptions, or official
  AGPL text hash drifts.
- `apps/research-mcp/src/actions/openapi.ts` and
  `tests/action-openapi.test.ts` — use a null-prototype OpenAPI path map after a
  red/green regression proved that the former ordinary object allowed a
  `__proto__` route key to mutate `Object.prototype`.
- `docs/superpowers/plans/2026-08-14-codex-github-compliance.md` and this report
  — preserve the execution and recovery evidence outside chat.

## Exact local verification

Recovered baseline:

- `node --version` — PASS, `v24.18.0`.
- `npm --version` — PASS, `11.16.0`.
- `npm ci` — PASS outside the executable-restricted sandbox; 156 packages,
  zero audited vulnerabilities. The first sandboxed attempt failed `EPERM`
  while executing the pinned esbuild install binary and is not a repository
  failure.
- `npm run verify` — baseline exposed one real failure: the copy-ready Project
  assertion rejected already-committed `project/AGENTS.md` and
  `project/CODEX-CURRENT-STATE.md`. Fourteen localhost transport tests also
  failed only under the socket-restricted sandbox with `listen EPERM`.
- `npx vitest run tests/project-router.test.ts --reporter=verbose` — RED, one
  exact-package failure before the repair; GREEN, 12/12 after the merged
  MCP/Action installation-boundary correction.

Final implementation candidate:

- `npx vitest run tests/action-openapi.test.ts --reporter=verbose` — RED, the
  synthetic `__proto__` path mutated `Object.prototype`; GREEN, 4/4 after the
  path map changed to a null-prototype record.
- `npx vitest run tests/workflow-policy.test.ts --reporter=verbose` — RED: the
  committed workflow policy falsely flagged its own detector text; GREEN: 2/2,
  including rejection of a real mapping-form `pull_request_target` checkout.
- `npx vitest run tests/license-posture.test.ts --reporter=verbose` — RED before
  the approved scope map and official text existed; GREEN, 1/1 after the minimal
  licensing implementation.
- `npm run verify` outside the loopback-restricted sandbox — PASS: typecheck,
  41 test files passed and one credential-gated live file skipped; 780 tests
  passed and five live tests skipped; build passed.
- `npm run test:site` outside the IPC-restricted sandbox — PASS, four pages
  validated. The first sandboxed run failed only because the pinned `tsx`
  runner could not bind its temporary local IPC pipe.
- `npm run test:site-deploy` — PASS, 28/28 tests.
- `sha256sum LICENSES/AGPL-3.0-or-later.txt protocols/HRP_Full.xml protocols/Universal_Instructions.xml`
  — PASS: official AGPL text
  `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`;
  exact protocol hashes recorded above.
- `python3 /home/joel/universal-dev-architecture-worktrees/codex-github-compliance-2026-08-14/scripts/audit_codex_github.py --root . --fail-on error`
  — PASS, zero errors and zero warnings after the hosted evidence refresh.
- `python3 -m json.tool .github/codex-repository.json` — PASS.
- `git diff --check` — PASS.

`npm run test:live` was run with explicit authorization outside ordinary CI:
one file passed, two public-provider tests passed, and three credential-gated
provider tests skipped. The skips are not represented as provider coverage.
This command made no OpenAI model call. Separately, the already-merged Action
rollout used the bounded paid privacy acceptance recorded in release evidence;
this compliance integration performed no deployment, release, public
submission, or production mutation.

- `npm run lessons:status` — PASS/available at
  `2026-08-14T23:02:10.872Z`: 0 open candidates, 0 needs review, 0
  accepted-not-incorporated, 1 incorporated-or-closed, and 0 deletion eligible.

## CI contract and publication evidence

- Workflow/check: `AskRigor deterministic verification` / `Deterministic
  verification`.
- Separate check: `Repository workflow policy` / `workflow-policy`.
- Exact final-head run IDs, links, and conclusions are recorded in the PR after
  publication; no local run is represented as hosted evidence.
- Initial PR run `31776171520` failed because the policy used substring
  detection and matched its own source. GitHub job `94691933099` supplied the
  exact log evidence. Commit
  `697bfe63a08b7fd8729d37b9e35a7cee75214076` contains the red/green event-syntax
  fix; only the replacement final-head runs count for completion.
- Scoped-license head `1c9ed25b681544bc4041ad2f37b6f9fbf1848eb5`
  passed deterministic run `31856944544`, job `94943407140`, and
  workflow-policy run `31856944538`, job `94943407431`. The final hosted-evidence
  and CodeQL-repair head receives replacement runs recorded in PR #7.

## Hosted GitHub controls

Authenticated GitHub REST verification on 2026-08-15 established:

- Public visibility, default branch `main`, sole admin owner, zero environments,
  and auto-merge disabled.
- Active ruleset `20882388` targets the default branch, requires pull requests
  and strict `Deterministic verification` plus `workflow-policy`, prevents
  deletion and non-fast-forward updates, requires review-thread resolution,
  requires zero approvals, and gives only the sole owner an always bypass.
- Actions are enabled with `allowed_actions: selected` and mandatory full-SHA
  pinning. The allowlist contains only the three exact checkout/setup-node SHAs
  used by current workflows; broad GitHub-owned and verified-creator allowances
  are false. Default workflow tokens are read-only and cannot approve PRs.
- Secret scanning and push protection are enabled with zero open secret alerts.
  Vulnerability alerts and unpaused Dependabot security updates are enabled
  with zero open Dependabot alerts. Private vulnerability reporting is enabled.
- CodeQL default setup is configured for Actions and JavaScript/TypeScript;
  setup run [31862487322](https://github.com/u-dont-existDOTcom/AskRigor/actions/runs/31862487322)
  succeeded. Two findings are durably dismissed: the high-entropy bearer-key
  normalization is not password storage, and the shell alert is confined to an
  unprivileged deterministic test. The real prototype-pollution alert has the
  test-first candidate fix described above and is rechecked after merge.

These are hosted API results, not inferences from repository files. Hardening
issue [#6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6) closes only
after the final PR head/checks are recorded there.

## Residual risk and owner boundary

- The main ruleset and security controls are effective. The final PR head must
  pass both required checks, and the fixed CodeQL alert must close on the merged
  default-branch analysis before final completion is reported.
- The owner selected scoped `AGPL-3.0-or-later` coverage for original software.
  The license boundary is regression-tested and does not change canonical
  protocol or health-research authority.
- Existing public-release gates and the candidate-versus-production distinction
  remain unresolved by design and are not accepted through this compliance PR.
- No fake solo-maintainer approval rule is proposed.
- Hardening issue #6 is the durable hosted-control closeout record.

## Lesson closeout

- `project-specific`: AskRigor's protocol wording, research routing, current
  release candidate, public-submission decisions, and scoped software-license
  boundary remain in AskRigor.
- `promoted`: exact-byte authority, truthful partial-access states, bounded
  opt-in live validation, public read-only MCP safety, and structure-aware
  secret detection are recorded with exact source hashes, limits, tests, and
  supersession in universal PR #4 exact head
  `1d1e6d03a92bbcec65bdc02ea6490af6e640eda8`, file
  `audits/2026-08-14-askrigor-transferable-controls.md`.
- `superseded`: the stale remote `codex/github-baseline` branch is not reused;
  it diverged before current `main` and has no open PR. No branch is deleted by
  this task.
- `no-new-lesson`: the CodeQL prototype-pollution repair is standard defensive
  object construction and does not add a new universal architecture rule.

Canonical current state: `project/CODEX-CURRENT-STATE.md`.

`COMPLIANT`
