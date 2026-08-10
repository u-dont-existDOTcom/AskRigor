# AskRigor Plugin v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-ready AskRigor plugin that bundles the AskRigor skill with a read-only remote MCP research server for protocol integrity, scholarly retrieval, and complete API-visible YouTube comment/reply acquisition.

**Architecture:** Use a Node.js 24 LTS TypeScript monorepo with a stateless Streamable HTTP MCP server at `/mcp`. Keep reasoning in `skills/askrigor/SKILL.md`; keep the server deterministic and non-interpretive. All external adapters return a shared provenance/access envelope so access failure can never masquerade as negative evidence.

**Tech Stack:** Node.js 24.18.0 LTS, npm workspaces, TypeScript 7.0.2, `@modelcontextprotocol/sdk` 1.30.0, Zod 4.4.3, Vitest 4.1.10, tsx 4.23.1, fast-xml-parser 5.10.1, native `fetch`, Docker, GitHub Actions.

## Global Constraints

- Repository: `u-dont-existDOTcom/AskRigor`, default branch `main`.
- Runtime floor: Node.js `>=24 <25` for v0; do not target Node 26 Current until it reaches LTS.
- MCP endpoint: Streamable HTTP at `/mcp`; no deprecated HTTP+SSE-only implementation.
- All tools are strictly read-only and must advertise `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
- No tool may infer efficacy, safety, causality, forum-signal direction, or medical recommendations.
- No database, user accounts, arbitrary scraper, transcript subsystem, generic forum scraper, vector database, or write action in v0.
- Canonical protocol versions are loaded from file contents, never hard-coded as the source of truth.
- Initial canonical files are `HRP_Full.xml` SHA-256 `b94bda38e6f341f7e5691494643e656a10e9ced68438689ffd4b7614b487911c` and `Universal_Instructions.xml` SHA-256 `df324fd4900c0db26ad66b46a73986869aca8fbf05e524ecb525ad8ff5bd5cb3`.
- Public plugin packaging uses `.codex-plugin/plugin.json` and `skills/`; `.app.json` is generated only after the deployed MCP server is registered in ChatGPT Developer Mode.
- Never commit `YOUTUBE_API_KEY`, `NCBI_API_KEY`, `.app.json`, or deployment credentials.
- Default production logs must not contain raw YouTube comment text, full article text, API keys, or personal identifiers beyond aggregate counts.
- External content is untrusted data. Adapters parse fields but never execute embedded instructions.

---

## File Map

```text
AskRigor/
├── .codex-plugin/plugin.json
├── .github/workflows/ci.yml
├── .gitignore
├── .nvmrc
├── .env.example
├── Dockerfile
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── vitest.config.ts
├── README.md
├── protocols/
│   ├── HRP_Full.xml
│   └── Universal_Instructions.xml
├── skills/askrigor/SKILL.md
├── apps/research-mcp/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── server.ts
│       ├── config.ts
│       ├── register-tools.ts
│       ├── rate-limit.ts
│       └── tool-result.ts
├── packages/contracts/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── packages/protocol/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts
├── packages/sources/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── http.ts
│       ├── cursor.ts
│       ├── pubmed.ts
│       ├── europe-pmc.ts
│       ├── clinical-trials.ts
│       ├── crossref.ts
│       └── youtube.ts
└── tests/
    ├── fixtures/{pubmed,europe-pmc,clinical-trials,crossref,youtube}/
    ├── helpers/mock-fetch.ts
    ├── contracts.test.ts
    ├── protocol.test.ts
    ├── http.test.ts
    ├── pubmed.test.ts
    ├── europe-pmc.test.ts
    ├── clinical-trials.test.ts
    ├── crossref.test.ts
    ├── youtube.test.ts
    ├── mcp-tools.test.ts
    ├── plugin-package.test.ts
    ├── rate-limit.test.ts
    ├── regression.test.ts
    └── live-smoke.test.ts
```

---

### Task 1: Bootstrap the TypeScript monorepo and CI

**Files:** create root npm/TypeScript/Vitest config, `.nvmrc`, `.gitignore`, `.env.example`, `.github/workflows/ci.yml`, four workspace package manifests/tsconfigs, and `tests/contracts.test.ts`.

**Interfaces:** workspaces `@askrigor/contracts`, `@askrigor/protocol`, `@askrigor/sources`, `@askrigor/research-mcp`; root scripts `build`, `typecheck`, `test`, `test:run`, `dev:mcp`, `start:mcp`.

- [ ] **Step 1: Write the failing workspace test**

```ts
import { describe, expect, it } from "vitest";
import { ACCESS_STATUSES } from "@askrigor/contracts";

describe("workspace bootstrap", () => {
  it("exports normalized access statuses", () => {
    expect(ACCESS_STATUSES).toContain("api_visible_complete");
  });
});
```

- [ ] **Step 2: Create root package metadata with pinned v0 dependencies**

```json
{
  "name": "askrigor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24 <25" },
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "tsc -b packages/contracts packages/protocol packages/sources apps/research-mcp",
    "typecheck": "tsc -b --pretty false packages/contracts packages/protocol packages/sources apps/research-mcp",
    "test": "vitest",
    "test:run": "vitest run",
    "dev:mcp": "tsx apps/research-mcp/src/index.ts",
    "start:mcp": "node apps/research-mcp/dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "fast-xml-parser": "5.10.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "tsx": "4.23.1",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

Run `npm install`; expected: lockfile created successfully.

- [ ] **Step 3: Add project references and environment guards**

`tsconfig.base.json` uses ES2024 + NodeNext, strict mode, declarations, source maps, and JSON modules. Each workspace sets `composite: true`, `rootDir: "src"`, `outDir: "dist"` and references dependencies.

`.nvmrc`:
```text
24.18.0
```

`.env.example`:
```text
PORT=3000
PROTOCOL_DIR=./protocols
YOUTUBE_API_KEY=
NCBI_API_KEY=
NCBI_TOOL=askrigor
NCBI_EMAIL=
UPSTREAM_TIMEOUT_MS=20000
PUBLIC_TOOL_MAX_PAGE_SIZE=100
PUBLIC_TOOL_MAX_PAGES=50
ASKRIGOR_PUBLIC_SERVER_ENABLED=false
ASKRIGOR_TRUSTED_CLIENT_IP_HEADER=
```

- [ ] **Step 4: Add CI and verify the intentional failure**

CI uses `actions/checkout@v4`, `actions/setup-node@v4` with Node 24.18.0, then `npm ci`, typecheck, tests, build.

Run:
```bash
npm run test:run -- tests/contracts.test.ts
```
Expected: FAIL because contracts are not implemented yet.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts .nvmrc .gitignore .env.example .github apps packages tests/contracts.test.ts
git commit -m "chore: bootstrap AskRigor TypeScript monorepo"
```

---

### Task 2: Implement normalized provenance/access contracts

**Files:** `packages/contracts/src/index.ts`, `tests/contracts.test.ts`.

**Produces:** `AccessStatus`, `Pagination`, `SourceIdentity`, `ProviderError`, `ProvenanceEnvelope<T>`, `okEnvelope()`, `errorEnvelope()`.

- [ ] **Step 1: Add failing tests for complete vs failed-empty states**

```ts
expect(okEnvelope({provider:"pubmed",recordType:"search",data:[],returned:0,accessStatus:"complete"}).access_status).toBe("complete");
expect(errorEnvelope({provider:"youtube",recordType:"comments",accessStatus:"comments_disabled",code:"commentsDisabled",message:"Comments are disabled"}).error?.code).toBe("commentsDisabled");
```

- [ ] **Step 2: Implement exact access-state union and envelope**

```ts
export const ACCESS_STATUSES = [
  "complete","api_visible_complete","partial","abstract_only","metadata_only",
  "comments_disabled","inaccessible","rate_limited","not_found","error"
] as const;

export interface ProvenanceEnvelope<T> {
  provider: string;
  record_type: string;
  primary_identifier?: string;
  retrieved_at: string;
  query?: unknown;
  source_identity: { canonical_url?: string; title?: string; authors_or_channel?: string[] };
  pagination: { cursor?: string; next_cursor?: string; page_size?: number; returned: number; exhausted?: boolean };
  access_status: (typeof ACCESS_STATUSES)[number];
  limitations: string[];
  raw_metadata?: unknown;
  error?: { code: string; message: string; http_status?: number; retryable?: boolean };
  data: T;
}
```

Helpers always populate `retrieved_at`, `source_identity`, `pagination`, and `limitations`.

- [ ] **Step 3: Run and commit**

```bash
npm run test:run -- tests/contracts.test.ts
git add packages/contracts tests/contracts.test.ts
git commit -m "feat: add normalized provenance contracts"
```

---

### Task 3: Add bounded upstream HTTP + opaque cursors

**Files:** `packages/sources/src/http.ts`, `cursor.ts`, `index.ts`, `tests/http.test.ts`, `tests/helpers/mock-fetch.ts`.

**Produces:** `fetchJson`, `fetchText`, `encodeCursor`, `decodeCursor`.

- [ ] **Step 1: Write security/retry tests**

```ts
await expect(fetchJson("https://evil.example/data")).rejects.toThrow("Upstream host is not allowlisted");
```

Mock a 503 followed by 200 and assert exactly two fetch calls.

- [ ] **Step 2: Implement strict allowlist and limits**

```ts
export const ALLOWED_UPSTREAM_HOSTS = new Set([
  "eutils.ncbi.nlm.nih.gov",
  "www.ebi.ac.uk",
  "europepmc.org",
  "clinicaltrials.gov",
  "api.crossref.org",
  "www.googleapis.com"
]);
```

Require HTTPS. Use `AbortSignal.timeout(timeoutMs ?? 20_000)`, at most 4 retries for 429/500/502/503/504, exponential backoff capped at 4 seconds, and a 10 MB response ceiling before decode.

- [ ] **Step 3: Implement base64url opaque cursors**

```ts
export const encodeCursor = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
export const decodeCursor = <T>(cursor: string): T => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
```

Validate decoded shapes with adapter-specific Zod schemas.

- [ ] **Step 4: Run and commit**

```bash
npm run test:run -- tests/http.test.ts
git add packages/sources tests/http.test.ts tests/helpers
git commit -m "feat: add bounded upstream HTTP client"
```

---

### Task 4: Import and verify canonical protocol files

**Files:** `protocols/HRP_Full.xml`, `protocols/Universal_Instructions.xml`, `packages/protocol/src/index.ts`, `tests/protocol.test.ts`.

**Produces:** `ProtocolName`, `ProtocolManifest`, `loadProtocol`, `getProtocolManifest`, `verifyProtocolIntegrity`.

- [ ] **Step 1: Copy exact canonical bytes and verify hashes**

```bash
sha256sum protocols/HRP_Full.xml protocols/Universal_Instructions.xml
```
Expected:
```text
b94bda38e6f341f7e5691494643e656a10e9ced68438689ffd4b7614b487911c  protocols/HRP_Full.xml
df324fd4900c0db26ad66b46a73986869aca8fbf05e524ecb525ad8ff5bd5cb3  protocols/Universal_Instructions.xml
```

- [ ] **Step 2: Write failing manifest/hash tests**

```ts
const manifest = await getProtocolManifest("hrp");
expect(manifest).toMatchObject({name:"HRP",version:"20.5.14",revisionDate:"2026-08-10"});
await expect(verifyProtocolIntegrity("hrp", "0".repeat(64))).rejects.toThrow("Protocol SHA-256 mismatch");
```

- [ ] **Step 3: Implement parsing without transforming canonical text**

Use `fast-xml-parser` only to validate syntax/root attributes. Hash exact UTF-8 bytes; return the untouched file string from `loadProtocol`. Reject absent root `name`, `version`, or `revisionDate`.

- [ ] **Step 4: Run and commit**

```bash
npm run test:run -- tests/protocol.test.ts
git add protocols packages/protocol tests/protocol.test.ts
git commit -m "feat: add canonical protocol integrity loader"
```

---

### Task 5: Create stateless Streamable HTTP MCP server + protocol tools

**Files:** `apps/research-mcp/src/{config,tool-result,register-tools,server,index}.ts`, `tests/mcp-tools.test.ts`.

**Produces:** `createAskRigorServer()`; `/mcp`; `/healthz`; tools `get_protocol_manifest`, `load_protocol`, `verify_protocol_integrity`.

- [ ] **Step 1: Write failing tool-registration test**

Assert all three tools exist and `readOnlyHint === true`.

- [ ] **Step 2: Implement server factory**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export function createAskRigorServer(): McpServer {
  const server = new McpServer({name:"askrigor-research",version:"0.1.0"},{instructions:"Read-only research retrieval. Preserve identifiers, provenance, pagination and access status. Never treat access failure as negative evidence."});
  registerTools(server);
  return server;
}
```

- [ ] **Step 3: Register protocol tools with Zod I/O schemas**

Every tool returns `structuredContent` plus concise text and annotations:
```ts
{ readOnlyHint: true, destructiveHint: false, openWorldHint: false }
```

- [ ] **Step 4: Implement stateless Streamable HTTP**

Use stable SDK v1 transport; instantiate a fresh server/transport per request. Delegate protocol method semantics to the SDK: POST plus only GET/DELETE behavior required by the installed Streamable HTTP contract and tests. Do not invent compatibility routes.

`/healthz` returns exactly:
```json
{"status":"ok","service":"askrigor-research","version":"0.1.0"}
```

- [ ] **Step 5: Test with MCP Inspector and commit**

```bash
npm run test:run -- tests/mcp-tools.test.ts
npm run dev:mcp
npx @modelcontextprotocol/inspector@latest
```
Expected: protocol tools visible/callable.

```bash
git add apps/research-mcp tests/mcp-tools.test.ts
git commit -m "feat: add read-only MCP server and protocol tools"
```

---

### Task 6: Implement PubMed search and record retrieval

**Files:** `packages/sources/src/pubmed.ts`, `index.ts`, `tests/pubmed.test.ts`, `tests/fixtures/pubmed/*`, `apps/research-mcp/src/register-tools.ts`.

**Produces:** `searchPubmed`, `fetchPubmedRecord`; MCP `search_pubmed`, `fetch_pubmed_record`.

- [ ] **Step 1: Record sanitized ESearch/EFetch fixtures and write failing tests**

Assert stable PMIDs, opaque next cursor, empty search as a complete exhausted result, and 429 as rate-limited rather than empty.

- [ ] **Step 2: Implement ESearch**

Request `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` with `db=pubmed`, `term`, `retmode=json`, `retstart`, `retmax<=100`, configured `tool`, `email`, optional `api_key`. Cursor payload is `{retstart:number}`. Add a limitation when hit count exceeds PubMed's first-10,000 ESearch retrieval boundary.

- [ ] **Step 3: Implement EFetch**

Use `efetch.fcgi?db=pubmed&id=<PMID>&retmode=xml`; normalize only explicitly present PMID/title/abstract/journal/dates/authors/DOI/publication types. Never infer full-text status or absent metadata.

- [ ] **Step 4: Register tools, run, commit**

```bash
npm run test:run -- tests/pubmed.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/pubmed.test.ts tests/fixtures/pubmed
git commit -m "feat: add PubMed retrieval tools"
```

---

### Task 7: Implement Europe PMC search

**Files:** `packages/sources/src/europe-pmc.ts`, `index.ts`, `tests/europe-pmc.test.ts`, fixtures, MCP registry.

**Produces:** `searchEuropePmc`; MCP `search_europe_pmc`.

- [ ] **Step 1: Write failing provider-identity/cursor tests**

Assert records preserve `source`, `id`, and provider cursor.

- [ ] **Step 2: Implement REST call**

Use:
```text
https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=<encoded>&format=json&pageSize=<1..100>&cursorMark=<cursor>
```
Normalize only provider fields: source/id/PMID/PMCID/DOI/title/authors/journal/year/citedBy/open-access/full-text flags when present.

- [ ] **Step 3: Run and commit**

```bash
npm run test:run -- tests/europe-pmc.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/europe-pmc.test.ts tests/fixtures/europe-pmc
git commit -m "feat: add Europe PMC retrieval tool"
```

---

### Task 8: Implement ClinicalTrials.gov v2

**Files:** `packages/sources/src/clinical-trials.ts`, `index.ts`, tests/fixtures, MCP registry.

**Produces:** `searchClinicalTrials`, `fetchClinicalTrial`; MCP `search_clinical_trials`, `fetch_clinical_trial`.

- [ ] **Step 1: Write failing pagination/status tests**

Assert returned IDs match `/^NCT\d{8}$/`, a 404 maps to `not_found`, and provider-version failure becomes a limitation instead of erasing valid study data.

- [ ] **Step 2: Implement search and single-study fetch**

Use `https://clinicaltrials.gov/api/v2/studies` with `query.term`, `pageSize`, optional `pageToken`; single record uses `/api/v2/studies/{nctId}`. Normalize title/status/type/phases/conditions/interventions/sponsors/enrollment/start/completion/results flag/references/last update.

- [ ] **Step 3: Add cached provider freshness**

Fetch `/api/v2/version` no more than once/process/15 minutes and place `dataTimestamp` in raw metadata. Failure adds a limitation.

- [ ] **Step 4: Run and commit**

```bash
npm run test:run -- tests/clinical-trials.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/clinical-trials.test.ts tests/fixtures/clinical-trials
git commit -m "feat: add ClinicalTrials.gov retrieval tools"
```

---

### Task 9: Implement DOI resolution + conservative retraction status

**Files:** `packages/sources/src/crossref.ts`, `index.ts`, tests/fixtures, MCP registry.

**Produces:** `resolveDoi`, `checkRetractionStatus`; statuses `retracted | expression_of_concern | corrected_or_updated | no_retraction_record_found | unknown`; MCP `resolve_doi`, `check_retraction_status`.

- [ ] **Step 1: Write failing retraction-state tests**

```ts
expect((await checkRetractionStatus("10.1021/am300292v")).data.status).toBe("retracted");
expect((await checkRetractionStatus("10.0000/unresolvable")).data.status).toBe("unknown");
```

- [ ] **Step 2: Implement Crossref lookup**

Normalize DOI URLs/`doi:`/bare DOI to lowercase canonical DOI and request `/works/{encoded-doi}`. Inspect `update-to`, `updated-by`, `relation`, and source metadata. Evidence entries retain type/DOI/date/source/raw label.

`no_retraction_record_found` is allowed only after a successful supported-source query with no marker; limitations must state this does not prove unretracted status everywhere. Provider failure => `unknown`.

- [ ] **Step 3: Add citation-to-DOI candidate resolution**

Use `/works?query.bibliographic=<citation>&rows=5`. Auto-resolve only when normalized title similarity plus first-author/year agreement pass; otherwise return candidates and `resolved_doi:null`.

- [ ] **Step 4: Run and commit**

```bash
npm run test:run -- tests/crossref.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/crossref.test.ts tests/fixtures/crossref
git commit -m "feat: add Crossref DOI and retraction tools"
```

---

### Task 10: Implement YouTube search/video metadata

**Files:** `packages/sources/src/youtube.ts`, `index.ts`, `tests/youtube.test.ts`, fixtures, MCP registry.

**Produces:** `parseYoutubeVideoId`, `searchYoutube`, `getYoutubeVideo`; MCP `search_youtube`, `get_youtube_video`.

- [ ] **Step 1: Test accepted URL shapes and malformed rejection**

```ts
for (const input of ["XpZHKGGCK-o","https://youtu.be/XpZHKGGCK-o","https://www.youtube.com/watch?v=XpZHKGGCK-o","https://www.youtube.com/shorts/XpZHKGGCK-o"]) {
  expect(parseYoutubeVideoId(input)).toBe("XpZHKGGCK-o");
}
```

- [ ] **Step 2: Implement API-key guard and search/video requests**

Missing key returns `inaccessible` with code `youtube_api_key_missing`; never expose key in logs/output.

Use `youtube/v3/search?part=snippet&type=video&q=...&maxResults<=50` and `youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=...`.

- [ ] **Step 3: Normalize exact metadata and commit**

Return video/channel IDs, title/description/published time/duration/statistics/tags/live state/embeddable/public status when exposed; distinguish not-found vs inaccessible when provider permits.

```bash
npm run test:run -- tests/youtube.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/youtube.test.ts tests/fixtures/youtube
git commit -m "feat: add YouTube discovery tools"
```

---

### Task 11: Implement complete API-visible YouTube comments/replies

**Files:** modify YouTube adapter/tests/fixtures and MCP registry.

**Produces:** `getYoutubeComments`, `searchYoutubeComments`; MCP `get_youtube_comments`, `search_youtube_comments`.

- [ ] **Step 1: Create a fixture where embedded replies are incomplete**

`commentThreads.list` fixture must have `totalReplyCount > replies.comments.length`; add `comments.list` fixtures spanning at least two pages.

- [ ] **Step 2: Write the regression test**

```ts
const result = await getYoutubeComments({video:"XpZHKGGCK-o",pageSize:100});
expect(result.data.manifest.expected_replies).toBe(4);
expect(result.data.manifest.replies_retrieved).toBe(4);
expect(result.data.manifest.reply_count_mismatches).toEqual([]);
expect(new Set(result.data.comments.map(c=>c.comment_id)).size).toBe(result.data.comments.length);
```

- [ ] **Step 3: Implement top-level pagination**

Call `commentThreads.list` with `part=snippet,replies`, `videoId`, `maxResults=100`, `textFormat=plainText`, `order=time`, and page token. Compare every `totalReplyCount` to embedded count.

- [ ] **Step 4: Implement separate complete reply pagination**

For any thread with replies call `comments.list` using `parentId`, paginate until no `nextPageToken`, and deduplicate by `comment_id` across embedded and separately fetched replies.

- [ ] **Step 5: Add explicit extraction manifest**

```ts
interface YoutubeCommentManifest {
  video_id: string;
  top_level_comments_retrieved: number;
  expected_replies: number;
  replies_retrieved: number;
  total_comments_and_replies: number;
  reply_count_mismatches: Array<{parent_comment_id:string;expected:number;retrieved:number}>;
  pages: {comment_threads:number;replies:number};
  extraction_coverage: "api_visible_complete" | "partial";
}
```

Set `api_visible_complete` only after all top-level pages exhaust, every reply pagination completes, and mismatch list is empty. Otherwise `partial` with exact limitation.

- [ ] **Step 6: Map provider failures and targeted search correctly**

Comments disabled => `comments_disabled`; quota/429 => `rate_limited`; deleted/private => `not_found`/`inaccessible` as provider supports; transient failure after partial collection => `partial`.

`search_youtube_comments` uses API `searchTerms` but always returns `partial` with a limitation that it is a query-bounded subset, never the complete corpus.

- [ ] **Step 7: Run and commit**

```bash
npm run test:run -- tests/youtube.test.ts tests/mcp-tools.test.ts
git add packages/sources apps/research-mcp tests/youtube.test.ts tests/fixtures/youtube
git commit -m "feat: retrieve complete API-visible YouTube comment corpora"
```

---

### Task 12: Build AskRigor skill + plugin manifest

**Files:** `skills/askrigor/SKILL.md`, `.codex-plugin/plugin.json`, `.gitignore`, `tests/plugin-package.test.ts`.

**Produces:** plugin `askrigor`; skill `askrigor`; remote app mapping deferred until registered `.app.json` exists.

- [ ] **Step 1: Write package-shape test**

```ts
expect(await exists(".codex-plugin/plugin.json")).toBe(true);
expect(await exists("skills/askrigor/SKILL.md")).toBe(true);
```

Assert manifest `name:"askrigor"`, `skills:"./skills/"`, capabilities `Read`.

- [ ] **Step 2: Write skill as orchestration, not protocol duplication**

Front matter:
```yaml
---
name: askrigor
description: Execute AskRigor research workflows by loading the canonical protocol, selecting read-only research tools, preserving provenance and access gaps, and auditing completion before synthesis.
---
```

Skill body requires protocol manifest/load before compliance claims, applicable HRP/Universal routing, literal use of access states, complete YouTube corpus tools when HRP requires YouTube, and no semantic medical judgments from tool metadata. Do not paste HRP into the skill.

- [ ] **Step 3: Create minimal manifest**

```json
{
  "name": "askrigor",
  "version": "0.1.0",
  "description": "Rigorous health and research workflows with deterministic scholarly and community-source retrieval.",
  "repository": "https://github.com/u-dont-existDOTcom/AskRigor",
  "keywords": ["research","health","evidence","pubmed","youtube"],
  "skills": "./skills/",
  "interface": {
    "displayName": "AskRigor",
    "shortDescription": "Evidence-first research with auditable source retrieval",
    "developerName": "AskRigor",
    "category": "Productivity",
    "capabilities": ["Read"],
    "websiteURL": "https://askrigor.com"
  }
}
```

Do not add `apps` or invented privacy/terms URLs yet.

- [ ] **Step 4: Run and commit**

```bash
npm run test:run -- tests/plugin-package.test.ts
git add skills .codex-plugin .gitignore tests/plugin-package.test.ts
git commit -m "feat: package AskRigor skill and plugin manifest"
```

---

### Task 13: Add five cross-adapter regression tests + opt-in live smoke tests

**Files:** `tests/regression.test.ts`, `tests/live-smoke.test.ts`, `package.json`, `README.md`.

- [ ] **Step 1: Implement five executable design regressions**

1. PubMed/Europe PMC ordinary indexed retrieval returns stable IDs and complete state.
2. Sparse PubMed evidence does not suppress ClinicalTrials.gov results.
3. YouTube top-level + replies reconcile.
4. Inaccessible/abstract-only source remains incomplete.
5. Replacing a valid protocol fixture changes manifest version/hash without code changes.

- [ ] **Step 2: Add live-test guard**

```ts
const live = process.env.ASKRIGOR_LIVE_TESTS === "1";
describe.runIf(live)("live provider smoke tests", () => {
  it("initializes every enabled provider adapter", async () => {/* small provider calls only */});
});
```

YouTube live smoke skips clearly when key/video ID missing. Never assert an exact changing comment count; assert exhaustion + reply reconciliation.

- [ ] **Step 3: Add scripts and run**

```json
"test:live": "ASKRIGOR_LIVE_TESTS=1 vitest run tests/live-smoke.test.ts",
"verify": "npm run typecheck && npm run test:run && npm run build"
```

```bash
npm run verify
ASKRIGOR_LIVE_TESTS=1 ASKRIGOR_YOUTUBE_SMOKE_VIDEO_ID=XpZHKGGCK-o YOUTUBE_API_KEY="$YOUTUBE_API_KEY" npm run test:live
```

- [ ] **Step 4: Commit**

```bash
git add tests package.json README.md
git commit -m "test: add AskRigor end-to-end regression suite"
```

---

### Task 14: Add deployment hardening + containerization

**Files:** `Dockerfile`, `apps/research-mcp/src/rate-limit.ts`, config/index changes, `tests/rate-limit.test.ts`, README.

**Produces:** trusted client-IP resolution, in-memory throttling, tool page ceilings, kill switch.

- [ ] **Step 1: Write failing limiter + client-IP tests**

```ts
const limiter = createRateLimiter({capacity:2,refillPerSecond:0});
expect(limiter.take("203.0.113.1")).toBe(true);
expect(limiter.take("203.0.113.1")).toBe(true);
expect(limiter.take("203.0.113.1")).toBe(false);
```

With no trusted-proxy config, `resolveClientIp` must ignore `X-Forwarded-For` and use socket address. With `ASKRIGOR_TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`, accept exactly one validated IP header; reject malformed or comma-separated chains and fall back to socket address.

- [ ] **Step 2: Implement bounded token bucket**

Bound Map to 10,000 keys with TTL eviction. Default: 60 MCP HTTP requests/minute/client IP plus tool-level max page size/pages. This is abuse protection, not authentication.

- [ ] **Step 3: Add kill switch**

When `ASKRIGOR_PUBLIC_SERVER_ENABLED !== "true"`, keep `/healthz` alive but make `/mcp` return 503 `public_server_disabled` without tool execution.

- [ ] **Step 4: Add production Dockerfile**

```dockerfile
FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY protocols ./protocols
COPY tsconfig.base.json ./
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:24.18.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/protocols ./protocols
EXPOSE 3000
CMD ["node","apps/research-mcp/dist/index.js"]
```

- [ ] **Step 5: Verify and commit**

```bash
docker build -t askrigor-research:0.1.0 .
npm run verify
git add Dockerfile apps/research-mcp tests/rate-limit.test.ts README.md
git commit -m "feat: harden public MCP deployment"
```

---

### Task 15: Deploy, register in ChatGPT Developer Mode, wire `.app.json`

**Files:** `.codex-plugin/plugin.json`, local-only `.app.json`, README.

**Dependency:** requires user-controlled cloud account and any billing authorization. Do not incur a charge without explicit authorization.

- [ ] **Step 1: Deploy container to a stable public HTTPS host**

At task start, choose a managed container host with stable HTTPS, secrets, health checks, and no sleep that breaks reliability. Provider/account/billing is a user-controlled branch and must be resolved then.

Required env:
```text
ASKRIGOR_PUBLIC_SERVER_ENABLED=true
PORT=3000
PROTOCOL_DIR=./protocols
YOUTUBE_API_KEY=<secret>
NCBI_API_KEY=<optional secret>
NCBI_TOOL=askrigor
NCBI_EMAIL=<maintainer contact email>
```

- [ ] **Step 2: Verify production with Inspector**

```bash
npx @modelcontextprotocol/inspector@latest
```
Call every tool with valid, empty, malformed, and not-found inputs; confirm read-only annotations and no secret leakage.

- [ ] **Step 3: Register MCP in ChatGPT Developer Mode**

Use production `/mcp` URL; capture generated technical connection ID beginning `plugin_asdk_app...`. This is an irreducible UI action if no automated registration API is available.

- [ ] **Step 4: Generate `.app.json` via official plugin-creator flow**

Use `@plugin-creator` in ChatGPT Work or `$plugin-creator` in Codex with exact registered ID. Do not hand-invent schema. Review that it maps only AskRigor MCP.

- [ ] **Step 5: Add app wiring only after generation**

Add to manifest:
```json
"apps": "./.app.json"
```
Keep `.app.json` uncommitted unless current official packaging explicitly requires committing the generated mapping.

- [ ] **Step 6: End-to-end ChatGPT tests**

Run prompts for PubMed search, canonical protocol version, complete YouTube comments/replies, a requested write action (must expose none), and missing YouTube-key failure (must surface inaccessible, not “no comments”).

- [ ] **Step 7: Commit repository-safe packaging/docs**

```bash
git add .codex-plugin README.md
git commit -m "docs: add ChatGPT plugin connection workflow"
```

---

### Task 16: Public-review privacy/security/release packet

**Files:** `docs/privacy-data-map.md`, `docs/public-review-checklist.md`, `docs/release-evidence-v0.1.0.md`, README, manifest only after real legal URLs verified.

- [ ] **Step 1: Inventory returned data**

Document scholarly metadata; public YouTube author/channel IDs and comment text; query terms; timestamps/provider IDs; aggregate server logs; and data not persistently stored in v0.

- [ ] **Step 2: Verify company/privacy URLs before public submission**

Use direct HTTPS checks. Do not add a privacy URL until it is live and actually discloses YouTube public identity/comment processing. If `https://askrigor.com/privacy` is not live, public submission is blocked while Developer Mode testing may continue.

- [ ] **Step 3: Build review checklist per tool**

Record exact name/title/description; I/O schemas; read-only annotations; representative valid call; empty result; malformed input; provider unavailable case; public personal data returned; confirmation no state change.

- [ ] **Step 4: Run final deterministic/live/security verification**

```bash
npm ci
npm run verify
ASKRIGOR_LIVE_TESTS=1 npm run test:live
npm audit --omit=dev
npm outdated
```

Then run MCP Inspector against production and record date, deployed commit SHA, endpoint, tools, and outcomes in release evidence. Do not auto-upgrade majors during release validation; record reachable unresolved vulnerabilities.

- [ ] **Step 5: Final release commit/tag only after gates pass**

```bash
git add docs README.md .codex-plugin/plugin.json package-lock.json
git commit -m "chore: prepare AskRigor v0.1.0 public review"
git tag -a v0.1.0 -m "AskRigor plugin v0.1.0"
git push origin main --follow-tags
```
Expected: clean tag checkout passes `npm ci && npm run verify`, production Inspector passes, and ChatGPT Developer Mode can call every advertised read-only tool.

---

## External API/Platform Source-of-Truth Checks

If current official documentation conflicts at implementation time, stop that task and update the plan/spec rather than silently coding stale behavior.

- OpenAI Plugins: plugin architecture, MCP build, packaging, Developer Mode connection, and review requirements under `developers.openai.com/plugins/`.
- MCP TypeScript SDK: stable `@modelcontextprotocol/sdk` v1 path while OpenAI's plugin guide still targets it.
- NCBI PubMed: E-utilities ESearch/EFetch; send `tool` and maintainer `email`; use API key when higher request rates require it.
- Europe PMC: REST API at `www.ebi.ac.uk/europepmc/webservices/rest`.
- ClinicalTrials.gov: API v2 and `/api/v2/version` freshness metadata.
- Crossref: REST `/works` plus Retraction Watch update metadata.
- YouTube Data API v3: `search.list`, `videos.list`, `commentThreads.list`, `comments.list`; embedded thread replies are never assumed complete.

## Plan Self-Review Gate

Before implementation begins:

1. Spec coverage: protocol loading, PubMed, Europe PMC, ClinicalTrials.gov, Crossref/retraction, YouTube discovery/comments, provenance, failure semantics, security, plugin packaging, tests, deployment all map to tasks.
2. Scope: no persistence, semantic health classifier, transcript extraction, private communities, generic forums, arbitrary scraper, write actions, or UI.
3. Type consistency: every adapter returns `ProvenanceEnvelope<T>`; all status values come from `ACCESS_STATUSES`; cursors are opaque at MCP boundaries.
4. YouTube completeness: `api_visible_complete` only after top-level and reply pages reconcile; targeted comment search remains partial/query-bounded.
5. Protocol integrity: internal version/revision parsed from XML root; SHA-256 over exact UTF-8 bytes.
6. Public review: read-only annotations match behavior; no secret/unnecessary private data in output/logs; privacy URL verified before submission.
