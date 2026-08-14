# AskRigor Codex + GitHub Compliance Report

Date: 2026-08-14
Repository: `u-dont-existDOTcom/AskRigor`
Branch: `codex/github-compliance-2026-08-14`
Recovered base: `50be9e4aba0efd6f4536b425ae9db5b61df1a6e0`
Final implementation commit before this evidence document:
`697bfe63a08b7fd8729d37b9e35a7cee75214076`

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
- Source-access states, pagination/reply reconciliation, MCP request/rate/work
  ceilings, proxy trust, privacy, deployment behavior, and candidate/production
  release state are unchanged.
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
  commands, the canonical state path, dated hosted evidence, and the unexecuted
  live command as explicitly optional rather than task evidence.
- `CURRENT-STATE.md`, `project/CODEX-CURRENT-STATE.md` — provide one obvious
  canonical recovery checkpoint and preserve the exact blocker/evidence state.
- `tests/project-router.test.ts` — repair the recovered failing exact-package
  regression while continuing to enumerate all expected Project files.
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
- `CONTRIBUTING.md`, `LICENSE.md` — preserve a no-license-grant/no-unsolicited-
  code-contribution posture without selecting a public reuse license for the
  owner.
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
  exact-package failure before the repair; GREEN, 10/10 after the minimal test
  correction.

Final implementation candidate:

- `npx vitest run tests/workflow-policy.test.ts --reporter=verbose` — RED: the
  committed workflow policy falsely flagged its own detector text; GREEN: 2/2,
  including rejection of a real mapping-form `pull_request_target` checkout.
- `npm run verify` outside the loopback-restricted sandbox — PASS: typecheck,
  26 test files passed and one credential-gated live file skipped; 467 tests
  passed and five live tests skipped; build passed.
- `npm run test:site` outside the IPC-restricted sandbox — PASS, four pages
  validated. The first sandboxed run failed only because the pinned `tsx`
  runner could not bind its temporary local IPC pipe.
- `npm run test:site-deploy` — PASS, 28/28 tests.
- `sha256sum protocols/HRP_Full.xml protocols/Universal_Instructions.xml` —
  PASS, exact hashes recorded above.
- `python3 /home/joel/universal-dev-architecture-worktrees/codex-github-compliance-2026-08-14/scripts/audit_codex_github.py --root . --fail-on error`
  — PASS, zero errors and four truthful warnings for unverified hosted controls.
- `python3 -m json.tool .github/codex-repository.json` — PASS.
- `git diff --check` — PASS.

`npm run test:live` was deliberately **NOT RUN**. It is a bounded,
credential/provider-dependent opt-in check, not ordinary PR CI or evidence for
this compliance-only change. No OpenAI paid model call, provider credential,
deployment, release, public submission, or production mutation occurred.

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

## Hosted GitHub controls

Refreshed through the connected GitHub App/REST API on 2026-08-14:

- `HOSTED_VERIFIED`: public repository; default branch `main`; auto-merge
  disabled; sole collaborator `u-dont-existDOTcom` has admin; zero
  environments; repository rulesets returned an empty list.
- `DISABLED`: private vulnerability reporting returned `enabled: false`.
- `UNVERIFIED` (`403 Resource not accessible by integration`): classic `main`
  protection, Actions policy, default workflow token permission, vulnerability
  alerts, Dependabot security updates, code-scanning alerts, secret-scanning
  alerts, and repository webhooks.
- Push protection is also `UNVERIFIED`; repository files are not proof.

Therefore PR enforcement, required-check enforcement, force-push/deletion
prevention, solo-maintainer bypass, hosted scanning, vulnerability alerts, and
read-only Actions defaults are not claimed. The exact remaining actions are
durable in [hardening issue #6](https://github.com/u-dont-existDOTcom/AskRigor/issues/6),
which must remain open until direct settings/API evidence exists.

## Residual risk and owner boundary

- Applicable critical-risk hosted controls remain absent, disabled, or
  inaccessible to the current integration. The stable check must succeed on the
  PR head before an authenticated administrator makes it required.
- Selecting a public reuse license remains an owner decision; this branch only
  documents the existing no-license-grant posture.
- Existing public-release gates and the candidate-versus-production distinction
  remain unresolved by design and are not accepted through this compliance PR.
- No fake solo-maintainer approval rule is proposed.
- Hardening issue #6 is the single durable hosted-control/owner-decision record.

## Lesson closeout

- `project-specific`: AskRigor's protocol wording, research routing, current
  release candidate, and public-submission decisions remain in AskRigor.
- `promoted`: exact-byte authority, truthful partial-access states, bounded
  opt-in live validation, public read-only MCP safety, and structure-aware
  secret detection are recorded with exact source hashes, limits, tests, and
  supersession in universal commit
  `7870cd2e649c8a09b0b09f96e0411c546e5f1782`, file
  `audits/2026-08-14-askrigor-transferable-controls.md`.
- `superseded`: the stale remote `codex/github-baseline` branch is not reused;
  it diverged before current `main` and has no open PR. No branch is deleted by
  this task.
- `provisional`: hosted settings remain provisional/unverified until direct
  API/settings proof is available.

Canonical current state: `project/CODEX-CURRENT-STATE.md`.

`BLOCKED`
