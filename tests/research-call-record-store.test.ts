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
