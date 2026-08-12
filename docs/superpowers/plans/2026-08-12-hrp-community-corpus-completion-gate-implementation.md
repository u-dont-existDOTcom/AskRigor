# HRP Community Corpus Completion Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release HRP `20.5.16` with an early, field-driven community-corpus completion gate that blocks synthesis on partial or query-bounded YouTube retrieval and protects the exact observed failure with regression tests.

**Architecture:** Keep the existing detailed YouTube acquisition and access-boundary rules as the method layer. Add one compact top-level `CommunityCorpusCompletionGate` before `ProtocolExecutionAndComplianceGate` as the completion-control layer, reflect its state in existing ledgers, and enforce the canonical XML contract through plugin tests and exact-byte digest checks.

**Tech Stack:** Model-facing XML, TypeScript 7, Vitest 4, `fast-xml-parser`, MCP SDK, SHA-256 integrity verification.

## Global Constraints

- Canonical HRP version is `20.5.16`; revision date is `2026-08-12`.
- Query-filtered YouTube retrieval is discovery-only and cannot classify the signal corpus by itself.
- Any non-complete principal retrieval, incomplete extraction class, unconsumed cursor, `has_more=true`, or explicit query-bounded/incomplete limitation blocks community-audit completion.
- Continue automatically when broader retrieval is possible; otherwise require the existing `CommunityCorpusAccessBoundaryCompletion` conditions.
- Full HRP synthesis is blocked while `final_coverage_state` is `incomplete`.
- Preserve privacy minimization, person-by-treatment episode analysis, multilingual discovery, and the existing access-boundary exception.
- Historical release evidence keeps the version it actually documented; current manifest expectations and review fixtures must match the new canonical bytes.

---

### Task 1: Create the failing protocol contract

**Files:**
- Modify: `tests/protocol.test.ts`
- Modify: `tests/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `loadProtocol("hrp")`, `getProtocolManifest("hrp")`, and the MCP `load_protocol` tool.
- Produces: executable contract assertions for HRP version, gate position, trigger fields, coverage ledger, exact regression case, and MCP manifest exposure.

- [ ] **Step 1: Change manifest expectations to the new version**

In `tests/protocol.test.ts`, expect:

```ts
await expect(getProtocolManifest("hrp")).resolves.toMatchObject({
  name: "HRP",
  version: "20.5.16",
  revisionDate: "2026-08-12"
});
```

In `tests/mcp-tools.test.ts`, make the `load_protocol` structured manifest expect the same version and date. Leave the old digest temporarily so the RED phase proves exact-byte expectations also need updating.

- [ ] **Step 2: Add a structural gate-and-regression test**

Add one focused test to `tests/protocol.test.ts` that loads the canonical text and asserts:

```ts
expect(text).toContain('<CommunityCorpusCompletionGate priority="Critical">');
expect(text.indexOf("<CommunityCorpusCompletionGate")).toBeLessThan(
  text.indexOf("<ProtocolExecutionAndComplianceGate")
);

for (const required of [
  'name="PartialRetrievalCannotCompleteAudit"',
  'access_status',
  'extraction_coverage',
  'next_cursor',
  'has_more=true',
  'name="QueryBoundedYouTubeSearchIsDiscoveryOnly"',
  'name="NoPrematureSaturation"',
  'name="CoverageStateBeforeSynthesis"',
  'principal_platforms_mapped',
  'acquisition_mode',
  'unfiltered_retrieval_attempted',
  'pagination_exhausted',
  'replies_reconciled',
  'unique_firsthand_people',
  'unique_treatment_episodes',
  'benefit_search_completed',
  'no_effect_search_completed',
  'harm_search_completed',
  'discontinuation_search_completed',
  'independent_discussion_pools_sampled',
  'final_coverage_state',
  'complete / completed-with-access-boundary / incomplete',
  'id="OneQueryBoundedYouTubeCommentPresentedAsReconnaissance"',
  'search term "used"',
  'search term "results"'
]) {
  expect(text).toContain(required);
}
```

Also assert the rule text says query-bounded search is discovery-only, directs unfiltered pagination/reply reconciliation, prohibits signal characterization, continues when retrieval is possible, and invokes `CommunityCorpusAccessBoundaryCompletion` only for a genuine access boundary.

- [ ] **Step 3: Run the focused tests and capture RED**

Run:

```bash
npm run test:run -- tests/protocol.test.ts tests/mcp-tools.test.ts --maxWorkers=1
```

Expected: FAIL because the canonical manifest remains `20.5.15`, the new gate and exact regression are absent, and the MCP response exposes the old version.

- [ ] **Step 4: Commit the failing contract**

```bash
git add tests/protocol.test.ts tests/mcp-tools.test.ts
git commit -m "test: require HRP community corpus completion gate"
```

---

### Task 2: Implement HRP 20.5.16 and align exact-byte consumers

**Files:**
- Modify: `protocols/HRP_Full.xml`
- Modify: `tests/protocol.test.ts`
- Modify: `tests/mcp-tools.test.ts`
- Modify: `docs/public-review-cases-v0.1.0.json`

**Interfaces:**
- Consumes: existing `CommunityCorpusAccessBoundaryCompletion`, `YouTubeAcquisitionCoverageAndCapability`, `ProtocolExecutionLedger`, `BidirectionalEvidenceIterationLedger`, and `StressTestExpectations` structures.
- Produces: canonical HRP `20.5.16`; exact SHA-256 expected by protocol/MCP tests; current public-review fixture aligned to the canonical manifest.

- [ ] **Step 1: Update canonical version metadata and revision history**

Change the root to:

```xml
<Protocol name="HRP" version="20.5.16" revisionDate="2026-08-12" ...>
```

Append a concise `20.5.16` revision entry explaining that concrete incomplete retrieval output now blocks community synthesis, query-bounded YouTube search is discovery-only, the coverage ledger is mandatory, and the exact failure was added as a regression.

- [ ] **Step 2: Add the early completion-control layer**

Add an Architecture layer naming `CommunityCorpusCompletionGate` as the controller for tool-output-driven community completion. Insert the new top-level critical gate before `ProtocolExecutionAndComplianceGate` with exactly four rules:

```xml
<CommunityCorpusCompletionGate priority="Critical">
 <Rule name="PartialRetrievalCannotCompleteAudit" priority="Critical">...</Rule>
 <Rule name="QueryBoundedYouTubeSearchIsDiscoveryOnly" priority="Critical">...</Rule>
 <Rule name="NoPrematureSaturation" priority="Critical">...</Rule>
 <Rule name="CoverageStateBeforeSynthesis" priority="Critical">...</Rule>
</CommunityCorpusCompletionGate>
```

The implementation text must enumerate `access_status`, `extraction_coverage`, `next_cursor`, `has_more=true`, explicit query-bounded limitations, prohibited prevalence/direction/rarity/typicality/strength claims, automatic continuation, unfiltered acquisition, pagination, replies, reply reconciliation, the required ledger fields, and the three final coverage states.

- [ ] **Step 3: Instantiate the state in existing ledgers and final checks**

Extend `ProtocolExecutionLedger` and the YouTube portion of `BidirectionalEvidenceIterationLedger` with all required snake-case fields. Add final self-checks that explicitly fail closed on incomplete tool output and query-bounded discovery-only retrieval.

- [ ] **Step 4: Add the exact observed regression case**

Add `OneQueryBoundedYouTubeCommentPresentedAsReconnaissance` under `StressTestExpectations`, preserving the concrete `used`/`results` searches, partial fields, premature weak/indeterminate conclusion, required unfiltered retrieval, pagination, replies, directional sampling, deduplication, independent pools, and genuine access-boundary fallback.

- [ ] **Step 5: Recompute and propagate the canonical digest**

Run:

```bash
sha256sum protocols/HRP_Full.xml
```

Replace the HRP digest constants in `tests/protocol.test.ts` and `tests/mcp-tools.test.ts`. Update `docs/public-review-cases-v0.1.0.json` so the current HRP integrity fixture, version, and digest match the new canonical file exactly.

- [ ] **Step 6: Run focused GREEN checks**

Run:

```bash
npm run test:run -- tests/protocol.test.ts tests/mcp-tools.test.ts --maxWorkers=1
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
git diff --check
```

Expected: all focused tests pass, plugin validation passes, and the diff check is clean.

- [ ] **Step 7: Commit the implementation**

```bash
git add protocols/HRP_Full.xml tests/protocol.test.ts tests/mcp-tools.test.ts docs/public-review-cases-v0.1.0.json
git commit -m "fix: block synthesis on partial community retrieval"
```

---

### Task 3: Verify the complete plugin and live-readiness boundary

**Files:**
- Modify only if evidence wording is factually stale: `docs/release-evidence-v0.1.0.md`

**Interfaces:**
- Consumes: committed HRP `20.5.16`, repository build/test commands, installed plugin validator, and the production MCP read-only health/load interfaces.
- Produces: reproducible local verification evidence and, if a normal immutable MCP rollout path is available and safe, confirmation that production serves the exact new manifest without reading provider secrets.

- [ ] **Step 1: Run concise static verification**

```bash
npm run typecheck
npm run build
npm run test:site
npm run test:site-deploy
bash -n ops/public-site/bootstrap-apex-tls.sh
bash -n ops/public-site/install-public-site.sh
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run the serialized full suite**

```bash
npm run test:run -- --maxWorkers=1
```

Expected: every non-skipped test passes. Use serialized execution because the repository's parallel live-security scan has a documented five-second timeout flake.

- [ ] **Step 3: Inspect the production rollout boundary without secrets**

Inspect only deployment topology, image/release identifiers, permissions, health, and protocol manifest output. Never read, print, copy, or checksum `/opt/askrigor/runtime.env` contents. Proceed with an immutable rollout only if the current deployment path can preserve the existing runtime env, Caddy/site routes, and rollback state; otherwise stop at a concrete rollout handoff instead of improvising.

- [ ] **Step 4: Verify post-rollout behavior when rollout is performed**

Confirm:

```text
https://mcp.askrigor.com/healthz -> 200
get_protocol_manifest(hrp) -> version 20.5.16, revisionDate 2026-08-12, exact local SHA-256
load_protocol(hrp) -> complete canonical text containing CommunityCorpusCompletionGate
askrigor.com routes remain 200 and MCP container remains healthy
```

No provider query or secret exposure is required for this protocol-only rollout.

- [ ] **Step 5: Request independent review and resolve findings**

Review scope: early-gate position and salience, field-trigger completeness, genuine-access-boundary semantics, exact regression fidelity, digest propagation, historical-evidence accuracy, and live rollout safety. Resolve any Critical or Important findings with a new failing regression before completion.

- [ ] **Step 6: Record final status**

Report the canonical version/digest, local test counts, independent review result, live deployment state, unchanged MCP/site health, and any remaining public-submission gates. Do not claim live HRP `20.5.16` unless the production manifest was directly verified.
