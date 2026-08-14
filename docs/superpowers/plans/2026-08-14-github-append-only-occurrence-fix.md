# GitHub Append-Only Lesson Occurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsupported conditional issue-body PATCH with append-only private occurrence comments while preserving one-issue idempotency, least privilege, owner text, and the existing public receipt.

**Architecture:** Keep issue creation and active/terminal fingerprint selection unchanged. Treat the canonical count in the issue body as the backward-compatible base, reconstruct later counts from fully paginated canonical occurrence comments, and append one timestamped/count-only comment for each active duplicate. Never PATCH an issue body.

**Tech Stack:** Node.js 24, TypeScript, Vitest, GitHub REST Issues API, Docker Compose.

## Global Constraints

- Keep the selected private repository and exact App permissions `issues:write` plus `metadata:read`.
- Keep the process-local single-writer mutex and prohibit multi-replica activation without distributed coordination.
- Do not put candidate text, model output, raw requests, identity, network data, health data, or credentials in occurrence comments.
- Preserve list-before-create, terminal-label replacement behavior, request deadlines, sanitized errors, and public response schemas.
- Never issue an unguarded issue-body PATCH.

### Task 1: Add failing append-only queue regressions

**Files:**
- Modify: `tests/lesson-github-queue.test.ts`

- [x] Extend the fake GitHub boundary with paginated issue-comment GET and comment POST behavior while retaining the old PATCH route so the current implementation fails visibly.
- [x] Require an active duplicate to preserve the issue body byte-for-byte, make zero PATCH requests, append one exact count/timestamp-only comment, and return the incremented count.
- [x] Add comment pagination, older-body-count reconstruction, ordinary/foreign comment, malformed owned-marker, serialized concurrency, lost comment response, and hung comment request cases.
- [x] Run `npm run test:run -- tests/lesson-github-queue.test.ts` and record the expected red failure against the current PATCH implementation.

### Task 2: Implement the minimal append-only queue

**Files:**
- Modify: `apps/research-mcp/src/lessons/github-lessons.ts`

- [x] Remove the active-update retry/ETag/PATCH path only.
- [x] Re-read and validate the active issue, fully paginate its comments, parse only canonical queue-owned markers, and calculate the next count from the highest body/comment count.
- [x] POST one exact anonymous occurrence comment and require a positive returned comment ID before reporting success.
- [x] Keep issue creation, terminal behavior, token handling, timeouts, privacy surfaces, and response types unchanged.
- [x] Run the focused queue test to green, then run `npm run test:run -- tests/lesson-github-app.test.ts tests/lesson-github-queue.test.ts tests/lesson-service.test.ts tests/lesson-action.test.ts`.

### Task 3: Reconcile durable documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-13-askrigor-anonymized-lesson-capture-design.md`
- Modify: `docs/custom-gpt-actions-setup.md`
- Modify: `docs/privacy-data-map.md`
- Modify: `docs/release-evidence-v0.1.0.md` after live acceptance

- [x] State that the issue body records the initial/backward-compatible count and later duplicate counts/last-seen times are append-only private generated comments.
- [x] Preserve the no-private-data and deliberate-retention boundaries.
- [x] Run documentation/release tests that cover these files.

### Task 4: Verify, commit, and build

- [x] Run `npm run verify`, `npm run test:site`, and `git diff --check` outside the local-bind sandbox where required.
- [x] Review the exact diff for scope, privacy, secret, generated-output, and unrelated churn.
- [x] Commit the focused behavioral/documentation change.
- [x] Build `askrigor-research:<exact commit SHA>`, inspect its image identity/user/workdir, and repeat the enabled/no-provider local security gate.
- [x] Package the exact image with a checksum, upload it, validate all protected runtime/state boundaries, and run a read-only GitHub App preflight against synthetic issue `#4`.

Execution note: after the local build's registry read timeout, the local Docker
permission broker timed out twice before starting a retry. The equivalent
documented release path was used: a secret-free exact-commit source archive was
checksummed, uploaded, built on the VPS, and the resulting immutable image was
inspected and passed the same isolated security gate before activation.

### Task 5: Transactional live acceptance

- [x] Save the exact pre-Action Compose/image and transactionally recreate only `research-mcp`; retain an automatic rollback trap.
- [x] Require health, OpenAPI checksum, unauthenticated 401, exact state mount, unchanged Caddy, MCP initialization, 17-tool inventory hash, and Universal manifest identity.
- [x] Submit the byte-identical synthetic candidate once and require `existing_candidate`, `ARL-0004`, occurrence count 2, and no new issue.
- [x] Verify privately that issue `#4`'s body is unchanged and one exact generated occurrence comment exists with no candidate/user/credential content.
- [x] Require unauthenticated 401 and a pre-screened secret-pattern 422 without OpenAI spend or GitHub mutation; recheck health and MCP.
- [x] Mark issue `#4` `rejected`, remove `needs-review`, add the comment `synthetic live acceptance`, and close it.
- [x] Run `npm run lessons:status` with maintainer authentication and record truthful redacted evidence.
- [x] On any failed gate, restore Actions-disabled prior production immediately.

### Task 6: Final verification and publication

- [ ] Commit redacted live evidence and run `npm run verify`, `npm run test:site`, `npm run lessons:status`, and `git diff --check` against the final commit.
- [ ] Push the durable feature branch, open one focused pull request with exact evidence, and follow repository merge policy only after required checks pass.
