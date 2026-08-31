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
    checks.push("seven_migration_chain_applied");

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

    const hostileModerationQueue = await community.enqueueOperation({
      synthetic: true,
      queueItemId: "ARQUEUE-ACCEPTHOSTILEMOD01",
      queueType: "MODERATION",
      requiredCapability: "MODERATE_CONDUCT",
      targetType: "LEAD",
      targetId: "ARLEAD-ACCEPTSECONDHAND01",
      originatorActorId: "ARSYN-ACCEPTINTEGRITY01",
      independentReviewRequired: true,
      sourceMeaningSha256,
      seriousness: "NOT_APPLICABLE",
      automatedRegulatoryReporting: false,
      status: "QUEUED",
      createdAt: AT,
    });
    const hostileScientificQueue = await community.enqueueOperation({
      synthetic: true,
      queueItemId: "ARQUEUE-ACCEPTHOSTILESCI01",
      queueType: "SCIENTIFIC",
      requiredCapability: "ANNOTATE_SCIENCE",
      targetType: "LEAD",
      targetId: "ARLEAD-ACCEPTSECONDHAND01",
      originatorActorId: "ARSYN-ACCEPTINTEGRITY01",
      independentReviewRequired: true,
      sourceMeaningSha256,
      seriousness: "NOT_APPLICABLE",
      automatedRegulatoryReporting: false,
      status: "QUEUED",
      createdAt: AT,
    });

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
    const minorLead = communityLeadSchema.parse({
      ...lead("ARLEAD-ACCEPTMINORHOLD01", 9002, []),
      subjectBoundary: {
        subjectIdentifiableInPublicVersion: false,
        directSubjectQuotePresent: false,
        subjectDocumentsOrMediaPresent: false,
        subjectExactVersionApproval: null,
        minorStatus: "MINOR",
      },
      status: "PRIVACY_HOLD",
    });
    await community.createLead(minorLead, duplicateEvent.eventId);
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
    const updatedCluster = communitySignalClusterSchema.parse({
      ...cluster,
      clusterVersion: 2,
      formalEvidenceRelationship: "FORMAL_EVIDENCE_CONFLICTED",
      limitations: [
        ...cluster.limitations,
        "Synthetic corrected formal evidence remains conflicted and stale pending review.",
      ],
      createdAt: "2026-08-30T18:01:00.000Z",
    });
    await community.createCluster(updatedCluster);

    const sqlClient = await pool.connect();
    try {
      await sqlClient.query(`SET search_path TO ${schema}, public`);
      await sqlClient.query(
        `INSERT INTO community_integrity_signals
          (integrity_signal_id, kind, target_type, target_id,
           source_meaning_sha256_before, source_meaning_sha256_after,
           verification_state_before, verification_state_after,
           evidence_capability_before, evidence_capability_after,
           formal_evidence_relationship_before, formal_evidence_relationship_after,
           independent_source_count_before, independent_source_count_after,
           engagement_affects_evidence_state, required_queue_types, queue_item_ids,
           automated_regulatory_reporting, payload_sha256, payload_json, created_at)
         VALUES ('ARINT-ACCEPTBRIGADE01', 'VOTE_BRIGADING', 'LEAD', $1,
           $2, $2, 'UNVERIFIED', 'UNVERIFIED', 'COMBINATION_ASSOCIATION_ONLY',
           'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED', 'NOT_CHECKED', 1, 1,
           false, ARRAY['MODERATION', 'SCIENTIFIC'], ARRAY[$3, $4], false,
           $5, $6::jsonb, $7)`,
        [
          leadOneId,
          sourceMeaningSha256,
          hostileModerationQueue.queueItemId,
          hostileScientificQueue.queueItemId,
          sha256("synthetic integrity acceptance"),
          JSON.stringify({
            synthetic: true,
            labOnly: true,
            engagement: { views: 1_000_000, votes: 900_000 },
            engagementAffectsEvidenceState: false,
          }),
          AT,
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_moderation_events
          (event_id, target_type, target_id, actor_role, action, reason, appealable, occurred_at)
         VALUES ('ARMOD-ACCEPTDISAGREE01', 'LEAD', $1, 'GLOBAL_MODERATOR', 'HIDE',
           'Synthetic conduct-only moderation fixture.', true, $2)`,
        [leadOneId, AT],
      );
      await sqlClient.query(
        `INSERT INTO community_scientific_annotations
          (annotation_id, target_type, target_id, annotation_type, annotation_text,
           actor_role, appealable, occurred_at)
         VALUES ('ARANN-ACCEPTDISAGREE01', 'LEAD', $1, 'UNRESOLVED_DISPUTE',
           'Synthetic scientific disagreement remains unresolved.',
           'SCIENTIFIC_ANNOTATOR', true, $2)`,
        [leadOneId, AT],
      );
      await sqlClient.query(
        `INSERT INTO community_review_disagreements
          (disagreement_id, target_type, target_id, moderation_event_id,
           moderation_disposition, scientific_annotation_id, scientific_disposition,
           source_meaning_sha256_before, source_meaning_sha256_after, status,
           payload_sha256, payload_json, recorded_at)
         VALUES ('ARDIS-ACCEPTSEPARATE01', 'LEAD', $1, 'ARMOD-ACCEPTDISAGREE01',
           'CONDUCT_ACTION_RECORDED', 'ARANN-ACCEPTDISAGREE01', 'UNRESOLVED',
           $2, $2, 'OPEN', $3, '{}'::jsonb, $4)`,
        [
          leadOneId,
          sourceMeaningSha256,
          sha256("synthetic disagreement acceptance"),
          AT,
        ],
      );
      const lifecycleRows = [
        ["ARLIFE-ACCEPTDRAFT0001", null, "DRAFT", "NOT_VISIBLE", "NOT_VISIBLE"],
        [
          "ARLIFE-ACCEPTREVIEW001",
          "DRAFT",
          "PRIVACY_REVIEW",
          "NOT_VISIBLE",
          "NOT_VISIBLE",
        ],
        [
          "ARLIFE-ACCEPTAPPROVE01",
          "PRIVACY_REVIEW",
          "APPROVED",
          "NOT_VISIBLE",
          "NOT_VISIBLE",
        ],
        [
          "ARLIFE-ACCEPTPROJECT01",
          "APPROVED",
          "SYNTHETIC_LAB_PROJECTION",
          "NOT_VISIBLE",
          "SYNTHETIC_LAB_ONLY",
        ],
      ] as const;
      for (const [eventId, fromState, toState, before, after] of lifecycleRows) {
        await sqlClient.query(
          `INSERT INTO community_publication_lifecycle_events
            (lifecycle_event_id, public_version_id, lead_id, lead_version,
             from_state, to_state, visibility_before, visibility_after,
             verification_state_before, verification_state_after,
             evidence_capability_before, evidence_capability_after,
             formal_evidence_relationship_before, formal_evidence_relationship_after,
             payload_sha256, payload_json, occurred_at)
           VALUES ($1, $2, $3, 1, $4, $5, $6, $7,
             'UNVERIFIED', 'UNVERIFIED', 'COMBINATION_ASSOCIATION_ONLY',
             'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED', 'NOT_CHECKED',
             $8, '{}'::jsonb, $9)`,
          [
            eventId,
            version.publicVersionId,
            leadOneId,
            fromState,
            toState,
            before,
            after,
            sha256(`synthetic lifecycle ${eventId}`),
            AT,
          ],
        );
      }
      await sqlClient.query(
        `INSERT INTO community_research_questions
          (question_id, question_version, question_text, evidence_check_status,
           status, payload_json)
         VALUES ('ARQ-ACCEPTHOSTILE01', 1,
           'What evidence could distinguish the synthetic signal?',
           'NOT_CHECKED', 'EVIDENCE_CHECK', $1::jsonb)`,
        [
          JSON.stringify({
            synthetic: true,
            derivedFromClusterIds: [cluster.clusterId],
          }),
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_research_question_cluster_dependencies
          (question_id, question_version, cluster_id, cluster_version)
         VALUES ('ARQ-ACCEPTHOSTILE01', 1, $1, 1)`,
        [cluster.clusterId],
      );
      await sqlClient.query(
        `INSERT INTO community_question_evidence_checks
          (evidence_check_id, question_id, question_version, matched_evidence_status,
           summary, evidence_identifiers, checked_at)
         VALUES ('AREC-ACCEPTHOSTILE01', 'ARQ-ACCEPTHOSTILE01', 1,
           'NOT_ANSWERED', 'Synthetic exact-scope evidence check remains unresolved.',
           '[]'::jsonb, $1)`,
        [AT],
      );
      await sqlClient.query(
        `INSERT INTO community_research_proposals
          (proposal_id, proposal_version, question_id, question_version, status,
           recruitment_active, payload_json)
         VALUES ('ARPROP-ACCEPTHOSTILE01', 1, 'ARQ-ACCEPTHOSTILE01', 1,
           'DRAFT', false, $1::jsonb)`,
        [
          JSON.stringify({
            synthetic: true,
            recruitmentActive: false,
            ethicsState: "REVIEW_REQUIRED",
            privacyState: "REVIEW_REQUIRED",
            safetyState: "REVIEW_REQUIRED",
          }),
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_research_proposal_evidence_links
          (proposal_id, proposal_version, evidence_check_id, question_id, question_version)
         VALUES ('ARPROP-ACCEPTHOSTILE01', 1, 'AREC-ACCEPTHOSTILE01',
           'ARQ-ACCEPTHOSTILE01', 1)`,
      );
      await sqlClient.query(
        `INSERT INTO community_moderation_events
          (event_id, target_type, target_id, actor_role, action, reason, appealable, occurred_at)
         VALUES ('ARMOD-ACCEPTREVERSAL01', 'LEAD', $1, 'GLOBAL_MODERATOR', 'RESTORE',
           'Synthetic appeal reversal; scientific disposition remains separate.', true, $2)`,
        [leadOneId, AT],
      );
      await sqlClient.query(
        `INSERT INTO community_moderation_appeals
          (appeal_id, original_moderation_event_id, resolution_moderation_event_id,
           target_type, target_id, appellant_actor_id,
           source_meaning_sha256_before, source_meaning_sha256_after,
           scientific_disposition_changed, appeal_state, payload_sha256, payload_json, occurred_at)
         VALUES ('ARAPPEAL-ACCEPTREVERSAL01', 'ARMOD-ACCEPTDISAGREE01',
           'ARMOD-ACCEPTREVERSAL01', 'LEAD', $1, 'ARSYN-ACCEPTAPPELLANT01',
           $2, $2, false, 'REVERSED', $3, '{}'::jsonb, $4)`,
        [
          leadOneId,
          sourceMeaningSha256,
          sha256("synthetic moderation appeal acceptance"),
          AT,
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_formal_evidence_updates
          (evidence_update_id, cluster_id, from_cluster_version, to_cluster_version,
           update_kind, scope_relationship, formal_evidence_relationship_before,
           formal_evidence_relationship_after, freshness_before, freshness_after,
           community_report_count_before, community_report_count_after,
           community_report_count_affects_formal_evidence, originating_reports_retained,
           originating_report_meaning_changed, effectiveness_percentage_display_permitted,
           payload_sha256, payload_json, occurred_at)
         VALUES ('AREVUP-ACCEPTSTALECONFLICT01', $1, 1, 2,
           'CORRECTION_OR_RETRACTION', 'ALIGNED_SCOPE', 'NOT_CHECKED',
           'FORMAL_EVIDENCE_CONFLICTED', 'CURRENT', 'STALE_PENDING_REVIEW',
           2, 1000002, false, true, false, false, $2, '{}'::jsonb, $3)`,
        [
          cluster.clusterId,
          sha256("synthetic formal evidence update acceptance"),
          AT,
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_research_questions
          (question_id, question_version, question_text, evidence_check_status,
           status, payload_json)
         VALUES ('ARQ-ACCEPTHOSTILE01', 2,
           'Which exact part of the synthetic signal remains unanswered?',
           'NOT_ANSWERED', 'OPEN_UNCERTAINTY', $1::jsonb)`,
        [
          JSON.stringify({
            synthetic: true,
            derivedFromClusterIds: [cluster.clusterId],
          }),
        ],
      );
      await sqlClient.query(
        `INSERT INTO community_question_transitions
          (transition_id, question_id, from_question_version, to_question_version,
           evidence_check_id, matched_evidence_status, from_status, to_status,
           transition_kind, payload_sha256, payload_json, occurred_at)
         VALUES ('ARQTRANS-ACCEPTUNANSWERED01', 'ARQ-ACCEPTHOSTILE01', 1, 2,
           'AREC-ACCEPTHOSTILE01', 'NOT_ANSWERED', 'EVIDENCE_CHECK',
           'OPEN_UNCERTAINTY', 'OPEN_UNANSWERED', $1, '{}'::jsonb, $2)`,
        [sha256("synthetic question transition acceptance"), AT],
      );
      await sqlClient.query(
        `INSERT INTO community_proposal_feasibility_assessments
          (assessment_id, proposal_id, proposal_version, question_id, question_version,
           evidence_check_id, matched_evidence_status, design_answerability,
           popularity_affects_feasibility, disposition, launch_authorized,
           recruitment_active, payload_sha256, payload_json, assessed_at)
         VALUES ('ARFEAS-ACCEPTINFEASIBLE01', 'ARPROP-ACCEPTHOSTILE01', 1,
           'ARQ-ACCEPTHOSTILE01', 1, 'AREC-ACCEPTHOSTILE01', 'NOT_ANSWERED',
           'INFEASIBLE', false, 'BLOCKED_INFEASIBLE_DESIGN', false, false,
           $1, $2::jsonb, $3)`,
        [
          sha256("synthetic feasibility acceptance"),
          JSON.stringify({ popularity: { votes: 1_000_000, comments: 100_000 } }),
          AT,
        ],
      );
      const closedLoopPayload = {
        clusterTargets: [{ clusterId: cluster.clusterId, clusterVersion: 2 }],
        leadTargets: [{ leadId: leadOneId, leadVersion: 1 }],
        forumTargets: [{ targetType: "TOPIC", targetId: "SYNTHETIC-TOPIC-9001" }],
      };
      await sqlClient.query(
        `INSERT INTO community_closed_loop_results
          (result_propagation_id, proposal_id, proposal_version, question_id,
           question_version, result_direction, formal_evidence_relationship,
           originating_reports_retained, originating_hypothesis_penalized,
           source_meaning_changed, causal_claim_permitted,
           effectiveness_percentage_display_permitted, recruitment_active,
           payload_sha256, payload_json, propagated_at)
         VALUES ('ARRESULT-ACCEPTNEGATIVE01', 'ARPROP-ACCEPTHOSTILE01', 1,
           'ARQ-ACCEPTHOSTILE01', 1, 'NEGATIVE', 'CONTRADICTED_FOR_MATCHED_SCOPE',
           true, false, false, false, false, false, $1, $2::jsonb, $3)`,
        [
          sha256(stableJson(closedLoopPayload)),
          JSON.stringify(closedLoopPayload),
          AT,
        ],
      );
      const minorPublicVersionId = "ARPUB-ACCEPTMINORHOLD01";
      await sqlClient.query(
        `INSERT INTO community_lead_public_versions
          (public_version_id, lead_id, lead_version, publication_object_type,
           reporter_publication_consent, subject_exact_version_approval,
           privacy_review_outcome, abuse_review_state, jurisdiction_policy_state,
           subject_identifiable, direct_subject_quote_present, documents_or_media_present,
           verification_state, evidence_capability, formal_evidence_relationship,
           status, public_payload_sha256, version_record_sha256, public_payload_json)
         VALUES ($1, $2, 1, 'PUBLIC_RESEARCH_LEAD', true, null,
           'HUMAN_REVIEW_REQUIRED', 'PENDING', 'REVIEW_REQUIRED', false, false, false,
           'UNVERIFIED', 'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED',
           'PRIVACY_REVIEW', $3, $4, '{}'::jsonb)`,
        [
          minorPublicVersionId,
          minorLead.leadId,
          sha256("synthetic minor public candidate payload"),
          sha256("synthetic minor public candidate record"),
        ],
      );
      const rareRiskFlags = [
        "RARE_COMBINATION",
        "PRECISE_LOCATION",
        "CLINICIAN_OR_CLINIC",
        "EXACT_DATE_OR_AGE",
      ];
      await sqlClient.query(
        `INSERT INTO community_privacy_publication_gates
          (gate_id, public_version_id, lead_id, lead_version,
           risk_flags_before, risk_flags_after, generalization_applied,
           minor_status, guardian_consent_state, legal_privacy_review_state,
           ordinary_projection_permitted, decision, assessed_at)
         VALUES ('ARPRIVGATE-ACCEPTRARERISK01', $1, $2, 1,
           $3::text[], $3::text[], false, 'ADULT', 'NOT_APPLICABLE', 'APPROVED',
           false, 'HOLD_REIDENTIFICATION', $4)`,
        [version.publicVersionId, leadOneId, rareRiskFlags, AT],
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_privacy_publication_gates
              (gate_id, public_version_id, lead_id, lead_version,
               risk_flags_before, risk_flags_after, generalization_applied,
               minor_status, guardian_consent_state, legal_privacy_review_state,
               ordinary_projection_permitted, decision, assessed_at)
             VALUES ('ARPRIVGATE-INVALIDRARERISK01', $1, $2, 1,
               $3::text[], $3::text[], false, 'ADULT', 'NOT_APPLICABLE', 'APPROVED',
               true, 'ELIGIBLE_SYNTHETIC_LAB', $4)`,
            [version.publicVersionId, leadOneId, rareRiskFlags, AT],
          ),
        "community_privacy_gate_decision",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_privacy_publication_gates
              (gate_id, public_version_id, lead_id, lead_version,
               risk_flags_before, risk_flags_after, generalization_applied,
               minor_status, guardian_consent_state, legal_privacy_review_state,
               ordinary_projection_permitted, decision, assessed_at)
             VALUES ('ARPRIVGATE-INVALIDDUPRISK001', $1, $2, 1,
               ARRAY['RARE_COMBINATION', 'RARE_COMBINATION'],
               ARRAY['RARE_COMBINATION', 'RARE_COMBINATION'], false,
               'ADULT', 'NOT_APPLICABLE', 'APPROVED', false,
               'HOLD_REIDENTIFICATION', $3)`,
            [version.publicVersionId, leadOneId, AT],
          ),
        "community_privacy_gate_risk_flags_allowed",
      );
      checks.push("rare_reidentification_requires_complete_generalization");

      await sqlClient.query(
        `INSERT INTO community_privacy_publication_gates
          (gate_id, public_version_id, lead_id, lead_version,
           risk_flags_before, risk_flags_after, generalization_applied,
           minor_status, guardian_consent_state, legal_privacy_review_state,
           ordinary_projection_permitted, decision, assessed_at)
         VALUES ('ARPRIVGATE-ACCEPTMINORHOLD01', $1, $2, 1,
           '{}'::text[], '{}'::text[], false, 'MINOR', 'PENDING', 'REVIEW_REQUIRED',
           false, 'HOLD_MINOR_REVIEW', $3)`,
        [minorPublicVersionId, minorLead.leadId, AT],
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_privacy_publication_gates
              (gate_id, public_version_id, lead_id, lead_version,
               risk_flags_before, risk_flags_after, generalization_applied,
               minor_status, guardian_consent_state, legal_privacy_review_state,
               ordinary_projection_permitted, decision, assessed_at)
             VALUES ('ARPRIVGATE-INVALIDMINOR0001', $1, $2, 1,
               '{}'::text[], '{}'::text[], false, 'MINOR', 'APPROVED', 'APPROVED',
               true, 'ELIGIBLE_SYNTHETIC_LAB', $3)`,
            [minorPublicVersionId, minorLead.leadId, AT],
          ),
        "community_privacy_gate_decision",
      );
      checks.push("minor_and_unknown_age_require_enhanced_nonordinary_review");

      await sqlClient.query(
        `INSERT INTO community_external_source_extraction_boundaries
          (extraction_id, external_source_id, source_url, source_visibility,
           provider_terms_state, attribution_state, quotation_state, privacy_state,
           deletion_state, raw_source_body_persisted, publication_eligible,
           decision, assessed_at)
         VALUES ('AREXTRACT-ACCEPTPUBLIC0001', 'ARSYN-ACCEPTEXTERNAL01',
           'https://public-source.synthetic.invalid/report/1', 'PUBLIC', 'ALLOWED',
           'COMPLETE', 'NONE', 'PASS', 'ACTIVE', false, true,
           'ELIGIBLE_SYNTHETIC_LAB', $1)`,
        [AT],
      );
      await sqlClient.query(
        `INSERT INTO community_external_source_extraction_boundaries
          (extraction_id, external_source_id, source_url, source_visibility,
           provider_terms_state, attribution_state, quotation_state, privacy_state,
           deletion_state, raw_source_body_persisted, publication_eligible,
           decision, assessed_at)
         VALUES ('AREXTRACT-ACCEPTDELETED001', 'ARSYN-ACCEPTEXTERNAL02',
           'https://deleted-source.synthetic.invalid/report/2', 'DELETED', 'ALLOWED',
           'COMPLETE', 'NONE', 'PASS', 'DELETED', false, false,
           'WITHDRAW_SOURCE_DELETED', $1)`,
        [AT],
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_external_source_extraction_boundaries
              (extraction_id, external_source_id, source_url, source_visibility,
               provider_terms_state, attribution_state, quotation_state, privacy_state,
               deletion_state, raw_source_body_persisted, publication_eligible,
               decision, assessed_at)
             VALUES ('AREXTRACT-INVALIDPRIVATE01', 'ARSYN-INVALIDEXTERNAL01',
               'https://private-source.synthetic.invalid/report/3', 'PRIVATE', 'ALLOWED',
               'COMPLETE', 'NONE', 'PASS', 'ACTIVE', false, true,
               'ELIGIBLE_SYNTHETIC_LAB', $1)`,
            [AT],
          ),
        "community_external_source_decision",
      );
      checks.push("external_source_terms_attribution_privacy_and_deletion_gate");

      await sqlClient.query(
        `INSERT INTO community_deleted_source_retention_decisions
          (decision_id, source_event_id, source_version, lead_id, lead_version,
           public_version_id, source_deleted, source_body_retained, provenance_retained,
           reporter_public_lead_consent_state, lead_consent_independent_of_source_post,
           privacy_policy_state, disposition, assessed_at)
         VALUES ('ARRETENTION-ACCEPTDELETED0001', $1, 4, $2, 1, $3,
           true, false, true, 'YES', true, 'PASS', 'RETAIN_DEIDENTIFIED_LEAD', $4)`,
        [deleted.eventId, leadOneId, version.publicVersionId, AT],
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_deleted_source_retention_decisions
              (decision_id, source_event_id, source_version, lead_id, lead_version,
               public_version_id, source_deleted, source_body_retained, provenance_retained,
               reporter_public_lead_consent_state, lead_consent_independent_of_source_post,
               privacy_policy_state, disposition, assessed_at)
             VALUES ('ARRETENTION-INVALIDCONSENT01', $1, 4, $2, 1, $3,
               true, false, true, 'WITHDRAWN', true, 'PASS',
               'RETAIN_DEIDENTIFIED_LEAD', $4)`,
            [deleted.eventId, leadOneId, version.publicVersionId, AT],
          ),
        "community_deleted_source_retention_disposition",
      );
      checks.push("deleted_source_retention_requires_independent_consent_and_policy");

      await sqlClient.query(
        `INSERT INTO community_private_intake_boundaries
          (boundary_id, intake_id, intake_class, source_visibility,
           initial_public_lead_consent_state, forum_record_created,
           public_projection_created, later_separate_public_lead_workflow_required,
           raw_intake_body_persisted, assessed_at)
         VALUES ('ARPRIVATE-ACCEPTPAIDINTAKE01', 'ARSYN-ACCEPTPAIDINTAKE01',
           'PAID_PRIVATE', 'PRIVATE', 'NOT_ASKED', false, false, true, false, $1)`,
        [AT],
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_private_intake_boundaries
              (boundary_id, intake_id, intake_class, source_visibility,
               initial_public_lead_consent_state, forum_record_created,
               public_projection_created, later_separate_public_lead_workflow_required,
               raw_intake_body_persisted, assessed_at)
             VALUES ('ARPRIVATE-INVALIDPAIDINTAKE1', 'ARSYN-INVALIDPAIDINTAKE01',
               'PAID_PRIVATE', 'PRIVATE', 'NOT_ASKED', false, true, true, false, $1)`,
            [AT],
          ),
        "community_private_intake_no_public_projection",
      );
      checks.push("paid_private_intake_creates_no_forum_or_public_projection");
      checks.push(
        "hostile_integrity_lifecycle_and_exact_research_dependencies_persisted",
      );
      checks.push(
        "appeal_evidence_feasibility_and_negative_result_loop_persisted",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_formal_evidence_updates
              (evidence_update_id, cluster_id, from_cluster_version, to_cluster_version,
               update_kind, scope_relationship, formal_evidence_relationship_before,
               formal_evidence_relationship_after, freshness_before, freshness_after,
               community_report_count_before, community_report_count_after,
               community_report_count_affects_formal_evidence, originating_reports_retained,
               originating_report_meaning_changed, effectiveness_percentage_display_permitted,
               payload_sha256, payload_json, occurred_at)
             VALUES ('AREVUP-INVALIDPOPULARITY01', $1, 1, 2,
               'NEW_FORMAL_EVIDENCE', 'ALIGNED_SCOPE', 'NOT_CHECKED',
               'CORROBORATED_FOR_MATCHED_SCOPE', 'CURRENT', 'CURRENT', 2, 1000002,
               true, true, false, false, $2, '{}'::jsonb, $3)`,
            [cluster.clusterId, sha256("invalid popularity evidence update"), AT],
          ),
        "community_formal_update_report_count_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_closed_loop_results
              (result_propagation_id, proposal_id, proposal_version, question_id,
               question_version, result_direction, formal_evidence_relationship,
               originating_reports_retained, originating_hypothesis_penalized,
               source_meaning_changed, causal_claim_permitted,
               effectiveness_percentage_display_permitted, recruitment_active,
               payload_sha256, payload_json, propagated_at)
             VALUES ('ARRESULT-INVALIDERASURE01', 'ARPROP-ACCEPTHOSTILE01', 1,
               'ARQ-ACCEPTHOSTILE01', 1, 'NEGATIVE', 'CONTRADICTED_FOR_MATCHED_SCOPE',
               false, false, false, false, false, false, $1, $2::jsonb, $3)`,
            [
              sha256("invalid closed loop report erasure"),
              JSON.stringify(closedLoopPayload),
              AT,
            ],
          ),
        "community_closed_loop_reports_retained_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_integrity_signals
              (integrity_signal_id, kind, target_type, target_id,
               source_meaning_sha256_before, source_meaning_sha256_after,
               verification_state_before, verification_state_after,
               evidence_capability_before, evidence_capability_after,
               formal_evidence_relationship_before, formal_evidence_relationship_after,
               independent_source_count_before, independent_source_count_after,
               engagement_affects_evidence_state, required_queue_types, queue_item_ids,
               automated_regulatory_reporting, payload_sha256, payload_json, created_at)
             VALUES ('ARINT-INVALIDUPGRADE01', 'VOTE_BRIGADING', 'LEAD', $1,
               $2, $2, 'UNVERIFIED', 'SUBJECT_VERIFIED', 'COMBINATION_ASSOCIATION_ONLY',
               'FORMAL_EVIDENCE_LINKED', 'NOT_CHECKED', 'CORROBORATED_FOR_MATCHED_SCOPE',
               1, 2, false, ARRAY['MODERATION', 'SCIENTIFIC'], ARRAY[$3, $4], false,
               $5, '{}'::jsonb, $6)`,
            [
              leadOneId,
              sourceMeaningSha256,
              hostileModerationQueue.queueItemId,
              hostileScientificQueue.queueItemId,
              sha256("invalid synthetic integrity upgrade"),
              AT,
            ],
          ),
        "community_integrity_evidence_immutable",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_integrity_signals
              (integrity_signal_id, kind, target_type, target_id,
               source_meaning_sha256_before, source_meaning_sha256_after,
               verification_state_before, verification_state_after,
               evidence_capability_before, evidence_capability_after,
               formal_evidence_relationship_before, formal_evidence_relationship_after,
               independent_source_count_before, independent_source_count_after,
               engagement_affects_evidence_state, required_queue_types, queue_item_ids,
               automated_regulatory_reporting, payload_sha256, payload_json, created_at)
             VALUES ('ARINT-INVALIDDANGERQUEUE01', 'DANGEROUS_INSTRUCTION', 'LEAD', $1,
               $2, $2, 'UNVERIFIED', 'UNVERIFIED', 'COMBINATION_ASSOCIATION_ONLY',
               'COMBINATION_ASSOCIATION_ONLY', 'NOT_CHECKED', 'NOT_CHECKED', 1, 1,
               false, ARRAY['MODERATION', 'SCIENTIFIC'], ARRAY[$3, $4], false,
               $5, '{}'::jsonb, $6)`,
            [
              leadOneId,
              sourceMeaningSha256,
              hostileModerationQueue.queueItemId,
              hostileScientificQueue.queueItemId,
              sha256("invalid synthetic danger queue"),
              AT,
            ],
          ),
        "community_integrity_kind_queue_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_publication_lifecycle_events
              (lifecycle_event_id, public_version_id, lead_id, lead_version,
               from_state, to_state, visibility_before, visibility_after,
               verification_state_before, verification_state_after,
               evidence_capability_before, evidence_capability_after,
               formal_evidence_relationship_before, formal_evidence_relationship_after,
               payload_sha256, payload_json, occurred_at)
             VALUES ('ARLIFE-INVALIDAPPROVAL01', $1, $2, 1,
               'SYNTHETIC_LAB_PROJECTION', 'WITHDRAWN', 'SYNTHETIC_LAB_ONLY',
               'SYNTHETIC_LAB_ONLY', 'UNVERIFIED', 'UNVERIFIED',
               'COMBINATION_ASSOCIATION_ONLY', 'COMBINATION_ASSOCIATION_ONLY',
               'NOT_CHECKED', 'NOT_CHECKED', $3, '{}'::jsonb, $4)`,
            [
              version.publicVersionId,
              leadOneId,
              sha256("invalid synthetic approval visibility"),
              AT,
            ],
          ),
        "community_publication_lifecycle_visibility_gate",
      );
      await expectReject(
        () =>
          sqlClient.query(
            `INSERT INTO community_publication_lifecycle_events
              (lifecycle_event_id, public_version_id, lead_id, lead_version,
               from_state, to_state, visibility_before, visibility_after,
               verification_state_before, verification_state_after,
               evidence_capability_before, evidence_capability_after,
               formal_evidence_relationship_before, formal_evidence_relationship_after,
               payload_sha256, payload_json, occurred_at)
             VALUES ('ARLIFE-INVALIDIDENTITY01', $1, $2, 1,
               'SYNTHETIC_LAB_PROJECTION', 'CHALLENGED', 'SYNTHETIC_LAB_ONLY',
               'NOT_VISIBLE', 'UNVERIFIED', 'UNVERIFIED',
               'COMBINATION_ASSOCIATION_ONLY', 'COMBINATION_ASSOCIATION_ONLY',
               'NOT_CHECKED', 'NOT_CHECKED', $3, '{}'::jsonb, $4)`,
            [
              version.publicVersionId,
              leadTwoId,
              sha256("invalid synthetic lifecycle identity"),
              AT,
            ],
          ),
        "COMMUNITY_PUBLICATION_LIFECYCLE_IDENTITY_MISMATCH",
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

    const propagationClient = await pool.connect();
    try {
      await propagationClient.query(`SET search_path TO ${schema}, public`);
      const propagationPayload = {
        synthetic: true,
        labOnly: true,
        publicVersionId: version.publicVersionId,
        clusterChanges: [
          {
            clusterId: cluster.clusterId,
            fromClusterVersion: 1,
            toClusterVersion: null,
            disposition: "RETIRED_EMPTY",
          },
        ],
        affectedQuestions: [
          {
            questionId: "ARQ-ACCEPTHOSTILE01",
            questionVersion: 1,
            dependencyState: "REVIEW_REQUIRED",
          },
        ],
        affectedProposals: [
          {
            proposalId: "ARPROP-ACCEPTHOSTILE01",
            proposalVersion: 1,
            dependencyState: "REVIEW_REQUIRED",
          },
        ],
      };
      await propagationClient.query(
        `INSERT INTO community_withdrawal_events
          (withdrawal_event_id, public_version_id, requested_at,
           propagation_state, public_content_retained, payload_sha256, payload_json)
         VALUES ('ARWITH-ACCEPTWITHDRAW01', $1, $2, 'COMPLETE', false, $3, $4::jsonb)`,
        [
          version.publicVersionId,
          "2026-08-30T19:00:00.000Z",
          sha256("synthetic withdrawal event acceptance"),
          JSON.stringify({
            synthetic: true,
            labOnly: true,
            targetRecordIds: [version.publicVersionId],
            propagationState: "COMPLETE",
            publicContentRetained: false,
          }),
        ],
      );
      await propagationClient.query(
        `INSERT INTO community_withdrawal_propagation_receipts
          (propagation_receipt_id, withdrawal_event_id, public_version_id,
           lead_id, lead_version, exact_projection_removed, public_content_retained,
           provenance_retained, propagation_state, payload_sha256, payload_json, completed_at)
         VALUES ('ARPROPAGATE-ACCEPTWITHDRAW01', 'ARWITH-ACCEPTWITHDRAW01', $1,
           $2, 1, true, false, true, 'COMPLETE', $3, $4::jsonb, $5)`,
        [
          version.publicVersionId,
          leadOneId,
          sha256(stableJson(propagationPayload)),
          JSON.stringify(propagationPayload),
          "2026-08-30T19:01:00.000Z",
        ],
      );
      await expectReject(
        () =>
          propagationClient.query(
            `INSERT INTO community_withdrawal_propagation_receipts
              (propagation_receipt_id, withdrawal_event_id, public_version_id,
               lead_id, lead_version, exact_projection_removed, public_content_retained,
               provenance_retained, propagation_state, payload_sha256, payload_json, completed_at)
             VALUES ('ARPROPAGATE-INVALIDIDENT01', 'ARWITH-INVALIDIDENTITY01', $1,
               $2, 1, true, false, true, 'COMPLETE', $3, '{}'::jsonb, $4)`,
            [
              version.publicVersionId,
              leadTwoId,
              sha256("invalid withdrawal propagation identity"),
              "2026-08-30T19:02:00.000Z",
            ],
          ),
        "COMMUNITY_WITHDRAWAL_PROPAGATION_IDENTITY_MISMATCH",
      );
      await expectReject(
        () =>
          propagationClient.query(
            `INSERT INTO community_withdrawal_propagation_receipts
              (propagation_receipt_id, withdrawal_event_id, public_version_id,
               lead_id, lead_version, exact_projection_removed, public_content_retained,
               provenance_retained, propagation_state, payload_sha256, payload_json, completed_at)
             VALUES ('ARPROPAGATE-INVALIDCONTENT01', 'ARWITH-INVALIDCONTENT01', $1,
               $2, 1, true, true, true, 'COMPLETE', $3, '{}'::jsonb, $4)`,
            [
              version.publicVersionId,
              leadOneId,
              sha256("invalid retained public withdrawal content"),
              "2026-08-30T19:02:00.000Z",
            ],
          ),
        "community_withdrawal_propagation_no_public_content",
      );
    } finally {
      propagationClient.release();
    }
    checks.push(
      "withdrawal_propagates_to_clusters_questions_and_proposals_without_public_content",
    );

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
      await expectReject(
        () =>
          appendOnlyClient.query(
            "DELETE FROM community_integrity_signals WHERE integrity_signal_id = 'ARINT-ACCEPTBRIGADE01'",
          ),
        "APPEND_ONLY_TABLE",
      );
      await expectReject(
        () =>
          appendOnlyClient.query(
            "DELETE FROM community_closed_loop_results WHERE result_propagation_id = 'ARRESULT-ACCEPTNEGATIVE01'",
          ),
        "APPEND_ONLY_TABLE",
      );
      await expectReject(
        () =>
          appendOnlyClient.query(
            "DELETE FROM community_private_intake_boundaries WHERE boundary_id = 'ARPRIVATE-ACCEPTPAIDINTAKE01'",
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
