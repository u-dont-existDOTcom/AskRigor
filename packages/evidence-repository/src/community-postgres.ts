import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  assertCommunityPublicationPreservesEvidence,
  communityComposerDraftSchema,
  communityForumEventSchema,
  communityFrontierViewSchema,
  communityLeadSchema,
  communityOperationalActionSchema,
  communityOperationalQueueItemSchema,
  communityOperationalRoleAssignmentSchema,
  communityPublicVersionSchema,
  communitySignalClusterSchema,
  syntheticForumAccountSchema,
  type CommunityComposerDraft,
  type CommunityForumEvent,
  type CommunityFrontierView,
  type CommunityLead,
  type CommunityOperationalAction,
  type CommunityOperationalQueueItem,
  type CommunityOperationalRoleAssignment,
  type CommunityPublicVersion,
  type CommunitySignalCluster,
  type SyntheticForumAccount,
} from "@askrigor/contracts";

import {
  buildSyntheticPublicLeadProjection,
  communityDeadLetterErrorCode,
  computeCommunitySourceIndependenceKeys,
  verifyDiscourseWebhookSignature,
  type CommunityBridgeDeadLetter,
  type CommunityBridgeEventReceipt,
  type SyntheticPublicLeadProjection,
} from "./community-forum-service.js";
import { SyntheticCommunityOperationsService } from "./community-forum-operations.js";
import { deterministicUuid, sha256, stableJson } from "./hash.js";

export interface CommunityPostgresOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
}

function safeSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema))
    throw new Error("INVALID_POSTGRES_SCHEMA");
  return schema;
}

export class PostgresSyntheticCommunityRepository {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: CommunityPostgresOptions) {
    this.schema = safeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async registerAccount(input: unknown): Promise<SyntheticForumAccount> {
    const account = syntheticForumAccountSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      const existing = await client.query<{
        account_id: string;
        external_user_id: string;
        email_sha256: string;
        pseudonymous_display_name: string;
        discourse_user_id: string | null;
        email_verified: boolean;
        forum_suspended: boolean;
        non_forum_product_access: boolean;
      }>(
        "SELECT account_id, external_user_id, email_sha256, pseudonymous_display_name, discourse_user_id, email_verified, forum_suspended, non_forum_product_access FROM community_forum_accounts WHERE account_id = $1 OR external_user_id = $2 OR email_sha256 = $3 FOR SHARE",
        [account.accountId, account.externalUserId, sha256(account.email)],
      );
      if (existing.rowCount !== 0) {
        const row = existing.rows[0]!;
        if (row.account_id !== account.accountId)
          throw new Error("DISCOURSE_CONNECT_ACCOUNT_ID_COLLISION");
        if (row.external_user_id !== account.externalUserId)
          throw new Error("DISCOURSE_CONNECT_EMAIL_ACCOUNT_TAKEOVER_BLOCKED");
        if (row.email_sha256 !== sha256(account.email))
          throw new Error("DISCOURSE_CONNECT_EXTERNAL_ID_COLLISION");
        if (
          row.pseudonymous_display_name !== account.pseudonymousDisplayName ||
          row.discourse_user_id !== account.discourseUserId ||
          row.email_verified !== account.emailVerified ||
          row.forum_suspended !== account.forumSuspended ||
          row.non_forum_product_access !== account.nonForumProductAccess
        ) {
          throw new Error("DISCOURSE_CONNECT_ACCOUNT_STATE_COLLISION");
        }
        await client.query("COMMIT");
        return structuredClone(account);
      }
      await client.query(
        `INSERT INTO community_forum_accounts
          (account_id, external_user_id, email_sha256, pseudonymous_display_name, discourse_user_id,
           email_verified, forum_suspended, non_forum_product_access)
         VALUES ($1, $2, $3, $4, $5, true, $6, true)`,
        [
          account.accountId,
          account.externalUserId,
          sha256(account.email),
          account.pseudonymousDisplayName,
          account.discourseUserId,
          account.forumSuspended,
        ],
      );
      await client.query("COMMIT");
      return structuredClone(account);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ingestEvent(
    rawBody: string,
    signature: string,
    secret: string,
  ): Promise<CommunityBridgeEventReceipt> {
    const rawBodySha256 = sha256(rawBody);
    try {
      return await this.ingestVerifiedEvent(
        rawBody,
        signature,
        secret,
        rawBodySha256,
      );
    } catch (error) {
      try {
        await this.recordDeadLetter(rawBody, rawBodySha256, error);
      } catch {
        // Dead-letter persistence must never replace the original bridge failure.
      }
      throw error;
    }
  }

  async getDeadLetters(): Promise<CommunityBridgeDeadLetter[]> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query<{
        event_id: string | null;
        error_code: string;
        raw_body_sha256: string;
        raw_forum_body_persisted: false;
        recorded_at: Date;
      }>(
        `SELECT event_id, error_code, raw_body_sha256, raw_forum_body_persisted, recorded_at
         FROM community_bridge_dead_letters
         ORDER BY inserted_at, dead_letter_id`,
      );
      return result.rows.map((row) => ({
        eventId: row.event_id,
        errorCode: row.error_code,
        rawBodySha256: row.raw_body_sha256,
        rawForumBodyPersisted: row.raw_forum_body_persisted,
        recordedAt: row.recorded_at.toISOString(),
      }));
    } finally {
      client.release();
    }
  }

  private async ingestVerifiedEvent(
    rawBody: string,
    signature: string,
    secret: string,
    rawBodySha256: string,
  ): Promise<CommunityBridgeEventReceipt> {
    verifyDiscourseWebhookSignature(rawBody, signature, secret);
    const event = communityForumEventSchema.parse(
      JSON.parse(rawBody) as unknown,
    );
    if (event.payloadSha256 !== sha256(stableJson(event.minimalPayload))) {
      throw new Error("DISCOURSE_EVENT_MINIMAL_PAYLOAD_HASH_MISMATCH");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`askrigor:community:${event.aggregateId}`],
      );
      const replay = await client.query<{
        raw_body_sha256: string;
        event_id: string;
        source_version: number;
      }>(
        "SELECT raw_body_sha256, event_id, source_version FROM community_forum_events WHERE idempotency_key = $1",
        [event.idempotencyKey],
      );
      if (replay.rowCount !== 0) {
        const row = replay.rows[0]!;
        if (row.raw_body_sha256 !== rawBodySha256)
          throw new Error("DISCOURSE_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH");
        await client.query("COMMIT");
        return this.eventReceipt("idempotent_replay", event, rawBodySha256);
      }

      const latest = await client.query<{
        source_version: number;
        event_type: CommunityForumEvent["eventType"];
      }>(
        "SELECT source_version, event_type FROM community_forum_events WHERE aggregate_id = $1 ORDER BY source_version DESC LIMIT 1",
        [event.aggregateId],
      );
      const current = latest.rows[0];
      if (
        current !== undefined &&
        event.sourceVersion === current.source_version
      ) {
        throw new Error("DISCOURSE_EVENT_SOURCE_VERSION_COLLISION");
      }
      const stale =
        current !== undefined && event.sourceVersion < current.source_version;
      if (
        !stale &&
        current !== undefined &&
        current.event_type === "forum.post.deleted.v1" &&
        event.eventType !== "forum.post.deleted.v1"
      ) {
        throw new Error("DISCOURSE_EVENT_STALE_RESURRECTION_BLOCKED");
      }

      await client.query(
        `INSERT INTO community_forum_events
          (event_id, event_type, forum_instance_id, aggregate_id, source_version, occurred_at,
           received_at, idempotency_key, minimal_payload_sha256, raw_body_sha256, trace_id,
           minimal_payload_json, raw_forum_body_persisted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, false)`,
        [
          event.eventId,
          event.eventType,
          event.forumInstanceId,
          event.aggregateId,
          event.sourceVersion,
          event.occurredAt,
          event.receivedAt,
          event.idempotencyKey,
          event.payloadSha256,
          rawBodySha256,
          event.traceId,
          JSON.stringify(event.minimalPayload),
        ],
      );
      if (!stale && event.minimalPayload.postId !== null) {
        await client.query(
          `INSERT INTO community_forum_post_versions
            (forum_instance_id, topic_id, post_id, source_version, author_account_id, visibility,
             content_sha256, deleted, source_event_id, raw_forum_body_persisted)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)`,
          [
            event.forumInstanceId,
            event.minimalPayload.topicId,
            event.minimalPayload.postId,
            event.sourceVersion,
            event.minimalPayload.authorAccountId,
            event.minimalPayload.visibility,
            event.minimalPayload.contentSha256,
            event.eventType === "forum.post.deleted.v1",
            event.eventId,
          ],
        );
      }
      await client.query("COMMIT");
      return this.eventReceipt(
        stale ? "stale_ignored" : "inserted",
        event,
        rawBodySha256,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createLead(
    input: unknown,
    sourceEventId: string,
  ): Promise<CommunityLead> {
    const lead = communityLeadSchema.parse(input);
    const payloadSha256 = sha256(stableJson(lead));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      if (
        !lead.sourceReferences.some(
          (reference) => reference.sourceEventId === sourceEventId,
        )
      ) {
        throw new Error("COMMUNITY_LEAD_SOURCE_EVENT_ARGUMENT_MISMATCH");
      }
      for (const reference of lead.sourceReferences) {
        const sourceEvent = await client.query<{
          forum_instance_id: string;
          source_version: number;
          occurred_at: Date;
          minimal_payload_json: CommunityForumEvent["minimalPayload"];
        }>(
          `SELECT forum_instance_id, source_version, occurred_at, minimal_payload_json
           FROM community_forum_events
           WHERE event_id = $1`,
          [reference.sourceEventId],
        );
        const source = sourceEvent.rows[0];
        if (source === undefined)
          throw new Error("COMMUNITY_LEAD_SOURCE_EVENT_NOT_FOUND");
        const sourceMatches =
          reference.forumInstanceId === source.forum_instance_id &&
          reference.topicId === source.minimal_payload_json.topicId &&
          reference.postId === source.minimal_payload_json.postId &&
          reference.sourceVersion === source.source_version &&
          reference.sourceVisibility ===
            source.minimal_payload_json.visibility &&
          reference.authorAccountId ===
            source.minimal_payload_json.authorAccountId &&
          reference.contentSha256 ===
            source.minimal_payload_json.contentSha256 &&
          reference.occurredAt === source.occurred_at.toISOString();
        if (!sourceMatches)
          throw new Error("COMMUNITY_LEAD_SOURCE_PROVENANCE_MISMATCH");
      }
      const latest = await client.query<{
        lead_version: number;
        payload_sha256: string;
      }>(
        "SELECT lead_version, payload_sha256 FROM community_leads WHERE lead_id = $1 ORDER BY lead_version DESC LIMIT 1 FOR SHARE",
        [lead.leadId],
      );
      const current = latest.rows[0];
      if (current === undefined && lead.leadVersion !== 1) {
        throw new Error("COMMUNITY_LEAD_VERSION_GAP");
      }
      if (current !== undefined && lead.leadVersion <= current.lead_version) {
        if (
          lead.leadVersion === current.lead_version &&
          payloadSha256 === current.payload_sha256
        ) {
          await client.query("COMMIT");
          return structuredClone(lead);
        }
        throw new Error("COMMUNITY_LEAD_STALE_VERSION");
      }
      if (
        current !== undefined &&
        lead.leadVersion !== current.lead_version + 1
      ) {
        throw new Error("COMMUNITY_LEAD_VERSION_GAP");
      }
      await client.query(
        `INSERT INTO community_leads
          (lead_id, lead_version, source_event_id, reporter_account_id, source_distance,
           verification_state, evidence_capability, formal_evidence_relationship, completeness_band,
           status, payload_sha256, payload_json, raw_forum_body_persisted)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, false)`,
        [
          lead.leadId,
          lead.leadVersion,
          sourceEventId,
          lead.reporter.accountId,
          lead.reporter.sourceDistance,
          lead.verificationState,
          lead.evidenceCapability,
          lead.formalEvidenceRelationship,
          lead.completenessBand,
          lead.status,
          payloadSha256,
          JSON.stringify(lead),
        ],
      );
      await client.query("COMMIT");
      return structuredClone(lead);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async projectPublicVersion(
    input: unknown,
  ): Promise<SyntheticPublicLeadProjection> {
    const publicVersion = communityPublicVersionSchema.parse(input);
    if (publicVersion.status !== "SYNTHETIC_LAB_PROJECTION")
      throw new Error("SYNTHETIC_LAB_PROJECTION_STATE_REQUIRED");
    const projection = buildSyntheticPublicLeadProjection(publicVersion);
    const projectionSha256 = sha256(stableJson(projection));
    const versionRecordSha256 = sha256(stableJson(publicVersion));
    if (publicVersion.publicPayloadSha256 !== projectionSha256) {
      throw new Error("COMMUNITY_PUBLIC_PAYLOAD_HASH_MISMATCH");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`askrigor:community-public:${publicVersion.publicVersionId}`],
      );
      const existing = await client.query<{
        public_payload_sha256: string;
        version_record_sha256: string;
        withdrawn: boolean;
      }>(
        `SELECT pv.public_payload_sha256, pv.version_record_sha256,
                EXISTS (
                  SELECT 1 FROM community_lead_withdrawals w
                  WHERE w.public_version_id = pv.public_version_id
                ) AS withdrawn
         FROM community_lead_public_versions pv
         WHERE pv.public_version_id = $1`,
        [publicVersion.publicVersionId],
      );
      if (existing.rows[0]?.withdrawn === true)
        throw new Error("COMMUNITY_PUBLIC_VERSION_ALREADY_WITHDRAWN");
      if (existing.rows[0] !== undefined) {
        if (
          existing.rows[0].public_payload_sha256 !== projectionSha256 ||
          existing.rows[0].version_record_sha256 !== versionRecordSha256
        ) {
          throw new Error("COMMUNITY_PUBLIC_VERSION_COLLISION");
        }
        await client.query("COMMIT");
        return projection;
      }
      const result = await client.query<{ payload_json: CommunityLead }>(
        "SELECT payload_json FROM community_leads WHERE lead_id = $1 AND lead_version = $2",
        [publicVersion.leadId, publicVersion.leadVersion],
      );
      if (result.rowCount === 0) throw new Error("COMMUNITY_LEAD_NOT_FOUND");
      const lead = communityLeadSchema.parse(result.rows[0]!.payload_json);
      assertCommunityPublicationPreservesEvidence(lead, publicVersion);
      await client.query(
        `INSERT INTO community_lead_public_versions
          (public_version_id, lead_id, lead_version, publication_object_type,
           reporter_publication_consent, subject_exact_version_approval, privacy_review_outcome,
           abuse_review_state, jurisdiction_policy_state, subject_identifiable,
           direct_subject_quote_present, documents_or_media_present, verification_state,
           evidence_capability, formal_evidence_relationship, status, public_payload_sha256,
           version_record_sha256, public_payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)`,
        [
          publicVersion.publicVersionId,
          publicVersion.leadId,
          publicVersion.leadVersion,
          publicVersion.publicationObjectType,
          publicVersion.reporterPublicationConsent.decision === "YES",
          publicVersion.subjectExactVersionApproval?.decision === "YES"
            ? true
            : null,
          publicVersion.privacyReview.outcome,
          publicVersion.abuseReviewState,
          publicVersion.jurisdictionPolicyState,
          publicVersion.subjectIdentifiableInPublicVersion,
          publicVersion.directSubjectQuotePresent,
          publicVersion.documentsOrMediaPresent,
          publicVersion.verificationState,
          publicVersion.evidenceCapability,
          publicVersion.formalEvidenceRelationship,
          publicVersion.status,
          projectionSha256,
          versionRecordSha256,
          JSON.stringify(projection),
        ],
      );
      await client.query("COMMIT");
      return projection;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createCluster(input: unknown): Promise<CommunitySignalCluster> {
    const cluster = communitySignalClusterSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`askrigor:community-cluster:${cluster.clusterId}`],
      );
      const payloadSha256 = sha256(stableJson(cluster));
      const latestCluster = await client.query<{
        cluster_version: number;
        payload_sha256: string;
      }>(
        `SELECT cluster_version, payload_sha256
         FROM community_signal_clusters
         WHERE cluster_id = $1
         ORDER BY cluster_version DESC
         LIMIT 1`,
        [cluster.clusterId],
      );
      const priorCluster = latestCluster.rows[0];
      if (priorCluster === undefined && cluster.clusterVersion !== 1)
        throw new Error("COMMUNITY_CLUSTER_VERSION_GAP");
      if (priorCluster !== undefined) {
        if (
          priorCluster.cluster_version === cluster.clusterVersion &&
          priorCluster.payload_sha256 === payloadSha256
        ) {
          await client.query("COMMIT");
          return structuredClone(cluster);
        }
        if (cluster.clusterVersion <= priorCluster.cluster_version)
          throw new Error("COMMUNITY_CLUSTER_STALE_VERSION");
        if (cluster.clusterVersion !== priorCluster.cluster_version + 1)
          throw new Error("COMMUNITY_CLUSTER_VERSION_GAP");
      }
      const leads: CommunityLead[] = [];
      for (const leadId of cluster.memberLeadIds) {
        const result = await client.query<{
          lead_version: number;
          payload_json: CommunityLead;
        }>(
          "SELECT lead_version, payload_json FROM community_leads WHERE lead_id = $1 ORDER BY lead_version DESC LIMIT 1",
          [leadId],
        );
        if (result.rowCount === 0)
          throw new Error(`COMMUNITY_CLUSTER_LEAD_NOT_FOUND lead=${leadId}`);
        leads.push(communityLeadSchema.parse(result.rows[0]!.payload_json));
      }
      const independenceKeys = computeCommunitySourceIndependenceKeys(leads);
      if (
        new Set(independenceKeys.values()).size !==
        cluster.independentSourceCount
      ) {
        throw new Error("COMMUNITY_CLUSTER_INDEPENDENT_SOURCE_COUNT_MISMATCH");
      }
      await client.query(
        `INSERT INTO community_signal_clusters
          (cluster_id, cluster_version, program_fingerprint, independent_source_count,
           direction_counts, duplicate_handling, formal_evidence_relationship,
           denominator_available, effectiveness_percentage_display_permitted,
           payload_sha256, payload_json)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, false, $9, $10::jsonb)`,
        [
          cluster.clusterId,
          cluster.clusterVersion,
          cluster.programFingerprint,
          cluster.independentSourceCount,
          JSON.stringify(cluster.directionCounts),
          cluster.duplicateHandling,
          cluster.formalEvidenceRelationship,
          cluster.denominatorAvailable,
          payloadSha256,
          JSON.stringify(cluster),
        ],
      );
      for (const lead of leads) {
        await client.query(
          `INSERT INTO community_signal_cluster_memberships
            (cluster_id, cluster_version, lead_id, lead_version, source_independence_key)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            cluster.clusterId,
            cluster.clusterVersion,
            lead.leadId,
            lead.leadVersion,
            independenceKeys.get(lead.leadId),
          ],
        );
      }
      await client.query("COMMIT");
      return structuredClone(cluster);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async withdraw(publicVersionId: string, requestedAt: string): Promise<void> {
    const timestamp = new Date(requestedAt);
    if (!Number.isFinite(timestamp.valueOf()))
      throw new Error("COMMUNITY_WITHDRAWAL_TIMESTAMP_INVALID");
    const tombstone = {
      publicVersionId,
      requestedAt,
      contentRetained: false,
      synthetic: true,
    };
    const tombstoneSha256 = sha256(stableJson(tombstone));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`askrigor:community-withdrawal:${publicVersionId}`],
      );
      const existing = await client.query<{ tombstone_sha256: string }>(
        "SELECT tombstone_sha256 FROM community_lead_withdrawals WHERE public_version_id = $1",
        [publicVersionId],
      );
      if (existing.rows[0] !== undefined) {
        if (existing.rows[0].tombstone_sha256 !== tombstoneSha256) {
          throw new Error("COMMUNITY_WITHDRAWAL_COLLISION");
        }
        await client.query("COMMIT");
        return;
      }
      await client.query(
        `INSERT INTO community_lead_withdrawals
          (withdrawal_id, public_version_id, requested_at, content_retained_in_lab_projection, tombstone_sha256)
         VALUES ($1, $2, $3, false, $4)`,
        [
          deterministicUuid(`askrigor:community-withdrawal:${publicVersionId}`),
          publicVersionId,
          requestedAt,
          tombstoneSha256,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getProjection(
    publicVersionId: string,
  ): Promise<SyntheticPublicLeadProjection | null> {
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const result = await client.query<{
        public_payload_json: SyntheticPublicLeadProjection;
      }>(
        "SELECT public_payload_json FROM community_synthetic_public_lead_projection WHERE public_version_id = $1",
        [publicVersionId],
      );
      return result.rows[0]?.public_payload_json ?? null;
    } finally {
      client.release();
    }
  }

  async saveComposerDraft(input: unknown): Promise<CommunityComposerDraft> {
    const draft = communityComposerDraftSchema.parse(input);
    const payloadSha256 = sha256(stableJson(draft));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`askrigor:community-composer:${draft.draftId}`],
      );
      const exact = await client.query<{ payload_sha256: string }>(
        "SELECT payload_sha256 FROM community_composer_draft_versions WHERE draft_id = $1 AND draft_version = $2",
        [draft.draftId, draft.draftVersion],
      );
      if (exact.rows[0] !== undefined) {
        if (exact.rows[0].payload_sha256 !== payloadSha256)
          throw new Error("COMMUNITY_COMPOSER_DRAFT_VERSION_COLLISION");
        await client.query("COMMIT");
        return structuredClone(draft);
      }
      const latest = await client.query<{ draft_version: number }>(
        "SELECT draft_version FROM community_composer_draft_versions WHERE draft_id = $1 ORDER BY draft_version DESC LIMIT 1",
        [draft.draftId],
      );
      const latestVersion = latest.rows[0]?.draft_version;
      if (latestVersion === undefined && draft.draftVersion !== 1)
        throw new Error("COMMUNITY_COMPOSER_DRAFT_VERSION_GAP");
      if (latestVersion !== undefined) {
        if (draft.draftVersion <= latestVersion)
          throw new Error("COMMUNITY_COMPOSER_DRAFT_STALE_VERSION");
        if (draft.draftVersion !== latestVersion + 1)
          throw new Error("COMMUNITY_COMPOSER_DRAFT_VERSION_GAP");
      }
      await client.query(
        `INSERT INTO community_composer_draft_versions
          (draft_id, draft_version, reporter_account_id, entry_point, source_post_id,
           source_post_disposition, status, public_lead_permission,
           preview_acknowledged, payload_sha256, payload_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
        [
          draft.draftId,
          draft.draftVersion,
          draft.reporterAccountId,
          draft.entryPoint,
          draft.sourcePostId,
          draft.sourcePostDisposition,
          draft.status,
          draft.permissions.publicLead,
          draft.preview?.acknowledgedAt != null,
          payloadSha256,
          JSON.stringify(draft),
          draft.updatedAt,
        ],
      );
      await client.query("COMMIT");
      return structuredClone(draft);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveFrontierSnapshot(
    snapshotId: string,
    input: unknown,
  ): Promise<CommunityFrontierView> {
    if (!/^ARFRONTIER-[A-Z0-9_-]{8,64}$/u.test(snapshotId))
      throw new Error("COMMUNITY_FRONTIER_SNAPSHOT_ID_INVALID");
    const view = communityFrontierViewSchema.parse(input);
    const payloadSha256 = sha256(stableJson(view));
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const prior = await client.query<{ payload_sha256: string }>(
        "SELECT payload_sha256 FROM community_frontier_snapshots WHERE snapshot_id = $1",
        [snapshotId],
      );
      if (prior.rows[0] !== undefined) {
        if (prior.rows[0].payload_sha256 !== payloadSha256)
          throw new Error("COMMUNITY_FRONTIER_SNAPSHOT_COLLISION");
        return structuredClone(view);
      }
      await client.query(
        `INSERT INTO community_frontier_snapshots
          (snapshot_id, default_order, reported_lead_count, independent_source_count,
           direction_counts, denominator_available, effectiveness_percentage_display_permitted,
           discussion_activity_affects_evidence_state, payload_sha256, payload_json, generated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, false, false, false, $6, $7::jsonb, $8)`,
        [
          snapshotId,
          view.defaultOrder,
          view.reportedLeadCount,
          view.independentSourceCount,
          JSON.stringify(view.directionCounts),
          payloadSha256,
          JSON.stringify(view),
          view.generatedAt,
        ],
      );
      return structuredClone(view);
    } finally {
      client.release();
    }
  }

  async enqueueOperation(
    input: unknown,
  ): Promise<CommunityOperationalQueueItem> {
    const service = new SyntheticCommunityOperationsService();
    const item = service.enqueue(input);
    const payloadSha256 = sha256(stableJson(item));
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const prior = await client.query<{ payload_sha256: string }>(
        "SELECT payload_sha256 FROM community_operational_queue_items WHERE queue_item_id = $1",
        [item.queueItemId],
      );
      if (prior.rows[0] !== undefined) {
        if (prior.rows[0].payload_sha256 !== payloadSha256)
          throw new Error("COMMUNITY_OPERATION_QUEUE_ITEM_COLLISION");
        return structuredClone(item);
      }
      await client.query(
        `INSERT INTO community_operational_queue_items
          (queue_item_id, queue_type, required_capability, target_type, target_id,
           originator_actor_id, independent_review_required, source_meaning_sha256,
           seriousness, automated_regulatory_reporting, status, payload_sha256,
           payload_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10, $11, $12::jsonb, $13)`,
        [
          item.queueItemId,
          item.queueType,
          item.requiredCapability,
          item.targetType,
          item.targetId,
          item.originatorActorId,
          item.independentReviewRequired,
          item.sourceMeaningSha256,
          item.seriousness,
          item.status,
          payloadSha256,
          JSON.stringify(item),
          item.createdAt,
        ],
      );
      return structuredClone(item);
    } finally {
      client.release();
    }
  }

  async assignOperationRole(
    input: unknown,
  ): Promise<CommunityOperationalRoleAssignment> {
    const service = new SyntheticCommunityOperationsService();
    const assignment = service.assignRole(input);
    const payloadSha256 = sha256(stableJson(assignment));
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      const prior = await client.query<{ payload_sha256: string }>(
        "SELECT payload_sha256 FROM community_operational_actor_roles WHERE actor_id = $1 AND role = $2",
        [assignment.actorId, assignment.role],
      );
      if (prior.rows[0] !== undefined) {
        if (prior.rows[0].payload_sha256 !== payloadSha256)
          throw new Error("COMMUNITY_OPERATION_ROLE_ASSIGNMENT_COLLISION");
        return structuredClone(assignment);
      }
      await client.query(
        `INSERT INTO community_operational_actor_roles
          (assignment_id, actor_id, role, assigned_by_actor_id, active,
           assigned_at, payload_sha256, payload_json)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7::jsonb)`,
        [
          assignment.assignmentId,
          assignment.actorId,
          assignment.role,
          assignment.assignedByActorId,
          assignment.assignedAt,
          payloadSha256,
          JSON.stringify(assignment),
        ],
      );
      return structuredClone(assignment);
    } finally {
      client.release();
    }
  }

  async recordOperationAction(
    input: unknown,
  ): Promise<CommunityOperationalAction> {
    const parsed = communityOperationalActionSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await this.setSearchPath(client);
      const queueResult = await client.query<{
        payload_json: CommunityOperationalQueueItem;
      }>(
        "SELECT payload_json FROM community_operational_queue_items WHERE queue_item_id = $1 FOR SHARE",
        [parsed.queueItemId],
      );
      const queueItem = communityOperationalQueueItemSchema.parse(
        queueResult.rows[0]?.payload_json,
      );
      const roleResult = await client.query<{
        payload_json: CommunityOperationalRoleAssignment;
      }>(
        "SELECT payload_json FROM community_operational_actor_roles WHERE actor_id = $1 AND role = $2",
        [parsed.actorId, parsed.activeRole],
      );
      if (roleResult.rows[0] === undefined) {
        throw new Error("COMMUNITY_OPERATION_ACTIVE_ROLE_NOT_ASSIGNED");
      }
      const roleAssignment = communityOperationalRoleAssignmentSchema.parse(
        roleResult.rows[0].payload_json,
      );
      const service = new SyntheticCommunityOperationsService();
      service.assignRole(roleAssignment);
      service.enqueue(queueItem);
      const action = service.act(parsed);
      const payloadSha256 = sha256(stableJson(action));
      const prior = await client.query<{ payload_sha256: string }>(
        "SELECT payload_sha256 FROM community_operational_actions WHERE action_id = $1",
        [action.actionId],
      );
      if (prior.rows[0] !== undefined) {
        if (prior.rows[0].payload_sha256 !== payloadSha256)
          throw new Error("COMMUNITY_OPERATION_ACTION_COLLISION");
        await client.query("COMMIT");
        return structuredClone(action);
      }
      await client.query(
        `INSERT INTO community_operational_actions
          (action_id, queue_item_id, actor_id, originator_actor_id,
           independent_review_required, active_role, capability, action,
           source_meaning_sha256_before, source_meaning_sha256_after,
           annotation_text, automated_regulatory_reporting, resulting_status,
           payload_sha256, payload_json, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, $12, $13, $14::jsonb, $15)`,
        [
          action.actionId,
          action.queueItemId,
          action.actorId,
          queueItem.originatorActorId,
          queueItem.independentReviewRequired,
          action.activeRole,
          action.capability,
          action.action,
          action.sourceMeaningSha256Before,
          action.sourceMeaningSha256After,
          action.annotationText,
          action.resultingStatus,
          payloadSha256,
          JSON.stringify(action),
          action.occurredAt,
        ],
      );
      await client.query("COMMIT");
      return structuredClone(action);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordDeadLetter(
    rawBody: string,
    rawBodySha256: string,
    error: unknown,
  ): Promise<void> {
    let eventId: string | null = null;
    try {
      const parsed = JSON.parse(rawBody) as { eventId?: unknown };
      if (
        typeof parsed.eventId === "string" &&
        /^AREVT-[A-Z0-9_-]{8,64}$/u.test(parsed.eventId)
      ) {
        eventId = parsed.eventId;
      }
    } catch {
      eventId = null;
    }
    const errorCode = communityDeadLetterErrorCode(error);
    const deadLetterId = deterministicUuid(
      `askrigor:community-dead-letter:${eventId ?? "unknown"}:${rawBodySha256}:${errorCode}`,
    );
    const client = await this.pool.connect();
    try {
      await this.setSearchPath(client);
      await client.query(
        `INSERT INTO community_bridge_dead_letters
          (dead_letter_id, event_id, error_code, raw_body_sha256, raw_forum_body_persisted,
           recorded_at)
         VALUES ($1, $2, $3, $4, false, $5)
         ON CONFLICT (dead_letter_id) DO NOTHING`,
        [
          deadLetterId,
          eventId,
          errorCode,
          rawBodySha256,
          new Date().toISOString(),
        ],
      );
    } finally {
      client.release();
    }
  }

  private async setSearchPath(client: PoolClient): Promise<void> {
    await client.query(`SET search_path TO ${this.schema}, public`);
    await client.query("SET TIME ZONE 'UTC'");
  }

  private eventReceipt(
    status: CommunityBridgeEventReceipt["status"],
    event: CommunityForumEvent,
    rawBodySha256: string,
  ): CommunityBridgeEventReceipt {
    return {
      status,
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      sourceVersion: event.sourceVersion,
      rawBodySha256,
      rawForumBodyPersisted: false,
    };
  }
}
