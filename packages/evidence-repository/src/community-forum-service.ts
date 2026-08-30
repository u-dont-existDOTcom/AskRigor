import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  assertCommunityPublicationPreservesEvidence,
  communityForumEventSchema,
  communityLeadChallengeSchema,
  communityLeadCorrectionSchema,
  communityLeadSchema,
  communityPublicVersionSchema,
  communitySignalClusterSchema,
  communityVerificationEventSchema,
  syntheticForumAccountSchema,
  type CommunityForumEvent,
  type CommunityLead,
  type CommunityLeadChallenge,
  type CommunityLeadCorrection,
  type CommunityPublicVersion,
  type CommunitySignalCluster,
  type CommunityVerificationEvent,
  type SyntheticForumAccount,
} from "@askrigor/contracts";

import { sha256, stableJson } from "./hash.js";

function hmacSha256(value: string, secret: string): string {
  if (secret.length < 16) throw new Error("SYNTHETIC_LAB_SECRET_TOO_SHORT");
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(left) || !/^[a-f0-9]{64}$/u.test(right))
    return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function signDiscourseWebhook(rawBody: string, secret: string): string {
  return `sha256=${hmacSha256(rawBody, secret)}`;
}

export function verifyDiscourseWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): void {
  const supplied = signature.startsWith("sha256=") ? signature.slice(7) : "";
  const expected = hmacSha256(rawBody, secret);
  if (!constantTimeHexEqual(supplied, expected))
    throw new Error("DISCOURSE_WEBHOOK_SIGNATURE_INVALID");
}

export function signDiscourseConnectPayload(
  base64Payload: string,
  secret: string,
): string {
  return hmacSha256(base64Payload, secret);
}

export function verifyDiscourseConnectPayload(
  base64Payload: string,
  signature: string,
  secret: string,
): URLSearchParams {
  const expected = signDiscourseConnectPayload(base64Payload, secret);
  if (!constantTimeHexEqual(signature, expected))
    throw new Error("DISCOURSE_CONNECT_SIGNATURE_INVALID");
  let decoded: string;
  try {
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        base64Payload,
      )
    ) {
      throw new Error("non-canonical base64");
    }
    const bytes = Buffer.from(base64Payload, "base64");
    if (bytes.toString("base64") !== base64Payload)
      throw new Error("non-canonical base64");
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("DISCOURSE_CONNECT_PAYLOAD_INVALID");
  }
  const parameters = new URLSearchParams(decoded);
  if (parameters.getAll("nonce").length !== 1 || !parameters.get("nonce")) {
    throw new Error("DISCOURSE_CONNECT_NONCE_MISSING");
  }
  return parameters;
}

export function communityDeadLetterErrorCode(error: unknown): string {
  if (error instanceof SyntaxError) return "DISCOURSE_EVENT_JSON_INVALID";
  if (error instanceof Error) {
    if (error.name === "ZodError") return "DISCOURSE_EVENT_VALIDATION_FAILED";
    if (/^[A-Z][A-Z0-9_]{2,127}$/u.test(error.message)) return error.message;
    return "DISCOURSE_EVENT_VALIDATION_FAILED";
  }
  return "DISCOURSE_EVENT_UNKNOWN_ERROR";
}

export interface DiscourseConnectResponse {
  sso: string;
  sig: string;
  returnUrl: string;
}

export class SyntheticDiscourseConnectService {
  private readonly accountsByExternalId = new Map<
    string,
    SyntheticForumAccount
  >();
  private readonly externalIdByAccountId = new Map<string, string>();
  private readonly externalIdByEmail = new Map<string, string>();
  private readonly consumedNonces = new Set<string>();
  private readonly activeSessionIdsByExternalId = new Map<
    string,
    Set<string>
  >();

  registerAccount(input: unknown): SyntheticForumAccount {
    const account = syntheticForumAccountSchema.parse(input);
    const existingByExternalId = this.accountsByExternalId.get(
      account.externalUserId,
    );
    if (existingByExternalId !== undefined) {
      if (stableJson(existingByExternalId) !== stableJson(account)) {
        throw new Error("DISCOURSE_CONNECT_EXTERNAL_ID_COLLISION");
      }
      return structuredClone(existingByExternalId);
    }
    const existingExternalIdByAccountId = this.externalIdByAccountId.get(
      account.accountId,
    );
    if (
      existingExternalIdByAccountId !== undefined &&
      existingExternalIdByAccountId !== account.externalUserId
    ) {
      throw new Error("DISCOURSE_CONNECT_ACCOUNT_ID_COLLISION");
    }
    const existingExternalId = this.externalIdByEmail.get(account.email);
    if (
      existingExternalId !== undefined &&
      existingExternalId !== account.externalUserId
    ) {
      throw new Error("DISCOURSE_CONNECT_EMAIL_ACCOUNT_TAKEOVER_BLOCKED");
    }
    this.accountsByExternalId.set(account.externalUserId, account);
    this.externalIdByAccountId.set(account.accountId, account.externalUserId);
    this.externalIdByEmail.set(account.email, account.externalUserId);
    return structuredClone(account);
  }

  issueResponse(
    request: { sso: string; sig: string },
    accountInput: unknown,
    secret: string,
  ): DiscourseConnectResponse {
    const requestParameters = verifyDiscourseConnectPayload(
      request.sso,
      request.sig,
      secret,
    );
    const nonce = requestParameters.get("nonce")!;
    const returnUrlValue = requestParameters.get("return_sso_url");
    if (
      returnUrlValue === null ||
      requestParameters.getAll("return_sso_url").length !== 1
    )
      throw new Error("DISCOURSE_CONNECT_RETURN_URL_MISSING");
    const returnUrl = new URL(returnUrlValue);
    if (
      returnUrl.protocol !== "http:" ||
      (returnUrl.hostname !== "127.0.0.1" &&
        returnUrl.hostname !== "localhost") ||
      returnUrl.port !== "33000" ||
      returnUrl.pathname !== "/session/sso_login" ||
      returnUrl.search !== "" ||
      returnUrl.hash !== "" ||
      returnUrl.username !== "" ||
      returnUrl.password !== ""
    ) {
      throw new Error("DISCOURSE_CONNECT_RETURN_URL_OUTSIDE_SYNTHETIC_LAB");
    }
    if (this.consumedNonces.has(nonce))
      throw new Error("DISCOURSE_CONNECT_NONCE_REPLAY");
    const account = this.registerAccount(accountInput);
    this.consumedNonces.add(nonce);

    const responseParameters = new URLSearchParams({
      nonce,
      email: account.email,
      external_id: account.externalUserId,
      username: account.pseudonymousDisplayName,
      require_activation: "false",
      suppress_welcome_message: "true",
    });
    const sso = Buffer.from(responseParameters.toString(), "utf8").toString(
      "base64",
    );
    return {
      sso,
      sig: signDiscourseConnectPayload(sso, secret),
      returnUrl: returnUrl.toString(),
    };
  }

  suspendForumAccount(externalUserId: string): SyntheticForumAccount {
    const current = this.accountsByExternalId.get(externalUserId);
    if (current === undefined)
      throw new Error("SYNTHETIC_FORUM_ACCOUNT_NOT_FOUND");
    const updated = syntheticForumAccountSchema.parse({
      ...current,
      forumSuspended: true,
    });
    this.accountsByExternalId.set(externalUserId, updated);
    this.externalIdByAccountId.set(updated.accountId, externalUserId);
    this.invalidateForumSessions(externalUserId);
    return structuredClone(updated);
  }

  openSyntheticSession(externalUserId: string, sessionId: string): void {
    if (!/^SYNTHETIC-SESSION-[A-Z0-9_-]{8,64}$/u.test(sessionId)) {
      throw new Error("SYNTHETIC_FORUM_SESSION_ID_INVALID");
    }
    const account = this.accountsByExternalId.get(externalUserId);
    if (account === undefined)
      throw new Error("SYNTHETIC_FORUM_ACCOUNT_NOT_FOUND");
    if (account.forumSuspended)
      throw new Error("SYNTHETIC_FORUM_ACCOUNT_SUSPENDED");
    const sessions =
      this.activeSessionIdsByExternalId.get(externalUserId) ??
      new Set<string>();
    sessions.add(sessionId);
    this.activeSessionIdsByExternalId.set(externalUserId, sessions);
  }

  invalidateForumSessions(externalUserId: string): number {
    const sessions = this.activeSessionIdsByExternalId.get(externalUserId);
    const invalidated = sessions?.size ?? 0;
    this.activeSessionIdsByExternalId.delete(externalUserId);
    return invalidated;
  }

  isSyntheticSessionActive(externalUserId: string, sessionId: string): boolean {
    return (
      this.activeSessionIdsByExternalId.get(externalUserId)?.has(sessionId) ??
      false
    );
  }

  recoverExternalId(
    currentExternalUserId: string,
    nextExternalUserId: string,
    adminRecoveryApproved: boolean,
  ): SyntheticForumAccount {
    if (!adminRecoveryApproved)
      throw new Error("DISCOURSE_CONNECT_ADMIN_RECOVERY_REQUIRED");
    const current = this.accountsByExternalId.get(currentExternalUserId);
    if (current === undefined)
      throw new Error("SYNTHETIC_FORUM_ACCOUNT_NOT_FOUND");
    if (this.accountsByExternalId.has(nextExternalUserId))
      throw new Error("DISCOURSE_CONNECT_EXTERNAL_ID_COLLISION");
    const updated = syntheticForumAccountSchema.parse({
      ...current,
      externalUserId: nextExternalUserId,
    });
    this.accountsByExternalId.delete(currentExternalUserId);
    this.accountsByExternalId.set(nextExternalUserId, updated);
    this.externalIdByAccountId.set(updated.accountId, nextExternalUserId);
    this.externalIdByEmail.set(updated.email, nextExternalUserId);
    this.activeSessionIdsByExternalId.delete(currentExternalUserId);
    return structuredClone(updated);
  }

  anonymizeForumAccount(externalUserId: string): SyntheticForumAccount {
    const current = this.accountsByExternalId.get(externalUserId);
    if (current === undefined)
      throw new Error("SYNTHETIC_FORUM_ACCOUNT_NOT_FOUND");
    const updated = syntheticForumAccountSchema.parse({
      ...current,
      pseudonymousDisplayName: `synthetic_anonymized_${sha256(externalUserId).slice(0, 12)}`,
      discourseUserId: null,
      forumSuspended: true,
    });
    this.accountsByExternalId.set(externalUserId, updated);
    this.externalIdByAccountId.set(updated.accountId, externalUserId);
    this.invalidateForumSessions(externalUserId);
    return structuredClone(updated);
  }
}

export interface CommunityBridgeEventReceipt {
  status: "inserted" | "idempotent_replay" | "stale_ignored";
  eventId: string;
  aggregateId: string;
  sourceVersion: number;
  rawBodySha256: string;
  rawForumBodyPersisted: false;
}

export interface CommunityBridgeDeadLetter {
  eventId: string | null;
  errorCode: string;
  rawBodySha256: string;
  rawForumBodyPersisted: false;
  recordedAt: string;
}

interface MinimalForumState {
  aggregateId: string;
  sourceVersion: number;
  deleted: boolean;
  visibility: CommunityForumEvent["minimalPayload"]["visibility"];
  contentSha256: string | null;
  latestEventId: string;
}

export class SyntheticCommunityBridge {
  private readonly idempotency = new Map<
    string,
    { rawBodySha256: string; receipt: CommunityBridgeEventReceipt }
  >();
  private readonly stateByAggregate = new Map<string, MinimalForumState>();
  private readonly deadLetters: CommunityBridgeDeadLetter[] = [];

  ingest(
    rawBody: string,
    signature: string,
    secret: string,
  ): CommunityBridgeEventReceipt {
    const rawBodySha256 = createHash("sha256")
      .update(rawBody, "utf8")
      .digest("hex");
    try {
      verifyDiscourseWebhookSignature(rawBody, signature, secret);
      const event = communityForumEventSchema.parse(
        JSON.parse(rawBody) as unknown,
      );
      if (event.payloadSha256 !== sha256(stableJson(event.minimalPayload))) {
        throw new Error("DISCOURSE_EVENT_MINIMAL_PAYLOAD_HASH_MISMATCH");
      }

      const priorReplay = this.idempotency.get(event.idempotencyKey);
      if (priorReplay !== undefined) {
        if (priorReplay.rawBodySha256 !== rawBodySha256)
          throw new Error("DISCOURSE_EVENT_IDEMPOTENCY_PAYLOAD_MISMATCH");
        return { ...priorReplay.receipt, status: "idempotent_replay" };
      }

      const current = this.stateByAggregate.get(event.aggregateId);
      if (
        current !== undefined &&
        event.sourceVersion < current.sourceVersion
      ) {
        const receipt = this.receipt("stale_ignored", event, rawBodySha256);
        this.idempotency.set(event.idempotencyKey, { rawBodySha256, receipt });
        return receipt;
      }
      if (
        current !== undefined &&
        event.sourceVersion === current.sourceVersion
      ) {
        throw new Error("DISCOURSE_EVENT_SOURCE_VERSION_COLLISION");
      }
      if (
        current?.deleted === true &&
        event.eventType !== "forum.post.deleted.v1"
      ) {
        throw new Error("DISCOURSE_EVENT_STALE_RESURRECTION_BLOCKED");
      }

      const deleted = event.eventType === "forum.post.deleted.v1";
      this.stateByAggregate.set(event.aggregateId, {
        aggregateId: event.aggregateId,
        sourceVersion: event.sourceVersion,
        deleted,
        visibility: event.minimalPayload.visibility,
        contentSha256: event.minimalPayload.contentSha256,
        latestEventId: event.eventId,
      });
      const receipt = this.receipt("inserted", event, rawBodySha256);
      this.idempotency.set(event.idempotencyKey, { rawBodySha256, receipt });
      return receipt;
    } catch (error) {
      const eventId = this.extractEventId(rawBody);
      this.deadLetters.push({
        eventId,
        errorCode: communityDeadLetterErrorCode(error),
        rawBodySha256,
        rawForumBodyPersisted: false,
        recordedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  getState(aggregateId: string): MinimalForumState | null {
    const state = this.stateByAggregate.get(aggregateId);
    return state === undefined ? null : structuredClone(state);
  }

  getDeadLetters(): CommunityBridgeDeadLetter[] {
    return structuredClone(this.deadLetters);
  }

  private receipt(
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

  private extractEventId(rawBody: string): string | null {
    try {
      const parsed = JSON.parse(rawBody) as { eventId?: unknown };
      return typeof parsed.eventId === "string" ? parsed.eventId : null;
    } catch {
      return null;
    }
  }
}

export interface SyntheticPublicLeadProjection {
  synthetic: true;
  labOnly: true;
  publicVersionId: string;
  leadId: string;
  leadVersion: number;
  publicationObjectType: CommunityPublicVersion["publicationObjectType"];
  publicTitle: string;
  publicParaphrase: string;
  sourceDistanceLabel: string;
  limitations: string[];
  verificationState: CommunityPublicVersion["verificationState"];
  evidenceCapability: CommunityPublicVersion["evidenceCapability"];
  formalEvidenceRelationship: CommunityPublicVersion["formalEvidenceRelationship"];
  publicVisibility: "SYNTHETIC_LAB_ONLY";
}

export function buildSyntheticPublicLeadProjection(
  publicVersion: CommunityPublicVersion,
): SyntheticPublicLeadProjection {
  return {
    synthetic: true,
    labOnly: true,
    publicVersionId: publicVersion.publicVersionId,
    leadId: publicVersion.leadId,
    leadVersion: publicVersion.leadVersion,
    publicationObjectType: publicVersion.publicationObjectType,
    publicTitle: publicVersion.publicTitle,
    publicParaphrase: publicVersion.publicParaphrase,
    sourceDistanceLabel: publicVersion.sourceDistanceLabel,
    limitations: [...publicVersion.limitations],
    verificationState: publicVersion.verificationState,
    evidenceCapability: publicVersion.evidenceCapability,
    formalEvidenceRelationship: publicVersion.formalEvidenceRelationship,
    publicVisibility: "SYNTHETIC_LAB_ONLY",
  };
}

export function syntheticPublicLeadProjectionSha256(
  publicVersion: CommunityPublicVersion,
): string {
  return sha256(stableJson(buildSyntheticPublicLeadProjection(publicVersion)));
}

export function computeCommunitySourceIndependenceKeys(
  leads: CommunityLead[],
): Map<string, string> {
  const leadsById = new Map(leads.map((lead) => [lead.leadId, lead]));
  const parent = new Map(leads.map((lead) => [lead.leadId, lead.leadId]));

  const find = (leadId: string): string => {
    const current = parent.get(leadId);
    if (current === undefined)
      throw new Error(`COMMUNITY_CLUSTER_LEAD_NOT_FOUND lead=${leadId}`);
    if (current === leadId) return current;
    const root = find(current);
    parent.set(leadId, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second!, first!);
  };

  for (const lead of leads) {
    for (const linkedLeadId of lead.duplicateOrLinkedLeadIds) {
      if (leadsById.has(linkedLeadId)) union(lead.leadId, linkedLeadId);
    }
  }
  const reporterGroups = new Map<string, string>();
  for (const lead of leads) {
    const priorLeadId = reporterGroups.get(lead.reporter.accountId);
    if (priorLeadId === undefined)
      reporterGroups.set(lead.reporter.accountId, lead.leadId);
    else union(priorLeadId, lead.leadId);
  }

  const membersByRoot = new Map<string, string[]>();
  for (const lead of leads) {
    const root = find(lead.leadId);
    const members = membersByRoot.get(root) ?? [];
    members.push(lead.leadId);
    membersByRoot.set(root, members);
  }
  const result = new Map<string, string>();
  for (const members of membersByRoot.values()) {
    const key = sha256(stableJson(members.sort()));
    for (const leadId of members) result.set(leadId, key);
  }
  return result;
}

export class SyntheticCommunityLeadService {
  private readonly leads = new Map<string, CommunityLead>();
  private readonly publicVersions = new Map<string, CommunityPublicVersion>();
  private readonly projections = new Map<
    string,
    SyntheticPublicLeadProjection
  >();
  private readonly verificationEvents = new Map<
    string,
    CommunityVerificationEvent
  >();
  private readonly challenges = new Map<string, CommunityLeadChallenge>();
  private readonly corrections = new Map<string, CommunityLeadCorrection>();
  private readonly clusters = new Map<string, CommunitySignalCluster>();
  private readonly currentClusters = new Map<string, CommunitySignalCluster>();

  createLead(input: unknown): CommunityLead {
    const lead = communityLeadSchema.parse(input);
    const current = this.leads.get(lead.leadId);
    if (current === undefined && lead.leadVersion !== 1)
      throw new Error("COMMUNITY_LEAD_VERSION_GAP");
    if (current !== undefined) {
      if (
        current.leadVersion === lead.leadVersion &&
        stableJson(current) === stableJson(lead)
      ) {
        return structuredClone(current);
      }
      if (lead.leadVersion <= current.leadVersion)
        throw new Error("COMMUNITY_LEAD_STALE_VERSION");
      if (lead.leadVersion !== current.leadVersion + 1)
        throw new Error("COMMUNITY_LEAD_VERSION_GAP");
    }
    this.leads.set(lead.leadId, lead);
    return structuredClone(lead);
  }

  approveLead(leadId: string): CommunityLead {
    const current = this.requireLead(leadId);
    return this.createLead({
      ...current,
      leadVersion: current.leadVersion + 1,
      status: "APPROVED",
    });
  }

  addVerification(input: unknown): CommunityLead {
    const event = communityVerificationEventSchema.parse(input);
    if (this.verificationEvents.has(event.verificationEventId)) {
      const prior = this.verificationEvents.get(event.verificationEventId)!;
      if (stableJson(prior) !== stableJson(event))
        throw new Error("COMMUNITY_VERIFICATION_EVENT_COLLISION");
      return this.requireLead(event.leadId);
    }
    const current = this.requireLead(event.leadId);
    if (
      event.leadVersion !== current.leadVersion ||
      event.priorVerificationState !== current.verificationState
    ) {
      throw new Error("COMMUNITY_VERIFICATION_STALE_LEAD_VERSION");
    }
    if (
      event.evidenceCapabilityBefore !== current.evidenceCapability ||
      event.evidenceCapabilityAfter !== current.evidenceCapability
    ) {
      throw new Error("VERIFICATION_CANNOT_UPGRADE_EVIDENCE_CAPABILITY");
    }
    const next = this.createLead({
      ...current,
      leadVersion: current.leadVersion + 1,
      verificationState: event.nextVerificationState,
    });
    this.verificationEvents.set(event.verificationEventId, event);
    return next;
  }

  challengeLead(input: unknown): CommunityLeadChallenge {
    const challenge = communityLeadChallengeSchema.parse(input);
    const lead = this.requireLead(challenge.leadId);
    if (challenge.leadVersion !== lead.leadVersion) {
      throw new Error("COMMUNITY_LEAD_CHALLENGE_STALE_VERSION");
    }
    const current = this.challenges.get(challenge.challengeId);
    if (
      current !== undefined &&
      stableJson(current) !== stableJson(challenge)
    ) {
      throw new Error("COMMUNITY_LEAD_CHALLENGE_COLLISION");
    }
    this.challenges.set(challenge.challengeId, challenge);
    return structuredClone(challenge);
  }

  correctLead(correctionInput: unknown, nextLeadInput: unknown): CommunityLead {
    const correction = communityLeadCorrectionSchema.parse(correctionInput);
    const current = this.requireLead(correction.leadId);
    if (current.leadVersion !== correction.fromLeadVersion)
      throw new Error("COMMUNITY_CORRECTION_STALE_LEAD_VERSION");
    const next = communityLeadSchema.parse(nextLeadInput);
    if (
      next.leadId !== current.leadId ||
      next.leadVersion !== correction.toLeadVersion
    ) {
      throw new Error("COMMUNITY_CORRECTION_LEAD_IDENTITY_MISMATCH");
    }
    const prior = this.corrections.get(correction.correctionId);
    if (prior !== undefined && stableJson(prior) !== stableJson(correction)) {
      throw new Error("COMMUNITY_LEAD_CORRECTION_COLLISION");
    }
    const created = this.createLead(next);
    this.corrections.set(correction.correctionId, correction);
    return created;
  }

  linkDuplicateLeads(leadIds: string[]): CommunityLead[] {
    const uniqueLeadIds = [...new Set(leadIds)].sort();
    if (uniqueLeadIds.length < 2)
      throw new Error("COMMUNITY_DUPLICATE_LINK_REQUIRES_MULTIPLE_LEADS");
    const currentLeads = uniqueLeadIds.map((leadId) =>
      this.requireLead(leadId),
    );
    const updates = currentLeads.map((current) =>
      communityLeadSchema.parse({
        ...current,
        leadVersion: current.leadVersion + 1,
        duplicateOrLinkedLeadIds: [
          ...new Set([
            ...current.duplicateOrLinkedLeadIds,
            ...uniqueLeadIds.filter((leadId) => leadId !== current.leadId),
          ]),
        ].sort(),
      }),
    );
    for (const update of updates) this.leads.set(update.leadId, update);
    return structuredClone(updates);
  }

  createCluster(input: unknown): CommunitySignalCluster {
    const cluster = communitySignalClusterSchema.parse(input);
    const current = this.currentClusters.get(cluster.clusterId);
    if (current === undefined && cluster.clusterVersion !== 1)
      throw new Error("COMMUNITY_CLUSTER_VERSION_GAP");
    if (current !== undefined) {
      if (
        current.clusterVersion === cluster.clusterVersion &&
        stableJson(current) === stableJson(cluster)
      ) {
        return structuredClone(current);
      }
      if (cluster.clusterVersion <= current.clusterVersion)
        throw new Error("COMMUNITY_CLUSTER_STALE_VERSION");
      if (cluster.clusterVersion !== current.clusterVersion + 1)
        throw new Error("COMMUNITY_CLUSTER_VERSION_GAP");
    }
    const memberLeads = cluster.memberLeadIds.map((leadId) =>
      this.requireLead(leadId),
    );
    const independenceKeys =
      computeCommunitySourceIndependenceKeys(memberLeads);
    if (
      new Set(independenceKeys.values()).size !== cluster.independentSourceCount
    ) {
      throw new Error("COMMUNITY_CLUSTER_INDEPENDENT_SOURCE_COUNT_MISMATCH");
    }
    const key = `${cluster.clusterId}:${cluster.clusterVersion}`;
    const prior = this.clusters.get(key);
    if (prior !== undefined && stableJson(prior) !== stableJson(cluster)) {
      throw new Error("COMMUNITY_SIGNAL_CLUSTER_VERSION_COLLISION");
    }
    this.clusters.set(key, cluster);
    this.currentClusters.set(cluster.clusterId, cluster);
    return structuredClone(cluster);
  }

  projectPublicVersion(input: unknown): SyntheticPublicLeadProjection {
    const publicVersion = communityPublicVersionSchema.parse(input);
    if (publicVersion.status !== "SYNTHETIC_LAB_PROJECTION") {
      throw new Error("SYNTHETIC_LAB_PROJECTION_STATE_REQUIRED");
    }
    const lead = this.leads.get(publicVersion.leadId);
    if (lead === undefined) throw new Error("COMMUNITY_LEAD_NOT_FOUND");
    assertCommunityPublicationPreservesEvidence(lead, publicVersion);
    const projection = buildSyntheticPublicLeadProjection(publicVersion);
    if (publicVersion.publicPayloadSha256 !== sha256(stableJson(projection))) {
      throw new Error("COMMUNITY_PUBLIC_PAYLOAD_HASH_MISMATCH");
    }
    const prior = this.publicVersions.get(publicVersion.publicVersionId);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(publicVersion))
        throw new Error("COMMUNITY_PUBLIC_VERSION_COLLISION");
      return structuredClone(
        this.projections.get(publicVersion.publicVersionId)!,
      );
    }
    this.publicVersions.set(publicVersion.publicVersionId, publicVersion);
    this.projections.set(publicVersion.publicVersionId, projection);
    return structuredClone(projection);
  }

  withdraw(publicVersionId: string): {
    withdrawn: true;
    tombstone: { publicVersionId: string; contentRetained: false };
  } {
    const publicVersion = this.publicVersions.get(publicVersionId);
    if (publicVersion === undefined)
      throw new Error("COMMUNITY_PUBLIC_VERSION_NOT_FOUND");
    this.publicVersions.set(publicVersionId, {
      ...publicVersion,
      status: "WITHDRAWN",
    });
    this.projections.delete(publicVersionId);
    return {
      withdrawn: true,
      tombstone: { publicVersionId, contentRetained: false },
    };
  }

  getProjection(publicVersionId: string): SyntheticPublicLeadProjection | null {
    const projection = this.projections.get(publicVersionId);
    return projection === undefined ? null : structuredClone(projection);
  }

  private requireLead(leadId: string): CommunityLead {
    const lead = this.leads.get(leadId);
    if (lead === undefined) throw new Error("COMMUNITY_LEAD_NOT_FOUND");
    return structuredClone(lead);
  }
}
