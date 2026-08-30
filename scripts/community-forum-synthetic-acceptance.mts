import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { Pool } from "pg";

import {
  communityFrontierCardSchema,
  communityLeadSchema,
  communityPublicVersionSchema,
  communitySignalClusterSchema,
  type CommunityForumEvent,
  type CommunityFrontierCard,
  type CommunityLead,
} from "../packages/contracts/src/index.js";
import {
  buildSyntheticCommunityFrontierView,
  PostgresEvidenceRepository,
  PostgresSyntheticCommunityRepository,
  sha256,
  signDiscourseWebhook,
  stableJson,
  syntheticPublicLeadProjectionSha256,
  SyntheticCommunityComposerService,
} from "../packages/evidence-repository/src/index.js";

const SECRET = "synthetic-community-acceptance-secret";
const AT = "2026-08-30T18:00:00.000Z";

function event(
  version: number,
  postNumber: number,
  eventType: CommunityForumEvent["eventType"],
): CommunityForumEvent {
  const deleted = eventType === "forum.post.deleted.v1";
  const minimalPayload: CommunityForumEvent["minimalPayload"] = {
    topicId: `SYNTHETIC-TOPIC-${postNumber}`,
    postId: `SYNTHETIC-POST-${postNumber}`,
    authorAccountId: "ARSYN-ACCEPTACCOUNT01",
    visibility: deleted ? "DELETED" : "PUBLIC",
    contentSha256: deleted
      ? null
      : sha256(`synthetic-post-${postNumber}-v${version}`),
  };
  return {
    synthetic: true,
    eventId: `AREVT-ACCEPTPOST${postNumber}V${version}`,
    eventType,
    schemaVersion: "1.0.0",
    producer: "DISCOURSE_SYNTHETIC_LAB",
    forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
    aggregateId: `ARSYN-ACCEPTPOSTAGG${postNumber}`,
    sourceVersion: version,
    occurredAt: AT,
    receivedAt: AT,
    idempotencyKey: `discourse-synthetic:acceptance:post-${postNumber}:v${version}`,
    payloadSha256: sha256(stableJson(minimalPayload)),
    traceId: `ARTRACE-ACCEPTPOST${postNumber}V${version}`,
    rawForumBodyPersisted: false,
    minimalPayload,
  };
}

function consent(actorType: "REPORTER" | "SUBJECT", suffix: string) {
  return {
    decision: "YES" as const,
    noticeVersion: `synthetic-acceptance-${suffix}`,
    noticeSha256: suffix.repeat(64).slice(0, 64),
    decidedAt: AT,
    actorType,
  };
}

function lead(id: string, postNumber: number, linked: string[]): CommunityLead {
  return communityLeadSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    leadId: id,
    leadVersion: 1,
    sourceReferences: [
      {
        synthetic: true,
        sourceEventId: `AREVT-ACCEPTPOST${postNumber}V1`,
        forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
        topicId: `SYNTHETIC-TOPIC-${postNumber}`,
        postId: `SYNTHETIC-POST-${postNumber}`,
        sourceVersion: 1,
        sourceVisibility: "PUBLIC",
        authorAccountId: "ARSYN-ACCEPTACCOUNT01",
        occurredAt: AT,
        contentSha256: sha256(`synthetic-post-${postNumber}-v1`),
        rawForumBodyPersisted: false,
      },
    ],
    reporter: {
      accountId: "ARSYN-ACCEPTACCOUNT01",
      role: "FRIEND",
      informationOrigin: "SUBJECT_RELAYED_TO_REPORTER",
      sourceDistance: "ONE_HOP_SUBJECT_RELAY",
      verificationState: "UNVERIFIED",
    },
    subjectBoundary: {
      subjectIdentifiableInPublicVersion: false,
      directSubjectQuotePresent: false,
      subjectDocumentsOrMediaPresent: false,
      subjectExactVersionApproval: null,
      minorStatus: "ADULT",
    },
    condition: {
      name: "Synthetic reported MCAS",
      diagnosticCertainty: "REPORTED_BY_PROXY",
    },
    interventionEpisode: {
      episodeType: "COMBINATION",
      components: [
        { name: "Synthetic LDN", doseKnown: false, route: null },
        {
          name: "Synthetic NAD+ injection",
          doseKnown: false,
          route: "Injection",
        },
        { name: "Synthetic tirzepatide", doseKnown: false, route: null },
      ],
      sequenceKnown: false,
    },
    outcome: {
      name: "Synthetic global symptoms and function",
      reportedDirection: "IMPROVED",
      reportedMagnitude: "VERY_LARGE",
      measurementType: "SUBJECTIVE_GLOBAL",
    },
    verificationState: "UNVERIFIED",
    evidenceCapability: "COMBINATION_ASSOCIATION_ONLY",
    formalEvidenceRelationship: "NOT_CHECKED",
    completenessBand: "PARTIAL",
    missingMaterialFields: [
      "diagnostic basis",
      "dose",
      "sequence",
      "timing",
      "co-interventions",
    ],
    duplicateOrLinkedLeadIds: linked,
    reporterPublicLeadConsent: consent("REPORTER", "a"),
    status: "STRUCTURED",
    createdAt: AT,
  });
}

function publicVersion(source: CommunityLead) {
  const candidate = communityPublicVersionSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    publicVersionId: "ARPUB-ACCEPTSECONDHAND01",
    leadId: source.leadId,
    leadVersion: source.leadVersion,
    publicationObjectType: "PUBLIC_RESEARCH_LEAD",
    publicTitle: "Synthetic secondhand combination lead",
    publicParaphrase:
      "A synthetic reporter says a synthetic adult friend reported a large improvement while using a three-component combination.",
    sourceDistanceLabel:
      "One-hop subject relay from a friend; not a firsthand subject report",
    limitations: [
      "Synthetic, secondhand, unverified, incomplete, and noncausal.",
    ],
    reporterPublicationConsent: consent("REPORTER", "b"),
    subjectExactVersionApproval: null,
    privacyReview: {
      reviewId: "ARPRIV-ACCEPTSECONDHAND01",
      outcome: "PASS",
      riskFlags: [],
      reviewedAt: AT,
    },
    abuseReviewState: "PASS",
    jurisdictionPolicyState: "ALLOWED_SYNTHETIC_LAB",
    subjectIdentifiableInPublicVersion: false,
    directSubjectQuotePresent: false,
    documentsOrMediaPresent: false,
    verificationState: source.verificationState,
    evidenceCapability: source.evidenceCapability,
    formalEvidenceRelationship: source.formalEvidenceRelationship,
    status: "SYNTHETIC_LAB_PROJECTION",
    publicPayloadSha256: "9".repeat(64),
  });
  return communityPublicVersionSchema.parse({
    ...candidate,
    publicPayloadSha256: syntheticPublicLeadProjectionSha256(candidate),
  });
}

function frontierCard(
  suffix: string,
  reportedDirection: CommunityFrontierCard["reportedDirection"],
  views: number,
): CommunityFrontierCard {
  return communityFrontierCardSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    cardId: `ARCARD-ACCEPT${suffix}`,
    publicVersionId: `ARPUB-ACCEPT${suffix}`,
    leadId: `ARLEAD-ACCEPT${suffix}`,
    leadVersion: 1,
    sourceIndependenceKey: sha256(`acceptance-source-${suffix}`),
    publicTitle: `Synthetic ${reportedDirection.toLowerCase()} acceptance card`,
    condition: "Synthetic reported condition",
    diagnosticCertainty: "SELF_IDENTIFIED",
    exactInterventionCombination: ["Synthetic component"],
    reportedDirection,
    timingAndPersistence: "Synthetic timing and persistence remain unknown.",
    reporterRole: "SELF",
    sourceDistance: "FIRSTHAND_SUBJECT",
    sourceDistanceLabel: "Synthetic firsthand subject report",
    verificationState: "UNVERIFIED",
    completenessBand: "PARTIAL",
    evidenceCapability: "DESCRIPTIVE_REPORT_ONLY",
    formalEvidenceRelationship: "NOT_CHECKED",
    harmsReported: reportedDirection === "WORSENED",
    noEffectReported: reportedDirection === "NO_CLEAR_CHANGE",
    cointerventionsAndConfounders: ["Synthetic confounders remain unknown"],
    clusterIds: [],
    challengeCount: 0,
    latestCorrectionLeadVersion: null,
    withdrawn: false,
    researchStatus: "LEAD_ONLY",
    discussionActivity: { views, replies: 0 },
    discussionActivityAffectsEvidenceState: false,
  });
}

async function expectReject(
  action: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(expected)) return;
    throw new Error(
      `EXPECTED_REJECTION_MISMATCH expected=${expected} actual=${message}`,
    );
  }
  throw new Error(`EXPECTED_REJECTION_MISSING expected=${expected}`);
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const schema =
    process.env.ASKRIGOR_COMMUNITY_ACCEPTANCE_SCHEMA ??
    `community_acceptance_${process.pid}`;
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema))
    throw new Error("INVALID_ACCEPTANCE_SCHEMA");

  const evidence = new PostgresEvidenceRepository({ connectionString, schema });
  const community = new PostgresSyntheticCommunityRepository({
    connectionString,
    schema,
  });
  const pool = new Pool({ connectionString });
  const checks: string[] = [];
  try {
    await evidence.migrate();
    checks.push("four_migration_chain_applied");

    await community.registerAccount({
      synthetic: true,
      accountId: "ARSYN-ACCEPTACCOUNT01",
      externalUserId: "ARSYN-ACCEPTEXTERNAL01",
      email: "acceptance-001@synthetic.askrigor.invalid",
      emailVerified: true,
      pseudonymousDisplayName: "synthetic_acceptance_001",
      discourseUserId: "SYNTHETIC-DISCOURSE-9001",
      forumSuspended: false,
      nonForumProductAccess: true,
    });
    checks.push("synthetic_account_registered_without_raw_email_projection");

    const composer = new SyntheticCommunityComposerService();
    const composerVersions = [];
    const composerDraft = composer.startDraft({
      draftId: "ARDRAFT-ACCEPTCOMPOSER01",
      reporterAccountId: "ARSYN-ACCEPTACCOUNT01",
      sourcePostId: "SYNTHETIC-POST-9010",
      updatedAt: AT,
    });
    composerVersions.push(composerDraft);
    composerVersions.push(composer.offerLeadConversion(composerDraft.draftId, AT));
    composerVersions.push(
      composer.respondToLeadConversion(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        "ACCEPTED",
        AT,
      ),
    );
    composerVersions.push(
      composer.recordDetails(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        {
          reporter: {
            role: "FRIEND",
            informationOrigin: "SUBJECT_RELAYED_TO_REPORTER",
            sourceDistance: "ONE_HOP_SUBJECT_RELAY",
          },
          condition: {
            name: "Synthetic reported condition",
            diagnosticCertainty: "REPORTED_BY_PROXY",
          },
          interventionEpisode: {
            components: ["Synthetic component A", "Synthetic component B"],
            exactCombinationKnown: true,
          },
          outcome: {
            name: "Synthetic overall symptoms",
            reportedDirection: "MIXED",
            timing: null,
            persistence: null,
          },
          cointerventions: [],
          harms: ["Synthetic transient worsening"],
          unknowns: ["Timing", "Persistence"],
        },
        AT,
      ),
    );
    composerVersions.push(
      composer.preparePreview(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        {
          publicTitle: "Synthetic secondhand report preview",
          publicParaphrase:
            "A synthetic reporter says a synthetic friend described a mixed outcome.",
          sourceDistanceLabel:
            "One-hop report from a friend; not a firsthand subject account",
          limitations: ["Synthetic, secondhand, incomplete, and noncausal."],
        },
        AT,
      ),
    );
    composerVersions.push(
      composer.recordPermission(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        "PUBLIC_LEAD",
        "YES",
        AT,
      ),
    );
    composerVersions.push(
      composer.acknowledgePreview(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        AT,
      ),
    );
    composerVersions.push(
      composer.requestSyntheticPublication(
        composerDraft.draftId,
        "ARSYN-ACCEPTACCOUNT01",
        AT,
      ),
    );
    for (const version of composerVersions) {
      await community.saveComposerDraft(version);
    }
    checks.push("member_controlled_composer_versions_are_append_only");

    const sourceMeaningSha256 = sha256("synthetic acceptance source meaning");
    await community.assignOperationRole({
      synthetic: true,
      assignmentId: "ARROLE-ACCEPTSAFETY01",
      actorId: "ARSYN-ACCEPTSAFETYREVIEWER01",
      role: "SAFETY_REVIEWER",
      assignedByActorId: "ARSYN-ACCEPTADMINISTRATOR01",
      active: true,
      assignedAt: AT,
    });
    const safetyQueue = await community.enqueueOperation({
      synthetic: true,
      queueItemId: "ARQUEUE-ACCEPTSAFETY01",
      queueType: "SAFETY",
      requiredCapability: "TRIAGE_SAFETY",
      targetType: "LEAD",
      targetId: "ARLEAD-ACCEPTSAFETY01",
      originatorActorId: "ARSYN-ACCEPTORIGINATOR01",
      independentReviewRequired: true,
      sourceMeaningSha256,
      seriousness: "SERIOUS",
      automatedRegulatoryReporting: false,
      status: "QUEUED",
      createdAt: AT,
    });
    await community.recordOperationAction({
      synthetic: true,
      actionId: "ARACTION-ACCEPTSAFETY01",
      queueItemId: safetyQueue.queueItemId,
      actorId: "ARSYN-ACCEPTSAFETYREVIEWER01",
      activeRole: "SAFETY_REVIEWER",
      capability: "TRIAGE_SAFETY",
      action: "TRIAGE_FOR_HUMAN_REVIEW",
      sourceMeaningSha256Before: sourceMeaningSha256,
      sourceMeaningSha256After: sourceMeaningSha256,
      annotationText: "Synthetic serious-harm candidate for human review.",
      automatedRegulatoryReporting: false,
      resultingStatus: "IN_REVIEW",
      occurredAt: AT,
    });
    checks.push("safety_queue_requires_explicit_role_without_auto_reporting");

    const first = event(1, 9001, "forum.post.created.v1");
    const firstRaw = JSON.stringify(first);
    if (
      (
        await community.ingestEvent(
          firstRaw,
          signDiscourseWebhook(firstRaw, SECRET),
          SECRET,
        )
      ).status !== "inserted"
    ) {
      throw new Error("COMMUNITY_EVENT_INSERT_FAILED");
    }
    if (
      (
        await community.ingestEvent(
          firstRaw,
          signDiscourseWebhook(firstRaw, SECRET),
          SECRET,
        )
      ).status !== "idempotent_replay"
    ) {
      throw new Error("COMMUNITY_EVENT_REPLAY_FAILED");
    }
    const third = event(3, 9001, "forum.post.edited.v1");
    const thirdRaw = JSON.stringify(third);
    await community.ingestEvent(
      thirdRaw,
      signDiscourseWebhook(thirdRaw, SECRET),
      SECRET,
    );
    const second = event(2, 9001, "forum.post.edited.v1");
    const secondRaw = JSON.stringify(second);
    if (
      (
        await community.ingestEvent(
          secondRaw,
          signDiscourseWebhook(secondRaw, SECRET),
          SECRET,
        )
      ).status !== "stale_ignored"
    ) {
      throw new Error("COMMUNITY_EVENT_STALE_RECONCILIATION_FAILED");
    }
    const deleted = event(4, 9001, "forum.post.deleted.v1");
    const deletedRaw = JSON.stringify(deleted);
    await community.ingestEvent(
      deletedRaw,
      signDiscourseWebhook(deletedRaw, SECRET),
      SECRET,
    );
    const resurrection = event(5, 9001, "forum.post.edited.v1");
    const resurrectionRaw = JSON.stringify(resurrection);
    await expectReject(
      () =>
        community.ingestEvent(
          resurrectionRaw,
          signDiscourseWebhook(resurrectionRaw, SECRET),
          SECRET,
        ),
      "DISCOURSE_EVENT_STALE_RESURRECTION_BLOCKED",
    );
    await expectReject(
      () => community.ingestEvent(firstRaw, `sha256=${"0".repeat(64)}`, SECRET),
      "DISCOURSE_WEBHOOK_SIGNATURE_INVALID",
    );
    const invalidRaw = JSON.stringify({
      ...first,
      eventId: "AREVT-ACCEPTINVALID0001",
      idempotencyKey: "discourse-synthetic:acceptance:invalid-0001",
      privateMedicalNarrative: "synthetic-private-narrative-must-not-persist",
    });
    await expectReject(
      () =>
        community.ingestEvent(
          invalidRaw,
          signDiscourseWebhook(invalidRaw, SECRET),
          SECRET,
        ),
      "Unrecognized key",
    );
    const deadLetters = await community.getDeadLetters();
    if (
      !deadLetters.some(
        (deadLetter) =>
          deadLetter.eventId === first.eventId &&
          deadLetter.errorCode === "DISCOURSE_WEBHOOK_SIGNATURE_INVALID" &&
          deadLetter.rawBodySha256 === sha256(firstRaw) &&
          deadLetter.rawForumBodyPersisted === false,
      ) ||
      !deadLetters.some(
        (deadLetter) =>
          deadLetter.eventId === "AREVT-ACCEPTINVALID0001" &&
          deadLetter.errorCode === "DISCOURSE_EVENT_VALIDATION_FAILED",
      ) ||
      JSON.stringify(deadLetters).includes("synthetic-post-9001") ||
      JSON.stringify(deadLetters).includes(
        "synthetic-private-narrative-must-not-persist",
      )
    ) {
      throw new Error("COMMUNITY_HASH_ONLY_DEAD_LETTER_FAILED");
    }
    checks.push("signed_idempotent_versioned_delete_safe_bridge");

    const duplicateEvent = event(1, 9002, "forum.post.created.v1");
    const duplicateRaw = JSON.stringify(duplicateEvent);
    await community.ingestEvent(
      duplicateRaw,
      signDiscourseWebhook(duplicateRaw, SECRET),
      SECRET,
    );
    const leadOneId = "ARLEAD-ACCEPTSECONDHAND01";
    const leadTwoId = "ARLEAD-ACCEPTDUPLICATE02";
    const leadOne = lead(leadOneId, 9001, [leadTwoId]);
    const leadTwo = lead(leadTwoId, 9002, [leadOneId]);
    const primarySource = leadOne.sourceReferences[0]!;
    await expectReject(
      () =>
        community.createLead(
          communityLeadSchema.parse({
            ...leadOne,
            sourceReferences: [
              ...leadOne.sourceReferences,
              {
                ...primarySource,
                sourceEventId: "AREVT-ACCEPTMISSING0001",
              },
            ],
          }),
          first.eventId,
        ),
      "COMMUNITY_LEAD_SOURCE_EVENT_NOT_FOUND",
    );
    await community.createLead(leadOne, first.eventId);
    await community.createLead(leadTwo, duplicateEvent.eventId);
    checks.push(
      "secondhand_combination_leads_persisted_without_raw_forum_body",
    );

    const version = publicVersion(leadOne);
    await expectReject(
      () =>
        community.projectPublicVersion({
          ...version,
          publicPayloadSha256: "0".repeat(64),
        }),
      "COMMUNITY_PUBLIC_PAYLOAD_HASH_MISMATCH",
    );
    const projection = await community.projectPublicVersion(version);
    if (
      projection.verificationState !== "UNVERIFIED" ||
      projection.evidenceCapability !== "COMBINATION_ASSOCIATION_ONLY" ||
      projection.publicVisibility !== "SYNTHETIC_LAB_ONLY"
    ) {
      throw new Error("COMMUNITY_PUBLIC_PROJECTION_EVIDENCE_BOUNDARY_FAILED");
    }
    if ((await community.getProjection(version.publicVersionId)) === null) {
      throw new Error("COMMUNITY_PUBLIC_PROJECTION_MISSING");
    }
    checks.push("deidentified_secondhand_projection_without_subject_approval");

    const frontier = buildSyntheticCommunityFrontierView({
      cards: [
        frontierCard("POPULARBENEFIT01", "IMPROVED", 1_000_000),
        frontierCard("HARM000000001", "WORSENED", 1),
        frontierCard("NOEFFECT00001", "NO_CLEAR_CHANGE", 1),
      ],
      generatedAt: AT,
    });
    if (
      frontier.cards[0]?.reportedDirection !== "NO_CLEAR_CHANGE" ||
      frontier.cards[1]?.reportedDirection !== "WORSENED" ||
      frontier.effectivenessPercentageDisplayPermitted !== false
    ) {
      throw new Error("COMMUNITY_FRONTIER_BALANCED_ORDER_FAILED");
    }
    await community.saveFrontierSnapshot(
      "ARFRONTIER-ACCEPTBALANCED01",
      frontier,
    );
    checks.push("balanced_frontier_snapshot_is_denominator_bounded");

    const cluster = communitySignalClusterSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      clusterId: "ARCL-ACCEPTDUPLICATE01",
      clusterVersion: 1,
      scope: {
        condition: "Synthetic reported MCAS",
        population: "Synthetic adults",
        interventionOrExposure: "Synthetic three-component combination",
        comparator: null,
        outcome: "Synthetic reported global change",
        horizon: null,
      },
      programFingerprint: "Same linked synthetic report represented twice",
      memberLeadIds: [leadOneId, leadTwoId],
      independentSourceCount: 1,
      directionCounts: {
        improved: 2,
        worsened: 0,
        noClearChange: 0,
        mixed: 0,
        unknown: 0,
      },
      duplicateHandling:
        "The linked duplicate pair counts as one independent source.",
      formalEvidenceRelationship: "NOT_CHECKED",
      denominatorAvailable: false,
      effectivenessPercentageDisplayPermitted: false,
      limitations: [
        "Synthetic self-selected reports are not a treatment-effect denominator.",
      ],
      createdAt: AT,
    });
    await community.createCluster(cluster);
    checks.push("duplicate_virality_does_not_increase_source_independence");

    const sqlClient = await pool.connect();
    try {
      await sqlClient.query(`SET search_path TO ${schema}, public`);
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_lead_public_versions
            (public_version_id, lead_id, lead_version, publication_object_type,
             reporter_publication_consent, subject_exact_version_approval, privacy_review_outcome,
             abuse_review_state, jurisdiction_policy_state, subject_identifiable,
             direct_subject_quote_present, documents_or_media_present, verification_state,
             evidence_capability, formal_evidence_relationship, status, public_payload_sha256,
             version_record_sha256, public_payload_json)
           VALUES ('ARPUB-INVALIDIDENTIFIABLE01', $1, 1, 'PUBLIC_RESEARCH_LEAD', true, null,
             'PASS', 'PASS', 'ALLOWED_SYNTHETIC_LAB', true, false, false, 'UNVERIFIED',
             'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED', 'SYNTHETIC_LAB_PROJECTION', $2, $2, '{}'::jsonb)`,
            [leadOneId, "8".repeat(64)],
          ),
        "community_public_version_release_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_lead_public_versions
            (public_version_id, lead_id, lead_version, publication_object_type,
             reporter_publication_consent, subject_exact_version_approval, privacy_review_outcome,
             abuse_review_state, jurisdiction_policy_state, subject_identifiable,
             direct_subject_quote_present, documents_or_media_present, verification_state,
             evidence_capability, formal_evidence_relationship, status, public_payload_sha256,
             version_record_sha256, public_payload_json)
           VALUES ('ARPUB-INVALIDNESTEDKEY01', $1, 1, 'PUBLIC_RESEARCH_LEAD', true, null,
             'PASS', 'PASS', 'ALLOWED_SYNTHETIC_LAB', false, false, false, 'UNVERIFIED',
             'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED', 'SYNTHETIC_LAB_PROJECTION', $2, $2,
             '{"safe":{"Documents":["synthetic-private-fixture"]}}'::jsonb)`,
            [leadOneId, "7".repeat(64)],
          ),
        "community_lead_public_versions_public_payload_json_check",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_safety_candidates
            (safety_candidate_id, source_target_type, source_target_id, seriousness,
             regulatory_responsibility_state, automated_regulatory_reporting, triage_state,
             payload_json)
           VALUES ('ARSAFE-INVALIDAUTO01', 'LEAD', $1, 'SERIOUS', 'ASSESSMENT_REQUIRED',
             true, 'IN_REVIEW', '{}'::jsonb)`,
            [leadOneId],
          ),
        "community_safety_no_auto_reporting",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_composer_draft_versions
              (draft_id, draft_version, reporter_account_id, entry_point, source_post_id,
               source_post_disposition, status, public_lead_permission,
               preview_acknowledged, payload_sha256, payload_json, updated_at)
             VALUES ('ARDRAFT-INVALIDREQUEST01', 1, 'ARSYN-ACCEPTACCOUNT01', 'FORUM_POST',
               'SYNTHETIC-POST-9998', 'CONVERSION_ACCEPTED',
               'SYNTHETIC_PUBLICATION_REQUESTED', 'NO', false, $1, '{}'::jsonb, $2)`,
            ["6".repeat(64), AT],
          ),
        "community_composer_publication_request_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_operational_actions
              (action_id, queue_item_id, actor_id, originator_actor_id,
               independent_review_required, active_role, capability, action,
               source_meaning_sha256_before, source_meaning_sha256_after,
               annotation_text, automated_regulatory_reporting, resulting_status,
               payload_sha256, payload_json, occurred_at)
             VALUES ('ARACTION-INVALIDCOLLISION01', $1, 'ARSYN-ACCEPTORIGINATOR01',
               'ARSYN-ACCEPTORIGINATOR01', true, 'SAFETY_REVIEWER', 'TRIAGE_SAFETY',
               'TRIAGE_FOR_HUMAN_REVIEW', $2, $2, null, false, 'IN_REVIEW',
               $3, '{}'::jsonb, $4)`,
            [safetyQueue.queueItemId, sourceMeaningSha256, "5".repeat(64), AT],
          ),
        "community_operational_action_independent_review_gate",
      );
      const prohibitedColumns = await sqlClient.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = $1
           AND column_name IN ('email', 'raw_body', 'raw_content', 'subject_private_ref')`,
        [schema],
      );
      if (prohibitedColumns.rowCount !== 0)
        throw new Error("COMMUNITY_PROHIBITED_PERSISTENT_COLUMN_FOUND");
      const rawFlags = await sqlClient.query<{ retained: boolean }>(
        `SELECT bool_or(raw_forum_body_persisted) AS retained FROM (
           SELECT raw_forum_body_persisted FROM community_forum_events
           UNION ALL SELECT raw_forum_body_persisted FROM community_forum_post_versions
           UNION ALL SELECT raw_forum_body_persisted FROM community_leads
         ) flags`,
      );
      if (rawFlags.rows[0]?.retained !== false)
        throw new Error("COMMUNITY_RAW_BODY_RETENTION_BOUNDARY_FAILED");
    } finally {
      sqlClient.release();
    }
    checks.push("database_privacy_role_consent_and_nonautomation_constraints_enforced");

    await community.withdraw(
      version.publicVersionId,
      "2026-08-30T19:00:00.000Z",
    );
    if ((await community.getProjection(version.publicVersionId)) !== null) {
      throw new Error("COMMUNITY_WITHDRAWAL_PROJECTION_REMOVAL_FAILED");
    }
    checks.push("withdrawal_removes_projection_with_content_free_tombstone");

    const appendOnlyClient = await pool.connect();
    try {
      await appendOnlyClient.query(`SET search_path TO ${schema}, public`);
      await expectReject(
        () =>
          appendOnlyClient.query(
            "UPDATE community_leads SET status = 'APPROVED' WHERE lead_id = $1",
            [leadOneId],
          ),
        "APPEND_ONLY_TABLE",
      );
    } finally {
      appendOnlyClient.release();
    }
    checks.push("community_records_are_append_only");

    process.stdout.write(
      `${JSON.stringify({
        status: "PASS",
        schema,
        checks,
        check_count: checks.length,
        synthetic_only: true,
        real_health_data_used: false,
        public_forum_deployed: false,
        public_lead_published: false,
        research_recruitment_activated: false,
        regulatory_reporting_automated: false,
      })}\n`,
    );
  } finally {
    await pool.end();
    await community.close();
    await evidence.close();
  }
}

const invokedPath =
  process.argv[1] === undefined
    ? undefined
    : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "unknown community acceptance failure";
    process.stderr.write(
      `Community forum synthetic acceptance failed: ${message}\n`,
    );
    process.exitCode = 1;
  });
}
