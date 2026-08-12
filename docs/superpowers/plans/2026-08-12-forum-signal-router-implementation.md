# Forum-Signal Router and YouTube Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact ChatGPT Project router and a single read-only YouTube community-audit tool that completes discovery, unfiltered comments, replies, pagination, sampling, and receipt generation without paid model inference.

**Architecture:** ChatGPT Project instructions conservatively select Forum Signal before HRP execution. The Forum Signal module uses ChatGPT browsing for independent forums and one compound AskRigor tool for YouTube. The MCP handler composes the existing tested YouTube adapters, returns bounded samples plus full-corpus receipts, and never performs semantic synthesis or persistence.

**Tech Stack:** TypeScript 7, Node.js 24, MCP SDK 1.30, Zod 4, Vitest 4, YouTube Data API v3 fixtures.

## Global Constraints

- Do not call the OpenAI API, run a local model, add n8n, or add a paid inference dependency.
- Keep the server read-only and stateless; do not persist YouTube comments or research ledgers.
- Preserve canonical AskRigor access statuses literally.
- Treat `search_youtube_comments` as discovery-only; the compound audit must never use it for corpus acquisition.
- Treat a bounded provider-ranked YouTube search page as completed discovery without claiming exhaustive platform search.
- Require `api_visible_complete`, exhausted comment pagination, and empty reply mismatches for a complete selected-video corpus.
- Return `synthesis_lock: "block"` for incomplete acquisition and `pass` only for terminal complete, zero-candidate, or explicit access-boundary states.
- Keep `max_videos` between 1 and 3 and `sample_comments_per_video` between 20 and 500.
- The exact permanent routing regression is `@AskRigor best way to fix an old hip that barely works and hurts`.

---

### Task 1: Add the copy-ready ChatGPT Project router package

**Files:**
- Create: `project/PROJECT_INSTRUCTIONS.md`
- Create: `project/FORUM_SIGNAL_MODULE.md`
- Create: `project/README.md`
- Create: `tests/project-router.test.ts`

**Interfaces:**
- Consumes: the existing AskRigor protocol tools and the future `audit_youtube_community` tool name.
- Produces: a compact module-routing contract and a `forum_signal_receipt` consumed by HRP synthesis.

- [ ] **Step 1: Write the failing Project-package regression**

Add `tests/project-router.test.ts` that reads the three Project files and asserts observable package behavior: exact file set, compact router word count, no embedded HRP XML, sensitive Forum Signal trigger, uncertainty-to-required rule, irreversible required state, exact hip prompt regression, explicit excellent-RCT non-exit, compound tool call, all four directional categories, both transfer directions, receipt fields, and full-HRP label lock.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm run test:run -- tests/project-router.test.ts --maxWorkers=1
```

Expected: FAIL because `project/` does not exist.

- [ ] **Step 3: Write the minimal Project package**

Create a short dispatcher in `PROJECT_INSTRUCTIONS.md`, the executable module contract in `FORUM_SIGNAL_MODULE.md`, and one-time setup instructions in `README.md`. The module's output contract must be:

```text
forum_signal_receipt:
  status: complete | completed_with_access_boundary | incomplete
  youtube_synthesis_lock: pass | block
  benefit: complete | no_material_reports | incomplete
  no_effect: complete | no_material_reports | incomplete
  harm: complete | no_material_reports | incomplete
  discontinuation: complete | no_material_reports | incomplete
  community_to_formal: complete | no_material_transferable_hypotheses | incomplete
  formal_to_community: complete | no_material_discriminators | incomplete
  confidence_effect: <explicit text>
```

- [ ] **Step 4: Run the Project-package test and verify GREEN**

Run the Step 2 command. Expected: one passing file and no failures.

- [ ] **Step 5: Commit**

```bash
git add project tests/project-router.test.ts
git commit -m "docs: add compact forum signal router"
```

### Task 2: Add deterministic YouTube community-audit orchestration

**Files:**
- Create: `apps/research-mcp/src/youtube-community-audit.ts`
- Create: `tests/youtube-community-audit.test.ts`

**Interfaces:**
- Consumes: `searchYoutube`, `getYoutubeVideo`, `getYoutubeComments`, `YoutubeConfig`, and `YoutubeCommentRetrievalRuntime` from `@askrigor/sources`.
- Produces: `youtubeCommunityAuditInputSchema`, `youtubeCommunityAuditOutputSchema`, `auditYoutubeCommunity(input, config, runtime)`, `sampleYoutubeComments(comments, limit)`, and the structured receipt specified in the design.

- [ ] **Step 1: Write failing complete-flow and sampling tests**

Use the real source adapters with the recorded YouTube fixtures and a controlled `fetch`. Assert that two directional searches which find the same video cause one metadata call and one unfiltered corpus retrieval; the request trace contains both top-level pages and all independent reply pages, contains no `searchTerms`, and returns:

```ts
{
  access_status: "api_visible_complete",
  receipt: {
    completion_state: "api_visible_complete",
    synthesis_lock: "pass",
    selected_video_ids: ["XpZHKGGCK-o"],
    query_bounded_comments_used_as_corpus: false
  }
}
```

Add a separate pure sampling test with 25 literal comment IDs and a limit of 20. Its expected IDs are the hand-derived chronological indices `0,1,2,3,5,6,7,8,10,11,12,13,15,16,17,18,20,21,22,24`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm run test:run -- tests/youtube-community-audit.test.ts --maxWorkers=1
```

Expected: FAIL because the audit module does not exist.

- [ ] **Step 3: Implement the minimal complete flow**

Implement strict Zod schemas, distinct-query search execution, round-robin/deduplicated video selection, metadata retrieval, unfiltered comment retrieval with replies, canonical corpus hashing, chronological systematic sampling, aggregation of limitations, and complete/zero/access-boundary/incomplete receipt classification. Do not retain the full corpus in the returned result after sampling.

- [ ] **Step 4: Add failing terminal-state tests**

Add tests for:

- exhausted zero search results → `complete_no_candidates`, `access_status: "complete"`, lock pass;
- comments disabled after successful discovery → `completed_with_access_boundary`, literal `comments_disabled`, lock pass;
- a one-page comment budget against a two-page fixture → `incomplete`, literal `partial`, lock block.

Run the focused test and verify each new case fails for the missing classification before changing production code.

- [ ] **Step 5: Implement terminal-state classification and verify GREEN**

Run the focused test. Expected: all community-audit tests pass with no unexpected provider request.

- [ ] **Step 6: Commit**

```bash
git add apps/research-mcp/src/youtube-community-audit.ts tests/youtube-community-audit.test.ts
git commit -m "feat: add deterministic YouTube community audit"
```

### Task 3: Expose the compound audit through MCP and prioritize it in server guidance

**Files:**
- Modify: `apps/research-mcp/src/config.ts`
- Modify: `apps/research-mcp/src/register-tools.ts`
- Modify: `tests/mcp-tools.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas and `auditYoutubeCommunity`.
- Produces: the fifteenth read-only MCP tool, `audit_youtube_community`.

- [ ] **Step 1: Write the failing MCP metadata regression**

Append `audit_youtube_community` to the exact tool list and assert its description explicitly covers plausible firsthand relevance, pre-synthesis use, unfiltered comments/replies, and no medical conclusion. Assert strict input bounds and output schema roots. Assert the first 512 characters of `SERVER_INSTRUCTIONS` name the compound tool, the plausible-relevance trigger, the excellent-RCT non-exit, and the query-bounded prohibition.

- [ ] **Step 2: Run the MCP metadata test and verify RED**

Run:

```bash
npm run test:run -- tests/mcp-tools.test.ts --maxWorkers=1
```

Expected: FAIL because the fifteenth tool is absent.

- [ ] **Step 3: Register the tool and update server instructions**

Register the exact Task 2 schemas with the existing read-only annotations. Call `auditYoutubeCommunity` with the existing environment-derived YouTube config and public comment budgets. Return a concise text result that includes the completion state and synthesis lock; incomplete research evidence is a successful tool execution with a blocking receipt, not an MCP transport error.

- [ ] **Step 4: Add and pass an MCP execution regression**

Call the compound tool through the in-memory MCP client with the recorded fixtures and assert the structured receipt survives schema validation unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/research-mcp/src/config.ts apps/research-mcp/src/register-tools.ts tests/mcp-tools.test.ts
git commit -m "feat: expose compound community audit tool"
```

### Task 4: Align documentation, inventory, and package validation

**Files:**
- Modify: `README.md`
- Modify: `docs/privacy-data-map.md` only if the new returned sample/digest changes its disclosed field categories.
- Modify: `docs/tool-inventory-v0.1.0.json`
- Modify: `docs/public-review-checklist.md`
- Modify: `tests/release-packet.test.ts`
- Modify: `tests/plugin-package.test.ts` only if the local skill contract must reference the compound tool.

**Interfaces:**
- Consumes: the final MCP `tools/list` output.
- Produces: source-aligned reviewer metadata and clear Project installation instructions.

- [ ] **Step 1: Write failing release-packet expectations**

Update the exact tool-name array and count from 14 to 15. Add an assertion that the committed inventory contains the compound tool's receipt schema and safe read-only annotations. Keep historical production evidence explicitly historical rather than rewriting prior Inspector facts.

- [ ] **Step 2: Run the release-packet test and verify RED**

Run:

```bash
npm run test:run -- tests/release-packet.test.ts tests/plugin-package.test.ts --maxWorkers=1
```

Expected: FAIL because the committed inventory/checklist still describe 14 tools.

- [ ] **Step 3: Update docs and regenerate the inventory**

Update the README with the zero-paid-model architecture and Project setup. Regenerate inventory from the actual MCP server:

```bash
npx tsx scripts/generate-tool-inventory.mts > docs/tool-inventory-v0.1.0.json
```

Compute the compact-JSON SHA-256 and update the exact release-packet assertion and current-source section of the review checklist. Preserve the recorded 14-tool production Inspector result until the new image is deployed and freshly inspected.

- [ ] **Step 4: Validate plugin and focused docs tests**

Run:

```bash
python3 /home/joel/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py .
python3 /home/joel/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/askrigor
npm run test:run -- tests/release-packet.test.ts tests/plugin-package.test.ts tests/project-router.test.ts --maxWorkers=1
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs tests/release-packet.test.ts tests/plugin-package.test.ts
git commit -m "docs: package forum signal project workflow"
```

### Task 5: Verify the complete candidate and prepare deployment

**Files:**
- Modify only files required by an observed failing verification.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: a clean, deployable feature branch with exact test evidence.

- [ ] **Step 1: Run focused behavioral verification**

```bash
npm run test:run -- tests/project-router.test.ts tests/youtube-community-audit.test.ts tests/mcp-tools.test.ts tests/release-packet.test.ts --maxWorkers=1
```

- [ ] **Step 2: Run the complete release verification**

```bash
npm run typecheck
npm run build
npm run test:run -- --maxWorkers=1
npm run test:site
git diff --check
```

The MCP integration tests require permission to bind local-only ports and IPC sockets. Expected result: every non-live test passes; only the guarded live-provider tests skip when credentials are not deliberately enabled.

- [ ] **Step 3: Review the final diff against the design**

Confirm every design requirement has a test, no paid model/API dependency was added, no corpus persistence was added, low-level tools remain backward compatible, and historical deployment evidence was not presented as fresh evidence.

- [ ] **Step 4: Commit any verification-only correction separately**

Use a terse fix message naming the observed issue. Do not amend earlier RED/GREEN commits.

### Task 6: Integrate, publish, deploy, and refresh the ChatGPT Project

**Files:**
- Modify: `docs/release-evidence-v0.1.0.md` only after fresh deployment evidence exists.

**Interfaces:**
- Consumes: a fully verified candidate commit.
- Produces: matching GitHub `main`, deployed MCP tool metadata, rollback evidence, and exact user setup steps.

- [ ] **Step 1: Merge the verified feature branch into local `main`**

Fetch `origin/main`, require zero remote divergence, merge `agent/forum-signal-router`, and rerun the focused plus full verification on the merge result.

- [ ] **Step 2: Push `main` to GitHub**

Push only after the post-merge suite passes, then fetch and require local `HEAD` to equal `origin/main`.

- [ ] **Step 3: Deploy with the existing reversible production procedure**

Build an immutable source archive from the pushed commit, transfer it without secrets, build the production image on the VPS, retain the prior image/commit as rollback state, recreate only `research-mcp`, and leave Caddy plus the apex site unchanged. Do not read or print runtime secret values.

- [ ] **Step 4: Run fresh production acceptance**

Verify `/healthz`, MCP initialization, exact 15-tool discovery, read-only annotations, the compound tool schema, one deliberately bounded YouTube fixture/public acceptance flow, unchanged Caddy/site containers and routes, and loopback-only port 3000. Roll back on failure.

- [ ] **Step 5: Install the Project package manually**

Tell the user to replace the ChatGPT Project instructions with `project/PROJECT_INSTRUCTIONS.md`, upload `project/FORUM_SIGNAL_MODULE.md`, refresh the developer-mode connector, and start a new thread. Repository and server deployment cannot edit an existing ChatGPT Project automatically.

- [ ] **Step 6: Re-run the exact hip regression in the new Project thread**

The regression passes only if Forum Signal is fixed as required before substantive research, the compound YouTube tool is called despite an excellent RCT, the receipt reaches a terminal pass state or an explicit incomplete state, both transfer directions are recorded, and the full-HRP opening appears only after the completion gate passes.
