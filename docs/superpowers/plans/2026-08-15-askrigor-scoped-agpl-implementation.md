# AskRigor Scoped AGPL Licensing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an exact AGPL-3.0-or-later grant for AskRigor software without
relicensing canonical protocols, research policy/evidence, fixtures, site
editorial/legal content, or archived/third-party material.

**Architecture:** Keep one human-readable scope map in `LICENSE.md` and one
verbatim official license text under `LICENSES/`. A deterministic Vitest
regression checks the reserved boundary and exact official-text hash. Update
only current documentation/evidence; do not rewrite historical plans.

**Tech Stack:** Markdown, GNU AGPLv3 text, Node.js 24.18.0, Vitest, SHA-256, Git.

## Global Constraints

- Never modify either complete canonical protocol file.
- Never claim that an open-source software license grants GitHub write access.
- Reserved material receives no new grant.
- The official AGPL text must have SHA-256
  `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`.
- Work only on `codex/github-compliance-2026-08-14` from recovery ref
  `recovery/askrigor-pre-scoped-agpl-1fbfb9c`.

---

### Task 1: Add a fail-closed licensing regression

**Files:**
- Create: `tests/license-posture.test.ts`

**Interfaces:**
- Consumes: repository-relative `LICENSE.md` and
  `LICENSES/AGPL-3.0-or-later.txt`.
- Produces: deterministic assertions for the scope map and official text hash.

- [x] **Step 1: Write the regression**

Require the AGPL identifier, every reserved path class, both generated-interface
exceptions, the no-protocol-authority statement, and the exact official-text
SHA-256.

- [x] **Step 2: Verify RED**

Run `npx vitest run tests/license-posture.test.ts --reporter=verbose`.
Expected: failure because the official text and approved scope map do not exist.

### Task 2: Publish the minimal approved license boundary

**Files:**
- Modify: `LICENSE.md`
- Create: `LICENSES/AGPL-3.0-or-later.txt`

**Interfaces:**
- Consumes: the approved design and official GNU text.
- Produces: an exact software reuse grant with reserved-material exclusions.

- [x] **Step 1: Replace the no-grant placeholder**

State the covered default, reserved paths, generated-interface exceptions,
third-party boundary, protocol-authority boundary, warranty pointer, and source
of the verbatim license text.

- [x] **Step 2: Add the official text unchanged**

Retrieve from `https://www.gnu.org/licenses/agpl-3.0.txt`, add it only through
`apply_patch`, and verify the required SHA-256.

- [x] **Step 3: Verify GREEN**

Run `npx vitest run tests/license-posture.test.ts --reporter=verbose`.
Expected: all licensing assertions pass.

### Task 3: Reconcile current documentation and final evidence

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `project/CODEX-CURRENT-STATE.md`
- Modify: `docs/audits/2026-08-14-codex-github-compliance.md`
- Modify: `docs/superpowers/plans/2026-08-15-askrigor-scoped-agpl-implementation.md`

**Interfaces:**
- Consumes: the verified licensing artifacts.
- Produces: current human guidance, recovery truth, and exact PR evidence.

- [x] **Step 1: Update only current licensing claims**

Replace the obsolete no-license statements with the scoped AGPL decision and
reserved-material boundary. Preserve historical evidence rather than rewriting
old completed plans.

- [x] **Step 2: Run the exact final gates**

Run `npm run verify`, `npm run test:site`, `npm run test:site-deploy`, the
current universal portable audit, license SHA-256, JSON/YAML/diff checks, and a
complete final-diff review.

- [ ] **Step 3: Publish and inspect CI**

Commit coherently, push the existing compliance branch, capture the exact PR
head and both workflow jobs, and update PR #7 and issue #6.

- [ ] **Step 4: Record closeout**

Mark this plan complete only after the exact-head checks succeed. Record the
license finding as project-specific and no-new-universal-lesson unless a tested
cross-project rule beyond the already-promoted licensing/governance pattern is
identified.
