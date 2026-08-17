# AskRigor Public Submission Packet Repair Implementation Plan

> **For agentic workers:** Execute this plan in order. Preserve the extended
> review suite and all historical receipts; do not modify production behavior.

**Goal:** Produce a clean, machine-validated AskRigor plugin package and a
separate truthful OpenAI portal handoff containing exactly five positive and
three negative submission cases.

**Architecture:** Keep `.codex-plugin/plugin.json` responsible only for the
distributable package and supported listing metadata. Keep portal-only fields
and external verification states in
`docs/public-submission-packet-v0.1.0.json`. Preserve the existing 6+3 case file
as the extended regression suite and reference a 5+3 subset from the packet.

**Tech stack:** JSON, SVG, Markdown, Node.js 24.18.0, TypeScript, Vitest, the
current local `plugin-creator` validator, and the repository's existing CI.

---

## Task 1: Add failing package and submission-packet contract tests

**Files:**

- Modify: `tests/plugin-package.test.ts`
- Create: `tests/public-submission-packet.test.ts`

### Step 1: Name the breaks

The tests must fail for these real publication defects:

- a clean package still references missing `.app.json`;
- display/short-description limits exceed the directory contract;
- required logo or composer icon is absent, unsafe, non-square, or too small;
- portal URLs or production MCP endpoint drift;
- the portal selection is not exactly five positive and three negative cases;
- a selected case is absent from the extended suite;
- `positive-6` is deleted instead of retained as extended evidence;
- a pending external gate is relabeled complete without an evidence receipt;
- a pending demo gate contains a fabricated URL; or
- the packet lacks official-source provenance or release notes.

### Step 2: Update the package expectation first

Change the exact manifest expectation to remove `apps` and require:

```json
{
  "interface": {
    "shortDescription": "Auditable research retrieval",
    "brandColor": "#145A8D",
    "logo": "./assets/askrigor-logo.svg",
    "composerIcon": "./assets/askrigor-composer-icon.svg"
  }
}
```

Retain the `.app.json` ignore assertion so local credentials/connection IDs
cannot be committed. Replace the optional app-mapping test with an assertion
that the public package manifest does not declare `apps`.

### Step 3: Add the portal-packet test

Load the real plugin manifest, portal packet, extended case file, and both SVG
assets. Assert literal requirements independently of implementation helpers:

- schema/release/source-review fields are present;
- URLs equal the verified production/legal/support endpoints;
- metadata agrees with the plugin manifest and is within limits;
- selected IDs equal `positive-1` through `positive-5` and `negative-1`
  through `negative-3`;
- extended case counts remain six and three and still contain `positive-6`;
- selected IDs resolve exactly once;
- every external gate uses the allowed status vocabulary;
- pending gates have no evidence receipt, completion time, or invented URL;
- SVGs are real square 512-by-512 UTF-8 XML files below 5 MiB and contain no
  scripts, external references, embedded raster data, or remote fonts.

### Step 4: Prove RED

Run:

```bash
npm run test:run -- tests/plugin-package.test.ts tests/public-submission-packet.test.ts
```

Expected: FAIL because the package, assets, and portal packet have not yet been
repaired.

---

## Task 2: Implement the clean package and portal packet

**Files:**

- Modify: `.codex-plugin/plugin.json`
- Create: `assets/askrigor-logo.svg`
- Create: `assets/askrigor-composer-icon.svg`
- Create: `docs/public-submission-packet-v0.1.0.json`
- Create: `docs/public-submission-demo-recording.md`

### Step 1: Repair the plugin manifest

Remove only the local `apps` reference. Retain the skill, product identity,
capabilities, legal URLs, and starter prompt. Add the approved short
description, brand color, and two in-package asset paths. Do not add unsupported
portal-only fields.

### Step 2: Add self-contained branding assets

Create the approved 512-by-512 blue/cream `AR` logo and simplified composer
mark. Use basic SVG paths/shapes only. Include numeric `viewBox`, `width`, and
`height`; do not include script, CSS imports, external links, images, metadata,
or fonts.

### Step 3: Add the portal handoff

Create a stable JSON object containing:

- packet schema/version and reviewed-at date;
- official source URLs;
- listing fields and exact portal-only support URL;
- production MCP endpoint and submission mode `with_mcp`;
- packaged asset paths;
- exact 5+3 case selection and the extended-suite path;
- bounded release notes;
- external gates, all initially truthful; and
- demo recording status `pending` with `url: null`.

Identity may be recorded as `in_progress` only because the owner directly
reported the portal state. Domain, Scan Tools, demo recording, final portal
review, and submission remain `pending` until direct evidence exists.

### Step 4: Add the recording script

Specify one bounded recording flow that shows:

1. AskRigor selected in ChatGPT;
2. protocol manifest/integrity/load;
3. one scholarly record retrieval;
4. one public YouTube retrieval with access/coverage semantics;
5. the explicit no-write boundary; and
6. AskRigor website, support, privacy, and terms pages.

List exactly what must stay out of the recording: API keys, developer settings,
private chats, private lesson issues, server logs, or account identifiers.

### Step 5: Prove GREEN

Run the same focused Vitest command and then:

```bash
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
```

Expected: both PASS on the clean worktree.

---

## Task 3: Reconcile public documentation and recovery state

**Files:**

- Modify: `README.md`
- Modify: `docs/INDEX.md`
- Modify: `docs/public-review-checklist.md`
- Modify: `docs/release-evidence-v0.1.0.md`
- Modify: `project/CODEX-CURRENT-STATE.md`

### Step 1: Correct package/submission descriptions

Replace stale claims that the public package references `.app.json`. Explain
that local connection mappings stay ignored and the public MCP submission uses
the production server directly through **With MCP**. Link the machine-readable
portal packet and recording script.

### Step 2: Separate extended and portal test sets

Describe `docs/public-review-cases-v0.1.0.json` as the internal 6+3 regression
suite. Describe the packet's positive-1..5 and negative-1..3 selection as the
exact final portal set. Preserve the `positive-6` opaque-receipt limitation.

### Step 3: Reconcile the checkpoint

Record:

- actual base/main and task branch;
- PR #11 and the current durable boundary;
- package/packet repairs completed;
- exact focused, validator, lessons, and full-gate results after they run;
- identity `in_progress` based on owner report;
- other portal gates still pending;
- project-specific/no-new-lesson disposition unless implementation exposes a
  genuinely transferable finding; and
- the exact next owner action after merge.

Do not claim portal acceptance or identity completion.

---

## Task 4: Run final repository verification

### Step 1: Inspect lessons and install state

Run:

```bash
npm ci
npm run lessons:status
```

Record unavailable lesson status truthfully rather than as zero.

### Step 2: Run all applicable gates

Run:

```bash
npm run test:run -- tests/plugin-package.test.ts tests/public-submission-packet.test.ts
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
npm run verify
```

### Step 3: Review the final candidate

Run `git diff --check`, inspect the complete diff and changed-file list, confirm
the extended case file and protocol bytes are unchanged, and scan tracked
changes for credential-shaped or secret-filename material. Record exact results
in the checkpoint and PR.

---

## Task 5: Publish through the protected PR workflow

### Step 1: Commit coherent boundaries

Use one test/implementation commit and one documentation/state closeout commit
if that produces clearer review evidence. Do not rewrite unrelated history.

### Step 2: Push and open one focused PR

The PR body must include:

- objective and non-goals;
- changed files and purpose;
- exact local commands/results;
- official-source review date;
- external gates still pending; and
- lesson-closeout disposition.

### Step 3: Verify required checks and merge

Wait for `Deterministic verification`, `workflow-policy`, and applicable CodeQL
checks on the exact PR head. Address any real finding, then merge using the
repository's documented strategy. Re-fetch protected `main`, verify the merge
commit and post-merge checks, and update the final report without claiming that
the external OpenAI portal work is done.
