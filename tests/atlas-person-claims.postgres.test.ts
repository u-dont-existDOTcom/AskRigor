import { createHash } from "node:crypto";

import pg from "pg";
import { describe, expect, it } from "vitest";

import { PostgresEvidenceRepository, postgresPersonClaimReads } from "@askrigor/evidence-repository";

// Atlas Release B's migration 0042 on a real PostgreSQL (run only with ASKRIGOR_PERSON_PG_URL, a throwaway database):
// it applies twice, keys every row by a general subject, keeps the private tables from the public runtime's reader,
// and its functions keep the day's limits, the site-wide ceiling, idempotency, the spend cap and the 90-day purge.
const URL = process.env.ASKRIGOR_PERSON_PG_URL;
const key = (value: string) => createHash("sha256").update(value).digest("hex");

describe.skipIf(URL === undefined)("migration 0042 on PostgreSQL", () => {
  it("applies twice and its functions hold their limits", { timeout: 120_000 }, async () => {
    const client = new pg.Client({ connectionString: URL });
    await client.connect();
    try {
      await client.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'askrigor_reader') THEN CREATE ROLE askrigor_reader NOLOGIN; END IF; END $$");
      const repository = new PostgresEvidenceRepository({ connectionString: URL!, schema: "living_evidence" });
      await repository.migrate();
      // The reader's default privilege (init-reader.sh) gives it every table; 0042, run again, takes the private ones back.
      await client.query("GRANT USAGE ON SCHEMA living_evidence TO askrigor_reader; GRANT SELECT ON ALL TABLES IN SCHEMA living_evidence TO askrigor_reader");
      await repository.migrate();
      await (repository as unknown as { pool: pg.Pool }).pool.end();
      const can = async (table: string) => (await client.query<{ ok: boolean }>(
        "SELECT has_table_privilege('askrigor_reader', $1, 'SELECT') AS ok", [`living_evidence.${table}`])).rows[0]!.ok;
      expect(await can("atlas_person_readings")).toBe(true);
      expect(await can("atlas_person_removals")).toBe(true);
      expect(await can("atlas_person_disputes")).toBe(false);
      expect(await can("atlas_person_removed_texts")).toBe(false);
      expect(await can("atlas_person_reading_spend")).toBe(false);
      // Round 3: the public history is the reader's; the owner's notices are not.
      expect(await can("atlas_person_changes")).toBe(true);
      expect(await can("atlas_person_owner_notices")).toBe(false);
      await client.query("SET search_path TO living_evidence, pg_catalog");
      // A publication that doesn't exist is refused; a news item's number is taken by its form until the news release.
      await expect(client.query("SELECT save_atlas_person_reading('publication', 'P-9999', $1, '[]'::jsonb, 'm', now())",
        ["a".repeat(64)])).rejects.toThrow(/ATLAS_PERSON_READING_UNKNOWN_SUBJECT/u);
      await expect(client.query("SELECT save_atlas_person_reading('news', 'P-1001', $1, '[]'::jsonb, 'm', now())",
        ["a".repeat(64)])).rejects.toThrow(/UNKNOWN_SUBJECT/u);
      await client.query("SELECT save_atlas_person_reading('news', 'N-12', $1, '[]'::jsonb, 'claude-opus-5-5', now())",
        ["a".repeat(64)]);
      const fail = async () => (await client.query<{ attempts: number; parked: boolean }>(
        "SELECT * FROM fail_atlas_person_reading('news', 'N-12', $1, 'attempt', now(), 3)", ["b".repeat(64)])).rows[0]!;
      expect(await fail()).toEqual({ attempts: 1, parked: false });
      await fail();
      expect(await fail()).toEqual({ attempts: 3, parked: true });
      // Round 3: one claim on a digest across processes: refused while it runs, once parked, or once read.
      const claim = async (digest: string, again = false) => (await client.query<{ claimed: boolean; attempts: number; parked: boolean }>(
        "SELECT * FROM claim_atlas_person_reading('news', 'N-12', $1, $2, '2026-11-19T12:00:00Z', 3, 60)", [digest, again])).rows[0]!;
      expect(await claim("b".repeat(64))).toEqual({ claimed: false, attempts: 3, parked: true });
      expect(await claim("c".repeat(64))).toEqual({ claimed: true, attempts: 1, parked: false });
      expect(await claim("c".repeat(64))).toEqual({ claimed: false, attempts: 1, parked: false });
      expect((await claim("a".repeat(64))).claimed).toBe(false);
      expect(await claim("a".repeat(64), true)).toEqual({ claimed: true, attempts: 1, parked: false });
      await client.query("SELECT * FROM fail_atlas_person_reading('news', 'N-12', $1, 'refusal:cyber', now(), 3)", ["a".repeat(64)]);
      expect(await claim("a".repeat(64), true)).toEqual({ claimed: true, attempts: 2, parked: false });
      await expect(client.query("SELECT atlas_person_subject_known('glance', 'G-9999') AS known")).resolves
        .toMatchObject({ rows: [{ known: false }] });
      // The spend: reserved under the cap, settled after; a hint has its own limit.
      const reserve = async (amount: string, hint = false) => (await client.query<{ ok: boolean }>(
        "SELECT reserve_atlas_person_spend('2026-11-19', $1::numeric, 1.00, $2, 1) AS ok", [amount, hint])).rows[0]!.ok;
      expect(await reserve("0.60")).toBe(true);
      expect(await reserve("0.50")).toBe(false);
      await client.query("SELECT settle_atlas_person_spend('2026-11-19', 0.60, 0.02)");
      expect(await reserve("0.50", true)).toBe(true);
      expect(await reserve("0.01", true)).toBe(false);
      // Disputes: one per form, the day's limits, the site-wide ceiling, the private record.
      const submit = async (index: number, extra: { address?: string; wanted?: string; legal?: boolean; kind?: string } = {}) =>
        (await client.query<{ outcome: string; duplicate: boolean }>(
          `SELECT outcome, duplicate FROM submit_atlas_person_dispute($1, 'news', 'N-12', $2, $6, $3, $4, $5,
            ARRAY[]::text[], ARRAY['topic:velmor-syndrome']::text[], 'A sentence.', 'Wrong.', NULL, 'me@example.org',
            '2026-11-19T12:00:00Z', 20, 5, 3, 10, $7)`,
          [`dispute-key-${String(index).padStart(6, "0")}`, key(`sentence ${index}`), extra.wanted ?? "taken_off",
            extra.legal ?? false, extra.address ?? key(`address ${index}`), extra.kind ?? "wrong", "a".repeat(64)])).rows[0]!;
      expect(await submit(0)).toEqual({ outcome: "taken_off", duplicate: false });
      expect(await submit(0)).toEqual({ outcome: "taken_off", duplicate: true });
      for (let index = 1; index < 20; index += 1) expect((await submit(index)).outcome).toBe("taken_off");
      expect((await submit(20)).outcome).toBe("over_ceiling");
      for (let index = 21; index < 26; index += 1) expect((await submit(index, { address: key("one"), wanted: "queued" })).outcome).toBe("queued");
      expect((await submit(26, { address: key("one"), wanted: "queued" })).outcome).toBe("limited");
      await submit(27, { wanted: "queued", legal: true });
      const queue = (await client.query("SELECT * FROM list_atlas_person_queue(50)")).rows;
      expect(queue[0]).toMatchObject({ subject_kind: "news", subject_id: "N-12", legal: true, email: "me@example.org" });
      // Only a missed-claim report is a hint, leased until its reading is acknowledged.
      await submit(28, { wanted: "queued", kind: "missed" });
      expect((await client.query("SELECT * FROM take_atlas_person_hints('news', 100, now())")).rows).toHaveLength(1);
      expect((await client.query("SELECT * FROM take_atlas_person_hints('news', 100, now())")).rows).toHaveLength(0);
      expect((await client.query("SELECT * FROM take_atlas_person_hints('publication', 100, now())")).rows).toHaveLength(0);
      // The removals a publication's page reads never include another subject's.
      const reads = postgresPersonClaimReads(client as unknown as pg.PoolClient, "2026-11-19T10:00:00.000Z");
      expect(await reads.readReadings(["P-1001"])).toEqual([]);
      expect(await reads.readRemovals(["P-1001"])).toEqual([]);
      expect(await client.query("SELECT count(*)::int AS n FROM atlas_person_removals WHERE subject_kind = 'news'"))
        .toMatchObject({ rows: [{ n: 20 }] });
      // Put back, by the main session; then the 90-day purge keeps the short record.
      expect((await client.query("SELECT decide_atlas_person_claim('news', 'N-12', $1, 'restore', NULL, ARRAY[]::text[], ARRAY[]::text[], 1, 'source found', now()) AS done",
        [key("sentence 0")])).rows[0]).toEqual({ done: true });
      // Round 3: a removal whose finding changed while it was judged is put back, its dispute handed back unresolved.
      expect((await client.query("SELECT decide_atlas_person_claim('news', 'N-12', $1, 'requeue', NULL, ARRAY[]::text[], ARRAY[]::text[], 2, 'changed', now()) AS done",
        [key("sentence 1")])).rows[0]).toEqual({ done: true });
      expect((await client.query("SELECT outcome, resolved_at FROM atlas_person_disputes WHERE dispute_number = 2")).rows[0])
        .toEqual({ outcome: "queued", resolved_at: null });
      expect((await client.query("SELECT removal_number FROM atlas_person_removed_texts_for(ARRAY[1, 2, 3]::bigint[])")).rows)
        .toEqual([{ removal_number: "3" }]);
      expect((await client.query("SELECT context_keys FROM atlas_person_removals WHERE removal_number = 3")).rows[0])
        .toEqual({ context_keys: ["topic:velmor-syndrome"] });
      // The public history: 20 taken off, then two put back; no words.
      expect((await client.query("SELECT state, count(*)::int AS n FROM atlas_person_changes GROUP BY state ORDER BY state")).rows)
        .toEqual([{ state: "restored", n: 2 }, { state: "taken_off", n: 20 }]);
      // The owner's notices: the parked digest, the legal letter and the refusal; leased once, delivered, acknowledged.
      const notices = (await client.query("SELECT notice_number, kind FROM take_atlas_person_notices(10, '2026-11-19T13:00:00Z')")).rows;
      expect(notices.map(({ kind }) => kind)).toEqual(["legal", "parked", "refusal"]);
      expect((await client.query("SELECT * FROM take_atlas_person_notices(10, '2026-11-19T13:00:00Z')")).rows).toEqual([]);
      const legal = notices[0]!.notice_number as string;
      expect((await client.query("SELECT record_atlas_person_notice($1, 'delivered', NULL, '2026-11-19T13:00:01Z') AS done", [legal])).rows[0]).toEqual({ done: true });
      expect((await client.query("SELECT record_atlas_person_notice($1, 'acknowledged', 'owner', '2026-11-19T14:00:00Z') AS done", [legal])).rows[0]).toEqual({ done: true });
      expect((await client.query("SELECT record_atlas_person_notice($1, 'acknowledged', 'owner', '2026-11-19T14:00:00Z') AS done", [legal])).rows[0]).toEqual({ done: false });
      expect((await client.query("SELECT kind FROM list_atlas_person_notices(10)")).rows.map(({ kind }) => kind)).toEqual(["parked", "refusal"]);
      expect((await client.query("SELECT purge_atlas_person_disputes('2026-11-20T00:00:00Z') AS purged")).rows[0]).toEqual({ purged: 28 });
      expect((await client.query("SELECT count(*)::int AS n FROM atlas_person_disputes WHERE email IS NULL AND what_is_wrong IS NULL AND sentence = 'A sentence.'")).rows[0]).toEqual({ n: 28 });
    } finally {
      await client.end();
    }
  });
});
