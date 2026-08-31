import {
  communityDeletedSourceRetentionDecisionSchema,
  communityExternalSourceExtractionBoundarySchema,
  communityPrivacyPublicationGateSchema,
  communityPrivateIntakeBoundarySchema,
  type CommunityDeletedSourceRetentionDecision,
  type CommunityExternalSourceExtractionBoundary,
  type CommunityPrivacyPublicationGate,
  type CommunityPrivateIntakeBoundary,
} from "@askrigor/contracts";

import { stableJson } from "./hash.js";

export interface CommunityPrivacyGateDependencies {
  publicVersionId: string;
  leadId: string;
  leadVersion: number;
  minorStatus: CommunityPrivacyPublicationGate["minorStatus"];
  residualPrivacyRiskFlags: CommunityPrivacyPublicationGate["riskFlagsAfter"];
}

export class SyntheticCommunityPrivacyProvenanceService {
  private readonly publicationGates = new Map<
    string,
    CommunityPrivacyPublicationGate
  >();
  private readonly externalExtractions = new Map<
    string,
    CommunityExternalSourceExtractionBoundary
  >();
  private readonly deletedSourceDecisions = new Map<
    string,
    CommunityDeletedSourceRetentionDecision
  >();
  private readonly privateIntakeBoundaries = new Map<
    string,
    CommunityPrivateIntakeBoundary
  >();

  evaluatePublicationGate(
    input: unknown,
    dependencies: CommunityPrivacyGateDependencies,
  ): CommunityPrivacyPublicationGate {
    const gate = communityPrivacyPublicationGateSchema.parse(input);
    const recordedFlags = [...gate.riskFlagsAfter].sort();
    const dependencyFlags = [...dependencies.residualPrivacyRiskFlags].sort();
    if (
      gate.publicVersionId !== dependencies.publicVersionId ||
      gate.leadId !== dependencies.leadId ||
      gate.leadVersion !== dependencies.leadVersion ||
      gate.minorStatus !== dependencies.minorStatus ||
      stableJson(recordedFlags) !== stableJson(dependencyFlags)
    ) {
      throw new Error("COMMUNITY_PRIVACY_PUBLICATION_GATE_DEPENDENCY_MISMATCH");
    }
    return this.insertExact(
      this.publicationGates,
      gate.gateId,
      gate,
      "COMMUNITY_PRIVACY_PUBLICATION_GATE_COLLISION",
    );
  }

  recordExternalExtraction(
    input: unknown,
  ): CommunityExternalSourceExtractionBoundary {
    const boundary =
      communityExternalSourceExtractionBoundarySchema.parse(input);
    return this.insertExact(
      this.externalExtractions,
      boundary.extractionId,
      boundary,
      "COMMUNITY_EXTERNAL_SOURCE_EXTRACTION_COLLISION",
    );
  }

  recordDeletedSourceRetention(
    input: unknown,
  ): CommunityDeletedSourceRetentionDecision {
    const decision = communityDeletedSourceRetentionDecisionSchema.parse(input);
    return this.insertExact(
      this.deletedSourceDecisions,
      decision.decisionId,
      decision,
      "COMMUNITY_DELETED_SOURCE_RETENTION_COLLISION",
    );
  }

  recordPrivateIntake(input: unknown): CommunityPrivateIntakeBoundary {
    const boundary = communityPrivateIntakeBoundarySchema.parse(input);
    return this.insertExact(
      this.privateIntakeBoundaries,
      boundary.boundaryId,
      boundary,
      "COMMUNITY_PRIVATE_INTAKE_BOUNDARY_COLLISION",
    );
  }

  private insertExact<T>(
    records: Map<string, T>,
    key: string,
    value: T,
    collisionCode: string,
  ): T {
    const prior = records.get(key);
    if (prior !== undefined) {
      if (stableJson(prior) !== stableJson(value)) throw new Error(collisionCode);
      return structuredClone(prior);
    }
    records.set(key, value);
    return structuredClone(value);
  }
}
