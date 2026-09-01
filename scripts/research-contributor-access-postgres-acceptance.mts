import { Pool } from "pg";

import {
  PostgresEvidenceRepository,
  PostgresResearchContributorAccessStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributorAccessService,
  deterministicUuid,
  type ContributionPrivacyBoundary,
} from "../packages/evidence-repository/src/index.js";
import { researchFrontierFixture } from "./living-evidence-task-acceptance.mts";

const SCHEMA = "living_evidence";
const NOW = "2026-09-01T02:00:00.000Z";
const FREE_SUBJECT = "auth0|synthetic-postgres-free-user";
const PAID_SUBJECT = "auth0|synthetic-postgres-paid-user";
const IDENTITY_SECRET = new TextEncoder().encode(
  "synthetic-postgres-identity-secret-at-least-thirty-two-bytes",
);
const PRIVACY_BOUNDARY: ContributionPrivacyBoundary = {
  rawChatPersisted: false,
  promptPersisted: false,
  accountIdentityInPayload: false,
  privateHealthNarrativePersisted: false,
  uploadContentPersisted: false,
  rawSourceContentPersisted: false,
  rawProviderResponsePersisted: false,
  communityDataPersisted: false,
};

async function main(): Promise<void> {
  const phase = process.argv[2];
  const adminUrl = requiredEnv("DATABASE_URL");
  if (phase === "migrate") {
    const repository = new PostgresEvidenceRepository({
      connectionString: adminUrl,
      schema: SCHEMA,
    });
    try {
      await repository.migrate();
    } finally {
      await repository.close();
    }
    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      phase: "migrate",
      schema: SCHEMA,
      migration: "0009_research_contributor_access",
    })}\n`);
    return;
  }
  if (phase !== "verify") {
    throw new Error("EXPECTED_PHASE_MIGRATE_OR_VERIFY");
  }
  await verify(adminUrl, requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL"));
}

async function verify(adminUrl: string, accessUrl: string): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl });
  const restricted = new Pool({ connectionString: accessUrl });
  const store = new PostgresResearchContributorAccessStore({
    connectionString: accessUrl,
    schema: SCHEMA,
  });
  const service = new ResearchContributorAccessService({
    store,
    identitySecret: IDENTITY_SECRET,
    now: () => NOW,
    randomUuid: (() => {
      let sequence = 0;
      return () => deterministicUuid(`research-access-postgres:${sequence++}`);
    })(),
  });
  const checks: string[] = [];
  try {
    const migrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0009_research_contributor_access'`,
    );
    assert(migrationRows.rowCount === 1, "MIGRATION_0009_NOT_APPLIED");
    checks.push("migration_0009_applied");

    const canonicalBefore = await canonicalCounts(admin);
    const freeView = await service.acceptFreeContributor(FREE_SUBJECT, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });
    assert(freeView.mode === "FREE_CONTRIBUTOR", "FREE_MODE_NOT_ACTIVE");

    const frontier = researchFrontierFixture("research-access-postgres");
    const partialPass = frontier.frontier.passes[0]!;
    partialPass.status = "partial";
    partialPass.accessStatus = "partial";
    partialPass.exhausted = false;
    partialPass.nextCapability = "Continue the synthetic formal-source search.";
    const inserted = await service.submitProposal(FREE_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: frontier,
    });
    assert(inserted.status === "inserted", "PROPOSAL_NOT_INSERTED");
    assert(inserted.record.partial, "PARTIAL_CORPUS_LABEL_MISSING");
    assert(inserted.record.status === "PENDING_REVIEW", "PROPOSAL_NOT_PENDING");
    const replay = await service.submitProposal(FREE_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: frontier,
    });
    assert(replay.status === "idempotent_replay", "PROPOSAL_REPLAY_NOT_IDEMPOTENT");
    assert(replay.record.proposalId === inserted.record.proposalId, "PROPOSAL_REPLAY_ID_CHANGED");
    assertEqualCounts(await canonicalCounts(admin), canonicalBefore, "PROPOSAL_CHANGED_CANONICAL_TABLES");
    checks.push("free_partial_pending_idempotent_without_canonical_write");

    await expectPermissionDenied(() => restricted.query(
      `UPDATE ${SCHEMA}.research_contribution_proposals
          SET status = 'ACCEPTED', reviewed_at = now(), review_reason = 'forbidden'
        WHERE proposal_id = $1`,
      [inserted.record.proposalId],
    ));
    await expectPermissionDenied(() => restricted.query(
      `SELECT count(*) FROM ${SCHEMA}.analysis_versions`,
    ));
    await expectPermissionDenied(() => restricted.query(
      `CREATE TABLE ${SCHEMA}.forbidden_research_access_table (id integer)`,
    ));
    checks.push("restricted_role_cannot_review_read_canonical_or_create");

    await service.revoke(FREE_SUBJECT);
    const withdrawn = await admin.query<{ status: string; review_reason: string }>(
      `SELECT status, review_reason
         FROM ${SCHEMA}.research_contribution_proposals
        WHERE proposal_id = $1`,
      [inserted.record.proposalId],
    );
    assert(withdrawn.rows[0]?.status === "WITHDRAWN", "PENDING_PROPOSAL_NOT_WITHDRAWN");
    assert(
      withdrawn.rows[0]?.review_reason === "contributor_access_revoked",
      "WITHDRAWAL_REASON_MISMATCH",
    );
    await expectPgErrorMessage(() => restricted.query(
      `INSERT INTO ${SCHEMA}.research_contribution_proposals
        (proposal_id, account_key, proposal_kind, payload_sha256, payload_json,
         privacy_boundary_json, partial, status, created_at, reviewed_at,
         review_reason)
       SELECT $2, account_key, proposal_kind, $3, payload_json,
              privacy_boundary_json, partial, 'PENDING_REVIEW', $4, NULL, NULL
         FROM ${SCHEMA}.research_contribution_proposals
        WHERE proposal_id = $1`,
      [
        inserted.record.proposalId,
        deterministicUuid("late-proposal-after-revoke"),
        "a".repeat(64),
        NOW,
      ],
    ), "RESEARCH_PROPOSAL_ACCOUNT_NOT_FREE_ACTIVE");
    checks.push("atomic_revocation_withdraws_pending_and_database_blocks_late_insert");

    await service.revoke(PAID_SUBJECT);
    const paidKey = service.accountKeyForSubject(PAID_SUBJECT);
    await expectPermissionDenied(() => restricted.query(
      `INSERT INTO ${SCHEMA}.research_private_entitlements
        (entitlement_id, account_key, status, source, external_reference_sha256,
         granted_at, expires_at, revoked_at)
       VALUES ($1, $2, 'ACTIVE', 'OWNER_GRANTED', NULL, $3, NULL, NULL)`,
      [deterministicUuid("forbidden-entitlement"), paidKey, NOW],
    ));
    await admin.query(
      `INSERT INTO ${SCHEMA}.research_private_entitlements
        (entitlement_id, account_key, status, source, external_reference_sha256,
         granted_at, expires_at, revoked_at)
       VALUES ($1, $2, 'ACTIVE', 'OWNER_GRANTED', NULL, $3, NULL, NULL)`,
      [deterministicUuid("verified-entitlement"), paidKey, "2026-08-31T00:00:00.000Z"],
    );
    const paidView = await service.activatePaidPrivate(PAID_SUBJECT);
    assert(paidView.mode === "PAID_PRIVATE", "PAID_MODE_NOT_ACTIVE");
    await expectCode(
      () => service.submitProposal(PAID_SUBJECT, {
        proposalKind: "RESEARCH_FRONTIER",
        privacyBoundary: PRIVACY_BOUNDARY,
        payload: frontier,
      }),
      "PAID_PRIVATE_DOES_NOT_CONTRIBUTE",
    );
    assertEqualCounts(await canonicalCounts(admin), canonicalBefore, "PAID_MODE_CHANGED_CANONICAL_TABLES");
    checks.push("entitlement_admin_only_and_paid_private_contributes_nothing");

    const identityRows = await admin.query<{ account_key: string; body: string }>(
      `SELECT account_key, row_to_json(a)::text AS body
         FROM ${SCHEMA}.research_use_accounts a
        ORDER BY account_key`,
    );
    const persisted = JSON.stringify(identityRows.rows);
    assert(!persisted.includes(FREE_SUBJECT), "RAW_FREE_SUBJECT_PERSISTED");
    assert(!persisted.includes(PAID_SUBJECT), "RAW_PAID_SUBJECT_PERSISTED");
    assert(identityRows.rows.every(({ account_key }) => /^[a-f0-9]{64}$/u.test(account_key)),
      "ACCOUNT_KEY_NOT_HMAC_SHAPED");
    checks.push("only_hmac_identity_persisted");

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      phase: "verify",
      checks,
      proposal_status_after_revoke: "WITHDRAWN",
      canonical_counts_unchanged: true,
    })}\n`);
  } finally {
    await Promise.allSettled([store.close(), restricted.end(), admin.end()]);
  }
}

async function canonicalCounts(pool: Pool): Promise<Record<string, number>> {
  const result = await pool.query<{ analyses: number; frontiers: number }>(
    `SELECT
       (SELECT count(*)::int FROM ${SCHEMA}.analysis_versions) AS analyses,
       (SELECT count(*)::int FROM ${SCHEMA}.frontier_contributions) AS frontiers`,
  );
  return result.rows[0]!;
}

function assertEqualCounts(
  actual: Record<string, number>,
  expected: Record<string, number>,
  code: string,
): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), code);
}

async function expectPermissionDenied(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isPgCode(error, "42501")) return;
    throw error;
  }
  throw new Error("EXPECTED_POSTGRES_PERMISSION_DENIED");
}

async function expectCode(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === code) return;
    throw error;
  }
  throw new Error(`EXPECTED_ERROR_CODE_MISSING code=${code}`);
}

async function expectPgErrorMessage(
  action: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (
      typeof error === "object" && error !== null && "message" in error &&
      String(error.message).includes(expected)
    ) return;
    throw error;
  }
  throw new Error(`EXPECTED_POSTGRES_ERROR_MISSING expected=${expected}`);
}

function isPgCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name}_REQUIRED`);
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown PostgreSQL acceptance failure";
  process.stderr.write(`Research contributor PostgreSQL acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
