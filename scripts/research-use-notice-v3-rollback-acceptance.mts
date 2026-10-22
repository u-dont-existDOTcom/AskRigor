import { readFile, writeFile } from "node:fs/promises";

import { Pool } from "pg";

// Real-PostgreSQL acceptance for the notice v3 rollback scripts
// (infra/living-evidence-production/research-use-notice-v3-{hold,restore}.sql).
// The shell runner migrates a disposable database, runs the scripts with psql
// between these phases, and passes a snapshot file from `seed` onward.

const SCHEMA = "living_evidence";
const V1 = "free-contributor-v1-2026-09-01";
const V2 = "free-contributor-v2-2026-09-30";
const V3 = "free-contributor-v3-2026-10-22";
// The earlier image (build 71f09f63) parses a stored notice version, and a stored agreement's, as one of these.
const EARLIER_IMAGE_VERSIONS: readonly unknown[] = [V1, V2];
const KEYS = {
  freeV3: "a".repeat(64),
  freeV2: "b".repeat(64),
  paid: "c".repeat(64),
  revoked: "d".repeat(64),
  freeV3Reenrolls: "e".repeat(64),
  freeV1: "f".repeat(64),
} as const;
const UNTOUCHED = [KEYS.freeV2, KEYS.freeV1, KEYS.paid, KEYS.revoked];
const ENTITLEMENT_ID = "00000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000002";
const ATLAS_INTENT_ID = "00000000-0000-4000-8000-000000000003";
const HOLD_TABLE = "research_use_notice_v3_hold";
const HOLD_COLUMNS =
  "account_key, status, mode, notice_version, agreement_json, activated_at, revoked_at, created_at, updated_at";
// The account's two settings (migrations 0013 and 0015), which neither script reads or writes.
const ACCOUNT_COLUMNS = `${HOLD_COLUMNS}, plain_answer_note, detailed_lesson_reports`;

type Row = Record<string, unknown>;
type Accounts = Record<string, Row>;
// Each other table's row count and digest: the scripts change only the account table and the hold table.
type Tables = Record<string, string>;
interface Snapshot {
  accounts: Accounts;
  tables: Tables;
}

async function main(): Promise<void> {
  const [phase, snapshotPath] = process.argv.slice(2);
  const pool = new Pool({ connectionString: requiredEnv("DATABASE_URL") });
  try {
    if (phase === "seed") {
      await seed(pool);
      const state: Snapshot = { accounts: await accounts(pool), tables: await otherTables(pool) };
      await writeFile(requiredPath(snapshotPath), JSON.stringify(state));
    } else if (phase === "after-hold") {
      await afterHold(pool, await snapshot(snapshotPath));
    } else if (phase === "reenroll-v2") {
      await reenrollV2(pool);
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
  const insert = `INSERT INTO ${SCHEMA}.research_use_accounts (${HOLD_COLUMNS})
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`;
  const created = "2026-10-22T10:00:00.000Z";
  const active = "2026-10-22T10:05:00.000Z";
  await pool.query(insert, [KEYS.freeV3, "ACTIVE", "FREE_CONTRIBUTOR", V3, agreement(V3), active, null, created, active]);
  await pool.query(insert, [KEYS.freeV2, "ACTIVE", "FREE_CONTRIBUTOR", V2, agreement(V2), active, null, created, active]);
  await pool.query(insert, [KEYS.paid, "ACTIVE", "PAID_PRIVATE", null, "{}", active, null, created, active]);
  await pool.query(insert, [KEYS.revoked, "REVOKED", null, null, "{}", null, active, created, active]);
  await pool.query(insert, [KEYS.freeV3Reenrolls, "ACTIVE", "FREE_CONTRIBUTOR", V3, agreement(V3), active, null, created, active]);
  await pool.query(insert, [KEYS.freeV1, "ACTIVE", "FREE_CONTRIBUTOR", V1, agreement(V1), active, null, created, active]);
  // Settings away from their defaults, which the hold and the restore keep.
  await pool.query(
    `UPDATE ${SCHEMA}.research_use_accounts SET plain_answer_note = false, detailed_lesson_reports = true
      WHERE account_key = $1`,
    [KEYS.freeV3],
  );
  // Rows in other tables, which neither script may change: an entitlement and a pending proposal that reference the
  // v3 account (the hold is not a revocation, so the proposal stays pending), and a pending Atlas intent, which the
  // earlier image never selects.
  await pool.query(
    `INSERT INTO ${SCHEMA}.research_private_entitlements
       (entitlement_id, account_key, status, source, granted_at)
     VALUES ($1, $2, 'ACTIVE', 'OWNER_GRANTED', $3)`,
    [ENTITLEMENT_ID, KEYS.freeV3, active],
  );
  await pool.query(
    `INSERT INTO ${SCHEMA}.research_contribution_proposals
       (proposal_id, account_key, proposal_kind, payload_sha256, payload_json, privacy_boundary_json, partial,
        status, created_at)
     VALUES ($1, $2, 'RESEARCH_FRONTIER', $3, $4::jsonb, $4::jsonb, false, 'PENDING_REVIEW', $5)`,
    [PROPOSAL_ID, KEYS.freeV3, "1".repeat(64), JSON.stringify({ synthetic: true }), active],
  );
  await pool.query(
    `INSERT INTO ${SCHEMA}.atlas_finding_intents
       (intent_id, intent_kind, public_number, payload_json, payload_sha256, status, created_at)
     VALUES ($1, 'accept', 'F-1001', $2::jsonb, $3, 'PENDING', $4)`,
    [ATLAS_INTENT_ID, JSON.stringify({ synthetic: true }), "2".repeat(64), active],
  );
}

async function afterHold(pool: Pool, before: Snapshot): Promise<void> {
  const now = await accounts(pool);
  // The earlier image parses notice_version as v1 or v2, or null, and a stored agreement's version the same way.
  for (const row of Object.values(now)) {
    const stored = row.agreement_json as Row;
    assert(row.notice_version === null || EARLIER_IMAGE_VERSIONS.includes(row.notice_version), "V3_ROW_REMAINS");
    assert(
      Object.keys(stored).length === 0 || EARLIER_IMAGE_VERSIONS.includes(stored.noticeVersion),
      "V3_AGREEMENT_REMAINS",
    );
  }
  for (const key of [KEYS.freeV3, KEYS.freeV3Reenrolls]) {
    const row = now[key];
    const prior = before.accounts[key];
    assert(row.status === "REVOKED" && row.mode === null && row.notice_version === null, "NOT_HELD");
    assert(JSON.stringify(row.agreement_json) === "{}", "AGREEMENT_NOT_CLEARED");
    assert(row.activated_at === null && row.revoked_at === row.updated_at, "MARKER_MISSING");
    assert(
      row.plain_answer_note === prior.plain_answer_note &&
        row.detailed_lesson_reports === prior.detailed_lesson_reports,
      "SETTINGS_CHANGED",
    );
  }
  for (const key of UNTOUCHED) {
    assert(JSON.stringify(now[key]) === JSON.stringify(before.accounts[key]), `CHANGED_${key[0]}`);
  }
  const held = await pool.query(`SELECT ${HOLD_COLUMNS} FROM ${SCHEMA}.${HOLD_TABLE} ORDER BY account_key`);
  assert(held.rows.length === 2, "HOLD_COUNT");
  for (const row of held.rows.map(normalize)) {
    assert(
      JSON.stringify(row) === JSON.stringify(holdColumns(before.accounts[row.account_key as string])),
      "HOLD_NOT_EXACT",
    );
  }
  const entitlement = await pool.query(
    `SELECT account_key FROM ${SCHEMA}.research_private_entitlements WHERE entitlement_id = $1`,
    [ENTITLEMENT_ID],
  );
  assert(entitlement.rows[0]?.account_key === KEYS.freeV3, "ENTITLEMENT_LOST");
  await assertOtherTablesUnchanged(pool, before);

  // The runtime role reads the account table but never the hold table.
  const access = new Pool({ connectionString: requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL") });
  try {
    await access.query(`SELECT count(*) FROM ${SCHEMA}.research_use_accounts`);
    assert(await denied(access), "HOLD_READABLE_BY_RUNTIME_ROLE");
  } finally {
    await access.end();
  }
  // The reader's default privileges reach new tables (the probe), but the hold
  // script removed its grant on the hold table.
  const reader = new Pool({ connectionString: requiredEnv("ASKRIGOR_READER_DATABASE_URL") });
  try {
    await reader.query(`SELECT count(*) FROM ${SCHEMA}.default_privilege_probe`);
    assert(await denied(reader), "HOLD_READABLE_BY_READER");
  } finally {
    await reader.end();
  }
}

async function denied(pool: Pool): Promise<boolean> {
  try {
    await pool.query(`SELECT count(*) FROM ${SCHEMA}.${HOLD_TABLE}`);
    return false;
  } catch (error) {
    return (error as { code?: string }).code === "42501";
  }
}

async function reenrollV2(pool: Pool): Promise<void> {
  // What the earlier image's acceptFreeContributor writes for a held account: its notice, v2.
  const at = "2026-10-22T12:00:00.000Z";
  const result = await pool.query(
    `UPDATE ${SCHEMA}.research_use_accounts
     SET status = 'ACTIVE', mode = 'FREE_CONTRIBUTOR', notice_version = $2,
         agreement_json = $3::jsonb, activated_at = $4, revoked_at = NULL, updated_at = $4
     WHERE account_key = $1`,
    [KEYS.freeV3Reenrolls, V2, agreement(V2), at],
  );
  assert(result.rowCount === 1, "REENROLL_FAILED");
}

async function afterRestore(pool: Pool, before: Snapshot): Promise<void> {
  const now = await accounts(pool);
  assert(JSON.stringify(now[KEYS.freeV3]) === JSON.stringify(before.accounts[KEYS.freeV3]), "NOT_RESTORED_EXACTLY");
  const reenrolled = now[KEYS.freeV3Reenrolls];
  assert(reenrolled.status === "ACTIVE" && reenrolled.notice_version === V2, "NEWER_ROW_OVERWRITTEN");
  for (const key of UNTOUCHED) {
    assert(JSON.stringify(now[key]) === JSON.stringify(before.accounts[key]), `CHANGED_${key[0]}`);
  }
  const held = await pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.${HOLD_TABLE}`);
  assert(held.rows[0].n === 0, "HOLD_NOT_EMPTIED");
  await assertOtherTablesUnchanged(pool, before);
}

/** The agreement the access service stores: the notice version and the four literal true fields. */
function agreement(noticeVersion: string): string {
  return JSON.stringify({
    noticeVersion,
    eligibleDeidentifiedResearchContributionRequired: true,
    prohibitedPrivateAndRawContentExcluded: true,
    proposalReviewAndNoAuthorityAcknowledged: true,
    paidPrivateAlternativeAcknowledged: true,
  });
}

async function accounts(pool: Pool): Promise<Accounts> {
  const result = await pool.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM ${SCHEMA}.research_use_accounts ORDER BY account_key`,
  );
  return Object.fromEntries(result.rows.map(normalize).map((row) => [row.account_key as string, row]));
}

function holdColumns(row: Row): Row {
  return Object.fromEntries(HOLD_COLUMNS.split(", ").map((column) => [column, row[column]]));
}

async function otherTables(pool: Pool): Promise<Tables> {
  const tables = await pool.query<{ name: string }>(
    `SELECT class.relname AS name
       FROM pg_class AS class
       JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
      WHERE namespace.nspname = $1
        AND class.relkind IN ('r', 'p')
        AND class.relname NOT IN ('research_use_accounts', $2)
      ORDER BY class.relname`,
    [SCHEMA, HOLD_TABLE],
  );
  const digests: Tables = {};
  for (const { name } of tables.rows) {
    const result = await pool.query<{ digest: string }>(
      `SELECT count(*) || ':' || coalesce(md5(string_agg(t::text, E'\\n' ORDER BY t::text)), '') AS digest
         FROM ${SCHEMA}."${name.replaceAll('"', '""')}" AS t`,
    );
    digests[name] = result.rows[0]!.digest;
  }
  return digests;
}

async function assertOtherTablesUnchanged(pool: Pool, before: Snapshot): Promise<void> {
  const now = await otherTables(pool);
  assert(Object.keys(now).join() === Object.keys(before.tables).join(), "OTHER_TABLES_CHANGED");
  for (const [name, digest] of Object.entries(now)) {
    assert(digest === before.tables[name], `OTHER_TABLE_CHANGED_${name}`);
  }
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
