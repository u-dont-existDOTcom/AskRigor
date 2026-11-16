import { readFile, writeFile } from "node:fs/promises";

import { Pool } from "pg";

// Real-PostgreSQL acceptance for the notice v6 rollback scripts
// (infra/living-evidence-production/research-use-notice-v6-{hold,restore}.sql).
// The shell runner migrates a disposable database, runs the scripts with psql
// between these phases, and passes a snapshot file from `seed` onward.

const SCHEMA = "living_evidence";
const V1 = "free-contributor-v1-2026-09-01";
const V2 = "free-contributor-v2-2026-09-30";
const V3 = "free-contributor-v3-2026-10-22";
const V4 = "free-contributor-v4-2026-10-25";
const V5 = "free-contributor-v5-2026-11-05";
const V6 = "free-contributor-v6-2026-11-15";
// The earlier v5 image parses a stored notice version, and a stored agreement's, as one of these.
const EARLIER_IMAGE_VERSIONS: readonly unknown[] = [V1, V2, V3, V4, V5];
// How a free account's notice was accepted (migration 0031): by the person, or, for the owner's own login only, by the
// owner's standing instruction of 6 November 2026.
const PERSON = "PERSON";
const STANDING = "OWNER_STANDING_INSTRUCTION_2026_11_06";
const KEYS = {
  freeV6: "a".repeat(64),
  freeV2: "b".repeat(64),
  paid: "c".repeat(64),
  revoked: "d".repeat(64),
  freeV6Reenrolls: "e".repeat(64),
  freeV1: "f".repeat(64),
  freeV4: "9".repeat(64),
  freeV3: "8".repeat(64),
  freeV5: "7".repeat(64),
  // The owner's own login, whose v6 row the standing instruction accepted (owner answer 307b: v6 is material).
  ownerV6: "6".repeat(64),
} as const;
const HELD = [KEYS.freeV6, KEYS.ownerV6, KEYS.freeV6Reenrolls];
// Held accounts the person leaves alone, which the restore puts back.
const RESTORED = [KEYS.freeV6, KEYS.ownerV6];
const UNTOUCHED = [KEYS.freeV5, KEYS.freeV4, KEYS.freeV3, KEYS.freeV2, KEYS.freeV1, KEYS.paid, KEYS.revoked];
const ENTITLEMENT_ID = "00000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "00000000-0000-4000-8000-000000000002";
const ATLAS_INTENT_ID = "00000000-0000-4000-8000-000000000003";
const HOLD_TABLE = "research_use_notice_v6_hold";
const HOLD_COLUMNS =
  "account_key, status, mode, notice_version, agreement_json, activated_at, revoked_at, created_at, updated_at";
// How the notice was accepted. Neither script names the pair: the account table's trigger clears it when the hold
// moves activated_at, and the restore leaves it cleared, so a restored account reads as "not recorded".
const ACCEPTANCE_COLUMNS = "notice_accepted_by, notice_accepted_at";
// The account's two settings (migrations 0013 and 0015), which neither script reads or writes.
const ACCOUNT_COLUMNS = `${HOLD_COLUMNS}, ${ACCEPTANCE_COLUMNS}, plain_answer_note, detailed_lesson_reports`;

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
    } else if (phase === "reenroll-v5") {
      await reenrollV5(pool);
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
  const insert = `INSERT INTO ${SCHEMA}.research_use_accounts (${HOLD_COLUMNS}, ${ACCEPTANCE_COLUMNS})
    VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)`;
  const created = "2026-11-15T00:00:00.000Z";
  const active = "2026-11-15T00:05:00.000Z";
  // A free account as the current image writes it: how its notice was accepted, at the time it was activated.
  const free = async (key: string, version: string, acceptedBy: string = PERSON) => {
    await pool.query(insert, [
      key, "ACTIVE", "FREE_CONTRIBUTOR", version, agreement(version), active, null, created, active, acceptedBy, active,
    ]);
  };
  await free(KEYS.freeV6, V6);
  await free(KEYS.ownerV6, V6, STANDING);
  await free(KEYS.freeV5, V5);
  await free(KEYS.freeV4, V4);
  await free(KEYS.freeV3, V3);
  await free(KEYS.freeV2, V2);
  // A paid private account and a revoked one record no way of acceptance.
  await pool.query(insert, [
    KEYS.paid, "ACTIVE", "PAID_PRIVATE", null, "{}", active, null, created, active, null, null,
  ]);
  await pool.query(insert, [
    KEYS.revoked, "REVOKED", null, null, "{}", null, active, created, active, null, null,
  ]);
  await free(KEYS.freeV6Reenrolls, V6);
  await free(KEYS.freeV1, V1);
  // Settings away from their defaults, which the hold and the restore keep.
  await pool.query(
    `UPDATE ${SCHEMA}.research_use_accounts SET plain_answer_note = false, detailed_lesson_reports = true
      WHERE account_key = $1`,
    [KEYS.freeV6],
  );
  // Rows in other tables, which neither script may change: an entitlement and a pending proposal that reference the
  // v6 account (the hold is not a revocation, so the proposal stays pending), and a pending Atlas intent. Neither
  // script changes that intent.
  await pool.query(
    `INSERT INTO ${SCHEMA}.research_private_entitlements
       (entitlement_id, account_key, status, source, granted_at)
     VALUES ($1, $2, 'ACTIVE', 'OWNER_GRANTED', $3)`,
    [ENTITLEMENT_ID, KEYS.freeV6, active],
  );
  await pool.query(
    `INSERT INTO ${SCHEMA}.research_contribution_proposals
       (proposal_id, account_key, proposal_kind, payload_sha256, payload_json, privacy_boundary_json, partial,
        status, created_at)
     VALUES ($1, $2, 'RESEARCH_FRONTIER', $3, $4::jsonb, $4::jsonb, false, 'PENDING_REVIEW', $5)`,
    [PROPOSAL_ID, KEYS.freeV6, "1".repeat(64), JSON.stringify({ synthetic: true }), active],
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
  // The earlier image parses notice_version as v1 to v5, or null, and a stored agreement's version the same way.
  for (const row of Object.values(now)) {
    const stored = row.agreement_json as Row;
    assert(row.notice_version === null || EARLIER_IMAGE_VERSIONS.includes(row.notice_version), "V6_ROW_REMAINS");
    assert(
      Object.keys(stored).length === 0 || EARLIER_IMAGE_VERSIONS.includes(stored.noticeVersion),
      "V6_AGREEMENT_REMAINS",
    );
  }
  for (const key of HELD) {
    const row = now[key];
    const prior = before.accounts[key];
    assert(row.status === "REVOKED" && row.mode === null && row.notice_version === null, "NOT_HELD");
    assert(JSON.stringify(row.agreement_json) === "{}", "AGREEMENT_NOT_CLEARED");
    assert(row.activated_at === null && row.revoked_at === row.updated_at, "MARKER_MISSING");
    // The seed recorded how each was accepted; the hold moved activated_at, so the trigger cleared the pair.
    assert(
      prior.notice_accepted_by !== null && row.notice_accepted_by === null && row.notice_accepted_at === null,
      "ACCEPTANCE_NOT_CLEARED",
    );
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
  assert(held.rows.length === HELD.length, "HOLD_COUNT");
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
  assert(entitlement.rows[0]?.account_key === KEYS.freeV6, "ENTITLEMENT_LOST");
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

async function reenrollV5(pool: Pool): Promise<void> {
  // What the earlier image's acceptFreeContributor writes for a held account: its notice, v5, and, as every image
  // since migration 0031 does, that the person accepted it, at the same time.
  const at = "2026-11-15T02:00:00.000Z";
  const result = await pool.query(
    `UPDATE ${SCHEMA}.research_use_accounts
     SET status = 'ACTIVE', mode = 'FREE_CONTRIBUTOR', notice_version = $2,
         agreement_json = $3::jsonb, activated_at = $4, revoked_at = NULL, updated_at = $4,
         notice_accepted_by = $5, notice_accepted_at = $4
     WHERE account_key = $1`,
    [KEYS.freeV6Reenrolls, V5, agreement(V5), at, PERSON],
  );
  assert(result.rowCount === 1, "REENROLL_FAILED");
}

async function afterRestore(pool: Pool, before: Snapshot): Promise<void> {
  const now = await accounts(pool);
  for (const key of RESTORED) {
    const row = now[key];
    const prior = before.accounts[key];
    assert(
      JSON.stringify(withoutAcceptance(row)) === JSON.stringify(withoutAcceptance(prior)),
      "NOT_RESTORED_EXACTLY",
    );
    // How the notice was accepted is not held, so it is not put back: it reads as not recorded, never as a stale value.
    assert(row.notice_accepted_by === null && row.notice_accepted_at === null, "ACCEPTANCE_NOT_LEFT_UNRECORDED");
  }
  const reenrolled = now[KEYS.freeV6Reenrolls];
  assert(
    reenrolled.status === "ACTIVE" && reenrolled.notice_version === V5 && reenrolled.notice_accepted_by === PERSON,
    "NEWER_ROW_OVERWRITTEN",
  );
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

/** A row without how its notice was accepted, which neither script holds or puts back. */
function withoutAcceptance(row: Row): Row {
  const acceptance = ACCEPTANCE_COLUMNS.split(", ");
  return Object.fromEntries(Object.entries(row).filter(([column]) => !acceptance.includes(column)));
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
