# OpenAI Structured-Output Reasoning Budget Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pinned lesson privacy model reliably emit its strict structured result within the existing 1,200-token ceiling, then complete the live Action acceptance.

**Architecture:** Keep the current OpenAI anonymizer, schemas, budget, privacy screens, GitHub queue, and deployment topology unchanged. Add only `reasoning: { effort: "minimal" }` to the pinned Responses request, verify it through the injected-fetch contract test, build an immutable image from the verified commit, and deploy with the existing rollback boundary.

**Tech Stack:** Node.js 24, TypeScript, Vitest, OpenAI Responses API, Docker Compose, GitHub App installation tokens, GitHub Issues.

## Global Constraints

- Retain `gpt-5-nano-2025-08-07`, `store: false`, and `max_output_tokens: 1_200`.
- Retain strict structured output, both privacy screens, metadata preservation, the `$50.00` monthly ledger cap, and fail-closed public receipts.
- Never print or persist API keys, App private keys, Action Bearer keys, installation tokens, model output text, or private issue bodies in logs.
- Keep the GitHub App restricted to `u-dont-existDOTcom/AskRigor-lessons` with exactly `issues:write` and `metadata:read`.
- Recreate only the research service; preserve the public Caddy service, loopback research port, and immediate prior-image rollback.
- Use only synthetic, non-personal lesson text.

---

### Task 1: Regression test and minimal request fix

**Files:**
- Modify: `tests/lesson-openai-anonymizer.test.ts:119`
- Modify: `apps/research-mcp/src/lessons/openai-anonymizer.ts:201`

**Interfaces:**
- Consumes: `createOpenAiLessonAnonymizer(options: OpenAiLessonAnonymizerOptions): LessonAnonymizer` and its injected `fetch` boundary.
- Produces: the existing Responses request body with exact `reasoning: { effort: "minimal" }`; no exported interface changes.

- [ ] **Step 1: Add the failing request-contract assertion**

Add the following property between `max_output_tokens` and `input` in the exact request expectation:

```ts
reasoning: { effort: "minimal" },
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
npm run test:run -- tests/lesson-openai-anonymizer.test.ts
```

Expected: FAIL in `sends the exact fixed, non-stored structured-output request and returns screened output` because the received request body has no `reasoning` property.

- [ ] **Step 3: Add the minimal production request property**

Add the same exact property between `max_output_tokens` and `input` in the `JSON.stringify` request body:

```ts
reasoning: { effort: "minimal" },
```

- [ ] **Step 4: Run focused and complete deterministic verification**

Run:

```bash
npm run test:run -- tests/lesson-openai-anonymizer.test.ts
npm run verify
npm run test:site
git diff --check
```

Expected: the focused test, typecheck, complete Vitest suite, build, public-site validation, and whitespace check all pass.

- [ ] **Step 5: Review and commit the behavioral fix**

Run:

```bash
git diff -- tests/lesson-openai-anonymizer.test.ts apps/research-mcp/src/lessons/openai-anonymizer.ts
git add tests/lesson-openai-anonymizer.test.ts apps/research-mcp/src/lessons/openai-anonymizer.ts
git commit -m "fix: bound lesson anonymizer reasoning"
```

Expected: one focused commit containing only the regression assertion and one request property.

### Task 2: Build and transactionally deploy the immutable candidate

**Files:**
- Read: `Dockerfile`
- Read: `/opt/askrigor/compose.yaml` on the VPS
- Create: `/opt/askrigor/releases/$candidate_sha/` on the VPS, where
  `candidate_sha=$(git rev-parse HEAD)` is set and validated immediately before
  use.

**Interfaces:**
- Consumes: verified Git commit from Task 1 and the existing root-owned `/opt/askrigor/runtime.env` plus `/opt/askrigor/state/actions` boundary.
- Produces: one immutable `askrigor-research:$candidate_sha` image and a healthy Action-enabled research container with the exact state bind mount.

- [ ] **Step 1: Build from the exact verified commit**

Run from the clean feature worktree:

```bash
candidate_sha=$(git rev-parse HEAD)
test -n "$candidate_sha"
git diff --quiet
git diff --cached --quiet
docker build --pull=false --tag "askrigor-research:${candidate_sha}" .
docker image inspect "askrigor-research:${candidate_sha}" --format '{{.Id}}|user={{.Config.User}}|workdir={{.Config.WorkingDir}}'
```

Expected: the build succeeds; the image runs as `node` with `/app` as its working directory.

- [ ] **Step 2: Run the local no-secret container gate**

Start the image with Actions disabled and no provider credentials, then verify `/healthz`, `/actions/openapi.json`, the disabled `/actions/lessons` path, read-only root filesystem, dropped capabilities, and empty logs. Stop and remove only this named test container when the checks finish.

```bash
candidate_sha=$(git rev-parse HEAD)
container="askrigor-reasoning-fix-${candidate_sha:0:12}"
docker run --detach --name "$container" --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --publish 127.0.0.1::3000 \
  --env ASKRIGOR_PUBLIC_SERVER_ENABLED=true \
  --env ASKRIGOR_ACTIONS_ENABLED=false \
  "askrigor-research:${candidate_sha}"
```

Resolve the assigned loopback port with `docker port "$container" 3000/tcp`, run the three HTTP assertions, inspect security settings and logs, then run:

```bash
docker stop "$container"
docker rm "$container"
```

- [ ] **Step 3: Package and upload the exact image**

Run:

```bash
candidate_sha=$(git rev-parse HEAD)
archive="/tmp/askrigor-research-${candidate_sha}.tar.gz"
docker save "askrigor-research:${candidate_sha}" | gzip -n > "$archive"
sha256sum "$archive" > "${archive}.sha256"
scp "$archive" "${archive}.sha256" root@191.215.38.123:/root/
```

Expected: the VPS receives only the immutable image archive and checksum sidecar; neither contains runtime secrets.

- [ ] **Step 4: Validate protected runtime metadata and load the image**

On the VPS, verify without printing values that `runtime.env` is root-owned mode `0600`, all nine Action variables occur exactly once and are nonempty, the staged OpenAI key and App PEM match their runtime encodings, and the Action state directory/file are UID/GID `1000:1000` with modes `0700`/`0600`. Verify the uploaded SHA-256 sidecar, load the image, and require its ID to match the local candidate image ID.

- [ ] **Step 5: Deploy with an automatic rollback trap**

Create a candidate Compose file from the exact saved pre-Action Compose by changing only the image tag and adding:

```yaml
volumes:
  - /opt/askrigor/state/actions:/var/lib/askrigor-actions:rw
```

Set
`candidate_compose="/opt/askrigor/.compose.actions.${candidate_sha}.yaml"`
and validate it with
`docker compose -f "$candidate_compose" config -q`. Atomically install it,
change only `ASKRIGOR_ACTIONS_ENABLED=false` to `true`, and recreate only
`research-mcp`. The error trap must restore the saved pre-Action Compose,
reset the flag to `false`, recreate the prior `askrigor-research:0.1.0`
service, and verify health.

- [ ] **Step 6: Verify the deployed boundary**

Require all of the following before any authenticated mutation:

```text
container image = immutable Task 1 image ID
health = healthy
/opt/askrigor/state/actions -> /var/lib/askrigor-actions, rw=true
GET /healthz = 200
GET /actions/openapi.json = 200
unauthenticated POST /actions/lessons = 401
public MCP initialize and tools/list = success with the existing 17-tool inventory
Caddy container identity unchanged
```

### Task 3: Live synthetic submission, deduplication, and isolation

**Files:**
- Read: `docs/custom-gpt-actions-setup.md`
- Read: `tests/fixtures/lesson-capture/conversation-cases.json`
- Modify after acceptance: `docs/release-evidence-v0.1.0.md`

**Interfaces:**
- Consumes: the authenticated `POST https://mcp.askrigor.com/actions/lessons` operation and private `AskRigor-lessons` issue queue.
- Produces: one closed synthetic private issue, two public receipts proving idempotency, and durable release evidence without private body text or URLs.

- [ ] **Step 1: Submit the reviewed synthetic candidate once**

Send the existing test candidate from `tests/lesson-openai-anonymizer.test.ts` through live HTTPS using the protected runtime Action key in process memory. Print only HTTP status plus allowlisted public receipt fields.

Expected:

```json
{"status":"submitted","candidate_id":"ARL-####","occurrence_count":1,"retryable":false}
```

- [ ] **Step 2: Repeat the byte-identical candidate**

Send the same candidate again through the same authenticated live path.

Expected:

```json
{"status":"existing_candidate","candidate_id":"the same ARL-####","occurrence_count":2,"retryable":false}
```

Require that the private repository contains exactly one matching issue.

- [ ] **Step 3: Inspect and close the synthetic issue**

Using authenticated maintainer GitHub access, verify without copying its body into logs that the issue contains the expected generalized sections, generated occurrence markers, metadata marker, privacy statement, and exact expected labels; verify it contains none of the raw correction prompt, credentials, user identity, or personal health data. Add the `rejected` label, remove `needs-review`, add the note `synthetic live acceptance`, and close the issue.

- [ ] **Step 4: Exercise non-mutating failure isolation**

Require an unauthenticated synthetic submission to return 401 and a locally screened synthetic secret-pattern candidate to return 422 without creating another issue or making an OpenAI request. Recheck `/healthz`, public MCP initialize, and `tools/list` after both failures.

- [ ] **Step 5: Verify truthful queue status**

Run:

```bash
npm run lessons:status
```

Expected: `status:"available"`; its counts match current GitHub state. Unavailable must be reported as unavailable, never as zero.

### Task 4: Final evidence, verification, and publication

**Files:**
- Modify: `docs/release-evidence-v0.1.0.md`
- Modify only if its release status is stale: `README.md`

**Interfaces:**
- Consumes: final commit/image identity, live endpoint checks, public candidate receipt, queue status, and rollback identity.
- Produces: durable redacted acceptance evidence and a pushed feature branch ready for focused review.

- [ ] **Step 1: Record redacted release evidence**

Append the exact deployed commit, immutable image ID, prior rollback image ID, test totals, OpenAPI checksum, unchanged MCP tool count, OpenAI diagnostic outcome, GitHub App permission/repository audit, synthetic candidate ID/count progression, closed-test disposition, queue counts, and rollback procedure. Do not record secret values, private URLs, issue body text, tokens, or personal data.

- [ ] **Step 2: Run final verification against the evidence commit candidate**

Run:

```bash
npm run verify
npm run test:site
npm run lessons:status
git diff --check
git status --short --branch
```

Expected: all deterministic gates pass, status is available, and only intentional evidence changes remain.

- [ ] **Step 3: Commit and rerun final gates on the final commit**

Run:

```bash
git add docs/release-evidence-v0.1.0.md README.md
git commit -m "docs: record lesson Action live acceptance"
npm run verify
npm run test:site
npm run lessons:status
git diff --check
git status --short --branch
```

If `README.md` did not change, omit it from `git add`. Expected: the worktree is clean and every gate passes against the final commit.

- [ ] **Step 4: Push the durable feature branch**

Run:

```bash
git push -u origin feature/anonymized-lesson-capture
```

Expected: the exact verified final commit is reachable on GitHub. Opening or merging a pull request remains subject to the repository's current branch-governance and review state.
