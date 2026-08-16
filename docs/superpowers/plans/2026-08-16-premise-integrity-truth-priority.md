# AskRigor Premise Integrity and Truth Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved harmonized premise-integrity and truth-priority behavior to the complete canonical Universal and HRP XML files, with exact version/digest receipts and regressions.

**Architecture:** Treat the two complete canonical XML files as immutable inputs until a failing protocol regression exists. Then use one deterministic, marker-guarded Node updater to patch the complete files in a GitHub Actions checkout, update byte digests, and verify the repository. The updater is branch-scoped, idempotent on the target versions, and fails closed on unexpected source structure.

**Tech Stack:** Node.js 24.18.0, TypeScript/Vitest repository tests, GitHub Actions, canonical XML text files.

## Global Constraints

- Universal target: `20.5.12`, revision `2026-08-16`.
- HRP target: `20.5.18`, revision `2026-08-16`.
- Accuracy must outrank agreement with a prompt premise.
- Verified nonexistence and failed search/access must remain distinct.
- Labeled inference and estimation remain permitted; fabricated factual completion does not.
- Exact required declarations: `This does not exist.` and `I cannot independently verify this source/data.`
- Canonical XML files remain complete standalone sources; no overlay becomes protocol authority.
- Work only on `codex/premise-integrity-truth-priority-2026-08-16`; do not write to `main`.
- Final repository gate: `npm run verify`.

---

### Task 1: Add failing protocol regressions

**Files:**
- Modify: `tests/protocol.test.ts`

**Interfaces:**
- Consumes: `loadProtocol`, `getProtocolManifest`, `verifyProtocolIntegrity` from `@askrigor/protocol`.
- Produces: failing assertions defining the Universal `20.5.12` and HRP `20.5.18` contract.

- [ ] **Step 1: Change manifest expectations to the target versions**

Change the HRP manifest assertion to:

```ts
expect(getProtocolManifest("hrp")).resolves.toMatchObject({
  name: "HRP",
  version: "20.5.18",
  revisionDate: "2026-08-16"
});
```

Change the Universal manifest assertion to:

```ts
expect(getProtocolManifest("universal")).resolves.toMatchObject({
  name: "AskRigor.com universal saved instructions",
  version: "20.5.12",
  revisionDate: "2026-08-16"
});
```

- [ ] **Step 2: Add the Universal behavior regression**

Add a test that loads the Universal text and requires:

```ts
expect(text).toContain('<revision version="20.5.12" priority="Critical">');
expect(text).toContain('<premise_integrity_and_truth_priority_gate priority="Critical">');
expect(text).toContain("Accuracy outranks agreement");
expect(text).toContain("factual assertions embedded in a prompt");
expect(text).toContain("This does not exist.");
expect(text).toContain("I cannot independently verify this source/data.");
expect(text).toContain("I could not verify that this exists");
expect(text).toContain("Labeled inference and estimation remain permitted");
expect(text).toContain("Premise-integrity check:");
```

- [ ] **Step 3: Add the HRP behavior regression**

Require the new gate, Architecture layer, stress cases, and final checks:

```ts
expect(text).toContain('<Revision version="20.5.18" priority="Critical">');
expect(text).toContain('<PremiseIntegrityAndTruthPriorityGate priority="Critical">');
expect(text).toContain('id="premise_integrity_and_truth_priority"');
for (const id of [
  "FalsePremiseCompliance",
  "NonexistentSourceHallucination",
  "SearchFailureIsNotNonexistence",
  "ConfidentUserAssertionStillChecked",
  "ForcedCausalConnection",
  "CitationDoesNotEntailPromptPremise",
  "ArithmeticContradictionBlocksSynthesis",
  "LegitimateLabeledInferenceRemainsAllowed"
]) {
  expect(text).toContain(`<Case id="${id}">`);
}
for (let id = 164; id <= 171; id += 1) {
  expect(text).toContain(`<Check id="FS${id}">`);
}
```

- [ ] **Step 4: Open a draft pull request and verify RED**

Create the PR from the task branch to `main`. Wait for the deterministic verification workflow. Expected result: failure because the canonical files still report `20.5.11` and `20.5.17` and do not contain the new gates.

---

### Task 2: Add the deterministic canonical updater

**Files:**
- Create: `scripts/apply-premise-integrity-update.mjs`
- Create: `.github/workflows/premise-integrity-update.yml`

**Interfaces:**
- Consumes: exact complete `protocols/Universal_Instructions.xml`, `protocols/HRP_Full.xml`, and `tests/protocol.test.ts` from the task-branch checkout.
- Produces: complete target XML bytes plus matching SHA-256 constants in `tests/protocol.test.ts`.

- [ ] **Step 1: Implement guarded text replacement helpers**

The updater must use a helper equivalent to:

```js
function replaceExactlyOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0 || text.indexOf(from, first + from.length) >= 0) {
    throw new Error(`${label}: expected marker exactly once`);
  }
  return text.slice(0, first) + to + text.slice(first + from.length);
}
```

It must accept only base `Universal 20.5.11 / 2026-08-07` or exact target `20.5.12 / 2026-08-16`, and only base `HRP 20.5.17 / 2026-08-13` or exact target `20.5.18 / 2026-08-16`. Any other root state is an error.

- [ ] **Step 2: Patch Universal**

The updater must:

1. change the root version/date and extend the root `fullName` with premise-integrity/truth-priority wording;
2. insert a `20.5.12` Critical revision entry at the top of `<revision_history>`;
3. insert `<premise_integrity_and_truth_priority_gate priority="Critical">` between `</askrigor_keyword>` and `<point_of_generation_checks>`;
4. add `Premise-integrity check:` as the first generation check.

The gate must encode all nine requirements from the accepted design, including these exact output rules:

```text
This does not exist.
I could not verify that this exists
I cannot independently verify this source/data.
```

It must explicitly state that labeled inference and estimation remain permitted when identified as inference rather than verified fact.

- [ ] **Step 3: Patch HRP**

The updater must:

1. change the root version/date and append premise-integrity/truth-priority to `fullName`;
2. insert the `20.5.18` Critical revision entry at the top of `<RevisionHistory>`;
3. add an Architecture layer `id="premise_integrity_and_truth_priority"` before the audience-accessibility layer;
4. insert `<PremiseIntegrityAndTruthPriorityGate priority="Critical">` immediately before `<EpistemicSafetyRules priority="Critical">`;
5. reinforce `NoSilentOverride` with prompt-premise and expected-answer pressure;
6. add the eight named regression cases before `</StressTestExpectations>`;
7. append `FS164` through `FS171` before `</FinalSelfCheck>`;
8. add future-revision protection for this gate.

- [ ] **Step 4: Update exact SHA-256 receipts**

After writing both complete XML files, compute:

```js
createHash("sha256").update(text, "utf8").digest("hex")
```

Replace the two 64-hex constants in `tests/protocol.test.ts` by matching the declarations `HRP_SHA_256` and `UNIVERSAL_SHA_256`, not by hard-coded old digest text. Fail if either declaration cannot be updated exactly once.

- [ ] **Step 5: Add the branch-only workflow**

Create `.github/workflows/premise-integrity-update.yml` with:

- trigger: `push` only on `codex/premise-integrity-truth-priority-2026-08-16` plus `workflow_dispatch`;
- job guard: `github.actor != 'github-actions[bot]'`;
- permissions: `contents: write` only;
- pinned `actions/checkout` and `actions/setup-node` full SHAs already used by repository workflows;
- `npm ci`;
- `node scripts/apply-premise-integrity-update.mjs`;
- `npm run verify`;
- `git diff --check`;
- commit only `protocols/Universal_Instructions.xml`, `protocols/HRP_Full.xml`, and `tests/protocol.test.ts` when changed;
- push back to the same task branch.

---

### Task 3: Verify GREEN and inspect the generated protocol diff

**Files:**
- Verify: `protocols/Universal_Instructions.xml`
- Verify: `protocols/HRP_Full.xml`
- Verify: `tests/protocol.test.ts`

**Interfaces:**
- Consumes: the GitHub Actions bot commit from Task 2.
- Produces: passing deterministic verification and an audited protocol-only diff.

- [ ] **Step 1: Wait for the branch updater workflow**

Confirm the workflow completes and a bot commit appears on the task branch.

- [ ] **Step 2: Verify target manifests from the generated files**

Fetch the branch files and confirm:

```text
Universal 20.5.12 / 2026-08-16
HRP 20.5.18 / 2026-08-16
```

- [ ] **Step 3: Verify exact required strings and regression IDs**

Confirm the new gates contain the exact declarations and the HRP contains all eight regression IDs and FS164-FS171.

- [ ] **Step 4: Inspect the PR diff**

The diff may contain only:

```text
.github/workflows/premise-integrity-update.yml
scripts/apply-premise-integrity-update.mjs
docs/superpowers/specs/2026-08-16-premise-integrity-truth-priority-design.md
docs/superpowers/plans/2026-08-16-premise-integrity-truth-priority.md
tests/protocol.test.ts
protocols/Universal_Instructions.xml
protocols/HRP_Full.xml
```

Any unrelated source change is a failure and must be removed before completion.

- [ ] **Step 5: Confirm repository verification**

Expected: `npm run verify` passes in GitHub Actions with typecheck, all deterministic tests, and build passing.

---

### Task 4: Deliver and integrate

**Files:**
- Final outputs: `protocols/Universal_Instructions.xml`, `protocols/HRP_Full.xml`

**Interfaces:**
- Consumes: verified task-branch files and PR checks.
- Produces: downloadable complete new protocol files and a merge-ready PR.

- [ ] **Step 1: Run final branch review**

Check the exact changed-file list, PR diff, workflow status, versions, and SHA receipts. Do not claim completion from the updater workflow alone.

- [ ] **Step 2: Remove the temporary self-writing workflow if it is not appropriate to retain**

If the generated canonical bytes are already committed and verified, delete `.github/workflows/premise-integrity-update.yml` before merge unless there is a durable reason to keep a branch-specific one-off workflow. Rerun deterministic verification after removal.

- [ ] **Step 3: Keep the deterministic updater only if it is reusable**

If the updater is strictly one-off, remove it before merge after generated bytes are committed. If retained, document its scope and fail-closed base/target contract. Prefer no dead migration code in `main`.

- [ ] **Step 4: Provide the complete outputs**

Return direct branch file links for the complete Universal and HRP XML files and identify their exact versions, revision date, and SHA-256 receipts.

- [ ] **Step 5: Merge only after protected checks pass**

Use the repository's normal protected PR process. Do not bypass failed or pending required checks.
