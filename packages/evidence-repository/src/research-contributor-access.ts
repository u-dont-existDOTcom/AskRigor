import {
  createHmac,
  randomUUID,
} from "node:crypto";

import { Pool, type PoolConfig } from "pg";
import { z } from "zod";

import {
  assertNoProhibitedPersistentKeys,
  type LivingEvidenceContribution,
  type ResearchFrontierContribution,
} from "./contracts.js";
import {
  prepareContribution,
  prepareFrontierContribution,
} from "./prepare.js";

export const RESEARCH_USE_NOTICE_VERSION =
  "free-contributor-v1-2026-09-01" as const;

export const RESEARCH_USE_NOTICE = [
  "Free AskRigor use is reciprocal: eligible deidentified structured research progress from this use may be submitted to AskRigor's shared research repository.",
  "AskRigor excludes raw chat, prompts, identity or contact details, private health narratives, uploads, raw source or provider bodies, and YouTube or community content from this shared proposal path.",
  "Submitted proposals are reviewed and do not become evidence, conclusions, or scientific authority merely because they were submitted or repeated.",
  "Paid private access does not contribute to the shared repository and requires an active verified entitlement.",
].join(" ");

export const researchUseModeSchema = z.enum([
  "FREE_CONTRIBUTOR",
  "PAID_PRIVATE",
]);

export const freeContributorAgreementSchema = z.object({
  noticeVersion: z.literal(RESEARCH_USE_NOTICE_VERSION),
  eligibleDeidentifiedResearchContributionRequired: z.literal(true),
  prohibitedPrivateAndRawContentExcluded: z.literal(true),
  proposalReviewAndNoAuthorityAcknowledged: z.literal(true),
  paidPrivateAlternativeAcknowledged: z.literal(true),
}).strict();

export const contributionPrivacyBoundarySchema = z.object({
  rawChatPersisted: z.literal(false),
  promptPersisted: z.literal(false),
  accountIdentityInPayload: z.literal(false),
  privateHealthNarrativePersisted: z.literal(false),
  uploadContentPersisted: z.literal(false),
  rawSourceContentPersisted: z.literal(false),
  rawProviderResponsePersisted: z.literal(false),
  communityDataPersisted: z.literal(false),
}).strict();

export const researchContributionProposalInputSchema = z.object({
  proposalKind: z.enum(["RESEARCH_FRONTIER", "SOURCE_ANALYSIS"]),
  privacyBoundary: contributionPrivacyBoundarySchema,
  payload: z.unknown(),
}).strict();

export type ResearchUseMode = z.infer<typeof researchUseModeSchema>;
export type FreeContributorAgreement = z.infer<
  typeof freeContributorAgreementSchema
>;
export type ContributionPrivacyBoundary = z.infer<
  typeof contributionPrivacyBoundarySchema
>;
export type ResearchContributionProposalKind =
  | "RESEARCH_FRONTIER"
  | "SOURCE_ANALYSIS";

export interface ResearchUseAccountRecord {
  accountKey: string;
  status: "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  noticeVersion: typeof RESEARCH_USE_NOTICE_VERSION | null;
  agreement: FreeContributorAgreement | null;
  activatedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchPrivateEntitlementRecord {
  entitlementId: string;
  accountKey: string;
  status: "ACTIVE" | "REVOKED";
  source: "OWNER_GRANTED" | "BILLING_PROVIDER";
  externalReferenceSha256: string | null;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ResearchContributionProposalRecord {
  proposalId: string;
  accountKey: string;
  proposalKind: ResearchContributionProposalKind;
  payloadSha256: string;
  payload: LivingEvidenceContribution | ResearchFrontierContribution;
  privacyBoundary: ContributionPrivacyBoundary;
  partial: boolean;
  status: "PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  createdAt: string;
  reviewedAt: string | null;
  reviewReason: string | null;
}

export interface ProposalInsertResult {
  status: "inserted" | "idempotent_replay";
  record: ResearchContributionProposalRecord;
}

export interface ResearchContributorAccessStore {
  getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null>;
  saveAccount(record: ResearchUseAccountRecord): Promise<void>;
  hasActivePrivateEntitlement(accountKey: string, at: string): Promise<boolean>;
  insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult>;
}

export interface ResearchContributorAccessServiceOptions {
  store: ResearchContributorAccessStore;
  identitySecret: Uint8Array;
  now?: () => string;
  randomUuid?: () => string;
}

export interface ResearchAccessView {
  status: "UNENROLLED" | "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  noticeVersion: typeof RESEARCH_USE_NOTICE_VERSION;
  notice: string;
  contributionRequired: boolean;
  privateEntitlementRequired: boolean;
  paidCheckoutAvailable: false;
  activatedAt: string | null;
  updatedAt: string | null;
}

export class ResearchAccessError extends Error {
  constructor(
    readonly code:
      | "RESEARCH_ACCESS_REQUIRED"
      | "RESEARCH_ACCESS_REVOKED"
      | "PAID_PRIVATE_ENTITLEMENT_REQUIRED"
      | "PAID_PRIVATE_DOES_NOT_CONTRIBUTE"
      | "FREE_CONTRIBUTOR_REQUIRED"
      | "CONTRIBUTION_PRIVACY_REJECTED",
    message: string,
  ) {
    super(message);
  }
}

export class ResearchContributorAccessService {
  private readonly store: ResearchContributorAccessStore;
  private readonly identitySecret: Buffer;
  private readonly now: () => string;
  private readonly createUuid: () => string;

  constructor(options: ResearchContributorAccessServiceOptions) {
    if (options.identitySecret.byteLength < 32) {
      throw new Error("RESEARCH_IDENTITY_SECRET_TOO_SHORT");
    }
    this.store = options.store;
    this.identitySecret = Buffer.from(options.identitySecret);
    this.now = options.now ?? (() => new Date().toISOString());
    this.createUuid = options.randomUuid ?? randomUUID;
  }

  accountKeyForSubject(subject: string): string {
    const normalized = normalizeOAuthSubject(subject);
    return createHmac("sha256", this.identitySecret)
      .update("askrigor:research-use-account:v1\0", "utf8")
      .update(normalized, "utf8")
      .digest("hex");
  }

  async inspect(subject: string): Promise<ResearchAccessView> {
    const account = await this.store.getAccount(
      this.accountKeyForSubject(subject),
    );
    if (account === null) {
      return accessView("UNENROLLED", null, null, null);
    }
    return accessView(
      account.status,
      account.mode,
      account.activatedAt,
      account.updatedAt,
    );
  }

  async acceptFreeContributor(
    subject: string,
    agreementInput: unknown,
  ): Promise<ResearchAccessView> {
    const agreement = freeContributorAgreementSchema.parse(agreementInput);
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    await this.store.saveAccount({
      accountKey,
      status: "ACTIVE",
      mode: "FREE_CONTRIBUTOR",
      noticeVersion: RESEARCH_USE_NOTICE_VERSION,
      agreement,
      activatedAt: at,
      revokedAt: null,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
    });
    return accessView("ACTIVE", "FREE_CONTRIBUTOR", at, at);
  }

  async activatePaidPrivate(subject: string): Promise<ResearchAccessView> {
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    if (!await this.store.hasActivePrivateEntitlement(accountKey, at)) {
      throw new ResearchAccessError(
        "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
        "Paid private access is unavailable for this account because no active verified entitlement exists. No price or checkout is offered by this release.",
      );
    }
    await this.store.saveAccount({
      accountKey,
      status: "ACTIVE",
      mode: "PAID_PRIVATE",
      noticeVersion: null,
      agreement: null,
      activatedAt: at,
      revokedAt: null,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
    });
    return accessView("ACTIVE", "PAID_PRIVATE", at, at);
  }

  async revoke(subject: string): Promise<ResearchAccessView> {
    const accountKey = this.accountKeyForSubject(subject);
    const prior = await this.store.getAccount(accountKey);
    const at = this.now();
    await this.store.saveAccount({
      accountKey,
      status: "REVOKED",
      mode: null,
      noticeVersion: null,
      agreement: null,
      activatedAt: null,
      revokedAt: at,
      createdAt: prior?.createdAt ?? at,
      updatedAt: at,
    });
    return accessView("REVOKED", null, null, at);
  }

  async requireActive(subject: string): Promise<ResearchUseMode> {
    const account = await this.store.getAccount(
      this.accountKeyForSubject(subject),
    );
    if (account === null) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REQUIRED",
        "Choose free contributor mode or activate an existing paid private entitlement before using AskRigor research tools.",
      );
    }
    if (account.status !== "ACTIVE" || account.mode === null) {
      throw new ResearchAccessError(
        "RESEARCH_ACCESS_REVOKED",
        "Research access is revoked. Choose an allowed mode again before using AskRigor research tools.",
      );
    }
    if (
      account.mode === "PAID_PRIVATE" &&
      !await this.store.hasActivePrivateEntitlement(account.accountKey, this.now())
    ) {
      throw new ResearchAccessError(
        "PAID_PRIVATE_ENTITLEMENT_REQUIRED",
        "The paid private entitlement is no longer active.",
      );
    }
    return account.mode;
  }

  async submitProposal(
    subject: string,
    input: unknown,
  ): Promise<ProposalInsertResult> {
    const mode = await this.requireActive(subject);
    if (mode === "PAID_PRIVATE") {
      throw new ResearchAccessError(
        "PAID_PRIVATE_DOES_NOT_CONTRIBUTE",
        "Paid private mode does not submit shared research contributions.",
      );
    }
    if (mode !== "FREE_CONTRIBUTOR") {
      throw new ResearchAccessError(
        "FREE_CONTRIBUTOR_REQUIRED",
        "A shared research proposal requires active free contributor mode.",
      );
    }
    const parsed = researchContributionProposalInputSchema.parse(input);
    assertNoProhibitedPersistentKeys(parsed.payload);
    assertNoObviousPrivateContactText(parsed.payload);
    const prepared = prepareProposal(parsed.proposalKind, parsed.payload);
    const at = this.now();
    const record: ResearchContributionProposalRecord = {
      proposalId: this.createUuid(),
      accountKey: this.accountKeyForSubject(subject),
      proposalKind: parsed.proposalKind,
      payloadSha256: prepared.payloadSha256,
      payload: prepared.payload,
      privacyBoundary: parsed.privacyBoundary,
      partial: prepared.partial,
      status: "PENDING_REVIEW",
      createdAt: at,
      reviewedAt: null,
      reviewReason: null,
    };
    return this.store.insertProposal(record);
  }
}

export class InMemoryResearchContributorAccessStore
implements ResearchContributorAccessStore {
  private readonly accounts = new Map<string, ResearchUseAccountRecord>();
  private readonly entitlements = new Map<
    string,
    ResearchPrivateEntitlementRecord
  >();
  private readonly proposals = new Map<
    string,
    ResearchContributionProposalRecord
  >();

  async getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null> {
    const record = this.accounts.get(accountKey);
    return record === undefined ? null : structuredClone(record);
  }

  async saveAccount(record: ResearchUseAccountRecord): Promise<void> {
    this.accounts.set(record.accountKey, structuredClone(record));
  }

  async hasActivePrivateEntitlement(
    accountKey: string,
    at: string,
  ): Promise<boolean> {
    return [...this.entitlements.values()].some((record) =>
      record.accountKey === accountKey &&
      record.status === "ACTIVE" &&
      record.grantedAt <= at &&
      (record.expiresAt === null || record.expiresAt > at)
    );
  }

  async insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult> {
    const replay = [...this.proposals.values()].find((candidate) =>
      candidate.accountKey === record.accountKey &&
      candidate.proposalKind === record.proposalKind &&
      candidate.payloadSha256 === record.payloadSha256
    );
    if (replay !== undefined) {
      return { status: "idempotent_replay", record: structuredClone(replay) };
    }
    this.proposals.set(record.proposalId, structuredClone(record));
    return { status: "inserted", record: structuredClone(record) };
  }

  grantPrivateEntitlement(record: ResearchPrivateEntitlementRecord): void {
    this.entitlements.set(record.entitlementId, structuredClone(record));
  }

  allAccounts(): ResearchUseAccountRecord[] {
    return structuredClone([...this.accounts.values()]);
  }

  allProposals(): ResearchContributionProposalRecord[] {
    return structuredClone([...this.proposals.values()]);
  }
}

export interface PostgresResearchContributorAccessStoreOptions {
  connectionString: string;
  schema?: string;
  ssl?: PoolConfig["ssl"];
  connectionTimeoutMillis?: number;
  queryTimeoutMillis?: number;
  statementTimeoutMillis?: number;
}

export class PostgresResearchContributorAccessStore
implements ResearchContributorAccessStore {
  readonly schema: string;
  private readonly pool: Pool;

  constructor(options: PostgresResearchContributorAccessStoreOptions) {
    this.schema = assertSafeSchema(options.schema ?? "living_evidence");
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl: options.ssl,
      connectionTimeoutMillis: options.connectionTimeoutMillis,
      query_timeout: options.queryTimeoutMillis,
      statement_timeout: options.statementTimeoutMillis,
    });
  }

  async getAccount(accountKey: string): Promise<ResearchUseAccountRecord | null> {
    const result = await this.pool.query<ResearchUseAccountRow>(
      `SELECT account_key, status, mode, notice_version, agreement_json,
              activated_at, revoked_at, created_at, updated_at
         FROM ${this.schema}.research_use_accounts
        WHERE account_key = $1`,
      [accountKey],
    );
    return result.rowCount === 0 ? null : accountFromRow(result.rows[0]!);
  }

  async saveAccount(record: ResearchUseAccountRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.schema}.research_use_accounts
        (account_key, status, mode, notice_version, agreement_json,
         activated_at, revoked_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       ON CONFLICT (account_key) DO UPDATE SET
         status = EXCLUDED.status,
         mode = EXCLUDED.mode,
         notice_version = EXCLUDED.notice_version,
         agreement_json = EXCLUDED.agreement_json,
         activated_at = EXCLUDED.activated_at,
         revoked_at = EXCLUDED.revoked_at,
         updated_at = EXCLUDED.updated_at`,
      [
        record.accountKey,
        record.status,
        record.mode,
        record.noticeVersion,
        JSON.stringify(record.agreement ?? {}),
        record.activatedAt,
        record.revokedAt,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async hasActivePrivateEntitlement(
    accountKey: string,
    at: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
         FROM ${this.schema}.research_private_entitlements
        WHERE account_key = $1
          AND status = 'ACTIVE'
          AND granted_at <= $2
          AND (expires_at IS NULL OR expires_at > $2)
        LIMIT 1`,
      [accountKey, at],
    );
    return result.rowCount !== 0;
  }

  async insertProposal(
    record: ResearchContributionProposalRecord,
  ): Promise<ProposalInsertResult> {
    const result = await this.pool.query<ResearchContributionProposalRow>(
      `INSERT INTO ${this.schema}.research_contribution_proposals
        (proposal_id, account_key, proposal_kind, payload_sha256, payload_json,
         privacy_boundary_json, partial, status, created_at, reviewed_at,
         review_reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NULL, NULL)
       ON CONFLICT (account_key, proposal_kind, payload_sha256) DO NOTHING
       RETURNING proposal_id, account_key, proposal_kind, payload_sha256,
                 payload_json, privacy_boundary_json, partial, status,
                 created_at, reviewed_at, review_reason`,
      [
        record.proposalId,
        record.accountKey,
        record.proposalKind,
        record.payloadSha256,
        JSON.stringify(record.payload),
        JSON.stringify(record.privacyBoundary),
        record.partial,
        record.status,
        record.createdAt,
      ],
    );
    if (result.rowCount !== 0) {
      return { status: "inserted", record: proposalFromRow(result.rows[0]!) };
    }
    const replay = await this.pool.query<ResearchContributionProposalRow>(
      `SELECT proposal_id, account_key, proposal_kind, payload_sha256,
              payload_json, privacy_boundary_json, partial, status,
              created_at, reviewed_at, review_reason
         FROM ${this.schema}.research_contribution_proposals
        WHERE account_key = $1 AND proposal_kind = $2 AND payload_sha256 = $3`,
      [record.accountKey, record.proposalKind, record.payloadSha256],
    );
    if (replay.rowCount === 0) throw new Error("PROPOSAL_REPLAY_LOOKUP_FAILED");
    return {
      status: "idempotent_replay",
      record: proposalFromRow(replay.rows[0]!),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface ResearchUseAccountRow {
  account_key: string;
  status: "ACTIVE" | "REVOKED";
  mode: ResearchUseMode | null;
  notice_version: string | null;
  agreement_json: Record<string, unknown>;
  activated_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ResearchContributionProposalRow {
  proposal_id: string;
  account_key: string;
  proposal_kind: ResearchContributionProposalKind;
  payload_sha256: string;
  payload_json: unknown;
  privacy_boundary_json: unknown;
  partial: boolean;
  status: ResearchContributionProposalRecord["status"];
  created_at: Date | string;
  reviewed_at: Date | string | null;
  review_reason: string | null;
}

function accountFromRow(row: ResearchUseAccountRow): ResearchUseAccountRecord {
  const noticeVersion = row.notice_version === null
    ? null
    : z.literal(RESEARCH_USE_NOTICE_VERSION).parse(row.notice_version);
  const agreement = Object.keys(row.agreement_json).length === 0
    ? null
    : freeContributorAgreementSchema.parse(row.agreement_json);
  return {
    accountKey: row.account_key,
    status: row.status,
    mode: row.mode === null ? null : researchUseModeSchema.parse(row.mode),
    noticeVersion,
    agreement,
    activatedAt: nullableTimestamp(row.activated_at),
    revokedAt: nullableTimestamp(row.revoked_at),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
  };
}

function proposalFromRow(
  row: ResearchContributionProposalRow,
): ResearchContributionProposalRecord {
  const prepared = prepareProposal(row.proposal_kind, row.payload_json);
  if (prepared.payloadSha256 !== row.payload_sha256) {
    throw new Error("PROPOSAL_PAYLOAD_SHA256_MISMATCH");
  }
  return {
    proposalId: row.proposal_id,
    accountKey: row.account_key,
    proposalKind: row.proposal_kind,
    payloadSha256: row.payload_sha256,
    payload: prepared.payload,
    privacyBoundary: contributionPrivacyBoundarySchema.parse(
      row.privacy_boundary_json,
    ),
    partial: row.partial,
    status: row.status,
    createdAt: timestamp(row.created_at),
    reviewedAt: nullableTimestamp(row.reviewed_at),
    reviewReason: row.review_reason,
  };
}

function prepareProposal(
  kind: ResearchContributionProposalKind,
  payload: unknown,
): {
  payload: LivingEvidenceContribution | ResearchFrontierContribution;
  payloadSha256: string;
  partial: boolean;
} {
  if (kind === "RESEARCH_FRONTIER") {
    const prepared = prepareFrontierContribution(payload);
    return {
      payload: prepared.contribution,
      payloadSha256: prepared.payloadSha256,
      partial: prepared.contribution.frontier.passes.some(({ status }) =>
        status !== "complete"
      ),
    };
  }
  const prepared = prepareContribution(payload);
  const contribution = prepared.contribution;
  if (
    contribution.source === null ||
    !["study_method_audit", "review_method_audit"].includes(
      contribution.analysis.analysisKind,
    ) ||
    !["study", "review"].includes(contribution.source.sourceKind)
  ) {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "Shared analysis proposals must be source-bound study or review analyses, not personal or topic-only narratives.",
    );
  }
  if (contribution.source.identifiers.some(({ scheme, value }) =>
    scheme === "url" &&
    /(?:youtube\.com|youtu\.be|reddit\.com|\/forum(?:s)?(?:\/|$))/iu.test(value)
  )) {
    throw new ResearchAccessError(
      "CONTRIBUTION_PRIVACY_REJECTED",
      "YouTube and community sources are outside the shared proposal boundary.",
    );
  }
  return {
    payload: contribution,
    payloadSha256: prepared.payloadSha256,
    partial:
      contribution.analysis.captureStatus === "partial_historical_capture" ||
      contribution.source.accessStatus !== "complete",
  };
}

function assertNoObviousPrivateContactText(value: unknown): void {
  walkStrings(value, [], (text, path) => {
    const identifierValue = path.at(-1) === "value" &&
      /^\d+$/u.test(path.at(-2) ?? "") &&
      path.at(-3) === "identifiers";
    if (identifierValue) return;
    if (
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(text) ||
      /(?:\+\d{1,3}[ .()-]*|\(\d{2,4}\)[ .-]*)\d[\d .()-]{5,}\d/u.test(text) ||
      /\b(?:sk-|ghp_|github_pat_|Bearer\s+)[A-Za-z0-9._-]{12,}\b/u.test(text) ||
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/iu.test(text)
    ) {
      throw new ResearchAccessError(
        "CONTRIBUTION_PRIVACY_REJECTED",
        "The proposal contains an obvious contact, address, or credential pattern.",
      );
    }
  });
}

function walkStrings(
  value: unknown,
  path: string[],
  inspect: (value: string, path: string[]) => void,
): void {
  if (typeof value === "string") {
    inspect(value, path);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => walkStrings(child, [...path, String(index)], inspect));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    walkStrings(child, [...path, key], inspect);
  }
}

function normalizeOAuthSubject(subject: string): string {
  if (
    subject.trim() !== subject ||
    !/^[^\s\u0000-\u001f\u007f]{1,512}$/u.test(subject)
  ) {
    throw new Error("OAUTH_SUBJECT_INVALID");
  }
  return subject;
}

function accessView(
  status: ResearchAccessView["status"],
  mode: ResearchUseMode | null,
  activatedAt: string | null,
  updatedAt: string | null,
): ResearchAccessView {
  return {
    status,
    mode,
    noticeVersion: RESEARCH_USE_NOTICE_VERSION,
    notice: RESEARCH_USE_NOTICE,
    contributionRequired: mode === "FREE_CONTRIBUTOR",
    privateEntitlementRequired: mode === "PAID_PRIVATE" || status === "UNENROLLED",
    paidCheckoutAvailable: false,
    activatedAt,
    updatedAt,
  };
}

function assertSafeSchema(schema: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("INVALID_POSTGRES_SCHEMA");
  }
  return schema;
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableTimestamp(value: Date | string | null): string | null {
  return value === null ? null : timestamp(value);
}
