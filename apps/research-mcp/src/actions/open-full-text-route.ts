import { createHash } from "node:crypto";

import {
  acquireOpenFullText,
  type AcquireOpenFullTextInput,
  type AuditableDocumentBlock,
  type AuditableDocumentIndex,
  type OpenFullTextAcquisitionData,
  type UnpaywallConfig
} from "@askrigor/sources";
import { z } from "zod";

import { RESEARCH_ACTION_RESPONSE_MAX_BYTES } from "../config.js";
import {
  reviewMethodAuditReceiptSchema,
  reviewMethodAuditSubmissionSchema,
  validateReviewMethodAudit
} from "./review-method-audit.js";
import {
  studyMethodAuditExternalReceiptSchema,
  studyMethodAuditExternalSubmissionSchema,
  studyMethodAuditReceiptSchema,
  studyMethodAuditSubmissionSchema,
  validateStudyMethodAudit,
  validateStudyMethodAuditWithExternalEvidence,
  type StudyMethodAuditExternalSubmission
} from "./study-method-audit.js";
import {
  studyExternalEvidenceAuditOutputSchema,
  studyExternalEvidenceProtocolTupleSchema,
  type StudyExternalEvidenceAuditOutput,
  type StudyExternalEvidenceProtocolTuple
} from "./study-external-evidence.js";
import {
  createOpenFullTextHandleStore,
  OpenFullTextHandleError,
  type OpenFullTextHandleState,
  type OpenFullTextHandleStore
} from "./open-full-text-handle-store.js";
import type { ActionRequestContext, ActionResult, ActionRoute } from "./types.js";

const SEGMENT_CHARACTERS = 10_000;
const RESPONSE_TEXT_CHARACTERS = 38_000;
const handleSchema = z.string().regex(/^aft1_[A-Za-z0-9_-]{32}$/u);
const actionDoiSchema = z.string().trim().max(2_048).regex(
  /^(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/[!#$%&'*+\-._;()/:a-z0-9]+$/iu
);
export const acquireOpenFullTextActionInputSchema = z.object({
  doi: actionDoiSchema,
  pmcid: z.string().trim().regex(/^PMC[1-9]\d{0,15}$/iu).optional()
}).strict();
export const continueOpenFullTextActionInputSchema = z.object({
  document_handle: handleSchema
}).strict();
const blockSegmentSchema = z.object({
  block_id: z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u),
  segment_number: z.number().int().positive(),
  segment_count: z.number().int().positive(),
  kind: z.string(),
  section_path: z.array(z.string()),
  page_number: z.number().int().positive().optional(),
  text: z.string().min(1).max(SEGMENT_CHARACTERS),
  source_block_text_sha256: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();
const sourceSchema = z.object({
  provider: z.enum(["europe_pmc", "unpaywall_open_location"]),
  primary_identifier: z.string(),
  canonical_url: z.string().url(),
  pmcid: z.string().optional(),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  title: z.string().optional(),
  version: z.string().optional(),
  format: z.enum(["jats_xml", "pdf_text"]),
  content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  document_completeness: z.literal("full_text_with_body"),
  identity_verification: z.enum(["pmcid_exact", "doi_exact", "title_match"])
}).strict();
const discoveryAttemptSchema = z.object({
  route: z.enum(["europe_pmc", "unpaywall"]),
  result: z.enum(["indexed", "not_found", "inaccessible", "error"]),
  identifier: z.string().optional()
}).strict();
const coverageSchema = z.object({
  document_handle: handleSchema,
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  source_block_count: z.number().int().positive(),
  source_segment_count: z.number().int().positive(),
  source_segments_retrieved_cumulative: z.number().int().nonnegative(),
  exhausted: z.boolean(),
  method_audit_required: z.literal(true),
  synthesis_lock: z.enum(["pass", "fail"])
}).strict();
export const availableOpenFullTextActionOutputSchema = z.object({
  status: z.literal("full_text_available"),
  requested_doi: z.string(),
  requested_pmcid: z.string().optional(),
  discovery_attempts: z.array(discoveryAttemptSchema),
  source: sourceSchema,
  blocks: z.array(blockSegmentSchema).min(1),
  coverage_receipt: coverageSchema
}).strict();
export const openFullTextLeadActionOutputSchema = z.object({
  status: z.literal("possibly_useful_lead"),
  requested_doi: z.string(),
  requested_pmcid: z.string().optional(),
  discovery_attempts: z.array(discoveryAttemptSchema),
  access_boundary: z.string(),
  unseen_content_used_as_evidence: z.literal(false)
}).strict();
export const openFullTextActionOutputSchema = z.union([
  availableOpenFullTextActionOutputSchema,
  openFullTextLeadActionOutputSchema
]);
export const openFullTextMcpOutputSchema = z.object({
  status: z.enum(["full_text_available", "possibly_useful_lead"]),
  requested_doi: z.string(),
  requested_pmcid: z.string().optional(),
  discovery_attempts: z.array(discoveryAttemptSchema),
  source: sourceSchema.optional(),
  blocks: z.array(blockSegmentSchema).optional(),
  coverage_receipt: coverageSchema.optional(),
  access_boundary: z.string().optional(),
  unseen_content_used_as_evidence: z.literal(false).optional()
}).strict();
const auditCoverageSchema = z.object({
  document_handle: handleSchema,
  full_text_read_to_exhaustion: z.literal(true),
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  audit_validated: z.literal(true),
  synthesis_use: z.literal("bounded_by_validated_claim_capabilities")
}).strict();
export const noticeMethodAuditSubmissionSchema = z.object({
  source_primary_identifier: z.string().trim().min(1).max(2_048),
  source_content_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  notice_type: z.enum([
    "retraction",
    "withdrawal",
    "expression_of_concern",
    "correction",
    "update",
    "reinstatement",
    "other"
  ]),
  affected_source_identity: z.string().trim().min(1).max(2_048),
  plain_language_finding: z.string().trim().min(1).max(2_000),
  evidence_block_ids: z.array(z.string().regex(/^(?:jats|pdf)_[0-9]{6}_[a-f0-9]{12}$/u)).min(1).max(100),
  possible_decision_impact: z.enum([
    "detail_only",
    "confidence_changing",
    "ranking_changing",
    "potentially_conclusion_changing",
    "unknown"
  ]),
  unresolved_fields: z.array(z.string().trim().min(1).max(500)).max(30)
}).strict();
export const noticeMethodAuditReceiptSchema = noticeMethodAuditSubmissionSchema.extend({
  receipt_name: z.literal("askrigor_publication_notice_audit"),
  receipt_version: z.literal("1.0"),
  source_block_count: z.number().int().positive(),
  cited_source_block_count: z.number().int().positive(),
  audit_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  source_linkage_validated: z.literal(true),
  semantic_truth_not_certified: z.literal(true)
}).strict();
export const noticeMethodAuditOutputSchema = z.object({
  status: z.literal("source_linked_publication_notice_audit_validated"),
  audit_receipt: noticeMethodAuditReceiptSchema,
  coverage_receipt: auditCoverageSchema
}).strict();
export const studyMethodExternalAuditOutputSchema = z.object({
  status: z.literal("source_and_external_linked_study_audit_validated"),
  audit_receipt: studyMethodAuditExternalReceiptSchema,
  coverage_receipt: auditCoverageSchema
}).strict();
export const studyMethodAuditActionInputSchema = z.object({
  document_handle: handleSchema,
  audit: studyMethodAuditSubmissionSchema
}).strict();
export const reviewMethodAuditActionInputSchema = z.object({
  document_handle: handleSchema,
  audit: reviewMethodAuditSubmissionSchema
}).strict();
export const studyMethodAuditActionOutputSchema = z.object({
  status: z.literal("source_linked_study_audit_validated"),
  audit_receipt: studyMethodAuditReceiptSchema,
  coverage_receipt: auditCoverageSchema
}).strict();
export const reviewMethodAuditActionOutputSchema = z.object({
  status: z.literal("source_linked_review_audit_validated"),
  audit_receipt: reviewMethodAuditReceiptSchema,
  coverage_receipt: auditCoverageSchema
}).strict();
export const openFullTextActionErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "action_input_invalid",
      "open_full_text_handle_invalid_or_expired",
      "open_full_text_not_fully_read"
    ]),
    retryable: z.literal(false)
  }).strict()
}).strict();

export interface CreateOpenFullTextActionRoutesOptions {
  store?: OpenFullTextHandleStore;
  acquire?: (
    input: AcquireOpenFullTextInput,
    config: UnpaywallConfig | undefined
  ) => ReturnType<typeof acquireOpenFullText>;
  unpaywallConfig?: UnpaywallConfig;
}

export interface OpenFullTextExecutor {
  acquire(
    input: z.output<typeof acquireOpenFullTextActionInputSchema>
  ): Promise<z.output<typeof openFullTextActionOutputSchema>>;
  continue(
    input: z.output<typeof continueOpenFullTextActionInputSchema>
  ): Promise<z.output<typeof availableOpenFullTextActionOutputSchema>>;
  validateStudyAudit(
    input: z.output<typeof studyMethodAuditActionInputSchema>
  ): Promise<z.output<typeof studyMethodAuditActionOutputSchema>>;
  validateReviewAudit(
    input: z.output<typeof reviewMethodAuditActionInputSchema>
  ): Promise<z.output<typeof reviewMethodAuditActionOutputSchema>>;
  validateNoticeAudit(input: {
    document_handle: string;
    audit: z.input<typeof noticeMethodAuditSubmissionSchema>;
  }): Promise<z.output<typeof noticeMethodAuditOutputSchema>>;
  validateExternalStudyAudit(input: {
    document_handle: string;
    audit: StudyMethodAuditExternalSubmission;
    external_audit: StudyExternalEvidenceAuditOutput;
    expected: {
      session_id: string;
      protocol_identities: StudyExternalEvidenceProtocolTuple;
    };
    receipt_secret: string;
  }): Promise<z.output<typeof studyMethodExternalAuditOutputSchema>>;
}

const DEFAULT_OPEN_FULL_TEXT_HANDLE_STORE = createOpenFullTextHandleStore();

/**
 * Transport-independent implementation shared by the installed Action routes
 * and the server-owned research-session controller. Keeping one executor
 * prevents the controller from inventing a second pagination or audit path.
 */
export function createOpenFullTextExecutor(
  options: CreateOpenFullTextActionRoutesOptions = {}
): OpenFullTextExecutor {
  const store = options.store ?? DEFAULT_OPEN_FULL_TEXT_HANDLE_STORE;
  const acquire = options.acquire ?? acquireOpenFullText;
  const unpaywallConfig = options.unpaywallConfig ?? defaultUnpaywallConfig();

  const executor: OpenFullTextExecutor = {
    async acquire(input) {
      const parsed = acquireOpenFullTextActionInputSchema.parse(input);
      const result = await acquire(parsed, unpaywallConfig);
      const data = result.data as OpenFullTextAcquisitionData;
      if (result.access_status !== "complete" || data.document_index === undefined) {
        return openFullTextLeadActionOutputSchema.parse({
          status: "possibly_useful_lead",
          requested_doi: data.requested_doi,
          ...(data.requested_pmcid === undefined
            ? {}
            : { requested_pmcid: data.requested_pmcid }),
          discovery_attempts: data.discovery_attempts,
          access_boundary: data.access_boundary ??
            "No complete identity-verified open full text was available.",
          unseen_content_used_as_evidence: false
        });
      }
      const page = pageFrom(data.document_index, initialCursor());
      const handle = store.issue(data.document_index, page.cursor);
      return availableOutput(data, data.document_index, handle, page);
    },
    async continue({ document_handle: handle }) {
      const parsedHandle = continueOpenFullTextActionInputSchema.parse({
        document_handle: handle
      }).document_handle;
      const state = store.claim(parsedHandle);
      try {
        if (state.cursor.exhausted) {
          store.rollback(parsedHandle);
          throw new OpenFullTextAlreadyExhaustedError();
        }
        const page = pageFrom(state.index, state.cursor);
        store.replace(parsedHandle, { index: state.index, cursor: page.cursor });
        return availableOutput({
          requested_doi: state.index.source.doi ?? state.index.source.primary_identifier,
          ...(state.index.source.pmcid === undefined
            ? {}
            : { requested_pmcid: state.index.source.pmcid }),
          discovery_attempts: []
        }, state.index, parsedHandle, page);
      } catch (error) {
        store.rollback(parsedHandle);
        throw error;
      }
    },
    async validateStudyAudit({ document_handle: handle, audit }) {
      const parsed = studyMethodAuditActionInputSchema.parse({
        document_handle: handle,
        audit
      });
      const state = store.read(parsed.document_handle);
      if (!state.cursor.exhausted) throw new OpenFullTextNotReadError();
      const receipt = validateStudyMethodAudit(state.index, parsed.audit);
      return studyMethodAuditActionOutputSchema.parse({
        status: "source_linked_study_audit_validated",
        audit_receipt: receipt,
        coverage_receipt: auditCoverage(parsed.document_handle, state.index)
      });
    },
    async validateReviewAudit({ document_handle: handle, audit }) {
      const parsed = reviewMethodAuditActionInputSchema.parse({
        document_handle: handle,
        audit
      });
      const state = store.read(parsed.document_handle);
      if (!state.cursor.exhausted) throw new OpenFullTextNotReadError();
      const receipt = validateReviewMethodAudit(state.index, parsed.audit);
      return reviewMethodAuditActionOutputSchema.parse({
        status: "source_linked_review_audit_validated",
        audit_receipt: receipt,
        coverage_receipt: auditCoverage(parsed.document_handle, state.index)
      });
    },
    async validateNoticeAudit({ document_handle: documentHandle, audit }) {
      const parsedHandle = handleSchema.parse(documentHandle);
      const submission = noticeMethodAuditSubmissionSchema.parse(audit);
      const state = store.read(parsedHandle);
      if (!state.cursor.exhausted) throw new OpenFullTextNotReadError();
      if (
        submission.source_primary_identifier !== state.index.source.primary_identifier ||
        submission.source_content_sha256 !== state.index.source.content_sha256
      ) {
        throw new Error("Publication notice audit source identity or completeness mismatch");
      }
      const knownBlocks = new Set(state.index.blocks.map(({ block_id }) => block_id));
      if (submission.evidence_block_ids.some((block) => !knownBlocks.has(block))) {
        throw new Error("Publication notice audit cited an unknown source block");
      }
      return noticeMethodAuditOutputSchema.parse({
        status: "source_linked_publication_notice_audit_validated",
        audit_receipt: {
          ...submission,
          receipt_name: "askrigor_publication_notice_audit",
          receipt_version: "1.0",
          source_block_count: state.index.blocks.length,
          cited_source_block_count: new Set(submission.evidence_block_ids).size,
          audit_sha256: createAuditHash(submission),
          source_linkage_validated: true,
          semantic_truth_not_certified: true
        },
        coverage_receipt: auditCoverage(parsedHandle, state.index)
      });
    },
    async validateExternalStudyAudit(input) {
      const parsedHandle = handleSchema.parse(input.document_handle);
      const submission = studyMethodAuditExternalSubmissionSchema.parse(input.audit);
      const externalAudit = studyExternalEvidenceAuditOutputSchema.parse(input.external_audit);
      const protocols = studyExternalEvidenceProtocolTupleSchema.parse(
        input.expected.protocol_identities
      );
      const state = store.read(parsedHandle);
      if (!state.cursor.exhausted) throw new OpenFullTextNotReadError();
      const receipt = validateStudyMethodAuditWithExternalEvidence(
        state.index,
        submission,
        externalAudit,
        {
          sessionId: input.expected.session_id,
          protocolIdentities: protocols
        },
        input.receipt_secret
      );
      return studyMethodExternalAuditOutputSchema.parse({
        status: "source_and_external_linked_study_audit_validated",
        audit_receipt: receipt,
        coverage_receipt: auditCoverage(parsedHandle, state.index)
      });
    }
  };
  return Object.freeze(executor);
}

export function createOpenFullTextActionRoutes(
  options: CreateOpenFullTextActionRoutesOptions = {}
): readonly ActionRoute[] {
  const executor = createOpenFullTextExecutor(options);
  return Object.freeze([
    acquireRoute(),
    continueRoute(),
    studyAuditRoute(),
    reviewAuditRoute()
  ]);

  function acquireRoute(): ActionRoute {
    return route({
      operationId: "acquire_open_full_text",
      description: "Automatically try Europe PMC and then Unpaywall for a lawful complete study text. Identity-check and index the exact version, or return a plain access boundary without treating unseen contents as evidence.",
      inputSchema: acquireOpenFullTextActionInputSchema,
      outputSchema: openFullTextActionOutputSchema,
      async handle(input) {
        return executor.acquire(input);
      }
    });
  }

  function continueRoute(): ActionRoute {
    return route({
      operationId: "continue_open_full_text",
      description: "Continue the exact open full-text document from its server-owned cursor. Calls cannot skip or mix document blocks.",
      inputSchema: continueOpenFullTextActionInputSchema,
      outputSchema: availableOpenFullTextActionOutputSchema,
      async handle(input) {
        return executor.continue(input);
      }
    });
  }

  function studyAuditRoute(): ActionRoute {
    return route({
      operationId: "validate_study_method_audit",
      description: "Validate a source-linked study-method audit only after the exact full text was read to exhaustion. Randomization or publication labels are not reliability verdicts.",
      inputSchema: studyMethodAuditActionInputSchema,
      outputSchema: studyMethodAuditActionOutputSchema,
      async handle(input) {
        return executor.validateStudyAudit(input);
      }
    });
  }

  function reviewAuditRoute(): ActionRoute {
    return route({
      operationId: "validate_review_method_audit",
      description: "Validate a source-linked systematic-review, meta-analysis, or guideline-method audit only after the exact full text was read to exhaustion. Review labels and pooled estimates are not authority verdicts.",
      inputSchema: reviewMethodAuditActionInputSchema,
      outputSchema: reviewMethodAuditActionOutputSchema,
      async handle(input) {
        return executor.validateReviewAudit(input);
      }
    });
  }
}

interface Page {
  blocks: z.output<typeof blockSegmentSchema>[];
  cursor: OpenFullTextHandleState["cursor"];
  totalSegments: number;
}

function pageFrom(
  index: AuditableDocumentIndex,
  start: OpenFullTextHandleState["cursor"]
): Page {
  const blocks: z.output<typeof blockSegmentSchema>[] = [];
  let usedCharacters = 0;
  let blockIndex = start.block_index;
  let characterOffset = start.character_offset;
  let retrieved = start.segments_retrieved;
  while (blockIndex < index.blocks.length) {
    const block = index.blocks[blockIndex]!;
    const remaining = block.text.length - characterOffset;
    if (remaining <= 0) {
      blockIndex += 1;
      characterOffset = 0;
      continue;
    }
    const length = Math.min(SEGMENT_CHARACTERS, remaining);
    if (blocks.length > 0 && usedCharacters + length > RESPONSE_TEXT_CHARACTERS) break;
    const text = block.text.slice(characterOffset, characterOffset + length);
    const segmentNumber = Math.floor(characterOffset / SEGMENT_CHARACTERS) + 1;
    const segmentCount = Math.ceil(block.text.length / SEGMENT_CHARACTERS);
    blocks.push({
      block_id: block.block_id,
      segment_number: segmentNumber,
      segment_count: segmentCount,
      kind: block.kind,
      section_path: block.section_path,
      ...(block.page_number === undefined ? {} : { page_number: block.page_number }),
      text,
      source_block_text_sha256: block.text_sha256
    });
    usedCharacters += length;
    retrieved += 1;
    characterOffset += length;
    if (characterOffset >= block.text.length) {
      blockIndex += 1;
      characterOffset = 0;
    }
  }
  return {
    blocks,
    cursor: {
      block_index: blockIndex,
      character_offset: characterOffset,
      segments_retrieved: retrieved,
      exhausted: blockIndex >= index.blocks.length
    },
    totalSegments: countSegments(index)
  };
}

function availableOutput(
  data: Pick<OpenFullTextAcquisitionData, "requested_doi" | "requested_pmcid" | "discovery_attempts">,
  index: AuditableDocumentIndex,
  handle: string,
  page: Page
): z.output<typeof availableOpenFullTextActionOutputSchema> {
  if (page.blocks.length === 0) throw new Error("Open full-text page was empty");
  return availableOpenFullTextActionOutputSchema.parse({
    status: "full_text_available",
    requested_doi: data.requested_doi,
    ...(data.requested_pmcid === undefined ? {} : { requested_pmcid: data.requested_pmcid }),
    discovery_attempts: data.discovery_attempts,
    source: index.source,
    blocks: page.blocks,
    coverage_receipt: {
      document_handle: handle,
      source_content_sha256: index.source.content_sha256,
      source_block_count: index.blocks.length,
      source_segment_count: page.totalSegments,
      source_segments_retrieved_cumulative: page.cursor.segments_retrieved,
      exhausted: page.cursor.exhausted,
      method_audit_required: true,
      synthesis_lock: page.cursor.exhausted ? "pass" : "fail"
    }
  });
}

function initialCursor(): OpenFullTextHandleState["cursor"] {
  return {
    block_index: 0,
    character_offset: 0,
    segments_retrieved: 0,
    exhausted: false
  };
}

function countSegments(index: AuditableDocumentIndex): number {
  return index.blocks.reduce((total, block) =>
    total + Math.ceil(block.text.length / SEGMENT_CHARACTERS), 0);
}

function auditCoverage(handle: string, index: AuditableDocumentIndex) {
  return {
    document_handle: handle,
    full_text_read_to_exhaustion: true as const,
    source_content_sha256: index.source.content_sha256,
    audit_validated: true as const,
    synthesis_use: "bounded_by_validated_claim_capabilities" as const
  };
}

interface RouteDefinition<I extends z.ZodType, O extends z.ZodType> {
  operationId: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  handle(input: z.output<I>): Promise<z.output<O>>;
}

function route<I extends z.ZodType, O extends z.ZodType>(
  definition: RouteDefinition<I, O>
): ActionRoute {
  return Object.freeze({
    method: "POST",
    path: `/actions/research/${definition.operationId}`,
    operationId: definition.operationId,
    summary: `AskRigor ${definition.operationId.replaceAll("_", " ")}`,
    description: definition.description,
    consequential: false,
    public: true,
    publicResearch: true,
    maximumRequestBytes: 65_536,
    maximumResponseBytes: RESEARCH_ACTION_RESPONSE_MAX_BYTES,
    requestSchema: actionJsonSchema(definition.inputSchema),
    responseSchemas: {
      200: actionJsonSchema(definition.outputSchema),
      422: actionJsonSchema(openFullTextActionErrorSchema)
    },
    async handle({ body }: ActionRequestContext): Promise<ActionResult> {
      const input = definition.inputSchema.safeParse(body);
      if (!input.success) return actionError("action_input_invalid");
      try {
        return {
          status: 200,
          body: definition.outputSchema.parse(await definition.handle(input.data))
        };
      } catch (error) {
        if (error instanceof OpenFullTextHandleError || error instanceof OpenFullTextAlreadyExhaustedError) {
          return actionError("open_full_text_handle_invalid_or_expired");
        }
        if (error instanceof OpenFullTextNotReadError) {
          return actionError("open_full_text_not_fully_read");
        }
        throw error;
      }
    }
  });
}

function actionJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "throw" }) as
    Record<string, unknown>;
}

function actionError(
  code: z.output<typeof openFullTextActionErrorSchema>["error"]["code"]
): ActionResult {
  return { status: 422, body: { error: { code, retryable: false } } };
}

function defaultUnpaywallConfig(): UnpaywallConfig {
  return {
    email: process.env.ASKRIGOR_UNPAYWALL_EMAIL?.trim() || "support@askrigor.com"
  };
}

function createAuditHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

class OpenFullTextNotReadError extends Error {}
class OpenFullTextAlreadyExhaustedError extends Error {}
