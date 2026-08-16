# YouTube Action Continuation Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile multi-kilobyte YouTube continuation tokens with short one-hour handles only at the Custom GPT Action boundary while preserving the frozen stateless MCP contract.

**Architecture:** A bounded in-memory store maps 192-bit Action handles to the existing signed stateless tokens. The YouTube Action route resolves handles before shared execution and replaces returned tokens after successful execution; direct MCP behavior remains untouched.

**Tech Stack:** TypeScript, Node.js crypto, Zod, Vitest, deterministic OpenAPI generation, static privacy site, GitHub Actions, Docker Compose production release.

## Global Constraints

- Preserve all canonical protocol bytes and the exact frozen 17-operation MCP inventory.
- Store only the existing signed continuation token; never store comment text, author identity, credentials, provider payloads, or protocol text.
- Use process memory only, with a one-hour non-renewing expiry, at most 2,048 entries, and at most 16 MiB total token-plus-handle bytes.
- Preserve current fail-closed completion and synthesis-lock behavior.
- Accept pre-deployment raw stateless tokens at the Action boundary.
- Update and deploy truthful public privacy text before claiming live acceptance.
- Do not log handles, tokens, inputs, outputs, or retained entries.

---

### Task 1: Add Action-handle regression tests in the red state

**Files:**
- Create: `tests/youtube-action-continuation-handle.test.ts`
- Modify: `tests/research-action-route.test.ts`
- Modify: `tests/research-action-http.test.ts`

**Interfaces:**
- Consumes: `createResearchActionRoutes(options)` and `createAskRigorHttpServer(options)`.
- Produces: an independently derived contract for a short `arh1_` handle, exact token resolution, expiry, capacity eviction, stable invalid-handle output, and cross-request server lifetime.

- [ ] **Step 1: Write the store contract test**

Import the wished-for `createYoutubeActionContinuationHandleStore` and verify:

```ts
const store = createYoutubeActionContinuationHandleStore({ now: () => now });
const handle = store.issue(`payload.${"s".repeat(43)}`);
expect(handle).toMatch(/^arh1_[A-Za-z0-9_-]{32}$/u);
expect(handle.length).toBe(37);
expect(store.resolve(handle)).toBe(`payload.${"s".repeat(43)}`);
now += 3_600_000;
expect(() => store.resolve(handle)).toThrow("expired or unavailable");
```

Use small injected entry/byte limits with three literal tokens to prove the
oldest handle is evicted while the two newer handles still resolve.

- [ ] **Step 2: Write the route relay test**

Create a real `audit_youtube_video_community` Action route around a controlled
`ResearchOperation`. Return a literal long signed-token-shaped string on the
first call. Require the Action response to contain a 37-character handle, call
the route again with that handle, and require the operation to receive the
exact original long token. The production mutation this catches is returning
the underlying token or forwarding the handle directly to the shared handler.

- [ ] **Step 3: Write invalid-handle and HTTP-lifetime tests**

Require a malformed or missing `arh1_` handle to return:

```ts
{
  status: 422,
  body: {
    error: {
      code: "youtube_action_continuation_invalid_or_expired",
      retryable: false
    }
  }
}
```

Start one HTTP server with a controlled YouTube operation, perform two real
POST requests, and prove the handle issued by the first request resolves on the
second. This catches accidental creation of a new store per request.

- [ ] **Step 4: Run the focused red gate**

Run:

```bash
npm run test:run -- tests/youtube-action-continuation-handle.test.ts tests/research-action-route.test.ts tests/research-action-http.test.ts
```

Expected: FAIL because the store export, route option, short-handle response,
and invalid-handle contract do not exist.

### Task 2: Implement the minimal bounded Action adapter

**Files:**
- Create: `apps/research-mcp/src/actions/youtube-continuation-handle.ts`
- Modify: `apps/research-mcp/src/actions/research-routes.ts`
- Modify: `apps/research-mcp/src/server.ts`
- Modify: `apps/research-mcp/src/index.ts`

**Interfaces:**
- Produces: `YoutubeActionContinuationHandleStore`, `YoutubeActionContinuationHandleError`, `createYoutubeActionContinuationHandleStore(options)`, and `isYoutubeActionContinuationHandle(value)`.
- Consumes: the unchanged `ResearchOperation.execute` input/output and `youtubeVideoCommunityAuditOutputSchema`.

- [ ] **Step 1: Implement the bounded store**

Create a closure-backed store using `randomBytes(24).toString("base64url")`.
Validate nonempty token bytes, prune entries where `now() >= expiresAt`, and
evict from `Map.keys().next().value` until both entry and byte bounds permit the
new value. Do not expose enumeration, statistics, or token values.

- [ ] **Step 2: Resolve and replace only for the YouTube Action**

Extend `CreateResearchActionRoutesOptions` with an injectable handle store.
Instantiate one default store per factory call. For
`audit_youtube_video_community`, resolve only values matching/prefixed as
Action handles; pass other tokens through unchanged for backward compatibility.
Atomically claim a handle so concurrent reuse cannot execute the same segment
twice. After successful shared execution, issue a new short handle before
response bounding, commit the preceding handle only after a valid successor or
terminal response exists, and roll the claim back if execution throws or the
shared operation returns a tokenless incomplete/provider-error receipt.

- [ ] **Step 3: Declare the stable 422 Action error and truthful description**

Add the new 422 response alternative and return it for unavailable handles.
Use this Action-only description while leaving the MCP description unchanged:

```text
Retrieve one video's bounded API-visible YouTube discussion. Custom GPT continuation uses a short one-hour in-memory handle; continue while requested and require synthesis_lock pass. Retrieval only; no medical conclusions.
```

- [ ] **Step 4: Run the focused green gate**

Run the Task 1 command. Expected: PASS with the handle exactly 37 characters,
exact shared-token relay, expiry/eviction enforcement, and cross-request reuse.

### Task 3: Update privacy truth and deterministic release artifacts

**Files:**
- Modify: `tests/public-site.test.ts`
- Modify: `tests/release-packet.test.ts`
- Modify: `README.md`
- Modify: `docs/privacy-data-map.md`
- Modify: `docs/custom-gpt-actions-setup.md`
- Modify: `site/privacy/index.html`
- Modify: `docs/custom-gpt-action-openapi.json` through its generator
- Modify: `docs/custom-gpt-sync.json` through its generator
- Modify: `docs/public-review-checklist.md`
- Modify: `project/CODEX-CURRENT-STATE.md`

**Interfaces:**
- Consumes: the implemented Action-only processing boundary.
- Produces: machine-checked public and repository disclosures plus deterministic GPT handoff artifacts.

- [ ] **Step 1: Change privacy assertions first**

Require the privacy site and data map to state: direct MCP remains
client-carried/stateless; Custom GPT stores only the signed minimized token in
process memory; maximum one hour; hard entry/byte bounds; no comment text,
credentials, disk, or application logs; and restart/expiry/eviction invalidates
the handle. Require a single application replica and prohibit horizontal
scaling without sticky routing or shared state. Remove the obsolete universal assertion that no server-side
research-session record exists.

- [ ] **Step 2: Run the privacy tests red**

Run:

```bash
npm run test:run -- tests/public-site.test.ts tests/release-packet.test.ts
```

Expected: FAIL because current documents claim every continuation is
client-carried and no research-session state is retained server-side.

- [ ] **Step 3: Update the human-readable contract**

Update the named documents with the exact implemented boundary. Preserve the
separate lesson path, provider/client retention boundaries, active-request body
non-logging, and canonical protocol authority. Do not claim that a status file
or privacy notice proves runtime behavior.

- [ ] **Step 4: Regenerate the GPT packet**

Run `npm run generate:custom-gpt`. Confirm the operation count remains 18, the
MCP tool inventory file has no diff, the YouTube Action description is truthful
and at most 300 characters, and no instruction or protocol byte drifts.

- [ ] **Step 5: Run focused documentation gates green**

Run the Task 3 test command plus `npm run test:site`. Expected: PASS.

### Task 4: Verify, review, publish, merge, and deploy

**Files:**
- Modify after deployment: `docs/custom-gpt-action-live-acceptance.md`
- Modify after deployment: `docs/release-evidence-v0.1.0.md`
- Modify after deployment: `project/CODEX-CURRENT-STATE.md`

**Interfaces:**
- Consumes: the final candidate and established reversible deployment scripts.
- Produces: protected merge, exact immutable production image/site release, rollback points, and an actionable live retest.

- [ ] **Step 1: Run final candidate gates**

Run:

```bash
npm run generate:custom-gpt
git diff --exit-code -- docs/custom-gpt-instructions.md docs/tool-inventory-v0.1.0.json
npm run verify
npm run test:site
npm run test:site-deploy
python3 /home/joel/universal-dev-architecture-worktrees/codex-github-compliance-2026-08-14/scripts/audit_codex_github.py --root . --fail-on error
npm run lessons:status
git diff --check
```

Expected: every executable gate passes; the lesson queue is recorded as
available or with its exact unavailable reason, never inferred as zero.

- [ ] **Step 2: Review the final candidate**

Inspect every changed file, generated hash, operation ID/schema, privacy claim,
and `git diff --check`. Request an independent read-only code review against
this plan. Fix every Critical or Important issue with another red-green cycle.

- [ ] **Step 3: Publish and merge one focused PR**

Commit only the intended files, push the existing task branch, open one focused
PR against `main`, and include root cause, privacy effect, exact tests, and the
unchanged MCP inventory proof. Merge with the repository's documented strategy
only after the exact head's required checks are green, then verify post-merge
checks on the merge commit.

- [ ] **Step 4: Deploy privacy and code transactionally**

Create explicit rollback tags/copies for the current research image, Compose
file, and site release. Build the exact merge commit without credentials.
Activate the reviewed privacy site before or in the same bounded transaction as
the research image, recreate only required services, and roll back both layers
if acceptance fails.

- [ ] **Step 5: Run direct live acceptance**

Require health 200, 18 Action operations, the new short-handle description,
unchanged ordered MCP tool inventory/hash, unchanged protocol manifests,
unauthenticated lesson 401, startup-only application logging, no new mount or
secret exposure, and an authenticated synthetic two-call YouTube Action chain
whose first response returns a 37-character handle and whose second response
does not reject it.

- [ ] **Step 6: Record deployment evidence and reverify**

Record exact merge/image/container/site/rollback identifiers and sanitized
acceptance results in the three evidence files, open and merge an evidence-only
PR after repository gates pass, and verify its protected checks.

- [ ] **Step 7: Give the owner the irreducible GPT UI retest**

Have the owner re-import `https://mcp.askrigor.com/actions/openapi.json`, keep
the GPT private and Knowledge empty, start a new chat, and run one supplied
survey-first test. Acceptance requires at least one continuation chain ending
with `synthesis_lock: pass`, nonzero analyzed records, reconciled replies, and
no invalid-handle error.
