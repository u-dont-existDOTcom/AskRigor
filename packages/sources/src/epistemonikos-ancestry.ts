import { createHash } from "node:crypto";

import {
  canonicalStudyIdentitySchema,
  errorEnvelope,
  okEnvelope,
  reviewAncestryLinkSchema,
  type CanonicalStudyIdentity,
  type ProvenanceEnvelope,
  type ReviewAncestryLink,
} from "@askrigor/contracts";
import { z } from "zod";

import { normalizeDoiIdentifier } from "./doi.js";

const EPISTEMONIKOS_RESPONSE_CONTRACT =
  "askrigor.epistemonikos-authorized-response.v1" as const;
const EPISTEMONIKOS_FAILURE_CONTRACT =
  "askrigor.epistemonikos-authorized-failure.v1" as const;
const MAX_LINKS = 2_000;
const MAX_TEXT = 4_000;
const EPISTEMONIKOS_COVERAGE_STATEMENT =
  "This lookup covers only review-ancestry records returned through the authorized Epistemonikos provider contract; absent, removed, unclassified, private, unindexed, or later relations remain outside the result.";
const EPISTEMONIKOS_RELATION_LIMITATION =
  "Epistemonikos review relationships and classifications are provider metadata, not approval of the review, the linked study, its methods, or its conclusions; every decision-relevant review requires exact source and method audit.";

const timestampSchema = z.string().datetime({ offset: true });
const boundedTextSchema = z.string().trim().min(1).max(MAX_TEXT);
const boundedNullableTextSchema = boundedTextSchema.nullable();
const doiInputSchema = z.string().trim().min(1).max(2_048);
const pmidInputSchema = z.string().trim().regex(/^\d{1,12}$/u).nullable();

const classificationSchema = z
  .object({
    raw_label: boundedNullableTextSchema,
    source: z.enum(["provider", "curator", "automated", "unavailable"]),
  })
  .strict();

const reviewIdentityRecordSchema = z
  .object({
    doi: z.string().trim().min(1).max(2_048).nullable(),
    pmid: pmidInputSchema,
    title: boundedNullableTextSchema,
    first_author: z.string().trim().min(1).max(300).nullable(),
    year: z.number().int().min(1600).max(3000).nullable(),
  })
  .strict()
  .refine(
    (value) => value.doi !== null || value.pmid !== null || value.title !== null,
    "Epistemonikos review identity requires an identifier or title",
  );

const ancestryRecordSchema = z
  .object({
    provider_record_id: boundedNullableTextSchema,
    relationship: z.enum([
      "review_includes_study",
      "review_excludes_study",
      "review_cites_study",
      "study_updates_review",
    ]),
    raw_relationship: boundedNullableTextSchema,
    relation_state: z.enum(["current", "removed", "unknown"]),
    classification: classificationSchema,
    review: reviewIdentityRecordSchema,
  })
  .strict();

const paginationSchema = z
  .object({
    returned: z.number().int().nonnegative().max(MAX_LINKS),
    provider_reported_total: z.number().int().nonnegative().nullable(),
    page_size: z.number().int().positive().max(500).nullable(),
    next_cursor: z.string().trim().min(1).max(2_048).nullable(),
    exhausted: z.boolean(),
  })
  .strict();

export const epistemonikosAuthorizedResponseSchema = z
  .object({
    record_kind: z.literal("response"),
    contract_version: z.literal(EPISTEMONIKOS_RESPONSE_CONTRACT),
    retrieved_at: timestampSchema,
    doi: doiInputSchema,
    source_document_id: boundedNullableTextSchema,
    source_title: boundedNullableTextSchema,
    ancestry: z.array(ancestryRecordSchema).max(MAX_LINKS),
    pagination: paginationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pagination.returned !== value.ancestry.length) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "returned"],
        message: "Epistemonikos returned count does not match ancestry rows",
      });
    }
    if (
      value.pagination.provider_reported_total !== null &&
      value.pagination.provider_reported_total < value.ancestry.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "provider_reported_total"],
        message: "Epistemonikos provider total cannot be smaller than returned ancestry rows",
      });
    }
  });

export const epistemonikosAuthorizedFailureSchema = z
  .object({
    record_kind: z.literal("failure"),
    contract_version: z.literal(EPISTEMONIKOS_FAILURE_CONTRACT),
    retrieved_at: timestampSchema,
    doi: doiInputSchema,
    access_status: z.enum(["rate_limited", "inaccessible", "not_found", "error"]),
    code: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
    http_status: z.number().int().min(100).max(599).optional(),
  })
  .strict();

export const epistemonikosAuthorizedRecordSchema = z.discriminatedUnion("record_kind", [
  epistemonikosAuthorizedResponseSchema,
  epistemonikosAuthorizedFailureSchema,
]);

export interface EpistemonikosReviewAncestryLookupData {
  doi: string | null;
  lookup_status: "records_available" | "no_match_in_provider" | "unknown";
  review_ancestry: ReviewAncestryLink[];
  provider_reported_total: number | null;
  rejected_or_duplicate_rows: number;
  coverage_statement: string;
  adapter_contract_version:
    | typeof EPISTEMONIKOS_RESPONSE_CONTRACT
    | typeof EPISTEMONIKOS_FAILURE_CONTRACT;
}

export function adaptEpistemonikosAuthorizedRecord(
  rawIdentifier: string,
  rawRecord: unknown,
): ProvenanceEnvelope<EpistemonikosReviewAncestryLookupData> {
  const doi = normalizeDoiIdentifier(rawIdentifier);
  if (doi === undefined) {
    return epistemonikosErrorEnvelope({
      doi: null,
      retrievedAt: new Date(0).toISOString(),
      contractVersion: EPISTEMONIKOS_FAILURE_CONTRACT,
      accessStatus: "inaccessible",
      code: "epistemonikos_identifier_invalid",
      message: "Epistemonikos lookup requires a canonical DOI",
      retryable: false,
    });
  }
  const parsed = epistemonikosAuthorizedRecordSchema.safeParse(rawRecord);
  if (!parsed.success) {
    return epistemonikosErrorEnvelope({
      doi,
      retrievedAt: new Date(0).toISOString(),
      contractVersion: EPISTEMONIKOS_FAILURE_CONTRACT,
      accessStatus: "error",
      code: "epistemonikos_authorized_record_malformed",
      message: "Authorized Epistemonikos provider record is malformed",
      retryable: false,
    });
  }
  const recordDoi = normalizeDoiIdentifier(parsed.data.doi);
  if (recordDoi !== doi) {
    return epistemonikosErrorEnvelope({
      doi,
      retrievedAt: parsed.data.retrieved_at,
      contractVersion: parsed.data.contract_version,
      accessStatus: "error",
      code: "epistemonikos_identifier_mismatch",
      message: "Authorized Epistemonikos provider record DOI does not match the query",
      retryable: false,
    });
  }
  if (parsed.data.record_kind === "failure") {
    return epistemonikosErrorEnvelope({
      doi,
      retrievedAt: parsed.data.retrieved_at,
      contractVersion: parsed.data.contract_version,
      accessStatus: parsed.data.access_status,
      code: parsed.data.code,
      message: parsed.data.message,
      retryable: parsed.data.retryable,
      httpStatus: parsed.data.http_status,
    });
  }

  const linkedStudy = buildIdentity({
    doi,
    title: parsed.data.source_title,
    basis: "provider_reported_doi",
  });
  const normalized = parsed.data.ancestry.map((record) =>
    normalizeAncestry(record, linkedStudy)
  );
  const unique = [...new Map(
    normalized.map((link) => [link.link_hash, link]),
  ).values()].sort((left, right) => left.link_hash.localeCompare(right.link_hash));
  const duplicates = normalized.length - unique.length;
  const providerTotal = parsed.data.pagination.provider_reported_total;
  const incompleteTotal = providerTotal !== null && providerTotal !== parsed.data.pagination.returned;
  const partial = !parsed.data.pagination.exhausted || incompleteTotal || duplicates > 0;
  const limitations = [
    EPISTEMONIKOS_RELATION_LIMITATION,
    EPISTEMONIKOS_COVERAGE_STATEMENT,
    ...(partial
      ? ["The authorized Epistemonikos record did not prove exhausted, count-reconciled, duplicate-free pagination; coverage is partial until reconciled."]
      : []),
    ...(unique.length === 0
      ? ["The authorized Epistemonikos provider returned no exact DOI review-ancestry rows; this is provider-scoped and is not proof that no relevant review exists elsewhere."]
      : []),
  ];
  return okEnvelope<EpistemonikosReviewAncestryLookupData>({
    provider: "epistemonikos",
    recordType: "review_ancestry",
    primaryIdentifier: doi,
    retrievedAt: parsed.data.retrieved_at,
    sourceIdentity: {
      canonical_url: `https://doi.org/${doi}`,
      ...(parsed.data.source_title === null ? {} : { title: parsed.data.source_title }),
    },
    accessStatus: partial ? "partial" : "metadata_only",
    pagination: {
      exhausted: parsed.data.pagination.exhausted && !incompleteTotal && duplicates === 0,
      ...(parsed.data.pagination.page_size === null
        ? {}
        : { page_size: parsed.data.pagination.page_size }),
      ...(parsed.data.pagination.next_cursor === null
        ? {}
        : { next_cursor: parsed.data.pagination.next_cursor }),
    },
    returned: unique.length,
    limitations,
    rawMetadata: {
      adapter_contract_version: parsed.data.contract_version,
      source_document_id: parsed.data.source_document_id,
      response_sha256: sha256(canonicalJson(parsed.data)),
      provider_reported_total: providerTotal,
      duplicate_rows: duplicates,
    },
    data: {
      doi,
      lookup_status: unique.length === 0 ? "no_match_in_provider" : "records_available",
      review_ancestry: unique,
      provider_reported_total: providerTotal,
      rejected_or_duplicate_rows: duplicates,
      coverage_statement: EPISTEMONIKOS_COVERAGE_STATEMENT,
      adapter_contract_version: parsed.data.contract_version,
    },
  });
}

function normalizeAncestry(
  record: z.output<typeof ancestryRecordSchema>,
  linkedStudy: CanonicalStudyIdentity,
): ReviewAncestryLink {
  const normalizedReviewDoi = record.review.doi === null
    ? undefined
    : normalizeDoiIdentifier(record.review.doi);
  const review = buildIdentity({
    doi: normalizedReviewDoi,
    pmid: record.review.pmid,
    title: record.review.title,
    firstAuthor: record.review.first_author,
    year: record.review.year,
    basis: normalizedReviewDoi === undefined
      ? "bibliographic_metadata"
      : "provider_reported_doi",
  });
  const classificationBasis = record.classification.source === "unavailable"
    ? "unavailable" as const
    : "provider_reported" as const;
  const bounded = record.relation_state === "removed" || review.doi === undefined;
  const core = {
    provider: "epistemonikos" as const,
    provider_record_id: record.provider_record_id,
    review_identity: review,
    linked_study_identity: linkedStudy,
    relationship: record.relationship,
    raw_provider_relationship: record.raw_relationship,
    relation_state: record.relation_state,
    classification_provenance: {
      basis: classificationBasis,
      raw_label: record.classification.raw_label,
      reported_by: record.classification.source,
    },
    audit_status: bounded ? "bounded" as const : "not_started" as const,
    limitations: [
      EPISTEMONIKOS_RELATION_LIMITATION,
      ...(record.relation_state === "removed"
        ? ["The provider reports this ancestry relation as removed; it cannot be used as a current inclusion/citation claim without separate verification."]
        : []),
      ...(normalizedReviewDoi === undefined && record.review.doi !== null
        ? ["The provider-supplied review DOI was not canonicalizable; the review remains a bibliographic lead only."]
        : []),
      ...(review.doi === undefined
        ? ["The linked review has no verified DOI and cannot enter exact-source acquisition until its identity is independently resolved."]
        : []),
      ...(record.classification.raw_label === null
        ? []
        : ["The retained classification is a raw provider label and was not converted into evidence quality or claim capability."]),
    ],
  };
  return reviewAncestryLinkSchema.parse({
    ...core,
    link_hash: sha256(canonicalJson(core)),
  });
}

function buildIdentity(input: {
  doi?: string;
  pmid?: string | null;
  title?: string | null;
  firstAuthor?: string | null;
  year?: number | null;
  basis: "provider_reported_doi" | "bibliographic_metadata";
}): CanonicalStudyIdentity {
  const core = {
    ...(input.doi === undefined ? {} : { doi: input.doi }),
    ...(input.pmid === undefined || input.pmid === null ? {} : { pmid: input.pmid }),
    ...(input.title === undefined || input.title === null ? {} : { title: input.title }),
    ...(input.firstAuthor === undefined || input.firstAuthor === null
      ? {}
      : { first_author: input.firstAuthor }),
    ...(input.year === undefined || input.year === null ? {} : { year: input.year }),
    identity_status: "provider_reported" as const,
    identity_basis: [input.basis] as const,
  };
  return canonicalStudyIdentitySchema.parse({
    ...core,
    identity_hash: sha256(canonicalJson(core)),
  });
}

function epistemonikosErrorEnvelope(input: {
  doi: string | null;
  retrievedAt: string;
  contractVersion:
    | typeof EPISTEMONIKOS_RESPONSE_CONTRACT
    | typeof EPISTEMONIKOS_FAILURE_CONTRACT;
  accessStatus: "rate_limited" | "inaccessible" | "not_found" | "error";
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
}): ProvenanceEnvelope<EpistemonikosReviewAncestryLookupData> {
  return errorEnvelope<EpistemonikosReviewAncestryLookupData>({
    provider: "epistemonikos",
    recordType: "review_ancestry",
    ...(input.doi === null ? {} : { primaryIdentifier: input.doi }),
    retrievedAt: input.retrievedAt,
    accessStatus: input.accessStatus,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    limitations: [
      "Authorized Epistemonikos coverage is unavailable for this lookup; no favorable or unfavorable inference is permitted.",
      EPISTEMONIKOS_RELATION_LIMITATION,
    ],
    rawMetadata: { adapter_contract_version: input.contractVersion },
    data: {
      doi: input.doi,
      lookup_status: "unknown",
      review_ancestry: [],
      provider_reported_total: null,
      rejected_or_duplicate_rows: 0,
      coverage_statement: EPISTEMONIKOS_COVERAGE_STATEMENT,
      adapter_contract_version: input.contractVersion,
    },
  }) as ProvenanceEnvelope<EpistemonikosReviewAncestryLookupData>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
