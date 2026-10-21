import { Pool } from "pg";

import {
  PostgresEvidenceRepository,
  PostgresResearchContributorAccessStore,
  PostgresResearchContributionPromotionRunner,
  PostgresResearchContributionReviewStore,
  RESEARCH_USE_NOTICE_VERSION,
  ResearchContributionRejectedError,
  ResearchContributionReviewService,
  ResearchContributorAccessService,
  deterministicUuid,
  prepareResearchContributionProposal,
  type ContributionPrivacyBoundary,
  type LivingEvidenceContribution,
} from "../packages/evidence-repository/src/index.js";
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
      migration: "0012_research_contribution_merging",
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown PostgreSQL acceptance failure";
  process.stderr.write(`Research contributor PostgreSQL acceptance failed: ${message}\n`);
  process.exitCode = 1;
});
