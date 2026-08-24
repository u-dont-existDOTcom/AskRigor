import { describe, expect, it } from "vitest";

import {
  adaptEpistemonikosAuthorizedRecord,
  epistemonikosAuthorizedRecordSchema,
} from "../packages/sources/src/index.js";

const DOI = "10.5555/epistemonikos.study";
const RETRIEVED_AT = "2026-08-24T08:31:00.000Z";

describe("disabled Epistemonikos authorized-provider adapter", () => {
  it("preserves exact and bibliographic review ancestry without treating inclusion as approval", () => {
    const result = adaptEpistemonikosAuthorizedRecord(DOI, response([
      ancestry({
        provider_record_id: "relation-1",
        relationship: "review_includes_study",
        review: {
          doi: "HTTPS://DOI.ORG/10.5555/REVIEW.ONE",
          pmid: "12345",
          title: "Review one",
          first_author: "Reviewer",
          year: 2025,
        },
      }),
      ancestry({
        provider_record_id: "relation-2",
        relationship: "review_excludes_study",
        relation_state: "removed",
        classification: { raw_label: "excluded after update", source: "curator" },
        review: {
          doi: null,
          pmid: null,
          title: "Bibliographic review lead",
          first_author: "Curator",
          year: 2024,
        },
      }),
    ]));

    expect(result.error).toBeUndefined();
    expect(result.access_status).toBe("metadata_only");
    expect(result.data.lookup_status).toBe("records_available");
    expect(result.data.review_ancestry).toHaveLength(2);
    expect(result.data.review_ancestry.map((link) => ({
      provider: link.provider,
      relationship: link.relationship,
      relation_state: link.relation_state,
      review_doi: link.review_identity.doi,
      audit_status: link.audit_status,
      classification_basis: link.classification_provenance.basis,
      classification_source: link.classification_provenance.reported_by,
    }))).toEqual([
      {
        provider: "epistemonikos",
        relationship: "review_includes_study",
        relation_state: "current",
        review_doi: "10.5555/review.one",
        audit_status: "not_started",
        classification_basis: "provider_reported",
        classification_source: "provider",
      },
      {
        provider: "epistemonikos",
        relationship: "review_excludes_study",
        relation_state: "removed",
        review_doi: undefined,
        audit_status: "bounded",
        classification_basis: "provider_reported",
        classification_source: "curator",
      },
    ]);
    expect(result.limitations.join(" ")).toContain("not approval");
    expect(JSON.stringify(result)).not.toContain("quality_score");
  });

  it("keeps no-match provider-scoped and incomplete or duplicate pagination partial", () => {
    const noMatch = adaptEpistemonikosAuthorizedRecord(DOI, response([]));
    expect(noMatch).toMatchObject({
      access_status: "metadata_only",
      data: { lookup_status: "no_match_in_provider", review_ancestry: [] },
    });
    expect(noMatch.limitations.join(" ")).toContain("not proof");

    const duplicate = ancestry({ provider_record_id: "duplicate" });
    const partial = adaptEpistemonikosAuthorizedRecord(DOI, response(
      [duplicate, duplicate],
      { exhausted: false, total: 3, nextCursor: "next-review-page" },
    ));
    expect(partial).toMatchObject({
      access_status: "partial",
      pagination: { exhausted: false, next_cursor: "next-review-page" },
      data: { provider_reported_total: 3, rejected_or_duplicate_rows: 1 },
    });
    expect(partial.data.review_ancestry).toHaveLength(1);
  });

  it("preserves every supported provider relationship as metadata", () => {
    const relationships = [
      "review_includes_study",
      "review_excludes_study",
      "review_cites_study",
      "study_updates_review",
    ] as const;
    const result = adaptEpistemonikosAuthorizedRecord(DOI, response(
      relationships.map((relationship, index) => ancestry({
        provider_record_id: `relationship-${index}`,
        relationship,
        review: {
          doi: `10.5555/review.${index}`,
          pmid: null,
          title: `Review ${index}`,
          first_author: "Reviewer",
          year: 2025,
        },
      })),
    ));
    expect(new Set(result.data.review_ancestry.map(({ relationship }) => relationship)))
      .toEqual(new Set(relationships));
    expect(result.data.review_ancestry.every(({ audit_status }) =>
      audit_status === "not_started"
    )).toBe(true);
  });

  it.each([
    ["unexpected fields", { ...response([]), verdict: "approved" }],
    ["missing review identity", response([ancestry({
      review: { doi: null, pmid: null, title: null, first_author: null, year: null },
    })])],
    ["oversized relationship", response([ancestry({ raw_relationship: "x".repeat(4_001) })])],
    ["oversized collection", response(Array.from(
      { length: 2_001 },
      (_, index) => ancestry({ provider_record_id: `relation-${index}` }),
    ))],
  ])("rejects malformed authorized records: %s", (_label, raw) => {
    const result = adaptEpistemonikosAuthorizedRecord(DOI, raw);
    expect(result).toMatchObject({
      access_status: "error",
      error: { code: "epistemonikos_authorized_record_malformed", retryable: false },
      data: { lookup_status: "unknown", review_ancestry: [] },
    });
  });

  it("rejects exact DOI mismatch and caller-like completion/classification injection", () => {
    const mismatch = adaptEpistemonikosAuthorizedRecord(DOI, {
      ...response([]),
      doi: "10.5555/different",
    });
    expect(mismatch.error?.code).toBe("epistemonikos_identifier_mismatch");
    expect(epistemonikosAuthorizedRecordSchema.safeParse({
      ...response([]),
      complete: true,
      evidence_grade: "high",
    }).success).toBe(false);
  });

  it.each([
    ["rate_limited", "epistemonikos_rate_limited", true, 429],
    ["inaccessible", "epistemonikos_authentication_denied", false, 401],
    ["not_found", "epistemonikos_record_not_found", false, 404],
    ["error", "epistemonikos_timeout", true, undefined],
  ] as const)("preserves %s provider failure", (accessStatus, code, retryable, httpStatus) => {
    const result = adaptEpistemonikosAuthorizedRecord(DOI, failure({
      access_status: accessStatus,
      code,
      retryable,
      http_status: httpStatus,
    }));
    expect(result).toMatchObject({
      access_status: accessStatus,
      error: {
        code,
        retryable,
        ...(httpStatus === undefined ? {} : { http_status: httpStatus }),
      },
      data: { lookup_status: "unknown" },
    });
    expect(result.limitations.join(" ")).toContain("no favorable or unfavorable inference");
  });
});

function response(
  rows: ReturnType<typeof ancestry>[],
  options: { exhausted?: boolean; total?: number; nextCursor?: string | null } = {},
) {
  return {
    record_kind: "response" as const,
    contract_version: "askrigor.epistemonikos-authorized-response.v1" as const,
    retrieved_at: RETRIEVED_AT,
    doi: DOI,
    source_document_id: "epi-source-1",
    source_title: "Exact queried study",
    ancestry: rows,
    pagination: {
      returned: rows.length,
      provider_reported_total: options.total ?? rows.length,
      page_size: 100,
      next_cursor: options.nextCursor ?? null,
      exhausted: options.exhausted ?? true,
    },
  };
}

function ancestry(overrides: Partial<{
  provider_record_id: string | null;
  relationship: "review_includes_study" | "review_excludes_study" | "review_cites_study" | "study_updates_review";
  raw_relationship: string | null;
  relation_state: "current" | "removed" | "unknown";
  classification: { raw_label: string | null; source: "provider" | "curator" | "automated" | "unavailable" };
  review: { doi: string | null; pmid: string | null; title: string | null; first_author: string | null; year: number | null };
}> = {}) {
  return {
    provider_record_id: overrides.provider_record_id ?? "relation-default",
    relationship: overrides.relationship ?? "review_cites_study",
    raw_relationship: overrides.raw_relationship ?? "cites",
    relation_state: overrides.relation_state ?? "current",
    classification: overrides.classification ?? { raw_label: "systematic review", source: "provider" },
    review: overrides.review ?? {
      doi: "10.5555/review.default",
      pmid: "98765",
      title: "Default review",
      first_author: "Reviewer",
      year: 2025,
    },
  };
}

function failure(overrides: {
  access_status: "rate_limited" | "inaccessible" | "not_found" | "error";
  code: string;
  retryable: boolean;
  http_status?: number;
}) {
  return {
    record_kind: "failure" as const,
    contract_version: "askrigor.epistemonikos-authorized-failure.v1" as const,
    retrieved_at: RETRIEVED_AT,
    doi: DOI,
    access_status: overrides.access_status,
    code: overrides.code,
    message: "Bounded authorized provider failure",
    retryable: overrides.retryable,
    ...(overrides.http_status === undefined ? {} : { http_status: overrides.http_status }),
  };
}
