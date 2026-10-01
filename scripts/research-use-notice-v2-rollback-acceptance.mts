import { readFile, writeFile } from "node:fs/promises";

import { Pool } from "pg";

// Real-PostgreSQL acceptance for the notice v2 rollback scripts
// (infra/living-evidence-production/research-use-notice-v2-{hold,restore}.sql).
// The shell runner migrates a disposable database, runs the scripts with psql
// between these phases, and passes a snapshot file from `seed` onward.

const SCHEMA = "living_evidence";
const V1 = "free-contributor-v1-2026-09-01";
const V2 = "free-contributor-v2-2026-09-30";
const KEYS = {
  freeV2: "a".repeat(64),
  freeV1: "b".repeat(64),
  paid: "c".repeat(64),
  revoked: "d".repeat(64),
  freeV2Reenrolls: "e".repeat(64),
} as const;
const ENTITLEMENT_ID = "00000000-0000-4000-8000-000000000001";
const COLUMNS =
  "account_key, status, mode, notice_version, agreement_json, activated_at, revoked_at, created_at, updated_at";

type Row = Record<string, unknown>;
type Snapshot = Record<string, Row>;

async function main(): Promise<void> {
  const [phase, snapshotPath] = process.argv.slice(2);
  const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
  try {
    if (phase === "seed") {
      await seed(pool);
      await writeFile(requiredPath(snapshotPath), JSON.stringify(await accounts(pool)));
    } else if (phase === "after-hold") {
      await afterHold(pool, await snapshot(snapshotPath));
    } else if (phase === "reenroll-v1") {
      await reenrollV1(pool);
    } else if (phase === "after-restore") {
      await afterRestore(pool, await snapshot(snapshotPath));
    } else {
      throw new Error("EXPECTED_PHASE");
    }
  } finally {
    await pool.end();
  }
  process.stdout.write(`${JSON.stringify({ status: "PASS", phase })}\n`);
}

async function seed(pool: Pool): Promise<void> {
  const insert = `INSERT INTO ${SCHEMA}.research_use_accounts (${COLUMNS})
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`;
  const agreement = JSON.stringify({ synthetic: true, accepted: "notice" });
  const created = "2026-10-01T10:00:00.000Z";
  const active = "2026-10-01T10:05:00.000Z";
  await pool.query(insert, [KEYS.freeV2, "ACTIVE", "FREE_CONTRIBUTOR", V2, agreement, active, null, created, active]);
  await pool.query(insert, [KEYS.freeV1, "ACTIVE", "FREE_CONTRIBUTOR", V1, agreement, active, null, created, active]);
  await pool.query(insert, [KEYS.paid, "ACTIVE", "PAID_PRIVATE", null, "{}", active, null, created, active]);
  await pool.query(insert, [KEYS.revoked, "REVOKED", null, null, "{}", null, active, created, active]);
  await pool.query(insert, [KEYS.freeV2Reenrolls, "ACTIVE", "FREE_CONTRIBUTOR", V2, agreement, active, null, created, active]);
  // A row in a table that references the v2 account: the hold must keep it valid.
  await pool.query(
    `INSERT INTO ${SCHEMA}.research_private_entitlements
       (entitlement_id, account_key, status, source, granted_at)
     VALUES ($1, $2, 'ACTIVE', 'OWNER_GRANTED', $3)`,
    [ENTITLEMENT_ID, KEYS.freeV2, active],
  );
}

async function afterHold(pool: Pool, before: Snapshot): Promise<void> {
  const now = await accounts(pool);
  // The earlier image parses notice_version as v1 exactly, or null.
  const v2Rows = await pool.query(
    `SELECT count(*)::int AS n FROM ${SCHEMA}.research_use_accounts WHERE notice_version = $1`,
    [V2],
  );
  assert(v2Rows.rows[0].n === 0, "V2_ROW_REMAINS");
  for (const key of [KEYS.freeV2, KEYS.freeV2Reenrolls]) {
    const row = now[key];
    assert(row.status === "REVOKED" && row.mode === null && row.notice_version === null, "NOT_HELD");
    assert(JSON.stringify(row.agreement_json) === "{}", "AGREEMENT_NOT_CLEARED");
    assert(row.activated_at === null && row.revoked_at === row.updated_at, "MARKER_MISSING");
  }
  for (const key of [KEYS.freeV1, KEYS.paid, KEYS.revoked]) {
    assert(JSON.stringify(now[key]) === JSON.stringify(before[key]), `CHANGED_${key[0]}`);
  }
  const held = await pool.query(
    `SELECT ${COLUMNS} FROM ${SCHEMA}.research_use_notice_v2_hold ORDER BY account_key`,
  );
  assert(held.rows.length === 2, "HOLD_COUNT");
  for (const row of held.rows.map(normalize)) {
    assert(JSON.stringify(row) === JSON.stringify(before[row.account_key as string]), "HOLD_NOT_EXACT");
  }
  const entitlement = await pool.query(
    `SELECT account_key FROM ${SCHEMA}.research_private_entitlements WHERE entitlement_id = $1`,
    [ENTITLEMENT_ID],
  );
  assert(entitlement.rows[0]?.account_key === KEYS.freeV2, "ENTITLEMENT_LOST");

  // The runtime role reads the account table but never the hold table.
  const access = new Pool({ connectionString: requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL") });
  try {
    await access.query(`SELECT count(*) FROM ${SCHEMA}.research_use_accounts`);
    let denied = false;
    try {
      await access.query(`SELECT count(*) FROM ${SCHEMA}.research_use_notice_v2_hold`);
    } catch (error) {
      denied = (error as { code?: string }).code === "42501";
    }
    assert(denied, "HOLD_READABLE_BY_RUNTIME_ROLE");
  } finally {
    await access.end();
  }
}

async function reenrollV1(pool: Pool): Promise<void> {
  // What the earlier image's acceptFreeContributor writes for a held account.
  const at = "2026-10-01T12:00:00.000Z";
  const result = await pool.query(
    `UPDATE ${SCHEMA}.research_use_accounts
     SET status = 'ACTIVE', mode = 'FREE_CONTRIBUTOR', notice_version = $2,
         agreement_json = $3::jsonb, activated_at = $4, revoked_at = NULL, updated_at = $4
     WHERE account_key = $1`,
    [KEYS.freeV2Reenrolls, V1, JSON.stringify({ synthetic: true, accepted: "v1-again" }), at],
  );
  assert(result.rowCount === 1, "REENROLL_FAILED");
}

async function afterRestore(pool: Pool, before: Snapshot): Promise<void> {
  const now = await accounts(pool);
  assert(JSON.stringify(now[KEYS.freeV2]) === JSON.stringify(before[KEYS.freeV2]), "NOT_RESTORED_EXACTLY");
  const reenrolled = now[KEYS.freeV2Reenrolls];
  assert(reenrolled.status === "ACTIVE" && reenrolled.notice_version === V1, "NEWER_ROW_OVERWRITTEN");
  for (const key of [KEYS.freeV1, KEYS.paid, KEYS.revoked]) {
    assert(JSON.stringify(now[key]) === JSON.stringify(before[key]), `CHANGED_${key[0]}`);
  }
  const held = await pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.research_use_notice_v2_hold`);
  assert(held.rows[0].n === 0, "HOLD_NOT_EMPTIED");
}

async function accounts(pool: Pool): Promise<Snapshot> {
  const result = await pool.query(
    `SELECT ${COLUMNS} FROM ${SCHEMA}.research_use_accounts ORDER BY account_key`,
  );
  return Object.fromEntries(result.rows.map(normalize).map((row) => [row.account_key as string, row]));
}

function normalize(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

async function snapshot(path: string | undefined): Promise<Snapshot> {
  return JSON.parse(await readFile(requiredPath(path), "utf8")) as Snapshot;
}

function requiredPath(path: string | undefined): string {
  if (!path) {
    throw new Error("EXPECTED_SNAPSHOT_PATH");
  }
  return path;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) {
    throw new Error(code);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`MISSING_${name}`);
  }
  return value;
}

await main();
