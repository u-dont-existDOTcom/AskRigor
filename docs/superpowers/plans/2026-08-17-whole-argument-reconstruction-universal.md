# Whole-Argument Reconstruction Universal Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate whole-argument reconstruction into AskRigor Universal Instructions 20.5.13 with exact-byte manifest closure and no HRP change.

**Architecture:** Add a fail-closed structural regression first. Then use a temporary guarded Node updater and branch-only GitHub Actions workflow to transform the complete canonical XML in place, update all current identity dependents, execute the full deterministic gate, and commit generated output. Remove one-off machinery, reverify, review, and merge the exact green head.

**Tech Stack:** XML, Node.js 24.18.0, Vitest, GitHub Actions, SHA-256 manifests.

## Global Constraints

- Base must be exact Universal `20.5.12` / `2026-08-16`.
- Result must be Universal `20.5.13` / `2026-08-17`.
- `protocols/HRP_Full.xml` must remain byte-identical.
- The existing premise-integrity and truth-priority gate must remain intact.
- Romance-specific content must not enter the universal XML.
- All exact current-version and current-digest dependents must be reconciled.
- Temporary updater/workflow files must not remain on merged `main`.

---

### Task 1: Add the failing protocol regression

**Files:**
- Create: `tests/whole-argument-reconstruction-structure.test.ts`

**Interfaces:**
- Consumes: complete `protocols/Universal_Instructions.xml` bytes.
- Produces: a structural contract for version/date, revision, gate, core rules, behavior/context preservation, selective-feedback preservation, exact repair contract, and point-of-generation check.

- [x] Write the regression against the desired Universal 20.5.13 state.
- [x] Push and confirm deterministic verification fails because 20.5.12 lacks the new gate.

### Task 2: Generate the canonical protocol update transactionally

**Files:**
- Create temporarily: `scripts/apply-whole-argument-reconstruction-update.mjs`
- Create temporarily: `.github/workflows/whole-argument-reconstruction-update.yml`
- Modify by generator: `protocols/Universal_Instructions.xml`
- Modify by generator: `tests/protocol.test.ts`
- Modify by generator: `project/CODEX-CURRENT-STATE.md`
- Modify any other exact current-identity dependent discovered by the guarded scan.

**Interfaces:**
- Consumes: exact base XML and current SHA-256.
- Produces: Universal 20.5.13, its SHA-256, synchronized current manifests/tests/state, and a complete deterministic verification receipt.

- [x] Implement exact-once root, revision, gate, and point-check transformations.
- [x] Compute the resulting SHA-256 and update current identity dependents.
- [x] Fail closed on unexpected base state, duplicate markers, missing markers, or unhandled active old-digest references.
- [x] Run `npm ci`, updater, `npm run verify`, and `git diff --check` in the temporary workflow.
- [x] Confirm the generated commit is green and the HRP digest remains unchanged.

### Task 3: Remove one-off machinery and close the durable state

**Files:**
- Delete: `scripts/apply-whole-argument-reconstruction-update.mjs`
- Delete: `.github/workflows/whole-argument-reconstruction-update.yml`
- Update: this plan
- Update: `project/CODEX-CURRENT-STATE.md` when final closeout requires it.

**Interfaces:**
- Produces: a clean permanent diff containing only canonical instructions, durable tests/spec/plan/state, and exact identity updates.

- [x] Remove temporary update machinery.
- [x] Run or observe fresh full verification on the exact cleanup head.
- [x] Review the complete diff and confirm no HRP/application/runtime change.
- [ ] Open a pull request, wait for required checks, and merge the exact green head.
- [ ] Verify merged `main` reports Universal 20.5.13 and its new digest.

## Verification receipts

- RED run: `32000581156` — 915 existing tests passed; the new structural regression failed only because Universal was still `20.5.12`; the HRP byte-preservation assertion passed.
- Generated GREEN run: `32001115549` — Universal `20.5.13` / `2026-08-17`, SHA-256 `3bef54307403df2cbd459377bc308747db47310aefe68cac3b7b2b75c87f92c4`; HRP SHA-256 remained `4d27c5cd50b9cb097e247101128a89759b2da9c5ca1d758cfec812724b210ae5`; typecheck, 916 tests, build, and `git diff --check` passed.
- Cleanup GREEN run: `32001428300` — stale README identity repaired; one-off updater and workflow removed; full deterministic verification, identity checks, HRP byte check, and patch hygiene passed on cleanup head `f139df1c4bf26c452c5503adf373f80c86a96fe8`.
- Pull request: `#25` against `main`.
