# AskRigor Public Review Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run one bounded command that validates all nine AskRigor
public review cases through direct production MCP calls and raw OpenAI Responses
API MCP-call evidence, then emits a sanitized evidence bundle.

**Architecture:** A testable TypeScript library owns case validation, direct MCP
execution, Responses API normalization, safety projection, and atomic evidence
writing. A thin CLI supplies production adapters and explicit live-run gating.
Direct and model lanes remain separate in the report, and the ChatGPT interface
spot check remains a distinct manual status.

**Tech Stack:** Node.js 24.18.0, TypeScript 7.0.2, native `fetch`, native
`node:crypto`/`node:fs`, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, Vitest
4.1.10, OpenAI Responses API remote MCP tools.

## Global Constraints

- Use `docs/public-review-cases-v0.1.0.json` as the exact case source of truth.
- Use `https://mcp.askrigor.com/mcp` as the v1 production endpoint; do not add an
  endpoint override.
- Use `chat-latest` by default and record both requested and returned model
  identity; never claim that this is identical to the ChatGPT product interface.
- Send `store: false`, a bounded `max_output_tokens`, and one fresh Responses
  request per case.
- Accept the API key only as `OPENAI_API_KEY`; never accept it as a command-line
  argument or persist it.
- Run cases serially with per-request, per-case, and full-run deadlines.
- Never persist complete protocol text, YouTube comment text or identities, raw
  continuation tokens, authorization data, or unrestricted model/provider
  bodies.
- A live run is explicit and paid. It must never run in ordinary CI or
  `npm run verify`.
- No production MCP behavior, protocol bytes, provider semantics, lesson
  submission, GitHub integration, or deployment topology changes are in scope.
- All behavioral implementation follows red-green-refactor: a relevant test
  must fail for the expected missing behavior before production code is added.

---

## File map

- Create `scripts/public-review-eval-lib.mts`: types, validation, direct lane,
  model lane, projection, scanning, orchestration, and evidence writing.
- Create `scripts/run-public-review-eval.mts`: CLI parsing, production MCP and
  OpenAI adapters, live gate, exit status, and printed artifact paths.
- Create `tests/public-review-eval.test.ts`: hermetic behavior tests using exact
  fixtures and dependency injection at the network boundary.
- Modify `package.json`: add `review:public-live` only; keep `verify` unchanged.
- Modify `.gitignore`: ignore `.artifacts/`.
- Create `docs/public-review-automation.md`: operator command, evidence meaning,
  secret boundary, limits, and final manual interface check.
- Modify `docs/INDEX.md`, `docs/public-review-checklist.md`,
  `docs/release-evidence-v0.1.0.md`, and `project/CODEX-CURRENT-STATE.md` only
  after the runner and authorized live execution have real evidence.

---

### Task 1: Case contracts, selection, and field-path validation

**Files:**
- Create: `tests/public-review-eval.test.ts`
- Create: `scripts/public-review-eval-lib.mts`

**Interfaces:**
- Consumes: parsed JSON from `docs/public-review-cases-v0.1.0.json`.
- Produces:
  - `parseReviewCaseSet(value: unknown): ReviewCaseSet`
  - `flattenReviewCases(caseSet: ReviewCaseSet): ReviewCase[]`
  - `selectReviewCases(caseSet: ReviewCaseSet, ids: readonly string[]): ReviewCase[]`
  - `inspectStructuredField(value: unknown, path: string): FieldInspection`
  - `resolveStepArguments(step: WorkflowStep, results: readonly unknown[]): Record<string, unknown>`

- [ ] **Step 1: Write failing contract tests**

Add literal fixtures and tests that name the production breaks they catch:

```ts
import { describe, expect, it } from "vitest";

import {
  flattenReviewCases,
  inspectStructuredField,
  parseReviewCaseSet,
  resolveStepArguments,
  selectReviewCases,
} from "../scripts/public-review-eval-lib.mts";

const minimalCases = {
  positive: [{
    id: "positive-1",
    prompt: "Use AskRigor.",
    fixture: { mode: "production-public-input", inputs: { protocol: "hrp" } },
    expected_workflow: [{
      tool: "get_protocol_manifest",
      arguments: { protocol: "hrp" },
      expected_structured_fields: ["manifest.sha256"],
    }],
    expected_result_shape: { required_fields: ["verified"] },
    no_state_change: true,
  }],
  negative: [],
};

describe("public review case contracts", () => {
  it("rejects duplicate IDs across positive and negative groups", () => {
    expect(() => parseReviewCaseSet({
      positive: minimalCases.positive,
      negative: [{
        ...minimalCases.positive[0],
        why_plugin_must_not_complete: "The operation is unavailable.",
      }],
    })).toThrow("duplicate review case id: positive-1");
  });

  it("selects requested IDs in committed case order and rejects unknown IDs", () => {
    const parsed = parseReviewCaseSet(minimalCases);
    expect(selectReviewCases(parsed, ["positive-1"]).map(({ id }) => id))
      .toEqual(["positive-1"]);
    expect(() => selectReviewCases(parsed, ["missing-1"]))
      .toThrow("unknown review case id: missing-1");
  });

  it("finds dotted and array fields without storing their values", () => {
    expect(inspectStructuredField({
      data: { comments: [{ comment_id: "c1" }, { comment_id: "c2" }] },
    }, "data.comments[].comment_id")).toEqual({
      present: true,
      type: "string",
      count: 2,
    });
  });

  it("substitutes the exact prior continuation token", () => {
    expect(resolveStepArguments({
      tool: "audit_youtube_video_community",
      arguments: { continuation_token: "$step_2.continuation_token" },
      expected_structured_fields: [],
    }, [{}, { continuation_token: "opaque-token" }])).toEqual({
      continuation_token: "opaque-token",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```sh
npm run test:run -- tests/public-review-eval.test.ts
```

Expected: FAIL because `scripts/public-review-eval-lib.mts` and its exported
functions do not exist.

- [ ] **Step 3: Implement strict case types and helpers**

Create the library with strict Zod schemas and these stable public types:

```ts
export type ReviewGroup = "positive" | "negative";

export interface WorkflowStep {
  kind?: "schema_rejection_before_provider_call" | "explicit_not_found" |
    "no_tool_call_for_unsupported_write_or_medical_action";
  tool?: string;
  arguments?: Record<string, unknown>;
  expected_structured_fields?: string[];
  tools_expected_not_to_exist?: string[];
}

export interface ReviewCase {
  group: ReviewGroup;
  id: string;
  prompt: string;
  fixture: { mode: "production-public-input"; inputs: Record<string, unknown> };
  expected_workflow: WorkflowStep[];
  expected_result_shape: { required_fields: string[] };
  no_state_change: true;
  why_plugin_must_not_complete?: string;
}

export interface ReviewCaseSet {
  positive: ReviewCase[];
  negative: ReviewCase[];
}

export interface FieldInspection {
  present: boolean;
  type?: "array" | "boolean" | "null" | "number" | "object" | "string";
  count?: number;
}
```

`parseReviewCaseSet` must reject unknown properties, duplicate/invalid IDs,
empty prompts/workflows, unsupported fixture modes, missing negative rationale,
and any case without literal `no_state_change: true`. It adds the group to each
parsed case. `inspectStructuredField` traverses dotted components and maps an
array marker across every item; it reports presence/type/count without returning
the sensitive value. `resolveStepArguments` supports only the exact
`$step_<one-based-index>.<dotted-path>` syntax and rejects forward, missing, or
non-string continuation references.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the focused command again. Expected: all Task 1 tests PASS.

- [ ] **Step 5: Add the real committed-case characterization**

Add a test that reads the committed JSON through `parseReviewCaseSet` and uses
hand-derived literals:

```ts
it("loads the committed six positive and three negative review cases", async () => {
  const value = JSON.parse(await readFile(
    new URL("../docs/public-review-cases-v0.1.0.json", import.meta.url),
    "utf8",
  ));
  const parsed = parseReviewCaseSet(value);
  expect(flattenReviewCases(parsed).map(({ id }) => id)).toEqual([
    "positive-1", "positive-2", "positive-3", "positive-4", "positive-5",
    "positive-6", "negative-1", "negative-2", "negative-3",
  ]);
});
```

Run the focused suite. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```sh
git add scripts/public-review-eval-lib.mts tests/public-review-eval.test.ts
git commit -m "test: define public review evaluation contracts"
```

---

### Task 2: Sanitized report projection and atomic artifacts

**Files:**
- Modify: `tests/public-review-eval.test.ts`
- Modify: `scripts/public-review-eval-lib.mts`

**Interfaces:**
- Consumes: safe case checks and lane results.
- Produces:
  - `digestOmittedValue(value: unknown): OmittedValueEvidence`
  - `scanEvidenceSafety(report: PublicReviewReport, secret?: string): void`
  - `writeEvidenceBundle(options: EvidenceWriteOptions): Promise<EvidenceBundlePaths>`

- [ ] **Step 1: Write failing safety and artifact tests**

Use a real temporary directory and literal expected projections. The test must
prove the scanner catches actual disclosure, not merely that a regex exists:

```ts
it("stores only a digest and byte count for omitted protocol text", () => {
  expect(digestOmittedValue("<Protocol>private body</Protocol>")).toEqual({
    omitted: true,
    byte_length: 33,
    sha256: "dd0a31f35071f38fe811a83b89b97fedd56ce382201fdec84ec34551173c2b92",
  });
});

it("rejects a report containing the active API key", () => {
  expect(() => scanEvidenceSafety({ note: "key-live-secret-value" } as never,
    "key-live-secret-value"))
    .toThrow("evidence contains the active secret");
});

it("writes JSON, Markdown, and a verifiable SHA-256 manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "askrigor-review-"));
  const paths = await writeEvidenceBundle({
    outputRoot: root,
    report: completeSafeReportFixture,
    activeSecret: "not-present-secret",
  });
  expect(JSON.parse(await readFile(paths.reportJson, "utf8")))
    .toEqual(completeSafeReportFixture);
  expect(await readFile(paths.summaryMarkdown, "utf8"))
    .toContain("Automated result: PASS");
  expect((await readFile(paths.sha256Manifest, "utf8")).trim().split("\n"))
    .toHaveLength(2);
});
```

Derive and correct the literal SHA-256 once with `printf`/`sha256sum` before
committing the test; do not compute the expected digest with production code.

- [ ] **Step 2: Run the focused test and verify RED**

Run the focused suite. Expected: FAIL because the projection/scanner/writer
exports do not exist.

- [ ] **Step 3: Implement report types and safe projection**

Add these report boundaries:

```ts
export type AutomatedState = "pass" | "fail" | "blocked";
export type FailureClass = "case_contract" | "mcp_discovery" | "mcp_schema" |
  "provider_result" | "model_transport" | "model_tool_selection" |
  "model_output" | "quota_or_rate_limit" | "timeout" |
  "artifact_safety" | "unexpected_internal_error";

export interface OmittedValueEvidence {
  omitted: true;
  byte_length: number;
  sha256: string;
}

export interface CaseLaneResult {
  lane: "direct" | "model";
  state: AutomatedState;
  failure_class?: FailureClass;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
  calls: SafeCallEvidence[];
  duration_ms: number;
}

export interface PublicReviewReport {
  schema_version: "askrigor-public-review-eval/v1";
  run_id: string;
  repository: { commit: string; dirty: boolean };
  case_file: { path: string; sha256: string };
  endpoint_origin: "https://mcp.askrigor.com";
  model: { requested: string; returned: string[] };
  started_at: string;
  finished_at: string | null;
  inventory: SafeInventoryEvidence | null;
  cases: CaseReport[];
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  automated_result: "pass" | "fail" | "incomplete";
}
```

Canonical JSON uses two-space indentation, a trailing newline, stable property
insertion order, and UTF-8. The writer creates
`.artifacts/public-review-eval/<UTC-run-id>/` by default, writes temporary files
with mode `0600`, renames them atomically, scans the serialized report and
summary, then writes a `SHA256SUMS` covering only `report.json` and `SUMMARY.md`.

The report never accepts raw MCP/Responses objects. Safe-call projection keeps
exact public arguments except `continuation_token`, which becomes digest
evidence. Protocol `text`, comment `text`, display names, channel IDs, and
unrestricted model text use omitted-value evidence or field-presence checks.
Errors are reduced to class, HTTP status when public, retryable state, and at
most 500 sanitized characters.

- [ ] **Step 4: Implement the safety scan**

Walk every key and string. Reject:

- the active secret when it has at least eight characters;
- `authorization`, `api_key`, `apiKey`, and `OPENAI_API_KEY` keys;
- credential-like `sk-` values with at least 20 following token characters;
- `<?xml` and `<Protocol`;
- any string longer than 2,048 UTF-8 bytes except approved Markdown summary
  content generated from fixed templates; and
- any raw value paired with a `continuation_token` key.

The scanner reports only a fixed reason and JSON path; it never echoes the
unsafe value.

- [ ] **Step 5: Run Task 2 tests and verify GREEN**

Run the focused suite. Expected: all Task 1 and Task 2 tests PASS and temporary
artifacts contain no raw omitted values.

- [ ] **Step 6: Commit Task 2**

```sh
git add scripts/public-review-eval-lib.mts tests/public-review-eval.test.ts
git commit -m "feat: add sanitized public review evidence"
```

---

### Task 3: Direct production MCP lane

**Files:**
- Modify: `tests/public-review-eval.test.ts`
- Modify: `scripts/public-review-eval-lib.mts`

**Interfaces:**
- Consumes: `ReviewCase`, MCP tool inventory, injected MCP session.
- Produces:
  - `assertReadOnlyInventory(tools: readonly McpToolDescriptor[]): SafeInventoryEvidence`
  - `runDirectCase(reviewCase: ReviewCase, session: McpSession, inventory: SafeInventoryEvidence, now?: () => number): Promise<CaseLaneResult>`

- [ ] **Step 1: Write failing inventory and positive-path tests**

Define the network seam:

```ts
export interface McpToolDescriptor {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    openWorldHint?: boolean;
  };
}

export interface McpCallResult {
  isError?: boolean;
  structuredContent?: unknown;
  content?: unknown;
}

export interface McpSession {
  listTools(): Promise<{ tools: McpToolDescriptor[] }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }):
    Promise<McpCallResult>;
}
```

Add tests using a strict scripted session that rejects the wrong name,
arguments, or call order. Assert on `CaseLaneResult`, not on mock call counts:

```ts
it("passes the exact three-step protocol workflow", async () => {
  const result = await runDirectCase(protocolCase, scriptedMcpSession([
    { name: "get_protocol_manifest", arguments: { protocol: "hrp" },
      structuredContent: protocolManifestFixture },
    { name: "verify_protocol_integrity", arguments: {
      protocol: "hrp", expected_sha256: HRP_SHA,
    }, structuredContent: protocolVerificationFixture },
    { name: "load_protocol", arguments: { protocol: "hrp" },
      structuredContent: { ...protocolManifestFixture, text: "full protocol" } },
  ]), readOnlyInventory, deterministicClock());
  expect(result.state).toBe("pass");
  expect(result.calls.map(({ tool }) => tool)).toEqual([
    "get_protocol_manifest", "verify_protocol_integrity", "load_protocol",
  ]);
  expect(JSON.stringify(result)).not.toContain("full protocol");
});
```

Also test that one mutable/missing annotation causes `mcp_discovery` before any
case call.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because the direct-lane functions do not exist.

- [ ] **Step 3: Implement inventory enforcement and positive workflows**

`assertReadOnlyInventory` requires every discovered tool to have exactly
`readOnlyHint: true`, `destructiveHint: false`, and `openWorldHint: false`. It
returns names in server order and a SHA-256 of the ordered names. Reject
duplicates and an empty inventory.

`runDirectCase` receives the already enforced inventory, calls exact steps
serially, resolves only approved continuation references, checks `isError`,
checks every `expected_structured_fields` path, and emits only safe evidence.
For `positive-6`, reject a continuation call when
the first audit did not return `continuation_recommended: true`; otherwise use
the exact in-memory token and verify only its digest/equality in evidence.

- [ ] **Step 4: Write failing negative-case tests**

Add separate cases for:

- an `McpError`/validation error on PMID `0`, with no structured provider
  envelope, producing a passing `mcp_schema` check;
- a YouTube envelope containing `access_status: "not_found"` and `data: {}`,
  producing pass;
- a not-found envelope that contains fallback data, producing
  `provider_result` fail; and
- the unsupported operation names being absent from the full read-only
  inventory, producing pass without calling a tool.

Run the focused suite and verify these new tests fail for missing negative-case
handling.

- [ ] **Step 5: Implement negative-case behavior and verify GREEN**

Handle only the three committed `kind` values. Unknown negative kinds are
`case_contract` failures. For schema rejection, accept only an input-validation
failure with no provider-shaped structured content. For not-found, require
`provider: "youtube"`, `access_status: "not_found"`, and an empty object at
`data`. For unsupported actions, require every requested name to be absent and
make no tool call.

Run the focused suite. Expected: all direct-lane tests PASS.

- [ ] **Step 6: Commit Task 3**

```sh
git add scripts/public-review-eval-lib.mts tests/public-review-eval.test.ts
git commit -m "feat: validate direct public MCP review cases"
```

---

### Task 4: OpenAI Responses API model lane

**Files:**
- Modify: `tests/public-review-eval.test.ts`
- Modify: `scripts/public-review-eval-lib.mts`

**Interfaces:**
- Consumes: `ReviewCase`, verified inventory, injected Responses transport.
- Produces:
  - `buildResponsesRequest(reviewCase: ReviewCase, inventory: SafeInventoryEvidence, model: string): OpenAiResponsesRequest`
  - `normalizeMcpCalls(response: unknown, expectedServerLabel: string): NormalizedModelResponse`
  - `runModelCase(reviewCase: ReviewCase, options: ModelCaseOptions): Promise<CaseLaneResult>`

- [ ] **Step 1: Write the failing request-contract test**

Use a hand-authored request expectation:

```ts
it("builds a non-stored case-specific remote MCP request", () => {
  expect(buildResponsesRequest(pubmedCase, readOnlyInventory, "chat-latest"))
    .toEqual({
      model: "chat-latest",
      store: false,
      max_output_tokens: 4096,
      input: pubmedCase.prompt,
      tools: [{
        type: "mcp",
        server_label: "askrigor",
        server_url: "https://mcp.askrigor.com/mcp",
        require_approval: "never",
        allowed_tools: ["fetch_pubmed_record"],
      }],
    });
});
```

Add assertions that `negative-3` exposes the complete read-only inventory and
that duplicate workflow tools appear only once in `allowed_tools`.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because the model-lane functions do not exist.

- [ ] **Step 3: Implement request construction**

Use the exact endpoint and server label constants. Positive/negative cases with
declared tool steps allow the unique tools in workflow order. `negative-3`
allows every verified read-only inventory name so no-tool restraint is real.
Refuse to build any request before inventory enforcement passes.

- [ ] **Step 4: Write failing raw-response normalization tests**

Use complete documented response fixtures containing `id`, `object`,
`created_at`, `status`, `model`, `output`, and `usage`. Cover:

- JSON-string `arguments`;
- `mcp_call` order and exact server label;
- JSON-string tool output that contains structured content;
- a tool error;
- an unexpected server label;
- a completed response with no calls; and
- an incomplete or failed response.

Example observable assertion:

```ts
expect(normalizeMcpCalls(completedResponseFixture, "askrigor")).toMatchObject({
  status: "completed",
  model: "chat-latest-2026-08-01",
  calls: [{
    name: "fetch_pubmed_record",
    arguments: { pmid: "13054692" },
    error: null,
  }],
  usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
});
```

Run the focused suite and verify RED for missing normalization.

- [ ] **Step 5: Implement response normalization**

Accept only object responses with terminal `status: "completed"`. Decode MCP
arguments as strict JSON objects. Decode output only through these observed
bounded forms: direct JSON object, JSON string, or MCP content envelope whose
`structuredContent` is an object. Never retain message text or raw output.
Reject an unknown output form with `model_output`. Accumulate nonnegative
integer usage fields and returned model identity.

- [ ] **Step 6: Write failing model-case behavior tests**

Provide an injected transport:

```ts
export interface ResponsesTransport {
  create(request: OpenAiResponsesRequest, signal: AbortSignal): Promise<unknown>;
}
```

Test exact-call positive cases, the three-call protocol order, continuation
token equality without report disclosure, unexpected extra calls, quota error,
timeout, no-call `negative-1` after direct schema proof, explicit not-found, and
no-call `negative-3`. Assert failure classes and safe result content.

- [ ] **Step 7: Implement model-case evaluation and verify GREEN**

`runModelCase` creates one request, normalizes raw calls, and compares exact
names/arguments/order with the case. It may pass a no-call `negative-1` only
when `directSchemaRejectionPassed` is true. It requires no call for
`negative-3`, explicit not-found for `negative-2`, and exact dynamic token reuse
for `positive-6`. Map HTTP 429 or an OpenAI `insufficient_quota` code to
`quota_or_rate_limit`; map abort to `timeout`; preserve all other transport
failures as bounded `model_transport` evidence.

Run the focused suite. Expected: all model-lane tests PASS.

- [ ] **Step 8: Commit Task 4**

```sh
git add scripts/public-review-eval-lib.mts tests/public-review-eval.test.ts
git commit -m "feat: validate raw Responses MCP calls"
```

---

### Task 5: Orchestrator, CLI, opt-in gate, and interruption-safe output

**Files:**
- Modify: `tests/public-review-eval.test.ts`
- Modify: `scripts/public-review-eval-lib.mts`
- Create: `scripts/run-public-review-eval.mts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: case/direct/model/artifact functions.
- Produces:
  - `parsePublicReviewCliArgs(argv: readonly string[]): PublicReviewCliOptions`
  - `runPublicReviewEvaluation(options: RunEvaluationOptions): Promise<RunEvaluationResult>`
  - executable `main(argv, environment, dependencies): Promise<number>` in the CLI module.

- [ ] **Step 1: Write failing CLI parsing and live-gate tests**

Test these exact behaviors:

```ts
expect(parsePublicReviewCliArgs(["--live", "--mode", "model", "--case", "positive-2"]))
  .toMatchObject({ live: true, mode: "model", caseIds: ["positive-2"] });
expect(() => parsePublicReviewCliArgs(["--api-key", "secret"]))
  .toThrow("unknown option: --api-key");
expect(await main([], {}, fakeDependencies)).toBe(2);
expect(fakeDependencies.openMcpSessions).toBe(0);
```

Also cover repeated `--case`, `--model`, `--output-root`, `--help`, invalid mode,
missing option values, and missing `OPENAI_API_KEY` only for `model`/`all`.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: FAIL because CLI/orchestrator exports do not exist.

- [ ] **Step 3: Implement CLI parsing and production adapters**

Supported arguments are exactly:

```text
--live
--mode direct|model|all
--case <positive-N|negative-N>   (repeatable)
--model <nonempty-model-id>
--case-file <path>
--output-root <path>
--help
```

Defaults are `mode=all`, `model=chat-latest`, the committed case file, and
`.artifacts/public-review-eval`. `--live` is mandatory before any network call.
The CLI reads only the presence/value of `OPENAI_API_KEY` for model/all modes.

The MCP adapter uses `Client` plus `StreamableHTTPClientTransport`, closes in a
`finally`, and connects only to the exact constant endpoint. The OpenAI adapter
uses native `fetch("https://api.openai.com/v1/responses")`, an Authorization
header built in memory, JSON content type, and the caller's abort signal. It
throws a fixed typed error containing status/code but never response headers,
request headers, or unrestricted response bodies.

- [ ] **Step 4: Write failing orchestration tests**

Use fake direct/model executors and a real temporary output directory. Verify:

- direct completes before model begins;
- all cases run serially in committed order;
- the corresponding model case becomes blocked after a safety-critical direct
  failure;
- report JSON is valid after every completed case;
- a thrown transport failure still produces a partial report;
- aggregate token usage is exact;
- final exit is `0` only when every requested automated lane passes; and
- printed paths are returned as data rather than embedded console calls.

- [ ] **Step 5: Implement bounded orchestration**

Use constants:

```ts
export const REQUEST_TIMEOUT_MS = 45_000;
export const CASE_TIMEOUT_MS = 180_000;
export const FULL_RUN_TIMEOUT_MS = 1_800_000;
export const MAX_OUTPUT_TOKENS = 4_096;
```

Run selected cases serially. Establish one direct MCP session for the direct
lane and inventory discovery. Persist an atomic partial report after inventory,
after each lane, and on caught termination. Before model mode without a direct
run in the same invocation, discover and enforce the inventory but do not call
case tools. Always close the MCP client and clear timeout handles.

- [ ] **Step 6: Add package entry and ignore artifacts**

Modify `package.json`:

```json
"review:public-live": "tsx scripts/run-public-review-eval.mts"
```

Add this single root pattern to `.gitignore`:

```gitignore
.artifacts/
```

The CLI prints only aggregate status and:

```text
REPORT: <absolute-path>/report.json
SUMMARY: <absolute-path>/SUMMARY.md
MANIFEST: <absolute-path>/SHA256SUMS
```

- [ ] **Step 7: Run focused and CLI smoke tests**

Run:

```sh
npm run test:run -- tests/public-review-eval.test.ts
npm run review:public-live -- --help
npm run review:public-live -- --mode direct
```

Expected: focused suite PASS; help exits 0 without network; missing `--live`
exits 2 before network and prints no secret.

- [ ] **Step 8: Commit Task 5**

```sh
git add .gitignore package.json scripts/run-public-review-eval.mts scripts/public-review-eval-lib.mts tests/public-review-eval.test.ts
git commit -m "feat: add bounded public review runner"
```

---

### Task 6: Deterministic repository verification and operator documentation

**Files:**
- Create: `docs/public-review-automation.md`
- Modify: `docs/INDEX.md`
- Modify: `docs/public-review-checklist.md`
- Modify: `tests/public-review-eval.test.ts` only if verification exposes a
  behavioral defect; reproduce the defect first.
- Modify: implementation files only through a failing regression test.

**Interfaces:**
- Consumes: verified CLI behavior.
- Produces: human runbook and a deterministic final candidate.

- [ ] **Step 1: Run focused tests and inspect coverage by behavior**

Run the focused suite with verbose output. Perform the mutation check: wrong
tool name, wrong argument, missing array path, stored protocol text, raw token,
mutable annotation, extra model call, missing direct proof for negative-1, and
success exit after a failed case must each be caught by a named test. Add a
failing regression test before repairing any uncovered behavior.

- [ ] **Step 2: Run the canonical repository gate**

```sh
npm run verify
```

Expected: typecheck, full Vitest suite, and build PASS on the final code. If a
localhost sandbox restriction occurs, rerun the same canonical command with
the approved elevated execution boundary; do not change tests to accommodate
the sandbox.

- [ ] **Step 3: Write the operator runbook from verified behavior**

Document the normal command after the operator has loaded the environment
through the protected server mechanism:

```sh
npm run review:public-live -- --live
```

The prose must explicitly say not to paste a key into shell history and that the
VPS invocation loads the root-only key without printing it. Document direct-only
and exact-case reruns, all bounds, `.artifacts` paths, three evidence layers,
failure classes, no recurring schedule, and the single remaining ChatGPT
interface spot check. Link the design and case file.

- [ ] **Step 4: Update current review documentation without claiming a live pass**

Add the runbook to `docs/INDEX.md`. Update the checklist to say automation is
available but live acceptance remains pending until Task 7. Do not update
release evidence or current-state completion claims yet.

- [ ] **Step 5: Review the candidate diff and scan for unsafe material**

Run:

```sh
git diff --check
git status --short
git diff --stat
rg -n 'sk-[A-Za-z0-9_-]{20,}|Authorization: Bearer|OPENAI_API_KEY=' scripts tests docs package.json .gitignore
```

Expected: only intentional files; no credential value or unsafe example. The
literal environment variable name and fixed safety-test fake values are allowed
only when visibly synthetic.

- [ ] **Step 6: Commit Task 6**

```sh
git add docs/public-review-automation.md docs/INDEX.md docs/public-review-checklist.md
git commit -m "docs: document automated public review"
```

---

### Task 7: Protected live run, evidence closeout, and final verification

**Files:**
- Produce ignored local evidence under `.artifacts/public-review-eval/`.
- Modify: `docs/public-review-checklist.md`
- Modify: `docs/release-evidence-v0.1.0.md`
- Modify: `project/CODEX-CURRENT-STATE.md`
- Modify: `docs/lessons/...` or the universal repository only when the observed
  live result establishes a transferable lesson with exact provenance.

**Interfaces:**
- Consumes: committed candidate, server-held OpenAI key, production MCP.
- Produces: sanitized live report/summary/manifest and durable bounded evidence.

- [ ] **Step 1: Verify the live execution boundary without reading secrets**

Confirm the VPS key file is nonempty/root-readable by metadata only, Docker is
available, and the production health/MCP endpoint responds. Do not print file
contents, environment values, request headers, or raw protocol/provider output.

- [ ] **Step 2: Package the exact committed tree and run it ephemerally on the VPS**

Create a `git archive` of the exact candidate commit, transfer it to a
root-owned temporary directory, and run it in the pinned Node 24.18.0 container.
Mount `/root/askrigor-openai.key` read-only at `/run/secrets/openai`; inside the
container, export its contents to `OPENAI_API_KEY` and immediately execute:

```sh
npm ci --no-audit --no-fund
npm run review:public-live -- --live
```

The key must not be a Docker `-e` value, command argument, archive member, or
captured output. Preserve the container's exit status. Copy only the generated
sanitized report, summary, and manifest back to the local ignored artifact root,
verify the manifest locally, and remove the remote temporary archive/directory
after successful retrieval.

- [ ] **Step 3: Diagnose live failures without weakening contracts**

If a case fails, use its lane and fixed failure class. For a code defect, write
a failing hermetic regression test before the fix, rerun focused/full gates,
commit, and repeat only the affected live case first. For quota/rate/provider
blocks, preserve the partial report and exact bounded external error; do not
rewrite the expected case or mark it pass.

- [ ] **Step 4: Validate and review the returned evidence**

Verify `SHA256SUMS`, parse `report.json`, recompute totals, confirm all requested
automated lanes passed, and run the safety scan again with no secret value
required. Inspect `SUMMARY.md` for exact commit/model/endpoint/case hash and no
raw protocol/comment/token content.

- [ ] **Step 5: Record only bounded durable evidence**

Update the public-review checklist and release evidence with:

- exact commit;
- run timestamp;
- direct/model totals;
- requested and returned model IDs;
- report/summary SHA-256 values;
- any external provider limitations; and
- explicit `pending` status for the final ChatGPT interface spot check.

Update `project/CODEX-CURRENT-STATE.md` so a fresh worker can resume without the
chat. Do not commit raw local artifacts.

- [ ] **Step 6: Complete lesson disposition**

Classify the tool-card mismatch as project-specific unless the automated raw
evidence confirms the broader distinction between deterministic server,
model-selection, and product-interface layers. If promoted, record source
repository, exact commit/path/hash, rationale, test references, scope limits,
and supersession data in `universal-dev-architecture`; otherwise record
`no-new-lesson` or `provisional` in AskRigor's current-state evidence.

- [ ] **Step 7: Run final candidate verification**

```sh
npm run lessons:status
npm run verify
git diff --check
git status --short
```

Expected: lesson status is accurately reported; deterministic gate PASS; no
untracked evidence or accidental artifacts; only intended documentation changes
remain.

- [ ] **Step 8: Commit live evidence closeout**

```sh
git add docs/public-review-checklist.md docs/release-evidence-v0.1.0.md project/CODEX-CURRENT-STATE.md
git commit -m "docs: record automated public review evidence"
```

- [ ] **Step 9: Finish the development branch**

Use `superpowers:finishing-a-development-branch`. Review the complete commit
range from `9134e22784e4`, verify hosted branch/PR policy, push the task branch,
open one focused PR with exact deterministic/live evidence, wait for required
checks, and merge only if repository policy and green checks permit. Do not
merge while the final product-interface blocker would make a release claim
false; record it as a bounded acceptance status instead.
