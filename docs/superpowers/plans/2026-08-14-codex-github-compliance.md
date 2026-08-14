# AskRigor Codex + GitHub Compliance Plan

> **Execution note:** Follow this plan in order, preserving the canonical protocol bytes, the source-access truth model, and the public MCP boundary.

**Goal:** Bring AskRigor to the risk-adjusted Codex + GitHub baseline without changing health-research policy, protocol authority, public release state, or live-provider behavior.

**Architecture:** Treat complete canonical protocol XML as byte authority, keep Project routing modules and release evidence downstream, and make repository governance describe rather than replace those sources. Use the existing hermetic `npm run verify` gate, strengthen its durable GitHub presentation, and keep all live-provider checks explicitly opt-in.

**Runtime:** Node.js 24.18.0, npm lockfile install, TypeScript project references, Vitest, GitHub Actions.

---

## Task 1: Preserve the recovered boundary

**Files:**
- Modify: `docs/INDEX.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `project/README.md`

1. Record the exact authority chain from current owner correction through complete XML bytes, derived manifests, routing modules, source adapters/MCP behavior, release evidence, and current state.
2. State explicitly that summaries, checkpoints, manifests, generated excerpts, and lesson records cannot replace or amend complete protocol bytes.
3. Keep candidate and production release authority separate.

## Task 2: Repair deterministic recovery metadata

**Files:**
- Modify: `.github/codex-repository.json`
- Modify: `CURRENT-STATE.md`
- Modify: `project/CODEX-CURRENT-STATE.md`

1. Declare only commands recovered from `package.json`, `.nvmrc`, CI, and successful final execution.
2. Make `project/CODEX-CURRENT-STATE.md` the canonical recovery checkpoint and retain the root file as an obvious pointer.
3. Record hosted controls only from dated API evidence; mark inaccessible controls `unverified` and unsupported/disabled controls truthfully.

## Task 3: Restore and protect the deterministic gate

**Files:**
- Modify: `tests/project-router.test.ts`
- Verify: `tests/protocol.test.ts`
- Verify: source-access and public-MCP regression suites

1. Preserve the observed failing regression: the copy-ready Project package assertion rejects required governance files in `project/`.
2. Separate repository-control files from the exact conversation files used by the MCP Project and Custom GPT Action surfaces, while continuing to reject accidental extra distributable files.
3. Confirm protocol manifests derive version/date/SHA from the exact XML bytes and fail closed for unreadable, malformed, invalid UTF-8, missing-attribute, or stale-hash inputs.
4. Confirm explicit source-access states, bounded pagination/reply reconciliation, and public MCP ceilings remain unchanged.

## Task 4: Harden repository-visible governance

**Files:**
- Add: `SECURITY.md`
- Add: `CONTRIBUTING.md`
- Modify: `.github/CODEOWNERS`
- Modify: `.github/pull_request_template.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/repository-workflow-policy.yml`

1. Add a private-first vulnerability-reporting policy without promising a hosted control that is disabled.
2. Document the current contribution and no-license-grant posture without selecting a public license for the owner.
3. Cover protocol bytes, source-access contracts, MCP security paths, release/deployment paths, state, and repository policy in CODEOWNERS.
4. Require exact branch/SHA, commands/results, CI evidence, hosted controls, current state, lesson closeout, rollback, and terminal status in PR evidence.
5. Give the deterministic workflow and job stable unique names, ref-scoped concurrency, explicit read-only permissions, immutable Action pins, and bounded execution.
6. Keep provider credentials and live calls out of ordinary PR CI.

## Task 5: Verify and publish one focused change

**Files:**
- Add: `docs/audits/2026-08-14-codex-github-compliance.md`
- Update: `project/CODEX-CURRENT-STATE.md`

1. Run `npm ci` and the final `npm run verify` outside socket-restricted execution when necessary.
2. Run site checks only if site/release behavior is changed; otherwise record them as not applicable to this governance-only diff.
3. Run the current universal portable audit and distinguish real findings from a reproducible audit false positive without weakening AskRigor's secret regression.
4. Inspect the final diff, generated output, untracked files, and likely secrets.
5. Verify hosted GitHub settings through the API; create or update one `Codex + GitHub hardening audit` issue for controls that cannot be completed.
6. Commit, push, open one focused PR, verify final-head CI, and merge only if all required controls and repository policy permit it.

## Task 6: Close lessons without crossing authority boundaries

**Files:**
- Update: `docs/audits/2026-08-14-codex-github-compliance.md`
- Later, in a separate universal repository change: lesson/fleet evidence as warranted

1. Keep AskRigor-specific protocol and release findings project-local.
2. Promote only tested, transferable findings: protocol-byte authority, truthful partial-access states, bounded live validation, public MCP safety, and the portable audit's negative-secret-assertion false positive.
3. Record provenance, exact source commit/path/hash, limits, tests, and supersession data after AskRigor's final commit exists.
