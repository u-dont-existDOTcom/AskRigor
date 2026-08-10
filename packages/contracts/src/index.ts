export const ACCESS_STATUSES = [
  "complete",
  "api_visible_complete",
  "partial",
  "abstract_only",
  "metadata_only",
  "comments_disabled",
  "inaccessible",
  "rate_limited",
  "not_found",
  "error",
] as const;

export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export interface Pagination {
  cursor?: string;
  next_cursor?: string;
  page_size?: number;
  returned: number;
  exhausted?: boolean;
}

export interface SourceIdentity {
  canonical_url?: string;
  title?: string;
  authors_or_channel?: string[];
}

export interface ProviderError {
  code: string;
  message: string;
  http_status?: number;
  retryable?: boolean;
}

export interface ProvenanceEnvelope<T> {
  provider: string;
  record_type: string;
  primary_identifier?: string;
  retrieved_at: string;
  query?: unknown;
  source_identity: SourceIdentity;
  pagination: Pagination;
  access_status: AccessStatus;
  limitations: string[];
  raw_metadata?: unknown;
  error?: ProviderError;
  data: T;
}

interface EnvelopeInput {
  provider: string;
  recordType: string;
  primaryIdentifier?: string;
  retrievedAt?: string;
  query?: unknown;
  sourceIdentity?: SourceIdentity;
  pagination?: Omit<Pagination, "returned">;
  returned?: number;
  accessStatus: AccessStatus;
  limitations?: string[];
  rawMetadata?: unknown;
}

export interface OkEnvelopeInput<T> extends EnvelopeInput {
  data: T;
}

export interface ErrorEnvelopeInput<T> extends EnvelopeInput {
  code: string;
  message: string;
  httpStatus?: number;
  retryable?: boolean;
  data?: T;
}

function baseEnvelope(
  input: EnvelopeInput,
): Omit<ProvenanceEnvelope<unknown>, "data" | "error"> {
  return {
    provider: input.provider,
    record_type: input.recordType,
    ...(input.primaryIdentifier === undefined
      ? {}
      : { primary_identifier: input.primaryIdentifier }),
    retrieved_at: input.retrievedAt ?? new Date().toISOString(),
    ...(input.query === undefined ? {} : { query: input.query }),
    source_identity: input.sourceIdentity ?? {},
    pagination: { ...input.pagination, returned: input.returned ?? 0 },
    access_status: input.accessStatus,
    limitations: input.limitations ?? [],
    ...(input.rawMetadata === undefined ? {} : { raw_metadata: input.rawMetadata }),
  };
}

export function okEnvelope<T>(input: OkEnvelopeInput<T>): ProvenanceEnvelope<T> {
  return { ...baseEnvelope(input), data: input.data };
}

export function errorEnvelope<T = unknown[]>(
  input: ErrorEnvelopeInput<T>,
): ProvenanceEnvelope<T | unknown[]> {
  return {
    ...baseEnvelope(input),
    error: {
      code: input.code,
      message: input.message,
      ...(input.httpStatus === undefined ? {} : { http_status: input.httpStatus }),
      ...(input.retryable === undefined ? {} : { retryable: input.retryable }),
    },
    data: input.data ?? [],
  };
}
