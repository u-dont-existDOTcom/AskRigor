import { randomUUID } from "node:crypto";

import { Pool, type PoolClient, type PoolConfig } from "pg";
import { z } from "zod";

import type {
  ContributionReceipt,
  FrontierContributionReceipt,
  TopicLinkContributionReceipt,
} from "./postgres.js";
import {
  prepareResearchContributionProposal,
  type ContributionPrivacyBoundary,
  type ResearchContributionProposalKind,
  type ResearchContributionProposalRecord,
} from "./research-contributor-access.js";
import {
  canonicalIdentityRequest,
  preflightContribution,
  proposalKeys,
  RELATED_PROPOSAL_KEY_KINDS,
  RELATED_RECORDS_SHOWN,
  relatedCanonicalRecords,
  type CanonicalIdentityReader,
  type ContributionPreflight,
  type RelatedCanonicalRecord,
  type RelatedProposalKeyKind,
} from "./contribution-identity.js";
import type {
  LivingEvidenceContribution,
  ResearchFrontierContribution,
  TopicLinkContribution,
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

/**
 * Why a promotion ended FAILED (owner answer 138b, 2026-10-20): the canonical writer's deterministic identity and
 * lineage conflicts, the canonical store's own lineage and scope checks, and any other canonical constraint by its
 * class. The list is closed, in step with migration 0012's check, and holds no free text or payload content. Each
 * names a conflict with what the append-only store already holds, so the same payload would fail again on every
 * retry; anything else (a lost connection, a timeout, a serialization failure, an unexpected error) leaves the intent
 * pending for the next activation.
 */
export const RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES = [
  "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
  "FRONTIER_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
  "PROTOCOL_MANIFEST_CONFLICT",
  "RESEARCH_RUN_CONFLICT",
  "TOPIC_ID_CONFLICT",
  "TOPIC_KEY_CONFLICT",
  "QUESTION_ID_CONFLICT",
  "RESEARCH_FRONTIER_ID_CONFLICT",
  "RESEARCH_FRONTIER_QUESTION_CONFLICT",
  "FRONTIER_LANE_ID_CONFLICT",
  "FRONTIER_LANE_KEY_CONFLICT",
  "FRONTIER_CANDIDATE_INITIAL_VERSION_REQUIRED",
  "FRONTIER_CANDIDATE_ALREADY_HAS_INITIAL_VERSION",
  "FRONTIER_CANDIDATE_ID_CONFLICT",
  "FRONTIER_CANDIDATE_IDENTITY_CONFLICT",
  "FRONTIER_TRAIL_INITIAL_VERSION_REQUIRED",
  "FRONTIER_TRAIL_ALREADY_HAS_INITIAL_VERSION",
  "FRONTIER_TRAIL_ID_CONFLICT",
  "SOURCE_FAMILY_ID_CONFLICT",
  "SOURCE_FAMILY_IDENTITY_CONFLICT",
  "SOURCE_IDENTIFIER_CONFLICT",
  "SOURCE_VERSION_ID_CONFLICT",
  "SOURCE_VERSION_IDENTITY_CONFLICT",
  "ANALYSIS_INITIAL_VERSION_REQUIRED",
  "ANALYSIS_ALREADY_HAS_INITIAL_VERSION",
  "ANALYSIS_TARGET_MISMATCH",
  "CLAIM_INITIAL_VERSION_REQUIRED",
  "CLAIM_ALREADY_HAS_INITIAL_VERSION",
  "CLAIM_ID_CONFLICT",
  "FRESHNESS_POLICY_ID_CONFLICT",
  "TOPIC_LINK_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
  "TOPIC_LINK_TOPIC_MISSING",
  "TOPIC_LINK_CONFLICT",
  "TOPIC_ALIAS_CONFLICT",
  "TOPIC_LINK_ID_CONFLICT",
  // The canonical store's triggers (migrations 0001 and 0002), raised as check violations with these exact messages.
  "ANALYSIS_LINEAGE_MISMATCH",
  "CLAIM_DEPENDENCY_CYCLE",
  "EVIDENCE_BINDING_RECEIPT_SOURCE_MISMATCH",
  "FRONTIER_CANDIDATE_LINEAGE_MISMATCH",
  "FRONTIER_CANDIDATE_SCOPE_MISMATCH",
  "FRONTIER_CANDIDATE_SOURCE_IDENTITY_MISMATCH",
  "FRONTIER_DELTA_PRIOR_COVERAGE_INVALID",
  "FRONTIER_DELTA_RELATION_MISMATCH",
  "FRONTIER_GAP_TRAIL_REQUIRED",
  "FRONTIER_LANE_COVERAGE_BASIS_MISMATCH",
  "FRONTIER_PASS_CANDIDATE_COUNT_MISMATCH",
  "FRONTIER_PASS_SCOPE_MISMATCH",
  "FRONTIER_TRAIL_LINEAGE_MISMATCH",
  "FRONTIER_TRAIL_SCOPE_MISMATCH",
  "FUTURE_ANALYSIS_RESOLUTION_LINEAGE_MISMATCH",
  "FUTURE_ANALYSIS_RESOLUTION_WITHOUT_OPEN_ITEM",
  "SOURCE_LINEAGE_CYCLE",
  "TOPIC_HIERARCHY_CYCLE",
  // Any other canonical constraint the write violated, by its class.
  "CANONICAL_UNIQUE_CONFLICT",
  "CANONICAL_REFERENCE_MISSING",
  "CANONICAL_CHECK_VIOLATION",
  "CANONICAL_VALUE_INVALID",
] as const;

export type ResearchContributionPromotionFailureCode =
  typeof RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES[number];

const CANONICAL_TRIGGER_CODES: ReadonlySet<string> = new Set(
  RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES.slice(
    RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES.indexOf("ANALYSIS_LINEAGE_MISMATCH"),
    RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES.indexOf("CANONICAL_UNIQUE_CONFLICT"),
  ),
);
const WRITER_CONFLICT_CODES: ReadonlySet<string> = new Set(
  RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES.slice(
    0,
    RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES.indexOf("ANALYSIS_LINEAGE_MISMATCH"),
  ),
);

/**
 * The failure code for an error the canonical writer raised, or undefined when the error is transient or unexpected
 * and the intent stays pending. An exact check of the error's identity: the writer's own code, or PostgreSQL's
 * SQLSTATE and, for the canonical triggers, their fixed message.
 */
export function promotionFailureCode(
  error: unknown,
): ResearchContributionPromotionFailureCode | undefined {
  if (!(error instanceof Error)) return undefined;
  const sqlState = "code" in error && typeof error.code === "string" && /^[0-9A-Z]{5}$/u.test(error.code)
    ? error.code
    : undefined;
  if (sqlState === undefined) {
    return WRITER_CONFLICT_CODES.has(error.message)
      ? error.message as ResearchContributionPromotionFailureCode
      : undefined;
  }
  if (sqlState === "23514") {
    return CANONICAL_TRIGGER_CODES.has(error.message)
      ? error.message as ResearchContributionPromotionFailureCode
      : "CANONICAL_CHECK_VIOLATION";
  }
  if (sqlState === "23505") return "CANONICAL_UNIQUE_CONFLICT";
  if (sqlState === "23503") return "CANONICAL_REFERENCE_MISSING";
  if (sqlState.startsWith("22")) return "CANONICAL_VALUE_INVALID";
  return undefined;
}

export interface ResearchContributionPromotionView {
  promotionId: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  completedAt: string | null;
  receipt: ResearchContributionPromotionReceipt | null;
  receiptSha256: string | null;
  /** Set exactly when status is FAILED. */
  failureCode: ResearchContributionPromotionFailureCode | null;
  failedAt: string | null;
}

export interface ResearchContributionReviewView {
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  payloadSha256: string;
  payload: LivingEvidenceContribution | ResearchFrontierContribution | TopicLinkContribution;
  privacyBoundary: ContributionPrivacyBoundary;
  partial: boolean;
  status: ResearchContributionProposalRecord["status"];
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
  promotion: ResearchContributionPromotionView | null;
  /**
   * Owner answer 138b: the draft this proposal replaces, and the proposals pending or accepted that replace this one.
   * Proposal IDs only; such a link is always between one account's own proposals.
   */
  supersedesProposalId: string | null;
  supersededByProposalIds: string[];
  /**
   * Owner answer 138b: the other proposals pending review or queued for promotion that share one of this proposal's
   * identities, by proposal ID only (never an account key); and, when the canonical store was read for this review,
   * the canonical records that share them.
   */
  related: {
    proposals: ResearchContributionRelatedProposal[];
    proposalsNotShown: number;
    canonical: { records: RelatedCanonicalRecord[]; notShown: number } | null;
  };
  /**
   * A read-only dry run of the canonical writer's identity checks, for a proposal pending review or queued for
   * promotion when the canonical store was read for this review; unavailable when it could not be read.
   */
  preflight: ContributionPreflight | { status: "unavailable" } | null;
}

export interface ResearchContributionRelatedProposal {
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  status: "PENDING_REVIEW" | "ACCEPTED";
  promotionStatus: "PENDING" | null;
  shared: RelatedProposalKeyKind[];
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

  /**
   * One proposal for the owner's review. With the canonical store's read-only view, a proposal pending review or
   * queued for promotion also gets the canonical records it shares identities with and the promotion preflight.
   */
  async inspect(
    proposalId?: string,
    options: { canonical?: CanonicalIdentityReader } = {},
  ): Promise<ResearchContributionReviewView | null> {
    const view = validateReviewView(await this.store.inspect(proposalId));
    if (
      view === null || options.canonical === undefined ||
      !(view.status === "PENDING_REVIEW" || (view.status === "ACCEPTED" && view.promotion?.status === "PENDING"))
    ) {
      return view;
    }
    const kind = view.proposalKind;
    const state = await options.canonical
      .readCanonicalIdentity(canonicalIdentityRequest(kind, view.payload))
      .catch(() => undefined);
    if (state === undefined) return { ...view, preflight: { status: "unavailable" } };
    return {
      ...view,
      related: { ...view.related, canonical: relatedCanonicalRecords(kind, view.payload, state) },
      preflight: preflightContribution(kind, view.payload, state, view.payloadSha256),
    };
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

  /** Sets an accepted proposal's promotion as the separate runner left it, for tests. */
  seedPromotion(proposalId: string, promotion: ResearchContributionPromotionView): void {
    this.promotions.set(proposalId, structuredClone(promotion));
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
    if (proposal === undefined) return null;
    const ordered = [...this.proposals.values()].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.proposalId.localeCompare(right.proposalId));
    const ownKeys = new Set(proposalKeys(proposal.payload).map(({ kind, value }) => `${kind}\u0000${value}`));
    const related = ordered.flatMap((other): ResearchContributionRelatedProposal[] => {
      const promotion = this.promotions.get(other.proposalId) ?? null;
      const queued = other.status === "ACCEPTED" && promotion?.status === "PENDING";
      if (other.proposalId === proposal.proposalId || (other.status !== "PENDING_REVIEW" && !queued)) return [];
      const shared = [...new Set(proposalKeys(other.payload)
        .filter(({ kind, value }) => ownKeys.has(`${kind}\u0000${value}`))
        .map(({ kind }) => kind))].sort();
      return shared.length === 0 ? [] : [{
        proposalId: other.proposalId,
        proposalKind: other.proposalKind,
        status: other.status as "PENDING_REVIEW" | "ACCEPTED",
        promotionStatus: queued ? "PENDING" : null,
        shared,
      }];
    });
    return reviewView(
      proposal,
      this.promotions.get(proposal.proposalId) ?? null,
      ordered
        .filter((other) =>
          other.supersedesProposalId === proposal.proposalId &&
          (other.status === "PENDING_REVIEW" || other.status === "ACCEPTED"))
        .map(({ proposalId: id }) => id),
      related,
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
          failureCode: null,
          failedAt: null,
        });
        const supersededId = proposal.supersedesProposalId ?? null;
        const superseded = supersededId === null ? undefined : this.proposals.get(supersededId);
        if (
          superseded !== undefined && superseded.status === "PENDING_REVIEW" &&
          superseded.accountKey === proposal.accountKey && superseded.proposalKind === proposal.proposalKind
        ) {
          this.proposals.set(superseded.proposalId, {
            ...superseded,
            status: "REJECTED",
            reviewedAt: input.reviewedAt,
            reviewReason: `superseded by ${proposal.proposalId}`,
          });
        }
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
    // The projection and its context come from one snapshot.
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query<ResearchContributionReviewRow>(
        `SELECT * FROM ${this.schema}.inspect_research_contribution_proposal($1::uuid)`,
        [proposalId ?? null],
      );
      const view = result.rowCount === 0
        ? null
        : reviewViewFromRow(result.rows[0]!, await this.context(client, result.rows[0]!.proposal_id));
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async decide(input: {
    proposalId: string;
    expectedPayloadSha256: string;
    decision: "ACCEPT" | "REJECT";
    reason: string;
    reviewedAt: string;
    promotionId: string | null;
  }): Promise<ResearchContributionReviewView> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ResearchContributionReviewRow>(
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
      const view = reviewViewFromRow(result.rows[0]!, await this.context(client, input.proposalId));
      await client.query("COMMIT");
      return view;
    } catch (error) {
      await client.query("ROLLBACK");
      throw mapPostgresReviewError(error);
    } finally {
      client.release();
    }
  }

  private async context(client: PoolClient, proposalId: string): Promise<ResearchContributionReviewContext> {
    const result = await client.query<{ context: unknown }>(
      `SELECT ${this.schema}.inspect_research_contribution_context($1::uuid) AS context`,
      [proposalId],
    );
    return reviewContextSchema.parse(result.rows[0]?.context ?? {});
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export interface CanonicalResearchContributionWriter {
  contribute(input: unknown): Promise<ContributionReceipt>;
  contributeFrontier(input: unknown): Promise<FrontierContributionReceipt>;
  contributeTopicLink(input: unknown): Promise<TopicLinkContributionReceipt>;
}

type CanonicalWriterReceipt = ContributionReceipt | FrontierContributionReceipt | TopicLinkContributionReceipt;

export interface ResearchContributionPromotionReceipt {
  receiptSchema: "askrigor.research-contribution-promotion.v1";
  promotionId: string;
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  reviewedPayloadSha256: string;
  writerOperation: "contribute" | "contributeFrontier" | "contributeTopicLink";
  canonicalWriterReceipt: CanonicalWriterReceipt;
  promotedAt: string;
}

export interface ResearchContributionPromotionFailure {
  status: "failed";
  promotionId: string;
  proposalId: string;
  proposalKind: ResearchContributionProposalKind;
  failureCode: ResearchContributionPromotionFailureCode;
  failedAt: string;
}

export type ResearchContributionPromotionResult =
  | { status: "no_pending_promotion" }
  | {
      status: "promoted";
      receipt: ResearchContributionPromotionReceipt;
      receiptSha256: string;
    }
  | ResearchContributionPromotionFailure;

/** One activation: at most one promotion, after any intents that ended FAILED on the way to it. */
export interface ResearchContributionPromotionRun {
  result:
    | Exclude<ResearchContributionPromotionResult, ResearchContributionPromotionFailure>
    | { status: "failure_limit_reached" };
  failed: ResearchContributionPromotionFailure[];
}

/** An activation stops after this many FAILED intents, so a long backlog of conflicts drains over a few runs. */
export const PROMOTION_FAILURES_PER_ACTIVATION = 20;

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

  /**
   * Promotes accepted intents, oldest first, until one is promoted or none is pending. An intent whose canonical write
   * conflicts deterministically ends FAILED with its code and the next one is tried, so a conflict no longer blocks
   * the queue; a transient error stops the activation and leaves its intent pending. Bounded by
   * PROMOTION_FAILURES_PER_ACTIVATION.
   */
  async promoteAccepted(options: {
    maximumFailures?: number;
    /** Told of each failure as it is recorded, so it is reported even if a later intent stops the activation. */
    onFailed?: (failure: ResearchContributionPromotionFailure) => void;
  } = {}): Promise<ResearchContributionPromotionRun> {
    const failed: ResearchContributionPromotionFailure[] = [];
    while (failed.length < (options.maximumFailures ?? PROMOTION_FAILURES_PER_ACTIVATION)) {
      const result = await this.promoteNext();
      if (result.status !== "failed") return { result, failed };
      failed.push(result);
      options.onFailed?.(result);
    }
    return { result: { status: "failure_limit_reached" }, failed };
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
        : row.proposal_kind === "TOPIC_LINK" ? "contributeTopicLink" : "contribute";
      let canonicalWriterReceipt: CanonicalWriterReceipt;
      try {
        canonicalWriterReceipt = writerOperation === "contributeFrontier"
          ? await this.writer.contributeFrontier(prepared.payload)
          : writerOperation === "contributeTopicLink"
            ? await this.writer.contributeTopicLink(prepared.payload)
            : await this.writer.contribute(prepared.payload);
      } catch (error) {
        // The writer rolled its own transaction back; this one still holds the intent's lock.
        const failureCode = promotionFailureCode(error);
        if (failureCode === undefined) throw error;
        const failedAt = this.now();
        const marked = await client.query(
          `UPDATE ${this.schema}.research_contribution_promotions
              SET status = 'FAILED', failure_code = $2, failed_at = $3::timestamptz
            WHERE promotion_id = $1::uuid AND status = 'PENDING'
              AND reviewed_payload_sha256 = $4
          RETURNING promotion_id`,
          [row.promotion_id, failureCode, failedAt, row.reviewed_payload_sha256],
        );
        if (marked.rowCount !== 1) throw new Error("PROMOTION_FAILURE_CONFLICT");
        await client.query("COMMIT");
        return {
          status: "failed",
          promotionId: row.promotion_id,
          proposalId: row.proposal_id,
          proposalKind: row.proposal_kind,
          failureCode,
          failedAt,
        };
      }
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
  promotion_status: "PENDING" | "COMPLETED" | "FAILED" | null;
  promotion_created_at: Date | string | null;
  promotion_completed_at: Date | string | null;
  promotion_receipt_json: unknown;
  promotion_receipt_sha256: string | null;
}

/** inspect_research_contribution_context's object (migration 0012). */
const reviewContextSchema = z.object({
  promotion_failure: z.object({
    failure_code: z.enum(RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES),
    failed_at: z.iso.datetime({ offset: true }),
  }).strict().nullable().optional(),
  supersedes_proposal_id: z.string().uuid().nullable().optional(),
  superseded_by_proposal_ids: z.array(z.string().uuid()).optional(),
  related_proposals: z.array(z.object({
    proposal_id: z.string().uuid(),
    proposal_kind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
    status: z.enum(["PENDING_REVIEW", "ACCEPTED"]),
    promotion_status: z.literal("PENDING").nullable(),
    shared: z.array(z.enum(RELATED_PROPOSAL_KEY_KINDS)).min(1),
  }).strict()).max(RELATED_RECORDS_SHOWN).optional(),
  related_proposal_count: z.number().int().nonnegative().optional(),
}).strict();

type ResearchContributionReviewContext = z.infer<typeof reviewContextSchema>;

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
  supersededByProposalIds: string[],
  related: ResearchContributionRelatedProposal[],
): ResearchContributionReviewView {
  const { accountKey: _accountKey, supersedesProposalId, ...publicProposal } = proposal;
  return structuredClone({
    ...publicProposal,
    promotion,
    supersedesProposalId: supersedesProposalId ?? null,
    supersededByProposalIds,
    related: {
      proposals: related.slice(0, RELATED_RECORDS_SHOWN),
      proposalsNotShown: Math.max(0, related.length - RELATED_RECORDS_SHOWN),
      canonical: null,
    },
    preflight: null,
  });
}

function reviewViewFromRow(
  row: ResearchContributionReviewRow,
  context: ResearchContributionReviewContext,
): ResearchContributionReviewView {
  const prepared = prepareResearchContributionProposal(
    row.proposal_kind,
    row.payload_json,
  );
  if (prepared.payloadSha256 !== row.payload_sha256) {
    throw new Error("PROPOSAL_PAYLOAD_SHA256_MISMATCH");
  }
  const failure = context.promotion_failure ?? null;
  const promotion = row.promotion_id === null
    ? null
    : {
        promotionId: row.promotion_id,
        status: z.enum(["PENDING", "COMPLETED", "FAILED"]).parse(row.promotion_status),
        createdAt: timestamp(row.promotion_created_at),
        completedAt: nullableTimestamp(row.promotion_completed_at),
        receipt: row.promotion_receipt_json === null
          ? null
          : promotionReceiptSchema.parse(row.promotion_receipt_json),
        receiptSha256: row.promotion_receipt_sha256,
        failureCode: failure?.failure_code ?? null,
        failedAt: failure === null ? null : new Date(failure.failed_at).toISOString(),
      };
  if (
    promotion?.receipt !== null && promotion !== null &&
    sha256(stableJson(promotion.receipt)) !== promotion.receiptSha256
  ) {
    throw new Error("PROMOTION_RECEIPT_SHA256_MISMATCH");
  }
  if (promotion !== null && (promotion.status === "FAILED") !== (promotion.failureCode !== null)) {
    throw new Error("PROMOTION_FAILURE_STATE_MISMATCH");
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
    supersedesProposalId: context.supersedes_proposal_id ?? null,
    supersededByProposalIds: context.superseded_by_proposal_ids ?? [],
    related: {
      proposals: (context.related_proposals ?? []).map((related) => ({
        proposalId: related.proposal_id,
        proposalKind: related.proposal_kind,
        status: related.status,
        promotionStatus: related.promotion_status,
        shared: related.shared,
      })),
      proposalsNotShown: Math.max(0, (context.related_proposal_count ?? 0) - (context.related_proposals?.length ?? 0)),
      canonical: null,
    },
    preflight: null,
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
  z.object({
    status: z.enum(["inserted", "idempotent_replay"]),
    linkId: z.string().uuid(),
    relation: z.enum(["same", "narrower", "broader", "related"]),
    payloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    aliasesWritten: z.number().int().min(0).max(2),
    edgesWritten: z.number().int().min(0).max(1),
  }).strict(),
]);

const promotionReceiptSchema = z.object({
  receiptSchema: z.literal("askrigor.research-contribution-promotion.v1"),
  promotionId: z.string().uuid(),
  proposalId: z.string().uuid(),
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS", "TOPIC_LINK"]),
  reviewedPayloadSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  writerOperation: z.enum(["contribute", "contributeFrontier", "contributeTopicLink"]),
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
