# Calibrated Discovery Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, private AskRigor v0.2 benchmark for source authorization, Creative Tail Sampling parity, claim-warrant ceilings, bounded research-task receipts, and critical-overclaim scoring without changing public v0.1.

**Architecture:** Add a focused `@askrigor/calibrated-discovery` TypeScript workspace package and a private command-line evaluation harness. Provider behavior is dependency-injected and fixture-backed in Phase 1; no live Exa, Parallel, OpenAI, or treatment-community call is allowed. The package consumes existing provenance envelopes, preserves the current public MCP boundary, and emits ignored, machine-readable receipts under `.artifacts/`.

**Tech Stack:** Node.js 24.18.0, TypeScript 7, Vitest 4, Zod 4, npm workspaces, SHA-256 provenance checks.

## Global Constraints

- Keep public v0.1 frozen at exactly 17 read-only MCP tools.
- Do not register Phase 1 code in `apps/research-mcp`, the public OpenAPI document, plugin metadata, deployment files, or the public submission packet.
- Do not call or configure Parallel Task.
- Do not make any live provider call in ordinary tests or Phase 1 CI.
- Tail hypotheses begin as `speculative` and cannot raise a claim's warrant.
- Patient-experience reports cannot establish population rates, causation, comparative effectiveness, or safety.
- PatientsLikeMe and every permission-required source must fail closed before any transport is invoked.
- Preserve existing `AccessStatus` values and source limitations; do not invent completeness.
- Never place credentials, raw private health material, identifying patient data, or unrestricted provider output in fixtures or receipts.
- Use TDD for every behavioral task and run `npm run verify` on the final candidate.
- Phase 2 live-provider orchestration is a separate plan after Phase 1 evidence is reviewed.

---

## File structure

### New workspace package

- `packages/calibrated-discovery/package.json`: private workspace metadata and exports.
- `packages/calibrated-discovery/tsconfig.json`: composite TypeScript build referencing contracts.
- `packages/calibrated-discovery/src/contracts.ts`: runner, policy, tail, warrant, and receipt types.
- `packages/calibrated-discovery/src/provenance.ts`: pinned Creative Tail Sampling provenance and fixture hashes.
- `packages/calibrated-discovery/src/source-policy.ts`: static source authorization decisions and fail-closed gate.
- `packages/calibrated-discovery/src/tail-sampling.ts`: deterministic query families and collision adjudication.
- `packages/calibrated-discovery/src/warrant.ts`: claim-level epistemic ceiling rules.
- `packages/calibrated-discovery/src/runner.ts`: deterministic state machine, budgets, provider-lane isolation, and receipt assembly.
- `packages/calibrated-discovery/src/index.ts`: explicit public exports for the private package.

### Private evaluation and fixtures

- `scripts/run-calibrated-discovery.mts`: fixture-backed CLI producing one validated receipt artifact.
- `tests/fixtures/calibrated-discovery/upstream/schema.json`: exact upstream schema bytes.
- `tests/fixtures/calibrated-discovery/upstream/benchmark_cases.json`: exact upstream benchmark bytes.
- `tests/fixtures/calibrated-discovery/overconfidence-cases.json`: AskRigor high-risk regression cases.
- `tests/calibrated-discovery-provenance.test.ts`: source-commit and SHA-256 checks.
- `tests/calibrated-discovery-source-policy.test.ts`: authorization and transport-isolation checks.
- `tests/calibrated-discovery-tail.test.ts`: query independence and collision parity.
- `tests/calibrated-discovery-warrant.test.ts`: confidence-ceiling regressions.
- `tests/calibrated-discovery-runner.test.ts`: state, budget, saturation, privacy, and receipt tests.
- `tests/calibrated-discovery-cli.test.ts`: return-artifact and secret-scan tests.
- `tests/calibrated-discovery-public-boundary.test.ts`: exact 17-tool freeze regression.

### Existing files changed

- `package.json`: add the private Phase 1 command and package to build/typecheck.
- `package-lock.json`: record the new private workspace without new remote dependencies.
- `.gitignore`: already ignores `.artifacts/`; no change expected.
- `docs/privacy-data-map.md`: record the private runner's data boundary and disabled sources.
- `docs/INDEX.md`: index the plan and private benchmark evidence.
- `project/CODEX-CURRENT-STATE.md`: record branch, gates, and exact resume step after implementation.

---

### Task 1: Add the private workspace and lockfile entry

**Files:**
- Create: `packages/calibrated-discovery/package.json`
- Create: `packages/calibrated-discovery/tsconfig.json`
- Create: `packages/calibrated-discovery/src/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/package-entrypoints.test.ts`

**Interfaces:**
- Consumes: `@askrigor/contracts` version `0.1.0`.
- Produces: importable private package `@askrigor/calibrated-discovery`.

- [ ] **Step 1: Write the failing workspace entrypoint test**

Add to `tests/package-entrypoints.test.ts`:

```ts
it("loads the private calibrated-discovery workspace without registering an MCP tool", async () => {
  const module = await import("@askrigor/calibrated-discovery");
  expect(module.CALIBRATED_DISCOVERY_PHASE).toBe("private-phase-1");
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-package failure**

Run: `npx vitest run tests/package-entrypoints.test.ts`

Expected: FAIL because `@askrigor/calibrated-discovery` does not exist.

- [ ] **Step 3: Create the workspace metadata and entrypoint**

`packages/calibrated-discovery/package.json`:

```json
{
  "name": "@askrigor/calibrated-discovery",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "dependencies": {
    "@askrigor/contracts": "0.1.0",
    "zod": "4.4.3"
  }
}
```

`packages/calibrated-discovery/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "references": [
    { "path": "../contracts" }
  ]
}
```

`packages/calibrated-discovery/src/index.ts`:

```ts
export const CALIBRATED_DISCOVERY_PHASE = "private-phase-1" as const;
```

Add `packages/calibrated-discovery` to the root `build` and `typecheck` TypeScript project lists. Do not add it to `start:mcp` or `dev:mcp`.

- [ ] **Step 4: Refresh only workspace lock metadata**

Run: `npm install --package-lock-only --ignore-scripts`

Expected: PASS and `package-lock.json` contains the new local workspace with no new third-party package version.

- [ ] **Step 5: Reinstall from the final lockfile and run the focused test**

Run: `npm ci`

Run: `npx vitest run tests/package-entrypoints.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the workspace boundary**

```bash
git add package.json package-lock.json packages/calibrated-discovery tests/package-entrypoints.test.ts
git commit -m "build: add private calibrated discovery workspace"
```

### Task 2: Pin Creative Tail Sampling provenance and exact fixtures

**Files:**
- Create: `packages/calibrated-discovery/src/provenance.ts`
- Create: `tests/fixtures/calibrated-discovery/upstream/schema.json`
- Create: `tests/fixtures/calibrated-discovery/upstream/benchmark_cases.json`
- Create: `tests/calibrated-discovery-provenance.test.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `CREATIVE_TAIL_PROVENANCE` and `verifyCreativeTailFixture(name, bytes)`.
- Consumes: exact bytes from Creative Tail Sampling commit `293dd0636362cdd387f6f0c4717c08e0b4016c10`.

- [ ] **Step 1: Copy the two upstream fixture files without editing them**

Copy:

```text
/home/joel/creativeTailSampling/analysis/retrieval_ensemble/schema.json
  -> tests/fixtures/calibrated-discovery/upstream/schema.json
/home/joel/creativeTailSampling/analysis/retrieval_ensemble/benchmark_cases.json
  -> tests/fixtures/calibrated-discovery/upstream/benchmark_cases.json
```

Do not normalize whitespace or reserialize JSON.

- [ ] **Step 2: Write the failing byte-hash test**

`tests/calibrated-discovery-provenance.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CREATIVE_TAIL_PROVENANCE, verifyCreativeTailFixture } from "@askrigor/calibrated-discovery";

describe("Creative Tail Sampling provenance", () => {
  it("pins the reviewed source commit and exact fixture bytes", async () => {
    expect(CREATIVE_TAIL_PROVENANCE.commit).toBe(
      "293dd0636362cdd387f6f0c4717c08e0b4016c10",
    );
    const schema = await readFile("tests/fixtures/calibrated-discovery/upstream/schema.json");
    const cases = await readFile("tests/fixtures/calibrated-discovery/upstream/benchmark_cases.json");
    expect(verifyCreativeTailFixture("schema", schema)).toBe(true);
    expect(verifyCreativeTailFixture("benchmark_cases", cases)).toBe(true);
  });

  it("rejects one changed byte", () => {
    expect(verifyCreativeTailFixture("schema", Buffer.from("{}\n"))).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test and confirm exports are missing**

Run: `npx vitest run tests/calibrated-discovery-provenance.test.ts`

Expected: FAIL because the provenance exports do not exist.

- [ ] **Step 4: Implement exact SHA-256 verification**

`packages/calibrated-discovery/src/provenance.ts`:

```ts
import { createHash, timingSafeEqual } from "node:crypto";

export const CREATIVE_TAIL_PROVENANCE = Object.freeze({
  repository: "u-dont-existDOTcom/creativeTailSampling",
  commit: "293dd0636362cdd387f6f0c4717c08e0b4016c10",
  hashes: {
    schema: "771543801b0c0506dc589a0c74b465508bb928ce40275093a4879954bdddde8d",
    benchmark_cases: "8c8f21d29456af45e4abeaff9f726c7394765d8bbc9d847d9f3825b3d0b61015",
  },
} as const);

export type CreativeTailFixtureName = keyof typeof CREATIVE_TAIL_PROVENANCE.hashes;

export function verifyCreativeTailFixture(
  name: CreativeTailFixtureName,
  bytes: Uint8Array,
): boolean {
  const actual = createHash("sha256").update(bytes).digest();
  const expected = Buffer.from(CREATIVE_TAIL_PROVENANCE.hashes[name], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
```

Export the new symbols from `src/index.ts`.

- [ ] **Step 5: Run the provenance test**

Run: `npx vitest run tests/calibrated-discovery-provenance.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit provenance and fixtures**

```bash
git add packages/calibrated-discovery/src tests/fixtures/calibrated-discovery/upstream tests/calibrated-discovery-provenance.test.ts
git commit -m "test: pin creative tail sampling provenance"
```

### Task 3: Add source authorization policy and fail-closed transport gate

**Files:**
- Create: `packages/calibrated-discovery/src/contracts.ts`
- Create: `packages/calibrated-discovery/src/source-policy.ts`
- Create: `tests/calibrated-discovery-source-policy.test.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `SourceAuthorization`, `SOURCE_POLICIES`, `getSourcePolicy()`, and `runAuthorizedSource()`.
- `runAuthorizedSource<T>(sourceId, transport): Promise<T>` must not call `transport` unless the policy is `authorized`.

- [ ] **Step 1: Write authorization tests before the gate**

`tests/calibrated-discovery-source-policy.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getSourcePolicy, runAuthorizedSource } from "@askrigor/calibrated-discovery";

describe("calibrated-discovery source policy", () => {
  it("keeps PatientsLikeMe permission-required and never invokes transport", async () => {
    const transport = vi.fn(async () => ({ records: ["forbidden"] }));
    await expect(runAuthorizedSource("patientslikeme", transport)).rejects.toMatchObject({
      code: "source_permission_required",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("keeps CURE ID discovery-only until an API or permission is verified", () => {
    expect(getSourcePolicy("cure_id")).toMatchObject({
      authorization: "discovery_only",
      automated_access: false,
    });
  });

  it("allows the fixed PsyTAR fixture but records its narrow scope", async () => {
    const transport = vi.fn(async () => ({ records: 891 }));
    await expect(runAuthorizedSource("psytar_fixture", transport)).resolves.toEqual({ records: 891 });
    expect(transport).toHaveBeenCalledOnce();
    expect(getSourcePolicy("psytar_fixture").limitations).toContain("four psychiatric medications");
  });
});
```

- [ ] **Step 2: Run the test and confirm the policy API is missing**

Run: `npx vitest run tests/calibrated-discovery-source-policy.test.ts`

Expected: FAIL because the policy functions do not exist.

- [ ] **Step 3: Define the policy contracts**

In `contracts.ts` define:

```ts
export type SourceAuthorization = "authorized" | "discovery_only" | "permission_required";

export interface SourcePolicy {
  source_id: string;
  authorization: SourceAuthorization;
  automated_access: boolean;
  reviewed_at: "2026-08-16";
  terms_url: string;
  limitations: readonly string[];
}

export class SourcePolicyError extends Error {
  constructor(public readonly code: "source_discovery_only" | "source_permission_required") {
    super(code);
  }
}
```

- [ ] **Step 4: Implement a closed policy registry**

`source-policy.ts` must define only these Phase 1 IDs:

```ts
export type PhaseOneSourceId =
  | "patientslikeme"
  | "cure_id"
  | "psytar_fixture"
  | "open_humans_public_api"
  | "openfda_drug_events";
```

Set PatientsLikeMe to `permission_required`; CURE ID and Open Humans to
`discovery_only`; PsyTAR and openFDA to `authorized`. Unknown strings must throw
before any transport call. `runAuthorizedSource()` calls its injected transport
only for `authorized`.

- [ ] **Step 5: Run the policy tests**

Run: `npx vitest run tests/calibrated-discovery-source-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the policy gate**

```bash
git add packages/calibrated-discovery/src tests/calibrated-discovery-source-policy.test.ts
git commit -m "feat: fail closed on treatment source authorization"
```

### Task 4: Port deterministic query families and collision adjudication

**Files:**
- Create: `packages/calibrated-discovery/src/tail-sampling.ts`
- Create: `tests/calibrated-discovery-tail.test.ts`
- Modify: `packages/calibrated-discovery/src/contracts.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `buildIndependentQueryPlan(candidate)`, `adjudicateCollision(evidence)`, `TailCandidate`, `ProviderQueryPlan`, and `CollisionStrength`.
- Query plans contain separate immutable Exa and Parallel initial-query arrays.

- [ ] **Step 1: Write the independent-query and adjudication tests**

```ts
import { describe, expect, it } from "vitest";
import { adjudicateCollision, buildIndependentQueryPlan } from "@askrigor/calibrated-discovery";

describe("Creative Tail Sampling parity", () => {
  it("creates four independent initial query families per provider", () => {
    const plan = buildIndependentQueryPlan({
      id: "tail-1",
      proposition: "A circadian timing effect changes treatment response",
      source_domain: "chronobiology",
      target_domain: "treatment response",
    });
    expect(plan.exa.map(({ family }) => family)).toEqual([
      "target_neighbor", "alternate_terminology", "source_domain", "falsification",
    ]);
    expect(plan.parallel.map(({ family }) => family)).toEqual([
      "target_neighbor", "alternate_terminology", "source_domain", "falsification",
    ]);
    expect(plan.exa).not.toBe(plan.parallel);
  });

  it.each([
    [["direct"], "reject"],
    [["root_plus_residual"], "narrow"],
    [["ambiguous"], "escalate"],
    [["corroboration", "no_collision"], "survives_unverified"],
  ] as const)("maps %j to %s", (strengths, expected) => {
    expect(adjudicateCollision(strengths.map((strength) => ({ strength })))).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test and confirm missing behavior**

Run: `npx vitest run tests/calibrated-discovery-tail.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define exact tail contracts**

Add to `contracts.ts`:

```ts
export type QueryFamily = "target_neighbor" | "alternate_terminology" | "source_domain" | "falsification";
export type CollisionStrength = "direct" | "root_plus_residual" | "corroboration" | "no_collision" | "ambiguous";
export type CollisionDecision = "reject" | "narrow" | "escalate" | "survives_unverified";

export interface TailCandidate {
  id: string;
  proposition: string;
  source_domain: string;
  target_domain: string;
}
```

- [ ] **Step 4: Implement pure query and adjudication functions**

`buildIndependentQueryPlan()` returns new arrays for each provider and never
accepts provider results as input. Query text must contain the canonical
proposition and the family-specific objective. `adjudicateCollision()` uses the
precedence `direct` → reject, `root_plus_residual` → narrow, `ambiguous` →
escalate, otherwise → survives_unverified.

- [ ] **Step 5: Run tail tests and upstream provenance tests**

Run: `npx vitest run tests/calibrated-discovery-tail.test.ts tests/calibrated-discovery-provenance.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the deterministic port**

```bash
git add packages/calibrated-discovery/src tests/calibrated-discovery-tail.test.ts
git commit -m "feat: port calibrated tail query adjudication"
```

### Task 5: Enforce claim-level warrant ceilings

**Files:**
- Create: `packages/calibrated-discovery/src/warrant.ts`
- Create: `tests/calibrated-discovery-warrant.test.ts`
- Modify: `packages/calibrated-discovery/src/contracts.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `computeWarrant(input): ClaimWarrant`.
- Uses labels `verified | plausible | speculative | not_found | false`.

- [ ] **Step 1: Write critical ceiling regressions**

```ts
import { describe, expect, it } from "vitest";
import { computeWarrant } from "@askrigor/calibrated-discovery";

const base = {
  requested_label: "verified" as const,
  support: "direct" as const,
  access_complete: true,
  material_contradiction: false,
  tail_generated: false,
  community_only: false,
  mechanism_only: false,
  search_found_evidence: true,
};

describe("claim warrant ceilings", () => {
  it.each([
    [{ community_only: true }, "plausible", "community_only"],
    [{ mechanism_only: true }, "speculative", "mechanism_only"],
    [{ tail_generated: true }, "speculative", "tail_generated"],
    [{ access_complete: false }, "plausible", "pivotal_access_incomplete"],
    [{ material_contradiction: true }, "plausible", "material_contradiction"],
  ] as const)("caps %#", (change, label, reason) => {
    const result = computeWarrant({ ...base, ...change });
    expect(result.maximum_label).toBe(label);
    expect(result.downgrade_reasons).toContain(reason);
  });

  it("keeps no evidence located distinct from evidence of no effect", () => {
    expect(computeWarrant({ ...base, search_found_evidence: false })).toMatchObject({
      maximum_label: "not_found",
      downgrade_reasons: ["no_evidence_located"],
    });
  });
});
```

- [ ] **Step 2: Run and confirm the missing function failure**

Run: `npx vitest run tests/calibrated-discovery-warrant.test.ts`

Expected: FAIL.

- [ ] **Step 3: Define warrant input and output types**

```ts
export type EpistemicLabel = "verified" | "plausible" | "speculative" | "not_found" | "false";

export interface ClaimWarrantInput {
  requested_label: EpistemicLabel;
  support: "direct" | "indirect" | "none";
  access_complete: boolean;
  material_contradiction: boolean;
  tail_generated: boolean;
  community_only: boolean;
  mechanism_only: boolean;
  search_found_evidence: boolean;
}

export interface ClaimWarrant {
  maximum_label: EpistemicLabel;
  downgrade_reasons: string[];
}
```

- [ ] **Step 4: Implement monotone ceiling logic**

Use ordered ceilings only for positive-evidence labels:

```ts
const rank = { speculative: 0, plausible: 1, verified: 2 } as const;
```

`not_found` and `false` are evidence states, not positions on the confidence
ladder. Return `not_found` only when the search found no evidence. Never return
`false` unless a later explicit contradiction input supports it; Phase 1 does
not infer falsehood from missing support.

- [ ] **Step 5: Run warrant and source-policy tests**

Run: `npx vitest run tests/calibrated-discovery-warrant.test.ts tests/calibrated-discovery-source-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit warrant ceilings**

```bash
git add packages/calibrated-discovery/src tests/calibrated-discovery-warrant.test.ts
git commit -m "feat: cap claims at evidence warrant"
```

### Task 6: Build the deterministic bounded runner and receipt

**Files:**
- Create: `packages/calibrated-discovery/src/runner.ts`
- Create: `tests/calibrated-discovery-runner.test.ts`
- Modify: `packages/calibrated-discovery/src/contracts.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `runResearchTask(input, lanes): Promise<ResearchTaskReceipt>`.
- Consumes: injected `ProviderLane` functions only; no global fetch.
- Emits terminal state, per-lane states, exact budget usage, claims, warrants,
  contradictions, access boundaries, and stopping reason.

- [ ] **Step 1: Write the privacy and lane-isolation failure tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { runResearchTask } from "@askrigor/calibrated-discovery";

describe("deterministic research runner", () => {
  it("fails before providers when identifying health data is flagged", async () => {
    const lane = vi.fn();
    const receipt = await runResearchTask({
      task_id: "case-private",
      public_question: "treatment question",
      identifying_health_data_present: true,
      tail_triggers: [],
      budgets: { provider_calls: 4, records: 20, elapsed_ms: 10_000 },
    }, [{ id: "fixture", run: lane }]);
    expect(receipt).toMatchObject({ state: "failed", stopping_reason: "deidentification_required" });
    expect(lane).not.toHaveBeenCalled();
  });

  it("preserves a rate-limited lane as an access boundary", async () => {
    const receipt = await runResearchTask({
      task_id: "case-rate-limit",
      public_question: "public treatment question",
      identifying_health_data_present: false,
      tail_triggers: ["formal_community_discordance"],
      budgets: { provider_calls: 2, records: 20, elapsed_ms: 10_000 },
    }, [{
      id: "fixture",
      run: async () => ({ state: "rate_limited", records: [], limitations: ["quota exhausted"] }),
    }]);
    expect(receipt.state).toBe("complete_with_access_boundary");
    expect(receipt.access_boundaries).toContain("fixture:rate_limited");
  });
});
```

- [ ] **Step 2: Write budget and saturation tests**

Add tests proving:

- the third provider is never called when `provider_calls` is 2;
- returned records beyond the record budget are rejected rather than truncated
  and misreported;
- two consecutive completed follow-up passes with no material additions produce
  `complete` and stopping reason `evidence_saturation`;
- an unconsumed cursor produces `complete_with_access_boundary`; and
- every provider gets only `public_question`, never a private-context field.

- [ ] **Step 3: Run the runner test and confirm missing behavior**

Run: `npx vitest run tests/calibrated-discovery-runner.test.ts`

Expected: FAIL.

- [ ] **Step 4: Define exact runner types**

```ts
export type ResearchTaskState =
  | "planned" | "retrieving" | "adjudicating" | "followup_required"
  | "complete" | "complete_with_access_boundary" | "budget_exhausted" | "failed";

export interface ResearchBudgets {
  provider_calls: number;
  records: number;
  elapsed_ms: number;
}

export interface ProviderLaneResult {
  state: "complete" | "partial" | "rate_limited" | "inaccessible" | "error";
  records: readonly unknown[];
  limitations: readonly string[];
  next_cursor?: string;
  material_additions?: number;
}

export interface ProviderLane {
  id: string;
  run(input: { task_id: string; public_question: string }): Promise<ProviderLaneResult>;
}
```

- [ ] **Step 5: Implement the state machine with injected time**

Accept an optional runtime `{ now(): number }` defaulting to `Date.now`. Check
budgets before and after every lane. Preserve every lane result. Do not call
`fetch`, read environment credentials, or import `apps/research-mcp`.

- [ ] **Step 6: Run all calibrated-discovery tests**

Run: `npx vitest run tests/calibrated-discovery-*.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the runner**

```bash
git add packages/calibrated-discovery/src tests/calibrated-discovery-runner.test.ts
git commit -m "feat: add bounded private research runner"
```

### Task 7: Add the fixed overconfidence benchmark and critical scorer

**Files:**
- Create: `tests/fixtures/calibrated-discovery/overconfidence-cases.json`
- Create: `packages/calibrated-discovery/src/benchmark.ts`
- Create: `tests/calibrated-discovery-benchmark.test.ts`
- Modify: `packages/calibrated-discovery/src/index.ts`

**Interfaces:**
- Produces: `scoreOverconfidenceCases(cases, receipts): BenchmarkScore`.
- `BenchmarkScore` includes `critical_total`, `critical_failures`, case results,
  and `promotion_allowed`.

- [ ] **Step 1: Create the 15 exact case records from the approved design**

Each JSON record contains:

```json
{
  "id": "community-only-benefit",
  "severity": "critical",
  "input_fixture": "community-only-benefit",
  "forbidden_labels": ["verified"],
  "required_reasons": ["community_only"]
}
```

Include all 15 design cases with stable IDs. Use synthetic treatments and
people; do not copy real patient narratives.

- [ ] **Step 2: Write the failing zero-critical-failure test**

```ts
it("blocks promotion after any critical overclaim", () => {
  const score = scoreOverconfidenceCases(cases, [
    receipt("community-only-benefit", "verified", []),
  ]);
  expect(score.critical_failures).toBe(1);
  expect(score.promotion_allowed).toBe(false);
});
```

Also test a complete set of compliant synthetic receipts returns
`critical_failures: 0` and `promotion_allowed: true`.

- [ ] **Step 3: Run and confirm the scorer is missing**

Run: `npx vitest run tests/calibrated-discovery-benchmark.test.ts`

Expected: FAIL.

- [ ] **Step 4: Implement exact case-to-receipt scoring**

Reject duplicate case IDs, unknown receipt IDs, missing critical receipts,
forbidden labels, missing downgrade reasons, and any receipt claiming complete
coverage while retaining an access boundary.

- [ ] **Step 5: Run the benchmark and warrant tests together**

Run: `npx vitest run tests/calibrated-discovery-benchmark.test.ts tests/calibrated-discovery-warrant.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the benchmark**

```bash
git add packages/calibrated-discovery/src tests/fixtures/calibrated-discovery/overconfidence-cases.json tests/calibrated-discovery-benchmark.test.ts
git commit -m "test: gate calibrated discovery overclaims"
```

### Task 8: Add the private CLI and validated return artifact

**Files:**
- Create: `scripts/run-calibrated-discovery.mts`
- Create: `tests/calibrated-discovery-cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `.artifacts/calibrated-discovery/<task-id>/receipt.json`.
- Prints exactly one final `OUTPUT RECEIPT: <absolute-path>` line.
- Accepts only a checked-in fixture ID in Phase 1; no arbitrary URL or live key.

- [ ] **Step 1: Write CLI closure and secret-scan tests**

Spawn the CLI with fixture `community-only-benefit` and assert:

- exit status 0;
- final output contains one absolute receipt path below `.artifacts/`;
- the receipt parses and matches its task ID;
- no `.env`, API-key-like value, email, phone, username, or raw private context
  appears in stdout or the receipt; and
- an unknown fixture exits nonzero without creating an artifact.

- [ ] **Step 2: Run the test and confirm the script is missing**

Run: `npx vitest run tests/calibrated-discovery-cli.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement atomic receipt creation**

The script must:

1. validate the fixture ID against the closed benchmark list;
2. create `.artifacts/calibrated-discovery/<task-id>/` with mode `0700`;
3. write to `receipt.json.tmp` with mode `0600`;
4. parse and validate the temporary JSON;
5. rename it atomically to `receipt.json`;
6. print the exact absolute final path; and
7. delete only its own temporary file after a failure.

Add root script:

```json
"research:calibrated:fixture": "tsx scripts/run-calibrated-discovery.mts"
```

- [ ] **Step 4: Run the normal entry point end to end**

Run: `npm run research:calibrated:fixture -- community-only-benefit`

Expected: PASS and final line `OUTPUT RECEIPT: <absolute path>/receipt.json`.

- [ ] **Step 5: Run CLI tests**

Run: `npx vitest run tests/calibrated-discovery-cli.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the private entry point**

```bash
git add package.json scripts/run-calibrated-discovery.mts tests/calibrated-discovery-cli.test.ts
git commit -m "feat: emit calibrated discovery receipt"
```

### Task 9: Freeze the public v0.1 boundary mechanically

**Files:**
- Create: `tests/calibrated-discovery-public-boundary.test.ts`
- Read: `docs/tool-inventory-v0.1.0.json`
- Read: `apps/research-mcp/src/register-tools.ts`

**Interfaces:**
- Produces: regression proving Phase 1 is absent from the production server and
  the inventory remains exactly 17 tools.

- [ ] **Step 1: Write the boundary regression**

Test that:

- `docs/tool-inventory-v0.1.0.json` contains exactly 17 unique names;
- none contains `calibrated`, `research_task`, `tail`, or `warrant`;
- `createAskRigorServer()` still reports the exact same inventory as the file;
- importing `apps/research-mcp/src/register-tools.ts` does not import
  `@askrigor/calibrated-discovery`; and
- `package.json` does not add the private CLI to `start:mcp` or `dev:mcp`.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/calibrated-discovery-public-boundary.test.ts tests/mcp-tools.test.ts tests/public-submission-packet.test.ts`

Expected: PASS without any production code change. If it fails because Phase 1
was accidentally registered, remove that registration rather than updating the
v0.1 inventory.

- [ ] **Step 3: Commit the freeze regression**

```bash
git add tests/calibrated-discovery-public-boundary.test.ts
git commit -m "test: freeze public v0.1 during private evaluation"
```

### Task 10: Reconcile privacy, recovery, and Phase 1 verification

**Files:**
- Modify: `docs/privacy-data-map.md`
- Modify: `docs/INDEX.md`
- Modify: `project/CODEX-CURRENT-STATE.md`
- Read: `docs/superpowers/specs/2026-08-16-calibrated-discovery-research-runner-design.md`
- Read: `docs/superpowers/plans/2026-08-16-calibrated-discovery-phase-1-implementation.md`

**Interfaces:**
- Produces: durable recovery evidence and an exact Phase 2 gate.

- [ ] **Step 1: Document the private data flow**

Add a privacy-map row recording:

```text
private fixture question -> local deterministic runner -> ignored bounded receipt
```

State explicitly: no live third party, no identifying health data, no persistent
patient corpus, PatientsLikeMe disabled, and public v0.1 unaffected.

- [ ] **Step 2: Update the documentation index**

Index the Phase 1 plan, the private CLI, fixture corpus, and benchmark test.
Keep the existing public v0.1 records authoritative for the deployed service.

- [ ] **Step 3: Run the required lesson-queue checkpoint**

Run: `npm run lessons:status`

Expected: available result recorded in the current-state checkpoint. An
allowlisted unavailable result is recorded as unavailable, never zero.

- [ ] **Step 4: Run focused calibrated-discovery tests**

Run: `npx vitest run tests/calibrated-discovery-*.test.ts`

Expected: PASS with zero critical benchmark failures.

- [ ] **Step 5: Run public-site and deployment regressions**

Run: `npm run test:site`

Run: `npm run test:site-deploy`

Expected: PASS; no site or deployment file changed.

- [ ] **Step 6: Run the complete deterministic gate on the final tree**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 7: Review the final diff and tracked files**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --stat origin/main...HEAD`

Confirm no credential, `.env`, `.artifacts/` receipt, raw patient text,
production tool change, protocol change, generated build output, or unrelated
refactor is tracked.

- [ ] **Step 8: Record the current-state checkpoint**

Record the branch, final commit, exact command results, public 17-tool freeze,
benchmark result, source authorization states, residual risks, and the single
Phase 2 prerequisite: owner review of Phase 1 evidence before live-provider
planning.

- [ ] **Step 9: Commit documentation and checkpoint**

```bash
git add docs/privacy-data-map.md docs/INDEX.md project/CODEX-CURRENT-STATE.md
git commit -m "docs: close calibrated discovery phase one"
```

- [ ] **Step 10: Re-run the final gate after the documentation commit**

Run: `npm run verify`

Expected: PASS on the exact final commit candidate.

---

## Phase 1 terminal state

Phase 1 ends with a private deterministic runner, source-policy gates, exact
Creative Tail Sampling provenance, a fixed overconfidence benchmark, and a
validated local receipt. It does not establish live provider quality, model-
layer improvement, latency, or operating cost.

Only after the owner reviews the Phase 1 receipts and zero-critical-failure
result should a new plan cover de-identification review, Exa and Parallel Search
adapters, bounded live calls, model-layer comparison, cost measurements, and
possible protocol activation. Public v0.1 remains frozen throughout.
