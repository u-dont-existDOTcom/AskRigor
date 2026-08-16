# AskRigor Custom GPT Action Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bounded Custom GPT Action compatibility bridge for the exact 17 frozen AskRigor research operations, retain the isolated consequential lesson write, and produce one deterministic editor synchronization packet.

**Architecture:** An immutable research-operation registry becomes the single source consumed by the unchanged MCP adapter and a new REST Action adapter. Action-only transport adapters provide exact protocol chunking, bounded source results, shared public rate/concurrency limits, and fail-closed response ceilings; deterministic generators then produce the 18-operation OpenAPI document and compact GPT instructions without changing public MCP v0.1.

**Tech Stack:** Node.js 24.18.0, TypeScript, Zod 4.4.3, Model Context Protocol SDK 1.30.0, Vitest 4.1.10, Node HTTP, SHA-256/HMAC-SHA-256, static HTML, Docker.

## Global Constraints

- Preserve the exact 17-tool MCP v0.1 names, order, descriptions, schemas, annotations, behavior, and committed inventory hash `dbff1edc405982fb58eac6a5b28840ffcf07fd93cad0e55c349f65b2fffcf5e9`.
- Do not change `protocols/HRP_Full.xml` or `protocols/Universal_Instructions.xml`; the complete canonical bytes remain authoritative.
- All 17 research Actions are public, read-only, and `x-openai-isConsequential: false`; `submit_lesson_candidate` remains Bearer-protected, write-only-by-consent, and `x-openai-isConsequential: true`.
- Research Action paths are exactly `POST /actions/research/<operation_id>`; the lesson path remains `POST /actions/lessons`.
- Action request bodies remain at or below 8,192 bytes; serialized research responses remain at or below 60,000 UTF-8 bytes; protocol text remains at or below 48,000 UTF-8 bytes per response.
- Never silently truncate a protocol or source corpus. Preserve literal access states, pagination, limitations, continuation receipts, and synthesis locks.
- Use the existing server-only YouTube continuation secret with explicit HMAC domain separation for protocol cursors; never return or log the secret.
- Research Actions consume the same client-IP token bucket and public concurrency pool as `/mcp`; lesson attempts retain their independent limiter.
- Keep GPT Knowledge empty. Never commit or place credentials, private health data, raw chat, private lesson repository links, or provider secrets in generated artifacts.
- Keep the private calibrated-discovery v0.2 runner, Exa, Parallel Search, and new patient-experience providers outside this work.
- Use test-driven development for every behavior change and run `npm run verify`, `npm run test:site`, and `npm run test:site-deploy` on the final candidate.

---

## File map

**Create**

- `apps/research-mcp/src/research-operation.ts` — erased but validated shared operation interfaces and definition helper.
- `apps/research-mcp/src/research-operations.ts` — the 17 current schemas, handlers, failure envelopes, and immutable operation array.
- `apps/research-mcp/src/actions/research-routes.ts` — strict Action request/output adapter and route factory.
- `apps/research-mcp/src/actions/protocol-continuation.ts` — exact UTF-8 protocol chunking and authenticated cursor codec.
- `apps/research-mcp/src/actions/research-output.ts` — 60,000-byte response enforcement and bounded YouTube sample adapter.
- `apps/research-mcp/src/actions/runtime.ts` — composition of enabled research routes and the existing lesson route.
- `project/CUSTOM_GPT_ACTION_MODULE.md` — compact Action continuation and lesson-consent instructions.
- `scripts/generate-custom-gpt-packet.mts` — deterministic OpenAPI, instructions, and sync metadata generator.
- `docs/custom-gpt-instructions.md` — generated copy/paste artifact.
- `docs/custom-gpt-sync.json` — generated source/artifact hashes and editor checklist.
- `docs/custom-gpt-action-live-acceptance.md` — synthetic preview and post-deployment acceptance record template.
- `tests/research-operation-registry.test.ts` — frozen MCP and Action-name parity.
- `tests/research-action-route.test.ts` — strict requests, output validation, security, and isolation.
- `tests/protocol-action-continuation.test.ts` — exact bytes, chunk sequence, HMAC, expiry, and changed-file failure.
- `tests/research-action-http.test.ts` — flags, shared limits, response ceiling, and MCP isolation.
- `tests/custom-gpt-packet.test.ts` — deterministic generation, size, source hashes, clauses, and secret scans.

**Modify**

- `apps/research-mcp/src/register-tools.ts` — reduce to the MCP adapter over the shared registry.
- `apps/research-mcp/src/actions/types.ts` — mark public-research routes and maximum response bytes.
- `apps/research-mcp/src/actions/openapi.ts` — document router-owned research errors and Action-specific schemas.
- `apps/research-mcp/src/actions/router.ts` — apply shared public limiters and bounded serialization to research routes.
- `apps/research-mcp/src/config.ts` — parse the independent research-Action feature switch and expose exact byte constants.
- `apps/research-mcp/src/server.ts` — compose independently enabled Action sets and share the MCP limiters.
- `apps/research-mcp/src/index.ts` — export the route/registry factories required by generators and tests.
- `apps/research-mcp/src/youtube-video-community-audit.ts` — expose a deterministic bounded sample helper without changing default MCP output.
- `scripts/generate-action-openapi.mts` — delegate to the new packet generator while keeping the existing command valid.
- `package.json` — add the exact `generate:custom-gpt` command.
- `docs/custom-gpt-action-openapi.json` — regenerate to 18 operations.
- `docs/custom-gpt-actions-setup.md` — replace multi-file/manual instructions with the generated packet and research bridge workflow.
- `docs/privacy-data-map.md` — disclose the Action transport as the same transient research flow.
- `site/privacy/index.html` — mirror the public disclosure without implying persistence or a new provider.
- `README.md` — document the two interfaces, flags, generator, and editor handoff.
- `docs/INDEX.md` — index the new plan, artifacts, and acceptance evidence.
- `docs/release-evidence-v0.1.0.md` — add candidate evidence first and live evidence only after deployment.
- `project/CODEX-CURRENT-STATE.md` — maintain the durable recovery boundary.
- `tests/action-openapi.test.ts` — cover router-owned research responses.
- `tests/action-openapi-snapshot.test.ts` — expect 17 reads plus one write.
- `tests/action-http.test.ts` — preserve all existing lesson and generic route behavior.
- `tests/release-packet.test.ts` — validate setup/privacy/release truth.
- `tests/public-site.test.ts` — validate the public Action disclosure.

---

### Task 1: Extract the shared research-operation registry without changing MCP v0.1

**Files:**
- Create: `apps/research-mcp/src/research-operation.ts`
- Create: `apps/research-mcp/src/research-operations.ts`
- Create: `tests/research-operation-registry.test.ts`
- Modify: `apps/research-mcp/src/register-tools.ts`
- Modify: `apps/research-mcp/src/index.ts`

**Interfaces:**
- Consumes: the current 17 registrations and `CallToolResult` behavior in `register-tools.ts`.
- Produces: `RESEARCH_OPERATIONS: readonly ResearchOperation[]`, `RESEARCH_OPERATION_NAMES`, and `registerTools(server: McpServer): void` backed only by that registry.

- [ ] **Step 1: Write the failing frozen-registry test**

Create a test that imports `RESEARCH_OPERATIONS`, calls the existing
`createToolInventory()`, and requires the exact names, 17 count, unique Action
paths, read-only annotations, and unchanged committed inventory hash:

```ts
const EXPECTED = [
  "get_protocol_manifest", "load_protocol", "verify_protocol_integrity",
  "search_pubmed", "fetch_pubmed_record", "search_europe_pmc",
  "search_clinical_trials", "fetch_clinical_trial", "resolve_doi",
  "check_retraction_status", "search_youtube", "get_youtube_video",
  "get_youtube_comments", "search_youtube_comments", "audit_youtube_community",
  "survey_youtube_community", "audit_youtube_video_community"
] as const;

expect(RESEARCH_OPERATIONS.map(({ name }) => name)).toEqual(EXPECTED);
expect(new Set(RESEARCH_OPERATIONS.map(({ actionPath }) => actionPath)).size).toBe(17);
expect(RESEARCH_OPERATIONS.every(({ annotations }) =>
  annotations.readOnlyHint === true &&
  annotations.destructiveHint === false &&
  annotations.openWorldHint === false
)).toBe(true);
expect(createHash("sha256").update(JSON.stringify(await createToolInventory())).digest("hex"))
  .toBe("dbff1edc405982fb58eac6a5b28840ffcf07fd93cad0e55c349f65b2fffcf5e9");
```

- [ ] **Step 2: Run the test and verify the missing export failure**

Run: `npm run test:run -- tests/research-operation-registry.test.ts`

Expected: FAIL because `research-operations.ts` and its exports do not exist.

- [ ] **Step 3: Define the registry interface and helper**

Implement the focused interface in `research-operation.ts`:

```ts
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

export interface ResearchOperation {
  readonly name: string;
  readonly actionPath: `/actions/research/${string}`;
  readonly description: string;
  readonly inputSchema: z.ZodType;
  readonly outputSchema: z.ZodType;
  readonly annotations: ToolAnnotations;
  readonly execute: (input: unknown) => Promise<CallToolResult>;
}

export function defineResearchOperation<const T extends ResearchOperation>(value: T): T {
  if (value.actionPath !== `/actions/research/${value.name}`) {
    throw new Error(`Research Action path does not match operation ${value.name}`);
  }
  return Object.freeze(value);
}
```

Use the helper at construction time; input parsing remains inside the adapter
whose transport owns the input.

- [ ] **Step 4: Move the 17 definitions into the immutable registry**

Move the current Zod schemas, constants, environment readers, failure-envelope
builders, and handler bodies from `register-tools.ts` to
`research-operations.ts`. Convert the three raw protocol input/output shapes to
strict Zod objects while preserving the SDK-emitted schemas. Each entry has this
form, with its current description and handler body unchanged:

```ts
defineResearchOperation({
  name: "search_pubmed",
  actionPath: "/actions/research/search_pubmed",
  description: "Search PubMed citations and return stable PMIDs with explicit pagination and access state; no medical conclusions are generated.",
  inputSchema: searchPubmedInputSchema,
  outputSchema: pubmedSearchEnvelopeSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  async execute(input) {
    const { query, date_range, page_size, cursor } = searchPubmedInputSchema.parse(input);
    try {
      const result = await searchPubmed({
        query,
        ...(date_range === undefined ? {} : { dateRange: date_range }),
        ...(page_size === undefined ? {} : { pageSize: page_size }),
        ...(cursor === undefined ? {} : { cursor })
      }, ncbiConfig());
      return pubmedToolResult(
        `PubMed search returned ${result.pagination.returned} PMID record(s); access status ${result.access_status}.`,
        result
      );
    } catch (error) {
      return pubmedToolResult(
        "PubMed search retrieval failed; access status error.",
        pubmedSearchFailure(query, date_range, page_size, cursor, error)
      );
    }
  }
})
```

Export a frozen array and its names:

```ts
export const RESEARCH_OPERATIONS = Object.freeze([
  getProtocolManifestOperation,
  loadProtocolOperation,
  verifyProtocolIntegrityOperation,
  searchPubmedOperation,
  fetchPubmedRecordOperation,
  searchEuropePmcOperation,
  searchClinicalTrialsOperation,
  fetchClinicalTrialOperation,
  resolveDoiOperation,
  checkRetractionStatusOperation,
  searchYoutubeOperation,
  getYoutubeVideoOperation,
  getYoutubeCommentsOperation,
  searchYoutubeCommentsOperation,
  auditYoutubeCommunityOperation,
  surveyYoutubeCommunityOperation,
  auditYoutubeVideoCommunityOperation
] satisfies readonly ResearchOperation[]);

export const RESEARCH_OPERATION_NAMES = Object.freeze(
  RESEARCH_OPERATIONS.map(({ name }) => name)
);
```

- [ ] **Step 5: Make the MCP registrar a thin adapter**

Replace direct registration bodies in `register-tools.ts` with a loop that
passes the exact stored definition to the SDK. Keep the single unavoidable type
erasure at this adapter boundary and nowhere else:

```ts
export function registerTools(server: McpServer): void {
  for (const operation of RESEARCH_OPERATIONS) {
    server.registerTool(
      operation.name,
      {
        description: operation.description,
        inputSchema: operation.inputSchema as never,
        outputSchema: operation.outputSchema as never,
        annotations: operation.annotations
      },
      async (input) => operation.execute(input)
    );
  }
}
```

- [ ] **Step 6: Run frozen inventory, protocol, source, and type checks**

Run:

```bash
npm run test:run -- tests/research-operation-registry.test.ts tests/release-packet.test.ts tests/protocol.test.ts tests/pubmed.test.ts tests/europe-pmc.test.ts tests/clinical-trials.test.ts tests/crossref.test.ts tests/youtube.test.ts
npm run typecheck
```

Expected: PASS, including the exact historic inventory hash and 17-tool count.

- [ ] **Step 7: Commit the behavior-preserving registry**

```bash
git add apps/research-mcp/src/research-operation.ts apps/research-mcp/src/research-operations.ts apps/research-mcp/src/register-tools.ts apps/research-mcp/src/index.ts tests/research-operation-registry.test.ts
git commit -m "refactor: share frozen research operation registry"
```

---

### Task 2: Add strict read-only research Action routes and OpenAPI parity

**Files:**
- Create: `apps/research-mcp/src/actions/research-routes.ts`
- Create: `apps/research-mcp/src/actions/runtime.ts`
- Create: `tests/research-action-route.test.ts`
- Modify: `apps/research-mcp/src/actions/types.ts`
- Modify: `apps/research-mcp/src/actions/openapi.ts`
- Modify: `apps/research-mcp/src/lessons/runtime.ts`
- Modify: `apps/research-mcp/src/index.ts`
- Modify: `tests/action-openapi.test.ts`

**Interfaces:**
- Consumes: `RESEARCH_OPERATIONS` from Task 1 and the existing lesson route.
- Produces: `createResearchActionRoutes(options)`, `createEnabledActionRoutes(options)`, strict 422 validation, and OpenAPI-visible 17+1 parity.

- [ ] **Step 1: Write failing Action route parity and validation tests**

Require all research routes to be POST, public, non-consequential, marked as
public research, and to use the exact name/path relation. Exercise one valid
manifest call, one unknown-field input, and an operation whose handler returns a
schema-invalid body:

```ts
expect(routes.map(({ operationId }) => operationId)).toEqual(RESEARCH_OPERATION_NAMES);
expect(routes.every((route) =>
  route.method === "POST" && route.public && !route.consequential && route.publicResearch
)).toBe(true);

const invalid = await routes[0]!.handle({ request, clientIp: "127.0.0.1", body: {
  protocol: "hrp", extra: true
}});
expect(invalid).toEqual({
  status: 422,
  body: { error: { code: "action_input_invalid", retryable: false } }
});
```

Also assert that the composed enabled list is 17 research routes followed by
the one lesson route and that disabling either switch removes only its own set.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm run test:run -- tests/research-action-route.test.ts tests/action-openapi.test.ts`

Expected: FAIL because research route/runtime factories and the new route
metadata do not exist.

- [ ] **Step 3: Extend `ActionRoute` with explicit research transport metadata**

Add optional fields that default to current private/generic behavior:

```ts
export interface ActionRoute {
  // existing fields remain
  publicResearch?: true;
  maximumResponseBytes?: number;
}
```

Validation requires `publicResearch` only on a public,
non-consequential `/actions/research/` POST route and requires
`maximumResponseBytes` to be a positive safe integer.

- [ ] **Step 4: Implement strict schema conversion and route execution**

Use Zod 4's JSON Schema conversion, remove only the top-level `$schema` marker,
and preserve strict-object `additionalProperties: false`:

```ts
function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const converted = z.toJSONSchema(schema) as Record<string, unknown>;
  const { $schema: _dialect, ...openApiSchema } = converted;
  return openApiSchema;
}
```

For each operation, parse the body, call its shared handler, require
`structuredContent` to pass the shared output schema, and return only that
structured content:

```ts
const parsed = operation.inputSchema.safeParse(context.body);
if (!parsed.success) return actionInputInvalid();
const result = await operation.execute(parsed.data);
const output = operation.outputSchema.safeParse(result.structuredContent);
if (!output.success) throw new Error("Research operation returned invalid structured output");
return { status: 200, body: output.data };
```

Declare 200, 422, and the later router-owned research errors. Do not convert a
provider envelope carrying `access_status: "error"` into an HTTP success claim;
the HTTP transport succeeded while the literal provider envelope remains
unchanged.

- [ ] **Step 5: Compose enabled routes without making lesson runtime own research**

Keep `createDefaultActionRoutes()` as the backward-compatible lesson-only
export. In `actions/runtime.ts`, add:

```ts
export function createEnabledActionRoutes(options: {
  researchEnabled: boolean;
  lessonsEnabled: boolean;
  research: readonly ActionRoute[];
  lessons: readonly ActionRoute[];
}): readonly ActionRoute[] {
  return Object.freeze([
    ...(options.researchEnabled ? options.research : []),
    ...(options.lessonsEnabled ? options.lessons : [])
  ]);
}
```

- [ ] **Step 6: Update and run OpenAPI tests**

Require exactly 18 unique operation IDs, no security stanza on the 17 reads,
Bearer security on only the lesson write, and no examples, credentials, private
repository name, or GitHub URL.

Run:

```bash
npm run test:run -- tests/research-action-route.test.ts tests/action-openapi.test.ts tests/lesson-action.test.ts
npm run typecheck
```

Expected: PASS. The committed OpenAPI snapshot and its test remain unchanged
until Task 6 regenerates and commits them together.

- [ ] **Step 7: Commit the basic Action adapter**

```bash
git add apps/research-mcp/src/actions apps/research-mcp/src/lessons/runtime.ts apps/research-mcp/src/index.ts tests/research-action-route.test.ts tests/action-openapi.test.ts
git commit -m "feat: expose read-only research Action routes"
```

---

### Task 3: Implement exact protocol chunk continuation

**Files:**
- Create: `apps/research-mcp/src/actions/protocol-continuation.ts`
- Create: `tests/protocol-action-continuation.test.ts`
- Modify: `apps/research-mcp/src/actions/research-routes.ts`
- Modify: `apps/research-mcp/src/config.ts`

**Interfaces:**
- Consumes: canonical protocol text/manifest APIs and the server-only continuation secret.
- Produces: `createProtocolActionChunk(input, dependencies)`, 48,000-byte safe chunks, one-hour authenticated cursors, and Action-specific `load_protocol` schemas.

- [ ] **Step 1: Write failing exact-byte and adversarial cursor tests**

Use a fixture containing ASCII plus multi-byte UTF-8 characters. Repeatedly
call the function from the first chunk through `complete: true`, then require:

```ts
expect(Buffer.concat(chunks.map(({ text }) => Buffer.from(text, "utf8")))).toEqual(sourceBytes);
expect(chunks.every(({ text }) => Buffer.byteLength(text, "utf8") <= 48_000)).toBe(true);
expect(chunks.at(-1)).toMatchObject({
  complete: true,
  byte_end_exclusive: sourceBytes.length,
  total_bytes: sourceBytes.length
});
expect(chunks.map(({ chunk_index }) => chunk_index)).toEqual(
  Array.from({ length: chunks.length }, (_, index) => index)
);
```

Add failures for altered payload, altered signature, wrong secret, expiry at
exactly one hour, wrong protocol name, changed whole-file hash, noncanonical
base64url, short secret, and a chunk boundary adjacent to a four-byte code
point. Assert tokens contain no XML text or secret.

- [ ] **Step 2: Run the continuation test and verify failure**

Run: `npm run test:run -- tests/protocol-action-continuation.test.ts`

Expected: FAIL because the codec and chunker do not exist.

- [ ] **Step 3: Implement the versioned domain-separated cursor codec**

Use a strict state:

```ts
interface ProtocolCursorState {
  version: 1;
  kind: "askrigor_protocol_action";
  protocol: "hrp" | "universal";
  sha256: string;
  next_byte_offset: number;
  chunk_index: number;
  expires_at_ms: number;
}
```

Derive the signing key and sign canonical JSON:

```ts
const signingKey = createHmac("sha256", continuationSecret)
  .update("askrigor:protocol-action:v1")
  .digest();
const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
const signature = createHmac("sha256", signingKey).update(payload).digest("base64url");
return `${payload}.${signature}`;
```

Decode with canonical base64url round trips and `timingSafeEqual`, validate the
strict state, and reject `nowMs >= expires_at_ms`.

- [ ] **Step 4: Implement UTF-8-safe exact chunks**

Calculate the largest code-point boundary whose slice is at most 48,000 bytes.
Return whole-manifest identity, offsets, per-chunk SHA-256, count, next token,
and completion. The chunk count is computed from the same boundary algorithm,
not from `Math.ceil(totalBytes / 48_000)`.

The Action input extends only the Action form:

```ts
z.object({
  protocol: z.enum(["hrp", "universal"]),
  cursor: z.string().min(1).max(2_048).optional()
}).strict()
```

The MCP `load_protocol` schema and one-call output remain unchanged.

- [ ] **Step 5: Wire only the Action `load_protocol` route to the chunk adapter**

Inject `loadProtocol`, `getProtocolManifest`, `now`, and continuation secret so
tests never read production secrets. Reject missing/short secrets as startup
configuration errors only when research Actions are enabled.

- [ ] **Step 6: Run protocol, registry, and type gates**

```bash
npm run test:run -- tests/protocol-action-continuation.test.ts tests/protocol.test.ts tests/research-operation-registry.test.ts tests/research-action-route.test.ts
npm run typecheck
```

Expected: PASS and frozen MCP inventory unchanged.

- [ ] **Step 7: Commit protocol continuation**

```bash
git add apps/research-mcp/src/actions/protocol-continuation.ts apps/research-mcp/src/actions/research-routes.ts apps/research-mcp/src/config.ts tests/protocol-action-continuation.test.ts
git commit -m "feat: load canonical protocols through verified Action chunks"
```

---

### Task 4: Share public traffic limits and enforce the Action response ceiling

**Files:**
- Create: `apps/research-mcp/src/actions/research-output.ts`
- Create: `tests/research-action-http.test.ts`
- Modify: `apps/research-mcp/src/actions/router.ts`
- Modify: `apps/research-mcp/src/actions/openapi.ts`
- Modify: `apps/research-mcp/src/actions/types.ts`
- Modify: `apps/research-mcp/src/config.ts`
- Modify: `apps/research-mcp/src/server.ts`
- Modify: `tests/action-http.test.ts`

**Interfaces:**
- Consumes: the existing token bucket, concurrency limiter, client-IP resolver, and Action routes.
- Produces: independent research/lesson feature switches, shared MCP/research capacity, and fail-closed `action_response_too_large` behavior.

- [ ] **Step 1: Write failing cross-interface limiter tests**

Inject a token bucket with capacity one. Make one research Action request from a
client, then require the next `/mcp` request from the same client to receive the
existing MCP 429. Reverse the order and require the Action to return:

```json
{"error":{"code":"action_rate_limit_exceeded","retryable":true}}
```

Hold the single shared concurrency permit in a research handler and require a
simultaneous MCP request to fail with the existing concurrency error. Require a
lesson call not to consume the public research bucket.

- [ ] **Step 2: Write failing feature-switch and response-size tests**

Exercise all four combinations of `actionsEnabled` and
`researchActionsEnabled`. Require `/mcp` and `/healthz` in every combination,
lesson routes only under the lesson switch, research routes only under the
research switch, and OpenAPI to list only enabled routes.

Return a research body whose serialized size is 60,001 bytes and require:

```json
{"error":{"code":"action_response_too_large","retryable":false}}
```

Require exactly 60,000 bytes to pass. Verify generic/private lesson response
behavior remains unchanged.

- [ ] **Step 3: Run focused HTTP tests and verify failure**

Run: `npm run test:run -- tests/research-action-http.test.ts tests/action-http.test.ts`

Expected: FAIL because Actions currently bypass the MCP limiters, use one flag,
and do not bound serialized responses.

- [ ] **Step 4: Parse the independent research feature switch and constants**

Add exact literals:

```ts
export const ACTION_REQUEST_MAX_BYTES = 8_192;
export const RESEARCH_ACTION_RESPONSE_MAX_BYTES = 60_000;
export const PROTOCOL_ACTION_TEXT_MAX_BYTES = 48_000;

export function researchActionsAreEnabled(
  value = process.env.ASKRIGOR_RESEARCH_ACTIONS_ENABLED
): boolean {
  return value === "true";
}
```

- [ ] **Step 5: Apply limiters inside research route dispatch**

Pass the already-created server token bucket and concurrency limiter into
`dispatchActionRequest`. Only when `route.publicResearch === true`:

1. consume the resolved client-IP token;
2. return the declared research 429 if unavailable;
3. acquire the shared concurrency permit;
4. return the declared research 503 if unavailable; and
5. release the permit in `finally` after handler and response validation.

Do not consume a second token when the request later reaches `/mcp`; a handled
Action returns immediately.

- [ ] **Step 6: Serialize once and enforce the route response ceiling**

Replace double serialization with:

```ts
const serialized = JSON.stringify(result.body);
if (
  route.maximumResponseBytes !== undefined &&
  Buffer.byteLength(serialized, "utf8") > route.maximumResponseBytes
) {
  writeSerializedJson(response, 502,
    '{"error":{"code":"action_response_too_large","retryable":false}}');
  return true;
}
writeSerializedJson(response, result.status, serialized, result.headers);
```

The OpenAPI generator declares the router-owned 429, 502, and 503 schemas on
public-research operations and prevents route handlers from claiming those
statuses.

- [ ] **Step 7: Run HTTP, security, and type checks**

```bash
npm run test:run -- tests/research-action-http.test.ts tests/action-http.test.ts tests/action-openapi.test.ts tests/lesson-action.test.ts tests/rate-limit.test.ts
npm run typecheck
```

Expected: PASS with shared public capacity and lesson isolation.

- [ ] **Step 8: Commit bounded HTTP routing**

```bash
git add apps/research-mcp/src/actions apps/research-mcp/src/config.ts apps/research-mcp/src/server.ts tests/research-action-http.test.ts tests/action-http.test.ts tests/action-openapi.test.ts
git commit -m "feat: bound research Action traffic and responses"
```

---

### Task 5: Preserve YouTube completion truth under the Action transport

**Files:**
- Modify: `apps/research-mcp/src/actions/research-output.ts`
- Modify: `apps/research-mcp/src/actions/research-routes.ts`
- Modify: `apps/research-mcp/src/youtube-video-community-audit.ts`
- Modify: `tests/research-action-route.test.ts`
- Modify: `tests/youtube-video-community-audit.test.ts`

**Interfaces:**
- Consumes: complete `YoutubeVideoCommunityAuditOutput`, its authenticated continuation token, and 60,000-byte route ceiling.
- Produces: `boundYoutubeAuditForAction(output, maximumBytes)` and explicit diagnostic fallback for nonresumable legacy comment output.

- [ ] **Step 1: Write failing oversized-community fixture tests**

Create a terminal 500-record result with long synthetic comment text. Require
the bounded result to remain under 60,000 bytes, preserve all retrieval counts,
corpus digest, mismatches, completion state, synthesis lock, and canonical URL,
but return a smaller deterministic sample with reconciled counts:

```ts
expect(Buffer.byteLength(JSON.stringify(bounded), "utf8")).toBeLessThanOrEqual(60_000);
expect(bounded.records_retrieved_cumulative).toBe(original.records_retrieved_cumulative);
expect(bounded.receipt).toEqual(original.receipt);
expect(bounded.sample?.corpus_count).toBe(original.sample?.corpus_count);
expect(bounded.records_returned_for_analysis).toBe(bounded.sample?.comments.length);
expect(bounded.limitations).toContain(
  "The Custom GPT Action returned a deterministic transport-bounded analysis sample; retrieval coverage and corpus counts are reported separately."
);
```

Apply the function twice and require identical sample IDs and bytes. Require an
envelope whose fixed non-comment fields alone exceed the limit to throw and
reach `action_response_too_large`, not mutate the completion receipt.

- [ ] **Step 2: Run YouTube focused tests and verify failure**

Run: `npm run test:run -- tests/research-action-route.test.ts tests/youtube-video-community-audit.test.ts`

Expected: FAIL because transport-bounded sampling does not exist.

- [ ] **Step 3: Export deterministic sample ranking and implement bounded sampling**

Expose the current SHA-256 identifier rank used by continuation sampling as a
small pure function. In `research-output.ts`, rank comments by identifier hash,
add them one at a time, restore chronological order for display, and retain the
largest deterministic prefix whose fully reconciled envelope serializes under
the ceiling. Update only:

```text
analysis_limit
records_returned_for_analysis
top_level_records_returned_for_analysis
reply_records_returned_for_analysis
sample.mode
sample.sampled_count
sample.comments
limitations
```

Do not change retrieval counters, corpus count/digest, access status,
continuation state, reply mismatches, or receipt.

- [ ] **Step 4: Apply bounded sampling only to the Action adapter**

The MCP handler returns its original result. The Action route for
`audit_youtube_video_community` validates the shared output, applies the pure
bounder, validates the result again, then returns it.

For `audit_youtube_community` and `get_youtube_comments`, retain the shared
handler and schema unchanged. If either valid serialized result exceeds the
Action ceiling, return the declared `action_response_too_large` transport
boundary; the route descriptions and generated instructions direct the
workflow to `survey_youtube_community` plus
`audit_youtube_video_community`. Never trim either legacy envelope or
manufacture `api_visible_complete`.

- [ ] **Step 5: Run all YouTube and bridge tests**

```bash
npm run test:run -- tests/youtube-video-community-audit.test.ts tests/youtube-audit-continuation.test.ts tests/youtube-community-audit.test.ts tests/research-action-route.test.ts tests/research-action-http.test.ts
npm run typecheck
```

Expected: PASS; original MCP fixtures remain byte/field compatible.

- [ ] **Step 6: Commit Action-safe community output**

```bash
git add apps/research-mcp/src/actions/research-output.ts apps/research-mcp/src/actions/research-routes.ts apps/research-mcp/src/youtube-video-community-audit.ts tests/research-action-route.test.ts tests/youtube-video-community-audit.test.ts
git commit -m "feat: preserve community receipts across Action limits"
```

---

### Task 6: Generate the complete Custom GPT synchronization packet

**Files:**
- Create: `project/CUSTOM_GPT_ACTION_MODULE.md`
- Create: `scripts/generate-custom-gpt-packet.mts`
- Create: `docs/custom-gpt-instructions.md`
- Create: `docs/custom-gpt-sync.json`
- Create: `tests/custom-gpt-packet.test.ts`
- Modify: `scripts/generate-action-openapi.mts`
- Modify: `package.json`
- Modify: `docs/custom-gpt-action-openapi.json`
- Modify: `tests/action-openapi-snapshot.test.ts`

**Interfaces:**
- Consumes: route registry, `skills/askrigor/SKILL.md`, and the compact Action module.
- Produces: `generateCustomGptPacket(): Promise<CustomGptPacket>`, deterministic 18-operation OpenAPI, <=7,800-character instructions, and SHA-256 sync metadata.

- [ ] **Step 1: Write failing deterministic packet tests**

Require the generator output to equal the three committed artifacts. Require
17 exact read IDs plus the lesson ID; only the lesson has security and a
consequential marker. Require the instruction artifact to be no more than 7,800
characters and contain:

```text
manifest -> verify -> every load_protocol chunk
complete: true
continuation_recommended
synthesis_lock: pass
search_youtube_comments is partial
Submit this anonymized lesson to improve AskRigor?
Yes
Yes always in this chat
No
submit_lesson_candidate
Knowledge must remain empty
```

Require the sync JSON to contain SHA-256 values for the two source instruction
files plus the generated OpenAPI and instruction artifacts. The sync document
does not hash itself. Reject secret-like patterns, private
repository names/URLs, and unrecognized operation IDs.

- [ ] **Step 2: Run the packet test and verify failure**

Run: `npm run test:run -- tests/custom-gpt-packet.test.ts tests/action-openapi-snapshot.test.ts`

Expected: FAIL because the generated instructions/sync artifacts and 18-route
snapshot do not exist.

- [ ] **Step 3: Write the compact Action module**

The module supplements, rather than copies, `skills/askrigor/SKILL.md`. It must
state:

```markdown
## Action transport completion

For `load_protocol`, continue with each returned `next_cursor` in order until
`complete: true`. A manifest, successful integrity check, or proper subset of
chunks is not the complete protocol. Stop and report partial loading on any
missing, expired, repeated, or inconsistent chunk.

Keep Knowledge empty; canonical protocols are runtime tool results.

For community evidence, prefer `survey_youtube_community`, then
`audit_youtube_video_community`. Automatically continue while
`continuation_recommended: true`; require `synthesis_lock: pass` for full
synthesis. Transport-bounded samples do not change retrieved corpus counts.

## Optional lesson capture

Before the first eligible write, display exactly: “Submit this anonymized
lesson to improve AskRigor?” Accept only `Yes`, `Yes always in this chat`, or
`No`. Call `submit_lesson_candidate` only after the applicable consent and any
platform confirmation. Never send raw chat, identity, medical details,
uploads, or credentials. Standing consent ends with the current chat.
```

- [ ] **Step 4: Implement one deterministic generator**

Strip YAML frontmatter and the duplicate top heading from the skill, append the
Action module, and end with one newline. Generate OpenAPI from the same enabled
route list used by production. Generate canonical sorted-key sync JSON with:

```ts
interface CustomGptSync {
  schema_version: 1;
  generated_at: "2026-08-16";
  sources: Array<{ path: string; sha256: string }>;
  artifacts: Array<{
    path: "docs/custom-gpt-action-openapi.json" | "docs/custom-gpt-instructions.md";
    sha256: string;
  }>;
  research_operation_ids: string[];
  consequential_operation_ids: ["submit_lesson_candidate"];
  editor: {
    knowledge: "empty";
    schema_url: "https://mcp.askrigor.com/actions/openapi.json";
    authentication: "API Key -> Bearer";
    privacy_url: "https://askrigor.com/privacy";
    direct_gpt_url_required: true;
  };
}
```

`generate:action-openapi` continues to write only the OpenAPI artifact by
calling the shared function. Add:

```json
"generate:custom-gpt": "tsx scripts/generate-custom-gpt-packet.mts"
```

- [ ] **Step 5: Generate and verify a clean second generation**

Run:

```bash
npm run generate:custom-gpt
npm run generate:custom-gpt
git diff --check
npm run test:run -- tests/custom-gpt-packet.test.ts tests/action-openapi-snapshot.test.ts tests/research-operation-registry.test.ts
```

Expected: both generator runs produce identical bytes; tests pass; OpenAPI has
18 operations and no secret/private-repository content.

- [ ] **Step 6: Commit the synchronization packet**

```bash
git add project/CUSTOM_GPT_ACTION_MODULE.md scripts/generate-custom-gpt-packet.mts scripts/generate-action-openapi.mts package.json docs/custom-gpt-instructions.md docs/custom-gpt-sync.json docs/custom-gpt-action-openapi.json tests/custom-gpt-packet.test.ts tests/action-openapi-snapshot.test.ts
git commit -m "feat: generate Custom GPT synchronization packet"
```

---

### Task 7: Reconcile privacy, setup, release, and recovery documentation

**Files:**
- Create: `docs/custom-gpt-action-live-acceptance.md`
- Modify: `docs/custom-gpt-actions-setup.md`
- Modify: `docs/privacy-data-map.md`
- Modify: `site/privacy/index.html`
- Modify: `README.md`
- Modify: `docs/INDEX.md`
- Modify: `docs/release-evidence-v0.1.0.md`
- Modify: `project/CODEX-CURRENT-STATE.md`
- Modify: `tests/release-packet.test.ts`
- Modify: `tests/public-site.test.ts`

**Interfaces:**
- Consumes: implemented bridge flags, generated packet, and existing privacy/release truth.
- Produces: a fresh-worker recovery path, exact editor steps, synthetic acceptance cases, and truthful candidate/live distinction.

- [ ] **Step 1: Write failing documentation assertions**

Require setup, privacy map, public notice, README, current state, and release
evidence to contain the research Action flag, exact 60,000/48,000 bounds,
runtime chunking, shared public limits, transient provider flow, Knowledge-empty
rule, generated instruction path, and direct `/g/...` link requirement.

Require no document to claim the bridge is deployed before live evidence is
recorded. Preserve every existing lesson privacy assertion and historical
release SHA.

- [ ] **Step 2: Run documentation/site tests and verify failure**

Run:

```bash
npm run test:run -- tests/release-packet.test.ts tests/public-site.test.ts
npm run test:site
```

Expected: FAIL on missing research Action disclosures and handoff artifacts.

- [ ] **Step 3: Replace the manual multi-file GPT setup with exact generated handoff**

Update `custom-gpt-actions-setup.md` to tell the owner to use only:

```text
Instructions: docs/custom-gpt-instructions.md
Knowledge: empty
Action import: https://mcp.askrigor.com/actions/openapi.json
Authentication: API Key -> Bearer -> existing protected Action key
Privacy: https://askrigor.com/privacy
```

Retain the current key boundary, exact lesson consent question, synthetic
duplicate test, queue status, rotation, and rollback. Add the independent
research disable flag and state that it does not disable lesson capture or MCP.

- [ ] **Step 4: Reconcile privacy without inventing a new data flow**

State that Custom GPT Actions are a second transport into the same transient
research retrieval flow: requests may include user search terms and public
identifiers; responses may contain public provider metadata/comment text;
application bodies are not logged or persisted; infrastructure/provider
retention remains separately controlled. State that ordered protocol cursor
tokens contain only protocol identity, digest, offset, index, and expiry—not
protocol text, health content, or secrets.

Keep the lesson data path separately consented and unchanged.

- [ ] **Step 5: Add a synthetic live-acceptance record template**

List the exact 11 cases from the design with fields for UTC time, deployed
commit/image, schema/instruction hashes, request class, pass/fail, sanitized
result, and limitation. Include protocol chunk coverage and post-test MCP
inventory verification. Mark every result `pending` until actually run.

- [ ] **Step 6: Update recovery and candidate evidence**

`project/CODEX-CURRENT-STATE.md` records the branch, latest commits, exact
current task, tests run, unpushed/unmerged/deployment state, pending GPT editor
work, and next safe action. `release-evidence-v0.1.0.md` records only local
candidate evidence until deployment; historical production evidence remains
historical.

- [ ] **Step 7: Run site and documentation gates**

```bash
npm run test:run -- tests/release-packet.test.ts tests/public-site.test.ts tests/public-site-deployment.test.ts
npm run test:site
npm run test:site-deploy
git diff --check
```

Expected: PASS with no deployment claim.

- [ ] **Step 8: Commit documentation and privacy reconciliation**

```bash
git add docs/custom-gpt-action-live-acceptance.md docs/custom-gpt-actions-setup.md docs/privacy-data-map.md site/privacy/index.html README.md docs/INDEX.md docs/release-evidence-v0.1.0.md project/CODEX-CURRENT-STATE.md tests/release-packet.test.ts tests/public-site.test.ts
git commit -m "docs: add Custom GPT bridge handoff and privacy boundary"
```

---

### Task 8: Verify, review, publish, deploy, and complete live acceptance

**Files:**
- Modify after fresh evidence only: `docs/custom-gpt-action-live-acceptance.md`
- Modify after fresh evidence only: `docs/release-evidence-v0.1.0.md`
- Modify: `project/CODEX-CURRENT-STATE.md`

**Interfaces:**
- Consumes: all prior task commits, maintainer GitHub authentication, existing VPS access, existing protected runtime secrets, and the Custom GPT editor.
- Produces: clean final commit, focused PR, merged main when policy allows, reversible production image, live Action evidence, unchanged MCP inventory, and the exact final editor update step.

- [ ] **Step 1: Run the required lesson checkpoint and final deterministic gates**

```bash
npm run lessons:status
npm run generate:custom-gpt
git diff --exit-code -- docs/custom-gpt-action-openapi.json docs/custom-gpt-instructions.md docs/custom-gpt-sync.json
npm run verify
npm run test:site
npm run test:site-deploy
git diff --check
```

Expected: lesson status available or an explicit allowlisted unavailable reason;
all deterministic gates pass against the final candidate; generator output is
clean.

- [ ] **Step 2: Review the complete diff and secret boundary**

Run:

```bash
git status --short --branch
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
git log --oneline origin/main..HEAD
```

Inspect every changed file. Reject unrelated calibrated-discovery
implementation, protocol-byte changes, generated drift, private keys, `.env`,
provider credentials, private health content, raw live logs, or changes to the
17-tool inventory.

- [ ] **Step 3: Push one branch and open one focused PR**

Push the existing task branch, open a PR whose body includes the design/plan,
changed-file groups, exact commands/results, 17-tool frozen hash, 18-operation
Action schema, privacy effect, rollback, live acceptance still pending, and
lesson closeout. Do not open overlapping PRs.

- [ ] **Step 4: Run CI and merge only after required checks are green**

Use the repository's documented merge strategy. Preserve the pre-merge branch
and merge commit/reflog rollback points. After merge, verify the exact merged
commit locally with `npm run verify`. Do not delete the task branch or worktree
until production and GPT acceptance are complete.

- [ ] **Step 5: Build a clean immutable deployment candidate and preserve rollback**

Use the established AskRigor immutable source-archive/image procedure from the
merged commit. Before recreation, record the current research container ID,
image ID, image digest, Git commit, Compose render, loopback health, public
health, 17-tool inventory, and current Action schema hash. Tag the current image
as a reachable rollback image. Do not read or print runtime secret values.

Install only the nonsecret exact literal:

```text
ASKRIGOR_RESEARCH_ACTIONS_ENABLED=true
```

The existing continuation secret, provider credentials, Action Bearer key,
OpenAI key, GitHub App credentials, and lesson ledger remain untouched.

- [ ] **Step 6: Recreate only the research service and verify server boundaries**

Require loopback/public `/healthz` 200, live OpenAPI 18 exact operations,
unauthenticated read-only research calls, authenticated lesson isolation, and
direct MCP enumeration equal to the frozen 17-tool inventory hash. Caddy/site
must remain unchanged unless the privacy-site archive from Task 7 is activated
through its established transactional Caddy-only installer.

- [ ] **Step 7: Update the unpublished Custom GPT from the generated packet**

The only irreducible user-interface actions are:

1. copy all of `docs/custom-gpt-instructions.md` into Instructions;
2. leave Knowledge empty;
3. import `https://mcp.askrigor.com/actions/openapi.json`;
4. select API Key → Bearer and retain the existing protected key;
5. set `https://askrigor.com/privacy`;
6. save without publishing; and
7. run the prompts in `docs/custom-gpt-action-live-acceptance.md` in a new chat.

The repository worker supplies exact copy paths and test prompts and performs
all server/GitHub evidence collection. It does not ask the owner to collect
routine logs.

- [ ] **Step 8: Execute and record all 11 live acceptance cases**

Require every Universal and HRP chunk in order, structured provider examples,
YouTube continuation to a terminal receipt, malformed/oversized/rate boundaries,
one consented synthetic lesson, its duplicate, and failure isolation. Record
only sanitized machine-safe outcomes. Re-enumerate MCP after all Action cases.

If any case fails, leave the GPT unpublished, disable only
`ASKRIGOR_RESEARCH_ACTIONS_ENABLED`, recreate only research, prove MCP/lesson
recovery, and return to the failing test before another deployment.

- [ ] **Step 9: Repoint the GPT subdomain only to the actual direct GPT URL**

After all cases pass and the GPT is published/updated, copy its actual public
`https://chatgpt.com/g/...` URL. Replace the current shared-conversation target
behind `gpt.askrigor.com`, then verify the subdomain resolves only to the direct
GPT and not `/share/...`.

- [ ] **Step 10: Commit final evidence and close out lessons**

Record final commit/image/rollback identities, hashes, check run IDs, live case
outcomes, privacy deployment, GPT direct URL, and MCP post-check. Classify the
transport-bound continuation lesson as project-specific unless evidence from a
second repository supports universal promotion. Update the current-state next
action to none only when all deployment and editor gates are complete.

```bash
git add docs/custom-gpt-action-live-acceptance.md docs/release-evidence-v0.1.0.md project/CODEX-CURRENT-STATE.md
git commit -m "docs: record Custom GPT bridge acceptance"
```

Run `npm run verify` once more on this evidence commit, push it through one
focused PR if the first PR was merged before live evidence, and merge only with
all required checks green.

---

## Plan self-review record

- Spec coverage: every surface, registry, protocol, large-result, rate,
  concurrency, privacy, generation, editor, rollback, test, deployment, and
  completion requirement maps to Tasks 1–8.
- Scope: all tasks deliver one cohesive Action compatibility bridge; the
  calibrated-discovery runner and provider expansion remain excluded.
- Type consistency: `ResearchOperation`, `RESEARCH_OPERATIONS`,
  `createResearchActionRoutes`, `createEnabledActionRoutes`,
  `createProtocolActionChunk`, `boundYoutubeAuditForAction`, and
  `generateCustomGptPacket` are defined before their consumers.
- Authority: no task changes protocol bytes or allows Knowledge to replace
  runtime protocol loading.
- MCP freeze: the exact historical inventory hash is asserted before and after
  every transport layer that could create drift.
- Hosted limits: repository tests enforce a conservative internal ceiling;
  live GPT preview remains the required evidence for current hosted behavior.
- User effort: deterministic artifacts are generated and exact editor inputs
  are named; only unsupported GPT-editor interactions remain manual.
