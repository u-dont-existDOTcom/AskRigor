import { z } from "zod";

const timestampSchema = z.string().datetime({ offset: true });
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const syntheticIdSchema = z.string().regex(/^ARSYN-[A-Z0-9_-]{6,64}$/u);
const shortTextSchema = z.string().trim().min(1).max(300);
const mediumTextSchema = z.string().trim().min(1).max(4_000);

export const communityReporterRoleSchema = z.enum([
  "SELF",
  "FRIEND",
  "FAMILY",
  "CAREGIVER",
  "CLINICIAN",
  "RESEARCHER",
  "PUBLIC_SOURCE_AUTHOR",
  "OTHER",
  "UNKNOWN",
]);

export const communityInformationOriginSchema = z.enum([
  "SELF_EXPERIENCE",
  "DIRECT_OBSERVATION",
  "SUBJECT_RELAYED_TO_REPORTER",
  "THIRD_PARTY_RELAYED",
  "DOCUMENTED_RECORD",
  "PUBLIC_SOURCE_EXTRACTION",
  "MIXED",
  "UNKNOWN",
]);

export const communitySourceDistanceSchema = z.enum([
  "FIRSTHAND_SUBJECT",
  "FIRSTHAND_OBSERVER",
  "ONE_HOP_SUBJECT_RELAY",
  "MULTI_HOP_HEARSAY",
  "PUBLIC_SOURCE_EXTRACTED",
  "MIXED",
  "UNKNOWN",
]);

export const communityVerificationStateSchema = z.enum([
  "UNVERIFIED",
  "REPORTER_ACCOUNT_VERIFIED",
  "REPORTER_IDENTITY_VERIFIED_PRIVATE",
  "SUBJECT_ACKNOWLEDGED",
  "SUBJECT_VERIFIED",
  "DOCUMENT_CORROBORATED",
  "CLINICIAN_CORROBORATED",
  "MULTIPLE_CORROBORATION_TYPES",
  "CONFLICTED",
  "UNVERIFIABLE",
]);

export const communityEvidenceCapabilitySchema = z.enum([
  "LEAD_ONLY",
  "DESCRIPTIVE_REPORT_ONLY",
  "TEMPORAL_ASSOCIATION_ONLY",
  "COMBINATION_ASSOCIATION_ONLY",
  "DECHALLENGE_SIGNAL",
  "RECHALLENGE_SIGNAL",
  "PROSPECTIVE_N_OF_1_SIGNAL",
  "FORMAL_EVIDENCE_LINKED",
  "UNRESOLVED",
]);

export const communityFormalEvidenceRelationshipSchema = z.enum([
  "NOT_CHECKED",
  "SUPPORT_NOT_LOCATED",
  "ADJACENT_ONLY",
  "CORROBORATED_FOR_MATCHED_SCOPE",
  "CONTRADICTED_FOR_MATCHED_SCOPE",
  "OUTCOME_MISMATCH",
  "POPULATION_MISMATCH",
  "INTERVENTION_MISMATCH",
  "TIME_HORIZON_MISMATCH",
  "FORMAL_EVIDENCE_CONFLICTED",
  "UNRESOLVED",
]);

export const communityConsentDecisionSchema = z
  .object({
    decision: z.enum(["YES", "NO", "WITHDRAWN", "NOT_ASKED"]),
    noticeVersion: shortTextSchema,
    noticeSha256: sha256Schema,
    decidedAt: timestampSchema,
    actorType: z.enum([
      "REPORTER",
      "SUBJECT",
      "GUARDIAN",
      "AUTHORIZED_REPRESENTATIVE",
      "SYSTEM",
    ]),
  })
  .strict();

export const syntheticForumAccountSchema = z
  .object({
    synthetic: z.literal(true),
    accountId: syntheticIdSchema,
    externalUserId: syntheticIdSchema,
    email: z
      .string()
      .email()
      .endsWith("@synthetic.askrigor.invalid")
      .refine(
        (value) => value === value.toLowerCase(),
        "Synthetic forum email must be lowercase",
      ),
    emailVerified: z.literal(true),
    pseudonymousDisplayName: z.string().trim().min(3).max(100),
    discourseUserId: z
      .string()
      .regex(/^SYNTHETIC-DISCOURSE-[0-9]{1,12}$/u)
      .nullable(),
    forumSuspended: z.boolean(),
    nonForumProductAccess: z.literal(true),
  })
  .strict();

export const discourseEventTypeSchema = z.enum([
  "forum.topic.created.v1",
  "forum.topic.updated.v1",
  "forum.topic.visibility_changed.v1",
  "forum.post.created.v1",
  "forum.post.edited.v1",
  "forum.post.deleted.v1",
  "forum.user.suspended.v1",
  "forum.lead_opt_in.created.v1",
]);

export const communityForumEventSchema = z
  .object({
    synthetic: z.literal(true),
    eventId: z.string().regex(/^AREVT-[A-Z0-9_-]{8,64}$/u),
    eventType: discourseEventTypeSchema,
    schemaVersion: z.literal("1.0.0"),
    producer: z.literal("DISCOURSE_SYNTHETIC_LAB"),
    forumInstanceId: z.literal("ASKRIGOR-SYNTHETIC-LAB"),
    aggregateId: z.string().regex(/^ARSYN-[A-Z0-9_-]{6,64}$/u),
    sourceVersion: z.number().int().positive(),
    occurredAt: timestampSchema,
    receivedAt: timestampSchema,
    idempotencyKey: z
      .string()
      .regex(/^discourse-synthetic:[a-zA-Z0-9._:-]{1,160}$/u),
    payloadSha256: sha256Schema,
    traceId: z.string().regex(/^ARTRACE-[A-Z0-9_-]{8,64}$/u),
    rawForumBodyPersisted: z.literal(false),
    minimalPayload: z
      .object({
        topicId: z.string().regex(/^SYNTHETIC-TOPIC-[0-9]{1,12}$/u),
        postId: z
          .string()
          .regex(/^SYNTHETIC-POST-[0-9]{1,12}$/u)
          .nullable(),
        authorAccountId: syntheticIdSchema.nullable(),
        visibility: z.enum(["PRIVATE", "MEMBER_ONLY", "PUBLIC", "DELETED"]),
        contentSha256: sha256Schema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.eventType === "forum.post.deleted.v1" &&
      value.minimalPayload.visibility !== "DELETED"
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimalPayload", "visibility"],
        message: "Deleted post events require DELETED visibility",
      });
    }
    if (
      value.eventType === "forum.post.deleted.v1" &&
      value.minimalPayload.contentSha256 !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimalPayload", "contentSha256"],
        message: "Deleted post events cannot retain a content hash",
      });
    }
    if (
      (value.eventType === "forum.post.created.v1" ||
        value.eventType === "forum.post.edited.v1") &&
      value.minimalPayload.contentSha256 === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimalPayload", "contentSha256"],
        message: "Created and edited post events require a content hash",
      });
    }
  });

export const communityForumSourceReferenceSchema = z
  .object({
    synthetic: z.literal(true),
    sourceEventId: z.string().regex(/^AREVT-[A-Z0-9_-]{8,64}$/u),
    forumInstanceId: z.literal("ASKRIGOR-SYNTHETIC-LAB"),
    topicId: z.string().regex(/^SYNTHETIC-TOPIC-[0-9]{1,12}$/u),
    postId: z.string().regex(/^SYNTHETIC-POST-[0-9]{1,12}$/u),
    sourceVersion: z.number().int().positive(),
    sourceVisibility: z.enum(["PRIVATE", "MEMBER_ONLY", "PUBLIC", "DELETED"]),
    authorAccountId: syntheticIdSchema,
    occurredAt: timestampSchema,
    contentSha256: sha256Schema,
    rawForumBodyPersisted: z.literal(false),
  })
  .strict();

export const communityLeadSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    leadVersion: z.number().int().positive(),
    sourceReferences: z
      .array(communityForumSourceReferenceSchema)
      .min(1)
      .max(100),
    reporter: z
      .object({
        accountId: syntheticIdSchema,
        role: communityReporterRoleSchema,
        informationOrigin: communityInformationOriginSchema,
        sourceDistance: communitySourceDistanceSchema,
        verificationState: communityVerificationStateSchema,
      })
      .strict(),
    subjectBoundary: z
      .object({
        subjectIdentifiableInPublicVersion: z.boolean(),
        directSubjectQuotePresent: z.boolean(),
        subjectDocumentsOrMediaPresent: z.boolean(),
        subjectExactVersionApproval: communityConsentDecisionSchema.nullable(),
        minorStatus: z.enum(["ADULT", "MINOR", "UNKNOWN"]),
      })
      .strict(),
    condition: z
      .object({
        name: shortTextSchema,
        diagnosticCertainty: z.enum([
          "CLINICIAN_CONFIRMED",
          "LAB_OR_CRITERIA_SUPPORTED",
          "SELF_IDENTIFIED",
          "REPORTED_BY_PROXY",
          "SUSPECTED",
          "UNKNOWN",
        ]),
      })
      .strict(),
    interventionEpisode: z
      .object({
        episodeType: z.enum([
          "SINGLE",
          "COMBINATION",
          "SEQUENCE",
          "BACKGROUND",
          "UNKNOWN",
        ]),
        components: z
          .array(
            z
              .object({
                name: shortTextSchema,
                doseKnown: z.boolean(),
                route: z.string().max(200).nullable(),
              })
              .strict(),
          )
          .min(1)
          .max(50),
        sequenceKnown: z.boolean(),
      })
      .strict()
      .superRefine((value, context) => {
        if (
          value.episodeType === "COMBINATION" &&
          value.components.length < 2
        ) {
          context.addIssue({
            code: "custom",
            path: ["components"],
            message: "Combination episodes require at least two components",
          });
        }
      }),
    outcome: z
      .object({
        name: shortTextSchema,
        reportedDirection: z.enum([
          "IMPROVED",
          "WORSENED",
          "NO_CLEAR_CHANGE",
          "MIXED",
          "UNKNOWN",
        ]),
        reportedMagnitude: z.enum([
          "MINIMAL",
          "SMALL",
          "MODERATE",
          "LARGE",
          "VERY_LARGE",
          "UNKNOWN",
        ]),
        measurementType: z.enum([
          "SUBJECTIVE_GLOBAL",
          "VALIDATED_PATIENT_REPORTED",
          "DIRECT_OBSERVER",
          "DEVICE",
          "LAB",
          "CLINICIAN_ASSESSED",
          "HEALTHCARE_USE",
          "OTHER",
          "UNKNOWN",
        ]),
      })
      .strict(),
    verificationState: communityVerificationStateSchema,
    evidenceCapability: communityEvidenceCapabilitySchema,
    formalEvidenceRelationship: communityFormalEvidenceRelationshipSchema,
    completenessBand: z.enum(["MINIMAL", "PARTIAL", "MODERATE", "HIGH_DETAIL"]),
    missingMaterialFields: z.array(shortTextSchema).max(100),
    duplicateOrLinkedLeadIds: z
      .array(z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u))
      .max(100)
      .default([]),
    reporterPublicLeadConsent: communityConsentDecisionSchema,
    status: z.enum([
      "STRUCTURED",
      "PRIVACY_HOLD",
      "APPROVED",
      "CHALLENGED",
      "WITHDRAWN",
      "SUPERSEDED",
    ]),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reporterPublicLeadConsent.actorType !== "REPORTER") {
      context.addIssue({
        code: "custom",
        path: ["reporterPublicLeadConsent", "actorType"],
        message:
          "Reporter publication consent must be recorded from the reporter",
      });
    }
    if (
      value.subjectBoundary.subjectExactVersionApproval !== null &&
      !["SUBJECT", "GUARDIAN", "AUTHORIZED_REPRESENTATIVE"].includes(
        value.subjectBoundary.subjectExactVersionApproval.actorType,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["subjectBoundary", "subjectExactVersionApproval", "actorType"],
        message:
          "Subject approval must come from the subject or an authorized representative",
      });
    }
  });

export const communityPrivacyReviewSchema = z
  .object({
    reviewId: z.string().regex(/^ARPRIV-[A-Z0-9_-]{8,64}$/u),
    outcome: z.enum(["PASS", "FAIL", "HUMAN_REVIEW_REQUIRED", "PENDING"]),
    riskFlags: z
      .array(
        z.enum([
          "DIRECT_IDENTIFIER",
          "EXACT_DATE_OR_AGE",
          "RARE_COMBINATION",
          "PRECISE_LOCATION",
          "CLINICIAN_OR_CLINIC",
          "UNIQUE_SEARCHABLE_QUOTE",
          "IMAGE_OR_EXIF",
          "DOCUMENT_IDENTIFIER",
          "MINOR",
          "PUBLIC_BACKLINK_REIDENTIFICATION",
          "RELATIONAL_REIDENTIFICATION",
          "OTHER",
        ]),
      )
      .max(30),
    reviewedAt: timestampSchema,
  })
  .strict();

export const communityPublicVersionSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    labOnly: z.literal(true),
    publicVersionId: z.string().regex(/^ARPUB-[A-Z0-9_-]{8,64}$/u),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    leadVersion: z.number().int().positive(),
    publicationObjectType: z.enum(["PUBLIC_RESEARCH_LEAD", "PUBLIC_NARRATIVE"]),
    publicTitle: shortTextSchema,
    publicParaphrase: z.string().trim().min(1).max(20_000),
    sourceDistanceLabel: shortTextSchema,
    limitations: z.array(mediumTextSchema).min(1).max(50),
    reporterPublicationConsent: communityConsentDecisionSchema,
    subjectExactVersionApproval: communityConsentDecisionSchema.nullable(),
    privacyReview: communityPrivacyReviewSchema,
    abuseReviewState: z.enum(["PASS", "FAIL", "PENDING"]),
    jurisdictionPolicyState: z.enum([
      "ALLOWED_SYNTHETIC_LAB",
      "REVIEW_REQUIRED",
      "PROHIBITED",
    ]),
    subjectIdentifiableInPublicVersion: z.boolean(),
    directSubjectQuotePresent: z.boolean(),
    documentsOrMediaPresent: z.boolean(),
    verificationState: communityVerificationStateSchema,
    evidenceCapability: communityEvidenceCapabilitySchema,
    formalEvidenceRelationship: communityFormalEvidenceRelationshipSchema,
    status: z.enum([
      "DRAFT",
      "PRIVACY_REVIEW",
      "APPROVED",
      "SYNTHETIC_LAB_PROJECTION",
      "CHALLENGED",
      "WITHDRAWN",
      "SUPERSEDED",
    ]),
    publicPayloadSha256: sha256Schema,
  })
  .strict()
  .superRefine((value, context) => {
    const isReleaseCandidate =
      value.status === "APPROVED" ||
      value.status === "SYNTHETIC_LAB_PROJECTION";
    if (!isReleaseCandidate) return;

    if (value.privacyReview.outcome !== "PASS") {
      context.addIssue({
        code: "custom",
        path: ["privacyReview"],
        message: "Release candidates require a passing privacy review",
      });
    }
    if (value.abuseReviewState !== "PASS") {
      context.addIssue({
        code: "custom",
        path: ["abuseReviewState"],
        message: "Release candidates require a passing abuse review",
      });
    }
    if (value.jurisdictionPolicyState !== "ALLOWED_SYNTHETIC_LAB") {
      context.addIssue({
        code: "custom",
        path: ["jurisdictionPolicyState"],
        message:
          "Release candidates require an allowed jurisdiction-policy state",
      });
    }

    if (value.publicationObjectType === "PUBLIC_NARRATIVE") {
      if (
        value.subjectExactVersionApproval?.decision !== "YES" ||
        !["SUBJECT", "GUARDIAN", "AUTHORIZED_REPRESENTATIVE"].includes(
          value.subjectExactVersionApproval.actorType,
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["subjectExactVersionApproval"],
          message: "Public narratives require subject exact-version approval",
        });
      }
      return;
    }

    if (
      value.reporterPublicationConsent.decision !== "YES" ||
      value.reporterPublicationConsent.actorType !== "REPORTER"
    ) {
      context.addIssue({
        code: "custom",
        path: ["reporterPublicationConsent"],
        message: "Public research leads require reporter publication consent",
      });
    }
    if (
      value.subjectIdentifiableInPublicVersion ||
      value.directSubjectQuotePresent ||
      value.documentsOrMediaPresent
    ) {
      context.addIssue({
        code: "custom",
        path: [],
        message:
          "Deidentified public research leads cannot identify the subject or contain private subject quotations or media",
      });
    }
  });

export const discourseSyntheticLabManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    labId: z.literal("ASKRIGOR-SYNTHETIC-DISCOURSE-LAB"),
    syntheticOnly: z.literal(true),
    realHealthDataAllowed: z.literal(false),
    publicDnsAllowed: z.literal(false),
    publicIndexingAllowed: z.literal(false),
    outboundEmailMode: z.literal("DISABLED"),
    researchRecruitmentAllowed: z.literal(false),
    regulatoryAutomationAllowed: z.literal(false),
    hostBind: z.literal("127.0.0.1"),
    disposableData: z.literal(true),
    discourse: z
      .object({
        repository: z.literal("https://github.com/discourse/discourse.git"),
        commit: z.string().regex(/^[a-f0-9]{40}$/u),
        image: z.literal("docker.io/discourse/discourse_dev"),
        imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        platform: z.literal("linux/amd64"),
      })
      .strict(),
  })
  .strict();

export const communityVerificationEventSchema = z
  .object({
    synthetic: z.literal(true),
    verificationEventId: z.string().regex(/^ARVER-[A-Z0-9_-]{8,64}$/u),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    leadVersion: z.number().int().positive(),
    priorVerificationState: communityVerificationStateSchema,
    nextVerificationState: communityVerificationStateSchema,
    evidenceCapabilityBefore: communityEvidenceCapabilitySchema,
    evidenceCapabilityAfter: communityEvidenceCapabilitySchema,
    occurredAt: timestampSchema,
    actorRole: z.enum([
      "PRIVACY_REVIEWER",
      "SCIENTIFIC_ANNOTATOR",
      "SYSTEM_SERVICE",
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.evidenceCapabilityBefore !== value.evidenceCapabilityAfter) {
      context.addIssue({
        code: "custom",
        path: ["evidenceCapabilityAfter"],
        message: "Verification cannot upgrade evidence capability",
      });
    }
  });

export const communityLeadChallengeSchema = z
  .object({
    synthetic: z.literal(true),
    challengeId: z.string().regex(/^ARCHAL-[A-Z0-9_-]{8,64}$/u),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    leadVersion: z.number().int().positive(),
    challengeType: z.enum([
      "SUBJECT_DISPUTE",
      "REPORTER_CORRECTION",
      "PRIVACY",
      "PROVENANCE",
      "SCIENTIFIC_SCOPE",
      "OTHER",
    ]),
    summary: mediumTextSchema,
    status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "SUPERSEDED"]),
    createdAt: timestampSchema,
  })
  .strict();

export const communityLeadCorrectionSchema = z
  .object({
    synthetic: z.literal(true),
    correctionId: z.string().regex(/^ARCORR-[A-Z0-9_-]{8,64}$/u),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    fromLeadVersion: z.number().int().positive(),
    toLeadVersion: z.number().int().positive(),
    correctionSummary: mediumTextSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.toLeadVersion !== value.fromLeadVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["toLeadVersion"],
        message: "Corrections must create the next contiguous lead version",
      });
    }
  });

const directionCountsSchema = z
  .object({
    improved: z.number().int().nonnegative(),
    worsened: z.number().int().nonnegative(),
    noClearChange: z.number().int().nonnegative(),
    mixed: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  })
  .strict();

export const communitySignalClusterSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    clusterId: z.string().regex(/^ARCL-[A-Z0-9_-]{8,64}$/u),
    clusterVersion: z.number().int().positive(),
    scope: z
      .object({
        condition: shortTextSchema,
        population: z.string().max(2_000).nullable(),
        interventionOrExposure: shortTextSchema,
        comparator: z.string().max(2_000).nullable(),
        outcome: shortTextSchema,
        horizon: z.string().max(1_000).nullable(),
      })
      .strict(),
    programFingerprint: mediumTextSchema,
    memberLeadIds: z
      .array(z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u))
      .min(1)
      .max(10_000),
    independentSourceCount: z.number().int().positive(),
    directionCounts: directionCountsSchema,
    duplicateHandling: mediumTextSchema,
    formalEvidenceRelationship: communityFormalEvidenceRelationshipSchema,
    denominatorAvailable: z.boolean(),
    effectivenessPercentageDisplayPermitted: z.literal(false),
    limitations: z.array(mediumTextSchema).min(1).max(100),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.memberLeadIds).size !== value.memberLeadIds.length) {
      context.addIssue({
        code: "custom",
        path: ["memberLeadIds"],
        message: "Cluster member lead IDs must be unique",
      });
    }
    if (value.independentSourceCount > value.memberLeadIds.length) {
      context.addIssue({
        code: "custom",
        path: ["independentSourceCount"],
        message: "Independent sources cannot exceed member leads",
      });
    }
    const reportCount = Object.values(value.directionCounts).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (reportCount !== value.memberLeadIds.length) {
      context.addIssue({
        code: "custom",
        path: ["directionCounts"],
        message:
          "Direction counts must account for every member lead exactly once",
      });
    }
  });

export const communityResearchQuestionSchema = z
  .object({
    synthetic: z.literal(true),
    questionId: z.string().regex(/^ARQ-[A-Z0-9_-]{8,64}$/u),
    questionVersion: z.number().int().positive(),
    derivedFromClusterIds: z
      .array(z.string().regex(/^ARCL-[A-Z0-9_-]{8,64}$/u))
      .min(1)
      .max(1_000),
    questionText: mediumTextSchema,
    evidenceCheckStatus: z.enum([
      "NOT_CHECKED",
      "ANSWERED_FOR_SCOPE",
      "PARTIALLY_ANSWERED",
      "FORMAL_EVIDENCE_CONFLICTED",
      "NOT_ANSWERED",
      "QUESTION_NOT_YET_WELL_FORMED",
      "INACCESSIBLE_OR_UNRESOLVED",
    ]),
    status: z.enum([
      "CANDIDATE",
      "EVIDENCE_CHECK",
      "OPEN_UNCERTAINTY",
      "ANSWERED",
      "PRIORITIZED",
      "PROPOSAL_LINKED",
      "CLOSED",
      "SUPERSEDED",
    ]),
    createdAt: timestampSchema,
  })
  .strict();

export const communityQuestionEvidenceCheckSchema = z
  .object({
    synthetic: z.literal(true),
    evidenceCheckId: z.string().regex(/^AREC-[A-Z0-9_-]{8,64}$/u),
    questionId: z.string().regex(/^ARQ-[A-Z0-9_-]{8,64}$/u),
    questionVersion: z.number().int().positive(),
    matchedEvidenceStatus: z.enum([
      "ANSWERED_FOR_SCOPE",
      "PARTIALLY_ANSWERED",
      "FORMAL_EVIDENCE_CONFLICTED",
      "NOT_ANSWERED",
      "QUESTION_NOT_YET_WELL_FORMED",
      "INACCESSIBLE_OR_UNRESOLVED",
    ]),
    summary: mediumTextSchema,
    evidenceIdentifiers: z.array(shortTextSchema).max(1_000),
    checkedAt: timestampSchema,
  })
  .strict();

export const communityResearchProposalSchema = z
  .object({
    synthetic: z.literal(true),
    proposalId: z.string().regex(/^ARPROP-[A-Z0-9_-]{8,64}$/u),
    proposalVersion: z.number().int().positive(),
    questionId: z.string().regex(/^ARQ-[A-Z0-9_-]{8,64}$/u),
    questionVersion: z.number().int().positive(),
    proposalType: z.enum([
      "TARGETED_REVIEW",
      "EVIDENCE_MAP_UPDATE",
      "RETROSPECTIVE_SURVEY",
      "PROSPECTIVE_COMMUNITY_FOLLOW_UP",
      "OBSERVATIONAL_COHORT",
      "N_OF_1",
      "CASE_SERIES",
      "PRAGMATIC_TRIAL",
      "RANDOMIZED_TRIAL",
      "DIAGNOSTIC_OR_BIOMARKER",
      "MECHANISTIC",
      "PHARMACOVIGILANCE",
      "QUALITATIVE_IMPLEMENTATION",
      "DATA_LINKAGE",
    ]),
    designSummary: mediumTextSchema,
    ethicsState: z.enum([
      "NOT_REVIEWED",
      "REVIEW_REQUIRED",
      "REVIEW_IN_PROGRESS",
      "APPROVED",
      "NOT_APPLICABLE",
      "REJECTED",
    ]),
    privacyState: z.enum([
      "NOT_REVIEWED",
      "REVIEW_REQUIRED",
      "REVIEW_IN_PROGRESS",
      "APPROVED",
      "NOT_APPLICABLE",
      "REJECTED",
    ]),
    safetyState: z.enum([
      "NOT_REVIEWED",
      "REVIEW_REQUIRED",
      "REVIEW_IN_PROGRESS",
      "APPROVED",
      "NOT_APPLICABLE",
      "REJECTED",
    ]),
    methodsReviewState: z.enum([
      "NOT_REVIEWED",
      "REVIEW_IN_PROGRESS",
      "APPROVED",
      "REVISE",
      "REJECTED",
    ]),
    recruitmentActive: z.literal(false),
    status: z.enum([
      "DRAFT",
      "PUBLIC_COMMENT",
      "METHODS_REVIEW",
      "ETHICS_REVIEW",
      "BLOCKED",
      "SUPERSEDED",
    ]),
    createdAt: timestampSchema,
  })
  .strict();

export const communityModerationEventSchema = z
  .object({
    synthetic: z.literal(true),
    eventId: z.string().regex(/^ARMOD-[A-Z0-9_-]{8,64}$/u),
    targetType: z.enum([
      "TOPIC",
      "POST",
      "LEAD",
      "CLUSTER",
      "QUESTION",
      "PROPOSAL",
      "USER",
    ]),
    targetId: shortTextSchema,
    actorRole: z.enum([
      "CATEGORY_MODERATOR",
      "GLOBAL_MODERATOR",
      "ADMINISTRATOR",
      "SYSTEM_PRECHECK",
    ]),
    action: z.enum([
      "LABEL",
      "MOVE",
      "HIDE",
      "REMOVE",
      "RESTORE",
      "LOCK",
      "UNLOCK",
      "SUSPEND",
      "UNSUSPEND",
      "ESCALATE",
      "NO_ACTION",
    ]),
    reason: mediumTextSchema,
    appealable: z.boolean(),
    occurredAt: timestampSchema,
  })
  .strict();

export const communityScientificAnnotationSchema = z
  .object({
    synthetic: z.literal(true),
    annotationId: z.string().regex(/^ARANN-[A-Z0-9_-]{8,64}$/u),
    targetType: z.enum([
      "TOPIC",
      "POST",
      "LEAD",
      "CLUSTER",
      "QUESTION",
      "PROPOSAL",
    ]),
    targetId: shortTextSchema,
    annotationType: z.enum([
      "EXPERIENCE_REPORT",
      "SECONDHAND_REPORT",
      "DIRECT_OBSERVATION",
      "MECHANISM_HYPOTHESIS",
      "CAUSAL_CLAIM",
      "FORMAL_EVIDENCE_CLAIM",
      "SAFETY_CLAIM",
      "CONFLICT_DISCLOSURE",
      "ASKRIGOR_CONTEXT_NOTE",
      "CORRECTION",
      "UNRESOLVED_DISPUTE",
    ]),
    annotationText: mediumTextSchema,
    actorRole: z.enum([
      "SCIENTIFIC_ANNOTATOR",
      "METHODS_REVIEWER",
      "ASKRIGOR_SYSTEM",
    ]),
    occurredAt: timestampSchema,
    appealable: z.literal(true),
  })
  .strict();

export const communitySafetyCandidateSchema = z
  .object({
    synthetic: z.literal(true),
    safetyCandidateId: z.string().regex(/^ARSAFE-[A-Z0-9_-]{8,64}$/u),
    sourceTargetType: z.enum(["POST", "LEAD", "CLUSTER"]),
    sourceTargetId: shortTextSchema,
    eventSummary: mediumTextSchema,
    seriousness: z.enum([
      "NON_SERIOUS",
      "SERIOUS",
      "POTENTIALLY_SERIOUS",
      "IMMEDIATE_CRISIS",
      "UNKNOWN",
    ]),
    regulatoryResponsibilityState: z.enum([
      "NOT_ASSESSED",
      "ASSESSMENT_REQUIRED",
      "LEGAL_REVIEW_REQUIRED",
    ]),
    automatedRegulatoryReporting: z.literal(false),
    triageState: z.enum([
      "NEW",
      "URGENT",
      "IN_REVIEW",
      "FOLLOW_UP_REQUESTED",
      "CLOSED_NO_ACTION",
      "SUPERSEDED",
    ]),
    createdAt: timestampSchema,
  })
  .strict();

export const communityConsentEventSchema = z
  .object({
    synthetic: z.literal(true),
    consentEventId: z.string().regex(/^ARCONS-[A-Z0-9_-]{8,64}$/u),
    subjectType: z.enum([
      "REPORTER",
      "AFFECTED_PERSON",
      "GUARDIAN",
      "AUTHORIZED_REPRESENTATIVE",
    ]),
    subjectId: syntheticIdSchema,
    permission: z.enum([
      "FORUM_PUBLICATION",
      "SEARCH_INDEXING",
      "PUBLIC_LEAD",
      "AGGREGATE_RESEARCH",
      "DIRECT_QUOTATION",
      "EXACT_REGIMEN_PUBLICATION",
      "DOCUMENTS_OR_MEDIA",
      "RECONTACT",
      "SUBJECT_CONTACT_INVITATION",
      "PROSPECTIVE_FOLLOW_UP",
      "EXTERNAL_LINKAGE",
      "PRODUCT_IMPROVEMENT",
      "MODEL_TRAINING",
    ]),
    decision: communityConsentDecisionSchema,
    targetRecordIds: z.array(shortTextSchema).min(1).max(1_000),
  })
  .strict();

export const communityWithdrawalEventSchema = z
  .object({
    synthetic: z.literal(true),
    withdrawalEventId: z.string().regex(/^ARWITH-[A-Z0-9_-]{8,64}$/u),
    requesterType: z.enum([
      "REPORTER",
      "AFFECTED_PERSON",
      "GUARDIAN",
      "AUTHORIZED_REPRESENTATIVE",
      "PLATFORM_PRIVACY_ACTION",
    ]),
    targetRecordIds: z.array(shortTextSchema).min(1).max(10_000),
    requestedAt: timestampSchema,
    propagationState: z.enum([
      "REQUESTED",
      "LAB_PROJECTION_REMOVED",
      "CLUSTERS_RECOMPUTED",
      "COMPLETE",
    ]),
    publicContentRetained: z.literal(false),
  })
  .strict();

const communityComposerStepSchema = z.enum([
  "REPORTER_RELATIONSHIP",
  "INFORMATION_ORIGIN",
  "CONDITION",
  "INTERVENTION_COMBINATION",
  "OUTCOME",
  "TIMING_AND_PERSISTENCE",
  "COINTERVENTIONS",
  "HARMS",
  "UNKNOWNS",
  "PERMISSIONS",
  "PUBLIC_PREVIEW",
]);

const communityPermissionStateSchema = z.enum([
  "NOT_ASKED",
  "YES",
  "NO",
  "WITHDRAWN",
]);

export const communityComposerDetailsSchema = z
  .object({
    reporter: z
      .object({
        role: communityReporterRoleSchema,
        informationOrigin: communityInformationOriginSchema,
        sourceDistance: communitySourceDistanceSchema,
      })
      .strict(),
    condition: z
      .object({
        name: shortTextSchema,
        diagnosticCertainty: z.enum([
          "CLINICIAN_CONFIRMED",
          "LAB_OR_CRITERIA_SUPPORTED",
          "SELF_IDENTIFIED",
          "REPORTED_BY_PROXY",
          "SUSPECTED",
          "UNKNOWN",
        ]),
      })
      .strict(),
    interventionEpisode: z
      .object({
        components: z.array(shortTextSchema).min(1).max(50),
        exactCombinationKnown: z.boolean(),
      })
      .strict(),
    outcome: z
      .object({
        name: shortTextSchema,
        reportedDirection: z.enum([
          "IMPROVED",
          "WORSENED",
          "NO_CLEAR_CHANGE",
          "MIXED",
          "UNKNOWN",
        ]),
        timing: z.string().trim().min(1).max(1_000).nullable(),
        persistence: z.string().trim().min(1).max(1_000).nullable(),
      })
      .strict(),
    cointerventions: z.array(shortTextSchema).max(100),
    harms: z.array(shortTextSchema).max(100),
    unknowns: z.array(shortTextSchema).max(100),
  })
  .strict();

const communityComposerPreviewSchema = z
  .object({
    publicTitle: shortTextSchema,
    publicParaphrase: z.string().trim().min(1).max(20_000),
    sourceDistanceLabel: shortTextSchema,
    limitations: z.array(mediumTextSchema).min(1).max(50),
    previewPayloadSha256: sha256Schema,
    preparedAt: timestampSchema,
    acknowledgedAt: timestampSchema.nullable(),
  })
  .strict();

export const communityComposerDraftSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    labOnly: z.literal(true),
    draftId: z.string().regex(/^ARDRAFT-[A-Z0-9_-]{8,64}$/u),
    draftVersion: z.number().int().positive(),
    reporterAccountId: syntheticIdSchema,
    entryPoint: z.enum(["FORUM_POST", "DIRECT_STRUCTURED_INTAKE"]),
    sourcePostId: z
      .string()
      .regex(/^SYNTHETIC-POST-[0-9]{1,12}$/u)
      .nullable(),
    sourcePostDisposition: z.enum([
      "ORDINARY_CONVERSATION",
      "CONVERSION_OFFERED",
      "CONVERSION_ACCEPTED",
      "CONVERSION_DECLINED",
      "NOT_APPLICABLE_DIRECT_INTAKE",
    ]),
    status: z.enum([
      "DRAFT",
      "STOPPED",
      "PREVIEW_READY",
      "SYNTHETIC_PUBLICATION_REQUESTED",
      "WITHDRAWN",
    ]),
    completedSteps: z.array(communityComposerStepSchema).max(20),
    reporter: communityComposerDetailsSchema.shape.reporter.nullable(),
    condition: communityComposerDetailsSchema.shape.condition.nullable(),
    interventionEpisode:
      communityComposerDetailsSchema.shape.interventionEpisode.nullable(),
    outcome: communityComposerDetailsSchema.shape.outcome.nullable(),
    cointerventions: z.array(shortTextSchema).max(100),
    harms: z.array(shortTextSchema).max(100),
    unknowns: z.array(shortTextSchema).max(100),
    permissions: z
      .object({
        publicLead: communityPermissionStateSchema,
        directQuotation: communityPermissionStateSchema,
        exactRegimenPublication: communityPermissionStateSchema,
        recontact: communityPermissionStateSchema,
      })
      .strict(),
    preview: communityComposerPreviewSchema.nullable(),
    missingMaterialFields: z.array(shortTextSchema).max(100),
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.entryPoint === "FORUM_POST" && value.sourcePostId === null) {
      context.addIssue({
        code: "custom",
        path: ["sourcePostId"],
        message: "Forum-post composer entry requires a synthetic source post",
      });
    }
    if (
      value.entryPoint === "FORUM_POST" &&
      value.sourcePostDisposition === "NOT_APPLICABLE_DIRECT_INTAKE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourcePostDisposition"],
        message: "Forum-post intake must preserve an explicit conversion state",
      });
    }
    if (
      value.entryPoint === "DIRECT_STRUCTURED_INTAKE" &&
      (value.sourcePostId !== null ||
        value.sourcePostDisposition !== "NOT_APPLICABLE_DIRECT_INTAKE")
    ) {
      context.addIssue({
        code: "custom",
        path: ["entryPoint"],
        message: "Direct structured intake cannot masquerade as post conversion",
      });
    }
    if (
      value.preview !== null &&
      !["CONVERSION_ACCEPTED", "NOT_APPLICABLE_DIRECT_INTAKE"].includes(
        value.sourcePostDisposition,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["preview"],
        message: "A public preview requires accepted lead conversion",
      });
    }
    if (value.status === "SYNTHETIC_PUBLICATION_REQUESTED") {
      if (
        !["CONVERSION_ACCEPTED", "NOT_APPLICABLE_DIRECT_INTAKE"].includes(
          value.sourcePostDisposition,
        ) ||
        value.permissions.publicLead !== "YES"
      ) {
        context.addIssue({
          code: "custom",
          path: ["permissions", "publicLead"],
          message: "Publication requests require affirmative public-lead opt-in",
        });
      }
      if (value.preview?.acknowledgedAt == null) {
        context.addIssue({
          code: "custom",
          path: ["preview", "acknowledgedAt"],
          message: "Publication requests require preview acknowledgement",
        });
      }
    }
  });

const communityReportedDirectionSchema = z.enum([
  "IMPROVED",
  "WORSENED",
  "NO_CLEAR_CHANGE",
  "MIXED",
  "UNKNOWN",
]);

export const communityFrontierCardSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    labOnly: z.literal(true),
    cardId: z.string().regex(/^ARCARD-[A-Z0-9_-]{8,64}$/u),
    publicVersionId: z.string().regex(/^ARPUB-[A-Z0-9_-]{8,64}$/u),
    leadId: z.string().regex(/^ARLEAD-[A-Z0-9_-]{8,64}$/u),
    leadVersion: z.number().int().positive(),
    sourceIndependenceKey: sha256Schema,
    publicTitle: shortTextSchema,
    condition: shortTextSchema,
    diagnosticCertainty: z.enum([
      "CLINICIAN_CONFIRMED",
      "LAB_OR_CRITERIA_SUPPORTED",
      "SELF_IDENTIFIED",
      "REPORTED_BY_PROXY",
      "SUSPECTED",
      "UNKNOWN",
    ]),
    exactInterventionCombination: z.array(shortTextSchema).min(1).max(50),
    reportedDirection: communityReportedDirectionSchema,
    timingAndPersistence: mediumTextSchema,
    reporterRole: communityReporterRoleSchema,
    sourceDistance: communitySourceDistanceSchema,
    sourceDistanceLabel: shortTextSchema,
    verificationState: communityVerificationStateSchema,
    completenessBand: z.enum(["MINIMAL", "PARTIAL", "MODERATE", "HIGH_DETAIL"]),
    evidenceCapability: communityEvidenceCapabilitySchema,
    formalEvidenceRelationship: communityFormalEvidenceRelationshipSchema,
    harmsReported: z.boolean(),
    noEffectReported: z.boolean(),
    cointerventionsAndConfounders: z.array(shortTextSchema).max(100),
    clusterIds: z
      .array(z.string().regex(/^ARCL-[A-Z0-9_-]{8,64}$/u))
      .max(1_000),
    challengeCount: z.number().int().nonnegative(),
    latestCorrectionLeadVersion: z.number().int().positive().nullable(),
    withdrawn: z.boolean(),
    researchStatus: z.enum([
      "LEAD_ONLY",
      "QUESTION_CANDIDATE",
      "EVIDENCE_CHECK_PENDING",
      "FORMAL_EVIDENCE_ADJACENT",
      "FORMAL_EVIDENCE_CORROBORATED",
      "FORMAL_EVIDENCE_CONFLICTED",
      "CLOSED",
    ]),
    discussionActivity: z
      .object({
        views: z.number().int().nonnegative(),
        replies: z.number().int().nonnegative(),
      })
      .strict(),
    discussionActivityAffectsEvidenceState: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.noEffectReported !== (value.reportedDirection === "NO_CLEAR_CHANGE")) {
      context.addIssue({
        code: "custom",
        path: ["noEffectReported"],
        message: "No-effect flag must match the reported direction",
      });
    }
  });

export const communityFrontierFiltersSchema = z
  .object({
    directions: z.array(communityReportedDirectionSchema).min(1).max(5).optional(),
    condition: shortTextSchema.optional(),
    verificationStates: z
      .array(communityVerificationStateSchema)
      .min(1)
      .max(20)
      .optional(),
    evidenceCapabilities: z
      .array(communityEvidenceCapabilitySchema)
      .min(1)
      .max(20)
      .optional(),
    includeWithdrawn: z.boolean().default(false),
  })
  .strict();

export const communityFrontierViewSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    synthetic: z.literal(true),
    labOnly: z.literal(true),
    defaultOrder: z.literal("DIRECTION_BALANCED_STABLE"),
    cards: z.array(communityFrontierCardSchema).max(10_000),
    directionCounts: directionCountsSchema,
    reportedLeadCount: z.number().int().nonnegative(),
    independentSourceCount: z.number().int().nonnegative(),
    denominatorAvailable: z.literal(false),
    effectivenessPercentageDisplayPermitted: z.literal(false),
    denominatorBoundary: mediumTextSchema,
    discussionActivityAffectsEvidenceState: z.literal(false),
    appliedFilters: communityFrontierFiltersSchema,
    generatedAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.reportedLeadCount !== value.cards.length) {
      context.addIssue({
        code: "custom",
        path: ["reportedLeadCount"],
        message: "Reported lead count must match visible cards",
      });
    }
    const independentSourceCount = new Set(
      value.cards.map((card) => card.sourceIndependenceKey),
    ).size;
    if (value.independentSourceCount !== independentSourceCount) {
      context.addIssue({
        code: "custom",
        path: ["independentSourceCount"],
        message: "Independent-source count must be duplicate aware",
      });
    }
    const expectedCounts = {
      improved: value.cards.filter(
        (card) => card.reportedDirection === "IMPROVED",
      ).length,
      worsened: value.cards.filter(
        (card) => card.reportedDirection === "WORSENED",
      ).length,
      noClearChange: value.cards.filter(
        (card) => card.reportedDirection === "NO_CLEAR_CHANGE",
      ).length,
      mixed: value.cards.filter((card) => card.reportedDirection === "MIXED")
        .length,
      unknown: value.cards.filter(
        (card) => card.reportedDirection === "UNKNOWN",
      ).length,
    };
    if (JSON.stringify(value.directionCounts) !== JSON.stringify(expectedCounts)) {
      context.addIssue({
        code: "custom",
        path: ["directionCounts"],
        message: "Direction counts must match visible cards",
      });
    }
  });

export const communityOperationalCapabilitySchema = z.enum([
  "MODERATE_CONDUCT",
  "REVIEW_PRIVACY",
  "ANNOTATE_SCIENCE",
  "TRIAGE_SAFETY",
  "STEWARD_RESEARCH",
  "REVIEW_METHODS_ETHICS",
  "ADMINISTER_SYSTEM",
]);

export const communityOperationalRoleSchema = z.enum([
  "CATEGORY_MODERATOR",
  "GLOBAL_MODERATOR",
  "PRIVACY_REVIEWER",
  "SCIENTIFIC_ANNOTATOR",
  "SAFETY_REVIEWER",
  "RESEARCH_STEWARD",
  "METHODS_REVIEWER",
  "ETHICS_REVIEWER",
  "ADMINISTRATOR",
]);

export const communityOperationalRoleCapabilities = {
  CATEGORY_MODERATOR: ["MODERATE_CONDUCT"],
  GLOBAL_MODERATOR: ["MODERATE_CONDUCT"],
  PRIVACY_REVIEWER: ["REVIEW_PRIVACY"],
  SCIENTIFIC_ANNOTATOR: ["ANNOTATE_SCIENCE"],
  SAFETY_REVIEWER: ["TRIAGE_SAFETY"],
  RESEARCH_STEWARD: ["STEWARD_RESEARCH"],
  METHODS_REVIEWER: ["REVIEW_METHODS_ETHICS"],
  ETHICS_REVIEWER: ["REVIEW_METHODS_ETHICS"],
  ADMINISTRATOR: ["ADMINISTER_SYSTEM"],
} as const;

export const communityOperationalRoleAssignmentSchema = z
  .object({
    synthetic: z.literal(true),
    assignmentId: z.string().regex(/^ARROLE-[A-Z0-9_-]{8,64}$/u),
    actorId: syntheticIdSchema,
    role: communityOperationalRoleSchema,
    assignedByActorId: syntheticIdSchema,
    active: z.literal(true),
    assignedAt: timestampSchema,
  })
  .strict();

const communityQueueTypeSchema = z.enum([
  "MODERATION",
  "PRIVACY",
  "SCIENTIFIC",
  "SAFETY",
  "RESEARCH_STEWARDSHIP",
  "METHODS_ETHICS",
  "SYSTEM_ADMINISTRATION",
]);

const queueCapabilityByType = {
  MODERATION: "MODERATE_CONDUCT",
  PRIVACY: "REVIEW_PRIVACY",
  SCIENTIFIC: "ANNOTATE_SCIENCE",
  SAFETY: "TRIAGE_SAFETY",
  RESEARCH_STEWARDSHIP: "STEWARD_RESEARCH",
  METHODS_ETHICS: "REVIEW_METHODS_ETHICS",
  SYSTEM_ADMINISTRATION: "ADMINISTER_SYSTEM",
} as const;

export const communityOperationalQueueItemSchema = z
  .object({
    synthetic: z.literal(true),
    queueItemId: z.string().regex(/^ARQUEUE-[A-Z0-9_-]{8,64}$/u),
    queueType: communityQueueTypeSchema,
    requiredCapability: communityOperationalCapabilitySchema,
    targetType: z.enum([
      "TOPIC",
      "POST",
      "LEAD",
      "PUBLIC_VERSION",
      "CLUSTER",
      "QUESTION",
      "PROPOSAL",
      "USER",
    ]),
    targetId: shortTextSchema,
    originatorActorId: syntheticIdSchema,
    independentReviewRequired: z.boolean(),
    sourceMeaningSha256: sha256Schema,
    seriousness: z.enum([
      "NOT_APPLICABLE",
      "NON_SERIOUS",
      "SERIOUS",
      "POTENTIALLY_SERIOUS",
      "IMMEDIATE_CRISIS",
      "UNKNOWN",
    ]),
    automatedRegulatoryReporting: z.literal(false),
    status: z.enum(["QUEUED", "IN_REVIEW", "RESOLVED", "SUPERSEDED"]),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (queueCapabilityByType[value.queueType] !== value.requiredCapability) {
      context.addIssue({
        code: "custom",
        path: ["requiredCapability"],
        message: "Queue type and required capability must match",
      });
    }
    if (
      value.queueType !== "SAFETY" &&
      value.seriousness !== "NOT_APPLICABLE"
    ) {
      context.addIssue({
        code: "custom",
        path: ["seriousness"],
        message: "Seriousness is only classified in the safety queue",
      });
    }
  });

const communityOperationalActionTypeSchema = z.enum([
  "LABEL_CONDUCT",
  "HIDE_CONDUCT_VIOLATION",
  "REMOVE_CONDUCT_VIOLATION",
  "ESCALATE",
  "PRIVACY_PASS",
  "PRIVACY_FAIL",
  "ANNOTATE_SEPARATELY",
  "TRIAGE_FOR_HUMAN_REVIEW",
  "REQUEST_FOLLOW_UP",
  "CLOSE_NO_ACTION",
  "STEWARDSHIP_REVIEW",
  "METHODS_ETHICS_REVIEW",
  "ADMINISTRATIVE_ACTION",
]);

const actionCapabilityByType = {
  LABEL_CONDUCT: "MODERATE_CONDUCT",
  HIDE_CONDUCT_VIOLATION: "MODERATE_CONDUCT",
  REMOVE_CONDUCT_VIOLATION: "MODERATE_CONDUCT",
  ESCALATE: "MODERATE_CONDUCT",
  PRIVACY_PASS: "REVIEW_PRIVACY",
  PRIVACY_FAIL: "REVIEW_PRIVACY",
  ANNOTATE_SEPARATELY: "ANNOTATE_SCIENCE",
  TRIAGE_FOR_HUMAN_REVIEW: "TRIAGE_SAFETY",
  REQUEST_FOLLOW_UP: "TRIAGE_SAFETY",
  CLOSE_NO_ACTION: "TRIAGE_SAFETY",
  STEWARDSHIP_REVIEW: "STEWARD_RESEARCH",
  METHODS_ETHICS_REVIEW: "REVIEW_METHODS_ETHICS",
  ADMINISTRATIVE_ACTION: "ADMINISTER_SYSTEM",
} as const;

const actionResultingStatusByType = {
  LABEL_CONDUCT: "RESOLVED",
  HIDE_CONDUCT_VIOLATION: "RESOLVED",
  REMOVE_CONDUCT_VIOLATION: "RESOLVED",
  ESCALATE: "IN_REVIEW",
  PRIVACY_PASS: "RESOLVED",
  PRIVACY_FAIL: "RESOLVED",
  ANNOTATE_SEPARATELY: "RESOLVED",
  TRIAGE_FOR_HUMAN_REVIEW: "IN_REVIEW",
  REQUEST_FOLLOW_UP: "IN_REVIEW",
  CLOSE_NO_ACTION: "RESOLVED",
  STEWARDSHIP_REVIEW: "RESOLVED",
  METHODS_ETHICS_REVIEW: "RESOLVED",
  ADMINISTRATIVE_ACTION: "RESOLVED",
} as const;

export const communityOperationalActionSchema = z
  .object({
    synthetic: z.literal(true),
    actionId: z.string().regex(/^ARACTION-[A-Z0-9_-]{8,64}$/u),
    queueItemId: z.string().regex(/^ARQUEUE-[A-Z0-9_-]{8,64}$/u),
    actorId: syntheticIdSchema,
    activeRole: communityOperationalRoleSchema,
    capability: communityOperationalCapabilitySchema,
    action: communityOperationalActionTypeSchema,
    sourceMeaningSha256Before: sha256Schema,
    sourceMeaningSha256After: sha256Schema,
    annotationText: z.string().trim().min(1).max(4_000).nullable(),
    automatedRegulatoryReporting: z.literal(false),
    resultingStatus: z.enum(["QUEUED", "IN_REVIEW", "RESOLVED", "SUPERSEDED"]),
    occurredAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (actionCapabilityByType[value.action] !== value.capability) {
      context.addIssue({
        code: "custom",
        path: ["capability"],
        message: "Operational action and capability must match",
      });
    }
    if (value.sourceMeaningSha256Before !== value.sourceMeaningSha256After) {
      context.addIssue({
        code: "custom",
        path: ["sourceMeaningSha256After"],
        message: "Operational actions cannot silently rewrite source meaning",
      });
    }
    if (actionResultingStatusByType[value.action] !== value.resultingStatus) {
      context.addIssue({
        code: "custom",
        path: ["resultingStatus"],
        message: "Operational action and resulting queue status must match",
      });
    }
  });

export type SyntheticForumAccount = z.infer<typeof syntheticForumAccountSchema>;
export type CommunityForumEvent = z.infer<typeof communityForumEventSchema>;
export type CommunityForumSourceReference = z.infer<
  typeof communityForumSourceReferenceSchema
>;
export type CommunityLead = z.infer<typeof communityLeadSchema>;
export type CommunityPublicVersion = z.infer<
  typeof communityPublicVersionSchema
>;
export type DiscourseSyntheticLabManifest = z.infer<
  typeof discourseSyntheticLabManifestSchema
>;
export type CommunityVerificationEvent = z.infer<
  typeof communityVerificationEventSchema
>;
export type CommunityLeadChallenge = z.infer<
  typeof communityLeadChallengeSchema
>;
export type CommunityLeadCorrection = z.infer<
  typeof communityLeadCorrectionSchema
>;
export type CommunitySignalCluster = z.infer<
  typeof communitySignalClusterSchema
>;
export type CommunityComposerDetails = z.infer<
  typeof communityComposerDetailsSchema
>;
export type CommunityComposerDraft = z.infer<
  typeof communityComposerDraftSchema
>;
export type CommunityFrontierCard = z.infer<
  typeof communityFrontierCardSchema
>;
export type CommunityFrontierFilters = z.infer<
  typeof communityFrontierFiltersSchema
>;
export type CommunityFrontierView = z.infer<
  typeof communityFrontierViewSchema
>;
export type CommunityOperationalQueueItem = z.infer<
  typeof communityOperationalQueueItemSchema
>;
export type CommunityOperationalRoleAssignment = z.infer<
  typeof communityOperationalRoleAssignmentSchema
>;
export type CommunityOperationalAction = z.infer<
  typeof communityOperationalActionSchema
>;

export function assertCommunityPublicationPreservesEvidence(
  leadInput: CommunityLead,
  publicVersionInput: CommunityPublicVersion,
): void {
  const lead = communityLeadSchema.parse(leadInput);
  const publicVersion = communityPublicVersionSchema.parse(publicVersionInput);
  if (
    lead.leadId !== publicVersion.leadId ||
    lead.leadVersion !== publicVersion.leadVersion
  ) {
    throw new Error("PUBLIC_VERSION_LEAD_IDENTITY_MISMATCH");
  }
  if (
    lead.verificationState !== publicVersion.verificationState ||
    lead.evidenceCapability !== publicVersion.evidenceCapability ||
    lead.formalEvidenceRelationship !== publicVersion.formalEvidenceRelationship
  ) {
    throw new Error("PUBLICATION_CANNOT_UPGRADE_EVIDENCE_STATE");
  }
  if (
    publicVersion.publicationObjectType === "PUBLIC_RESEARCH_LEAD" &&
    (lead.reporterPublicLeadConsent.decision !== "YES" ||
      lead.reporterPublicLeadConsent.actorType !== "REPORTER")
  ) {
    throw new Error("PUBLIC_RESEARCH_LEAD_SOURCE_CONSENT_MISSING");
  }
}
