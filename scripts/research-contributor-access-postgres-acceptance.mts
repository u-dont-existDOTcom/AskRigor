import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { Pool } from "pg";

import {
  AtlasFindingPromotionRunner,
  AtlasReviewError,
  AtlasWriteConflict,
  PostgresAtlasPromotionStore,
  PostgresAtlasReader,
  PostgresAtlasReviewStore,
  PostgresAtlasWriter,
  PostgresEvidenceRepository,
  PostgresResearchContributorAccessStore,
  PostgresResearchContributionPromotionRunner,
  PostgresResearchContributionReviewStore,
  RESEARCH_MAP_CONSENT,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributionRejectedError,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
  atlasCurrentLabels,
  deterministicUuid,
  prepareAtlasFindingIntent,
  prepareResearchContributionProposal,
  type AtlasCardDecision,
  type AtlasCardItemKind,
  type AtlasFindingIntent,
  type AtlasFindingPromotionRun,
  type AtlasIntentView,
  type ContributionPrivacyBoundary,
  type LivingEvidenceContribution,
} from "../packages/evidence-repository/src/index.js";
import { readAtlasStateWith } from "../packages/evidence-repository/src/atlas-postgres.js";
import { buildStagedAnalysis } from "../apps/research-mcp/src/analysis-staging.js";
import { validateStudyMethodAudit } from "../apps/research-mcp/src/index.js";
import {
  livingEvidenceFixture,
  researchFrontierFixture,
  reusableStudyAuditFixture,
} from "./living-evidence-task-acceptance.mts";

const SCHEMA = "living_evidence";
const NOW = "2026-09-01T02:00:00.000Z";
const FREE_SUBJECT = "auth0|synthetic-postgres-free-user";
const PAID_SUBJECT = "auth0|synthetic-postgres-paid-user";
const REVIEW_SUBJECT = "auth0|synthetic-postgres-review-user";
const NOTICE_V2_SUBJECT = "auth0|synthetic-postgres-notice-v2-user";
const NOTICE_V2 = "free-contributor-v2-2026-09-30";
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
      migration: "0018_atlas_card_fields",
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
    requiredEnv("ASKRIGOR_LIVING_EVIDENCE_READER_DATABASE_URL"),
  );
}

async function verify(
  adminUrl: string,
  accessUrl: string,
  reviewUrl: string,
  readerUrl: string,
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

    // Owner answer 140b: the plain-answer note is a stored choice on the account row, on by default, which the
    // restricted role turns off and on, and which saving the account again leaves as it is.
    const noteMigrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0013_research_plain_answer_note'`,
    );
    assert(noteMigrationRows.rowCount === 1, "MIGRATION_0013_NOT_APPLIED");
    assert((await service.activeAccount(PAID_SUBJECT)).plainAnswerNote, "PLAIN_ANSWER_NOTE_NOT_ON_BY_DEFAULT");
    await service.setPlainAnswerNote(PAID_SUBJECT, false);
    assert(!(await service.activeAccount(PAID_SUBJECT)).plainAnswerNote, "PLAIN_ANSWER_NOTE_NOT_TURNED_OFF");
    await service.activatePaidPrivate(PAID_SUBJECT);
    assert(!(await service.activeAccount(PAID_SUBJECT)).plainAnswerNote, "PLAIN_ANSWER_NOTE_CHANGED_BY_SAVE");
    await service.setPlainAnswerNote(PAID_SUBJECT, true);
    assert((await service.activeAccount(PAID_SUBJECT)).plainAnswerNote, "PLAIN_ANSWER_NOTE_NOT_TURNED_ON");
    checks.push("plain_answer_note_stored_on_by_default_and_kept_by_save");

    // Owner question 154: detailed lesson reports are a stored choice on the account row, off by default, which the
    // restricted role turns on and off, which saving the account again leaves as it is, and which holds no report.
    const reportsMigrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0015_research_detailed_lesson_reports'`,
    );
    assert(reportsMigrationRows.rowCount === 1, "MIGRATION_0015_NOT_APPLIED");
    const reportsColumn = await admin.query<{ data_type: string; is_nullable: string; column_default: string }>(
      `SELECT data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'research_use_accounts' AND column_name = 'detailed_lesson_reports'`,
      [SCHEMA],
    );
    assert(
      reportsColumn.rows[0]?.data_type === "boolean" && reportsColumn.rows[0]?.is_nullable === "NO" &&
        reportsColumn.rows[0]?.column_default === "false",
      "DETAILED_LESSON_REPORTS_COLUMN_MISMATCH",
    );
    assert(!(await service.activeAccount(PAID_SUBJECT)).detailedLessonReports, "DETAILED_LESSON_REPORTS_NOT_OFF_BY_DEFAULT");
    await service.setDetailedLessonReports(PAID_SUBJECT, true);
    assert((await service.activeAccount(PAID_SUBJECT)).detailedLessonReports, "DETAILED_LESSON_REPORTS_NOT_TURNED_ON");
    assert((await service.activeAccount(PAID_SUBJECT)).plainAnswerNote, "PLAIN_ANSWER_NOTE_CHANGED_BY_REPORTS");
    await service.activatePaidPrivate(PAID_SUBJECT);
    assert((await service.activeAccount(PAID_SUBJECT)).detailedLessonReports, "DETAILED_LESSON_REPORTS_CHANGED_BY_SAVE");
    await service.setDetailedLessonReports(PAID_SUBJECT, false);
    assert(!(await service.activeAccount(PAID_SUBJECT)).detailedLessonReports, "DETAILED_LESSON_REPORTS_NOT_TURNED_OFF");
    await expectCode(() => service.setDetailedLessonReports(FREE_SUBJECT, true), "RESEARCH_ACCESS_REVOKED");
    const freeReports = await admin.query<{ detailed_lesson_reports: boolean }>(
      `SELECT detailed_lesson_reports FROM ${SCHEMA}.research_use_accounts WHERE account_key = $1`,
      [service.accountKeyForSubject(FREE_SUBJECT)],
    );
    assert(freeReports.rows[0]?.detailed_lesson_reports === false, "REVOKED_ACCOUNT_DETAILED_LESSON_REPORTS_CHANGED");
    checks.push("detailed_lesson_reports_stored_off_by_default_and_kept_by_save");

    // Owner answers 159 (1b and 7) and 160b: the third free contributor notice. The account table admits the three
    // versions and nothing else, and an account that accepted v2 before this release accepts v3 before free research.
    const noticeV3MigrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0016_research_use_notice_v3'`,
    );
    assert(noticeV3MigrationRows.rowCount === 1, "MIGRATION_0016_NOT_APPLIED");
    assert(RESEARCH_USE_NOTICE_VERSION === "free-contributor-v3-2026-10-22", "NOTICE_V3_NOT_CURRENT");
    await service.acceptFreeContributor(NOTICE_V2_SUBJECT, FREE_AGREEMENT);
    const noticeV2Key = service.accountKeyForSubject(NOTICE_V2_SUBJECT);
    // The row as an account that accepted v2 before this release holds it.
    await admin.query(
      `UPDATE ${SCHEMA}.research_use_accounts
          SET notice_version = $2,
              agreement_json = jsonb_set(agreement_json, '{noticeVersion}', to_jsonb($2::text))
        WHERE account_key = $1`,
      [noticeV2Key, NOTICE_V2],
    );
    const noticeV2View = await service.inspect(NOTICE_V2_SUBJECT);
    assert(
      noticeV2View.status === "UNENROLLED" && noticeV2View.noticeVersion === RESEARCH_USE_NOTICE_VERSION,
      "NOTICE_V2_ACCOUNT_NOT_SHOWN_V3",
    );
    await expectCode(() => service.requireActive(NOTICE_V2_SUBJECT), "RESEARCH_ACCESS_REQUIRED");
    await service.acceptFreeContributor(NOTICE_V2_SUBJECT, FREE_AGREEMENT);
    assert(await service.requireActive(NOTICE_V2_SUBJECT) === "FREE_CONTRIBUTOR", "NOTICE_V3_NOT_ACCEPTED");
    const noticeV3Row = await admin.query<{ notice_version: string; agreement_json: { noticeVersion?: unknown } }>(
      `SELECT notice_version, agreement_json FROM ${SCHEMA}.research_use_accounts WHERE account_key = $1`,
      [noticeV2Key],
    );
    assert(
      noticeV3Row.rows[0]?.notice_version === RESEARCH_USE_NOTICE_VERSION &&
        noticeV3Row.rows[0]?.agreement_json.noticeVersion === RESEARCH_USE_NOTICE_VERSION,
      "NOTICE_V3_ROW_MISMATCH",
    );
    await expectPgErrorMessage(() => admin.query(
      `UPDATE ${SCHEMA}.research_use_accounts
          SET notice_version = 'free-contributor-v4-2026-12-31'
        WHERE account_key = $1`,
      [noticeV2Key],
    ), "research_use_accounts_free_notice_check");
    checks.push("notice_v3_admitted_and_a_v2_account_accepts_it_before_research");

    // Owner answer 143a: a paid private account files only this research's map, and only under the user's yes to the
    // answer's offer. The database stores that finalization receipt's SHA-256, never the receipt, and takes it once;
    // its own guard refuses a paid private row without it and anything but a map with it.
    const consentMigrationRows = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${SCHEMA}.schema_migrations
       WHERE migration_id = '0014_research_map_consent'`,
    );
    assert(consentMigrationRows.rowCount === 1, "MIGRATION_0014_NOT_APPLIED");
    const consentReceipt = "synthetic-postgres-finalization-receipt";
    const consentSha256 = createHash("sha256").update(consentReceipt).digest("hex");
    const mapInput = {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: frontier,
      userConsent: RESEARCH_MAP_CONSENT,
      finalizationReceipt: consentReceipt,
    };
    await expectCode(() => service.submitProposal(PAID_SUBJECT, mapInput), "PAID_PRIVATE_DOES_NOT_CONTRIBUTE");
    await expectCode(
      () => service.submitProposal(PAID_SUBJECT, mapInput, { paidPrivateConsent: { receiptSha256: "0".repeat(64) } }),
      "PAID_PRIVATE_DOES_NOT_CONTRIBUTE",
    );
    const map = await service.submitProposal(PAID_SUBJECT, mapInput, {
      paidPrivateConsent: { receiptSha256: consentSha256 },
    });
    const mapReplay = await service.submitProposal(PAID_SUBJECT, mapInput, {
      paidPrivateConsent: { receiptSha256: consentSha256 },
    });
    assert(mapReplay.record.proposalId === map.record.proposalId, "PAID_MAP_REPLAY_NOT_IDEMPOTENT");
    const storedMap = await admin.query<{ consent_receipt_sha256: string; proposal_kind: string; status: string }>(
      `SELECT consent_receipt_sha256, proposal_kind, status
         FROM ${SCHEMA}.research_contribution_proposals
        WHERE proposal_id = $1`,
      [map.record.proposalId],
    );
    assert(
      storedMap.rows[0]?.consent_receipt_sha256 === consentSha256 &&
        storedMap.rows[0]?.proposal_kind === "RESEARCH_FRONTIER" &&
        storedMap.rows[0]?.status === "PENDING_REVIEW",
      "PAID_MAP_NOT_STORED_WITH_ITS_CONSENT",
    );
    const copyMap = (proposalId: string, payloadSha256: string, consent: string | null, kind: string) =>
      restricted.query(
        `INSERT INTO ${SCHEMA}.research_contribution_proposals
          (proposal_id, account_key, proposal_kind, payload_sha256, payload_json,
           privacy_boundary_json, partial, status, created_at, reviewed_at,
           review_reason, consent_receipt_sha256)
         SELECT $2, account_key, $5, $3, payload_json,
                privacy_boundary_json, partial, 'PENDING_REVIEW', $6, NULL, NULL, $4
           FROM ${SCHEMA}.research_contribution_proposals
          WHERE proposal_id = $1`,
        [map.record.proposalId, proposalId, payloadSha256, consent, kind, NOW],
      );
    await expectPgErrorMessage(
      () => copyMap(deterministicUuid("paid-map-without-consent"), "b".repeat(64), null, "RESEARCH_FRONTIER"),
      "RESEARCH_PROPOSAL_PAID_PRIVATE_CONSENT_REQUIRED",
    );
    await expectPgErrorMessage(
      () => copyMap(deterministicUuid("paid-analysis-with-consent"), "c".repeat(64), "d".repeat(64), "SOURCE_ANALYSIS"),
      "RESEARCH_PROPOSAL_PAID_PRIVATE_CONSENT_REQUIRED",
    );
    await expectPgCode(
      () => copyMap(deterministicUuid("paid-map-same-consent"), "e".repeat(64), consentSha256, "RESEARCH_FRONTIER"),
      "23505",
    );
    assertEqualCounts(await canonicalCounts(admin), canonicalBefore, "PAID_MAP_CHANGED_CANONICAL_TABLES");
    // Revoking the paid account withdraws its pending map like any other pending proposal.
    await service.revoke(PAID_SUBJECT);
    const withdrawnMap = await admin.query<{ status: string }>(
      `SELECT status FROM ${SCHEMA}.research_contribution_proposals WHERE proposal_id = $1`,
      [map.record.proposalId],
    );
    assert(withdrawnMap.rows[0]?.status === "WITHDRAWN", "PAID_MAP_NOT_WITHDRAWN_ON_REVOKE");
    checks.push("paid_private_map_filed_once_only_under_the_users_yes");

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

    await verifyPromotionFailures({
      adminUrl,
      admin,
      reviewRestricted,
      service,
      reviewService,
      writer,
      checks,
    });
    await verifyExactContinuation({ adminUrl, readerUrl, service, reviewService, writer, checks });
    await verifyTwoAuditsOfOneStudy({ adminUrl, readerUrl, admin, service, reviewService, writer, checks });
    await verifySupersession({ admin, reviewRestricted, service, reviewService, checks });
    await verifyRelatedAndPreflight({ adminUrl, readerUrl, reviewRestricted, service, reviewService, writer, checks });
    await verifyTopicLinks({ adminUrl, readerUrl, admin, service, reviewService, writer, checks });
    await verifyAtlasMigrations({ adminUrl, schema: SCHEMA, checks });
    await verifyAtlasStorage({ adminUrl, reviewUrl, readerUrl, schema: SCHEMA, checks });
    await verifyAtlasScenario({ adminUrl, schema: SCHEMA, checks });
    await verifyAtlasCardFields({ adminUrl, schema: SCHEMA, checks });

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

const PROMOTION_SUBJECT = "auth0|synthetic-postgres-promotion-user";
const FREE_AGREEMENT = {
  noticeVersion: RESEARCH_USE_NOTICE_VERSION,
  eligibleDeidentifiedResearchContributionRequired: true,
  prohibitedPrivateAndRawContentExcluded: true,
  proposalReviewAndNoAuthorityAcknowledged: true,
  paidPrivateAlternativeAcknowledged: true,
} as const;

/**
 * Owner answer 138b: stored times compare as instants, a deterministic conflict ends its intent FAILED with its code
 * while the activation moves on to the next intent, and a transient error leaves the intent pending.
 */
async function verifyPromotionFailures(context: {
  adminUrl: string;
  admin: Pool;
  reviewRestricted: Pool;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  writer: PostgresEvidenceRepository;
  checks: string[];
}): Promise<void> {
  const { adminUrl, admin, reviewRestricted, service, reviewService, writer, checks } = context;
  const migration = await admin.query(
    `SELECT migration_id FROM ${SCHEMA}.schema_migrations
     WHERE migration_id = '0012_research_contribution_merging'`,
  );
  assert(migration.rowCount === 1, "MIGRATION_0012_NOT_APPLIED");
  checks.push("migration_0012_applied");

  await service.acceptFreeContributor(PROMOTION_SUBJECT, FREE_AGREEMENT);
  const promotionClock = () => "2026-09-01T03:30:00.000Z";
  const runner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: promotionClock },
  );
  const transient = Object.assign(
    new Error("could not serialize access due to concurrent update"),
    { code: "40001" },
  );
  const flakyRunner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    {
      contribute: async () => { throw transient; },
      contributeFrontier: async () => { throw transient; },
      contributeTopicLink: async () => { throw transient; },
    },
    { now: promotionClock },
  );
  const accepted = async (
    proposalKind: "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS",
    payload: unknown,
  ) => {
    const submitted = await service.submitProposal(PROMOTION_SUBJECT, {
      proposalKind,
      privacyBoundary: PRIVACY_BOUNDARY,
      payload,
    });
    assert(submitted.status === "inserted", "PROMOTION_CHECK_PROPOSAL_NOT_INSERTED");
    await reviewService.decide({
      proposalId: submitted.record.proposalId,
      expectedPayloadSha256: submitted.record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic exact-hash promotion check.",
    });
    return submitted.record;
  };
  try {
    // The shapes the two held filings use (no milliseconds), and the other shapes the contract accepts.
    for (const [shape, startedAt, completedAt] of [
      ["no_milliseconds", "2026-10-20T22:54:00Z", "2026-10-20T23:10:00Z"],
      ["offset", "2026-10-21T00:54:00+02:00", "2026-10-21T01:10:00+02:00"],
      ["microseconds", "2026-10-20T22:54:00.123456Z", "2026-10-20T23:10:00.654321Z"],
    ] as const) {
      const payload = researchFrontierFixture(`promotion-time-${shape}`);
      payload.run.startedAt = startedAt;
      payload.run.completedAt = completedAt;
      const proposal = await accepted("RESEARCH_FRONTIER", payload);
      const run = await runner.promoteAccepted();
      assert(
        run.failed.length === 0 && run.result.status === "promoted" &&
        run.result.receipt.proposalId === proposal.proposalId &&
        run.result.receipt.canonicalWriterReceipt.status === "inserted",
        `PROMOTION_TIME_SHAPE_NOT_PROMOTED shape=${shape}`,
      );
      const replay = await writer.contributeFrontier(payload);
      assert(replay.status === "idempotent_replay", `PROMOTION_TIME_SHAPE_REPLAY_FAILED shape=${shape}`);
    }
    const source = livingEvidenceFixture("promotion-time-source");
    source.run.startedAt = "2026-08-29T12:00:00Z";
    source.run.completedAt = "2026-08-29T14:01:00+02:00";
    source.source!.retrievedAt = "2026-08-29T11:59:00Z";
    const sourceProposal = await accepted("SOURCE_ANALYSIS", source);
    const sourceRun = await runner.promoteAccepted();
    assert(
      sourceRun.failed.length === 0 && sourceRun.result.status === "promoted" &&
      sourceRun.result.receipt.proposalId === sourceProposal.proposalId,
      "PROMOTION_SOURCE_TIME_SHAPE_NOT_PROMOTED",
    );
    assert((await writer.contribute(source)).status === "idempotent_replay", "PROMOTION_SOURCE_TIME_REPLAY_FAILED");
    checks.push("run_and_retrieval_times_in_any_valid_shape_promote_and_replay");

    // The same run with a different instant still conflicts; the next accepted intent promotes in the same run.
    const conflicting = researchFrontierFixture("promotion-conflict-run");
    conflicting.run = {
      ...researchFrontierFixture("promotion-time-no_milliseconds").run,
      startedAt: "2026-10-20T22:54:00.001Z",
      completedAt: "2026-10-20T23:10:00Z",
    };
    const conflictProposal = await accepted("RESEARCH_FRONTIER", conflicting);
    const keyed = researchFrontierFixture("promotion-conflict-topic-key");
    keyed.topic.canonicalKey = researchFrontierFixture("promotion-time-offset").topic.canonicalKey;
    const keyedProposal = await accepted("RESEARCH_FRONTIER", keyed);
    const afterConflicts = await accepted("RESEARCH_FRONTIER", researchFrontierFixture("promotion-after-conflicts"));
    const moved = await runner.promoteAccepted();
    assert(
      moved.failed.map(({ proposalId, failureCode }) => `${proposalId}:${failureCode}`).join(",") ===
        `${conflictProposal.proposalId}:RESEARCH_RUN_CONFLICT,${keyedProposal.proposalId}:TOPIC_KEY_CONFLICT`,
      "PROMOTION_CONFLICTS_NOT_FAILED_WITH_CODES",
    );
    assert(
      moved.result.status === "promoted" && moved.result.receipt.proposalId === afterConflicts.proposalId,
      "PROMOTION_QUEUE_DID_NOT_MOVE_ON",
    );
    const failedView = await reviewService.inspect(conflictProposal.proposalId);
    assert(
      failedView?.status === "ACCEPTED" && failedView.promotion?.status === "FAILED" &&
      failedView.promotion.failureCode === "RESEARCH_RUN_CONFLICT" &&
      failedView.promotion.failedAt === promotionClock() &&
      failedView.promotion.receipt === null,
      "PROMOTION_FAILURE_NOT_VISIBLE_IN_REVIEW",
    );
    const unwritten = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${SCHEMA}.frontier_contributions
        WHERE contribution_id = ANY($1::uuid[])`,
      [[conflicting.contributionId, keyed.contributionId]],
    );
    assert(unwritten.rows[0]?.count === 0, "FAILED_PROMOTION_WROTE_CANONICAL_ROWS");
    assert((await runner.promoteAccepted()).result.status === "no_pending_promotion", "FAILED_INTENT_STILL_PENDING");
    const reviewContext = await reviewRestricted.query<{ context: unknown }>(
      `SELECT ${SCHEMA}.inspect_research_contribution_context($1::uuid) AS context`,
      [conflictProposal.proposalId],
    );
    assert(
      JSON.stringify(reviewContext.rows[0]?.context).includes("RESEARCH_RUN_CONFLICT") &&
      !JSON.stringify(reviewContext.rows).includes(conflictProposal.accountKey),
      "REVIEW_ROLE_CONTEXT_MISSING_FAILURE_OR_LEAKED_ACCOUNT_KEY",
    );
    checks.push("deterministic_conflict_fails_with_code_and_next_intent_promotes_in_same_run");

    // A transient error leaves the intent pending, and the state stays closed to free text.
    const transientProposal = await accepted("RESEARCH_FRONTIER", researchFrontierFixture("promotion-transient"));
    await expectMessage(() => flakyRunner.promoteAccepted(), "could not serialize access");
    const pending = await reviewService.inspect(transientProposal.proposalId);
    assert(pending?.promotion?.status === "PENDING", "TRANSIENT_PROMOTION_ERROR_DID_NOT_STAY_PENDING");
    await expectPgCode(() => admin.query(
      `UPDATE ${SCHEMA}.research_contribution_promotions
          SET status = 'FAILED', failure_code = 'any free text', failed_at = $2::timestamptz
        WHERE promotion_id = $1::uuid`,
      [pending.promotion.promotionId, promotionClock()],
    ), "23514");
    await expectPgCode(() => admin.query(
      `UPDATE ${SCHEMA}.research_contribution_promotions
          SET status = 'FAILED', failure_code = 'RESEARCH_RUN_CONFLICT'
        WHERE promotion_id = $1::uuid`,
      [pending.promotion.promotionId],
    ), "23514");
    const recovered = await runner.promoteAccepted();
    assert(
      recovered.failed.length === 0 && recovered.result.status === "promoted" &&
      recovered.result.receipt.proposalId === transientProposal.proposalId,
      "TRANSIENT_PROMOTION_NOT_RECOVERED",
    );
    checks.push("transient_error_stays_pending_and_failure_state_is_closed");
  } finally {
    await Promise.allSettled([runner.close(), flakyRunner.close()]);
  }
}

/**
 * Owner answer 138b: a frontier sent with new UUIDs for a canonical topic key, question, lane key and candidate
 * identity continues those records when it is filed, through the public runtime's read-only reader role, and
 * promotes; filed as sent, the same frontier ends FAILED with TOPIC_KEY_CONFLICT.
 */
async function verifyExactContinuation(context: {
  adminUrl: string;
  readerUrl: string;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  writer: PostgresEvidenceRepository;
  checks: string[];
}): Promise<void> {
  const { adminUrl, readerUrl, service, reviewService, writer, checks } = context;
  const reader = new PostgresEvidenceRepository({ connectionString: readerUrl, schema: SCHEMA });
  const runner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T03:40:00.000Z" },
  );
  try {
    const canonical = researchFrontierFixture("promotion-time-no_milliseconds");
    const continuation = researchFrontierFixture("continuation-of-canonical");
    continuation.topic.canonicalKey = canonical.topic.canonicalKey;
    continuation.topic.label = "A wording the canonical label replaces";
    const sentPayloadSha256 = prepareResearchContributionProposal("RESEARCH_FRONTIER", continuation).payloadSha256;
    const filed = await service.submitProposal(PROMOTION_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: continuation,
    }, { canonical: reader });
    assert(filed.status === "inserted" && filed.canonicalCheck === "checked", "CONTINUATION_NOT_CHECKED");
    assert(
      filed.reconciled.map(({ path, to }) => `${path}=${to}`).join(",") === [
        `payload.topic.topicId=${canonical.topic.topicId}`,
        `payload.question.questionId=${canonical.question.questionId}`,
        `payload.frontier.frontierId=${canonical.frontier.frontierId}`,
        `payload.frontier.lanes[0].laneId=${canonical.frontier.lanes[0]!.laneId}`,
        `payload.frontier.candidateVersions[0].candidateId=${canonical.frontier.candidateVersions[0]!.candidateId}`,
        `payload.frontier.candidateVersions[0].previousVersionId=${canonical.frontier.candidateVersions[0]!.versionId}`,
      ].join(","),
      "CONTINUATION_RECONCILED_IDS_MISMATCH",
    );
    assert(filed.record.payloadSha256 !== sentPayloadSha256, "CONTINUATION_HASH_NOT_OF_STORED_RECORD");
    await reviewService.decide({
      proposalId: filed.record.proposalId,
      expectedPayloadSha256: filed.record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic exact continuation of a canonical frontier.",
    });
    const promoted = await runner.promoteAccepted();
    assert(
      promoted.failed.length === 0 && promoted.result.status === "promoted" &&
      promoted.result.receipt.proposalId === filed.record.proposalId,
      "CONTINUATION_NOT_PROMOTED",
    );
    const snapshot = await writer.getResearchFrontier({ frontierId: canonical.frontier.frontierId, includeHistory: true });
    const frontier = (snapshot.frontiers as Array<{
      topic: { label: string };
      contribution_receipts: unknown[];
      lanes: unknown[];
      current_candidates: Array<{ version_id: string }>;
      history: { candidate_versions: Array<{ version_id: string; previous_version_id: string | null }> };
    }>)[0]!;
    assert(
      frontier.contribution_receipts.length === 2 && frontier.lanes.length === 1 &&
      frontier.current_candidates.length === 1 &&
      frontier.current_candidates[0]!.version_id === continuation.frontier.candidateVersions[0]!.versionId &&
      frontier.history.candidate_versions.length === 2 &&
      frontier.topic.label === canonical.topic.label,
      "CONTINUATION_NOT_ONE_CANONICAL_RECORD",
    );
    checks.push("new_uuids_for_canonical_topic_question_lane_and_candidate_continue_the_record_and_promote");

    // The same frontier filed as sent meets the canonical key under a new UUID at promotion.
    const unreconciled = researchFrontierFixture("continuation-filed-as-sent");
    unreconciled.topic.canonicalKey = canonical.topic.canonicalKey;
    const asSent = await service.submitProposal(PROMOTION_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER",
      privacyBoundary: PRIVACY_BOUNDARY,
      payload: unreconciled,
    });
    assert(asSent.canonicalCheck === undefined && asSent.reconciled.length === 0, "UNRECONCILED_CONTROL_RECONCILED");
    await reviewService.decide({
      proposalId: asSent.record.proposalId,
      expectedPayloadSha256: asSent.record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic control filed without reconciliation.",
    });
    const control = await runner.promoteAccepted();
    assert(
      control.failed.length === 1 && control.failed[0]!.failureCode === "TOPIC_KEY_CONFLICT" &&
      control.result.status === "no_pending_promotion",
      "UNRECONCILED_CONTROL_DID_NOT_FAIL_WITH_TOPIC_KEY_CONFLICT",
    );
    checks.push("the_same_frontier_filed_as_sent_fails_with_topic_key_conflict");
  } finally {
    await Promise.allSettled([reader.close(), runner.close()]);
  }
}

/**
 * Owner answer 138b: two free accounts' audits of one DOI, both pending at once, promote as two analyses of one source
 * version; a later audit, staged with the reader, joins the canonical family; an audit the store already holds is not
 * filed again; and the same audit staged again at another time is filed once.
 */
async function verifyTwoAuditsOfOneStudy(context: {
  adminUrl: string;
  readerUrl: string;
  admin: Pool;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  writer: PostgresEvidenceRepository;
  checks: string[];
}): Promise<void> {
  const { adminUrl, readerUrl, admin, service, reviewService, writer, checks } = context;
  const reader = new PostgresEvidenceRepository({ connectionString: readerUrl, schema: SCHEMA });
  const runner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T03:50:00.000Z" },
  );
  const { index, audit } = reusableStudyAuditFixture("two-audits-of-one-study");
  const reworded = (finding: string) => ({
    ...audit,
    domain_findings: audit.domain_findings.map((domain, position) =>
      position === 0 ? { ...domain, plain_language_finding: finding } : domain),
  });
  const audits = [audit, reworded("A second reader's bounded finding."), reworded("A third reader's bounded finding.")];
  const stage = async (submission: typeof audit, at: string, canonical?: PostgresEvidenceRepository) => {
    const staged = await buildStagedAnalysis({
      kind: "study",
      index,
      auditReceipt: validateStudyMethodAudit(index, submission),
      crossref: { mailto: "" },
      now: () => new Date(at),
      protocolManifests: async () => researchFrontierFixture("protocols").run.protocolManifests,
      checkIntegrity: async () => ({
        provider: "crossref",
        access_status: "metadata_only",
        data: { doi: index.source.doi!, status: "no_retraction_record_found", evidence: [], sources_checked: ["crossref"] },
      }) as never,
      ...(canonical === undefined ? {} : { canonical }),
    });
    if (!staged.ready) throw new Error(`STUDY_AUDIT_NOT_STAGED reason=${staged.reason}`);
    return staged;
  };
  const file = async (contribution: unknown) => service.submitProposal(PROMOTION_SUBJECT, {
    proposalKind: "SOURCE_ANALYSIS",
    privacyBoundary: PRIVACY_BOUNDARY,
    payload: contribution,
  }, { serverBuilt: true });
  const accept = async (record: { proposalId: string; payloadSha256: string }) => reviewService.decide({
    proposalId: record.proposalId,
    expectedPayloadSha256: record.payloadSha256,
    decision: "ACCEPT",
    reason: "Synthetic audit of a study another audit also covers.",
  });
  try {
    const first = await file((await stage(audits[0]!, "2026-10-21T01:00:00.000Z")).contribution);
    const second = await file((await stage(audits[1]!, "2026-10-21T02:30:00.000Z")).contribution);
    assert(first.status === "inserted" && second.status === "inserted", "TWO_AUDITS_NOT_FILED");
    await accept(first.record);
    await accept(second.record);
    const both = await runner.promoteAccepted();
    const afterFirst = await runner.promoteAccepted();
    assert(
      both.failed.length === 0 && afterFirst.failed.length === 0 &&
      both.result.status === "promoted" && afterFirst.result.status === "promoted",
      "TWO_AUDITS_OF_ONE_STUDY_COLLIDED",
    );
    const family = (first.record.payload as LivingEvidenceContribution).source!.familyId;
    const stored = await admin.query<{ analyses: number; versions: number }>(
      `SELECT (SELECT count(*)::int FROM ${SCHEMA}.analyses WHERE source_family_id = $1) AS analyses,
              (SELECT count(*)::int FROM ${SCHEMA}.source_versions WHERE family_id = $1) AS versions`,
      [family],
    );
    assert(stored.rows[0]?.analyses === 2 && stored.rows[0].versions === 1, "TWO_AUDITS_NOT_ONE_STUDY_RECORD");
    checks.push("two_pending_audits_of_one_doi_promote_as_two_analyses_of_one_source_version");

    const third = await stage(audits[2]!, "2026-10-21T04:00:00.000Z", reader);
    assert(third.contribution.source!.familyId === family && third.alreadyCanonical === undefined, "THIRD_AUDIT_NOT_RESOLVED");
    const thirdFiled = await file(third.contribution);
    await accept(thirdFiled.record);
    const thirdRun = await runner.promoteAccepted();
    assert(thirdRun.failed.length === 0 && thirdRun.result.status === "promoted", "THIRD_AUDIT_NOT_PROMOTED");
    const again = await stage(audits[0]!, "2026-10-21T05:00:00.000Z", reader);
    assert(again.alreadyCanonical === true, "CANONICAL_AUDIT_NOT_RECOGNIZED");
    const restaged = await file((await stage(audits[1]!, "2026-10-21T06:00:00.000Z")).contribution);
    assert(
      restaged.status === "idempotent_replay" && restaged.record.proposalId === second.record.proposalId,
      "RESTAGED_AUDIT_FILED_AGAIN",
    );
    checks.push("a_later_audit_joins_the_canonical_family_and_a_known_audit_is_not_filed_again");
  } finally {
    await Promise.allSettled([reader.close(), runner.close()]);
  }
}

/**
 * Owner answer 138b: a finished version names the account's own pending draft; the database refuses any other target
 * with one answer, and accepting the finished version rejects the draft, "superseded by <id>", in the same decision.
 */
async function verifySupersession(context: {
  admin: Pool;
  reviewRestricted: Pool;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  checks: string[];
}): Promise<void> {
  const { admin, reviewRestricted, service, reviewService, checks } = context;
  const otherSubject = "auth0|synthetic-postgres-other-contributor";
  await service.acceptFreeContributor(otherSubject, FREE_AGREEMENT);
  const submit = (subject: string, namespace: string, supersedesProposalId?: string) => service.submitProposal(subject, {
    proposalKind: "RESEARCH_FRONTIER",
    privacyBoundary: PRIVACY_BOUNDARY,
    payload: researchFrontierFixture(namespace),
    ...(supersedesProposalId === undefined ? {} : { supersedesProposalId }),
  });
  const draft = await submit(PROMOTION_SUBJECT, "supersession-draft");
  const others = await submit(otherSubject, "supersession-other-account");
  const finished = await submit(PROMOTION_SUBJECT, "supersession-finished", draft.record.proposalId);
  assert(finished.record.supersedesProposalId === draft.record.proposalId, "SUPERSEDES_LINK_NOT_STORED");
  const refusals = [];
  for (const target of [others.record.proposalId, deterministicUuid("supersession-missing")]) {
    const error = await submit(PROMOTION_SUBJECT, `supersession-refused-${target}`, target)
      .catch((caught: unknown) => caught);
    assert(
      error instanceof ResearchContributionRejectedError && error.problems[0]?.rule === "superseded_proposal",
      "SUPERSEDES_OTHER_ACCOUNT_NOT_REFUSED",
    );
    refusals.push(JSON.stringify(error.problems));
  }
  assert(new Set(refusals).size === 1, "SUPERSEDES_REFUSAL_DIFFERS_BY_TARGET");
  const linked = await reviewRestricted.query<{ context: { supersedes_proposal_id: string; superseded_by_proposal_ids: string[] } }>(
    `SELECT ${SCHEMA}.inspect_research_contribution_context($1::uuid) AS context`,
    [draft.record.proposalId],
  );
  assert(
    linked.rows[0]?.context.superseded_by_proposal_ids.join(",") === finished.record.proposalId,
    "SUPERSEDED_BY_LINK_NOT_VISIBLE_TO_REVIEW",
  );
  await reviewService.decide({
    proposalId: finished.record.proposalId,
    expectedPayloadSha256: finished.record.payloadSha256,
    decision: "ACCEPT",
    reason: "Synthetic finished version replacing its draft.",
  });
  const states = await admin.query<{ proposal_id: string; status: string; review_reason: string | null }>(
    `SELECT proposal_id, status, review_reason FROM ${SCHEMA}.research_contribution_proposals
      WHERE proposal_id = ANY($1::uuid[])`,
    [[draft.record.proposalId, others.record.proposalId]],
  );
  const byId = new Map(states.rows.map((row) => [row.proposal_id, row]));
  assert(
    byId.get(draft.record.proposalId)?.status === "REJECTED" &&
    byId.get(draft.record.proposalId)?.review_reason === `superseded by ${finished.record.proposalId}` &&
    byId.get(others.record.proposalId)?.status === "PENDING_REVIEW",
    "DRAFT_NOT_SUPERSEDED_IN_THE_SAME_DECISION",
  );
  checks.push("finished_version_supersedes_only_the_accounts_own_pending_draft_in_the_same_decision");
}

/**
 * Owner answer 138b: the review role sees another account's related pending proposal by proposal ID only, and the
 * promotion preflight names, for each conflicting proposal, the code its promotion then ends FAILED with.
 */
async function verifyRelatedAndPreflight(context: {
  adminUrl: string;
  readerUrl: string;
  reviewRestricted: Pool;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  writer: PostgresEvidenceRepository;
  checks: string[];
}): Promise<void> {
  const { adminUrl, readerUrl, reviewRestricted, service, reviewService, writer, checks } = context;
  const reader = new PostgresEvidenceRepository({ connectionString: readerUrl, schema: SCHEMA });
  const runner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T03:55:00.000Z" },
  );
  try {
    // Drain what earlier checks queued, so the queue holds only the intents below.
    while ((await runner.promoteAccepted()).result.status === "promoted") { /* next */ }

    const otherSubject = "auth0|synthetic-postgres-other-contributor";
    const mine = await service.submitProposal(PROMOTION_SUBJECT, {
      proposalKind: "RESEARCH_FRONTIER", privacyBoundary: PRIVACY_BOUNDARY, payload: researchFrontierFixture("related-mine"),
    });
    const theirs = await service.submitProposal(otherSubject, {
      proposalKind: "RESEARCH_FRONTIER", privacyBoundary: PRIVACY_BOUNDARY, payload: researchFrontierFixture("related-theirs"),
    });
    const view = await reviewService.inspect(mine.record.proposalId, { canonical: reader });
    const related = view?.related.proposals.find(({ proposalId }) => proposalId === theirs.record.proposalId);
    const raw = await reviewRestricted.query<{ context: unknown }>(
      `SELECT ${SCHEMA}.inspect_research_contribution_context($1::uuid) AS context`,
      [mine.record.proposalId],
    );
    assert(
      related !== undefined && related.shared.includes("identifier") && view?.related.canonical !== null &&
      view?.preflight?.status === "clear" &&
      !JSON.stringify(raw.rows).includes(theirs.record.accountKey) && !JSON.stringify(view).includes(theirs.record.accountKey),
      "RELATED_PROPOSAL_MISSING_OR_ACCOUNT_KEY_LEAKED",
    );
    await reviewService.decide({
      proposalId: theirs.record.proposalId,
      expectedPayloadSha256: theirs.record.payloadSha256,
      decision: "REJECT",
      reason: "Synthetic related proposal, not needed.",
    });
    await reviewService.decide({
      proposalId: mine.record.proposalId,
      expectedPayloadSha256: mine.record.payloadSha256,
      decision: "REJECT",
      reason: "Synthetic related proposal, not needed.",
    });
    checks.push("related_pending_proposals_by_id_only_through_the_review_role");

    const canonicalFrontier = researchFrontierFixture("promotion-time-no_milliseconds");
    const run = researchFrontierFixture("preflight-run");
    // The canonical run was stored with the no-milliseconds times; this one differs by two milliseconds.
    run.run = { ...canonicalFrontier.run, startedAt: "2026-10-20T22:54:00.002Z", completedAt: "2026-10-20T23:10:00Z" };
    const key = researchFrontierFixture("preflight-topic-key");
    key.topic.canonicalKey = canonicalFrontier.topic.canonicalKey;
    const lane = researchFrontierFixture("preflight-lane-key");
    lane.topic = canonicalFrontier.topic;
    lane.question = canonicalFrontier.question;
    lane.frontier.frontierId = canonicalFrontier.frontier.frontierId;
    const canonicalSource = livingEvidenceFixture("promotion-time-source");
    canonicalSource.run.startedAt = "2026-08-29T12:00:00Z";
    canonicalSource.run.completedAt = "2026-08-29T14:01:00+02:00";
    canonicalSource.source!.retrievedAt = "2026-08-29T11:59:00Z";
    const version = structuredClone(canonicalSource);
    version.idempotencyKey = "acceptance:preflight-source-version";
    version.run.runId = deterministicUuid("preflight-source-version:run");
    version.analysis.analysisId = deterministicUuid("preflight-source-version:analysis");
    version.analysis.versionId = deterministicUuid("preflight-source-version:version");
    version.source!.retrievedAt = "2026-08-29T11:59:00.5Z";
    const initial = structuredClone(canonicalSource);
    initial.idempotencyKey = "acceptance:preflight-second-initial";
    initial.run.runId = deterministicUuid("preflight-second-initial:run");
    initial.analysis.versionId = deterministicUuid("preflight-second-initial:version");
    const expected: Array<[string, "RESEARCH_FRONTIER" | "SOURCE_ANALYSIS", unknown]> = [
      ["RESEARCH_RUN_CONFLICT", "RESEARCH_FRONTIER", run],
      ["TOPIC_KEY_CONFLICT", "RESEARCH_FRONTIER", key],
      ["FRONTIER_LANE_KEY_CONFLICT", "RESEARCH_FRONTIER", lane],
      ["SOURCE_VERSION_ID_CONFLICT", "SOURCE_ANALYSIS", version],
      ["ANALYSIS_ALREADY_HAS_INITIAL_VERSION", "SOURCE_ANALYSIS", initial],
    ];
    const preflighted: Array<{ proposalId: string; code: string }> = [];
    for (const [code, proposalKind, payload] of expected) {
      // Filed as sent (no canonical view), as proposals filed before this build were.
      const filed = await service.submitProposal(PROMOTION_SUBJECT, { proposalKind, privacyBoundary: PRIVACY_BOUNDARY, payload });
      const inspected = await reviewService.inspect(filed.record.proposalId, { canonical: reader });
      const first = inspected?.preflight?.status === "conflicts" ? inspected.preflight.conflicts[0]?.code : undefined;
      assert(first === code, `PREFLIGHT_CODE_MISMATCH expected=${code} actual=${String(first)}`);
      await reviewService.decide({
        proposalId: filed.record.proposalId,
        expectedPayloadSha256: filed.record.payloadSha256,
        decision: "ACCEPT",
        reason: "Synthetic conflict accepted to compare the preflight with promotion.",
      });
      preflighted.push({ proposalId: filed.record.proposalId, code });
    }
    const promoted = await runner.promoteAccepted();
    assert(
      promoted.result.status === "no_pending_promotion" &&
      promoted.failed.map(({ proposalId, failureCode }) => `${proposalId}:${failureCode}`).join(",") ===
        preflighted.map(({ proposalId, code }) => `${proposalId}:${code}`).join(","),
      "PREFLIGHT_DID_NOT_MATCH_PROMOTION",
    );
    checks.push("preflight_names_the_code_each_conflicting_promotion_ends_failed_with");
  } finally {
    await Promise.allSettled([reader.close(), runner.close()]);
  }
}

/**
 * Owner answer 138b: "merging by meaning (the AI may declare two differently worded topics the same, linked on your
 * acceptance, nothing moved or deleted)". A topic link is checked exactly against the canonical topics at intake
 * through the reader role, reviewed with a clear preflight, and promoted: "same" writes each label as the other's
 * alias, which the catalog search reads, and a hierarchy link one edge; neither topic nor its frontier moves. A link
 * the stored ones contradict is refused at intake, and one accepted before the first was promoted ends FAILED.
 */
async function verifyTopicLinks(context: {
  adminUrl: string;
  readerUrl: string;
  admin: Pool;
  service: ResearchContributorAccessService;
  reviewService: ResearchContributionReviewService;
  writer: PostgresEvidenceRepository;
  checks: string[];
}): Promise<void> {
  const { adminUrl, readerUrl, admin, service, reviewService, writer, checks } = context;
  const reader = new PostgresEvidenceRepository({ connectionString: readerUrl, schema: SCHEMA });
  const runner = new PostgresResearchContributionPromotionRunner(
    { connectionString: adminUrl, schema: SCHEMA },
    writer,
    { now: () => "2026-09-01T04:05:00.000Z" },
  );
  try {
    while ((await runner.promoteAccepted()).result.status === "promoted") { /* next */ }
    const first = researchFrontierFixture("topic-link-first-wording");
    first.topic.label = "Synthetic topic worded as lindenmayer";
    const second = researchFrontierFixture("topic-link-second-wording");
    second.topic.label = "Synthetic topic worded as quillwort";
    const broader = researchFrontierFixture("topic-link-broader");
    broader.topic.label = "Synthetic broader topic";
    for (const payload of [first, second, broader]) await writer.contributeFrontier(payload);
    const link = (name: string, relation: string, from: typeof first, to: typeof first) => ({
      schemaVersion: 1,
      idempotencyKey: `acceptance:${name}:topic-link`,
      linkId: deterministicUuid(`${name}:topic-link`),
      run: { ...first.run, runId: deterministicUuid(`${name}:topic-link:run`) },
      fromTopic: { topicId: from.topic.topicId, canonicalKey: from.topic.canonicalKey },
      relation,
      toTopic: { topicId: to.topic.topicId, canonicalKey: to.topic.canonicalKey },
      rationale: "Synthetic declaration about two differently worded canonical topics.",
    });
    const submit = (payload: unknown) => service.submitProposal(PROMOTION_SUBJECT, {
      proposalKind: "TOPIC_LINK", privacyBoundary: PRIVACY_BOUNDARY, payload,
    }, { canonical: reader });
    const accept = (record: { proposalId: string; payloadSha256: string }) => reviewService.decide({
      proposalId: record.proposalId,
      expectedPayloadSha256: record.payloadSha256,
      decision: "ACCEPT",
      reason: "Synthetic topic link accepted for promotion.",
    });
    const quillwort = async () => (await reader.searchResearchFrontiers({ query: "quillwort" })).matches as Array<{
      frontier_id: string; topic: { topic_id: string }; match_fields: string[];
    }>;
    assert((await quillwort()).map(({ frontier_id: id }) => id).join() === second.frontier.frontierId, "TOPIC_LINK_SEARCH_BASELINE");

    const samePayload = link("topic-link-same", "same", first, second);
    const same = await submit(samePayload);
    assert(same.status === "inserted" && same.canonicalCheck === "checked", "TOPIC_LINK_NOT_CHECKED_AT_INTAKE");
    const reviewed = await reviewService.inspect(same.record.proposalId, { canonical: reader });
    assert(
      reviewed?.preflight?.status === "clear" &&
      reviewed.related.canonical?.records.filter(({ record }) => record === "topic").length === 2,
      "TOPIC_LINK_REVIEW_AID_MISSING",
    );
    // Accepted while the first link still waits for promotion, so the intake could not see the contradiction; the
    // review shows the first link beside it, through the review role.
    const contradicting = await submit(link("topic-link-contradicting", "narrower", first, second));
    const beside = await reviewService.inspect(contradicting.record.proposalId, { canonical: reader });
    assert(
      beside?.related.proposals.some(({ proposalId, shared }) =>
        proposalId === same.record.proposalId && shared.join() === "topic_id,topic_key") === true,
      "TOPIC_LINK_RELATED_PROPOSAL_MISSING",
    );
    await accept(same.record);
    await accept(contradicting.record);
    const promoted = await runner.promoteAccepted();
    assert(
      promoted.failed.length === 0 && promoted.result.status === "promoted" &&
      promoted.result.receipt.proposalId === same.record.proposalId &&
      promoted.result.receipt.writerOperation === "contributeTopicLink" &&
      promoted.result.receipt.canonicalWriterReceipt.status === "inserted",
      "TOPIC_LINK_NOT_PROMOTED",
    );
    const aliases = await admin.query<{ topic_id: string; alias: string }>(
      `SELECT topic_id, alias FROM ${SCHEMA}.topic_aliases WHERE topic_id = ANY($1::uuid[]) ORDER BY alias`,
      [[first.topic.topicId, second.topic.topicId]],
    );
    assert(
      aliases.rows.map(({ topic_id: id, alias }) => `${id}=${alias}`).join() ===
        [`${second.topic.topicId}=${first.topic.label}`, `${first.topic.topicId}=${second.topic.label}`].join(),
      "TOPIC_LINK_ALIASES_NOT_WRITTEN",
    );
    const found = await quillwort();
    const byAlias = found.find(({ frontier_id: id }) => id === first.frontier.frontierId);
    assert(
      found.length === 2 && byAlias?.topic.topic_id === first.topic.topicId && byAlias.match_fields.includes("topic_alias"),
      "TOPIC_LINK_ALIAS_NOT_SEARCHED",
    );
    for (const payload of [first, second]) {
      const kept = await reader.getResearchFrontier({ frontierId: payload.frontier.frontierId, includeHistory: false });
      assert(
        (kept.frontiers as Array<{ topic: { topic_id: string } }>)[0]?.topic.topic_id === payload.topic.topicId,
        "TOPIC_LINK_MOVED_A_FRONTIER",
      );
    }
    assert((await writer.contributeTopicLink(samePayload)).status === "idempotent_replay", "TOPIC_LINK_REPLAY_FAILED");
    checks.push("topic_link_checked_at_intake_reviewed_and_promoted_as_aliases_the_search_reads_nothing_moved");

    const queued = await reviewService.inspect(contradicting.record.proposalId, { canonical: reader });
    assert(
      queued?.preflight?.status === "conflicts" && queued.preflight.conflicts[0]?.code === "TOPIC_LINK_CONFLICT",
      "TOPIC_LINK_PREFLIGHT_MISSED_THE_CONTRADICTION",
    );
    const failed = await runner.promoteAccepted();
    assert(
      failed.result.status === "no_pending_promotion" && failed.failed.length === 1 &&
      failed.failed[0]!.proposalId === contradicting.record.proposalId &&
      failed.failed[0]!.failureCode === "TOPIC_LINK_CONFLICT",
      "CONTRADICTING_TOPIC_LINK_DID_NOT_FAIL_WITH_ITS_CODE",
    );
    const refused = async (payload: unknown) => {
      const error = await submit(payload).catch((caught: unknown) => caught);
      assert(error instanceof ResearchContributionRejectedError, "TOPIC_LINK_NOT_REFUSED_AT_INTAKE");
      return error.problems.map(({ path, rule }) => `${path} ${rule}`).join();
    };
    assert(
      await refused(link("topic-link-again", "broader", first, second)) === "payload.relation canonical_conflict",
      "STORED_LINK_CONTRADICTION_NOT_REFUSED",
    );
    const missing = link("topic-link-missing", "related", first, second);
    missing.toTopic.topicId = deterministicUuid("topic-link-missing:not-canonical");
    assert(await refused(missing) === "payload.toTopic canonical_missing", "MISSING_TOPIC_NOT_REFUSED");
    checks.push("contradicting_topic_link_refused_at_intake_and_ends_failed_with_its_code_at_promotion");

    const hierarchy = await submit(link("topic-link-broader", "broader", broader, first));
    await accept(hierarchy.record);
    const edge = await runner.promoteAccepted();
    const edges = await admin.query<{ edge_id: string; relation: string }>(
      `SELECT edge_id, relation FROM ${SCHEMA}.topic_edges WHERE from_topic_id = $1 AND to_topic_id = $2`,
      [broader.topic.topicId, first.topic.topicId],
    );
    assert(
      edge.result.status === "promoted" && edges.rows.length === 1 && edges.rows[0]!.relation === "broader_than" &&
      edges.rows[0]!.edge_id === (hierarchy.record.payload as { linkId: string }).linkId,
      "TOPIC_LINK_EDGE_NOT_WRITTEN",
    );
    await expectMessage(
      () => admin.query(`UPDATE ${SCHEMA}.topic_link_contributions SET relation = 'related'`),
      "APPEND_ONLY_TABLE",
    );
    checks.push("hierarchy_topic_link_writes_one_edge_and_topic_links_are_append_only");
  } finally {
    await Promise.allSettled([reader.close(), runner.close()]);
  }
}

// Atlas phase 2, part A (docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md, section 7): migration 0017, the
// review role's five functions, the append-only Atlas tables and their one redaction exception, and the runner:
// accept, lead, contested, replaces, a correction chain, withdraw, the failure codes and replay. Role boundaries are
// checked with SET LOCAL ROLE from the migrator (a superuser in this container, as the official image makes it), so
// the same checks also run where a role cannot log in separately.

const ATLAS_CANONICAL_TABLES = [
  "atlas_intent_applications", "atlas_findings", "atlas_finding_versions", "atlas_finding_links",
  "atlas_finding_link_withdrawals", "atlas_finding_changes", "atlas_source_checks", "atlas_redactions",
] as const;
const ATLAS_REVIEW_FUNCTIONS = [
  "decide_atlas_card_item", "forget_atlas_cards", "inspect_atlas_cards", "inspect_atlas_finding_intents",
  "record_atlas_finding_intent",
] as const;
const CONTRIBUTION_REVIEW_FUNCTIONS = [
  "decide_research_contribution_proposal", "inspect_research_contribution_context",
  "inspect_research_contribution_proposal",
] as const;
const MIGRATIONS_BEFORE_ATLAS = [
  "0001_living_evidence", "0002_research_frontier", "0003_community_forum_synthetic_lab",
  "0004_community_forum_composer_frontier_queues", "0005_community_forum_hostile_lifecycle_research",
  "0006_community_forum_closed_loop_hostile", "0007_community_forum_privacy_provenance_matrix",
  "0008_public_evidence_gap_intake", "0009_research_contributor_access", "0010_research_contribution_review",
  "0011_research_use_notice_v2", "0012_research_contribution_merging", "0013_research_plain_answer_note",
  "0014_research_map_consent", "0015_research_detailed_lesson_reports", "0016_research_use_notice_v3",
] as const;
const ATLAS_ERASED = "[wording removed]";

const atlasHex = (text: string) => createHash("sha256").update(text).digest("hex");
const ATLAS_PROTOCOLS = [
  { name: "Universal Instructions", version: "20.5.40", sha256: atlasHex("synthetic-universal-instructions") },
  { name: "HRP", version: "20.6.30", sha256: atlasHex("synthetic-hrp") },
];
const ATLAS_MADE_WITH = {
  askrigorVersion: "0.1.0", build: "unknown", protocols: ATLAS_PROTOCOLS, depth: "standard", status: "complete",
};
const ATLAS_DECIDED_WITH = { askrigorVersion: "0.1.0", build: "unknown", protocols: ATLAS_PROTOCOLS };
// The draft's invented Velmor syndrome and zentarine, with synthetic identifiers.
const ATLAS_TOPIC = { key: "velmor-syndrome", label: "Velmor syndrome (an invented condition)" };
const ATLAS_QUESTION = "Does zentarine reduce relapse in adults with Velmor syndrome?";

const atlasCardSha256 = (card: number) => atlasHex(`synthetic-findings-card:${card}`);
const atlasWordingKey = (question: string, wording: string) => atlasHex(`synthetic-wording-key:${question}:${wording}`);

function atlasSource(doi: string, checkedAt: string) {
  return {
    kind: "study",
    identifiers: [{ scheme: "doi", value: doi }],
    check: {
      provider: "crossref",
      title: `Synthetic zentarine trial ${doi.slice(doi.lastIndexOf("-") + 1)}`,
      publishedYear: 2024,
      retractionStatus: "none_found",
      notices: [],
      ownerConfirmed: false,
      envelopeSha256: atlasHex(`synthetic-envelope:${doi}:${checkedAt}`),
      checkedAt,
    },
  };
}

function atlasContent(wording: string, verifiedBases: string[], openLead = false) {
  return {
    wording,
    appliesTo: openLead ? null : "Adults with Velmor syndrome",
    certainty: openLead ? null : "moderate",
    usualAnswer: "A quick answer says zentarine helps everyone with Velmor syndrome.",
    whyNotUsual: openLead ? null : "The quick answer misses the dose the trials used.",
    whatWouldChangeIt: openLead ? null : "A larger trial at the lower dose.",
    whoElse: "Adults weighing zentarine for Velmor syndrome.",
    whatItChanges: "Which dose to ask a doctor about.",
    tags: [],
    verifiedBases,
    numbers: [],
  };
}

function atlasAccept(options: {
  wording: string;
  bases: string[];
  sources: unknown[];
  entry?: "finding" | "unverified_finding" | "open_lead";
  numbers?: unknown[];
}) {
  const entry = options.entry ?? "finding";
  const key = atlasWordingKey(ATLAS_QUESTION, options.wording);
  return {
    schema: "askrigor.atlas-finding-intent.v1",
    kind: "accept",
    entryKind: entry === "finding" ? "finding" : "lead",
    leadOrigin: entry === "finding" ? null : entry,
    editedAtAcceptance: false,
    topic: ATLAS_TOPIC,
    question: ATLAS_QUESTION,
    content: { ...atlasContent(options.wording, options.bases, entry === "open_lead"), numbers: options.numbers ?? [] },
    sources: options.sources,
    wordingKeys: { card: key, accepted: key },
    researchCheckedOn: "2026-10-21",
    madeWith: ATLAS_MADE_WITH,
  };
}

function atlasRevise(publicNumber: string, version: number, changeKind: "corrected" | "edited", wording: string,
  note: string | null, checkedAt: string) {
  return {
    schema: "askrigor.atlas-finding-intent.v1",
    kind: "revise",
    publicNumber,
    version,
    changeKind,
    note,
    content: atlasContent(wording, ["full_text_audit"]),
    sources: [atlasSource("10.0000/synthetic-velmor-1", checkedAt)],
    acceptedWordingKey: atlasWordingKey(ATLAS_QUESTION, wording),
    researchCheckedOn: "2026-10-21",
    madeWith: ATLAS_MADE_WITH,
  };
}

async function atlasMigrationSnapshot(pool: Pool, schema: string): Promise<string> {
  const [migrations, sequence, counts, constraints, guard] = await Promise.all([
    pool.query(`SELECT migration_id, migration_sha256 FROM ${schema}.schema_migrations ORDER BY migration_id`),
    pool.query(`SELECT last_value::text, is_called FROM ${schema}.atlas_public_number_seq`),
    pool.query(`SELECT ${[...ATLAS_CANONICAL_TABLES, "atlas_card_decisions", "atlas_finding_intents"]
      .map((table) => `(SELECT count(*)::int FROM ${schema}.${table}) AS ${table}`).join(", ")}`),
    pool.query(
      `SELECT constraint_row.conrelid::regclass::text AS relation, constraint_row.conname,
              pg_get_constraintdef(constraint_row.oid) AS definition
         FROM pg_constraint constraint_row
         JOIN pg_namespace namespace ON namespace.oid = constraint_row.connamespace
        WHERE namespace.nspname = $1 AND constraint_row.conrelid::regclass::text LIKE '%atlas%'
        ORDER BY 1, 2`,
      [schema],
    ),
    pool.query(`SELECT pg_get_functiondef('${schema}.reject_living_evidence_mutation()'::regprocedure) AS definition`),
  ]);
  return JSON.stringify({
    migrations: migrations.rows,
    sequence: sequence.rows,
    counts: counts.rows,
    constraints: constraints.rows,
    guard: guard.rows,
  });
}

/**
 * Migrations 0017 and 0018 (Atlas phase 3): applied, a second migrate changes nothing, and a database at 0016 holding
 * data upgrades to them and then takes an Atlas finding.
 */
export async function verifyAtlasMigrations(context: { adminUrl: string; schema: string; checks: string[] }): Promise<void> {
  const { adminUrl, schema, checks } = context;
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  try {
    const applied = await admin.query<{ migration_id: string }>(
      `SELECT migration_id FROM ${schema}.schema_migrations
        WHERE migration_id IN ('0017_atlas_findings', '0018_atlas_card_fields')`,
    );
    assert(applied.rowCount === 2, "MIGRATION_0017_OR_0018_NOT_APPLIED");
    const before = await atlasMigrationSnapshot(admin, schema);
    const again = new PostgresEvidenceRepository({ connectionString: adminUrl, schema });
    try {
      await again.migrate();
    } finally {
      await again.close();
    }
    assert(await atlasMigrationSnapshot(admin, schema) === before, "ATLAS_SECOND_MIGRATE_CHANGED_THE_SCHEMA_OR_ROWS");
    checks.push("migrations_0017_and_0018_applied_and_a_second_migrate_changes_nothing");

    // A database at 0016, as production holds it before this release, with canonical and account rows in it.
    const upgrade = `${schema}_atlas_upgrade`;
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      for (const migrationId of MIGRATIONS_BEFORE_ATLAS) {
        const sql = await readFile(
          new URL(`../packages/evidence-repository/migrations/${migrationId}.sql`, import.meta.url),
          "utf8",
        );
        await client.query(sql.replaceAll("__SCHEMA__", upgrade));
        await client.query(
          `INSERT INTO ${upgrade}.schema_migrations (migration_id, migration_sha256) VALUES ($1, $2)`,
          [migrationId, createHash("sha256").update(sql).digest("hex")],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const upgradeRepository = new PostgresEvidenceRepository({ connectionString: adminUrl, schema: upgrade });
    const upgradeReview = new PostgresAtlasReviewStore({ connectionString: adminUrl, schema: upgrade });
    const upgradeRunner = new AtlasFindingPromotionRunner(
      new PostgresAtlasPromotionStore({ connectionString: adminUrl, schema: upgrade }),
      { now: () => "2026-10-22T11:00:00.000Z" },
    );
    try {
      await upgradeRepository.contributeFrontier(researchFrontierFixture("atlas-upgrade-frontier"));
      await admin.query(
        `INSERT INTO ${upgrade}.research_use_accounts
           (account_key, status, mode, notice_version, agreement_json, activated_at, revoked_at, created_at, updated_at)
         VALUES ($1, 'ACTIVE', 'FREE_CONTRIBUTOR', 'free-contributor-v3-2026-10-22', $2::jsonb, $3, NULL, $3, $3)`,
        ["7".repeat(64), JSON.stringify({ noticeVersion: "free-contributor-v3-2026-10-22", synthetic: true }),
          "2026-10-22T09:00:00.000Z"],
      );
      const counted = async () => (await admin.query<{ frontiers: number; accounts: number; migrations: number }>(
        `SELECT (SELECT count(*)::int FROM ${upgrade}.frontier_contributions) AS frontiers,
                (SELECT count(*)::int FROM ${upgrade}.research_use_accounts) AS accounts,
                (SELECT count(*)::int FROM ${upgrade}.schema_migrations) AS migrations`,
      )).rows[0]!;
      const atZeroSixteen = await counted();
      assert(atZeroSixteen.frontiers === 1 && atZeroSixteen.accounts === 1 && atZeroSixteen.migrations === 16,
        "ATLAS_UPGRADE_BASELINE_MISMATCH");
      await upgradeRepository.migrate();
      const upgraded = await counted();
      assert(upgraded.frontiers === 1 && upgraded.accounts === 1 && upgraded.migrations === 18,
        "ATLAS_UPGRADE_LOST_ROWS_OR_SKIPPED_0017_OR_0018");
      const prepared = prepareAtlasFindingIntent(atlasAccept({
        wording: "In an invented trial, zentarine 20 mg cut relapse in adults with Velmor syndrome.",
        bases: ["full_text_audit"],
        sources: [atlasSource("10.0000/synthetic-velmor-upgrade", "2026-10-22T10:00:00.000Z")],
      }));
      const decided = await upgradeReview.decide({
        cardNumber: 8001, itemKind: "finding", itemNumber: 1, decision: "accepted", cardSha256: atlasCardSha256(8001),
        ownerReason: null, decidedAt: "2026-10-22T10:30:00.000Z",
        intent: { intentId: deterministicUuid(`atlas-upgrade-intent:${upgrade}`), ...prepared },
        recheckedPublicNumber: null,
      });
      const promoted = await upgradeRunner.promoteAccepted();
      assert(
        decided.publicNumber === "F-1001" && promoted.failed.length === 0 && promoted.result.status === "promoted" &&
          promoted.result.receipt.publicNumber === "F-1001",
        "ATLAS_UPGRADED_DATABASE_DID_NOT_TAKE_A_FINDING",
      );
    } finally {
      await Promise.allSettled([upgradeRepository.close(), upgradeReview.close(), upgradeRunner.close()]);
    }
    checks.push("an_0016_database_with_data_upgrades_to_0018_keeps_its_rows_and_takes_a_finding");
  } finally {
    await admin.end();
  }
}

/**
 * Atlas phase 3 (docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md, sections 6 and 9): migration 0018. A
 * database at 0017 holding a phase 2 finding upgrades to it, and the finding reads back with none of the new fields;
 * the writer then stores an effect's and a search that found nothing's fields where the design puts them; the columns'
 * check refuses what no intent may hold, and the append-only guard refuses any change; decision 7's erasure takes the
 * subject and the searches' queries with the rest of the wording; and a second migrate on the populated database
 * changes nothing.
 */
export async function verifyAtlasCardFields(context: { adminUrl: string; schema: string; checks: string[] }): Promise<void> {
  const { adminUrl, checks } = context;
  const schema = `${context.schema}_card_fields`;
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  let instant = Date.parse("2026-11-04T09:00:00.000Z");
  const tick = () => new Date(instant += 1_000).toISOString();
  try {
    // A database at 0017, as production holds it once phases 1 and 2 are released.
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      for (const migrationId of [...MIGRATIONS_BEFORE_ATLAS, "0017_atlas_findings"]) {
        const sql = await readFile(
          new URL(`../packages/evidence-repository/migrations/${migrationId}.sql`, import.meta.url),
          "utf8",
        );
        await client.query(sql.replaceAll("__SCHEMA__", schema));
        await client.query(
          `INSERT INTO ${schema}.schema_migrations (migration_id, migration_sha256) VALUES ($1, $2)`,
          [migrationId, createHash("sha256").update(sql).digest("hex")],
        );
      }
      // A phase 2 finding, F-1001, as 0017's writer leaves it: claim_type other, direction unclear, no subject, and
      // the version row with 0017's columns only.
      const runId = deterministicUuid(`card-fields-phase-2-run:${schema}`);
      const topicId = deterministicUuid(`card-fields-phase-2-topic:${schema}`);
      const questionId = deterministicUuid(`card-fields-phase-2-question:${schema}`);
      const claimId = deterministicUuid(`card-fields-phase-2-claim:${schema}`);
      const findingId = deterministicUuid(`card-fields-phase-2-finding:${schema}`);
      const versionId = deterministicUuid(`card-fields-phase-2-version:${schema}`);
      await client.query(
        `INSERT INTO ${schema}.research_runs (run_id, run_kind, started_at, completed_at, protocol_manifest_sha256s,
           provenance_note) VALUES ($1, 'live_research', $2, $2, '[]'::jsonb, 'Synthetic phase 2 finding.')`,
        [runId, "2026-10-23T09:00:00.000Z"],
      );
      await client.query(`INSERT INTO ${schema}.topics (topic_id, canonical_key, label) VALUES ($1, $2, $3)`,
        [topicId, ATLAS_TOPIC.key, ATLAS_TOPIC.label]);
      await client.query(
        `INSERT INTO ${schema}.questions (question_id, topic_id, normalized_question, created_by_run_id)
         VALUES ($1, $2, $3, $4)`,
        [questionId, topicId, ATLAS_QUESTION, runId],
      );
      await client.query(`INSERT INTO ${schema}.claims (claim_id, question_id, claim_type) VALUES ($1, $2, 'other')`,
        [claimId, questionId]);
      // Its number comes from the sequence, as decide_atlas_card_item() takes it, so it is F-1001 and the next is F-1002.
      await client.query(
        `INSERT INTO ${schema}.atlas_findings (finding_id, public_number, claim_id, entry_kind, lead_origin,
           created_by_run_id)
         VALUES ($1, 'F-' || nextval('${schema}.atlas_public_number_seq')::text, $2, 'finding', NULL, $3)`,
        [findingId, claimId, runId],
      );
      await client.query(
        `INSERT INTO ${schema}.claim_versions (version_id, claim_id, created_by_run_id, normalized_assertion, population,
           direction, inference_type, capability_state, uncertainty_and_limitations, status)
         VALUES ($1, $2, $3, 'Zentarine cut relapse in an invented trial.', 'Adults with Velmor syndrome', 'unclear',
           'unknown', 'can_support', '[]'::jsonb, 'current')`,
        [versionId, claimId, runId],
      );
      await client.query(
        `INSERT INTO ${schema}.atlas_finding_versions (claim_version_id, finding_id, version_number, certainty,
           usual_answer, why_not_usual, what_would_change_it, who_else, what_it_changes, tags, verified_bases, numbers,
           research_checked_on, made_with, card_wording_key, accepted_wording_key, edited_at_acceptance)
         VALUES ($1, $2, 1, 'moderate', 'A gentle supplement.', 'It misses the dose.', 'A larger trial.', NULL, NULL,
           '[]'::jsonb, '["full_text_audit"]'::jsonb, '[]'::jsonb, '2026-10-22', $3::jsonb, NULL, NULL, false)`,
        [versionId, findingId, JSON.stringify(ATLAS_MADE_WITH)],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const repository = new PostgresEvidenceRepository({ connectionString: adminUrl, schema });
    try {
      await repository.migrate();
    } finally {
      await repository.close();
    }
    const migrations = (await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.schema_migrations`)).rows[0]!.count;
    const reader = new PostgresAtlasReader({ connectionString: adminUrl, schema });
    const review = new PostgresAtlasReviewStore({ connectionString: adminUrl, schema });
    const runner = new AtlasFindingPromotionRunner(
      new PostgresAtlasPromotionStore({ connectionString: adminUrl, schema }),
      { now: () => tick() },
    );
    try {
      const contentOf = async (publicNumber: string) => {
        const state = await reader.readAtlasState({ publicNumbers: [publicNumber] });
        return state.findings.find((finding) => finding.publicNumber === publicNumber)!.versions.map(({ content }) => content);
      };
      const [phase2] = await contentOf("F-1001");
      assert(
        migrations === 18 && phase2 !== undefined &&
          ["kind", "subject", "subjectType", "direction", "searchScope"].every((field) => !(field in phase2)),
        "ATLAS_CARD_FIELDS_UPGRADE_CHANGED_A_PHASE_2_FINDING",
      );
      checks.push("an_0017_database_with_a_phase_2_finding_upgrades_to_0018_and_reads_it_without_the_new_fields");

      // The writer stores an effect's fields and a search that found nothing's where the design puts them.
      const decide = async (cardNumber: number, payload: unknown) => {
        const prepared = prepareAtlasFindingIntent(payload);
        const decided = await review.decide({
          cardNumber, itemKind: "finding", itemNumber: 1, decision: "accepted", cardSha256: atlasCardSha256(cardNumber),
          ownerReason: null, decidedAt: tick(),
          intent: { intentId: deterministicUuid(`card-fields-intent:${schema}:${cardNumber}`), ...prepared },
          recheckedPublicNumber: null,
        });
        const promoted = await runner.promoteAccepted();
        assert(promoted.failed.length === 0 && promoted.result.status === "promoted", `ATLAS_CARD_FIELDS_NOT_PROMOTED ${cardNumber}`);
        return decided.publicNumber!;
      };
      const effectFields = { kind: "effect", subject: "Zentarine", subjectType: "supplement", direction: "benefit" };
      // The first search was restricted to publication dates (review finding 8): the range is kept, and erased with
      // nothing, since it identifies no one.
      const searches = [
        { database: "pubmed", query: "zentarine children", dateRange: { start: "2015-01-01", end: "2026-10-22" } },
        { database: "ctgov", query: "zentarine" },
      ];
      const withoutQueries = searches.map((search) => ({ ...search, query: ATLAS_ERASED }));
      const nothingFields = {
        kind: "nothing_found", subject: "Zentarine", subjectType: "supplement", direction: "descriptive",
        searchScope: searches,
      };
      const effect = await decide(9001, {
        ...atlasAccept({
          wording: "In an invented trial, zentarine 20 mg halved the tremor score in more adults than placebo.",
          bases: ["full_text_audit"], sources: [atlasSource("10.0000/synthetic-card-fields-a", tick())],
        }),
        content: {
          ...atlasContent("In an invented trial, zentarine 20 mg halved the tremor score in more adults than placebo.",
            ["full_text_audit"]),
          ...effectFields,
        },
      });
      const nothing = await decide(9002, {
        ...atlasAccept({
          wording: "No trial of zentarine in people under 18 was found.", bases: ["bounded_absence"],
          sources: [atlasSource("10.0000/synthetic-card-fields-b", tick())],
        }),
        content: { ...atlasContent("No trial of zentarine in people under 18 was found.", ["bounded_absence"]), ...nothingFields },
      });
      const stored = await admin.query<{
        public_number: string; claim_type: string; direction: string; program_or_exposure: string | null;
        kind: string | null; subject_type: string | null; search_scope: unknown;
      }>(
        `SELECT finding.public_number, claim.claim_type, claimed.direction, claimed.program_or_exposure, version.kind,
                version.subject_type, version.search_scope
           FROM ${schema}.atlas_findings finding
           JOIN ${schema}.claims claim ON claim.claim_id = finding.claim_id
           JOIN ${schema}.atlas_finding_versions version ON version.finding_id = finding.finding_id
           JOIN ${schema}.claim_versions claimed ON claimed.version_id = version.claim_version_id
          ORDER BY finding.public_number`,
      );
      // jsonb keeps an object's keys in its own order, so the rows are compared as values, whatever their key order.
      assert(isDeepStrictEqual(stored.rows, [
        { public_number: "F-1001", claim_type: "other", direction: "unclear", program_or_exposure: null, kind: null,
          subject_type: null, search_scope: null },
        { public_number: effect, claim_type: "effect", direction: "benefit", program_or_exposure: "Zentarine",
          kind: "effect", subject_type: "supplement", search_scope: null },
        { public_number: nothing, claim_type: "other", direction: "descriptive", program_or_exposure: "Zentarine",
          kind: "nothing_found", subject_type: "supplement", search_scope: searches },
      ]), "ATLAS_CARD_FIELDS_STORED_ELSEWHERE");
      const [effectContent] = await contentOf(effect);
      const [nothingContent] = await contentOf(nothing);
      assert(
        effectContent !== undefined && nothingContent !== undefined &&
          isDeepStrictEqual({ kind: effectContent.kind, subject: effectContent.subject, subjectType: effectContent.subjectType,
            direction: effectContent.direction }, effectFields) && !("searchScope" in effectContent) &&
          isDeepStrictEqual(nothingContent.searchScope, searches),
        "ATLAS_CARD_FIELDS_READ_BACK_MISMATCH",
      );
      checks.push("atlas_writer_stores_kind_subject_direction_and_searches_and_the_claim_type_from_the_kind");

      // The columns' check refuses what no intent may hold, and the append-only guard refuses any change.
      const nothingVersion = (await admin.query<{ claim_version_id: string; finding_id: string }>(
        `SELECT version.claim_version_id, version.finding_id FROM ${schema}.atlas_finding_versions version
           JOIN ${schema}.atlas_findings finding ON finding.finding_id = version.finding_id
          WHERE finding.public_number = $1`,
        [nothing],
      )).rows[0]!;
      const insertedVersion = (fields: string) => async () => {
        const inner = await admin.connect();
        try {
          await inner.query("BEGIN");
          // A copy of the nothing-found version as version 2, with the fields under test.
          const version = deterministicUuid(`card-fields-refused:${schema}:${fields}`);
          await inner.query(
            `INSERT INTO ${schema}.claim_versions (version_id, claim_id, created_by_run_id, normalized_assertion,
               direction, inference_type, capability_state, uncertainty_and_limitations, status,
               supersedes_claim_version_id)
             SELECT $1, claimed.claim_id, claimed.created_by_run_id, claimed.normalized_assertion, 'descriptive',
                    'unknown', 'can_support', '[]'::jsonb, 'current', claimed.version_id
               FROM ${schema}.claim_versions claimed WHERE claimed.version_id = $2`,
            [version, nothingVersion.claim_version_id],
          );
          await inner.query(
            `INSERT INTO ${schema}.atlas_finding_versions (claim_version_id, finding_id, version_number, tags,
               verified_bases, numbers, research_checked_on, made_with, edited_at_acceptance, kind, subject_type,
               search_scope)
             SELECT $1, version.finding_id, 2, version.tags, version.verified_bases, version.numbers,
                    version.research_checked_on, version.made_with, false, ${fields}
               FROM ${schema}.atlas_finding_versions version WHERE version.claim_version_id = $2`,
            [version, nothingVersion.claim_version_id],
          );
        } finally {
          await inner.query("ROLLBACK").catch(() => undefined);
          inner.release();
        }
      };
      for (const fields of [
        "'anecdote', NULL, NULL",
        "'effect', 'person', NULL",
        `'effect', 'supplement', '${JSON.stringify(searches)}'::jsonb`,
        `NULL, 'supplement', '${JSON.stringify(searches)}'::jsonb`,
        "'nothing_found', 'supplement', '[]'::jsonb",
        "'nothing_found', 'supplement', '{\"database\":\"pubmed\"}'::jsonb",
        `'nothing_found', 'supplement', '${JSON.stringify(Array.from({ length: 11 }, () => searches[0]))}'::jsonb`,
      ]) {
        await expectMessage(insertedVersion(fields), "atlas_finding_versions_card_fields_check");
      }
      for (const sql of [
        `UPDATE ${schema}.atlas_finding_versions SET kind = 'harm' WHERE claim_version_id = $1`,
        `UPDATE ${schema}.atlas_finding_versions SET search_scope = NULL WHERE claim_version_id = $1`,
        `UPDATE ${schema}.claim_versions SET direction = 'benefit' WHERE version_id = $1`,
        `UPDATE ${schema}.claim_versions SET program_or_exposure = 'Another subject' WHERE version_id = $1`,
        `DELETE FROM ${schema}.atlas_finding_versions WHERE claim_version_id = $1`,
      ]) {
        await expectMessage(() => admin.query(sql, [nothingVersion.claim_version_id]), "APPEND_ONLY_TABLE");
      }
      checks.push("atlas_card_fields_check_refuses_what_no_intent_may_hold_and_the_guard_refuses_any_change");

      // Under a redaction row, the searches may change only by losing their queries to the marker.
      const runId = (await admin.query<{ run_id: string }>(
        `SELECT created_by_run_id AS run_id FROM ${schema}.atlas_findings WHERE finding_id = $1`,
        [nothingVersion.finding_id],
      )).rows[0]!.run_id;
      const underRedaction = async (sql: string) => {
        const inner = await admin.connect();
        try {
          await inner.query("BEGIN");
          const redaction = deterministicUuid(`card-fields-redaction-probe:${schema}`);
          await inner.query(
            `INSERT INTO ${schema}.atlas_redactions (redaction_id, finding_id, claim_version_id, reason_code, decided_at,
               run_id) VALUES ($1, $2, $3, 'could_identify_a_person', $4, $5)`,
            [redaction, nothingVersion.finding_id, nothingVersion.claim_version_id, tick(), runId],
          );
          await inner.query("SELECT set_config('askrigor.atlas_erasing_redaction', $1, true)", [redaction]);
          await inner.query(sql, [nothingVersion.claim_version_id]);
        } finally {
          await inner.query("ROLLBACK").catch(() => undefined);
          inner.release();
        }
      };
      for (const scope of [
        "'[]'::jsonb",
        `'${JSON.stringify([{ database: "europepmc", query: ATLAS_ERASED }, { database: "ctgov", query: ATLAS_ERASED }])}'::jsonb`,
        `'${JSON.stringify([{ database: "pubmed", query: "another query" }, searches[1]])}'::jsonb`,
        // The queries erased, but the range changed or dropped: only the queries may change.
        `'${JSON.stringify([{ ...withoutQueries[0], dateRange: { start: "2016-01-01", end: "2026-10-22" } },
          withoutQueries[1]])}'::jsonb`,
        `'${JSON.stringify([{ database: "pubmed", query: ATLAS_ERASED }, withoutQueries[1]])}'::jsonb`,
      ]) {
        await expectMessage(() => underRedaction(
          `UPDATE ${schema}.atlas_finding_versions SET search_scope = ${scope} WHERE claim_version_id = $1`),
        "APPEND_ONLY_TABLE");
      }
      await expectMessage(() => underRedaction(
        `UPDATE ${schema}.atlas_finding_versions SET kind = 'harm' WHERE claim_version_id = $1`), "APPEND_ONLY_TABLE");
      // The marker in place of each query, the databases kept, is what the exception permits (the probe rolls back).
      await underRedaction(`UPDATE ${schema}.atlas_finding_versions
         SET search_scope = ${schema}.atlas_search_scope_without_queries(search_scope) WHERE claim_version_id = $1`);
      // erase_atlas_wording() takes the queries of a version whose searches are the only wording it has left: a
      // version 2 with no texts and no wording keys (rolled back).
      const onlySearches = await (async () => {
        const inner = await admin.connect();
        try {
          await inner.query("BEGIN");
          const version = deterministicUuid(`card-fields-only-searches:${schema}`);
          const redaction = deterministicUuid(`card-fields-only-searches-redaction:${schema}`);
          await inner.query(
            `INSERT INTO ${schema}.claim_versions (version_id, claim_id, created_by_run_id, normalized_assertion,
               direction, inference_type, capability_state, uncertainty_and_limitations, status,
               supersedes_claim_version_id)
             SELECT $1, claimed.claim_id, claimed.created_by_run_id, $3, 'descriptive', 'unknown', 'can_support',
                    '[]'::jsonb, 'current', claimed.version_id
               FROM ${schema}.claim_versions claimed WHERE claimed.version_id = $2`,
            [version, nothingVersion.claim_version_id, ATLAS_ERASED],
          );
          await inner.query(
            `INSERT INTO ${schema}.atlas_finding_versions (claim_version_id, finding_id, version_number, tags,
               verified_bases, numbers, research_checked_on, made_with, edited_at_acceptance, kind, subject_type,
               search_scope)
             SELECT $1, version.finding_id, 2, version.tags, version.verified_bases, '[]'::jsonb,
                    version.research_checked_on, version.made_with, false, version.kind, version.subject_type,
                    version.search_scope
               FROM ${schema}.atlas_finding_versions version WHERE version.claim_version_id = $2`,
            [version, nothingVersion.claim_version_id],
          );
          await inner.query(
            `INSERT INTO ${schema}.atlas_redactions (redaction_id, finding_id, claim_version_id, reason_code, decided_at,
               run_id) VALUES ($1, $2, $3, 'could_identify_a_person', $4, $5)`,
            [redaction, nothingVersion.finding_id, version, tick(), runId],
          );
          await inner.query(`SELECT ${schema}.erase_atlas_wording($1)`, [redaction]);
          return (await inner.query<{ search_scope: unknown }>(
            `SELECT search_scope FROM ${schema}.atlas_finding_versions WHERE claim_version_id = $1`, [version],
          )).rows[0]?.search_scope;
        } finally {
          await inner.query("ROLLBACK").catch(() => undefined);
          inner.release();
        }
      })();
      assert(
        isDeepStrictEqual(onlySearches, withoutQueries),
        "ATLAS_CARD_FIELDS_ONLY_SEARCHES_NOT_ERASED",
      );

      // Decision 7 through the runner: withdraw the search that found nothing and erase every version's wording.
      const record = async (kind: "withdraw" | "erase", payload: unknown) => {
        const prepared = prepareAtlasFindingIntent(payload);
        await review.recordIntent({
          intentId: deterministicUuid(`card-fields-${kind}:${schema}`), intentKind: kind, publicNumber: nothing,
          payload: prepared.payload, payloadSha256: prepared.payloadSha256, ownerReason: null, createdAt: tick(),
          retryOfIntentId: null,
        });
        const promoted = await runner.promoteAccepted();
        assert(promoted.failed.length === 0 && promoted.result.status === "promoted", `ATLAS_CARD_FIELDS_${kind}_NOT_PROMOTED`);
      };
      await record("withdraw", {
        schema: "askrigor.atlas-finding-intent.v1", kind: "withdraw", publicNumber: nothing, version: 1,
        note: "Withdrawn: the search terms named a person.", decidedWith: ATLAS_DECIDED_WITH,
      });
      await record("erase", {
        schema: "askrigor.atlas-finding-intent.v1", kind: "erase", publicNumber: nothing, version: 2,
        scope: "all_versions", reasonCode: "could_identify_a_person", decidedWith: ATLAS_DECIDED_WITH,
      });
      const erasedRows = await admin.query<{
        version_number: number; program_or_exposure: string; direction: string; kind: string; subject_type: string;
        search_scope: Array<{ database: string; query: string }>;
      }>(
        `SELECT version.version_number, claimed.program_or_exposure, claimed.direction, version.kind,
                version.subject_type, version.search_scope
           FROM ${schema}.atlas_finding_versions version
           JOIN ${schema}.claim_versions claimed ON claimed.version_id = version.claim_version_id
          WHERE version.finding_id = $1 ORDER BY version.version_number`,
        [nothingVersion.finding_id],
      );
      assert(
        erasedRows.rows.length === 2 && erasedRows.rows.every((row) =>
          row.program_or_exposure === ATLAS_ERASED && row.direction === "descriptive" && row.kind === "nothing_found" &&
          row.subject_type === "supplement" &&
          isDeepStrictEqual(row.search_scope, withoutQueries)),
        "ATLAS_CARD_FIELDS_ERASE_MISMATCH",
      );
      const leftover = await admin.query<{ rows: string }>(
        `SELECT concat_ws(' ', (SELECT json_agg(row_to_json(version))::text FROM ${schema}.atlas_finding_versions version),
                (SELECT json_agg(intent.payload_json)::text FROM ${schema}.atlas_finding_intents intent
                  WHERE intent.public_number = $1)) AS rows`,
        [nothing],
      );
      assert(!leftover.rows[0]!.rows.includes("zentarine children"), "ATLAS_CARD_FIELDS_QUERY_LEFT_AFTER_ERASURE");
      checks.push("atlas_erasure_takes_the_subject_and_the_searches_queries_and_keeps_kind_type_direction_and_databases");

      // A second migrate on the populated database changes nothing.
      const before = await atlasMigrationSnapshot(admin, schema);
      const again = new PostgresEvidenceRepository({ connectionString: adminUrl, schema });
      try {
        await again.migrate();
      } finally {
        await again.close();
      }
      assert(await atlasMigrationSnapshot(admin, schema) === before, "ATLAS_CARD_FIELDS_SECOND_MIGRATE_CHANGED_SOMETHING");
      checks.push("migration_0018_on_a_populated_database_changes_nothing_when_run_again");
    } finally {
      await Promise.allSettled([reader.close(), review.close(), runner.close()]);
    }
  } finally {
    await admin.end();
  }
}

/**
 * Atlas phase 2, parts C and D (design section 7): the hermetic end-to-end scenario of
 * tests/atlas-acceptance-end-to-end.test.ts against PostgreSQL, forget_card included. The owner's tool, the real
 * findings library save and signed receipts, an in-memory GitHub and the providers' recorded fixtures, with the review
 * store, the canonical reader and the runner in PostgreSQL, in a schema of their own so the scenario's numbers start
 * at F-1001. The role boundaries are verifyAtlasStorage's.
 */
export async function verifyAtlasScenario(context: { adminUrl: string; schema: string; checks: string[] }): Promise<void> {
  const scenarioSchema = `${context.schema}_atlas_scenario`;
  // The package the owner's tool imports (built), so the stores' errors are the classes the tool recognizes.
  const atlas = await import("@askrigor/evidence-repository");
  const { runAtlasScenario } = await import("../tests/helpers/atlas-scenario.ts");
  const repository = new atlas.PostgresEvidenceRepository({ connectionString: context.adminUrl, schema: scenarioSchema });
  try {
    await repository.migrate();
  } finally {
    await repository.close();
  }
  const options = { connectionString: context.adminUrl, schema: scenarioSchema };
  const review = new atlas.PostgresAtlasReviewStore(options);
  const reader = new atlas.PostgresAtlasReader(options);
  const promotions = new atlas.PostgresAtlasPromotionStore(options);
  const admin = new Pool({ connectionString: context.adminUrl, max: 1 });
  try {
    const report = await runAtlasScenario((clock) => {
      const runner = new atlas.AtlasFindingPromotionRunner(promotions, { now: () => clock().toISOString() });
      return {
        review,
        reader,
        promote: () => runner.promoteAccepted(),
        rows: async () => {
          const tables = [
            ...ATLAS_CANONICAL_TABLES, "atlas_finding_intents", "research_runs", "topics", "questions", "claims",
            "claim_versions", "claim_edges", "source_families", "source_identifiers", "source_versions",
            "evidence_bindings", "repository_events",
          ];
          const dumped = await Promise.all(tables.map(async (table) => (await admin.query<{ rows: string }>(
            `SELECT coalesce(json_agg(row_to_json(stored)), '[]'::json)::text AS rows FROM ${scenarioSchema}.${table} stored`,
          )).rows[0]!.rows));
          return dumped.join("\n");
        },
      };
    });
    assert(report.steps.length === 7, "ATLAS_SCENARIO_INCOMPLETE");
    context.checks.push("atlas_scenario_save_list_inspect_accept_lead_link_correct_forget_and_scan_against_postgresql");
  } finally {
    await Promise.allSettled([review.close(), reader.close(), promotions.close(), admin.end()]);
  }
}

/** The owner's Atlas decisions through the review role, and the runner's canonical writes. */
export async function verifyAtlasStorage(context: {
  adminUrl: string;
  reviewUrl: string;
  readerUrl: string;
  schema: string;
  checks: string[];
}): Promise<void> {
  const { adminUrl, reviewUrl, readerUrl, schema, checks } = context;
  const admin = new Pool({ connectionString: adminUrl, max: 2 });
  const reviewPool = new Pool({ connectionString: reviewUrl, max: 1 });
  const review = new PostgresAtlasReviewStore({ connectionString: reviewUrl, schema });
  const reader = new PostgresAtlasReader({ connectionString: readerUrl, schema });
  let instant = Date.parse("2026-10-22T12:00:00.000Z");
  const tick = () => new Date(instant += 1_000).toISOString();
  const runner = new AtlasFindingPromotionRunner(
    new PostgresAtlasPromotionStore({ connectionString: adminUrl, schema }),
    { now: tick },
  );
  const writer = new PostgresAtlasWriter({ connectionString: adminUrl, schema }, { now: tick });
  let intentSequence = 0;
  const nextIntentId = () => deterministicUuid(`atlas-acceptance-intent:${schema}:${intentSequence++}`);
  const decide = (
    card: number,
    itemKind: AtlasCardItemKind,
    itemNumber: number,
    decision: AtlasCardDecision,
    payload: unknown,
    options: { reason?: string; rechecked?: string } = {},
  ) => {
    const prepared = payload === null ? null : prepareAtlasFindingIntent(payload);
    return review.decide({
      cardNumber: card,
      itemKind,
      itemNumber,
      decision,
      cardSha256: atlasCardSha256(card),
      ownerReason: options.reason ?? null,
      decidedAt: tick(),
      intent: prepared === null ? null : { intentId: nextIntentId(), ...prepared },
      recheckedPublicNumber: options.rechecked ?? null,
    });
  };
  const record = (payload: unknown, retryOf: string | null = null) => {
    const prepared = prepareAtlasFindingIntent(payload);
    const intent = prepared.payload;
    if (intent.kind === "accept" || intent.kind === "recheck") throw new Error("ATLAS_ACCEPTANCE_RECORD_KIND");
    return review.recordIntent({
      intentId: nextIntentId(),
      intentKind: intent.kind,
      publicNumber: intent.publicNumber,
      payload: intent,
      payloadSha256: prepared.payloadSha256,
      ownerReason: null,
      createdAt: tick(),
      retryOfIntentId: retryOf,
    });
  };
  const promote = async (code: string) => {
    const run: AtlasFindingPromotionRun = await runner.promoteAccepted();
    if (run.failed.length !== 0 || run.result.status !== "promoted") throw new Error(`${code} ${JSON.stringify(run)}`);
    return run.result;
  };
  const label = async (publicNumber: string) => (await admin.query<{ label: string }>(
    `SELECT label FROM ${schema}.atlas_finding_current WHERE public_number = $1`,
    [publicNumber],
  )).rows[0]?.label;
  const versionsOf = async (publicNumber: string) => (await admin.query<{
    version_number: number;
    claim_version_id: string;
    status: string;
    supersedes_claim_version_id: string | null;
  }>(
    `SELECT version.version_number, version.claim_version_id, claimed.status, claimed.supersedes_claim_version_id
       FROM ${schema}.atlas_finding_versions version
       JOIN ${schema}.atlas_findings finding ON finding.finding_id = version.finding_id
       JOIN ${schema}.claim_versions claimed ON claimed.version_id = version.claim_version_id
      WHERE finding.public_number = $1
      ORDER BY version.version_number`,
    [publicNumber],
  )).rows;
  const changesOf = async (publicNumber: string) => (await admin.query<{
    change_kind: string;
    label_before: string | null;
    label_after: string;
    public_note: string | null;
    research_checked_on: string | null;
    claim_version_id: string | null;
  }>(
    `SELECT change.change_kind, change.label_before, change.label_after, change.public_note,
            to_char(change.research_checked_on, 'YYYY-MM-DD') AS research_checked_on, change.claim_version_id
       FROM ${schema}.atlas_finding_changes change
       JOIN ${schema}.atlas_findings finding ON finding.finding_id = change.finding_id
      WHERE finding.public_number = $1
      ORDER BY change.inserted_at, change.change_id`,
    [publicNumber],
  )).rows;
  const asRole = async <T>(role: string, work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> => {
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query(`SET LOCAL search_path TO ${schema}, public`);
      return await work(client);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  };
  try {
    // An accepted finding with a verified basis is stored as checked, bound to its study by DOI.
    const numbersA = [{
      outcome: "relapse by 12 weeks", better: "fewer", option: "zentarine 20 mg", option_events: 18,
      option_total: 120, comparator: "placebo", comparator_events: 30, comparator_total: 120, follow_up: "12 weeks",
      nnt: 10, harms_none_found: true,
    }];
    const acceptA = atlasAccept({
      wording: "In two invented trials, zentarine 20 mg cut 12-week relapse from 30 of 120 to 18 of 120 adults.",
      bases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-1", tick())],
      numbers: numbersA,
    });
    const decisionA = await decide(9001, "finding", 1, "accepted", acceptA);
    const findingA = decisionA.publicNumber!;
    assert(/^F-[1-9][0-9]{3,}$/u.test(findingA) && decisionA.intent?.status === "PENDING", "ATLAS_ACCEPT_NOT_QUEUED");
    const promotedA = await promote("ATLAS_ACCEPT_NOT_PROMOTED");
    assert(
      promotedA.receipt.writerReceipt.status === "inserted" && promotedA.receipt.publicNumber === findingA &&
        await label(findingA) === "checked",
      "ATLAS_ACCEPTED_FINDING_NOT_CHECKED",
    );
    const boundA = await admin.query<{ polarity: string; extraction_type: string; access_status: string }>(
      `SELECT binding.polarity, binding.extraction_type, source.access_status
         FROM ${schema}.evidence_bindings binding
         JOIN ${schema}.source_versions source ON source.version_id = binding.source_version_id
         JOIN ${schema}.atlas_finding_versions version ON version.claim_version_id = binding.claim_version_id
         JOIN ${schema}.atlas_findings finding ON finding.finding_id = version.finding_id
        WHERE finding.public_number = $1`,
      [findingA],
    );
    assert(
      boundA.rows.length === 1 && boundA.rows[0]!.polarity === "supports" &&
        boundA.rows[0]!.extraction_type === "authored_synthesis" && boundA.rows[0]!.access_status === "metadata_only",
      "ATLAS_ACCEPTED_SOURCE_NOT_BOUND",
    );
    const replayedDecision = await decide(9001, "finding", 1, "accepted", acceptA);
    assert(
      replayedDecision.publicNumber === findingA && replayedDecision.intentId === decisionA.intentId,
      "ATLAS_DECISION_REPLAY_CHANGED",
    );
    checks.push("atlas_accept_queues_a_hash_bound_intent_and_the_runner_writes_a_checked_finding_bound_to_its_study");

    // A finding without a verified basis, and a card's open lead, are stored as leads (3b).
    const acceptB = atlasAccept({
      wording: "An invented case series reported fewer relapses on zentarine.",
      bases: [],
      sources: [atlasSource("10.0000/synthetic-velmor-2", tick())],
      entry: "unverified_finding",
    });
    const findingB = (await decide(9001, "finding", 2, "accepted_as_lead", acceptB)).publicNumber!;
    await promote("ATLAS_LEAD_NOT_PROMOTED");
    const acceptC = atlasAccept({
      wording: "Whether zentarine helps children with Velmor syndrome is untested.",
      bases: [],
      sources: [],
      entry: "open_lead",
    });
    const findingC = (await decide(9001, "open_lead", 1, "accepted_as_lead", acceptC)).publicNumber!;
    await promote("ATLAS_OPEN_LEAD_NOT_PROMOTED");
    assert(await label(findingB) === "lead" && await label(findingC) === "lead", "ATLAS_LEADS_NOT_LABELED_LEAD");
    checks.push("atlas_leads_from_an_unverified_finding_and_an_open_lead_are_stored_as_leads");

    // A second card contradicts the first finding at a lower dose; the owner links them and both turn contested.
    const acceptD = atlasAccept({
      wording: "At 5 mg, zentarine did not reduce 12-week relapse in an invented trial of adults.",
      bases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-3", tick())],
    });
    const findingD = (await decide(9002, "finding", 1, "accepted", acceptD)).publicNumber!;
    await promote("ATLAS_SECOND_FINDING_NOT_PROMOTED");
    await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "link", publicNumber: findingD, relation: "contradicts",
      toPublicNumber: findingA, disagreement: "dose", rationale: "The two invented trials disagree at different doses.",
      decidedWith: ATLAS_DECIDED_WITH,
    });
    await promote("ATLAS_CONTRADICTS_LINK_NOT_PROMOTED");
    assert(await label(findingA) === "contested" && await label(findingD) === "contested", "ATLAS_NOT_CONTESTED");
    checks.push("atlas_contradicts_link_makes_both_findings_contested");

    // A correction with a dated note, then a wording fix: versions 2 and 3 in one line, the label kept.
    await record(atlasRevise(findingA, 1, "corrected",
      "In two invented trials, zentarine 20 mg cut 12-week relapse from 30 of 120 to 19 of 120 adults.",
      "The second trial's relapse count was 19, not 18.", tick()));
    await promote("ATLAS_CORRECTION_NOT_PROMOTED");
    await record(atlasRevise(findingA, 2, "edited",
      "In two invented trials, zentarine 20 mg cut relapse by week 12 from 30 of 120 to 19 of 120 adults.", null, tick()));
    await promote("ATLAS_WORDING_FIX_NOT_PROMOTED");
    const chainA = await versionsOf(findingA);
    const changesA = await changesOf(findingA);
    assert(
      chainA.length === 3 && chainA[0]!.supersedes_claim_version_id === null &&
        chainA[1]!.supersedes_claim_version_id === chainA[0]!.claim_version_id &&
        chainA[2]!.supersedes_claim_version_id === chainA[1]!.claim_version_id &&
        changesA.map(({ change_kind: kind }) => kind).join() === "accepted,relabeled,corrected,edited" &&
        changesA[2]!.public_note === "The second trial's relapse count was 19, not 18." &&
        await label(findingA) === "contested",
      "ATLAS_CORRECTION_CHAIN_MISMATCH",
    );
    checks.push("atlas_correction_chain_writes_versions_two_and_three_with_a_dated_note_and_keeps_the_label");

    // A checked finding replaces the earlier lead, which turns superseded with a status-only version.
    const acceptF = atlasAccept({
      wording: "In a larger invented trial, zentarine 20 mg cut relapse in adults over 24 weeks.",
      bases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-5", tick())],
    });
    const findingF = (await decide(9003, "finding", 1, "accepted", acceptF)).publicNumber!;
    await promote("ATLAS_REPLACING_FINDING_NOT_PROMOTED");
    await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "link", publicNumber: findingF, relation: "replaces",
      toPublicNumber: findingB, disagreement: null, rationale: "The larger trial replaces the earlier case series.",
      decidedWith: ATLAS_DECIDED_WITH,
    });
    await promote("ATLAS_REPLACES_LINK_NOT_PROMOTED");
    const chainB = await versionsOf(findingB);
    assert(
      await label(findingB) === "superseded" && chainB.length === 2 && chainB[1]!.status === "superseded" &&
        await label(findingF) === "checked",
      "ATLAS_LEAD_NOT_SUPERSEDED",
    );
    checks.push("atlas_replaces_link_supersedes_the_older_lead_with_a_status_only_version");

    // Withdrawing one side of the contradiction returns the other to checked.
    await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "withdraw", publicNumber: findingD, version: 1,
      note: "The invented 5 mg trial was a duplicate report.", decidedWith: ATLAS_DECIDED_WITH,
    });
    await promote("ATLAS_WITHDRAWAL_NOT_PROMOTED");
    const chainD = await versionsOf(findingD);
    const relabeledA = (await changesOf(findingA)).at(-1)!;
    assert(
      await label(findingD) === "withdrawn" && chainD.at(-1)!.status === "invalidated" &&
        await label(findingA) === "checked" && relabeledA.change_kind === "relabeled" &&
        relabeledA.label_before === "contested" && relabeledA.label_after === "checked",
      "ATLAS_WITHDRAWAL_DID_NOT_RELABEL",
    );
    checks.push("atlas_withdrawal_invalidates_the_finding_and_returns_its_contradiction_partner_to_checked");

    // An exact re-check that brings a verified basis relabels the open lead to checked.
    await decide(9004, "finding", 1, "rechecked", {
      schema: "askrigor.atlas-finding-intent.v1", kind: "recheck", publicNumber: findingC,
      cardWordingKey: acceptC.wordingKeys.card, verifiedBases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-6", tick())], researchCheckedOn: "2026-10-22",
      madeWith: ATLAS_MADE_WITH,
    }, { rechecked: findingC });
    await promote("ATLAS_RECHECK_NOT_PROMOTED");
    const recheckC = (await changesOf(findingC)).at(-1)!;
    assert(
      await label(findingC) === "checked" && recheckC.change_kind === "rechecked" &&
        recheckC.research_checked_on === "2026-10-22" && recheckC.claim_version_id !== null &&
        recheckC.label_before === "lead",
      "ATLAS_RECHECK_DID_NOT_RELABEL_THE_LEAD",
    );
    checks.push("atlas_exact_recheck_with_a_verified_basis_relabels_a_lead_to_checked");

    // A stale version, an identifier conflict and the missing finding it leaves each end FAILED with its code, and the
    // next intent promotes in the same activation.
    const familyOne = deterministicUuid(`atlas-acceptance-conflict-one:${schema}`);
    const familyTwo = deterministicUuid(`atlas-acceptance-conflict-two:${schema}`);
    await admin.query(
      `INSERT INTO ${schema}.source_families (family_id, source_kind, identity_hash, display_title)
       VALUES ($1, 'study', $2, 'Synthetic conflict one'), ($3, 'study', $4, 'Synthetic conflict two')`,
      [familyOne, atlasHex(`conflict-one:${schema}`), familyTwo, atlasHex(`conflict-two:${schema}`)],
    );
    await admin.query(
      `INSERT INTO ${schema}.source_identifiers (family_id, scheme, canonical_value)
       VALUES ($1, 'doi', '10.0000/synthetic-conflict-one'), ($2, 'pmid', '990001')`,
      [familyOne, familyTwo],
    );
    const stale = await record(atlasRevise(findingA, 1, "edited", "A stale edit of the first version.", null, tick()));
    const conflictWording = "In an invented crossover trial, zentarine 20 mg cut relapse in adults.";
    const conflicting = await decide(9005, "finding", 1, "accepted", atlasAccept({
      wording: conflictWording,
      bases: ["full_text_audit"],
      sources: [{
        ...atlasSource("10.0000/synthetic-conflict-one", tick()),
        identifiers: [{ scheme: "doi", value: "10.0000/synthetic-conflict-one" }, { scheme: "pmid", value: "990001" }],
      }],
    }));
    const missing = await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "withdraw", publicNumber: conflicting.publicNumber!, version: 1,
      note: "Withdrawn before it was written.", decidedWith: ATLAS_DECIDED_WITH,
    });
    const sameAs = await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "link", publicNumber: findingF, relation: "same_as",
      toPublicNumber: findingA, disagreement: null, rationale: "Both report the 20 mg effect on relapse.",
      decidedWith: ATLAS_DECIDED_WITH,
    });
    const moved = await runner.promoteAccepted();
    assert(
      moved.failed.map(({ intentId, failureCode }) => `${intentId}:${failureCode}`).join() === [
        `${stale.intentId}:ATLAS_VERSION_STALE`,
        `${conflicting.intentId}:SOURCE_IDENTIFIER_CONFLICT`,
        `${missing.intentId}:ATLAS_FINDING_MISSING`,
      ].join() && moved.result.status === "promoted" && moved.result.receipt.intentId === sameAs.intentId,
      `ATLAS_FAILURE_CODES_MISMATCH ${JSON.stringify(moved)}`,
    );
    const unwritten = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.atlas_intent_applications WHERE intent_id = ANY($1::uuid[])`,
      [[stale.intentId, conflicting.intentId!, missing.intentId]],
    );
    const shown = await review.inspectIntents(null);
    assert(
      unwritten.rows[0]?.count === 0 &&
        shown.some(({ intentId, failureCode }) => intentId === missing.intentId && failureCode === "ATLAS_FINDING_MISSING"),
      "ATLAS_FAILED_INTENT_WROTE_ROWS_OR_IS_HIDDEN",
    );
    checks.push("atlas_stale_version_missing_finding_and_identifier_conflict_fail_with_codes_and_the_next_intent_promotes");

    // The failed accept is retried under its number, with a source that does not conflict.
    const retried = await decide(9005, "finding", 1, "accepted", atlasAccept({
      wording: conflictWording,
      bases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-7", tick())],
    }));
    assert(
      retried.publicNumber === conflicting.publicNumber && retried.intentId !== conflicting.intentId &&
        retried.intent?.retryOfIntentId === conflicting.intentId,
      "ATLAS_RETRY_NOT_UNDER_ITS_NUMBER",
    );
    await promote("ATLAS_RETRY_NOT_PROMOTED");
    assert(await label(retried.publicNumber!) === "checked", "ATLAS_RETRIED_FINDING_NOT_CHECKED");
    checks.push("atlas_a_failed_accept_is_retried_under_its_number");

    // The writer commits but the receipt does not (a crash between them): the next run completes it by replay.
    const decisionJ = await decide(9006, "finding", 1, "accepted", atlasAccept({
      wording: "An invented registry search found no relapse data for zentarine beyond 24 weeks.",
      bases: ["bounded_absence"],
      sources: [atlasSource("10.0000/synthetic-velmor-8", tick())],
    }));
    const [storedJ] = await review.inspectIntents([decisionJ.publicNumber!]) as AtlasIntentView[];
    const intentJ = {
      intentId: storedJ!.intentId,
      intentKind: storedJ!.intentKind,
      publicNumber: storedJ!.publicNumber,
      payload: storedJ!.payload,
      payloadSha256: storedJ!.payloadSha256,
      createdAt: storedJ!.createdAt,
    };
    const direct = await writer.contributeAtlasFinding(intentJ);
    const pendingJ = (await review.inspectIntents([decisionJ.publicNumber!]))[0];
    const replayed = await promote("ATLAS_REPLAY_NOT_PROMOTED");
    assert(
      direct.status === "inserted" && pendingJ?.status === "PENDING" &&
        replayed.receipt.writerReceipt.status === "idempotent_replay" &&
        JSON.stringify({ ...direct, status: null }) === JSON.stringify({ ...replayed.receipt.writerReceipt, status: null }) &&
        (await writer.contributeAtlasFinding(intentJ)).status === "idempotent_replay",
      "ATLAS_REPLAY_DID_NOT_COMPLETE_THE_INTENT",
    );
    checks.push("atlas_writer_commit_before_the_receipt_is_completed_by_idempotent_replay");

    // An accept under a number already written is refused with its code, from the writer's own read, writing nothing.
    const rewrite = prepareAtlasFindingIntent(atlasAccept({
      wording: "A second accept under a number already written.",
      bases: ["full_text_audit"],
      sources: [atlasSource("10.0000/synthetic-velmor-9", tick())],
    }));
    const rewriteIntentId = deterministicUuid(`atlas-acceptance-rewrite:${schema}`);
    const refusal = await writer.contributeAtlasFinding({
      intentId: rewriteIntentId, intentKind: "accept", publicNumber: findingA, payload: rewrite.payload,
      payloadSha256: rewrite.payloadSha256, createdAt: tick(),
    }).then(() => "written", (error: unknown) => error instanceof AtlasWriteConflict ? error.code : String(error));
    const rewritten = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.atlas_intent_applications WHERE intent_id = $1`,
      [rewriteIntentId],
    );
    assert(
      refusal === "ATLAS_FINDING_ALREADY_WRITTEN" && rewritten.rows[0]?.count === 0,
      `ATLAS_WRITTEN_NUMBER_NOT_REFUSED ${refusal}`,
    );
    checks.push("atlas_an_accept_under_a_written_number_is_refused_with_its_code");

    // The contribution runner never selects an Atlas intent; the Atlas runner then withdraws the link.
    const unlink = await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "unlink", publicNumber: findingF, relation: "same_as",
      toPublicNumber: findingA, note: "They report different follow-up periods.", decidedWith: ATLAS_DECIDED_WITH,
    });
    const contributionWriter = new PostgresEvidenceRepository({ connectionString: adminUrl, schema });
    const contributionRunner = new PostgresResearchContributionPromotionRunner(
      { connectionString: adminUrl, schema },
      contributionWriter,
      { now: tick },
    );
    try {
      while ((await contributionRunner.promoteAccepted()).result.status === "promoted") { /* drain */ }
      assert(
        (await contributionRunner.promoteAccepted()).result.status === "no_pending_promotion",
        "CONTRIBUTION_RUNNER_FOUND_WORK",
      );
    } finally {
      await Promise.allSettled([contributionRunner.close(), contributionWriter.close()]);
    }
    const untouched = (await review.inspectIntents([findingF])).find(({ intentId }) => intentId === unlink.intentId);
    assert(untouched?.status === "PENDING", "ATLAS_INTENT_TOUCHED_BY_THE_CONTRIBUTION_RUNNER");
    await promote("ATLAS_UNLINK_NOT_PROMOTED");
    const withdrawnLinks = await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.atlas_finding_link_withdrawals`,
    );
    assert(withdrawnLinks.rows[0]?.count === 1, "ATLAS_LINK_NOT_WITHDRAWN");
    checks.push("the_contribution_runner_never_selects_an_atlas_intent_and_the_atlas_runner_withdraws_the_link");

    // Conflicting decisions are refused; a card is forgotten, its decisions with it, and the findings stay.
    await expectAtlasReviewCode(
      () => decide(9001, "finding", 1, "rejected", null, { reason: "A different decision." }),
      "DECISION_CONFLICT",
    );
    const rejected = await decide(9002, "finding", 2, "rejected", null, { reason: "Not general enough." });
    assert(rejected.publicNumber === null && rejected.intent === null, "ATLAS_REJECTION_QUEUED_AN_INTENT");
    await expectAtlasReviewCode(() => decide(9007, "finding", 1, "rechecked", {
      schema: "askrigor.atlas-finding-intent.v1", kind: "recheck", publicNumber: "F-9999",
      cardWordingKey: atlasHex("nothing"), verifiedBases: [], sources: [], researchCheckedOn: "2026-10-22",
      madeWith: ATLAS_MADE_WITH,
    }, { rechecked: "F-9999" }), "FINDING_NOT_FOUND");
    // Every row the Atlas and the canonical store hold, by table: forgetting a card deletes its decision rows only.
    const everyCount = async () => (await admin.query<Record<string, number>>(
      `SELECT ${[
        ...ATLAS_CANONICAL_TABLES, "atlas_finding_intents", "atlas_card_decisions", "research_runs", "topics",
        "questions", "claims", "claim_versions", "claim_edges", "evidence_bindings", "repository_events",
      ].map((table) => `(SELECT count(*)::int FROM ${schema}.${table}) AS ${table}`).join(", ")}`,
    )).rows[0]!;
    const withoutDecisions = (counts: Record<string, number>) => JSON.stringify({ ...counts, atlas_card_decisions: null });
    const countsBefore = await everyCount();
    const intentsBefore = (await admin.query<{ rows: string }>(
      `SELECT coalesce(json_agg(row_to_json(stored) ORDER BY stored.queue_position), '[]'::json)::text AS rows
         FROM ${schema}.atlas_finding_intents stored`,
    )).rows[0]!.rows;
    const forgotten = await reviewPool.query<{
      item_kind: string;
      item_number: number;
      public_number: string | null;
      public_number_named_elsewhere: boolean;
    }>(`SELECT * FROM ${schema}.forget_atlas_cards(ARRAY[9001], $1::timestamptz)`, [tick()]);
    const named = new Map(forgotten.rows.map((row) => [row.public_number, row.public_number_named_elsewhere]));
    const countsAfter = await everyCount();
    const intentsAfter = (await admin.query<{ rows: string }>(
      `SELECT coalesce(json_agg(row_to_json(stored) ORDER BY stored.queue_position), '[]'::json)::text AS rows
         FROM ${schema}.atlas_finding_intents stored`,
    )).rows[0]!.rows;
    assert(
      forgotten.rows.length === 3 && named.get(findingA) === false && named.get(findingB) === false &&
        named.get(findingC) === true && (await review.inspectCards([9001])).length === 0 &&
        countsAfter.atlas_card_decisions === countsBefore.atlas_card_decisions! - 3 &&
        withoutDecisions(countsAfter) === withoutDecisions(countsBefore) && intentsAfter === intentsBefore,
      "ATLAS_FORGET_MISMATCH",
    );
    // Through the review store, as forget_card calls it (decision 7): the rejected item's row and its private reason go
    // too; an empty list or a card number below 1 is refused.
    const viaStore = await review.forgetCards([9002], tick());
    assert(
      viaStore.map(({ itemNumber, decision, publicNumber, publicNumberNamedElsewhere }) =>
        `${itemNumber}:${decision}:${publicNumber}:${publicNumberNamedElsewhere}`).join() ===
        `1:accepted:${findingD}:false,2:rejected:null:false` &&
        (await review.inspectCards([9002])).length === 0,
      "ATLAS_FORGET_THROUGH_THE_STORE_MISMATCH",
    );
    await expectAtlasReviewCode(() => review.forgetCards([], tick()), "INPUT_INVALID");
    await expectAtlasReviewCode(() => review.forgetCards([0], tick()), "INPUT_INVALID");
    checks.push("atlas_conflicting_decisions_are_refused_and_forgetting_a_card_deletes_its_decision_rows_and_nothing_else");

    // Wording changes only through erase_atlas_wording, for the version a redaction row names, and only to the marker.
    const chain = await versionsOf(findingA);
    const versionOne = chain[0]!.claim_version_id;
    const versionTwo = chain[1]!.claim_version_id;
    const findingIdA = (await admin.query<{ finding_id: string; created_by_run_id: string }>(
      `SELECT finding_id, created_by_run_id FROM ${schema}.atlas_findings WHERE public_number = $1`,
      [findingA],
    )).rows[0]!;
    await expectMessage(() => admin.query(
      `UPDATE ${schema}.claim_versions SET normalized_assertion = '${ATLAS_ERASED}' WHERE version_id = $1`,
      [versionTwo],
    ), "APPEND_ONLY_TABLE");
    const redactionId = deterministicUuid(`atlas-acceptance-redaction:${schema}`);
    await admin.query(
      `INSERT INTO ${schema}.atlas_redactions (redaction_id, finding_id, claim_version_id, reason_code, decided_at, run_id)
       VALUES ($1, $2, $3, 'could_identify_a_person', $4, $5)`,
      [redactionId, findingIdA.finding_id, versionTwo, tick(), findingIdA.created_by_run_id],
    );
    const underRedaction = async (sql: string, values: unknown[]) => {
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('askrigor.atlas_erasing_redaction', $1, true)", [redactionId]);
        await client.query(sql, values);
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    };
    // A link that does not touch findingA (findingF replaces findingB), and findingA's question, which other findings
    // answer: neither may change under findingA's redaction.
    const foreignLink = (await admin.query<{ link_id: string }>(
      `SELECT link.link_id FROM ${schema}.atlas_finding_links link
         JOIN ${schema}.atlas_findings source ON source.finding_id = link.from_finding_id
        WHERE source.public_number = $1 AND link.relation = 'replaces'`,
      [findingF],
    )).rows[0]!.link_id;
    const linkOfA = (await admin.query<{ link_id: string }>(
      `SELECT link.link_id FROM ${schema}.atlas_finding_links link
        WHERE link.to_finding_id = $1 AND link.relation = 'contradicts'`,
      [findingIdA.finding_id],
    )).rows[0]!.link_id;
    const questionOfA = (await admin.query<{ question_id: string }>(
      `SELECT claim.question_id FROM ${schema}.atlas_findings finding
         JOIN ${schema}.claims claim ON claim.claim_id = finding.claim_id
        WHERE finding.finding_id = $1`,
      [findingIdA.finding_id],
    )).rows[0]!.question_id;
    // Without a redaction row in force, no wording changes at all, not even to the marker.
    for (const [sql, values] of [
      [`UPDATE ${schema}.atlas_finding_links SET rationale = '${ATLAS_ERASED}' WHERE link_id = $1`, [linkOfA]],
      [`UPDATE ${schema}.questions SET normalized_question = '${ATLAS_ERASED}' WHERE question_id = $1`, [questionOfA]],
      [`UPDATE ${schema}.atlas_finding_versions SET numbers = '[]'::jsonb WHERE claim_version_id = $1`, [versionTwo]],
    ] as const) {
      await expectMessage(() => admin.query(sql, [...values]), "APPEND_ONLY_TABLE");
    }
    for (const [sql, values] of [
      [`UPDATE ${schema}.claim_versions SET normalized_assertion = 'Another wording' WHERE version_id = $1`, [versionTwo]],
      [`UPDATE ${schema}.claim_versions SET status = 'invalidated' WHERE version_id = $1`, [versionTwo]],
      [`UPDATE ${schema}.claim_versions SET normalized_assertion = '${ATLAS_ERASED}' WHERE version_id = $1`, [versionOne]],
      [`UPDATE ${schema}.atlas_finding_versions SET certainty = 'low' WHERE claim_version_id = $1`, [versionTwo]],
      [`UPDATE ${schema}.atlas_finding_versions SET numbers = '[{"outcome":"${ATLAS_ERASED}"}]'::jsonb
         WHERE claim_version_id = $1`, [versionTwo]],
      [`UPDATE ${schema}.atlas_findings SET entry_kind = 'lead' WHERE finding_id = $1`, [findingIdA.finding_id]],
      [`UPDATE ${schema}.atlas_finding_links SET rationale = 'Another rationale' WHERE link_id = $1`, [linkOfA]],
      [`UPDATE ${schema}.atlas_finding_links SET disagreement = 'population' WHERE link_id = $1`, [linkOfA]],
      [`UPDATE ${schema}.atlas_finding_links SET rationale = '${ATLAS_ERASED}' WHERE link_id = $1`, [foreignLink]],
      [`UPDATE ${schema}.atlas_finding_link_withdrawals SET decided_at = decided_at + interval '1 second'
         WHERE link_id IN (SELECT link_id FROM ${schema}.atlas_finding_links WHERE to_finding_id = $1)`,
        [findingIdA.finding_id]],
      [`UPDATE ${schema}.questions SET normalized_question = '${ATLAS_ERASED}' WHERE question_id = $1`, [questionOfA]],
      [`UPDATE ${schema}.topics SET label = '${ATLAS_ERASED}'`, []],
      [`DELETE FROM ${schema}.claim_versions WHERE version_id = $1`, [versionTwo]],
    ] as const) {
      await expectMessage(() => underRedaction(sql, [...values]), "APPEND_ONLY_TABLE");
    }
    const wordingOf = async (versionId: string) => (await admin.query<{ claimed: Record<string, unknown>; atlas: Record<string, unknown>; notes: Array<string | null> }>(
      `SELECT row_to_json(claimed.*)::jsonb AS claimed, row_to_json(version.*)::jsonb AS atlas,
              (SELECT coalesce(jsonb_agg(change.public_note ORDER BY change.change_id), '[]'::jsonb)
                 FROM ${schema}.atlas_finding_changes change WHERE change.claim_version_id = $1) AS notes
         FROM ${schema}.claim_versions claimed
         JOIN ${schema}.atlas_finding_versions version ON version.claim_version_id = claimed.version_id
        WHERE claimed.version_id = $1`,
      [versionId],
    )).rows[0]!;
    const twoBefore = await wordingOf(versionTwo);
    const oneBefore = await wordingOf(versionOne);
    const linksOfA = async () => (await admin.query<{ relation: string; rationale: string; note: string | null }>(
      `SELECT link.relation, link.rationale, withdrawal.public_note AS note
         FROM ${schema}.atlas_finding_links link
         LEFT JOIN ${schema}.atlas_finding_link_withdrawals withdrawal ON withdrawal.link_id = link.link_id
        WHERE link.from_finding_id = $1 OR link.to_finding_id = $1
        ORDER BY link.relation`,
      [findingIdA.finding_id],
    )).rows;
    const questionText = async () => (await admin.query<{ text: string }>(
      `SELECT normalized_question AS text FROM ${schema}.questions WHERE question_id = $1`,
      [questionOfA],
    )).rows[0]!.text;
    const linksBefore = await linksOfA();
    const foreignBefore = (await admin.query<{ rationale: string }>(
      `SELECT rationale FROM ${schema}.atlas_finding_links WHERE link_id = $1`, [foreignLink])).rows[0]!.rationale;
    const erased = await admin.query<{ changed: number }>(
      `SELECT ${schema}.erase_atlas_wording($1) AS changed`,
      [redactionId],
    );
    const twoAfter = await wordingOf(versionTwo);
    const textColumns = ["normalized_assertion", "population"];
    const atlasTextColumns = ["usual_answer", "why_not_usual", "what_would_change_it", "who_else", "what_it_changes"];
    const without = (row: Record<string, unknown>, keys: string[]) =>
      JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)).sort()));
    // Six rows: the version's claim and Atlas rows, the note of its correction, the rationale of findingA's two links
    // and the note of the one withdrawn. Its question stays: other findings answer it.
    assert(
      erased.rows[0]?.changed === 6 &&
        textColumns.every((column) => twoAfter.claimed[column] === ATLAS_ERASED) &&
        atlasTextColumns.every((column) => twoAfter.atlas[column] === ATLAS_ERASED) &&
        twoAfter.atlas.accepted_wording_key === "0".repeat(64) && twoAfter.atlas.card_wording_key === null &&
        twoAfter.notes.join() === ATLAS_ERASED &&
        without(twoAfter.claimed, textColumns) === without(twoBefore.claimed, textColumns) &&
        without(twoAfter.atlas, [...atlasTextColumns, "accepted_wording_key"]) ===
          without(twoBefore.atlas, [...atlasTextColumns, "accepted_wording_key"]) &&
        JSON.stringify(await wordingOf(versionOne)) === JSON.stringify(oneBefore) &&
        linksBefore.length === 2 && linksBefore.every(({ rationale }) => rationale !== ATLAS_ERASED) &&
        JSON.stringify(await linksOfA()) === JSON.stringify(linksBefore.map((link) => ({
          ...link, rationale: ATLAS_ERASED, note: link.note === null ? null : ATLAS_ERASED,
        }))) &&
        (await admin.query<{ rationale: string }>(`SELECT rationale FROM ${schema}.atlas_finding_links WHERE link_id = $1`,
          [foreignLink])).rows[0]!.rationale === foreignBefore &&
        await questionText() === ATLAS_QUESTION &&
        (await admin.query<{ changed: number }>(`SELECT ${schema}.erase_atlas_wording($1) AS changed`, [redactionId]))
          .rows[0]?.changed === 0,
      "ATLAS_ERASE_MISMATCH",
    );
    const guard = await admin.query<{ definition: string }>(
      `SELECT pg_get_functiondef('${schema}.reject_living_evidence_mutation()'::regprocedure) AS definition`,
    );
    assert(
      guard.rows[0]!.definition.includes("atlas_redaction_permits(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW))"),
      "ATLAS_GUARD_BODY_LOST_ITS_REDACTION_BRANCH",
    );
    checks.push("atlas_wording_changes_only_through_erase_atlas_wording_for_what_a_redaction_row_covers");

    // Every canonical Atlas table refuses UPDATE and DELETE.
    for (const table of ATLAS_CANONICAL_TABLES) {
      const row = await admin.query<{ ctid: string }>(`SELECT ctid::text FROM ${schema}.${table} LIMIT 1`);
      assert(row.rows.length === 1, `ATLAS_TABLE_EMPTY ${table}`);
      await expectMessage(() => admin.query(
        `UPDATE ${schema}.${table} SET inserted_at = inserted_at WHERE ctid = $1::tid`,
        [row.rows[0]!.ctid],
      ), "APPEND_ONLY_TABLE");
      await expectMessage(() => admin.query(
        `DELETE FROM ${schema}.${table} WHERE ctid = $1::tid`,
        [row.rows[0]!.ctid],
      ), "APPEND_ONLY_TABLE");
    }
    checks.push("every_canonical_atlas_table_refuses_update_and_delete");

    // The review role executes the five Atlas functions (and the three contribution ones) and nothing else; it reads
    // and writes no table. The reader reads the Atlas and writes nothing.
    const executable = await admin.query<{ proname: string }>(
      `SELECT DISTINCT proc.proname FROM pg_proc proc
         JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = $1 AND has_function_privilege('askrigor_research_review', proc.oid, 'EXECUTE')
        ORDER BY proc.proname`,
      [schema],
    );
    assert(
      executable.rows.map(({ proname }) => proname).join() ===
        [...ATLAS_REVIEW_FUNCTIONS, ...CONTRIBUTION_REVIEW_FUNCTIONS].sort().join(),
      `ATLAS_REVIEW_ROLE_FUNCTIONS_MISMATCH ${executable.rows.map(({ proname }) => proname).join()}`,
    );
    const now = tick();
    await asRole("askrigor_research_review", async (client) => {
      await client.query("SELECT * FROM inspect_atlas_cards(ARRAY[9002])");
      await client.query("SELECT * FROM inspect_atlas_finding_intents(NULL)");
      await client.query(
        `SELECT * FROM decide_atlas_card_item(9010, 'finding', 1, 'rejected', $1, 'A role check.', $2::timestamptz,
           NULL, NULL, NULL, NULL)`,
        [atlasCardSha256(9010), now],
      );
      await client.query("SELECT * FROM forget_atlas_cards(ARRAY[9010], $1::timestamptz)", [now]);
    });
    await expectMessage(() => asRole("askrigor_research_review", (client) => client.query(
      `SELECT * FROM record_atlas_finding_intent($1::uuid, 'withdraw', 'F-1001', '{}'::jsonb, $2, NULL,
         $3::timestamptz, NULL)`,
      [deterministicUuid("atlas-role-check"), "0".repeat(64), now],
    )), "ATLAS_REVIEW_INPUT_INVALID");
    for (const statement of [
      "SELECT count(*) FROM atlas_card_decisions",
      "SELECT count(*) FROM atlas_finding_intents",
      "SELECT count(*) FROM atlas_findings",
      "SELECT count(*) FROM claim_versions",
      "SELECT nextval('atlas_public_number_seq')",
      `SELECT erase_atlas_wording('${redactionId}'::uuid)`,
      "SELECT atlas_redaction_permits('claim_versions', '{}'::jsonb, '{}'::jsonb)",
      `UPDATE atlas_card_decisions SET owner_reason = 'changed' WHERE card_number = 9002`,
    ]) {
      await expectPermissionDenied(() => asRole("askrigor_research_review", (client) => client.query(statement)));
    }
    const readable = await asRole("askrigor_reader", async (client) => {
      for (const table of [...ATLAS_CANONICAL_TABLES, "atlas_finding_current"]) {
        await client.query(`SELECT count(*) FROM ${table}`);
      }
      return readAtlasStateWith(client, { publicNumbers: [findingA] });
    });
    const viaReader = await reader.readAtlasState({ publicNumbers: [findingA] });
    const idA = readable.findings.find(({ publicNumber }) => publicNumber === findingA)!.findingId;
    assert(
      atlasCurrentLabels(readable, [idA]).get(idA) === "checked" &&
        atlasCurrentLabels(viaReader, [idA]).get(idA) === "checked",
      "ATLAS_READER_STATE_MISMATCH",
    );
    await expectPermissionDenied(() => asRole("askrigor_reader", (client) => client.query(
      `SELECT * FROM decide_atlas_card_item(9011, 'finding', 1, 'rejected', $1, 'A role check.', $2::timestamptz,
         NULL, NULL, NULL, NULL)`,
      [atlasCardSha256(9011), now],
    )));
    await expectPermissionDenied(() => asRole("askrigor_reader", (client) => client.query(
      "UPDATE atlas_finding_intents SET owner_reason = 'changed'",
    )));
    checks.push("atlas_review_role_executes_only_its_functions_and_the_reader_reads_without_writing");

    // The runner applies erasures (decision 7, part D). A revision and the erasure of every version before it, recorded
    // in one transaction as edit_finding records them: version 1's wording becomes the marker, version 2 stays, its
    // links' rationale goes, its shared question stays, and the accept's texts leave its intent.
    const erasing = (publicNumber: string, version: number, scope: "earlier_versions" | "all_versions") => ({
      schema: "askrigor.atlas-finding-intent.v1", kind: "erase", publicNumber, version, scope,
      reasonCode: "could_identify_a_person", decidedWith: ATLAS_DECIDED_WITH,
    });
    const asInput = (payload: unknown) => {
      const prepared = prepareAtlasFindingIntent(payload);
      const intent = prepared.payload;
      if (intent.kind === "accept" || intent.kind === "recheck") throw new Error("ATLAS_ACCEPTANCE_RECORD_KIND");
      return {
        intentId: nextIntentId(), intentKind: intent.kind, publicNumber: intent.publicNumber, payload: intent,
        payloadSha256: prepared.payloadSha256, ownerReason: null, createdAt: tick(), retryOfIntentId: null,
      };
    };
    const latestF = (await versionsOf(findingF)).at(-1)!.version_number;
    const generalF = "In a larger invented trial, zentarine 20 mg reduced relapse in adults over 24 weeks.";
    const pairF = await review.recordIntents([
      asInput(atlasRevise(findingF, latestF, "corrected", generalF, "Rewritten in general terms.", tick())),
      asInput(erasing(findingF, latestF + 1, "earlier_versions")),
    ]);
    assert(pairF.map(({ intentKind, status }) => `${intentKind}:${status}`).join() === "revise:PENDING,erase:PENDING",
      "ATLAS_ERASURE_PAIR_NOT_RECORDED");
    await promote("ATLAS_REVISION_BEFORE_ERASURE_NOT_PROMOTED");
    const erasedF = await promote("ATLAS_ERASURE_NOT_PROMOTED");
    const chainF = await versionsOf(findingF);
    const textOf = async (versionId: string) => (await admin.query<{ text: string }>(
      `SELECT normalized_assertion AS text FROM ${schema}.claim_versions WHERE version_id = $1`, [versionId])).rows[0]!.text;
    const intentsOf = async (publicNumber: string) => (await admin.query<{
      intent_kind: string;
      status: string;
      payload_json: Record<string, unknown>;
      texts_erased_at: Date | null;
    }>(
      `SELECT intent_kind, status, payload_json, texts_erased_at FROM ${schema}.atlas_finding_intents
        WHERE public_number = $1 ORDER BY queue_position`,
      [publicNumber],
    )).rows;
    const linksOfF = await admin.query<{ rationale: string }>(
      `SELECT link.rationale FROM ${schema}.atlas_finding_links link
         JOIN ${schema}.atlas_findings finding ON finding.finding_id IN (link.from_finding_id, link.to_finding_id)
        WHERE finding.public_number = $1`,
      [findingF],
    );
    const acceptOfF = (await intentsOf(findingF)).find(({ intent_kind: kind }) => kind === "accept")!;
    const reviseOfF = (await intentsOf(findingF)).filter(({ intent_kind: kind }) => kind === "revise")
      .find(({ status }) => status === "COMPLETED")!;
    const removedF = (await changesOf(findingF)).at(-1)!;
    assert(
      chainF.length === 2 && await textOf(chainF[0]!.claim_version_id) === ATLAS_ERASED &&
        await textOf(chainF[1]!.claim_version_id) === generalF &&
        erasedF.receipt.writerReceipt.claimVersionIds.join() === chainF[0]!.claim_version_id &&
        removedF.change_kind === "wording_removed" && removedF.label_before === removedF.label_after &&
        removedF.public_note === null && linksOfF.rows.length === 2 &&
        linksOfF.rows.every(({ rationale }) => rationale === ATLAS_ERASED) &&
        await questionText() === ATLAS_QUESTION &&
        acceptOfF.texts_erased_at !== null &&
        (acceptOfF.payload_json.content as { wording: string }).wording === ATLAS_ERASED &&
        acceptOfF.payload_json.question === ATLAS_QUESTION &&
        reviseOfF.texts_erased_at === null &&
        (reviseOfF.payload_json.content as { wording: string }).wording === generalF,
      `ATLAS_EARLIER_VERSIONS_ERASURE_MISMATCH ${JSON.stringify(await changesOf(findingF))}`,
    );
    checks.push("atlas_runner_erases_the_versions_before_a_new_general_version_and_their_texts_in_earlier_intents");

    // A withdrawal with the erasure of every version, for a finding whose question nothing else asks: every version,
    // the withdrawal's note and the question read as the marker, and so do the intents' texts.
    const questionK = "Does zentarine change sleep in adults with Velmor syndrome?";
    const wordingK = "In an invented trial, zentarine 20 mg did not change sleep in adults with Velmor syndrome.";
    const keyK = atlasWordingKey(questionK, wordingK);
    const findingK = (await decide(9008, "finding", 1, "accepted", {
      ...atlasAccept({ wording: wordingK, bases: ["full_text_audit"],
        sources: [atlasSource("10.0000/synthetic-velmor-10", tick())] }),
      question: questionK,
      wordingKeys: { card: keyK, accepted: keyK },
    })).publicNumber!;
    await promote("ATLAS_FINDING_FOR_ERASURE_NOT_PROMOTED");
    await review.recordIntents([
      asInput({ schema: "askrigor.atlas-finding-intent.v1", kind: "withdraw", publicNumber: findingK, version: 1,
        note: "Its wording could identify a person.", decidedWith: ATLAS_DECIDED_WITH }),
      asInput(erasing(findingK, 2, "all_versions")),
    ]);
    await promote("ATLAS_WITHDRAWAL_BEFORE_ERASURE_NOT_PROMOTED");
    await promote("ATLAS_ERASURE_OF_EVERY_VERSION_NOT_PROMOTED");
    const chainK = await versionsOf(findingK);
    const changesK = await changesOf(findingK);
    const intentsK = await intentsOf(findingK);
    const currentK = (await admin.query<{ label: string; question: string }>(
      `SELECT label, question FROM ${schema}.atlas_finding_current WHERE public_number = $1`, [findingK])).rows[0]!;
    assert(
      chainK.length === 2 && (await Promise.all(chainK.map(({ claim_version_id: id }) => textOf(id))))
        .every((text) => text === ATLAS_ERASED) &&
        changesK.map(({ change_kind: kind, public_note: note }) => `${kind}:${note}`).join() ===
          `accepted:null,withdrawn:${ATLAS_ERASED},wording_removed:null` &&
        currentK.label === "withdrawn" && currentK.question === ATLAS_ERASED &&
        intentsK.filter(({ intent_kind: kind }) => kind !== "erase").every(({ texts_erased_at: at }) => at !== null) &&
        intentsK.find(({ intent_kind: kind }) => kind === "accept")!.payload_json.question === ATLAS_ERASED &&
        intentsK.find(({ intent_kind: kind }) => kind === "withdraw")!.payload_json.note === ATLAS_ERASED,
      `ATLAS_EVERY_VERSION_ERASURE_MISMATCH ${JSON.stringify({ changesK, currentK })}`,
    );
    checks.push("atlas_runner_erases_every_version_of_a_withdrawn_finding_its_note_and_its_unshared_question");

    // A stale erasure and an erasure of every version of a finding not withdrawn end FAILED with their codes, writing
    // nothing, and the next intent promotes in the same activation: an erasure no longer holds the queue.
    const redactionsBefore = (await admin.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${schema}.atlas_redactions`)).rows[0]!.count;
    const staleErasure = await record(erasing(findingF, 1, "earlier_versions"));
    const notWithdrawn = await record(erasing(findingF, 2, "all_versions"));
    const afterErasures = await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "link", publicNumber: findingF, relation: "same_as",
      toPublicNumber: retried.publicNumber!, disagreement: null, rationale: "Both report the 20 mg effect on relapse.",
      decidedWith: ATLAS_DECIDED_WITH,
    });
    const goesOn = await runner.promoteAccepted();
    assert(
      goesOn.failed.map(({ intentId, failureCode }) => `${intentId}:${failureCode}`).join() ===
        `${staleErasure.intentId}:ATLAS_VERSION_STALE,${notWithdrawn.intentId}:ATLAS_ERASE_NOT_WITHDRAWN` &&
        goesOn.result.status === "promoted" && goesOn.result.receipt.intentId === afterErasures.intentId &&
        (await admin.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${schema}.atlas_redactions`))
          .rows[0]!.count === redactionsBefore,
      `ATLAS_ERASURE_FAILURES_MISMATCH ${JSON.stringify(goesOn)}`,
    );
    checks.push("atlas_erasure_failures_end_failed_with_their_codes_and_the_queue_goes_on");

    // An erasure the writer applied directly (a crash before the receipt) is completed by idempotent replay; a pending
    // intent's texts are never erased.
    await record(atlasRevise(findingF, 2, "edited", `${generalF.slice(0, -1)}, as a trial report says.`, null, tick()));
    await promote("ATLAS_SECOND_REVISION_NOT_PROMOTED");
    const directErasure = await record(erasing(findingF, 3, "earlier_versions"));
    const appliedDirectly = await writer.contributeAtlasFinding({
      intentId: directErasure.intentId, intentKind: "erase", publicNumber: findingF, payload: directErasure.payload,
      payloadSha256: directErasure.payloadSha256, createdAt: directErasure.createdAt,
    });
    const replayedErasure = await promote("ATLAS_ERASURE_REPLAY_NOT_PROMOTED");
    assert(
      appliedDirectly.status === "inserted" && replayedErasure.receipt.writerReceipt.status === "idempotent_replay" &&
        JSON.stringify({ ...appliedDirectly, status: null }) ===
          JSON.stringify({ ...replayedErasure.receipt.writerReceipt, status: null }) &&
        appliedDirectly.claimVersionIds.join() === (await versionsOf(findingF))[1]!.claim_version_id &&
        await textOf((await versionsOf(findingF))[1]!.claim_version_id) === ATLAS_ERASED,
      `ATLAS_ERASURE_REPLAY_MISMATCH ${JSON.stringify({ appliedDirectly, replayedErasure })}`,
    );
    const pendingLink = await record({
      schema: "askrigor.atlas-finding-intent.v1", kind: "unlink", publicNumber: findingF, relation: "same_as",
      toPublicNumber: retried.publicNumber!, note: "They report different follow-up periods.",
      decidedWith: ATLAS_DECIDED_WITH,
    });
    await expectPgCode(() => admin.query(
      `UPDATE ${schema}.atlas_finding_intents SET texts_erased_at = $2::timestamptz WHERE intent_id = $1::uuid`,
      [pendingLink.intentId, tick()],
    ), "23514");
    await promote("ATLAS_UNLINK_AFTER_ERASURES_NOT_PROMOTED");
    checks.push("atlas_an_erasure_the_writer_applied_is_completed_by_replay_and_a_pending_intent_keeps_its_texts");

    // No canonical or intent row holds a card reference, card hash, answer quote or community data.
    const stored = await admin.query<{ body: string }>(
      `SELECT jsonb_agg(row_to_json(rows.*))::text AS body FROM (
         ${ATLAS_CANONICAL_TABLES.map((table) => `SELECT '${table}' AS source, row_to_json(${table}.*)::text AS row
           FROM ${schema}.${table}`).join(" UNION ALL ")}
         UNION ALL SELECT 'intent', payload_json::text || coalesce(receipt_json::text, '')
           FROM ${schema}.atlas_finding_intents
         UNION ALL SELECT 'run', row_to_json(run.*)::text FROM ${schema}.research_runs run
           WHERE run.run_id IN (SELECT run_id FROM ${schema}.atlas_intent_applications)
         UNION ALL SELECT 'event', row_to_json(event.*)::text FROM ${schema}.repository_events event
           WHERE event.event_kind LIKE 'atlas_finding_%'
       ) rows`,
    );
    const body = stored.rows[0]!.body;
    for (const forbidden of [
      "ARF-", "answer_quote", "youtube", "comment_audit", "community_checked",
      ...[8001, 9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9010].map(atlasCardSha256),
    ]) {
      assert(!body.toLowerCase().includes(forbidden.toLowerCase()), `ATLAS_STORED_FORBIDDEN_CONTENT ${forbidden}`);
    }
    checks.push("atlas_canonical_and_intent_rows_hold_no_card_reference_answer_quote_or_community_data");

    const current = await admin.query<{ public_number: string; label: string; latest_version_number: number }>(
      `SELECT public_number, label, latest_version_number FROM ${schema}.atlas_finding_current ORDER BY public_number`,
    );
    const expected = new Map([
      [findingA, "checked"], [findingB, "superseded"], [findingC, "checked"], [findingD, "withdrawn"],
      [findingF, "checked"], [retried.publicNumber!, "checked"], [decisionJ.publicNumber!, "checked"],
      [findingK, "withdrawn"],
    ]);
    assert(
      current.rows.length === expected.size &&
        current.rows.every(({ public_number: number, label: shown }) => expected.get(number) === shown),
      `ATLAS_CURRENT_VIEW_MISMATCH ${JSON.stringify(current.rows)}`,
    );
    checks.push("atlas_finding_current_shows_each_findings_label");

  } finally {
    await Promise.allSettled([
      runner.close(), writer.close(), reader.close(), review.close(), reviewPool.end(), admin.end(),
    ]);
  }
}

async function expectAtlasReviewCode(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof AtlasReviewError && error.code === code) return;
    throw error;
  }
  throw new Error(`EXPECTED_ATLAS_REVIEW_CODE_MISSING code=${code}`);
}

async function expectPgCode(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isPgCode(error, code)) return;
    throw error;
  }
  throw new Error(`EXPECTED_POSTGRES_ERROR_CODE_MISSING code=${code}`);
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

// Run when invoked; another script may import the Atlas checks above.
const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown PostgreSQL acceptance failure";
    process.stderr.write(`Research contributor PostgreSQL acceptance failed: ${message}\n`);
    process.exitCode = 1;
  });
}
