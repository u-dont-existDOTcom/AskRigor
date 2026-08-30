import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertCommunityPublicationPreservesEvidence,
  communityConsentEventSchema,
  communityForumEventSchema,
  communityLeadSchema,
  communityModerationEventSchema,
  communityPublicVersionSchema,
  communityQuestionEvidenceCheckSchema,
  communityResearchProposalSchema,
  communityResearchQuestionSchema,
  communitySafetyCandidateSchema,
  communityScientificAnnotationSchema,
  communitySignalClusterSchema,
  discourseSyntheticLabManifestSchema,
  type CommunityForumEvent,
  type CommunityLead,
  type CommunityPublicVersion,
  type SyntheticForumAccount,
} from "../packages/contracts/src/index.js";
import {
  sha256,
  signDiscourseConnectPayload,
  signDiscourseWebhook,
  stableJson,
  syntheticPublicLeadProjectionSha256,
  SyntheticCommunityBridge,
  SyntheticCommunityLeadService,
  SyntheticDiscourseConnectService,
  verifyDiscourseConnectPayload,
} from "../packages/evidence-repository/src/index.js";

const SECRET = "synthetic-lab-secret-32-bytes-minimum";
const AT = "2026-08-30T18:00:00.000Z";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function account(
  overrides: Partial<SyntheticForumAccount> = {},
): SyntheticForumAccount {
  return {
    synthetic: true,
    accountId: "ARSYN-ACCOUNT0001",
    externalUserId: "ARSYN-EXTERNAL0001",
    email: "person-0001@synthetic.askrigor.invalid",
    emailVerified: true,
    pseudonymousDisplayName: "synthetic_member_0001",
    discourseUserId: "SYNTHETIC-DISCOURSE-1001",
    forumSuspended: false,
    nonForumProductAccess: true,
    ...overrides,
  };
}

function event(
  sourceVersion: number,
  eventType: CommunityForumEvent["eventType"],
  visibility: CommunityForumEvent["minimalPayload"]["visibility"],
): CommunityForumEvent {
  const minimalPayload: CommunityForumEvent["minimalPayload"] = {
    topicId: "SYNTHETIC-TOPIC-1001",
    postId: "SYNTHETIC-POST-1001",
    authorAccountId: "ARSYN-ACCOUNT0001",
    visibility,
    contentSha256:
      eventType === "forum.post.deleted.v1"
        ? null
        : sha256(`synthetic-content-v${sourceVersion}`),
  };
  return {
    synthetic: true,
    eventId: `AREVT-POST1001V${sourceVersion}`,
    eventType,
    schemaVersion: "1.0.0",
    producer: "DISCOURSE_SYNTHETIC_LAB",
    forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
    aggregateId: "ARSYN-POSTAGGREGATE1001",
    sourceVersion,
    occurredAt: AT,
    receivedAt: AT,
    idempotencyKey: `discourse-synthetic:post-1001:v${sourceVersion}`,
    payloadSha256: sha256(stableJson(minimalPayload)),
    traceId: `ARTRACE-POST1001V${sourceVersion}`,
    rawForumBodyPersisted: false,
    minimalPayload,
  };
}

function consent(actorType: "REPORTER" | "SUBJECT", suffix: string) {
  return {
    decision: "YES" as const,
    noticeVersion: `synthetic-notice-${suffix}`,
    noticeSha256: suffix.repeat(64).slice(0, 64),
    decidedAt: AT,
    actorType,
  };
}

function lead(overrides: Partial<CommunityLead> = {}): CommunityLead {
  return communityLeadSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    leadId: "ARLEAD-SYNTHANDY20260830",
    leadVersion: 1,
    sourceReferences: [
      {
        synthetic: true,
        sourceEventId: "AREVT-POST1001V1",
        forumInstanceId: "ASKRIGOR-SYNTHETIC-LAB",
        topicId: "SYNTHETIC-TOPIC-1001",
        postId: "SYNTHETIC-POST-1001",
        sourceVersion: 1,
        sourceVisibility: "PUBLIC",
        authorAccountId: "ARSYN-ACCOUNT0001",
        occurredAt: AT,
        contentSha256: sha256("synthetic health report body"),
        rawForumBodyPersisted: false,
      },
    ],
    reporter: {
      accountId: "ARSYN-ACCOUNT0001",
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
      name: "Mast cell activation syndrome (reported)",
      diagnosticCertainty: "REPORTED_BY_PROXY",
    },
    interventionEpisode: {
      episodeType: "COMBINATION",
      components: [
        { name: "Low-dose naltrexone", doseKnown: false, route: null },
        {
          name: "Low-dose NAD+ injections",
          doseKnown: false,
          route: "Injection",
        },
        { name: "Low-dose tirzepatide", doseKnown: false, route: null },
      ],
      sequenceKnown: false,
    },
    outcome: {
      name: "Overall symptoms and function",
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
      "doses",
      "sequence",
      "timing",
      "co-interventions",
      "follow-up",
    ],
    duplicateOrLinkedLeadIds: [],
    reporterPublicLeadConsent: consent("REPORTER", "a"),
    status: "STRUCTURED",
    createdAt: AT,
    ...overrides,
  });
}

function publicLead(
  overrides: Partial<CommunityPublicVersion> = {},
): CommunityPublicVersion {
  const source = lead();
  const candidate = communityPublicVersionSchema.parse({
    schemaVersion: "0.1.0",
    synthetic: true,
    labOnly: true,
    publicVersionId: "ARPUB-SYNTHANDY20260830V1",
    leadId: source.leadId,
    leadVersion: source.leadVersion,
    publicationObjectType: "PUBLIC_RESEARCH_LEAD",
    publicTitle:
      "Reported substantial MCAS improvement — secondhand synthetic lead",
    publicParaphrase:
      "A synthetic community member reports that a synthetic adult friend with reported MCAS experienced substantial improvement while using a three-component combination.",
    sourceDistanceLabel:
      "Reported by a friend who says the affected person told them; not a firsthand subject report",
    limitations: [
      "This synthetic report is secondhand and unverified.",
      "It cannot establish efficacy, causality, prevalence, or which component mattered.",
    ],
    reporterPublicationConsent: consent("REPORTER", "b"),
    subjectExactVersionApproval: null,
    privacyReview: {
      reviewId: "ARPRIV-SYNTHANDY20260830",
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
    ...overrides,
  });
  return communityPublicVersionSchema.parse({
    ...candidate,
    publicPayloadSha256: syntheticPublicLeadProjectionSha256(candidate),
  });
}

describe("isolated synthetic Discourse laboratory", () => {
  it("pins the official source/image and fails closed on every real/public boundary", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const manifest = discourseSyntheticLabManifestSchema.parse(
      JSON.parse(
        readFileSync(
          `${root}/labs/discourse-synthetic/lab-manifest.json`,
          "utf8",
        ),
      ) as unknown,
    );
    const compose = readFileSync(
      `${root}/labs/discourse-synthetic/compose.yaml`,
      "utf8",
    );

    expect(manifest.discourse.commit).toMatch(/^[a-f0-9]{40}$/u);
    expect(manifest.discourse.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(manifest).toMatchObject({
      syntheticOnly: true,
      realHealthDataAllowed: false,
      publicDnsAllowed: false,
      publicIndexingAllowed: false,
      researchRecruitmentAllowed: false,
      regulatoryAutomationAllowed: false,
      hostBind: "127.0.0.1",
      disposableData: true,
    });
    expect(compose).toContain(
      `127.0.0.1:\${ASKRIGOR_DISCOURSE_HTTP_PORT:-33000}:3000`,
    );
    expect(compose).toContain("read_only: true");
    expect(compose).not.toContain("0.0.0.0:");
    expect(compose).not.toContain(":8025");
    expect(compose).not.toContain("restart: always");
  });

  it("implements signed DiscourseConnect with verified synthetic accounts and one-use nonces", () => {
    const service = new SyntheticDiscourseConnectService();
    const raw = new URLSearchParams({
      nonce: "synthetic-nonce-0001",
      return_sso_url: "http://127.0.0.1:33000/session/sso_login",
    }).toString();
    const sso = Buffer.from(raw, "utf8").toString("base64");
    const sig = signDiscourseConnectPayload(sso, SECRET);
    const response = service.issueResponse({ sso, sig }, account(), SECRET);
    const decoded = verifyDiscourseConnectPayload(
      response.sso,
      response.sig,
      SECRET,
    );

    expect(decoded.get("external_id")).toBe("ARSYN-EXTERNAL0001");
    expect(decoded.get("email")).toBe("person-0001@synthetic.askrigor.invalid");
    expect(decoded.get("require_activation")).toBe("false");
    expect(() =>
      service.issueResponse({ sso, sig }, account(), SECRET),
    ).toThrow("DISCOURSE_CONNECT_NONCE_REPLAY");
  });

  it("blocks external-ID/email collisions, non-synthetic accounts, and nonlocal return URLs", () => {
    const service = new SyntheticDiscourseConnectService();
    service.registerAccount(account());
    expect(() =>
      service.registerAccount(
        account({ email: "changed@synthetic.askrigor.invalid" }),
      ),
    ).toThrow("DISCOURSE_CONNECT_EXTERNAL_ID_COLLISION");
    expect(() =>
      service.registerAccount(
        account({
          accountId: "ARSYN-ACCOUNT0002",
          externalUserId: "ARSYN-EXTERNAL0002",
        }),
      ),
    ).toThrow("DISCOURSE_CONNECT_EMAIL_ACCOUNT_TAKEOVER_BLOCKED");
    expect(() =>
      service.registerAccount(
        account({
          externalUserId: "ARSYN-EXTERNAL0002",
          email: "person-0002@synthetic.askrigor.invalid",
        }),
      ),
    ).toThrow("DISCOURSE_CONNECT_ACCOUNT_ID_COLLISION");
    expect(() =>
      service.registerAccount({ ...account(), synthetic: false }),
    ).toThrow();
    expect(() =>
      service.registerAccount({ ...account(), emailVerified: false }),
    ).toThrow();
    expect(() =>
      service.registerAccount({
        ...account(),
        email: "Person-0001@synthetic.askrigor.invalid",
      }),
    ).toThrow();

    const request = new URLSearchParams({
      nonce: "synthetic-nonce-evil",
      return_sso_url: "https://example.com/session/sso_login",
    }).toString();
    const sso = Buffer.from(request, "utf8").toString("base64");
    expect(() =>
      service.issueResponse(
        { sso, sig: signDiscourseConnectPayload(sso, SECRET) },
        account(),
        SECRET,
      ),
    ).toThrow("DISCOURSE_CONNECT_RETURN_URL_OUTSIDE_SYNTHETIC_LAB");

    const duplicateNonce = Buffer.from(
      "nonce=synthetic-one&nonce=synthetic-two&return_sso_url=http%3A%2F%2F127.0.0.1%3A33000%2Fsession%2Fsso_login",
      "utf8",
    ).toString("base64");
    expect(() =>
      verifyDiscourseConnectPayload(
        duplicateNonce,
        signDiscourseConnectPayload(duplicateNonce, SECRET),
        SECRET,
      ),
    ).toThrow("DISCOURSE_CONNECT_NONCE_MISSING");
    expect(() =>
      verifyDiscourseConnectPayload(
        "%%%",
        signDiscourseConnectPayload("%%%", SECRET),
        SECRET,
      ),
    ).toThrow("DISCOURSE_CONNECT_PAYLOAD_INVALID");

    for (const returnSsoUrl of [
      "http://127.0.0.1:33000/not-the-sso-endpoint",
      "http://127.0.0.1:33000/session/sso_login?redirect=unexpected",
    ]) {
      const wrongEndpoint = Buffer.from(
        new URLSearchParams({
          nonce: `synthetic-nonce-${returnSsoUrl.length}`,
          return_sso_url: returnSsoUrl,
        }).toString(),
        "utf8",
      ).toString("base64");
      expect(() =>
        service.issueResponse(
          {
            sso: wrongEndpoint,
            sig: signDiscourseConnectPayload(wrongEndpoint, SECRET),
          },
          account(),
          SECRET,
        ),
      ).toThrow("DISCOURSE_CONNECT_RETURN_URL_OUTSIDE_SYNTHETIC_LAB");
    }
  });

  it("keeps a forum suspension separate from non-forum AskRigor access", () => {
    const service = new SyntheticDiscourseConnectService();
    service.registerAccount(account());
    service.openSyntheticSession(
      "ARSYN-EXTERNAL0001",
      "SYNTHETIC-SESSION-SUSPEND0001",
    );
    const suspended = service.suspendForumAccount("ARSYN-EXTERNAL0001");
    expect(suspended.forumSuspended).toBe(true);
    expect(suspended.nonForumProductAccess).toBe(true);
    expect(
      service.isSyntheticSessionActive(
        "ARSYN-EXTERNAL0001",
        "SYNTHETIC-SESSION-SUSPEND0001",
      ),
    ).toBe(false);
  });

  it("invalidates sessions on logout, administrative relinking, and anonymization", () => {
    const service = new SyntheticDiscourseConnectService();
    service.registerAccount(account());
    service.openSyntheticSession(
      "ARSYN-EXTERNAL0001",
      "SYNTHETIC-SESSION-SESSION0001",
    );
    expect(
      service.isSyntheticSessionActive(
        "ARSYN-EXTERNAL0001",
        "SYNTHETIC-SESSION-SESSION0001",
      ),
    ).toBe(true);
    expect(service.invalidateForumSessions("ARSYN-EXTERNAL0001")).toBe(1);
    expect(
      service.isSyntheticSessionActive(
        "ARSYN-EXTERNAL0001",
        "SYNTHETIC-SESSION-SESSION0001",
      ),
    ).toBe(false);

    expect(() =>
      service.recoverExternalId(
        "ARSYN-EXTERNAL0001",
        "ARSYN-EXTERNAL0002",
        false,
      ),
    ).toThrow("DISCOURSE_CONNECT_ADMIN_RECOVERY_REQUIRED");
    const recovered = service.recoverExternalId(
      "ARSYN-EXTERNAL0001",
      "ARSYN-EXTERNAL0002",
      true,
    );
    expect(recovered.externalUserId).toBe("ARSYN-EXTERNAL0002");
    service.openSyntheticSession(
      "ARSYN-EXTERNAL0002",
      "SYNTHETIC-SESSION-SESSION0002",
    );
    const anonymized = service.anonymizeForumAccount("ARSYN-EXTERNAL0002");
    expect(anonymized).toMatchObject({
      discourseUserId: null,
      forumSuspended: true,
      nonForumProductAccess: true,
    });
    expect(anonymized.pseudonymousDisplayName).toMatch(
      /^synthetic_anonymized_/u,
    );
    expect(
      service.isSyntheticSessionActive(
        "ARSYN-EXTERNAL0002",
        "SYNTHETIC-SESSION-SESSION0002",
      ),
    ).toBe(false);
  });

  it("does not register an account when the signed return URL is outside the lab", () => {
    const service = new SyntheticDiscourseConnectService();
    const request = new URLSearchParams({
      nonce: "synthetic-nonce-no-side-effect",
      return_sso_url: "http://127.0.0.1:33001/session/sso_login",
    }).toString();
    const sso = Buffer.from(request, "utf8").toString("base64");
    expect(() =>
      service.issueResponse(
        { sso, sig: signDiscourseConnectPayload(sso, SECRET) },
        account(),
        SECRET,
      ),
    ).toThrow("DISCOURSE_CONNECT_RETURN_URL_OUTSIDE_SYNTHETIC_LAB");
    expect(service.registerAccount(account())).toEqual(account());
  });
});

describe("signed, idempotent, ordered synthetic forum bridge", () => {
  it("accepts valid signed events and treats exact replay as a no-op", () => {
    const bridge = new SyntheticCommunityBridge();
    const first = event(1, "forum.post.created.v1", "PUBLIC");
    const raw = JSON.stringify(first);
    expect(
      bridge.ingest(raw, signDiscourseWebhook(raw, SECRET), SECRET).status,
    ).toBe("inserted");
    expect(
      bridge.ingest(raw, signDiscourseWebhook(raw, SECRET), SECRET).status,
    ).toBe("idempotent_replay");
    expect(bridge.getState(first.aggregateId)).toMatchObject({
      sourceVersion: 1,
      deleted: false,
    });
  });

  it("reconciles by source version and never resurrects a deleted post through a later edit", () => {
    const bridge = new SyntheticCommunityBridge();
    for (const current of [
      event(1, "forum.post.created.v1", "PUBLIC"),
      event(3, "forum.post.edited.v1", "MEMBER_ONLY"),
    ]) {
      const raw = JSON.stringify(current);
      bridge.ingest(raw, signDiscourseWebhook(raw, SECRET), SECRET);
    }
    const stale = event(2, "forum.post.edited.v1", "PUBLIC");
    const staleRaw = JSON.stringify(stale);
    expect(
      bridge.ingest(staleRaw, signDiscourseWebhook(staleRaw, SECRET), SECRET)
        .status,
    ).toBe("stale_ignored");
    expect(bridge.getState(stale.aggregateId)).toMatchObject({
      sourceVersion: 3,
      visibility: "MEMBER_ONLY",
    });

    const deleted = event(4, "forum.post.deleted.v1", "DELETED");
    const deletedRaw = JSON.stringify(deleted);
    bridge.ingest(deletedRaw, signDiscourseWebhook(deletedRaw, SECRET), SECRET);
    const resurrection = event(5, "forum.post.edited.v1", "PUBLIC");
    const resurrectionRaw = JSON.stringify(resurrection);
    expect(() =>
      bridge.ingest(
        resurrectionRaw,
        signDiscourseWebhook(resurrectionRaw, SECRET),
        SECRET,
      ),
    ).toThrow("DISCOURSE_EVENT_STALE_RESURRECTION_BLOCKED");
    expect(bridge.getState(deleted.aggregateId)).toMatchObject({
      sourceVersion: 4,
      deleted: true,
    });
  });

  it("dead-letters invalid signatures by hash without retaining the raw body", () => {
    const bridge = new SyntheticCommunityBridge();
    const raw = JSON.stringify(event(1, "forum.post.created.v1", "PUBLIC"));
    expect(() =>
      bridge.ingest(raw, `sha256=${"0".repeat(64)}`, SECRET),
    ).toThrow("DISCOURSE_WEBHOOK_SIGNATURE_INVALID");
    expect(bridge.getDeadLetters()).toEqual([
      expect.objectContaining({
        errorCode: "DISCOURSE_WEBHOOK_SIGNATURE_INVALID",
        rawBodySha256: sha256(raw),
        rawForumBodyPersisted: false,
      }),
    ]);
    expect(JSON.stringify(bridge.getDeadLetters())).not.toContain(
      "synthetic-content",
    );
  });

  it("sanitizes schema failures so invalid forum values never enter dead-letter metadata", () => {
    const bridge = new SyntheticCommunityBridge();
    const invalid = {
      ...event(1, "forum.post.created.v1", "PUBLIC"),
      privateMedicalNarrative: "synthetic-private-narrative-must-not-persist",
    };
    const raw = JSON.stringify(invalid);
    expect(() =>
      bridge.ingest(raw, signDiscourseWebhook(raw, SECRET), SECRET),
    ).toThrow();
    expect(bridge.getDeadLetters()).toEqual([
      expect.objectContaining({
        errorCode: "DISCOURSE_EVENT_VALIDATION_FAILED",
        rawBodySha256: sha256(raw),
        rawForumBodyPersisted: false,
      }),
    ]);
    expect(JSON.stringify(bridge.getDeadLetters())).not.toContain(
      "synthetic-private-narrative-must-not-persist",
    );
  });

  it("requires deletion events to discard their content hash", () => {
    const deleted = event(2, "forum.post.deleted.v1", "DELETED");
    expect(() =>
      communityForumEventSchema.parse({
        ...deleted,
        minimalPayload: {
          ...deleted.minimalPayload,
          contentSha256: sha256("synthetic-deleted-body"),
        },
      }),
    ).toThrow(/cannot retain a content hash/i);
  });
});

describe("corrected two-object publication policy", () => {
  it("projects a deidentified one-hop public research lead without subject exact-version approval", () => {
    const service = new SyntheticCommunityLeadService();
    const source = service.createLead(lead());
    const version = publicLead();
    const projection = service.projectPublicVersion(version);

    expect(source.subjectBoundary.subjectExactVersionApproval).toBeNull();
    expect(projection).toMatchObject({
      leadVersion: 1,
      publicationObjectType: "PUBLIC_RESEARCH_LEAD",
      publicVisibility: "SYNTHETIC_LAB_ONLY",
      verificationState: "UNVERIFIED",
      evidenceCapability: "COMBINATION_ASSOCIATION_ONLY",
      formalEvidenceRelationship: "NOT_CHECKED",
    });
    expect(projection.sourceDistanceLabel).toMatch(
      /friend|not a firsthand subject report/iu,
    );
    expect(JSON.stringify(projection)).not.toContain(
      "person-0001@synthetic.askrigor.invalid",
    );
  });

  it("blocks identifying, quoted, media-bearing, unreviewed, and abuse-pending research leads", () => {
    for (const mutation of [
      { subjectIdentifiableInPublicVersion: true },
      { directSubjectQuotePresent: true },
      { documentsOrMediaPresent: true },
      {
        privacyReview: {
          ...publicLead().privacyReview,
          outcome: "HUMAN_REVIEW_REQUIRED" as const,
        },
      },
      { abuseReviewState: "PENDING" as const },
      { jurisdictionPolicyState: "REVIEW_REQUIRED" as const },
      { reporterPublicationConsent: consent("SUBJECT", "z") },
    ]) {
      expect(() => publicLead(mutation)).toThrow();
    }
  });

  it("keeps exact-version subject approval mandatory for public narratives", () => {
    expect(() =>
      publicLead({ publicationObjectType: "PUBLIC_NARRATIVE" }),
    ).toThrow(/exact-version approval/i);
    expect(() =>
      publicLead({
        publicationObjectType: "PUBLIC_NARRATIVE",
        subjectExactVersionApproval: consent("REPORTER", "z"),
      }),
    ).toThrow(/exact-version approval/i);
    const narrative = publicLead({
      publicationObjectType: "PUBLIC_NARRATIVE",
      subjectExactVersionApproval: consent("SUBJECT", "c"),
      subjectIdentifiableInPublicVersion: true,
      directSubjectQuotePresent: true,
    });
    expect(narrative.publicationObjectType).toBe("PUBLIC_NARRATIVE");
  });

  it("makes publication visibility incapable of upgrading scientific state", () => {
    const source = lead();
    expect(() =>
      assertCommunityPublicationPreservesEvidence(
        source,
        publicLead({ verificationState: "SUBJECT_VERIFIED" }),
      ),
    ).toThrow("PUBLICATION_CANNOT_UPGRADE_EVIDENCE_STATE");
    expect(() =>
      assertCommunityPublicationPreservesEvidence(
        source,
        publicLead({ evidenceCapability: "FORMAL_EVIDENCE_LINKED" }),
      ),
    ).toThrow("PUBLICATION_CANNOT_UPGRADE_EVIDENCE_STATE");
  });

  it("binds the projection to its exact allowlisted payload hash", () => {
    const service = new SyntheticCommunityLeadService();
    service.createLead(lead());
    expect(() =>
      service.projectPublicVersion({
        ...publicLead(),
        publicPayloadSha256: "0".repeat(64),
      }),
    ).toThrow("COMMUNITY_PUBLIC_PAYLOAD_HASH_MISMATCH");
  });

  it("keeps reporter-account verification separate from subject verification", () => {
    const service = new SyntheticCommunityLeadService();
    const source = service.createLead(lead());
    const verified = service.addVerification({
      synthetic: true,
      verificationEventId: "ARVER-SYNTHSUBJECT0001",
      leadId: source.leadId,
      leadVersion: source.leadVersion,
      priorVerificationState: "UNVERIFIED",
      nextVerificationState: "SUBJECT_VERIFIED",
      evidenceCapabilityBefore: "COMBINATION_ASSOCIATION_ONLY",
      evidenceCapabilityAfter: "COMBINATION_ASSOCIATION_ONLY",
      occurredAt: AT,
      actorRole: "SCIENTIFIC_ANNOTATOR",
    });
    expect(verified.verificationState).toBe("SUBJECT_VERIFIED");
    expect(verified.reporter.verificationState).toBe("UNVERIFIED");
    expect(verified.evidenceCapability).toBe("COMBINATION_ASSOCIATION_ONLY");
  });

  it("versions corrections and computes duplicate-linked source independence", () => {
    const service = new SyntheticCommunityLeadService();
    const first = service.createLead(lead());
    service.challengeLead({
      synthetic: true,
      challengeId: "ARCHAL-SYNTHCHALLENGE01",
      leadId: first.leadId,
      leadVersion: first.leadVersion,
      challengeType: "REPORTER_CORRECTION",
      summary: "Synthetic correction requested.",
      status: "OPEN",
      createdAt: AT,
    });
    const corrected = service.correctLead(
      {
        synthetic: true,
        correctionId: "ARCORR-SYNTHCORRECTION01",
        leadId: first.leadId,
        fromLeadVersion: 1,
        toLeadVersion: 2,
        correctionSummary: "Synthetic clarification of missing fields.",
        createdAt: AT,
      },
      {
        ...first,
        leadVersion: 2,
        missingMaterialFields: [
          ...first.missingMaterialFields,
          "synthetic clarification still unresolved",
        ],
      },
    );
    expect(corrected.leadVersion).toBe(2);
    expect(() =>
      service.challengeLead({
        synthetic: true,
        challengeId: "ARCHAL-SYNTHCHALLENGE02",
        leadId: first.leadId,
        leadVersion: 1,
        challengeType: "PROVENANCE",
        summary: "Synthetic stale challenge target.",
        status: "OPEN",
        createdAt: AT,
      }),
    ).toThrow("COMMUNITY_LEAD_CHALLENGE_STALE_VERSION");

    const secondId = "ARLEAD-SYNTHDUPLICATE20260830";
    service.createLead(lead({ leadId: secondId }));
    const linked = service.linkDuplicateLeads([first.leadId, secondId]);
    expect(linked).toHaveLength(2);
    const cluster = service.createCluster({
      schemaVersion: "0.1.0",
      synthetic: true,
      clusterId: "ARCL-SYNTHDUPLICATES01",
      clusterVersion: 1,
      scope: {
        condition: "Reported MCAS",
        population: "Synthetic adults",
        interventionOrExposure: "Synthetic three-component combination",
        comparator: null,
        outcome: "Synthetic reported global change",
        horizon: null,
      },
      programFingerprint: "Duplicate-linked synthetic pair",
      memberLeadIds: [first.leadId, secondId],
      independentSourceCount: 1,
      directionCounts: {
        improved: 2,
        worsened: 0,
        noClearChange: 0,
        mixed: 0,
        unknown: 0,
      },
      duplicateHandling: "Linked pair counts once.",
      formalEvidenceRelationship: "NOT_CHECKED",
      denominatorAvailable: false,
      effectivenessPercentageDisplayPermitted: false,
      limitations: ["Synthetic duplicate fixture only."],
      createdAt: AT,
    });
    expect(cluster.independentSourceCount).toBe(1);
    expect(() =>
      service.createCluster({ ...cluster, clusterVersion: 3 }),
    ).toThrow("COMMUNITY_CLUSTER_VERSION_GAP");
    expect(
      service.createCluster({ ...cluster, clusterVersion: 2 }).clusterVersion,
    ).toBe(2);
  });

  it("withdraws the lab projection and retains only a non-content tombstone", () => {
    const service = new SyntheticCommunityLeadService();
    service.createLead(lead());
    const version = publicLead();
    service.projectPublicVersion(version);
    const receipt = service.withdraw(version.publicVersionId);
    expect(service.getProjection(version.publicVersionId)).toBeNull();
    expect(receipt).toEqual({
      withdrawn: true,
      tombstone: {
        publicVersionId: version.publicVersionId,
        contentRetained: false,
      },
    });
  });
});

describe("synthetic research/governance fixture contracts", () => {
  it("keeps duplicate-aware clusters denominator-bounded and prevents effectiveness percentages", () => {
    const cluster = communitySignalClusterSchema.parse({
      schemaVersion: "0.1.0",
      synthetic: true,
      clusterId: "ARCL-SYNTHMCASCOMBO01",
      clusterVersion: 1,
      scope: {
        condition: "Reported MCAS",
        population: "Synthetic adults",
        interventionOrExposure:
          "LDN + NAD+ injections + tirzepatide combination",
        comparator: null,
        outcome: "Reported overall symptoms and function",
        horizon: null,
      },
      programFingerprint: "Three named components; doses and sequence unknown",
      memberLeadIds: ["ARLEAD-SYNTHANDY20260830"],
      independentSourceCount: 1,
      directionCounts: {
        improved: 1,
        worsened: 0,
        noClearChange: 0,
        mixed: 0,
        unknown: 0,
      },
      duplicateHandling: "Synthetic fixture contains one independent source.",
      formalEvidenceRelationship: "NOT_CHECKED",
      denominatorAvailable: false,
      effectivenessPercentageDisplayPermitted: false,
      limitations: [
        "Self-selected synthetic reports are not a treatment-effect denominator.",
      ],
      createdAt: AT,
    });
    expect(cluster.effectivenessPercentageDisplayPermitted).toBe(false);
    expect(() =>
      communitySignalClusterSchema.parse({
        ...cluster,
        effectivenessPercentageDisplayPermitted: true,
      }),
    ).toThrow();
  });

  it("keeps moderation, scientific annotation, privacy/safety, consent, and recruitment powers separate", () => {
    expect(
      communityModerationEventSchema.parse({
        synthetic: true,
        eventId: "ARMOD-SYNTH0001",
        targetType: "POST",
        targetId: "SYNTHETIC-POST-1001",
        actorRole: "GLOBAL_MODERATOR",
        action: "LABEL",
        reason: "Synthetic conduct label.",
        appealable: true,
        occurredAt: AT,
      }).actorRole,
    ).toBe("GLOBAL_MODERATOR");
    expect(() =>
      communityModerationEventSchema.parse({
        synthetic: true,
        eventId: "ARMOD-SYNTH0002",
        targetType: "LEAD",
        targetId: "ARLEAD-SYNTHANDY20260830",
        actorRole: "SCIENTIFIC_ANNOTATOR",
        action: "LABEL",
        reason: "Wrong role.",
        appealable: true,
        occurredAt: AT,
      }),
    ).toThrow();
    expect(
      communityScientificAnnotationSchema.parse({
        synthetic: true,
        annotationId: "ARANN-SYNTH0001",
        targetType: "LEAD",
        targetId: "ARLEAD-SYNTHANDY20260830",
        annotationType: "SECONDHAND_REPORT",
        annotationText: "Synthetic source-distance annotation.",
        actorRole: "SCIENTIFIC_ANNOTATOR",
        occurredAt: AT,
        appealable: true,
      }).appealable,
    ).toBe(true);
    expect(
      communitySafetyCandidateSchema.parse({
        synthetic: true,
        safetyCandidateId: "ARSAFE-SYNTH0001",
        sourceTargetType: "LEAD",
        sourceTargetId: "ARLEAD-SYNTHANDY20260830",
        eventSummary: "Synthetic potentially serious event.",
        seriousness: "POTENTIALLY_SERIOUS",
        regulatoryResponsibilityState: "ASSESSMENT_REQUIRED",
        automatedRegulatoryReporting: false,
        triageState: "IN_REVIEW",
        createdAt: AT,
      }).automatedRegulatoryReporting,
    ).toBe(false);
    expect(() =>
      communitySafetyCandidateSchema.parse({
        synthetic: true,
        safetyCandidateId: "ARSAFE-SYNTH0002",
        sourceTargetType: "LEAD",
        sourceTargetId: "ARLEAD-SYNTHANDY20260830",
        eventSummary: "Synthetic event.",
        seriousness: "SERIOUS",
        regulatoryResponsibilityState: "ASSESSMENT_REQUIRED",
        automatedRegulatoryReporting: true,
        triageState: "IN_REVIEW",
        createdAt: AT,
      }),
    ).toThrow();
    expect(
      communityConsentEventSchema.parse({
        synthetic: true,
        consentEventId: "ARCONS-SYNTH0001",
        subjectType: "REPORTER",
        subjectId: "ARSYN-ACCOUNT0001",
        permission: "PUBLIC_LEAD",
        decision: consent("REPORTER", "d"),
        targetRecordIds: ["ARLEAD-SYNTHANDY20260830"],
      }).permission,
    ).toBe("PUBLIC_LEAD");
    expect(() =>
      communityResearchProposalSchema.parse({
        synthetic: true,
        proposalId: "ARPROP-SYNTH0001",
        proposalVersion: 1,
        questionId: "ARQ-SYNTHMCAS0001",
        questionVersion: 1,
        proposalType: "TARGETED_REVIEW",
        designSummary: "Synthetic proposal fixture only.",
        ethicsState: "NOT_REVIEWED",
        privacyState: "NOT_REVIEWED",
        safetyState: "NOT_REVIEWED",
        methodsReviewState: "NOT_REVIEWED",
        recruitmentActive: true,
        status: "DRAFT",
        createdAt: AT,
      }),
    ).toThrow();
  });

  it("binds evidence checks and proposals to exact research-question versions", () => {
    const question = communityResearchQuestionSchema.parse({
      synthetic: true,
      questionId: "ARQ-SYNTHMCAS0001",
      questionVersion: 1,
      derivedFromClusterIds: ["ARCL-SYNTHMCASCOMBO01"],
      questionText:
        "Does a synthetic combination warrant a scoped evidence check?",
      evidenceCheckStatus: "NOT_CHECKED",
      status: "EVIDENCE_CHECK",
      createdAt: AT,
    });
    const check = communityQuestionEvidenceCheckSchema.parse({
      synthetic: true,
      evidenceCheckId: "AREC-SYNTHMCAS0001",
      questionId: question.questionId,
      questionVersion: question.questionVersion,
      matchedEvidenceStatus: "NOT_ANSWERED",
      summary: "Synthetic fixture located no scope-matched answer.",
      evidenceIdentifiers: [],
      checkedAt: AT,
    });
    const proposal = communityResearchProposalSchema.parse({
      synthetic: true,
      proposalId: "ARPROP-SYNTH0002",
      proposalVersion: 1,
      questionId: question.questionId,
      questionVersion: question.questionVersion,
      proposalType: "TARGETED_REVIEW",
      designSummary: "Synthetic targeted-review proposal only.",
      ethicsState: "NOT_REVIEWED",
      privacyState: "NOT_REVIEWED",
      safetyState: "NOT_REVIEWED",
      methodsReviewState: "NOT_REVIEWED",
      recruitmentActive: false,
      status: "DRAFT",
      createdAt: AT,
    });
    expect(check.questionVersion).toBe(1);
    expect(proposal.questionVersion).toBe(1);
  });
});
