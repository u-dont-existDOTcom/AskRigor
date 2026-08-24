import { createHash } from "node:crypto";

import {
  canonicalStudyIdentitySchema,
  errorEnvelope,
  externalStudyRelationshipSchema,
  okEnvelope,
  type AccessStatus,
  type CanonicalStudyIdentity,
  type ExternalStudyRelationship,
  type ProviderReportedReplicationOutcome,
  type ProvenanceEnvelope,
} from "@askrigor/contracts";
import { z } from "zod";

import { normalizeDoiIdentifier } from "./doi.js";
import { fetchJson, UpstreamHttpError } from "./http.js";

const FORRT_LOOKUP_URL = "https://rep-api.forrt.org/v1/original-lookup";
const MAX_RELATIONSHIPS_PER_KIND = 2_000;
const FORRT_COVERAGE_STATEMENT =
  "This provider-scoped FORRT FLoRA lookup covers records included in its social and behavioural science replication database; a missing record does not establish that no replication or reproduction exists elsewhere.";
const FORRT_RELATIONSHIP_LIMITATION =
  "FORRT's relationship and outcome labels are provider-reported; implementation match and the linked source have not yet been audited by AskRigor.";
const FORRT_NO_MATCH_LIMITATION =
  "The successful FORRT lookup returned no record for this DOI; this is provider-scoped and does not mean no replication or reproduction exists.";
const FORRT_UNKNOWN_LIMITATION =
  "FORRT replication metadata was unavailable or could not be safely normalized; relationship coverage remains unresolved.";

const authorSchema = z.object({
  given: z.string().nullable().optional(),
  family: z.string().nullable().optional(),
  sequence: z.string().nullable().optional(),
}).passthrough();

const authorsSchema = z.union([
  z.string().trim().min(1).max(4_000),
  z.array(authorSchema).max(500),
]);

const relatedRecordSchema = z.object({
  doi: z.string().nullable().optional(),
  doi_hash: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(4_000).nullable().optional(),
  authors: authorsSchema.nullable().optional(),
  year: z.number().int().min(1600).max(3000).nullable().optional(),
  outcome: z.string().trim().min(1).max(500).nullable().optional(),
}).passthrough();

const resultSchema = z.object({
  doi: z.string(),
  title: z.string().trim().min(1).max(4_000).nullable(),
  authors: authorsSchema.nullable(),
  year: z.number().int().min(1600).max(3000).nullable(),
  record: z.object({
    replications: z.array(z.unknown()).max(MAX_RELATIONSHIPS_PER_KIND),
    originals: z.array(z.unknown()).max(MAX_RELATIONSHIPS_PER_KIND),
    reproductions: z.array(z.unknown()).max(MAX_RELATIONSHIPS_PER_KIND).optional(),
  }).passthrough(),
}).passthrough();

const responseSchema = z.object({
  results: z.record(z.string(), z.unknown()),
}).passthrough();

export interface ForrtReplicationLookupData {
  doi: string | null;
  lookup_status: "records_available" | "no_match_in_provider" | "unknown";
  relationships: ExternalStudyRelationship[];
  rejected_relationship_rows: number;
  coverage_statement: string;
}

export async function lookupForrtReplicationRelationships(
  identifier: string,
): Promise<ProvenanceEnvelope<ForrtReplicationLookupData>> {
  const doi = normalizeDoiIdentifier(identifier);
  if (doi === undefined) return forrtErrorEnvelope("forrt_identifier_invalid");

  try {
    const url = new URL(FORRT_LOOKUP_URL);
    url.searchParams.set("dois", doi);
    const raw = await fetchJson<unknown>(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "askrigor-research/0.1.0",
      },
    });
    const envelope = responseSchema.safeParse(raw);
    if (!envelope.success) throw new ForrtResponseError();
    const resultKeys = Object.keys(envelope.data.results);
    if (resultKeys.length !== 1 || normalizeDoiIdentifier(resultKeys[0]) !== doi) {
      throw new ForrtResponseError();
    }
    const rawResult = envelope.data.results[resultKeys[0]!];
    const responseHash = sha256(JSON.stringify(raw));
    if (rawResult === null) {
      return okEnvelope({
        provider: "forrt",
        recordType: "replication_relationships",
        primaryIdentifier: doi,
        query: { doi },
        accessStatus: "metadata_only",
        limitations: [FORRT_NO_MATCH_LIMITATION],
        rawMetadata: attributionMetadata(responseHash, 0, 0),
        pagination: { exhausted: true },
        returned: 0,
        data: {
          doi,
          lookup_status: "no_match_in_provider",
          relationships: [],
          rejected_relationship_rows: 0,
          coverage_statement: FORRT_COVERAGE_STATEMENT,
        },
      });
    }

    const parsedResult = resultSchema.safeParse(rawResult);
    if (!parsedResult.success || normalizeDoiIdentifier(parsedResult.data.doi) !== doi) {
      throw new ForrtResponseError();
    }
    const queryIdentity = identityFromProviderRecord(parsedResult.data, doi);
    const normalized = normalizeRelationships(parsedResult.data, queryIdentity);
    const partial = normalized.rejectedRows > 0;
    const limitations = partial
      ? [
          `FORRT returned ${normalized.rejectedRows} relationship row${normalized.rejectedRows === 1 ? "" : "s"} that could not be safely normalized; those rows were excluded.`,
          FORRT_RELATIONSHIP_LIMITATION,
        ]
      : normalized.relationships.length > 0
        ? [FORRT_RELATIONSHIP_LIMITATION]
        : [];

    return okEnvelope({
      provider: "forrt",
      recordType: "replication_relationships",
      primaryIdentifier: doi,
      query: { doi },
      sourceIdentity: {
        canonical_url: `https://doi.org/${doi}`,
        ...(queryIdentity.title === undefined ? {} : { title: queryIdentity.title }),
        ...(queryIdentity.first_author === undefined
          ? {}
          : { authors_or_channel: [queryIdentity.first_author] }),
      },
      accessStatus: partial ? "partial" : "metadata_only",
      limitations,
      rawMetadata: attributionMetadata(
        responseHash,
        normalized.reportedRows,
        normalized.duplicateRows,
      ),
      pagination: { exhausted: true },
      returned: 1,
      data: {
        doi,
        lookup_status: "records_available",
        relationships: normalized.relationships,
        rejected_relationship_rows: normalized.rejectedRows,
        coverage_statement: FORRT_COVERAGE_STATEMENT,
      },
    });
  } catch (error) {
    return forrtErrorEnvelope(forrtFailure(error), doi);
  }
}

function normalizeRelationships(
  result: z.infer<typeof resultSchema>,
  queryIdentity: CanonicalStudyIdentity,
): {
  relationships: ExternalStudyRelationship[];
  reportedRows: number;
  rejectedRows: number;
  duplicateRows: number;
} {
  const relationships: ExternalStudyRelationship[] = [];
  let rejectedRows = 0;
  const groups: Array<{
    values: unknown[];
    kind: ExternalStudyRelationship["relationship_kind"];
    direction: ExternalStudyRelationship["relation_direction"];
  }> = [
    { values: result.record.replications, kind: "replication", direction: "original_to_repetition" },
    { values: result.record.reproductions ?? [], kind: "reproduction", direction: "original_to_repetition" },
    { values: result.record.originals, kind: "replication", direction: "repetition_to_original" },
  ];
  const reportedRows = groups.reduce((total, group) => total + group.values.length, 0);

  for (const group of groups) {
    for (const value of group.values) {
      const parsed = relatedRecordSchema.safeParse(value);
      if (!parsed.success) {
        rejectedRows += 1;
        continue;
      }
      const related = identityFromRelatedRecord(parsed.data);
      if (related === null) {
        rejectedRows += 1;
        continue;
      }
      const rawOutcome = parsed.data.outcome ?? null;
      const providerOutcome = normalizeProviderOutcome(rawOutcome);
      const limitations = [FORRT_RELATIONSHIP_LIMITATION];
      if (related.doi === undefined) {
        limitations.push(
          "FORRT did not provide a DOI for the linked record; the bibliographic identity remains provider-reported and unresolved outside this lookup.",
        );
      }
      if (rawOutcome !== null && providerOutcome === "not_reported") {
        limitations.push(
          "FORRT supplied an outcome label outside AskRigor's explicit normalization vocabulary; the raw label was preserved without interpretation.",
        );
      }
      const relationshipCore = {
        relationship_kind: group.kind,
        relation_direction: group.direction,
        original_identity: group.direction === "original_to_repetition" ? queryIdentity : related,
        repetition_identity: group.direction === "original_to_repetition" ? related : queryIdentity,
        provider: "forrt" as const,
        provider_record_id: parsed.data.doi_hash ?? null,
        provider_reported_outcome: providerOutcome,
        raw_provider_outcome: rawOutcome,
        implementation_match_audit_status: "not_started" as const,
        linked_source_audit_status: "not_started" as const,
        limitations,
      };
      relationships.push(externalStudyRelationshipSchema.parse({
        ...relationshipCore,
        relationship_hash: sha256(JSON.stringify(relationshipCore)),
      }));
    }
  }

  const unique = [...new Map(
    relationships.map((relationship) => [relationship.relationship_hash, relationship]),
  ).values()].sort((left, right) => left.relationship_hash.localeCompare(right.relationship_hash));
  return {
    relationships: unique,
    reportedRows,
    rejectedRows,
    duplicateRows: relationships.length - unique.length,
  };
}

function identityFromProviderRecord(
  record: Pick<z.infer<typeof resultSchema>, "title" | "authors" | "year">,
  doi: string,
): CanonicalStudyIdentity {
  return buildIdentity({
    doi,
    title: record.title ?? undefined,
    firstAuthor: firstAuthor(record.authors),
    year: record.year ?? undefined,
    basis: ["provider_reported_doi"],
  });
}

function identityFromRelatedRecord(
  record: z.infer<typeof relatedRecordSchema>,
): CanonicalStudyIdentity | null {
  const doi = record.doi === null || record.doi === undefined
    ? undefined
    : normalizeDoiIdentifier(record.doi);
  if (record.doi !== null && record.doi !== undefined && doi === undefined) return null;
  const title = record.title ?? undefined;
  if (doi === undefined && title === undefined) return null;
  return buildIdentity({
    doi,
    title,
    firstAuthor: firstAuthor(record.authors),
    year: record.year ?? undefined,
    basis: doi === undefined ? ["bibliographic_metadata"] : ["provider_reported_doi"],
  });
}

function buildIdentity(input: {
  doi?: string;
  title?: string;
  firstAuthor?: string;
  year?: number;
  basis: CanonicalStudyIdentity["identity_basis"];
}): CanonicalStudyIdentity {
  const core = {
    ...(input.doi === undefined ? {} : { doi: input.doi }),
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.firstAuthor === undefined ? {} : { first_author: input.firstAuthor }),
    ...(input.year === undefined ? {} : { year: input.year }),
    identity_status: "provider_reported" as const,
    identity_basis: input.basis,
  };
  return canonicalStudyIdentitySchema.parse({
    ...core,
    identity_hash: sha256(JSON.stringify(core)),
  });
}

function firstAuthor(
  authors: z.infer<typeof authorsSchema> | null | undefined,
): string | undefined {
  if (typeof authors === "string") return authors;
  const family = authors?.[0]?.family?.trim();
  return family === undefined || family.length === 0 ? undefined : family;
}

function normalizeProviderOutcome(
  value: string | null,
): ProviderReportedReplicationOutcome {
  if (value === null) return "not_reported";
  const normalized = value.trim().toLowerCase().replace(/[ _-]+/gu, "_");
  if (["successful", "success", "replicated"].includes(normalized)) return "successful";
  if (["failed", "failure", "not_replicated"].includes(normalized)) return "failed";
  if (normalized === "mixed") return "mixed";
  if (["unclear", "inconclusive"].includes(normalized)) return "unclear";
  return "not_reported";
}

function attributionMetadata(
  responseHash: string,
  relationshipRowsReported: number,
  duplicateRows: number,
) {
  return {
    provider_response_sha256: responseHash,
    relationship_rows_reported: relationshipRowsReported,
    duplicate_relationship_rows_deduplicated: duplicateRows,
    attribution: {
      dataset: "FORRT Library of Replication Attempts (FLoRA)",
      dataset_doi: "10.17605/OSF.IO/9R62X",
      license: "CC-BY-4.0",
      provider_url: "https://forrt.org/fred/",
    },
  };
}

type ForrtFailureCode =
  | "forrt_identifier_invalid"
  | "forrt_response_invalid"
  | "forrt_record_not_found"
  | "forrt_rate_limited"
  | "forrt_access_denied"
  | "forrt_upstream_unavailable"
  | "forrt_request_failed";

function forrtFailure(error: unknown): ForrtFailureCode {
  if (
    error instanceof ForrtResponseError ||
    (error instanceof Error && error.message === "Invalid upstream JSON response")
  ) return "forrt_response_invalid";
  if (error instanceof UpstreamHttpError) {
    if (error.status === 404) return "forrt_record_not_found";
    if (error.status === 429) return "forrt_rate_limited";
    if (error.status === 401 || error.status === 403) return "forrt_access_denied";
    if (error.status >= 500) return "forrt_upstream_unavailable";
  }
  return "forrt_request_failed";
}

function forrtFailureDetails(code: ForrtFailureCode): {
  accessStatus: AccessStatus;
  message: string;
  retryable: boolean;
  httpStatus?: number;
} {
  if (code === "forrt_record_not_found") return { accessStatus: "not_found", message: "FORRT endpoint record was not found", retryable: false, httpStatus: 404 };
  if (code === "forrt_rate_limited") return { accessStatus: "rate_limited", message: "FORRT rate limit reached", retryable: true, httpStatus: 429 };
  if (code === "forrt_access_denied") return { accessStatus: "inaccessible", message: "FORRT access denied", retryable: false };
  if (code === "forrt_upstream_unavailable") return { accessStatus: "error", message: "FORRT upstream service unavailable", retryable: true };
  if (code === "forrt_response_invalid") return { accessStatus: "error", message: "FORRT response was invalid", retryable: false };
  if (code === "forrt_identifier_invalid") return { accessStatus: "error", message: "FORRT DOI identifier is invalid", retryable: false };
  return { accessStatus: "error", message: "FORRT request failed", retryable: true };
}

function forrtErrorEnvelope(
  code: ForrtFailureCode,
  doi?: string,
): ProvenanceEnvelope<ForrtReplicationLookupData> {
  const details = forrtFailureDetails(code);
  return errorEnvelope({
    provider: "forrt",
    recordType: "replication_relationships",
    ...(doi === undefined ? {} : { primaryIdentifier: doi, query: { doi } }),
    pagination: { exhausted: false },
    returned: 0,
    accessStatus: details.accessStatus,
    limitations: [FORRT_UNKNOWN_LIMITATION],
    code,
    message: details.message,
    ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    retryable: details.retryable,
    data: {
      doi: doi ?? null,
      lookup_status: "unknown",
      relationships: [],
      rejected_relationship_rows: 0,
      coverage_statement: FORRT_COVERAGE_STATEMENT,
    },
  }) as ProvenanceEnvelope<ForrtReplicationLookupData>;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

class ForrtResponseError extends Error {}
