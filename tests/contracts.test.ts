import { describe, expect, it } from "vitest";
import {
  ACCESS_STATUSES,
  canonicalDoiSchema,
  canonicalStudyIdentitySchema,
  errorEnvelope,
  externalProviderAttemptSchema,
  externalStudyRelationshipSchema,
  okEnvelope,
  publicationIntegrityEventSchema,
  studyExternalEvidenceBundleSchema,
} from "@askrigor/contracts";

describe("workspace bootstrap", () => {
  it("exports normalized access statuses", () => {
    expect(ACCESS_STATUSES).toContain("api_visible_complete");
  });

  it("preserves a complete empty result", () => {
    expect(
      okEnvelope({
        provider: "pubmed",
        recordType: "search",
        data: [],
        returned: 0,
        accessStatus: "complete",
      }).access_status,
    ).toBe("complete");
  });

  it("derives returned from non-empty successful array data", () => {
    expect(
      okEnvelope({
        provider: "pubmed",
        recordType: "search",
        data: [{ pmid: "1" }, { pmid: "2" }],
        accessStatus: "complete",
      }).pagination.returned,
    ).toBe(2);
  });

  it("preserves provider errors for failed empty access", () => {
    expect(
      errorEnvelope({
        provider: "youtube",
        recordType: "comments",
        accessStatus: "comments_disabled",
        code: "commentsDisabled",
        message: "Comments are disabled",
      }).error?.code,
    ).toBe("commentsDisabled");
  });

  it("exports strict provider-scoped external evidence contracts without a global quality shortcut", () => {
    const hash = "a".repeat(64);
    const identity = canonicalStudyIdentitySchema.parse({
      doi: "10.5555/example.study",
      title: "Example study",
      identity_status: "provider_reported",
      identity_basis: ["provider_reported_doi"],
      identity_hash: hash,
    });
    const relationship = externalStudyRelationshipSchema.parse({
      relationship_kind: "replication",
      relation_direction: "original_to_repetition",
      original_identity: identity,
      repetition_identity: { ...identity, doi: "10.5555/example.replication" },
      provider: "forrt",
      provider_record_id: null,
      provider_reported_outcome: "failed",
      raw_provider_outcome: "failed",
      implementation_match_audit_status: "not_started",
      linked_source_audit_status: "not_started",
      limitations: ["Provider-reported only."],
      relationship_hash: hash,
    });
    expect(relationship.provider_reported_outcome).toBe("failed");
    expect(relationship.linked_source_audit_status).toBe("not_started");
    expect(externalStudyRelationshipSchema.safeParse({
      ...relationship,
      quality_score: 99,
    }).success).toBe(false);
    expect(externalProviderAttemptSchema.safeParse({
      provider: "forrt",
      checked_at: "2026-08-24T00:00:00.000Z",
      access_status: "metadata_only",
      provider_outcome: "no_concerns_found",
      query_identifier: "10.5555/example.study",
      coverage_statement: "Provider-scoped lookup.",
      limitations: [],
    }).success).toBe(false);
  });

  it("requires canonical DOI casing and source-preserving integrity assertions", () => {
    expect(canonicalDoiSchema.safeParse("10.5555/UPPER").success).toBe(false);
    expect(publicationIntegrityEventSchema.safeParse({
      sequence: 0,
      event_kind: "retraction",
      event_date: "2025-01-02",
      original_doi: "10.5555/original",
      notice_doi: "10.5555/notice",
      reasons: [],
      assertions: [{
        provider: "crossref",
        assertion_source: "publisher",
        raw_source: "publisher",
        relation_direction: "inbound",
        provider_record_id: null,
        raw_relation_type: "updated-by",
        raw_type: "retraction",
        raw_label: "Retraction",
        asserted_at: "2025-01-02T00:00:00.000Z",
        assertion_hash: "b".repeat(64),
      }],
      event_hash: "c".repeat(64),
    }).success).toBe(true);
  });

  it("keeps the normalized bundle strict and bounded for the later server coordinator", () => {
    const bundle = {
      packet_name: "study_external_evidence_bundle",
      packet_version: "1.0",
      study_identity: {
        doi: "10.5555/bundle.study",
        identity_status: "verified",
        identity_basis: ["crossref_exact_doi"],
        identity_hash: "d".repeat(64),
      },
      provider_attempts: [],
      publication_integrity: {
        record_state: "no_update_marker_found",
        events: [],
        limitations: ["Provider-scoped only."],
      },
      replication_relationships: [],
      postpublication_threads: [],
      citation_contexts: [],
      review_ancestry: [],
      imported_risk_of_bias: [],
      controller_directives: [],
      unresolved_items: [],
      claim_local_limitations: [],
      bundle_hash: "e".repeat(64),
    } as const;
    const parsed = studyExternalEvidenceBundleSchema.safeParse({
      ...bundle,
      complete: true,
    });
    expect(parsed.success).toBe(false);

    const providerAttempt = {
      provider: "forrt" as const,
      checked_at: "2026-08-24T00:00:00.000Z",
      access_status: "metadata_only" as const,
      provider_outcome: "no_match_in_provider" as const,
      query_identifier: "10.5555/bundle.study",
      coverage_statement: "Provider-scoped lookup only.",
      limitations: ["No match is not proof of absence."],
    };
    expect(studyExternalEvidenceBundleSchema.safeParse({
      ...bundle,
      provider_attempts: Array.from({ length: 33 }, () => providerAttempt),
    }).success).toBe(false);
    expect(studyExternalEvidenceBundleSchema.safeParse({
      ...bundle,
      publication_integrity: {
        ...bundle.publication_integrity,
        limitations: Array.from({ length: 201 }, () => "Bounded limitation."),
      },
    }).success).toBe(false);
  });
});
