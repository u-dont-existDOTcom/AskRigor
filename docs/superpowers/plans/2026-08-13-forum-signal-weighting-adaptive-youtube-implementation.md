# Forum-Signal Weighting and Adaptive YouTube Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve promising firsthand evidence without formal-evidence erasure and give ChatGPT a stateless, multi-call YouTube workflow that automatically spends additional minutes when doing so is likely to improve the answer.

**Architecture:** Keep ChatGPT as the only reasoning engine. Add a bounded YouTube candidate survey, a one-video segmented comment/reply retriever, and an HMAC-authenticated continuation chain that stores no comment text on the server. Put detailed evidence weighting and adaptive search rules in the Forum Signal module, with only a compact anti-erasure invariant in HRP.

**Tech Stack:** Node.js 24, TypeScript 7, Zod 4, MCP SDK 1.30, Vitest 4, YouTube Data API v3, static Markdown/XML/HTML release artifacts, Docker Compose production runtime.

## Global Constraints

- Keep every MCP tool read-only: `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- Do not add an OpenAI API call, local model, n8n workflow, background worker, comment database, transcript store, or persistent research session.
- Keep `audit_youtube_community` available for backward compatibility while the Project workflow moves to `survey_youtube_community` plus `audit_youtube_video_community`.
- Keep each adaptive video call at 15,000 ms maximum, but impose no arbitrary total one-minute research limit.
- Authenticate continuation state with `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET`; require at least 32 UTF-8 bytes and never return or log it.
- Expire continuation tokens one hour after the chain starts.
- Return at most 500 comments/replies for model analysis per completed video chain; return all records when the complete API-visible corpus contains 500 or fewer.
- Never use query-bounded comment search as a corpus.
- A final answer cannot report `further_expansion_likely_to_improve_answer: yes`; executable positive-information-gain work must run before synthesis.
- The public plugin and model-facing package must not integrate, promote, or recommend Sci-Bot or Sci-Hub.
- Preserve the unrelated untracked repository-root `FORUM_SIGNAL_MODULE.md`; edit only `project/FORUM_SIGNAL_MODULE.md`.
- Use test-first implementation and commit each completed task independently.

---

## File structure

New focused units:

- `packages/sources/src/youtube-comment-segment.ts`: one bounded resumable provider segment and comment-ID refetch.
- `apps/research-mcp/src/youtube-audit-continuation.ts`: authenticated stateless chain state, rolling digest, and deterministic bottom-k sample identifiers.
- `apps/research-mcp/src/youtube-community-survey.ts`: multi-query bounded candidate discovery and metadata receipts.
- `apps/research-mcp/src/youtube-video-community-audit.ts`: one-video chain orchestration and public per-video receipt.
- `tests/youtube-comment-segment.test.ts`: provider pagination/resume/reply tests.
- `tests/youtube-audit-continuation.test.ts`: token integrity, expiry, and data-minimization tests.
- `tests/youtube-community-survey.test.ts`: survey deduplication, metadata, URL, and failure tests.
- `tests/youtube-video-community-audit.test.ts`: 399/all, over-500/sample, partial/continue, and boundary tests.

Existing units retain their responsibilities:

- `apps/research-mcp/src/register-tools.ts`: MCP schemas, registration, and structured handler failures.
- `apps/research-mcp/src/config.ts`: public per-call ceilings and concise server instructions.
- `project/PROJECT_INSTRUCTIONS.md`: compact pre-HRP router and automatic controller.
- `project/FORUM_SIGNAL_MODULE.md`: acquisition, evidence weighting, adaptive expansion, report, and receipt.
- `skills/askrigor/SKILL.md`: public plugin workflow summary under the existing word cap.
- `protocols/HRP_Full.xml`: canonical synthesis invariant and regressions, versioned as 20.5.17 dated 2026-08-13.
- `docs/privacy-data-map.md`, `docs/tool-inventory-v0.1.0.json`, `docs/public-review-cases-v0.1.0.json`, `README.md`: release truth and public-review artifacts.

---

### Task 1: Resumable YouTube comment/reply provider segments

**Files:**
- Create: `packages/sources/src/youtube-comment-segment.ts`
- Modify: `packages/sources/src/index.ts`
- Create: `tests/youtube-comment-segment.test.ts`
- Reuse: `tests/fixtures/youtube/comment-threads-page-1.json`
- Reuse: `tests/fixtures/youtube/comment-threads-page-2.json`
- Reuse: `tests/fixtures/youtube/comments-top-1-page-1.json`
- Reuse: `tests/fixtures/youtube/comments-top-1-page-2.json`
- Reuse: `tests/fixtures/youtube/comments-top-2-page-1.json`

**Interfaces:**
- Consumes: `YoutubeConfig`, `YoutubeComment`, and `fetchJson` from `@askrigor/sources` internals.
- Produces:

```ts
export interface YoutubeCommentSegmentCursor {
  top_level_page_token?: string;
  page_fingerprint?: string;
  thread_offset: number;
  top_level_emitted: boolean;
  reply_page_token?: string;
  current_parent_id?: string;
  current_expected_replies?: number;
  current_replies_retrieved?: number;
}

export interface YoutubeCommentSegmentResult {
  video_id: string;
  comments: YoutubeComment[];
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  reply_count_mismatches: Array<{
    parent_comment_id: string;
    expected: number;
    retrieved: number;
  }>;
  exhausted: boolean;
  next_cursor?: YoutubeCommentSegmentCursor;
  access_status: "api_visible_complete" | "partial" | "comments_disabled" |
    "inaccessible" | "rate_limited" | "not_found" | "error";
  limitations: string[];
  error?: { code: string; message: string; http_status?: number; retryable?: boolean };
}

export interface YoutubeCommentSegmentRuntime {
  max_provider_requests?: number;
  max_elapsed_ms?: number;
  now?: () => number;
}

export function getYoutubeCommentSegment(
  input: {
    video: string;
    cursor?: YoutubeCommentSegmentCursor;
    page_size?: number;
  },
  config: YoutubeConfig,
  runtime?: YoutubeCommentSegmentRuntime
): Promise<YoutubeCommentSegmentResult>;

export function getYoutubeCommentsByIds(
  videoId: string,
  commentIds: readonly string[],
  config: YoutubeConfig
): Promise<{
  access_status: "api_visible_complete" | "partial" | "inaccessible" |
    "rate_limited" | "not_found" | "error";
  comments: YoutubeComment[];
  limitations: string[];
}>;
```

- [ ] **Step 1: Write failing segment tests**

Add tests that assert:

```ts
const YOUTUBE = { apiKey: "recorded-youtube-key" };

it("stops at a committed request boundary and returns a resumable cursor", async () => {
  const first = await getYoutubeCommentSegment(
    { video: "XpZHKGGCK-o", page_size: 20 },
    YOUTUBE,
    { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
  );
  expect(first.access_status).toBe("partial");
  expect(first.exhausted).toBe(false);
  expect(first.next_cursor).toMatchObject({
    thread_offset: 0,
    top_level_emitted: true,
    current_parent_id: "UgxTop00000000000000001"
  });
  expect(first.comments.map(({ comment_id }) => comment_id)).toEqual([
    "UgxTop00000000000000001"
  ]);
});

it("resumes a reply page and reaches top-level exhaustion without duplicates", async () => {
  const first = await getYoutubeCommentSegment(
    { video: "XpZHKGGCK-o", page_size: 20 },
    YOUTUBE,
    { max_provider_requests: 2, max_elapsed_ms: 15_000, now: () => 1 }
  );
  expect(first.next_cursor).toBeDefined();
  const second = await getYoutubeCommentSegment(
    { video: "XpZHKGGCK-o", cursor: first.next_cursor, page_size: 20 },
    YOUTUBE,
    { max_provider_requests: 20, max_elapsed_ms: 15_000, now: () => 1 }
  );
  expect(new Set([...first.comments, ...second.comments].map(({ comment_id }) => comment_id)).size)
    .toBe(first.comments.length + second.comments.length);
  expect(second.exhausted).toBe(true);
  expect(second.access_status).toBe("api_visible_complete");
  expect(second.reply_count_mismatches).toEqual([]);
});
```

Also assert that every `commentThreads.list` request omits `searchTerms`, the refetched page fingerprint must match, invalid video/cursor correlation fails closed, comments-disabled is terminal, and `getYoutubeCommentsByIds` returns comments in requested-video scope without exposing the API key.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run tests/youtube-comment-segment.test.ts
```

Expected: FAIL because `youtube-comment-segment.ts` and its exports do not exist.

- [ ] **Step 3: Implement one-page/thread resumable acquisition**

Implement a 20-thread default page. Request `commentThreads.list` with `part=snippet`, then retrieve every reply independently with `comments.list`. Commit normalized records after each successful provider response. When the request or elapsed ceiling is reached, return the cursor for the next uncommitted provider response.

Use a page fingerprint derived from ordered thread IDs:

```ts
const pageFingerprint = (ids: readonly string[]): string =>
  createHash("sha256").update(JSON.stringify(ids)).digest("hex");
```

When resuming within a refetched top-level page, verify the fingerprint, thread offset, parent ID, expected reply count, and reply-page cursor before returning new records. A changed page fails closed with `access_status: "partial"` and `youtube_comment_segment_changed`.

Chunk comment-ID refetch requests into groups of 100 and verify every returned `snippet.videoId`, parent relationship, and requested ID before normalization.

- [ ] **Step 4: Export the new source interfaces**

Add exact exports to `packages/sources/src/index.ts`:

```ts
export {
  getYoutubeCommentSegment,
  getYoutubeCommentsByIds,
  type YoutubeCommentSegmentCursor,
  type YoutubeCommentSegmentResult,
  type YoutubeCommentSegmentRuntime
} from "./youtube-comment-segment.js";
```

- [ ] **Step 5: Run focused and source regression tests**

Run:

```bash
npx vitest run tests/youtube-comment-segment.test.ts tests/youtube.test.ts
npm run typecheck
```

Expected: all selected tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/sources/src/youtube-comment-segment.ts packages/sources/src/index.ts tests/youtube-comment-segment.test.ts
git commit -m "feat: add resumable YouTube comment segments"
```

---

### Task 2: Authenticated stateless continuation state

**Files:**
- Create: `apps/research-mcp/src/youtube-audit-continuation.ts`
- Create: `tests/youtube-audit-continuation.test.ts`

**Interfaces:**
- Consumes: `YoutubeCommentSegmentCursor` and `YoutubeComment` from Task 1.
- Produces:

```ts
export interface YoutubeAuditSampleIdentifier {
  comment_id: string;
}

export interface YoutubeVideoAuditContinuationState {
  version: 1;
  video_id: string;
  analysis_limit: number;
  started_at_ms: number;
  expires_at_ms: number;
  segment_index: number;
  cursor: YoutubeCommentSegmentCursor;
  provider_reported_comments?: string;
  top_level_comments_retrieved: number;
  replies_retrieved: number;
  comment_thread_pages: number;
  reply_pages: number;
  records_retrieved_cumulative: number;
  rolling_sha256: string;
  sample_identifiers: YoutubeAuditSampleIdentifier[];
}

export function encodeYoutubeAuditContinuation(
  state: YoutubeVideoAuditContinuationState,
  secret: string
): string;

export function decodeYoutubeAuditContinuation(
  token: string,
  secret: string,
  nowMs: number
): YoutubeVideoAuditContinuationState;

export function advanceYoutubeAuditState(
  state: Omit<YoutubeVideoAuditContinuationState, "cursor">,
  comments: readonly YoutubeComment[],
  counters: {
    top_level_comments_retrieved: number;
    replies_retrieved: number;
    comment_thread_pages: number;
    reply_pages: number;
  },
  cursor: YoutubeCommentSegmentCursor
): YoutubeVideoAuditContinuationState;
```

- [ ] **Step 1: Write failing token tests**

Cover round-trip, changed signature, changed payload, wrong secret, expiry, invalid version, oversized token, invalid sample count, and comment-text absence:

```ts
const NOW = 1_786_579_200_000;
const SECRET = "s".repeat(32);
const STATE: YoutubeVideoAuditContinuationState = {
  version: 1,
  video_id: "XpZHKGGCK-o",
  analysis_limit: 500,
  started_at_ms: NOW,
  expires_at_ms: NOW + 3_600_000,
  segment_index: 1,
  cursor: { thread_offset: 1, top_level_emitted: false },
  provider_reported_comments: "399",
  top_level_comments_retrieved: 20,
  replies_retrieved: 4,
  comment_thread_pages: 1,
  reply_pages: 3,
  records_retrieved_cumulative: 24,
  rolling_sha256: "a".repeat(64),
  sample_identifiers: [{ comment_id: "UgxTop00000000000000001" }]
};

it("authenticates minimized continuation state without comment text", () => {
  const token = encodeYoutubeAuditContinuation(STATE, SECRET);
  expect(decodeYoutubeAuditContinuation(token, SECRET, STATE.started_at_ms + 1))
    .toEqual(STATE);
  const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
  expect(payload).not.toContain("my hip stopped hurting");
  expect(payload).not.toContain("author_display_name");
});

it("rejects a tampered or expired chain", () => {
  const token = encodeYoutubeAuditContinuation(STATE, SECRET);
  expect(() => decodeYoutubeAuditContinuation(`${token}x`, SECRET, NOW)).toThrow();
  expect(() => decodeYoutubeAuditContinuation(token, SECRET, STATE.expires_at_ms))
    .toThrow(/expired/i);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run tests/youtube-audit-continuation.test.ts
```

Expected: FAIL because the continuation module does not exist.

- [ ] **Step 3: Implement HMAC token encoding and validation**

Use canonical JSON, base64url, and HMAC-SHA-256:

```ts
const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
const token = `${encodedPayload}.${signature}`;
```

Compare signatures with `timingSafeEqual`. Reject secrets shorter than 32 UTF-8 bytes. Parse the decoded payload with a strict Zod schema, cap the token at 65,536 characters, cap `sample_identifiers` at 500, and reject `nowMs >= expires_at_ms`.

Use `sha256(comment_id)` as the deterministic bottom-k rank. Recompute ranks from the retained IDs on every advance and keep the lowest `analysis_limit` unique IDs, so the token does not carry redundant rank strings. Advance the rolling digest as:

```ts
sha256(previousDigest + "\n" + comments.map(canonicalCommentJson).join("\n"))
```

The deterministic sample is content-addressed by IDs but contains no comment text in the token.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
npx vitest run tests/youtube-audit-continuation.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/research-mcp/src/youtube-audit-continuation.ts tests/youtube-audit-continuation.test.ts
git commit -m "feat: authenticate YouTube audit continuations"
```

---

### Task 3: Bounded YouTube community survey

**Files:**
- Create: `apps/research-mcp/src/youtube-community-survey.ts`
- Create: `tests/youtube-community-survey.test.ts`

**Interfaces:**
- Consumes: `searchYoutube`, `getYoutubeVideo`, `youtubeVideoDataSchema`, and `YoutubeConfig`.
- Produces:

```ts
export const youtubeCommunitySurveyInputSchema = z.object({
  research_question: z.string().trim().min(1).max(5_000),
  searches: z.array(z.object({
    direction: youtubeCommunityDirectionSchema,
    query: z.string().trim().min(1).max(5_000),
    cursor: z.string().min(1).max(4_096).optional()
  }).strict()).min(1).max(6),
  results_per_search: z.number().int().min(1).max(10).default(10)
}).strict();

export function surveyYoutubeCommunity(
  input: YoutubeCommunitySurveyInput,
  config: YoutubeConfig
): Promise<YoutubeCommunitySurveyOutput>;
```

`YoutubeCommunitySurveyOutput` contains `provider: "youtube"`, `record_type: "youtube_community_survey"`, retrieval time, question, access status, limitations, search receipts with cursors, and deduplicated candidates. Each candidate contains video ID, canonical watch URL, every finding direction/query, metadata access status, title/channel ID/publication date/duration/statistics when available, and `provider_reported_comments` copied literally from `statistics.comment_count`.

- [ ] **Step 1: Write failing survey tests**

Test directional deduplication, query cursor forwarding, canonical links, exact provider comment-count preservation, metadata failure, zero candidates, and bounded results:

```ts
expect(result.candidates[0]).toMatchObject({
  video_id: "XpZHKGGCK-o",
  canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
  directions: ["general", "benefit"],
  provider_reported_comments: "7",
  metadata_access_status: "api_visible_complete"
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run tests/youtube-community-survey.test.ts
```

Expected: FAIL because the survey module does not exist.

- [ ] **Step 3: Implement survey aggregation**

Reuse the existing direction enum by exporting it from `youtube-community-audit.ts` or moving only that enum to the new survey module and importing it into the legacy compound audit. Combine identical query/cursor pairs, call every distinct search, deduplicate video IDs in round-robin query order, fetch metadata for deduplicated candidates, and preserve each provider receipt literally.

Use the limitation:

```text
YouTube discovery used one bounded provider-ranked page per requested search; it did not exhaust the platform or determine final materiality.
```

- [ ] **Step 4: Run focused and legacy audit tests**

```bash
npx vitest run tests/youtube-community-survey.test.ts tests/youtube-community-audit.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/research-mcp/src/youtube-community-survey.ts apps/research-mcp/src/youtube-community-audit.ts tests/youtube-community-survey.test.ts
git commit -m "feat: add YouTube community survey"
```

---

### Task 4: One-video adaptive community audit

**Files:**
- Create: `apps/research-mcp/src/youtube-video-community-audit.ts`
- Create: `tests/youtube-video-community-audit.test.ts`

**Interfaces:**
- Consumes: Task 1 segment/refetch functions and Task 2 token/state functions.
- Produces:

```ts
export const youtubeVideoCommunityAuditInputSchema = z.object({
  video_id_or_url: z.string().min(1).max(2_048).optional(),
  continuation_token: z.string().min(1).max(65_536).optional(),
  analysis_limit: z.number().int().min(1).max(500).default(500)
}).strict().superRefine((value, context) => {
  if ((value.video_id_or_url === undefined) === (value.continuation_token === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Provide exactly one of video_id_or_url or continuation_token"
    });
  }
});

export function auditYoutubeVideoCommunity(
  input: YoutubeVideoCommunityAuditInput,
  config: { youtube: YoutubeConfig; continuation_secret: string },
  runtime?: {
    now?: () => number;
    segment?: YoutubeCommentSegmentRuntime;
    dependencies?: YoutubeVideoCommunityAuditDependencies;
  }
): Promise<YoutubeVideoCommunityAuditOutput>;

export interface YoutubeVideoCommunityAuditDependencies {
  get_video: typeof getYoutubeVideo;
  get_segment: typeof getYoutubeCommentSegment;
  get_comments_by_ids: typeof getYoutubeCommentsByIds;
}
```

The strict output includes canonical URL and metadata, `provider_reported_comments`, all three count classes, per-call and cumulative page counts, reply mismatches, access/coverage state, `insufficient_depth`, optional sample, rolling digest, optional continuation token, `continuation_recommended`, and:

```ts
receipt: {
  completion_state: "api_visible_complete" | "completed_with_access_boundary" | "incomplete";
  synthesis_lock: "pass" | "block";
  chain_started_at_first_page: boolean;
  top_level_pagination_exhausted: boolean;
  replies_reconciled: boolean;
  query_bounded_comments_used_as_corpus: false;
  blockers: string[];
}
```

- [ ] **Step 1: Write failing orchestration tests**

Inject deterministic dependencies rather than creating hundreds of HTTP fixtures. Generate normalized comment objects in memory and assert:

```ts
const CONFIG = {
  youtube: { apiKey: "recorded-youtube-key" },
  continuation_secret: "s".repeat(32)
};

const makeComments = (count: number): YoutubeComment[] =>
  Array.from({ length: count }, (_, index) => ({
    video_id: "XpZHKGGCK-o",
    comment_id: `comment-${String(index).padStart(4, "0")}`,
    parent_id: null,
    top_level_comment_id: `comment-${String(index).padStart(4, "0")}`,
    is_reply: false,
    text: `Recorded comment ${index}`,
    like_count: index,
    published_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString()
  }));

const completeDependencies = (
  comments: YoutubeComment[]
): YoutubeVideoCommunityAuditDependencies => ({
  get_video: vi.fn(async () => ({
    provider: "youtube",
    record_type: "youtube_video",
    primary_identifier: "XpZHKGGCK-o",
    retrieved_at: "2026-08-13T00:00:00.000Z",
    source_identity: { canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o" },
    pagination: { returned: 1, exhausted: true },
    access_status: "api_visible_complete",
    limitations: [],
    data: {
      video_id: "XpZHKGGCK-o",
      title: "Recorded hip video",
      statistics: { comment_count: String(comments.length) }
    }
  })),
  get_segment: vi.fn(async () => ({
    video_id: "XpZHKGGCK-o",
    comments,
    top_level_comments_retrieved: comments.length,
    replies_retrieved: 0,
    comment_thread_pages: Math.ceil(comments.length / 20),
    reply_pages: 0,
    reply_count_mismatches: [],
    exhausted: true,
    access_status: "api_visible_complete",
    limitations: []
  })),
  get_comments_by_ids: vi.fn(async (_videoId, ids) => ({
    access_status: "api_visible_complete",
    comments: comments.filter(({ comment_id }) => ids.includes(comment_id)),
    limitations: []
  }))
});

it("returns all 399 records with explicit retrieved and analyzed counts", async () => {
  const result = await auditYoutubeVideoCommunity(
    { video_id_or_url: "XpZHKGGCK-o" },
    CONFIG,
    { dependencies: completeDependencies(makeComments(399)) }
  );
  expect(result).toMatchObject({
    canonical_url: "https://www.youtube.com/watch?v=XpZHKGGCK-o",
    records_retrieved_cumulative: 399,
    records_returned_for_analysis: 399,
    continuation_recommended: false,
    insufficient_depth: false,
    receipt: { completion_state: "api_visible_complete", synthesis_lock: "pass" }
  });
  expect(result.sample?.comments).toHaveLength(399);
});

it("returns a deterministic chronological 500-record sample from a complete larger corpus", async () => {
  const result = await auditYoutubeVideoCommunity(
    { video_id_or_url: "XpZHKGGCK-o", analysis_limit: 500 },
    CONFIG,
    { dependencies: completeDependencies(makeComments(800)) }
  );
  expect(result.records_retrieved_cumulative).toBe(800);
  expect(result.records_returned_for_analysis).toBe(500);
  expect(result.sample?.mode).toBe("deterministic_hash_chronological");
});
```

Also test a partial first call and valid continuation, wrong-video/tampered/expired tokens, missing secret, comments disabled, quota boundary, metadata `comment_count` mismatch, fewer than 300 of at least 300 available producing `insufficient_depth: true`, no secret/comment text in tokens, and terminal reply mismatches blocking completion.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
npx vitest run tests/youtube-video-community-audit.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement chain orchestration**

For a start call, parse the video ID, fetch metadata, initialize a one-hour state with the first-page cursor, call one segment, and update cumulative counters/digest/sample IDs. For a continuation call, authenticate and decode the token, reject input `analysis_limit` changes, refetch metadata, and call the exact resume cursor.

If a cursor remains, emit no comment text, set `records_returned_for_analysis: 0`, return the authenticated next token, set `continuation_recommended: true`, and block synthesis. If complete, refetch the bottom-k IDs, verify each video and ID, order returned comments by `published_at` then `comment_id`, and emit all records when cumulative count is at most the analysis limit.

Calculate insufficient depth only when all are true:

```ts
const insufficientDepth = !exhausted &&
  providerReportedCount !== undefined &&
  BigInt(providerReportedCount) >= 300n &&
  cumulativeCount < 300;
```

Provider counts remain strings in structured output so no large integer is rounded.

- [ ] **Step 4: Run focused tests, legacy audit tests, and typecheck**

```bash
npx vitest run tests/youtube-video-community-audit.test.ts tests/youtube-community-audit.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/research-mcp/src/youtube-video-community-audit.ts tests/youtube-video-community-audit.test.ts
git commit -m "feat: add adaptive per-video YouTube audit"
```

---

### Task 5: Register and publish the two new MCP tools

**Files:**
- Modify: `apps/research-mcp/src/config.ts`
- Modify: `apps/research-mcp/src/register-tools.ts`
- Modify: `.env.example`
- Modify: `tests/mcp-tools.test.ts`
- Modify: `tests/regression.test.ts`
- Modify: `tests/package-entrypoints.test.ts`

**Interfaces:**
- Consumes: `surveyYoutubeCommunity` and `auditYoutubeVideoCommunity` from Tasks 3 and 4.
- Produces MCP tools `survey_youtube_community` and `audit_youtube_video_community`; exact total tool count becomes 17.

- [ ] **Step 1: Write failing MCP schema and handler tests**

Update `TOOL_NAMES` to append the two tools after `audit_youtube_community`. Assert all 17 remain read-only. Assert survey input bounds and candidate output fields. Assert video-audit input fields and exact receipt/count fields. Exercise start, continuation, terminal complete, and missing-secret structured failure paths through the in-memory MCP client.

Add secret non-disclosure assertions:

```ts
expect(JSON.stringify(result)).not.toContain(process.env.ASKRIGOR_YOUTUBE_CONTINUATION_SECRET!);
expect(JSON.stringify(result)).not.toContain(process.env.YOUTUBE_API_KEY!);
```

- [ ] **Step 2: Run MCP tests and verify RED**

```bash
npx vitest run tests/mcp-tools.test.ts tests/regression.test.ts tests/package-entrypoints.test.ts
```

Expected: FAIL because only 15 tools are registered.

- [ ] **Step 3: Add public limits and secret configuration**

Add:

```ts
youtubeVideoAuditElapsedMs: 15_000,
youtubeVideoAuditProviderRequests: 50
```

to `PUBLIC_TOOL_LIMITS`. Add a private helper in `register-tools.ts` that reads `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET` without logging it. Add the variable to `.env.example` with a comment requiring 32 or more random bytes and never a tracked real value.

Replace `SERVER_INSTRUCTIONS` with a concise instruction that requires survey, material-video audits, automatic continuation while `continuation_recommended` is true, wider expansion while expected information gain is positive, and no query-bounded corpus substitution. Keep the critical behavior within the first 512 characters tested by `tests/mcp-tools.test.ts`.

- [ ] **Step 4: Register strict read-only tools**

Register:

```ts
server.registerTool(
  "survey_youtube_community",
  {
    description: "Survey bounded YouTube video candidates for a community-evidence question and return deduplicated metadata, canonical watch links, provider comment counts, pagination, and access receipts; no medical conclusions are generated.",
    inputSchema: youtubeCommunitySurveyInputSchema,
    outputSchema: youtubeCommunitySurveyOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS
  },
  async (input) => {
    const result = await surveyYoutubeCommunity(input, youtubeConfig());
    return youtubeToolResult(
      `YouTube community survey returned ${result.candidates.length} deduplicated candidate video(s).`,
      result
    );
  }
);

server.registerTool(
  "audit_youtube_video_community",
  {
    description: "Retrieve one material YouTube video's unfiltered API-visible top-level comments and independently paginated replies through authenticated stateless continuation, returning exact retrieved-versus-analyzed counts and a blocking completion receipt; no medical conclusions are generated.",
    inputSchema: youtubeVideoCommunityAuditInputSchema,
    outputSchema: youtubeVideoCommunityAuditOutputSchema,
    annotations: READ_ONLY_ANNOTATIONS
  },
  async (input) => {
    const result = await auditYoutubeVideoCommunity(input, {
      youtube: youtubeConfig(),
      continuation_secret: youtubeAuditContinuationSecret()
    }, {
      segment: {
        max_provider_requests: PUBLIC_TOOL_LIMITS.youtubeVideoAuditProviderRequests,
        max_elapsed_ms: PUBLIC_TOOL_LIMITS.youtubeVideoAuditElapsedMs
      }
    });
    return youtubeToolResult(
      `YouTube video audit retrieved ${result.records_retrieved_cumulative} record(s) cumulatively; synthesis lock ${result.receipt.synthesis_lock}.`,
      result
    );
  }
);
```

Structured failures preserve the requested record type, `access_status: "error"`, `synthesis_lock: "block"` where applicable, and no credentials.

- [ ] **Step 5: Run MCP and full focused source tests**

```bash
npx vitest run tests/youtube-comment-segment.test.ts tests/youtube-audit-continuation.test.ts tests/youtube-community-survey.test.ts tests/youtube-video-community-audit.test.ts tests/youtube-community-audit.test.ts tests/mcp-tools.test.ts tests/regression.test.ts tests/package-entrypoints.test.ts
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add apps/research-mcp/src/config.ts apps/research-mcp/src/register-tools.ts .env.example tests/mcp-tools.test.ts tests/regression.test.ts tests/package-entrypoints.test.ts
git commit -m "feat: expose adaptive YouTube research tools"
```

---

### Task 6: Evidence weighting, adaptive controller, and HRP 20.5.17

**Files:**
- Modify: `project/PROJECT_INSTRUCTIONS.md`
- Modify: `project/FORUM_SIGNAL_MODULE.md`
- Modify: `project/README.md`
- Modify: `skills/askrigor/SKILL.md`
- Modify: `protocols/HRP_Full.xml`
- Modify: `tests/project-router.test.ts`
- Modify: `tests/plugin-package.test.ts`
- Modify: `tests/protocol.test.ts`

**Interfaces:**
- Consumes: published tool names and fields from Task 5.
- Produces: `intervention_signal`, `youtube_expansion_report`, `deeper_literature_handoff`, `Videos worth watching`, and HRP anti-erasure/completion invariants.

- [ ] **Step 1: Write failing Project, skill, and protocol contract tests**

Add scoped assertions requiring:

```text
support_not_located
outcome_mismatch
community_signal: promising | mixed | weak | concerning | indeterminate
reasonable_time_bounded_trial
risk_cost_reversibility
opportunity_cost
survey_youtube_community
audit_youtube_video_community
provider_reported_comments
records_retrieved_cumulative
records_returned_for_analysis
Videos worth watching
further_expansion_likely_to_improve_answer
```

Assert that the Forum Signal module says a final answer may contain only `no` or `blocked` for further expansion, that a `yes` state forces continuation, and that elapsed time is not saturation. Assert the exact hip regression forbids converting a missing matched study into negative evidence.

Also require two consecutive low-yield wider passes before saturation, independent-pool expansion for a one-pool material signal, decision-useful negative videos in the watch ranking, and the statement that normal Project chat—not Deep Research—is the primary YouTube pagination workflow.

Scope the HRP assertion to a new `<CommunityEvidenceIndependenceAndActionabilityGate>` node and require the exact four-value formal relationship. Require version `20.5.17` and revision date `2026-08-13`.

- [ ] **Step 2: Run the contract tests and verify RED**

```bash
npx vitest run tests/project-router.test.ts tests/plugin-package.test.ts tests/protocol.test.ts
```

Expected: FAIL on missing evidence fields, new tools, adaptive rules, and HRP version.

- [ ] **Step 3: Update the compact Project router**

Keep `PROJECT_INSTRUCTIONS.md` under 500 words. Route Forum Signal before HRP, require the survey, select up to three materially different videos, call the one-video audit repeatedly while continuation is recommended, and run wider searches while expected information gain is positive. State that safe read-only continuation does not require ceremonial user approval.

Keep the synthesis lock:

```text
If further_expansion_likely_to_improve_answer would be yes and the work is executable,
continue researching. A final answer may report only no or blocked with a reason.
```

- [ ] **Step 4: Implement the detailed Forum Signal contract**

Add the exact `intervention_signal` schema from the approved design. Define `support_not_located`, `contradicted`, and `outcome_mismatch`. Require risk/cost/reversibility and opportunity-cost assessment before actionability. Require time-bounded measurement/stop rules for any suggested trial and forbid delaying urgent diagnosis or time-sensitive effective care.

Add adaptive deeper/wider triggers, two-expansion saturation, the clickable per-video table fields, the exact `youtube_expansion_report`, and the provider-neutral `deeper_literature_handoff`. State that `retrieved` is not a persisted download.

Rank videos by decision usefulness rather than positivity, and state that Deep Research may assist later broad literature synthesis only when the AskRigor connection is actually available there; it is not required and does not make YouTube pagination faster.

- [ ] **Step 5: Update the public AskRigor skill**

Keep `skills/askrigor/SKILL.md` under 500 words and preserve its frontmatter. Prefer the two-stage workflow, preserve exact count classes, and tell ChatGPT to continue automatically rather than finalize with positive expected information gain. Keep all medical judgments outside MCP tools.

- [ ] **Step 6: Add the HRP 20.5.17 gate and regressions**

Update root version/revision and add a revision entry. Insert near the existing community completion gate:

```xml
<CommunityEvidenceIndependenceAndActionabilityGate priority="Critical">
 <Rule name="FormalAbsenceCannotEraseCommunitySignal" priority="Critical">
  Community signal is an independent evidence layer. Failure to locate materially
  matched formal support must be recorded as support_not_located and must not, by
  itself, downgrade the observed community signal.
 </Rule>
 <Rule name="MatchedContradictionAndOutcomeAlignment" priority="Critical">
  Formal contradiction requires materially aligned population, intervention,
  comparator, outcome, and timeframe. Otherwise record outcome_mismatch.
 </Rule>
 <Rule name="ActionabilityIntegration" priority="Critical">
  Final actionability integrates community-signal credibility, matched formal
  evidence, risk, cost, reversibility, and the opportunity cost of delay.
 </Rule>
</CommunityEvidenceIndependenceAndActionabilityGate>
```

Add regression cases for the hip/gelatin/diet/swimming scenario and for a final answer stopping while expansion remains likely to improve it.

- [ ] **Step 7: Derive and propagate the canonical protocol digest in tests**

Run:

```bash
sha256sum protocols/HRP_Full.xml
```

Copy the resulting 64-character digest into the published-digest constant and expected manifest assertions in `tests/protocol.test.ts`. Do not compute the expected value from the file inside the test.

- [ ] **Step 8: Run focused contract tests and XML parse gate**

```bash
npx vitest run tests/project-router.test.ts tests/plugin-package.test.ts tests/protocol.test.ts tests/mcp-tools.test.ts
npm run typecheck
```

Expected: PASS, including malformed-XML rejection and the scoped gate/regression assertions.

- [ ] **Step 9: Commit Task 6**

```bash
git add project/PROJECT_INSTRUCTIONS.md project/FORUM_SIGNAL_MODULE.md project/README.md skills/askrigor/SKILL.md protocols/HRP_Full.xml tests/project-router.test.ts tests/plugin-package.test.ts tests/protocol.test.ts
git commit -m "feat: preserve actionable forum evidence"
```

---

### Task 7: Release inventory, privacy review, and public-review cases

**Files:**
- Modify: `docs/tool-inventory-v0.1.0.json`
- Modify: `docs/privacy-data-map.md`
- Modify: `docs/public-review-cases-v0.1.0.json`
- Modify: `docs/public-review-checklist.md`
- Modify: `README.md`
- Modify: `tests/release-packet.test.ts`
- Modify: `tests/public-site.test.ts` only if the policy review finds missing disclosure
- Modify: `site/privacy/index.html` only if the policy review finds missing disclosure

**Interfaces:**
- Consumes: exact 17-tool schemas, HRP 20.5.17 digest, and continuation data boundary.
- Produces: byte-aligned public inventory and a truthful privacy/reviewer packet.

- [ ] **Step 1: Write failing release-packet assertions**

Update expected tool count and names to 17. Assert the inventory contains survey canonical URLs/provider counts and per-video retrieved/analyzed/continuation fields. Require privacy-map disclosure of opaque authenticated continuation state, comment identifiers/counters/digest, one-hour expiry, active-request-only processing, no token secret disclosure, and no server-side comment/session persistence.

Add a public positive review case whose expected workflow is:

```json
[
  {"tool":"survey_youtube_community"},
  {"tool":"audit_youtube_video_community"},
  {"tool":"audit_youtube_video_community"}
]
```

The second audit call uses the first call's returned continuation token. Keep all cases read-only and do not include a real continuation secret.

- [ ] **Step 2: Run release tests and verify RED**

```bash
npx vitest run tests/release-packet.test.ts tests/public-site.test.ts
```

Expected: FAIL on the stale 15-tool inventory, digest, documentation, and review cases.

- [ ] **Step 3: Update privacy and public documentation**

Update `docs/privacy-data-map.md` with the minimized token payload and explicit non-persistence. Review the public notice against the actual fields. Its existing disclosure of YouTube IDs, comments, pagination, active-request-only processing, and no database is sufficient only if implementation matches the approved minimized token design. If any additional personal-data category is returned, update `site/privacy/index.html`, its effective date, and `tests/public-site.test.ts` in this step before release.

Update `README.md` for the two-stage workflow, 15-second per-call/multi-call total behavior, `ASKRIGOR_YOUTUBE_CONTINUATION_SECRET`, HRP 20.5.17 identity, and the no-OpenAI-API/no-n8n boundary. Do not claim live deployment yet.

- [ ] **Step 4: Regenerate and checksum-lock the exact inventory**

Generate the inventory mechanically:

```bash
npx tsx scripts/generate-tool-inventory.mts > /tmp/askrigor-tool-inventory.json
```

Replace `docs/tool-inventory-v0.1.0.json` with that generated JSON as a bulk generated-artifact update. Compute:

```bash
node -e 'const fs=require("fs"),c=require("crypto");const x=JSON.parse(fs.readFileSync("docs/tool-inventory-v0.1.0.json","utf8"));process.stdout.write(c.createHash("sha256").update(JSON.stringify(x)).digest("hex")+"\n")'
```

Copy that derived digest into `tests/release-packet.test.ts`.

- [ ] **Step 5: Propagate HRP 20.5.17 identity**

Replace the previous HRP version/revision/digest in `README.md`, `docs/public-review-cases-v0.1.0.json`, and applicable release assertions with the exact Task 6 values. Historical rollout entries in `docs/release-evidence-v0.1.0.md` remain historical and are not rewritten.

- [ ] **Step 6: Run release, site, and packaging gates**

```bash
npx vitest run tests/release-packet.test.ts tests/public-site.test.ts tests/plugin-package.test.ts tests/project-router.test.ts tests/protocol.test.ts
npm run test:site
git diff --check
```

Expected: PASS; site validator reports exactly four pages if the site is unchanged or correctly updated.

- [ ] **Step 7: Commit Task 7**

```bash
git add docs/tool-inventory-v0.1.0.json docs/privacy-data-map.md docs/public-review-cases-v0.1.0.json docs/public-review-checklist.md README.md tests/release-packet.test.ts tests/public-site.test.ts site/privacy/index.html
git commit -m "docs: publish adaptive YouTube audit contract"
```

Before committing, omit `tests/public-site.test.ts` and `site/privacy/index.html` from `git add` when the reviewed implementation creates no disclosure change and those files remain unmodified.

---

### Task 8: Full verification, GitHub publication, and production rollout

**Files:**
- Modify after successful live rollout: `docs/release-evidence-v0.1.0.md`
- Modify after successful live rollout: `README.md`
- Test: complete repository suite and live MCP acceptance

**Interfaces:**
- Consumes: release candidate commits from Tasks 1–7.
- Produces: pushed GitHub main branch, immutable VPS release directory/image, deployed 17-tool MCP endpoint, live HRP 20.5.17 identity, and recorded rollback/evidence.

- [ ] **Step 1: Run the complete local release matrix**

```bash
npm run typecheck
npm run test:run
npm run build
npm run test:site
npm run test:site-deploy
git diff --check
git status --short
```

Expected: every command passes. `git status --short` shows only the pre-existing unrelated `?? FORUM_SIGNAL_MODULE.md`.

- [ ] **Step 2: Review the complete implementation against the approved spec**

Check every requirement in `docs/superpowers/specs/2026-08-13-forum-signal-weighting-adaptive-youtube-design.md` against code and tests. Specifically inspect token payload minimization, no raw text in intermediate responses, 399/all and over-500/sample tests, provider/retrieved/analyzed fields, adaptive final-state rule, Sci-Bot absence in model-facing files, and legacy tool compatibility.

- [ ] **Step 3: Push the verified commits to GitHub**

```bash
git push origin main
```

Expected: the remote `main` advances to the verified local commit without a force push.

- [ ] **Step 4: Inspect the production topology without mutation**

Run read-only SSH checks against the installed root key:

```bash
ssh root@srv1894948 'hostname; docker ps --format "{{.Names}} {{.Image}} {{.Status}}"; docker compose -f /opt/askrigor/compose.yaml config --images; test -f /opt/askrigor/runtime.env; stat -c "%U %G %a %n" /opt/askrigor/runtime.env'
```

Expected: hostname `srv1894948`, one healthy AskRigor research container, effective image `askrigor-research:0.1.0`, and root-owned mode-600 runtime environment file. Stop before mutation if topology differs.

- [ ] **Step 5: Create an immutable release archive and upload it**

Use the verified commit hash:

```bash
release_commit=$(git rev-parse HEAD)
git archive --format=tar.gz --output="/tmp/askrigor-${release_commit}.tar.gz" HEAD
ssh root@srv1894948 "install -d -m 0755 /opt/askrigor/releases/${release_commit}"
scp "/tmp/askrigor-${release_commit}.tar.gz" "root@srv1894948:/opt/askrigor/releases/${release_commit}/source.tar.gz"
ssh root@srv1894948 "tar -xzf /opt/askrigor/releases/${release_commit}/source.tar.gz -C /opt/askrigor/releases/${release_commit}"
```

Expected: the VPS release directory is named by the exact Git commit and contains the archive plus extracted source.

- [ ] **Step 6: Install the continuation secret without printing it**

On the VPS, append a generated secret only when absent, preserve mode 600, and never print the value:

```bash
ssh root@srv1894948 'set -eu; umask 077; file=/opt/askrigor/runtime.env; if ! grep -q "^ASKRIGOR_YOUTUBE_CONTINUATION_SECRET=" "$file"; then secret=$(openssl rand -hex 32); printf "ASKRIGOR_YOUTUBE_CONTINUATION_SECRET=%s\n" "$secret" >> "$file"; fi; chmod 600 "$file"; grep -q "^ASKRIGOR_YOUTUBE_CONTINUATION_SECRET=" "$file"'
```

Expected: exit 0 with no secret in output.

- [ ] **Step 7: Build, preserve rollback, and recreate only research-mcp**

Tag the currently deployed image before replacement, build from the immutable release, then recreate only the MCP service:

```bash
release_commit=$(git rev-parse HEAD)
ssh root@srv1894948 "set -eu; old_id=\$(docker image inspect askrigor-research:0.1.0 --format '{{.Id}}'); docker tag \"\$old_id\" askrigor-research:rollback-${release_commit}; docker build -t askrigor-research:0.1.0 /opt/askrigor/releases/${release_commit}; docker compose -f /opt/askrigor/compose.yaml up -d --no-deps --force-recreate research-mcp"
```

Expected: the Caddy/site container is untouched and `research-mcp` is recreated from the new image.

- [ ] **Step 8: Run live acceptance before declaring success**

Verify health, live tool inventory, protocol identity, and no credential leakage:

```bash
curl --fail --silent --show-error https://mcp.askrigor.com/healthz
npm run test:live
```

Use an MCP client call to `tools/list` and require 17 tools including `survey_youtube_community` and `audit_youtube_video_community`. Call `get_protocol_manifest` and require HRP 20.5.17, revision 2026-08-13, and the exact local SHA-256. Run a bounded survey and one deliberately small per-video audit. Do not print runtime secrets.

If any acceptance check fails, retag the recorded rollback image as `askrigor-research:0.1.0` and recreate only `research-mcp` with the same Compose command.

- [ ] **Step 9: Record live evidence and push the documentation-only commit**

Append to `docs/release-evidence-v0.1.0.md` the deployed commit, image ID/digest, 17-tool inventory result, HRP identity, live survey/audit completion states, test totals, rollback tag, and privacy-review result. Update `README.md` from release-candidate wording to the actual deployed identity.

```bash
git add docs/release-evidence-v0.1.0.md README.md
git commit -m "docs: record adaptive YouTube production rollout"
git push origin main
```

Expected: GitHub contains the implementation and live evidence; the docs-only commit does not require rebuilding the already verified runtime image.

- [ ] **Step 10: Give the user the Project update handoff**

Provide clickable local links to `project/PROJECT_INSTRUCTIONS.md` and `project/FORUM_SIGNAL_MODULE.md`. Explain that ChatGPT Projects do not automatically refresh repository files: replace the Project instructions, re-upload the module, refresh the AskRigor developer-mode connection, and start a new chat. Give the exact hip regression prompt and explain the three YouTube counts in plain language.
