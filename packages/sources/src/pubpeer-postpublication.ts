import { createHash } from "node:crypto";

import {
  errorEnvelope,
  okEnvelope,
  postPublicationMessageSchema,
  postPublicationThreadSchema,
  type PostPublicationMessage,
  type PostPublicationThread,
  type ProvenanceEnvelope,
} from "@askrigor/contracts";
import { z } from "zod";

import { normalizeDoiIdentifier } from "./doi.js";

const PUBPEER_RESPONSE_CONTRACT = "askrigor.pubpeer-authorized-response.v1" as const;
const PUBPEER_FAILURE_CONTRACT = "askrigor.pubpeer-authorized-failure.v1" as const;
const MAX_MESSAGES = 2_000;
const MAX_TEXT = 4_000;
const MAX_EXCERPT = 1_000;
const MAX_LINKS = 50;
const PUBPEER_COVERAGE_STATEMENT =
  "This lookup covers only the records returned through the authorized PubPeer provider contract; unavailable, removed, moderated, private, unindexed, or later content remains outside the result.";
const PUBPEER_CLAIM_LIMITATION =
  "PubPeer comments and author replies are unaudited post-publication claims, not proof of error, misconduct, study invalidity, or scientific truth; each material message and its cited evidence requires source-linked evaluation.";

const timestampSchema = z.string().datetime({ offset: true });
const boundedTextSchema = z.string().trim().min(1).max(MAX_TEXT);
const boundedNullableTextSchema = boundedTextSchema.nullable();
const canonicalDoiInputSchema = z.string().trim().min(1).max(2_048);
const pubpeerUrlSchema = z.url().max(MAX_TEXT).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && ["pubpeer.com", "www.pubpeer.com"].includes(url.hostname);
}, "PubPeer canonical URL must use an official HTTPS hostname");

const providerClassificationSchema = z
  .object({
    raw_label: boundedNullableTextSchema,
    source: z.enum(["provider", "moderator", "commenter", "unavailable"]),
  })
  .strict();

const authorizedMessageSchema = z
  .object({
    message_id: boundedTextSchema,
    role: z.enum(["comment", "identified_author_reply"]),
    posted_at: timestampSchema.nullable(),
    updated_at: timestampSchema.nullable(),
    provider_revision_id: boundedNullableTextSchema,
    revision_state: z.enum([
      "current_visible",
      "edited_visible",
      "deleted_or_unavailable",
      "unknown",
    ]),
    text: z.string().max(MAX_TEXT).nullable(),
    links: z.array(z.url().max(MAX_TEXT)).max(MAX_LINKS),
    classification: providerClassificationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.revision_state === "deleted_or_unavailable" && value.text !== null) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "deleted or unavailable PubPeer messages cannot carry content",
      });
    }
    if (value.revision_state !== "deleted_or_unavailable" && value.text === null) {
      context.addIssue({
        code: "custom",
        path: ["text"],
        message: "visible PubPeer messages require bounded content",
      });
    }
  });

const authorizedThreadSchema = z
  .object({
    thread_id: boundedTextSchema,
    provider_record_id: boundedNullableTextSchema,
    canonical_url: pubpeerUrlSchema,
    provider_reported_message_count: z.number().int().nonnegative().nullable(),
    messages: z.array(authorizedMessageSchema).max(MAX_MESSAGES),
  })
  .strict()
  .superRefine((value, context) => {
    const identifiers = value.messages.map(({ message_id }) => message_id);
    if (new Set(identifiers).size !== identifiers.length) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "PubPeer message identifiers must be unique",
      });
    }
  });

const paginationSchema = z
  .object({
    returned: z.number().int().nonnegative().max(MAX_MESSAGES),
    provider_reported_total: z.number().int().nonnegative().nullable(),
    page_size: z.number().int().positive().max(MAX_MESSAGES).nullable(),
    next_cursor: z.string().trim().min(1).max(2_048).nullable(),
    exhausted: z.boolean(),
  })
  .strict();

export const pubpeerAuthorizedResponseSchema = z
  .object({
    record_kind: z.literal("response"),
    contract_version: z.literal(PUBPEER_RESPONSE_CONTRACT),
    retrieved_at: timestampSchema,
    doi: canonicalDoiInputSchema,
    thread: authorizedThreadSchema.nullable(),
    pagination: paginationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const messageCount = value.thread?.messages.length ?? 0;
    if (value.pagination.returned !== messageCount) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "returned"],
        message: "PubPeer returned count does not match messages",
      });
    }
    if (value.thread === null && messageCount !== 0) {
      context.addIssue({ code: "custom", path: ["thread"], message: "PubPeer no-match thread is inconsistent" });
    }
    if (
      value.pagination.provider_reported_total !== null &&
      value.pagination.provider_reported_total < messageCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination", "provider_reported_total"],
        message: "PubPeer provider total cannot be smaller than returned messages",
      });
    }
    if (
      value.thread?.provider_reported_message_count !== null &&
      value.thread?.provider_reported_message_count !== undefined &&
      value.thread.provider_reported_message_count < messageCount
    ) {
      context.addIssue({
        code: "custom",
        path: ["thread", "provider_reported_message_count"],
        message: "PubPeer thread count cannot be smaller than returned messages",
      });
    }
  });

export const pubpeerAuthorizedFailureSchema = z
  .object({
    record_kind: z.literal("failure"),
    contract_version: z.literal(PUBPEER_FAILURE_CONTRACT),
    retrieved_at: timestampSchema,
    doi: canonicalDoiInputSchema,
    access_status: z.enum(["rate_limited", "inaccessible", "not_found", "error"]),
    code: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(500),
    retryable: z.boolean(),
    http_status: z.number().int().min(100).max(599).optional(),
  })
  .strict();

export const pubpeerAuthorizedRecordSchema = z.discriminatedUnion("record_kind", [
  pubpeerAuthorizedResponseSchema,
  pubpeerAuthorizedFailureSchema,
]);

export interface PubpeerPostPublicationLookupData {
  doi: string | null;
  lookup_status: "records_available" | "no_match_in_provider" | "unknown";
  threads: PostPublicationThread[];
  provider_reported_total: number | null;
  deleted_or_unavailable_message_count: number;
  coverage_statement: string;
  adapter_contract_version: typeof PUBPEER_RESPONSE_CONTRACT | typeof PUBPEER_FAILURE_CONTRACT;
}

export function adaptPubpeerAuthorizedRecord(
  rawIdentifier: string,
  rawRecord: unknown,
): ProvenanceEnvelope<PubpeerPostPublicationLookupData> {
  const doi = normalizeDoiIdentifier(rawIdentifier);
  if (doi === undefined) {
    return pubpeerErrorEnvelope({
      doi: null,
      retrievedAt: new Date(0).toISOString(),
      contractVersion: PUBPEER_FAILURE_CONTRACT,
      accessStatus: "inaccessible",
      code: "pubpeer_identifier_invalid",
      message: "PubPeer lookup requires a canonical DOI",
      retryable: false,
    });
  }
  const parsed = pubpeerAuthorizedRecordSchema.safeParse(rawRecord);
  if (!parsed.success) {
    return pubpeerErrorEnvelope({
      doi,
      retrievedAt: new Date(0).toISOString(),
      contractVersion: PUBPEER_FAILURE_CONTRACT,
      accessStatus: "error",
      code: "pubpeer_authorized_record_malformed",
      message: "Authorized PubPeer provider record is malformed",
      retryable: false,
    });
  }
  const recordDoi = normalizeDoiIdentifier(parsed.data.doi);
  if (recordDoi !== doi) {
    return pubpeerErrorEnvelope({
      doi,
      retrievedAt: parsed.data.retrieved_at,
      contractVersion: parsed.data.contract_version,
      accessStatus: "error",
      code: "pubpeer_identifier_mismatch",
      message: "Authorized PubPeer provider record DOI does not match the query",
      retryable: false,
    });
  }
  if (parsed.data.record_kind === "failure") {
    return pubpeerErrorEnvelope({
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

  const thread = parsed.data.thread === null
    ? null
    : normalizeThread(parsed.data.thread, parsed.data.pagination);
  const providerTotal = parsed.data.pagination.provider_reported_total;
  const incompleteTotal = providerTotal !== null && providerTotal !== parsed.data.pagination.returned;
  const incompleteThreadCount = parsed.data.thread?.provider_reported_message_count !== null &&
    parsed.data.thread?.provider_reported_message_count !== undefined &&
    parsed.data.thread.provider_reported_message_count !== parsed.data.pagination.returned;
  const partial = !parsed.data.pagination.exhausted || incompleteTotal || incompleteThreadCount;
  const deletedCount = thread?.deleted_or_unavailable_message_count ?? 0;
  const limitations = [
    PUBPEER_CLAIM_LIMITATION,
    PUBPEER_COVERAGE_STATEMENT,
    ...(partial
      ? ["The authorized PubPeer record did not prove exhausted, count-reconciled pagination; coverage is partial and executable continuation remains required when available."]
      : []),
    ...(deletedCount > 0
      ? [`${deletedCount} PubPeer message record${deletedCount === 1 ? " was" : "s were"} deleted or unavailable; absent content was not reconstructed.`]
      : []),
    ...(thread === null
      ? ["The authorized PubPeer provider returned no exact DOI thread; this is provider-scoped and is not proof that no discussion or concern exists elsewhere."]
      : []),
  ];
  return okEnvelope<PubpeerPostPublicationLookupData>({
    provider: "pubpeer",
    recordType: "postpublication_threads",
    primaryIdentifier: doi,
    retrievedAt: parsed.data.retrieved_at,
    sourceIdentity: { canonical_url: `https://doi.org/${doi}` },
    accessStatus: partial ? "partial" : "api_visible_complete",
    pagination: {
      exhausted: parsed.data.pagination.exhausted && !incompleteTotal && !incompleteThreadCount,
      ...(parsed.data.pagination.page_size === null
        ? {}
        : { page_size: parsed.data.pagination.page_size }),
      ...(parsed.data.pagination.next_cursor === null
        ? {}
        : { next_cursor: parsed.data.pagination.next_cursor }),
    },
    returned: parsed.data.pagination.returned,
    limitations,
    rawMetadata: {
      adapter_contract_version: parsed.data.contract_version,
      response_sha256: sha256(canonicalJson(parsed.data)),
      provider_reported_total: providerTotal,
    },
    data: {
      doi,
      lookup_status: thread === null ? "no_match_in_provider" : "records_available",
      threads: thread === null ? [] : [thread],
      provider_reported_total: providerTotal,
      deleted_or_unavailable_message_count: deletedCount,
      coverage_statement: PUBPEER_COVERAGE_STATEMENT,
      adapter_contract_version: parsed.data.contract_version,
    },
  });
}

function normalizeThread(
  thread: z.output<typeof authorizedThreadSchema>,
  pagination: z.output<typeof paginationSchema>,
): PostPublicationThread {
  const messages = thread.messages
    .map(normalizeMessage)
    .sort((left, right) =>
      (left.posted_at ?? "").localeCompare(right.posted_at ?? "") ||
      left.message_id.localeCompare(right.message_id)
    );
  const visible = messages.filter(({ revision_state }) =>
    revision_state !== "deleted_or_unavailable"
  ).length;
  const unavailable = messages.length - visible;
  const incompleteTotal = pagination.provider_reported_total !== null &&
    pagination.provider_reported_total !== pagination.returned;
  const incompleteThreadCount = thread.provider_reported_message_count !== null &&
    thread.provider_reported_message_count !== pagination.returned;
  const core = {
    provider: "pubpeer" as const,
    thread_id: thread.thread_id,
    provider_record_id: thread.provider_record_id,
    canonical_url: thread.canonical_url,
    provider_reported_message_count:
      thread.provider_reported_message_count ?? pagination.provider_reported_total,
    visible_message_count: visible,
    deleted_or_unavailable_message_count: unavailable,
    pagination_complete: pagination.exhausted && !incompleteTotal && !incompleteThreadCount,
    messages,
    limitations: [
      PUBPEER_CLAIM_LIMITATION,
      ...(incompleteTotal || incompleteThreadCount || !pagination.exhausted
        ? ["This thread is an incomplete authorized-provider page and cannot be treated as the complete PubPeer discussion."]
        : []),
    ],
  };
  return postPublicationThreadSchema.parse({
    ...core,
    thread_hash: sha256(canonicalJson(core)),
  });
}

function normalizeMessage(
  message: z.output<typeof authorizedMessageSchema>,
): PostPublicationMessage {
  const classificationBasis = message.classification.source === "unavailable"
    ? "unavailable" as const
    : "provider_reported" as const;
  const contentCore = {
    message_id: message.message_id,
    role: message.role,
    posted_at: message.posted_at,
    updated_at: message.updated_at,
    provider_revision_id: message.provider_revision_id,
    revision_state: message.revision_state,
    text: message.text,
    links: [...new Set(message.links)].sort(),
    provider_classification: message.classification,
  };
  return postPublicationMessageSchema.parse({
    message_id: message.message_id,
    role: message.role,
    posted_at: message.posted_at,
    updated_at: message.updated_at,
    provider_revision_id: message.provider_revision_id,
    revision_state: message.revision_state,
    classification_provenance: {
      basis: classificationBasis,
      raw_label: message.classification.raw_label,
      reported_by: message.classification.source,
    },
    content_hash: sha256(canonicalJson(contentCore)),
    bounded_excerpt: message.text?.slice(0, MAX_EXCERPT) ?? null,
    audit_status: message.revision_state === "deleted_or_unavailable"
      ? "bounded"
      : "not_started",
    materiality: "unknown",
    links: contentCore.links,
    limitations: [
      PUBPEER_CLAIM_LIMITATION,
      ...(message.revision_state === "deleted_or_unavailable"
        ? ["The provider reports this message as deleted or unavailable; its content was not inspected and cannot support a claim."]
        : []),
      ...(message.classification.raw_label === null
        ? []
        : ["The retained classification is a raw provider label and was not converted into AskRigor materiality or truth."]),
    ],
  });
}

function pubpeerErrorEnvelope(input: {
  doi: string | null;
  retrievedAt: string;
  contractVersion: typeof PUBPEER_RESPONSE_CONTRACT | typeof PUBPEER_FAILURE_CONTRACT;
  accessStatus: "rate_limited" | "inaccessible" | "not_found" | "error";
  code: string;
  message: string;
  retryable: boolean;
  httpStatus?: number;
}): ProvenanceEnvelope<PubpeerPostPublicationLookupData> {
  return errorEnvelope<PubpeerPostPublicationLookupData>({
    provider: "pubpeer",
    recordType: "postpublication_threads",
    ...(input.doi === null ? {} : { primaryIdentifier: input.doi }),
    retrievedAt: input.retrievedAt,
    accessStatus: input.accessStatus,
    code: input.code,
    message: input.message,
    retryable: input.retryable,
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    limitations: [
      "Authorized PubPeer coverage is unavailable for this lookup; no favorable or unfavorable inference is permitted.",
      PUBPEER_CLAIM_LIMITATION,
    ],
    rawMetadata: { adapter_contract_version: input.contractVersion },
    data: {
      doi: input.doi,
      lookup_status: "unknown",
      threads: [],
      provider_reported_total: null,
      deleted_or_unavailable_message_count: 0,
      coverage_statement: PUBPEER_COVERAGE_STATEMENT,
      adapter_contract_version: input.contractVersion,
    },
  }) as ProvenanceEnvelope<PubpeerPostPublicationLookupData>;
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
