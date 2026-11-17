import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { ATLAS_LIVING_PERSON_HOLD_FUNCTIONS, PostgresAtlasPublicationStore } from "@askrigor/evidence-repository";

import { atlasHoldReadiness, atlasHoldReadinessText } from "../apps/research-mcp/src/findings/runtime.js";
import { startAskRigorServer } from "../apps/research-mcp/src/start.js";

// Codex's fourth review of 17 Nov 2026: the server refuses to be ready without what the living-person hold needs, so a
// release that skipped a provisioning step (its migrate, or provision-research-review-role) cannot serve.

const RECORD = "record_atlas_living_person(integer, jsonb, text[], timestamptz)";

function storeAnswering(answer: () => Promise<string[]>) {
  let closed = false;
  const store = { livingPersonHoldMissing: answer, close: async () => { closed = true; } };
  return { store: store as unknown as PostgresAtlasPublicationStore, closed: () => closed };
}

describe("the living-person hold's readiness", () => {
  it("is ready when saves publish nothing in the Atlas, and asks the database otherwise", async () => {
    expect(await atlasHoldReadiness({}, () => undefined)).toEqual({ ready: true });
    const ready = storeAnswering(async () => []);
    expect(await atlasHoldReadiness({}, () => ready.store)).toEqual({ ready: true });
    expect(ready.closed()).toBe(true);
    const missing = storeAnswering(async () => [RECORD]);
    expect(await atlasHoldReadiness({}, () => missing.store)).toEqual({ ready: false, missing: [RECORD] });
    expect(missing.closed()).toBe(true);
    const unreachable = storeAnswering(async () => { throw new Error("connect ECONNREFUSED"); });
    expect(await atlasHoldReadiness({}, () => unreachable.store)).toEqual({ ready: false, missing: null });
    // Without ASKRIGOR_ATLAS_REVIEW, from the environment: nothing is connected.
    expect(await atlasHoldReadiness({ ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL: "postgres://review@127.0.0.1:1/x" }))
      .toEqual({ ready: true });
  });

  it("says plainly what is missing and what to run", () => {
    expect(atlasHoldReadinessText({ ready: false, missing: [RECORD] })).toBe("AskRigor did not start: the Atlas's " +
      "living-person hold needs these PostgreSQL functions, which are missing or which the review role can't run: " +
      `${RECORD}. Run the one-shot admin migrate, re-run provision-research-review-role, then start it again.`);
    expect(atlasHoldReadinessText({ ready: false, missing: null })).toBe("AskRigor did not start: it couldn't ask the " +
      "research review database whether the Atlas's living-person hold can run.");
  });

  it("asks the review role for each function the hold relies on, by its exact signature", async () => {
    expect(ATLAS_LIVING_PERSON_HOLD_FUNCTIONS).toEqual([
      "publish_atlas_findings(integer, text, jsonb, timestamptz, boolean)",
      "record_atlas_living_person(integer, jsonb, text[], timestamptz)",
      "inspect_atlas_publications(text[], integer[], text[], text[], bigint, integer)",
      "inspect_atlas_living_person_notes(text[])",
      "show_atlas_publications(text[], text[], text, text, timestamptz)",
    ]);
    const store = new PostgresAtlasPublicationStore({ connectionString: "postgres://review@127.0.0.1/askrigor" });
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    (store as unknown as { pool: { query: unknown } }).pool = {
      query: async (sql: string, values: unknown[]) => {
        calls.push({ sql: sql.replace(/\s+/gu, " ").trim(), values });
        return { rows: [{ signature: RECORD }] };
      },
    };
    expect(await store.livingPersonHoldMissing()).toEqual([RECORD]);
    expect(calls).toEqual([{ sql: "SELECT required.signature FROM unnest($1::text[]) WITH ORDINALITY AS " +
      "required(signature, place) WHERE to_regprocedure($2 || '.' || required.signature) IS NULL OR NOT " +
      "has_function_privilege(to_regprocedure($2 || '.' || required.signature), 'EXECUTE') ORDER BY required.place",
    values: [[...ATLAS_LIVING_PERSON_HOLD_FUNCTIONS], "living_evidence"] }]);
  });

  it("starts the server only when the hold is ready", async () => {
    const lines: string[] = [];
    expect(await startAskRigorServer({ port: 0, readiness: async () => ({ ready: false, missing: [RECORD] }),
      error: (line) => lines.push(line), createServer: () => { throw new Error("created a server"); } }))
      .toBeUndefined();
    expect(lines).toEqual([atlasHoldReadinessText({ ready: false, missing: [RECORD] })]);
    const server = await startAskRigorServer({ port: 0, readiness: async () => ({ ready: true }), log: () => undefined });
    try {
      const { port } = server!.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(response.status).toBe(200);
    } finally {
      await new Promise((resolve) => server!.close(resolve));
    }
  });
});
