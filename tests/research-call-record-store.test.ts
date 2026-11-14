import { describe, expect, it } from "vitest";
import {
  InMemoryResearchCallRecordStore, PostgresResearchCallRecordStore, PostgresResearchContributorAccessStore,
  RESEARCH_CALL_RECORD_RETENTION_DAYS, RESEARCH_CALL_RECORD_RETENTION_MS, type ResearchCallRecordEntry,
} from "@askrigor/evidence-repository";

const now = new Date("2026-11-09T11:52:03.000Z");
const boundary = now.getTime() - RESEARCH_CALL_RECORD_RETENTION_MS;
const entry = (receivedAt = now, accountKey = "synthetic-account-a"): ResearchCallRecordEntry => ({
  accountKey, receivedAt, tool: "manage_research_access", action: "inspect", route: "/mcp",
  chatgpt: true, outcome: "answered", code: null, durationMs: 400,
});

describe("content-free call record store", () => {
  it("records only its fields, returns copies, and isolates accounts", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const original = { ...entry(), extra: "argument-marker-not-to-retain" };
    await store.record(original);
    await store.record(entry(now, "synthetic-account-b"));
    original.receivedAt = new Date(0);
    const rows = await store.list("synthetic-account-a", now);
    expect(rows).toEqual([entry()]);
    rows[0]!.receivedAt.setTime(0);
    expect(await store.list("synthetic-account-a", now)).toEqual([entry()]);
    expect(await store.list("unknown", now)).toEqual([]);
  });

  // Owner answer 289a: plan_research's decision, kept only on its own rows and only as one of its two values.
  it("keeps plan_research's decision on its rows only, and only ask or go_on", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const plan = { ...entry(), action: "plan_research", planNext: "ask" as const };
    await store.record(plan);
    await store.record({ ...entry(new Date(now.getTime() - 1)), planNext: "go_on" });
    await store.record({ ...plan, receivedAt: new Date(now.getTime() - 2), planNext: "maybe" as never });
    await store.record({ ...plan, receivedAt: new Date(now.getTime() - 3), tool: "load_protocol" });
    const rows = await store.list("synthetic-account-a", now);
    expect(rows.map((row) => row.planNext)).toEqual(["ask", undefined, undefined, undefined]);
    expect(rows.filter((row) => Object.hasOwn(row, "planNext"))).toHaveLength(1);
  });

  // Its twin (owner answer 303a's build, migration 0035): the lane AskRigor's own plan gave a register_plain_answer call.
  it("keeps register_plain_answer's lane on its rows only, and only research, light or aside", async () => {
    const store = new InMemoryResearchCallRecordStore();
    const registered = { ...entry(), action: "register_plain_answer", planLane: "light" as const };
    await store.record(registered);
    await store.record({ ...registered, receivedAt: new Date(now.getTime() - 1), planLane: "aside" });
    await store.record({ ...registered, receivedAt: new Date(now.getTime() - 2), planLane: "research" });
    await store.record({ ...entry(new Date(now.getTime() - 3)), planLane: "light" });
    await store.record({ ...registered, receivedAt: new Date(now.getTime() - 4), planLane: "maybe" as never });
    await store.record({ ...registered, receivedAt: new Date(now.getTime() - 5), tool: "load_protocol" });
    await store.record({ ...registered, receivedAt: new Date(now.getTime() - 6), action: "plan_research" });
    const rows = await store.list("synthetic-account-a", now);
    expect(rows.map((row) => row.planLane)).toEqual(["light", "aside", "research", undefined, undefined, undefined,
      undefined]);
    expect(rows.filter((row) => Object.hasOwn(row, "planLane"))).toHaveLength(3);
  });

  // No test reaches a database: the Postgres store gets a pool that answers from memory and keeps each statement.
  it("writes and reads the lane in the Postgres store as it does plan_research's decision", async () => {
    const statements: Array<{ sql: string; values: unknown[] }> = [];
    const pool = { query: async (sql: string, values: unknown[]) => {
      statements.push({ sql: sql.replace(/\s+/gu, " ").trim(), values });
      return sql.includes("SELECT") ? { rows: [
        { account_key: "synthetic-account-a", received_at: now, tool: "manage_research_access",
          action: "register_plain_answer", route: "/mcp", chatgpt: true, outcome: "answered", code: null,
          duration_ms: 400, plan_next: null, plan_lane: "light" },
        { account_key: "synthetic-account-a", received_at: now, tool: "manage_research_access", action: "plan_research",
          route: "/mcp", chatgpt: true, outcome: "answered", code: null, duration_ms: 400, plan_next: "ask",
          plan_lane: null },
      ], rowCount: 2 } : { rows: [], rowCount: 0 };
    } };
    const store = new PostgresResearchCallRecordStore(pool as never, "living_evidence");
    await store.record({ ...entry(), action: "register_plain_answer", planLane: "aside" });
    await store.record({ ...entry(), action: "inspect", planLane: "aside" });
    const inserts = statements.filter(({ sql }) => sql.startsWith("INSERT"));
    expect(inserts[0]!.sql).toContain("duration_ms, plan_next, plan_lane) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, " +
      "$10, $11)");
    expect(inserts.map(({ values }) => values.slice(9))).toEqual([[null, "aside"], [null, null]]);
    const rows = await store.list("synthetic-account-a", now);
    expect(statements.at(-1)!.sql).toContain("duration_ms, plan_next, plan_lane FROM living_evidence.research_call_record");
    expect(rows[0]).toMatchObject({ action: "register_plain_answer", planLane: "light" });
    expect(rows[0]).not.toHaveProperty("planNext");
    expect(rows[1]).toMatchObject({ action: "plan_research", planNext: "ask" });
    expect(rows[1]).not.toHaveProperty("planLane");
  });

  it("uses exactly seven days and excludes the boundary to the millisecond", async () => {
    expect(RESEARCH_CALL_RECORD_RETENTION_DAYS).toBe(7);
    expect(RESEARCH_CALL_RECORD_RETENTION_MS).toBe(604_800_000);
    const store = new InMemoryResearchCallRecordStore();
    for (const offset of [-1, 0, 1]) await store.record(entry(new Date(boundary + offset)));
    expect((await store.list("synthetic-account-a", now)).map((row) => row.receivedAt.getTime()))
      .toEqual([boundary + 1]);
  });

  it("record prunes older entries for that account only, preserving the exact boundary", async () => {
    const store = new InMemoryResearchCallRecordStore();
    await store.record(entry(new Date(boundary - 1)));
    await store.record(entry(new Date(boundary)));
    await store.record(entry(new Date(boundary - 1), "synthetic-account-b"));
    await store.record(entry());
    // An earlier list time makes physical pruning observable, rather than hiding it behind list's filter.
    expect((await store.list("synthetic-account-a", new Date(boundary))).map((row) => row.receivedAt))
      .toEqual([now, new Date(boundary)]);
    expect(await store.sweep(now)).toBe(1);
  });

  it("sweeps every account strictly older than seven days and returns a count", async () => {
    const store = new InMemoryResearchCallRecordStore();
    await store.record(entry(new Date(boundary - 1)));
    await store.record(entry(new Date(boundary - 1), "synthetic-account-b"));
    await store.record(entry(new Date(boundary), "synthetic-account-c"));
    expect(await store.sweep(now)).toBe(2);
    expect(await store.sweep(now)).toBe(0);
    expect(await store.sweep(new Date(now.getTime() + 1))).toBe(1);
  });

  it("returns the newest 500 entries in descending order regardless of insertion order", async () => {
    const store = new InMemoryResearchCallRecordStore();
    for (let index = 504; index >= 0; index--) await store.record(entry(new Date(now.getTime() - index)));
    const rows = await store.list("synthetic-account-a", now);
    expect(rows).toHaveLength(500);
    expect(rows.map((row) => row.receivedAt.getTime()))
      .toEqual(Array.from({ length: 500 }, (_, index) => now.getTime() - index));
  });

  // The server builds the production record from the research-access store, on its pool and schema (no second pool);
  // nothing connects until a query runs.
  it("comes from the research-access store in production, on that store's pool", async () => {
    const access = new PostgresResearchContributorAccessStore({
      connectionString: "postgres://synthetic@127.0.0.1:9/synthetic", schema: "living_evidence",
    });
    const record = access.callRecordStore();
    expect(record).toBeInstanceOf(PostgresResearchCallRecordStore);
    expect((record as unknown as { pool: unknown }).pool).toBe((access as unknown as { pool: unknown }).pool);
    await (access as unknown as { pool: { end: () => Promise<void> } }).pool.end();
  });
});
