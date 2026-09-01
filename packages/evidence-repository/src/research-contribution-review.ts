import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";
import { z } from "zod";

import type {
  ContributionReceipt,
  FrontierContributionReceipt,
} from "./postgres.js";
import {
  prepareResearchContributionProposal,
  type ContributionPrivacyBoundary,
  type ResearchContributionProposalKind,
  type ResearchContributionProposalRecord,
} from "./research-contributor-access.js";
import type {
  LivingEvidenceContribution,
  ResearchFrontierContribution,
} from "./contracts.js";
import { sha256, stableJson } from "./hash.js";

export const researchContributionReviewDecisionSchema = z.object({
  proposalId: z.string().uuid(),
  expectedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  decision: z.enum(["ACCEPT", "REJECT"]),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export type ResearchContributionReviewDecision = z.infer<
  typeof researchContributionReviewDecisionSchema
>;

export interface ResearchContributionPromotionView {
  promotionId: string;
  status: "PENDING" | "COMPLETED";
  createdAt: string;
  completedAt: string | null;
  receipt: ResearchContributionPromotionReceipt | null;
  receiptSha256: string | null;
}

export interface ResearchContributionReviewView {
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  payloadSha256: string;
  payload: LivingEvidenceContribution | ResearchFrontierContribution;
  privacyBoundary: ContributionPrivacyBoundary;
  partial: boolean;
  status: ResearchContributionProposalRecord["status"];
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  promotion: ResearchContributionPromotionView | null;
}

export interface ResearchContributionReviewStore {
  inspect(proposalId?: string): Promise<ResearchContributionReviewView | null>;
  decide(input: {
    proposalId: string;
    expectedPayloadSha256: string;
    decision: "ACCEPT" | "REJECT";
    reason: string;
    reviewedAt: string;
    promotionId: string | null;
  }): Promise<ResearchContributionReviewView>;
}

export class ResearchContributionReviewError extends Error {
  constructor(
    readonly code:
      | "PROPOSAL_NOT_FOUND"
      | "PAYLOAD_MISMATCH"
      | "REVIEW_CONFLICT"
      | "PROMOTION_INTENT_MISSING",
    message: string,
  ) {
    super(message);
  }
}

export class ResearchContributionReviewService {
  private readonly now: () => string;
  private readonly createUuid: () => string;

  constructor(
    private readonly store: ResearchContributionReviewStore,
    options: { now?: () => string; randomUuid?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createUuid = options.randomUuid ?? randomUUID;
  }

  async inspect(proposalId?: string): Promise<ResearchContributionReviewView | null> {
    return validateReviewView(await this.store.inspect(proposalId));
  }

  async decide(input: unknown): Promise<ResearchContributionReviewView> {
    const parsed = researchContributionReviewDecisionSchema.parse(input);
    const view = await this.store.decide({
      proposalId: parsed.proposalId,
      expectedPayloadSha256: parsed.expectedPayloadSha256,
      decision: parsed.decision,
      reason: parsed.reason,
      reviewedAt: this.now(),
      promotionId: parsed.decision === "ACCEPT" ? this.createUuid() : null,
    });
    return validateReviewView(view)!;
  }
}

export class InMemoryResearchContributionReviewStore
implements ResearchContributionReviewStore {
  private readonly proposals = new Map<
    string,
    ResearchContributionProposalRecord
  >();
  private readonly promotions = new Map<
    string,
    ResearchContributionPromotionView
  >();

  constructor(records: readonly ResearchContributionProposalRecord[] = []) {
    for (const record of records) this.seed(record);
  }

  seed(record: ResearchContributionProposalRecord): void {
    this.proposals.set(record.proposalId, structuredClone(record));
  }

  async inspect(
    proposalId?: string,
  ): Promise<ResearchContributionReviewView | null> {
    const proposal = proposalId === undefined
      ? [...this.proposals.values()]
          .filter(({ status }) => status === "PENDING_REVIEW")
          .sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.proposalId.localeCompare(right.proposalId)
          )[0]
      : this.proposals.get(proposalId);
    return proposal === undefined ? null : reviewView(
      proposal,
      this.promotions.get(proposal.proposalId) ?? null,
    );
  }

  async decide(input: {
    proposalId: string;
    expectedPayloadSha256: string;
    decision: "ACCEPT" | "REJECT";
    reason: string;
    reviewedAt: string;
    promotionId: string | null;
  }): Promise<ResearchContributionReviewView> {
    const proposal = this.proposals.get(input.proposalId);
    if (proposal === undefined) {
      throw new ResearchContributionReviewError(
        "PROPOSAL_NOT_FOUND",
        "The research contribution proposal does not exist.",
      );
    }
    if (proposal.payloadSha256 !== input.expectedPayloadSha256) {
      throw new ResearchContributionReviewError(
        "PAYLOAD_MISMATCH",
        "The proposal payload changed from the owner-reviewed hash.",
      );
    }
    const desiredStatus = input.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    if (proposal.status === "PENDING_REVIEW") {
      const updated = {
        ...proposal,
        status: desiredStatus,
        reviewedAt: input.reviewedAt,
        reviewReason: input.reason,
      } satisfies ResearchContributionProposalRecord;
      this.proposals.set(input.proposalId, updated);
      if (input.decision === "ACCEPT") {
        if (input.promotionId === null) {
          throw new ResearchContributionReviewError(
            "PROMOTION_INTENT_MISSING",
            "Acceptance requires a promotion intent.",
          );
        }
        this.promotions.set(input.proposalId, {
          promotionId: input.promotionId,
          status: "PENDING",
          createdAt: input.reviewedAt,
          completedAt: null,
          receipt: null,
          receiptSha256: null,
        });
      }
    } else if (
      proposal.status !== desiredStatus ||
      proposal.reviewReason !== input.reason
    ) {
      throw new ResearchContributionReviewError(
        "REVIEW_CONFLICT",
        "The proposal already has a different terminal review decision.",
      );
    }
    const result = await this.inspect(input.proposalId);
    if (result === null) throw new Error("REVIEW_RESULT_MISSING");
    if (input.decision === "ACCEPT" && result.promotion === null) {
      throw new ResearchContributionReviewError(
        "PROMOTION_INTENT_MISSING",
        "The accepted proposal has no promotion intent.",
      );
    }
    return result;
  }
}

export interface PostgresResearchContributionReviewStoreOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export class PostgresResearchContributionReviewStore
implements ResearchContributionReviewStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresResearchContributionReviewStoreOptions) {
    this.schema = assertSafeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
  }

  async inspect(
    proposalId?: string,
  ): Promise<ResearchContributionReviewView | null> {
    const result = await this.pool.query<ResearchContributionReviewRow>(
      `SELECT * FROM ${this.schema}.inspect_research_contribution_proposal($1::uuid)`,
      [proposalId ?? null],
    );
    return result.rowCount === 0 ? null : reviewViewFromRow(result.rows[0]!);
  }

  async decide(input: {
    proposalId: string;
    expectedPayloadSha256: string;
    decision: "ACCEPT" | "REJECT";
    reason: string;
    reviewedAt: string;
    promotionId: string | null;
  }): Promise<ResearchContributionReviewView> {
    try {
      const result = await this.pool.query<ResearchContributionReviewRow>(
        `SELECT * FROM ${this.schema}.decide_research_contribution_proposal(
           $1::uuid, $2::text, $3::text, $4::text, $5::timestamptz, $6::uuid
         )`,
        [
          input.proposalId,
          input.expectedPayloadSha256,
          input.decision,
          input.reason,
          input.reviewedAt,
          input.promotionId,
        ],
      );
      if (result.rowCount === 0) throw new Error("REVIEW_RESULT_MISSING");
      return reviewViewFromRow(result.rows[0]!);
    } catch (error) {
      throw mapPostgresReviewError(error);
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface CanonicalResearchContributionWriter {
  contribute(input: unknown): Promise<ContributionReceipt>;
  contributeFrontier(input: unknown): Promise<FrontierContributionReceipt>;
}

export interface ResearchContributionPromotionReceipt {
  receiptSchema: "askrigor.research-contribution-promotion.v1";
  promotionId: string;
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  reviewedPayloadSha256: string;
  writerOperation: "contribute" | "contributeFrontier";
  canonicalWriterReceipt: ContributionReceipt | FrontierContributionReceipt;
  promotedAt: string;
}

export type ResearchContributionPromotionResult =
  | { status: "no_pending_promotion" }
  | {
      status: "promoted";
      receipt: ResearchContributionPromotionReceipt;
      receiptSha256: string;
    };

export class PostgresResearchContributionPromotionRunner {
  readonly schema: string;
  private readonly pool: Pool;
  private readonly now: () => string;

  constructor(
    options: PostgresResearchContributionReviewStoreOptions,
    private readonly writer: CanonicalResearchContributionWriter,
    runtime: { now?: () => string } = {},
  ) {
    this.schema = assertSafeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
    this.now = runtime.now ?? (() => new Date().toISOString());
  }

  async promoteNext(
    failureInjection?: "after_writer",
  ): Promise<ResearchContributionPromotionResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<PromotionCandidateRow>(
        `SELECT promotion.promotion_id, promotion.proposal_id,
                promotion.proposal_kind,
                promotion.reviewed_payload_sha256::text,
                proposal.payload_json
           FROM ${this.schema}.research_contribution_promotions promotion
           JOIN ${this.schema}.research_contribution_proposals proposal
             ON proposal.proposal_id = promotion.proposal_id
            AND proposal.proposal_kind = promotion.proposal_kind
            AND proposal.payload_sha256 = promotion.reviewed_payload_sha256
          WHERE promotion.status = 'PENDING'
          ORDER BY promotion.created_at, promotion.promotion_id
          FOR UPDATE OF promotion SKIP LOCKED
          LIMIT 1`,
      );
      if (selected.rowCount === 0) {
        await client.query("COMMIT");
        return { status: "no_pending_promotion" };
      }
      const row = selected.rows[0]!;
      const prepared = prepareResearchContributionProposal(
        row.proposal_kind,
        row.payload_json,
      );
      if (prepared.payloadSha256 !== row.reviewed_payload_sha256) {
        throw new Error("PROMOTION_REVIEWED_PAYLOAD_SHA256_MISMATCH");
      }
      const writerOperation = row.proposal_kind === "RESEARCH_FRONTIER"
        ? "contributeFrontier"
        : "contribute";
      const canonicalWriterReceipt = writerOperation === "contributeFrontier"
        ? await this.writer.contributeFrontier(prepared.payload)
        : await this.writer.contribute(prepared.payload);
      if (canonicalWriterReceipt.payloadSha256 !== row.reviewed_payload_sha256) {
        throw new Error("PROMOTION_WRITER_PAYLOAD_SHA256_MISMATCH");
      }
      if (failureInjection === "after_writer") {
        throw new Error("INJECTED_FAILURE_AFTER_PROMOTION_WRITER");
      }
      const promotedAt = this.now();
      const receipt: ResearchContributionPromotionReceipt = {
        receiptSchema: "askrigor.research-contribution-promotion.v1",
        promotionId: row.promotion_id,
        proposalId: row.proposal_id,
        proposalKind: row.proposal_kind,
        reviewedPayloadSha256: row.reviewed_payload_sha256,
        writerOperation,
        canonicalWriterReceipt,
        promotedAt,
      };
      const receiptSha256 = sha256(stableJson(receipt));
      const updated = await client.query(
        `UPDATE ${this.schema}.research_contribution_promotions
            SET status = 'COMPLETED', completed_at = $2::timestamptz,
                receipt_json = $3::jsonb, receipt_sha256 = $4
          WHERE promotion_id = $1::uuid AND status = 'PENDING'
            AND reviewed_payload_sha256 = $5
        RETURNING promotion_id`,
        [
          row.promotion_id,
          promotedAt,
          JSON.stringify(receipt),
          receiptSha256,
          row.reviewed_payload_sha256,
        ],
      );
      if (updated.rowCount !== 1) throw new Error("PROMOTION_COMPLETION_CONFLICT");
      await client.query("COMMIT");
      return { status: "promoted", receipt, receiptSha256 };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface ResearchContributionReviewRow {
  proposal_id: string;
  proposal_kind: ResearchContributionProposalKind;
  payload_sha256: string;
  payload_json: unknown;
  privacy_boundary_json: unknown;
  partial: boolean;
  proposal_status: ResearchContributionProposalRecord["status"];
  created_at: Date | string;
  reviewed_at: Date | string | null;
  review_reason: string | null;
  promotion_id: string | null;
  promotion_status: "PENDING" | "COMPLETED" | null;
  promotion_created_at: Date | string | null;
  promotion_completed_at: Date | string | null;
  promotion_receipt_json: unknown;
  promotion_receipt_sha256: string | null;
}

interface PromotionCandidateRow {
  promotion_id: string;
  proposal_id: string;
  proposal_kind: ResearchContributionProposalKind;
  reviewed_payload_sha256: string;
  payload_json: unknown;
}

function reviewView(
  proposal: ResearchContributionProposalRecord,
  promotion: ResearchContributionPromotionView | null,
): ResearchContributionReviewView {
  const { accountKey: _accountKey, ...publicProposal } = proposal;
  return structuredClone({ ...publicProposal, promotion });
}

function reviewViewFromRow(
  row: ResearchContributionReviewRow,
): ResearchContributionReviewView {
  const prepared = prepareResearchContributionProposal(
    row.proposal_kind,
    row.payload_json,
  );
  if (prepared.payloadSha256 !== row.payload_sha256) {
    throw new Error("PROPOSAL_PAYLOAD_SHA256_MISMATCH");
  }
  const promotion = row.promotion_id === null
    ? null
    : {
        promotionId: row.promotion_id,
        status: z.enum(["PENDING", "COMPLETED"]).parse(row.promotion_status),
        createdAt: timestamp(row.promotion_created_at),
        completedAt: nullableTimestamp(row.promotion_completed_at),
        receipt: row.promotion_receipt_json === null
          ? null
          : promotionReceiptSchema.parse(row.promotion_receipt_json),
        receiptSha256: row.promotion_receipt_sha256,
      };
  if (
    promotion?.receipt !== null && promotion !== null &&
    sha256(stableJson(promotion.receipt)) !== promotion.receiptSha256
  ) {
    throw new Error("PROMOTION_RECEIPT_SHA256_MISMATCH");
  }
  return {
    proposalId: row.proposal_id,
    proposalKind: row.proposal_kind,
    payloadSha256: row.payload_sha256,
    payload: prepared.payload,
    privacyBoundary: contributionPrivacyBoundary(row.privacy_boundary_json),
    partial: row.partial,
    status: row.proposal_status,
    createdAt: timestamp(row.created_at),
    reviewedAt: nullableTimestamp(row.reviewed_at),
    reviewReason: row.review_reason,
    promotion,
  };
}

const canonicalWriterReceiptSchema = z.union([
  z.object({
    status: z.enum(["inserted", "idempotent_replay"]),
    analysisId: z.string().uuid(),
    versionId: z.string().uuid(),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    wholeTextSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    wholeTextBytes: z.number().int().positive(),
    sectionCount: z.number().int().nonnegative(),
  }).strict(),
  z.object({
    status: z.enum(["inserted", "idempotent_replay"]),
    frontierId: z.string().uuid(),
    contributionId: z.string().uuid(),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    passCount: z.number().int().nonnegative(),
    candidateVersionCount: z.number().int().nonnegative(),
    trailVersionCount: z.number().int().nonnegative(),
  }).strict(),
]);

const promotionReceiptSchema = z.object({
  receiptSchema: z.literal("askrigor.research-contribution-promotion.v1"),
  promotionId: z.string().uuid(),
  proposalId: z.string().uuid(),
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
  reviewedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  writerOperation: z.enum(["contribute", "contributeFrontier"]),
  canonicalWriterReceipt: canonicalWriterReceiptSchema,
  promotedAt: z.iso.datetime({ offset: true }),
}).strict();

function validateReviewView(
  view: ResearchContributionReviewView | null,
): ResearchContributionReviewView | null {
  if (view === null) return null;
  const prepared = prepareResearchContributionProposal(
    view.proposalKind,
    view.payload,
  );
  if (prepared.payloadSha256 !== view.payloadSha256) {
    throw new Error("PROPOSAL_PAYLOAD_SHA256_MISMATCH");
  }
  return view;
}

function contributionPrivacyBoundary(value: unknown): ContributionPrivacyBoundary {
  const schema = z.object({
    rawChatPersisted: z.literal(false),
    promptPersisted: z.literal(false),
    accountIdentityInPayload: z.literal(false),
    privateHealthNarrativePersisted: z.literal(false),
    uploadContentPersisted: z.literal(false),
    rawSourceContentPersisted: z.literal(false),
    rawProviderResponsePersisted: z.literal(false),
    communityDataPersisted: z.literal(false),
  }).strict();
  return schema.parse(value);
}

function mapPostgresReviewError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const mappings = [
    ["RESEARCH_CONTRIBUTION_PROPOSAL_NOT_FOUND", "PROPOSAL_NOT_FOUND"],
    ["RESEARCH_CONTRIBUTION_REVIEW_PAYLOAD_MISMATCH", "PAYLOAD_MISMATCH"],
    ["RESEARCH_CONTRIBUTION_REVIEW_CONFLICT", "REVIEW_CONFLICT"],
    ["RESEARCH_CONTRIBUTION_PROMOTION_INTENT_MISSING", "PROMOTION_INTENT_MISSING"],
  ] as const;
  const matched = mappings.find(([needle]) => error.message.includes(needle));
  return matched === undefined
    ? error
    : new ResearchContributionReviewError(
        matched[1],
        matched[1] === "PROPOSAL_NOT_FOUND"
          ? "The research contribution proposal does not exist."
          : matched[1] === "PAYLOAD_MISMATCH"
            ? "The proposal payload changed from the owner-reviewed hash."
            : matched[1] === "REVIEW_CONFLICT"
              ? "The proposal already has a different terminal review decision."
              : "The accepted proposal has no promotion intent.",
      );
}

function assertSafeSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("INVALID_POSTGRES_SCHEMA");
  }
  return schema;
}

function timestamp(value: Date | string | null): string {
  if (value === null) throw new Error("TIMESTAMP_REQUIRED");
  return value instanceof Date ? value.toISOString() : value;
}

function nullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}
