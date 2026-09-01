import { Pool } from "pg";

import {
  PostgresEvidenceRepository,
  PostgresResearchContributorAccessStore,
  PostgresResearchContributionPromotionRunner,
  PostgresResearchContributionReviewStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
  deterministicUuid,
  type ContributionPrivacyBoundary,
} from "../packages/evidence-repository/src/index.js";
import {
  livingEvidenceFixture,
  researchFrontierFixture,
} from "./living-evidence-task-acceptance.mts";

const SCHEMA = "living_evidence";
const NOW = "2026-09-01T02:00:00.000Z";
const FREE_SUBJECT = "auth0|synthetic-postgres-free-user";
const PAID_SUBJECT = "auth0|synthetic-postgres-paid-user";
const REVIEW_SUBJECT = "auth0|synthetic-postgres-review-user";
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
      migration: "0010_research_contribution_review",
    })}\n`);
    return;
  }
  if (phase !== "verify") {
    throw new Error("EXPECTED_PHASE_MIGRATE_OR_VERIFY");
  }
  await verify(
    adminUrl,
    requiredEnv("ASKRIGOR_RESEARCH_ACCESS_DATABASE_URL"),
    requiredEnv("ASKRIGOR_RESEARCH_REVIEW_DATABASE_URL"),
  );
}

async function verify(
  adminUrl: string,
  accessUrl: string,
  reviewUrl: string,
): Promise<void> {
  const admin = new Pool({ connectionString: adminUrl });
  const restricted = new Pool({ connectionString: accessUrl });
  const reviewRestricted = new Pool({ connectionString: reviewUrl });
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
  const reviewStore = new PostgresResearchContributionReviewStore({
    connectionString: reviewUrl,
    schema: SCHEMA,
  });
  const reviewService = new ResearchContributionReviewService(reviewStore, {
    now: (() => {
      let second = 0;
      return () => `2026-09-01T03:00:${String(second++).padStart(2, "0")}.000Z`;
    })(),
    randomUuid: (() => {
      let sequence = 0;
      return () => deterministicUuid(`research-review-promotion:${sequence++}`);
    })(),
  });
  const writer = new PostgresEvidenceRepository({
    connectionString: adminUrl,
    schema: SCHEMA,
  });
  const runnerA = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T03:10:00.000Z" },
  );
  const runnerB = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T03:10:01.000Z" },
  );
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

    const reviewMigrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0010_research_contribution_review'`,
    );
    assert(reviewMigrationRows.rowCount === 1, "MIGRATION_0010_NOT_APPLIED");
    checks.push("migration_0010_applied");

    await expectPermissionDenied(() => reviewRestricted.query(
      `SELECT count(*) FROM ${SCHEMA}.research_contribution_proposals`,
    ));
    await expectPermissionDenied(() => reviewRestricted.query(
      `SELECT count(*) FROM ${SCHEMA}.analysis_versions`,
    ));
    await expectPermissionDenied(() => reviewRestricted.query(
      `UPDATE ${SCHEMA}.research_contribution_proposals
          SET status = 'REJECTED' WHERE true`,
    ));
    checks.push("review_role_has_function_only_no_table_or_canonical_authority");

    await service.acceptFreeContributor(REVIEW_SUBJECT, {
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      eligibleDeidentifiedResearchContributionRequired: true,
      prohibitedPrivateAndRawContentExcluded: true,
      proposalReviewAndNoAuthorityAcknowledged: true,
      paidPrivateAlternativeAcknowledged: true,
    });

    const sourceProposal = await service.submitProposal(REVIEW_SUBJECT, {
      proposalKind: "SOURCE_ANALYSIS",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: livingEvidenceFixture("research-review-source"),
    });
    const inspected = await reviewService.inspect(sourceProposal.record.proposalId);
    assert(inspected !== null, "REVIEW_PROPOSAL_NOT_INSPECTABLE");
    assert(
      !JSON.stringify(inspected).includes(sourceProposal.record.accountKey),
      "REVIEW_PROJECTION_LEAKED_ACCOUNT_KEY",
    );
    const acceptedSource = await reviewService.decide({
      proposalId: sourceProposal.record.proposalId,
      expectedPayloadSha256: sourceProposal.record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic exact-hash source analysis accepted.",
    });
    assert(acceptedSource.status === "ACCEPTED", "SOURCE_PROPOSAL_NOT_ACCEPTED");
    assert(acceptedSource.promotion?.status === "PENDING", "SOURCE_PROMOTION_NOT_PENDING");
    const concurrent = await Promise.all([
      runnerA.promoteNext(),
      runnerB.promoteNext(),
    ]);
    assert(
      concurrent.filter(({ status }) => status === "promoted").length === 1 &&
      concurrent.filter(({ status }) => status === "no_pending_promotion").length === 1,
      "CONCURRENT_PROMOTION_NOT_SINGLE_CLAIM",
    );
    const afterSource = await canonicalCounts(admin);
    assert(afterSource.analyses === canonicalBefore.analyses + 1, "SOURCE_NOT_PROMOTED");
    checks.push("source_accept_atomic_intent_and_concurrent_single_promotion");

    const frontierPayload = researchFrontierFixture("research-review-frontier-retry");
    const frontierProposal = await service.submitProposal(REVIEW_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: frontierPayload,
    });
    await reviewService.decide({
      proposalId: frontierProposal.record.proposalId,
      expectedPayloadSha256: frontierProposal.record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic exact-hash frontier accepted for retry proof.",
    });
    await expectMessage(
      () => runnerA.promoteNext("after_writer"),
      "INJECTED_FAILURE_AFTER_PROMOTION_WRITER",
    );
    const afterInjectedFailure = await reviewService.inspect(
      frontierProposal.record.proposalId,
    );
    assert(
      afterInjectedFailure?.promotion?.status === "PENDING",
      "PROMOTION_INTENT_NOT_RETRYABLE_AFTER_FAILURE",
    );
    const retry = await runnerA.promoteNext();
    assert(retry.status === "promoted", "PROMOTION_RETRY_DID_NOT_COMPLETE");
    assert(
      retry.receipt.canonicalWriterReceipt.status === "idempotent_replay",
      "PROMOTION_RETRY_DID_NOT_USE_WRITER_IDEMPOTENCY",
    );
    const afterFrontier = await canonicalCounts(admin);
    assert(afterFrontier.frontiers === canonicalBefore.frontiers + 1, "FRONTIER_NOT_PROMOTED");
    checks.push("writer_commit_before_receipt_recovers_by_idempotent_retry");

    const rejectedPayload = researchFrontierFixture("research-review-rejected");
    const rejectedProposal = await service.submitProposal(REVIEW_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: rejectedPayload,
    });
    const rejectedReview = await reviewService.decide({
      proposalId: rejectedProposal.record.proposalId,
      expectedPayloadSha256: rejectedProposal.record.payloadSha256,
      decision: "REJECT",
      reason: "Synthetic rejection retains no promotion intent.",
    });
    assert(rejectedReview.status === "REJECTED", "PROPOSAL_NOT_REJECTED");
    assert(rejectedReview.promotion === null, "REJECTED_PROPOSAL_HAS_PROMOTION");
    assert(
      (await runnerA.promoteNext()).status === "no_pending_promotion",
      "REJECTED_PROPOSAL_WAS_PROMOTABLE",
    );
    checks.push("reject_has_no_promotion_intent");

    const racePayload = researchFrontierFixture("research-review-withdraw-race");
    const raceProposal = await service.submitProposal(REVIEW_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: racePayload,
    });
    await Promise.allSettled([
      reviewService.decide({
        proposalId: raceProposal.record.proposalId,
        expectedPayloadSha256: raceProposal.record.payloadSha256,
        decision: "ACCEPT",
        reason: "Synthetic decision racing contributor withdrawal.",
      }),
      service.revoke(REVIEW_SUBJECT),
    ]);
    const raced = await reviewService.inspect(raceProposal.record.proposalId);
    assert(raced !== null, "RACED_PROPOSAL_MISSING");
    assert(
      (raced.status === "WITHDRAWN" && raced.promotion === null) ||
      (raced.status === "ACCEPTED" && raced.promotion !== null),
      "WITHDRAWAL_REVIEW_RACE_BROKE_ATOMICITY",
    );
    checks.push("withdrawal_review_race_has_atomic_terminal_state");

    process.stdout.write(`${JSON.stringify({
      status: "PASS",
      phase: "verify",
      checks,
      proposal_status_after_revoke: "WITHDRAWN",
      canonical_counts_unchanged_before_owner_acceptance: true,
      source_promotions: 1,
      frontier_promotions: 1,
    })}\n`);
  } finally {
    await Promise.allSettled([
      runnerA.close(),
      runnerB.close(),
      writer.close(),
      reviewStore.close(),
      store.close(),
      reviewRestricted.end(),
      restricted.end(),
      admin.end(),
    ]);
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

async function expectMessage(
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
  throw new Error(`EXPECTED_ERROR_MISSING expected=${expected}`);
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
